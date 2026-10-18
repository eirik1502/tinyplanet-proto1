import { Island, ISLAND_TOP, mulberry32, type Vec } from "./island";
import { Projector, type Projected } from "./projection";
import { createTuningPanel, params } from "./tuning";
import { BLAST_TIME, Combat, hitStop, type Blast, type Boid } from "./combat";
import { generatePlanet, type Planet, type SpawnKind } from "./planet";
import { applyVolumes, music, sfx, toggleMute, unlockAudio } from "./audio";
import { Avatar, type AvatarView } from "./avatar";
import { briefingHtml, type InputMode, type Weapon } from "./briefing";

// ---------------------------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------------------------

const canvas = document.getElementById("c") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
let W = 0;
let H = 0;
let dpr = 1;

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
}
window.addEventListener("resize", resize);
resize();

const proj = new Projector();

/** The current planet; a new one is generated every round. */
let planet: Planet;
let islands: Island[] = [];

// Game parameters live in `params` (defaults in params.ts) and are editable live from the slider panel.
createTuningPanel();
const HANG_ALT = ISLAND_TOP - 9;

// ---------------------------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------------------------

const keys = new Set<string>();
const pressed = new Set<string>();
const released = new Set<string>();
window.addEventListener("keydown", (e) => {
  if (e.target instanceof HTMLInputElement) return;
  unlockAudio();
  if (e.code === "KeyM" && !e.repeat) toggleMute();
  if (!keys.has(e.code)) pressed.add(e.code);
  keys.add(e.code);
  if (e.code.startsWith("Arrow") || e.code === "Space") e.preventDefault();
});
window.addEventListener("keyup", (e) => {
  keys.delete(e.code);
  released.add(e.code);
});
window.addEventListener("blur", () => keys.clear());
window.addEventListener("pointerdown", unlockAudio);

/**
 * Input mode, toggled with I and remembered. "keyboard": the arrows / WASD both move and aim.
 * "mouse": they still move, but jumps, double jumps and attacks aim at the cursor, and the mouse
 * buttons attack (left: sword, right: spear).
 */
const INPUT_MODE_KEY = "planetproto.inputMode";
let inputMode: InputMode = "keyboard";
try {
  if (localStorage.getItem(INPUT_MODE_KEY) === "mouse") inputMode = "mouse";
} catch {
  // Ignore: persistence is a convenience.
}
const mouse = { x: 0, y: 0 };

function setInputMode(m: InputMode) {
  inputMode = m;
  try {
    localStorage.setItem(INPUT_MODE_KEY, m);
  } catch {
    // Ignore: persistence is a convenience.
  }
  canvas.style.cursor = m === "mouse" ? "crosshair" : "";
}
setInputMode(inputMode);

window.addEventListener("keydown", (e) => {
  if (e.code === "KeyI" && !e.repeat && !(e.target instanceof HTMLInputElement))
  {
    setInputMode(inputMode === "mouse" ? "keyboard" : "mouse");
    if (game.state === "briefing") showBriefing();
  }
});
window.addEventListener("pointermove", (e) => {
  mouse.x = e.clientX;
  mouse.y = e.clientY;
});
// Mouse buttons go into the key sets as "Mouse0" (left) / "Mouse2" (right). Presses only count on
// the canvas, so clicking the tuning panel doesn't attack; releases count anywhere.
canvas.addEventListener("mousedown", (e) => {
  const code = `Mouse${e.button}`;
  if (!keys.has(code)) pressed.add(code);
  keys.add(code);
});
window.addEventListener("mouseup", (e) => {
  const code = `Mouse${e.button}`;
  keys.delete(code);
  released.add(code);
});
canvas.addEventListener("contextmenu", (e) => e.preventDefault());

/**
 * In mouse mode, the world direction (unit vector) from the player to the cursor, taken at the
 * player's altitude. Null in keyboard mode, or with the cursor right on the player.
 */
function mouseAim(): Vec | null {
  if (inputMode !== "mouse") return null;
  const p = player;
  const m = proj.unproject(mouse.x, mouse.y, p.mode === "hang" ? ISLAND_TOP : p.alt);
  const dx = m.x - p.x;
  const dy = m.y - p.y;
  const l = Math.hypot(dx, dy);
  return l > 1 ? { x: dx / l, y: dy / l } : null;
}

/** Arrow keys / WASD as a screen-space unit vector (y down). */
function inputDir(): Vec {
  const x = +(keys.has("KeyD") || keys.has("ArrowRight")) - +(keys.has("KeyA") || keys.has("ArrowLeft"));
  const y = +(keys.has("KeyS") || keys.has("ArrowDown")) - +(keys.has("KeyW") || keys.has("ArrowUp"));
  const l = Math.hypot(x, y);
  return l > 0 ? { x: x / l, y: y / l } : { x: 0, y: 0 };
}

// ---------------------------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------------------------

type Mode = "hang" | "air" | "lost";

const WEAPON_KEYS: Record<Weapon, string[]> = { sword: ["KeyZ", "KeyJ"], spear: ["KeyX", "KeyK"] };
const WEAPON_BUTTONS: Record<Weapon, string> = { sword: "Mouse0", spear: "Mouse2" };

const player = {
  mode: "hang" as Mode,
  island: 0,
  s: 0,
  x: 0,
  y: 0,
  alt: HANG_ALT,
  vx: 0,
  vy: 0,
  vz: 0,
  jumpHeld: false, // Space still held since the last jump: releasing early cuts it short
  airJumps: 0, // double jumps left (0 or 1): one per flight, refilled by hits in the air
  netUsed: false, // the safety bounce below the rim is spent until the next grab
  focus: 1, // 0..1 slow-motion budget
  freeze: 0, // hit-stop left (s, real time): a frozen player doesn't move
  redirect: false, // after this hit-stop, turn the flight toward the input (sword hits)
  anim: 0, // animation clock (s); stops during hit-stop
  slide: 0, // speed along the rim (per s) after a fast grab
  launchIsland: -1,
  airTime: 0,
  lostTimer: 0,
  // last safe grip, for respawning after falling into the haze
  safeIsland: 0,
  safeS: 0,
  // rendered position, smoothed so grabbing / climbing doesn't snap
  rx: 0,
  ry: 0,
  ralt: HANG_ALT,
  facing: 0, // world angle pointing from the player to the rim (or flight direction)
  spin: 0,
  hp: params.player.health.max,
  invuln: 0,
  swordCd: 0,
  spearCd: 0,
  /** Attack being aimed (key held), or null. */
  aim: null as null | { weapon: Weapon; t: number; angle: number },
};

/** Hang on the rim of the start island, facing its nearest neighbour, at full health. */
function resetPlayer() {
  const start = islands[planet.startIsland]!;
  const others = islands.filter((i) => i !== start);
  const near = others.length
    ? others.reduce((a, b) =>
        Math.hypot(a.cx - start.cx, a.cy - start.cy) < Math.hypot(b.cx - start.cx, b.cy - start.cy) ? a : b,
      )
    : { cx: planet.bounds.x, cy: planet.bounds.y };
  grab(planet.startIsland, start.closest(near.cx, near.cy).s);
  const e = start.pointAt(player.s);
  player.x = player.rx = e.x + e.nx * 7;
  player.y = player.ry = e.y + e.ny * 7;
  player.alt = player.ralt = HANG_ALT;
  player.slide = 0;
  player.hp = params.player.health.max;
  player.invuln = 0;
  player.swordCd = player.spearCd = 0;
  player.aim = null;
}

/** The player's look and animation. */
const avatar = new Avatar();

function avatarView(): AvatarView {
  const p = player;
  return {
    mode: p.mode,
    x: p.rx,
    y: p.ry,
    alt: p.ralt,
    facing: p.facing,
    vz: p.vz,
    aim: p.aim ? { weapon: p.aim.weapon, angle: p.aim.angle, power: aimPower() } : null,
    spearReady: unlocked("spear") && p.spearCd <= 0,
    frozen: p.freeze > 0,
  };
}

// ---------------------------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------------------------

const combat = new Combat();
type GameState = "briefing" | "play" | "victory" | "defeat";
const game = { state: "play" as GameState, timer: 0, level: 0, shake: 0, briefing: "new" as "new" | "retry" | "pause" };

/** The level each weapon and enemy first appears on. */
const UNLOCKS: Record<Weapon | SpawnKind, number> = { sword: 1, melee: 1, ranged: 2, spear: 3, bomber: 3 };
const unlocked = (what: Weapon | SpawnKind, level = game.level) => level >= UNLOCKS[what];

/**
 * Planet size and swarm for a level. Levels 1-3 are hand-tuned intros; from level 4 on it's the
 * level 4 values plus a per-level increase. Locked enemies never spawn.
 */
function levelSpec(level: number) {
  const w = params.world;
  const intro = [w.intro1, w.intro2, w.intro3][level - 1];
  const n = level - 4;
  const a = intro ?? {
    radius: w.level4.radius + w.perLevel.radius * n,
    islands: w.level4.islands + w.perLevel.islands * n,
    melee: w.level4.melee + w.perLevel.melee * n,
    ranged: w.level4.ranged + w.perLevel.ranged * n,
    bombers: w.level4.bombers + w.perLevel.bombers * n,
    escort: params.boids.queen.escort,
    queenHp: params.boids.queen.hp,
  };
  return {
    radius: a.radius,
    islandCount: Math.max(1, Math.round(a.islands)),
    meleeCount: Math.round(a.melee),
    rangedCount: unlocked("ranged", level) ? Math.round(a.ranged) : 0,
    bomberCount: unlocked("bomber", level) ? Math.round(a.bombers) : 0,
    flockSize: params.boids.flocks.startSize,
    escortCount: Math.round(a.escort),
    queenHp: Math.max(1, a.queenHp),
  };
}

/** Generate a new planet for `level` and show its briefing (a defeat retries on a fresh planet). */
function restart(level: number, retry = false) {
  game.level = level;
  planet = generatePlanet(Math.floor(Math.random() * 1e9), levelSpec(level));
  islands = planet.islands;
  combat.reset(planet);
  music.setSeed(planet.seed);
  resetPlayer();
  game.timer = 0;
  cam.x = player.x;
  cam.y = player.y;
  openBriefing(retry ? "retry" : "new");
}

// ---------------------------------------------------------------------------------------------
// Briefing (before each level, and the pause screen)
// ---------------------------------------------------------------------------------------------

const briefingEl = document.getElementById("briefing")!;

function showBriefing() {
  const weapons = (["sword", "spear"] as const).filter((w) => unlocked(w));
  const enemies = (["melee", "ranged", "bomber"] as const).filter((k) => unlocked(k));
  briefingEl.innerHTML = briefingHtml({
    level: game.level,
    reason: game.briefing,
    inputMode,
    weapons,
    enemies,
    fresh: game.briefing === "pause" ? [] : [...weapons, ...enemies].filter((x) => UNLOCKS[x] === game.level && game.level > 1),
  });
  briefingEl.hidden = false;
}

