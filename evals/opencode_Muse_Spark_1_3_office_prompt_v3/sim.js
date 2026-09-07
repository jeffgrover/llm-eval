var scene = null;
var camera = null;
var renderer = null;
var controls = null;
var simWorld = null;
var elevator = null;
var simAgents = [];
var simSeatReservations = new Set();
var simTargetOccupancy = 45;
var simHud = null;
var simHudTime = null;
var simHudStates = null;
var simHudElev = null;
var simLastReal = 0;

var SIM_MAX_WORKERS = 20;
var SIM_MAX_VISITORS = 80;
var SIM_MAX_OCCUPANCY = 100;
var SIM_MEETING_PROB = 0.36;
var SIM_FIRST_NAMES = ["Amy", "Bob", "Cat", "Dan", "Eve", "Finn", "Gia", "Hal", "Ivy", "Jay", "Kim", "Leo", "Mia", "Ned", "Ora", "Pat", "Quin", "Rae", "Sam", "Tia", "Uma", "Vic", "Wes", "Xia", "Yara", "Zed", "Noa", "Eli", "Ava", "Owen"];

var SimClock = {
    simMinute: 7 * 60 + 30,
    timeScale: 120,
    dayCount: 0,
    tick: function(realDt) {
        this.simMinute += realDt * this.timeScale / 60;
        if (this.simMinute >= 24 * 60) {
            this.simMinute -= 24 * 60;
            this.dayCount += 1;
            simResetDay();
        }
    },
    format: function() {
        var m = Math.floor(this.simMinute);
        var h24 = Math.floor(m / 60) % 24;
        var mm = m % 60;
        var ap = h24 >= 12 ? "PM" : "AM";
        var h12 = h24 % 12;
        if (h12 === 0) { h12 = 12; }
        var mstr = mm < 10 ? "0" + mm : "" + mm;
        return " " + h12 + ":" + mstr + " " + ap;
    }
};
window.SimClock = SimClock;
window.simAgents = simAgents;

function simRand(a, b) { return a + Math.random() * (b - a); }
function simRandInt(a, b) { return Math.floor(simRand(a, b + 1)); }
function simPick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function simResampleWorker(agent) {
    agent.arrivalTime = simRand(8 * 60 + 15, 9 * 60 + 30);
    agent.lunchTime = simRand(11 * 60 + 30, 13 * 60 + 30);
    agent.lunchDuration = simRand(25, 60);
    if (Math.random() < 0.15) {
        agent.departureTime = simRand(18 * 60 + 30, 19 * 60 + 45);
    } else {
        agent.departureTime = simRand(16 * 60 + 45, 18 * 60 + 30);
    }
    agent.hasLunched = false;
    agent.plannedMeetingTimes = [];
    var nMeet = Math.random() < 0.4 ? (Math.random() < 0.4 ? 2 : 1) : (Math.random() < 0.25 ? 1 : 0);
    if (nMeet >= 1) { agent.plannedMeetingTimes.push(simRand(9 * 60 + 30, 11 * 60 + 30)); }
    if (nMeet >= 2) { agent.plannedMeetingTimes.push(simRand(13 * 60 + 30, 16 * 60)); }
    agent.plannedMeetingTimes.sort(function(a, b) { return a - b; });
}

function simResampleVisitor(agent, soonMin) {
    if (soonMin !== undefined && soonMin !== null) {
        agent.arrivalTime = SimClock.simMinute + soonMin;
    } else {
        agent.arrivalTime = simRand(7 * 60 + 31, 8 * 60 + 30);
    }
    agent.visitDuration = simRand(20, 90);
    agent.lunchTime = 1000000000;
    agent.departureTime = 1000000000;
    agent.hasLunched = true;
    agent.plannedMeetingTimes = [];
}

function simMakeAgent(id, role) {
    var group = window.createPerson({});
    group.visible = false;
    var agent = {
        id: id,
        role: role,
        name: simPick(SIM_FIRST_NAMES) + id,
        homeFloor: null,
        deskWpName: null,
        deskDoorWpName: null,
        group: group,
        floor: 0,
        state: "AWAY",
        plan: [],
        currentAction: null,
        inCar: false,
        seatKey: null,
        walkSpeed: 1.3,
        path: null,
        pathIdx: 0,
        stallT: 0,
        prevPos: new THREE.Vector3(),
        reservedSpot: null,
        boardPhase: 0,
        exitPhase: 0
    };
    return agent;
}

function simBuildPopulation() {
    simAgents = [];
    window.simAgents = simAgents;
    for (var i = 0; i < SIM_MAX_WORKERS; i++) {
        var w = simMakeAgent(i, "WORKER");
        w.homeFloor = 1 + (i % 5);
        var deskIdx = Math.floor(i / 5) % 4;
        var fl = null;
        void fl;
        w.deskIdx = deskIdx;
        var names = ["officeA", "officeB", "officeC", "officeD"];
        w.deskWpName = names[deskIdx] + "_desk";
        w.deskDoorWpName = names[deskIdx] + "_door";
        simResampleWorker(w);
        simAgents.push(w);
    }
    for (var j = 0; j < SIM_MAX_VISITORS; j++) {
        var v = simMakeAgent(SIM_MAX_WORKERS + j, "VISITOR");
        simResampleVisitor(v);
        simAgents.push(v);
    }
}

function simApplyOccupancy() {
    for (var i = 0; i < simAgents.length; i++) {
        var agent = simAgents[i];
        if (agent.id < simTargetOccupancy) {
            if (agent.state === "DISABLED") {
                agent.state = "AWAY";
                if (agent.role === "VISITOR") { simResampleVisitor(agent, simRand(0, 20)); }
                else { simResampleWorker(agent); }
            }
        } else {
            if (agent.state === "AWAY" || agent.state === "GONE") {
                agent.state = "DISABLED";
                if (agent.group.parent) { agent.group.parent.remove(agent.group); }
                agent.group.visible = false;
            }
        }
    }
}

function simCountPresent() {
    var n = 0;
    for (var i = 0; i < simAgents.length; i++) {
        var s = simAgents[i].state;
        if (s !== "AWAY" && s !== "GONE" && s !== "DISABLED") { n++; }
    }
    return n;
}

