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
        material.emissiveIntensity = 0.65;
        material.envMapIntensity = 1.5;
        material.emissiveMap = material.map;
        // Tint only the opal diffuser: its original white surface plus emission
        // otherwise clips to white when the scene's additive bloom is applied.
        material.onBeforeCompile = shader => {
          shader.uniforms.lampTint = { value: new THREE.Color(color) };
          shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', '#include <common>\nuniform vec3 lampTint;')
            .replace('#include <map_fragment>', `
              #include <map_fragment>
              vec3 lampSurface = diffuseColor.rgb;
              float lampMin = min(lampSurface.r, min(lampSurface.g, lampSurface.b));
              float lampMax = max(lampSurface.r, max(lampSurface.g, lampSurface.b));
              float diffuser = smoothstep(0.14, 0.3, lampMin)
                * (1.0 - smoothstep(0.2, 0.45, lampMax - lampMin));
              diffuseColor.rgb *= mix(vec3(1.0), lampTint * 0.65, diffuser * 0.9);
            `)
            .replace('#include <emissivemap_fragment>', `
              // Frosted opal should not pick up a sharp white point-light glare.
              roughnessFactor = max(roughnessFactor, diffuser * 0.82);
              metalnessFactor *= 1.0 - diffuser;
              totalEmissiveRadiance *= diffuser;
            `);
        };
        material.customProgramCacheKey = () => 'tripo-neon-diffuser-v2';
      }
      return material;
    };
    object.material = Array.isArray(object.material) ? object.material.map(tint) : tint(object.material);
    object.castShadow = object.receiveShadow = true;
  });
  const root = new THREE.Group();
  // Narrow the generated housing to keep the pair subordinate to the cabinet.
  root.scale.set(0.32, 1, 0.32);
  root.add(model);
  return root;
}
