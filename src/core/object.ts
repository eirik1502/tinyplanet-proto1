import { Lifetime } from "./events";

// Game objects. Everything in a world (the player, boids, attacks in flight) is a GameObject: an
// id, a kind, a position and velocity on the game plane (with an altitude), and components that
// add capabilities, looked up by typed keys:
//
//   const Health = component<Health>("health");
//   boid.add(Health, { hp: 3, max: 3 });
//   world.objects.query(Health, Hurtbox)  // → [object, health, hurtbox][]
//
// Components are data, or small objects with methods. Logic that spans many objects (hit
// resolution, flocking) lives in systems that query for the components they work on.

export interface ComponentKey<T> {
  readonly name: string;
  /** Carries the component's type; never set. */
  readonly _type?: T;
}

export const component = <T>(name: string): ComponentKey<T> => ({ name });

type ValuesOf<K extends readonly ComponentKey<unknown>[]> = { [I in keyof K]: K[I] extends ComponentKey<infer T> ? T : never };

export class GameObject {
  /** Set when added to a store; unique within it. */
  id = 0;
  /** False once destroyed; it leaves its store at the end of the step. */
  alive = true;
  x = 0;
  y = 0;
  alt = 0;
  vx = 0;
  vy = 0;
  vz = 0;
  /** Disposed when the object is removed: subscriptions and anything else tied to it. */
  readonly lifetime = new Lifetime();
  private readonly parts = new Map<ComponentKey<unknown>, unknown>();

  constructor(readonly kind: string) {}

  add<T>(key: ComponentKey<T>, value: T): T {
    this.parts.set(key, value);
    return value;
  }

  get<T>(key: ComponentKey<T>): T | undefined {
    return this.parts.get(key) as T | undefined;
  }

  require<T>(key: ComponentKey<T>): T {
    const v = this.parts.get(key);
    if (v === undefined) throw new Error(`${this.kind}#${this.id} has no ${key.name}`);
    return v as T;
  }

  has(key: ComponentKey<unknown>) {
    return this.parts.has(key);
  }

  remove(key: ComponentKey<unknown>) {
    this.parts.delete(key);
  }

  /** The components by name, for inspectors. */
  components(): [string, unknown][] {
    return [...this.parts].map(([k, v]) => [k.name, v]);
  }
}

/** The objects of one world. */
export class ObjectStore {
  private list: GameObject[] = [];
  private byId = new Map<number, GameObject>();
  private nextId = 1;

  add<T extends GameObject>(o: T): T {
    o.id = this.nextId++;
    this.list.push(o);
    this.byId.set(o.id, o);
    return o;
  }

  get(id: number | undefined): GameObject | undefined {
    return id === undefined ? undefined : this.byId.get(id);
  }

  /** Mark `o` for removal at the next sweep. */
  destroy(o: GameObject) {
    o.alive = false;
  }

  /** Remove destroyed objects and end their lifetimes. */
  sweep() {
    if (this.list.every((o) => o.alive)) return;
    const gone = this.list.filter((o) => !o.alive);
    this.list = this.list.filter((o) => o.alive);
    for (const o of gone) {
      this.byId.delete(o.id);
      o.lifetime.dispose();
    }
  }

  all(): readonly GameObject[] {
    return this.list;
  }

  /** Live objects with every one of `keys`, with those components. */
  query<K extends readonly ComponentKey<unknown>[]>(...keys: K): [GameObject, ...ValuesOf<K>][] {
    const out: [GameObject, ...ValuesOf<K>][] = [];
    for (const o of this.list) {
      if (!o.alive) continue;
      const values: unknown[] = [];
      let ok = true;
      for (const k of keys) {
        const v = o.get(k);
        if (v === undefined) {
          ok = false;
          break;
        }
        values.push(v);
      }
      if (ok) out.push([o, ...values] as unknown as [GameObject, ...ValuesOf<K>]);
    }
    return out;
  }

  dispose() {
    for (const o of this.list) o.lifetime.dispose();
    this.list = [];
    this.byId.clear();
  }
}
