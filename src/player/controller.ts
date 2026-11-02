import type { Vec } from "../core/math";
import { wrapAngle } from "../core/math";
import { box } from "../combat/hitbox";
import { Health, Hurtable, type HitInfo } from "../combat/components";
import type { World } from "../game/world";
import type { InputFrame } from "../input/types";
import { ISLAND_TOP, type EdgePoint, type Island } from "../world/island";
import { flightOf, gravity, gravityAt, launch, maxLean, netBounce, predict, riseSpeed, stepFlight } from "./flight";
import { HANG_ALT, LOST_ALT, Player } from "./player";
import { warpPlayer } from "../game/portal";

// The player's movement: hanging on and climbing rims, sliding, jumping (held for full height),
// steering in the air, the double jump with its snap to an island ahead, the safety bounce,
// falling into the haze and respawning. Also how the player takes hits and shoves (and is
// stunned by them), reacts to
// their own hits landing (and turns on them), and the slow motion while aiming in the air.

/** Spacing of the rim spots tried for a jump (world units). */
const SPOT_STEP = 4;
/** Steps of the jump assist's search (rad). */
const ASSIST_STEP = 0.035;
/** How hard a hit in the air knocks the flight sideways. */
const HIT_KNOCKBACK = 160;

/** The jump the player would make from the rim right now. */
export interface JumpPlan {
  /** The jump's direction (world angle). */
  angle: number;
  /** Straight out of the rim. */
  out: number;
  /** The rim spot it goes from (the player climbs there first when it isn't where they are). */
  s: number;
  /** Even from that spot, the input points further from straight out than a jump can lean. */
  clamped: boolean;
  /** The direction came from the input (or a slide), not just straight out. */
  steered: boolean;
}

export class PlayerController {
  readonly player: Player;
  readonly health: Health;
  /** While hanging and playing: where a jump would go now, for the jump preview. */
  jumpPlan: JumpPlan | null = null;
  /** The jump assist's last answer, for the jump it was asked about (it only changes when the jump does). */
  private assistCache = { key: "", angle: 0 };

  constructor(private w: World) {
    const p = (this.player = w.objects.add(new Player()));
    this.health = p.add(Health, { hp: w.params.player.health.max, max: w.params.player.health.max });
    p.add(Hurtable, {
      team: "player",
      hurtbox: () => box(p.x, p.y, p.alt, w.params.player.hurtbox.radius),
      targetable: () => w.playing && p.mode !== "lost",
      hit: (h) => this.hurt(h),
      push: (vx, vy, vz, hard) => this.push(vx, vy, vz, hard),
    });
    // The player's own hits: hit-stop and a chance to turn after sword hits; in the air they refill the
    // double jump and some focus, and sword hits bounce the player up.
    w.events.on("hit", (e) => this.onOwnHit(e.weapon, e.damage), { source: p.id, owner: p.lifetime });
    this.reset();
  }

  /** Hang on the rim of the start island, facing its nearest neighbour, at full health. */
  private reset() {
    const { planet, islands } = this.w;
    const p = this.player;
    const start = islands[planet.startIsland]!;
    const others = islands.filter((i) => i !== start);
    const near = others.length
      ? others.reduce((a, b) =>
          Math.hypot(a.cx - start.cx, a.cy - start.cy) < Math.hypot(b.cx - start.cx, b.cy - start.cy) ? a : b,
        )
      : { cx: planet.bounds.x, cy: planet.bounds.y };
    this.grab(planet.startIsland, start.closest(near.cx, near.cy).s);
    const e = start.pointAt(p.s);
    p.x = e.x + e.nx * 7;
    p.y = e.y + e.ny * 7;
    p.alt = HANG_ALT;
    p.facing = Math.atan2(-e.ny, -e.nx);
    p.slide = 0;
    this.health.hp = this.w.params.player.health.max;
    p.invuln = 0;
    p.stun = 0;
  }

  private rim(): EdgePoint {
    return this.w.islands[this.player.island]!.pointAt(this.player.s);
  }

  // -------------------------------------------------------------------------------------------
  // Hits and shoves
  // -------------------------------------------------------------------------------------------

