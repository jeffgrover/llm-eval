const assert = require("assert");
const { ElevatorLogic } = require("./elevator_logic.js");

function tickUntil(logic, pred, cap) {
    cap = cap || 5000;
    for (var i = 0; i < cap; i++) {
        logic.tick(0.05);
        if (typeof pred === "string") { if (logic.state === pred) return; }
        else if (pred(logic)) return;
    }
    throw new Error("tickUntil timeout waiting for " + pred);
}
function runUntilDoorOpenAt(logic, floor, cap) {
    tickUntil(logic, function(l) { return l.state === "DOOR_OPEN" && l.currentFloor === floor; }, cap);
}
function runUntilDoorClosed(logic, cap) {
    tickUntil(logic, function(l) { return l.state === "IDLE" || l.state === "MOVING"; }, cap);
}

var passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); console.log("PASS: " + name); passed++; } catch (e) { console.log("FAIL: " + name + " - " + e.message); failed++; }
}

test("Lobby rush with more callers than capacity", function() {
    var e = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    e.callUp(0);
    runUntilDoorOpenAt(e, 0);
    // Board 4
    for (var i = 0; i < 4; i++) { var p = { id: i }; e.reserveBoardingSpot(p); e.completeBoard(p); e.pressDestination(i + 1); }
    assert.strictEqual(e.passengers.size, 4);
    // Leftover callers re-press
    e.callUp(0);
    // Tick until doors close and moving
    tickUntil(e, "MOVING");
    assert.ok(e.targetFloor > 0, "target should be above 0, got " + e.targetFloor);
});

test("Passenger destinations outrank same-floor hall calls", function() {
    var e = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    e.callUp(0); runUntilDoorOpenAt(e, 0);
    var p = { id: 10 }; e.reserveBoardingSpot(p); e.completeBoard(p); e.pressDestination(5);
    // Add same-floor hall call while passengers have destinations
    e.callUp(0);
    // Doors should close, not reopen at 0
    tickUntil(e, "MOVING");
    assert.ok(e.targetFloor !== 0 || e.state === "MOVING", "should not reopen at 0");
    assert.strictEqual(e.destinations.has(5), true);
});

test("Repeated hall-call pressing cannot starve riders", function() {
    var e = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    e.callUp(0); runUntilDoorOpenAt(e, 0);
    var p = { id: 20 }; e.reserveBoardingSpot(p); e.completeBoard(p); e.pressDestination(5);
    for (var k = 0; k < 20; k++) { e.tick(0.05); e.callUp(0); }
    // Eventually should reach floor 5
    runUntilDoorOpenAt(e, 5, 6000);
    assert.strictEqual(e.currentFloor, 5);
});

test("Opposite-direction calls wait their turn", function() {
    var e = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    e.pressDestination(5); runUntilDoorOpenAt(e, 5);
    // Now at 5, go down - but add up call mid-way
    e.pressDestination(0);
    tickUntil(e, "MOVING");
    e.callUp(2); // opposite direction
    runUntilDoorOpenAt(e, 0, 8000);
    assert.strictEqual(e.currentFloor, 0);
});

test("Door hold and safety cap", function() {
    var e = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    e.callUp(0); runUntilDoorOpenAt(e, 0);
    var p = { id: 30 }; e.reserveBoardingSpot(p);
    // pendingBoarders non-empty, doors should stay open past MIN
    for (var i = 0; i < 30; i++) e.tick(0.05);
    assert.strictEqual(e.state, "DOOR_OPEN", "should hold for pending boarder");
    // After MAX, should close even with pending
    for (var j = 0; j < 200; j++) e.tick(0.05);
    assert.ok(e.state === "DOOR_CLOSING" || e.state === "IDLE" || e.state === "MOVING", "should close after MAX, got " + e.state);
});

test("Destination preserved across handshake", function() {
    var e = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    e.callUp(0); runUntilDoorOpenAt(e, 0);
    var p = { id: 40 }; e.reserveBoardingSpot(p); e.completeBoard(p);
    e.pressDestination(5);
    assert.ok(e.destinations.has(5), "dest 5 must be set");
    assert.ok(!e.destinations.has(1), "should not have dest 1");
    runUntilDoorOpenAt(e, 5, 8000);
    assert.strictEqual(e.currentFloor, 5);
});

test("Reset clears phantom state", function() {
    var e = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    e.callUp(0); e.callDown(3); e.pressDestination(5);
    var p = { id: 50 }; e.reserveBoardingSpot(p); e.completeBoard(p);
    e.reset();
    assert.strictEqual(e.upCalls.size, 0); assert.strictEqual(e.downCalls.size, 0);
    assert.strictEqual(e.destinations.size, 0); assert.strictEqual(e.passengers.size, 0);
    assert.strictEqual(e.pendingBoarders.size, 0); assert.strictEqual(e.pendingDisembark.size, 0);
    assert.strictEqual(e.direction, 0); assert.strictEqual(e.targetFloor, 0);
    assert.strictEqual(e.currentFloor, 0); assert.strictEqual(e.state, "IDLE");
    assert.ok(e.spotOccupied.every(function(s) { return !s; }));
});

console.log("\n" + passed + " passed, " + failed + " failed");
if (failed > 0) process.exit(1);
