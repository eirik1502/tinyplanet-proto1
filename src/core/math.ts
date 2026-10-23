// Small math helpers shared by the simulation and the presentation.

export interface Vec {
  x: number;
  y: number;
}

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** An angle wrapped to (-π, π]. */
export const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export function smoothstep(a: number, b: number, x: number) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
