/* elevator_logic_test.js - deterministic Node tests for elevator_logic.js
   Run: node elevator_logic_test.js
   No dependencies beyond Node built-ins. */

const assert = require("assert");
const { ElevatorLogic } = require("./elevator_logic.js");

const DT = 1 / 60;

function makeLogic() {
    return new ElevatorLogic({ floorCount: 6, maxCapacity: 4, floorHeight: 3.4 });
}

function tickUntil(logic, predicate, maxSeconds) {
    const limit = Math.ceil((maxSeconds || 180) / DT);
    let elapsed = 0;
    for (let i = 0; i < limit; i += 1) {
        logic.tick(DT);
        elapsed += DT;
        if (predicate(logic, elapsed)) return true;
    }
    return false;
}

function runUntilDoorOpenAt(logic, floor, maxSeconds) {
    return tickUntil(
        logic,
        (lg) => lg.state === "DOOR_OPEN" && lg.currentFloor === floor,
        maxSeconds || 120
    );
}

function runUntilDoorClosed(logic, maxSeconds) {
    return tickUntil(
        logic,
        (lg) => lg.state === "IDLE" || lg.state === "MOVING",
        maxSeconds || 120
    );
}

function board(logic, person, destinationFloor) {
    const spot = logic.reserveBoardingSpot(person);
    assert.ok(spot, `expected a boarding spot for ${person.name}`);
    logic.completeBoard(person);
    if (destinationFloor !== undefined && destinationFloor !== null) {
        logic.pressDestination(destinationFloor);
    }
    return spot;
}

const tests = [];
function test(name, fn) {
    tests.push({ name: name, fn: fn });
}

/* 1 - lobby rush with more callers than capacity */
test("lobby rush: full car still leaves floor 0", () => {
    const logic = makeLogic();
    logic.callUp(0);
    assert.ok(runUntilDoorOpenAt(logic, 0), "car should open at floor 0");

    for (let i = 0; i < 4; i += 1) {
        board(logic, { name: `rider${i}` }, 2 + i);
    }
    assert.strictEqual(logic.currentCapacityFree(), 0, "car should be full");
    assert.strictEqual(logic.reserveBoardingSpot({ name: "overflow" }), null, "no 5th spot");

    // leftover lobby waiters keep pressing UP
    for (let i = 0; i < 6; i += 1) {
        logic.callUp(0);
        logic.tick(DT);
    }
    assert.ok(runUntilDoorClosed(logic), "doors should close");
    assert.strictEqual(logic.state, "MOVING", "car must move, not reopen at floor 0");
    assert.ok(logic.targetFloor > 0, `target must be above floor 0, got ${logic.targetFloor}`);

    const opened = tickUntil(logic, (lg) => lg.state === "DOOR_OPEN", 120);
    assert.ok(opened, "car should open somewhere");
    assert.ok(logic.currentFloor > 0, `first stop must be above floor 0, got ${logic.currentFloor}`);
});

/* 2 - passenger destinations outrank same-floor hall calls */
test("destinations outrank same-floor hall calls", () => {
    const logic = makeLogic();
    logic.callUp(0);
    assert.ok(runUntilDoorOpenAt(logic, 0));
    board(logic, { name: "solo" }, 3);
    assert.strictEqual(logic.passengers.size, 1);
    assert.ok(logic.destinations.has(3));

    let reopenedAtZero = false;
    for (let i = 0; i < 60; i += 1) {
        logic.callUp(0); // impatient lobby waiter
        logic.tick(DT);
        if (logic.state === "DOOR_OPEN" && logic.currentFloor === 0 && logic.doorOpenElapsed > 3.2) {
            reopenedAtZero = true;
            break;
        }
    }
    assert.ok(!reopenedAtZero, "car must not reopen at floor 0 while a destination is pending");
    const reached = tickUntil(logic, (lg) => lg.state === "DOOR_OPEN" && lg.currentFloor === 3, 120);
    assert.ok(reached, "car must serve destination floor 3");
});

/* 3 - repeated hall-call pressing cannot starve riders */
test("repeated hall calls do not starve riders", () => {
    const logic = makeLogic();
    logic.callUp(0);
    assert.ok(runUntilDoorOpenAt(logic, 0));
    const rider = { name: "R" };
    board(logic, rider, 4);
    let reachedDestination = false;
    for (let i = 0; i < 60 * 90; i += 1) {
        if (i % 5 === 0) logic.callUp(0);
        logic.tick(DT);
        if (logic.state === "DOOR_OPEN" && logic.currentFloor === 4 && logic.passengers.has(rider)) {
            reachedDestination = true;
            break;
        }
    }
    assert.ok(reachedDestination, "rider must reach floor 4 despite repeated lobby calls");
});

/* 4 - opposite-direction calls wait their turn */
test("opposite-direction calls wait their turn", () => {
    const logic = makeLogic();
    logic.callUp(0);
    assert.ok(runUntilDoorOpenAt(logic, 0));
    board(logic, { name: "up" }, 5);
    assert.ok(runUntilDoorClosed(logic));

    let reversedEarly = false;
    let openedAtFive = false;
    for (let i = 0; i < 60 * 120; i += 1) {
        if (i === 10) {
            logic.callDown(1);
            logic.callDown(0);
        }
        logic.tick(DT);
        if (logic.state === "MOVING" && logic.direction < 0) reversedEarly = true;
        if (logic.state === "DOOR_OPEN" && logic.currentFloor === 5) {
            openedAtFive = true;
            break;
        }
    }
    assert.ok(openedAtFive, "car should reach floor 5");
    assert.ok(!reversedEarly, "car must not reverse while upward work remains");
});

