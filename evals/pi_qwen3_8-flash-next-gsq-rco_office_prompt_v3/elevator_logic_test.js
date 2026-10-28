// elevator_logic_test.js - deterministic Node tests for the pure elevator logic.
// Run with: node elevator_logic_test.js

const assert = require("assert");
const { ElevatorLogic } = require("./elevator_logic.js");

let failures = 0;
let passed = 0;

function report(name, ok, detail) {
    if (ok) {
        passed += 1;
        console.log(`PASS  ${name}`);
    } else {
        failures += 1;
        console.log(`FAIL  ${name}${detail ? " - " + detail : ""}`);
    }
}

function newLogic() {
    return new ElevatorLogic({ floorCount: 6, maxCapacity: 4, floorHeight: 3.4 });
}

// Run `n` ticks of a fixed dt; returns the logic for chaining.
function tickTimes(elevator, n, dt) {
    const step = dt === undefined ? 0.1 : dt;
    for (let i = 0; i < n; i += 1) elevator.tick(step);
    return elevator;
}

function runUntil(elevator, predicate, maxTicks) {
    const limit = maxTicks || 4000;
    let ticks = 0;
    while (ticks < limit && !predicate(elevator)) {
        elevator.tick(0.1);
        ticks += 1;
    }
    assert.ok(predicate(elevator), `runUntil exceeded its iteration cap (${limit} ticks)`);
    return elevator;
}

function runUntilDoorOpenAt(elevator, floor, maxTicks) {
    runUntil(elevator, (e) => e.state === "DOOR_OPEN" && e.currentFloor === floor, maxTicks);
    return elevator;
}

// Doors are fully closed once the state machine has picked its next target.
function runUntilDoorClosed(elevator, maxTicks) {
    runUntil(elevator, (e) => e.state === "MOVING" || e.state === "IDLE", maxTicks);
    return elevator;
}

// ---------------------------------------------------------------------------
// Test 1 - lobby rush with more callers than capacity
// ---------------------------------------------------------------------------
(function testLobbyRush() {
    const elev = newLogic();
    try {
        elev.callUp(0);
        runUntilDoorOpenAt(elev, 0);

        // Board exactly four people (capacity), each going up.
        const riders = [];
        for (let i = 0; i < 4; i += 1) {
            const person = { id: "rider-" + i };
            const spot = elev.reserveBoardingSpot(person);
            assert.ok(spot, "reserveBoardingSpot should succeed while capacity is free");
            riders.push(person);
        }
        assert.strictEqual(elev.currentCapacityFree(), 0, "capacity must be exhausted after four boarders");
        for (const person of riders) elev.completeBoard(person);

        // Destinations pressed by the four riders.
        [2, 3, 4, 5].forEach((floor) => elev.pressDestination(floor));

        assert.strictEqual(elev.pendingBoarders.size, 0);
        runUntilDoorClosed(elev);

        assert.ok(elev.state === "MOVING" || elev.state === "IDLE", "car should leave the lobby after doors close");
        assert.ok(elev.targetFloor > 0, `next target must be above floor 0 (got ${elev.targetFloor})`);

        // Leftover lobby waiters keep re-pressing UP while the car is away. The car must
        // still serve every rider destination before coming back to the lobby.
        let reopenedLobby = false;
        for (let i = 0; i < 400 && elev.destinations.size > 0; i += 1) {
            elev.callUp(0);
            elev.tick(0.1);
            if (elev.state === "DOOR_OPEN" && elev.currentFloor === 0) reopenedLobby = true;
        }

        assert.ok(!reopenedLobby, "car reopened the lobby while riders still had destinations");
        assert.strictEqual(elev.destinations.size, 0, "passenger destinations were not served");
        assert.ok(elev.currentFloor >= 2, `car should be serving an upper floor (floor ${elev.currentFloor})`);

        report("1 lobby rush: leftover callers cannot starve the full car", true);
    } catch (err) {
        report("1 lobby rush: leftover callers cannot starve the full car", false, err.message);
    }
})();

