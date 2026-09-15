# Tokyo Drift — pseudo-3D retro racer

A standalone, open-source recreation of the **"Tokyo drift"** gizmo: a 2.5D
pseudo-3D night-racing game (React + Canvas 2D + Tone.js), extracted from its
closed runtime and rebuilt so it can live on GitHub and be iterated on in the
open — with an eye toward a future app-store release.

## The game

- Classic pseudo-3D road renderer (140 segments ahead) with **real elevation**:
  every track segment carries a height value, so the road climbs, crests, and
  dives while the camera pitches through hills.
- 4 cars with distinct stats (FALCON / TITAN / VIPER / SCOUT): top speed,
  acceleration, handling, health.
- 2 laps, rivals + civilian traffic, nitro pickups, heart pickups, collisions
  with damage/invulnerability, screen shake, particle effects.
- 6 scenes (spring / summer / autumn / winter / rain / night) with weather
  overlays and day/night palettes.
- Retro HUD: speed, lap, position, nitro bar, hearts, progress.
- Touch steering (tap left/right half of screen) + keyboard (arrows/WASD).
- Engine sound synthesized with Tone.js (sawtooth osc pitch follows speed).

## Run it

```bash
npm install
npm run dev     # serve locally
npm run build   # production build -> dist/
```

## Controls

| Input | Action |
|---|---|
| ← / → or A / D | Steer |
| Tap left/right half (touch) | Steer |
| N or tap NITRO | Nitro boost |

## Project structure

```
src/
  config.ts      # all tuning values (replaces the gizmo's tweak panel)
  track.ts       # track builder + projection constants + helpers
                 # (buildTrack extracted verbatim — curve + elevation per segment)
  scenes.ts      # the 6 scene palettes/weather configs
  game.ts        # game state machine: countdown, racing physics, collisions,
                 # pickups, laps, finish/wrecked (reimplemented from the spec)
  render.ts      # pseudo-3D road renderer, sprites, roadside dressing,
                 # weather overlays (reimplemented from the spec)
  audio.ts       # Tone.js engine + SFX
  haptics.ts     # navigator.vibrate shim (replaces the gizmo runtime)
  GameCanvas.tsx # React shell: canvas, HUD, title/countdown/finish screens,
                 # car select, settings
```

## Provenance

This project is a recreation of Craig's own Pocket gizmo ("Tokyo drift",
madewithpocket.com), built from code he extracted via the gizmo's DEV view.
The track builder, constants, car roster, and scene configs are carried over;
the game loop, renderer, and sprites were reimplemented from the extracted
specification. No Pocket/Meta runtime code is included.

## License

MIT — see LICENSE.