/* 5 - door hold and safety cap */
test("door hold and safety cap", () => {
    const logic = makeLogic();
    logic.callUp(0);
    assert.ok(runUntilDoorOpenAt(logic, 0));
    const slow = { name: "slow" };
    assert.ok(logic.reserveBoardingSpot(slow), "spot reserved");
    // never calls completeBoard: doors must stay open past MIN_DOOR_OPEN_S
    tickUntil(logic, (lg) => lg.doorOpenElapsed >= logic.MIN_DOOR_OPEN_S + 2.0, 30);
    assert.strictEqual(logic.state, "DOOR_OPEN", "doors held open for pending boarder");
    assert.ok(logic.pendingBoarders.has(slow));

    const closed = tickUntil(
        logic,
        (lg) => lg.state === "DOOR_CLOSING" || lg.state === "MOVING" || lg.state === "IDLE",
        logic.MAX_DOOR_OPEN_S + 15
    );
    assert.ok(closed, "MAX_DOOR_OPEN_S safety cap must close the doors");
    assert.strictEqual(logic.pendingBoarders.size, 0, "pending set force-completed");
});

/* 6 - destination preserved across the action handshake */
test("action handshake preserves the destination floor", () => {
    const logic = makeLogic();
    const rider = { name: "five" };
    const toFloor = 5;
    // WAIT_AT_PANEL
    logic.callUp(0);
    assert.ok(runUntilDoorOpenAt(logic, 0), "step WAIT_AT_PANEL");
    assert.ok(logic.isAcceptingAt(0, 1), "car accepts up-callers at floor 0");

    // ENTER_ELEVATOR
    const spot = logic.reserveBoardingSpot(rider);
    assert.ok(spot);
    assert.ok(spot.index >= 0 && spot.index < 4);
    logic.completeBoard(rider);

    // PRESS_FLOOR - the destination is carried explicitly, never derived
    // from the call direction (which would wrongly yield floor 1).
    logic.pressDestination(toFloor);
    assert.ok(logic.destinations.has(5), "destination 5 registered");
    assert.ok(!logic.destinations.has(1), "destination must not collapse to floor 1");

    // WAIT_FOR_FLOOR
    assert.ok(runUntilDoorClosed(logic), "doors close before departure");
    let firstOpenFloor = null;
    for (let i = 0; i < 60 * 120; i += 1) {
        logic.tick(DT);
        if (logic.state === "DOOR_OPEN" && firstOpenFloor === null) {
            firstOpenFloor = logic.currentFloor;
            break;
        }
    }
    assert.strictEqual(firstOpenFloor, 5, `first stop should be floor 5, got ${firstOpenFloor}`);
    assert.ok(logic.passengers.has(rider), "rider still aboard at floor 5");

    logic.registerDisembark(rider);
    logic.completeDisembark(rider);
    assert.strictEqual(logic.passengers.size, 0);
    assert.strictEqual(logic.spotOccupancy.filter((used) => used).length, 0, "spot released");
});

/* 7 - reset clears phantom state */
test("reset clears phantom state", () => {
    const logic = makeLogic();
    const person = { name: "ghost" };
    logic.callUp(0);
    assert.ok(runUntilDoorOpenAt(logic, 0));
    logic.reserveBoardingSpot(person);
    logic.completeBoard(person);
    logic.pressDestination(4);
    logic.callDown(3);
    logic.registerDisembark(person);
    logic.tick(DT);

    logic.reset();
    assert.strictEqual(logic.state, "IDLE");
    assert.strictEqual(logic.direction, 0);
    assert.strictEqual(logic.currentFloor, 0);
    assert.strictEqual(logic.targetFloor, null);
    assert.strictEqual(logic.carY, 0);
    assert.strictEqual(logic.doorPos, 0);
    assert.strictEqual(logic.doorOpenElapsed, 0);
    assert.strictEqual(logic.upCalls.size, 0);
    assert.strictEqual(logic.downCalls.size, 0);
    assert.strictEqual(logic.destinations.size, 0);
    assert.strictEqual(logic.passengers.size, 0);
    assert.strictEqual(logic.pendingBoarders.size, 0);
    assert.strictEqual(logic.pendingDisembark.size, 0);
    assert.strictEqual(logic.spotOccupancy.filter((used) => used).length, 0);
});

/* 8 - car answers a call from another floor then returns */
test("car answers a distant call and returns to the lobby", () => {
    const logic = makeLogic();
    logic.callDown(4);
    const openedUpstairs = runUntilDoorOpenAt(logic, 4, 120);
    assert.ok(openedUpstairs, "car should travel to floor 4 for a down call");
    const rider = { name: "down" };
    board(logic, rider, 0);
    const openedDownstairs = tickUntil(
        logic,
        (lg) => lg.state === "DOOR_OPEN" && lg.currentFloor === 0,
        120
    );
    assert.ok(openedDownstairs, "car should bring the rider to floor 0");
});

let failures = 0;
for (const entry of tests) {
    try {
        entry.fn();
        console.log(`PASS  ${entry.name}`);
    } catch (err) {
        failures += 1;
        console.log(`FAIL  ${entry.name}`);
        console.log(`      ${err && err.message ? err.message : err}`);
    }
}

console.log(`\n${tests.length - failures}/${tests.length} tests passed`);
if (failures > 0) {
    console.log("ELEVATOR LOGIC TESTS: FAIL");
    process.exit(1);
}
console.log("ELEVATOR LOGIC TESTS: PASS");
