import React from 'react';
import { CameraPreset, TierInfo } from '../types/scene';
import { CAMERA_CONFIGS } from '../three/SceneManager';
import { Volume2, VolumeX, Maximize2, Sliders, Plus, Image, CloudSun }  from 'lucide-react';

interface TopNavProps {
  currentPreset: CameraPreset;
  onSelectPreset: (preset: CameraPreset) => void;
  isMuted: boolean;
  onToggleMute: () => void;
  isOpticsOpen: boolean;
  onToggleOptics: () => void;
  onAddGlb: () => void;
  onCycleTheme: () => void;
  isSkyEnabled: boolean;
  onToggleSky: () => void;
  tiers: TierInfo[];
  placementKey: string;
  onPlacementChange: (value: string) => void;
  modelCount: number;
}

export const TopNav: React.FC<TopNavProps> = ({
  currentPreset,
  onSelectPreset,
  isMuted,
  onToggleMute,
  isOpticsOpen,
  onToggleOptics,
  onAddGlb,
  onCycleTheme,
  isSkyEnabled,
  onToggleSky,
  tiers,
  placementKey,
  onPlacementChange,
  modelCount
}) => {
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const presets: CameraPreset[] = ['front', 'low-angle'];

  return (
    <header className="fixed top-0 left-0 right-0 z-30 flex items-center justify-between px-6 py-3.5 border-b border-slate-200/80 bg-white/85 backdrop-blur-md shadow-xs">
      {/* Zone 1: Wordmark */}
      <div className="flex items-center gap-3">
        <span className="font-display text-xl font-bold tracking-tight text-slate-900">
          ChronoArc
        </span>
      </div>

      {/* Zone 2: Camera Navigation Presets */}
      <nav className="hidden md:flex items-center gap-5 text-xs font-medium tracking-wide">
        {presets.map(id => {
          const cfg = CAMERA_CONFIGS[id];
          const isActive = currentPreset === id;
          return (
            <button
              key={id}
              onClick={() => onSelectPreset(id)}
              className={`relative py-1 transition-colors whitespace-nowrap cursor-pointer ${
                isActive ? 'text-cyan-700 font-semibold' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <span>{cfg.labelCn}</span>
              {isActive && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-600 rounded-full" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Zone 3: Actions */}

      <div className="flex items-center gap-2">
        <select value={placementKey} onChange={e => onPlacementChange(e.target.value)} className="h-8 max-w-[9rem] px-2 text-[11px] font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg">
          <option value="new-row">新建一行</option>
          {tiers.map(t => <option key={t.rowId} value={`existing:${t.rowId}`}>{t.nameCn}（{t.count}）</option>)}
        </select>
        <button onClick={onAddGlb} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg">
          <Plus className="w-3.5 h-3.5" /> 添加模型
        </button>
        <button onClick={onToggleSky} aria-pressed={isSkyEnabled} title={isSkyEnabled ? '返回背景场景' : '切换手办展厅'} className={`flex items-center gap-1.5 px-2 py-2 rounded-lg border text-xs font-medium ${isSkyEnabled ? 'bg-sky-100 border-sky-300 text-sky-800' : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-sky-50'}`}>
          <CloudSun className="w-4 h-4" /><span className="hidden sm:inline">手办展厅</span>
        </button>
        <button onClick={onCycleTheme} title="切换场景" className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700">
          <Image className="w-4 h-4" />
        </button>
        <button
          onClick={onToggleOptics}
          title="透镜拉伸形变滤镜控制"
          className={`p-2 rounded-lg border transition-colors cursor-pointer ${
            isOpticsOpen
              ? 'bg-cyan-100/70 border-cyan-300 text-cyan-800'
              : 'bg-slate-100 hover:bg-slate-200/80 border-slate-200 text-slate-700'
          }`}
        >
          <Sliders className="w-4 h-4" />
        </button>

        <button
          onClick={onToggleMute}
          title={isMuted ? '开启音效' : '静音'}
          className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200/80 border border-slate-200 text-slate-700 transition-colors cursor-pointer"
        >
          {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>

        <button
          onClick={toggleFullscreen}
          title="全屏模式"
          className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200/80 border border-slate-200 text-slate-700 transition-colors cursor-pointer hidden sm:block"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
