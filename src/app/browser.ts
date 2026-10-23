import { Session } from "../game/session";
import type { World } from "../game/world";
import { BrowserInput } from "../input/browser";
import { liveParams } from "../params/store";
import { toggleMute, unlockAudio } from "../present/audio";
import { Camera } from "../present/camera";
import { hearing } from "../present/hearing";
import { PlayerPresenter } from "../present/player";
import { RumblePresenter } from "../present/rumble";
import { SoundPresenter } from "../present/sound";
import { Vfx } from "../present/vfx";
import { Painter } from "../render/painter";
import { Projector } from "../render/projection";
import { render } from "../render/renderer";
import { mountBriefing } from "../ui/briefing/controller";
import { debugSection } from "../ui/dev/debug";
import { inspectSection } from "../ui/dev/inspect";
import { createDevPanel } from "../ui/dev/panel";
import { currentRun, runSection } from "../ui/dev/run";
import { tuningDevSection } from "../ui/dev/tuning";
import { drawHud } from "../ui/hud";
import { ISLAND_TOP } from "../world/island";

// The browser game: puts the pieces together. A session runs the game; the browser input source
// feeds it; presenters turn each world's events into sound, rumble, effects and animation; the
// renderer and the HUD draw it; the briefing and the dev panel are DOM around the canvas.

const canvas = document.getElementById("c") as HTMLCanvasElement;
const proj = new Projector();
const painter = new Painter(canvas, proj);
const resize = () => painter.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio);
window.addEventListener("resize", resize);
resize();

const input = new BrowserInput();
input.attach(canvas);
window.addEventListener("keydown", unlockAudio);
window.addEventListener("pointerdown", unlockAudio);
/** A crosshair while jumps and attacks aim at the cursor. */
const showCursor = () => (canvas.style.cursor = input.pointerAims ? "crosshair" : "");
showCursor();
input.onChange(showCursor);

const session = new Session(liveParams);
const view = new PlayerPresenter();
const camera = new Camera();
const vfx = new Vfx();
const heard = hearing(() => session.world, proj, () => painter.W);
const sound = new SoundPresenter(heard);
const rumble = new RumblePresenter(heard, () => input.mode === "gamepad");
const debug = new Set<string>();
const roundListeners: ((w: World) => void)[] = [];

session.events.on("roundStart", ({ world }) => {
  view.attach(world);
  camera.attach(world, view);
  vfx.attach(world);
  sound.attach(world);
  rumble.attach(world);
  document.getElementById("goal")!.textContent = world.swarm.queen ? "Kill the queen ♛" : "Kill every boid";
  for (const fn of roundListeners) fn(world);
});

mountBriefing(document.getElementById("briefing")!, session, input, unlockAudio);
createDevPanel([runSection, tuningDevSection, debugSection, inspectSection], {
  session,
  start: (run) => session.start(run),
  debug,
  onRound: (fn) => {
    roundListeners.push(fn);
    if (session.world) fn(session.world);
  },
});

session.start(currentRun());

/** World direction from the player to a screen point, at the player's altitude (the rim's when hanging). */
const aimFromScreen = (sx: number, sy: number) => {
  const p = session.world.player;
  const m = proj.unproject(sx, sy, p.mode === "hang" ? ISLAND_TOP : p.alt);
  const dx = m.x - p.x;
  const dy = m.y - p.y;
  const l = Math.hypot(dx, dy);
  return l > 1 ? { x: dx / l, y: dy / l } : null;
};

let last = performance.now();
let time = 0;
function frame(now: number) {
  const dtReal = Math.min(0.05, (now - last) / 1000);
  last = now;
  const frameInput = input.poll({ aimFromScreen });
  if (input.anyPressed) unlockAudio();
  if (frameInput.pressed.has("mute")) toggleMute();

  const world = session.world;
  const stepped = session.state !== "briefing";
  session.step(dtReal, frameInput);
  world.events.flush();
  if (stepped && session.world === world) {
    time += world.dt;
    vfx.update(world, world.dt);
    view.update(world.dt);
    camera.update(view, world.dt);
  }
  sound.update(session);

  const scene = { session, world: session.world, view, vfx, camera, time, debug };
  render(painter, scene);
  drawHud({ ctx: painter.ctx, W: painter.W, H: painter.H, session, proj, camera, promptText: (a) => input.promptText(a) });
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
