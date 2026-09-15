// Game state + simulation. The update bodies here were elided in the extracted
// source (chunk-02.tsx only had comment stubs), so this is a faithful
// reimplementation in the classic pseudo-3D arcade style, using the extracted
// constants, track, car roster, and state shape.

import { CARS, CarDef, CONFIG, RIVAL_COLORS, RIVAL_NAMES } from './config';
import { SEG_LEN, DRAW, ROAD_HALF, TOTAL_LAPS, Seg, buildTrack, clamp, hash } from './track';

export type Phase = 'title' | 'countdown' | 'racing' | 'finished' | 'wrecked';

export interface Settings {
  traffic: number;
  nitroDensity: number;
  heartsOn: boolean;
  laps: number;
  opponentCount: number;
  opponentDifficulty: number;
  scene: string;
}

export const DEFAULT_SETTINGS: Settings = {
  traffic: 6,
  nitroDensity: 1,
  heartsOn: true,
  laps: TOTAL_LAPS,
  opponentCount: 4,
  opponentDifficulty: 0.92,
  scene: 'night',
};

export interface Rival {
  dist: number;
  x: number;
  color: string;
  name: string;
  spinT: number;
  wob: number;
}

export interface Civilian {
  dist: number;
  x: number;
  speed: number;
  color: string;
}

export interface Pickup {
  dist: number;
  x: number;
  kind: 'nitro' | 'heart';
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  grav: number;
}

export interface Drop {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  sway: number;
}

export interface Input {
  steer: -1 | 0 | 1;
  nitro: boolean; // edge-triggered: component clears it after one update
}

export type GameEvent =
  | 'countTick'
  | 'go'
  | 'finish'
  | 'thud'
  | 'whoosh'
  | 'nitro';

export interface Game {
  phase: Phase;
  time: number;
  raceTime: number;
  playerDist: number;
  playerX: number;
  speed: number;
  nitro: number;
  nitroActive: boolean;
  nitroT: number;
  hearts: number;
  maxHearts: number;
  invulnT: number;
  steerVis: number;
  steerHoldT: number;
  steerDir: number;
  shake: number;
  skyOffset: number;
  edgeBumpT: number;
  airT: number;
  carLift: number;
  prevSlope: number;
  cdT: number;
  cdStep: number;
  lap: number;
  finishTime: number;
  pos: number;
  seg: Seg[];
  trackLen: number;
  car: CarDef;
  carIndex: number;
  settings: Settings;
  rivals: Rival[];
  civilians: Civilian[];
  pickups: Pickup[];
  particles: Particle[];
  drops: Drop[];
  nextPickupDist: number;
  events: GameEvent[];
}

const CIVILIAN_COLORS = ['#5a5a6a', '#777788', '#444455', '#9999aa', '#6a6a7a'];

export function newGame(settings: Settings, carIndex: number): Game {
  const seg = buildTrack();
  const g: Game = {
    phase: 'title',
    time: 0,
    raceTime: 0,
    playerDist: 0,
    playerX: 0,
    speed: 0,
    nitro: 0,
    nitroActive: false,
    nitroT: 0,
    hearts: CARS[carIndex].health,
    maxHearts: CARS[carIndex].health,
    invulnT: 0,
    steerVis: 0,
    steerHoldT: 0,
    steerDir: 0,
    shake: 0,
    skyOffset: 0,
    edgeBumpT: 0,
    airT: 0,
    carLift: 0,
    prevSlope: 0,
    cdT: 0,
    cdStep: -1,
    lap: 1,
    finishTime: 0,
    pos: settings.opponentCount + 1,
    seg,
    trackLen: seg.length * SEG_LEN,
    car: CARS[carIndex],
    carIndex,
    settings: { ...settings },
    rivals: [],
    civilians: [],
    pickups: [],
    particles: [],
    drops: [],
    nextPickupDist: 300,
    events: [],
  };
  resetTitleDemo(g);
  initDrops(g);
  return g;
}

export function segAtDist(g: Game, dist: number): Seg {
  const n = g.seg.length;
  let i = Math.floor(dist / SEG_LEN) % n;
  if (i < 0) i += n;
  return g.seg[i];
}

