/**
 * elevator_logic_test.js
 * Deterministic tests for ElevatorLogic with zero external dependencies.
 */
const assert = require("assert");
const { ElevatorLogic } = require("./elevator_logic.js");

function tickUntil(logic, predicate, maxTicks = 1000, dt = 0.1) {
    for (let i = 0; i < maxTicks; i++) {
        if (predicate(logic)) return i;
        logic.tick(dt);
    }
    throw new Error(`tickUntil timed out after ${maxTicks} ticks (state=${logic.state}, floor=${logic.currentFloor}, target=${logic.targetFloor})`);
}

function runUntilDoorOpenAt(logic, floor, maxTicks = 1000, dt = 0.1) {
    tickUntil(logic, l => l.state === "DOOR_OPEN" && l.currentFloor === floor, maxTicks, dt);
}

function runUntilDoorClosed(logic, maxTicks = 1000, dt = 0.1) {
    tickUntil(logic, l => l.state === "IDLE" || l.state === "MOVING", maxTicks, dt);
}

const tests = [];
function test(name, fn) {
    tests.push({ name, fn });
}

// 1. Lobby rush with more callers than capacity
test("1. Lobby rush with more callers than capacity", () => {
    const el = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    el.callUp(0);
    runUntilDoorOpenAt(el, 0);

    // Board 4 people
    const p1 = { id: 1, to: 3 };
    const p2 = { id: 2, to: 4 };
    const p3 = { id: 3, to: 2 };
    const p4 = { id: 4, to: 5 };

    assert(el.reserveBoardingSpot(p1) !== null);
    assert(el.reserveBoardingSpot(p2) !== null);
    assert(el.reserveBoardingSpot(p3) !== null);
    assert(el.reserveBoardingSpot(p4) !== null);

    el.completeBoard(p1);
    el.completeBoard(p2);
    el.completeBoard(p3);
    el.completeBoard(p4);

    el.pressDestination(3);
    el.pressDestination(4);
    el.pressDestination(2);
    el.pressDestination(5);

    // Leftover caller tries to call up at floor 0
    const p5 = { id: 5, to: 2 };
    assert.strictEqual(el.reserveBoardingSpot(p5), null, "Car should be full");
    el.callUp(0);

    // Wait until doors close and car picks next target
    runUntilDoorClosed(el);

    assert(el.targetFloor > 0, `Next target should be above floor 0, got ${el.targetFloor}`);
    assert.strictEqual(el.direction, 1, "Direction should be UP");
});

// 2. Passenger destinations outrank same-floor hall calls
test("2. Passenger destinations outrank same-floor hall calls", () => {
    const el = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    el.callUp(0);
    runUntilDoorOpenAt(el, 0);

    const rider = { id: 10, to: 4 };
    el.reserveBoardingSpot(rider);
    el.completeBoard(rider);
    el.pressDestination(4);

    // Close doors
    runUntilDoorClosed(el);

    // While moving or closing, a callUp(0) arrives
    el.callUp(0);

    // Advance 5 ticks
    for (let i = 0; i < 5; i++) el.tick(0.1);

    // Must be moving up toward 4, not reopening at 0
    assert.notStrictEqual(el.targetFloor, 0, "Target must not be floor 0");
    assert(el.direction === 1 || el.state === "MOVING", "Car must proceed towards passenger destination");
});

// 3. Repeated hall-call pressing cannot starve riders
test("3. Repeated hall-call pressing cannot starve riders", () => {
    const el = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    el.callUp(0);
    runUntilDoorOpenAt(el, 0);

    const rider = { id: 100, to: 3 };
    el.reserveBoardingSpot(rider);
    el.completeBoard(rider);
    el.pressDestination(3);

    // Run until door is closed
    runUntilDoorClosed(el);

    // Repeatedly press callUp(0) every tick
    let reachedDestination = false;
    for (let i = 0; i < 300; i++) {
        el.callUp(0);
        el.tick(0.1);
        if (el.currentFloor === 3 && el.state === "DOOR_OPEN") {
            reachedDestination = true;
            break;
        }
    }

    assert(reachedDestination, "Car must reach destination floor 3 despite repeated floor 0 calls");
});

