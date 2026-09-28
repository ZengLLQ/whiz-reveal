import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildHistoryPdf, planHistoryReport } from './history-report';
import { createPreviewSnapshot } from './preview-model';

describe('session PDF export', () => {
  it('paginates large draws without losing, sorting or deduplicating their numbers', () => {
    const history = [
      { id: 2, createdAt: 2000, numbers: [8, 8, 1_000_000] },
      { id: 1, createdAt: 1000, numbers: Array.from({ length: 500 }, (_, i) => i + 1) },
    ];
    const before = structuredClone(history);
    const pages = planHistoryReport(history);
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.every(page => page.length > 0)).toBe(true);
    const blocks = pages.flat();
    expect(blocks.flatMap(block => block.numbers)).toEqual([...history[1].numbers, ...history[0].numbers]);
    expect(blocks.filter(block => block.draw.id === 1).slice(1).every(block => block.offset > 0)).toBe(true);
    for (const block of blocks) expect(block.y + 20 + Math.ceil(block.numbers.length / 10) * 15).toBeLessThanOrEqual(270);
    expect(history).toEqual(before);
  });

  it('refuses empty or still-drawing sessions and produces an actual PDF for completed results', () => {
    const snapshot = createPreviewSnapshot('sample');
    const fonts = { regular: readFileSync('public/fonts/aeonik/Aeonik-Regular.ttf').toString('base64'), medium: readFileSync('public/fonts/aeonik/Aeonik-Medium.ttf').toString('base64') };
    expect(() => buildHistoryPdf(snapshot, fonts)).toThrow('Draw some numbers');
    const draw = { id: 1, createdAt: 1000, numbers: [7, 7, 100] };
    snapshot.history = [draw];
    snapshot.activeDraw = { draw, startedAt: 1000, durationMs: 1600 };
    expect(() => buildHistoryPdf(snapshot, fonts)).toThrow('Wait for the current draw');
    snapshot.activeDraw = null;
    const bytes = buildHistoryPdf(snapshot, fonts, 2000);
    expect(new TextDecoder().decode(bytes.subarray(0, 5))).toBe('%PDF-');
    expect(bytes.length).toBeGreaterThan(1000);
  });
});
