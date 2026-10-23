import type { Projected } from "./projection";

// The player character's look and animation: a hooded climber with a cloth cloak, posed for
// hanging, climbing, sliding, rising, falling, aiming and striking, with squash and stretch,
// a somersault on double jumps and afterimages at speed.
//
// Drawing happens in a local frame centred on the player, +x pointing the way the body faces
// (toward the rim while hanging), in world units scaled to screen pixels. The cloak and the
// afterimages live in world space so they trail behind on their own.

export type AvatarWeapon = "sword" | "spear";

/** What the avatar needs to know about the player each frame. */
export interface AvatarView {
  mode: "hang" | "air" | "lost";
  /** Rendered (smoothed) world position. */
  x: number;
  y: number;
  alt: number;
  /** World angle: toward the rim while hanging, along the flight in the air. */
  facing: number;
  vz: number;
  aim: { weapon: AvatarWeapon; angle: number; power: number } | null;
  /** The spear is on the player's back (not thrown and still cooling down). */
  spearReady: boolean;
  /** Hit-stop: the pose holds. */
  frozen: boolean;
}

type Project = (x: number, y: number, alt: number) => Projected;

const SKIN = "#f2d7b5";
const HAIR = "#2a1a14";
const TUNIC = "#3b3170";
const TUNIC_LIGHT = "#5a4bb0";
const TROUSERS = "#2b2450";
const BOOT = "#5a3a2a";
const CLOAK = "#d9584a";
const CLOAK_DARK = "#a83a32";
const STEEL = "#e8eef8";
const GOLD = "#ffd34d";
const WOOD = "#c9a96e";

/** Drawn size relative to world units. */
const SCALE = 1.4;
const CLOAK_LINKS = 6;
const CLOAK_LINK = 3.6;
const STRIKE_TIME = 0.3;
const SWING_TIME = 0.18;
const FLIP_TIME = 0.42;

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const easeOut = (t: number) => 1 - (1 - t) ** 3;

interface Pt {
  x: number;
  y: number;
}
const dir = (a: number, r = 1): Pt => ({ x: Math.cos(a) * r, y: Math.sin(a) * r });

/** A path through `pts` with rounded corners (quadratic curves between midpoints). */
function smoothPath(ctx: CanvasRenderingContext2D, pts: Pt[], closed: boolean) {
  if (pts.length < 2) return;
  if (closed) {
    const last = pts[pts.length - 1]!;
    ctx.moveTo((last.x + pts[0]!.x) / 2, (last.y + pts[0]!.y) / 2);
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]!;
      const b = pts[(i + 1) % pts.length]!;
      ctx.quadraticCurveTo(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2);
    }
    ctx.closePath();
    return;
  }
  ctx.moveTo(pts[0]!.x, pts[0]!.y);
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    ctx.quadraticCurveTo(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2);
  }
  const end = pts[pts.length - 1]!;
  ctx.lineTo(end.x, end.y);
}

export class Avatar {
  private t = 0;
  /** Smoothed world velocity of the rendered position. */
  private vx = 0;
  private vy = 0;
  private lastX = NaN;
  private lastY = NaN;
  private lastDt = 1 / 60;
  /** Squash (<0) and stretch (>0) along the body, on a spring. */
  private squash = 0;
  private squashV = 0;
  /** Drawn body angle (world); turns toward the aim in the air. */
  private body = 0;
  /** Lean into sideways motion, -1..1. */
  private bank = 0;
  /** Limb cycle phase: hand over hand while climbing, kicking in the air. */
  private cycle = 0;
  /** Double-jump somersault progress 0..1 (1: not flipping). */
  private flip = 1;
  private hurtT = 0;
  private hurtDir = 0;
  /** `thrust`: a straight jab along the angle rather than a sweep across it. */
  private strikeAnim: { weapon: AvatarWeapon; angle: number; power: number; t: number; thrust: boolean } | null = null;
  private cloak: { x: number; y: number; px: number; py: number }[] = [];
  private ghosts: { x: number; y: number; alt: number; angle: number; life: number }[] = [];
  private ghostAcc = 0;

