import { params } from "./tuning";

// Hit detection. Attacks carry hitboxes; whatever can be hit carries a hurtbox. A hit lands when
// a hitbox overlaps a hurtbox on the game plane and the two are at most `combat.hits.height`
// apart in altitude; that one rule holds for every attack, from anyone.
//
// Both are circles on the game plane around (x, y), at altitude `alt`. A hitbox can be cut down
// to a sector: then it only hits within `arc` radians either side of its facing (dx, dy), except
// right at its centre (within SECTOR_CORE), where everything is hit.

export interface Box {
  x: number;
  y: number;
  alt: number;
  radius: number;
}

export type Hurtbox = Box;

export interface Hitbox extends Box {
  /** Sector: unit facing on the game plane and half-angle (rad). Omitted: the full circle. */
  sector?: { dx: number; dy: number; arc: number };
}

/** Within this distance of a sector hitbox's centre, its facing doesn't matter. */
const SECTOR_CORE = 18;

export function box(x: number, y: number, alt: number, radius: number): Box {
  return { x, y, alt, radius };
}

/** Whether `hit` overlaps `hurt`. */
export function overlaps(hit: Hitbox, hurt: Hurtbox): boolean {
  if (Math.abs(hurt.alt - hit.alt) > params.combat.hits.height) return false;
  const ox = hurt.x - hit.x;
  const oy = hurt.y - hit.y;
  const d = Math.hypot(ox, oy);
  if (d > hit.radius + hurt.radius) return false;
  const s = hit.sector;
  return !s || d <= SECTOR_CORE || (ox * s.dx + oy * s.dy) / d >= Math.cos(s.arc);
}
