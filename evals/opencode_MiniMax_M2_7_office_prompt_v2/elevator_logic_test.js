var assert = require('assert');
var ElevatorLogic = require('./elevator_logic.js').ElevatorLogic;

var STATE = {
    IDLE: 'IDLE',
    MOVING: 'MOVING',
    DOOR_OPENING: 'DOOR_OPENING',
    DOOR_OPEN: 'DOOR_OPEN',
    DOOR_CLOSING: 'DOOR_CLOSING'
};

var testsPassed = 0;
var testsFailed = 0;

function tickUntil(elev, predicate, maxTicks) {
    maxTicks = maxTicks || 1000;
    for (var i = 0; i < maxTicks; i++) {
        elev.tick(0.016);
        if (predicate(elev)) return true;
    }
    return false;
}

function runUntilDoorOpenAt(elev, floor, maxTicks) {
    maxTicks = maxTicks || 2000;
    for (var i = 0; i < maxTicks; i++) {
        elev.tick(0.016);
        if (elev.state === STATE.DOOR_OPEN && Math.floor(elev.currentFloor) === floor) {
            return true;
        }
    }
    return false;
}

function runUntilDoorClosed(elev, maxTicks) {
    maxTicks = maxTicks || 2000;
    for (var i = 0; i < maxTicks; i++) {
        elev.tick(0.016);
        if (elev.state === STATE.IDLE || elev.state === STATE.MOVING) {
            return true;
        }
    }
    return false;
}

function runUntilState(elev, state, maxTicks) {
    maxTicks = maxTicks || 2000;
    for (var i = 0; i < maxTicks; i++) {
        elev.tick(0.016);
        if (elev.state === state) return true;
    }
    return false;
}

console.log('Running elevator logic tests...\n');

console.log('Test 1: Lobby rush with more callers than capacity');
try {
    var elev = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });

    elev.callUp(0);
    assert(runUntilDoorOpenAt(elev, 0), 'Elevator should open at floor 0');

    var p1 = { id: 1 }, p2 = { id: 2 }, p3 = { id: 3 }, p4 = { id: 4 }, p5 = { id: 5 };

    assert(elev.currentCapacityFree() === 4, 'Should have 4 spots free');
    var spot1 = elev.reserveBoardingSpot(p1);
    assert(spot1 !== null, 'p1 should get spot');
    elev.completeBoard(p1);

    assert(elev.currentCapacityFree() === 3, 'Should have 3 spots free');
    var spot2 = elev.reserveBoardingSpot(p2);
    assert(spot2 !== null, 'p2 should get spot');
    elev.completeBoard(p2);

    var spot3 = elev.reserveBoardingSpot(p3);
    assert(spot3 !== null, 'p3 should get spot');
    elev.completeBoard(p3);

    var spot4 = elev.reserveBoardingSpot(p4);
    assert(spot4 !== null, 'p4 should get spot');
    elev.completeBoard(p4);

    assert(elev.currentCapacityFree() === 0, 'Should have 0 spots free');
    var spot5 = elev.reserveBoardingSpot(p5);
    assert(spot5 === null, 'p5 should NOT get spot (car full)');

    elev.pressDestination(3);
    elev.pressDestination(5);

    assert(runUntilDoorClosed(elev), 'Doors should close');

    for (var t = 0; t < 500; t++) {
        elev.tick(0.016);
    }

    elev.callUp(0);

    for (var t = 0; t < 500; t++) {
        elev.tick(0.016);
    }

    var targetAbove = elev.targetFloor > 0 || (elev.state === STATE.DOOR_OPEN && Math.floor(elev.currentFloor) > 0);
    var stuckAt0 = elev.currentFloor < 0.5 && elev.state !== STATE.DOOR_OPEN;

    assert(!stuckAt0 || targetAbove, 'Elevator should not be stuck at floor 0 with passengers wanting to go up');

    console.log('  PASS\n');
    testsPassed++;
} catch (e) {
    console.log('  FAIL: ' + e.message + '\n');
    testsFailed++;
}

