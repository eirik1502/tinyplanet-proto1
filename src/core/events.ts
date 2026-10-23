// A typed event bus. Events are plain objects keyed by type. An event can name the object it
// comes from (`source`) and the one it happens to (`target`) by id, so a listener can narrow to
// one object: `bus.on("hit", fn, { target: queen.id })`.
//
// Two kinds of listeners:
// - `on`: called as soon as the event is emitted, inside the simulation step. For gameplay
//   reactions that must land in the same tick (a perk that explodes on landing, the combo window
//   opening on a hit). Keep these few; chains are capped at MAX_DEPTH.
// - `after`: called when `flush()` runs, after the step. For presentation: sound, rumble, effects.
//   A headless run simply has none.
//
// Every subscription returns a function that removes it. Passing an `owner` (a Lifetime, e.g. a
// game object's) removes it when the owner is disposed, so listeners never outlive what they
// listen for.

export interface EventBase {
  /** Id of the object the event comes from. */
  source?: number;
  /** Id of the object it happens to. */
  target?: number;
}

export type EventMap = { [type: string]: object };

export interface ListenOptions {
  /** Only events from this object. */
  source?: number;
  /** Only events happening to this object. */
  target?: number;
  /** Unsubscribe when this is disposed. */
  owner?: Lifetime;
}

/** Things to undo when something ends (a game object is destroyed, a world is thrown away). */
export class Lifetime {
  private disposers: (() => void)[] = [];
  private disposed = false;

  add(dispose: () => void) {
    if (this.disposed) dispose();
    else this.disposers.push(dispose);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const d of this.disposers.splice(0).reverse()) d();
  }
}

/** Gameplay listeners triggering more events: deeper than this is assumed to be a loop. */
const MAX_DEPTH = 16;

interface Listener {
  fn: (e: object, type: string) => void;
  source?: number;
  target?: number;
  deferred: boolean;
}

export class EventBus<M extends EventMap> {
  private byType = new Map<keyof M, Listener[]>();
  private any: Listener[] = [];
  private queue: [keyof M, object][] = [];
  private deferredCount = 0;
  private depth = 0;

  /** Listen to `type` now, inside the step. */
  on<K extends keyof M>(type: K, fn: (e: M[K]) => void, opts: ListenOptions = {}) {
    return this.add(this.listFor(type), fn as (e: object) => void, opts, false);
  }

  /** Listen to `type` on `flush()`, after the step. */
  after<K extends keyof M>(type: K, fn: (e: M[K]) => void, opts: ListenOptions = {}) {
    return this.add(this.listFor(type), fn as (e: object) => void, opts, true);
  }

  /** Every event, on `flush()` (event logs, inspectors). */
  afterAny(fn: <K extends keyof M>(type: K, e: M[K]) => void, opts: ListenOptions = {}) {
    return this.add(this.any, (e, type) => fn(type as keyof M, e as M[keyof M]), opts, true);
  }

  emit<K extends keyof M>(type: K, e: M[K]) {
    if (this.depth >= MAX_DEPTH) {
      console.warn(`event chain too deep, dropped "${String(type)}"`);
      return;
    }
    const list = this.byType.get(type);
    if (list) {
      this.depth++;
      try {
        for (const l of list.slice()) if (!l.deferred && matches(l, e)) l.fn(e, type as string);
      } finally {
        this.depth--;
      }
    }
    if (this.deferredCount > 0) this.queue.push([type, e]);
  }

  /** Deliver the events queued since the last flush to the `after` listeners. */
  flush() {
    const queue = this.queue;
    this.queue = [];
    for (const [type, e] of queue) {
      for (const l of this.byType.get(type)?.slice() ?? []) if (l.deferred && matches(l, e)) l.fn(e, type as string);
      for (const l of this.any.slice()) if (matches(l, e)) l.fn(e, type as string);
    }
  }

  private listFor(type: keyof M) {
    let list = this.byType.get(type);
    if (!list) this.byType.set(type, (list = []));
    return list;
  }

  private add(list: Listener[], fn: Listener["fn"], opts: ListenOptions, deferred: boolean) {
    const l: Listener = { fn, source: opts.source, target: opts.target, deferred };
    list.push(l);
    if (deferred) this.deferredCount++;
    let removed = false;
    const off = () => {
      if (removed) return;
      removed = true;
      const i = list.indexOf(l);
      if (i >= 0) list.splice(i, 1);
      if (deferred) this.deferredCount--;
    };
    opts.owner?.add(off);
    return off;
  }
}

const matches = (l: Listener, e: object) =>
  (l.source === undefined || l.source === (e as EventBase).source) && (l.target === undefined || l.target === (e as EventBase).target);
