import { counts, DEV_PRESETS, KINDS, type DevLevel, type KindCounts } from "./devlevel";
import { ALL_TEMPLATES, type LevelTemplate } from "./levels";
import { getPref, setPref } from "./prefs";

// Runtime settings: what to play right now, set from the dev panel's Run section. Unlike the
// tuned params these aren't game design, so they're never copied into params.ts; they're kept per
// browser so a reload picks up where you left off.

/** What a round plays: the normal progression from a level, or a dev level. */
export type Run =
  | { kind: "progression"; level: number; template: LevelTemplate | null }
  | { kind: "dev"; dev: DevLevel };

interface RuntimeState {
  mode: Run["kind"];
  /** The level the progression starts from. */
  level: number;
  /** Template override for every progression level, by name; "" = the progression's own. */
  template: string;
  dev: DevLevel;
}

const STORAGE_KEY = "planetproto.runtime";
const MAX_LEVEL = 30;

function load(): RuntimeState {
  const fallback: RuntimeState = { mode: "progression", level: 1, template: "", dev: DEV_PRESETS[0]!.level() };
  try {
    const s = { ...fallback, ...(JSON.parse(getPref(STORAGE_KEY) ?? "{}") as Partial<RuntimeState>) };
    const okCounts = (c: KindCounts | undefined) => !!c && KINDS.every((k) => typeof c[k] === "number");
    if (s.mode !== "progression" && s.mode !== "dev") s.mode = "progression";
    s.level = clampLevel(Number(s.level));
    if (!ALL_TEMPLATES.some((t) => t.name === s.template)) s.template = "";
    if (!Array.isArray(s.dev?.flocks) || !s.dev.flocks.every(okCounts) || !okCounts(s.dev.escort)) s.dev = fallback.dev;
    return s;
  } catch {
    return fallback;
  }
}

const save = () => setPref(STORAGE_KEY, JSON.stringify(state));
const clampLevel = (n: number) => (Number.isFinite(n) ? Math.min(MAX_LEVEL, Math.max(1, Math.round(n))) : 1);

const state: RuntimeState = load();

/** The run the dev panel is set to (what a reload starts with). */
export function currentRun(): Run {
  if (state.mode === "dev") return { kind: "dev", dev: structuredClone(state.dev) };
  return { kind: "progression", level: state.level, template: ALL_TEMPLATES.find((t) => t.name === state.template) ?? null };
}

// ---------------------------------------------------------------------------------------------
// Run section
// ---------------------------------------------------------------------------------------------

/** An element with these properties (className, textContent, value…) and children. */
function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...kids: (Node | string)[]) {
  const e: HTMLElementTagNameMap[K] = document.createElement(tag);
  Object.assign(e, props);
  e.append(...kids);
  return e;
}

/** A button that gives keyboard focus back to the game once clicked (so Space doesn't press it again). */
function button(text: string, onClick: () => void, cls = "") {
  const b = el("button", { textContent: text, className: cls });
  b.addEventListener("click", () => {
    onClick();
    b.blur();
  });
  return b;
}

function numberInput(value: number, min: number, max: number, onChange: (v: number) => void) {
  const input = el("input", { type: "number", min: String(min), max: String(max), step: "1", value: String(value) });
  input.addEventListener("input", () => {
    const v = Number(input.value);
    if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, Math.round(v))));
  });
  input.addEventListener("change", () => input.blur());
  return input;
}

let statusEl: HTMLElement | null = null;

/** Show what is being played right now, at the top of the Run section. */
export function setRunStatus(text: string) {
  if (statusEl) statusEl.textContent = text;
}

/**
 * The Run section of the dev panel: pick the normal progression (from a level, optionally with
 * one template on every level) or a dev level with chosen flocks, and start it.
 */
