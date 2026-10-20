import type { Vec } from "./island";
import type { Layout, PlanetOptions, SpawnKind, Spot, SwarmSpots } from "./planet";

// Level templates: from level 4 on, each level picks one. A template sets how the islands are laid
// out, how the swarm's budget is split between enemy kinds, and where the flocks gather. The
// level number scales the planet and the budget; the template gives the level its character.

export interface LevelTemplate {
  name: string;
  /** One line for the briefing. */
  blurb: string;
  minLevel: number;
  /** A fresh layout per planet (layouts with a direction or seeds pick them from `rand`). */
  layout: (rand: () => number) => Layout;
  /** Multipliers on the level's boundary radius and island count. */
  size?: number;
  islands?: number;
  /** Share of the enemy budget spent on each kind (normalised over the unlocked kinds). */
  mix?: Partial<Record<SpawnKind, number>>;
  /** Members per flock at the start. Default: the tuning value. */
  flockSize?: number;
  flocks?: PlanetOptions["flockWeight"];
}

/** Base values for a level from the tuning panel (level 4 + per-level increase). */
export interface LevelBase {
  radius: number;
  islands: number;
  budget: number;
  costs: Record<SpawnKind, number>;
  flockSize: number;
}

const DEFAULT_MIX: Record<SpawnKind, number> = { melee: 0.49, ranged: 0.29, bomber: 0.22 };

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const between = (rand: () => number, lo: number, hi: number) => lo + rand() * (hi - lo);

// ---------------------------------------------------------------------------------------------
// Layouts
// ---------------------------------------------------------------------------------------------

/** Islands of all sizes anywhere: the original generator. */
export const scatter = (): Layout => ({
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
    radius: (_, r) => between(r, 55, 100),
    gap: (_, r) => between(r, 60, 160),
    // Distance from the band's centre line.
    accept: (s) => Math.exp(-(((-uy * s.x + ux * s.y) / s.R / width) ** 2)),
  };
};

/** Lots of small, round islands with few trees: a hopping level. */
const pebbles = (): Layout => ({
  radius: (_, r) => between(r, 50, 85),
  gap: (_, r) => between(r, 70, 190),
  style: { wobble: 0.6, trees: 2 },
});

// ---------------------------------------------------------------------------------------------
// Flock placement maps
// ---------------------------------------------------------------------------------------------

/** Flocks crowd around the queen. */
const guardQueen = (s: Spot, w: SwarmSpots) => Math.exp(-Math.hypot(s.x - w.queen.x, s.y - w.queen.y) / (0.35 * w.R));
/** Flocks gather in the middle of the planet. */
const middle = (s: Spot) => 1 - smoothstep(0.25, 0.6, s.rho);
/** Flocks wait just beyond the start's safe zone. */
const ambush = (s: Spot, w: SwarmSpots) => Math.exp(-(((Math.hypot(s.x - w.start.x, s.y - w.start.y) - 650) / 250) ** 2));

// ---------------------------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------------------------

export const TEMPLATES: LevelTemplate[] = [
  {
    name: "Open skies",
    blurb: "Islands scattered far and wide.",
    minLevel: 4,
    layout: scatter,
  },
  {
    name: "The ring",
    blurb: "A ring of islands around an empty sky. The swarm gathers in the middle.",
    minLevel: 4,
    layout: ring,
    size: 1.25,
    flocks: middle,
  },
  {
    name: "Archipelago",
    blurb: "Island groups linked by stepping stones. Fewer, bigger flocks.",
    minLevel: 4,
    layout: clusters,
    size: 1.4,
    flockSize: 6,
  },
  {
    name: "The gauntlet",
    blurb: "One long path to the queen, watched by ranged boids.",
    minLevel: 5,
    layout: gauntlet,
    size: 1.35,
    islands: 0.8,
    mix: { melee: 0.35, ranged: 0.45, bomber: 0.2 },
    flocks: ambush,
  },
  {
    name: "Pebbles",
    blurb: "Tiny islands and lots of bombers in small flocks. Keep hopping.",
    minLevel: 5,
    layout: pebbles,
    islands: 1.6,
    mix: { melee: 0.4, ranged: 0.2, bomber: 0.4 },
    flockSize: 3,
  },
  {
    name: "Queen's court",
    blurb: "The whole swarm stays close to the queen.",
    minLevel: 6,
    layout: scatter,
    flocks: guardQueen,
  },
];

/**
 * A template for `level`: any unlocked one except the previous level's, so no two levels in a
 * row look alike. `force` (1-based, from the tuning panel) picks a template outright.
 */
export function pickTemplate(level: number, prev: LevelTemplate | null, force = 0): LevelTemplate {
  if (force >= 1) return TEMPLATES[Math.min(TEMPLATES.length, Math.round(force)) - 1]!;
  const open = TEMPLATES.filter((t) => t.minLevel <= level);
  const fresh = open.filter((t) => t !== prev);
  const from = fresh.length ? fresh : open.length ? open : TEMPLATES;
  return from[Math.floor(Math.random() * from.length)]!;
}

/** Planet options for a template: the level's base scaled by the template, the budget split by its mix. */
export function templateSpec(
  t: LevelTemplate,
  base: LevelBase,
  unlocked: (k: SpawnKind) => boolean,
): Omit<PlanetOptions, "escortCount" | "queenHp"> {
  const mix = { ...DEFAULT_MIX, ...t.mix };
  const kinds = (Object.keys(mix) as SpawnKind[]).filter(unlocked);
  const total = kinds.reduce((s, k) => s + mix[k], 0) || 1;
  const count = (k: SpawnKind) => (kinds.includes(k) ? Math.round((base.budget * mix[k]) / total / base.costs[k]) : 0);
  return {
    radius: base.radius * (t.size ?? 1),
    layout: t.layout(Math.random),
    flockWeight: t.flocks,
    islandCount: Math.max(1, Math.round(base.islands * (t.islands ?? 1))),
    meleeCount: count("melee"),
    rangedCount: count("ranged"),
    bomberCount: count("bomber"),
    flockSize: t.flockSize ?? base.flockSize,
  };
}
