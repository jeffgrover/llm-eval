// elevator_logic_test.js - deterministic, dependency-free tests.
//   node elevator_logic_test.js
// No randomness, no real timers, hard iteration caps so a broken scheduler
// fails loudly instead of hanging.

const assert = require("assert");
const { ElevatorLogic } = require("./elevator_logic.js");

const DT = 0.1;
const MAX_TICKS = 4000;

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
    try {
        fn();
        passed += 1;
        console.log(`  PASS  ${name}`);
    } catch (err) {
        failed += 1;
        failures.push(`${name}: ${err && err.message ? err.message : err}`);
        console.log(`  FAIL  ${name}`);
        console.log(`        ${err && err.message ? err.message : err}`);
    }
}

function makeLogic(options) {
    return new ElevatorLogic(options || { floorCount: 6, maxCapacity: 4, floorHeight: 3.4 });
}

// Advance until `predicate(logic)` is true. Throws (never hangs) on timeout.
function tickUntil(logic, predicate, label, cap) {
    const limit = cap || MAX_TICKS;
    for (let i = 0; i < limit; i += 1) {
        if (predicate(logic)) return i;
        logic.tick(DT);
    }
    if (predicate(logic)) return limit;
    throw new Error(`timed out waiting for ${label} (state=${logic.state} floor=${logic.currentFloor} dir=${logic.direction} target=${logic.targetFloor})`);
}

function runUntilDoorOpenAt(logic, floor, cap) {
    return tickUntil(logic, (el) => el.state === "DOOR_OPEN" && el.currentFloor === floor, `DOOR_OPEN at floor ${floor}`, cap);
}

function runUntilDoorClosed(logic, cap) {
    return tickUntil(logic, (el) => el.doorPosition === 0 && el.state !== "DOOR_OPEN" && el.state !== "DOOR_OPENING" && el.state !== "DOOR_CLOSING", "doors fully closed", cap);
}

function rider(name) {
    return { name: name };
}

// Board a rider completely: reserve a spot, then confirm boarding.
function boardRider(logic, person) {
    const spot = logic.reserveBoardingSpot(person);
    assert.ok(spot !== null, `expected a free interior spot for ${person.name}`);
    assert.strictEqual(typeof spot.index, "number", "spot must expose an index");
    assert.strictEqual(typeof spot.x, "number", "spot must expose x");
    assert.strictEqual(typeof spot.z, "number", "spot must expose z");
    logic.completeBoard(person);
    return spot;
}

console.log("elevator_logic_test.js");
console.log("");

// ---------------------------------------------------------------------------
test("1. lobby rush: leftover callers do not pin a loaded car on floor 0", () => {
    const logic = makeLogic();
    logic.callUp(0);
    runUntilDoorOpenAt(logic, 0);

    const riders = [rider("a"), rider("b"), rider("c"), rider("d")];
    for (let i = 0; i < riders.length; i += 1) boardRider(logic, riders[i]);

    assert.strictEqual(logic.passengers.size, 4, "four riders aboard");
    assert.strictEqual(logic.currentCapacityFree(), 0, "car is full");
    assert.strictEqual(logic.reserveBoardingSpot(rider("e")), null, "a fifth rider must be refused");

    logic.pressDestination(2);
    logic.pressDestination(4);

    // Leftover waiters keep hammering the UP button in the lobby.
    for (let i = 0; i < 40; i += 1) {
        logic.callUp(0);
        logic.tick(DT);
    }

    assert.ok(logic.currentFloor !== 0 || logic.state === "MOVING",
        `car must leave floor 0 (state=${logic.state} floor=${logic.currentFloor})`);
    assert.ok(logic.targetFloor > 0, `next target must be above floor 0, got ${logic.targetFloor}`);

    runUntilDoorOpenAt(logic, 2);
    assert.ok(!logic.destinations.has(2), "destination 2 cleared on arrival");
    assert.ok(logic.upCalls.has(0), "the leftover lobby call is still queued for a later trip");
});

// ---------------------------------------------------------------------------
test("2. passenger destinations outrank a same-floor hall call", () => {
    const logic = makeLogic();
    logic.callUp(0);
    runUntilDoorOpenAt(logic, 0);
    const passenger = rider("solo");
    boardRider(logic, passenger);
    logic.pressDestination(5);

    assert.ok(logic.passengers.size > 0 && logic.destinations.size > 0, "precondition");

    // Someone presses UP at the floor we are already standing on.
    logic.callUp(0);
    runUntilDoorClosed(logic);

    assert.notStrictEqual(logic.state, "DOOR_OPENING", "must not immediately reopen at floor 0");
    assert.strictEqual(logic.targetFloor, 5, `target should be the rider's floor 5, got ${logic.targetFloor}`);
    assert.strictEqual(logic.direction, 1, "car should be heading up");

    // And it must never bounce back to 0 before serving floor 5.
    for (let i = 0; i < 200; i += 1) {
        logic.tick(DT);
        assert.ok(!(logic.state === "DOOR_OPEN" && logic.currentFloor === 0), "reopened at floor 0 with a rider aboard");
        if (logic.state === "DOOR_OPEN" && logic.currentFloor === 5) break;
    }
    assert.strictEqual(logic.currentFloor, 5, "car reached floor 5");
});

