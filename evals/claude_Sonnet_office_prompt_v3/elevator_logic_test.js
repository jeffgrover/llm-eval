// elevator_logic_test.js - deterministic Node tests for elevator_logic.js
// Run with: node elevator_logic_test.js
const assert = require("assert");
const { ElevatorLogic } = require("./elevator_logic.js");

const DT = 0.05;
const DEFAULT_CAP = 4000;

function tickUntil(logic, predicate, maxIters) {
    const cap = maxIters || DEFAULT_CAP;
    for (let i = 0; i < cap; i += 1) {
        if (predicate(logic)) return i;
        logic.tick(DT);
    }
    throw new Error("tickUntil: condition not met within " + cap + " iterations");
}

function runUntilDoorOpenAt(logic, floor, maxIters) {
    return tickUntil(logic, (l) => l.state === "DOOR_OPEN" && l.currentFloor === floor, maxIters);
}

function runUntilDoorClosed(logic, maxIters) {
    return tickUntil(logic, (l) => l.state === "MOVING" || l.state === "IDLE", maxIters);
}

function testLobbyRushMoreCallersThanCapacity() {
    const logic = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    logic.callUp(0);
    runUntilDoorOpenAt(logic, 0);
    for (let i = 0; i < 4; i += 1) {
        const spot = logic.reserveBoardingSpot("rider" + i);
        assert.ok(spot, "expected a free boarding spot for rider" + i);
        logic.completeBoard("rider" + i);
    }
    logic.pressDestination(3);
    logic.pressDestination(5);

    let sawClosingAtZero = false;
    let reopenedAtZero = false;
    let leftFloorZero = false;
    let finalTarget = null;
    for (let i = 0; i < 2000 && !leftFloorZero; i += 1) {
        logic.callUp(0); // leftover lobby waiters keep re-pressing UP
        logic.tick(DT);
        if (logic.currentFloor === 0 && logic.state === "DOOR_CLOSING") sawClosingAtZero = true;
        if (sawClosingAtZero && logic.currentFloor === 0 && logic.state === "DOOR_OPENING") reopenedAtZero = true;
        if (logic.state === "MOVING" || (logic.state === "DOOR_OPEN" && logic.currentFloor !== 0)) {
            leftFloorZero = true;
            finalTarget = logic.targetFloor;
        }
    }
    assert.ok(leftFloorZero, "elevator never left floor 0 despite passenger destinations");
    assert.ok(!reopenedAtZero, "elevator must not reopen at floor 0 once riders have destinations");
    assert.ok(finalTarget > 0, "next target must be above floor 0, not floor 0 again: got " + finalTarget);
}

function testDestinationsOutrankSameFloorHallCall() {
    const logic = new ElevatorLogic();
    logic.callUp(2);
    runUntilDoorOpenAt(logic, 2);
    const spot = logic.reserveBoardingSpot("a");
    assert.ok(spot);
    logic.completeBoard("a");
    logic.pressDestination(5);
    logic.callUp(2); // a same-floor hall call arrives while a passenger destination is pending

    let reopened = false;
    let reachedMoving = false;
    for (let i = 0; i < 1000 && !reachedMoving; i += 1) {
        logic.tick(DT);
        if (logic.state === "DOOR_OPENING" && logic.currentFloor === 2) reopened = true;
        if (logic.state === "MOVING") reachedMoving = true;
    }
    assert.ok(reachedMoving, "elevator should head toward the passenger destination");
    assert.ok(!reopened, "must not reopen at floor 2 for a same-floor hall call while a destination is pending");
    assert.strictEqual(logic.targetFloor, 5);
}

function testRepeatedHallCallsCannotStarveRiders() {
    const logic = new ElevatorLogic();
    logic.callUp(1);
    runUntilDoorOpenAt(logic, 1);
    const spot = logic.reserveBoardingSpot("r");
    assert.ok(spot);
    logic.completeBoard("r");
    logic.pressDestination(4);

    let reachedFour = false;
    for (let i = 0; i < 3000 && !reachedFour; i += 1) {
        logic.callUp(1);
        logic.callDown(2);
        logic.tick(DT);
        if (logic.state === "DOOR_OPEN" && logic.currentFloor === 4) reachedFour = true;
    }
    assert.ok(reachedFour, "elevator must still reach passenger destination floor 4 despite repeated hall calls");
}

