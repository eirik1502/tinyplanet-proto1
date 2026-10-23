import { wrapAngle } from "../core/math";
import type { GameObject } from "../core/object";
import { HitVolume, Hurtable } from "../combat/components";
import type { World } from "../game/world";
import type { InputFrame } from "../input/types";
import { ISLAND_TOP } from "../world/island";
import type { AttackContext, AttackDef, Loadout, StatGroup, Stats, Weapon, WeaponId } from "./types";

// The player's attacks: hold a weapon's button to aim and power up, release to strike. The aim
// starts at the closest enemy in range (except with the move input steering the aim and pushed,
// which starts along it), else straight out from the rim, or along the input / flight in the air,
// and turns toward the input direction, quickly at first and slower and slower until it locks at
// full power. With a pointer the aim simply follows it. Combos, cooldowns and lunges are handled
// here for any weapon; what an attack does is its own.

export interface AimState {
  weapon: Weapon;
  attack: AttackDef;
  /** Seconds held (real time). */
  t: number;
  angle: number;
  /** 1-based position of `attack` in its weapon's combo. */
  step: number;
}

export interface LungeState {
  weapon: Weapon;
  attack: AttackDef;
  target: GameObject;
  t: number;
  angle: number;
  power: number;
  speed: number;
  maxTime: number;
  strikeDistance: number;
  strike: (c: AttackContext) => void;
}

export class AttackController {
  /** The attack being aimed (button held), or null. */
  aim: AimState | null = null;
  /** A lunge under way, or null. */
  lunge: LungeState | null = null;
  readonly weapons: Weapon[];
  private cooldowns = new Map<WeaponId, number>();
  /** Per combo weapon: the next attack (1-based) while `left` > 0, else the first. */
  private combos = new Map<WeaponId, { step: number; left: number }>();

  constructor(
    private w: World,
    readonly loadout: Loadout,
  ) {
    this.weapons = loadout.weapons;
    // A hit by a combo's attack opens the window for the next one along.
    w.events.on(
      "hit",
      (e) => {
        const weapon = this.weapons.find((x) => x.id === e.weapon);
        if (!weapon?.comboWindow || !e.step) return;
        this.combos.set(weapon.id, { step: (e.step % weapon.attacks.length) + 1, left: weapon.comboWindow((g) => this.stats(g)) });
      },
      { source: w.player.id, owner: w.player.lifetime },
    );
  }

  has(id: WeaponId) {
    return this.weapons.some((x) => x.id === id);
  }

  /** Whether `id` is unlocked and off cooldown. */
  ready(id: WeaponId) {
    return this.has(id) && (this.cooldowns.get(id) ?? 0) <= 0;
  }

  /** A stat group, with the perks applied (a copy). */
  stats<G extends StatGroup>(group: G): Stats<G> {
    const s = { ...this.w.params.player[group] };
    for (const perk of this.loadout.perks) perk.modify?.(group, s as unknown as Record<string, number>);
    return s;
  }

  /** Power 0..1 of the attack being aimed. */
  power() {
    return this.aim ? Math.min(1, this.aim.t / this.stats("aim").chargeTime) : 0;
  }

  /** The attack a press of `weapon` starts now, and its 1-based combo step. */
  next(weapon: Weapon): { attack: AttackDef; step: number } {
    const c = this.combos.get(weapon.id);
    const step = c && c.left > 0 ? c.step : 1;
    return { attack: weapon.attacks[step - 1] ?? weapon.attacks[0]!, step };
  }

