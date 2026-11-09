import { boidType, type MemberTypeId } from "./index";
import { resolveParams, type ParamInput } from "./types";

// Flocks: groups of boids that fly and fight together, held together by the boids rules (spacing,
// alignment, cohesion toward the whole flock) and a soft leash, so a flock never comes apart.
// A flock template gives its members and its style; resolving it gives a concrete flock spec,
// which levels and the dev panel's custom levels are made of.

/** How a flock flies and fights, in intuitive terms (the swarm maps them to the boids weights). */
export interface FlockStyle {
  /** How far members may stray from the flock's centre before being pulled back hard. */
  spread: number;
  /** Personal space each member keeps from the others (between their bodies). */
  spacing: number;
  /** 0..1: how strongly members are drawn together. */
  tightness: number;
  /** 0..1: every boid for itself ↔ moving as one. */
  coordination: number;
  /** 0..1: calm ↔ jittery. */
  restlessness: number;
  /** Roaming speed while idle. */
  pace: number;
  /** Engages when a member is this close to the player. */
  aggroRange: number;
  /** Gives up once every member is this far away (and the grudge has worn off). */
  giveUpRange: number;
  /** Stays engaged this long after a member was hit (s). */
  grudge: number;
  /** 1: hunts the player from the start, wherever they are. */
  hunts: number;
  /** How many members may be attacking (winding up or lunging) at once. */
  attackers: number;
  /** Speed (×) while engaged and still out of range to attack. */
  rush: number;
}

export const DEFAULT_STYLE: FlockStyle = {
  spread: 120,
  spacing: 34,
  tightness: 0.3,
  coordination: 0.45,
  restlessness: 0.35,
  pace: 75,
  aggroRange: 200,
  giveUpRange: 350,
  grudge: 6,
  hunts: 0,
  attackers: 3,
  rush: 2.6,
};

export const STYLE_INPUTS: Record<keyof FlockStyle, ParamInput> = {
  spread: ["Spread", 20, 400, 5],
  spacing: ["Spacing", 10, 150, 1],
  tightness: ["Tightness", 0, 1, 0.05],
  coordination: ["Coordination", 0, 1, 0.05],
  restlessness: ["Restlessness", 0, 1, 0.05],
  pace: ["Roaming pace", 0, 300, 5],
  aggroRange: ["Aggro range", 0, 1200, 10],
  giveUpRange: ["Give-up range", 0, 2000, 10],
  grudge: ["Grudge after a hit (s)", 0, 30, 0.5],
  hunts: ["Hunts you from the start", 0, 1, 1],
  attackers: ["Attacking at once", 1, 12, 1],
  rush: ["Rushes in when engaged (× speed)", 1, 3, 0.05],
};

/** Members of one type: how many, their health (default: the type's), and any other param overrides. */
export interface MemberSpec {
  type: MemberTypeId;
  count: number;
  hp?: number;
  params?: Record<string, number>;
}

/** One member's params: its type's defaults with the member's overrides. */
export const memberParams = (m: MemberSpec) =>
  resolveParams(boidType(m.type), m.hp === undefined ? m.params : { ...m.params, hp: m.hp });

/** A concrete flock: who is in it and how it flies. */
export interface FlockSpec {
  name: string;
  members: MemberSpec[];
  style: FlockStyle;
}

/** A flock template: its members, and how it flies where that differs from the default. */
export interface FlockTemplate {
  name: string;
  members: MemberSpec[];
  style?: Partial<FlockStyle>;
}

// The predefined flocks, by how far into a run they show up. Early ones have the types' default
// health; later ones are fewer and tougher (and so bigger) for the same budget.

export const MELEE_PACK: FlockTemplate = { name: "Melee pack", members: [{ type: "melee", count: 7 }] };
export const SKIRMISHERS: FlockTemplate = {
  name: "Skirmishers",
  members: [{ type: "ranged", count: 5 }],
  style: { spread: 140, aggroRange: 320, giveUpRange: 500 },
};
export const BOMBER_RUN: FlockTemplate = {
  name: "Bomber run",
  members: [{ type: "bomber", count: 3 }],
  style: { spread: 80, coordination: 0.7, pace: 95 },
};
export const MIXED_FLOCK: FlockTemplate = {
  name: "Mixed flock",
  members: [
    { type: "melee", count: 5 },
    { type: "ranged", count: 3 },
    { type: "bomber", count: 1 },
  ],
  style: { attackers: 3 },
};
export const MIXED_RANGED: FlockTemplate = {
  name: "Mixed flock (ranged-heavy)",
  members: [
    { type: "melee", count: 3 },
    { type: "ranged", count: 5 },
    { type: "bomber", count: 1 },
  ],
  style: { spread: 140, attackers: 3 },
};
export const BIG_PACK: FlockTemplate = {
  name: "Big pack",
  members: [
    { type: "melee", count: 9 },
    { type: "ranged", count: 3 },
  ],
  style: { spread: 160, tightness: 0.4, attackers: 3 },
};

