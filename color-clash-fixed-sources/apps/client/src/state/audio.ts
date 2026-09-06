import type { GameEvent } from '@colorclash/shared';

/**
 * Sound.
 *
 * Every cue is synthesised in the browser from oscillators and a noise buffer.
 * Nothing is downloaded, nothing is licensed, and there is no audio file in
 * this repository to get the rights to — which also means the offline build and
 * the APK gain a full sound design for zero bytes.
 *
 * The toggle in the lobby is the whole contract: when sound is off, no node is
 * ever created, so "off" means silent rather than "playing at zero volume".
 *
 * Cues are driven by the engine's own event stream, so a sound cannot disagree
 * with what happened — if there is no `CLASH_PENALTY` event, there is no
 * penalty sting.
 */

type Ctx = AudioContext;

let ctx: Ctx | null = null;
let master: GainNode | null = null;
let enabled = true;

const STORAGE_KEY = 'colorclash.sound';

/**
 * Everything that shows a sound switch subscribes here.
 *
 * There used to be two settings: this one, and a MatchConfig field the lobby
 * wrote and nothing read. One preference, one store, one set of listeners means
 * the lobby switch and the pause-sheet switch cannot disagree.
 */
type Listener = (on: boolean) => void;
const listeners = new Set<Listener>();

export function onSoundChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Reads the persisted preference. Defaults to on.
 *
 * The default is written back on the first read, so the stored state is always
 * explicit. While it was implicit the behaviour was correct but fragile: every
 * existing player would have silently inherited a new default the day one was
 * chosen, with no way to tell "never set it" apart from "wanted it on".
 */
export function loadSoundPreference(): boolean {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (raw === null || raw === undefined) {
      saveSoundPreference(true);
      return true;
    }
    return raw === '1';
  } catch {
    // Private mode, or storage disabled. Sound simply does not persist.
    return true;
  }
}

export function saveSoundPreference(on: boolean): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, on ? '1' : '0');
  } catch {
    /* not fatal */
  }
}

export function setSoundEnabled(on: boolean): void {
  enabled = on;
  saveSoundPreference(on);
  if (!on) {
    // Cut anything already ringing, so turning sound off is immediate.
    try {
      ctx?.close();
    } catch {
      /* already closed */
    }
    ctx = null;
    master = null;
  }
  for (const fn of listeners) fn(on);
}

export function isSoundEnabled(): boolean {
  return enabled;
}

/**
 * Browsers refuse to start audio before a gesture, so the context is created
 * lazily on the first cue after the player has touched something, and a failure
 * here is silent by design: no sound is never a reason to break a game.
 */
