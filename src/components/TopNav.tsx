import React from 'react';
import { CameraPreset, TierInfo } from '../types/scene';
import { CAMERA_CONFIGS } from '../three/SceneManager';
import { Volume2, VolumeX, Maximize2, Sliders, Plus, Image }  from 'lucide-react';

interface TopNavProps {
  currentPreset: CameraPreset;
  onSelectPreset: (preset: CameraPreset) => void;
  isMuted: boolean;
  onToggleMute: () => void;
  isOpticsOpen: boolean;
  onToggleOptics: () => void;
  onCycleTheme: () => void;
  isSunsetEnabled: boolean;
  onToggleSunset: () => void;
  isCyberEnabled: boolean;
  onToggleCyber: () => void;
  isSkyEnabled: boolean;
  onToggleSky: () => void;
}

export const TopNav: React.FC<TopNavProps> = ({
  currentPreset,
  onSelectPreset,
  isMuted,
  onToggleMute,
  isOpticsOpen,
  onToggleOptics,
  onCycleTheme,
  isSunsetEnabled,
  onToggleSunset,
  isCyberEnabled,
  onToggleCyber,
  isSkyEnabled,
  onToggleSky,
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
    <header className="fixed top-0 left-0 right-0 z-30 flex items-center justify-between gap-3 px-3 sm:px-6 py-3.5 border-b border-cyan-300/20 bg-[#080d1b]/85 backdrop-blur-xl shadow-[0_8px_30px_rgba(0,0,0,0.28)]">
      {/* Zone 1: Wordmark */}
      <div className="flex shrink-0 items-center gap-3">
        <span className="font-display text-xl font-bold tracking-tight text-slate-100 drop-shadow-[0_0_14px_rgba(34,211,238,0.28)]">
          Let's play models
        </span>
      </div>

      {/* Zone 2: Camera Navigation Presets */}
      <nav className="hidden md:flex shrink-0 items-center gap-5 text-xs font-medium tracking-wide">
        {presets.map(id => {
          const cfg = CAMERA_CONFIGS[id];
          const isActive = currentPreset === id;
          return (
            <button
              key={id}
              onClick={() => onSelectPreset(id)}
              className={`relative py-1 transition-colors whitespace-nowrap cursor-pointer ${
                isActive ? 'text-cyan-300 font-semibold' : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              <span>{cfg.labelCn}</span>
              {isActive && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-300 rounded-full shadow-[0_0_10px_rgba(103,232,249,0.9)]" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Zone 3: Actions */}

      <div className="flex min-w-0 items-center gap-2 overflow-x-auto overscroll-x-contain py-1 -my-1 whitespace-nowrap [&>*]:shrink-0">
        <button onClick={onToggleSunset} aria-pressed={isSunsetEnabled} className={`px-3 py-2 rounded-lg border text-xs font-medium whitespace-nowrap transition-colors ${isSunsetEnabled ? 'bg-indigo-400/25 border-indigo-300/70 text-indigo-100 shadow-[0_0_14px_rgba(129,140,248,0.25)]' : 'bg-slate-800/70 border-slate-600/70 text-slate-300 hover:bg-slate-700/80'}`}>阳台</button>
        <button onClick={onToggleCyber} aria-pressed={isCyberEnabled} className={`px-3 py-2 rounded-lg border text-xs font-medium whitespace-nowrap transition-colors ${isCyberEnabled ? 'bg-pink-400/25 border-pink-300/70 text-pink-100 shadow-[0_0_16px_rgba(244,114,182,0.3)]' : 'bg-slate-800/70 border-slate-600/70 text-slate-300 hover:bg-slate-700/80'}`}>抓娃娃</button>
        <button onClick={onToggleSky} aria-pressed={isSkyEnabled} title={isSkyEnabled ? '返回背景场景' : '切换书房'} className={`px-3 py-2 rounded-lg border text-xs font-medium whitespace-nowrap transition-colors ${isSkyEnabled ? 'bg-sky-400/25 border-sky-300/70 text-sky-100 shadow-[0_0_14px_rgba(56,189,248,0.25)]' : 'bg-slate-800/70 border-slate-600/70 text-slate-300 hover:bg-sky-400/20 hover:border-sky-300/50'}`}>
          书房
        </button>
        <button onClick={onCycleTheme} title="切换场景" className="p-2 rounded-lg bg-slate-800/70 hover:bg-slate-700/90 border border-slate-600/70 text-slate-300 hover:text-cyan-200">
          <Image className="w-4 h-4" />
        </button>
        <button
          onClick={onToggleOptics}
          title="透镜拉伸形变滤镜控制"
          className={`p-2 rounded-lg border transition-colors cursor-pointer ${
            isOpticsOpen
              ? 'bg-cyan-400/20 border-cyan-300/70 text-cyan-200 shadow-[0_0_14px_rgba(34,211,238,0.24)]'
              : 'bg-slate-800/70 hover:bg-slate-700/90 border-slate-600/70 text-slate-300'
          }`}
        >
          <Sliders className="w-4 h-4" />
        </button>

        <button
          onClick={onToggleMute}
          title={isMuted ? '开启音效' : '静音'}
          className="p-2 rounded-lg bg-slate-800/70 hover:bg-slate-700/90 border border-slate-600/70 text-slate-300 hover:text-cyan-200 transition-colors cursor-pointer"
        >
          {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>

        <button
          onClick={toggleFullscreen}
          title="全屏模式"
          className="p-2 rounded-lg bg-slate-800/70 hover:bg-slate-700/90 border border-slate-600/70 text-slate-300 hover:text-cyan-200 transition-colors cursor-pointer hidden sm:block"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