function openBriefing(reason: typeof game.briefing) {
  game.state = "briefing";
  game.briefing = reason;
  game.timer = 0;
  player.aim = null;
  showBriefing();
}

function closeBriefing() {
  briefingEl.hidden = true;
  game.state = "play";
  game.timer = 0;
  // The key that started the level shouldn't also jump or attack.
  pressed.clear();
  keys.clear();
}

briefingEl.addEventListener("click", (e) => {
  const t = (e.target as HTMLElement).closest<HTMLElement>("[data-mode],[data-start]");
  if (!t) return;
  unlockAudio();
  if (t.dataset.mode) {
    setInputMode(t.dataset.mode as InputMode);
    showBriefing();
  } else closeBriefing();
});

/** While the briefing is up the world is paused: only its own keys do anything. */
function updateBriefing(dtReal: number) {
  game.timer += dtReal;
  if (game.timer > 0.3 && (pressed.has("Enter") || pressed.has("Space") || (game.briefing === "pause" && pressed.has("Escape"))))
    closeBriefing();
  pressed.clear();
  released.clear();
  sfx.loops(0, 0);
  music.update(0, 0, 0.25);
  applyVolumes();
}

function hitPlayer(dmg: number, fromX: number, fromY: number): boolean {
  const p = player;
  if (p.invuln > 0 || game.state !== "play") return false;
  p.hp = Math.max(0, p.hp - dmg);
  p.freeze = Math.max(p.freeze, hitStop(dmg));
  p.invuln = params.player.health.invulnTime;
  game.shake = 0.35;
  sfx.playerHurt();
  avatar.hurt(fromX, fromY, p.x, p.y);
  combat.burst(p.x, p.y, p.alt, 10, "#ffd0b0");
  if (p.mode === "air") {
    // Knock the flight sideways.
    const l = Math.hypot(p.x - fromX, p.y - fromY) || 1;
    p.vx += ((p.x - fromX) / l) * 160;
    p.vy += ((p.y - fromY) / l) * 160;
  }
  if (p.hp <= 0) endRound("defeat");
  return true;
}

/**
 * Shove the player (a bomber's blast). In the air it adds to the flight; on a rim it blows them
 * off it: outward, keeping the push's sideways part, as if they had jumped.
 */
function pushPlayer(vx: number, vy: number, vz: number) {
  const p = player;
  if (game.state !== "play" || p.mode === "lost") return;
  game.shake = Math.max(game.shake, 0.5);
  if (p.mode === "air") {
    p.vx += vx;
    p.vy += vy;
    p.vz = Math.max(p.vz, vz);
    p.jumpHeld = false;
    return;
  }
  const e = islands[p.island]!.pointAt(p.s);
  const along = vx * e.tx + vy * e.ty;
  const out = Math.max(Math.abs(vx * e.nx + vy * e.ny), Math.hypot(vx, vy) * 0.6);
  p.x = e.x + e.nx * 12;
  p.y = e.y + e.ny * 12;
  p.alt = ISLAND_TOP;
  p.vx = e.nx * out + e.tx * along;
  p.vy = e.ny * out + e.ty * along;
  p.vz = vz;
  p.mode = "air";
  p.airTime = 0;
  p.launchIsland = p.island;
  p.jumpHeld = false;
  p.airJumps = 1;
  p.slide = 0;
}

const cam = { x: 0, y: 0, h: params.camera.view.height };

/** Grab a rim. Arriving fast turns the along-rim part of the velocity into a slide. */
function grab(islandIdx: number, s: number, vx = 0, vy = 0) {
  const e = islands[islandIdx]!.pointAt(s);
  const along = vx * e.tx + vy * e.ty;
  player.slide = Math.hypot(vx, vy) > params.move.slide.minSpeed ? along * params.move.slide.keep : 0;
  player.mode = "hang";
  player.island = islandIdx;
  player.s = s;
  player.vx = player.vy = player.vz = 0;
  player.jumpHeld = false;
  player.airJumps = 0;
  player.netUsed = false;
  player.focus = 1;
  player.safeIsland = islandIdx;
  player.safeS = s;
}

interface Flight { x: number; y: number; alt: number; vx: number; vy: number; vz: number; t: number }

/**
 * Launch speed (horizontal and vertical alike) of a full jump: a 45° arc that would land
 * `jump.length` away at launch height under plain gravity (the apex float carries it a bit further).
 */
function launchSpeed() {
  return Math.sqrt((params.move.jump.gravity * params.move.jump.length) / 2);
}

/** Launch state for a jump from rim parameter `s` in direction `angle`. */
function launch(islandIdx: number, s: number, angle: number): Flight {
  const e = islands[islandIdx]!.pointAt(s);
  const v = launchSpeed();
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  return { x: e.x + e.nx * 12, y: e.y + e.ny * 12, alt: ISLAND_TOP, vx: dx * v, vy: dy * v, vz: v, t: 0 };
}

/** Most a jump can lean away from straight out of the rim, so it clears the island it leaves. */
const MAX_JUMP_LEAN = 1.13;

/**
 * Jump direction from a rim: toward the input, or without input the way the player is sliding,
 * within MAX_JUMP_LEAN of straight out. Straight out when neither. In mouse mode `dir` points at the cursor.
 */
function jumpAngle(dir: Vec): number {
  const e = islands[player.island]!.pointAt(player.s);
  const out = Math.atan2(e.ny, e.nx);
  if (!dir.x && !dir.y) {
    if (!player.slide) return out;
    const side = Math.sign(player.slide);
    dir = { x: e.tx * side, y: e.ty * side };
  }
  let diff = Math.atan2(dir.y, dir.x) - out;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  return out + Math.max(-MAX_JUMP_LEAN, Math.min(MAX_JUMP_LEAN, diff));
}

/**
 * A jump from a slide keeps some of the slide's momentum: its velocity along the rim adds to the
 * launch, turning and speeding the jump, still within MAX_JUMP_LEAN of straight out.
 */
function carrySlide(f: Flight, e: { nx: number; ny: number; tx: number; ty: number }) {
  const carry = player.slide * params.move.slide.jumpCarry;
  if (!carry) return;
  const vx = f.vx + e.tx * carry;
  const vy = f.vy + e.ty * carry;
  const sp = Math.hypot(vx, vy);
  const out = Math.atan2(e.ny, e.nx);
  let diff = Math.atan2(vy, vx) - out;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  const a = out + Math.max(-MAX_JUMP_LEAN, Math.min(MAX_JUMP_LEAN, diff));
  f.vx = Math.cos(a) * sp;
  f.vy = Math.sin(a) * sp;
}

/** Gravity at vertical speed `vz`: weaker near the apex, so jumps hang there a moment. */
function gravityAt(vz: number) {
  const j = params.move.jump;
  return Math.abs(vz) < j.apexBand ? j.gravity * j.apexGravity : j.gravity;
}

/** The island whose rim is closest to the player. */
function closestIsland(): Island | null {
  let isl: Island | null = null;
  let bestD = Infinity;
  for (const i of islands) {
    const d = i.closest(player.x, player.y).d;
    if (d < bestD) {
      isl = i;
      bestD = d;
    }
  }
  return isl;
}

/**
 * The island with the nearest rim point inside the double-jump cone around `heading` that a
 * double jump of `push` speed can reach: heading there at the push speed before falling back to rim height.
 */
function islandAhead(push: number, heading: number): Island | null {
  const p = player;
  const half = (params.move.airJump.cone * Math.PI) / 360;

  // Time until the flight falls back to rim height.
  let alt = p.alt;
  let vz = p.vz;
  let t = 0;
  const step = 1 / 60;
  while (t < 5 && (vz > 0 || alt > ISLAND_TOP)) {
    vz -= gravityAt(vz) * step;
    alt += vz * step;
    t += step;
  }

  let isl: Island | null = null;
  let bestD = Infinity;
  for (const i of islands) {
    for (let s = 0; s < i.perimeter; s += 6) {
      const e = i.pointAt(s);
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d >= bestD) continue;
      let diff = Math.atan2(dy, dx) - heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      if (Math.abs(diff) > half) continue;
      const speed = Math.max(0, (p.vx * dx + p.vy * dy) / d) + push;
      if (d > speed * t) continue;
      isl = i;
      bestD = d;
    }
  }
  return isl;
}

/**
 * Double-jump direction. The target island is the nearest one the jump can reach inside a cone
 * around the heading; failing that, the closest island all around. On it, aim at the rim point
 * that needs the least turn from the heading (without a heading: the nearest point).
 * `aim` (the cursor direction in mouse mode) stands in for the heading when given.
 * Call after the jump's rise is set: `p.vz` decides how long the jump stays up.
 */
function doubleJumpDir(push: number, aim: Vec | null): Vec | null {
  const p = player;
  const hasHeading = aim !== null || Math.hypot(p.vx, p.vy) > 1;
  const heading = aim ? Math.atan2(aim.y, aim.x) : Math.atan2(p.vy, p.vx);
  const isl = (hasHeading && islandAhead(push, heading)) || closestIsland();
  if (!isl) return null;

  let tx = 0;
  let ty = 0;
  let best = Infinity;
  for (let s = 0; s < isl.perimeter; s += 6) {
    const e = isl.pointAt(s);
    let score: number;
    if (hasHeading) {
      const diff = Math.atan2(e.y - p.y, e.x - p.x) - heading;
      score = Math.abs(Math.atan2(Math.sin(diff), Math.cos(diff)));
    } else score = Math.hypot(e.x - p.x, e.y - p.y);
    if (score < best) {
      best = score;
      tx = e.x;
      ty = e.y;
    }
  }

  const d = Math.hypot(tx - p.x, ty - p.y) || 1;
  return { x: (tx - p.x) / d, y: (ty - p.y) / d };
}

/** The safety bounce: the first dip below the rim in a flight springs back up. */
function netBounce(f: { alt: number; vz: number }, used: boolean): boolean {
  if (used || f.vz >= 0 || f.alt > ISLAND_TOP - params.move.airJump.netDepth) return false;
  f.vz = params.move.airJump.netBounce;
  return true;
}

/**
 * Advance a flight by dt. Returns the island and rim parameter if it hit one: either by crossing a
 * rim (from above or level with it, so you can't jump over an island) or by touching the body below.
 */
