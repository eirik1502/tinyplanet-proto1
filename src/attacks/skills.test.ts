import { expect, test } from "bun:test";
import { HitVolume, Hurtable } from "../combat/components";
import { GameObject } from "../core/object";
import { mulberry32 } from "../core/rng";
import { Session } from "../game/session";
import { NO_INPUT, type Action } from "../input/types";
import { makeParams } from "../params/store";
import { scenario } from "../scenarios";
import { ISLAND_TOP } from "../world/island";
import { loadoutFor } from ".";
import { airJumpSpeed, offer, SKILL_IDS, SKILLS, START_SKILLS, type SkillLevels } from "./skills";

// Skills: what's offered after a win, what the loadout gets from them, and the pick between levels.

const maxed = (): SkillLevels => Object.fromEntries(SKILL_IDS.map((id) => [id, SKILLS[id].steps.length]));

test("offers are distinct, and include an unlock while one is left", () => {
  for (let seed = 0; seed < 200; seed++) {
    const o = offer(START_SKILLS, mulberry32(seed));
    expect(o.length).toBe(3);
    expect(new Set(o).size).toBe(3);
    expect(offer({ swipe: 1 }, mulberry32(seed)).some((id) => SKILLS[id].kind === "attack" && id !== "swipe")).toBe(true);
  }
  const all = maxed();
  expect(offer(all, Math.random)).toEqual([]);
  // Only what isn't maxed is left: fewer than three.
  expect(offer({ ...all, spear: 2, landing: 0 }, mulberry32(1)).sort()).toEqual(["landing", "spear"]);
});

test("the sword has only the strikes owned, in combo order", () => {
  const strikes = (s: SkillLevels) => loadoutFor(s).weapons.find((w) => w.id === "sword")?.attacks.map((a) => a.id);
  expect(strikes({ swipe: 1 })).toEqual(["sword.swipe"]);
  expect(strikes({ swipe: 1, poke: 1 })).toEqual(["sword.swipe", "sword.poke"]);
  expect(strikes(START_SKILLS)).toEqual(["sword.swipe", "sword.poke", "sword.smash"]);
  expect(loadoutFor({ swipe: 1 }).weapons.map((w) => w.id)).toEqual(["sword"]);
  expect(loadoutFor(START_SKILLS).weapons.map((w) => w.id)).toEqual(["sword", "lunge", "spear"]);
});

test("upgrades change the stats the attacks read", () => {
  const params = makeParams();
  const session = new Session(params, { skipBriefings: true, seed: 3 });
  session.start({ kind: "normal", level: 1, template: null, skills: { swipe: 4 } });
  const sw = session.world.attacks.stats("sword");
  expect(sw.cooldown).toBeCloseTo(params.player.sword.cooldown * params.skills.swipe.cooldown);
  expect(sw.knockback).toBeCloseTo(params.player.sword.knockback * params.skills.swipe.knockback);
  expect(sw.range).toBeCloseTo(params.player.sword.range * params.skills.swipe.range);
});

test("a win offers skills; the one picked is there on the next level, and stays through a defeat", () => {
  const session = new Session(makeParams(), { seed: 5 });
  session.start({ kind: "normal", level: 1, template: null });
  const confirm = { ...NO_INPUT, pressed: new Set<Action>(["confirm"]) };
  session.closeBriefing();
  session.world.end("victory");
  for (let i = 0; i < 400 && session.state !== "pick"; i++) session.step(1 / 60, NO_INPUT);
  expect(session.state).toBe("pick");
  expect(session.offer.length).toBe(3);
  session.step(1 / 60, { ...NO_INPUT, move: { x: 1, y: 0 } });
  expect(session.choice).toBe(1);
  const picked = session.offer[1]!;
  const before = session.world.skill(picked);
  for (let i = 0; i < 30; i++) session.step(1 / 60, NO_INPUT);
  session.step(1 / 60, confirm);
  expect(session.level).toBe(2);
  expect(session.state).toBe("briefing");
  expect(session.world.skill(picked)).toBe(before + 1);
  expect(session.briefingData().fresh).toContain(picked);

  session.closeBriefing();
  session.world.end("defeat");
  for (let i = 0; i < 400 && session.level === 2 && session.state !== "briefing"; i++) session.step(1 / 60, NO_INPUT);
  expect(session.level).toBe(2);
  expect(session.world.skill(picked)).toBe(before + 1);
});

