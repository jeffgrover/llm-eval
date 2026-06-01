const assert = require('assert');
const { ElevatorLogic } = require('./elevator_logic.js');

const DT = 0.05;
const MAX_TICKS = 5000;

function tickUntil(logic, predicate, label) {
    for (let i = 0; i < MAX_TICKS; i++) {
        if (predicate(logic)) return i;
        logic.tick(DT);
    }
    throw new Error('tickUntil timeout: ' + label);
}

function runUntilDoorOpenAt(logic, floor) {
    tickUntil(logic, (l) => l.state === 'DOOR_OPEN' && l.currentFloor === floor,
              'door open at floor ' + floor);
}

function runUntilDoorClosed(logic) {
    tickUntil(logic, (l) => l.doorProgress === 0 && (l.state === 'IDLE' || l.state === 'MOVING'),
              'door closed and state advanced');
}

function runUntilFloor(logic, floor) {
    tickUntil(logic, (l) => l.currentFloor === floor && (l.state === 'DOOR_OPENING' || l.state === 'DOOR_OPEN' || l.state === 'DOOR_CLOSING' || l.state === 'IDLE'),
              'arrived at floor ' + floor);
}

function makePerson(name) { return { name: name }; }

let pass = 0, fail = 0;
function test(name, fn) {
    try {
        fn();
        console.log('  PASS  ' + name);
        pass++;
    } catch (e) {
        console.log('  FAIL  ' + name);
        console.log('    ' + e.message);
        fail++;
    }
}

console.log('elevator_logic_test.js\n');

test('1. Lobby rush: full car leaves floor 0 toward destinations, not stuck on callUp(0)', () => {
    const e = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    e.callUp(0);
    runUntilDoorOpenAt(e, 0);

    const riders = [makePerson('p0'), makePerson('p1'), makePerson('p2'), makePerson('p3')];
    const destFloors = [1, 2, 3, 5];
    for (let i = 0; i < 4; i++) {
        const spot = e.reserveBoardingSpot(riders[i]);
        assert.ok(spot, 'should reserve spot ' + i);
        e.completeBoard(riders[i]);
        e.pressDestination(destFloors[i]);
    }
    for (let i = 0; i < 6; i++) e.callUp(0);

    runUntilDoorClosed(e);

    assert.strictEqual(e.state, 'MOVING', 'expected MOVING after doors close, got ' + e.state);
    assert.ok(e.targetFloor > 0, 'expected targetFloor > 0, got ' + e.targetFloor);
    assert.strictEqual(e.direction, 1, 'expected direction +1, got ' + e.direction);
    assert.strictEqual(e.upCalls.has(0), true, 'upCalls(0) should remain in queue for next trip');

    e.reset();
});

test('2. Passenger destinations outrank same-floor hall calls', () => {
    const e = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    e.callUp(0);
    runUntilDoorOpenAt(e, 0);

    const rider = makePerson('p0');
    e.reserveBoardingSpot(rider);
    e.completeBoard(rider);
    e.pressDestination(5);

    e.tick(DT);
    if (e.state === 'DOOR_OPEN') e.callUp(0);

    runUntilDoorClosed(e);

    assert.strictEqual(e.state, 'MOVING', 'expected MOVING (not IDLE/redoors)');
    assert.notStrictEqual(e.targetFloor, 0, 'targetFloor should not be 0');
    assert.ok(e.targetFloor > 0, 'targetFloor should be > 0');
    e.reset();
});

test('3. Repeated callUp(0) across many ticks does not starve passengers', () => {
    const e = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    e.callUp(0);
    runUntilDoorOpenAt(e, 0);

    const rider = makePerson('p0');
    e.reserveBoardingSpot(rider);
    e.completeBoard(rider);
    e.pressDestination(3);

    for (let i = 0; i < 20; i++) {
        e.callUp(0);
        e.tick(DT);
    }

    const reachedFloor3 = tickUntil(e,
        (l) => l.currentFloor === 3 && (l.state === 'DOOR_OPEN' || l.state === 'DOOR_OPENING'),
        'reach floor 3 destination');
    assert.ok(reachedFloor3 < MAX_TICKS, 'should reach floor 3 within tick budget');
    e.reset();
});

