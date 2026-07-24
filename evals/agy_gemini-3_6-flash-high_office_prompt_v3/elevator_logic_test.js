const assert = require("assert");
const { ElevatorLogic } = require("./elevator_logic.js");

function runTests() {
    console.log("Running ElevatorLogic tests...");

    function tickUntil(logic, condition, maxTicks = 200, dt = 0.1) {
        let ticks = 0;
        while (!condition(logic) && ticks < maxTicks) {
            logic.tick(dt);
            ticks++;
        }
        assert(ticks < maxTicks, "tickUntil timed out!");
        return ticks;
    }

    // Test 1: Lobby rush with more callers than capacity
    {
        console.log("Test 1: Lobby rush with leftover callers");
        const logic = new ElevatorLogic();
        logic.callUp(0);
        tickUntil(logic, l => l.state === 'DOOR_OPEN' && l.currentFloor === 0);

        const p1 = { id: 1 }, p2 = { id: 2 }, p3 = { id: 3 }, p4 = { id: 4 };
        logic.reserveBoardingSpot(p1); logic.completeBoard(p1);
        logic.reserveBoardingSpot(p2); logic.completeBoard(p2);
        logic.reserveBoardingSpot(p3); logic.completeBoard(p3);
        logic.reserveBoardingSpot(p4); logic.completeBoard(p4);

        logic.pressDestination(3);
        logic.pressDestination(5);

        // Leftover caller presses UP at floor 0
        logic.callUp(0);

        // Tick until doors close and car leaves floor 0
        tickUntil(logic, l => l.state === 'MOVING');

        assert(logic.targetFloor > 0, `Expected targetFloor > 0, got ${logic.targetFloor}`);
        console.log("  PASSED");
    }

    // Test 2: Passenger destinations outrank same-floor hall calls
    {
        console.log("Test 2: Passenger destinations outrank same-floor hall calls");
        const logic = new ElevatorLogic();
        logic.callUp(0);
        tickUntil(logic, l => l.state === 'DOOR_OPEN');

        const p1 = { id: 1 };
        logic.reserveBoardingSpot(p1); logic.completeBoard(p1);
        logic.pressDestination(4);

        // Add same floor call
        logic.callUp(0);

        tickUntil(logic, l => l.state === 'MOVING');
        assert.strictEqual(logic.targetFloor, 4, `Expected targetFloor 4, got ${logic.targetFloor}`);
        console.log("  PASSED");
    }

    // Test 3: Repeated hall call pressing cannot starve riders
    {
        console.log("Test 3: Anti-starvation under repeated hall calls");
        const logic = new ElevatorLogic();
        logic.callUp(0);
        tickUntil(logic, l => l.state === 'DOOR_OPEN');

        const p1 = { id: 1 };
        logic.reserveBoardingSpot(p1); logic.completeBoard(p1);
        logic.pressDestination(3);

        for (let i = 0; i < 50; i++) {
            logic.callUp(0);
            logic.tick(0.1);
        }

        tickUntil(logic, l => l.currentFloor === 3);
        assert.strictEqual(logic.currentFloor, 3, "Car should reach destination floor 3");
        console.log("  PASSED");
    }

    // Test 4: Opposite-direction calls wait their turn
    {
        console.log("Test 4: Opposite-direction calls wait their turn");
        const logic = new ElevatorLogic();
        logic.callUp(0);
        tickUntil(logic, l => l.state === 'DOOR_OPEN');

        const p1 = { id: 1 };
        logic.reserveBoardingSpot(p1); logic.completeBoard(p1);
        logic.pressDestination(4);

        // Down call at lower floor
        logic.callDown(2);

        tickUntil(logic, l => l.currentFloor === 4);
        assert.strictEqual(logic.currentFloor, 4, "Car should reach floor 4 before reversing to floor 2");
        console.log("  PASSED");
    }

    // Test 5: Door hold and safety cap
    {
        console.log("Test 5: Door hold and MAX_DOOR_OPEN_S safety cap");
        const logic = new ElevatorLogic();
        logic.callUp(0);
        tickUntil(logic, l => l.state === 'DOOR_OPEN');

        const p1 = { id: 1 };
        logic.reserveBoardingSpot(p1); // Remains in pendingBoarders!

        // Tick past MIN_DOOR_OPEN_S (2 sec)
        for (let i = 0; i < 30; i++) logic.tick(0.1);
        assert.strictEqual(logic.state, 'DOOR_OPEN', "Doors should stay open while pending boarder exists");

        // Tick past MAX_DOOR_OPEN_S (8 sec)
        for (let i = 0; i < 60; i++) logic.tick(0.1);
        assert.strictEqual(logic.state, 'DOOR_CLOSING', "Doors should force close after MAX_DOOR_OPEN_S");
        console.log("  PASSED");
    }

    // Test 6: Destination preserved across action handshake
    {
        console.log("Test 6: Destination preserved across action handshake");
        const logic = new ElevatorLogic();
        const riderTargetFloor = 5;

        logic.callUp(0);
        tickUntil(logic, l => l.isAcceptingAt(0, 1));

        const p1 = { id: 10 };
        const spot = logic.reserveBoardingSpot(p1);
        assert(spot !== null, "Spot reservation failed");

        logic.completeBoard(p1);
        logic.pressDestination(riderTargetFloor);

        tickUntil(logic, l => l.currentFloor === riderTargetFloor && l.state === 'DOOR_OPEN');
        assert.strictEqual(logic.currentFloor, riderTargetFloor);
        console.log("  PASSED");
    }

    // Test 7: Reset clears phantom state
    {
        console.log("Test 7: Reset clears phantom state");
        const logic = new ElevatorLogic();
        logic.callUp(2);
        logic.pressDestination(4);
        const p1 = { id: 1 };
        logic.reserveBoardingSpot(p1);

        logic.reset();

        assert.strictEqual(logic.upCalls.size, 0);
        assert.strictEqual(logic.downCalls.size, 0);
        assert.strictEqual(logic.destinations.size, 0);
        assert.strictEqual(logic.passengers.size, 0);
        assert.strictEqual(logic.pendingBoarders.size, 0);
        assert.strictEqual(logic.pendingDisembark.size, 0);
        assert.strictEqual(logic.spotOccupancy.filter(x => x !== null).length, 0);
        assert.strictEqual(logic.currentFloor, 0);
        assert.strictEqual(logic.targetFloor, 0);
        assert.strictEqual(logic.direction, 0);
        assert.strictEqual(logic.state, 'IDLE');
        console.log("  PASSED");
    }

    console.log("\nALL ELEVATOR LOGIC TESTS PASSED SUCCESSFULLY!");
}

runTests();
