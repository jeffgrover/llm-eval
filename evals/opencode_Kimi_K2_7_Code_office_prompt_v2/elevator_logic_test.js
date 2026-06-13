/* elevator_logic_test.js — deterministic Node tests for ElevatorLogic */

const assert = require("assert");
const { ElevatorLogic } = require("./elevator_logic.js");

let failures = 0;
const tests = [];

function test(name, fn) {
    tests.push({ name, fn });
}

function runTests() {
    for (const t of tests) {
        try {
            t.fn();
            console.log(`  PASS: ${t.name}`);
        } catch (e) {
            failures++;
            console.log(`  FAIL: ${t.name}`);
            console.log(`    ${e.message}`);
        }
    }
    console.log(`\n${failures === 0 ? "PASS" : "FAIL"} — ${tests.length - failures}/${tests.length} tests passed`);
    process.exit(failures === 0 ? 0 : 1);
}

function tickUntil(el, pred, maxTicks = 20000) {
    for (let i = 0; i < maxTicks; i++) {
        el.tick(0.05);
        if (typeof pred === "string" ? el.state === pred : pred(el)) return i;
    }
    throw new Error(`tickUntil timed out waiting for ${typeof pred === "function" ? "predicate" : pred}`);
}

function runUntilDoorOpenAt(el, floor) {
    return tickUntil(el, () => el.state === "DOOR_OPEN" && el.currentFloor === floor);
}

function runUntilDoorClosed(el) {
    return tickUntil(el, () => el.doorOpen === 0 && el.state !== "DOOR_OPEN" && el.state !== "DOOR_OPENING");
}

// ---- Test 1: Lobby rush with more callers than capacity ----
test("Lobby rush: car leaves floor 0 after boarding 4", () => {
    const el = new ElevatorLogic({ floorCount: 6, maxCapacity: 4, floorHeight: 3.4 });
    el.callUp(0);
    runUntilDoorOpenAt(el, 0);

    const p1 = "p1", p2 = "p2", p3 = "p3", p4 = "p4";
    const spots = [p1, p2, p3, p4].map(p => el.reserveBoardingSpot(p));
    assert(spots.every(s => s !== null), "all four should get spots");
    el.pressDestination(3);
    el.pressDestination(5);
    el.pressDestination(2);
    el.pressDestination(4);
    [p1, p2, p3, p4].forEach(p => el.completeBoard(p));
    assert.strictEqual(el.passengers.size, 4);

    // Leftover waiters re-press UP while doors still open / closing
    el.callUp(0);
    runUntilDoorClosed(el);

    // Should pick a destination above floor 0, not floor 0 again
    tickUntil(el, () => el.state === "DOOR_OPEN");
    assert(el.currentFloor > 0, `expected currentFloor > 0 but got ${el.currentFloor}`);
});

// ---- Test 2: Passenger destinations outrank same-floor hall calls ----
test("Destinations outrank same-floor hall calls", () => {
    const el = new ElevatorLogic({ floorCount: 6, maxCapacity: 4, floorHeight: 3.4 });
    el.callUp(0);
    runUntilDoorOpenAt(el, 0);
    const p = "p";
    assert(el.reserveBoardingSpot(p));
    el.pressDestination(5);
    el.completeBoard(p);
    el.tick(0.1); // small advance so DOOR_OPEN timer moves a bit

    // Same-floor up call while a passenger wants to go to 5
    el.callUp(0);
    runUntilDoorClosed(el);

    assert.strictEqual(el.targetFloor, 5, `target should be 5 but was ${el.targetFloor}`);
    assert(el.state === "MOVING" || el.state === "DOOR_OPENING", "should be moving or arriving at 5");
});

// ---- Test 3: Repeated hall-call pressing cannot starve riders ----
test("Repeated callUp(0) does not starve riders", () => {
    const el = new ElevatorLogic({ floorCount: 6, maxCapacity: 4, floorHeight: 3.4 });
    el.callUp(0);
    runUntilDoorOpenAt(el, 0);
    const riders = ["a", "b", "c", "d"];
    riders.forEach(r => { assert(el.reserveBoardingSpot(r)); el.completeBoard(r); });
    el.pressDestination(5);
    el.pressDestination(4);
    el.pressDestination(3);
    el.pressDestination(2);

    let reached = false;
    for (let i = 0; i < 20000 && !reached; i++) {
        if (i % 50 === 0) el.callUp(0);
        el.tick(0.05);
        if (el.state === "DOOR_OPEN" && [2, 3, 4, 5].includes(el.currentFloor)) reached = true;
    }
    assert(reached, "car should have reached at least one passenger destination");
});

