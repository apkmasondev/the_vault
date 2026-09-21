import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { asset } from '../app/constants';

const vertexShader = /* glsl */ `
  uniform float uOpen;
  uniform float uShatter;
  uniform float uCharge;
  uniform float uTime;
  attribute vec3 aCenter;
  varying vec3 vNormal;
  varying vec3 vWorld;
  varying vec3 vLocal;
  void main() {
    float plate = step(0.01, length(aCenter));
    vec3 axis = normalize(aCenter + vec3(0.0001)) * plate;
    float seed = fract(dot(aCenter, vec3(13.7, 39.3, 7.1)));
    vec3 p = position;
    vec3 local = p - aCenter;
    float angle = (uOpen * 0.24 + uShatter * (3.0 + seed * 6.0)) * plate;
    local = local * cos(angle) + cross(axis, local) * sin(angle)
      + axis * dot(axis, local) * (1.0 - cos(angle));
    p = aCenter + local + axis * (uOpen * 0.52 + uCharge * 0.065
      + uShatter * (1.5 + seed * 2.0));
    p.y -= uShatter * uShatter * 2.3;
    vec4 world = modelMatrix * vec4(p, 1.0);
    vWorld = world.xyz;
    vLocal = position;
    vNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uReveal;
  uniform float uCharge;
  uniform float uHeat;
  uniform float uShatter;
  uniform float uOpen;
  uniform float uEmission;
  varying vec3 vNormal;
  varying vec3 vWorld;
  varying vec3 vLocal;
  void main() {
    vec3 n = normalize(vNormal);
    vec3 view = normalize(cameraPosition - vWorld);
    vec3 key = normalize(vec3(-1.8, 2.2, 3.0));
    vec3 rim = normalize(vec3(2.0, -0.2, -1.0));
    float diffuse = max(dot(n, key), 0.0);
    float spec = pow(max(dot(n, normalize(key + view)), 0.0), 55.0);
    float edge = pow(1.0 - abs(dot(n, view)), 3.0);
    float grain = fract(sin(dot(floor(vLocal * 460.0), vec3(12.9,78.2,37.7))) * 43758.5);
    vec3 amber = mix(vec3(1.0, 0.55, 0.16), vec3(1.0, 0.15, 0.045), uHeat);
    vec3 metal = vec3(0.075, 0.095, 0.105) * (0.45 + diffuse * 1.6 + grain * 0.11);
    metal += vec3(0.62, 0.78, 0.85) * spec * 0.7;
    metal += amber * (edge * 0.32 + pow(max(dot(n, rim), 0.0), 3.0) * 0.18);
    float signal = 0.75 + 0.25 * sin(vLocal.y * 18.0 - uTime * 2.0);
    vec3 lit = amber * (1.1 + uCharge * 2.0 + uOpen * 0.55) * signal;
    vec3 color = mix(metal, lit, uEmission);
    color += amber * uHeat * edge * 0.6;
    float alpha = uReveal * (1.0 - smoothstep(0.25, 1.0, uShatter));
    gl_FragColor = vec4(color, alpha);
  }
`;

/** Authored geometry, with two batched shell draws and three moving gimbals. */
export class RelicAssembly {
  readonly group = new THREE.Group();
  ready = false;
  private disposed = false;
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.ShaderMaterial[] = [];
  private readonly rings: THREE.Group[] = [];
  private readonly uniforms = {
    uTime: { value: 0 }, uReveal: { value: 0 }, uCharge: { value: 0 },
    uHeat: { value: 0 }, uShatter: { value: 0 }, uOpen: { value: 0 },
  };

  constructor() {
    void this.load();
  }

  private material(emission: number): THREE.ShaderMaterial {
    const material = new THREE.ShaderMaterial({
      uniforms: { ...this.uniforms, uEmission: { value: emission } },
      vertexShader, fragmentShader, transparent: true,
      side: THREE.DoubleSide, depthWrite: true,
    });
    this.materials.push(material);
    return material;
  }

