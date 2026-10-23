import type { World } from "../game/world";
import { Avatar, type AvatarView, type AvatarWeapon } from "../render/avatar";

// How the player is shown: a smoothed position (so grabbing and climbing don't snap), an
// animation clock, and the avatar's animation, driven by the world's events. Like everything about
// the player, it all holds still during hit-stop.

export class PlayerPresenter {
  /** Rendered position. */
  x = 0;
  y = 0;
  alt = 0;
  /** Animation clock (s); stops during hit-stop. */
  anim = 0;
  readonly avatar = new Avatar();
  private w: World | null = null;

  attach(w: World) {
    this.w = w;
    this.snap();
    const on = w.events.after.bind(w.events);
    const owner = { owner: w.lifetime };
    const a = this.avatar;
    on("jump", () => a.jump(), owner);
    on("lungeStart", () => a.jump(), owner);
    on("doubleJump", () => a.doubleJump(), owner);
    on("land", (e) => a.land(e.speed), owner);
    on("netBounce", () => a.bounce(), owner);
    on("hitBounce", () => a.bounce(), owner);
    on("hurt", (e) => a.hurt(e.fromX, e.fromY, e.x, e.y), owner);
    on("attack", (e) => a.strike(e.weapon as AvatarWeapon, e.angle, e.power, e.attack === "sword.thrust"), owner);
    on("respawn", (e) => {
      this.x = e.x;
      this.y = e.y;
      this.alt = e.alt;
    }, owner);
  }

  private snap() {
    const p = this.w!.player;
    this.x = p.x;
    this.y = p.y;
    this.alt = p.alt;
  }

  /** Follow the player by world time `dt`. */
  update(dt: number) {
    const p = this.w!.player;
    if (p.freeze <= 0) {
      this.anim += dt;
      const k = p.mode === "hang" ? 1 - Math.exp(-18 * dt) : 1;
      this.x += (p.x - this.x) * k;
      this.y += (p.y - this.y) * k;
      this.alt += (p.alt - this.alt) * (p.mode === "hang" ? 1 - Math.exp(-10 * dt) : 1);
    }
    this.avatar.update(dt, this.view());
  }

  /** What the avatar needs to know about the player this frame. */
  view(): AvatarView {
    const w = this.w!;
    const p = w.player;
    const at = w.attacks;
    return {
      mode: p.mode,
      x: this.x,
      y: this.y,
      alt: this.alt,
      facing: p.facing,
      vz: p.vz,
      aim: at.lunge
        ? { weapon: at.lunge.weapon.id, angle: at.lunge.angle, power: at.lunge.power }
        : at.aim
          ? { weapon: at.aim.weapon.id, angle: at.aim.angle, power: at.power() }
          : null,
      spearReady: at.ready("spear"),
      frozen: p.freeze > 0,
    };
  }
}
