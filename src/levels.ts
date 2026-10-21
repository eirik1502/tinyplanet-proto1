import type { SwarmRules } from "./combat";
import { mulberry32, type Vec } from "./island";
import type { Layout, PlanetOptions, QueenSpot, SpawnKind, Spot, SwarmSpots, ThemeHint } from "./planet";
import type { Params } from "./tuning";

// Levels: PROGRESSION says which template each level uses. A template sets how the islands are
// laid out, how the swarm's budget is split between enemy kinds, where the flocks gather and where
// the queen lives, plus any modifiers (wind, fog, a shielded queen…). The level number scales the
// planet and the budget; the template gives the level its character.

export interface LevelTemplate {
  name: string;
  /** One line for the briefing. */
  blurb: string;
  boss?: boolean;
  /** A fresh layout per planet (layouts with a direction or seeds pick them from `rand`). */
  layout: (rand: () => number) => Layout;
  /** Multipliers on the level's boundary radius and island count. */
  size?: number;
  islands?: number;
  /** Multiplier on the level's swarm budget (fewer boids when they're tougher). */
  budget?: number;
  /** Share of the enemy budget spent on each kind (normalised over the unlocked kinds). */
  mix?: Partial<Record<SpawnKind, number>>;
  /** Members per flock at the start. Default: the tuning value. */
  flockSize?: number;
  flocks?: PlanetOptions["flockWeight"];
  queen?: QueenSpot;
  /** Multiplier on the queen's health. */
  queenHp?: number;
  theme?: ThemeHint;
  /** Modifiers this template always has (bosses); others may be rolled on top. */
  modifiers?: ModifierId[];
  /** Hand-tuned values instead of the scaled base (the intro levels). */
  fixed?: (world: Params["world"]) => FixedLevel;
}

export interface FixedLevel {
  radius: number;
  islands: number;
  melee: number;
  ranged: number;
  bombers: number;
  escort: number;
  queenHp: number;
}

/** Base values for a level from the tuning panel (level 4 + per-level increase). */
export interface LevelBase {
  radius: number;
  islands: number;
  budget: number;
  costs: Record<SpawnKind, number>;
  flockSize: number;
  escort: number;
  queenHp: number;
}

const DEFAULT_MIX: Record<SpawnKind, number> = { melee: 0.49, ranged: 0.29, bomber: 0.22 };

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
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
  swarm: { shield: 0, reinforce: null, hp: 1, size: 1, together: false },
};