  // -------------------------------------------------------------------------------------------
  // Events
  // -------------------------------------------------------------------------------------------

  jump() {
    this.kick(0.32);
  }

  doubleJump() {
    this.flip = 0;
    this.kick(0.22);
  }

  /** Grabbing a rim; harder landings squash more. */
  land(speed: number) {
    this.kick(-Math.min(0.42, 0.12 + speed / 1600));
  }

  /** Bounced up (safety net, sword hit). */
  bounce() {
    this.kick(0.25);
  }

  hurt(fromX: number, fromY: number, x: number, y: number) {
    this.hurtT = 0.35;
    this.hurtDir = Math.atan2(y - fromY, x - fromX);
    this.kick(-0.25);
  }

  strike(weapon: AvatarWeapon, angle: number, power: number, thrust = false) {
    this.strikeAnim = { weapon, angle, power, t: 0, thrust };
    this.kick(weapon === "sword" ? 0.12 + 0.12 * power : 0.2);
  }

  /** Set the spring moving: peaks at about `amount` of squash / stretch. */
  private kick(amount: number) {
    this.squashV = amount * 22;
  }

  // -------------------------------------------------------------------------------------------
  // Update
  // -------------------------------------------------------------------------------------------

  update(dt: number, v: AvatarView) {
    if (v.frozen || dt <= 0) return;
    this.t += dt;

    // Velocity from the rendered motion. A big jump (respawn, new level) starts over.
    const snapped = !Number.isFinite(this.lastX) || Math.hypot(v.x - this.lastX, v.y - this.lastY) > 150;
    if (snapped) {
      this.vx = this.vy = 0;
      this.body = v.facing;
      this.resetCloak(v);
      this.ghosts = [];
    } else {
      const k = 1 - Math.exp(-12 * dt);
      this.vx += ((v.x - this.lastX) / dt - this.vx) * k;
      this.vy += ((v.y - this.lastY) / dt - this.vy) * k;
    }
    this.lastX = v.x;
    this.lastY = v.y;

    this.squashV += (-260 * this.squash - 12 * this.squashV) * dt;
    this.squash = clamp(this.squash + this.squashV * dt, -0.5, 0.5);

    // In the air the body turns to face an attack; otherwise it follows the facing.
    const strike = this.strikeAnim;
    const want =
      v.mode === "air" && v.aim ? v.aim.angle : v.mode === "air" && strike ? strike.angle : v.facing;
    const turn = v.mode === "hang" ? 30 : 14;
    this.body = wrap(this.body + clamp(wrap(want - this.body), -turn * dt, turn * dt));

    const speed = Math.hypot(this.vx, this.vy);
    const lateral = -Math.sin(this.body) * this.vx + Math.cos(this.body) * this.vy;
    this.bank += (clamp(lateral / 420, -1, 1) - this.bank) * Math.min(1, 8 * dt);
    this.cycle += dt * (v.mode === "hang" ? Math.min(speed, 500) * 0.09 : 7);

    if (this.flip < 1) this.flip = Math.min(1, this.flip + dt / FLIP_TIME);
    this.hurtT = Math.max(0, this.hurtT - dt);
    if (strike && (strike.t += dt) > STRIKE_TIME) this.strikeAnim = null;

    this.updateCloak(dt, v, speed);

    // Afterimages when moving fast or flipping.
    for (const g of this.ghosts) g.life -= dt * 4;
    this.ghosts = this.ghosts.filter((g) => g.life > 0);
    if (v.mode === "air" && (speed > 520 || this.flip < 1)) {
      this.ghostAcc += dt;
      while (this.ghostAcc > 0.035) {
        this.ghostAcc -= 0.035;
        this.ghosts.push({ x: v.x, y: v.y, alt: v.alt, angle: this.body, life: 1 });
      }
    } else this.ghostAcc = 0;
    this.lastDt = dt;
  }

  private resetCloak(v: AvatarView) {
    const b = dir(this.body + Math.PI);
    this.cloak = [];
    for (let i = 0; i <= CLOAK_LINKS; i++) {
      const x = v.x + b.x * (2 + i * CLOAK_LINK);
      const y = v.y + b.y * (2 + i * CLOAK_LINK);
      this.cloak.push({ x, y, px: x, py: y });
    }
  }