test("headless, a win picks a skill at random and moves on", () => {
  const session = new Session(makeParams(), { skipBriefings: true, seed: 8 });
  session.start({ kind: "normal", level: 1, template: null });
  session.world.end("victory");
  for (let i = 0; i < 400 && session.level === 1; i++) session.step(1 / 60, NO_INPUT);
  expect(session.level).toBe(2);
  const steps = (skills: SkillLevels) => SKILL_IDS.reduce((n, id) => n + (skills[id] ?? 0), 0);
  expect(steps(session.skills)).toBe(steps(START_SKILLS) + 1);
});

test("the tutorial has every attack, and winning it leads straight to level 1", () => {
  const session = new Session(makeParams(), { skipBriefings: true, seed: 2 });
  session.start({ kind: "normal", level: 0, template: null });
  expect(session.world.attacks.weapons.map((w) => w.attacks.length)).toEqual([3, 1, 1]);
  session.world.end("victory");
  for (let i = 0; i < 400 && session.level === 0; i++) session.step(1 / 60, NO_INPUT);
  expect(session.level).toBe(1);
  expect(SKILL_IDS.filter((id) => session.world.skill(id) > 0)).toEqual(SKILL_IDS.filter((id) => START_SKILLS[id]));
});

test("the lunge reaches halfway further at step 2, twice as far from step 3", () => {
  const params = makeParams();
  const reach = (lv: number) => {
    const s = { ...params.player.lunge };
    SKILLS.lunge.modify!("lunge", s, lv, params);
    return s.maxLength / params.player.lunge.maxLength;
  };
  expect([1, 2, 3, 4].map(reach)).toEqual([1, 1.5, 2, 2]);
});

test("the instant lunge puts the player at the furthest enemy at once, striking the one on the way", () => {
  const params = makeParams();
  const session = new Session(params, { skipBriefings: true, seed: 4 });
  const drill = scenario("melee-drill")!;
  session.start({ kind: "scenario", scenario: { ...drill, spec: { ...drill.spec, skills: { lunge: 4 } } } });
  const w = session.world;
  const p = w.player;
  // In the air, still, with two boids straight ahead.
  const { near, far, frame } = facing(session, 30, 75);
  const hits: string[] = [];
  w.events.on("hit", (e) => hits.push(`${e.target === near.id ? "near" : "far"}:${e.attack}`));
  const blinks: number[] = [];
  w.events.on("blink", (e) => blinks.push(e.toX - e.x));
  session.step(1 / 60, frame(["lunge"], ["lunge"]));
  const x0 = p.x;
  session.step(1 / 60, frame([], []));
  expect(blinks.length).toBe(1);
  expect(p.x - x0).toBeGreaterThan(20);
  expect(Math.hypot(p.vx, p.vy)).toBeCloseTo(0.35 * params.player.lunge.lungeSpeed, 0);
  for (let i = 0; i < 3; i++) session.step(1 / 60, frame([], []));
  expect(hits).toContain("near:lunge");
  expect(hits).toContain("far:lunge");
});

