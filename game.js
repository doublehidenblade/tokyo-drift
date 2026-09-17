/* ============================================================
   TOKYO DRIFT — faithful web recreation of the Pocket build.
   Reference: Pocket gameplay capture 2026-09-16 (night neon city).
   Pixel-art renderer: 5x7 pixel font HUD, canvas-drawn, smoothing off.
   Pseudo-3D road core with painter's-algorithm sprite jobs.
   ============================================================ */
'use strict';

/* ---------- deterministic RNG (seeded in harness mode) ---------- */
const Q = new URLSearchParams(location.search);
const HARNESS = Q.get('harness') === '1';
let godMode = Q.get('god') === '1'; // harness: obstacles render but can't hurt you
let _seed = (parseInt(Q.get('seed') || '7', 10) >>> 0) || 7;
function rnd() {
  if (!HARNESS) return Math.random();
  _seed |= 0; _seed = (_seed + 0x6D2B79F5) | 0;
  let t = Math.imul(_seed ^ (_seed >>> 15), 1 | _seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/* ---------- 5x7 pixel font ---------- */
const GLYPHS = {
  '0': ['01110','10001','10011','10101','11001','10001','01110'],
  '1': ['00100','01100','00100','00100','00100','00100','01110'],
  '2': ['01110','10001','00001','00010','00100','01000','11111'],
  '3': ['11111','00010','00100','00010','00001','10001','01110'],
  '4': ['00010','00110','01010','10010','11111','00010','00010'],
  '5': ['11111','10000','11110','00001','00001','10001','01110'],
  '6': ['00110','01000','10000','11110','10001','10001','01110'],
  '7': ['11111','00001','00010','00100','01000','01000','01000'],
  '8': ['01110','10001','10001','01110','10001','10001','01110'],
  '9': ['01110','10001','10001','01111','00001','00010','01100'],
  'A': ['01110','10001','10001','11111','10001','10001','10001'],
  'B': ['11110','10001','10001','11110','10001','10001','11110'],
  'C': ['01110','10001','10000','10000','10000','10001','01110'],
  'D': ['11110','10001','10001','10001','10001','10001','11110'],
  'E': ['11111','10000','10000','11110','10000','10000','11111'],
  'F': ['11111','10000','10000','11110','10000','10000','10000'],
  'G': ['01110','10001','10000','10111','10001','10001','01111'],
  'H': ['10001','10001','10001','11111','10001','10001','10001'],
  'I': ['01110','00100','00100','00100','00100','00100','01110'],
  'J': ['00111','00010','00010','00010','00010','10010','01100'],
  'K': ['10001','10010','10100','11000','10100','10010','10001'],
  'L': ['10000','10000','10000','10000','10000','10000','11111'],
  'M': ['10001','11011','10101','10101','10001','10001','10001'],
  'N': ['10001','11001','10101','10011','10001','10001','10001'],
  'O': ['01110','10001','10001','10001','10001','10001','01110'],
  'P': ['11110','10001','10001','11110','10000','10000','10000'],
  'Q': ['01110','10001','10001','10001','10101','10010','01101'],
  'R': ['11110','10001','10001','11110','10100','10010','10001'],
  'S': ['01111','10000','10000','01110','00001','00001','11110'],
  'T': ['11111','00100','00100','00100','00100','00100','00100'],
  'U': ['10001','10001','10001','10001','10001','10001','01110'],
  'V': ['10001','10001','10001','10001','10001','01010','00100'],
  'W': ['10001','10001','10001','10101','10101','11011','10001'],
  'X': ['10001','10001','01010','00100','01010','10001','10001'],
  'Y': ['10001','10001','01010','00100','00100','00100','00100'],
  'Z': ['11111','00001','00010','00100','01000','10000','11111'],
  '%': ['11001','11010','00010','00100','01000','01011','10011'],
  '/': ['00001','00001','00010','00100','01000','10000','10000'],
  '.': ['00000','00000','00000','00000','00000','01100','01100'],
  '!': ['00100','00100','00100','00100','00100','00000','00100'],
  ':': ['00000','01100','01100','00000','01100','01100','00000'],
  '-': ['00000','00000','00000','11111','00000','00000','00000'],
  ' ': ['00000','00000','00000','00000','00000','00000','00000'],
};
const HEART_PX = ['0110110','1111111','1111111','0111110','0011100','0001000'];
function pxText(c, str, x, y, px, color, align) {
  str = String(str).toUpperCase();
  const w = str.length * 6 * px - px;
  let cx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  c.fillStyle = color;
  for (const ch of str) {
    const g = GLYPHS[ch] || GLYPHS[' '];
    for (let r = 0; r < 7; r++) for (let q = 0; q < 5; q++)
      if (g[r][q] === '1') c.fillRect(cx + q * px, y + r * px, px, px);
    cx += 6 * px;
  }
  return w;
}
function pxTextW(str, px) { return String(str).length * 6 * px - px; }
function drawHeart(c, x, y, px, color) {
  c.fillStyle = color;
  for (let r = 0; r < 6; r++) for (let q = 0; q < 7; q++)
    if (HEART_PX[r][q] === '1') c.fillRect(x + q * px, y + r * px, px, px);
}

/* ---------- utils ---------- */
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function hash01(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }

/* ---------- canvas ---------- */
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let W = 0, H = 0, DPR = 1, HORIZON = 0;
function resize() {
  DPR = Math.min(2, window.devicePixelRatio || 1);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = Math.floor(W * DPR); canvas.height = Math.floor(H * DPR);
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.imageSmoothingEnabled = false;
  HORIZON = Math.floor(H * 0.30);
}
window.addEventListener('resize', resize);

/* ---------- audio (engine hum + beeps; silent without gesture) ---------- */
const AudioSys = {
  ctx: null, osc: null, gain: null,
  init() {
    if (this.ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.osc = this.ctx.createOscillator(); this.osc.type = 'sawtooth'; this.osc.frequency.value = 70;
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420;
      this.gain = this.ctx.createGain(); this.gain.gain.value = 0.05;
      this.osc.connect(f); f.connect(this.gain); this.gain.connect(this.ctx.destination);
      this.osc.start();
    } catch (e) {}
  },
  engine(ratio, nitro) {
    if (!this.osc) return;
    this.osc.frequency.value = 60 + ratio * 80 + (nitro ? 50 : 0);
  },
  beep(freq, dur) {
    if (!this.ctx) return;
    try {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = 'square'; o.frequency.value = freq;
      g.gain.setValueAtTime(0.12, this.ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
      o.connect(g); g.connect(this.ctx.destination);
      o.start(); o.stop(this.ctx.currentTime + dur);
    } catch (e) {}
  },
};

/* ---------- track ---------- */
const SEG_LEN = 20, DRAW = 150, CAM_DEPTH = 0.84;
const ROAD_FACTOR = 20, CURVE_FACTOR = 0.55, CAM_H = 1.0, Y_FACTOR = 16;
let LAP_LEN = 4550, NSEG = 0, TRACK = null, CROSS_D = 260;
let BRIDGE_A = 0, BRIDGE_B = 0, TOTAL = 0, LAPS = 2;
function buildTrackData(track) {
  LAP_LEN = 4550; LAPS = 2;
  NSEG = Math.ceil(LAP_LEN / SEG_LEN);
  TRACK = buildTrack();
  BRIDGE_A = Math.round(LAP_LEN * 0.42); BRIDGE_B = Math.round(LAP_LEN * 0.57);
  TOTAL = LAP_LEN * LAPS;
}
function buildTrack() {
  const segs = [];
  // layout per lap, in METERS: [enter, hold, leave, curve]. Converted to
  // 20m segments below; the plan sums to LAP_LEN exactly.
  // (2026-09-17 fix: these were treated as segment counts, so the whole lap
  // was straight. They are meters now, scaled to fill the lap.)
  const plan = [
    [40, 200, 40, 0],      // 0-280: start straight (gantry @30m, crossing @260m)
    [60, 180, 60, 0.85],   // 280-580: gentle right sweeper
    [60, 240, 60, -1.05],  // 580-940: left sweeper
    [50, 170, 50, 0.55],   // 940-1210: ease right
    [60, 220, 60, -1.25],  // 1210-1550: hard left (tunnel entrance ~1480)
    [40, 160, 40, -0.9],   // 1550-1790: left continues (tunnel exit ~1720)
    [50, 71, 50, 0],       // 1790-1961: straighten for the bridge
    [0, 632, 0, 0],        // 1961-2593: straight (bridge 1911-2593)
    [60, 180, 60, 1.0],    // 2593-2893: right out of the bridge
    [60, 200, 60, -1.15],  // 2893-3213: S-curves left
    [50, 150, 50, 0.7],    // 3213-3463: right
    [60, 160, 60, -0.8],   // 3463-3743: left
    [40, 120, 40, 0.9],    // 3743-3943: right kink
    [0, 607, 0, 0],        // 3943-4550: final straight
  ];
  function ease(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
  for (const [enM, hoM, lvM, cu] of plan) {
    const en = Math.max(0, Math.round(enM / SEG_LEN)),
          ho = Math.max(0, Math.round(hoM / SEG_LEN)),
          lv = Math.max(0, Math.round(lvM / SEG_LEN));
    for (let i = 0; i < en; i++) segs.push({ curve: cu * ease(i / en), y: 0 });
    for (let i = 0; i < ho; i++) segs.push({ curve: cu, y: 0 });
    for (let i = 0; i < lv; i++) segs.push({ curve: cu * (1 - ease(i / lv)), y: 0 });
  }
  while (segs.length < NSEG) segs.push({ curve: 0, y: 0 });
  const track = segs.slice(0, NSEG);
  // hills: smooth elevation bumps (peak heights in world units; CAM_H = 1).
  // Kept clear of the bridge (1911-2593) and the start straight.
  const hills = [
    [500, 900, 0.9],    // rise through the first S-curves
    [1300, 1750, -0.7], // dip carrying the night tunnel
    [2700, 3100, 1.0],  // climb out of the bridge
    [3400, 3900, -0.8], // valley through the late S-curves
    [4000, 4400, 0.6],  // gentle final rise
  ];
  for (let i = 0; i < track.length; i++) {
    const d = (i + 0.5) * SEG_LEN;
    let y = 0;
    for (const [hs, he, hp] of hills) {
      if (d >= hs && d <= he) y += hp * Math.sin(Math.PI * (d - hs) / (he - hs));
    }
    track[i].y = y;
  }
  return track;
}
buildTrackData('night');
function inTunnel(d) {
  // v70 capture: the "fireworks" sections are NIGHT TUNNELS with hanging string
  // lights and big firework arcs — tunnel 1 at DIST 0.8-4.2% (t=4-9s),
  // tunnel 2 at DIST 36.3-39.3% (t=57-61s). Lap 2 is unobserved (video ends 45%).
  // v89 capture: NEON NIGHT has a curved canopy tunnel around DIST 33-38% of
  // each lap. It is lap-relative (present on both laps).
  if (G.track === 'mixed') {
    const f = d / TOTAL;
    return (f >= 0.008 && f < 0.055) || (f >= 0.363 && f < 0.393);
  }
  const lr = (((d % LAP_LEN) + LAP_LEN) % LAP_LEN) / LAP_LEN;
  return lr >= 0.325 && lr < 0.378;
}
function inBridge(d) {
  if (G.track === 'mixed') {
    // v70 capture: snow bridge over blue water in daylight, DIST 22.8-27.8% (t=36-43s)
    const f = d / TOTAL;
    return f >= 0.228 && f < 0.278;
  }
  const m = d % LAP_LEN; return m >= BRIDGE_A && m <= BRIDGE_B;
}
function inWater(d) {
  // mixed: water under the snow bridge
  if (G.track !== 'mixed') return false;
  return inBridge(d);
}
function inPark(d) {
  // snow-city park strip: same lap-relative band every lap (buildings suppressed,
  // trees + paths instead) — breaks up the building runs without touching tunnels
  const lr = ((d % LAP_LEN) + LAP_LEN) % LAP_LEN / LAP_LEN;
  return lr >= 0.62 && lr < 0.70;
}

/* ---------- game state ---------- */
// track: 'night' (v89 neon night) or 'mixed' (v70 snow + firework tunnels)
function setTrack(t) {
  G.track = t;
  buildTrackData(t);
  skyKey = '';
  G.flakes = null; G.fworks = null; G.fworkT = 0; G.arcs = null;
}
function getEnv(dist) {
  if (G.track === 'night') return inTunnel(dist) ? 'tunnel' : 'night';
  // mixed (SNOW & SUN): snowy daylight everywhere except the two night tunnels.
  // Zones read from the v70 capture's DIST HUD. Video ends at DIST 45%;
  // lap-2 pattern unverified, snow assumed.
  return inTunnel(dist) ? 'tunnel' : 'snow';
}
const TOP_KMH = 238, NITRO_KMH = 315;
const TOP_MS = 66, NITRO_MS = 87.5;   // base / nitro top speed (m/s); Craig: "a bit too slow" (was 61/80.5)
const EDGE_MAX = 0.84;                // |playerX| clamp: car side touches the road edge here
const G = {
  state: 'title', playerDist: 0, playerX: 0, speedMs: 0,
  track: 'night', // 'night' or 'mixed'
  nitro: 0, nitroOn: false, nitroT: 0, nitroTaken: null,
  hearts: 5, raceTime: 0, time: 0, cdT: 0, cdStep: -1,
  invulnT: 0, hitFlash: 0, // collision: post-hit invulnerability + red flash
  scrapeT: 0, // edge-grind timer: sparks + speed loss while kissing the road edge
  inputSteer: 0, steerVis: 0, skyX: 0,
  rivals: [], shakeT: 0, sparks: [], sparkSeq: 0,
};
const PASS_FRAC = [0.28, 0.45, 0.70, 0.88]; // fraction of TOTAL where rival i is passed
const RCOL = ['#5a6cff', '#b46aff', '#ff6ad5', '#ffd23f'];
function resetRace() {
  G.playerDist = 0; G.playerX = 0; G.speedMs = 0;
  G.nitro = 0; G.nitroOn = false; G.nitroT = 0; G.nitroTaken = new Set();
  G.hearts = 5; G.raceTime = 0; G.cdT = 0; G.cdStep = -1;
  G.invulnT = 0; G.hitFlash = 0; G.scrapeT = 0;
  G.inputSteer = 0; G.steerVis = 0; G.shakeT = 0; G.sparks = []; G.sparkSeq = 0;
  G.rivals = [];
  for (let i = 0; i < 4; i++) G.rivals.push({ x: (rnd() * 1.2 - 0.6), color: RCOL[i], wob: rnd() * 6.28 });
}

/* ---------- projection ---------- */
const projX = new Float32Array(DRAW + 2), projY = new Float32Array(DRAW + 2), projW = new Float32Array(DRAW + 2);
const runMin = new Float32Array(DRAW + 2);
let baseSeg = 0, basePct = 0, playerY = 0, scaleAt1 = 1;
function projectFrame() {
  const lap = Math.floor(G.playerDist / LAP_LEN), inLap = G.playerDist - lap * LAP_LEN;
  baseSeg = Math.floor(inLap / SEG_LEN) % NSEG;
  basePct = (inLap % SEG_LEN) / SEG_LEN;
  const sA = TRACK[baseSeg], sB = TRACK[(baseSeg + 1) % NSEG];
  playerY = lerp(sA.y, sB.y, basePct);
  let x = 0, dx = -(sA.curve * basePct);
  runMin[0] = H + 50;
  for (let n = 1; n <= DRAW; n++) {
    const seg = TRACK[(baseSeg + n) % NSEG];
    let z = n * SEG_LEN - basePct * SEG_LEN;
    if (z < 8) z = 8;
    const scale = CAM_DEPTH / z;
    if (n === 1) scaleAt1 = scale;
    let sw = scale * W * ROAD_FACTOR;
    if (sw > W * 1.7) sw = W * 1.7;
    const sx = W / 2 + scale * x * W * CURVE_FACTOR - G.playerX * sw;
    const sy = HORIZON + scale * (playerY + CAM_H - seg.y) * H * Y_FACTOR;
    projX[n] = sx; projW[n] = sw; projY[n] = sy;
    runMin[n] = Math.min(runMin[n - 1], sy);
    x += dx; dx += seg.curve * 0.9;
  }
}
function projFor(rel) { return clamp(Math.round(rel / SEG_LEN + basePct), 1, DRAW); }
function centerAt(rel) {
  const nf = clamp(rel / SEG_LEN + basePct, 1, DRAW - 1), f = Math.floor(nf), fr = nf - f;
  return { x: lerp(projX[f], projX[f + 1], fr), y: lerp(projY[f], projY[f + 1], fr) };
}
function projectSprite(rel, lateral, yWorld) {
  // nearer than 12m, pin to the 12m slice: the true-rel width would blow up
  // (and the old curve extrapolation swung wildly on bends), so close objects
  // stay glued to the road at a sane size instead of becoming giant slabs
  const effRel = Math.max(rel, 12);
  const scale = CAM_DEPTH / effRel;
  let w = scale * W * ROAD_FACTOR;
  const cap = W * 12; if (w > cap) w = cap;
  const c = centerAt(effRel);
  return { x: c.x + lateral * w, y: c.y + yWorld * scale * H * Y_FACTOR, w, scale };
}
function farFade(rel) {
  if (rel < 1500) return 1;
  if (rel > 2600) return 0;
  return 1 - (rel - 1500) / 1100;
}
function bridgeFade(rel) {
  // the whole bridge structure (towers, cables, lamps, railings) materializes
  // gradually out of the haze over ~1450m of approach — never pops into view
  const t = clamp((2950 - rel) / (2950 - 1500), 0, 1);
  return t * t * (3 - 2 * t);
}

/* ---------- depth-sorted jobs ---------- */
let jobs = [];
function pushJob(rel, draw) { jobs.push({ rel, draw }); }
function runJobs() {
  jobs.sort((a, b) => b.rel - a.rel);
  for (const j of jobs) j.draw(ctx);
  jobs.length = 0;
}

/* ---------- sky: per-environment gradient, stars/clouds, far skyline ---------- */
const skyCanvas = document.createElement('canvas');
let skyKey = '';
function buildSky(env) {
  const key = W + 'x' + H + '|' + env;
  if (key === skyKey) return;
  skyKey = key;
  skyCanvas.width = Math.max(2, W * 2); skyCanvas.height = Math.max(2, HORIZON + 4);
  const b = skyCanvas.getContext('2d');
  const g = b.createLinearGradient(0, 0, 0, skyCanvas.height);
  if (env === 'night') {
    // deep dark sky; subtle stars only — the reference is near-black with a
    // faint purple horizon glow, not a bright starfield
    g.addColorStop(0, '#020207'); g.addColorStop(0.72, '#070713'); g.addColorStop(1, '#12122b');
  } else if (env === 'tunnel') {
    // inside the firework tunnel: near-black, no sky detail (walls + lights cover it)
    g.addColorStop(0, '#020204'); g.addColorStop(0.7, '#050508'); g.addColorStop(1, '#0a0a12');
  } else if (env === 'snow') {
    g.addColorStop(0, '#a8c4de'); g.addColorStop(0.7, '#c8dcec'); g.addColorStop(1, '#e4eef6');
  } else { // day
    g.addColorStop(0, '#3f8fd6'); g.addColorStop(0.7, '#7db9e8'); g.addColorStop(1, '#c4e2f5');
  }
  b.fillStyle = g; b.fillRect(0, 0, skyCanvas.width, skyCanvas.height);
  if (env === 'night') {
    // stars: sparse and dim, like the reference (a few pinpricks, no milky way)
    for (let i = 0; i < 130; i++) {
      const sx = hash01(i + 1) * skyCanvas.width, sy = hash01(i + 301) * HORIZON * 0.7;
      const s = hash01(i + 601);
      b.fillStyle = s > 0.9 ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.32)';
      b.fillRect(sx, sy, 1, 1);
    }
    // faint city glow hugging the horizon (warm violet, very subtle)
    const glow = b.createLinearGradient(0, HORIZON - 26, 0, HORIZON + 4);
    glow.addColorStop(0, 'rgba(150,90,220,0)');
    glow.addColorStop(1, 'rgba(150,90,220,0.16)');
    b.fillStyle = glow;
    b.fillRect(0, HORIZON - 26, skyCanvas.width, 30);
  }
  if (env === 'snow') {
    // distant snowy hills
    b.fillStyle = '#f0f5fa';
    b.beginPath(); b.moveTo(0, HORIZON + 4);
    for (let x = 0; x <= skyCanvas.width; x += 40)
      b.lineTo(x, HORIZON - 30 - hash01(x * 0.37 + 5) * HORIZON * 0.22);
    b.lineTo(skyCanvas.width, HORIZON + 4); b.closePath(); b.fill();
    b.fillStyle = '#dbe7f2';
    b.beginPath(); b.moveTo(0, HORIZON + 4);
    for (let x = 0; x <= skyCanvas.width; x += 60)
      b.lineTo(x, HORIZON - 12 - hash01(x * 0.53 + 9) * HORIZON * 0.12);
    b.lineTo(skyCanvas.width, HORIZON + 4); b.closePath(); b.fill();
  }
  if (env === 'night') {
    // far skyline silhouette with lit windows (parallax strip, 2W wide):
    // near-black masses, varied heights, sparse warm windows like the reference
    let sx = 0, si = 0;
    while (sx < skyCanvas.width) {
      const swd = 30 + hash01(si + 11) * 70;
      const tier = hash01(si + 55);
      const sht = tier < 0.7 ? 14 + hash01(si + 77) * HORIZON * 0.22
        : 26 + hash01(si + 77) * HORIZON * 0.5; // occasional tall tower
      b.fillStyle = '#040409';
      b.fillRect(sx, HORIZON - sht, swd, sht + 4);
      for (let wy = 7; wy < sht - 6; wy += 9)
        for (let wx = 5; wx < swd - 5; wx += 9)
          if (hash01(si * 13 + wx * 3 + wy * 7) < 0.26) {
            const warm = hash01(si * 29 + wx + wy) < 0.75;
            b.fillStyle = warm ? 'rgba(255,200,105,0.7)' : 'rgba(190,220,255,0.6)';
            b.fillRect(sx + wx, HORIZON - sht + wy, 2, 3);
          }
      // antenna blinker on tall towers
      if (tier >= 0.7 && hash01(si + 99) < 0.6) {
        b.fillStyle = 'rgba(255,80,80,0.9)';
        b.fillRect(sx + swd / 2 - 1, HORIZON - sht - 5, 2, 2);
      }
      sx += swd + 2 + hash01(si + 31) * 14; si++;
    }
  }
  if (env === 'snow') {
    // low distant treeline hint
    b.fillStyle = '#e8eef4';
    let sx = 0, si = 100;
    while (sx < skyCanvas.width) {
      const swd = 30 + hash01(si + 11) * 50;
      const sht = 14 + hash01(si + 77) * HORIZON * 0.16;
      b.fillRect(sx, HORIZON - sht, swd, sht + 4);
      sx += swd + 4; si++;
    }
  }
}
function drawSky(env) {
  buildSky(env);
  const bw = skyCanvas.width;
  const off = Math.floor(((G.skyX % 1) + 1) % 1 * bw);
  let sx = Math.floor(bw / 4) + off - Math.floor(W / 2);
  sx = ((sx % bw) + bw) % bw;
  if (sx + W <= bw) ctx.drawImage(skyCanvas, sx, 0, W, HORIZON + 4, 0, 0, W, HORIZON + 4);
  else {
    const w1 = bw - sx;
    ctx.drawImage(skyCanvas, sx, 0, w1, HORIZON + 4, 0, 0, w1, HORIZON + 4);
    ctx.drawImage(skyCanvas, 0, 0, W - w1, HORIZON + 4, w1, 0, W - w1, HORIZON + 4);
  }
  // moon over the night bridge section: small, high, soft — never a flat blob
  if (G.track === 'night' && inBridge(G.playerDist)) {
    const mx = W * 0.5 + Math.sin(G.playerDist * 0.002) * W * 0.05, my = HORIZON * 0.30, mr = Math.min(W, H) * 0.032;
    ctx.fillStyle = 'rgba(242,236,216,0.16)';
    ctx.beginPath(); ctx.arc(mx, my, mr * 2.1, 0, 6.29); ctx.fill();
    ctx.fillStyle = '#e8e2cf';
    ctx.beginPath(); ctx.arc(mx, my, mr, 0, 6.29); ctx.fill();
    ctx.fillStyle = 'rgba(190,180,160,0.55)';
    ctx.beginPath(); ctx.arc(mx - mr * 0.3, my - mr * 0.2, mr * 0.18, 0, 6.29); ctx.fill();
    ctx.beginPath(); ctx.arc(mx + mr * 0.25, my + mr * 0.3, mr * 0.12, 0, 6.29); ctx.fill();
  }
}

/* ---------- sea fade: water emerges gradually from haze, no hard edge ---------- */
function mixHex(a, b, t) {
  const pa = [1, 3, 5].map(i => parseInt(a.substr(i, 2), 16));
  const pb = [1, 3, 5].map(i => parseInt(b.substr(i, 2), 16));
  const m = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return '#' + m.map(v => v.toString(16).padStart(2, '0')).join('');
}
function seaBlend(d) {
  // 0 on land, ramps to 1 across ~380m before/after the bridge water zone,
  // so the sea fades in from distance haze instead of popping.
  // (2026-09-17 audit: the mixed branch used to hard-cut 0/1 at the bridge
  // boundary — the exact "sea pops with a hard edge" QA item.)
  if (G.track === 'mixed') {
    const f = d / TOTAL, B0 = 0.228, B1 = 0.278, R = 380 / TOTAL;
    if (f >= B0 && f <= B1) return 1;
    if (f < B0 && f > B0 - R) return 1 - (B0 - f) / R;
    if (f > B1 && f < B1 + R) return 1 - (f - B1) / R;
    return 0;
  }
  const m = ((d % LAP_LEN) + LAP_LEN) % LAP_LEN;
  const R = 380;
  if (m >= BRIDGE_A && m <= BRIDGE_B) return 1;
  if (m < BRIDGE_A && m > BRIDGE_A - R) return 1 - (BRIDGE_A - m) / R;
  if (m > BRIDGE_B && m < BRIDGE_B + R) return 1 - (m - BRIDGE_B) / R;
  return 0;
}

/* ---------- road ---------- */
const ASPH_A = '#1e1e28', ASPH_B = '#1a1a24';
function drawRoad(env) {
  const bridge = inBridge(G.playerDist);
  const water = inWater(G.playerDist);
  // ground per environment: the sea blend ramps in ~380m before the bridge so
  // water emerges from haze (mixed snow bridge keeps its bright blue water)
  const sb = seaBlend(G.playerDist);
  const landCol = env === 'snow' ? '#dfe9f3' : env === 'tunnel' ? '#060609' : '#0b0b13';
  const seaCol = G.track === 'mixed' ? '#2a6cb4' : '#0d2138';
  ctx.fillStyle = bridge ? seaCol : water ? '#2a6cb4' : mixHex(landCol, seaCol, sb);
  ctx.fillRect(0, HORIZON, W, H - HORIZON);
  // water shimmer lines on bridge / causeway, faded by the same blend
  if (bridge || water || sb > 0.02) {
    const alpha = bridge || water ? 1 : sb;
    ctx.strokeStyle = G.track === 'mixed' ? 'rgba(255,255,255,' + (0.35 * alpha).toFixed(3) + ')'
      : 'rgba(120,170,230,' + (0.16 * alpha).toFixed(3) + ')';
    ctx.lineWidth = G.track === 'mixed' ? 3 : 1.5;
    ctx.beginPath();
    for (let i = 0; i < 14; i++) {
      const wy = HORIZON + 20 + i * (H - HORIZON - 20) / 14;
      const wx = hash01(i + 77) * W * 0.7;
      ctx.moveTo(wx, wy); ctx.lineTo(wx + 30 + hash01(i + 3) * 60, wy);
    }
    ctx.stroke();
  }
  for (let n = DRAW; n >= 2; n--) {
    const x1 = projX[n], w1 = projW[n], y1 = projY[n];
    const x2 = projX[n - 1], w2 = projW[n - 1], y2 = projY[n - 1];
    if (y1 <= HORIZON - 30 && y2 <= HORIZON - 30) continue;
    const alt = (n % 2 === 0);
    // asphalt
    ctx.fillStyle = alt ? ASPH_A : ASPH_B;
    ctx.beginPath();
    ctx.moveTo(x1 - w1, y1); ctx.lineTo(x1 + w1, y1);
    ctx.lineTo(x2 + w2, y2); ctx.lineTo(x2 - w2, y2);
    ctx.closePath(); ctx.fill();
    // edge stripes: outer RED on the right, outer PALE on the left, inner WHITE
    // (continuous) — chunky like the original. The v89/v70 captures show the
    // left edge pale blue-white and the right edge red on every frame.
    const rw1 = w1 * 0.08, ww1 = w1 * 0.02, rw2 = w2 * 0.08, ww2 = w2 * 0.02;
    ctx.fillStyle = '#dfe8f2';
    ctx.beginPath();
    ctx.moveTo(x1 - w1 - rw1, y1); ctx.lineTo(x1 - w1, y1); ctx.lineTo(x2 - w2, y2); ctx.lineTo(x2 - w2 - rw2, y2);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#d81f2e';
    ctx.beginPath();
    ctx.moveTo(x1 + w1, y1); ctx.lineTo(x1 + w1 + rw1, y1); ctx.lineTo(x2 + w2 + rw2, y2); ctx.lineTo(x2 + w2, y2);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#e8e8ee';
    ctx.beginPath();
    ctx.moveTo(x1 - w1, y1); ctx.lineTo(x1 - w1 + ww1, y1); ctx.lineTo(x2 - w2 + ww2, y2); ctx.lineTo(x2 - w2, y2);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x1 + w1 - ww1, y1); ctx.lineTo(x1 + w1, y1); ctx.lineTo(x2 + w2, y2); ctx.lineTo(x2 + w2 - ww2, y2);
    ctx.closePath(); ctx.fill();
    // lane dividers: yellow dashes, 3 lanes — chunky like the original
    if (w1 > 10) {
      ctx.strokeStyle = '#ffdd46'; ctx.lineWidth = Math.max(2.5, w1 * 0.024);
      const dash = Math.max(8, w1 * 0.13);
      ctx.setLineDash([dash, dash]);
      for (let l = 1; l < 3; l++) {
        const lx1 = x1 - w1 + 2 * w1 * l / 3, lx2 = x2 - w2 + 2 * w2 * l / 3;
        ctx.beginPath(); ctx.moveTo(lx1, y1); ctx.lineTo(lx2, y2); ctx.stroke();
      }
      ctx.setLineDash([]);
    }
    // bridge deck railings: light blue strips outside the red edges. The alpha
    // ramps over ~60m past each deck boundary so the railing never pops.
    if (bridge) {
      const inLapB = (G.playerDist + n * SEG_LEN) % LAP_LEN;
      const ramp = clamp(Math.min(inLapB - BRIDGE_A, BRIDGE_B - inLapB) / 60, 0, 1);
      if (ramp > 0) {
        ctx.globalAlpha = ramp;
        ctx.fillStyle = '#9fc4e8';
        const gw1 = w1 * 0.03, gw2 = w2 * 0.03;
        ctx.beginPath();
        ctx.moveTo(x1 - w1 - rw1 - gw1, y1); ctx.lineTo(x1 - w1 - rw1, y1);
        ctx.lineTo(x2 - w2 - rw2, y2); ctx.lineTo(x2 - w2 - rw2 - gw2, y2);
        ctx.closePath(); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(x1 + w1 + rw1, y1); ctx.lineTo(x1 + w1 + rw1 + gw1, y1);
        ctx.lineTo(x2 + w2 + rw2 + gw2, y2); ctx.lineTo(x2 + w2 + rw2, y2);
        ctx.closePath(); ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
  }
  // tunnel walls: dark angled walls hugging the road where the track is tunneled
  // (per-strip check, so the portal looms as you approach and ends at the exit)
  for (let n = DRAW; n >= 2; n--) {
    const bd = G.playerDist + n * SEG_LEN;
    if (!inTunnel(bd)) continue;
    const x1 = projX[n], w1 = projW[n], y1 = projY[n];
    const x2 = projX[n - 1], w2 = projW[n - 1], y2 = projY[n - 1];
    if (y1 <= HORIZON - 40 && y2 <= HORIZON - 40) continue;
    const wh1 = w1 * 1.15, wh2 = w2 * 1.15;
    for (const s of [-1, 1]) {
      // wall face: vertical band from road edge outward, leaning slightly inward.
      // lightened + top edge highlight so walls read against the dark (they were
      // nearly invisible at #08080e on #060609).
      ctx.fillStyle = '#33334a';
      ctx.beginPath();
      ctx.moveTo(x1 + s * w1 * 1.04, y1);
      ctx.lineTo(x2 + s * w2 * 1.04, y2);
      ctx.lineTo(x2 + s * w2 * 2.3, y2 - wh2);
      ctx.lineTo(x1 + s * w1 * 2.3, y1 - wh1);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(110,120,150,0.55)'; // wall top edge highlight
      ctx.lineWidth = Math.max(1.5, w1 * 0.02);
      ctx.beginPath();
      ctx.moveTo(x2 + s * w2 * 2.3, y2 - wh2);
      ctx.lineTo(x1 + s * w1 * 2.3, y1 - wh1);
      ctx.stroke();
      // diagonal support beam on the wall face — chunky
      ctx.strokeStyle = 'rgba(52,52,74,0.95)';
      ctx.lineWidth = Math.max(2, w1 * 0.06);
      ctx.beginPath();
      ctx.moveTo(x1 + s * w1 * 1.1, y1 - wh1 * 0.1);
      ctx.lineTo(x1 + s * w1 * 2.2, y1 - wh1 * 0.9);
      ctx.stroke();
    }
    // ceiling slab spanning wall-top to wall-top: the tunnel is enclosed, not
    // an open trench (Craig 2026-09-17: "still didn't see tunnel")
    ctx.fillStyle = '#242433';
    ctx.beginPath();
    ctx.moveTo(x1 - w1 * 2.3, y1 - wh1);
    ctx.lineTo(x2 - w2 * 2.3, y2 - wh2);
    ctx.lineTo(x2 + w2 * 2.3, y2 - wh2);
    ctx.lineTo(x1 + w1 * 2.3, y1 - wh1);
    ctx.closePath(); ctx.fill();
    // ceiling center light strip: bright cyan band running the tunnel's length
    ctx.fillStyle = 'rgba(120,235,255,0.85)';
    const clw1 = Math.max(1, w1 * 0.09), clw2 = Math.max(1, w2 * 0.09);
    ctx.beginPath();
    ctx.moveTo((x1 - clw1), y1 - wh1 * 1.0); ctx.lineTo((x1 + clw1), y1 - wh1 * 1.0);
    ctx.lineTo((x2 + clw2), y2 - wh2 * 1.0); ctx.lineTo((x2 - clw2), y2 - wh2 * 1.0);
    ctx.closePath(); ctx.fill();
  }
  // near fill from n=1 to bottom of screen
  const yT = projY[1], xT = projX[1], wT = projW[1], yB = H + 4;
  const ratio = clamp((yB - HORIZON) / Math.max(1, yT - HORIZON), 1.0, 1.5);
  const wB = wT * ratio;
  ctx.fillStyle = ASPH_A;
  ctx.beginPath();
  ctx.moveTo(xT - wT, yT); ctx.lineTo(xT + wT, yT); ctx.lineTo(xT + wB, yB); ctx.lineTo(xT - wB, yB);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#dfe8f2';
  ctx.beginPath();
  ctx.moveTo(xT - wT - wT * 0.03, yT); ctx.lineTo(xT - wT, yT); ctx.lineTo(xT - wB, yB); ctx.lineTo(xT - wB - wB * 0.03, yB);
  ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(xT + wT, yT); ctx.lineTo(xT + wT + wT * 0.03, yT); ctx.lineTo(xT + wB + wB * 0.03, yB); ctx.lineTo(xT + wB, yB);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#e8e8ee';
  ctx.beginPath();
  ctx.moveTo(xT - wT, yT); ctx.lineTo(xT - wT + wT * 0.016, yT); ctx.lineTo(xT - wB + wB * 0.016, yB); ctx.lineTo(xT - wB, yB);
  ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(xT + wT - wT * 0.016, yT); ctx.lineTo(xT + wT, yT); ctx.lineTo(xT + wB, yB); ctx.lineTo(xT + wB - wB * 0.016, yB);
  ctx.closePath(); ctx.fill();
  // near tunnel walls: the player is inside the tunnel, so the walls flank the
  // whole near field (the per-strip loop above only covers n>=2)
  if (inTunnel(G.playerDist)) {
    const whT = wT * 1.15, whB = wB * 1.15;
    // ceiling over the near field (matches the per-strip ceiling above)
    ctx.fillStyle = '#242433';
    ctx.beginPath();
    ctx.moveTo(xT - wT * 2.3, yT - whT);
    ctx.lineTo(xT - wB * 2.3, yB - whB);
    ctx.lineTo(xT + wB * 2.3, yB - whB);
    ctx.lineTo(xT + wT * 2.3, yT - whT);
    ctx.closePath(); ctx.fill();
    for (const s of [-1, 1]) {
      ctx.fillStyle = '#33334a';
      ctx.beginPath();
      ctx.moveTo(xT + s * wT * 1.04, yT);
      ctx.lineTo(xT + s * wB * 1.04, yB);
      ctx.lineTo(xT + s * wB * 2.3, yB - whB);
      ctx.lineTo(xT + s * wT * 2.3, yT - whT);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(110,120,150,0.55)';
      ctx.lineWidth = Math.max(2, wT * 0.02);
      ctx.beginPath();
      ctx.moveTo(xT + s * wB * 2.3, yB - whB);
      ctx.lineTo(xT + s * wT * 2.3, yT - whT);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(52,52,74,0.95)';
      ctx.lineWidth = Math.max(3, wT * 0.06);
      ctx.beginPath();
      ctx.moveTo(xT + s * wT * 1.1, yT - whT * 0.1);
      ctx.lineTo(xT + s * wB * 2.2, yB - whB * 0.9);
      ctx.stroke();
    }
  }
}

/* ---------- shibuya zebra crossing (flat road-surface quads) ---------- */
function crossingJob() {
  const lap = Math.floor(G.playerDist / LAP_LEN);
  const cd = lap * LAP_LEN + CROSS_D;
  const rel = cd - G.playerDist;
  if (rel < 3 || rel > DRAW * SEG_LEN) return;
  pushJob(rel, (c) => {
    const n = projFor(rel);
    const x = projX[n], w = projW[n], y = projY[n];
    const sw = w * 1.9;
    c.fillStyle = 'rgba(235,235,240,0.9)';
    const stripes = 11;
    for (let i = 0; i < stripes; i++) {
      const sxp = x - sw / 2 + (i + 0.12) * sw / stripes;
      const wdt = sw / stripes * 0.62;
      // flat quad on road surface: slight vertical extent in screen space
      const hgt = Math.max(2, w * 0.05);
      c.fillRect(sxp, y - hgt / 2, wdt, hgt);
    }
  });
}

/* ---------- start/finish gate: chunky red torii (matches Pocket) ---------- */
function gantryJob() {
  const lap = Math.floor(G.playerDist / LAP_LEN);
  const gd = lap * LAP_LEN + 30;
  const rel = gd - G.playerDist;
  if (rel < 2 || rel > 2600) return;
  const fade = farFade(rel);
  pushJob(rel, (c) => {
    const p = projectSprite(rel, 0, 0);
    const wpx = p.w * 2.3, hpx = p.scale * H * Y_FACTOR * 0.85;
    if (wpx < 8) return;
    c.globalAlpha = fade;
    const red = '#c8281e', dark = '#8e1a12';
    const px0 = p.x - wpx / 2, px1 = p.x + wpx / 2, topY = p.y - hpx;
    const pw = Math.max(4, wpx * 0.06); // pillar width — chunky
    // two pillars (slightly tapered)
    c.fillStyle = red;
    c.fillRect(px0 - pw / 2, topY + hpx * 0.06, pw, hpx * 0.94);
    c.fillRect(px1 - pw / 2, topY + hpx * 0.06, pw, hpx * 0.94);
    c.fillStyle = dark; // pillar shading
    c.fillRect(px0 - pw / 2, topY + hpx * 0.06, pw * 0.3, hpx * 0.94);
    c.fillRect(px1 - pw / 2, topY + hpx * 0.06, pw * 0.3, hpx * 0.94);
    // top beam (kasagi): thick, slight upward tilt at ends
    const bw = wpx * 1.12, bh = Math.max(3, hpx * 0.075);
    c.fillStyle = red;
    c.beginPath();
    c.moveTo(p.x - bw / 2, topY + bh);
    c.lineTo(p.x + bw / 2, topY + bh);
    c.lineTo(p.x + bw / 2 + bw * 0.03, topY - bh * 0.4);
    c.lineTo(p.x - bw / 2 - bw * 0.03, topY - bh * 0.4);
    c.closePath(); c.fill();
    c.fillStyle = dark;
    c.fillRect(p.x - bw / 2, topY + bh * 0.45, bw, bh * 0.55);
    // second beam (nuki)
    const bw2 = wpx * 0.94, bh2 = Math.max(2, hpx * 0.045), y2 = p.y - hpx * 0.80;
    c.fillStyle = red;
    c.fillRect(p.x - bw2 / 2, y2 - bh2 / 2, bw2, bh2);
    // center plaque
    const plw = Math.max(6, wpx * 0.16), plh = Math.max(4, hpx * 0.09);
    c.fillStyle = '#101018';
    c.fillRect(p.x - plw / 2, y2 - bh2 / 2 - plh - 2, plw, plh);
    c.strokeStyle = '#ffdd46'; c.lineWidth = Math.max(1, plw * 0.04);
    c.strokeRect(p.x - plw / 2, y2 - bh2 / 2 - plh - 2, plw, plh);
    c.globalAlpha = 1;
  });
}

/* ---------- buildings: dark towers, dense lit windows ---------- */
function drawBuilding(c, x, yBase, w, h, bi, env) {
  if (w < 4 || h < 6) return;
  // snow city blocks come in dark red / mustard / gray like the v70 capture.
  // Night facades are a readable dark blue-gray with their own edge definition —
  // they must never dissolve into the black night sky (Craig 2026-09-17 QA).
  const snowPal = ['#2a3440', '#5a2320', '#6a5a20', '#3a3a44', '#24405a'];
  c.fillStyle = env === 'snow' ? snowPal[Math.floor(hash01(bi + 91) * snowPal.length)] : '#1b1b29';
  c.fillRect(x - w / 2, yBase - h, w, h);
  // chunky outline so blocks read as solid masses, not flat fills
  c.strokeStyle = env === 'snow' ? 'rgba(10,12,18,0.85)' : 'rgba(70,80,120,0.55)';
  c.lineWidth = Math.max(2, w * 0.03);
  c.strokeRect(x - w / 2, yBase - h, w, h);
  if (env === 'snow') {
    // snow cap on the roof
    const capH = Math.max(2, h * 0.09);
    c.fillStyle = '#f2f7fc';
    c.fillRect(x - w / 2 - 1, yBase - h - capH + 1, w + 2, capH);
  }
  // lit windows: chunky. The grid is FIXED per building (cols/rows from the
  // building index), so the window pattern is anchored to the facade and never
  // reshuffles as the building approaches.
  const litP = env === 'night' ? 0.52 : 0.06;
  const cols = 3 + Math.floor(hash01(bi * 3 + 1001) * 5),
        rows = 4 + Math.floor(hash01(bi * 3 + 1002) * 8);
  const cw = w / cols, chh = h / rows;
  for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) {
    const v = hash01(bi * 31 + r * 7 + q * 13);
    if (v < litP) {
      c.fillStyle = v < litP * 0.6 ? 'rgba(255,205,110,0.95)' : v < litP * 0.85 ? 'rgba(200,225,255,0.9)' : 'rgba(255,170,90,0.85)';
      c.fillRect(x - w / 2 + q * cw + cw * 0.20, yBase - h + r * chh + chh * 0.20, Math.max(1, cw * 0.60), Math.max(1, chh * 0.60));
    }
  }
  if (env === 'snow') { // snow cap on roof
    c.fillStyle = '#f0f5fa';
    c.fillRect(x - w / 2, yBase - h - 3, w, 4);
  } else if (env === 'night') {
    // neon edge trim: lit vertical strips on both facade edges, per-building
    // fixed color — buildings read as glowing masses, not black slabs
    if (hash01(bi + 5) < 0.62) {
      const trimCol = hash01(bi + 6) < 0.5 ? 'rgba(74,226,255,0.85)' : 'rgba(255,106,213,0.8)';
      const tw = Math.max(2, w * 0.045);
      c.fillStyle = trimCol;
      c.fillRect(x - w / 2, yBase - h, tw, h);
      c.fillRect(x + w / 2 - tw, yBase - h, tw, h);
    }
    // rooftop edge light
    if (hash01(bi + 9) < 0.55) {
      c.fillStyle = 'rgba(255,90,120,0.9)';
      c.fillRect(x - w / 2, yBase - h - 2, w, 2);
    }
  }
}
function buildingJobs(env) {
  if (env === 'tunnel') return; // tunnel interior: walls only, no buildings
  // night city is a near-continuous wall of buildings on both sides (like the
  // v89 capture); a darker background row adds depth behind the front row
  const step = env === 'night' ? 46 : 55;
  const first = Math.ceil(G.playerDist / step) * step;
  const gapP = env === 'night' ? 0.05 : 0.3;
  for (let bd = first; bd < G.playerDist + DRAW * SEG_LEN; bd += step) {
    const rel = bd - G.playerDist;
    if (rel < 5 || rel > DRAW * SEG_LEN - 20) continue;
    if (inBridge(bd)) continue;
    if (inPark(bd)) continue; // park strip: trees + paths, no buildings
    const onWater = inWater(bd); // causeway: buildings stand set back, water shows between
    const wside = onWater;
    for (const side of [-1, 1]) {
      const bi = Math.floor(bd / step) * 2 + (side > 0 ? 1 : 0);
      const isGap = hash01(bi + 101) < gapP;
      if (!isGap) {
        const bw0 = 24 + hash01(bi + 7) * 34;
        let bh = 30 + hash01(bi + 13) * 66;
        // snow city = mid-rise blocks (wide, not towers) like the v70 capture
        const bw = env === 'snow' ? bw0 * 1.6 : bw0;
        if (env === 'snow') bh = bh * 0.42;
        const lat = side * (wside ? 3.8 + hash01(bi + 29) * 1.4 : 2.1 + hash01(bi + 29) * 1.2);
        const fade = farFade(rel);
        if (fade <= 0) continue;
        // attached sign: picked per-building, drawn on its face (never floating)
        let vs = null, hs = null;
        const sv = hash01(bi + 501);
        if (sv < 0.50) vs = VSIGNS[Math.floor(hash01(bi + 502) * VSIGNS.length) % VSIGNS.length];
        else if (sv < 0.72) hs = HSIGNS[Math.floor(hash01(bi + 503) * HSIGNS.length) % HSIGNS.length];
        pushJob(rel, ((bii, ll, vsg, hsg, sd, ee) => (c) => {
          const p = projectSprite(rel, ll, 0);
          const wpx = p.w * (bw / 40), hpx = p.scale * H * Y_FACTOR * bh * 0.052;
          c.globalAlpha = fade;
          drawBuilding(c, p.x, p.y, wpx, hpx, bii, ee);
          // Signs are culled from EACH SIGN's own projected bounds, never from
          // the building's bounds: a sign mounted on a close building stays
          // visible as long as the sign itself overlaps the viewport.
          // vertical signboard fixed to the building's road-facing edge.
          // Size-capped: a close sign stays big and readable, never a
          // screen-filling slab.
          if (vsg && wpx > 14 && hpx > 30) {
            const spr = vSignSprite(vsg[0], vsg[1]);
            const shpx = Math.min(hpx * 0.52, H * 0.35), swpx = shpx * (spr.width / spr.height);
            const sx = p.x + (sd > 0 ? -1 : 1) * wpx * 0.30, sy = p.y - hpx * 0.12 - shpx;
            if (sx + swpx / 2 > -6 && sx - swpx / 2 < W + 6 && sy + shpx > -6 && sy < H + 6) {
              const was = c.imageSmoothingEnabled;
              c.imageSmoothingEnabled = false;
              c.drawImage(spr, sx - swpx / 2, sy, swpx, shpx);
              c.imageSmoothingEnabled = was;
            }
          }
          // horizontal billboard mounted on the building face (size-capped too)
          if (hsg && wpx > 20 && hpx > 40) {
            const spr = hSignSprite(hsg[0], hsg[1]);
            const swpx = Math.min(wpx * 0.8, hpx * 1.4, W * 0.5), shpx = swpx * (spr.height / spr.width);
            const sx = p.x, sy = p.y - hpx * 0.78 - shpx;
            if (sx + swpx / 2 > -6 && sx - swpx / 2 < W + 6 && sy + shpx > -6 && sy < H + 6) {
              const was = c.imageSmoothingEnabled;
              c.imageSmoothingEnabled = false;
              c.drawImage(spr, sx - swpx / 2, sy, swpx, shpx);
              c.imageSmoothingEnabled = was;
            }
          }
          c.globalAlpha = 1;
        })(bi, lat, vs, hs, side, env));
        // background row: taller, darker, sparser windows — fills the gaps
        // between front buildings so the skyline never goes empty
        if (env === 'night' && hash01(bi + 701) < 0.75) {
          const bw2 = 40 + hash01(bi + 702) * 50, bh2 = 70 + hash01(bi + 703) * 90;
          const lat2 = side * (4.6 + hash01(bi + 704) * 1.6);
          pushJob(rel + 30, ((bii, ll) => (c) => {
            const p = projectSprite(rel + 30, ll, 0);
            const wpx = p.w * (bw2 / 40), hpx = p.scale * H * Y_FACTOR * bh2 * 0.052;
            if (wpx < 6 || hpx < 10) return;
            c.globalAlpha = fade * 0.9;
            c.fillStyle = '#101019'; // dark but distinct from the sky, never pure black
            c.fillRect(p.x - wpx / 2, p.y - hpx, wpx, hpx);
            const cols = 3 + Math.floor(hash01(bii * 3 + 2001) * 6),
                  rows = 5 + Math.floor(hash01(bii * 3 + 2002) * 8);
            for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) {
              const v = hash01(bii * 17 + r * 5 + q * 11);
              if (v < 0.16) {
                c.fillStyle = 'rgba(255,200,105,0.55)';
                c.fillRect(p.x - wpx / 2 + (q + 0.3) * wpx / cols, p.y - hpx + (r + 0.3) * hpx / rows,
                  Math.max(1, wpx / cols * 0.4), Math.max(1, hpx / rows * 0.4));
              }
            }
            c.globalAlpha = 1;
          })(bi, lat2));
        }
      } else if (env === 'night' && hash01(bi + 801) < 0.5) {
        // dark roadside tree in the gap — silhouette, not empty void
        const lat = side * (1.7 + hash01(bi + 802) * 0.6);
        const th = 16 + hash01(bi + 803) * 20;
        const fade = farFade(rel);
        if (fade <= 0) continue;
        pushJob(rel, ((ll, hh) => (c) => {
          const p = projectSprite(rel, ll, 0);
          const hpx = p.scale * H * Y_FACTOR * hh * 0.052;
          if (hpx < 8) return;
          c.globalAlpha = fade;
          drawPine(c, p, hpx, 'night');
          c.globalAlpha = 1;
        })(lat, th));
      }
    }
  }
}

/* ---------- vertical neon signs on roadside poles (pixelated JP text) ---------- */
const VSIGNS = [
  ['ラーメン', '#53b5f9'], ['喫茶店', '#ff5a6a'], ['パチンコ', '#39ff6a'],
  ['酒場', '#39ff6a'], ['ドンキ', '#ffdd46'], ['ゲーム', '#ffdd46'],
  ['カラオケ', '#ff6ad5'], ['居酒屋', '#f2f2f2'], ['24時間', '#ffdd46'], ['ネオン街', '#53e1ff'],
];
const signCache = {};
function vSignSprite(text, color) {
  const key = text + '|' + color;
  if (signCache[key]) return signCache[key];
  const fs = 22, pad = 8;
  const cv = document.createElement('canvas');
  const m = cv.getContext('2d');
  m.font = 'bold ' + fs + 'px sans-serif';
  // vertical: one char per row
  const chars = [...text];
  let tw = 0;
  for (const ch of chars) tw = Math.max(tw, m.measureText(ch).width);
  cv.width = Math.ceil(tw) + pad * 2; cv.height = chars.length * (fs + 6) + pad * 2;
  const g = cv.getContext('2d');
  g.fillStyle = 'rgba(5,5,14,0.92)';
  g.fillRect(0, 0, cv.width, cv.height);
  g.strokeStyle = color; g.lineWidth = 3;
  g.strokeRect(2, 2, cv.width - 4, cv.height - 4);
  g.font = 'bold ' + fs + 'px sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = color; g.shadowBlur = 10;
  g.fillStyle = color;
  chars.forEach((ch, i) => g.fillText(ch, cv.width / 2, pad + (fs + 6) * i + (fs + 6) / 2));
  // downscale to pixelate
  const small = document.createElement('canvas');
  const sw = Math.max(8, Math.floor(cv.width / 4)), sh = Math.max(16, Math.floor(cv.height / 4));
  small.width = sw; small.height = sh;
  small.getContext('2d').drawImage(cv, 0, 0, sw, sh);
  signCache[key] = small;
  return small;
}
/* (pole sign jobs removed: all signs are drawn attached to building faces in buildingJobs) */

/* ---------- horizontal billboards ---------- */
const HSIGNS = [
  ['TOKYO DRIFT', '#ff6ad5'], ['NEO TOKYO', '#53b5f9'], ['居酒屋', '#f2f2f2'],
  ['ゲームセンタ', '#f2f2f2'], ['カラオケ', '#ff6ad5'], ['24時間', '#ffdd46'],
];
function hSignSprite(text, color) {
  const key = 'h|' + text + '|' + color;
  if (signCache[key]) return signCache[key];
  const fs = 26, pad = 10;
  const cv = document.createElement('canvas');
  const m = cv.getContext('2d');
  m.font = 'bold ' + fs + 'px sans-serif';
  const tw = m.measureText(text).width;
  cv.width = Math.ceil(tw) + pad * 2; cv.height = fs + pad * 2;
  const g = cv.getContext('2d');
  g.fillStyle = 'rgba(5,5,14,0.92)';
  g.fillRect(0, 0, cv.width, cv.height);
  g.strokeStyle = color; g.lineWidth = 3;
  g.strokeRect(2, 2, cv.width - 4, cv.height - 4);
  g.font = 'bold ' + fs + 'px sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = color; g.shadowBlur = 10;
  g.fillStyle = color;
  g.fillText(text, cv.width / 2, cv.height / 2 + 1);
  const small = document.createElement('canvas');
  const sw = Math.max(16, Math.floor(cv.width / 4)), sh = Math.max(8, Math.floor(cv.height / 4));
  small.width = sw; small.height = sh;
  small.getContext('2d').drawImage(cv, 0, 0, sw, sh);
  signCache[key] = small;
  return small;
}
/* (pole billboard jobs removed: billboards are drawn mounted on building faces in buildingJobs) */

/* ---------- crowd clusters ---------- */
const CROWD_COLS = ['#7cfc00', '#ff6ad5', '#ffdd46', '#53b5f9', '#f2f2f2', '#ff8c42'];
/* ---------- roadside pine trees: snow-white in snow, green in day ---------- */
function drawPine(c, p, hpx, snow) {
  // shared pine renderer (roadside trees + park trees): layered triangles, snow
  // caps in snow. p = projected base point, hpx = tree height in px.
  // snow: true = snowy white, false = day green, 'night' = dark night green.
  const night = snow === 'night';
  const wpx = hpx * 0.55;
  c.fillStyle = snow === true ? '#4a3a30' : '#241a12'; // trunk
  c.fillRect(p.x - wpx * 0.04, p.y - hpx * 0.22, wpx * 0.08, hpx * 0.22);
  const layers = 4;
  for (let l = 0; l < layers; l++) {
    const ly0 = p.y - hpx * 0.18 - (hpx * 0.82) * l / layers;
    const ly1 = p.y - hpx * 0.18 - (hpx * 0.82) * (l + 1) / layers;
    const lw = wpx * (0.5 - l * 0.09);
    c.fillStyle = snow === true ? (l % 2 ? '#eef4fa' : '#dce8f2')
      : night ? (l % 2 ? '#1c4423' : '#23542b')
      : (l % 2 ? '#2f7a34' : '#3a8a3e');
    c.beginPath();
    c.moveTo(p.x - lw, ly0); c.lineTo(p.x + lw, ly0); c.lineTo(p.x, ly1);
    c.closePath(); c.fill();
    if (snow === true) { // snow dusting on top edge
      c.fillStyle = '#ffffff';
      c.fillRect(p.x - lw * 0.7, ly0 - 1.5, lw * 1.4, 2);
    }
  }
}
function treeJobs(env) {
  if (env !== 'snow') return;
  const step = 48;
  const first = Math.ceil(G.playerDist / step) * step;
  for (let td = first; td < G.playerDist + DRAW * SEG_LEN; td += step) {
    const rel = td - G.playerDist;
    if (rel < 6 || rel > DRAW * SEG_LEN - 20) continue;
    if (inBridge(td)) continue;
    if (inWater(td)) continue; // causeway: water only, no trees
    const ti = Math.floor(td / step);
    if (hash01(ti + 401) < 0.25) continue; // gaps
    for (const side of [-1, 1]) {
      if (hash01(ti * 2 + (side > 0 ? 1 : 0) + 402) < 0.3) continue;
      const lat = side * (1.55 + hash01(ti + side + 403) * 0.9);
      const th = 14 + hash01(ti * 3 + side + 404) * 22; // tree height (m-ish)
      const fade = farFade(rel);
      if (fade <= 0) continue;
      pushJob(rel, ((ll, hh, ii, ee) => (c) => {
        const p = projectSprite(rel, ll, 0);
        const hpx = p.scale * H * Y_FACTOR * hh * 0.052;
        if (hpx < 6) return;
        c.globalAlpha = fade;
        drawPine(c, p, hpx, ee === 'snow');
        c.globalAlpha = 1;
      })(lat, th, ti, env));
    }
  }
}

/* ---------- roadside torii gates: mixed snow zone (v70 start stretch) ---------- */
function toriiJobs(env) {
  if (G.track !== 'mixed' || env !== 'snow') return;
  const step = 80, endD = TOTAL * 0.215;
  const first = Math.ceil(Math.max(G.playerDist, 70) / step) * step;
  for (let td = first; td < Math.min(G.playerDist + DRAW * SEG_LEN, endD); td += step) {
    const rel = td - G.playerDist;
    if (rel < 8 || rel > DRAW * SEG_LEN - 20) continue;
    const fade = farFade(rel);
    if (fade <= 0) continue;
    for (const side of [-1, 1]) {
      const lat = side * 1.42;
      pushJob(rel - 0.1 * side, ((ll) => (c) => {
        const p = projectSprite(rel, ll, 0);
        const hpx = p.scale * H * Y_FACTOR * 0.34;
        if (hpx < 10) return;
        const wpx = hpx * 0.72, pw = Math.max(2.5, hpx * 0.10); // chunky pillars
        c.globalAlpha = fade;
        const red = '#c8281e', dark = '#8e1a12';
        // two pillars planted at the roadside
        c.fillStyle = red;
        c.fillRect(p.x - wpx / 2 - pw / 2, p.y - hpx, pw, hpx);
        c.fillRect(p.x + wpx / 2 - pw / 2, p.y - hpx, pw, hpx);
        c.fillStyle = dark;
        c.fillRect(p.x - wpx / 2 - pw / 2, p.y - hpx, pw * 0.35, hpx);
        c.fillRect(p.x + wpx / 2 - pw / 2, p.y - hpx, pw * 0.35, hpx);
        // top beam
        const bh = Math.max(2, hpx * 0.09), bw = wpx + pw * 2.4;
        c.fillStyle = red;
        c.fillRect(p.x - bw / 2, p.y - hpx - bh, bw, bh);
        c.fillStyle = dark;
        c.fillRect(p.x - bw / 2, p.y - hpx - bh, bw, bh * 0.4);
        c.globalAlpha = 1;
      })(lat));
    }
  }
}

/* ---------- roadside utility poles: mixed day zone (v70 causeway/city) ---------- */
function poleJobs(env) {
  if (G.track !== 'mixed' || env !== 'snow') return; // street lamps in the snow city
  const step = 95;
  const first = Math.ceil(G.playerDist / step) * step;
  for (let pd = first; pd < G.playerDist + DRAW * SEG_LEN; pd += step) {
    const rel = pd - G.playerDist;
    if (rel < 8 || rel > DRAW * SEG_LEN - 20) continue;
    if (inBridge(pd)) continue;
    const pi = Math.floor(pd / step);
    const side = pi % 2 === 0 ? -1 : 1; // alternate sides like the capture
    const lat = side * 1.45;
    const fade = farFade(rel);
    if (fade <= 0) continue;
    pushJob(rel, ((ll, ii) => (c) => {
      const p = projectSprite(rel, ll, 0);
      const hpx = p.scale * H * Y_FACTOR * 0.55;
      if (hpx < 8) return;
      const wpx = Math.max(2, hpx * 0.07); // chunky pole
      c.globalAlpha = fade;
      c.fillStyle = '#14141c';
      c.fillRect(p.x - wpx / 2, p.y - hpx, wpx, hpx); // pole
      c.fillRect(p.x - wpx * 2.2, p.y - hpx * 0.92, wpx * 4.4, wpx * 0.9); // crossarm
      c.globalAlpha = 1;
    })(lat, pi));
  }
}

/* ---------- street lamps: night city (warm sodium lamps, alternating sides) ---------- */
function lampJobs(env) {
  if (env !== 'night') return;
  const step = 90;
  const first = Math.ceil(G.playerDist / step) * step;
  for (let ld = first; ld < G.playerDist + DRAW * SEG_LEN; ld += step) {
    const rel = ld - G.playerDist;
    if (rel < 8 || rel > DRAW * SEG_LEN - 20) continue;
    if (inBridge(ld)) continue;
    const li = Math.floor(ld / step);
    const side = li % 2 === 0 ? -1 : 1; // alternate sides like the v89 capture
    const lat = side * 1.62;
    const fade = farFade(rel);
    if (fade <= 0) continue;
    pushJob(rel, ((ll) => (c) => {
      const p = projectSprite(rel, ll, 0);
      const hpx = p.scale * H * Y_FACTOR * 0.42;
      if (hpx < 8) return;
      const wpx = Math.max(2, hpx * 0.06);
      c.globalAlpha = fade;
      // pole
      c.fillStyle = '#101018';
      c.fillRect(p.x - wpx / 2, p.y - hpx, wpx, hpx);
      // arm reaching over the road
      const armL = hpx * 0.35, dir = ll > 0 ? -1 : 1;
      c.fillRect(dir > 0 ? p.x : p.x - armL, p.y - hpx, armL, wpx * 0.8);
      // lamp head: warm glow
      const hx = p.x + dir * armL, hy = p.y - hpx;
      const gr = Math.max(3, hpx * 0.16);
      const gl = c.createRadialGradient(hx, hy, 0, hx, hy, gr * 3);
      gl.addColorStop(0, 'rgba(255,210,130,0.9)');
      gl.addColorStop(0.35, 'rgba(255,190,110,0.35)');
      gl.addColorStop(1, 'rgba(255,190,110,0)');
      c.fillStyle = gl;
      c.beginPath(); c.arc(hx, hy, gr * 3, 0, 6.29); c.fill();
      c.fillStyle = '#ffe9c0';
      c.beginPath(); c.arc(hx, hy, gr * 0.55, 0, 6.29); c.fill();
      // light pool on the road
      c.fillStyle = 'rgba(255,200,120,0.10)';
      c.beginPath();
      c.ellipse(hx, p.y - hpx * 0.02, hpx * 0.55, hpx * 0.10, 0, 0, 6.29);
      c.fill();
      c.globalAlpha = 1;
    })(lat));
  }
}

function crowdJobs(env) {
  if (env !== 'night' && env !== 'snow') return; // crowds line the night + snow streets
  // dense sidewalk life like the v89 capture: clusters every ~85m, often both sides
  const step = 85;
  const first = Math.ceil(G.playerDist / step) * step;
  for (let cd = first; cd < G.playerDist + 2600; cd += step) {
    const rel = cd - G.playerDist;
    if (rel < 10 || rel > 2600) continue;
    if (inBridge(cd)) continue;
    const ci = Math.floor(cd / step);
    const both = hash01(ci + 51) < 0.45;
    const sides = both ? [-1, 1] : [hash01(ci + 3) > 0.5 ? -1 : 1];
    for (const side of sides) {
      const lat = side * (1.5 + hash01(ci + 11 + side) * 0.5);
      const n = 3 + Math.floor(hash01(ci + 21 + side) * 4);
      const fade = farFade(rel);
      if (fade <= 0) continue;
      pushJob(rel, ((cc, ll, nn) => (c) => {
        const p = projectSprite(rel, ll, 0);
        const hpx = p.scale * H * Y_FACTOR * 0.16;
        if (hpx < 3 || hpx > H * 0.3) return;
        c.globalAlpha = fade;
        for (let i = 0; i < nn; i++) {
          const ox = (hash01(cc + i * 3) - 0.5) * hpx * 1.6;
          const col = CROWD_COLS[(cc + i) % CROWD_COLS.length];
          c.fillStyle = col;
          c.fillRect(p.x + ox - hpx * 0.13, p.y - hpx * 0.72, hpx * 0.26, hpx * 0.72);
          c.beginPath(); c.arc(p.x + ox, p.y - hpx * 0.86, hpx * 0.15, 0, 6.29); c.fill();
        }
        c.globalAlpha = 1;
      })(ci, lat, n));
    }
  }
}

/* ---------- bridge: suspension bridge over water (matches Pocket) ---------- */
function bridgeJobs() {
  // NOTE (2026-09-17 root-cause fix): the old early-out guard
  // `!inBridge(G.playerDist + DRAW*SEG_LEN)` wrapped through LAP_LEN's modulo
  // (e.g. 1829+3000=4829 % 4550 = 279), so the whole bridge never rendered on
  // approach — it popped in when the player reached it. The guard now scans the
  // actual tower positions in view.
  const step = 80;
  let anyInView = false;
  const scanFirst = Math.ceil(G.playerDist / step) * step;
  for (let td = scanFirst; td < G.playerDist + DRAW * SEG_LEN; td += step)
    if (inBridge(td)) { anyInView = true; break; }
  if (!anyInView) return;
  if (G.track === 'mixed') {
    // v70 snow bridge: white railings + black lamp posts with yellow lights
    const step = 80;
    const first = Math.ceil(G.playerDist / step) * step;
    for (let ld = first; ld < G.playerDist + DRAW * SEG_LEN; ld += step) {
      const rel = ld - G.playerDist;
      if (rel < 12 || rel > DRAW * SEG_LEN - 20) continue;
      if (!inBridge(ld)) continue;
      const fade = bridgeFade(rel);
      if (fade <= 0) continue;
      for (const s of [-1, 1]) {
        pushJob(rel, ((side) => (c) => {
          const p = projectSprite(rel, side * 1.28, 0);
          if (p.w < 2.5) return;
          const top = p.y - p.scale * H * Y_FACTOR * 0.34;
          c.globalAlpha = fade;
          c.fillStyle = '#101016';
          c.fillRect(p.x - p.w * 0.05, top, p.w * 0.10, p.y - top); // chunky post
          c.fillStyle = '#ffd94a'; // lamp head glow
          c.beginPath(); c.arc(p.x, top, p.w * 0.12, 0, 6.29); c.fill();
          c.fillStyle = 'rgba(255,240,180,0.9)';
          c.beginPath(); c.arc(p.x, top, p.w * 0.045, 0, 6.29); c.fill();
          c.globalAlpha = 1;
        })(s));
      }
    }
    return;
  }
  const first = Math.ceil(G.playerDist / step) * step;
  for (let td = first; td < G.playerDist + DRAW * SEG_LEN; td += step) {
    const rel = td - G.playerDist;
    if (rel < 12 || rel > DRAW * SEG_LEN) continue;
    if (!inBridge(td)) continue;
    const fade = bridgeFade(rel);
    if (fade <= 0) continue;
    pushJob(rel, ((rr) => (c) => {
      const p = projectSprite(rr, 0, 0);
      const hpx = p.scale * H * Y_FACTOR * 1.9;
      if (hpx < 12) return;
      const wpx = p.w * 1.9;
      // clamp widths used for strokes: a tower ~12m away would otherwise draw
      // hundred-pixel cables sweeping across the whole screen
      const wc = Math.min(wpx, W * 0.55);
      const topY = p.y - hpx;
      c.globalAlpha = fade;
      // tower: two posts + cross beams, white — chunky strokes.
      // post/beam x-extent is clamped to the screen: for a close tower the raw
      // wpx is enormous and the cross beams would otherwise sweep across the
      // whole screen as a full-width white bar.
      const bx0 = clamp(p.x - wpx * 0.60, -W * 0.6, W * 1.6);
      const bx1 = clamp(p.x + wpx * 0.60, -W * 0.6, W * 1.6);
      c.strokeStyle = '#dfe6f2'; c.lineWidth = Math.max(3, wc * 0.036);
      c.beginPath();
      c.moveTo(bx0, p.y); c.lineTo(bx0, topY);
      c.moveTo(bx1, p.y); c.lineTo(bx1, topY);
      // cross-beams only when the tower is far enough to read as a tower:
      // up close they become full-width white bars sweeping across the screen
      if (rr > 80) {
        c.moveTo(bx0, p.y - hpx * 0.35); c.lineTo(bx1, p.y - hpx * 0.35);
        c.moveTo(bx0, p.y - hpx * 0.7); c.lineTo(bx1, p.y - hpx * 0.7);
      }
      c.stroke();
      // main cable: catenary draping to next tower, both sides
      const p2 = projectSprite(rr + step, 0, 0);
      const hpx2 = p2.scale * H * Y_FACTOR * 1.9;
      const topY2 = p2.y - hpx2;
      const topMax = Math.max(topY, topY2);
      const sag = Math.min(hpx, hpx2) * 0.55;
      const ctrlY = topMax + sag * 2; // quadratic control for visible drape
      c.strokeStyle = 'rgba(223,230,242,0.9)';
      for (const sx of [-1, 1]) {
        const x1 = p.x + sx * wpx * 0.60;
        const x2 = p2.x + sx * (p2.w * 1.9) * 0.60;
        c.lineWidth = Math.max(2.5, wc * 0.014);
        c.beginPath();
        c.moveTo(x1, topY);
        c.quadraticCurveTo((x1 + x2) / 2, ctrlY, x2, topY2);
        c.stroke();
        // suspenders: verticals from cable down to deck
        c.lineWidth = Math.max(1.5, wc * 0.007);
        c.beginPath();
        for (let i = 1; i < 6; i++) {
          const t = i / 6, u = 1 - t;
          const cx = x1 + (x2 - x1) * t;
          const cy = u * u * topY + 2 * u * t * ctrlY + t * t * topY2;
          c.moveTo(cx, cy); c.lineTo(cx, p.y - hpx * 0.02);
        }
        c.stroke();
      }
      c.globalAlpha = 1;
    })(rel));
  }
}

/* ---------- firework tunnel: hanging string lights across the road ---------- */
function tunnelPortals() {
  // portal frames at each tunnel entrance/exit: grounded arches that hug the
  // road curve (projected like everything else), with lit edges — never
  // floating wireframes. Mixed tunnels are absolute-DIST (once per race);
  // the night canopy tunnel is lap-relative (both laps).
  // (2026-09-17: portals are bigger and brighter, with yellow chevron
  // approach markers, so the tunnel can't be missed — Craig "still didn't
  // see tunnel".)
  const bounds = [];
  const entrances = [];
  if (G.track === 'mixed') {
    for (const [a, b] of [[0.008, 0.055], [0.363, 0.393]]) {
      bounds.push(TOTAL * a, TOTAL * b);
      entrances.push(TOTAL * a);
    }
  } else {
    for (let lap = 0; lap < LAPS; lap++) {
      bounds.push(lap * LAP_LEN + LAP_LEN * 0.325, lap * LAP_LEN + LAP_LEN * 0.378);
      entrances.push(lap * LAP_LEN + LAP_LEN * 0.325);
    }
  }
  // chevron approach markers: pairs of yellow arrows on short posts at the
  // road edges, 220m and 110m before each entrance — mounted on posts, part
  // of the road furniture
  for (const en of entrances) {
    for (const back of [220, 110]) {
      const bd = en - back;
      if (bd < 0) continue;
      const rel = bd - G.playerDist;
      if (rel < 8 || rel > 2600) continue;
      const fade = farFade(rel);
      if (fade <= 0) continue;
      pushJob(rel, ((rr, ff) => (c) => {
        c.globalAlpha = ff;
        for (const s of [-1, 1]) {
          const p = projectSprite(rr, s * 1.22, 0);
          const hpx = p.scale * H * Y_FACTOR * 0.30;
          if (hpx < 5) continue;
          const pw = Math.max(2.5, p.w * 0.03);
          c.fillStyle = '#2a2a34'; // post, planted at road level
          c.fillRect(p.x - pw / 2, p.y - hpx, pw, hpx);
          // chevron arrows pointing inward (toward the tunnel), mounted on
          // the post — yellow with dark outline
          const ch = Math.max(4, hpx * 0.42), cw = ch * 0.9;
          c.fillStyle = '#ffd94a';
          c.strokeStyle = '#141414'; c.lineWidth = Math.max(1.5, cw * 0.08);
          for (let k = 0; k < 2; k++) {
            const cy = p.y - hpx + hpx * 0.12 + k * ch * 1.15;
            c.beginPath();
            c.moveTo(p.x - s * cw * 0.5, cy); c.lineTo(p.x, cy + ch * 0.28); c.lineTo(p.x - s * cw * 0.5, cy + ch * 0.56);
            c.lineTo(p.x - s * cw * 0.18, cy + ch * 0.56); c.lineTo(p.x + s * cw * 0.14, cy + ch * 0.28); c.lineTo(p.x - s * cw * 0.18, cy);
            c.closePath(); c.fill(); c.stroke();
          }
        }
        c.globalAlpha = 1;
      })(rel, fade));
    }
  }
  for (const bd of bounds) {
    const rel = bd - G.playerDist;
    if (rel < 10 || rel > 2600) continue;
    const fade = farFade(rel);
    if (fade <= 0) continue;
    pushJob(rel, ((rr) => (c) => {
      const pL = projectSprite(rr, -1.45, 0), pR = projectSprite(rr, 1.45, 0);
      const hpx = pL.scale * H * Y_FACTOR * 1.55; // taller portal: looms over the road
      if (hpx < 14) return;
      const pw = Math.max(3, pL.w * 0.12); // chunky pillars, planted at road level
      c.globalAlpha = fade;
      c.fillStyle = '#23232f';
      c.fillRect(pL.x - pw / 2, pL.y - hpx, pw, hpx);
      c.fillRect(pR.x - pw / 2, pR.y - hpx, pw, hpx);
      // lit edge on each pillar (mounted, part of the structure) — brighter
      c.fillStyle = '#4ae2ff';
      c.fillRect(pL.x - pw / 2, pL.y - hpx, pw * 0.36, hpx);
      c.fillRect(pR.x + pw * 0.14, pR.y - hpx, pw * 0.36, hpx);
      // top beam spanning the road, thicker with a bright light strip
      const bh = Math.max(3, hpx * 0.10), topY = pL.y - hpx - bh;
      c.fillStyle = '#23232f';
      c.fillRect(pL.x - pw / 2, topY, pR.x - pL.x + pw, bh);
      c.fillStyle = '#4ae2ff';
      c.fillRect(pL.x - pw / 2, topY + bh * 0.30, pR.x - pL.x + pw, bh * 0.4);
      // mounted name plate on the beam (part of the portal), larger
      const spr = hSignSprite('TUNNEL', '#ffd94a');
      const swpx = Math.min((pR.x - pL.x) * 0.52, 200), shpx = swpx * (spr.height / spr.width);
      const was = c.imageSmoothingEnabled; c.imageSmoothingEnabled = false;
      c.drawImage(spr, (pL.x + pR.x) / 2 - swpx / 2, topY - shpx - 8, swpx, shpx);
      c.imageSmoothingEnabled = was;
      c.globalAlpha = 1;
    })(rel));
  }
}
function tunnelJobs(env) {
  // portals loom during approach (drawn whatever the current env is); the
  // interior string lights only render once the player is inside.
  tunnelPortals();
  if (env !== 'tunnel') return;
  const step = 70;
  const first = Math.ceil(G.playerDist / step) * step;
  for (let ld = first; ld < G.playerDist + DRAW * SEG_LEN; ld += step) {
    const rel = ld - G.playerDist;
    if (rel < 10 || rel > DRAW * SEG_LEN - 20) continue;
    if (!inTunnel(ld)) continue;
    const fade = farFade(rel);
    if (fade <= 0) continue;
    const li = Math.floor(ld / step);
    pushJob(rel, ((ii) => (c) => {
      const p = projectSprite(rel, 0, 0);
      const wireY = p.y - p.scale * H * Y_FACTOR * 0.62;
      const halfW = p.w * 1.7;
      if (halfW < 6) return;
      c.globalAlpha = fade;
      // wire across the road
      c.strokeStyle = 'rgba(120,130,150,0.8)';
      c.lineWidth = Math.max(1, p.w * 0.008);
      c.beginPath(); c.moveTo(p.x - halfW, wireY); c.lineTo(p.x + halfW, wireY); c.stroke();
      // hanging bulbs on short drops, alternating cyan / warm yellow
      const nBulb = 7;
      for (let b = 0; b < nBulb; b++) {
        const bx = p.x - halfW + (b + 0.5) * (2 * halfW / nBulb);
        const drop = p.scale * H * Y_FACTOR * (0.10 + hash01(ii * 7 + b) * 0.16);
        const col = (ii + b) % 2 ? '#4ae2ff' : '#ffd94a';
        c.strokeStyle = 'rgba(120,130,150,0.7)';
        c.lineWidth = Math.max(1, p.w * 0.005);
        c.beginPath(); c.moveTo(bx, wireY); c.lineTo(bx, wireY + drop); c.stroke();
        const br = Math.max(1.5, p.w * 0.035);
        c.fillStyle = col;
        c.beginPath(); c.arc(bx, wireY + drop, br, 0, 6.29); c.fill();
        c.fillStyle = 'rgba(255,255,255,0.85)';
        c.beginPath(); c.arc(bx, wireY + drop, br * 0.45, 0, 6.29); c.fill();
      }
      c.globalAlpha = 1;
    })(li));
  }
  // ceiling bands: dark ribs spanning wall-to-wall every ~40m inside the
  // tunnel — gives the interior real 3D enclosure, not flat walls
  const cstep = 40;
  const cfirst = Math.ceil(G.playerDist / cstep) * cstep;
  for (let ld = cfirst; ld < G.playerDist + DRAW * SEG_LEN; ld += cstep) {
    const rel = ld - G.playerDist;
    if (rel < 10 || rel > DRAW * SEG_LEN - 20) continue;
    if (!inTunnel(ld)) continue;
    const fade = farFade(rel);
    if (fade <= 0) continue;
    pushJob(rel - 1, ((rr, ff) => (c) => {
      const pL = projectSprite(rr, -2.2, 0), pR = projectSprite(rr, 2.2, 0);
      const yT = pL.y - pL.scale * H * Y_FACTOR * 1.15;
      const yT2 = pR.y - pR.scale * H * Y_FACTOR * 1.15;
      const bh = Math.max(2, pL.w * 0.05);
      c.globalAlpha = ff;
      c.fillStyle = '#3d3d5c';
      c.beginPath();
      c.moveTo(pL.x, yT); c.lineTo(pR.x, yT2);
      c.lineTo(pR.x, yT2 + bh); c.lineTo(pL.x, yT + bh);
      c.closePath(); c.fill();
      c.strokeStyle = 'rgba(120,130,160,0.4)';
      c.lineWidth = Math.max(1, pL.w * 0.008);
      c.beginPath(); c.moveTo(pL.x, yT + bh); c.lineTo(pR.x, yT2 + bh); c.stroke();
      c.globalAlpha = 1;
    })(rel, fade));
  }
}

/* ---------- landmarks: station, lattice tower, docks, park (deterministic/lap) ---------- */
// All landmarks sit at fixed lap-relative DIST every lap (both laps), projected
// with projectSprite like everything else (parallax-correct), depth-sorted via
// jobs. Signage is mounted on faces, never floating.
function drawStationHall(c, p, wpx, hpx, fade) {
  // train station: long facade + snow roof + mounted STATION sign + platform canopy
  c.globalAlpha = fade;
  c.fillStyle = '#3a3f4a';
  c.fillRect(p.x - wpx / 2, p.y - hpx, wpx, hpx);
  c.strokeStyle = '#14141c'; c.lineWidth = Math.max(2.5, wpx * 0.022); // chunky outline
  c.strokeRect(p.x - wpx / 2, p.y - hpx, wpx, hpx);
  c.fillStyle = '#f2f7fc'; // snow roof cap
  c.fillRect(p.x - wpx / 2 - 2, p.y - hpx - 5, wpx + 4, 6);
  // row of lit windows / doors (fixed count: anchored to the facade)
  const n = 9;
  for (let i = 0; i < n; i++) {
    const wx = p.x - wpx / 2 + (i + 0.5) * wpx / n;
    c.fillStyle = i % 3 === 2 ? '#2a2e38' : 'rgba(255,220,150,0.9)';
    const ww = Math.min(wpx / n * 0.5, 18), wh = hpx * 0.42;
    c.fillRect(wx - ww / 2, p.y - hpx * 0.62, ww, wh);
  }
  // roof sign, mounted on the facade (like other billboards)
  const spr = hSignSprite('STATION', '#53e1ff');
  const swpx = Math.min(wpx * 0.62, 190), shpx = swpx * (spr.height / spr.width);
  const was = c.imageSmoothingEnabled; c.imageSmoothingEnabled = false;
  c.drawImage(spr, p.x - swpx / 2, p.y - hpx - shpx - 9, swpx, shpx);
  c.imageSmoothingEnabled = was;
  // platform canopy toward the road: slab on posts
  const slabY = p.y - hpx * 0.55, slabH = Math.max(3, hpx * 0.05);
  c.fillStyle = '#23262f';
  c.fillRect(p.x - wpx * 0.62, slabY, wpx * 0.34, slabH);
  c.fillStyle = '#f2f7fc';
  c.fillRect(p.x - wpx * 0.62, slabY - 2, wpx * 0.34, 3);
  c.fillStyle = '#16161e';
  for (const fx of [0.08, 0.26]) {
    const px = p.x - wpx * 0.62 + wpx * 0.34 * fx;
    c.fillRect(px - 2, slabY, 4, p.y - slabY);
  }
  c.globalAlpha = 1;
}
function drawLatticeTower(c, p, hpx, fade) {
  // Skytree-like lattice tower: tapering legs + X braces + deck + spire.
  // Chunky strokes so it reads at distance (line-weight pass).
  if (hpx < 40) return;
  const wBase = p.w * 1.1, wTop = p.w * 0.22;
  const baseY = p.y, topY = p.y - hpx;
  c.globalAlpha = fade;
  c.lineCap = 'round';
  const lw = Math.max(3, p.w * 0.055);
  c.strokeStyle = '#b9c2d4'; c.lineWidth = lw; // legs
  for (const s of [-1, 1]) {
    c.beginPath();
    c.moveTo(p.x + s * wBase / 2, baseY);
    c.lineTo(p.x + s * wTop / 2, topY);
    c.stroke();
  }
  c.strokeStyle = '#98a2b6'; c.lineWidth = Math.max(1.8, lw * 0.55); // X braces
  const segs = 8;
  for (let i = 0; i < segs; i++) {
    const y0 = baseY - hpx * i / segs, y1 = baseY - hpx * (i + 1) / segs;
    const w0 = lerp(wBase, wTop, i / segs) / 2, w1 = lerp(wBase, wTop, (i + 1) / segs) / 2;
    c.beginPath();
    c.moveTo(p.x - w0, y0); c.lineTo(p.x + w1, y1);
    c.moveTo(p.x + w0, y0); c.lineTo(p.x - w1, y1);
    c.stroke();
  }
  const dy = baseY - hpx * 0.64, dw = lerp(wBase, wTop, 0.64) * 1.1; // observation deck
  c.fillStyle = '#cfd8e8';
  c.fillRect(p.x - dw / 2, dy - hpx * 0.035, dw, hpx * 0.07);
  c.fillStyle = '#8a94a8';
  c.fillRect(p.x - dw / 2, dy + hpx * 0.035, dw, 2);
  c.strokeStyle = '#b9c2d4'; c.lineWidth = Math.max(1.8, lw * 0.5); // spire
  c.beginPath(); c.moveTo(p.x, topY); c.lineTo(p.x, topY - hpx * 0.14); c.stroke();
  c.fillStyle = 'rgba(255,90,90,0.95)'; // aircraft warning light
  c.beginPath(); c.arc(p.x, topY - hpx * 0.14, Math.max(2, p.w * 0.03), 0, 6.29); c.fill();
  c.globalAlpha = 1;
}
function drawDock(c, rel, side, fade) {
  // pier over the water: plank deck from the roadside, posts into the water,
  // one moored boat bobbing alongside. Only placed where there is water.
  const p0 = projectSprite(rel, side * 1.45, 0);
  const p1 = projectSprite(rel, side * 2.9, 0);
  const deckH = Math.max(3, p0.w * 0.09);
  const dy = p0.y - deckH * 0.5;
  c.globalAlpha = fade;
  const x0 = Math.min(p0.x, p1.x), x1 = Math.max(p0.x, p1.x);
  c.fillStyle = '#6a4a2a'; // plank deck
  c.fillRect(x0, dy - deckH, x1 - x0, deckH);
  c.strokeStyle = '#3a2a16'; c.lineWidth = Math.max(1.5, deckH * 0.18);
  for (let px = x0 + 4; px < x1; px += Math.max(6, deckH * 1.4)) {
    c.beginPath(); c.moveTo(px, dy - deckH); c.lineTo(px, dy); c.stroke();
  }
  c.fillStyle = '#4a3420'; // posts down into the water
  const postD = Math.max(4, p0.w * 0.30);
  for (let i = 0; i <= 3; i++) {
    const px = x0 + (x1 - x0) * i / 3;
    c.fillRect(px - deckH * 0.22, dy - deckH, deckH * 0.44, postD);
  }
  // moored boat: hull + cabin, bobbing gently
  const bp = projectSprite(rel, side * 3.25, 0);
  const bob = Math.sin(G.time * 1.3 + rel * 0.05) * p0.w * 0.02;
  const bw = p0.w * 0.85, bh = Math.max(4, p0.w * 0.22);
  const by = bp.y + bob;
  c.fillStyle = 'rgba(0,0,0,0.25)'; // water shadow grounds the hull
  c.beginPath(); c.ellipse(by, by + bh * 0.15, bw * 0.55, bh * 0.22, 0, 0, 6.29); c.fill();
  c.fillStyle = '#7a2a2a';
  c.beginPath(); // hull (wider at top)
  c.moveTo(by - bw / 2, by - bh); c.lineTo(by + bw / 2, by - bh);
  c.lineTo(by + bw * 0.32, by); c.lineTo(by - bw * 0.32, by);
  c.closePath(); c.fill();
  c.fillStyle = '#e8e8ee';
  c.fillRect(by - bw / 2, by - bh * 1.02, bw, Math.max(1.5, bh * 0.1));
  c.fillStyle = '#2a343e'; // cabin
  c.fillRect(by - bw * 0.22, by - bh * 1.9, bw * 0.44, bh * 0.9);
  c.globalAlpha = 1;
}
function drawNeonStation(c, p, wpx, hpx, fade) {
  // night-city landmark: bright station complex with vertical neon strips on the
  // facade (part of the building, not floating signs) + mounted roof sign.
  c.globalAlpha = fade;
  c.fillStyle = '#0c0c16';
  c.fillRect(p.x - wpx / 2, p.y - hpx, wpx, hpx);
  c.strokeStyle = '#1e1e2e'; c.lineWidth = Math.max(2.5, wpx * 0.02);
  c.strokeRect(p.x - wpx / 2, p.y - hpx, wpx, hpx);
  // dense lit windows (fixed grid: anchored to the facade)
  const cols = 10, rows = 8;
  for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) {
    const v = hash01(q * 7 + r * 13 + 5);
    if (v < 0.5) {
      c.fillStyle = v < 0.3 ? 'rgba(255,205,110,0.95)' : 'rgba(160,210,255,0.9)';
      c.fillRect(p.x - wpx / 2 + (q + 0.25) * wpx / cols, p.y - hpx + (r + 0.25) * hpx / rows,
        Math.max(1.5, wpx / cols * 0.5), Math.max(1.5, hpx / rows * 0.5));
    }
  }
  // vertical neon strips fixed to the facade
  const stripCols = ['#4ae2ff', '#ff6ad5', '#ffd94a'];
  for (let i = 0; i < 3; i++) {
    const sx = p.x - wpx * 0.32 + i * wpx * 0.32;
    const sw = Math.max(2.5, wpx * 0.045);
    c.fillStyle = stripCols[i];
    c.fillRect(sx - sw / 2, p.y - hpx * 0.94, sw, hpx * 0.88);
    c.fillStyle = 'rgba(255,255,255,0.75)';
    c.fillRect(sx - sw * 0.18, p.y - hpx * 0.94, sw * 0.36, hpx * 0.88);
  }
  // mounted roof sign
  const spr = hSignSprite('NEON STATION', '#ff6ad5');
  const swpx = Math.min(wpx * 0.7, 210), shpx = swpx * (spr.height / spr.width);
  const was = c.imageSmoothingEnabled; c.imageSmoothingEnabled = false;
  c.drawImage(spr, p.x - swpx / 2, p.y - hpx - shpx - 8, swpx, shpx);
  c.imageSmoothingEnabled = was;
  c.globalAlpha = 1;
}
function parkJobs() {
  // park strip: trodden-snow paths flanking the road + big pines (no buildings here)
  const lap = Math.floor(G.playerDist / LAP_LEN);
  const p0 = lap * LAP_LEN + LAP_LEN * 0.62, p1 = lap * LAP_LEN + LAP_LEN * 0.70;
  const step = 60;
  const first = Math.max(p0, Math.ceil(G.playerDist / step) * step);
  for (let pd = first; pd < Math.min(p1, G.playerDist + 2600); pd += step) {
    const rel = pd - G.playerDist;
    if (rel < 10) continue;
    const fade = farFade(rel);
    if (fade <= 0) continue;
    for (const side of [-1, 1]) {
      pushJob(rel, ((s, ff) => (c) => {
        const pA = projectSprite(rel, s * 2.3, 0), pB = projectSprite(rel, s * 3.15, 0);
        c.globalAlpha = ff * 0.95;
        c.fillStyle = '#e6dcc2'; // trodden path on the snow
        const hgt = Math.max(2, pA.w * 0.055);
        c.fillRect(Math.min(pA.x, pB.x), pA.y - hgt, Math.abs(pB.x - pA.x), hgt);
        c.globalAlpha = 1;
      })(side, fade));
    }
  }
  // big feature pines at fixed lap-relative spots
  const spots = [[0.635, -1], [0.65, 1], [0.665, -1], [0.685, 1]];
  for (const [lr, side] of spots) {
    const td = lap * LAP_LEN + LAP_LEN * lr;
    const rel = td - G.playerDist;
    if (rel < 10 || rel > 2600) continue;
    const fade = farFade(rel);
    if (fade <= 0) continue;
    pushJob(rel, ((s, ff) => (c) => {
      const p = projectSprite(rel, s * 2.7, 0);
      const hpx = p.scale * H * Y_FACTOR * 46 * 0.052;
      if (hpx < 8) return;
      c.globalAlpha = ff;
      drawPine(c, p, hpx, true);
      c.globalAlpha = 1;
    })(side, fade));
  }
}
function landmarkJobs(env) {
  const lap = Math.floor(G.playerDist / LAP_LEN);
  const L = LAP_LEN;
  const items = [];
  if (G.track === 'mixed') {
    // station just past tunnel-1 exit, same lap-relative spot every lap
    items.push({ d: lap * L + L * 0.14, kind: 'station', side: 1 });
    // lattice tower in the mid-distance skyline
    items.push({ d: lap * L + L * 0.33, kind: 'tower', side: 1 });
    // docks flank the snow bridge — absolute DIST, lap 1 only (that's the water)
    if (lap === 0) {
      items.push({ d: 2150, kind: 'dock', side: -1 });
      items.push({ d: 2450, kind: 'dock', side: 1 });
    }
  } else {
    // night-city landmark cluster: bright station complex, clear of the bridge (42-57%)
    items.push({ d: lap * L + L * 0.70, kind: 'neonstation', side: -1 });
  }
  for (const it of items) {
    if (inTunnel(it.d)) continue;
    const rel = it.d - G.playerDist;
    if (rel < 10 || rel > 2600) continue;
    const fade = farFade(rel);
    if (fade <= 0) continue;
    if (it.kind === 'station') pushJob(rel, ((s, ff) => (c) => {
      const p = projectSprite(rel, s * 2.7, 0);
      drawStationHall(c, p, p.w * (96 / 40), p.scale * H * Y_FACTOR * 30 * 0.052, ff);
    })(it.side, fade));
    else if (it.kind === 'tower') pushJob(rel, ((s, ff) => (c) => {
      const p = projectSprite(rel, s * 3.4, 0);
      drawLatticeTower(c, p, p.scale * H * Y_FACTOR * 120 * 0.052, ff);
    })(it.side, fade));
    else if (it.kind === 'dock') pushJob(rel, ((s, ff) => (c) => {
      drawDock(c, rel, s, ff);
    })(it.side, fade));
    else if (it.kind === 'neonstation') pushJob(rel, ((s, ff) => (c) => {
      const p = projectSprite(rel, s * 2.8, 0);
      drawNeonStation(c, p, p.w * (110 / 40), p.scale * H * Y_FACTOR * 42 * 0.052, ff);
    })(it.side, fade));
  }
  if (G.track === 'mixed' && env === 'snow') parkJobs();
}

/* ---------- player car: red, cyan underglow, steering animation ---------- */
function drawPlayerCar() {
  const c = ctx;
  const wpx = Math.min(W * 0.30, 132), hpx = wpx * 0.62;
  const s = G.steerVis; // eased -1..1, 0 when released
  const x = W / 2 + s * W * 0.05;
  const y = H * 0.815;
  c.save();
  // invulnerability blink after a hit
  if (G.invulnT > 0 && Math.floor(G.time * 9) % 2 === 0) c.globalAlpha = 0.55;
  // blue underglow ring + shadow stay level with the road
  c.strokeStyle = 'rgba(83,181,249,0.85)'; c.lineWidth = Math.max(2, wpx * 0.02);
  c.beginPath(); c.ellipse(x, y + hpx * 0.34, wpx * 0.62, hpx * 0.20, 0, 0, 6.29); c.stroke();
  const gl = c.createRadialGradient(x, y + hpx * 0.3, 0, x, y + hpx * 0.3, wpx * 0.8);
  gl.addColorStop(0, 'rgba(83,181,249,0.35)'); gl.addColorStop(1, 'rgba(83,181,249,0)');
  c.fillStyle = gl;
  c.beginPath(); c.ellipse(x, y + hpx * 0.3, wpx * 0.8, hpx * 0.38, 0, 0, 6.29); c.fill();
  c.fillStyle = 'rgba(0,0,0,0.5)';
  c.beginPath(); c.ellipse(x, y + hpx * 0.36, wpx * 0.5, hpx * 0.11, 0, 0, 6.29); c.fill();
  // body group: banks into the turn and shears sideways so the steering reads
  // as a real yaw — the turning-side flank becomes visible, proportional to s
  c.save();
  c.translate(x, y);
  c.rotate(s * 0.09);
  c.transform(1, 0, s * 0.16, 1, 0, 0);
  const bw = wpx * 0.8, tw = wpx * 0.94;
  const topY = -hpx * 0.55, botY = hpx * 0.38;
  // wheels
  c.fillStyle = '#0b0b12';
  c.fillRect(-tw / 2 - wpx * 0.07, topY + hpx * 0.28, wpx * 0.1, hpx * 0.42);
  c.fillRect(tw / 2 - wpx * 0.03, topY + hpx * 0.28, wpx * 0.1, hpx * 0.42);
  // body
  c.fillStyle = '#e8332a';
  c.beginPath();
  c.moveTo(-bw / 2, topY); c.lineTo(bw / 2, topY);
  c.lineTo(tw / 2, botY); c.lineTo(-tw / 2, botY);
  c.closePath(); c.fill();
  c.fillStyle = '#ff5a4a';
  c.beginPath();
  c.moveTo(-bw / 2, topY); c.lineTo(bw / 2, topY);
  c.lineTo(bw * 0.32, topY + hpx * 0.22); c.lineTo(-bw * 0.32, topY + hpx * 0.22);
  c.closePath(); c.fill();
  // cabin
  c.fillStyle = '#101018';
  const lean = s * wpx * 0.08; // cabin shifts toward the visible flank
  c.beginPath();
  c.moveTo(-wpx * 0.24 + lean, topY + hpx * 0.3);
  c.lineTo(wpx * 0.24 + lean, topY + hpx * 0.3);
  c.lineTo(wpx * 0.3 + lean, topY + hpx * 0.58);
  c.lineTo(-wpx * 0.3 + lean, topY + hpx * 0.58);
  c.closePath(); c.fill();
  // exposed side flank: steering LEFT (s<0) shows the LEFT flank, steering
  // RIGHT shows the RIGHT flank (Craig 2026-09-17: sides were reversed).
  // A darker side face with a window strip and wheel hint, width proportional
  // to steering amount.
  if (Math.abs(s) > 0.05) {
    const dir = Math.sign(s), mag = Math.abs(s);
    const swd = mag * wpx * 0.30, ex = dir * tw / 2;
    c.fillStyle = '#a81c14';
    c.beginPath();
    c.moveTo(ex, topY + hpx * 0.12);
    c.lineTo(ex + dir * swd, topY + hpx * 0.26);
    c.lineTo(ex + dir * swd, botY - hpx * 0.02);
    c.lineTo(ex, botY);
    c.closePath(); c.fill();
    c.fillStyle = '#0e0e16';
    c.beginPath();
    c.moveTo(ex + dir * swd * 0.15, topY + hpx * 0.34);
    c.lineTo(ex + dir * swd * 0.85, topY + hpx * 0.40);
    c.lineTo(ex + dir * swd * 0.85, topY + hpx * 0.52);
    c.lineTo(ex + dir * swd * 0.15, topY + hpx * 0.48);
    c.closePath(); c.fill();
    c.fillStyle = '#0b0b12';
    c.fillRect(Math.min(ex, ex + dir * swd * 0.55), topY + hpx * 0.58, swd * 0.55, hpx * 0.28);
  }
  // spoiler
  c.fillStyle = '#0a0a14';
  c.fillRect(-wpx * 0.58, topY - hpx * 0.09, wpx * 1.16, hpx * 0.09);
  // tail lights
  c.fillStyle = '#ff2038';
  c.fillRect(-wpx * 0.4, botY - hpx * 0.13, wpx * 0.8, hpx * 0.09);
  c.fillStyle = 'rgba(255,255,255,0.55)';
  c.fillRect(-wpx * 0.4, botY - hpx * 0.13, wpx * 0.8, hpx * 0.03);
  c.restore();
  // nitro flames
  if (G.nitroOn) {
    const fl = (0.8 + rnd() * 0.9) * hpx * 1.1;
    c.fillStyle = 'rgba(83,181,249,0.9)';
    for (const fxp of [-wpx * 0.15, wpx * 0.15]) {
      c.beginPath();
      c.moveTo(x + fxp - wpx * 0.05, y + hpx * 0.38); c.lineTo(x + fxp, y + hpx * 0.38 + fl); c.lineTo(x + fxp + wpx * 0.05, y + hpx * 0.38);
      c.closePath(); c.fill();
    }
    c.fillStyle = '#fff';
    for (const fxp of [-wpx * 0.15, wpx * 0.15]) {
      c.beginPath();
      c.moveTo(x + fxp - wpx * 0.025, y + hpx * 0.38); c.lineTo(x + fxp, y + hpx * 0.38 + fl * 0.5); c.lineTo(x + fxp + wpx * 0.025, y + hpx * 0.38);
      c.closePath(); c.fill();
    }
  }
  c.restore();
}

function rivalDist(i) {
  // rivals hold a slowly-closing gap ahead of the player until their pass
  // point, then fall behind CONTINUOUSLY: a smooth drive-by from +25m ahead
  // to 60m behind over ~85m of player travel — no teleport, no jumping
  const passAt = PASS_FRAC[i] * TOTAL;
  if (G.playerDist >= passAt) {
    const over = G.playerDist - passAt;
    return G.playerDist + Math.max(-60, 25 - over);
  }
  const gap = Math.max(25, (passAt - G.playerDist) * 0.12);
  return G.playerDist + gap;
}
function rivalJobs() {
  for (let i = 0; i < G.rivals.length; i++) {
    const r = G.rivals[i];
    const rel = rivalDist(i) - G.playerDist;
    if (rel < 3 || rel > 2200) continue;
    const fade = farFade(rel);
    if (fade <= 0) continue;
    pushJob(rel, ((rr, ii) => (c) => {
      const wob = Math.sin(G.time * 0.9 + rr.wob) * 0.18;
      // while being passed, the rival eases to the side — a clean overtake read
      const pass = clamp(1 - Math.abs(rel - 12) / 45, 0, 1);
      const side = rr.x >= 0 ? 1 : -1;
      const p = projectSprite(rel, rr.x + wob + side * pass * 0.28, 0);
      const wpx = p.w * 0.26, hpx = wpx * 0.55;
      if (wpx < 4) return;
      c.globalAlpha = fade;
      c.fillStyle = 'rgba(0,0,0,0.4)';
      c.beginPath(); c.ellipse(p.x, p.y + hpx * 0.36, wpx * 0.5, hpx * 0.1, 0, 0, 6.29); c.fill();
      c.fillStyle = rr.color;
      c.beginPath();
      c.moveTo(p.x - wpx * 0.36, p.y - hpx * 0.5); c.lineTo(p.x + wpx * 0.36, p.y - hpx * 0.5);
      c.lineTo(p.x + wpx * 0.48, p.y + hpx * 0.38); c.lineTo(p.x - wpx * 0.48, p.y + hpx * 0.38);
      c.closePath(); c.fill();
      c.fillStyle = '#0e0e18';
      c.fillRect(p.x - wpx * 0.28, p.y - hpx * 0.42, wpx * 0.56, hpx * 0.3);
      c.fillStyle = '#ff2a2a';
      c.fillRect(p.x - wpx * 0.4, p.y + hpx * 0.08, wpx * 0.2, hpx * 0.1);
      c.fillRect(p.x + wpx * 0.2, p.y + hpx * 0.08, wpx * 0.2, hpx * 0.1);
      c.globalAlpha = 1;
    })(r, i));
  }
}
function playerPos() {
  let pos = 1;
  for (let i = 0; i < G.rivals.length; i++) if (rivalDist(i) > G.playerDist) pos++;
  return pos;
}

/* ---------- obstacles: traffic cars + static barriers/cones (collision) ---------- */
// Deterministic per absolute distance (hash-based, never Math.random): the same
// obstacle sits at the same DIST every run, so laps are learnable. Density is
// moderate and a full 3-lane wall is never placed — there is always a gap.
const LANES = [-0.55, 0, 0.55];
const OB_STEP = 230;      // nominal block spacing (m)
const TRAFFIC_V = 30;     // traffic cars move forward at 30 m/s (player ~61)
function obstacleBlocks(bd) {
  const out = [];
  const b = Math.round(bd / OB_STEP);
  if (bd < 350) return out; // clean start straight
  if (inTunnel(bd) || inTunnel(bd + 170) || inTunnel(bd - 170)) return out; // never in/near tunnels
  const h = hash01(b * 7.31 + (G.track === 'night' ? 3 : 11));
  if (h > 0.62) return out; // ~38% of blocks carry obstacles
  const lane = LANES[Math.floor(hash01(b * 3.7 + 5) * 3) % 3];
  const th = hash01(b * 9.17 + 1);
  const type = th < 0.45 ? 'car' : (hash01(b * 5.3 + 2) < 0.5 ? 'barrier' : 'cones');
  out.push({ d: bd, lane, type, seed: b });
  if (h < 0.22) { // second obstacle: different lane, offset distance — never a wall
    const lane2 = LANES[(LANES.indexOf(lane) + 1 + Math.floor(hash01(b * 4.9) * 2)) % 3];
    out.push({ d: bd + 95, lane: lane2, type: 'cones', seed: b + 1000 });
  }
  return out;
}
function obstacleDist(o) { return o.type === 'car' ? o.d + TRAFFIC_V * G.raceTime : o.d; }
function hitObstacle() {
  G.hearts -= 1;
  G.invulnT = 2.0; // ~2s invulnerability: one obstacle can't chain-kill
  G.hitFlash = 1;
  G.shakeT = 0.45; // short decaying camera shake
  G.speedMs *= 0.85; // knockback: brief speed dip, accel recovers it
  spawnSparks();
  AudioSys.beep(150, 0.3);
  if (G.hearts <= 0) {
    G.state = 'gameover';
    document.getElementById('gostats').textContent =
      'DIST ' + Math.round(G.playerDist) + 'M / ' + TOTAL + 'M';
    document.getElementById('gameover').classList.remove('hidden');
    AudioSys.beep(90, 0.6);
  }
}
function spawnSparks() {
  // clean debris burst at the car's nose; seeded directions so it reads the
  // same every hit — no stretched sprites, no lingering artifacts
  G.sparkSeq = (G.sparkSeq || 0) + 1;
  const nx = W / 2 + G.steerVis * W * 0.05, ny = H - Math.round(H * 0.26);
  const cols = ['#ffd94a', '#ff9a3a', '#ffffff', '#ff5a4a'];
  for (let i = 0; i < 14; i++) {
    const a = hash01(G.sparkSeq * 7 + i * 3) * Math.PI - Math.PI / 2; // upward fan
    const sp = 160 + hash01(G.sparkSeq * 13 + i * 5) * 260;
    G.sparks.push({
      x: nx + (hash01(i * 11) - 0.5) * 30, y: ny,
      vx: Math.sin(a) * sp, vy: -Math.abs(Math.cos(a)) * sp * 0.8,
      life: 1, sz: 2 + hash01(i * 17) * 3,
      col: cols[i % cols.length],
    });
  }
}
function updateSparks(dt) {
  for (let i = G.sparks.length - 1; i >= 0; i--) {
    const p = G.sparks[i];
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vy += 700 * dt; p.vx *= 0.98;
    p.life -= dt * 2.2;
    if (p.life <= 0) G.sparks.splice(i, 1);
  }
}
function drawSparks() {
  const c = ctx;
  for (const p of G.sparks) {
    c.globalAlpha = Math.max(0, p.life);
    c.fillStyle = p.col;
    c.fillRect(p.x - p.sz / 2, p.y - p.sz / 2, p.sz, p.sz);
  }
  c.globalAlpha = 1;
}
function checkObstacles() {
  if (godMode || G.invulnT > 0 || G.state !== 'racing') return;
  const b0 = Math.floor((G.playerDist - 40) / OB_STEP), b1 = Math.floor((G.playerDist + 40) / OB_STEP);
  for (let b = b0; b <= b1; b++) {
    for (const o of obstacleBlocks(b * OB_STEP)) {
      const od = obstacleDist(o);
      if (Math.abs(od - G.playerDist) < 10 && Math.abs(o.lane - G.playerX) < 0.38) {
        hitObstacle();
        return;
      }
    }
  }
}
const TRAFFIC_COLS = ['#8a8f9e', '#5a7a9e', '#9e7a5a', '#6a9e7a', '#7a6a9e'];
function drawTrafficCar(o, rel, fade) {
  return (c) => {
    const wob = Math.sin(G.time * 0.7 + o.seed) * 0.05;
    const p = projectSprite(rel, o.lane + wob, 0);
    const wpx = p.w * 0.30, hpx = wpx * 0.55;
    if (wpx < 4) return;
    c.globalAlpha = fade;
    const col = TRAFFIC_COLS[Math.abs(o.seed) % TRAFFIC_COLS.length];
    c.fillStyle = 'rgba(0,0,0,0.4)'; // shadow
    c.beginPath(); c.ellipse(p.x, p.y + hpx * 0.36, wpx * 0.5, hpx * 0.1, 0, 0, 6.29); c.fill();
    c.fillStyle = col; // body
    c.beginPath();
    c.moveTo(p.x - wpx * 0.36, p.y - hpx * 0.5); c.lineTo(p.x + wpx * 0.36, p.y - hpx * 0.5);
    c.lineTo(p.x + wpx * 0.48, p.y + hpx * 0.38); c.lineTo(p.x - wpx * 0.48, p.y + hpx * 0.38);
    c.closePath(); c.fill();
    c.strokeStyle = '#101018'; c.lineWidth = Math.max(1.5, wpx * 0.035); // chunky outline
    c.stroke();
    c.fillStyle = '#14141e'; // cabin
    c.fillRect(p.x - wpx * 0.28, p.y - hpx * 0.42, wpx * 0.56, hpx * 0.3);
    c.fillStyle = '#ff2a2a'; // brake lights (facing the player)
    c.fillRect(p.x - wpx * 0.4, p.y + hpx * 0.08, wpx * 0.2, hpx * 0.1);
    c.fillRect(p.x + wpx * 0.2, p.y + hpx * 0.08, wpx * 0.2, hpx * 0.1);
    c.globalAlpha = 1;
  };
}
function drawBarrier(o, rel, fade) {
  return (c) => {
    const p = projectSprite(rel, o.lane, 0);
    const wpx = p.w * 0.52, hpx = p.scale * H * Y_FACTOR * 0.16;
    if (wpx < 6) return;
    c.globalAlpha = fade;
    const bw = Math.max(2.5, wpx * 0.06); // chunky posts
    c.fillStyle = '#2a2a33';
    c.fillRect(p.x - wpx / 2 - bw / 2, p.y - hpx, bw, hpx);
    c.fillRect(p.x + wpx / 2 - bw / 2, p.y - hpx, bw, hpx);
    // striped board: red/white diagonal bands
    const bh = Math.max(3, hpx * 0.30), by = p.y - hpx;
    c.save();
    c.beginPath(); c.rect(p.x - wpx / 2, by, wpx, bh); c.clip();
    c.fillStyle = '#e8332a';
    c.fillRect(p.x - wpx / 2, by, wpx, bh);
    c.fillStyle = '#f2f2f5';
    const sw = Math.max(3, wpx * 0.12);
    for (let sx = -bh; sx < wpx + bh; sx += sw * 2) {
      c.beginPath();
      c.moveTo(p.x - wpx / 2 + sx, by + bh); c.lineTo(p.x - wpx / 2 + sx + bh, by);
      c.lineTo(p.x - wpx / 2 + sx + bh + sw, by); c.lineTo(p.x - wpx / 2 + sx + sw, by + bh);
      c.closePath(); c.fill();
    }
    c.restore();
    c.strokeStyle = '#101018'; c.lineWidth = Math.max(1.5, wpx * 0.02);
    c.strokeRect(p.x - wpx / 2, by, wpx, bh);
    c.globalAlpha = 1;
  };
}
function drawCones(o, rel, fade) {
  return (c) => {
    const p = projectSprite(rel, o.lane, 0);
    const hpx = p.scale * H * Y_FACTOR * 0.14;
    if (hpx < 4) return;
    c.globalAlpha = fade;
    for (let i = -1; i <= 1; i++) {
      const cx = p.x + i * hpx * 0.9 + (hash01(o.seed + i) - 0.5) * hpx * 0.3;
      const cw = hpx * 0.42;
      c.fillStyle = '#ff6a1a'; // cone body
      c.beginPath();
      c.moveTo(cx - cw / 2, p.y); c.lineTo(cx + cw / 2, p.y); c.lineTo(cx, p.y - hpx);
      c.closePath(); c.fill();
      c.strokeStyle = '#7a2a00'; c.lineWidth = Math.max(1, hpx * 0.03);
      c.stroke();
      c.fillStyle = '#f2f2f5'; // reflective band
      c.fillRect(cx - cw * 0.28, p.y - hpx * 0.55, cw * 0.56, hpx * 0.14);
      c.fillStyle = '#8a3a10'; // base
      c.fillRect(cx - cw * 0.62, p.y - hpx * 0.06, cw * 1.24, hpx * 0.06);
    }
    c.globalAlpha = 1;
  };
}
function obstacleJobs() {
  const b0 = Math.floor(G.playerDist / OB_STEP), b1 = Math.floor((G.playerDist + 2700) / OB_STEP);
  for (let b = b0; b <= b1; b++) {
    for (const o of obstacleBlocks(b * OB_STEP)) {
      const rel = obstacleDist(o) - G.playerDist;
      if (rel < 8 || rel > 2600) continue;
      // near fade: obstacles about to pass under the camera shrink out instead
      // of looming as giant sprites (collision still uses distance, not visuals)
      const nearFade = clamp((rel - 10) / 25, 0, 1);
      const fade = farFade(rel) * nearFade;
      if (fade <= 0) continue;
      if (o.type === 'car') pushJob(rel, drawTrafficCar(o, rel, fade));
      else if (o.type === 'barrier') pushJob(rel, drawBarrier(o, rel, fade));
      else pushJob(rel, drawCones(o, rel, fade));
    }
  }
}

/* ---------- nitro bottles: pickups that fill the nitro bar ---------- */
// Deterministic per absolute distance (hash-based, like obstacles): the same
// bottle sits at the same DIST every run. +25 nitro per bottle, 4 bottles =
// a full bar. The bar NEVER fills any other way (no self-increment).
const NITRO_STEP = 360;
function nitroBlocks(bd) {
  const out = [];
  const b = Math.round(bd / NITRO_STEP);
  if (bd < 500) return out; // clean start straight
  if (inTunnel(bd) || inTunnel(bd + 170) || inTunnel(bd - 170)) return out; // never in/near tunnels
  if (inBridge(bd)) return out; // never on the bridge
  const lane = LANES[Math.floor(hash01(b * 11.3 + 4) * 3) % 3];
  out.push({ d: bd, lane, b });
  return out;
}
function spawnEdgeSparks(side) {
  // hot scrape sparks flung outward from the car flank kissing the road edge
  const wpx = Math.min(W * 0.30, 132);
  const nx = W / 2 + side * wpx * 0.47, ny = H - Math.round(H * 0.24);
  G.sparkSeq = (G.sparkSeq || 0) + 1;
  const cols = ['#ffd94a', '#ffffff', '#ff9a3a'];
  for (let i = 0; i < 5; i++) {
    const a = hash01(G.sparkSeq * 3 + i * 7) * 1.2 + 0.2;
    const sp = 120 + hash01(G.sparkSeq * 5 + i * 11) * 220;
    G.sparks.push({
      x: nx, y: ny + hash01(i * 13) * 30,
      vx: side * Math.cos(a) * sp * 0.9, vy: -Math.abs(Math.sin(a)) * sp * 0.7,
      life: 0.8, sz: 2 + hash01(i * 17) * 2.5, col: cols[i % cols.length],
    });
  }
}
function spawnPickupSparks() {
  // small cyan flash at the car's nose when a nitro bottle is collected
  G.sparkSeq = (G.sparkSeq || 0) + 1;
  const nx = W / 2 + G.steerVis * W * 0.05, ny = H - Math.round(H * 0.26);
  for (let i = 0; i < 8; i++) {
    const a = hash01(G.sparkSeq * 7 + i * 3) * Math.PI * 2;
    const sp = 80 + hash01(G.sparkSeq * 13 + i * 5) * 140;
    G.sparks.push({
      x: nx, y: ny,
      vx: Math.sin(a) * sp, vy: -Math.abs(Math.cos(a)) * sp * 0.9,
      life: 0.9, sz: 2 + hash01(i * 17) * 2, col: '#4ae2ff',
    });
  }
}
function checkNitro() {
  if (G.state !== 'racing' || !G.nitroTaken) return;
  const b0 = Math.floor((G.playerDist - 30) / NITRO_STEP), b1 = Math.floor((G.playerDist + 30) / NITRO_STEP);
  for (let b = b0; b <= b1; b++) {
    for (const o of nitroBlocks(b * NITRO_STEP)) {
      if (G.nitroTaken.has(o.b)) continue;
      if (Math.abs(o.d - G.playerDist) < 14 && Math.abs(o.lane - G.playerX) < 0.34) {
        G.nitroTaken.add(o.b);
        G.nitro = Math.min(100, G.nitro + 25);
        AudioSys.beep(1200, 0.12);
        spawnPickupSparks();
      }
    }
  }
}
function fireNitro() {
  // manual fire from the NITRO button: only when the bar is full, never automatic
  if (G.state !== 'racing' || G.nitroOn || G.nitro < 100) return;
  G.nitroOn = true; G.nitroT = 3.2;
  AudioSys.beep(990, 0.2);
}
function drawNitroBottle(o, rel, fade) {
  return (c) => {
    const p = projectSprite(rel, o.lane, 0);
    const hpx = p.scale * H * Y_FACTOR * 0.22;
    if (hpx < 5) return;
    const bob = Math.sin(G.time * 5 + o.b) * hpx * 0.06;
    c.globalAlpha = fade;
    // glow halo
    const gr = hpx * 1.1;
    const g = c.createRadialGradient(p.x, p.y - hpx / 2 + bob, 0, p.x, p.y - hpx / 2 + bob, gr);
    g.addColorStop(0, 'rgba(74,226,255,0.55)'); g.addColorStop(1, 'rgba(74,226,255,0)');
    c.fillStyle = g;
    c.beginPath(); c.arc(p.x, p.y - hpx / 2 + bob, gr, 0, 6.29); c.fill();
    // bottle body: chunky cyan canister with a darker cap
    const bw = Math.max(3, hpx * 0.34);
    c.fillStyle = '#1899c9';
    c.fillRect(p.x - bw / 2, p.y - hpx + bob, bw, hpx * 0.82);
    c.fillStyle = '#4ae2ff';
    c.fillRect(p.x - bw / 2, p.y - hpx + bob, bw * 0.35, hpx * 0.82); // highlight
    c.fillStyle = '#0e2a3a';
    c.fillRect(p.x - bw * 0.28, p.y - hpx - hpx * 0.16 + bob, bw * 0.56, hpx * 0.16); // cap
    c.strokeStyle = 'rgba(230,250,255,0.9)'; c.lineWidth = Math.max(1.5, bw * 0.08);
    c.strokeRect(p.x - bw / 2, p.y - hpx + bob, bw, hpx * 0.82);
    c.globalAlpha = 1;
  };
}
function nitroJobs() {
  const b0 = Math.floor(G.playerDist / NITRO_STEP), b1 = Math.floor((G.playerDist + 2700) / NITRO_STEP);
  for (let b = b0; b <= b1; b++) {
    for (const o of nitroBlocks(b * NITRO_STEP)) {
      if (G.nitroTaken && G.nitroTaken.has(o.b)) continue;
      const rel = o.d - G.playerDist;
      if (rel < 8 || rel > 2600) continue;
      const nearFade = clamp((rel - 10) / 25, 0, 1);
      const fade = farFade(rel) * nearFade;
      if (fade <= 0) continue;
      pushJob(rel, drawNitroBottle(o, rel, fade));
    }
  }
}

/* ---------- screen-space weather/fx: snowfall + fireworks ---------- */
function drawSkyFX(env) {
  const c = ctx;
  // snowfall in the snow zone; light flakes inside the MIXED tunnels only —
  // the night-track tunnel is an enclosed canopy, no weather inside
  if (env === 'snow' || (env === 'tunnel' && G.track === 'mixed')) {
    const want = env === 'snow' ? 90 : 40; // lighter fall inside the tunnel
    if (!G.flakes || G.flakes.length !== want) {
      G.flakes = [];
      for (let i = 0; i < want; i++)
        G.flakes.push({ x: rnd() * W, y: rnd() * H, s: 1 + rnd() * 2.5, v: 40 + rnd() * 90, ph: rnd() * 6.28 });
    }
    c.fillStyle = 'rgba(255,255,255,0.9)';
    for (const f of G.flakes) {
      f.y += f.v * STEP; f.x += Math.sin(G.time * 2 + f.ph) * 20 * STEP;
      if (f.y > H) { f.y = -4; f.x = rnd() * W; }
      if (f.x < -4) f.x = W + 4; else if (f.x > W + 4) f.x = -4;
      c.fillRect(f.x, f.y, f.s, f.s);
    }
  } else G.flakes = null;
  if (env === 'tunnel' && G.track === 'mixed') {
    // big sweeping firework arcs across the dark sky (like the v70 tunnels)
    if (!G.arcs) {
      G.arcs = [];
      const cols = ['#ffd94a', '#4ae2ff', '#ff6ad5'];
      for (let i = 0; i < 3; i++)
        G.arcs.push({ col: cols[i], ph: rnd() * 6.28, sp: 0.25 + rnd() * 0.3, wob: rnd() * 6.28 });
    }
    for (const a of G.arcs) {
      const drift = Math.sin(G.time * a.sp + a.ph) * W * 0.35;
      const lift = Math.sin(G.time * a.sp * 0.7 + a.wob) * HORIZON * 0.25;
      const alpha = 0.55 + 0.35 * Math.sin(G.time * 1.3 + a.ph);
      c.strokeStyle = a.col;
      c.globalAlpha = Math.max(0.15, alpha) * 0.35;
      c.lineWidth = Math.max(6, W * 0.02);
      c.beginPath();
      c.moveTo(-W * 0.1, HORIZON * 0.95);
      c.quadraticCurveTo(W * 0.5 + drift, -HORIZON * 0.5 + lift, W * 1.1, HORIZON * 0.75);
      c.stroke();
      c.globalAlpha = Math.max(0.15, alpha);
      c.lineWidth = Math.max(2, W * 0.007);
      c.beginPath();
      c.moveTo(-W * 0.1, HORIZON * 0.95);
      c.quadraticCurveTo(W * 0.5 + drift, -HORIZON * 0.5 + lift, W * 1.1, HORIZON * 0.75);
      c.stroke();
      c.globalAlpha = 1;
    }
    // big bloom bursts, larger and faster than the old open-sky ones
    if (!G.fworks) G.fworks = [];
    if (!G.fworkT || G.fworkT <= 0) {
      G.fworkT = 0.5 + rnd() * 0.6;
      const bx = W * (0.15 + rnd() * 0.7), by = HORIZON * (0.1 + rnd() * 0.45);
      const cols = ['#ff5a5a', '#ffd94a', '#5ad9ff', '#b45aff', '#7dff8a'];
      const col = cols[Math.floor(rnd() * cols.length)];
      const parts = [];
      const n = 80 + Math.floor(rnd() * 40);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * 6.283 + rnd() * 0.3;
        const sp = 150 + rnd() * 250;
        parts.push({ x: bx, y: by, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, sz: 3 + rnd() * 2.5 });
      }
      G.fworks.push({ parts, col, flash: 1, fx: bx, fy: by });
    } else G.fworkT -= STEP;
    for (let bi = G.fworks.length - 1; bi >= 0; bi--) {
      const bw = G.fworks[bi];
      let alive = false;
      // core flash
      if (bw.flash > 0) {
        c.globalAlpha = bw.flash * 0.8;
        c.fillStyle = '#ffffff';
        c.beginPath(); c.arc(bw.fx, bw.fy, 10 + (1 - bw.flash) * 40, 0, 6.29); c.fill();
        bw.flash -= STEP * 2.2;
        alive = true;
      }
      c.fillStyle = bw.col;
      for (const p of bw.parts) {
        if (p.life <= 0) continue;
        alive = true;
        p.x += p.vx * STEP; p.y += p.vy * STEP;
        p.vx *= 0.985; p.vy = p.vy * 0.985 + 30 * STEP;
        p.life -= STEP * 0.7;
        c.globalAlpha = Math.max(0, p.life);
        c.fillRect(p.x, p.y, p.sz, p.sz);
      }
      c.globalAlpha = 1;
      if (!alive) G.fworks.splice(bi, 1);
    }
  } else { G.fworks = null; G.fworkT = 0; G.arcs = null; }
}

