import { fmt, type BaseParams } from "../../enemies/types";
import type { MeleeParams } from "../../enemies/melee";
import type { RangedParams } from "../../enemies/ranged";
import type { BomberParams } from "../../enemies/bomber";
import type { QueenParams } from "../../enemies/queen";

// What the briefing says about each boid type: a line per ability, with its key stats.

/** One line of an enemy's briefing card. */
export interface CardAbility {
  icon: "crown" | "lunge" | "orb" | "blast";
  name: string;
  text: string;
  stats: string[];
}

type Card<P extends BaseParams> = (p: P) => CardAbility[];

const melee: Card<MeleeParams> = (p) => [
  { icon: "lunge", name: "Lunge", text: "Rears back, then dashes. Hit it first to interrupt.", stats: [`${fmt(p.damage)} dmg`, `${fmt(p.cooldown)}s recharge`] },
];

const ranged: Card<RangedParams> = (p) => [
  { icon: "orb", name: "Orb shot", text: "Stops to charge, then fires. Hit it first to interrupt.", stats: [`${fmt(p.damage)} dmg`, `${fmt(p.cooldown)}s recharge`] },
];

const bomber: Card<BomberParams> = (p) => [
  { icon: "blast", name: "Blast", text: "Explodes on contact, or when killed.", stats: [`${fmt(p.damage)} dmg`, "knockback"] },
];

const queen: Card<QueenParams> = (p) => [
  { icon: "crown", name: "Escorted", text: "Flees. Guarded by her flock.", stats: [] },
  { icon: "blast", name: "Blast", text: "Lets off a blast when you get close.", stats: [`${fmt(p.damage)} dmg`, "knockback"] },
];

/** The card for a boid type, by id. */
export const CARDS: Record<string, Card<BaseParams>> = { melee, ranged, bomber, queen } as unknown as Record<string, Card<BaseParams>>;
