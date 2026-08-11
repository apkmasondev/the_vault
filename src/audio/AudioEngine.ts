import { RAMPS } from '../app/constants';
import { clamp, damp } from '../utils/math';

/** Bin boundaries over a 128-bin spectrum; roughly sub/low, body, and air. */
const LOW_BINS = 5;
const MID_BINS = 22;
const HIGH_BINS = 64;

export interface AudioBands {
  readonly low: number;
  readonly mid: number;
  readonly high: number;
}

export class AudioEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private atmosphere: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private analyser: AnalyserNode | null = null;
  private spectrum: Uint8Array<ArrayBuffer> = new Uint8Array(0);
  private soundtrack: HTMLAudioElement | null = null;
  private soundtrackSource: MediaElementAudioSourceNode | null = null;
  private chargeOscillator: OscillatorNode | null = null;
  private chargeGain: GainNode | null = null;
  private enabled = false;
  private lastSampledAt = 0;
  /** Reused so per-frame reads do not allocate. */
  private readonly bandValues = { low: 0, mid: 0, high: 0 };

  constructor(private readonly soundtrackUrl: string) {}

  async start(enabled: boolean): Promise<void> {
    if (!this.context) this.createGraph();
    if (!this.context) return;
    const playback = this.soundtrack?.play();
    if (this.context.state === 'suspended') await this.context.resume();
    if (playback) await playback.catch(() => undefined);
    this.setEnabled(enabled);
  }

  private setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!this.context || !this.master) return;
    const now = this.context.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(enabled ? 0.32 : 0, now + (enabled ? 0.65 : 0.32));
  }

  update(progress: number): void {
    if (!this.context || !this.atmosphere || !this.filter) return;
    const now = this.context.currentTime;
    const intensity = clamp((progress - RAMPS.audioIntensityStart) / RAMPS.audioIntensitySpan);
    this.atmosphere.gain.setTargetAtTime(0.78 + intensity * 0.18, now, 0.18);
    this.filter.frequency.setTargetAtTime(9_500 + intensity * 5_000, now, 0.22);
  }

  /**
   * Smoothed spectrum of what is actually playing. Returns silence when the
   * graph is muted or absent so callers never have to special-case it.
   */
  bands(now: number): AudioBands {
    const analyser = this.analyser;
    if (!analyser || !this.enabled) {
      this.bandValues.low = 0;
      this.bandValues.mid = 0;
      this.bandValues.high = 0;
      return this.bandValues;
    }

    const deltaSeconds = Math.min(0.1, Math.max(0.001, (now - this.lastSampledAt) / 1000));
    this.lastSampledAt = now;
    analyser.getByteFrequencyData(this.spectrum);

    const average = (from: number, to: number): number => {
      let total = 0;
      for (let index = from; index < to; index += 1) total += this.spectrum[index] ?? 0;
      return total / ((to - from) * 255);
    };

    // Damped so the geometry breathes with the track instead of flickering.
    this.bandValues.low = damp(this.bandValues.low, average(0, LOW_BINS), 0.06, deltaSeconds);
    this.bandValues.mid = damp(this.bandValues.mid, average(LOW_BINS, MID_BINS), 0.08, deltaSeconds);
    this.bandValues.high = damp(this.bandValues.high, average(MID_BINS, HIGH_BINS), 0.1, deltaSeconds);
    return this.bandValues;
  }

  /** Starts the rising tone that tracks how much charge the object holds. */
  beginCharge(): void {
    if (!this.enabled || !this.context || !this.master || this.chargeOscillator) return;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(58, now);
    gain.gain.setValueAtTime(0.0001, now);
    oscillator.connect(gain).connect(this.master);
    oscillator.start(now);
    this.chargeOscillator = oscillator;
    this.chargeGain = gain;
  }

  updateCharge(amount: number): void {
    if (!this.context || !this.chargeOscillator || !this.chargeGain) return;
    const now = this.context.currentTime;
    const level = clamp(amount);
    this.chargeOscillator.frequency.setTargetAtTime(58 + level * level * 250, now, 0.08);
    this.chargeGain.gain.setTargetAtTime(0.0001 + level * 0.075, now, 0.06);
  }

  endCharge(): void {
    const oscillator = this.chargeOscillator;
    const gain = this.chargeGain;
    if (!this.context || !oscillator || !gain) return;
    const now = this.context.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
    oscillator.stop(now + 0.2);
    this.chargeOscillator = null;
    this.chargeGain = null;
  }

  /**
   * Stone meeting stone in a large concrete room. `strength` is the released
   * charge; a light tap still registers.
   *
   * Built from four parts, because a single pitch-swept sine — which is what
   * this was — is the standard recipe for a cartoon boing, not for an impact:
   * a noise knock for the contact, a fast-falling body for the mass, two
   * inharmonic partials for the stone ringing, and a dark tail for the room.
   */
  impact(strength = 1): void {
    if (!this.enabled || !this.context || !this.master) return;
    const context = this.context;
    const master = this.master;
    const level = clamp(strength, 0.15, 1);
    const now = context.currentTime;

    const knock = context.createBufferSource();
    const knockFilter = context.createBiquadFilter();
    const knockGain = context.createGain();
    knock.buffer = this.createNoise(0.11, 4);
    knockFilter.type = 'bandpass';
    knockFilter.frequency.setValueAtTime(1_150, now);
    knockFilter.frequency.exponentialRampToValueAtTime(320, now + 0.09);
    knockFilter.Q.value = 1.1;
    knockGain.gain.setValueAtTime(0.1 + level * 0.16, now);
    knockGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    knock.connect(knockFilter).connect(knockGain).connect(master);
    knock.start(now);

    // The drop is over in under a tenth of a second; anything slower sings.
    const body = context.createOscillator();
    const bodyGain = context.createGain();
    body.type = 'sine';
    body.frequency.setValueAtTime(104 + level * 40, now);
    body.frequency.exponentialRampToValueAtTime(43, now + 0.07);
    bodyGain.gain.setValueAtTime(0.0001, now);
    bodyGain.gain.exponentialRampToValueAtTime(0.08 + level * 0.16, now + 0.008);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.34 + level * 0.22);
    body.connect(bodyGain).connect(master);
    body.start(now);
    body.stop(now + 0.7);

    for (const [frequency, amplitude, decay] of [[147, 0.045, 0.9], [214, 0.028, 0.66]] as const) {
      const partial = context.createOscillator();
      const partialGain = context.createGain();
      partial.type = 'triangle';
      partial.frequency.value = frequency;
      partialGain.gain.setValueAtTime(0.0001, now);
      partialGain.gain.exponentialRampToValueAtTime(amplitude * level, now + 0.01);
      partialGain.gain.exponentialRampToValueAtTime(0.0001, now + decay);
      partial.connect(partialGain).connect(master);
      partial.start(now);
      partial.stop(now + decay + 0.05);
    }

    const room = context.createBufferSource();
    const roomFilter = context.createBiquadFilter();
    const roomGain = context.createGain();
    room.buffer = this.createNoise(0.85, 1.6);
    roomFilter.type = 'lowpass';
    roomFilter.frequency.value = 640;
    roomGain.gain.setValueAtTime(0.03 + level * 0.05, now + 0.01);
    roomGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.8);
    room.connect(roomFilter).connect(roomGain).connect(master);
    room.start(now);
  }

  /**
   * The sound of the object breaking open: a noise burst for the crack, over a
   * falling tone for the mass behind it.
   */
  fracture(): void {
    if (!this.enabled || !this.context || !this.master) return;
    const context = this.context;
    const now = context.currentTime;

    const source = context.createBufferSource();
    const crackFilter = context.createBiquadFilter();
    const crackGain = context.createGain();
    source.buffer = this.createNoise(0.45, 3);
    crackFilter.type = 'bandpass';
    crackFilter.frequency.setValueAtTime(2_100, now);
    crackFilter.frequency.exponentialRampToValueAtTime(620, now + 0.4);
    crackFilter.Q.value = 0.9;
    crackGain.gain.setValueAtTime(0.22, now);
    crackGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
    source.connect(crackFilter).connect(crackGain).connect(this.master);
    source.start(now);

    const body = context.createOscillator();
    const bodyGain = context.createGain();
    body.type = 'sawtooth';
    body.frequency.setValueAtTime(180, now);
    body.frequency.exponentialRampToValueAtTime(42, now + 0.5);
    bodyGain.gain.setValueAtTime(0.0001, now);
    bodyGain.gain.exponentialRampToValueAtTime(0.14, now + 0.012);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
    body.connect(bodyGain).connect(this.master);
    body.start(now);
    body.stop(now + 0.65);
  }

  /**
   * The object coming apart for good. Longer and lower than the fracture, with
   * a rattle of falling stone under it so the room is left with the debris.
   */
  shatter(): void {
    if (!this.enabled || !this.context || !this.master) return;
    const context = this.context;
    const master = this.master;
    const now = context.currentTime;

    const burst = context.createBufferSource();
    const burstFilter = context.createBiquadFilter();
    const burstGain = context.createGain();
    burst.buffer = this.createNoise(1.5, 1.4);
    burstFilter.type = 'bandpass';
    burstFilter.frequency.setValueAtTime(2_600, now);
    burstFilter.frequency.exponentialRampToValueAtTime(240, now + 1.1);
    burstFilter.Q.value = 0.7;
    burstGain.gain.setValueAtTime(0.3, now);
    burstGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.5);
    burst.connect(burstFilter).connect(burstGain).connect(master);
    burst.start(now);

    const collapse = context.createOscillator();
    const collapseGain = context.createGain();
    collapse.type = 'sawtooth';
    collapse.frequency.setValueAtTime(150, now);
    collapse.frequency.exponentialRampToValueAtTime(26, now + 0.9);
    collapseGain.gain.setValueAtTime(0.0001, now);
    collapseGain.gain.exponentialRampToValueAtTime(0.2, now + 0.015);
    collapseGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.3);
    collapse.connect(collapseGain).connect(master);
    collapse.start(now);
    collapse.stop(now + 1.4);

    // Stone landing, scattered over the second after the break.
    for (let piece = 0; piece < 7; piece += 1) {
      const delay = 0.12 + Math.random() * 0.85;
      const tick = context.createBufferSource();
      const tickFilter = context.createBiquadFilter();
      const tickGain = context.createGain();
      tick.buffer = this.createNoise(0.12, 5);
      tickFilter.type = 'bandpass';
      tickFilter.frequency.value = 400 + Math.random() * 1_400;
      tickFilter.Q.value = 2.2;
      tickGain.gain.setValueAtTime(0.05 + Math.random() * 0.05, now + delay);
      tickGain.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.16);
      tick.connect(tickFilter).connect(tickGain).connect(master);
      tick.start(now + delay);
    }
  }

  async suspend(): Promise<void> {
    if (this.context?.state === 'running') await this.context.suspend();
  }

  async resume(): Promise<void> {
    if (this.enabled && this.context?.state === 'suspended') await this.context.resume();
  }

  reset(): void {
    this.endCharge();
    this.setEnabled(false);
    if (this.soundtrack) {
      this.soundtrack.pause();
      this.soundtrack.currentTime = 0;
    }
  }

  dispose(): void {
    this.endCharge();
    this.soundtrack?.pause();
    this.soundtrackSource?.disconnect();
    this.master?.disconnect();
    this.atmosphere?.disconnect();
    this.filter?.disconnect();
    this.analyser?.disconnect();
    if (this.soundtrack) {
      this.soundtrack.removeAttribute('src');
      this.soundtrack.load();
    }
    if (this.context) void this.context.close();
    this.context = null;
    this.soundtrack = null;
    this.soundtrackSource = null;
    this.analyser = null;
  }

  /** Noise that decays over its own length; `shape` sets how abruptly. */
  private createNoise(seconds: number, shape: number): AudioBuffer {
    const context = this.context!;
    const length = Math.max(1, Math.floor(context.sampleRate * seconds));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < length; index += 1) {
      channel[index] = (Math.random() * 2 - 1) * (1 - index / length) ** shape;
    }
    return buffer;
  }

  private createGraph(): void {
    const AudioContextConstructor = window.AudioContext;
    if (!AudioContextConstructor) return;

    const context = new AudioContextConstructor({ latencyHint: 'playback' });
    const master = context.createGain();
    const atmosphere = context.createGain();
    const filter = context.createBiquadFilter();
    const analyser = context.createAnalyser();
    master.gain.value = 0;
    atmosphere.gain.value = 0.78;
    filter.type = 'lowpass';
    filter.frequency.value = 9_500;
    filter.Q.value = 0.4;
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.6;
    atmosphere.connect(filter).connect(master).connect(context.destination);
    // A passive tap: the analyser reads the signal without altering it.
    filter.connect(analyser);

    const soundtrack = new Audio(this.soundtrackUrl);
    soundtrack.loop = true;
    soundtrack.preload = 'auto';
    soundtrack.crossOrigin = 'anonymous';
    const soundtrackSource = context.createMediaElementSource(soundtrack);
    soundtrackSource.connect(atmosphere);

    this.context = context;
    this.master = master;
    this.atmosphere = atmosphere;
    this.filter = filter;
    this.analyser = analyser;
    this.spectrum = new Uint8Array(analyser.frequencyBinCount);
    this.soundtrack = soundtrack;
    this.soundtrackSource = soundtrackSource;
  }
}
