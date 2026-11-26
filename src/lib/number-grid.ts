/** How often decorative cycling digits change, in milliseconds. */
export const CYCLE_INTERVAL_MS = 68;

/** The cycling frame shown `elapsedMs` after cycling started (0 at the start, never negative). */
export function cyclingFrame(elapsedMs: number): number {
  return Number.isFinite(elapsedMs) && elapsedMs > 0 ? Math.floor(elapsedMs / CYCLE_INTERVAL_MS) : 0;
}

/**
 * The decorative value tile `index` shows on cycling `frame`, from 1 to `total`.
 * It is a fixed stride through the pool, never a draw: winners always come from the
 * draw engine. Each frame moves every tile by the stride, which is never a multiple
 * of `total`, so a tile changes on every frame of any pool larger than one number.
 */
export function cyclingValue(frame: number, index: number, total: number): number {
  if (total <= 1) return 1;
  const stride = total % 73 === 0 ? 71 : 73;
  return ((frame * stride + index * 41 + 17) % total) + 1;
}

/**
 * Whether two lists of drawn numbers are the same. Every snapshot arrives as fresh
 * objects, so a draw's unchanged numbers come back as a new array; comparing contents
 * lets a memoised grid skip the re-render.
 */
export function sameNumbers(a: readonly number[], b: readonly number[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) if (a[index] !== b[index]) return false;
  return true;
}
