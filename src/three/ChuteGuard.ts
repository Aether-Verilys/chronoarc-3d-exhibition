import * as THREE from 'three';
import { CHUTE_GUARD } from './ClawMachineLayout';

/** Open-topped prize chute, using the same dimensions as its collision walls. */
export function createChuteGuard(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'PrizeChuteGuard';
  const panelMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x93b6ca, transparent: true, opacity: 0.24,
    roughness: 0.18, metalness: 0, clearcoat: 0.4,
    depthWrite: false,
  });
  const frameMaterial = new THREE.MeshStandardMaterial({
    color: 0x7d8995, roughness: 0.3, metalness: 0.65,
  });
  const railHeight = 0.02;
  for (const [index, wall] of CHUTE_GUARD.walls.entries()) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(...wall.size), panelMaterial);
    panel.name = `ChuteGuardPanel${index}`;
    panel.position.set(...wall.position);
    panel.renderOrder = 6;
    group.add(panel);
    for (const y of [CHUTE_GUARD.floorY + railHeight / 2, CHUTE_GUARD.topY - railHeight / 2]) {
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(wall.size[0], railHeight, wall.size[2]), frameMaterial);
      rail.position.set(wall.position[0], y, wall.position[2]);
      rail.castShadow = rail.receiveShadow = true;
      group.add(rail);
    }
  }
  for (const x of [CHUTE_GUARD.minX - CHUTE_GUARD.thickness / 2,
    CHUTE_GUARD.maxX + CHUTE_GUARD.thickness / 2]) {
    for (const z of [CHUTE_GUARD.minZ - CHUTE_GUARD.thickness / 2,
      CHUTE_GUARD.maxZ + CHUTE_GUARD.thickness / 2]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(
        CHUTE_GUARD.thickness, CHUTE_GUARD.height, CHUTE_GUARD.thickness), frameMaterial);
      post.position.set(x, CHUTE_GUARD.floorY + CHUTE_GUARD.height / 2, z);
      post.castShadow = post.receiveShadow = true;
      group.add(post);
    }
  }
  return group;
}
