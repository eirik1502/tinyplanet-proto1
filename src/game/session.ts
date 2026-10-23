import { EventBus } from "../core/events";
import { mulberry32, nextSeed, type Rng } from "../core/rng";
import type { WeaponId } from "../attacks/types";
import { boidType } from "../enemies";
import { resolveParams, type BaseParams, type BoidType } from "../enemies/types";
import { describeFlock } from "../enemies/flocks";
import { levelBase, MODIFIERS, planLevel, resolveLevel, UNLOCKS, weaponsAt, type LevelPlan, type LevelSpec, type LevelTemplate } from "../levels/levels";
import type { Params } from "../params/store";
import type { InputFrame } from "../input/types";
import type { Scenario } from "./scenario";
import { World } from "./world";

// A session: what's being played, round after round. It picks each level (the progression, a
// custom level or a scenario), makes a World for every round, and runs the screens around it:
// the briefing before each level (also the pause screen), and the end of a round, after which a
// win moves on to the next level and a defeat retries the level on a fresh planet. No DOM: the
// browser shows the briefing when the session says so, and a headless run skips it.

/** What a round plays: the normal progression from a level, a custom level, or a scenario. */
export type Run =
  | { kind: "normal"; level: number; template: LevelTemplate | null }
  | { kind: "custom"; spec: LevelSpec }
  | { kind: "scenario"; scenario: Scenario };

export type SessionState = "briefing" | "play" | "victory" | "defeat";
export type BriefingReason = "new" | "retry" | "pause";

export interface SessionEvents {
  [type: string]: object;
  /** A new world: presenters attach to it. */
  roundStart: { world: World };
  briefingOpen: { reason: BriefingReason };
  briefingClose: object;
}

export interface BriefingEnemy {
  type: BoidType<BaseParams>;
  params: BaseParams;
}

/** What the briefing shows. */
export interface BriefingData {
  level: number;
  /** Replaces "Level n" in the title. */
  heading?: string;
  template: { name: string; blurb: string; boss: boolean } | null;
  modifiers: { name: string; blurb: string }[];
  reason: BriefingReason;
  weapons: WeaponId[];
  perks: { name: string; blurb: string }[];
  /** A card per distinct enemy on the planet (type and params, as spawned), the queen first. */
  enemies: BriefingEnemy[];
  /** Weapons and enemy types (by id) unlocked on this level. */
  fresh: string[];
}

export interface SessionOptions {
  /** Seeds every planet of the session (each round draws a new one). Default: random. */
  seed?: number;
  /** Go straight to play instead of showing briefings (headless). */
  skipBriefings?: boolean;
}

/** After a round ends: move on after this long, or from this long on with confirm (s). */
const END_TIME = 4.5;
const END_SKIP = 1.2;

export class Session {
  readonly events = new EventBus<SessionEvents>();
  state: SessionState = "briefing";
  briefing: BriefingReason = "new";
  /** Seconds in the current screen (briefing or end of round). */
  timer = 0;
  level = 1;
  /** This level's template and modifiers (normal runs). A retry keeps them. */
  plan: LevelPlan | null = null;
  /** This level, fully described; a retry keeps it (same flocks, fresh planet). */
  spec: LevelSpec | null = null;
  world!: World;
  run!: Run;
  private rand: Rng;

  /** Call `start` to begin (after subscribing to the session's events). */
  constructor(
    readonly params: Params,
    private opts: SessionOptions = {},
  ) {
    this.rand = mulberry32(opts.seed ?? Math.floor(Math.random() * 1e9));
  }

  get custom() {
    return this.run.kind !== "normal";
  }

  /** Start a run: the normal progression from a level, a custom level or a scenario. */
  start(run: Run) {
    this.run = run;
    this.plan = null;
    this.spec = null;
    this.restart(run.kind === "normal" ? run.level : 1);
  }

  /** Make the world for `level` and show its briefing (a defeat retries on a fresh planet). */
  restart(level: number, retry = false) {
    this.level = level;
    const run = this.run;
    const lv = this.params.world.levels;
    let seed = nextSeed(this.rand);
    if (run.kind === "custom") this.spec = structuredClone(run.spec);
    else if (run.kind === "scenario") {
      this.spec = structuredClone(run.scenario.spec);
      seed = run.scenario.seed ?? seed;
    } else if (!retry || !this.spec) {
      this.plan = planLevel(level, this.plan?.template ?? null, {
        force: run.template,
        modifiersFrom: lv.modifiersFrom,
        twoModifiersFrom: lv.twoModifiersFrom,
        rand: this.rand,
      });
      this.spec = resolveLevel(this.plan.template, levelBase(level, this.params.world), {
        modifiers: this.plan.modifiers,
        weapons: weaponsAt(level),
        rand: this.rand,
      });
    }
    this.world?.dispose();
    this.world = new World({ spec: this.spec!, seed, params: this.params });
    this.events.emit("roundStart", { world: this.world });
    this.openBriefing(retry ? "retry" : "new");
  }