test("the spear pierces more enemies at steps 2 and 4, each for less damage, and burns from step 3", () => {
  const params = makeParams();
  const k = params.skills.spear;
  const first = (n: number) => Array.from({ length: n }, (_, i) => i);
  const throwThrough = (spear: number) => {
    const session = new Session(params, { skipBriefings: true, seed: 3 });
    session.start({ kind: "normal", level: 1, template: null, skills: { swipe: 1, spear } });
    const w = session.world;
    for (const [o, h] of w.objects.query(Hurtable)) if (h.team === "swarm") w.objects.destroy(o);
    // A row of dummies ahead, then a spear thrown down it.
    const hit: number[] = [];
    const damage: number[] = [];
    for (let i = 0; i < 7; i++) {
      const o = w.objects.add(new GameObject("dummy"));
      Object.assign(o, { x: 1000 + 40 * i, y: 0, alt: 50 });
      o.add(Hurtable, {
        team: "swarm",
        hurtbox: () => ({ x: o.x, y: o.y, alt: o.alt, radius: 8 }),
        targetable: () => true,
        hit: (h) => (hit.push(i), damage.push(h.damage), true),
        push: () => {},
      });
    }
    const sp = w.attacks.stats("spear");
    w.combat.spawnVolume(
      { team: "player", owner: 0, attack: "spear", shape: { radius: sp.hitRadius }, damage: 1, power: 0, active: Infinity, age: 0, hits: new Set(), falloff: sp.falloff, minDamage: sp.minDamage, projectile: { life: 5, scale: 1, pierce: sp.pierce, flame: sp.flame } },
      { x: 940, y: 0, alt: 50, vx: 300, vy: 0 },
    );
    for (let i = 0; i < 120; i++) w.combat.update(1 / 60);
    return { hit, damage, sp };
  };
  expect(throwThrough(1).hit).toEqual(first(params.player.spear.pierce));
  expect(throwThrough(1).sp.flame).toBe(0);
  expect(throwThrough(2).hit).toEqual(first(k.pierce));
  const s3 = throwThrough(3);
  expect(s3.hit).toEqual(first(k.pierce));
  expect(s3.sp.flame).toBeGreaterThan(0);
  expect(s3.sp.speed * s3.sp.life).toBeCloseTo(params.player.spear.speed * params.player.spear.life * k.range);
  const s4 = throwThrough(4);
  expect(s4.hit).toEqual(first(k.maxPierce));
  // Less for each enemy gone through, down to a floor.
  s4.damage.forEach((d, i) => expect(d).toBeCloseTo(Math.max(params.player.spear.minDamage, 1 - params.player.spear.falloff * i)));
  expect(s4.sp.hitRadius).toBeCloseTo(params.player.spear.hitRadius * k.size);
  expect(s4.sp.size).toBe(params.player.spear.size);
});

