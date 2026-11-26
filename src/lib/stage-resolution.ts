/**
 * How finely the stage renders. On a GPU the stage renders at the device's pixel
 * ratio, capped at 1.5. A software renderer (no GPU acceleration, as in some virtual
 * machines, remote sessions or blocklisted drivers) fills every pixel on the CPU,
 * and its multisampling costs as much again, so a large canvas there renders fewer
 * pixels and the browser scales it up. The form is soft and multisampled, so it
 * stays smooth, only slightly softer.
 */

/** Highest pixel ratio the stage renders at; finer gains little for a soft, multisampled form. */
export const MAX_PIXEL_RATIO = 1.5;
/**
 * Most pixels a software renderer draws for the stage. Under SwiftShader an idle 1080p
 * stage, with the light pool centred, cost about 34 ms a frame at full size, over the
 * 33 ms idle budget; at this size (1460 x 821) it costs about 18 ms.
 */
export const SOFTWARE_PIXEL_BUDGET = 1_200_000;
/** A software renderer never drops below half the CSS resolution, however large the canvas. */
export const MIN_SOFTWARE_PIXEL_RATIO = 0.5;

/** Renderer names of CPU rasterisers: SwiftShader (Chromium's own), Mesa's llvmpipe and softpipe, and Windows' WARP. */
const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|basic render driver|software rasterizer/i;

/** True when the WebGL renderer's name (WEBGL_debug_renderer_info) is a software rasteriser. */
export function isSoftwareRenderer(rendererName: string | null | undefined): boolean {
  return !!rendererName && SOFTWARE_RENDERER.test(rendererName);
}

/** Pixel ratio for a canvas of `width` x `height` CSS pixels. */
export function stagePixelRatio(width: number, height: number, devicePixelRatio: number, software: boolean): number {
  const ratio = Math.min(devicePixelRatio > 0 ? devicePixelRatio : 1, MAX_PIXEL_RATIO);
  if (!software || !(width > 0 && height > 0)) return ratio;
  const withinBudget = Math.sqrt(SOFTWARE_PIXEL_BUDGET / (width * height));
  return Math.min(ratio, Math.max(withinBudget, MIN_SOFTWARE_PIXEL_RATIO));
}
