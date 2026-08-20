/*
 * elevator_logic_test.js - deterministic Node tests for ElevatorLogic.
 *
 * Run with:  node elevator_logic_test.js
 * No npm, no jest/mocha, no browser, no Three.js, no real timers.
 */
"use strict";

const assert = require("assert");
const { ElevatorLogic } = require("./elevator_logic.js");

const DT = 0.1;
const TIMINGS = ElevatorLogic.TIMING;

// --- helpers -----------------------------------------------------------

function tickUntil(logic, predicate, cap) {
    const limit = (cap === undefined) ? 4000 : cap;
    for (let i = 0; i < limit; i += 1) {
        if (predicate(logic)) return i;
        logic.tick(DT);
    }
    throw new Error(`tickUntil: predicate not true within ${limit * DT}s sim time (state=${logic.state}, floor=${logic.currentFloor})`);
}

function runUntilDoorOpenAt(logic, floor) {
    return tickUntil(logic, (l) => l.state === "DOOR_OPEN" && l.currentFloor === floor);
}

function runUntilDoorClosed(logic) {
    // Doors fully closed: back to IDLE, or already departing (MOVING).
    return tickUntil(logic, (l) => l.state === "IDLE" || l.state === "MOVING");
}

function boardAt(logic, floor, people, destinations) {
    logic.callUp(floor);
    runUntilDoorOpenAt(logic, floor);
    for (let i = 0; i < people.length; i += 1) {
        const spot = logic.reserveBoardingSpot(people[i]);
        assert.ok(spot, `boarder ${i} got a logical spot`);
        logic.completeBoard(people[i]);
    }
    for (const d of destinations) logic.pressDestination(d);
}

// --- tests -------------------------------------------------------------

// 1. Lobby rush: more lobby callers than capacity. Leftover callers keep
//    re-pressing UP; after the doors close the car must head upward, not
//    re-open on floor 0.
function testLobbyRush() {
    const logic = new ElevatorLogic({ floorCount: 6, maxCapacity: 4, floorHeight: 3.4 });
    boardAt(logic, 0, [{ id: "p1" }, { id: "p2" }, { id: "p3" }, { id: "p4" }], [5, 3]);
    // Leftover lobby waiters keep hammering the UP button while the doors
    // are still open.
    for (let i = 0; i < 60 && logic.state === "DOOR_OPEN"; i += 1) {
        logic.callUp(0);
        logic.tick(DT);
    }
    runUntilDoorClosed(logic);
    tickUntil(logic, (l) => l.state === "MOVING");
    assert.ok(logic.targetFloor > 0, `next target must be above floor 0, got ${logic.targetFloor}`);
    assert.strictEqual(logic.direction, 1, "car must depart upward");
    tickUntil(logic, (l) => l.currentFloor > 0, 2000);
    tickUntil(logic, (l) => l.currentFloor === 3, 2000);
    assert.ok(logic.upCalls.has(0), "leftover lobby UP call must stay queued for the next trip");
}

// 2. Passenger destinations outrank same-floor hall calls: riders aboard
//    (non-empty destinations) + a new hall call near the car must not cause
//    an immediate re-open for the hall call.
function testDestinationsOutrankSameFloorCall() {
    const logic = new ElevatorLogic();
    const a = { id: "a" }, b = { id: "b" };
    boardAt(logic, 0, [a, b], [5, 2]);
    runUntilDoorOpenAt(logic, 2);
    logic.registerDisembark(b);
    logic.completeDisembark(b);
    tickUntil(logic, (l) => l.state === "MOVING");
    assert.strictEqual(logic.direction, 1, "car still heading up with riders aboard");
    logic.callUp(2); // fresh same-ish hall call while passenger work remains
    let reopenedAt2 = false;
    let reached5 = false;
    for (let i = 0; i < 4000 && !reached5; i += 1) {
        logic.tick(DT);
        if (logic.state === "DOOR_OPEN" && logic.currentFloor === 2) reopenedAt2 = true;
        if (logic.currentFloor === 5) reached5 = true;
    }
    assert.ok(reached5, "car reaches passenger destination 5");
    assert.ok(!reopenedAt2, "car did NOT re-open on floor 2 for the hall call while riders were aboard");
}

