import React from 'react';
import { OpticsSettings } from '../types/scene';
import { Camera, Sliders, X, RotateCcw } from 'lucide-react';

interface OpticsControlsProps {
  optics: OpticsSettings;
  onChange: (optics: Partial<OpticsSettings>) => void;
  onClose: () => void;
  children?: React.ReactNode;
}

export const OpticsControls: React.FC<OpticsControlsProps> = ({
  optics,
  onChange,
  onClose,
  children
}) => {
  const applyPreset = (preset: 'anamorphic' | 'fisheye' | 'tunnel' | 'pristine') => {
    switch (preset) {
      case 'anamorphic':
        onChange({
          enableShader: true,
          stretchX: 1.5,
          stretchY: 1.0,
          distortion: 0.35,
          chromatic: 0.55,
          fov: 68,
          vignette: 0.3
        });
        break;
      case 'fisheye':
        onChange({
          enableShader: true,
          stretchX: 1.25,
          stretchY: 1.05,
          distortion: 0.65,
          chromatic: 0.75,
          fov: 82,
          vignette: 0.4
        });
        break;
      case 'tunnel':
        onChange({
          enableShader: true,
          stretchX: 1.8,
          stretchY: 0.95,
          distortion: 0.25,
          chromatic: 0.45,
          fov: 90,
          vignette: 0.5
        });
        break;
      case 'pristine':
        onChange({
          enableShader: true,
          stretchX: 1.0,
          stretchY: 1.0,
          distortion: 0.0,
          chromatic: 0.0,
          fov: 60,
          vignette: 0.1
        });
        break;
    }
  };

  return (
    <div className="fixed top-18 right-6 z-30 w-[min(92vw,680px)] max-h-[calc(100vh-6rem)] overflow-y-auto p-5 rounded-2xl bg-white/90 backdrop-blur-md border border-slate-200/90 shadow-2xl text-left pointer-events-auto">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-cyan-600" />
          <h3 className="font-display text-sm font-bold text-slate-900 tracking-wide">
            相机、场景与矩阵设置
          </h3>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="mb-3 text-xs font-bold tracking-wide text-slate-500 uppercase">相机形变</div>

      {/* Filter Master Toggle */}
      <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200/60 mb-4">
        <div className="flex items-center gap-2">
          <Camera className="w-4 h-4 text-cyan-700" />
          <span className="text-xs font-medium text-slate-800">启用透镜拉伸滤镜</span>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={optics.enableShader}
            onChange={e => onChange({ enableShader: e.target.checked })}
            className="sr-only peer"
          />
          <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-cyan-600"></div>
        </label>
      </div>

      {/* Preset Profiles */}
      <div className="mb-4">
        <label className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block mb-2">
          滤镜风格预设
        </label>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            onClick={() => applyPreset('anamorphic')}
            className="px-2.5 py-1.5 text-xs text-slate-700 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200/80 rounded-lg text-left transition-colors cursor-pointer font-medium"
          >
            宽银幕横向拉伸
          </button>
          <button
            onClick={() => applyPreset('fisheye')}
            className="px-2.5 py-1.5 text-xs text-slate-700 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200/80 rounded-lg text-left transition-colors cursor-pointer font-medium"
          >
            鱼眼大广角形变
          </button>
          <button
            onClick={() => applyPreset('tunnel')}
            className="px-2.5 py-1.5 text-xs text-slate-700 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200/80 rounded-lg text-left transition-colors cursor-pointer font-medium"
          >
            多排纵深长廊
          </button>
          <button
            onClick={() => applyPreset('pristine')}
            className="px-2.5 py-1.5 text-xs text-slate-700 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200/80 rounded-lg text-left transition-colors cursor-pointer font-medium"
          >
            标准自然透视
          </button>
        </div>
      </div>

      {/* Sliders */}
      <div className="space-y-3.5 border-t border-slate-100 pt-3">
        {/* Horizontal Stretch */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-slate-700 font-medium">横向拉伸形变 (Anamorphic)</span>
            <span className="font-mono text-cyan-700 font-semibold tabular-nums">{optics.stretchX.toFixed(2)}x</span>
          </div>
          <input
            type="range"
            min="0.8"
            max="2.2"
            step="0.05"
            value={optics.stretchX}
            disabled={!optics.enableShader}
            onChange={e => onChange({ stretchX: parseFloat(e.target.value) })}
            className="w-full accent-cyan-600 bg-slate-200 h-1.5 rounded-lg appearance-none cursor-pointer"
          />
        </div>

        {/* Barrel Distortion */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-slate-700 font-medium">透镜弧面弯曲 (Curvature)</span>
            <span className="font-mono text-cyan-700 font-semibold tabular-nums">{optics.distortion.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min="0.0"
            max="0.8"
            step="0.02"
            value={optics.distortion}
            disabled={!optics.enableShader}
            onChange={e => onChange({ distortion: parseFloat(e.target.value) })}
            className="w-full accent-cyan-600 bg-slate-200 h-1.5 rounded-lg appearance-none cursor-pointer"
          />
        </div>

        {/* Chromatic Dispersion */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-slate-700 font-medium">边缘色散分色 (Chromatic)</span>
            <span className="font-mono text-cyan-700 font-semibold tabular-nums">{optics.chromatic.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min="0.0"
            max="1.2"
            step="0.05"
            value={optics.chromatic}
            disabled={!optics.enableShader}
            onChange={e => onChange({ chromatic: parseFloat(e.target.value) })}
            className="w-full accent-cyan-600 bg-slate-200 h-1.5 rounded-lg appearance-none cursor-pointer"
          />
        </div>

        {/* Camera FOV */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-slate-700 font-medium">相机视场角透视 (FOV)</span>
            <span className="font-mono text-cyan-700 font-semibold tabular-nums">{Math.round(optics.fov)}°</span>
          </div>
          <input
            type="range"
            min="45"
            max="100"
            step="1"
            value={optics.fov}
            onChange={e => onChange({ fov: parseFloat(e.target.value) })}
            className="w-full accent-cyan-600 bg-slate-200 h-1.5 rounded-lg appearance-none cursor-pointer"
          />
        </div>

        {/* Vignette */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-slate-700 font-medium">空间边缘暗角 (Vignette)</span>
            <span className="font-mono text-cyan-700 font-semibold tabular-nums">{optics.vignette.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min="0.0"
            max="0.8"
            step="0.05"
            value={optics.vignette}
            disabled={!optics.enableShader}
            onChange={e => onChange({ vignette: parseFloat(e.target.value) })}
            className="w-full accent-cyan-600 bg-slate-200 h-1.5 rounded-lg appearance-none cursor-pointer"
          />
        </div>
      </div>

      {children}

      {/* Reset button */}
      <button
        onClick={() => applyPreset('anamorphic')}
        className="mt-4 w-full flex items-center justify-center gap-1.5 py-1.5 text-xs text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200/80 rounded-lg transition-colors cursor-pointer font-medium"
      >
        <RotateCcw className="w-3 h-3" />
        <span>恢复推荐参数</span>
      </button>
    </div>
  );
};
