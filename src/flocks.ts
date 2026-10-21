import { boidType, MEMBER_TYPES, type MemberTypeId } from "./boids";
import { resolveParams, type ParamInput } from "./boids/types";

// Flocks: groups of boids that fly and fight together, held together by the boids rules (spacing,
// alignment, cohesion toward the whole flock) and a soft leash, so a flock never comes apart.
// A flock template gives its members (listed, or sampled by weight) and its style; resolving it
// gives a concrete flock spec, which levels and the dev panel's custom levels are made of.

/** How a flock flies and fights, in intuitive terms (combat maps them to the boids weights). */
export interface FlockStyle {
  /** How far members may stray from the flock's centre before being pulled back hard. */
  spread: number;
  /** Personal space each member keeps from the others. */
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
}

export const DEFAULT_STYLE: FlockStyle = {
  spread: 80,
  spacing: 50,
  tightness: 0.3,
  coordination: 0.45,
  restlessness: 0.35,
  pace: 75,
  aggroRange: 200,
  giveUpRange: 350,
  grudge: 6,
  hunts: 0,
  attackers: 2,
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
};

/** Members of one type: how many, and any param overrides. */
export interface MemberSpec {
  type: MemberTypeId;
  count: number;
  params?: Record<string, number>;
}

/** A concrete flock: who is in it and how it flies. */
export interface FlockSpec {
  name: string;
  members: MemberSpec[];
  style: FlockStyle;
}

/** A flock template: members listed, or sampled by weight to a size within a range. */
export interface FlockTemplate {
  name: string;
  members?: MemberSpec[];
  sample?: { weights: Partial<Record<MemberTypeId, number>>; size: [number, number] };
  style?: Partial<FlockStyle>;
}

export const MELEE_PACK: FlockTemplate = { name: "Melee pack", members: [{ type: "melee", count: 4 }] };
export const SKIRMISHERS: FlockTemplate = {
  name: "Skirmishers",
  members: [{ type: "ranged", count: 3 }],
  style: { spread: 110, aggroRange: 320, giveUpRange: 500 },
};
export const BOMBER_RUN: FlockTemplate = {
  name: "Bomber run",
  members: [{ type: "bomber", count: 3 }],
  style: { coordination: 0.7, pace: 95 },
};
export const MIXED_FLOCK: FlockTemplate = {
  name: "Mixed flock",
  sample: { weights: { melee: 0.49, ranged: 0.29, bomber: 0.22 }, size: [3, 5] },
};
export const BIG_PACK: FlockTemplate = {
  name: "Big pack",
  sample: { weights: { melee: 0.7, ranged: 0.2, bomber: 0.1 }, size: [6, 8] },
  style: { spread: 110, tightness: 0.4 },
};
export const BRUTES: FlockTemplate = {
  name: "Brutes",
  members: [{ type: "melee", count: 2, params: { hp: 6, size: 1.6, speed: 150, cost: 3, damage: 4 } }],
  style: { spacing: 70, pace: 55 },
};
export const ROYAL_GUARD: FlockTemplate = {
  name: "Royal guard",
  sample: { weights: { melee: 0.49, ranged: 0.29, bomber: 0.22 }, size: [4, 4] },
  style: { tightness: 0.4 },
};

/** The predefined flocks, for the dev panel. */
export const FLOCK_TEMPLATES: FlockTemplate[] = [MELEE_PACK, SKIRMISHERS, BOMBER_RUN, MIXED_FLOCK, BIG_PACK, BRUTES, ROYAL_GUARD];

/** A concrete flock from a template (sampled ones draw their members from `rand`). */
export function resolveFlock(t: FlockTemplate, rand: () => number = Math.random): FlockSpec {
  const style = { ...DEFAULT_STYLE, ...t.style };
  if (t.members) return { name: t.name, members: t.members.map((m) => ({ ...m, params: m.params && { ...m.params } })), style };
  const { weights, size } = t.sample!;
  const n = Math.round(size[0] + rand() * (size[1] - size[0]));
  const total = MEMBER_TYPES.reduce((s, k) => s + (weights[k] ?? 0), 0) || 1;
  const counts: Partial<Record<MemberTypeId, number>> = {};
  for (let i = 0; i < n; i++) {
    let r = rand() * total;
    const k = MEMBER_TYPES.find((k) => (r -= weights[k] ?? 0) < 0) ?? MEMBER_TYPES[0]!;
    counts[k] = (counts[k] ?? 0) + 1;
  }
  return { name: t.name, members: MEMBER_TYPES.filter((k) => counts[k]).map((type) => ({ type, count: counts[type]! })), style };
}

/** A flock's share of a swarm budget: its members' costs. */
export const flockCost = (f: FlockSpec) =>
  f.members.reduce((s, m) => s + m.count * resolveParams(boidType(m.type), m.params).cost, 0);

export const flockSize = (f: FlockSpec) => f.members.reduce((s, m) => s + Math.max(0, Math.round(m.count)), 0);

/** "3 melee, 2 ranged" */
export const describeFlock = (f: FlockSpec) =>
  f.members
    .filter((m) => m.count > 0)
    .map((m) => `${m.count} ${m.type}${m.params && Object.keys(m.params).length ? "*" : ""}`)
    .join(", ") || "empty";
