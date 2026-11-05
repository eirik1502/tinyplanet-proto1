import { HitVolume } from "../combat/components";
import type { Hitbox } from "../combat/hitbox";
import { lerp } from "../core/math";
import type { GameObject } from "../core/object";
import type { AttackContext, AttackDef, Weapon } from "./types";

// The sword strikes in a 1-2-3 combo: a hit opens a short window in which the next strike is the
// next one along, else it starts over. 1 is the swipe (a sector); 2 a long, thin thrust (a
// rectangle) that lunges at the closest enemy in its reach and strikes once near it; 3 a small,
// strong smash (a square) whose blast hurts and throws back everything else around it. The combo
// has only the strikes the skills unlocked (attacks/index.ts).

export const SWIPE: AttackDef = {
  id: "sword.swipe",
  name: "Swipe",
  indicator(stats, power) {
    const sw = stats("sword");
    return [{ kind: "fan", radius: lerp(sw.range, sw.maxRange, power), arc: sw.arc }];
  },
  release(c) {
    const sw = c.stats("sword");
    const range = lerp(sw.range, sw.maxRange, c.power);
    c.spawn({
      attack: "sword.swipe",
      step: 1,
      shape: { radius: range, sector: { dx: c.dx, dy: c.dy, arc: sw.arc } },
      damage: lerp(sw.damage, sw.maxDamage, c.power),
      knockback: sw.knockback,
      active: sw.activeTime,
      blocks: true,
    });
    c.describe(range);
  },
};

/** The thrust's rectangle along the aim, its full reach unless `length` is given. */
function thrust(c: AttackContext, length?: number) {
  const t = c.stats("thrust");
  length ??= lerp(t.length, t.maxLength, c.power);
  c.spawn({
    attack: "sword.thrust",
    step: 2,
    shape: { radius: length, rect: { dx: c.dx, dy: c.dy, length, halfWidth: t.width / 2 } },
    damage: lerp(t.damage, t.maxDamage, c.power),
    active: c.stats("sword").activeTime,
    blocks: true,
  });
  c.describe(length, t.width / 2);
}

export const THRUST: AttackDef = {
  id: "sword.thrust",
  name: "Lunging thrust",
  indicator(stats, power) {
    const t = stats("thrust");
    return [{ kind: "rect", length: lerp(t.length, t.maxLength, power), halfWidth: t.width / 2 }];
  },
  release(c) {
    // Lunge at the closest enemy in its reach, and strike once near it; with none, strike at once.
    // Upgraded, it goes through to the furthest one, striking all on the way, and then instantly.
    const t = c.stats("thrust");
    const length = lerp(t.length, t.maxLength, c.power);
    const reach = { x: c.x, y: c.y, alt: c.alt, radius: length, rect: { dx: c.dx, dy: c.dy, length, halfWidth: t.width / 2 } };
    const through = c.skill("thrust") >= 2;
    const target = through ? furthestIn(c, reach) : c.world.combat.closestIn(reach, "player");
    if (!target) return thrust(c);
    const instant = c.skill("thrust") >= 3;
    if (through) {
      // What it passes on the way is struck too (the target gets the strike): by a blade around
      // the player through the lunge, or for an instant one, along the line it skips.
      const d = Math.hypot(target.x - c.x, target.y - c.y);
      const ux = (target.x - c.x) / (d || 1);
      const uy = (target.y - c.y) / (d || 1);
      const halfWidth = t.width / 2 + 10;
      const v = c.spawn({
        attack: "sword.thrust",
        step: 2,
        damage: lerp(t.damage, t.maxDamage, c.power),
        ...(instant
          ? { shape: { radius: d, rect: { dx: ux, dy: uy, length: d, halfWidth } }, active: c.stats("sword").activeTime }
          : { shape: { radius: halfWidth }, active: Math.min(t.lungeTime, d / t.lungeSpeed) + 0.05, follow: c.player.id }),
      });
      v.require(HitVolume).hits.add(target.id);
    }
    const strike = (s: AttackContext) => thrust(s, s.stats("thrust").strikeLength);
    if (instant) return c.blink(target, { speed: t.lungeSpeed, strikeDistance: t.strikeDistance, strike });
    c.lunge(target, { speed: t.lungeSpeed, maxTime: t.lungeTime, strikeDistance: t.strikeDistance, strike });
  },
};

/** The furthest (on the plane) of the enemies inside `hit`. */
function furthestIn(c: AttackContext, hit: Hitbox): GameObject | null {
  let best: GameObject | null = null;
  let bestD = -1;
  for (const [o] of c.world.combat.touching(hit, "player")) {
    const d = Math.hypot(o.x - hit.x, o.y - hit.y);
    if (d > bestD) {
      best = o;
      bestD = d;
    }
  }
  return best;
}

export const SMASH: AttackDef = {
  id: "sword.smash",
  name: "Smash",
  indicator(stats, power) {
    const sm = stats("smash");
    const size = lerp(sm.size, sm.maxSize, power);
    return [
      { kind: "rect", length: size, halfWidth: size / 2 },
      { kind: "circle", x: size / 2, radius: sm.blastRadius, dashed: true },
    ];
  },
  release(c) {
    const sm = c.stats("smash");
    const size = lerp(sm.size, sm.maxSize, c.power);
    const square = { radius: size, rect: { dx: c.dx, dy: c.dy, length: size, halfWidth: size / 2 } };
    c.spawn({
      attack: "sword.smash",
      step: 3,
      shape: square,
      damage: lerp(sm.damage, sm.maxDamage, c.power),
      active: c.stats("sword").activeTime,
      blocks: true,
    });
    c.describe(size, size / 2);

    // The blast from the square's centre: whatever the square itself hits takes that hit instead.
    const w = c.world;
    const cx = c.x + (c.dx * size) / 2;
    const cy = c.y + (c.dy * size) / 2;
    const R = sm.blastRadius;
    w.events.emit("smash", { source: c.player.id, x: cx, y: cy, alt: c.alt, radius: R });
    const squareBox = { x: c.x, y: c.y, alt: c.alt, ...square };
    w.combat.blast({ x: cx, y: cy, alt: c.alt, radius: R }, "player", (o, h) => {
      if (w.combat.overlaps(squareBox, h.hurtbox())) return;
      const r = h.hurtbox().radius;
      const ox = o.x - cx;
      const oy = o.y - cy;
      const d = Math.hypot(ox, oy);
      const near = 1 - Math.min(1, Math.max(0, d - r) / R);
      h.hit({ damage: sm.blastDamage * near, fromX: cx, fromY: cy, source: c.player.id, weapon: "blast", attack: "sword.smash" });
      const push = sm.blastPush * near;
      h.push((ox / (d || 1)) * push, (oy / (d || 1)) * push, 0);
    });
  },
};

export const SWORD: Weapon = {
  id: "sword",
  name: "Sword",
  cooldown: (stats) => stats("sword").cooldown,
  attacks: [SWIPE, THRUST, SMASH],
  comboWindow: (stats) => stats("sword").comboWindow,
};
