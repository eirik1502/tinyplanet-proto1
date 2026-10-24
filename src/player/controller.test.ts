import { expect, test } from "bun:test";
import { wrapAngle } from "../core/math";
import { Session } from "../game/session";
import { NO_INPUT, type Action, type InputFrame } from "../input/types";
import { liveParams } from "../params/store";
import { predict, launch } from "./flight";

// The jump help on the first levels: the assist nudging a jump that would just miss, and a jump
// aimed past the lean limit sliding along the rim first.

const frame = (move: { x: number; y: number }, pressed: Action[] = []): InputFrame => ({
  ...NO_INPUT,
  move,
  pressed: new Set(pressed),
  held: new Set(pressed),
});

/** The tutorial, hanging on the start island, rim facing the next island. */
function start(assist: number) {
  const s = new Session(liveParams, { skipBriefings: true });
  s.start({ kind: "normal", level: 0, template: null });
  const w = s.world;
  w.spec.assist = assist;
  return { s, w };
}

test("the assist nudges a jump that would just miss onto the next island", () => {
  for (const assist of [0, 1]) {
    const { s, w } = start(assist);
    const p = w.player;
    const next = w.islands[1]!;
    const toward = Math.atan2(next.cy - p.y, next.cx - p.x);
    // Aim with the pointer (it doesn't climb) a little to the side of the next island, until the
    // straight jump misses it.
    let missed = 0;
    let rescued = 0;
    for (let off = 0.1; off < 0.7; off += 0.03) {
      for (const a of [toward + off, toward - off]) {
        s.step(1 / 60, { ...NO_INPUT, aimMode: "pointer", aim: { x: Math.cos(a), y: Math.sin(a) } });
        const plan = w.playerCtl.jumpPlan!;
        if (plan.clamped) continue;
        const raw = predict(w, launch(w, p.island, p.s, plan.out + wrapAngle(a - plan.out), p.slide), p.island, false);
        if (raw.island !== null) continue;
        missed++;
        const got = predict(w, launch(w, p.island, p.s, plan.angle, p.slide), p.island, false);
        if (got.island === 1) rescued++;
        if (!assist) expect(plan.angle).toBeCloseTo(plan.out + wrapAngle(a - plan.out));
      }
    }
    expect(missed).toBeGreaterThan(0);
    if (assist) expect(rescued).toBeGreaterThan(0);
    else expect(rescued).toBe(0);
  }
});

test("a jump aimed past the lean limit slides along the rim, then jumps", () => {
  const { s, w } = start(0);
  const p = w.player;
  const e = w.islands[p.island]!.pointAt(p.s);
  // Along the rim: as far from straight out as it gets.
  const along = { x: e.tx, y: e.ty };
  s.step(1 / 60, frame(along, ["jump"]));
  expect(p.mode).toBe("hang");
  expect(p.jumpQueue).not.toBeNull();
  const s0 = p.s;
  for (let i = 0; i < 60 && p.mode === "hang"; i++) s.step(1 / 60, frame({ x: 0, y: 0 }));
  expect(p.mode).toBe("air");
  expect(Math.abs(p.s - s0)).toBeGreaterThan(20);
});

test("falling into the haze doesn't hurt on level 1, and does from level 2", () => {
  for (const level of [1, 2]) {
    const s = new Session(liveParams, { skipBriefings: true, seed: 5 });
    s.start({ kind: "normal", level, template: null });
    const w = s.world;
    Object.assign(w.player, { mode: "lost", lostTimer: 0 });
    for (let i = 0; i < 120; i++) s.step(1 / 60, NO_INPUT);
    expect(w.player.mode).toBe("hang");
    expect(w.playerCtl.health.hp).toBe(level === 1 ? 100 : 100 - liveParams.player.health.fallDamage);
  }
});
