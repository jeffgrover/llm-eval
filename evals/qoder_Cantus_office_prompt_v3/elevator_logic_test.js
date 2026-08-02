// elevator_logic_test.js - deterministic Node tests for ElevatorLogic
// Run: node elevator_logic_test.js

const assert = require("assert");
const { ElevatorLogic } = require("./elevator_logic.js");

const DT = 0.05;
const MAX_ITER = 20000;

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
    try {
        fn();
        passed++;
        console.log("PASS: " + name);
    } catch (err) {
        failed++;
        failures.push(name + " -> " + err.message);
        console.log("FAIL: " + name + "\n     " + err.message);
    }
}

function tickUntil(ev, predicate, label) {
    for (let i = 0; i < MAX_ITER; i++) {
        if (predicate(ev)) { return i; }
        ev.tick(DT);
    }
    throw new Error("tickUntil timed out waiting for: " + (label || "predicate"));
}

function runUntilDoorOpenAt(ev, floor) {
    return tickUntil(ev, (e) => e.state === "DOOR_OPEN" && e.currentFloor === floor,
        "DOOR_OPEN at floor " + floor);
}

function runUntilDoorClosed(ev) {
    return tickUntil(ev, (e) => e.state === "IDLE" || e.state === "MOVING",
        "doors closed (IDLE or MOVING)");
}

test("1. Lobby rush: full car leaves floor 0 despite re-pressed UP calls", () => {
    const ev = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    ev.callUp(0);
    runUntilDoorOpenAt(ev, 0);
    const riders = ["r1", "r2", "r3", "r4"];
    riders.forEach((r) => {
        const spot = ev.reserveBoardingSpot(r);
        assert.ok(spot !== null, "spot for " + r);
    });
    assert.strictEqual(ev.reserveBoardingSpot("r5"), null, "5th boarder must be rejected");
    riders.forEach((r) => ev.completeBoard(r));
    ev.pressDestination(3);
    ev.pressDestination(5);
    // leftover lobby waiters keep pressing UP
    for (let i = 0; i < 40; i++) { ev.callUp(0); ev.tick(DT); }
    runUntilDoorClosed(ev);
    ev.callUp(0);
    tickUntil(ev, (e) => e.state === "MOVING", "car starts moving");
    assert.ok(ev.targetFloor > 0, "next target must be above floor 0, got " + ev.targetFloor);
    assert.strictEqual(ev.direction, 1, "direction must be up");
});

test("2. Passenger destinations outrank same-floor hall calls", () => {
    const ev = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    ev.callUp(0);
    runUntilDoorOpenAt(ev, 0);
    const spot = ev.reserveBoardingSpot("p1");
    assert.ok(spot);
    ev.completeBoard("p1");
    ev.pressDestination(4);
    ev.callUp(0); // same-floor hall call while passenger aboard
    runUntilDoorClosed(ev);
    // Must not reopen at floor 0; must head to 4.
    let reopenedAtZero = false;
    for (let i = 0; i < MAX_ITER; i++) {
        ev.callUp(0);
        ev.tick(DT);
        if (ev.state === "DOOR_OPENING" && ev.currentFloor === 0) { reopenedAtZero = true; break; }
        if (ev.state === "DOOR_OPEN" && ev.currentFloor === 4) { break; }
    }
    assert.strictEqual(reopenedAtZero, false, "must not reopen at floor 0");
    assert.strictEqual(ev.currentFloor, 4, "must reach floor 4");
});

test("3. Repeated hall-call pressing cannot starve riders", () => {
    const ev = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    ev.callUp(0);
    runUntilDoorOpenAt(ev, 0);
    ev.reserveBoardingSpot("a");
    ev.completeBoard("a");
    ev.pressDestination(5);
    let reached = false;
    for (let i = 0; i < MAX_ITER; i++) {
        ev.callUp(0); // spam every tick
        ev.tick(DT);
        if (ev.state === "DOOR_OPEN" && ev.currentFloor === 5) { reached = true; break; }
    }
    assert.ok(reached, "car must reach passenger destination 5 despite call spam");
});

