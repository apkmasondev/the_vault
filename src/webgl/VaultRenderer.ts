import * as THREE from 'three';
import { RAMPS } from '../app/constants';
import { smoothstep } from '../utils/math';
import { degradeQuality, selectInitialQuality, type QualityProfile, type QualityTier } from './quality';

const coreVertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uPulse;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  varying float vNoise;

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
    float n = fbm(position * 1.85 + vec3(uTime * 0.055, -uTime * 0.035, uTime * 0.025));
    float pulseWave = uPulse * sin(length(position) * 12.0 - uTime * 8.0) * 0.07;
    vec3 displaced = position + normal * ((n - 0.5) * 0.18 + pulseWave);
    vec4 world = modelMatrix * vec4(displaced, 1.0);
    vWorldPosition = world.xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    vNoise = n;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const coreFragmentShader = /* glsl */ `
  uniform float uReveal;
  uniform float uPulse;
  uniform float uFailure;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  varying float vNoise;

  void main() {
    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    float fresnel = pow(1.0 - max(dot(vNormal, viewDirection), 0.0), 2.4);
    float fissure = smoothstep(0.54, 0.73, vNoise) - smoothstep(0.73, 0.88, vNoise);
    vec3 obsidian = vec3(0.018, 0.014, 0.012);
    vec3 oldGold = vec3(0.68, 0.42, 0.18);
    vec3 heat = vec3(0.94, 0.72, 0.39);
    vec3 color = mix(obsidian, oldGold, fissure * 0.8 + fresnel * 0.32);
    color += heat * (fissure * (0.32 + uPulse * 0.55) + uFailure * fresnel * 0.12);
    float alpha = uReveal * (0.92 + fresnel * 0.08);
    gl_FragColor = vec4(color, alpha);
  }
`;

const shellVertexShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorldPosition = world.xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const shellFragmentShader = /* glsl */ `
  uniform float uReveal;
  uniform float uPulse;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  void main() {
    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    float fresnel = pow(1.0 - abs(dot(vNormal, viewDirection)), 3.2);
    float alpha = fresnel * (0.16 + uPulse * 0.2) * uReveal;
    gl_FragColor = vec4(vec3(0.78, 0.52, 0.25), alpha);
  }
`;

const particleVertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uReveal;
  uniform float uPulse;
  varying float vAlpha;
  void main() {
    vec3 p = position;
    p.y += sin(uTime * 0.15 + p.x * 1.7) * 0.09;
    float distanceFromCore = max(length(p.xy), 0.3);
    p.xy *= 1.0 + uPulse * 0.16 / distanceFromCore;
    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = (2.0 + fract(p.x * 17.13) * 2.2) * (260.0 / -mvPosition.z);
    vAlpha = (0.12 + fract(p.z * 23.17) * 0.45) * (0.22 + uReveal * 0.78);
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
    float alpha = (0.018 + uReveal * 0.1 + uFailure * 0.025) * mist * (0.35 + radial * 0.65);
    gl_FragColor = vec4(0.62, 0.54, 0.4, alpha);
  }
