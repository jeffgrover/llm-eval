"use strict";

const assert = require("assert");
const { ElevatorLogic } = require("./elevator_logic.js");

function makeLogic() {
    return new ElevatorLogic({
        floorCount: 6,
        maxCapacity: 4,
        travelSpeed: 0.75,
        doorOpeningS: 0.2,
        doorClosingS: 0.2,
        minDoorOpenS: 0.35,
        maxDoorOpenS: 1.5
    });
}

function tickUntil(logic, predicate, label, cap) {
    const limit = cap || 1600;
    for (let index = 0; index < limit; index += 1) {
        if (typeof predicate === "string" ? logic.state === predicate : predicate(logic)) return;
        logic.tick(0.05);
    }
    throw new Error(`timed out waiting for ${label || predicate}`);
}

function runUntilDoorOpenAt(logic, floor) {
    tickUntil(logic, (elevator) => elevator.state === "DOOR_OPEN" && elevator.currentFloor === floor, `doors open at ${floor}`);
}

function runUntilDoorClosed(logic) {
    tickUntil(logic, (elevator) => elevator.state === "IDLE" || elevator.state === "MOVING", "doors closed");
}

function board(logic, person, destination) {
    const spot = logic.reserveBoardingSpot(person);
    assert(spot, "a capacity spot should be reserved");
    assert(logic.completeBoard(person), "reservation should become a passenger");
    logic.pressDestination(destination);
}

function openLobby(logic) {
    logic.callUp(0);
    runUntilDoorOpenAt(logic, 0);
}

const tests = [
    ["lobby rush leaves for passenger floors", () => {
        const logic = makeLogic();
        const people = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
        openLobby(logic);
        people.forEach((person, index) => board(logic, person, index + 2));
        logic.callUp(0);
        runUntilDoorClosed(logic);
        tickUntil(logic, (elevator) => elevator.state === "MOVING", "trip after lobby rush");
        assert(logic.targetFloor > 0, "a full lobby car must go above the lobby, not reopen at 0");
        assert.strictEqual(logic.currentFloor, 0);
    }],
    ["passenger destination outranks same-floor hall call", () => {
        const logic = makeLogic();
        const rider = { id: "rider" };
        openLobby(logic);
        board(logic, rider, 5);
        logic.callUp(0);
        runUntilDoorClosed(logic);
        tickUntil(logic, (elevator) => elevator.state === "MOVING", "passenger trip");
        assert.strictEqual(logic.targetFloor, 5);
        assert.notStrictEqual(logic.state, "DOOR_OPENING");
    }],
    ["repeated lobby calls cannot starve riders", () => {
        const logic = makeLogic();
        const rider = { id: "rider" };
        openLobby(logic);
        board(logic, rider, 3);
        for (let index = 0; index < 700; index += 1) {
            logic.callUp(0);
            logic.tick(0.05);
            if (logic.currentFloor === 3 && logic.state === "DOOR_OPEN") break;
        }
        assert.strictEqual(logic.currentFloor, 3, "car should still reach the rider destination");
    }],
    ["opposite-direction calls wait while traveling up", () => {
        const logic = makeLogic();
        const rider = { id: "rider" };
        openLobby(logic);
        board(logic, rider, 5);
        logic.callDown(2);
        runUntilDoorClosed(logic);
        tickUntil(logic, (elevator) => elevator.state === "MOVING", "upward trip");
        assert.strictEqual(logic.direction, 1);
        assert.strictEqual(logic.targetFloor, 5, "down call below should not reverse an upward rider trip");
        runUntilDoorOpenAt(logic, 5);
        assert.strictEqual(logic.direction, 1);
        assert(logic.downCalls.has(2), "opposite-direction call remains queued");
    }],
    ["door hold and safety cap", () => {
        const logic = makeLogic();
        const boarder = { id: "pending" };
        openLobby(logic);
        assert(logic.reserveBoardingSpot(boarder), "reservation should hold the doors");
        logic.tick(logic.MIN_DOOR_OPEN_S + 0.3);
        assert.strictEqual(logic.state, "DOOR_OPEN", "pending boarding holds doors after minimum dwell");
        logic.tick(logic.MAX_DOOR_OPEN_S + 0.1);
        assert.strictEqual(logic.state, "DOOR_CLOSING", "safety cap should begin closing even if a boarder is stuck");
    }],
    ["destination survives action handshake", () => {
        const logic = makeLogic();
        const rider = { name: "floor-five rider" };
        openLobby(logic);
        const spot = logic.reserveBoardingSpot(rider);
        assert(spot, "WAIT_AT_PANEL -> ENTER_ELEVATOR reserves a place");
        assert(logic.completeBoard(rider), "ENTER_ELEVATOR completes boarding");
        logic.pressDestination(5);
        assert(logic.destinations.has(5), "PRESS_FLOOR retains the actual plan destination");
        runUntilDoorOpenAt(logic, 5);
        assert.strictEqual(logic.currentFloor, 5, "rider reaches floor 5 rather than a reconstructed floor 1");
    }],
    ["reset clears phantom state", () => {
        const logic = makeLogic();
        const person = { id: "ghost" };
        openLobby(logic);
        board(logic, person, 4);
        logic.callUp(1);
        logic.callDown(3);
        assert(logic.registerDisembark(person));
        logic.reset();
        assert.strictEqual(logic.state, "IDLE");
        assert.strictEqual(logic.currentFloor, 0);
        assert.strictEqual(logic.direction, 0);
        assert.strictEqual(logic.targetFloor, null);
        assert.strictEqual(logic.upCalls.size, 0);
        assert.strictEqual(logic.downCalls.size, 0);
        assert.strictEqual(logic.destinations.size, 0);
        assert.strictEqual(logic.passengers.size, 0);
        assert.strictEqual(logic.pendingBoarders.size, 0);
        assert.strictEqual(logic.pendingDisembark.size, 0);
        assert.strictEqual(logic.spotOccupancy.size, 0);
        assert.strictEqual(logic.doorTimer, 0);
    }]
];

let failures = 0;
tests.forEach(([name, test]) => {
    try {
        test();
        console.log(`PASS ${name}`);
    } catch (error) {
        failures += 1;
        console.error(`FAIL ${name}: ${error.message}`);
    }
});
console.log(`${tests.length - failures}/${tests.length} elevator logic tests passed`);
if (failures) process.exit(1);