// ---- Test 4: Opposite-direction calls wait their turn ----
test("Opposite-direction calls wait until upward work is done", () => {
    const el = new ElevatorLogic({ floorCount: 6, maxCapacity: 4, floorHeight: 3.4 });
    el.callUp(0);
    runUntilDoorOpenAt(el, 0);
    const p = "p";
    assert(el.reserveBoardingSpot(p));
    el.pressDestination(5);
    el.completeBoard(p);
    runUntilDoorClosed(el);

    // While moving up, add a DOWN call at floor 2 (below target)
    el.callDown(2);

    // Car must still reach 5 first
    let hit5 = false;
    let hit2First = false;
    for (let i = 0; i < 20000; i++) {
        el.tick(0.05);
        if (el.state === "DOOR_OPEN" && el.currentFloor === 5) { hit5 = true; break; }
        if (el.state === "DOOR_OPEN" && el.currentFloor === 2) { hit2First = true; break; }
    }
    assert(hit5, "car should reach 5 before serving down call at 2");
    assert(!hit2First, "car should not reverse to 2 before reaching 5");

    // After serving 5, it should eventually go down to 2
    let hit2After = false;
    for (let i = 0; i < 20000; i++) {
        el.tick(0.05);
        if (el.state === "DOOR_OPEN" && el.currentFloor === 2) { hit2After = true; break; }
    }
    assert(hit2After, "car should eventually serve the down call at 2");
});

// ---- Test 5: Door hold and safety cap ----
test("Door hold with pending boarders; safety cap eventually closes", () => {
    const el = new ElevatorLogic({ floorCount: 6, maxCapacity: 4, floorHeight: 3.4, minDoorOpenS: 1.5, maxDoorOpenS: 4.0 });
    el.callUp(0);
    runUntilDoorOpenAt(el, 0);

    const p = "p";
    el.reserveBoardingSpot(p); // pending boarder holds the door

    // Let time pass while pending boarder is still pending (less than MAX)
    for (let i = 0; i < 30; i++) el.tick(0.05);
    assert.strictEqual(el.state, "DOOR_OPEN", "door should stay open with pending boarder");
    assert(el.doorTimer > el.minDoorOpenS, "door timer should exceed min open time");

    // Now complete the boarder; door should eventually close (before max cap because pending cleared)
    el.completeBoard(p);
    let closed = false;
    for (let i = 0; i < 2000; i++) {
        el.tick(0.05);
        if (el.doorOpen === 0 && el.state !== "DOOR_OPEN") { closed = true; break; }
    }
    assert(closed, "door should close after pending boarder clears");

    // Safety cap test: fresh car, boarder never completes
    const el2 = new ElevatorLogic({ floorCount: 6, maxCapacity: 4, floorHeight: 3.4, minDoorOpenS: 1.5, maxDoorOpenS: 2.0 });
    el2.callUp(0);
    runUntilDoorOpenAt(el2, 0);
    el2.reserveBoardingSpot("stall");
    let capped = false;
    for (let i = 0; i < 2000; i++) {
        el2.tick(0.05);
        if (el2.doorOpen === 0 && el2.state !== "DOOR_OPEN") { capped = true; break; }
    }
    assert(capped, "door should close via MAX_DOOR_OPEN_S even with pending boarder");
});

// ---- Test 6: Destination preserved across the action handshake ----
test("Destination 0->5 is preserved through boarding handshake", () => {
    const el = new ElevatorLogic({ floorCount: 6, maxCapacity: 4, floorHeight: 3.4 });
    const rider = "rider";

    // WAIT_AT_PANEL equivalent
    el.callUp(0);
    runUntilDoorOpenAt(el, 0);

    // ENTER_ELEVATOR + PRESS_FLOOR handshakes
    const spot = el.reserveBoardingSpot(rider);
    assert(spot);
    el.pressDestination(5);
    el.completeBoard(rider);

    // Ride to destination
    runUntilDoorClosed(el);
    let arrivedAt5 = false;
    for (let i = 0; i < 20000; i++) {
        el.tick(0.05);
        if (el.state === "DOOR_OPEN" && el.currentFloor === 5) { arrivedAt5 = true; break; }
    }
    assert(arrivedAt5, "rider going to floor 5 should arrive at floor 5, not floor 1");
    assert(!el.destinations.has(5), "destination 5 should be cleared after arrival");
});

// ---- Test 7: Reset clears phantom state ----
test("Reset clears all state", () => {
    const el = new ElevatorLogic({ floorCount: 6, maxCapacity: 4, floorHeight: 3.4 });
    el.callUp(0);
    el.callDown(5);
    el.pressDestination(3);
    const p = "p";
    el.reserveBoardingSpot(p);
    el.completeBoard(p);
    el.registerDisembark(p);
    el.tick(0.1);

    el.reset();
    assert.strictEqual(el.state, "IDLE");
    assert.strictEqual(el.direction, 0);
    assert.strictEqual(el.currentFloor, 0);
    assert.strictEqual(el.targetFloor, null);
    assert.strictEqual(el.y, 0);
    assert.strictEqual(el.doorOpen, 0);
    assert.strictEqual(el.upCalls.size, 0);
    assert.strictEqual(el.downCalls.size, 0);
    assert.strictEqual(el.destinations.size, 0);
    assert.strictEqual(el.passengers.size, 0);
    assert.strictEqual(el.pendingBoarders.size, 0);
    assert.strictEqual(el.pendingDisembark.size, 0);
    assert(el.spotOccupancy.every(v => !v));
    assert.strictEqual(el.servedThisDoorCycle, false);
    assert.strictEqual(el.lastServedFloor, null);
});

runTests();
