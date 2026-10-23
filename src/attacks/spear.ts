import { lerp } from "../core/math";
import type { AttackDef, Weapon } from "./types";

// The spear: thrown. Power scales its speed, damage and size.

export const THROW: AttackDef = {
  id: "spear",
  name: "Throw",
  indicator: () => [],
  release(c) {
    const sp = c.stats("spear");
    const speed = lerp(sp.speed, sp.maxSpeed, c.power);
    const scale = lerp(1, sp.maxScale, c.power);
    c.spawn(
      {
        attack: "spear",
        shape: { radius: sp.hitRadius * scale },
        damage: lerp(sp.damage, sp.maxDamage, c.power),
        active: Infinity,
        projectile: { life: sp.life, scale },
      },
      { x: c.x + c.dx * 10, y: c.y + c.dy * 10, alt: c.alt, vx: c.dx * speed, vy: c.dy * speed, vz: 0 },
    );
  },
};

export const SPEAR: Weapon = {
  id: "spear",
  name: "Spear",
  cooldown: (stats) => stats("spear").cooldown,
  attacks: [THROW],
};
