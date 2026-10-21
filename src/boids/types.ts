import type { Boid, Combat } from "../combat";
import type { PlayerView } from "../combat";

// Boid types: each kind of enemy is one template, in its own file, with its own params (base
// params every boid has, plus its own), its behaviour, its sprite and its briefing card. A boid is
// an instance of a type with resolved params (the type's defaults with any overrides).

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
  combat: Combat;
  rand: () => number;
}

/** One line of an enemy's briefing card. */
export interface CardAbility {
  icon: "crown" | "lunge" | "orb" | "blast";
  name: string;
  text: string;
  stats: string[];
}

export interface BoidType<P extends BaseParams = BaseParams> {
  id: string;
  name: string;
  /** Hit sparks, briefing card tint. */
  color: string;
  /** Body radius at size 1. */
  radius: number;
  params: P;
  /** Inputs for the params, in the order the dev panel lists them. */
  inputs: Record<keyof P, ParamInput>;
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
  /** Sprite at the origin, facing +x after `heading`, at `k` px per world unit and size 1. */
  draw(ctx: CanvasRenderingContext2D, b: BoidLook<P>, k: number): void;
  card(p: P): CardAbility[];
}

/** What a sprite needs to know about its boid (the briefing's portraits make these up). */
export interface BoidLook<P extends BaseParams = BaseParams> {
  id: number;
  heading: number;
  phase: number;
  lunge: number;
  cooldown: number;
  windup: number;
  recover: number;
  flash: number;
  params: P;
  flock: { engaged: boolean };
}

/** A type's defaults with `over` on top (only keys the type has, only numbers). */
export function resolveParams<P extends BaseParams>(t: BoidType<P>, over: Partial<BaseParams> & Record<string, number> = {}): P {
  const p = { ...t.params };
  for (const [k, v] of Object.entries(over)) if (k in p && typeof v === "number" && Number.isFinite(v)) (p as unknown as Record<string, number>)[k] = v;
  return p;
}

export const fmt = (v: number) => String(Math.round(v * 10) / 10);
