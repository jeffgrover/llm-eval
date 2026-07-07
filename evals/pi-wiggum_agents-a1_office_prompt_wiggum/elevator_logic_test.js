// elevator_logic_test.js - Unit tests for ElevatorLogic (Node.js)

const { ElevatorLogic } = require('./elevator_logic.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        passed++;
        console.log(`✓ ${name}`);
    } catch (e) {
        failed++;
        console.error(`✗ ${name}: ${e.message}`);
    }
}

function assertEqual(actual, expected, message = '') {
    if (actual !== expected) {
        throw new Error(`${message} Expected ${expected}, got ${actual}`);
    }
}

function assertTrue(condition, message = '') {
    if (!condition) {
        throw new Error(message || 'Expected true');
    }
}

function assertFalse(condition, message = '') {
    if (condition) {
        throw new Error(`${message || 'Expected false'} got ${condition}`);
    }
}

// Test 1: Constructor initializes correctly
test('ElevatorLogic constructor initializes correctly', () => {
    const logic = new ElevatorLogic({ floorCount: 6, maxCapacity: 4, floorHeight: 3.4 });
    assertEqual(logic.floorCount, 6);
    assertEqual(logic.maxCapacity, 4);
    assertEqual(logic.floorHeight, 3.4);
    assertEqual(logic.state, logic.IDLE);
    assertEqual(logic.currentFloor, 0);
    assertEqual(logic.direction, 0);
    assertTrue(logic.upCalls.size === 0);
    assertTrue(logic.downCalls.size === 0);
    assertTrue(logic.destinations.size === 0);
    assertTrue(logic.passengers.size === 0);
});

// Test 2: Call up/down adds to appropriate sets
test('callUp and callDown add calls correctly', () => {
    const logic = new ElevatorLogic({ floorCount: 6 });
    logic.callUp(2);
    assertTrue(logic.upCalls.has(2));
    assertEqual(logic.downCalls.size, 0);

    logic.callDown(1);
    assertTrue(logic.downCalls.has(1));
    assertEqual(logic.upCalls.size, 1);

    // Duplicate calls should not add twice
    logic.callUp(2);
    assertEqual(logic.upCalls.size, 1);
});

// Test 3: Invalid floor calls are ignored
test('Invalid floor calls are ignored', () => {
    const logic = new ElevatorLogic({ floorCount: 6 });
    logic.callUp(-1);
    logic.callUp(6);
    logic.callDown(10);
    assertEqual(logic.upCalls.size, 0);
    assertEqual(logic.downCalls.size, 0);
});

// Test 4: pressDestination adds destination
test('pressDestination works correctly', () => {
    const logic = new ElevatorLogic({ floorCount: 6 });
    logic.pressDestination(3);
    assertTrue(logic.destinations.has(3));
    logic.pressDestination(5);
    assertTrue(logic.destinations.has(5));
});

// Test 5: State machine - IDLE to MOVING when there are calls
test('State machine transitions from IDLE to MOVING', () => {
    const logic = new ElevatorLogic({ floorCount: 6 });
    logic.callUp(2);
    logic.tick(0.1); // Should trigger state change

    assertTrue(logic.state === logic.MOVING || logic.currentFloor > 0, 
        `State should be MOVING or moving, got ${logic.state}, currentFloor=${logic.currentFloor}`);
});

// Test 6: State machine - MOVING to DOOR_OPENING when reaching target
test('State machine transitions from MOVING to DOOR_OPENING', () => {
    const logic = new ElevatorLogic({ floorCount: 6 });
    logic.callUp(2);
    
    // Fast-forward by ticking with large dt
    let totalDt = 0;
    while (logic.state !== logic.DOOR_OPENING && totalDt < 10) {
        logic.tick(0.5);
        totalDt += 0.5;
    }
    
    assertEqual(logic.state, logic.DOOR_OPENING);
});

// Test 7: State machine - DOOR_OPENING to DOOR_OPEN after delay
test('State machine transitions from DOOR_OPENING to DOOR_OPEN', () => {
    const logic = new ElevatorLogic({ floorCount: 6 });
    logic.callUp(2);
    
    // Get to DOOR_OPENING state
    let totalDt = 0;
    while (logic.state !== logic.DOOR_OPENING && totalDt < 10) {
        logic.tick(0.5);
        totalDt += 0.5;
    }
    
    // Now tick once to trigger DOOR_OPENING -> DOOR_OPEN
    logic.tick(0.6);
    assertEqual(logic.state, logic.DOOR_OPEN);
});

// Test 8: State machine - DOOR_OPEN to DOOR_CLOSING when no one waiting
test('State machine transitions from DOOR_OPEN to DOOR_CLOSING', () => {
    const logic = new ElevatorLogic({ floorCount: 6 });
    logic.callUp(2);
    
    // Get to DOOR_OPEN state
    let totalDt = 0;
    while (logic.state !== logic.DOOR_OPEN && totalDt < 10) {
        logic.tick(0.5);
        totalDt += 0.5;
    }
    
    // Wait for minimum door open time
    logic.tick(1.5);
    assertEqual(logic.state, logic.DOOR_CLOSING);
});

// Test 9: State machine - DOOR_CLOSING to IDLE or MOVING
test('State machine transitions from DOOR_CLOSING', () => {
    const logic = new ElevatorLogic({ floorCount: 6 });
    logic.callUp(2);
    
    // Get through full cycle to DOOR_CLOSING
    let totalDt = 0;
    while (logic.state !== logic.DOOR_CLOSING && totalDt < 15) {
        logic.tick(0.5);
        totalDt += 0.5;
    }
    
    // Tick once to transition out of DOOR_CLOSING
    logic.tick(0.6);
    
    // Should be either IDLE or MOVING depending on remaining work
    assertTrue(logic.state === logic.IDLE || logic.state === logic.MOVING,
        `Expected IDLE or MOVING, got ${logic.state}`);
});

