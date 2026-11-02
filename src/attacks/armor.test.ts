import { expect, test } from "bun:test";
import { Hurtable } from "../combat/components";
import { Session } from "../game/session";
import { NO_INPUT, type Action } from "../input/types";
import { liveParams } from "../params/store";

// While attacking, the player has armor: enemy hits don't land, except explosions.

test("hits don't land just after an attack goes off, and do once the armor is gone", () => {
  const s = new Session(liveParams, { skipBriefings: true });
  s.start({ kind: "normal", level: 1, template: null });
  const w = s.world;
  const p = w.player;
  const hurt = p.require(Hurtable);
  const frame = (held: Action[], pressed: Action[] = []) => ({ ...NO_INPUT, pressed: new Set(pressed), held: new Set(held) });
  const blocks: string[] = [];
  w.events.on("block", (e) => blocks.push(e.what));
  s.step(1 / 60, frame(["sword"], ["sword"]));
  s.step(1 / 60, frame([]));
  expect(w.attacks.armored()).toBe(true);
  const hp = w.playerCtl.health.hp;
  expect(hurt.hit({ damage: 5, fromX: p.x + 10, fromY: p.y })).toBe(false);
  expect(w.playerCtl.health.hp).toBe(hp);
  expect(p.stun).toBe(0);
  expect(blocks).toEqual(["armor"]);

  for (let i = 0; i < 60 && w.attacks.armored(); i++) s.step(1 / 60, frame([]));
  expect(w.attacks.armored()).toBe(false);
  expect(hurt.hit({ damage: 5, fromX: p.x + 10, fromY: p.y })).toBe(true);
  expect(w.playerCtl.health.hp).toBe(hp - 5);
});

test("explosions get through the armor", () => {
  const s = new Session(liveParams, { skipBriefings: true });
  s.start({ kind: "normal", level: 1, template: null });
  const w = s.world;
  const p = w.player;
  const hurt = p.require(Hurtable);
  s.step(1 / 60, { ...NO_INPUT, pressed: new Set<Action>(["sword"]), held: new Set<Action>(["sword"]) });
  s.step(1 / 60, NO_INPUT);
  expect(w.attacks.armored()).toBe(true);
  const hp = w.playerCtl.health.hp;
  expect(hurt.hit({ damage: 5, fromX: p.x + 10, fromY: p.y, explosive: true })).toBe(true);
  hurt.push(500, 0, 300, true);
  expect(w.playerCtl.health.hp).toBe(hp - 5);
  expect(p.mode).toBe("air");
});
