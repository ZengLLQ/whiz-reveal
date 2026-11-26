import { describe, expect, it } from 'vitest';
import {
  DUST_CLEARING_DEPTH, DUST_COUNT, DUST_DEPTH, DUST_TONES, clearingDepthBand, createDustField, dustTone,
} from './stage-dust';
import { KNOT_REACH } from './sculpture-geometry';

describe('dust clearing around the sculpture', () => {
  it('clears specks over a depth band behind the form centre that follows the layout scale', () => {
    const resting = clearingDepthBand(1);
    expect(resting.from).toBeCloseTo(-KNOT_REACH * DUST_CLEARING_DEPTH.from);
    expect(resting.to).toBeCloseTo(-KNOT_REACH * DUST_CLEARING_DEPTH.to);
    expect(resting.from).toBeLessThan(resting.to);
    expect(resting.to).toBeLessThan(0);
    expect(resting.from).toBeGreaterThan(-KNOT_REACH);
    // Tucked beside results the form is larger, so the band reaches further back with it.
    const tucked = clearingDepthBand(1.2);
    expect(tucked.from).toBeCloseTo(resting.from * 1.2);
    expect(tucked.to).toBeCloseTo(resting.to * 1.2);
  });

  it('keeps the band inside the dust field, so both of its ends are in use', () => {
    const band = clearingDepthBand(1.2);
    expect(band.from).toBeGreaterThan(DUST_DEPTH.back);
    expect(band.to).toBeLessThan(DUST_DEPTH.front);
  });
});

describe('ambient dust field', () => {
  it('keeps a few hundred specks, so it stays one cheap draw call', () => {
    const field = createDustField();
    expect(DUST_COUNT).toBeGreaterThanOrEqual(240);
    expect(DUST_COUNT).toBeLessThanOrEqual(320);
    expect(field.count).toBe(DUST_COUNT);
    expect(field.positions).toHaveLength(DUST_COUNT * 3);
    expect(field.colors).toHaveLength(DUST_COUNT * 3);
    expect(field.sizes).toHaveLength(DUST_COUNT);
    expect(field.alphas).toHaveLength(DUST_COUNT);
    expect(field.phases).toHaveLength(DUST_COUNT);
  });

  it('is the same in every window and every run', () => {
    expect(createDustField()).toEqual(createDustField());
    expect(createDustField(DUST_COUNT, 7).positions).not.toEqual(createDustField(DUST_COUNT, 8).positions);
  });

  it('stays inside its unit volume with small, faint, finite specks', () => {
    const field = createDustField();
    for (const value of field.positions) {
      expect(value).toBeGreaterThanOrEqual(-1);
      expect(value).toBeLessThan(1);
    }
    for (let index = 0; index < field.count; index += 1) {
      expect(field.sizes[index]).toBeGreaterThan(0);
      expect(field.sizes[index]).toBeLessThan(0.08);
      expect(field.alphas[index]).toBeGreaterThan(0);
      expect(field.alphas[index]).toBeLessThanOrEqual(0.85);
      expect(field.phases[index]).toBeGreaterThanOrEqual(0);
      expect(field.phases[index]).toBeLessThan(1);
    }
    expect(DUST_DEPTH.back).toBeLessThan(0);
    expect(DUST_DEPTH.front).toBeGreaterThan(0);
  });

  it('fills the whole frame and depth rather than clumping', () => {
    const field = createDustField();
    const quadrants = [0, 0, 0, 0];
    let front = 0;
    for (let index = 0; index < field.count; index += 1) {
      const x = field.positions[index * 3];
      const y = field.positions[index * 3 + 1];
      quadrants[(x < 0 ? 0 : 1) + (y < 0 ? 0 : 2)] += 1;
      if (field.positions[index * 3 + 2] > 0) front += 1;
    }
    for (const share of quadrants) expect(share / field.count).toBeGreaterThan(0.18);
    expect(front / field.count).toBeGreaterThan(0.35);
    expect(front / field.count).toBeLessThan(0.65);
  });

  it('uses mostly Muted and Edge tones with a few Primary highlights', () => {
    const field = createDustField();
    const counts = { edge: 0, muted: 0, paper: 0 };
    for (let index = 0; index < field.count; index += 1) {
      const tone = dustTone(index);
      counts[tone] += 1;
      expect(Array.from(field.colors.slice(index * 3, index * 3 + 3))).toEqual(DUST_TONES[tone].map(Math.fround));
    }
    expect(counts.paper / field.count).toBeGreaterThan(0.05);
    expect(counts.paper / field.count).toBeLessThan(0.12);
    expect(counts.muted / field.count).toBeGreaterThan(0.4);
    expect(counts.edge / field.count).toBeGreaterThan(0.4);
  });

  it('keeps highlights smaller than the background specks', () => {
    const field = createDustField();
    let largestHighlight = 0;
    let largestEdge = 0;
    for (let index = 0; index < field.count; index += 1) {
      if (dustTone(index) === 'paper') largestHighlight = Math.max(largestHighlight, field.sizes[index]);
      if (dustTone(index) === 'edge') largestEdge = Math.max(largestEdge, field.sizes[index]);
    }
    expect(largestHighlight).toBeLessThan(largestEdge);
  });
});
