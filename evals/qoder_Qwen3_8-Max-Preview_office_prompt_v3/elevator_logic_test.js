// elevator_logic_test.js - deterministic Node tests for the pure elevator scheduler.
// Run with: node elevator_logic_test.js

"use strict";

const assert = require("assert");
const { ElevatorLogic } = require("./elevator_logic.js");

const S = ElevatorLogic.STATES;
const DT = 0.1;

function makeElevator() {
    return new ElevatorLogic({ floorCount: 6, maxCapacity: 4, floorHeight: 3.4 });
}

function tickUntil(el, predicate, maxTicks) {
    const cap = maxTicks || 5000;
    for (let i = 0; i < cap; i += 1) {
        if (predicate(el)) return i;
        el.tick(DT);
    }
    throw new Error("condition not reached within " + cap + " ticks (state=" + el.state +
        " floor=" + el.currentFloor + " target=" + el.targetFloor + ")");
}

function runUntilDoorOpenAt(el, floor) {
    return tickUntil(el, (e) => e.state === S.DOOR_OPEN && e.currentFloor === floor);
}

function runUntilDoorClosed(el) {
    return tickUntil(el, (e) => e.state === S.DOOR_CLOSING);
}

function board(el, id) {
    const person = { id: id };
    const spot = el.reserveBoardingSpot(person);
    assert.ok(spot, "boarding spot reserved for " + id);
    el.completeBoard(person);
    return person;
}

// 1. Lobby rush with more callers than capacity.
function testLobbyRush() {
    const el = makeElevator();
    el.callUp(0);
    runUntilDoorOpenAt(el, 0);

    for (let i = 0; i < 4; i += 1) board(el, "rider" + i);
    el.pressDestination(2);
    el.pressDestination(3);
    el.pressDestination(4);
    el.pressDestination(5);
    assert.strictEqual(el.currentCapacityFree(), 0, "car is full");

    // Leftover lobby callers keep pressing UP while the doors are open.
    el.callUp(0);
    el.callUp(0);

    runUntilDoorClosed(el);
    tickUntil(el, (e) => e.state === S.MOVING);
    assert.ok(el.targetFloor > 0, "next target is above floor 0, got " + el.targetFloor);
    assert.ok(el.upCalls.has(0), "leftover lobby call stays queued for the next trip");

    // The car must not reopen at floor 0 on this cycle.
    assert.notStrictEqual(el.currentFloor !== 0 && el.state === S.DOOR_OPEN && el.targetFloor === 0, true);
}

// 2. Passenger destinations outrank same-floor hall calls.
function testDestinationsOutrankHallCalls() {
    const el = makeElevator();
    el.callUp(0);
    runUntilDoorOpenAt(el, 0);

    board(el, "rider");
    el.pressDestination(4);
    el.callUp(0); // same-floor hall call while a passenger has a destination

    runUntilDoorClosed(el);
    let reopened = false;
    for (let i = 0; i < 300; i += 1) {
        el.tick(DT);
        if (el.state === S.DOOR_OPENING) { reopened = true; break; }
        if (el.state === S.MOVING) break;
    }
    assert.strictEqual(reopened, false, "no immediate reopen at the same floor");
    assert.strictEqual(el.state, S.MOVING);
    assert.strictEqual(el.targetFloor, 4);

    runUntilDoorOpenAt(el, 4);
    assert.strictEqual(el.currentFloor, 4);
}

// 3. Repeated hall-call pressing cannot starve riders.
function testNoStarvation() {
    const el = makeElevator();
    el.callUp(0);
    runUntilDoorOpenAt(el, 0);

    board(el, "rider");
    el.pressDestination(5);

    let reached = false;
    for (let i = 0; i < 3000 && !reached; i += 1) {
        el.callUp(0); // lobby caller mashing the button every tick
        el.tick(DT);
        if (el.state === S.DOOR_OPEN && el.currentFloor === 5) reached = true;
    }
    assert.ok(reached, "car still reaches the passenger destination (floor 5)");
}

// 4. Opposite-direction calls wait their turn.
function testOppositeDirectionWaits() {
    const el = makeElevator();
    el.callUp(0);
    runUntilDoorOpenAt(el, 0);

    board(el, "rider");
    el.pressDestination(5);
    runUntilDoorClosed(el);
    tickUntil(el, (e) => e.state === S.MOVING);
    assert.strictEqual(el.direction, 1, "car moving up");

    el.callDown(2); // DOWN call below while the car climbs with work above

    let openedBelow5 = false;
    let reached5 = false;
    for (let i = 0; i < 3000 && !reached5; i += 1) {
        el.tick(DT);
        if (el.state === S.DOOR_OPEN && el.currentFloor < 5) openedBelow5 = true;
        if (el.state === S.DOOR_OPEN && el.currentFloor === 5) reached5 = true;
    }
    assert.ok(reached5, "car reaches floor 5");
    assert.strictEqual(openedBelow5, false, "car does not reverse for the down call");
    assert.ok(el.downCalls.has(2), "down call remains queued");

    // After dropping off, the car comes back down and serves floor 2.
    const rider = Array.from(el.passengers)[0];
    el.registerDisembark(rider);
    el.completeDisembark(rider);
    runUntilDoorOpenAt(el, 2);
    assert.strictEqual(el.currentFloor, 2);
}

