import type { World } from "../game/world";
import type { Perk } from "./types";

// Perks: upgrades to the player's attacks and abilities. A perk changes stats (`modify`), or adds
// behaviour by listening to the world's events (`install`), or both. A level lists the perks it
// plays with (LevelSpec.perks); the dev panel's custom levels can toggle them.

const scale = (s: Record<string, number>, keys: string[], k: number) => {
  for (const key of keys) s[key] = s[key]! * k;
};

/** A blast of the player's around (x, y): hurts and throws back every enemy within `radius`, more the closer. */
function playerBlast(w: World, x: number, y: number, alt: number, o: { radius: number; damage: number; push: number; kind: string }) {
  const p = w.player;
  w.events.emit("blast", { source: p.id, x, y, alt, radius: o.radius, kind: o.kind });
  w.combat.blast({ x, y, alt, radius: o.radius }, "player", (t, h) => {
    const dx = t.x - x;
    const dy = t.y - y;
    const d = Math.hypot(dx, dy) || 1;
    const near = 1 - Math.min(1, d / o.radius);
    h.hit({ damage: o.damage * near, fromX: x, fromY: y, source: p.id, weapon: "blast", attack: o.kind });
    h.push((dx / d) * o.push * (0.5 + 0.5 * near), (dy / d) * o.push * (0.5 + 0.5 * near), 0);
  });
}

export const LONG_BLADE: Perk = {
  id: "longBlade",
  name: "Long blade",
  blurb: "The swipe and the thrust reach further.",
  modify(group, s) {
    if (group === "sword") scale(s, ["range", "maxRange"], 1.35);
    if (group === "thrust") scale(s, ["length", "maxLength"], 1.25);
  },
};

export const HEAVY_SMASH: Perk = {
  id: "heavySmash",
  name: "Heavy smash",
  blurb: "The smash's blast is bigger and throws harder.",
  modify(group, s) {
    if (group !== "smash") return;
    scale(s, ["blastRadius"], 1.4);
    scale(s, ["blastPush"], 1.5);
    s.blastDamage = s.blastDamage! + 2;
  },
};

export const QUICK_SPEAR: Perk = {
  id: "quickSpear",
  name: "Quick spear",
  blurb: "The spear comes back twice as fast.",
  modify(group, s) {
    if (group === "spear") scale(s, ["cooldown"], 0.5);
  },
};

export const LANDING_SHOCKWAVE: Perk = {
  id: "landingShockwave",
  name: "Landing shockwave",
  blurb: "Hard landings throw back enemies around you.",
  install(w) {
    w.events.on(
      "land",
      (e) => {
        if (e.speed > 250) playerBlast(w, e.x, e.y, e.alt, { radius: 120, damage: 1, push: 520, kind: "landingShockwave" });
      },
      { source: w.player.id, owner: w.lifetime },
    );
  },
};

export const BOUNCE_BLAST: Perk = {
  id: "bounceBlast",
  name: "Bounce blast",
  blurb: "The safety bounce explodes, hurting what's around you.",
  install(w) {
    w.events.on("netBounce", (e) => playerBlast(w, e.x, e.y, e.alt, { radius: 130, damage: 2, push: 600, kind: "bounceBlast" }), {
      source: w.player.id,
      owner: w.lifetime,
    });
  },
};

/** Every perk, by id. */
export const PERKS: Record<string, Perk> = Object.fromEntries(
  [LONG_BLADE, HEAVY_SMASH, QUICK_SPEAR, LANDING_SHOCKWAVE, BOUNCE_BLAST].map((p) => [p.id, p]),
);
