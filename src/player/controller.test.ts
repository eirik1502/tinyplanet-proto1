import { expect, test } from "bun:test";
import { wrapAngle } from "../core/math";
import { Session } from "../game/session";
import { NO_INPUT, type Action, type InputFrame } from "../input/types";
import { liveParams } from "../params/store";
import { launch, maxLean, predict } from "./flight";

// Jumping off a rim: the assist nudging a jump that would just miss, and a jump aimed past the
// lean limit climbing briefly to a better spot first, as one action.

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

/** Aim with the pointer (it doesn't climb) at `angle`, pressing `pressed`. */
const aimAt = (angle: number, pressed: Action[] = [], move = { x: 0, y: 0 }): InputFrame => ({
  ...NO_INPUT,
  move,
  aimMode: "pointer",
  aim: { x: Math.cos(angle), y: Math.sin(angle) },
  pressed: new Set(pressed),
  held: new Set<Action>(["jump"]),
});

test("a jump within the lean limit goes on the press", () => {
  const { s, w } = start(0);
  const p = w.player;
  const e = w.islands[p.island]!.pointAt(p.s);
  const want = Math.atan2(e.ny, e.nx) + maxLean(w) - 0.1;
  s.step(1 / 60, aimAt(want, ["jump"]));
  expect(p.mode).toBe("air");
  expect(wrapAngle(Math.atan2(p.vy, p.vx) - want)).toBeCloseTo(0, 5);
});

test("a jump aimed a little past the lean limit climbs briefly, then goes along the aim as one action", () => {
  const { s, w } = start(0);
  const p = w.player;
  const e = w.islands[p.island]!.pointAt(p.s);
  const want = Math.atan2(e.ny, e.nx) + maxLean(w) + 0.15;
  s.step(1 / 60, aimAt(want, ["jump"]));
  expect(p.mode).toBe("hang");
  expect(p.jumpQueue).not.toBeNull();
  // Other input while climbing to the spot changes nothing, and another jump press isn't a double jump.
  let frames = 0;
  while (p.mode === "hang" && frames < 30) {
    s.step(1 / 60, aimAt(want + 1, frames === 2 ? ["jump"] : [], { x: -e.tx, y: -e.ty }));
    frames++;
  }
  expect(p.mode).toBe("air");
  expect(frames / 60).toBeLessThanOrEqual(liveParams.move.assist.climbToJump + 2 / 60);
  expect(p.airJumps).toBe(1);
  expect(wrapAngle(Math.atan2(p.vy, p.vx) - want)).toBeCloseTo(0, 5);
  // No speed from the climb: a plain jump's.
  expect(Math.hypot(p.vx, p.vy)).toBeCloseTo(liveParams.move.jump.speed, 0);
});

test("climbing adds the part of the climb along the jump, scaled, to the jump speed", () => {
  const { w } = start(0);
  const j = liveParams.move.jump;
  const climb = liveParams.move.climb.speed;
  const isl = w.player.island;
  const s = w.player.s;
  const e = w.islands[isl]!.pointAt(s);
  const out = Math.atan2(e.ny, e.nx);
  // The way the climb goes along the rim (+s), as an angle; the jump leans 0.5 rad toward it or away.
  const lean = Math.sign(wrapAngle(Math.atan2(e.ty, e.tx) - out)) * 0.5;
  const speed = (angle: number) => {
    const f = launch(w, isl, s, angle, 0, climb);
    return Math.hypot(f.vx, f.vy);
  };
  const along = (angle: number) => e.tx * Math.cos(angle) + e.ty * Math.sin(angle);
  expect(speed(out)).toBeCloseTo(j.speed + climb * along(out) * j.climbFactor, 6);
  expect(along(out)).toBeCloseTo(0, 6);
  expect(speed(out + lean)).toBeCloseTo(j.speed + climb * along(out + lean) * j.climbFactor, 6);
  expect(along(out + lean)).toBeGreaterThan(0.4);
  // Climbing away from the jump adds nothing.
  expect(speed(out - lean)).toBeCloseTo(j.speed, 6);
});

test("the climb speed on the press goes into the jump", () => {
  const { s, w } = start(0);
  const p = w.player;
  const e = w.islands[p.island]!.pointAt(p.s);
  const move = { x: e.tx, y: e.ty };
  s.step(1 / 60, { ...NO_INPUT, move });
  expect(Math.abs(p.climb)).toBeCloseTo(liveParams.move.climb.speed, 0);
  let jumped = 0;
  w.events.on("jump", () => (jumped = Math.hypot(p.vx, p.vy)));
  // Jump leaning with the climb, from where the player is (well within the lean limit).
  const here = w.islands[p.island]!.pointAt(p.s);
  const out = Math.atan2(here.ny, here.nx);
  const lean = Math.sign(wrapAngle(Math.atan2(here.ty * Math.sign(p.climb), here.tx * Math.sign(p.climb)) - out)) * 0.5;
  s.step(1 / 60, aimAt(out + lean, ["jump"], move));
  expect(p.mode).toBe("air");
  expect(jumped).toBeGreaterThan(liveParams.move.jump.speed + 50);
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
