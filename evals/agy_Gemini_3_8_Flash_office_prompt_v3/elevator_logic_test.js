const assert = require("assert");
const { ElevatorLogic } = require("./elevator_logic.js");

function tickUntil(elevator, predicate, maxTicks = 1000, dt = 0.05) {
    let ticks = 0;
    while (!predicate(elevator) && ticks < maxTicks) {
        elevator.tick(dt);
        ticks++;
    }
    if (!predicate(elevator)) {
        throw new Error(`tickUntil timed out after ${maxTicks} ticks. State: ${elevator.state}, floor: ${elevator.currentFloor}, target: ${elevator.targetFloor}`);
    }
    return ticks;
}

function runUntilDoorOpenAt(elevator, floor, maxTicks = 1000, dt = 0.05) {
    return tickUntil(elevator, (e) => e.state === "DOOR_OPEN" && e.currentFloor === floor, maxTicks, dt);
}

function runUntilDoorClosed(elevator, maxTicks = 1000, dt = 0.05) {
    return tickUntil(elevator, (e) => (e.state === "MOVING" || e.state === "IDLE") && e.doorProgress === 0, maxTicks, dt);
}

console.log("Starting ElevatorLogic test suite...");

// Scenario 1: Lobby rush with more callers than capacity
(function testLobbyRush() {
    const elev = new ElevatorLogic();
    elev.callUp(0);
    runUntilDoorOpenAt(elev, 0);

    // Board 4 people
    const riders = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
    for (const r of riders) {
        const spot = elev.reserveBoardingSpot(r);
        assert(spot !== null, "Spot should be available for rider " + r.id);
        elev.completeBoard(r);
    }
    assert.strictEqual(elev.currentCapacityFree(), 0, "Car should be full");

    // Press upper floor destinations
    elev.pressDestination(3);
    elev.pressDestination(5);

    // Simulate leftover lobby callers re-pressing UP
    elev.callUp(0);

    // Let door timer elapse and close
    runUntilDoorClosed(elev);

    // After doors close, target must be above floor 0, not floor 0 again
    assert(elev.targetFloor > 0, `Target should be above floor 0, got ${elev.targetFloor}`);
    assert(elev.state === "MOVING", `Elevator should be moving, got ${elev.state}`);
    console.log("  PASS: Scenario 1 - Lobby rush with more callers than capacity");
})();

// Scenario 2: Passenger destinations outrank same-floor hall calls
(function testDestinationsOutrankHallCalls() {
    const elev = new ElevatorLogic();
    elev.callUp(0);
    runUntilDoorOpenAt(elev, 0);

    const rider = { id: 10 };
    elev.reserveBoardingSpot(rider);
    elev.completeBoard(rider);
    elev.pressDestination(4);

    // Add a same floor hall call while open
    elev.callUp(0);

    // Run until door closes
    runUntilDoorClosed(elev);

    // Should NOT immediately reopen at floor 0; must move toward floor 4
    assert.strictEqual(elev.state, "MOVING");
    assert.strictEqual(elev.targetFloor, 4);
    assert.notStrictEqual(elev.state, "DOOR_OPENING");
    console.log("  PASS: Scenario 2 - Passenger destinations outrank same-floor hall calls");
})();

// Scenario 3: Repeated hall-call pressing cannot starve riders
(function testRepeatedCallsCannotStarveRiders() {
    const elev = new ElevatorLogic();
    elev.callUp(0);
    runUntilDoorOpenAt(elev, 0);

    const rider = { id: 20 };
    elev.reserveBoardingSpot(rider);
    elev.completeBoard(rider);
    elev.pressDestination(3);

    // Repeatedly callUp(0) across several ticks
    for (let i = 0; i < 200; i++) {
        elev.callUp(0);
        elev.tick(0.05);
        if (elev.state === "DOOR_OPEN" && elev.currentFloor === 3) {
            break;
        }
    }

    // Car must reach passenger destination at floor 3
    assert.strictEqual(elev.currentFloor, 3, `Car should reach floor 3, current: ${elev.currentFloor}`);
    assert.strictEqual(elev.state, "DOOR_OPEN", `Car should be DOOR_OPEN at floor 3, got ${elev.state}`);
    console.log("  PASS: Scenario 3 - Repeated hall-call pressing cannot starve riders");
})();

// Scenario 4: Opposite-direction calls wait their turn
(function testOppositeDirectionWaits() {
    const elev = new ElevatorLogic();
    // Start at floor 0, destination 4
    elev.currentFloor = 0;
    elev.currentY = 0;
    elev.pressDestination(4);
    elev.tick(0.05);

    assert.strictEqual(elev.state, "MOVING");
    assert.strictEqual(elev.direction, 1);
    assert.strictEqual(elev.targetFloor, 4);

    // While moving up, add a DOWN call at floor 2 and floor 1
    elev.callDown(2);
    elev.callDown(1);

    // Advance until elevator reaches floor 4
    tickUntil(elev, (e) => e.currentFloor === 4 && e.state === "DOOR_OPEN");

    // Now upward destination 4 has been served. Afterward, it can reverse for down calls
    assert.strictEqual(elev.currentFloor, 4);
    assert(!elev.destinations.has(4), "Destination 4 should be cleared");
    console.log("  PASS: Scenario 4 - Opposite-direction calls wait their turn");
})();