export function levelRules(
  mods: ModifierId[],
  cfg: Params["world"]["modifiers"],
  kinds: SpawnKind[],
  swarmSize: number,
  rand: () => number,
): LevelRules {
  const has = (m: ModifierId) => mods.includes(m);
  const a = rand() * Math.PI * 2;
  const wind = has("wind") ? cfg.wind : 0;
  return {
    gravity: has("lowGravity") ? cfg.lowGravity : has("heavyGravity") ? cfg.heavyGravity : 1,
    wind: { x: Math.cos(a) * wind, y: Math.sin(a) * wind },
    fog: has("fog") ? cfg.fog : 0,
    swarm: {
      shield: has("shield") ? cfg.shield : 0,
      reinforce: has("reinforcements")
        ? {
            every: cfg.reinforceEvery,
            size: Math.max(1, Math.round(cfg.reinforceSize)),
            kinds,
            cap: Math.round(swarmSize * cfg.reinforceCap),
          }
        : null,
      hp: has("elite") ? cfg.eliteHp : 1,
      size: has("elite") ? cfg.eliteSize : 1,
      together: false,
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------------------------

const firstFlight: LevelTemplate = {
  name: "First flight",
  blurb: "A small planet and a lightly guarded queen.",
  layout: scatter,
  theme: { hue: [85, 135] },
  fixed: (w) => w.intro1,
};

const crossfire: LevelTemplate = {
  name: "Crossfire",
  blurb: "Ranged boids keep their distance and shoot. Close in fast.",
  layout: scatter,
  fixed: (w) => w.intro2,
};

const bombsAway: LevelTemplate = {
  name: "Bombs away",
  blurb: "Bombers blow up on contact. Take them out from range with the spear.",
  layout: scatter,
  fixed: (w) => w.intro3,
};

const openSkies: LevelTemplate = {
  name: "Open skies",
  blurb: "Islands scattered far and wide.",
  layout: scatter,
};

const theRing: LevelTemplate = {
  name: "The ring",
  blurb: "A ring of islands around an empty sky. The swarm gathers in the middle.",
  layout: ring,
  size: 1.25,
  flocks: middle,
};

const archipelago: LevelTemplate = {
  name: "Archipelago",
  blurb: "Island groups linked by stepping stones. Fewer, bigger flocks.",
  layout: clusters,
  size: 1.4,
  flockSize: 6,
  queen: "crowded",
  theme: { hue: [150, 210] },
};

const theGauntlet: LevelTemplate = {
  name: "The gauntlet",
  blurb: "One long path to the queen, watched by ranged boids.",
  layout: gauntlet,
  size: 1.35,
  islands: 0.8,
  mix: { melee: 0.35, ranged: 0.45, bomber: 0.2 },
  flocks: ambush,
};

const pebbleField: LevelTemplate = {
  name: "Pebbles",
  blurb: "Tiny islands and lots of bombers in small flocks. Keep hopping.",
  layout: pebbles,
  islands: 1.6,
  mix: { melee: 0.4, ranged: 0.2, bomber: 0.4 },
  flockSize: 3,
};

const queensCourt: LevelTemplate = {
  name: "Queen's court",
  blurb: "The whole swarm stays close to the queen.",
  layout: scatter,
  flocks: guardQueen,
  theme: { hue: [270, 330] },
};

const citadel: LevelTemplate = {
  name: "The citadel",
  blurb: "The queen holds the heart of a dense island cluster. Patrols circle the outskirts.",
  layout: core,
  size: 1.2,
  queen: "centre",
  flocks: edges,
};

const thicket: LevelTemplate = {
  name: "The thicket",
  blurb: "Sparse islands at first, crowding together toward the queen.",
  layout: gradient,
  size: 1.2,
  flocks: guardQueen,
};

const continentsTemplate: LevelTemplate = {
  name: "Continents",
  blurb: "A few huge islands with pebbles between them. Big melee flocks.",
  layout: continents,
  size: 1.3,
  islands: 0.9,
  mix: { melee: 0.65, ranged: 0.2, bomber: 0.15 },
  flockSize: 6,
};

const leaps: LevelTemplate = {
  name: "Long leaps",
  blurb: "Wide gaps between every island. Save your double jump.",
  layout: longLeaps,
  size: 1.2,
  islands: 0.9,
  mix: { melee: 0.35, ranged: 0.45, bomber: 0.2 },
};

const theWilds: LevelTemplate = {
  name: "The wilds",
  blurb: "Islands bunch up and thin out at random.",
  layout: wilds,
  size: 1.2,
  theme: { hue: [20, 70] },
};

const theHive: LevelTemplate = {
  name: "The hive",
  blurb: "Boss: a shielded queen at the heart of her hive, and her swarm keeps growing.",
  boss: true,
  layout: core,
  size: 1.15,
  queen: "centre",
  queenHp: 2,
  // Reinforcements make up the difference.
  budget: 0.8,
  flocks: guardQueen,
  modifiers: ["shield", "reinforcements"],
  theme: { hue: [25, 50], sat: [0.5, 0.65] },
};

const royalGuard: LevelTemplate = {
  name: "Royal guard",
  blurb: "Boss: an elite swarm guards a shielded queen in the fog.",
  boss: true,
  layout: clusters,
  size: 1.4,
  queen: "crowded",
  queenHp: 2.5,
  // Elite boids have double health: half as many of them.
  budget: 0.5,
  flocks: guardQueen,
  flockSize: 5,
  modifiers: ["elite", "shield", "fog"],
  theme: { hue: [200, 260] },
};

const theStorm: LevelTemplate = {
  name: "The storm",
  blurb: "Boss: a gale sweeps the ring while elite reinforcements keep coming.",
  boss: true,
  layout: ring,
  size: 1.25,
  queenHp: 3,
  // Elite boids have double health, and reinforcements top the swarm up.
  budget: 0.5,
  flocks: middle,
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
  opts: { force: LevelTemplate | null; modifiersFrom: number; twoModifiersFrom: number },
): LevelPlan {
  const stage = stageAt(level);
  if (!Array.isArray(stage) && !opts.force) return { template: stage, modifiers: [...(stage.modifiers ?? [])] };

  const pool = Array.isArray(stage) ? stage : [stage];
  let template: LevelTemplate;
  if (opts.force) template = opts.force;
  else {
    const fresh = pool.filter((t) => t !== prev);
    const from = fresh.length ? fresh : pool;
    template = from[Math.floor(Math.random() * from.length)]!;
  }

  const modifiers = [...(template.modifiers ?? [])];
  const count = level >= opts.twoModifiersFrom ? 1 + Math.floor(Math.random() * 2) : level >= opts.modifiersFrom ? Number(Math.random() < 0.6) : 0;
  for (let i = 0; i < count; i++) {
    const open = (Object.keys(MODIFIERS) as ModifierId[]).filter(
      (m) => !MODIFIERS[m].bossOnly && !modifiers.includes(m) && !modifiers.some((o) => MODIFIERS[o].excludes?.includes(m)),
    );
    if (open.length) modifiers.push(open[Math.floor(Math.random() * open.length)]!);
  }
  return { template, modifiers };
}

/** Planet options for a template: the level's base scaled by the template, the budget split by its mix. */
export function templateSpec(
  t: LevelTemplate,
  base: LevelBase,
  world: Params["world"],
  unlocked: (k: SpawnKind) => boolean,
  seed: number,
): PlanetOptions {
  const shared = {
    layout: t.layout(mulberry32(seed ^ 0x2545f491)),
    flockWeight: t.flocks,
    queenSpot: t.queen,
    theme: t.theme,
    flockSize: t.flockSize ?? base.flockSize,
  };
  const fixed = t.fixed?.(world);
  if (fixed) {
    return {
      ...shared,
      radius: fixed.radius,
      islandCount: Math.max(1, Math.round(fixed.islands)),
      meleeCount: unlocked("melee") ? Math.round(fixed.melee) : 0,
      rangedCount: unlocked("ranged") ? Math.round(fixed.ranged) : 0,
      bomberCount: unlocked("bomber") ? Math.round(fixed.bombers) : 0,
      escortCount: Math.round(fixed.escort),
      queenHp: Math.max(1, fixed.queenHp * (t.queenHp ?? 1)),
    };
  }
  const mix = { ...DEFAULT_MIX, ...t.mix };
  const kinds = (Object.keys(mix) as SpawnKind[]).filter(unlocked);
  const total = kinds.reduce((s, k) => s + mix[k], 0) || 1;
  const budget = base.budget * (t.budget ?? 1);
  const count = (k: SpawnKind) => (kinds.includes(k) ? Math.round((budget * mix[k]) / total / base.costs[k]) : 0);
  return {
    ...shared,
    radius: base.radius * (t.size ?? 1),
    islandCount: Math.max(1, Math.round(base.islands * (t.islands ?? 1))),
    meleeCount: count("melee"),
    rangedCount: count("ranged"),
    bomberCount: count("bomber"),
    escortCount: Math.round(base.escort),
    queenHp: Math.max(1, base.queenHp * (t.queenHp ?? 1)),
  };
}
