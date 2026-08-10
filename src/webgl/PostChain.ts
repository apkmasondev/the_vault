import * as THREE from 'three';

/** Bloom is gathered at a quarter of each axis; the blur hides the loss. */
const BLOOM_DIVISOR = 4;

const quadVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

/** Isolates the hot parts of the frame and blurs them along one axis. */
const brightBlurFragmentShader = /* glsl */ `
  uniform sampler2D uSource;
  uniform vec2 uDirection;
  uniform float uThreshold;
  uniform float uExtract;
  varying vec2 vUv;

  vec3 tap(vec2 uv) {
    vec4 sampled = texture2D(uSource, uv);
    if (uExtract < 0.5) return sampled.rgb;
    float luminance = dot(sampled.rgb, vec3(0.299, 0.587, 0.114));
    return sampled.rgb * smoothstep(uThreshold, uThreshold + 0.28, luminance);
  }

  void main() {
    vec3 sum = tap(vUv) * 0.2270270270;
    sum += tap(vUv + uDirection * 1.3846153846) * 0.3162162162;
    sum += tap(vUv - uDirection * 1.3846153846) * 0.3162162162;
    sum += tap(vUv + uDirection * 3.2307692308) * 0.0702702703;
    sum += tap(vUv - uDirection * 3.2307692308) * 0.0702702703;
    gl_FragColor = vec4(sum, 1.0);
  }
`;

/**
 * Scene plus bloom, with a shock ring that warps the frame, chromatic fringing
 * that grows toward the corners, and film grain. Everything is kept premultiplied
 * so the canvas still composites over the video underneath it.
 */
const compositeFragmentShader = /* glsl */ `
  uniform sampler2D uScene;
  uniform sampler2D uBloom;
  uniform vec2 uResolution;
  uniform float uTime;
  uniform float uShock;
  uniform float uBloomStrength;
  uniform float uAberration;
  uniform float uGrain;
  varying vec2 vUv;

  void main() {
    vec2 centered = vUv - 0.5;
    float distance = length(centered);
    vec2 direction = centered / max(distance, 0.0001);

    // A ring that expands outward over the life of the shock.
    float radius = (1.0 - uShock) * 0.62;
    float ring = uShock * exp(-pow((distance - radius) * 8.5, 2.0));
    vec2 uv = vUv - direction * ring * 0.045;

    float fringe = (uAberration + ring * 1.6) * (0.0012 + distance * 0.0042);
    vec4 sceneSample = texture2D(uScene, uv);
    vec3 color = vec3(
      texture2D(uScene, uv + direction * fringe).r,
      sceneSample.g,
      texture2D(uScene, uv - direction * fringe).b
    );

    // Screen rather than add: the glow still lifts the dark frame, but it rolls
    // off as it approaches white instead of flattening the object into a blob.
    vec3 bloom = clamp(texture2D(uBloom, uv).rgb * uBloomStrength, 0.0, 1.0);
    color = 1.0 - (1.0 - color) * (1.0 - bloom);

    // Opacity tracks the scene. The bloom contributes only enough for the glow
    // to carry over the footage, and the shock ring contributes none at all —
    // it warps the frame rather than covering it.
    float bloomAlpha = clamp(max(max(bloom.r, bloom.g), bloom.b), 0.0, 1.0) * 0.75;
    float alpha = clamp(sceneSample.a + bloomAlpha, 0.0, 1.0);

    // Grain only where the canvas has something to show, so the film below stays clean.
    float grain = fract(sin(dot(vUv * uResolution + uTime, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
    color += grain * uGrain * alpha;

    gl_FragColor = vec4(min(color, vec3(1.0)), alpha);
  }
`;

export interface CompositeState {
  readonly time: number;
  readonly shock: number;
  readonly bloom: number;
  readonly aberration: number;
  readonly grain: number;
}

/**
 * A minimal three-pass chain — extract and blur, blur again, composite — built
 * directly on Three's render targets rather than pulling in a post-processing
 * library for what amounts to four extra draw calls.
 */
