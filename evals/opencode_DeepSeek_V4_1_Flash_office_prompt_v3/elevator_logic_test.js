const assert = require("assert");
const { ElevatorLogic } = require("./elevator_logic.js");

let passed = 0;
let failed = 0;
const results = [];

function test(name, fn) {
    try {
        fn();
        passed += 1;
        results.push("PASS  " + name);
    } catch (err) {
        failed += 1;
        results.push("FAIL  " + name + "\n        " + (err && err.message ? err.message : String(err)));
    }
}

function makeElevator(options) {
    return new ElevatorLogic(Object.assign({ floorCount: 6, maxCapacity: 4 }, options || {}));
}

function tickUntil(elevator, predicate, cap, dt) {
    const limit = cap || 200000;
    const step = dt || 0.05;
    let i = 0;
    while (i < limit) {
        if (predicate()) return true;
        elevator.tick(step);
        i += 1;
    }
    return predicate();
}

function runUntilDoorOpenAt(elevator, floor) {
    return tickUntil(elevator, () => elevator.state === "DOOR_OPEN" && elevator.currentFloor === floor, 200000, 0.05);
}

function runUntilClosed(elevator) {
    let wasClosing = false;
    return tickUntil(elevator, () => {
        if (elevator.state === "DOOR_CLOSING") wasClosing = true;
        return wasClosing && (elevator.state === "MOVING" || elevator.state === "IDLE");
    }, 200000, 0.05);
}

function boardFour(elevator, destination) {
    const riders = [];
    for (let i = 0; i < 4; i += 1) {
        const person = { id: "rider" + i };
        const spot = elevator.reserveBoardingSpot(person);
        assert(spot, "expected a boarding spot for rider " + i);
        elevator.completeBoard(person);
        elevator.pressDestination(destination);
        riders.push(person);
    }
    return riders;
}

test("1. lobby rush with more callers than capacity", () => {
    const elevator = makeElevator({ maxCapacity: 4 });
    elevator.callUp(0);
    assert(runUntilDoorOpenAt(elevator, 0), "doors should open at floor 0");
    boardFour(elevator, 5);
    elevator.callUp(0);
    elevator.callUp(0);
    assert(runUntilClosed(elevator), "doors should close");
    tickUntil(elevator, () => elevator.state === "MOVING", 20000, 0.05);
    assert(elevator.targetFloor > 0, "next target must be above floor 0, got " + elevator.targetFloor);
    assert(elevator.targetFloor === 5, "target should be 5, got " + elevator.targetFloor);
});

test("2. passenger destinations outrank same-floor hall calls", () => {
    const elevator = makeElevator({ maxCapacity: 4 });
    elevator.callUp(0);
    runUntilDoorOpenAt(elevator, 0);
    const rider = { id: "solo" };
    elevator.reserveBoardingSpot(rider);
    elevator.completeBoard(rider);
    elevator.pressDestination(4);
    runUntilClosed(elevator);
    elevator.callUp(0);
    tickUntil(elevator, () => elevator.state === "MOVING", 20000, 0.05);
    assert(elevator.targetFloor === 4, "should keep heading to 4, got " + elevator.targetFloor);
    let reopened = false;
    tickUntil(elevator, () => {
        if (elevator.state === "DOOR_OPEN" && elevator.currentFloor === 0) reopened = true;
        return elevator.currentFloor === 4;
    }, 200000, 0.05);
    assert(!reopened, "must not reopen at floor 0 while a destination awaits");
    assert(elevator.currentFloor === 4, "should reach floor 4");
});

test("3. repeated hall-call pressing cannot starve riders", () => {
    const elevator = makeElevator({ maxCapacity: 4 });
    elevator.callUp(0);
    runUntilDoorOpenAt(elevator, 0);
    boardFour(elevator, 3);
    runUntilClosed(elevator);
    let reached = false;
    let i = 0;
    while (i < 200000 && !reached) {
        elevator.callUp(0);
        elevator.tick(0.05);
        if (elevator.currentFloor === 3 && elevator.state === "DOOR_OPEN") reached = true;
        i += 1;
    }
    assert(reached, "car should still serve the passenger destination at floor 3");
});

