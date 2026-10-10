import * as THREE from 'three';
import { WORLD_GRAVITY } from './CyberPhysics';
import { CHUTE_GUARD, MACHINE_OUTLET, PRIZE_CHUTE } from './ClawMachineLayout';
export { PRIZE_CHUTE } from './ClawMachineLayout';

const STEP = 1 / 120;
const SLOPE = (PRIZE_CHUTE.outletFloorY - PRIZE_CHUTE.entryFloorY)
  / (PRIZE_CHUTE.outletZ - PRIZE_CHUTE.entryZ);
const RAMP_TANGENT = new THREE.Vector3(0, SLOPE, 1).normalize();

/** Gravity-driven delivery with contacts constrained to the cabinet chute. */
export class PrizeDelivery {
  readonly position: THREE.Vector3;
  readonly velocity: THREE.Vector3;
  phase: 'fall' | 'ramp' | 'outlet' | 'settled' = 'fall';
  private accumulator = 0;
  private quietTime = 0;
  private readonly gravity: number;

  constructor(position: THREE.Vector3, velocity: THREE.Vector3,
    private readonly halfHeight: number, private readonly radius: number, worldScale: number) {
    this.position = position.clone();
    this.velocity = velocity.clone();
    // World units are meters. Scaling the cabinet must not double gravity.
    this.gravity = WORLD_GRAVITY / worldScale;
  }

  advance(delta: number) {
    this.accumulator += delta;
    while (this.accumulator + 1e-10 >= STEP && this.phase !== 'settled') {
      this.step(STEP);
      this.accumulator -= STEP;
    }
  }

  private step(dt: number) {
    const p = this.position, v = this.velocity;
    if (this.phase === 'ramp') {
      // Normal impact loses energy; gravity along the slope drives the slide.
      const acceleration = this.gravity * (-RAMP_TANGENT.y - 0.06 * RAMP_TANGENT.z);
      const speed = Math.max(0, v.dot(RAMP_TANGENT));
      p.addScaledVector(RAMP_TANGENT, speed * dt + 0.5 * acceleration * dt * dt);
      p.x += v.x * dt;
      v.x *= Math.exp(-4 * dt);
      v.y = RAMP_TANGENT.y * (speed + acceleration * dt);
      v.z = RAMP_TANGENT.z * (speed + acceleration * dt);
      if (p.z >= PRIZE_CHUTE.outletZ) this.phase = 'outlet';
    } else {
      // Analytic ballistic displacement avoids a frame-dependent initial kick.
      p.addScaledVector(v, dt);
      p.y -= 0.5 * this.gravity * dt * dt;
      v.y -= this.gravity * dt;
      if (this.phase === 'fall') {
        // The open top admits a caught prize; the sides absorb its remaining
        // swing until it has fallen below the playfield and into the ramp.
        if (p.y - this.halfHeight <= CHUTE_GUARD.topY && p.y + this.halfHeight >= CHUTE_GUARD.floorY) {
          const x = THREE.MathUtils.clamp(p.x, CHUTE_GUARD.minX + this.radius, CHUTE_GUARD.maxX - this.radius);
          const z = THREE.MathUtils.clamp(p.z, CHUTE_GUARD.minZ + this.radius, CHUTE_GUARD.maxZ - this.radius);
          if (x !== p.x) { p.x = x; v.x *= -0.15; }
          if (z !== p.z) { p.z = z; v.z *= -0.15; }
        }
        const floorY = PRIZE_CHUTE.entryFloorY + SLOPE * (p.z - PRIZE_CHUTE.entryZ);
        if (p.y - this.halfHeight <= floorY) {
          p.y = floorY + this.halfHeight;
          const speed = Math.max(0, v.dot(RAMP_TANGENT));
          v.y = speed * RAMP_TANGENT.y;
          v.z = speed * RAMP_TANGENT.z;
          this.phase = 'ramp';
        }
      } else {
        const restY = PRIZE_CHUTE.trayFloorY + this.halfHeight;
        const overTray = p.z + this.radius >= PRIZE_CHUTE.trayBackZ
          && p.z - this.radius <= PRIZE_CHUTE.trayFrontZ;
        if (overTray && p.y <= restY && v.y < 0) {
          p.y = restY;
          v.y = Math.abs(v.y) > 0.25 ? -v.y * 0.18 : 0;
          const speed = Math.hypot(v.x, v.z);
          const friction = Math.max(0, speed - 0.65 * this.gravity * dt);
          if (speed > 0) { v.x *= friction / speed; v.z *= friction / speed; }
          // A slow prize still passing through the door remains in delivery.
          // Its entire visible geometry must clear the cabinet before the tray
          // timer can start and eventually move the instance into the backpack.
          const outsideCabinet = p.z - this.radius > MACHINE_OUTLET.frontZ;
          this.quietTime = outsideCabinet && v.lengthSq() < 0.0025 ? this.quietTime + dt : 0;
          if (this.quietTime >= 0.15) { v.set(0, 0, 0); this.phase = 'settled'; }
        }
        // The tray lip catches remaining momentum with a small inelastic bounce.
        const front = PRIZE_CHUTE.trayFrontZ - this.radius;
        if (p.z > front) { p.z = front; v.z = -Math.abs(v.z) * 0.15; }
        if (p.z < PRIZE_CHUTE.trayBackZ && p.y <= restY + 0.05 && v.z < 0) {
          p.z = PRIZE_CHUTE.trayBackZ; v.z = Math.abs(v.z) * 0.15;
        }
      }
    }
    if (this.phase !== 'fall') {
      const halfWidth = (this.phase === 'ramp' ? PRIZE_CHUTE.halfWidth : 0.95) - this.radius;
      const x = THREE.MathUtils.clamp(p.x, PRIZE_CHUTE.x - halfWidth, PRIZE_CHUTE.x + halfWidth);
      if (x !== p.x) { p.x = x; v.x *= -0.15; }
    }
  }
}
