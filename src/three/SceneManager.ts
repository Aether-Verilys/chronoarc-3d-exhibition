import { SunsetGallery } from './SunsetGallery';
import { CyberGallery } from './CyberGallery';
import { SubtleBloom } from './SubtleBloom';
import { createSkyEnvironment } from './SkyEnvironment';
import * as THREE from 'three';
import { CameraPreset, CameraViewConfig, GlbPlacement, ModelDefinition, OpticsSettings, TierInfo, BACKDROP_THEMES } from '../types/scene';
import { DEFAULT_ROW_STEP, MODEL_CATALOG, ModelMeshWrapper, TIER_CONFIGS, countForRow, createCatalogDefinition, createModelWrapper, fitObjectToSlot, spanAngleForCount } from './ModelGenerators';
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
  'front': {
    id: 'front',
    label: 'Front',
    labelCn: '正面',
    position: [0, 0.3, 8.6],
    target: [0, 0.0, -1.2],
    fov: 72
  },
  'low-angle': {
    id: 'low-angle',
    label: 'Low Angle',
    labelCn: '仰角',
    position: [0, -3.4, 7.2],
    target: [0, 0.8, -1.2],
    fov: 80
  },
};

export class SceneManager {
  private sunsetGallery: SunsetGallery | null = null;
  private cyberGallery: CyberGallery | null = null;
  private cyberEnabled = false;
  private sunsetEnabled = false;
  private sunsetPointer: number | null = null;
  public async setSunsetEnabled(enabled: boolean) {
    this.exitModelFocus();
    if(enabled && !this.sunsetGallery) this.sunsetGallery = new SunsetGallery(this.renderer);
    this.sunsetEnabled = enabled;
    this.cyberEnabled = false;
    this.renderer.shadowMap.enabled = enabled;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMappingExposure = enabled ? 0.85 : (this.skyEnabled ? 0.78 : 1.05);
    this.updateShaderUniforms();
    if(enabled) {
      this.sunsetGallery!.resize(this.container.clientWidth,this.container.clientHeight);
      await this.sunsetGallery!.ready;
    }
  }
  public async setCyberEnabled(enabled: boolean) {
    this.exitModelFocus();
    if (enabled && !this.cyberGallery) this.cyberGallery = new CyberGallery(this.renderer);
    this.cyberEnabled = enabled;
    this.sunsetEnabled = false;
    this.renderer.shadowMap.enabled = enabled;
    this.renderer.toneMappingExposure = enabled ? 0.9 : 1.05;
    this.updateShaderUniforms();
    if (enabled) { this.cyberGallery!.resize(this.container.clientWidth, this.container.clientHeight); await this.cyberGallery!.ready; }
  }

  private skyEnvironment: ReturnType<typeof createSkyEnvironment> | null = null;
  private skyEnabled = false;
  public setSkyEnabled(enabled: boolean) {
    void this.setSunsetEnabled(false);
    this.cyberEnabled = false;
    if (enabled && !this.skyEnvironment) {
      this.skyEnvironment = createSkyEnvironment(this.renderer);
      this.skyEnvironment.updateSlots(this.slots);
      this.scene.add(this.skyEnvironment.room);
    }
    if (this.skyEnvironment) this.skyEnvironment.room.visible = enabled;
    this.renderer.toneMappingExposure = enabled ? 0.78 : 1.05;
    this.scene.children.forEach(object => {
      if (object instanceof THREE.Light) {
        object.userData.originalIntensity ??= object.intensity;
        object.intensity = object.userData.originalIntensity * (enabled ? 0.45 : 1);
      }
    });
    this.skyEnabled = enabled;
    if (this.backdrop) this.backdrop.visible = !enabled;
    if (this.backdropB) this.backdropB.visible = !enabled;
    this.scene.background = new THREE.Color(enabled ? 0x37332e : 0x0b1220);
    this.scene.environment = enabled ? this.skyEnvironment!.environment : null;
    this.scene.environmentIntensity = enabled ? 0.3 : 0;
  }

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
  private bloom = new SubtleBloom();

