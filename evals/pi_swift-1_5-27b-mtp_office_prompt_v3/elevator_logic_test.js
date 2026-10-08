/*
 * elevator_logic_test.js - deterministic Node tests for elevator_logic.js
 * Run: node elevator_logic_test.js
 */
"use strict";

const assert = require("assert");
const { ElevatorLogic } = require("./elevator_logic.js");

const results = [];
function test(name, fn) {
    try {
        fn();
        results.push({ name: name, ok: true });
    } catch (err) {
        results.push({ name: name, ok: false, err: err });
    }
}

function tickUntil(elev, predicate, maxTicks = 50000) {
    for (var i = 0; i < maxTicks; i++) {
        elev.tick(0.05);
        if (predicate(elev)) return i;
    }
    throw new Error("tickUntil: maxTicks exhausted, predicate never true (state=" + elev.state + ", floor=" + elev.currentFloor + ")");
}

function runUntilDoorOpenAt(elev, floor, maxTicks = 50000) {
    return tickUntil(elev, function (e) {
        return e.state === "DOOR_OPEN" && e.currentFloor === floor;
    }, maxTicks);
}

function runUntilDoorClosed(elev, maxTicks = 50000) {
    return tickUntil(elev, function (e) {
        return e.state === "IDLE" || e.state === "MOVING";
    }, maxTicks);
}

// 1. Lobby rush with more callers than capacity
test("lobby rush: next target is above 0 after 4 boarders, leftover UP presses", function () {
    var e = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    e.callUp(0);
    runUntilDoorOpenAt(e, 0);
    var p = [1, 2, 3, 4].map(function (n) {
        var person = { id: n };
        var spot = e.reserveBoardingSpot(person);
        assert.ok(spot !== null, "spot reserved for rider " + n);
        e.completeBoard(person);
        e.pressDestination(5);
        return person;
    });
    // leftover lobby callers keep pressing UP while doors are open
    e.callUp(0); e.tick(0.05); e.callUp(0); e.tick(0.05); e.callUp(0);
    runUntilDoorClosed(e);
    assert.ok(e.state === "MOVING" && e.direction > 0 && e.targetFloor > 0,
        "expected car moving up to a floor above 0, got state=" + e.state + " target=" + e.targetFloor);
    tickUntil(e, function (ev) { return ev.currentFloor === 5 && ev.state === "DOOR_OPEN"; });
    assert.strictEqual(e.passengers.size, 4);
});

// 2. Passenger destinations outrank same-floor hall calls
test("passenger destinations outrank same-floor hall calls", function () {
    var e = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    e.callUp(0);
    runUntilDoorOpenAt(e, 0);
    var person = { id: 1 };
    e.reserveBoardingSpot(person);
    e.completeBoard(person);
    e.pressDestination(4);
    var openedAt0 = 0;
    var started = false;
    tickUntil(e, function (ev) {
        if (ev.state === "MOVING" || ev.state === "IDLE") started = true;
        if (started && ev.state === "DOOR_OPEN" && ev.currentFloor === 0) openedAt0++;
        return ev.currentFloor === 4 && ev.state === "DOOR_OPEN";
    });
    e.callUp(0); // same-floor call added while riders en route
    runUntilDoorClosed(e);
    assert.ok(e.state === "IDLE" || (e.state === "MOVING" && e.targetFloor === 0),
        "car must not have reopened above 0 while riders had destinations; state=" + e.state + " target=" + e.targetFloor);
    assert.strictEqual(openedAt0, 0, "doors must not reopen at floor 0 after closing with riders aboard");
});

// 3. Repeated hall-call pressing cannot starve riders
test("repeated callUp(0) cannot starve riders with destinations", function () {
    var e = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    e.callUp(0);
    runUntilDoorOpenAt(e, 0);
    var person = { id: 1 };
    e.reserveBoardingSpot(person);
    e.completeBoard(person);
    e.pressDestination(5);
    var ticks = 0;
    while (!(e.currentFloor === 5 && e.state === "DOOR_OPEN") && ticks < 50000) {
        e.callUp(0);
        e.tick(0.05);
        ticks++;
    }
    assert.ok(ticks < 50000, "car reached floor 5 destination");
    assert.strictEqual(e.currentFloor, 5);
});

