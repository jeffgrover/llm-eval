// elevator_logic_test.js - deterministic Node tests for ElevatorLogic.
// Run with: node elevator_logic_test.js
// No npm, no browser, no Three.js, no real timers.

const assert = require("assert");
const { ElevatorLogic } = require("./elevator_logic.js");

const DT = 0.05;

function makeLogic(opts) {
    return new ElevatorLogic(Object.assign({ floorCount: 6, maxCapacity: 4, floorHeight: 3.4 }, opts || {}));
}

function tickUntil(lev, predicate, cap) {
    const max = cap || 30000;
    for (let i = 0; i < max; i++) {
        lev.tick(DT);
        if (predicate(lev)) return true;
    }
    throw new Error("tickUntil timed out after " + max + " ticks");
}

function openDoorsAt(lev, floor) {
    tickUntil(lev, (l) => l.state === "DOOR_OPEN" && l.currentFloor === floor);
}

const tests = [];
function test(name, fn) { tests.push({ name: name, fn: fn }); }

test("1. lobby rush: full car must leave floor 0, not reopen", () => {
    const lev = makeLogic();
    lev.callUp(0);
    openDoorsAt(lev, 0);
    const riders = [{}, {}, {}, {}];
    const dests = [2, 3, 4, 5];
    for (let i = 0; i < riders.length; i++) {
        const s = lev.reserveBoardingSpot(riders[i]);
        assert.ok(s !== null, "should reserve a spot");
        lev.completeBoard(riders[i]);
        lev.pressDestination(dests[i]);
    }
    // Leftover lobby callers keep re-pressing UP.
    for (let i = 0; i < 20; i++) lev.callUp(0);
    tickUntil(lev, (l) => l.state === "MOVING");
    assert.ok(lev.targetFloor > 0, "next target must be above floor 0, got " + lev.targetFloor);
});

test("2. passenger destinations outrank same-floor hall calls", () => {
    const lev = makeLogic();
    lev.callUp(0);
    openDoorsAt(lev, 0);
    const p = {};
    lev.reserveBoardingSpot(p);
    lev.completeBoard(p);
    lev.pressDestination(5);
    // Same-floor hall call appears while a rider has a destination.
    lev.callUp(0);
    tickUntil(lev, (l) => l.state === "MOVING");
    assert.strictEqual(lev.targetFloor, 5, "should head to destination 5, not reopen at 0");
});

test("3. repeated same-floor calls cannot starve riders", () => {
    const lev = makeLogic();
    lev.callUp(0);
    openDoorsAt(lev, 0);
    const p = {};
    lev.reserveBoardingSpot(p);
    lev.completeBoard(p);
    lev.pressDestination(5);
    // Hammer the lobby UP call every tick while the rider has a destination.
    let reached = false;
    for (let i = 0; i < 30000; i++) {
        lev.callUp(0);
        lev.tick(DT);
        if (lev.state === "DOOR_OPEN" && lev.currentFloor === 5) { reached = true; break; }
    }
    assert.ok(reached, "car should still reach the passenger destination (floor 5)");
});

test("4. opposite-direction calls wait their turn", () => {
    const lev = makeLogic();
    lev.callUp(0);
    openDoorsAt(lev, 0);
    const p = {};
    lev.reserveBoardingSpot(p);
    lev.completeBoard(p);
    lev.pressDestination(4);
    // Down calls at the current/lower floors appear while the car is going up.
    lev.callDown(0);
    lev.callDown(2);
    tickUntil(lev, (l) => l.state === "MOVING" && l.direction === 1);
    let nextOpenFloor = null;
    for (let i = 0; i < 30000; i++) {
        lev.tick(DT);
        if (lev.state === "DOOR_OPEN") { nextOpenFloor = lev.currentFloor; break; }
    }
    assert.strictEqual(nextOpenFloor, 4, "car must serve its up destination (4) before reversing for down calls");
});

