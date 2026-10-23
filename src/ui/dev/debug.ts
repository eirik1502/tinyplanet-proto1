import { getPref, setPref } from "../../core/prefs";
import { DEBUG_LAYERS } from "../../render/debug";
import { checkbox, el } from "../dom";
import type { DevSection } from "./panel";

// The dev panel's Debug section: switch the debug render layers on and off (remembered).

const KEY = "planetproto.debug";

export const debugSection: DevSection = {
  id: "debug",
  title: "Debug",
  mount(ctx) {
    for (const id of (getPref(KEY) ?? "").split(",").filter(Boolean)) ctx.debug.add(id);
    const save = () => setPref(KEY, [...ctx.debug].join(","));
    const body = el("div", { className: "body" });
    body.append(
      el("h4", { textContent: "Draw" }),
      ...DEBUG_LAYERS.map((l) =>
        checkbox(l.name, ctx.debug.has(l.id), (on) => {
          if (on) ctx.debug.add(l.id);
          else ctx.debug.delete(l.id);
          save();
        }),
      ),
      el("div", { className: "note", textContent: "Layers live in src/render/debug.ts; register one to add it here." }),
    );
    return el("div", { className: "section debug" }, body);
  },
};
