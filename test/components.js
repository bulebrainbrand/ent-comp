
var ECS = require('..')
var tape = require('tape')



tape('Creating and deleting components', function (t) {
	var comp = { name: 'foo' }
	var ecs = new ECS()

	t.throws(() => { ecs.createComponent() }, 'Component missing def')
	t.throws(() => { ecs.createComponent({}) }, 'Component missing name')
	t.throws(() => { ecs.createComponent({ name: null }) }, 'Bad component names')
	t.throws(() => { ecs.createComponent({ name: '' }) }, 'Comp with invlalid name')
	t.throws(() => { ecs.createComponent({ name: 5 }) }, 'Comp with invlalid name')
	t.throws(() => { ecs.createComponent({ name: true }) }, 'Comp with invlalid name')
	t.throws(() => { ecs.createComponent({ name: {} }) }, 'Comp with invlalid name')

	t.throws(() => { ecs.deleteComponent() }, 'Delete comp with bad data')
	t.throws(() => { ecs.deleteComponent('foo') }, 'Delete non-existent comp')

	var result
	t.doesNotThrow(() => { result = ecs.createComponent(comp) }, 'create component')
	t.equals(result, comp.name, 'createComponent returns name')
	t.throws(() => { ecs.createComponent(comp) }, 're-create component')

	t.ok(ecs.components[comp.name], 'component exists')
	t.ok(ecs.comps[comp.name], 'comps alias works')
	t.equals(comp.name, ecs.components[comp.name].name, 'aliases work')
	t.equals(comp.name, ecs.comps[comp.name].name, 'aliases work')

	t.throws(() => { ecs.deleteComponent('blah') }, 'bad delete comp')
	t.throws(() => { ecs.deleteComponent(comp) }, 'cannot delete by object')
	t.doesNotThrow(() => { ecs.deleteComponent(comp.name) }, 'deleteComponent by name')
	t.false(ecs.comps[comp.name], 'component now deleted')

	t.end()
})



tape('Adding and removing components', function (t) {
	var comp = { name: 'foo' }
	var ecs = new ECS()
	ecs.createComponent(comp)
	var id = ecs.createEntity()

	t.throws(() => { ecs.addComponent() }, 'bad addComp')
	t.throws(() => { ecs.addComponent(37) }, 'bad addComp')
	t.throws(() => { ecs.addComponent(37, 'bar') }, 'bad addComp')
	t.doesNotThrow(() => { ecs.addComponent(id, 'foo') }, 'valid addComp')
	t.throws(() => { ecs.addComponent(id, 'foo') }, 'addComp twice')

	t.throws(() => { ecs.removeComponent() }, 'bad removeComp calls')
	t.throws(() => { ecs.removeComponent(id) }, 'bad removeComp calls')
	t.throws(() => { ecs.removeComponent(id, 'bar') }, 'removeComp on bad component')
	t.doesNotThrow(() => { ecs.removeComponent(id, 'foo') }, 'removeComp')
	t.doesNotThrow(() => { ecs.removeComponent(id, 'foo') }, 're-removeComp')
	t.doesNotThrow(() => { ecs.removeComponent(123, 'foo') }, 'removeComp on entity without it')

	var id2 = ecs.createEntity()
	t.doesNotThrow(() => { ecs.addComponent(id2, 'foo', { foo: 1 }) }, 'addComp with state')
	t.throws(() => { ecs.addComponent(id2, 'foo', { foo: 1 }) }, 're-addComp with state')
	t.throws(() => { ecs.addComponent(id2, 'foo') }, 're-addComp with w/o state')
	t.doesNotThrow(() => { ecs.removeComponent(id2, comp.name) }, 'remove w/state')
	t.doesNotThrow(() => { ecs.removeComponent(id2, comp.name) }, 're-remove')

	t.end()
})



