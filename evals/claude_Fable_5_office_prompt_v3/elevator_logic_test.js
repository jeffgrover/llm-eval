// elevator_logic_test.js - deterministic Node tests for ElevatorLogic.
// Run: node elevator_logic_test.js

const assert = require("assert");
const { ElevatorLogic } = require("./elevator_logic.js");

const DT = 0.1;
const MAX_TICKS = 5000;

function tickUntil(ev, predicate, maxTicks) {
    const cap = maxTicks || MAX_TICKS;
    for (let i = 0; i < cap; i++) {
        if (predicate(ev)) { return i; }
        ev.tick(DT);
    }
    throw new Error("tickUntil: predicate not satisfied within " + cap + " ticks " +
        "(state=" + ev.state + " floor=" + ev.currentFloor + ")");
}

function runUntilDoorOpenAt(ev, floor) {
    return tickUntil(ev, function(e) {
        return e.state === "DOOR_OPEN" && e.currentFloor === floor;
    });
}

function runUntilDoorClosed(ev) {
    return tickUntil(ev, function(e) {
        return e.doorProgress === 0 && (e.state === "IDLE" || e.state === "MOVING");
    });
}

const results = [];
function test(name, fn) {
    try {
        fn();
        results.push({ name: name, pass: true });
        console.log("PASS  " + name);
    } catch (err) {
        results.push({ name: name, pass: false, err: err });
        console.log("FAIL  " + name);
        console.log("      " + err.message);
    }
}

// 1. Lobby rush with more callers than capacity.
test("lobby rush: full car leaves floor 0 instead of reopening", function() {
    const ev = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    ev.callUp(0);
    runUntilDoorOpenAt(ev, 0);
    const riders = ["r1", "r2", "r3", "r4"];
    riders.forEach(function(rider) {
        const spot = ev.reserveBoardingSpot(rider);
        assert.ok(spot, "expected a boarding spot for " + rider);
    });
    assert.strictEqual(ev.reserveBoardingSpot("r5"), null, "5th rider must be rejected");
    riders.forEach(function(rider) { ev.completeBoard(rider); });
    ev.pressDestination(3);
    ev.pressDestination(5);
    // Leftover lobby waiters keep pressing UP while doors close.
    for (let i = 0; i < 60; i++) {
        ev.callUp(0);
        ev.tick(DT);
    }
    tickUntil(ev, function(e) { return e.state === "MOVING"; });
    assert.ok(ev.targetFloor > 0, "next target must be above floor 0, got " + ev.targetFloor);
    runUntilDoorOpenAt(ev, 3);
    assert.strictEqual(ev.currentFloor, 3);
});

// 2. Passenger destinations outrank same-floor hall calls.
test("passenger destinations outrank same-floor hall calls", function() {
    const ev = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    ev.callUp(0);
    runUntilDoorOpenAt(ev, 0);
    const spot = ev.reserveBoardingSpot("p1");
    assert.ok(spot);
    ev.completeBoard("p1");
    ev.pressDestination(4);
    ev.callUp(0); // same-floor hall call from a straggler
    runUntilDoorClosed(ev);
    let reopenedAt0 = false;
    for (let i = 0; i < 400; i++) {
        ev.callUp(0);
        ev.tick(DT);
        if (ev.state === "DOOR_OPENING" && ev.currentFloor === 0) { reopenedAt0 = true; }
        if (ev.state === "DOOR_OPEN" && ev.currentFloor === 4) { break; }
    }
    assert.strictEqual(reopenedAt0, false, "car reopened at floor 0 while rider had destination 4");
    assert.strictEqual(ev.currentFloor, 4, "rider never reached floor 4");
});

// 3. Repeated hall-call pressing cannot starve riders.
test("repeated callUp(0) cannot starve riders", function() {
    const ev = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    ev.callUp(0);
    runUntilDoorOpenAt(ev, 0);
    ev.reserveBoardingSpot("p1");
    ev.completeBoard("p1");
    ev.pressDestination(5);
    let reached = false;
    for (let i = 0; i < 2000; i++) {
        ev.callUp(0); // spam every tick
        ev.tick(DT);
        if (ev.state === "DOOR_OPEN" && ev.currentFloor === 5) { reached = true; break; }
    }
    assert.ok(reached, "car never reached passenger destination 5 under call spam");
});

// 4. Opposite-direction calls wait their turn.
test("down call does not reverse an upbound car with work above", function() {
    const ev = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    ev.callUp(0);
    runUntilDoorOpenAt(ev, 0);
    ev.reserveBoardingSpot("p1");
    ev.completeBoard("p1");
    ev.pressDestination(5);
    runUntilDoorClosed(ev);
    tickUntil(ev, function(e) { return e.state === "MOVING"; }, 200);
    // While rising past floor ~1-2, a DOWN call appears at floor 1.
    tickUntil(ev, function(e) { return e.currentFloor >= 2; });
    ev.callDown(1);
    const order = [];
    for (let i = 0; i < 3000; i++) {
        ev.tick(DT);
        if (ev.state === "DOOR_OPEN") {
            if (order.length === 0 || order[order.length - 1] !== ev.currentFloor) {
                order.push(ev.currentFloor);
            }
            if (order.indexOf(5) >= 0 && order.indexOf(1) >= 0) { break; }
        }
    }
    assert.ok(order.indexOf(5) >= 0, "never served floor 5");
    assert.ok(order.indexOf(1) >= 0, "never served down call at floor 1");
    assert.ok(order.indexOf(5) < order.indexOf(1),
        "served the opposite-direction call first: " + order.join(","));
});

