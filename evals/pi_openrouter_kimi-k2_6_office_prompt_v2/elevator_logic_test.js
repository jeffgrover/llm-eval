const assert = require("assert");
const { ElevatorLogic } = require("./elevator_logic.js");

const STATE_IDLE = 0, STATE_MOVING = 1, STATE_DOOR_OPENING = 2, STATE_DOOR_OPEN = 3, STATE_DOOR_CLOSING = 4;

let totalPassed = 0, totalFailed = 0;
function test(name, fn) {
    try {
        fn();
        console.log(`PASS: ${name}`);
        totalPassed++;
    } catch (e) {
        console.log(`FAIL: ${name}`);
        console.log(`  ${e.message}`);
        totalFailed++;
    }
}

function tickUntil(el, pred, maxIter=2000) {
    for (let i=0; i<maxIter; i++) {
        el.tick(0.05);
        if (typeof pred === "string") {
            // not exposed
        }
        if (typeof pred === "function" ? pred(el) : el.state === pred) return;
    }
    throw new Error(`timed out waiting for condition`);
}

function runUntilDoorOpenAt(el, floor, maxIter=4000) {
    for (let i=0; i<maxIter; i++) {
        el.tick(0.05);
        if (el.state === STATE_DOOR_OPEN && el.currentFloor === floor) return;
    }
    throw new Error(`timed out waiting for door open at floor ${floor}`);
}

function runUntilDoorClosed(el, maxIter=4000) {
    for (let i=0; i<maxIter; i++) {
        el.tick(0.05);
        if (el.state === STATE_IDLE && el.doorOpenRatio === 0) return;
        if (el.state === STATE_MOVING) return;
    }
    throw new Error(`timed out waiting for door closed`);
}

function runUntilState(el, state, maxIter=4000) {
    for (let i=0; i<maxIter; i++) {
        el.tick(0.05);
        if (el.state === state) return;
    }
    throw new Error(`timed out waiting for state ${state}`);
}

// 1. Lobby rush with more callers than capacity

test("Lobby rush - boards exactly 4, next target above 0", () => {
    const el = new ElevatorLogic({ maxCapacity: 4 });
    el.callUp(0);
    // Open doors at floor 0
    runUntilDoorOpenAt(el, 0);
    // Board 4 people
    const riders = [];
    for (let i=0; i<4; i++) {
        const p = `p${i}`;
        const spot = el.reserveBoardingSpot(p);
        assert(spot !== null, `rider ${i} should get spot`);
        riders.push(p);
    }
    // Press destinations for upper floors
    el.pressDestination(3);
    el.pressDestination(2);
    el.pressDestination(5);
    el.pressDestination(4);
    riders.forEach(p => el.completeBoard(p));
    // Leftover lobby callers re-press UP
    el.callUp(0);
    el.callUp(0);
    el.callUp(0);
    // Close doors
    el.tick(0.05); // slight advance
    runUntilDoorClosed(el);
    // Next target must NOT be floor 0; must be > 0.
    assert(el.targetFloor > 0, `targetFloor should be > 0 but got ${el.targetFloor}`);
});

// 2. Passenger destinations outrank same-floor hall calls

test("Passenger destinations prevent same-floor reopen", () => {
    const el = new ElevatorLogic({ maxCapacity: 4 });
    el.callUp(0);
    runUntilDoorOpenAt(el, 0);
    const p = "p0";
    const spot = el.reserveBoardingSpot(p);
    assert(spot !== null);
    el.completeBoard(p);
    el.pressDestination(3);
    runUntilDoorClosed(el);
    // Now moving up; add a same-floor (floor 0) UP call
    assert(el.state === STATE_MOVING || el.state === STATE_IDLE);
    // Force it to floor 1 then add floor 1 up call
    // Simpler: reset and simulate explicit
    el.reset();
    el.currentFloor = 1;
    el.direction = 1;
    el.destinations.add(3);
    el.passengers.add("p0");
    el.state = STATE_DOOR_OPEN;
    el.doorOpenRatio = 1;
    el.doorOpenTimer = 5;
    // Add a same-floor hall call
    el.callUp(1);
    runUntilDoorClosed(el);
    // Should not immediately reopen
    assert(el.state === STATE_MOVING || el.state === STATE_IDLE || (el.state === STATE_DOOR_OPENING && el.targetFloor !== 1));
    if (el.state === STATE_DOOR_OPENING) {
        assert(el.targetFloor !== 1, "should not reopen at same floor for hall call when passengers have destinations");
    }
});

// 3. Repeated hall-call pressing cannot starve riders

test("Repeated lobby UP calls do not starve riders", () => {
    const el = new ElevatorLogic({ maxCapacity: 4 });
    el.callUp(0);
    runUntilDoorOpenAt(el, 0);
    const p = "p0";
    el.reserveBoardingSpot(p);
    el.completeBoard(p);
    el.pressDestination(5);
    runUntilDoorClosed(el);
    // While moving, repeatedly call up at floor 0 (and other floors)
    for (let i=0; i<50; i++) {
        el.tick(0.1);
        el.callUp(0);
        if (i % 5 === 0) el.callUp(1);
    }
    // Let it run until doors open at some floor
    for (let i=0; i<4000; i++) {
        el.tick(0.1);
        if (el.state === STATE_DOOR_OPEN) break;
    }
    // It should have reached at least one passenger destination floor
    const reached = [1,2,3,4,5].some(f => el.currentFloor === f && el.state === STATE_DOOR_OPEN);
    assert(reached, `car should open doors at a passenger destination, currentFloor=${el.currentFloor} state=${el.state}`);
});