  private hurt(h: HitInfo): boolean {
    const p = this.player;
    const w = this.w;
    if (p.invuln > 0 || !w.playing) return false;
    this.health.hp = Math.max(0, this.health.hp - h.damage);
    p.freeze = Math.max(p.freeze, w.combat.hitStop(h.damage));
    p.invuln = w.params.player.health.invulnTime;
    w.events.emit("hurt", { target: p.id, x: p.x, y: p.y, alt: p.alt, damage: h.damage, fromX: h.fromX, fromY: h.fromY });
    const knock = p.mode === "air" ? HIT_KNOCKBACK : 0;
    if (knock) {
      // Knock the flight sideways.
      const l = Math.hypot(p.x - h.fromX, p.y - h.fromY) || 1;
      p.vx += ((p.x - h.fromX) / l) * knock;
      p.vy += ((p.y - h.fromY) / l) * knock;
    }
    this.stun(knock);
    if (this.health.hp <= 0) w.end("defeat");
    return true;
  }

  /**
   * Stun the player for `stun.min`, plus `stun.perSpeed` for each unit of knockback `speed` taken
   * (up to `stun.max`): a hard throw keeps them helpless for the whole flight it starts. It
   * interrupts a turn.
   */
  private stun(speed: number) {
    const p = this.player;
    const st = this.w.params.player.stun;
    p.stun = Math.max(p.stun, Math.min(st.max, st.min + speed * st.perSpeed));
    p.turn = null;
    p.turnWindow = 0;
    p.jumpQueue = null;
  }

  /**
   * Shove the player (a blast). In the air it adds to the flight; on a rim it blows them off it:
   * outward, keeping the push's sideways part, as if they had jumped. A `hard` shove first cancels
   * any flight against it.
   */
  private push(vx: number, vy: number, vz: number, hard = false) {
    const p = this.player;
    if (!this.w.playing || p.mode === "lost") return;
    this.w.events.emit("pushed", { target: p.id, hard });
    this.stun(Math.hypot(vx, vy));
    if (p.mode === "air") {
      const l = Math.hypot(vx, vy);
      const against = l > 0 ? (p.vx * vx + p.vy * vy) / l : 0;
      if (hard && against < 0) {
        p.vx -= (vx / l) * against;
        p.vy -= (vy / l) * against;
      }
      p.vx += vx;
      p.vy += vy;
      p.vz = Math.max(p.vz, vz);
      p.jumpHeld = false;
      return;
    }
    const e = this.rim();
    const along = vx * e.tx + vy * e.ty;
    const out = Math.max(Math.abs(vx * e.nx + vy * e.ny), Math.hypot(vx, vy) * 0.6);
    this.leaveRim(e.nx * out + e.tx * along, e.ny * out + e.ty * along, vz);
  }

  private onOwnHit(weapon: string | undefined, damage: number) {
    const p = this.player;
    const w = this.w;
    if (weapon === "sword" && p.mode !== "lost") {
      p.freeze = Math.max(p.freeze, w.combat.hitStop(damage));
      if (p.mode === "air" && !p.turn) p.turnWindow = w.params.move.turn.window;
    }
    if (p.mode !== "air") return;
    p.airJumps = 1;
    p.focus = Math.min(1, p.focus + w.params.player.focus.perHit);
    if (weapon === "sword") {
      p.vz = Math.max(p.vz, w.params.move.airJump.bounce);
      p.jumpHeld = false;
      w.events.emit("hitBounce", { source: p.id });
    }
  }

  // -------------------------------------------------------------------------------------------
  // Rims
  // -------------------------------------------------------------------------------------------

  /** Jump off the rim from spot `s` (where the player is) at `angle`, climbing at `climb` on the press. */
  private jump({ s, angle, climb }: { s: number; angle: number; climb: number }) {
    const w = this.w;
    const p = this.player;
    const e = this.rim();
    const f = launch(w, p.island, s, angle, p.slide, climb);
    Object.assign(p, { x: f.x, y: f.y, alt: f.alt, vx: f.vx, vy: f.vy, vz: f.vz });
    p.mode = "air";
    p.airTime = 0;
    p.launchIsland = p.island;
    p.jumpHeld = true;
    p.airJumps = 1;
    p.slide = 0;
    p.climb = 0;
    p.jumpQueue = null;
    w.events.emit("jump", { source: p.id, x: e.x, y: e.y, alt: ISLAND_TOP });
  }

