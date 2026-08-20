const assert = require("assert");
const { ElevatorLogic } = require("./elevator_logic.js");

let passed = 0;
let failed = 0;
const results = [];

function tickUntil(logic, stateOrPredicate, cap, dt) {
    const limit = cap != null ? cap : 25000;
    const step = dt != null ? dt : 0.1;
    const pred = typeof stateOrPredicate === "function"
        ? stateOrPredicate
        : function (el) { return el.state === stateOrPredicate; };
    for (let i = 0; i < limit; i++) {
        if (pred(logic)) return i;
        logic.tick(step);
    }
    throw new Error("tickUntil exceeded " + limit + " iterations (state=" + logic.state + " floor=" + logic.currentFloor + " target=" + logic.targetFloor + ")");
}

function runUntilDoorOpenAt(logic, floor) {
    return tickUntil(logic, function (el) {
        return el.state === "DOOR_OPEN" && el.currentFloor === floor;
    });
}

function runUntilDoorClosed(logic) {
    return tickUntil(logic, function (el) {
        return el.state === "IDLE" || el.state === "MOVING";
    });
}

function test(name, fn) {
    try {
        fn();
        passed += 1;
        results.push("PASS  " + name);
    } catch (err) {
        failed += 1;
        results.push("FAIL  " + name + " :: " + (err && err.message ? err.message : err));
    }
}

test("lobby rush with more callers than capacity leaves floor 0", function () {
    const logic = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    logic.callUp(0);
    runUntilDoorOpenAt(logic, 0);
    const riders = ["a", "b", "c", "d"];
    for (let i = 0; i < riders.length; i++) {
        const spot = logic.reserveBoardingSpot(riders[i]);
        assert.ok(spot, "should reserve spot " + i);
        logic.completeBoard(riders[i]);
    }
    logic.pressDestination(2);
    logic.pressDestination(3);
    logic.pressDestination(4);
    logic.pressDestination(5);
    assert.strictEqual(logic.currentCapacityFree(), 0);
    logic.callUp(0);
    tickUntil(logic, function (el) { return el.state === "DOOR_CLOSING" || el.state === "MOVING"; }, 5000, 0.05);
    runUntilDoorClosed(logic);
    logic.callUp(0);
    logic.tick(0.1);
    logic.tick(0.1);
    assert.notStrictEqual(logic.targetFloor, 0, "full car must not retarget floor 0");
    assert.ok(logic.targetFloor > 0, "next target must be above lobby");
});

test("passenger destinations outrank same-floor hall calls", function () {
    const logic = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    logic.callUp(0);
    runUntilDoorOpenAt(logic, 0);
    const rider = { id: "p1" };
    assert.ok(logic.reserveBoardingSpot(rider));
    logic.completeBoard(rider);
    logic.pressDestination(5);
    tickUntil(logic, "DOOR_CLOSING");
    logic.callUp(0);
    logic.tick(0.2);
    assert.notStrictEqual(logic.state, "DOOR_OPENING", "must not immediately reopen for same-floor hall call");
    runUntilDoorClosed(logic);
    assert.ok(logic.targetFloor > 0, "should head to passenger destination");
    assert.ok(logic.passengers.size > 0 && logic.destinations.size > 0);
});

test("repeated hall-call pressing cannot starve riders", function () {
    const logic = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    logic.callUp(0);
    runUntilDoorOpenAt(logic, 0);
    const rider = { id: "p2" };
    assert.ok(logic.reserveBoardingSpot(rider));
    logic.completeBoard(rider);
    logic.pressDestination(4);
    for (let i = 0; i < 80; i++) {
        logic.callUp(0);
        logic.tick(0.1);
    }
    tickUntil(logic, function (el) {
        return el.state === "DOOR_OPEN" && el.currentFloor === 4;
    }, 20000, 0.1);
    assert.strictEqual(logic.currentFloor, 4);
});