// ---------------------------------------------------------------------------
// Test 2 - passenger destinations outrank same-floor hall calls
// ---------------------------------------------------------------------------
(function testDestinationsOutrankCalls() {
    const elev = newLogic();
    try {
        elev.callUp(0);
        runUntilDoorOpenAt(elev, 0);

        const rider = { id: "rider-a" };
        const spot = elev.reserveBoardingSpot(rider);
        assert.ok(spot);
        elev.completeBoard(rider);
        elev.pressDestination(4);

        // A same-floor hall call must not cause an immediate reopen at floor 0.
        for (let i = 0; i < 30; i += 1) {
            elev.callUp(0);
            elev.tick(0.1);
            assert.ok(elev.state !== "DOOR_OPENING", "car reopened at the same floor while riders had a destination");
        }

        runUntilDoorClosed(elev);
        assert.strictEqual(elev.targetFloor, 4, `target should be the passenger destination (got ${elev.targetFloor})`);

        report("2 passenger destinations outrank same-floor hall calls", true);
    } catch (err) {
        report("2 passenger destinations outrank same-floor hall calls", false, err.message);
    }
})();

// ---------------------------------------------------------------------------
// Test 3 - repeated hall-call pressing cannot starve riders
// ---------------------------------------------------------------------------
(function testRepeatedCallsDoNotStarve() {
    const elev = newLogic();
    try {
        elev.callUp(0);
        runUntilDoorOpenAt(elev, 0);

        const rider = { id: "rider-b" };
        assert.ok(elev.reserveBoardingSpot(rider));
        elev.completeBoard(rider);
        elev.pressDestination(5);

        for (let i = 0; i < 600 && elev.currentFloor !== 5; i += 1) {
            elev.callUp(0);
            elev.tick(0.1);
        }

        assert.strictEqual(elev.currentFloor, 5, `car must reach the rider destination (floor ${elev.currentFloor})`);
        report("3 repeated hall-call pressing cannot starve riders", true);
    } catch (err) {
        report("3 repeated hall-call pressing cannot starve riders", false, err.message);
    }
})();

// ---------------------------------------------------------------------------
// Test 4 - opposite-direction calls wait their turn
// ---------------------------------------------------------------------------
(function testOppositeDirectionWaits() {
    const elev = newLogic();
    try {
        // Riders board at floor 1 heading up; a DOWN call exists below.
        elev.callUp(1);
        runUntilDoorOpenAt(elev, 1);

        const rider = { id: "rider-c" };
        assert.ok(elev.reserveBoardingSpot(rider));
        elev.completeBoard(rider);
        elev.pressDestination(4);

        runUntilDoorClosed(elev);
        assert.strictEqual(elev.direction, 1, "car should be heading up");

        // A down call at the current floor and a lower floor must not reverse the car.
        for (let i = 0; i < 200 && elev.currentFloor !== 4; i += 1) {
            elev.callDown(4);
            elev.callDown(1);
            elev.tick(0.1);
            assert.notStrictEqual(elev.targetFloor, 1, "car reversed for a down call before serving upward work");
        }

        assert.strictEqual(elev.currentFloor, 4, `car should have served the upward stop first (floor ${elev.currentFloor})`);
        report("4 opposite-direction calls wait their turn", true);
    } catch (err) {
        report("4 opposite-direction calls wait their turn", false, err.message);
    }
})();

// ---------------------------------------------------------------------------
// Test 5 - door hold and safety cap
// ---------------------------------------------------------------------------
(function testDoorHoldAndCap() {
    const elev = newLogic();
    try {
        elev.callUp(0);
        runUntilDoorOpenAt(elev, 0);

        const stuck = { id: "stuck-boarder" };
        assert.ok(elev.reserveBoardingSpot(stuck)); // never completes boarding

        // Past the minimum open time the doors must stay held by the pending boarder.
        for (let i = 0; i < Math.ceil((elev.minDoorOpenS + 1) / 0.1); i += 1) {
            elev.tick(0.1);
            assert.strictEqual(elev.state, "DOOR_OPEN", "doors closed while a boarder was still pending");
        }

        // Safety cap: doors close even though the pending set is never emptied.
        runUntil(elev, (e) => e.state !== "DOOR_OPEN", 400);
        assert.ok(elev.doorOpenElapsed >= elev.maxDoorOpenS - 1e-6 && elev.doorOpenElapsed <= elev.maxDoorOpenS + 0.2,
            `door safety cap did not fire (closed at ${elev.doorOpenElapsed}s)`);

        // Same for a pending disembarker.
        const rider = { id: "rider-d" };
        assert.ok(elev.reserveBoardingSpot(rider));
        elev.completeBoard(rider);
        elev.callUp(0);
        runUntilDoorOpenAt(elev, 0, 4000);
        elev.registerDisembark(rider);
        for (let i = 0; i < Math.ceil((elev.minDoorOpenS + 1) / 0.1); i += 1) {
            elev.tick(0.1);
            assert.strictEqual(elev.state, "DOOR_OPEN", "doors closed while a disembarker was still pending");
        }
        runUntil(elev, (e) => e.state !== "DOOR_OPEN", 400);

        report("5 door hold and MAX_DOOR_OPEN_S safety cap", true);
    } catch (err) {
        report("5 door hold and MAX_DOOR_OPEN_S safety cap", false, err.message);
    }
})();

