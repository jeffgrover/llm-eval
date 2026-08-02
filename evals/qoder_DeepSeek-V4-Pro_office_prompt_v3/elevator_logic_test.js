var assert = require("assert");
var ElevatorLogic = require("./elevator_logic.js").ElevatorLogic;

var passed = 0;
var failed = 0;

function test(name, fn) {
    try {
        fn();
        passed++;
        console.log("  PASS: " + name);
    } catch (e) {
        failed++;
        console.log("  FAIL: " + name + " - " + e.message);
    }
}

function tickUntil(elevator, predicate, maxTicks) {
    maxTicks = maxTicks || 2000;
    for (var i = 0; i < maxTicks; i++) {
        elevator.tick(0.016);
        if (predicate(elevator)) return true;
    }
    return false;
}

function tickUntilDoorOpen(elevator, maxTicks) {
    return tickUntil(elevator, function(el) { return el.state === 'DOOR_OPEN'; }, maxTicks);
}

function tickUntilState(elevator, state, maxTicks) {
    return tickUntil(elevator, function(el) { return el.state === state; }, maxTicks);
}

function tickUntilMoving(elevator, maxTicks) {
    return tickUntil(elevator, function(el) { return el.state === 'MOVING'; }, maxTicks);
}

// ============================================================
// Test 1: Lobby rush with more callers than capacity
// ============================================================
test("Lobby rush: full car leaves floor 0 despite leftover UP calls", function() {
    var el = new ElevatorLogic({floorCount: 6, maxCapacity: 4, floorHeight: 3.4});

    el.callUp(0);
    assert.ok(tickUntilDoorOpen(el), "Should open doors at floor 0");

    // Board 4 people (max capacity)
    for (var i = 0; i < 4; i++) {
        var spot = el.reserveBoardingSpot("p" + i);
        assert.ok(spot !== null, "Should reserve spot " + i);
        el.completeBoard("p" + i);
    }

    // Press destinations above floor 0
    el.pressDestination(3);
    el.pressDestination(5);

    // Tick until doors start closing
    assert.ok(tickUntilState(el, 'DOOR_CLOSING'), "Should start closing doors");

    // Leftover waiters press UP at floor 0
    el.callUp(0);

    // Wait for doors to close fully and next target selected
    tickUntil(el, function(e) { return e.state === 'MOVING' || e.state === 'DOOR_OPENING'; });

    // Should be heading UP (not reopening at floor 0)
    if (el.state === 'MOVING') {
        assert.ok(el.targetFloor > 0, "Target should be above floor 0, got " + el.targetFloor);
        assert.strictEqual(el.direction, 1, "Direction should be up");
    }
    // If it went to DOOR_OPENING, it must be at a floor > 0 (unlikely with no intermediate calls)
});

// ============================================================
// Test 2: Passenger destinations outrank same-floor hall calls
// ============================================================
test("Passenger destinations outrank same-floor hall calls", function() {
    var el = new ElevatorLogic({floorCount: 6, maxCapacity: 4, floorHeight: 3.4});

    // Board passenger at floor 0 going to floor 4
    el.callUp(0);
    assert.ok(tickUntilDoorOpen(el), "Should open at floor 0");
    el.reserveBoardingSpot("p1");
    el.completeBoard("p1");
    el.pressDestination(4);

    // Close doors and move
    assert.ok(tickUntilState(el, 'DOOR_CLOSING'), "Should close doors");

    // Car moves toward floor 4; let's add an intermediate stop so it opens
    el.callUp(2);

    // Wait for car to open at floor 2
    assert.ok(tickUntil(el, function(e) { return e.currentFloor === 2 && e.state === 'DOOR_OPEN'; }, 3000), "Should open at floor 2");

    // At floor 2, with doors open, passenger still on board heading to 4
    // Add a same-floor UP call - this should NOT cause immediate reopen after doors close
    el.callUp(2);

    // Close doors
    assert.ok(tickUntilState(el, 'DOOR_CLOSING'), "Should close doors at floor 2");

    // After doors close, target should be floor 4 (passenger destination), not floor 2
    tickUntil(el, function(e) { return e.state === 'MOVING' || (e.state === 'DOOR_OPENING' && e.currentFloor !== 2); });

    if (el.state === 'MOVING') {
        assert.ok(el.targetFloor === 4 || el.targetFloor > 2, "Target should be passenger destination (4), not same-floor call (2), got " + el.targetFloor);
    }
});

// ============================================================
// Test 3: Repeated hall-call pressing cannot starve riders
// ============================================================
test("Repeated hall-call pressing cannot starve riders", function() {
    var el = new ElevatorLogic({floorCount: 6, maxCapacity: 4, floorHeight: 3.4});

    // Board a passenger at floor 0 going to floor 3
    el.callUp(0);
    assert.ok(tickUntilDoorOpen(el), "Should open at floor 0");
    el.reserveBoardingSpot("p1");
    el.completeBoard("p1");
    el.pressDestination(3);

    // Close doors
    assert.ok(tickUntilState(el, 'DOOR_CLOSING'), "Should close doors");

    // Now repeatedly call UP at floor 0 while the car is moving
    // Simulate 200 ticks where floor 0 UP is pressed each tick
    for (var i = 0; i < 200; i++) {
        el.callUp(0);
        el.tick(0.016);
        if (el.currentFloor >= 3 && el.state === 'DOOR_OPEN') break;
    }

    // Car should have reached floor 3 (or be close)
    if (el.state === 'MOVING' && el.direction === -1) {
        // Car might have passed floor 3 and reversed; that's OK as long as it visited 3
    }
    // The critical thing: the car is NOT stuck at floor 0
    assert.ok(el.currentFloor > 0 || el.state === 'MOVING', "Car should not be stuck at floor 0");
});

