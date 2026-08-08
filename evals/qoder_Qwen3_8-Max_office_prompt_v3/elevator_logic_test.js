// elevator_logic_test.js - deterministic Node tests for ElevatorLogic.
// Run: node elevator_logic_test.js
const assert = require("assert");
const { ElevatorLogic } = require("./elevator_logic.js");

const DT = 0.05;

function tickFor(e, seconds) {
    const n = Math.ceil(seconds / DT);
    for (let i = 0; i < n; i++) e.tick(DT);
}

function tickUntil(e, predicate, maxIters) {
    const cap = maxIters || 6000;
    for (let i = 0; i < cap; i++) {
        if (predicate(e)) return true;
        e.tick(DT);
    }
    return predicate(e);
}

function runUntilDoorOpenAt(e, floor) {
    return tickUntil(e, (s) => s.state === "DOOR_OPEN" && s.currentFloor === floor);
}

function runUntilDoorClosed(e) {
    return tickUntil(e, (s) => s.state === "MOVING" || s.state === "IDLE");
}

function boardRider(e, id, destination) {
    const person = { id: id };
    const spot = e.reserveBoardingSpot(person);
    assert.ok(spot, "expected a free boarding spot for rider " + id);
    e.completeBoard(person);
    if (destination !== undefined) e.pressDestination(destination);
    return person;
}

const tests = [];
function test(name, fn) {
    tests.push({ name: name, fn: fn });
}

// 1. Lobby rush: more callers than capacity. After a full car boards and
// leftover lobby callers re-press UP, the next target must be above floor 0.
test("lobby rush with more callers than capacity", () => {
    const e = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    e.callUp(0);
    assert.ok(runUntilDoorOpenAt(e, 0), "car should open doors at lobby");

    for (let i = 0; i < 4; i++) boardRider(e, i);
    e.pressDestination(3);
    e.pressDestination(5);
    assert.strictEqual(e.currentCapacityFree(), 0, "car should be full");

    // Leftover lobby waiters keep pressing UP.
    e.callUp(0);
    e.callUp(0);

    assert.ok(runUntilDoorClosed(e), "doors should close");
    assert.strictEqual(e.state, "MOVING", "car must leave the lobby");
    assert.ok(e.targetFloor > 0, "next target must be above floor 0, got " + e.targetFloor);
});

// 2. Passenger destinations outrank same-floor hall calls.
test("passenger destinations outrank same-floor hall calls", () => {
    const e = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    e.callUp(0);
    assert.ok(runUntilDoorOpenAt(e, 0));
    boardRider(e, 1, 4);
    // Same-floor hall call pressed while doors are still open.
    e.callUp(0);
    assert.ok(runUntilDoorClosed(e));
    assert.strictEqual(e.state, "MOVING", "car must not reopen for the same-floor call");
    assert.strictEqual(e.targetFloor, 4, "target must be the passenger destination");
    assert.ok(runUntilDoorOpenAt(e, 4), "car should arrive at floor 4");
});

// 3. Repeated hall-call pressing cannot starve riders.
test("repeated hall-call pressing cannot starve riders", () => {
    const e = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    e.callUp(0);
    assert.ok(runUntilDoorOpenAt(e, 0));
    boardRider(e, 1, 2);
    // Spam the lobby UP call while the car serves the rider.
    for (let i = 0; i < 60; i++) {
        e.callUp(0);
        e.tick(DT);
    }
    assert.ok(runUntilDoorOpenAt(e, 2), "car must still reach the passenger destination (floor 2)");
});

// 4. Opposite-direction calls wait their turn.
test("opposite-direction calls wait their turn", () => {
    const e = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    e.callUp(0);
    assert.ok(runUntilDoorOpenAt(e, 0));
    boardRider(e, 1, 5);
    assert.ok(runUntilDoorClosed(e));

    const openings = [];
    let prevState = e.state;
    for (let i = 0; i < 6000 && openings.length < 2; i++) {
        e.tick(DT);
        if (e.state === "DOOR_OPEN" && prevState !== "DOOR_OPEN") {
            openings.push(e.currentFloor);
        }
        prevState = e.state;
        if (i === 20) {
            // While the car is moving up, somewhere below floor 2.
            e.callDown(2);
        }
    }
    assert.strictEqual(openings[0], 5, "upward destination must be served first, got " + openings);
    assert.ok(openings.indexOf(2) !== -1, "down call at floor 2 must be served afterwards");
});

