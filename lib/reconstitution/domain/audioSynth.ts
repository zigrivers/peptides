export interface AudioSynthPlayer {
  playSwirlChime(): void;
  playSwoosh(): void;
  playNeedleSnap(): void;
  playTickClick(frequency?: number): void;
  resume(): Promise<void>;
}

class NullAudioPlayer implements AudioSynthPlayer {
  playSwirlChime() {}
  playSwoosh() {}
  playNeedleSnap() {}
  playTickClick() {}
  async resume() {}
}

class WebAudioPlayer implements AudioSynthPlayer {
  private ctx: AudioContext | null = null;

  private initCtx(): AudioContext | null {
    if (this.ctx) return this.ctx;
    try {
      if (typeof window !== 'undefined') {
        const AudioContextClass =
          window.AudioContext ||
          (window as unknown as Window & { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        if (AudioContextClass) {
          this.ctx = new AudioContextClass();
        }
      }
    } catch {
      this.ctx = null;
    }
    return this.ctx;
  }

  async resume() {
    const ctx = this.initCtx();
    if (ctx && ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch {
        // ignore resume errors in environments blocking audio interaction
      }
    }
  }

  playSwirlChime() {
    const ctx = this.initCtx();
    if (!ctx) return;
    this.resume();

    const now = ctx.currentTime;
    const frequencies = [880, 1100, 1320];
    frequencies.forEach((freq, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + index * 0.08);

      gain.gain.setValueAtTime(0, now + index * 0.08);
      gain.gain.linearRampToValueAtTime(0.08, now + index * 0.08 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.08 + 0.3);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + index * 0.08);
      osc.stop(now + index * 0.08 + 0.35);
    });
  }

  playSwoosh() {
    const ctx = this.initCtx();
    if (!ctx) return;
    this.resume();

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(200, now);
    osc.frequency.exponentialRampToValueAtTime(600, now + 0.3);

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.12, now + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.4);
  }

  playNeedleSnap() {
    const ctx = this.initCtx();
    if (!ctx) return;
    this.resume();

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1500, now);
    osc.frequency.exponentialRampToValueAtTime(150, now + 0.05);

    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.08);
  }

  playTickClick(frequency = 800) {
    const ctx = this.initCtx();
    if (!ctx) return;
    this.resume();

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(frequency, now);

    gain.gain.setValueAtTime(0.015, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.015);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.02);
  }
}

let playerInstance: AudioSynthPlayer | null = null;

export function getAudioPlayer(): AudioSynthPlayer {
  if (playerInstance) return playerInstance;
  
  if (typeof window === 'undefined') {
    playerInstance = new NullAudioPlayer();
  } else {
    try {
      playerInstance = new WebAudioPlayer();
    } catch {
      playerInstance = new NullAudioPlayer();
    }
  }
  return playerInstance;
}
