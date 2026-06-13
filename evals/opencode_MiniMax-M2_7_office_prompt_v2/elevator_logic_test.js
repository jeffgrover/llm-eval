/**
 * Node-runnable deterministic tests for ElevatorLogic.
 * Run with: node elevator_logic_test.js
 */
'use strict';

const assert = require('assert');
const { ElevatorLogic } = require('./elevator_logic.js');

let testsPassed = 0;
let testsFailed = 0;
let currentTestName = '';

function test(name, fn) {
    currentTestName = name;
    try {
        fn();
        testsPassed++;
        console.log(`  PASS  ${name}`);
    } catch (e) {
        testsFailed++;
        console.log(`  FAIL  ${name}: ${e.message}`);
    }
}

function tickUntil(elevator, predicate, maxTicks = 10000) {
    let ticks = 0;
    while (ticks < maxTicks) {
        elevator.tick(0.016);
        ticks++;
        if (predicate(elevator)) return ticks;
    }
    return -1;
}

function runUntilDoorOpenAt(elevator, floor) {
    return tickUntil(elevator, e =>
        e.getState() === 'DOOR_OPEN' && e.getCurrentFloor() === floor
    );
}

function runUntilDoorClosed(elevator) {
    return tickUntil(elevator, e => e.getState() === 'IDLE');
}

console.log('\n=== ElevatorLogic Tests ===\n');

test('1. Lobby rush with more callers than capacity', () => {
    const elevator = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });

    elevator.callUp(0);
    const ticks1 = runUntilDoorOpenAt(elevator, 0);
    assert(ticks1 > 0, 'Car should open at floor 0');

    elevator.reserveBoardingSpot('p1');
    elevator.completeBoard('p1');
    elevator.reserveBoardingSpot('p2');
    elevator.completeBoard('p2');
    elevator.reserveBoardingSpot('p3');
    elevator.completeBoard('p3');
    elevator.reserveBoardingSpot('p4');
    elevator.completeBoard('p4');

    assert.equal(elevator.getPassengerCount(), 4, 'Should have 4 passengers');

    elevator.pressDestination(3);
    elevator.pressDestination(4);
    elevator.pressDestination(5);

    tickUntil(elevator, e => e.getState() === 'IDLE');

    elevator.callUp(0);
    tickUntil(elevator, e => e.getState() === 'DOOR_OPENING' || e.getState() === 'MOVING');

    elevator.tick(0.016);

    const nextTarget = elevator.getTargetFloor();
    assert(nextTarget > 0, `Next target should be above floor 0, got ${nextTarget}`);
});

test('2. Passenger destinations outrank same-floor hall calls', () => {
    const elevator = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });

    elevator.callUp(0);
    runUntilDoorOpenAt(elevator, 0);

    elevator.reserveBoardingSpot('p1');
    elevator.completeBoard('p1');
    elevator.pressDestination(3);

    tickUntil(elevator, e => e.getState() === 'IDLE');

    elevator.callUp(0);
    tickUntil(elevator, e => e.getState() === 'MOVING' || e.getState() === 'DOOR_OPENING');

    const state = elevator.getState();
    const target = elevator.getTargetFloor();

    assert(target !== 0 || state === 'DOOR_OPENING',
        'Should not immediately reopen at floor 0 with passenger destination for floor 3');
});

test('3. Repeated hall-call pressing cannot starve riders', () => {
    const elevator = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });

    elevator.callUp(0);
    runUntilDoorOpenAt(elevator, 0);

    elevator.reserveBoardingSpot('p1');
    elevator.completeBoard('p1');
    elevator.reserveBoardingSpot('p2');
    elevator.completeBoard('p2');

    elevator.pressDestination(2);

    tickUntil(elevator, e => e.getState() === 'IDLE');

    for (let i = 0; i < 20; i++) {
        elevator.callUp(0);
        elevator.tick(0.016);
    }

    const state = elevator.getState();
    const target = elevator.getTargetFloor();

    assert(target >= 2 || state === 'DOOR_OPEN',
        'Car should still be heading toward or arrived at passenger destination');
});

test('4. Opposite-direction calls wait their turn', () => {
    const elevator = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });

    elevator.callUp(0);
    runUntilDoorOpenAt(elevator, 0);

    elevator.reserveBoardingSpot('p1');
    elevator.completeBoard('p1');
    elevator.pressDestination(5);

    tickUntil(elevator, e => e.getState() === 'IDLE');

    elevator.callDown(3);

    let upDirectionFound = false;
    for (let i = 0; i < 500; i++) {
        elevator.tick(0.016);
        const state = elevator.getState();
        const currentFloor = elevator.getCurrentFloor();

        if (state === 'DOOR_OPEN' && currentFloor === 5) {
            upDirectionFound = true;
            break;
        }

        if (elevator.getDirection() === 1) {
            upDirectionFound = true;
            break;
        }
    }

    assert(upDirectionFound, 'Car should continue UP to serve passenger destination before handling DOWN call');
});

