import type { EventBus } from "../core/events";

// Everything that happens in a world, as events. The simulation emits them; gameplay listeners
// (perks, the combo window) react within the step, and presenters (sound, rumble, effects, the
// avatar's animation) after it. `source` is who did it, `target` who it happened to (ids).

/** Where it happened. */
interface At {
  x: number;
  y: number;
  alt: number;
}

export interface GameEvents {
  [type: string]: object;

  // The player's movement (`source`: the player)
  /** Jumped off a rim. */
  jump: At & { source: number };
  doubleJump: At & { source: number };
  /** Grabbed a rim, arriving at `speed`. */
  land: At & { source: number; speed: number };
  /** The safety bounce below the rim. */
  netBounce: At & { source: number };
  /** Fell into the haze. */
  lost: At & { source: number };
  /** Back on the last rim held after falling. */
  respawn: At & { source: number };
  /** Hurt (`target`: the player). */
  hurt: At & { target: number; damage: number; fromX: number; fromY: number };
  /** Shoved by a blast. */
  pushed: { target: number; hard: boolean };
  /** A sword hit in the air bounced the player up. */
  hitBounce: { source: number };
  /** Slow motion starts or ends. */
  slowMo: { on: boolean };

  // The player's attacks (`source`: the player)
  /** Started holding an attack. */
  aimStart: { source: number; weapon: string };
  /** The attack being held reached full power. */
  charged: { source: number; weapon: string };
  /** An attack went off. `lunged`: the thrust's strike at the end of a lunge. */
  attack: At & {
    source: number;
    weapon: string;
    attack: string;
    /** 1-based position in its weapon's combo. */
    step: number;
    power: number;
    angle: number;
    lunged?: boolean;
    /** How far it reached along the aim, and its half-width, when the attack says (for its look). */
    reach?: number;
    halfWidth?: number;
  };
  /** The thrust lunges at `target` for up to `duration` s. */
  lungeStart: At & { source: number; target: number; duration: number };

  // Combat
  /** A hit landed on a boid (`target`) of type `kind`. */
  hit: At & { source?: number; target: number; kind: string; damage: number; killed: boolean; weapon?: string; attack?: string; step?: number };
  /** Blocked: the queen's shield turned a hit, or a blade stopped a projectile. */
  block: At & { what: "shield" | "projectile" };
  /** A hit interrupted a boid's windup. */
  interrupt: At & { target: number };
  /** A projectile hit an island. */
  thud: At & { fromPlayer: boolean };
  /** The smash's blast. */
  smash: At & { source: number; radius: number };
  /** Some other blast of the player's (perks); `kind` names it for its look. */
  blast: At & { source: number; radius: number; kind: string };

  // The swarm (`source`: the boid)
  /** A boid starts winding up an attack that goes off in `dur` s. */
  windup: At & { source: number; kind: string; dur: number };
  /** A melee boid lunges. */
  enemyLunge: At & { source: number };
  /** A ranged boid fires an orb along (dx, dy); `r` is its body radius. */
  shot: At & { source: number; dx: number; dy: number; r: number };
  /** A bomber blows up. */
  explode: At & { source: number; radius: number };
  /** The queen gets angry; her blast follows in `dur` s. */
  anger: At & { source: number; dur: number };
  queenBlast: At & { source: number; radius: number };

  // The round
  roundOver: { outcome: "victory" | "defeat" };
}

export type GameBus = EventBus<GameEvents>;
