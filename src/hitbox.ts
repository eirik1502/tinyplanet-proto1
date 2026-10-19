// Hit detection. Attacks carry hitboxes; whatever can be hit carries a hurtbox. A hit lands when
// a hitbox overlaps a hurtbox.
//
// Both are upright cylinders centred on (x, y, alt): `radius` across the game plane, `height` from
// bottom to top (so they reach height / 2 above and below `alt`). A hitbox can be cut down to a
// sector: then it only hits within `arc` radians either side of its facing (dx, dy), except right
// at its centre (within SECTOR_CORE), where everything is hit.

/** Size of a box, before it is placed. */
export interface BoxSize {
  radius: number;
  height: number;
}

export interface Box extends BoxSize {
  x: number;
  y: number;
  alt: number;
}

export type Hurtbox = Box;

export interface Hitbox extends Box {
  /** Sector: unit facing on the game plane and half-angle (rad). Omitted: the full cylinder. */
  sector?: { dx: number; dy: number; arc: number };
}

/** Within this distance of a sector hitbox's centre, its facing doesn't matter. */
const SECTOR_CORE = 18;

export function box(x: number, y: number, alt: number, size: BoxSize): Box {
  return { x, y, alt, radius: size.radius, height: size.height };
}

/** Whether `hit` overlaps `hurt`. */
export function overlaps(hit: Hitbox, hurt: Hurtbox): boolean {
  if (Math.abs(hurt.alt - hit.alt) > (hit.height + hurt.height) / 2) return false;
  const ox = hurt.x - hit.x;
  const oy = hurt.y - hit.y;
  const d = Math.hypot(ox, oy);
  if (d > hit.radius + hurt.radius) return false;
  const s = hit.sector;
  return !s || d <= SECTOR_CORE || (ox * s.dx + oy * s.dy) / d >= Math.cos(s.arc);
}
