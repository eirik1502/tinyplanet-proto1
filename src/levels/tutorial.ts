import { START_SKILLS } from "../attacks/skills";
import type { Vec } from "../core/math";
import { resolveFlock } from "../enemies/flocks";
import type { Layout } from "../world/planet";
import type { LevelSpec } from "./levels";

// The tutorial: a hand-made planet that teaches moving before any fighting. Islands follow an arc,
// each gap a little wider than the last, sized from the jump physics (measured from the rim): a
// tap carries ~180, a full jump ~300, the safety net stretches a full jump to ~580, and a double
// jump reaches ~670 and more. Then a pair of training dummies that never fight back, and the
// portal out, which opens once they're beaten. The lessons (game/lessons.ts) do the talking.

/** Island radius, and the rim gap from the island before it. */
const PATH: { r: number; gap: number }[] = [
  { r: 100, gap: 0 },
  // A tap is enough.
  { r: 90, gap: 130 },
  // Hold the jump for full height.
  { r: 100, gap: 250 },
  // A full jump falls short: the safety net (or a double jump) carries it.
  { r: 110, gap: 420 },
  // Only a double jump makes it.
  { r: 125, gap: 650 },
  // The portal's island.
  { r: 90, gap: 200 },
];

/** The arc the islands sit on, around the planet's centre. */
const ARC = 600;
const RADIUS = 900;

function placeIslands(): (Vec & { r: number })[] {
  const out: (Vec & { r: number })[] = [];
  let a = -2.6;
  for (let i = 0; i < PATH.length; i++) {
    const { r, gap } = PATH[i]!;
    if (i > 0) {
      const d = PATH[i - 1]!.r + gap + r;
      a += 2 * Math.asin(d / (2 * ARC));
    }
    out.push({ x: Math.cos(a) * ARC, y: Math.sin(a) * ARC, r });
  }
  return out;
}

const ISLANDS = placeIslands();
const last = ISLANDS[ISLANDS.length - 1]!;
const dojo = ISLANDS[ISLANDS.length - 2]!;
/** Out from `i`'s centre by `d`, toward the planet's centre (in < 0) or away from it. */
const off = (i: Vec & { r: number }, d: number): Vec => {
  const l = Math.hypot(i.x, i.y);
  return { x: i.x + (i.x / l) * d, y: i.y + (i.y / l) * d };
};

export const TUTORIAL_LAYOUT: Layout = {
  islands: ISLANDS,
  start: { x: ISLANDS[0]!.x / RADIUS, y: ISLANDS[0]!.y / RADIUS },
  // The dummies wait over open sky just inside the arc by their island.
  flockSpots: [off(dojo, -(dojo.r + 90))],
  // The portal hovers off the last island's far side.
  portal: off(last, last.r + 80),
  style: { wobble: 0.35, trees: 4 },
  radius: () => 100,
  gap: () => 0,
};

const DUMMIES = resolveFlock({
  name: "Training dummies",
  members: [{ type: "melee", count: 2 }],
  style: { aggroRange: 0, giveUpRange: 0, grudge: 0, attackers: 0, pace: 20, spread: 40, restlessness: 0.1 },
});

export const TUTORIAL_NAME = "Learning to fly";
export const TUTORIAL_BLURB = "Climb, jump and fly from island to island, beat the training dummies and take the portal.";
/** The tutorial planet is always the same. */
export const TUTORIAL_SEED = 2024;

export const TUTORIAL: LevelSpec = {
  layout: "tutorial",
  radius: RADIUS,
  islands: ISLANDS.length,
  theme: { hue: [150, 200] },
  placement: "anywhere",
  queenSpot: "far",
  queen: null,
  flocks: [DUMMIES],
  modifiers: [],
  skills: { ...START_SKILLS },
  goal: "portal",
  lessons: "all",
  noFallDamage: true,
};