  /** Let go of the rim into the air, from just off it, at this velocity. */
  leaveRim(vx: number, vy: number, vz: number) {
    const p = this.player;
    const e = this.rim();
    p.x = e.x + e.nx * 12;
    p.y = e.y + e.ny * 12;
    p.alt = ISLAND_TOP;
    p.vx = vx;
    p.vy = vy;
    p.vz = vz;
    p.mode = "air";
    p.airTime = 0;
    p.launchIsland = p.island;
    p.jumpHeld = false;
    p.airJumps = 1;
    p.slide = 0;
    p.jumpQueue = null;
  }

  /** Grab a rim. Arriving fast turns the along-rim part of the velocity into a slide. */
  private grab(islandIdx: number, s: number, vx = 0, vy = 0) {
    const p = this.player;
    const sl = this.w.params.move.slide;
    const e = this.w.islands[islandIdx]!.pointAt(s);
    const along = vx * e.tx + vy * e.ty;
    p.slide = Math.hypot(vx, vy) > sl.minSpeed ? along * sl.keep : 0;
    p.mode = "hang";
    p.island = islandIdx;
    p.s = s;
    p.vx = p.vy = p.vz = 0;
    p.jumpHeld = false;
    p.airJumps = 0;
    p.netUsed = false;
    p.jumpQueue = null;
    p.focus = 1;
    p.safeIsland = islandIdx;
    p.safeS = s;
  }

  // -------------------------------------------------------------------------------------------
  // Slow motion
  // -------------------------------------------------------------------------------------------

  /**
   * Charging an attack in the air slows the world down until the attack is released, the player
   * grabs an island (or falls into the haze), or focus runs out. Slow motion drains focus; hits
   * regain some and grabbing a rim refills it. The world's time scale eases between 1 and
   * `slowMo.scale` over the fade times (in real time).
   */
  updateSlowMo(dtReal: number) {
    const w = this.w;
    const p = this.player;
    const slow = w.slow;
    const sm = w.params.player.slowMo;
    const want = w.playing && p.mode === "air" && w.attacks.aim !== null && p.focus > 0;
    if (want && p.freeze <= 0) p.focus = Math.max(0, p.focus - w.params.player.focus.drain * dtReal);
    if (want !== slow.active) w.events.emit("slowMo", { on: want });
    slow.active = want;
    const span = 1 - sm.scale;
    const target = want ? sm.scale : 1;
    const fade = want ? sm.fadeIn : sm.fadeOut;
    const step = fade > 0 ? (span * dtReal) / fade : Infinity;
    slow.scale = slow.scale > target ? Math.max(target, slow.scale - step) : Math.min(target, slow.scale + step);
    slow.intensity = span > 0 ? Math.max(0, Math.min(1, (1 - slow.scale) / span)) : 0;
  }

  // -------------------------------------------------------------------------------------------
  // Movement
  // -------------------------------------------------------------------------------------------

