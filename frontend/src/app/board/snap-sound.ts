// The sounds of a puzzle, made by the browser itself (no sound files): a piece that clicks into place, in the style the player chose, the soft tap of a piece picked up or put down, and the little cheer halfway.
// A browser plays sound only after the person has pressed something: picking up and letting go of a piece are such presses.

import { SoundStyle } from '../models/shared/play-look';

let context: AudioContext | null = null;

/** Plays what `make` builds, from now. Silent where there is no sound. */
function sound(make: (context: AudioContext, now: number) => void): void {
  try {
    context ??= new AudioContext();
    void context.resume();
    make(context, context.currentTime);
  } catch {
    /* no sound on this device or browser: what is seen is enough */
  }
}

/** a tone that dies away; with `to` it falls (or rises) to that pitch on the way */
function tone(audio: AudioContext, at: number, pitch: number, seconds: number, volume: number, type: OscillatorType = 'sine', to?: number): void {
  const source = audio.createOscillator();
  const loud = audio.createGain();
  source.type = type;
  source.frequency.setValueAtTime(pitch, at);
  if (to) source.frequency.exponentialRampToValueAtTime(to, at + seconds * 0.8);
  loud.gain.setValueAtTime(volume, at);
  loud.gain.exponentialRampToValueAtTime(0.001, at + seconds);
  source.connect(loud).connect(audio.destination);
  source.start(at);
  source.stop(at + seconds + 0.02);
}

/** a moment of noise that fades; with `below` only what is lower than that pitch, which makes it dull */
function noise(audio: AudioContext, at: number, seconds: number, volume: number, below?: number): void {
  const buffer = audio.createBuffer(1, Math.ceil(audio.sampleRate * seconds), audio.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let i = 0; i < samples.length; i++) samples[i] = (Math.random() * 2 - 1) * (1 - i / samples.length) ** 3;
  const source = audio.createBufferSource();
  const loud = audio.createGain();
  source.buffer = buffer;
  loud.gain.value = volume;
  if (below) {
    const dull = audio.createBiquadFilter();
    dull.type = 'lowpass';
    dull.frequency.value = below;
    source.connect(dull).connect(loud);
  } else source.connect(loud);
  loud.connect(audio.destination);
  source.start(at);
}

/** The sound of a click into place. The more pieces what was moved is part of now (`pieces`), the deeper it sounds. */
export function playSnap(pieces: number, style: SoundStyle = 'click'): void {
  sound((audio, now) => {
    const depth = Math.min(1, Math.log2(Math.max(1, pieces)) / 6); // 1 piece: 0, from 64 pieces: 1
    const lower = 1 - 0.4 * depth;
    if (style === 'wood') {
      tone(audio, now, 230 * lower, 0.13, 0.35, 'triangle');
      tone(audio, now, 560 * lower, 0.06, 0.14);
      noise(audio, now, 0.03, 0.2, 2500);
    } else if (style === 'cardboard') {
      noise(audio, now, 0.09 + 0.05 * depth, 0.6, 900 - 350 * depth);
    } else if (style === 'chime') {
      tone(audio, now, 880 * lower, 0.7, 0.14);
      tone(audio, now + 0.05, 1320 * lower, 0.55, 0.09);
    } else {
      // "click-thock": a tone that falls quickly, and a dry tick on top of it
      tone(audio, now, 340 - 190 * depth, 0.14 + 0.1 * depth, 0.25, 'sine', 95 - 40 * depth);
      noise(audio, now, 0.025, 0.18);
    }
  });
}

/** The soft tap of a piece picked up (`pick`, a little higher) or put down where it does not click. */
export function playTap(what: 'pick' | 'drop', style: SoundStyle = 'click'): void {
  sound((audio, now) => {
    const pick = what === 'pick';
    if (style === 'chime') tone(audio, now, pick ? 1046 : 784, 0.18, 0.05);
    else if (style === 'wood') tone(audio, now, pick ? 420 : 280, 0.06, 0.12, 'triangle');
    else noise(audio, now, pick ? 0.025 : 0.045, 0.14, pick ? (style === 'cardboard' ? 1500 : 3500) : style === 'cardboard' ? 700 : 1600);
  });
}

/** The little cheer when half of the pieces are in place: three notes upwards, quietly. */
export function playCheer(): void {
  sound((audio, now) => [523, 659, 784].forEach((pitch, i) => tone(audio, now + i * 0.11, pitch, 0.35, 0.12, 'triangle')));
}
