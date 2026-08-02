const assert = require("assert");
const { ElevatorLogic, STATE } = require("./elevator_logic.js");

var testsPassed = 0;
var testsFailed = 0;

function runTest(name, fn) {
    try {
        fn();
        testsPassed++;
        console.log("  PASS: " + name);
    } catch (e) {
        testsFailed++;
        console.log("  FAIL: " + name + " - " + e.message);
    }
}

function tickUntil(el, pred, maxTicks) {
    maxTicks = maxTicks || 5000;
    for (var i = 0; i < maxTicks; i++) {
        el.tick(0.05);
        if (pred(el)) return i;
    }
    throw new Error("tickUntil: predicate not satisfied within " + maxTicks + " ticks. state=" + el.getState() + " floor=" + el.currentFloor + " dir=" + el.direction);
}

function runUntilDoorOpenAt(el, floor) {
    return tickUntil(el, function(e) {
        return e.getState() === STATE.DOOR_OPEN && e.currentFloor === floor;
    });
}

function runUntilDoorClosed(el) {
    return tickUntil(el, function(e) {
        return e.getState() === STATE.IDLE || e.getState() === STATE.MOVING;
    });
}

function runUntilIdle(el) {
    return tickUntil(el, function(e) {
        return e.getState() === STATE.IDLE;
    }, 20000);
}

// Test 1: Lobby rush with more callers than capacity
function testLobbyRush() {
    var el = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    // 8 people call up from floor 0
    el.callUp(0);
    el.callUp(0);
    el.callUp(0);
    el.callUp(0);
    el.callUp(0);
    el.callUp(0);
    el.callUp(0);
    el.callUp(0);

    // Open doors at 0
    runUntilDoorOpenAt(el, 0);
    assert.strictEqual(el.currentFloor, 0, "should be at floor 0");

    // Board 4 people with destinations
    var p1 = el.reserveBoardingSpot("p1"); assert.ok(p1, "p1 should board");
    el.completeBoard("p1");
    el.pressDestination(3);
    var p2 = el.reserveBoardingSpot("p2"); assert.ok(p2, "p2 should board");
    el.completeBoard("p2");
    el.pressDestination(4);
    var p3 = el.reserveBoardingSpot("p3"); assert.ok(p3, "p3 should board");
    el.completeBoard("p3");
    el.pressDestination(5);
    var p4 = el.reserveBoardingSpot("p4"); assert.ok(p4, "p4 should board");
    el.completeBoard("p4");
    el.pressDestination(2);

    // Capacity should be full now
    assert.strictEqual(el.currentCapacityFree(), 0, "capacity should be 0");

    // Leftover lobby callers re-press UP
    // These should remain queued
    el.callUp(0);

    // Close doors
    runUntilDoorClosed(el);

    // Now the car should be moving, not reopening at floor 0
    assert.strictEqual(el.getState(), STATE.MOVING, "should be moving after door close");
    assert.ok(el.currentFloor >= 0, "should be moving");
    assert.ok(el.targetFloor > 0, "target should be above floor 0, got " + el.targetFloor);

    // Car should reach at least one destination
    runUntilDoorOpenAt(el, 2);
    assert.ok(true, "car reached floor 2");
}

// Test 2: Passenger destinations outrank same-floor hall calls
function testDestinationsOutrankHallCalls() {
    var el = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    el.callUp(0);
    runUntilDoorOpenAt(el, 0);

    // Board one passenger going to floor 5
    var s = el.reserveBoardingSpot("p1");
    assert.ok(s);
    el.completeBoard("p1");
    el.pressDestination(5);

    // Add a same-floor UP call at 0
    el.callUp(0);

    // Close doors
    runUntilDoorClosed(el);
    assert.strictEqual(el.getState(), STATE.MOVING, "should be moving");

    // The car should go to floor 5, not reopen at 0
    runUntilDoorOpenAt(el, 5);
    assert.strictEqual(el.currentFloor, 5, "car should arrive at floor 5");
}

// Test 3: Repeated hall-call pressing cannot starve riders
function testNoStarvation() {
    var el = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    el.callUp(0);
    runUntilDoorOpenAt(el, 0);

    var s = el.reserveBoardingSpot("p1");
    assert.ok(s);
    el.completeBoard("p1");
    el.pressDestination(4);

    // Repeatedly press UP at floor 0
    for (var i = 0; i < 200; i++) {
        el.callUp(0);
    }

    runUntilDoorClosed(el);

    // Car should still reach floor 4
    runUntilDoorOpenAt(el, 4);
    assert.strictEqual(el.currentFloor, 4, "car should reach passenger destination");
}

// Test 4: Opposite-direction calls wait their turn
function testOppositeDirectionWaits() {
    var el = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    // Someone at floor 0 going up
    el.callUp(0);
    runUntilDoorOpenAt(el, 0);

    var s = el.reserveBoardingSpot("p1");
    assert.ok(s);
    el.completeBoard("p1");
    el.pressDestination(5);

    // Someone at floor 2 calls DOWN
    el.callDown(2);

    runUntilDoorClosed(el);

    // Car should go up, not reverse for the down call
    runUntilDoorOpenAt(el, 5);
    assert.strictEqual(el.currentFloor, 5, "car should reach floor 5 first");

    // After serving floor 5, passenger leaves
    el.registerDisembark("p1");
    el.completeDisembark("p1");

    // Then car should handle the down call at 2
    // It will need to go down to 2
    runUntilDoorOpenAt(el, 2);
    assert.strictEqual(el.currentFloor, 2, "car should now reach floor 2 for down call");
}

