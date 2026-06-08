import DataStore from "./dataStore.js";

export type EntityId = string | number;
export type ComponentName = string;
export type StateWithId<T> = T & { __id: EntityId };
export interface StateConstructor<T extends Record<string, unknown>> {
  new (): StateWithId<T>;
}

export interface ComponentDefinition<T extends Record<string, unknown> = {}> {
  /** Unique component name. */
  name: string;

  /** Default state values (merged for each new state). */
  state: Partial<T>;

  /** Custom state constructor (constructed object MUST have `__id`). */
  stateConstructor: StateConstructor<T> | null;

  /** Call order among systems (lower runs earlier). Defaults to 99. */
  order: number;

  /**
   * If true, an entity can have multiple states for this component.
   * Affects the return type of `getState` / `getStateAccessor`.
   */
  multi: boolean;

  /** Called after a state is added. */
  onAdd: ((id: EntityId, state: StateWithId<T>) => void) | null;

  /** Called before a state is removed. */
  onRemove: ((id: EntityId, state: StateWithId<T>) => void) | null;

  /**
   * Per-tick logic. Receives `dt` and the component's states list
   * (same shape as `getStatesList(compName)`).
   */
  system:
    | ((dt: any, states: Array<StateWithId<T> | Array<StateWithId<T>>>) => void)
    | null;

  /**
   * Per-render logic. Receives `dt` and the component's states list
   * (same shape as `getStatesList(compName)`).
   */
  renderSystem:
    | ((dt: any, states: Array<StateWithId<T> | Array<StateWithId<T>>>) => void)
    | null;
}

export interface PartialComponentDefinition<
  T extends Record<string, unknown> = {},
