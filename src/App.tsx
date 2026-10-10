import React, { useEffect, useRef, useState } from 'react';
import { SceneManager } from './three/SceneManager';
import { CameraPreset, GlbPlacement, ModelDefinition, OpticsSettings, TierInfo, BACKDROP_THEMES } from './types/scene';
import { DEFAULT_ROW_STEP, MODEL_CATALOG, TIER_CONFIGS } from './three/ModelGenerators';
import { TopNav } from './components/TopNav';
import { ArrayToolbar } from './components/ArrayToolbar';
import { OpticsControls } from './components/OpticsControls';
import { soundEffects } from './audio/soundEffects';
import { Move, Sparkles, ArrowLeft, Backpack, RotateCcw, X } from 'lucide-react';
import { CollectedPrize, PRIZE_CATALOG } from './types/prizes';

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
  const [collectedPrizes, setCollectedPrizes] = useState<CollectedPrize[]>([]);
  const [isBackpackOpen, setIsBackpackOpen] = useState(false);
  const [selectedPrize, setSelectedPrize] = useState<CollectedPrize | null>(null);
  const selectedPrizeDefinition = PRIZE_CATALOG.find(prize => prize.id === selectedPrize?.prizeId);
  const [loadingPrizeId, setLoadingPrizeId] = useState<string | null>(null);
  const [prizePreviewError, setPrizePreviewError] = useState<string | null>(null);
  const [backpackPulse, setBackpackPulse] = useState(false);
  const previewRequestRef = useRef(0);

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
    let backpackPulseTimer: number | undefined;

    // Inventory belongs to this scene only; discard legacy persisted winnings.
    try { localStorage.removeItem('chronoarc.prizes.v1'); } catch { /* Storage may be unavailable. */ }
    manager.onPrizesReset = () => {
      previewRequestRef.current += 1;
      window.clearTimeout(backpackPulseTimer);
      setCollectedPrizes([]);
      setIsBackpackOpen(false);
      setSelectedPrize(null);
      setLoadingPrizeId(null);
      setPrizePreviewError(null);
      setBackpackPulse(false);
    };
    manager.onPrizesReset();

    manager.onModelFocusChange = (focused) => setIsModelFocused(focused);
    manager.onPrizeCollected = (collected) => {
      setCollectedPrizes(previous => previous.some(prize => prize.id === collected.id) ? previous : [...previous, collected]);
      window.clearTimeout(backpackPulseTimer);
      setBackpackPulse(true);
      backpackPulseTimer = window.setTimeout(() => setBackpackPulse(false), 900);
    };

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
      previewRequestRef.current += 1;
      window.clearTimeout(backpackPulseTimer);
      manager.onPrizesReset = undefined;
      manager.onPrizeCollected = undefined;
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
      if (e.code === 'Escape' && isBackpackOpen) {
        if (selectedPrize || loadingPrizeId) handleClearPrizePreview();
        else handleCloseBackpack();
        return;
      }
      if (isBackpackOpen || isCyberEnabled || e.target instanceof HTMLButtonElement) return;

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
  }, [activeModel, models, isBackpackOpen, isCyberEnabled, selectedPrize, loadingPrizeId]);

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
    handleCloseBackpack();
    setIsCyberEnabled(false);
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

  const handleClearPrizePreview = () => {
    previewRequestRef.current += 1;
    setSelectedPrize(null);
    setLoadingPrizeId(null);
    setPrizePreviewError(null);
    sceneManagerRef.current?.clearPrizePreview();
  };

  const handleCloseBackpack = () => {
    handleClearPrizePreview();
    setIsBackpackOpen(false);
  };

  const handleFocusPrize = async (prize: CollectedPrize) => {
    const manager = sceneManagerRef.current;
    if (!manager) return;
    const request = ++previewRequestRef.current;
    setLoadingPrizeId(prize.id);
    setPrizePreviewError(null);
    try {
      const focused = await manager.focusPrize(prize.id);
      if (request !== previewRequestRef.current) return;
      if (focused) setSelectedPrize(prize);
      else setPrizePreviewError('这件奖品已不在当前背包中');
    } catch {
      if (request === previewRequestRef.current) setPrizePreviewError('模型加载失败，请点击奖品重试');
    } finally {
      if (request === previewRequestRef.current) setLoadingPrizeId(null);
    }
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#050816] select-none font-sans text-slate-100">
      <input ref={glbInputRef} type="file" accept=".glb,.gltf,model/gltf-binary,model/gltf+json" className="hidden" onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) handleAddGlb(file, placementKey === 'new-row' ? { mode: 'new-row' } : { mode: 'existing', rowId: placementKey.replace('existing:', '') }); }} />

      {/* 3D WebGL Canvas */}
      <div ref={containerRef} className="absolute inset-0 z-0 cursor-grab active:cursor-grabbing" />

      {isModelFocused && (
        <button onClick={() => sceneManagerRef.current?.exitModelFocus()} className="fixed top-20 left-5 z-40 flex items-center gap-2 rounded-xl bg-slate-950/80 px-4 py-2.5 text-sm font-semibold text-cyan-100 shadow-[0_0_24px_rgba(0,0,0,0.4)] backdrop-blur-xl border border-cyan-300/30 hover:bg-slate-900 transition-colors">
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
        onCycleTheme={handleCycleTheme}
        isSunsetEnabled={isSunsetEnabled}
        onToggleSunset={async () => {
          const enabled = !isSunsetEnabled;
          handleCloseBackpack();
          setIsSunsetEnabled(enabled);
          setIsCyberEnabled(false);
          setGalleryLoading(enabled);
          try { await sceneManagerRef.current?.setSunsetEnabled(enabled); }
          catch { setToastMessage('阳台资源加载失败，请重试'); }
          finally { setGalleryLoading(false); }
        }}
        isCyberEnabled={isCyberEnabled}
        onToggleCyber={async () => {
          const enabled = !isCyberEnabled;
          handleCloseBackpack();
          setIsCyberEnabled(enabled);
          setIsSunsetEnabled(false);
          setGalleryLoading(enabled);
          try { await sceneManagerRef.current?.setCyberEnabled(enabled); }
          catch { setToastMessage('抓娃娃机资源加载失败，请重试'); }
          finally { setGalleryLoading(false); }
        }}
        isSkyEnabled={isSkyEnabled && !isSunsetEnabled && !isCyberEnabled}
        onToggleSky={() => {
          handleCloseBackpack();
          setIsSunsetEnabled(false);
          setIsCyberEnabled(false);
          const enabled = isSunsetEnabled || isCyberEnabled || !isSkyEnabled;
          sceneManagerRef.current?.setSkyEnabled(enabled);
          setIsSkyEnabled(enabled);
        }}
      />

      {isCyberEnabled && !selectedPrize && (
        <p className="pointer-events-none fixed top-20 left-5 z-30 select-none rounded-lg border border-slate-600/40 bg-slate-950/70 px-3 py-2 text-xs tracking-wide text-slate-200 backdrop-blur-md">
          WASD 移动 · 空格 抓取
        </p>
      )}

      {isCyberEnabled && <button type="button" onClick={() => setIsBackpackOpen(true)} aria-label={`打开背包，已有 ${collectedPrizes.length} 件奖品`} className={`fixed top-20 right-5 z-30 flex items-center gap-2 rounded-xl border border-amber-300/50 bg-slate-950/80 px-3 py-2 text-sm font-semibold text-amber-200 shadow-[0_0_20px_rgba(245,158,11,0.15)] backdrop-blur-xl hover:bg-amber-400/15 ${backpackPulse ? 'animate-bounce ring-2 ring-amber-300' : ''}`}>
        <Backpack className="h-4 w-4" /> 背包 <span className="rounded-full bg-amber-400/20 px-1.5 text-xs text-amber-100">{collectedPrizes.length}</span>
      </button>}

      {isCyberEnabled && isBackpackOpen && (
        <div className={`fixed inset-0 z-50 flex p-3 sm:p-5 ${selectedPrize ? 'pointer-events-none items-end justify-center lg:items-center lg:justify-end' : 'items-center justify-center bg-slate-950/55 backdrop-blur-sm'}`} role="dialog" aria-modal={!selectedPrize} aria-label="奖品背包">
          <div className={`relative flex w-full flex-col overflow-hidden rounded-3xl border border-cyan-300/20 bg-[#0b1022]/95 shadow-[0_24px_80px_rgba(0,0,0,0.55)] pointer-events-auto ${selectedPrize ? 'max-h-[28vh] lg:max-h-[78vh] lg:w-64 xl:w-72' : 'max-h-[88vh] max-w-3xl'}`}>
            <div className="flex items-center justify-between border-b border-slate-700/80 px-5 py-4">
              <div><h2 className="text-lg font-bold text-slate-100">奖品背包</h2><p className="mt-0.5 text-xs text-slate-400">{selectedPrize ? `正在查看：${selectedPrizeDefinition?.name}` : '点击奖品可放大查看单个模型'}</p></div>
              <button type="button" onClick={handleCloseBackpack} aria-label="关闭背包" className="rounded-full p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-100"><X className="h-5 w-5" /></button>
            </div>
            {prizePreviewError && <p role="alert" className="px-5 pt-3 text-sm text-rose-300">{prizePreviewError}</p>}
            {loadingPrizeId && <p role="status" className="px-5 pt-3 text-xs text-cyan-300">正在加载模型…</p>}
            <div className={`min-h-0 overflow-auto ${selectedPrize ? 'p-3' : 'p-5'}`}>
              {collectedPrizes.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/50 py-16 text-center text-sm text-slate-400">还没有抓到奖品，先去抓娃娃机试试吧。</div> : <div className={selectedPrize ? 'flex gap-2 lg:grid lg:grid-cols-2' : 'grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4'}>
                {collectedPrizes.map(item => {
                  const prize = PRIZE_CATALOG.find(entry => entry.id === item.prizeId)!;
                  const selected = selectedPrize?.id === item.id;
                  return <button key={item.id} type="button" onClick={() => void handleFocusPrize(item)} aria-pressed={selected} aria-busy={loadingPrizeId === item.id} className={`group shrink-0 rounded-2xl border text-left shadow-[0_8px_20px_rgba(0,0,0,0.2)] transition hover:border-amber-300/80 hover:shadow-[0_0_18px_rgba(245,158,11,0.18)] ${selected ? 'border-amber-300/80 bg-amber-400/15 ring-1 ring-amber-300/50' : 'border-slate-700/80 bg-slate-900/70'} ${selectedPrize ? 'w-24 p-2 lg:w-auto' : 'p-4'}`}>
                    <div className={`flex items-center justify-center rounded-xl bg-gradient-to-br from-amber-400/20 to-pink-400/20 ${selectedPrize ? 'h-12 text-3xl lg:aspect-square lg:h-auto' : 'aspect-square text-5xl'}`}>{prize.icon}</div>
                    <div className="mt-2 text-sm font-semibold text-slate-100">{prize.name}</div>
                    {!selectedPrize && <div className="mt-1 text-[11px] text-slate-500">点击查看模型</div>}
                  </button>;
                })}
              </div>}
            </div>
          </div>
        </div>
      )}

      {isCyberEnabled && selectedPrize && <div className="fixed top-20 left-5 z-40 flex flex-col items-start gap-2">
        <div className="flex gap-2">
          <button type="button" onClick={handleClearPrizePreview} className="rounded-xl bg-slate-950/85 px-3 py-2.5 text-sm font-semibold text-cyan-100 shadow-xl border border-cyan-300/30">结束查看</button>
          <button type="button" onClick={() => sceneManagerRef.current?.resetPrizePreview()} className="flex items-center gap-1.5 rounded-xl bg-slate-900/85 px-3 py-2.5 text-sm text-slate-200 shadow-xl border border-slate-600/70"><RotateCcw className="h-4 w-4" /> 重置视角</button>
        </div>
        <p className="pointer-events-none rounded-full bg-slate-950/75 px-3 py-1.5 text-xs text-cyan-100 border border-cyan-300/20">拖动旋转 · 滚轮缩放</p>
      </div>}

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

      {galleryLoading && <div role="status" className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 rounded-full border border-pink-300/40 bg-slate-950/85 px-5 py-2 text-sm text-pink-100 shadow-[0_0_20px_rgba(244,114,182,0.25)] backdrop-blur-xl">正在启动抓娃娃机…</div>}
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