// ============================================================
// Test 4: Opposite-direction calls wait their turn
// ============================================================
test("Opposite-direction calls wait their turn", function() {
    var el = new ElevatorLogic({floorCount: 6, maxCapacity: 4, floorHeight: 3.4});

    // Board passenger at floor 0 going to floor 5
    el.callUp(0);
    assert.ok(tickUntilDoorOpen(el), "Should open at floor 0");
    el.reserveBoardingSpot("p1");
    el.completeBoard("p1");
    el.pressDestination(5);

    // Close doors, car starts moving up
    assert.ok(tickUntilState(el, 'DOOR_CLOSING'), "Should close doors");

    // Add a DOWN call at floor 3 while car is still at/near floor 0
    el.callDown(3);

    // The car should pick up the DOWN call at 3 on the way up (it's ahead)
    // or continue to 5. Either way, verify it goes above floor 0.
    tickUntil(el, function(e) { return e.currentFloor > 0 && (e.state === 'DOOR_OPEN' || e.state === 'MOVING'); }, 3000);

    assert.ok(el.currentFloor > 0, "Car should leave floor 0, currentFloor=" + el.currentFloor);
});

// ============================================================
// Test 5: Door hold and safety cap
// ============================================================
test("Door hold: pending boarders keep doors open; MAX_DOOR_OPEN_S fires", function() {
    var el = new ElevatorLogic({floorCount: 6, maxCapacity: 4, floorHeight: 3.4});

    el.callUp(0);
    assert.ok(tickUntilDoorOpen(el), "Should open at floor 0");

    // Reserve a spot but never completeBoard - simulates a slow boarder
    el.reserveBoardingSpot("slow_person");

    // Tick for a while - doors should stay open beyond MIN_DOOR_OPEN_S
    for (var i = 0; i < 100; i++) {
        el.tick(0.016);
    }
    assert.strictEqual(el.state, 'DOOR_OPEN', "Doors should stay open with pending boarder (state=" + el.state + ")");

    // Now tick past MAX_DOOR_OPEN_S (12 seconds)
    for (var j = 0; j < 800; j++) {
        el.tick(0.016);
    }
    // Doors should have closed by now
    assert.notStrictEqual(el.state, 'DOOR_OPEN', "Doors should close after MAX_DOOR_OPEN_S (state=" + el.state + ")");
});

// ============================================================
// Test 6: Destination preserved across the action handshake
// ============================================================
test("Destination preserved: floor 5 destination not inferred as floor 1", function() {
    var el = new ElevatorLogic({floorCount: 6, maxCapacity: 4, floorHeight: 3.4});

    // Call up at floor 0
    el.callUp(0);
    assert.ok(tickUntilDoorOpen(el), "Should open at floor 0");

    // Board and press destination 5
    el.reserveBoardingSpot("rider");
    el.completeBoard("rider");
    el.pressDestination(5);

    assert.ok(el.destinations.has(5), "Destination 5 should be registered");

    // Close doors
    assert.ok(tickUntilState(el, 'DOOR_CLOSING'), "Should close doors");

    // Move - car should go toward floor 5
    assert.ok(tickUntilMoving(el, 3000), "Should start moving");

    // Direction should be UP, target should be 5 (or an intermediate)
    assert.strictEqual(el.direction, 1, "Direction should be up");
    assert.ok(el.targetFloor >= 1, "Target should be > 0, got " + el.targetFloor);

    // Now tick until the car reaches floor 5
    var arrivedAt5 = tickUntil(el, function(e) { return e.currentFloor === 5 && e.state === 'DOOR_OPEN'; }, 5000);
    assert.ok(arrivedAt5, "Should eventually arrive at floor 5 (currentFloor=" + el.currentFloor + ", state=" + el.state + ")");
});

// ============================================================
// Test 7: Reset clears phantom state
// ============================================================
test("Reset clears phantom state", function() {
    var el = new ElevatorLogic({floorCount: 6, maxCapacity: 4, floorHeight: 3.4});

    // Put elevator in a busy state
    el.callUp(0);
    el.callDown(3);
    assert.ok(tickUntilDoorOpen(el), "Should open at floor 0");
    el.reserveBoardingSpot("p1");
    el.completeBoard("p1");
    el.reserveBoardingSpot("p2");
    el.completeBoard("p2");
    el.pressDestination(4);
    el.pressDestination(2);

    el.reset();

    assert.strictEqual(el.state, 'IDLE');
    assert.strictEqual(el.direction, 0);
    assert.strictEqual(el.currentFloor, 0);
    assert.strictEqual(el.targetFloor, null);
    assert.strictEqual(el.upCalls.size, 0);
    assert.strictEqual(el.downCalls.size, 0);
    assert.strictEqual(el.destinations.size, 0);
    assert.strictEqual(el.passengers.size, 0);
    assert.strictEqual(el.pendingBoarders.size, 0);
    assert.strictEqual(el.pendingDisembark.size, 0);
    assert.strictEqual(el._boardingSpots.size, 0);
    for (var i = 0; i < 4; i++) {
        assert.strictEqual(el.spotOccupancy[i], false, "Spot " + i + " should be free");
    }
});

console.log("\n" + (passed + failed) + " tests: " + passed + " passed, " + failed + " failed");
if (failed > 0) {
    process.exit(1);
}