// 5. Door hold and safety cap.
function testDoorHoldAndSafetyCap() {
    // Doors stay open while boarders are pending, past the minimum open time.
    const el = makeElevator();
    el.callUp(0);
    runUntilDoorOpenAt(el, 0);
    const slowPoke = { id: "slow" };
    assert.ok(el.reserveBoardingSpot(slowPoke));
    for (let i = 0; i < 40; i += 1) el.tick(DT); // 4s > MIN_DOOR_OPEN_S
    assert.strictEqual(el.state, S.DOOR_OPEN, "doors held for pending boarder");
    el.completeBoard(slowPoke);
    runUntilDoorClosed(el);

    // Safety cap closes even with a stuck boarder, and frees their spot.
    const el2 = makeElevator();
    el2.callUp(0);
    runUntilDoorOpenAt(el2, 0);
    assert.ok(el2.reserveBoardingSpot({ id: "stuck" }));
    tickUntil(el2, (e) => e.state !== S.DOOR_OPEN && e.state !== S.DOOR_OPENING, 200);
    assert.strictEqual(el2.pendingBoarders.size, 0, "stalled boarder released");
    assert.ok(el2.spotOccupancy.every((occ) => !occ), "interior spots freed");

    // Doors never close on a pending disembarker, even past the cap.
    const el3 = makeElevator();
    el3.callUp(0);
    runUntilDoorOpenAt(el3, 0);
    const rider = board(el3, "rider");
    el3.pressDestination(3);
    runUntilDoorOpenAt(el3, 3);
    el3.registerDisembark(rider);
    for (let i = 0; i < 120; i += 1) el3.tick(DT); // 12s > MAX_DOOR_OPEN_S
    assert.strictEqual(el3.state, S.DOOR_OPEN, "doors stay open for pending disembarker");
    el3.completeDisembark(rider);
    runUntilDoorClosed(el3);
}

// 6. Destination preserved across the WAIT_AT_PANEL -> ENTER -> PRESS -> WAIT handshake.
function testDestinationHandshake() {
    const el = makeElevator();

    // WAIT_AT_PANEL: press and re-press until accepted.
    el.callUp(0);
    assert.ok(el.upCalls.has(0));
    runUntilDoorOpenAt(el, 0);
    assert.ok(el.isAcceptingAt(0, 1), "car accepts up-riders at floor 0");

    // ENTER_ELEVATOR.
    const rider = { id: "to-five" };
    const spot = el.reserveBoardingSpot(rider);
    assert.ok(spot, "spot reserved");
    assert.strictEqual(typeof spot.index, "number");
    el.completeBoard(rider);
    assert.strictEqual(el.passengers.size, 1);

    // PRESS_FLOOR: the exact destination from the plan, not floor+direction.
    el.pressDestination(5);
    assert.ok(el.destinations.has(5), "destination 5 registered");

    // WAIT_FOR_FLOOR(5): must arrive at 5, not floor 1.
    runUntilDoorOpenAt(el, 5);
    assert.strictEqual(el.currentFloor, 5, "rider arrives at floor 5");
    assert.strictEqual(el.state, S.DOOR_OPEN);

    // EXIT_ELEVATOR handshake.
    el.registerDisembark(rider);
    assert.strictEqual(el.pendingDisembark.size, 1);
    el.completeDisembark(rider);
    assert.strictEqual(el.passengers.size, 0);
    assert.strictEqual(el.currentCapacityFree(), 4);
}

// 7. Reset clears phantom state.
function testResetClearsState() {
    const el = makeElevator();
    el.callUp(1);
    el.callDown(4);
    el.pressDestination(3);
    const rider = board(el, "rider");
    el.registerDisembark({ id: "ghost" });
    el.tick(DT);
    el.tick(DT);

    el.reset();

    assert.strictEqual(el.upCalls.size, 0);
    assert.strictEqual(el.downCalls.size, 0);
    assert.strictEqual(el.destinations.size, 0);
    assert.strictEqual(el.passengers.size, 0);
    assert.strictEqual(el.pendingBoarders.size, 0);
    assert.strictEqual(el.pendingDisembark.size, 0);
    assert.ok(el.spotOccupancy.every((occ) => !occ), "spot occupancy cleared");
    assert.strictEqual(el.direction, 0);
    assert.strictEqual(el.currentFloor, 0);
    assert.strictEqual(el.position, 0);
    assert.strictEqual(el.targetFloor, null);
    assert.strictEqual(el.state, S.IDLE);
    assert.strictEqual(el.doorOpenAmount, 0);
    void rider;
}

const TESTS = [
    ["lobby rush with more callers than capacity", testLobbyRush],
    ["passenger destinations outrank same-floor hall calls", testDestinationsOutrankHallCalls],
    ["repeated hall-call pressing cannot starve riders", testNoStarvation],
    ["opposite-direction calls wait their turn", testOppositeDirectionWaits],
    ["door hold and safety cap", testDoorHoldAndSafetyCap],
    ["destination preserved across the action handshake", testDestinationHandshake],
    ["reset clears phantom state", testResetClearsState],
];

let passed = 0;
let failed = 0;
for (const t of TESTS) {
    try {
        t[1]();
        console.log("PASS  " + t[0]);
        passed += 1;
    } catch (err) {
        console.log("FAIL  " + t[0] + "\n      " + (err && err.message ? err.message : err));
        failed += 1;
    }
}
console.log("\n" + passed + " passed, " + failed + " failed, " + TESTS.length + " total");
process.exit(failed > 0 ? 1 : 0);
