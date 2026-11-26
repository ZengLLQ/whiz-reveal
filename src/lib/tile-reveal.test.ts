import { describe, expect, it } from 'vitest';
import {
  SHEEN_DURATION_S, SHEEN_MAX_TILES, SHEEN_OFFSET_S, SHEEN_WINDOW_MS, TILE_STAGGER_MAX_S, TILE_STAGGER_S,
  revealGetsSheen, sheenFits, tileRevealDelay, tileSheenDelay,
} from './tile-reveal';

describe('tile reveal timing', () => {
  it('staggers the spring entrance and caps it for large draws', () => {
    expect(tileRevealDelay(0)).toBe(0);
    expect(tileRevealDelay(1)).toBeCloseTo(TILE_STAGGER_S);
    expect(tileRevealDelay(5)).toBeCloseTo(0.325);
    expect(tileRevealDelay(6)).toBe(TILE_STAGGER_MAX_S);
    expect(tileRevealDelay(499)).toBe(TILE_STAGGER_MAX_S);
    expect(tileRevealDelay(-3)).toBe(0);
  });

  it('starts each sheen after its own tile has sprung in, keeping the same stagger', () => {
    for (const index of [0, 1, 4, 10, 200]) {
      expect(tileSheenDelay(index)).toBeCloseTo(tileRevealDelay(index) + SHEEN_OFFSET_S);
      expect(tileSheenDelay(index)).toBeGreaterThan(tileRevealDelay(index));
    }
    expect(tileSheenDelay(3) - tileSheenDelay(2)).toBeCloseTo(TILE_STAGGER_S);
  });

  it('crosses each tile once in 600 to 800 ms', () => {
    expect(SHEEN_DURATION_S).toBeGreaterThanOrEqual(0.6);
    expect(SHEEN_DURATION_S).toBeLessThanOrEqual(0.8);
  });

  it('keeps a reveal sheen until the last tile has finished it', () => {
    for (const index of [0, 5, 6, SHEEN_MAX_TILES - 1]) {
      expect((tileSheenDelay(index) + SHEEN_DURATION_S) * 1000).toBeLessThanOrEqual(SHEEN_WINDOW_MS);
    }
    expect(SHEEN_WINDOW_MS).toBeLessThan(1500);
  });

  it('gives the sheen only to grids small enough to read it tile by tile', () => {
    expect(sheenFits(0)).toBe(false);
    expect(sheenFits(1)).toBe(true);
    expect(sheenFits(10)).toBe(true);
    expect(sheenFits(SHEEN_MAX_TILES)).toBe(true);
    expect(sheenFits(SHEEN_MAX_TILES + 1)).toBe(false);
    expect(sheenFits(500)).toBe(false);
  });

  it('remembers a watched reveal only when it will actually sheen', () => {
    expect(revealGetsSheen(10, false)).toBe(true);
    expect(revealGetsSheen(SHEEN_MAX_TILES, false)).toBe(true);
    // Larger draws and reduced motion never sheen, so they cost no extra render.
    expect(revealGetsSheen(SHEEN_MAX_TILES + 1, false)).toBe(false);
    expect(revealGetsSheen(500, false)).toBe(false);
    expect(revealGetsSheen(10, true)).toBe(false);
    expect(revealGetsSheen(0, false)).toBe(false);
  });

  it('shares one sheen delay from the seventh tile on, so the cap bounds that shared pass', () => {
    for (let index = 6; index < SHEEN_MAX_TILES; index += 1) expect(tileSheenDelay(index)).toBe(tileSheenDelay(6));
    expect(tileSheenDelay(5)).toBeLessThan(tileSheenDelay(6));
  });
});
