import { HitVolume } from "../combat/components";
import type { Hitbox } from "../combat/hitbox";
import { lerp } from "../core/math";
import type { GameObject } from "../core/object";
import type { AttackContext, AttackDef, Weapon } from "./types";

// The lunge: a long, thin rectangle along the aim that lunges at the closest enemy in its reach
// and strikes once near it. An attack of its own, on its own button, with its own cooldown: it
// doesn't touch the sword's combo.

/** The lunge's strike: a rectangle along the aim, its full reach unless `length` is given. */
function strike(c: AttackContext, length?: number) {
  const t = c.stats("lunge");
  length ??= lerp(t.length, t.maxLength, c.power);
  c.spawn({
    attack: "lunge",
    shape: { radius: length, rect: { dx: c.dx, dy: c.dy, length, halfWidth: t.width / 2 } },
    damage: lerp(t.damage, t.maxDamage, c.power),
    active: c.stats("sword").activeTime,
    blocks: true,
  });
  c.describe(length, t.width / 2);
}

export const LUNGE_ATTACK: AttackDef = {
  id: "lunge",
  name: "Lunge",
  indicator(stats, power) {
    const t = stats("lunge");
    return [{ kind: "rect", length: lerp(t.length, t.maxLength, power), halfWidth: t.width / 2 }];
  },
  release(c) {
    // Lunge at the closest enemy in its reach, and strike once near it; with none, strike at once.
    // Upgraded, it goes through to the furthest one, striking all on the way, and then instantly.
    const t = c.stats("lunge");
    const length = lerp(t.length, t.maxLength, c.power);
    const reach = { x: c.x, y: c.y, alt: c.alt, radius: length, rect: { dx: c.dx, dy: c.dy, length, halfWidth: t.width / 2 } };
    const through = c.skill("lunge") >= 2;
    const target = through ? furthestIn(c, reach) : c.world.combat.closestIn(reach, "player");
    if (!target) return strike(c);
    const instant = c.skill("lunge") >= 4;
    if (through) {
      // What it passes on the way is struck too (the target gets the strike): by a blade around
      // the player through the lunge, or for an instant one, along the line it skips.
      const d = Math.hypot(target.x - c.x, target.y - c.y);
      const ux = (target.x - c.x) / (d || 1);
      const uy = (target.y - c.y) / (d || 1);
      const halfWidth = t.width / 2 + 10;
      const v = c.spawn({
        attack: "lunge",
        damage: lerp(t.damage, t.maxDamage, c.power),
        ...(instant
          ? { shape: { radius: d, rect: { dx: ux, dy: uy, length: d, halfWidth } }, active: c.stats("sword").activeTime }
          : { shape: { radius: halfWidth }, active: Math.min(t.lungeTime, d / t.lungeSpeed) + 0.05, follow: c.player.id }),
      });
      v.require(HitVolume).hits.add(target.id);
    }
    const near = (s: AttackContext) => strike(s, s.stats("lunge").strikeLength);
    if (instant) return c.blink(target, { speed: t.lungeSpeed, strikeDistance: t.strikeDistance, strike: near });
    c.lunge(target, { speed: t.lungeSpeed, maxTime: t.lungeTime, strikeDistance: t.strikeDistance, strike: near });
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

export const LUNGE: Weapon = {
  id: "lunge",
  name: "Lunge",
  cooldown: (stats) => stats("lunge").cooldown,
  attacks: [LUNGE_ATTACK],
};
