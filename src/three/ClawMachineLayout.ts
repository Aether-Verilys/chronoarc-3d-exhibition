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