// Test 10: Capacity management - reserveBoardingSpot works
test('reserveBoardingSpot reserves a spot', () => {
    const logic = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    
    // Create dummy person
    const person = { id: 1 };
    
    // Reserve a spot
    const spot = logic.reserveBoardingSpot(person);
    assertTrue(spot !== null, 'Should have reserved a spot');
    assertTrue(logic.pendingBoarders.has(person));
    assertEqual(logic.currentCapacityFree(), 3);
});

// Test 11: Capacity management - no spots when full
test('reserveBoardingSpot returns null when full', () => {
    const logic = new ElevatorLogic({ floorCount: 6, maxCapacity: 2 });
    
    // Fill capacity
    const p1 = { id: 1 };
    const p2 = { id: 2 };
    logic.reserveBoardingSpot(p1);
    logic.reserveBoardingSpot(p2);
    
    // Next should fail
    const p3 = { id: 3 };
    const spot = logic.reserveBoardingSpot(p3);
    assertEqual(spot, null);
});

// Test 12: completeBoard moves person from pending to passengers
test('completeBoard works correctly', () => {
    const logic = new ElevatorLogic({ floorCount: 6 });
    const person = { id: 1 };
    
    logic.reserveBoardingSpot(person);
    assertTrue(logic.pendingBoarders.has(person));
    assertEqual(logic.passengers.size, 0);
    
    logic.completeBoard(person);
    assertFalse(logic.pendingBoarders.has(person));
    assertTrue(logic.passengers.has(person));
});

// Test 13: registerDisembark moves person from passengers to pendingDisembark
test('registerDisembark works correctly', () => {
    const logic = new ElevatorLogic({ floorCount: 6 });
    const person = { id: 1 };
    
    // First board the person
    logic.reserveBoardingSpot(person);
    logic.completeBoard(person);
    assertTrue(logic.passengers.has(person));
    
    // Now register disembark
    logic.registerDisembark(person);
    assertFalse(logic.passengers.has(person));
    assertTrue(logic.pendingDisembark.has(person));
});

// Test 14: completeDisembark removes from pendingDisembark
test('completeDisembark works correctly', () => {
    const logic = new ElevatorLogic({ floorCount: 6 });
    const person = { id: 1 };
    
    // Board and then register disembark
    logic.reserveBoardingSpot(person);
    logic.completeBoard(person);
    logic.registerDisembark(person);
    assertTrue(logic.pendingDisembark.has(person));
    
    // Complete disembark
    logic.completeDisembark(person);
    assertFalse(logic.pendingDisembark.has(person));
});

// Test 15: isAcceptingAt returns false when not DOOR_OPEN or not at floor
test('isAcceptingAt works correctly', () => {
    const logic = new ElevatorLogic({ floorCount: 6 });
    
    // Not door open state
    assertFalse(logic.isAcceptingAt(2, 1));
    
    // Force to DOOR_OPEN state (hacky but for testing)
    logic.callUp(2);
    let totalDt = 0;
    while (logic.state !== logic.DOOR_OPEN && totalDt < 15) {
        logic.tick(0.5);
        totalDt += 0.5;
    }
    
    // Now at floor 2, DOOR_OPEN
    assertTrue(logic.isAcceptingAt(2, 1));
    assertFalse(logic.isAcceptingAt(3, 1)); // Not at floor 3
});

// Test 16: hasStopsInDirection correctly identifies stops
test('hasStopsInDirection works', () => {
    const logic = new ElevatorLogic({ floorCount: 6 });
    logic.callUp(2);
    logic.callUp(4);
    logic.currentFloor = 1;
    logic.direction = 1;
    
    assertTrue(logic.hasStopsInDirection(1)); // Should have stops above
    assertFalse(logic.hasStopsInDirection(-1)); // No stops below
    
    logic.callDown(0);
    assertTrue(logic.hasStopsInDirection(-1)); // Now has stop below
});

// Test 17: reset clears all state
test('reset works correctly', () => {
    const logic = new ElevatorLogic({ floorCount: 6 });
    logic.callUp(2);
    logic.pressDestination(3);
    
    // Simulate some boarding
    const person = { id: 1 };
    logic.reserveBoardingSpot(person);
    logic.completeBoard(person);
    
    logic.reset();
    
    assertEqual(logic.state, logic.IDLE);
    assertEqual(logic.currentFloor, 0);
    assertEqual(logic.direction, 0);
    assertTrue(logic.upCalls.size === 0);
    assertTrue(logic.downCalls.size === 0);
    assertTrue(logic.destinations.size === 0);
    assertTrue(logic.passengers.size === 0);
    assertTrue(logic.pendingBoarders.size === 0);
    assertTrue(logic.pendingDisembark.size === 0);
});

// Test 18: getState returns correct state object
test('getState returns proper state', () => {
    const logic = new ElevatorLogic({ floorCount: 6 });
    logic.callUp(2);
    logic.pressDestination(4);
    
    const state = logic.getState();
    assertEqual(state.state, logic.IDLE);
    assertEqual(state.currentFloor, 0);
    assertEqual(state.direction, 0);
    assertTrue(state.upCalls.includes(2));
    assertTrue(state.destinations.includes(4));
});

// Summary
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
