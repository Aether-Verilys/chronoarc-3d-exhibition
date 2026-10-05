import * as CANNON from 'cannon-es';

/** Sphere proxies keep detailed GLBs inexpensive to simulate. */
export class CyberPhysics {
  // The visible playfield is the top of the raised lower cabinet section.
  private readonly floorY = 3.50;
  readonly world = new CANNON.World({ gravity: new CANNON.Vec3(0, -14, 0), allowSleep: true });
  private material = new CANNON.Material('cyber-surfaces');

  constructor() {
    this.world.addContactMaterial(new CANNON.ContactMaterial(this.material, this.material, {
      friction: 0.48, restitution: 0.36,
    }));
    // Claw-machine playfield: floor at y=0 and a compact glass-box boundary.
    this.box([10.1, 0.12, 7.45], [0, this.floorY, 0]);
    // Collision planes sit directly behind the scaled glass panels.
    this.box([0.16, 12.0, 7.45], [-5.05, this.floorY + 6, 0]);
    this.box([0.16, 12.0, 7.45], [5.05, this.floorY + 6, 0]);
    this.box([10.1, 12.0, 0.16], [0, this.floorY + 6, -3.75]);
    this.box([10.1, 12.0, 0.16], [0, this.floorY + 6, 3.75]);
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
