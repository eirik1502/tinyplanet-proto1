---
name: game-objects
description: The intent behind game objects and components in this game. Use when adding or changing anything that exists in a world (player, enemies, attacks in flight, pickups), or when deciding where state and behaviour should live.
---

# Game objects: intent

## Why they exist

The state of a world should be visible as **objects**. Anything that exists in a world (the player,
each boid, a spear in flight, a sword strike while it can hit) is a game object. When you want to
know what is going on, you look at the objects, not at variables spread over modules.

Objects are **composed, not specialised**. An object gets capabilities by having components
(it can be hurt, it has health, it hurts things). Code that cares about a capability works on
anything that has it. The player and a boid are both "something that can be hurt", so the combat
rules treat them the same way.

## Principles

- **Components are typed data.** Small methods are fine when they belong to the data. Components
  should not hide a whole subsystem.
- **Logic that spans many objects belongs in systems.** Hit resolution, flocking, and keeping
  things off islands each involve many objects. That logic sits in a system that queries for the
  components it needs, not in a per-object update.
- **Systems run in a fixed, explicit order.** Each world step runs them in a known sequence, so
  the results are deterministic and hit-stop and slow motion behave predictably.
- **Not a full ECS.** A world holds about a hundred objects, so storage tricks aren't needed.
  Prefer plain, readable objects over cleverness.
- **Don't force sameness where there is none.** Hanging on a rim plus flight physics and boid
  steering have little in common. Share what really is shared (position, velocity, hurtbox,
  health, team), and keep the different controllers separate.
- **Groups and relations can be objects of their own.** A flock has members, a goal and a mood,
  so it is a thing in its own right, not a component copied onto every member.
- **Don't over-componentise.** If only one kind of thing has some state, it can stay a field of
  that thing.
- **Objects carry simulation state only.** Looks, animation, smoothing and effects belong to the
  presentation layer, which reads objects but never writes them.
- **Refer across ticks by id.** Holding object references from one tick to the next invites
  bugs with dead objects. Use ids, or check that the object is still alive.

## What it should make easy

- A generic **inspector**: list the objects and their components without knowing their types.
- **Debug drawing** of any capability (for example every hurtbox and every hit volume).
- **Snapshots and headless runs**: the state is plain data, so it can be logged and compared.
- **Upgrades** that add or change capabilities without touching the code of every kind of object.

See also the `game-events` skill: objects are the state, and events are what happens to them.