> {
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

/**
 * Constructor for a new entity-component-system manager.
 *
 * ```js
 * var ECS = require('ent-comp')
 * var ecs = new ECS()
 * ```
 * @class
 * @constructor
 * @exports ECS
 * @typicalname ecs
 */
export default class ECS {
  components: Record<EntityId, ComponentDefinition<any>>;

  private storage: Record<string, DataStore>;
  private systems: any[];
  private renderSystems: any[];
  private UID: number;
  private deferrals: {
    timeout: boolean;
    removals: any[];
    multiComps: any[];
  };
  constructor() {
    /**
     * Hash of component definitions. Also aliased to `comps`.
     *
     * ```js
     * var comp = { name: 'foo' }
     * ecs.createComponent(comp)
     * ecs.components['foo'] === comp  // true
     * ecs.comps['foo']                // same
     * ```
     */
    this.components = {};

    /*
     *
     * 		internal properties:
     *
     */

    // counter for entity IDs
    this.UID = 1;

    // flags and arrays for deferred cleanup of removed stuff
    this.deferrals = {
      timeout: false,
      removals: [],
      multiComps: [],
    };
    // Storage for all component state data:
    // storage['component-name'] = DataStore instance
    this.storage = {};

    // flat arrays of names of components with systems
    this.systems = [];

    this.renderSystems = [];
  }
  /**
   * Creates a new entity id (currently just an incrementing integer).
   *
   * Optionally takes a list of component names to add to the entity (with default state data).
   *
   * ```js
   * var id1 = ecs.createEntity()
   * var id2 = ecs.createEntity([ 'some-component', 'other-component' ])
   * ```
   */
  createEntity(compList: any[]): EntityId {
    var id = this.UID++;
    compList.forEach((compName) => this.addComponent(id, compName));
    return id;
  }
  /**
   * Deletes an entity, which in practice means removing all its components.
   *
   * ```js
   * ecs.deleteEntity(id)
   * ```
   */
  deleteEntity(entID: EntityId) {
    // loop over all components and maybe remove them
    // this avoids needing to keep a list of components-per-entity
    Object.keys(this.storage).forEach((compName) => {
      var data = this.storage[compName];
      if (data.hash[entID]) {
        this.removeComponent(entID, compName);
      }
    });
    return this;
  }
  /**
   * Creates a new component from a definition object.
   * The definition must have a `name`; all other properties are optional.
   *
   * Returns the component name, to make it easy to grab when the component
   * is being `require`d from a module.
   *
   * ```js
   * var comp = {
   * 	 name: 'some-unique-string',
   * 	 state: {},
   * 	 order: 99,
   * 	 multi: false,
   * 	 onAdd:        (id, state) => { },
   * 	 onRemove:     (id, state) => { },
   * 	 system:       (dt, states) => { },
   * 	 renderSystem: (dt, states) => { },
   * }
   *
   * var name = ecs.createComponent( comp )
   * // name == 'some-unique-string'
   * ```
   *
   * Note the `multi` flag - for components where this is true, a given
   * entity can have multiple state objects for that component.
   * For multi-components, APIs that would normally return a state object
   * (like `getState`) will instead return an array of them.
   */
  createComponent<T extends Record<string, unknown>>(
    compDefn: PartialComponentDefinition<T>,
  ) {
    if (!compDefn) throw new Error("Missing component definition");

    if (this.storage[compDefn.name])
      throw new Error(`Component ${name} already exists.`);

    // rebuild definition object for monomorphism
    const internalDef = this.convertCompDefnToFull(compDefn);
    this.components[compDefn.name] = internalDef;
    this.storage[compDefn.name] = new DataStore();
    this.storage[compDefn.name]._pendingMultiCleanup = false;
    this.storage[compDefn.name]._multiCleanupIDs = internalDef.multi
      ? []
      : null;

    if (internalDef.system) {
      this.systems.push(compDefn.name);
      this.systems.sort(
        (a, b) => this.components[a].order - this.components[b].order,
      );
    }
    if (internalDef.renderSystem) {
      this.renderSystems.push(compDefn.name);
      this.renderSystems.sort(
        (a, b) => this.components[a].order - this.components[b].order,
      );
    }

    return compDefn.name;
  }
  /**
   * Overwrites an existing component with a new definition object, which
   * must have the same `name` property as the component it overwrites.
   * Otherwise identical to `createComponent`
   *
   * ```js
   *   ecs.createComponent({
   *     name: 'foo',
   *     state: { aaa: 0 },
   *   })
   *   ecs.addComponent(myEntity, 'foo')
   *   ecs.getState(myEntity, 'foo').aaa = 123
   *
   *   ecs.overwriteComponent('foo', {
   *	   name: 'foo',
   *	   state: { bbb: 456 },
   *	 })
   *   ecs.getState(myEntity, 'foo')  // { aaa:123, bbb:456 }
   * ```
   *
   */
  overwriteComponent<T extends Record<string, unknown>>(
    compName: string,
    compDefn: PartialComponentDefinition<T>,
  ) {
    var def = this.components[compName];
    if (!def) throw new Error(`Unknown component: ${compName}`);
    if (!compDefn) throw new Error("Missing component definition");
    if (def.name !== compDefn.name)
      throw new Error("Overwriting component must use the same name property.");

    // rebuild definition object for monomorphism
    var internalDef = this.convertCompDefnToFull(compDefn);

    // overwrite internal references to old component def
    this.components[compName] = internalDef;
    this.storage[compName]._pendingMultiCleanup = false;
    this.storage[compName]._multiCleanupIDs = internalDef.multi ? [] : null;

    var si = this.systems.indexOf(compName);
    if (internalDef.system && si < 0) this.systems.push(compName);
    if (!internalDef.system && si >= 0) this.systems.splice(si, 1);
    this.systems.sort(
      (a, b) => this.components[a].order - this.components[b].order,
    );

    var ri = this.renderSystems.indexOf(compName);
    if (internalDef.renderSystem && ri < 0) this.renderSystems.push(compName);
    if (!internalDef.renderSystem && ri >= 0) this.renderSystems.splice(ri, 1);
    this.renderSystems.sort(
      (a, b) => this.components[a].order - this.components[b].order,
    );

    // for any existing entities with the component,
    // add any default state properties they're missing
    var baseState = internalDef.state;
    this.getStatesList(compName).forEach((state) => {
      for (const key of Object.keys(baseState)) {
        if (!(key in state)) (state as any)[key] = baseState[key];
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
   * ```js
   * ecs.deleteComponent( 'some-component' )
   * ```
   */
  deleteComponent(compName: string) {
    var data = this.storage[compName];
    if (!data) throw new Error(`Unknown component: ${compName}`);

    data.flush();
    data.list.forEach((obj) => {
      if (!obj) return;
      var id = obj.__id || obj[0].__id;
      this.removeComponent(id, compName);
    });

    var i = this.systems.indexOf(compName);
    var j = this.renderSystems.indexOf(compName);
    if (i > -1) this.systems.splice(i, 1);
    if (j > -1) this.renderSystems.splice(j, 1);

    this.storage[compName].dispose();
    delete this.storage[compName];
    delete this.components[compName];

    return self;
  }
  /**
   * Adds a component to an entity, optionally initializing the state object.
   *
   * ```js
   * ecs.createComponent({
   * 	name: 'foo',
   * 	state: { val: 1 }
   * })
   * ecs.addComponent(id1, 'foo')             // use default state
   * ecs.addComponent(id2, 'foo', { val:2 })  // pass in state data
   * ```
   */
  addComponent(
    entID: EntityId,
    compName: string,
    state: Record<string, unknown> = {},
  ) {
    var def = this.components[compName];
    var data = this.storage[compName];
    if (!data) throw new Error(`Unknown component: ${compName}.`);

    // treat adding an existing (non-multi-) component as an error
    if (data.hash[entID] && !def.multi) {
      throw new Error(`Entity ${entID} already has component: ${compName}.`);
    }

    // create new component state object for this entity
    var newState = def.stateConstructor
      ? new def.stateConstructor()
      : Object.assign({}, { __id: entID }, def.state, state);

    newState.__id = entID;

    // add to data store - for multi components, may already be present
    if (def.multi) {
      var statesArr = data.hash[entID];
      if (!statesArr) {
        statesArr = [];
        data.add(entID, statesArr);
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
   * ```js
   * ecs.addComponent(id, 'foo')
   * ecs.hasComponent(id, 'foo')       // true
   * ```
   */
  hasComponent(entID: EntityId, compName: ComponentName) {
    var data = this.storage[compName];
    if (!data) throw new Error(`Unknown component: ${compName}.`);
    return !!data.hash[entID];
  }
  /**
   * Removes a component from an entity, triggering the component's
   * `onRemove` handler, and then deleting any state data.
   *
   * ```js
   * ecs.removeComponent(id, 'foo')
   * ecs.hasComponent(id, 'foo')     	 // false
   * ```
   */
  removeComponent(entID: EntityId, compName: ComponentName) {
    var data = this.storage[compName];
    if (!data) throw new Error(`Unknown component: ${compName}.`);

    // removal implementations at end
    this.removeComponent(entID, compName);

    return self;
  }
  /**
   * Get the component state for a given entity.
   * It will automatically have an `__id` property for the entity id.
   *
   * ```js
   * ecs.createComponent({
   * 	name: 'foo',
   * 	state: { val: 0 }
   * })
   * ecs.addComponent(id, 'foo')
   * ecs.getState(id, 'foo').val       // 0
   * ecs.getState(id, 'foo').__id      // equals id
   * ```
   */
  getState(entID: EntityId, compName: ComponentName) {
    var data = this.storage[compName];
    if (!data) throw new Error(`Unknown component: ${compName}.`);
    return data.hash[entID];
  }
  /**
   * Get an array of state objects for every entity with the given component.
   * Each one will have an `__id` property for the entity id it refers to.
   * Don't add or remove elements from the returned list!
   *
   * ```js
   * var arr = ecs.getStatesList('foo')
   * // returns something shaped like:
   * //   [
   * //     {__id:0, x:1},
   * //     {__id:7, x:2},
   * //   ]
   * ```
   */
  getStatesList(
    compName: ComponentName,
  ): (StateWithId<unknown> | StateWithId<unknown>[])[] {
    var data = this.storage[compName];
    if (!data) throw new Error(`Unknown component: ${compName}.`);
    this.doDeferredCleanup();
    return data.list;
  }
  /**
   * Makes a `getState`-like accessor bound to a given component.
   * The accessor is faster than `getState`, so you may want to create
   * an accessor for any component you'll be accessing a lot.
   *
   * ```js
   * ecs.createComponent({
   * 	name: 'size',
   * 	state: { val: 0 }
   * })
   * var getEntitySize = ecs.getStateAccessor('size')
   * // ...
   * ecs.addComponent(id, 'size', { val:123 })
   * getEntitySize(id).val      // 123
   * ```
   */
  getStateAccessor(compName: string) {
    if (!this.storage[compName])
      throw new Error(`Unknown component: ${compName}.`);
    var hash = this.storage[compName].hash;
    return (id) => hash[id];
  }
  /**
   * Makes a `hasComponent`-like accessor function bound to a given component.
   * The accessor is much faster than `hasComponent`.
   *
   * ```js
   * ecs.createComponent({
   * 	name: 'foo',
   * })
   * var hasFoo = ecs.getComponentAccessor('foo')
   * // ...
   * ecs.addComponent(id, 'foo')
   * hasFoo(id) // true
   * ```
   */
  getComponentAccessor(compName: string) {
    if (!this.storage[compName])
      throw new Error(`Unknown component: ${compName}.`);
    var hash = this.storage[compName].hash;
    return (id) => Boolean(hash[id]);
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
   * ```js
   * ecs.createComponent({
   * 	name: foo,
   * 	order: 1,
   * 	system: function(dt, states) {
   * 		// states is the same array you'd get from #getStatesList()
   * 		states.forEach(state => {
   * 			console.log('Entity ID: ', state.__id)
   * 		})
   * 	}
   * })
   * ecs.tick(30) // triggers log statements
   * ```
   */
  tick(dt: number) {
    this.doDeferredCleanup();
    for (const compName of this.systems) {
      var comp = this.components[compName];
      var data = this.storage[compName];
      comp.system?.(dt, data.list);
      this.doDeferredCleanup();
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
   * ```js
   * ecs.createComponent({
   * 	name: foo,
   * 	order: 5,
   * 	renderSystem: function(dt, states) {
   * 		// states is the same array you'd get from #getStatesList()
   * 	}
   * })
   * ecs.render(1000/60)
   * ```
   */
  render(dt: number) {
    this.doDeferredCleanup();
    for (const compName of this.renderSystems) {
      var comp = this.components[compName];
      var data = this.storage[compName];
      comp.renderSystem?.(dt, data.list);
      this.doDeferredCleanup();
    }
    return this;
  }
  /**
   * Removes one particular instance of a multi-component.
   * To avoid breaking loops, the relevant state object will get nulled
   * immediately, and spliced from the states array later when safe
   * (after the current tick/render/animationFrame).
   *
   * ```js
   * // where component 'foo' is a multi-component
   * ecs.getState(id, 'foo')   // [ state1, state2, state3 ]
   * ecs.removeMultiComponent(id, 'foo', 1)
   * ecs.getState(id, 'foo')   // [ state1, null, state3 ]
   * // one JS event loop later...
   * ecs.getState(id, 'foo')   // [ state1, state3 ]
   * ```
   */
  removeMultiComponent(
    entID: EntityId,
    compName: ComponentName,
    index: number,
  ) {
    var def = this.components[compName];
    var data = this.storage[compName];
    if (!data) throw new Error(`Unknown component: ${compName}.`);
    if (!def.multi)
      throw new Error("removeMultiComponent called on non-multi component");

    // removal implementations at end
    this.removeMultiCompElement(entID, def, data, index);

    return self;
  }
  /*
   *
   *
   *		internal implementations of remove/delete operations
   * 		a bit hairy due to deferred cleanup, etc.
   *
   *
   */
  // remove given component from an entity
  private internalRemoveComponent(entID: EntityId, compName: ComponentName) {
    var def = this.components[compName];
    var data = this.storage[compName];

    // fail silently on all cases where removal target isn't present,
    // since multiple pieces of logic often remove/delete simultaneously
    var state = data.hash[entID];
    if (!state) return;

    // null out data now, so overlapped remove events won't fire
    data.remove(entID);

    // call onRemove handler - on each instance for multi components
    const onRemove = def.onRemove;
    if (onRemove) {
      if (def.multi) {
        state.forEach((state: unknown) => {
          if (state) onRemove(entID, state);
        });
        state.length = 0;
      } else {
        onRemove(entID, state);
      }
    }

    this.deferrals.removals.push(data);
    this.pingDeferrals();
  }
  // remove one state from a multi component
  private removeMultiCompElement<T extends Record<string, unknown>>(
    entID: EntityId,
    def: ComponentDefinition<T>,
    data: any,
    index: number,
  ) {
    // if statesArr isn't present there's no work or cleanup to do
    var statesArr = data.hash[entID];
    if (!statesArr) return;

    // as above, ignore cases where removal target doesn't exist
    var state = statesArr[index];
    if (!state) return;

    // null out element and fire event
    statesArr[index] = null;
    if (def.onRemove) def.onRemove(entID, state);

    this.deferrals.multiComps.push({ entID, data });
    this.pingDeferrals();
  }

  // rigging
  private pingDeferrals() {
    if (this.deferrals.timeout) return;
    this.deferrals.timeout = true;
    setTimeout(this.deferralHandler, 1);
  }
  private deferralHandler() {
    this.deferrals.timeout = false;
    this.doDeferredCleanup();
  }

  /*
   *
   *		general handling for deferred data cleanup
   * 			- removes null states if component is multi
   * 			- removes null entries from component dataStore
   * 		should be called at safe times - not during state loops
   *
   */
  private doDeferredCleanup() {
    if (this.deferrals.multiComps.length) {
      this.deferredMultiCompCleanup(this.deferrals.multiComps);
    }
    if (this.deferrals.removals.length) {
      this.deferredComponentCleanup(this.deferrals.removals);
    }
  }

  // removes null elements from multi-comp state arrays
  private deferredMultiCompCleanup(list: { entID: any; data: any }[]) {
    for (const { entID, data } of list) {
      var statesArr = data.hash[entID];
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
  private deferredComponentCleanup(list: any[]) {
    for (const data of list) {
      data.flush();
    }
    list.length = 0;
  }

  private convertCompDefnToFull<T extends Record<string, unknown>>(
    compDefn: PartialComponentDefinition<T>,
  ): ComponentDefinition<T> {
    return {
      name: compDefn.name,
      multi: compDefn.multi ?? false,
      order: compDefn.order ?? 99,
      stateConstructor: compDefn.stateConstructor ?? null,
      state: compDefn.state ?? {},
      onAdd: compDefn.onAdd ?? null,
      onRemove: compDefn.onRemove ?? null,
      system: compDefn.system ?? null,
      renderSystem: compDefn.renderSystem ?? null,
    };
  }
}
