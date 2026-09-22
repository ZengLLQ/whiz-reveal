import { describe, expect, it } from 'vitest';
import {
  createPreviewSnapshot,
  DRAW_DURATION_MS,
  drawPreview,
  finishPreviewDraw,
  isNewerSnapshot,
  resetPreviewSession,
  uniformRandomInt,
  updatePreviewConfig,
  updatePreviewPresentation,
} from './preview-model';

const NOW = 1_800_000_000_000;
const firstAvailable = () => 0;

describe('browser preview draw rules', () => {
  it('draws without replacement and exhausts the entire pool across draws', () => {
    let state = createPreviewSnapshot('session');
    state = updatePreviewConfig(state, { totalSamples: 5, drawCount: 3, noDuplicates: true });
    state = drawPreview(state, NOW, firstAvailable);
    const first = state.history[0].numbers;
    expect(new Set(first).size).toBe(3);
    state = finishPreviewDraw(state, NOW + DRAW_DURATION_MS);
    state = updatePreviewConfig(state, { ...state.config, drawCount: 2 });
    state = drawPreview(state, NOW + DRAW_DURATION_MS, firstAvailable);
    const all = state.history.flatMap((record) => record.numbers);
    expect([...all].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
    expect(state.history.map((record) => record.id)).toEqual([2, 1]);
    state = finishPreviewDraw(state, NOW + DRAW_DURATION_MS * 2);
    expect(() => drawPreview(state, NOW + DRAW_DURATION_MS * 2)).toThrow('Only 0 numbers remain');
    expect(state.history).toHaveLength(2);
  });

  it('allows repeated values within a draw when no duplicates is disabled', () => {
    let state = createPreviewSnapshot('session');
    state = updatePreviewConfig(state, { totalSamples: 1, drawCount: 5, noDuplicates: false });
    state = drawPreview(state, NOW, firstAvailable);
    expect(state.history[0].numbers).toEqual([1, 1, 1, 1, 1]);
  });

  it('excludes past winners even if they were drawn before the constraint was enabled', () => {
    let state = createPreviewSnapshot('session');
    state = updatePreviewConfig(state, { totalSamples: 3, drawCount: 2, noDuplicates: false });
    state = drawPreview(state, NOW, firstAvailable);
    expect(state.history[0].numbers).toEqual([1, 1]);
    state = finishPreviewDraw(state, NOW + DRAW_DURATION_MS);
    state = updatePreviewConfig(state, { ...state.config, noDuplicates: true });
    state = drawPreview(state, NOW + DRAW_DURATION_MS, firstAvailable);
    expect(state.history[0].numbers).toEqual([2, 3]);
  });

  it('allows a valid configuration larger than the remaining pool, then rejects the draw atomically', () => {
    const state = updatePreviewConfig(createPreviewSnapshot('session'), {
      totalSamples: 2, drawCount: 3, noDuplicates: true,
    });
    expect(() => drawPreview(state, NOW, () => { throw new Error('must not sample'); }))
      .toThrow('Only 2 numbers remain');
    expect(state.history).toEqual([]);
    expect(state.activeDraw).toBeNull();
  });

  it('commits winners before animation and finishes only after the shared deadline', () => {
    const state = drawPreview(createPreviewSnapshot('session'), NOW, firstAvailable);
    expect(state.history[0]).toBe(state.activeDraw?.draw);
    expect(state.activeDraw?.startedAt).toBe(NOW);
    expect(finishPreviewDraw(state, NOW + DRAW_DURATION_MS - 1)).toBe(state);
    const finished = finishPreviewDraw(state, NOW + DRAW_DURATION_MS);
    expect(finished.activeDraw).toBeNull();
    expect(finished.history).toBe(state.history);
    expect(finished.revision).toBe(state.revision + 1);
    expect(finishPreviewDraw(finished, NOW + DRAW_DURATION_MS + 1)).toBe(finished);
  });

  it('blocks draw, config, and reset while revealing, while accepting live presentation controls', () => {
    const state = drawPreview(createPreviewSnapshot('session'), NOW, firstAvailable);
    expect(() => drawPreview(state, NOW + 1)).toThrow('Wait for the current draw');
    expect(() => updatePreviewConfig(state, state.config)).toThrow('Wait for the current draw');
    expect(() => resetPreviewSession(state, 'new-session')).toThrow('Wait for the current draw');
    expect(updatePreviewPresentation(state, { scale: 1.5, view: 'history' }).presentation)
      .toEqual({ scale: 1.5, view: 'history' });
  });

  it('locks the pool after a draw and unlocks it on reset without losing settings', () => {
    let state = drawPreview(createPreviewSnapshot('session'), NOW, firstAvailable);
    state = finishPreviewDraw(state, NOW + DRAW_DURATION_MS);
    expect(() => updatePreviewConfig(state, { ...state.config, totalSamples: 300 })).toThrow('Reset the session');
    const reset = resetPreviewSession(state, 'new-session');
    expect(reset.sessionId).toBe('new-session');
    expect(reset.history).toEqual([]);
    expect(reset.config).toEqual(state.config);
    expect(reset.presentation).toEqual(state.presentation);
    expect(reset.revision).toBeGreaterThan(state.revision);
    expect(updatePreviewConfig(reset, { ...reset.config, totalSamples: 300 }).config.totalSamples).toBe(300);
  });
});

describe('configuration boundaries', () => {
  it.each([0, -1, 1.5, 1_000_001, Number.NaN, Number.POSITIVE_INFINITY])('rejects totalSamples=%s', (value) => {
    const state = createPreviewSnapshot('session');
    expect(() => updatePreviewConfig(state, { ...state.config, totalSamples: value })).toThrow('Total samples');
  });

  it.each([0, -1, 1.5, 501, Number.NaN, Number.POSITIVE_INFINITY])('rejects drawCount=%s', (value) => {
    const state = createPreviewSnapshot('session');
    expect(() => updatePreviewConfig(state, { ...state.config, drawCount: value })).toThrow('Number of draws');
  });

  it.each([0.49, 2.01, Number.NaN, Number.POSITIVE_INFINITY])('rejects scale=%s', (value) => {
    expect(() => updatePreviewPresentation(createPreviewSnapshot('session'), { scale: value, view: 'current' }))
      .toThrow('Display scale');
  });

  it('accepts the exact inclusive configuration and scale bounds', () => {
    const state = createPreviewSnapshot('session');
    expect(updatePreviewConfig(state, { totalSamples: 1, drawCount: 1, noDuplicates: true }).config.totalSamples).toBe(1);
    expect(updatePreviewConfig(state, { totalSamples: 1_000_000, drawCount: 500, noDuplicates: true }).config.drawCount).toBe(500);
    expect(updatePreviewPresentation(state, { scale: 0.5, view: 'current' }).presentation.scale).toBe(0.5);
    expect(updatePreviewPresentation(state, { scale: 2, view: 'history' }).presentation.scale).toBe(2);
  });
});

describe('state ordering and random sampling', () => {
  it('rejects stale fetch responses and duplicate events, including across session resets', () => {
    const old = createPreviewSnapshot('old');
    const updated = { ...old, revision: 4 };
    const reset = resetPreviewSession(updated, 'new');
    expect(isNewerSnapshot(null, old)).toBe(true);
    expect(isNewerSnapshot(updated, old)).toBe(false);
    expect(isNewerSnapshot(updated, updated)).toBe(false);
    expect(isNewerSnapshot(updated, reset)).toBe(true);
    expect(isNewerSnapshot(reset, updated)).toBe(false);
  });

  it('rejects the biased tail before mapping a uint32 to the target range', () => {
    const values = [0xffff_ffff, 0xffff_fffe, 17];
    let index = 0;
    expect(uniformRandomInt(10, () => values[index++])).toBe(7);
    expect(index).toBe(3);
  });

  it('handles a single-value random range', () => {
    expect(uniformRandomInt(1, () => 0xffff_ffff)).toBe(0);
  });
});
