import { PERKS } from "../../attacks";
import { boidType, BOID_TYPES, MEMBER_TYPES, type MemberTypeId } from "../../enemies";
import type { ParamInput } from "../../enemies/types";
import {
  DEFAULT_STYLE,
  describeFlock,
  FLOCK_TEMPLATES,
  resolveFlock,
  ROYAL_GUARD,
  STYLE_INPUTS,
  type FlockSpec,
  type FlockStyle,
  type MemberSpec,
} from "../../enemies/flocks";
import { emptyLevel, flockSource, templateLevel } from "../../levels/custom";
import { ALL_TEMPLATES, LAYOUTS, MODIFIERS, PLACEMENTS, QUEEN_SPOTS, type LayoutId, type LevelSpec, type ModifierId, type PlacementId } from "../../levels/levels";
import { liveParams } from "../../params/store";
import type { QueenSpot } from "../../world/planet";
import { button, checkbox, copyButton, el, numberInput, select, slider } from "../dom";

// The custom level editor in the dev panel's Run section. A custom level is a LevelSpec: start
// from an empty one or load a game template (as on a given level), then edit everything: the
// planet, weapons, perks, modifiers, the queen and her escort, and the flocks with their members,
// the members' params and the flocks' style. Copy turns a flock or the whole level into source.

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
    el("h4", { textContent: "Perks" }),
    el(
      "div",
      { className: "row wrap" },
      ...Object.values(PERKS).map((perk) =>
        checkbox(
          perk.name,
          !!s.perks?.includes(perk.id),
          (on) => {
            s.perks = on ? [...new Set([...(s.perks ?? []), perk.id])] : (s.perks ?? []).filter((x) => x !== perk.id);
            changed();
          },
          perk.blurb,
        ),
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
