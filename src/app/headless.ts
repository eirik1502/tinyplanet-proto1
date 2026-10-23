import { Session, type Run } from "../game/session";
import type { World } from "../game/world";
import { BotInput, IdleInput } from "../input/scripted";
import type { InputSource } from "../input/types";
import { ALL_TEMPLATES } from "../levels/levels";
import { makeParams, type ParamsPatch } from "../params/store";
import { scenario, SCENARIOS } from "../scenarios";

// Run the game without a browser, as fast as the machine allows: no rendering, no sound, no
// clock. A session plays rounds with a scripted input source and prints what happened.
//
//   bun run sim --scenario melee-drill --seconds 120
//   bun run sim --level 5 --rounds 3 --input bot --seed 42
//   bun run sim --scenario movement --set move.jump.height=90 --json

const HELP = `Usage: bun run sim [options]
  --scenario <id>      play a scenario (${SCENARIOS.map((s) => s.id).join(", ")})
  --level <n>          play the progression from level n (default 1)
  --template <name>    with --level: use this template on every level
  --input bot|idle     who plays (default bot)
  --rounds <n>         stop after this many rounds (default 1)
  --seconds <s>        stop after this much game time in all (default 600)
  --dt <s>             step size (default 1/60)
  --seed <n>           seed for the planets and the bot (default 1)
  --set <path>=<v>     override a param, e.g. move.jump.height=90 (repeatable)
  --json               print the result as JSON`;

function parseArgs(argv: string[]) {
  const o = { scenario: "", level: 1, template: "", input: "bot", rounds: 1, seconds: 600, dt: 1 / 60, seed: 1, set: [] as string[], json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const v = () => argv[++i] ?? "";
    if (a === "--scenario") o.scenario = v();
    else if (a === "--level") o.level = Number(v());
    else if (a === "--template") o.template = v();
    else if (a === "--input") o.input = v();
    else if (a === "--rounds") o.rounds = Number(v());
    else if (a === "--seconds") o.seconds = Number(v());
    else if (a === "--dt") o.dt = fraction(v());
    else if (a === "--seed") o.seed = Number(v());
    else if (a === "--set") o.set.push(v());
    else if (a === "--json") o.json = true;
    else {
      console.log(HELP);
      process.exit(a === "--help" || a === "-h" ? 0 : 1);
    }
  }
  return o;
}

/** "1/60" or "0.016" */
function fraction(s: string) {
  const [n, d] = s.split("/").map(Number);
  const v = d ? n! / d : n!;
  if (!(v > 0)) throw new Error(`bad --dt ${s}`);
  return v;
}

/** "move.jump.height=90" → { move: { jump: { height: 90 } } } */
function patchFrom(sets: string[]): ParamsPatch {
  const patch: Record<string, Record<string, Record<string, number>>> = {};
  for (const s of sets) {
    const [path, value] = s.split("=");
    const [t, g, k] = (path ?? "").split(".");
    if (!t || !g || !k || !Number.isFinite(Number(value))) throw new Error(`bad --set ${s}`);
    ((patch[t] ??= {})[g] ??= {})[k] = Number(value);
  }
  return patch as ParamsPatch;
}

interface RoundStats {
  where: string;
  outcome: string;
  seconds: number;
  playerHp: number;
  kills: number;
  hitsDealt: number;
  damageTaken: number;
  boidsLeft: number;
  events: Record<string, number>;
}

const args = parseArgs(process.argv.slice(2));
const params = makeParams(patchFrom(args.set));
let run: Run;
if (args.scenario) {
  const s = scenario(args.scenario);
  if (!s) throw new Error(`no scenario "${args.scenario}" (have: ${SCENARIOS.map((x) => x.id).join(", ")})`);
  run = { kind: "scenario", scenario: s };
} else {
  const template = args.template ? (ALL_TEMPLATES.find((t) => t.name === args.template) ?? null) : null;
  run = { kind: "normal", level: args.level, template };
}

const session = new Session(params, { seed: args.seed, skipBriefings: true });
const input: InputSource = args.input === "idle" ? new IdleInput() : new BotInput(() => session.world, args.seed, args.dt);
const rounds: RoundStats[] = [];
const statsOf = new Map<World, RoundStats>();

session.events.on("roundStart", ({ world }) => {
  const r: RoundStats = { where: session.where(), outcome: "unfinished", seconds: 0, playerHp: 0, kills: 0, hitsDealt: 0, damageTaken: 0, boidsLeft: 0, events: {} };
  rounds.push(r);
  statsOf.set(world, r);
  watch(world, r);
});

function watch(w: World, r: RoundStats) {
  w.events.afterAny((type) => (r.events[String(type)] = (r.events[String(type)] ?? 0) + 1));
  w.events.on("hit", (e) => {
    r.hitsDealt++;
    if (e.killed) r.kills++;
  });
  w.events.on("hurt", (e) => (r.damageTaken += e.damage));
  w.events.on("roundOver", (e) => (r.outcome = e.outcome));
}

const started = performance.now();
let simTime = 0;
let steps = 0;
session.start(run);
while (simTime < args.seconds) {
  const w = session.world;
  session.step(args.dt, input.poll({ aimFromScreen: () => null }));
  w.events.flush();
  simTime += args.dt;
  steps++;
  const r = statsOf.get(w)!;
  r.seconds = w.time;
  r.playerHp = Math.round(w.playerCtl.health.hp);
  r.boidsLeft = w.swarm.boids.filter((b) => b.hp > 0 && b !== w.swarm.queen).length;
  // The round ended and the next began: stop once enough have been played.
  if (session.world !== w && rounds.length > args.rounds) {
    rounds.pop();
    break;
  }
}
const wall = (performance.now() - started) / 1000;

const result = { rounds, steps, simSeconds: Number(simTime.toFixed(2)), wallSeconds: Number(wall.toFixed(3)), speed: Number((simTime / wall).toFixed(1)) };
if (args.json) console.log(JSON.stringify(result, null, 2));
else {
  for (const [i, r] of rounds.entries()) {
    console.log(`Round ${i + 1}: ${r.where}`);
    console.log(`  ${r.outcome} after ${r.seconds.toFixed(1)}s · hp ${r.playerHp} · ${r.kills} kills, ${r.hitsDealt} hits dealt, ${r.damageTaken} damage taken · ${r.boidsLeft} boids left`);
    console.log(`  events: ${Object.entries(r.events).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(", ")}`);
  }
  console.log(`${steps} steps, ${result.simSeconds}s of game in ${result.wallSeconds}s (${result.speed}× real time)`);
}
