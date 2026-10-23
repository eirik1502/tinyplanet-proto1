import { lerp } from "../core/math";
import type { AttackContext, AttackDef, Weapon } from "./types";

// The sword strikes in a 1-2-3 combo: a hit opens a short window in which the next strike is the
// next one along, else it starts over. 1 is the swipe (a sector); 2 a long, thin thrust (a
// rectangle) that lunges at the closest enemy in its reach and strikes once near it; 3 a small,
// strong smash (a square) whose blast hurts and throws back everything else around it.

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
    const t = c.stats("thrust");
    const length = lerp(t.length, t.maxLength, c.power);
    const target = c.world.combat.closestIn(
      { x: c.x, y: c.y, alt: c.alt, radius: length, rect: { dx: c.dx, dy: c.dy, length, halfWidth: t.width / 2 } },
      "player",
    );
    if (!target) return thrust(c);
    c.lunge(target, {
      speed: t.lungeSpeed,
      maxTime: t.lungeTime,
      strikeDistance: t.strikeDistance,
      strike: (s) => thrust(s, s.stats("thrust").strikeLength),
    });
  },
};

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
