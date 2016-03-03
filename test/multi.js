
var ECS = require('..')
var tape = require('tape')


tape('Multi component basics', function (t) {
    var ecs = new ECS()
    var id = ecs.createEntity()
    var normal = { name: 'normal' }
    var multi = { name: 'multi', multi: true }
    ecs.createComponent(normal)

    t.doesNotThrow(() => { ecs.createComponent(multi) }, 'create multi component')
    t.throws(() => { ecs.createComponent({ name: 'multi' }) }, 'overlapping multi/normal comps')
    t.throws(() => { ecs.createComponent({ name: 'normal', multi: true }) }, 'overlapping multi/normal comps')
    t.doesNotThrow(() => { ecs.removeComponent(id, multi.name) }, 'remove non-present multi comp')

    t.end()
})



tape('Multi component adding / removing', function (t) {
    var ecs = new ECS()
    var id = ecs.createEntity()
    var comp = {
        name: 'multi-component',
        state: { value: 37 },
        multi: true,
    }
    ecs.createComponent(comp)

    var result
    t.doesNotThrow(() => { result = ecs.getState(id, comp.name) }, 'getState on empty multi comp')
    t.ok(!result, 'getState returned falsey')

    t.doesNotThrow(() => { ecs.addComponent(id, comp.name) }, 'add multi comp')

    t.doesNotThrow(() => { result = ecs.getState(id, comp.name) }, 'getState on multi comp')
    t.ok(result, 'getState  returned truthy')
    t.equals(result.length, 1, 'getState an array[1]')
    t.equals(result[0].value, 37, 'getState returned default state')

    t.doesNotThrow(() => { ecs.removeComponent(id, comp.name) }, 'remove multi comp')

    t.doesNotThrow(() => { result = ecs.getState(id, comp.name) }, 'getState on empty multi comp')
    t.ok(!result, 'getState returned falsey')

    t.doesNotThrow(() => { ecs.addComponent(id, comp.name, { value: 2 }) }, 'add multi comp with state')
    t.doesNotThrow(() => { ecs.addComponent(id, comp.name, { value: 3 }) }, 'add multi comp with state')
    t.doesNotThrow(() => { result = ecs.getState(id, comp.name) }, 'getState on multi comp length 2')
    t.equals(result.length, 2, 'getState an array[2]')
    var values = result.map(o => o.value)
    t.ok(values.includes(2), 'getState array included state.value = 2')
    t.ok(values.includes(3), 'getState array included state.value = 3')


    t.end()
})


tape('Multi component remove by index', function (t) {
    var ecs = new ECS()
    var id = ecs.createEntity()
    var comp = {
        name: 'foo',
        state: { value: 37 },
        multi: true,
    }
    ecs.createComponent(comp)

    ecs.addComponent(id, 'foo', { value: 1 })
    ecs.addComponent(id, 'foo', { value: 5 })
    ecs.addComponent(id, 'foo', { value: 9 })

    var states = ecs.getState(id, 'foo')
    t.equals(states.length, 3, 'multi comp states list')

    t.doesNotThrow(() => { ecs.removeMultiComponent(id, 'foo', 1) }, 'removeMultiComp')
    t.doesNotThrow(() => { ecs.removeMultiComponent(id, 'foo', 1) }, 'remove same multi twice')
    t.false(ecs.getState(id, 'foo')[1], 'removeMultiComp')
    t.doesNotThrow(() => { ecs.tick() }, 'tick after removal')
    console.log('ticked')

    t.equals(ecs.getState(id, 'foo').length, 2, 'removal is complete')

    t.end()
})



tape('Multi component removal', function (t) {
    var ecs = new ECS()
    var id = ecs.createEntity()
    var comp = {
        name: 'multi-component',
        state: { value: 37 },
        multi: true,
    }
    ecs.createComponent(comp)
    for (var i = 0; i < 10; i++) ecs.addComponent(id, comp.name, { value: i })

    t.doesNotThrow(() => {
        ecs.removeMultiComponent(id, comp.name, 2)
        ecs.removeMultiComponent(id, comp.name, 6)
        ecs.removeMultiComponent(id, comp.name, 0)
        ecs.removeMultiComponent(id, comp.name, 8)
        ecs.removeMultiComponent(id, comp.name, 4)
    }, 'multi removal in mixed order')

    var states = ecs.getState(id, comp.name)
    var expected = [0, 1, 0, 1, 0, 1, 0, 1, 0, 1]
    expected.forEach((val, i) => {
        t.equals(!!val, !!states[i], 'multi state array after removals')
    })

    ecs.tick()
    var states2 = ecs.getState(id, comp.name)
    t.equals(5, states2.length, 'multi state array after tick')

    var expectedVals = [1, 3, 5, 7, 9]
    expectedVals.forEach((val, i) => {
        t.equals(val, states[i].value, 'multi state values after removals')
    })

    t.end()
})





