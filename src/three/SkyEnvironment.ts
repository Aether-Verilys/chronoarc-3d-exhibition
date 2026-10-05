import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';

/** A real interior, with parallax and shelves aligned to the model array. */
export function createSkyEnvironment(renderer: THREE.WebGLRenderer) {
  const furnitureScale = 5;
  const room = new THREE.Group();
  const architecture = new THREE.Group();
  room.add(architecture);
  const loader = new GLTFLoader();
  let disposed = false;
  let lastSlots: { position: THREE.Vector3; rotation: THREE.Euler }[] = [];
  let cabinet: THREE.Group | null = null;
  const resources = new Set<THREE.BufferGeometry | THREE.Material | THREE.Texture>();
  function fitted(source: THREE.Group, width: number, height: number, depth: number) {
    const copy = source.clone(true);
    const bounds = new THREE.Box3().setFromObject(copy);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const group = new THREE.Group();
    copy.position.sub(center);
    group.add(copy);
    group.scale.set(width / Math.max(size.x, 0.001), height / Math.max(size.y, 0.001), depth / Math.max(size.z, 0.001));
    return group;
  }
  async function loadAsset(name: string) {
    const gltf = await loader.loadAsync(`/models/interior/${name}.glb`);
    gltf.scene.traverse(object => {
      if (object instanceof THREE.Mesh) {
        const owned = [object.geometry, ...[object.material].flat()];
        for (const resource of owned) {
          if (disposed) resource.dispose(); else resources.add(resource);
          if (resource instanceof THREE.Material) {
            for (const value of Object.values(resource)) if (value instanceof THREE.Texture) {
              if (disposed) value.dispose(); else resources.add(value);
            }
          }
        }
      }
    });
    return gltf.scene;
  }
  const shelves = new THREE.Group();
  const plants = new THREE.Group();
  room.add(plants);
  function positionPlants() {
    if (!lastSlots.length) return;
    plants.children.forEach((plant, index) => {
      plant.position.set(index === 0 ? -34 : 34, -12.91, -31);
    });
  }

  const lighting = new THREE.Group();
  room.add(lighting);
  RectAreaLightUniformsLib.init();
  const plaster = new THREE.MeshStandardMaterial({ color: '#625c54', roughness: 0.95 });
  const wood = new THREE.MeshStandardMaterial({ color: '#684832', roughness: 0.62 });
  const trim = new THREE.MeshStandardMaterial({ color: '#242322', roughness: 0.5, metalness: 0.3 });
  const glow = new THREE.MeshBasicMaterial({ color: '#c6a575' });
  const diffuser = new THREE.MeshBasicMaterial({ color: '#fff1d8' });
  const wash = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: {},
    vertexShader: `varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying vec2 vUv;
      void main() {
        float side = smoothstep(0.0, 0.18, vUv.x) * smoothstep(0.0, 0.18, 1.0 - vUv.x);
        float fade = pow(vUv.y, 2.5) * (1.0 - smoothstep(0.94, 1.0, vUv.y));
        gl_FragColor = vec4(0.9, 0.71, 0.46, side * fade * 0.22);
      }`
  });
  const materials = [plaster, wood, trim, glow, diffuser, wash];
  // Static contact shadows: no shadow maps or per-frame offscreen passes.
  const contactMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: true,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    vertexShader: `varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying vec2 vUv;
      void main() {
        vec2 p = abs(vUv * 2.0 - 1.0);
        float d = pow(pow(p.x, 4.0) + pow(p.y, 4.0), 0.25);
        float soft = 1.0 - smoothstep(0.40, 1.0, d);
        float core = 1.0 - smoothstep(0.10, 0.70, d);
        gl_FragColor = vec4(0.035, 0.028, 0.022, soft * 0.23 + core * 0.20);
      }`
  });
  materials.push(contactMaterial);
  function contactShadow(parent: THREE.Group, width: number, depth: number, x = 0, z = 0) {
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(width * 1.22, depth * 1.22), contactMaterial);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(x, 0.015, z);
    shadow.renderOrder = 1;
    parent.add(shadow);
  }

  function box(parent: THREE.Group, size: number[], position: number[], material: THREE.Material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size as [number, number, number]), material);
    mesh.position.set(...position as [number, number, number]);
    parent.add(mesh);
    return mesh;
  }
  box(architecture, [100, 60, 0.4], [0, 0, -35], plaster);
  box(architecture, [100, 0.3, 100], [0, -13, 0], wood);
  box(architecture, [100, 0.3, 100], [0, 22, 0], plaster);
  box(architecture, [0.3, 35, 100], [-48, 4, 0], plaster);
  box(architecture, [0.3, 35, 100], [48, 4, 0], plaster);
  for (let x = -45; x <= 45; x += 3) {
    box(architecture, [0.05, 34, 0.2], [x, 4, -34.7], trim);
  }
  for (const x of [-18, 0, 18]) {
    box(room, [0.15, 0.1, 28], [x, 21.7, -5], glow);
  }
  room.add(shelves);

  // A restrained studio reflection map; generated once, never per frame.
  const studio = new THREE.Scene();
  studio.background = new THREE.Color('#71675a');
  const softbox = new THREE.Mesh(new THREE.PlaneGeometry(10, 6), glow);
  softbox.position.set(0, 8, 12);
  softbox.lookAt(0, 0, 0);
  studio.add(softbox);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(studio, 0.15);
  pmrem.dispose();
  softbox.geometry.dispose();

  const api = {
    room,
    environment: environment.texture,
    updateSlots(slots: { position: THREE.Vector3; rotation: THREE.Euler }[]) {
      lastSlots = slots;
      shelves.traverse(object => {
        if (object instanceof THREE.Mesh && !resources.has(object.geometry)) object.geometry.dispose();
      });
      shelves.clear();
      lighting.clear();
      positionPlants();
      // Follow the curved cabinet fronts instead of illuminating a flat plane.
      lighting.add(new THREE.HemisphereLight('#fff4e4', '#a59b8b', 0.65));
      if (slots.length) {
        const bounds = new THREE.Box3().setFromPoints(slots.map(slot => slot.position));
        const size = bounds.getSize(new THREE.Vector3());
        for (let band = 0; band < 2; band++) {
          for (let column = 0; column < 5; column++) {
            const x = bounds.min.x + size.x * column / 4;
            const y = bounds.min.y + size.y * (band + 0.5) / 2;
            const nearest = slots.reduce((best, slot) =>
              Math.abs(slot.position.x - x) + Math.abs(slot.position.y - y) * 0.3 <
              Math.abs(best.position.x - x) + Math.abs(best.position.y - y) * 0.3 ? slot : best
            );
            const target = new THREE.Vector3(nearest.position.x, y, nearest.position.z);
            const front = new THREE.Vector3(-target.x, 0, 8.6 - target.z).normalize();
            const light = new THREE.RectAreaLight('#fff0df', 2.6, Math.max(4, size.x / 4), Math.max(5, size.y / 2 + 2));
            light.position.copy(target).addScaledVector(front, 3.5);
            light.position.y += 1;
            light.lookAt(target);
            lighting.add(light);
          }
        }
      }
      for (const slot of slots) {
        const bay = new THREE.Group();
        bay.position.copy(slot.position);
        // Fixed gallery viewing axis; do not billboard cabinets as the camera moves.
        bay.rotation.y = Math.atan2(-slot.position.x, 8.6 - slot.position.z);
        if (cabinet) {
          const niche = fitted(cabinet, 1.98, 1.98, 2.1);
          niche.position.set(0, 0.06, -0.3);
          bay.add(niche);
        } else {
          box(bay, [1.95, 1.95, 0.10], [0, 0, -1.25], plaster);
          box(bay, [1.98, 0.12, 2.1], [0, -0.87, -0.3], wood);
        }
        // Real light supplements baked PBR LED detail in the generated niche.
        box(bay, [1.7, 0.012, 0.09], [0, 0.891, 0.32], diffuser);
        const wallWash = new THREE.Mesh(new THREE.PlaneGeometry(1.86, 1.78), wash);
        wallWash.position.set(0, 0, -1.194);
        bay.add(wallWash);
        shelves.add(bay);
      }
    },
    dispose() {
      disposed = true;
      room.traverse(object => { if (object instanceof THREE.Mesh && !resources.has(object.geometry)) object.geometry.dispose(); });
      resources.forEach(resource => resource.dispose());
      resources.clear();
      materials.forEach(material => material.dispose());
      environment.dispose();
    }
  };
  void loadAsset('cabinet-light').then(model => {
    if (disposed) return;
    // Tripo exports this niche with its open face along +X; our bays use +Z.
    const oriented = new THREE.Group();
    model.rotation.y = -Math.PI / 2;
    oriented.add(model);
    cabinet = oriented;
    api.updateSlots(lastSlots);
  }).catch(error => console.error('展柜加载失败', error));
  void loadAsset('wall-panel').then(wall => {
    if (disposed) return;
    architecture.visible = false;
    for (let x = -45; x <= 45; x += 6) {
      const panel = fitted(wall, 6, 35, 0.4);
      panel.position.set(x, 4, -35);
      room.add(panel);
    }
    for (const x of [-48, 48]) {
      for (let z = -30; z <= 36; z += 6) {
        const panel = fitted(wall, 6, 35, 0.4);
        panel.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2;
        panel.position.set(x, 4, z);
        room.add(panel);
      }
    }
    for (let x = -42; x <= 42; x += 12) {
      for (let z = -30; z <= 42; z += 12) {
        const ceiling = fitted(wall, 12, 12, 0.2);
        ceiling.rotation.x = Math.PI / 2;
        ceiling.position.set(x, 22, z);
        room.add(ceiling);
      }
    }
  }).catch(error => console.error('室内材质模型加载失败', error));
  // Use a real floor surface rather than the generated tile's room-image atlas.
  const stone = new THREE.MeshStandardMaterial({ color: '#a99d8c', roughness: 0.78, metalness: 0 });
  stone.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 floorPosition;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nfloorPosition = position;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 floorPosition;
      float grain(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float stoneNoise(vec2 p) {
        vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(grain(i),grain(i+vec2(1,0)),f.x),mix(grain(i+vec2(0,1)),grain(i+vec2(1,1)),f.x),f.y);
      }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec2 p = floorPosition.xz;
        vec2 cell = fract(p / 2.4);
        vec2 edge = min(cell, 1.0-cell) * 2.4;
        float joint = 1.0-smoothstep(0.009,0.025,min(edge.x,edge.y));
        float veins = stoneNoise(p * vec2(2.0, 10.0)) * 0.07 + stoneNoise(p * 38.0) * 0.025;
        float variation = grain(floor(p / 2.4)) * 0.035;
        diffuseColor.rgb *= 0.95 + veins + variation;
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.72, joint);`);
  };
  materials.push(stone);
  box(room, [100, 0.18, 100], [0, -13, 0], stone);
  // Low, restrained furniture leaves the curved display and walkway unobstructed.
  const seating = new THREE.Group();
  seating.position.set(0, -12.91, -18);
  seating.scale.setScalar(furnitureScale);
  room.add(seating);
  // Shared PBR assets replace the primitive table/stool-shaped furniture.
  async function addLoungeTable(asset: string, width: number, height: number, locations: number[][]) {
    try {
      const model = await loadAsset(asset);
      if (disposed) return;
      const bounds = new THREE.Box3().setFromObject(model);
      const size = bounds.getSize(new THREE.Vector3());
      for (const [x, z] of locations) {
        const table = fitted(model, width, height, width * size.z / Math.max(size.x, 0.001));
        table.position.set(x, height / 2, z);
        seating.add(table);
        contactShadow(seating, width, width * size.z / Math.max(size.x, 0.001), x, z);
      }
    } catch (error) { console.error(`茶几加载失败: ${asset}`, error); }
  }
  void addLoungeTable('coffee-table', 3.3, 1.17, [[0, 0]]);
  void addLoungeTable('side-table', 1.56, 1.05, [[-3, 1.7], [3, 1.7]]);
  // Two recessed ceiling strips, directly above the side tables. Keep these
  // outside the rebuilt cabinet-light group so layout changes preserve them.
  for (const localX of [-3, 3]) {
    const x = seating.position.x + localX * furnitureScale;
    const z = seating.position.z + 1.7 * furnitureScale;
    const recess = new THREE.Group();
    recess.position.set(x, 21.55, z);
    room.add(recess);
    box(recess, [4.6, 0.12, 1.2], [0, 0, 0], trim);
    box(recess, [3.8, 0.015, 0.65], [0, -0.067, 0], diffuser);
    for (const lipZ of [-0.56, 0.56]) {
      box(recess, [4.6, 0.22, 0.08], [0, -0.08, lipZ], trim);
    }
    const tableLight = new THREE.SpotLight('#fff0dc', 85, 42, Math.PI / 9, 0.85, 1);
    tableLight.position.set(x, 21.35, z);
    tableLight.target.position.set(x, seating.position.y + 1.05 * furnitureScale, z);
    tableLight.castShadow = false;
    room.add(tableLight, tableLight.target);
  }

  // Raised side shelving keeps decorations inside the initial camera framing.
  for (const x of [-14, 14]) {
    const rack = new THREE.Group();
    rack.position.set(x, -12.91, -29);
    room.add(rack);
    for (const side of [-2.9, 2.9]) {
      for (const z of [-1.35, 1.35]) {
        box(rack, [0.16, 15, 0.16], [side, 7.5, z], trim);
      }
    }
    for (const y of [0.3, 4.8, 9.2, 14.7]) {
      box(rack, [6.1, 0.28, 3.1], [0, y, 0], wood);
      box(rack, [5.5, 0.035, 0.08], [0, y - 0.16, 1.05], diffuser);
    }
    for (let i = 0; i < 4; i++) {
      const book = box(rack, [1.8, 0.16, 1.3], [-0.8, 4.99 + i * 0.17, 0], i % 2 ? plaster : trim);
      book.rotation.y = i * 0.045;
    }
  }
  const decorations = [
    { name: 'olive-planter', height: 1.65, locations: [[-16, -12.91, -1], [16, -12.91, -1]] },
    { name: 'sofa', height: 1.8 * furnitureScale, locations: [[-30, -12.91, -11], [30, -12.91, -11]] },
    { name: 'sculpture', height: 4.6, locations: [[-14, -3.57, -29], [14, -3.57, -29]] }
  ];
  for (const decor of decorations) {
    void loadAsset(decor.name).then(model => {
      if (disposed) return;
      if (decor.name === 'sofa') {
        // Align the longest horizontal axis with local X before fitting the lounge zone.
        const rawSize = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
        if (rawSize.z > rawSize.x) model.rotation.y = Math.PI / 2;
      }
      const bounds = new THREE.Box3().setFromObject(model);
      const size = bounds.getSize(new THREE.Vector3());
      const center = bounds.getCenter(new THREE.Vector3());
      const scale = decor.name === 'sofa'
        ? Math.min(24 / Math.max(size.x, 0.001), 10 / Math.max(size.z, 0.001), decor.height / Math.max(size.y, 0.001))
        : decor.height / Math.max(size.y, 0.001);
      for (const [x, y, z] of decor.locations) {
        const copy = model.clone(true);
        copy.position.set(-center.x, -bounds.min.y, -center.z);
        const plinth = new THREE.Group();
        plinth.add(copy);
        plinth.scale.setScalar(scale);
        plinth.position.set(x, y, z);
        plinth.rotation.y = decor.name === 'sofa' ? (x < 0 ? -Math.PI / 2 : Math.PI / 2) : (x < 0 ? 0.2 : -0.2);
        if (decor.name === 'olive-planter') {
          const console = new THREE.Group();
          console.scale.setScalar(furnitureScale);
          // A low walnut console anchors each plant instead of leaving it on the floor.
          box(console, [3.4, 1.25, 1.2], [0, 0.9, 0], wood);
          box(console, [3.55, 0.10, 1.3], [0, 1.575, 0], stone);
          for (const x of [-1.35, 1.35]) {
            for (const z of [-0.42, 0.42]) box(console, [0.09, 0.35, 0.09], [x, 0.175, z], trim);
          }
          for (const x of [-0.56, 0.56]) box(console, [0.014, 1.12, 0.012], [x, 0.9, 0.606], trim);
          plinth.position.set(-0.65, 1.63, 0);
          console.add(plinth);
          // Small stacked books balance the planter on the other side.
          for (let i = 0; i < 3; i++) {
            const book = box(console, [0.65, 0.075, 0.45], [0.85, 1.67 + i * 0.08, 0.05], i % 2 ? plaster : trim);
            book.rotation.y = i * 0.08;
          }
          contactShadow(console, 3.55, 1.3);
          plants.add(console);
        } else {
          if (decor.name === 'sofa') {
            // The shadow uses the same scale and orientation as the sofa footprint.
            contactShadow(plinth, size.x, size.z);
          }
          room.add(plinth);
        }
      }
      positionPlants();
    }).catch(error => console.error(`装饰加载失败: ${decor.name}`, error));
  }
  return api;
}
