import { SKILLS, SKILL_IDS, type SkillLevels } from "../../attacks/skills";
import { BOID_TYPES } from "../../enemies";
import type { ParamInput } from "../../enemies/types";
import { describeFlock, FLOCK_TEMPLATES, resolveFlock, ROYAL_GUARD, type FlockSpec } from "../../enemies/flocks";
import { emptyLevel, templateLevel } from "../../levels/custom";
import { ALL_TEMPLATES, LAYOUTS, MODIFIERS, PLACEMENTS, QUEEN_SPOTS, type LayoutId, type LevelSpec, type ModifierId, type PlacementId } from "../../levels/levels";
import { liveParams } from "../../params/store";
import type { QueenSpot } from "../../world/planet";
import { button, checkbox, el, numberInput, select } from "../dom";

// The custom level editor in the dev panel's Run section. A custom level is a LevelSpec: start
// from an empty one or load a game template (as on a given level), then edit it: the planet, the
// player's skills, modifiers, the queen (her params and escort), and the flocks, picked from the
// predefined ones (flocks.ts). Copy turns the whole level into source.

// ---------------------------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------------------------

/** A step picker per skill (off, 1…its last step), editing `skills` in place. */
export function skillInputs(skills: SkillLevels, changed: () => void) {
  return el(
    "div",
    { className: "row wrap" },
    ...SKILL_IDS.map((id) => {
      const sk = SKILLS[id];
      const steps: [string, string][] = [["0", "off"], ...sk.steps.map((_, i): [string, string] => [String(i + 1), String(i + 1)])];
      const pick = select(steps, String(skills[id] ?? 0), (v) => {
        skills[id] = Number(v);
        changed();
      });
      return el("label", { className: "check", title: sk.steps.map((t, i) => `${i + 1}: ${t}`).join("\n") }, el("span", { textContent: sk.name }), pick);
    }),
  );
}

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
    state.spec = state.from ? templateLevel(state.from, state.fromLevel, liveParams) : emptyLevel();
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
      button("Load", load, "", "Replace the level below (a template's pool is rolled again)"),
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
    el("h4", { textContent: "Skills" }),
    skillInputs(s.skills, changed),
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
      field("Escort", flockPicker(q.escort.name, (t) => ((q.escort = resolveFlock(t)), structural()))),
      el("div", { className: "dim", textContent: describeFlock(q.escort) }),
    );
  }

  // Flocks
  let addFrom = FLOCK_TEMPLATES[0]!.name;
  let addCount = 1;
  const flocks: Node[] = [
    el("h4", { textContent: "Flocks" }),
    ...s.flocks.map((f, i) =>
      flockRow(f, () => {
        s.flocks.splice(i, 1);
        structural();
      }),
    ),
    el(
      "div",
      { className: "row" },
      flockPicker(addFrom, (t) => (addFrom = t.name)),
      el("span", { className: "dim", textContent: "×" }),
      numberInput(addCount, 1, 20, 1, (v) => (addCount = v ?? 1)),
      button("+ Add", () => {
        const t = FLOCK_TEMPLATES.find((t) => t.name === addFrom)!;
        for (let i = 0; i < addCount; i++) s.flocks.push(resolveFlock(t));
        structural();
      }),
    ),
  ];

  return [...startFrom, ...planet, ...queen, ...flocks];
}

/** A dropdown of the predefined flocks, on `current` (one that isn't predefined shows as such). */
function flockPicker(current: string, pick: (t: (typeof FLOCK_TEMPLATES)[number]) => void) {
  const known = FLOCK_TEMPLATES.some((t) => t.name === current);
  return select(
    [...(known ? [] : [[current, `${current} (not predefined)`] as [string, string]]), ...FLOCK_TEMPLATES.map((t): [string, string] => [t.name, t.name])],
    current,
    (v) => {
      const t = FLOCK_TEMPLATES.find((t) => t.name === v);
      if (t) pick(t);
    },
  );
}

/** A flock in the list: its name, who's in it, and a remove button. */
function flockRow(f: FlockSpec, remove: () => void) {
  return el(
    "div",
    { className: "row" },
    el("b", { textContent: f.name }),
    el("span", { className: "dim", textContent: describeFlock(f) }),
    el("span", { className: "spacer" }),
    button("×", remove, "remove", "Remove this flock"),
  );
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
