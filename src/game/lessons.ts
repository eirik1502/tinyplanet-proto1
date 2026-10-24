import type { GameEvents } from "./events";
import type { World } from "./world";

// Lessons: short prompts that teach the controls in play, one at a time, each until the player
// has done what it teaches. A lesson is learned by doing it (whether or not it was showing), and
// the world reports that as a `learned` event, so the browser can remember it between sessions.
// Info lessons have nothing to do: they show for a moment after something happens (the safety
// net catching the player) and count as learned once seen.
//
// Lesson text marks buttons in braces: {jump}, {sword}, {spear} (actions), {move} (the move
// input) and {aim} (what aims a jump: the move input, or the pointer). The HUD draws them as keys.

/** Scratch state a lesson's `check` may keep (reset on a new world). */
type Memo = Record<string, number>;

export interface Lesson {
  id: string;
  text: string;
  /** Lessons that must be learned before this one shows. */
  after?: string[];
  /** Shown while this holds (after `delay` s of it holding). */
  when?: (w: World) => boolean;
  delay?: number;
  /** Done when this event happens (passing `test`), `times` times. */
  done?: Done;
  /** Done when this turns true; checked every step. */
  check?: (w: World, m: Memo) => boolean;
  /** An info lesson: shown for `hold` s after this event, then learned. */
  info?: { on: Done; hold: number };
}

interface Done {
  on: keyof GameEvents & string;
  test?: (e: never, w: World) => boolean;
  times?: number;
}

/** Done on `on` events passing `test`. */
function on<K extends keyof GameEvents & string>(type: K, test?: (e: GameEvents[K], w: World) => boolean, times?: number): Done {
  return { on: type, test: test as Done["test"], times };
}

const hanging = (w: World) => w.player.mode === "hang";
const inAir = (w: World) => w.player.mode === "air";
const hasWeapon = (w: World, id: string) => w.attacks.weapons.some((x) => x.id === id);

/** Distance to the closest living boid. */
function enemyDistance(w: World) {
  const p = w.player;
  let best = Infinity;
  for (const b of w.swarm.boids) if (b.hp > 0) best = Math.min(best, Math.hypot(b.x - p.x, b.y - p.y));
  return best;
}

/** Grabbed a rim of another island than the one jumped from. */
const landedElsewhere = (w: World) => w.player.island !== w.player.launchIsland;

export const LESSONS: Lesson[] = [
  {
    id: "climb",
    text: "{move} climb around the rim",
    when: hanging,
    delay: 1,
    // Climbed this far along rims in all (not counting slides after landing).
    check: (w, m) => {
      const p = w.player;
      if (p.mode !== "hang" || m.island !== p.island || p.slide) {
        m.island = p.mode === "hang" ? p.island : -1;
        m.s = p.s;
        return false;
      }
      m.climbed = (m.climbed ?? 0) + Math.min(50, Math.abs(p.s - m.s!));
      m.s = p.s;
      return m.climbed > 25;
    },
  },
  { id: "jump", text: "{jump} jump · hold it to jump higher", after: ["climb"], when: hanging, delay: 0.8, done: on("jump") },
  {
    id: "aimJump",
    text: "{aim} aim the jump · the line turns green when it reaches an island",
    after: ["jump"],
    when: hanging,
    delay: 0.5,
    done: on("land", (_, w) => landedElsewhere(w)),
  },
  { id: "steer", text: "{move} steer in the air", after: ["jump"], when: (w) => inAir(w) && w.player.airTime > 0.25, done: on("land", (_, w) => landedElsewhere(w), 2) },
  {
    id: "doubleJump",
    text: "{jump} again in the air: double jump",
    after: ["jump"],
    when: (w) => inAir(w) && w.player.airJumps > 0 && w.player.vz < 0,
    done: on("doubleJump"),
  },
  { id: "net", text: "Safety net: it catches you once per flight", info: { on: on("netBounce"), hold: 2.5 } },
  { id: "lost", text: "Fell into the haze: back to the last rim, with a little less health", info: { on: on("respawn"), hold: 3 } },
  {
    id: "sword",
    text: "{sword} sword",
    when: (w) => hasWeapon(w, "sword") && enemyDistance(w) < 300,
    done: on("hit", (e) => e.weapon === "sword"),
  },
  {
    id: "combo",
    text: "{sword} {sword} {sword} keep hitting: swipe, lunge, smash",
    after: ["sword"],
    when: (w) => hasWeapon(w, "sword") && enemyDistance(w) < 300,
    done: on("attack", (e) => e.weapon === "sword" && e.step === 3),
  },
  {
    id: "airHit",
    text: "Hits in the air give back your double jump",
    after: ["sword"],
    info: { on: on("hit", (e, w) => e.source === w.player.id && w.player.mode === "air"), hold: 2.5 },
  },
  { id: "portal", text: "The portal is open: jump into it", info: { on: on("portalOpen"), hold: 3.5 } },
  {
    id: "spear",
    text: "{spear} throw the spear",
    when: (w) => hasWeapon(w, "spear") && enemyDistance(w) < 600,
    delay: 1,
    done: on("attack", (e) => e.weapon === "spear"),
  },
];

