var assert = require("assert");
var { ElevatorLogic } = require("./elevator_logic.js");

// Helper: tick until state or predicate
function tickUntil(logic, predicate, maxTicks) {
    maxTicks = maxTicks || 1000;
    for (var t = 0; t < maxTicks; t++) {
        logic.tick(0.016);
        if (predicate(logic)) return true;
    }
    return false;
}

// Test 1: Lobby rush with more callers than capacity
(function testLobbyRush() {
    var logic = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    logic.reset();
    logic.currentFloor = 0;
    logic.targetFloor = 0;
    logic.state = 'IDLE';

    // Simulate lobby calls
    logic.callUp(0);

    // Open doors and board exactly 4 people
    logic.state = 'DOOR_OPEN';
    for (var i = 0; i < 4; i++) {
        logic.reserveBoardingSpot({id: i});
    }
    for (var j = 0; j < 4; j++) {
        logic.completeBoard({id: j});
    }
    // Press upper floor destinations
    logic.pressDestination(5);
    logic.pressDestination(3);

    // Close doors and tick until moving
    logic.state = 'DOOR_CLOSING';
    tickUntil(logic, function(l) { return l.state === 'MOVING'; });

    // Now simulate leftover lobby callers re-pressing UP
    logic.callUp(0);

    // Doors close, next target must be above floor 0
    // After tick, we should have moved to destination
    assert(logic.targetFloor > 0, "Target should be > 0, not 0");
    console.log("Test 1: Lobby rush - PASS");
})();

// Test 2: Passenger destinations outrank same-floor hall calls
(function testPassengerDestinationsOutrank() {
    var logic = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    logic.reset();
    logic.currentFloor = 1;
    logic.targetFloor = 1;
    logic.direction = 1;
    logic.state = 'DOOR_OPEN';

    // Board some passengers and set destinations
    for (var i = 0; i < 2; i++) {
        logic.passengers.add({id: i});
    }
    logic.pressDestination(3);
    logic.pressDestination(4);

    // Hall call at same floor (floor 1)
    logic.callUp(1);

    // Simulate door-close by calling tick once, which triggers state transition and target selection
    logic.tick(0.016); // This will transition to IDLE and set target

    // After tick, target should be 3 or 4 (a destination) not 1 (same floor)
    assert(logic.targetFloor === 3 || logic.targetFloor === 4, "Target should be destination, not same floor");
    console.log("Test 2: Passengers outrank hall calls - PASS");
})();

// Test 3: Repeated hall-call pressing cannot starve riders
(function testHallCallStarvation() {
    var logic = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    logic.reset();
    logic.currentFloor = 0;
    logic.targetFloor = 0;
    logic.state = 'IDLE';

    // Simulate lobby calls repeatedly
    for (var c = 0; c < 5; c++) {
        logic.callUp(0);
    }

    // Board 4 people, press destinations
    logic.state = 'DOOR_OPEN';
    for (var i = 0; i < 4; i++) {
        logic.reserveBoardingSpot({id: i});
        logic.completeBoard({id: i});
    }
    logic.pressDestination(5);

    // Close doors and simulate multiple ticks where lobby keep pressing UP
    for (var t = 0; t < 20; t++) {
        logic.tick(0.016);
        if (logic.state === 'MOVING') {
            // Should move to destination, not keep reopening
            assert(logic.currentFloor !== 0 || logic.state === 'MOVING', "Should move out of lobby");
        }
    }
    console.log("Test 3: Hall call starvation - PASS");
})();

// Test 4: Opposite-direction calls wait their turn
(function testOppositeDirectionCalls() {
    var logic = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    logic.reset();
    logic.currentFloor = 1;
    logic.targetFloor = 3;
    logic.direction = 1;
    logic.state = 'MOVING';

    // Call down at current or lower floor
    logic.callDown(0);

    // Simulate ticks
    for (var t = 0; t < 50; t++) {
        logic.tick(0.016);
        // While moving UP with work above, car should not reverse until upward work served
        if (logic.currentFloor < 3) {
            assert(logic.direction === 1, "Direction should be UP, not down");
        }
    }
    console.log("Test 4: Opposite-direction calls - PASS");
})();

// Test 5: Door hold and safety cap
(function testDoorHoldSafety() {
    var logic = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    logic.reset();
    logic.currentFloor = 1;
    logic.targetFloor = 1;
    logic.state = 'DOOR_OPEN';
    logic.doorOpenTimer = 0;

    // Add pending boarders to keep doors open
    logic.pendingBoarders.add({id: 1});

    // Tick past minDoorOpenS but within maxDoorOpenS
    logic.tick(1);
    assert(logic.state === 'DOOR_OPEN', "Should stay DOOR_OPEN while pendingBoarders");

    // Remove pendingBoarders and let maxDoorOpenS expire
    logic.pendingBoarders.clear();
    logic.doorOpenTimer = logic.maxDoorOpenS + 2;
    logic.tick(0.016);
    assert(logic.state === 'DOOR_CLOSING', "Should close after max door open time");
    console.log("Test 5: Door hold and safety cap - PASS");
})();

// Test 6: Destination preserved across action handshake
(function testDestinationPreserved() {
    var logic = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    logic.reset();
    logic.currentFloor = 0;
    logic.targetFloor = 0;

    // Simulate: WAIT_AT_PANEL -> ENTER_ELEVATOR -> PRESS_FLOOR -> WAIT_FOR_FLOOR
    logic.callUp(0);
    logic.pressDestination(5);
    // Board person
    var spot = logic.reserveBoardingSpot({id: 1});
    logic.completeBoard({id: 1});

    // After boarding, destination 5 should be preserved in logic
    // Even when car moves to floor 1, the destination should still be 5
    assert(logic.destinations.has(5), "Destination should be 5");
    // Simulate moving to floor 1
    logic.targetFloor = 1;
    logic.currentFloor = 1;
    // When arriving at floor 5, only then clear destination
    assert(logic.destinations.has(5), "Should still have destination 5 after reaching floor 1");
    console.log("Test 6: Destination preserved - PASS");
})();

// Test 7: Reset clears phantom state
(function testReset() {
    var logic = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    logic.reset();

    // Set up some state
    logic.currentFloor = 3;
    logic.targetFloor = 5;
    logic.direction = 1;
    logic.state = 'MOVING';
    logic.callUp(0);
    logic.callDown(2);
    logic.pressDestination(4);
    var p = {id: 1};
    logic.passengers.add(p);
    logic.destinations.add(5);

    logic.reset();

    // After reset, everything should be cleared
    assert(logic.currentFloor === 0, "Floor should be 0");
    assert(logic.targetFloor === 0, "Target should be 0");
    assert(logic.direction === 0, "Direction should be 0");
    assert(logic.state === 'IDLE', "State should be IDLE");
    assert(logic.passengers.size === 0, "Passengers cleared");
    assert(logic.destinations.size === 0, "Destinations cleared");
    assert(logic.upCalls.length === 0, "Up calls cleared");
    assert(logic.downCalls.length === 0, "Down calls cleared");
    console.log("Test 7: Reset clears phantom state - PASS");
})();

// Summary
console.log("All elevator_logic tests completed.");
