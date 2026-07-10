"use strict";

const assert = require("assert");
const { ElevatorLogic } = require("./elevator_logic.js");

function tickUntil(logic, stateOrPredicate, message, maxIterations = 12000) {
    const predicate = typeof stateOrPredicate === "function" ? stateOrPredicate : () => logic.state === stateOrPredicate;
    for (let iteration = 0; iteration < maxIterations; iteration += 1) {
        if (predicate()) return;
        logic.tick(0.05);
    }
    assert.fail(`${message}; state=${logic.state}, floor=${logic.currentFloor}, target=${logic.targetFloor}`);
}

function runUntilDoorOpenAt(logic, floor) {
    tickUntil(logic, () => logic.state === "DOOR_OPEN" && logic.currentFloor === floor, `doors did not open at floor ${floor}`);
}

function runUntilDoorClosed(logic) {
    tickUntil(logic, () => logic.state === "MOVING" || logic.state === "IDLE", "doors did not close");
}

function board(logic, people, destinations) {
    people.forEach((person, index) => {
        assert(logic.reserveBoardingSpot(person), `spot should be reserved for rider ${index}`);
        assert(logic.completeBoard(person), `rider ${index} should board`);
        logic.pressDestination(destinations[index]);
    });
}

const tests = [
    ["lobby rush respects capacity and departs", () => {
        const logic = new ElevatorLogic();
        logic.callUp(0);
        runUntilDoorOpenAt(logic, 0);
        const riders = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
        board(logic, riders, [2, 3, 4, 5]);
        assert.strictEqual(logic.currentCapacityFree(), 0);
        logic.callUp(0);
        runUntilDoorClosed(logic);
        assert.strictEqual(logic.state, "MOVING");
        assert(logic.targetFloor > 0, "a full lobby car must target an upper floor");
        assert(logic.upCalls.has(0), "leftover lobby call remains queued");
    }],
    ["passenger destination outranks same-floor call", () => {
        const logic = new ElevatorLogic();
        logic.callUp(0);
        runUntilDoorOpenAt(logic, 0);
        const rider = { id: 8 };
        board(logic, [rider], [5]);
        logic.callUp(0);
        runUntilDoorClosed(logic);
        assert.strictEqual(logic.state, "MOVING");
        assert.strictEqual(logic.targetFloor, 5);
    }],
    ["repeated lobby calls cannot starve riders", () => {
        const logic = new ElevatorLogic();
        logic.callUp(0);
        runUntilDoorOpenAt(logic, 0);
        const rider = { id: 9 };
        board(logic, [rider], [4]);
        let reached = false;
        for (let iteration = 0; iteration < 8000; iteration += 1) {
            logic.callUp(0);
            logic.tick(0.05);
            if (logic.state === "DOOR_OPEN" && logic.currentFloor === 4) {
                reached = true;
                break;
            }
        }
        assert(reached, "rider should reach floor 4 despite repeated calls");
    }],
    ["opposite-direction calls wait their turn", () => {
        const logic = new ElevatorLogic();
        logic.callUp(0);
        runUntilDoorOpenAt(logic, 0);
        const rider = { id: 10 };
        board(logic, [rider], [5]);
        runUntilDoorClosed(logic);
        logic.callDown(1);
        logic.callDown(3);
        let reversedEarly = false;
        for (let iteration = 0; iteration < 8000; iteration += 1) {
            logic.tick(0.05);
            if (logic.currentFloor < 5 && logic.direction < 0) reversedEarly = true;
            if (logic.state === "DOOR_OPEN" && logic.currentFloor === 5) break;
        }
        assert.strictEqual(reversedEarly, false);
        assert.strictEqual(logic.currentFloor, 5);
    }],
    ["door handshakes hold, safety cap closes", () => {
        const logic = new ElevatorLogic();
        logic.callUp(0);
        runUntilDoorOpenAt(logic, 0);
        const stalled = { id: 11 };
        assert(logic.reserveBoardingSpot(stalled));
        for (let elapsed = 0; elapsed < logic.MIN_DOOR_OPEN_S + 0.5; elapsed += 0.05) logic.tick(0.05);
        assert.strictEqual(logic.state, "DOOR_OPEN", "pending boarding holds doors after minimum");
        tickUntil(logic, "DOOR_CLOSING", "safety cap did not close held doors");
        assert(logic.doorTimer >= logic.MAX_DOOR_OPEN_S);
    }],
    ["destination survives the action handshake", () => {
        const logic = new ElevatorLogic();
        const action = { phase: "WAIT_AT_PANEL", floor: 0, dir: 1, toFloor: 5 };
        logic.callUp(action.floor);
        runUntilDoorOpenAt(logic, action.floor);
        action.phase = "ENTER_ELEVATOR";
        const rider = { id: 12 };
        assert(logic.reserveBoardingSpot(rider));
        assert(logic.completeBoard(rider));
        action.phase = "PRESS_FLOOR";
        logic.pressDestination(action.toFloor);
        action.phase = "WAIT_FOR_FLOOR";
        assert(logic.destinations.has(5));
        assert(!logic.destinations.has(1));
        runUntilDoorOpenAt(logic, 5);
        assert.strictEqual(logic.currentFloor, action.toFloor);
    }],
    ["reset clears phantom state", () => {
        const logic = new ElevatorLogic();
        const rider = { id: 13 };
        logic.callUp(0);
        logic.callDown(5);
        logic.pressDestination(4);
        logic.pendingBoarders.set(rider, logic.interiorSpots[0]);
        logic.passengers.add({ id: 14 });
        logic.pendingDisembark.add({ id: 15 });
        logic.spotOccupancy[0] = rider;
        logic.direction = 1;
        logic.targetFloor = 5;
        logic.stateTimer = 3;
        logic.doorTimer = 4;
        logic.reset();
        [logic.upCalls, logic.downCalls, logic.destinations, logic.passengers, logic.pendingBoarders, logic.pendingDisembark].forEach((collection) => assert.strictEqual(collection.size, 0));
        assert.deepStrictEqual(logic.spotOccupancy, [null, null, null, null]);
        assert.strictEqual(logic.direction, 0);
        assert.strictEqual(logic.targetFloor, null);
        assert.strictEqual(logic.currentFloor, 0);
        assert.strictEqual(logic.positionY, 0);
        assert.strictEqual(logic.state, "IDLE");
        assert.strictEqual(logic.stateTimer, 0);
        assert.strictEqual(logic.doorTimer, 0);
    }]
];

let failures = 0;
tests.forEach(([name, run]) => {
    try {
        run();
        console.log(`PASS ${name}`);
    } catch (error) {
        failures += 1;
        console.error(`FAIL ${name}: ${error.message}`);
    }
});

console.log(`${tests.length - failures}/${tests.length} elevator tests passed`);
if (failures) process.exitCode = 1;
