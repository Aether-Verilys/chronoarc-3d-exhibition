import React, { useEffect, useRef, useState } from 'react';
import { Image, Plus, Radius } from 'lucide-react';
import { GlbPlacement, TierInfo, BACKDROP_THEMES } from '../types/scene';

interface ArrayToolbarProps {
  modelCount: number;
  tiers: TierInfo[];
  arcRadius: number;
  onArcRadiusChange: (radius: number) => void;
  backdropDepth: number;
  onBackdropDepthChange: (depth: number) => void;
  backdropScale: number;
  onBackdropScaleChange: (scale: number) => void;
  themeId: string;
  onThemeChange: (id: string) => void;
  rowStep: number;
  onRowStepChange: (step: number) => void;
  onAddGlb: (file: File, placement: GlbPlacement) => void;
  embedded?: boolean;
  showTheme?: boolean;
}

export const ArrayToolbar: React.FC<ArrayToolbarProps> = ({
  modelCount,
  tiers,
  arcRadius,
  onArcRadiusChange,
  backdropDepth,
  onBackdropDepthChange,
  backdropScale,
  onBackdropScaleChange,
  themeId,
  onThemeChange,
  rowStep,
  onRowStepChange,
  onAddGlb,
  embedded = false,
  showTheme = true
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [placementKey, setPlacementKey] = useState<string>('existing:row-2');

  useEffect(() => {
    if (placementKey === 'new-row') return;
    const rowId = placementKey.replace('existing:', '');
    if (!tiers.some(t => t.rowId === rowId)) {
      setPlacementKey(tiers[0] ? `existing:${tiers[0].rowId}` : 'new-row');
    }
  }, [tiers, placementKey]);

  const placement: GlbPlacement = placementKey === 'new-row'
    ? { mode: 'new-row' }
    : { mode: 'existing', rowId: placementKey.replace('existing:', '') };

  return (
    <div className={embedded ? "mt-5 pt-4 border-t border-slate-700/80 grid grid-cols-1 sm:grid-cols-2 gap-4 [&>input]:hidden [&>div.w-px]:hidden" : "fixed bottom-5 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 px-3 py-2 rounded-2xl bg-[#0b1022]/95 backdrop-blur-xl border border-cyan-300/20 shadow-[0_12px_36px_rgba(0,0,0,0.4)] max-w-[96vw] overflow-x-auto [&>*]:shrink-0"}>
      <input
        ref={fileInputRef}
        type="file"
        accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) onAddGlb(file, placement);
        }}
      />

      <button
        onClick={() => fileInputRef.current?.click()}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-cyan-100 bg-cyan-500/20 border border-cyan-300/40 hover:bg-cyan-400/30 rounded-xl transition-colors cursor-pointer whitespace-nowrap"
      >
        <Plus className="w-3.5 h-3.5" />
        添加 GLB
      </button>

      <select
        value={placementKey}
        onChange={e => setPlacementKey(e.target.value)}
        className="h-8 max-w-[9.5rem] px-2 text-[11px] font-medium text-slate-200 bg-slate-900/80 border border-slate-600/70 rounded-xl cursor-pointer outline-none"
      >
        <option value="new-row">新建一行</option>
        {tiers.map(t => (
          <option key={t.rowId} value={`existing:${t.rowId}`}>
            {t.nameCn}（{t.count}）
          </option>
        ))}
      </select>

      <div className="w-px h-6 bg-slate-700" />

      {embedded && <div className="col-span-full text-xs font-bold tracking-wide text-slate-400 uppercase">矩阵排列</div>}
      <div className="flex items-center gap-2 min-w-[240px]">
        <Radius className="w-3.5 h-3.5 text-cyan-300 shrink-0" />
        <span className="text-[11px] font-medium text-slate-300 whitespace-nowrap">俯视弧度</span>
        <span className="text-[10px] text-slate-400 whitespace-nowrap">环</span>
        <input
          type="range"
          min="4.4"
          max="36"
          step="0.1"
          value={arcRadius}
          onChange={e => onArcRadiusChange(parseFloat(e.target.value))}
          className="w-28 accent-cyan-400 bg-slate-700 h-1.5 rounded-lg appearance-none cursor-pointer"
        />
        <span className="text-[10px] text-slate-400 whitespace-nowrap">平</span>
        <span className="font-mono text-[11px] text-cyan-300 font-semibold tabular-nums w-10">
          {arcRadius.toFixed(1)}
        </span>
      </div>

      <div className="w-px h-6 bg-slate-700" />

      <div className="flex items-center gap-2 min-w-[160px]">
        <span className="text-[11px] font-medium text-slate-300 whitespace-nowrap">递减梯度</span>
        <input
          type="range"
          min="1"
          max="6"
          step="1"
          value={rowStep}
          onChange={e => onRowStepChange(parseInt(e.target.value))}
          className="w-20 accent-cyan-400 bg-slate-700 h-1.5 rounded-lg appearance-none cursor-pointer"
        />
        <span className="font-mono text-[11px] text-cyan-300 font-semibold tabular-nums w-4">
          {rowStep}
        </span>
      </div>

      {!embedded || showTheme ? <>
      <div className="w-px h-6 bg-slate-700" />

      <div className="flex items-center gap-1.5">
        <Image className="w-3.5 h-3.5 text-cyan-300 shrink-0" />
        {BACKDROP_THEMES.map(t => (
          <button
            key={t.id}
            onClick={() => onThemeChange(t.id)}
            className={`px-2 py-1 text-[11px] font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
              themeId === t.id
                ? 'bg-cyan-400/20 text-cyan-100 shadow-[0_0_12px_rgba(34,211,238,0.18)]'
                : 'text-slate-300 hover:text-slate-100 hover:bg-slate-800/80'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      </> : null}

      {embedded && <div className="col-span-full text-xs font-bold tracking-wide text-slate-400 uppercase">背景设置</div>}
      <div className="flex items-center gap-2 min-w-[210px]">
        <span className="text-[11px] font-medium text-slate-300 whitespace-nowrap">背景距离</span>
        <span className="text-[10px] text-slate-400 whitespace-nowrap">近</span>
        <input
          type="range"
          min="2"
          max="28"
          step="0.1"
          value={backdropDepth}
          onChange={e => onBackdropDepthChange(parseFloat(e.target.value))}
          className="w-24 accent-cyan-400 bg-slate-700 h-1.5 rounded-lg appearance-none cursor-pointer"
        />
        <span className="text-[10px] text-slate-400 whitespace-nowrap">远</span>
      </div>

      <div className="flex items-center gap-2 min-w-[150px]">
        <span className="text-[11px] font-medium text-slate-300 whitespace-nowrap">大小</span>
        <input
          type="range"
          min="0.5"
          max="2.4"
          step="0.05"
          value={backdropScale}
          onChange={e => onBackdropScaleChange(parseFloat(e.target.value))}
          className="w-20 accent-cyan-400 bg-slate-700 h-1.5 rounded-lg appearance-none cursor-pointer"
        />
        <span className="font-mono text-[11px] text-cyan-300 font-semibold tabular-nums w-8">
          {backdropScale.toFixed(2)}
        </span>
      </div>

      <span className="hidden sm:inline text-[11px] font-mono text-slate-400">
        {modelCount} 模型
      </span>
    </div>
  );
};
