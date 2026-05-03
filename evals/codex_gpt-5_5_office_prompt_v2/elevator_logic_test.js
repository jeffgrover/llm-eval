const assert = require("assert");
const { ElevatorLogic } = require("./elevator_logic.js");

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function tickUntil(e, pred, cap = 2000, dt = 0.1) {
    for (let i = 0; i < cap; i++) {
        e.tick(dt);
        if (typeof pred === "string" ? e.state === pred : pred(e)) return;
    }
    assert.fail("timed out waiting for condition");
}

function runUntilDoorOpenAt(e, floor) {
    tickUntil(e, x => x.state === "DOOR_OPEN" && x.currentFloor === floor, 3000);
}

function runUntilDoorClosed(e) {
    tickUntil(e, x => x.state === "MOVING" || x.state === "IDLE", 1000);
}

test("Lobby rush with more callers than capacity", () => {
    const e = new ElevatorLogic({ maxCapacity: 4 });
    e.callUp(0);
    runUntilDoorOpenAt(e, 0);
    const people = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
    people.forEach((p, i) => {
        assert(e.reserveBoardingSpot(p));
        e.completeBoard(p);
        e.pressDestination(i + 2);
    });
    for (let i = 0; i < 20; i++) {
        e.callUp(0);
        e.tick(0.1);
    }
    runUntilDoorClosed(e);
    assert.notStrictEqual(e.targetFloor, 0);
    assert(e.targetFloor > 0);
});

test("Passenger destinations outrank same-floor hall calls", () => {
    const e = new ElevatorLogic({ maxCapacity: 4 });
    e.state = "DOOR_OPEN";
    e.currentFloor = 0;
    e.direction = 1;
    const p = { id: 1 };
    e.reserveBoardingSpot(p);
    e.completeBoard(p);
    e.pressDestination(5);
    e.callUp(0);
    e.tick(e.MIN_DOOR_OPEN_S + 0.1);
    e.tick(e.DOOR_CLOSING_S + 0.1);
    assert.strictEqual(e.state, "MOVING");
    assert.strictEqual(e.targetFloor, 5);
});

test("Repeated hall-call pressing cannot starve riders", () => {
    const e = new ElevatorLogic({ maxCapacity: 4 });
    e.state = "DOOR_OPEN";
    e.currentFloor = 0;
    e.direction = 1;
    const p = { id: 1 };
    e.reserveBoardingSpot(p);
    e.completeBoard(p);
    e.pressDestination(3);
    let reached = false;
    for (let i = 0; i < 500; i++) {
        e.callUp(0);
        e.tick(0.1);
        if (e.currentFloor === 3 && (e.state === "DOOR_OPENING" || e.state === "DOOR_OPEN")) {
            reached = true;
            break;
        }
    }
    assert(reached);
});

test("Opposite-direction calls wait their turn", () => {
    const e = new ElevatorLogic();
    e.callUp(0);
    runUntilDoorOpenAt(e, 0);
    const p = { id: 1 };
    e.reserveBoardingSpot(p);
    e.completeBoard(p);
    e.pressDestination(5);
    runUntilDoorClosed(e);
    e.callDown(0);
    assert.strictEqual(e.direction, 1);
    assert.strictEqual(e.targetFloor, 5);
    runUntilDoorOpenAt(e, 5);
    assert.strictEqual(e.currentFloor, 5);
});

test("Door hold and safety cap", () => {
    const e = new ElevatorLogic({ minDoorOpenS: 1, maxDoorOpenS: 2 });
    e.callUp(0);
    runUntilDoorOpenAt(e, 0);
    const p = { id: 1 };
    assert(e.reserveBoardingSpot(p));
    e.tick(1.2);
    assert.strictEqual(e.state, "DOOR_OPEN");
    e.tick(1.0);
    assert.strictEqual(e.state, "DOOR_CLOSING");
});

test("Destination preserved across the action handshake", () => {
    const e = new ElevatorLogic();
    const rider = { id: "rider", toFloor: 5 };
    e.callUp(0);
    runUntilDoorOpenAt(e, 0);
    assert(e.isAcceptingAt(0, 1));
    assert(e.reserveBoardingSpot(rider));
    e.completeBoard(rider);
    e.pressDestination(rider.toFloor);
    runUntilDoorClosed(e);
    assert.strictEqual(e.targetFloor, 5);
    runUntilDoorOpenAt(e, 5);
    assert.strictEqual(e.currentFloor, 5);
});

test("Reset clears phantom state", () => {
    const e = new ElevatorLogic();
    const p = { id: 1 };
    e.callUp(2);
    e.callDown(4);
    e.pressDestination(5);
    e.reserveBoardingSpot(p);
    e.completeBoard(p);
    e.registerDisembark(p);
    e.direction = 1;
    e.targetFloor = 5;
    e.state = "DOOR_OPEN";
    e.doorTimer = 3;
    e.reset();
    assert.strictEqual(e.state, "IDLE");
    assert.strictEqual(e.direction, 0);
    assert.strictEqual(e.currentFloor, 0);
    assert.strictEqual(e.targetFloor, null);
    assert.strictEqual(e.doorTimer, 0);
    assert.strictEqual(e.upCalls.size, 0);
    assert.strictEqual(e.downCalls.size, 0);
    assert.strictEqual(e.destinations.size, 0);
    assert.strictEqual(e.passengers.size, 0);
    assert.strictEqual(e.pendingBoarders.size, 0);
    assert.strictEqual(e.pendingDisembark.size, 0);
    assert.strictEqual(e.spotOccupancy.size, 0);
});

let passed = 0;
for (const t of tests) {
    try {
        t.fn();
        passed++;
        console.log("PASS", t.name);
    } catch (err) {
        console.error("FAIL", t.name);
        console.error(err && err.stack ? err.stack : err);
    }
}
console.log(`${passed}/${tests.length} tests passed`);
if (passed !== tests.length) process.exit(1);
