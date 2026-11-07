import { wrapAngle } from "../core/math";
import { Hurtable } from "../combat/components";
import { component, GameObject } from "../core/object";
import { mulberry32, type Rng } from "../core/rng";
import type { World } from "../game/world";
import type { Params } from "../params/store";
import type { StatGroup } from "./types";

// Skills: what the player builds up over a run. After each level they pick one of three offered
// skills, and it goes up a step. Attack skills start at the attack itself (step 1 unlocks it),
// then three upgrades; passive skills add to the movement abilities in three steps. A skill
// changes stats (`modify`, for the attacks' stat groups), adds behaviour by listening to the
// world's events (`install`), keeps a system of its own going (`update`), or is read where it
// matters (the thrust's lunge, the double jump's speed). Its numbers are the `skills.*` params.

export type SkillId = "swipe" | "thrust" | "smash" | "spear" | "landing" | "safetyDoom" | "jumpForce";
/** Each skill's step: 0 (or missing) is not owned. */
export type SkillLevels = Partial<Record<SkillId, number>>;
export type SkillIcon = "sword" | "lunge" | "smash" | "spear" | "landing" | "net" | "jump";

export interface Skill {
  id: SkillId;
  name: string;
  /** Attacks: step 1 unlocks it. Passives: upgrade the movement abilities. */
  kind: "attack" | "passive";
  /** Offered only once this one is owned. */
  requires?: SkillId;
  icon: SkillIcon;
  /** What each step adds, in a few words. */
  steps: string[];
  /** Change a stat group's values (a copy) before an attack or indicator reads them. */
  modify?(group: StatGroup, s: Record<string, number>, level: number, params: Params): void;
  /** Add behaviour to a world: listen to its events (with `owner: world.lifetime`). */
  install?(w: World, level: number): void;
  /** Every world step, after the swarm moved. */
  update?(w: World, dt: number, level: number): void;
}

/** The skill levels a normal run starts with. */
export const START_SKILLS: SkillLevels = { swipe: 1 };

export const level = (skills: SkillLevels, id: SkillId) => skills[id] ?? 0;

const scale = (s: Record<string, number>, keys: string[], k: number) => {
  for (const key of keys) s[key] = s[key]! * k;
};

/**
 * A blast of the player's around (x, y): hurts and throws back every enemy within `radius`, more
 * the closer. `stun` staggers the boids it reaches.
 */
function playerBlast(w: World, x: number, y: number, alt: number, o: { radius: number; damage: number; push: number; kind: string; stun?: number }) {
  const p = w.player;
  w.events.emit("blast", { source: p.id, x, y, alt, radius: o.radius, kind: o.kind });
  w.combat.blast({ x, y, alt, radius: o.radius }, "player", (t, h) => {
    const dx = t.x - x;
    const dy = t.y - y;
    const d = Math.hypot(dx, dy) || 1;
    const near = 1 - Math.min(1, d / o.radius);
    h.hit({ damage: o.damage * near, fromX: x, fromY: y, source: p.id, weapon: "blast", attack: o.kind, stun: o.stun });
    h.push((dx / d) * o.push * (0.5 + 0.5 * near), (dy / d) * o.push * (0.5 + 0.5 * near), 0);
  });
}

// ---------------------------------------------------------------------------------------------
// Attacks
// ---------------------------------------------------------------------------------------------

const SWIPE: Skill = {
  id: "swipe",
  name: "Swipe",
  kind: "attack",
  icon: "sword",
  steps: ["A wide sword swipe.", "The sword recovers faster.", "The swipe throws enemies further.", "The swipe reaches further."],
  modify(group, s, lv, params) {
    const k = params.skills.swipe;
    if (group !== "sword") return;
    if (lv >= 2) scale(s, ["cooldown"], k.cooldown);
    if (lv >= 3) scale(s, ["knockback"], k.knockback);
    if (lv >= 4) scale(s, ["range", "maxRange"], k.range);
  },
};