function simTopUpVisitors() {
    if (SimClock.simMinute < 7 * 60 || SimClock.simMinute > 18 * 60 + 30) { return; }
    var deficit = simTargetOccupancy - simCountPresent();
    if (deficit <= 0) { return; }
    var armed = 0;
    for (var i = 0; i < simAgents.length && armed < deficit; i++) {
        var agent = simAgents[i];
        if (agent.role === "VISITOR" && (agent.state === "AWAY" || agent.state === "GONE")) {
            simResampleVisitor(agent, simRand(0, 6));
            agent.state = "AWAY";
            if (agent.group.parent) { agent.group.parent.remove(agent.group); }
            agent.group.visible = false;
            armed++;
        }
    }
}

function simResetDay() {
    simSeatReservations.clear();
    if (elevator) { elevator.reset(); }
    for (var i = 0; i < simAgents.length; i++) {
        var agent = simAgents[i];
        if (agent.group.parent) { agent.group.parent.remove(agent.group); }
        agent.group.visible = false;
        agent.plan = [];
        agent.currentAction = null;
        agent.inCar = false;
        agent.seatKey = null;
        agent.reservedSpot = null;
        agent.floor = 0;
        if (agent.id < simTargetOccupancy) {
            agent.state = "AWAY";
            if (agent.role === "WORKER") { simResampleWorker(agent); }
            else { simResampleVisitor(agent); }
        } else {
            agent.state = "DISABLED";
        }
    }
}

function simFloorY(floor) { return floor * window.WORLD.FLOOR_HEIGHT; }

function simNearestNodeName(floor, pos) {
    var nodes = simWorld.floors[floor].nodes;
    var best = null;
    var bd = 1000000000;
    for (var k in nodes) {
        if (k === "_links") { continue; }
        var v = nodes[k];
        var dx = v.x - pos.x;
        var dz = v.z - pos.z;
        var d = dx * dx + dz * dz;
        if (d < bd) { bd = d; best = k; }
    }
    return best;
}

function simPathFor(agent, floor, wpName) {
    var nodes = simWorld.floors[floor].nodes;
    if (!nodes[wpName]) { return [new THREE.Vector3(agent.group.position.x, 0, agent.group.position.z)]; }
    var fromName = simNearestNodeName(floor, agent.group.position);
    if (!fromName) { return [nodes[wpName].clone()]; }
    var pts = window.bfsPath(nodes, fromName, wpName);
    return pts;
}

function simPushTravel(list, fromFloor, toFloor, destFloor) {
    if (fromFloor === toFloor) { return; }
    var dir = toFloor > fromFloor ? 1 : -1;
    list.push({ type: "WALK_TO_WP", floor: fromFloor, wp: "elevWait" });
    list.push({ type: "WAIT_AT_PANEL", floor: fromFloor, dir: dir, toFloor: destFloor });
    list.push({ type: "ENTER_ELEVATOR", toFloor: destFloor });
    list.push({ type: "PRESS_FLOOR", floor: destFloor });
    list.push({ type: "WAIT_FOR_FLOOR", floor: toFloor });
    list.push({ type: "EXIT_ELEVATOR", toFloor: toFloor });
}

function simReserveSeat(floor, wp) {
    var key = floor + ":" + wp;
    if (simSeatReservations.has(key)) { return null; }
    simSeatReservations.add(key);
    return key;
}
function simReleaseSeatKey(key) {
    if (key) { simSeatReservations.delete(key); }
}

function simFreeConfSeat(floor) {
    var seats = simWorld.floors[floor].confSeats;
    for (var i = 0; i < seats.length; i++) {
        var key = simReserveSeat(floor, seats[i]);
        if (key) { return { wp: seats[i], key: key }; }
    }
    return null;
}

function simPlanArriveToDesk(agent) {
    var list = [];
    list.push({ type: "ENTER_STATE", state: "ARRIVING" });
    list.push({ type: "WALK_TO_WP", floor: 0, wp: "front_door_threshold" });
    list.push({ type: "WALK_TO_WP", floor: 0, wp: "entrance" });
    list.push({ type: "WALK_TO_WP", floor: 0, wp: "lobby_center" });
    simPushTravel(list, 0, agent.homeFloor, agent.homeFloor);
    list.push({ type: "WALK_TO_WP", floor: agent.homeFloor, wp: agent.deskDoorWpName });
    list.push({ type: "WALK_TO_WP", floor: agent.homeFloor, wp: agent.deskWpName });
    list.push({ type: "SIT", floor: agent.homeFloor, wp: agent.deskWpName });
    list.push({ type: "ENTER_STATE", state: "AT_DESK" });
    list.push({ type: "WAIT_SIM", minutes: simRand(25, 70) });
    list.push({ type: "PICK_NEXT_ACTIVITY" });
    return list;
}

function simPlanGoToLunch(agent) {
    var list = [];
    list.push({ type: "STAND" });
    list.push({ type: "WALK_TO_WP", floor: agent.floor, wp: agent.deskDoorWpName });
    var fromF = agent.floor;
    simPushTravel(list, fromF, 0, 0);
    var seatIdx = agent.id % 4;
    var seatName = "bistro_seat" + seatIdx;
    list.push({ type: "WALK_TO_WP", floor: 0, wp: "cafe_door" });
    list.push({ type: "WALK_TO_WP", floor: 0, wp: seatName });
    list.push({ type: "SIT", floor: 0, wp: seatName });
    list.push({ type: "ENTER_STATE", state: "AT_LUNCH" });
    list.push({ type: "WAIT_SIM", minutes: agent.lunchDuration });
    list.push({ type: "MARK_LUNCHED" });
    list.push({ type: "STAND" });
    list.push({ type: "WALK_TO_WP", floor: 0, wp: "lobby_center" });
    simPushTravel(list, 0, agent.homeFloor, agent.homeFloor);
    list.push({ type: "WALK_TO_WP", floor: agent.homeFloor, wp: agent.deskDoorWpName });
    list.push({ type: "WALK_TO_WP", floor: agent.homeFloor, wp: agent.deskWpName });
    list.push({ type: "SIT", floor: agent.homeFloor, wp: agent.deskWpName });
    list.push({ type: "ENTER_STATE", state: "AT_DESK" });
    list.push({ type: "WAIT_SIM", minutes: simRand(20, 60) });
    list.push({ type: "PICK_NEXT_ACTIVITY" });
    return list;
}

