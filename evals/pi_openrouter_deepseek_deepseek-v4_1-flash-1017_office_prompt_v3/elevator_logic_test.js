/* elevator_logic_test.js - deterministic tests for the pure elevator scheduler. */
"use strict";

const assert = require("assert");
const { ElevatorLogic } = require("./elevator_logic.js");

const DT = 0.5;
const MAX_TICKS = 400;

function tickUntil(elevator, predicate, label) {
    for (let i = 0; i < MAX_TICKS; i += 1) {
        if (predicate()) return;
        elevator.tick(DT);
    }
    throw new Error("Timed out waiting for " + (label || "condition"));
}

function runUntilDoorOpenAt(elevator, floor) {
    tickUntil(
        elevator,
        () => elevator.state === "DOOR_OPEN" && elevator.currentFloor === floor,
        "door open at floor " + floor
    );
}

function runUntilDoorClosed(elevator) {
    tickUntil(
        elevator,
        () => elevator.state !== "DOOR_OPEN" && elevator.state !== "DOOR_OPENING" &&
            elevator.state !== "DOOR_CLOSING",
        "doors closed"
    );
}

function board(elevator, person) {
    const spot = elevator.reserveBoardingSpot(person);
    assert.ok(spot, "expected a boarding spot");
    elevator.completeBoard(person);
    return spot;
}

const tests = [];
function test(name, fn) {
    tests.push({ name: name, fn: fn });
}

test("lobby rush with more callers than capacity leaves floor 0", function () {
    const elevator = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    elevator.callUp(0);
    runUntilDoorOpenAt(elevator, 0);

    const riders = [{ id: "r1" }, { id: "r2" }, { id: "r3" }, { id: "r4" }];
    riders.forEach(function (person) { board(elevator, person); });
    elevator.pressDestination(5);
    elevator.pressDestination(3);
    elevator.pressDestination(2);
    elevator.pressDestination(1);

    // Leftover lobby waiters keep pressing UP after the car is full.
    for (let i = 0; i < 8; i += 1) elevator.callUp(0);
    tickUntil(elevator, () => elevator.state === "DOOR_CLOSING", "doors closing");
    tickUntil(elevator, () => elevator.state === "MOVING" || elevator.currentFloor > 0, "car departs");

    assert.ok(elevator.targetFloor > 0, "target should be above floor 0, got " + elevator.targetFloor);
    assert.ok(elevator.currentFloor >= 0, "car should remain valid");
    tickUntil(elevator, () => elevator.currentFloor > 0, "car reaches an upper floor");
    assert.ok(elevator.currentFloor > 0, "car should serve an upper-floor destination");
});

test("passenger destinations outrank same-floor hall calls", function () {
    const elevator = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    elevator.callUp(0);
    runUntilDoorOpenAt(elevator, 0);
    board(elevator, { id: "rider" });
    elevator.pressDestination(4);
    elevator.callUp(0);

    tickUntil(elevator, () => elevator.state === "DOOR_CLOSING", "doors closing");
    elevator.callUp(0);
    for (let i = 0; i < 6; i += 1) elevator.tick(DT);
    assert.ok(
        !(elevator.state === "DOOR_OPENING" && elevator.currentFloor === 0),
        "same-floor call must not reopen the doors while a rider destination is pending"
    );
    assert.ok(elevator.targetFloor > 0, "rider destination should remain the target");
});

test("repeated hall-call pressing cannot starve riders", function () {
    const elevator = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    elevator.callUp(0);
    runUntilDoorOpenAt(elevator, 0);
    board(elevator, { id: "rider" });
    elevator.pressDestination(4);
    tickUntil(elevator, () => elevator.state === "DOOR_CLOSING", "doors closing");

    let reached = false;
    for (let i = 0; i < 60; i += 1) {
        elevator.callUp(0);
        elevator.tick(DT);
        if (elevator.currentFloor === 4) reached = true;
    }
    assert.ok(reached, "car should reach the rider destination");
});

