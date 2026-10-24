import { GameObject } from "../core/object";
import type { Boid } from "../enemies/boid";
import { ISLAND_TOP } from "../world/island";
import type { World } from "./world";

// The portal out of a planet: a column of light hovering off an island. On a goal level it waits
// there, sealed until nothing on the planet is left to beat. When the queen is beaten she doesn't
// die: she opens a portal where she is and escapes through it. Either way, flying into the open
// portal wins the round, and the player follows her to the next planet.

export class Portal extends GameObject {
  open = false;
  /** Seconds since it opened. */
  openFor = 0;
  /** The player flew in. */
  entered = false;
  /** Where it drifts to: in reach of a jump from an island. */
  settle: { x: number; y: number } | null = null;
  /** Reach around its axis: a flight passing this close goes in. */
  readonly radius = 45;

  constructor(x: number, y: number) {
    super("portal");
    this.x = x;
    this.y = y;
    this.alt = ISLAND_TOP + 35;
  }
}

/** Highest and lowest a flight can be and still go in. */
const REACH_UP = 160;
const REACH_DOWN = 40;
/** How far off a rim the portal settles, and how fast it drifts there. */
const SETTLE_OFF = 75;
const DRIFT_SPEED = 160;
/** How fast the portal pulls the player up into it. */
const WARP_RISE = 280;

/** The beaten queen opens a portal where she is and flees through it; it drifts to within reach of an island. */
export function queenFlees(w: World, q: Boid): Portal {
  w.events.emit("queenFlee", { source: q.id, x: q.x, y: q.y, alt: q.alt });
  const portal = w.objects.add(new Portal(q.x, q.y));
  portal.open = true;
  portal.settle = reachableSpot(w, q.x, q.y);
  w.events.emit("portalOpen", { source: portal.id, x: portal.x, y: portal.y, alt: portal.alt });
  return portal;
}

/** Just off the rim point nearest (x, y), on its open side, unless (x, y) is already that close. */
function reachableSpot(w: World, x: number, y: number) {
  let best: { x: number; y: number; d: number } | null = null;
  for (const isl of w.islands) {
    const c = isl.closest(x, y);
    if (best && c.d >= best.d) continue;
    const e = isl.pointAt(c.s);
    best = { x: e.x + e.nx * SETTLE_OFF, y: e.y + e.ny * SETTLE_OFF, d: c.d };
  }
  if (!best || best.d <= SETTLE_OFF) return null;
  return { x: best.x, y: best.y };
}

/** Open a goal level's portal once every boid is dead, drift into place, and take in the player. */
export function updatePortal(w: World, portal: Portal, dt: number) {
  if (!portal.open && w.swarm.boids.length === 0) {
    portal.open = true;
    w.events.emit("portalOpen", { source: portal.id, x: portal.x, y: portal.y, alt: portal.alt });
  }
  if (!portal.open) return;
  portal.openFor += dt;
  if (portal.settle) {
    const dx = portal.settle.x - portal.x;
    const dy = portal.settle.y - portal.y;
    const d = Math.hypot(dx, dy);
    const step = DRIFT_SPEED * dt;
    if (d <= step) {
      portal.x = portal.settle.x;
      portal.y = portal.settle.y;
      portal.settle = null;
    } else {
      portal.x += (dx / d) * step;
      portal.y += (dy / d) * step;
    }
  }
  const p = w.player;
  if (portal.entered || !w.playing || p.mode !== "air") return;
  if (p.alt < ISLAND_TOP - REACH_DOWN || p.alt > ISLAND_TOP + REACH_UP) return;
  if (Math.hypot(p.x - portal.x, p.y - portal.y) > portal.radius) return;
  portal.entered = true;
  p.warp = true;
  w.events.emit("portalEnter", { source: p.id, target: portal.id, x: portal.x, y: portal.y, alt: portal.alt });
  w.end("victory");
}

/** The portal has the player: it draws them to its axis and up out of sight. */
export function warpPlayer(w: World, portal: Portal, dt: number) {
  const p = w.player;
  const k = 1 - Math.exp(-6 * dt);
  p.x += (portal.x - p.x) * k;
  p.y += (portal.y - p.y) * k;
  p.vx = p.vy = 0;
  p.vz = WARP_RISE;
  p.alt += p.vz * dt;
}
