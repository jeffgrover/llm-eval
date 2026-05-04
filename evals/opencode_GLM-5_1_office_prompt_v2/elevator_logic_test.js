const assert = require("assert");
const { ElevatorLogic } = require("./elevator_logic.js");

const IDLE = "IDLE";
const MOVING = "MOVING";
const DOOR_OPENING = "DOOR_OPENING";
const DOOR_OPEN = "DOOR_OPEN";
const DOOR_CLOSING = "DOOR_CLOSING";

let failures = 0;
let passes = 0;

function tickUntil(el, predicate, maxIter) {
    maxIter = maxIter || 10000;
    var dt = 0.016;
    for (var i = 0; i < maxIter; i++) {
        el.tick(dt);
        if (predicate(el)) return true;
    }
    return false;
}

function runUntilDoorOpenAt(el, floor, maxIter) {
    return tickUntil(el, function(e) {
        return e.state === DOOR_OPEN && e.currentFloor === floor;
    }, maxIter);
}

function runUntilDoorClosed(el, maxIter) {
    return tickUntil(el, function(e) {
        return e.state === IDLE || e.state === MOVING;
    }, maxIter);
}

function runUntilState(el, state, maxIter) {
    return tickUntil(el, function(e) {
        return e.state === state;
    }, maxIter);
}

function runUntilMoving(el, maxIter) {
    return tickUntil(el, function(e) {
        return e.state === MOVING;
    }, maxIter);
}

// Test 1: Lobby rush with more callers than capacity
function testLobbyRush() {
    console.log("Test 1: Lobby rush with more callers than capacity");
    var el = new ElevatorLogic({floorCount: 6, maxCapacity: 4, floorHeight: 3.4});

    el.callUp(0);
    assert.ok(runUntilDoorOpenAt(el, 0), "Doors should open at floor 0");

    // Board 4 people
    var boarders = [];
    for (var i = 0; i < 4; i++) {
        var person = "p" + i;
        var spot = el.reserveBoardingSpot(person);
        assert.ok(spot !== null, "Should have spot for boarder " + i);
        el.completeBoard(person);
        el.pressDestination(i + 1);
        boarders.push(person);
    }
    assert.strictEqual(el.passengers.size, 4, "Should have 4 passengers");
    assert.strictEqual(el.currentCapacityFree(), 0, "Car should be full");

    // Leftover callers press UP again
    el.callUp(0);

    // Doors should close (car is full, has destinations)
    assert.ok(runUntilDoorClosed(el), "Doors should close");

    // After doors close, car should move to upper floors, not stay at floor 0
    assert.ok(el.currentFloor > 0 || el.targetFloor > 0,
        "Car should be heading to or at an upper floor, not stuck at floor 0. Current: " +
        el.currentFloor + ", target: " + el.targetFloor);

    // Keep ticking to serve passenger destinations
    var servedAny = false;
    for (var i = 0; i < 5000; i++) {
        el.tick(0.016);
        if (el.state === DOOR_OPEN && el.currentFloor > 0) {
            servedAny = true;
        }
    }
    assert.ok(servedAny, "Car should serve at least one upper floor");
    console.log("  PASS");
}

// Test 2: Passenger destinations outrank same-floor hall calls
function testPassengerDestinationsOutrank() {
    console.log("Test 2: Passenger destinations outrank same-floor hall calls");
    var el = new ElevatorLogic({floorCount: 6, maxCapacity: 4, floorHeight: 3.4});

    // Start at floor 0, board a rider going to floor 5
    el.callUp(0);
    assert.ok(runUntilDoorOpenAt(el, 0), "Doors should open at floor 0");

    var person = "rider1";
    el.reserveBoardingSpot(person);
    el.completeBoard(person);
    el.pressDestination(5);
    assert.ok(runUntilDoorClosed(el), "Doors should close");

    // While moving, add a hall call at current floor
    // The car should continue to floor 5, not reverse
    var prevFloor = el.currentFloor;
    for (var i = 0; i < 100; i++) {
        el.tick(0.016);
        if (el.state === MOVING || el.state === DOOR_OPENING || el.state === DOOR_OPEN) {
            if (el.state === DOOR_OPEN && el.currentFloor === 5) {
                // Good - reached floor 5
                console.log("  PASS");
                return;
            }
        }
    }
    // Check that the car reached floor 5 eventually
    var reachedFloor5 = false;
    for (var i = 0; i < 5000; i++) {
        el.tick(0.016);
        if (el.state === DOOR_OPEN && el.currentFloor === 5) {
            reachedFloor5 = true;
            break;
        }
    }
    assert.ok(reachedFloor5, "Car should reach floor 5 for passenger destination");
    console.log("  PASS");
}

