import { EventBus, Lifetime } from "../core/events";
import { ObjectStore } from "../core/object";
import { mulberry32 } from "../core/rng";
import { loadoutFor } from "../attacks";
import { AttackController } from "../attacks/controller";
import type { Loadout } from "../attacks/types";
import { Combat } from "../combat/combat";
import { Swarm } from "../enemies/swarm";
import { levelRules, planetOptions, type LevelRules, type LevelSpec } from "../levels/levels";
import type { Params } from "../params/store";
import type { InputFrame } from "../input/types";
import { PlayerController } from "../player/controller";
import type { Player } from "../player/player";
import { generatePlanet, type Planet } from "../world/planet";
import type { Island } from "../world/island";
import type { GameBus } from "./events";

// A world: one planet being played. It owns the objects (the player, the boids, attacks in
// flight), the systems that drive them and the event bus they report on. No DOM, no audio, no
// clock: `step` advances it by however much time it's given, so the browser steps it once per
// frame and a headless run as fast as it likes. With the same spec, seed, params, inputs and step
// sizes, a world plays out the same way.

export interface WorldOptions {
  spec: LevelSpec;
  seed: number;
  params: Params;
}

export type Outcome = "victory" | "defeat";

export class World {
  readonly events: GameBus = new EventBus();
  readonly objects = new ObjectStore();
  /** Ends with the world: perks and other listeners subscribe with this as their owner. */
  readonly lifetime = new Lifetime();
  readonly params: Params;
  readonly spec: LevelSpec;
  readonly seed: number;
  readonly planet: Planet;
  readonly islands: Island[];
  readonly rules: LevelRules;
  readonly loadout: Loadout;

  readonly combat: Combat;
  readonly playerCtl: PlayerController;
  readonly swarm: Swarm;
  readonly attacks: AttackController;

  /** Slow motion: the world's time scale now, how far into slow motion it is (0..1), and whether it's wanted. */
  readonly slow = { scale: 1, intensity: 0, active: false };
  /** World time so far, and the last step's world and real time. */
  time = 0;
  dt = 0;
  dtReal = 0;
  steps = 0;
  /** How the round ended, once it has. The world keeps running after (nobody can be hurt). */
  outcome: Outcome | null = null;

  constructor(o: WorldOptions) {
    this.params = o.params;
    this.spec = o.spec;
    this.seed = o.seed;
    this.planet = generatePlanet(o.seed, planetOptions(o.spec, o.seed));
    this.islands = this.planet.islands;
    this.rules = levelRules(o.spec, o.params.world.modifiers, mulberry32(o.seed ^ 0x68e31da4));
    this.loadout = loadoutFor(o.spec.weapons, o.spec.perks);

    this.combat = new Combat(this);
    this.playerCtl = new PlayerController(this);
    this.swarm = new Swarm(this, this.rules.swarm);
    this.attacks = new AttackController(this, this.loadout);
    for (const perk of this.loadout.perks) perk.install?.(this);
  }

  get player(): Player {
    return this.playerCtl.player;
  }

  /** The round is on: the player can act and be hurt. */
  get playing() {
    return this.outcome === null;
  }

  /** Advance by `dtReal` seconds of real time (world time runs slower in slow motion). */
  step(dtReal: number, input: InputFrame) {
    const playing = this.playing;
    this.playerCtl.updateSlowMo(dtReal);
    const dt = dtReal * this.slow.scale;
    this.dt = dt;
    this.dtReal = dtReal;
    this.time += dt;
    this.steps++;

    const frozen = this.player.freeze > 0;
    this.playerCtl.update(dt, dtReal, input);
    if (playing && !frozen) this.attacks.update(dt, dtReal, input);
    this.playerCtl.afterAttacks(dt);
    this.swarm.update(dt, dtReal);
    this.combat.update(dt);
    this.swarm.cull();
    if (this.playing && this.swarm.cleared) this.end("victory");
    this.objects.sweep();
  }

  /** End the round (once). */
  end(outcome: Outcome) {
    if (this.outcome) return;
    this.outcome = outcome;
    this.events.emit("roundOver", { outcome });
  }

  dispose() {
    this.lifetime.dispose();
    this.objects.dispose();
  }
}