function stepFlight(f: Flight, dt: number, fromIsland: number): { island: number; s: number } | null {
  const ox = f.x;
  const oy = f.y;
  f.vz -= gravityAt(f.vz) * dt;
  f.x += f.vx * dt;
  f.y += f.vy * dt;
  f.alt += f.vz * dt;
  f.t += dt;
  for (let i = 0; i < islands.length; i++) {
    if (i === fromIsland && f.t < 0.25) continue;
    const isl = islands[i]!;
    if (f.alt >= ISLAND_TOP - 4) {
      const s = isl.segmentHit(ox, oy, f.x, f.y);
      if (s !== null) return { island: i, s };
    }
    if (isl.intersects(f.x, f.y, f.alt, params.move.air.grabRadius)) return { island: i, s: isl.closest(f.x, f.y).s };
  }
  return null;
}

/** Flight below this altitude is lost in the haze. */
const LOST_ALT = ISLAND_TOP - 80;

/** `dt` is world time (slowed during slow motion); `dtReal` is wall-clock time, used for aiming. */
function update(dt: number, dtReal: number) {
  if (game.state === "play" && pressed.has("Escape")) {
    openBriefing("pause");
    pressed.clear();
    return;
  }
  const playing = game.state === "play";
  const dir = playing ? inputDir() : { x: 0, y: 0 };
  const p = player;

  const frozen = p.freeze > 0;
  if (frozen) {
    // Hit-stop: no moving, attacking or animating. After a sword hit in the air, the flight then
    // turns toward the input.
    p.freeze -= dtReal;
    if (p.freeze <= 0 && p.redirect) {
      p.redirect = false;
      if (p.mode === "air" && (dir.x || dir.y)) {
        const sp = Math.hypot(p.vx, p.vy);
        p.vx = dir.x * sp;
        p.vy = dir.y * sp;
      }
    }
  } else if (p.mode === "hang") {
    const isl = islands[p.island]!;
    let e = isl.pointAt(p.s);
    // Climb toward the rim point that faces the input direction. Aiming an attack takes over
    // the input; an ongoing slide carries on.
    const climb = p.aim ? 0 : climbInput(e, dir) * params.move.climb.speed;
    p.s += (climb + p.slide) * dt;
    p.slide *= Math.exp(-params.move.slide.friction * dt);
    if (Math.abs(p.slide) < 5) p.slide = 0;
    e = isl.pointAt(p.s);
    p.x = e.x + e.nx * 7;
    p.y = e.y + e.ny * 7;
    p.alt = HANG_ALT;
    p.facing = Math.atan2(-e.ny, -e.nx);

    if (p.slide) emitDust(e.x, e.y, Math.min(1, Math.abs(p.slide) / 300), dt);

    // Space jumps at once; holding it keeps the jump going full height (see the air section).
    if (playing && pressed.has("Space")) {
      const f = launch(p.island, p.s, jumpAngle(mouseAim() ?? dir));
      carrySlide(f, e);
      Object.assign(p, { x: f.x, y: f.y, alt: f.alt, vx: f.vx, vy: f.vy, vz: f.vz });
      p.mode = "air";
      p.airTime = 0;
      p.launchIsland = p.island;
      p.jumpHeld = true;
      p.airJumps = 1;
      p.slide = 0;
      sfx.jump();
      avatar.jump();
      emitDust(e.x, e.y, 6, 1 / 60);
    }
  } else if (p.mode === "air") {
    // Releasing Space while still rising cuts the jump short.
    if (p.jumpHeld && !keys.has("Space")) {
      if (p.vz > 0) p.vz *= params.move.jump.cut;
      p.jumpHeld = false;
    }
    if (p.jumpHeld && p.vz <= 0) p.jumpHeld = false;

    // Double jump: a fresh rise, heading for the closest island. The jump speed adds to whatever
    // of the current velocity already points that way, so jumping along the flight speeds it up.
    if (playing && pressed.has("Space") && p.airJumps > 0) {
      p.airJumps = 0;
      p.vz = Math.max(p.vz, launchSpeed() * params.move.airJump.strength);
      p.jumpHeld = true;
      const push = launchSpeed() * params.move.airJump.speed;
      const aim = doubleJumpDir(push, mouseAim());
      if (aim) {
        const sp = Math.max(0, p.vx * aim.x + p.vy * aim.y) + push;
        p.vx = aim.x * sp;
        p.vy = aim.y * sp;
      }
      combat.burst(p.x, p.y, p.alt - 6, 10, "#bff4ff");
      sfx.doubleJump();
      avatar.doubleJump();
    }

    if (!p.aim) steerAir(dir, dt);
    const f: Flight = { x: p.x, y: p.y, alt: p.alt, vx: p.vx, vy: p.vy, vz: p.vz, t: p.airTime };
    const hit = stepFlight(f, dt, p.launchIsland);
    Object.assign(p, { x: f.x, y: f.y, alt: f.alt, vz: f.vz, airTime: f.t });
    p.spin += dt * 3;
    if (Math.hypot(p.vx, p.vy) > 1) p.facing = Math.atan2(p.vy, p.vx);

    if (hit) {
      const speed = Math.hypot(p.vx, p.vy, p.vz);
      sfx.grab(speed);
      avatar.land(speed);
      grab(hit.island, hit.s, p.vx, p.vy);
      const e = islands[hit.island]!.pointAt(hit.s);
      emitDust(e.x, e.y, 4 + Math.min(10, speed / 80), 1 / 60);
    } else if (netBounce(p, p.netUsed)) {
      p.netUsed = true;
      p.jumpHeld = false;
      combat.burst(p.x, p.y, p.alt, 14, "#9fe8ff");
      sfx.netBounce();
      avatar.bounce();
    } else if (p.alt < LOST_ALT) {
      p.mode = "lost";
      p.lostTimer = 0;
      sfx.lost();
    }
  } else {
    // Sinking into the haze, then reappear on the last rim we held.
    p.lostTimer += dt;
    p.vx *= Math.exp(-2 * dt);
    p.vy *= Math.exp(-2 * dt);
    p.vz = Math.max(p.vz - params.move.jump.gravity * 0.3 * dt, -260);
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.alt = Math.max(5, p.alt + p.vz * dt);
    if (p.lostTimer > 1.6) {
      if (game.state === "play") {
        p.hp = Math.max(0, p.hp - params.player.health.fallDamage);
        if (p.hp <= 0) endRound("defeat");
      }
      grab(p.safeIsland, p.safeS);
      sfx.respawn();
      p.invuln = params.player.health.invulnTime;
      const e = islands[p.island]!.pointAt(p.s);
      p.x = p.rx = e.x + e.nx * 7;
      p.y = p.ry = e.y + e.ny * 7;
      p.alt = p.ralt = HANG_ALT + 60;
    }
  }

  updateDust(dt);
  if (!frozen) p.anim += dt;
  if (playing && !frozen) updateAttacks(dt, dtReal, dir);
  p.invuln = Math.max(0, p.invuln - dt);
  combat.update(dt, dtReal, { x: p.x, y: p.y, alt: p.alt, targetable: playing && p.mode !== "lost" }, {
    hit: hitPlayer,
    push: pushPlayer,
  });
  // Hits in the air refill the double jump and some focus; sword hits also bounce you up.
  // Sword hits freeze the player too, by damage dealt (the target freezes in Combat).
  for (const { weapon, damage } of combat.takePlayerHits()) {
    if (weapon === "sword" && p.mode !== "lost") {
      p.freeze = Math.max(p.freeze, hitStop(damage));
      p.redirect = p.mode === "air";
    }
    if (p.mode !== "air") continue;
    p.airJumps = 1;
    p.focus = Math.min(1, p.focus + params.player.focus.perHit);
    if (weapon === "sword") {
      p.vz = Math.max(p.vz, params.move.airJump.bounce);
      p.jumpHeld = false;
      avatar.bounce();
    }
  }
  playCombatSounds();
  game.shake = Math.max(0, game.shake - dt);
  if (game.state === "play" && combat.queenDead) endRound("victory");
  if (game.state !== "play") {
    game.timer += dt;
    // Winning moves on to the next level; losing replays the same level on a fresh planet.
    if (game.timer > 4.5 || (game.timer > 1.2 && pressed.has("Enter"))) {
      restart(game.state === "victory" ? game.level + 1 : game.level, game.state === "defeat");
    }
  }

  // Smoothed render position (held during hit-stop, like everything else about the player).
  if (!frozen) {
    const k = p.mode === "hang" ? 1 - Math.exp(-18 * dt) : 1;
    p.rx += (p.x - p.rx) * k;
    p.ry += (p.y - p.ry) * k;
    p.ralt += (p.alt - p.ralt) * (p.mode === "hang" ? 1 - Math.exp(-10 * dt) : 1);
  }

  avatar.update(dt, avatarView());

  // Camera trails behind and slides in toward the player; it rises a bit with high jumps.
  const lead = params.camera.view.lookAhead;
  const tx = p.rx + p.vx * lead;
  const ty = p.ry + p.vy * lead;
  const ck = 1 - Math.exp(-params.camera.view.followSpeed * dt);
  cam.x += (tx - cam.x) * ck;
  cam.y += (ty - cam.y) * ck;
  const th = params.camera.view.height + Math.max(0, p.alt - ISLAND_TOP) * 0.8;
  cam.h += (th - cam.h) * (1 - Math.exp(-1.5 * dt));

  updateSound();
  pressed.clear();
  released.clear();
}

function endRound(state: "victory" | "defeat") {
  game.state = state;
  game.timer = 0;
  if (state === "victory") sfx.victory();
  else sfx.defeat();
}

/**
 * Climb input along the rim, -1..1: toward the rim point whose outward normal faces the input
 * direction, at full speed until it nearly does. Pointing into the island still climbs.
 */
function climbInput(e: { nx: number; ny: number; tx: number; ty: number }, dir: Vec): number {
  if (!dir.x && !dir.y) return 0;
  const off = Math.acos(Math.max(-1, Math.min(1, dir.x * e.nx + dir.y * e.ny)));
  const side = dir.x * e.tx + dir.y * e.ty;
  return (side >= 0 ? 1 : -1) * Math.min(1, off / 0.35);
}

/**
 * Air control: arrows turn the flight toward the input, and speed it up along it or brake
 * against it. Pulling straight back only brakes.
 */
function steerAir(dir: Vec, dt: number) {
  const p = player;
  if (!dir.x && !dir.y) return;
  const air = params.move.air;
  let sp = Math.hypot(p.vx, p.vy);
  let a = sp > 1 ? Math.atan2(p.vy, p.vx) : Math.atan2(dir.y, dir.x);
  const fwd = dir.x * Math.cos(a) + dir.y * Math.sin(a);
  if (sp > 1 && fwd > -0.7) {
    let diff = Math.atan2(dir.y, dir.x) - a;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    a += Math.max(-air.turnRate * dt, Math.min(air.turnRate * dt, diff));
  }
  const next = sp + fwd * air.accel * dt;
  // Speeding up stops at the cap, but never slows a faster flight (from a hit or bounce).
  sp = Math.max(0, fwd > 0 ? Math.min(next, Math.max(sp, launchSpeed() * air.maxSpeed)) : next);
  p.vx = Math.cos(a) * sp;
  p.vy = Math.sin(a) * sp;
}

