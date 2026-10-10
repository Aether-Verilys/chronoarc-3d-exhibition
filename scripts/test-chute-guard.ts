import assert from 'node:assert/strict';
import test from 'node:test';
import { CyberPhysics } from '../src/three/CyberPhysics';
import { createPrizeSpawnLayout, MACHINE_LAYOUT, MACHINE_MODEL } from '../src/three/ClawMachineLayout';

// These are measurements of the opening in machine.glb, independent of the
// guard descriptors used to build its visible meshes and collision boxes.
const scale = MACHINE_MODEL.scale * MACHINE_LAYOUT.worldScale;
const opening = { minX: -0.18 * scale, maxX: -0.046 * scale, minZ: 0.003 * scale, maxZ: 0.137 * scale };
const floorY = MACHINE_LAYOUT.worldY + MACHINE_LAYOUT.floorY * MACHINE_LAYOUT.worldScale;
const delta = 1 / 120;
const cabinet = {
  halfWidth: MACHINE_LAYOUT.halfWidth * MACHINE_LAYOUT.worldScale,
  backZ: MACHINE_LAYOUT.backZ * MACHINE_LAYOUT.worldScale,
  frontZ: MACHINE_LAYOUT.frontZ * MACHINE_LAYOUT.worldScale,
};

function seededRandom(seed: number) {
  return () => {
    seed |= 0;
    seed = seed + 0x6D2B79F5 | 0;
    let value = Math.imul(seed ^ seed >>> 15, 1 | seed);
    value ^= value + Math.imul(value ^ value >>> 7, 61 | value);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function testInitialFill(radii: number[], seed: number, random = seededRandom(seed)) {
  const physics = new CyberPhysics();
  const spawns = createPrizeSpawnLayout(radii, random);
  const prizes = radii.map((radius, index) => {
    const body = physics.sphere(radius);
    const spawn = spawns[index];
    body.position.set(spawn.x, spawn.y, spawn.z);
    body.velocity.set(...spawn.velocity);
    body.angularVelocity.set(...spawn.angularVelocity);
    assert.ok(spawn.x - radius > -cabinet.halfWidth && spawn.x + radius < cabinet.halfWidth, `Prize ${index} starts inside the cabinet sides`);
    assert.ok(spawn.z - radius > cabinet.backZ && spawn.z + radius < cabinet.frontZ, `Prize ${index} starts inside the cabinet front/back`);
    return { body, radius };
  });

  for (let a = 0; a < prizes.length; a++) {
    for (let b = a + 1; b < prizes.length; b++) {
      assert.ok(prizes[a].body.position.distanceTo(prizes[b].body.position) > prizes[a].radius + prizes[b].radius, `Spawn pair ${a}/${b} must not overlap`);
    }
  }

  let restingFrames = 0;
  for (let frame = 0; frame < 30 / delta; frame++) {
    physics.step(delta);
    let allResting = true;
    for (const [index, { body, radius }] of prizes.entries()) {
      const { x, y, z } = body.position;
      const dx = x - Math.max(opening.minX, Math.min(opening.maxX, x));
      const dz = z - Math.max(opening.minZ, Math.min(opening.maxZ, z));
      assert.ok(Math.hypot(dx, dz) >= radius - 0.01, `Prize ${index} enters the reserved opening at ${frame * delta}s seed ${seed}, ${Math.hypot(dx, dz) - radius}m penetration, bottom ${y - radius - floorY}`);
      assert.ok(x - radius >= -cabinet.halfWidth - 0.01 && x + radius <= cabinet.halfWidth + 0.01, `Prize ${index} escapes a cabinet side`);
      assert.ok(z - radius >= cabinet.backZ - 0.01 && z + radius <= cabinet.frontZ + 0.01, `Prize ${index} escapes the cabinet front/back at ${frame * delta}: ${z - radius}, ${z + radius}`);
      assert.ok(y >= floorY + radius - 0.04, `Prize ${index} falls through the cabinet floor`);
      allResting &&= body.velocity.length() < 0.02;
    }
    restingFrames = allResting ? restingFrames + 1 : 0;
  }
  for (const [index, { body, radius }] of prizes.entries()) {
    const { x, z } = body.position;
    const dx = x - Math.max(opening.minX, Math.min(opening.maxX, x));
    const dz = z - Math.max(opening.minZ, Math.min(opening.maxZ, z));
    assert.ok(Math.hypot(dx, dz) >= radius - 0.01, `Prize ${index} rests across the opening in seed ${seed}`);
  }
  assert.ok(restingFrames * delta >= 10, `All eighteen prizes remain settled for at least ten continuous seconds (seed ${seed}, settled ${restingFrames * delta}s)`);
  physics.dispose();
}

function testFourSolidWalls() {
  const centerX = (opening.minX + opening.maxX) / 2;
  const centerZ = (opening.minZ + opening.maxZ) / 2;
  // A rolling ball inside the enclosure exercises each wall without relying
  // on the limited space between the enclosure and the cabinet's left wall.
  for (const [vx, vz] of [[4, 0], [-4, 0], [0, 4], [0, -4]]) {
    const physics = new CyberPhysics();
    const radius = 0.35;
    const body = physics.sphere(radius);
    body.position.set(centerX, floorY + radius, centerZ);
    body.velocity.set(vx, 0, vz);
    body.angularVelocity.set(vz / radius, 0, -vx / radius);
    let approach = 0;
    for (let frame = 0; frame < 3 / delta; frame++) {
      physics.step(delta);
      const { x, y, z } = body.position;
      approach = Math.max(approach, ((x - centerX) * vx + (z - centerZ) * vz) / 4);
      // Cannon resolves contacts with a small penetration at the fixed step;
      // 8 mm is below the 50 mm wall thickness and cannot admit the sphere center.
      assert.ok(x - radius >= opening.minX - 0.008 && x + radius <= opening.maxX + 0.008, 'The rolling prize crosses a side wall');
      assert.ok(z - radius >= opening.minZ - 0.008 && z + radius <= opening.maxZ + 0.008, 'The rolling prize crosses a front/back wall');
      assert.ok(y >= floorY + radius - 0.005, 'The floor below the opening must remain solid');
    }
    assert.ok(approach > 0.6, 'The rolling prize reaches the wall before settling');
    physics.dispose();
  }
}

function testExteriorEntryBlocked() {
  for (const side of ['right', 'back'] as const) {
    const physics = new CyberPhysics();
    const radius = 0.55;
    const body = physics.sphere(radius);
    body.position.set(side === 'right' ? 1 : (opening.minX + opening.maxX) / 2, floorY + radius, side === 'back' ? -1.3 : (opening.minZ + opening.maxZ) / 2);
    body.velocity.set(side === 'right' ? -4 : 0, 0, side === 'back' ? 4 : 0);
    body.angularVelocity.set(side === 'back' ? 4 / radius : 0, 0, side === 'right' ? 4 / radius : 0);
    let reachedGuard = false;
    for (let frame = 0; frame < 3 / delta; frame++) {
      physics.step(delta);
      if (side === 'right') {
        assert.ok(body.position.x - radius > opening.maxX, 'The exterior prize enters the opening through the right wall');
        reachedGuard ||= body.position.x - radius < opening.maxX + 0.14;
      } else {
        assert.ok(body.position.z + radius < opening.minZ, 'The exterior prize enters the opening through the back wall');
        reachedGuard ||= body.position.z + radius > opening.minZ - 0.14;
      }
    }
    assert.ok(reachedGuard, `The rolling prize reaches the outside of the ${side} wall`);
    physics.dispose();
  }
}

test('randomized maximum-radius fills settle outside the opening across forty seeds', () => {
  for (let seed = 1; seed <= 40; seed++) testInitialFill(Array.from({ length: 18 }, () => 0.55), seed);
});

test('randomized mixed-radius fills settle outside the opening across forty seeds', () => {
  for (let seed = 1; seed <= 40; seed++) testInitialFill(Array.from({ length: 18 }, (_, index) => [0.31, 0.38, 0.45, 0.53, 0.55][index % 5]), seed);
});

test('all four guard walls contain a rolling prize', testFourSolidWalls);

test('the guard blocks rolling prizes approaching from outside', testExteriorEntryBlocked);


test('each initialization changes positions, drop heights and orientation', () => {
  const radii = Array.from({ length: 18 }, () => 0.525);
  const first = createPrizeSpawnLayout(radii, seededRandom(101));
  const second = createPrizeSpawnLayout(radii, seededRandom(202));
  assert.ok(first.every((spawn, index) => Math.hypot(spawn.x - second[index].x, spawn.z - second[index].z) > 0.1));
  assert.ok(Math.max(...first.map(spawn => spawn.y)) - Math.min(...first.map(spawn => spawn.y)) > 0.3);
  assert.ok(new Set(first.map(spawn => Math.round(spawn.yaw * 10))).size >= 12);
  assert.ok(first.some(spawn => Math.hypot(spawn.velocity[0], spawn.velocity[2]) > 0.04));
});

test('a degenerate random source still initializes a safe eighteen-prize fill', () => {
  testInitialFill(Array.from({ length: 18 }, () => 0.55), 0, () => 0.5);
});
