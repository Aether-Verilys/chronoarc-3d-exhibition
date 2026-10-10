import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CyberGallery } from '../src/three/CyberGallery';
import { SceneManager } from '../src/three/SceneManager';
import { MACHINE_LAYOUT, MACHINE_OUTLET } from '../src/three/ClawMachineLayout';
import { createClawModel } from '../src/three/ClawModel';
import type { CollectedPrize } from '../src/types/prizes';

// Exercise the actual state transitions without allocating a WebGL context.
// The scene, prize groups and delivery positions remain real Three.js objects.
function galleryHarness() {
  const received: CollectedPrize[] = [];
  const interactive = new THREE.Group();
  const clawGroup = new THREE.Group();
  clawGroup.position.y = MACHINE_LAYOUT.worldY;
  clawGroup.scale.setScalar(MACHINE_LAYOUT.worldScale);
  const gallery = Object.assign(Object.create(CyberGallery.prototype), {
    physicsDisposed: false,
    interactive,
    collectedPrizes: new Map<string, CollectedPrize>(),
    clawGroup,
    clawState: 'ready',
    clawStateTime: 0,
    clawHeld: null,
    clawDeliveries: [],
    clawPrizesOnTray: [],
    clawChute: new THREE.Vector2(MACHINE_LAYOUT.chuteX, MACHINE_LAYOUT.chuteZ),
    clawKeys: new Set(),
    clawX: MACHINE_LAYOUT.chuteX, clawZ: MACHINE_LAYOUT.chuteZ,
    clawY: MACHINE_LAYOUT.clawTopY, clawVx: 0, clawVz: 0,
    clawHeadPosition: new THREE.Vector3(MACHINE_LAYOUT.chuteX,
      MACHINE_LAYOUT.clawTopY, MACHINE_LAYOUT.chuteZ),
    clawHeadVelocity: new THREE.Vector3(),
    clawOpen: 1, clawOpenTarget: 1, clawProngs: [],
    bodies: new Map(),
    physics: { world: { removeBody() {} } },
    onPrizeCollected(prize: CollectedPrize) {
      assert.equal(interactive.children.some(model => model.uuid === prize.id), false,
        'a prize must leave the scene before the backpack receives it');
      received.push(prize);
    },
  });
  const addPrize = (prizeId = 'burger') => {
    const model = new THREE.Group();
    const size = MACHINE_LAYOUT.prizeSize;
    model.add(new THREE.Mesh(new THREE.BoxGeometry(size, size, size)));
    model.position.set(MACHINE_LAYOUT.chuteX,
      MACHINE_LAYOUT.clawTopY - MACHINE_LAYOUT.holdOffset, MACHINE_LAYOUT.chuteZ)
      .multiplyScalar(MACHINE_LAYOUT.worldScale).add(clawGroup.position);
    model.userData.prizeId = prizeId;
    interactive.add(model);
    gallery.bodies.set(model, {
      body: { position: new THREE.Vector3(), velocity: { setZero() {} } },
      offset: new THREE.Vector3(),
    });
    return model;
  };
  const release = (model: THREE.Object3D) => {
    gallery.clawHeld = model;
    gallery.clawState = 'release';
    gallery.clawStateTime = 0;
    gallery.updateClaw(0.02);
  };
  const advance = (duration: number) => {
    for (let i = 0; i < Math.round(duration * 120); i++) gallery.updateClaw(1 / 120);
  };
  const until = (predicate: () => boolean) => {
    for (let frame = 0; frame < 120 * 12 && !predicate(); frame++) gallery.updateClaw(1 / 120);
    assert.ok(predicate(), 'delivery should complete within 12 simulated seconds');
  };
  return { gallery, received, addPrize, release, interactive, advance, until };
}

test('delivery enters the backpack only after its visible tray stay ends', () => {
  const { gallery, received, addPrize, release, interactive, advance, until } = galleryHarness();
  const prize = addPrize();
  release(prize);
  assert.equal(received.length, 0);
  assert.equal(prize.parent, interactive);
  assert.equal(gallery.bodies.has(prize), false);

  until(() => gallery.clawPrizesOnTray.length === 1);
  assert.equal(received.length, 0);
  assert.equal(gallery.clawPrizesOnTray[0].model, prize);
  advance(2.9);
  assert.equal(prize.parent, interactive);
  advance(0.11);
  assert.equal(prize.parent, null);
  assert.deepEqual(received.map(item => item.id), [prize.uuid]);
  assert.equal(received[0].prizeId, 'burger');
  gallery.collectDeliveredPrize(prize);
  assert.equal(received.length, 1, 'duplicate completion cannot duplicate a physical prize');
});

test('overlapping deliveries of the same model retain distinct physical identities', () => {
  const { gallery, received, addPrize, release, advance, until } = galleryHarness();
  const first = addPrize();
  const second = addPrize();
  release(first);
  advance(0.2);
  release(second);
  assert.equal(gallery.clawDeliveries.length, 2, 'a second release must not overwrite a falling prize');
  until(() => gallery.clawPrizesOnTray.length === 2);
  assert.equal(gallery.clawPrizesOnTray.length, 2);
  assert.equal(received.length, 0);
  until(() => received.length === 2);
  assert.equal(gallery.clawPrizesOnTray.length, 0);
  assert.deepEqual(new Set(received.map(item => item.id)), new Set([first.uuid, second.uuid]));
  assert.equal(first.parent, null);
  assert.equal(second.parent, null);
});

