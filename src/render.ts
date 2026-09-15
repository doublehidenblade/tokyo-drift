// Canvas renderer. The projection bodies were elided in the extracted source,
// so this is a reimplementation in the classic Jake-Gordon pseudo-3D style,
// driven by the extracted constants (CAM_DEPTH, ROAD_FACTOR, CURVE_FACTOR,
// CAM_H, Y_FACTOR, SEG_LEN, DRAW). Per-segment elevation (seg.y) produces
// visible hills; the horizon pitches with the lookahead slope so crests and
// dips read as camera pitch.

import { CONFIG } from './config';
import {
  CAM_DEPTH, ROAD_FACTOR, CURVE_FACTOR, CAM_H, Y_FACTOR, SEG_LEN, DRAW,
  ROAD_HALF, PIXEL_FONT, Seg, clamp, hash, lerp,
} from './track';
import { getSceneConfig, SceneConfig } from './scenes';
import { Game, groundYAt, segAtDist } from './game';

interface Proj {
  x: number; y: number; w: number; p: number; xa: number; seg: Seg;
}

interface RC {
  ctx: CanvasRenderingContext2D;
  W: number; H: number;
  cfg: SceneConfig;
  projs: Proj[];
  horizonY: number;
  playerY: number;
  shx: number; shy: number;
  t: number;
  g: Game;
}

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp(((n >> 16) & 255) + amt, 0, 255);
  const gg = clamp(((n >> 8) & 255) + amt, 0, 255);
  const b = clamp((n & 255) + amt, 0, 255);
  return `rgb(${r},${gg},${b})`;
}

function poly(ctx: CanvasRenderingContext2D, pts: [number, number][], fill: string): void {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.fill();
}

// ---------------------------------------------------------------- sky

