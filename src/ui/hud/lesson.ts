import { getPref, setPref } from "../../core/prefs";
import type { HudContext, HudWidget } from "./types";

// The lesson showing (game/lessons.ts), as a prompt under the player: its text with the buttons
// drawn as keys. Learned lessons are remembered in the browser, so each one teaches only once.

const KEY = "planetproto.lessons";

/** Lessons learned in earlier sessions. */
export function learnedLessons(): string[] {
  return (getPref(KEY) ?? "").split(",").filter(Boolean);
}

export function rememberLesson(id: string) {
  const all = new Set(learnedLessons()).add(id);
  setPref(KEY, [...all].join(","));
}

/** Show every lesson again (from the next round). */
export function forgetLessons() {
  setPref(KEY, "");
}

const FADE = 0.2;

export const lesson: HudWidget = {
  id: "lesson",
  draw(c) {
    const { ctx, W, session, proj } = c;
    const w = session.world;
    const showing = w.lessons.showing;
    if (session.state !== "play" || !showing) return;
    const p = w.player;
    const pr = proj.project(p.x, p.y, p.alt);
    const parts = showing.lesson.text.split(/(\{\w+\})/).filter(Boolean);

    ctx.save();
    ctx.globalAlpha = Math.min(1, showing.age / FADE);
    ctx.font = "600 14px system-ui, sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    const keyPad = 7;
    const items = parts.map((t) => {
      const key = /^\{(\w+)\}$/.exec(t)?.[1];
      const label = key ? keyLabel(c, key) : t;
      return { key: !!key, label, w: ctx.measureText(label).width + (key ? keyPad * 2 : 0) };
    });
    const gap = 4;
    const total = items.reduce((s, i) => s + i.w, 0) + gap * (items.length - 1);
    const padX = 14;
    const h = 34;
    const x0 = Math.max(8, Math.min(W - total - padX * 2 - 8, pr.x - total / 2 - padX));
    const y = pr.y + 64;

    ctx.fillStyle = "rgba(20,8,35,0.78)";
    ctx.strokeStyle = "rgba(190,244,255,0.35)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x0, y - h / 2, total + padX * 2, h, h / 2);
    ctx.fill();
    ctx.stroke();

    let x = x0 + padX;
    for (const it of items) {
      if (it.key) {
        ctx.fillStyle = "rgba(240,230,255,0.95)";
        ctx.beginPath();
        ctx.roundRect(x, y - 11, it.w, 22, 5);
        ctx.fill();
        ctx.fillStyle = "#2a1a4a";
        ctx.fillText(it.label, x + keyPad, y + 1);
      } else {
        ctx.fillStyle = "#f0e8ff";
        ctx.fillText(it.label, x, y + 1);
      }
      x += it.w + gap;
    }
    ctx.restore();
  },
};

function keyLabel(c: HudContext, key: string) {
  if (key === "move") return c.moveText();
  if (key === "aim") return c.aimText();
  return c.promptText(key as Parameters<HudContext["promptText"]>[0]);
}
