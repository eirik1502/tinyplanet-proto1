import { expect, test } from "bun:test";
import { Hurtable } from "../combat/components";
import { Session } from "../game/session";
import { NO_INPUT, type Action, type InputFrame } from "../input/types";
import { liveParams } from "../params/store";
import { ISLAND_TOP } from "../world/island";
import { launch, stepFlight } from "./flight";

// Being hit stuns the player, longer the harder they're thrown: no climbing, jumping or
// attacking meanwhile, but steering in the air still works.

function start() {
  const s = new Session(liveParams, { skipBriefings: true, seed: 3 });
  s.start({ kind: "normal", level: 1, template: null });
  const w = s.world;
  const p = w.player;
  const hurt = p.require(Hurtable);
  const frame = (pressed: Action[] = [], move = { x: 0, y: 0 }): InputFrame => ({ ...NO_INPUT, move, pressed: new Set(pressed), held: new Set(pressed) });
  return { s, w, p, hurt, frame };
}

test("a hit on a rim stuns: no climbing or jumping until it wears off", () => {
  const { s, w, p, hurt, frame } = start();
  hurt.hit({ damage: 1, fromX: p.x, fromY: p.y });
  expect(p.stun).toBeCloseTo(liveParams.player.stun.min);
  const e = w.islands[p.island]!.pointAt(p.s);
  const s0 = p.s;
  s.step(1 / 60, frame(["jump", "sword"], { x: e.tx, y: e.ty }));
  expect(p.mode).toBe("hang");
  expect(p.s).toBe(s0);
  expect(w.attacks.aim).toBeNull();
  for (let i = 0; i < 60 && p.stun > 0; i++) s.step(1 / 60, frame());
  expect(p.stun).toBe(0);
  s.step(1 / 60, frame(["jump"]));
  expect(p.mode).toBe("air");
});

test("a hard throw stuns longer, steering still turns the flight, and it flies over islands", () => {
  const { s, w, p, hurt, frame } = start();
  const e = w.islands[p.island]!.pointAt(p.s);
  hurt.push(e.nx * 950, e.ny * 950, 520, true);
  const st = liveParams.player.stun;
  expect(p.stun).toBeCloseTo(Math.min(st.max, st.min + 950 * st.perSpeed));
  expect(p.stun).toBeGreaterThan(0.8);
  s.step(1 / 60, frame());
  const heading = Math.atan2(p.vy, p.vx);
  for (let i = 0; i < 5; i++) s.step(1 / 60, frame(["jump"], { x: -e.ny, y: e.nx }));
  expect(p.mode).toBe("air");
  expect(p.airJumps).toBe(1);
  expect(Math.abs(Math.atan2(p.vy, p.vx) - heading)).toBeGreaterThan(0.1);

  // High and fast: across an island's rim without grabbing it. Low or slow: grabs it.
  const isl = w.islands[p.island]!;
  for (const [alt, speed, grabs] of [
    [ISLAND_TOP + 120, 800, false],
    [ISLAND_TOP + 20, 800, true],
    [ISLAND_TOP + 120, 300, true],
  ] as const) {
    const f = launch(w, p.island, p.s, Math.atan2(-e.ny, -e.nx), 0);
    Object.assign(f, { alt, vz: 0, vx: -e.nx * speed, vy: -e.ny * speed, x: e.x + e.nx * 30, y: e.y + e.ny * 30 });
    let hit = null;
    for (let i = 0; i < 10 && !hit && !isl.contains(f.x, f.y); i++) hit = stepFlight(w, f, 1 / 60, -1);
    expect(hit !== null).toBe(grabs);
  }
});