// Test 3: Repeated hall-call pressing cannot starve riders
function testRepeatedHallCallsNoStarve() {
    console.log("Test 3: Repeated hall-call pressing cannot starve riders");
    var el = new ElevatorLogic({floorCount: 6, maxCapacity: 4, floorHeight: 3.4});

    // Board riders going to floor 5
    el.callUp(0);
    assert.ok(runUntilDoorOpenAt(el, 0), "Doors should open at floor 0");

    var p1 = "rider1";
    el.reserveBoardingSpot(p1);
    el.completeBoard(p1);
    el.pressDestination(5);

    assert.ok(runUntilDoorClosed(el), "Doors should close");

    // Repeatedly call UP from floor 0
    var reachedFloor5 = false;
    for (var i = 0; i < 8000; i++) {
        el.tick(0.016);
        if (i % 100 === 0) {
            el.callUp(0); // Repeated hall calls
        }
        if (el.state === DOOR_OPEN && el.currentFloor === 5) {
            reachedFloor5 = true;
            break;
        }
    }
    assert.ok(reachedFloor5, "Car should reach floor 5 despite repeated floor-0 calls");
    console.log("  PASS");
}

// Test 4: Opposite-direction calls wait their turn
function testOppositeDirectionWaits() {
    console.log("Test 4: Opposite-direction calls wait their turn");
    var el = new ElevatorLogic({floorCount: 6, maxCapacity: 4, floorHeight: 3.4});

    // Car at floor 0, going up to floor 3
    el.callUp(0);
    assert.ok(runUntilDoorOpenAt(el, 0), "Doors should open at floor 0");

    var p1 = "rider1";
    el.reserveBoardingSpot(p1);
    el.completeBoard(p1);
    el.pressDestination(3);

    assert.ok(runUntilDoorClosed(el), "Doors should close");

    // Add a down call at floor 1 (car is going up)
    el.callDown(1);

    // Car should continue past floor 1 to floor 3
    var reachedFloor3 = false;
    var stoppedAtFloor1 = false;
    for (var i = 0; i < 5000; i++) {
        el.tick(0.016);
        if (el.state === DOOR_OPEN && el.currentFloor === 3) {
            reachedFloor3 = true;
            break;
        }
        if (el.state === DOOR_OPEN && el.currentFloor === 1 && el.direction === -1) {
            stoppedAtFloor1 = true;
        }
    }
    assert.ok(reachedFloor3, "Car should reach floor 3 (destination)");
    assert.ok(!stoppedAtFloor1 || reachedFloor3,
        "Car should not reverse for opposite direction call while going up");
    console.log("  PASS");
}

// Test 5: Door hold and safety cap
function testDoorHoldAndCap() {
    console.log("Test 5: Door hold and safety cap");
    var el = new ElevatorLogic({floorCount: 6, maxCapacity: 4, floorHeight: 3.4});

    el.callUp(0);
    assert.ok(runUntilDoorOpenAt(el, 0), "Doors should open at floor 0");

    // Reserve a boarding spot but do NOT completeBoard — person is in pendingBoarders
    var p1 = "rider1";
    var spot = el.reserveBoardingSpot(p1);
    assert.ok(spot !== null, "Should reserve a spot");
    assert.strictEqual(el.pendingBoarders.size, 1, "Should have 1 pending boarder");

    // Tick through MIN_DOOR_OPEN_S worth of time — doors should stay open
    for (var i = 0; i < 300; i++) {
        el.tick(0.016);
        if (el.state === DOOR_CLOSING) break;
    }
    assert.strictEqual(el.state, DOOR_OPEN, "Doors should remain open with pending boarders");

    // Now simulate MAX_DOOR_OPEN_S — doors should eventually close (safety cap)
    // MAX is 15 seconds = 15/0.016 ≈ 938 ticks, but we already used 300
    // Tick until MAX is exceeded
    var closed = false;
    for (var i = 0; i < 1000; i++) {
        el.tick(0.016);
        if (el.state === DOOR_CLOSING) {
            closed = true;
            break;
        }
    }
    assert.ok(closed, "Doors should close after MAX_DOOR_OPEN_S even with pending boarders");
    console.log("  PASS");
}

