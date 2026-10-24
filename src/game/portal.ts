import { GameObject } from "../core/object";
import { ISLAND_TOP } from "../world/island";
import type { World } from "./world";

// The portal out of a planet: a column of light hovering off an island. It opens once nothing on
// the planet is left to beat, and flying into it wins the round.

export class Portal extends GameObject {
  open = false;
  /** Seconds since it opened. */
  openFor = 0;
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

/** Open the portal once every boid is dead; win when the player flies into it. */
export function updatePortal(w: World, portal: Portal, dt: number) {
  if (!portal.open && w.swarm.boids.length === 0) {
    portal.open = true;
    w.events.emit("portalOpen", { source: portal.id, x: portal.x, y: portal.y, alt: portal.alt });
  }
  if (!portal.open) return;
  portal.openFor += dt;
  const p = w.player;
  if (!w.playing || p.mode !== "air") return;
  if (p.alt < ISLAND_TOP - REACH_DOWN || p.alt > ISLAND_TOP + REACH_UP) return;
  if (Math.hypot(p.x - portal.x, p.y - portal.y) > portal.radius) return;
  w.events.emit("portalEnter", { source: p.id, target: portal.id, x: portal.x, y: portal.y, alt: portal.alt });
  w.end("victory");
}
