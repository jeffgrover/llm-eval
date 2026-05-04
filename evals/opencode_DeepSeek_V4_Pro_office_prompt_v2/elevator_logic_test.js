var assert = require('assert');
var ElevatorLogic = require('./elevator_logic.js').ElevatorLogic;

var PASS = 0;
var FAIL = 0;

function test(name, fn) {
    try {
        fn();
        PASS++;
        console.log('PASS: ' + name);
    } catch (e) {
        FAIL++;
        console.log('FAIL: ' + name + ' — ' + e.message);
    }
}

function tickUntil(el, stateOrFn) {
    var count = 0;
    while (count < 5000) {
        el.tick(0.1);
        count++;
        if (typeof stateOrFn === 'function') {
            if (stateOrFn(el)) return count;
        } else {
            if (el.state === stateOrFn) return count;
        }
    }
    throw new Error('tickUntil timeout after ' + count + ' ticks, state=' + ElevatorLogic.STATE_NAMES[el.state]);
}

function runUntilDoorOpenAt(el, floor) {
    tickUntil(el, function(e) {
        return e.state === ElevatorLogic.DOOR_OPEN && e.currentFloor === floor;
    });
}

function runUntilDoorClosed(el) {
    tickUntil(el, function(e) {
        return e.state === ElevatorLogic.IDLE || e.state === ElevatorLogic.MOVING;
    });
}

// ---- Test 1: Lobby rush with more callers than capacity ----
test('Lobby rush: full car leaves floor 0, leftover callers must wait', function() {
    var el = new ElevatorLogic({floorCount:6, maxCapacity:4, floorHeight:3.4});

    el.callUp(0);
    runUntilDoorOpenAt(el, 0);

    assert.equal(el.currentFloor, 0);
    assert.equal(el.state, ElevatorLogic.DOOR_OPEN);
    assert.ok(el.currentCapacityFree() >= 4);

    var p1 = {}, p2 = {}, p3 = {}, p4 = {};
    assert.ok(el.reserveBoardingSpot(p1) !== null);
    assert.ok(el.reserveBoardingSpot(p2) !== null);
    assert.ok(el.reserveBoardingSpot(p3) !== null);
    assert.ok(el.reserveBoardingSpot(p4) !== null);
    assert.equal(el.currentCapacityFree(), 0);

    el.completeBoard(p1); el.pressDestination(3);
    el.completeBoard(p2); el.pressDestination(4);
    el.completeBoard(p3); el.pressDestination(5);
    el.completeBoard(p4); el.pressDestination(2);

    assert.equal(el.passengers.size, 4);
    assert.equal(el.pendingBoarders.size, 0);

    // leftover lobby caller presses UP again
    el.callUp(0);

    runUntilDoorClosed(el);

    // The next target must be ABOVE floor 0, not floor 0 again
    assert.ok(el.targetFloor > 0, 'targetFloor should be above 0, got ' + el.targetFloor);
    assert.ok(el.state === ElevatorLogic.MOVING || el.state === ElevatorLogic.DOOR_OPENING || el.state === ElevatorLogic.DOOR_OPEN);
    assert.ok(el.direction === 1);
});

// ---- Test 2: Passenger destinations outrank same-floor hall calls ----
test('Passenger dests outrank same-floor hall calls', function() {
    var el = new ElevatorLogic({floorCount:6, maxCapacity:4});

    // Move car to floor 3 with passengers having destination 5
    el.state = ElevatorLogic.IDLE;
    el.currentFloor = 3;
    el.floorPosition = 3 * 3.4;
    el.direction = 1;

    var p = {};
    el.passengers.add(p);
    el.destinations[5] = true;

    // Press up button at floor 3
    el.callUp(3);

    // Drive a few ticks - should not open doors at floor 3
    tickUntil(el, function(e) {
        return e.state === ElevatorLogic.MOVING && e.targetFloor > 3;
    });

    // Door should close and car should move up toward dest 5, not reopen at floor 3
    assert.ok(el.currentFloor >= 3);
    assert.ok(el.targetFloor >= 4, 'target should be >= 4, got ' + el.targetFloor);

    tickUntil(el, function(e) {
        return (e.state === ElevatorLogic.DOOR_OPEN || e.state === ElevatorLogic.DOOR_OPENING) && e.currentFloor === 5;
    });

    assert.equal(el.currentFloor, 5);
    assert.ok(el.state === ElevatorLogic.DOOR_OPEN || el.state === ElevatorLogic.DOOR_OPENING);
});

// ---- Test 3: Repeated hall-call pressing cannot starve riders ----
test('Repeated hall-call pressing cannot starve riders', function() {
    var el = new ElevatorLogic({floorCount:6, maxCapacity:4});

    el.currentFloor = 0;
    el.floorPosition = 0;
    el.state = ElevatorLogic.IDLE;

    var p = {};
    el.passengers.add(p);
    el.destinations[5] = true;

    el.callUp(0);

    // Tick several times while repeatedly calling UP at floor 0
    for (var i = 0; i < 30; i++) {
        el.tick(0.3);
        if (el.state === ElevatorLogic.DOOR_OPEN && el.currentFloor === 0) {
            el.callUp(0);
        }
        // Keep pressing up during DoorOpen to see if car gets stuck
        el.callUp(0);
    }

    // Run until we reach at least floor 2 or DOOR_OPEN at 5
    tickUntil(el, function(e) {
        return e.currentFloor >= 2 || (e.state === ElevatorLogic.DOOR_OPEN && e.currentFloor === 5);
    });

    // Eventually we must reach the passenger destination
    tickUntil(el, function(e) {
        return e.currentFloor >= 5 && (e.state === ElevatorLogic.DOOR_OPEN || e.state === ElevatorLogic.DOOR_OPENING);
    });

    assert.ok(el.currentFloor >= 4, 'must reach at least floor 4 for passenger dest');
});

