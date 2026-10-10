import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createClawModel } from '../src/three/ClawModel';
import { CyberGallery } from '../src/three/CyberGallery';
import { CHUTE_GUARD, MACHINE_LAYOUT } from '../src/three/ClawMachineLayout';

// Keep the real asset's node transforms and binary geometry. Textures are not
// needed to test the rig, so omit their material references for Node's loader.
async function loadClaw(): Promise<THREE.Group> {
  const file = await readFile(new URL('../public/models/claw-machine/claw.glb', import.meta.url));
  const jsonLength = file.readUInt32LE(12);
  const json = JSON.parse(file.subarray(20, 20 + jsonLength).toString());
  for (const mesh of json.meshes) {
    for (const primitive of mesh.primitives) delete primitive.material;
  }
  delete json.materials;
  delete json.textures;
  delete json.images;
  delete json.samplers;
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
  const data = clean.buffer.slice(clean.byteOffset, clean.byteOffset + clean.byteLength);
  return (await new GLTFLoader().parseAsync(data, '')).scene;
}

function meshNamed(root: THREE.Object3D, name: string): THREE.Mesh {
  let mesh = root.getObjectByName(name);
  root.traverse(object => {
    if (object.userData.name === name) mesh = object;
  });
  assert.ok(mesh instanceof THREE.Mesh, `missing authored mesh ${name}`);
  return mesh;
}

function vertices(mesh: THREE.Mesh): THREE.Vector3[] {
  mesh.updateWorldMatrix(true, false);
  const positions = mesh.geometry.getAttribute('position');
  return Array.from({ length: positions.count }, (_, index) =>
    new THREE.Vector3().fromBufferAttribute(positions, index).applyMatrix4(mesh.matrixWorld));
}

test('the real exported claw is centred under its mount at the requested height', async () => {
  const source = await loadClaw();
  const { root } = createClawModel(source, 1.1);
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root);
  assert.ok(Math.abs(bounds.max.y) < 1e-7, 'the mounting top is at y=0');
  assert.ok(Math.abs(bounds.min.y + 1.1) < 1e-7, 'the full claw hangs below the mount');
  const centre = new THREE.Box3().setFromObject(meshNamed(root, 'claw.centre')).getCenter(new THREE.Vector3());
  assert.ok(Math.hypot(centre.x, centre.z) < 1e-7, 'the exported x offset is removed');
  for (let i = 1; i <= 5; i += 1) {
    assert.equal(meshNamed(root, `claw${i}`).parent?.name, `claw${i}.pivot`);
  }
});

test('all five fingers rotate inward while the centre and upper mounting joints remain stable', async () => {
  const source = await loadClaw();
  const { root, setOpen } = createClawModel(source, 1.1);
  root.updateMatrixWorld(true);
  const centre = meshNamed(root, 'claw.centre');
  const centreOpen = centre.matrixWorld.clone();
  const fingerOpen = Array.from({ length: 5 }, (_, i) => vertices(meshNamed(root, `claw${i + 1}`)));
  setOpen(0);
  root.updateMatrixWorld(true);
  assert.deepEqual(centre.matrixWorld.elements, centreOpen.elements);
  for (let i = 0; i < 5; i += 1) {
    const open = fingerOpen[i];
    const closed = vertices(meshNamed(root, `claw${i + 1}`));
    const highest = Math.max(...open.map(point => point.y));
    const lowest = Math.min(...open.map(point => point.y));
    const topIndices = open.flatMap((point, index) => point.y >= highest - 0.01 ? [index] : []);
    const tipIndices = open.flatMap((point, index) => point.y <= lowest + 0.02 ? [index] : []);
    const average = (points: THREE.Vector3[], indices: number[]) => indices
      .reduce((sum, index) => sum.add(points[index]), new THREE.Vector3()).multiplyScalar(1 / indices.length);
    const openTip = average(open, tipIndices);
    const closedTip = average(closed, tipIndices);
    assert.ok(Math.hypot(closedTip.x, closedTip.z) < Math.hypot(openTip.x, openTip.z) * 0.65,
      `finger ${i + 1} closes toward the common centre`);
    assert.ok(Math.max(...topIndices.map(index => open[index].distanceTo(closed[index]))) < 0.03,
      `finger ${i + 1} remains connected at its upper joint`);
  }
  setOpen(1);
  root.updateMatrixWorld(true);
  for (let i = 0; i < 5; i += 1) {
    const reopened = vertices(meshNamed(root, `claw${i + 1}`));
    assert.ok(reopened.every((point, index) => point.distanceTo(fingerOpen[i][index]) < 1e-10),
      'opening restores the authored pose without accumulated drift');
  }
});

