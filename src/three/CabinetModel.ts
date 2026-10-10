import * as THREE from 'three';
import { MACHINE_MODEL } from './ClawMachineLayout';

/** Native-space openings in the imported cabinet mesh. */
const OPENINGS = [
  { min: [-0.18, 0.40, 0.003] as const, max: [-0.046, 0.46, 0.137] as const },
  { min: [-0.188, 0.083, 0.10] as const, max: [-0.039, 0.229, 0.23] as const },
];

type Sample = { position: THREE.Vector3; values: Record<string, number[]> };
type Polygon = Sample[];

const EPSILON = 1e-7;

function interpolate(a: Sample, b: Sample, t: number, names: string[]): Sample {
  const values: Record<string, number[]> = {};
  for (const name of names) {
    const av = a.values[name];
    const bv = b.values[name];
    values[name] = av.map((value, i) => value + (bv[i] - value) * t);
  }
  return {
    position: a.position.clone().lerp(b.position, t),
    values,
  };
}

/** Split a convex polygon at one axis-aligned plane into its outside and inside parts. */
function splitPolygon(
  polygon: Polygon,
  axis: 0 | 1 | 2,
  bound: number,
  insideGreater: boolean,
  names: string[],
): { outside: Polygon; inside: Polygon } {
  const outside: Polygon = [];
  const inside: Polygon = [];
  if (polygon.length === 0) return { outside, inside };

  const signed = (point: Sample) => (point.position.getComponent(axis) - bound) * (insideGreater ? 1 : -1);
  const classify = (point: Sample) => signed(point) >= -EPSILON;
  let previous = polygon[polygon.length - 1];
  let previousInside = classify(previous);
  for (const current of polygon) {
    const currentInside = classify(current);
    if (previousInside !== currentInside) {
      const a = signed(previous);
      const b = signed(current);
      const t = THREE.MathUtils.clamp(a / (a - b), 0, 1);
      const crossing = interpolate(previous, current, t, names);
      outside.push(crossing);
      inside.push(crossing);
    }
    (currentInside ? inside : outside).push(current);
    previous = current;
    previousInside = currentInside;
  }
  return { outside, inside };
}

/**
 * Remove a convex axis-aligned box from a triangle. Keeping the outside pieces
 * separately avoids deleting a whole large cabinet face when it is only partly
 * covered by an opening.
 */
function subtractBox(triangle: Polygon, box: { min: readonly number[]; max: readonly number[] }, names: string[]): Polygon[] {
  let pending: Polygon[] = [triangle];
  const outside: Polygon[] = [];
  const planes: Array<[0 | 1 | 2, number, boolean]> = [
    [0, box.min[0], true], [0, box.max[0], false],
    [1, box.min[1], true], [1, box.max[1], false],
    [2, box.min[2], true], [2, box.max[2], false],
  ];
  for (const [axis, bound, insideGreater] of planes) {
    const next: Polygon[] = [];
    for (const polygon of pending) {
      const split = splitPolygon(polygon, axis, bound, insideGreater, names);
      if (split.outside.length >= 3) outside.push(split.outside);
      if (split.inside.length >= 3) next.push(split.inside);
    }
    pending = next;
    if (pending.length === 0) break;
  }
  // `pending` is the portion inside all six planes, i.e. the part to remove.
  return outside;
}

function readSample(geometry: THREE.BufferGeometry, index: number, names: string[]): Sample {
  const values: Record<string, number[]> = {};
  for (const name of names) {
    const attribute = geometry.getAttribute(name);
    const result: number[] = [];
    for (let component = 0; component < attribute.itemSize; component++) {
      result.push(attribute.getComponent(index, component));
    }
    values[name] = result;
  }
  const position = new THREE.Vector3(...values.position as [number, number, number]);
  return { position, values };
}

function makeCutGeometry(source: THREE.BufferGeometry): THREE.BufferGeometry {
  const attributes = source.attributes;
  if (!attributes.position) return source.clone();
  const names = Object.keys(attributes);
  const positions: Record<string, number[]> = Object.fromEntries(names.map(name => [name, []]));
  const groups: Array<{ start: number; count: number; materialIndex: number }> = [];
  const index = source.index;
  const triangleCount = index ? Math.floor(index.count / 3) : Math.floor(attributes.position.count / 3);
  const vertexAt = (triangle: number, corner: number) => index
    ? index.getX(triangle * 3 + corner)
    : triangle * 3 + corner;

  for (let triangle = 0; triangle < triangleCount; triangle++) {
    const polygon: Polygon = [
      readSample(source, vertexAt(triangle, 0), names),
      readSample(source, vertexAt(triangle, 1), names),
      readSample(source, vertexAt(triangle, 2), names),
    ];
    let pieces: Polygon[] = [polygon];
    for (const opening of OPENINGS) {
      pieces = pieces.flatMap(piece => subtractBox(piece, opening, names));
      if (pieces.length === 0) break;
    }
    for (const piece of pieces) {
      // All pieces are convex intersections, so a fan is sufficient.
      for (let i = 1; i < piece.length - 1; i++) {
        const edgeA = piece[i].position.clone().sub(piece[0].position);
        const edgeB = piece[i + 1].position.clone().sub(piece[0].position);
        if (edgeA.cross(edgeB).lengthSq() < 1e-22) continue;
        if (source.groups.length > 0) {
          const materialIndex = source.groups.find(group => triangle * 3 >= group.start && triangle * 3 < group.start + group.count)?.materialIndex ?? 0;
          const last = groups[groups.length - 1];
          if (last?.materialIndex === materialIndex) last.count += 3;
          else groups.push({ start: positions.position.length / 3, count: 3, materialIndex });
        }
        for (const sample of [piece[0], piece[i], piece[i + 1]]) {
          for (const name of names) positions[name].push(...sample.values[name]);
        }
      }
    }
  }

  const result = new THREE.BufferGeometry();
  for (const name of names) {
    const original = attributes[name];
    const ArrayType = original.array.constructor as THREE.TypedArrayConstructor;
    const attribute = new THREE.BufferAttribute(new ArrayType(positions[name].length), original.itemSize, original.normalized);
    // getComponent/setComponent round-trip normalized attributes correctly.
    // The imported model uses float position, normal, and UV data.
    for (let i = 0; i < positions[name].length; i++) {
      attribute.setComponent(Math.floor(i / original.itemSize), i % original.itemSize, positions[name][i]);
    }
    attribute.name = original.name;
    result.setAttribute(name, attribute);
  }
  for (const group of groups) result.addGroup(group.start, group.count, group.materialIndex);
  result.name = source.name;
  result.computeBoundingBox();
  result.computeBoundingSphere();
  return result;
}

/** Clone the supplied cabinet and cut the physical playfield/outlet openings. */
export function prepareCabinetModel(source: THREE.Group): THREE.Group {
  const root = source.clone(true);
  root.name = 'ImportedMachine';
  root.scale.setScalar(MACHINE_MODEL.scale);
  root.position.y = MACHINE_MODEL.bottom;
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry = makeCutGeometry(object.geometry);
    object.castShadow = true;
    object.receiveShadow = true;
  });
  return root;
}