// ---- Test 4: Opposite-direction calls wait their turn ----
test('Opposite-direction calls wait their turn', function() {
    var el = new ElevatorLogic({floorCount:6, maxCapacity:4});

    el.currentFloor = 2;
    el.floorPosition = 2 * 3.4;
    el.direction = 1;
    el.state = ElevatorLogic.IDLE;

    var p = {};
    el.passengers.add(p);
    el.destinations[4] = true;
    el.upCalls[3] = true;

    el.downCalls[5] = true;

    tickUntil(el, function(e) { return e.currentFloor >= 3; });

    assert.ok(el.direction === 1, 'direction should remain UP while serving upward work');

    tickUntil(el, function(e) {
        return e.state === ElevatorLogic.DOOR_OPEN && e.currentFloor === 4;
    });

    assert.equal(el.currentFloor, 4);
});

// ---- Test 5: Door hold and safety cap ----
test('Door hold: doors stay open while pending, but close after MAX_DOOR_OPEN_S', function() {
    var el = new ElevatorLogic({floorCount:6, maxCapacity:4});

    // Get to floor 2 with doors open
    el.currentFloor = 2;
    el.floorPosition = 2 * 3.4;
    el.direction = 1;
    el.state = ElevatorLogic.IDLE;
    el.destinations[2] = true;

    // Force door opening
    // Add a call so it moves to IDLE->door open
    el.upCalls[2] = true;
    tickUntil(el, ElevatorLogic.DOOR_OPEN);

    // Add a pending boarder - doors should stay open past MIN_DOOR_OPEN_S
    var p = {};
    el.reserveBoardingSpot(p);

    // Tick past MIN_DOOR_OPEN_S but not MAX
    for (var i = 0; i < 40; i++) {
        el.tick(0.1);
    }

    assert.ok(el.doorTimer > ElevatorLogic.MIN_DOOR_OPEN_S);
    assert.equal(el.state, ElevatorLogic.DOOR_OPEN, 'doors should still be open with pending boarder');

    // Now tick past MAX_DOOR_OPEN_S
    for (var i = 0; i < 200; i++) {
        el.tick(0.1);
    }

    assert.ok(el.state === ElevatorLogic.DOOR_CLOSING || el.state === ElevatorLogic.IDLE || el.state === ElevatorLogic.MOVING,
        'doors should close after MAX, state=' + ElevatorLogic.STATE_NAMES[el.state]);
});

// ---- Test 6: Destination preserved across action handshake ----
test('Destination preserved: floor press must match destination, not inferred from direction', function() {
    var el = new ElevatorLogic({floorCount:6, maxCapacity:4});

    el.callUp(0);
    runUntilDoorOpenAt(el, 0);

    var rider = {};
    var spot = el.reserveBoardingSpot(rider);
    assert.ok(spot !== null);

    el.completeBoard(rider);

    // Press floor 5 explicitly
    el.pressDestination(5);
    assert.equal(el.destinations[5], true);
    assert.equal(el.destinations[1], false, 'floor 1 should NOT be a destination');

    // Add another passenger going to floor 3
    var rider2 = {};
    el.reserveBoardingSpot(rider2);
    el.completeBoard(rider2);
    el.pressDestination(3);

    runUntilDoorClosed(el);

    tickUntil(el, function(e) {
        return e.state === ElevatorLogic.DOOR_OPEN && e.currentFloor === 3;
    });

    assert.equal(el.currentFloor, 3);

    // Destination 5 still exists
    assert.equal(el.destinations[5], true, 'destination 5 should still be set after serving floor 3');
});

// ---- Test 7: Reset clears phantom state ----
test('Reset clears phantom state', function() {
    var el = new ElevatorLogic({floorCount:6, maxCapacity:4});

    el.callUp(3);
    el.callDown(4);
    el.pressDestination(5);

    var p1 = {}, p2 = {};
    el.state = ElevatorLogic.DOOR_OPEN;
    el.currentFloor = 3;
    el.direction = 1;
    el.targetFloor = 5;

    el.reserveBoardingSpot(p1);
    el.completeBoard(p1);
    el.reserveBoardingSpot(p2);
    el.completeBoard(p2);
    el.registerDisembark(p1);

    el.reset();

    assert.equal(el.state, ElevatorLogic.IDLE);
    assert.equal(el.direction, 0);
    assert.equal(el.currentFloor, 0);
    assert.equal(el.targetFloor, -1);
    assert.equal(el.doorTimer, 0);
    assert.equal(el.passengers.size, 0);
    assert.equal(el.pendingBoarders.size, 0);
    assert.equal(el.pendingDisembark.size, 0);

    for (var i = 0; i < el.floorCount; i++) {
        assert.equal(el.upCalls[i], false, 'upCall at floor ' + i + ' should be false');
        assert.equal(el.downCalls[i], false, 'downCall at floor ' + i + ' should be false');
        assert.equal(el.destinations[i], false, 'destination at floor ' + i + ' should be false');
    }

    for (var j = 0; j < 4; j++) {
        assert.equal(el.spotOccupancy[j], false, 'spot ' + j + ' should be false');
    }
});

// ---- Summary ----
console.log('');
console.log((PASS + FAIL) + ' tests: ' + PASS + ' passed, ' + FAIL + ' failed');
if (FAIL > 0) process.exit(1);
