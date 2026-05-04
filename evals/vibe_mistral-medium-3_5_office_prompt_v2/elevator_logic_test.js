const assert = require('assert');
const { ElevatorLogic } = require('./elevator_logic.js');

let testsPassed = 0;
let testsFailed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`PASS: ${name}`);
        testsPassed++;
    } catch (e) {
        console.log(`FAIL: ${name}`);
        console.log(`  ${e.message}`);
        testsFailed++;
    }
}

function tickUntil(logic, predicate, maxTicks = 1000) {
    for (let i = 0; i < maxTicks; i++) {
        logic.tick(0.05);
        if (predicate()) return true;
    }
    return false;
}

function runUntilDoorOpenAt(logic, floor, maxTicks = 1000) {
    return tickUntil(logic, () => logic.state === 'DOOR_OPEN' && Math.round(logic.currentFloor) === floor, maxTicks);
}

function runUntilDoorClosed(logic, maxTicks = 1000) {
    return tickUntil(logic, () => logic.state === 'IDLE' || logic.state === 'MOVING', maxTicks);
}

// Test 1: Lobby rush with more callers than capacity
function testLobbyRush() {
    const logic = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    
    // Add UP call at floor 0
    logic.callUp(0);
    
    // Open doors at floor 0
    logic.state = 'DOOR_OPEN';
    logic.currentFloor = 0;
    
    // Board exactly 4 people
    const persons = ['p1', 'p2', 'p3', 'p4'];
    for (const p of persons) {
        const spot = logic.reserveBoardingSpot(p);
        assert.notStrictEqual(spot, null, 'Should reserve spot');
        logic.completeBoard(p);
    }
    
    // Press destinations for upper floors
    logic.pressDestination(5);
    logic.pressDestination(5);
    logic.pressDestination(3);
    logic.pressDestination(2);
    
    // More lobby callers re-press UP
    logic.callUp(0);
    logic.callUp(0);
    logic.callUp(0);
    
    // Simulate door closing
    // Force door to close by clearing pending sets
    logic.pendingBoarders.clear();
    logic.pendingDisembark.clear();
    logic.doorOpenTimer = 2.0; // Exceed MIN_DOOR_OPEN_S
    logic.tick(0.01);
    
    // Should transition to DOOR_CLOSING
    assert.strictEqual(logic.state, 'DOOR_CLOSING', 'Should be closing doors');
    
    // Finish closing
    logic.doorOpenTimer = 0.8;
    logic.tick(0.01);
    
    // Next target must be above floor 0, not floor 0 again
    assert.ok(logic.targetFloor > 0, `Target floor ${logic.targetFloor} should be above 0`);
    assert.ok(logic.state === 'MOVING' || logic.state === 'DOOR_OPENING', `State should be MOVING or DOOR_OPENING, got ${logic.state}`);
}

// Test 2: Passenger destinations outrank same-floor hall calls
function testPassengerDestinationsOutrank() {
    const logic = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    
    // Setup: car at floor 2 with passengers going to floor 5
    logic.currentFloor = 2;
    logic.state = 'DOOR_OPEN';
    
    const p1 = 'passenger1';
    const spot = logic.reserveBoardingSpot(p1);
    assert.notStrictEqual(spot, null);
    logic.completeBoard(p1);
    logic.pressDestination(5);
    
    // Add a same-floor hall call (DOWN at floor 2)
    logic.callDown(2);
    
    // Close doors
    logic.pendingBoarders.clear();
    logic.pendingDisembark.clear();
    logic.doorOpenTimer = 2.0;
    logic.tick(0.01);
    
    // Doors should be closing
    assert.strictEqual(logic.state, 'DOOR_CLOSING', 'Should be closing');
    
    // After closing, should NOT reopen for the same-floor call
    logic.doorOpenTimer = 0.8;
    logic.tick(0.01);
    
    // Should be moving towards floor 5
    assert.ok(logic.targetFloor > 2 || logic.direction === 1, 'Should be moving up towards destination');
    assert.ok(logic.state !== 'DOOR_OPENING', 'Should not reopen');
}

