import * as THREE from 'three';
import { CameraPreset, CameraViewConfig, GlbPlacement, ModelDefinition, OpticsSettings, TierInfo } from '../types/scene';
import { MODEL_CATALOG, ModelMeshWrapper, TIER_CONFIGS, createModelWrapper } from './ModelGenerators';
import { ParticleSystem } from './ParticleSystem';
import { LensDistortionShader } from '../shaders/LensDistortionShader';
import { soundEffects } from '../audio/soundEffects';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export interface MatrixSlot {
  slotIndex: number;
  tier: number;
  col: number;
  position: THREE.Vector3;
  rotation: THREE.Euler;
}

export const CAMERA_CONFIGS: Record<CameraPreset, CameraViewConfig> = {
  'arc-wide': {
    id: 'arc-wide',
    label: 'Full 5-Tier Convex Matrix',
    labelCn: '五排全景正面',
    position: [0, 0.4, 15.8],
    target: [0, 0.0, -1.2],
    fov: 72
  },
  'hero-low': {
    id: 'hero-low',
    label: 'Low-Angle Looking Up',
    labelCn: '仰角透视',
    position: [0, -5.8, 12.8],
    target: [0, 0.8, -1.2],
    fov: 80
  },
  'stadium-overview': {
    id: 'stadium-overview',
    label: 'High-Angle Looking Down',
    labelCn: '俯角透视',
    position: [0, 7.8, 14.5],
    target: [0, -0.8, -0.5],
    fov: 74
  },
  'center-focus': {
    id: 'center-focus',
    label: 'Center Tier Close-Up',
    labelCn: '中央层聚焦',
    position: [0, 0.0, 9.2],
    target: [0, 0.0, 0.0],
    fov: 58
  },
  'orbit-roam': {
    id: 'orbit-roam',
    label: 'Curved Wing Angle',
    labelCn: '斜角翼列',
    position: [12.5, 3.2, 11.8],
    target: [0, 0.0, 0.0],
    fov: 66
  }
};

export class SceneManager {
  private container: HTMLElement;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;

  // Post-processing
  private postScene: THREE.Scene;
  private postCamera: THREE.OrthographicCamera;
  private postQuad: THREE.Mesh;
  private renderTarget: THREE.WebGLRenderTarget | null = null;
  private postMaterial: THREE.ShaderMaterial;

  // Slots & Ordered Models List
  private slots: MatrixSlot[] = [];
  private models: ModelMeshWrapper[] = [];
  private modelOrder: ModelMeshWrapper[] = [];
  private particles: ParticleSystem;
  private spotLight: THREE.SpotLight;
  private gltfLoader = new GLTFLoader();
  private arcRadius = 11.2;
  private readonly baseArcRadius = 11.2;
  private readonly zCenter = -11.2 * 0.65;
  private newRowSerial = 0;
  private tiers = TIER_CONFIGS.map(t => ({ ...t, rowId: `row-${t.tier}` }));

  // State
  private activeModelIndex: number = 30; // Center model
  private hoveredModelIndex: number | null = null;
  private optics: OpticsSettings = {
    stretchX: 1.35,
    stretchY: 1.0,
    distortion: 0.38,
    chromatic: 0.45,
    fov: 72,
    vignette: 0.25,
    enableShader: true
  };

  // Camera animation
  private targetCamPos = new THREE.Vector3(0, 0.4, 15.8);
  private currentCamPos = new THREE.Vector3(0, 0.4, 15.8);
  private targetLookAt = new THREE.Vector3(0, 0.0, -1.2);
  private currentLookAt = new THREE.Vector3(0, 0.0, -1.2);
  private targetFov = 72;

  // Mouse & Orbit
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2(-100, -100);
  private parallaxOffset = new THREE.Vector2(0, 0);
  private isPointerDown = false;
  private pointerDownPos = { x: 0, y: 0 };
  private orbitAngles = { theta: 0, phi: 0 };
  private targetOrbitAngles = { theta: 0, phi: 0 };

