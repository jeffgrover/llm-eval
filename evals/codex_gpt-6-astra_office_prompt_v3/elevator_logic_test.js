'use strict';
const assert = require('assert');
const { ElevatorLogic } = require('./elevator_logic.js');
let passed = 0;
let failed = 0;
function tickUntil(logic, predicate, beforeTick = () => {}, limit = 6000) {
    const check = typeof predicate === 'string' ? () => logic.state === predicate : predicate;
    for (let i = 0; i < limit; i++) {
        if (check()) return;
        beforeTick(); logic.tick(0.05);
    }
    assert.fail('Iteration cap: ' + logic.state + ' floor=' + logic.currentFloor + ' target=' + logic.targetFloor);
}
function runUntilDoorOpenAt(logic, floor, beforeTick) { tickUntil(logic, () => logic.state === 'DOOR_OPEN' && logic.currentFloor === floor, beforeTick); }
function runUntilDoorClosed(logic, beforeTick) { tickUntil(logic, () => logic.state === 'MOVING' || logic.state === 'IDLE', beforeTick); }
function board(logic, count, target) {
    const riders = [];
    for (let i = 0; i < count; i++) {
        const person = { id: i, toFloor: target };
        assert(logic.reserveBoardingSpot(person)); assert(logic.completeBoard(person));
        logic.pressDestination(person.toFloor); riders.push(person);
    }
    return riders;
}
function test(name, run) {
    try { run(); passed++; console.log('PASS ' + name); }
    catch (error) { failed++; console.error('FAIL ' + name + ': ' + error.message); }
}
test('Lobby rush: four places, leftover calls retained, loaded car leaves', () => {
    const logic = new ElevatorLogic(); logic.callUp(0); runUntilDoorOpenAt(logic, 0);
    board(logic, 4, 5); assert.strictEqual(logic.reserveBoardingSpot({ id: 99 }), null);
    assert.strictEqual(logic.currentCapacityFree(), 0);
    logic.callUp(0); runUntilDoorClosed(logic, () => logic.callUp(0));
    assert.strictEqual(logic.state, 'MOVING'); assert(logic.targetFloor > 0); assert(logic.upCalls.has(0));
});
test('Passenger destinations outrank same-floor hall calls', () => {
    const logic = new ElevatorLogic(); logic.callUp(0); runUntilDoorOpenAt(logic, 0);
    board(logic, 1, 3); logic.callUp(0); runUntilDoorClosed(logic);
    assert.strictEqual(logic.targetFloor, 3); assert.strictEqual(logic.state, 'MOVING');
});
test('Repeated hall-call pressing cannot starve riders', () => {
    const logic = new ElevatorLogic(); logic.callUp(0); runUntilDoorOpenAt(logic, 0);
    const riders = board(logic, 4, 4);
    runUntilDoorOpenAt(logic, 4, () => logic.callUp(0));
    riders.forEach((person) => { logic.registerDisembark(person); logic.completeDisembark(person); });
    runUntilDoorOpenAt(logic, 0, () => logic.callUp(0));
    assert(logic.currentCapacityFree() === 4);
});
test('Opposite-direction calls wait for the upward sweep', () => {
    const logic = new ElevatorLogic(); logic.callUp(0); runUntilDoorOpenAt(logic, 0);
    const riders = board(logic, 1, 5); runUntilDoorClosed(logic);
    logic.callDown(1); logic.callDown(3);
    runUntilDoorOpenAt(logic, 5, () => { assert(logic.direction >= 0); });
    assert(logic.downCalls.has(1)); assert(logic.downCalls.has(3));
    logic.registerDisembark(riders[0]); logic.completeDisembark(riders[0]);
    runUntilDoorOpenAt(logic, 3); assert.strictEqual(logic.direction, -1);
});
test('Door hold for boarding and disembarking, then safety cap', () => {
    ['boarding', 'disembarking'].forEach((mode) => {
        const logic = new ElevatorLogic(); logic.callUp(0); runUntilDoorOpenAt(logic, 0);
        const person = {}; logic.reserveBoardingSpot(person);
        if (mode === 'disembarking') { logic.completeBoard(person); logic.registerDisembark(person); }
        logic.tick(logic.MIN_DOOR_OPEN_S + 1); assert.strictEqual(logic.state, 'DOOR_OPEN');
        tickUntil(logic, 'DOOR_CLOSING');
        assert(logic.openTimer >= logic.MAX_DOOR_OPEN_S);
    });
});
test('WAIT_AT_PANEL → ENTER_ELEVATOR → PRESS_FLOOR preserves floor five', () => {
    const logic = new ElevatorLogic();
    const actions = [{ type: 'WAIT_AT_PANEL', floor: 0, dir: 1, toFloor: 5 }, { type: 'ENTER_ELEVATOR', toFloor: 5 }, { type: 'PRESS_FLOOR', floor: 5 }, { type: 'WAIT_FOR_FLOOR', floor: 5 }];
    const person = {};
    logic.callUp(actions[0].floor); runUntilDoorOpenAt(logic, 0);
    assert(logic.isAcceptingAt(actions[0].floor, actions[0].dir));
    person.toFloor = actions[1].toFloor; assert(logic.reserveBoardingSpot(person)); logic.completeBoard(person);
    logic.pressDestination(actions[2].floor); assert(logic.destinations.has(person.toFloor)); assert(!logic.destinations.has(1));
    runUntilDoorOpenAt(logic, actions[3].floor); assert.strictEqual(logic.currentFloor, 5);
});
test('Reset removes passengers, pending sets, spots and timers', () => {
    const logic = new ElevatorLogic(); logic.callUp(0); runUntilDoorOpenAt(logic, 0);
    const passenger = board(logic, 1, 5)[0]; logic.registerDisembark(passenger); logic.reserveBoardingSpot({});
    logic.callUp(2); logic.callDown(4); logic.tick(0.2); logic.reset();
    ['upCalls','downCalls','destinations','passengers','pendingBoarders','pendingDisembark'].forEach((key) => assert.strictEqual(logic[key].size, 0));
    assert(logic.spotOccupancy.every((spot) => spot === null)); assert.strictEqual(logic.personSpots.size, 0);
    assert.strictEqual(logic.direction, 0); assert.strictEqual(logic.targetFloor, null); assert.strictEqual(logic.positionY, 0);
    assert.strictEqual(logic.currentFloor, 0); assert.strictEqual(logic.state, 'IDLE');
    assert.strictEqual(logic.openTimer, 0); assert.strictEqual(logic.doorTimer, 0); assert.strictEqual(logic.doorAmount, 0);
});
test('New matching call shortens the target during motion', () => {
    const logic = new ElevatorLogic(); logic.pressDestination(5); tickUntil(logic, 'MOVING');
    logic.tick(0.3); logic.callUp(2); logic.tick(0.05); assert.strictEqual(logic.targetFloor, 2);
    runUntilDoorOpenAt(logic, 2); assert(logic.destinations.has(5));
});
test('Opposite-only call is collected at its turnaround floor', () => {
    const logic = new ElevatorLogic(); logic.callDown(4); runUntilDoorOpenAt(logic, 4);
    assert(logic.isAcceptingAt(4, -1)); assert(!logic.downCalls.has(4));
});
test('Reservations count toward capacity and release only on completed exit', () => {
    const logic = new ElevatorLogic(); logic.callUp(0); runUntilDoorOpenAt(logic, 0);
    const people = Array.from({ length: 4 }, () => ({}));
    people.forEach((person) => assert(logic.reserveBoardingSpot(person)));
    assert.strictEqual(new Set([...logic.personSpots.values()].map((spot) => spot.index)).size, 4);
    assert.strictEqual(logic.currentCapacityFree(), 0);
    logic.completeBoard(people[0]); logic.registerDisembark(people[0]); assert.strictEqual(logic.currentCapacityFree(), 0);
    logic.completeDisembark(people[0]); assert.strictEqual(logic.currentCapacityFree(), 1);
});
console.log('\n' + passed + ' PASS / ' + failed + ' FAIL');
if (failed) process.exitCode = 1;