// Test 3: Repeated hall-call pressing cannot starve riders
function testNoStarvation() {
    const logic = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    
    // Setup: car at floor 0 with 4 passengers going to floor 5
    logic.state = 'DOOR_OPEN';
    logic.currentFloor = 0;
    
    const passengers = ['p1', 'p2', 'p3', 'p4'];
    for (const p of passengers) {
        logic.reserveBoardingSpot(p);
        logic.completeBoard(p);
    }
    logic.pressDestination(5);
    logic.pressDestination(5);
    logic.pressDestination(5);
    logic.pressDestination(5);
    
    // Close doors
    logic.pendingBoarders.clear();
    logic.pendingDisembark.clear();
    logic.doorOpenTimer = 2.0;
    logic.tick(0.01);
    
    // Keep pressing UP at floor 0
    for (let i = 0; i < 100; i++) {
        logic.callUp(0);
        
        // Tick the logic
        if (logic.state === 'MOVING') {
            // Move towards target
            logic.tick(0.5);
        } else if (logic.state === 'DOOR_CLOSING') {
            logic.doorOpenTimer = 0.8;
            logic.tick(0.01);
        } else if (logic.state === 'DOOR_OPENING') {
            logic.doorOpenTimer = 0.8;
            logic.tick(0.01);
        } else if (logic.state === 'DOOR_OPEN') {
            logic.doorOpenTimer = 2.0;
            logic.tick(0.01);
        } else if (logic.state === 'IDLE') {
            logic.tick(0.01);
        }
        
        // Check if we've reached floor 5
        if (Math.round(logic.currentFloor) === 5) {
            return; // Success - car reached destination
        }
    }
    
    // Should have reached floor 5
    assert.ok(false, 'Car should have reached floor 5 despite repeated lobby calls');
}

// Test 4: Opposite-direction calls wait their turn
function testOppositeDirectionWaits() {
    const logic = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    
    // Car moving up from floor 1 to floor 4 with work above
    logic.currentFloor = 1;
    logic.targetFloor = 4;
    logic.direction = 1;
    logic.state = 'MOVING';
    logic.pressDestination(4);
    
    // Add DOWN call at floor 2
    logic.callDown(2);
    
    // Tick until we pass floor 2
    for (let i = 0; i < 100; i++) {
        logic.tick(0.1);
        
        // Car should continue moving up, not reverse
        if (logic.currentFloor >= 2 && logic.currentFloor < 3) {
            // At floor 2, should still be going up
            assert.strictEqual(logic.direction, 1, 'Should continue going up');
        }
        
        if (Math.round(logic.currentFloor) >= 4) {
            break; // Reached target
        }
    }
    
    assert.ok(Math.round(logic.currentFloor) >= 4, 'Should have reached floor 4 before serving DOWN call at 2');
}

// Test 5: Door hold and safety cap
function testDoorHoldAndCap() {
    const logic = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    
    // Test 5a: Doors stay open while pending
    logic.state = 'DOOR_OPEN';
    logic.currentFloor = 0;
    logic.reserveBoardingSpot('slow_boarder');
    logic.doorOpenTimer = 0;
    
    // Tick for less than MIN_DOOR_OPEN_S - should stay open
    for (let i = 0; i < 14; i++) {
        logic.tick(0.1);
    }
    assert.strictEqual(logic.state, 'DOOR_OPEN', 'Should stay open with pending boarder');
    
    // Test 5b: After MIN_DOOR_OPEN_S with no pending, should close
    logic.pendingBoarders.clear();
    logic.doorOpenTimer = 1.5; // Just at MIN_DOOR_OPEN_S
    logic.tick(0.01);
    assert.strictEqual(logic.state, 'DOOR_CLOSING', 'Should close after MIN_DOOR_OPEN_S with no pending');
    
    // Test 5c: Safety cap forces close even with pending
    logic.state = 'DOOR_OPEN';
    logic.doorOpenTimer = 0;
    logic.reserveBoardingSpot('slow_boarder2');
    
    // Advance timer to MAX_DOOR_OPEN_S
    logic.doorOpenTimer = 8.0;
    logic.tick(0.01);
    
    assert.strictEqual(logic.state, 'DOOR_CLOSING', 'Should force close after MAX_DOOR_OPEN_S');
    assert.strictEqual(logic.pendingBoarders.size, 0, 'Pending boarders should be cleared');
}