function drawSky(r: RC): void {
  const { ctx, W, H, cfg } = r;
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, cfg.skyTop);
  grad.addColorStop(0.6, cfg.skyBot);
  grad.addColorStop(1, cfg.skyBot);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  if (!cfg.isDay) {
    // stars
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 70; i++) {
      const sx = hash(i * 3.7) * W;
      const sy = hash(i * 9.2) * r.horizonY * 0.92;
      const tw = 0.4 + 0.6 * Math.abs(Math.sin(r.t * 2 + i));
      ctx.globalAlpha = 0.25 + 0.55 * tw * hash(i * 1.3);
      ctx.fillRect(sx, sy, 2, 2);
    }
    ctx.globalAlpha = 1;
  }

  if (cfg.sun) {
    const sx = W * 0.78 - (r.g.skyOffset % (W * 2)) * 0.15;
    const sy = r.horizonY * 0.42;
    const glow = ctx.createRadialGradient(sx, sy, 4, sx, sy, 60);
    glow.addColorStop(0, 'rgba(255,240,180,0.9)');
    glow.addColorStop(1, 'rgba(255,240,180,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(sx - 60, sy - 60, 120, 120);
    ctx.fillStyle = '#fff3b0';
    ctx.beginPath();
    ctx.arc(sx, sy, 22, 0, Math.PI * 2);
    ctx.fill();
  }

  if (cfg.clouds) {
    ctx.fillStyle = cfg.isDay ? 'rgba(255,255,255,0.75)' : 'rgba(120,120,160,0.4)';
    for (let i = 0; i < 5; i++) {
      const span = W + 240;
      let cx = hash(i * 7.1) * span * 2 - r.g.skyOffset * (1 + i * 0.2);
      cx = ((cx % span) + span) % span - 120;
      const cy = r.horizonY * (0.18 + hash(i * 3.3) * 0.3);
      const cw = 60 + hash(i * 5.9) * 70;
      ctx.beginPath();
      ctx.ellipse(cx, cy, cw, cw * 0.32, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (cfg.buildingLights) {
    // distant night skyline silhouette with lit windows
    for (let i = 0; i < 26; i++) {
      const bw = W / 26;
      const bx = i * bw;
      const bh = 18 + hash(i * 7.7) * (r.horizonY * 0.22);
      ctx.fillStyle = '#0b0b1a';
      ctx.fillRect(bx, r.horizonY - bh, bw - 1.5, bh);
      ctx.fillStyle = '#ffd46a';
      for (let wy = 0; wy < 4; wy++) {
        for (let wx = 0; wx < 2; wx++) {
          if (hash(i * 31 + wy * 7 + wx * 13) > 0.55) {
            ctx.globalAlpha = 0.5 + 0.5 * hash(i + wy * 3 + wx);
            ctx.fillRect(bx + 3 + wx * (bw / 2.6), r.horizonY - bh + 5 + wy * 9, 3, 4);
          }
        }
      }
      ctx.globalAlpha = 1;
    }
  }
}

// ---------------------------------------------------------------- road

function drawRoadSeg(r: RC, near: Proj, far: Proj, seg: Seg): void {
  const { ctx, W, cfg } = r;
  const y1 = near.y;
  const y2 = far.y;

  // ground band (full width)
  ctx.fillStyle = (seg.index >> 2) % 2 ? cfg.ground1 : cfg.ground2;
  const gyTop = Math.min(y1, y2);
  ctx.fillRect(0, gyTop, W, Math.abs(y1 - y2) + 1);

  // road surface
  const alt = (seg.index >> 3) % 2 === 0;
  poly(ctx, [
    [near.x - near.w, y1], [near.x + near.w, y1],
    [far.x + far.w, y2], [far.x - far.w, y2],
  ], alt ? shade(CONFIG.roadColor, 10) : CONFIG.roadColor);

  // red/white curbs
  const curb = (seg.index >> 1) % 2 ? '#f2f2f2' : CONFIG.curbRed;
  const cw1 = Math.max(1, near.w * 0.09);
  const cw2 = Math.max(0.5, far.w * 0.09);
  poly(ctx, [
    [near.x - near.w - cw1, y1], [near.x - near.w, y1],
    [far.x - far.w, y2], [far.x - far.w - cw2, y2],
  ], curb);
  poly(ctx, [
    [near.x + near.w, y1], [near.x + near.w + cw1, y1],
    [far.x + far.w + cw2, y2], [far.x + far.w, y2],
  ], curb);

  // lane dashes
  if ((seg.index >> 2) % 2 === 0) {
    const lw1 = Math.max(0.75, near.w * 0.022);
    const lw2 = Math.max(0.4, far.w * 0.022);
    poly(ctx, [
      [near.x - lw1, y1], [near.x + lw1, y1],
      [far.x + lw2, y2], [far.x - lw2, y2],
    ], cfg.isDay ? 'rgba(230,230,230,0.85)' : 'rgba(160,220,255,0.7)');
  }

  // checkered start/finish line
  if (seg.index < 2) {
    const cols = 10;
    for (let cxi = 0; cxi < cols; cxi++) {
      const t0 = cxi / cols;
      const t1 = (cxi + 1) / cols;
      const nx0 = near.x - near.w + 2 * near.w * t0;
      const nx1 = near.x - near.w + 2 * near.w * t1;
      const fx0 = far.x - far.w + 2 * far.w * t0;
      const fx1 = far.x - far.w + 2 * far.w * t1;
      const col = (cxi + seg.index) % 2 ? '#111111' : '#f5f5f5';
      poly(ctx, [[nx0, y1], [nx1, y1], [fx1, y2], [fx0, y2]], col);
    }
  }
}

function drawLamp(r: RC, x: number, y: number, s: number): void {
  const { ctx, cfg } = r;
  const h = Math.max(4, s * 2.6);
  const w = Math.max(1.5, s * 0.12);
  ctx.fillStyle = cfg.isDay ? '#3a3a44' : '#1c1c26';
  ctx.fillRect(x - w / 2, y - h, w, h); // pole
  ctx.fillRect(x - w / 2, y - h, s * 0.9, w); // arm
  const lx = x + s * 0.75;
  ctx.fillStyle = cfg.lampOn ? '#ffe9a8' : '#555560';
  ctx.fillRect(lx - w, y - h - w, w * 2, w * 1.4);
  if (cfg.lampOn) {
    const glow = ctx.createRadialGradient(lx, y - h, 1, lx, y - h, s * 1.4);
    glow.addColorStop(0, 'rgba(255,220,140,0.55)');
    glow.addColorStop(1, 'rgba(255,220,140,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(lx, y - h, s * 1.4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawTree(r: RC, x: number, y: number, s: number, seed: number): void {
  const { ctx, cfg } = r;
  const h = Math.max(6, s * (1.6 + hash(seed) * 1.2));
  ctx.fillStyle = cfg.isDay ? '#4a3527' : '#241a20';
  ctx.fillRect(x - h * 0.04, y - h * 0.35, h * 0.08, h * 0.35); // trunk
  const tt = cfg.treeType;
  if (tt === 'green' || tt === 'wetgreen' || tt === 'nightgreen' || tt === 'snow') {
    const greens: Record<string, string> = {
      green: '#1f7a3a', wetgreen: '#175c33', nightgreen: '#0e3a24', snow: '#2a6a4a',
    };
    ctx.fillStyle = greens[tt];
    for (let i = 0; i < 3; i++) {
      const ty = y - h * (0.3 + i * 0.24);
      const tw = h * (0.42 - i * 0.1);
      poly(ctx, [[x - tw, ty], [x + tw, ty], [x, ty - h * 0.34]], greens[tt]);
    }
    if (tt === 'snow') {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      poly(ctx, [[x - h * 0.13, y - h * 0.92], [x + h * 0.13, y - h * 0.92], [x, y - h * 1.06]], 'rgba(255,255,255,0.85)');
    }
  } else {
    // cherry / autumn blobs
    ctx.fillStyle = tt === 'cherry' ? '#f2a7c3' : '#d97b2e';
    ctx.beginPath();
    ctx.arc(x, y - h * 0.62, h * 0.3, 0, Math.PI * 2);
    ctx.arc(x - h * 0.18, y - h * 0.5, h * 0.2, 0, Math.PI * 2);
    ctx.arc(x + h * 0.18, y - h * 0.5, h * 0.2, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBillboard(r: RC, x: number, y: number, s: number, text: string, color: string, size: number): void {
  const { ctx, cfg } = r;
  const pw = Math.max(14, s * 2.4);
  const ph = pw * 0.52;
  const poleH = pw * 0.9;
  ctx.fillStyle = cfg.isDay ? '#33333d' : '#15151f';
  ctx.fillRect(x - pw * 0.03, y - poleH, pw * 0.06, poleH);
  const py = y - poleH - ph;
  ctx.fillStyle = cfg.isDay ? '#101018' : '#05050c';
  ctx.fillRect(x - pw / 2, py, pw, ph);
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, s * 0.06);
  ctx.strokeRect(x - pw / 2, py, pw, ph);
  if (!cfg.isDay) {
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
  }
  ctx.fillStyle = color;
  ctx.font = `${Math.max(6, size * s * 0.5)}px ${PIXEL_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, py + ph / 2);
  ctx.shadowBlur = 0;
}

function drawGantry(r: RC, far: Proj, label: string): void {
  const { ctx } = r;
  const w = far.w;
  const y = far.y;
  const postH = Math.max(10, w * 1.1);
  ctx.fillStyle = '#23232e';
  ctx.fillRect(far.x - w * 1.35, y - postH, Math.max(2, w * 0.08), postH);
  ctx.fillRect(far.x + w * 1.35, y - postH, Math.max(2, w * 0.08), postH);
  // truss beam
  ctx.fillStyle = '#2e2e3a';
  ctx.fillRect(far.x - w * 1.4, y - postH - w * 0.22, w * 2.8, w * 0.22);
  ctx.strokeStyle = 'rgba(140,140,170,0.5)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 8; i++) {
    const bx = far.x - w * 1.4 + (w * 2.8 * i) / 8;
    ctx.beginPath();
    ctx.moveTo(bx, y - postH - w * 0.22);
    ctx.lineTo(bx + w * 0.18, y - postH);
    ctx.stroke();
  }
  ctx.fillStyle = '#FFDD46';
  ctx.font = `${Math.max(7, w * 0.24)}px ${PIXEL_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, far.x, y - postH - w * 0.11);
}

function drawRoadside(r: RC, far: Proj, seg: Seg): void {
  const idx = seg.index;
  // lamps every 18 segments, alternating sides
  if (idx % 18 === 0) {
    const side = (idx / 18) % 2 === 0 ? -1 : 1;
    drawLamp(r, far.x + side * far.w * 1.7, far.y, far.w * 0.55);
  }
  // billboards every 96 segments
  if (idx % 96 === 48) {
    const first = (idx / 96) % 2 === 0;
    const side = first ? 1 : -1;
    if (first && CONFIG.showBbOne) {
      drawBillboard(r, far.x + side * far.w * 2.1, far.y, far.w * 0.5, CONFIG.bbOneText, CONFIG.bbOneColor, CONFIG.bbOneSize);
    } else if (!first && CONFIG.showBbTwo) {
      drawBillboard(r, far.x + side * far.w * 2.1, far.y, far.w * 0.5, CONFIG.bbTwoText, CONFIG.bbTwoColor, CONFIG.bbTwoSize);
    }
  }
  // trees every 6 segments
  if (idx % 6 === 0) {
    for (const side of [-1, 1]) {
      if (hash(idx * 3.1 + side * 17.7) > 0.25) {
        const off = far.w * (2.4 + hash(idx * 1.7 + side * 5.3) * 2.6);
        drawTree(r, far.x + side * off, far.y + hash(idx + side) * 2, far.w * 0.5, idx + side * 100);
      }
    }
  }
  // start/finish gantry at the lap line
  if (idx < 2) drawGantry(r, far, 'START');
  // overhead sign gantry elsewhere
  else if (idx % 210 === 105) drawGantry(r, far, idx % 420 === 105 ? 'NEO TOKYO' : 'ラーメン');
}

// ---------------------------------------------------------------- sprites

function drawCar(
  ctx: CanvasRenderingContext2D, x: number, y: number, w: number,
  color: string, steer: number, t: number, nitro: boolean, ghost: boolean, spin: number,
): void {
  const h = w * 0.62;
  ctx.save();
  ctx.translate(x, y);
  if (spin > 0) ctx.rotate(Math.min(1, spin) * 9 * (Math.sin(t * 30) > 0 ? 1 : -1) * 0.6);
  else ctx.rotate(steer * 0.07);
  if (ghost) ctx.globalAlpha = 0.35 + 0.25 * Math.sin(t * 14);
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.ellipse(0, h * 0.42, w * 0.52, h * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();
  // wheels
  ctx.fillStyle = '#0c0c10';
  const ww = w * 0.14;
  const wh = h * 0.34;
  ctx.fillRect(-w * 0.52, -h * 0.1, ww, wh);
  ctx.fillRect(w * 0.52 - ww, -h * 0.1, ww, wh);
  // body (rear view trapezoid)
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-w * 0.5, h * 0.35);
  ctx.lineTo(-w * 0.36, -h * 0.42);
  ctx.lineTo(w * 0.36, -h * 0.42);
  ctx.lineTo(w * 0.5, h * 0.35);
  ctx.closePath();
  ctx.fill();
  // cabin / rear window
  ctx.fillStyle = 'rgba(10,12,24,0.92)';
  ctx.beginPath();
  ctx.moveTo(-w * 0.3, -h * 0.36);
  ctx.lineTo(-w * 0.24, -h * 0.08);
  ctx.lineTo(w * 0.24, -h * 0.08);
  ctx.lineTo(w * 0.3, -h * 0.36);
  ctx.closePath();
  ctx.fill();
  // spoiler
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(-w * 0.42, -h * 0.52, w * 0.84, h * 0.09);
  // tail lights
  ctx.fillStyle = '#ff2a2a';
  ctx.shadowColor = '#ff2a2a';
  ctx.shadowBlur = 10;
  ctx.fillRect(-w * 0.44, h * 0.02, w * 0.2, h * 0.1);
  ctx.fillRect(w * 0.24, h * 0.02, w * 0.2, h * 0.1);
  ctx.shadowBlur = 0;
  // bumper highlight
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(-w * 0.46, h * 0.26, w * 0.92, h * 0.07);
  // nitro flames
  if (nitro) {
    for (const fx of [-w * 0.22, w * 0.22]) {
      const fl = h * (0.5 + 0.35 * Math.abs(Math.sin(t * 40 + fx)));
      const fg = ctx.createLinearGradient(0, h * 0.35, 0, h * 0.35 + fl);
      fg.addColorStop(0, '#ffffff');
      fg.addColorStop(0.4, CONFIG.nitroGlow);
      fg.addColorStop(1, 'rgba(83,181,249,0)');
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.moveTo(fx - w * 0.07, h * 0.35);
      ctx.lineTo(fx + w * 0.07, h * 0.35);
      ctx.lineTo(fx, h * 0.35 + fl);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawNitroPickup(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, t: number): void {
  const bob = Math.sin(t * 4 + x * 0.05) * s * 0.25;
  const w = Math.max(4, s * 0.5);
  const h = w * 1.7;
  ctx.save();
  ctx.shadowColor = CONFIG.nitroGlow;
  ctx.shadowBlur = 14;
  ctx.fillStyle = 'rgba(83,181,249,0.25)';
  ctx.beginPath();
  ctx.arc(x, y - h / 2 + bob, w * 1.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  // bottle
  ctx.fillStyle = '#0e3a5c';
  ctx.fillRect(x - w / 2, y - h + bob, w, h);
  ctx.fillStyle = CONFIG.nitroGlow;
  ctx.fillRect(x - w / 2, y - h * 0.62 + bob, w, h * 0.62);
  ctx.fillStyle = '#cfeaff';
  ctx.fillRect(x - w * 0.18, y - h + bob, w * 0.12, h * 0.8);
  ctx.fillStyle = '#9aa4b0';
  ctx.fillRect(x - w * 0.22, y - h * 1.18 + bob, w * 0.44, h * 0.2);
  ctx.restore();
}

function drawHeartPickup(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, t: number): void {
  const bob = Math.sin(t * 4 + x * 0.05) * s * 0.25;
  const w = Math.max(6, s * 0.7);
  ctx.save();
  ctx.translate(x, y - w * 0.5 + bob);
  ctx.shadowColor = '#ff5a6a';
  ctx.shadowBlur = 12;
  ctx.fillStyle = '#ff4d5e';
  ctx.beginPath();
  ctx.moveTo(0, w * 0.35);
  ctx.bezierCurveTo(-w * 0.7, -w * 0.15, -w * 0.35, -w * 0.65, 0, -w * 0.25);
  ctx.bezierCurveTo(w * 0.35, -w * 0.65, w * 0.7, -w * 0.15, 0, w * 0.35);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.beginPath();
  ctx.arc(-w * 0.18, -w * 0.28, w * 0.09, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------- weather

function drawWeather(r: RC, precip: string | null): void {
  if (!precip) return;
  const { ctx, W } = r;
  for (const d of r.g.drops) {
    if (precip === 'rain') {
      ctx.strokeStyle = 'rgba(160,190,230,0.5)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x - 3, d.y + 14);
      ctx.stroke();
    } else if (precip === 'snow') {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2);
      ctx.fill();
    } else if (precip === 'leaves') {
      ctx.fillStyle = d.sway > 5 ? 'rgba(217,123,46,0.9)' : 'rgba(140,160,60,0.9)';
      ctx.beginPath();
      ctx.ellipse(d.x, d.y, d.size * 1.4, d.size, d.sway, 0, Math.PI * 2);
      ctx.fill();
    } else if (precip === 'petals') {
      ctx.fillStyle = 'rgba(242,167,195,0.9)';
      ctx.beginPath();
      ctx.ellipse(d.x, d.y, d.size * 1.2, d.size * 0.8, d.sway * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  void W;
}

// ---------------------------------------------------------------- main

interface Sprite {
  relD: number;
  dist: number;
  lx: number;
  kind: 'rival' | 'civilian' | 'nitro' | 'heart';
  color: string;
  spin: number;
}

function projectPoint(r: RC, dist: number, lx: number): { x: number; y: number; s: number } {
  const g = r.g;
  const n = (dist - g.playerDist) / SEG_LEN; // 1..DRAW
  const idx = clamp(n - 1, 0, DRAW - 2);
  const i = Math.floor(idx);
  const f = idx - i;
  const a = r.projs[i];
  const b = r.projs[i + 1];
  const p = lerp(a.p, b.p, f);
  const xa = lerp(a.xa, b.xa, f);
  const sx = r.W / 2 + p * (g.playerX * ROAD_HALF - xa + lx) * ROAD_FACTOR * (r.W / 2) + r.shx;
  const gy = groundYAt(g, dist);
  const sy = r.horizonY + p * ((r.playerY + CAM_H) - gy) * Y_FACTOR * (r.H / 2) + r.shy;
  return { x: sx, y: sy, s: p };
}

export function render(ctx: CanvasRenderingContext2D, g: Game, W: number, H: number): void {
  const cfg = getSceneConfig(g.settings.scene, CONFIG.skyTop, CONFIG.skyBottom);
  const shx = g.shake > 0 ? (Math.random() - 0.5) * g.shake : 0;
  const shy = g.shake > 0 ? (Math.random() - 0.5) * g.shake : 0;

  const baseFloat = g.playerDist / SEG_LEN;
  const baseIdx = Math.floor(baseFloat);
  const basePct = baseFloat - baseIdx;
  const playerY = groundYAt(g, g.playerDist);
  // camera pitch: horizon follows the lookahead slope so crests/dips pitch the view
  const yAhead = groundYAt(g, g.playerDist + SEG_LEN * 40);
  const pitch = clamp((yAhead - playerY) * 6, -110, 110);
  const horizonY = H * 0.44 + pitch;

  const r: RC = {
    ctx, W, H, cfg, projs: [], horizonY, playerY, shx, shy, t: g.time, g,
  };

  drawSky(r);

  // project DRAW segments ahead
  let xa = 0;
  let dxa = -(segAtDist(g, g.playerDist).curve * CURVE_FACTOR * basePct);
  for (let n = 1; n <= DRAW; n++) {
    const wdist = (baseIdx + n) * SEG_LEN;
    const seg = segAtDist(g, wdist);
    const relZ = wdist - g.playerDist;
    const p = CAM_DEPTH / Math.max(1, relZ);
    const sx = W / 2 + p * (g.playerX * ROAD_HALF - xa) * ROAD_FACTOR * (W / 2) + shx;
    const wy = (playerY + CAM_H) - seg.y;
    const sy = horizonY + p * wy * Y_FACTOR * (H / 2) + shy;
    const hw = p * ROAD_HALF * ROAD_FACTOR * (W / 2);
    r.projs.push({ x: sx, y: sy, w: hw, p, xa, seg });
    xa += dxa;
    dxa += seg.curve * CURVE_FACTOR;
  }

  // road, far -> near, with crest clipping
  let maxY = H + 80;
  for (let n = DRAW - 1; n >= 1; n--) {
    const far = r.projs[n];
    const near = r.projs[n - 1];
    if (far.y >= near.y) continue; // backface cull
    if (far.y > maxY) continue; // hidden behind crest
    drawRoadSeg(r, near, far, far.seg);
    drawRoadside(r, far, far.seg);
    maxY = near.y;
  }

  // entities, far -> near
  const sprites: Sprite[] = [];
  for (const p of g.pickups) {
    const relD = p.dist - g.playerDist;
    if (relD < 12 || relD > DRAW * SEG_LEN - SEG_LEN) continue;
    sprites.push({ relD, dist: p.dist, lx: p.x, kind: p.kind, color: '', spin: 0 });
  }
  for (const c of g.civilians) {
    const relD = c.dist - g.playerDist;
    if (relD < 12 || relD > DRAW * SEG_LEN - SEG_LEN) continue;
    sprites.push({ relD, dist: c.dist, lx: c.x, kind: 'civilian', color: c.color, spin: 0 });
  }
  for (const rv of g.rivals) {
    const relD = rv.dist - g.playerDist;
    if (relD < 12 || relD > DRAW * SEG_LEN - SEG_LEN) continue;
    sprites.push({ relD, dist: rv.dist, lx: rv.x, kind: 'rival', color: rv.color, spin: rv.spinT });
  }
  sprites.sort((a, b) => b.relD - a.relD);
  for (const sp of sprites) {
    const pr = projectPoint(r, sp.dist, sp.lx);
    if (pr.y < -60 || pr.y > H + 60) continue;
    if (sp.kind === 'nitro') drawNitroPickup(ctx, pr.x, pr.y, pr.s * 2600, g.time);
    else if (sp.kind === 'heart') drawHeartPickup(ctx, pr.x, pr.y, pr.s * 2600, g.time);
    else {
      const w = Math.max(4, pr.s * 15000);
      drawCar(ctx, pr.x, pr.y - w * 0.1, w, sp.color, 0, g.time, false, false, sp.spin);
    }
  }

  // player car (fixed near the bottom)
  {
    const px = W / 2 + g.steerVis * 26 + shx;
    const py = H - 132 - g.carLift + shy * 0.3;
    const wreckSpin = g.phase === 'wrecked' ? 1 : 0;
    drawCar(
      ctx, px, py, 148, g.car.color, g.steerVis, g.time,
      g.nitroActive, g.invulnT > 0 && g.phase === 'racing', wreckSpin,
    );
  }

  // particles (screen space)
  for (const p of g.particles) {
    ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;

  drawWeather(r, cfg.precip);
}