/** How long a showing lesson stays up after its `when` stops holding (s), so it doesn't flicker. */
const LINGER = 0.4;

/** Tracks which lessons are learned and which one is showing, in one world. */
export class Lessons {
  readonly learned: Set<string>;
  /** The lesson on screen, and for how long it has been (world time). */
  showing: { lesson: Lesson; age: number } | null = null;
  private waited = new Map<string, number>();
  private counts = new Map<string, number>();
  private memos = new Map<string, Memo>();
  private infoLeft = 0;
  private off = 0;

  constructor(
    private w: World,
    learned: Iterable<string> = [],
    readonly lessons: Lesson[] = LESSONS,
  ) {
    this.learned = new Set(learned);
    const owner = { owner: w.lifetime };
    for (const l of lessons) {
      if (this.learned.has(l.id)) continue;
      if (l.done) {
        const d = l.done;
        w.events.on(d.on, (e) => {
          if (this.learned.has(l.id) || (d.test && !d.test(e as never, w))) return;
          const n = (this.counts.get(l.id) ?? 0) + 1;
          this.counts.set(l.id, n);
          if (n >= (d.times ?? 1)) this.learn(l);
        }, owner);
      }
      if (l.info) {
        const d = l.info.on;
        w.events.on(d.on, (e) => {
          if (this.learned.has(l.id) || !this.ready(l) || (d.test && !d.test(e as never, w))) return;
          this.showing = { lesson: l, age: 0 };
          this.infoLeft = l.info!.hold;
        }, owner);
      }
    }
  }

  private ready(l: Lesson) {
    return !l.after || l.after.every((id) => this.learned.has(id));
  }

  private learn(l: Lesson) {
    this.learned.add(l.id);
    if (this.showing?.lesson === l) this.showing = null;
    this.w.events.emit("learned", { id: l.id });
  }

  /** Advance by world time `dt`: check progress, then pick what to show. */
  update(dt: number) {
    const w = this.w;
    for (const l of this.lessons) {
      if (l.check && !this.learned.has(l.id)) {
        let m = this.memos.get(l.id);
        if (!m) this.memos.set(l.id, (m = {}));
        if (l.check(w, m)) this.learn(l);
      }
    }

    // An info lesson holds the screen until its time is up.
    const cur = this.showing;
    if (cur?.lesson.info) {
      cur.age += dt;
      this.infoLeft -= dt;
      if (this.infoLeft <= 0) this.learn(cur.lesson);
      return;
    }

    const playing = w.playing && w.player.freeze <= 0;
    let next: Lesson | null = null;
    for (const l of this.lessons) {
      if (!l.when || this.learned.has(l.id)) continue;
      const holds = playing && this.ready(l) && l.when(w);
      const waited = holds ? (this.waited.get(l.id) ?? 0) + dt : 0;
      this.waited.set(l.id, waited);
      if (!next && holds && waited >= (l.delay ?? 0)) next = l;
    }
    if (next) {
      this.off = 0;
      if (cur?.lesson === next) cur.age += dt;
      else this.showing = { lesson: next, age: 0 };
    } else if (cur) {
      this.off += dt;
      cur.age += dt;
      if (this.off > LINGER) this.showing = null;
    }
  }
}
