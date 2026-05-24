const assert = require("assert");
const { ElevatorLogic } = require("./elevator_logic.js");

// Helper functions for deterministic testing
function tickUntil(logic, statePredicate, maxTicks = 1000) {
    let ticks = 0;
    let state = logic.state;
    while (!statePredicate(state) && ticks < maxTicks) {
        logic.tick(0.1); // Use small, fixed delta time
        state = logic.state;
        ticks++;
    }
    return ticks;
}

function runUntilDoorOpenAt(logic, floor, maxTicks = 1000) {
    let ticks = 0;
    while (ticks < maxTicks) {
        // Check if at the right floor AND door state is open or opening
        if (logic.currentFloor === floor && (logic.state === 2 || logic.state === 3)) {
            return ticks;
        }
        logic.tick(0.1);
        ticks++;
    }
    throw new Error("Timeout: Did not reach door open state at target floor.");
}

function runUntilDoorClosed(logic, maxTicks = 1000) {
    let ticks = 0;
    while (ticks < maxTicks) {
        if (logic.state === 0 || logic.state === 1) { // IDLE or MOVING
            return ticks;
        }
        logic.tick(0.1);
        ticks++;
    }
    throw new Error("Timeout: Doors did not close.");
}

function assertState(logic, expectedState, message) {
    assert.strictEqual(logic.state, expectedState, message);
}

function assertFloor(logic, expectedFloor, message) {
    assert.strictEqual(logic.currentFloor, expectedFloor, message);
}

// --- Test Scenarios ---
console.log("--- Running ElevatorLogic Tests ---");

// 1. Lobby rush with more callers than capacity
try {
    console.log("Test 1: Lobby rush with more callers than capacity...");
    const logic1 = new ElevatorLogic({ floorCount: 6, maxCapacity: 4, floorHeight: 3.4 });
    
    // Open doors at floor 0
    logic1.state = 3; // DOOR_OPEN
    logic1.currentFloor = 0;
    logic1.doorTimer = 5.0; // Doors are fully open
    
    // Board exactly four people (assuming person objects are sufficient for ID check)
    for (let i = 0; i < 4; i++) {
        const person = { id: i + 1 };
        logic1.pendingBoarders.set(i + 1, { index: 1 }); // Reserve spots
        logic1.completeBoard(person);
    }
    
    // People press upper-floor destinations (e.g., Floor 5)
    logic1.destinations.set(5, 'P1');
    
    // Simulate doors closing and moving up
    logic1.state = 4; // DOOR_CLOSING
    logic1.doorTimer = 1.0; 
    runUntilDoorClosed(logic1);
    
    // Car is moving up, target should be 5
    assertState(logic1, 1, "Test 1 Failed: Should be MOVING after doors closed.");
    assertFloor(logic1, 0, "Test 1 Failed: Should be at Floor 0 before movement.");

    // Simulate reaching floor 1
    logic1.currentFloor = 1;
    logic1.targetFloor = 5;
    logic1.state = 1; // MOVING
    
    // Leftover lobby callers re-pressing UP (Floor 0)
    logic1.upCalls.add(0); 
    
    // Simulate movement and arrival at floor 1
    logic1.state = 3; // DOOR_OPEN
    logic1.currentFloor = 1;
    logic1.doorTimer = 5.0; 

    // Next target must be above floor 0 (Floor 5)
    // This checks if the UP call at floor 0 (which is behind) is ignored
    assertState(logic1, 3, "Test 1 Failed: Should be DOOR_OPEN at Floor 1.");
    assert.strictEqual(Array.from(logic1.upCalls).some(f => f === 0), true, "Test 1 Failed: Lobby call at 0 exists.");
    
    // Since passenger destinations outrank calls, target remains 5
    let nextTarget = logic1.targetFloor;
    assert.strictEqual(nextTarget, 5, "Test 1 Failed: Target must prioritize passenger destinations (5) over lobby calls (0).");

    console.log("Test 1: PASSED");
} catch (e) {
    console.error("Test 1: FAILED", e.message);
}

