import * as THREE from 'three';
import { ModelDefinition } from '../types/scene';

export interface BouncePhysics {
  baseY: number;
  yOffset: number;
  velocity: number;
  squashY: number;
  squashXZ: number;
  isBouncing: boolean;
}

export interface ModelMeshWrapper {
  definition: ModelDefinition;
  rootGroup: THREE.Group;
  contentGroup: THREE.Group;
  hitBox: THREE.Mesh;
  haloRing: THREE.Mesh;
  physics: BouncePhysics;
  slotIndex: number;
  targetPos: THREE.Vector3;
  targetRot: THREE.Euler;
  isDragging: boolean;
  isSwapCandidate: boolean;
  isJiggling: boolean;
  triggerBounce: (force?: number) => void;
  update: (time: number, delta: number) => void;
  setHovered: (hovered: boolean) => void;
  setSelected: (selected: boolean) => void;
  setDragged: (dragged: boolean) => void;
  setSwapCandidate: (candidate: boolean) => void;
  setJiggling: (jiggling: boolean) => void;
  setSlot: (newSlotIndex: number, newPos: THREE.Vector3, newRot: THREE.Euler) => void;
}

export interface ArchetypeTemplate {
  category: string;
  nameCn: string;
  nameEn: string;
  color: string;
  emissiveColor: string;
}

const ARCHETYPES: ArchetypeTemplate[] = [
  { category: 'Crystalline', nameCn: '透光晶核', nameEn: 'Prism Crystal', color: '#0284c7', emissiveColor: '#38bdf8' },
  { category: 'Chronotech', nameCn: '量子天体仪', nameEn: 'Quantum Armillary', color: '#d97706', emissiveColor: '#fbbf24' },
  { category: 'Architecture', nameCn: '数码方尖碑', nameEn: 'Cyber Monolith', color: '#059669', emissiveColor: '#34d399' },
  { category: 'Synthetic Bio', nameCn: '全息双螺旋', nameEn: 'Bio Helix', color: '#7c3aed', emissiveColor: '#c084fc' },
  { category: 'Topology', nameCn: '超维纽结', nameEn: 'Hyper Torus Knot', color: '#e11d48', emissiveColor: '#fb7185' },
  { category: 'Robotics', nameCn: '警戒机球', nameEn: 'Sentinel Orb', color: '#2563eb', emissiveColor: '#60a5fa' },
  { category: 'Sacred Geo', nameCn: '星芒十二面体', nameEn: 'Stellar Dodeca', color: '#ea580c', emissiveColor: '#fb923c' },
  { category: 'Hyper-Dim', nameCn: '超立方构件', nameEn: 'Tesseract Cube', color: '#0d9488', emissiveColor: '#2dd4bf' },
  { category: 'Kinetic', nameCn: '悬浮莲华', nameEn: 'Levitating Lotus', color: '#c026d3', emissiveColor: '#f472b6' },
  { category: 'Quantum Flow', nameCn: '莫比乌斯环', nameEn: 'Mobius Rings', color: '#4f46e5', emissiveColor: '#818cf8' }
];

export const ROW_BASE_N = 5;
const ROW_STEP = 2;

export function countForRow(index: number, totalRows: number, step = 2) {
  const center = (totalRows - 1) / 2;
  const distFromCenter = Math.abs(index - center);
  const steps = Math.round(center - distFromCenter);
  return ROW_BASE_N + steps * step;
}

export function spanAngleForCount(count: number) {
  return Math.PI * (0.58 + (count - ROW_BASE_N) * 0.025);
}

const TIER_NAMES = [
  { nameCn: '顶层', nameEn: 'Top Tier' },
  { nameCn: '次顶层', nameEn: 'Upper-High Tier' },
  { nameCn: '中上层', nameEn: 'Upper-Mid Tier' },
  { nameCn: '次上层', nameEn: 'Upper Tier' },
  { nameCn: '中央层', nameEn: 'Center Tier' },
  { nameCn: '次下层', nameEn: 'Lower Tier' },
  { nameCn: '中下层', nameEn: 'Lower-Mid Tier' },
  { nameCn: '次底层', nameEn: 'Lower-Low Tier' },
  { nameCn: '底层', nameEn: 'Bottom Tier' }
];

