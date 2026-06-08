/*!
 * ent-comp: a light, *fast* Entity Component System in JS
 * @url      github.com/fenomas/ent-comp
 * @author   Andy Hall <andy@fenomas.com>
 * @license  MIT
 */

import { DataStore, type EntityId } from "./dataStore.js";

export type { EntityId };

/** State object guaranteed to include the owning entity id as `__id`. */
export type StateWithId<T> = T & { __id: EntityId };

/** A constructor that creates a state object (must include `__id`). */
export interface StateConstructor<T> {
  new (): StateWithId<T>;
}

/** Component definition used with `createComponent` / `overwriteComponent`. */
export interface ComponentDefinition<T = any> {
  /** Unique component name. */
  name: string;

  /** Default state values (merged for each new state). */
  state?: Partial<T>;

  /** Custom state constructor (constructed object MUST have `__id`). */
  stateConstructor?: StateConstructor<T>;

  /** Call order among systems (lower runs earlier). Defaults to 99. */
  order?: number;

  /**
   * If true, an entity can have multiple states for this component.
   * Affects the return type of `getState` / `getStateAccessor`.
   */
  multi?: boolean;

  /** Called after a state is added. */
  onAdd?(id: EntityId, state: StateWithId<T>): void;

  /** Called before a state is removed. */
  onRemove?(id: EntityId, state: StateWithId<T>): void;

  /**
   * Per-tick logic. Receives `dt` and the component's states list
   * (same shape as `getStatesList(compName)`).
   */
  system?(dt: any, states: Array<StateWithId<T> | Array<StateWithId<T>>>): void;

  /**
   * Per-render logic. Receives `dt` and the component's states list
   * (same shape as `getStatesList(compName)`).
   */
  renderSystem?(
    dt: any,
    states: Array<StateWithId<T> | Array<StateWithId<T>>>,
  ): void;
}

/** Normalized internal component definition. */
interface InternalComponentDefinition<T = any> {
  name: string;
  multi: boolean;
  order: number;
  stateConstructor: StateConstructor<T> | null;
  state: Partial<T>;
  onAdd: ((id: EntityId, state: StateWithId<T>) => void) | null;
  onRemove: ((id: EntityId, state: StateWithId<T>) => void) | null;
  system: ((dt: any, states: any[]) => void) | null;
  renderSystem: ((dt: any, states: any[]) => void) | null;
}

interface DeferralEntry {
  entID: EntityId;
  data: DataStore<any>;
}

interface Deferrals {
  timeout: boolean;
  removals: DataStore<any>[];
  multiComps: DeferralEntry[];
}

/**
 * Creates a new entity-component-system manager.
 *
 * ```ts
 * import ECS from 'ent-comp'
 * const ecs = new ECS()
 * ```
 * @typicalname ecs
 */
export class ECS {
  /**
   * Hash of component definitions. Also aliased to `comps`.
   *
   * ```ts
   * const comp = { name: 'foo' }
   * ecs.createComponent(comp)
   * ecs.components['foo'] === comp  // true
   * ecs.comps['foo']                // same
   * ```
   */
  components: Record<string, InternalComponentDefinition<any>>;
  comps: Record<string, InternalComponentDefinition<any>>;

  // expose references to internals for debugging or hacking
  _storage: Record<string, DataStore<any>>;
  _systems: string[];
  _renderSystems: string[];

  // counter for entity IDs
  private _uid: number;

  // Storage for all component state data:
  // storage['component-name'] = DataStore instance
  private storage: Record<string, DataStore<any>>;

  // flat arrays of names of components with systems
  private systems: string[];
  private renderSystems: string[];

  // flags and arrays for deferred cleanup of removed stuff
  private deferrals: Deferrals;

  constructor() {
    this.components = {};
    this.comps = this.components;
    this._uid = 1;

    this.storage = {};
    this.systems = [];
    this.renderSystems = [];
    this.deferrals = {
      timeout: false,
      removals: [],
      multiComps: [],
    };

    this._storage = this.storage;
    this._systems = this.systems;
    this._renderSystems = this.renderSystems;
  }

  /*
   *
   *
   *              Public API
   *
   *
   */

  /**
   * Creates a new entity id (currently just an incrementing integer).
   *
   * Optionally takes a list of component names to add to the entity (with default state data).
   *
   * ```ts
   * const id1 = ecs.createEntity()
   * const id2 = ecs.createEntity([ 'some-component', 'other-component' ])
   * ```
   */
  createEntity(compList?: string[]): EntityId {
    const id = this._uid++;
    if (Array.isArray(compList)) {
      compList.forEach((compName) => this.addComponent(id, compName));
    }
    return id;
  }