  private async load(): Promise<void> {
    try {
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
      if (this.disposed) return;
      const gltf = await new GLTFLoader().loadAsync(asset('media/vault-relic.glb'));
      const armor: THREE.BufferGeometry[] = [];
      const circuits: THREE.BufferGeometry[] = [];
      gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const mesh = object as THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>;
        if (!this.disposed) {
          const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
          geometry.applyMatrix4(object.matrixWorld);
          // Only common attributes belong in the merged batches.
          for (const name of Object.keys(geometry.attributes)) {
            if (name !== 'position' && name !== 'normal') geometry.deleteAttribute(name);
          }
          const center = new THREE.Vector3().setFromMatrixPosition(object.matrixWorld);
          const centers = new Float32Array(geometry.getAttribute('position').count * 3);
          for (let i = 0; i < centers.length; i += 3) center.toArray(centers, i);
          geometry.setAttribute('aCenter', new THREE.BufferAttribute(centers, 3));
          (object.name.startsWith('Circuit') ? circuits : armor).push(geometry);
        }
        mesh.geometry.dispose();
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        materials.forEach((material) => material.dispose());
      });
      if (this.disposed) return;
      for (const [index, batch] of [armor, circuits].entries()) {
        const geometry = mergeGeometries(batch);
        batch.forEach((part) => part.dispose());
        if (!geometry) throw new Error('Invalid relic geometry');
        this.geometries.push(geometry);
        const mesh = new THREE.Mesh(geometry, this.material(index));
        mesh.frustumCulled = false;
        this.group.add(mesh);
      }
      const metal = this.material(0);
      const light = this.material(1);
      for (let i = 0; i < 3; i += 1) {
        const ring = new THREE.Group();
        for (const [radius, tube, mat] of [[1.06 + i * .075, .018, metal], [1.06 + i * .075, .006, light]] as const) {
          const geometry = new THREE.TorusGeometry(radius, tube, 6, 96, Math.PI * 1.76);
          geometry.setAttribute('aCenter', new THREE.BufferAttribute(new Float32Array(geometry.getAttribute('position').count * 3), 3));
          this.geometries.push(geometry);
          const mesh = new THREE.Mesh(geometry, mat);
          if (mat === light) mesh.position.z = .019;
          ring.add(mesh);
        }
        this.rings.push(ring);
        this.group.add(ring);
      }
      this.createFilaments();
      this.ready = true;
    } catch {
      // The original live core remains the complete fallback for a missing GLB.
      this.group.clear();
      this.geometries.forEach((geometry) => geometry.dispose());
      this.materials.forEach((material) => material.dispose());
    }
  }

  private createFilaments(): void {
    const positions: number[] = [];
    const phases: number[] = [];
    for (let arm = 0; arm < 9; arm += 1) {
      const y = 1 - (arm + 0.5) / 9 * 2;
      const angle = arm * 2.39996;
      const direction = new THREE.Vector3(Math.cos(angle) * Math.sqrt(1 - y * y), y,
        Math.sin(angle) * Math.sqrt(1 - y * y));
      for (let segment = 0; segment < 28; segment += 1) {
        for (const t of [segment / 28, (segment + 1) / 28]) {
          positions.push(direction.x * t, direction.y * t, direction.z * t);
          phases.push(arm);
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('aPhase', new THREE.Float32BufferAttribute(phases, 1));
    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        uniform float uTime;
        uniform float uOpen;
        uniform float uCharge;
        attribute float aPhase;
        varying float vStrength;
        void main() {
          float t = length(position);
          vec3 direction = position / max(t, 0.001);
          vec3 side = normalize(cross(direction + vec3(0.0001), vec3(0.3, 1.0, 0.2)));
          float wave = sin(t * 37.0 + uTime * 13.0 + aPhase * 2.0)
            * sin(t * 19.0 - uTime * 7.0 + aPhase);
          vec3 p = direction * (0.36 + t * (0.43 + uOpen * 0.48));
          p += side * wave * sin(t * 3.14159) * (0.045 + uCharge * 0.06);
          vStrength = (0.55 + 0.45 * sin(uTime * 4.0 + aPhase)) * sin(t * 3.14159);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uReveal;
        uniform float uOpen;
        uniform float uCharge;
        uniform float uShatter;
        varying float vStrength;
        void main() {
          float alpha = uReveal * min(1.0, uOpen + uCharge) * vStrength * (1.0 - uShatter);
          gl_FragColor = vec4(1.0, 0.72, 0.32, alpha);
        }
      `,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.geometries.push(geometry);
    this.materials.push(material);
    const lines = new THREE.LineSegments(geometry, material);
    lines.frustumCulled = false;
    this.group.add(lines);
  }

  update(time: number, reveal: number, charge: number, heat: number, shatter: number, open: number): void {
    this.uniforms.uTime.value = time;
    this.uniforms.uReveal.value = reveal;
    this.uniforms.uCharge.value = charge;
    this.uniforms.uHeat.value = heat;
    this.uniforms.uShatter.value = shatter;
    this.uniforms.uOpen.value = open;
    this.rings.forEach((ring, i) => {
      const direction = i % 2 ? -1 : 1;
      ring.rotation.set(.65 + i * .8 + Math.sin(time * .18 + i) * .2,
        time * (.13 + i * .045) * direction, time * .08 * direction + i * 1.1);
      ring.scale.setScalar(1 + open * .28 + charge * .08 + shatter * 2);
    });
  }

  dispose(): void {
    this.disposed = true;
    this.geometries.forEach((geometry) => geometry.dispose());
    this.materials.forEach((material) => material.dispose());
    this.group.clear();
  }
}