test("every landing blasts, bigger the faster; the landslide bounces rocks off the edge, more and faster the harder", () => {
  const params = makeParams();
  const k = params.skills.landing;
  // `tilt`: how far the landing leans from straight into the rim (radians, toward its tangent).
  const land = (landing: number, speed: number, tilt = 0) => {
    const session = new Session(params, { skipBriefings: true, seed: 3 });
    session.start({ kind: "normal", level: 1, template: null, skills: { swipe: 1, landing } });
    const w = session.world;
    const p = w.player;
    const blasts: number[] = [];
    w.events.on("blast", (e) => blasts.push(e.radius));
    const e = w.islands[p.island]!.pointAt(p.s);
    const vx = (-e.nx * Math.cos(tilt) + e.tx * Math.sin(tilt)) * speed;
    const vy = (-e.ny * Math.cos(tilt) + e.ty * Math.sin(tilt)) * speed;
    w.events.emit("land", { source: p.id, x: e.x, y: e.y, alt: ISLAND_TOP, speed, vx, vy });
    const rocks = w.objects.query(HitVolume).filter(([, v]) => v.attack === "landing.rock");
    // All headed out, away from the island; on average along the edge as the landing was.
    for (const [o] of rocks) expect(o.vx * e.nx + o.vy * e.ny).toBeGreaterThan(0);
    const along = rocks.reduce((sum, [o]) => sum + (o.vx * e.tx + o.vy * e.ty) / Math.hypot(o.vx, o.vy), 0) / Math.max(1, rocks.length);
    const fastest = Math.max(0, ...rocks.map(([o]) => Math.hypot(o.vx, o.vy)));
    return { blast: blasts[0], rocks: rocks.length, along, fastest };
  };
  expect(land(1, 50).blast).toBeCloseTo((k.radius * 50) / k.refSpeed);
  expect(land(1, k.refSpeed).blast).toBeCloseTo(k.radius);
  expect(land(1, 5000).blast).toBeCloseTo(k.radius * k.maxScale);
  expect(land(1, k.refSpeed).rocks).toBe(0);
  expect(land(2, k.refSpeed).rocks).toBe(k.rocks);
  expect(land(3, k.refSpeed).rocks).toBe(k.rocksUp);
  expect(land(3, 5000).rocks).toBe(k.rocksUp);
  // A soft landing: fewer, slower rocks.
  const soft = land(3, k.refSpeed / 3);
  expect(soft.rocks).toBe(Math.round(k.rocksUp / 3));
  expect(soft.fastest).toBeLessThanOrEqual((k.rockSpeed / 3) * (1 + k.rockJitter));
  // Landing leaning one way along the edge throws the rocks on along it.
  expect(land(3, k.refSpeed, 0.6).along).toBeGreaterThan(0.2);
  expect(land(3, k.refSpeed, -0.6).along).toBeLessThan(-0.2);
});

test("the double jump's strike follows the player, throws enemies aside for less and less, armors, and doesn't refill the jump", () => {
  const params = makeParams();
  const k = params.skills.jumpForce;
  const strike = (jumpForce: number) => {
    const session = new Session(params, { skipBriefings: true, seed: 3 });
    session.start({ kind: "normal", level: 1, template: null, skills: { swipe: 1, jumpForce } });
    const w = session.world;
    const p = w.player;
    for (const [o, h] of w.objects.query(Hurtable)) if (h.team === "swarm") w.objects.destroy(o);
    w.playerCtl.leaveRim(0, 0, 0);
    p.alt += 200;
    Object.assign(p, { vx: 300, vy: 0, vz: 0 });
    // Dummies just beside the flight's line, a little ahead.
    const pushes: { vx: number; vy: number }[] = [];
    const damage: number[] = [];
    for (let i = 0; i < 5; i++) {
      const d = w.objects.add(new GameObject("dummy"));
      Object.assign(d, { x: p.x + 8, y: p.y + 3, alt: p.alt });
      d.add(Hurtable, {
        team: "swarm",
        hurtbox: () => ({ x: d.x, y: d.y, alt: d.alt, radius: 8 }),
        targetable: () => true,
        hit: (h) => (damage.push(h.damage), w.events.emit("hit", { source: h.source, target: d.id, x: d.x, y: d.y, alt: d.alt, kind: "melee", damage: h.damage, killed: false, weapon: h.weapon, attack: h.attack }), true),
        push: (vx, vy) => pushes.push({ vx, vy }),
      });
    }
    w.events.emit("doubleJump", { source: p.id, x: p.x, y: p.y, alt: p.alt });
    p.airJumps = 0;
    const [, v] = w.objects.query(HitVolume).find(([, v]) => v.attack === "jumpForce")!;
    const armored = w.attacks.armored();
    for (let i = 0; i < 10; i++) w.combat.update(1 / 60);
    return { radius: v.shape.radius, armored, pushes, damage, airJumps: p.airJumps, speed: airJumpSpeed(w) };
  };
  const s1 = strike(1);
  expect(s1.radius).toBe(k.radius);
  expect(s1.armored).toBe(true);
  // Each hit once, thrown aside (to +y, the side they were on), for 25% less each down to 25%,
  // and the jump stays used.
  expect(s1.pushes.length).toBe(5);
  expect(s1.pushes[0]!.vy).toBeCloseTo(k.push);
  s1.damage.forEach((d, i) => expect(d).toBeCloseTo(k.damage * [1, 0.75, 0.5, 0.25, 0.25][i]!));
  expect(s1.airJumps).toBe(0);
  expect(strike(2).radius).toBeCloseTo(k.radius * k.growth);
  expect(strike(2).speed).toBe(params.move.airJump.speed);
  expect(strike(3).speed).toBeCloseTo(params.move.airJump.speed * k.speed);
});

