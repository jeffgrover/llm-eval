// elevator_logic_test.js - Deterministic Node tests for ElevatorLogic
// Run with: node elevator_logic_test.js
// Uses only Node built-ins (no npm, no browser).

const assert = require("assert");
const { ElevatorLogic } = require("./elevator_logic.js");

const LOGIC = ElevatorLogic.STATE;
const DOOR_TRANSIT = ElevatorLogic.DOOR_TRANSIT_S;
const MIN_DOOR = ElevatorLogic.MIN_DOOR_OPEN_S;
const MAX_DOOR = ElevatorLogic.MAX_DOOR_OPEN_S;

let passed = 0;
let failed = 0;

function log(msg) { console.log(msg); }
function pass(name) { passed += 1; log("  PASS  " + name); }
function fail(name, err) {
    failed += 1;
    log("  FAIL  " + name + " :: " + (err && err.message ? err.message : err));
}

// Tick until predicate is true or cap exceeded
function tickUntil(logic, predicate, dt, maxSeconds) {
    const maxTicks = Math.ceil((maxSeconds || 30) / dt);
    for (let i = 0; i < maxTicks; i++) {
        if (predicate()) return i;
        logic.tick(dt);
    }
    throw new Error("tickUntil: predicate not satisfied within " + maxSeconds + "s");
}

function tickN(logic, dt, n) {
    for (let i = 0; i < n; i++) logic.tick(dt);
}

function test(name, fn) {
    try {
        fn();
        pass(name);
    } catch (err) {
        fail(name, err);
    }
}

// =================== Test 1: Lobby rush with more callers than capacity ===================
test("Lobby rush: car leaves floor 0 even with more UP callers than capacity", function () {
    const el = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    el.callUp(0);
    // Open doors at floor 0
    tickUntil(el, function () { return el.state === LOGIC.DOOR_OPEN && el.currentFloor === 0; }, 0.05, 10);
    // Board 4 people, each going to a different upper floor
    for (let i = 0; i < 4; i++) {
        const p = { id: "p" + i };
        const r = el.reserveBoardingSpot(p);
        assert.ok(r, "spot should be reserved for p" + i);
        el.completeBoard(p, 1 + i);
    }
    // Simulate leftover lobby waiters re-pressing UP
    for (let i = 0; i < 5; i++) el.callUp(0);
    // Wait for door close to complete and car to leave
    tickUntil(el, function () { return el.state === LOGIC.MOVING || el.state === LOGIC.IDLE; }, 0.05, 10);
    // If still idle, force one more tick
    if (el.state === LOGIC.IDLE) el.tick(0.05);
    // After closing, target must NOT be floor 0
    const next = el.targetFloor;
    if (next === 0) {
        throw new Error("next target is floor 0 (would reopen instead of serving passengers); state=" + el.state);
    }
    if (next < 1 || next > 5) {
        throw new Error("next target is " + next + " - expected a passenger destination");
    }
});

// =================== Test 2: Passenger destinations outrank same-floor hall calls ===================
test("Passenger destinations outrank same-floor hall calls", function () {
    const el = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    el.callUp(0);
    tickUntil(el, function () { return el.state === LOGIC.DOOR_OPEN && el.currentFloor === 0; }, 0.05, 10);
    const p1 = { id: "p1" };
    el.reserveBoardingSpot(p1);
    el.completeBoard(p1, 3);
    // Press a same-floor hall call (which doesn't make physical sense but the test ensures the
    // "don't reopen at the same floor" rule applies even when something presses UP again)
    el.callUp(0);
    el.callDown(0);
    // Wait for doors to close
    tickUntil(el, function () { return el.state === LOGIC.DOOR_CLOSING || el.state === LOGIC.MOVING || el.state === LOGIC.IDLE; }, 0.05, 10);
    // After close, we must be moving toward an upper floor (passenger destination)
    if (el.state === LOGIC.MOVING) {
        if (el.targetFloor < 1) {
            throw new Error("car is moving back DOWN or staying - passenger destination was lost");
        }
    } else {
        // If still idle, then it should have picked the passenger destination
        if (el.destinations.size === 0) {
            throw new Error("lost destination after door close");
        }
    }
});

// =================== Test 3: Repeated hall-call pressing cannot starve riders ===================
test("Repeated lobby UP calls cannot starve passengers", function () {
    const el = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    el.callUp(0);
    tickUntil(el, function () { return el.state === LOGIC.DOOR_OPEN && el.currentFloor === 0; }, 0.05, 10);
    for (let i = 0; i < 4; i++) {
        const p = { id: "p" + i };
        el.reserveBoardingSpot(p);
        el.completeBoard(p, 1 + i);
    }
    // Hammer UP from floor 0 every tick
    const reachedUpper = (function () {
        for (let t = 0; t < 200; t++) {
            el.callUp(0);
            el.tick(0.1);
            if (el.currentFloor >= 1) return true;
        }
        return false;
    })();
    if (!reachedUpper) {
        throw new Error("car never left floor 0; stuck with lobby UP calls");
    }
});

