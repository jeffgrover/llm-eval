const assert = require('assert');
const { ElevatorLogic } = require('./elevator_logic.js');

function tickUntil(logic, predicate, maxTicks = 10000) {
    for (let i = 0; i < maxTicks; i++) {
        logic.tick(0.1);
        if (predicate(logic)) return i;
    }
    throw new Error('tickUntil timeout');
}

function runUntilDoorOpenAt(logic, floor) {
    return tickUntil(logic, l => l.state === 'DOOR_OPEN' && l.currentFloor === floor);
}

function runUntilDoorClosed(logic) {
    return tickUntil(logic, l => l.state === 'IDLE');
}

function testLobbyRush() {
    const logic = new ElevatorLogic({ maxCapacity: 4 });
    logic.callUp(0);
    runUntilDoorOpenAt(logic, 0);
    // Board 4 people
    const ids = [1,2,3,4];
    ids.forEach(id => {
        const spot = logic.reserveBoardingSpot(id);
        assert(spot !== null);
        logic.completeBoard(id);
    });
    logic.pressDestination(5);
    logic.callUp(0);
    runUntilDoorClosed(logic);
    logic.tick(0.1); // Process IDLE state
    assert(logic.targetFloor === 5, `Expected target 5, got ${logic.targetFloor}`);
    console.log('Test 1 passed: Lobby rush');
}

function testDestinationsOutrank() {
    const logic = new ElevatorLogic();
    logic.callUp(0);
    runUntilDoorOpenAt(logic, 0);
    const id = 1;
    logic.reserveBoardingSpot(id);
    logic.completeBoard(id);
    logic.pressDestination(5);
    logic.callUp(0);
    runUntilDoorClosed(logic);
    logic.tick(0.1); // Process IDLE
    assert(logic.targetFloor === 5, `Expected 5, got ${logic.targetFloor}`);
    console.log('Test 2 passed: Destinations outrank');
}

function testRepeatedCallNoStarve() {
    const logic = new ElevatorLogic();
    logic.callUp(0);
    runUntilDoorOpenAt(logic, 0);
    const id = 1;
    logic.reserveBoardingSpot(id);
    logic.completeBoard(id);
    logic.pressDestination(5);
    for (let i=0; i<10; i++) logic.callUp(0);
    runUntilDoorClosed(logic);
    tickUntil(logic, l => l.currentFloor === 5);
    assert(logic.currentFloor === 5);
    console.log('Test 3 passed: Repeated call no starve');
}

function testOppositeDirWait() {
    const logic = new ElevatorLogic();
    logic.callUp(0);
    runUntilDoorOpenAt(logic, 0);
    const id = 1;
    logic.reserveBoardingSpot(id);
    logic.completeBoard(id);
    logic.pressDestination(5);
    logic.callDown(3);
    runUntilDoorClosed(logic);
    tickUntil(logic, l => l.currentFloor === 5);
    assert(logic.currentFloor === 5);
    console.log('Test 4 passed: Opposite dir waits');
}

function testDoorHold() {
    const logic = new ElevatorLogic();
    logic.callUp(0);
    runUntilDoorOpenAt(logic, 0);
    const id = 1;
    logic.reserveBoardingSpot(id);
    logic.doorTimer = logic.MIN_DOOR_OPEN_S;
    logic.tick(0.1);
    assert(logic.state === 'DOOR_OPEN');
    logic.doorTimer = logic.MAX_DOOR_OPEN_S + 1;
    logic.tick(0.1);
    assert(logic.state === 'DOOR_CLOSING');
    console.log('Test 5 passed: Door hold and safety cap');
}

function testDestinationPreserved() {
    const logic = new ElevatorLogic();
    logic.callUp(0);
    runUntilDoorOpenAt(logic, 0);
    const id = 1;
    logic.reserveBoardingSpot(id);
    logic.completeBoard(id);
    logic.pressDestination(5);
    logic.callUp(0);
    runUntilDoorClosed(logic);
    logic.tick(0.1); // Process IDLE
    assert(logic.targetFloor === 5, `Expected 5 got ${logic.targetFloor}`);
    tickUntil(logic, l => l.currentFloor === 5);
    assert(logic.currentFloor === 5);
    console.log('Test 6 passed: Destination preserved');
}

function testReset() {
    const logic = new ElevatorLogic();
    logic.callUp(0);
    logic.pressDestination(5);
    logic.callDown(3);
    logic.reset();
    assert(logic.upCalls.size === 0);
    assert(logic.downCalls.size === 0);
    assert(logic.destinations.size === 0);
    assert(logic.passengers.size === 0);
    assert(logic.pendingBoarders.size === 0);
    assert(logic.currentFloor === 0);
    assert(logic.state === 'IDLE');
    console.log('Test 7 passed: Reset clears state');
}

// Run all tests
let passed = 0, failed = 0;
const tests = [
    ['Lobby Rush', testLobbyRush],
    ['Destinations Outrank', testDestinationsOutrank],
    ['Repeated Call No Starve', testRepeatedCallNoStarve],
    ['Opposite Dir Wait', testOppositeDirWait],
    ['Door Hold', testDoorHold],
    ['Destination Preserved', testDestinationPreserved],
    ['Reset Clears State', testReset]
];

tests.forEach(([name, fn]) => {
    try {
        fn();
        passed++;
    } catch (e) {
        failed++;
        console.error(`FAIL ${name}: ${e.message}`);
    }
});

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