function audio(): Ctx | null {
  if (!enabled) return null;

  if (ctx) {
    /*
     * A context does not stay running for the life of the page. Backgrounding
     * an app suspends it, and on iOS it can be closed outright. Neither raises
     * an error — the sounds simply stop, with no way for the player to get them
     * back. So the state is checked before every cue rather than assumed.
     */
    if (ctx.state === 'closed') {
      ctx = null;
      master = null;
    } else {
      if (ctx.state === 'suspended') {
        // Asynchronous, and deliberately not awaited: the cue about to be
        // scheduled will play once the context resumes, and a rejected resume
        // (no gesture yet) must not throw into the caller.
        void ctx.resume().catch(() => {});
      }
      return ctx;
    }
  }

  try {
    const Ctor =
      (globalThis as { AudioContext?: typeof AudioContext }).AudioContext ??
      (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.22; // deliberately quiet; this is a card game
    master.connect(ctx.destination);
    return ctx;
  } catch {
    return null;
  }
}

type ToneSpec = {
  /** Hz at the start of the note. */
  from: number;
  /** Hz at the end, for a sweep. Defaults to `from`. */
  to?: number;
  ms: number;
  type?: OscillatorType;
  gain?: number;
  /** Seconds to wait before this note starts, for chords and arpeggios. */
  delay?: number;
};

function tone(spec: ToneSpec): void {
  const c = audio();
  if (!c || !master) return;
  const start = c.currentTime + (spec.delay ?? 0);
  const end = start + spec.ms / 1000;

  const osc = c.createOscillator();
  osc.type = spec.type ?? 'sine';
  osc.frequency.setValueAtTime(spec.from, start);
  if (spec.to && spec.to !== spec.from) osc.frequency.exponentialRampToValueAtTime(spec.to, end);

  // A short attack and an exponential tail: without the ramp every note ends
  // in a click, which is the difference between "sound design" and "beeping".
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(spec.gain ?? 0.5, start + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, end);

  osc.connect(g).connect(master);
  osc.start(start);
  osc.stop(end + 0.02);
}

/** Filtered white noise — the papery part of a card landing. */
function noise(ms: number, gain = 0.25, filterHz = 2400, delay = 0): void {
  const c = audio();
  if (!c || !master) return;
  const start = c.currentTime + delay;
  const frames = Math.max(1, Math.floor((c.sampleRate * ms) / 1000));
  const buffer = c.createBuffer(1, frames, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) {
    // Fade the noise out across the buffer so it reads as a brush, not a hiss.
    data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
  }

  const src = c.createBufferSource();
  src.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = filterHz;
  const g = c.createGain();
  g.gain.value = gain;

  src.connect(filter).connect(g).connect(master);
  src.start(start);
}

export type Cue =
  | 'CARD_PLAY'
  | 'CARD_DRAW'
  | 'SPECIAL'
  | 'PENALTY'
  | 'CLASH_OK'
  | 'CLASH_MISSED'
  | 'ELIMINATED'
  | 'VICTORY'
  | 'YOUR_TURN'
  | 'FLIP'
  | 'UI_TAP';

/** The whole sound design, in one table. */
export function play(cue: Cue): void {
  if (!enabled) return;
  switch (cue) {
    case 'CARD_PLAY':
      noise(90, 0.3, 2600);
      tone({ from: 440, to: 620, ms: 70, type: 'triangle', gain: 0.16 });
      break;

    case 'CARD_DRAW':
      noise(120, 0.22, 1500);
      break;

    case 'SPECIAL':
      // Rising third: something happened, and it was on purpose.
      tone({ from: 520, ms: 110, type: 'square', gain: 0.14 });
      tone({ from: 660, ms: 150, type: 'square', gain: 0.14, delay: 0.09 });
      break;

    case 'PENALTY':
      // Falling, slightly detuned: the only unpleasant sound in the set.
      tone({ from: 300, to: 150, ms: 300, type: 'sawtooth', gain: 0.16 });
      noise(260, 0.18, 700, 0.02);
      break;

    case 'CLASH_OK':
      tone({ from: 660, ms: 90, type: 'triangle', gain: 0.2 });
      tone({ from: 880, ms: 90, type: 'triangle', gain: 0.2, delay: 0.08 });
      tone({ from: 1320, ms: 160, type: 'triangle', gain: 0.18, delay: 0.16 });
      break;

    case 'CLASH_MISSED':
      tone({ from: 400, to: 180, ms: 240, type: 'square', gain: 0.16 });
      break;

    case 'ELIMINATED':
      tone({ from: 340, to: 110, ms: 520, type: 'sawtooth', gain: 0.16 });
      break;

    case 'VICTORY':
      [523, 659, 784, 1046].forEach((f, i) =>
        tone({ from: f, ms: 260, type: 'triangle', gain: 0.2, delay: i * 0.12 }),
      );
      break;

    case 'YOUR_TURN':
      tone({ from: 780, ms: 90, type: 'sine', gain: 0.16 });
      tone({ from: 1040, ms: 120, type: 'sine', gain: 0.14, delay: 0.1 });
      break;

    case 'FLIP':
      tone({ from: 900, to: 320, ms: 220, type: 'triangle', gain: 0.16 });
      tone({ from: 320, to: 900, ms: 220, type: 'triangle', gain: 0.14, delay: 0.18 });
      break;

    case 'UI_TAP':
      tone({ from: 600, ms: 40, type: 'sine', gain: 0.1 });
      break;
  }
}

/**
 * Maps one engine event to a cue.
 *
 * Returning `null` is the common case: most events are bookkeeping, and a game
 * that makes a noise for every one of them is unbearable.
 */
export function cueForEvent(event: GameEvent, viewerId?: string): Cue | null {
  switch (event.type) {
    case 'CARD_PLAYED':
      return 'CARD_PLAY';
    case 'CARD_DRAWN':
      return event.count > 1 ? 'PENALTY' : 'CARD_DRAW';
    case 'STACK_UPDATED':
      return 'SPECIAL';
    case 'CLASH_CALLED':
      return 'CLASH_OK';
    case 'CLASH_PENALTY':
      return 'CLASH_MISSED';
    case 'FLIP_TRIGGERED':
      return 'FLIP';
    case 'PLAYER_ELIMINATED':
      return 'ELIMINATED';
    case 'HANDS_ROTATED':
    case 'HANDS_SWAPPED':
    case 'DISCARD_ALL':
    case 'FLEX_USED':
      return 'SPECIAL';
    case 'MATCH_ENDED':
    case 'ROUND_ENDED':
      return 'VICTORY';
    case 'TURN_CHANGED':
      // Only the moment it becomes *your* turn is worth a sound.
      return viewerId && event.to === viewerId ? 'YOUR_TURN' : null;
    default:
      return null;
  }
}

/** Plays the cues for a batch of events, at most one of each kind. */
export function playEvents(events: GameEvent[], viewerId?: string): void {
  if (!enabled) return;
  const seen = new Set<Cue>();
  for (const e of events) {
    const cue = cueForEvent(e, viewerId);
    if (cue && !seen.has(cue)) {
      seen.add(cue);
      play(cue);
    }
  }
}

// Apply the stored preference at module load, before the first cue.
enabled = loadSoundPreference();
