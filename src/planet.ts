import { Island, mulberry32 } from "./island";

// Procedural planet: islands inside a circular boundary, where the player starts, where the queen
// lives, where the swarm spawns, and a colour theme for the islands. Everything follows from a seed.

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
  queenHome: { x: number; y: number };
  spawns: { kind: "melee" | "ranged"; x: number; y: number }[];
  theme: Theme;
}

export interface PlanetOptions {
  radius: number;
  islandCount: number;
  meleeCount: number;
  rangedCount: number;
}

export function generatePlanet(seed: number, opt: PlanetOptions): Planet {
  const rand = mulberry32(seed);
  const R = opt.radius;
  const islands = generateIslands(rand, seed, R, opt.islandCount);

  // Start on an island near the boundary, so the rest of the world lies ahead.
  let startIsland = 0;
  islands.forEach((isl, i) => {
    if (Math.hypot(isl.cx, isl.cy) > Math.hypot(islands[startIsland]!.cx, islands[startIsland]!.cy)) startIsland = i;
  });
  const start = islands[startIsland]!;

  const queenHome = placeQueen(rand, islands, start, R);
  const clearOfIslands = (x: number, y: number) =>
    islands.every((i) => Math.hypot(i.cx - x, i.cy - y) > i.radius * 1.35 + 20);

  const spawns: Planet["spawns"] = [];
  const total = opt.meleeCount + opt.rangedCount;
  for (let n = 0, tries = 0; n < total && tries < total * 200; tries++) {
    const a = rand() * Math.PI * 2;
    const d = Math.sqrt(rand()) * R * 0.92;
    const x = Math.cos(a) * d;
    const y = Math.sin(a) * d;
    if (Math.hypot(x - start.cx, y - start.cy) < 520 || !clearOfIslands(x, y)) continue;
    spawns.push({ kind: n < opt.meleeCount ? "melee" : "ranged", x, y });
    n++;
  }

  return { seed, islands, bounds: { x: 0, y: 0, r: R }, startIsland, queenHome, spawns, theme: generateTheme(rand) };
}

/**
 * Grow islands outward from a first one. Each new island sits a jumpable gap from a random existing
 * island, keeps clear of all others, and lies fully inside the boundary.
 */
function generateIslands(rand: () => number, seed: number, R: number, count: number): Island[] {
  const a0 = rand() * Math.PI * 2;
  const r0 = 120 + rand() * 50;
  const out = [new Island(Math.cos(a0) * R * 0.35, Math.sin(a0) * R * 0.35, r0, seed)];
  const inside = (x: number, y: number, r: number) => Math.hypot(x, y) + 1.3 * r + 50 < R;
  for (let tries = 0; out.length < count && tries < 6000; tries++) {
    const from = out[Math.floor(rand() * out.length)]!;
    const r = 80 + rand() * 80;
    const a = rand() * Math.PI * 2;
    // Outlines wobble by up to ~30%, so pad nominal radii accordingly.
    const gap = 50 + rand() * 150;
    const d = 1.3 * (from.radius + r) + gap;
    const x = from.cx + Math.cos(a) * d;
    const y = from.cy + Math.sin(a) * d;
    if (!inside(x, y, r)) continue;
    if (out.every((o) => Math.hypot(o.cx - x, o.cy - y) >= 1.3 * (o.radius + r) + 50)) {
      out.push(new Island(x, y, r, seed + out.length * 7919));
    }
  }
  return out;
}

/** The queen hovers just off the island farthest from the start, on a side that's open and in bounds. */
function placeQueen(rand: () => number, islands: Island[], start: Island, R: number) {
  const home = islands.reduce((a, b) =>
    Math.hypot(a.cx - start.cx, a.cy - start.cy) > Math.hypot(b.cx - start.cx, b.cy - start.cy) ? a : b,
  );
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
function generateTheme(rand: () => number): Theme {
  const veg = rand() * 360;
  const vegSat = 0.35 + rand() * 0.3;
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