tape('Multi-component overlapping removals', function (t) {
    var ecs = new ECS()
    var id = ecs.createEntity()
    var removes = 0
    var comp = {
        name: 'foo',
        state: { value: 37 },
        multi: true,
        onRemove: () => { removes++ },
    }
    ecs.createComponent(comp)
    for (var i = 0; i < 10; i++) ecs.addComponent(id, 'foo', { value: i })

    ecs.removeMultiComponent(id, 'foo', 2)
    ecs.removeMultiComponent(id, 'foo', 8)
    ecs.removeMultiComponent(id, 'foo', 5)
    t.equals(3, removes, 'multi comp onRemoves')
    t.doesNotThrow(() => { ecs.removeComponent(id, 'foo') }, 'remove comp after multi removes')
    t.equals(10, removes, 'multi comp onRemoves')
    t.doesNotThrow(() => { ecs.tick() }, 'tick after multi removes')


    ecs.addComponent(5, 'foo')
    ecs.addComponent(6, 'foo')
    ecs.addComponent(7, 'foo')
    t.doesNotThrow(() => { ecs.removeMultiComponent(7, 'foo', 0) }, 'index removal')
    t.doesNotThrow(() => { ecs.removeComponent(6, 'foo') }, 'regular removal')
    t.doesNotThrow(() => { ecs.removeComponent(5, 'foo') }, 'regular removal')
    t.doesNotThrow(() => { ecs.removeComponent(7, 'foo') }, 'regular removal')
    t.doesNotThrow(() => { ecs.tick() }, 'tick after redundant removals')

    ecs.addComponent(5, 'foo')
    ecs.addComponent(6, 'foo')
    ecs.addComponent(7, 'foo')
    t.doesNotThrow(() => { ecs.removeMultiComponent(6, 'foo', 0) }, 'index removal')
    t.doesNotThrow(() => { ecs.removeComponent(7, 'foo') }, 'regular removal')
    t.doesNotThrow(() => { ecs.removeComponent(6, 'foo') }, 'regular removal')
    t.doesNotThrow(() => { ecs.removeComponent(5, 'foo') }, 'regular removal')
    t.doesNotThrow(() => { ecs.tick() }, 'tick after redundant removals')

    ecs.addComponent(5, 'foo')
    ecs.addComponent(6, 'foo')
    ecs.addComponent(7, 'foo')
    t.doesNotThrow(() => { ecs.removeMultiComponent(5, 'foo', 0) }, 'index removal')
    t.doesNotThrow(() => { ecs.removeComponent(6, 'foo') }, 'regular removal')
    t.doesNotThrow(() => { ecs.removeComponent(7, 'foo') }, 'regular removal')
    t.doesNotThrow(() => { ecs.removeComponent(5, 'foo') }, 'regular removal')
    t.doesNotThrow(() => { ecs.tick() }, 'tick after redundant removals')


    t.end()
})




tape('Multi component systems', function (t) {
    var ecs = new ECS()
    var systemAccumulator = 0
    var renderAccumulator = 0
    var comp = {
        name: 'multi-component',
        state: { value: 0 },
        multi: true,
        system: function (dt, stateArrays) {
            systemAccumulator = 0
            for (var stateArr of stateArrays) {
                for (var state of stateArr) {
                    systemAccumulator += state.value
                }
            }
        },
        renderSystem: function (dt, stateArrays) {
            renderAccumulator = 0
            for (var stateArr of stateArrays) {
                for (var state of stateArr) {
                    renderAccumulator += state.value / 2
                }
            }
        },
    }

    var id = ecs.createEntity()
    ecs.createComponent(comp)

    ecs.addComponent(id, comp.name)
    ecs.addComponent(id, comp.name, { value: 37 })
    ecs.addComponent(id, comp.name, { value: 42 })
    ecs.addComponent(id, comp.name, { value: 17 })

    t.doesNotThrow(() => { ecs.tick(1) }, 'tick with multi comp')
    t.equals(systemAccumulator, 37 + 42 + 17, 'multi comp system works')

    t.doesNotThrow(() => { ecs.render(1) }, 'render with multi comp')
    t.equals(renderAccumulator, (37 + 42 + 17) / 2, 'multi comp renderSystem works')

    t.end()
})