// 3. Repeated hall-call pressing cannot starve riders: hammer callUp(0)
//    every tick while a rider has a destination; the rider must still
//    reach that destination.
function testRepeatedCallsDoNotStarveRiders() {
    const logic = new ElevatorLogic();
    const rider = { id: "rider" };
    boardAt(logic, 0, [rider], [5]);
    let reached = false;
    for (let i = 0; i < 6000 && !reached; i += 1) {
        logic.callUp(0);
        logic.tick(DT);
        if (logic.currentFloor === 5) reached = true;
    }
    assert.ok(reached, "rider reached floor 5 despite hammering callUp(0)");
}

// 4. Opposite-direction calls wait their turn: while moving UP with work
//    above, DOWN calls at lower floors must not reverse the car.
function testOppositeDirectionWaits() {
    const logic = new ElevatorLogic();
    const a = { id: "a" }, b = { id: "b" };
    boardAt(logic, 0, [a, b], [5, 4]);
    runUntilDoorOpenAt(logic, 4); // SCAN served destination 4 first
    logic.registerDisembark(b);
    logic.completeDisembark(b);
    tickUntil(logic, (l) => l.state === "MOVING" && l.direction === 1);
    assert.ok(logic.destinations.has(5), "rider a still holds destination 5");
    logic.callDown(1);
    logic.callDown(0);
    let openedBelow5 = false;
    let reached5 = false;
    for (let i = 0; i < 4000 && !reached5; i += 1) {
        logic.tick(DT);
        if (logic.state === "DOOR_OPEN") {
            if (logic.currentFloor < 5) openedBelow5 = true;
            if (logic.currentFloor === 5) reached5 = true;
        }
    }
    assert.ok(reached5, "car reached passenger destination 5");
    assert.ok(!openedBelow5, "no door opening below floor 5 before reaching 5 despite down calls");
    assert.ok(logic.downCalls.has(1) || logic.downCalls.has(0), "DOWN calls stayed queued, not reverse-served");
}

// 5. Door hold and safety cap: doors stay open while pending sets are
//    non-empty past MIN_DOOR_OPEN_S, and close after MAX_DOOR_OPEN_S if
//    something never completes.
function testDoorHoldAndSafetyCap() {
    const logic = new ElevatorLogic();
    logic.callUp(0);
    runUntilDoorOpenAt(logic, 0);
    const boarder = { id: "boarder" };
    const spot = logic.reserveBoardingSpot(boarder);
    assert.ok(spot, "boarder reserved a spot");
    logic.tick(TIMINGS.MIN_DOOR_OPEN_S + 0.5);
    assert.strictEqual(logic.state, "DOOR_OPEN", "doors held open past MIN_DOOR_OPEN_S for a pending boarder");

    logic.completeBoard(boarder);
    logic.tick(0.3);
    assert.strictEqual(logic.state, "DOOR_CLOSING", "doors start closing once pending cleared and min time elapsed");
    runUntilDoorClosed(logic);

    const logic2 = new ElevatorLogic();
    logic2.callUp(0);
    runUntilDoorOpenAt(logic2, 0);
    const ghost = { id: "ghost" };
    logic2.registerDisembark(ghost); // never completes
    logic2.tick(TIMINGS.MAX_DOOR_OPEN_S + 0.5);
    assert.notStrictEqual(logic2.state, "DOOR_OPEN", "MAX_DOOR_OPEN_S safety cap forces doors closed");
    logic2.completeDisembark(ghost);
}

