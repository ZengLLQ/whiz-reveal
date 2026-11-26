import type { DrawRecord, Snapshot } from './types';

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
/** The silent breath before a reveal: at most this long, and at most this share of the draw. */
export const BREATH_MAX_MS = 240;
export const BREATH_SHARE = 0.12;
/** During that breath the stage exhales to this share of the energy it had when the breath began. */
export const BREATH_EXHALE = 0.8;
/** Sculpture spin, in radians per second at full energy. */
export const SPIN_PER_ENERGY = 1.4;
/** How much closer the camera comes at full energy, as a share of its resting distance. */
export const DOLLY_SHARE = 0.07;
/** How long the reveal holds the dust's outward push before releasing it. */
export const DUST_PUSH_HOLD_MS = 420;
/** How far a full push moves a speck beside the sculpture, in world units. */
export const DUST_PUSH_REACH = 0.4;
/** Damping rates of the push: a soft attack, then a long release. */
export const DUST_PUSH_ATTACK = 4.5;
export const DUST_PUSH_RELEASE = 1.4;
/**
 * Below this push the specks drift back at about 0.034 world units per second
 * (reach x release x push), no faster than the ambient drift (0.16 amplitude at
 * 0.21 rad/s in the dust shader) that the 30 fps idle budget already renders smoothly.
 */
export const DUST_PUSH_SETTLED = 0.06;
/** Strength of the light pool behind the sculpture: at rest, and its ceiling. */
export const GLOW_REST = 0.2;
export const GLOW_MAX = 0.46;

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

/**
 * Length of the hush just before a reveal. The score stops its beat for this
 * long and the stage exhales over the same window, so sight and sound land the
 * reveal together. Shared by draw-sound.ts and the stage renderer.
 */
export function preRevealBreathMs(durationMs: number): number {
  return durationMs > 0 ? Math.min(BREATH_MAX_MS, durationMs * BREATH_SHARE) : 0;
}

/**
 * True during the pre-reveal breath of the running draw. It stays true after the
 * nominal end until the committed result arrives, so the stage holds its breath
 * instead of building again while the reveal is in flight.
 */
export function isPreRevealBreath(snapshot: Snapshot | undefined, now: number): boolean {
  const active = snapshot?.activeDraw;
  if (!active || !(active.durationMs > 0)) return false;
  return active.startedAt + active.durationMs - now < preRevealBreathMs(active.durationMs);
}

/**
 * Energy target during the breath. The exhale is proportional to the energy the
 * breath began with, so short draws, whose damped energy is still low, ease back as
 * visibly as long ones; a draw at full energy exhales to 0.8.
 */
export function breathEnergyTarget(energyAtBreath: number): number {
  return Math.max(0, energyAtBreath) * BREATH_EXHALE;
}

/**
 * The spin builds with energy only while the draw builds. It holds from the
 * breath onward, through the reveal, so the form slows into the result instead
 * of being kicked again as the energy decays.
 */
export function spinRate(energy: number, building: boolean): number {
  return building ? Math.max(0, energy) * SPIN_PER_ENERGY : 0;
}

/** Sweep position from 0 to 1 while the reveal light crosses the form, otherwise -1. */
export function sweepPosition(sinceRevealMs: number): number {
  return sinceRevealMs >= 0 && sinceRevealMs <= SWEEP_MS ? sinceRevealMs / SWEEP_MS : -1;
}

/** A soft 0 → 1 → 0 envelope over the sweep, for looks that cannot draw a travelling band. */
export function sweepEnvelope(sweep: number): number {
  return sweep >= 0 && sweep <= 1 ? Math.sin(Math.PI * sweep) : 0;
}

/** Brightening target for the reveal: held briefly at full strength, then released. */
export function pulseTarget(sinceRevealMs: number): number {
  return sinceRevealMs >= 0 && sinceRevealMs < PULSE_HOLD_MS ? 1 : 0;
}

/** Outward push of the dust at the reveal: held while the light sweeps out, then released. */
export function dustPushTarget(sinceRevealMs: number): number {
  return sinceRevealMs >= 0 && sinceRevealMs < DUST_PUSH_HOLD_MS ? 1 : 0;
}

/** Strength of the light pool behind the sculpture; it brightens with suspense and the reveal. */
export function glowStrength(energy: number, pulse: number): number {
  const clamp = (value: number) => Math.min(1, Math.max(0, value));
  return Math.min(GLOW_MAX, GLOW_REST + 0.12 * clamp(energy) + 0.14 * clamp(pulse));
}

/** Camera distance for the current energy: it eases in during a draw and back out afterwards. */
export function dollyDistance(baseDistance: number, energy: number): number {
  return baseDistance * (1 - DOLLY_SHARE * Math.min(1, Math.max(0, energy)));
}

/**
 * Camera position for the dolly. The camera moves along the line from its resting
 * place to the sculpture and keeps looking straight ahead, so the form grows by
 * the dolly share while its centre keeps its place on screen, even when it is
 * tucked beside the results.
 */
export function dollyCamera(baseDistance: number, layout: Pick<StageLayout, 'x' | 'y'>, energy: number): { x: number; y: number; z: number } {
  const z = dollyDistance(baseDistance, energy);
  const travelled = 1 - z / baseDistance;
  return { x: layout.x * travelled, y: layout.y * travelled, z };
}

/**
 * Visible half extents of the z = 0 plane for a camera at `distance`. Layout is
 * always measured at the resting distance, so the dolly never moves the layout
 * target.
 */
export function frameHalfExtents(distance: number, aspect: number, fieldOfViewDegrees: number): { halfWidth: number; halfHeight: number } {
  const halfHeight = Math.tan((fieldOfViewDegrees * Math.PI) / 360) * distance;
  return { halfWidth: halfHeight * aspect, halfHeight };
}

/** The draw-driven values that, while they still move visibly, keep the stage at the 60 fps budget. */
export interface Choreography { energy: number; pulse: number; push: number; sweep: number }

/** True once the draw's energy, the reveal's sweep and pulse, and the dust push no longer move visibly. */
export function choreographySettled({ energy, pulse, push, sweep }: Choreography): boolean {
  return energy <= 0.01 && pulse <= 0.01 && push <= DUST_PUSH_SETTLED && sweep < 0;
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
 * Returns the committed draw exactly once: when the draw this window watched
 * running is now in history. Opening a window after a draw finished never replays
 * it, and starting a new session forgets the previous draw. Otherwise null.
 */
export function detectRevealedDraw(tracker: RevealTracker, snapshot: Snapshot | undefined): DrawRecord | null {
  const sessionId = snapshot?.sessionId;
  const activeKey = activeKeyOf(snapshot);
  let revealed: DrawRecord | null = null;
  if (sessionId !== tracker.sessionId) {
    tracker.sessionId = sessionId;
  } else if (tracker.activeKey && !activeKey) {
    revealed = snapshot?.history.find((draw) => `${sessionId}/${draw.id}` === tracker.activeKey) ?? null;
  }
  tracker.activeKey = activeKey;
  return revealed;
}

/** True exactly once per watched reveal; see detectRevealedDraw. The stage and the score both use it. */
export function detectReveal(tracker: RevealTracker, snapshot: Snapshot | undefined): boolean {
  return detectRevealedDraw(tracker, snapshot) !== null;
}

function activeKeyOf(snapshot: Snapshot | undefined): string | null {
  const active = snapshot?.activeDraw;
  return active ? `${snapshot?.sessionId}/${active.draw.id}` : null;
}
