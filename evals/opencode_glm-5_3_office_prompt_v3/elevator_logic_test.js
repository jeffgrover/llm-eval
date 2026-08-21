const assert = require("assert");
const { ElevatorLogic } = require("./elevator_logic.js");

function tickUntil(el, predicate, maxTicks, dt) {
    const cap = maxTicks || 5000;
    const step = dt || 0.05;
    for (let i = 0; i < cap; i++) {
        if (predicate(el)) return true;
        el.tick(step);
    }
    return predicate(el);
}

function runUntilDoorOpenAt(el, floor) {
    return tickUntil(el, function (e) {
        return e.state === "DOOR_OPEN" && e.currentFloor === floor;
    });
}

function runUntilDoorClosed(el) {
    return tickUntil(el, function (e) {
        return e.state === "IDLE" || e.state === "MOVING";
    });
}

const results = [];

function test(name, fn) {
    try {
        fn();
        results.push({ name: name, ok: true, msg: "" });
    } catch (err) {
        results.push({ name: name, ok: false, msg: String(err && err.message ? err.message : err) });
    }
}

function boardRider(el, rider, destination) {
    const spot = el.reserveBoardingSpot(rider);
    assert.ok(spot, "spot must be reserved");
    el.completeBoard(rider);
    el.pressDestination(destination);
    return spot;
}

test("lobby rush: full car leaves floor 0 for passenger destinations", function () {
    const el = new ElevatorLogic({});
    el.callUp(0);
    assert.ok(runUntilDoorOpenAt(el, 0), "doors must open at lobby");
    const riders = [{}, {}, {}, {}];
    for (let i = 0; i < riders.length; i++) {
        boardRider(el, riders[i], i + 2);
    }
    assert.strictEqual(el.currentCapacityFree(), 0);
    el.callUp(0);
    el.callUp(0);
    assert.ok(runUntilDoorClosed(el), "doors must close after boarding");
    assert.strictEqual(el.state, "MOVING");
    assert.ok(el.targetFloor > 0, "next target must be above floor 0, got " + el.targetFloor);
    let reachedTwo = false;
    for (let i = 0; i < 4000 && !reachedTwo; i++) {
        el.callUp(0);
        if (el.state === "DOOR_OPEN" && el.currentFloor === 2) reachedTwo = true;
        else el.tick(0.05);
    }
    assert.ok(reachedTwo, "car must reach floor 2 despite repeated lobby UP calls");
});

test("passenger destinations outrank same-floor hall calls", function () {
    const el = new ElevatorLogic({});
    el.callUp(0);
    assert.ok(runUntilDoorOpenAt(el, 0));
    boardRider(el, {}, 3);
    el.callUp(0);
    assert.ok(runUntilDoorClosed(el));
    assert.strictEqual(el.state, "MOVING");
    assert.strictEqual(el.targetFloor, 3, "target must be rider destination 3");
    let reopenedAtZero = false;
    let openedAtThree = false;
    for (let i = 0; i < 300 && !openedAtThree && !reopenedAtZero; i++) {
        el.callUp(0);
        el.tick(0.05);
        if (el.state === "DOOR_OPEN" && el.currentFloor === 0) reopenedAtZero = true;
        if (el.state === "DOOR_OPEN" && el.currentFloor === 3) openedAtThree = true;
    }
    assert.ok(!reopenedAtZero, "must not reopen at floor 0 while a rider destined for 3 is aboard");
    assert.ok(openedAtThree, "car must reach floor 3 before returning for the lobby call");
});

test("repeated hall-call pressing cannot starve riders", function () {
    const el = new ElevatorLogic({});
    el.callUp(0);
    assert.ok(runUntilDoorOpenAt(el, 0));
    boardRider(el, {}, 4);
    boardRider(el, {}, 5);
    let reached = false;
    let leftZero = false;
    for (let i = 0; i < 6000 && !reached; i++) {
        el.callUp(0);
        if (el.state === "MOVING" && el.position > 0.5) leftZero = true;
        if (el.state === "DOOR_OPEN" && (el.currentFloor === 4 || el.currentFloor === 5)) reached = true;
        if (!reached) el.tick(0.05);
    }
    assert.ok(leftZero, "car must leave floor 0 with riders aboard");
    assert.ok(reached, "car must reach a passenger destination despite call spam");
});

test("opposite-direction calls wait their turn", function () {
    const el = new ElevatorLogic({});
    el.callUp(3);
    assert.ok(tickUntil(el, function (e) { return e.state === "MOVING"; }));
    assert.strictEqual(el.targetFloor, 3);
    el.callDown(1);
    el.callDown(0);
    let servedThree = false;
    for (let i = 0; i < 400; i++) {
        assert.strictEqual(el.targetFloor, 3, "target must stay 3 while up work is pending");
        el.tick(0.05);
        if (el.state === "DOOR_OPEN" && el.currentFloor === 3) {
            servedThree = true;
            break;
        }
    }
    assert.ok(servedThree, "car must serve the up call at floor 3 first");
    assert.ok(runUntilDoorOpenAt(el, 1) || runUntilDoorOpenAt(el, 0), "down calls must be served after reversal");
});