export const TIER_CONFIGS = TIER_NAMES.map((name, i) => {
  const count = countForRow(i, TIER_NAMES.length);
  return {
    tier: i,
    nameCn: name.nameCn,
    nameEn: name.nameEn,
    y: (TIER_NAMES.length - 1) * 1.05 - i * 2.1,
    count,
    spanAngle: spanAngleForCount(count)
  };
});

export function createCatalogDefinition(
  tier: number,
  col: number,
  index: number,
  rowNameCn: string
): ModelDefinition {
  const arch = ARCHETYPES[(index + col) % ARCHETYPES.length];
  return {
    id: `model-t${tier}-c${col}-${index}`,
    index,
    tier,
    col,
    nameCn: `${rowNameCn} · ${arch.nameCn} ${col + 1}号`,
    nameEn: `${arch.nameEn} #${index + 1}`,
    category: arch.category,
    color: arch.color,
    emissiveColor: arch.emissiveColor
  };
}

export const MODEL_CATALOG: ModelDefinition[] = [];

let globalIndex = 0;
TIER_CONFIGS.forEach(tierCfg => {
  for (let c = 0; c < tierCfg.count; c++) {
    MODEL_CATALOG.push(createCatalogDefinition(tierCfg.tier, c, globalIndex, tierCfg.nameCn));
    globalIndex++;
  }
});

// Model Builders

function buildPrismCrystal(): { content: THREE.Group; animate: (t: number) => void } {
  const content = new THREE.Group();
  const outer = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.72, 1),
    new THREE.MeshPhysicalMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.25,
      roughness: 0.1,
      metalness: 0.1,
      transmission: 0.75,
      ior: 1.5,
      thickness: 0.8,
      clearcoat: 1.0
    })
  );
  content.add(outer);

  const inner = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.32),
    new THREE.MeshStandardMaterial({ color: 0x7dd3fc, emissive: 0x0284c7, emissiveIntensity: 1.8 })
  );
  content.add(inner);

  const shards: THREE.Mesh[] = [];
  const shardGeo = new THREE.ConeGeometry(0.09, 0.3, 5);
  for (let i = 0; i < 4; i++) {
    const shard = new THREE.Mesh(shardGeo, outer.material);
    const angle = (i / 4) * Math.PI * 2;
    shard.position.set(Math.cos(angle) * 1.05, Math.sin(angle * 2) * 0.22, Math.sin(angle) * 1.05);
    content.add(shard);
    shards.push(shard);
  }

  return {
    content,
    animate: (t: number) => {
      outer.rotation.y = t * 0.45;
      outer.rotation.x = Math.sin(t * 0.5) * 0.2;
      inner.rotation.y = -t * 0.8;
      shards.forEach((s, i) => {
        s.position.y = Math.sin(t * 2 + i * 1.5) * 0.2;
        s.rotation.x = t + i;
      });
    }
  };
}

function buildQuantumArmillary(): { content: THREE.Group; animate: (t: number) => void } {
  const content = new THREE.Group();
  const brassMat = new THREE.MeshPhysicalMaterial({ color: 0xf59e0b, roughness: 0.25, metalness: 0.9, clearcoat: 0.8 });
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.15, metalness: 0.95 });

  const ring1 = new THREE.Mesh(new THREE.TorusGeometry(0.82, 0.03, 16, 48), brassMat);
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.65, 0.025, 16, 48), chromeMat);
  const ring3 = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.022, 16, 48), brassMat);
  content.add(ring1, ring2, ring3);

  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 24, 24),
    new THREE.MeshStandardMaterial({ color: 0xfef08a, emissive: 0xd97706, emissiveIntensity: 2.2 })
  );
  content.add(core);

  return {
    content,
    animate: (t: number) => {
      ring1.rotation.x = t * 0.5;
      ring1.rotation.y = t * 0.3;
      ring2.rotation.y = -t * 0.7;
      ring2.rotation.z = t * 0.4;
      ring3.rotation.z = t * 0.9;
      ring3.rotation.x = -t * 0.6;
      core.scale.setScalar(1 + Math.sin(t * 4) * 0.08);
    }
  };
}