  /**
   * Deletes an entity, which in practice means removing all its components.
   *
   * ```ts
   * ecs.deleteEntity(id)
   * ```
   */
  deleteEntity(entID: EntityId): this {
    // loop over all components and maybe remove them
    // this avoids needing to keep a list of components-per-entity
    Object.keys(this.storage).forEach((compName) => {
      const data = this.storage[compName];
      if (data.hash[entID]) {
        this._removeComponent(entID, compName);
      }
    });
    return this;
  }

  /**
   * Creates a new component from a definition object.
   * The definition must have a `name`; all other properties are optional.
   *
   * Returns the component name, to make it easy to grab when the component
   * is being `import`ed from a module.
   *
   * ```ts
   * const comp = {
   *   name: 'some-unique-string',
   *   state: {},
   *   order: 99,
   *   multi: false,
   *   onAdd:        (id, state) => { },
   *   onRemove:     (id, state) => { },
   *   system:       (dt, states) => { },
   *   renderSystem: (dt, states) => { },
   * }
   *
   * const name = ecs.createComponent( comp )
   * // name == 'some-unique-string'
   * ```
   *
   * Note the `multi` flag - for components where this is true, a given
   * entity can have multiple state objects for that component.
   * For multi-components, APIs that would normally return a state object
   * (like `getState`) will instead return an array of them.
   */
  createComponent<T = any>(compDefn: ComponentDefinition<T>): string {
    if (!compDefn) throw new Error("Missing component definition");
    const name = compDefn.name;
    if (!name)
      throw new Error("Component definition must have a name property.");
    if (typeof name !== "string")
      throw new Error("Component name must be a string.");
    if (name === "")
      throw new Error("Component name must be a non-empty string.");
    if (this.storage[name])
      throw new Error(`Component ${name} already exists.`);

    // rebuild definition object for monomorphism
    const internalDef: InternalComponentDefinition<T> = {
      name,
      multi: !!compDefn.multi,
      order: isNaN(compDefn.order!) ? 99 : compDefn.order!,
      stateConstructor: compDefn.stateConstructor || null,
      state: compDefn.state || {},
      onAdd: compDefn.onAdd || null,
      onRemove: compDefn.onRemove || null,
      system: compDefn.system || null,
      renderSystem: compDefn.renderSystem || null,
    };

    this.components[name] = internalDef;
    this.storage[name] = new DataStore();
    this.storage[name]._pendingMultiCleanup = false;
    this.storage[name]._multiCleanupIDs = internalDef.multi ? [] : null;

    if (internalDef.system) {
      this.systems.push(name);
      this.systems.sort(
        (a, b) => this.components[a].order - this.components[b].order,
      );
    }
    if (internalDef.renderSystem) {
      this.renderSystems.push(name);
      this.renderSystems.sort(
        (a, b) => this.components[a].order - this.components[b].order,
      );
    }

    return name;
  }

  /**
   * Overwrites an existing component with a new definition object, which
   * must have the same `name` property as the component it overwrites.
   * Otherwise identical to `createComponent`
   *
   * ```ts
   *   ecs.createComponent({
   *     name: 'foo',
   *     state: { aaa: 0 },
   *   })
   *   ecs.addComponent(myEntity, 'foo')
   *   ecs.getState(myEntity, 'foo').aaa = 123
   *
   *   ecs.overwriteComponent('foo', {
   *     name: 'foo',
   *     state: { bbb: 456 },
   *   })
   *   ecs.getState(myEntity, 'foo')  // { aaa:123, bbb:456 }
   * ```
   */
  overwriteComponent<T = any>(
    compName: string,
    compDefn: ComponentDefinition<T>,
  ): string {
    const def = this.components[compName];
    if (!def) throw new Error(`Unknown component: ${compName}`);
    if (!compDefn) throw new Error("Missing component definition");
    if (def.name !== compDefn.name)
      throw new Error("Overwriting component must use the same name property.");

    // rebuild definition object for monomorphism
    const internalDef: InternalComponentDefinition<T> = {
      name: compName,
      multi: !!compDefn.multi,
      order: isNaN(compDefn.order!) ? 99 : compDefn.order!,
      stateConstructor: compDefn.stateConstructor || null,
      state: compDefn.state || {},
      onAdd: compDefn.onAdd || null,
      onRemove: compDefn.onRemove || null,
      system: compDefn.system || null,
      renderSystem: compDefn.renderSystem || null,
    };

    // overwrite internal references to old component def
    this.components[compName] = internalDef;
    this.storage[compName]._pendingMultiCleanup = false;
    this.storage[compName]._multiCleanupIDs = internalDef.multi ? [] : null;

    const si = this.systems.indexOf(compName);
    if (internalDef.system && si < 0) this.systems.push(compName);
    if (!internalDef.system && si >= 0) this.systems.splice(si, 1);
    this.systems.sort(
      (a, b) => this.components[a].order - this.components[b].order,
    );

    const ri = this.renderSystems.indexOf(compName);
    if (internalDef.renderSystem && ri < 0) this.renderSystems.push(compName);
    if (!internalDef.renderSystem && ri >= 0) this.renderSystems.splice(ri, 1);
    this.renderSystems.sort(
      (a, b) => this.components[a].order - this.components[b].order,
    );

    // for any existing entities with the component,
    // add any default state properties they're missing
    const baseState = internalDef.state;
    this.getStatesList(compName).forEach((state: any) => {
      for (const key in baseState) {
        if (!(key in state)) state[key] = baseState[key];
      }
      // also call the new comp's add handler, if any
      if (internalDef.onAdd) internalDef.onAdd(state.__id, state);
    });

    return compName;
  }