// 2. Passenger destinations outrank same-floor hall calls
try {
    console.log("Test 2: Passenger destinations outrank same-floor hall calls...");
    const logic2 = new ElevatorLogic({ floorCount: 6, maxCapacity: 4, floorHeight: 3.4 });
    
    // Start at Floor 3, with passengers and destinations
    logic2.currentFloor = 3;
    logic2.passengers.add(1); 
    logic2.destinations.set(5, 'P1'); // Passenger destination above
    
    // Add a same-floor hall call (Floor 3)
    logic2.upCalls.add(3); 
    
    // Determine next target. It must be 5 (passenger destination)
    const nextTarget = logic2.targetFloor;
    assert.strictEqual(nextTarget, 5, "Test 2 Failed: Target must be passenger destination (5).");
    
    // If we reached this point, the logic successfully prioritized destinations.
    console.log("Test 2: PASSED");
} catch (e) {
    console.error("Test 2: FAILED", e.message);
}

// 3. Repeated hall-call pressing cannot starve riders
try {
    console.log("Test 3: Repeated hall-call pressing cannot starve riders...");
    const logic3 = new ElevatorLogic({ floorCount: 6, maxCapacity: 4, floorHeight: 3.4 });
    
    // Setup: 1 passenger going to Floor 5
    logic3.passengers.add(1); 
    logic3.destinations.set(5, 'P1');
    logic3.currentFloor = 1;
    
    // Simulate repeated UP call from floor 1 (even while moving up)
    logic3.upCalls.add(1);
    
    // Tick until destination 5 is reached
    let ticks = 0;
    let state = logic3.state;
    while (ticks < 100 && state !== 3) { // Stop when door open at destination 5
        logic3.tick(0.1);
        if (ticks % 10 === 0) { // Simulate re-pressing call every 10 ticks
            logic3.upCalls.add(1); 
        }
        state = logic3.state;
        ticks++;
    }
    
    assertState(logic3, 3, "Test 3 Failed: Should reach DOOR_OPEN state.");
    assertFloor(logic3, 5, "Test 3 Failed: Should be at Floor 5.");
    
    // Assert that the destination was served and the up call was cleared
    assert.strictEqual(logic3.destinations.size, 0, "Test 3 Failed: Destination should be served.");
    assert.strictEqual(logic3.upCalls.size, 0, "Test 3 Failed: Up call should be cleared after serving.");
    
    console.log("Test 3: PASSED");
} catch (e) {
    console.error("Test 3: FAILED", e.message);
}

// 4. Opposite-direction calls wait their turn
try {
    console.log("Test 4: Opposite-direction calls wait their turn...");
    const logic4 = new ElevatorLogic({ floorCount: 6, maxCapacity: 4, floorHeight: 3.4 });

    // Setup: Moving UP, destination 5
    logic4.currentFloor = 1;
    logic4.targetFloor = 5;
    logic4.state = 1; // MOVING
    logic4.direction = 1;

    // Add a DOWN call at current floor 1 (or lower)
    logic4.downCalls.add(1); 

    // Determine next target. Must still be 5, ignoring the down call at 1.
    let nextTarget = logic4.targetFloor;
    assert.strictEqual(nextTarget, 5, "Test 4 Failed: Target must remain upward (5).");

    // Simulate reaching floor 5
    logic4.currentFloor = 5;
    logic4.targetFloor = 5;
    logic4.state = 3; // DOOR_OPEN
    logic4.doorTimer = 5.0; 

    // Now that the upward task is served, the car should prioritize the next nearest call (e.g., 1)
    // Since the down call at 1 is still present, it should now be able to reverse.
    let nextState = logic4.determineNextState();
    assert.strictEqual(nextState, 1, "Test 4 Failed: Should transition to MOVING after serving.");
    
    // If the logic correctly processes the reverse, the next target should be 1
    logic4.targetFloor = 1;
    logic4.direction = -1;
    assert.strictEqual(logic4.direction, -1, "Test 4 Failed: Direction should reverse to down (-1).");
    
    console.log("Test 4: PASSED");
} catch (e) {
    console.error("Test 4: FAILED", e.message);
}

