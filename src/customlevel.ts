import { boidType, BOID_TYPES, MEMBER_TYPES, type MemberTypeId } from "./boids";
import type { ParamInput } from "./boids/types";
import {
  DEFAULT_STYLE,
  describeFlock,
  FLOCK_TEMPLATES,
  MELEE_PACK,
  resolveFlock,
  ROYAL_GUARD,
  STYLE_INPUTS,
  type FlockSpec,
  type FlockStyle,
  type MemberSpec,
} from "./flocks";
import {
  ALL_TEMPLATES,
  LAYOUTS,
  levelBase,
  MODIFIERS,
  PLACEMENTS,
  QUEEN_SPOTS,
  resolveLevel,
  weaponsAt,
  type LayoutId,
  type LevelSpec,
  type ModifierId,
  type PlacementId,
} from "./levels";
import type { QueenSpot } from "./planet";
import { params } from "./tuning";
import { button, checkbox, copyButton, el, numberInput, select, slider } from "./ui";

// The custom level editor in the dev panel's Run section. A custom level is a LevelSpec: start
// from an empty one or load a game template (as on a given level), then edit everything: the
// planet, weapons, modifiers, the queen and her escort, and the flocks with their members, the
// members' params and the flocks' style. Copy turns a flock or the whole level into source.

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
export function templateLevel(name: string, level: number): LevelSpec {
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
    Array.isArray(s.weapons)
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
    ...(s.theme ? { theme: s.theme } : {}),
  };
  return `const customLevel: LevelTemplate = ${literal(t)};\n`;
}

// ---------------------------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------------------------

export interface CustomState {
  spec: LevelSpec;
  /** What "Load" starts from: "" for empty, else a template's name; and the level it's resolved on. */
  from: string;
  fromLevel: number;
}

/**
 * The editor for `state`. `changed` saves (called on every edit); `rerender` rebuilds the editor
 * (after structural edits: adding or removing things).
 */
export function customEditor(state: CustomState, changed: () => void, rerender: () => void): Node[] {
  const s = state.spec;
  const structural = () => {
    changed();
    rerender();
  };

  // Start from
  const fromOptions: [string, string][] = [["", "Empty"], ...ALL_TEMPLATES.map((t): [string, string] => [t.name, t.boss ? `${t.name} (boss)` : t.name])];
  const load = () => {
    state.spec = state.from ? templateLevel(state.from, state.fromLevel) : emptyLevel();
    structural();
  };
  const startFrom = [
    el("h4", { textContent: "Start from" }),
    el(
      "div",
      { className: "row" },
      select(fromOptions, state.from, (v) => {
        state.from = v;
        changed();
      }),
      el("span", { className: "dim", textContent: "level" }),
      numberInput(state.fromLevel, 1, 30, 1, (v) => {
        state.fromLevel = v ?? 1;
        changed();
      }),
      button("Load", load, "", "Replace the level below (a template's sampled flocks are rolled again)"),
    ),
  ];

  // Planet
  const planet = [
    el("h4", { textContent: "Planet" }),
    field(
      "Layout",
      select(
        Object.entries(LAYOUTS).map(([id, l]): [string, string] => [id, l.name]),
        s.layout,
        (v) => {
          s.layout = v as LayoutId;
          changed();
        },
      ),
    ),
    field("Radius", numberInput(s.radius, 300, 3000, 10, (v) => ((s.radius = v ?? 900), changed()))),
    field("Islands", numberInput(s.islands, 1, 60, 1, (v) => ((s.islands = v ?? 8), changed()))),
    field(
      "Flocks spawn",
      select(
        Object.entries(PLACEMENTS).map(([id, p]): [string, string] => [id, p.name]),
        s.placement,
        (v) => ((s.placement = v as PlacementId), changed()),
      ),
    ),
    field(
      "Queen's island",
      select(Object.entries(QUEEN_SPOTS) as [string, string][], s.queenSpot, (v) => ((s.queenSpot = v as QueenSpot), changed())),
    ),
    el("h4", { textContent: "Weapons" }),
    el(
      "div",
      { className: "row wrap" },
      ...(["sword", "spear"] as const).map((w) =>
        checkbox(w === "sword" ? "Sword" : "Spear", s.weapons.includes(w), (on) => {
          s.weapons = on ? [...new Set([...s.weapons, w])] : s.weapons.filter((x) => x !== w);
          changed();
        }),
      ),
    ),
    el("h4", { textContent: "Modifiers" }),
    el(
      "div",
      { className: "row wrap" },
      ...(Object.keys(MODIFIERS) as ModifierId[]).map((m) =>
        checkbox(
          MODIFIERS[m].name,
          s.modifiers.includes(m),
          (on) => {
            s.modifiers = on ? [...s.modifiers.filter((x) => !MODIFIERS[m].excludes?.includes(x)), m] : s.modifiers.filter((x) => x !== m);
            structural();
          },
          MODIFIERS[m].blurb,
        ),
      ),
    ),
  ];

  // Queen
  const queen: Node[] = [
    el("h4", { textContent: "Queen" }),
    checkbox("Queen (kill her to win; without her, kill every boid)", !!s.queen, (on) => {
      s.queen = on ? { params: {}, escort: resolveFlock(ROYAL_GUARD) } : null;
      structural();
    }),
  ];
  if (s.queen) {
    const q = s.queen;
    queen.push(
      paramsEditor("Queen's params", BOID_TYPES.queen.inputs, BOID_TYPES.queen.params as unknown as Record<string, number>, q.params, changed),
      flockCard(q.escort, "Escort", changed, structural),
    );
  }

  // Flocks
  let addFrom = "";
  const flocks: Node[] = [
    el("h4", { textContent: "Flocks" }),
    ...s.flocks.map((f, i) =>
      flockCard(f, `Flock ${i + 1}`, changed, structural, () => {
        s.flocks.splice(i, 1);
        structural();
      }),
    ),
    el(
      "div",
      { className: "row" },
      select([["", "New flock"], ...FLOCK_TEMPLATES.map((t): [string, string] => [t.name, t.name])], addFrom, (v) => (addFrom = v)),
      button("+ Add flock", () => {
        const t = FLOCK_TEMPLATES.find((t) => t.name === addFrom);
        s.flocks.push(t ? resolveFlock(t) : { name: "New flock", members: [{ type: "melee", count: 1 }], style: { ...DEFAULT_STYLE } });
        structural();
      }),
    ),
  ];

  return [...startFrom, ...planet, ...queen, ...flocks];
}

