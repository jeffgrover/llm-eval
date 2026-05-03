const assert = require("assert");
const { ElevatorLogic } = require("./elevator_logic.js");

function tickUntil(logic, predicate, maxTicks = 1000, dt = 0.1) {
    for (let i = 0; i < maxTicks; i++) {
        logic.tick(dt);
        if (predicate()) return true;
    }
    return false;
}

function runTests() {
    console.log("Running ElevatorLogic tests...");
    let fails = 0;

    const runTest = (name, fn) => {
        try {
            fn();
            console.log(`  [PASS] ${name}`);
        } catch (e) {
            console.error(`  [FAIL] ${name}`);
            console.error(e.stack || e);
            fails++;
        }
    };

    // Test 1: Lobby rush
    runTest("Lobby rush with more callers than capacity", () => {
        const logic = new ElevatorLogic();
        logic.callUp(0);
        assert(tickUntil(logic, () => logic.state === logic.STATE.DOOR_OPEN && logic.currentFloor === 0));
        
        // 4 board
        const p1 = {id: 1}, p2 = {id: 2}, p3 = {id: 3}, p4 = {id: 4};
        logic.reserveBoardingSpot(p1); logic.completeBoard(p1);
        logic.reserveBoardingSpot(p2); logic.completeBoard(p2);
        logic.reserveBoardingSpot(p3); logic.completeBoard(p3);
        logic.reserveBoardingSpot(p4); logic.completeBoard(p4);
        
        // Press upper floors
        logic.pressDestination(3);
        logic.pressDestination(5);

        // Leftover caller presses up
        logic.callUp(0);

        // wait for door to close and start moving
        assert(tickUntil(logic, () => logic.state === logic.STATE.MOVING || logic.targetFloor !== 0));
        assert.notEqual(logic.targetFloor, 0, "Car reopened at 0 instead of serving passengers");
        assert.equal(logic.targetFloor, 3, "Next target should be 3");
    });

    // Test 2: Destinations outrank same-floor
    runTest("Passenger destinations outrank same-floor hall calls", () => {
        const logic = new ElevatorLogic();
        logic.callUp(2);
        assert(tickUntil(logic, () => logic.state === logic.STATE.DOOR_OPEN && logic.currentFloor === 2));
        
        const p1 = {id:1};
        logic.reserveBoardingSpot(p1); logic.completeBoard(p1);
        logic.pressDestination(5);
        
        // Now while doors are open, someone else at floor 2 presses callDown.
        logic.callDown(2);
        
        // Tick until doors close
        assert(tickUntil(logic, () => logic.state === logic.STATE.MOVING));
        assert.equal(logic.targetFloor, 5, "Car must go to destination 5, not reopen at 2");
    });

    // Test 3: Repeated pressing cannot starve
    runTest("Repeated hall-call pressing cannot starve riders", () => {
        const logic = new ElevatorLogic();
        logic.callUp(1);
        assert(tickUntil(logic, () => logic.state === logic.STATE.DOOR_OPEN && logic.currentFloor === 1));
        
        const p1 = {id:1};
        logic.reserveBoardingSpot(p1); logic.completeBoard(p1);
        logic.pressDestination(4);
        
        // Spammed UP calls at floor 1 during close
        for (let i = 0; i < 50; i++) {
            logic.tick(0.1);
            logic.callUp(1);
        }
        assert(tickUntil(logic, () => logic.state === logic.STATE.MOVING));
        assert.equal(logic.targetFloor, 4);
    });

    // Test 4: Opposite calls wait
    runTest("Opposite-direction calls wait their turn", () => {
        const logic = new ElevatorLogic();
        logic.callUp(0);
        assert(tickUntil(logic, () => logic.state === logic.STATE.DOOR_OPEN && logic.currentFloor === 0));
        
        logic.pressDestination(5);
        
        assert(tickUntil(logic, () => logic.state === logic.STATE.MOVING));
        
        // Re-eval check: during moving to 5, a down call happens at 2
        logic.callDown(2);
        
        assert(tickUntil(logic, () => logic.state === logic.STATE.DOOR_OPEN));
        assert.equal(logic.currentFloor, 5, "Should serve up destination 5 before down call 2");
    });

    // Test 5: Door hold and max cap
    runTest("Door hold and safety cap", () => {
        const logic = new ElevatorLogic();
        logic.callUp(0);
        assert(tickUntil(logic, () => logic.state === logic.STATE.DOOR_OPEN));
        
        // Board but don't complete
        logic.reserveBoardingSpot({id:1});
        
        // tick 5 seconds (MIN is 3)
        for (let i=0; i<50; i++) logic.tick(0.1);
        assert.equal(logic.state, logic.STATE.DOOR_OPEN, "Doors should be held open by pending boarder");
        
        // tick another 6 seconds (total 11 > 10 max)
        for (let i=0; i<60; i++) logic.tick(0.1);
        assert.equal(logic.state, logic.STATE.DOOR_CLOSING, "Doors must close after MAX_DOOR_OPEN_S");
    });

    // Test 7: Reset clears phantom state
    runTest("Reset clears phantom state", () => {
        const logic = new ElevatorLogic();
        logic.callUp(3);
        assert(tickUntil(logic, () => logic.state === logic.STATE.DOOR_OPEN));
        const p = {id:1};
        logic.reserveBoardingSpot(p); logic.completeBoard(p);
        logic.pressDestination(5);
        logic.registerDisembark(p);
        
        logic.reset();
        assert.equal(logic.state, logic.STATE.IDLE);
        assert.equal(logic.upCalls.size, 0);
        assert.equal(logic.passengers.size, 0);
        assert.equal(logic.pendingDisembark.size, 0);
        assert.equal(logic.spotOccupancy[0], null);
        assert.equal(logic.currentFloor, 0);
    });

    if (fails > 0) {
        console.error(`\nFailed ${fails} tests.`);
        process.exit(1);
    } else {
        console.log("\nAll tests passed!");
    }
}

runTests();
