import * as THREE from 'three';

/** A small, rigged wrapper around the five-finger claw GLB. */
export interface ClawModel {
  /** The normalized model. Its origin is the centre mounting point. */
  root: THREE.Group;
  /** All opening poses, in mounting-point coordinates including the normalization scale. */
  readonly bounds: THREE.Box3;
  /** 0 is closed and 1 is the authored (open) pose. */
  setOpen(amount: number): void;
}

type ClawPivot = {
  pivot: THREE.Group;
  axis: THREE.Vector3;
  angle: number;
};

const FINGER_NAMES = ['claw1', 'claw2', 'claw3', 'claw4', 'claw5'];
const CENTRE_NAME = 'claw.centre';

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

/**
 * Turn the user's exported claw into a small, animatable scene object.
 *
 * The GLB has an object-space export offset on every mesh.  We retain the
 * original BufferGeometry and materials and remove that offset at the group
 * level, so this function does not mutate shared render resources.
 */
export function createClawModel(source: THREE.Group, height = 1.1): ClawModel {
  const root = new THREE.Group();
  root.name = 'ClawModel';
  const model = source.clone(true);

  // The loader returns a Group/Scene.  Keep it in the hierarchy while we
  // normalize it; this also preserves any non-claw nodes and their textures.
  root.add(model);
  model.updateMatrixWorld(true);

  const fingers: THREE.Object3D[] = [];
  let centre: THREE.Object3D | undefined;
  model.traverse((object) => {
    // GLTFLoader removes dots from node names but preserves the exported name.
    if (object.name === CENTRE_NAME || object.userData.name === CENTRE_NAME) centre = object;
    if (FINGER_NAMES.includes(object.name)) fingers.push(object);
  });

  // Find the authored top and centre in source-local coordinates.  The
  // centre mesh is the mounting reference; its top is the root origin.
  const allBounds = new THREE.Box3().setFromObject(model);
  const centreBounds = centre ? new THREE.Box3().setFromObject(centre) : allBounds;
  const topY = Number.isFinite(centreBounds.max.y) ? centreBounds.max.y : allBounds.max.y;
  const centreX = centreBounds.getCenter(new THREE.Vector3()).x;
  const centreZ = centreBounds.getCenter(new THREE.Vector3()).z;
  const authoredHeight = Math.max(1e-5, topY - allBounds.min.y);
  const requestedHeight = Number.isFinite(height) && height > 0 ? height : 1.1;

  // Move the exported origin to the mounting point.  Keeping this as a group
  // transform avoids touching geometry attributes and makes repeated GLTF
  // instances safe to share.
  model.position.sub(new THREE.Vector3(centreX, topY, centreZ));
  model.updateMatrixWorld(true);

  const pivots: ClawPivot[] = [];
  for (const finger of fingers) {
    const fingerBounds = new THREE.Box3().setFromObject(finger);
    const fingerSize = fingerBounds.getSize(new THREE.Vector3());
    const fingerTop = fingerBounds.max.y;

    // The upper few percent is the straight mounting section in the authored
    // meshes.  Its centre gives a stable hinge even when triangle density
    // differs between the five fingers.
    const hingeBand = Math.max(1e-6, fingerSize.y * 0.03);
    const hinge = new THREE.Vector3();
    const hingeBounds = new THREE.Box3();
    const position = (finger as THREE.Mesh).geometry?.getAttribute?.('position');
    if (position) {
      const point = new THREE.Vector3();
      for (let i = 0; i < position.count; i += 1) {
        point.fromBufferAttribute(position, i);
        finger.localToWorld(point);
        if (point.y >= fingerTop - hingeBand) {
          hingeBounds.expandByPoint(point);
        }
      }
    }
    if (!hingeBounds.isEmpty()) hingeBounds.getCenter(hinge);
    else hinge.copy(fingerBounds.getCenter(new THREE.Vector3())).setY(fingerTop);

    const pivot = new THREE.Group();
    pivot.name = `${finger.name}.pivot`;
    root.add(pivot);
    pivot.position.copy(root.worldToLocal(hinge.clone()));
    // attach() preserves the mesh's current world transform, including the
    // original export translation and any authored rotation.
    pivot.attach(finger);

    const radial = new THREE.Vector3(pivot.position.x, 0, pivot.position.z);
    if (radial.lengthSq() < 1e-8) radial.set(1, 0, 0);
    radial.normalize();
    const axis = new THREE.Vector3(0, 1, 0).cross(radial).normalize();

    // Pick the sign which moves the lower end toward the centre.  This keeps
    // all five claws symmetric even if their authored winding differs.
    const pivotBox = new THREE.Box3().setFromObject(pivot);
    const tip = new THREE.Vector3(
      pivotBox.getCenter(new THREE.Vector3()).x,
      pivotBox.min.y,
      pivotBox.getCenter(new THREE.Vector3()).z,
    );
    const tipVector = root.worldToLocal(tip).sub(pivot.position);
    const testAngle = THREE.MathUtils.degToRad(22);
    const plus = tipVector.clone().applyAxisAngle(axis, testAngle);
    const minus = tipVector.clone().applyAxisAngle(axis, -testAngle);
    const plusInward = plus.x * radial.x + plus.z * radial.z;
    const minusInward = minus.x * radial.x + minus.z * radial.z;
    const sign = plusInward < minusInward ? 1 : -1;
    pivots.push({ pivot, axis, angle: sign * testAngle });
  }

  // Scale after constructing pivots so the hinge layout and authored pose are
  // scaled uniformly.  A tiny guard avoids NaN when a malformed GLB is passed.
  const uniformScale = requestedHeight / authoredHeight;
  root.scale.setScalar(Number.isFinite(uniformScale) ? uniformScale : 1);

  const setOpen = (amount: number): void => {
    const open = clamp01(amount);
    for (const { pivot, axis, angle } of pivots) {
      pivot.quaternion.setFromAxisAngle(axis, angle * (1 - open));
    }
  };
  setOpen(1);

  // Cache a conservative envelope once, before a caller positions the root.
  // It includes the normalized scale but no later parent/head transform.
  const bounds = new THREE.Box3();
  const poseBounds = new THREE.Box3();
  const samples = 32;
  for (let sample = 0; sample <= samples; sample += 1) {
    setOpen(sample / samples);
    bounds.union(poseBounds.setFromObject(root));
  }

  // Every vertex follows a circular arc between samples.  Its deviation from
  // the endpoint chord is at most r * (1 - cos(angle / 2)); include that gap so
  // the cached bounds cover intermediate poses, not just the sampled ones.
  let arcPadding = 0;
  const corner = new THREE.Vector3();
  const hingeWorld = new THREE.Vector3();
  for (const { pivot, angle } of pivots) {
    poseBounds.setFromObject(pivot);
    pivot.getWorldPosition(hingeWorld);
    let radius = 0;
    for (let cornerIndex = 0; cornerIndex < 8; cornerIndex += 1) {
      corner.set(
        cornerIndex & 1 ? poseBounds.max.x : poseBounds.min.x,
        cornerIndex & 2 ? poseBounds.max.y : poseBounds.min.y,
        cornerIndex & 4 ? poseBounds.max.z : poseBounds.min.z,
      );
      radius = Math.max(radius, corner.distanceTo(hingeWorld));
    }
    arcPadding = Math.max(arcPadding, radius * (1 - Math.cos(Math.abs(angle) / (2 * samples))));
  }
  bounds.expandByScalar(arcPadding + requestedHeight * 1e-7);
  setOpen(1);
  root.updateMatrixWorld(true);

  return { root, bounds, setOpen };
}

export default createClawModel;
