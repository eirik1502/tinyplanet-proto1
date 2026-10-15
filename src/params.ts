// Default game parameters, grouped as tab → group → value (the tuning panel mirrors this layout).
// The panel's "Copy" button produces a drop-in replacement for this whole object.
export const DEFAULTS = {
  world: {
    levels: {
      start: 1, // Start level (on reload)
    },
    level1: {
      radius: 600, // Boundary radius
      islands: 4, // Islands
      melee: 3, // Melee boids
      ranged: 0, // Ranged boids
    },
    perLevel: {
      radius: 80, // Boundary radius
      islands: 1.6, // Islands
      melee: 5, // Melee boids
      ranged: 2.8, // Ranged boids
    },
  },
  move: {
    climb: {
      speed: 300, // Climb speed
    },
    jump: {
      min: 110, // Min jump length
      max: 420, // Max jump length
      chargeTime: 0.5, // Charge time (s)
      gravity: 1200, // Gravity
    },
    jumpAim: {
      time: 1, // Aim time (s)
      turnRate: 7, // Aim turn rate (rad/s)
      minTurnRate: 0.6, // Aim turn after aim time
    },
    air: {
      turnRate: 2, // Air turn rate (rad/s)
      grabRadius: 18, // Grab radius
    },
    slide: {
      minSpeed: 100, // Slide min speed
      keep: 1, // Slide speed kept
      friction: 2.2, // Slide friction
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
      minTurnRate: 0.6, // Aim turn at full charge
    },
    slowMo: {
      scale: 0.2, // World speed
      fadeIn: 0.08, // Fade in (s)
      fadeOut: 0.15, // Fade out (s)
    },
    health: {
      max: 100, // Max health
      fallDamage: 10, // Fall damage
      invulnTime: 0.35, // Invulnerable after hit (s)
      hitRadius: 10, // Hit radius
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
  boids: {
    swarm: {
      meleeSpeed: 190, // Melee speed
      rangedSpeed: 160, // Ranged speed
      aggroRange: 200, // Aggro range
      disengageRange: 560, // Disengage range
    },
    flocking: {
      neighborRadius: 90, // Neighbour radius
      separationRadius: 50, // Separation radius
      separation: 720, // Separation
      alignment: 0.6, // Alignment
      cohesion: 0.25, // Cohesion
      wander: 40, // Wander
      queenAttraction: 15, // Pull toward queen
    },
    islands: {
      margin: 26, // Rim clearance
      avoid: 30, // Avoid strength
    },
    queen: {
      hp: 24, // Health
      speed: 85, // Speed
      fleeRange: 320, // Flee range
      tether: 230, // Stays near home
      guardRadius: 480, // Guard radius
      threatRadius: 520, // Threat radius
    },
  },
  enemyAttacks: {
    hit: {
      damage: 2, // Damage per hit (%)
    },
    melee: {
      lungeRange: 95, // Lunge range
      lungeSpeed: 470, // Lunge speed
      lungeTime: 0.32, // Lunge time (s)
      cooldown: 1.3, // Cooldown (s)
    },
    ranged: {
      keepAway: 230, // Keep-away distance
      range: 420, // Shooting range
      orbSpeed: 280, // Orb speed
      orbLife: 2.2, // Orb life (s)
      cooldown: 1.7, // Cooldown (s)
    },
  },
};

