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


Level progresssion:
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
- 10% of the boids should guard the queen
- If there are fewer boids, close ones should join the queen flock
- If the queen is attacked, the queen flock will aggro the player
- In general, if a member of a flock is attacked, the flock aggros