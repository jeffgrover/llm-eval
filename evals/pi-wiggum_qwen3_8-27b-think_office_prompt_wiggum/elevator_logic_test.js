// elevator_logic_test.js — deterministic Node tests for ElevatorLogic.
// Run: node elevator_logic_test.js   (no npm deps, Node built-ins only)

const assert = require("assert");
const { ElevatorLogic } = require("./elevator_logic.js");

const DT = 0.1; // fixed deterministic tick
const results = [];

function test(name, fn) {
    try {
        fn();
        results.push({ name, ok: true });
        console.log(`PASS  ${name}`);
    } catch (err) {
        results.push({ name, ok: false, err });
        console.log(`FAIL  ${name}`);
        console.log(`      ${err.message}`);
    }
}

// --- helpers ---------------------------------------------------------------

function tickUntil(ev, pred, maxTicks, label) {
    maxTicks = maxTicks || 5000;
    for (let i = 0; i < maxTicks; i++) {
        if (pred(ev)) return i;
        ev.tick(DT);
    }
    throw new Error(`tickUntil(${label || "predicate"}) exceeded ${maxTicks} ticks ` +
        `(state=${ev.state} floor=${ev.currentFloor} target=${ev.targetFloor})`);
}

function runUntilDoorOpenAt(ev, floor, maxTicks) {
    return tickUntil(ev,
        (e) => e.state === "DOOR_OPEN" && e.currentFloor === floor,
        maxTicks, `DOOR_OPEN@${floor}`);
}

function runUntilDoorClosed(ev, maxTicks) {
    // run until doors finish closing (state leaves DOOR_OPEN/DOOR_CLOSING)
    tickUntil(ev, (e) => e.state === "DOOR_OPEN", maxTicks, "reach DOOR_OPEN");
    return tickUntil(ev,
        (e) => e.state === "IDLE" || e.state === "MOVING",
        maxTicks, "doors closed");
}

function boardRider(ev, name, destFloor) {
    const spot = ev.reserveBoardingSpot(name);
    assert.ok(spot, `${name} should get a boarding spot`);
    ev.completeBoard(name);
    if (destFloor !== undefined && destFloor !== null) ev.pressDestination(destFloor);
    return spot;
}

// --- 1. Lobby rush with more callers than capacity ---------------------------

test("lobby rush: full car leaves floor 0 despite re-pressed UP calls", () => {
    const ev = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    ev.callUp(0);
    runUntilDoorOpenAt(ev, 0);

    // four riders board, press upper floors
    boardRider(ev, "p1", 2);
    boardRider(ev, "p2", 3);
    boardRider(ev, "p3", 5);
    boardRider(ev, "p4", 3);
    assert.strictEqual(ev.currentCapacityFree(), 0, "car should be full");
    assert.strictEqual(ev.reserveBoardingSpot("p5"), null, "5th rider must be rejected");

    // leftover lobby waiters keep pressing UP every tick
    let sawReopenAtZero = false;
    let leftFloorZero = false;
    for (let i = 0; i < 600; i++) {
        ev.callUp(0); // re-press like real waiters
        const prevState = ev.state;
        ev.tick(DT);
        if (prevState === "DOOR_CLOSING" && ev.state === "DOOR_OPENING" && ev.currentFloor === 0) {
            sawReopenAtZero = true;
        }
        if (ev.state === "MOVING" && ev.targetFloor > 0) { leftFloorZero = true; break; }
    }
    assert.ok(!sawReopenAtZero, "doors must not reopen at floor 0 while destinations exist");
    assert.ok(leftFloorZero, "car must depart upward with its passengers");
    assert.ok(ev.targetFloor > 0, `next target must be above floor 0, got ${ev.targetFloor}`);
    assert.ok(ev.upCalls.has(0), "leftover UP call stays queued for the next trip");
});

// --- 2. Passenger destinations outrank same-floor hall calls -----------------

