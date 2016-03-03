
var ECS = require('..')
var tape = require('tape')


tape('Component onAdd events', function (t) {
	var called = false
	var obj = {}
	var comp = {
		name: 'foo',
		onAdd: function (eid, state) {
			called = true
			obj.id = eid
			obj.num = state.num
		}
	}
	var ecs = new ECS()
	ecs.createComponent(comp)
	var id = ecs.createEntity()

	t.doesNotThrow(() => {
		ecs.addComponent(id, comp.name, { num: 2 })
	}, 'addComponent with onAdd')
	t.ok(called, 'onAdd called')
	t.equals(obj.id, id, 'onAdd id argument')
	t.equals(obj.num, 2, 'onAdd state argument')

	t.end()
})

tape('Component onRemove events', function (t) {
	var called = false
	var obj = {}
	var comp = {
		name: 'foo',
		onRemove: function (eid, state) {
			called = true
			obj.id = eid
			obj.num = state.num
		}
	}
	var ecs = new ECS()
	ecs.createComponent(comp)
	var id = ecs.createEntity()
	ecs.addComponent(id, comp.name, { num: 2 })

	ecs.removeComponent(id, comp.name)
	t.true(called, 'onRemove called')
	t.equals(obj.id, id, 'onRemove id argument')
	t.equals(obj.num, 2, 'onRemove state argument')

	called = false
	t.doesNotThrow(() => { ecs.removeComponent(id, comp.name) }, 're-remove')
	t.false(called, 'onRemove not called after re-removal')

	var id2 = ecs.createEntity(['foo'])
	ecs.deleteEntity(id2)
	t.true(called, 'onRemove called when entity deleted')
	called = false
	ecs.deleteEntity(id2)
	t.false(called, 'onRemove not called when entity re-deleted')

	t.end()
})

tape('Component event cases', function (t) {
	var added = 0
	var removed = 0
	var comp = {
		name: 'foo',
		onAdd: function (eid, state) { added++ },
		onRemove: function (eid, state) { removed++ }
	}
	var ecs = new ECS()
	ecs.createComponent(comp)

	var id1 = ecs.createEntity()
	t.equals(added, 0)
	ecs.createEntity([comp.name])
	t.equals(added, 1)
	ecs.addComponent(id1, comp.name)
	t.equals(added, 2)
	t.throws(() => { ecs.addComponent(id1, comp.name) })
	t.equals(added, 2)

	t.equals(removed, 0)
	ecs.removeComponent(id1, comp.name)
	t.equals(removed, 1)
	ecs.addComponent(id1, comp.name)
	ecs.deleteEntity(id1)
	t.equals(removed, 2, 'comp onRemove fired when entity deleted')
	ecs.deleteComponent(comp.name)
	t.equals(removed, 3, 'comp onRemove fired when component deleted')

	t.end()
})



tape('Component onRemove overlaps', function (t) {
	var fooCalls = 0
	var barCalls = 0
	var ecs = new ECS()
	ecs.createComponent({
		name: 'foo',
		onRemove: (id) => {
			fooCalls++
			ecs.deleteEntity(id)
			ecs.removeComponent(id, 'foo')
		}
	})
	ecs.createComponent({
		name: 'bar',
		onRemove: (id) => {
			barCalls++
			ecs.removeComponent(id, 'foo')
			ecs.deleteEntity(id)
		}
	})

	var id1 = ecs.createEntity(['foo', 'bar'])
	t.equals(fooCalls, 0, 'test setup')
	t.equals(barCalls, 0, 'test setup')
	t.doesNotThrow(() => ecs.deleteEntity(id1), 'deleteEntity with overlapping removes')
	t.equals(fooCalls, 1, 'onRemove called exactly once')
	t.equals(barCalls, 1, 'onRemove called exactly once')

	var id2 = ecs.createEntity(['foo', 'bar'])
	t.doesNotThrow(() => ecs.removeComponent(id2, 'foo'), 'removeComp with overlapping removes')
	t.equals(fooCalls, 2, 'onRemove called exactly once')
	t.equals(barCalls, 2, 'onRemove called exactly once')

	var id3 = ecs.createEntity(['foo', 'bar'])
	t.doesNotThrow(() => ecs.removeComponent(id3, 'bar'), 'removeComp with overlapping removes')
	t.equals(fooCalls, 3, 'onRemove called exactly once')
	t.equals(barCalls, 3, 'onRemove called exactly once')

	t.end()
})