// 4. Opposite-direction calls wait their turn
test("down call while moving up with work above does not reverse early", function () {
    var e = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    e.callUp(0);
    runUntilDoorOpenAt(e, 0);
    var person = { id: 1 };
    e.reserveBoardingSpot(person);
    e.completeBoard(person);
    e.pressDestination(5);
    runUntilDoorClosed(e);
    e.callDown(1); // lower-floor down call while heading up
    var reversed = false;
    tickUntil(e, function (ev) {
        if (ev.direction < 0 && (ev.state === "MOVING")) reversed = true;
        return ev.currentFloor === 5 && ev.state === "DOOR_OPEN";
    });
    assert.strictEqual(reversed, false, "car must not reverse down before serving floor 5");
});

// 5. Door hold and safety cap
test("doors hold while pending sets non-empty, then safety cap closes", function () {
    var e = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    e.callUp(0);
    runUntilDoorOpenAt(e, 0);
    var person = { id: 1 };
    e.reserveBoardingSpot(person); // pending boarder never completes
    var t = 0;
    while (e.state === "DOOR_OPEN" && t < 10000) { e.tick(0.05); t++; }
    assert.ok(t * 0.05 > ElevatorLogic.MAX_DOOR_OPEN_S - 0.01, "doors stayed open past the minimum open time");
    assert.ok(e.state === "DOOR_CLOSING" || e.state === "IDLE" || e.state === "MOVING",
        "safety cap must close the doors; state=" + e.state);
});

// 6. Destination preserved across the action handshake (floor 0 -> floor 5)
test("destination preserved across WAIT/ENTER/PRESS/WAIT handshake", function () {
    var e = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    var toFloor = 5;
    var person = { id: 1 };
    // WAIT_AT_PANEL: car accepts
    e.callUp(0);
    runUntilDoorOpenAt(e, 0);
    assert.ok(e.isAcceptingAt(0, 1), "car accepting at floor 0 going up");
    // ENTER_ELEVATOR: reserve + board
    var spot = e.reserveBoardingSpot(person);
    assert.ok(spot !== null);
    e.completeBoard(person);
    // PRESS_FLOOR: the exact destination from the plan, not floor + dir
    e.pressDestination(toFloor);
    // WAIT_FOR_FLOOR
    tickUntil(e, function (ev) {
        return ev.state === "DOOR_OPEN" && ev.currentFloor === toFloor;
    });
    assert.strictEqual(e.currentFloor, 5, "car must arrive at floor 5, not floor 1");
    // EXIT_ELEVATOR
    e.registerDisembark(person);
    e.completeDisembark(person);
    assert.strictEqual(e.passengers.size, 0);
    assert.ok(e.spotOccupancy.every(function (o) { return !o; }), "spot released");
});

// 7. Reset clears phantom state
test("reset clears all phantom state", function () {
    var e = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    e.callUp(0); e.callDown(3); e.pressDestination(4);
    var person = { id: 1 };
    e.reserveBoardingSpot(person);
    e.completeBoard(person);
    e.registerDisembark(person);
    e.direction = 1;
    e.targetFloor = 5;
    e.doorTimer = 123;
    e.reset();
    assert.strictEqual(e.state, "IDLE");
    assert.strictEqual(e.currentFloor, 0);
    assert.strictEqual(e.targetFloor, 0);
    assert.strictEqual(e.direction, 0);
    assert.strictEqual(e.upCalls.size, 0);
    assert.strictEqual(e.downCalls.size, 0);
    assert.strictEqual(e.destinations.size, 0);
    assert.strictEqual(e.passengers.size, 0);
    assert.strictEqual(e.pendingBoarders.size, 0);
    assert.strictEqual(e.pendingDisembark.size, 0);
    assert.ok(e.spotOccupancy.every(function (o) { return !o; }), "spots cleared");
    assert.strictEqual(e.doorTimer, 0);
    // And it must be able to run fresh afterwards
    e.callUp(0);
    runUntilDoorOpenAt(e, 0);
});

// Summary
var failed = 0;
results.forEach(function (r) {
    if (r.ok) {
        console.log("PASS  " + r.name);
    } else {
        failed++;
        console.log("FAIL  " + r.name);
        console.log("      " + (r.err && r.err.message ? r.err.message : r.err));
    }
});
console.log("----------------------------------------");
console.log(results.length - failed + "/" + results.length + " tests passed");
process.exit(failed > 0 ? 1 : 0);
