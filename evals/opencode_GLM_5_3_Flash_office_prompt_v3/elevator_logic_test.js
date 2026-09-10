// elevator_logic_test.js - deterministic, no-dependency Node tests for ElevatorLogic.
// Run with: node elevator_logic_test.js
const assert = require('assert');
const { ElevatorLogic } = require('./elevator_logic.js');

function newLogic() {
    return new ElevatorLogic({ floorCount: 6, maxCapacity: 4, floorHeight: 3.4 });
}

// advance the state machine until predicate() is true; throw after maxTicks
function tickUntil(elev, predicate, maxTicks) {
    const cap = maxTicks || 40000;
    for (let i = 0; i < cap; i++) {
        elev.tick(0.05);
        if (predicate()) return i;
    }
    throw new Error('tickUntil: condition not reached within ' + cap + ' ticks');
}

function runUntilDoorOpenAt(elev, floor, maxTicks) {
    tickUntil(elev, function () {
        return elev.state === 'DOOR_OPEN' && elev.currentFloor === floor;
    }, maxTicks);
}

function runUntilState(elev, state, maxTicks) {
    tickUntil(elev, function () { return elev.state === state; }, maxTicks);
}

function person(id) {
    return { id: id };
}

// Board one rider at floor 0 bound for `dest` and let the doors close.
function boardRiderFromLobby(elev, rider, dest) {
    elev.callUp(0);
    runUntilDoorOpenAt(elev, 0);
    const spot = elev.reserveBoardingSpot(rider);
    assert.ok(spot, 'expected a free boarding spot');
    elev.completeBoard(rider);
    elev.pressDestination(dest);
    tickUntil(elev, function () {
        return elev.state === 'MOVING' || elev.state === 'IDLE';
    });
}

const results = [];
function runTest(name, fn) {
    try {
        fn();
        results.push({ name: name, ok: true, error: null });
        console.log('PASS  ' + name);
    } catch (err) {
        results.push({ name: name, ok: false, error: err && err.message });
        console.log('FAIL  ' + name + ' :: ' + (err && err.message));
    }
}

// 1. Lobby rush with more callers than capacity
runTest('lobby rush: leftover lobby callers must not re-target floor 0', function () {
    const elev = newLogic();
    elev.callUp(0);
    runUntilDoorOpenAt(elev, 0);
    const riders = [];
    for (let i = 0; i < 4; i++) {
        const p = person('rider' + i);
        const spot = elev.reserveBoardingSpot(p);
        assert.ok(spot, 'spot ' + i + ' should be reservable');
        elev.completeBoard(p);
        elev.pressDestination(2 + i);
        riders.push(p);
    }
    assert.strictEqual(elev.currentCapacityFree(), 0, 'car should be full');
    const extra = person('waiter');
    assert.strictEqual(elev.reserveBoardingSpot(extra), null, 'fifth boarder must be refused');

    // leftover lobby waiters keep re-pressing UP while doors are open
    tickUntil(elev, function () {
        elev.callUp(0); // re-press every tick
        return elev.state === 'MOVING' || elev.state === 'IDLE';
    });
    assert.strictEqual(elev.state, 'MOVING', 'car should depart with riders aboard');
    assert.ok(elev.targetFloor > 0, 'next target must be above floor 0, got ' + elev.targetFloor);
    assert.notStrictEqual(elev.targetFloor, 0, 'must not re-open at floor 0');
});

// 2. Passenger destinations outrank same-floor hall calls
runTest('passenger destinations outrank same-floor hall calls', function () {
    const elev = newLogic();
    const a = person('a');
    const b = person('b');
    elev.callUp(0);
    runUntilDoorOpenAt(elev, 0);
    let spot = elev.reserveBoardingSpot(a);
    assert.ok(spot);
    elev.completeBoard(a);
    elev.pressDestination(3);
    spot = elev.reserveBoardingSpot(b);
    assert.ok(spot);
    elev.completeBoard(b);
    elev.pressDestination(5);
    runUntilState(elev, 'MOVING');

    // arrive at floor 3 (nearest destination), rider a disembarks
    runUntilDoorOpenAt(elev, 3);
    assert.strictEqual(elev.currentFloor, 3);
    elev.registerDisembark(a);
    elev.completeDisembark(a);
    // same-floor hall call while the doors are open and rider b is aboard
    elev.callUp(3);
    tickUntil(elev, function () { return elev.state === 'MOVING'; });
    assert.strictEqual(elev.targetFloor, 5,
        'door-close target must be the passenger destination (5), not a reopen of floor 3');
    assert.ok(elev.passengers.has(b), 'rider b must still be aboard');
});

// 3. Repeated hall-call pressing cannot starve riders
runTest('repeated hall calls cannot starve riders with destinations', function () {
    const elev = newLogic();
    const rider = person('starve-me');
    boardRiderFromLobby(elev, rider, 5);
    // keep hammering callUp(0) while the car carries the rider upward
    tickUntil(elev, function () {
        elev.callUp(0);
        elev.callUp(0);
        return elev.currentFloor === 5 && elev.state === 'DOOR_OPEN';
    }, 60000);
    assert.strictEqual(elev.currentFloor, 5, 'rider destination floor 5 must be reached');
    assert.ok(elev.destinations.size === 0, 'destination should be cleared on arrival');
});

