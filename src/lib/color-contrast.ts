/** WCAG 2.x contrast arithmetic for the app's palette (docs/design.md, "Color and hierarchy"). */

export type Rgb = readonly [number, number, number];

/** The five design colours. */
export const PALETTE = {
  canvas: '#0B0D10',
  surface: '#171C22',
  edge: '#2A333D',
  muted: '#5D6F82',
  primary: '#E7EEF5',
} as const;

/** WCAG AA minimum contrast for normal text, and for large text (≥24 px, or ≥18.66 px bold). */
export const AA_TEXT_CONTRAST = 4.5;
export const AA_LARGE_TEXT_CONTRAST = 3;

export function parseHexColor(hex: string): Rgb {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) throw new Error(`Expected a #RRGGBB colour, got "${hex}"`);
  const value = match[1];
  return [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16)) as unknown as Rgb;
}

export function toHexColor(rgb: Rgb): string {
  return `#${rgb.map((channel) => Math.round(Math.min(255, Math.max(0, channel))).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

function channelToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(color: string | Rgb): number {
  const [r, g, b] = typeof color === 'string' ? parseHexColor(color) : color;
  return 0.2126 * channelToLinear(r) + 0.7152 * channelToLinear(g) + 0.0722 * channelToLinear(b);
}

export function contrastRatio(a: string | Rgb, b: string | Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Linear sRGB-channel mix: amount 0 returns `from`, 1 returns `to`. */
export function mixColors(from: string, to: string, amount: number): string {
  const t = Math.min(1, Math.max(0, amount));
  const a = parseHexColor(from);
  const b = parseHexColor(to);
  return toHexColor([0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * t) as unknown as Rgb);
}

export function isLargeText(fontSizePx: number, fontWeight = 400): boolean {
  return fontSizePx >= 24 || (fontSizePx >= 18.66 && fontWeight >= 700);
}

export function meetsAaText(ratio: number, fontSizePx: number, fontWeight = 400): boolean {
  return ratio >= (isLargeText(fontSizePx, fontWeight) ? AA_LARGE_TEXT_CONTRAST : AA_TEXT_CONTRAST);
}

/**
 * The one derived tone: Muted moved a quarter of the way toward Primary. It is for informative secondary
 * text only (hints, captions, labels, counts, times); Muted itself stays for borders, accents, icons,
 * decorative text and disabled controls. Declared in CSS as --color-muted-text (styles.css).
 */
export const MUTED_TEXT_MIX = 0.25;
export const MUTED_TEXT = mixColors(PALETTE.muted, PALETTE.primary, MUTED_TEXT_MIX);