test('the imported five-finger claw returns, releases and visibly delivers through the left door', async () => {
  const file = await readFile(new URL('../public/models/claw-machine/claw.glb', import.meta.url));
  const jsonLength = file.readUInt32LE(12);
  const json = JSON.parse(file.subarray(20, 20 + jsonLength).toString());
  for (const mesh of json.meshes) for (const primitive of mesh.primitives) delete primitive.material;
  for (const key of ['materials', 'textures', 'images', 'samplers']) delete json[key];
  const jsonBytes = Buffer.from(JSON.stringify(json));
  const paddedLength = Math.ceil(jsonBytes.length / 4) * 4;
  const binaryChunks = file.subarray(20 + jsonLength);
  const clean = Buffer.alloc(20 + paddedLength + binaryChunks.length, 0x20);
  file.copy(clean, 0, 0, 12);
  clean.writeUInt32LE(clean.length, 8);
  clean.writeUInt32LE(paddedLength, 12);
  clean.writeUInt32LE(0x4e4f534a, 16);
  jsonBytes.copy(clean, 20);
  binaryChunks.copy(clean, 20 + paddedLength);
  const source = (await new GLTFLoader().parseAsync(
    clean.buffer.slice(clean.byteOffset, clean.byteOffset + clean.byteLength), '')).scene;

  const { gallery, received, addPrize, interactive, until } = galleryHarness();
  gallery.clawModel = createClawModel(source, MACHINE_LAYOUT.clawHeight);
  gallery.clawHead = new THREE.Group();
  gallery.clawHead.add(gallery.clawModel.root);
  gallery.clawGroup.add(gallery.clawHead);
  gallery.clawX = 0.9;
  gallery.clawZ = -0.7;
  gallery.clawHeadPosition.set(gallery.clawX, MACHINE_LAYOUT.clawTopY, gallery.clawZ);
  const prize = addPrize();
  gallery.clawHeld = prize;
  gallery.clawState = 'return';
  gallery.clawOpen = 0;
  gallery.clawOpenTarget = 0;

  until(() => gallery.clawDeliveries.length === 1);
  assert.equal(received.length, 0);
  assert.equal(prize.parent, interactive);
  const delivery = gallery.clawDeliveries[0].motion;
  assert.ok(Math.abs(delivery.position.x - MACHINE_LAYOUT.chuteX) < 0.06,
    'the real claw envelope must allow release over the left chute');
  assert.ok(Math.abs(delivery.position.z - MACHINE_LAYOUT.chuteZ) < 0.06);
  until(() => delivery.position.z > MACHINE_OUTLET.frontZ);
  assert.equal(prize.parent, interactive, 'the falling model remains visible while crossing the door');
  assert.equal(received.length, 0);
  until(() => gallery.clawPrizesOnTray.length === 1);
  assert.ok(delivery.position.z - MACHINE_LAYOUT.prizeSize / MACHINE_LAYOUT.worldScale / 2
    > MACHINE_OUTLET.frontZ, 'the entire prize has emerged before its tray stay begins');
  assert.equal(received.length, 0);
  until(() => received.length === 1);
  assert.equal(prize.parent, null);
});

test('release preserves an offset model origin and starts with natural acceleration', () => {
  const { gallery, addPrize, release, advance } = galleryHarness();
  const prize = addPrize();
  prize.children[0].position.set(0.2, -0.3, 0.1);
  prize.rotation.y = 0.8;
  const start = prize.position.clone();
  const orientation = prize.quaternion.clone();
  release(prize);
  assert.ok(prize.position.distanceTo(start) < 1e-10, 'opening the claw cannot move the prize');
  advance(0.2);
  assert.ok(Math.abs(start.y - prize.position.y - 0.5 * 9.8 * 0.2 ** 2) < 1e-9);
  assert.ok(prize.quaternion.angleTo(orientation) < 1e-7, 'free fall must not add artificial spin');
  assert.equal(gallery.clawDeliveries[0].motion.phase, 'fall');
});

test('uncaught scene instances and old catalog IDs cannot open a backpack preview', async () => {
  const { gallery, received, addPrize } = galleryHarness();
  const prize = addPrize();
  gallery.collectDeliveredPrize(prize);
  assert.equal(received.length, 0);
  assert.equal(await gallery.focusPrize(prize.uuid), false);
  assert.equal(await gallery.focusPrize('burger'), false);
});

test('disposing a scene resets inventory and rejects its delayed collection callback', async () => {
  let resetCount = 0;
  let collectionCount = 0;
  const gallery: { resize(): void; ready: Promise<void>; dispose(): void; onPrizeCollected?: (prize: CollectedPrize) => void } = {
    resize() {}, ready: Promise.resolve(), dispose() {},
  };
  const manager = Object.assign(Object.create(SceneManager.prototype), {
    cyberGallery: gallery,
    isDestroyed: false,
    skyEnabled: false,
    renderer: { shadowMap: {} },
    container: { clientWidth: 800, clientHeight: 600 },
    exitModelFocus() {},
    disposeSunsetGallery() {},
    updateShaderUniforms() {},
    onPrizesReset() { resetCount++; },
    onPrizeCollected() { collectionCount++; },
  });
  await manager.setCyberEnabled(true);
  const oldCallback = gallery.onPrizeCollected;
  await manager.setCyberEnabled(false);
  assert.equal(resetCount, 1);
  assert.equal(manager.cyberGallery, null);
  assert.ok(oldCallback);
  oldCallback({ id: 'old-instance', prizeId: 'burger', collectedAt: Date.now() });
  assert.equal(collectionCount, 0);
});
