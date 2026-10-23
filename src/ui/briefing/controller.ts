import type { Session } from "../../game/session";
import type { BrowserInput, InputMode } from "../../input/browser";
import { briefingHtml, paintPortraits, setBriefingInput } from "./briefing";

// Shows the briefing in `el` while the session is on it, follows input mode changes (the briefing
// shows the device's buttons), and handles its buttons: the input mode, and start / resume.

export function mountBriefing(el: HTMLElement, session: Session, input: BrowserInput, onGesture: () => void) {
  setBriefingInput(input);
  const show = (animate: boolean) => {
    const data = session.briefingData();
    el.innerHTML = briefingHtml({ ...data, animate, params: session.params });
    el.hidden = false;
    paintPortraits(el, data.weapons, data.enemies);
  };
  session.events.on("briefingOpen", () => show(true));
  session.events.on("briefingClose", () => {
    el.hidden = true;
    // The key that started the level shouldn't also jump or attack.
    input.clear();
  });
  input.onChange(() => {
    if (session.state === "briefing") show(false);
  });
  el.addEventListener("click", (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>("[data-mode],[data-start]");
    if (!t) return;
    onGesture();
    if (t.dataset.mode) input.setMode(t.dataset.mode as InputMode);
    else session.closeBriefing();
  });
}