function buildCyberMonolith(): { content: THREE.Group; animate: (t: number) => void } {
  const content = new THREE.Group();
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.3, metalness: 0.8 });
  const neonMat = new THREE.MeshStandardMaterial({ color: 0x34d399, emissive: 0x059669, emissiveIntensity: 2.0 });

  const base = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.9, 0.45), darkMat);
  content.add(base);

  for (let i = 0; i < 3; i++) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.035, 0.48), neonMat);
    band.position.y = -0.28 + i * 0.28;
    content.add(band);
  }

  const apexGroup = new THREE.Group();
  const apex = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.45, 4), darkMat);
  apex.rotation.y = Math.PI / 4;
  apexGroup.add(apex);
  apexGroup.position.y = 0.7;
  content.add(apexGroup);

  return {
    content,
    animate: (t: number) => {
      content.rotation.y = t * 0.3;
      apexGroup.position.y = 0.7 + Math.sin(t * 2.5) * 0.07;
    }
  };
}

function buildBioHelix(): { content: THREE.Group; animate: (t: number) => void } {
  const content = new THREE.Group();
  const mat1 = new THREE.MeshStandardMaterial({ color: 0xa855f7, emissive: 0x7e22ce, emissiveIntensity: 1.0, roughness: 0.2, metalness: 0.7 });
  const mat2 = new THREE.MeshStandardMaterial({ color: 0x06b6d4, emissive: 0x0891b2, emissiveIntensity: 1.0, roughness: 0.2, metalness: 0.7 });
  const rungMat = new THREE.MeshStandardMaterial({ color: 0xec4899, emissive: 0xbe185d, emissiveIntensity: 1.2 });

  const nodeCount = 12;
  const radius = 0.4;
  const height = 1.3;

  for (let i = 0; i < nodeCount; i++) {
    const t = (i / (nodeCount - 1)) * Math.PI * 3.2;
    const y = (i / (nodeCount - 1)) * height - height / 2;

    const n1 = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 10), mat1);
    n1.position.set(Math.cos(t) * radius, y, Math.sin(t) * radius);
    content.add(n1);

    const n2 = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 10), mat2);
    n2.position.set(Math.cos(t + Math.PI) * radius, y, Math.sin(t + Math.PI) * radius);
    content.add(n2);

    if (i % 2 === 0) {
      const rung = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, radius * 2, 8), rungMat);
      rung.position.set(0, y, 0);
      rung.rotation.z = Math.PI / 2;
      rung.rotation.y = -t;
      content.add(rung);
    }
  }

  return {
    content,
    animate: (t: number) => {
      content.rotation.y = t * 0.7;
    }
  };
}

function buildHyperKnot(): { content: THREE.Group; animate: (t: number) => void } {
  const content = new THREE.Group();
  const knot = new THREE.Mesh(
    new THREE.TorusKnotGeometry(0.5, 0.15, 96, 24, 2, 5),
    new THREE.MeshPhysicalMaterial({
      color: 0xf43f5e,
      emissive: 0xbe123c,
      emissiveIntensity: 0.4,
      roughness: 0.2,
      metalness: 0.9,
      clearcoat: 1.0
    })
  );
  content.add(knot);

  const sat = new THREE.Mesh(
    new THREE.SphereGeometry(0.07, 12, 12),
    new THREE.MeshStandardMaterial({ color: 0xfecdd3, emissive: 0xf43f5e, emissiveIntensity: 2.2 })
  );
  content.add(sat);

  return {
    content,
    animate: (t: number) => {
      knot.rotation.x = t * 0.4;
      knot.rotation.y = t * 0.6;
      sat.position.set(Math.cos(t * 2) * 0.85, Math.sin(t * 3) * 0.35, Math.sin(t * 2) * 0.85);
    }
  };
}

function buildMechaOrb(): { content: THREE.Group; animate: (t: number) => void } {
  const content = new THREE.Group();
  const armorMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.3, metalness: 0.85 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0284c7, emissiveIntensity: 2.4, roughness: 0.1 });

  const chassis = new THREE.Mesh(new THREE.SphereGeometry(0.54, 24, 24), armorMat);
  content.add(chassis);

  const lensEye = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 16), eyeMat);
  lensEye.position.z = 0.5;
  content.add(lensEye);

  for (let i = 0; i < 4; i++) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.28, 0.14), armorMat);
    const angle = (i / 4) * Math.PI * 2;
    fin.position.set(Math.cos(angle) * 0.7, Math.sin(angle) * 0.7, 0);
    fin.rotation.z = angle;
    content.add(fin);
  }

  return {
    content,
    animate: (t: number) => {
      content.rotation.y = Math.sin(t * 0.8) * 0.35;
      lensEye.scale.setScalar(1 + Math.sin(t * 4.0) * 0.1);
    }
  };
}