  /** `dt` is world time (slowed during slow motion); `dtReal` is wall-clock time. */
  update(dt: number, dtReal: number, input: InputFrame) {
    const w = this.w;
    const prm = w.params;
    const p = this.player;
    const playing = w.playing;
    // Stunned, the player can't climb, jump or attack; steering in the air still works.
    const stunned = p.stun > 0;
    const dir = playing ? input.move : { x: 0, y: 0 };
    const aim = playing ? input.aim : null;
    const jumpPressed = playing && !stunned && input.pressed.has("jump");
    this.jumpPlan = null;
    if (p.warp && w.portal) {
      warpPlayer(w, w.portal, dt);
      return;
    }

    if (p.freeze <= 0 && stunned) p.stun = Math.max(0, p.stun - dt);
    if (p.freeze <= 0 && p.turnWindow > 0) {
      // Just after a sword hit in the air: a clearly tilted stick turns the flight.
      p.turnWindow = Math.max(0, p.turnWindow - dtReal);
      this.startTurn(dir);
    }

    if (p.freeze > 0) {
      // Hit-stop: no moving, attacking or animating.
      p.freeze -= dtReal;
    } else if (p.turn) {
      // The backflip: held in place a moment, then off the new way at the speed it had.
      const t = p.turn;
      if (p.mode !== "air") p.turn = null;
      else if ((t.t -= dt) <= 0) {
        p.vx = Math.cos(t.angle) * t.speed;
        p.vy = Math.sin(t.angle) * t.speed;
        p.vz = t.vz;
        p.turn = null;
      }
    } else if (p.mode === "hang") {
      const isl = w.islands[p.island]!;
      let e = isl.pointAt(p.s);
      const queued = p.jumpQueue;
      if (queued) {
        // Climbing to the spot a jump goes from: no other input counts until it's off.
        const d = queued.s - p.s;
        const step = prm.move.climb.speed * dt;
        p.s = Math.abs(d) <= step ? queued.s : p.s + Math.sign(d) * step;
        p.climb = 0;
      } else {
        // Climb toward the rim point that faces the input direction. Aiming an attack takes over
        // the input; an ongoing slide carries on.
        p.climb = w.attacks.aim || stunned ? 0 : climbInput(e, dir) * prm.move.climb.speed;
        p.s += (p.climb + p.slide) * dt;
      }
      p.slide *= Math.exp(-prm.move.slide.friction * dt);
      if (Math.abs(p.slide) < 5) p.slide = 0;
      e = isl.pointAt(p.s);
      p.x = e.x + e.nx * 7;
      p.y = e.y + e.ny * 7;
      p.alt = HANG_ALT;
      p.facing = Math.atan2(-e.ny, -e.nx);

      // A jump is one action, decided on the press: its direction, and the rim spot within a short
      // climb it goes from (the one that gets closest to the aim). The player climbs there, then
      // jumps; holding the button keeps the jump going full height (see the air section).
      if (queued) {
        if (!playing) p.jumpQueue = null;
        else if (p.s === queued.s) this.jump(queued);
      } else {
        const plan = this.planJump(aim ?? dir);
        if (playing && !stunned) this.jumpPlan = plan;
        if (jumpPressed) {
          const climb = p.climb;
          if (plan.s === p.s) this.jump({ ...plan, climb });
          else p.jumpQueue = { s: plan.s, angle: plan.angle, climb };
        }
      }
    } else if (p.mode === "air") {
      // Releasing jump while still rising cuts the jump short.
      if (p.jumpHeld && !input.held.has("jump")) {
        if (p.vz > 0) p.vz *= prm.move.jump.cut;
        p.jumpHeld = false;
      }
      if (p.jumpHeld && p.vz <= 0) p.jumpHeld = false;

      // Double jump: a fresh rise toward the aim, snapping to an island ahead. The jump speed adds
      // to whatever of the current velocity already points that way (never less), up to the max
      // speed, so jumping along the flight speeds it up.
      if (jumpPressed && p.airJumps > 0) {
        p.airJumps = 0;
        // Whatever the vertical speed was, the jump starts over: it rises `airJump.height` from here,
        // or more when low, so it always peaks at least `airJump.minPeak` above the rims.
        const aj = prm.move.airJump;
        p.vz = riseSpeed(w, Math.max(aj.height, ISLAND_TOP + aj.minPeak - p.alt));
        p.jumpHeld = true;
        const push = aj.speed;
        const to = this.doubleJumpDir(push, aim, dir);
        if (to) {
          const sp = Math.min(prm.move.limits.maxSpeed, Math.max(0, p.vx * to.x + p.vy * to.y) + push);
          p.vx = to.x * sp;
          p.vy = to.y * sp;
        }
        w.events.emit("doubleJump", { source: p.id, x: p.x, y: p.y, alt: p.alt });
      }

      const lunge = w.attacks.lunge;
      if (lunge) this.steerLunge(lunge.target, lunge.speed);
      else if (!w.attacks.aim) this.steerAir(dir, dt);
      const f = flightOf(p);
      const hit = stepFlight(w, f, dt, p.launchIsland);
      Object.assign(p, { x: f.x, y: f.y, alt: f.alt, vz: f.vz, airTime: f.t });
      if (Math.hypot(p.vx, p.vy) > 1) p.facing = Math.atan2(p.vy, p.vx);

      if (hit) {
        const speed = Math.hypot(p.vx, p.vy, p.vz);
        this.grab(hit.island, hit.s, p.vx, p.vy);
        const e = w.islands[hit.island]!.pointAt(hit.s);
        w.events.emit("land", { source: p.id, x: e.x, y: e.y, alt: ISLAND_TOP, speed });
      } else if (netBounce(w, p, p.netUsed)) {
        p.netUsed = true;
        p.jumpHeld = false;
        w.events.emit("netBounce", { source: p.id, x: p.x, y: p.y, alt: p.alt });
      } else if (p.alt < LOST_ALT) {
        p.mode = "lost";
        p.lostTimer = 0;
        w.events.emit("lost", { source: p.id, x: p.x, y: p.y, alt: p.alt });
      }
    } else {
      // Sinking into the haze, then reappear on the last rim we held.
      p.lostTimer += dt;
      p.vx *= Math.exp(-2 * dt);
      p.vy *= Math.exp(-2 * dt);
      p.vz = Math.max(p.vz - gravity(w) * 0.3 * dt, -260);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.alt = Math.max(5, p.alt + p.vz * dt);
      if (p.lostTimer > 1.6) {
        if (w.playing && !w.spec.noFallDamage) {
          this.health.hp = Math.max(0, this.health.hp - prm.player.health.fallDamage);
          if (this.health.hp <= 0) w.end("defeat");
        }
        this.grab(p.safeIsland, p.safeS);
        p.invuln = prm.player.health.invulnTime;
        const e = this.rim();
        p.x = e.x + e.nx * 7;
        p.y = e.y + e.ny * 7;
        p.alt = HANG_ALT + 60;
        w.events.emit("respawn", { source: p.id, x: p.x, y: p.y, alt: p.alt });
      }
    }
  }