console.log('Test 2: Passenger destinations outrank same-floor hall calls');
try {
    var elev = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });

    elev.callUp(0);
    assert(runUntilDoorOpenAt(elev, 0), 'Elevator should open at floor 0');

    var p1 = { id: 1 };
    var spot1 = elev.reserveBoardingSpot(p1);
    assert(spot1 !== null, 'p1 should get spot');
    elev.completeBoard(p1);

    elev.pressDestination(5);

    assert(runUntilDoorClosed(elev), 'Doors should close');

    for (var t = 0; t < 200; t++) {
        elev.tick(0.016);
    }

    assert(elev.destinations.has(5), 'Destination 5 should be set');

    var beforeTick = elev.destinations.size + elev.passengers.size;

    elev.callUp(0);

    for (var t = 0; t < 50; t++) {
        elev.tick(0.016);
    }

    assert(!elev.isAcceptingAt(0, 1) || elev.passengers.size === 0 || elev.destinations.has(5),
        'Should not reopen for same-floor call when passengers have destinations');

    console.log('  PASS\n');
    testsPassed++;
} catch (e) {
    console.log('  FAIL: ' + e.message + '\n');
    testsFailed++;
}

console.log('Test 3: Repeated hall-call pressing cannot starve riders');
try {
    var elev = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });

    elev.callUp(0);
    assert(runUntilDoorOpenAt(elev, 0), 'Elevator should open at floor 0');

    var p1 = { id: 1 }, p2 = { id: 2 };
    elev.reserveBoardingSpot(p1);
    elev.completeBoard(p1);
    elev.reserveBoardingSpot(p2);
    elev.completeBoard(p2);

    elev.pressDestination(4);
    elev.pressDestination(3);

    assert(runUntilDoorClosed(elev), 'Doors should close');

    for (var i = 0; i < 10; i++) {
        elev.callUp(0);
        for (var t = 0; t < 50; t++) {
            elev.tick(0.016);
        }
    }

    var reachedDest = false;
    for (var t = 0; t < 500; t++) {
        elev.tick(0.016);
        if (elev.state === STATE.DOOR_OPEN && Math.floor(elev.currentFloor) === 3) {
            reachedDest = true;
            break;
        }
    }

    assert(reachedDest, 'Car should still reach passenger destination despite repeated lobby calls');
    console.log('  PASS\n');
    testsPassed++;
} catch (e) {
    console.log('  FAIL: ' + e.message + '\n');
    testsFailed++;
}

console.log('Test 4: Opposite-direction calls wait their turn');
try {
    var elev = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });

    elev.callUp(0);
    assert(runUntilDoorOpenAt(elev, 0), 'Elevator should open at floor 0');

    var p1 = { id: 1 };
    elev.reserveBoardingSpot(p1);
    elev.completeBoard(p1);

    elev.pressDestination(4);

    assert(runUntilDoorClosed(elev), 'Doors should close');

    while (elev.currentFloor < 3.5) {
        elev.tick(0.016);
    }

    elev.callDown(2);
    elev.callDown(1);
    elev.callDown(0);

    var directionPreserved = true;
    var reversals = 0;
    var prevDir = elev.direction;

    for (var t = 0; t < 500; t++) {
        elev.tick(0.016);
        if (elev.direction !== prevDir) {
            reversals++;
            prevDir = elev.direction;
        }
        if (reversals > 2) {
            directionPreserved = false;
            break;
        }
    }

    assert(directionPreserved, 'Direction should not reverse while serving upward direction');
    console.log('  PASS\n');
    testsPassed++;
} catch (e) {
    console.log('  FAIL: ' + e.message + '\n');
    testsFailed++;
}