  update(dt: number, dtReal: number, input: InputFrame) {
    const w = this.w;
    const p = w.player;
    for (const [id, cd] of this.cooldowns) this.cooldowns.set(id, cd - dt);
    for (const c of this.combos.values()) {
      c.left -= dt;
      if (c.left <= 0) c.step = 1;
    }
    if (p.mode === "lost") {
      this.aim = null;
      this.lunge = null;
      return;
    }
    if (this.lunge) {
      this.updateLunge(dt, this.lunge);
      return;
    }
    const dir = input.move;
    const pointer = input.aimMode === "pointer";
    const toPointer = input.aim;

    if (!this.aim) {
      const weapon = this.weapons.find((x) => input.pressed.has(x.id) && this.ready(x.id));
      if (!weapon) return;
      // Aim assist, except when the move input steers the aim and is pushed.
      const steering = (dir.x || dir.y) && input.aimMode === "move";
      const target = pointer || steering ? null : this.closestEnemy();
      let angle: number;
      if (pointer) {
        angle = toPointer ? Math.atan2(toPointer.y, toPointer.x) : p.facing;
      } else if (target) {
        angle = Math.atan2(target.y - p.y, target.x - p.x);
      } else if (p.mode === "hang") {
        const e = w.islands[p.island]!.pointAt(p.s);
        angle = Math.atan2(e.ny, e.nx);
      } else if (dir.x || dir.y) {
        angle = Math.atan2(dir.y, dir.x);
      } else {
        angle = Math.atan2(p.vy, p.vx);
      }
      const { attack, step } = this.next(weapon);
      this.aim = { weapon, attack, t: 0, angle: this.clampAimToRim(angle), step };
      w.events.emit("aimStart", { source: p.id, weapon: weapon.id });
      return;
    }

    const aim = this.aim;
    // Aiming runs on real time so slow motion doesn't slow the charge or the turning.
    const wasCharged = this.power() >= 1;
    aim.t += dtReal;
    if (!wasCharged && this.power() >= 1) w.events.emit("charged", { source: p.id, weapon: aim.weapon.id });
    const pa = this.stats("aim");
    if (pointer) {
      // The aim follows the pointer directly.
      if (toPointer) aim.angle = this.clampAimToRim(Math.atan2(toPointer.y, toPointer.x));
    } else {
      aim.angle = this.clampAimToRim(turnAim(aim.angle, dir, aim.t / pa.chargeTime, dtReal, pa.turnRate, pa.minTurnRate));
    }

    if (!input.held.has(aim.weapon.id)) {
      const power = this.power();
      this.aim = null;
      // The combo window is spent: only a hit with this attack opens it again.
      if (aim.weapon.comboWindow) this.combos.set(aim.weapon.id, { step: 1, left: 0 });
      this.release(aim.weapon, aim.attack, aim.step, aim.angle, power);
    }
  }

  private release(weapon: Weapon, attack: AttackDef, step: number, angle: number, power: number) {
    const c = this.context(weapon, attack, step, angle, power);
    attack.release(c);
    if (this.lunge) return; // its strike comes later
    this.finish(weapon, attack, c, angle, power, false);
  }

  /** After an attack went off: the cooldown starts, and listeners hear what it was. */
  private finish(weapon: Weapon, attack: AttackDef, c: AttackContext & { reach?: number; halfWidth?: number }, angle: number, power: number, lunged: boolean) {
    const p = this.w.player;
    this.cooldowns.set(weapon.id, weapon.cooldown((g) => this.stats(g)));
    this.w.events.emit("attack", { source: p.id, x: c.x, y: c.y, alt: c.alt, weapon: weapon.id, attack: attack.id, power, angle, lunged, reach: c.reach, halfWidth: c.halfWidth, step: this.stepOf(weapon, attack) });
  }

  private stepOf(weapon: Weapon, attack: AttackDef) {
    return weapon.attacks.indexOf(attack) + 1;
  }

  private context(weapon: Weapon, attack: AttackDef, step: number, angle: number, power: number): AttackContext & { reach?: number; halfWidth?: number } {
    const w = this.w;
    const p = w.player;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const alt = p.mode === "hang" ? ISLAND_TOP + 2 : p.alt;
    const ctx: AttackContext & { reach?: number; halfWidth?: number } = {
      world: w,
      player: p,
      x: p.x,
      y: p.y,
      alt,
      dx,
      dy,
      angle,
      power,
      stats: (g) => this.stats(g),
      spawn: (v, at) => {
        const o = w.combat.spawnVolume({ ...v, team: "player", owner: p.id, weapon: weapon.id, step: v.step ?? step, power: v.power ?? power, age: 0, hits: new Set() }, at ?? { x: p.x, y: p.y, alt });
        return o;
      },
      lunge: (target, o) => {
        if (p.mode === "hang") w.playerCtl.leaveRim(dx * o.speed, dy * o.speed, 0);
        this.lunge = { weapon, attack, target, t: 0, angle, power, ...o };
        const r = target.get(Hurtable)?.hurtbox().radius ?? 0;
        const reach = Math.hypot(target.x - p.x, target.y - p.y) - o.strikeDistance - r;
        w.events.emit("lungeStart", { source: p.id, target: target.id, x: p.x, y: p.y, alt: p.alt, duration: Math.min(o.maxTime, Math.max(0, reach) / o.speed) });
      },
      describe: (reach, halfWidth) => {
        ctx.reach = reach;
        ctx.halfWidth = halfWidth;
      },
    };
    return ctx;
  }

