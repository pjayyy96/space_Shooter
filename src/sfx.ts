// Tiny synthesized sound effects using the Web Audio API (no audio files needed).

let audio: AudioContext | null = null;

/** Browsers only allow audio after a user gesture, so call this on the first key/click. */
export function unlockAudio(): void {
  try {
    if (!audio) audio = new AudioContext();
    if (audio.state === "suspended") void audio.resume();
  } catch {
    audio = null; // Audio not supported; the game still works silently.
  }
}

function beep(
  freq: number,
  duration: number,
  type: OscillatorType,
  volume: number,
  slideTo?: number,
): void {
  if (!audio) return;
  const t = audio.currentTime;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(slideTo, t + duration);
  }
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(gain).connect(audio.destination);
  osc.start(t);
  osc.stop(t + duration);
}

export const sfx = {
  shoot: () => beep(880, 0.08, "square", 0.03, 440),
  laser: () => beep(1200, 0.06, "sawtooth", 0.025, 600),
  explode: () => beep(200, 0.3, "sawtooth", 0.06, 40),
  hurt: () => beep(150, 0.4, "triangle", 0.1, 60),
  shieldBreak: () => beep(1000, 0.25, "triangle", 0.09, 300),
  pickup: () => beep(660, 0.2, "sine", 0.08, 1320),
};
