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

  setEnabled(enabled: boolean): void {
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

  /** `strength` is the released charge; a light tap still registers. */
  impact(strength = 1): void {
    if (!this.enabled || !this.context || !this.master) return;
    const level = clamp(strength, 0.15, 1);
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const now = this.context.currentTime;
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(72 + level * 46, now);
    oscillator.frequency.exponentialRampToValueAtTime(31, now + 0.65);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.06 + level * 0.16, now + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5 + level * 0.4);
    oscillator.connect(gain).connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + 1);
  }

  /**
   * The sound of the object breaking open: a noise burst for the crack, over a
   * falling tone for the mass behind it.
   */
  fracture(): void {
    if (!this.enabled || !this.context || !this.master) return;
    const context = this.context;
    const now = context.currentTime;

    const length = Math.floor(context.sampleRate * 0.45);
    const noise = context.createBuffer(1, length, context.sampleRate);
    const channel = noise.getChannelData(0);
    for (let index = 0; index < length; index += 1) {
      // Decaying noise, sharpest at the moment of the break.
      channel[index] = (Math.random() * 2 - 1) * (1 - index / length) ** 3;
    }

    const source = context.createBufferSource();
    const crackFilter = context.createBiquadFilter();
    const crackGain = context.createGain();
    source.buffer = noise;
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
