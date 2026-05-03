// elevator_logic_test.js — deterministic Node tests for ElevatorLogic
// Run with: node elevator_logic_test.js

const assert = require("assert");
const { ElevatorLogic, STATES } = require("./elevator_logic.js");

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
    try {
        fn();
        passed++;
        console.log(`  ✓ ${name}`);
    } catch (err) {
        failed++;
        failures.push({ name, err });
        console.log(`  ✗ ${name}`);
        console.log(`     ${err.message}`);
    }
}

function group(name, fn) {
    console.log(`\n${name}`);
    fn();
}

function tickFor(elev, totalSec, dt) {
    dt = dt || 0.05;
    const n = Math.max(1, Math.ceil(totalSec / dt));
    for (let i = 0; i < n; i++) elev.tick(dt);
}

function tickUntil(elev, predicate, opts) {
    opts = opts || {};
    const dt = opts.dt || 0.05;
    const maxIter = opts.maxIter || 4000;
    for (let i = 0; i < maxIter; i++) {
        if (predicate(elev, i)) return i;
        elev.tick(dt);
    }
    throw new Error(`tickUntil exceeded maxIter (${maxIter})`);
}

function runUntilDoorOpenAt(elev, floor, opts) {
    return tickUntil(elev, (e) => e.state === STATES.DOOR_OPEN && e.currentFloor === floor, opts);
}

function runUntilDoorClosed(elev, opts) {
    return tickUntil(
        elev,
        (e) => e.state === STATES.IDLE || e.state === STATES.MOVING,
        opts,
    );
}

// fake "person" objects — just need an identity + userData
function fakePerson(id) {
    return { id, userData: { _elevatorSpotIndex: -1 } };
}

// =====================================================================
// 1. Lobby rush with more callers than capacity
// =====================================================================
group("1. Lobby rush — more callers than capacity", () => {
    test("after 4 board, doors close and next target is above floor 0", () => {
        const e = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
        // Five would-be riders show up at floor 0 wanting to go up
        e.callUp(0);
        runUntilDoorOpenAt(e, 0);
        assert.strictEqual(e.state, STATES.DOOR_OPEN);
        assert.strictEqual(e.currentFloor, 0);

        // First 4 riders board successfully
        const riders = [fakePerson(1), fakePerson(2), fakePerson(3), fakePerson(4)];
        for (const r of riders) {
            const spot = e.reserveBoardingSpot(r);
            assert.ok(spot, `rider ${r.id} should have got a spot`);
            r.userData._elevatorSpotIndex = spot.index;
            e.completeBoard(r);
        }
        // 5th cannot board (full)
        const overflow = fakePerson(5);
        const oSpot = e.reserveBoardingSpot(overflow);
        assert.strictEqual(oSpot, null, "5th rider should be denied");

        // The riders press destinations (floors 2, 3, 5, 5)
        e.pressDestination(2);
        e.pressDestination(3);
        e.pressDestination(5);
        // Overflow rider keeps re-pressing UP at floor 0
        for (let i = 0; i < 6; i++) {
            e.callUp(0);
            e.tick(0.05);
        }
        // Now wait until doors close and car starts moving
        runUntilDoorClosed(e);
        assert.notStrictEqual(e.targetFloor, 0, "next target should not be floor 0");
        assert.ok(e.targetFloor >= 2, `target should be 2/3/5, got ${e.targetFloor}`);
        assert.strictEqual(e.direction, +1);
    });
});

