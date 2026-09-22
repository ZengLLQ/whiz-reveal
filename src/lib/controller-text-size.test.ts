import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ControllerTextSize } from '../components/ControllerTextSize';
import {
  CONTROLLER_TEXT_SIZE_KEY,
  normalizeControllerTextSize,
  parseControllerTextSize,
  readControllerTextSize,
  saveControllerTextSize,
} from './controller-text-size';

afterEach(() => vi.unstubAllGlobals());

describe('controller text preference', () => {
  it('clamps to 90–150% and snaps to 10% increments', () => {
    expect(normalizeControllerTextSize(80)).toBe(90);
    expect(normalizeControllerTextSize(160)).toBe(150);
    expect(normalizeControllerTextSize(124)).toBe(120);
    expect(normalizeControllerTextSize(125)).toBe(130);
    for (const percentage of [90, 100, 110, 120, 130, 140, 150]) {
      expect(normalizeControllerTextSize(percentage)).toBe(percentage);
    }
  });

  it('defaults invalid numeric values to 100%', () => {
    for (const value of [NaN, Infinity, -Infinity, null, undefined, '120', {}, []]) {
      expect(normalizeControllerTextSize(value)).toBe(100);
    }
  });

  it('parses saved values and safely repairs stale out-of-range preferences', () => {
    expect(parseControllerTextSize(' 140 ')).toBe(140);
    expect(parseControllerTextSize('124.5')).toBe(120);
    expect(parseControllerTextSize('70')).toBe(90);
    expect(parseControllerTextSize('300')).toBe(150);
  });

  it('rejects malformed storage instead of treating blank text as zero', () => {
    for (const value of [null, '', ' ', 'null', '{}', '[]', 'NaN', 'Infinity', '130%', '120px', '0x80', '-30']) {
      expect(parseControllerTextSize(value)).toBe(100);
    }
  });

  it('persists only the controller preference and restores it in a fresh read', () => {
    const values = new Map<string, string>([['whizreveal.preview.v1', '{"presentation":{"scale":1.75}}']]);
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    };
    expect(readControllerTextSize(storage)).toBe(100);
    expect(saveControllerTextSize(138, storage)).toBe(true);
    expect(values.get(CONTROLLER_TEXT_SIZE_KEY)).toBe('140');
    expect(readControllerTextSize(storage)).toBe(140);
    expect(values.get('whizreveal.preview.v1')).toBe('{"presentation":{"scale":1.75}}');
    expect(saveControllerTextSize(100, storage)).toBe(true);
    expect(readControllerTextSize(storage)).toBe(100);
  });

  it('keeps the app usable when storage reads or writes fail', () => {
    const storage = {
      getItem: () => { throw new Error('Access denied'); },
      setItem: () => { throw new Error('Quota exceeded'); },
    };
    expect(readControllerTextSize(storage)).toBe(100);
    expect(saveControllerTextSize(150, storage)).toBe(false);
  });

  it('handles restricted access to the localStorage property itself', () => {
    vi.stubGlobal('window', Object.defineProperty({}, 'localStorage', { get() { throw new Error('SecurityError'); } }));
    expect(readControllerTextSize()).toBe(100);
    expect(saveControllerTextSize(150)).toBe(false);
  });

  it('supports reading and rendering without a browser window', () => {
    vi.stubGlobal('window', undefined);
    expect(readControllerTextSize()).toBe(100);
    expect(saveControllerTextSize(120)).toBe(false);
  });
});

describe('controller text controls', () => {
  const renderControls = (percentage: number) => renderToStaticMarkup(createElement(ControllerTextSize, {
    percentage, decrease: () => undefined, increase: () => undefined, reset: () => undefined,
  }));

  it('labels every action and announces the current percentage', () => {
    const markup = renderControls(120);
    expect(markup).toContain('role="group" aria-label="Controller text size"');
    expect(markup).toContain('aria-label="Decrease controller text size"');
    expect(markup).toContain('aria-label="Increase controller text size"');
    expect(markup).toContain('aria-label="Reset controller text size to 100 percent (currently 120 percent)"');
    expect(markup).toContain('<output aria-live="polite" aria-atomic="true">120%</output>');
    expect(markup).not.toContain('disabled=""');
  });

  it('disables the action that would exceed each supported limit', () => {
    const atMinimum = [...renderControls(90).matchAll(/<button[^>]*>/g)].map((match) => match[0]);
    const atMaximum = [...renderControls(150).matchAll(/<button[^>]*>/g)].map((match) => match[0]);
    expect(atMinimum.find((button) => button.includes('aria-label="Decrease'))).toContain('disabled=""');
    expect(atMinimum.find((button) => button.includes('aria-label="Increase'))).not.toContain('disabled=""');
    expect(atMaximum.find((button) => button.includes('aria-label="Increase'))).toContain('disabled=""');
    expect(atMaximum.find((button) => button.includes('aria-label="Decrease'))).not.toContain('disabled=""');
    expect(atMaximum.find((button) => button.includes('aria-label="Reset'))).not.toContain('disabled=""');
  });
});
