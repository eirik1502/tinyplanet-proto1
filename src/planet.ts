import type { FlockSpec } from "./flocks";
import { DEFAULT_STYLE, Island, mulberry32, type IslandStyle, type Vec } from "./island";

// Procedural planet: islands inside a circular boundary, where the player starts, where the queen
// lives, where the swarm's flocks spawn, and a colour theme for the islands. Everything follows
// from a seed.

export type RGB = number[];

export interface Theme {
  grass: RGB;
  grassEdge: RGB;
  grassInner: RGB;
  lip: RGB;
  earth: RGB;
  rockTop: RGB;
  rockDeep: RGB;
  trunk: RGB;
  canopyDark: RGB;
  canopyLight: RGB;
}

export interface Planet {
  seed: number;
  islands: Island[];
  /** Outer boundary: no islands beyond it, and boids can never leave it. */
  bounds: { x: number; y: number; r: number };
  startIsland: number;
  /** Where the queen lives (also on planets without her, for flock placement maps). */
  queenHome: { x: number; y: number };
  /** The queen, her param overrides and her escort flock; null for none. */
  queen: { x: number; y: number; params: Record<string, number>; escort: FlockSpec } | null;
  /** The other flocks and where each spawns. */
  flocks: { x: number; y: number; spec: FlockSpec }[];
  theme: Theme;
}

/** A spot on the planet: its position, the boundary radius, and its distance from the centre as a fraction of it. */
export interface Spot {
  x: number;
  y: number;
  R: number;
  rho: number;
}

/**
 * How islands are laid out. Islands grow outward from the seeds: each new one sits a gap from a
 * random existing island, with its radius and gap read at that island's spot, and is kept with the
 * chance `accept` gives at its own spot (a density map). Disconnected groups get stepping stones.
 */
export interface Layout {
  /** Growth starting points, in units of the boundary radius. Default: one, 0.35 out at a random angle. */
  seeds?: Vec[];
  /** Nominal island radius (the outline wobbles around it). */
  radius: (at: Spot, rand: () => number) => number;
  /** Nominal rim gap to the island it grows from; capped at LINK_GAP to stay jumpable. */
  gap: (at: Spot, rand: () => number) => number;
  /** Density map: the chance (0..1) a candidate here is kept. Default: everywhere. */
  accept?: (at: Spot) => number;
  style?: IslandStyle;
  /** The player starts on the island nearest this point (units of the boundary radius). Default: the one farthest out. */
  start?: Vec;
}

/**
 * Which island the queen hovers by: the one farthest from the start, the one nearest the planet's
 * centre, or the one with the most islands around it.
 */
export type QueenSpot = "far" | "centre" | "crowded";

/** Limits on the planet's random colours. */
export interface ThemeHint {
  /** Vegetation hue range (degrees). */
  hue?: [number, number];
  /** Vegetation saturation range (0..1). */
  sat?: [number, number];
}

/** Where the player starts and the queen lives, so flock placement can depend on them. */
export interface SwarmSpots {
  start: Vec;
  queen: Vec;
  R: number;
}

export interface PlanetOptions {
  radius: number;
  layout: Layout;
  islandCount: number;
  /** Relative chance (0..1) a flock spawns at a spot. Default: anywhere. */
  flockWeight?: (at: Spot, swarm: SwarmSpots) => number;
  /** Flocks spawn at least this far from the start island's centre. */
  minFromStart: number;
  queenSpot?: QueenSpot;
  theme?: ThemeHint;
  queen: { params: Record<string, number>; escort: FlockSpec } | null;
  flocks: FlockSpec[];
}

export function generatePlanet(seed: number, opt: PlanetOptions): Planet {
  const rand = mulberry32(seed);
  const R = opt.radius;
  const islands = generateIslands(rand, seed, R, opt.islandCount, opt.layout);

  // Start where the layout asks, or on an island near the boundary, so the rest of the world lies ahead.
  const want = opt.layout.start;
  const startScore = (isl: Island) => (want ? -Math.hypot(isl.cx - want.x * R, isl.cy - want.y * R) : Math.hypot(isl.cx, isl.cy));
  let startIsland = 0;
  islands.forEach((isl, i) => {
    if (startScore(isl) > startScore(islands[startIsland]!)) startIsland = i;
  });
  const start = islands[startIsland]!;

  const queenHome = placeQueen(rand, islands, queenIsland(islands, start, opt.queenSpot ?? "far"), start, R);
  const clearOfIslands = (x: number, y: number) =>
    islands.every((i) => Math.hypot(i.cx - x, i.cy - y) > i.radius * 1.35 + 20);

  // Spread the flocks over open sky, away from the start, following the placement map.
  const flocks: Planet["flocks"] = [];
  const swarm: SwarmSpots = { start: { x: start.cx, y: start.cy }, queen: queenHome, R };
  const tryCount = 8000;
  for (let tries = 0; flocks.length < opt.flocks.length && tries < tryCount; tries++) {
    const a = rand() * Math.PI * 2;
    const d = Math.sqrt(rand()) * R * 0.92;
    const x = Math.cos(a) * d;
    const y = Math.sin(a) * d;
    if (Math.hypot(x - start.cx, y - start.cy) < opt.minFromStart || !clearOfIslands(x, y)) continue;
    // Follow the placement map for the first half of the tries, so a narrow map can't strand flocks.
    if (opt.flockWeight && tries < tryCount / 2 && rand() > opt.flockWeight({ x, y, R, rho: d / R }, swarm)) continue;
    flocks.push({ x, y, spec: opt.flocks[flocks.length]! });
  }
  const queen = opt.queen && { ...queenHome, ...opt.queen };

  return { seed, islands, bounds: { x: 0, y: 0, r: R }, startIsland, queenHome, queen, flocks, theme: generateTheme(rand, opt.theme) };
}

