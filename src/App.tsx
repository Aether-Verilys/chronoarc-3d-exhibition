import React, { useEffect, useRef, useState } from 'react';
import { SceneManager } from './three/SceneManager';
import { CameraPreset, GlbPlacement, ModelDefinition, OpticsSettings, TierInfo, BACKDROP_THEMES } from './types/scene';
import { DEFAULT_ROW_STEP, MODEL_CATALOG, TIER_CONFIGS } from './three/ModelGenerators';
import { TopNav } from './components/TopNav';
import { ArrayToolbar } from './components/ArrayToolbar';
import { OpticsControls } from './components/OpticsControls';
import { soundEffects } from './audio/soundEffects';
import { Move, Sparkles, ArrowLeft } from 'lucide-react';

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneManagerRef = useRef<SceneManager | null>(null);
  const glbInputRef = useRef<HTMLInputElement>(null);

  const [models, setModels] = useState<ModelDefinition[]>(MODEL_CATALOG);
  const [activeModel, setActiveModel] = useState<ModelDefinition>(MODEL_CATALOG[47] || MODEL_CATALOG[0]);
  const [currentPreset, setCurrentPreset] = useState<CameraPreset>('front');
  const [isSunsetEnabled, setIsSunsetEnabled] = useState(false);
  const [isCyberEnabled, setIsCyberEnabled] = useState(false);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [isSkyEnabled, setIsSkyEnabled] = useState(false);
  const [isOpticsOpen, setIsOpticsOpen] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [arcRadius, setArcRadius] = useState(10);
  const [backdropDepth, setBackdropDepth] = useState(2);
  const [backdropScale, setBackdropScale] = useState(1.3);
  const [themeId, setThemeId] = useState(BACKDROP_THEMES[0].id);
  const [placementKey, setPlacementKey] = useState("existing:row-2");
  const [rowStep, setRowStep] = useState(DEFAULT_ROW_STEP);
  const [tiers, setTiers] = useState<TierInfo[]>(
    TIER_CONFIGS.map(t => ({ rowId: `row-${t.tier}`, nameCn: t.nameCn, count: t.count }))
  );

  // iOS-style Drag & Sequential Slide State
  const [isDraggingModel, setIsDraggingModel] = useState(false);
  const [draggedModelName, setDraggedModelName] = useState<string>('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isModelFocused, setIsModelFocused] = useState(false);

  const [optics, setOptics] = useState<OpticsSettings>({
    stretchX: 1.35,
    stretchY: 1.0,
    distortion: 0.38,
    chromatic: 0.45,
    fov: 72,
    vignette: 0.25,
    enableShader: true
  });

  useEffect(() => {
    if (!containerRef.current) return;

    const manager = new SceneManager(containerRef.current);
    sceneManagerRef.current = manager;

    manager.onModelFocusChange = (focused) => setIsModelFocused(focused);

    manager.onModelSelect = (model: ModelDefinition) => {
      setActiveModel(model);
    };

    // iOS Drag Mode change
    manager.onDragModeChange = (isDragging: boolean, name?: string) => {
      setIsDraggingModel(isDragging);
      if (name) setDraggedModelName(name);
    };

    // Sequential Reorder Callback
    manager.onModelReorder = (reordered: ModelDefinition[]) => {
      setModels([...reordered]);
      setTiers(manager.getTiers());
      setToastMessage('已重排');
      setTimeout(() => {
        setToastMessage(null);
      }, 1500);
    };

    manager.setArcRadius(10);
    manager.setBackdropDepth(2);
    manager.setBackdropScale(1.3);
    manager.updateOptics(optics);

    return () => {
      manager.dispose();
      sceneManagerRef.current = null;
    };
  }, []);

  // Keyboard navigation & spacebar bounce
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        handleBounce();
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        handleNext();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        handlePrev();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeModel, models]);

  const handleBounce = () => {
    if (sceneManagerRef.current) {
      sceneManagerRef.current.triggerBounce();
    }
  };

  const handleArcRadiusChange = (radius: number) => {
    setArcRadius(radius);
    sceneManagerRef.current?.setArcRadius(radius);
  };

  const handleBackdropDepthChange = (depth: number) => {
    setBackdropDepth(depth);
    sceneManagerRef.current?.setBackdropDepth(depth);
  };

  const handleBackdropScaleChange = (scale: number) => {
    setBackdropScale(scale);
    sceneManagerRef.current?.setBackdropScale(scale);
  };

  const handleCycleTheme = () => {
    const idx = BACKDROP_THEMES.findIndex(t => t.id === themeId);
    handleThemeChange(BACKDROP_THEMES[(idx + 1) % BACKDROP_THEMES.length].id);
  };

  const handleThemeChange = (id: string) => {
    setIsSunsetEnabled(false);
    setIsSkyEnabled(false);
    sceneManagerRef.current?.setSkyEnabled(false);
    setThemeId(id);
    sceneManagerRef.current?.setBackdropTheme(id);
  };

  const handleRowStepChange = (step: number) => {
    setRowStep(step);
    if (!sceneManagerRef.current) return;
    sceneManagerRef.current.setRowStep(step);
    setModels(sceneManagerRef.current.getModels());
    setTiers(sceneManagerRef.current.getTiers());
  };

  const handleAddGlb = async (file: File, placement: GlbPlacement) => {
    if (!sceneManagerRef.current) return;
    try {
      const def = await sceneManagerRef.current.addGlbFile(file, placement);
      setModels(sceneManagerRef.current.getModels());
      setTiers(sceneManagerRef.current.getTiers());
      setActiveModel(def);
      setToastMessage(`已加入：${def.nameCn}`);
      setTimeout(() => setToastMessage(null), 1500);
    } catch {
      setToastMessage('加载失败');
      setTimeout(() => setToastMessage(null), 1500);
    }
  };

  const handleSelectModel = (index: number) => {
    if (sceneManagerRef.current) {
      sceneManagerRef.current.selectModel(index);
      sceneManagerRef.current.triggerBounce(index);
    }
    const found = models.find(m => m.index === index);
    if (found) setActiveModel(found);
  };

  const handleNext = () => {
    const currentPos = models.findIndex(m => m.id === activeModel.id);
    const nextIndex = (currentPos + 1) % models.length;
    handleSelectModel(models[nextIndex].index);
  };

  const handlePrev = () => {
    const currentPos = models.findIndex(m => m.id === activeModel.id);
    const prevIndex = (currentPos - 1 + models.length) % models.length;
    handleSelectModel(models[prevIndex].index);
  };

  const handleSelectPreset = (preset: CameraPreset) => {
    setCurrentPreset(preset);
    if (sceneManagerRef.current) {
      sceneManagerRef.current.setCameraPreset(preset);
    }
  };

  const handleOpticsChange = (newOptics: Partial<OpticsSettings>) => {
    const updated = { ...optics, ...newOptics };
    setOptics(updated);
    if (sceneManagerRef.current) {
      sceneManagerRef.current.updateOptics(newOptics);
    }
  };

  const handleToggleMute = () => {
    const nextState = !isMuted;
    setIsMuted(nextState);
    soundEffects.setMuted(nextState);
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#f3f6fa] select-none font-sans text-slate-900">
      <input ref={glbInputRef} type="file" accept=".glb,.gltf,model/gltf-binary,model/gltf+json" className="hidden" onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) handleAddGlb(file, placementKey === 'new-row' ? { mode: 'new-row' } : { mode: 'existing', rowId: placementKey.replace('existing:', '') }); }} />

      {/* 3D WebGL Canvas */}
      <div ref={containerRef} className="absolute inset-0 z-0 cursor-grab active:cursor-grabbing" />

      {isModelFocused && (
        <button onClick={() => sceneManagerRef.current?.exitModelFocus()} className="fixed top-20 left-5 z-40 flex items-center gap-2 rounded-xl bg-slate-900/90 px-4 py-2.5 text-sm font-semibold text-white shadow-xl backdrop-blur-md border border-white/20 hover:bg-slate-800 transition-colors">
          <ArrowLeft className="w-4 h-4" /> 返回全景
        </button>
      )}

      {/* Top Navigation Bar */}
      <TopNav
        currentPreset={currentPreset}
        onSelectPreset={handleSelectPreset}
        isMuted={isMuted}
        onToggleMute={handleToggleMute}
        isOpticsOpen={isOpticsOpen}
        onToggleOptics={() => setIsOpticsOpen(v => !v)}
        onAddGlb={() => glbInputRef.current?.click()}
        onCycleTheme={handleCycleTheme}
        isSunsetEnabled={isSunsetEnabled}
        onToggleSunset={async () => {
          const enabled = !isSunsetEnabled;
          setIsSunsetEnabled(enabled);
          setIsCyberEnabled(false);
          setGalleryLoading(enabled);
          try { await sceneManagerRef.current?.setSunsetEnabled(enabled); }
          catch { setToastMessage('第二展厅资源加载失败，请重试'); }
          finally { setGalleryLoading(false); }
        }}
        isCyberEnabled={isCyberEnabled}
        onToggleCyber={async () => {
          const enabled = !isCyberEnabled;
          setIsCyberEnabled(enabled);
          setIsSunsetEnabled(false);
          setGalleryLoading(enabled);
          try { await sceneManagerRef.current?.setCyberEnabled(enabled); }
          catch { setToastMessage('抓娃娃机资源加载失败，请重试'); }
          finally { setGalleryLoading(false); }
        }}
        isSkyEnabled={isSkyEnabled && !isSunsetEnabled && !isCyberEnabled}
        onToggleSky={() => {
          setIsSunsetEnabled(false);
          setIsCyberEnabled(false);
          const enabled = isSunsetEnabled || isCyberEnabled || !isSkyEnabled;
          sceneManagerRef.current?.setSkyEnabled(enabled);
          setIsSkyEnabled(enabled);
        }}
        tiers={tiers}
        placementKey={placementKey}
        onPlacementChange={setPlacementKey}
        modelCount={models.length}
      />

      {/* Optics & Camera Distortion Control Panel */}
      {isOpticsOpen && (
        <OpticsControls
          optics={optics}
          onChange={handleOpticsChange}
          onClose={() => setIsOpticsOpen(false)}
        >
          <ArrayToolbar
            modelCount={models.length}
            tiers={tiers}
            arcRadius={arcRadius}
            onArcRadiusChange={handleArcRadiusChange}
            backdropDepth={backdropDepth}
            onBackdropDepthChange={handleBackdropDepthChange}
            backdropScale={backdropScale}
            onBackdropScaleChange={handleBackdropScaleChange}
            themeId={themeId}
            onThemeChange={handleThemeChange}
            rowStep={rowStep}
            onRowStepChange={handleRowStepChange}
            onAddGlb={handleAddGlb}
            embedded
            showTheme={false}
          />
        </OpticsControls>
      )}

      {galleryLoading && <div role="status" className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 rounded-full bg-white/90 px-5 py-2 text-sm shadow-lg">正在启动抓娃娃机…</div>}
      {/* Active iOS Drag Notification Banner */}
      {isDraggingModel && (
        <div className="fixed top-18 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900/90 text-white backdrop-blur-md shadow-2xl border border-white/20 text-xs font-medium pointer-events-none">
          <Move className="w-4 h-4 text-cyan-400 animate-pulse" />
          <span>拖动中</span>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-600 text-white backdrop-blur-md shadow-xl text-xs font-semibold pointer-events-none transition-all">
          <Sparkles className="w-4 h-4 fill-white" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