// Scenario 5: Door hold and safety cap
(function testDoorHoldAndSafetyCap() {
    const elev = new ElevatorLogic();
    elev.callUp(0);
    runUntilDoorOpenAt(elev, 0);

    const slowRider = { id: 99 };
    elev.reserveBoardingSpot(slowRider);
    // Rider never calls completeBoard! Remains in pendingBoarders

    // Tick past MIN_DOOR_OPEN_S (e.g. 2.0s)
    for (let i = 0; i < 40; i++) {
        elev.tick(0.05);
    }
    // Should still be open because pendingBoarders is not empty
    assert.strictEqual(elev.state, "DOOR_OPEN", "Door should remain open while rider is pending");

    // Tick past MAX_DOOR_OPEN_S (safety cap 6.0s)
    for (let i = 0; i < 120; i++) {
        elev.tick(0.05);
    }
    // Door must now close or be closing
    assert(elev.state === "DOOR_CLOSING" || elev.state === "IDLE" || elev.state === "MOVING",
        `Doors must close after MAX_DOOR_OPEN_S, state: ${elev.state}`);
    console.log("  PASS: Scenario 5 - Door hold and safety cap");
})();

// Scenario 6: Destination preserved across the action handshake
(function testDestinationPreservedAcrossHandshake() {
    const elev = new ElevatorLogic();
    const rider = { id: 50, targetFloor: 5 };

    // 1. WAIT_AT_PANEL
    elev.callUp(0);
    runUntilDoorOpenAt(elev, 0);
    assert(elev.isAcceptingAt(0, 1), "Elevator should accept rider");

    // 2. ENTER_ELEVATOR
    const spot = elev.reserveBoardingSpot(rider);
    assert(spot !== null, "Spot reserved");
    elev.completeBoard(rider);

    // 3. PRESS_FLOOR
    elev.pressDestination(rider.targetFloor);
    assert(elev.destinations.has(5), "Destination 5 registered");

    // 4. WAIT_FOR_FLOOR
    runUntilDoorClosed(elev);
    assert.strictEqual(elev.targetFloor, 5, `Target should be floor 5, got ${elev.targetFloor}`);

    tickUntil(elev, (e) => e.currentFloor === 5 && e.state === "DOOR_OPEN");
    assert.strictEqual(elev.currentFloor, 5, "Elevator reached floor 5");
    console.log("  PASS: Scenario 6 - Destination preserved across the action handshake");
})();

// Scenario 7: Reset clears phantom state
(function testResetClearsPhantomState() {
    const elev = new ElevatorLogic();
    elev.callUp(1);
    elev.callDown(4);
    elev.pressDestination(3);
    const r1 = { id: 1 };
    const r2 = { id: 2 };
    const r3 = { id: 3 };
    elev.reserveBoardingSpot(r1);
    elev.completeBoard(r1);
    elev.reserveBoardingSpot(r2);
    elev.registerDisembark(r3);
    elev.currentFloor = 3;
    elev.targetFloor = 4;
    elev.direction = 1;
    elev.doorTimer = 2.5;

    // Call reset
    elev.reset();

    assert.strictEqual(elev.state, "IDLE", "State should be IDLE");
    assert.strictEqual(elev.currentFloor, 0, "Current floor should be 0");
    assert.strictEqual(elev.targetFloor, 0, "Target floor should be 0");
    assert.strictEqual(elev.direction, 0, "Direction should be 0");
    assert.strictEqual(elev.currentY, 0.0, "currentY should be 0.0");
    assert.strictEqual(elev.doorProgress, 0.0, "doorProgress should be 0.0");
    assert.strictEqual(elev.doorTimer, 0.0, "doorTimer should be 0.0");
    assert.strictEqual(elev.upCalls.size, 0, "upCalls should be empty");
    assert.strictEqual(elev.downCalls.size, 0, "downCalls should be empty");
    assert.strictEqual(elev.destinations.size, 0, "destinations should be empty");
    assert.strictEqual(elev.passengers.size, 0, "passengers should be empty");
    assert.strictEqual(elev.pendingBoarders.size, 0, "pendingBoarders should be empty");
    assert.strictEqual(elev.pendingDisembark.size, 0, "pendingDisembark should be empty");
    assert(elev.spotOccupancy.every((s) => s === null), "spotOccupancy should all be null");
    console.log("  PASS: Scenario 7 - Reset clears phantom state");
})();

console.log("\nALL ELEVATOR LOGIC TESTS PASSED (7/7)!");
