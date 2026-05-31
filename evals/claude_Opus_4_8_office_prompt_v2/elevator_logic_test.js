// elevator_logic_test.js — deterministic Node tests. Run: node elevator_logic_test.js
const assert = require("assert");
const { ElevatorLogic } = require("./elevator_logic.js");

const DT = 0.1;           // fixed step, deterministic
const CAP = 5000;         // iteration cap so a broken machine fails instead of hanging

let passed = 0, failed = 0;
const failures = [];
function test(name, fn) {
    try { fn(); passed++; console.log("  PASS  " + name); }
    catch (e) { failed++; failures.push(name); console.log("  FAIL  " + name + "\n        " + e.message); }
}

// --- helpers ---------------------------------------------------------------
function makeEl(opts) { return new ElevatorLogic(opts || {}); }

function tickUntil(el, predicate, label) {
    for (let i = 0; i < CAP; i++) {
        if (predicate(el)) return i;
        el.tick(DT);
    }
    throw new Error("tickUntil exceeded cap waiting for: " + (label || "predicate"));
}
function runUntilDoorOpenAt(el, floor) {
    tickUntil(el, function (e) { return e.state === "DOOR_OPEN" && e.currentFloor === floor; },
        "DOOR_OPEN at " + floor);
}
function runUntilDoorClosed(el) {
    // Wait until we have left DOOR_CLOSING (doors fully shut: IDLE or MOVING).
    tickUntil(el, function (e) { return e.state === "IDLE" || e.state === "MOVING"; }, "doors closed");
}

const P = function (n) { return { id: n }; }; // lightweight person stand-ins

// --- 1. Lobby rush: more callers than capacity -----------------------------
test("lobby rush — full car leaves floor 0 going up, doesn't re-serve floor 0", function () {
    const el = makeEl({ floorCount: 6, maxCapacity: 4 });
    el.callUp(0);
    runUntilDoorOpenAt(el, 0);

    const riders = [P(1), P(2), P(3), P(4)];
    riders.forEach(function (p) {
        const spot = el.reserveBoardingSpot(p);
        assert.ok(spot, "should reserve a spot while capacity remains");
        el.completeBoard(p);
    });
    assert.strictEqual(el.currentCapacityFree(), 0, "car should be full after 4 board");

    // Riders pick upper floors.
    el.pressDestination(2);
    el.pressDestination(3);
    el.pressDestination(5);

    // Leftover lobby callers keep mashing UP at floor 0.
    el.callUp(0); el.tick(DT); el.callUp(0); el.tick(DT); el.callUp(0);

    runUntilDoorClosed(el);
    assert.ok(el.targetFloor > 0, "next target must be above floor 0, got " + el.targetFloor);
    assert.strictEqual(el.direction, 1, "car should be heading up");
});

// --- 2. Passenger destinations outrank same-floor hall calls ---------------
test("same-floor hall call does not cause an immediate reopen when riders have a destination", function () {
    const el = makeEl({ floorCount: 6, maxCapacity: 4 });
    el.callUp(0);
    runUntilDoorOpenAt(el, 0);
    const p = P(1);
    el.completeBoard(Object.assign(p, el.reserveBoardingSpot(p) ? p : p));
    el.pressDestination(4);                 // rider going to 4

    // Close doors, start moving up.
    tickUntil(el, function (e) { return e.state === "MOVING"; }, "MOVING away from 0");
    // Now a same-floor-style hall call appears below; must not drag us back.
    el.callUp(0);
    let reopenedAt0 = false;
    for (let i = 0; i < 400; i++) {
        el.tick(DT);
        if (el.state === "DOOR_OPEN" && el.currentFloor === 0) reopenedAt0 = true;
        if (el.state === "DOOR_OPEN" && el.currentFloor === 4) break;
    }
    assert.ok(!reopenedAt0, "must not reopen at floor 0 before serving the rider's destination");
    assert.strictEqual(el.currentFloor, 4, "rider's destination (4) should be served");
});

// --- 3. Repeated hall-call pressing cannot starve riders -------------------
test("hammering callUp(0) cannot starve in-car destinations", function () {
    const el = makeEl({ floorCount: 6, maxCapacity: 4 });
    el.callUp(0);
    runUntilDoorOpenAt(el, 0);
    const p = P(1);
    el.reserveBoardingSpot(p); el.completeBoard(p);
    el.pressDestination(5);

    let reached5 = false;
    for (let i = 0; i < CAP; i++) {
        el.callUp(0);                       // never stops pressing
        el.tick(DT);
        if (el.currentFloor === 5 && el.state === "DOOR_OPEN") { reached5 = true; break; }
    }
    assert.ok(reached5, "car must still reach the passenger destination at floor 5");
});