test('rigging retains shared geometry/materials without modifying the source or producing invalid transforms', async () => {
  const source = await loadClaw();
  source.updateMatrixWorld(true);
  const originalBounds = new THREE.Box3().setFromObject(source);
  const sourceFinger = meshNamed(source, 'claw1');
  const position = sourceFinger.position.clone();
  const { root, setOpen } = createClawModel(source, 1.1);
  const finger = meshNamed(root, 'claw1');
  assert.equal(finger.geometry, sourceFinger.geometry);
  assert.equal(finger.material, sourceFinger.material);
  assert.ok(sourceFinger.position.equals(position));
  assert.equal(sourceFinger.parent, source, 'the source hierarchy is not consumed');
  assert.ok(new THREE.Box3().setFromObject(source).equals(originalBounds));
  for (const amount of [-2, 0, 0.5, 1, 2, NaN, Infinity]) {
    setOpen(amount);
    root.updateMatrixWorld(true);
    root.traverse(object => assert.ok(object.matrixWorld.elements.every(Number.isFinite)));
  }
});

test('cached mounting-point bounds contain every pose, including between sampled opening angles', async () => {
  const { root, bounds, setOpen } = createClawModel(await loadClaw(), 1.1);
  const initialPose = new THREE.Box3().setFromObject(root);
  assert.ok(Math.abs(initialPose.min.y + 1.1) < 1e-7, 'creation leaves the authored open pose');
  assert.ok(bounds.containsBox(initialPose));
  assert.ok(bounds.getSize(new THREE.Vector3()).x > 0.99, 'bounds include the normalization scale');
  const originalBounds = bounds.clone();
  for (let sample = 0; sample <= 137; sample += 1) {
    setOpen(sample / 137);
    assert.ok(bounds.containsBox(new THREE.Box3().setFromObject(root)),
      `the entire mesh remains inside the envelope at opening ${sample / 137}`);
  }
  root.position.set(10, 20, -8);
  root.rotation.set(0.1, 0.3, 0.2);
  root.updateMatrixWorld(true);
  assert.ok(bounds.equals(originalBounds), 'moving the claw does not change mounting-point bounds');
});

