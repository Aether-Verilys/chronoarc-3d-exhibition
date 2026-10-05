import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export class SunsetGallery {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(48, 1, 0.1, 100);
  readonly ready: Promise<void>;
  private disposed = false;
  private resources = new Set<THREE.BufferGeometry | THREE.Material | THREE.Texture>();
  private environment: THREE.WebGLRenderTarget;
  private target = new THREE.Vector3(0, 3.5, -2.7);
  private yaw = 0;
  private pitch = 0;
  protected interactive = new THREE.Group();
  private focused: THREE.Object3D | null = null;
  private savedCamera = new THREE.Vector3();
  private savedTarget = new THREE.Vector3();
  private cameraGoal = new THREE.Vector3();
  private targetGoal = new THREE.Vector3();
  private transition = 1;
  constructor(renderer: THREE.WebGLRenderer) {
    this.scene.add(this.interactive);
    this.scene.background = new THREE.Color('#9caeca');
    this.camera.position.set(0.3, 4.1, 13.7);
    this.camera.lookAt(this.target);
    this.cameraGoal.copy(this.camera.position);
    this.targetGoal.copy(this.target);
    const wall = new THREE.MeshStandardMaterial({ color: '#879bb8', roughness: 0.95 });
    const white = new THREE.MeshStandardMaterial({ color: '#e8e8e7', roughness: 0.6 });
    const floor = new THREE.MeshStandardMaterial({ color: '#beab91', roughness: 0.68 });
    floor.onBeforeCompile = shader => {
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 floorPos;').replace('#include <begin_vertex>', '#include <begin_vertex>\nfloorPos = position;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
        varying vec3 floorPos;
        float hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          vec2 p = floorPos.xz;
          float row = floor(p.y / 0.42);
          vec2 uv = vec2((p.x+mod(row,3.0)*1.1)/3.4,p.y/0.42);
          vec2 seam = min(fract(uv),1.0-fract(uv));
          float joint = 1.0-smoothstep(0.003,0.018,min(seam.x,seam.y));
          float grain = sin(p.y*170.0+sin(p.x*1.7)*2.0)*0.02;
          diffuseColor.rgb *= (0.93+hash(floor(uv))*0.12+grain)*(1.0-joint*0.18);`);
    };
    [wall, white, floor].forEach(m => this.resources.add(m));
    this.box([18, 0.2, 22], [0, -0.1, 1], floor);
    this.box([18, 11, 0.25], [0, 5.5, -5], wall);
    this.box([0.25, 11, 20], [-9, 5.5, 4], wall);
    this.box([18, 0.2, 20], [0, 11, 4], white);
    for (const x of [-6.7, 6.7]) this.box([0.13, 10.5, 0.13], [x, 5.25, -4.78], white);
    this.box([18, 0.20, 0.20], [0, 0.10, -4.73], white);
    this.box([0.3, 11, 1.2], [8.7, 5.5, -4.4], white);
    this.box([0.3, 0.65, 16], [8.7, 0.325, 3], white);
    for (const z of [-3.8, 0, 3.8, 7.6]) this.box([0.18, 10.2, 0.1], [8.65, 5.75, z], white);

    const sky = new THREE.ShaderMaterial({ side: THREE.DoubleSide,
      vertexShader: 'varying vec2 v; void main(){v=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: 'varying vec2 v;void main(){vec3 c=mix(vec3(1.,.67,.43),vec3(.47,.57,.82),smoothstep(.1,1.,v.y));gl_FragColor=vec4(c,1.);}' });
    this.resources.add(sky);
    const outside = new THREE.Mesh(new THREE.PlaneGeometry(30, 20), sky);
    outside.position.set(9.3, 6, 1); outside.rotation.y = -Math.PI / 2;
    this.resources.add(outside.geometry); this.scene.add(outside);
    this.scene.add(new THREE.HemisphereLight('#baceed', '#c7a986', 1.0));
    const sun = new THREE.DirectionalLight('#ffd2a0', 2.4);
    sun.position.set(12, 9, 5); sun.target.position.set(-3, 1, -4);
    sun.castShadow = true; sun.shadow.mapSize.set(2048,2048);
    Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 0.1, far: 45 });
    sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.03;
    this.scene.add(sun,sun.target);
    const fill = new THREE.DirectionalLight('#aecbfa', 0.5); fill.position.set(-6,5,8); this.scene.add(fill);
    const envScene = new THREE.Scene();envScene.background = new THREE.Color('#afbed1');
    const pmrem = new THREE.PMREMGenerator(renderer);this.environment = pmrem.fromScene(envScene,0.1);pmrem.dispose();
    this.scene.environment = this.environment.texture;this.scene.environmentIntensity = 0.32;
    this.ready = this.load();
  }
  private box(size: number[], position: number[], material: THREE.Material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size as [number,number,number]),material);
    mesh.position.set(...position as [number,number,number]);mesh.receiveShadow = true;mesh.castShadow = true;
    this.resources.add(mesh.geometry);this.scene.add(mesh);return mesh;
  }
  private async asset(name: string) {
    const gltf = await new GLTFLoader().loadAsync(`/models/${name}.glb`);
    gltf.scene.traverse(o => { if(o instanceof THREE.Mesh) {
      this.resources.add(o.geometry);
      for(const mat of [o.material].flat()) { this.resources.add(mat);for(const val of Object.values(mat)) if(val instanceof THREE.Texture)this.resources.add(val); }
    }});
    if(this.disposed) {this.resources.forEach(r=>r.dispose());throw new Error('Gallery disposed');}
    return gltf.scene;
  }
  private place(source: THREE.Object3D, size: number[], position: number[], material?: THREE.Material) {
    const object = source.clone(true);
    const bounds = new THREE.Box3().setFromObject(object);const extent = bounds.getSize(new THREE.Vector3());const center = bounds.getCenter(new THREE.Vector3());
    object.position.sub(center);
    object.traverse(o=>{if(o instanceof THREE.Mesh){if(material)o.material=material;o.castShadow=!material || !(material instanceof THREE.MeshPhysicalMaterial && material.transmission>0);o.receiveShadow=true;}});
    const wrap = new THREE.Group();wrap.add(object);wrap.scale.set(size[0]/extent.x,size[1]/extent.y,size[2]/extent.z);wrap.position.set(...position as [number,number,number]);this.scene.add(wrap);return wrap;
  }
  private async load() {
    // The first image reconstructions contain baked silhouettes and malformed
    // architecture. Keep them out of the scene; use clean architectural surfaces.
    const porcelain = new THREE.MeshStandardMaterial({ color: '#e6e9eb', roughness: 0.38 });
    this.resources.add(porcelain);
    const platform = new THREE.Mesh(new RoundedBoxGeometry(13.7, 0.55, 2.4, 4, 0.16), porcelain);
    platform.position.set(0, 1.05, -3.45);
    platform.castShadow = true;
    platform.receiveShadow = true;
    this.resources.add(platform.geometry);
    this.scene.add(platform);

    const frameMat = new THREE.MeshStandardMaterial({ color: '#e4e6eb', roughness: 0.5 });
    this.resources.add(frameMat);
    // The vertical mullions are constructed with the room. Complete their
    // horizontal rails and narrow sill without adding a solid generated slab.
    for (const y of [0.7, 10.8]) this.box([0.20, 0.14, 11.6], [8.65, y, 1.9], frameMat);
    this.box([0.55, 0.12, 11.6], [8.5, 0.68, 1.9], porcelain);

    const glassMat = new THREE.MeshPhysicalMaterial({
      color: '#d5f3f1', metalness: 0, roughness: 0.09,
      transmission: 0.92, thickness: 0.065, ior: 1.46,
      transparent: true, opacity: 0.40, depthWrite: false,
      side: THREE.DoubleSide, envMapIntensity: 0.7,
    });
    this.resources.add(glassMat);
    for (const [width, height, x, y, z] of [
      [4.5, 3, -3.8, 1.55, 0], [11.8, 7.6, 0.6, 3.85, -0.5],
    ]) {
      const geometry = new RoundedBoxGeometry(width, height, 0.065, 4, 0.03);
      const pane = new THREE.Mesh(geometry, glassMat);
      pane.position.set(x, y, z);
      pane.castShadow = false;
      this.resources.add(geometry);
      this.scene.add(pane);
    }
    const windowGlass = glassMat.clone();
    windowGlass.opacity = 0.14;
    windowGlass.roughness = 0.02;
    this.resources.add(windowGlass);
    const pane = this.box([0.04, 10, 11.4], [8.69, 5.75, 1.9], windowGlass);
    pane.castShadow = false;

    const [plant, ...foodModels] = await Promise.all([
      this.asset('interior/olive-planter'),
      ...['food/ramen', 'food/burger', 'food/donut', 'food/sushi', 'food/cake', 'food/pizza'].map(name => this.asset(name)),
    ]);
    if (this.disposed) return;
    const extent = new THREE.Box3().setFromObject(plant).getSize(new THREE.Vector3());
    // Preserve the existing plant's proportions and rest its base on the floor.
    const height = 4.2;
    const scale = height / extent.y;
    this.place(plant, [extent.x * scale, height, extent.z * scale], [-7.6, height / 2, 1.3]);

    // Reuse the curated food collection in the new gallery rather than the
    // rejected reference reconstructions. Each object sits on the rear plinth.
    const modelPositions = [-4.7, -2.8, -0.9, 1.0, 2.9, 4.8];
    foodModels.forEach((food, index) => {
      const bounds = new THREE.Box3().setFromObject(food);
      const size = bounds.getSize(new THREE.Vector3());
      const modelScale = Math.min(1.45 / Math.max(size.y, 0.001), 1.55 / Math.max(size.x, size.z, 0.001));
      const modelHeight = size.y * modelScale;
      const wrapper = this.place(food, [size.x * modelScale, modelHeight, size.z * modelScale], [modelPositions[index], 1.325 + modelHeight / 2, -3.45]);
      wrapper.rotation.y = (index - 2.5) * 0.16;
      wrapper.userData.baseY = wrapper.position.y;
      wrapper.userData.baseRotationY = wrapper.rotation.y;
      wrapper.userData.spin = 0.24 + (index % 3) * 0.035;
      wrapper.userData.bounce = 0;
      this.interactive.attach(wrapper);
    });

    // Two display rows on the camera side of the glass, keeping a clear aisle.
    const frontPositions = [-4.2, -2.1, 0, 2.1, 4.2];
    foodModels.slice(0, 5).forEach((food, index) => {
      const bounds = new THREE.Box3().setFromObject(food);
      const size = bounds.getSize(new THREE.Vector3());
      const modelScale = Math.min(1.15 / Math.max(size.y, 0.001), 1.3 / Math.max(size.x, size.z, 0.001));
      const modelHeight = size.y * modelScale;
      const wrapper = this.place(food, [size.x * modelScale, modelHeight, size.z * modelScale], [frontPositions[index], 0.12 + modelHeight / 2, 1.35]);
      wrapper.rotation.y = (index - 2) * 0.18;
      wrapper.userData.baseY = wrapper.position.y;
      wrapper.userData.baseRotationY = wrapper.rotation.y;
      wrapper.userData.spin = 0.24 + (index % 3) * 0.035;
      wrapper.userData.bounce = 0;
      this.interactive.attach(wrapper);
    });
    const secondPositions = [-4.8, -2.4, 0, 2.4, 4.8];
    foodModels.slice(1, 6).forEach((food, index) => {
      const bounds = new THREE.Box3().setFromObject(food);
      const size = bounds.getSize(new THREE.Vector3());
      const modelScale = Math.min(0.95 / Math.max(size.y, 0.001), 1.15 / Math.max(size.x, size.z, 0.001));
      const modelHeight = size.y * modelScale;
      const wrapper = this.place(food, [size.x * modelScale, modelHeight, size.z * modelScale], [secondPositions[index], 0.12 + modelHeight / 2, 3.05]);
      wrapper.rotation.y = (index - 2) * 0.15;
      wrapper.userData.baseY = wrapper.position.y;
      wrapper.userData.baseRotationY = wrapper.rotation.y;
      wrapper.userData.spin = 0.24 + (index % 3) * 0.035;
      wrapper.userData.bounce = 0;
      this.interactive.attach(wrapper);
    });
  }

  private pick(clientX: number, clientY: number, rect: DOMRect) {
    const mouse = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    const raycaster = new THREE.Raycaster(); raycaster.setFromCamera(mouse, this.camera);
    const hit = raycaster.intersectObjects(this.interactive.children, true)[0];
    if (!hit) return null;
    let model: THREE.Object3D | null = hit.object;
    while (model && model.parent !== this.interactive) model = model.parent;
    return model;
  }
  handleClick(clientX: number, clientY: number, rect: DOMRect) {
    const model = this.pick(clientX, clientY, rect);
    if (model) model.userData.bounce = 1;
  }
  handlePointerDown(_clientX: number, _clientY: number, _rect: DOMRect, _pointerId: number) {}
  handlePointerMove(_clientX: number, _clientY: number, _rect: DOMRect, _pointerId: number) {}
  handlePointerUp(_clientX: number, _clientY: number, _rect: DOMRect, _pointerId: number) {}
  handleDoubleClick(clientX: number, clientY: number, rect: DOMRect) {
    const model = this.pick(clientX, clientY, rect);
    if (!model) return;
    if (this.focused === model) {
      this.cameraGoal.copy(this.savedCamera); this.targetGoal.copy(this.savedTarget);
      this.focused = null;
    } else {
      this.savedCamera.copy(this.cameraGoal); this.savedTarget.copy(this.targetGoal);
      const point = new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3());
      this.focused = model; this.targetGoal.copy(point);
      this.cameraGoal.set(point.x, point.y + 0.15, point.z + 3.1);
    }
    this.transition = 0;
  }
  update(delta: number, time: number) {
    if (this.transition < 1) {
      this.transition = Math.min(1, this.transition + delta * 3.4);
      const eased = 1 - Math.pow(1 - this.transition, 3);
      this.camera.position.lerpVectors(this.camera.position, this.cameraGoal, eased * 0.18);
      this.target.lerp(this.targetGoal, eased * 0.18);
      this.camera.lookAt(this.target);
    }
    this.interactive.children.forEach(model => {
      const spin = model.userData.spin as number | undefined;
      if (spin) model.rotation.y += spin * delta;
      const bounce = model.userData.bounce as number | undefined;
      if (!bounce || bounce <= 0) return;
      const phase = 1 - bounce;
      model.position.y = (model.userData.baseY as number) + Math.sin(phase * Math.PI * 2.5) * 0.22 * Math.sin(phase * Math.PI);
      model.rotation.z = Math.sin(phase * Math.PI * 2) * 0.035;
      model.userData.bounce = Math.max(0, bounce - delta * 2.8);
      if (model.userData.bounce === 0) { model.position.y = model.userData.baseY; model.rotation.z = 0; }
    });
  }

  resize(width: number,height: number){this.camera.aspect=width/height;this.camera.updateProjectionMatrix();}
  orbit(dx: number,dy: number){
    if (this.focused) {
      this.cameraGoal.x += dx * 0.035;
      this.cameraGoal.y -= dy * 0.025;
      this.transition = 0;
      return;
    }
    this.yaw=THREE.MathUtils.clamp(this.yaw+dx*0.002,-0.23,0.23);
    this.pitch=THREE.MathUtils.clamp(this.pitch+dy*0.002,-0.15,0.15);
    this.cameraGoal.set(0.3+Math.sin(this.yaw)*12,4.1+this.pitch*8,13.7);
    this.targetGoal.set(0,3.5,-2.7);
    this.transition=0;
  }
  dispose(){this.disposed=true;this.resources.forEach(r=>r.dispose());this.environment.dispose();}
}
