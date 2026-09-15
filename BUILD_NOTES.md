# Build notes — tokyo-drift recreation

Built 2026-09-15. The Pocket agent never delivered complete source: the DEV
view gave us the config/tweaks block, helpers, constants, `getSceneConfig`,
and `buildTrack()` verbatim, plus a Component *skeleton* whose function
bodies were comments. Everything below marked "reimplemented" was written
fresh from that specification in the classic Jake-Gordon pseudo-3D style.

## Extracted verbatim (from ~/workspace/pocket-tokyo-drift/chunk-01.tsx)

- `src/track.ts`: ALL constants (SEG_LEN=20, DRAW=140, CAM_DEPTH=0.84,
  CAM_H=1.0, ROAD_FACTOR=15.5, CURVE_FACTOR=0.55, Y_FACTOR=16, ...),
  `formatTime`, `posString`, `easeInOut`, `Seg` type, and `buildTrack()`
  with the exact six `addRoad(enter,hold,leave,curve,dy)` sections.
  Verified: 840 segments, elevation range -15..+20, net 0, 578 curved segs.
- `src/scenes.ts`: SCENE_META + `getSceneConfig()` for all six scenes.
- `src/config.ts`: all 50 tweak values (colors, sliders, labels) as CONFIG.
- Car roster + stats (FALCON/TITAN/VIPER/SCOUT), settings shape, state
  shape, touch-steering rule (screen halves -> -1/0/1).

## Reimplemented from the spec

- `src/game.ts` (606 lines): title auto-drive demo, countdown, racing
  physics (steering ramp, curve push, accel/brake, offroad drag, nitro),
  rival/civilian AI + collisions (hearts, invuln, spin), pickups
  (nitro/hearts), particles, laps, finish/wrecked, HUD state.
- `src/render.ts` (594 lines): segment projection with elevation
  (`sy = horizonY + p * ((playerY + CAM_H) - seg.y) * Y_FACTOR * H/2`),
  camera pitch through crests/dips, ground/road/curb/lane polygons,
  start/finish banners, lamps, billboards (NEO TOKYO / ラーメン), trees,
  bridges, player/rival/pickup sprites, rain/snow/leaves/petal overlays.
- `src/audio.ts`: Tone.js engine (sawtooth + filter, pitch ~ speed),
  countdown beeps, collision thud, pickup whoosh.
- `src/haptics.ts`: `navigator.vibrate` shim for `gizmoRuntime.performHaptic`.
- `src/GameCanvas.tsx`: canvas host, HUD, title / car-select / settings /
  countdown / finish screens, keyboard + touch input.
- `src/main.tsx`, `src/index.css`: standard Vite entry + fullscreen CSS.

## Fixes applied after the initial pass

- Added missing `formatTime`/`posString` imports in GameCanvas.tsx.
- Added missing `src/main.tsx` entry point and `src/index.css`.

## Verification

- `npm run build` (tsc + vite): green.
- Track unit check: 840 segments, elevation -15..+20, net 0 — matches source.
- No runtime smoke test yet (no headless browser in this environment);
  recommend `npm run dev` + manual play before publishing.

## Not included

- The gizmo's DEV-view source panel (not needed standalone).
- Any `@gizmo/runtime` code — fully decoupled.
