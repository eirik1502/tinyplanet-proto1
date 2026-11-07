import { EventBus } from "../core/events";
import { mulberry32, nextSeed, type Rng } from "../core/rng";
import { offer, START_SKILLS, type SkillId, type SkillLevels } from "../attacks/skills";
import type { WeaponId } from "../attacks/types";
import { describeFlock } from "../enemies/flocks";
import { earlyHelp, levelBase, MODIFIERS, planLevel, resolveLevel, type LevelPlan, type LevelSpec, type LevelTemplate } from "../levels/levels";
import type { Params } from "../params/store";
import type { InputFrame } from "../input/types";
import { TUTORIAL, TUTORIAL_NAME, TUTORIAL_SEED } from "../levels/tutorial";
import type { Scenario } from "./scenario";
import { World } from "./world";

// A session: what's being played, round after round. It picks each level (the progression, a
// custom level or a scenario), makes a World for every round, and runs the screens around it:
// the briefing before each level (also the pause screen), and the end of a round, after which a
// win moves on to the next level and a defeat retries the level on a fresh planet. On a normal run
// the player builds up skills: after each win (but the tutorial's) they pick one of a few offered,
// and keep them through defeats until the run starts over. No DOM: the browser shows the briefing
// and the pick when the session says so, and a headless run skips the briefing and picks at random.

/** What a round plays: the normal progression from a level (0: the tutorial), a custom level, or a scenario. */
export type Run =
  | { kind: "normal"; level: number; template: LevelTemplate | null; skills?: SkillLevels }
  | { kind: "custom"; spec: LevelSpec }
  | { kind: "scenario"; scenario: Scenario };

export type SessionState = "briefing" | "play" | "victory" | "defeat" | "pick";
export type BriefingReason = "new" | "retry" | "pause";

export interface SessionEvents {
  [type: string]: object;
  /** A new world: presenters attach to it. `arrival` "portal": the player followed the queen here. */
  roundStart: { world: World; arrival: "portal" | null };
  briefingOpen: { reason: BriefingReason };
  briefingClose: object;
  /** Skills to pick one of, after a win. */
  pickOpen: { offer: SkillId[] };
  /** The highlighted one moved. */
  pickChange: { choice: number };
  pickClose: { skill: SkillId };
}

/** What the briefing shows. */
export interface BriefingData {
  level: number;
  /** Replaces "Level n" in the title. */
  heading?: string;
  template: { name: string; boss: boolean } | null;
  /** How to win, in a few words. */
  goal: string;
  /** Falling into the haze doesn't hurt on this level. */
  noFallDamage: boolean;
  modifiers: { name: string; blurb: string }[];
  reason: BriefingReason;
  weapons: WeaponId[];
  skills: SkillLevels;
  /** The skill (by id) new on this level. */
  fresh: string[];
}

export interface SessionOptions {
  /** Seeds every planet of the session (each round draws a new one). Default: random. */
  seed?: number;
  /** Go straight to play instead of showing briefings (headless). */
  skipBriefings?: boolean;
  /** Lessons already learned, asked for each new world (the browser remembers them). */
  learned?: () => Iterable<string>;
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
  /** The skills of a normal run so far. */
  skills: SkillLevels = {};
  /** On the pick screen: the skills offered, and which one is highlighted. */
  offer: SkillId[] = [];
  choice = 0;
  /** The skill picked before this level, tagged new in its briefing. */
  private picked: SkillId | null = null;
  private pickMove = 0;
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

  /** The tutorial, as level 0 of a normal run. */
  get tutorial() {
    return this.run.kind === "normal" && this.level === 0;
  }

  /** Start a run: the normal progression from a level, a custom level or a scenario. */
  start(run: Run) {
    this.run = run;
    this.plan = null;
    this.spec = null;
    this.skills = run.kind === "normal" ? { ...(run.skills ?? START_SKILLS) } : {};
    this.picked = null;
    this.restart(run.kind === "normal" ? run.level : 1);
  }

