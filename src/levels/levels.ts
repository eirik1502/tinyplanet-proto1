import type { Vec } from "../core/math";
import { smoothstep, lerp } from "../core/math";
import { mulberry32, type Rng } from "../core/rng";
import type { WeaponId } from "../attacks/types";
import { BOID_TYPES } from "../enemies";
import type { SwarmRules } from "../enemies/swarm";
import { resolveParams } from "../enemies/types";
import {
  BIG_PACK,
  BOMBER_RUN,
  BRUTES,
  flockCost,
  MELEE_PACK,
  MIXED_FLOCK,
  resolveFlock,
  ROYAL_GUARD,
  SKIRMISHERS,
  type FlockSpec,
  type FlockTemplate,
} from "../enemies/flocks";
import type { Params } from "../params/store";
import type { Layout, PlanetOptions, QueenSpot, Spot, SwarmSpots, ThemeHint } from "../world/planet";

// Levels. Everything about a level is a LevelSpec: plain data (layout, size, queen, flocks,
// modifiers, weapons) that a planet is generated from. The dev panel's custom levels edit one
// directly; the game's levels come from templates. PROGRESSION says which template each level
// uses; a template turns a level number into a spec: its own planet size (tuned to its theme, not
// the level) and the level's swarm budget, shaped by the template's layout, flocks and modifiers.

/** A level, fully described: what the planet is generated from. */
export interface LevelSpec {
  layout: LayoutId;
  radius: number;
  islands: number;
  theme?: ThemeHint;
  /** Where the flocks spawn. */
  placement: PlacementId;
  queenSpot: QueenSpot;
  /** The queen, with her param overrides and escort; null for none (then every boid must die). */
  queen: { params: Record<string, number>; escort: FlockSpec } | null;
  flocks: FlockSpec[];
  modifiers: ModifierId[];
  weapons: WeaponId[];
  /** Upgrades the player has (attacks/perks.ts ids). */
  perks?: string[];
}

/** One template entry: a flock to always include, `count` times (default once). */
export interface FlockEntry {
  flock: FlockTemplate;
  count?: number;
}

export interface LevelTemplate {
  name: string;
  /** One line for the briefing. */
  blurb: string;
  boss?: boolean;
  layout: LayoutId;
  /** The planet's boundary radius and island count: set by the theme, the same on every level. */
  planet: { radius: number; islands: number };
  /** Flocks every planet of this template has. */
  flocks?: FlockEntry[];
  /** The rest of the level's swarm budget is spent on flocks picked from here (repeat one to weight it). */
  pool?: FlockTemplate[];
  /** Multiplier on the level's swarm budget (fewer boids when they're tougher). */
  budget?: number;
  /** The queen's escort. Default: the royal guard. */
  escort?: FlockTemplate;
  placement?: PlacementId;
  queen?: QueenSpot;
  /** Multiplier on the queen's health. */
  queenHp?: number;
  /** Overrides on the queen's params (after `queenHp`). */
  queenParams?: Record<string, number>;
  /** No queen: the level is won when every boid is down. */
  noQueen?: boolean;
  theme?: ThemeHint;
  /** Modifiers this template always has (bosses); others may be rolled on top. */
  modifiers?: ModifierId[];
}

/** Base values for a level from the tuning panel (level 4 + per-level increase). */
export interface LevelBase {
  budget: number;
}

const between = (rand: () => number, lo: number, hi: number) => lo + rand() * (hi - lo);

// ---------------------------------------------------------------------------------------------
// Layouts
// ---------------------------------------------------------------------------------------------

/** Islands of all sizes anywhere: the original generator. */
const scatter = (): Layout => ({
  radius: (_, r) => between(r, 80, 160),
  gap: (_, r) => between(r, 50, 200),
});

