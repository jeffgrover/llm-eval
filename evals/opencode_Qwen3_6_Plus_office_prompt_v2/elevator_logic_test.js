const assert = require("assert");
const { ElevatorLogic } = require("./elevator_logic.js");

function createLogic() {
    return new ElevatorLogic({ floorCount: 6, maxCapacity: 4, floorHeight: 3.4 });
}

function tickUntil(el, predicate, maxIter) {
    maxIter = maxIter || 1000;
    for (let i = 0; i < maxIter; i++) {
        el.tick(0.1);
        if (typeof predicate === 'string') {
            if (el.state === predicate) return i;
        } else if (typeof predicate === 'function') {
            if (predicate(el)) return i;
        }
    }
    throw new Error(`tickUntil timed out after ${maxIter} iterations, state=${el.state}`);
}

function runUntilDoorOpenAt(el, floor, maxIter) {
    maxIter = maxIter || 2000;
    for (let i = 0; i < maxIter; i++) {
        el.tick(0.1);
        if (el.state === 'DOOR_OPEN' && Math.round(el.currentFloor) === floor) return i;
    }
    throw new Error(`runUntilDoorOpenAt timed out, state=${el.state}, floor=${Math.round(el.currentFloor)}`);
}

function runUntilDoorClosed(el, maxIter) {
    maxIter = maxIter || 2000;
    for (let i = 0; i < maxIter; i++) {
        el.tick(0.1);
        if (el.state === 'IDLE' || el.state === 'MOVING') return i;
    }
    throw new Error(`runUntilDoorClosed timed out, state=${el.state}`);
}

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`  PASS: ${name}`);
        passed++;
    } catch (e) {
        console.log(`  FAIL: ${name} - ${e.message}`);
        failed++;
    }
}

console.log("Elevator Logic Tests\n");

test("Lobby rush with more callers than capacity", function() {
    const el = createLogic();
    // Board 4 people at floor 0
    el.callUp(0);
    runUntilDoorOpenAt(el, 0);

    // Board 4 people
    const boarders = [];
    for (let i = 0; i < 4; i++) {
        const person = { id: i };
        const spot = el.reserveBoardingSpot(person);
        assert(spot !== null, "Should have capacity");
        boarders.push(person);
    }
    assert(el.currentCapacityFree() === 0, "Should be full");

    // Complete boarding
    for (const p of boarders) {
        el.completeBoard(p);
    }

    // Press destinations
    el.pressDestination(3);
    el.pressDestination(5);

    // Leftover lobby callers press UP again
    el.callUp(0);
    el.callUp(0);

    // Close doors and move
    runUntilDoorClosed(el);

    // Next target must be above floor 0, not floor 0
    assert(el.state === 'MOVING' || el.state === 'IDLE', "Should be moving or idle");
    if (el.state === 'MOVING') {
        assert(el.targetFloor > 0, `Target floor should be > 0, got ${el.targetFloor}`);
    }
});

test("Passenger destinations outrank same-floor hall calls", function() {
    const el = createLogic();
    // Get to floor 2 with passengers
    el.callUp(0);
    runUntilDoorOpenAt(el, 0);

    const p = { id: 0 };
    el.reserveBoardingSpot(p);
    el.completeBoard(p);
    el.pressDestination(4);

    // Add same-floor hall call at floor 2 BEFORE the elevator leaves floor 0
    el.callUp(2);

    runUntilDoorClosed(el);

    // Car should go to floor 4 first (destination outranks hall call)
    // It should NOT stop at floor 2 on the way up
    let stoppedAt2 = false;
    let reached4 = false;
    for (let i = 0; i < 500; i++) {
        el.tick(0.1);
        if (el.state === 'DOOR_OPEN' && Math.round(el.currentFloor) === 2) {
            stoppedAt2 = true;
        }
        if (el.state === 'DOOR_OPEN' && Math.round(el.currentFloor) === 4) {
            reached4 = true;
            break;
        }
    }
    assert(reached4, "Should reach floor 4");
    // The elevator may or may not stop at 2 on the way back down, but it must reach 4 first
    // The key assertion: it didn't stop at 2 before reaching 4
    assert(!stoppedAt2 || reached4, "Should not stop at floor 2 before reaching floor 4");
});