// 6. Destination preserved across the action handshake. Models the logical
//    ride WAIT_AT_PANEL -> ENTER_ELEVATOR -> PRESS_FLOOR -> WAIT_FOR_FLOOR
//    for a rider going floor 0 -> floor 5. Catches designs that store only
//    a direction and would treat "up from 0" as floor 1.
function testDestinationHandshake() {
    const logic = new ElevatorLogic();
    const rider = { id: "rider-0-to-5" };

    // WAIT_AT_PANEL(0, up, 5): press the call and wait until accepted.
    for (let i = 0; i < 4000 && !logic.isAcceptingAt(0, 1); i += 1) {
        logic.callUp(0);
        logic.tick(DT);
    }
    assert.ok(logic.isAcceptingAt(0, 1), "car accepted the rider at floor 0 going up");

    // ENTER_ELEVATOR(5): reserve, board, keep toFloor with the rider.
    const spot = logic.reserveBoardingSpot(rider);
    assert.ok(spot && typeof spot.index === "number", "rider reserved a logical interior spot");
    logic.completeBoard(rider);

    // PRESS_FLOOR(5): exact destination from the plan compiler.
    const toFloor = 5;
    logic.pressDestination(toFloor);

    // WAIT_FOR_FLOOR(5).
    for (let i = 0; i < 4000 && !(logic.state === "DOOR_OPEN" && logic.currentFloor === toFloor); i += 1) {
        logic.tick(DT);
    }
    assert.ok(logic.state === "DOOR_OPEN" && logic.currentFloor === toFloor,
        `rider expected at floor ${toFloor}, car is at ${logic.currentFloor} (state=${logic.state})`);

    // EXIT_ELEVATOR handshake holds the doors, then releases.
    logic.registerDisembark(rider);
    logic.completeDisembark(rider);
    assert.strictEqual(logic.passengers.size, 0, "rider fully disembarked");
}

// 7. Reset clears phantom state.
function testResetClearsPhantomState() {
    const logic = new ElevatorLogic();
    logic.callUp(3);
    logic.callDown(2);
    logic.pressDestination(4);
    const p1 = { id: "p1" }, p2 = { id: "p2" };
    logic.reserveBoardingSpot(p1);
    logic.completeBoard(p1);
    logic.registerDisembark(p2);
    logic.state = "MOVING";
    logic.direction = 1;
    logic.targetFloor = 3;
    logic.position = 3.4;
    logic.doorT = 0.5;
    logic.doorOpenTime = 2.0;
    logic.servedThisDoorCycle = 0;

    logic.reset();

    assert.strictEqual(logic.state, "IDLE", "state parked");
    assert.strictEqual(logic.currentFloor, 0, "parked on floor 0");
    assert.strictEqual(logic.position, 0, "position zeroed");
    assert.strictEqual(logic.direction, 0, "direction cleared");
    assert.strictEqual(logic.targetFloor, 0, "target cleared");
    assert.strictEqual(logic.upCalls.size, 0, "up calls cleared");
    assert.strictEqual(logic.downCalls.size, 0, "down calls cleared");
    assert.strictEqual(logic.destinations.size, 0, "destinations cleared");
    assert.strictEqual(logic.passengers.size, 0, "passengers cleared");
    assert.strictEqual(logic.pendingBoarders.size, 0, "pending boarders cleared");
    assert.strictEqual(logic.pendingDisembark.size, 0, "pending disembark cleared");
    assert.ok(logic.spotOccupancy.every((s) => s === null), "logical spots vacated");
    assert.strictEqual(logic.doorT, 0, "door animation timer cleared");
    assert.strictEqual(logic.doorOpenTime, 0, "door open timer cleared");
    assert.strictEqual(logic.servedThisDoorCycle, null, "anti-reopen guard cleared");
}

// --- runner ------------------------------------------------------------

const tests = [
    ["Lobby rush: leftover callers cannot pin the car to floor 0", testLobbyRush],
    ["Passenger destinations outrank same-floor hall calls", testDestinationsOutrankSameFloorCall],
    ["Repeated hall-call pressing cannot starve riders", testRepeatedCallsDoNotStarveRiders],
    ["Opposite-direction calls wait their turn", testOppositeDirectionWaits],
    ["Door hold for pending boarders + MAX_DOOR_OPEN_S safety cap", testDoorHoldAndSafetyCap],
    ["Destination preserved through the ride handshake (floor 0 to 5)", testDestinationHandshake],
    ["Reset clears phantom state", testResetClearsPhantomState]
];

let passed = 0;
let failed = 0;
for (const t of tests) {
    const name = t[0];
    const fn = t[1];
    try {
        fn();
        passed += 1;
        console.log(`PASS  ${name}`);
    } catch (err) {
        failed += 1;
        console.log(`FAIL  ${name}`);
        console.log(`      ${err && err.message ? err.message : err}`);
    }
}

console.log("");
console.log(`${passed} passed, ${failed} failed, ${tests.length} total`);
if (failed > 0) {
    process.exit(1);
}