/**
 * Turn an aim angle toward the input direction. The turn rate starts at `turnRate` and falls off
 * as `progress` (0..1 over the aim time) builds, down to `minTurnRate` for fine-tuning.
 */
function turnAim(
  angle: number,
  dir: Vec,
  progress: number,
  dt: number,
  turnRate: number,
  minTurnRate: number,
): number {
  if (!dir.x && !dir.y) return angle;
  const falloff = Math.pow(Math.max(0, 1 - progress), 2);
  const rate = Math.max(minTurnRate, turnRate * falloff);
  let diff = Math.atan2(dir.y, dir.x) - angle;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  return angle + Math.max(-rate * dt, Math.min(rate * dt, diff));
}

/**
 * Aim assist: the closest live enemy within `aim.assistRange`. On a rim, only enemies on the
 * outward side count, since attacks can't point into the island.
 */
function closestEnemy(): Boid | null {
  const p = player;
  const e = p.mode === "hang" ? islands[p.island]!.pointAt(p.s) : null;
  let best: Boid | null = null;
  let bestD = params.player.aim.assistRange;
  for (const b of combat.boids) {
    if (b.hp <= 0) continue;
    const dx = b.x - p.x;
    const dy = b.y - p.y;
    if (e && dx * e.nx + dy * e.ny <= 0) continue;
    const d = Math.hypot(dx, dy, b.alt - p.alt);
    if (d < bestD) {
      best = b;
      bestD = d;
    }
  }
  return best;
}

/** Power 0..1 of the attack being aimed. */
function aimPower() {
  return player.aim ? Math.min(1, player.aim.t / params.player.aim.chargeTime) : 0;
}

/** On a rim, attacks may not point back into the island: keep them in the outward half-plane. */
function clampAimToRim(angle: number): number {
  const p = player;
  if (p.mode !== "hang") return angle;
  const e = islands[p.island]!.pointAt(p.s);
  let x = Math.cos(angle);
  let y = Math.sin(angle);
  const dot = x * e.nx + y * e.ny;
  if (dot >= 0) return angle;
  x -= e.nx * dot;
  y -= e.ny * dot;
  return Math.hypot(x, y) < 1e-3 ? Math.atan2(e.ny, e.nx) : Math.atan2(y, x);
}

/**
 * Sword (Z / J) and spear (X / K): hold to aim and power up, release to strike.
 * The aim starts at the closest enemy in range (else straight out from the rim, or along the
 * input / flight in the air) and turns toward the input direction, quickly at first and slower and slower until it locks at full power.
 * In mouse mode the aim simply follows the cursor, and the mouse buttons attack too.
 */
function updateAttacks(dt: number, dtReal: number, dir: Vec) {
  const p = player;
  p.swordCd -= dt;
  p.spearCd -= dt;
  if (p.mode === "lost") {
    p.aim = null;
    return;
  }
  const codes = (w: Weapon) => (inputMode === "mouse" ? [...WEAPON_KEYS[w], WEAPON_BUTTONS[w]] : WEAPON_KEYS[w]);
  const held = (w: Weapon) => codes(w).some((k) => keys.has(k));
  const justPressed = (w: Weapon) => unlocked(w) && codes(w).some((k) => pressed.has(k));
  const cursor = mouseAim();

  if (!p.aim) {
    const weapon: Weapon | null =
      justPressed("sword") && p.swordCd <= 0 ? "sword" : justPressed("spear") && p.spearCd <= 0 ? "spear" : null;
    if (!weapon) return;
    const target = inputMode === "mouse" ? null : closestEnemy();
    let angle: number;
    if (inputMode === "mouse") {
      angle = cursor ? Math.atan2(cursor.y, cursor.x) : p.facing;
    } else if (target) {
      angle = Math.atan2(target.y - p.y, target.x - p.x);
    } else if (p.mode === "hang") {
      const e = islands[p.island]!.pointAt(p.s);
      angle = Math.atan2(e.ny, e.nx);
    } else if (dir.x || dir.y) {
      angle = Math.atan2(dir.y, dir.x);
    } else {
      angle = Math.atan2(p.vy, p.vx);
    }
    p.aim = { weapon, t: 0, angle: clampAimToRim(angle) };
    sfx.aim(weapon);
    return;
  }

  const aim = p.aim;
  // Aiming runs on real time so slow motion doesn't slow the charge or the turning.
  const wasCharged = aimPower() >= 1;
  aim.t += dtReal;
  if (!wasCharged && aimPower() >= 1) sfx.charged();
  const pa = params.player.aim;
  if (inputMode === "mouse") {
    // The aim follows the cursor directly.
    if (cursor) aim.angle = clampAimToRim(Math.atan2(cursor.y, cursor.x));
  } else {
    aim.angle = clampAimToRim(turnAim(aim.angle, dir, aim.t / pa.chargeTime, dtReal, pa.turnRate, pa.minTurnRate));
  }

  if (!held(aim.weapon)) {
    const power = aimPower();
    const ax = Math.cos(aim.angle);
    const ay = Math.sin(aim.angle);
    const alt = p.mode === "hang" ? ISLAND_TOP + 2 : p.alt;
    if (aim.weapon === "sword") {
      combat.swing(p.x, p.y, alt, ax, ay, power);
      sfx.swing(power);
      avatar.strike("sword", aim.angle, power);
      p.swordCd = params.player.sword.cooldown;
    } else {
      combat.throwSpear(p.x, p.y, alt, ax, ay, power);
      sfx.throwSpear(power);
      avatar.strike("spear", aim.angle, power);
      p.spearCd = params.player.spear.cooldown;
    }
    p.aim = null;
  }
}

/** Aim indicator: a fan showing the sword's reach, or an arrow for the spear; both grow with power. */
function drawAimIndicator() {
  const p = player;
  if (!p.aim || p.mode === "lost") return;
  const power = aimPower();
  const full = power >= 1;
  const pulse = full ? 0.75 + 0.25 * Math.sin(performance.now() / 60) : 1;
  const alt = p.mode === "hang" ? ISLAND_TOP + 2 : p.ralt;
  const a = p.aim.angle;
  const at = (ang: number, r: number) => proj.project(p.rx + Math.cos(ang) * r, p.ry + Math.sin(ang) * r, alt);
  const col = p.aim.weapon === "sword" ? "255,226,150" : "150,230,255";

  ctx.lineJoin = "round";
  if (p.aim.weapon === "sword") {
    const R = params.player.sword.range + (params.player.sword.maxRange - params.player.sword.range) * power;
    const n = 16;
    ctx.beginPath();
    const c = at(0, 0);
    ctx.moveTo(c.x, c.y);
    for (let i = 0; i <= n; i++) {
      const q = at(a - params.player.sword.arc + (2 * params.player.sword.arc * i) / n, R);
      ctx.lineTo(q.x, q.y);
    }
    ctx.closePath();
    ctx.fillStyle = `rgba(${col},${(0.1 + 0.18 * power) * pulse})`;
    ctx.fill();
    ctx.strokeStyle = `rgba(${col},${(0.45 + 0.4 * power) * pulse})`;
    ctx.lineWidth = 1.5 + 1.5 * power;
    ctx.stroke();
  }

  // Arrow along the aim; longer and broader with power.
  const len = p.aim.weapon === "sword" ? 30 + 40 * power : 40 + 80 * power;
  const head = 8 + 10 * power;
  const half = 4 + 6 * power;
  const tip = at(a, len);
  const base = at(a, len - head);
  const tail = at(a, 14);
  const k = tip.kt;
  ctx.strokeStyle = `rgba(${col},${0.9 * pulse})`;
  ctx.lineCap = "round";
  ctx.lineWidth = (2 + 2.5 * power) * k;
  ctx.beginPath();
  ctx.moveTo(tail.x, tail.y);
  ctx.lineTo(base.x, base.y);
  ctx.stroke();
  const l = at(a + Math.atan2(half, len - head), Math.hypot(half, len - head));
  const r = at(a - Math.atan2(half, len - head), Math.hypot(half, len - head));
  ctx.fillStyle = `rgba(${col},${0.95 * pulse})`;
  ctx.beginPath();
  ctx.moveTo(tip.x, tip.y);
  ctx.lineTo(l.x, l.y);
  ctx.lineTo(r.x, r.y);
  ctx.closePath();
  ctx.fill();

  // Power ring around the player fills up while charging.
  const ringR = 18;
  const ring: Projected[] = [];
  const segs = 32;
  for (let i = 0; i <= Math.round(segs * power); i++) ring.push(at(a + (i / segs) * Math.PI * 2, ringR));
  if (ring.length > 1) {
    ctx.strokeStyle = `rgba(${col},${full ? 0.95 : 0.7})`;
    ctx.lineWidth = full ? 3 : 2;
    ctx.beginPath();
    ring.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
    ctx.stroke();
  }
}

// Dust kicked up while sliding along a rim.
const dust: { x: number; y: number; alt: number; vx: number; vy: number; life: number }[] = [];
let dustAcc = 0;
function emitDust(x: number, y: number, amount: number, dt: number) {
  dustAcc += amount * 60 * dt;
  while (dustAcc >= 1) {
    dustAcc -= 1;
    const a = Math.random() * Math.PI * 2;
    const sp = 10 + Math.random() * 30;
    dust.push({ x, y, alt: ISLAND_TOP - Math.random() * 6, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1 });
  }
}
function updateDust(dt: number) {
  for (let i = dust.length - 1; i >= 0; i--) {
    const d = dust[i]!;
    d.x += d.vx * dt;
    d.y += d.vy * dt;
    d.alt -= 25 * dt;
    d.life -= dt * 1.6;
    if (d.life <= 0) dust.splice(i, 1);
  }
}

// ---------------------------------------------------------------------------------------------
// Rendering helpers
// ---------------------------------------------------------------------------------------------

function makeBlob(size: number, stops: [number, string][]): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) grad.addColorStop(o, col);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c;
}

const hazeSprites = [
  makeBlob(128, [[0, "rgba(190,220,255,0.9)"], [0.45, "rgba(170,160,255,0.35)"], [1, "rgba(150,120,255,0)"]]),
  makeBlob(128, [[0, "rgba(220,190,255,0.9)"], [0.5, "rgba(200,150,240,0.3)"], [1, "rgba(180,120,230,0)"]]),
  makeBlob(128, [[0, "rgba(170,255,240,0.8)"], [0.5, "rgba(140,220,230,0.25)"], [1, "rgba(120,200,230,0)"]]),
];
const glowSprite = makeBlob(64, [[0, "rgba(255,255,230,1)"], [0.25, "rgba(220,240,255,0.6)"], [1, "rgba(180,200,255,0)"]]);
const dustSprite = makeBlob(32, [[0, "rgba(230,205,170,0.9)"], [1, "rgba(200,170,140,0)"]]);
const orbSprite = makeBlob(32, [[0, "rgba(250,255,220,1)"], [0.35, "rgba(200,255,120,0.85)"], [1, "rgba(120,255,80,0)"]]);
const shadowSprite = makeBlob(64, [[0, "rgba(10,0,30,0.55)"], [0.6, "rgba(10,0,30,0.25)"], [1, "rgba(10,0,30,0)"]]);