test("4. Opposite-direction calls wait their turn", () => {
    const ev = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    ev.callUp(0);
    runUntilDoorOpenAt(ev, 0);
    ev.reserveBoardingSpot("b");
    ev.completeBoard("b");
    ev.pressDestination(5);
    runUntilDoorClosed(ev);
    tickUntil(ev, (e) => e.state === "MOVING", "moving up");
    ev.callDown(1); // down call below/behind while moving up
    ev.callDown(2);
    runUntilDoorOpenAt(ev, 5); // must serve upward destination first
    assert.strictEqual(ev.currentFloor, 5);
    assert.ok(ev.downCalls.has(1) && ev.downCalls.has(2), "down calls still queued");
});

test("5. Door hold and safety cap", () => {
    const ev = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    ev.callUp(0);
    runUntilDoorOpenAt(ev, 0);
    ev.reserveBoardingSpot("slow");
    // Doors should stay open past MIN while pendingBoarders non-empty
    let t = 0;
    while (t < ev.MIN_DOOR_OPEN_S + 1.0) { ev.tick(DT); t += DT; }
    assert.strictEqual(ev.state, "DOOR_OPEN", "doors held open by pending boarder");
    // But must close after MAX_DOOR_OPEN_S
    t = 0;
    while (t < ev.MAX_DOOR_OPEN_S + 2.0 && ev.state === "DOOR_OPEN") { ev.tick(DT); t += DT; }
    assert.notStrictEqual(ev.state, "DOOR_OPEN", "safety cap must close doors");
    assert.strictEqual(ev.pendingBoarders.size, 0, "stuck boarders cleared");
});

test("6. Destination preserved across the action handshake (0 -> 5)", () => {
    const ev = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    // WAIT_AT_PANEL: rider at floor 0 wants floor 5
    const rider = { name: "carol", toFloor: 5 };
    ev.callUp(0);
    runUntilDoorOpenAt(ev, 0);
    assert.ok(ev.isAcceptingAt(0, 1), "accepting up riders at floor 0");
    // ENTER_ELEVATOR
    const spot = ev.reserveBoardingSpot(rider);
    assert.ok(spot);
    ev.completeBoard(rider);
    // PRESS_FLOOR uses the plan's explicit toFloor, never floor+dir
    ev.pressDestination(rider.toFloor);
    assert.ok(ev.destinations.has(5), "destination 5 recorded");
    assert.ok(!ev.destinations.has(1), "must not contain inferred floor 1");
    // WAIT_FOR_FLOOR
    runUntilDoorClosed(ev);
    runUntilDoorOpenAt(ev, 5);
    assert.strictEqual(ev.currentFloor, 5, "rider delivered to floor 5, not floor 1");
});

test("7. Reset clears phantom state", () => {
    const ev = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    ev.callUp(0);
    runUntilDoorOpenAt(ev, 0);
    ev.reserveBoardingSpot("x");
    ev.completeBoard("x");
    ev.pressDestination(3);
    ev.callUp(2);
    ev.callDown(4);
    ev.registerDisembark("x");
    ev.reset();
    assert.strictEqual(ev.upCalls.size, 0);
    assert.strictEqual(ev.downCalls.size, 0);
    assert.strictEqual(ev.destinations.size, 0);
    assert.strictEqual(ev.passengers.size, 0);
    assert.strictEqual(ev.pendingBoarders.size, 0);
    assert.strictEqual(ev.pendingDisembark.size, 0);
    assert.strictEqual(ev.direction, 0);
    assert.strictEqual(ev.targetFloor, null);
    assert.strictEqual(ev.currentFloor, 0);
    assert.strictEqual(ev.state, "IDLE");
    assert.strictEqual(ev.doorProgress, 0);
    assert.ok(ev.spotOccupancy.every((s) => s === null), "spots freed");
});

console.log("\n==== " + passed + " passed, " + failed + " failed ====");
if (failed > 0) {
    failures.forEach((f) => console.log("  " + f));
    process.exit(1);
}
