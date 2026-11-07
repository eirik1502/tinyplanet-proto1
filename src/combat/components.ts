import { component } from "../core/object";
import type { Hitbox, Hurtbox } from "./hitbox";

// Combat components: what can be hurt (Health, Hurtable) and what hurts (HitVolume). The player
// and the boids are both hurtable; sword strikes, the spear and the boids' orbs are hit volumes.

/** Which side something fights on: volumes only hit hurtables of the other team. */
export type Team = "player" | "swarm";

export interface Health {
  hp: number;
  max: number;
}
export const Health = component<Health>("health");

export interface HitInfo {
  damage: number;
  /** Where the hit comes from: its knockback pushes away from here. */
  fromX: number;
  fromY: number;
  /** The attacker's id (the player, a boid), if any. */
  source?: number;
  /** For player hits: which weapon, attack ("sword.swipe") and combo strike landed it. */
  weapon?: string;
  attack?: string;
  step?: number;
  /** A blast (an explosion): armor doesn't stop it. */
  explosive?: boolean;
  /** How hard the hit throws the target, × the usual (default 1). */
  knockback?: number;
  /** Staggers a boid this long (s): it drifts and can't act. */
  stun?: number;
}

export interface Hurtable {
  team: Team;
  hurtbox(): Hurtbox;
  /** Whether it can be hit now (not respawning, the round not over). */
  targetable(): boolean;
  /** Take a hit; false if it didn't land (invulnerable, shielded, out of the round). */
  hit(h: HitInfo): boolean;
  /** Shove by this velocity (vz up). A `hard` shove first cancels any flight against it. */
  push(vx: number, vy: number, vz: number, hard?: boolean): void;
}
export const Hurtable = component<Hurtable>("hurtable");

/**
 * Something that hurts: around its object's position, for `active` seconds (a blade), or moving
 * with the object until its life runs out or it hits (a projectile). Each target is hit once.
 */
export interface HitVolume {
  team: Team;
  /** Id of who made it. */
  owner: number;
  /** What made it, for reactions and looks: "sword.swipe", "spear", "orb". */
  attack: string;
  weapon?: string;
  /** The sword combo's strike. */
  step?: number;
  /** The hitbox, relative to the object's position. */
  shape: Omit<Hitbox, "x" | "y" | "alt">;
  damage: number;
  /** How hard its hits throw, × the usual (default 1). */
  knockback?: number;
  /** A blade that moves with this object (by id), like the player through a lunge. */
  follow?: number;
  /** 0..1, how charged the attack was. */
  power: number;
  /** Seconds it hits for (blades). */
  active: number;
  age: number;
  /**
   * Projectiles: seconds left, and their size multiplier. They end on islands and after `pierce`
   * hits (default 1), and blades can block them. Each hit after the first does `falloff` less of
   * the damage than the one before, down to `minDamage` of it. `flame`: how big a flame burns
   * from the tip.
   */
  projectile?: { life: number; scale: number; pierce?: number; falloff?: number; minDamage?: number; flame?: number };
  /** A blade blocks the other team's projectiles it touches. */
  blocks?: boolean;
  /** Ids of everything it has hit. */
  hits: Set<number>;
}
export const HitVolume = component<HitVolume>("hitVolume");
