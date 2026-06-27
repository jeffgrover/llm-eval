// elevator_logic_test.js — deterministic Node tests for elevator_logic.js
const assert = require("assert");
const { ElevatorLogic, STATES } = require("./elevator_logic.js");

const MAX_ITER = 5000;
function tickUntil(el, pred, maxIter) {
    maxIter = maxIter || MAX_ITER;
    for (let i = 0; i < maxIter; i++) {
        if (pred()) return true;
        el.tick(0.016);
    }
    return pred();
}
function runUntilDoorOpenAt(el, floor, maxIter) {
    return tickUntil(el, () => el.state === STATES.DOOR_OPEN && el.currentFloor === floor, maxIter);
}
function runUntilDoorClosed(el, maxIter) {
    return tickUntil(el, () => el.state === STATES.IDLE || el.state === STATES.MOVING, maxIter);
}

let pass = 0, fail = 0;
function test(name, fn) {
    try { fn(); console.log("PASS " + name); pass++; }
    catch (e) { console.log("FAIL " + name + ": " + e.message); fail++; }
}

// 1. Lobby rush: more callers than capacity
test("lobby_rush_more_than_capacity", () => {
    const el = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    el.callUp(0);
    assert.ok(runUntilDoorOpenAt(el, 0), "doors open at 0");
    // Board four people, press destinations 1..4
    for (let i = 0; i < 4; i++) {
        const spot = el.reserveBoardingSpot("p" + i, i + 1);
        assert.ok(spot, "spot " + i);
        el.completeBoard("p" + i);
    }
    assert.equal(el.currentCapacityFree(), 0);
    // Leftover waiters re-press UP at floor 0
    el.callUp(0);
    // Doors must eventually close despite leftover call
    assert.ok(runUntilDoorClosed(el), "doors closed after rush");
    // Next target must be above floor 0 (passenger destinations outrank same-floor lobby call)
    assert.ok(el.targetFloor > 0,
        "target should be above 0, got " + el.targetFloor + " state " + el.state);
    assert.ok(el.destinations.size > 0 || el.passengers.size > 0);
});

// 2. Passenger destinations outrank same-floor hall calls
test("passenger_dest_outranks_same_floor_hall_call", () => {
    const el = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    el.callUp(0);
    assert.ok(runUntilDoorOpenAt(el, 0));
    const spot = el.reserveBoardingSpot("p0", 5);
    assert.ok(spot);
    el.completeBoard("p0");
    // passenger wants floor 5
    assert.ok(el.destinations.has(5));
    // re-press UP at floor 0 (leftover caller)
    el.callUp(0);
    // Doors must close and target must be 5, not 0
    assert.ok(runUntilDoorClosed(el));
    assert.equal(el.targetFloor, 5,
        "target should be passenger dest 5, got " + el.targetFloor);
});

// 3. Repeated hall-call pressing cannot starve riders
test("repeated_callup_cannot_starve_riders", () => {
    const el = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    el.callUp(0);
    assert.ok(runUntilDoorOpenAt(el, 0));
    el.reserveBoardingSpot("p0", 4);
    el.completeBoard("p0");
    // Repeatedly press UP at 0 each tick
    let reached = false;
    for (let i = 0; i < MAX_ITER; i++) {
        el.callUp(0);
        el.tick(0.05);
        if (el.currentFloor === 4 && el.state === STATES.DOOR_OPEN) { reached = true; break; }
    }
    assert.ok(reached, "car should reach passenger destination despite repeated callUp(0)");
});