  // Slots & Ordered Models List
  private slots: MatrixSlot[] = [];
  private models: ModelMeshWrapper[] = [];
  private modelOrder: ModelMeshWrapper[] = [];
  private particles: ParticleSystem;
  private spotLight: THREE.SpotLight;
  private gltfLoader = new GLTFLoader();
  private arcRadius = 10;
  private rowStep = DEFAULT_ROW_STEP;
  private readonly baseArcRadius = 11.2;
  private readonly zCenter = -11.2 * 0.65;
  private newRowSerial = 0;
  private tiers = TIER_CONFIGS.map(t => ({ ...t, rowId: `row-${t.tier}` }));

  // State
  private activeModelIndex: number = 47; // Center model of 9 rows
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
  private targetCamPos = new THREE.Vector3(0, 0.3, 8.6);
  private currentCamPos = new THREE.Vector3(0, 0.3, 8.6);
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
  private backdrop: THREE.Mesh | null = null;
  private backdropMat: THREE.MeshBasicMaterial | null = null;
  private backdropB: THREE.Mesh | null = null;
  private backdropMatB: THREE.MeshBasicMaterial | null = null;
  private backdropFade = 1;
  private backdropFadeTarget = 1;
  private backdropDepth = 2;
  private backdropScale = 1.3;
  private currentThemeId = BACKDROP_THEMES[0].id;
  private textureLoader = new THREE.TextureLoader();
  private textureCache = new Map<string, THREE.Texture>();
  private readonly maxOrbitTheta = 0.2;
  private readonly maxOrbitPhi = 0.16;

  // Loop & timing
  private clock = new THREE.Clock();
  private animationFrameId: number | null = null;
  private isDestroyed = false;
  private focusRotationBase = new THREE.Quaternion();
  private focusRotation = new THREE.Vector2();
  private targetFocusRotation = new THREE.Vector2();
  private focusPointerId: number | null = null;
  private pendingClickModel: number | null = null;
  private isModelFocused = false;
  private focusedModelIndex: number | null = null;
  private backdropFocus = 0;
  private preFocusCamera = { position: new THREE.Vector3(0, 0.3, 8.6), target: new THREE.Vector3(0, 0, -1.2), fov: 72 };

  // Callbacks
  public onModelSelect?: (model: ModelDefinition) => void;
  public onModelBounce?: (model: ModelDefinition) => void;
  public onDragModeChange?: (isDragging: boolean, draggedName?: string) => void;
  public onModelReorder?: (reorderedModels: ModelDefinition[]) => void;
  public onModelFocusChange?: (focused: boolean, model?: ModelDefinition) => void;

  constructor(container: HTMLElement) {
    this.container = container;
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    // 1. Core Scene with Bright Spatial Void (No Floor)
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b1220);

    // 2. Camera
    this.camera = new THREE.PerspectiveCamera(this.optics.fov, width / height, 0.1, 100);
    this.camera.position.set(0, 0.3, 8.6);
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

    this.addFrontBackdrop();

