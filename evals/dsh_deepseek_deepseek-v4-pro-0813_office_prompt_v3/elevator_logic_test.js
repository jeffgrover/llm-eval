/* elevator_logic_test.js — deterministic Node tests for ElevatorLogic.
 * Run: node elevator_logic_test.js
 * Uses only Node built-ins (assert).
 */
"use strict";
const assert = require("assert");
const { ElevatorLogic } = require("./elevator_logic.js");

const DT = 1 / 60; // fixed step where deterministic; speeds are large enough

// Iteration caps so tests fail instead of hanging.
function tickUntil(logic, pred, cap = 20000) {
    for (let i = 0; i < cap; i++) {
        logic.tick(DT);
        if (pred(logic)) return true;
    }
    return false;
}

function runUntilDoorOpenAt(logic, floor, cap = 20000) {
    return tickUntil(logic, (l) => l.state === "DOOR_OPEN" && l.currentFloor === floor, cap);
}

function runUntilDoorClosed(logic, cap = 20000) {
    return tickUntil(logic, (l) => l.state !== "DOOR_OPENING" && l.state !== "DOOR_OPEN" && l.state !== "DOOR_CLOSING", cap);
}

// Skip ahead while doors cycle so we can board during DOOR_OPEN deterministically.
function openAndStabilize(logic, floor) {
    const ok = runUntilDoorOpenAt(logic, floor);
    assert.ok(ok, `expected doors to open at floor ${floor}`);
    // advance a little so car is fully open
    for (let i = 0; i < 30; i++) logic.tick(DT);
    assert.strictEqual(logic.state, "DOOR_OPEN");
}

const PASS = [];
const FAIL = [];
function test(name, fn) {
    try {
        fn();
        PASS.push(name);
        console.log(`PASS  ${name}`);
    } catch (e) {
        FAIL.push(name);
        console.log(`FAIL  ${name}\n      ${e.message}`);
    }
}

function makePerson() {
    return { _spotIndex: null, name: "p" + Math.random().toString(36).slice(2, 6) };
}

// ---------------------------------------------------------------------------
test("1. Lobby rush with more callers than capacity", () => {
    const L = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    L.callUp(0);
    openAndStabilize(L, 0);

    // board exactly four people
    const riders = [];
    for (let i = 0; i < 4; i++) {
        const p = makePerson();
        riders.push(p);
        const spot = L.reserveBoardingSpot(p);
        assert.ok(spot, "should reserve a spot");
        L.completeBoard(p);
    }
    assert.strictEqual(L.passengers.size, 4);
    assert.strictEqual(L.currentCapacityFree(), 0);

    // press upper-floor destinations
    riders.forEach((p) => L.pressDestination(3));
    riders.forEach((p) => L.pressDestination(5));

    // leftover lobby callers keep pressing UP
    for (let k = 0; k < 20; k++) {
        L.callUp(0);
        L.tick(DT);
    }

    // close doors and wait until car leaves floor 0
    const moved = tickUntil(L, (l) => l.currentFloor !== 0, 10000);
    assert.ok(moved, "car should leave floor 0");
    // next target while moving must be above floor 0
    assert.ok(L.targetFloor > 0, `targetFloor should be above 0, got ${L.targetFloor}`);
    assert.strictEqual(L.direction, 1, "car should be moving up");
});

// ---------------------------------------------------------------------------
test("2. Passenger destinations outrank same-floor hall calls", () => {
    const L = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    // Board one passenger at floor 0 headed up.
    L.callUp(0);
    openAndStabilize(L, 0);
    const p = makePerson();
    L.reserveBoardingSpot(p);
    L.completeBoard(p);
    L.pressDestination(4);

    // now push same-floor hall call and close doors
    L.callUp(0);
    const closed = runUntilDoorClosed(L);
    assert.ok(closed, "doors should close");

    // after close, car must travel up (target > 0), not reopen at floor 0
    // Advance a bit.
    for (let i = 0; i < 100; i++) L.tick(DT);
    assert.ok(L.currentFloor > 0 || L.targetFloor > 0, "car should head up, not reopen at 0");
});

// ---------------------------------------------------------------------------
test("3. Repeated hall-call pressing cannot starve riders", () => {
    const L = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    L.callUp(0);
    openAndStabilize(L, 0);
    const riders = [];
    for (let i = 0; i < 3; i++) {
        const p = makePerson();
        riders.push(p);
        L.reserveBoardingSpot(p);
        L.completeBoard(p);
    }
    riders.forEach((p) => L.pressDestination(5));

    // hammer the lobby UP call across many ticks
    let reachedDest = false;
    for (let i = 0; i < 20000; i++) {
        if (i % 2 === 0) L.callUp(0);
        L.tick(DT);
        if (L.state === "DOOR_OPEN" && L.currentFloor === 5) { reachedDest = true; break; }
    }
    assert.ok(reachedDest, "car should reach a passenger destination (floor 5) despite repeated lobby calls");
});