const THRUST: Skill = {
  id: "thrust",
  name: "Lunging thrust",
  kind: "attack",
  icon: "lunge",
  steps: [
    "Hit with the swipe to chain a thrust that lunges at the closest enemy in reach.",
    "The lunge goes through to the furthest enemy, striking all on the way.",
    "The lunge is instant.",
    "The thrust reaches twice as far.",
  ],
  modify(group, s, lv, params) {
    if (group === "thrust" && lv >= 4) scale(s, ["length", "maxLength"], params.skills.thrust.range);
  },
};

const SMASH: Skill = {
  id: "smash",
  name: "Smash",
  kind: "attack",
  requires: "thrust",
  icon: "smash",
  steps: [
    "Hit with the thrust to chain a smash, whose blast throws back everything around it.",
    "The smash's blast is bigger.",
    "The smash itself is bigger.",
    "The smash's blast throws three times as hard.",
  ],
  modify(group, s, lv, params) {
    const k = params.skills.smash;
    if (group !== "smash") return;
    if (lv >= 2) scale(s, ["blastRadius"], k.blastRadius);
    if (lv >= 3) scale(s, ["size", "maxSize"], k.size);
    if (lv >= 4) scale(s, ["blastPush"], k.blastPush);
  },
};

const SPEAR: Skill = {
  id: "spear",
  name: "Spear",
  kind: "attack",
  icon: "spear",
  steps: ["Spear", "Piercing arrow", "Faster and further", "Bigger and stronger"],
  modify(group, s, lv, params) {
    const k = params.skills.spear;
    if (group !== "spear") return;
    if (lv >= 2) s.pierce = Math.max(s.pierce!, k.pierce);
    if (lv >= 3) {
      scale(s, ["speed", "maxSpeed"], k.speed);
      scale(s, ["life"], k.range / k.speed);
      s.flame = Math.max(s.flame!, 1);
    }
    // Bigger to hit and in flame, not the spear itself.
    if (lv >= 4) {
      scale(s, ["hitRadius", "flame"], k.size);
      s.pierce = Math.max(s.pierce!, k.maxPierce);
    }
  },
};

// ---------------------------------------------------------------------------------------------
// Passives
// ---------------------------------------------------------------------------------------------

const LANDING: Skill = {
  id: "landing",
  name: "Landing hard",
  kind: "passive",
  icon: "landing",
  steps: ["Land hard with a shockwave.", "Landslide.", "Landings stun the enemies they throw, throw harder, and the landslide doubles."],
  install(w, lv) {
    const k = w.params.skills.landing;
    const p = w.player;
    const rand = mulberry32(w.planet.seed ^ 0x2c1b3c6d);
    w.events.on(
      "land",
      (e) => {
        // The faster the landing, the bigger the blast: full at `refSpeed`, about what a
        // jump and a double jump the same way reach.
        const f = Math.min(k.maxScale, e.speed / k.refSpeed);
        playerBlast(w, e.x, e.y, e.alt, {
          radius: k.radius * f,
          damage: k.damage * f,
          push: k.push * f * (lv >= 3 ? k.pushUp : 1),
          stun: lv >= 3 ? k.stun : undefined,
          kind: "landing",
        });
        if (lv < 2) return;
        // Rocks knocked off the rim: the landing bounced off the edge (straight back from a
        // straight landing), fanned out, but never back into the island. Fewer, slower and weaker
        // the softer the landing.
        const rim = w.islands[p.island]!.pointAt(p.s);
        const out = Math.atan2(rim.ny, rim.nx);
        const into = e.vx * rim.nx + e.vy * rim.ny;
        const bounce = Math.hypot(e.vx, e.vy) > 1 ? wrapAngle(Math.atan2(e.vy - 2 * into * rim.ny, e.vx - 2 * into * rim.nx) - out) : 0;
        const g = Math.min(1, e.speed / k.refSpeed);
        const n = Math.max(1, Math.round((lv >= 3 ? k.rocksUp : k.rocks) * g));
        const edge = ((90 - k.rockEdge) * Math.PI) / 180;
        const cone = (k.rockCone * Math.PI) / 180;
        const jitter = (k.rockAngleJitter * Math.PI) / 180;
        for (let i = 0; i < n; i++) {
          // Evenly across the cone, each nudged a little.
          const spread = ((i + 0.5) / n - 0.5) * cone + (rand() - 0.5) * 2 * jitter;
          const a = out + Math.max(-edge, Math.min(edge, bounce + spread));
          const v = k.rockSpeed * g * (1 - k.rockJitter + rand() * 2 * k.rockJitter);
          w.combat.spawnVolume(
            {
              team: "player",
              owner: p.id,
              attack: "landing.rock",
              weapon: "rock",
              shape: { radius: k.rockRadius },
              damage: k.rockDamage * g,
              power: 0,
              active: Infinity,
              age: 0,
              projectile: { life: k.rockLife, scale: 0.7 + rand() * 0.6, gravity: k.rockGravity },
              hits: new Set(),
            },
            { x: e.x + rim.nx * 8, y: e.y + rim.ny * 8, alt: e.alt + 6, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vz: k.rockLift * (0.5 + rand()) },
          );
        }
      },
      { source: p.id, owner: w.lifetime },
    );
  },
};