// 4. Opposite-direction calls wait their turn
test("4. Opposite-direction calls wait their turn", () => {
    const el = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    el.callUp(1);
    runUntilDoorOpenAt(el, 1);

    const rider = { id: 200, to: 5 };
    el.reserveBoardingSpot(rider);
    el.completeBoard(rider);
    el.pressDestination(5);
    runUntilDoorClosed(el);

    // When moving UP between floor 2 and 3, someone calls DOWN at floor 2
    for (let i = 0; i < 5; i++) el.tick(0.1);
    el.callDown(2);

    // Car must continue up to 5 before serving floor 2 down
    runUntilDoorOpenAt(el, 5);
    assert.strictEqual(el.currentFloor, 5, "Car must serve upward destination 5 first");
});

// 5. Door hold and safety cap
test("5. Door hold and safety cap", () => {
    const el = new ElevatorLogic({ floorCount: 6, minDoorOpenTime: 1.5, maxDoorOpenTime: 8.0 });
    el.callUp(0);
    runUntilDoorOpenAt(el, 0);

    const slowRider = { id: 300, to: 2 };
    el.reserveBoardingSpot(slowRider);

    // After 2.0s (> minDoorOpenTime 1.5s), doors must stay open because pendingBoarders is not empty
    for (let i = 0; i < 20; i++) el.tick(0.1);
    assert.strictEqual(el.state, "DOOR_OPEN", "Doors must stay open while pendingBoarder is boarding");

    // After 8.1s (> maxDoorOpenTime 8.0s), safety cap forces doors to close
    for (let i = 0; i < 62; i++) el.tick(0.1);
    assert.strictEqual(el.state, "DOOR_CLOSING", "Doors must force close after maxDoorOpenTime");

    // After closing finishes (doorMoveDuration 0.8s), car becomes IDLE
    for (let i = 0; i < 15; i++) el.tick(0.1);
    assert.strictEqual(el.state, "IDLE", "Doors should finish closing");
});

// 6. Destination preserved across the action handshake
test("6. Destination preserved across the action handshake", () => {
    const el = new ElevatorLogic({ floorCount: 6 });
    const targetFloor = 5;

    // WAIT_AT_PANEL
    el.callUp(0);
    runUntilDoorOpenAt(el, 0);

    // ENTER_ELEVATOR
    const rider = { id: 400, to: targetFloor };
    const spot = el.reserveBoardingSpot(rider);
    assert(spot !== null, "Spot reserved");
    el.completeBoard(rider);

    // PRESS_FLOOR
    el.pressDestination(rider.to);
    assert(el.destinations.has(5), "Destination 5 must be registered in elevator logic");

    // WAIT_FOR_FLOOR
    runUntilDoorOpenAt(el, 5);
    assert.strictEqual(el.currentFloor, 5, "Car must arrive at floor 5");

    el.registerDisembark(rider);
    el.completeDisembark(rider);
    assert.strictEqual(el.passengers.size, 0, "Passenger disembarked");
});

// 7. Reset clears phantom state
test("7. Reset clears phantom state", () => {
    const el = new ElevatorLogic({ floorCount: 6 });
    el.callUp(1);
    el.callDown(3);
    el.pressDestination(4);
    const p = { id: 500 };
    el.reserveBoardingSpot(p);
    el.registerDisembark({ id: 501 });

    el.reset();

    assert.strictEqual(el.state, "IDLE");
    assert.strictEqual(el.currentFloor, 0);
    assert.strictEqual(el.targetFloor, 0);
    assert.strictEqual(el.direction, 0);
    assert.strictEqual(el.doorOpenFraction, 0);
    assert.strictEqual(el.upCalls.size, 0);
    assert.strictEqual(el.downCalls.size, 0);
    assert.strictEqual(el.destinations.size, 0);
    assert.strictEqual(el.passengers.size, 0);
    assert.strictEqual(el.pendingBoarders.size, 0);
    assert.strictEqual(el.pendingDisembark.size, 0);
    assert(el.spotOccupancy.every(s => s === null), "Spot occupancy must be completely cleared");
});

// Run all tests
let passed = 0;
let failed = 0;
console.log("Running ElevatorLogic unit tests...");

for (const { name, fn } of tests) {
    try {
        fn();
        console.log(`  [PASS] ${name}`);
        passed++;
    } catch (err) {
        console.error(`  [FAIL] ${name}`);
        console.error(`         ${err.message}`);
        failed++;
    }
}

console.log(`\nSummary: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
    process.exit(1);
} else {
    process.exit(0);
}