tape('Systems', function (t) {
	var obj = {}
	var comp = {
		name: 'foo',
		state: { num: 5 },
		system: function (dt, states) {
			obj.dt = dt
			obj.ct = states.length
			obj.total = 0
			obj.name = this.name
			for (var i = 0; i < states.length; i++) obj.total += states[i].num
		},
		renderSystem: function (dt, states) {
			obj.rdt = dt
			obj.rct = states.length
			obj.rtotal = 0
			obj.rname = this.name
			for (var i = 0; i < states.length; i++) obj.rtotal += states[i].num
		}
	}
	var ecs = new ECS()
	t.doesNotThrow(() => { ecs.tick() }, 'tick with no components')
	t.doesNotThrow(() => { ecs.tick(123) })
	t.doesNotThrow(() => { ecs.render() }, 'render with no components')
	t.doesNotThrow(() => { ecs.render(123) })

	ecs.createComponent(comp)
	t.doesNotThrow(() => { ecs.tick() }, 'system with no entities')
	t.doesNotThrow(() => { ecs.tick(123) })
	t.true(obj.dt, 'system fires with no entities')
	t.equals(obj.name, comp.name, 'system executes in context of definition')

	var id1 = ecs.createEntity([comp.name])
	ecs.tick(37)
	t.equals(obj.dt, 37, 'system properties')
	t.equals(obj.ct, 1)
	t.equals(obj.total, 5)

	ecs.createEntity([comp.name])
	ecs.tick(38)
	t.equals(obj.dt, 38, 'system properties')
	t.equals(obj.ct, 2)
	t.equals(obj.total, 10)

	ecs.removeComponent(id1, comp.name, true)
	ecs.render(39)
	t.equals(obj.rdt, 39, 'renderSystem properties')
	t.equals(obj.rct, 1)
	t.equals(obj.rtotal, 5)
	t.true(obj.rdt, 'render system fires with no entities')
	t.equals(obj.rname, comp.name, 'system executes in context of definition')

	t.end()
})




tape('System order', function (t) {
	var systemEvents = []
	var renderEvents = []
	var ecs = new ECS()
	var comp1 = {
		name: 'comp1',
		order: 1,
		system: () => { systemEvents.push(1) },
		renderSystem: () => { renderEvents.push(1) },
	}
	var comp2 = {
		name: 'comp2',
		order: 2,
		system: () => { systemEvents.push(2) },
		renderSystem: () => { renderEvents.push(2) },
	}
	var comp3 = {
		name: 'comp3',
		order: 3,
		system: () => { systemEvents.push(3) },
		renderSystem: () => { renderEvents.push(3) },
	}

	function check(res) {
		var str = res.join()
		ecs.tick()
		t.equals(systemEvents.join(), str, 'systems order: ' + str)
		ecs.render()
		t.equals(renderEvents.join(), str, 'render systems order: ' + str)
		systemEvents.length = 0
		renderEvents.length = 0
	}

	ecs.createComponent(comp2)
	ecs.createComponent(comp3)
	check([2, 3])

	ecs.createComponent(comp1)
	check([1, 2, 3])

	ecs.deleteComponent(comp2.name)
	check([1, 3])

	ecs.deleteComponent(comp1.name)
	ecs.createComponent(comp2)
	check([2, 3])

	ecs.createComponent(comp1)
	ecs.deleteComponent(comp2.name)
	ecs.deleteComponent(comp3.name)
	ecs.createComponent(comp3)
	ecs.createComponent(comp2)
	check([1, 2, 3])

	t.end()
})






