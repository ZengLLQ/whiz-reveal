/**
 * Which sculpture material a window renders. `shader` is the palette shader and
 * the reference look; `physical` is the `?stage=physical` comparison experiment.
 */
export type StageLook = 'shader' | 'physical';

/** Reads the `?stage=physical` comparison flag. Anything else keeps the palette shader. */
export function stageLookFromSearch(search: string): StageLook {
  return new URLSearchParams(search).get('stage') === 'physical' ? 'physical' : 'shader';
}