/** Interpolated track elevation under a world distance. */
export function groundYAt(g: Game, dist: number): number {
  const n = g.seg.length;
  const f = dist / SEG_LEN;
  let i = Math.floor(f) % n;
  if (i < 0) i += n;
  const frac = f - Math.floor(f);
  const a = g.seg[i].y;
  const b = g.seg[(i + 1) % n].y;
  return a + (b - a) * frac;
}

function spawnRivals(g: Game): void {
  g.rivals = [];
  for (let i = 0; i < g.settings.opponentCount; i++) {
    g.rivals.push({
      dist: 60 + i * 45 + hash(i * 1.3) * 25,
      x: (hash(i * 7.7) - 0.5) * 1.2,
      color: RIVAL_COLORS[i % RIVAL_COLORS.length],
      name: RIVAL_NAMES[i % RIVAL_NAMES.length],
      spinT: 0,
      wob: hash(i * 3.1) * 10,
    });
  }
}

function spawnCivilians(g: Game): void {
  g.civilians = [];
  const n = g.settings.traffic;
  for (let i = 0; i < n; i++) {
    g.civilians.push({
      dist: 500 + (i * g.trackLen) / Math.max(1, n) + hash(i * 9.1) * 200,
      x: (hash(i * 4.4) - 0.5) * 1.4,
      speed: CONFIG.baseSpeed * 0.42 * (0.9 + 0.2 * hash(i * 2.2)),
      color: CIVILIAN_COLORS[i % CIVILIAN_COLORS.length],
    });
  }
}

export function resetTitleDemo(g: Game): void {
  g.phase = 'title';
  g.playerDist = 0;
  g.playerX = 0;
  g.speed = 70;
  g.nitro = 0;
  g.nitroActive = false;
  g.hearts = g.car.health;
  g.invulnT = 0;
  g.shake = 0;
  g.airT = 0;
  g.carLift = 0;
  g.particles = [];
  g.pickups = [];
  spawnRivals(g);
  spawnCivilians(g);
}

export function startRace(g: Game): void {
  g.phase = 'countdown';
  g.cdT = 0;
  g.cdStep = -1;
  g.playerDist = 0;
  g.playerX = 0;
  g.speed = 0;
  g.nitro = 0;
  g.nitroActive = false;
  g.nitroT = 0;
  g.invulnT = 0;
  g.raceTime = 0;
  g.hearts = g.car.health;
  g.maxHearts = g.car.health;
  g.shake = 0;
  g.airT = 0;
  g.carLift = 0;
  g.prevSlope = 0;
  g.lap = 1;
  g.finishTime = 0;
  g.steerVis = 0;
  g.steerHoldT = 0;
  g.particles = [];
  g.pickups = [];
  g.nextPickupDist = 300;
  spawnRivals(g);
  spawnCivilians(g);
}

export function setCar(g: Game, carIndex: number): void {
  g.carIndex = carIndex;
  g.car = CARS[carIndex];
  g.hearts = g.car.health;
  g.maxHearts = g.car.health;
}

function initDrops(g: Game): void {
  g.drops = [];
  for (let i = 0; i < 90; i++) {
    g.drops.push({
      x: hash(i * 1.71) * 480,
      y: hash(i * 3.13) * 720,
      vx: 0,
      vy: 0,
      size: 1 + hash(i * 5.7) * 2.5,
      sway: hash(i * 8.3) * 10,
    });
  }
}

export function burst(
  g: Game, x: number, y: number, n: number,
  colors: string[], speed: number, grav = 320,
): void {
  for (let i = 0; i < n; i++) {
    const a = hash(g.time * 91 + i * 17.3 + x) * Math.PI * 2;
    const s = speed * (0.4 + hash(i * 7.7 + y) * 0.9);
    g.particles.push({
      x, y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s - speed * 0.4,
      life: 0.5 + hash(i * 3.3) * 0.6,
      maxLife: 1,
      color: colors[i % colors.length],
      size: 2 + hash(i * 9.1) * 3,
      grav,
    });
  }
}