/** The widest nominal rim gap that's still a comfortable jump (the gap islands are spaced by). */
export const LINK_GAP = 200;
/** Outlines wobble by up to ~30%, so spacing pads nominal radii by this. */
const PAD = 1.3;

/** Distance between two islands beyond their padded radii; within LINK_GAP they're a jump apart. */
const slack = (a: Island, b: Island) => Math.hypot(a.cx - b.cx, a.cy - b.cy) - PAD * (a.radius + b.radius);

/**
 * Grow islands outward from the layout's seeds. Each new island sits a jumpable gap from a random
 * existing island, keeps clear of all others, lies fully inside the boundary and passes the
 * layout's density map. Groups left out of reach are then joined with stepping stones.
 */
function generateIslands(rand: () => number, seed: number, R: number, count: number, layout: Layout): Island[] {
  const style = layout.style ?? DEFAULT_STYLE;
  const out: Island[] = [];
  const spot = (x: number, y: number): Spot => ({ x, y, R, rho: Math.hypot(x, y) / R });
  const inside = (x: number, y: number, r: number) => Math.hypot(x, y) + PAD * r + 50 < R;
  const clear = (x: number, y: number, r: number) =>
    out.every((o) => Math.hypot(o.cx - x, o.cy - y) >= PAD * (o.radius + r) + 50);
  const add = (x: number, y: number, r: number) => {
    out.push(new Island(x, y, r, seed + out.length * 7919, style));
  };

  const a0 = rand() * Math.PI * 2;
  for (const s of layout.seeds ?? [{ x: Math.cos(a0) * 0.35, y: Math.sin(a0) * 0.35 }]) {
    // Nudge a seed that doesn't fit, a little further each try.
    for (let t = 0; t < 40; t++) {
      const x = (s.x + (rand() - 0.5) * 0.03 * t) * R;
      const y = (s.y + (rand() - 0.5) * 0.03 * t) * R;
      const r = layout.radius(spot(x, y), rand);
      if (inside(x, y, r) && clear(x, y, r)) {
        add(x, y, r);
        break;
      }
    }
  }
  if (!out.length) add(0, 0, 120);

  for (let tries = 0; out.length < count && tries < 8000; tries++) {
    const from = out[Math.floor(rand() * out.length)]!;
    const at = spot(from.cx, from.cy);
    const r = layout.radius(at, rand);
    const a = rand() * Math.PI * 2;
    const d = PAD * (from.radius + r) + Math.min(LINK_GAP, layout.gap(at, rand));
    const x = from.cx + Math.cos(a) * d;
    const y = from.cy + Math.sin(a) * d;
    if (!inside(x, y, r) || !clear(x, y, r)) continue;
    if (layout.accept && rand() > layout.accept(spot(x, y))) continue;
    add(x, y, r);
  }

  connect(out, rand, (x, y, r) => inside(x, y, r) && clear(x, y, r), add);
  return out;
}

/** For each island, the id of its group: islands a jump apart (by nominal size) share a group. */
function jumpGroups(islands: Island[]): number[] {
  const parent = islands.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  for (let i = 0; i < islands.length; i++)
    for (let j = i + 1; j < islands.length; j++) if (slack(islands[i]!, islands[j]!) <= LINK_GAP) parent[find(i)] = find(j);
  return islands.map((_, i) => find(i));
}

/**
 * Join every group of islands to the first island's group with a line of small stepping stones
 * across the narrowest crossing, so every island can be reached.
 */
function connect(
  islands: Island[],
  rand: () => number,
  fits: (x: number, y: number, r: number) => boolean,
  add: (x: number, y: number, r: number) => void,
) {
  for (let round = 0; round < 40; round++) {
    const group = jumpGroups(islands);
    const crossings: { a: Island; b: Island; s: number }[] = [];
    for (let i = 0; i < islands.length; i++) {
      if (group[i] !== group[0]) continue;
      for (let j = 0; j < islands.length; j++)
        if (group[j] !== group[0]) crossings.push({ a: islands[i]!, b: islands[j]!, s: slack(islands[i]!, islands[j]!) });
    }
    if (!crossings.length) return;
    crossings.sort((p, q) => p.s - q.s);
    // Narrowest crossing first; if no stone fits on it, try the next. None at all: leave the planet as grown.
    if (!crossings.slice(0, 12).some(({ a, b }) => bridge(a, b, rand, fits, add))) return;
  }
}

