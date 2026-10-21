import { customEditor, emptyLevel, hasOpponents, isLevelSpec, levelSource, type CustomState } from "./customlevel";
import { ALL_TEMPLATES, type LevelSpec, type LevelTemplate } from "./levels";
import { getPref, setPref } from "./prefs";
import { button, copyButton, el, numberInput, select } from "./ui";

// Runtime settings: what to play right now, set from the dev panel's Run section. Unlike the
// tuned params these aren't game design, so they're never copied into params.ts; they're kept per
// browser so a reload picks up where you left off.

/** What a round plays: the normal progression from a level, or a custom level. */
export type Run = { kind: "normal"; level: number; template: LevelTemplate | null } | { kind: "custom"; spec: LevelSpec };

interface RuntimeState {
  mode: Run["kind"];
  /** The level the normal run starts from. */
  level: number;
  /** Template override for every level of a normal run, by name; "" = the progression's own. */
  template: string;
  custom: CustomState;
}

const STORAGE_KEY = "planetproto.runtime";
const MAX_LEVEL = 30;

const save = () => setPref(STORAGE_KEY, JSON.stringify(state));
const clampLevel = (n: number) => (Number.isFinite(n) ? Math.min(MAX_LEVEL, Math.max(1, Math.round(n))) : 1);

function load(): RuntimeState {
  const fallback: RuntimeState = { mode: "normal", level: 1, template: "", custom: { spec: emptyLevel(), from: "", fromLevel: 4 } };
  try {
    const s = { ...fallback, ...(JSON.parse(getPref(STORAGE_KEY) ?? "{}") as Partial<RuntimeState>) };
    if (s.mode !== "normal" && s.mode !== "custom") s.mode = "normal";
    s.level = clampLevel(Number(s.level));
    if (!ALL_TEMPLATES.some((t) => t.name === s.template)) s.template = "";
    if (!s.custom || !isLevelSpec(s.custom.spec)) s.custom = fallback.custom;
    s.custom.fromLevel = clampLevel(Number(s.custom.fromLevel));
    return s;
  } catch {
    return fallback;
  }
}

const state: RuntimeState = load();

/** The run the dev panel is set to (what a reload starts with). */
export function currentRun(): Run {
  if (state.mode === "custom" && hasOpponents(state.custom.spec)) return { kind: "custom", spec: structuredClone(state.custom.spec) };
  return { kind: "normal", level: state.level, template: ALL_TEMPLATES.find((t) => t.name === state.template) ?? null };
}

let statusEl: HTMLElement | null = null;

/** Show what is being played right now, at the top of the Run section. */
export function setRunStatus(text: string) {
  if (statusEl) statusEl.textContent = text;
}

/**
 * The Run section of the dev panel: a normal run (from a level, optionally with one template on
 * every level) or a custom level, and a button to start it. `onMode` tells the panel which is
 * showing (the custom editor wants more room).
 */
export function runSection(onStart: (run: Run) => void, onMode: (mode: Run["kind"]) => void): HTMLElement {
  const section = el("div", { className: "section run" });
  statusEl = el("div", { className: "status" });
  const modeBar = el("div", { className: "tabs" });
  const body = el("div", { className: "body" });
  const footer = el("div", { className: "footer" });
  section.append(modeBar, body, footer);

  const modes: [Run["kind"], string][] = [
    ["normal", "Normal run"],
    ["custom", "Custom level"],
  ];
  const modeButtons = modes.map(([m, label]) => {
    const b = button(label, () => {
      state.mode = m;
      save();
      render();
    });
    modeBar.append(b);
    return b;
  });

  const render = () => {
    const scroll = body.scrollTop;
    modeButtons.forEach((b, i) => b.classList.toggle("active", modes[i]![0] === state.mode));
    body.replaceChildren(statusEl!);
    footer.replaceChildren();
    if (state.mode === "normal") renderNormal();
    else renderCustom();
    body.scrollTop = scroll;
    onMode(state.mode);
  };

  const renderNormal = () => {
    const go = button(`Start level ${state.level}`, () => {
      save();
      onStart(currentRun());
    }, "primary");
    const level = numberInput(state.level, 1, MAX_LEVEL, 1, (v) => {
      state.level = clampLevel(v ?? 1);
      go.textContent = `Start level ${state.level}`;
      save();
    });
    const step = (d: number) => {
      state.level = clampLevel(state.level + d);
      save();
      render();
    };
    const template = select(
      [["", "From the progression"], ...ALL_TEMPLATES.map((t): [string, string] => [t.name, t.boss ? `${t.name} (boss)` : t.name])],
      state.template,
      (v) => {
        state.template = v;
        save();
      },
    );
    body.append(
      el("h4", { textContent: "Level" }),
      el("div", { className: "row" }, button("−", () => step(-1)), level, button("+", () => step(1))),
      el("h4", { textContent: "Template" }),
      template,
      el("div", { className: "note", textContent: "Used on every level of the run; modifiers roll as usual." }),
    );
    footer.append(go);
  };

  const renderCustom = () => {
    const c = state.custom;
    body.append(...customEditor(c, save, render));
    const start = button("Start custom level", () => {
      save();
      if (hasOpponents(c.spec)) onStart(currentRun());
      else setRunStatus("Add a queen or a flock first.");
    }, "primary");
    footer.append(copyButton("Copy level", () => levelSource(c.spec), "Copy as a LevelTemplate for levels.ts"), start);
  };

  render();
  return section;
}
