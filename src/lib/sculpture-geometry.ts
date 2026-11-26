/**
 * The sculpture's shape. The renderer builds the knot and its ripple from these
 * numbers, and the dust uses its reach to clear the outline the camera sees.
 */

/** The sculpture is a (2, 3) torus knot with this radius and tube (stage-renderer.ts builds it). */
export const KNOT_RADIUS = 1.05;
export const KNOT_TUBE = 0.35;
/** Height of the surface ripple at full energy, in world units at scale 1. */
export const KNOT_RIPPLE = 0.05;
/**
 * Furthest reach of the knot's surface from its centre at scale 1, about 1.98. Three's
 * TorusKnotGeometry swings its curve out to 1.5 times the radius; the tube and the
 * ripple add to that. Every orientation of the knot fits in a sphere of this radius.
 */
export const KNOT_REACH = KNOT_RADIUS * 1.5 + KNOT_TUBE + KNOT_RIPPLE;

/**
 * Radius, measured on the sculpture's plane, of the outline the camera sees of a
 * sphere of radius `reach` centred on that plane: the tangent cone from a camera
 * `cameraDistance` away. Perspective makes it a little larger than `reach`. A speck
 * in front of the form can only cover it inside this radius.
 */
export function silhouetteRadius(reach: number, cameraDistance: number): number {
  if (!(cameraDistance > reach)) return Number.POSITIVE_INFINITY;
  return (reach * cameraDistance) / Math.sqrt(cameraDistance * cameraDistance - reach * reach);
}