/** Draws a sprite lying flat on the planet surface: squashed radially as the surface tilts away. */
function drawFlat(img: CanvasImageSource, pr: Projected, worldRadius: number, alpha: number, spin = 0) {
  if (!pr.visible || alpha <= 0.002) return;
  const sx = worldRadius * pr.kr;
  const sy = worldRadius * pr.kt;
  if (sx < 0.05 && sy < 0.05) return;
  const c = Math.cos(pr.angle);
  const s = Math.sin(pr.angle);
  ctx.globalAlpha = alpha;
  ctx.setTransform(dpr * c * sx, dpr * s * sx, -dpr * s * sy, dpr * c * sy, dpr * pr.x, dpr * pr.y);
  if (spin) ctx.rotate(spin);
  ctx.drawImage(img, -1, -1, 2, 2);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.globalAlpha = 1;
}

/** Ellipse lying flat on the surface (for tree canopies etc). */
function flatEllipsePath(pr: Projected, worldRadius: number) {
  ctx.beginPath();
  ctx.ellipse(pr.x, pr.y, Math.max(0.1, worldRadius * pr.kr), Math.max(0.1, worldRadius * pr.kt), pr.angle, 0, Math.PI * 2);
}

function polyPath(pts: Vec[], alt: number): boolean {
  ctx.beginPath();
  let any = false;
  for (let i = 0; i < pts.length; i++) {
    const pr = proj.project(pts[i]!.x, pts[i]!.y, alt);
    any ||= pr.visible;
    if (i === 0) ctx.moveTo(pr.x, pr.y);
    else ctx.lineTo(pr.x, pr.y);
  }
  ctx.closePath();
  return any;
}

function mix(a: number[], b: number[], t: number) {
  return a.map((v, i) => v + (b[i]! - v) * t);
}
function rgba(c: number[], a = 1) {
  return `rgba(${c[0]! | 0},${c[1]! | 0},${c[2]! | 0},${a})`;
}

// Static starfield
const stars = (() => {
  const r = mulberry32(99);
  return Array.from({ length: 220 }, () => ({ x: r(), y: r(), s: r() * 1.4 + 0.3, a: r() * 0.7 + 0.2, tw: r() * 6 }));
})();

// Haze layers at increasing altitudes; higher layers are sparser and veil the island roots.
const hazeLayers = [
  { alt: 2, cell: 170, size: 210, alpha: 0.32, drift: 6, seed: 1 },
  { alt: 28, cell: 190, size: 190, alpha: 0.24, drift: -9, seed: 2 },
  { alt: 55, cell: 210, size: 170, alpha: 0.18, drift: 12, seed: 3 },
  { alt: 82, cell: 260, size: 150, alpha: 0.1, drift: -14, seed: 4 },
];

