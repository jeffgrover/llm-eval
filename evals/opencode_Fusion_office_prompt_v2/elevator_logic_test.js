const assert = require("assert");
const { ElevatorLogic } = require("./elevator_logic.js");

const S = ElevatorLogic.STATE;
let passed = 0, failed = 0;
const failures = [];

function test(name, fn) {
    try {
        fn();
        passed++;
        console.log("  PASS  " + name);
    } catch (e) {
        failed++;
        failures.push(name + ": " + e.message);
        console.log("  FAIL  " + name + " -> " + e.message);
    }
}

function makeLogic(opts) {
    return new ElevatorLogic(Object.assign({ floorCount: 6, maxCapacity: 4, floorHeight: 3.4 }, opts || {}));
}

// Generic driver with iteration cap.
function tickUntil(el, predicate, maxIter) {
    maxIter = maxIter || 100000;
    let i = 0;
    while (i++ < maxIter) {
        if (predicate(el)) return true;
        el.tick(0.1);
    }
    return false;
}

function runUntilDoorOpenAt(el, floor, maxIter) {
    return tickUntil(el, (e) => e.state === S.DOOR_OPEN && e.currentFloor === floor, maxIter);
}

function runUntilDoorClosed(el, maxIter) {
    // Wait for a full close transition (back to IDLE or MOVING).
    const startState = el.state;
    return tickUntil(el, (e) => e.state === S.IDLE || e.state === S.MOVING, maxIter);
}

// ---- Test 1: Lobby rush, more callers than capacity ----
test("Lobby rush: full car leaves floor 0 instead of reopening", () => {
    const el = makeLogic();
    el.callUp(0);
    assert.ok(runUntilDoorOpenAt(el, 0, 2000), "doors should open at floor 0");

    // Board exactly four people.
    const people = ["a", "b", "c", "d"];
    for (const p of people) {
        const spot = el.reserveBoardingSpot(p);
        assert.ok(spot, "spot should be reserved for " + p);
    }
    assert.strictEqual(el.reserveBoardingSpot("e"), null, "fifth boarder rejected");

    for (const p of people) el.completeBoard(p);
    el.pressDestination(3);
    el.pressDestination(5);

    // Leftover lobby callers keep pressing UP.
    el.callUp(0);
    el.callUp(0);

    // Let doors close.
    assert.ok(tickUntil(el, (e) => e.state === S.MOVING || e.state === S.DOOR_CLOSING, 2000), "should start closing/moving");
    // After closing, the next target must be above floor 0.
    assert.ok(tickUntil(el, (e) => e.state === S.MOVING && e.targetFloor > 0, 2000), "must move above floor 0");
    assert.ok(el.targetFloor > 0, "target above 0, got " + el.targetFloor);
});

// ---- Test 2: Passenger destinations outrank same-floor hall calls ----
test("Passenger destinations outrank same-floor hall call (no immediate reopen)", () => {
    const el = makeLogic();
    el.callUp(0);
    runUntilDoorOpenAt(el, 0, 2000);
    el.reserveBoardingSpot("p");
    el.completeBoard("p");
    el.pressDestination(4);
    // New same-floor hall call.
    el.callUp(0);
    // Drive until doors closed; ensure we do NOT reopen at floor 0.
    let reopenedAt0 = false;
    let i = 0;
    let sawClosing = false;
    while (i++ < 3000) {
        el.tick(0.1);
        if (el.state === S.DOOR_CLOSING) sawClosing = true;
        if (sawClosing && el.state === S.DOOR_OPEN && el.currentFloor === 0) reopenedAt0 = true;
        if (el.state === S.MOVING && el.currentFloor === 0 && el.targetFloor > 0) break;
    }
    assert.ok(!reopenedAt0, "must not reopen at floor 0 with pending destination");
    assert.ok(el.destinations.has(4) || el.currentFloor === 4, "destination 4 preserved/served");
});

// ---- Test 3: Repeated hall-call pressing cannot starve riders ----
test("Repeated callUp(0) cannot starve riders with destinations", () => {
    const el = makeLogic();
    el.callUp(0);
    runUntilDoorOpenAt(el, 0, 2000);
    el.reserveBoardingSpot("p");
    el.completeBoard("p");
    el.pressDestination(5);

    let reached5 = false;
    let i = 0;
    while (i++ < 5000) {
        el.callUp(0); // spam
        el.tick(0.1);
        if (el.state === S.DOOR_OPEN && el.currentFloor === 5) { reached5 = true; break; }
    }
    assert.ok(reached5, "car must reach destination floor 5 despite hall spam");
});

