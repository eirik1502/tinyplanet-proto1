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
      melee: 6, // Melee boids
      ranged: 0, // Ranged boids
      bombers: 1, // Bomber boids
    },
    perLevel: {
      radius: 80, // Boundary radius
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
      length: 400, // Full jump length (Space held)
      cut: 0.35, // Upward speed kept on early release
      gravity: 1200, // Gravity
      apexGravity: 0.5, // Gravity near the apex (×)
      apexBand: 140, // Apex band (vertical speed)
    },
    air: {
      turnRate: 2.5, // Air turn rate (rad/s)
      accel: 420, // Speed up / brake (per s)
      maxSpeed: 1.4, // Max speed (× launch speed)
      grabRadius: 18, // Grab radius
    },
    airJump: {
      strength: 0.85, // Double jump height (× launch)
      speed: 0.5, // Double jump speed (× launch)
      cone: 60, // Target cone ahead (degrees)
      bounce: 520, // Sword-hit bounce (up speed)
      netDepth: 45, // Safety bounce depth below rim
      netBounce: 480, // Safety bounce (up speed)
    },
    slide: {
      minSpeed: 100, // Slide min speed
      keep: 1, // Slide speed kept
      friction: 4.2, // Slide friction
      jumpCarry: 0.6, // Slide speed carried into a jump
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
      max: 0.3, // Longest freeze (s)
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
      disengageRange: 560, // Disengage range
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
};

