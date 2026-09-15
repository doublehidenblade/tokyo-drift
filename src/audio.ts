// Tone.js sound: engine hum (sawtooth osc -> lowpass filter -> gain, pitch tied
// to speed) plus one-shot beeps / thuds / whooshes. All init is lazy and happens
// on the first user gesture (START RACE), because browsers require it.

import * as Tone from 'tone';

interface Engine {
  osc: Tone.Oscillator;
  filter: Tone.Filter;
  gain: Tone.Gain;
}

let engine: Engine | null = null;
let beepSynth: Tone.Synth | null = null;
let noiseSynth: Tone.NoiseSynth | null = null;
let ready = false;

export async function ensureAudio(): Promise<void> {
  if (ready) return;
  try {
    await Tone.start();
    const filter = new Tone.Filter(700, 'lowpass');
    const gain = new Tone.Gain(0.0);
    const osc = new Tone.Oscillator({ frequency: 70, type: 'sawtooth' });
    osc.connect(filter);
    filter.connect(gain);
    gain.toDestination();
    osc.start();
    engine = { osc, filter, gain };
    beepSynth = new Tone.Synth({
      oscillator: { type: 'square' },
      envelope: { attack: 0.005, decay: 0.08, sustain: 0.1, release: 0.1 },
    }).toDestination();
    beepSynth.volume.value = -14;
    noiseSynth = new Tone.NoiseSynth({
      noise: { type: 'pink' },
      envelope: { attack: 0.005, decay: 0.25, sustain: 0, release: 0.2 },
    }).toDestination();
    noiseSynth.volume.value = -10;
    ready = true;
  } catch {
    ready = false;
  }
}

export function startEngine(): void {
  if (!engine) return;
  try {
    engine.gain.gain.rampTo(0.12, 0.4);
  } catch {
    /* ignore */
  }
}

/** ratio: 0..1 of top speed. nitro: currently boosting. */
export function updateEngine(ratio: number, nitro: boolean): void {
  if (!engine) return;
  try {
    const r = Math.max(0, Math.min(1.2, ratio));
    engine.osc.frequency.rampTo(65 + r * 230 + (nitro ? 60 : 0), 0.08);
    engine.filter.frequency.rampTo(500 + r * 2400 + (nitro ? 1200 : 0), 0.08);
  } catch {
    /* ignore */
  }
}

export function stopEngine(): void {
  if (!engine) return;
  try {
    engine.gain.gain.rampTo(0.0, 0.3);
  } catch {
    /* ignore */
  }
}

export function beep(freq = 440, dur = 0.12): void {
  if (!beepSynth) return;
  try {
    beepSynth.triggerAttackRelease(freq, dur);
  } catch {
    /* ignore */
  }
}

export function thud(): void {
  if (!noiseSynth) return;
  try {
    noiseSynth.triggerAttackRelease(0.3);
  } catch {
    /* ignore */
  }
}

export function whoosh(): void {
  if (!noiseSynth) return;
  try {
    // a brighter, shorter burst reads as a pickup whoosh
    noiseSynth.envelope.decay = 0.12;
    noiseSynth.triggerAttackRelease(0.15);
    noiseSynth.envelope.decay = 0.25;
  } catch {
    /* ignore */
  }
}

export function scrape(): void {
  if (!noiseSynth) return;
  try {
    // short metallic grind for clipping the road edge
    noiseSynth.envelope.decay = 0.08;
    noiseSynth.triggerAttackRelease(0.1);
    noiseSynth.envelope.decay = 0.25;
  } catch {
    /* ignore */
  }
}
