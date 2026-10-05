import * as THREE from 'three';
import type { Body } from 'cannon-es';
import { CyberPhysics } from './CyberPhysics';
import { SunsetGallery } from './SunsetGallery';

/** Cyberpunk weapon-wall room with lightweight rigid-body drop interaction. */
export class CyberGallery extends SunsetGallery {
  private physics = new CyberPhysics();
  private bodies = new Map<THREE.Object3D, { body: Body; offset: THREE.Vector3 }>();
  private physicsDisposed = false;
  private suppressClick = false;
  private wallSlots: THREE.Vector3[] = [];
  private wallSlotMeshes: THREE.Mesh[] = [];
  private dragModel: THREE.Object3D | null = null;
  private dragStart = { x: 0, y: 0 };
  private dragPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 4.45);
  private dragPoint = new THREE.Vector3();
  private dragSlot = -1;
  private dragTimer: number | null = null;
  private clawGroup = new THREE.Group();
  private viewYaw = 0;
  private viewPitch = 0;
  private viewDistance = 25;
  constructor(renderer: THREE.WebGLRenderer) {
    super(renderer);
    // Match the reference claw-machine framing.
    // Pull back to frame the enlarged cabinet and its extended prize bay.
    this.camera.position.set(0, 8.2, 25);
    this.camera.lookAt(0, 5.4, 0);
    // Replace the warm gallery mood with a dark gunmetal workshop shell.
    this.scene.background = new THREE.Color('#241532');
    this.scene.environmentIntensity = 0.18;

    const metal = new THREE.MeshStandardMaterial({ color: 0x101820, roughness: 0.72, metalness: 0.88 });
    const panel = new THREE.MeshStandardMaterial({ color: 0x1a2630, roughness: 0.58, metalness: 0.92 });
    const black = new THREE.MeshStandardMaterial({ color: 0x05090d, roughness: 0.8, metalness: 0.8 });
    const cyan = new THREE.MeshBasicMaterial({ color: 0x27d9ff, toneMapped: false });
    const red = new THREE.MeshBasicMaterial({ color: 0xff3b20, toneMapped: false });
    const amber = new THREE.MeshBasicMaterial({ color: 0xff9d3d, toneMapped: false });

    const addBox = (size: [number, number, number], pos: [number, number, number], mat: THREE.Material) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
      mesh.userData.cyberShell = true;
      mesh.position.set(...pos);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      return mesh;
    };

    // Armour-plated floor, rear bulkhead, and side service wall hide the soft room shell.
    addBox([18, 0.12, 20], [0, 0.03, 2], black);
    addBox([18, 10.8, 0.12], [0, 5.4, -4.88], metal);
    addBox([0.12, 10.8, 19], [8.72, 5.4, 2], metal);
    addBox([18, 0.12, 19], [0, 10.86, 2], black);

    // Modular seams and exposed structural rails.
    for (const x of [-7.5, -3.75, 0, 3.75, 7.5]) addBox([0.035, 10.2, 0.035], [x, 5.45, -4.78], cyan);
    for (const y of [2.1, 5.4, 8.7]) addBox([17.4, 0.025, 0.025], [0, y, -4.79], cyan);
    for (const z of [-3, 1, 5, 9]) addBox([0.035, 0.035, 17], [8.6, 0.12, z], cyan);
    addBox([17.6, 0.06, 0.08], [0, 0.11, -4.62], red);

    // Technical floor grid with a central service spine.
    const grid = new THREE.GridHelper(18, 36, 0x2b8fb0, 0x122d3c);
    grid.userData.cyberShell = true;
    grid.position.set(0, 0.095, 2);
    grid.material = new THREE.LineBasicMaterial({ color: 0x1983a3, transparent: true, opacity: 0.28 });
    this.scene.add(grid);
    addBox([0.22, 0.08, 18], [0, 0.14, 2], panel);
    for (const x of [-5.4, 5.4]) addBox([0.09, 0.09, 18], [x, 0.16, 2], amber);

    // Foreground loading bench where every artifact initially drops.
    addBox([16.2, 0.24, 2.15], [0, 1.02, 1.55], panel);
    addBox([16.2, 0.06, 0.08], [0, 1.16, 0.52], red);
    for (const x of [-7.4, -3.7, 0, 3.7, 7.4]) {
      addBox([0.11, 1.0, 1.7], [x, 0.5, 1.55], black);
      addBox([1.8, 0.035, 0.07], [x, 1.16, 1.55], cyan);
    }

    // Small recessed catch pit for the loose falling artifacts.
    const pitMat = new THREE.MeshStandardMaterial({ color: 0x050a10, roughness: 0.82, metalness: 0.75 });
    const pitGlow = new THREE.MeshBasicMaterial({ color: 0xff5a28, toneMapped: false });
    const pit = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.18, 2.1), pitMat);
    pit.position.set(-6.6, 0.15, 3.8); pit.userData.cyberShell = true; this.scene.add(pit);
    const pitFrame = new THREE.Mesh(new THREE.BoxGeometry(3.35, 0.035, 2.25), pitGlow);
    pitFrame.position.set(-6.6, 0.27, 3.8); pitFrame.userData.cyberShell = true; this.scene.add(pitFrame);
    for (const x of [-7.95, -5.25]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.65, 2.1), pitMat);
      wall.position.set(x, 0.45, 3.8); wall.userData.cyberShell = true; this.scene.add(wall);
    }

    // Overhead gantry and suspended work lights.
    addBox([16.6, 0.16, 0.2], [0, 9.9, -2.8], panel);
    for (const x of [-7.5, 0, 7.5]) {
      addBox([0.12, 4.3, 0.12], [x, 7.85, -2.8], panel);
      const light = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.035, 0.08), cyan);
      light.userData.cyberShell = true;
      light.position.set(x, 5.72, -2.8);
      this.scene.add(light);
    }

    // Arc-reactor style power core behind the model array.
    const reactor = new THREE.Group();
    reactor.userData.cyberShell = true;
    reactor.position.set(0, 4.15, -4.58);
    const outer = new THREE.Mesh(new THREE.TorusGeometry(1.28, 0.075, 12, 64), red);
    const inner = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.045, 12, 64), amber);
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.64, 0.64, 0.08, 48), new THREE.MeshBasicMaterial({ color: 0xffd7a0, toneMapped: false }));
    core.rotation.x = Math.PI / 2;
    reactor.add(outer, inner, core);
    this.scene.add(reactor);

    const reactorLight = new THREE.PointLight(0xff4a22, 55, 11, 2);
    reactorLight.position.set(0, 4.15, -3.8);
    this.scene.add(reactorLight);
    const magenta = new THREE.PointLight(0xff2b20, 28, 18, 2);
    magenta.position.set(-7, 5, 1);
    const cyanLight = new THREE.PointLight(0x19d9ff, 34, 20, 2);
    cyanLight.position.set(7, 4, -1);
    this.scene.add(magenta, cyanLight);

    // Narrow vertical status bars give the room a workshop HUD rhythm.
    for (const x of [-8.35, 8.35]) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 7.8, 0.06), red);
      strip.userData.cyberShell = true;
      strip.position.set(x, 4.6, -4.52);
      this.scene.add(strip);
    }

    // Weapon-wall style magnetic slots: five columns, three rows.
    const slotMat = new THREE.MeshBasicMaterial({ color: 0x32cfff, transparent: true, opacity: 0.32 });
    for (const y of [2.5, 5.0, 7.5]) {
      for (const x of [-6, -3, 0, 3, 6]) {
        const slot = new THREE.Vector3(x, y, -4.42);
        this.wallSlots.push(slot);
        const frame = new THREE.Mesh(new THREE.BoxGeometry(2.05, 1.28, 0.035), slotMat);
        frame.position.copy(slot);
        frame.userData.cyberShell = true;
        this.wallSlotMeshes.push(frame);
        this.scene.add(frame);
        addBox([1.5, 0.035, 0.08], [x, y - 0.56, -4.30], amber);
      }
    }

    // The base gallery is shared for interaction and loading. Once its assets
    // finish loading, keep only the interactive exhibits and this metal shell.
    void this.ready.then(() => {
      if (this.physicsDisposed) return;
      // Models begin on the foreground bench, ready to be picked up.
      this.interactive.children.forEach((model, index) => {
        const col = index % 6;
        const row = Math.floor(index / 6);
        // World-space birth points stay safely inside the doubled glass box.
        model.position.set(-4.2 + (col % 6) * 1.55, 11.0 + row * 0.42, -2.8 + (col % 4) * 1.75);
        // Cyber-space display convention: every artifact faces screen-right.
        model.rotation.set(0, -Math.PI / 2, 0);
        model.userData.baseY = model.position.y;
        model.userData.cyberDock = -1;
        model.userData.spin = 0;
        model.userData.bounce = 0;
        model.updateWorldMatrix(true, true);
        const bounds = new THREE.Box3().setFromObject(model);
        const center = bounds.getCenter(new THREE.Vector3());
        const size = bounds.getSize(new THREE.Vector3());
        const radius = Math.max(size.x, size.y, size.z) * 0.5;
        const body = this.physics.sphere(Math.max(0.12, radius));
        body.position.set(center.x, center.y, center.z);
        body.quaternion.set(model.quaternion.x, model.quaternion.y, model.quaternion.z, model.quaternion.w);
        // Slight lateral momentum becomes rolling through contact friction;
        // no artificial spin is applied while the model is airborne.
        body.velocity.set(Math.sin(index * 2.4) * 0.85, 0, 0.5 + (index % 3) * 0.15);
        const offset = center.sub(model.position).applyQuaternion(model.quaternion.clone().invert());
        this.bodies.set(model, { body, offset });
      });
      this.scene.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        let parent: THREE.Object3D | null = object;
        let inInteractive = false;
        while (parent) {
          if (parent === this.interactive) { inInteractive = true; break; }
          parent = parent.parent;
        }
        let clawPart: THREE.Object3D | null = object;
        while (clawPart && !clawPart.userData.clawShell) clawPart = clawPart.parent;
        if (!inInteractive && !object.userData.cyberShell && !clawPart) object.visible = false;
      });
      this.scene.traverse(object => {
        if (object instanceof THREE.Light) object.intensity *= 0.18;
      });
      this.scene.add(new THREE.HemisphereLight(0x4c718c, 0x03060a, 0.8));
      const key = new THREE.DirectionalLight(0xb9eaff, 1.7);
      key.position.set(-5, 10, 8);
      this.scene.add(key);
    }).catch(() => { /* SceneManager reports asset loading failures. */ });
    this.setupClawMachine();
  }

  private setupClawMachine() {
    // Raised pedestal leaves a tall, readable control bay below the playfield.
    const group = this.clawGroup; group.userData.clawShell = true; group.position.y = 3.1; group.scale.setScalar(2); this.scene.add(group);
    const box = (w:number,h:number,d:number,color:number,x:number,y:number,z:number,transparent=false) => {
      const mat = new THREE.MeshStandardMaterial({color,roughness:.32,metalness:.4,transparent,opacity:transparent?.14:1});
      const m = new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat); m.position.set(x,y,z); m.userData.clawShell=true; m.castShadow=true; m.receiveShadow=true; group.add(m); return m;
    };
    const pink=0xff5fa8,dark=0x3a2140;
    box(5.8,.38,4.1,0x6b3fa0,0,-.2,0); box(5.8,5.2,.22,dark,0,2.45,-2); box(5.8,.52,4.1,pink,0,5.05,0); box(5.8,1,4.1,pink,0,-.72,0);
    for(const [x,z] of [[-2.72,-1.86],[2.72,-1.86],[-2.72,1.86],[2.72,1.86]]) box(.32,4.8,.32,pink,x,2.42,z);
    // Glass starts directly on the single lower cabinet body.
    box(5.05,4.45,.05,0xdff0ff,0,2.45,1.86,true); box(3.45,4.45,.05,0xdff0ff,-2.52,2.45,0,true).rotation.y=Math.PI/2; box(3.45,4.45,.05,0xdff0ff,2.52,2.45,0,true).rotation.y=Math.PI/2;
    box(4.8,.82,.3,dark,0,5.78,.55);
    const sign=new THREE.Mesh(new THREE.PlaneGeometry(4.6,.76),new THREE.MeshBasicMaterial({color:0xff4fc3,toneMapped:false})); sign.position.set(0,5.78,.72); sign.userData.clawShell=true; group.add(sign);
    for(let i=0;i<9;i++){const b=new THREE.Mesh(new THREE.SphereGeometry(.08,10,8),new THREE.MeshBasicMaterial({color:i%2?0xff4fc3:0xffd54a}));b.position.set(-2+i*.5,5.78,.8);b.userData.clawShell=true;group.add(b);}
    box(3.9,.12,.12,0xb8c0cc,0,4.55,.1); box(.08,2,.08,0xb8c0cc,0,3.55,.1);
    const claw=new THREE.Group(); claw.userData.clawShell=true; claw.position.set(0,2.55,.1); group.add(claw);
    claw.add(new THREE.Mesh(new THREE.SphereGeometry(.18,16,12),new THREE.MeshStandardMaterial({color:0xffd54a,emissive:0x884400,emissiveIntensity:.6})));
    for(let i=0;i<3;i++){const a=new THREE.Mesh(new THREE.CylinderGeometry(.035,.06,.48,10),new THREE.MeshStandardMaterial({color:0xb8c0cc,metalness:.8}));a.position.set(Math.cos(i*Math.PI*2/3)*.14,-.25,Math.sin(i*Math.PI*2/3)*.14);a.rotation.z=Math.cos(i*Math.PI*2/3)*.42;a.rotation.x=Math.sin(i*Math.PI*2/3)*.42;claw.add(a);}
    box(3.5,.18,1.05,pink,0,.55,2.3);
    const control = new THREE.Group(); control.userData.clawShell = true; control.position.set(0,.68,2.34); group.add(control);
    const joystickBase = new THREE.Mesh(new THREE.CylinderGeometry(.22,.26,.08,20),new THREE.MeshStandardMaterial({color:0x2a2a35,metalness:.7,roughness:.3})); joystickBase.position.x=-.95; joystickBase.userData.clawShell=true; control.add(joystickBase);
    const joystickBall = new THREE.Mesh(new THREE.SphereGeometry(.11,16,12),new THREE.MeshStandardMaterial({color:0xff3355,metalness:.3,roughness:.25,emissive:0x551122,emissiveIntensity:.5})); joystickBall.position.set(-.95,.33,0); joystickBall.userData.clawShell=true; control.add(joystickBall);
    const buttonBase = new THREE.Mesh(new THREE.CylinderGeometry(.17,.2,.08,20),new THREE.MeshStandardMaterial({color:0x333344,metalness:.6,roughness:.3})); buttonBase.position.x=.95; buttonBase.userData.clawShell=true; control.add(buttonBase);
    const button = new THREE.Mesh(new THREE.SphereGeometry(.13,16,12),new THREE.MeshStandardMaterial({color:0xffd54a,emissive:0x996600,emissiveIntensity:1.2})); button.position.set(.95,.16,0); button.userData.clawShell=true; control.add(button);
    // Front lower body, with the prize outlet inset into its face.
    box(4.9,1.55,0.72,0x3a2140,0,-.68,2.18);
    const outlet = new THREE.Mesh(new THREE.BoxGeometry(1.65,.58,.08),new THREE.MeshStandardMaterial({color:0x090611,roughness:.8,metalness:.2}));
    outlet.position.set(-1.5,-.65,2.58); outlet.userData.clawShell=true; group.add(outlet);
    const outletLight = new THREE.Mesh(new THREE.BoxGeometry(1.25,.06,.03),new THREE.MeshBasicMaterial({color:0xffd54a,toneMapped:false}));
    outletLight.position.set(-1.5,-.34,2.63); outletLight.userData.clawShell=true; group.add(outletLight);
    this.scene.traverse(o=>{if(o instanceof THREE.Mesh && o.userData.cyberShell)o.visible=false;});
    this.scene.add(new THREE.HemisphereLight(0xffd9ec,0x2a1a3a,.9)); const key=new THREE.DirectionalLight(0xfff2dd,1.7);key.position.set(4,9,6);this.scene.add(key);
    const n1=new THREE.PointLight(0xff4fc3,18,12);n1.position.set(-3,4.6,1);const n2=new THREE.PointLight(0x4fc3ff,18,12);n2.position.set(3,4.6,1);this.scene.add(n1,n2);
  }

  update(delta: number, time: number) {
    super.update(delta, time);
    const target = new THREE.Vector3(0, 5.4, 0);
    const horizontal = Math.cos(this.viewPitch) * this.viewDistance;
    this.camera.position.set(
      Math.sin(this.viewYaw) * horizontal,
      target.y + Math.sin(this.viewPitch) * this.viewDistance,
      Math.cos(this.viewYaw) * horizontal,
    );
    this.camera.lookAt(target);
    this.physics.step(delta);
    this.bodies.forEach(({ body, offset }, model) => {
      if (model.userData.cyberDragging || model.userData.cyberDock >= 0) return;
      model.quaternion.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w);
      model.position.set(body.position.x, body.position.y, body.position.z)
        .sub(offset.clone().applyQuaternion(model.quaternion));
    });
  }

  orbit(dx: number, dy: number) {
    this.viewYaw = THREE.MathUtils.clamp(this.viewYaw + dx * 0.004, -0.65, 0.65);
    this.viewPitch = THREE.MathUtils.clamp(this.viewPitch - dy * 0.003, -0.22, 0.28);
  }

  zoom(deltaY: number) {
    this.viewDistance = THREE.MathUtils.clamp(this.viewDistance + deltaY * 0.018, 17, 36);
  }

  private syncBody(model: THREE.Object3D) {
    const proxy = this.bodies.get(model);
    if (!proxy) return;
    const center = proxy.offset.clone().applyQuaternion(model.quaternion).add(model.position);
    proxy.body.position.set(center.x, center.y, center.z);
    proxy.body.quaternion.set(model.quaternion.x, model.quaternion.y, model.quaternion.z, model.quaternion.w);
    proxy.body.aabbNeedsUpdate = true;
  }

  // Avoid the inherited scripted bounce fighting rigid-body transforms.
  handleClick(_x: number, _y: number, _rect: DOMRect) { this.suppressClick = false; }
  handleDoubleClick(x: number, y: number, rect: DOMRect) {
    // The reference claw machine keeps a fixed camera; no model zoom/focus mode.
  }

  dispose() {
    this.physicsDisposed = true;
    if (this.dragTimer !== null) clearTimeout(this.dragTimer);
    this.dragModel = null;
    this.physics.dispose(); this.bodies.clear();
    super.dispose();
  }

  isDragging() { return this.dragModel !== null; }

  private pickModel(clientX: number, clientY: number, rect: DOMRect) {
    const mouse = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster(); ray.setFromCamera(mouse, this.camera);
    const hit = ray.intersectObjects(this.interactive.children, true)[0];
    if (!hit) return null;
    let model: THREE.Object3D | null = hit.object;
    while (model && model.parent !== this.interactive) model = model.parent;
    return model;
  }

  handlePointerDown(clientX: number, clientY: number, rect: DOMRect, _pointerId: number) {
    // Models are physical prizes in this scene, not draggable editor assets.
    void clientX; void clientY; void rect;
  }

  handlePointerMove(clientX: number, clientY: number, rect: DOMRect, _pointerId: number) {
    void clientX; void clientY; void rect;
  }

  handlePointerUp(_clientX: number, _clientY: number, _rect: DOMRect, _pointerId: number) {
    // Deliberately empty: prizes remain inside the machine.
  }
}