/** Which collapsible sections are open, by the object they edit (kept across re-renders). */
const open = new WeakSet<object>();

/** A collapsible section that stays open or closed across re-renders, keyed by `key`. */
function section(key: object, cls: string, head: HTMLElement, ...body: Node[]) {
  const d = el("details", { className: cls, open: open.has(key) }, head, ...body);
  d.addEventListener("toggle", () => (d.open ? open.add(key) : open.delete(key)));
  return d;
}

/** A label and its control on one row. */
function field(label: string, control: HTMLElement) {
  return el("label", { className: "field" }, el("span", { textContent: label }), control);
}

/** A collapsible card for a flock: its members (with their params) and its style. */
function flockCard(f: FlockSpec, label: string, changed: () => void, structural: () => void, remove?: () => void) {
  const summary = el("span", { className: "summary", textContent: describeFlock(f) });
  const edited = () => {
    if (!f.name.endsWith(" (edited)") && f.name !== "New flock") f.name += " (edited)";
    title.textContent = `${label}: ${f.name}`;
    summary.textContent = describeFlock(f);
    changed();
  };
  const title = el("b", { textContent: `${label}: ${f.name}` });
  const head = el(
    "summary",
    {},
    title,
    summary,
    el("span", { className: "spacer" }),
    copyButton("Copy", () => flockSource(f), "Copy as a FlockTemplate for flocks.ts"),
    ...(remove ? [button("×", remove, "remove", "Remove this flock")] : []),
  );

  const members = f.members.map((m, i) => memberRow(m, edited, () => {
    f.members.splice(i, 1);
    edited();
    structural();
  }));
  const addMember = button("+ Member", () => {
    f.members.push({ type: "melee", count: 1 });
    edited();
    structural();
  });

  const style = section(
    f.style,
    "sub",
    el("summary", { textContent: "Style" }),
    ...(Object.keys(STYLE_INPUTS) as (keyof FlockStyle)[]).map((k) => {
      const [name, min, max, step] = STYLE_INPUTS[k];
      if (k === "hunts") return checkbox(name, f.style.hunts >= 0.5, (on) => ((f.style.hunts = on ? 1 : 0), edited()));
      return slider(name, f.style[k], min, max, step, (v) => ((f.style[k] = v), edited()));
    }),
  );

  return section(f, "flock", head, ...members, el("div", { className: "row" }, addMember), style);
}

/** A member group: type, count, and its params (blank = the type's default). */
function memberRow(m: MemberSpec, edited: () => void, remove: () => void) {
  const type = select(
    MEMBER_TYPES.map((t): [string, string] => [t, BOID_TYPES[t].name]),
    m.type,
    (v) => {
      m.type = v as MemberTypeId;
      m.params = {}; // other types have other params
      edited();
      paramsBox.replaceWith((paramsBox = paramsFor()));
    },
  );
  const count = numberInput(m.count, 0, 40, 1, (v) => ((m.count = v ?? 0), edited()));
  const paramsFor = () => {
    const t = boidType(m.type);
    m.params ??= {};
    return paramsEditor("Params", t.inputs as Record<string, ParamInput>, t.params as unknown as Record<string, number>, m.params, edited);
  };
  let paramsBox = paramsFor();
  return el("div", { className: "member" }, el("div", { className: "row" }, type, count, button("×", remove, "remove", "Remove")), paramsBox);
}

/** Number inputs for a type's params; a blank one uses the default (shown greyed). */
function paramsEditor(
  title: string,
  inputs: Record<string, ParamInput>,
  defaults: Record<string, number>,
  over: Record<string, number>,
  edited: () => void,
) {
  const n = () => Object.keys(over).length;
  const summary = el("summary", { textContent: `${title}${n() ? ` (${n()} changed)` : ""}` });
  return section(
    over,
    "sub params",
    summary,
    ...Object.entries(inputs).map(([k, [label, min, max, step]]) =>
      field(
        label,
        numberInput(over[k] ?? null, min, max, step, (v) => {
          if (v === null || v === defaults[k]) delete over[k];
          else over[k] = v;
          summary.textContent = `${title}${n() ? ` (${n()} changed)` : ""}`;
          edited();
        }, String(defaults[k])),
      ),
    ),
  );
}