// 5. Door hold and safety cap.
test("doors held by pending boarders, capped by MAX_DOOR_OPEN_S", () => {
    const e = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    e.callUp(0);
    assert.ok(runUntilDoorOpenAt(e, 0));
    const lingerer = { id: "boarder" };
    assert.ok(e.reserveBoardingSpot(lingerer), "spot reserved");
    // Never complete the boarding.
    tickFor(e, e.MIN_DOOR_OPEN_S + 2);
    assert.strictEqual(e.state, "DOOR_OPEN", "doors must stay open for pending boarder");
    tickFor(e, e.MAX_DOOR_OPEN_S + 1);
    assert.notStrictEqual(e.state, "DOOR_OPEN", "safety cap must force doors to close");

    // Same hold behavior for pending disembarkers.
    const e2 = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    e2.callUp(0);
    assert.ok(runUntilDoorOpenAt(e2, 0));
    e2.registerDisembark({ id: "rider" });
    tickFor(e2, e2.MIN_DOOR_OPEN_S + 2);
    assert.strictEqual(e2.state, "DOOR_OPEN", "doors must stay open for pending disembark");
});

// 6. Destination preserved across the action handshake
// WAIT_AT_PANEL -> ENTER_ELEVATOR -> PRESS_FLOOR -> WAIT_FOR_FLOOR.
test("destination preserved across the action handshake", () => {
    const e = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    // WAIT_AT_PANEL: rider presses the hall call for direction up.
    e.callUp(0);
    assert.ok(runUntilDoorOpenAt(e, 0), "car accepts the lobby call");
    assert.ok(e.isAcceptingAt(0, 1), "car must accept UP boarders at floor 0");
    // ENTER_ELEVATOR: rider reserves a spot and boards.
    const rider = { id: "commuter" };
    const spot = e.reserveBoardingSpot(rider);
    assert.ok(spot);
    e.completeBoard(rider);
    // PRESS_FLOOR: exact destination 5, not a value derived from direction.
    e.pressDestination(5);
    // WAIT_FOR_FLOOR: doors must open at 5 (a buggy design opens at 1).
    assert.ok(runUntilDoorOpenAt(e, 5), "car must arrive at floor 5");
    assert.strictEqual(e.currentFloor, 5);
});

// 7. Reset clears phantom state.
test("reset clears phantom state", () => {
    const e = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    e.callUp(3);
    e.callDown(2);
    e.pressDestination(4);
    const p = { id: "a" };
    e.reserveBoardingSpot(p);
    e.completeBoard(p);
    e.registerDisembark({ id: "b" });
    e.direction = 1;
    e.targetFloor = 3;
    e.state = "MOVING";
    e.carY = 6.8;
    e.currentFloor = 2;
    e.doorTimer = 0.5;
    e.doorOpenness = 0.5;

    e.reset();

    assert.strictEqual(e.state, "IDLE");
    assert.strictEqual(e.currentFloor, 0);
    assert.strictEqual(e.carY, 0);
    assert.strictEqual(e.direction, 0);
    assert.strictEqual(e.targetFloor, null);
    assert.strictEqual(e.upCalls.size, 0);
    assert.strictEqual(e.downCalls.size, 0);
    assert.strictEqual(e.destinations.size, 0);
    assert.strictEqual(e.passengers.size, 0);
    assert.strictEqual(e.pendingBoarders.size, 0);
    assert.strictEqual(e.pendingDisembark.size, 0);
    assert.ok(e.spotOccupancy.every((s) => s === null), "spots must be free");
    assert.strictEqual(e.doorOpenness, 0);
    assert.strictEqual(e.doorTimer, 0);
    assert.strictEqual(e.currentCapacityFree(), e.maxCapacity);
});

// 8. Longest-waiting call is served first (no far-floor starvation).
test("oldest hall call outranks newer closer calls", () => {
    const e = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    // Far call pressed first, closer call pressed later.
    e.callDown(5);
    tickFor(e, 0.2);
    e.callDown(2);
    // Car parked at floor 0 must head for the oldest call (floor 5).
    assert.ok(tickUntil(e, (s) => s.state === "MOVING"));
    assert.strictEqual(e.targetFloor, 5, "oldest call must be served first");
    // After serving floor 5, the floor 2 call is still queued and gets served.
    assert.ok(runUntilDoorOpenAt(e, 5), "car must reach floor 5");
    assert.ok(runUntilDoorOpenAt(e, 2), "car must then serve floor 2");
});

// --- runner ---
let failures = 0;
for (const t of tests) {
    try {
        t.fn();
        console.log("PASS  " + t.name);
    } catch (err) {
        failures++;
        console.log("FAIL  " + t.name);
        console.log("      " + (err && err.message ? err.message : err));
    }
}
console.log("----------------------------------------");
console.log((tests.length - failures) + "/" + tests.length + " tests passed");
if (failures > 0) process.exit(1);
