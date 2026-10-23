import type { Session } from "../game/session";
import type { World } from "../game/world";
import { applyVolumes, music, sfx } from "./audio";
import type { Hearing } from "./hearing";

// Sound: the world's events played as effects, and every frame the held sounds (sliding, wind)
// and the music's mood (how many boids are fighting nearby, the queen close, slow motion).

export class SoundPresenter {
  constructor(private heard: Hearing) {}

  attach(w: World) {
    music.setSeed(w.planet.seed);
    const on = w.events.after.bind(w.events);
    const owner = { owner: w.lifetime };
    const heard = this.heard;
    on("jump", () => sfx.jump(), owner);
    on("doubleJump", () => sfx.doubleJump(), owner);
    on("land", (e) => sfx.grab(e.speed), owner);
    on("netBounce", () => sfx.netBounce(), owner);
    on("lost", () => sfx.lost(), owner);
    on("respawn", () => sfx.respawn(), owner);
    on("hurt", () => sfx.playerHurt(), owner);
    on("aimStart", (e) => sfx.aim(e.weapon === "spear" ? "spear" : "sword"), owner);
    on("charged", () => sfx.charged(), owner);
    on("lungeStart", (e) => sfx.thrustWhoosh(e.duration), owner);
    on("attack", (e) => {
      if (e.attack === "sword.swipe") sfx.swing(e.power);
      else if (e.attack === "sword.thrust") {
        if (e.lunged) sfx.thrustClash(e.power);
        else {
          sfx.thrustWhoosh(0.1);
          sfx.thrustClash(e.power, 0.1);
        }
      } else if (e.weapon === "spear") sfx.throwSpear(e.power);
      // The smash's sound comes with its blast.
    }, owner);
    on("slowMo", (e) => (e.on ? sfx.slowMoIn() : sfx.slowMoOut()), owner);
    on("roundOver", (e) => (e.outcome === "victory" ? sfx.victory() : sfx.defeat()), owner);

    // The player's own hits are always heard at full volume.
    on("hit", (e) => {
      sfx.hitEnemy(e.kind, e.killed, { pan: heard(e.x, e.y, e.alt).pan });
      if (e.kind === "queen" && e.killed) sfx.queenDeath();
    }, owner);
    // Everything else, by how far away it is.
    const near = <E extends { x: number; y: number; alt: number }>(fn: (e: E, at: ReturnType<Hearing>) => void) => (e: E) => {
      const at = heard(e.x, e.y, e.alt);
      if (at.gain > 0.01) fn(e, at);
    };
    on("shot", near((_, at) => sfx.orbShot(at)), owner);
    on("enemyLunge", near((_, at) => sfx.lunge(at)), owner);
    on("windup", near((e, at) => sfx.windup(e.kind, e.dur, at)), owner);
    on("interrupt", near((_, at) => sfx.interrupt(at)), owner);
    on("smash", near((_, at) => sfx.smash(at)), owner);
    on("blast", near((_, at) => sfx.smash(at)), owner);
    on("explode", near((_, at) => sfx.explosion({ pan: at.pan, gain: Math.max(0.35, at.gain) })), owner);
    on("anger", near((e, at) => sfx.queenAnger(e.dur, at)), owner);
    on("queenBlast", near((_, at) => sfx.queenBlast({ pan: at.pan, gain: Math.max(0.5, at.gain) })), owner);
    on("block", near((_, at) => sfx.block(at)), owner);
    on("thud", near((_, at) => sfx.thud(at)), owner);
  }

  /** Held sounds and the music's mood, every frame. */
  update(session: Session) {
    if (session.state === "briefing") {
      sfx.loops(0, 0);
      music.update(0, 0, 0.25);
      applyVolumes();
      return;
    }
    const w = session.world;
    const p = w.player;
    const playing = session.state === "play";
    const slide = p.mode === "hang" && p.freeze <= 0 ? Math.min(1, Math.abs(p.slide) / 400) : 0;
    const wind = p.mode === "air" ? Math.min(1, Math.hypot(p.vx, p.vy, p.vz) / (w.params.move.limits.maxSpeed * 1.5)) : 0;
    sfx.loops(slide, wind);

    // The fight heats up with the number of engaged boids nearby, and when the queen is close.
    let near = 0;
    const q = w.swarm.queen;
    for (const b of w.swarm.boids) {
      if (b.hp > 0 && b !== q && b.flock.engaged && Math.hypot(b.x - p.x, b.y - p.y) < 700) near++;
    }
    const queenNear = q && q.hp > 0 && Math.hypot(q.x - p.x, q.y - p.y) < q.params.threatRadius ? 0.5 : 0;
    const intensity = playing ? Math.min(1, near / 6 + queenNear) : 0;
    music.update(intensity, w.slow.intensity, playing ? 1 : 0.25);
    applyVolumes();
  }
}
