import { lerp } from "../core/math";
import { GameObject } from "../core/object";
import type { World } from "../game/world";
import { HitVolume, Hurtable, type Team } from "./components";
import { box, overlaps, type Hitbox, type Hurtbox } from "./hitbox";

// The combat rules every attack follows, from anyone: hit volumes move and age, and hit the other
// team's hurtables they overlap (each once); blades block the other team's projectiles; islands
// stop projectiles. Blasts, touches and target picks query the same hurtables, and hit-stop is
// the same curve for every hit.

export class Combat {
  constructor(private w: World) {}

  /** How far up and down every hit reaches (on top of tall bodies' extra reach). */
  get hitHeight() {
    return this.w.params.combat.hits.height;
  }

  overlaps(hit: Hitbox, hurt: Hurtbox) {
    return overlaps(hit, hurt, this.hitHeight);
  }

  /** Hit-stop (s) for a hit dealing `damage`, from anyone: more damage freezes longer. */
  hitStop(damage: number) {
    const h = this.w.params.player.hitStop;
    const t = (damage - h.minDamage) / Math.max(1e-6, h.maxDamage - h.minDamage);
    return lerp(h.min, h.max, Math.max(0, Math.min(1, t)));
  }

  /** A hit volume at `at` (moving with its velocity, if a projectile). */
  spawnVolume(v: HitVolume, at: { x: number; y: number; alt: number; vx?: number; vy?: number; vz?: number }): GameObject {
    const o = this.w.objects.add(new GameObject("volume"));
    Object.assign(o, { x: at.x, y: at.y, alt: at.alt, vx: at.vx ?? 0, vy: at.vy ?? 0, vz: at.vz ?? 0 });
    o.add(HitVolume, v);
    return o;
  }

  volumeBox(o: GameObject, v: HitVolume): Hitbox {
    return { ...v.shape, x: o.x, y: o.y, alt: o.alt };
  }

  /** What `team` can hit right now: the other team's targetable hurtables. */
  targets(team: Team): [GameObject, Hurtable][] {
    return this.w.objects.query(Hurtable).filter(([, h]) => h.team !== team && h.targetable());
  }

  /** What of the other team's `hit` overlaps. */
  touching(hit: Hitbox, team: Team): [GameObject, Hurtable][] {
    return this.targets(team).filter(([, h]) => this.overlaps(hit, h.hurtbox()));
  }

  /** The closest (on the plane) of the other team's hurtables inside `hit`. */
  closestIn(hit: Hitbox, team: Team): GameObject | null {
    let best: GameObject | null = null;
    let bestD = Infinity;
    for (const [o] of this.touching(hit, team)) {
      const d = Math.hypot(o.x - hit.x, o.y - hit.y);
      if (d < bestD) {
        best = o;
        bestD = d;
      }
    }
    return best;
  }

  /**
   * Call `each` for every one of the other team's hurtables within `blast`. `anyHeight`: it
   * reaches them however far above or below they are.
   */
  blast(blast: Hitbox, team: Team, each: (o: GameObject, h: Hurtable) => void, anyHeight = false) {
    for (const [o, h] of this.targets(team)) {
      const hb = h.hurtbox();
      if (this.overlaps(anyHeight ? { ...blast, alt: hb.alt } : blast, hb)) each(o, h);
    }
  }

  /** Move and age the hit volumes and land their hits. `dt` is world time. */
  update(dt: number) {
    const volumes = this.w.objects.query(HitVolume);
    // Blades first: their hits, and the projectiles they block.
    for (const [o, v] of volumes) {
      if (v.projectile) continue;
      v.age += dt;
      if (v.age > v.active) {
        this.w.objects.destroy(o);
        continue;
      }
      const hitbox = this.volumeBox(o, v);
      for (const [t, h] of this.targets(v.team)) {
        if (v.hits.has(t.id) || !this.overlaps(hitbox, h.hurtbox())) continue;
        v.hits.add(t.id);
        h.hit({ damage: v.damage, fromX: o.x, fromY: o.y, source: v.owner, weapon: v.weapon, attack: v.attack, step: v.step });
      }
      if (!v.blocks) continue;
      for (const [s, sv] of volumes) {
        if (!s.alive || !sv.projectile || sv.team === v.team || !this.overlaps(hitbox, this.volumeBox(s, sv))) continue;
        this.w.objects.destroy(s);
        this.w.events.emit("block", { x: s.x, y: s.y, alt: s.alt, what: "projectile" });
      }
    }
    // Projectiles: fly, hit the first thing they touch, and stop on islands.
    for (const [o, v] of volumes) {
      if (!v.projectile || !o.alive) continue;
      o.x += o.vx * dt;
      o.y += o.vy * dt;
      o.alt += o.vz * dt;
      v.projectile.life -= dt;
      v.age += dt;
      const hitbox = this.volumeBox(o, v);
      for (const [t, h] of this.targets(v.team)) {
        if (!this.overlaps(hitbox, h.hurtbox())) continue;
        v.hits.add(t.id);
        h.hit({ damage: v.damage, fromX: o.x - o.vx * 0.05, fromY: o.y - o.vy * 0.05, source: v.owner, weapon: v.weapon, attack: v.attack });
        this.w.objects.destroy(o);
        break;
      }
      if (o.alive && this.w.islands.some((i) => i.intersects(o.x, o.y, o.alt, 2))) {
        this.w.events.emit("thud", { x: o.x, y: o.y, alt: o.alt, fromPlayer: v.team === "player" });
        this.w.objects.destroy(o);
      }
      if (v.projectile.life <= 0) this.w.objects.destroy(o);
    }
  }
}

export { box };
