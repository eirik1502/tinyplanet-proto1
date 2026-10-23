import type { GameObject } from "../../core/object";
import type { World } from "../../game/world";
import { button, el } from "../dom";
import type { DevSection } from "./panel";

// The dev panel's Inspect section: the world's objects (by kind, and the player's state and
// components) and a log of its events as they happen.

const LOG_SIZE = 60;
/** Events too frequent to be worth logging by default. */
const NOISY = new Set(["windup", "enemyLunge", "shot", "thud"]);

const round = (v: unknown): unknown =>
  typeof v === "number" ? Math.round(v * 100) / 100 : v instanceof Set ? `Set(${v.size})` : typeof v === "function" ? "ƒ" : v;

/** An object's own numbers and flags, and its components (shallow), as text. */
function describe(o: GameObject) {
  const own = Object.entries(o)
    .filter(([k, v]) => typeof v !== "object" && k !== "kind")
    .map(([k, v]) => `${k}: ${round(v)}`)
    .join("  ");
  const parts = o
    .components()
    .map(([name, c]) => {
      const fields = Object.entries(c as object)
        .filter(([, v]) => typeof v !== "function" && typeof v !== "object")
        .map(([k, v]) => `${k}: ${round(v)}`)
        .join(", ");
      return `  ${name} {${fields}}`;
    })
    .join("\n");
  return `${o.kind}#${o.id}  ${own}\n${parts}`;
}

export const inspectSection: DevSection = {
  id: "inspect",
  title: "Inspect",
  mount(ctx) {
    const objects = el("pre");
    const player = el("pre");
    const log = el("pre");
    const lines: string[] = [];
    let paused = false;
    let all = false;
    let world: World | null = null;

    ctx.onRound((w) => {
      world = w;
      lines.length = 0;
      w.events.afterAny((type, e) => {
        if (paused || (!all && NOISY.has(String(type)))) return;
        const fields = Object.entries(e)
          .filter(([k]) => k !== "x" && k !== "y" && k !== "alt")
          .map(([k, v]) => `${k}=${round(v)}`)
          .join(" ");
        lines.unshift(`${w.time.toFixed(2)} ${String(type)} ${fields}`);
        if (lines.length > LOG_SIZE) lines.pop();
      }, { owner: w.lifetime });
    });

    const pause = button("Pause log", () => {
      paused = !paused;
      pause.textContent = paused ? "Resume log" : "Pause log";
    });
    const noisy = button("Show all events", () => {
      all = !all;
      noisy.textContent = all ? "Hide frequent events" : "Show all events";
    });
    const body = el(
      "div",
      { className: "body" },
      el("h4", { textContent: "Objects" }),
      objects,
      el("h4", { textContent: "Player" }),
      player,
      el("h4", { textContent: "Events" }),
      el("div", { className: "row" }, pause, noisy),
      el("div", { className: "log" }, log),
    );
    const section = el("div", { className: "section inspect" }, body);

    // Refresh a few times a second while showing.
    setInterval(() => {
      if (section.hidden || !world) return;
      const counts = new Map<string, number>();
      for (const o of world.objects.all()) counts.set(o.kind, (counts.get(o.kind) ?? 0) + 1);
      objects.textContent = [...counts].map(([k, n]) => `${k}: ${n}`).join("  ") + `\nstep ${world.steps} · t ${world.time.toFixed(1)}s · slow ×${world.slow.scale.toFixed(2)}`;
      player.textContent = describe(world.player);
      log.textContent = lines.join("\n");
    }, 250);
    return section;
  },
};
