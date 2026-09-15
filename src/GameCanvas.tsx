import { useEffect, useRef, useState, useCallback } from 'react';
import { CONFIG, CARS } from './config';
import { PIXEL_FONT, formatTime, posString } from './track';
import { getSceneConfig, SCENE_META, SCENES } from './scenes';
import {
  newGame, startRace, resetTitleDemo, setCar, update, getHud,
  DEFAULT_SETTINGS, Game, HudState, Settings,
} from './game';
import { render } from './render';
import * as audio from './audio';
import { haptic } from './haptics';

const W = 480;
const H = 720;

export default function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const inputRef = useRef({ steer: 0 as -1 | 0 | 1, nitro: false });
  const keysRef = useRef({ left: false, right: false });
  const touchSteerRef = useRef<0 | -1 | 1>(0);

  const [hud, setHud] = useState<HudState | null>(null);
  const [showCarSelect, setShowCarSelect] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showDev, setShowDev] = useState(false);
  const [carIndex, setCarIndex] = useState(0);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  const drainEvents = useCallback((g: Game) => {
    for (const e of g.events) {
      switch (e) {
        case 'countTick': audio.beep(440, 0.12); haptic('countdown'); break;
        case 'go': audio.beep(880, 0.3); haptic('go'); break;
        case 'finish': audio.beep(880, 0.45); haptic('heavy'); break;
        case 'thud': audio.thud(); haptic('heavy'); break;
        case 'whoosh': audio.whoosh(); haptic('light'); break;
        case 'nitro': audio.whoosh(); haptic('medium'); break;
        case 'scrape': audio.scrape(); haptic('light'); break;
      }
    }
    g.events.length = 0;
  }, []);

  // main loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const g = newGame(settings, carIndex);
    gameRef.current = g;
    setHud(getHud(g));

    let raf = 0;
    let last = performance.now();
    let lastHud = 0;
    let lastPhase = g.phase;
    let lastEngineState = '';

    const keyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keysRef.current.left = true;
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keysRef.current.right = true;
      if (e.key === ' ' && !e.repeat) {
        inputRef.current.nitro = true;
        e.preventDefault();
      }
      if (e.key === 'Enter') {
        const gg = gameRef.current;
        if (gg && (gg.phase === 'title' || gg.phase === 'finished' || gg.phase === 'wrecked')) {
          void handleStartRef.current();
        }
      }
    };
    const keyUp = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keysRef.current.left = false;
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keysRef.current.right = false;
    };
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);

    const updateTouch = (touches: TouchList) => {
      const rect = canvas.getBoundingClientRect();
      let left = false;
      let right = false;
      for (let i = 0; i < touches.length; i++) {
        const x = ((touches[i].clientX - rect.left) / rect.width) * W;
        if (x < W / 2) left = true;
        else right = true;
      }
      touchSteerRef.current = left && right ? 0 : left ? -1 : right ? 1 : 0;
    };
    const onTouchStart = (e: TouchEvent) => { updateTouch(e.touches); };
    const onTouchMove = (e: TouchEvent) => { updateTouch(e.touches); e.preventDefault(); };
    const onTouchEnd = (e: TouchEvent) => { updateTouch(e.touches); };
    canvas.addEventListener('touchstart', onTouchStart, { passive: true });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd);
    canvas.addEventListener('touchcancel', onTouchEnd);

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (document.hidden) {
        last = now;
        return;
      }
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      const keySteer = keysRef.current.left && keysRef.current.right ? 0
        : keysRef.current.left ? -1 : keysRef.current.right ? 1 : 0;
      const steer = (keySteer !== 0 ? keySteer : touchSteerRef.current) as -1 | 0 | 1;
      inputRef.current.steer = steer;
      const nitro = inputRef.current.nitro;
      inputRef.current.nitro = false;

      const cfg = getSceneConfig(g.settings.scene, CONFIG.skyTop, CONFIG.skyBottom);
      update(g, dt, { steer, nitro }, W, H, cfg.precip);
      drainEvents(g);

      // engine hum follows speed
      const engState = g.phase === 'racing' || g.phase === 'countdown' ? 'on' : 'off';
      if (engState !== lastEngineState) {
        lastEngineState = engState;
        if (engState === 'on') audio.startEngine();
        else audio.stopEngine();
      }
      if (engState === 'on') {
        const maxSp = CONFIG.baseSpeed * g.car.topSpeed;
        audio.updateEngine(g.speed / maxSp, g.nitroActive);
      }

      render(ctx, g, W, H);

      if (g.phase !== lastPhase || now - lastHud > 120) {
        lastPhase = g.phase;
        lastHud = now;
        setHud(getHud(g));
      }
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
      canvas.removeEventListener('touchcancel', onTouchEnd);
      audio.stopEngine();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleStartRef = useRef(async () => {});
  handleStartRef.current = async () => {
    const g = gameRef.current;
    if (!g) return;
    await audio.ensureAudio();
    audio.startEngine();
    setShowCarSelect(false);
    setShowSettings(false);
    setShowDev(false);
    startRace(g);
    setHud(getHud(g));
  };
  const handleStart = useCallback(() => { void handleStartRef.current(); }, []);

  const applySettings = (s: Settings) => {
    setSettings(s);
    const g = gameRef.current;
    if (!g) return;
    const ng = newGame(s, carIndex);
    gameRef.current = ng;
    resetTitleDemo(ng);
    setHud(getHud(ng));
  };

  const chooseCar = (i: number) => {
    setCarIndex(i);
    const g = gameRef.current;
    if (!g) return;
    setCar(g, i);
    setHud(getHud(g));
  };

  const phase = hud?.phase ?? 'title';

  return (
    <div className="td-wrap">
      <div className="td-stage" style={{ width: W, height: H }}>
        <canvas ref={canvasRef} width={W} height={H} className="td-canvas" />

        {/* HUD */}
        {hud && (phase === 'racing' || phase === 'countdown' || phase === 'finished' || phase === 'wrecked') && (
          <div className="td-hud">
            <div className="td-progress"><div className="td-progress-fill" style={{ width: `${hud.progress * 100}%` }} /></div>
            <div className="td-hud-top">
              <div className="td-hud-left">
                {CONFIG.showLap && (
                  <div className="td-hud-label" style={{ color: CONFIG.lapColor, fontSize: CONFIG.lapSize }}>
                    {CONFIG.lapText} {hud.lap}/{hud.laps}
                  </div>
                )}
                <div className="td-hearts">{'❤'.repeat(hud.hearts)}{'🖤'.repeat(Math.max(0, hud.maxHearts - hud.hearts))}</div>
              </div>
              {CONFIG.showPos && (
                <div className="td-hud-pos" style={{ color: CONFIG.posColor, fontSize: CONFIG.posSize }}>
                  {CONFIG.posText} {posString(hud.pos)}
                </div>
              )}
              <div className="td-hud-speed" style={{ color: CONFIG.speedUnitColor }}>
                <span className="td-speed-num">{hud.speed}</span>
                {CONFIG.showSpeedUnit && (
                  <span className="td-speed-unit" style={{ fontSize: CONFIG.speedUnitSize }}>{CONFIG.speedUnitText}</span>
                )}
              </div>
            </div>
            {CONFIG.showNitro && (
              <div className="td-nitro-row">
                <div className="td-hud-label" style={{ color: CONFIG.nitroColor, fontSize: CONFIG.nitroSize }}>
                  {CONFIG.nitroText} {'●'.repeat(hud.nitro)}{'○'.repeat(Math.max(0, 5 - hud.nitro))}
                </div>
                {hud.nitroActive && <div className="td-nitro-active">BOOST!</div>}
              </div>
            )}
          </div>
        )}

        {/* NITRO button */}
        {(phase === 'racing') && (
          <button
            className="td-nitro-btn"
            onPointerDown={(e) => { e.preventDefault(); inputRef.current.nitro = true; }}
          >
            NITRO
          </button>
        )}

        {/* countdown */}
        {phase === 'countdown' && CONFIG.showCountdown && hud && (
          <div className="td-center-overlay">
            <div className="td-countdown" style={{ color: CONFIG.countdownColor, fontSize: CONFIG.countdownSize }}>
              {hud.cdText}
            </div>
          </div>
        )}

        {/* title */}
        {phase === 'title' && (
          <div className="td-screen">
            <div className="td-title">TOKYO<br />DRIFT</div>
            <div className="td-subtitle">pseudo-3D retro racer</div>
            <div className="td-menu">
              <button className="td-btn" onClick={handleStart}>START RACE</button>
              <button className="td-btn" onClick={() => setShowCarSelect(true)}>SELECT CAR</button>
              <button className="td-btn" onClick={() => setShowSettings(true)}>SETTINGS</button>
              <button className="td-btn td-btn-small" onClick={() => setShowDev(true)}>DEV</button>
            </div>
            <div className="td-hint">← → / A D steer · SPACE nitro · touch halves</div>
          </div>
        )}

        {/* finished */}
        {phase === 'finished' && CONFIG.showFinishTitle && hud && (
          <div className="td-screen td-screen-dim">
            <div className="td-finish-title" style={{ color: CONFIG.finishTitleColor, fontSize: CONFIG.finishTitleSize }}>
              {CONFIG.finishTitleText}
            </div>
            {CONFIG.showFinishInfo && (
              <div className="td-finish-info" style={{ color: CONFIG.finishInfoColor, fontSize: CONFIG.finishInfoSize }}>
                {CONFIG.finishInfoText}: {formatTime(hud.finishTime * 1000)} · {posString(hud.pos)}
              </div>
            )}
            {CONFIG.showRetry && (
              <button className="td-btn" style={{ color: CONFIG.retryColor, fontSize: CONFIG.retrySize }} onClick={handleStart}>
                {CONFIG.retryText}
              </button>
            )}
          </div>
        )}

        {/* wrecked */}
        {phase === 'wrecked' && (
          <div className="td-screen td-screen-dim">
            <div className="td-finish-title" style={{ color: '#ff3b3b', fontSize: CONFIG.finishTitleSize }}>WRECKED</div>
            <button className="td-btn" onClick={handleStart}>{CONFIG.retryText}</button>
          </div>
        )}

        {/* car select */}
        {showCarSelect && (
          <div className="td-modal">
            <div className="td-modal-box">
              <div className="td-modal-title">SELECT CAR</div>
              {CARS.map((c, i) => (
                <button key={c.name} className={`td-car-card${i === carIndex ? ' selected' : ''}`} onClick={() => chooseCar(i)}>
                  <span className="td-car-dot" style={{ background: c.color }} />
                  <span className="td-car-name">{c.name}</span>
                  <span className="td-car-desc">{c.desc}</span>
                  <span className="td-car-stats">SPD {Math.round(c.topSpeed * 100)} · ACC {c.accel} · HDL {c.handling} · HP {c.health}</span>
                </button>
              ))}
              <button className="td-btn" onClick={() => setShowCarSelect(false)}>DONE</button>
            </div>
          </div>
        )}

        {/* settings */}
        {showSettings && (
          <div className="td-modal">
            <div className="td-modal-box">
              <div className="td-modal-title">SETTINGS</div>
              <SettingRow label="TRAFFIC" value={settings.traffic} min={0} max={12}
                onChange={(v) => applySettings({ ...settings, traffic: v })} />
              <SettingRow label="NITRO DENSITY" value={settings.nitroDensity} min={0} max={2}
                onChange={(v) => applySettings({ ...settings, nitroDensity: v })} />
              <SettingRow label="LAPS" value={settings.laps} min={1} max={5}
                onChange={(v) => applySettings({ ...settings, laps: v })} />
              <SettingRow label="OPPONENTS" value={settings.opponentCount} min={0} max={7}
                onChange={(v) => applySettings({ ...settings, opponentCount: v })} />
              <div className="td-setting-row">
                <span>SCENE</span>
                <select value={settings.scene} onChange={(e) => applySettings({ ...settings, scene: e.target.value })}>
                  {SCENES.map((s) => (
                    <option key={s} value={s}>{SCENE_META[s].icon} {SCENE_META[s].label}</option>
                  ))}
                </select>
              </div>
              <button className="td-btn" onClick={() => setShowSettings(false)}>DONE</button>
            </div>
          </div>
        )}

        {/* dev / about */}
        {showDev && (
          <div className="td-modal">
            <div className="td-modal-box">
              <div className="td-modal-title">DEV</div>
              <p className="td-dev-text">
                Standalone open-source recreation of the "Tokyo drift" gizmo.
                Extracted: tweaks config, track layout, projection constants, scene palettes, car roster.
                Reimplemented: frame loop, pseudo-3D projection, renderer, physics, audio.
              </p>
              <p className="td-dev-text">track segs: {gameRef.current?.seg.length ?? 0} · DRAW {DRAW_SEG}</p>
              <button className="td-btn" onClick={() => setShowDev(false)}>CLOSE</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const DRAW_SEG = 140;

function SettingRow({ label, value, min, max, onChange }: {
  label: string; value: number; min: number; max: number; onChange: (v: number) => void;
}) {
  return (
    <div className="td-setting-row">
      <span>{label}</span>
      <input
        type="range" min={min} max={max} step={1} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <b>{value}</b>
    </div>
  );
}

export { PIXEL_FONT };