// ---------------------------------------------------------------------------
test("3. repeated hall-call pressing cannot starve riders", () => {
    const logic = makeLogic();
    logic.callUp(0);
    runUntilDoorOpenAt(logic, 0);
    boardRider(logic, rider("r1"));
    boardRider(logic, rider("r2"));
    logic.pressDestination(3);
    logic.pressDestination(5);

    let reached = 0;
    for (let i = 0; i < 1500; i += 1) {
        logic.callUp(0); // relentless lobby button-mashing
        logic.tick(DT);
        if (logic.state === "DOOR_OPEN" && (logic.currentFloor === 3 || logic.currentFloor === 5)) {
            reached = logic.currentFloor;
            break;
        }
    }
    assert.ok(reached === 3 || reached === 5, `car must reach a passenger destination, reached ${reached}`);
});

// ---------------------------------------------------------------------------
test("4. opposite-direction calls wait their turn", () => {
    const logic = makeLogic();
    logic.callUp(0);
    runUntilDoorOpenAt(logic, 0);
    const up1 = rider("up1");
    boardRider(logic, up1);
    logic.pressDestination(4);
    runUntilDoorClosed(logic);

    tickUntil(logic, (el) => el.state === "MOVING" && el.exactFloor > 1.2, "car climbing past floor 1");
    // Someone downstairs wants to go DOWN while we are on our way up.
    logic.callDown(1);
    logic.callDown(2);

    for (let i = 0; i < 600; i += 1) {
        logic.tick(DT);
        assert.strictEqual(logic.direction, 1, `car reversed early at floor ${logic.currentFloor}`);
        if (logic.state === "DOOR_OPEN" && logic.currentFloor === 4) break;
    }
    assert.strictEqual(logic.currentFloor, 4, "upward destination served first");
    assert.ok(logic.downCalls.has(2) || logic.downCalls.has(1), "down calls survived the upward trip");

    // Now, with nothing above, it must come back down for them.
    logic.completeDisembark(up1);
    runUntilDoorClosed(logic);
    tickUntil(logic, (el) => el.state === "DOOR_OPEN" && (el.currentFloor === 2 || el.currentFloor === 1), "car returns for the down calls");
    assert.strictEqual(logic.direction, -1, "car is now travelling down");
});

// ---------------------------------------------------------------------------
test("5. door hold honours pending sets and the safety cap", () => {
    const logic = makeLogic();
    logic.callUp(0);
    runUntilDoorOpenAt(logic, 0);

    const slowpoke = rider("slowpoke");
    const spot = logic.reserveBoardingSpot(slowpoke);
    assert.ok(spot !== null, "reserved a spot");
    assert.strictEqual(logic.pendingBoarders.size, 1, "boarder is pending");

    // Past the minimum open time the doors must still be held open.
    tickUntil(logic, (el) => el.doorTimer >= el.MIN_DOOR_OPEN_S + 0.2, "min door time to elapse");
    assert.strictEqual(logic.state, "DOOR_OPEN", "doors held open for a pending boarder");

    // ...but the safety cap eventually wins.
    tickUntil(logic, (el) => el.state !== "DOOR_OPEN", "safety cap to force the doors shut", 400);
    assert.ok(logic.doorTimer >= logic.MAX_DOOR_OPEN_S, "closed only after MAX_DOOR_OPEN_S");
    runUntilDoorClosed(logic, 400);
    assert.strictEqual(logic.pendingBoarders.size, 0, "stranded boarder released");
    assert.ok(logic.strandedBoarders.has(slowpoke), "stranded boarder reported so the sim can recover them");
    assert.strictEqual(logic.currentCapacityFree(), 4, "their reserved spot was freed");

    // Same guarantee for a disembarking passenger that never completes.
    const logic2 = makeLogic();
    logic2.callUp(0);
    runUntilDoorOpenAt(logic2, 0);
    const stuck = rider("stuck");
    boardRider(logic2, stuck);
    logic2.registerDisembark(stuck);
    tickUntil(logic2, (el) => el.doorTimer >= el.MIN_DOOR_OPEN_S + 0.2, "min door time (disembark)");
    assert.strictEqual(logic2.state, "DOOR_OPEN", "doors held open for a pending disembark");
    tickUntil(logic2, (el) => el.state !== "DOOR_OPEN", "safety cap with pending disembark", 400);
    assert.ok(logic2.doorTimer >= logic2.MAX_DOOR_OPEN_S, "disembark hold also capped");
});

