import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { PrizeDefinition } from '../types/prizes';

interface PrizeModelViewerProps {
  prize: PrizeDefinition;
}

const MAX_PIXEL_RATIO = 2;

/** Dispose a loaded model and every resource owned by its materials. */
function disposeModel(root: THREE.Object3D): void {
  const disposedTextures = new Set<THREE.Texture>();
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;

    mesh.geometry?.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    materials.forEach((material) => {
      if (!material) return;
      Object.keys(material).forEach((key) => {
        const value = (material as unknown as Record<string, unknown>)[key];
        if (value instanceof THREE.Texture && !disposedTextures.has(value)) {
          disposedTextures.add(value);
          value.dispose();
        }
      });
      material.dispose();
    });
  });
}

function disposeSceneObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    materials.forEach((material) => material?.dispose());
  });
}

export function PrizeModelViewer({ prize }: PrizeModelViewerProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  // A new prize starts with a clean loading state. The attempt counter lets the
  // retry button restart the loader without making the parent manage any state.
  useEffect(() => {
    setStatus('loading');
  }, [prize.modelUrl, attempt]);

  const retry = useCallback(() => {
    setAttempt((value) => value + 1);
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    let disposed = false;
    let frameId = 0;
    let loadedModel: THREE.Object3D | undefined;
    let pmrem: THREE.PMREMGenerator | undefined;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0e172a);

    const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 1000);
    camera.position.set(0, 0.4, 3);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.setAttribute('aria-label', `${prize.name} 3D 预览`);
    renderer.domElement.setAttribute('role', 'img');
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    host.replaceChildren(renderer.domElement);

    // A neutral RoomEnvironment gives reflective materials enough light while
    // the explicit lights preserve readable form for matte model materials.
    pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    const environment = pmrem.fromScene(room, 0.04);
    scene.environment = environment.texture;
    disposeSceneObject(room);

    const keyLight = new THREE.DirectionalLight(0xffffff, 3.2);
    keyLight.position.set(3.5, 5, 4.5);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x9fc8ff, 1.55);
    fillLight.position.set(-4, 2, 1);
    scene.add(fillLight);

    const rimLight = new THREE.PointLight(0x8b5cf6, 18, 12, 2);
    rimLight.position.set(0, 2.4, -3);
    scene.add(rimLight);

    const floorMaterial = new THREE.MeshStandardMaterial({
      color: 0x182338,
      roughness: 0.74,
      metalness: 0.08,
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.05;
    floor.receiveShadow = true;
    scene.add(floor);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.rotateSpeed = 0.8;
    controls.zoomSpeed = 0.9;
    controls.minDistance = 0.05;
    controls.maxDistance = 100;
    controls.target.set(0, 0, 0);

    const zoom = (event: Event) => {
      const amount = (event as CustomEvent<number>).detail;
      if (typeof amount !== 'number' || !Number.isFinite(amount)) return;
      const offset = camera.position.clone().sub(controls.target);
      const nextDistance = THREE.MathUtils.clamp(offset.length() * amount, controls.minDistance, controls.maxDistance);
      camera.position.copy(controls.target).add(offset.normalize().multiplyScalar(nextDistance));
      controls.update();
    };
    const reset = () => controls.reset();
    host.addEventListener('prize-viewer-zoom', zoom);
    host.addEventListener('prize-viewer-reset', reset);

    const resize = () => {
      if (disposed) return;
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(host);

    const fitModel = (model: THREE.Object3D) => {
      const bounds = new THREE.Box3().setFromObject(model);
      const size = bounds.getSize(new THREE.Vector3());
      const center = bounds.getCenter(new THREE.Vector3());
      model.position.sub(center);

      // Use both vertical and horizontal FOV so a wide model remains inside
      // the viewport on a portrait modal as well as on a desktop display.
      const verticalFov = THREE.MathUtils.degToRad(camera.fov);
      const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect);
      const halfHeight = Math.max(size.y / 2, 0.001);
      const halfWidth = Math.max(size.x / 2, 0.001);
      const halfDepth = Math.max(size.z / 2, 0.001);
      const distanceForHeight = halfHeight / Math.tan(verticalFov / 2);
      const distanceForWidth = halfWidth / Math.tan(Math.max(horizontalFov, 0.01) / 2);
      const distanceForDepth = halfDepth * 1.35;
      const distance = Math.max(distanceForHeight, distanceForWidth, distanceForDepth) * 1.28;

      camera.position.set(0, Math.max(size.y * 0.08, 0.02), distance);
      camera.near = Math.max(distance / 100, 0.001);
      camera.far = Math.max(distance * 100, 100);
      camera.updateProjectionMatrix();
      controls.target.set(0, 0, 0);
      controls.minDistance = Math.max(distance * 0.35, 0.05);
      controls.maxDistance = Math.max(distance * 5, 2);
      controls.saveState();
      // Keep the model resting visually on the studio floor, regardless of
      // the source asset's origin or dimensions.
      floor.position.y = -size.y / 2 - Math.max(size.y * 0.025, 0.002);
      controls.update();
    };

    const loader = new GLTFLoader();
    loader.load(
      prize.modelUrl,
      (gltf) => {
        if (disposed) {
          disposeModel(gltf.scene);
          return;
        }
        loadedModel = gltf.scene;
        loadedModel.traverse((object) => {
          const mesh = object as THREE.Mesh;
          if (!mesh.isMesh) return;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
        });
        fitModel(loadedModel);
        scene.add(loadedModel);
        setStatus('ready');
      },
      undefined,
      () => {
        if (!disposed) setStatus('error');
      },
    );

    const render = () => {
      if (disposed) return;
      frameId = requestAnimationFrame(render);
      controls.update();
      renderer.render(scene, camera);
    };
    render();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      observer.disconnect();
      host.removeEventListener('prize-viewer-zoom', zoom);
      host.removeEventListener('prize-viewer-reset', reset);
      controls.dispose();
      if (loadedModel) {
        scene.remove(loadedModel);
        disposeModel(loadedModel);
      }
      floor.geometry.dispose();
      floorMaterial.dispose();
      scene.environment = null;
      environment.texture.dispose();
      pmrem?.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      host.replaceChildren();
    };
  }, [prize.modelUrl, prize.name, attempt]);

  return (
    <div
      ref={hostRef}
      className="relative w-full min-h-[280px] h-[min(64vh,560px)] overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-950 shadow-inner"
      aria-label={`${prize.name} 3D 预览`}
    >
      {status !== 'ready' && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-slate-950/75 px-6 text-center text-slate-100 backdrop-blur-sm">
          {status === 'loading' ? (
            <>
              <span className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-300/30 border-t-cyan-300" aria-hidden="true" />
              <p className="text-sm">正在加载{prize.name}模型…</p>
            </>
          ) : (
            <>
              <p className="text-sm">模型加载失败，请重试</p>
              <button
                type="button"
                onClick={retry}
                className="rounded-lg border border-cyan-300/50 bg-cyan-300/10 px-4 py-2 text-sm text-cyan-100 transition hover:bg-cyan-300/20 focus:outline-none focus:ring-2 focus:ring-cyan-300/70"
              >
                重新加载
              </button>
            </>
          )}
        </div>
      )}
      <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-slate-950/60 px-3 py-1 text-[11px] text-slate-300">
        拖动旋转 · 滚轮缩放
      </div>
      <div className="absolute right-3 top-3 z-10 flex gap-1.5">
        <button
          type="button"
          aria-label="放大模型"
          onClick={() => hostRef.current?.dispatchEvent(new CustomEvent('prize-viewer-zoom', { detail: 0.8 }))}
          className="rounded-md border border-white/20 bg-slate-950/60 px-2.5 py-1 text-sm text-white backdrop-blur transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-300/70"
        >
          +
        </button>
        <button
          type="button"
          aria-label="缩小模型"
          onClick={() => hostRef.current?.dispatchEvent(new CustomEvent('prize-viewer-zoom', { detail: 1.25 }))}
          className="rounded-md border border-white/20 bg-slate-950/60 px-2.5 py-1 text-sm text-white backdrop-blur transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-300/70"
        >
          −
        </button>
        <button
          type="button"
          aria-label="重置模型视角"
          onClick={() => hostRef.current?.dispatchEvent(new CustomEvent('prize-viewer-reset'))}
          className="rounded-md border border-white/20 bg-slate-950/60 px-2.5 py-1 text-xs text-white backdrop-blur transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-300/70"
        >
          重置
        </button>
      </div>
    </div>
  );
}

export default PrizeModelViewer;