  /**
   * Turn the flight toward `dir` after a sword hit, if the stick is tilted far enough and away
   * from the flight by enough: the player holds still while a backflip starts, then flies off.
   */
  private startTurn(dir: Vec) {
    const p = this.player;
    const tn = this.w.params.move.turn;
    const l = Math.hypot(dir.x, dir.y);
    if (p.mode !== "air" || !this.w.playing || p.stun > 0 || l < tn.minTilt) return;
    const angle = Math.atan2(dir.y, dir.x);
    const speed = Math.hypot(p.vx, p.vy);
    if (speed > 1 && Math.abs(wrapAngle(angle - Math.atan2(p.vy, p.vx))) < (tn.minAngle * Math.PI) / 180) return;
    p.turnWindow = 0;
    p.turn = { t: tn.delay, angle, speed, vz: p.vz };
    p.vx = p.vy = p.vz = 0;
    p.facing = angle;
    p.jumpHeld = false;
    this.w.events.emit("turn", { source: p.id, x: p.x, y: p.y, alt: p.alt, angle });
  }

  /** Counts down what runs on world time after the attacks (invulnerability). */
  afterAttacks(dt: number) {
    this.player.invuln = Math.max(0, this.player.invuln - dt);
  }

  /**
   * Jump direction from a rim: toward the input, or without input the way the player is sliding,
   * within the most a jump leans from straight out (`jump.maxLean`). Straight out when neither. In mouse mode `dir` points at the cursor.
   * With the jump assist, a jump that would just miss is nudged onto an island.
   */
  private planJump(dir: Vec): JumpPlan {
    const p = this.player;
    const isl = this.w.islands[p.island]!;
    let e = this.rim();
    const here = Math.atan2(e.ny, e.nx);
    if (!dir.x && !dir.y) {
      if (!p.slide) return { angle: this.assist(here, here, p.s), out: here, s: p.s, clamped: false, steered: false };
      const side = Math.sign(p.slide);
      dir = { x: e.tx * side, y: e.ty * side };
    }
    const want = Math.atan2(dir.y, dir.x);
    const s = p.slide ? p.s : this.jumpSpot(want);
    if (s !== p.s) e = isl.pointAt(s);
    const out = Math.atan2(e.ny, e.nx);
    const diff = wrapAngle(want - out);
    const max = maxLean(this.w);
    const lean = Math.max(-max, Math.min(max, diff));
    return { angle: this.assist(out + lean, out, s), out, s, clamped: lean !== diff, steered: true };
  }

