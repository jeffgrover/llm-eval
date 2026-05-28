const assert = require('assert');
const { ElevatorLogic } = require('./elevator_logic.js');

const STATES = ElevatorLogic.STATES;

function tickUntil(logic, predicate, maxTicks = 10000) {
    let ticks = 0;
    while (ticks < maxTicks) {
        logic.tick(0.016);
        ticks++;
        if (predicate(logic)) return ticks;
    }
    throw new Error(`Predicate not satisfied after ${maxTicks} ticks`);
}

function runUntilDoorOpenAt(logic, floor, maxTicks = 10000) {
    return tickUntil(logic, (l) => l.state === STATES.DOOR_OPEN && l.currentFloor === floor, maxTicks);
}

function runUntilDoorClosed(logic, maxTicks = 10000) {
    return tickUntil(logic, (l) => l.state === STATES.IDLE || l.state === STATES.MOVING, maxTicks);
}

function runUntilState(logic, state, maxTicks = 10000) {
    return tickUntil(logic, (l) => l.state === state, maxTicks);
}

const tests = [];
let passed = 0;
let failed = 0;

function test(name, fn) {
    tests.push({ name, fn });
}

function runTests() {
    console.log('Running elevator logic tests...\n');
    for (const t of tests) {
        try {
            t.fn();
            console.log(`✓ ${t.name}`);
            passed++;
        } catch (err) {
            console.log(`✗ ${t.name}`);
            console.log(`  ${err.message}`);
            failed++;
        }
    }
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
}

test('Lobby rush with more callers than capacity', () => {
    const logic = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    
    logic.callUp(0);
    
    runUntilDoorOpenAt(logic, 0);
    assert.strictEqual(logic.state, STATES.DOOR_OPEN);
    assert.strictEqual(logic.currentFloor, 0);
    
    const p1 = { id: 1 };
    const p2 = { id: 2 };
    const p3 = { id: 3 };
    const p4 = { id: 4 };
    
    const spot1 = logic.reserveBoardingSpot(p1);
    assert(spot1 !== null);
    logic.completeBoard(p1);
    logic.pressDestination(3);
    
    const spot2 = logic.reserveBoardingSpot(p2);
    assert(spot2 !== null);
    logic.completeBoard(p2);
    logic.pressDestination(4);
    
    const spot3 = logic.reserveBoardingSpot(p3);
    assert(spot3 !== null);
    logic.completeBoard(p3);
    logic.pressDestination(5);
    
    const spot4 = logic.reserveBoardingSpot(p4);
    assert(spot4 !== null);
    logic.completeBoard(p4);
    logic.pressDestination(2);
    
    assert.strictEqual(logic.currentCapacityFree(), 0);
    
    logic.callUp(0);
    logic.callUp(0);
    logic.callUp(0);
    
    runUntilDoorClosed(logic);
    
    assert(logic.targetFloor > 0, `Target floor should be > 0, got ${logic.targetFloor}`);
    assert(logic.direction === 1, `Direction should be UP (1), got ${logic.direction}`);
});

test('Passenger destinations outrank same-floor hall calls', () => {
    const logic = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    
    logic.callUp(0);
    runUntilDoorOpenAt(logic, 0);
    
    const p1 = { id: 1 };
    logic.reserveBoardingSpot(p1);
    logic.completeBoard(p1);
    logic.pressDestination(3);
    
    runUntilDoorClosed(logic);
    
    logic.callUp(0);
    logic.callUp(0);
    
    let reachedFloor3 = false;
    let reopenedAtFloor0 = false;
    
    for (let i = 0; i < 5000; i++) {
        logic.tick(0.016);
        if (logic.currentFloor === 3 && logic.state === STATES.DOOR_OPEN) {
            reachedFloor3 = true;
            break;
        }
        if (logic.currentFloor === 0 && logic.state === STATES.DOOR_OPEN && i > 100) {
            reopenedAtFloor0 = true;
        }
    }
    
    assert(reachedFloor3, 'Should reach floor 3 before reopening at floor 0');
    assert(!reopenedAtFloor0, 'Should not reopen at floor 0 while passengers have destinations');
});

test('Repeated hall-call pressing cannot starve riders', () => {
    const logic = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    
    logic.callUp(0);
    runUntilDoorOpenAt(logic, 0);
    
    const p1 = { id: 1 };
    logic.reserveBoardingSpot(p1);
    logic.completeBoard(p1);
    logic.pressDestination(5);
    
    runUntilDoorClosed(logic);
    
    let reachedFloor5 = false;
    for (let i = 0; i < 8000; i++) {
        logic.callUp(0);
        logic.tick(0.016);
        if (logic.currentFloor === 5 && logic.state === STATES.DOOR_OPEN) {
            reachedFloor5 = true;
            break;
        }
    }
    
    assert(reachedFloor5, 'Should reach passenger destination despite repeated hall calls');
});

