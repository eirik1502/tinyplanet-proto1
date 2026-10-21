// Default game parameters, grouped as tab → group → value (the tuning panel mirrors this layout).
// The panel's "Copy" button produces a drop-in replacement for this whole object.
export const DEFAULTS = {
  world: {
    levels: {
      modifiersFrom: 9, // Modifiers may appear from level
      twoModifiersFrom: 14, // Up to two modifiers from level
    },
    level4: {
      radius: 700, // Boundary radius
      islands: 7, // Islands
      budget: 20.5, // Swarm budget
    },
    perLevel: {
      radius: 60, // Boundary radius
      islands: 1.6, // Islands
      budget: 9.4, // Swarm budget
    },
    modifiers: {
      wind: 90, // Wind strength
      lowGravity: 0.7, // Low gravity (×)
      heavyGravity: 1.15, // Heavy gravity (×)
      fog: 380, // Fog view radius
      shield: 0.6, // Shield: share of the swarm to kill
      reinforceEvery: 18, // Reinforcements every (s)
      reinforceSize: 4, // Reinforcement flock size
      reinforceCap: 1.2, // Swarm cap (× starting swarm)
      eliteHp: 2, // Elite health (×)
      eliteSize: 1.35, // Elite size (×)
    },
  },
  move: {
    climb: {
      speed: 360, // Climb speed
    },
    jump: {
      speed: 260, // Jump speed (sideways)
      height: 70, // Full jump height (Space held)
      slideFactor: 1, // Slide speed added to the jump speed (×)
      cut: 0.35, // Upward speed kept on early release
      gravity: 900, // Gravity
      apexGravity: 0.45, // Gravity near the apex (×)
      apexBand: 150, // Apex band (vertical speed)
    },
    air: {
      turnRate: 2.5, // Air turn rate (rad/s)
      accel: 0, // Speed up / brake (per s)
      grabRadius: 30, // Grab radius
    },
    limits: {
      maxSpeed: 800, // Max air speed (sideways)
      maxHeight: 140, // Max height above the rims
    },
    airJump: {
      speed: 220, // Double jump speed (sideways)
      height: 60, // Double jump height
      minPeak: 90, // Lowest peak above the rims
      snapCone: 30, // Snap cone ahead (degrees)
      bounce: 520, // Sword-hit bounce (up speed)
      netDepth: 45, // Safety bounce depth below rim
      netBounce: 200, // Safety bounce (up speed)
    },
    slide: {
      minSpeed: 100, // Slide min speed
      keep: 1, // Slide speed kept
      friction: 4.2, // Slide friction
    },
  },
  camera: {
    view: {
      height: 420, // Height
      followSpeed: 2.4, // Follow speed
      lookAhead: 0.6, // Look-ahead (s)
    },
  },
  player: {
    aim: {
      chargeTime: 0.5, // Attack charge time (s)
      turnRate: 14, // Aim turn rate (rad/s)
      minTurnRate: 3.6, // Aim turn at full charge
      assistRange: 350, // Aim assist range
    },
    slowMo: {
      scale: 0.2, // World speed
      fadeIn: 0.08, // Fade in (s)
      fadeOut: 0.15, // Fade out (s)
    },
    hitStop: {
      min: 0.08, // Shortest freeze (s)
      max: 0.32, // Longest freeze (s)
      minDamage: 1, // Damage for shortest freeze
      maxDamage: 10, // Damage for longest freeze
    },
    focus: {
      drain: 0.5, // Focus drain while slowed (per s)
      perHit: 0.35, // Focus regained per hit
    },
    health: {
      max: 100, // Max health
      fallDamage: 10, // Fall damage
      invulnTime: 0.35, // Invulnerable after hit (s)
    },
    hurtbox: {
      radius: 10, // Radius
    },
    sword: {
      range: 52, // Reach
      maxRange: 88, // Reach at full power
      arc: 1.35, // Half arc (rad)
      damage: 2, // Damage
      maxDamage: 5, // Damage at full power
      activeTime: 0.18, // Active time (s)
      fadeTime: 0.12,
      cooldown: 0.28, // Cooldown (s)
    },
    spear: {
      speed: 720, // Speed
      maxSpeed: 1050, // Speed at full power
      life: 0.7, // Flight time (s)
      damage: 1, // Damage
      maxDamage: 3, // Damage at full power
      hitRadius: 12, // Hit radius
      maxScale: 1.8, // Size at full power
      length: 46,
      cooldown: 0.45, // Cooldown (s)
    },
  },
  combat: {
    hits: {
      height: 60, // Hits reach up / down
    },
    islands: {
      margin: 26, // Rim clearance
      avoid: 30, // Avoid strength
    },
  },
  audio: {
    volume: {
      master: 0.7, // Master
      music: 0.45, // Music
      sfx: 0.8, // Sound effects
      hearing: 900, // Enemies heard within
    },
  },
};

