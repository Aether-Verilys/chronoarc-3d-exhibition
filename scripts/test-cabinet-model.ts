import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { prepareCabinetModel } from '../src/three/CabinetModel';

const openingBounds = [
  new THREE.Box3(new THREE.Vector3(-0.18, 0.40, 0.003), new THREE.Vector3(-0.046, 0.46, 0.137)),
  new THREE.Box3(new THREE.Vector3(-0.188, 0.083, 0.10), new THREE.Vector3(-0.039, 0.229, 0.23)),
];

async function machineWithoutTextures() {
  const original = await readFile(new URL('../public/models/claw-machine/machine.glb', import.meta.url));
  let json: Record<string, any> | undefined;
  let binary: Buffer | undefined;
  for (let offset = 12; offset < original.length;) {
    const length = original.readUInt32LE(offset);
    const type = original.readUInt32LE(offset + 4);
    const chunk = original.subarray(offset + 8, offset + 8 + length);
    if (type === 0x4e4f534a) json = JSON.parse(chunk.toString());
    if (type === 0x004e4942) binary = chunk;
    offset += 8 + length;
  }
  assert.ok(json && binary);
  // Keep the actual geometry/material properties while avoiding browser image
  // decoding in this CPU-only GLTFLoader test.
  delete json.images;
  delete json.textures;
  delete json.samplers;
  for (const material of json.materials ?? []) {
    if (material.pbrMetallicRoughness) delete material.pbrMetallicRoughness.baseColorTexture;
  }
  const text = JSON.stringify(json);
  const jsonChunk = Buffer.from(text.padEnd(Math.ceil(Buffer.byteLength(text) / 4) * 4, ' '));
  const glb = Buffer.alloc(12 + 8 + jsonChunk.length + 8 + binary.length);
  glb.writeUInt32LE(0x46546c67, 0);
  glb.writeUInt32LE(2, 4);
  glb.writeUInt32LE(glb.length, 8);
  glb.writeUInt32LE(jsonChunk.length, 12);
  glb.writeUInt32LE(0x4e4f534a, 16);
  jsonChunk.copy(glb, 20);
  glb.writeUInt32LE(binary.length, 20 + jsonChunk.length);
  glb.writeUInt32LE(0x004e4942, 24 + jsonChunk.length);
  binary.copy(glb, 28 + jsonChunk.length);
  const result = await new GLTFLoader().parseAsync(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength), '');
  return { source: result.scene, original };
}

function meshList(root: THREE.Group) {
  const result: THREE.Mesh[] = [];
  root.traverse(object => { if (object instanceof THREE.Mesh) result.push(object); });
  return result;
}

function triangleAt(geometry: THREE.BufferGeometry, offset: number) {
  const position = geometry.getAttribute('position');
  return [0, 1, 2].map(corner => new THREE.Vector3().fromBufferAttribute(position, geometry.index ? geometry.index.getX(offset + corner) : offset + corner));
}

function meshArea(geometry: THREE.BufferGeometry) {
  let area = 0;
  const count = geometry.index?.count ?? geometry.getAttribute('position').count;
  for (let offset = 0; offset < count; offset += 3) {
    const [a, b, c] = triangleAt(geometry, offset);
    area += b.sub(a).cross(c.sub(a)).length() / 2;
  }
  return area;
}

test('imported cabinet gets precise openings without mutating source GLB or shared material', async () => {
  const { source, original } = await machineWithoutTextures();
  const beforeMeshes = meshList(source);
  const snapshots = beforeMeshes.map(mesh => ({
    geometry: mesh.geometry,
    material: mesh.material,
    position: Array.from(mesh.geometry.getAttribute('position').array),
    index: Array.from(mesh.geometry.index!.array),
    uv: Array.from(mesh.geometry.getAttribute('uv').array),
  }));
  const prepared = prepareCabinetModel(source);
  assert.equal(prepared.name, 'ImportedMachine');
  assert.deepEqual(prepared.scale.toArray(), [7.4, 7.4, 7.4]);
  assert.equal(prepared.position.y, -1.55);
  const afterMeshes = meshList(prepared);
  assert.equal(afterMeshes.length, beforeMeshes.length);
  for (let i = 0; i < afterMeshes.length; i++) {
    const current = afterMeshes[i];
    const snapshot = snapshots[i];
    assert.notEqual(current.geometry, snapshot.geometry);
    assert.equal(current.material, snapshot.material);
    assert.equal(current.castShadow, true);
    assert.equal(current.receiveShadow, true);
    assert.deepEqual(Object.keys(current.geometry.attributes), Object.keys(snapshot.geometry.attributes));
    for (const [name, attribute] of Object.entries(current.geometry.attributes)) {
      assert.equal(attribute.itemSize, snapshot.geometry.getAttribute(name).itemSize);
      assert.equal(attribute.count, current.geometry.getAttribute('position').count);
      assert.ok(Array.from(attribute.array).every(Number.isFinite), `${name} must be finite`);
    }
    for (let offset = 0; offset < current.geometry.getAttribute('position').count; offset += 3) {
      const points = triangleAt(current.geometry, offset);
      const center = points.reduce((sum, point) => sum.add(point), new THREE.Vector3()).multiplyScalar(1 / 3);
      assert.ok(!openingBounds.some(box => box.clone().expandByScalar(-1e-6).containsPoint(center)), 'no triangle can remain inside an opening');
    }
    assert.ok(meshArea(current.geometry) < meshArea(snapshot.geometry));
    assert.ok(meshArea(current.geometry) > meshArea(snapshot.geometry) * 0.95, 'only the two openings should be removed');
    assert.equal(beforeMeshes[i].geometry, snapshot.geometry);
    assert.deepEqual(Array.from(snapshot.geometry.getAttribute('position').array), snapshot.position);
    assert.deepEqual(Array.from(snapshot.geometry.index!.array), snapshot.index);
    assert.deepEqual(Array.from(snapshot.geometry.getAttribute('uv').array), snapshot.uv);
  }
  assert.deepEqual(await readFile(new URL('../public/models/claw-machine/machine.glb', import.meta.url)), original);
});

test('a hole clips across large triangles and interpolates UVs without deleting surrounding floor', () => {
  const geometry = new THREE.BufferGeometry();
  const points = [-0.25, 0.432617, -0.2, 0.25, 0.432617, -0.2, 0.25, 0.432617, 0.2, -0.25, 0.432617, 0.2];
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  geometry.setIndex([0, 2, 1, 0, 3, 2]);
  const source = new THREE.Group();
  source.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial()));
  const cut = meshList(prepareCabinetModel(source))[0].geometry;
  const expected = 0.5 * 0.4 - 0.134 * 0.134;
  assert.ok(Math.abs(meshArea(cut) - expected) < 1e-7, 'precise hole area is subtracted from the two large triangles');
  const position = cut.getAttribute('position');
  const uv = cut.getAttribute('uv');
  for (let i = 0; i < position.count; i++) {
    assert.ok(Math.abs(uv.getX(i) - (position.getX(i) + 0.25) / 0.5) < 1e-6);
    assert.ok(Math.abs(uv.getY(i) - (position.getZ(i) + 0.2) / 0.4) < 1e-6);
  }
  assert.ok(position.count > 6, 'clipping subdivides the large input faces');
});

