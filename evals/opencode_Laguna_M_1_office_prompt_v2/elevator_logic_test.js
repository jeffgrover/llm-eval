const assert = require("assert");
const { ElevatorLogic } = require("./elevator_logic.js");

function tickUntil(logic, predicate, maxTicks = 10000) {
    let ticks = 0;
    while (ticks < maxTicks) {
        logic.tick(0.016);
        ticks++;
        if (predicate(logic)) return ticks;
    }
    throw new Error(`Timeout waiting for predicate, state=${logic.state}, floor=${logic.currentFloor}`);
}

function runUntilDoorOpenAt(logic, floor, maxTicks = 10000) {
    return tickUntil(logic, l => l.state === 'DOOR_OPEN' && l.currentFloor === floor, maxTicks);
}

function runUntilDoorClosed(logic, maxTicks = 10000) {
    return tickUntil(logic, l => l.state === 'IDLE' || l.state === 'DOOR_CLOSING', maxTicks);
}

function ticksForDistance(logic, fromFloor, toFloor) {
    const dist = Math.abs(toFloor - fromFloor);
    const seconds = dist * logic.floorHeight / logic.MOVING_SPEED;
    return Math.ceil(seconds / 0.016) + 10;
}

let currentTest = 0;
let passed = 0;
let failed = 0;

function describe(name, fn) {
    currentTest++;
    try {
        fn();
        console.log(`✓ Test ${currentTest}: ${name}`);
        passed++;
    } catch (e) {
        console.log(`✗ Test ${currentTest}: ${name}`);
        console.log(`  Error: ${e.message}`);
        failed++;
    }
}

describe("Lobby rush with more callers than capacity", () => {
    const logic = new ElevatorLogic();
    
    logic.callUp(0);
    runUntilDoorOpenAt(logic, 0);
    
    const spots = [];
    for (let i = 0; i < 4; i++) {
        const spot = logic.reserveBoardingSpot(`p${i}`);
        assert.ok(spot, `Should reserve spot ${i}`);
        spots.push(spot);
    }
    assert.strictEqual(logic.currentCapacityFree(), 0, "Car should be full");
    
    for (let i = 0; i < 4; i++) {
        logic.completeBoard(`p${i}`);
    }
    
    for (let i = 0; i < 4; i++) {
        logic.pressDestination(i + 1);
    }
    
    for (let i = 0; i < 10; i++) {
        logic.callUp(0);
    }
    
    logic.tick(logic.MIN_DOOR_OPEN_S + 0.1);
    assert.notStrictEqual(logic.state, 'DOOR_OPEN', "Should not stay open with full car");
    
    tickUntil(logic, l => l.state === 'MOVING' || l.state === 'IDLE', 500);
    
    assert.ok(logic.targetFloor > 0, "Target should be above floor 0");
});

describe("Passenger destinations outrank same-floor hall calls", () => {
    const logic = new ElevatorLogic();
    
    logic.callUp(0);
    runUntilDoorOpenAt(logic, 0);
    
    const spot = logic.reserveBoardingSpot('p1');
    logic.completeBoard('p1');
    logic.pressDestination(3);
    
    logic.tick(0.016);
    
    logic.callUp(0);
    logic.callDown(0);
    
    tickUntil(logic, l => l.currentFloor > 0, 5000);
    assert.ok(logic.currentFloor > 0, "Should be above floor 0");
});

describe("Repeated hall-call pressing cannot starve riders", () => {
    const logic = new ElevatorLogic();
    
    logic.callUp(0);
    runUntilDoorOpenAt(logic, 0);
    
    const spot = logic.reserveBoardingSpot('p1');
    logic.completeBoard('p1');
    logic.pressDestination(3);
    
    for (let i = 0; i < 50; i++) {
        logic.callUp(0);
        logic.tick(0.016);
    }
    
    runUntilDoorClosed(logic);
    
    tickUntil(logic, l => l.currentFloor >= 1, 5000);
    assert.ok(logic.currentFloor >= 1, "Car should reach passenger destination");
});

describe("Opposite-direction calls wait their turn", () => {
    const logic = new ElevatorLogic();
    
    logic.callUp(0);
    runUntilDoorOpenAt(logic, 0);
    
    const spot = logic.reserveBoardingSpot('p1');
    logic.completeBoard('p1');
    logic.pressDestination(3);
    
    logic.callDown(2);
    
    tickUntil(logic, l => l.currentFloor >= 3, 5000);
    assert.strictEqual(logic.currentFloor, 3, "Should reach destination 3 before serving down call at 2");
});

describe("Door hold and safety cap", () => {
    const logic = new ElevatorLogic();
    
    logic.callUp(0);
    runUntilDoorOpenAt(logic, 0);
    
    const pendingPerson = 'pending';
    logic.pendingBoarders.set(pendingPerson, { index: 0 });
    
    logic.tick(logic.MIN_DOOR_OPEN_S + 0.1);
    assert.strictEqual(logic.state, 'DOOR_OPEN', "Doors should stay open with pending boarders");
    
    logic.pendingBoarders.delete(pendingPerson);
    
    logic.tick((logic.MAX_DOOR_OPEN_S - logic.MIN_DOOR_OPEN_S) + 0.5);
    assert.strictEqual(logic.state, 'DOOR_CLOSING', "Doors should start closing after max time");
});

describe("Destination preserved across action handshake", () => {
    const logic = new ElevatorLogic();
    
    logic.callUp(0);
    runUntilDoorOpenAt(logic, 0);
    
    const spot = logic.reserveBoardingSpot('rider');
    logic.completeBoard('rider');
    
    logic.pressDestination(5);
    
    assert.ok(logic.destinations.has(5), "Destination 5 should be in set after pressDestination");
    
    // Wait for doors to close and car to start moving
    tickUntil(logic, l => l.state === 'MOVING' && l.targetFloor > 0, 300);
    assert.ok(logic.targetFloor > 0, "Car should have a target floor above 0");
    
    runUntilDoorOpenAt(logic, 5);
});

describe("Reset clears phantom state", () => {
    const logic = new ElevatorLogic();
    
    logic.callUp(2);
    logic.callDown(4);
    logic.pressDestination(3);
    
    const spot = logic.reserveBoardingSpot('p1');
    logic.completeBoard('p1');
    logic.registerDisembark('p1');
    
    logic.tick(0.1);
    
    logic.reset();
    
    assert.strictEqual(logic.upCalls.size, 0, "upCalls should be empty");
    assert.strictEqual(logic.downCalls.size, 0, "downCalls should be empty");
    assert.strictEqual(logic.destinations.size, 0, "destinations should be empty");
    assert.strictEqual(logic.passengers.size, 0, "passengers should be empty");
    assert.strictEqual(logic.pendingBoarders.size, 0, "pendingBoarders should be empty");
    assert.strictEqual(logic.pendingDisembark.size, 0, "pendingDisembark should be empty");
    assert.deepStrictEqual(logic.spotOccupancy, [false, false, false, false], "spotOccupancy should be all false");
    assert.strictEqual(logic.direction, 0, "direction should be 0");
    assert.strictEqual(logic.currentFloor, 0, "currentFloor should be 0");
    assert.strictEqual(logic.targetFloor, 0, "targetFloor should be 0");
    assert.strictEqual(logic.state, 'IDLE', "state should be IDLE");
});

console.log("\n" + "=".repeat(40));
console.log(`PASS/FAIL Summary: ${passed} passed, ${failed} failed`);
console.log("=".repeat(40));

if (failed > 0) {
    process.exit(1);
}