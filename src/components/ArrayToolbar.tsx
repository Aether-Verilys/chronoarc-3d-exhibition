import React, { useEffect, useRef, useState } from 'react';
import { Plus, Radius } from 'lucide-react';
import { GlbPlacement, TierInfo } from '../types/scene';

interface ArrayToolbarProps {
  modelCount: number;
  tiers: TierInfo[];
  arcRadius: number;
  onArcRadiusChange: (radius: number) => void;
  onAddGlb: (file: File, placement: GlbPlacement) => void;
}

export const ArrayToolbar: React.FC<ArrayToolbarProps> = ({
  modelCount,
  tiers,
  arcRadius,
  onArcRadiusChange,
  onAddGlb
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
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 px-3 py-2 rounded-2xl bg-white/90 backdrop-blur-md border border-slate-200/90 shadow-lg max-w-[96vw]">
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
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-colors cursor-pointer whitespace-nowrap"
      >
        <Plus className="w-3.5 h-3.5" />
        添加 GLB
      </button>

      <select
        value={placementKey}
        onChange={e => setPlacementKey(e.target.value)}
        className="h-8 max-w-[9.5rem] px-2 text-[11px] font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer outline-none"
      >
        <option value="new-row">新建一行</option>
        {tiers.map(t => (
          <option key={t.rowId} value={`existing:${t.rowId}`}>
            {t.nameCn}（{t.count}）
          </option>
        ))}
      </select>

      <div className="w-px h-6 bg-slate-200" />

      <div className="flex items-center gap-2 min-w-[240px]">
        <Radius className="w-3.5 h-3.5 text-cyan-700 shrink-0" />
        <span className="text-[11px] font-medium text-slate-600 whitespace-nowrap">俯视弧度</span>
        <span className="text-[10px] text-slate-400 whitespace-nowrap">环</span>
        <input
          type="range"
          min="4.4"
          max="36"
          step="0.1"
          value={arcRadius}
          onChange={e => onArcRadiusChange(parseFloat(e.target.value))}
          className="w-28 accent-cyan-600 bg-slate-200 h-1.5 rounded-lg appearance-none cursor-pointer"
        />
        <span className="text-[10px] text-slate-400 whitespace-nowrap">平</span>
        <span className="font-mono text-[11px] text-cyan-700 font-semibold tabular-nums w-10">
          {arcRadius.toFixed(1)}
        </span>
      </div>

      <span className="hidden sm:inline text-[11px] font-mono text-slate-400">
        {modelCount} 模型
      </span>
    </div>
  );
};
