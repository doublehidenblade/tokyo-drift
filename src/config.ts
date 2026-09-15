// Standalone replacement for gizmoRuntime.tweaks().
// Every value below is taken verbatim from the extracted "Tokyo drift" gizmo
// source (chunk-01.tsx). Edit freely — this is now a plain config file.

export const CONFIG = {
  skyTop: '#050510',
  skyBottom: '#0a0a24',
  roadColor: '#1a1a22',
  curbRed: '#E93323',
  nitroGlow: '#53B5F9',
  playerCar: '#E93323',

  baseSpeed: 220,
  curveIntensity: 1,
  nitroDuration: 3,
  steeringSensitivity: 1,

  speedUnitText: 'KM/H',
  speedUnitColor: '#FFFFFF',
  speedUnitSize: 14,
  showSpeedUnit: true,

  lapText: 'LAP',
  lapColor: '#FFFFFF',
  lapSize: 16,
  showLap: true,

  posText: 'POS',
  posColor: '#FFDD46',
  posSize: 16,
  showPos: true,

  nitroText: 'NITRO',
  nitroColor: '#53B5F9',
  nitroSize: 14,
  showNitro: true,

  countdownText: 'GO!',
  countdownColor: '#75F94C',
  countdownSize: 72,
  showCountdown: true,

  finishTitleText: 'FINISH!',
  finishTitleColor: '#FFDD46',
  finishTitleSize: 42,
  showFinishTitle: true,

  finishInfoText: 'TIME',
  finishInfoColor: '#FFFFFF',
  finishInfoSize: 18,
  showFinishInfo: true,

  retryText: 'RETRY',
  retryColor: '#000000',
  retrySize: 20,
  showRetry: true,

  bbOneText: 'NEO TOKYO',
  bbOneColor: '#53B5F9',
  bbOneSize: 12,
  showBbOne: true,

  bbTwoText: 'ラーメン',
  bbTwoColor: '#E432B7',
  bbTwoSize: 14,
  showBbTwo: true,
} as const;

export interface CarDef {
  name: string;
  health: number;
  topSpeed: number; // multiplier on baseSpeed
  accel: number; // world units / s^2
  handling: number; // steering multiplier
  color: string;
  desc: string;
}

// Car roster extracted verbatim from the gizmo (chunk-02.tsx).
export const CARS: CarDef[] = [
  { name: 'FALCON', health: 5, topSpeed: 1.0, accel: 95, handling: 1.0, color: '#E93323', desc: 'Balanced all-rounder' },
  { name: 'TITAN', health: 7, topSpeed: 0.92, accel: 80, handling: 0.85, color: '#3b82f6', desc: 'Heavy tank, hard to kill' },
  { name: 'VIPER', health: 3, topSpeed: 1.15, accel: 110, handling: 1.15, color: '#E432B7', desc: 'Blistering but fragile' },
  { name: 'SCOUT', health: 4, topSpeed: 0.98, accel: 105, handling: 1.35, color: '#75F94C', desc: 'Grippy corner carver' },
];

export const RIVAL_NAMES = ['JIN', 'AKIRA', 'YUKI', 'REI', 'MIO', 'KEN', 'SORA'];
export const RIVAL_COLORS = ['#3b82f6', '#E432B7', '#FFDD46', '#75F94C', '#ff7a1a', '#b18cff', '#53B5F9'];
