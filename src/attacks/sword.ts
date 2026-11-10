import { lerp } from "../core/math";
import type { AttackDef, Weapon } from "./types";

// The sword strikes in a 1-2-3 combo: a hit opens a short window in which the next strike is the
// next one along, after only a short cooldown; else it starts over, after the full one. 1 is the
// swipe (a sector); 2 a poke (a rectangle) that stands its ground; 3 a small, strong smash (a
// square) whose blast hurts and throws back everything else around it. The combo has only the
// strikes the skills give (attacks/index.ts).

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
      shape: { radius: range, sector: { dx: c.dx, dy: c.dy, arc: sw.arc } },
      damage: lerp(sw.damage, sw.maxDamage, c.power),
      knockback: sw.knockback,
      active: sw.activeTime,
      blocks: true,
    });
    c.describe(range);
  },
};

export const POKE: AttackDef = {
  id: "sword.poke",
  name: "Poke",
  indicator(stats, power) {
    const pk = stats("poke");
    return [{ kind: "rect", length: lerp(pk.length, pk.maxLength, power), halfWidth: pk.width / 2 }];
  },
  release(c) {
    const pk = c.stats("poke");
    const length = lerp(pk.length, pk.maxLength, c.power);
    c.spawn({
      attack: "sword.poke",
      shape: { radius: length, rect: { dx: c.dx, dy: c.dy, length, halfWidth: pk.width / 2 } },
      damage: lerp(pk.damage, pk.maxDamage, c.power),
      stun: pk.stun || undefined,
      active: c.stats("sword").activeTime,
      blocks: true,
    });
    c.describe(length, pk.width / 2);
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
  stepCooldown: (stats) => stats("sword").stepCooldown,
  attacks: [SWIPE, POKE, SMASH],
  comboWindow: (stats) => stats("sword").comboWindow,
};
