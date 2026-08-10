export class AudioEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private atmosphere: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private soundtrack: HTMLAudioElement | null = null;
  private soundtrackSource: MediaElementAudioSourceNode | null = null;
  private enabled = false;

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
    const intensity = Math.max(0, Math.min(1, (progress - 0.35) / 0.6));
    this.atmosphere.gain.setTargetAtTime(0.78 + intensity * 0.18, now, 0.18);
    this.filter.frequency.setTargetAtTime(9_500 + intensity * 5_000, now, 0.22);
  }

  impact(): void {
    if (!this.enabled || !this.context || !this.master) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const now = this.context.currentTime;
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(72, now);
    oscillator.frequency.exponentialRampToValueAtTime(31, now + 0.65);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.72);
    oscillator.connect(gain).connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + 0.75);
  }

  async suspend(): Promise<void> {
    if (this.context?.state === 'running') await this.context.suspend();
  }

  async resume(): Promise<void> {
    if (this.enabled && this.context?.state === 'suspended') await this.context.resume();
  }

  reset(): void {
    this.setEnabled(false);
    if (this.soundtrack) {
      this.soundtrack.pause();
      this.soundtrack.currentTime = 0;
    }
  }

  dispose(): void {
    this.soundtrack?.pause();
    this.soundtrackSource?.disconnect();
    this.master?.disconnect();
    this.atmosphere?.disconnect();
    this.filter?.disconnect();
    if (this.soundtrack) {
      this.soundtrack.removeAttribute('src');
      this.soundtrack.load();
    }
    if (this.context) void this.context.close();
    this.context = null;
    this.soundtrack = null;
    this.soundtrackSource = null;
  }

  private createGraph(): void {
    const AudioContextConstructor = window.AudioContext;
    if (!AudioContextConstructor) return;

    const context = new AudioContextConstructor({ latencyHint: 'playback' });
    const master = context.createGain();
    const atmosphere = context.createGain();
    const filter = context.createBiquadFilter();
    master.gain.value = 0;
    atmosphere.gain.value = 0.78;
    filter.type = 'lowpass';
    filter.frequency.value = 9_500;
    filter.Q.value = 0.4;
    atmosphere.connect(filter).connect(master).connect(context.destination);

    const soundtrack = new Audio(this.soundtrackUrl);
    soundtrack.loop = true;
    soundtrack.preload = 'auto';
    const soundtrackSource = context.createMediaElementSource(soundtrack);
    soundtrackSource.connect(atmosphere);

    this.context = context;
    this.master = master;
    this.atmosphere = atmosphere;
    this.filter = filter;
    this.soundtrack = soundtrack;
    this.soundtrackSource = soundtrackSource;
  }
}