// 5. Door hold and safety cap.
test("doors hold for pending boarders, then close at MAX_DOOR_OPEN_S", function() {
    const ev = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    ev.callUp(0);
    runUntilDoorOpenAt(ev, 0);
    const spot = ev.reserveBoardingSpot("slowpoke");
    assert.ok(spot);
    // Well past MIN open time, doors must remain open (pending boarder).
    const pastMin = Math.ceil((ev.MIN_DOOR_OPEN_S + 1.0) / DT);
    for (let i = 0; i < pastMin; i++) { ev.tick(DT); }
    assert.strictEqual(ev.state, "DOOR_OPEN", "doors closed while a boarder was pending");
    // But the safety cap eventually forces a close even if never completed.
    const pastMax = Math.ceil((ev.MAX_DOOR_OPEN_S + 2.0) / DT);
    for (let i = 0; i < pastMax; i++) { ev.tick(DT); }
    assert.notStrictEqual(ev.state, "DOOR_OPEN", "safety cap never fired");
    assert.strictEqual(ev.pendingBoarders.size, 0, "pending boarder not cleared by cap");
});

// 6. Destination preserved across the action handshake (0 -> 5).
test("destination floor 5 survives WAIT->ENTER->PRESS->WAIT handshake", function() {
    const ev = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    // WAIT_AT_PANEL(floor=0, dir=+1, toFloor=5)
    const rider = { toFloor: 5 };
    ev.callUp(0);
    runUntilDoorOpenAt(ev, 0);
    assert.ok(ev.isAcceptingAt(0, 1));
    // ENTER_ELEVATOR(toFloor=5)
    const spot = ev.reserveBoardingSpot(rider);
    assert.ok(spot);
    ev.completeBoard(rider);
    // PRESS_FLOOR uses the carried toFloor, never floor+dir.
    ev.pressDestination(rider.toFloor);
    assert.ok(ev.destinations.has(5), "destination 5 not registered");
    assert.ok(!ev.destinations.has(1), "destination wrongly inferred as floor 1");
    // WAIT_FOR_FLOOR(5)
    runUntilDoorOpenAt(ev, 5);
    assert.strictEqual(ev.currentFloor, 5);
    let openedAt1 = false;
    // (verified via arrival above; also assert it never stopped at 1 with doors open)
    const ev2 = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    ev2.callUp(0);
    runUntilDoorOpenAt(ev2, 0);
    ev2.reserveBoardingSpot(rider);
    ev2.completeBoard(rider);
    ev2.pressDestination(rider.toFloor);
    for (let i = 0; i < 3000; i++) {
        ev2.tick(DT);
        if (ev2.state === "DOOR_OPEN" && ev2.currentFloor === 1) { openedAt1 = true; }
        if (ev2.state === "DOOR_OPEN" && ev2.currentFloor === 5) { break; }
    }
    assert.strictEqual(openedAt1, false, "car stopped at floor 1 without any call there");
});

// 7. Reset clears phantom state.
test("reset() clears phantom state", function() {
    const ev = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    ev.callUp(0);
    runUntilDoorOpenAt(ev, 0);
    ev.reserveBoardingSpot("a");
    ev.completeBoard("a");
    ev.reserveBoardingSpot("b");
    ev.pressDestination(4);
    ev.callUp(2);
    ev.callDown(3);
    ev.registerDisembark("a");
    ev.reset();
    assert.strictEqual(ev.upCalls.size, 0);
    assert.strictEqual(ev.downCalls.size, 0);
    assert.strictEqual(ev.destinations.size, 0);
    assert.strictEqual(ev.passengers.size, 0);
    assert.strictEqual(ev.pendingBoarders.size, 0);
    assert.strictEqual(ev.pendingDisembark.size, 0);
    assert.strictEqual(ev.direction, 0);
    assert.strictEqual(ev.targetFloor, null);
    assert.strictEqual(ev.currentFloor, 0);
    assert.strictEqual(ev.y, 0);
    assert.strictEqual(ev.doorProgress, 0);
    assert.strictEqual(ev.doorOpenTimer, 0);
    assert.strictEqual(ev.state, "IDLE");
    for (let i = 0; i < ev.spotOccupancy.length; i++) {
        assert.strictEqual(ev.spotOccupancy[i], null, "spot " + i + " not released");
    }
    // Post-reset sanity: the machine still works.
    ev.callUp(2);
    runUntilDoorOpenAt(ev, 2);
});

// ---- summary ----
const failed = results.filter(function(r) { return !r.pass; });
console.log("\n" + (results.length - failed.length) + "/" + results.length + " tests passed" +
    (failed.length ? "  (" + failed.length + " FAILED)" : ""));
process.exit(failed.length ? 1 : 0);