function updateParticles(g: Game, dt: number): void {
  for (const p of g.particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += p.grav * dt;
    p.life -= dt;
  }
  g.particles = g.particles.filter((p) => p.life > 0);
}

function updateDrops(g: Game, dt: number, W: number, H: number, precip: string | null): void {
  for (const d of g.drops) {
    if (precip === 'rain') {
      d.vx = -160; d.vy = 950;
    } else if (precip === 'snow') {
      d.vx = Math.sin(g.time * 2 + d.sway) * 30; d.vy = 70 + d.size * 14;
    } else if (precip === 'leaves') {
      d.vx = Math.sin(g.time * 3 + d.sway) * 90; d.vy = 130 + d.size * 20;
    } else if (precip === 'petals') {
      d.vx = Math.sin(g.time * 2.2 + d.sway) * 70; d.vy = 95 + d.size * 16;
    } else {
      d.vy = 0;
    }
    d.x += d.vx * dt;
    d.y += d.vy * dt;
    if (d.y > H + 10 || d.x < -20 || d.x > W + 20) {
      d.x = hash(d.sway * 999 + g.time) * (W + 40) - 20;
      d.y = -10;
    }
  }
}

function moveTraffic(g: Game, dt: number, racing: boolean): void {
  for (let i = 0; i < g.rivals.length; i++) {
    const r = g.rivals[i];
    let sp = CONFIG.baseSpeed * g.settings.opponentDifficulty * (0.94 + 0.12 * hash(i * 3.3));
    const diff = r.dist - g.playerDist;
    if (diff > 700) sp *= 0.96;
    if (diff < -500) sp *= 1.05;
    if (!racing) sp = 70;
    r.dist += sp * dt;
    r.x += Math.sin(g.time * 0.6 + r.wob) * dt * 0.35;
    r.x = clamp(r.x, -0.85, 0.85);
    if (r.spinT > 0) r.spinT -= dt;
  }
  for (const c of g.civilians) {
    c.dist += (racing ? c.speed : 70) * dt;
    // recycle traffic ahead of the player so the road never runs dry
    if (c.dist < g.playerDist - 300) {
      c.dist += g.trackLen;
      c.x = (hash(c.dist * 0.13) - 0.5) * 1.4;
    }
  }
}

function autoDrive(g: Game, dt: number, target: number): void {
  if (g.speed < target) g.speed = Math.min(target, g.speed + 95 * dt);
  else g.speed = Math.max(target, g.speed - 160 * dt);
  g.playerDist += g.speed * dt;
  moveTraffic(g, dt, false);
}

function wreck(g: Game): void {
  g.phase = 'wrecked';
  g.events.push('thud');
  g.shake = 26;
  burst(g, 240, 560, 42, ['#ff5a3c', '#ffb13c', '#888888', '#ffffff'], 260, 420);
}

export interface HudState {
  speed: number;
  lap: number;
  laps: number;
  pos: number;
  nitro: number;
  nitroActive: boolean;
  nitroT: number;
  hearts: number;
  maxHearts: number;
  progress: number;
  phase: Phase;
  finishTime: number;
  raceTime: number;
  cdText: string;
}

export function getHud(g: Game): HudState {
  const step = g.cdStep;
  const cdText = step < 0 ? '' : step < 3 ? String(3 - step) : CONFIG.countdownText;
  return {
    speed: Math.round(g.speed),
    lap: g.lap,
    laps: g.settings.laps,
    pos: g.pos,
    nitro: g.nitro,
    nitroActive: g.nitroActive,
    nitroT: g.nitroT,
    hearts: Math.max(0, g.hearts),
    maxHearts: g.maxHearts,
    progress: clamp(g.playerDist / (g.trackLen * g.settings.laps), 0, 1),
    phase: g.phase,
    finishTime: g.finishTime,
    raceTime: g.raceTime,
    cdText,
  };
}