  /**
   * Verlet chain pinned between the shoulders. It is pulled gently behind the body (down the
   * cliff while hanging) and flutters more the faster the player moves.
   */
  private updateCloak(dt: number, v: AvatarView, speed: number) {
    if (this.cloak.length === 0) this.resetCloak(v);
    const back = dir(this.body + Math.PI);
    const side = dir(this.body + Math.PI / 2);
    const anchor = this.cloak[0]!;
    anchor.x = anchor.px = v.x + back.x * 2;
    anchor.y = anchor.py = v.y + back.y * 2;
    const carry = (dt / this.lastDt) * Math.exp(-8 * dt);
    const pull = v.mode === "hang" ? 700 : 260;
    for (let i = 1; i < this.cloak.length; i++) {
      const c = this.cloak[i]!;
      const u = i / CLOAK_LINKS;
      const flutter = Math.sin(this.t * (9 + speed * 0.015) - i * 0.9) * (20 + speed * 0.3) * u;
      const ax = back.x * pull + side.x * flutter;
      const ay = back.y * pull + side.y * flutter;
      const nx = c.x + (c.x - c.px) * carry + ax * dt * dt;
      const ny = c.y + (c.y - c.py) * carry + ay * dt * dt;
      c.px = c.x;
      c.py = c.y;
      c.x = nx;
      c.y = ny;
    }
    // Each link follows the one before at a fixed length.
    for (let i = 1; i < this.cloak.length; i++) {
      const a = this.cloak[i - 1]!;
      const c = this.cloak[i]!;
      const d = Math.hypot(c.x - a.x, c.y - a.y) || 1;
      c.x = a.x + ((c.x - a.x) / d) * CLOAK_LINK;
      c.y = a.y + ((c.y - a.y) / d) * CLOAK_LINK;
    }
  }

  // -------------------------------------------------------------------------------------------
  // Drawing
  // -------------------------------------------------------------------------------------------