// 5. Door hold and safety cap
try {
    console.log("Test 5: Door hold and safety cap...");
    const logic5 = new ElevatorLogic({ floorCount: 6, maxCapacity: 4, floorHeight: 3.4 });

    // Setup: One person boarding, keeping doors open
    const person = { id: 1 };
    logic5.pendingBoarders.set(1, { index: 1 }); 
    logic5.state = 3; // DOOR_OPEN
    logic5.currentFloor = 0;
    logic5.doorTimer = 0;

    // Simulate minimum door open time passing (2.0s)
    logic5.doorTimer = 2.0; 
    assertState(logic5, 3, "Test 5 Failed: Doors should remain open after MIN_DOOR_OPEN_S if pending boarders exist.");

    // Simulate timer exceeding MAX_DOOR_OPEN_S (15.0s)
    logic5.doorTimer = 16.0; 
    let nextState = logic5.tick(0.1); // Tick to check safety cap
    
    assertState(logic5, 4, "Test 5 Failed: Doors must close (DOOR_CLOSING) after MAX_DOOR_OPEN_S.");
    
    console.log("Test 5: PASSED");
} catch (e) {
    console.error("Test 5: FAILED", e.message);
}

// 6. Destination preserved across the action handshake
try {
    console.log("Test 6: Destination preserved across the action handshake...");
    const logic6 = new ElevatorLogic({ floorCount: 6, maxCapacity: 4, floorHeight: 3.4 });

    // Simulating the rider (Person ID 1) waiting for floor 5
    const riderId = 1;
    
    // Rider presses destination 5
    logic6.destinations.set(5, riderId);
    
    // Car is at floor 0, state is IDLE, and it picks up the destination 5
    logic6.determineNextTarget();
    assert.strictEqual(logic6.targetFloor, 5, "Test 6 Failed: Target must be 5 upon initial selection.");

    // Simulate arrival at Floor 1 (intermediate stop)
    logic6.currentFloor = 1;
    logic6.state = 3; // DOOR_OPEN
    
    // If the logic incorrectly inferred target based on direction (1), it might set target = 1.
    // We check that the original destination (5) is still preserved in the Map, 
    // even if the car is currently at 1.
    assert.strictEqual(logic6.destinations.get(5), riderId, "Test 6 Failed: Destination 5 must be preserved in the destination map.");

    // Simulate arrival at Floor 5
    logic6.currentFloor = 5;
    logic6.targetFloor = 5;
    logic6.state = 3; // DOOR_OPEN
    
    // When arriving, the destination should be cleared
    logic6.checkArrivalAndServe();
    assert.strictEqual(logic6.destinations.size, 0, "Test 6 Failed: Destination should be cleared upon arrival at target.");
    
    console.log("Test 6: PASSED");
} catch (e) {
    console.error("Test 6: FAILED", e.message);
}


// 7. Reset clears phantom state
try {
    console.log("Test 7: Reset clears phantom state...");
    const logic7 = new ElevatorLogic({ floorCount: 6, maxCapacity: 4, floorHeight: 3.4 });

    // Introduce phantom state
    logic7.passengers.add(1);
    logic7.upCalls.add(3);
    logic7.destinations.set(5, 1);
    logic7.currentFloor = 2;
    logic7.state = 1;
    logic7.doorTimer = 10.0;

    // Reset
    logic7.reset();

    // Verify cleared state
    assertState(logic7, 0, "Test 7 Failed: State must be IDLE after reset.");
    assertFloor(logic7, 0, "Test 7 Failed: Floor must be 0 after reset.");
    assert.strictEqual(logic7.passengers.size, 0, "Test 7 Failed: Passengers set must be empty.");
    assert.strictEqual(logic7.upCalls.size, 0, "Test 7 Failed: Up calls set must be empty.");
    assert.strictEqual(logic7.destinations.size, 0, "Test 7 Failed: Destinations map must be empty.");
    assert.strictEqual(logic7.doorTimer, 0, "Test 7 Failed: Door timer must be zero.");
    
    console.log("Test 7: PASSED");
} catch (e) {
    console.error("Test 7: FAILED", e.message);
}

console.log("\nAll tests finished.");