
var DataStore = require('../src/dataStore')
var tape = require('tape')


tape('DataStore basics', function (t) {
    var data

    t.doesNotThrow(() => { data = new DataStore() }, 'create dataStore')
    t.doesNotThrow(() => { data.add(1, { __id: 1 }) }, 'add to dataStore')
    t.doesNotThrow(() => { data.remove(1) }, 'remove from dataStore')

    var obj = {}
    data.add(2, obj)
    t.assert(data.hash[2] === obj)
    t.assert(data.list.indexOf(obj) > -1)

    data.remove(2)
    t.false(data.hash[2])
    t.assert(data.list.indexOf(obj) === -1)

    t.end()
})



tape('DataStore consistency', function (t) {
    var data = new DataStore()
    var iterateEvery = (every, fn) => {
        for (var i = 0; i < 20; i++) if (i % every === 0) fn(i)
    }
    var objs = []
    var flags = []
    iterateEvery(1, i => objs.push({ __id: i }))

    // add ids to data, then remove every 2nd, re-add every 4th, etc..
    iterateEvery(1, i => { flags[i] = true; data.add(i, objs[i]) })
    iterateEvery(2, i => { flags[i] = false; data.remove(i) })
    iterateEvery(4, i => { flags[i] = true; data.add(i, objs[i]) })
    iterateEvery(8, i => { flags[i] = false; data.remove(i) })
    iterateEvery(16, i => { flags[i] = true; data.add(i, objs[i]) })

    // check results
    var hashOk = true
    var listOk = true
    iterateEvery(1, i => {
        var shouldBePresent = flags[i]
        var hashPresent = (data.hash[i] === objs[i])
        var listPresent = (data.list.indexOf(objs[i]) > -1)
        if (hashPresent !== shouldBePresent) hashOk = false
        if (listPresent !== shouldBePresent) hashOk = false
    })
    t.assert(hashOk, 'Hash consistent after adds/removals')
    t.assert(listOk, 'List consistent after adds/removals')

    // more the same, but with flushing
    data.flush()
    iterateEvery(1, i => { flags[i] = true; data.add(i, objs[i]) })
    iterateEvery(2, i => { flags[i] = false; data.remove(i) })
    iterateEvery(4, i => { flags[i] = true; data.add(i, objs[i]) })
    data.flush()
    iterateEvery(8, i => { flags[i] = false; data.remove(i) })
    iterateEvery(7, i => { flags[i] = false; data.remove(i) })
    iterateEvery(9, i => { flags[i] = true; data.add(i, objs[i]) })


    hashOk = true
    listOk = true
    iterateEvery(1, i => {
        var shouldBePresent = flags[i]
        var hashPresent = (data.hash[i] === objs[i])
        var listPresent = (data.list.indexOf(objs[i]) > -1)
        if (hashPresent !== shouldBePresent) hashOk = false
        if (listPresent !== shouldBePresent) hashOk = false
    })
    t.assert(hashOk, 'Hash consistent after adds/removal/flush')
    t.assert(listOk, 'List consistent after adds/removal/flush')

    t.end()
})



