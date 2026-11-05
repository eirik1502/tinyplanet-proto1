import { level, SKILLS } from "../../attacks/skills";
import type { Session } from "../../game/session";
import type { BrowserInput } from "../../input/browser";
import { buttons, pips, skillIcon } from "./briefing";

// The pick after a win: a card per skill offered, at its next step. Left / right (or the pointer)
// highlight one, confirm (or a click) takes it. Shown in the briefing's element, with its look.

function pickHtml(session: Session) {
  const cards = session.offer.map((id, i) => {
    const sk = SKILLS[id];
    const lv = level(session.skills, id);
    const unlock = sk.kind === "attack" && lv === 0;
    const tag = unlock ? "New attack" : sk.kind === "attack" ? "Attack" : "Passive";
    const input = unlock ? `<span class="ability-input">${buttons(id === "spear" ? "spear" : "sword")}</span>` : "";
    return `
      <button class="unit pick${i === session.choice ? " on" : ""}${unlock ? " unlock" : ""}" data-pick="${i}">
        <span class="pick-tag">${tag}</span>
        <span class="ability-icon">${skillIcon(sk.icon)}</span>
        <h3>${sk.name}</h3>
        <span class="pips">${pips(lv + 1, sk.steps.length)}</span>
        <span class="ability-text">${sk.steps[lv]}</span>
        ${input}
      </button>`;
  });
  return `
    <div class="sheet intro">
      <header class="top"><div><h1>Choose a skill</h1><p class="blurb">For level ${session.level + 1} and the rest of the run.</p></div></header>
      <div class="picks">${cards.join("")}</div>
      <p class="hint">${buttons("confirm", " ")} takes the highlighted one</p>
    </div>`;
}

export function mountPick(el: HTMLElement, session: Session, input: BrowserInput) {
  const show = () => {
    el.innerHTML = pickHtml(session);
    el.hidden = false;
  };
  session.events.on("pickOpen", show);
  session.events.on("pickChange", ({ choice }) => {
    el.querySelectorAll<HTMLElement>("[data-pick]").forEach((c) => c.classList.toggle("on", Number(c.dataset.pick) === choice));
  });
  session.events.on("pickClose", () => {
    el.hidden = true;
    input.clear();
  });
  input.onChange(() => {
    if (session.state === "pick") show();
  });
  el.addEventListener("mouseover", (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>("[data-pick]");
    if (t && session.state === "pick") session.highlight(Number(t.dataset.pick));
  });
  el.addEventListener("click", (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>("[data-pick]");
    if (t && session.state === "pick") session.choose(Number(t.dataset.pick));
  });
}