test("passenger destinations outrank same-floor hall calls", () => {
    const ev = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    ev.callUp(0);
    runUntilDoorOpenAt(ev, 0);
    boardRider(ev, "rider", 4);

    // a same-floor hall call appears right as the doors are closing
    tickUntil(ev, (e) => e.state === "DOOR_CLOSING", 500, "DOOR_CLOSING");
    ev.callUp(0);
    let reopened = false;
    for (let i = 0; i < 400; i++) {
        const prev = ev.state;
        ev.tick(DT);
        if (prev === "DOOR_CLOSING" && ev.state === "DOOR_OPENING" && ev.currentFloor === 0) reopened = true;
        if (ev.state === "MOVING") break;
    }
    assert.ok(!reopened, "must not reopen at the same floor with a passenger aboard");
    assert.strictEqual(ev.targetFloor, 4, "must head to the passenger's destination");
});

// --- 3. Repeated hall-call pressing cannot starve riders ---------------------

test("repeated callUp(0) cannot starve riders' destinations", () => {
    const ev = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    ev.callUp(0);
    runUntilDoorOpenAt(ev, 0);
    boardRider(ev, "a", 3);
    boardRider(ev, "b", 5);

    let reachedDest = false;
    for (let i = 0; i < 3000; i++) {
        ev.callUp(0); // hammer the lobby button every tick
        ev.tick(DT);
        if (ev.state === "DOOR_OPEN" && (ev.currentFloor === 3 || ev.currentFloor === 5)) {
            reachedDest = true;
            break;
        }
    }
    assert.ok(reachedDest, "car must still reach a passenger destination");
});

// --- 4. Opposite-direction calls wait their turn -----------------------------

test("down call below does not reverse an upward car with work above", () => {
    const ev = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    ev.callUp(0);
    runUntilDoorOpenAt(ev, 0);
    boardRider(ev, "up1", 4);
    boardRider(ev, "up2", 5);

    runUntilDoorClosed(ev);
    assert.strictEqual(ev.direction, 1, "car should be heading up");

    // While moving up, a DOWN call arrives at floor 1 (below / behind)
    ev.callDown(1);
    ev.callDown(2);

    // Car must serve 4 then 5 before turning around for the down calls.
    runUntilDoorOpenAt(ev, 4);
    assert.ok(ev.downCalls.has(1) && ev.downCalls.has(2), "down calls still queued at floor 4");
    runUntilDoorOpenAt(ev, 5);
    // after the top, it may reverse and serve the down calls
    tickUntil(ev, (e) => e.state === "DOOR_OPEN" && (e.currentFloor === 2 || e.currentFloor === 1),
        8000, "serve down calls after reversing");
    assert.ok(true);
});

// --- 5. Door hold and safety cap ---------------------------------------------

test("doors hold for pending boarders, then MAX_DOOR_OPEN_S cap closes them", () => {
    const ev = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    ev.callUp(0);
    runUntilDoorOpenAt(ev, 0);

    const spot = ev.reserveBoardingSpot("slowpoke");
    assert.ok(spot, "slowpoke gets a spot");
    // never completes boarding…

    // after MIN_DOOR_OPEN_S the doors must STILL be open (held by pendingBoarders)
    const minTicks = Math.ceil((ev.MIN_DOOR_OPEN_S + 0.5) / DT);
    for (let i = 0; i < minTicks; i++) ev.tick(DT);
    assert.strictEqual(ev.state, "DOOR_OPEN", "doors held open past min time by pending boarder");

    // …but MAX_DOOR_OPEN_S eventually force-closes
    const capTicks = Math.ceil((ev.MAX_DOOR_OPEN_S + 1.0) / DT);
    for (let i = 0; i < capTicks; i++) ev.tick(DT);
    assert.notStrictEqual(ev.state, "DOOR_OPEN", "safety cap must close the doors");
    assert.strictEqual(ev.pendingBoarders.size, 0, "stuck boarder abandoned");
    assert.strictEqual(ev.spotOccupancy.filter(Boolean).length, 0, "spot released");

    // also verify a disembarker holds the doors
    const ev2 = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    ev2.callUp(0);
    runUntilDoorOpenAt(ev2, 0);
    boardRider(ev2, "r", 3);
    runUntilDoorOpenAt(ev2, 3);
    ev2.registerDisembark("r");
    const holdTicks = Math.ceil((ev2.MIN_DOOR_OPEN_S + 1.0) / DT);
    for (let i = 0; i < holdTicks; i++) ev2.tick(DT);
    assert.strictEqual(ev2.state, "DOOR_OPEN", "doors held for pending disembark");
    ev2.completeDisembark("r");
    tickUntil(ev2, (e) => e.state !== "DOOR_OPEN", 1000, "close after disembark completes");
});