function hash2(x: number, y: number, seed: number) {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// ---------------------------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------------------------

interface Drawable { alt: number; draw: () => void }

const HAZE_COL = [150, 140, 220];
const FOG_COL = [140, 125, 235];

function smoothstep(a: number, b: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function render(time: number) {
  const zoom = Math.min(W, H) / 640;
  const shake = game.shake * 18;
  proj.setCamera(cam.x + (Math.random() - 0.5) * shake, cam.y + (Math.random() - 0.5) * shake, ISLAND_TOP, cam.h, zoom, W, H);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Space
  ctx.fillStyle = "#05030c";
  ctx.fillRect(0, 0, W, H);
  for (const st of stars) {
    ctx.globalAlpha = st.a * (0.7 + 0.3 * Math.sin(time * 1.3 + st.tw));
    ctx.fillStyle = "#e8e4ff";
    ctx.fillRect(st.x * W, st.y * H, st.s, st.s);
  }
  ctx.globalAlpha = 1;

  // Planet body (the haze sea) + atmosphere rim
  const limb = proj.limbRadius;
  const atm = ctx.createRadialGradient(proj.cx, proj.cy, limb * 0.92, proj.cx, proj.cy, limb * 1.12);
  atm.addColorStop(0, "rgba(160,140,255,0.0)");
  atm.addColorStop(0.42, "rgba(170,150,255,0.55)");
  atm.addColorStop(1, "rgba(120,90,255,0)");
  ctx.fillStyle = atm;
  ctx.beginPath();
  ctx.arc(proj.cx, proj.cy, limb * 1.12, 0, Math.PI * 2);
  ctx.fill();
  const body = ctx.createRadialGradient(proj.cx, proj.cy, 0, proj.cx, proj.cy, limb);
  body.addColorStop(0, "#2a2160");
  body.addColorStop(0.7, "#2c2468");
  body.addColorStop(0.93, "#463a90");
  body.addColorStop(1, "#7a6ad0");
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(proj.cx, proj.cy, limb, 0, Math.PI * 2);
  ctx.fill();

  const list: Drawable[] = [];
  const horizon = proj.horizonDistance;

  // Haze
  for (const L of hazeLayers) {
    const ox = time * L.drift;
    const oy = time * L.drift * 0.4;
    const reach = horizon + L.size;
    const x0 = Math.floor((cam.x - ox - reach) / L.cell);
    const x1 = Math.floor((cam.x - ox + reach) / L.cell);
    const y0 = Math.floor((cam.y - oy - reach) / L.cell);
    const y1 = Math.floor((cam.y - oy + reach) / L.cell);
    const blobs: { x: number; y: number; r: number; spr: number; a: number }[] = [];
    for (let gx = x0; gx <= x1; gx++) {
      for (let gy = y0; gy <= y1; gy++) {
        const h = hash2(gx, gy, L.seed);
        if (L.alt > 40 && h > 0.6) continue;
        const x = (gx + hash2(gx, gy, L.seed + 10)) * L.cell + ox;
        const y = (gy + hash2(gx, gy, L.seed + 20)) * L.cell + oy;
        if (Math.hypot(x - cam.x, y - cam.y) > reach) continue;
        const pulse = 0.75 + 0.25 * Math.sin(time * 0.5 + h * 20);
        blobs.push({ x, y, r: L.size * (0.6 + h * 0.8), spr: Math.floor(h * 97) % 3, a: L.alpha * pulse });
      }
    }
    list.push({
      alt: L.alt,
      draw: () => {
        ctx.globalCompositeOperation = "screen";
        for (const b of blobs) drawFlat(hazeSprites[b.spr]!, proj.project(b.x, b.y, L.alt), b.r, b.a);
        ctx.globalCompositeOperation = "source-over";
      },
    });
  }

  // Motes rising out of the haze
  const moteRand = mulberry32(7);
  for (let i = 0; i < 90; i++) {
    const bx = cam.x + (moteRand() - 0.5) * 1600;
    const by = cam.y + (moteRand() - 0.5) * 1600;
    const speed = 12 + moteRand() * 18;
    const phase = moteRand() * 400;
    const alt = (time * speed + phase) % 200;
    const x = bx + Math.sin(time * 0.3 + i) * 30;
    const y = by + Math.cos(time * 0.27 + i * 1.7) * 30;
    const fade = Math.sin((alt / 200) * Math.PI);
    list.push({ alt, draw: () => drawFlat(glowSprite, proj.project(x, y, alt), 5, 0.8 * fade) });
  }

  // Islands, tinted toward the atmosphere as they curve away over the horizon.
  const theme = planet.theme;
  for (const isl of islands) {
    const distRatio = Math.hypot(isl.cx - cam.x, isl.cy - cam.y) / horizon;
    if (distRatio > 1.35) continue;
    const fog = smoothstep(0.35, 1.1, distRatio) * 0.85;
    const fogged = (c: number[]) => mix(c, FOG_COL, fog);
    for (const sl of isl.slices) {
      list.push({
        alt: sl.alt,
        draw: () => {
          if (!polyPath(sl.pts, sl.alt)) return;
          const t = sl.depth;
          // Cliff band alternates earthy strata; the root fades from rock into the haze colour.
          const base = sl.cliff
            ? mix(theme.earth, theme.rockTop, t * 3 + (isl.slices.indexOf(sl) % 2) * 0.15)
            : mix(theme.rockTop, theme.rockDeep, Math.min(1, t * 1.3));
          const col = fogged(mix(base, HAZE_COL, Math.pow(t, 2) * 0.6));
          // Thin bright rim per slice reads as strata on the rock face.
          ctx.fillStyle = rgba(col);
          ctx.fill();
          ctx.strokeStyle = rgba(mix(col, [255, 255, 255], 0.12), 0.5);
          ctx.lineWidth = 1;
          ctx.stroke();
        },
      });
    }
    // Earth lip just below the grass
    list.push({
      alt: ISLAND_TOP - 2,
      draw: () => {
        if (!polyPath(isl.pts, ISLAND_TOP - 3)) return;
        ctx.fillStyle = rgba(fogged(theme.lip));
        ctx.fill();
      },
    });
    list.push({
      alt: ISLAND_TOP,
      draw: () => {
        if (!polyPath(isl.pts, ISLAND_TOP)) return;
        ctx.fillStyle = rgba(fogged(theme.grass));
        ctx.fill();
        ctx.strokeStyle = rgba(fogged(theme.grassEdge));
        ctx.lineWidth = 2;
        ctx.stroke();
        polyPath(isl.inner, ISLAND_TOP);
        ctx.fillStyle = rgba(fogged(theme.grassInner));
        ctx.fill();
      },
    });
    for (const tr of isl.trees) {
      // Trees are flat discs stacked at increasing altitude: parallax gives them height.
      const layers = 4;
      list.push({
        alt: ISLAND_TOP + 0.5,
        draw: () => drawFlat(shadowSprite, proj.project(tr.x + 6, tr.y + 6, ISLAND_TOP + 0.5), tr.r * 1.3, 0.9),
      });
      list.push({
        alt: ISLAND_TOP + 1,
        draw: () => {
          for (let k = 0; k < 3; k++) {
            const a = ISLAND_TOP + 1 + k * 4;
            flatEllipsePath(proj.project(tr.x, tr.y, a), 3.2);
            ctx.fillStyle = rgba(fogged(theme.trunk));
            ctx.fill();
          }
        },
      });
      for (let k = 0; k < layers; k++) {
        const a = ISLAND_TOP + 14 + k * 9;
        const r = tr.r * (1 - k * 0.2);
        const g = fogged(mix(theme.canopyDark, theme.canopyLight, (k / (layers - 1)) * 0.8 + tr.tint * 0.2));
        list.push({
          alt: a,
          draw: () => {
            flatEllipsePath(proj.project(tr.x, tr.y, a), r);
            ctx.fillStyle = rgba(g);
            ctx.fill();
          },
        });
      }
    }
  }

  pushBoundsDrawables(list, time);

  // Player shadow: on grass if above an island, otherwise faint on the haze.
  const p = player;
  const overIsland = islands.some((i) => i.contains(p.rx, p.ry));
  const shadowAlt = overIsland ? ISLAND_TOP + 0.6 : 4;
  if (p.mode !== "hang") {
    const hAbove = Math.max(0, p.ralt - shadowAlt);
    list.push({
      alt: shadowAlt + 0.1,
      draw: () => drawFlat(shadowSprite, proj.project(p.rx, p.ry, shadowAlt), 12 + hAbove * 0.04, overIsland ? 0.9 : 0.5),
    });
  }

  // Player; while hanging, sort above the lip so the hands overlap the grass edge.
  list.push({ alt: p.mode === "hang" ? ISLAND_TOP + 0.8 : p.ralt, draw: () => drawPlayer() });
  for (const d of dust) {
    list.push({ alt: d.alt, draw: () => drawFlat(dustSprite, proj.project(d.x, d.y, d.alt), 5 * (1.6 - d.life), d.life * 0.8) });
  }

  pushCombatDrawables(list, time);

  list.sort((a, b) => a.alt - b.alt);
  for (const d of list) d.draw();

  // Haze veil over the far side of the planet: everything near the limb fades into the atmosphere.
  const veil = ctx.createRadialGradient(proj.cx, proj.cy, limb * 0.55, proj.cx, proj.cy, limb * 1.02);
  veil.addColorStop(0, "rgba(120,100,230,0)");
  veil.addColorStop(0.8, "rgba(120,100,230,0.18)");
  veil.addColorStop(1, "rgba(150,130,255,0.45)");
  ctx.fillStyle = veil;
  ctx.beginPath();
  ctx.arc(proj.cx, proj.cy, limb * 1.02, 0, Math.PI * 2);
  ctx.fill();

  drawSlowMo();
  drawJumpPreview();
  drawAimIndicator();
  drawQueenPointer();
  drawHud();
}

function drawPlayer() {
  const p = player;
  const pr = proj.project(p.rx, p.ry, p.ralt);
  if (!pr.visible) return;
  const k = pr.kt;
  const fade = p.mode === "lost" ? Math.max(0, 1 - p.lostTimer / 0.9) : 1;
  if (fade <= 0) return;

  // Blink while invulnerable.
  if (p.invuln > 0 && Math.floor(p.invuln * 14) % 2 === 0) return;

  ctx.save();
  ctx.translate(pr.x, pr.y);
  ctx.globalAlpha = fade;

  // Aura
  ctx.globalCompositeOperation = "screen";
  ctx.drawImage(glowSprite, -26 * k, -26 * k, 52 * k, 52 * k);
  ctx.globalCompositeOperation = "source-over";

  // An unused double jump shows as a faint ring with sparks circling the player.
  if (p.airJumps > 0) {
    ctx.strokeStyle = `rgba(190,244,255,${0.3 + 0.15 * Math.sin(p.anim * 8)})`;
    ctx.lineWidth = 1.5 * k;
    ctx.beginPath();
    ctx.arc(0, 0, 17 * k, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalCompositeOperation = "screen";
    for (let i = 0; i < 3; i++) {
      const a = p.anim * 5 + (i * Math.PI * 2) / 3;
      ctx.drawImage(glowSprite, Math.cos(a) * 17 * k - 5 * k, Math.sin(a) * 17 * k - 5 * k, 10 * k, 10 * k);
    }
    ctx.globalCompositeOperation = "source-over";
  }
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = fade;
  avatar.draw(ctx, avatarView(), (x, y, alt) => proj.project(x, y, alt));
  ctx.restore();
}

/**
 * In the air, a dashed line traces the rest of the flight. It turns green if it ends on an island,
 * and stays pale if it ends in the haze.
 */
function drawJumpPreview() {
  const p = player;
  if (game.state !== "play" || p.mode !== "air") return;
  const f: Flight = { x: p.x, y: p.y, alt: p.alt, vx: p.vx, vy: p.vy, vz: p.vz, t: p.airTime };
  const from = p.launchIsland;
  let netUsed = p.netUsed;
  const pts: Projected[] = [proj.project(f.x, f.y, f.alt)];
  let hit = false;
  for (let i = 0; i < 300 && f.alt > LOST_ALT; i++) {
    const h = stepFlight(f, 1 / 60, from);
    if (h) {
      // End where the flight meets the rim, at the flight's altitude (it may cross well above it).
      const e = islands[h.island]!.pointAt(h.s);
      pts.push(proj.project(e.x, e.y, Math.max(ISLAND_TOP, f.alt)));
      hit = true;
      break;
    }
    if (netBounce(f, netUsed)) netUsed = true;
    if (i % 2 === 1) pts.push(proj.project(f.x, f.y, f.alt));
  }
  const a = 0.8;
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  ctx.setLineDash([7, 7]);
  ctx.lineDashOffset = -performance.now() / 40;
  ctx.strokeStyle = hit ? `rgba(140,255,170,${a})` : `rgba(255,235,210,${a * 0.8})`;
  ctx.beginPath();
  pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
  ctx.stroke();
  ctx.setLineDash([]);
  const end = pts[pts.length - 1]!;
  ctx.fillStyle = ctx.strokeStyle;
  ctx.beginPath();
  ctx.arc(end.x, end.y, hit ? 5 : 3.5, 0, Math.PI * 2);
  ctx.fill();
  if (hit) {
    // Landing ring, so the target reads at a glance.
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(end.x, end.y, 10 + Math.sin(performance.now() / 120) * 2, 0, Math.PI * 2);
    ctx.stroke();
  }
}

/**
 * The planet boundary: a shimmering curtain of light rings rising out of the haze. The brightest,
 * solid ring sits at island height (the play level), fading above and below. Each ring is drawn at
 * its own altitude so it sorts and curves with the world.
 */
function pushBoundsDrawables(list: Drawable[], time: number) {
  const b = planet.bounds;
  const alts = [4, 30, 60, 90, ISLAND_TOP, ISLAND_TOP + 30, ISLAND_TOP + 65];
  for (let l = 0; l < alts.length; l++) {
    const alt = alts[l]!;
    const main = alt === ISLAND_TOP;
    const fade = main ? 1 : 0.55 * (1 - Math.abs(alt - ISLAND_TOP) / (ISLAND_TOP + 20));
    list.push({
      alt,
      draw: () => {
        const n = 160;
        ctx.strokeStyle = `rgba(150,235,255,${0.6 * fade})`;
        ctx.lineWidth = main ? 3 : 1.5;
        ctx.setLineDash(main ? [] : [14, 10]);
        ctx.lineDashOffset = -time * 30 * (l % 2 ? 1 : -1);
        ctx.beginPath();
        let pen = false;
        for (let i = 0; i <= n; i++) {
          const a = (i / n) * Math.PI * 2;
          const wob = Math.sin(a * 9 + time * 1.5 + l) * 4;
          const pr = proj.project(b.x + Math.cos(a) * (b.r + wob), b.y + Math.sin(a) * (b.r + wob), alt);
          if (!pr.visible) {
            pen = false;
            continue;
          }
          if (pen) ctx.lineTo(pr.x, pr.y);
          else ctx.moveTo(pr.x, pr.y);
          pen = true;
        }
        ctx.stroke();
        ctx.setLineDash([]);
      },
    });
  }
}

// ---------------------------------------------------------------------------------------------
// Sound
// ---------------------------------------------------------------------------------------------

/** Loudness and stereo position of a sound at a world position, heard from the player. */
function heardAt(x: number, y: number, alt: number) {
  const d = Math.hypot(x - player.x, y - player.y);
  const gain = Math.max(0, 1 - d / params.audio.volume.hearing) ** 1.5;
  const pr = proj.project(x, y, alt);
  const pan = pr.visible ? Math.max(-1, Math.min(1, (pr.x - W / 2) / (W / 2))) * 0.8 : 0;
  return { gain, pan };
}

function playCombatSounds() {
  for (const ev of combat.takeEvents()) {
    const at = heardAt(ev.x, ev.y, ev.alt);
    if (ev.type === "hit") {
      // The player's own hits are always heard at full volume.
      sfx.hitEnemy(ev.kind!, ev.killed!, { pan: at.pan });
      if (ev.kind === "queen" && ev.killed) sfx.queenDeath();
      continue;
    }
    if (at.gain <= 0.01) continue;
    if (ev.type === "shot") sfx.orbShot(at);
    else if (ev.type === "lunge") sfx.lunge(at);
    else if (ev.type === "explode") sfx.explosion({ pan: at.pan, gain: Math.max(0.35, at.gain) });
    else if (ev.type === "block") sfx.block(at);
    else sfx.thud(at);
  }
}

/** Held sounds and the music's mood, every frame. */
function updateSound() {
  const p = player;
  const playing = game.state === "play";
  const slide = p.mode === "hang" && p.freeze <= 0 ? Math.min(1, Math.abs(p.slide) / 400) : 0;
  const wind = p.mode === "air" ? Math.min(1, Math.hypot(p.vx, p.vy, p.vz) / (launchSpeed() * 1.8)) : 0;
  sfx.loops(slide, wind);

  // The fight heats up with the number of engaged boids nearby, and when the queen is close.
  let near = 0;
  for (const b of combat.boids) {
    if (b.hp > 0 && b.kind !== "queen" && b.flock.engaged && Math.hypot(b.x - p.x, b.y - p.y) < 700) near++;
  }
  const q = combat.queen;
  const queenNear = q.hp > 0 && Math.hypot(q.x - p.x, q.y - p.y) < params.boids.queen.threatRadius ? 0.5 : 0;
  const intensity = playing ? Math.min(1, near / 6 + queenNear) : 0;
  music.update(intensity, slow.intensity, playing ? 1 : 0.25);
  applyVolumes();
}

// ---------------------------------------------------------------------------------------------
// Combat rendering
// ---------------------------------------------------------------------------------------------

function pushCombatDrawables(list: Drawable[], time: number) {
  const reach = proj.horizonDistance * 1.2;
  for (const b of combat.boids) {
    if (b.hp <= 0 || Math.hypot(b.x - cam.x, b.y - cam.y) > reach) continue;
    const over = islands.some((i) => Math.hypot(i.cx - b.x, i.cy - b.y) < i.radius * 1.4 && i.contains(b.x, b.y));
    const sAlt = over ? ISLAND_TOP + 0.6 : 4;
    list.push({
      alt: sAlt + 0.2,
      draw: () => drawFlat(shadowSprite, proj.project(b.x, b.y, sAlt), b.r * 1.5, over ? 0.6 : 0.3),
    });
    list.push({ alt: b.alt, draw: () => drawBoid(b) });
  }
  for (const sh of combat.shots) {
    list.push({
      alt: sh.alt,
      draw: () => {
        if (sh.fromPlayer) {
          // Spear: shaft trailing behind a bright tip.
          const l = Math.hypot(sh.vx, sh.vy) || 1;
          const ux = sh.vx / l;
          const uy = sh.vy / l;
          const sc = sh.scale;
          const L = params.player.spear.length * sc;
          const tail = proj.project(sh.x - ux * L, sh.y - uy * L, sh.alt);
          const neck = proj.project(sh.x - ux * 12 * sc, sh.y - uy * 12 * sc, sh.alt);
          const tip = proj.project(sh.x + ux * 4 * sc, sh.y + uy * 4 * sc, sh.alt);
          if (!tip.visible) return;
          const k = tip.kt * sc;
          // Glow so it reads at speed
          ctx.globalCompositeOperation = "screen";
          ctx.drawImage(glowSprite, tip.x - 16 * k, tip.y - 16 * k, 32 * k, 32 * k);
          ctx.globalCompositeOperation = "source-over";
          ctx.lineCap = "round";
          ctx.strokeStyle = "#c9a96e";
          ctx.lineWidth = 4 * k;
          ctx.beginPath();
          ctx.moveTo(tail.x, tail.y);
          ctx.lineTo(neck.x, neck.y);
          ctx.stroke();
          // Broad leaf-shaped head
          const hx = (tip.x - neck.x) / 16;
          const hy = (tip.y - neck.y) / 16;
          ctx.fillStyle = "#f2efff";
          ctx.strokeStyle = "#7d7aa8";
          ctx.lineWidth = 1.2 * k;
          ctx.beginPath();
          ctx.moveTo(tip.x, tip.y);
          ctx.lineTo(neck.x + hx * 6 - hy * 7, neck.y + hy * 6 + hx * 7);
          ctx.lineTo(neck.x, neck.y);
          ctx.lineTo(neck.x + hx * 6 + hy * 7, neck.y + hy * 6 - hx * 7);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        } else {
          const pr = proj.project(sh.x, sh.y, sh.alt);
          if (!pr.visible) return;
          const r = 9 * pr.kt;
          ctx.globalCompositeOperation = "screen";
          ctx.drawImage(orbSprite, pr.x - r, pr.y - r, r * 2, r * 2);
          ctx.globalCompositeOperation = "source-over";
        }
      },
    });
  }
  for (const sl of combat.slashes) list.push({ alt: sl.alt + 0.5, draw: () => drawSlash(sl) });
  for (const bl of combat.blasts) list.push({ alt: bl.alt, draw: () => drawBlast(bl) });
  for (const sp of combat.sparks) {
    list.push({
      alt: sp.alt,
      draw: () => {
        const pr = proj.project(sp.x, sp.y, sp.alt);
        if (!pr.visible) return;
        ctx.globalAlpha = Math.min(1, sp.life * 2);
        ctx.fillStyle = sp.color;
        ctx.beginPath();
        ctx.arc(pr.x, pr.y, Math.max(1, 2 * pr.kt), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      },
    });
  }
}

function drawSlash(sl: { x: number; y: number; alt: number; dx: number; dy: number; age: number; range: number; power: number }) {
  const t = sl.age / params.player.sword.activeTime;
  const fade = 1 - Math.min(1, sl.age / (params.player.sword.activeTime + params.player.sword.fadeTime));
  const base = Math.atan2(sl.dy, sl.dx);
  const a0 = base - params.player.sword.arc;
  const a1 = a0 + 2 * params.player.sword.arc * Math.min(1, t * 1.8);
  const outer: Projected[] = [];
  const inner: Projected[] = [];
  const n = 14;
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    // Crescent: thick in the middle of the sweep, thin at the ends.
    const w = Math.sin((i / n) * Math.PI);
    outer.push(proj.project(sl.x + Math.cos(a) * sl.range, sl.y + Math.sin(a) * sl.range, sl.alt));
    const ri = sl.range * (1 - (0.45 + 0.15 * sl.power) * w);
    inner.push(proj.project(sl.x + Math.cos(a) * ri, sl.y + Math.sin(a) * ri, sl.alt));
  }
  ctx.beginPath();
  outer.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
  for (let i = inner.length - 1; i >= 0; i--) ctx.lineTo(inner[i]!.x, inner[i]!.y);
  ctx.closePath();
  ctx.fillStyle = sl.power >= 1 ? `rgba(255,236,170,${0.95 * fade})` : `rgba(255,250,235,${0.9 * fade})`;
  ctx.fill();
}

/** A bomber's blast: a flash, then a shock ring racing out to the blast radius. */
function drawBlast(bl: Blast) {
  const t = bl.age / BLAST_TIME;
  const fade = 1 - t;
  const n = 28;
  const r = bl.radius * (1 - (1 - t) ** 3);
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const q = proj.project(bl.x + Math.cos(a) * r, bl.y + Math.sin(a) * r, bl.alt);
    if (i) ctx.lineTo(q.x, q.y);
    else ctx.moveTo(q.x, q.y);
  }
  const c = proj.project(bl.x, bl.y, bl.alt);
  if (!c.visible) return;
  ctx.strokeStyle = `rgba(255,200,120,${0.9 * fade})`;
  ctx.lineWidth = Math.max(1, 6 * fade * c.kt);
  ctx.stroke();
  if (t < 0.35) {
    const fr = (20 + 50 * t) * c.kt;
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = 1 - t / 0.35;
    ctx.drawImage(glowSprite, c.x - fr * 2, c.y - fr * 2, fr * 4, fr * 4);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }
}

/** Animation runs on `b.phase`, which stops while the boid is frozen by a hit. */
function drawBoid(b: Boid) {
  const pr = proj.project(b.x, b.y, b.alt);
  if (!pr.visible) return;
  const k = pr.kt;
  const heading = b.heading;
  ctx.save();
  ctx.translate(pr.x, pr.y);

  if (b.kind === "queen") {
    const pulse = 0.5 + 0.5 * Math.sin(b.phase * 3);
    const aura = ctx.createRadialGradient(0, 0, 0, 0, 0, 55 * k);
    aura.addColorStop(0, `rgba(230,120,255,${0.35 + 0.15 * pulse})`);
    aura.addColorStop(1, "rgba(230,120,255,0)");
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(0, 0, 55 * k, 0, Math.PI * 2);
    ctx.fill();
    ctx.rotate(heading);
    const flap = Math.abs(Math.sin(b.phase * 7));
    ctx.fillStyle = "rgba(240,200,255,0.4)";
    for (const side of [-1, 1]) {
      for (const [ox, w] of [[-2, 1], [-14, 0.75]] as const) {
        ctx.beginPath();
        ctx.ellipse(ox * k, side * 20 * k, 20 * w * k, (4 + 10 * flap) * w * k, side * 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Abdomen with stripes, thorax, head
    ctx.fillStyle = "#6d1f9e";
    ctx.beginPath();
    ctx.ellipse(-16 * k, 0, 16 * k, 11 * k, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#e3a6ff";
    ctx.lineWidth = 1.6 * k;
    for (const sx of [-22, -15, -8]) {
      ctx.beginPath();
      ctx.moveTo(sx * k, -9 * k);
      ctx.quadraticCurveTo((sx + 3) * k, 0, sx * k, 9 * k);
      ctx.stroke();
    }
    ctx.fillStyle = "#9b2fd6";
    ctx.beginPath();
    ctx.ellipse(2 * k, 0, 11 * k, 10 * k, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#d58cff";
    ctx.beginPath();
    ctx.arc(14 * k, 0, 7 * k, 0, Math.PI * 2);
    ctx.fill();
    // Crown: gold spikes around the head
    ctx.fillStyle = "#ffd34d";
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI * 0.6 + (i / 4) * Math.PI * 1.2;
      ctx.beginPath();
      ctx.moveTo((14 + Math.cos(a - 0.25) * 6) * k, Math.sin(a - 0.25) * 6 * k);
      ctx.lineTo((14 + Math.cos(a) * 12) * k, Math.sin(a) * 12 * k);
      ctx.lineTo((14 + Math.cos(a + 0.25) * 6) * k, Math.sin(a + 0.25) * 6 * k);
      ctx.fill();
    }
    ctx.fillStyle = "#1a0526";
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(17 * k, side * 3 * k, 1.6 * k, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    if (b.lunge > 0) {
      ctx.fillStyle = "rgba(255,70,90,0.35)";
      ctx.beginPath();
      ctx.arc(0, 0, 15 * k, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.rotate(heading);
    const flap = Math.abs(Math.sin(b.phase * 26 + b.id));
    ctx.fillStyle =
      b.kind === "melee" ? "rgba(255,190,210,0.45)" : b.kind === "bomber" ? "rgba(255,215,160,0.45)" : "rgba(170,255,240,0.45)";
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(-2 * k, side * 7 * k, 7 * k, (1 + 4 * flap) * k, side * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
    if (b.kind === "melee") {
      ctx.fillStyle = "#e23a5a";
      ctx.strokeStyle = "#5a0f22";
      ctx.lineWidth = 1.2 * k;
      ctx.beginPath();
      ctx.moveTo(11 * k, 0);
      ctx.lineTo(-7 * k, -6 * k);
      ctx.lineTo(-3 * k, 0);
      ctx.lineTo(-7 * k, 6 * k);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#ffe066";
      ctx.beginPath();
      ctx.arc(4 * k, 0, 1.6 * k, 0, Math.PI * 2);
      ctx.fill();
    } else if (b.kind === "bomber") {
      // Bomber: a dark bulb with a fuse that sparks faster once its flock has found the player.
      const rate = b.flock.engaged ? 18 : 5;
      const blink = 0.5 + 0.5 * Math.sin(b.phase * rate);
      ctx.fillStyle = "#3a2a24";
      ctx.strokeStyle = "#ff9a3c";
      ctx.lineWidth = 1.4 * k;
      ctx.beginPath();
      ctx.arc(0, 0, 8 * k, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = `rgba(255,${150 + 90 * blink},60,${0.5 + 0.5 * blink})`;
      for (const [ox, r] of [[-3, 2.5 + 1.5 * blink], [3, 1.5 + blink]] as const) {
        ctx.beginPath();
        ctx.arc(ox * k, 0, r * k, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      // Ranged: round body whose core brightens as the next shot charges.
      const ready = 1 - Math.max(0, Math.min(1, b.cooldown / params.enemyAttacks.ranged.cooldown));
      ctx.fillStyle = "#1f8f86";
      ctx.strokeStyle = "#0b3b38";
      ctx.lineWidth = 1.2 * k;
      ctx.beginPath();
      ctx.arc(0, 0, 7 * k, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = `rgba(210,255,130,${0.3 + 0.7 * ready})`;
      ctx.beginPath();
      ctx.arc(1.5 * k, 0, (2.5 + 1.5 * ready) * k, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (b.flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${(b.flash / 0.15) * 0.85})`;
    ctx.beginPath();
    ctx.arc(0, 0, b.r * 1.2 * k, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------------------------
// Slow motion
// ---------------------------------------------------------------------------------------------

/**
 * Charging an attack in the air slows the world down until the attack is released, the player
 * grabs an island (or falls into the haze), or focus runs out. Slow motion drains focus; hits
 * regain some and grabbing a rim refills it.
 * `scale` eases between 1 and params.player.slowMo.scale over the fade times (in real time).
 */
const slow = { scale: 1, intensity: 0, active: false, startedAt: 0 };

function updateTimeScale(dtReal: number) {
  const want = game.state === "play" && player.mode === "air" && player.aim !== null && player.focus > 0;
  if (want && player.freeze <= 0) player.focus = Math.max(0, player.focus - params.player.focus.drain * dtReal);
  if (want && !slow.active) {
    slow.startedAt = performance.now();
    sfx.slowMoIn();
  }
  if (!want && slow.active) sfx.slowMoOut();
  slow.active = want;
  const span = 1 - params.player.slowMo.scale;
  const target = want ? params.player.slowMo.scale : 1;
  const fade = want ? params.player.slowMo.fadeIn : params.player.slowMo.fadeOut;
  const step = fade > 0 ? (span * dtReal) / fade : Infinity;
  slow.scale = slow.scale > target ? Math.max(target, slow.scale - step) : Math.min(target, slow.scale + step);
  slow.intensity = span > 0 ? Math.max(0, Math.min(1, (1 - slow.scale) / span)) : 0;
}

const canFilter = "filter" in ctx;

/** Screen treatment while time is slowed: cool desaturation, zoom echo, vignette, shockwave, streaks. */
function drawSlowMo() {
  const I = slow.intensity;
  if (I < 0.01) return;
  const t = performance.now() / 1000;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const cw = canvas.width;
  const ch = canvas.height;

  // Drain colour toward a cold blue-violet.
  if (canFilter) {
    ctx.filter = `saturate(${1 - 0.8 * I}) hue-rotate(${-30 * I}deg) brightness(${1 - 0.15 * I}) contrast(${1 + 0.15 * I})`;
    ctx.globalAlpha = I;
    ctx.drawImage(canvas, 0, 0);
    ctx.filter = "none";
  }
  // Zoom echo: a faint, slightly enlarged copy gives a stretched-time smear.
  const z = 1 + 0.035 * I;
  ctx.globalAlpha = 0.22 * I;
  ctx.globalCompositeOperation = "screen";
  ctx.drawImage(canvas, (cw - cw * z) / 2, (ch - ch * z) / 2, cw * z, ch * z);
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.restore();

  // Vignette with a cyan rim.
  const r = Math.hypot(W, H) / 2;
  const vg = ctx.createRadialGradient(W / 2, H / 2, r * 0.35, W / 2, H / 2, r);
  vg.addColorStop(0, "rgba(40,20,90,0)");
  vg.addColorStop(0.7, `rgba(30,15,80,${0.45 * I})`);
  vg.addColorStop(1, `rgba(120,230,255,${0.55 * I})`);
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);

  // Radial streaks drifting slowly around the player.
  const pp = proj.project(player.rx, player.ry, player.ralt);
  ctx.strokeStyle = `rgba(190,240,255,${0.32 * I})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < 28; i++) {
    const a = i * 2.39996 + t * 0.15;
    const r0 = r * (0.55 + 0.25 * ((i * 0.618) % 1));
    const r1 = r0 + r * 0.35 * I;
    ctx.moveTo(pp.x + Math.cos(a) * r0, pp.y + Math.sin(a) * r0);
    ctx.lineTo(pp.x + Math.cos(a) * r1, pp.y + Math.sin(a) * r1);
  }
  ctx.stroke();

  // Shockwave ring from the player when the slowdown kicks in.
  const age = (performance.now() - slow.startedAt) / 1000;
  if (slow.active && age < 0.45) {
    const k = age / 0.45;
    ctx.strokeStyle = `rgba(170,240,255,${0.7 * (1 - k)})`;
    ctx.lineWidth = 3 + 6 * (1 - k);
    ctx.beginPath();
    ctx.arc(pp.x, pp.y, 20 + k * r * 0.6, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Cinematic bars slide in from top and bottom.
  const bar = H * 0.07 * I;
  ctx.fillStyle = "rgba(4,2,12,0.92)";
  ctx.fillRect(0, 0, W, bar);
  ctx.fillRect(0, H - bar, W, bar);
  ctx.fillStyle = `rgba(150,235,255,${0.6 * I})`;
  ctx.fillRect(0, bar, W, 1);
  ctx.fillRect(0, H - bar - 1, W, 1);
}

/** Arrow at the screen edge pointing toward the queen while she's off screen. */
function drawQueenPointer() {
  const q = combat.queen;
  if (!q || q.hp <= 0 || game.state !== "play") return;
  const pr = proj.project(q.x, q.y, q.alt);
  const m = 40;
  if (pr.visible && pr.x > m && pr.x < W - m && pr.y > m && pr.y < H - m) return;
  // The projection is radial around the screen centre, so the world direction is the screen direction.
  const a = Math.atan2(q.y - cam.y, q.x - cam.x);
  const c = Math.cos(a);
  const sn = Math.sin(a);
  const t = Math.min((W / 2 - m) / Math.abs(c || 1e-6), (H / 2 - m) / Math.abs(sn || 1e-6));
  const x = W / 2 + c * t;
  const y = H / 2 + sn * t;
  const pulse = 1 + 0.12 * Math.sin(performance.now() / 150);
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "rgba(60,10,80,0.6)";
  ctx.beginPath();
  ctx.arc(0, 0, 17 * pulse, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffd34d";
  ctx.font = "bold 18px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("♛", 0, 1);
  ctx.rotate(a);
  ctx.fillStyle = "#e48cff";
  ctx.beginPath();
  ctx.moveTo(27 * pulse, 0);
  ctx.lineTo(19 * pulse, -7);
  ctx.lineTo(19 * pulse, 7);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

let hpTrail = 1;

function drawHud() {
  if (player.mode === "lost") {
    const t = player.lostTimer;
    const a = t < 1.1 ? 0 : Math.min(1, (t - 1.1) / 0.4);
    ctx.fillStyle = `rgba(200,190,255,${a * 0.6})`;
    ctx.fillRect(0, 0, W, H);
  }

  // Player health bar; the trailing light segment shows recent damage draining away.
  const frac = Math.max(0, player.hp / params.player.health.max);
  hpTrail = Math.max(frac, hpTrail - 0.004);
  const hw = Math.min(240, W * 0.3);
  ctx.fillStyle = "rgba(20,8,35,0.7)";
  ctx.fillRect(14, 14, hw + 4, 14);
  ctx.fillStyle = "rgba(255,220,200,0.8)";
  ctx.fillRect(16, 16, hw * hpTrail, 10);
  ctx.fillStyle = frac > 0.3 ? "#ff5a6e" : `rgba(255,${60 + 60 * Math.sin(performance.now() / 90)},80,1)`;
  ctx.fillRect(16, 16, hw * frac, 10);
  ctx.font = "600 12px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillStyle = "#ffe0e6";
  ctx.fillText(`♥ ${Math.ceil(player.hp)}%`, 16, 32);

  // Focus (slow-motion budget) and the banked extra jump.
  const fw = hw * 0.6;
  ctx.fillStyle = "rgba(20,8,35,0.7)";
  ctx.fillRect(14, 50, fw + 4, 8);
  ctx.fillStyle = player.focus > 0 ? "#8fe3ff" : "rgba(143,227,255,0.3)";
  ctx.fillRect(16, 52, fw * player.focus, 4);
  ctx.fillStyle = "#d8f6ff";
  ctx.fillText(`◷ focus${player.airJumps > 0 ? "  ·  ⤒ double jump" : ""}`, 16, 62);

  // Queen health
  const q = combat.queen;
  const bw = Math.min(320, W * 0.4);
  const bx = (W - bw) / 2;
  ctx.fillStyle = "rgba(20,8,35,0.7)";
  ctx.fillRect(bx - 2, 14, bw + 4, 14);
  ctx.fillStyle = "#c84cff";
  ctx.fillRect(bx, 16, bw * Math.max(0, q.hp / q.maxHp), 10);
  ctx.font = "600 12px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillStyle = "#f0dcff";
  ctx.fillText(`♛ QUEEN · swarm ${combat.boids.length - 1} in ${combat.flocks.length} flocks · level ${game.level} · planet ${planet.seed.toString(36)}`, W / 2, 32);

  if (game.state === "victory" || game.state === "defeat") {
    const a = Math.min(1, game.timer / 0.6);
    const win = game.state === "victory";
    ctx.fillStyle = win ? `rgba(40,20,60,${0.55 * a})` : `rgba(40,5,15,${0.6 * a})`;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = a;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "800 64px system-ui, sans-serif";
    ctx.fillStyle = win ? "#ffd34d" : "#ff5a6e";
    ctx.fillText(win ? `LEVEL ${game.level} CLEARED` : "DEFEATED", W / 2, H / 2 - 20);
    ctx.font = "500 18px system-ui, sans-serif";
    ctx.fillStyle = "#f0e8ff";
    ctx.fillText(
      win ? "The queen has fallen." : `The swarm overwhelmed you on level ${game.level}.`,
      W / 2,
      H / 2 + 30,
    );
    ctx.font = "13px system-ui, sans-serif";
    ctx.fillStyle = "rgba(240,232,255,0.7)";
    const left = Math.max(0, Math.ceil(4.5 - game.timer));
    const next = win ? `Level ${game.level + 1}` : `Retrying level ${game.level}`;
    ctx.fillText(`${next} in ${left}…  (Enter to continue now)`, W / 2, H / 2 + 60);
    ctx.globalAlpha = 1;
  }
}

// ---------------------------------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------------------------------

restart(Math.max(1, Math.round(params.world.levels.start)));

let last = performance.now();
let worldTime = 0;
function frame(now: number) {
  const dtReal = Math.min(0.05, (now - last) / 1000);
  last = now;
  updateTimeScale(dtReal);
  const dt = game.state === "briefing" ? 0 : dtReal * slow.scale;
  worldTime += dt;
  if (game.state === "briefing") updateBriefing(dtReal);
  else update(dt, dtReal);
  render(worldTime);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);