test('4. Opposite-direction calls wait until upward work is done', () => {
    const e = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    e.callUp(0);
    runUntilDoorOpenAt(e, 0);

    const rider = makePerson('p0');
    e.reserveBoardingSpot(rider);
    e.completeBoard(rider);
    e.pressDestination(4);

    runUntilDoorClosed(e);

    for (let i = 0; i < 5; i++) e.callDown(i);
    e.callDown(0);

    tickUntil(e, (l) => l.currentFloor >= 1.5 && l.state === 'MOVING',
              'car passes floor 1.5 going up');

    assert.strictEqual(e.direction, 1, 'direction should still be +1 going up');
    assert.strictEqual(e.targetFloor, 4, 'targetFloor should still be 4');
    e.reset();
});

test('5. Doors hold open for pending boarders/disembarkers, but cap at MAX_DOOR_OPEN_S', () => {
    const e = new ElevatorLogic({ floorCount: 6, maxCapacity: 4, minDoorOpenS: 0.3, maxDoorOpenS: 3.0 });
    e.callUp(0);
    runUntilDoorOpenAt(e, 0);

    const stuck = makePerson('stuck');
    e.reserveBoardingSpot(stuck);
    assert.strictEqual(e.state, 'DOOR_OPEN', 'state should be DOOR_OPEN');

    for (let i = 0; i < 20; i++) e.tick(DT);
    assert.strictEqual(e.state, 'DOOR_OPEN', 'should still be DOOR_OPEN (held by pending boarder)');

    tickUntil(e, (l) => l.state === 'DOOR_CLOSING' && l.doorTimer >= 3.0,
              'force-closed after maxDoorOpenS');
    assert.strictEqual(e.state, 'DOOR_CLOSING', 'should have force-closed after maxDoorOpenS');
    e.reset();
});

test('6. Destination preserved across the action handshake (floor 0 to floor 5)', () => {
    const e = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    e.callUp(0);
    runUntilDoorOpenAt(e, 0);

    const rider = makePerson('p0');
    const toFloor = 5;
    e.reserveBoardingSpot(rider);
    e.completeBoard(rider);
    e.pressDestination(toFloor);

    assert.ok(e.destinations.has(5), 'destinations should contain 5');
    assert.ok(!e.destinations.has(1), 'destinations should not contain 1');

    runUntilDoorClosed(e);
    assert.ok(e.targetFloor >= 4, 'targetFloor should be 4 or 5, not floor 1, got ' + e.targetFloor);

    runUntilFloor(e, 5);
    assert.strictEqual(e.currentFloor, 5, 'should arrive at floor 5');
    e.reset();
});

test('7. reset() clears all phantom state', () => {
    const e = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    e.callUp(0);
    e.callDown(3);
    e.pressDestination(2);
    const p = makePerson('p0');
    e.reserveBoardingSpot(p);
    e.callUp(2);
    e.tick(DT * 50);

    e.reset();

    assert.strictEqual(e.state, 'IDLE');
    assert.strictEqual(e.direction, 0);
    assert.strictEqual(e.currentFloor, 0);
    assert.strictEqual(e.targetFloor, 0);
    assert.strictEqual(e.upCalls.size, 0);
    assert.strictEqual(e.downCalls.size, 0);
    assert.strictEqual(e.destinations.size, 0);
    assert.strictEqual(e.passengers.size, 0);
    assert.strictEqual(e.pendingBoarders.size, 0);
    assert.strictEqual(e.pendingDisembark.size, 0);
    for (const occ of e.spotOccupancy) {
        assert.strictEqual(occ, false, 'spot should be free');
    }
    assert.strictEqual(e.doorProgress, 0);
    assert.strictEqual(e.doorTimer, 0);
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