  /**
   * Where on the rim to jump toward `want` from: here if a jump can lean that far, else the spot
   * within a short climb (`move.assist.climbToJump` at climb speed, either way along the rim) from
   * which a jump gets closest to it; the nearest such spot on a tie.
   */
  private jumpSpot(want: number): number {
    const p = this.player;
    const isl = this.w.islands[p.island]!;
    const max = maxLean(this.w);
    const short = (s: number) => {
      const e = isl.pointAt(s);
      return Math.max(0, Math.abs(wrapAngle(want - Math.atan2(e.ny, e.nx))) - max);
    };
    let best = p.s;
    let bestShort = short(p.s);
    const reach = this.w.params.move.climb.speed * this.w.params.move.assist.climbToJump;
    for (let d = SPOT_STEP; d <= reach && bestShort > 0; d += SPOT_STEP) {
      for (const s of [p.s + d, p.s - d]) {
        const sh = short(s);
        // Only a clear improvement is worth the climb.
        if (sh < bestShort - 0.05) {
          best = s;
          bestShort = sh;
        }
      }
    }
    return best;
  }

  /**
   * The jump assist: if a full jump at `angle` would land nowhere (or back on its own island),
   * the nearest angle within the assist that lands on another island, else `angle`.
   */
  private assist(angle: number, out: number, s: number): number {
    const w = this.w;
    const p = this.player;
    const help = w.spec.assist ?? 1;
    const max = (help * w.params.move.assist.angle * Math.PI) / 180;
    if (max < ASSIST_STEP) return angle;
    const key = `${p.island}|${Math.round(s)}|${angle.toFixed(2)}|${Math.round(p.slide / 25)}|${Math.round(p.climb / 25)}`;
    if (key === this.assistCache.key) return this.assistCache.angle;
    const lands = (a: number) => {
      const r = predict(w, launch(w, p.island, s, a, p.slide, p.climb), p.island, false);
      return r.island !== null && r.island !== p.island;
    };
    let best = angle;
    if (!lands(angle)) {
      search: for (let d = ASSIST_STEP; d <= max + 1e-6; d += ASSIST_STEP) {
        for (const a of [angle + d, angle - d]) {
          if (Math.abs(wrapAngle(a - out)) > maxLean(w)) continue;
          if (lands(a)) {
            best = a;
            break search;
          }
        }
      }
    }
    this.assistCache = { key, angle: best };
    return best;
  }

