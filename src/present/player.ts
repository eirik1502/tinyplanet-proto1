import type { World } from "../game/world";
import { Avatar, type AvatarView, type AvatarWeapon } from "../render/avatar";

// How the player is shown: a smoothed position (so grabbing and climbing don't snap), an
// animation clock, and the avatar's animation, driven by the world's events. Like everything about
// the player, it all holds still during hit-stop.

/** How far above the rim the player appears when arriving through a portal. */
const ARRIVAL_DROP = 260;

export class PlayerPresenter {
  /** Rendered position. */
  x = 0;
  y = 0;
  alt = 0;
  /** Animation clock (s); stops during hit-stop. */
  anim = 0;
  readonly avatar = new Avatar();
  private w: World | null = null;

  /** Coming down through the portal at the start of a level: the drop eases in slower. */
  private arriving = false;

  /** Follow a new world. Arriving by portal, the player drops in from above. */
  attach(w: World, arrival: "portal" | null = null) {
    this.w = w;
    this.snap();
    this.arriving = arrival === "portal";
    if (this.arriving) this.alt += ARRIVAL_DROP;
    const on = w.events.after.bind(w.events);
    const owner = { owner: w.lifetime };
    const a = this.avatar;
    on("jump", () => a.jump(), owner);
    on("lungeStart", () => a.jump(), owner);
    on("blink", () => a.jump(), owner);
    on("doubleJump", () => a.doubleJump(), owner);
    on("land", (e) => a.land(e.speed), owner);
    on("netBounce", () => a.bounce(), owner);
    on("hitBounce", () => a.bounce(), owner);
    on("turn", (e) => a.backflip(e.angle), owner);
    on("hurt", (e) => a.hurt(e.fromX, e.fromY, e.x, e.y), owner);
    on("block", (e) => e.what === "armor" && a.deflect(), owner);
    on("attack", (e) => a.strike(avatarWeapon(e.weapon), e.angle, e.power, e.attack === "lunge" || e.attack === "sword.poke"), owner);
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
      const settle = this.arriving ? 3.5 : 10;
      this.alt += (p.alt - this.alt) * (p.mode === "hang" ? 1 - Math.exp(-settle * dt) : 1);
      if (this.arriving && (p.mode !== "hang" || Math.abs(p.alt - this.alt) < 2)) this.arriving = false;
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
        ? { weapon: avatarWeapon(at.lunge.weapon.id), angle: at.lunge.angle, power: at.lunge.power }
        : at.aim
          ? { weapon: avatarWeapon(at.aim.weapon.id), angle: at.aim.angle, power: at.power() }
          : null,
      spearReady: at.ready("spear"),
      frozen: p.freeze > 0,
      stunned: p.stun > 0,
    };
  }
}

/** What the avatar holds for a weapon: the lunge is done with the sword. */
const avatarWeapon = (id: string): AvatarWeapon => (id === "spear" ? "spear" : "sword");