export function update(g: Game, dt: number, input: Input, W: number, H: number, precip: string | null): void {
  g.time += dt;

  // --- steering visual always eases toward input
  g.steerVis += (input.steer - g.steerVis) * Math.min(1, dt * 10);
  if (input.steer !== 0) {
    g.steerDir = input.steer;
    g.steerHoldT += dt;
  } else {
    g.steerHoldT = 0;
  }

  if (g.phase === 'title') {
    autoDrive(g, dt, 70);
  } else if (g.phase === 'countdown') {
    g.cdT += dt;
    const step = Math.floor(g.cdT / 0.8);
    if (step > g.cdStep) {
      g.cdStep = step;
      g.events.push(step < 3 ? 'countTick' : 'go');
    }
    if (g.cdT >= 3.2) g.phase = 'racing';
    moveTraffic(g, dt, false);
  } else if (g.phase === 'racing') {
    g.raceTime += dt;
    const car = g.car;
    const maxSpeed = CONFIG.baseSpeed * car.topSpeed;
    const speedRatio = clamp(g.speed / maxSpeed, 0, 1.3);
    const seg = segAtDist(g, g.playerDist);

    // curve centrifugal push
    g.playerX -= seg.curve * CONFIG.curveIntensity * Math.min(1, speedRatio) * dt * 0.9;
    // steering
    g.playerX += input.steer * car.handling * CONFIG.steeringSensitivity * (0.75 + 0.85 * Math.min(1, speedRatio)) * dt * 1.7;
    g.playerX = clamp(g.playerX, -1.35, 1.35);

    const offroad = Math.abs(g.playerX) > ROAD_HALF;

    // nitro
    if (input.nitro && g.nitro > 0 && !g.nitroActive) {
      g.nitro -= 1;
      g.nitroActive = true;
      g.nitroT = CONFIG.nitroDuration;
      g.events.push('nitro');
      burst(g, 240, 620, 16, [CONFIG.nitroGlow, '#ffffff', '#2a7fd8'], 200, 60);
    }
    if (g.nitroActive) {
      g.nitroT -= dt;
      if (Math.random() < 0.6) {
        g.particles.push({
          x: 240 + (Math.random() - 0.5) * 60, y: 630,
          vx: (Math.random() - 0.5) * 60, vy: 120 + Math.random() * 120,
          life: 0.4, maxLife: 0.4,
          color: Math.random() < 0.5 ? CONFIG.nitroGlow : '#ffffff',
          size: 3 + Math.random() * 4, grav: -200,
        });
      }
      if (g.nitroT <= 0) g.nitroActive = false;
    }

    // acceleration
    let target = g.nitroActive ? maxSpeed * 1.45 : maxSpeed;
    if (offroad) target = maxSpeed * 0.45;
    if (g.speed < target) g.speed = Math.min(target, g.speed + car.accel * (g.nitroActive ? 1.35 : 1) * dt);
    else g.speed = Math.max(target, g.speed - 260 * dt);

    if (offroad && speedRatio > 0.3) {
      g.edgeBumpT += dt;
      g.shake = Math.max(g.shake, 4);
      if (Math.random() < 0.4) {
        g.particles.push({
          x: 240 + (g.playerX > 0 ? 90 : -90), y: 640,
          vx: (Math.random() - 0.5) * 120, vy: -60 - Math.random() * 80,
          life: 0.5, maxLife: 0.5, color: '#8a7a5a', size: 3 + Math.random() * 3, grav: 200,
        });
      }
    } else {
      g.edgeBumpT = 0;
    }

    // crest air: slope sign flips + -> - while fast => little jump
    const slope = (groundYAt(g, g.playerDist + SEG_LEN * 6) - groundYAt(g, g.playerDist)) / (SEG_LEN * 6);
    if (g.prevSlope > 0.015 && slope < -0.015 && speedRatio > 0.55 && g.airT <= 0) {
      g.airT = 0.45;
    }
    g.prevSlope = slope;
    if (g.airT > 0) {
      g.airT -= dt;
      const t = 1 - Math.max(0, g.airT) / 0.45;
      g.carLift = Math.sin(t * Math.PI) * 26 * Math.min(1, speedRatio);
    } else {
      g.carLift = 0;
    }

    g.playerDist += g.speed * dt;

    // laps / finish
    const lapIdx = Math.floor(g.playerDist / g.trackLen);
    g.lap = Math.min(lapIdx + 1, g.settings.laps);
    if (g.playerDist >= g.trackLen * g.settings.laps) {
      g.phase = 'finished';
      g.finishTime = g.raceTime;
      g.events.push('finish');
    }

    // traffic
    moveTraffic(g, dt, true);

    // collisions
    if (g.invulnT > 0) g.invulnT -= dt;
    const hitTest = (dist: number, x: number): boolean =>
      Math.abs(dist - g.playerDist) < 24 && Math.abs(x - g.playerX) < 0.3;
    for (const r of g.rivals) {
      if (hitTest(r.dist, r.x)) {
        if (g.invulnT <= 0) {
          g.hearts -= 1;
          g.invulnT = 2;
          g.shake = 16;
          g.speed *= 0.55;
          r.spinT = 1.4;
          g.events.push('thud');
          burst(g, 240, 560, 22, ['#ff5a3c', '#ffffff', r.color], 240);
          if (g.hearts <= 0) wreck(g);
        }
      }
    }
    if (g.phase === 'racing') {
      for (const c of g.civilians) {
        if (hitTest(c.dist, c.x) && g.invulnT <= 0) {
          g.hearts -= 1;
          g.invulnT = 2;
          g.shake = 16;
          g.speed *= 0.55;
          g.events.push('thud');
          burst(g, 240, 560, 22, ['#ff5a3c', '#ffffff', c.color], 240);
          if (g.hearts <= 0) wreck(g);
        }
      }
    }

    // pickups
    for (let i = g.pickups.length - 1; i >= 0; i--) {
      const p = g.pickups[i];
      if (Math.abs(p.dist - g.playerDist) < 20 && Math.abs(p.x - g.playerX) < 0.32) {
        if (p.kind === 'nitro') {
          g.nitro = Math.min(5, g.nitro + 1);
          burst(g, 240, 560, 12, [CONFIG.nitroGlow, '#ffffff'], 160, 40);
        } else {
          g.hearts = Math.min(g.maxHearts, g.hearts + 1);
          burst(g, 240, 560, 12, ['#ff5a6a', '#ffffff'], 160, 40);
        }
        g.events.push('whoosh');
        g.pickups.splice(i, 1);
      }
    }
    g.pickups = g.pickups.filter((p) => p.dist > g.playerDist - 120);
    const density = Math.max(0.25, g.settings.nitroDensity);
    while (g.nextPickupDist < g.playerDist + DRAW * SEG_LEN) {
      const d = g.nextPickupDist;
      const r = hash(d * 0.913);
      const kind: 'nitro' | 'heart' = g.settings.heartsOn && r > 0.82 ? 'heart' : 'nitro';
      if (!(kind === 'nitro' && g.settings.nitroDensity === 0)) {
        g.pickups.push({ dist: d, x: (hash(d * 1.71) - 0.5) * 1.6, kind });
      }
      g.nextPickupDist += (240 + hash(d * 0.707) * 320) / density;
    }

    // position
    const progs: number[] = [g.playerDist];
    for (const r of g.rivals) progs.push(r.dist);
    const mine = g.playerDist;
    g.pos = progs.filter((p) => p > mine).length + 1;
  } else if (g.phase === 'finished') {
    autoDrive(g, dt, 0);
    if (g.speed < 2) g.speed = 0;
  } else if (g.phase === 'wrecked') {
    g.speed = Math.max(0, g.speed - 200 * dt);
    g.playerDist += g.speed * dt;
    moveTraffic(g, dt, false);
  }

  // sky parallax follows curves
  const speedRatio = clamp(g.speed / (CONFIG.baseSpeed * g.car.topSpeed), 0, 1.2);
  g.skyOffset += segAtDist(g, g.playerDist).curve * speedRatio * dt * 26;

  g.shake = Math.max(0, g.shake - dt * 42);
  updateParticles(g, dt);
  updateDrops(g, dt, W, H, precip);
}
