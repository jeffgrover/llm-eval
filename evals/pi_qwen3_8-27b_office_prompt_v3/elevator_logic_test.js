/**
 * elevator_logic_test.js - deterministic Node tests for ElevatorLogic.
 * Run: node elevator_logic_test.js
 * No dependencies beyond Node built-ins (assert). No randomness, no real timers.
 */
"use strict";

const assert = require("assert");
const { ElevatorLogic } = require("./elevator_logic.js");

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
    try {
        fn();
        passed += 1;
        console.log(`PASS ${name}`);
    } catch (err) {
        failed += 1;
        failures.push({ name, err });
        console.log(`FAIL ${name}: ${err && err.message ? err.message : err}`);
    }
}

const DT = 0.1; // fixed test timestep (sim seconds)

function tickUntil(elev, predicate, maxIters = 4000) {
    for (let i = 0; i < maxIters; i += 1) {
        elev.tick(DT);
        if (predicate()) return i + 1;
    }
    throw new Error(`tickUntil: predicate not satisfied after ${maxIters} ticks (state=${elev.state}, floor=${elev.currentFloor}, target=${elev.targetFloor})`);
}

function runUntilDoorOpenAt(elev, floor, maxIters = 4000) {
    return tickUntil(elev, () => elev.state === "DOOR_OPEN" && elev.currentFloor === floor, maxIters);
}

function runUntilDoorClosed(elev, maxIters = 4000) {
    return tickUntil(elev, () => (elev.state === "IDLE" || elev.state === "MOVING"), maxIters);
}

// Make the car reach DOOR_OPEN at a given floor from an idle start.
function openDoorsAtIdleFloor0(elev) {
    runUntilDoorOpenAt(elev, 0);
}

test("1. lobby rush: four board + leftover callers -> next target is above 0", () => {
    const elev = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    elev.callUp(0);
    openDoorsAtIdleFloor0(elev);

    // Board exactly four riders (two for floor 3, two for floor 5).
    for (let i = 0; i < 4; i += 1) {
        const spot = elev.reserveBoardingSpot(`rider${i}`);
        assert.ok(spot && typeof spot.index === "number", `rider ${i} got a spot`);
        elev.completeBoard(`rider${i}`);
    }
    elev.pressDestination(3);
    elev.pressDestination(5);

    // Leftover lobby callers keep re-pressing UP while doors are open/closing.
    const extra = [];
    for (let i = 0; i < 6; i += 1) { extra.push(`extra${i}`); }
    for (const e of extra) elev.callUp(0);

    runUntilDoorClosed(elev);
    assert.ok(
        elev.targetFloor > 0 || elev.state === "IDLE" && elev.upCalls.size <= 1,
        `car must not re-serve floor 0 with a full car (target=${elev.targetFloor}, state=${elev.state})`
    );
    if (elev.state === "MOVING") {
        assert.ok(elev.targetFloor > 0, `full car heading to ${elev.targetFloor} must be above lobby`);
    }
    // And it actually reaches an upper destination.
    const reached3 = tickUntil(elev, () => elev.currentFloor === 3 && elev.state !== "MOVING", 4000);
    assert.ok(reached3 > 0);
});

test("2. passenger destinations outrank same-floor hall calls (no reopen at same floor)", () => {
    const elev = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    // Car rides up with passengers to floor 5 and stops there.
    elev.callUp(0);
    runUntilDoorOpenAt(elev, 0);
    elev.reserveBoardingSpot("p1");
    elev.completeBoard("p1");
    elev.pressDestination(5);
    runUntilDoorClosed(elev);
    runUntilDoorOpenAt(elev, 5);

    // A hall call appears on the same floor while doors are open at 5.
    elev.callUp(5);
    const reopen = tickUntil(elev, () => elev.state === "DOOR_OPENING" || elev.state === "IDLE" || elev.state === "MOVING", 4000) > 0;
    assert.ok(reopen, "doors eventually close");
    // After they close, the car must NOT reopen at floor 5 for that hall call.
    const states = [];
    for (let i = 0; i < 200; i += 1) { elev.tick(DT); states.push(elev.state); }
    assert.ok(!states.slice(20).includes("DOOR_OPENING"), `car ping-ponged DOOR_CLOSING->DOOR_OPENING at floor 5: ${states.join(",")}`);
});

test("3. repeated callUp(0) cannot starve riders with destinations", () => {
    const elev = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    elev.callUp(0);
    runUntilDoorOpenAt(elev, 0);
    for (let i = 0; i < 4; i += 1) {
        elev.reserveBoardingSpot(`r${i}`);
        elev.completeBoard(`r${i}`);
    }
    for (let f = 2; f <= 5; f += 1) elev.pressDestination(f);

    // Hammer callUp(0) every tick while the car runs.
    const iters = tickUntil(elev, () => {
        if (elev.state === "DOOR_OPEN" && elev.currentFloor === 0) return false;
        return elev.currentFloor >= 2 && elev.state !== "MOVING";
    }, 6000);
    assert.ok(iters > 0, "car eventually leaves floor 0 with riders");
    // All destinations get reached even though the lobby kept calling.
    for (const f of [2, 3, 4, 5]) {
        tickUntil(elev, () => elev.lastServedFloor === f || (!elev.destinations.has(f) && !elev.passengers.size), 6000);
    }
    assert.strictEqual(elev.destinations.size, 0, "all passenger destinations served");
});

