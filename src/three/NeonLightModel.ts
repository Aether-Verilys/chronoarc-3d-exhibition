import * as THREE from 'three';

/** Reuse the Tripo fixture while giving each diffuser its own light color. */
export function createNeonLightModel(source: THREE.Group, color: number): THREE.Group {
  const model = source.clone(true);
  model.name = 'TripoNeonLight';
  const bounds = new THREE.Box3().setFromObject(model);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const scale = 13.2 / size.y;
  model.scale.multiplyScalar(scale);
  model.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
  model.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const tint = (sourceMaterial: THREE.Material) => {
      const material = sourceMaterial.clone();
      if (material instanceof THREE.MeshStandardMaterial && material.map) {
        material.emissive.setHex(color);
        material.emissiveIntensity = 0.95;
        material.envMapIntensity = 1.5;
        material.emissiveMap = material.map;
        // The generated texture separates white opal from dark metal. Restrict
        // emission to the neutral, bright diffuser so the housing stays detailed.
        material.onBeforeCompile = shader => {
          shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `
            #ifdef USE_EMISSIVEMAP
              vec3 lampSurface = texture2D(emissiveMap, vEmissiveMapUv).rgb;
              float lampMin = min(lampSurface.r, min(lampSurface.g, lampSurface.b));
              float lampMax = max(lampSurface.r, max(lampSurface.g, lampSurface.b));
              float diffuser = smoothstep(0.14, 0.3, lampMin)
                * (1.0 - smoothstep(0.2, 0.45, lampMax - lampMin));
              totalEmissiveRadiance *= diffuser;
            #endif
          `);
        };
        material.customProgramCacheKey = () => 'tripo-neon-diffuser-v1';
      }
      return material;
    };
    object.material = Array.isArray(object.material) ? object.material.map(tint) : tint(object.material);
    object.castShadow = object.receiveShadow = true;
  });
  const root = new THREE.Group();
  // Narrow the generated housing to keep the pair subordinate to the cabinet.
  root.scale.set(0.42, 1, 0.42);
  root.add(model);
  return root;
}
