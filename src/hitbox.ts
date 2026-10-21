import { params } from "./tuning";

// Hit detection. Attacks carry hitboxes; whatever can be hit carries a hurtbox. A hit lands when
// a hitbox overlaps a hurtbox on the game plane and the two are at most `combat.hits.height`
// apart in altitude (plus any extra `height` either has: a tall body); that one rule holds for
// every attack, from anyone.
//
// Both are circles on the game plane around (x, y), at altitude `alt`. A hitbox can be cut down
// to a sector: then it only hits within `arc` radians either side of its facing (dx, dy), except
// right at its centre (within SECTOR_CORE), where everything is hit. Or it can be a rectangle
// reaching out from (x, y) along its facing instead (its radius is then ignored).

export interface Box {
  x: number;
  y: number;
  alt: number;
  radius: number;
  /** Extra vertical reach on top of `combat.hits.height` (Infinity: any altitude). */
  height?: number;
}

export type Hurtbox = Box;

export interface Hitbox extends Box {
  /** Sector: unit facing on the game plane and half-angle (rad). Omitted: the full circle. */
  sector?: { dx: number; dy: number; arc: number };
  /** Rectangle: unit facing, how far it reaches along it, and its half-width either side. */
  rect?: { dx: number; dy: number; length: number; halfWidth: number };
}

/** Within this distance of a sector hitbox's centre, its facing doesn't matter. */
const SECTOR_CORE = 18;

export function box(x: number, y: number, alt: number, radius: number): Box {
  return { x, y, alt, radius };
}

/** 1 if `alt` is too far above `from` for hits between them, -1 if too far below, else 0. */
export function outOfHitHeight(alt: number, from: number, extra = 0): -1 | 0 | 1 {
  const d = alt - from;
  const h = params.combat.hits.height + extra;
  return d > h ? 1 : d < -h ? -1 : 0;
}

/** Whether `hit` overlaps `hurt`. */
export function overlaps(hit: Hitbox, hurt: Hurtbox): boolean {
  if (outOfHitHeight(hurt.alt, hit.alt, (hit.height ?? 0) + (hurt.height ?? 0)) !== 0) return false;
  const ox = hurt.x - hit.x;
  const oy = hurt.y - hit.y;
  const r = hit.rect;
  if (r) {
    // Distance from the hurtbox's centre to the nearest point of the rectangle.
    const u = ox * r.dx + oy * r.dy;
    const v = -ox * r.dy + oy * r.dx;
    const cu = u - Math.max(0, Math.min(r.length, u));
    const cv = v - Math.max(-r.halfWidth, Math.min(r.halfWidth, v));
    return Math.hypot(cu, cv) <= hurt.radius;
  }
  const d = Math.hypot(ox, oy);
  if (d > hit.radius + hurt.radius) return false;
  const s = hit.sector;
  return !s || d <= SECTOR_CORE || (ox * s.dx + oy * s.dy) / d >= Math.cos(s.arc);
}
