// elevator_logic_test.js
// Deterministic Node tests for the elevator logic

const assert = require("assert");
const { ElevatorLogic } = require("./elevator_logic.js");

function tickUntil(logic, predicate, maxTicks = 1000) {
    for (let i = 0; i < maxTicks; i++) {
        logic.tick(1);
        if (predicate(logic)) return i;
    }
    throw new Error("Timed out");
}

function runUntilDoorOpenAt(logic, floor) {
    tickUntil(logic, () => logic.state === "DOOR_OPEN" && logic.currentFloor === floor);
}

function runUntilDoorClosed(logic) {
    for (let i = 0; i < 100; i++) {
        logic.tick(1);
        if (logic.state !== "DOOR_OPEN") return;
    }
    throw new Error("Door never closed");
}

function testLobbyRush() {
    const logic = new ElevatorLogic({ floorCount: 6, maxCapacity: 4, floorHeight: 3.4 });
    logic.currentFloor = 0;
    logic.state = "DOOR_OPEN";
    logic.reset();
    assert.strictEqual(logic.state, "IDLE");
    assert.strictEqual(logic.currentFloor, 0);
    console.log("testLobbyRush passed");
}

function testPassengerDestinationsOutrankHallCalls() {
    const logic = new ElevatorLogic({ floorCount: 6, maxCapacity: 4, floorHeight: 3.4 });
    logic.currentFloor = 1;
    logic.state = "DOOR_OPEN";
    logic.pressDestination(5);
    logic.callDown(1);
    assert.strictEqual(logic.destinations.length, 1);
    assert.strictEqual(logic.destinations[0], 5);
    console.log("testPassengerDestinationsOutrankHallCalls passed");
}

function testRepeatedHallCallPressing() {
    const logic = new ElevatorLogic({ floorCount: 6, maxCapacity: 4, floorHeight: 3.4 });
    logic.currentFloor = 0;
    logic.state = "DOOR_OPEN";
    logic.pressDestination(3);
    for (let i = 0; i < 10; i++) {
        logic.callUp(0);
        logic.tick(1);
    }
    assert.strictEqual(logic.targetFloor, 3);
    console.log("testRepeatedHallCallPressing passed");
}

function testOppositeDirectionCallsWait() {
    const logic = new ElevatorLogic({ floorCount: 6, maxCapacity: 4, floorHeight: 3.4 });
    logic.currentFloor = 2;
    logic.state = "MOVING";
    logic.direction = 1;
    logic.targetFloor = 5;
    logic.callDown(1);
    for (let i = 0; i < 10; i++) {
        logic.tick(1);
        if (logic.targetFloor !== 5) {
            break;
        }
    }
    console.log("testOppositeDirectionCallsWait passed");
}

function testDoorHoldAndSafetyCap() {
    const logic = new ElevatorLogic({ floorCount: 6, maxCapacity: 4, floorHeight: 3.4 });
    logic.currentFloor = 0;
    logic.state = "DOOR_OPEN";
    logic.doorOpenTimer = 0;
    logic.MIN_DOOR_OPEN_S = 2;
    logic.MAX_DOOR_OPEN_S = 5;
    for (let i = 0; i < 10; i++) {
        logic.tick(1);
    }
    assert.strictEqual(logic.state, "IDLE", "Expected state IDLE but got " + logic.state);
    console.log("testDoorHoldAndSafetyCap passed");
}

function testDestinationPreserved() {
    const logic = new ElevatorLogic({ floorCount: 6, maxCapacity: 4, floorHeight: 3.4 });
    logic.currentFloor = 0;
    logic.state = "IDLE";
    logic.callUp(0);
    logic.pressDestination(5);
    assert.strictEqual(logic.targetFloor, 5);
    console.log("testDestinationPreserved passed");
}

function testResetClearsPhantomState() {
    const logic = new ElevatorLogic({ floorCount: 6, maxCapacity: 4, floorHeight: 3.4 });
    logic.callUp(3);
    logic.pressDestination(4);
    logic.reset();
    assert.strictEqual(logic.upCalls.length, 0);
    assert.strictEqual(logic.destinations.length, 0);
    assert.strictEqual(logic.passengers.size, 0);
    assert.strictEqual(logic.pendingBoarders.size, 0);
    assert.strictEqual(logic.pendingDisembark.size, 0);
    assert.strictEqual(logic.targetFloor, 0);
    assert.strictEqual(logic.state, "IDLE");
    console.log("testResetClearsPhantomState passed");
}

function main() {
    try {
        testLobbyRush();
        testPassengerDestinationsOutrankHallCalls();
        testRepeatedHallCallPressing();
        testOppositeDirectionCallsWait();
        testDoorHoldAndSafetyCap();
        testDestinationPreserved();
        testResetClearsPhantomState();
        console.log("All tests passed!");
        process.exit(0);
    } catch (err) {
        console.error("Test failed:", err.message);
        process.exit(1);
    }
}

main();