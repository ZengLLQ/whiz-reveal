import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  AA_TEXT_CONTRAST, MUTED_TEXT, MUTED_TEXT_MIX, PALETTE, contrastRatio, isLargeText, meetsAaText, mixColors, parseHexColor, toHexColor,
} from './color-contrast';

describe('contrast arithmetic', () => {
  it('matches the WCAG reference values', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#777777')).toBe(1);
    expect(contrastRatio('#FFFFFF', '#777777')).toBeCloseTo(4.48, 2);
    expect(contrastRatio('#171C22', '#5D6F82')).toBe(contrastRatio('#5D6F82', '#171C22'));
  });

  it('parses, formats and mixes colours', () => {
    expect(parseHexColor('#0b0d10')).toEqual([11, 13, 16]);
    expect(() => parseHexColor('#FFF')).toThrow();
    expect(toHexColor([255, 0, 128])).toBe('#FF0080');
    expect(mixColors('#000000', '#FFFFFF', 0)).toBe('#000000');
    expect(mixColors('#000000', '#FFFFFF', 1)).toBe('#FFFFFF');
    expect(mixColors('#000000', '#FFFFFF', 0.5)).toBe('#808080');
    expect(mixColors('#000000', '#FFFFFF', 2)).toBe('#FFFFFF');
  });

  it('applies the large-text threshold only to ≥24 px, or ≥18.66 px bold', () => {
    expect(isLargeText(24)).toBe(true);
    expect(isLargeText(19, 700)).toBe(true);
    expect(isLargeText(19, 500)).toBe(false);
    expect(meetsAaText(3.2, 24)).toBe(true);
    expect(meetsAaText(3.2, 14)).toBe(false);
    expect(meetsAaText(4.5, 11)).toBe(true);
  });
});

describe('palette text contrast', () => {
  it('Muted alone is below AA as text on both dark backgrounds (why the derived tone exists)', () => {
    expect(contrastRatio(PALETTE.muted, PALETTE.surface)).toBeLessThan(AA_TEXT_CONTRAST);
    expect(contrastRatio(PALETTE.muted, PALETTE.canvas)).toBeLessThan(AA_TEXT_CONTRAST);
  });

  it('the derived muted text tone reaches AA on Surface and Canvas', () => {
    expect(MUTED_TEXT_MIX).toBe(0.25);
    expect(MUTED_TEXT).toBe('#808F9F');
    expect(contrastRatio(MUTED_TEXT, PALETTE.surface)).toBeGreaterThanOrEqual(AA_TEXT_CONTRAST);
    expect(contrastRatio(MUTED_TEXT, PALETTE.canvas)).toBeGreaterThanOrEqual(AA_TEXT_CONTRAST);
    // It stays clearly secondary to Primary text.
    expect(contrastRatio(PALETTE.primary, PALETTE.surface)).toBeGreaterThan(2.5 * contrastRatio(MUTED_TEXT, PALETTE.surface));
  });
});

describe('stylesheets', () => {
  const styles = readFileSync('src/styles.css', 'utf8');

  it('declares the derived tone as --color-muted-text', () => {
    const declared = /--color-muted-text:\s*(#[0-9a-f]{6})/i.exec(styles)?.[1];
    expect(declared?.toUpperCase()).toBe(MUTED_TEXT);
  });

  it('keeps every controller text-size token at 11 px or more at 100% text scale', () => {
    const tokens = [...styles.matchAll(/--controller-text-[\w-]+:\s*calc\((\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]));
    expect(tokens.length).toBeGreaterThan(0);
    expect(Math.min(...tokens)).toBeGreaterThanOrEqual(11);
  });

  it('sets no pixel font size below 11 px in any stylesheet', () => {
    const small: string[] = [];
    for (const file of readdirSync('src').filter((name) => name.endsWith('.css'))) {
      const css = readFileSync(`src/${file}`, 'utf8');
      for (const match of css.matchAll(/font-size:\s*(?:calc\(|clamp\()?(\d+(?:\.\d+)?)px/g)) {
        if (Number(match[1]) < 11) small.push(`${file}: ${match[0]}`);
      }
    }
    expect(small).toEqual([]);
  });
});