tape('Testing and getting component state', function (t) {
	var comp1 = { name: 'foo' }
	var comp2 = { name: 'bar', state: { val: 1 } }
	var ecs = new ECS()
	ecs.createComponent(comp1)
	ecs.createComponent(comp2)

	t.throws(() => { ecs.hasComponent() }, 'bad hasComp')
	t.throws(() => { ecs.hasComponent(1) }, 'bad hasComp')
	t.throws(() => { ecs.hasComponent(1, 'hoge') }, 'bad hasComp')
	t.doesNotThrow(() => { ecs.hasComponent(1, 'foo') }, 'valid hasComp')
	t.doesNotThrow(() => { ecs.hasComponent(123, 'bar') }, 'valid hasComp')

	var id1 = ecs.createEntity(['foo'])
	var id2 = ecs.createEntity(['bar'])
	var id3 = ecs.createEntity()
	t.true(ecs.hasComponent(id1, 'foo'), 'hasComp correctness')
	t.true(ecs.hasComponent(id2, 'bar'), 'hasComp correctness')
	t.false(ecs.hasComponent(id2, 'foo'), 'hasComp correctness')
	t.false(ecs.hasComponent(id1, 'bar'), 'hasComp correctness')
	t.false(ecs.hasComponent(id3, 'foo'), 'hasComp correctness')
	t.false(ecs.hasComponent(id3, 'bar'), 'hasComp correctness')
	t.false(ecs.hasComponent(123, 'foo'), 'hasComp correctness')
	t.false(ecs.hasComponent(123, 'bar'), 'hasComp correctness')

	t.throws(() => { ecs.getState() }, 'bad getState')
	t.throws(() => { ecs.getState(1) }, 'bad getState')
	t.throws(() => { ecs.getState(1, 'hoge') }, 'bad getState')
	t.doesNotThrow(() => { ecs.getState(1, 'foo') }, 'valid getState')
	t.doesNotThrow(() => { ecs.getState(2, 'bar') }, 'valid getState')
	t.doesNotThrow(() => { ecs.getState(3, 'foo') }, 'getState on entity without comp')
	t.doesNotThrow(() => { ecs.getState(3, 'bar') }, 'getState on entity without comp')
	t.true(ecs.getState(1, 'foo'), 'getState result')
	t.true(ecs.getState(2, 'bar'), 'getState result')
	t.false(ecs.getState(3, 'foo'), 'getState result on entity without comp')
	t.false(ecs.getState(3, 'bar'), 'getState result on entity without comp')

	t.end()
})



tape('Component state data', function (t) {
	var comp = {
		name: 'foo',
		state: {
			num: 1,
			str: 'hoge',
			arr: [1, 2, 3],
			fcn: () => { },
			obj: {
				num: 2
			},
		}
	}
	var ecs = new ECS()
	ecs.createComponent(comp)
	var id = ecs.createEntity()
	ecs.addComponent(id, comp.name)

	t.throws(() => { ecs.getState() })
	t.throws(() => { ecs.getState(id + 37) })
	var state
	t.doesNotThrow(() => { state = ecs.getState(id + 37, comp.name) }, 'getState is okay with bad entity')
	t.equals(state, undefined, 'getState with bad entity is undefined')


	t.doesNotThrow(() => { state = ecs.getState(id, comp.name) }, 'getState')
	t.ok(state, 'state returned')
	t.equals(state.num, comp.state.num, 'state property num')
	t.equals(state.str, comp.state.str, 'state property str')
	t.equals(state.arr, comp.state.arr, 'state property arr')
	t.equals(state.fcn, comp.state.fcn, 'state property fcn')
	t.equals(state.obj.num, comp.state.obj.num, 'state deep property')
	t.equals(state.__id, id, '__id property inserted')
	state.num = 37
	t.equals(ecs.getState(id, comp.name).num, 37, 'state is remembered')
	t.equals(comp.state.num, 1, 'definition state not overwritten')

	ecs.removeComponent(id, comp.name, true)
	t.false(ecs.getState(id, comp.name), 'getState falsey after removing component')

	// passing in initial state
	var id2 = ecs.createEntity()
	ecs.addComponent(id2, comp.name, {
		num: 4,
		newnum: 5,
		obj: {
			num: 6
		}
	})
	var state2 = ecs.getState(id2, comp.name)
	t.equals(state2.num, 4, 'overwritten property')
	t.equals(state2.newnum, 5, 'overwritten new property')
	t.equals(state2.obj.num, 6, 'overwritten deep property')

	t.end()
})





tape('Component test/state after adds and removes', function (t) {
	var comp1 = { name: 'foo', state: { num: -1 } }
	var comp2 = { name: 'bar', state: { num: -1 } }
	var ecs = new ECS()
	ecs.createComponent(comp1)
	ecs.createComponent(comp2)

	var curr = { foo: {}, bar: {} }
	var setComps = (name, add, arr) => arr.forEach(id => {
		if (add) ecs.addComponent(id, name, { num: id * 2 })
		if (!add) ecs.removeComponent(id, name)
		curr[name][id] = !!add
	})
	t.doesNotThrow(() => {
		setComps('foo', true, [1, 2, 3, 4, 5, 6])
		setComps('foo', false, [5, 3, 1])
		setComps('bar', true, [1, 3, 5,])
		setComps('bar', false, [3])
		setComps('foo', true, [3, 1])
		setComps('bar', true, [2, 4, 6])
		setComps('foo', false, [6, 2])
		setComps('bar', false, [5, 4, 1])
		setComps('foo', true, [2, 5])
		setComps('bar', true, [4, 3])
	}, 'test setup')

	for (var name of ['foo', 'bar']) {
		for (var i = 1; i < 7; i++) {
			var expected = curr[name][i]
			t.equals(expected, ecs.hasComponent(i, name), 'hasComp correctness')
			if (expected) {
				t.equals(i * 2, ecs.getState(i, name).num, 'getState correctness')
				t.equals(i, ecs.getState(i, name).__id, 'getState correctness')
			} else {
				t.false(ecs.getState(i, name), 'getState correctness')
			}
		}
	}

	t.end()
})




