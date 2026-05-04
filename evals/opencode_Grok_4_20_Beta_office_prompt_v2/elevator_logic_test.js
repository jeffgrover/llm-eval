const assert = require('assert');
const { ElevatorLogic } = require('./elevator_logic.js');

function tickUntil(logic, predicate, maxTicks = 500) {
    for (let i = 0; i < maxTicks; i++) {
        logic.tick(0.1);
        if (predicate(logic)) return true;
    }
    return false;
}

function runUntilDoorOpenAt(logic, floor, maxTicks = 300) {
    return tickUntil(logic, (l) => l.state === 'DOOR_OPEN' && l.currentFloor === floor, maxTicks);
}

function runUntilDoorClosed(logic, maxTicks = 200) {
    return tickUntil(logic, (l) => l.state === 'IDLE', maxTicks);
}

console.log('Running ElevatorLogic tests...\n');

const logic = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });

// Test 1: Lobby rush with more callers than capacity
console.log('Test 1: Lobby rush capacity handling');
logic.callUp(0);
const opened = runUntilDoorOpenAt(logic, 0);
assert.ok(opened, 'Should reach DOOR_OPEN at floor 0');
assert.strictEqual(logic.state, 'DOOR_OPEN');
assert.strictEqual(logic.currentFloor, 0);

for (let i = 0; i < 4; i++) {
    const spot = logic.reserveBoardingSpot(`p${i}`);
    assert.ok(spot !== null);
    logic.completeBoard(`p${i}`);
}
assert.strictEqual(logic.currentCapacityFree(), 0);

logic.pressDestination(3);
logic.pressDestination(5);

logic.callUp(0); // leftover callers
logic.callUp(0);

// Simulate door close cycle
for (let i = 0; i < 80; i++) {
    logic.tick(0.2);
}
assert.ok(logic.state === 'IDLE' || logic.state === 'MOVING', 'Should transition out of door open state');
assert.ok(logic.targetFloor > 0 || logic.direction > 0, 'Should prioritize passenger destinations over lobby calls');
console.log('  ✓ passed');

// Test 2: Passenger destinations outrank same-floor hall calls
console.log('Test 2: Passenger destinations outrank hall calls');
logic.reset();
logic.callUp(2);
const opened2 = runUntilDoorOpenAt(logic, 2);
assert.ok(opened2, 'Should reach DOOR_OPEN at floor 2');
logic.reserveBoardingSpot('p1');
logic.completeBoard('p1');
logic.pressDestination(4);

logic.callUp(4); // same floor hall call after boarding
runUntilDoorClosed(logic);
assert.ok(logic.targetFloor === 4, 'Should go to passenger destination 4');
console.log('  ✓ passed');

// Test 3: Repeated hall calls cannot starve riders
console.log('Test 3: Anti-starvation');
logic.reset();
logic.callUp(0);
runUntilDoorOpenAt(logic, 0);
for (let i = 0; i < 3; i++) {
    logic.reserveBoardingSpot(`r${i}`);
    logic.completeBoard(`r${i}`);
}
logic.pressDestination(5);

for (let i = 0; i < 25; i++) {
    logic.callUp(0);
    logic.tick(0.3);
}
assert.ok(tickUntil(logic, (l) => l.currentFloor === 5, 400), 'Should reach passenger destination despite repeated lobby calls');
console.log('  ✓ passed');

// Test 4: Opposite direction calls wait
console.log('Test 4: Direction priority');
logic.reset();
logic.callUp(0);
runUntilDoorOpenAt(logic, 0);
logic.reserveBoardingSpot('pA');
logic.completeBoard('pA');
logic.pressDestination(3);
logic.callDown(1);

runUntilDoorClosed(logic);
assert.ok(logic.targetFloor === 3, 'Should serve upward passenger before reversing');
console.log('  ✓ passed');

// Test 5: Door hold and safety cap
console.log('Test 5: Door timing');
logic.reset();
logic.callUp(0);
runUntilDoorOpenAt(logic, 0);
const p = 'holdtest';
logic.reserveBoardingSpot(p);
assert.ok(logic.pendingBoarders.has(p));

// Fast forward past min but not max
logic.doorTimer = 10;
logic.tick(0.1);
assert.strictEqual(logic.state, 'DOOR_OPEN', 'Should hold doors for pending boarder');

logic.completeBoard(p);
logic.doorTimer = 20;
logic.tick(0.1);
assert.strictEqual(logic.state, 'DOOR_CLOSING', 'Should close after max time if needed');
console.log('  ✓ passed');

// Test 6: Destination preserved across handshake
console.log('Test 6: toFloor preservation');
logic.reset();
logic.callUp(0);
runUntilDoorOpenAt(logic, 0);
const boardingSpot = logic.reserveBoardingSpot('rider5');
assert.ok(boardingSpot);
logic.completeBoard('rider5');
logic.pressDestination(5);
assert.ok(logic.destinations.has(5), 'Destination 5 must survive boarding');
console.log('  ✓ passed');

// Test 7: Reset clears everything
console.log('Test 7: Reset behavior');
logic.callUp(2);
logic.callDown(1);
logic.pressDestination(4);
logic.reserveBoardingSpot('x');
logic.completeBoard('x');
logic.registerDisembark('x');
logic.reset();

assert.strictEqual(logic.upCalls.size, 0);
assert.strictEqual(logic.downCalls.size, 0);
assert.strictEqual(logic.destinations.size, 0);
assert.strictEqual(logic.passengers.size, 0);
assert.strictEqual(logic.pendingBoarders.size, 0);
assert.strictEqual(logic.pendingDisembark.size, 0);
assert.strictEqual(logic.currentFloor, 0);
assert.strictEqual(logic.state, 'IDLE');
console.log('  ✓ passed');

console.log('\n✅ ALL TESTS PASSED');
process.exit(0);
