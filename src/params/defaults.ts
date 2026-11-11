// Default game parameters, grouped as tab → group → value (the tuning panel mirrors this layout).
// The panel's "Copy" button produces a drop-in replacement for this whole object.
export const DEFAULTS = {
  world: {
    levels: {
      modifiersFrom: 9, // Modifiers may appear from level
      twoModifiersFrom: 14, // Up to two modifiers from level
    },
    level4: {
      budget: 20.5, // Swarm budget
    },
    perLevel: {
      budget: 5, // Swarm budget
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
    },
  },
  move: {
    climb: {
      speed: 360, // Climb speed
    },
    jump: {
      speed: 260, // Jump speed (sideways)
      height: 70, // Full jump height (Space held)
      slideFactor: 0.4, // Slide speed along the jump added to the jump speed (×)
      climbFactor: 0.5, // Climb speed along the jump added to the jump speed (×)
      maxLean: 85, // Most a jump leans from straight out of the rim (degrees)
      regrab: 0.35, // Can't grab the island jumped from for (s)
      cut: 0.35, // Upward speed kept on early release
      gravity: 900, // Gravity
      apexGravity: 0.45, // Gravity near the apex (×)
      apexBand: 150, // Apex band (vertical speed)
    },
    air: {
      turnRate: 2.5, // Air turn rate (rad/s)
      accel: 0, // Speed up / brake (per s)
      grabRadius: 30, // Grab radius
      fallGrab: 45, // Grab radius when falling
      overHeight: 80, // Flies over islands this high above the rims…
      overSpeed: 550, // …at this speed or more (sideways)
      cruise: 420, // Speed above this fades back down… (sideways)
      drag: 2, // …this fast (per s)
      hitKeep: 0.5, // Speed kept after a sword hit (×, sideways)
      hitMinSpeed: 140, // …but a hit slows it to no less than this
    },
    assist: {
      angle: 14, // Most a jump is nudged toward an island (degrees)
      climbToJump: 0.2, // Longest climb to a better spot before a jump (s)
    },
    limits: {
      maxSpeed: 800, // Max air speed (sideways)
      maxHeight: 140, // Max height above the rims
    },
    airJump: {
      speed: 220, // Double jump speed (sideways)
      minSpeed: 340, // Least speed after a double jump (sideways)
      height: 60, // Double jump height
      minPeak: 90, // Lowest peak above the rims
      snapCone: 30, // Snap cone ahead (degrees)
      bounce: 520, // Sword-hit bounce (up speed)
      netDepth: 45, // Safety bounce depth below rim
      netBounce: 200, // Safety bounce (up speed)
    },
    turn: {
      window: 0.15, // A tilt this soon after a hit's freeze turns the flight (s)
      minTilt: 0.6, // Least stick tilt that turns
      minAngle: 45, // Least turn from the flight that counts (degrees)
      delay: 0.19, // Turn delay, while the backflip starts (s)
      speed: 240, // Speed after a turn (sideways)…
      keep: 0.2, // …plus this much of the speed before the hit (×)
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
    armor: {
      time: 0.1, // Armor after an attack goes off (s)
    },
    stun: {
      min: 0.1, // Stun after a hit (s)
      perSpeed: 0.001, // Stun per knockback speed (s)
      max: 1.5, // Longest stun (s)
    },
    sword: {
      range: 46, // Reach
      maxRange: 78, // Reach at full power
      arc: 1.35, // Half arc (rad)
      damage: 2, // Damage
      maxDamage: 5, // Damage at full power
      activeTime: 0.18, // Active time (s)
      fadeTime: 0.12,
      cooldown: 0.60, // Cooldown after the smash or a miss (s)
      stepCooldown: 0.45, // Cooldown after a swipe or poke that hits (s)
      knockback: 1, // Knockback (×)
      comboWindow: 1.2, // Combo window after a hit (s)
    },
    poke: {
      length: 76, // Reach
      maxLength: 114, // Reach at full power
      width: 36, // Width
      damage: 3, // Damage
      maxDamage: 6, // Damage at full power
      stun: 0, // Stuns the enemies it hits (s)
    },
    lunge: {
      length: 120, // Reach
      maxLength: 170, // Reach at full power
      width: 32, // Width
      damage: 3, // Damage
      maxDamage: 6, // Damage at full power
      lungeSpeed: 750, // Lunge speed
      lungeTime: 0.3, // Longest lunge (s)
      strikeDistance: 34, // Strikes this close to the target
      strikeLength: 60, // Reach of the strike after a lunge
      cooldown: 0.48, // Cooldown (s)
    },
    smash: {
      size: 40, // Size
      maxSize: 54, // Size at full power
      damage: 6, // Damage
      maxDamage: 12, // Damage at full power
      blastRadius: 72, // Blast radius
      blastDamage: 4, // Blast damage (at the centre)
      blastPush: 520, // Blast knockback (at the centre)
    },
    spear: {
      speed: 500, // Speed
      maxSpeed: 725, // Speed at full power
      life: 0.47, // Flight time (s)
      damage: 1, // Damage
      maxDamage: 3, // Damage at full power
      hitRadius: 12, // Hit radius
      maxScale: 1.8, // Size at full power
      size: 1, // Size (×)
      length: 46,
      pierce: 1, // Enemies it hits
      falloff: 0.25, // Damage lost per enemy gone through (×)
      minDamage: 0.25, // Least damage after going through (×)
      flame: 0, // Flame from the tip (size, 0: none)
      cooldown: 0.45, // Cooldown (s)
    },
  },
  skills: {
    swipe: {
      cooldown: 0.75, // Step 2: cooldown (×)
      knockback: 2.2, // Step 3: knockback (×)
      range: 1.3, // Step 4: reach (×)
    },
    poke: {
      range: 1.5, // Step 2: reach (×)
      stun: 0.8, // Step 3: stun (s)
      stunUp: 2, // Step 4: stun (×)
    },
    lunge: {
      throughRange: 1.5, // Step 2: reach (×)
      range: 2, // Step 3: reach (×)
    },
    smash: {
      blastRadius: 1.4, // Step 2: blast radius (×)
      size: 1.35, // Step 3: size (×)
      blastPush: 3, // Step 4: blast knockback (×)
    },
    spear: {
      pierce: 2, // Step 2: enemies it hits
      speed: 1.45, // Step 3: speed (×)
      range: 1.5, // Step 3: range (×)
      size: 1.5, // Step 4: hit size and flame (×)
      maxPierce: 3, // Step 4: enemies it hits
    },
    landing: {
      refSpeed: 480, // Landing speed for the full blast
      maxScale: 1.5, // Most the blast grows past that (×)
      radius: 120, // Blast radius
      damage: 0.2, // Blast damage (at the centre)
      push: 520, // Blast knockback (at the centre)
      rocks: 5, // Step 2: landslide rocks (most)
      rockCone: 110, // Step 2: rock cone (degrees)
      rockAngleJitter: 8, // Step 2: rock angle randomness (± degrees)
      rockEdge: 10, // Step 2: rocks keep off the rim by (degrees)
      rockSpeed: 504, // Step 2: rock speed (most)
      rockJitter: 0.3, // Step 2: rock speed randomness (±×)
      rockLift: 160, // Step 2: rock up speed
      rockGravity: 700, // Step 2: rock gravity
      rockLife: 0.35, // Step 2: rock flight time (s)
      rockRadius: 9, // Step 2: rock hit radius
      rockDamage: 3, // Step 2: rock damage (most)
      stun: 0.8, // Step 3: stun (s)
      pushUp: 1.5, // Step 3: knockback (×)
      rocksUp: 10, // Step 3: landslide rocks (most)
    },
    safetyDoom: {
      radius: 130, // Blast radius
      damage: 0, // Blast damage (at the centre)
      push: 600, // Blast knockback (at the centre)
      pullRadius: 100, // Step 2: black hole pull radius
      pull: 2400, // Step 2: pull strength
      delay: 2, // Step 2: blows up after (s)
      growth: 1.5, // Step 3: pull radius, blast (×)
    },
    jumpForce: {
      radius: 16, // Strike radius around the player
      time: 0.35, // Strike lasts (s), with armor as long
      damage: 1, // Damage
      falloff: 0.25, // Less damage each further hit (of the first's)
      minDamage: 0.25, // Least damage (of the first's)
      push: 600, // Knockback aside
      growth: 1.5, // Step 2: strike radius (×)
      speed: 1.4, // Step 3: double jump speed (×)
    },
  },
  combat: {
    hits: {
      height: 1000, // Hits reach up / down
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


export type Params = typeof DEFAULTS;
