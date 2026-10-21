import { mulberry32 } from "./island";
import type { LevelTemplate } from "./levels";
import { generatePlanet, type Planet, type SpawnKind } from "./planet";
import { params } from "./tuning";

// Dev levels: a small planet with just the opponents set up in the dev panel. All weapons are
// unlocked and there are no modifiers. Without a queen, the level is won when every boid is
// down; clearing it starts it again on a fresh planet.

export const KINDS: SpawnKind[] = ["melee", "ranged", "bomber"];

export type KindCounts = Record<SpawnKind, number>;

export interface DevLevel {
  flocks: KindCounts[];
  /** The queen, with `escort` as her flock. */
  queen: boolean;
  escort: KindCounts;
  /** Flocks hunt the player from the start, instead of waiting until they come close. */
  hunt: boolean;
  /** Flocks never join, split or hand over guards. */
  together: boolean;
}

export const counts = (melee = 0, ranged = 0, bomber = 0): KindCounts => ({ melee, ranged, bomber });

/** Ready-made dev levels for the panel. */
export const DEV_PRESETS: { name: string; level: () => DevLevel }[] = [
  { name: "1 melee", level: () => ({ flocks: [counts(1)], queen: false, escort: counts(), hunt: false, together: true }) },
  { name: "Melee flock", level: () => ({ flocks: [counts(4)], queen: false, escort: counts(), hunt: false, together: true }) },
  { name: "Mixed flock", level: () => ({ flocks: [counts(3, 2, 1)], queen: false, escort: counts(), hunt: false, together: true }) },
  { name: "Queen", level: () => ({ flocks: [], queen: true, escort: counts(4), hunt: false, together: false }) },
];

const kindList = (c: KindCounts) => KINDS.flatMap((k) => Array<SpawnKind>(Math.max(0, Math.round(c[k]))).fill(k));

const describeCounts = (c: KindCounts) =>
  KINDS.filter((k) => c[k] > 0)
    .map((k) => `${c[k]} ${k}`)
    .join(", ");

/** One line for the HUD and the briefing, like "queen + 4 melee · 3 melee, 2 ranged". */
export function describeDevLevel(d: DevLevel): string {
  const parts = d.flocks.map(describeCounts).filter(Boolean);
  if (d.queen) parts.unshift(["queen", describeCounts(d.escort)].filter(Boolean).join(" + "));
  return parts.join(" · ") || "no opponents";
}

export function devTemplate(d: DevLevel): LevelTemplate {
  return {
    name: describeDevLevel(d),
    blurb: "Opponents set up in the dev panel.",
    layout: () => ({
      radius: (_, r) => 80 + r() * 60,
      gap: (_, r) => 60 + r() * 100,
    }),
  };
}

/**
 * A small planet for a dev level. Each flock waits a short hop from the start island, spread
 * around the way toward the planet's middle; the queen waits at her home.
 */
export function devPlanet(seed: number, d: DevLevel, template: LevelTemplate): Planet {
  const R = 900;
  const planet = generatePlanet(seed, {
    radius: R,
    layout: template.layout(mulberry32(seed ^ 0x2545f491)),
    islandCount: 8,
    meleeCount: 0,
    rangedCount: 0,
    bomberCount: 0,
    flockSize: 1,
    escortCount: 0,
    queenHp: 0,
  });
  const start = planet.islands[planet.startIsland]!;
  const rand = mulberry32(seed ^ 0x1b873593);
  const clear = (x: number, y: number) =>
    Math.hypot(x, y) < R * 0.9 && planet.islands.every((i) => Math.hypot(i.cx - x, i.cy - y) > i.radius * 1.35 + 20);
  const toward = Math.atan2(-start.cy, -start.cx);
  const flocks = d.flocks.map(kindList).filter((k) => k.length);
  flocks.forEach((kinds, i) => {
    const a0 = toward + (i - (flocks.length - 1) / 2) * 0.7;
    let at = { x: start.cx + Math.cos(a0) * (start.radius + 300), y: start.cy + Math.sin(a0) * (start.radius + 300) };
    for (let t = 0; t < 200 && !clear(at.x, at.y); t++) {
      const ang = a0 + (rand() - 0.5) * 2;
      const dist = start.radius + 250 + rand() * 300;
      at = { x: start.cx + Math.cos(ang) * dist, y: start.cy + Math.sin(ang) * dist };
    }
    planet.flocks.push({ ...at, kinds, hunting: d.hunt });
  });
  if (d.queen) {
    planet.escort = kindList(d.escort);
    planet.queenHp = Math.max(1, params.boids.queen.hp);
  }
  return planet;
}