// Test 5: Door hold and safety cap
function testDoorHoldAndSafetyCap() {
    var el = new ElevatorLogic({ floorCount: 6, maxCapacity: 4, MIN_DOOR_OPEN_S: 1.0, MAX_DOOR_OPEN_S: 3.0 });
    el.callUp(0);
    runUntilDoorOpenAt(el, 0);

    // Reserve but don't complete - doors stay open
    var s = el.reserveBoardingSpot("p1");
    assert.ok(s);
    assert.strictEqual(el.pendingBoarderCount, 1, "pending boarder should exist");

    // The safety cap MAX_DOOR_OPEN_S should fire, causing a door cycle.
    // After the cycle, the doors reopen because the boarder is still pending.
    // Track the door open duration to detect a cycle.
    var prevDuration = el.doorOpenDuration;
    var sawClosing = false;
    for (var i = 0; i < 500; i++) {
        el.tick(0.05);
        if (el.getState() === STATE.DOOR_CLOSING) sawClosing = true;
    }
    // The safety cap should have triggered a door close at some point
    assert.ok(sawClosing, "safety cap should have triggered a door close cycle");
    // The pending boarder should still be present
    assert.strictEqual(el.pendingBoarderCount, 1, "pending boarder should remain");
    // The doors should be open again (reopened for pending boarder)
    // or in the process of opening
    var st = el.getState();
    assert.ok(st === STATE.DOOR_OPEN || st === STATE.DOOR_OPENING,
        "doors should be open/opening for pending boarder, got " + st);
}

// Test 6: Destination preserved across action handshake
function testDestinationPreserved() {
    var el = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    // Simulate: WAIT_AT_PANEL -> ENTER_ELEVATOR -> PRESS_FLOOR -> WAIT_FOR_FLOOR
    el.callUp(0);
    runUntilDoorOpenAt(el, 0);

    // ENTER_ELEVATOR
    var s = el.reserveBoardingSpot("rider");
    assert.ok(s);
    el.completeBoard("rider");

    // PRESS_FLOOR(5) - the destination
    el.pressDestination(5);

    // WAIT_FOR_FLOOR(5) - verify the car has floor 5 as a destination
    var calls = el.getCalls();
    assert.ok(calls.destinations.indexOf(5) >= 0, "destination 5 should be present");

    // Close doors and verify the car targets floor 5, not floor 1
    runUntilDoorClosed(el);
    assert.strictEqual(el.targetFloor, 5, "target should be floor 5, not " + el.targetFloor);

    // Car should reach floor 5
    runUntilDoorOpenAt(el, 5);
    assert.strictEqual(el.currentFloor, 5, "car should arrive at floor 5");
}

// Test 7: Reset clears phantom state
function testReset() {
    var el = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    el.callUp(0);
    el.callDown(3);
    el.pressDestination(5);
    el.reserveBoardingSpot("p1");
    el.completeBoard("p1");

    el.reset();

    assert.strictEqual(el.getState(), STATE.IDLE, "state should be IDLE");
    assert.strictEqual(el.direction, 0, "direction should be 0");
    assert.strictEqual(el.currentFloor, 0, "floor should be 0");
    assert.strictEqual(el.passengerCount, 0, "passengers should be 0");
    assert.strictEqual(el.pendingBoarderCount, 0, "pending boarders should be 0");
    assert.strictEqual(el.pendingDisembarkCount, 0, "pending disembark should be 0");
    assert.strictEqual(Object.keys(el.upCalls).length, 0, "upCalls should be empty");
    assert.strictEqual(Object.keys(el.downCalls).length, 0, "downCalls should be empty");
    assert.strictEqual(Object.keys(el.destinations).length, 0, "destinations should be empty");
    assert.strictEqual(el.spotOccupancy.filter(function(x) { return x !== false; }).length, 0, "spots should be empty");
}

// Run tests
console.log("Running elevator logic tests...\n");
runTest("Test 1: Lobby rush with more callers than capacity", testLobbyRush);
runTest("Test 2: Passenger destinations outrank same-floor hall calls", testDestinationsOutrankHallCalls);
runTest("Test 3: Repeated hall-call pressing cannot starve riders", testNoStarvation);
runTest("Test 4: Opposite-direction calls wait their turn", testOppositeDirectionWaits);
runTest("Test 5: Door hold and safety cap", testDoorHoldAndSafetyCap);
runTest("Test 6: Destination preserved across action handshake", testDestinationPreserved);
runTest("Test 7: Reset clears phantom state", testReset);

console.log("\n" + (testsPassed + testsFailed) + " tests: " + testsPassed + " passed, " + testsFailed + " failed");
if (testsFailed > 0) {
    process.exit(1);
}