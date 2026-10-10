import * as CANNON from 'cannon-es';
import { CHUTE_GUARD, MACHINE_LAYOUT } from './ClawMachineLayout';

export const WORLD_GRAVITY = 9.8;

/** Sphere proxies keep detailed GLBs inexpensive to simulate. */
export class CyberPhysics {
  // The visible playfield is the top of the raised lower cabinet section.
  private readonly floorY = MACHINE_LAYOUT.worldY + MACHINE_LAYOUT.floorY * MACHINE_LAYOUT.worldScale;
  readonly world = new CANNON.World({ gravity: new CANNON.Vec3(0, -WORLD_GRAVITY, 0), allowSleep: true });
  private material = new CANNON.Material('cyber-surfaces');

  constructor() {
    this.world.addContactMaterial(new CANNON.ContactMaterial(this.material, this.material, {
      friction: 0.48, restitution: 0.36,
    }));
    const scale = MACHINE_LAYOUT.worldScale;
    const width = MACHINE_LAYOUT.halfWidth * 2 * scale;
    const depth = (MACHINE_LAYOUT.frontZ - MACHINE_LAYOUT.backZ) * scale;
    const centerZ = (MACHINE_LAYOUT.frontZ + MACHINE_LAYOUT.backZ) * scale / 2;
    const height = (MACHINE_LAYOUT.ceilingY - MACHINE_LAYOUT.floorY) * scale;
    // Hidden collision proxies follow the imported cabinet's interior. The
    // delivery controller takes over caught prizes at the chute opening.
    this.box([width, 0.12, depth], [0, this.floorY - 0.06, centerZ]);
    this.box([0.12, height, depth], [-width / 2 - 0.06, this.floorY + height / 2, centerZ]);
    this.box([0.12, height, depth], [width / 2 + 0.06, this.floorY + height / 2, centerZ]);
    this.box([width, height, 0.12], [0, this.floorY + height / 2, MACHINE_LAYOUT.backZ * scale - 0.06]);
    this.box([width, height, 0.12], [0, this.floorY + height / 2, MACHINE_LAYOUT.frontZ * scale + 0.06]);
    for (const wall of CHUTE_GUARD.walls) {
      this.box(
        wall.size.map(value => value * scale),
        [wall.position[0] * scale, MACHINE_LAYOUT.worldY + wall.position[1] * scale, wall.position[2] * scale],
      );
    }
  }

  private box(size: number[], position: number[]) {
    const body = new CANNON.Body({ mass: 0, material: this.material });
    body.addShape(new CANNON.Box(new CANNON.Vec3(size[0] / 2, size[1] / 2, size[2] / 2)));
    body.position.set(position[0], position[1], position[2]);
    this.world.addBody(body);
  }

  sphere(radius: number) {
    const body = new CANNON.Body({
      mass: 1, material: this.material, shape: new CANNON.Sphere(radius),
      linearDamping: 0.22, angularDamping: 0.4,
      sleepSpeedLimit: 0.12, sleepTimeLimit: 0.8,
    });
    this.world.addBody(body);
    return body;
  }

  hold(body: CANNON.Body) {
    body.type = CANNON.Body.KINEMATIC;
    body.collisionFilterMask = 0;
    body.velocity.setZero(); body.angularVelocity.setZero();
    body.force.setZero(); body.torque.setZero();
    body.updateMassProperties(); body.wakeUp();
  }

  release(body: CANNON.Body) {
    body.type = CANNON.Body.DYNAMIC;
    body.collisionFilterMask = -1;
    body.updateMassProperties(); body.aabbNeedsUpdate = true; body.wakeUp();
  }

  step(delta: number) { this.world.step(1 / 120, Math.min(delta, 0.08), 10); }
  dispose() { [...this.world.bodies].forEach(body => this.world.removeBody(body)); }
}