function simPlanVisitLounge(agent) {
    var list = [];
    var hf = agent.floor;
    var spots = simWorld.floors[hf] ? simWorld.floors[hf].loungeSpots : [];
    var spot = spots.length ? simPick(spots) : "lounge_spot0";
    list.push({ type: "STAND" });
    list.push({ type: "WALK_TO_WP", floor: hf, wp: "lounge_door" });
    list.push({ type: "WALK_TO_WP", floor: hf, wp: spot });
    list.push({ type: "SIT", floor: hf, wp: spot });
    list.push({ type: "ENTER_STATE", state: "AT_BREAK" });
    list.push({ type: "WAIT_SIM", minutes: simRand(5, 12) });
    list.push({ type: "STAND" });
    list.push({ type: "WALK_TO_WP", floor: hf, wp: agent.deskDoorWpName });
    list.push({ type: "WALK_TO_WP", floor: hf, wp: agent.deskWpName });
    list.push({ type: "SIT", floor: hf, wp: agent.deskWpName });
    list.push({ type: "ENTER_STATE", state: "AT_DESK" });
    list.push({ type: "WAIT_SIM", minutes: simRand(18, 50) });
    list.push({ type: "PICK_NEXT_ACTIVITY" });
    return list;
}

function simPlanAttendMeeting(agent, meetFloor) {
    var res = simFreeConfSeat(meetFloor);
    if (!res) { return simPlanVisitLounge(agent); }
    agent.seatKey = res.key;
    var list = [];
    var fromF = agent.floor;
    list.push({ type: "STAND" });
    if (fromF !== agent.homeFloor || true) {
        list.push({ type: "WALK_TO_WP", floor: fromF, wp: "elevWait" });
    }
    var tmp = [];
    simPushTravel(tmp, fromF, meetFloor, meetFloor);
    for (var i = 0; i < tmp.length; i++) { list.push(tmp[i]); }
    list.push({ type: "WALK_TO_WP", floor: meetFloor, wp: "conf_door" });
    list.push({ type: "WALK_TO_WP", floor: meetFloor, wp: "conf_center" });
    list.push({ type: "WALK_TO_WP", floor: meetFloor, wp: res.wp });
    list.push({ type: "SIT", floor: meetFloor, wp: res.wp, seatKey: res.key });
    list.push({ type: "ENTER_STATE", state: "IN_MEETING" });
    list.push({ type: "WAIT_SIM", minutes: simRand(22, 45) });
    list.push({ type: "STAND" });
    list.push({ type: "RELEASE_SEAT", key: res.key });
    var back = [];
    simPushTravel(back, meetFloor, agent.homeFloor, agent.homeFloor);
    for (var j = 0; j < back.length; j++) { list.push(back[j]); }
    list.push({ type: "WALK_TO_WP", floor: agent.homeFloor, wp: agent.deskDoorWpName });
    list.push({ type: "WALK_TO_WP", floor: agent.homeFloor, wp: agent.deskWpName });
    list.push({ type: "SIT", floor: agent.homeFloor, wp: agent.deskWpName });
    list.push({ type: "ENTER_STATE", state: "AT_DESK" });
    list.push({ type: "WAIT_SIM", minutes: simRand(20, 55) });
    list.push({ type: "PICK_NEXT_ACTIVITY" });
    return list;
}

function simPlanVisitCoworker(agent) {
    var candidates = [];
    for (var i = 0; i < simAgents.length; i++) {
        var other = simAgents[i];
        if (other !== agent && other.role === "WORKER" && other.state === "AT_DESK" && other.id < simTargetOccupancy) {
            candidates.push(other);
        }
    }
    if (candidates.length === 0) {
        return [{ type: "WAIT_SIM", minutes: simRand(18, 40) }, { type: "PICK_NEXT_ACTIVITY" }];
    }
    var target = simPick(candidates);
    var list = [];
    var fromF = agent.floor;
    list.push({ type: "STAND" });
    var tmp = [];
    simPushTravel(tmp, fromF, target.homeFloor, target.homeFloor);
    for (var k = 0; k < tmp.length; k++) { list.push(tmp[k]); }
    list.push({ type: "WALK_TO_WP", floor: target.homeFloor, wp: target.deskDoorWpName });
    list.push({ type: "ENTER_STATE", state: "VISITING" });
    list.push({ type: "WAIT_SIM", minutes: simRand(6, 18) });
    var back = [];
    simPushTravel(back, target.homeFloor, agent.homeFloor, agent.homeFloor);
    for (var m = 0; m < back.length; m++) { list.push(back[m]); }
    list.push({ type: "WALK_TO_WP", floor: agent.homeFloor, wp: agent.deskDoorWpName });
    list.push({ type: "WALK_TO_WP", floor: agent.homeFloor, wp: agent.deskWpName });
    list.push({ type: "SIT", floor: agent.homeFloor, wp: agent.deskWpName });
    list.push({ type: "ENTER_STATE", state: "AT_DESK" });
    list.push({ type: "WAIT_SIM", minutes: simRand(18, 50) });
    list.push({ type: "PICK_NEXT_ACTIVITY" });
    return list;
}

function simPlanLeaveBuilding(agent) {
    var list = [];
    list.push({ type: "STAND" });
    if (agent.seatKey) { list.push({ type: "RELEASE_SEAT", key: agent.seatKey }); agent.seatKey = null; }
    if (agent.role === "WORKER") {
        list.push({ type: "WALK_TO_WP", floor: agent.floor, wp: agent.deskDoorWpName });
        var fromF = agent.floor;
        simPushTravel(list, fromF, 0, 0);
    } else {
        if (agent.floor !== 0) {
            var ff = agent.floor;
            simPushTravel(list, ff, 0, 0);
        }
    }
    list.push({ type: "WALK_TO_WP", floor: 0, wp: "lobby_center" });
    list.push({ type: "WALK_TO_WP", floor: 0, wp: "entrance" });
    list.push({ type: "WALK_TO_WP", floor: 0, wp: "front_door_threshold" });
    list.push({ type: "WALK_TO_WP", floor: 0, wp: "outside" });
    list.push({ type: "EXIT_BUILDING" });
    return list;
}

