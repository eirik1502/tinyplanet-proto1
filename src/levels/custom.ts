import { DEFAULT_STYLE, FLOCKS, MELEE_PACK, resolveFlock, type FlockSpec, type FlockStyle } from "../enemies/flocks";
import { MEMBER_TYPES } from "../enemies";
import type { Params } from "../params/store";
import { SKILLS, type SkillLevels } from "../attacks/skills";
import { ALL_TEMPLATES, LAYOUTS, levelBase, PLACEMENTS, QUEEN_SPOTS, resolveLevel, type LevelSpec } from "./levels";

// Level specs for custom levels: an empty one, a template's as on a level, checking one read back
// from storage, and turning one into source for levels.ts.

/** Every attack, not upgraded: what a custom level starts with. */
const ALL_ATTACKS: SkillLevels = { swipe: 1, thrust: 1, smash: 1, spear: 1 };

/** An empty level: a small planet and one melee pack waiting near the start. */
export function emptyLevel(): LevelSpec {
  return {
    layout: "scatter",
    radius: 900,
    islands: 8,
    placement: "nearStart",
    queenSpot: "far",
    queen: null,
    flocks: [resolveFlock(MELEE_PACK)],
    modifiers: [],
    skills: { ...ALL_ATTACKS },
  };
}

/** A template's level as on `level` (its pool sampled once; load again to reroll). */
export function templateLevel(name: string, level: number, params: Params): LevelSpec {
  const t = ALL_TEMPLATES.find((t) => t.name === name);
  if (!t) return emptyLevel();
  return resolveLevel(t, levelBase(level, params.world), { modifiers: [...(t.modifiers ?? [])], skills: ALL_ATTACKS });
}

/** Whether `v` looks like a LevelSpec (for one read back from storage). */
export function isLevelSpec(v: unknown): v is LevelSpec {
  const s = v as LevelSpec & { weapons?: string[] };
  // Saved before skills: its weapons as attacks.
  if (s && !s.skills && Array.isArray(s.weapons)) {
    const sword = s.weapons.includes("sword") ? 1 : 0;
    s.skills = { swipe: sword, thrust: sword, smash: sword, spear: s.weapons.includes("spear") ? 1 : 0 };
    delete s.weapons;
  }
  // Saved flocks get any style knobs added since they were saved.
  const okFlock = (f: FlockSpec) =>
    !!f &&
    Array.isArray(f.members) &&
    f.members.every((m) => MEMBER_TYPES.includes(m.type) && typeof m.count === "number") &&
    !!f.style &&
    !!(f.style = { ...DEFAULT_STYLE, ...f.style });
  return (
    !!s &&
    s.layout in LAYOUTS &&
    s.placement in PLACEMENTS &&
    s.queenSpot in QUEEN_SPOTS &&
    typeof s.radius === "number" &&
    typeof s.islands === "number" &&
    Array.isArray(s.flocks) &&
    s.flocks.every(okFlock) &&
    (s.queen === null || okFlock(s.queen?.escort)) &&
    Array.isArray(s.modifiers) &&
    !!s.skills &&
    typeof s.skills === "object" &&
    Object.entries(s.skills).every(([id, n]) => id in SKILLS && typeof n === "number")
  );
}

/** Whether a custom level has anyone to fight. */
export const hasOpponents = (s: LevelSpec) => !!s.queen || s.flocks.some((f) => f.members.some((m) => m.count > 0));

// ---------------------------------------------------------------------------------------------
// Source
// ---------------------------------------------------------------------------------------------

/** A value as a TypeScript literal (unquoted keys). */
const literal = (v: unknown, indent = 0) =>
  JSON.stringify(v, null, 2)
    .replace(/"([A-Za-z_]\w*)":/g, "$1:")
    .split("\n")
    .join("\n" + " ".repeat(indent));

/** Marks a predefined flock's name in the literal, unquoted once it's printed. */
const REF = "@flock:";

/**
 * A flock for a LevelTemplate literal: the predefined flock it is, by name, or (one saved before
 * flocks were all predefined) a FlockTemplate literal, its style only what differs from the default.
 */
function flockRef(f: FlockSpec) {
  const name = Object.keys(FLOCKS).find((k) => FLOCKS[k]!.name === f.name);
  if (name) return REF + name;
  const style: Partial<FlockStyle> = {};
  for (const k of Object.keys(DEFAULT_STYLE) as (keyof FlockStyle)[]) if (f.style[k] !== DEFAULT_STYLE[k]) style[k] = f.style[k];
  return { name: f.name, members: f.members, ...(Object.keys(style).length ? { style } : {}) };
}

/** The level as a LevelTemplate literal for levels.ts (fixed size, its flocks listed; repeats counted). */
export function levelSource(s: LevelSpec) {
  const flocks: { flock: unknown; count?: number }[] = [];
  for (const f of s.flocks) {
    const flock = flockRef(f);
    const last = flocks[flocks.length - 1];
    if (last && typeof flock === "string" && last.flock === flock) last.count = (last.count ?? 1) + 1;
    else flocks.push({ flock });
  }
  const t = {
    name: "Custom level",
    blurb: "",
    layout: s.layout,
    fixed: { radius: s.radius, islands: s.islands },
    placement: s.placement,
    queen: s.queenSpot,
    ...(s.queen ? { queenParams: s.queen.params, escort: flockRef(s.queen.escort) } : { noQueen: true }),
    flocks,
    ...(s.modifiers.length ? { modifiers: s.modifiers } : {}),
    ...(s.theme ? { theme: s.theme } : {}),
  };
  return `const customLevel: LevelTemplate = ${literal(t).replace(/"@flock:(\w+)"/g, "$1")};\n`;
}
