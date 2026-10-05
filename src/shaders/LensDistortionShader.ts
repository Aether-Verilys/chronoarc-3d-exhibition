import * as THREE from 'three';

/**
 * LensDistortionShader
 * Provides anamorphic horizontal stretch, barrel/fisheye curvature distortion,
 * chromatic fringe dispersion, and bright spatial perspective falloff.
 */
export const LensDistortionShader = {
  uniforms: {
    tBloom: { value: null as THREE.Texture | null },
    uBloomStrength: { value: 0.32 },
    tDiffuse: { value: null as THREE.Texture | null },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uStretchX: { value: 1.35 },     // Horizontal anamorphic stretch
    uStretchY: { value: 1.0 },      // Vertical stretch
    uDistortion: { value: 0.35 },   // Barrel distortion curvature
    uChromatic: { value: 0.45 },    // Chromatic aberration separation
    uVignette: { value: 0.25 },     // Peripheral vignette falloff
    uTime: { value: 0.0 },          // Time for dynamic optical breath
    uEnabled: { value: 1.0 }        // 1.0 = enabled, 0.0 = passthrough
  },

  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position, 1.0);
    }
  `,

  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform sampler2D tBloom;
    uniform float uBloomStrength;
    uniform vec2 uResolution;
    uniform float uStretchX;
    uniform float uStretchY;
    uniform float uDistortion;
    uniform float uChromatic;
    uniform float uVignette;
    uniform float uTime;
    uniform float uEnabled;

    varying vec2 vUv;

    // Distort UV coordinates based on anamorphic stretch and radial barrel curvature
    vec2 distort(vec2 uv, float k, float stretchX, float stretchY) {
      vec2 center = uv - 0.5;
      
      // Anamorphic aspect correction & stretch scaling
      center.x *= stretchX;
      center.y *= stretchY;

      float r2 = dot(center, center);
      // Higher order polynomial for cinematic lens stretch
      float f = 1.0 + r2 * (k * 0.8 + r2 * k * 0.4);

      // Restore centered aspect and un-stretch
      vec2 distorted = (center * f);
      distorted.x /= stretchX;
      distorted.y /= stretchY;

      return distorted + 0.5;
    }

    void main() {
      if (uEnabled < 0.5) {
        gl_FragColor = vec4(texture2D(tDiffuse, vUv).rgb + texture2D(tBloom, vUv).rgb * uBloomStrength, 1.0);
        return;
      }

      vec2 uv = vUv;
      vec2 centered = uv - 0.5;

      // Base distorted UV
      vec2 uvDistorted = distort(uv, uDistortion, uStretchX, uStretchY);

      // Bright background color fallback matching scene background
      vec4 brightBg = vec4(0.953, 0.965, 0.980, 1.0);

      // Check bounds
      if (uvDistorted.x < 0.0 || uvDistorted.x > 1.0 || uvDistorted.y < 0.0 || uvDistorted.y > 1.0) {
        gl_FragColor = brightBg;
        return;
      }

      // Chromatic Aberration with radial falloff
      float distFromCenter = length(centered);
      float chromShift = uChromatic * 0.018 * distFromCenter;

      vec2 uvR = distort(uv, uDistortion * (1.0 + chromShift * 1.8), uStretchX, uStretchY);
      vec2 uvG = uvDistorted;
      vec2 uvB = distort(uv, uDistortion * (1.0 - chromShift * 1.8), uStretchX, uStretchY);

      float r = texture2D(tDiffuse, clamp(uvR, 0.0, 1.0)).r;
      float g = texture2D(tDiffuse, clamp(uvG, 0.0, 1.0)).g;
      float b = texture2D(tDiffuse, clamp(uvB, 0.0, 1.0)).b;

      // Soft bright vignette falloff towards edges
      float vignetteDist = length(centered * vec2(1.0, 1.15));
      float vig = 1.0 - smoothstep(0.4, 0.95, vignetteDist) * (uVignette * 0.4);

      vec3 color = (vec3(r, g, b) + texture2D(tBloom, uvDistorted).rgb * uBloomStrength) * vig;

      gl_FragColor = vec4(color, 1.0);
    }
  `
};
