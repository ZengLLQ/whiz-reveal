import { describe, expect, it } from 'vitest';
import {
  MAX_PIXEL_RATIO, MIN_SOFTWARE_PIXEL_RATIO, SOFTWARE_PIXEL_BUDGET, isSoftwareRenderer, stagePixelRatio,
} from './stage-resolution';

describe('software renderer detection', () => {
  it('recognises the CPU rasterisers browsers fall back to', () => {
    expect(isSoftwareRenderer('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)')).toBe(true);
    expect(isSoftwareRenderer('Google SwiftShader')).toBe(true);
    expect(isSoftwareRenderer('ANGLE (Microsoft, Microsoft Basic Render Driver (0x0000008C) Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe(true);
    expect(isSoftwareRenderer('llvmpipe (LLVM 15.0.7, 256 bits)')).toBe(true);
  });

  it('treats GPUs and unknown renderers as hardware', () => {
    expect(isSoftwareRenderer('ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 (0x00002504) Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe(false);
    expect(isSoftwareRenderer('ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe(false);
    expect(isSoftwareRenderer('Apple GPU')).toBe(false);
    expect(isSoftwareRenderer(null)).toBe(false);
    expect(isSoftwareRenderer('')).toBe(false);
  });
});

describe('stage resolution', () => {
  it('follows the device on a GPU, capped at 1.5', () => {
    expect(stagePixelRatio(1920, 1080, 1, false)).toBe(1);
    expect(stagePixelRatio(1920, 1080, 2, false)).toBe(MAX_PIXEL_RATIO);
    expect(stagePixelRatio(3840, 2160, 1.25, false)).toBe(1.25);
  });

  it('falls back to 1 for a missing device ratio', () => {
    expect(stagePixelRatio(800, 600, 0, false)).toBe(1);
    expect(stagePixelRatio(800, 600, Number.NaN, true)).toBe(1);
  });

  it('keeps small software canvases at full resolution', () => {
    // The controller preview.
    expect(stagePixelRatio(747, 404, 1, true)).toBe(1);
  });

  it('keeps a large software canvas within its pixel budget', () => {
    for (const [width, height, device] of [[1920, 1080, 1], [2560, 1440, 1], [1440, 900, 1.5], [1920, 1200, 1.25]]) {
      const ratio = stagePixelRatio(width, height, device, true);
      expect(ratio).toBeLessThanOrEqual(device);
      expect(width * ratio * height * ratio).toBeLessThanOrEqual(SOFTWARE_PIXEL_BUDGET + 1);
      expect(width * ratio * height * ratio).toBeGreaterThan(SOFTWARE_PIXEL_BUDGET * 0.99);
    }
    expect(stagePixelRatio(1920, 1080, 1, true)).toBeCloseTo(0.76, 2);
  });

  it('never renders a software canvas below half its CSS resolution', () => {
    expect(stagePixelRatio(3840, 2160, 1, true)).toBe(MIN_SOFTWARE_PIXEL_RATIO);
    expect(stagePixelRatio(3840, 2160, 0.4, true)).toBe(0.4);
  });
});