/* ---------- HUD (canvas pixel font, matches Pocket layout) ---------- */
function drawHUD() {
  const c = ctx;
  const kmh = Math.round(G.speedMs * 3.6);
  const distPct = clamp(Math.floor(G.playerDist / TOTAL * 100), 0, 100);
  const lap = clamp(Math.floor(G.playerDist / LAP_LEN) + 1, 1, LAPS);
  const pos = playerPos();
  const top = 14;
  const big = Math.max(3, Math.round(W / 105)); // speed digits ~4px font at 412w
  // left: speed
  pxText(c, String(kmh), 14, top, big, '#ffffff', 'left');
  pxText(c, 'KM/H', 16, top + big * 7 + 8, 2, '#9aa0b4', 'left');
  // center: dist %, DIST, hearts
  const midBig = 3;
  pxText(c, distPct + '%', W / 2, top, midBig, '#ffffff', 'center');
  pxText(c, 'DIST', W / 2, top + midBig * 7 + 6, 2, '#9aa0b4', 'center');
  const hp = 2;
  const hw = 7 * hp, gapH = hp * 1.2;
  let hx = W / 2 - (5 * hw + 4 * gapH) / 2;
  const hy = top + midBig * 7 + 6 + 2 * 7 + 10;
  for (let i = 0; i < 5; i++) {
    drawHeart(c, hx, hy, hp, i < G.hearts ? '#ff2a4a' : '#3a2028');
    hx += hw + gapH;
  }
  // right: LAP + POS (yellow), small pixel text
  pxText(c, 'LAP ' + lap + '/' + LAPS, W - 14, top, 2, '#ffdd46', 'right');
  pxText(c, 'POS ' + pos + '/5', W - 14, top + 2 * 7 + 8, 2, '#ffdd46', 'right');
  // bottom: NITRO label + bar + steer hint
  const by = H - Math.round(H * 0.075);
  pxText(c, 'NITRO', 16, by - 26, 2, '#53e1ff', 'left');
  const barW = Math.round(W * 0.30), barH = 12;
  const barX = 16, barY = by - 8;
  c.fillStyle = 'rgba(10,14,24,0.85)';
  c.fillRect(barX, barY, barW, barH);
  c.strokeStyle = '#53e1ff'; c.lineWidth = 2;
  c.strokeRect(barX, barY, barW, barH);
  c.fillStyle = '#53e1ff';
  c.fillRect(barX + 2, barY + 2, (barW - 4) * clamp(G.nitro / 100, 0, 1), barH - 4);
  pxText(c, 'HOLD LEFT / RIGHT TO STEER', W / 2, by - 26, 2, '#e8ecf5', 'center');
  // countdown
  if (G.state === 'countdown') {
    const n = Math.floor(G.cdT / 1.0);
    const cp = Math.max(10, Math.round(W / 22));
    if (n < 3) pxText(c, String(3 - n), W / 2, H * 0.36, cp, '#39ff6a', 'center');
    else if (n === 3) pxText(c, 'GO!', W / 2, H * 0.36, cp, '#39ff6a', 'center');
  }
}

