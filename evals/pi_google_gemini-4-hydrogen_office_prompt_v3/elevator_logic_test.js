const assert = require("assert");
const { ElevatorLogic } = require("./elevator_logic.js");

function makeLogic() {
    return new ElevatorLogic({ floorCount: 6, maxCapacity: 4, floorHeight: 3.4 });
}

function tickUntil(logic, predicate, maxSteps, dt) {
    const stepDt = dt !== undefined ? dt : 0.05;
    const cap = maxSteps !== undefined ? maxSteps : 2000;
    for (let i = 0; i < cap; i++) {
        if (predicate(logic)) return i;
        logic.tick(stepDt);
    }
    throw new Error("tickUntil exceeded maxSteps (" + cap + "), state=" + logic.state + " floor=" + logic.currentFloor + " target=" + logic.targetFloor);
}

function runUntilDoorOpenAt(logic, floor, maxSteps) {
    return tickUntil(logic, (el) => el.state === "DOOR_OPEN" && el.currentFloor === floor, maxSteps);
}

function runUntilDoorClosed(logic, maxSteps) {
    return tickUntil(logic, (el) => el.state !== "DOOR_OPENING" && el.state !== "DOOR_OPEN" && el.state !== "DOOR_CLOSING", maxSteps);
}

const tests = [];
function test(name, fn) {
    tests.push({ name, fn });
}

test("1. Lobby rush with more callers than capacity", () => {
    const el = makeLogic();
    el.callUp(0);
    runUntilDoorOpenAt(el, 0);

    const riders = ["w0", "w1", "w2", "w3"];
    const dests = [2, 3, 4, 5];
    for (let i = 0; i < riders.length; i++) {
        const spot = el.reserveBoardingSpot(riders[i]);
        assert(spot !== null, "Expected boarding spot for rider " + i);
        el.completeBoard(riders[i]);
        el.pressDestination(dests[i]);
    }
    assert.strictEqual(el.currentCapacityFree(), 0);
    assert.strictEqual(el.reserveBoardingSpot("w4"), null, "5th rider must be rejected");

    // Leftover lobby callers re-press UP while doors are open and closing
    el.callUp(0);
    tickUntil(el, (e) => e.state === "DOOR_CLOSING");
    el.callUp(0);
    runUntilDoorClosed(el);

    assert.strictEqual(el.state, "MOVING", "Car should move after doors close");
    assert(el.targetFloor > 0, "Next target must be above floor 0, got " + el.targetFloor);
    assert(el.upCalls.has(0), "Leftover floor 0 UP call must remain queued for next trip");
});

test("2. Passenger destinations outrank same-floor hall calls", () => {
    const el = makeLogic();
    el.callUp(0);
    runUntilDoorOpenAt(el, 0);

    el.reserveBoardingSpot("p1");
    el.completeBoard("p1");
    el.pressDestination(4);

    // Add same-floor hall calls in both directions
    el.callUp(0);
    el.callDown(0);

    runUntilDoorClosed(el);
    assert.strictEqual(el.state, "MOVING");
    assert.strictEqual(el.targetFloor, 4);
});

test("3. Repeated hall-call pressing cannot starve riders", () => {
    const el = makeLogic();
    el.callUp(0);
    runUntilDoorOpenAt(el, 0);

    for (let i = 0; i < 4; i++) {
        el.reserveBoardingSpot("r" + i);
        el.completeBoard("r" + i);
    }
    el.pressDestination(3);
    el.pressDestination(5);

    // Spam callUp(0) every tick for 200 ticks
    let reachedDest = false;
    for (let t = 0; t < 200; t++) {
        el.callUp(0);
        el.tick(0.05);
        if (el.state === "DOOR_OPEN" && el.currentFloor === 3) {
            reachedDest = true;
            break;
        }
    }
    assert(reachedDest, "Car must reach passenger destination 3 despite repeated callUp(0)");
});