function buildStellarDodeca(): { content: THREE.Group; animate: (t: number) => void } {
  const content = new THREE.Group();
  const cage = new THREE.Mesh(
    new THREE.DodecahedronGeometry(0.68),
    new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.2, metalness: 0.95, wireframe: true })
  );
  content.add(cage);

  const core = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.34, 0),
    new THREE.MeshStandardMaterial({ color: 0xf97316, emissive: 0xea580c, emissiveIntensity: 1.8, roughness: 0.2, metalness: 0.7 })
  );
  content.add(core);

  return {
    content,
    animate: (t: number) => {
      cage.rotation.x = t * 0.35;
      cage.rotation.y = t * 0.5;
      core.rotation.x = -t * 0.8;
      core.rotation.z = t * 0.6;
    }
  };
}

function buildQuantumHypercube(): { content: THREE.Group; animate: (t: number) => void } {
  const content = new THREE.Group();
  const outerCube = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 0.8, 0.8),
    new THREE.MeshStandardMaterial({ color: 0x14b8a6, roughness: 0.2, metalness: 0.9, wireframe: true })
  );
  content.add(outerCube);

  const innerCube = new THREE.Mesh(
    new THREE.BoxGeometry(0.45, 0.45, 0.45),
    new THREE.MeshPhysicalMaterial({
      color: 0x2dd4bf,
      emissive: 0x0f766e,
      emissiveIntensity: 0.6,
      roughness: 0.1,
      metalness: 0.1,
      transmission: 0.8,
      ior: 1.45
    })
  );
  content.add(innerCube);

  return {
    content,
    animate: (t: number) => {
      outerCube.rotation.x = t * 0.4;
      outerCube.rotation.y = t * 0.6;
      innerCube.rotation.x = -t * 0.7;
      innerCube.rotation.z = t * 0.5;
    }
  };
}

function buildLevitatingLotus(): { content: THREE.Group; animate: (t: number) => void } {
  const content = new THREE.Group();
  const petalMat = new THREE.MeshPhysicalMaterial({
    color: 0xd946ef,
    emissive: 0xa21caf,
    emissiveIntensity: 0.3,
    roughness: 0.2,
    metalness: 0.85,
    clearcoat: 0.8
  });

  for (let layer = 0; layer < 2; layer++) {
    const count = 6;
    const rad = 0.25 + layer * 0.18;
    const tilt = 0.3 + layer * 0.35;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + (layer * Math.PI) / count;
      const petal = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 4), petalMat);
      petal.position.set(Math.cos(angle) * rad, -0.15 + layer * 0.1, Math.sin(angle) * rad);
      petal.rotation.z = Math.sin(angle) * tilt;
      petal.rotation.x = -Math.cos(angle) * tilt;
      content.add(petal);
    }
  }

  const pistil = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 16, 16),
    new THREE.MeshStandardMaterial({ color: 0xfef08a, emissive: 0xfacc15, emissiveIntensity: 2.0 })
  );
  content.add(pistil);

  return {
    content,
    animate: (t: number) => {
      content.rotation.y = t * 0.35;
      pistil.scale.setScalar(1 + Math.sin(t * 3.5) * 0.1);
    }
  };
}

function buildMobiusRings(): { content: THREE.Group; animate: (t: number) => void } {
  const content = new THREE.Group();
  const indigoMat = new THREE.MeshPhysicalMaterial({
    color: 0x4f46e5,
    emissive: 0x3730a3,
    emissiveIntensity: 0.3,
    roughness: 0.2,
    metalness: 0.95,
    clearcoat: 0.9
  });
  const cyanMat = new THREE.MeshPhysicalMaterial({
    color: 0x06b6d4,
    emissive: 0x0891b2,
    emissiveIntensity: 0.3,
    roughness: 0.2,
    metalness: 0.95,
    clearcoat: 0.9
  });

  const r1 = new THREE.Mesh(new THREE.TorusGeometry(0.68, 0.045, 16, 48), indigoMat);
  r1.rotation.x = Math.PI / 3;
  content.add(r1);

  const r2 = new THREE.Mesh(new THREE.TorusGeometry(0.68, 0.045, 16, 48), cyanMat);
  r2.rotation.y = Math.PI / 3;
  content.add(r2);

  const centerSphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 16, 16),
    new THREE.MeshStandardMaterial({ color: 0x818cf8, emissive: 0x4f46e5, emissiveIntensity: 1.8 })
  );
  content.add(centerSphere);

  return {
    content,
    animate: (t: number) => {
      r1.rotation.z = t * 0.6;
      r2.rotation.z = -t * 0.6;
      content.rotation.y = t * 0.3;
    }
  };
}