/* ---------- update ---------- */
const STEP = 1 / 60;
function update(dt) {
  G.time += dt;
  if (G.state === 'title') {
    G.playerDist += 30 * dt; G.speedMs = 30;
    G.skyX = Math.sin(G.time * 0.1) * 0.3;
    return;
  }
  if (G.state === 'countdown') {
    G.cdT += dt;
    const n = Math.floor(G.cdT / 1.0);
    if (n !== G.cdStep) {
      G.cdStep = n;
      if (n < 3) AudioSys.beep(440, 0.12);
      else if (n === 3) AudioSys.beep(880, 0.3);
      else { G.state = 'racing'; }
    }
    return;
  }
  if (G.state !== 'racing') return;
  G.raceTime += dt;
  // steering
  G.steerVis += ((G.inputSteer !== 0 ? G.inputSteer : 0) - G.steerVis) * Math.min(1, 10 * dt);
  const inLap = G.playerDist % LAP_LEN;
  const segNow = TRACK[Math.floor(inLap / SEG_LEN) % NSEG];
  const steerVel = G.inputSteer * 1.6 - segNow.curve * clamp(G.speedMs / TOP_MS, 0, 1.2) * 0.35;
  G.playerX += steerVel * dt;
  // road-edge scrape: the car body may never leave the road. Clamp at EDGE_MAX
  // (edge minus half the car width); grinding the edge — steering into it or
  // being pinned against it by a curve — throws sparks, slows the car, and
  // rattles the camera (Craig 2026-09-17: edge kisses did nothing and the body
  // floated outside the road).
  if (Math.abs(G.playerX) >= EDGE_MAX) {
    G.playerX = Math.sign(G.playerX) * EDGE_MAX;
    const outward = Math.sign(steerVel) === Math.sign(G.playerX) && Math.abs(steerVel) > 0.02;
    if (outward) {
      G.scrapeT = 0.25;
      spawnEdgeSparks(Math.sign(G.playerX));
      G.shakeT = Math.max(G.shakeT, 0.12);
    }
  }
  if (G.scrapeT > 0) G.scrapeT -= dt;
  // speed (base 66 m/s = 238 km/h)
  const scrape = G.scrapeT > 0;
  const target = G.nitroOn ? NITRO_MS : scrape ? TOP_MS * 0.72 : TOP_MS;
  const accel = G.nitroOn ? 60 : 26;
  if (G.speedMs < target) G.speedMs = Math.min(target, G.speedMs + accel * dt);
  else G.speedMs = Math.max(target, G.speedMs - 40 * dt);
  // nitro: MANUAL fire only (NITRO button). The bar fills from nitro bottles
  // picked up on the road — never self-increments, never auto-fires.
  if (G.nitroOn) {
    G.nitroT -= dt; G.nitro = Math.max(0, G.nitro - 30 * dt);
    if (G.nitroT <= 0 || G.nitro <= 0) G.nitroOn = false;
  }
  checkNitro(); // bottle pickups
  G.playerDist += G.speedMs * dt;
  G.skyX += segNow.curve * dt * 0.02;
  // collision: costs 1 heart, ~2s invulnerability so hits can't chain
  if (G.invulnT > 0) G.invulnT -= dt;
  if (G.hitFlash > 0) G.hitFlash = Math.max(0, G.hitFlash - dt * 1.6);
  checkObstacles();
  if (G.shakeT > 0) G.shakeT = Math.max(0, G.shakeT - dt);
  updateSparks(dt);
  AudioSys.engine(clamp(G.speedMs / TOP_MS, 0, 1.3), G.nitroOn);
  if (G.playerDist >= TOTAL) {
    G.state = 'finished';
    document.getElementById('finish').classList.remove('hidden');
    document.getElementById('finishpos').textContent = playerPos() + OrdS(playerPos());
    document.getElementById('finishstats').innerHTML =
      'TIME ' + fmtTime(Math.floor(G.raceTime * 1000)) + '<br>TOP SPEED ' + Math.round(NITRO_KMH) + ' KM/H';
  }
}
function OrdS(n) { return n === 1 ? 'ST' : n === 2 ? 'ND' : n === 3 ? 'RD' : 'TH'; }
function fmtTime(ms) {
  const m = Math.floor(ms / 60000), s = Math.floor(ms % 60000 / 1000), o = Math.floor(ms % 1000);
  return m + ':' + String(s).padStart(2, '0') + '.' + String(o).padStart(3, '0');
}