function simPlanVisitorVisit(agent) {
    var list = [];
    list.push({ type: "ENTER_STATE", state: "VISITING" });
    list.push({ type: "WALK_TO_WP", floor: 0, wp: "front_door_threshold" });
    list.push({ type: "WALK_TO_WP", floor: 0, wp: "entrance" });
    list.push({ type: "WALK_TO_WP", floor: 0, wp: "lobby_center" });
    var roll = Math.random();
    var heldKey = null;
    var heldWp = null;
    var heldFloor = 0;
    if (roll < 0.10) {
        var bs = "bistro_seat" + simRandInt(0, 3);
        list.push({ type: "WALK_TO_WP", floor: 0, wp: "cafe_door" });
        list.push({ type: "WALK_TO_WP", floor: 0, wp: bs });
        list.push({ type: "SIT", floor: 0, wp: bs });
        list.push({ type: "WAIT_SIM", minutes: simRand(10, 25) });
        list.push({ type: "STAND" });
    } else if (roll < 0.16) {
        list.push({ type: "WALK_TO_WP", floor: 0, wp: "cafe_order" });
        list.push({ type: "WAIT_SIM", minutes: simRand(3, 8) });
    } else if (roll < 0.30) {
        var fl = simPick(["front_lounge_couch", "front_lounge_chairL", "front_lounge_chairR"]);
        list.push({ type: "WALK_TO_WP", floor: 0, wp: fl });
        list.push({ type: "SIT", floor: 0, wp: fl });
        list.push({ type: "WAIT_SIM", minutes: simRand(8, 25) });
        list.push({ type: "STAND" });
    } else if (roll < 0.42) {
        var bl = simPick(["back_lounge_N", "back_lounge_S", "pit_N", "pit_S", "pit_E", "pit_W"]);
        list.push({ type: "WALK_TO_WP", floor: 0, wp: bl });
        list.push({ type: "SIT", floor: 0, wp: bl });
        list.push({ type: "WAIT_SIM", minutes: simRand(8, 25) });
        list.push({ type: "STAND" });
    } else if (roll < 0.52) {
        var st = simPick(["reception", "kiosk", "lobby_wc_front", "lobby_wc_back"]);
        list.push({ type: "WALK_TO_WP", floor: 0, wp: st });
        list.push({ type: "WAIT_SIM", minutes: simRand(3, 10) });
    } else if (roll < 0.62) {
        var lo = simPick(["lobby_stand_center", "lobby_stand_NE", "lobby_stand_NW", "lobby_stand_midE", "lobby_stand_midW", "lobby_stand_entry"]);
        list.push({ type: "WALK_TO_WP", floor: 0, wp: lo });
        list.push({ type: "SIT", floor: 0, wp: lo });
        list.push({ type: "WAIT_SIM", minutes: simRand(5, 15) });
        list.push({ type: "STAND" });
    } else if (roll < 0.77) {
        var upF = simRandInt(1, 5);
        var tmp = [];
        simPushTravel(tmp, 0, upF, upF);
        for (var i = 0; i < tmp.length; i++) { list.push(tmp[i]); }
        var lsp = simPick(simWorld.floors[upF].loungeSpots.concat(["water_cooler", "hall_stand_N", "hall_stand_S"]));
        list.push({ type: "WALK_TO_WP", floor: upF, wp: lsp });
        list.push({ type: "SIT", floor: upF, wp: lsp });
        list.push({ type: "WAIT_SIM", minutes: simRand(8, 20) });
        list.push({ type: "STAND" });
        var back = [];
        simPushTravel(back, upF, 0, 0);
        for (var j = 0; j < back.length; j++) { list.push(back[j]); }
    } else {
        var mf = simRandInt(1, 5);
        var res = simFreeConfSeat(mf);
        if (res) {
            heldKey = res.key; heldWp = res.wp; heldFloor = mf;
            agent.seatKey = heldKey;
            var t2 = [];
            simPushTravel(t2, 0, mf, mf);
            for (var a = 0; a < t2.length; a++) { list.push(t2[a]); }
            list.push({ type: "WALK_TO_WP", floor: mf, wp: "conf_door" });
            list.push({ type: "WALK_TO_WP", floor: mf, wp: "conf_center" });
            list.push({ type: "WALK_TO_WP", floor: mf, wp: heldWp });
            list.push({ type: "SIT", floor: mf, wp: heldWp, seatKey: heldKey });
            list.push({ type: "WAIT_SIM", minutes: simRand(15, 35) });
            list.push({ type: "STAND" });
            list.push({ type: "RELEASE_SEAT", key: heldKey });
            agent.seatKey = null;
            var b2 = [];
            simPushTravel(b2, mf, 0, 0);
            for (var b = 0; b < b2.length; b++) { list.push(b2[b]); }
        } else {
            list.push({ type: "WALK_TO_WP", floor: 0, wp: "lobby_stand_center" });
            list.push({ type: "WAIT_SIM", minutes: simRand(5, 15) });
        }
    }
    if (agent.floor !== 0) {
        var bf3 = [];
        void bf3;
    }
    list.push({ type: "WALK_TO_WP", floor: 0, wp: "lobby_center" });
    list.push({ type: "WALK_TO_WP", floor: 0, wp: "entrance" });
    list.push({ type: "WALK_TO_WP", floor: 0, wp: "front_door_threshold" });
    list.push({ type: "WALK_TO_WP", floor: 0, wp: "outside" });
    list.push({ type: "EXIT_BUILDING" });
    return list;
}

function simChooseNextActivity(agent) {
    if (SimClock.simMinute >= agent.departureTime) {
        agent.plan = simPlanLeaveBuilding(agent);
        return;
    }
    for (var i = agent.plannedMeetingTimes.length - 1; i >= 0; i--) {
        if (SimClock.simMinute >= agent.plannedMeetingTimes[i]) {
            agent.plannedMeetingTimes.splice(i, 1);
            var mf = Math.random() < 0.65 ? agent.homeFloor : simRandInt(1, 5);
            agent.plan = simPlanAttendMeeting(agent, mf);
            return;
        }
    }
    if (SimClock.simMinute >= agent.lunchTime && !agent.hasLunched) {
        agent.plan = simPlanGoToLunch(agent);
        return;
    }
    var r = Math.random();
    if (r < SIM_MEETING_PROB * 0.4) {
        var mf2 = Math.random() < 0.65 ? agent.homeFloor : simRandInt(1, 5);
        agent.plan = simPlanAttendMeeting(agent, mf2);
        return;
    } else if (r < 0.14 + 0.12) {
        agent.plan = simPlanVisitLounge(agent);
        return;
    } else if (r < 0.26 + 0.15) {
        agent.plan = simPlanVisitCoworker(agent);
        return;
    }
    agent.plan = [{ type: "WAIT_SIM", minutes: simRand(18, 65) }, { type: "PICK_NEXT_ACTIVITY" }];
}

function simSpawnAgent(agent) {
    scene.add(agent.group);
    agent.group.visible = true;
    var px = simRand(-1.1, 1.1);
    var pz = 12 + simRand(-0.75, 0.75);
    agent.group.position.set(px, 0, pz);
    agent.floor = 0;
    agent.inCar = false;
    agent.group.userData.isSitting = false;
    agent.group.userData.isWalking = false;
    if (agent.role === "WORKER") {
        agent.state = "ARRIVING";
        agent.plan = simPlanArriveToDesk(agent);
    } else {
        agent.state = "VISITING";
        agent.plan = simPlanVisitorVisit(agent);
    }
    agent.currentAction = null;
}

