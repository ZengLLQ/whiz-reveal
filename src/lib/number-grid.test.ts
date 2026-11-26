import { describe, expect, it } from 'vitest';
import { CYCLE_INTERVAL_MS, cyclingFrame, cyclingValue, sameNumbers } from './number-grid';

describe('cyclingFrame', () => {
  it('advances once per cycling interval from frame 0', () => {
    expect(cyclingFrame(0)).toBe(0);
    expect(cyclingFrame(CYCLE_INTERVAL_MS - 1)).toBe(0);
    expect(cyclingFrame(CYCLE_INTERVAL_MS)).toBe(1);
    expect(cyclingFrame(CYCLE_INTERVAL_MS * 10 + 5)).toBe(10);
  });

  it('never goes below frame 0', () => {
    expect(cyclingFrame(-50)).toBe(0);
    expect(cyclingFrame(Number.NaN)).toBe(0);
    expect(cyclingFrame(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('cyclingValue', () => {
  it('keeps the formula the grid has always shown', () => {
    expect(cyclingValue(0, 0, 1000)).toBe(18);
    expect(cyclingValue(3, 2, 1000)).toBe(((3 * 73 + 2 * 41 + 17) % 1000) + 1);
    expect(cyclingValue(3, 2, 146)).toBe(((3 * 71 + 2 * 41 + 17) % 146) + 1);
  });

  it('stays within 1 to total', () => {
    for (const total of [1, 2, 7, 73, 146, 500, 1_000_000]) {
      for (let frame = 0; frame < 40; frame += 1) {
        for (const index of [0, 1, 17, 499]) {
          const value = cyclingValue(frame, index, total);
          expect(Number.isInteger(value)).toBe(true);
          expect(value).toBeGreaterThanOrEqual(1);
          expect(value).toBeLessThanOrEqual(total);
        }
      }
    }
  });

  it('changes every tile on every frame of a pool larger than one number', () => {
    for (let total = 2; total <= 6000; total += 1) {
      expect(cyclingValue(1, 5, total), `total ${total}`).not.toBe(cyclingValue(0, 5, total));
    }
  });

  it('shows 1 for a pool of one number', () => {
    expect(cyclingValue(0, 0, 1)).toBe(1);
    expect(cyclingValue(9, 4, 1)).toBe(1);
  });

  it('is deterministic', () => {
    expect(cyclingValue(12, 34, 1_000_000)).toBe(cyclingValue(12, 34, 1_000_000));
  });
});

describe('sameNumbers', () => {
  it('compares contents, not identity', () => {
    const numbers = [4, 8, 15];
    expect(sameNumbers(numbers, numbers)).toBe(true);
    expect(sameNumbers(numbers, [4, 8, 15])).toBe(true);
    expect(sameNumbers([], [])).toBe(true);
  });

  it('tells different draws apart', () => {
    expect(sameNumbers([4, 8, 15], [4, 8])).toBe(false);
    expect(sameNumbers([4, 8, 15], [4, 8, 16])).toBe(false);
    expect(sameNumbers([4, 8, 15], [15, 8, 4])).toBe(false);
  });
});
