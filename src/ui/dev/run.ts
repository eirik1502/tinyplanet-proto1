import { getPref, setPref } from "../../core/prefs";
import type { Run } from "../../game/session";
import { emptyLevel, hasOpponents, isLevelSpec, levelSource } from "../../levels/custom";
import { ALL_TEMPLATES } from "../../levels/levels";
import { scenario, SCENARIOS } from "../../scenarios";
import { button, copyButton, el, numberInput, select } from "../dom";
import { customEditor, type CustomState } from "./customlevel";
import type { DevSection } from "./panel";

// The dev panel's Run section: what to play right now. A normal run (from a level, optionally with
// one template on every level), a custom level, or a scenario. Unlike the tuned params these
// aren't game design, so they're never copied into source; they're kept per browser so a reload
// picks up where you left off. `?scenario=<id>` in the URL plays a scenario regardless.

interface RunState {
  mode: Run["kind"];
  /** The level the normal run starts from. */
  level: number;
  /** Template override for every level of a normal run, by name; "" = the progression's own. */
  template: string;
  custom: CustomState;
  scenario: string;
}

const STORAGE_KEY = "planetproto.runtime";
const MAX_LEVEL = 30;
const MODES: [Run["kind"], string][] = [
  ["normal", "Normal run"],
  ["custom", "Custom level"],
  ["scenario", "Scenario"],
];

const save = () => setPref(STORAGE_KEY, JSON.stringify(state));
const clampLevel = (n: number) => (Number.isFinite(n) ? Math.min(MAX_LEVEL, Math.max(1, Math.round(n))) : 1);

function load(): RunState {
  const fallback: RunState = { mode: "normal", level: 1, template: "", custom: { spec: emptyLevel(), from: "", fromLevel: 4 }, scenario: SCENARIOS[0]!.id };
  try {
    const s = { ...fallback, ...(JSON.parse(getPref(STORAGE_KEY) ?? "{}") as Partial<RunState>) };
    if (!MODES.some(([m]) => m === s.mode)) s.mode = "normal";
    s.level = clampLevel(Number(s.level));
    if (!ALL_TEMPLATES.some((t) => t.name === s.template)) s.template = "";
    if (!s.custom || !isLevelSpec(s.custom.spec)) s.custom = fallback.custom;
    s.custom.fromLevel = clampLevel(Number(s.custom.fromLevel));
    if (!scenario(s.scenario)) s.scenario = fallback.scenario;
    return s;
  } catch {
    return fallback;
  }
}

const state: RunState = load();

/** The run the dev panel is set to (what a reload starts with); `?scenario=<id>` overrides it. */
export function currentRun(): Run {
  const fromUrl = typeof location !== "undefined" ? scenario(new URLSearchParams(location.search).get("scenario") ?? "") : null;
  if (fromUrl) return { kind: "scenario", scenario: fromUrl };
  if (state.mode === "custom" && hasOpponents(state.custom.spec)) return { kind: "custom", spec: structuredClone(state.custom.spec) };
  if (state.mode === "scenario") return { kind: "scenario", scenario: scenario(state.scenario)! };
  return { kind: "normal", level: state.level, template: ALL_TEMPLATES.find((t) => t.name === state.template) ?? null };
}

export const runSection: DevSection = {
  id: "run",
  title: "Run",
  mount(ctx) {
    const section = el("div", { className: "section run" });
    const statusEl = el("div", { className: "status" });
    const setStatus = (text: string) => (statusEl.textContent = text);
    ctx.onRound((w) => setStatus(`Now: ${ctx.session.where()} · planet ${w.planet.seed.toString(36)}`));
    const modeBar = el("div", { className: "tabs" });
    const body = el("div", { className: "body" });
    const footer = el("div", { className: "footer" });
    section.append(modeBar, body, footer);

    const modeButtons = MODES.map(([m, label]) => {
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
      modeButtons.forEach((b, i) => b.classList.toggle("active", MODES[i]![0] === state.mode));
      body.replaceChildren(statusEl);
      footer.replaceChildren();
      if (state.mode === "normal") renderNormal();
      else if (state.mode === "custom") renderCustom();
      else renderScenario();
      body.scrollTop = scroll;
      ctx.setWide(state.mode === "custom");
    };

    const renderNormal = () => {
      const go = button(`Start level ${state.level}`, () => {
        save();
        ctx.start(currentRun());
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
        if (hasOpponents(c.spec)) ctx.start(currentRun());
        else setStatus("Add a queen or a flock first.");
      }, "primary");
      footer.append(copyButton("Copy level", () => levelSource(c.spec), "Copy as a LevelTemplate for levels.ts"), start);
    };

    const renderScenario = () => {
      const pick = select(
        SCENARIOS.map((s): [string, string] => [s.id, s.name]),
        state.scenario,
        (v) => {
          state.scenario = v;
          save();
          render();
        },
      );
      body.append(
        el("h4", { textContent: "Scenario" }),
        pick,
        el("div", { className: "note", textContent: scenario(state.scenario)?.blurb ?? "" }),
        el("div", { className: "note", textContent: "Scenarios live in src/scenarios. Also: ?scenario=<id>, or bun run sim --scenario <id>." }),
      );
      footer.append(
        button("Start scenario", () => {
          save();
          ctx.start(currentRun());
        }, "primary"),
      );
    };

    render();
    return section;
  },
};
