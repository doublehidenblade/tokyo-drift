// Track + projection constants + helpers, extracted verbatim from chunk-01.tsx.

export const SEG_LEN = 20;
export const DRAW = 140;
export const ROAD_HALF = 1.0;
export const CAR_HALF = 0.12;
export const TOTAL_LAPS = 2;
export const START_DIST = 120;
export const PIXEL_FONT = '"Press Start 2P", "press-start-2p", monospace';
export const CAM_DEPTH = 0.84;
export const ROAD_FACTOR = 15.5;
export const CURVE_FACTOR = 0.55;
export const CAM_H = 1.0;
export const Y_FACTOR = 16;

export function formatTime(ms: number): string {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const mm = Math.floor(ms % 1000);
  const ss = s < 10 ? '0' + s : '' + s;
  const mmm = mm < 10 ? '00' + mm : mm < 100 ? '0' + mm : '' + mm;
  return m + ':' + ss + '.' + mmm;
}

export function posString(p: number): string {
  if (p === 1) return '1st';
  if (p === 2) return '2nd';
  if (p === 3) return '3rd';
  return p + 'th';
}

export function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

export interface Seg {
  curve: number;
  y: number; // elevation — the hills mechanic
  index: number;
}

// Exact track layout from the gizmo: (enter, hold, leave, curve, dy).
export function buildTrack(): Seg[] {
  const segs: Seg[] = [];
  let y = 0;
  let idx = 0;
  function addRoad(enter: number, hold: number, leave: number, curve: number, dy: number) {
    const total = enter + hold + leave;
    const dyStep = dy / total;
    for (let n = 0; n < enter; n++) {
      const e = easeInOut(n / enter);
      const c = curve * e;
      y += dyStep;
      segs.push({ curve: c, y, index: idx++ });
    }
    for (let n = 0; n < hold; n++) {
      const c = curve;
      y += dyStep;
      segs.push({ curve: c, y, index: idx++ });
    }
    for (let n = 0; n < leave; n++) {
      const e = easeInOut(n / leave);
      const c = curve * (1 - e);
      y += dyStep;
      segs.push({ curve: c, y, index: idx++ });
    }
  }
  addRoad(40, 40, 40, 0, 0);
  addRoad(50, 60, 50, 1.6, 20);
  addRoad(40, 40, 40, 0, -10);
  addRoad(50, 60, 50, -1.8, -25);
  addRoad(50, 60, 50, 1.2, 15);
  addRoad(40, 40, 40, -1.0, 0);
  return segs;
}

/** Deterministic 0..1 hash for roadside decoration placement. */
export function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
