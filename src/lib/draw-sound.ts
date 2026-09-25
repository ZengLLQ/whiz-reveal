import type { Snapshot } from './types';

/** Only draws observed in progress can produce a reveal cue. Restoring history is silent. */
export class DrawSoundTracker {
  private active: string | null = null;
  update(snapshot: Snapshot): 'shuffle' | 'reveal' | 'stop' {
    const key = snapshot.activeDraw ? `${snapshot.sessionId}/${snapshot.activeDraw.draw.id}` : null;
    const previous = this.active;
    this.active = key;
    if (key) return 'shuffle';
    return previous && snapshot.history.some(draw => `${snapshot.sessionId}/${draw.id}` === previous) ? 'reveal' : 'stop';
  }
}

/** Synthesized locally: no network, audio files, or additional runtime required. */
export class DrawSound {
  private context: AudioContext | null = null;
  private voices = new Set<OscillatorNode>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private generation = 0;

  unlock() {
    try {
      this.context ??= new AudioContext();
      void this.context.resume().catch(() => {});
    } catch { /* Audio is optional; drawing must still work on devices without audio. */ }
  }

  private tone(frequency: number, duration: number, volume: number, delay = 0) {
    const ctx = this.context;
    if (!ctx || ctx.state !== 'running') return;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    const start = ctx.currentTime + delay;
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain).connect(ctx.destination);
    this.voices.add(oscillator);
    oscillator.onended = () => { this.voices.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  click() {
    this.unlock();
    const generation = this.generation;
    void this.context?.resume().then(() => {
      if (generation === this.generation) this.tone(620, 0.09, 0.11);
    }).catch(() => {});
  }

  shuffle(startedAt: number, duration: number) {
    if (this.timer) return;
    const tick = () => {
      const progress = (Date.now() - startedAt) / duration;
      if (progress >= 1) { this.clearTimer(); return; }
      this.tone(260 + Math.max(0, progress) * 440, 0.055, 0.055);
    };
    tick();
    this.timer = setInterval(tick, 85);
  }

  reveal() {
    this.stop();
    [523.25, 659.25, 783.99].forEach((frequency, i) => this.tone(frequency, 0.55, 0.085, i * 0.065));
  }

  private clearTimer() { if (this.timer) clearInterval(this.timer); this.timer = null; }
  stop() {
    this.generation++;
    this.clearTimer();
    for (const voice of this.voices) { try { voice.stop(); } catch { /* Already ended. */ } }
    this.voices.clear();
  }
  dispose() { this.stop(); void this.context?.close().catch(() => {}); this.context = null; }
}