  // iOS-style Long Press & Sequential Sliding Reorder State
  private longPressTimeout: number | null = null;
  private pressedModelWrapper: ModelMeshWrapper | null = null;
  private isDraggingModel: boolean = false;
  private draggedModel: ModelMeshWrapper | null = null;
  private lastTargetSlotIndex: number = -1;
  private dragPlane = new THREE.Plane();
  private dragPlaneIntersect = new THREE.Vector3();

  // Loop & timing
  private clock = new THREE.Clock();
  private animationFrameId: number | null = null;
  private isDestroyed = false;

  // Callbacks
  public onModelSelect?: (model: ModelDefinition) => void;
  public onModelBounce?: (model: ModelDefinition) => void;
  public onDragModeChange?: (isDragging: boolean, draggedName?: string) => void;
  public onModelReorder?: (reorderedModels: ModelDefinition[]) => void;

  constructor(container: HTMLElement) {
    this.container = container;
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    // 1. Core Scene with Bright Spatial Void (No Floor)
    this.scene = new THREE.Scene();
    const brightBgColor = new THREE.Color(0xf3f6fa);
    this.scene.background = brightBgColor;
    this.scene.fog = new THREE.FogExp2(0xf3f6fa, 0.018);

    // 2. Camera
    this.camera = new THREE.PerspectiveCamera(this.optics.fov, width / height, 0.1, 100);
    this.camera.position.set(0, 0.4, 15.8);
    this.targetCamPos.copy(this.camera.position);

    // 3. Renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    // 4. Post-processing Quad & Shader
    this.postScene = new THREE.Scene();
    this.postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.postMaterial = new THREE.ShaderMaterial({
      vertexShader: LensDistortionShader.vertexShader,
      fragmentShader: LensDistortionShader.fragmentShader,
      uniforms: THREE.UniformsUtils.clone(LensDistortionShader.uniforms)
    });
    this.postQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.postMaterial);
    this.postScene.add(this.postQuad);

    this.initRenderTarget(width, height);

