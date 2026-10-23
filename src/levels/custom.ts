import { DEFAULT_STYLE, MELEE_PACK, resolveFlock, type FlockSpec, type FlockStyle } from "../enemies/flocks";
import { MEMBER_TYPES } from "../enemies";
import type { Params } from "../params/store";
import { ALL_TEMPLATES, LAYOUTS, levelBase, PLACEMENTS, QUEEN_SPOTS, resolveLevel, weaponsAt, type LevelSpec } from "./levels";

// Level specs for custom levels: an empty one, a template's as on a level, checking one read back
// from storage, and turning one (or a flock) into source for levels.ts / flocks.ts.

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
    weapons: ["sword", "spear"],
  };
}

/** A template's level as on `level` (its pool sampled once; load again to reroll). */
export function templateLevel(name: string, level: number, params: Params): LevelSpec {
  const t = ALL_TEMPLATES.find((t) => t.name === name);
  if (!t) return emptyLevel();
  return resolveLevel(t, levelBase(level, params.world), { modifiers: [...(t.modifiers ?? [])], weapons: weaponsAt(level) });
}

/** Whether `v` looks like a LevelSpec (for one read back from storage). */
export function isLevelSpec(v: unknown): v is LevelSpec {
  const s = v as LevelSpec;
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
    Array.isArray(s.weapons) &&
    (s.perks === undefined || Array.isArray(s.perks))
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

/** A flock as a FlockTemplate literal (style: only what differs from the default). */
function flockTemplate(f: FlockSpec) {
  const style: Partial<FlockStyle> = {};
  for (const k of Object.keys(DEFAULT_STYLE) as (keyof FlockStyle)[]) if (f.style[k] !== DEFAULT_STYLE[k]) style[k] = f.style[k];
  const members = f.members.map((m) => (m.params && Object.keys(m.params).length ? m : { type: m.type, count: m.count }));
  return { name: f.name, members, ...(Object.keys(style).length ? { style } : {}) };
}

export const flockSource = (f: FlockSpec) => `const flock: FlockTemplate = ${literal(flockTemplate(f))};\n`;

/** The level as a LevelTemplate literal for levels.ts (fixed size, its flocks listed). */
export function levelSource(s: LevelSpec) {
  const t = {
    name: "Custom level",
    blurb: "",
    layout: s.layout,
    fixed: { radius: s.radius, islands: s.islands },
    placement: s.placement,
    queen: s.queenSpot,
    ...(s.queen ? { queenParams: s.queen.params, escort: flockTemplate(s.queen.escort) } : { noQueen: true }),
    flocks: s.flocks.map((f) => ({ flock: flockTemplate(f) })),
    ...(s.modifiers.length ? { modifiers: s.modifiers } : {}),
    ...(s.perks?.length ? { perks: s.perks } : {}),
    ...(s.theme ? { theme: s.theme } : {}),
  };
  return `const customLevel: LevelTemplate = ${literal(t)};\n`;
}
