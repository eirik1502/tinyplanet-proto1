import type { GameObject } from "../core/object";
import type { HitVolume } from "../combat/components";
import type { World } from "../game/world";
import type { Params } from "../params/store";
import type { Player } from "../player/player";

// Attacks as data plus hooks. A weapon is one attack, or a combo of them (a hit opens a window in
// which the next press is the next attack along). Holding the button aims and charges the attack
// (power 0..1); releasing it calls the attack's `release`, which spawns hit volumes, starts a
// lunge, sets off a blast… The aim indicator is the attack's `indicator` shapes, drawn by the
// renderer whatever the attack is.
//
// Numbers come from stat groups (the `player.*` params). Perks are upgrades: they can change any
// stat group before an attack reads it, and listen to world events to add effects of their own.

export type WeaponId = "sword" | "spear";

/** The param groups attacks read, by name. */
export type StatGroup = "aim" | "sword" | "thrust" | "smash" | "spear";
export type Stats<G extends StatGroup> = Params["player"][G];

/** An aim indicator shape, in the aim's frame: +x along the aim, from the player. */
export type Shape =
  /** A sector of `radius`, `arc` radians either side of the aim. */
  | { kind: "fan"; radius: number; arc: number }
  /** A rectangle reaching `length` along the aim, `halfWidth` either side. */
  | { kind: "rect"; length: number; halfWidth: number }
  /** A circle centred `x` along the aim (dashed: a secondary reach, like a blast). */
  | { kind: "circle"; x: number; radius: number; dashed?: boolean };

/** What an attack gets when it goes off. */
export interface AttackContext {
  world: World;
  player: Player;
  /** Where it starts (just above the rim when hanging) and its unit direction and angle. */
  x: number;
  y: number;
  alt: number;
  dx: number;
  dy: number;
  angle: number;
  /** 0..1, how long it was charged. */
  power: number;
  /** A stat group with the perks applied. */
  stats<G extends StatGroup>(group: G): Stats<G>;
  /** A hit volume of the player's team at (x, y, alt), moving at (vx, vy, vz) if a projectile. */
  spawn(v: VolumeSpec, at?: { x: number; y: number; alt: number; vx?: number; vy?: number; vz?: number }): GameObject;
  /**
   * Lunge at `target` (leaving the rim if hanging): fly straight at it at `speed` until within
   * `strikeDistance` of its body, or `maxTime` runs out, or the player lands; then `strike` goes off
   * from where the player is. The weapon's cooldown starts after the strike.
   */
  lunge(target: GameObject, o: { speed: number; maxTime: number; strikeDistance: number; strike: (c: AttackContext) => void }): void;
  /** Tell listeners what this attack reached (for its look): its reach along the aim and half-width. */
  describe(reach: number, halfWidth?: number): void;
}

export type VolumeSpec = Omit<HitVolume, "team" | "owner" | "weapon" | "age" | "hits" | "power"> & { power?: number };

export interface AttackDef {
  /** Unique id, as "weapon.attack" ("sword.swipe") or the weapon's id for single attacks. */
  id: string;
  name: string;
  indicator(stats: AttackContext["stats"], power: number): Shape[];
  release(c: AttackContext): void;
}

export interface Weapon {
  id: WeaponId;
  name: string;
  /** Cooldown after an attack (s). */
  cooldown(stats: AttackContext["stats"]): number;
  /** One attack, or a combo: the attacks in order, and how long a hit keeps the next one open (s). */
  attacks: AttackDef[];
  comboWindow?(stats: AttackContext["stats"]): number;
}

/** An upgrade. */
export interface Perk {
  id: string;
  name: string;
  blurb: string;
  /** Change a stat group's values (a copy) before an attack or indicator reads them. */
  modify?(group: StatGroup, stats: Record<string, number>): void;
  /** Add behaviour to a world: listen to its events (with `owner: world.lifetime`). */
  install?(world: World): void;
}

export interface Loadout {
  weapons: Weapon[];
  perks: Perk[];
}
