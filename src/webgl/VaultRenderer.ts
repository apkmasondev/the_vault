import * as THREE from 'three';
import { RAMPS } from '../app/constants';
import { clamp, smoothstep } from '../utils/math';
import { PostChain } from './PostChain';
import { degradeQuality, selectInitialQuality, type QualityProfile, type QualityTier } from './quality';

const coreVertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uPulse;
  uniform float uCharge;
  uniform float uShock;
  uniform vec3 uAudio;
  uniform vec3 uStretch;
  uniform vec3 uSplitAxis;
  uniform float uSplit;
  uniform float uDamage;
  uniform float uShatter;
  attribute vec3 aCentroid;
  attribute vec3 aAxis;
  attribute vec2 aTumble;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  varying float vNoise;
  varying float vDetail;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float noise3(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
      f.z
    );
  }

  float fbm(vec3 p) {
    float value = 0.0;
    value += noise3(p) * 0.55;
    value += noise3(p * 2.03 + 7.1) * 0.28;
    value += noise3(p * 4.01 + 13.4) * 0.17;
    return value;
  }

  void main() {
    // Charging speeds the churn as well as swelling the surface.
    float churn = uTime * (1.0 + uCharge * 1.6);
    vec3 drift = vec3(churn * 0.055, -churn * 0.035, churn * 0.025);
    // Low frequency shapes the silhouette; high frequency carries the veins,
    // so the body can stay round while the cracks stay fine.
    float n = fbm(position * 1.85 + drift);
    float detail = fbm(position * 5.4 + drift * 0.55);
    float radius = length(position);
    float pulseWave = uPulse * sin(radius * 12.0 - uTime * 8.0) * 0.06;
    float shockWave = uShock * sin(radius * 22.0 - uTime * 19.0) * 0.11;
    float breath = uAudio.x * 0.07 + uAudio.y * 0.025;
    float swell = uCharge * (0.025 + n * 0.045);
    float relief = (n - 0.5) * 0.085 + (detail - 0.5) * 0.022;
    vec3 displaced = position + normal * (relief + pulseWave + shockWave + breath + swell);

    // Hauling the object through the air draws it out along the direction of
    // travel and pinches it across, the way a heavy drop of liquid behaves.
    vec3 pull = vec3(uStretch.xy, 0.0);
    float alignment = dot(normalize(position), pull);
    displaced += pull * alignment * uStretch.z;
    displaced -= normalize(position) * (1.0 - abs(alignment)) * uStretch.z * 0.35;

    // Thrown hard enough, it comes apart: the two halves separate along the
    // throw, and the seam pulls back as the break heals.
    float side = dot(normalize(position), uSplitAxis) >= 0.0 ? 1.0 : -1.0;
    displaced += uSplitAxis * side * uSplit;

    // Damage loosens the surface before it gives way entirely.
    displaced += normal * uDamage * (detail - 0.5) * 0.09;

    if (uShatter > 0.0) {
      // Every triangle becomes its own shard: flung out along its own bearing,
      // tumbling about its own axis, falling as it goes.
      vec3 local = displaced - aCentroid;
      float spin = uShatter * aTumble.x * 9.0;
      float c = cos(spin);
      float s = sin(spin);
      vec3 tumbled = local * c + cross(aAxis, local) * s + aAxis * dot(aAxis, local) * (1.0 - c);
      vec3 launched = aCentroid + normalize(aCentroid) * aTumble.y * uShatter * 2.6;
      launched.y -= 1.5 * uShatter * uShatter;
      displaced = launched + tumbled;
    }

    vec4 world = modelMatrix * vec4(displaced, 1.0);
    vWorldPosition = world.xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    vNoise = n;
    vDetail = detail;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const coreFragmentShader = /* glsl */ `
  uniform float uReveal;
  uniform float uPulse;
  uniform float uFailure;
  uniform float uCharge;
  uniform float uHeat;
  uniform float uDamage;
  uniform float uShatter;
  uniform vec3 uAudio;
  uniform vec3 uPointer;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  varying float vNoise;
  varying float vDetail;

  void main() {
    vec3 normal = normalize(vNormal);
    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    float facingView = max(dot(normal, viewDirection), 0.0);
    float fresnel = pow(1.0 - facingView, 2.6);

    // Veins, not patches: light escapes only along the narrow band where the
    // high-frequency field crosses its threshold, widening under charge.
    float width = 0.016 + uCharge * 0.022 + uDamage * 0.026;
    float crack = abs(vDetail - 0.5);
    float vein = 1.0 - smoothstep(0.0, width, crack);
    float ember = 1.0 - smoothstep(0.0, width * 6.0, crack);

    // Damage opens a second, coarser network on top of the fine one: the deep
    // structural breaks, as opposed to the surface veining.
    float faultWidth = 0.012 + uDamage * 0.05;
    float fault = (1.0 - smoothstep(0.0, faultWidth, abs(vNoise - 0.47)))
      * smoothstep(0.02, 0.35, uDamage);
    vein = max(vein, fault);

    // Stone that has cooled unevenly, so the body is never a flat silhouette.
    float relief = smoothstep(0.35, 0.72, vNoise);
    float occlusion = mix(0.55, 1.0, relief);

    float facing = max(dot(normal, normalize(uPointer)), 0.0);
    vec3 obsidian = vec3(0.026, 0.022, 0.019);
    vec3 oldGold = vec3(0.62, 0.40, 0.18);
    // Struck repeatedly, the cracks run from gold up towards forge red, and a
    // failing object never fully cools between blows.
    float glowing = max(uHeat, uDamage * 0.75);
    vec3 heat = mix(vec3(0.96, 0.74, 0.42), vec3(1.0, 0.34, 0.13), glowing * 0.85);

    // A dark body first, then a rim, then the light coming out of the cracks.
    vec3 color = obsidian * occlusion;
    color += oldGold * fresnel * 0.46;
    // A hard glint keeps it reading as polished stone rather than matte clay.
    color += vec3(1.0, 0.88, 0.66) * pow(facingView, 22.0) * 0.09;
    color += heat * ember * (0.05 + uCharge * 0.1 + glowing * 0.5) * occlusion;
    color += heat * vein * (0.55 + uPulse * 0.6 + uCharge * 0.85 + glowing * 1.15);
    // The side under the pointer runs hotter, so the object tracks your hand.
    color += heat * facing * vein * uCharge * 0.35;
    color += heat * (uFailure * fresnel * 0.14 + uAudio.z * fresnel * 0.2 + glowing * fresnel * 0.3);

    // Shards cool and dim as they scatter, so the shatter has an end.
    float dying = 1.0 - smoothstep(0.35, 1.0, uShatter);
    color *= mix(1.0, 0.35, smoothstep(0.0, 0.7, uShatter));
    float alpha = uReveal * (0.9 + fresnel * 0.1) * dying;
    gl_FragColor = vec4(color, alpha);
  }
`;

const particleVertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uReveal;
  uniform float uPulse;
  uniform float uCharge;
  uniform float uPixelScale;
  uniform vec3 uAudio;
  varying float vAlpha;
  void main() {
    vec3 p = position;
    p.y += sin(uTime * 0.15 + p.x * 1.7) * 0.09;
    float distanceFromCore = max(length(p.xy), 0.3);
    // Charge and impacts push the field outward from the core.
    p.xy *= 1.0 + (uPulse * 0.16 + uCharge * 0.1 + uAudio.x * 0.06) / distanceFromCore;
    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    // Sized against the drawing buffer so these stay fine embers at every
    // resolution rather than becoming lens blobs on a small viewport.
    gl_PointSize = (0.9 + fract(p.x * 17.13) * 1.5) * (17.0 / -mvPosition.z) * uPixelScale;
    vAlpha = (0.1 + fract(p.z * 23.17) * 0.4) * (0.16 + uReveal * 0.84) * (1.0 + uAudio.y * 0.5);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const particleFragmentShader = /* glsl */ `
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float alpha = smoothstep(0.5, 0.05, d) * vAlpha;
    gl_FragColor = vec4(0.78, 0.65, 0.47, alpha);
  }
`;

/**
 * Large defocused motes drifting in the opened chamber. Deliberately few, very
 * faint and very soft — the atmosphere comes from their movement, not from
 * their presence, and anything heavier reads as dirt on the lens.
 */
const moteVertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uOpen;
  uniform float uPixelScale;
  varying float vAlpha;

  void main() {
    vec3 p = position;
    float seed = fract(p.x * 13.71 + p.y * 7.33 + 0.37);
    // Convection: they rise slowly and sway, wrapping around the chamber.
    p.y = mod(p.y + uTime * (0.018 + seed * 0.042) + 2.2, 4.4) - 2.2;
    p.x += sin(uTime * (0.05 + seed * 0.07) + seed * 26.0) * 0.34;
    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = (26.0 + seed * 54.0) * (13.0 / -mvPosition.z) * uPixelScale;
    // Fading in at the edges of their travel keeps them from popping.
    float edge = 1.0 - smoothstep(1.5, 2.2, abs(p.y));
    vAlpha = uOpen * edge * (0.075 + seed * 0.105);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const moteFragmentShader = /* glsl */ `
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    // A soft body with a slightly firmer edge, the way defocused light behaves.
    float body = pow(1.0 - d, 1.7);
    float rim = smoothstep(0.92, 0.66, d) * 0.3;
    gl_FragColor = vec4(vec3(0.88, 0.76, 0.57), (body * 0.6 + rim) * vAlpha);
  }
`;

/**
 * Shards knocked loose when the object strikes a wall. One burst per pool: the
 * whole pool shares an origin and a launch time, and each point derives its own
 * direction from seeds baked into its attribute, so firing a burst costs a
 * handful of uniform writes rather than a buffer rewrite.
 */
const debrisVertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uBurstTime;
  uniform float uStrength;
  uniform float uPixelScale;
  uniform vec3 uOrigin;
  uniform vec3 uNormal;
  varying float vAlpha;
  varying float vHeat;

  void main() {
    float age = uTime - uBurstTime;
    float life = 0.8 + fract(position.z * 7.31) * 0.9;
    if (age < 0.0 || age > life || uStrength <= 0.0) {
      // Park spent shards outside the frustum rather than drawing them.
      gl_Position = vec4(3.0, 3.0, 3.0, 1.0);
      vAlpha = 0.0;
      vHeat = 0.0;
      return;
    }

    // Scattered around the wall normal, but biased along it.
    vec3 direction = normalize(uNormal * 1.3 + normalize(position));
    float speed = (1.0 + fract(position.x * 13.17) * 2.3) * uStrength;

    vec3 p = uOrigin + direction * speed * age;
    p.y -= 1.9 * age * age;

    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    float fade = 1.0 - age / life;
    gl_PointSize = (1.3 + fract(position.y * 19.7) * 2.5) * (30.0 / -mvPosition.z) * uPixelScale * fade;
    vAlpha = fade * fade;
    vHeat = clamp(1.0 - age * 1.7, 0.0, 1.0);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const debrisFragmentShader = /* glsl */ `
  varying float vAlpha;
  varying float vHeat;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    // Cooling as they fall: white hot, then gold, then dead stone.
    vec3 colour = mix(vec3(0.5, 0.33, 0.2), vec3(1.0, 0.88, 0.62), vHeat);
    gl_FragColor = vec4(colour, (1.0 - d * d) * vAlpha);
  }
`;

/**
 * The molten interior. The scene carries no depth buffer, so this cannot be
 * hidden behind the shell and revealed by the gap. Instead its light is
 * concentrated along the seam and added over the top, which reads as light
 * escaping the break rather than as a ball inside a ball.
 */
const heartVertexShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  varying vec3 vLocal;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorldPosition = world.xyz;
    vLocal = position;
    vNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const heartFragmentShader = /* glsl */ `
  uniform float uSplit;
  uniform float uShatter;
  uniform float uReveal;
  uniform float uTime;
  uniform vec3 uSplitAxis;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  varying vec3 vLocal;
  void main() {
    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    float fresnel = pow(1.0 - max(dot(normalize(vNormal), viewDirection), 0.0), 1.5);
    float flicker = 0.82 + sin(uTime * 7.3) * 0.12 + sin(uTime * 17.1) * 0.06;
    // Brightest across the seam, falling away toward the poles of the break.
    float seam = 1.0 - smoothstep(0.0, 0.62, abs(dot(normalize(vLocal), uSplitAxis)));
    vec3 color = mix(vec3(1.0, 0.44, 0.11), vec3(1.0, 0.97, 0.9), fresnel * 0.6 + seam * 0.4);
    float opened = smoothstep(0.01, 0.08, uSplit) * (0.25 + seam * 1.35);
    // When it finally breaks apart the whole interior is exposed, flares, and
    // burns out with the shards.
    float pyre = smoothstep(0.0, 0.06, uShatter) * (1.0 - smoothstep(0.12, 0.72, uShatter)) * 2.4;
    float exposure = uReveal * flicker * max(opened, pyre);
    gl_FragColor = vec4(color * exposure, exposure * 0.85);
  }
`;

/**
 * Smoke rolling up from the floor of the chamber. The footage freezes when the
 * live scene takes over, and its smoke freezes with it, so this carries the
 * motion on from where the film stops.
 *
 * Built by warping a noise field with itself — the offsets are what make it
 * curl and fold rather than slide, which is the whole difference between smoke
 * and a scrolling texture.
 */
const smokeVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const smokeFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uAmount;
  uniform float uSeed;
  uniform float uAgitation;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
      f.y
    );
  }

  float fbm(vec2 p) {
    float value = noise(p) * 0.5;
    value += noise(p * 2.03 + 3.1) * 0.29;
    value += noise(p * 4.11 + 7.7) * 0.15;
    return value;
  }

  void main() {
    vec2 uv = vUv + uSeed;
    float rise = uTime * 0.08;

    // Warp the field with a sample of itself, twice.
    vec2 warp = vec2(
      fbm(uv * 2.1 - vec2(0.0, rise)),
      fbm(uv * 2.1 + vec2(4.7, 1.3) - vec2(0.0, rise * 1.25))
    );
    float density = fbm(uv * 2.4 + warp * (1.5 + uAgitation * 0.9) - vec2(0.0, rise * 0.8));

    // A column: thick along the floor, thinning as it climbs and at the walls.
    float column = 1.0 - smoothstep(0.02, 0.92, vUv.y);
    float walls = smoothstep(0.0, 0.26, vUv.x) * smoothstep(1.0, 0.74, vUv.x);
    // The field sits around 0.47, so the threshold has to straddle that or
    // almost everything is cut away. Keeping the range narrow is what separates
    // it into wisps instead of laying down an even fog.
    float body = smoothstep(0.36, 0.585, density);

    float alpha = body * column * walls * uAmount;
    // Premultiplied: the canvas is composited that way, and without this the
    // colour arrives at full strength however thin the smoke is.
    gl_FragColor = vec4(vec3(0.83, 0.79, 0.72) * alpha, alpha);
  }
`;

const fogVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fogFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uReveal;
  uniform float uFailure;
  uniform float uCharge;
  varying vec2 vUv;

  float random(vec2 p) { return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(random(i), random(i + vec2(1,0)), f.x), mix(random(i + vec2(0,1)), random(i + vec2(1,1)), f.x), f.y);
  }

  void main() {
    vec2 centered = vUv - 0.5;
    float radial = 1.0 - smoothstep(0.04, 0.62, length(centered));
    float mist = noise(vUv * 4.2 + vec2(uTime * 0.015, -uTime * 0.01));
    mist += noise(vUv * 8.0 - vec2(uTime * 0.009, 0.0)) * 0.35;
    float alpha = (0.012 + uReveal * 0.045 + uFailure * 0.02 + uCharge * 0.02) * mist * (0.35 + radial * 0.65);
    gl_FragColor = vec4(0.62, 0.54, 0.4, alpha);
  }
`;

/**
 * Release speed, in world units per second, that breaks the object open. Well
 * above what it takes to strike a wall, so breaking it stays rare.
 */
const THROW_SPEED = 8.5;

export interface RendererDiagnostics {
  readonly tier: QualityTier;
  readonly dpr: number;
  readonly fps: number;
  readonly drawCalls: number;
}

export interface RenderState {
  readonly progress: number;
  readonly deltaSeconds: number;
  readonly pointerX: number;
  readonly pointerY: number;
  readonly charge: number;
  readonly audioLow: number;
  readonly audioMid: number;
  readonly audioHigh: number;
}

export class VaultRenderer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  private readonly artifact = new THREE.Group();
  /** Everything the film frames, scaled together to match that frame. */
  private readonly world = new THREE.Group();
  private readonly coreMaterial: THREE.ShaderMaterial;
  private readonly heartMaterial: THREE.ShaderMaterial;
  private readonly moteMaterial: THREE.ShaderMaterial;
  private readonly smokeMaterials: THREE.ShaderMaterial[] = [];
  private readonly particleMaterial: THREE.ShaderMaterial;
  private readonly fogMaterial: THREE.ShaderMaterial;
  private readonly particleGeometry: THREE.BufferGeometry;
  private readonly starGeometry: THREE.BufferGeometry;
  private readonly moteGeometry: THREE.BufferGeometry;
  private readonly heart: THREE.Mesh;
  private readonly splitAxis = new THREE.Vector3(1, 0, 0);
  private readonly haloTexture: THREE.CanvasTexture;
  private readonly pointerDirection = new THREE.Vector3(0, 0, 1);
  private readonly grabTarget = new THREE.Vector2();
  private readonly grabOffset = new THREE.Vector2();
  private readonly grabVelocity = new THREE.Vector2();
  private grabbed = false;
  private frameScale = 1;
  private split = 0;
  private splitVelocity = 0;
  private heat = 0;
  private damage = 0;
  private shatter = 0;
  private destroyed = false;
  private pendingDestruction = false;
  private pendingImpact = 0;
  private debrisCursor = 0;
  private readonly debrisPools: THREE.ShaderMaterial[] = [];
  private readonly boundsLocal = new THREE.Vector2(1.7, 1.15);
  private readonly frameTimes = new Float32Array(180);
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];
  private readonly drawingBuffer = new THREE.Vector2();
  private postChain: PostChain | null = null;
  private quality: QualityProfile;
  private elapsed = 0;
  private pulseAmount = 0;
  private shock = 0;
  private reveal = 0;
  private charge = 0;
  private spinVelocity = 0;
  private frameCursor = 0;
  private sampledFrames = 0;
  private qualityCooldown = 240;
  private averageFps = 60;
  private contextLost = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly onContextState?: (lost: boolean) => void,
  ) {
    const context = canvas.getContext('webgl2', {
      alpha: true,
      antialias: false,
      powerPreference: 'high-performance',
      depth: true,
      stencil: false,
    });

    if (!context) throw new Error('WebGL 2 is unavailable');

    this.quality = selectInitialQuality();
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      context,
      alpha: true,
      antialias: false,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(this.quality.dpr);
    this.camera.position.z = 6;

    this.coreMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uReveal: { value: 0 },
        uPulse: { value: 0 },
        uFailure: { value: 0 },
        uCharge: { value: 0 },
        uShock: { value: 0 },
        uAudio: { value: new THREE.Vector3() },
        uPointer: { value: new THREE.Vector3(0, 0, 1) },
        uStretch: { value: new THREE.Vector3() },
        uSplitAxis: { value: new THREE.Vector3(1, 0, 0) },
        uSplit: { value: 0 },
        uHeat: { value: 0 },
        uDamage: { value: 0 },
        uShatter: { value: 0 },
      },
      vertexShader: coreVertexShader,
      fragmentShader: coreFragmentShader,
      transparent: true,
      depthWrite: false,
    });
    this.heartMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uSplit: { value: 0 },
        uShatter: { value: 0 },
        uReveal: { value: 0 },
        uTime: { value: 0 },
        uSplitAxis: { value: new THREE.Vector3(1, 0, 0) },
      },
      vertexShader: heartVertexShader,
      fragmentShader: heartFragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.moteMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uOpen: { value: 0 },
        uPixelScale: { value: 1 },
      },
      vertexShader: moteVertexShader,
      fragmentShader: moteFragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.particleMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uReveal: { value: 0 },
        uPulse: { value: 0 },
        uCharge: { value: 0 },
        uPixelScale: { value: 1 },
        uAudio: { value: new THREE.Vector3() },
      },
      vertexShader: particleVertexShader,
      fragmentShader: particleFragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.fogMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uReveal: { value: 0 },
        uFailure: { value: 0 },
        uCharge: { value: 0 },
      },
      vertexShader: fogVertexShader,
      fragmentShader: fogFragmentShader,
      transparent: true,
      depthWrite: false,
    });
    this.materials.push(
      this.coreMaterial,
      this.heartMaterial,
      this.moteMaterial,
      this.particleMaterial,
      this.fogMaterial,
    );

    const coreGeometry = this.createShardableGeometry(0.82, this.quality.geometryDetail);
    const heartGeometry = new THREE.IcosahedronGeometry(0.6, 3);
    this.geometries.push(coreGeometry, heartGeometry);
    // The interior is drawn first so the shell reads as being in front of it.
    this.heart = new THREE.Mesh(heartGeometry, this.heartMaterial);
    this.heart.renderOrder = 1;
    this.artifact.add(new THREE.Mesh(coreGeometry, this.coreMaterial), this.heart);

    this.haloTexture = this.createHaloTexture();
    const haloMaterial = new THREE.SpriteMaterial({
      map: this.haloTexture,
      color: 0xc58c49,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.materials.push(haloMaterial);
    const halo = new THREE.Sprite(haloMaterial);
    halo.name = 'halo';
    halo.scale.set(2.4, 2.4, 1);
    halo.position.z = -0.35;
    this.artifact.add(halo);

    this.starGeometry = this.createPointGeometry(this.quality.stars, 0.62, true);
    this.geometries.push(this.starGeometry);
    const stars = new THREE.Points(this.starGeometry, this.particleMaterial);
    stars.name = 'stars';
    this.artifact.add(stars);

    this.particleGeometry = this.createPointGeometry(this.quality.particles, 5.4, false);
    this.geometries.push(this.particleGeometry);
    const particles = new THREE.Points(this.particleGeometry, this.particleMaterial);
    particles.position.z = -0.2;
    this.world.add(particles);

    // Two pools, so a second strike does not cut the first burst short.
    for (let pool = 0; pool < 2; pool += 1) {
      const material = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uBurstTime: { value: -100 },
          uStrength: { value: 0 },
          uPixelScale: { value: 1 },
          uOrigin: { value: new THREE.Vector3() },
          uNormal: { value: new THREE.Vector3(1, 0, 0) },
        },
        vertexShader: debrisVertexShader,
        fragmentShader: debrisFragmentShader,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      // The attribute carries three seeds per shard, not a position.
      const geometry = this.createPointGeometry(this.quality.debris, 1, true);
      this.geometries.push(geometry);
      this.materials.push(material);
      this.debrisPools.push(material);
      const points = new THREE.Points(geometry, material);
      points.frustumCulled = false;
      points.renderOrder = 3;
      this.world.add(points);
    }

    this.moteGeometry = this.createPointGeometry(this.quality.motes, 3.4, false);
    this.geometries.push(this.moteGeometry);
    const motes = new THREE.Points(this.moteGeometry, this.moteMaterial);
    motes.position.z = 0.6;
    this.world.add(motes);

    // Two sheets at different depths: one behind the object and one drifting in
    // front of it, which is what gives the smoke a sense of volume.
    if (this.quality.smoke) {
      const sheets: readonly (readonly [number, number, number, number, number, number, number])[] = [
        [13, 6.4, 0, -1.6, -0.9, 0, -2],
        [9.5, 4.6, 0, -1.3, 1.5, 0.37, 2],
      ];
      for (const [width, height, x, y, z, seed, order] of sheets) {
        const material = new THREE.ShaderMaterial({
          uniforms: {
            uTime: { value: 0 },
            uAmount: { value: 0 },
            uSeed: { value: seed },
            uAgitation: { value: 0 },
          },
          vertexShader: smokeVertexShader,
          fragmentShader: smokeFragmentShader,
          transparent: true,
          depthWrite: false,
        });
        const geometry = new THREE.PlaneGeometry(width, height);
        this.geometries.push(geometry);
        this.materials.push(material);
        this.smokeMaterials.push(material);
        const sheet = new THREE.Mesh(geometry, material);
        sheet.position.set(x, y, z);
        sheet.renderOrder = order;
        this.world.add(sheet);
      }
    }

    const fogGeometry = new THREE.PlaneGeometry(11.5, 7);
    this.geometries.push(fogGeometry);
    const fog = new THREE.Mesh(fogGeometry, this.fogMaterial);
    fog.position.z = -2.2;
    this.world.add(fog);
    this.world.add(this.artifact);
    this.scene.add(this.world);

    this.artifact.visible = false;
    if (this.quality.postProcessing) this.postChain = new PostChain(this.renderer);
    this.canvas.addEventListener('webglcontextlost', this.handleContextLost);
    this.canvas.addEventListener('webglcontextrestored', this.handleContextRestored);
    this.resize();
  }

  update(state: RenderState): void {
    if (this.contextLost) return;

    const { deltaSeconds, progress, pointerX, pointerY, charge } = state;
    this.elapsed += deltaSeconds;
    this.pulseAmount = Math.max(0, this.pulseAmount - deltaSeconds * 0.72);
    this.shock = Math.max(0, this.shock - deltaSeconds * 1.55);

    // The break heals on a stiff spring, so it flies open and snaps shut.
    const splitStep = Math.min(deltaSeconds, 1 / 60);
    this.splitVelocity += (-this.split * 190 - this.splitVelocity * 11) * splitStep;
    this.split = Math.max(0, this.split + this.splitVelocity * splitStep);
    // Struck stone cools over a few seconds.
    this.heat = Math.max(0, this.heat - deltaSeconds * 0.34);
    // The scatter runs once, forward only, over about two and a half seconds.
    if (this.destroyed) this.shatter = Math.min(1, this.shatter + deltaSeconds * 0.4);

    const open = smoothstep(RAMPS.openFadeStart, RAMPS.openFadeEnd, progress);
    const reveal = smoothstep(RAMPS.revealFadeStart, RAMPS.revealFadeEnd, progress);
    const failure = smoothstep(RAMPS.failureFadeStart, RAMPS.failureFadeEnd, progress);
    this.reveal = reveal;
    this.charge = charge;
    this.artifact.visible = reveal > 0.002
      && progress < RAMPS.artifactHiddenAfter
      && this.shatter < 1;

    const core = this.coreMaterial.uniforms;
    core.uTime!.value = this.elapsed;
    core.uReveal!.value = reveal;
    core.uPulse!.value = this.pulseAmount;
    core.uFailure!.value = failure;
    core.uCharge!.value = charge;
    core.uShock!.value = this.shock;
    (core.uAudio!.value as THREE.Vector3).set(state.audioLow, state.audioMid, state.audioHigh);
    // Points from the object toward wherever the pointer is on screen.
    (core.uPointer!.value as THREE.Vector3)
      .copy(this.pointerDirection.set(pointerX, -pointerY, 1))
      .normalize();
    core.uSplit!.value = this.split;
    core.uHeat!.value = this.heat;
    core.uDamage!.value = this.damage;
    core.uShatter!.value = this.shatter;
    (core.uSplitAxis!.value as THREE.Vector3).copy(this.splitAxis);

    for (const pool of this.debrisPools) pool.uniforms.uTime!.value = this.elapsed;

    this.heartMaterial.uniforms.uSplit!.value = this.split;
    this.heartMaterial.uniforms.uShatter!.value = this.shatter;
    this.heartMaterial.uniforms.uReveal!.value = reveal;
    this.heartMaterial.uniforms.uTime!.value = this.elapsed;
    (this.heartMaterial.uniforms.uSplitAxis!.value as THREE.Vector3).copy(this.splitAxis);
    // Swells out of the break rather than sitting still inside it.
    this.heart.scale.setScalar(1 + this.split * 0.75);

    this.moteMaterial.uniforms.uTime!.value = this.elapsed;
    this.moteMaterial.uniforms.uOpen!.value = open;

    // Thickest once the film has frozen and the live scene has to carry the
    // motion; impacts and breaks stir it.
    const smokeAmount = open * (0.55 + reveal * 0.55 + failure * 0.3);
    const agitation = Math.min(1, this.shock + this.split * 2);
    for (const material of this.smokeMaterials) {
      material.uniforms.uTime!.value = this.elapsed;
      material.uniforms.uAmount!.value = smokeAmount;
      material.uniforms.uAgitation!.value = agitation;
    }

    const particles = this.particleMaterial.uniforms;
    particles.uTime!.value = this.elapsed;
    particles.uReveal!.value = reveal;
    particles.uPulse!.value = this.pulseAmount;
    particles.uCharge!.value = charge;
    (particles.uAudio!.value as THREE.Vector3).set(state.audioLow, state.audioMid, state.audioHigh);

    this.fogMaterial.uniforms.uTime!.value = this.elapsed;
    this.fogMaterial.uniforms.uReveal!.value = reveal;
    this.fogMaterial.uniforms.uFailure!.value = failure;
    this.fogMaterial.uniforms.uCharge!.value = charge;

    const halo = this.artifact.getObjectByName('halo');
    if (halo instanceof THREE.Sprite) {
      halo.material.opacity = reveal * (
        0.1 + this.pulseAmount * 0.12 + failure * 0.06 + charge * 0.16 + state.audioLow * 0.08
      );
      halo.position.x = pointerX * 0.06;
      halo.position.y = -pointerY * 0.04;
      const haloScale = 2.4 + charge * 0.45 + this.shock * 1.2;
      halo.scale.set(haloScale, haloScale, 1);
    }

    // Held: stiff and well damped, so it tracks the hand. Released: slack, so a
    // throw keeps its momentum long enough to reach a wall before the tether
    // draws it back to the middle.
    // The loose figures matter: a strong tether decelerates a throw to nothing
    // just short of the wall, so the object only ever kisses it.
    const stiffness = this.grabbed ? 135 : 4.5;
    const damping = this.grabbed ? 19 : 2.2;
    const springStep = Math.min(deltaSeconds, 1 / 60);
    this.measureChamber();
    // The hand can only carry it as far as the chamber allows.
    const targetX = clamp(this.grabTarget.x, -this.boundsLocal.x, this.boundsLocal.x);
    const targetY = clamp(this.grabTarget.y, -this.boundsLocal.y, this.boundsLocal.y);
    this.grabVelocity.x += ((targetX - this.grabOffset.x) * stiffness - this.grabVelocity.x * damping) * springStep;
    this.grabVelocity.y += ((targetY - this.grabOffset.y) * stiffness - this.grabVelocity.y * damping) * springStep;
    this.grabOffset.x += this.grabVelocity.x * springStep;
    this.grabOffset.y += this.grabVelocity.y * springStep;
    this.collideWithChamber();

    const speed = this.grabVelocity.length();
    // A broken object flails harder than an intact one.
    const stretchAmount = Math.min(0.34, speed * 0.055) + this.split * 0.25;
    const stretch = this.coreMaterial.uniforms.uStretch!.value as THREE.Vector3;
    if (speed > 0.001) stretch.set(this.grabVelocity.x / speed, this.grabVelocity.y / speed, stretchAmount);
    else stretch.set(0, 0, 0);

    const nearFreeze = failure > 0.1 ? 0.15 : 1;
    // Drag momentum decays exponentially and rides on top of the idle drift.
    this.spinVelocity *= Math.exp(-deltaSeconds * 2.4);
    this.artifact.rotation.y += (0.11 * nearFreeze + this.spinVelocity) * deltaSeconds;
    this.artifact.rotation.x += deltaSeconds * 0.035 * nearFreeze;
    this.artifact.rotation.z = pointerX * 0.025 + this.grabOffset.x * 0.06;
    this.artifact.position.x = pointerX * 0.08 + this.grabOffset.x;
    this.artifact.position.y = Math.sin(this.elapsed * 0.42) * 0.08 - pointerY * 0.035 + this.grabOffset.y;
    const scale = 0.65 + reveal * 0.35 + this.pulseAmount * 0.035 + charge * 0.07;
    this.artifact.scale.setScalar(scale);
    this.world.scale.setScalar(this.frameScale);

    // The camera loses its footing as containment gives way, and again on impact.
    const shake = (failure * 0.02 + this.shock * 0.028) * reveal;
    this.camera.position.x = Math.sin(this.elapsed * 37.1) * shake;
    this.camera.position.y = Math.cos(this.elapsed * 41.7) * shake;

    if (this.postChain) {
      this.postChain.render(this.scene, this.camera, {
        time: this.elapsed,
        shock: this.shock,
        bloom: 0.55 + charge * 0.3 + failure * 0.18,
        aberration: 0.4 + charge * 0.55 + failure * 0.85,
        grain: 0.035 + failure * 0.05,
      });
    } else {
      this.renderer.setRenderTarget(null);
      this.renderer.render(this.scene, this.camera);
    }
    this.samplePerformance(deltaSeconds);
  }

  /**
   * Bounces the object off the walls of the chamber and records the strike.
   *
   * The extents are recomputed rather than cached because they depend on the
   * frame scale, which changes when a phone is rotated. They are expressed in
   * the world group's own units, where the film's half height is constant
   * whatever the viewport does.
   */
  private measureChamber(): void {
    const halfHeight = Math.tan((this.camera.fov * Math.PI) / 360) * 6;
    const visibleHalfWidth = (halfHeight * this.camera.aspect) / this.frameScale;
    // The chamber's lit interior, not the whole frame: the door fills the sides.
    this.boundsLocal.set(
      Math.max(0.5, Math.min(halfHeight * (16 / 9), visibleHalfWidth) * 0.62 - 0.55),
      Math.max(0.4, halfHeight * 0.72 - 0.55),
    );
  }

  private collideWithChamber(): void {
    const bounce = (
      offset: number,
      velocity: number,
      limit: number,
    ): readonly [number, number, number] => {
      if (Math.abs(offset) <= limit) return [offset, velocity, 0];
      const side = Math.sign(offset);
      // Only a wall the object is still travelling into counts as a strike.
      if (velocity * side <= 0) return [side * limit, velocity, 0];
      return [side * limit, -velocity * 0.58, Math.abs(velocity)];
    };

    const [x, vx, hitX] = bounce(this.grabOffset.x, this.grabVelocity.x, this.boundsLocal.x);
    const [y, vy, hitY] = bounce(this.grabOffset.y, this.grabVelocity.y, this.boundsLocal.y);
    this.grabOffset.set(x, y);
    this.grabVelocity.set(vx, vy);

    const strength = Math.max(hitX, hitY);
    if (strength < 1.4) return;

    this.registerStrike(
      strength,
      hitX >= hitY ? -Math.sign(x) : 0,
      hitY > hitX ? -Math.sign(y) : 0,
    );
  }

  /** Heat, damage, debris and a report to the caller, from one wall strike. */
  private registerStrike(speed: number, normalX: number, normalY: number): void {
    if (this.destroyed) return;
    const force = clamp((speed - 1.4) / 6);
    this.heat = clamp(this.heat + 0.22 + force * 0.5);
    this.shock = Math.min(1, this.shock + 0.3 + force * 0.45);
    this.pulseAmount = Math.min(1, this.pulseAmount + 0.25 + force * 0.4);
    this.pendingImpact = Math.max(this.pendingImpact, force);

    // Damage never heals. Roughly five solid hits will finish it.
    this.damage = clamp(this.damage + 0.1 + force * 0.2);
    this.burstDebris(0.5 + force * 1.5, normalX, normalY, 0.55);
    if (this.damage >= 1) this.beginShatter();
  }

  private burstDebris(strength: number, normalX: number, normalY: number, offset: number): void {
    const pool = this.debrisPools[this.debrisCursor % this.debrisPools.length];
    this.debrisCursor += 1;
    if (!pool) return;
    pool.uniforms.uBurstTime!.value = this.elapsed;
    pool.uniforms.uStrength!.value = strength;
    (pool.uniforms.uOrigin!.value as THREE.Vector3).set(
      this.grabOffset.x + normalX * offset,
      this.grabOffset.y + normalY * offset,
      0,
    );
    (pool.uniforms.uNormal!.value as THREE.Vector3).set(normalX, normalY, 0.35).normalize();
  }

  /** The blow that finishes it: everything at once, and no way back. */
  private beginShatter(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.pendingDestruction = true;
    this.shatter = 0.0001;
    this.shock = 1;
    this.pulseAmount = 1;
    this.heat = 1;
    this.grabbed = false;
    this.grabTarget.set(0, 0);
    this.grabVelocity.set(0, 0);
    // Both pools at once, thrown in opposite directions.
    this.burstDebris(2.6, 1, 0.3, 0);
    this.burstDebris(2.6, -1, -0.2, 0);
  }

  /** True once, on the frame the object is destroyed. */
  consumeDestruction(): boolean {
    const destroyed = this.pendingDestruction;
    this.pendingDestruction = false;
    return destroyed;
  }

  /** What is left of the object, from one down to zero. */
  getIntegrity(): number {
    return clamp(1 - this.damage);
  }

  /**
   * The force of the last wall strike the caller has not answered yet, so sound
   * and copy can respond to it. Reading it clears it.
   */
  consumeImpact(): number {
    const impact = this.pendingImpact;
    this.pendingImpact = 0;
    return impact;
  }

  /**
   * How much light the object is throwing right now, for the interface to bleed
   * into the surrounding page.
   */
  getGlow(): number {
    return clamp(this.reveal * (
      this.charge * 0.55 + this.pulseAmount * 0.45 + this.shock * 0.7
      + this.split * 2.2 + this.heat * 0.4
      + (1 - smoothstep(0, 0.5, this.shatter)) * this.shatter * 6
    ));
  }

  /**
   * Binds the scene to the film. The footage is letterboxed on a tall viewport,
   * so without this the object is sized against the window and spills out of
   * the frame it is supposed to be inside.
   */
  setFrameScale(scale: number): void {
    this.frameScale = clamp(scale, 0.2, 1);
  }

  /**
   * Takes hold of the object, or lets it go. Coordinates are normalised screen
   * space; while held the object chases them on a spring, and on release the
   * same spring — now underdamped — carries it back through centre.
   */
  setGrab(active: boolean, x = 0, y = 0): void {
    this.grabbed = active;
    if (active) this.grabTarget.set(clamp(x, -1, 1) * 1.55, clamp(-y, -1, 1) * 1.05);
    else this.grabTarget.set(0, 0);
  }

  /**
   * Lets go. Returns true when it was let go hard enough to break open, so the
   * caller can answer with sound and copy.
   */
  releaseGrab(throwX = 0, throwY = 0): boolean {
    // The throw comes from how fast the hand was moving, not from where the
    // spring had got to. Dragging into a wall pins the object against it with
    // no speed left, so without this a flick at the wall does nothing at all.
    this.grabVelocity.x += clamp(throwX, -9, 9) * 1.55;
    this.grabVelocity.y += clamp(-throwY, -9, 9) * 1.05;
    const speed = this.grabVelocity.length();
    this.setGrab(false);
    if (speed < THROW_SPEED) return false;
    return this.fracture(this.grabVelocity.x, this.grabVelocity.y);
  }

  /**
   * Breaks the object open along the direction it was thrown. Refuses while a
   * break is already healing, so it cannot be held permanently apart.
   */
  fracture(directionX: number, directionY: number): boolean {
    if (this.split > 0.02) return false;
    const length = Math.hypot(directionX, directionY);
    if (length < 0.001) return false;
    this.splitAxis.set(directionX / length, directionY / length, 0);
    this.splitVelocity = 6.2;
    this.shock = Math.min(1, this.shock + 0.85);
    this.pulseAmount = Math.min(1, this.pulseAmount + 0.7);
    return true;
  }

  /** Releases stored charge as an impact. Returns false if there was none. */
  release(charge: number): boolean {
    const amount = clamp(charge);
    if (amount < 0.04) return false;
    this.pulseAmount = Math.min(1, 0.3 + amount * 0.7);
    this.shock = Math.min(1, 0.25 + amount * 0.75);
    return true;
  }

  /** Adds angular momentum, in radians per second, from a horizontal drag. */
  addSpin(velocity: number): void {
    this.spinVelocity = clamp(this.spinVelocity + velocity, -9, 9);
  }

  resize(): void {
    const width = Math.max(1, this.canvas.clientWidth || window.innerWidth);
    const height = Math.max(1, this.canvas.clientHeight || window.innerHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.renderer.getDrawingBufferSize(this.drawingBuffer);
    const pixelScale = Math.max(0.6, this.drawingBuffer.y / 900);
    this.particleMaterial.uniforms.uPixelScale!.value = pixelScale;
    this.moteMaterial.uniforms.uPixelScale!.value = pixelScale;
    for (const pool of this.debrisPools) pool.uniforms.uPixelScale!.value = pixelScale;
    this.postChain?.setSize(
      Math.max(1, Math.floor(this.drawingBuffer.x)),
      Math.max(1, Math.floor(this.drawingBuffer.y)),
    );
  }

  reset(): void {
    this.elapsed = 0;
    this.pulseAmount = 0;
    this.shock = 0;
    this.reveal = 0;
    this.charge = 0;
    this.spinVelocity = 0;
    this.grabbed = false;
    this.grabTarget.set(0, 0);
    this.grabOffset.set(0, 0);
    this.grabVelocity.set(0, 0);
    this.split = 0;
    this.splitVelocity = 0;
    this.heat = 0;
    this.damage = 0;
    this.shatter = 0;
    this.destroyed = false;
    this.pendingDestruction = false;
    this.pendingImpact = 0;
    for (const pool of this.debrisPools) pool.uniforms.uStrength!.value = 0;
    this.camera.position.set(0, 0, 6);
    this.artifact.rotation.set(0, 0, 0);
    this.artifact.visible = false;
  }

  getDiagnostics(): RendererDiagnostics {
    return {
      tier: this.quality.tier,
      dpr: this.renderer.getPixelRatio(),
      fps: this.averageFps,
      drawCalls: this.renderer.info.render.calls,
    };
  }

  dispose(): void {
    this.canvas.removeEventListener('webglcontextlost', this.handleContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.handleContextRestored);
    this.geometries.forEach((geometry) => geometry.dispose());
    this.materials.forEach((material) => material.dispose());
    this.haloTexture.dispose();
    this.postChain?.dispose();
    this.postChain = null;
    this.renderer.dispose();
  }

  /**
   * The core, built so it can come apart. Every triangle is given its own
   * vertices plus its centroid, a tumbling axis and a bearing, which is what
   * lets the shatter fling each face away as an independent shard. Indexed
   * geometry shares vertices between faces and cannot be separated at all.
   */
  private createShardableGeometry(radius: number, detail: number): THREE.BufferGeometry {
    const geometry = new THREE.IcosahedronGeometry(radius, detail).toNonIndexed();
    const positions = geometry.getAttribute('position');
    const faces = positions.count / 3;
    const centroids = new Float32Array(positions.count * 3);
    const axes = new Float32Array(positions.count * 3);
    const tumbles = new Float32Array(positions.count * 2);

    let seed = 0x9e3779b1;
    const random = (): number => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0xffffffff;
    };

    for (let face = 0; face < faces; face += 1) {
      const first = face * 3;
      let cx = 0;
      let cy = 0;
      let cz = 0;
      for (let corner = 0; corner < 3; corner += 1) {
        cx += positions.getX(first + corner);
        cy += positions.getY(first + corner);
        cz += positions.getZ(first + corner);
      }
      cx /= 3;
      cy /= 3;
      cz /= 3;

      // A unit axis from a random direction, and how hard this shard is thrown.
      let ax = random() * 2 - 1;
      let ay = random() * 2 - 1;
      let az = random() * 2 - 1;
      const length = Math.hypot(ax, ay, az) || 1;
      ax /= length;
      ay /= length;
      az /= length;
      const spin = (random() * 2 - 1) * 1.6;
      const bearing = 0.5 + random() * 1.1;

      for (let corner = 0; corner < 3; corner += 1) {
        const vertex = first + corner;
        centroids[vertex * 3] = cx;
        centroids[vertex * 3 + 1] = cy;
        centroids[vertex * 3 + 2] = cz;
        axes[vertex * 3] = ax;
        axes[vertex * 3 + 1] = ay;
        axes[vertex * 3 + 2] = az;
        tumbles[vertex * 2] = spin;
        tumbles[vertex * 2 + 1] = bearing;
      }
    }

    geometry.setAttribute('aCentroid', new THREE.BufferAttribute(centroids, 3));
    geometry.setAttribute('aAxis', new THREE.BufferAttribute(axes, 3));
    geometry.setAttribute('aTumble', new THREE.BufferAttribute(tumbles, 2));
    return geometry;
  }

  private createPointGeometry(count: number, radius: number, sphere: boolean): THREE.BufferGeometry {
    const positions = new Float32Array(count * 3);
    let seed = 0x2f6e2b1;
    const random = (): number => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0xffffffff;
    };

    for (let index = 0; index < count; index += 1) {
      const offset = index * 3;
      if (sphere) {
        const theta = random() * Math.PI * 2;
        const phi = Math.acos(2 * random() - 1);
        const localRadius = Math.cbrt(random()) * radius;
        positions[offset] = localRadius * Math.sin(phi) * Math.cos(theta);
        positions[offset + 1] = localRadius * Math.sin(phi) * Math.sin(theta);
        positions[offset + 2] = localRadius * Math.cos(phi);
      } else {
        positions[offset] = (random() - 0.5) * radius * 2;
        positions[offset + 1] = (random() - 0.5) * radius * 1.2;
        positions[offset + 2] = (random() - 0.5) * 3 - 0.5;
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return geometry;
  }

  private createHaloTexture(): THREE.CanvasTexture {
    const textureCanvas = document.createElement('canvas');
    textureCanvas.width = 128;
    textureCanvas.height = 128;
    const context = textureCanvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D is unavailable');
    const gradient = context.createRadialGradient(64, 64, 2, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(255, 222, 164, 0.85)');
    gradient.addColorStop(0.18, 'rgba(205, 143, 70, 0.32)');
    gradient.addColorStop(0.52, 'rgba(116, 69, 32, 0.08)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(textureCanvas);
  }

  private samplePerformance(deltaSeconds: number): void {
    this.frameTimes[this.frameCursor] = deltaSeconds;
    this.frameCursor = (this.frameCursor + 1) % this.frameTimes.length;
    this.sampledFrames = Math.min(this.sampledFrames + 1, this.frameTimes.length);
    this.qualityCooldown -= 1;

    let total = 0;
    for (let index = 0; index < this.sampledFrames; index += 1) total += this.frameTimes[index]!;
    this.averageFps = Math.round(this.sampledFrames / Math.max(total, 0.001));

    if (this.sampledFrames < this.frameTimes.length || this.qualityCooldown > 0) return;

    if (total / this.sampledFrames > 0.022 && this.quality.tier !== 'low') {
      this.applyQuality(degradeQuality(this.quality.tier));
      this.qualityCooldown = 480;
    } else {
      this.qualityCooldown = 180;
    }
  }

  private applyQuality(profile: QualityProfile): void {
    this.quality = profile;
    // Dropping the bloom chain is the cheapest large saving available.
    if (!profile.postProcessing && this.postChain) {
      this.postChain.dispose();
      this.postChain = null;
    }
    this.renderer.setPixelRatio(profile.dpr);
    this.particleGeometry.setDrawRange(0, Math.min(profile.particles, this.particleGeometry.getAttribute('position').count));
    this.starGeometry.setDrawRange(0, Math.min(profile.stars, this.starGeometry.getAttribute('position').count));
    this.moteGeometry.setDrawRange(0, Math.min(profile.motes, this.moteGeometry.getAttribute('position').count));
    this.resize();
  }

  private readonly handleContextLost = (event: Event): void => {
    event.preventDefault();
    this.contextLost = true;
    this.onContextState?.(true);
  };

  private readonly handleContextRestored = (): void => {
    this.contextLost = false;
    this.resize();
    this.onContextState?.(false);
  };
}