// ---------------------------------------------------------------------------
test("6. destination survives the WAIT_AT_PANEL -> ... -> WAIT_FOR_FLOOR handshake", () => {
    const logic = makeLogic();
    // Model the agent action chain for a rider going from floor 0 to floor 5.
    const plan = [
        { type: "WAIT_AT_PANEL", floor: 0, dir: 1, toFloor: 5 },
        { type: "ENTER_ELEVATOR", toFloor: 5 },
        { type: "PRESS_FLOOR", floor: 5 },
        { type: "WAIT_FOR_FLOOR", floor: 5 },
        { type: "EXIT_ELEVATOR", toFloor: 5 }
    ];
    const person = rider("planner");
    let index = 0;
    let arrivedAt = -1;

    for (let i = 0; i < 2000 && index < plan.length; i += 1) {
        const action = plan[index];
        if (action.type === "WAIT_AT_PANEL") {
            if (action.dir > 0) logic.callUp(action.floor);
            else logic.callDown(action.floor);
            if (logic.isAcceptingAt(action.floor, action.dir)) index += 1;
        } else if (action.type === "ENTER_ELEVATOR") {
            const spot = logic.reserveBoardingSpot(person);
            if (spot) {
                logic.completeBoard(person);
                index += 1;
            }
        } else if (action.type === "PRESS_FLOOR") {
            // The destination must come from the plan, never from floor + dir.
            assert.strictEqual(action.floor, 5, "PRESS_FLOOR must carry the planned destination");
            logic.pressDestination(action.floor);
            index += 1;
        } else if (action.type === "WAIT_FOR_FLOOR") {
            if (logic.state === "DOOR_OPEN" && logic.currentFloor === action.floor) {
                arrivedAt = logic.currentFloor;
                index += 1;
            }
        } else if (action.type === "EXIT_ELEVATOR") {
            logic.registerDisembark(person);
            logic.completeDisembark(person);
            index += 1;
        }
        logic.tick(DT);
    }

    assert.strictEqual(index, plan.length, "the whole action chain completed");
    assert.strictEqual(arrivedAt, 5, `rider must be delivered to floor 5, got ${arrivedAt}`);
    assert.strictEqual(logic.passengers.size, 0, "rider left the car");
});

// ---------------------------------------------------------------------------
test("7. reset() clears every scrap of phantom state", () => {
    const logic = makeLogic();
    logic.callUp(0);
    logic.callDown(4);
    runUntilDoorOpenAt(logic, 0);
    const ghost = rider("ghost");
    boardRider(logic, ghost);
    const alsoGhost = rider("ghost2");
    logic.reserveBoardingSpot(alsoGhost);
    logic.pressDestination(3);
    logic.registerDisembark(ghost);
    for (let i = 0; i < 20; i += 1) logic.tick(DT);

    logic.reset();

    assert.strictEqual(logic.upCalls.size, 0, "upCalls cleared");
    assert.strictEqual(logic.downCalls.size, 0, "downCalls cleared");
    assert.strictEqual(logic.destinations.size, 0, "destinations cleared");
    assert.strictEqual(logic.passengers.size, 0, "passengers cleared");
    assert.strictEqual(logic.pendingBoarders.size, 0, "pendingBoarders cleared");
    assert.strictEqual(logic.pendingDisembark.size, 0, "pendingDisembark cleared");
    assert.strictEqual(logic.currentCapacityFree(), logic.maxCapacity, "spot occupancy cleared");
    assert.strictEqual(logic.direction, 0, "direction cleared");
    assert.strictEqual(logic.currentFloor, 0, "parked on floor 0");
    assert.strictEqual(logic.exactFloor, 0, "exact position parked on floor 0");
    assert.strictEqual(logic.targetFloor, 0, "target cleared");
    assert.strictEqual(logic.doorPosition, 0, "doors snapped closed");
    assert.strictEqual(logic.doorTimer, 0, "door timer cleared");
    assert.strictEqual(logic.state, "IDLE", "back to IDLE");

    // A reset car must still work.
    logic.callUp(2);
    runUntilDoorOpenAt(logic, 2);
    assert.strictEqual(logic.currentFloor, 2, "reset car still answers calls");
});

// ---------------------------------------------------------------------------
console.log("");
console.log(`${passed} passed, ${failed} failed`);
if (failed) {
    console.log("");
    for (let i = 0; i < failures.length; i += 1) console.log(`  - ${failures[i]}`);
    process.exit(1);
}
process.exit(0);