  /** Make the world for `level` and show its briefing (a defeat retries on a fresh planet). */
  restart(level: number, retry = false) {
    this.level = level;
    const run = this.run;
    const lv = this.params.world.levels;
    let seed = nextSeed(this.rand);
    if (run.kind === "custom") this.spec = structuredClone(run.spec);
    else if (run.kind === "normal" && level === 0) {
      this.plan = null;
      this.spec = structuredClone(TUTORIAL);
      seed = TUTORIAL_SEED;
    } else if (run.kind === "scenario") {
      this.spec = structuredClone(run.scenario.spec);
      seed = run.scenario.seed ?? seed;
    } else if (!retry || !this.spec) {
      this.plan = planLevel(level, this.plan?.template ?? null, {
        force: run.template,
        modifiersFrom: lv.modifiersFrom,
        twoModifiersFrom: lv.twoModifiersFrom,
        rand: this.rand,
      });
      this.spec = {
        ...resolveLevel(this.plan.template, levelBase(level, this.params.world), {
          modifiers: this.plan.modifiers,
          skills: this.skills,
          rand: this.rand,
        }),
        ...earlyHelp(level),
      };
    }
    const arrival = this.world?.portal?.entered && !retry ? "portal" : null;
    this.world?.dispose();
    const learned = this.spec!.lessons === "all" ? [] : this.opts.learned?.();
    this.world = new World({ spec: this.spec!, seed, params: this.params, learned });
    this.events.emit("roundStart", { world: this.world, arrival });
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

  /** Whether winning this round leads to a pick. */
  get picksNext() {
    return this.run.kind === "normal" && !this.tutorial && offer(this.skills, () => 0).length > 0;
  }

  private openPick() {
    this.offer = offer(this.skills, this.rand);
    if (this.opts.skipBriefings) return this.choose(Math.floor(this.rand() * this.offer.length));
    this.state = "pick";
    this.choice = 0;
    this.timer = 0;
    this.pickMove = 0;
    this.events.emit("pickOpen", { offer: this.offer });
  }

  /** Highlight another offered skill. */
  highlight(i: number) {
    if (this.state !== "pick" || i < 0 || i >= this.offer.length || i === this.choice) return;
    this.choice = i;
    this.events.emit("pickChange", { choice: i });
  }

  /** Take the `i`th skill offered, and go on to the next level. */
  choose(i: number) {
    const id = this.offer[i];
    if (!id) return;
    this.skills[id] = (this.skills[id] ?? 0) + 1;
    this.picked = id;
    this.offer = [];
    if (this.state === "pick") this.events.emit("pickClose", { skill: id });
    this.restart(this.level + 1);
  }

  /** One frame of `dtReal` real seconds. */
  step(dtReal: number, input: InputFrame) {
    if (this.state === "pick") {
      // Left and right move the highlight, a press at a time; confirm takes it.
      this.timer += dtReal;
      const x = input.move.x;
      const dir = x > 0.5 ? 1 : x < -0.5 ? -1 : 0;
      if (dir && dir !== this.pickMove) this.highlight(this.choice + dir);
      this.pickMove = dir;
      if (this.timer > 0.4 && input.pressed.has("confirm")) this.choose(this.choice);
      return;
    }
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
        if (this.state === "victory" && this.picksNext) this.openPick();
        else this.restart(this.state === "victory" && !this.custom ? this.level + 1 : this.level, this.state === "defeat");
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
    if (this.tutorial) return "tutorial";
    return `level ${this.level}${this.plan ? ` · ${this.plan.template.name}` : ""}${mods}`;
  }

  briefingData(): BriefingData {
    const w = this.world;
    const spec = this.spec!;
    const weapons = w.attacks.weapons.map((x) => x.id);
    const run = this.run;
    return {
      level: this.level,
      heading: run.kind === "scenario" ? run.scenario.name : this.custom ? "Dev" : this.tutorial ? "Tutorial" : undefined,
      template:
        this.tutorial
          ? { name: TUTORIAL_NAME, boss: false }
          : run.kind === "scenario"
          ? { name: "Scenario", boss: false }
          : this.custom
            ? { name: "Custom level", boss: false }
            : this.plan && { name: this.plan.template.name, boss: !!this.plan.template.boss },
      goal: w.portal ? "Beat every boid, then take the portal" : w.swarm.queen ? "Beat the queen, then follow her through her portal" : "Kill every boid",
      noFallDamage: !!spec.noFallDamage,
      modifiers: spec.modifiers.map((m) => MODIFIERS[m]),
      reason: this.briefing,
      weapons,
      skills: w.loadout.skills,
      fresh: this.briefing === "new" && !this.custom && this.picked ? [this.picked] : [],
    };
  }
}
