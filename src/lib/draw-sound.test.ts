import { afterEach, describe, expect, it, vi } from 'vitest';
import { DrawSound, DrawSoundTracker } from './draw-sound';
import { createPreviewSnapshot, drawPreview, finishPreviewDraw, resetPreviewSession } from './preview-model';

describe('draw sound lifecycle', () => {
  const drawing = () => drawPreview(createPreviewSnapshot('test'), 1000, () => 0);
  it('does not announce restored history', () => {
    expect(new DrawSoundTracker().update(finishPreviewDraw(drawing(), 3000))).toBe('stop');
  });
  it('announces completion once, even when snapshots repeat', () => {
    const tracker = new DrawSoundTracker();
    const active = drawing();
    expect(tracker.update(active)).toBe('shuffle');
    expect(tracker.update({ ...active, revision: active.revision + 1 })).toBe('shuffle');
    const done = finishPreviewDraw(active, 3000);
    expect(tracker.update(done)).toBe('reveal');
    expect(tracker.update(done)).toBe('stop');
  });
  it('does not play a winner cue on reset or session replacement', () => {
    const tracker = new DrawSoundTracker();
    tracker.update(drawing());
    expect(tracker.update(resetPreviewSession(finishPreviewDraw(drawing(), 3000), 'next'))).toBe('stop');
  });
});

describe('synthesized audio scheduling', () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
  function setup() {
    const voices: { stop: ReturnType<typeof vi.fn> }[] = [];
    const parameter = { value: 0, setValueAtTime: vi.fn(), setTargetAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() };
    const node = () => ({ connect: vi.fn(), disconnect: vi.fn() });
    const context = {
      state: 'running', currentTime: 0, sampleRate: 100, destination: {}, resume: vi.fn(async () => {}), close: vi.fn(async () => {}),
      createGain: () => ({ gain: parameter, ...node() }),
      createDynamicsCompressor: () => ({ threshold: {}, knee: {}, ratio: {}, attack: {}, release: {}, ...node() }),
      createConvolver: () => ({ buffer: null, ...node() }),
      createBuffer: (_channels: number, length: number) => ({ getChannelData: () => new Float32Array(length) }),
      createBiquadFilter: () => ({ type: 'lowpass', frequency: {}, ...node() }),
      createOscillator: () => {
        const voice = { frequency: parameter, detune: {}, type: 'sine', start: vi.fn(), stop: vi.fn(), ...node(), onended: null };
        voices.push(voice); return voice;
      },
    };
    vi.stubGlobal('AudioContext', class { constructor() { return context; } });
    return { engine: new DrawSound(), voices, context };
  }
  it('cancels a pending click when muted before resume resolves', async () => {
    const { engine, voices } = setup();
    engine.click(); engine.stop(); await Promise.resolve();
    expect(voices).toHaveLength(0);
  });
  it('bounds shuffle duration and stops all scheduled voices when muted', () => {
    vi.useFakeTimers(); vi.setSystemTime(1000);
    const { engine, voices } = setup(); engine.unlock();
    engine.shuffle(1000, 1600); engine.shuffle(1000, 1600);
    vi.advanceTimersByTime(1700);
    expect(voices.length).toBeGreaterThan(5);
    const count = voices.length; vi.advanceTimersByTime(2000);
    expect(voices).toHaveLength(count);
    engine.reveal(); expect(voices).toHaveLength(count + 7);
    engine.stop(); expect(voices.every(voice => voice.stop.mock.calls.length >= 2)).toBe(true);
  });
  it('continues without throwing when audio hardware is unavailable', () => {
    vi.stubGlobal('AudioContext', class { constructor() { throw new Error('Unavailable'); } });
    const engine = new DrawSound();
    expect(() => { engine.click(); engine.reveal(); engine.dispose(); }).not.toThrow();
  });
});