// --- 4. Opposite-direction calls wait their turn ---------------------------
test("a DOWN call below does not reverse a car moving UP with work above", function () {
    const el = makeEl({ floorCount: 6, maxCapacity: 4 });
    el.callUp(1);
    runUntilDoorOpenAt(el, 1);
    const p = P(1);
    el.reserveBoardingSpot(p); el.completeBoard(p);
    el.pressDestination(5);                 // going up to 5
    tickUntil(el, function (e) { return e.state === "MOVING" && e.direction === 1; }, "moving up");

    el.callDown(0);                         // someone below wants to go down
    // The car must reach 5 without ever dipping below floor 1 to chase the down call.
    let minPos = el.position;
    for (let i = 0; i < CAP; i++) {
        el.tick(DT);
        minPos = Math.min(minPos, el.position);
        if (el.currentFloor === 5 && el.state === "DOOR_OPEN") break;
    }
    assert.strictEqual(el.currentFloor, 5, "should serve upward destination first");
    assert.ok(minPos >= 1 - 1e-6, "car must not reverse below floor 1, dipped to " + minPos);
});

// --- 5. Door hold + safety cap ---------------------------------------------
test("doors hold for pending disembark past MIN, but close after MAX safety cap", function () {
    const el = makeEl({ floorCount: 6, maxCapacity: 4 });
    el.callUp(0);
    runUntilDoorOpenAt(el, 0);
    const p = P(1);
    el.reserveBoardingSpot(p); el.completeBoard(p);
    el.pressDestination(2);
    runUntilDoorOpenAt(el, 2);

    // Passenger registers intent to leave but never completes — door must hold...
    el.registerDisembark(p);
    let held = 0;
    for (let i = 0; i < CAP; i++) {
        el.tick(DT);
        if (el.state === "DOOR_OPEN") held += DT;
        else break;                          // doors finally closed via MAX cap
    }
    assert.ok(held >= el.MIN_DOOR_OPEN_S, "should hold at least MIN_DOOR_OPEN_S");
    assert.ok(held <= el.MAX_DOOR_OPEN_S + 1, "must eventually force-close near MAX_DOOR_OPEN_S, held " + held);
    assert.ok(el.state !== "DOOR_OPEN", "doors must not stay open forever");
});

// --- 6. Destination preserved across the action handshake ------------------
test("rider from 0 to 5 keeps destination 5 (not floor+dir=1) through the handshake", function () {
    const el = makeEl({ floorCount: 6, maxCapacity: 4 });
    // WAIT_AT_PANEL: press up at 0.
    el.callUp(0);
    runUntilDoorOpenAt(el, 0);
    assert.ok(el.isAcceptingAt(0, 1), "should accept an UP boarder at floor 0");
    // ENTER_ELEVATOR: reserve + board.
    const rider = P(42);
    const spot = el.reserveBoardingSpot(rider);
    assert.ok(spot, "reserve a spot");
    el.completeBoard(rider);
    // PRESS_FLOOR: the explicit destination from the plan, NOT inferred from direction.
    el.pressDestination(5);
    // WAIT_FOR_FLOOR: ride until DOOR_OPEN at 5; must never stop-and-open at 1 as the goal.
    let openedAt1AsTarget = false;
    for (let i = 0; i < CAP; i++) {
        el.tick(DT);
        if (el.state === "DOOR_OPEN" && el.currentFloor === 1) openedAt1AsTarget = true;
        if (el.state === "DOOR_OPEN" && el.currentFloor === 5) break;
    }
    assert.ok(!openedAt1AsTarget, "must not treat the destination as floor 1");
    assert.strictEqual(el.currentFloor, 5, "must deliver the rider to floor 5");
    assert.ok(!el.destinations.has(5), "destination 5 cleared on arrival");
});

// --- 7. Reset clears phantom state -----------------------------------------
test("reset() clears calls, destinations, passengers, pending sets, spots, dir, target, timers", function () {
    const el = makeEl({ floorCount: 6, maxCapacity: 4 });
    el.callUp(0); el.callDown(3); el.pressDestination(4);
    runUntilDoorOpenAt(el, 0);
    const p = P(1);
    el.reserveBoardingSpot(p); el.completeBoard(p);
    el.registerDisembark(P(2));
    el.tick(DT); el.tick(DT);

    el.reset();
    assert.strictEqual(el.upCalls.size, 0, "upCalls cleared");
    assert.strictEqual(el.downCalls.size, 0, "downCalls cleared");
    assert.strictEqual(el.destinations.size, 0, "destinations cleared");
    assert.strictEqual(el.passengers.size, 0, "passengers cleared");
    assert.strictEqual(el.pendingBoarders.size, 0, "pendingBoarders cleared");
    assert.strictEqual(el.pendingDisembark.size, 0, "pendingDisembark cleared");
    assert.ok(el.spots.every(function (s) { return s === null; }), "spot occupancy cleared");
    assert.strictEqual(el.spotByPerson.size, 0, "spot map cleared");
    assert.strictEqual(el.direction, 0, "direction reset");
    assert.strictEqual(el.targetFloor, 0, "target reset");
    assert.strictEqual(el.currentFloor, 0, "parked at floor 0");
    assert.strictEqual(el.doorPos, 0, "doors closed");
    assert.strictEqual(el.state, "IDLE", "state idle");
});

// --- summary ---------------------------------------------------------------
console.log("\n" + (failed === 0 ? "ALL PASS" : "SOME FAILED") +
    "  (" + passed + " passed, " + failed + " failed)");
if (failed > 0) { console.log("Failed: " + failures.join(", ")); process.exit(1); }