test('Opposite-direction calls wait their turn', () => {
    const logic = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    
    logic.callUp(0);
    runUntilDoorOpenAt(logic, 0);
    
    const p1 = { id: 1 };
    logic.reserveBoardingSpot(p1);
    logic.completeBoard(p1);
    logic.pressDestination(4);
    
    runUntilDoorClosed(logic);
    
    logic.callDown(2);
    
    let reachedFloor4First = false;
    for (let i = 0; i < 5000; i++) {
        logic.tick(0.016);
        if (logic.currentFloor === 4 && logic.state === STATES.DOOR_OPEN) {
            reachedFloor4First = true;
            break;
        }
        if (logic.currentFloor === 2 && logic.state === STATES.DOOR_OPEN) {
            assert.fail('Should not serve DOWN call at floor 2 before reaching floor 4');
        }
    }
    
    assert(reachedFloor4First, 'Should reach floor 4 (upward destination) before serving floor 2 DOWN call');
});

test('Door hold and safety cap', () => {
    const logic = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    
    logic.callUp(0);
    runUntilDoorOpenAt(logic, 0);
    
    const p1 = { id: 1 };
    logic.reserveBoardingSpot(p1);
    
    let stayedOpen = false;
    for (let i = 0; i < 200; i++) {
        logic.tick(0.016);
        if (logic.doorOpenTimer >= ElevatorLogic.MIN_DOOR_OPEN_S && logic.state === STATES.DOOR_OPEN) {
            stayedOpen = true;
            break;
        }
    }
    assert(stayedOpen, 'Doors should stay open past MIN_DOOR_OPEN_S while pending boarders exist');
    
    let closedAfterMax = false;
    for (let i = 0; i < 1000; i++) {
        logic.tick(0.016);
        if (logic.state === STATES.DOOR_CLOSING || logic.state === STATES.MOVING) {
            closedAfterMax = true;
            break;
        }
    }
    assert(closedAfterMax, 'Doors should close after MAX_DOOR_OPEN_S even with pending boarders');
});

test('Destination preserved across the action handshake', () => {
    const logic = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    
    logic.callUp(0);
    runUntilDoorOpenAt(logic, 0);
    
    const rider = { id: 'rider' };
    const spot = logic.reserveBoardingSpot(rider);
    assert(spot !== null);
    logic.completeBoard(rider);
    
    logic.pressDestination(5);
    assert(logic.destinations.has(5), 'Destination floor 5 should be registered');
    
    runUntilDoorClosed(logic);
    
    assert.strictEqual(logic.direction, 1, 'Should be moving UP');
    assert(logic.targetFloor === 5, `Target should be floor 5, got ${logic.targetFloor}`);
    
    let reachedFloor5 = false;
    for (let i = 0; i < 8000; i++) {
        logic.tick(0.016);
        if (logic.currentFloor === 5 && logic.state === STATES.DOOR_OPEN) {
            reachedFloor5 = true;
            break;
        }
    }
    
    assert(reachedFloor5, 'Should reach floor 5 (not floor 1 or any other floor)');
});

test('Reset clears phantom state', () => {
    const logic = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    
    logic.callUp(0);
    logic.callDown(3);
    logic.pressDestination(2);
    
    const p1 = { id: 1 };
    logic.reserveBoardingSpot(p1);
    logic.completeBoard(p1);
    logic.registerDisembark(p1);
    
    logic.tick(0.016);
    logic.tick(0.016);
    
    logic.reset();
    
    assert.strictEqual(logic.state, STATES.IDLE);
    assert.strictEqual(logic.currentFloor, 0);
    assert.strictEqual(logic.targetFloor, 0);
    assert.strictEqual(logic.direction, 0);
    assert.strictEqual(logic.upCalls.size, 0);
    assert.strictEqual(logic.downCalls.size, 0);
    assert.strictEqual(logic.destinations.size, 0);
    assert.strictEqual(logic.passengers.size, 0);
    assert.strictEqual(logic.pendingBoarders.size, 0);
    assert.strictEqual(logic.pendingDisembark.size, 0);
    assert.deepStrictEqual(logic.spotOccupancy, [false, false, false, false]);
    assert.strictEqual(logic.doorOpenTimer, 0);
    assert.strictEqual(logic.doorCloseTimer, 0);
    assert.strictEqual(logic.doorPosition, 0);
});

runTests();
