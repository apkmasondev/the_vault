export class AudioEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private atmosphere: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private sources: AudioScheduledSourceNode[] = [];
  private enabled = false;

  async start(enabled: boolean): Promise<void> {
    if (!this.context) this.createGraph();
    if (!this.context) return;
    if (this.context.state === 'suspended') await this.context.resume();
    this.setEnabled(enabled);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!this.context || !this.master) return;
    const now = this.context.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(enabled ? 0.16 : 0, now + (enabled ? 0.55 : 0.32));
  }

  update(progress: number): void {
    if (!this.context || !this.atmosphere || !this.filter) return;
    const now = this.context.currentTime;
    const intensity = Math.max(0, Math.min(1, (progress - 0.35) / 0.6));
    this.atmosphere.gain.setTargetAtTime(0.42 + intensity * 0.25, now, 0.18);
    this.filter.frequency.setTargetAtTime(190 + intensity * 260, now, 0.22);
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

  dispose(): void {
    this.sources.forEach((source) => {
      try {
        source.stop();
      } catch {
        // A source may already have stopped naturally.
      }
      source.disconnect();
    });
    this.sources = [];
    this.master?.disconnect();
    this.atmosphere?.disconnect();
    this.filter?.disconnect();
    if (this.context) void this.context.close();
    this.context = null;
  }

  private createGraph(): void {
    const AudioContextConstructor = window.AudioContext;
    if (!AudioContextConstructor) return;

    const context = new AudioContextConstructor({ latencyHint: 'playback' });
    const master = context.createGain();
    const atmosphere = context.createGain();
    const filter = context.createBiquadFilter();
    master.gain.value = 0;
    atmosphere.gain.value = 0.42;
    filter.type = 'lowpass';
    filter.frequency.value = 190;
    filter.Q.value = 0.55;
    atmosphere.connect(filter).connect(master).connect(context.destination);

    const first = context.createOscillator();
    const second = context.createOscillator();
    first.type = 'sine';
    second.type = 'triangle';
    first.frequency.value = 36.7;
    second.frequency.value = 55.1;
    const firstGain = context.createGain();
    const secondGain = context.createGain();
    firstGain.gain.value = 0.32;
    secondGain.gain.value = 0.055;
    first.connect(firstGain).connect(atmosphere);
    second.connect(secondGain).connect(atmosphere);

    const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const data = buffer.getChannelData(0);
    let seed = 0x71e4ab3;
    for (let index = 0; index < data.length; index += 1) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      data[index] = (seed / 0xffffffff) * 2 - 1;
    }
    const noise = context.createBufferSource();
    const noiseGain = context.createGain();
    noise.buffer = buffer;
    noise.loop = true;
    noiseGain.gain.value = 0.018;
    noise.connect(noiseGain).connect(atmosphere);

    first.start();
    second.start();
    noise.start();
    this.context = context;
    this.master = master;
    this.atmosphere = atmosphere;
    this.filter = filter;
    this.sources = [first, second, noise];
  }
}
