/**
 * The ambient dust behind the sculpture: a few hundred specks in palette tones.
 * The field is generated from a fixed seed, so every window (and every test run)
 * gets the same layout without shipping any asset. How the dust moves over a draw
 * (its faster drift and the reveal's push) is choreography, in stage-motion.ts.
 */
import { KNOT_REACH } from './sculpture-geometry';

/** Specks in front of the form fade back in over this distance past its outline, times its scale. */
export const DUST_CLEARING_FEATHER = 0.4;
/**
 * Depths at which a speck starts and finishes clearing the form's outline, as shares
 * of the knot's reach behind its centre. Deeper specks sit behind nearly all of the
 * form, so its surface hides them by depth; nearer ones could show in front of it,
 * where a dark speck over the lit surface would read as a blemish.
 */
export const DUST_CLEARING_DEPTH = { from: 0.85, to: 0.6 } as const;

/** Number of specks; one draw call however many there are. */
export const DUST_COUNT = 280;
/** Every twelfth speck is a primary-colour highlight; the rest alternate Muted and Edge. */
export const DUST_HIGHLIGHT_EVERY = 12;
/** World-space depth of the field: from behind the sculpture to just in front of it. */
export const DUST_DEPTH = { back: -2.8, front: 1.6 } as const;

/** Palette tones as 0–1 sRGB triples. The shader writes them unconverted, like the sculpture's ramp. */
export const DUST_TONES = {
  edge: [42 / 255, 51 / 255, 61 / 255],
  muted: [93 / 255, 111 / 255, 130 / 255],
  paper: [231 / 255, 238 / 255, 245 / 255],
} as const;

/** Per-speck ranges: [minimum, span]. Highlights stay small and faint so they never compete with numbers. */
const SPECKS = {
  paper: { size: [0.014, 0.012], alpha: [0.3, 0.22] },
  muted: { size: [0.02, 0.028], alpha: [0.28, 0.3] },
  edge: { size: [0.03, 0.04], alpha: [0.5, 0.35] },
} as const;

export type DustTone = keyof typeof DUST_TONES;

export interface DustField {
  count: number;
  /** Unit positions: x and y span the frame (-1..1), z spans the field's depth (-1 back, 1 front). */
  positions: Float32Array;
  /** sRGB colour of each speck. */
  colors: Float32Array;
  /** World-space diameter of each speck; the shader attenuates it with distance. */
  sizes: Float32Array;
  /** Opacity of each speck before the stage's own dimming. */
  alphas: Float32Array;
  /** Drift phase of each speck, 0..1. */
  phases: Float32Array;
}

/**
 * The depth band, in world units, over which specks start clearing the outline of a
 * form scaled by `scale`; see DUST_CLEARING_DEPTH. It follows the layout's scale.
 */
export function clearingDepthBand(scale: number): { from: number; to: number } {
  const reach = KNOT_REACH * scale;
  return { from: -reach * DUST_CLEARING_DEPTH.from, to: -reach * DUST_CLEARING_DEPTH.to };
}

export function dustTone(index: number): DustTone {
  if (index % DUST_HIGHLIGHT_EVERY === 0) return 'paper';
  return index % 2 ? 'muted' : 'edge';
}

export function createDustField(count = DUST_COUNT, seed = 0x5eed): DustField {
  const random = seededRandom(seed);
  const field: DustField = {
    count,
    positions: new Float32Array(count * 3),
    colors: new Float32Array(count * 3),
    sizes: new Float32Array(count),
    alphas: new Float32Array(count),
    phases: new Float32Array(count),
  };
  for (let index = 0; index < count; index += 1) {
    const tone = dustTone(index);
    const speck = SPECKS[tone];
    for (let axis = 0; axis < 3; axis += 1) {
      field.positions[index * 3 + axis] = random() * 2 - 1;
      field.colors[index * 3 + axis] = DUST_TONES[tone][axis];
    }
    field.sizes[index] = speck.size[0] + random() * speck.size[1];
    field.alphas[index] = speck.alpha[0] + random() * speck.alpha[1];
    field.phases[index] = random();
  }
  return field;
}

/** Mulberry32: tiny, fast, and good enough to scatter dust. Returns values in [0, 1). */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