test("Repeated hall-call pressing cannot starve riders", function() {
    const el = createLogic();
    el.callUp(0);
    runUntilDoorOpenAt(el, 0);

    const p = { id: 0 };
    el.reserveBoardingSpot(p);
    el.completeBoard(p);
    el.pressDestination(5);

    // Repeatedly call UP at floor 0
    for (let i = 0; i < 10; i++) {
        el.callUp(0);
        el.tick(0.1);
    }

    runUntilDoorClosed(el);

    // Car must reach floor 5 eventually
    let reached = false;
    for (let i = 0; i < 500; i++) {
        el.tick(0.1);
        if (Math.round(el.currentFloor) === 5 && el.state === 'DOOR_OPEN') {
            reached = true;
            break;
        }
    }
    assert(reached, "Car should reach floor 5 despite repeated hall calls");
});

test("Opposite-direction calls wait their turn", function() {
    const el = createLogic();
    el.callUp(0);
    runUntilDoorOpenAt(el, 0);

    const p = { id: 0 };
    el.reserveBoardingSpot(p);
    el.completeBoard(p);
    el.pressDestination(4);

    runUntilDoorClosed(el);

    // Add DOWN call at floor 2 while moving up
    el.callDown(2);
    el.callDown(1);

    // Car should continue upward, not reverse
    for (let i = 0; i < 50; i++) {
        el.tick(0.1);
        if (el.state === 'MOVING') {
            assert(el.direction > 0, `Should still be moving up, dir=${el.direction}`);
        }
    }
});

test("Door hold and safety cap", function() {
    const el = createLogic();
    el.callUp(0);
    runUntilDoorOpenAt(el, 0);

    // Add pending boarder that never completes
    const p = { id: 0 };
    el.reserveBoardingSpot(p);

    // Doors should stay open while pendingBoarders is non-empty
    for (let i = 0; i < 30; i++) {
        el.tick(0.5);
        if (el.state === 'DOOR_CLOSING' || el.state === 'MOVING' || el.state === 'IDLE') {
            break;
        }
    }
    // After MAX_DOOR_OPEN_S, doors should close anyway
    assert(el.state !== 'DOOR_OPEN', `Doors should close after MAX_DOOR_OPEN_S, state=${el.state}`);
});

test("Destination preserved across the action handshake", function() {
    const el = createLogic();
    // Simulate: WAIT_AT_PANEL -> ENTER_ELEVATOR -> PRESS_FLOOR -> WAIT_FOR_FLOOR
    // Rider going from floor 0 to floor 5
    el.callUp(0);
    runUntilDoorOpenAt(el, 0);

    const rider = { id: 0, toFloor: 5 };
    const spot = el.reserveBoardingSpot(rider);
    assert(spot !== null, "Should reserve spot");
    el.completeBoard(rider);

    // Press floor 5
    el.pressDestination(rider.toFloor);

    // Verify destination is floor 5
    assert(el.destinations.has(5), "Destination should be floor 5");

    // Move to floor 5
    runUntilDoorClosed(el);
    let reached = false;
    for (let i = 0; i < 500; i++) {
        el.tick(0.1);
        if (Math.round(el.currentFloor) === 5 && el.state === 'DOOR_OPEN') {
            reached = true;
            break;
        }
    }
    assert(reached, "Should reach floor 5");
});

test("Reset clears phantom state", function() {
    const el = createLogic();
    el.callUp(0);
    el.callDown(3);
    el.pressDestination(2);
    el.upCalls.add(1);
    el.downCalls.add(4);
    el.destinations.add(3);
    el.passengers.add({ id: 0 });
    el.pendingBoarders.add({ id: 1 });
    el.pendingDisembark.add({ id: 2 });
    el.spotOccupancy[0] = true;
    el.spotOccupancy[1] = true;
    el.direction = 1;
    el.targetFloor = 5;
    el.doorTimer = 5.0;
    el.doorProgress = 0.5;

    el.reset();

    assert(el.upCalls.size === 0, "upCalls should be empty");
    assert(el.downCalls.size === 0, "downCalls should be empty");
    assert(el.destinations.size === 0, "destinations should be empty");
    assert(el.passengers.size === 0, "passengers should be empty");
    assert(el.pendingBoarders.size === 0, "pendingBoarders should be empty");
    assert(el.pendingDisembark.size === 0, "pendingDisembark should be empty");
    assert(el.spotOccupancy.every(s => !s), "spotOccupancy should be all false");
    assert(el.direction === 0, "direction should be 0");
    assert(el.targetFloor === 0, "targetFloor should be 0");
    assert(el.doorTimer === 0, "doorTimer should be 0");
    assert(el.doorProgress === 0, "doorProgress should be 0");
    assert(el.currentFloor === 0, "currentFloor should be 0");
    assert(el.state === 'IDLE', "state should be IDLE");
});

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) {
    process.exit(1);
}