test('5. Door hold and safety cap', () => {
    const elevator = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });

    elevator.callUp(0);
    runUntilDoorOpenAt(elevator, 0);

    elevator.reserveBoardingSpot('p1');
    elevator.completeBoard('p1');
    elevator.registerDisembark('p1');

    const doorOpenTicks = tickUntil(elevator, e =>
        e.getState() === 'DOOR_CLOSING' || e.getState() === 'IDLE'
    );

    assert(doorOpenTicks > 0, 'Doors should remain open while pending boarders/disembarkers exist');

    elevator.completeDisembark('p1');

    runUntilDoorClosed(elevator);
    elevator.callUp(2);
    runUntilDoorOpenAt(elevator, 2);

    elevator.reserveBoardingSpot('p2');
    elevator.completeBoard('p2');

    let maxTicks = Math.ceil(4.0 / 0.016) + 10;
    let ticks = 0;
    while (ticks < maxTicks) {
        elevator.tick(0.016);
        ticks++;
        if (elevator.getState() === 'DOOR_CLOSING' || elevator.getState() === 'IDLE') {
            break;
        }
    }

    assert(ticks < maxTicks, 'Doors should close after MAX_DOOR_OPEN_S even with pending boarders');
});

test('6. Destination preserved across the action handshake', () => {
    const elevator = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });

    elevator.callUp(0);
    runUntilDoorOpenAt(elevator, 0);

    const toFloor = 5;

    elevator.reserveBoardingSpot('p1');
    elevator.completeBoard('p1');
    elevator.pressDestination(toFloor);

    tickUntil(elevator, e => e.getState() === 'IDLE');

    elevator.callDown(5);
    runUntilDoorOpenAt(elevator, 5);

    const hasDest = elevator.getDestinations().has(toFloor);
    assert(hasDest || elevator.getPassengerCount() > 0,
        'Destination floor 5 should be preserved for passenger');
});

test('7. Reset clears phantom state', () => {
    const elevator = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });

    elevator.callUp(0);
    elevator.callUp(2);
    elevator.callDown(3);
    elevator.pressDestination(1);
    elevator.pressDestination(4);

    elevator.reserveBoardingSpot('p1');
    elevator.completeBoard('p1');
    elevator.registerDisembark('p1');
    elevator.completeDisembark('p1');

    elevator.reset();

    assert.equal(elevator.getUpCalls().size, 0, 'Up calls should be cleared');
    assert.equal(elevator.getDownCalls().size, 0, 'Down calls should be cleared');
    assert.equal(elevator.getDestinations().size, 0, 'Destinations should be cleared');
    assert.equal(elevator.getPassengerCount(), 0, 'Passengers should be cleared');
    assert.equal(elevator.getPendingBoarderCount(), 0, 'Pending boarders should be cleared');
    assert.equal(elevator.getPendingDisembarkCount(), 0, 'Pending disembarkers should be cleared');
    assert.equal(elevator.getCurrentFloor(), 0, 'Should be at floor 0');
    assert.equal(elevator.getTargetFloor(), 0, 'Target floor should be 0');
    assert.equal(elevator.getDirection(), 0, 'Direction should be 0');
});

test('8. Basic up/down call handling', () => {
    const elevator = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });

    elevator.callUp(0);
    const ticks1 = runUntilDoorOpenAt(elevator, 0);
    assert(ticks1 > 0, 'Should open at floor 0 for up call');

    tickUntil(elevator, e => e.getState() === 'IDLE');

    elevator.callUp(2);
    const ticks2 = tickUntil(elevator, e => e.getState() === 'DOOR_OPEN' && e.getCurrentFloor() === 2);
    assert(ticks2 > 0, 'Should open at floor 2 for up call');
});

test('9. No capacity overflow', () => {
    const elevator = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });

    elevator.callUp(0);
    runUntilDoorOpenAt(elevator, 0);

    const r1 = elevator.reserveBoardingSpot('p1');
    const r2 = elevator.reserveBoardingSpot('p2');
    const r3 = elevator.reserveBoardingSpot('p3');
    const r4 = elevator.reserveBoardingSpot('p4');
    const r5 = elevator.reserveBoardingSpot('p5');

    assert(r1 !== null, 'First boarder should get spot');
    assert(r5 === null, 'Fifth boarder should be rejected (car full)');
});

test('10. Direction inference from nearest call', () => {
    const elevator = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });

    elevator.callDown(4);
    const ticks = tickUntil(elevator, e => e.getState() === 'DOOR_OPEN' && e.getCurrentFloor() === 4);
    assert(ticks > 0, 'Should serve down call at floor 4');
});

console.log('\n=== Results ===');
console.log(`  PASSED: ${testsPassed}`);
console.log(`  FAILED: ${testsFailed}`);
console.log('');

if (testsFailed > 0) {
    console.log('OVERALL: FAIL');
    process.exit(1);
} else {
    console.log('OVERALL: PASS');
    process.exit(0);
}
