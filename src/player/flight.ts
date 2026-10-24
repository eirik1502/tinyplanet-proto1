import { ISLAND_TOP } from "../world/island";
import type { World } from "../game/world";
import type { Player } from "./player";
import { LOST_ALT } from "./player";

// Flight physics: jumps, gravity (lighter near the apex), the air limits, wind, and hitting rims.
// Shared by the movement controller and the jump preview, which runs the same steps ahead.

export interface Flight {
  x: number;
  y: number;
  alt: number;
  vx: number;
  vy: number;
  vz: number;
  t: number;
}

/** The level's gravity: the tuned value, scaled by a gravity modifier. */
export const gravity = (w: World) => w.params.move.jump.gravity * w.rules.gravity;

/** Gravity at vertical speed `vz`: weaker near the apex, so jumps hang there a moment. */
export function gravityAt(w: World, vz: number) {
  const j = w.params.move.jump;
  return Math.abs(vz) < j.apexBand ? gravity(w) * j.apexGravity : gravity(w);
}

/**
 * Upward speed that rises exactly `height` before peaking, under gravityAt (normal gravity down to
 * the apex band, then the weaker apex gravity).
 */
export function riseSpeed(w: World, height: number) {
  const j = w.params.move.jump;
  const h = Math.max(0, height);
  const g = gravity(w);
  const ga = g * j.apexGravity;
  // Height risen inside the apex band alone.
  const band = (j.apexBand * j.apexBand) / (2 * ga);
  if (h <= band) return Math.sqrt(2 * ga * h);
  return Math.sqrt(j.apexBand * j.apexBand + 2 * g * (h - band));
}

/** Most a jump leans from straight out of the rim (rad). */
export const maxLean = (w: World) => (w.params.move.jump.maxLean * Math.PI) / 180;

/**
 * Launch state for a jump from rim parameter `s` in direction `angle`. Moving along the rim adds
 * to the jump speed but not to its direction: a slide by `jump.slideFactor`, and climbing (`climb`,
 * the climb speed along the rim from the input) by `jump.climbFactor` for the part of it that goes
 * the jump's way (climbing away from it adds nothing).
 */
export function launch(w: World, islandIdx: number, s: number, angle: number, slide: number, climb = 0): Flight {
  const e = w.islands[islandIdx]!.pointAt(s);
  const j = w.params.move.jump;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const climbing = Math.max(0, climb * (e.tx * dx + e.ty * dy)) * j.climbFactor;
  const v = Math.min(w.params.move.limits.maxSpeed, j.speed + Math.abs(slide) * j.slideFactor + climbing);
  return { x: e.x + e.nx * 12, y: e.y + e.ny * 12, alt: ISLAND_TOP, vx: dx * v, vy: dy * v, vz: riseSpeed(w, j.height), t: 0 };
}

/** The safety bounce: the first dip below the rim in a flight springs back up. */
export function netBounce(w: World, f: { alt: number; vz: number }, used: boolean): boolean {
  if (used || f.vz >= 0 || f.alt > ISLAND_TOP - w.params.move.airJump.netDepth) return false;
  f.vz = w.params.move.airJump.netBounce;
  return true;
}

/**
 * Advance a flight by dt, within the air limits. Returns the island and rim parameter if it hit one: either by crossing a
 * rim (from above or level with it, so you can't jump over an island) or by touching the body below.
 */
export function stepFlight(w: World, f: Flight, dt: number, fromIsland: number): { island: number; s: number } | null {
  const ox = f.x;
  const oy = f.y;
  f.vz -= gravityAt(w, f.vz) * dt;
  f.vx += w.rules.wind.x * dt;
  f.vy += w.rules.wind.y * dt;
  // Caps: a rise peaks by the height limit at the latest, and sideways speed stops at the max.
  if (f.vz > 0) f.vz = Math.min(f.vz, riseSpeed(w, ISLAND_TOP + w.params.move.limits.maxHeight - f.alt));
  const sp = Math.hypot(f.vx, f.vy);
  const max = w.params.move.limits.maxSpeed;
  if (sp > max) {
    f.vx *= max / sp;
    f.vy *= max / sp;
  }
  f.x += f.vx * dt;
  f.y += f.vy * dt;
  f.alt += f.vz * dt;
  f.t += dt;
  for (let i = 0; i < w.islands.length; i++) {
    if (i === fromIsland && f.t < w.params.move.jump.regrab) continue;
    const isl = w.islands[i]!;
    // Too far off to touch it this step (outlines wobble up to ~30% past the nominal radius).
    if (Math.abs(f.x - isl.cx) + Math.abs(f.y - isl.cy) > (isl.radius * 1.35 + 80) * 1.42) continue;
    if (f.alt >= ISLAND_TOP - 4) {
      const s = isl.segmentHit(ox, oy, f.x, f.y);
      if (s !== null) return { island: i, s };
    }
    // Falling, the hands reach a little further for a rim.
    const reach = f.vz < 0 ? w.params.move.air.fallGrab : w.params.move.air.grabRadius;
    if (isl.intersects(f.x, f.y, f.alt, reach)) return { island: i, s: isl.closest(f.x, f.y).s };
  }
  return null;
}

/** The player's flight as it stands. */
export const flightOf = (p: Player): Flight => ({ x: p.x, y: p.y, alt: p.alt, vx: p.vx, vy: p.vy, vz: p.vz, t: p.airTime });

/** Where a flight goes: points along it (every other step), and where it lands, if on a rim. */
export interface FlightPrediction {
  points: { x: number; y: number; alt: number }[];
  /** At the flight's altitude: it may cross well above the rim. */
  landing: { x: number; y: number; alt: number } | null;
  /** The island it lands on. */
  island: number | null;
}

/** The rest of a flight if nothing steers it, from `fromIsland` with the safety bounce `netUsed` or not. */
export function predict(w: World, flight: Flight, fromIsland: number, netUsed: boolean): FlightPrediction {
  const f = { ...flight };
  const points = [{ x: f.x, y: f.y, alt: f.alt }];
  for (let i = 0; i < 300 && f.alt > LOST_ALT; i++) {
    const h = stepFlight(w, f, 1 / 60, fromIsland);
    if (h) {
      const e = w.islands[h.island]!.pointAt(h.s);
      const landing = { x: e.x, y: e.y, alt: Math.max(ISLAND_TOP, f.alt) };
      points.push(landing);
      return { points, landing, island: h.island };
    }
    if (netBounce(w, f, netUsed)) netUsed = true;
    if (i % 2 === 1) points.push({ x: f.x, y: f.y, alt: f.alt });
  }
  return { points, landing: null, island: null };
}

/** The rest of the player's flight if nothing steers it. */
export const predictFlight = (w: World, p: Player) => predict(w, flightOf(p), p.launchIsland, p.netUsed);
