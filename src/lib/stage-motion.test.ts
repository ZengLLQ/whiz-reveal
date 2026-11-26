import { describe, expect, it } from 'vitest';
import {
  ACTIVE_FRAME_MS, BREATH_EXHALE, BREATH_MAX_MS, DOLLY_SHARE, DUST_PUSH_HOLD_MS, DUST_PUSH_REACH, DUST_PUSH_RELEASE,
  DUST_PUSH_SETTLED, GLOW_MAX, GLOW_REST, IDLE_FRAME_MS, PULSE_HOLD_MS, SPIN_PER_ENERGY, SWEEP_MS,
  breathEnergyTarget, choreographySettled, createRevealTracker, damp, detectReveal, detectRevealedDraw, dollyCamera,
  dollyDistance, drawProgress, dustPushTarget, energyTarget, frameBudget, frameHalfExtents, glowStrength,
  isPreRevealBreath, layoutTarget, preRevealBreathMs, pulseTarget, spinRate, sweepEnvelope, sweepPosition,
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

describe('pre-reveal breath', () => {
  it('reserves the same breath as the score: 12% of the draw, at most 240 ms', () => {
    expect(preRevealBreathMs(1000)).toBeCloseTo(120);
    expect(preRevealBreathMs(1600)).toBeCloseTo(192);
    expect(preRevealBreathMs(5000)).toBe(240);
    expect(preRevealBreathMs(30_000)).toBe(BREATH_MAX_MS);
    expect(preRevealBreathMs(0)).toBe(0);
    expect(preRevealBreathMs(-500)).toBe(0);
    expect(preRevealBreathMs(Number.NaN)).toBe(0);
  });

  it('holds the breath from its start until the committed result arrives', () => {
    const active = drawing(1); // 2000 ms: a 240 ms breath
    expect(isPreRevealBreath(active, NOW + 1000)).toBe(false);
    expect(isPreRevealBreath(active, NOW + 2000 - 241)).toBe(false);
    expect(isPreRevealBreath(active, NOW + 2000 - 200)).toBe(true);
    expect(isPreRevealBreath(active, NOW + 2600)).toBe(true);
    expect(isPreRevealBreath(snapshot({ history: [draw(1)] }), NOW + 1900)).toBe(false);
    expect(isPreRevealBreath(undefined, NOW)).toBe(false);
  });

  it('exhales to 0.8 at full energy, and by the same share at any energy', () => {
    expect(breathEnergyTarget(1)).toBeCloseTo(0.8);
    expect(BREATH_EXHALE).toBeCloseTo(0.8);
    for (const energy of [0.95, 0.6, 0.3]) {
      expect(breathEnergyTarget(energy)).toBeLessThan(energy);
      expect(breathEnergyTarget(energy) / energy).toBeCloseTo(BREATH_EXHALE);
    }
    expect(breathEnergyTarget(0)).toBe(0);
    expect(breathEnergyTarget(-1)).toBe(0);
  });

  it('eases back visibly within the breath of the default 1.6 s draw', () => {
    // Simulate the stage's own damping at 60 fps: build-up (lambda 2.2), then the breath (lambda 7).
    const duration = 1600;
    const breath = preRevealBreathMs(duration);
    const frame = 1000 / 60;
    let energy = 0;
    for (let t = 0; t < duration - breath; t += frame) energy = damp(energy, energyTarget(true, t / duration), 2.2, frame / 1000);
    const atBreath = energy;
    for (let t = 0; t < breath; t += frame) energy = damp(energy, breathEnergyTarget(atBreath), 7, frame / 1000);
    expect(atBreath).toBeGreaterThan(0.5);
    expect(atBreath).toBeLessThan(BREATH_EXHALE);
    expect(atBreath - energy).toBeGreaterThan(0.07);
  });

  it('spins with energy only while the draw builds, holding from the breath through the reveal', () => {
    expect(spinRate(1, true)).toBe(SPIN_PER_ENERGY);
    expect(spinRate(0.5, true)).toBeCloseTo(SPIN_PER_ENERGY / 2);
    expect(spinRate(1, false)).toBe(0);
    expect(spinRate(0.8, false)).toBe(0);
    expect(spinRate(-1, true)).toBe(0);
  });
});

describe('reveal choreography', () => {
  it('pushes the dust out while the light sweeps, then releases it', () => {
    expect(dustPushTarget(-1)).toBe(0);
    expect(dustPushTarget(0)).toBe(1);
    expect(dustPushTarget(DUST_PUSH_HOLD_MS - 1)).toBe(1);
    expect(dustPushTarget(DUST_PUSH_HOLD_MS)).toBe(0);
    expect(dustPushTarget(Number.POSITIVE_INFINITY)).toBe(0);
    expect(DUST_PUSH_HOLD_MS).toBeGreaterThan(PULSE_HOLD_MS);
    expect(DUST_PUSH_HOLD_MS).toBeLessThan(SWEEP_MS);
  });

  it('lets the push tail fall back to the idle budget once it moves no faster than the drift', () => {
    const rest = { energy: 0, pulse: 0, push: 0, sweep: -1 };
    expect(choreographySettled(rest)).toBe(true);
    expect(choreographySettled({ ...rest, push: DUST_PUSH_SETTLED })).toBe(true);
    expect(choreographySettled({ ...rest, push: 0.1 })).toBe(false);
    expect(choreographySettled({ ...rest, energy: 0.02 })).toBe(false);
    expect(choreographySettled({ ...rest, pulse: 0.02 })).toBe(false);
    expect(choreographySettled({ ...rest, sweep: 0 })).toBe(false);
    // At the threshold the specks return at about the ambient drift's peak speed (0.16 x 0.21 units/s).
    expect(DUST_PUSH_REACH * DUST_PUSH_RELEASE * DUST_PUSH_SETTLED).toBeLessThanOrEqual(0.16 * 0.21 + 0.001);
  });

  it('settles the push about as soon as the energy, not seconds later', () => {
    // From a typical 0.75 peak, held for DUST_PUSH_HOLD_MS, then released; energy decays from 0.8.
    const step = 1 / 60;
    let push = 0.75;
    let energy = 0.8;
    let pushSettled = 0;
    let energySettled = 0;
    for (let t = 0; t < 6; t += step) {
      if (t * 1000 >= DUST_PUSH_HOLD_MS) push = damp(push, 0, DUST_PUSH_RELEASE, step);
      energy = damp(energy, 0, 2.2, step);
      if (!pushSettled && push <= DUST_PUSH_SETTLED) pushSettled = t;
      if (!energySettled && energy <= 0.01) energySettled = t;
    }
    expect(pushSettled).toBeLessThan(energySettled + 0.5);
  });

  it('rounds the sweep into a soft envelope for looks that cannot draw a band', () => {
    expect(sweepEnvelope(-1)).toBe(0);
    expect(sweepEnvelope(0)).toBe(0);
    expect(sweepEnvelope(0.5)).toBeCloseTo(1);
    expect(sweepEnvelope(1)).toBeCloseTo(0);
    expect(sweepEnvelope(1.2)).toBe(0);
  });

  it('lifts the light pool with suspense and the reveal, within its ceiling', () => {
    expect(glowStrength(0, 0)).toBe(GLOW_REST);
    expect(glowStrength(0.5, 0)).toBeGreaterThan(GLOW_REST);
    expect(glowStrength(1, 0)).toBeGreaterThan(glowStrength(0.5, 0));
    expect(glowStrength(1, 1)).toBeGreaterThan(glowStrength(1, 0));
    expect(glowStrength(1, 1)).toBeLessThanOrEqual(GLOW_MAX);
    expect(glowStrength(5, 5)).toBe(glowStrength(1, 1));
    expect(glowStrength(-1, -1)).toBe(GLOW_REST);
  });
});

describe('camera dolly', () => {
  it('comes 6–8% closer at full energy and rests at its base distance', () => {
    expect(dollyDistance(7.7, 0)).toBe(7.7);
    const closer = 1 - dollyDistance(7.7, 1) / 7.7;
    expect(closer).toBeCloseTo(DOLLY_SHARE);
    expect(closer).toBeGreaterThanOrEqual(0.06);
    expect(closer).toBeLessThanOrEqual(0.08);
    expect(dollyDistance(7.7, 3)).toBe(dollyDistance(7.7, 1));
    expect(dollyDistance(7.7, -1)).toBe(7.7);
  });

  it('measures the frame from a camera distance, which is why layout uses the resting one', () => {
    const rest = frameHalfExtents(7.7, 16 / 9, 34);
    expect(rest.halfHeight).toBeCloseTo(Math.tan((17 * Math.PI) / 180) * 7.7);
    expect(rest.halfWidth).toBeCloseTo((rest.halfHeight * 16) / 9);
    // Measured from the dollied camera, the tucked target would creep inward during every draw.
    const dollied = frameHalfExtents(dollyDistance(7.7, 1), 16 / 9, 34);
    expect(layoutTarget('presentation', true, dollied.halfWidth, dollied.halfHeight).x)
      .toBeLessThan(layoutTarget('presentation', true, rest.halfWidth, rest.halfHeight).x);
  });

  it('moves toward the sculpture, so a tucked form grows in place instead of sliding off screen', () => {
    const base = 7.7;
    const { halfWidth, halfHeight } = frameHalfExtents(base, 16 / 9, 34);
    const tucked = layoutTarget('presentation', true, halfWidth, halfHeight);
    // Where the sculpture's centre lands on screen, as a share of the half frame at rest.
    const onScreen = (eye: { x: number; y: number; z: number }) => ({
      x: (tucked.x - eye.x) / eye.z / (halfWidth / base),
      y: (tucked.y - eye.y) / eye.z / (halfHeight / base),
    });
    const resting = dollyCamera(base, tucked, 0);
    expect([resting.x, resting.y, resting.z].map((value) => value + 0)).toEqual([0, 0, base]);
    const atRest = onScreen(resting);
    for (const energy of [0.3, 0.8, 1]) {
      const eye = dollyCamera(base, tucked, energy);
      expect(eye.z).toBeCloseTo(dollyDistance(base, energy));
      expect(onScreen(eye).x).toBeCloseTo(atRest.x, 10);
      expect(onScreen(eye).y).toBeCloseTo(atRest.y, 10);
      // The camera really comes closer to the form, by the dolly share at full energy.
      const distance = Math.hypot(tucked.x - eye.x, tucked.y - eye.y, eye.z);
      expect(distance / Math.hypot(tucked.x, tucked.y, base)).toBeCloseTo(1 - DOLLY_SHARE * energy);
    }
    expect(dollyCamera(base, { x: 0, y: 0 }, 1)).toEqual({ x: 0, y: 0, z: dollyDistance(base, 1) });
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

  it('names the committed draw it revealed, once', () => {
    const tracker = createRevealTracker(snapshot({ history: [draw(1)] }));
    expect(detectRevealedDraw(tracker, drawing(2, [draw(1)]))).toBeNull();
    const committed = snapshot({ history: [draw(2), draw(1)] });
    expect(detectRevealedDraw(tracker, committed)).toEqual(draw(2));
    expect(detectRevealedDraw(tracker, committed)).toBeNull();
    // A window that opens on committed results, or a view switch, never names a reveal.
    const opened = createRevealTracker(committed);
    expect(detectRevealedDraw(opened, committed)).toBeNull();
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
