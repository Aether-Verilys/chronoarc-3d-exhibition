// Measured in the supplied machine.glb (Y up, front +Z), then converted into
// the cabinet's local frame. Keep the authored proportions and share these
// landmarks between the imported shell, physics and claw controller.
export const MACHINE_MODEL = { scale: 7.4, bottom: -1.55 };
const MODEL_SCALE = MACHINE_MODEL.scale;
const MODEL_BOTTOM = MACHINE_MODEL.bottom;
const y = (value: number) => value * MODEL_SCALE + MODEL_BOTTOM;

// The lower-left door in machine.glb has a rear cover at z=0.112061 and
// two front skins at z=0.1903/0.195557. These are cabinet-local landmarks;
// delivery must pass the outer skin before a prize can settle for collection.
export const MACHINE_OUTLET = {
  x: -0.113 * MODEL_SCALE,
  frontZ: 0.195557 * MODEL_SCALE,
  backZ: 0.112061 * MODEL_SCALE,
  bottomY: y(0.083),
  topY: y(0.229),
};

export const MACHINE_LAYOUT = {
  worldY: 3.1,
  worldScale: 2,
  floorY: y(0.4326171875),
  ceilingY: y(0.8955),
  halfWidth: 0.227783 * MODEL_SCALE,
  backZ: -0.187744 * MODEL_SCALE,
  frontZ: 0.170166 * MODEL_SCALE,
  railY: y(0.86),
  clawTopY: y(0.80),
  clawBottomY: y(0.4326171875) + 1.08,
  clawHeight: 1.1,
  holdOffset: 0.78,
  prizeSize: 1.05,
  chuteX: MACHINE_OUTLET.x,
  chuteZ: 0.07 * MODEL_SCALE,
};

export const PRIZE_CHUTE = {
  x: MACHINE_LAYOUT.chuteX,
  entryZ: MACHINE_LAYOUT.chuteZ,
  entryFloorY: y(0.13),
  outletZ: 0.22 * MODEL_SCALE,
  outletFloorY: y(0.09),
  trayFloorY: y(0.055),
  trayFrontZ: 2.75,
  // Extend the tray under the ramp lip so landing never needs a forward snap.
  trayBackZ: 0.22 * MODEL_SCALE,
  halfWidth: 0.54,
};

type CabinetVector = [number, number, number];

// The authored top opening stays completely clear. Each wall starts at its
// outside edge, and the front/back walls cover the corners of the side walls.
export const CHUTE_GUARD = (() => {
  const minX = -0.18 * MODEL_SCALE;
  const maxX = -0.046 * MODEL_SCALE;
  const minZ = 0.003 * MODEL_SCALE;
  const maxZ = 0.137 * MODEL_SCALE;
  const floorY = MACHINE_LAYOUT.floorY;
  const height = 0.42;
  const thickness = 0.025;
  const centerY = floorY + height / 2;
  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;
  const walls: { size: CabinetVector; position: CabinetVector }[] = [
    { size: [thickness, height, maxZ - minZ], position: [minX - thickness / 2, centerY, centerZ] },
    { size: [thickness, height, maxZ - minZ], position: [maxX + thickness / 2, centerY, centerZ] },
    { size: [maxX - minX + thickness * 2, height, thickness], position: [centerX, centerY, minZ - thickness / 2] },
    { size: [maxX - minX + thickness * 2, height, thickness], position: [centerX, centerY, maxZ + thickness / 2] },
  ];
  return {
    minX, maxX, minZ, maxZ, floorY, height, thickness,
    topY: floorY + height,
    outerMinX: minX - thickness, outerMaxX: maxX + thickness,
    outerMinZ: minZ - thickness, outerMaxZ: maxZ + thickness,
    walls,
  };
})();

export const MAX_PRIZE_RADIUS_WORLD = 0.55;

export interface PrizeSpawn {
  x: number;
  y: number;
  z: number;
  yaw: number;
  velocity: CabinetVector;
  angularVelocity: CabinetVector;
}