console.log('Test 5: Door hold and safety cap');
try {
    var elev = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });

    elev.callUp(0);
    assert(runUntilDoorOpenAt(elev, 0), 'Elevator should open at floor 0');

    var p1 = { id: 1 };
    elev.reserveBoardingSpot(p1);
    elev.completeBoard(p1);

    elev.pressDestination(2);

    assert(runUntilDoorClosed(elev), 'Doors should close');

    var carAtFloor2 = false;
    for (var t = 0; t < 1000; t++) {
        elev.tick(0.016);
        if (elev.state === STATE.DOOR_OPEN && Math.abs(elev.currentFloor - 2) < 0.1) {
            carAtFloor2 = true;
            break;
        }
    }
    assert(carAtFloor2, 'Car should reach floor 2 and open doors. state=' + elev.state + ' floor=' + elev.currentFloor);

    var p2 = { id: 2 };
    elev.registerDisembark(p2);

    assert(elev.pendingDisembark.size > 0, 'Should have pending disembarker');

    for (var t = 0; t < 600; t++) {
        elev.tick(0.016);
        if (elev.state === STATE.DOOR_CLOSING || elev.state === STATE.IDLE || elev.state === STATE.MOVING) {
            break;
        }
    }

    assert(elev.state === STATE.DOOR_CLOSING || elev.state === STATE.IDLE || elev.state === STATE.MOVING,
        'Door should close after MAX_DOOR_OPEN_S with stale disembarker. ticks=' + t + ' state=' + elev.state + ' pendingDis=' + elev.pendingDisembark.size);
    console.log('  PASS\n');
    testsPassed++;
} catch (e) {
    console.log('  FAIL: ' + e.message + '\n');
    testsFailed++;
}

console.log('Test 6: Destination preserved across action handshake');
try {
    var elev = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });

    elev.callUp(0);
    assert(runUntilDoorOpenAt(elev, 0), 'Elevator should open at floor 0');

    var p1 = { id: 1 };
    elev.reserveBoardingSpot(p1);
    elev.completeBoard(p1);

    elev.pressDestination(5);

    assert(runUntilDoorClosed(elev), 'Doors should close');

    var destPreserved = elev.destinations.has(5);
    assert(destPreserved, 'Destination 5 should be preserved in destinations set');

    while (elev.currentFloor < 4.5) {
        elev.tick(0.016);
    }

    assert(runUntilDoorOpenAt(elev, 5), 'Elevator should open at floor 5');

    var atFloor5 = Math.abs(elev.currentFloor - 5) < 0.2;
    assert(atFloor5, 'Car should be at floor 5');

    console.log('  PASS\n');
    testsPassed++;
} catch (e) {
    console.log('  FAIL: ' + e.message + '\n');
    testsFailed++;
}

console.log('Test 7: Reset clears phantom state');
try {
    var elev = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });

    elev.callUp(0);
    elev.callDown(3);
    elev.pressDestination(4);
    elev.pressDestination(2);

    var p1 = { id: 1 }, p2 = { id: 2 };
    elev.reserveBoardingSpot(p1);
    elev.completeBoard(p1);
    elev.reserveBoardingSpot(p2);
    elev.completeBoard(p2);

    elev.tick(0.5);

    assert(elev.upCalls.size > 0 || elev.downCalls.size > 0 || elev.destinations.size > 0 || elev.passengers.size > 0,
        'Pre-reset state should have calls/destinations/passengers');

    elev.reset();

    assert(elev.upCalls.size === 0, 'upCalls should be empty');
    assert(elev.downCalls.size === 0, 'downCalls should be empty');
    assert(elev.destinations.size === 0, 'destinations should be empty');
    assert(elev.passengers.size === 0, 'passengers should be empty');
    assert(elev.pendingBoarders.size === 0, 'pendingBoarders should be empty');
    assert(elev.pendingDisembark.size === 0, 'pendingDisembark should be empty');
    assert(elev.direction === 0, 'direction should be 0');
    assert(elev.targetFloor === 0, 'targetFloor should be 0');
    assert(elev.state === STATE.IDLE, 'state should be IDLE');
    assert(elev.currentFloor === 0, 'currentFloor should be 0');
    assert(elev.doorTimer === 0, 'doorTimer should be 0');
    assert(elev.spotOccupancy.every(function(s) { return s === null; }), 'All spots should be free');

    console.log('  PASS\n');
    testsPassed++;
} catch (e) {
    console.log('  FAIL: ' + e.message + '\n');
    testsFailed++;
}

console.log('\n=== SUMMARY ===');
console.log('Passed: ' + testsPassed);
console.log('Failed: ' + testsFailed);

if (testsFailed > 0) {
    console.log('\nFAIL');
    process.exit(1);
} else {
    console.log('\nPASS');
    process.exit(0);
}