  draw(ctx: CanvasRenderingContext2D, v: AvatarView, project: Project) {
    const pr = project(v.x, v.y, v.alt);
    if (!pr.visible) return;
    const k = pr.kt * SCALE;

    this.drawGhosts(ctx, project);
    this.drawCloak(ctx, v, project);

    ctx.save();
    ctx.translate(pr.x, pr.y);
    // Recoil from a hit.
    if (this.hurtT > 0) {
      const r = (this.hurtT / 0.35) ** 2 * 5 * k;
      ctx.translate(Math.cos(this.hurtDir) * r, Math.sin(this.hurtDir) * r);
    }
    ctx.rotate(this.body + (v.mode === "lost" ? this.t * 9 : 0));
    ctx.scale((1 + this.squash) * this.flipFactor(), 1 - 0.55 * this.squash);
    ctx.rotate(this.bank * 0.22);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const aimLocal = v.aim ? wrap(v.aim.angle - this.body) : 0;
    const strike = this.strikeAnim;
    const strikeLocal = strike ? wrap(strike.angle - this.body) : 0;
    const swordOut = v.aim?.weapon === "sword" || strike?.weapon === "sword";
    const spearOut = v.aim?.weapon === "spear" || strike?.weapon === "spear" || !v.spearReady;

    this.drawLegs(ctx, v, k);
    if (!spearOut) this.drawSpear(ctx, k, { x: -6, y: -4.5 }, Math.atan2(9, 12), 0.8);
    if (!swordOut) this.drawSheathedSword(ctx, k);

    // Torso with a lit shoulder, belt and the cloak's collar.
    ctx.fillStyle = TUNIC;
    ctx.beginPath();
    ctx.ellipse(-0.5 * k, 0, 5 * k, 6.4 * k, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = TUNIC_LIGHT;
    ctx.beginPath();
    ctx.ellipse(0.6 * k, -1.6 * k, 2.8 * k, 3.6 * k, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#8a5a3a";
    ctx.lineWidth = 1.3 * k;
    ctx.beginPath();
    ctx.moveTo(-3 * k, -4.8 * k);
    ctx.quadraticCurveTo(-3.6 * k, 0, -3 * k, 4.8 * k);
    ctx.stroke();
    ctx.strokeStyle = CLOAK_DARK;
    ctx.lineWidth = 2.2 * k;
    ctx.beginPath();
    ctx.arc(1.2 * k, 0, 4.6 * k, Math.PI * 0.55, Math.PI * 1.45);
    ctx.stroke();

    this.drawArms(ctx, v, k, aimLocal, strikeLocal);
    this.drawHead(ctx, v, k, aimLocal);

    // Hurt tint
    if (this.hurtT > 0) {
      ctx.fillStyle = `rgba(255,70,70,${(this.hurtT / 0.35) * 0.55})`;
      ctx.beginPath();
      ctx.ellipse(0, 0, 7.5 * k, 8 * k, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /**
   * A somersault seen from above: lengths along the body foreshorten through the flip, turn
   * over, and come back round (1 when not flipping).
   */
  private flipFactor() {
    return this.flip < 1 ? Math.cos(easeOut(this.flip) * Math.PI * 2) : 1;
  }

  private drawGhosts(ctx: CanvasRenderingContext2D, project: Project) {
    for (const g of this.ghosts) {
      const q = project(g.x, g.y, g.alt);
      if (!q.visible) continue;
      const k = q.kt * SCALE;
      ctx.save();
      ctx.globalAlpha *= g.life * 0.3;
      ctx.fillStyle = "#9fe8ff";
      ctx.translate(q.x, q.y);
      ctx.rotate(g.angle);
      ctx.beginPath();
      ctx.ellipse(-0.5 * k, 0, 5 * k, 6.4 * k, 0, 0, Math.PI * 2);
      ctx.moveTo(6.2 * k, 0);
      ctx.arc(2 * k, 0, 4.2 * k, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  /** The cloak: a ribbon along the chain, wide at the shoulders and tapering to the hem. */
  private drawCloak(ctx: CanvasRenderingContext2D, v: AvatarView, project: Project) {
    if (this.cloak.length < 2) return;
    // Through a somersault the cloak flips over with the body.
    const f = this.flipFactor();
    const o = this.cloak[0]!;
    const ax = Math.cos(this.body);
    const ay = Math.sin(this.body);
    const c = this.cloak.map((q) => {
      const along = (q.x - o.x) * ax + (q.y - o.y) * ay;
      const shift = along * (f - 1);
      return { x: q.x + ax * shift, y: q.y + ay * shift };
    });
    const left: Projected[] = [];
    const right: Projected[] = [];
    const mid: Projected[] = [];
    for (let i = 0; i < c.length; i++) {
      const a = c[Math.max(0, i - 1)]!;
      const b = c[Math.min(c.length - 1, i + 1)]!;
      const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const nx = -(b.y - a.y) / d;
      const ny = (b.x - a.x) / d;
      const u = i / (c.length - 1);
      // Widest a little below the shoulders, flaring then narrowing to the hem.
      const w = (5.2 + 2.2 * Math.sin(u * Math.PI * 0.8) - 3.5 * u) * SCALE;
      const alt = v.alt - 0.5 - u * 2;
      left.push(project(c[i]!.x + nx * w, c[i]!.y + ny * w, alt));
      right.push(project(c[i]!.x - nx * w, c[i]!.y - ny * w, alt));
      mid.push(project(c[i]!.x, c[i]!.y, alt));
    }
    ctx.fillStyle = CLOAK;
    ctx.beginPath();
    smoothPath(ctx, [...left, ...[...right].reverse()], true);
    ctx.fill();
    // A fold down the middle and a darker hem.
    ctx.strokeStyle = CLOAK_DARK;
    ctx.lineCap = "round";
    ctx.lineWidth = Math.max(1, 1.2 * mid[0]!.kt);
    ctx.beginPath();
    smoothPath(ctx, mid.slice(1), false);
    ctx.stroke();
    const l = left[left.length - 1]!;
    const r = right[right.length - 1]!;
    ctx.lineWidth = Math.max(1, 1.6 * l.kt);
    ctx.beginPath();
    ctx.moveTo(l.x, l.y);
    ctx.lineTo(r.x, r.y);
    ctx.stroke();
  }

  private drawLegs(ctx: CanvasRenderingContext2D, v: AvatarView, k: number) {
    const speed = Math.hypot(this.vx, this.vy);
    for (const side of [-1, 1]) {
      let fx: number;
      let fy: number;
      if (v.mode === "hang") {
        // Dangling down the cliff; stepping with the climb, swept aside by a slide.
        const step = Math.sin(this.cycle + (side > 0 ? Math.PI : 0)) * Math.min(1, speed / 120);
        const idle = Math.sin(this.t * 2 + side) * 0.5;
        fx = -8.5 + step * 1.8 + idle;
        fy = side * 2.8 - this.bank * 3;
      } else if (v.mode === "lost" || v.vz < -60) {
        // Falling: legs spread and kicking.
        fx = -7.5 + Math.sin(this.cycle * 2 + side) * 1.2;
        fy = side * 4.8;
      } else {
        // Rising: knees tucked.
        fx = -4.5;
        fy = side * 3.2;
      }
      ctx.strokeStyle = TROUSERS;
      ctx.lineWidth = 2.6 * k;
      ctx.beginPath();
      ctx.moveTo(-2.5 * k, side * 2.2 * k);
      ctx.lineTo(fx * k, fy * k);
      ctx.stroke();
      ctx.fillStyle = BOOT;
      ctx.beginPath();
      ctx.ellipse(fx * k, fy * k, 1.9 * k, 1.5 * k, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawArms(ctx: CanvasRenderingContext2D, v: AvatarView, k: number, aimLocal: number, strikeLocal: number) {
    const speed = Math.hypot(this.vx, this.vy);
    const strike = this.strikeAnim;
    const shoulder = (side: number): Pt => ({ x: 1, y: side * 4.8 });

    // Where each hand goes without a weapon in it.
    const freeHand = (side: number): Pt => {
      if (v.mode === "hang") {
        // On the rim; hand over hand while climbing.
        const ph = this.cycle + (side > 0 ? Math.PI : 0);
        const m = Math.min(1, speed / 120);
        return { x: 9.5 + Math.max(0, Math.cos(ph)) * 1.4 * m, y: side * 5.2 + Math.sin(ph) * 2.4 * m };
      }
      if (v.mode === "lost" || v.vz < -60) {
        return { x: 2 + Math.sin(this.cycle * 1.7 + side) * 2, y: side * (9.5 + Math.cos(this.cycle * 1.3) * 1.2) };
      }
      return { x: 4.5, y: side * 8.5 };
    };

    const arm = (side: number, hand: Pt) => {
      const s = shoulder(side);
      ctx.strokeStyle = TUNIC_LIGHT;
      ctx.lineWidth = 2.6 * k;
      ctx.beginPath();
      ctx.moveTo(s.x * k, s.y * k);
      ctx.lineTo(hand.x * k, hand.y * k);
      ctx.stroke();
      ctx.fillStyle = SKIN;
      ctx.beginPath();
      ctx.arc(hand.x * k, hand.y * k, 1.6 * k, 0, Math.PI * 2);
      ctx.fill();
    };

    // The left hand keeps its grip (or balances); the right holds the weapon.
    let left = freeHand(-1);
    let right = freeHand(1);
    let weapon: (() => void) | null = null;

    if (v.aim?.weapon === "sword" || strike?.weapon === "sword") {
      let blade: number;
      let reach: number;
      if (strike?.weapon === "sword" && strike.thrust) {
        // Jab straight out along the thrust.
        blade = strikeLocal;
        reach = 3 + (6 + strike.power * 2) * easeOut(Math.min(1, strike.t / SWING_TIME));
      } else if (strike?.weapon === "sword") {
        // Sweep through the slash's arc, then ease back.
        const p = easeOut(Math.min(1, strike.t / SWING_TIME));
        blade = strikeLocal - 1.35 + 2.7 * p;
        reach = 7 + strike.power * 2;
      } else {
        // Wind-up: drawn back across the body, further with power.
        const power = v.aim!.power;
        blade = aimLocal - 0.7 - 1.1 * power;
        reach = 5.5;
      }
      const s = shoulder(1);
      right = { x: s.x + Math.cos(blade) * reach, y: s.y + Math.sin(blade) * reach };
      const len = 10 + 5 * (strike?.power ?? v.aim?.power ?? 0);
      const charged = !strike && (v.aim?.power ?? 0) >= 1;
      const hand = right;
      weapon = () => this.drawSword(ctx, k, hand, blade, len, charged);
    } else if (v.aim?.weapon === "spear") {
      // Drawn back over the shoulder along the aim; the free hand points the way.
      const power = v.aim.power;
      const a = dir(aimLocal);
      const s = shoulder(1);
      right = { x: s.x - a.x * (2 + 4 * power), y: s.y - a.y * (2 + 4 * power) };
      if (v.mode !== "hang") left = { x: shoulder(-1).x + a.x * 7, y: shoulder(-1).y + a.y * 7 };
      const hand = right;
      weapon = () => this.drawSpear(ctx, k, { x: hand.x - a.x * 12, y: hand.y - a.y * 12 }, aimLocal, 1, power >= 1);
    } else if (strike?.weapon === "spear") {
      // Follow-through: arm flung out along the throw.
      const p = easeOut(Math.min(1, strike.t / 0.12));
      const s = shoulder(1);
      const a = dir(strikeLocal);
      right = { x: s.x + a.x * 9 * p - a.x * 3 * (1 - p), y: s.y + a.y * 9 * p - a.y * 3 * (1 - p) };
    }

    arm(-1, left);
    arm(1, right);
    weapon?.();
  }

  private drawSword(ctx: CanvasRenderingContext2D, k: number, hand: Pt, angle: number, len: number, charged: boolean) {
    const d = dir(angle);
    const n = dir(angle + Math.PI / 2);
    const tip = { x: hand.x + d.x * len, y: hand.y + d.y * len };
    if (charged) {
      const pulse = 0.6 + 0.4 * Math.sin(this.t * 30);
      const g = ctx.createRadialGradient(tip.x * k, tip.y * k, 0, tip.x * k, tip.y * k, 7 * k);
      g.addColorStop(0, `rgba(255,236,170,${0.9 * pulse})`);
      g.addColorStop(1, "rgba(255,236,170,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(tip.x * k, tip.y * k, 7 * k, 0, Math.PI * 2);
      ctx.fill();
    }
    // Blade
    ctx.fillStyle = STEEL;
    ctx.strokeStyle = "#7d7aa8";
    ctx.lineWidth = 0.6 * k;
    ctx.beginPath();
    ctx.moveTo((hand.x + d.x * 1.5 + n.x * 1.1) * k, (hand.y + d.y * 1.5 + n.y * 1.1) * k);
    ctx.lineTo(tip.x * k, tip.y * k);
    ctx.lineTo((hand.x + d.x * 1.5 - n.x * 1.1) * k, (hand.y + d.y * 1.5 - n.y * 1.1) * k);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Guard and pommel
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 1.4 * k;
    ctx.beginPath();
    ctx.moveTo((hand.x + d.x * 1.2 + n.x * 2.6) * k, (hand.y + d.y * 1.2 + n.y * 2.6) * k);
    ctx.lineTo((hand.x + d.x * 1.2 - n.x * 2.6) * k, (hand.y + d.y * 1.2 - n.y * 2.6) * k);
    ctx.stroke();
    ctx.fillStyle = GOLD;
    ctx.beginPath();
    ctx.arc((hand.x - d.x * 1.8) * k, (hand.y - d.y * 1.8) * k, 0.9 * k, 0, Math.PI * 2);
    ctx.fill();
  }

  /** Sword in its scabbard at the left hip. */
  private drawSheathedSword(ctx: CanvasRenderingContext2D, k: number) {
    ctx.strokeStyle = "#4a2e22";
    ctx.lineWidth = 2 * k;
    ctx.beginPath();
    ctx.moveTo(-2 * k, -5.2 * k);
    ctx.lineTo(-10 * k, -7.5 * k);
    ctx.stroke();
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 1.3 * k;
    ctx.beginPath();
    ctx.moveTo(-1.4 * k, -3.6 * k);
    ctx.lineTo(-2.4 * k, -6.8 * k);
    ctx.stroke();
  }

  /** Spear from its butt at `from`, pointing along `angle`. */
  private drawSpear(ctx: CanvasRenderingContext2D, k: number, from: Pt, angle: number, scale: number, charged = false) {
    const d = dir(angle);
    const n = dir(angle + Math.PI / 2);
    const L = 22 * scale;
    const neck = { x: from.x + d.x * L, y: from.y + d.y * L };
    const tip = { x: neck.x + d.x * 5, y: neck.y + d.y * 5 };
    if (charged) {
      const pulse = 0.6 + 0.4 * Math.sin(this.t * 30);
      const g = ctx.createRadialGradient(tip.x * k, tip.y * k, 0, tip.x * k, tip.y * k, 7 * k);
      g.addColorStop(0, `rgba(170,230,255,${0.9 * pulse})`);
      g.addColorStop(1, "rgba(170,230,255,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(tip.x * k, tip.y * k, 7 * k, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = WOOD;
    ctx.lineWidth = 1.3 * k;
    ctx.beginPath();
    ctx.moveTo(from.x * k, from.y * k);
    ctx.lineTo(neck.x * k, neck.y * k);
    ctx.stroke();
    ctx.fillStyle = "#f2efff";
    ctx.strokeStyle = "#7d7aa8";
    ctx.lineWidth = 0.6 * k;
    ctx.beginPath();
    ctx.moveTo(tip.x * k, tip.y * k);
    ctx.lineTo((neck.x + d.x * 1.5 + n.x * 2) * k, (neck.y + d.y * 1.5 + n.y * 2) * k);
    ctx.lineTo(neck.x * k, neck.y * k);
    ctx.lineTo((neck.x + d.x * 1.5 - n.x * 2) * k, (neck.y + d.y * 1.5 - n.y * 2) * k);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  /** Head seen from above: hair, a glimpse of face and eyes. It turns toward the aim. */
  private drawHead(ctx: CanvasRenderingContext2D, v: AvatarView, k: number, aimLocal: number) {
    let look: number;
    if (v.aim) look = clamp(aimLocal, -1.3, 1.3);
    else if (v.mode === "hang" && Math.hypot(this.vx, this.vy) < 30) look = Math.sin(this.t * 0.6) * 0.5 * Math.sin(this.t * 0.23);
    else look = this.bank * 0.4;
    ctx.save();
    ctx.translate(1.6 * k, 0);
    ctx.rotate(look);
    // Ponytail flicking behind.
    const flick = Math.sin(this.t * 7) * 0.8 + this.bank * 1.5;
    ctx.fillStyle = HAIR;
    ctx.beginPath();
    ctx.moveTo(-2.5 * k, -1.6 * k);
    ctx.quadraticCurveTo(-6 * k, flick * k, -8 * k, flick * 1.6 * k);
    ctx.quadraticCurveTo(-5.5 * k, (flick + 1) * k, -2.5 * k, 1.6 * k);
    ctx.fill();
    // Face peeking out in front, then the hair over the crown.
    ctx.fillStyle = SKIN;
    ctx.beginPath();
    ctx.ellipse(1.8 * k, 0, 2.6 * k, 3.4 * k, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = HAIR;
    ctx.beginPath();
    ctx.ellipse(-0.5 * k, 0, 3.8 * k, 4 * k, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 0.9 * k;
    ctx.beginPath();
    ctx.arc(-0.5 * k, 0, 2.6 * k, -Math.PI * 0.9, -Math.PI * 0.35);
    ctx.stroke();
    // Eyes (squeezed shut while hurt)
    ctx.fillStyle = "#1a0e0a";
    for (const side of [-1, 1]) {
      ctx.beginPath();
      if (this.hurtT > 0) ctx.ellipse(3.4 * k, side * 1.3 * k, 0.3 * k, 0.8 * k, 0, 0, Math.PI * 2);
      else ctx.arc(3.5 * k, side * 1.3 * k, 0.6 * k, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