export function runSection(onStart: (run: Run) => void): HTMLElement {
  const section = el("div", { className: "section run" });
  statusEl = el("div", { className: "status" });
  const modeBar = el("div", { className: "tabs" });
  const body = el("div", { className: "body" });
  section.append(modeBar, body);

  const start = () => {
    save();
    const d = state.dev;
    const empty = !d.queen && d.flocks.every((c) => KINDS.every((k) => c[k] <= 0));
    if (state.mode === "dev" && empty) setRunStatus("Add an opponent first.");
    else onStart(currentRun());
  };

  const modeButtons = (["progression", "dev"] as const).map((m) => {
    const b = button(m === "progression" ? "Progression" : "Dev level", () => {
      state.mode = m;
      save();
      render();
    });
    modeBar.append(b);
    return b;
  });

  const render = () => {
    modeButtons.forEach((b, i) => b.classList.toggle("active", ["progression", "dev"][i] === state.mode));
    body.replaceChildren(statusEl!);
    if (state.mode === "progression") renderProgression();
    else renderDev();
  };

  const renderProgression = () => {
    const level = numberInput(state.level, 1, MAX_LEVEL, (v) => {
      state.level = v;
      go.textContent = `Start level ${v}`;
      save();
    });
    const step = (d: number) => {
      state.level = clampLevel(state.level + d);
      save();
      render();
    };
    const template = el("select");
    template.append(el("option", { value: "", textContent: "From the progression" }));
    for (const t of ALL_TEMPLATES) template.append(el("option", { value: t.name, textContent: t.boss ? `${t.name} (boss)` : t.name }));
    template.value = state.template;
    template.addEventListener("change", () => {
      state.template = template.value;
      save();
      template.blur();
    });
    const go = button(`Start level ${state.level}`, start, "primary");
    body.append(
      el("h4", { textContent: "Level" }),
      el("div", { className: "row" }, button("−", () => step(-1)), level, button("+", () => step(1))),
      el("h4", { textContent: "Template" }),
      template,
      el("div", { className: "note", textContent: "Used on every level of the run; modifiers roll as usual." }),
      el("div", { className: "actions" }, go),
    );
  };

  const countsRow = (c: KindCounts, onRemove?: () => void) =>
    el(
      "div",
      { className: "row counts" },
      ...KINDS.map((k) =>
        el(
          "label",
          { className: `kind ${k}` },
          el("span", { textContent: k }),
          numberInput(c[k], 0, 40, (v) => {
            c[k] = v;
            save();
          }),
        ),
      ),
      ...(onRemove ? [button("×", onRemove, "remove")] : []),
    );

  const checkbox = (text: string, checked: boolean, onChange: (v: boolean) => void, title = "") => {
    const input = el("input", { type: "checkbox", checked });
    input.addEventListener("change", () => {
      onChange(input.checked);
      save();
      input.blur();
    });
    return el("label", { className: "check", title }, input, el("span", { textContent: text }));
  };

  const renderDev = () => {
    const d = state.dev;
    const presets = el(
      "div",
      { className: "row wrap" },
      ...DEV_PRESETS.map((p) =>
        button(p.name, () => {
          state.dev = p.level();
          save();
          render();
        }),
      ),
    );
    const flocks = d.flocks.map((c, i) =>
      el(
        "div",
        { className: "flock" },
        el("div", { className: "flock-name", textContent: `Flock ${i + 1}` }),
        countsRow(c, () => {
          d.flocks.splice(i, 1);
          save();
          render();
        }),
      ),
    );
    const add = button("+ Flock", () => {
      d.flocks.push(counts(1));
      save();
      render();
    });
    const queen = checkbox("Queen, escorted by", d.queen, (v) => {
      d.queen = v;
      render();
    });
    body.append(
      el("h4", { textContent: "Presets" }),
      presets,
      el("h4", { textContent: "Flocks" }),
      ...flocks,
      el("div", { className: "row" }, add),
      el("h4", { textContent: "Queen" }),
      queen,
      ...(d.queen ? [countsRow(d.escort)] : []),
      el("div", { className: "note", textContent: d.queen ? "Kill the queen to win." : "Kill every boid to win." }),
      el("h4", { textContent: "Behaviour" }),
      checkbox("Flocks hunt you from the start", d.hunt, (v) => (d.hunt = v), "Engaged at once, instead of waiting until you come close"),
      checkbox("Flocks stay together", d.together, (v) => (d.together = v), "No joining, splitting or handing over guards"),
      el("div", { className: "actions" }, button("Start dev level", start, "primary")),
    );
  };

  render();
  return section;
}
