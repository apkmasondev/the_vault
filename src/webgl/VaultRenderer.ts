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
    float width = 0.016 + uCharge * 0.022;
    float crack = abs(vDetail - 0.5);
    float vein = 1.0 - smoothstep(0.0, width, crack);
    float ember = 1.0 - smoothstep(0.0, width * 6.0, crack);

    // Stone that has cooled unevenly, so the body is never a flat silhouette.
    float relief = smoothstep(0.35, 0.72, vNoise);
    float occlusion = mix(0.55, 1.0, relief);

    float facing = max(dot(normal, normalize(uPointer)), 0.0);
    vec3 obsidian = vec3(0.026, 0.022, 0.019);
    vec3 oldGold = vec3(0.62, 0.40, 0.18);
    vec3 heat = vec3(0.96, 0.74, 0.42);

    // A dark body first, then a rim, then the light coming out of the cracks.
    vec3 color = obsidian * occlusion;
    color += oldGold * fresnel * 0.46;
    // A hard glint keeps it reading as polished stone rather than matte clay.
    color += vec3(1.0, 0.88, 0.66) * pow(facingView, 22.0) * 0.09;
    color += heat * ember * (0.05 + uCharge * 0.1) * occlusion;
    color += heat * vein * (0.55 + uPulse * 0.6 + uCharge * 0.85);
    // The side under the pointer runs hotter, so the object tracks your hand.
    color += heat * facing * vein * uCharge * 0.35;
    color += heat * (uFailure * fresnel * 0.14 + uAudio.z * fresnel * 0.2);

    float alpha = uReveal * (0.9 + fresnel * 0.1);
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
    float exposure = uReveal * smoothstep(0.01, 0.08, uSplit) * flicker * (0.25 + seam * 1.35);
    gl_FragColor = vec4(color * exposure, exposure * 0.85);
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

/** Release speed, in world units per second, that breaks the object open. */
const THROW_SPEED = 4.2;

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
      },
      vertexShader: coreVertexShader,
      fragmentShader: coreFragmentShader,
      transparent: true,
      depthWrite: false,
    });
    this.heartMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uSplit: { value: 0 },
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

    const coreGeometry = new THREE.IcosahedronGeometry(0.82, this.quality.geometryDetail);
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

    this.moteGeometry = this.createPointGeometry(this.quality.motes, 3.4, false);
    this.geometries.push(this.moteGeometry);
    const motes = new THREE.Points(this.moteGeometry, this.moteMaterial);
    motes.position.z = 0.6;
    this.world.add(motes);

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

    const open = smoothstep(RAMPS.openFadeStart, RAMPS.openFadeEnd, progress);
    const reveal = smoothstep(RAMPS.revealFadeStart, RAMPS.revealFadeEnd, progress);
    const failure = smoothstep(RAMPS.failureFadeStart, RAMPS.failureFadeEnd, progress);
    this.reveal = reveal;
    this.charge = charge;
    this.artifact.visible = reveal > 0.002 && progress < RAMPS.artifactHiddenAfter;

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
    (core.uSplitAxis!.value as THREE.Vector3).copy(this.splitAxis);

    this.heartMaterial.uniforms.uSplit!.value = this.split;
    this.heartMaterial.uniforms.uReveal!.value = reveal;
    this.heartMaterial.uniforms.uTime!.value = this.elapsed;
    (this.heartMaterial.uniforms.uSplitAxis!.value as THREE.Vector3).copy(this.splitAxis);
    // Swells out of the break rather than sitting still inside it.
    this.heart.scale.setScalar(1 + this.split * 0.75);

    this.moteMaterial.uniforms.uTime!.value = this.elapsed;
    this.moteMaterial.uniforms.uOpen!.value = open;

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

    // Held: stiff and well damped, so it tracks the hand. Released: slack and
    // underdamped, so it swings back through centre and settles.
    const stiffness = this.grabbed ? 135 : 34;
    const damping = this.grabbed ? 19 : 6.2;
    const springStep = Math.min(deltaSeconds, 1 / 60);
    this.grabVelocity.x += ((this.grabTarget.x - this.grabOffset.x) * stiffness - this.grabVelocity.x * damping) * springStep;
    this.grabVelocity.y += ((this.grabTarget.y - this.grabOffset.y) * stiffness - this.grabVelocity.y * damping) * springStep;
    this.grabOffset.x += this.grabVelocity.x * springStep;
    this.grabOffset.y += this.grabVelocity.y * springStep;

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
        aberration: 0.4 + charge * 0.55 + failure * 1.4,
        grain: 0.035 + failure * 0.05,
      });
    } else {
      this.renderer.setRenderTarget(null);
      this.renderer.render(this.scene, this.camera);
    }
    this.samplePerformance(deltaSeconds);
  }

  /**
   * How much light the object is throwing right now, for the interface to bleed
   * into the surrounding page.
   */
  getGlow(): number {
    return clamp(this.reveal * (
      this.charge * 0.55 + this.pulseAmount * 0.45 + this.shock * 0.7 + this.split * 2.2
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
  releaseGrab(): boolean {
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
