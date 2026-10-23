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
  /** 0..1, how charged the attack was. */
  power: number;
  /** Seconds it hits for (blades). */
  active: number;
  age: number;
  /** Projectiles: seconds left, and their size multiplier. They end on their first hit and on islands, and blades can block them. */
  projectile?: { life: number; scale: number };
  /** A blade blocks the other team's projectiles it touches. */
  blocks?: boolean;
  /** Ids of everything it has hit. */
  hits: Set<number>;
}
export const HitVolume = component<HitVolume>("hitVolume");