function simStartAction(agent, action) {
    if (action.type === "WALK_TO_WP") {
        agent.path = simPathFor(agent, action.floor, action.wp);
        agent.pathIdx = 0;
        agent.stallT = 0;
        agent.prevPos.copy(agent.group.position);
        agent.group.userData.isWalking = true;
        agent.group.userData.isSitting = false;
    } else if (action.type === "WAIT_SIM") {
        action.untilMin = SimClock.simMinute + action.minutes;
    } else if (action.type === "WAIT_AT_PANEL") {
        if (action.dir > 0) { elevator.callUp(action.floor); }
        else { elevator.callDown(action.floor); }
        agent.state = "WAITING_ELEVATOR";
    } else if (action.type === "ENTER_ELEVATOR") {
        agent.boardPhase = 0;
        agent.stallT = 0;
        agent.prevPos.copy(agent.group.position);
        agent.state = "WAITING_ELEVATOR";
    } else if (action.type === "EXIT_ELEVATOR") {
        agent.exitPhase = 0;
    } else if (action.type === "SIT") {
        void 0;
    }
}

function simFinishSIT(agent, action) {
    var tgt = simWorld.floors[action.floor].sitTargets[action.wp];
    var node = simWorld.floors[action.floor].nodes[action.wp];
    if (node) {
        agent.group.position.set(node.x, simFloorY(action.floor), node.z);
        if (tgt && !tgt.sit) {
            agent.group.position.x += simRand(-0.5, 0.5);
            agent.group.position.z += simRand(-0.5, 0.5);
        }
    }
    if (tgt) {
        agent.group.rotation.y = tgt.facing;
    }
    agent.group.userData.isSitting = !!(tgt && tgt.sit);
    agent.group.userData.isWalking = false;
    if (tgt && tgt.sit) {
        agent.group.position.y = simFloorY(action.floor) - 0.35;
    } else {
        agent.group.position.y = agent.inCar ? agent.group.position.y : simFloorY(action.floor);
    }
    if (action.seatKey) { agent.seatKey = action.seatKey; }
}

