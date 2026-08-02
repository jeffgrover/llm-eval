// elevator_logic_test.js - deterministic Node tests for the elevator logic
// Run with: node elevator_logic_test.js
const assert = require("assert");
const { ElevatorLogic } = require("./elevator_logic.js");

let failures = 0;
let passes = 0;
function ok(name, cond) {
    if (cond) { passes += 1; console.log("  PASS " + name); }
    else { failures += 1; console.log("  FAIL " + name); }
}

function tickUntil(el, predicate, maxIter) {
    maxIter = maxIter || 5000;
    let i = 0;
    while (i < maxIter) {
        el.tick(0.1);
        if (predicate()) return true;
        i += 1;
    }
    return false;
}

function runUntilDoorOpenAt(el, floor, maxIter) {
    return tickUntil(el, function () { return el.state === "DOOR_OPEN" && el.currentFloor === floor; }, maxIter);
}
function runUntilDoorClosed(el, maxIter) {
    return tickUntil(el, function () { return el.state === "DOOR_CLOSING" ? false : (el.state === "IDLE" || el.state === "MOVING"); } && el.state !== "DOOR_OPEN", maxIter);
}

// Person tokens for tracking
function makePeople(n) {
    const arr = [];
    for (let i = 0; i < n; i += 1) arr.push({ id: i });
    return arr;
}

// Test 1: Lobby rush with more callers than capacity
function testLobbyRush() {
    console.log("Test 1: Lobby rush with more callers than capacity");
    const el = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    const people = makePeople(6);
    el.callUp(0);
    ok("starts at floor 0", el.currentFloor === 0);
    // advance to door open at 0
    ok("door opens at 0", runUntilDoorOpenAt(el, 0));
    // board exactly 4
    for (let i = 0; i < 4; i += 1) {
        const spot = el.reserveBoardingSpot(people[i]);
        ok("spot reserved " + i, spot !== null);
        el.completeBoard(people[i]);
    }
    ok("capacity full now", el.currentCapacityFree() === 0);
    // 5th cannot board
    ok("5th rejected", el.reserveBoardingSpot(people[4]) === null);
    // press upper destinations
    el.pressDestination(3); el.pressDestination(4); el.pressDestination(5); el.pressDestination(2);
    // leftover callers re-press UP
    el.callUp(0);
    // close doors by completing pending (none pending now) and waiting min time
    ok("doors close", tickUntil(el, function () { return el.state === "MOVING" || el.state === "DOOR_CLOSING"; }, 2000));
    // After doors close, the next target must be above floor 0, not floor 0 again.
    // Let it pick target and start moving.
    ok("moves above 0", tickUntil(el, function () { return el.currentFloor > 0.1; }, 2000));
    ok("target above 0", el.targetFloor > 0);
}

// Test 2: Passenger destinations outrank same-floor hall calls
function testDestinationsOutrank() {
    console.log("Test 2: Passenger destinations outrank same-floor hall calls");
    const el = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    const people = makePeople(2);
    // Place car at floor 2 with a passenger destined for floor 4
    el.currentFloor = 2;
    el.passengers.add(people[0]);
    el.pressDestination(4);
    // Open doors at floor 2 (simulate arrival)
    el.state = "DOOR_OPEN"; el.doorOpenElapsed = 0; el.direction = 1;
    el.arrive();
    // Add a same-floor hall call (UP at floor 2)
    el.callUp(2);
    // Force door close by draining pending and advancing
    el.state = "DOOR_CLOSING"; el.doorTimer = 0;
    el.tick(0.7); // pass DOOR_CLOSING
    // After door close, pickTarget must choose floor 4, not reopen at 2
    ok("target is 4 not 2", el.targetFloor === 4 || (el.state === "MOVING" && el.targetFloor === 4));
    ok("not reopening at 2", !(el.state === "DOOR_OPENING" && el.currentFloor === 2));
}

// Test 3: Repeated hall-call pressing cannot starve riders
function testRepeatedCallStarvation() {
    console.log("Test 3: Repeated hall-call pressing cannot starve riders");
    const el = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    const people = makePeople(1);
    el.callUp(0);
    ok("door opens at 0", runUntilDoorOpenAt(el, 0));
    const spot = el.reserveBoardingSpot(people[0]);
    ok("boarded", spot !== null);
    el.completeBoard(people[0]);
    el.pressDestination(5);
    // Repeatedly callUp(0) across several ticks
    let reached = false;
    for (let i = 0; i < 4000; i += 1) {
        el.callUp(0);
        el.tick(0.1);
        if (el.currentFloor > 4.5 && el.state === "DOOR_OPEN") { reached = true; break; }
    }
    ok("reached floor 5 despite repeated callUp(0)", reached);
}

