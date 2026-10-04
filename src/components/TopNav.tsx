import React from 'react';
import { CameraPreset } from '../types/scene';
import { CAMERA_CONFIGS } from '../three/SceneManager';
import { Volume2, VolumeX, Maximize2, Sliders, Sparkles } from 'lucide-react';

interface TopNavProps {
  currentPreset: CameraPreset;
  onSelectPreset: (preset: CameraPreset) => void;
  isMuted: boolean;
  onToggleMute: () => void;
  isOpticsOpen: boolean;
  onToggleOptics: () => void;
  onWaveBounce: () => void;
  modelCount: number;
}

export const TopNav: React.FC<TopNavProps> = ({
  currentPreset,
  onSelectPreset,
  isMuted,
  onToggleMute,
  isOpticsOpen,
  onToggleOptics,
  onWaveBounce,
  modelCount
}) => {
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const presets: CameraPreset[] = ['front', 'low-angle', 'close-up'];

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
        <button
          onClick={onWaveBounce}
          title="全矩阵涟漪连续弹跳"
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-cyan-900 bg-cyan-50 hover:bg-cyan-100 border border-cyan-200 rounded-lg transition-colors cursor-pointer whitespace-nowrap shadow-xs"
        >
          <Sparkles className="w-3.5 h-3.5 text-cyan-700" />
          <span>全矩阵涟漪弹跳</span>
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
