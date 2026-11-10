import { level, SKILLS, type SkillIcon, type SkillId, type SkillLevels } from "../../attacks/skills";
import type { WeaponId } from "../../attacks/types";
import type { BriefingData } from "../../game/session";
import type { BrowserInput, InputMode } from "../../input/browser";
import type { Action, Glyph } from "../../input/types";
import type { Params } from "../../params/store";
import { Avatar, type AvatarView } from "../../render/avatar";

// The briefing shown before each level (and as the pause screen): the goal and the level's
// effects beside the input mode and the movement buttons, and the player's card with the
// unlocked attacks and air abilities as its properties. Each skill is listed on what it upgrades.
// Newly unlocked items are tagged. Texts stay short: only what you can't easily learn by playing.

export interface BriefingInfo extends BriefingData {
  /** Play the appearance animation on new items (on opening, not on re-renders). */
  animate: boolean;
  /** The params the level plays with (for the attacks' stats). */
  params: Params;
}

/** The input source prompts are shown for; set by the app. */
let input: BrowserInput;
export function setBriefingInput(i: BrowserInput) {
  input = i;
}

// ---------------------------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------------------------

export const ICONS = {
  sword: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 3.5H20v5.5L9 20l-5-5z"/><path d="M5 14l5 5M3 21l3-3"/></svg>`,
  spear: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21L15 9"/><path d="M14 4l6-1-1 6-4 1-2-2z" fill="currentColor"/></svg>`,
  poke: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h14"/><path d="M15 8l6 4-6 4z" fill="currentColor"/></svg>`,
  lunge: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h12M12 6l6 6-6 6"/><path d="M20 5v14"/></svg>`,
  orb: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="17" cy="12" r="4" fill="currentColor"/><path d="M3 12h6M5 8h5M5 16h5"/></svg>`,
  blast: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l2.2 5.6L20 6l-2.8 5.2L22 15l-6 .8L15 22l-3-4.6L9 22l-1-6.2-6-.8 4.8-3.8L4 6l5.8 1.6z"/></svg>`,
  landing: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v10M7.5 8.5L12 13l4.5-4.5"/><path d="M3 19h18M6 16l-2.5 3M18 16l2.5 3"/></svg>`,
  crown: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3 18h18l-1.5-10-4.5 4-3-6-3 6-4.5-4z" fill="currentColor" fill-opacity=".25"/></svg>`,
  jump: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 12l6-6 6 6M6 19l6-6 6 6"/></svg>`,
  focus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9s8 4 8 9"/></svg>`,
  net: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v9M8 8l4 4 4-4"/><path d="M3 15c3 4 15 4 18 0"/></svg>`,
  heart: `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 21s-8-5.2-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.8-8 11-8 11z"/></svg>`,
  keyboard: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/></svg>`,
  gamepad: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 7h10a5 5 0 0 1 4.9 6l-.7 3.4a2.4 2.4 0 0 1-4.2 1L15 15H9l-2 2.4a2.4 2.4 0 0 1-4.2-1L2.1 13A5 5 0 0 1 7 7z"/><path d="M7 10v3M5.5 11.5h3M16 11h.01M18 12.5h.01"/></svg>`,
  mouse: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="6" y="2.5" width="12" height="19" rx="6"/><path d="M12 2.5V10M6 10h12"/></svg>`,
};

/** A mouse with its left, middle (the wheel) or right button lit. */
function mouseButton(side: "left" | "middle" | "right") {
  const fill = side === "left" ? "M12 3H12A6 6 0 0 0 6.2 9.5H12z" : side === "right" ? "M12 3A6 6 0 0 1 17.8 9.5H12z" : "M10.5 4h3v5h-3z";
  return `<span class="mouse" title="${side} click"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="${fill}" fill="currentColor" stroke="none"/><rect x="6" y="2.5" width="12" height="19" rx="6"/><path d="M12 2.5V10M6 10h12"/></svg></span>`;
}

const kbd = (k: string, wide = false) => `<kbd${wide ? ' class="wide"' : ""}>${k}</kbd>`;
const arrows = `<span class="cluster"><span></span>${kbd("↑")}<span></span>${kbd("←")}${kbd("↓")}${kbd("→")}</span>`;
const or = `<span class="or">/</span>`;

function glyphHtml(g: Glyph) {
  switch (g.kind) {
    case "key":
      return kbd(g.label, g.wide);
    case "pad":
      return `<kbd class="pad${g.label.length === 1 ? " round" : ""}">${g.label}</kbd>`;
    case "mouse":
      return mouseButton(g.side);
    case "arrows":
      return arrows;
    case "stick":
      return `<kbd class="pad round">L</kbd>`;
    case "note":
      return `<span class="or">${g.text}</span>`;
  }
}
/** The buttons for an action on the device in use, separated by `sep`. */
export const buttons = (a: Action, sep = or) => input.prompt(a).map(glyphHtml).join(sep);
/**
 * Class, style and corner badge for an entity that may be newly unlocked. Each new entity on the
 * sheet appears a little after the previous one.
 */
let freshCount = 0;
function freshMark(on: boolean) {
  if (!on) return { cls: "", style: "", badge: "" };
  return { cls: " fresh", style: `--d:${freshCount++ * 0.35}s;`, badge: '<span class="badge-new">NEW</span>' };
}
/** A skill's icon. */
export const skillIcon = (i: SkillIcon) => ICONS[i === "smash" ? "blast" : i];
/** Steps owned out of a skill's last, as pips: ●●○○. */
export const pips = (lv: number, max: number) => "●".repeat(lv) + "○".repeat(Math.max(0, max - lv));
const fmt = (v: number) => String(Number(v.toFixed(2)));
const chip = (text: string, cls = "") => `<span class="chip ${cls}">${text}</span>`;

// ---------------------------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------------------------

/** A skill's steps so far on the item it upgrades; `name` when it isn't the item's own skill. */
interface Upgrade {
  name?: string;
  pips: string;
  text: string;
  fresh: boolean;
}

interface Ability {
  icon: string;
  name: string;
  text: string;
  stats: string[];
  input?: string;
  upgrades?: Upgrade[];
  fresh?: boolean;
}

/** Skill `id`'s steps past `from` (what unlocks the item), if any; the pips count only those. */
function upgrade(skills: SkillLevels, fresh: string[], id: SkillId, from: number, name?: string): Upgrade[] {
  const sk = SKILLS[id];
  const lv = level(skills, id);
  if (lv <= from) return [];
  return [{ name, pips: pips(lv - from, sk.steps.length - from), text: sk.steps.slice(from, lv).join(" "), fresh: fresh.includes(id) }];
}

function ability(a: Ability) {
  const f = freshMark(!!a.fresh || !!a.upgrades?.some((u) => u.fresh));
  const ups = a.upgrades?.length
    ? `<ul class="upgrades">${a.upgrades
        .map((u) => `<li class="${u.fresh ? "new" : ""}"><span class="pips">${u.pips}</span>${u.name ? `<b>${u.name}</b> ` : ""}${u.text}</li>`)
        .join("")}</ul>`
    : "";
  return `
    <div class="ability${f.cls}" style="${f.style}">
      ${f.badge}
      <div class="ability-icon">${a.icon}</div>
      <div class="ability-body">
        <div class="ability-head"><b>${a.name}</b>${a.stats.map((s) => chip(s)).join("")}${a.input ? `<span class="ability-input">${a.input}</span>` : ""}</div>
        <div class="ability-text">${a.text}</div>
        ${ups}
      </div>
    </div>`;
}

function playerCard(b: BriefingInfo) {
  const params = b.params;
  const { skills, fresh } = b;
  const pl = params.player;
  const dmg = (g: { damage: number; maxDamage: number }) => `${fmt(g.damage)}–${fmt(g.maxDamage)} dmg`;
  const unlocked = (id: SkillId) => fresh.includes(id) && level(skills, id) === 1;
  const attacks: Ability[] = [];
  if (b.weapons.includes("sword")) {
    attacks.push({
      icon: ICONS.sword,
      name: "Sword",
      text: "Hold to power up. Bounce on aerial hits.",
      stats: [dmg(pl.sword), `${fmt(pl.sword.cooldown)}s recharge`],
      input: buttons("sword"),
      upgrades: upgrade(skills, fresh, "swipe", 1),
    });
    // The chained strikes: attacks of their own.
    for (const id of ["poke", "smash"] as const) {
      if (!level(skills, id)) continue;
      const sk = SKILLS[id];
      attacks.push({
        icon: skillIcon(sk.icon),
        name: sk.name,
        text: sk.steps[0]!,
        stats: [dmg(pl[id])],
        upgrades: upgrade(skills, fresh, id, 1),
        fresh: unlocked(id),
      });
    }
  }
  if (b.weapons.includes("lunge"))
    attacks.push({
      icon: ICONS.lunge,
      name: "Lunge",
      text: SKILLS.lunge.steps[0]!,
      stats: [dmg(pl.lunge), `${fmt(pl.lunge.cooldown)}s recharge`],
      input: buttons("lunge"),
      upgrades: upgrade(skills, fresh, "lunge", 1),
      fresh: unlocked("lunge"),
    });
  if (b.weapons.includes("spear"))
    attacks.push({
      icon: ICONS.spear,
      name: "Spear",
      text: "Hold to power up. Thrown.",
      stats: [dmg(pl.spear), `${fmt(pl.spear.cooldown)}s recharge`],
      input: buttons("spear"),
      upgrades: upgrade(skills, fresh, "spear", 1),
      fresh: unlocked("spear"),
    });
  const passives: Ability[] = [
    {
      icon: ICONS.jump,
      name: "Double jump",
      text: "Refills on aerial hits.",
      stats: ["1 per flight"],
      input: `${buttons("jump")}<span class="or">in air</span>`,
      upgrades: upgrade(skills, fresh, "jumpForce", 0, SKILLS.jumpForce.name),
    },
    {
      icon: ICONS.net,
      name: "Safety bounce",
      text: "Springs you back up from your first dip below the rim.",
      stats: ["1 per flight"],
      upgrades: upgrade(skills, fresh, "safetyDoom", 0, SKILLS.safetyDoom.name),
    },
    {
      icon: ICONS.focus,
      name: "Focus",
      text: "Slow motion while aiming in the air. Refills on landing.",
      stats: [`${fmt(1 / params.player.focus.drain)}s budget`],
    },
  ];
  // Passive skills with nothing to upgrade: abilities of their own.
  if (level(skills, "landing")) {
    const sk = SKILLS.landing;
    passives.push({ icon: skillIcon(sk.icon), name: sk.name, text: sk.steps[0]!, stats: [], upgrades: upgrade(skills, fresh, "landing", 1), fresh: unlocked("landing") });
  }
  const h = params.player.health;
  return `
    <article class="unit player">
      <header>
        <canvas class="portrait" data-portrait="player"></canvas>
        <div>
          <h3>You</h3>
          <div class="stats">${chip(`${ICONS.heart}${h.max} HP`, "hp")}${chip(b.noFallDamage ? "Falls don't hurt" : `Fall: −${fmt(h.fallDamage)}`)}</div>
        </div>
      </header>
      <div class="columns">
        <section><h4>Attacks</h4><div class="abilities attacks">${attacks.map(ability).join("")}</div></section>
        <section><h4>Abilities</h4><div class="abilities passives">${passives.map(ability).join("")}</div></section>
      </div>
    </article>`;
}

export function briefingHtml(b: BriefingInfo): string {
  freshCount = 0;
  const mode = input.mode;
  const title =
    b.reason === "pause"
      ? `Paused · ${b.heading ?? `Level ${b.level}`}`
      : b.reason === "retry"
        ? `Retry ${b.heading?.toLowerCase() ?? `level ${b.level}`}`
        : (b.heading ?? `Level ${b.level}`);
  const moves = [
    [input.movePrompt().map(glyphHtml).join(""), "Climb · steer in the air"],
    [buttons("jump"), input.pointerAims ? "Jump toward the cursor · hold for height" : "Jump · hold for height"],
  ];
  const modeButton = (m: InputMode, label: string) => `<button data-mode="${m}" class="${mode === m ? "on" : ""}">${label}</button>`;
  return `
    <div class="sheet${b.animate ? " intro" : ""}">
      <header class="top">
        <div class="info">
          <h1>${title}${b.template ? `<span class="template"> – ${b.template.name}</span>` : ""}${b.template?.boss ? `<span class="boss">Boss</span>` : ""}</h1>
          <ul class="modifiers">
            <li class="goal">${ICONS.crown}${b.goal}</li>
            ${b.modifiers.map((m) => `<li><b>${m.name}</b> ${m.blurb}</li>`).join("")}
          </ul>
        </div>
        <section class="controls">
          <div class="modes" role="group" aria-label="Input mode">
            ${modeButton("keyboard", `${ICONS.keyboard}Keyboard`)}
            ${modeButton("mouse", `${ICONS.keyboard}+${ICONS.mouse}Mouse`)}
            ${modeButton("gamepad", `${ICONS.gamepad}Gamepad`)}
          </div>
          <div class="moves">${moves.map(([k, t]) => `<div class="move"><span class="keys">${k}</span><span>${t}</span></div>`).join("")}</div>
        </section>
      </header>
      ${playerCard(b)}
      <p class="hint">${buttons("mute")} mutes · ${buttons("pause")} pauses</p>
      <button class="start" data-start>${b.reason === "pause" ? "Resume" : "Start"} <span>${buttons("confirm", " ")}</span></button>
    </div>`;
}

// ---------------------------------------------------------------------------------------------
// Portraits: the in-game sprite, drawn into the card's canvas
// ---------------------------------------------------------------------------------------------

/** Paint every `canvas[data-portrait]` under `root`. */
export function paintPortraits(root: HTMLElement, weapons: WeaponId[]) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  for (const c of Array.from(root.querySelectorAll<HTMLCanvasElement>("canvas[data-portrait]"))) {
    const size = c.clientWidth || 64;
    c.width = c.height = Math.round(size * dpr);
    const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (c.dataset.portrait === "player") paintPlayer(ctx, size, weapons);
  }
}

function paintPlayer(ctx: CanvasRenderingContext2D, size: number, weapons: WeaponId[]) {
  const avatar = new Avatar();
  const s = (size / 64) * 1.7;
  const view: AvatarView = {
    mode: "air",
    x: 0,
    y: 0,
    alt: 0,
    facing: -Math.PI / 2,
    vz: 0,
    aim: null,
    spearReady: weapons.includes("spear"),
    frozen: false,
    stunned: false,
  };
  // Let the cloak settle behind the player.
  for (let i = 0; i < 90; i++) avatar.update(1 / 60, view);
  avatar.draw(ctx, view, (x, y) => ({ x: size / 2 + x * s, y: size / 2 + y * s, kt: s, kr: s, angle: 0, visible: true }));
}
