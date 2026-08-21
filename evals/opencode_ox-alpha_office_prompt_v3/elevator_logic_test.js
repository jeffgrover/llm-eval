const assert = require("assert");
const { ElevatorLogic } = require("./elevator_logic.js");

function tickUntil(el, predicate, maxTicks, dt) {
    const cap = maxTicks || 20000;
    const step = dt || 0.05;
    for (let i = 0; i < cap; i++) {
        if (predicate()) return true;
        el.tick(step);
    }
    return predicate();
}

function runUntilDoorOpenAt(el, floor, maxTicks, dt) {
    return tickUntil(el, function () {
        return el.state === "DOOR_OPEN" && el.currentFloor === floor;
    }, maxTicks, dt);
}

function runUntilDeparted(el, maxTicks, dt) {
    return tickUntil(el, function () {
        return el.state === "MOVING" || el.state === "IDLE";
    }, maxTicks, dt);
}

const tests = [];
function test(name, fn) {
    tests.push({ name: name, fn: fn });
}

test("lobby rush: full car leaves floor 0 for passenger destinations", function () {
    const el = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    el.callUp(0);
    assert.ok(runUntilDoorOpenAt(el, 0), "doors should open at floor 0");
    for (let i = 0; i < 4; i++) {
        const p = { id: "r" + i };
        const spot = el.reserveBoardingSpot(p);
        assert.ok(spot, "spot should be reserved for rider " + i);
        assert.ok(spot.index >= 0 && spot.index < 4, "spot index in range");
        el.pressDestination(i + 2);
        el.completeBoard(p);
    }
    assert.strictEqual(el.passengers.size, 4);
    assert.strictEqual(el.currentCapacityFree(), 0);
    el.callUp(0);
    assert.ok(runUntilDeparted(el), "car should close doors and depart");
    assert.strictEqual(el.state, "MOVING");
    assert.ok(el.targetFloor > 0, "next target must be above floor 0, got " + el.targetFloor);
    assert.ok(runUntilDoorOpenAt(el, 2), "car should reach floor 2");
    assert.strictEqual(el.currentFloor, 2);
});

test("passenger destinations outrank same-floor hall calls", function () {
    const el = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    el.callUp(0);
    assert.ok(runUntilDoorOpenAt(el, 0));
    const p1 = { id: "a" };
    const p2 = { id: "b" };
    assert.ok(el.reserveBoardingSpot(p1));
    assert.ok(el.reserveBoardingSpot(p2));
    el.completeBoard(p1);
    el.completeBoard(p2);
    el.pressDestination(4);
    el.callUp(0);
    assert.ok(runUntilDeparted(el), "doors should close");
    assert.strictEqual(el.state, "MOVING");
    assert.strictEqual(el.targetFloor, 4, "must not reopen at floor 0 while riders have destinations");
    assert.ok(runUntilDoorOpenAt(el, 4));
    assert.strictEqual(el.currentFloor, 4);
});

test("repeated hall-call pressing cannot starve riders", function () {
    const el = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    el.callUp(0);
    assert.ok(runUntilDoorOpenAt(el, 0));
    const p = { id: "s" };
    assert.ok(el.reserveBoardingSpot(p));
    el.pressDestination(3);
    el.completeBoard(p);
    let arrived = false;
    let ticks = 0;
    while (!arrived && ticks < 20000) {
        el.callUp(0);
        el.tick(0.05);
        ticks += 1;
        arrived = el.state === "DOOR_OPEN" && el.currentFloor === 3;
    }
    assert.ok(arrived, "car must reach floor 3 despite repeated UP calls at floor 0");
});

test("opposite-direction calls wait their turn", function () {
    const el = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    el.callUp(0);
    assert.ok(runUntilDoorOpenAt(el, 0));
    const p = { id: "u" };
    assert.ok(el.reserveBoardingSpot(p));
    el.pressDestination(4);
    el.completeBoard(p);
    el.callDown(0);
    assert.ok(runUntilDeparted(el));
    assert.strictEqual(el.state, "MOVING");
    assert.strictEqual(el.targetFloor, 4, "up destination outranks down call at current floor");
    el.callDown(2);
    let sawTwo = false;
    let reachedFour = false;
    let ticks = 0;
    while (!reachedFour && ticks < 20000) {
        el.tick(0.05);
        ticks += 1;
        if (el.state === "DOOR_OPEN" && el.currentFloor === 2) sawTwo = true;
        if (el.state === "DOOR_OPEN" && el.currentFloor === 4) reachedFour = true;
    }
    assert.ok(reachedFour, "car should open at floor 4 first");
    assert.ok(!sawTwo, "car must not stop at floor 2 down-call before serving upward destination");
    assert.ok(runUntilDoorOpenAt(el, 2), "after reversing, car should serve the floor 2 down call");
});

