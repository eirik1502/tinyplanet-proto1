# Tasks

## Release game online
E.g. as a page hosted on github
Add in cd pipeline

## Tweaks and bugs
- Make islands shake on land
- Animate trees on islands
- Increase lowest speed boost on double jump
- Input bug with controller: Direction many times defaults to down (at least while climbing)

## Skill building
Add "skills", enhancement to different aspects of the player.
Skills should be obtained throughout a run.
They should be chosen along the way, so the player can decide their build direction.

The skills should affect the different aspects.
Every skill can be upgraded three times.
Initial suggestion:
- Melee 1: 
  - Step 1: Decrease cooldown
  - Step 2: Increase knockback
  - Step 3: Increase range
- Melee 2: 
  - Step 1: Go through to the furthest enemy, striking all on the way 
  - Step 2: Instantly jump to the furthest enemy, still striking all on the way.
  - Step 3: Double range
- Melee 3:
  - Step 1: Increase explosion radius 
  - Step 2: Increase hitbox size
  - Step 3: Increase explosion knockback, tripled
- Spear
  - Step 1: Increase range (let the current range be the upgrade, reduce initial range)
  - Step 2: Increase speed (let the current speed be the upgrade, reduce initial speed)
  - Step 3: Increase size: doubled
- Landing hard: Affecting landing
  - Step 1: Explosive effect when you land
  - Step 2: Increase explosion
  - Step 3: Increase explosion 
- Safety doom: Affecting safety bounce
  - Step 1: Add an explosion when safety jumping.
  - Step 2: Turn the explosion into a black hole that pulls in enemies around. After a short delay, explodes.
  - Step 3: Increase the pull range of the black hole, and explosion effect
- Jump force: Affecting air jumps
  - Step 1: On air jump, strike enemies in front. They will be knocked to the side
  - Step 2: Increase air jump speed
  - Step 3: Increase hitbox size and knockback

Choosing skills:
- After every level, three skills are presented, the player picks one
- The presented skill will always be the next upgrade of that skill


Apply skills to the following:
- 

Power up / skills:
- Safety bounce: 
  - Explode on bounce
  - Make black hole on landing, sucking enemies in
  - Extra safety bounce
- Landing/grabbing:
  - Explode on landing
  - Push away on landing (wind)
- Double jump: 
  - Float while holding jump for up to 3s
  - Explode on double jump
- Spear
  - Beam upgrade: shoot a beam (instant / multihit)
  - Grappling hook upgrade: Hook that connects with island or enemy. Laser rope, kills enemies touched
  - Explosion upgrade: Explode (push back) surrounding enemies on impact
- Sword
  - Range upgrade
  - Strength upgrade
  - Lance upgrade: Longer ranged, thinner


## ✅Story segway
- one continous world combined with the queen flees to the next world when "dead". The transition can be a portal going up into the air.
  It spawns on the queens position as she opens and takes the portal. We follow.


## ✅ Shoot over islands, increase punishment, add attack armor
- Aim projectile over islands while climbing. Don’t limit it to an angle on the edge
- Improve direction change when hitting an enemy and holding the stick.
  - Show an animation when changing direction. E.g. some sort of backflip.
  - There should be a short delay (while starting the animation), so the direction change is a clear action
  - Trigger the direction change only when the stick is tilted (or smashed) when hitting or right after. Also to make the action more clear
- Being hit should have a greater impact.
  - The character should be stunned when hit (can’t perform actions). Aerial influence by input direction should still be applied.
  - The stun time can be proportional to the knock back taken. I.e. the queens attack will force you to fly longer without interfering the knock back.
  - When high up in the air and in high speed (e.g. when taking hard knock back), you should fly over islands.
- During attacks, the player should have armor, not taking enemy hits

- When climbing, start aiming in the aim direction (like when flying)