/** A black hole left by the safety bounce: it pulls enemies in, then blows up. */
interface BlackHole {
  t: number;
  delay: number;
  pullRadius: number;
  radius: number;
  push: number;
}
const BlackHole = component<BlackHole>("blackHole");

const SAFETY_DOOM: Skill = {
  id: "safetyDoom",
  name: "Safety doom",
  kind: "passive",
  icon: "net",
  steps: [
    "The safety bounce explodes, hurting what's around you.",
    "It leaves a black hole that pulls enemies in, then explodes.",
    "The black hole pulls from further, and explodes harder.",
  ],
  install(w, lv) {
    const k = w.params.skills.safetyDoom;
    const grow = lv >= 3 ? k.growth : 1;
    w.events.on(
      "netBounce",
      (e) => {
        if (lv < 2) {
          playerBlast(w, e.x, e.y, e.alt, { radius: k.radius, damage: k.damage, push: k.push, kind: "safetyDoom" });
          return;
        }
        const o = w.objects.add(new GameObject("blackHole"));
        Object.assign(o, { x: e.x, y: e.y, alt: e.alt });
        const hole = o.add(BlackHole, { t: 0, delay: k.delay, pullRadius: k.pullRadius * grow, radius: k.radius * grow, push: k.push * grow });
        w.events.emit("blackHole", { source: w.player.id, x: o.x, y: o.y, alt: o.alt, radius: hole.pullRadius, dur: hole.delay });
      },
      { source: w.player.id, owner: w.lifetime },
    );
  },
  update(w, dt) {
    const k = w.params.skills.safetyDoom;
    for (const [o, hole] of w.objects.query(BlackHole)) {
      hole.t += dt;
      if (hole.t >= hole.delay) {
        playerBlast(w, o.x, o.y, o.alt, { radius: hole.radius, damage: k.damage, push: hole.push, kind: "safetyDoom" });
        w.objects.destroy(o);
        continue;
      }
      // Pull harder the closer they are.
      w.combat.blast({ x: o.x, y: o.y, alt: o.alt, radius: hole.pullRadius }, "player", (t, h) => {
        const dx = o.x - t.x;
        const dy = o.y - t.y;
        const d = Math.hypot(dx, dy) || 1;
        const pull = k.pull * dt * (0.4 + 0.6 * (1 - Math.min(1, d / hole.pullRadius)));
        h.push((dx / d) * Math.min(pull, d / Math.max(dt, 1e-3)), (dy / d) * Math.min(pull, d / Math.max(dt, 1e-3)), 0);
      });
    }
  },
};