// =====================================================================
// 2. Passenger destinations outrank same-floor hall calls
// =====================================================================
group("2. Passenger destinations outrank same-floor hall calls", () => {
    test("door does not reopen at same floor when passengers have destinations", () => {
        const e = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
        // Board 1 rider at floor 0, going up
        e.callUp(0);
        runUntilDoorOpenAt(e, 0);
        const r = fakePerson(1);
        const spot = e.reserveBoardingSpot(r);
        r.userData._elevatorSpotIndex = spot.index;
        e.completeBoard(r);
        e.pressDestination(4);

        // While doors still open at floor 0, a hall call comes in for UP at floor 0
        e.callUp(0);

        // Run until car closes doors and starts moving
        // Watch for any door reopening at floor 0
        let openedAgain = false;
        for (let i = 0; i < 800; i++) {
            const wasOpenBefore = e.state === STATES.DOOR_OPEN && e.currentFloor === 0;
            e.tick(0.05);
            if (e.state === STATES.DOOR_OPENING && e.currentFloor === 0 && !wasOpenBefore && e.position === 0) {
                openedAgain = true;
                break;
            }
            if (e.position > 0.5) break; // we've moved up — success path
        }
        assert.ok(!openedAgain, "doors must not reopen at floor 0 when rider has destination above");
        assert.ok(e.position > 0, "car should have started moving up");
    });
});

// =====================================================================
// 3. Repeated hall-call pressing cannot starve riders
// =====================================================================
group("3. Repeated hall-call pressing cannot starve riders", () => {
    test("riders still reach at least one destination despite spam UP calls at floor 0", () => {
        const e = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
        e.callUp(0);
        runUntilDoorOpenAt(e, 0);
        const riders = [fakePerson(1), fakePerson(2), fakePerson(3)];
        for (const r of riders) {
            const spot = e.reserveBoardingSpot(r);
            r.userData._elevatorSpotIndex = spot.index;
            e.completeBoard(r);
        }
        e.pressDestination(3);
        e.pressDestination(5);

        let reachedADest = false;
        for (let i = 0; i < 2000; i++) {
            // Spam the hall call every other tick
            if (i % 2 === 0) e.callUp(0);
            e.tick(0.05);
            if (e.state === STATES.DOOR_OPEN && (e.currentFloor === 3 || e.currentFloor === 5)) {
                reachedADest = true;
                break;
            }
        }
        assert.ok(reachedADest, "elevator must reach a passenger destination");
    });
});

// =====================================================================
// 4. Opposite-direction calls wait their turn
// =====================================================================
group("4. Opposite-direction calls wait their turn", () => {
    test("DOWN call at lower floor does not reverse car still moving up with work above", () => {
        const e = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
        // Set up: car starts moving UP toward floor 5
        e.callUp(0);
        runUntilDoorOpenAt(e, 0);
        const r = fakePerson(1);
        const spot = e.reserveBoardingSpot(r);
        r.userData._elevatorSpotIndex = spot.index;
        e.completeBoard(r);
        e.pressDestination(5);

        // Wait until car is moving up
        tickUntil(e, (x) => x.state === STATES.MOVING && x.direction > 0);
        // Mid-trip: someone presses DOWN at floor 2 (below us) — must not reverse
        // Wait until we're past floor 2
        tickUntil(e, (x) => x.position > 2.0);
        e.callDown(2);

        // Continue until we've reached floor 5 OR (incorrectly) reversed
        let reachedFive = false;
        let reversedEarly = false;
        for (let i = 0; i < 600; i++) {
            const prevDir = e.direction;
            e.tick(0.05);
            if (e.state === STATES.DOOR_OPEN && e.currentFloor === 5) {
                reachedFive = true;
                break;
            }
            if (e.state === STATES.MOVING && e.direction < 0 && e.currentFloor < 5) {
                reversedEarly = true;
                break;
            }
        }
        assert.ok(!reversedEarly, "must not reverse direction with work above");
        assert.ok(reachedFive, "car should reach floor 5 first");
    });
});