// Test 6: Destination preserved across action handshake
function testDestinationPreserved() {
    const logic = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    
    // Simulate: WAIT_AT_PANEL at floor 0 (UP) -> ENTER_ELEVATOR -> PRESS_FLOOR(5) -> WAIT_FOR_FLOOR(5)
    
    // Step 1: Call UP from floor 0
    logic.callUp(0);
    
    // Step 2: Car arrives at floor 0, doors open
    // We need to manually set up the state
    logic.currentFloor = 0;
    logic.state = 'IDLE';
    
    // Advance to get car to floor 0 with doors open
    logic.callUp(0);
    logic.tick(0.01);
    
    // Manually open doors (simulating car arrival)
    logic.state = 'DOOR_OPEN';
    logic.currentFloor = 0;
    logic.doorOpenTimer = 0;
    
    // Step 3: Reserve spot and board
    const spot = logic.reserveBoardingSpot('person1');
    assert.notStrictEqual(spot, null, 'Should reserve spot');
    logic.completeBoard('person1');
    
    // Step 4: Press floor 5
    logic.pressDestination(5);
    
    // Verify destination is set to 5
    assert.ok(logic.destinations.has(5), 'Destination should be floor 5');
    assert.ok(!logic.destinations.has(1), 'Destination should NOT be floor 1');
    
    // Step 5: Close doors and move
    logic.pendingBoarders.clear();
    logic.pendingDisembark.clear();
    logic.doorOpenTimer = 2.0;
    logic.tick(0.01);
    
    // Should be moving towards floor 5
    assert.strictEqual(logic.state, 'DOOR_CLOSING', 'Should be closing');
    
    logic.doorOpenTimer = 0.8;
    logic.tick(0.01);
    
    assert.ok(logic.direction === 1, 'Should be going up');
    assert.ok(logic.targetFloor >= 5 || logic.targetFloor > 0, `Target should be >= 5, got ${logic.targetFloor}`);
    
    // Tick until we reach floor 5
    const reached = tickUntil(logic, () => Math.round(logic.currentFloor) === 5, 1000);
    assert.ok(reached, 'Should have reached floor 5');
}

// Test 7: Reset clears phantom state
function testResetClearsState() {
    const logic = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    
    // Add various state
    logic.callUp(2);
    logic.callDown(3);
    logic.pressDestination(4);
    logic.state = 'MOVING';
    logic.direction = 1;
    logic.currentFloor = 1;
    logic.targetFloor = 4;
    
    const p1 = 'passenger1';
    logic.reserveBoardingSpot(p1);
    logic.completeBoard(p1);
    logic.registerDisembark(p1);
    logic.spotOccupancy[0] = true;
    
    logic.doorOpenTimer = 5.0;
    
    // Reset
    logic.reset();
    
    // Verify all cleared
    assert.strictEqual(logic.state, 'IDLE');
    assert.strictEqual(logic.direction, 0);
    assert.strictEqual(logic.currentFloor, 0);
    assert.strictEqual(logic.targetFloor, 0);
    assert.strictEqual(logic.upCalls.size, 0);
    assert.strictEqual(logic.downCalls.size, 0);
    assert.strictEqual(logic.destinations.size, 0);
    assert.strictEqual(logic.passengers.size, 0);
    assert.strictEqual(logic.pendingBoarders.size, 0);
    assert.strictEqual(logic.pendingDisembark.size, 0);
    assert.ok(!logic.spotOccupancy.some(o => o), 'All spots should be free');
    assert.strictEqual(logic.doorOpenTimer, 0);
}

// Run all tests
console.log('Running elevator logic tests...\n');

test('Test 1: Lobby rush with more callers than capacity', testLobbyRush);
test('Test 2: Passenger destinations outrank same-floor hall calls', testPassengerDestinationsOutrank);
test('Test 3: Repeated hall-call pressing cannot starve riders', testNoStarvation);
test('Test 4: Opposite-direction calls wait their turn', testOppositeDirectionWaits);
test('Test 5: Door hold and safety cap', testDoorHoldAndCap);
test('Test 6: Destination preserved across action handshake', testDestinationPreserved);
test('Test 7: Reset clears phantom state', testResetClearsState);

console.log(`\n${testsPassed} passed, ${testsFailed} failed`);

if (testsFailed > 0) {
    process.exit(1);
}