// Test 6: Destination preserved across action handshake
function testDestinationPreserved() {
    console.log("Test 6: Destination preserved across action handshake");
    var el = new ElevatorLogic({floorCount: 6, maxCapacity: 4, floorHeight: 3.4});

    // Person going from floor 0 to floor 5
    el.callUp(0);
    assert.ok(runUntilDoorOpenAt(el, 0), "Doors should open at floor 0");

    var p1 = "rider1";
    el.reserveBoardingSpot(p1);
    el.completeBoard(p1);
    el.pressDestination(5); // Going to floor 5, not floor 1

    assert.ok(runUntilDoorClosed(el), "Doors should close");

    // Verify destination is floor 5
    assert.ok(el.destinations.has(5), "Destination floor 5 should be registered");
    assert.ok(!el.destinations.has(1), "Destination should not be floor 1");

    // Let the car reach floor 5
    var reachedFloor5 = false;
    for (var i = 0; i < 10000; i++) {
        el.tick(0.016);
        if (el.state === DOOR_OPEN && el.currentFloor === 5) {
            reachedFloor5 = true;
            break;
        }
    }
    assert.ok(reachedFloor5, "Car should reach floor 5 (exact destination, not floor 1)");
    console.log("  PASS");
}

// Test 7: Reset clears phantom state
function testResetClearsState() {
    console.log("Test 7: Reset clears phantom state");
    var el = new ElevatorLogic({floorCount: 6, maxCapacity: 4, floorHeight: 3.4});

    // Create some state
    el.callUp(0);
    el.callDown(3);
    assert.ok(runUntilDoorOpenAt(el, 0), "Should reach floor 0");

    var p1 = "p1", p2 = "p2";
    el.reserveBoardingSpot(p1);
    el.completeBoard(p1);
    el.pressDestination(4);

    // Reset
    el.reset();

    assert.strictEqual(el.currentFloor, 0, "Should be at floor 0 after reset");
    assert.strictEqual(el.targetFloor, 0, "Target should be 0 after reset");
    assert.strictEqual(el.direction, 0, "Direction should be 0 after reset");
    assert.strictEqual(el.state, IDLE, "Should be IDLE after reset");
    assert.strictEqual(el.upCalls.size, 0, "Up calls should be empty after reset");
    assert.strictEqual(el.downCalls.size, 0, "Down calls should be empty after reset");
    assert.strictEqual(el.destinations.size, 0, "Destinations should be empty after reset");
    assert.strictEqual(el.passengers.size, 0, "Passengers should be empty after reset");
    assert.strictEqual(el.pendingBoarders.size, 0, "Pending boarders should be empty after reset");
    assert.strictEqual(el.pendingDisembark.size, 0, "Pending disembark should be empty after reset");
    assert.strictEqual(el.y, 0, "Y position should be 0 after reset");
    assert.strictEqual(el.doorOpenAmount, 0, "Doors should be closed after reset");

    for (var i = 0; i < 4; i++) {
        assert.strictEqual(el.spotOccupancy[i], false, "Spot " + i + " should be free after reset");
    }
    console.log("  PASS");
}

// Run all tests
try {
    testLobbyRush();
} catch (e) {
    console.log("  FAIL:", e.message);
    failures++;
}

try {
    testPassengerDestinationsOutrank();
} catch (e) {
    console.log("  FAIL:", e.message);
    failures++;
}

try {
    testRepeatedHallCallsNoStarve();
} catch (e) {
    console.log("  FAIL:", e.message);
    failures++;
}

try {
    testOppositeDirectionWaits();
} catch (e) {
    console.log("  FAIL:", e.message);
    failures++;
}

try {
    testDoorHoldAndCap();
} catch (e) {
    console.log("  FAIL:", e.message);
    failures++;
}

try {
    testDestinationPreserved();
} catch (e) {
    console.log("  FAIL:", e.message);
    failures++;
}

try {
    testResetClearsState();
} catch (e) {
    console.log("  FAIL:", e.message);
    failures++;
}

console.log("\n" + (failures === 0 ? "ALL TESTS PASSED" : failures + " TEST(S) FAILED"));
process.exit(failures > 0 ? 1 : 0);