  /**
   * Deletes the component definition with the given name.
   * First removes the component from all entities that have it.
   *
   * **Note:** This API shouldn't be necessary in most real-world usage -
   * you should set up all your components during init and then leave them be.
   * But it's useful if, say, you receive an ECS from another library and
   * you need to replace its components.
   *
   * ```ts
   * ecs.deleteComponent( 'some-component' )
   * ```
   */
  deleteComponent(compName: string): this {
    const data = this.storage[compName];
    if (!data) throw new Error(`Unknown component: ${compName}`);

    data.flush();
    data.list.forEach((obj: any) => {
      if (!obj) return;
      const o = obj as any;
      const id: EntityId = o.__id ?? o[0].__id;
      this._removeComponent(id, compName);
    });

    const i = this.systems.indexOf(compName);
    const j = this.renderSystems.indexOf(compName);
    if (i > -1) this.systems.splice(i, 1);
    if (j > -1) this.renderSystems.splice(j, 1);

    this.storage[compName].dispose();
    delete this.storage[compName];
    delete this.components[compName];

    return this;
  }

  /**
   * Adds a component to an entity, optionally initializing the state object.
   *
   * ```ts
   * ecs.createComponent({
   *   name: 'foo',
   *   state: { val: 1 }
   * })
   * ecs.addComponent(id1, 'foo')             // use default state
   * ecs.addComponent(id2, 'foo', { val:2 })  // pass in state data
   * ```
   */
  addComponent<T = any>(
    entID: EntityId,
    compName: string,
    state?: Partial<T>,
  ): this {
    const def = this.components[compName];
    const data = this.storage[compName];
    if (!data) throw new Error(`Unknown component: ${compName}.`);

    // treat adding an existing (non-multi-) component as an error
    if (data.hash[entID] && !def.multi) {
      throw new Error(`Entity ${entID} already has component: ${compName}.`);
    }

    // create new component state object for this entity
    let newState: StateWithId<T>;
    if (def.stateConstructor) {
      newState = new def.stateConstructor();
      if (!Object.prototype.hasOwnProperty.call(newState, "__id")) {
        throw new Error(
          `Component ${def.name} stateConstructor type does not have property __id`,
        );
      }
    } else {
      newState = Object.assign(
        {},
        { __id: entID },
        def.state,
        state,
      ) as StateWithId<T>;
    }

    newState.__id = entID;

    // add to data store - for multi components, may already be present
    if (def.multi) {
      let statesArr = data.hash[entID] as StateWithId<T>[] | null;
      if (!statesArr) {
        statesArr = [];
        data.add(entID, statesArr as any);
      }
      statesArr.push(newState);
    } else {
      data.add(entID, newState);
    }

    // call handler and return
    if (def.onAdd) def.onAdd(entID, newState);

    return this;
  }

  /**
   * Checks if an entity has a component.
   *
   * ```ts
   * ecs.addComponent(id, 'foo')
   * ecs.hasComponent(id, 'foo')       // true
   * ```
   */
  hasComponent(entID: EntityId, compName: string): boolean {
    const data = this.storage[compName];
    if (!data) throw new Error(`Unknown component: ${compName}.`);
    return !!data.hash[entID];
  }

  /**
   * Removes a component from an entity, triggering the component's
   * `onRemove` handler, and then deleting any state data.
   *
   * ```ts
   * ecs.removeComponent(id, 'foo')
   * ecs.hasComponent(id, 'foo')       // false
   * ```
   */
  removeComponent(entID: EntityId, compName: string): this {
    const data = this.storage[compName];
    if (!data) throw new Error(`Unknown component: ${compName}.`);

    // removal implementations at end
    this._removeComponent(entID, compName);

    return this;
  }

