import { getPref, setPref } from "./prefs";
import { runSection, type Run } from "./runtime";
import { tuningSection } from "./tuning";

// The dev panel: a collapsible box in the corner with two sections. Run holds runtime-only
// settings (what to play: a progression level or a dev level); Tuning holds the game params,
// which can be copied as source for params.ts.

const STYLE = `
  #devui { position: fixed; top: 10px; right: 10px; width: 300px; max-height: calc(100vh - 20px);
    display: flex; flex-direction: column; box-sizing: border-box;
    background: rgba(18, 12, 40, 0.86); color: #e4defc; font: 12px/1.3 system-ui, sans-serif;
    border: 1px solid rgba(170, 150, 255, 0.25); border-radius: 8px; backdrop-filter: blur(6px); user-select: none; }
  #devui > header { display: flex; align-items: center; gap: 4px; padding: 7px 10px; cursor: pointer; font-weight: 600; }
  #devui > header .title { margin-right: 6px; }
  #devui > header .spacer { flex: 1; }
  #devui.collapsed .section, #devui.collapsed .sections { display: none; }
  #devui button { background: rgba(170, 150, 255, 0.18); color: inherit; border: 0; border-radius: 4px;
    padding: 3px 8px; font: inherit; cursor: pointer; }
  #devui button:hover { background: rgba(170, 150, 255, 0.32); }
  #devui button.active, #devui button.primary { background: #5b3fc0; color: #fff; }
  #devui button.primary:hover { background: #6d50d8; }
  #devui .section { display: flex; flex-direction: column; min-height: 0; flex: 1; }
  #devui .section[hidden] { display: none; }
  #devui .toolbar { display: flex; gap: 4px; align-items: center; padding: 0 10px 6px; }
  #devui .toolbar span { flex: 1; color: #a99be8; font-size: 11px; }
  #devui .tabs { display: flex; gap: 2px; padding: 0 8px; border-bottom: 1px solid rgba(170, 150, 255, 0.25); }
  #devui .tuning .tabs { flex-wrap: wrap; }
  #devui .tabs button { flex: 1 0 auto; border-radius: 4px 4px 0 0; background: transparent; padding: 5px 2px; color: #a99be8; }
  #devui .tabs button.active { background: rgba(170, 150, 255, 0.22); color: #fff; }
  #devui .body { padding: 0 10px 8px; overflow-y: auto; }
  #devui h4 { margin: 8px 0 3px; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: #a99be8; }
  #devui .tuning label { display: grid; grid-template-columns: 1fr auto; row-gap: 1px; margin-bottom: 4px; }
  #devui .tuning label small { color: #a99be8; margin-left: 4px; }
  #devui output { font-variant-numeric: tabular-nums; color: #fff; }
  #devui input[type=range] { grid-column: 1 / -1; width: 100%; margin: 0; accent-color: #9d86ff; }
  #devui .note { color: #a99be8; margin-top: 6px; font-size: 11px; }
  #devui .status { margin-top: 8px; padding: 5px 7px; border-radius: 4px; background: rgba(0, 0, 0, 0.25); color: #d8f6ff; }
  #devui .row { display: flex; gap: 4px; align-items: center; margin-bottom: 4px; }
  #devui .row.wrap { flex-wrap: wrap; }
  #devui input[type=number], #devui select { background: rgba(0, 0, 0, 0.3); color: #fff; font: inherit;
    border: 1px solid rgba(170, 150, 255, 0.3); border-radius: 4px; padding: 2px 4px; box-sizing: border-box; }
  #devui select { width: 100%; }
  #devui .row > input[type=number] { width: 56px; text-align: center; }
  #devui .counts .kind { display: flex; flex-direction: column; gap: 1px; flex: 1; font-size: 10px; color: #a99be8; }
  #devui .counts .kind input { width: 100%; }
  #devui .counts .melee span { color: #ff8a8a; }
  #devui .counts .ranged span { color: #8fd3ff; }
  #devui .counts .bomber span { color: #ffc46b; }
  #devui .counts .remove { align-self: flex-end; }
  #devui .flock-name { color: #c9b8e8; margin-top: 4px; }
  #devui .check { display: flex; gap: 6px; align-items: center; margin-bottom: 4px; cursor: pointer; }
  #devui .check input { margin: 0; accent-color: #9d86ff; }
  #devui.wide { width: min(430px, calc(100vw - 20px)); }
  #devui .footer { display: flex; gap: 6px; justify-content: flex-end; padding: 8px 10px; border-top: 1px solid rgba(170, 150, 255, 0.25); }
  #devui .footer:empty { display: none; }
  #devui .dim { color: #a99be8; }
  #devui .row > select { flex: 1; width: auto; }
  #devui .field { display: grid; grid-template-columns: 110px 1fr; gap: 6px; align-items: center; margin-bottom: 4px; }
  #devui .field input[type=number] { width: 100%; }
  #devui .slider { display: grid; grid-template-columns: 1fr auto; row-gap: 1px; margin-bottom: 4px; }
  #devui details.flock { margin-bottom: 6px; padding: 4px 8px 6px; border-radius: 6px; background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(170, 150, 255, 0.18); }
  #devui details > summary { cursor: pointer; list-style: none; }
  #devui details > summary::-webkit-details-marker { display: none; }
  #devui details > summary::before { content: "▸"; display: inline-block; width: 12px; color: #a99be8; }
  #devui details[open] > summary::before { content: "▾"; }
  #devui details.flock > summary { display: flex; gap: 6px; align-items: center; padding: 2px 0; }
  #devui details.flock > summary .summary { color: #a99be8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  #devui details.flock > summary .spacer { flex: 1; }
  #devui details.sub { margin: 4px 0 4px 6px; }
  #devui details.sub > summary { color: #c9b8e8; margin-bottom: 4px; }
  #devui details.params .field { grid-template-columns: 1fr 80px; }
  #devui .member { margin-top: 6px; padding-top: 6px; border-top: 1px dashed rgba(170, 150, 255, 0.18); }
  #devui .member .row > input[type=number] { width: 56px; }
`;