## ✅Tweaks and bugs
- [x] island. Set aim toward: The closest island. Use a reachable point on that island that requires the least turning.reachable point
- [x] Freeze frames: If Melee hit, apply freeze frames to both targets, change air movement towards direction held afterwards. Ranged attacks only applies freeze frames to the target (no direction change). Enemy attacks also applies freeze frames. The freeze length should be based on the power of the attack.
- [x] Enemies: Should go in smaller flocks composed of a set of bodies. The bodies algorithm only applies within a flock.
- [x] Flocks can choose to join other flocks, merging them.
- [x] Within a flock, a random number of members can chose to leave the flock, forming a new flock.
- [x] A queen should be in a flock with other boids.
- [x] Remove drag towards queen
- [x] Add an explosive enemy boid. It explods on contact, pushing other bodies and the player away. If the player is on an island, it will be pushed away

## ✅Character controller tweaks
- Cap air speed
- Cap air height
- Measure jump in speed + max height
- Jumps should in general be slower, shorter and more floaty
- When jumping from edge, don't let the slide affect direction, only jump speed. Defined by a jumpSpeed and a jumpSpeedSlideFactor (how much the slide speed affects)
- Air jump snapping: Only snap to edges in a cone in front of aim (not anywhere around). defined by airJumpSnapCone (degrees).
  - The snapping should work the same way, snapping to an outer edge within the cone
  - Set cone to 30 deg
- Air jump speed should be calculated differently.
  - Air jump should be defined by a jumpSpeed. The current speed will be added (direction adjusted), but never influence negatively. Max is defined by the global maxSpeed

## ✅Improve height hit/miss
- Set standard height
- Show what enemies are in height range

## ✅ Level progression
- Levels should be more varied
- E.g. make some templates that scales with level
- Island generation variation, like: density, clusters, density map (more dense towards edges, etc), and others


## ✅ Improve combat mechanics
- Make micro mechanics in combat vs a flock more interesting and skill-based
- Make opponents more understandable
  - Melee boids: Add a delay between starting and executing an attack (before charging). Visually indicate attack started
  - Bomb boids: A little shorter explosion range (too hard to detonate without being hit). Dont need startup delay
  - Ranged boids: Also add startup delay and indicator. Make the attack mor punchy, show a little attack animation, before keeping moving.

## ✅Make base melee attack more interesting
- Add 1-2-3 to the melee attack, mixing swipe (like today), strike (thinner and longer), and bash (smaller and more powerful)
  - Attack-dash: Second strike lunges the player to an enemy in range

## ✅Queen protect
- The queen should always be guarded
- If the queen swarm loses members, new boids should be recruited from close flocks
- If any member in the queen flock is attacked, the second closest flock will also aggro the player
- Add attack to the queen
  - When the player is close, trigger the attack
  - The queen gets angry (animated), and after a delay, frees a short-ranged blast around
  - The blast should have knockback power

## ✅Level progresssion:
- Introduce attacks and enemies over the first few levels
- Show an instruction screen before each level
  - Pick input mode
  - Show movement inputs
  - Show attack inputs (according to the unlocked attacks)
  - Show enemy overview (according to unlocked enemies)
- Level 1: Start with melee attack. One queen flock with 4 melee boids. Queen has little health
- Level 2: Introduce ranged boids
- Level 3: Introduce ranged attack and bomber boids

## ✅ Initial prompt
 Make a prototype with web technology (typescript + bun) with libs if needed.
* A top-down 2d game that feels 3d.
* Full 2d top-down, seen straight from above
* A character floating over a planet
* Camera placed above the character, sliding towords the character while moving
* The character and camera are directly over a planet
* All objects are 2d sprites, and physics are 2d
* When objects are away from the camera, they "warp" like a perspective projection, along the planet surface
* On the planet surface are islands
* The rest of the surface is just covered by some mystical, transparent, haze
* The character holds the edge og islands, and can jump from an island to other islands
* In the air, the player can affect the jump direction slightly

* Make a prototype with three islands