  /**
   * Get the component state for a given entity.
   * It will automatically have an `__id` property for the entity id.
   *
   * ```ts
   * ecs.createComponent({
   *   name: 'foo',
   *   state: { val: 0 }
   * })
   * ecs.addComponent(id, 'foo')
   * ecs.getState(id, 'foo').val       // 0
   * ecs.getState(id, 'foo').__id      // equals id
   * ```
   */
  getState<T = any>(
    entID: EntityId,
    compName: string,
  ): StateWithId<T> | Array<StateWithId<T>> | undefined {
    const data = this.storage[compName];
    if (!data) throw new Error(`Unknown component: ${compName}.`);
    return data.hash[entID] as any;
  }

  /**
   * Get an array of state objects for every entity with the given component.
   * Each one will have an `__id` property for the entity id it refers to.
   * Don't add or remove elements from the returned list!
   *
   * ```ts
   * const arr = ecs.getStatesList('foo')
   * // returns something shaped like:
   * //   [
   * //     {__id:0, x:1},
   * //     {__id:7, x:2},
   * //   ]
   * ```
   */
  getStatesList<T = any>(
    compName: string,
  ): Array<StateWithId<T> | Array<StateWithId<T>>> {
    const data = this.storage[compName];
    if (!data) throw new Error(`Unknown component: ${compName}.`);
    this._doDeferredCleanup();
    return data.list as any;
  }

  /**
   * Makes a `getState`-like accessor bound to a given component.
   * The accessor is faster than `getState`, so you may want to create
   * an accessor for any component you'll be accessing a lot.
   *
   * ```ts
   * ecs.createComponent({
   *   name: 'size',
   *   state: { val: 0 }
   * })
   * const getEntitySize = ecs.getStateAccessor('size')
   * // ...
   * ecs.addComponent(id, 'size', { val:123 })
   * getEntitySize(id).val      // 123
   * ```
   */
  getStateAccessor<T = any>(
    compName: string,
  ): (id: EntityId) => StateWithId<T> | Array<StateWithId<T>> | undefined {
    if (!this.storage[compName])
      throw new Error(`Unknown component: ${compName}.`);
    const hash = this.storage[compName].hash;
    return (id: EntityId) => hash[id] as any;
  }

  /**
   * Makes a `hasComponent`-like accessor function bound to a given component.
   * The accessor is much faster than `hasComponent`.
   *
   * ```ts
   * ecs.createComponent({
   *   name: 'foo',
   * })
   * const hasFoo = ecs.getComponentAccessor('foo')
   * // ...
   * ecs.addComponent(id, 'foo')
   * hasFoo(id) // true
   * ```
   */
  getComponentAccessor(compName: string): (id: EntityId) => boolean {
    if (!this.storage[compName])
      throw new Error(`Unknown component: ${compName}.`);
    const hash = this.storage[compName].hash;
    return (id: EntityId) => !!hash[id];
  }

  /**
   * Tells the ECS that a game tick has occurred, causing component
   * `system` functions to get called.
   *
   * The optional parameter simply gets passed to the system functions.
   * It's meant to be a timestep, but can be used (or not used) as you like.
   *
   * If components have an `order` property, they'll get called in that order
   * (lowest to highest). Component order defaults to `99`.
   * ```ts
   * ecs.createComponent({
   *   name: 'foo',
   *   order: 1,
   *   system: function(dt, states) {
   *     // states is the same array you'd get from #getStatesList()
   *     states.forEach(state => {
   *       console.log('Entity ID: ', state.__id)
   *     })
   *   }
   * })
   * ecs.tick(30) // triggers log statements
   * ```
   */
  tick(dt?: any): this {
    this._doDeferredCleanup();
    for (let i = 0; i < this.systems.length; i++) {
      const compName = this.systems[i];
      const comp = this.components[compName];
      const data = this.storage[compName];
      comp.system!(dt, data.list);
      this._doDeferredCleanup();
    }
    return this;
  }

  /**
   * Functions exactly like `tick`, but calls `renderSystem` functions.
   * this effectively gives you a second set of systems that are
   * called with separate timing, in case you want to
   * [tick and render in separate loops](http://gafferongames.com/game-physics/fix-your-timestep/)
   * (which you should!).
   *
   * ```ts
   * ecs.createComponent({
   *   name: 'foo',
   *   order: 5,
   *   renderSystem: function(dt, states) {
   *     // states is the same array you'd get from #getStatesList()
   *   }
   * })
   * ecs.render(1000/60)
   * ```
   */
  render(dt?: any): this {
    this._doDeferredCleanup();
    for (let i = 0; i < this.renderSystems.length; i++) {
      const compName = this.renderSystems[i];
      const comp = this.components[compName];
      const data = this.storage[compName];
      comp.renderSystem!(dt, data.list);
      this._doDeferredCleanup();
    }
    return this;
  }

