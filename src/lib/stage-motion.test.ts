import { describe, expect, it } from 'vitest';
import {
  ACTIVE_FRAME_MS, IDLE_FRAME_MS, PULSE_HOLD_MS, SWEEP_MS,
  createRevealTracker, damp, detectReveal, drawProgress, energyTarget, frameBudget,
  layoutTarget, pulseTarget, sweepPosition,
} from './stage-motion';
import type { DrawRecord, Snapshot } from './types';

const NOW = 1_800_000_000_000;
const draw = (id: number): DrawRecord => ({ id, numbers: [id], createdAt: NOW });

function snapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    revision: 1,
    sessionId: 'session-a',
    config: { totalSamples: 100, drawCount: 1, noDuplicates: true },
    presentation: { scale: 1, view: 'current' },
    history: [],
    activeDraw: null,
    ...overrides,
  };
}

const drawing = (id: number, history: DrawRecord[] = []) =>
  snapshot({ history: [draw(id), ...history], activeDraw: { draw: draw(id), startedAt: NOW, durationMs: 2000 } });

describe('damped stage motion', () => {
  it('approaches its target without overshoot or jumps', () => {
    let value = 0;
    for (let frame = 0; frame < 60; frame += 1) {
      const next = damp(value, 1, 4, 1 / 60);
      expect(next).toBeGreaterThan(value);
      expect(next).toBeLessThan(1);
      value = next;
    }
    expect(value).toBeCloseTo(1 - Math.exp(-4), 5);
  });

  it('reaches the same value after one second at any frame rate', () => {
    const run = (fps: number) => {
      let value = 0;
      for (let frame = 0; frame < fps; frame += 1) value = damp(value, 1, 3, 1 / fps);
      return value;
    };
    expect(run(30)).toBeCloseTo(run(144), 10);
  });

  it('ignores empty or invalid time steps', () => {
    expect(damp(0.4, 1, 5, 0)).toBe(0.4);
    expect(damp(0.4, 1, 5, Number.NaN)).toBe(0.4);
  });
});

describe('draw suspense', () => {
  it('measures progress from the shared start time and clamps it', () => {
    const active = drawing(1);
    expect(drawProgress(active, NOW - 500)).toBe(0);
    expect(drawProgress(active, NOW + 500)).toBe(0.25);
    expect(drawProgress(active, NOW + 5000)).toBe(1);
    expect(drawProgress(snapshot(), NOW)).toBe(0);
    expect(drawProgress(undefined, NOW)).toBe(0);
  });

  it('builds energy on an ease-in curve and rests at zero', () => {
    expect(energyTarget(false, 0.8)).toBe(0);
    expect(energyTarget(true, 0)).toBeCloseTo(0.3);
    expect(energyTarget(true, 1)).toBeCloseTo(1);
    expect(energyTarget(true, 0.5) - energyTarget(true, 0)).toBeLessThan(energyTarget(true, 1) - energyTarget(true, 0.5));
  });

  it('sweeps light once across the reveal and holds the pulse only briefly', () => {
    expect(sweepPosition(-1)).toBe(-1);
    expect(sweepPosition(0)).toBe(0);
    expect(sweepPosition(SWEEP_MS / 2)).toBe(0.5);
    expect(sweepPosition(SWEEP_MS + 1)).toBe(-1);
    expect(pulseTarget(0)).toBe(1);
    expect(pulseTarget(PULSE_HOLD_MS)).toBe(0);
    expect(pulseTarget(Number.NEGATIVE_INFINITY)).toBe(0);
  });
});

describe('reveal detection', () => {
  it('fires once when the draw this window watched is committed', () => {
    const tracker = createRevealTracker(snapshot());
    expect(detectReveal(tracker, drawing(1))).toBe(false);
    expect(detectReveal(tracker, drawing(1))).toBe(false);
    expect(detectReveal(tracker, snapshot({ history: [draw(1)] }))).toBe(true);
    expect(detectReveal(tracker, snapshot({ history: [draw(1)] }))).toBe(false);
  });

  it('does not replay a draw that finished before the window opened', () => {
    const tracker = createRevealTracker(snapshot({ history: [draw(1)] }));
    expect(detectReveal(tracker, snapshot({ history: [draw(1)] }))).toBe(false);
  });

  it('follows a draw that was already running when the window opened', () => {
    const tracker = createRevealTracker(drawing(2, [draw(1)]));
    expect(detectReveal(tracker, snapshot({ history: [draw(2), draw(1)] }))).toBe(true);
  });

  it('forgets the running draw when a new session starts', () => {
    const tracker = createRevealTracker(drawing(1));
    expect(detectReveal(tracker, snapshot({ sessionId: 'session-b' }))).toBe(false);
    expect(detectReveal(tracker, snapshot({ sessionId: 'session-b', history: [draw(1)] }))).toBe(false);
  });

  it('survives a stage without a snapshot, such as the welcome screen', () => {
    const tracker = createRevealTracker();
    expect(detectReveal(tracker, undefined)).toBe(false);
    expect(detectReveal(tracker, drawing(1))).toBe(false);
    expect(detectReveal(tracker, snapshot({ history: [draw(1)] }))).toBe(true);
  });
});

describe('stage layout', () => {
  it('keeps the welcome hero to the right on wide screens only', () => {
    expect(layoutTarget('welcome', false, 4, 2).x).toBe(0.85);
    expect(layoutTarget('welcome', true, 1, 2).x).toBe(0);
  });

  it('tucks the sculpture toward the right edge beside results', () => {
    const tucked = layoutTarget('presentation', true, 4, 2);
    expect(tucked.x).toBeGreaterThan(3);
    expect(tucked.x).toBeLessThan(4);
    expect(tucked.y).toBeLessThan(0);
    expect(tucked.scale).toBeGreaterThan(1);
    expect(layoutTarget('preview', true, 4, 2)).toEqual(tucked);
  });

  it('centers an idle stage, lifting the controller preview clear of its heading', () => {
    expect(layoutTarget('presentation', false, 4, 2)).toEqual({ x: 0, y: 0, scale: 1 });
    const preview = layoutTarget('preview', false, 4, 2);
    expect(preview.x).toBe(0);
    expect(preview.y).toBeGreaterThan(0);
  });

  it('renders at 30 fps at rest and 60 fps while moving', () => {
    expect(frameBudget(false)).toBe(IDLE_FRAME_MS);
    expect(frameBudget(true)).toBe(ACTIVE_FRAME_MS);
    expect(IDLE_FRAME_MS).toBeCloseTo(1000 / 30);
  });
});