// --- 6. Destination preserved across the action handshake --------------------

test("rider 0→5: destination survives the WAIT/ENTER/PRESS/WAIT handshake", () => {
    const ev = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });

    // WAIT_AT_PANEL: rider on floor 0 wants floor 5 (direction up)
    const rider = { name: "rider", toFloor: 5 };
    ev.callUp(0);
    tickUntil(ev, (e) => e.isAcceptingAt(0, 1) && e.currentCapacityFree() > 0, 2000, "accepting at 0 up");

    // ENTER_ELEVATOR(toFloor=5): reserve, board
    const spot = ev.reserveBoardingSpot(rider);
    assert.ok(spot, "spot reserved");
    assert.ok(typeof spot.index === "number" && "x" in spot && "y" in spot && "z" in spot,
        "spot is a plain {index,x,y,z} object");
    ev.completeBoard(rider);

    // PRESS_FLOOR uses the plan's toFloor — NOT floor+direction (which would be 1)
    ev.pressDestination(rider.toFloor);
    assert.ok(ev.destinations.has(5), "destination 5 registered");
    assert.ok(!ev.destinations.has(1), "must not register floor 1 (direction-derived bug)");

    // WAIT_FOR_FLOOR(5)
    runUntilDoorOpenAt(ev, 5, 8000);
    assert.strictEqual(ev.currentFloor, 5, "car arrived at the rider's actual destination");

    // EXIT_ELEVATOR
    ev.registerDisembark(rider);
    assert.ok(ev.pendingDisembark.has(rider), "disembark registered holds doors");
    ev.completeDisembark(rider);
    assert.strictEqual(ev.passengers.size, 0, "rider out");
});

// --- 7. Reset clears phantom state -------------------------------------------

test("reset() clears phantom state", () => {
    const ev = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    ev.callUp(0);
    runUntilDoorOpenAt(ev, 0);
    boardRider(ev, "x", 4);
    const ghost = ev.reserveBoardingSpot("ghost");
    assert.ok(ghost, "ghost pending boarder");
    ev.callDown(5);
    ev.callUp(2);
    for (let i = 0; i < 30; i++) ev.tick(DT);

    ev.reset();
    assert.strictEqual(ev.upCalls.size, 0, "upCalls cleared");
    assert.strictEqual(ev.downCalls.size, 0, "downCalls cleared");
    assert.strictEqual(ev.destinations.size, 0, "destinations cleared");
    assert.strictEqual(ev.passengers.size, 0, "passengers cleared");
    assert.strictEqual(ev.pendingBoarders.size, 0, "pendingBoarders cleared");
    assert.strictEqual(ev.pendingDisembark.size, 0, "pendingDisembark cleared");
    assert.strictEqual(ev.spotOccupancy.filter(Boolean).length, 0, "spots free");
    assert.strictEqual(ev.direction, 0, "direction reset");
    assert.strictEqual(ev.targetFloor, null, "target cleared");
    assert.strictEqual(ev.currentFloor, 0, "parked at floor 0");
    assert.strictEqual(ev.y, 0, "car at ground height");
    assert.strictEqual(ev.state, "IDLE", "idle");
    assert.strictEqual(ev.doorProgress, 0, "doors closed");
    assert.strictEqual(ev.doorOpenTimer, 0, "door open timer cleared");
    assert.strictEqual(ev.doorTimer, 0, "door timer cleared");

    // and the machine still works after reset
    ev.callUp(3);
    runUntilDoorOpenAt(ev, 3, 8000);
});

// --- summary -----------------------------------------------------------------

const failed = results.filter((r) => !r.ok);
console.log("\n==============================");
console.log(`${results.length - failed.length}/${results.length} tests passed` +
    (failed.length ? `  —  ${failed.length} FAILED` : "  —  ALL PASS"));
failed.forEach((f) => console.log(`  FAIL: ${f.name}`));
console.log("==============================");
process.exit(failed.length ? 1 : 0);