    // 7. Build Slots & Models
    this.buildConvexSemicircleSlotsAndModels();
    this.loadFoodModels();

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
    this.bloom.setSize(width * dpr, height * dpr);
    this.postMaterial.uniforms.tBloom.value = this.bloom.texture;
    this.updateShaderUniforms();
  }

  private addFrontBackdrop() {
    const aspect = 8192 / 4332;
    const height = 28;
    const width = height * aspect;

    const createPlane = () => {
      const geo = new THREE.PlaneGeometry(width, height);
      const mat = new THREE.MeshBasicMaterial({
        color: 0x1a2333,
        toneMapped: false,
        depthWrite: false,
        transparent: true,
        opacity: 1
      });
      const mesh = new THREE.Mesh(geo, mat);
      this.scene.add(mesh);
      return { mesh, mat };
    };

    const a = createPlane();
    this.backdrop = a.mesh;
    this.backdropMat = a.mat;

    const b = createPlane();
    this.backdropB = b.mesh;
    this.backdropMatB = b.mat;
    b.mat.opacity = 0;

    this.applyBackdropTransform();

    // Preload all theme textures
    BACKDROP_THEMES.forEach(theme => {
      this.textureLoader.load(theme.path, texture => {
        if (this.isDestroyed) { texture.dispose(); return; }
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
        this.textureCache.set(theme.id, texture);
        if (theme.id === this.currentThemeId && this.backdropMat) {
          this.backdropMat.map = texture;
          this.backdropMat.color.set(0xffffff);
          this.backdropMat.needsUpdate = true;
        }
      });
    });
  }

  public setBackdropTheme(themeId: string) {
    const theme = BACKDROP_THEMES.find(t => t.id === themeId);
    if (!theme || theme.id === this.currentThemeId) return;
    this.currentThemeId = theme.id;

    const tex = this.textureCache.get(theme.id);
    if (!tex || !this.backdropMatB) return;

    // Put new texture on layer B, start crossfade
    this.backdropMatB.map = tex;
    this.backdropMatB.color.set(0xffffff);
    this.backdropMatB.needsUpdate = true;
    this.backdropFade = 0;
    this.backdropFadeTarget = 1;
  }

  public getBackdropThemeId() {
    return this.currentThemeId;
  }

  private applyBackdropTransform() {
    const z = this.zCenter - this.backdropDepth;
    if (this.backdrop) {
      this.backdrop.position.set(0, 1.2, z);
      this.backdrop.scale.setScalar(this.backdropScale);
    }
    if (this.backdropB) {
      this.backdropB.position.set(0, 1.2, z + 0.01);
      this.backdropB.scale.setScalar(this.backdropScale);
    }
  }

  public setBackdropDepth(depth: number) {
    this.backdropDepth = Math.max(2, Math.min(28, depth));
    this.applyBackdropTransform();
  }

  public setBackdropScale(scale: number) {
    this.backdropScale = Math.max(0.5, Math.min(2.4, scale));
    this.applyBackdropTransform();
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
    this.skyEnvironment?.updateSlots(this.slots);
    this.modelOrder.forEach((m, idx) => {
      const slot = this.slots[idx];
      if (!slot) return;
      m.definition.tier = slot.tier;
      m.definition.col = slot.col;
      m.setSlot(idx, slot.position, slot.rotation);
    });
  }

  private async loadFoodModels() {
    const foodModels = [
      { file: '/models/food/ramen.glb', nameCn: '手办拉面' },
      { file: '/models/food/ramen-2.glb', nameCn: '手办拉面·彩釉' },
      { file: '/models/food/ramen-3.glb', nameCn: '手办拉面·浓汤' },
      { file: '/models/food/ramen-4.glb', nameCn: '手办拉面·玉子' },
      { file: '/models/food/sushi.glb', nameCn: '手办寿司拼盘' },
      { file: '/models/food/burger.glb', nameCn: '手办汉堡薯条' },
      { file: '/models/food/donut.glb', nameCn: '手办彩釉甜甜圈' },
      { file: '/models/food/cake.glb', nameCn: '手办生日蛋糕' },
      { file: '/models/food/pizza.glb', nameCn: '手办披萨切片' }
    ];
    await Promise.all(foodModels.map(async (food, foodIndex) => {
      try {
        const gltf = await this.gltfLoader.loadAsync(food.file);
        for (let index = foodIndex; index < this.models.length; index += foodModels.length) {
          const wrapper = this.models[index];
          if (!wrapper) continue;
          const content = wrapper.contentGroup;
          content.clear();
          content.add(fitObjectToSlot(gltf.scene.clone(true)));
          wrapper.definition.nameCn = food.nameCn;
          wrapper.definition.nameEn = `Collectible Food #${foodIndex + 1}`;
          wrapper.definition.category = 'Food Figurine';
        }
      } catch (error) {
        console.warn(`食物模型加载失败: ${food.file}`, error);
      }
    }));
  }

  private buildConvexSemicircleSlotsAndModels() {
    this.rebuildSlots();
    this.skyEnvironment?.updateSlots(this.slots);

    this.slots.forEach((slot, slotIdx) => {
      const tier = this.tiers[slot.tier];
      const def = slotIdx < MODEL_CATALOG.length
        ? MODEL_CATALOG[slotIdx]
        : createCatalogDefinition(slot.tier, slot.col, slotIdx, tier?.nameCn ?? `第${slot.tier + 1}排`);
      def.index = slotIdx;

      // Compute entrance offset: odd rows (0,2,4,...) slide from left, even rows (1,3,5,...) from right
      const rowIsOdd = slot.tier % 2 === 0; // tier 0 = row 1 (odd)
      const sweep = this.rowSweep(tier.spanAngle);
      const offTheta = rowIsOdd ? (-sweep - 0.6) : (sweep + 0.6);
      const r = this.arcRadius;
      const offX = r * Math.sin(offTheta);
      const offZ = this.zCenter + r * (1 - Math.cos(offTheta));
      const startPos = new THREE.Vector3(offX, slot.position.y, offZ);
      const startRot = new THREE.Euler(slot.rotation.x, -offTheta, 0, 'YXZ');

      const wrapper = createModelWrapper(def, slotIdx, startPos, startRot);
      this.scene.add(wrapper.rootGroup);
      this.models.push(wrapper);
      this.modelOrder.push(wrapper);

      // Stagger: each row starts together, cols stagger within row
      const rowDelay = slot.tier * 350;
      const colDelay = slot.col * 80;
      setTimeout(() => {
        wrapper.setSlot(slotIdx, slot.position, slot.rotation);
      }, 600 + rowDelay + colDelay);
    });

    this.selectModel(Math.min(Math.floor(this.models.length / 2), this.models.length - 1), false);
  }

  public setRowStep(step: number) {
    step = Math.max(1, Math.min(6, Math.round(step)));
    if (step === this.rowStep) return;
    this.exitModelFocus();
    this.rowStep = step;

    // Recalculate counts for all tiers
    const totalRows = this.tiers.length;
    this.tiers.forEach((t, i) => {
      t.count = countForRow(i, totalRows, step);
      t.spanAngle = spanAngleForCount(t.count);
    });

    // Rebuild scene: remove old models, regenerate
    this.models.forEach(m => this.scene.remove(m.rootGroup));
    this.models = [];
    this.modelOrder = [];
    this.buildConvexSemicircleSlotsAndModels();
    this.loadFoodModels();
  }

  public getRowStep() {
    return this.rowStep;
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
        const rowIndex = this.tiers.length;
        const count = countForRow(rowIndex, rowIndex + 1);
        const bottomY = this.tiers[this.tiers.length - 1]?.y ?? 0;
        const nameCn = `第${rowIndex + 1}排`;
        this.tiers.push({
          tier: rowIndex,
          rowId: `new-${this.newRowSerial}`,
          nameCn,
          nameEn: `Row ${rowIndex + 1}`,
          y: bottomY - 2.1,
          count,
          spanAngle: spanAngleForCount(count)
        });
        insertAt = this.tiers.slice(0, rowIndex).reduce((sum, t) => sum + t.count, 0);
        const centerCol = Math.floor((count - 1) / 2);

        this.rebuildSlots();
        for (let c = 0; c < count; c++) {
          const slot = this.slots[insertAt + c];
          if (c === centerCol) {
            def.tier = slot.tier;
            def.col = slot.col;
            const wrapper = createModelWrapper(def, index, slot.position, slot.rotation, gltf.scene);
            this.scene.add(wrapper.rootGroup);
            this.models.push(wrapper);
            this.modelOrder.splice(insertAt + c, 0, wrapper);
          } else {
            const fillerIndex = this.models.length;
            const fillerDef = createCatalogDefinition(slot.tier, c, fillerIndex, nameCn);
            const filler = createModelWrapper(fillerDef, fillerIndex, slot.position, slot.rotation);
            this.scene.add(filler.rootGroup);
            this.models.push(filler);
            this.modelOrder.splice(insertAt + c, 0, filler);
          }
        }

        this.applySlotsToModels();
        this.selectModel(index);
        const added = this.models[index];
        added.triggerBounce(6.5);
        this.particles.emitBurst(added.rootGroup.position.clone(), def.color, 28);
        return def;
      } else {
        const ti = this.tiers.findIndex(t => t.rowId === placement.rowId);
        const target = ti >= 0 ? ti : Math.floor(this.tiers.length / 2);
        this.tiers[target].count += 1;
        this.tiers[target].spanAngle = spanAngleForCount(this.tiers[target].count);
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
    dom.addEventListener('dblclick', this.onDoubleClick);
    dom.addEventListener('click', this.onModelClick);
    dom.addEventListener('pointerup', this.onPointerUp);
    dom.addEventListener('pointercancel', this.onPointerUp);
    dom.addEventListener('lostpointercapture', this.onPointerUp);
    dom.style.touchAction = 'none';
    dom.addEventListener('wheel', this.onWheel, { passive: false });
    window.addEventListener('resize', this.onResize);
  }

  private onModelClick = (e: MouseEvent) => {
    if (this.sunsetEnabled || this.cyberEnabled) {
      if (e.detail === 1) { const rect = this.renderer.domElement.getBoundingClientRect(); (this.cyberEnabled ? this.cyberGallery : this.sunsetGallery)?.handleClick(e.clientX, e.clientY, rect); }
      return;
    }
    const index = this.pendingClickModel;
    this.pendingClickModel = null;
    // The browser counts clicks in a double-click sequence; only the first bounces.
    if (index !== null && e.detail === 1) this.triggerBounce(index);
  };

  private onDoubleClick = (e: MouseEvent) => {
    if(this.sunsetEnabled || this.cyberEnabled) {
      const rect = this.renderer.domElement.getBoundingClientRect();
      (this.cyberEnabled ? this.cyberGallery : this.sunsetGallery)?.handleDoubleClick(e.clientX, e.clientY, rect);
      return;
    }
    if (this.isDraggingModel) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.models.map(m => m.hitBox), false);
    if (intersects.length === 0) return;
    const index = intersects[0].object.userData.modelIndex as number;
    if (this.isModelFocused && this.focusedModelIndex === index) this.exitModelFocus();
    else this.focusModel(index);
  };

  private onPointerDown = (e: PointerEvent) => {
    if (!e.isPrimary || e.button !== 0) return;
    this.pendingClickModel = null;
    if(this.sunsetEnabled || this.cyberEnabled) {
      this.sunsetPointer=e.pointerId;
      this.pointerDownPos={x:e.clientX,y:e.clientY};
      this.renderer.domElement.setPointerCapture(e.pointerId);
      if (!this.cyberEnabled) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.sunsetGallery?.handlePointerDown(e.clientX, e.clientY, rect, e.pointerId);
      }
      return;
    }
    if (this.isModelFocused) {
      this.focusPointerId = e.pointerId;
      this.pointerDownPos = { x: e.clientX, y: e.clientY };
      this.renderer.domElement.setPointerCapture(e.pointerId);
      return;
    }
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
    // Use world origin Z as coplanar point so the plane stays stable across the full arc
    const camDir = new THREE.Vector3();
    this.camera.getWorldDirection(camDir);
    this.dragPlane.setFromNormalAndCoplanarPoint(
      camDir.negate(),
      new THREE.Vector3(0, wrapper.rootGroup.position.y, 0)
    );

    if (this.onDragModeChange) {
      this.onDragModeChange(true, wrapper.definition.nameCn);
    }
  }

  private onPointerMove = (e: PointerEvent) => {
    if(this.sunsetEnabled || this.cyberEnabled) {
      if(this.sunsetPointer===e.pointerId) {
        if (!this.cyberEnabled) {
          const rect = this.renderer.domElement.getBoundingClientRect();
          this.sunsetGallery?.handlePointerMove(e.clientX, e.clientY, rect, e.pointerId);
        }
        (this.cyberEnabled ? this.cyberGallery : this.sunsetGallery)?.orbit(e.clientX-this.pointerDownPos.x,e.clientY-this.pointerDownPos.y);
        this.pointerDownPos={x:e.clientX,y:e.clientY};
      }
      return;
    }
    if (this.isModelFocused) {
      if (e.pointerId === this.focusPointerId) {
        const dx = e.clientX - this.pointerDownPos.x;
        const dy = e.clientY - this.pointerDownPos.y;
        this.targetFocusRotation.x = THREE.MathUtils.clamp(this.targetFocusRotation.x + dy * 0.006, -Math.PI / 4, Math.PI / 4);
        this.targetFocusRotation.y = THREE.MathUtils.clamp(this.targetFocusRotation.y + dx * 0.006, -Math.PI / 3, Math.PI / 3);
        this.pointerDownPos = { x: e.clientX, y: e.clientY };
      }
      return;
    }
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

      // Screen-space slot matching: project dragged model & every slot to screen pixels,
      // find the slot whose 2D projection is closest to the dragged model's 2D projection
      const halfW = this.renderer.domElement.clientWidth / 2;
      const halfH = this.renderer.domElement.clientHeight / 2;

      const dragPos = this.draggedModel.rootGroup.position.clone().project(this.camera);
      const dragScreen = { x: (dragPos.x + 1) * halfW, y: (-dragPos.y + 1) * halfH };

      let closestSlotIdx = 0;
      let minScreenDist = Infinity;
      const slotVec = new THREE.Vector3();

      for (let s = 0; s < this.slots.length; s++) {
        slotVec.copy(this.slots[s].position).project(this.camera);
        const sx = (slotVec.x + 1) * halfW;
        const sy = (-slotVec.y + 1) * halfH;
        const dist = Math.hypot(sx - dragScreen.x, sy - dragScreen.y);
        if (dist < minScreenDist) {
          minScreenDist = dist;
          closestSlotIdx = s;
        }
      }

      // Trigger reorder when screen overlap is close enough (pixels)
      if (minScreenDist < 80 && closestSlotIdx !== this.lastTargetSlotIndex) {
        this.reorderSlotsTo(this.draggedModel, closestSlotIdx);
        this.lastTargetSlotIndex = closestSlotIdx;
      }
      return;
    }

    // B. Normal Camera Sway & Orbit
    this.parallaxOffset.x = this.mouse.x * 0.18;
    this.parallaxOffset.y = this.mouse.y * 0.1;

    if (this.isPointerDown && !this.isDraggingModel) {
      const deltaX = e.clientX - this.pointerDownPos.x;
      const deltaY = e.clientY - this.pointerDownPos.y;
      this.targetOrbitAngles.theta = Math.max(
        -this.maxOrbitTheta,
        Math.min(this.maxOrbitTheta, this.targetOrbitAngles.theta + deltaX * 0.0014)
      );
      this.targetOrbitAngles.phi = Math.max(
        -this.maxOrbitPhi,
        Math.min(this.maxOrbitPhi, this.targetOrbitAngles.phi + deltaY * 0.0012)
      );
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

  private onPointerUp = (e: PointerEvent) => {
    if(this.sunsetPointer===e.pointerId) {
      if (!this.cyberEnabled) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.sunsetGallery?.handlePointerUp(e.clientX, e.clientY, rect, e.pointerId);
      }
      this.sunsetPointer=null;
      if(this.renderer.domElement.hasPointerCapture(e.pointerId)) this.renderer.domElement.releasePointerCapture(e.pointerId);
      return;
    }
    if (this.isModelFocused || this.focusPointerId !== null) {
      if (e.pointerId === this.focusPointerId) {
        this.focusPointerId = null;
        if (this.renderer.domElement.hasPointerCapture(e.pointerId)) {
          this.renderer.domElement.releasePointerCapture(e.pointerId);
        }
      }
      this.isPointerDown = false;
      this.pressedModelWrapper = null;
      return;
    }
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
      this.pendingClickModel = e.type === 'pointerup' ? wrapper.definition.index : null;
    }

    this.pressedModelWrapper = null;
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    if (this.isDraggingModel) return;
    if (this.cyberEnabled) {
      this.cyberGallery?.zoom(e.deltaY);
      return;
    }
    const zoomDelta = e.deltaY * 0.006;
    const currentDist = this.targetCamPos.length();
    const newDist = Math.max(5.5, Math.min(26.0, currentDist + zoomDelta));
    this.targetCamPos.normalize().multiplyScalar(newDist);
  };

  private onResize = () => {
    if (this.isDestroyed || !this.container) return;
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;

    this.sunsetGallery?.resize(width, height); this.cyberGallery?.resize(width, height);
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

  public focusModel(index: number) {
    if (index < 0 || index >= this.models.length) return;
    if (!this.isModelFocused) {
      this.preFocusCamera.position.copy(this.targetCamPos);
      this.preFocusCamera.target.copy(this.targetLookAt);
      this.preFocusCamera.fov = this.targetFov;
    }
    if (this.focusedModelIndex !== null) {
      this.models[this.focusedModelIndex]?.contentGroup.quaternion.copy(this.focusRotationBase);
    }
    const model = this.models[index];
    this.focusRotationBase.copy(model.contentGroup.quaternion);
    this.focusRotation.set(0, 0);
    this.targetFocusRotation.set(0, 0);
    const center = model.rootGroup.position.clone();
    const offset = this.camera.position.clone().sub(center).normalize();
    this.targetCamPos.copy(center).add(offset.multiplyScalar(3.2));
    this.targetLookAt.copy(center);
    this.targetFov = 55;
    this.isModelFocused = true;
    this.focusedModelIndex = index;
    this.selectModel(index);
    this.onModelFocusChange?.(true, model.definition);
  }

  public exitModelFocus() {
    if (!this.isModelFocused) return;
    this.targetCamPos.copy(this.preFocusCamera.position);
    this.targetLookAt.copy(this.preFocusCamera.target);
    this.targetFov = this.preFocusCamera.fov;
    if (this.focusedModelIndex !== null) {
      this.models[this.focusedModelIndex]?.contentGroup.quaternion.copy(this.focusRotationBase);
    }
    const pointerId = this.focusPointerId;
    this.focusPointerId = null;
    if (pointerId !== null && this.renderer.domElement.hasPointerCapture(pointerId)) {
      this.renderer.domElement.releasePointerCapture(pointerId);
    }
    this.isModelFocused = false;
    this.focusedModelIndex = null;
    this.onModelFocusChange?.(false);
  }

  public get isFocused() { return this.isModelFocused; }

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
    u.uEnabled.value = (this.sunsetEnabled || this.cyberEnabled) ? 0 : (this.optics.enableShader ? 1.0 : 0.0);
    u.uBloomStrength.value = (this.sunsetEnabled || this.cyberEnabled) ? 0.22 : 0.32;
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
      if (!this.isModelFocused) {
      camBase.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.orbitAngles.theta);
      camBase.y += Math.sin(this.orbitAngles.phi) * 2.2;

      camBase.x += this.parallaxOffset.x;
      camBase.y += this.parallaxOffset.y;
      }

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
    if (this.isModelFocused && this.focusedModelIndex !== null) {
      this.focusRotation.lerp(this.targetFocusRotation, 1 - Math.exp(-15 * delta));
      const rotation = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(this.focusRotation.x, this.focusRotation.y, 0, 'YXZ')
      );
      this.models[this.focusedModelIndex]?.contentGroup.quaternion
        .copy(rotation).multiply(this.focusRotationBase);
    }

    // Soften the gallery backdrop while a model is focused. The model remains crisp.
    const focusTarget = this.isModelFocused ? 1 : 0;
    this.backdropFocus += (focusTarget - this.backdropFocus) * Math.min(1, delta * 5);
    const soften = 1 - this.backdropFocus * 0.42;
    if (this.backdropMat) {
      this.backdropMat.color.setRGB(soften, soften, soften);
    }
    if (this.backdropMatB) {
      this.backdropMatB.color.setRGB(soften, soften, soften);
    }

    // Update Particles
    this.particles.update(time, delta);

    // Backdrop crossfade
    if (this.backdropFade !== this.backdropFadeTarget) {
      this.backdropFade += (this.backdropFadeTarget - this.backdropFade) * Math.min(1, delta * 3.2);
      if (Math.abs(this.backdropFade - this.backdropFadeTarget) < 0.005) {
        this.backdropFade = this.backdropFadeTarget;
      }
      if (this.backdropMat) this.backdropMat.opacity = 1 - this.backdropFade;
      if (this.backdropMatB) this.backdropMatB.opacity = this.backdropFade;

      // When fade completes, swap A ← B so A is always the current
      if (this.backdropFade >= 1) {
        if (this.backdropMat && this.backdropMatB) {
          this.backdropMat.map = this.backdropMatB.map;
          this.backdropMat.opacity = 1;
          this.backdropMat.needsUpdate = true;
          this.backdropMatB.opacity = 0;
          this.backdropMatB.needsUpdate = true;
          this.backdropFade = 1;
          this.backdropFadeTarget = 1;
        }
      }
    }

    if (this.sunsetEnabled || this.cyberEnabled) (this.cyberEnabled ? this.cyberGallery : this.sunsetGallery)?.update(delta, time);

    if (this.renderTarget) {
      this.renderer.setRenderTarget(this.renderTarget);
      this.renderer.render((this.cyberEnabled ? this.cyberGallery!.scene : this.sunsetEnabled ? this.sunsetGallery!.scene : this.scene), (this.cyberEnabled ? this.cyberGallery!.camera : this.sunsetEnabled ? this.sunsetGallery!.camera : this.camera));
      this.bloom.render(this.renderer, this.renderTarget.texture);

      this.renderer.setRenderTarget(null);
      this.renderer.render(this.postScene, this.postCamera);
    } else {
      this.renderer.render((this.cyberEnabled ? this.cyberGallery!.scene : this.sunsetEnabled ? this.sunsetGallery!.scene : this.scene), (this.cyberEnabled ? this.cyberGallery!.camera : this.sunsetEnabled ? this.sunsetGallery!.camera : this.camera));
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
    dom.removeEventListener('dblclick', this.onDoubleClick);
    dom.removeEventListener('click', this.onModelClick);
    dom.removeEventListener('pointerup', this.onPointerUp);
    dom.removeEventListener('pointercancel', this.onPointerUp);
    dom.removeEventListener('lostpointercapture', this.onPointerUp);
    dom.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('resize', this.onResize);

    if (this.renderTarget) {
      this.renderTarget.dispose();
    }
    if (this.backdrop) {
      this.backdrop.geometry.dispose();
      if (this.backdropMat) {
        this.backdropMat.dispose();
      }
    }
    if (this.backdropB) {
      this.backdropB.geometry.dispose();
      if (this.backdropMatB) {
        this.backdropMatB.dispose();
      }
    }
    this.textureCache.forEach(t => t.dispose());
    this.textureCache.clear();
    this.skyEnvironment?.dispose();
    this.sunsetGallery?.dispose();
    this.cyberGallery?.dispose();
    this.particles.dispose();
    this.bloom.dispose();
    this.postMaterial.dispose();
    this.postQuad.geometry.dispose();
    this.renderer.dispose();
    if (dom.parentElement) {
      dom.parentElement.removeChild(dom);
    }
  }
}