test("4. Opposite-direction calls wait their turn", () => {
    const el = makeLogic();
    el.callUp(0);
    runUntilDoorOpenAt(el, 0);
    el.reserveBoardingSpot("p1");
    el.completeBoard("p1");
    el.pressDestination(5);

    runUntilDoorClosed(el);
    assert.strictEqual(el.state, "MOVING");
    assert.strictEqual(el.direction, 1);

    // Move partway up and issue a down call at floor 1 and floor 0
    for (let i = 0; i < 15; i++) el.tick(0.05);
    el.callDown(1);
    el.callDown(0);

    // Must arrive at floor 5 before reversing
    runUntilDoorOpenAt(el, 5);
    assert.strictEqual(el.currentFloor, 5);
    el.registerDisembark("p1");
    el.completeDisembark("p1");

    // Now it should reverse and serve floor 1
    runUntilDoorOpenAt(el, 1);
    assert.strictEqual(el.currentFloor, 1);
});

test("5. Door hold and safety cap", () => {
    const el = makeLogic();
    el.callUp(0);
    runUntilDoorOpenAt(el, 0);

    // Reserve a boarder who never completes boarding
    const spot = el.reserveBoardingSpot("slowpoke");
    assert(spot !== null);

    // Advance past MIN_DOOR_OPEN_S (1.2s) -> doors must remain open
    for (let i = 0; i < 40; i++) el.tick(0.05); // 2.0s
    assert.strictEqual(el.state, "DOOR_OPEN", "Doors must stay open while pendingBoarders is non-empty");

    // Advance past MAX_DOOR_OPEN_S (8.0s) -> safety cap must close doors
    tickUntil(el, (e) => e.state === "DOOR_CLOSING", 200, 0.05);
    assert.strictEqual(el.state, "DOOR_CLOSING");
});

test("6. Destination preserved across the action handshake", () => {
    const el = makeLogic();
    // Simulate WAIT_AT_PANEL(0, +1, 5) -> ENTER_ELEVATOR(5) -> PRESS_FLOOR(5) -> WAIT_FOR_FLOOR(5)
    const rider = { name: "Alice", toFloor: 5 };
    el.callUp(0);
    runUntilDoorOpenAt(el, 0);
    assert(el.isAcceptingAt(0, 1));

    const spot = el.reserveBoardingSpot(rider);
    assert(spot !== null);
    el.completeBoard(rider);
    el.pressDestination(rider.toFloor);

    // Must not stop at floor 1
    let stoppedAt1 = false;
    tickUntil(el, (e) => {
        if (e.state === "DOOR_OPEN" && e.currentFloor === 1) stoppedAt1 = true;
        return e.state === "DOOR_OPEN" && e.currentFloor === 5;
    }, 500, 0.05);
    assert.strictEqual(stoppedAt1, false, "Must not treat target as floor 1");
    assert.strictEqual(el.currentFloor, 5);
});

test("7. Reset clears phantom state", () => {
    const el = makeLogic();
    el.callUp(0);
    runUntilDoorOpenAt(el, 0);
    el.reserveBoardingSpot("p1");
    el.completeBoard("p1");
    el.reserveBoardingSpot("p2");
    el.pressDestination(4);
    el.callDown(3);
    el.registerDisembark("p1");

    el.reset();

    assert.strictEqual(el.state, "IDLE");
    assert.strictEqual(el.direction, 0);
    assert.strictEqual(el.currentFloor, 0);
    assert.strictEqual(el.carY, 0);
    assert.strictEqual(el.targetFloor, 0);
    assert.strictEqual(el.doorProgress, 0);
    assert.strictEqual(el.doorTimer, 0);
    assert.strictEqual(el.upCalls.size, 0);
    assert.strictEqual(el.downCalls.size, 0);
    assert.strictEqual(el.destinations.size, 0);
    assert.strictEqual(el.passengers.size, 0);
    assert.strictEqual(el.pendingBoarders.size, 0);
    assert.strictEqual(el.pendingDisembark.size, 0);
    assert.strictEqual(el.spotAssignments.size, 0);
    assert(el.spotOccupancy.every((s) => s === null));
});

let passed = 0;
let failed = 0;
for (const t of tests) {
    try {
        t.fn();
        console.log("PASS: " + t.name);
        passed++;
    } catch (err) {
        console.error("FAIL: " + t.name);
        console.error(err && err.stack ? err.stack : err);
        failed++;
    }
}

console.log("\nSummary: " + passed + " passed, " + failed + " failed");
if (failed > 0) {
    process.exit(1);
}