/** A band of islands near the boundary around an empty middle. */
const ring = (rand: () => number): Layout => {
  const a = rand() * Math.PI * 2;
  return {
    seeds: [{ x: Math.cos(a) * 0.72, y: Math.sin(a) * 0.72 }],
    radius: (_, r) => between(r, 75, 135),
    gap: (_, r) => between(r, 50, 170),
    accept: (s) => smoothstep(0.45, 0.6, s.rho),
  };
};

/** A dense heart of islands with open sky around it. */
const core = (): Layout => ({
  seeds: [{ x: 0, y: 0 }],
  radius: (_, r) => between(r, 75, 140),
  gap: (_, r) => between(r, 50, 120),
  accept: (s) => 1 - smoothstep(0.35, 0.6, s.rho),
});

/** Tight groups of islands, joined to each other only by stepping stones. */
const clusters = (rand: () => number): Layout => {
  const k = 3;
  const a0 = rand() * Math.PI * 2;
  const seeds: Vec[] = [];
  for (let i = 0; i < k; i++) {
    const a = a0 + (i / k) * Math.PI * 2 + (rand() - 0.5) * 0.4;
    const d = between(rand, 0.6, 0.68);
    seeds.push({ x: Math.cos(a) * d, y: Math.sin(a) * d });
  }
  const spread = 0.13;
  return {
    seeds,
    radius: (_, r) => between(r, 55, 100),
    // Islands always keep 50 clear of each other, so this is as tight as they pack.
    gap: (_, r) => between(r, 50, 75),
    accept: (s) => Math.max(...seeds.map((c) => Math.exp(-((Math.hypot(s.x / s.R - c.x, s.y / s.R - c.y) / spread) ** 2)))),
  };
};

/** A long, narrow band across the planet: the start at one end, the queen at the other. */
const gauntlet = (rand: () => number): Layout => {
  const a = rand() * Math.PI * 2;
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  const width = 0.09;
  return {
    seeds: [{ x: -ux * 0.7, y: -uy * 0.7 }],
    start: { x: -ux, y: -uy },
    radius: (_, r) => between(r, 55, 100),
    gap: (_, r) => between(r, 60, 160),
    // Distance from the band's centre line.
    accept: (s) => Math.exp(-(((-uy * s.x + ux * s.y) / s.R / width) ** 2)),
  };
};

/** Sparse, wide-spaced islands at the start, thickening toward the far side. */
const gradient = (rand: () => number): Layout => {
  const a = rand() * Math.PI * 2;
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  // 0 at the start's side of the planet, 1 at the far side.
  const along = (s: Spot) => Math.min(1, Math.max(0, ((ux * s.x + uy * s.y) / s.R + 1) / 2));
  return {
    // Grow from the dense side, so the sparse side only gets the few islands it accepts.
    seeds: [{ x: ux * 0.45, y: uy * 0.45 }],
    start: { x: -ux, y: -uy },
    radius: (s, r) => between(r, 60, 100) + 50 * along(s),
    gap: (s, r) => lerp(185, 50, along(s)) + between(r, 0, 15),
    accept: (s) => lerp(0.04, 1, along(s) ** 1.5),
  };
};

/** Lots of small, round islands with few trees: a hopping level. */
const pebbles = (): Layout => ({
  radius: (_, r) => between(r, 50, 85),
  gap: (_, r) => between(r, 70, 190),
  style: { wobble: 0.6, trees: 2 },
});

/** A few huge islands with pebbles between them. */
const continents = (): Layout => ({
  radius: (_, r) => (r() < 0.3 ? between(r, 190, 250) : between(r, 50, 80)),
  gap: (_, r) => between(r, 60, 170),
  style: { wobble: 0.8, trees: 5 },
});

/** Wide gaps everywhere: every crossing is a long jump. */
const longLeaps = (): Layout => ({
  radius: (_, r) => between(r, 100, 150),
  gap: (_, r) => between(r, 165, 200),
});