export const VETERANS: FlockTemplate = { name: "Veterans", members: [{ type: "melee", count: 6, hp: 4 }] };
export const GUNLINE: FlockTemplate = {
  name: "Gunline",
  members: [
    { type: "melee", count: 4, hp: 4 },
    { type: "ranged", count: 4 },
  ],
  style: { spread: 140, aggroRange: 280, giveUpRange: 450, attackers: 3 },
};
export const HEAVY_BOMBERS: FlockTemplate = {
  name: "Heavy bombers",
  members: [{ type: "bomber", count: 3, hp: 2 }],
  style: { spread: 80, coordination: 0.7, pace: 95 },
};
export const MIXED_VETERANS: FlockTemplate = {
  name: "Mixed veterans",
  members: [
    { type: "melee", count: 4, hp: 4 },
    { type: "ranged", count: 3, hp: 3 },
  ],
  style: { attackers: 3 },
};

const BRUTE: MemberSpec = { type: "melee", count: 2, hp: 10, params: { speed: 150, damage: 4 } };
export const BRUTES: FlockTemplate = { name: "Brutes", members: [BRUTE], style: { spacing: 45, pace: 55 } };
export const BRUTE_SQUAD: FlockTemplate = {
  name: "Brute squad",
  members: [BRUTE, { type: "melee", count: 5 }],
  style: { spread: 140, attackers: 3 },
};
export const ARMORED_BOMBERS: FlockTemplate = {
  name: "Armored bombers",
  members: [{ type: "bomber", count: 3, hp: 3 }],
  style: { spread: 80, coordination: 0.7, pace: 85 },
};
export const ELITE_SKIRMISHERS: FlockTemplate = {
  name: "Elite skirmishers",
  members: [{ type: "ranged", count: 5, hp: 4 }],
  style: { spread: 140, aggroRange: 320, giveUpRange: 500 },
};

/** The queen's escort unless a template gives its own. */
export const ROYAL_GUARD: FlockTemplate = {
  name: "Royal guard",
  members: [
    { type: "melee", count: 2 },
    { type: "ranged", count: 1 },
    { type: "bomber", count: 1 },
  ],
  style: { tightness: 0.4 },
};

/** The predefined flocks by their names in this file (the dev panel's levels refer to them so). */
export const FLOCKS: Record<string, FlockTemplate> = {
  MELEE_PACK,
  SKIRMISHERS,
  BOMBER_RUN,
  MIXED_FLOCK,
  MIXED_RANGED,
  BIG_PACK,
  VETERANS,
  GUNLINE,
  HEAVY_BOMBERS,
  MIXED_VETERANS,
  BRUTES,
  BRUTE_SQUAD,
  ARMORED_BOMBERS,
  ELITE_SKIRMISHERS,
  ROYAL_GUARD,
};

/** The predefined flocks, for the dev panel. */
export const FLOCK_TEMPLATES: FlockTemplate[] = Object.values(FLOCKS);

/** A concrete flock from a template. */
export function resolveFlock(t: FlockTemplate): FlockSpec {
  const style = { ...DEFAULT_STYLE, ...t.style };
  return { name: t.name, members: t.members.map((m) => ({ ...m, params: m.params && { ...m.params } })), style };
}

/** A flock's share of a swarm budget: its members' health, at their types' cost per health. */
export const flockCost = (f: FlockSpec) =>
  f.members.reduce((s, m) => {
    const p = memberParams(m);
    return s + m.count * p.hp * p.costPerHp;
  }, 0);

export const flockSize = (f: FlockSpec) => f.members.reduce((s, m) => s + Math.max(0, Math.round(m.count)), 0);

/** "3 melee, 2 ranged" */
export const describeFlock = (f: FlockSpec) =>
  f.members
    .filter((m) => m.count > 0)
    .map((m) => `${m.count} ${m.type}${m.hp !== undefined ? ` hp ${m.hp}` : ""}${m.params && Object.keys(m.params).length ? "*" : ""}`)
    .join(", ") || "empty";
