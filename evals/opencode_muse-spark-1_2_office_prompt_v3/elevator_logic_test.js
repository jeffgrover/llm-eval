const assert = require("assert");
const { ElevatorLogic } = require("./elevator_logic.js");

function tickUntil(logic, predicate, maxIter){
    maxIter = maxIter || 5000;
    for(var i=0;i<maxIter;i++){
        logic.tick(0.05);
        if(typeof predicate === 'string'){
            if(logic.state === predicate) return;
        } else if(predicate(logic)) return;
    }
    throw new Error("tickUntil timeout waiting for "+predicate);
}
function runUntilDoorOpenAt(logic, floor){
    tickUntil(logic, function(l){ return l.state==='DOOR_OPEN' && l.currentFloor===floor; }, 8000);
}
function runUntilDoorClosed(logic){
    tickUntil(logic, function(l){ return l.state==='IDLE' || l.state==='MOVING'; }, 8000);
    // ensure fully closed transit
    for(var i=0;i<20;i++) logic.tick(0.05);
}

var passed=0, failed=0;
function test(name, fn){
    try{ fn(); console.log("PASS: "+name); passed++; } catch(e){ console.log("FAIL: "+name+" - "+e.message); console.log(e.stack); failed++; }
}

test("Lobby rush with more callers than capacity", function(){
    var e=new ElevatorLogic({floorCount:6, maxCapacity:4});
    e.callUp(0);
    runUntilDoorOpenAt(e,0);
    // board 4
    var persons=[{id:1},{id:2},{id:3},{id:4}];
    persons.forEach(function(p){
        var spot=e.reserveBoardingSpot(p);
        assert(spot, "should get spot");
        p._elevatorSpotIndex=spot.index;
        e.completeBoard(p);
    });
    e.pressDestination(5); e.pressDestination(4); e.pressDestination(3); e.pressDestination(2);
    // leftover callers re-press
    e.callUp(0);
    // wait until doors close and moving
    tickUntil(e, function(l){ return l.state==='MOVING'; }, 8000);
    assert(e.targetFloor>0, "next target must be above floor 0, got "+e.targetFloor);
    assert(e.currentFloor===0 || e.pos>0, "should be leaving floor 0");
});

test("Passenger destinations outrank same-floor hall calls", function(){
    var e=new ElevatorLogic({floorCount:6, maxCapacity:4});
    e.callUp(0);
    runUntilDoorOpenAt(e,0);
    var p={id:10};
    var spot=e.reserveBoardingSpot(p); p._elevatorSpotIndex=spot.index; e.completeBoard(p);
    e.pressDestination(5);
    // add same-floor hall call while destinations exist
    e.callUp(0);
    // tick through door close - should not reopen at 0
    tickUntil(e, function(l){ return l.state==='MOVING'; }, 8000);
    assert(e.targetFloor===5, "should go to 5 not reopen at 0, got "+e.targetFloor);
});

test("Repeated hall-call pressing cannot starve riders", function(){
    var e=new ElevatorLogic({floorCount:6, maxCapacity:4});
    e.callUp(0);
    runUntilDoorOpenAt(e,0);
    var p={id:20}; var s=e.reserveBoardingSpot(p); p._elevatorSpotIndex=s.index; e.completeBoard(p);
    e.pressDestination(3);
    // repeatedly press
    for(var i=0;i<10;i++){ e.callUp(0); e.tick(0.05); }
    tickUntil(e, function(l){ return l.state==='DOOR_OPEN' && l.currentFloor===3; }, 10000);
    assert(e.currentFloor===3, "should reach destination 3");
});

test("Opposite-direction calls wait their turn", function(){
    var e=new ElevatorLogic({floorCount:6, maxCapacity:4});
    // start at 0, go to 4
    e.pressDestination(4);
    e.callUp(0);
    runUntilDoorOpenAt(e,0);
    var p={id:30}; var sp=e.reserveBoardingSpot(p); p._elevatorSpotIndex=sp.index; e.completeBoard(p);
    e.pressDestination(4);
    tickUntil(e, function(l){ return l.state==='MOVING'; }, 4000);
    // while moving up, add down call at 1
    e.callDown(1);
    // should still go to 4 first
    runUntilDoorOpenAt(e,4);
    assert(e.currentFloor===4, "should serve upward destination before down call");
});

test("Door hold and safety cap", function(){
    var e=new ElevatorLogic({floorCount:6, maxCapacity:4});
    e.callUp(0);
    runUntilDoorOpenAt(e,0);
    var p={id:40}; var spot=e.reserveBoardingSpot(p); p._elevatorSpotIndex=spot.index;
    // keep pending for longer than MIN but less than MAX
    for(var i=0;i<20;i++){ e.tick(0.05); assert(e.state==='DOOR_OPEN', "should stay open while pending"); }
    // complete board
    e.completeBoard(p);
    e.pressDestination(2);
    tickUntil(e, function(l){ return l.state==='MOVING'; }, 4000);
    assert(e.state==='MOVING', "should move after pending cleared");

    // safety cap: never complete
    var e2=new ElevatorLogic({floorCount:6, maxCapacity:4});
    e2.callUp(0);
    runUntilDoorOpenAt(e2,0);
    var p2={id:41}; e2.reserveBoardingSpot(p2);
    // tick beyond MAX
    for(var j=0;j<200;j++) e2.tick(0.05);
    assert(e2.state!=='DOOR_OPEN', "should have closed after MAX_DOOR_OPEN_S, got "+e2.state);
});

test("Destination preserved across action handshake", function(){
    var e=new ElevatorLogic({floorCount:6, maxCapacity:4});
    e.callUp(0);
    runUntilDoorOpenAt(e,0);
    var person={id:50};
    var spot=e.reserveBoardingSpot(person); person._elevatorSpotIndex=spot.index; e.completeBoard(person);
    e.pressDestination(5);
    assert(e.destinations.has(5), "destination 5 must be stored");
    assert(!e.destinations.has(1), "should not be 1");
    tickUntil(e, function(l){ return l.state==='DOOR_OPEN' && l.currentFloor===5; }, 15000);
    assert(e.currentFloor===5, "should arrive at 5");
});

test("Reset clears phantom state", function(){
    var e=new ElevatorLogic({floorCount:6, maxCapacity:4});
    e.callUp(2); e.callDown(3); e.pressDestination(4);
    var p={id:60}; var s=e.reserveBoardingSpot(p); p._elevatorSpotIndex=s.index; e.completeBoard(p);
    e.registerDisembark(p);
    e.tick(0.1);
    e.reset();
    assert(e.upCalls.size===0, "upCalls cleared");
    assert(e.downCalls.size===0, "downCalls cleared");
    assert(e.destinations.size===0, "dest cleared");
    assert(e.passengers.size===0, "passengers cleared");
    assert(e.pendingBoarders.size===0, "pendingBoarders cleared");
    assert(e.pendingDisembark.size===0, "pendingDisembark cleared");
    assert(e.direction===0, "direction reset");
    assert(e.targetFloor===0, "target reset");
    assert(e.state==='IDLE', "state idle");
    assert(e.currentFloor===0, "floor 0");
    for(var i=0;i<e.spotOccupancy.length;i++) assert(!e.spotOccupancy[i], "spot free");
});

console.log("\nSummary: "+passed+" passed, "+failed+" failed");
if(failed>0) process.exit(1);