test("door hold for pending riders plus safety cap", function () {
    const el = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    el.callUp(0);
    assert.ok(runUntilDoorOpenAt(el, 0));
    const p = { id: "slow" };
    assert.ok(el.reserveBoardingSpot(p) !== null, "boarder reserves a spot");
    let closing = false;
    for (let i = 0; i < 100 && !closing; i++) {
        el.tick(0.05);
        closing = el.state === "DOOR_CLOSING";
    }
    assert.ok(!closing, "doors must stay open while a boarder is pending (5s < cap)");
    for (let i = 0; i < 200 && !closing; i++) {
        el.tick(0.05);
        closing = el.state === "DOOR_CLOSING";
    }
    assert.ok(closing, "MAX_DOOR_OPEN_S safety cap should eventually close the doors");

    const el2 = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    el2.callUp(0);
    assert.ok(runUntilDoorOpenAt(el2, 0));
    const q = { id: "q" };
    assert.ok(el2.reserveBoardingSpot(q));
    el2.completeBoard(q);
    el2.pressDestination(3);
    assert.ok(runUntilDoorOpenAt(el2, 3), "rider reaches floor 3");
    el2.registerDisembark(q);
    closing = false;
    for (let i = 0; i < 100 && !closing; i++) {
        el2.tick(0.05);
        closing = el2.state === "DOOR_CLOSING";
    }
    assert.ok(!closing, "doors must stay open while a disembarker is pending");
    el2.completeDisembark(q);
    assert.strictEqual(el2.passengers.size, 0);
    assert.ok(runUntilDeparted(el2), "doors close after disembarker completes");
});

test("destination preserved across the boarding handshake", function () {
    const el = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    el.callUp(0);
    assert.ok(runUntilDoorOpenAt(el, 0), "WAIT_AT_PANEL phase: doors open at 0");
    const rider = { id: "r5" };
    const spot = el.reserveBoardingSpot(rider);
    assert.ok(spot, "ENTER_ELEVATOR phase: spot reserved");
    el.pressDestination(5);
    el.completeBoard(rider);
    assert.ok(el.isAcceptingAt === undefined || true);
    assert.ok(runUntilDeparted(el), "doors close after boarding");
    assert.strictEqual(el.targetFloor, 5, "target must be the pressed floor 5, not floor+direction");
    let sawOne = false;
    let arrived = false;
    let ticks = 0;
    while (!arrived && ticks < 20000) {
        el.tick(0.05);
        ticks += 1;
        if (el.state === "DOOR_OPEN" && el.currentFloor === 1) sawOne = true;
        if (el.state === "DOOR_OPEN" && el.currentFloor === 5) arrived = true;
    }
    assert.ok(arrived, "WAIT_FOR_FLOOR: car must open at floor 5");
    assert.ok(!sawOne, "car must not stop at floor 1");
    assert.strictEqual(el.currentFloor, 5);
    el.registerDisembark(rider);
    el.completeDisembark(rider);
    assert.strictEqual(el.passengers.size, 0);
    assert.strictEqual(el.spotOccupancy[spot.index], null, "interior spot released after disembark");
});

test("reset clears phantom state", function () {
    const el = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    el.callUp(0);
    assert.ok(runUntilDoorOpenAt(el, 0));
    const p = { id: "z" };
    assert.ok(el.reserveBoardingSpot(p));
    el.completeBoard(p);
    el.pressDestination(3);
    el.callDown(4);
    el.callUp(2);
    const q = { id: "w" };
    el.registerDisembark(p);
    el.tick(0.5);
    el.reset();
    assert.strictEqual(el.upCalls.size, 0);
    assert.strictEqual(el.downCalls.size, 0);
    assert.strictEqual(el.destinations.size, 0);
    assert.strictEqual(el.passengers.size, 0);
    assert.strictEqual(el.pendingBoarders.size, 0);
    assert.strictEqual(el.pendingDisembark.size, 0);
    assert.strictEqual(el.direction, 0);
    assert.strictEqual(el.targetFloor, 0);
    assert.strictEqual(el.currentFloor, 0);
    assert.strictEqual(el.state, "IDLE");
    assert.strictEqual(el.carY, 0);
    assert.strictEqual(el.doorProgress, 0);
    assert.strictEqual(el.doorTimer, 0);
    assert.deepStrictEqual(el.spotOccupancy, [null, null, null, null]);
    assert.strictEqual(el.personSpot.size, 0);
    assert.strictEqual(el.lastServedFloor, -1);
});

test("capacity limit and acceptance direction rules", function () {
    const el = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    el.callUp(0);
    assert.ok(runUntilDoorOpenAt(el, 0));
    assert.strictEqual(el.isAcceptingAt(0, 1), true, "matching direction accepted");
    for (let i = 0; i < 4; i++) {
        const p = { id: "c" + i };
        assert.ok(el.reserveBoardingSpot(p) !== null, "reserve spot " + i);
        el.completeBoard(p);
    }
    assert.strictEqual(el.currentCapacityFree(), 0);
    assert.strictEqual(el.reserveBoardingSpot({ id: "overflow" }), null, "no spot when full");
    assert.strictEqual(el.isAcceptingAt(0, 1), false, "not accepting when full");
    el.pressDestination(4);
    assert.strictEqual(el.isAcceptingAt(0, -1), false, "opposite direction rejected while upward work remains");
    const el2 = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    el2.callUp(1);
    assert.ok(runUntilDoorOpenAt(el2, 1));
    assert.strictEqual(el2.isAcceptingAt(1, -1), true, "no further work: opposite direction accepted so caller can board before reverse");
});

let failed = 0;
for (const t of tests) {
    try {
        t.fn();
        console.log("PASS " + t.name);
    } catch (err) {
        failed += 1;
        console.log("FAIL " + t.name + ": " + (err && err.message ? err.message : err));
    }
}
console.log(failed === 0 ? "ALL TESTS PASSED (" + tests.length + ")" : failed + " TEST(S) FAILED out of " + tests.length);
process.exitCode = failed === 0 ? 0 : 1;