`;

export interface RendererDiagnostics {
  readonly tier: QualityTier;
  readonly dpr: number;
  readonly fps: number;
  readonly drawCalls: number;
}

export class VaultRenderer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  private readonly artifact = new THREE.Group();
  private readonly coreMaterial: THREE.ShaderMaterial;
  private readonly shellMaterial: THREE.ShaderMaterial;
  private readonly particleMaterial: THREE.ShaderMaterial;
  private readonly fogMaterial: THREE.ShaderMaterial;
  private readonly particleGeometry: THREE.BufferGeometry;
  private readonly starGeometry: THREE.BufferGeometry;
  private readonly haloTexture: THREE.CanvasTexture;
  private readonly frameTimes = new Float32Array(180);
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];
  private quality: QualityProfile;
  private elapsed = 0;
  private pulseAmount = 0;
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
      },
      vertexShader: coreVertexShader,
      fragmentShader: coreFragmentShader,
      transparent: true,
      depthWrite: false,
    });
    this.shellMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uReveal: { value: 0 },
        uPulse: { value: 0 },
      },
      vertexShader: shellVertexShader,
      fragmentShader: shellFragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
    });
    this.particleMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uReveal: { value: 0 },
        uPulse: { value: 0 },
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
      },
      vertexShader: fogVertexShader,
      fragmentShader: fogFragmentShader,
      transparent: true,
      depthWrite: false,
    });
    this.materials.push(this.coreMaterial, this.shellMaterial, this.particleMaterial, this.fogMaterial);

    const coreGeometry = new THREE.IcosahedronGeometry(0.82, this.quality.geometryDetail);
    const shellGeometry = new THREE.IcosahedronGeometry(0.9, Math.max(2, this.quality.geometryDetail - 1));
    this.geometries.push(coreGeometry, shellGeometry);
    const core = new THREE.Mesh(coreGeometry, this.coreMaterial);
    const shell = new THREE.Mesh(shellGeometry, this.shellMaterial);
    this.artifact.add(core, shell);

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
    halo.scale.set(3.8, 3.8, 1);
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
    this.scene.add(particles);

    const fogGeometry = new THREE.PlaneGeometry(11.5, 7);
    this.geometries.push(fogGeometry);
    const fog = new THREE.Mesh(fogGeometry, this.fogMaterial);
    fog.position.z = -2.2;
    this.scene.add(fog);
    this.scene.add(this.artifact);

    this.artifact.visible = false;
    this.canvas.addEventListener('webglcontextlost', this.handleContextLost);
    this.canvas.addEventListener('webglcontextrestored', this.handleContextRestored);
    this.resize();
  }

  update(progress: number, deltaSeconds: number, pointerX: number, pointerY: number): void {
    if (this.contextLost) return;

    this.elapsed += deltaSeconds;
    this.pulseAmount = Math.max(0, this.pulseAmount - deltaSeconds * 0.72);
    const reveal = smoothstep(RAMPS.revealFadeStart, RAMPS.revealFadeEnd, progress);
    const failure = smoothstep(RAMPS.failureFadeStart, RAMPS.failureFadeEnd, progress);
    this.artifact.visible = reveal > 0.002 && progress < RAMPS.artifactHiddenAfter;

    this.coreMaterial.uniforms.uTime!.value = this.elapsed;
    this.coreMaterial.uniforms.uReveal!.value = reveal;
    this.coreMaterial.uniforms.uPulse!.value = this.pulseAmount;
    this.coreMaterial.uniforms.uFailure!.value = failure;
    this.shellMaterial.uniforms.uReveal!.value = reveal;
    this.shellMaterial.uniforms.uPulse!.value = this.pulseAmount;
    this.particleMaterial.uniforms.uTime!.value = this.elapsed;
    this.particleMaterial.uniforms.uReveal!.value = reveal;
    this.particleMaterial.uniforms.uPulse!.value = this.pulseAmount;
    this.fogMaterial.uniforms.uTime!.value = this.elapsed;
    this.fogMaterial.uniforms.uReveal!.value = reveal;
    this.fogMaterial.uniforms.uFailure!.value = failure;

    const halo = this.artifact.getObjectByName('halo');
    if (halo instanceof THREE.Sprite) {
      halo.material.opacity = reveal * (0.18 + this.pulseAmount * 0.16 + failure * 0.08);
      halo.position.x = pointerX * 0.06;
      halo.position.y = -pointerY * 0.04;
    }

    const nearFreeze = failure > 0.1 ? 0.15 : 1;
    this.artifact.rotation.y += deltaSeconds * 0.11 * nearFreeze;
    this.artifact.rotation.x += deltaSeconds * 0.035 * nearFreeze;
    this.artifact.rotation.z = pointerX * 0.025;
    this.artifact.position.x = pointerX * 0.08;
    this.artifact.position.y = Math.sin(this.elapsed * 0.42) * 0.08 - pointerY * 0.035;
    const scale = 0.65 + reveal * 0.35 + this.pulseAmount * 0.035;
    this.artifact.scale.setScalar(scale);

    this.renderer.render(this.scene, this.camera);
    this.samplePerformance(deltaSeconds);
  }

  pulse(): boolean {
    if (this.pulseAmount > 0.08) return false;
    this.pulseAmount = 1;
    return true;
  }

  resize(): void {
    const width = Math.max(1, this.canvas.clientWidth || window.innerWidth);
    const height = Math.max(1, this.canvas.clientHeight || window.innerHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  reset(): void {
    this.elapsed = 0;
    this.pulseAmount = 0;
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

    if (this.sampledFrames < this.frameTimes.length || this.qualityCooldown > 0) return;

    let total = 0;
    for (let index = 0; index < this.sampledFrames; index += 1) total += this.frameTimes[index]!;
    const average = total / this.sampledFrames;
    this.averageFps = Math.round(1 / Math.max(average, 0.001));

    if (average > 0.022 && this.quality.tier !== 'low') {
      this.applyQuality(degradeQuality(this.quality.tier));
      this.qualityCooldown = 480;
    } else {
      this.qualityCooldown = 180;
    }
  }

  private applyQuality(profile: QualityProfile): void {
    this.quality = profile;
    this.renderer.setPixelRatio(profile.dpr);
    this.particleGeometry.setDrawRange(0, Math.min(profile.particles, this.particleGeometry.getAttribute('position').count));
    this.starGeometry.setDrawRange(0, Math.min(profile.stars, this.starGeometry.getAttribute('position').count));
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
