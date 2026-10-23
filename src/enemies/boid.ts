import { GameObject } from "../core/object";
import { Health } from "../combat/components";
import type { Flock } from "./swarm";
import type { BaseParams, BoidType } from "./types";

// A boid: one enemy, as a game object. Its type gives its behaviour; the fields are the state that
// behaviour keeps. Health and the hurtbox are components, so combat treats it like anything else
// that can be hurt.

export class Boid<P extends BaseParams = BaseParams> extends GameObject {
  readonly health: Health;
  /** Body radius (the type's, × size); the same as the hurtbox's. */
  r: number;
  cooldown = 0;
  /** Seconds of lunge left (melee). */
  lunge = 0;
  /** Seconds left winding up an attack (telegraphed), or of the queen's anger before her blast. */
  windup = 0;
  /** Seconds left recovering after an attack, or staggered after an interrupted one: drifts, can't act. */
  recover = 0;
  /** Direction of the attack being wound up (rad); it locks shortly before the attack goes off. */
  aim = 0;
  /** Hit flash timer. */
  flash = 0;
  /** Hit-stop left (s, real time): frozen boids don't move, act or animate. */
  freeze = 0;
  /** Facing for drawing; held while frozen (knockback changes vx/vy at once). */
  heading = 0;
  /** Wander / wing-flap phase. */
  phase = 0;
  /** Where a boid that roams on its own (the queen) is heading. */
  goal: { x: number; y: number } | null = null;

  constructor(
    readonly type: BoidType<P>,
    /** The type's params with this boid's overrides (and the level's elite multipliers). */
    readonly params: P,
    /** Its flock (the queen's is her first escort flock; she isn't one of its members). */
    public flock: Flock,
  ) {
    super(type.id);
    this.health = this.add(Health, { hp: params.hp, max: params.hp });
    this.r = type.radius * params.size;
  }

  get hp() {
    return this.health.hp;
  }

  set hp(v: number) {
    this.health.hp = v;
  }

  get maxHp() {
    return this.health.max;
  }
}