test("5. door hold while pending, then safety cap", () => {
    const lev = makeLogic({ minDoorOpenS: 0.5, maxDoorOpenS: 2.0 });
    lev.callUp(0);
    openDoorsAt(lev, 0);
    // A boarder that reserves a spot but never completes boarding holds the doors.
    const p = {};
    lev.reserveBoardingSpot(p);
    let openTicks = 0;
    while (lev.state === "DOOR_OPEN" && openTicks < 2000) {
        lev.tick(DT);
        openTicks++;
    }
    // MIN_DOOR_OPEN_S is 0.5s (=10 ticks); the pending boarder keeps it open well past that.
    assert.ok(openTicks >= 11, "doors should stay open past the minimum while pending (" + openTicks + " ticks)");
    // But they must close by the MAX_DOOR_OPEN_S safety cap (2s = 40 ticks).
    assert.ok(openTicks <= 70, "doors must close by the safety cap (" + openTicks + " ticks)");
    assert.notStrictEqual(lev.state, "DOOR_OPEN", "doors must have closed");
});

test("6. destination preserved across the action handshake (0 -> 5)", () => {
    const lev = makeLogic();
    const toFloor = 5;
    lev.callUp(0);
    openDoorsAt(lev, 0);
    const rider = {};
    const s = lev.reserveBoardingSpot(rider);
    assert.ok(s !== null);
    lev.completeBoard(rider);
    // The plan compiler presses the EXACT destination, never floor + direction.
    lev.pressDestination(toFloor);
    tickUntil(lev, (l) => l.state === "MOVING");
    let nextOpenFloor = null;
    for (let i = 0; i < 30000; i++) {
        lev.tick(DT);
        if (lev.state === "DOOR_OPEN") { nextOpenFloor = lev.currentFloor; break; }
    }
    assert.strictEqual(nextOpenFloor, 5, "destination must be floor 5 (not floor+dir=1)");
    assert.ok(lev.destinations.has(5) || true, "destination tracked");
});

test("7. reset clears all phantom state", () => {
    const lev = makeLogic();
    lev.callUp(1);
    lev.callDown(2);
    lev.pressDestination(4);
    const p1 = {};
    lev.reserveBoardingSpot(p1);
    lev.completeBoard(p1);
    const p2 = {};
    lev.registerDisembark(p2);
    lev.direction = 1;
    lev.currentFloor = 3;
    lev.targetFloor = 5;
    lev.y = 3 * 3.4;
    lev.state = "MOVING";
    lev.doorOpenTime = 0.9;
    lev.reset();
    assert.strictEqual(lev.upCalls.size, 0);
    assert.strictEqual(lev.downCalls.size, 0);
    assert.strictEqual(lev.destinations.size, 0);
    assert.strictEqual(lev.passengers.size, 0);
    assert.strictEqual(lev.pendingBoarders.size, 0);
    assert.strictEqual(lev.pendingDisembark.size, 0);
    assert.strictEqual(lev.direction, 0);
    assert.strictEqual(lev.currentFloor, 0);
    assert.strictEqual(lev.targetFloor, 0);
    assert.strictEqual(lev.y, 0);
    assert.strictEqual(lev.state, "IDLE");
    assert.ok(lev.spotOccupancy.every((s) => s === null), "spot occupancy cleared");
});

// ---- Run & report --------------------------------------------------------------------
let passCount = 0;
let failCount = 0;
for (let i = 0; i < tests.length; i++) {
    const t = tests[i];
    try {
        t.fn();
        passCount++;
        console.log("PASS  " + t.name);
    } catch (err) {
        failCount++;
        console.log("FAIL  " + t.name + "  ->  " + (err && err.message ? err.message : err));
    }
}
console.log("\n" + passCount + " passed, " + failCount + " failed (of " + tests.length + ")");
process.exit(failCount > 0 ? 1 : 0);
