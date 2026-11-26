import { describe, expect, it } from 'vitest';
import { TorusKnotGeometry } from 'three';
import { KNOT_RADIUS, KNOT_REACH, KNOT_RIPPLE, KNOT_TUBE, silhouetteRadius } from './sculpture-geometry';

describe('sculpture geometry', () => {
  it('knows how far the knot actually reaches, ripple included', () => {
    const geometry = new TorusKnotGeometry(KNOT_RADIUS, KNOT_TUBE, 256, 32, 2, 3);
    const position = geometry.getAttribute('position');
    let furthest = 0;
    for (let index = 0; index < position.count; index += 1) {
      furthest = Math.max(furthest, Math.hypot(position.getX(index), position.getY(index), position.getZ(index)));
    }
    geometry.dispose();
    expect(furthest).toBeGreaterThan(1.9);
    expect(furthest).toBeLessThanOrEqual(KNOT_REACH - KNOT_RIPPLE + 1e-6);
    expect(KNOT_REACH - KNOT_RIPPLE - furthest).toBeLessThan(0.01);
  });

  it('measures the outline the camera sees, which perspective makes larger than the reach', () => {
    const reach = KNOT_REACH * 1.2;
    const distance = 7.7;
    // Project points of the bounding sphere onto the sculpture's plane, as the dust shader does.
    let outline = 0;
    for (let polar = 0; polar <= 400; polar += 1) {
      const angle = (polar / 400) * Math.PI;
      const z = reach * Math.cos(angle);
      const r = reach * Math.sin(angle);
      outline = Math.max(outline, (r * distance) / (distance - z));
    }
    expect(silhouetteRadius(reach, distance)).toBeGreaterThan(reach);
    expect(silhouetteRadius(reach, distance)).toBeCloseTo(outline, 3);
    expect(silhouetteRadius(reach, reach)).toBe(Number.POSITIVE_INFINITY);
  });
});