/* ---------- input ---------- */
function bindInput() {
  // manual NITRO button (shown during races; glows when the bar is full)
  const nbtn = document.getElementById('nitrobtn');
  const fire = (e) => { if (e) e.preventDefault(); AudioSys.init(); fireNitro(); };
  nbtn.addEventListener('touchstart', fire, { passive: false });
  nbtn.addEventListener('mousedown', fire);
  const press = (e) => {
    AudioSys.init();
    if (G.state !== 'racing') return;
    let left = false, right = false;
    const touches = e.touches ? Array.from(e.touches) : [e];
    for (const t of touches) { if (t.clientX < window.innerWidth / 2) left = true; else right = true; }
    G.inputSteer = (left && right) ? 0 : left ? -1 : right ? 1 : 0;
  };
  const release = () => { if (G.state === 'racing') G.inputSteer = 0; };
  canvas.addEventListener('touchstart', (e) => { e.preventDefault(); press(e); }, { passive: false });
  canvas.addEventListener('touchmove', (e) => { e.preventDefault(); press(e); }, { passive: false });
  canvas.addEventListener('touchend', release);
  canvas.addEventListener('touchcancel', release);
  canvas.addEventListener('mousedown', press);
  window.addEventListener('mouseup', release);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') G.inputSteer = -1;
    if (e.key === 'ArrowRight') G.inputSteer = 1;
    if (e.key === 'Enter' && (G.state === 'title' || G.state === 'gameover')) startRace();
  });
  window.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowLeft' && G.inputSteer < 0) G.inputSteer = 0;
    if (e.key === 'ArrowRight' && G.inputSteer > 0) G.inputSteer = 0;
  });
}