test("opposite-direction calls wait their turn", function () {
    const elevator = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    elevator.callUp(2);
    elevator.callUp(5);
    elevator.callDown(4);

    runUntilDoorOpenAt(elevator, 2);
    assert.strictEqual(elevator.direction, 1, "car should be going up");
    assert.ok(elevator.downCalls.has(4), "down call should remain queued");
    tickUntil(
        elevator,
        () => elevator.state === "MOVING" && elevator.targetFloor === 5,
        "continue upward to floor 5"
    );
    assert.strictEqual(elevator.targetFloor, 5, "upward work should be served before reversing");
    runUntilDoorOpenAt(elevator, 5);
    assert.ok(elevator.downCalls.has(4), "down call should still wait until upward work is done");
});

test("door hold and safety cap", function () {
    const elevator = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    elevator.callUp(0);
    runUntilDoorOpenAt(elevator, 0);
    elevator.reserveBoardingSpot({ id: "slow-boarder" });

    for (let i = 0; i < 10; i += 1) elevator.tick(DT);
    assert.strictEqual(elevator.state, "DOOR_OPEN", "doors stay open for pending boarders");

    for (let i = 0; i < 60 && elevator.state === "DOOR_OPEN"; i += 1) elevator.tick(DT);
    assert.notStrictEqual(elevator.state, "DOOR_OPEN", "safety cap must eventually close the doors");
});

test("destination preserved across the action handshake", function () {
    const elevator = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    elevator.callUp(0);
    runUntilDoorOpenAt(elevator, 0);
    board(elevator, { id: "rider" });
    elevator.pressDestination(5);
    elevator.callUp(0);
    tickUntil(elevator, () => elevator.state === "DOOR_CLOSING", "doors closing");

    runUntilDoorOpenAt(elevator, 5);
    assert.strictEqual(elevator.currentFloor, 5, "rider must arrive at floor 5, not floor 1");
    assert.ok(!elevator.destinations.has(5), "destination should be cleared on arrival");
});

test("reset clears phantom state", function () {
    const elevator = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    elevator.callUp(0);
    runUntilDoorOpenAt(elevator, 0);
    const person = { id: "phantom" };
    board(elevator, person);
    elevator.pressDestination(3);
    elevator.callDown(2);
    elevator.pendingDisembark.add(person);
    assert.ok(elevator.passengers.size > 0);
    assert.ok(elevator.spotOccupancy.some(function (entry) { return entry !== null; }));

    elevator.reset();

    assert.strictEqual(elevator.upCalls.size, 0, "up calls cleared");
    assert.strictEqual(elevator.downCalls.size, 0, "down calls cleared");
    assert.strictEqual(elevator.destinations.size, 0, "destinations cleared");
    assert.strictEqual(elevator.passengers.size, 0, "passengers cleared");
    assert.strictEqual(elevator.pendingBoarders.size, 0, "pending boarders cleared");
    assert.strictEqual(elevator.pendingDisembark.size, 0, "pending disembarkers cleared");
    assert.strictEqual(elevator.direction, 0, "direction cleared");
    assert.strictEqual(elevator.currentFloor, 0, "car parked at floor 0");
    assert.strictEqual(elevator.targetFloor, 0, "target cleared");
    assert.strictEqual(elevator.state, "IDLE", "state idle");
    assert.strictEqual(elevator.doorTimer, 0, "door timer cleared");
    assert.ok(
        elevator.spotOccupancy.every(function (entry) { return entry === null; }),
        "spot occupancy cleared"
    );
});

let passed = 0;
let failed = 0;

for (let i = 0; i < tests.length; i += 1) {
    const current = tests[i];
    try {
        current.fn();
        passed += 1;
        console.log("PASS " + current.name);
    } catch (err) {
        failed += 1;
        console.log("FAIL " + current.name);
        console.log("     " + (err && err.message ? err.message : String(err)));
    }
}

console.log("\n" + passed + " passed, " + failed + " failed");
if (failed > 0) process.exit(1);