/**
 * Walk from a toward b, dropping stones a comfortable jump apart until b is in reach. Stops early
 * when nothing fits (the next round of `connect` carries on from the stones placed so far).
 * Returns whether any stone was placed.
 */
function bridge(
  a: Island,
  b: Island,
  rand: () => number,
  fits: (x: number, y: number, r: number) => boolean,
  add: (x: number, y: number, r: number) => void,
): boolean {
  let prev = { x: a.cx, y: a.cy, r: a.radius };
  let placed = 0;
  while (placed < 20 && Math.hypot(b.cx - prev.x, b.cy - prev.y) - PAD * (prev.r + b.radius) > LINK_GAP) {
    const len = Math.hypot(b.cx - prev.x, b.cy - prev.y);
    const ux = (b.cx - prev.x) / len;
    const uy = (b.cy - prev.y) / len;
    let stone: { x: number; y: number; r: number } | null = null;
    // Straight ahead first, then swerving further to either side around whatever is in the way.
    for (let t = 0; t < 12 && !stone; t++) {
      const r = 55 + rand() * 25;
      const swerve = (t === 0 ? 0 : (t % 2 ? 1 : -1) * Math.ceil(t / 2) * 0.22) + (rand() - 0.5) * 0.15;
      const dx = Math.cos(swerve) * ux - Math.sin(swerve) * uy;
      const dy = Math.sin(swerve) * ux + Math.cos(swerve) * uy;
      const step = PAD * (prev.r + r) + 100 + rand() * 60;
      const x = prev.x + dx * step;
      const y = prev.y + dy * step;
      if (fits(x, y, r)) stone = { x, y, r };
    }
    if (!stone) break;
    add(stone.x, stone.y, stone.r);
    prev = stone;
    placed++;
  }
  return placed > 0;
}

/** The island the queen hovers by (never the start, unless it's the only one). */
function queenIsland(islands: Island[], start: Island, spot: QueenSpot): Island {
  const fromStart = (i: Island) => Math.hypot(i.cx - start.cx, i.cy - start.cy);
  const score: Record<QueenSpot, (i: Island) => number> = {
    far: fromStart,
    centre: (i) => -Math.hypot(i.cx, i.cy),
    // Islands within reach of a couple of jumps; ties go to the one farther from the start.
    crowded: (i) => islands.filter((o) => o !== i && Math.hypot(o.cx - i.cx, o.cy - i.cy) < 550).length + fromStart(i) * 1e-4,
  };
  const others = islands.filter((i) => i !== start);
  if (!others.length) return start;
  return others.reduce((a, b) => (score[spot](b) > score[spot](a) ? b : a));
}

/** The queen hovers just off her island, on a side that's open, in bounds and away from the start. */
function placeQueen(rand: () => number, islands: Island[], home: Island, start: Island, R: number) {
  let best = { x: home.cx, y: home.cy, score: -Infinity };
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2 + rand() * 0.2;
    const d = home.radius * 1.3 + 90;
    const x = home.cx + Math.cos(a) * d;
    const y = home.cy + Math.sin(a) * d;
    if (Math.hypot(x, y) > R - 90) continue;
    const clearance = Math.min(...islands.map((o) => Math.hypot(o.cx - x, o.cy - y) - o.radius * 1.3));
    if (clearance < 40) continue;
    const score = Math.hypot(x - start.cx, y - start.cy) + clearance * 0.5;
    if (score > best.score) best = { x, y, score };
  }
  return { x: best.x, y: best.y };
}

/** HSL (h in degrees, s/l in 0..1) → [r, g, b] 0..255. */
function hsl(h: number, s: number, l: number): RGB {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

/**
 * A palette for one planet: a vegetation hue for grass and canopies, and an earth hue (offset
 * from it) for the cliffs, fading into cool rock below.
 */
function generateTheme(rand: () => number, hint: ThemeHint = {}): Theme {
  const [h0, h1] = hint.hue ?? [0, 360];
  const [s0, s1] = hint.sat ?? [0.35, 0.65];
  const veg = h0 + rand() * (h1 - h0);
  const vegSat = s0 + rand() * (s1 - s0);
  const canopy = veg + (rand() - 0.5) * 70;
  const earth = veg + 140 + rand() * 80;
  const earthSat = 0.2 + rand() * 0.25;
  const rock = earth + (rand() - 0.5) * 60;
  return {
    grass: hsl(veg, vegSat, 0.45),
    grassEdge: hsl(veg, vegSat, 0.32),
    grassInner: hsl(veg + 8, vegSat, 0.55),
    lip: hsl(earth, earthSat + 0.1, 0.33),
    earth: hsl(earth, earthSat + 0.1, 0.36),
    rockTop: hsl(rock, earthSat, 0.42),
    rockDeep: hsl(rock + 30, earthSat * 0.8, 0.26),
    trunk: hsl(earth, earthSat + 0.15, 0.28),
    canopyDark: hsl(canopy, vegSat + 0.05, 0.27),
    canopyLight: hsl(canopy + 10, vegSat, 0.62),
  };
}