/* ---------- title / boot ---------- */
function startRace() {
  AudioSys.init();
  resetRace();
  document.getElementById('title').classList.add('hidden');
  document.getElementById('finish').classList.add('hidden');
  document.getElementById('gameover').classList.add('hidden');
  G.state = 'countdown';
}
let lastT = performance.now(), acc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - lastT) / 1000;
  lastT = now;
  if (dt > 0.25) dt = 0.25;
  if (document.visibilityState !== 'visible') return;
  acc += dt;
  let steps = 0;
  while (acc >= STEP && steps < 4) { update(STEP); acc -= STEP; steps++; }
  if (steps === 4) acc = 0;
  render();
}
function render() {
  const env = getEnv(G.playerDist);
  // collision camera shake: short decaying oscillation applied to the world
  // (not the HUD or the player's car)
  let shX = 0, shY = 0;
  if (G.shakeT > 0) {
    const k = G.shakeT / 0.45;
    shX = Math.sin(G.time * 75) * 10 * k;
    shY = Math.cos(G.time * 58) * 6 * k;
  }
  ctx.save();
  ctx.translate(shX, shY);
  projectFrame();
  drawSky(env);
  drawRoad(env);
  ctx.restore();
  gantryJob();
  crossingJob();
  buildingJobs(env);
  treeJobs(env);
  toriiJobs(env);
  poleJobs(env);
  lampJobs(env);
  crowdJobs(env);
  bridgeJobs();
  tunnelJobs(env);
  landmarkJobs(env);
  rivalJobs();
  obstacleJobs();
  nitroJobs();
  ctx.save();
  ctx.translate(shX, shY);
  runJobs();
  ctx.restore();
  drawPlayerCar();
  drawSparks();
  // red hit vignette: clean edge glow instead of a flat full-screen red fill
  if (G.hitFlash > 0) {
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35,
      W / 2, H / 2, Math.max(W, H) * 0.75);
    g.addColorStop(0, 'rgba(255,30,50,0)');
    g.addColorStop(1, 'rgba(255,30,50,' + (G.hitFlash * 0.55).toFixed(3) + ')');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  drawSkyFX(env); // snowfall / tunnel firework arcs + bursts
  drawHUD();
  // nitro button: visible only while racing; glows when the bar is full
  const nb = document.getElementById('nitrobtn');
  if (nb) {
    const show = G.state === 'racing';
    nb.style.display = show ? 'block' : 'none';
    nb.classList.toggle('ready', show && G.nitro >= 100 && !G.nitroOn);
  }
  if (G.state === 'title') {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(0,0,0,0.25)'); g.addColorStop(0.5, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
}
resize();
bindInput();
document.getElementById('startbtn').onclick = startRace;
document.getElementById('startbtn2').onclick = startRace;
document.getElementById('startbtn3').onclick = startRace;
/* ---------- dev log: same changelog data as CHANGELOG.md ---------- */
function esc(s) {
  return String(s).replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
}
function buildDevLog() {
  const dv = document.getElementById('devlog');
  const entries = (typeof window !== 'undefined' && window.TD_CHANGELOG && window.TD_CHANGELOG.length)
    ? window.TD_CHANGELOG : [];
  let html = '<div class="dhead">DEV LOG</div><div class="dsub">running changelog — newest first. Same data as CHANGELOG.md. All art is code-generated.</div>';
  if (!entries.length) html += '<div class="dentry"><div class="dt">No changelog data loaded.</div></div>';
  for (const e of entries) {
    html += '<div class="dentry"><div class="dv">' + esc(e.version) + ' — ' + esc(e.date) + '</div><div class="dt">' + esc(e.title) + '</div>';
    const sec = (name, items) => items && items.length
      ? '<div class="dsec">' + name + '</div><ul>' + items.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '';
    html += sec('BUG FIXES', e.fixes) + sec('NEW FEATURES', e.features) + sec('BLOCKERS', e.blockers);
    if (e.shots && e.shots.length)
      html += '<div class="dsec">EVIDENCE</div><div class="dshots">' + e.shots.map((s) =>
        '<figure><img src="' + s.data + '"><figcaption>' + esc(s.cap) + '</figcaption></figure>').join('') + '</div>';
    html += '</div>';
  }
  html += '<button id="devclose">CLOSE</button>';
  dv.innerHTML = html;
}
if (HARNESS) {
  window.__tdReset = () => {
    G.time = 0; G.skyX = 0; G.shakeT = 0; G.sparks = []; G.sparkSeq = 0;
    resetRace();
    G.state = 'countdown';
    document.getElementById('title').classList.add('hidden');
    document.getElementById('finish').classList.add('hidden');
    document.getElementById('gameover').classList.add('hidden');
    document.getElementById('devlog').classList.add('hidden');
  };
  window.__tdSetTrack = (t) => setTrack(t);
  window.__tdGod = (on) => { godMode = !!on; };
  window.__tdSetX = (x) => { G.playerX = clamp(x, -EDGE_MAX, EDGE_MAX); };
  window.__tdSetHearts = (n) => { G.hearts = n; };
  window.__tdSteer = (v) => { G.inputSteer = v; };
  window.__tdSetNitro = (n) => { G.nitro = n; if (n < 100) G.nitroOn = false; };
  window.__tdSparks = () => G.sparks.length;
  window.__tdFireNitro = () => { fireNitro(); return G.nitroOn; };
  window.__tdBottles = () => {
    const out = [];
    const b0 = Math.floor((G.playerDist - 60) / NITRO_STEP), b1 = Math.floor((G.playerDist + 2000) / NITRO_STEP);
    for (let b = b0; b <= b1; b++) for (const o of nitroBlocks(b * NITRO_STEP)) {
      if (o.d > G.playerDist - 60) out.push({ d: Math.round(o.d), lane: o.lane, taken: !!(G.nitroTaken && G.nitroTaken.has(o.b)) });
    }
    return JSON.stringify(out);
  };
  window.__tdObstacles = () => {
    const out = [];
    const b0 = Math.floor((G.playerDist - 60) / OB_STEP), b1 = Math.floor((G.playerDist + 500) / OB_STEP);
    for (let b = b0; b <= b1; b++) for (const o of obstacleBlocks(b * OB_STEP)) {
      const od = obstacleDist(o);
      if (od > G.playerDist - 60) out.push({ d: Math.round(od), lane: o.lane, type: o.type });
    }
    return JSON.stringify(out);
  };
  window.__tdState = () => JSON.stringify({
    dist: Math.round(G.playerDist), state: G.state,
    speed: Math.round(G.speedMs * 3.6), lap: Math.floor(G.playerDist / LAP_LEN),
    inBridge: inBridge(G.playerDist),
    hearts: G.hearts, invuln: +G.invulnT.toFixed(2), px: +G.playerX.toFixed(2),
    nitro: Math.round(G.nitro), nitroOn: G.nitroOn, scrape: +G.scrapeT.toFixed(2),
  });
  window.__tdJump = (t) => {
    const steps = Math.round(t / STEP);
    for (let i = 0; i < steps; i++) update(STEP);
    render();
  };
  window.__tdReset();
} else {
  buildTitleScreen();
  document.getElementById('devbtn').onclick = () => {
    buildDevLog();
    document.getElementById('title').classList.add('hidden');
    document.getElementById('devlog').classList.remove('hidden');
    AudioSys.init();
  };
  document.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'devclose') {
      document.getElementById('devlog').classList.add('hidden');
      document.getElementById('title').classList.remove('hidden');
    }
  });
}
function buildTitleScreen() {
  const carOpts = document.getElementById('caropts');
  carOpts.innerHTML = '';
  ['RED FALCON', 'NEON VIPER'].forEach((nm, i) => {
    const d = document.createElement('div');
    d.className = 'opt' + (i === 0 ? ' sel' : '');
    d.textContent = nm;
    d.onclick = () => {
      [...carOpts.children].forEach(x => x.classList.remove('sel'));
      d.classList.add('sel'); AudioSys.init(); AudioSys.beep(520, 0.08);
    };
    carOpts.appendChild(d);
  });
  const trackOpts = document.getElementById('trackopts');
  trackOpts.innerHTML = '';
  [['night', 'NEON NIGHT', 'city neon \u2022 2 laps'], ['mixed', 'SNOW & SUN', 'snow \u2022 firework tunnels \u2022 2 laps']].forEach(([val, nm, sub], i) => {
    const d = document.createElement('div');
    d.className = 'opt' + (i === 0 ? ' sel' : '');
    d.innerHTML = nm + '<small>' + sub + '</small>';
    d.onclick = () => {
      [...trackOpts.children].forEach(x => x.classList.remove('sel'));
      d.classList.add('sel'); setTrack(val); AudioSys.init(); AudioSys.beep(520, 0.08);
      document.querySelector('#title h2').textContent = val === 'night' ? 'NEON CITY \u2022 2 LAPS' : 'SNOW & SUN \u2022 2 LAPS';
    };
    trackOpts.appendChild(d);
  });
}
requestAnimationFrame(frame);