function testOppositeDirectionCallsWaitTheirTurn() {
    const logic = new ElevatorLogic();
    logic.callUp(0);
    runUntilDoorOpenAt(logic, 0);
    const spot = logic.reserveBoardingSpot("u");
    assert.ok(spot);
    logic.completeBoard("u");
    logic.pressDestination(5);
    runUntilDoorClosed(logic);
    assert.strictEqual(logic.direction, 1, "elevator should be heading up toward floor 5");

    logic.callDown(2); // opposite-direction call below the destination

    let visitedTwoBeforeFive = false;
    let reachedFive = false;
    for (let i = 0; i < 2000 && !reachedFive; i += 1) {
        logic.tick(DT);
        if (logic.state === "DOOR_OPEN" && logic.currentFloor === 2) visitedTwoBeforeFive = true;
        if (logic.state === "DOOR_OPEN" && logic.currentFloor === 5) reachedFive = true;
    }
    assert.ok(reachedFive, "elevator should reach floor 5");
    assert.ok(!visitedTwoBeforeFive, "elevator must not reverse for the opposite-direction call before serving floor 5");
}

function testDoorHoldAndSafetyCap() {
    const logic = new ElevatorLogic();
    logic.callUp(0);
    runUntilDoorOpenAt(logic, 0);
    const spot = logic.reserveBoardingSpot("stuck"); // never completes boarding
    assert.ok(spot);

    const minTicks = Math.ceil((ElevatorLogic.MIN_DOOR_OPEN_S + 0.5) / DT);
    for (let i = 0; i < minTicks; i += 1) logic.tick(DT);
    assert.strictEqual(logic.state, "DOOR_OPEN", "doors must hold open while a boarder is pending");

    const maxTicks = Math.ceil((ElevatorLogic.MAX_DOOR_OPEN_S + 1) / DT);
    for (let i = 0; i < maxTicks; i += 1) logic.tick(DT);
    assert.notStrictEqual(logic.state, "DOOR_OPEN", "doors must close after MAX_DOOR_OPEN_S even if a boarder never completes");
}

function testDestinationPreservedAcrossActionHandshake() {
    const logic = new ElevatorLogic();
    // WAIT_AT_PANEL(0, +1, 5)
    logic.callUp(0);
    runUntilDoorOpenAt(logic, 0);
    assert.ok(logic.isAcceptingAt(0, 1));
    // ENTER_ELEVATOR(5)
    const spot = logic.reserveBoardingSpot("rider5");
    assert.ok(spot);
    logic.completeBoard("rider5");
    // PRESS_FLOOR(5) - the explicit destination, never reconstructed from direction (which would be floor+dir = 1)
    logic.pressDestination(5);
    assert.ok(logic.destinations.has(5), "destination must be the explicit floor, not floor+direction");
    assert.ok(!logic.destinations.has(1), "must not have synthesized destination 1 from direction");
    // WAIT_FOR_FLOOR(5)
    runUntilDoorOpenAt(logic, 5);
    assert.strictEqual(logic.currentFloor, 5);
}

function testResetClearsPhantomState() {
    const logic = new ElevatorLogic();
    logic.callUp(0);
    runUntilDoorOpenAt(logic, 0);
    const spot = logic.reserveBoardingSpot("ghost");
    assert.ok(spot);
    logic.completeBoard("ghost");
    logic.pressDestination(3);
    logic.callDown(4);

    logic.reset();

    assert.strictEqual(logic.upCalls.size, 0);
    assert.strictEqual(logic.downCalls.size, 0);
    assert.strictEqual(logic.destinations.size, 0);
    assert.strictEqual(logic.passengers.size, 0);
    assert.strictEqual(logic.pendingBoarders.size, 0);
    assert.strictEqual(logic.pendingDisembark.size, 0);
    assert.strictEqual(logic.direction, 0);
    assert.strictEqual(logic.currentFloor, 0);
    assert.strictEqual(logic.targetFloor, 0);
    assert.strictEqual(logic.state, "IDLE");
    for (const spotValue of logic.spotOccupancy) assert.strictEqual(spotValue, null);
}

const TESTS = [
    ["lobby rush with more callers than capacity", testLobbyRushMoreCallersThanCapacity],
    ["passenger destinations outrank same-floor hall calls", testDestinationsOutrankSameFloorHallCall],
    ["repeated hall-call pressing cannot starve riders", testRepeatedHallCallsCannotStarveRiders],
    ["opposite-direction calls wait their turn", testOppositeDirectionCallsWaitTheirTurn],
    ["door hold and safety cap", testDoorHoldAndSafetyCap],
    ["destination preserved across the action handshake", testDestinationPreservedAcrossActionHandshake],
    ["reset clears phantom state", testResetClearsPhantomState],
];

let failures = 0;
for (const [name, fn] of TESTS) {
    try {
        fn();
        console.log("PASS - " + name);
    } catch (err) {
        failures += 1;
        console.log("FAIL - " + name);
        console.log("  " + (err && err.message ? err.message : err));
    }
}
console.log("");
console.log((TESTS.length - failures) + "/" + TESTS.length + " tests passed");
process.exit(failures > 0 ? 1 : 0);