const JUMP_FORCE: Skill = {
  id: "jumpForce",
  name: "Jump force",
  kind: "passive",
  icon: "jump",
  steps: ["The double jump strikes the enemies you fly through, throwing them aside.", "The strike is bigger.", "The double jump is faster."],
  install(w, lv) {
    const k = w.params.skills.jumpForce;
    const p = w.player;
    // A blade around the player for a while after the double jump, with armor as long. Its hits
    // don't refill the double jump (see the player controller).
    w.events.on(
      "doubleJump",
      (e) => {
        w.combat.spawnVolume(
          {
            team: "player",
            owner: p.id,
            attack: "jumpForce",
            weapon: "jumpForce",
            shape: { radius: k.radius * (lv >= 2 ? k.growth : 1) },
            damage: k.damage,
            falloff: k.falloff,
            minDamage: k.minDamage,
            knockback: 0,
            follow: p.id,
            power: 0,
            active: k.time,
            age: 0,
            hits: new Set(),
          },
          e,
        );
        w.attacks.armorFor(k.time);
      },
      { source: p.id, owner: w.lifetime },
    );
    // Aside: away from the line of the flight, on whichever side the enemy is, and a little along.
    w.events.on(
      "hit",
      (e) => {
        if (e.attack !== "jumpForce") return;
        const h = w.objects.get(e.target)?.get(Hurtable);
        if (!h) return;
        const sp = Math.hypot(p.vx, p.vy);
        const dx = sp > 1 ? p.vx / sp : Math.cos(p.facing);
        const dy = sp > 1 ? p.vy / sp : Math.sin(p.facing);
        const side = dx * (e.y - p.y) - dy * (e.x - p.x) >= 0 ? 1 : -1;
        h.push(-dy * side * k.push + dx * k.push * 0.25, dx * side * k.push + dy * k.push * 0.25, 0);
      },
      { source: p.id, owner: w.lifetime },
    );
  },
};

/** Every skill, in the order the briefing and the dev panel list them. */
export const SKILLS: Record<SkillId, Skill> = Object.fromEntries(
  [SWIPE, THRUST, SMASH, SPEAR, LANDING, SAFETY_DOOM, JUMP_FORCE].map((s) => [s.id, s]),
) as Record<SkillId, Skill>;
export const SKILL_IDS = Object.keys(SKILLS) as SkillId[];

/** The double jump's sideways speed with the skills. */
export function airJumpSpeed(w: World) {
  const base = w.params.move.airJump.speed;
  return w.skill("jumpForce") >= 3 ? base * w.params.skills.jumpForce.speed : base;
}

// ---------------------------------------------------------------------------------------------
// Offers
// ---------------------------------------------------------------------------------------------

/** Whether `id` can go up a step: not maxed, and what it needs is owned. */
export function canUpgrade(skills: SkillLevels, id: SkillId) {
  const s = SKILLS[id];
  return level(skills, id) < s.steps.length && (!s.requires || level(skills, s.requires) > 0);
}

/**
 * Up to `n` different skills to choose from, each at its next step. While an attack can still be
 * unlocked, at least one of them is an unlock.
 */
export function offer(skills: SkillLevels, rand: Rng, n = 3): SkillId[] {
  const open = SKILL_IDS.filter((id) => canUpgrade(skills, id));
  for (let i = open.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [open[i], open[j]] = [open[j]!, open[i]!];
  }
  const out = open.slice(0, n);
  const isUnlock = (id: SkillId) => SKILLS[id].kind === "attack" && level(skills, id) === 0;
  const unlock = open.find(isUnlock);
  if (unlock && !out.some(isUnlock)) out[out.length - 1] = unlock;
  return out;
}

/** Skill levels from text like "swipe=2,spear=1" (unknown skills and bad steps throw). */
export function parseSkills(text: string): SkillLevels {
  const out: SkillLevels = {};
  for (const part of text.split(",").filter(Boolean)) {
    const [id, v] = part.split("=");
    const n = Number(v ?? 1);
    if (!(id! in SKILLS) || !Number.isInteger(n) || n < 0 || n > SKILLS[id as SkillId].steps.length) throw new Error(`bad skill "${part}"`);
    out[id as SkillId] = n;
  }
  return out;
}

/** Skill levels as text, "swipe 2 · spear 1". */
export const describeSkills = (skills: SkillLevels) =>
  SKILL_IDS.filter((id) => level(skills, id) > 0)
    .map((id) => `${id} ${level(skills, id)}`)
    .join(" · ");
