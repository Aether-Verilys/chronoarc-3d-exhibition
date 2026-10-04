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
  private sparkMesh: THREE.Points;
  private sparkParticles: SparkParticle[] = [];

  private maxSparks = 400;
  private sparkPositions: Float32Array;
  private sparkColors: Float32Array;
  private sparkSizes: Float32Array;

  constructor() {
    this.group = new THREE.Group();

    // 1. Ambient Stardust (Luminous crystal specks for light background)
    const dustCount = 450;
    const dustGeo = new THREE.BufferGeometry();
    const dustPos = new Float32Array(dustCount * 3);
    const dustColors = new Float32Array(dustCount * 3);

    for (let i = 0; i < dustCount; i++) {
      dustPos[i * 3] = (Math.random() - 0.5) * 45;
      dustPos[i * 3 + 1] = Math.random() * 10 - 0.5;
      dustPos[i * 3 + 2] = (Math.random() - 0.5) * 40;

      // Saturated jewel tones visible against light background
      const choice = Math.random();
      if (choice < 0.33) {
        dustColors[i * 3] = 0.05; dustColors[i * 3 + 1] = 0.55; dustColors[i * 3 + 2] = 0.85; // Cyan-blue
      } else if (choice < 0.66) {
        dustColors[i * 3] = 0.85; dustColors[i * 3 + 1] = 0.45; dustColors[i * 3 + 2] = 0.1; // Amber
      } else {
        dustColors[i * 3] = 0.6; dustColors[i * 3 + 1] = 0.2; dustColors[i * 3 + 2] = 0.8; // Violet
      }
    }

    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
    dustGeo.setAttribute('color', new THREE.BufferAttribute(dustColors, 3));

    const dustMat = new THREE.PointsMaterial({
      size: 0.12,
      vertexColors: true,
      transparent: true,
      opacity: 0.55,
      blending: THREE.NormalBlending
    });

    this.ambientDustMesh = new THREE.Points(dustGeo, dustMat);
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

  public update(time: number, delta: number) {
    const dustAttr = this.ambientDustMesh.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < dustAttr.count; i++) {
      let y = dustAttr.getY(i) + Math.sin(time * 0.6 + i) * 0.003;
      if (y > 9) y = -0.3;
      dustAttr.setY(i, y);
    }
    dustAttr.needsUpdate = true;

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