/** Build a fresh, non-overlapping initial drop outside the guarded opening. */
export function createPrizeSpawnLayout(radii: readonly number[], random: () => number = Math.random): PrizeSpawn[] {
  if (radii.length !== 18) throw new RangeError('The initial prize fill has eighteen prizes.');
  if (radii.some(radius => !(radius > 0 && radius <= MAX_PRIZE_RADIUS_WORLD))) {
    throw new RangeError(`Prize radius must be positive and at most ${MAX_PRIZE_RADIUS_WORLD}.`);
  }
  const scale = MACHINE_LAYOUT.worldScale;
  const floorY = MACHINE_LAYOUT.worldY + MACHINE_LAYOUT.floorY * scale;
  const halfWidth = MACHINE_LAYOUT.halfWidth * scale;
  const backZ = MACHINE_LAYOUT.backZ * scale;
  const frontZ = MACHINE_LAYOUT.frontZ * scale;
  const guard = {
    minX: CHUTE_GUARD.outerMinX * scale,
    maxX: CHUTE_GUARD.outerMaxX * scale,
    minZ: CHUTE_GUARD.outerMinZ * scale,
    maxZ: CHUTE_GUARD.outerMaxZ * scale,
  };
  const constrain = (position: { x: number; z: number }, radius: number) => {
    position.x = Math.max(-halfWidth + radius + 0.035, Math.min(halfWidth - radius - 0.035, position.x));
    position.z = Math.max(backZ + radius + 0.035, Math.min(frontZ - radius - 0.035, position.z));
    // Only the rear and right of the chute have room for full-size prizes.
    const right = guard.maxX + radius + 0.055;
    const rear = guard.minZ - radius - 0.055;
    if (position.x < right && position.z > rear) {
      if (right - position.x < position.z - rear) position.x = right;
      else position.z = rear;
    }
  };
  const withDrop = (positions: { x: number; z: number }[]): PrizeSpawn[] => positions.map((position, index) => ({
    ...position,
    // Limit the fall near the low guard so prizes cannot bounce over it.
    // Gravity and contacts still handle the whole drop and settling motion.
    y: floorY + radii[index] + 0.22 + random() * 0.45,
    yaw: random() * Math.PI * 2,
    velocity: [(random() - 0.5) * 0.12, 0, (random() - 0.5) * 0.12],
    angularVelocity: [(random() - 0.5) * 0.9, (random() - 0.5) * 0.9, (random() - 0.5) * 0.9],
  }));
  for (let fillAttempt = 0; fillAttempt < 12; fillAttempt++) {
    const positions = radii.map(radius => {
      const position = {
        x: (random() - 0.5) * (halfWidth * 2 - radius * 2),
        z: backZ + radius + random() * (frontZ - backZ - radius * 2),
      };
      constrain(position, radius);
      return position;
    });
    // Relax a random scatter just enough to remove overlapping proxies. There
    // are no rows or slots; every initialization produces a different packing.
    for (let iteration = 0; iteration < 2500; iteration++) {
      let largestOverlap = 0;
      for (let a = 0; a < positions.length; a++) {
        for (let b = a + 1; b < positions.length; b++) {
          let dx = positions[b].x - positions[a].x;
          let dz = positions[b].z - positions[a].z;
          let distance = Math.hypot(dx, dz);
          if (distance < 1e-6) {
            const angle = random() * Math.PI * 2;
            dx = Math.cos(angle) * 1e-6;
            dz = Math.sin(angle) * 1e-6;
            distance = 1e-6;
          }
          const overlap = radii[a] + radii[b] + 0.025 - distance;
          if (overlap <= 0) continue;
          largestOverlap = Math.max(largestOverlap, overlap);
          const push = overlap / distance * 0.5;
          positions[a].x -= dx * push;
          positions[a].z -= dz * push;
          positions[b].x += dx * push;
          positions[b].z += dz * push;
        }
      }
      positions.forEach((position, index) => constrain(position, radii[index]));
      if (largestOverlap > 0.002) continue;
      return withDrop(positions);
    }
  }
  // A degenerate random source must not stop scene initialization. This known
  // safe packing is only a fallback after all randomized scatter retries fail.
  return withDrop(radii.map((_, index) => {
    const row = index < 12 ? Math.floor(index / 6) : 2 + Math.floor((index - 12) / 3);
    const column = index < 12 ? index % 6 : 3 + (index - 12) % 3;
    return {
      x: (column - 2.5) * (MAX_PRIZE_RADIUS_WORLD * 2 + 0.01) + (row % 2 === 0 ? -0.016 : 0.016),
      z: backZ + MAX_PRIZE_RADIUS_WORLD + 0.03 + row * (MAX_PRIZE_RADIUS_WORLD * 2 + 0.035),
    };
  }));
}