// =====================================================================
// 5. Door hold and safety cap
// =====================================================================
group("5. Door hold and safety cap", () => {
    test("doors stay open while pendingBoarders > 0 past min open", () => {
        const e = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
        e.callUp(0);
        runUntilDoorOpenAt(e, 0);
        const r = fakePerson(1);
        const spot = e.reserveBoardingSpot(r);
        r.userData._elevatorSpotIndex = spot.index;
        // Don't completeBoard — leave them as pending forever (within reason)
        // After minOpen the doors should still be open
        tickFor(e, e.opts.minDoorOpenS + 1.0);
        assert.strictEqual(e.state, STATES.DOOR_OPEN, "doors should still be open with pending boarder");
    });

    test("doors force-close after MAX_DOOR_OPEN_S even with pending boarder", () => {
        const e = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
        e.callUp(0);
        runUntilDoorOpenAt(e, 0);
        const r = fakePerson(1);
        const spot = e.reserveBoardingSpot(r);
        r.userData._elevatorSpotIndex = spot.index;
        // tick well past max
        tickFor(e, e.opts.maxDoorOpenS + 3.0);
        // Should have transitioned away from DOOR_OPEN
        assert.notStrictEqual(e.state, STATES.DOOR_OPEN, "doors should have closed past safety cap");
    });
});

// =====================================================================
// 6. Destination preserved across action handshake
// =====================================================================
group("6. Destination preserved across the action handshake", () => {
    test("0->5 rider: WAIT_AT_PANEL → ENTER → PRESS_FLOOR(5) → WAIT_FOR_FLOOR(5)", () => {
        const e = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
        const direction = +1;
        const fromFloor = 0;
        const toFloor = 5;

        // WAIT_AT_PANEL
        e.callUp(fromFloor);
        tickUntil(e, (x) => x.isAcceptingAt(fromFloor, direction));
        // ENTER_ELEVATOR
        const r = fakePerson(1);
        const spot = e.reserveBoardingSpot(r);
        assert.ok(spot, "must reserve a spot");
        r.userData._elevatorSpotIndex = spot.index;
        e.completeBoard(r);
        // PRESS_FLOOR — explicit destination, NOT inferred
        e.pressDestination(toFloor);
        assert.ok(e.destinations.has(toFloor), "destination must be the actual toFloor");
        assert.ok(!e.destinations.has(fromFloor + direction), "must not have inferred floor 1");

        // WAIT_FOR_FLOOR(5)
        runUntilDoorOpenAt(e, toFloor);
        assert.strictEqual(e.currentFloor, toFloor);
    });
});

// =====================================================================
// 7. Reset clears phantom state
// =====================================================================
group("7. Reset clears phantom state", () => {
    test("reset() wipes everything and parks at floor 0", () => {
        const e = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
        e.callUp(0);
        e.callDown(3);
        e.pressDestination(4);
        runUntilDoorOpenAt(e, 0);
        const r = fakePerson(1);
        const spot = e.reserveBoardingSpot(r);
        r.userData._elevatorSpotIndex = spot.index;
        e.completeBoard(r);
        e.registerDisembark(fakePerson(2));

        e.reset();
        assert.strictEqual(e.upCalls.size, 0);
        assert.strictEqual(e.downCalls.size, 0);
        assert.strictEqual(e.destinations.size, 0);
        assert.strictEqual(e.passengers.size, 0);
        assert.strictEqual(e.pendingBoarders.size, 0);
        assert.strictEqual(e.pendingDisembark.size, 0);
        assert.strictEqual(e.spotOccupancy.filter(Boolean).length, 0);
        assert.strictEqual(e.direction, 0);
        assert.strictEqual(e.currentFloor, 0);
        assert.strictEqual(e.targetFloor, 0);
        assert.strictEqual(e.state, STATES.IDLE);
        assert.strictEqual(e.doorTimer, 0);
        assert.strictEqual(e.doorOpenAmount, 0);
    });
});

// =====================================================================
// Summary
// =====================================================================
console.log(`\n${passed} passed, ${failed} failed (${passed + failed} total)`);
if (failed > 0) {
    console.log("\nFailures:");
    for (const f of failures) {
        console.log(`  - ${f.name}`);
        console.log(`    ${f.err.stack || f.err.message}`);
    }
    process.exit(1);
}
process.exit(0);
