import * as THREE from 'three';
import type { Body } from 'cannon-es';
import { CyberPhysics } from './CyberPhysics';
import { PrizeDelivery, PRIZE_CHUTE } from './PrizeDelivery';
import { MACHINE_LAYOUT } from './ClawMachineLayout';
import { createClawModel, type ClawModel } from './ClawModel';
import { addCabinetGlass, prepareCabinetModel } from './CabinetModel';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CollectedPrize, PRIZE_CATALOG } from '../types/prizes';

/** Cyberpunk weapon-wall room with lightweight rigid-body drop interaction. */
export class CyberGallery {
  public onPrizeCollected?: (prize: CollectedPrize) => void;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(48, 1, 0.1, 100);
  readonly ready: Promise<void>;
  private disposed = false;
  private resources = new Set<THREE.BufferGeometry | THREE.Material | THREE.Texture>();
  private gltfLoader = new GLTFLoader();
  private assetCache = new Map<string, Promise<THREE.Group>>();
  private environment: THREE.WebGLRenderTarget | null = null;
  private interactive = new THREE.Group();
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
  private viewPitch = 0.10;
  private viewDistance = 23;
  private clawX = 0;
  private clawZ = 0;
  private clawState: 'ready' | 'down' | 'grab' | 'up' | 'return' | 'release' = 'ready';
  private clawStateTime = 0;
  private clawY = MACHINE_LAYOUT.clawTopY;
  private clawHeld: THREE.Object3D | null = null;
  private clawHead: THREE.Group | null = null;
  private clawRail: THREE.Mesh | null = null;
  private clawCarriage: THREE.Mesh | null = null;
  private clawCable: THREE.Mesh | null = null;
  private clawModel: ClawModel | null = null;
  private machineReady = false;
  // Local to clawGroup; the carriage, cable top and head all use the same
  // Z datum so the hanging rod stays centered over the claw.
  private clawHeadPosition = new THREE.Vector3(0, MACHINE_LAYOUT.clawTopY, 0);
  private clawHeadVelocity = new THREE.Vector3();
  private clawVx = 0;
  private clawVz = 0;
  private clawOpen = 1;
  private clawOpenTarget = 1;
  private readonly clawChute = new THREE.Vector2(MACHINE_LAYOUT.chuteX, MACHINE_LAYOUT.chuteZ);
  private clawDeliveries: Array<{ model: THREE.Object3D; motion: PrizeDelivery; offset: THREE.Vector3 }> = [];
  private clawPrizesOnTray: Array<{ model: THREE.Object3D; elapsed: number }> = [];
  private collectedPrizes = new Map<string, CollectedPrize>();
  private prizePreviewScene = new THREE.Scene();
  private prizePreviewRoot = new THREE.Group();
  private prizePreviewModel: THREE.Object3D | null = null;
  private prizePreviewMode = false;
  private prizePreviewRequest = 0;
  // Rotation is kept on the preview model rather than the gallery camera. This
  // leaves the machine framing (and the backpack UI) stable while the user
  // drags across the canvas to inspect a prize from every angle.
  private prizePreviewYaw = 0;
  private prizePreviewPitch = 0;
  private prizePreviewScale = 1;
  private prizePreviewRadius = 1;
  private clawKeys = new Set<string>();
  private clawKeyDown = (e: KeyboardEvent) => { if (['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) { e.preventDefault(); if (this.prizePreviewMode || !this.machineReady) return; this.clawKeys.add(e.code); if (e.code === 'Space' && this.clawState === 'ready') { this.clawState = 'down'; this.clawStateTime = 0; } } };
  private clawKeyUp = (e: KeyboardEvent) => { this.clawKeys.delete(e.code); };
  constructor(renderer: THREE.WebGLRenderer) {
    this.scene.add(this.interactive);
    this.prizePreviewScene.add(this.prizePreviewRoot);
    this.prizePreviewRoot.visible = false;
    // Match the reference claw-machine framing.
    // Pull back to frame the enlarged cabinet and its extended prize bay.
    this.camera.position.set(0, 8.2, 25);
    this.camera.lookAt(0, 5.4, 0);
    // Lift the purple backdrop and ambient fill while keeping the neon contrast.
    // Studio reflections need no fog around the prizes or collection outlet.
    this.scene.background = new THREE.Color(0x403050);
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.environment = pmrem.fromScene(new RoomEnvironment(), 0.04);
    pmrem.dispose();
    this.scene.environment = this.environment.texture;
    this.scene.environmentIntensity = 0.28;
    this.prizePreviewScene.environment = this.environment.texture;
    this.prizePreviewScene.environmentIntensity = 0.3;

    const metal = new THREE.MeshStandardMaterial({ color: 0x101820, roughness: 0.72, metalness: 0.88, envMapIntensity: 0.55 });
    const panel = new THREE.MeshStandardMaterial({ color: 0x1a2630, roughness: 0.58, metalness: 0.92 });
    const black = new THREE.MeshStandardMaterial({ color: 0x05090d, roughness: 0.8, metalness: 0.8 });
    const cyan = new THREE.MeshBasicMaterial({ color: 0x27d9ff, toneMapped: false });
    const red = new THREE.MeshBasicMaterial({ color: 0xff3b20, toneMapped: false });
    const amber = new THREE.MeshBasicMaterial({ color: 0xff9d3d, toneMapped: false });

    const addBox = (size: [number, number, number], pos: [number, number, number], mat: THREE.Material) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
      this.resources.add(mesh.geometry); this.resources.add(mat);
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

    // Load only prize models owned by this room. The balcony room is entirely
    // independent and is never constructed or retained here.
    this.setupClawMachine();
    this.ready = Promise.all([this.loadPrizeModels(), this.loadMachineModels()]).then(() => {});
    void this.ready.then(() => {
      if (this.physicsDisposed) return;
      // Prizes settle inside the imported cabinet before play begins.
      this.interactive.children.forEach((model, index) => {
        const col = index % 6;
        const row = Math.floor(index / 6);
        // World-space birth points stay safely inside the doubled glass box.
        const scale = MACHINE_LAYOUT.worldScale;
        const floorY = MACHINE_LAYOUT.worldY + MACHINE_LAYOUT.floorY * scale;
        model.position.set(-2.45 + col * .98, floorY + 2.0 + row * 1.12, -1.7 + row * 1.45);
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
        if (object instanceof THREE.Light) object.intensity *= 0.18;
      });
      this.scene.add(new THREE.HemisphereLight(0x7890a8, 0x211729, 0.95));
      const key = new THREE.DirectionalLight(0xb9eaff, 1.7);
      key.position.set(-5, 10, 8);
      this.scene.add(key);
      this.machineReady = true;
    }).catch(() => { /* SceneManager reports asset loading failures. */ });
    window.addEventListener('keydown', this.clawKeyDown, { passive: false });
    window.addEventListener('keyup', this.clawKeyUp);
  }

  private async loadPrizeModels() {
    const prizeIds = ['ramen', 'burger', 'donut', 'sushi', 'cake', 'pizza'] as const;
    const sources = await Promise.all([
      'food/ramen', 'food/burger', 'food/donut', 'food/sushi', 'food/cake', 'food/pizza',
    ].map(name => this.loadAsset(name)));
    if (this.disposed) return;
    for (let index = 0; index < 18; index++) {
      const source = sources[index % sources.length].clone(true);
      const bounds = new THREE.Box3().setFromObject(source);
      const size = bounds.getSize(new THREE.Vector3());
      const scale = MACHINE_LAYOUT.prizeSize / Math.max(size.x, size.y, size.z, 0.001);
      source.scale.multiplyScalar(scale);
      source.traverse(object => { if (object instanceof THREE.Mesh) { object.castShadow = true; object.receiveShadow = true; } });
      const wrapper = new THREE.Group();
      wrapper.add(source);
      wrapper.userData.prizeId = prizeIds[index % prizeIds.length];
      wrapper.userData.spin = 0;
      wrapper.userData.bounce = 0;
      this.interactive.add(wrapper);
    }
  }

  private async loadMachineModels() {
    const [machineSource, clawSource] = await Promise.all([
      this.loadAsset('claw-machine/machine'), this.loadAsset('claw-machine/claw'),
    ]);
    if (this.disposed) return;
    const cabinet = prepareCabinetModel(machineSource);
    cabinet.traverse(object => {
      if (object instanceof THREE.Mesh) this.resources.add(object.geometry);
    });
    // Restore the reference's transparent panes in the imported shell's frame.
    addCabinetGlass(cabinet).forEach(pane => {
      this.resources.add(pane.geometry);
      if (pane.material instanceof THREE.Material) this.resources.add(pane.material);
    });
    this.clawGroup.add(cabinet);
    this.clawModel = createClawModel(clawSource, MACHINE_LAYOUT.clawHeight);
    this.clawModel.root.traverse(object => {
      if (object instanceof THREE.Mesh) object.castShadow = object.receiveShadow = true;
    });
    this.clawHead!.add(this.clawModel.root);
    this.clawModel.setOpen(this.clawOpen);
  }

  private loadAsset(name: string): Promise<THREE.Group> {
    const cached = this.assetCache.get(name);
    if (cached) return cached;
    const loading = this.gltfLoader.loadAsync(`/models/${name}.glb`).then(gltf => {
      const resources = new Set<THREE.BufferGeometry | THREE.Material | THREE.Texture>();
      gltf.scene.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        resources.add(object.geometry);
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach(material => {
          resources.add(material);
          Object.values(material).forEach(value => { if (value instanceof THREE.Texture) resources.add(value); });
        });
      });
      if (this.disposed) {
        resources.forEach(resource => resource.dispose());
        throw new Error('Gallery disposed');
      }
      resources.forEach(resource => this.resources.add(resource));
      return gltf.scene;
    }).catch(error => {
      this.assetCache.delete(name);
      throw error;
    });
    this.assetCache.set(name, loading);
    return loading;
  }

  private setupClawMachine() {
    const group = this.clawGroup;
    group.name = 'ClawMachine';
    group.position.y = MACHINE_LAYOUT.worldY;
    group.scale.setScalar(MACHINE_LAYOUT.worldScale);
    this.scene.add(group);
    const box = (size: [number, number, number], position: [number, number, number], color: number) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size),
        new THREE.MeshStandardMaterial({ color, roughness: .42, metalness: .5 }));
      mesh.position.set(...position);
      mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh);
      return mesh;
    };

    // Only the moving gantry and delivery surfaces are procedural. The cabinet,
    // controls, signage and five-finger claw come from the supplied GLBs.
    const rail = box([MACHINE_LAYOUT.halfWidth * 2, .08, .10], [0, MACHINE_LAYOUT.railY, 0], 0x78818b);
    rail.name = 'ClawRail';
    this.clawRail = rail;
    for (const side of [-1, 1]) {
      box([.08, .08, MACHINE_LAYOUT.frontZ - MACHINE_LAYOUT.backZ],
        [side * (MACHINE_LAYOUT.halfWidth - .04), MACHINE_LAYOUT.railY,
          (MACHINE_LAYOUT.frontZ + MACHINE_LAYOUT.backZ) / 2], 0x78818b);
    }
    this.clawCarriage = box([.30, .15, .30], [0, MACHINE_LAYOUT.railY, 0], 0x3b414c);
    this.clawCarriage.name = 'ClawCarriage';
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(.015, .015, 1, 8),
      new THREE.MeshStandardMaterial({ color: 0x8d939e, metalness: .85, roughness: .3 }));
    cable.name = 'ClawCable';
    group.add(cable);
    this.clawCable = cable;
    this.clawHead = new THREE.Group();
    this.clawHead.name = 'ClawHead';
    this.clawHead.position.copy(this.clawHeadPosition);
    group.add(this.clawHead);

    const chuteLight = new THREE.PointLight(0xffb52e, 2.8, 2.6, 2);
    chuteLight.position.set(this.clawChute.x, MACHINE_LAYOUT.floorY + .12, this.clawChute.y);
    group.add(chuteLight);
    const rampDepth = PRIZE_CHUTE.outletZ - PRIZE_CHUTE.entryZ;
    const rampDrop = PRIZE_CHUTE.outletFloorY - PRIZE_CHUTE.entryFloorY;
    const ramp = box([1.08, .06, Math.hypot(rampDepth, rampDrop)],
      [PRIZE_CHUTE.x, (PRIZE_CHUTE.entryFloorY + PRIZE_CHUTE.outletFloorY) / 2 - .03,
        (PRIZE_CHUTE.entryZ + PRIZE_CHUTE.outletZ) / 2], 0x11151c);
    ramp.name = 'PrizeChuteRamp';
    ramp.rotation.x = Math.atan2(-rampDrop, rampDepth);
    const trayCenterZ = (PRIZE_CHUTE.trayBackZ + PRIZE_CHUTE.trayFrontZ) / 2;
    const trayDepth = PRIZE_CHUTE.trayFrontZ - PRIZE_CHUTE.trayBackZ + .20;
    const tray = box([1.8, .10, trayDepth],
      [PRIZE_CHUTE.x, PRIZE_CHUTE.trayFloorY - .05, trayCenterZ], 0x20232a);
    tray.name = 'PrizeTray';
    for (const side of [-1, 1]) {
      box([.06, .16, trayDepth], [PRIZE_CHUTE.x + side * .88, PRIZE_CHUTE.trayFloorY + .08, trayCenterZ], 0x692334);
    }
    box([1.8, .16, .06], [PRIZE_CHUTE.x, PRIZE_CHUTE.trayFloorY + .08, PRIZE_CHUTE.trayFrontZ + .03], 0x692334);
    this.scene.traverse(object => { if (object.userData.cyberShell) object.visible = false; });

    // Two tall neon tubes frame the cabinet against the dark background.
    // They are added after the shell pass so they remain visible behind the
    // cabinet, with a soft translucent halo and a small colored point light.
    for (const [x, color] of [[-10.25, 0xff4fc3], [10.25, 0x4fc3ff]] as const) {
      const haloMaterial = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
      const halo = new THREE.Mesh(new THREE.BoxGeometry(1.15, 13.6, 0.12), haloMaterial);
      halo.position.set(x, 6.2, -4.62);
      this.resources.add(halo.geometry); this.resources.add(haloMaterial);
      this.scene.add(halo);
      const coreMaterial = new THREE.MeshBasicMaterial({ color, toneMapped: false, fog: false, blending: THREE.AdditiveBlending });
      const core = new THREE.Mesh(new THREE.BoxGeometry(0.28, 13.2, 0.14), coreMaterial);
      core.position.set(x, 6.2, -4.68);
      this.resources.add(core.geometry); this.resources.add(coreMaterial);
      this.scene.add(core);
      const hotMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.78, toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
      const hot = new THREE.Mesh(new THREE.BoxGeometry(0.075, 12.9, 0.16), hotMaterial);
      hot.position.set(x, 6.2, -4.76);
      this.resources.add(hot.geometry); this.resources.add(hotMaterial);
      this.scene.add(hot);
      const glow = new THREE.PointLight(color, 42, 17, 2);
      glow.position.set(x, 6.2, -3.9);
      this.scene.add(glow);
    }
    this.scene.add(new THREE.HemisphereLight(0xffd9ec, 0x2a1a3a, 0.7));
    const key = new THREE.DirectionalLight(0xfff2dd, 1.4);
    key.position.set(4, 9, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6 });
    this.scene.add(key);
    const n1 = new THREE.PointLight(0xff4fc3, 12, 12); n1.position.set(-3, 4.6, 1);
    const n2 = new THREE.PointLight(0x4fc3ff, 12, 12); n2.position.set(3, 4.6, 1);
    this.scene.add(n1, n2);
  }

  update(delta: number, time: number) {
    const target = new THREE.Vector3(0, 7.0, 0);
    const horizontal = Math.cos(this.viewPitch) * this.viewDistance;
    this.camera.position.set(
      Math.sin(this.viewYaw) * horizontal,
      target.y + Math.sin(this.viewPitch) * this.viewDistance,
      Math.cos(this.viewYaw) * horizontal,
    );
    this.camera.lookAt(target);
    if (this.prizePreviewMode) {
      const direction = target.clone().sub(this.camera.position).normalize();
      const modelPosition = this.camera.position.clone().addScaledVector(direction, 8.0);
      this.prizePreviewRoot.position.copy(modelPosition);
      this.prizePreviewRoot.lookAt(this.camera.position);
      // Keep the prize fully in frame on narrow viewports, including rotation.
      const availableWidth = 2 * 8 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * this.camera.aspect;
      const halfVerticalFov = THREE.MathUtils.degToRad(this.camera.fov / 2);
      const halfHorizontalFov = Math.atan(Math.tan(halfVerticalFov) * this.camera.aspect);
      const fitScale = 8 * Math.sin(Math.min(halfVerticalFov, halfHorizontalFov)) * 0.94 / this.prizePreviewRadius;
      this.prizePreviewRoot.scale.setScalar(Math.min(fitScale, Math.min(1, availableWidth / 6) * this.prizePreviewScale));
      if (this.prizePreviewModel) {
        this.prizePreviewModel.rotation.set(this.prizePreviewPitch, this.prizePreviewYaw, 0, 'YXZ');
      }
    }
    this.physics.step(delta);
    this.updateClaw(delta);
    this.bodies.forEach(({ body, offset }, model) => {
      if (model.userData.cyberDragging || model.userData.cyberDock >= 0) return;
      model.quaternion.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w);
      model.position.set(body.position.x, body.position.y, body.position.z)
        .sub(offset.clone().applyQuaternion(model.quaternion));
    });
  }

  async focusPrize(instanceId: string): Promise<boolean> {
    const prize = this.collectedPrizes.get(instanceId);
    if (!prize || this.physicsDisposed) return false;
    const request = ++this.prizePreviewRequest;
    let source: THREE.Group;
    try {
      source = await this.loadAsset(`food/${prize.prizeId}`);
    } catch (error) {
      if (this.physicsDisposed || request !== this.prizePreviewRequest) return false;
      throw error;
    }
    if (this.physicsDisposed || request !== this.prizePreviewRequest || !this.collectedPrizes.has(instanceId)) return false;
    this.clearPrizePreview();
    this.prizePreviewRoot.clear();
    const content = source.clone(true);
    const bounds = new THREE.Box3().setFromObject(content);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const dimension = Math.max(size.x, size.y, size.z, 0.001);
    const model = new THREE.Group();
    // Center the asset inside a separate pivot before scaling/rotating. Assets
    // with an offset origin must not orbit around the camera while inspected.
    content.position.sub(center);
    model.add(content);
    model.scale.setScalar(4.2 / dimension);
    this.prizePreviewRadius = bounds.getBoundingSphere(new THREE.Sphere()).radius * (4.2 / dimension);
    content.traverse(object => {
      if (object instanceof THREE.Mesh) { object.castShadow = false; object.receiveShadow = false; }
    });
    this.prizePreviewRoot.add(model);
    // The preview is composited after the cabinet's bloom, with its own soft
    // studio lights. Bright diffuse materials should retain their texture,
    // while the neon cabinet keeps its existing glow in the background.
    const ambient = new THREE.HemisphereLight(0xffffff, 0x45516b, 0.8);
    const key = new THREE.DirectionalLight(0xfff5e8, 1.8); key.position.set(4, 7, 8);
    const fill = new THREE.DirectionalLight(0xc7dcff, 0.7); fill.position.set(-4, 1, 3);
    key.target = this.prizePreviewRoot;
    fill.target = this.prizePreviewRoot;
    this.prizePreviewRoot.add(ambient, key, fill);
    this.prizePreviewRoot.visible = true;
    this.prizePreviewModel = model;
    this.prizePreviewYaw = 0;
    this.prizePreviewPitch = 0;
    this.prizePreviewScale = 1;
    this.prizePreviewMode = true;
    this.clawKeys.clear();
    return true;
  }

  isPrizePreviewing() { return this.prizePreviewMode; }

  resetPrizePreview() {
    this.prizePreviewYaw = 0;
    this.prizePreviewPitch = 0;
    this.prizePreviewScale = 1;
  }

  renderPrizePreview(renderer: THREE.WebGLRenderer) {
    if (!this.prizePreviewMode) return;
    const autoClear = renderer.autoClear;
    try {
      renderer.autoClear = false;
      renderer.clearDepth();
      renderer.render(this.prizePreviewScene, this.camera);
    } finally {
      renderer.autoClear = autoClear;
    }
  }

  clearPrizePreview() {
    this.prizePreviewRequest += 1;
    if (!this.prizePreviewMode && !this.prizePreviewModel) return;
    this.prizePreviewRoot.clear();
    this.prizePreviewRoot.visible = false;
    this.prizePreviewModel = null;
    this.prizePreviewYaw = 0;
    this.prizePreviewPitch = 0;
    this.prizePreviewScale = 1;
    this.prizePreviewMode = false;
  }

  private updateClaw(delta: number) {
    const group = this.clawGroup;
    this.clawStateTime += delta;
    for (let index = this.clawPrizesOnTray.length - 1; index >= 0; index--) {
      const prize = this.clawPrizesOnTray[index];
      prize.elapsed += delta;
      if (prize.elapsed > 3) {
        this.collectDeliveredPrize(prize.model);
        this.clawPrizesOnTray.splice(index, 1);
      }
    }
    for (let index = this.clawDeliveries.length - 1; index >= 0; index--) {
      const { model, motion, offset } = this.clawDeliveries[index];
      motion.advance(delta);
      model.position.copy(motion.position).multiply(group.scale).add(group.position).sub(offset);
      if (motion.phase === 'settled') {
        this.clawPrizesOnTray.push({ model, elapsed: 0 });
        this.clawDeliveries.splice(index, 1);
      }
    }
    const speed = 9;
    if (this.clawState === 'ready') {
      const x = (this.clawKeys.has('KeyD') || this.clawKeys.has('ArrowRight') ? 1 : 0) - (this.clawKeys.has('KeyA') || this.clawKeys.has('ArrowLeft') ? 1 : 0);
      const z = (this.clawKeys.has('KeyS') || this.clawKeys.has('ArrowDown') ? 1 : 0) - (this.clawKeys.has('KeyW') || this.clawKeys.has('ArrowUp') ? 1 : 0);
      this.clawVx += x * speed * delta; this.clawVz += z * speed * delta;
    }
    if (this.clawState === 'return') {
      const dx = this.clawChute.x - this.clawX, dz = this.clawChute.y - this.clawZ;
      this.clawVx += THREE.MathUtils.clamp(dx * 6, -3, 3) * delta * 3;
      this.clawVz += THREE.MathUtils.clamp(dz * 6, -3, 3) * delta * 3;
      const headDistance = Math.hypot(this.clawHeadPosition.x - this.clawChute.x, this.clawHeadPosition.z - this.clawChute.y);
      if (Math.hypot(dx, dz) < 0.04 && headDistance < 0.06 && this.clawHeadVelocity.length() < 0.10 && this.clawStateTime > 0.5) {
        this.clawState = 'release'; this.clawStateTime = 0; this.clawOpenTarget = 1;
      }
    }
    this.clawVx *= Math.pow(0.0015, delta); this.clawVz *= Math.pow(0.0015, delta);
    const envelope = this.clawModel?.bounds;
    const minX = -MACHINE_LAYOUT.halfWidth - (envelope?.min.x ?? -.55) + .03;
    const maxX = MACHINE_LAYOUT.halfWidth - (envelope?.max.x ?? .55) - .03;
    const minZ = MACHINE_LAYOUT.backZ - (envelope?.min.z ?? -.55) + .03;
    const maxZ = MACHINE_LAYOUT.frontZ - (envelope?.max.z ?? .55) - .03;
    this.clawX = THREE.MathUtils.clamp(this.clawX + this.clawVx * delta, minX, maxX);
    this.clawZ = THREE.MathUtils.clamp(this.clawZ + this.clawVz * delta, minZ, maxZ);
    if (this.clawX <= minX + .01 || this.clawX >= maxX - .01) this.clawVx = 0;
    if (this.clawZ <= minZ + .01 || this.clawZ >= maxZ - .01) this.clawVz = 0;
    if (this.clawState === 'down') { this.clawY = Math.max(MACHINE_LAYOUT.clawBottomY, this.clawY - 1.55 * delta); if (this.clawY <= MACHINE_LAYOUT.clawBottomY + .01) { this.clawState = 'grab'; this.clawStateTime = 0; } }
    else if (this.clawState === 'grab') { this.clawOpenTarget = 0; if (this.clawStateTime > 0.8) { this.tryClawGrab(); this.clawState = 'up'; this.clawStateTime = 0; } }
    else if (this.clawState === 'up') { this.clawY = Math.min(MACHINE_LAYOUT.clawTopY, this.clawY + 1.9 * delta); if (this.clawY >= MACHINE_LAYOUT.clawTopY) { this.clawState = this.clawHeld ? 'return' : 'ready'; this.clawStateTime = 0; } }
    else if (this.clawState === 'release') {
      if (this.clawHeld) {
        const delivered = this.clawHeld;
        const proxy = this.bodies.get(delivered);
        // Start at the actual displayed center, preserving the model's origin
        // offset and orientation instead of jumping to a chute keyframe.
        const bounds = new THREE.Box3().setFromObject(delivered);
        const center = bounds.isEmpty() ? delivered.position.clone() : bounds.getCenter(new THREE.Vector3());
        const size = bounds.getSize(new THREE.Vector3()).divide(group.scale);
        const offset = center.clone().sub(delivered.position);
        const point = center.clone().sub(group.position).divide(group.scale);
        const velocity = new THREE.Vector3(this.clawHeadVelocity.x * 0.5, 0, this.clawHeadVelocity.z * 0.5);
        if (proxy) this.physics.world.removeBody(proxy.body);
        this.bodies.delete(delivered);
        delivered.userData.cyberDelivered = true;
        this.clawDeliveries.push({ model: delivered, offset,
          motion: new PrizeDelivery(point, velocity, size.y / 2, Math.max(size.x, size.z) / 2, group.scale.y) });
        this.clawHeld = null;
      }
      if (this.clawStateTime > 0.9) { this.clawState = 'ready'; this.clawStateTime = 0; }
    }
    if (this.clawState === 'ready' || this.clawState === 'release') this.clawOpenTarget = 1;
    this.clawHeadVelocity.x += ((this.clawX - this.clawHeadPosition.x) * 26 - this.clawHeadVelocity.x * 5.2) * delta;
    this.clawHeadVelocity.z += ((this.clawZ - this.clawHeadPosition.z) * 26 - this.clawHeadVelocity.z * 5.2) * delta;
    this.clawHeadPosition.x += this.clawHeadVelocity.x * delta; this.clawHeadPosition.z += this.clawHeadVelocity.z * delta; this.clawHeadPosition.y = this.clawY;
    if (this.clawHead) {
      this.clawHead.rotation.z = THREE.MathUtils.clamp(-this.clawHeadVelocity.x * .12, -.3, .3);
      this.clawHead.rotation.x = THREE.MathUtils.clamp(this.clawHeadVelocity.z * .12, -.3, .3);
      if (envelope) {
        // The imported fingers are wider than the old procedural claw. Keep
        // their full opening/swing envelope inside the glass and above the floor.
        const bounds = envelope.clone().applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(this.clawHead.rotation));
        const position = this.clawHeadPosition;
        const x = THREE.MathUtils.clamp(position.x, -MACHINE_LAYOUT.halfWidth - bounds.min.x + .02, MACHINE_LAYOUT.halfWidth - bounds.max.x - .02);
        const z = THREE.MathUtils.clamp(position.z, MACHINE_LAYOUT.backZ - bounds.min.z + .02, MACHINE_LAYOUT.frontZ - bounds.max.z - .02);
        if (x !== position.x) this.clawHeadVelocity.x = 0;
        if (z !== position.z) this.clawHeadVelocity.z = 0;
        position.set(x, THREE.MathUtils.clamp(position.y,
          MACHINE_LAYOUT.floorY - bounds.min.y + .02, MACHINE_LAYOUT.ceilingY - bounds.max.y - .02), z);
      }
      this.clawHead.position.copy(this.clawHeadPosition);
    }
    if (this.clawRail) this.clawRail.position.z = this.clawZ;
    if (this.clawCarriage) this.clawCarriage.position.set(this.clawX, MACHINE_LAYOUT.railY, this.clawZ);
    if (this.clawCable) {
      const top = new THREE.Vector3(this.clawX, MACHINE_LAYOUT.railY - .075, this.clawZ); const mid = top.clone().add(this.clawHeadPosition).multiplyScalar(.5); const len = top.distanceTo(this.clawHeadPosition);
      this.clawCable.position.copy(mid); this.clawCable.scale.set(1, len, 1);
      const direction = this.clawHeadPosition.clone().sub(top).normalize();
      this.clawCable.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
    }
    this.clawOpen += (this.clawOpenTarget - this.clawOpen) * Math.min(1, delta * 6);
    this.clawModel?.setOpen(this.clawOpen);
    if (this.clawHeld && this.clawState !== 'release') {
      const proxy = this.bodies.get(this.clawHeld);
      if (proxy) {
        const grip = new THREE.Vector3(0, -MACHINE_LAYOUT.holdOffset, 0);
        if (this.clawHead) grip.applyEuler(this.clawHead.rotation);
        grip.add(this.clawHeadPosition).multiply(group.scale).add(group.position);
        proxy.body.position.set(grip.x, grip.y, grip.z);
        proxy.body.velocity.setZero();
        this.clawHeld.position.copy(grip).sub(proxy.offset.clone().applyQuaternion(this.clawHeld.quaternion));
      }
    }
  }

  private collectDeliveredPrize(model: THREE.Object3D) {
    if (this.physicsDisposed || !model.userData.cyberDelivered || this.collectedPrizes.has(model.uuid)) return;
    const definition = PRIZE_CATALOG.find(prize => prize.id === model.userData.prizeId);
    if (!definition) return;
    // The same physical instance leaves the scene before entering the backpack.
    // Its UUID also distinguishes separate prizes that share the same model.
    model.removeFromParent();
    const prize: CollectedPrize = { id: model.uuid, prizeId: definition.id, collectedAt: Date.now() };
    this.collectedPrizes.set(prize.id, prize);
    this.onPrizeCollected?.(prize);
  }

  private tryClawGrab() {
    let bestModel: THREE.Object3D | null = null;
    let bestDistance = Infinity;
    const worldX = this.clawGroup.position.x + this.clawHeadPosition.x * this.clawGroup.scale.x;
    const worldZ = this.clawGroup.position.z + this.clawHeadPosition.z * this.clawGroup.scale.z;
    const grabHeight = this.clawGroup.position.y + (MACHINE_LAYOUT.floorY + .85) * this.clawGroup.scale.y;
    this.bodies.forEach(({ body }, model) => { if (model.userData.cyberDragging || model.userData.cyberDock >= 0) return; const d = Math.hypot(body.position.x - worldX, body.position.z - worldZ); if (d < .8 && body.position.y < grabHeight && d < bestDistance) { bestDistance = d; bestModel = model; } });
    if (bestModel) { this.clawHeld = bestModel; const proxy = this.bodies.get(bestModel)!; this.physics.hold(proxy.body); }
  }

  orbit(dx: number, dy: number) {
    if (this.prizePreviewMode) {
      // Pointer deltas arrive from SceneManager while the cyber canvas owns
      // the pointer. Rotate only the centered prize in preview mode; changing
      // viewYaw/viewPitch here would make the whole machine drift underneath
      // the still-open backpack panel.
      this.prizePreviewYaw = (this.prizePreviewYaw + dx * 0.008) % (Math.PI * 2);
      this.prizePreviewPitch = (this.prizePreviewPitch + dy * 0.006) % (Math.PI * 2);
      return;
    }
    this.viewYaw = THREE.MathUtils.clamp(this.viewYaw + dx * 0.004, -0.65, 0.65);
    this.viewPitch = THREE.MathUtils.clamp(this.viewPitch - dy * 0.003, -0.22, 0.28);
  }

  zoom(deltaY: number) {
    if (this.prizePreviewMode) {
      // update() caps the final scale against the camera's full bounding sphere fit.
      this.prizePreviewScale = THREE.MathUtils.clamp(this.prizePreviewScale * Math.exp(-deltaY * 0.001), 0.65, 1.25);
      return;
    }
    this.viewDistance = THREE.MathUtils.clamp(this.viewDistance + deltaY * 0.018, 17, 36);
  }

  resize(width: number, height: number) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
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
    this.disposed = true;
    this.physicsDisposed = true;
    this.onPrizeCollected = undefined;
    this.collectedPrizes.clear();
    this.clawPrizesOnTray = [];
    this.clawHeld = null;
    this.clawModel = null;
    this.machineReady = false;
    this.clawDeliveries = [];
    this.clearPrizePreview();
    this.prizePreviewScene.environment = null;
    this.prizePreviewScene.clear();
    window.removeEventListener('keydown', this.clawKeyDown);
    window.removeEventListener('keyup', this.clawKeyUp);
    if (this.dragTimer !== null) clearTimeout(this.dragTimer);
    this.dragModel = null;
    this.physics.dispose(); this.bodies.clear();
    const disposed = new Set<THREE.BufferGeometry | THREE.Material | THREE.Texture>();
    this.scene.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      if (object.geometry && !disposed.has(object.geometry)) { object.geometry.dispose(); disposed.add(object.geometry); }
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach(material => {
        if (!material || disposed.has(material)) return;
        disposed.add(material); material.dispose();
        Object.values(material).forEach(value => {
          if (value instanceof THREE.Texture && !disposed.has(value)) { value.dispose(); disposed.add(value); }
        });
      });
    });
    this.resources.forEach(resource => { if (!disposed.has(resource)) resource.dispose(); });
    this.resources.clear();
    this.assetCache.clear();
    this.environment?.dispose();
    this.environment = null;
    this.scene.clear();
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