// 4. Opposite-direction calls wait their turn
runTest('down call below must not reverse an upward car', function () {
    const elev = newLogic();
    const rider = person('up-rider');
    elev.callUp(0);
    runUntilDoorOpenAt(elev, 0);
    const spot = elev.reserveBoardingSpot(rider);
    assert.ok(spot);
    elev.completeBoard(rider);
    elev.pressDestination(4);
    runUntilState(elev, 'MOVING');
    // someone downstairs calls DOWN while the car is heading up with work above
    elev.callDown(2);
    // the very first door-open must be at floor 4, not at floor 2
    runUntilDoorOpenAt(elev, 4);
    assert.strictEqual(elev.currentFloor, 4,
        'upward destination must be served before the lower down-call');
    elev.registerDisembark(rider);
    elev.completeDisembark(rider);
    // after serving the up work the car may now come back for the down call
    tickUntil(elev, function () { return elev.currentFloor === 2; }, 60000);
});

// 5. Door hold and safety cap
runTest('doors hold for pending boarders, but MAX cap closes them', function () {
    const elev = newLogic();
    elev.callUp(0);
    runUntilDoorOpenAt(elev, 0);
    const p = person('never-boards');
    const spot = elev.reserveBoardingSpot(p);
    assert.ok(spot, 'reserve should succeed');
    // past MIN open time, doors must still be held by pendingBoarders
    let t = 0;
    while (t < 3.0) { elev.tick(0.05); t += 0.05; }
    assert.strictEqual(elev.state, 'DOOR_OPEN',
        'doors must remain open while pendingBoarders is non-empty after MIN open time');
    // past MAX open time they must close no matter what
    let elapsed = 0;
    while (elapsed < elev.minDoorOpenS + elev.maxDoorOpenS + 2 && elev.state === 'DOOR_OPEN') {
        elev.tick(0.05);
        elapsed += 0.05;
    }
    assert.notStrictEqual(elev.state, 'DOOR_OPEN', 'MAX_DOOR_OPEN_S must force the doors closed');
    // let the closing sweep finish, then verify the self-healing cleanup
    tickUntil(elev, function () {
        return elev.state === 'MOVING' || elev.state === 'IDLE';
    });
    assert.strictEqual(elev.pendingBoarders.size, 0,
        'abandoned boarder reservations must be dropped at door close');
    assert.ok(elev.spotOccupancy.every(function (s) { return !s; }),
        'abandoned boarding spot must be released');
});

// 6. Destination preserved across the action handshake
runTest('rider from floor 0 to floor 5 arrives at 5, not 1', function () {
    const elev = newLogic();
    const rider = person('commuter');
    // WAIT_AT_PANEL -> ENTER_ELEVATOR -> PRESS_FLOOR -> WAIT_FOR_FLOOR
    elev.callUp(0);
    runUntilDoorOpenAt(elev, 0);
    assert.ok(elev.isAcceptingAt(0, 1), 'car should accept an up caller at floor 0');
    const spot = elev.reserveBoardingSpot(rider);
    assert.ok(spot, 'boarding spot expected');
    elev.completeBoard(rider);
    assert.ok(elev.passengers.has(rider), 'rider is a passenger after completeBoard');
    elev.pressDestination(5); // the exact destination from the plan, not floor + 1
    assert.ok(elev.destinations.has(5), 'destination 5 must be registered');
    runUntilDoorOpenAt(elev, 5);
    assert.strictEqual(elev.currentFloor, 5, 'car must arrive at the pressed floor 5');
    assert.strictEqual(elev.destinations.size, 0, 'arrival clears the destination');
    elev.registerDisembark(rider);
    elev.completeDisembark(rider);
    assert.strictEqual(elev.passengers.size, 0, 'rider left the car');
});

// 7. Reset clears phantom state
runTest('reset clears calls, riders, pendings, spots, and timers', function () {
    const elev = newLogic();
    const a = person('a');
    const b = person('b');
    elev.callUp(0);
    runUntilDoorOpenAt(elev, 0);
    elev.reserveBoardingSpot(a);
    elev.completeBoard(a);
    elev.pressDestination(4);
    const bSpot = elev.reserveBoardingSpot(b);
    assert.ok(bSpot);
    elev.registerDisembark(person('ghost'));
    assert.ok(elev.upCalls.size > 0 || elev.downCalls.size > 0 || elev.destinations.size > 0);
    elev.reset();
    assert.strictEqual(elev.state, 'IDLE');
    assert.strictEqual(elev.currentFloor, 0);
    assert.strictEqual(elev.targetFloor, 0);
    assert.strictEqual(elev.direction, 0);
    assert.strictEqual(elev.yPosition, 0);
    assert.strictEqual(elev.doorOpenAmount, 0);
    assert.strictEqual(elev.upCalls.size, 0);
    assert.strictEqual(elev.downCalls.size, 0);
    assert.strictEqual(elev.destinations.size, 0);
    assert.strictEqual(elev.passengers.size, 0);
    assert.strictEqual(elev.pendingBoarders.size, 0);
    assert.strictEqual(elev.pendingDisembark.size, 0);
    assert.ok(elev.spotOccupancy.every(function (s) { return s === false; }));
    assert.strictEqual(elev.passengerSpots.size, 0);
    assert.strictEqual(elev.doorOpenTimer, 0);
});

console.log('');
const passed = results.filter(function (r) { return r.ok; }).length;
const failed = results.length - passed;
console.log('==== ' + passed + ' passed, ' + failed + ' failed ====');
process.exit(failed > 0 ? 1 : 0);