export class PostChain {
  private readonly sceneTarget: THREE.WebGLRenderTarget;
  private readonly bloomTargetA: THREE.WebGLRenderTarget;
  private readonly bloomTargetB: THREE.WebGLRenderTarget;
  private readonly blurMaterial: THREE.ShaderMaterial;
  private readonly compositeMaterial: THREE.ShaderMaterial;
  private readonly quad: THREE.Mesh;
  private readonly quadScene = new THREE.Scene();
  private readonly quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly size = new THREE.Vector2(1, 1);

  constructor(private readonly renderer: THREE.WebGLRenderer) {
    const options: THREE.RenderTargetOptions = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      depthBuffer: true,
      stencilBuffer: false,
    };
    this.sceneTarget = new THREE.WebGLRenderTarget(1, 1, options);
    this.bloomTargetA = new THREE.WebGLRenderTarget(1, 1, { ...options, depthBuffer: false });
    this.bloomTargetB = new THREE.WebGLRenderTarget(1, 1, { ...options, depthBuffer: false });

    this.blurMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uSource: { value: null },
        uDirection: { value: new THREE.Vector2() },
        uThreshold: { value: 0.44 },
        uExtract: { value: 1 },
      },
      vertexShader: quadVertexShader,
      fragmentShader: brightBlurFragmentShader,
      depthTest: false,
      depthWrite: false,
    });

    this.compositeMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uScene: { value: this.sceneTarget.texture },
        uBloom: { value: this.bloomTargetB.texture },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uTime: { value: 0 },
        uShock: { value: 0 },
        uBloomStrength: { value: 1 },
        uAberration: { value: 0 },
        uGrain: { value: 0 },
      },
      vertexShader: quadVertexShader,
      fragmentShader: compositeFragmentShader,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });

    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.compositeMaterial);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
  }

  setSize(width: number, height: number): void {
    if (this.size.x === width && this.size.y === height) return;
    this.size.set(width, height);
    this.sceneTarget.setSize(width, height);
    const bloomWidth = Math.max(1, Math.floor(width / BLOOM_DIVISOR));
    const bloomHeight = Math.max(1, Math.floor(height / BLOOM_DIVISOR));
    this.bloomTargetA.setSize(bloomWidth, bloomHeight);
    this.bloomTargetB.setSize(bloomWidth, bloomHeight);
    (this.compositeMaterial.uniforms.uResolution!.value as THREE.Vector2).set(width, height);
  }

  render(scene: THREE.Scene, camera: THREE.Camera, state: CompositeState): void {
    const renderer = this.renderer;

    renderer.setRenderTarget(this.sceneTarget);
    renderer.clear();
    renderer.render(scene, camera);

    const bloomWidth = this.bloomTargetA.width;
    const bloomHeight = this.bloomTargetA.height;

    this.quad.material = this.blurMaterial;
    const uniforms = this.blurMaterial.uniforms;

    uniforms.uSource!.value = this.sceneTarget.texture;
    uniforms.uExtract!.value = 1;
    (uniforms.uDirection!.value as THREE.Vector2).set(1 / bloomWidth, 0);
    renderer.setRenderTarget(this.bloomTargetA);
    renderer.clear();
    renderer.render(this.quadScene, this.quadCamera);

    uniforms.uSource!.value = this.bloomTargetA.texture;
    uniforms.uExtract!.value = 0;
    (uniforms.uDirection!.value as THREE.Vector2).set(0, 1 / bloomHeight);
    renderer.setRenderTarget(this.bloomTargetB);
    renderer.clear();
    renderer.render(this.quadScene, this.quadCamera);

    this.quad.material = this.compositeMaterial;
    const composite = this.compositeMaterial.uniforms;
    composite.uTime!.value = state.time;
    composite.uShock!.value = state.shock;
    composite.uBloomStrength!.value = state.bloom;
    composite.uAberration!.value = state.aberration;
    composite.uGrain!.value = state.grain;

    renderer.setRenderTarget(null);
    renderer.render(this.quadScene, this.quadCamera);
  }

  dispose(): void {
    this.sceneTarget.dispose();
    this.bloomTargetA.dispose();
    this.bloomTargetB.dispose();
    this.blurMaterial.dispose();
    this.compositeMaterial.dispose();
    this.quad.geometry.dispose();
  }
}