/** Patches of islands and empty sky, from a noise field. */
const wilds = (rand: () => number): Layout => {
  const noise = valueNoise(rand, 4);
  return {
    radius: (_, r) => between(r, 65, 140),
    gap: (_, r) => between(r, 50, 110),
    accept: (s) => smoothstep(0.45, 0.6, noise(s.x / s.R, s.y / s.R)),
  };
};

/** Smooth random values over the unit disc ([-1, 1]²), `cells` lattice cells across. */
function valueNoise(rand: () => number, cells: number) {
  const n = cells + 1;
  const lattice = Array.from({ length: n * n }, () => rand());
  const at = (i: number, j: number) => lattice[Math.min(n - 1, Math.max(0, j)) * n + Math.min(n - 1, Math.max(0, i))]!;
  const fade = (t: number) => t * t * (3 - 2 * t);
  return (x: number, y: number) => {
    const gx = ((x + 1) / 2) * cells;
    const gy = ((y + 1) / 2) * cells;
    const i = Math.floor(gx);
    const j = Math.floor(gy);
    const u = fade(gx - i);
    const v = fade(gy - j);
    return lerp(lerp(at(i, j), at(i + 1, j), u), lerp(at(i, j + 1), at(i + 1, j + 1), u), v);
  };
}


/** The layouts by name, for templates and the dev panel. */
export const LAYOUTS = {
  scatter: { name: "Scatter", make: scatter },
  ring: { name: "Ring", make: ring },
  core: { name: "Dense core", make: core },
  clusters: { name: "Clusters", make: clusters },
  gauntlet: { name: "Gauntlet", make: gauntlet },
  gradient: { name: "Gradient", make: gradient },
  pebbles: { name: "Pebbles", make: pebbles },
  continents: { name: "Continents", make: continents },
  longLeaps: { name: "Long leaps", make: longLeaps },
  wilds: { name: "Wilds", make: wilds },
} satisfies Record<string, { name: string; make: (rand: () => number) => Layout }>;
export type LayoutId = keyof typeof LAYOUTS;

// ---------------------------------------------------------------------------------------------
// Flock placement maps
// ---------------------------------------------------------------------------------------------

/** Flocks crowd around the queen. */
const guardQueen = (s: Spot, w: SwarmSpots) => Math.exp(-Math.hypot(s.x - w.queen.x, s.y - w.queen.y) / (0.35 * w.R));
/** Flocks gather in the middle of the planet. */
const middle = (s: Spot) => 1 - smoothstep(0.25, 0.6, s.rho);
/** Flocks patrol the outskirts. */
const edges = (s: Spot) => smoothstep(0.55, 0.8, s.rho);
/** Flocks wait just beyond the start's safe zone. */
const ambush = (s: Spot, w: SwarmSpots) => Math.exp(-(((Math.hypot(s.x - w.start.x, s.y - w.start.y) - 650) / 250) ** 2));
/** Flocks wait a short hop from the start: the quickest way to a fight. */
const nearStart = (s: Spot, w: SwarmSpots) => Math.exp(-(((Math.hypot(s.x - w.start.x, s.y - w.start.y) - 450) / 120) ** 2));

/** Where flocks spawn, by name: a placement map, and how far from the start they keep at least. */
export const PLACEMENTS = {
  anywhere: { name: "Anywhere", minFromStart: 520 },
  middle: { name: "The middle", weight: middle, minFromStart: 520 },
  edges: { name: "The outskirts", weight: edges, minFromStart: 520 },
  guardQueen: { name: "Around the queen", weight: guardQueen, minFromStart: 520 },
  ambush: { name: "Ambush past the start", weight: ambush, minFromStart: 520 },
  nearStart: { name: "Near the start", weight: nearStart, minFromStart: 300 },
} satisfies Record<string, { name: string; weight?: (s: Spot, w: SwarmSpots) => number; minFromStart: number }>;
export type PlacementId = keyof typeof PLACEMENTS;

export const QUEEN_SPOTS: Record<QueenSpot, string> = {
  far: "Far from the start",
  centre: "Nearest the centre",
  crowded: "Most crowded island",
};