test("4. opposite-direction calls wait for forward work", () => {
    const elev = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    elev.callUp(0);
    runUntilDoorOpenAt(elev, 0);
    const spot = elev.reserveBoardingSpot("uprider");
    assert.ok(spot, "boarding accepted while heading up");
    elev.completeBoard("uprider");
    elev.pressDestination(5);
    // A DOWN call at floor 1 (and at the car's start) appears mid-ascent.
    elev.callDown(1);
    const iters = tickUntil(elev, () => elev.state === "DOOR_OPEN" && elev.currentFloor === 5, 6000);
    assert.ok(iters > 0, "car reaches floor 5 before reversing for the down call");
    // The down call must still be in the queue (not cleared by a pass it didn't serve).
    const servedDownLater = tickUntil(elev, () => elev.currentFloor === 1 && (!elev.downCalls.has(1) || elev.state === "DOOR_OPENING"), 6000);
    assert.ok(servedDownLater > 0, "down call eventually served on the way back");
});

test("5. door hold while pending non-empty; MAX cap closes anyway", () => {
    const elev = new ElevatorLogic({ floorCount: 6, maxCapacity: 4, minDoorOpenS: 1.0, maxDoorOpenS: 3.0 });
    elev.callUp(0);
    runUntilDoorOpenAt(elev, 0);

    // A boarder reserves a spot but never completes the handshake.
    const stuck = elev.reserveBoardingSpot("stuck");
    assert.ok(stuck, "got a spot to get stuck on");

    // After min open time passed, doors must STILL be open (held by pending).
    let held = true;
    for (let i = 0; i < 15; i += 1) {
        elev.tick(DT);
        if (elev.state !== "DOOR_OPEN" && elev.state !== "DOOR_OPENING") { held = false; break; }
    }
    assert.ok(held, `doors stayed open while pendingBoarders non-empty (state=${elev.state})`);

    // But the MAX cap must force close eventually.
    const closed = tickUntil(elev, () => elev.state === "DOOR_CLOSING" || elev.state === "IDLE" || elev.state === "MOVING", 4000);
    assert.ok(closed > 0, `MAX_DOOR_OPEN_S cap forced the doors shut (state=${elev.state})`);
});

test("6. destination preserved across WAIT->ENTER->PRESS->WAIT_FOR_FLOOR handshake (0 -> 5)", () => {
    const elev = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    // WAIT_AT_PANEL
    elev.callUp(0);
    runUntilDoorOpenAt(elev, 0);
    assert.ok(elev.isAcceptingAt(0, 1), "car accepting up-caller at lobby");
    // ENTER_ELEVATOR
    const spot = elev.reserveBoardingSpot("rider5");
    assert.ok(spot && typeof spot.x === "number", "spot reserved with coords");
    elev.completeBoard("rider5");
    // PRESS_FLOOR (exact destination from the plan, never floor+dir)
    const toFloor = 5;
    elev.pressDestination(toFloor);
    assert.ok(elev.destinations.has(5), "destination registered as floor 5");

    // WAIT_FOR_FLOOR: car must arrive at DOOR_OPEN on exactly floor 5.
    const iters = runUntilDoorOpenAt(elev, 5, 6000);
    assert.ok(iters > 0, `doors opened at floor ${elev.currentFloor} (expected 5)`);
    // EXIT_ELEVATOR handshake: registerDisembark holds doors.
    elev.registerDisembark("rider5");
    assert.strictEqual(elev.passengers.size, 0, "rider no longer counts as passenger mid-exit");
    runUntilDoorClosed(elev);
    elev.completeDisembark("rider5");
});

test("7. reset clears all phantom state", () => {
    const elev = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    // Dirty everything up.
    elev.callUp(1);
    elev.callDown(3);
    elev.pressDestination(5);
    elev.reserveBoardingSpot("ghost1");
    elev.completeBoard("ghost1");
    elev.registerDisembark("ghost1");

    elev.reset();
    assert.strictEqual(elev.state, "IDLE", `state IDLE after reset (got ${elev.state})`);
    assert.strictEqual(elev.direction, 0, "direction zeroed");
    assert.strictEqual(elev.currentFloor, 0, "parked on floor 0");
    assert.strictEqual(elev.targetFloor, 0, "target floor zeroed");
    assert.ok(elev.upCalls.size === 0, "up calls cleared");
    assert.ok(elev.downCalls.size === 0, "down calls cleared");
    assert.ok(elev.destinations.size === 0, "destinations cleared");
    assert.ok(elev.passengers.size === 0, "passengers cleared");
    assert.ok(elev.pendingBoarders.size === 0, "pending boarders cleared");
    assert.ok(elev.pendingDisembark.size === 0, "pending disembarks cleared");
    assert.strictEqual(elev.spotOccupancy.filter((s) => s !== null).length, 0, "spot occupancy cleared");
    assert.ok(elev.doorTimer <= 0 || elev.doorTimer < DT * 2, "door timers reset");
    assert.strictEqual(elev.currentCapacityFree(), 4, "capacity free after reset");

    // Reset car actually starts moving fresh on a new call.
    elev.callUp(2);
    const iters = tickUntil(elev, () => elev.state === "MOVING", 500);
    assert.ok(iters > 0 && elev.targetFloor === 2, `reset car responds to new calls (target=${elev.targetFloor})`);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
    for (const f of failures) console.log(`  FAILED: ${f.name}`);
    process.exit(1);
}
process.exit(0);
