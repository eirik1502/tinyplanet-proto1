---
name: game-events
description: The intent behind the game's event bus. Use when something in the game should cause sound, effects, rumble, animation, UI updates or upgrade behaviour, or when deciding whether to call something directly or emit an event.
---

# Game events: intent

## Why they exist

Events are the world's **history**, the counterpart to objects (its state). The simulation
reports what happened ("jumped", "landed at this speed", "this boid was hit and died"). Everything
that reacts to that listens instead of being called from inside gameplay code.

This decouples the simulation from its consumers:
- Audio, rumble, visual effects, camera shake and the avatar's animation are **listeners**.
- A new input device's outputs (rumble, lights) are new listeners. Nothing in the game changes.
- A headless run simply has no presentation listeners.
- Upgrades (perks) hook into events like "landed" or "safety bounce" without editing the
  controller.

## Principles

- **Commands go down as direct calls; facts go out as events.** "Spawn this hit volume" is a
  direct call. "A hit landed" or "the player landed" is an event. Don't use "request" events (such
  as "please spawn a blast"): when everything is an event, control flow becomes impossible to
  follow.
- **Events carry who and where.** Each event names its source and, where it applies, its target
  (by id), plus the data a listener needs (position, damage, speed). A listener can still react
  after the object is gone.
- **Listeners can narrow to specific objects.** Listen to everything of a type, or only to events
  from or to one object (for example hits on the queen, or the player's own landings).
- **Two kinds of delivery:**
  - *Gameplay listeners* react inside the step, so their effect lands in the same tick (a combo
    window opening on a hit, a perk exploding on landing). Keep them few, and be aware of which
    phase they run in.
  - *Presentation listeners* get the events after the step. They never affect the simulation.
- **Chains are bounded.** Gameplay listeners may emit more events (a bomb hits a bomb), but deep
  chains are cut off rather than looping.
- **Subscriptions live as long as their owner.** A listener is tied to the object or world it
  belongs to, and goes away with it, so nothing listens to dead objects.
- **Presentation never writes back.** Sound, effects and UI read events and state. They don't
  change the world.

## What it should make easy

- A **dev event log**, and tests or headless runs that assert on the event stream (for example
  "after this input there was one hit on the queen").
- **New feedback** (a sound, a particle, a rumble) for anything that already emits an event, with
  no gameplay changes.
- **New upgrades** that react to what the player does.

See also the `game-objects` skill: objects are the state, and events are what happens to them.