tape('Component states list', function (t) {
	var ecs = new ECS()
	t.throws(() => { ecs.getStatesList() }, 'bad getStatesList')
	t.throws(() => { ecs.getStatesList('foo') }, 'bad getStatesList')

	var comp = {
		name: 'foo',
		state: { num: 23 }
	}
	ecs.createComponent(comp)
	var arr
	t.doesNotThrow(() => { arr = ecs.getStatesList(comp.name) }, 'getStatesList without entities')
	t.ok(arr, 'getStatesList result')
	t.equals(arr.length, 0, 'getStatesList zero entities')

	var id = ecs.createEntity()
	ecs.addComponent(id, comp.name)
	t.doesNotThrow(() => { arr = ecs.getStatesList(comp.name) }, 'getStatesList with entities')
	t.ok(arr, 'getStatesList result')
	t.equals(arr.length, 1, 'getStatesList entities')
	t.equals(arr[0].num, 23, 'getStatesList state data')

	t.end()
})


tape('Component state accessor', function (t) {
	var ecs = new ECS()
	t.throws(() => { ecs.getStateAccessor() }, 'bad state accessor name')
	t.throws(() => { ecs.getStateAccessor('foo') }, 'bad accessor name')

	var comp = {
		name: 'foo',
		state: { num: 23 }
	}
	ecs.createComponent(comp)
	var accessor
	t.doesNotThrow(() => { accessor = ecs.getStateAccessor(comp.name) }, 'create accessor')
	var state
	t.doesNotThrow(() => { state = accessor() }, 'accessor with bad entity')
	t.equals(state, undefined, 'bad entity returns undefined state')
	t.doesNotThrow(() => { state = accessor(123) }, 'accessor with bad entity')
	t.equals(state, undefined, 'bad entity returns undefined state')

	var id = ecs.createEntity()
	ecs.addComponent(id, comp.name)
	t.doesNotThrow(() => { state = accessor(id) }, 'accessor with correct entity')
	t.ok(state, 'state object from accessor')
	t.equals(state.num, 23, 'state property from accessor')

	t.end()
})


tape('hasComponent accessor', function (t) {
	var ecs = new ECS()
	t.throws(() => { ecs.getComponentAccessor() }, 'bad Comp accessor name')
	t.throws(() => { ecs.getComponentAccessor('foo') }, 'bad accessor name')

	var comp = { name: 'foo' }
	ecs.createComponent(comp)
	var accessor
	t.doesNotThrow(() => { accessor = ecs.getComponentAccessor(comp.name) }, 'create Has accessor')
	var has
	t.doesNotThrow(() => { has = accessor() }, 'accessor with no entity')
	t.equals(has, false, 'has == false for bad identity')
	t.doesNotThrow(() => { has = accessor(123) }, 'accessor with bad entity')
	t.equals(has, false, 'has == false for bad identity')

	var id = ecs.createEntity()
	ecs.addComponent(id, comp.name)
	t.doesNotThrow(() => { has = accessor(id) }, 'accessor with real entity')
	t.ok(has, 'correct result from accessor')

	t.end()
})



tape('Complex state objects', function (t) {
	var ecs = new ECS()

	var comp = {
		name: 'foo',
		state: {
			primitive: 1,
			obj: {}
		}
	}
	ecs.createComponent(comp)

	var id1 = ecs.createEntity([comp.name])
	var id2 = ecs.createEntity([comp.name])
	var state1 = ecs.getState(id1, comp.name)
	var state2 = ecs.getState(id2, comp.name)
	state2.primitive = 2

	t.notEquals(state1.primitive, state2.primitive, 'State properties - primitives')
	t.equals(state1.obj, state2.obj, 'State properties - objects')
	state1.obj.foo = 1
	t.equals(state2.obj.foo, 1) // !!!

	t.end()
})




tape('State param has __id property', function (t) {
	var ecs = new ECS()

	var comp = {
		name: 'foo',
		state: {}
	}
	ecs.createComponent(comp)

	var id = ecs.createEntity()
	ecs.addComponent(id, comp.name, { __id: 6666 })
	var state = ecs.getState(id, comp.name)

	t.equals(state.__id, id, 'State has correct __id')
	t.notEquals(state.__id, 6666, 'State throws away passed in __id')

	t.end()
})





tape('Overwrite a component', function (t) {
	var ecs = new ECS()
	var myEntity = 1

	ecs.createComponent({
		name: 'foo',
		state: { aaa: 0 },
	})
	ecs.addComponent(myEntity, 'foo')
	
	t.equals(ecs.getState(myEntity, 'foo').counter, 0)
	ecs.getState(myEntity, 'foo').aaa = 123

	ecs.overwriteComponent('foo', {
		name: 'foo',
		state: { bbb: 456 },
	})
	var state = ecs.getState(myEntity, 'foo')

	t.equals(state.counter, 123)
	t.equals(state.hello, 456)

	t.end()
})





