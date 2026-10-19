# Tasks

- [x] island. Set aim toward: The closest island. Use a reachable point on that island that requires the least turning.reachable point
- [x] Freeze frames: If Melee hit, apply freeze frames to both targets, change air movement towards direction held afterwards. Ranged attacks only applies freeze frames to the target (no direction change). Enemy attacks also applies freeze frames. The freeze length should be based on the power of the attack.
- [x] Enemies: Should go in smaller flocks composed of a set of bodies. The bodies algorithm only applies within a flock.
- [x] Flocks can choose to join other flocks, merging them.
- [x] Within a flock, a random number of members can chose to leave the flock, forming a new flock.
- [x] A queen should be in a flock with other boids.
- [x] Remove drag towards queen
- [x] Add an explosive enemy boid. It explods on contact, pushing other bodies and the player away. If the player is on an island, it will be pushed away
- [ ] Enemy: If any boid in flock is attacked, aggro
- [ ] Make islands shake on land
- [ ] Animate trees on islands
- [ ] Movement: Jump right out when slide speed is low and no button pressed
- [ ] Tweak: Attack aim more than 6 degrees from edge
- [ ] Improve mouse vs keybaord movement. Hit-move direction, air influence
- [ ] Add joy controller input
- [ ] Release as a github app (on every deploy)


✅ Level progresssion:
- Introduce attacks and enemies over the first few levels
- Show an instruction screen before each level
  - Pick input mode
  - Show movement inputs
  - Show attack inputs (according to the unlocked attacks)
  - Show enemy overview (according to unlocked enemies)
- Level 1: Start with melee attack. One queen flock with 4 melee boids. Queen has little health
- Level 2: Introduce ranged boids
- Level 3: Introduce ranged attack and bomber boids

Queen protect
- The queen should always be guarded
- If the queen swarm loses members, new boids should be recruited from close flocks
- If any member in the queen flock is attacked, the second closest flock will also aggro the player
- Add attack to the queen
  - When the player is close, trigger the attack
  - The queen gets angry (animated), and after a delay, frees a short-ranged blast around
  - The blast should have knockback power


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
- Sword
  - Range upgrade
  - Strength upgrade
  - Lance upgrade: Longer ranged, thinner

✅Character controller tweaks
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

✅Improve height hit/miss
- Set standard height
- Show what enemies are in height range


