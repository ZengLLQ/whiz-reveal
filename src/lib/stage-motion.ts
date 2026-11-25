import type { Snapshot } from './types';

/** Where a stage is shown. Each mode places the sculpture differently. */
export type StageMode = 'welcome' | 'preview' | 'presentation';

/** Position and size of the sculpture in world units, measured on the z = 0 plane. */
export interface StageLayout { x: number; y: number; scale: number }

/** How long the reveal's band of light takes to cross the sculpture. */
export const SWEEP_MS = 1100;
/** How long the reveal brightening holds before it starts to decay. */
export const PULSE_HOLD_MS = 140;
/** Frame budget at rest, and while something is visibly changing. */
export const IDLE_FRAME_MS = 1000 / 30;
export const ACTIVE_FRAME_MS = 1000 / 60;

/**
 * Moves `current` toward `target` by an exponential approach. Unlike a fixed
 * per-frame factor, the result after one second is the same at 30, 60, or 144 fps,
 * and the value never jumps, which is what makes reveal effects feel smooth.
 */
export function damp(current: number, target: number, lambda: number, deltaSeconds: number): number {
  if (!(deltaSeconds > 0)) return current;
  return current + (target - current) * (1 - Math.exp(-lambda * deltaSeconds));
}

/** Progress of the running draw from 0 to 1, or 0 when nothing is drawing. */
export function drawProgress(snapshot: Snapshot | undefined, now: number): number {
  const active = snapshot?.activeDraw;
  if (!active || !(active.durationMs > 0)) return 0;
  return Math.min(1, Math.max(0, (now - active.startedAt) / active.durationMs));
}

/** Suspense builds on an ease-in curve, so the final moments carry the most energy. */
export function energyTarget(drawing: boolean, progress: number): number {
  if (!drawing) return 0;
  const clamped = Math.min(1, Math.max(0, progress));
  return 0.3 + 0.7 * clamped * clamped;
}

/** Sweep position from 0 to 1 while the reveal light crosses the form, otherwise -1. */
export function sweepPosition(sinceRevealMs: number): number {
  return sinceRevealMs >= 0 && sinceRevealMs <= SWEEP_MS ? sinceRevealMs / SWEEP_MS : -1;
}

/** Brightening target for the reveal: held briefly at full strength, then released. */
export function pulseTarget(sinceRevealMs: number): number {
  return sinceRevealMs >= 0 && sinceRevealMs < PULSE_HOLD_MS ? 1 : 0;
}

/**
 * Resting place for the sculpture. Results take the center, so an occupied
 * stage tucks the sculpture toward the right edge, as v1.6.1 did with CSS. Doing
 * it in the scene keeps the render sharp and lets the move blend with rotation.
 */
export function layoutTarget(mode: StageMode, occupied: boolean, halfWidth: number, halfHeight: number): StageLayout {
  if (mode === 'welcome') return { x: halfWidth > halfHeight ? 0.85 : 0, y: 0, scale: 1 };
  if (occupied) return { x: halfWidth * 0.92, y: -halfHeight * 0.18, scale: 1.2 };
  // The controller preview prints its heading low in the frame; lift the form clear of it.
  return { x: 0, y: mode === 'preview' ? halfHeight * 0.12 : 0, scale: mode === 'preview' ? 0.92 : 1 };
}

/** Rendering slows to the idle budget once nothing is visibly changing. */
export function frameBudget(animating: boolean): number {
  return animating ? ACTIVE_FRAME_MS : IDLE_FRAME_MS;
}

/** Remembers the running draw so the reveal fires once, only after a live draw. */
export interface RevealTracker { sessionId: string | undefined; activeKey: string | null }

export function createRevealTracker(snapshot?: Snapshot): RevealTracker {
  return { sessionId: snapshot?.sessionId, activeKey: activeKeyOf(snapshot) };
}

/**
 * Returns true exactly once: when the draw this window watched running is now
 * committed to history. Opening a window after a draw finished never replays it,
 * and starting a new session forgets the previous draw.
 */
export function detectReveal(tracker: RevealTracker, snapshot: Snapshot | undefined): boolean {
  const sessionId = snapshot?.sessionId;
  const activeKey = activeKeyOf(snapshot);
  let revealed = false;
  if (sessionId !== tracker.sessionId) {
    tracker.sessionId = sessionId;
  } else if (tracker.activeKey && !activeKey) {
    revealed = !!snapshot?.history.some((draw) => `${sessionId}/${draw.id}` === tracker.activeKey);
  }
  tracker.activeKey = activeKey;
  return revealed;
}

function activeKeyOf(snapshot: Snapshot | undefined): string | null {
  const active = snapshot?.activeDraw;
  return active ? `${snapshot?.sessionId}/${active.draw.id}` : null;
}