// =================== Test 4: Opposite-direction calls wait their turn ===================
test("Opposite-direction calls wait their turn", function () {
    const el = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    el.callUp(0);
    el.callUp(5);
    // Add a DOWN call at floor 1; this should not reverse the car immediately
    el.callDown(1);
    tickUntil(el, function () { return el.state === LOGIC.DOOR_OPEN && el.currentFloor === 0; }, 0.05, 10);
    const p = { id: "p" };
    el.reserveBoardingSpot(p);
    el.completeBoard(p, 5);
    // Door close, then move up
    tickUntil(el, function () { return el.state === LOGIC.MOVING && el.direction > 0; }, 0.05, 10);
    if (el.targetFloor !== 5) {
        throw new Error("expected target 5, got " + el.targetFloor);
    }
});

// =================== Test 5: Door hold and safety cap ===================
test("Doors hold while pending boarders/disembarkers exist, then cap fires", function () {
    const el = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    el.callUp(0);
    tickUntil(el, function () { return el.state === LOGIC.DOOR_OPEN && el.currentFloor === 0; }, 0.05, 10);
    // Reserve 2 spots but never complete - door should stay open
    const p1 = { id: "p1" };
    const p2 = { id: "p2" };
    el.reserveBoardingSpot(p1);
    el.reserveBoardingSpot(p2);
    // Tick 4s - should still be DOOR_OPEN
    tickN(el, 0.5, 8);
    if (el.state !== LOGIC.DOOR_OPEN) {
        throw new Error("door closed early with pending boarders (state=" + el.state + ")");
    }
    // Tick until MAX_DOOR_OPEN_S + safety margin
    tickN(el, 0.5, 12);
    if (el.state === LOGIC.DOOR_OPEN) {
        throw new Error("door held past MAX_DOOR_OPEN_S (state=" + el.state + ")");
    }
});

// =================== Test 6: Destination preserved across the action handshake ===================
test("Destination preserved across action handshake (floor 0 -> floor 5)", function () {
    const el = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    el.callUp(0);
    tickUntil(el, function () { return el.state === LOGIC.DOOR_OPEN && el.currentFloor === 0; }, 0.05, 10);
    const p = { id: "p" };
    const r = el.reserveBoardingSpot(p);
    assert.ok(r, "spot reserved");
    el.completeBoard(p, 5);
    assert.ok(el.destinations.has(5), "destination floor 5 should be set after completeBoard");
    // The target after door close should be 5, not 1
    tickUntil(el, function () { return el.state === LOGIC.MOVING || el.state === LOGIC.IDLE; }, 0.05, 10);
    if (el.state === LOGIC.MOVING) {
        if (el.targetFloor !== 5) {
            throw new Error("target floor is " + el.targetFloor + " (expected 5)");
        }
    } else {
        if (el.destinations.has(1)) {
            throw new Error("destinations accidentally set to floor 1");
        }
    }
});

// =================== Test 7: Reset clears phantom state ===================
test("reset() clears all state", function () {
    const el = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    el.callUp(0);
    el.callDown(3);
    el.pressDestination(4);
    el.reserveBoardingSpot({ id: "x" });
    el.reset();
    if (el.upCalls.size !== 0) throw new Error("upCalls not cleared");
    if (el.downCalls.size !== 0) throw new Error("downCalls not cleared");
    if (el.destinations.size !== 0) throw new Error("destinations not cleared");
    if (el.passengers.size !== 0) throw new Error("passengers not cleared");
    if (el.pendingBoarders.size !== 0) throw new Error("pendingBoarders not cleared");
    if (el.pendingDisembark.size !== 0) throw new Error("pendingDisembark not cleared");
    for (let i = 0; i < el.spotOccupancy.length; i++) {
        if (el.spotOccupancy[i] !== null) throw new Error("spot " + i + " not cleared");
    }
    if (el.direction !== 0) throw new Error("direction not cleared");
    if (el.targetFloor !== 0) throw new Error("targetFloor not reset to 0");
    if (el.state !== LOGIC.IDLE) throw new Error("state not reset to IDLE");
});

// =================== Test 8 (bonus): capacity gate ===================
test("currentCapacityFree respects pending boarders", function () {
    const el = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    const free0 = el.currentCapacityFree();
    if (free0 !== 4) throw new Error("expected 4 free, got " + free0);
    for (let i = 0; i < 4; i++) {
        el.reserveBoardingSpot({ id: "p" + i });
    }
    if (el.currentCapacityFree() !== 0) throw new Error("expected 0 free, got " + el.currentCapacityFree());
    if (el.reserveBoardingSpot({ id: "p5" }) !== null) throw new Error("5th boarder should be rejected");
});

// =================== Test 9 (bonus): disembark releases spot ===================
test("Disembark frees spot", function () {
    const el = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    el.callUp(0);
    tickUntil(el, function () { return el.state === LOGIC.DOOR_OPEN && el.currentFloor === 0; }, 0.05, 10);
    const p = { id: "p" };
    el.reserveBoardingSpot(p);
    el.completeBoard(p, 3);
    el.registerDisembark(p);
    el.completeDisembark(p);
    if (el.spotOccupancy[0] !== null) throw new Error("spot should be free after disembark");
    if (el.currentCapacityFree() !== 4) throw new Error("expected 4 free after disembark");
});

// =================== Summary ===================
console.log("");
console.log("Tests: " + (passed + failed) + " | Pass: " + passed + " | Fail: " + failed);
if (failed > 0) {
    process.exit(1);
} else {
    process.exit(0);
}
