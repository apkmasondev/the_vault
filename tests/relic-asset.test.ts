import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Mesh, Vector3, type BufferGeometry } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

describe('Blender delivery asset', () => {
  it('loads locally with finite geometry and twenty paired armor / inlay segments', async () => {
    const bytes = readFileSync(new URL('../public/media/vault-relic.glb', import.meta.url));
    expect(bytes.byteLength).toBeLessThan(200_000);
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const gltf = await new GLTFLoader().parseAsync(buffer, '');
    gltf.scene.updateMatrixWorld(true);
    const plates: string[] = [];
    const circuits: string[] = [];
    gltf.scene.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const geometry = (object as Mesh<BufferGeometry>).geometry;
      const positions = geometry.getAttribute('position');
      const center = new Vector3().setFromMatrixPosition(object.matrixWorld);
      expect(center.length()).toBeGreaterThan(.7);
      expect(center.length()).toBeLessThan(1);
      for (let i = 0; i < positions.count; i += 1) {
        const vertex = new Vector3().fromBufferAttribute(positions, i).applyMatrix4(object.matrixWorld);
        expect(Number.isFinite(vertex.length())).toBe(true);
        expect(vertex.length()).toBeLessThan(1.1);
      }
      if (object.name.startsWith('Armor_')) plates.push(object.name);
      if (object.name.startsWith('Circuit_')) circuits.push(object.name);
      geometry.dispose();
    });
    expect(plates).toHaveLength(20);
    expect(circuits).toHaveLength(20);
  });
});