test("door hold and MAX_DOOR_OPEN_S safety cap", function () {
    const el = new ElevatorLogic({});
    el.callUp(0);
    assert.ok(runUntilDoorOpenAt(el, 0));
    const ghost = {};
    const spot = el.reserveBoardingSpot(ghost);
    assert.ok(spot, "pending boarder must reserve a spot");
    for (let i = 0; i < 30; i++) el.tick(0.5);
    assert.strictEqual(el.state, "DOOR_OPEN", "doors must stay open while a boarder is pending");
    let closed = false;
    for (let i = 0; i < 200 && !closed; i++) {
        el.tick(0.5);
        if (el.state === "DOOR_CLOSING" || el.state === "IDLE" || el.state === "MOVING") closed = true;
    }
    assert.ok(closed, "doors must close via the MAX_DOOR_OPEN_S cap");

    const el2 = new ElevatorLogic({});
    el2.callUp(0);
    assert.ok(runUntilDoorOpenAt(el2, 0));
    const rider = {};
    boardRider(el2, rider, 2);
    assert.ok(runUntilDoorClosed(el2));
    assert.ok(runUntilDoorOpenAt(el2, 2));
    el2.registerDisembark(rider);
    for (let i = 0; i < 30; i++) el2.tick(0.5);
    assert.strictEqual(el2.state, "DOOR_OPEN", "doors must stay open while a disembarker is pending");
    el2.completeDisembark(rider);
    assert.strictEqual(el2.passengers.size, 0);
});

test("destination preserved across the action handshake (floor 0 to floor 5)", function () {
    const el = new ElevatorLogic({});
    el.callUp(0);
    assert.ok(runUntilDoorOpenAt(el, 0));
    assert.strictEqual(el.isAcceptingAt(0, 1), true, "car must accept UP boarders at lobby");
    const rider = {};
    const spot = el.reserveBoardingSpot(rider);
    assert.ok(spot);
    el.completeBoard(rider);
    el.pressDestination(5);
    assert.ok(runUntilDoorClosed(el));
    assert.strictEqual(el.targetFloor, 5, "target must be pressed floor 5, not floor + dir");
    assert.ok(runUntilDoorOpenAt(el, 5), "car must deliver rider to floor 5");
    el.registerDisembark(rider);
    el.completeDisembark(rider);
    assert.strictEqual(el.passengers.size, 0);
    assert.strictEqual(el.currentCapacityFree(), el.maxCapacity);
    const spot2 = el.reserveBoardingSpot({});
    assert.ok(spot2, "interior spot must be freed after disembark");
    assert.strictEqual(spot2.index, spot.index, "freed spot index must be reusable");
});

test("reset clears phantom state", function () {
    const el = new ElevatorLogic({});
    el.callUp(0);
    el.callDown(3);
    el.callUp(4);
    assert.ok(runUntilDoorOpenAt(el, 0));
    const r1 = {};
    const r2 = {};
    boardRider(el, r1, 4);
    boardRider(el, r2, 5);
    el.registerDisembark(r1);
    el.completeDisembark(r1);
    assert.ok(runUntilDoorClosed(el));
    el.reset();
    assert.strictEqual(el.state, "IDLE");
    assert.strictEqual(el.currentFloor, 0);
    assert.strictEqual(el.targetFloor, 0);
    assert.strictEqual(el.direction, 0);
    assert.strictEqual(el.position, 0);
    assert.strictEqual(el.upCalls.size, 0);
    assert.strictEqual(el.downCalls.size, 0);
    assert.strictEqual(el.destinations.size, 0);
    assert.strictEqual(el.passengers.size, 0);
    assert.strictEqual(el.pendingBoarders.size, 0);
    assert.strictEqual(el.pendingDisembark.size, 0);
    for (let i = 0; i < el.spotOccupancy.length; i++) {
        assert.strictEqual(el.spotOccupancy[i], null, "spot " + i + " must be cleared");
    }
    el.tick(1.0);
    assert.strictEqual(el.state, "IDLE", "reset car with no calls must stay idle");
    el.callUp(2);
    assert.ok(runUntilDoorOpenAt(el, 2), "reset car must serve fresh calls");
});

let failed = 0;
for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const line = (r.ok ? "PASS  " : "FAIL  ") + r.name + (r.ok ? "" : "  -- " + r.msg);
    console.log(line);
    if (!r.ok) failed += 1;
}
console.log(results.length + " tests, " + (results.length - failed) + " passed, " + failed + " failed");
if (failed > 0) process.exitCode = 1;
else console.log("ALL TESTS PASSED");
