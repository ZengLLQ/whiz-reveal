/** Stagger between neighbouring tiles' spring entrances, and its ceiling for large draws. */
export const TILE_STAGGER_S = 0.065;
export const TILE_STAGGER_MAX_S = 0.35;
/** The sheen starts once the tile has mostly sprung in, then crosses it once. */
export const SHEEN_OFFSET_S = 0.12;
export const SHEEN_DURATION_S = 0.72;
/**
 * Larger draws skip the sheen, for cost: each sheening tile becomes its own clipped
 * compositing layer for the length of its pass (immersive.css), and the reveal is already
 * the busiest moment of a draw. From the seventh tile on, the spring stagger has reached
 * its ceiling, so those tiles share one sheen delay and all their layers start together;
 * the cap keeps that shared pass to a few dozen tiles. It is not about legibility: below
 * the cap, tiles past the sixth also cross in step.
 */
export const SHEEN_MAX_TILES = 40;
/** How long a reveal keeps its sheen: until the last possible tile has finished it. */
export const SHEEN_WINDOW_MS = Math.ceil((TILE_STAGGER_MAX_S + SHEEN_OFFSET_S + SHEEN_DURATION_S) * 1000);

/** Spring entrance delay for the tile at `index`, in seconds. */
export function tileRevealDelay(index: number): number {
  return Math.min(Math.max(0, index) * TILE_STAGGER_S, TILE_STAGGER_MAX_S);
}

/** Sheen delay for the tile at `index`, in seconds: it follows that tile's own spring. */
export function tileSheenDelay(index: number): number {
  return tileRevealDelay(index) + SHEEN_OFFSET_S;
}

/** Whether a revealed grid of `count` tiles gets the sheen at all. */
export function sheenFits(count: number): boolean {
  return count > 0 && count <= SHEEN_MAX_TILES;
}

/**
 * Whether a reveal this window watched should be remembered for its sheen. Draws
 * that never get one are not remembered, so they cost no extra render at the reveal
 * or when the sheen window closes.
 */
export function revealGetsSheen(count: number, reducedMotion: boolean): boolean {
  return !reducedMotion && sheenFits(count);
}