// ---------------------------------------------------------------------------
// Test 6 - destination preserved across the action handshake
// ---------------------------------------------------------------------------
(function testDestinationHandshake() {
    const elev = newLogic();
    try {
        // WAIT_AT_PANEL -> ENTER_ELEVATOR -> PRESS_FLOOR -> WAIT_FOR_FLOOR, floor 0 -> 5.
        // The agent object carries the plan's destination through every phase.
        const rider = { id: "rider-e", planToFloor: 5 };
        const toFloor = rider.planToFloor;

        elev.callUp(0);
        runUntilDoorOpenAt(elev, 0);
        assert.ok(elev.isAcceptingAt(0, 1), "car should accept an up call at floor 0");

        const spot = elev.reserveBoardingSpot(rider);
        assert.ok(spot);
        // The plan must remember the rider's destination, not infer floor + direction.
        assert.strictEqual(rider.planToFloor, toFloor, "destination lost during handshake");
        assert.notStrictEqual(toFloor, 0 + 1, "destination must not be reconstructed as floor + direction");
        elev.completeBoard(rider);

        // PRESS_FLOOR action: the exact destination from the plan compiler.
        elev.pressDestination(rider.planToFloor);

        runUntilDoorClosed(elev);
        assert.strictEqual(elev.targetFloor, toFloor, `handshake target should be ${toFloor} (got ${elev.targetFloor})`);

        runUntilDoorOpenAt(elev, toFloor, 4000);
        assert.strictEqual(elev.currentFloor, toFloor);

        report("6 destination preserved across the action handshake", true);
    } catch (err) {
        report("6 destination preserved across the action handshake", false, err.message);
    }

})();

// ---------------------------------------------------------------------------
// Test 7 - reset clears phantom state
// ---------------------------------------------------------------------------
(function testReset() {
    const elev = newLogic();
    try {
        elev.callUp(3);
        elev.callDown(4);
        elev.pressDestination(2);
        const ghost = { id: "ghost" };
        elev.reserveBoardingSpot(ghost);
        elev.completeBoard(ghost);
        elev.registerDisembark(ghost);

        elev.reset();

        assert.strictEqual(elev.state, "IDLE");
        assert.strictEqual(elev.currentFloor, 0);
        assert.strictEqual(elev.targetFloor, 0);
        assert.strictEqual(elev.direction, 0);
        assert.strictEqual(elev.upCalls.size, 0);
        assert.strictEqual(elev.downCalls.size, 0);
        assert.strictEqual(elev.destinations.size, 0);
        assert.strictEqual(elev.passengers.size, 0);
        assert.strictEqual(elev.pendingBoarders.size, 0);
        assert.strictEqual(elev.pendingDisembark.size, 0);
        assert.strictEqual(elev.currentCapacityFree(), elev.maxCapacity);

        // Spot occupancy must be cleared: the first reservation lands on spot 0.
        const fresh = { id: "fresh" };
        const spot = elev.reserveBoardingSpot(fresh);
        assert.ok(spot && spot.index === 0, `spot occupancy is stale (got index ${spot && spot.index})`);

        report("7 reset clears phantom state", true);
    } catch (err) {
        report("7 reset clears phantom state", false, err.message);
    }
})();

console.log("");
console.log(`Elevator logic tests: ${passed} passed, ${failures} failed`);
if (failures > 0) process.exit(1);