// 4. Opposite-direction calls wait their turn
test("opposite_direction_calls_wait", () => {
    const el = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    el.callUp(0);
    assert.ok(runUntilDoorOpenAt(el, 0));
    el.reserveBoardingSpot("p0", 4);
    el.completeBoard("p0");
    assert.ok(runUntilDoorClosed(el));
    assert.equal(el.direction, 1);
    // While moving up, add a DOWN call at floor 0
    el.callDown(0);
    // Should not reverse: direction stays up until floor 4 served
    let reversedEarly = false;
    for (let i = 0; i < 200; i++) {
        el.callDown(0);
        el.tick(0.05);
        if (el.direction === -1 && el.currentFloor < 4 && el.state !== STATES.DOOR_OPEN) {
            reversedEarly = true; break;
        }
        if (el.currentFloor === 4 && el.state === STATES.DOOR_OPEN) break;
    }
    assert.ok(!reversedEarly, "car reversed before serving upward destination");
    assert.ok(runUntilDoorOpenAt(el, 4), "reached floor 4");
});

// 5. Door hold and safety cap
test("door_hold_and_safety_cap", () => {
    const el = new ElevatorLogic({ floorCount: 6, maxCapacity: 4, MIN_DOOR_OPEN_S: 0.4, MAX_DOOR_OPEN_S: 2.0 });
    el.callUp(0);
    assert.ok(runUntilDoorOpenAt(el, 0));
    // Register a pending boarder that never completes
    el.reserveBoardingSpot("stuck", 3);
    // Door should stay open (pendingBoarders non-empty) past MIN_DOOR_OPEN_S
    for (let i = 0; i < 10; i++) el.tick(0.1);
    assert.equal(el.state, STATES.DOOR_OPEN, "doors held open for pending boarder");
    // Eventually MAX_DOOR_OPEN_S forces close
    assert.ok(tickUntil(el, () => el.state === STATES.DOOR_CLOSING || el.state === STATES.IDLE || el.state === STATES.MOVING, 500));
});

// 6. Destination preserved across handshake (floor 0 -> floor 5)
test("destination_preserved_across_handshake", () => {
    const el = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    // Model: WAIT_AT_PANEL -> ENTER_ELEVATOR -> PRESS_FLOOR -> WAIT_FOR_FLOOR
    el.callUp(0);
    assert.ok(runUntilDoorOpenAt(el, 0));
    assert.ok(el.isAcceptingAt(0, 1), "accepting up at 0");
    const toFloor = 5;
    const spot = el.reserveBoardingSpot("rider", toFloor);
    assert.ok(spot, "reserve spot");
    // ENTER_ELEVATOR phase: completeBoard
    el.completeBoard("rider");
    // PRESS_FLOOR: pressDestination
    el.pressDestination(toFloor);
    assert.ok(el.destinations.has(toFloor), "destination registered as 5 not 1");
    // doors close, car moves to 5
    assert.ok(runUntilDoorClosed(el));
    assert.equal(el.targetFloor, 5, "target is 5, not inferred floor 1. got " + el.targetFloor);
    assert.ok(runUntilDoorOpenAt(el, 5), "car reached floor 5");
});

// 7. Reset clears phantom state
test("reset_clears_phantom_state", () => {
    const el = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    el.callUp(0);
    el.callDown(3);
    el.pressDestination(5);
    el.reserveBoardingSpot("p", 4);
    el.completeBoard("p");
    el.registerDisembark("p");
    el.direction = 1; el.targetFloor = 4; el.doorTimer = 99;
    el.reset();
    assert.equal(el.upCalls.size, 0);
    assert.equal(el.downCalls.size, 0);
    assert.equal(el.destinations.size, 0);
    assert.equal(el.passengers.size, 0);
    assert.equal(el.pendingBoarders.size, 0);
    assert.equal(el.pendingDisembark.size, 0);
    assert.equal(el.direction, 0);
    assert.equal(el.targetFloor, 0);
    assert.equal(el.doorTimer, 0);
    assert.equal(el.state, STATES.IDLE);
    assert.equal(el.currentFloor, 0);
    for (let i = 0; i < 4; i++) assert.equal(el.spotOccupancy[i], false);
});

console.log("\n=== " + pass + " passed, " + fail + " failed ===");
if (fail > 0) process.exit(1);
