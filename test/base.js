
var ECS = require('..')
var tape = require('tape')


tape('Instantiation', function (t) {
	var ecs

	t.doesNotThrow(function () { ecs = new ECS() }, 'instantiation')
	t.ok(ecs, 'ecs created')

	t.end()
})



tape('Entities', function (t) {
	var ecs = new ECS()

	var id1, id2
	t.doesNotThrow(() => { id1 = ecs.createEntity() }, 'create entity 1')
	t.doesNotThrow(() => { id2 = ecs.createEntity() }, 'create entity 2')
	t.assert(id1 !== id2, 'entity ids are different')

	t.doesNotThrow(() => { ecs.deleteEntity(id1) }, 'delete entity')
	t.doesNotThrow(() => { ecs.deleteEntity(id1) }, 're-delete entity')
	t.doesNotThrow(() => { ecs.deleteEntity(123) }, 'delete non-existent entity')

	var id3
	var comp = { name: 'foo' }
	t.doesNotThrow(() => { ecs.createComponent(comp) }, 'create a component')
	t.doesNotThrow(() => { id3 = ecs.createEntity(['foo']) }, 'create entity with comp list')
	t.doesNotThrow(() => { id3 = ecs.createEntity([]) }, 'create entity with empty comp list')
	t.throws(() => { ecs.createEntity(['bar']) }, 'create entity with bad comp name')
	t.doesNotThrow(() => { ecs.deleteEntity(id3) }, 'delete entity with comp')
	t.doesNotThrow(() => { ecs.deleteEntity(id3) }, 'delete entity again')

	t.end()
})



tape('Chaining', function (t) {
	var ecs = new ECS()
	var id = ecs.createEntity()
	ecs.createComponent({ name: 'foo' })

	t.equals(ecs, ecs.addComponent(id, 'foo'), 'chainable addComponent')
	t.equals(ecs, ecs.removeComponent(id, 'foo'), 'chainable removeComponent')
	t.equals(ecs, ecs.deleteComponent('foo'), 'chainable deleteComponent')
	t.equals(ecs, ecs.deleteEntity(id), 'chainable deleteEntity')
	t.equals(ecs, ecs.tick(), 'chainable tick')
	t.equals(ecs, ecs.render(), 'chainable render')

	t.end()
})