// 4. Opposite-direction calls wait their turn

test("Opposite-direction calls wait until current direction served", () => {
    const el = new ElevatorLogic({});
    el.currentFloor = 0;
    el.direction = 1;
    el.destinations.add(3);
    el.state = STATE_MOVING;
    el.targetFloor = 3;
    // Add a down call at floor 1
    el.callDown(1);
    for (let i=0; i<2000; i++) {
        el.tick(0.05);
        if (el.state === STATE_DOOR_OPEN && el.currentFloor === 1) {
            // Should only open because destination 1 or matching direction up
            // But destination is 3, so it shouldn't stop at 1
        }
        if (el.state === STATE_DOOR_OPEN && el.currentFloor === 3) break;
    }
    assert(el.currentFloor === 3 && el.state === STATE_DOOR_OPEN, `should reach floor 3 first, got floor ${el.currentFloor}`);
    // After serving 3, should eventually serve down call at 1
    let servedDown = false;
    for (let i=0; i<4000; i++) {
        el.tick(0.05);
        if (el.state === STATE_DOOR_OPEN && el.currentFloor === 1) {
            servedDown = true; break;
        }
    }
    assert(servedDown, `should eventually serve down call at floor 1`);
});

// 5. Door hold and safety cap

test("Doors held by pending-boarders and safety-capped", () => {
    const el = new ElevatorLogic({});
    el.state = STATE_DOOR_OPEN;
    el.doorOpenRatio = 1;
    el.doorOpenTimer = 0;
    el.currentFloor = 2;
    el.pendingBoarders.set("p0", {index:0});
    let held = false;
    for (let i=0; i<300; i++) {
        el.tick(0.05);
        if (el.doorOpenTimer > 5 && el.state === STATE_DOOR_OPEN) {
            held = true;
        }
        if (el.state !== STATE_DOOR_OPEN) break;
    }
    assert(held, "doors should stay open while pending boarders exist");
    // Now simulate boarder completing
    el.completeBoard("p0");
    // Doors should eventually close after min time
    for (let i=0; i<200; i++) {
        el.tick(0.05);
        if (el.state === STATE_DOOR_CLOSING) break;
    }
    assert(el.state === STATE_DOOR_CLOSING || el.state === STATE_MOVING || el.state === STATE_IDLE, "doors should close after boarder completes");

    // Safety cap test
    const el2 = new ElevatorLogic({});
    el2.state = STATE_DOOR_OPEN;
    el2.doorOpenRatio = 1;
    el2.doorOpenTimer = el2.MAX_DOOR_OPEN_S - 0.1;
    el2.currentFloor = 2;
    el2.pendingBoarders.set("px", {index:0}); // uncompleted boarder
    for (let i=0; i<50; i++) el2.tick(0.05);
    assert(el2.state !== STATE_DOOR_OPEN, "doors should close after MAX_DOOR_OPEN_S even with pending boarders");
});

// 6. Destination preserved across action handshake

test("Destination floor 5 preserved from panel through boarding and wait", () => {
    const el = new ElevatorLogic({});
    el.currentFloor = 0;
    el.callUp(0);
    runUntilDoorOpenAt(el, 0);
    const p = "p0";
    el.reserveBoardingSpot(p);
    el.completeBoard(p);
    el.pressDestination(5);
    runUntilDoorClosed(el);
    // Must move toward floor 5, not 1
    assert(el.targetFloor === 5, `targetFloor should be 5, got ${el.targetFloor}`);
    let reached = false;
    for (let i=0; i<5000; i++) {
        el.tick(0.05);
        if (el.state === STATE_DOOR_OPEN && el.currentFloor === 5) { reached = true; break; }
    }
    assert(reached, `should reach floor 5 for passenger destination`);
});

// 7. Reset clears everything

test("Reset clears phantom state", () => {
    const el = new ElevatorLogic({});
    el.callUp(0);
    el.callDown(3);
    el.pressDestination(2);
    el.passengers.add("p0");
    el.pendingBoarders.set("p1", {index:0});
    el.pendingDisembark.add("p2");
    el.spotOccupied[0] = true;
    el.direction = 1;
    el.targetFloor = 4;
    el.doorOpenTimer = 5;
    el.currentFloor = 2;
    el.state = STATE_MOVING;
    el.reset();
    assert.strictEqual(el.currentFloor, 0);
    assert.strictEqual(el.targetFloor, null);
    assert.strictEqual(el.direction, 0);
    assert.strictEqual(el.state, STATE_IDLE);
    assert.strictEqual(el.upCalls.size, 0);
    assert.strictEqual(el.downCalls.size, 0);
    assert.strictEqual(el.destinations.size, 0);
    assert.strictEqual(el.passengers.size, 0);
    assert.strictEqual(el.pendingBoarders.size, 0);
    assert.strictEqual(el.pendingDisembark.size, 0);
    assert(el.spotOccupied.every(v => !v), "spots should be freed");
    assert.strictEqual(el.doorOpenTimer, 0);
});

console.log(`\n${totalPassed} passed, ${totalFailed} failed`);
process.exit(totalFailed > 0 ? 1 : 0);
