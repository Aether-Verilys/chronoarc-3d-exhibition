import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { PrizeDelivery, PRIZE_CHUTE } from '../src/three/PrizeDelivery';

const INITIAL_POSITION = new THREE.Vector3(-1.55, 1.9, 0.95);
const HALF_HEIGHT = 0.26;
const RADIUS = 0.3375;
const WORLD_SCALE = 2;

function delivery(velocity = new THREE.Vector3()) {
  return new PrizeDelivery(INITIAL_POSITION, velocity, HALF_HEIGHT, RADIUS, WORLD_SCALE);
}

function close(actual: number, expected: number, message: string, tolerance = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= tolerance,
    `${message}: expected ${expected}, received ${actual}`);
}

function closeVector(actual: THREE.Vector3, expected: THREE.Vector3, message: string) {
  for (const axis of ['x', 'y', 'z'] as const) close(actual[axis], expected[axis], `${message}.${axis}`);
}

test('release preserves its position and free fall uses 9.8 world units per second squared', () => {
  for (const elapsed of [0.2, 0.5]) {
    const motion = delivery();
    closeVector(motion.position, INITIAL_POSITION, 'release position');
    motion.advance(elapsed);
    assert.equal(motion.phase, 'fall');
    close((INITIAL_POSITION.y - motion.position.y) * WORLD_SCALE,
      0.5 * 9.8 * elapsed ** 2, `world displacement after ${elapsed} seconds`);
    close(motion.velocity.y * WORLD_SCALE, -9.8 * elapsed, 'world vertical velocity');
    close(motion.position.x, INITIAL_POSITION.x, 'no initial sideways kick');
    close(motion.position.z, INITIAL_POSITION.z, 'no initial forward kick');
  }
});

test('a released model retains the claw momentum while gravity accelerates its fall', () => {
  const initialVelocity = new THREE.Vector3(0.12, -0.08, 0.2);
  const motion = delivery(initialVelocity);
  const elapsed = 0.5;
  motion.advance(elapsed);
  assert.equal(motion.phase, 'fall');
  close(motion.position.x, INITIAL_POSITION.x + initialVelocity.x * elapsed, 'lateral inertia');
  close(motion.position.z, INITIAL_POSITION.z + initialVelocity.z * elapsed, 'forward inertia');
  close(motion.position.y, INITIAL_POSITION.y + initialVelocity.y * elapsed
    - 0.5 * 9.8 / WORLD_SCALE * elapsed ** 2, 'vertical inertia and gravity');
  close(motion.velocity.x, initialVelocity.x, 'retained lateral velocity');
  close(motion.velocity.z, initialVelocity.z, 'retained forward velocity');
  closeVector(initialVelocity, new THREE.Vector3(0.12, -0.08, 0.2), 'input velocity is not mutated');
  closeVector(INITIAL_POSITION, new THREE.Vector3(-1.55, 1.9, 0.95), 'input position is not mutated');
});

function sampleJourney(frameDurations: number[]) {
  const motion = delivery(new THREE.Vector3(0.06, 0, 0.04));
  let elapsed = 0;
  let frame = 0;
  return [0.2, 0.5, 1, 1.5, 2, 2.5, 3, 4].map(target => {
    while (elapsed < target - 1e-10) {
      const delta = Math.min(frameDurations[frame++ % frameDurations.length], target - elapsed);
      motion.advance(delta);
      elapsed += delta;
    }
    return { time: target, phase: motion.phase, position: motion.position.clone(), velocity: motion.velocity.clone() };
  });
}

test('the entire delivery trajectory agrees at 30, 60, 120 FPS and with jittering frames', () => {
  const baseline = sampleJourney([1 / 120]);
  for (const frames of [[1 / 30], [1 / 60], [1 / 120], [0.007, 0.021, 0.011, 0.038, 0.016]]) {
    const actual = sampleJourney(frames);
    for (let index = 0; index < baseline.length; index++) {
      const reference = baseline[index];
      assert.equal(actual[index].phase, reference.phase, `phase at ${reference.time} seconds`);
      closeVector(actual[index].position, reference.position, `position at ${reference.time} seconds`);
      closeVector(actual[index].velocity, reference.velocity, `velocity at ${reference.time} seconds`);
    }
    assert.equal(actual.at(-1)?.phase, 'settled');
  }
});

test('the prize falls, slides through the outlet and settles on the tray without teleporting', () => {
  const motion = delivery();
  const transitions: Array<{ phase: string; time: number; position: THREE.Vector3 }> = [];
  const step = 1 / 120;
  for (let frame = 1; frame <= 6 / step && motion.phase !== 'settled'; frame++) {
    const previousPosition = motion.position.clone();
    const previousPhase = motion.phase;
    motion.advance(step);
    assert.ok(motion.position.distanceTo(previousPosition) < 0.06,
      `movement must be continuous at ${frame * step} seconds`);
    assert.ok(Number.isFinite(motion.position.lengthSq()) && Number.isFinite(motion.velocity.lengthSq()));
    if (motion.phase !== previousPhase) transitions.push({
      phase: motion.phase, time: frame * step, position: motion.position.clone(),
    });
  }

  assert.deepEqual(transitions.map(item => item.phase), ['ramp', 'outlet', 'settled']);
  const [ramp, outlet, settled] = transitions;
  assert.ok(ramp.time > 0.8 && ramp.time < 1.2, 'the visible fall must take a plausible amount of time');
  assert.ok(outlet.position.z >= PRIZE_CHUTE.outletZ, 'the model must pass the lower cabinet outlet');
  assert.ok(outlet.time > ramp.time, 'the chute slide must have a nonzero duration');
  assert.ok(settled.time > 2 && settled.time < 5, 'a full delivery should take a few seconds');
  close(motion.position.y - HALF_HEIGHT, PRIZE_CHUTE.trayFloorY, 'model rests on the tray');
  assert.ok(motion.position.z >= PRIZE_CHUTE.trayBackZ);
  assert.ok(motion.position.z <= PRIZE_CHUTE.trayFrontZ - RADIUS);
  assert.ok(Math.abs(motion.position.x - PRIZE_CHUTE.x) <= 0.95 - RADIUS);
  closeVector(motion.velocity, new THREE.Vector3(), 'settled velocity');

  const rest = motion.position.clone();
  motion.advance(2);
  assert.equal(motion.phase, 'settled');
  closeVector(motion.position, rest, 'settled position remains stable');
});