  /**
   * Removes one particular instance of a multi-component.
   * To avoid breaking loops, the relevant state object will get nulled
   * immediately, and spliced from the states array later when safe
   * (after the current tick/render/animationFrame).
   *
   * ```ts
   * // where component 'foo' is a multi-component
   * ecs.getState(id, 'foo')   // [ state1, state2, state3 ]
   * ecs.removeMultiComponent(id, 'foo', 1)
   * ecs.getState(id, 'foo')   // [ state1, null, state3 ]
   * // one JS event loop later...
   * ecs.getState(id, 'foo')   // [ state1, state3 ]
   * ```
   */
  removeMultiComponent(entID: EntityId, compName: string, index: number): this {
    const def = this.components[compName];
    const data = this.storage[compName];
    if (!data) throw new Error(`Unknown component: ${compName}.`);
    if (!def.multi)
      throw new Error("removeMultiComponent called on non-multi component");

    // removal implementations at end
    this._removeMultiCompElement(entID, def, data, index);

    return this;
  }

  /*
   *
   *
   *          internal implementations of remove/delete operations
   *          a bit hairy due to deferred cleanup, etc.
   *
   *
   */

  // remove given component from an entity
  private _removeComponent(entID: EntityId, compName: string): void {
    const def = this.components[compName];
    const data = this.storage[compName];

    // fail silently on all cases where removal target isn't present,
    // since multiple pieces of logic often remove/delete simultaneously
    const state = data.hash[entID];
    if (!state) return;

    // null out data now, so overlapped remove events won't fire
    data.remove(entID);

    // call onRemove handler - on each instance for multi components
    if (def.onRemove) {
      if (def.multi) {
        (state as any[]).forEach((s: any) => {
          if (s) def.onRemove!(entID, s);
        });
        (state as any[]).length = 0;
      } else {
        def.onRemove(entID, state as any);
      }
    }

    this.deferrals.removals.push(data);
    this._pingDeferrals();
  }

  // remove one state from a multi component
  private _removeMultiCompElement(
    entID: EntityId,
    def: InternalComponentDefinition,
    data: DataStore,
    index: number,
  ): void {
    // if statesArr isn't present there's no work or cleanup to do
    const statesArr = data.hash[entID] as any[] | null;
    if (!statesArr) return;

    // as above, ignore cases where removal target doesn't exist
    const state = statesArr[index];
    if (!state) return;

    // null out element and fire event
    statesArr[index] = null;
    if (def.onRemove) def.onRemove(entID, state);

    this.deferrals.multiComps.push({ entID, data });
    this._pingDeferrals();
  }

  // rigging
  private _pingDeferrals(): void {
    if (this.deferrals.timeout) return;
    this.deferrals.timeout = true;
    setTimeout(() => this._deferralHandler(), 1);
  }

  private _deferralHandler(): void {
    this.deferrals.timeout = false;
    this._doDeferredCleanup();
  }

  /*
   *
   *          general handling for deferred data cleanup
   *              - removes null states if component is multi
   *              - removes null entries from component dataStore
   *          should be called at safe times - not during state loops
   *
   */

  private _doDeferredCleanup(): void {
    if (this.deferrals.multiComps.length) {
      this._deferredMultiCompCleanup(this.deferrals.multiComps);
    }
    if (this.deferrals.removals.length) {
      this._deferredComponentCleanup(this.deferrals.removals);
    }
  }

  // removes null elements from multi-comp state arrays
  private _deferredMultiCompCleanup(list: DeferralEntry[]): void {
    for (let i = 0; i < list.length; i++) {
      const { entID, data } = list[i];
      const statesArr = data.hash[entID] as any[] | null;
      if (!statesArr) continue;
      for (let j = 0; j < statesArr.length; j++) {
        if (statesArr[j]) continue;
        statesArr.splice(j, 1);
        j--;
      }
      // if this leaves the states list empty, remove the whole component
      if (statesArr.length === 0) {
        data.remove(entID);
        this.deferrals.removals.push(data);
      }
    }
    list.length = 0;
  }

  // flushes dataStore after components have been removed
  private _deferredComponentCleanup(list: DataStore[]): void {
    for (let i = 0; i < list.length; i++) {
      list[i].flush();
    }
    list.length = 0;
  }
}

export default ECS;