  /**
   * A lunge: it strikes once within `strikeDistance` of its target, or when the target is gone,
   * the lunge runs out of time or it lands on a rim. The strike keeps a little of the lunge's speed.
   */
  private updateLunge(dt: number, lunge: LungeState) {
    const p = this.w.player;
    const b = lunge.target;
    const h = b.get(Hurtable);
    const up = b.alive && !!h?.targetable();
    lunge.t += dt;
    if (up) lunge.angle = this.clampAimToRim(Math.atan2(b.y - p.y, b.x - p.x));
    const near = Math.hypot(b.x - p.x, b.y - p.y) <= lunge.strikeDistance + (h?.hurtbox().radius ?? 0);
    if (up && !near && lunge.t < lunge.maxTime && p.mode === "air") return;
    this.lunge = null;
    const c = this.context(lunge.weapon, lunge.attack, this.stepOf(lunge.weapon, lunge.attack), lunge.angle, lunge.power);
    lunge.strike(c);
    p.vx *= 0.35;
    p.vy *= 0.35;
    p.vz = Math.max(0, p.vz * 0.35);
    this.finish(lunge.weapon, lunge.attack, c, lunge.angle, lunge.power, true);
  }

  /**
   * Aim assist: the closest enemy within `aim.assistRange`. On a rim, only enemies on the outward
   * side count, since attacks can't point into the island.
   */
  private closestEnemy(): GameObject | null {
    const w = this.w;
    const p = w.player;
    const e = p.mode === "hang" ? w.islands[p.island]!.pointAt(p.s) : null;
    let best: GameObject | null = null;
    let bestD = this.stats("aim").assistRange;
    for (const [o, h] of w.objects.query(Hurtable)) {
      if (h.team === "player" || !h.targetable() || o.has(HitVolume)) continue;
      const dx = o.x - p.x;
      const dy = o.y - p.y;
      if (e && dx * e.nx + dy * e.ny <= 0) continue;
      const d = Math.hypot(dx, dy, o.alt - p.alt);
      if (d < bestD) {
        best = o;
        bestD = d;
      }
    }
    return best;
  }

  /** On a rim, attacks may not point back into the island: keep them in the outward half-plane. */
  private clampAimToRim(angle: number): number {
    const p = this.w.player;
    if (p.mode !== "hang") return angle;
    const e = this.w.islands[p.island]!.pointAt(p.s);
    let x = Math.cos(angle);
    let y = Math.sin(angle);
    const dot = x * e.nx + y * e.ny;
    if (dot >= 0) return angle;
    x -= e.nx * dot;
    y -= e.ny * dot;
    return Math.hypot(x, y) < 1e-3 ? Math.atan2(e.ny, e.nx) : Math.atan2(y, x);
  }
}

/**
 * Turn an aim angle toward the input direction. The turn rate starts at `turnRate` and falls off
 * as `progress` (0..1 over the aim time) builds, down to `minTurnRate` for fine-tuning.
 */
function turnAim(angle: number, dir: { x: number; y: number }, progress: number, dt: number, turnRate: number, minTurnRate: number): number {
  if (!dir.x && !dir.y) return angle;
  const falloff = Math.pow(Math.max(0, 1 - progress), 2);
  const rate = Math.max(minTurnRate, turnRate * falloff);
  const diff = wrapAngle(Math.atan2(dir.y, dir.x) - angle);
  return angle + Math.max(-rate * dt, Math.min(rate * dt, diff));
}
