const assert = require("assert");
const { ElevatorLogic } = require("./elevator_logic.js");

function tickUntil(logic, pred, maxSteps) {
    const limit = maxSteps || 2000;
    const dt = 0.05;
    for (let i = 0; i < limit; i++) {
        if (pred(logic)) return true;
        logic.tick(dt);
    }
    return pred(logic);
}

function runUntilDoorOpenAt(logic, floor) {
    const ok = tickUntil(logic, (l) => l.state === "DOOR_OPEN" && l.currentFloor === floor, 3000);
    assert.strictEqual(ok, true, "Expected DOOR_OPEN at floor " + floor + ", got state=" + logic.state + " floor=" + logic.currentFloor);
}

function runUntilDoorClosed(logic) {
    const ok = tickUntil(logic, (l) => l.state !== "DOOR_OPEN" && l.state !== "DOOR_OPENING" && l.doorOpenProgress === 0, 3000);
    assert.strictEqual(ok, true, "Expected doors to close, got state=" + logic.state);
}

const tests = [];

tests.push({
    name: "1. Lobby rush with more callers than capacity",
    fn: () => {
        const el = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
        el.callUp(0);
        runUntilDoorOpenAt(el, 0);
        const riders = ["p1", "p2", "p3", "p4"];
        riders.forEach((p, idx) => {
            const spot = el.reserveBoardingSpot(p);
            assert(spot !== null, "Spot should be available for " + p);
            el.completeBoard(p);
            el.pressDestination(idx + 2);
        });
        assert.strictEqual(el.currentCapacityFree(), 0);
        assert.strictEqual(el.reserveBoardingSpot("p5"), null);
        el.callUp(0);
        runUntilDoorClosed(el);
        assert(el.targetFloor > 0, "Next target must be above floor 0, got " + el.targetFloor);
    }
});

tests.push({
    name: "2. Passenger destinations outrank same-floor hall calls",
    fn: () => {
        const el = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
        el.callUp(0);
        runUntilDoorOpenAt(el, 0);
        el.reserveBoardingSpot("p1");
        el.completeBoard("p1");
        el.pressDestination(4);
        el.callUp(0);
        el.callDown(0);
        runUntilDoorClosed(el);
        assert.strictEqual(el.state, "MOVING");
        assert.strictEqual(el.targetFloor, 4);
    }
});

tests.push({
    name: "3. Repeated hall-call pressing cannot starve riders",
    fn: () => {
        const el = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
        el.callUp(0);
        runUntilDoorOpenAt(el, 0);
        el.reserveBoardingSpot("p1");
        el.completeBoard("p1");
        el.pressDestination(3);
        let reached3 = false;
        for (let i = 0; i < 600; i++) {
            el.callUp(0);
            el.tick(0.05);
            if (el.state === "DOOR_OPEN" && el.currentFloor === 3) {
                reached3 = true;
                break;
            }
        }
        assert.strictEqual(reached3, true, "Car must reach passenger destination floor 3 despite repeated callUp(0)");
    }
});

tests.push({
    name: "4. Opposite-direction calls wait their turn",
    fn: () => {
        const el = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
        el.callUp(0);
        runUntilDoorOpenAt(el, 0);
        el.reserveBoardingSpot("p1");
        el.completeBoard("p1");
        el.pressDestination(4);
        runUntilDoorClosed(el);
        el.callDown(1);
        el.callDown(0);
        runUntilDoorOpenAt(el, 4);
        assert.strictEqual(el.currentFloor, 4);
    }
});

tests.push({
    name: "5. Door hold and safety cap",
    fn: () => {
        const el = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
        el.callUp(0);
        runUntilDoorOpenAt(el, 0);
        el.reserveBoardingSpot("slowRider");
        for (let t = 0; t < 3.0; t += 0.1) {
            el.tick(0.1);
        }
        assert.strictEqual(el.state, "DOOR_OPEN", "Doors should remain open while pendingBoarders is non-empty");
        for (let t = 0; t < 4.0; t += 0.1) {
            el.tick(0.1);
        }
        assert(el.state === "DOOR_CLOSING" || el.state === "IDLE", "Doors must close after MAX_DOOR_OPEN_S safety cap");
    }
});

tests.push({
    name: "6. Destination preserved across the action handshake",
    fn: () => {
        const el = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
        const planActions = [
            { type: "WAIT_AT_PANEL", floor: 0, dir: 1, toFloor: 5 },
            { type: "ENTER_ELEVATOR", toFloor: 5 },
            { type: "PRESS_FLOOR", floor: 5 },
            { type: "WAIT_FOR_FLOOR", floor: 5 }
        ];
        const waitAct = planActions[0];
        if (waitAct.dir > 0) el.callUp(waitAct.floor);
        runUntilDoorOpenAt(el, 0);
        assert.strictEqual(el.isAcceptingAt(0, waitAct.dir), true);

        const enterAct = planActions[1];
        assert.strictEqual(enterAct.toFloor, 5);
        const spot = el.reserveBoardingSpot("rider5");
        assert(spot !== null);
        el.completeBoard("rider5");

        const pressAct = planActions[2];
        el.pressDestination(pressAct.floor);
        assert.strictEqual(el.destinations.has(5), true);
        assert.strictEqual(el.destinations.has(1), false);

        const waitFloorAct = planActions[3];
        runUntilDoorOpenAt(el, waitFloorAct.floor);
        assert.strictEqual(el.currentFloor, 5);
    }
});

tests.push({
    name: "7. Reset clears phantom state",
    fn: () => {
        const el = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
        el.callUp(2);
        el.callDown(4);
        el.pressDestination(5);
        el.reserveBoardingSpot("p1");
        el.completeBoard("p1");
        el.registerDisembark("p1");
        el.tick(0.5);
        el.reset();
        assert.strictEqual(el.state, "IDLE");
        assert.strictEqual(el.currentFloor, 0);
        assert.strictEqual(el.targetFloor, null);
        assert.strictEqual(el.direction, 0);
        assert.strictEqual(el.upCalls.size, 0);
        assert.strictEqual(el.downCalls.size, 0);
        assert.strictEqual(el.destinations.size, 0);
        assert.strictEqual(el.passengers.size, 0);
        assert.strictEqual(el.pendingBoarders.size, 0);
        assert.strictEqual(el.pendingDisembark.size, 0);
        assert.strictEqual(el.currentCapacityFree(), 4);
    }
});

let passed = 0;
let failed = 0;
for (let i = 0; i < tests.length; i++) {
    const t = tests[i];
    try {
        t.fn();
        console.log("PASS: " + t.name);
        passed++;
    } catch (err) {
        console.error("FAIL: " + t.name + " -> " + err.message);
        failed++;
    }
}
console.log("Summary: " + passed + " passed, " + failed + " failed.");
if (failed > 0) process.exit(1);

