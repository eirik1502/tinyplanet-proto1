import { getPref, setPref } from "../../core/prefs";
import { GROUP_TITLES, SLIDERS, TAB_TITLES } from "../../params/meta";
import { liveParams, paramsSource, resetLiveTab, saveLiveParams, type Params } from "../../params/store";
import { copyText } from "../dom";
import type { DevSection } from "./panel";

// The dev panel's Tuning section: a tab per top-level group of the live params, with sliders, and
// buttons to copy every value as source for params/defaults.ts or reset the open tab. Changes
// apply at once (some when a new round starts) and persist in the browser.

type Tree = Record<string, Record<string, Record<string, number>>>;
const live = liveParams as unknown as Tree;

function fmt(v: number, step: number) {
  return step < 1 ? v.toFixed(2).replace(/\.?0+$/, "") : String(Math.round(v));
}

function tuningSection(): HTMLElement {
  const section = document.createElement("div");
  section.className = "section tuning";
  const toolbar = document.createElement("div");
  toolbar.className = "toolbar";
  const copy = document.createElement("button");
  copy.textContent = "Copy";
  copy.title = "Copy all values as source for src/params/defaults.ts";
  const reset = document.createElement("button");
  reset.textContent = "Reset tab";
  const hint = document.createElement("span");
  hint.textContent = "Saved in this browser";
  toolbar.append(hint, copy, reset);
  const tabBar = document.createElement("div");
  tabBar.className = "tabs";
  const body = document.createElement("div");
  body.className = "body";
  section.append(toolbar, tabBar, body);

  copy.addEventListener("click", async () => {
    const ok = await copyText(paramsSource(liveParams));
    copy.textContent = ok ? "Copied!" : "Copy failed";
    setTimeout(() => (copy.textContent = "Copy"), 1400);
  });

  const tabKeys = Object.keys(TAB_TITLES) as (keyof Params)[];
  let current = Math.max(0, tabKeys.indexOf(getPref("planetproto.tuning.tab") as keyof Params));
  let refreshers: (() => void)[] = [];

  const renderTab = () => {
    const t = tabKeys[current]!;
    body.replaceChildren();
    refreshers = [];
    tabButtons.forEach((b, i) => b.classList.toggle("active", i === current));
    let anyRestart = false;
    for (const g of Object.keys(live[t]!)) {
      const values = live[t]![g]!;
      const keys = Object.keys(values).filter((k) => SLIDERS[`${t}.${g}.${k}`]);
      if (!keys.length) continue;
      const h = document.createElement("h4");
      h.textContent = GROUP_TITLES[`${t}.${g}`] ?? g;
      body.appendChild(h);
      for (const k of keys) {
        const [labelText, min, max, step, restart] = SLIDERS[`${t}.${g}.${k}`]!;
        const label = document.createElement("label");
        const name = document.createElement("span");
        name.textContent = labelText;
        if (restart) {
          anyRestart = true;
          const mark = document.createElement("small");
          mark.textContent = "↻";
          mark.title = "Applies when a new round starts";
          name.appendChild(mark);
        }
        const out = document.createElement("output");
        const input = document.createElement("input");
        input.type = "range";
        input.min = String(min);
        input.max = String(max);
        input.step = String(step);
        const refresh = () => {
          input.value = String(values[k]);
          out.textContent = fmt(values[k]!, step);
        };
        refresh();
        refreshers.push(refresh);
        input.addEventListener("input", () => {
          values[k] = Number(input.value);
          out.textContent = fmt(values[k]!, step);
          saveLiveParams();
        });
        // Hand keyboard focus back to the game so arrows/Space don't keep nudging the slider.
        input.addEventListener("change", () => input.blur());
        input.addEventListener("pointerup", () => input.blur());
        label.append(name, out, input);
        body.appendChild(label);
      }
    }
    if (anyRestart) {
      const note = document.createElement("div");
      note.className = "note";
      note.textContent = "↻ applies when a new round starts";
      body.appendChild(note);
    }
  };

  const tabButtons = tabKeys.map((t, i) => {
    const b = document.createElement("button");
    b.textContent = TAB_TITLES[t];
    b.addEventListener("click", () => {
      current = i;
      setPref("planetproto.tuning.tab", t);
      renderTab();
    });
    tabBar.appendChild(b);
    return b;
  });

  reset.addEventListener("click", () => {
    resetLiveTab(tabKeys[current]!);
    refreshers.forEach((r) => r());
  });

  renderTab();
  return section;
}

export const tuningDevSection: DevSection = { id: "tuning", title: "Tuning", mount: () => tuningSection() };
