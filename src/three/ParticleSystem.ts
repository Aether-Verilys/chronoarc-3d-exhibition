import * as THREE from 'three';

interface SparkParticle {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  color: THREE.Color;
  life: number;
  maxLife: number;
  size: number;
}

export class ParticleSystem {
  public group: THREE.Group;
  private ambientDustMesh: THREE.Points;
  private dustMaterial: THREE.ShaderMaterial;
  private sparkMesh: THREE.Points;
  private sparkParticles: SparkParticle[] = [];

  private maxSparks = 400;
  private sparkPositions: Float32Array;
  private sparkColors: Float32Array;
  private sparkSizes: Float32Array;

  constructor() {
    this.group = new THREE.Group();

    // Soft indoor dust; animation stays on the GPU in a single draw call.
    const dustCount = 400;
    const dustGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(dustCount * 3);
    const seeds = new Float32Array(dustCount);
    const sizes = new Float32Array(dustCount);
    for (let i = 0; i < dustCount; i++) {
      // Distribute throughout the room rather than concentrating near the lens.
      positions[i * 3] = Math.random() * 90 - 45;
      positions[i * 3 + 1] = Math.random() * 32 - 12;
      positions[i * 3 + 2] = Math.random() * 72 - 33;
      seeds[i] = Math.random() * Math.PI * 2;
      sizes[i] = 0.05 + Math.pow(Math.random(), 3) * 0.07;
    }
    dustGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    dustGeo.setAttribute('seed', new THREE.BufferAttribute(seeds, 1));
    dustGeo.setAttribute('dustSize', new THREE.BufferAttribute(sizes, 1));
    this.dustMaterial = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: true,
      blending: THREE.AdditiveBlending,
      uniforms: { time: { value: 0 }, viewportHeight: { value: 1 } },
      vertexShader: `
        attribute float seed;
        attribute float dustSize;
        uniform float time;
        uniform float viewportHeight;
        varying float opacity;
        varying float softness;
        void main() {
          vec3 p = position;
          float speed = 0.8 + seed * 0.08;
          p.x = mod(position.x + 45. + time * speed + sin(time * 0.65 + seed) * 1.2, 90.) - 45.;
          p.z = mod(position.z + 33. + time * cos(seed) * 0.65 + cos(time * 0.5 + seed * 2.) * 0.8, 72.) - 33.;
          p.y = mod(position.y + 12. - time * (0.45 + seed * 0.04), 32.) - 12.;
          vec4 view = modelViewMatrix * vec4(p, 1.);
          float depth = -view.z;
          gl_Position = projectionMatrix * view;
          gl_PointSize = clamp(dustSize * viewportHeight * projectionMatrix[1][1] / max(depth, 0.1), 2.5, 8.0);
          float boundsFade = smoothstep(-12., -10., p.y) * (1. - smoothstep(18., 20., p.y));
          boundsFade *= smoothstep(0., 2., min(p.x + 45., 45. - p.x))
            * smoothstep(0., 2., min(p.z + 33., 39. - p.z));
          float light = 0.55 + 0.45 * pow(0.5 + 0.5 * sin(p.x * 0.25 + p.z * 0.12), 2.);
          opacity = boundsFade * smoothstep(1., 4., depth) * (1. - smoothstep(36., 65., depth))
            * light * (0.60 + 0.15 * sin(time * 0.35 + seed));
          softness = 1. - smoothstep(3., 12., depth);
        }`,
      fragmentShader: `
        varying float opacity;
        varying float softness;
        void main() {
          float r = length(gl_PointCoord - 0.5) * 2.;
          float alpha = exp(-r * r * mix(3.0, 2.0, softness)) * (1. - smoothstep(0.65, 1., r)) * opacity;
          if (alpha < 0.003) discard;
          gl_FragColor = vec4(vec3(1.0, 0.94, 0.82), alpha);
        }`
    });
    this.ambientDustMesh = new THREE.Points(dustGeo, this.dustMaterial);
    // GPU displacement extends beyond the static geometry bounds.
    this.ambientDustMesh.frustumCulled = false;
    const drawingSize = new THREE.Vector2();
    this.ambientDustMesh.onBeforeRender = renderer => {
      const target = renderer.getRenderTarget();
      this.dustMaterial.uniforms.viewportHeight.value = target
        ? target.height : renderer.getDrawingBufferSize(drawingSize).y;
    };
    this.group.add(this.ambientDustMesh);

    // 2. Interactive Spark Bursts
    const sparkGeo = new THREE.BufferGeometry();
    this.sparkPositions = new Float32Array(this.maxSparks * 3);
    this.sparkColors = new Float32Array(this.maxSparks * 3);
    this.sparkSizes = new Float32Array(this.maxSparks);

    sparkGeo.setAttribute('position', new THREE.BufferAttribute(this.sparkPositions, 3));
    sparkGeo.setAttribute('color', new THREE.BufferAttribute(this.sparkColors, 3));
    sparkGeo.setAttribute('size', new THREE.BufferAttribute(this.sparkSizes, 1));

    const sparkMat = new THREE.PointsMaterial({
      size: 0.22,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      blending: THREE.NormalBlending
    });

    this.sparkMesh = new THREE.Points(sparkGeo, sparkMat);
    this.group.add(this.sparkMesh);
  }

  /**
   * Spawns an explosion of spark particles at the model position
   */
  public emitBurst(origin: THREE.Vector3, colorHex: string, count: number = 36) {
    const col = new THREE.Color(colorHex);

    for (let i = 0; i < count; i++) {
      if (this.sparkParticles.length >= this.maxSparks) {
        this.sparkParticles.shift();
      }

      const angle = Math.random() * Math.PI * 2;
      const speed = 1.6 + Math.random() * 4.5;
      const upward = 2.2 + Math.random() * 4.8;

      this.sparkParticles.push({
        position: origin.clone().add(new THREE.Vector3(
          (Math.random() - 0.5) * 0.5,
          Math.random() * 0.4,
          (Math.random() - 0.5) * 0.5
        )),
        velocity: new THREE.Vector3(
          Math.cos(angle) * speed,
          upward,
          Math.sin(angle) * speed
        ),
        color: col.clone(),
        life: 0,
        maxLife: 0.65 + Math.random() * 0.5,
        size: 0.16 + Math.random() * 0.16
      });
    }
  }

  public dispose() {
    this.ambientDustMesh.geometry.dispose();
    this.dustMaterial.dispose();
    this.sparkMesh.geometry.dispose();
    (this.sparkMesh.material as THREE.Material).dispose();
  }

  public update(time: number, delta: number) {
    this.dustMaterial.uniforms.time.value = time;

    for (let i = this.sparkParticles.length - 1; i >= 0; i--) {
      const p = this.sparkParticles[i];
      p.life += delta;

      if (p.life >= p.maxLife) {
        this.sparkParticles.splice(i, 1);
        continue;
      }

      p.velocity.y -= 9.8 * delta;
      p.velocity.x *= 0.95;
      p.velocity.z *= 0.95;
      p.position.addScaledVector(p.velocity, delta);

      if (p.position.y < 0.05) {
        p.position.y = 0.05;
        p.velocity.y = -p.velocity.y * 0.35;
      }
    }

    const posAttr = this.sparkMesh.geometry.attributes.position as THREE.BufferAttribute;
    const colAttr = this.sparkMesh.geometry.attributes.color as THREE.BufferAttribute;

    for (let i = 0; i < this.maxSparks; i++) {
      if (i < this.sparkParticles.length) {
        const p = this.sparkParticles[i];
        posAttr.setXYZ(i, p.position.x, p.position.y, p.position.z);
        const fade = 1.0 - p.life / p.maxLife;
        colAttr.setXYZ(i, p.color.r * fade, p.color.g * fade, p.color.b * fade);
      } else {
        posAttr.setXYZ(i, 0, -999, 0);
      }
    }

    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
  }
}
