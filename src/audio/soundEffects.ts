/**
 * Procedural Web Audio Sound Synthesizer
 * Generates synthetic high-tech chimes, spring bounce resonances, and clicks without external assets.
 */

class SoundSynthesizer {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;

  private initContext() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  /**
   * Play a bouncy crystal chime when a 3D model is clicked.
   * Model index maps to a pentatonic harmonic scale.
   */
  public playBounce(modelIndex: number = 0, intensity: number = 1.0) {
    if (this.isMuted) return;
    try {
      this.initContext();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      // Pentatonic scale based on F#4: F#4 (370Hz), G#4 (415Hz), A#4 (466Hz), C#5 (554Hz), D#5 (622Hz), F#5 (740Hz), G#5 (830Hz)
      const baseFreqs = [369.99, 415.30, 466.16, 554.37, 622.25, 739.99, 830.61];
      const rootFreq = baseFreqs[modelIndex % baseFreqs.length];

      // Primary oscillator (Sine with spring pitch bend)
      const osc1 = this.ctx.createOscillator();
      const gain1 = this.ctx.createGain();

      osc1.type = 'sine';
      // Initial pop then spring wobble
      osc1.frequency.setValueAtTime(rootFreq * 1.5, now);
      osc1.frequency.exponentialRampToValueAtTime(rootFreq * 0.9, now + 0.08);
      osc1.frequency.exponentialRampToValueAtTime(rootFreq, now + 0.25);

      gain1.gain.setValueAtTime(0.001, now);
      gain1.gain.linearRampToValueAtTime(0.25 * intensity, now + 0.02);
      gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.65);

      // Secondary metallic overtone (Triangle wave 2.76x overtone for bell/crystal resonance)
      const osc2 = this.ctx.createOscillator();
      const gain2 = this.ctx.createGain();

      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(rootFreq * 2.76, now);
      osc2.frequency.exponentialRampToValueAtTime(rootFreq * 2.0, now + 0.15);

      gain2.gain.setValueAtTime(0.001, now);
      gain2.gain.linearRampToValueAtTime(0.12 * intensity, now + 0.015);
      gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);

      // Connect to master
      osc1.connect(gain1);
      osc2.connect(gain2);

      gain1.connect(this.ctx.destination);
      gain2.connect(this.ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.7);
      osc2.stop(now + 0.7);
    } catch {
      // Audio playback fails gracefully if browser restricts
    }
  }

  /**
   * Wave cascade sound for semicircle ripple bounce
   */
  public playWaveStep(index: number) {
    if (this.isMuted) return;
    setTimeout(() => {
      this.playBounce(index, 0.7);
    }, index * 90);
  }

  /**
   * Sound played when long-pressing and lifting/grabbing a model (iOS style)
   */
  public playGrab() {
    if (this.isMuted) return;
    try {
      this.initContext();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(640, now + 0.12);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.18, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.22);
    } catch {
      // Ignore
    }
  }

  /**
   * Sound played when models shift/slide over to make room (iOS icon shift)
   */
  public playShift() {
    if (this.isMuted) return;
    try {
      this.initContext();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(320, now + 0.04);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.06, now + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.055);
    } catch {
      // Ignore
    }
  }

  /**
   * Sound played when two models swap slots
   */
  public playSwap() {
    if (this.isMuted) return;
    try {
      this.initContext();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;

      // Crisp double pop chord
      [580, 880].forEach((freq, idx) => {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'triangle';
        const start = now + idx * 0.05;
        osc.frequency.setValueAtTime(freq * 1.2, start);
        osc.frequency.exponentialRampToValueAtTime(freq, start + 0.08);

        gain.gain.setValueAtTime(0.001, start);
        gain.gain.linearRampToValueAtTime(0.16, start + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.25);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(start);
        osc.stop(start + 0.26);
      });
    } catch {
      // Ignore
    }
  }

  /**
   * UI Click feedback
   */
  public playClick() {
    if (this.isMuted) return;
    try {
      this.initContext();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, now);
      osc.frequency.exponentialRampToValueAtTime(400, now + 0.04);

      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.04);
    } catch {
      // Ignore
    }
  }
}

export const soundEffects = new SoundSynthesizer();