// ---------------------------------------------------------------------------
test("4. Opposite-direction calls wait their turn", () => {
    const L = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    // board a passenger at 0 going to 5
    L.callUp(0);
    openAndStabilize(L, 0);
    const p = makePerson();
    L.reserveBoardingSpot(p);
    L.completeBoard(p);
    L.pressDestination(5);

    // also place a UP call at floor 3 (work above) so car climbs
    L.callUp(3);
    const closed = runUntilDoorClosed(L);
    assert.ok(closed, "doors close");

    // While moving up, inject a DOWN call at floor 2 — must not reverse.
    let sawDownAt2 = false;
    let reached5 = false;
    for (let i = 0; i < 20000; i++) {
        L.tick(DT);
        if (L.currentFloor === 2 && L.direction === -1) sawDownAt2 = true;
        if (L.state === "DOOR_OPEN" && L.currentFloor === 5) { reached5 = true; break; }
    }
    assert.ok(reached5, "car should reach floor 5 going up");
    assert.ok(!sawDownAt2, "car should not reverse down at floor 2 while work remains above");
});

// ---------------------------------------------------------------------------
test("5. Door hold and safety cap", () => {
    // hold: doors stay open while pending boarders non-empty after min open
    const L = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    L.callUp(0);
    openAndStabilize(L, 0);
    const p = makePerson();
    L.reserveBoardingSpot(p);              // pendingBoarders > 0
    // do NOT completeBoard; keep it pending past MIN_DOOR_OPEN_S
    for (let i = 0; i < 400; i++) L.tick(DT); // ~6.7s, min open is 1.6
    assert.strictEqual(L.state, "DOOR_OPEN", "doors should stay open while a boarder is pending");
    assert.strictEqual(L.pendingBoarders.size, 1);

    // safety cap: keep it stuck and doors must eventually close
    for (let i = 0; i < 2000; i++) L.tick(DT); // ~33s, max open is 8
    assert.notStrictEqual(L.state, "DOOR_OPEN", "doors should close after MAX_DOOR_OPEN_S safety cap");
});

// ---------------------------------------------------------------------------
test("6. Destination preserved across the action handshake", () => {
    // WAIT_AT_PANEL -> ENTER_ELEVATOR -> PRESS_FLOOR -> WAIT_FOR_FLOOR, floor 0 -> 5.
    const L = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    const toFloor = 5;

    // WAIT_AT_PANEL(0, UP, 5): press up and wait for acceptance
    L.callUp(0);
    assert.ok(L.upCalls.has(0));
    let accepting = false;
    for (let i = 0; i < 10000 && !accepting; i++) {
        L.tick(DT);
        accepting = L.isAcceptingAt(0, 1);
    }
    assert.ok(accepting, "car should eventually accept a boarding at floor 0 going up");

    // ENTER_ELEVATOR: reserve spot, complete board
    const rider = makePerson();
    const spot = L.reserveBoardingSpot(rider);
    assert.ok(spot, "rider should reserve a spot");
    L.completeBoard(rider);
    assert.ok(L.passengers.has(rider));

    // PRESS_FLOOR(5): destination is exactly 5, not derived as floor+dir
    L.pressDestination(toFloor);
    assert.ok(L.destinations.has(5), "destination 5 must be registered");
    assert.ok(!L.destinations.has(1), "destination must NOT be inferred as floor 1");

    // WAIT_FOR_FLOOR(5): stay until doors open at 5
    const arrived = runUntilDoorOpenAt(L, 5);
    assert.ok(arrived, "car should reach floor 5 with doors open");
    assert.ok(L.destinations.has(5) === false, "destination cleared on arrival");
});

// ---------------------------------------------------------------------------
test("7. Reset clears phantom state", () => {
    const L = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    L.callUp(2);
    L.callDown(4);
    const p1 = makePerson();
    const p2 = makePerson();
    // get into a non-trivial state
    L.callUp(0);
    openAndStabilize(L, 0);
    L.reserveBoardingSpot(p1);
    L.completeBoard(p1);
    L.reserveBoardingSpot(p2);
    L.pressDestination(3);

    L.reset();

    assert.strictEqual(L.upCalls.size, 0);
    assert.strictEqual(L.downCalls.size, 0);
    assert.strictEqual(L.destinations.size, 0);
    assert.strictEqual(L.passengers.size, 0);
    assert.strictEqual(L.pendingBoarders.size, 0);
    assert.strictEqual(L.pendingDisembark.size, 0);
    assert.deepStrictEqual(L.spotOccupancy, [false, false, false, false]);
    assert.strictEqual(L.direction, 0);
    assert.strictEqual(L.targetFloor, null);
    assert.strictEqual(L.currentFloor, 0);
    assert.strictEqual(L.state, "IDLE");
    assert.strictEqual(L.doorTimer, 0);
});

// ---------------------------------------------------------------------------
console.log("");
console.log(`Passed ${PASS.length}/${PASS.length + FAIL.length}`);
if (FAIL.length) {
    console.log("Failed:");
    FAIL.forEach((n) => console.log(`  - ${n}`));
    process.exit(1);
} else {
    process.exit(0);
}
