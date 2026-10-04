export interface ModelDefinition {
  id: string;
  index: number;
  tier: number;       // Vertical tier: 0 (顶层), 1 (次高), 2 (中心), 3 (次低), 4 (底层)
  col: number;        // Column within the tier
  nameCn: string;
  nameEn: string;
  category: string;
  color: string;
  emissiveColor: string;
}

export interface OpticsSettings {
  stretchX: number;       // Horizontal anamorphic stretch factor (0.8 - 2.5)
  stretchY: number;       // Vertical stretch factor (0.8 - 1.6)
  distortion: number;     // Lens barrel/pincushion distortion (0.0 - 0.8)
  chromatic: number;      // Chromatic aberration intensity (0.0 - 1.5)
  fov: number;            // Camera Field of View in degrees (45 - 105)
  vignette: number;       // Periphery vignette falloff (0.0 - 1.0)
  enableShader: boolean;  // Toggle shader post-processing
}

export type CameraPreset = 'front' | 'low-angle' | 'close-up';

export type GlbPlacement = { mode: 'new-row' } | { mode: 'existing'; rowId: string };

export interface TierInfo {
  rowId: string;
  nameCn: string;
  count: number;
}

export interface CameraViewConfig {
  id: CameraPreset;
  label: string;
  labelCn: string;
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
}

export interface BackdropTheme {
  id: string;
  label: string;
  path: string;
}

export const BACKDROP_THEMES: BackdropTheme[] = [
  { id: 'daylight', label: '场景 1', path: '/backdrops/daylight.jpeg' },
  { id: 'neon-dark', label: '场景 2', path: '/backdrops/neon-dark.jpeg' },
  { id: 'warm-sunset', label: '场景 3', path: '/backdrops/warm-sunset.jpeg' },
];
