import type { GameBus } from "../game/events";
import type { Island } from "../world/island";
import type { Boid } from "./boid";

// Boid types: each kind of enemy is one template, in its own file, with its own params (base
// params every boid has, plus its own) and its behaviour. A boid is an instance of a type with
// resolved params (the type's defaults with any overrides). How a type looks lives in
// render/sprites, and its briefing card in ui/briefing/cards.

/** Params every boid type has: the generic code (hits, hurtboxes, flocking, budgets) uses these. */
export interface BaseParams {
  /** Health. */
  hp: number;
  /** Top speed. */
  speed: number;
  /** Body size (× the type's base radius); the sprite scales with it. */
  size: number;
  /** What one costs out of a level's swarm budget. */
  cost: number;
}

/** [label, min, max, step] for a param's input in the dev panel. */
export type ParamInput = [string, number, number, number];

/** Steering a boid's behaviour adds to: an acceleration, and the altitude it heads for. */
export interface Steer {
  ax: number;
  ay: number;
  alt: number;
}

/** What the swarm knows about the player. */
export interface PlayerView {
  x: number;
  y: number;
  alt: number;
  /** false while respawning / after the round: boids ignore the player */
  targetable: boolean;
}

/** What a boid's behaviour can do: move, attack the player, and tell the world. */
export interface BoidApi {
  readonly bounds: { x: number; y: number; r: number };
  readonly islands: readonly Island[];
  readonly events: GameBus;
  /** Bleed off speed (`rate` per s) and drift: winding up, recovering. */
  brake(b: Boid, rate: number, dt: number): void;
  /** Move along the velocity, kept off islands and inside the boundary. */
  coast(b: Boid, dt: number): void;
  /** Steer by (ax, ay), with speed eased back down to `cap` at `ease`. */
  fly(b: Boid, ax: number, ay: number, cap: number, ease: number, dt: number): void;
  /** Whether the player can be hit within `range` of `b` (default: its body). */
  touchesPlayer(b: Boid, range?: number): boolean;
  /** `b` hits the player; a hit that lands freezes it along with them. */
  hitPlayer(b: Boid, damage: number): boolean;
  /** An orb from `b` straight at the player. */
  shoot(b: Boid, speed: number, life: number, radius: number, damage: number): void;
  /** `b` blows up (a bomber). */
  explode(b: Boid): void;
  /** The queen's blast. */
  queenBlast(b: Boid): void;
}

/** What a boid's behaviour gets each frame. */
export interface BoidContext {
  dt: number;
  player: PlayerView;
  /** From the boid to the player: offset and distance. */
  px: number;
  py: number;
  dP: number;
  /** Whether its flock is fighting the player (engaged, or screening the queen). */
  fighting: boolean;
  steer: Steer;
  /** Steer toward a point at `speed` with `weight`; `arrive` slows down on the way in. */
  seek(tx: number, ty: number, speed: number, weight: number, arrive?: boolean): void;
  swarm: BoidApi;
  rand: () => number;
}

export interface BoidType<P extends BaseParams = BaseParams> {
  id: string;
  name: string;
  /** Body radius at size 1. */
  radius: number;
  params: P;
  /** Inputs for the params, in the order the dev panel lists them. */
  inputs: Record<keyof P, ParamInput>;
  /** How much of a push (a blast, a hit's knockback) moves it: 1 = all. */
  knockback?: number;
  /**
   * The whole frame for boids that don't flock (the queen): movement and attacks. Flocking types
   * leave this out and use the hooks below inside the shared flocking step.
   */
  update?(b: Boid<P>, c: BoidContext): void;
  /** Runs first; true when it handled the boid's whole frame (mid-lunge, blown up). */
  preempt?(b: Boid<P>, c: BoidContext): boolean;
  /** Steering while its flock is fighting; sets `c.steer.alt` too. */
  fight?(b: Boid<P>, c: BoidContext): void;
  /** Attack when fighting and the cooldown is over; true ends the boid's frame. */
  attack?(b: Boid<P>, c: BoidContext): boolean;
  /** Extra vertical reach of its hurtbox (and its own touch) beyond the usual hit height; Infinity = any altitude. */
  reach?(b: Boid<P>): number;
}

/** A type's defaults with `over` on top (only keys the type has, only numbers). */
export function resolveParams<P extends BaseParams>(t: BoidType<P>, over: Partial<BaseParams> & Record<string, number> = {}): P {
  const p = { ...t.params };
  for (const [k, v] of Object.entries(over)) if (k in p && typeof v === "number" && Number.isFinite(v)) (p as unknown as Record<string, number>)[k] = v;
  return p;
}

export const fmt = (v: number) => String(Math.round(v * 10) / 10);
