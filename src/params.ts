// Default game parameters, grouped as tab → group → value (the tuning panel mirrors this layout).
// The panel's "Copy" button produces a drop-in replacement for this whole object.
export const DEFAULTS = {
  world: {
    levels: {
      start: 1, // Start level (on reload)
    },
    intro1: {
      radius: 450, // Boundary radius
      islands: 3, // Islands
      melee: 4, // Melee boids
      ranged: 0, // Ranged boids
      bombers: 0, // Bomber boids
      escort: 4, // Queen's escort
      queenHp: 6, // Queen health
    },
    intro2: {
      radius: 550, // Boundary radius
      islands: 5, // Islands
      melee: 6, // Melee boids
      ranged: 4, // Ranged boids
      bombers: 0, // Bomber boids
      escort: 4, // Queen's escort
      queenHp: 12, // Queen health
    },
    intro3: {
      radius: 650, // Boundary radius
      islands: 6, // Islands
      melee: 8, // Melee boids
      ranged: 4, // Ranged boids
      bombers: 3, // Bomber boids
      escort: 4, // Queen's escort
      queenHp: 18, // Queen health
    },
    level4: {
      radius: 700, // Boundary radius
      islands: 7, // Islands
      melee: 10, // Melee boids
      ranged: 4, // Ranged boids
      bombers: 3, // Bomber boids
    },
    perLevel: {
      radius: 60, // Boundary radius
      islands: 1.6, // Islands
      melee: 4, // Melee boids
      ranged: 2.4, // Ranged boids
      bombers: 1.2, // Bomber boids
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
      min: 0.17, // Shortest freeze (s)
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
      bomberSpeed: 215, // Bomber speed
      aggroRange: 200, // Aggro range
      disengageRange: 350, // Disengage range
      provokedTime: 6, // Hit flock stays engaged (s)
    },
    flocking: {
      neighborRadius: 90, // Neighbour radius
      separationRadius: 50, // Separation radius
      separation: 720, // Separation
      alignment: 0.55, // Alignment
      cohesion: 0.2, // Cohesion
      wander: 40, // Wander
    },
    flocks: {
      startSize: 4, // Starting flock size
      maxSize: 10, // Largest flock from joining
      roamSpeed: 75, // Roam speed
      joinChance: 0.08, // Chance to join another flock (per s)
      joinRange: 700, // Looks for flocks to join within
      leaveChance: 0.05, // Chance some members leave (per s)
    },
    islands: {
      margin: 26, // Rim clearance
      avoid: 30, // Avoid strength
    },
    queen: {
      hp: 24, // Health
      speed: 85, // Speed
      fleeRange: 320, // Flee range
      tether: 1000, // Stays near home
      escort: 4, // Escort flock size (at start)
      threatRadius: 410, // Threat radius
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
    bomber: {
      triggerRange: 22, // Trigger range
      blastRadius: 150, // Blast radius
      damage: 6, // Damage (%)
      playerPush: 560, // Push on the player
      playerLift: 420, // Lift on the player
      boidPush: 520, // Push on other boids
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