/** The player in the air, still, with two boids straight ahead `nearX` and `farX` away (the rest far off). */
function facing(session: Session, nearX: number, farX: number) {
  const w = session.world;
  const p = w.player;
  w.playerCtl.leaveRim(0, 0, 0);
  p.alt += 60;
  const [near, far] = w.swarm.boids.filter((b) => b !== w.swarm.queen && b.hp > 0);
  for (const b of w.swarm.boids) if (b !== near && b !== far) b.x += 5000;
  Object.assign(near!, { x: p.x + nearX, y: p.y, alt: p.alt, vx: 0, vy: 0 });
  Object.assign(far!, { x: p.x + farX, y: p.y, alt: p.alt, vx: 0, vy: 0 });
  near!.hp = far!.hp = 100;
  const frame = (pressed: Action[], held: Action[]) => ({ ...NO_INPUT, aimMode: "pointer" as const, aim: { x: 1, y: 0 }, pressed: new Set(pressed), held: new Set(held) });
  return { near: near!, far: far!, frame };
}

test("a swipe or poke that hits is followed by the short step cooldown, a miss or the smash by the full one", () => {
  const params = makeParams();
  const session = new Session(params, { skipBriefings: true, seed: 4 });
  const drill = scenario("melee-drill")!;
  session.start({ kind: "scenario", scenario: { ...drill, spec: { ...drill.spec, skills: START_SKILLS } } });
  const w = session.world;
  const { near, frame } = facing(session, 30, 3000);
  const keep = () => Object.assign(w.player, { vx: 0, vy: 0, vz: 0 }) && Object.assign(near, { x: w.player.x + 30, y: w.player.y, alt: w.player.alt, vx: 0, vy: 0 });
  /** Strike once, and how long (real s) until the sword is ready again. */
  const strike = () => {
    session.step(1 / 60, frame(["sword"], ["sword"]));
    session.step(1 / 60, frame([], []));
    let t = 0;
    while (!w.attacks.ready("sword") && t < 2) session.step(1 / 60, frame([], [])), keep(), (t += 1 / 60);
    return t;
  };
  const sw = params.player.sword;
  const steps: string[] = [];
  w.events.on("attack", (e) => steps.push(e.attack));
  expect(strike()).toBeLessThan(sw.stepCooldown + 0.05);
  expect(strike()).toBeLessThan(sw.stepCooldown + 0.05);
  expect(strike()).toBeGreaterThan(sw.cooldown - 0.05);
  expect(steps).toEqual(["sword.swipe", "sword.poke", "sword.smash"]);
  // A miss: the full cooldown.
  near.x += 3000;
  const miss = () => {
    session.step(1 / 60, frame(["sword"], ["sword"]));
    session.step(1 / 60, frame([], []));
    let t = 0;
    while (!w.attacks.ready("sword") && t < 2) session.step(1 / 60, frame([], [])), (t += 1 / 60);
    return t;
  };
  expect(miss()).toBeGreaterThan(sw.cooldown - 0.05);
});

test("the poke stuns from step 3, twice as long at step 4", () => {
  const params = makeParams();
  const stun = (lv: number) => {
    const s = { ...params.player.poke };
    SKILLS.poke.modify!("poke", s, lv, params);
    return s.stun;
  };
  const k = params.skills.poke;
  expect([1, 2, 3, 4].map(stun)).toEqual([0, 0, k.stun, k.stun * k.stunUp]);
});