test("4. opposite-direction calls wait their turn", () => {
    const elevator = makeElevator({ maxCapacity: 4 });
    elevator.callUp(0);
    runUntilDoorOpenAt(elevator, 0);
    boardFour(elevator, 4);
    elevator.callDown(1);
    runUntilClosed(elevator);
    let reversedEarly = false;
    tickUntil(elevator, () => {
        if (elevator.direction < 0 && elevator.currentFloor < 4) reversedEarly = true;
        return elevator.currentFloor === 4;
    }, 200000, 0.05);
    assert(!reversedEarly, "car must not reverse before serving upward work");
    assert(elevator.currentFloor === 4, "car should reach floor 4");
});

test("5. door hold and safety cap", () => {
    const elevator = makeElevator({ maxCapacity: 4, minDoorOpen: 1.0, maxDoorOpen: 5.0 });
    elevator.callUp(0);
    runUntilDoorOpenAt(elevator, 0);
    const stuck = { id: "stuck" };
    elevator.reserveBoardingSpot(stuck);
    elevator.tick(1.5);
    assert(elevator.state === "DOOR_OPEN", "doors must hold while a boarder is pending");
    elevator.tick(2.0);
    assert(elevator.state === "DOOR_OPEN", "doors should still be open before cap");
    elevator.tick(2.0);
    assert(elevator.state === "DOOR_CLOSING", "doors must close after MAX_DOOR_OPEN_S");
});

test("6. destination preserved across the action handshake", () => {
    const elevator = makeElevator({ maxCapacity: 4 });
    elevator.callUp(0);
    runUntilDoorOpenAt(elevator, 0);
    const rider = { id: "handshake" };
    elevator.reserveBoardingSpot(rider);
    elevator.completeBoard(rider);
    elevator.pressDestination(5);
    assert(elevator.destinations.has(5), "destination 5 must be stored");
    assert(!elevator.destinations.has(1), "destination 1 must not be invented");
    runUntilClosed(elevator);
    tickUntil(elevator, () => elevator.currentFloor === 5 && elevator.state === "DOOR_OPEN", 300000, 0.05);
    assert(elevator.currentFloor === 5, "rider should reach floor 5, got " + elevator.currentFloor);
});

test("7. reset clears phantom state", () => {
    const elevator = makeElevator({ maxCapacity: 4 });
    elevator.callUp(0);
    elevator.callDown(3);
    runUntilDoorOpenAt(elevator, 0);
    const rider = { id: "phantom" };
    elevator.reserveBoardingSpot(rider);
    elevator.completeBoard(rider);
    elevator.pressDestination(5);
    elevator.registerDisembark(rider);
    elevator.reset();
    assert.strictEqual(elevator.upCalls.size, 0, "upCalls should be empty");
    assert.strictEqual(elevator.downCalls.size, 0, "downCalls should be empty");
    assert.strictEqual(elevator.destinations.size, 0, "destinations should be empty");
    assert.strictEqual(elevator.passengers.size, 0, "passengers should be empty");
    assert.strictEqual(elevator.pendingBoarders.size, 0, "pendingBoarders should be empty");
    assert.strictEqual(elevator.pendingDisembark.size, 0, "pendingDisembark should be empty");
    assert.strictEqual(elevator.direction, 0, "direction should be 0");
    assert.strictEqual(elevator.targetFloor, 0, "targetFloor should be 0");
    assert.strictEqual(elevator.currentFloor, 0, "currentFloor should be 0");
    assert.strictEqual(elevator.state, "IDLE", "state should be IDLE");
    assert.strictEqual(elevator.doorTimer, 0, "doorTimer should be 0");
    assert.deepStrictEqual(elevator.spotOccupancy, [false, false, false, false], "spots should be free");
    assert.strictEqual(elevator.spotByPerson.size, 0, "spot map should be empty");
});

console.log(results.join("\n"));
console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed === 0 ? 0 : 1);