// ---------------------------------------------------------------------------------------------
// Modifiers
// ---------------------------------------------------------------------------------------------

export type ModifierId = "wind" | "lowGravity" | "heavyGravity" | "fog" | "shield" | "reinforcements" | "elite";

export interface Modifier {
  name: string;
  blurb: string;
  /** Only on boss levels, never rolled. */
  bossOnly?: boolean;
  /** Can't be on the same level as these. */
  excludes?: ModifierId[];
}

export const MODIFIERS: Record<ModifierId, Modifier> = {
  wind: { name: "Wind", blurb: "A steady wind drifts you in the air." },
  lowGravity: { name: "Low gravity", blurb: "Floaty jumps that carry farther.", excludes: ["heavyGravity"] },
  heavyGravity: { name: "Heavy gravity", blurb: "Jumps fall faster and fall short.", excludes: ["lowGravity"] },
  fog: { name: "Fog", blurb: "You can't see far." },
  shield: { name: "Shielded queen", blurb: "The queen can't be hurt until you thin out her swarm.", bossOnly: true },
  reinforcements: { name: "Reinforcements", blurb: "New flocks keep arriving to hunt you.", bossOnly: true },
  elite: { name: "Elite swarm", blurb: "Bigger boids with double health.", bossOnly: true },
};

/** What a level's modifiers add up to, for the player's physics, the view and the swarm. */
export interface LevelRules {
  gravity: number;
  /** Sideways push on anything in flight (acceleration). */
  wind: Vec;
  /** View radius in the fog; 0 = no fog. */
  fog: number;
  swarm: SwarmRules;
}

export const NO_LEVEL_RULES: LevelRules = {
  gravity: 1,
  wind: { x: 0, y: 0 },
  fog: 0,
  swarm: { shield: 0, reinforce: null, hp: 1, size: 1 },
};