  openBriefing(reason: BriefingReason) {
    if (this.opts.skipBriefings) {
      this.state = "play";
      this.timer = 0;
      return;
    }
    this.state = "briefing";
    this.briefing = reason;
    this.timer = 0;
    this.world.attacks.aim = null;
    this.events.emit("briefingOpen", { reason });
  }

  closeBriefing() {
    if (this.state !== "briefing") return;
    this.state = "play";
    this.timer = 0;
    this.events.emit("briefingClose", {});
  }

  /** One frame of `dtReal` real seconds. */
  step(dtReal: number, input: InputFrame) {
    if (this.state === "briefing") {
      // The world is paused: only the briefing's own keys do anything.
      this.timer += dtReal;
      if (this.timer > 0.3 && (input.pressed.has("confirm") || (this.briefing === "pause" && input.pressed.has("pause")))) this.closeBriefing();
      return;
    }
    if (this.state === "play" && input.pressed.has("pause")) {
      this.openBriefing("pause");
      return;
    }
    this.world.step(dtReal, input);
    if (this.state === "play" && this.world.outcome) {
      this.state = this.world.outcome;
      this.timer = 0;
    }
    if (this.state === "victory" || this.state === "defeat") {
      this.timer += this.world.dt;
      // Winning moves on to the next level; losing replays the same level on a fresh planet. A
      // custom level or scenario just starts over.
      if (this.timer > END_TIME || (this.timer > END_SKIP && input.pressed.has("confirm"))) {
        this.restart(this.state === "victory" && !this.custom ? this.level + 1 : this.level, this.state === "defeat");
      }
    }
  }

  /** Seconds until the end-of-round screen moves on. */
  get endTimeLeft() {
    return Math.max(0, END_TIME - this.timer);
  }

  /** What is being played, for the HUD and the dev panel. */
  where() {
    const spec = this.spec;
    const mods = spec?.modifiers.length ? ` (${spec.modifiers.map((m) => MODIFIERS[m].name).join(", ")})` : "";
    if (this.run.kind === "scenario") return `scenario: ${this.run.scenario.name}${mods}`;
    if (this.custom) return `custom level: ${spec?.flocks.map(describeFlock).join(" · ") || "no flocks"}${mods}`;
    return `level ${this.level}${this.plan ? ` · ${this.plan.template.name}` : ""}${mods}`;
  }

  briefingData(): BriefingData {
    const w = this.world;
    const spec = this.spec!;
    const weapons = w.attacks.weapons.map((x) => x.id);
    const enemies = this.briefingEnemies();
    const run = this.run;
    return {
      level: this.level,
      heading: run.kind === "scenario" ? run.scenario.name : this.custom ? "Dev" : undefined,
      template:
        run.kind === "scenario"
          ? { name: "Scenario", blurb: run.scenario.blurb, boss: false }
          : this.custom
            ? { name: "Custom level", blurb: "Set up in the dev panel.", boss: false }
            : this.plan && { name: this.plan.template.name, blurb: this.plan.template.blurb, boss: !!this.plan.template.boss },
      modifiers: spec.modifiers.map((m) => MODIFIERS[m]),
      reason: this.briefing,
      weapons,
      perks: w.loadout.perks,
      enemies,
      fresh:
        this.briefing === "pause" || this.custom || this.level < 2
          ? []
          : [...weapons, ...enemies.map((e) => e.type.id)].filter((x) => UNLOCKS[x] === this.level),
    };
  }

  private briefingEnemies(): BriefingEnemy[] {
    const { planet, rules } = this.world;
    const out: BriefingEnemy[] = [];
    const seen = new Set<string>();
    const add = (e: BriefingEnemy) => {
      const key = `${e.type.id}:${JSON.stringify(e.params)}`;
      if (!seen.has(key)) out.push(e);
      seen.add(key);
    };
    if (planet.queen) add({ type: boidType("queen"), params: resolveParams(boidType("queen"), planet.queen.params) });
    const flocks = [...(planet.queen ? [planet.queen.escort] : []), ...planet.flocks.map((f) => f.spec)];
    for (const f of flocks)
      for (const m of f.members) {
        if (m.count < 1) continue;
        const type = boidType(m.type);
        const p = resolveParams(type, m.params);
        add({ type, params: { ...p, hp: Math.max(1, Math.round(p.hp * rules.swarm.hp)), size: p.size * rules.swarm.size } });
      }
    return out;
  }
}