    // 5. Studio Lighting for Pure Floating Gallery
    const ambientLight = new THREE.AmbientLight(0xffffff, 2.0);
    this.scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xfffaed, 2.4);
    keyLight.position.set(14, 18, 16);
    this.scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xdbeafe, 1.4);
    fillLight.position.set(-14, -10, -10);
    this.scene.add(fillLight);

    const bottomBounce = new THREE.DirectionalLight(0xf8fafc, 0.9);
    bottomBounce.position.set(0, -14, 6);
    this.scene.add(bottomBounce);

    this.spotLight = new THREE.SpotLight(0x0284c7, 3.8, 28, Math.PI / 5, 0.45, 1.2);
    this.spotLight.position.set(0, 10, 10);
    this.scene.add(this.spotLight);
    this.scene.add(this.spotLight.target);

    // 6. Particle System
    this.particles = new ParticleSystem();
    this.scene.add(this.particles.group);

    // 7. Build Slots & Models
    this.buildConvexSemicircleSlotsAndModels();

    // 8. Event Listeners
    this.bindEvents();

    // 9. Start Loop
    this.animate();
  }

  private initRenderTarget(width: number, height: number) {
    if (this.renderTarget) {
      this.renderTarget.dispose();
    }
    const dpr = Math.min(window.devicePixelRatio, 2);
    this.renderTarget = new THREE.WebGLRenderTarget(width * dpr, height * dpr, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat
    });

    this.postMaterial.uniforms.uResolution.value.set(width * dpr, height * dpr);
    this.postMaterial.uniforms.tDiffuse.value = this.renderTarget.texture;
    this.updateShaderUniforms();
  }

  private rowSweep(spanAngle: number) {
    const r = this.arcRadius;
    const rRing = this.baseArcRadius * 0.78 * 0.5;

    if (r <= rRing) return Math.PI * 2;
    if (r >= this.baseArcRadius) return spanAngle * (this.baseArcRadius / r);

    const k = (this.baseArcRadius - r) / (this.baseArcRadius - rRing);
    return spanAngle + k * (Math.PI * 2 - spanAngle);
  }

  private rebuildSlots() {
    this.slots = [];
    let slotIdx = 0;
    const r = this.arcRadius;

    this.tiers.forEach((tierCfg, ti) => {
      tierCfg.tier = ti;
      const count = tierCfg.count;
      const sweep = this.rowSweep(tierCfg.spanAngle);
      const closed = sweep >= Math.PI * 2 - 1e-4;

      for (let c = 0; c < count; c++) {
        let theta = 0;
        if (count > 1) {
          theta = closed
            ? -Math.PI + (c / count) * Math.PI * 2
            : -sweep / 2 + (c / (count - 1)) * sweep;
        }
        const x = r * Math.sin(theta);
        const z = this.zCenter + r * (1 - Math.cos(theta));
        const y = tierCfg.y;
        const tiltX = (y / this.baseArcRadius) * 0.28;
        const pos = new THREE.Vector3(x, y, z);
        const rot = new THREE.Euler(tiltX, -theta, 0, 'YXZ');

        this.slots.push({
          slotIndex: slotIdx,
          tier: ti,
          col: c,
          position: pos,
          rotation: rot
        });
        slotIdx++;
      }
    });
  }

  private applySlotsToModels() {
    this.modelOrder.forEach((m, idx) => {
      const slot = this.slots[idx];
      if (!slot) return;
      m.definition.tier = slot.tier;
      m.definition.col = slot.col;
      m.setSlot(idx, slot.position, slot.rotation);
    });
  }

  private buildConvexSemicircleSlotsAndModels() {
    this.rebuildSlots();

    this.slots.forEach((slot, slotIdx) => {
      const def = MODEL_CATALOG[slotIdx];
      const wrapper = createModelWrapper(def, slotIdx, slot.position, slot.rotation);
      this.scene.add(wrapper.rootGroup);
      this.models.push(wrapper);
      this.modelOrder.push(wrapper);
    });

    this.selectModel(Math.min(30, this.models.length - 1), false);
  }

  public setArcRadius(radius: number) {
    this.arcRadius = Math.max(4.4, Math.min(40, radius));
    this.rebuildSlots();
    this.applySlotsToModels();
  }

  public getArcRadius() {
    return this.arcRadius;
  }

  public getTiers(): TierInfo[] {
    return this.tiers.map(t => ({ rowId: t.rowId, nameCn: t.nameCn, count: t.count }));
  }

  public async addGlbFile(file: File, placement: GlbPlacement): Promise<ModelDefinition> {
    const url = URL.createObjectURL(file);
    try {
      const gltf = await this.gltfLoader.loadAsync(url);
      const index = this.models.length;
      const name = file.name.replace(/\.(glb|gltf)$/i, '') || `导入模型 ${index + 1}`;
      const def: ModelDefinition = {
        id: `glb-${Date.now()}-${index}`,
        index,
        tier: 0,
        col: 0,
        nameCn: name,
        nameEn: name,
        category: 'Imported',
        color: '#0284c7',
        emissiveColor: '#38bdf8'
      };

      let insertAt = 0;
      if (placement.mode === 'new-row') {
        this.newRowSerial += 1;
        const topY = this.tiers[0]?.y ?? 0;
        this.tiers.unshift({
          tier: 0,
          rowId: `new-${this.newRowSerial}`,
          nameCn: `新排 ${this.newRowSerial}`,
          nameEn: `New Row ${this.newRowSerial}`,
          y: topY + 2.1,
          count: 1,
          spanAngle: Math.PI * 0.68
        });
        insertAt = 0;
      } else {
        const ti = this.tiers.findIndex(t => t.rowId === placement.rowId);
        const target = ti >= 0 ? ti : Math.floor(this.tiers.length / 2);
        this.tiers[target].count += 1;
        insertAt = this.tiers.slice(0, target + 1).reduce((sum, t) => sum + t.count, 0) - 1;
      }

      this.rebuildSlots();
      const slot = this.slots[insertAt];
      def.tier = slot.tier;
      def.col = slot.col;
      const wrapper = createModelWrapper(def, index, slot.position, slot.rotation, gltf.scene);
      this.scene.add(wrapper.rootGroup);
      this.models.push(wrapper);
      this.modelOrder.splice(insertAt, 0, wrapper);
      this.applySlotsToModels();
      this.selectModel(index);
      wrapper.triggerBounce(6.5);
      this.particles.emitBurst(wrapper.rootGroup.position.clone(), def.color, 28);
      return def;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  private bindEvents() {
    const dom = this.renderer.domElement;
    dom.addEventListener('pointermove', this.onPointerMove);
    dom.addEventListener('pointerdown', this.onPointerDown);
    dom.addEventListener('pointerup', this.onPointerUp);
    dom.addEventListener('pointercancel', this.onPointerUp);
    dom.addEventListener('wheel', this.onWheel, { passive: false });
    window.addEventListener('resize', this.onResize);
  }

  private onPointerDown = (e: MouseEvent) => {
    this.isPointerDown = true;
    this.pointerDownPos = { x: e.clientX, y: e.clientY };

    const rect = this.renderer.domElement.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    this.mouse.x = (x / rect.width) * 2 - 1;
    this.mouse.y = -(y / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const hitboxes = this.models.map(m => m.hitBox);
    const intersects = this.raycaster.intersectObjects(hitboxes, false);

    if (intersects.length > 0) {
      const hitObj = intersects[0].object;
      const hitIndex = hitObj.userData.modelIndex as number;
      const hitWrapper = this.models[hitIndex];
      this.pressedModelWrapper = hitWrapper;

      // Start long-press timer for iOS-style drag pickup (350ms)
      if (this.longPressTimeout) {
        clearTimeout(this.longPressTimeout);
      }
      this.longPressTimeout = window.setTimeout(() => {
        this.startDragMode(hitWrapper);
      }, 350);
    } else {
      this.pressedModelWrapper = null;
    }
  };

  /**
   * Activates iOS-style pickup & jiggle mode
   */
  private startDragMode(wrapper: ModelMeshWrapper) {
    if (this.isDestroyed || !this.isPointerDown) return;

    this.isDraggingModel = true;
    this.draggedModel = wrapper;
    this.lastTargetSlotIndex = this.modelOrder.indexOf(wrapper);

    // Audio cue
    soundEffects.playGrab();

    // Mark dragged state on picked model
    wrapper.setDragged(true);

    // All other models enter iOS Jiggle mode
    this.models.forEach((m) => {
      if (m !== wrapper) {
        m.setJiggling(true);
      }
    });

    // Create drag projection plane perpendicular to camera facing direction
    const camDir = new THREE.Vector3();
    this.camera.getWorldDirection(camDir);
    this.dragPlane.setFromNormalAndCoplanarPoint(
      camDir.negate(),
      wrapper.rootGroup.position
    );

    if (this.onDragModeChange) {
      this.onDragModeChange(true, wrapper.definition.nameCn);
    }
  }

  private onPointerMove = (e: MouseEvent) => {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    this.mouse.x = (x / rect.width) * 2 - 1;
    this.mouse.y = -(y / rect.height) * 2 + 1;

    // Cancel long press timer if moved before it fired
    if (this.longPressTimeout && !this.isDraggingModel) {
      const dist = Math.hypot(e.clientX - this.pointerDownPos.x, e.clientY - this.pointerDownPos.y);
      if (dist > 8) {
        clearTimeout(this.longPressTimeout);
        this.longPressTimeout = null;
      }
    }

    // A. Dragging Model in 3D Space with REAL-TIME SEQUENTIAL SLIDING
    if (this.isDraggingModel && this.draggedModel) {
      this.raycaster.setFromCamera(this.mouse, this.camera);

      // Project ray onto drag plane
      if (this.raycaster.ray.intersectPlane(this.dragPlane, this.dragPlaneIntersect)) {
        this.draggedModel.rootGroup.position.lerp(this.dragPlaneIntersect, 0.45);
      }

      // Find closest slot among all 61 slots to current drag position
      let closestSlotIdx = 0;
      let minSlotDist = Infinity;

      for (let s = 0; s < this.slots.length; s++) {
        const slot = this.slots[s];
        const dist = this.draggedModel.rootGroup.position.distanceTo(slot.position);
        if (dist < minSlotDist) {
          minSlotDist = dist;
          closestSlotIdx = s;
        }
      }

      // When within hover distance of a slot and it's different from current placement:
      // EXECUTE SEQUENTIAL SLIDE (iOS App Icon Reordering)!
      if (minSlotDist < 2.2 && closestSlotIdx !== this.lastTargetSlotIndex) {
        this.reorderSlotsTo(this.draggedModel, closestSlotIdx);
        this.lastTargetSlotIndex = closestSlotIdx;
      }
      return;
    }

    // B. Normal Camera Sway & Orbit
    this.parallaxOffset.x = this.mouse.x * 0.55;
    this.parallaxOffset.y = this.mouse.y * 0.35;

    if (this.isPointerDown && !this.isDraggingModel) {
      const deltaX = e.clientX - this.pointerDownPos.x;
      const deltaY = e.clientY - this.pointerDownPos.y;
      this.targetOrbitAngles.theta += deltaX * 0.003;
      this.targetOrbitAngles.phi = Math.max(-0.55, Math.min(0.55, this.targetOrbitAngles.phi + deltaY * 0.003));
      this.pointerDownPos = { x: e.clientX, y: e.clientY };
    }

    this.checkHover();
  };

  /**
   * Reorders model array by inserting draggedModel at targetSlotIndex.
   * Every intermediate model immediately slides over to make room!
   */
  private reorderSlotsTo(dragged: ModelMeshWrapper, targetSlotIndex: number) {
    const currentIdx = this.modelOrder.indexOf(dragged);
    if (currentIdx === -1 || currentIdx === targetSlotIndex) return;

    // 1. Remove from current position and insert at new target slot
    this.modelOrder.splice(currentIdx, 1);
    this.modelOrder.splice(targetSlotIndex, 0, dragged);

    // 2. Update target slot positions for ALL models in modelOrder
    this.modelOrder.forEach((m, idx) => {
      const slot = this.slots[idx];
      if (m !== dragged) {
        // Other models smoothly slide toward their new slot position via lerp!
        m.setSlot(idx, slot.position, slot.rotation);
      } else {
        // Dragged model keeps its targetPos updated so when released it drops right into this slot
        m.setSlot(idx, slot.position, slot.rotation);
      }
    });

    // 3. Audio tick for icons sliding
    soundEffects.playShift();
  }

  private onPointerUp = (e: MouseEvent) => {
    const dist = Math.hypot(e.clientX - this.pointerDownPos.x, e.clientY - this.pointerDownPos.y);
    this.isPointerDown = false;

    if (this.longPressTimeout) {
      clearTimeout(this.longPressTimeout);
      this.longPressTimeout = null;
    }

    // 1. Release Dragged Model (Drop into its final shifted slot)
    if (this.isDraggingModel && this.draggedModel) {
      const dragged = this.draggedModel;

      // Drop snap sound
      soundEffects.playSwap();

      // Spark particles at drop slot
      this.particles.emitBurst(dragged.targetPos, dragged.definition.color, 36);

      // Bounce to settle in
      dragged.triggerBounce(6.5);
      dragged.setDragged(false);

      // Stop Jiggle mode on all models
      this.models.forEach(m => m.setJiggling(false));

      this.isDraggingModel = false;
      this.draggedModel = null;
      this.pressedModelWrapper = null;
      this.lastTargetSlotIndex = -1;

      if (this.onDragModeChange) {
        this.onDragModeChange(false);
      }

      if (this.onModelReorder) {
        this.onModelReorder(this.modelOrder.map(m => m.definition));
      }
      return;
    }

    // 2. Normal Quick Click (<350ms) -> Bounce model!
    if (this.pressedModelWrapper !== null && dist < 6) {
      const wrapper = this.pressedModelWrapper;
      this.selectModel(wrapper.definition.index, true);
      this.triggerBounce(wrapper.definition.index);
    }

    this.pressedModelWrapper = null;
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    if (this.isDraggingModel) return;
    const zoomDelta = e.deltaY * 0.006;
    const currentDist = this.targetCamPos.length();
    const newDist = Math.max(5.5, Math.min(26.0, currentDist + zoomDelta));
    this.targetCamPos.normalize().multiplyScalar(newDist);
  };

  private onResize = () => {
    if (this.isDestroyed || !this.container) return;
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height);
    this.initRenderTarget(width, height);
  };

  private checkHover() {
    if (this.isDraggingModel) return;
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const hitboxes = this.models.map(m => m.hitBox);
    const intersects = this.raycaster.intersectObjects(hitboxes, false);

    if (intersects.length > 0) {
      const hitObj = intersects[0].object;
      const hitIndex = hitObj.userData.modelIndex as number;

      if (this.hoveredModelIndex !== hitIndex) {
        if (this.hoveredModelIndex !== null && this.models[this.hoveredModelIndex]) {
          this.models[this.hoveredModelIndex].setHovered(false);
        }
        this.hoveredModelIndex = hitIndex;
        if (this.models[hitIndex]) {
          this.models[hitIndex].setHovered(true);
        }
      }
    } else {
      if (this.hoveredModelIndex !== null && this.models[this.hoveredModelIndex]) {
        this.models[this.hoveredModelIndex].setHovered(false);
        this.hoveredModelIndex = null;
      }
    }
  }

  public selectModel(index: number, notify: boolean = true) {
    if (index < 0 || index >= this.models.length) return;

    this.models.forEach((m, idx) => {
      m.setSelected(idx === index);
    });

    this.activeModelIndex = index;
    const targetModel = this.models[index];

    const pos = targetModel.targetPos;
    this.spotLight.target.position.set(pos.x, pos.y, pos.z);
    this.spotLight.position.set(pos.x * 0.7, pos.y + 5.5, pos.z + 5.0);

    const hexColor = parseInt(targetModel.definition.color.replace('#', '0x'), 16);
    this.spotLight.color.setHex(hexColor);

    if (notify && this.onModelSelect) {
      this.onModelSelect(targetModel.definition);
    }
  }

  public triggerBounce(index: number = this.activeModelIndex, force: number = 8.5) {
    if (index < 0 || index >= this.models.length) return;

    const wrapper = this.models[index];
    wrapper.triggerBounce(force);

    soundEffects.playBounce(index);

    const origin = wrapper.rootGroup.position.clone();
    this.particles.emitBurst(origin, wrapper.definition.color, 36);

    if (this.onModelBounce) {
      this.onModelBounce(wrapper.definition);
    }
  }

  public triggerWaveBounce() {
    this.models.forEach((m, i) => {
      const distFromCenter = Math.abs(m.rootGroup.position.x) + Math.abs(m.rootGroup.position.y) * 0.8;
      setTimeout(() => {
        if (!this.isDestroyed) {
          this.triggerBounce(i, 7.8);
        }
      }, distFromCenter * 75);
    });
  }

  public triggerTierBounce(tierNumber: number) {
    this.models.forEach((m, i) => {
      if (m.definition.tier === tierNumber) {
        setTimeout(() => {
          if (!this.isDestroyed) {
            this.triggerBounce(i, 8.2);
          }
        }, (i % 17) * 60);
      }
    });
  }

  public setCameraPreset(preset: CameraPreset) {
    const config = CAMERA_CONFIGS[preset];
    if (!config) return;

    this.targetCamPos.set(...config.position);
    this.targetLookAt.set(...config.target);
    this.targetFov = config.fov;
    this.targetOrbitAngles = { theta: 0, phi: 0 };
    soundEffects.playClick();
  }

  public updateOptics(settings: Partial<OpticsSettings>) {
    this.optics = { ...this.optics, ...settings };
    this.updateShaderUniforms();

    if (settings.fov !== undefined) {
      this.targetFov = settings.fov;
    }
  }

  private updateShaderUniforms() {
    const u = this.postMaterial.uniforms;
    u.uStretchX.value = this.optics.stretchX;
    u.uStretchY.value = this.optics.stretchY;
    u.uDistortion.value = this.optics.distortion;
    u.uChromatic.value = this.optics.chromatic;
    u.uVignette.value = this.optics.vignette;
    u.uEnabled.value = this.optics.enableShader ? 1.0 : 0.0;
  }

  public getOptics(): OpticsSettings {
    return { ...this.optics };
  }

  public getActiveModel(): ModelDefinition {
    return this.models[this.activeModelIndex].definition;
  }

  public getModels(): ModelDefinition[] {
    return this.modelOrder.map(m => m.definition);
  }

  private animate = () => {
    if (this.isDestroyed) return;

    this.animationFrameId = requestAnimationFrame(this.animate);

    const delta = Math.min(this.clock.getDelta(), 0.08);
    const time = this.clock.getElapsedTime();

    this.postMaterial.uniforms.uTime.value = time;

    // Camera Lerp & Orbit (disabled while dragging a model)
    if (!this.isDraggingModel) {
      this.orbitAngles.theta += (this.targetOrbitAngles.theta - this.orbitAngles.theta) * 0.08;
      this.orbitAngles.phi += (this.targetOrbitAngles.phi - this.orbitAngles.phi) * 0.08;

      const camBase = this.targetCamPos.clone();
      camBase.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.orbitAngles.theta);
      camBase.y += Math.sin(this.orbitAngles.phi) * 4.5;

      camBase.x += this.parallaxOffset.x;
      camBase.y += this.parallaxOffset.y;

      this.currentCamPos.lerp(camBase, 0.06);
      this.currentLookAt.lerp(this.targetLookAt, 0.06);

      this.camera.position.copy(this.currentCamPos);
      this.camera.lookAt(this.currentLookAt);

      if (Math.abs(this.camera.fov - this.targetFov) > 0.1) {
        this.camera.fov += (this.targetFov - this.camera.fov) * 0.08;
        this.camera.updateProjectionMatrix();
      }
    }

    // Update Models (smooth lerping to target slots + physics + jiggle)
    this.models.forEach(m => m.update(time, delta));

    // Update Particles
    this.particles.update(time, delta);

    if (this.renderTarget) {
      this.renderer.setRenderTarget(this.renderTarget);
      this.renderer.render(this.scene, this.camera);

      this.renderer.setRenderTarget(null);
      this.renderer.render(this.postScene, this.postCamera);
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  };

  public dispose() {
    this.isDestroyed = true;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }

    const dom = this.renderer.domElement;
    dom.removeEventListener('pointermove', this.onPointerMove);
    dom.removeEventListener('pointerdown', this.onPointerDown);
    dom.removeEventListener('pointerup', this.onPointerUp);
    dom.removeEventListener('pointercancel', this.onPointerUp);
    dom.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('resize', this.onResize);

    if (this.renderTarget) {
      this.renderTarget.dispose();
    }
    this.renderer.dispose();
    if (dom.parentElement) {
      dom.parentElement.removeChild(dom);
    }
  }
}