function simUpdateAction(agent, action, motionDt) {
    var FH = window.WORLD.FLOOR_HEIGHT;
    if (action.type === "WALK_TO_WP") {
        var entranceChain = (action.wp === "outside" || action.wp === "front_door_threshold" || action.wp === "entrance");
        if (!agent.path || agent.pathIdx >= agent.path.length) { return true; }
        var target = agent.path[agent.pathIdx];
        var ty = simFloorY(action.floor);
        var dx = target.x - agent.group.position.x;
        var dz = target.z - agent.group.position.z;
        var dy = ty - agent.group.position.y;
        var dist = Math.sqrt(dx * dx + dz * dz);
        if (Math.abs(dy) > 0.3) {
            agent.group.position.y += Math.sign(dy) * Math.min(Math.abs(dy), agent.walkSpeed * motionDt * 2);
        }
        var step = agent.walkSpeed * motionDt;
        if (dist < Math.max(0.15, step)) {
            agent.pathIdx++;
            agent.stallT = 0;
            if (agent.prevPos) { agent.prevPos.copy(agent.group.position); }
            if (agent.pathIdx >= agent.path.length) {
                agent.group.position.x = target.x;
                agent.group.position.z = target.z;
                agent.group.position.y = ty;
                agent.floor = action.floor;
                return true;
            }
            return false;
        }
        var nx = agent.group.position.x + (dx / dist) * Math.min(step, dist);
        var nz = agent.group.position.z + (dz / dist) * Math.min(step, dist);
        agent.group.position.x = nx;
        agent.group.position.z = nz;
        agent.group.position.y = ty;
        if (dist > 0.01) { agent.group.rotation.y = Math.atan2(dx, dz); }
        agent.group.userData.isWalking = true;
        var moved = agent.prevPos ? agent.prevPos.distanceTo(agent.group.position) : 1;
        if (moved < 0.005) {
            agent.stallT += motionDt;
            if (entranceChain && agent.stallT > 1.5) {
                agent.pathIdx++;
                agent.stallT = 0;
                if (agent.pathIdx >= agent.path.length) { agent.floor = action.floor; return true; }
            } else if (!entranceChain && agent.stallT > 1.2) {
                agent.pathIdx++;
                agent.stallT = 0;
                if (agent.pathIdx >= agent.path.length) { agent.floor = action.floor; return true; }
            }
        } else {
            agent.stallT = 0;
            if (agent.prevPos) { agent.prevPos.copy(agent.group.position); }
        }
        return false;
    }
    if (action.type === "WAIT_AT_PANEL") {
        if (action.dir > 0) {
            if (!elevator.upCalls.has(action.floor)) { elevator.callUp(action.floor); }
        } else {
            if (!elevator.downCalls.has(action.floor)) { elevator.callDown(action.floor); }
        }
        agent.state = "WAITING_ELEVATOR";
        agent.group.userData.isWalking = false;
        if (elevator.isAcceptingAt(action.floor, action.dir) && elevator.currentCapacityFree() > 0) {
            var spot = elevator.reserveBoardingSpot(agent);
            if (spot) {
                elevator.completeDisembark(agent);
                elevator.logic.pendingBoarders.delete(agent);
                elevator.logic.personSpot.delete(agent);
                for (var si = 0; si < elevator.logic.spotOccupied.length; si++) {
                    void si;
                }
                elevator.syncMirrors();
                agent.reservedSpot = spot;
                agent.state = "WAITING_ELEVATOR";
                var found = false;
                for (var pi = 0; pi < elevator.logic.spotOccupied.length; pi++) {
                    if (elevator.logic.spotOccupied[pi]) { found = true; }
                }
                void found;
                return true;
            }
        }
        return false;
    }
    if (action.type === "ENTER_ELEVATOR") {
        agent.state = "WAITING_ELEVATOR";
        if (agent.boardPhase === 0) {
            if (!agent.reservedSpot) {
                if (elevator.state !== "DOOR_OPEN" || elevator.currentFloor !== action.floorForBoard && elevator.currentFloor !== agent.floor) {
                    if (elevator.currentFloor !== agent.floor || elevator.state === "IDLE" || elevator.state === "MOVING") {
                        var needDir = action.toFloor > agent.floor ? 1 : -1;
                        if (needDir > 0) { elevator.callUp(agent.floor); }
                        else { elevator.callDown(agent.floor); }
                    }
                    return false;
                }
                var dir2 = action.toFloor > agent.floor ? 1 : -1;
                if (!elevator.isAcceptingAt(agent.floor, dir2)) { return false; }
                var sp = elevator.reserveBoardingSpot(agent);
                if (!sp) { return false; }
                agent.reservedSpot = sp;
            }
            agent.boardPhase = 1;
            agent.stallT = 0;
            agent.prevPos.copy(agent.group.position);
        }
        if (agent.boardPhase === 1) {
            var doorX = agent.reservedSpot ? agent.reservedSpot.x : 0;
            var tX = doorX;
            var tZ = 2.2;
            var ddx = tX - agent.group.position.x;
            var ddz = tZ - agent.group.position.z;
            var ddist = Math.sqrt(ddx * ddx + ddz * ddz);
            var bstep = agent.walkSpeed * motionDt;
            if (ddist < Math.max(0.18, bstep)) {
                agent.boardPhase = 2;
            } else {
                agent.group.position.x += (ddx / ddist) * Math.min(bstep, ddist);
                agent.group.position.z += (ddz / ddist) * Math.min(bstep, ddist);
                agent.group.position.y = simFloorY(agent.floor);
                if (ddist > 0.01) { agent.group.rotation.y = Math.atan2(ddx, ddz); }
                agent.group.userData.isWalking = true;
                var mv = agent.prevPos.distanceTo(agent.group.position);
                if (mv < 0.005) {
                    agent.stallT += motionDt;
                    if (agent.stallT > 1.5) {
                        agent.group.position.set(tX, simFloorY(agent.floor), tZ);
                        agent.boardPhase = 2;
                    }
                } else { agent.stallT = 0; agent.prevPos.copy(agent.group.position); }
                return false;
            }
        }
        if (agent.boardPhase === 2) {
            var sp2 = agent.reservedSpot;
            elevator.carGroup.updateMatrixWorld(true);
            var local = new THREE.Vector3(sp2.x, 0, sp2.z);
            var wp2 = elevator.carGroup.localToWorld(local.clone());
            if (agent.group.parent !== elevator.carGroup) {
                scene.remove(agent.group);
                elevator.carGroup.add(agent.group);
                agent.inCar = true;
            }
            agent.group.position.copy(elevator.carGroup.worldToLocal(wp2.clone()));
            agent.group.position.y = 0;
            var lx = agent.group.position.x;
            var lz = agent.group.position.z;
            var ldist = Math.sqrt(lx * lx + lz * lz);
            var lstep = agent.walkSpeed * motionDt;
            if (ldist < Math.max(0.12, lstep)) {
                agent.group.position.set(sp2.x, 0, sp2.z);
                agent.group.rotation.y = 0;
                agent.group.userData.isWalking = false;
                elevator.completeBoard(agent);
                agent.state = "IN_CAR";
                agent.reservedSpot = null;
                agent.boardPhase = 0;
                return true;
            }
            agent.group.position.x -= (lx / ldist) * Math.min(lstep, ldist);
            agent.group.position.z -= (lz / ldist) * Math.min(lstep, ldist);
            agent.group.rotation.y = Math.atan2(-lx, -lz);
            return false;
        }
        return false;
    }
    if (action.type === "PRESS_FLOOR") {
        elevator.pressDestination(action.floor);
        return true;
    }
    if (action.type === "WAIT_FOR_FLOOR") {
        agent.state = "IN_CAR";
        agent.group.userData.isWalking = false;
        if (elevator.state === "DOOR_OPEN" && elevator.currentFloor === action.floor) {
            elevator.registerDisembark(agent);
            return true;
        }
        return false;
    }
    if (action.type === "EXIT_ELEVATOR") {
        if (agent.exitPhase === 0) {
            elevator.registerDisembark(agent);
            agent.exitPhase = 1;
        }
        if (agent.exitPhase === 1) {
            if (agent.group.parent !== scene) {
                var wpos = new THREE.Vector3();
                agent.group.getWorldPosition(wpos);
                elevator.carGroup.remove(agent.group);
                scene.add(agent.group);
                agent.group.position.copy(wpos);
                agent.inCar = false;
            }
            var ey = simFloorY(action.toFloor);
            agent.group.position.y = ey;
            agent.floor = action.toFloor;
            agent.exitPhase = 2;
        }
        var eNode = simWorld.floors[action.toFloor].nodes["elevWait"];
        if (eNode) {
            var ex = eNode.x - agent.group.position.x;
            var ez = eNode.z - agent.group.position.z;
            var ed = Math.sqrt(ex * ex + ez * ez);
            var estep = agent.walkSpeed * motionDt;
            if (ed < Math.max(0.2, estep)) {
                agent.group.position.x = eNode.x;
                agent.group.position.z = eNode.z;
                agent.group.position.y = simFloorY(action.toFloor);
                elevator.completeDisembark(agent);
                agent.state = "ON_FLOOR";
                agent.exitPhase = 0;
                return true;
            }
            agent.group.position.x += (ex / ed) * Math.min(estep, ed);
            agent.group.position.z += (ez / ed) * Math.min(estep, ed);
            agent.group.position.y = simFloorY(action.toFloor);
            if (ed > 0.01) { agent.group.rotation.y = Math.atan2(ex, ez); }
            agent.group.userData.isWalking = true;
            return false;
        }
        elevator.completeDisembark(agent);
        return true;
    }
    if (action.type === "SIT") {
        simFinishSIT(agent, action);
        return true;
    }
    if (action.type === "STAND") {
        agent.group.userData.isSitting = false;
        if (!agent.inCar) { agent.group.position.y = simFloorY(agent.floor); }
        else { agent.group.position.y = 0; }
        return true;
    }
    if (action.type === "RELEASE_SEAT") {
        simReleaseSeatKey(action.key);
        if (agent.seatKey === action.key) { agent.seatKey = null; }
        return true;
    }
    if (action.type === "WAIT_SIM") {
        agent.group.userData.isWalking = false;
        if (SimClock.simMinute >= action.untilMin) { return true; }
        return false;
    }
    if (action.type === "EXIT_BUILDING") {
        if (agent.group.parent) { agent.group.parent.remove(agent.group); }
        agent.group.visible = false;
        agent.state = "GONE";
        agent.inCar = false;
        return true;
    }
    if (action.type === "ENTER_STATE") {
        agent.state = action.state;
        return true;
    }
    if (action.type === "MARK_LUNCHED") {
        agent.hasLunched = true;
        return true;
    }
    if (action.type === "PICK_NEXT_ACTIVITY") {
        simChooseNextActivity(agent);
        return true;
    }
    return true;
}