test("opposite-direction calls wait their turn", function () {
    const logic = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    logic.callUp(0);
    runUntilDoorOpenAt(logic, 0);
    const rider = { id: "p3" };
    assert.ok(logic.reserveBoardingSpot(rider));
    logic.completeBoard(rider);
    logic.pressDestination(5);
    tickUntil(logic, "MOVING");
    logic.callDown(1);
    logic.callDown(0);
    for (let i = 0; i < 40; i++) logic.tick(0.1);
    assert.ok(logic.direction >= 0 || logic.targetFloor >= logic.currentFloor, "should keep serving upward work");
    assert.ok(logic.targetFloor >= 4, "should not reverse to a low down-call while dest 5 remains");
    tickUntil(logic, function (el) {
        return el.state === "DOOR_OPEN" && el.currentFloor === 5;
    });
    assert.strictEqual(logic.currentFloor, 5);
});

test("door hold and safety cap", function () {
    const logic = new ElevatorLogic({ floorCount: 6, maxCapacity: 4, minDoorOpen: 1.4, maxDoorOpen: 8 });
    logic.callUp(0);
    runUntilDoorOpenAt(logic, 0);
    const stuck = { id: "stuck" };
    assert.ok(logic.reserveBoardingSpot(stuck));
    let t = 0;
    while (t < logic.MIN_DOOR_OPEN_S + 0.5) {
        logic.tick(0.1);
        t += 0.1;
    }
    assert.strictEqual(logic.state, "DOOR_OPEN", "doors stay open while pendingBoarders nonempty");
    tickUntil(logic, function (el) { return el.state === "DOOR_CLOSING" || el.state === "IDLE" || el.state === "MOVING"; }, 20000, 0.2);
    assert.ok(logic.state !== "DOOR_OPEN", "MAX_DOOR_OPEN_S must force a close");
});

test("destination preserved across action handshake 0 to 5", function () {
    const logic = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    const rider = { id: "long" };
    const toFloor = 5;
    logic.callUp(0);
    runUntilDoorOpenAt(logic, 0);
    assert.ok(logic.isAcceptingAt(0, 1));
    assert.ok(logic.reserveBoardingSpot(rider));
    logic.completeBoard(rider);
    logic.pressDestination(toFloor);
    assert.ok(logic.destinations.has(5), "must store floor 5, not infer floor 1 from direction");
    assert.ok(!logic.destinations.has(1) || toFloor === 1);
    tickUntil(logic, function (el) {
        return el.state === "DOOR_OPEN" && el.currentFloor === 5;
    });
    assert.strictEqual(logic.currentFloor, 5);
    logic.registerDisembark(rider);
    logic.completeDisembark(rider);
    assert.strictEqual(logic.passengers.has(rider), false);
});

test("reset clears phantom state", function () {
    const logic = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    logic.callUp(2);
    logic.callDown(4);
    logic.pressDestination(3);
    const rider = { id: "ghost" };
    logic.state = "DOOR_OPEN";
    logic.currentFloor = 2;
    logic.reserveBoardingSpot(rider);
    logic.completeBoard(rider);
    logic.registerDisembark(rider);
    logic.doorOpenTime = 3;
    logic.direction = 1;
    logic.targetFloor = 5;
    logic.reset();
    assert.strictEqual(logic.state, "IDLE");
    assert.strictEqual(logic.direction, 0);
    assert.strictEqual(logic.currentFloor, 0);
    assert.strictEqual(logic.targetFloor, 0);
    assert.strictEqual(logic.upCalls.size, 0);
    assert.strictEqual(logic.downCalls.size, 0);
    assert.strictEqual(logic.destinations.size, 0);
    assert.strictEqual(logic.passengers.size, 0);
    assert.strictEqual(logic.pendingBoarders.size, 0);
    assert.strictEqual(logic.pendingDisembark.size, 0);
    assert.ok(logic.spotOccupancy.every(function (s) { return s == null; }));
    assert.strictEqual(logic.doorOpenTime, 0);
    assert.strictEqual(logic.doorOpenAmount, 0);
});

test("WAIT_AT_PANEL must re-press after a cleared call", function () {
    const logic = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    logic.callUp(0);
    runUntilDoorOpenAt(logic, 0);
    assert.strictEqual(logic.upCalls.has(0), false);
    logic.callUp(0);
    assert.ok(logic.upCalls.has(0) || logic.isAcceptingAt(0, 1), "re-press should restore the hall call or still accept");
});

console.log(results.join("\n"));
console.log("\n" + passed + " passed, " + failed + " failed");
if (failed > 0) process.exit(1);
