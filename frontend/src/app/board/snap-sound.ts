// The sound of a piece that clicks into place, made by the browser itself (no sound file). A browser plays sound only after the person has pressed something: letting go of a piece is such a press.

let context: AudioContext | null = null;

/** how long the dry tick at the start of the click is, in seconds */
const TICK_S = 0.025;

/** A short "click-thock", as of a piece pressed into place. The more pieces what was moved is part of now (`pieces`), the deeper it sounds. Silent where there is no sound. */
export function playSnap(pieces: number): void {
  try {
    context ??= new AudioContext();
    void context.resume();
    const now = context.currentTime;
    const depth = Math.min(1, Math.log2(Math.max(1, pieces)) / 6); // 1 piece: 0, from 64 pieces: 1

    // the body of the sound: a tone that falls quickly and dies away
    const tone = context.createOscillator();
    const loud = context.createGain();
    tone.frequency.setValueAtTime(340 - 190 * depth, now);
    tone.frequency.exponentialRampToValueAtTime(95 - 40 * depth, now + 0.1 + 0.08 * depth);
    loud.gain.setValueAtTime(0.25, now);
    loud.gain.exponentialRampToValueAtTime(0.001, now + 0.14 + 0.1 * depth);
    tone.connect(loud).connect(context.destination);
    tone.start(now);
    tone.stop(now + 0.26);

    // the dry tick on top of it: a moment of noise that fades
    const noise = context.createBuffer(1, Math.ceil(context.sampleRate * TICK_S), context.sampleRate);
    const samples = noise.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = (Math.random() * 2 - 1) * (1 - i / samples.length) ** 3;
    const tick = context.createBufferSource();
    const soft = context.createGain();
    tick.buffer = noise;
    soft.gain.value = 0.18;
    tick.connect(soft).connect(context.destination);
    tick.start(now);
  } catch {
    /* no sound on this device or browser: the blink and the ring are enough */
  }
}
