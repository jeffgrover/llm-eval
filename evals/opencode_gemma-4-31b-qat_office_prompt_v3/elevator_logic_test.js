const assert = require("assert");
const { ElevatorLogic } = require("./elevator_logic.js");

function tickUntil(logic, predicate, maxTicks = 1000) {
    for (let i = 0; i < maxTicks; i++) {
        if (predicate(logic)) return true;
        logic.tick(0.1);
    }
    return false;
}

function testLobbyRush() {
    const logic = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    logic.callUp(0);
    tickUntil(logic, l => l.state === 'DOOR_OPEN');
    
    const people = [];
    for (let i = 0; i < 6; i++) {
        const p = { id: i };
        const spot = logic.reserveBoardingSpot(p);
        if (spot) {
            people.push(p);
            logic.completeBoard(p);
        }
    }
    
    // Only 4 should have boarded
    assert.strictEqual(logic.passengers.size, 4);
    
    // Set destinations for those 4
    logic.pressDestination(5);
    
    // Simulate more people calling up at floor 0
    logic.callUp(0);
    
    tickUntil(logic, l => l.state === 'MOVING');
    assert.strictEqual(logic.direction, 1);
    assert.notStrictEqual(logic.targetFloor, 0, "Should move away from lobby when full");
    console.log("PASS: Lobby rush");
}

function testPriority() {
    const logic = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    logic.callUp(0);
    tickUntil(logic, l => l.state === 'DOOR_OPEN');
    
    const p = { id: 1 };
    logic.reserveBoardingSpot(p);
    logic.completeBoard(p);
    logic.pressDestination(5);
    
    // Call up at floor 0 again while passenger wants floor 5
    logic.callUp(0);
    
    logic.tick(3.0); // should trigger DOOR_CLOSING
    assert.notStrictEqual(logic.state, 'DOOR_OPEN', "Should close doors to serve passenger destination");
    console.log("PASS: Priority");
}

function testOppositeDirection() {
    const logic = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    logic.callUp(2);
    tickUntil(logic, l => l.currentFloor === 2 && l.state === 'DOOR_OPEN');
    
    // While at floor 2, someone calls down at floor 1
    logic.callDown(1);
    // But someone else wants to go to floor 4
    logic.pressDestination(4);
    
    logic.tick(3.0); // Close doors
    tickUntil(logic, l => l.state === 'MOVING');
    assert.strictEqual(logic.direction, 1, "Should continue UP to floor 4 first");
    console.log("PASS: Opposite direction");
}

function testReset() {
    const logic = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    logic.callUp(5);
    logic.tick(1.0);
    logic.reset();
    assert.strictEqual(logic.currentFloor, 0);
    assert.strictEqual(logic.upCalls.size, 0);
    assert.strictEqual(logic.passengers.size, 0);
    console.log("PASS: Reset");
}

try {
    testLobbyRush();
    testPriority();
    testOppositeDirection();
    testReset();
    console.log("\nALL TESTS PASSED");
} catch (e) {
    console.error("\nTEST FAILED:", e);
    process.exit(1);
}