  /**
   * The island to snap a double jump to: the one with the nearest rim point inside the snap cone
   * around `heading` that a double jump of `push` speed can reach (heading there at the push speed
   * before falling back to rim height). Failing that, the nearest one inside the cone; never one
   * outside it.
   */
  private islandAhead(push: number, heading: number): Island | null {
    const w = this.w;
    const p = this.player;
    const half = (w.params.move.airJump.snapCone * Math.PI) / 360;

    // Time until the flight falls back to rim height.
    let alt = p.alt;
    let vz = p.vz;
    let t = 0;
    const step = 1 / 60;
    while (t < 5 && (vz > 0 || alt > ISLAND_TOP)) {
      vz -= gravityAt(w, vz) * step;
      alt += vz * step;
      t += step;
    }

    let reachable: Island | null = null;
    let reachD = Infinity;
    let inCone: Island | null = null;
    let coneD = Infinity;
    for (const i of w.islands) {
      for (let s = 0; s < i.perimeter; s += 6) {
        const e = i.pointAt(s);
        const dx = e.x - p.x;
        const dy = e.y - p.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d >= coneD && d >= reachD) continue;
        if (Math.abs(wrapAngle(Math.atan2(dy, dx) - heading)) > half) continue;
        if (d < coneD) {
          inCone = i;
          coneD = d;
        }
        const speed = Math.min(w.params.move.limits.maxSpeed, Math.max(0, (p.vx * dx + p.vy * dy) / d) + push);
        if (d < reachD && d <= speed * t) {
          reachable = i;
          reachD = d;
        }
      }
    }
    return reachable ?? inCone;
  }

  /**
   * Double-jump direction: the aim by default (the cursor in mouse mode, else the input direction),
   * else along the flight. If the aim already points at an island it stays as it is; otherwise,
   * if an island lies in the snap cone around it, the jump snaps to the rim point on it that needs
   * the least turn (an outer edge). Null without any heading: the jump only rises.
   * Call after the jump's rise is set: `p.vz` decides how long the jump stays up.
   */
  private doubleJumpDir(push: number, aim: Vec | null, dir: Vec): Vec | null {
    const p = this.player;
    const islands = this.w.islands;
    let heading: number;
    if (aim) heading = Math.atan2(aim.y, aim.x);
    else if (dir.x || dir.y) heading = Math.atan2(dir.y, dir.x);
    else if (Math.hypot(p.vx, p.vy) > 1) heading = Math.atan2(p.vy, p.vx);
    else return null;
    const ahead = { x: Math.cos(heading), y: Math.sin(heading) };
    const far = this.w.planet.bounds.r * 2;
    // An island under the player doesn't count: the aim crosses its rim on the way out.
    const hits = (i: Island) =>
      !i.contains(p.x, p.y) && i.segmentHit(p.x, p.y, p.x + ahead.x * far, p.y + ahead.y * far) !== null;
    if (islands.some(hits)) return ahead;
    const isl = this.islandAhead(push, heading);
    if (!isl) return ahead;

    let tx = 0;
    let ty = 0;
    let best = Infinity;
    for (let s = 0; s < isl.perimeter; s += 6) {
      const e = isl.pointAt(s);
      const score = Math.abs(wrapAngle(Math.atan2(e.y - p.y, e.x - p.x) - heading));
      if (score < best) {
        best = score;
        tx = e.x;
        ty = e.y;
      }
    }

    const d = Math.hypot(tx - p.x, ty - p.y) || 1;
    return { x: (tx - p.x) / d, y: (ty - p.y) / d };
  }

  /**
   * Air control: arrows turn the flight toward the input, and speed it up along it or brake
   * against it. Pulling straight back only brakes. A partly pushed stick turns, speeds up and
   * brakes proportionally less.
   */
  private steerAir(dir: Vec, dt: number) {
    const p = this.player;
    const l = Math.hypot(dir.x, dir.y);
    if (!l) return;
    const air = this.w.params.move.air;
    let sp = Math.hypot(p.vx, p.vy);
    let a = sp > 1 ? Math.atan2(p.vy, p.vx) : Math.atan2(dir.y, dir.x);
    const fwd = (dir.x * Math.cos(a) + dir.y * Math.sin(a)) / l;
    if (sp > 1 && fwd > -0.7) {
      const diff = wrapAngle(Math.atan2(dir.y, dir.x) - a);
      const turn = air.turnRate * l * dt;
      a += Math.max(-turn, Math.min(turn, diff));
    }
    const next = sp + fwd * l * air.accel * dt;
    // Speeding up stops at the max air speed.
    sp = Math.max(0, Math.min(next, this.w.params.move.limits.maxSpeed));
    p.vx = Math.cos(a) * sp;
    p.vy = Math.sin(a) * sp;
  }

  /** A lunge: straight at its target, closing in on its altitude too. */
  private steerLunge(target: { x: number; y: number; alt: number }, speed: number) {
    const p = this.player;
    const dx = target.x - p.x;
    const dy = target.y - p.y;
    const l = Math.hypot(dx, dy) || 1;
    p.vx = (dx / l) * speed;
    p.vy = (dy / l) * speed;
    p.vz = Math.max(-speed / 2, Math.min(speed / 2, (target.alt - p.alt) * 10));
  }
}

/**
 * Climb input along the rim, -1..1: toward the rim point whose outward normal faces the input
 * direction, at full speed until it nearly does. Pointing into the island still climbs. A partly
 * pushed stick climbs slower.
 */
function climbInput(e: { nx: number; ny: number; tx: number; ty: number }, dir: Vec): number {
  const l = Math.hypot(dir.x, dir.y);
  if (!l) return 0;
  const off = Math.acos(Math.max(-1, Math.min(1, (dir.x * e.nx + dir.y * e.ny) / l)));
  const side = dir.x * e.tx + dir.y * e.ty;
  return (side >= 0 ? 1 : -1) * Math.min(1, off / 0.35) * l;
}
