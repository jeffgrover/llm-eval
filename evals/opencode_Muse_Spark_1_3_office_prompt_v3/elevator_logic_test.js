const assert = require("assert");
const { ElevatorLogic } = require("./elevator_logic.js");

let passed = 0;
let failed = 0;

function run(name, fn) {
    try {
        fn();
        passed += 1;
        console.log("PASS: " + name);
    } catch (err) {
        failed += 1;
        console.log("FAIL: " + name + " :: " + (err && err.message));
    }
}

function tickUntil(logic, pred, cap) {
    cap = cap || 4000;
    for (let i = 0; i < cap; i++) {
        logic.tick(0.1);
        if (pred(logic)) { return i; }
    }
    throw new Error("tickUntil timed out waiting for predicate");
}

function runUntilDoorOpenAt(logic, floor, cap) {
    return tickUntil(logic, function(l) {
        return l.state === "DOOR_OPEN" && l.currentFloor === floor;
    }, cap || 6000);
}

function runUntilDoorClosed(logic, cap) {
    return tickUntil(logic, function(l) {
        return l.state === "IDLE" || l.state === "MOVING";
    }, cap || 6000);
}

// 1. Lobby rush with more callers than capacity
run("lobby rush over capacity leaves instead of reopening", function() {
    const logic = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    logic.callUp(0);
    runUntilDoorOpenAt(logic, 0);
    const riders = ["a", "b", "c", "d"];
    riders.forEach(function(r) {
        const spot = logic.reserveBoardingSpot(r);
        assert.ok(spot, "should reserve spot for " + r);
        logic.completeBoard(r);
    });
    assert.strictEqual(logic.reserveBoardingSpot("extra"), null, "full car rejects extra");
    ["2", "3", "4", "5"].forEach(function(r, i) {
        logic.passengers.delete(r);
    });
    logic.pressDestination(2);
    logic.pressDestination(3);
    logic.pressDestination(4);
    logic.pressDestination(5);
    logic.callUp(0);
    runUntilDoorClosed(logic);
    assert.ok(logic.targetFloor > 0, "next target must be above 0, got " + logic.targetFloor);
    assert.ok(logic.state === "MOVING" || logic.state === "IDLE", "car should be moving, got " + logic.state);
});

// 2. Passenger destinations outrank same-floor hall calls
run("destinations outrank same-floor hall calls", function() {
    const logic = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    logic.callUp(0);
    runUntilDoorOpenAt(logic, 0);
    logic.reserveBoardingSpot("r1");
    logic.completeBoard("r1");
    logic.pressDestination(4);
    logic.callUp(0);
    runUntilDoorClosed(logic);
    assert.strictEqual(logic.state, "MOVING", "should depart, not reopen");
    assert.ok(logic.targetFloor > 0, "target above, got " + logic.targetFloor);
});

// 3. Repeated hall-call pressing cannot starve riders
run("repeated hall calls do not starve riders", function() {
    const logic = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    logic.callUp(0);
    runUntilDoorOpenAt(logic, 0);
    logic.reserveBoardingSpot("r1");
    logic.completeBoard("r1");
    logic.pressDestination(5);
    for (let i = 0; i < 40; i++) {
        logic.callUp(0);
        logic.tick(0.1);
    }
    runUntilDoorClosed(logic, 2000);
    tickUntil(logic, function(l) {
        return (l.state === "DOOR_OPEN" || l.state === "DOOR_OPENING") && l.currentFloor === 5;
    }, 8000);
    assert.ok(true, "reached destination 5");
});

// 4. Opposite-direction calls wait their turn
run("opposite direction call waits", function() {
    const logic = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    logic.callUp(0);
    runUntilDoorOpenAt(logic, 0);
    logic.reserveBoardingSpot("r1");
    logic.completeBoard("r1");
    logic.pressDestination(5);
    runUntilDoorClosed(logic);
    logic.callDown(2);
    logic.tick(0.1);
    assert.ok(logic.direction === 1 || logic.targetFloor >= logic.currentFloor,
        "car keeps going up, dir=" + logic.direction + " target=" + logic.targetFloor);
    tickUntil(logic, function(l) {
        return l.currentFloor === 5 && (l.state === "DOOR_OPEN" || l.state === "DOOR_OPENING");
    }, 10000);
    assert.ok(true, "served 5 before reversing");
});

// 5. Door hold and safety cap
run("door hold and safety cap", function() {
    const logic = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    logic.callUp(0);
    runUntilDoorOpenAt(logic, 0);
    logic.reserveBoardingSpot("stuck");
    for (let i = 0; i < 25; i++) { logic.tick(0.1); }
    assert.strictEqual(logic.state, "DOOR_OPEN", "doors held while pending, got " + logic.state);
    for (let i = 0; i < 200; i++) { logic.tick(0.1); }
    assert.ok(logic.state !== "DOOR_OPEN", "safety cap closes doors, got " + logic.state);
});

// 6. Destination preserved across handshake (0 -> 5)
run("handshake preserves destination 0->5", function() {
    const logic = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    let toFloor = 5;
    const me = "rider";
    logic.callUp(0);
    runUntilDoorOpenAt(logic, 0);
    assert.ok(logic.isAcceptingAt(0, 1), "accepting up at 0");
    const spot = logic.reserveBoardingSpot(me);
    assert.ok(spot, "got spot");
    logic.completeBoard(me);
    logic.pressDestination(toFloor);
    assert.ok(logic.destinations.has(5), "destination 5 stored, has=" + Array.from(logic.destinations));
    assert.ok(!logic.destinations.has(1), "destination must not degrade to 1");
    runUntilDoorClosed(logic);
    tickUntil(logic, function(l) {
        return (l.state === "DOOR_OPEN" || l.state === "DOOR_OPENING") && l.currentFloor === 5;
    }, 10000);
    assert.ok(true, "arrived at 5");
});

// 7. Reset clears phantom state
run("reset clears phantom state", function() {
    const logic = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    logic.callUp(0);
    logic.callDown(3);
    logic.pressDestination(4);
    runUntilDoorOpenAt(logic, 0);
    logic.reserveBoardingSpot("p1");
    logic.completeBoard("p1");
    logic.registerDisembark("p1");
    logic.reset();
    assert.strictEqual(logic.upCalls.size, 0, "upCalls");
    assert.strictEqual(logic.downCalls.size, 0, "downCalls");
    assert.strictEqual(logic.destinations.size, 0, "destinations");
    assert.strictEqual(logic.passengers.size, 0, "passengers");
    assert.strictEqual(logic.pendingBoarders.size, 0, "pendingBoarders");
    assert.strictEqual(logic.pendingDisembark.size, 0, "pendingDisembark");
    assert.strictEqual(logic.direction, 0, "direction");
    assert.strictEqual(logic.currentFloor, 0, "currentFloor");
    assert.strictEqual(logic.state, "IDLE", "state");
    assert.ok(logic.spotOccupied.every(function(s) { return !s; }), "spots free");
});

console.log("----");
console.log(passed + " passed, " + failed + " failed");
process.exit(failed > 0 ? 1 : 0);