test('CyberGallery keeps the real claw inside the glass and clear of chute guards during descent', async () => {
  const source = await loadClaw();
  const clawModel = createClawModel(source, MACHINE_LAYOUT.clawHeight);
  const group = new THREE.Group();
  group.position.y = MACHINE_LAYOUT.worldY;
  group.scale.setScalar(MACHINE_LAYOUT.worldScale);
  const head = new THREE.Group();
  const rail = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  const carriage = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1));
  head.add(clawModel.root);
  group.add(head, rail, carriage, cable);
  group.updateMatrixWorld(true);

  // updateClaw is intentionally exercised through the production prototype:
  // no duplicate movement or bounds math is hidden in this harness.
  const gallery = Object.assign(Object.create(CyberGallery.prototype), {
    clawGroup: group,
    clawHead: head,
    clawRail: rail,
    clawCarriage: carriage,
    clawCable: cable,
    clawModel,
    clawState: 'ready',
    clawStateTime: 0,
    clawY: MACHINE_LAYOUT.clawTopY,
    clawHeadPosition: new THREE.Vector3(0, MACHINE_LAYOUT.clawTopY, 0),
    clawHeadVelocity: new THREE.Vector3(),
    clawX: 0,
    clawZ: 0,
    clawVx: 0,
    clawVz: 0,
    clawOpen: 1,
    clawOpenTarget: 1,
    clawChute: new THREE.Vector2(MACHINE_LAYOUT.chuteX, MACHINE_LAYOUT.chuteZ),
    clawKeys: new Set<string>(),
    clawPrizesOnTray: [],
    clawDeliveries: [],
    clawHeld: null,
    bodies: new Map(),
    physics: { world: { removeBody() {} } },
  }) as CyberGallery & Record<string, any>;

  const interior = new THREE.Box3(
    new THREE.Vector3(
      -MACHINE_LAYOUT.halfWidth,
      MACHINE_LAYOUT.floorY,
      MACHINE_LAYOUT.backZ,
    ),
    new THREE.Vector3(
      MACHINE_LAYOUT.halfWidth,
      MACHINE_LAYOUT.ceilingY,
      MACHINE_LAYOUT.frontZ,
    ),
  );
  const interiorWorld = interior.clone().applyMatrix4(group.matrixWorld);
  const guardWalls = CHUTE_GUARD.walls.map(wall => new THREE.Box3()
    .setFromCenterAndSize(new THREE.Vector3(...wall.position), new THREE.Vector3(...wall.size))
    .applyMatrix4(group.matrixWorld));
  let minimumOpening = 1;
  let lowestTip = Infinity;
  let largestTilt = 0;
  const assertInside = (label: string) => {
    group.updateMatrixWorld(true);
    const actual = new THREE.Box3().setFromObject(clawModel.root);
    assert.ok(actual.min.x >= interiorWorld.min.x - 1e-5, `${label}: left wall`);
    assert.ok(actual.max.x <= interiorWorld.max.x + 1e-5, `${label}: right wall`);
    assert.ok(actual.min.y >= interiorWorld.min.y - 1e-5, `${label}: floor`);
    assert.ok(actual.max.y <= interiorWorld.max.y + 1e-5, `${label}: ceiling`);
    assert.ok(actual.min.z >= interiorWorld.min.z - 1e-5, `${label}: back wall`);
    assert.ok(actual.max.z <= interiorWorld.max.z + 1e-5, `${label}: front wall`);
    for (const [index, wall] of guardWalls.entries()) {
      assert.equal(actual.intersectsBox(wall), false, `${label}: claw geometry clears chute guard ${index}`);
    }
    minimumOpening = Math.min(minimumOpening, gallery['clawOpen']);
    lowestTip = Math.min(lowestTip, actual.min.y);
    largestTilt = Math.max(largestTilt, Math.abs(head.rotation.x), Math.abs(head.rotation.z));
    assert.equal(rail.position.z, carriage.position.z, `${label}: carriage stays on the moving rail`);
  };
  const step = (seconds: number, label: string) => {
    for (let frame = 0; frame < Math.ceil(seconds * 120); frame += 1) {
      (gallery as any).updateClaw(1 / 120);
      assertInside(label);
    }
  };

  // Drive to every edge and corner, then run a real empty grab cycle there.
  // This traverses both opening endpoints, descends to the floor, and raises
  // the claw again without replacing production movement/state logic.
  for (const [name, keys] of [
    ['left', ['KeyA']], ['right', ['KeyD']],
    ['back', ['KeyW']], ['front', ['KeyS']],
    ['back-left', ['KeyA', 'KeyW']], ['back-right', ['KeyD', 'KeyW']],
    ['front-left', ['KeyA', 'KeyS']], ['front-right', ['KeyD', 'KeyS']],
  ] as const) {
    gallery['clawKeys'] = new Set(keys);
    step(2.8, name);
    gallery['clawKeys'].clear();
    gallery['clawState'] = 'down';
    gallery['clawStateTime'] = 0;
    step(4, `${name}-grab-cycle`);
    assert.equal(gallery['clawState'], 'ready', `${name}: the empty grab cycle finishes`);
  }
  assert.ok(minimumOpening < 0.01, 'the movement check includes the nearly closed geometry');
  assert.ok(lowestTip < interiorWorld.min.y + 0.15, 'the claw reaches close to the floor');
  assert.ok(largestTilt > 0.05, 'the movement check includes inertial swing');

  let grabAttempts = 0;
  let collectionAttempts = 0;
  (gallery as any).tryClawGrab = () => { grabAttempts += 1; };
  (gallery as any).collectDeliveredPrize = () => { collectionAttempts += 1; };
  for (const [name, x, z] of [
    ['opening', MACHINE_LAYOUT.chuteX, MACHINE_LAYOUT.chuteZ],
    ['left guard', CHUTE_GUARD.minX, MACHINE_LAYOUT.chuteZ],
    ['right guard', CHUTE_GUARD.maxX, MACHINE_LAYOUT.chuteZ],
    ['rear guard', MACHINE_LAYOUT.chuteX, CHUTE_GUARD.minZ],
    ['front guard', MACHINE_LAYOUT.chuteX, CHUTE_GUARD.maxZ],
  ] as const) {
    gallery['clawX'] = x;
    gallery['clawZ'] = z;
    gallery['clawY'] = MACHINE_LAYOUT.clawTopY;
    gallery['clawVx'] = 0;
    gallery['clawVz'] = 0;
    gallery['clawHeadPosition'].set(x, MACHINE_LAYOUT.clawTopY, z);
    gallery['clawHeadVelocity'].set(0, 0, 0);
    gallery['clawState'] = 'down';
    gallery['clawStateTime'] = 0;
    gallery['clawOpen'] = 1;
    gallery['clawOpenTarget'] = 1;
    let descended = false;
    let raised = false;
    for (let frame = 0; frame < 4 * 120; frame += 1) {
      (gallery as any).updateClaw(1 / 120);
      assertInside(`${name}-blocked-descent`);
      descended ||= gallery['clawHeadPosition'].y < MACHINE_LAYOUT.clawTopY - 0.1;
      raised ||= String(gallery['clawState']) === 'up';
      assert.notEqual(gallery['clawState'], 'grab', `${name}: blocked descent cannot grab through a guard`);
    }
    assert.ok(descended, `${name}: the claw lowers toward the guard`);
    assert.ok(raised, `${name}: the guard aborts the descent and raises the claw`);
    assert.equal(gallery['clawState'], 'ready', `${name}: the blocked cycle finishes`);
    assert.equal(grabAttempts, 0, `${name}: a raised claw cannot remotely pick up a floor prize`);
    assert.equal(collectionAttempts, 0, `${name}: a blocked cycle cannot collect a prize`);
    assert.equal(gallery['clawHeld'], null);
    assert.equal(gallery['clawDeliveries'].length, 0);
    assert.equal(gallery['clawPrizesOnTray'].length, 0);
  }
});