// Test 4: Opposite-direction calls wait their turn
function testOppositeDirection() {
    console.log("Test 4: Opposite-direction calls wait their turn");
    const el = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    const people = makePeople(1);
    // Car going up from floor 1 with destination 4
    el.currentFloor = 1;
    el.passengers.add(people[0]);
    el.pressDestination(4);
    el.direction = 1;
    el.targetFloor = 4;
    el.state = "MOVING";
    // Add a DOWN call at floor 1 (lower/current)
    el.callDown(1);
    // Tick; car should move up, not reverse to 1
    el.tick(0.5);
    ok("moved up not reversed", el.currentFloor > 1);
    ok("still heading up", el.direction === 1);
    // eventually reach 4
    ok("reaches 4", runUntilDoorOpenAt(el, 4, 3000));
}

// Test 5: Door hold and safety cap
function testDoorHoldAndCap() {
    console.log("Test 5: Door hold and safety cap");
    const el = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    const people = makePeople(1);
    el.callUp(0);
    ok("door opens at 0", runUntilDoorOpenAt(el, 0));
    // Register a disembark that never completes (holds doors)
    el.registerDisembark(people[0]);
    // After MIN_DOOR_OPEN_S, doors should stay open (pending non-empty)
    el.tick(el.MIN_DOOR_OPEN_S + 0.2);
    ok("doors held open while pending", el.state === "DOOR_OPEN");
    // After MAX_DOOR_OPEN_S total, doors close (safety cap)
    el.tick(el.MAX_DOOR_OPEN_S + 1);
    ok("doors closed by safety cap", el.state === "DOOR_CLOSING" || el.state === "MOVING" || el.state === "IDLE");
}

// Test 6: Destination preserved across action handshake (0 -> 5)
function testDestinationPreserved() {
    console.log("Test 6: Destination preserved across action handshake (0->5)");
    const el = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    const people = makePeople(1);
    // WAIT_AT_PANEL: press up call at 0, rider wants floor 5
    el.callUp(0);
    const toFloor = 5; // preserved through handshake
    ok("door opens at 0", runUntilDoorOpenAt(el, 0));
    // ENTER_ELEVATOR: reserve spot, complete board
    const spot = el.reserveBoardingSpot(people[0]);
    ok("spot reserved", spot !== null);
    el.completeBoard(people[0]);
    // PRESS_FLOOR: the exact destination (5), not direction+1
    el.pressDestination(toFloor);
    // WAIT_FOR_FLOOR: tick until door open at 5
    ok("reaches floor 5 (not 1)", runUntilDoorOpenAt(el, 5, 5000));
    ok("did not stop at floor 1 only", el.currentFloor === 5);
    // registerDisembark + completeDisembark
    el.registerDisembark(people[0]);
    el.completeDisembark(people[0]);
    ok("passenger removed", el.passengers.size === 0);
}

// Test 7: Reset clears phantom state
function testReset() {
    console.log("Test 7: Reset clears phantom state");
    const el = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    const people = makePeople(2);
    el.callUp(0); el.callDown(3); el.pressDestination(4);
    el.passengers.add(people[0]); el.passengers.add(people[1]);
    el.pendingBoarders.set(people[0], 0);
    el.pendingDisembark.add(people[1]);
    el.spotOccupancy[0] = people[0];
    el.direction = 1; el.targetFloor = 4; el.state = "MOVING";
    el.doorTimer = 2; el.doorOpenElapsed = 3; el.lastServedFloor = 2;
    el.reset();
    ok("calls cleared", el.upCalls.size === 0 && el.downCalls.size === 0);
    ok("destinations cleared", el.destinations.size === 0);
    ok("passengers cleared", el.passengers.size === 0);
    ok("pendingBoarders cleared", el.pendingBoarders.size === 0);
    ok("pendingDisembark cleared", el.pendingDisembark.size === 0);
    ok("spot occupancy cleared", el.spotOccupancy[0] === null && el.spotOccupancy[1] === null);
    ok("direction reset", el.direction === 0);
    ok("target reset", el.targetFloor === 0);
    ok("state idle at 0", el.state === "IDLE" && el.currentFloor === 0);
    ok("door timers reset", el.doorTimer === 0 && el.doorOpenElapsed === 0);
}

function main() {
    testLobbyRush();
    testDestinationsOutrank();
    testRepeatedCallStarvation();
    testOppositeDirection();
    testDoorHoldAndCap();
    testDestinationPreserved();
    testReset();
    console.log("\n==== " + passes + " passed, " + failures + " failed ====");
    process.exit(failures > 0 ? 1 : 0);
}

main();