// ---- Test 4: Opposite-direction calls wait their turn ----
test("DOWN call does not reverse car while UP work remains", () => {
    const el = makeLogic();
    // Car at 0, passenger going to 5.
    el.callUp(0);
    runUntilDoorOpenAt(el, 0, 2000);
    el.reserveBoardingSpot("p");
    el.completeBoard("p");
    el.pressDestination(5);
    // Move up a bit.
    tickUntil(el, (e) => e.state === S.MOVING && e.currentFloor >= 2, 2000);
    // A DOWN call appears at floor 1 (below) and floor 2.
    el.callDown(1);
    el.callDown(2);
    // Should still go up to 5 first; direction must remain +1 until 5 served.
    let servedUp = false;
    let reversedEarly = false;
    let i = 0;
    while (i++ < 3000) {
        el.tick(0.1);
        if (el.direction < 0 && el.currentFloor > 0 && !servedUp) reversedEarly = true;
        if (el.state === S.DOOR_OPEN && el.currentFloor === 5) { servedUp = true; break; }
    }
    assert.ok(servedUp, "should serve floor 5 going up");
    assert.ok(!reversedEarly, "must not reverse before serving upward destination");
});

// ---- Test 5: Door hold and safety cap ----
test("Door holds while pending, then closes at MAX_DOOR_OPEN_S", () => {
    const el = makeLogic();
    el.callUp(0);
    runUntilDoorOpenAt(el, 0, 2000);
    // Register a boarder that never completes.
    el.reserveBoardingSpot("stuck");
    // Past min open time, doors must stay open because pendingBoarders > 0.
    let t = 0;
    while (t < ElevatorLogic.MIN_DOOR_OPEN_S + 1.0) { el.tick(0.1); t += 0.1; }
    assert.strictEqual(el.state, S.DOOR_OPEN, "doors held open by pending boarder");
    // Eventually MAX_DOOR_OPEN_S forces close.
    let closed = false;
    let i = 0;
    while (i++ < 500) {
        el.tick(0.1);
        if (el.state !== S.DOOR_OPEN) { closed = true; break; }
    }
    assert.ok(closed, "doors close after MAX_DOOR_OPEN_S even with stuck boarder");
});

// ---- Test 6: Destination preserved across the handshake (0 -> 5) ----
test("Destination 5 preserved through WAIT->ENTER->PRESS->WAIT_FOR_FLOOR", () => {
    const el = makeLogic();
    // WAIT_AT_PANEL: rider calls up.
    el.callUp(0);
    assert.ok(runUntilDoorOpenAt(el, 0, 2000), "doors open at 0");
    assert.ok(el.isAcceptingAt(0, 1), "accepting up at 0");
    // ENTER_ELEVATOR: reserve + board.
    const spot = el.reserveBoardingSpot("rider");
    assert.ok(spot, "reserved spot");
    el.completeBoard("rider");
    // PRESS_FLOOR: explicit destination 5 (not floor+dir=1).
    el.pressDestination(5);
    assert.ok(el.destinations.has(5), "destination is 5");
    assert.ok(!el.destinations.has(1), "destination is NOT 1");
    // WAIT_FOR_FLOOR.
    assert.ok(runUntilDoorOpenAt(el, 5, 5000), "arrives and opens at floor 5");
    assert.strictEqual(el.currentFloor, 5, "current floor 5");
});

// ---- Test 7: Reset clears phantom state ----
test("reset() clears all state", () => {
    const el = makeLogic();
    el.callUp(0); el.callDown(3); el.pressDestination(4);
    el.reserveBoardingSpot("x"); el.completeBoard("x");
    el.registerDisembark("x");
    el.tick(0.1); el.tick(0.1);
    el.reset();
    assert.strictEqual(el.upCalls.size, 0);
    assert.strictEqual(el.downCalls.size, 0);
    assert.strictEqual(el.destinations.size, 0);
    assert.strictEqual(el.passengers.size, 0);
    assert.strictEqual(el.pendingBoarders.size, 0);
    assert.strictEqual(el.pendingDisembark.size, 0);
    assert.strictEqual(el.direction, 0);
    assert.strictEqual(el.currentFloor, 0);
    assert.strictEqual(el.targetFloor, 0);
    assert.strictEqual(el.state, S.IDLE);
    assert.ok(el.spotOccupancy.every((s) => s == null), "spots cleared");
    assert.strictEqual(el.doorTimer, 0);
});

console.log("\n========================================");
console.log("  ElevatorLogic tests: " + passed + " passed, " + failed + " failed");
console.log("========================================");
if (failed > 0) {
    console.log("\nFailures:");
    failures.forEach((f) => console.log("  - " + f));
    process.exit(1);
}
process.exit(0);