function simStepAgent(agent, motionDt) {
    if (agent.state === "DISABLED") { return; }
    if (agent.state === "AWAY") {
        if (SimClock.simMinute >= agent.arrivalTime) {
            simSpawnAgent(agent);
        }
        return;
    }
    if (agent.state === "GONE") { return; }
    if (agent.role === "WORKER" && agent.state !== "LEAVING" && agent.state !== "ARRIVING" &&
        agent.state !== "WAITING_ELEVATOR" && agent.state !== "IN_CAR" &&
        SimClock.simMinute >= agent.departureTime) {
        var inElev = agent.plan.some(function(a) { return a.type === "ENTER_ELEVATOR" || a.type === "WAIT_FOR_FLOOR" || a.type === "EXIT_ELEVATOR"; });
        if (!inElev) {
            if (agent.seatKey) { simReleaseSeatKey(agent.seatKey); agent.seatKey = null; }
            agent.state = "LEAVING";
            agent.plan = simPlanLeaveBuilding(agent);
            agent.currentAction = null;
        }
    }
    var iter = 0;
    while (iter < 16) {
        iter++;
        if (!agent.currentAction) {
            if (!agent.plan || agent.plan.length === 0) {
                if (agent.role === "WORKER" && (agent.state === "AT_DESK")) {
                    simChooseNextActivity(agent);
                    if (!agent.plan || agent.plan.length === 0) { break; }
                } else { break; }
            }
            agent.currentAction = agent.plan.shift();
            if (agent.currentAction.type === "STAND" && agent.group.userData.isSitting) {
                agent.group.userData.isSitting = false;
                if (!agent.inCar) { agent.group.position.y = simFloorY(agent.floor); }
            }
            simStartAction(agent, agent.currentAction);
        }
        var done = simUpdateAction(agent, agent.currentAction, motionDt);
        var zeroDur = (agent.currentAction.type === "SIT" || agent.currentAction.type === "STAND" ||
            agent.currentAction.type === "PRESS_FLOOR" || agent.currentAction.type === "ENTER_STATE" ||
            agent.currentAction.type === "MARK_LUNCHED" || agent.currentAction.type === "PICK_NEXT_ACTIVITY" ||
            agent.currentAction.type === "RELEASE_SEAT" || agent.currentAction.type === "EXIT_BUILDING");
        if (done) {
            agent.currentAction = null;
            if (!zeroDur) { break; }
            continue;
        } else {
            break;
        }
    }
}

function simApplyCollisions() {
    var present = [];
    for (var i = 0; i < simAgents.length; i++) {
        var a = simAgents[i];
        if (!a.group.visible || !a.group.parent) { continue; }
        if (a.state === "DISABLED" || a.state === "AWAY" || a.state === "GONE") { continue; }
        if (a.group.userData.isSitting) { continue; }
        if (a.inCar || a.group.parent !== scene) { continue; }
        if (a.currentAction && a.currentAction.type === "ENTER_ELEVATOR") { continue; }
        var entranceExempt = false;
        if (a.currentAction && a.currentAction.type === "WALK_TO_WP") {
            var wp = a.currentAction.wp;
            if (wp === "outside" || wp === "front_door_threshold" || wp === "entrance") { entranceExempt = true; }
        }
        present.push({ agent: a, exempt: entranceExempt });
    }
    for (var x = 0; x < present.length; x++) {
        for (var y = x + 1; y < present.length; y++) {
            var A = present[x];
            var B = present[y];
            if (A.exempt && B.exempt) { continue; }
            var pa = A.agent.group.position;
            var pb = B.agent.group.position;
            if (Math.abs(pa.y - pb.y) > 1.0) { continue; }
            var ddx = pb.x - pa.x;
            var ddz = pb.z - pa.z;
            var d2 = Math.sqrt(ddx * ddx + ddz * ddz);
            if (d2 > 0.7) { continue; }
            var nx, nz;
            if (d2 < 0.001) {
                var ang = Math.random() * Math.PI * 2;
                nx = Math.cos(ang);
                nz = Math.sin(ang);
                d2 = 0.001;
            } else {
                nx = ddx / d2;
                nz = ddz / d2;
            }
            var push = (0.7 - d2) * 0.18;
            if (!A.exempt) {
                pa.x -= nx * push;
                pa.z -= nz * push;
            }
            if (!B.exempt) {
                pb.x += nx * push;
                pb.z += nz * push;
            }
        }
    }
}

var SIM_SKY_KEYS = [
    { h: 0, bg: 0x0a0e1a, sun: 0x223355, sunI: 0.08, ai: 0.45, hi: 0.32 },
    { h: 5, bg: 0x0a0e1a, sun: 0x223355, sunI: 0.08, ai: 0.45, hi: 0.32 },
    { h: 6, bg: 0x554466, sun: 0xffaa55, sunI: 0.35, ai: 0.45, hi: 0.32 },
    { h: 6.5, bg: 0x87b5e0, sun: 0xffddaa, sunI: 0.8, ai: 0.45, hi: 0.4 },
    { h: 8, bg: 0x9fc7ee, sun: 0xffffff, sunI: 0.9, ai: 0.45, hi: 0.45 },
    { h: 16.5, bg: 0x9fc7ee, sun: 0xffffff, sunI: 0.9, ai: 0.45, hi: 0.45 },
    { h: 17.5, bg: 0xcc8855, sun: 0xff9944, sunI: 0.5, ai: 0.45, hi: 0.35 },
    { h: 18.5, bg: 0x1a2038, sun: 0x334466, sunI: 0.12, ai: 0.45, hi: 0.32 },
    { h: 24, bg: 0x0a0e1a, sun: 0x223355, sunI: 0.08, ai: 0.45, hi: 0.32 }
];
var simSunRef = null;
var simAmbRef = null;
var simHemiRef = null;

function simLerpColor(a, b, t) {
    var ca = new THREE.Color(a);
    var cb = new THREE.Color(b);
    ca.lerp(cb, t);
    return ca;
}

