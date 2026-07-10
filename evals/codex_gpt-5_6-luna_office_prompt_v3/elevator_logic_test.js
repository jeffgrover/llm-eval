const assert = require("assert");
const { ElevatorLogic } = require("./elevator_logic.js");

function tickUntil(logic, predicate, limit) {
    const cap = limit || 2000;
    for (let index = 0; index < cap; index += 1) {
        if (predicate(logic)) return;
        logic.tick(0.1);
    }
    assert.fail("tickUntil exceeded iteration cap");
}

function runUntilDoorOpenAt(logic, floor) {
    tickUntil(logic, (candidate) => candidate.state === "DOOR_OPEN" && candidate.currentFloor === floor);
}

function runUntilDoorClosed(logic) {
    tickUntil(logic, (candidate) => candidate.state === "IDLE" || candidate.state === "MOVING" || candidate.state === "DOOR_OPENING");
}

function openLobby(logic) {
    logic.callUp(0);
    runUntilDoorOpenAt(logic, 0);
}

function board(logic, person) {
    const spot = logic.reserveBoardingSpot(person);
    assert(spot, "person should receive an interior spot");
    assert(logic.completeBoard(person), "person should complete boarding");
}

function testLobbyRushCapacity() {
    const logic = new ElevatorLogic({ floorCount: 6, maxCapacity: 4, floorHeight: 3.4 });
    openLobby(logic);
    const people = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
    people.forEach((person) => board(logic, person));
    logic.pressDestination(2);
    logic.pressDestination(4);
    for (let index = 0; index < 8; index += 1) {
        logic.callUp(0);
        logic.tick(0.2);
    }
    runUntilDoorClosed(logic);
    assert.strictEqual(logic.state, "MOVING");
    assert(logic.targetFloor > 0, "full lobby car must leave for a passenger destination");
}

function testPassengerDestinationPriority() {
    const logic = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    openLobby(logic);
    const passenger = { id: "rider" };
    board(logic, passenger);
    logic.pressDestination(5);
    logic.callUp(0);
    logic.tick(1.0);
    logic.tick(0.3);
    assert.notStrictEqual(logic.state, "DOOR_OPEN");
    assert.strictEqual(logic.targetFloor, 5);
}

function testRepeatedCallsDoNotStarveRiders() {
    const logic = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    openLobby(logic);
    const passenger = { id: "destined" };
    board(logic, passenger);
    logic.pressDestination(5);
    for (let index = 0; index < 20; index += 1) {
        logic.callUp(0);
        logic.tick(0.2);
    }
    tickUntil(logic, (candidate) => candidate.state === "DOOR_OPEN" && candidate.currentFloor === 5, 4000);
    assert.strictEqual(logic.currentFloor, 5);
}

function testOppositeDirectionWaits() {
    const logic = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    openLobby(logic);
    const passenger = { id: "up-rider" };
    board(logic, passenger);
    logic.pressDestination(4);
    logic.tick(1.0);
    logic.tick(0.3);
    assert.strictEqual(logic.state, "MOVING");
    logic.callDown(0);
    logic.callDown(1);
    tickUntil(logic, (candidate) => candidate.state === "DOOR_OPEN" && candidate.currentFloor === 4, 2000);
    assert.strictEqual(logic.currentFloor, 4);
}

function testDoorHoldAndSafetyCap() {
    const logic = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    openLobby(logic);
    const unfinished = { id: "unfinished" };
    assert(logic.reserveBoardingSpot(unfinished));
    logic.tick(logic.MIN_DOOR_OPEN_S + 0.4);
    assert.strictEqual(logic.state, "DOOR_OPEN");
    logic.tick(logic.MAX_DOOR_OPEN_S);
    assert.strictEqual(logic.state, "DOOR_CLOSING");
    runUntilDoorClosed(logic);
    assert.strictEqual(logic.pendingBoarders.size, 0);
}

function testDestinationHandshake() {
    const logic = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    openLobby(logic);
    const rider = { id: "handshake" };
    board(logic, rider);
    logic.pressDestination(5);
    assert(logic.destinations.has(5), "PRESS_FLOOR must preserve the exact target");
    logic.tick(1.0);
    logic.tick(0.3);
    assert.strictEqual(logic.targetFloor, 5);
    tickUntil(logic, (candidate) => candidate.state === "DOOR_OPEN" && candidate.currentFloor === 5, 2000);
}

function testResetClearsPhantomState() {
    const logic = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    openLobby(logic);
    const rider = { id: "phantom" };
    board(logic, rider);
    logic.registerDisembark(rider);
    logic.callDown(4);
    logic.pressDestination(3);
    logic.reset();
    assert.strictEqual(logic.state, "IDLE");
    assert.strictEqual(logic.currentFloor, 0);
    assert.strictEqual(logic.targetFloor, null);
    assert.strictEqual(logic.direction, 0);
    assert.strictEqual(logic.upCalls.size, 0);
    assert.strictEqual(logic.downCalls.size, 0);
    assert.strictEqual(logic.destinations.size, 0);
    assert.strictEqual(logic.passengers.size, 0);
    assert.strictEqual(logic.pendingBoarders.size, 0);
    assert.strictEqual(logic.pendingDisembark.size, 0);
    assert.strictEqual(logic.spotOccupancy.filter(Boolean).length, 0);
    assert.strictEqual(logic.doorTimer, 0);
}

const tests = [
    ["lobby rush with capacity", testLobbyRushCapacity],
    ["passenger destinations outrank same-floor calls", testPassengerDestinationPriority],
    ["repeated hall calls do not starve riders", testRepeatedCallsDoNotStarveRiders],
    ["opposite direction waits its turn", testOppositeDirectionWaits],
    ["door hold and safety cap", testDoorHoldAndSafetyCap],
    ["destination handshake preserves floor", testDestinationHandshake],
    ["reset clears phantom state", testResetClearsPhantomState],
];

let passed = 0;
for (const [name, test] of tests) {
    try {
        test();
        passed += 1;
        console.log(`PASS ${name}`);
    } catch (error) {
        console.error(`FAIL ${name}: ${error && error.message ? error.message : error}`);
    }
}
console.log(`${passed}/${tests.length} elevator logic tests passed`);
if (passed !== tests.length) process.exit(1);
