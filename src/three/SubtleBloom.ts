import * as THREE from 'three';

/** Quarter-resolution highlight extraction and separable blur. */
export class SubtleBloom {
  private targets = [new THREE.WebGLRenderTarget(1, 1), new THREE.WebGLRenderTarget(1, 1)];
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private material = new THREE.ShaderMaterial({
    depthTest: false, depthWrite: false,
    uniforms: { source: { value: null }, direction: { value: new THREE.Vector2() }, extract: { value: true } },
    vertexShader: `varying vec2 uvOut; void main() { uvOut = uv; gl_Position = vec4(position.xy, 0., 1.); }`,
    fragmentShader: `
      uniform sampler2D source;
      uniform vec2 direction;
      uniform bool extract;
      varying vec2 uvOut;
      void main() {
        vec3 c = texture2D(source, uvOut).rgb;
        if (extract) {
          float brightness = max(c.r, max(c.g, c.b));
          c *= smoothstep(0.60, 0.90, brightness);
        } else {
          c *= 0.227027;
          c += texture2D(source, uvOut + direction * 1.384615).rgb * 0.316216;
          c += texture2D(source, uvOut - direction * 1.384615).rgb * 0.316216;
          c += texture2D(source, uvOut + direction * 3.230769).rgb * 0.070270;
          c += texture2D(source, uvOut - direction * 3.230769).rgb * 0.070270;
        }
        gl_FragColor = vec4(c, 1.);
      }`
  });
  private quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
  constructor() { this.scene.add(this.quad); }
  setSize(width: number, height: number) {
    this.targets.forEach(target => target.setSize(Math.max(1, Math.round(width / 4)), Math.max(1, Math.round(height / 4))));
  }
  get texture() { return this.targets[0].texture; }
  render(renderer: THREE.WebGLRenderer, source: THREE.Texture) {
    const previous = renderer.getRenderTarget();
    const u = this.material.uniforms;
    try {
      u.source.value = source;
      u.extract.value = true;
      renderer.setRenderTarget(this.targets[0]);
      renderer.render(this.scene, this.camera);
      u.extract.value = false;
      u.source.value = this.targets[0].texture;
      u.direction.value.set(2 / this.targets[0].width, 0);
      renderer.setRenderTarget(this.targets[1]);
      renderer.render(this.scene, this.camera);
      u.source.value = this.targets[1].texture;
      u.direction.value.set(0, 2 / this.targets[0].height);
      renderer.setRenderTarget(this.targets[0]);
      renderer.render(this.scene, this.camera);
    } finally { renderer.setRenderTarget(previous); }
  }
  dispose() {
    this.targets.forEach(target => target.dispose());
    this.quad.geometry.dispose();
    this.material.dispose();
  }
}