function simUpdateLighting() {
    if (!simSunRef) { return; }
    var h = SimClock.simMinute / 60;
    var k0 = SIM_SKY_KEYS[0];
    var k1 = SIM_SKY_KEYS[SIM_SKY_KEYS.length - 1];
    for (var i = 0; i < SIM_SKY_KEYS.length - 1; i++) {
        if (h >= SIM_SKY_KEYS[i].h && h <= SIM_SKY_KEYS[i + 1].h) {
            k0 = SIM_SKY_KEYS[i];
            k1 = SIM_SKY_KEYS[i + 1];
            break;
        }
    }
    var span = Math.max(0.000001, k1.h - k0.h);
    var t = Math.min(1, Math.max(0, (h - k0.h) / span));
    scene.background = simLerpColor(k0.bg, k1.bg, t);
    simSunRef.color = simLerpColor(k0.sun, k1.sun, t);
    simSunRef.intensity = k0.sunI + (k1.sunI - k0.sunI) * t;
    simAmbRef.intensity = k0.ai + (k1.ai - k0.ai) * t;
    simHemiRef.intensity = k0.hi + (k1.hi - k0.hi) * t;
}

function simBuildHUD() {
    simHud = document.createElement("div");
    simHud.style.position = "absolute";
    simHud.style.top = "10px";
    simHud.style.left = "10px";
    simHud.style.background = "rgba(0,0,0,0.65)";
    simHud.style.color = "#fff";
    simHud.style.padding = "10px";
    simHud.style.fontFamily = "monospace";
    simHud.style.fontSize = "12px";
    simHud.style.zIndex = "10";
    simHud.style.maxWidth = "300px";
    document.body.appendChild(simHud);
    simHudTime = document.createElement("div");
    simHudTime.style.fontSize = "22px";
    simHud.appendChild(simHudTime);
    var speedRow = document.createElement("div");
    speedRow.textContent = "Speed: ";
    var speedSlider = document.createElement("input");
    speedSlider.type = "range";
    speedSlider.min = "1";
    speedSlider.max = "600";
    speedSlider.value = "120";
    speedSlider.setAttribute("data-sim-speed", "1");
    speedSlider.style.width = "160px";
    var speedLabel = document.createElement("span");
    speedLabel.textContent = " 120x";
    speedRow.appendChild(speedSlider);
    speedRow.appendChild(speedLabel);
    simHud.appendChild(speedRow);
    var occRow = document.createElement("div");
    occRow.textContent = "Occupancy: ";
    var occSlider = document.createElement("input");
    occSlider.type = "range";
    occSlider.min = "1";
    occSlider.max = String(SIM_MAX_OCCUPANCY);
    occSlider.value = String(simTargetOccupancy);
    occSlider.setAttribute("data-sim-occ", "1");
    occSlider.style.width = "120px";
    var occLabel = document.createElement("span");
    occLabel.textContent = " " + simTargetOccupancy + " / 100 people";
    occRow.appendChild(occSlider);
    occRow.appendChild(occLabel);
    simHud.appendChild(occRow);
    simHudStates = document.createElement("div");
    simHud.appendChild(simHudStates);
    simHudElev = document.createElement("div");
    simHud.appendChild(simHudElev);
    speedSlider.addEventListener("input", function(ev) {
        var v = parseInt(ev.target.value, 10);
        if (!(v >= 1)) { v = 1; }
        if (v > 600) { v = 600; }
        SimClock.timeScale = v;
        speedLabel.textContent = " " + v + "x";
    });
    occSlider.addEventListener("input", function(ev) {
        simTargetOccupancy = parseInt(ev.target.value, 10);
        occLabel.textContent = " " + simTargetOccupancy + " / 100 people";
        simApplyOccupancy();
    });
}

function simUpdateHUD() {
    if (!simHud) { return; }
    simHudTime.textContent = SimClock.format();
    var counts = {};
    for (var i = 0; i < simAgents.length; i++) {
        var s = simAgents[i].state;
        counts[s] = (counts[s] || 0) + 1;
    }
    var parts = [];
    for (var k in counts) { parts.push(k + ":" + counts[k]); }
    simHudStates.textContent = parts.join(" ");
    var dst = "";
    try { dst = Array.from(elevator.destinations).join(","); } catch (e) { dst = ""; }
    var up = "";
    var dn = "";
    try { up = Array.from(elevator.upCalls).join(","); } catch (e2) { up = ""; }
    try { dn = Array.from(elevator.downCalls).join(","); } catch (e3) { dn = ""; }
    simHudElev.textContent = "Elev f" + elevator.currentFloor + " dir" + elevator.direction + " " + elevator.state +
        " pax" + elevator.passengers.size + " dst[" + dst + "] up[" + up + "] dn[" + dn + "]";
}

function startSimulation() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x20242a);
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(28, 24, 28);
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.sortObjects = true;
    document.body.appendChild(renderer.domElement);
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 6, 0);
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.7;
    window.controls = controls;
    scene.add(new THREE.AmbientLight(0xffffff, 0.45));
    scene.add(new THREE.HemisphereLight(0xbfd7ff, 0x303020, 0.45));
    var sun = new THREE.DirectionalLight(0xffffff, 0.9);
    sun.position.set(20, 35, 18);
    scene.add(sun);
    var amb = null;
    var hemi = null;
    scene.traverse(function(obj) {
        if (!amb && obj.isAmbientLight) { amb = obj; }
        if (!hemi && obj.isHemisphereLight) { hemi = obj; }
    });
    simAmbRef = amb;
    simHemiRef = hemi;
    simSunRef = sun;
    simWorld = createWorld(scene);
    elevator = new Elevator(scene, simWorld);
    window.simWorld = simWorld;
    window.elevator = elevator;
    window.scene = scene;
    window.camera = camera;
    simBuildPopulation();
    simApplyOccupancy();
    simBuildHUD();
    simLastReal = performance.now();
    window.addEventListener("resize", function() {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
    function animate() {
        requestAnimationFrame(animate);
        var now = performance.now();
        var realDt = Math.min(0.05, (now - simLastReal) / 1000);
        simLastReal = now;
        if (!(realDt > 0)) { realDt = 0.016; }
        SimClock.tick(realDt);
        simUpdateLighting();
        var motionDt = realDt * SimClock.timeScale;
        elevator.tick(motionDt);
        simTopUpVisitors();
        for (var i = 0; i < simAgents.length; i++) {
            simStepAgent(simAgents[i], motionDt);
        }
        simApplyCollisions();
        for (var j = 0; j < simAgents.length; j++) {
            var agent = simAgents[j];
            if (agent.group.visible && agent.group.parent) {
                window.animatePersonWalking(agent.group, motionDt);
            }
        }
        controls.update();
        renderer.render(scene, camera);
        simUpdateHUD();
    }
    animate();
}

if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", startSimulation);
} else {
    startSimulation();
}