export function levelRules(spec: LevelSpec, cfg: Params["world"]["modifiers"], rand: () => number): LevelRules {
  const has = (m: ModifierId) => spec.modifiers.includes(m);
  const a = rand() * Math.PI * 2;
  const wind = has("wind") ? cfg.wind : 0;
  const swarmSize = spec.flocks.reduce((n, f) => n + f.members.reduce((s, m) => s + m.count, 0), 0);
  return {
    gravity: has("lowGravity") ? cfg.lowGravity : has("heavyGravity") ? cfg.heavyGravity : 1,
    wind: { x: Math.cos(a) * wind, y: Math.sin(a) * wind },
    fog: has("fog") ? cfg.fog : 0,
    swarm: {
      shield: has("shield") ? cfg.shield : 0,
      reinforce:
        has("reinforcements") && spec.flocks.length
          ? { every: cfg.reinforceEvery, flocks: spec.flocks, cap: Math.round(swarmSize * cfg.reinforceCap) }
          : null,
      hp: has("elite") ? cfg.eliteHp : 1,
      size: has("elite") ? cfg.eliteSize : 1,
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------------------------

const firstFlight: LevelTemplate = {
  name: "First flight",
  blurb: "A small planet and a lightly guarded queen.",
  layout: "scatter",
  planet: { radius: 450, islands: 3 },
  escort: { name: "Escort", members: [{ type: "melee", count: 4 }] },
  queenHp: 0.25,
  theme: { hue: [85, 135] },
};

const crossfire: LevelTemplate = {
  name: "Crossfire",
  blurb: "Ranged boids keep their distance and shoot. Close in fast.",
  layout: "scatter",
  planet: { radius: 550, islands: 5 },
  escort: { name: "Escort", members: [{ type: "melee", count: 2 }, { type: "ranged", count: 2 }] },
  flocks: [{ flock: MELEE_PACK }, { flock: SKIRMISHERS }],
  queenHp: 0.5,
};

const bombsAway: LevelTemplate = {
  name: "Bombs away",
  blurb: "Bombers blow up on contact. Take them out from range with the spear.",
  layout: "scatter",
  planet: { radius: 650, islands: 6 },
  flocks: [{ flock: MELEE_PACK }, { flock: SKIRMISHERS }, { flock: BOMBER_RUN }],
  queenHp: 0.75,
};

const openSkies: LevelTemplate = {
  name: "Open skies",
  blurb: "Islands scattered far and wide.",
  layout: "scatter",
  planet: { radius: 850, islands: 10 },
  pool: [MIXED_FLOCK],
};

const theRing: LevelTemplate = {
  name: "The ring",
  blurb: "A ring of islands around an empty sky. The swarm gathers in the middle.",
  layout: "ring",
  planet: { radius: 950, islands: 11 },
  pool: [MIXED_FLOCK],
  placement: "middle",
};

const archipelago: LevelTemplate = {
  name: "Archipelago",
  blurb: "Island groups linked by stepping stones. Fewer, bigger flocks.",
  layout: "clusters",
  planet: { radius: 1000, islands: 15 },
  pool: [BIG_PACK, BIG_PACK, MIXED_FLOCK],
  queen: "crowded",
  theme: { hue: [150, 210] },
};

const theGauntlet: LevelTemplate = {
  name: "The gauntlet",
  blurb: "One long path to the queen, watched by ranged boids.",
  layout: "gauntlet",
  planet: { radius: 1050, islands: 10 },
  pool: [SKIRMISHERS, SKIRMISHERS, MELEE_PACK],
  placement: "ambush",
};

const pebbleField: LevelTemplate = {
  name: "Pebbles",
  blurb: "Tiny islands and lots of bombers in small flocks. Keep hopping.",
  layout: "pebbles",
  planet: { radius: 800, islands: 14 },
  pool: [BOMBER_RUN, BOMBER_RUN, MELEE_PACK, SKIRMISHERS],
};

const queensCourt: LevelTemplate = {
  name: "Queen's court",
  blurb: "The whole swarm stays close to the queen.",
  layout: "scatter",
  planet: { radius: 800, islands: 10 },
  pool: [MIXED_FLOCK],
  placement: "guardQueen",
  theme: { hue: [270, 330] },
};

const citadel: LevelTemplate = {
  name: "The citadel",
  blurb: "The queen holds the heart of a dense island cluster. Patrols circle the outskirts.",
  layout: "core",
  planet: { radius: 900, islands: 9 },
  pool: [MIXED_FLOCK],
  queen: "centre",
  placement: "edges",
};

const thicket: LevelTemplate = {
  name: "The thicket",
  blurb: "Sparse islands at first, crowding together toward the queen.",
  layout: "gradient",
  planet: { radius: 950, islands: 13 },
  pool: [MIXED_FLOCK],
  placement: "guardQueen",
};

const continentsTemplate: LevelTemplate = {
  name: "Continents",
  blurb: "A few huge islands with pebbles between them. Big melee packs, and brutes.",
  layout: "continents",
  planet: { radius: 1000, islands: 10 },
  pool: [BIG_PACK, MELEE_PACK, BRUTES],
};

const leaps: LevelTemplate = {
  name: "Long leaps",
  blurb: "Wide gaps between every island. Save your double jump.",
  layout: "longLeaps",
  planet: { radius: 950, islands: 9 },
  pool: [SKIRMISHERS, SKIRMISHERS, MIXED_FLOCK],
};

const theWilds: LevelTemplate = {
  name: "The wilds",
  blurb: "Islands bunch up and thin out at random.",
  layout: "wilds",
  planet: { radius: 1000, islands: 13 },
  pool: [MIXED_FLOCK],
  theme: { hue: [20, 70] },
};

const theHive: LevelTemplate = {
  name: "The hive",
  blurb: "Boss: a shielded queen at the heart of her hive, and her swarm keeps growing.",
  boss: true,
  layout: "core",
  planet: { radius: 900, islands: 9 },
  queen: "centre",
  queenHp: 2,
  // Reinforcements make up the difference.
  budget: 0.8,
  pool: [MIXED_FLOCK],
  placement: "guardQueen",
  modifiers: ["shield", "reinforcements"],
  theme: { hue: [25, 50], sat: [0.5, 0.65] },
};

const royalGuard: LevelTemplate = {
  name: "Royal guard",
  blurb: "Boss: an elite swarm guards a shielded queen in the fog.",
  boss: true,
  layout: "clusters",
  planet: { radius: 950, islands: 14 },
  queen: "crowded",
  queenHp: 2.5,
  // Elite boids have double health: half as many of them.
  budget: 0.5,
  pool: [MIXED_FLOCK, BRUTES],
  placement: "guardQueen",
  modifiers: ["elite", "shield", "fog"],
  theme: { hue: [200, 260] },
};

const theStorm: LevelTemplate = {
  name: "The storm",
  blurb: "Boss: a gale sweeps the ring while elite reinforcements keep coming.",
  boss: true,
  layout: "ring",
  planet: { radius: 1000, islands: 12 },
  queenHp: 3,
  // Elite boids have double health, and reinforcements top the swarm up.
  budget: 0.5,
  pool: [MIXED_FLOCK, MELEE_PACK],
  placement: "middle",
  modifiers: ["wind", "elite", "reinforcements"],
  theme: { hue: [180, 230], sat: [0.25, 0.4] },
};

/** A level's template, or a pool to pick each level's template from. */
export type Stage = LevelTemplate | LevelTemplate[];

/**
 * The level progression. Each entry is in effect from its level until the next entry: a single
 * template for every one of those levels, or a pool to pick each level's template from. Past the
 * last entry, the last one stays in effect.
 */
export const PROGRESSION: Record<number, Stage> = {
  1: firstFlight,
  2: crossfire,
  3: bombsAway,
  4: [openSkies, theRing, archipelago, pebbleField],
  8: theHive,
  9: [theGauntlet, queensCourt, citadel, leaps],
  13: royalGuard,
  14: [thicket, continentsTemplate, theWilds],
  18: theStorm,
};

/** The entry in effect on `level`: the one with the highest level at or below it. */
function stageAt(level: number): Stage {
  const keys = Object.keys(PROGRESSION)
    .map(Number)
    .sort((a, b) => a - b);
  const key = keys.filter((k) => k <= level).pop() ?? keys[0]!;
  return PROGRESSION[key]!;
}

/** Every template in the progression, in order: what the dev panel's template override picks from. */
export const ALL_TEMPLATES: LevelTemplate[] = [...new Set(Object.values(PROGRESSION).flat())];

export interface LevelPlan {
  template: LevelTemplate;
  modifiers: ModifierId[];
}

/**
 * The template and modifiers for `level`. From a pool: anything but the previous level's
 * template, with modifiers rolled on mid and late levels. `force` (from the dev panel) replaces
 * the template on any level; its modifiers are rolled as on a pool level.
 */
export function planLevel(
  level: number,
  prev: LevelTemplate | null,
  opts: { force: LevelTemplate | null; modifiersFrom: number; twoModifiersFrom: number; rand: Rng },
): LevelPlan {
  const rand = opts.rand;
  const stage = stageAt(level);
  if (!Array.isArray(stage) && !opts.force) return { template: stage, modifiers: [...(stage.modifiers ?? [])] };

  const pool = Array.isArray(stage) ? stage : [stage];
  let template: LevelTemplate;
  if (opts.force) template = opts.force;
  else {
    const fresh = pool.filter((t) => t !== prev);
    const from = fresh.length ? fresh : pool;
    template = from[Math.floor(rand() * from.length)]!;
  }

  const modifiers = [...(template.modifiers ?? [])];
  const count = level >= opts.twoModifiersFrom ? 1 + Math.floor(rand() * 2) : level >= opts.modifiersFrom ? Number(rand() < 0.6) : 0;
  for (let i = 0; i < count; i++) {
    const open = (Object.keys(MODIFIERS) as ModifierId[]).filter(
      (m) => !MODIFIERS[m].bossOnly && !modifiers.includes(m) && !modifiers.some((o) => MODIFIERS[o].excludes?.includes(m)),
    );
    if (open.length) modifiers.push(open[Math.floor(rand() * open.length)]!);
  }
  return { template, modifiers };
}

/**
 * The spec for a template on a level: the template's planet, its listed flocks, then flocks from its pool until the level's budget (less the listed
 * flocks and the escort) is spent. Sampled flocks draw from `rand`.
 */
export function resolveLevel(
  t: LevelTemplate,
  base: LevelBase,
  opts: { modifiers: ModifierId[]; weapons: WeaponId[]; rand?: Rng },
): LevelSpec {
  const rand = opts.rand ?? Math.random;
  const escort = resolveFlock(t.escort ?? ROYAL_GUARD, rand);
  const flocks: FlockSpec[] = [];
  for (const e of t.flocks ?? []) for (let i = 0; i < (e.count ?? 1); i++) flocks.push(resolveFlock(e.flock, rand));
  if (t.pool?.length) {
    let budget = base.budget * (t.budget ?? 1) - flockCost(escort) - flocks.reduce((s, f) => s + flockCost(f), 0);
    for (let guard = 0; budget > 0 && guard < 200; guard++) {
      const f = resolveFlock(t.pool[Math.floor(rand() * t.pool.length)]!, rand);
      const cost = flockCost(f);
      // Stop rather than overshoot by more than half a flock.
      if (cost - budget > cost / 2) break;
      flocks.push(f);
      budget -= cost;
    }
  }
  return {
    layout: t.layout,
    radius: t.planet.radius,
    islands: t.planet.islands,
    theme: t.theme,
    placement: t.placement ?? "anywhere",
    queenSpot: t.queen ?? "far",
    queen: t.noQueen
      ? null
      : { params: { hp: Math.max(1, Math.round(BOID_TYPES.queen.params.hp * (t.queenHp ?? 1))), ...t.queenParams }, escort },
    flocks,
    modifiers: opts.modifiers,
    weapons: opts.weapons,
  };
}

/** The level each weapon first appears on in the normal progression. */
export const WEAPON_UNLOCKS: Record<WeaponId, number> = { sword: 1, spear: 3 };
export const weaponsAt = (level: number): WeaponId[] => (["sword", "spear"] as const).filter((w) => level >= WEAPON_UNLOCKS[w]);

/** The level each weapon and enemy type first appears on in a normal run (the briefing tags them new). */
export const UNLOCKS: Record<string, number> = { ...WEAPON_UNLOCKS, melee: 1, ranged: 2, bomber: 3 };

/** The base for `level` from the tuning panel: the level 4 values plus a per-level increase. */
export function levelBase(level: number, w: Params["world"]): LevelBase {
  return { budget: w.level4.budget + w.perLevel.budget * (level - 4) };
}

/** Planet options for a spec. */
export function planetOptions(spec: LevelSpec, seed: number): PlanetOptions {
  const place: { weight?: PlanetOptions["flockWeight"]; minFromStart: number } = PLACEMENTS[spec.placement] ?? PLACEMENTS.anywhere;
  return {
    radius: spec.radius,
    layout: (LAYOUTS[spec.layout] ?? LAYOUTS.scatter).make(mulberry32(seed ^ 0x2545f491)),
    islandCount: spec.islands,
    flockWeight: place.weight,
    minFromStart: place.minFromStart,
    queenSpot: spec.queenSpot,
    theme: spec.theme,
    queen: spec.queen,
    flocks: spec.flocks,
  };
}

/** The queen's health on a spec (her override, else her type's). */
export const queenHp = (spec: LevelSpec) => (spec.queen ? resolveParams(BOID_TYPES.queen, spec.queen.params).hp : 0);