type SectionId = "run" | "tuning";

export function createDevUI(onStart: (run: Run) => void) {
  const style = document.createElement("style");
  style.textContent = STYLE;
  document.head.appendChild(style);

  const panel = document.createElement("div");
  panel.id = "devui";
  const header = document.createElement("header");
  const title = Object.assign(document.createElement("span"), { className: "title", textContent: "Dev" });
  const spacer = Object.assign(document.createElement("span"), { className: "spacer" });
  const toggle = document.createElement("button");
  // The custom level editor gets a wider panel (the Run section reports its mode as it renders).
  let runMode = "normal";
  let sections: Record<SectionId, HTMLElement> | null = null;
  const widen = () => panel.classList.toggle("wide", !!sections && !sections.run.hidden && runMode === "custom");
  sections = {
    run: runSection(onStart, (m) => {
      runMode = m;
      widen();
    }),
    tuning: tuningSection(),
  };
  const sectionButtons = (Object.keys(sections) as SectionId[]).map((id) => {
    const b = Object.assign(document.createElement("button"), { textContent: id === "run" ? "Run" : "Tuning" });
    b.addEventListener("click", () => {
      show(id);
      setCollapsed(false);
      b.blur();
    });
    return [id, b] as const;
  });
  header.append(title, ...sectionButtons.map(([, b]) => b), spacer, toggle);
  panel.append(header, ...Object.values(sections));

  const show = (id: SectionId) => {
    for (const [s, b] of sectionButtons) {
      sections[s].hidden = s !== id;
      b.classList.toggle("active", s === id);
    }
    setPref("planetproto.devui.section", id);
    widen();
  };
  show(getPref("planetproto.devui.section") === "tuning" ? "tuning" : "run");

  const setCollapsed = (c: boolean) => {
    panel.classList.toggle("collapsed", c);
    toggle.textContent = c ? "Show" : "Hide";
    setPref("planetproto.devui.open", c ? "0" : "1");
  };
  setCollapsed(getPref("planetproto.devui.open") !== "1");
  header.addEventListener("click", (e) => {
    if (e.target === header || e.target === title || e.target === spacer || e.target === toggle) {
      setCollapsed(!panel.classList.contains("collapsed"));
      toggle.blur();
    }
  });

  document.body.appendChild(panel);
}