/**
 * Creates floating model instance in mid-air with iOS-style drag/swap capability
 */
export function fitObjectToSlot(object: THREE.Object3D, targetSize = 1.4): THREE.Group {
  const wrap = new THREE.Group();
  wrap.add(object);

  const box = new THREE.Box3().setFromObject(wrap);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 0.001);
  wrap.scale.setScalar(targetSize / maxDim);
  wrap.position.sub(center.multiplyScalar(targetSize / maxDim));
  return wrap;
}

export function createModelWrapper(
  definition: ModelDefinition,
  initialSlotIndex: number,
  initialPos: THREE.Vector3,
  initialRot: THREE.Euler,
  customContent?: THREE.Object3D
): ModelMeshWrapper {
  const rootGroup = new THREE.Group();
  rootGroup.name = `model-root-${definition.id}`;
  rootGroup.position.copy(initialPos);
  rootGroup.rotation.copy(initialRot);

  let modelResult: { content: THREE.Group; animate: (t: number) => void };

  if (customContent) {
    const content = new THREE.Group();
    content.add(fitObjectToSlot(customContent));
    modelResult = {
      content,
      animate: (t: number) => {
        content.rotation.y = t * 0.25;
      }
    };
  } else {
    const archIdx = definition.col % ARCHETYPES.length;
    switch (archIdx) {
      case 0: modelResult = buildPrismCrystal(); break;
      case 1: modelResult = buildQuantumArmillary(); break;
      case 2: modelResult = buildCyberMonolith(); break;
      case 3: modelResult = buildBioHelix(); break;
      case 4: modelResult = buildHyperKnot(); break;
      case 5: modelResult = buildMechaOrb(); break;
      case 6: modelResult = buildStellarDodeca(); break;
      case 7: modelResult = buildQuantumHypercube(); break;
      case 8: modelResult = buildLevitatingLotus(); break;
      case 9: modelResult = buildMobiusRings(); break;
      default: modelResult = buildPrismCrystal(); break;
    }
  }

  const contentGroup = modelResult.content;
  rootGroup.add(contentGroup);

  // Invisible Hitbox for raycasting — generous size so edge models are easy to grab
  const hitBoxGeo = new THREE.SphereGeometry(1.6, 8, 8);
  const hitBoxMat = new THREE.MeshBasicMaterial({ visible: false });
  const hitBox = new THREE.Mesh(hitBoxGeo, hitBoxMat);
  hitBox.userData = { modelId: definition.id, modelIndex: definition.index };
  rootGroup.add(hitBox);

  // iOS-style Halo Ring indicator when grabbed or hovered as swap target
  const haloGeo = new THREE.TorusGeometry(1.05, 0.035, 16, 48);
  const haloMat = new THREE.MeshBasicMaterial({
    color: 0x0284c7,
    transparent: true,
    opacity: 0.0
  });
  const haloRing = new THREE.Mesh(haloGeo, haloMat);
  haloRing.rotation.x = Math.PI / 2;
  rootGroup.add(haloRing);

  const physics: BouncePhysics = {
    baseY: 0, // relative to rootGroup
    yOffset: 0,
    velocity: 0,
    squashY: 1,
    squashXZ: 1,
    isBouncing: false
  };

  let currentSlotIndex = initialSlotIndex;
  const targetPos = initialPos.clone();
  const targetRot = initialRot.clone();

  let isDragging = false;
  let isSwapCandidate = false;
  let isJiggling = false;
  let lerpSpeed = 0.6; // Start very slow for entrance animation

  const triggerBounce = (force: number = 8.5) => {
    if (isDragging) return;
    physics.velocity = force;
    physics.isBouncing = true;
    physics.squashY = 1.4;
    physics.squashXZ = 0.8;
  };

  const setHovered = (hovered: boolean) => {
    document.body.style.cursor = hovered ? (isDragging ? 'grabbing' : 'pointer') : 'default';
  };

  const setSelected = (_selected: boolean) => {};

  const setDragged = (dragged: boolean) => {
    isDragging = dragged;
    if (dragged) {
      haloMat.color.setHex(0x0284c7);
      haloMat.opacity = 0.9;
      contentGroup.scale.set(1.22, 1.22, 1.22);
    } else {
      haloMat.opacity = 0.0;
      contentGroup.scale.set(1, 1, 1);
    }
  };

  const setSwapCandidate = (candidate: boolean) => {
    isSwapCandidate = candidate;
    if (candidate) {
      haloMat.color.setHex(0x10b981); // Emerald green halo for valid swap slot
      haloMat.opacity = 0.95;
    } else if (!isDragging) {
      haloMat.opacity = 0.0;
    }
  };

  const setJiggling = (jiggling: boolean) => {
    isJiggling = jiggling;
  };

  const setSlot = (newSlotIndex: number, newPos: THREE.Vector3, newRot: THREE.Euler) => {
    currentSlotIndex = newSlotIndex;
    targetPos.copy(newPos);
    targetRot.copy(newRot);
  };

  const update = (time: number, delta: number) => {
    modelResult.animate(time);

    // If not actively dragged by cursor, smoothly spring-lerp to targetSlotPos
    if (!isDragging) {
      // Ramp up lerp speed from entrance (1.8) to normal (14.0)
      if (lerpSpeed < 14.0) lerpSpeed += delta * 3.0;
      const sp = Math.min(lerpSpeed, 14.0);
      rootGroup.position.lerp(targetPos, sp * delta);
      rootGroup.rotation.x += (targetRot.x - rootGroup.rotation.x) * (sp * delta);
      rootGroup.rotation.y += (targetRot.y - rootGroup.rotation.y) * (sp * delta);

      // iOS Jiggle (playful icon wiggle during drag mode)
      if (isJiggling) {
        const jiggleFrequency = 22.0;
        const jiggleAmp = 0.05;
        rootGroup.rotation.z = Math.sin(time * jiggleFrequency + currentSlotIndex * 1.5) * jiggleAmp;
        rootGroup.position.y += Math.sin(time * 16.0 + currentSlotIndex) * 0.01;
      } else {
        rootGroup.rotation.z += (0 - rootGroup.rotation.z) * (12.0 * delta);
      }
    } else {
      // Pulse halo while dragging
      haloRing.scale.setScalar(1 + Math.sin(time * 8.0) * 0.06);
    }

    // Floating harmonic bounce physics (on contentGroup relative to root)
    if (physics.isBouncing || Math.abs(physics.yOffset) > 0.005 || Math.abs(physics.velocity) > 0.01) {
      const springK = 38.0;
      const damping = 5.2;
      const springForce = -springK * physics.yOffset - damping * physics.velocity;

      physics.velocity += springForce * delta;
      physics.yOffset += physics.velocity * delta;

      const targetSquashY = 1.0 + physics.velocity * 0.04;
      const targetSquashXZ = 1.0 - physics.velocity * 0.02;

      physics.squashY += (targetSquashY - physics.squashY) * 15.0 * delta;
      physics.squashXZ += (targetSquashXZ - physics.squashXZ) * 15.0 * delta;

      if (Math.abs(physics.yOffset) < 0.005 && Math.abs(physics.velocity) < 0.02) {
        physics.yOffset = 0;
        physics.velocity = 0;
        physics.squashY = 1;
        physics.squashXZ = 1;
        physics.isBouncing = false;
      }

      contentGroup.position.y = physics.baseY + physics.yOffset;
      if (!isDragging) {
        contentGroup.scale.set(physics.squashXZ, physics.squashY, physics.squashXZ);
      }
    } else if (!isDragging) {
      contentGroup.position.y = physics.baseY + Math.sin(time * 1.5 + definition.index * 0.4) * 0.05;
    }

    hitBox.position.y = contentGroup.position.y;
    haloRing.position.y = contentGroup.position.y;
  };

  return {
    definition,
    rootGroup,
    contentGroup,
    hitBox,
    haloRing,
    physics,
    get slotIndex() { return currentSlotIndex; },
    targetPos,
    targetRot,
    get isDragging() { return isDragging; },
    get isSwapCandidate() { return isSwapCandidate; },
    get isJiggling() { return isJiggling; },
    triggerBounce,
    update,
    setHovered,
    setSelected,
    setDragged,
    setSwapCandidate,
    setJiggling,
    setSlot
  };
}
