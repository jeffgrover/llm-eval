var scene, camera, renderer, controls, world, elevator;
var clockObj;
var agents = [];
var seatReservations = new Set();
var targetOccupancy = 45;
var MAX_WORKERS = 20, MAX_VISITORS = 80, MAX_OCCUPANCY = 100;
var NAMES = ["Alex","Blake","Casey","Dana","Emery","Finley","Harper","Indie","Jordan","Kelly","Logan","Morgan","Nico","Parker","Quinn","Riley","Sage","Taylor","Avery","Bailey","Cameron","Drew","Ellis","Frankie","Hayden","Jamie","Kendall","Leslie","Marley","Peyton"];


function Clock() {
    this.simMinute = 7 * 60 + 30;
    this.timeScale = 120;
    this._lastReal = performance.now();
}
Clock.prototype.getDelta = function() {
    var now = performance.now();
    var dt = (now - this._lastReal) / 1000;
    this._lastReal = now;
    return dt;
};
Clock.prototype.tick = function(realDt) {
    this.simMinute += realDt * this.timeScale / 60;
    if (this.simMinute >= 24 * 60) {
        this.simMinute -= 24 * 60;
        resetDay();
    }
};
Clock.prototype.format = function() {
    var m = Math.floor(this.simMinute) % (24 * 60);
    var h = Math.floor(m / 60), min = m % 60;
    var ampm = h >= 12 ? "PM" : "AM";
    var h12 = h % 12; if (h12 === 0) h12 = 12;
    return h12 + ":" + (min < 10 ? "0" : "") + min + " " + ampm;
};

function resetDay() {
    seatReservations.clear();
    if (elevator) elevator.reset();
    for (var i = 0; i < agents.length; i++) {
        var ag = agents[i];
        if (ag.state === "DISABLED") continue;
        // re-roll schedule
        rollSchedule(ag);
        ag.state = "AWAY";
        ag.plan = []; ag.currentAction = null;
        ag.hasLunched = false;
        ag.floor = 0;
        if (ag.group && ag.group.parent) ag.group.parent.remove(ag.group);
        ag.group.position.set(0, 0, 0);
        ag.group.userData.isSitting = false; ag.group.userData.isWalking = false;
        // honor occupancy on new day
        if (ag.id >= targetOccupancy) { ag.state = "DISABLED"; }
    }
}

function rollSchedule(ag) {
    ag.arrivalTime = 8 * 60 + 15 + Math.floor(Math.random() * 75);
    ag.lunchTime = 11 * 60 + 30 + Math.floor(Math.random() * 120);
    ag.lunchDuration = 25 + Math.floor(Math.random() * 35);
    ag.departureTime = 16 * 60 + 45 + Math.floor(Math.random() * 105);
    if (Math.random() < 0.15) ag.departureTime = 18 * 60 + 30 + Math.floor(Math.random() * 75);
    ag.hasLunched = false;
    ag.plannedMeetingTimes = [];
    var mc = Math.floor(Math.random() * 3);
    for (var k = 0; k < mc; k++) ag.plannedMeetingTimes.push(9 * 60 + 30 + Math.floor(Math.random() * 300));
    if (ag.role === "VISITOR") ag.visitDuration = 15 + Math.floor(Math.random() * 30);
}

function randName() { return NAMES[Math.floor(Math.random() * NAMES.length)]; }

function createAgents() {
    // Collect desks for workers
    var allDesks = [];
    for (var fi = 1; fi < world.floors.length; fi++) {
        for (var di = 0; di < world.floors[fi].desks.length; di++) allDesks.push(world.floors[fi].desks[di]);
    }
    for (var i = 0; i < MAX_OCCUPANCY; i++) {
        var role = i < MAX_WORKERS ? "WORKER" : "VISITOR";
        var ag = {
            id: i, role: role, name: randName(),
            state: i < targetOccupancy ? "AWAY" : "DISABLED",
            floor: 0, plan: [], currentAction: null,
            group: createPerson({}),
            hasLunched: false, arrivalTime: 0, lunchTime: 0, lunchDuration: 30, departureTime: 0, plannedMeetingTimes: [],
            homeFloor: null, deskId: null, deskWpName: null, deskDoorWpName: null
        };
        if (role === "WORKER" && i < allDesks.length) {
            var d = allDesks[i % allDesks.length];
            ag.homeFloor = d.floor; ag.deskId = d.id; ag.deskWpName = d.wpName;
            // find door
            var letter = d.wpName.replace("office", "").replace("_desk", "");
            ag.deskDoorWpName = "office" + letter + "_door";
        }
        rollSchedule(ag);
        ag.group.visible = false;
        scene.add(ag.group);
        agents.push(ag);
    }
}

// Seat reservation
function reserveConfSeat(floor) {
    var fl = world.floors[floor];
    for (var s = 0; s < 4; s++) {
        var key = floor + ":conf_seat" + s;
        if (!seatReservations.has(key)) {
            // check node exists
            if (fl.nodes["conf_seat" + s]) { seatReservations.add(key); return "conf_seat" + s; }
        }
    }
    return null;
}

// Plan compilers
function planArriveToDesk(ag) {
    var acts = [];
    acts.push({ type: "WALK_TO_WP", floor: 0, wpName: "outside" });
    acts.push({ type: "WALK_TO_WP", floor: 0, wpName: "front_door_threshold" });
    acts.push({ type: "WALK_TO_WP", floor: 0, wpName: "entrance" });
    acts.push({ type: "WALK_TO_WP", floor: 0, wpName: "lobby_center" });
    if (ag.homeFloor > 0) {
        acts.push({ type: "WAIT_AT_PANEL", floor: 0, dir: 1, toFloor: ag.homeFloor });
        acts.push({ type: "ENTER_ELEVATOR", toFloor: ag.homeFloor });
        acts.push({ type: "PRESS_FLOOR", floor: ag.homeFloor });
        acts.push({ type: "WAIT_FOR_FLOOR", floor: ag.homeFloor });
        acts.push({ type: "EXIT_ELEVATOR", toFloor: ag.homeFloor });
        acts.push({ type: "WALK_TO_WP", floor: ag.homeFloor, wpName: ag.deskDoorWpName });
        acts.push({ type: "WALK_TO_WP", floor: ag.homeFloor, wpName: ag.deskWpName });
    }
    acts.push({ type: "SIT", floor: ag.homeFloor || 0, wpName: ag.deskWpName || "lobby_center" });
    acts.push({ type: "ENTER_STATE", state: "AT_DESK" });
    acts.push({ type: "WAIT_SIM", minutes: 10 + Math.random() * 20 });
    acts.push({ type: "PICK_NEXT_ACTIVITY" });
    return acts;
}

function planGoToLunch(ag) {
    var acts = [];
    acts.push({ type: "STAND" });
    acts.push({ type: "WALK_TO_WP", floor: ag.homeFloor, wpName: ag.deskDoorWpName });
    acts.push({ type: "WALK_TO_WP", floor: ag.homeFloor, wpName: "elevWait" });
    acts.push({ type: "WAIT_AT_PANEL", floor: ag.homeFloor, dir: -1, toFloor: 0 });
    acts.push({ type: "ENTER_ELEVATOR", toFloor: 0 });
    acts.push({ type: "PRESS_FLOOR", floor: 0 });
    acts.push({ type: "WAIT_FOR_FLOOR", floor: 0 });
    acts.push({ type: "EXIT_ELEVATOR", toFloor: 0 });
    // Pick bistro chair
    var bistroIdx = Math.floor(Math.random() * 4);
    var chairName = "bistro_chair_" + bistroIdx + "_a";
    acts.push({ type: "WALK_TO_WP", floor: 0, wpName: chairName });
    acts.push({ type: "SIT", floor: 0, wpName: chairName });
    acts.push({ type: "ENTER_STATE", state: "AT_LUNCH" });
    acts.push({ type: "WAIT_SIM", minutes: ag.lunchDuration });
    acts.push({ type: "MARK_LUNCHED" });
    acts.push({ type: "STAND" });
    acts.push({ type: "WALK_TO_WP", floor: 0, wpName: "lobby_center" });
    acts.push({ type: "WALK_TO_WP", floor: 0, wpName: "elevWait" });
    acts.push({ type: "WAIT_AT_PANEL", floor: 0, dir: 1, toFloor: ag.homeFloor });
    acts.push({ type: "ENTER_ELEVATOR", toFloor: ag.homeFloor });
    acts.push({ type: "PRESS_FLOOR", floor: ag.homeFloor });
    acts.push({ type: "WAIT_FOR_FLOOR", floor: ag.homeFloor });
    acts.push({ type: "EXIT_ELEVATOR", toFloor: ag.homeFloor });
    acts.push({ type: "WALK_TO_WP", floor: ag.homeFloor, wpName: ag.deskDoorWpName });
    acts.push({ type: "WALK_TO_WP", floor: ag.homeFloor, wpName: ag.deskWpName });
    acts.push({ type: "SIT", floor: ag.homeFloor, wpName: ag.deskWpName });
    acts.push({ type: "ENTER_STATE", state: "AT_DESK" });
    acts.push({ type: "WAIT_SIM", minutes: 5 + Math.random() * 10 });
    acts.push({ type: "PICK_NEXT_ACTIVITY" });
    return acts;
}

function planVisitLounge(ag) {
    var acts = [];
    acts.push({ type: "STAND" });
    var loungeSpot = "lounge_spot" + Math.floor(Math.random() * 3);
    acts.push({ type: "WALK_TO_WP", floor: ag.homeFloor, wpName: "lounge_door" });
    acts.push({ type: "WALK_TO_WP", floor: ag.homeFloor, wpName: "lounge_center" });
    acts.push({ type: "WALK_TO_WP", floor: ag.homeFloor, wpName: loungeSpot });
    acts.push({ type: "SIT", floor: ag.homeFloor, wpName: loungeSpot });
    acts.push({ type: "ENTER_STATE", state: "AT_BREAK" });
    acts.push({ type: "WAIT_SIM", minutes: 5 + Math.random() * 7 });
    acts.push({ type: "STAND" });
    acts.push({ type: "RELEASE_SEAT" });
    acts.push({ type: "WALK_TO_WP", floor: ag.homeFloor, wpName: "lounge_center" });
    acts.push({ type: "WALK_TO_WP", floor: ag.homeFloor, wpName: "lounge_door" });
    acts.push({ type: "WALK_TO_WP", floor: ag.homeFloor, wpName: ag.deskDoorWpName });
    acts.push({ type: "WALK_TO_WP", floor: ag.homeFloor, wpName: ag.deskWpName });
    acts.push({ type: "SIT", floor: ag.homeFloor, wpName: ag.deskWpName });
    acts.push({ type: "ENTER_STATE", state: "AT_DESK" });
    acts.push({ type: "WAIT_SIM", minutes: 5 + Math.random() * 10 });
    acts.push({ type: "PICK_NEXT_ACTIVITY" });
    return acts;
}

function planAttendMeeting(ag, meetingFloor) {
    if (meetingFloor === undefined) {
        meetingFloor = Math.random() < 0.65 ? ag.homeFloor : 1 + Math.floor(Math.random() * (WORLD.FLOOR_COUNT - 1));
    }
    var seatName = reserveConfSeat(meetingFloor);
    if (!seatName) return planVisitLounge(ag);
    var acts = [];
    acts.push({ type: "STAND" });
    ag._meetingSeat = seatName; ag._meetingFloor = meetingFloor;
    if (meetingFloor !== ag.homeFloor) {
        var dir = meetingFloor > ag.homeFloor ? 1 : -1;
        acts.push({ type: "WALK_TO_WP", floor: ag.homeFloor, wpName: "elevWait" });
        acts.push({ type: "WAIT_AT_PANEL", floor: ag.homeFloor, dir: dir, toFloor: meetingFloor });
        acts.push({ type: "ENTER_ELEVATOR", toFloor: meetingFloor });
        acts.push({ type: "PRESS_FLOOR", floor: meetingFloor });
        acts.push({ type: "WAIT_FOR_FLOOR", floor: meetingFloor });
        acts.push({ type: "EXIT_ELEVATOR", toFloor: meetingFloor });
    }
    acts.push({ type: "WALK_TO_WP", floor: meetingFloor, wpName: "conf_door" });
    acts.push({ type: "WALK_TO_WP", floor: meetingFloor, wpName: "conf_center" });
    acts.push({ type: "WALK_TO_WP", floor: meetingFloor, wpName: seatName });
    acts.push({ type: "SIT", floor: meetingFloor, wpName: seatName });
    acts.push({ type: "ENTER_STATE", state: "IN_MEETING" });
    acts.push({ type: "WAIT_SIM", minutes: 22 + Math.random() * 23 });
    acts.push({ type: "STAND" });
    acts.push({ type: "RELEASE_SEAT" });
    if (meetingFloor !== ag.homeFloor) {
        acts.push({ type: "WALK_TO_WP", floor: meetingFloor, wpName: "conf_door" });
        acts.push({ type: "WALK_TO_WP", floor: meetingFloor, wpName: "elevWait" });
        var dir2 = meetingFloor > ag.homeFloor ? -1 : 1;
        if (dir2 === 0) dir2 = 1;
        // determine direction to home
        var needDir = ag.homeFloor > meetingFloor ? 1 : -1;
        acts.push({ type: "WAIT_AT_PANEL", floor: meetingFloor, dir: needDir, toFloor: ag.homeFloor });
        acts.push({ type: "ENTER_ELEVATOR", toFloor: ag.homeFloor });
        acts.push({ type: "PRESS_FLOOR", floor: ag.homeFloor });
        acts.push({ type: "WAIT_FOR_FLOOR", floor: ag.homeFloor });
        acts.push({ type: "EXIT_ELEVATOR", toFloor: ag.homeFloor });
    } else {
        acts.push({ type: "WALK_TO_WP", floor: meetingFloor, wpName: "conf_center" });
        acts.push({ type: "WALK_TO_WP", floor: meetingFloor, wpName: "conf_door" });
    }
    acts.push({ type: "WALK_TO_WP", floor: ag.homeFloor, wpName: ag.deskDoorWpName });
    acts.push({ type: "WALK_TO_WP", floor: ag.homeFloor, wpName: ag.deskWpName });
    acts.push({ type: "SIT", floor: ag.homeFloor, wpName: ag.deskWpName });
    acts.push({ type: "ENTER_STATE", state: "AT_DESK" });
    acts.push({ type: "WAIT_SIM", minutes: 5 + Math.random() * 10 });
    acts.push({ type: "PICK_NEXT_ACTIVITY" });
    return acts;
}

function planVisitCoworker(ag) {
    var candidates = agents.filter(function(a) { return a !== ag && a.state === "AT_DESK" && a.role === "WORKER"; });
    if (candidates.length === 0) {
        return [{ type: "WAIT_SIM", minutes: 5 + Math.random() * 10 }, { type: "PICK_NEXT_ACTIVITY" }];
    }
    var target = candidates[Math.floor(Math.random() * candidates.length)];
    var acts = [];
    acts.push({ type: "STAND" });
    if (target.homeFloor !== ag.homeFloor) {
        var dir = target.homeFloor > ag.homeFloor ? 1 : -1;
        acts.push({ type: "WALK_TO_WP", floor: ag.homeFloor, wpName: "elevWait" });
        acts.push({ type: "WAIT_AT_PANEL", floor: ag.homeFloor, dir: dir, toFloor: target.homeFloor });
        acts.push({ type: "ENTER_ELEVATOR", toFloor: target.homeFloor });
        acts.push({ type: "PRESS_FLOOR", floor: target.homeFloor });
        acts.push({ type: "WAIT_FOR_FLOOR", floor: target.homeFloor });
        acts.push({ type: "EXIT_ELEVATOR", toFloor: target.homeFloor });
    }
    acts.push({ type: "WALK_TO_WP", floor: target.homeFloor, wpName: target.deskDoorWpName });
    acts.push({ type: "ENTER_STATE", state: "VISITING" });
    acts.push({ type: "WAIT_SIM", minutes: 6 + Math.random() * 12 });
    if (target.homeFloor !== ag.homeFloor) {
        acts.push({ type: "WALK_TO_WP", floor: target.homeFloor, wpName: "elevWait" });
        var dir2 = ag.homeFloor > target.homeFloor ? 1 : -1;
        acts.push({ type: "WAIT_AT_PANEL", floor: target.homeFloor, dir: dir2, toFloor: ag.homeFloor });
        acts.push({ type: "ENTER_ELEVATOR", toFloor: ag.homeFloor });
        acts.push({ type: "PRESS_FLOOR", floor: ag.homeFloor });
        acts.push({ type: "WAIT_FOR_FLOOR", floor: ag.homeFloor });
        acts.push({ type: "EXIT_ELEVATOR", toFloor: ag.homeFloor });
    }
    acts.push({ type: "WALK_TO_WP", floor: ag.homeFloor, wpName: ag.deskDoorWpName });
    acts.push({ type: "WALK_TO_WP", floor: ag.homeFloor, wpName: ag.deskWpName });
    acts.push({ type: "SIT", floor: ag.homeFloor, wpName: ag.deskWpName });
    acts.push({ type: "ENTER_STATE", state: "AT_DESK" });
    acts.push({ type: "WAIT_SIM", minutes: 5 + Math.random() * 10 });
    acts.push({ type: "PICK_NEXT_ACTIVITY" });
    return acts;
}

function planLeaveBuilding(ag) {
    var acts = [];
    acts.push({ type: "STAND" });
    // release seat if any
    if (ag._meetingSeat) { acts.push({ type: "RELEASE_SEAT" }); }
    acts.push({ type: "WALK_TO_WP", floor: ag.homeFloor || 0, wpName: ag.deskDoorWpName || "lobby_center" });
    // Handle case where agent might be on different floor
    var curFloor = ag.homeFloor || ag.floor || 0;
    // We'll just assume they're on home floor for leaving; if in lobby, simpler
    // For robustness, route via elevator
    if (curFloor > 0) {
        acts.push({ type: "WALK_TO_WP", floor: curFloor, wpName: "elevWait" });
        acts.push({ type: "WAIT_AT_PANEL", floor: curFloor, dir: -1, toFloor: 0 });
        acts.push({ type: "ENTER_ELEVATOR", toFloor: 0 });
        acts.push({ type: "PRESS_FLOOR", floor: 0 });
        acts.push({ type: "WAIT_FOR_FLOOR", floor: 0 });
        acts.push({ type: "EXIT_ELEVATOR", toFloor: 0 });
    }
    acts.push({ type: "WALK_TO_WP", floor: 0, wpName: "lobby_center" });
    acts.push({ type: "WALK_TO_WP", floor: 0, wpName: "entrance" });
    acts.push({ type: "WALK_TO_WP", floor: 0, wpName: "front_door_threshold" });
    acts.push({ type: "WALK_TO_WP", floor: 0, wpName: "outside" });
    acts.push({ type: "EXIT_BUILDING" });
    return acts;
}

function planVisitorVisit(ag) {
    var acts = [];
    acts.push({ type: "WALK_TO_WP", floor: 0, wpName: "outside" });
    acts.push({ type: "WALK_TO_WP", floor: 0, wpName: "front_door_threshold" });
    acts.push({ type: "WALK_TO_WP", floor: 0, wpName: "entrance" });
    acts.push({ type: "WALK_TO_WP", floor: 0, wpName: "lobby_center" });
    var r = Math.random();
    if (r < 0.10) {
        var bi = Math.floor(Math.random() * 4);
        var cn = "bistro_chair_" + bi + "_a";
        acts.push({ type: "WALK_TO_WP", floor: 0, wpName: cn });
        acts.push({ type: "SIT", floor: 0, wpName: cn });
        acts.push({ type: "WAIT_SIM", minutes: 8 + Math.random() * 12 });
        acts.push({ type: "STAND" });
    } else if (r < 0.16) {
        acts.push({ type: "WALK_TO_WP", floor: 0, wpName: "cafe_order" });
        acts.push({ type: "WAIT_SIM", minutes: 5 + Math.random() * 8 });
    } else if (r < 0.30) {
        var fc = Math.random() < 0.5 ? "front_lounge_couch" : "front_lounge_chair1";
        acts.push({ type: "WALK_TO_WP", floor: 0, wpName: fc });
        acts.push({ type: "SIT", floor: 0, wpName: fc });
        acts.push({ type: "WAIT_SIM", minutes: 8 + Math.random() * 10 });
        acts.push({ type: "STAND" });
    } else if (r < 0.42) {
        var bl = Math.random() < 0.5 ? "back_lounge_N" : "pit_N";
        acts.push({ type: "WALK_TO_WP", floor: 0, wpName: bl });
        acts.push({ type: "SIT", floor: 0, wpName: bl });
        acts.push({ type: "WAIT_SIM", minutes: 8 + Math.random() * 10 });
        acts.push({ type: "STAND" });
    } else if (r < 0.52) {
        var rw = ["reception", "kiosk", "lobby_wc_front"][Math.floor(Math.random() * 3)];
        acts.push({ type: "WALK_TO_WP", floor: 0, wpName: rw });
        acts.push({ type: "WAIT_SIM", minutes: 4 + Math.random() * 6 });
    } else if (r < 0.62) {
        var loiter = ["lobby_stand_center", "lobby_stand_NE", "lobby_stand_NW"][Math.floor(Math.random() * 3)];
        acts.push({ type: "WALK_TO_WP", floor: 0, wpName: loiter });
        acts.push({ type: "WAIT_SIM", minutes: 6 + Math.random() * 10 });
    } else if (r < 0.77) {
        // ride up to lounge
        var uf = 1 + Math.floor(Math.random() * (WORLD.FLOOR_COUNT - 1));
        acts.push({ type: "WALK_TO_WP", floor: 0, wpName: "elevWait" });
        acts.push({ type: "WAIT_AT_PANEL", floor: 0, dir: 1, toFloor: uf });
        acts.push({ type: "ENTER_ELEVATOR", toFloor: uf });
        acts.push({ type: "PRESS_FLOOR", floor: uf });
        acts.push({ type: "WAIT_FOR_FLOOR", floor: uf });
        acts.push({ type: "EXIT_ELEVATOR", toFloor: uf });
        acts.push({ type: "WALK_TO_WP", floor: uf, wpName: "lounge_spot0" });
        acts.push({ type: "SIT", floor: uf, wpName: "lounge_spot0" });
        acts.push({ type: "WAIT_SIM", minutes: 8 + Math.random() * 10 });
        acts.push({ type: "STAND" });
        acts.push({ type: "WALK_TO_WP", floor: uf, wpName: "lounge_center" });
        acts.push({ type: "WALK_TO_WP", floor: uf, wpName: "lounge_door" });
        acts.push({ type: "WALK_TO_WP", floor: uf, wpName: "elevWait" });
        acts.push({ type: "WAIT_AT_PANEL", floor: uf, dir: -1, toFloor: 0 });
        acts.push({ type: "ENTER_ELEVATOR", toFloor: 0 });
        acts.push({ type: "PRESS_FLOOR", floor: 0 });
        acts.push({ type: "WAIT_FOR_FLOOR", floor: 0 });
        acts.push({ type: "EXIT_ELEVATOR", toFloor: 0 });
    } else {
        // meeting
        var mf = 1 + Math.floor(Math.random() * (WORLD.FLOOR_COUNT - 1));
        var sn = reserveConfSeat(mf);
        if (sn) {
            ag._meetingSeat = sn; ag._meetingFloor = mf;
            acts.push({ type: "WALK_TO_WP", floor: 0, wpName: "elevWait" });
            acts.push({ type: "WAIT_AT_PANEL", floor: 0, dir: 1, toFloor: mf });
            acts.push({ type: "ENTER_ELEVATOR", toFloor: mf });
            acts.push({ type: "PRESS_FLOOR", floor: mf });
            acts.push({ type: "WAIT_FOR_FLOOR", floor: mf });
            acts.push({ type: "EXIT_ELEVATOR", toFloor: mf });
            acts.push({ type: "WALK_TO_WP", floor: mf, wpName: "conf_door" });
            acts.push({ type: "WALK_TO_WP", floor: mf, wpName: "conf_center" });
            acts.push({ type: "WALK_TO_WP", floor: mf, wpName: sn });
            acts.push({ type: "SIT", floor: mf, wpName: sn });
            acts.push({ type: "WAIT_SIM", minutes: 12 + Math.random() * 15 });
            acts.push({ type: "STAND" });
            acts.push({ type: "RELEASE_SEAT" });
            acts.push({ type: "WALK_TO_WP", floor: mf, wpName: "conf_center" });
            acts.push({ type: "WALK_TO_WP", floor: mf, wpName: "conf_door" });
            acts.push({ type: "WALK_TO_WP", floor: mf, wpName: "elevWait" });
            acts.push({ type: "WAIT_AT_PANEL", floor: mf, dir: -1, toFloor: 0 });
            acts.push({ type: "ENTER_ELEVATOR", toFloor: 0 });
            acts.push({ type: "PRESS_FLOOR", floor: 0 });
            acts.push({ type: "WAIT_FOR_FLOOR", floor: 0 });
            acts.push({ type: "EXIT_ELEVATOR", toFloor: 0 });
        } else {
            var loiter2 = "lobby_stand_center";
            acts.push({ type: "WALK_TO_WP", floor: 0, wpName: loiter2 });
            acts.push({ type: "WAIT_SIM", minutes: 6 + Math.random() * 8 });
        }
    }
    acts.push({ type: "WALK_TO_WP", floor: 0, wpName: "lobby_center" });
    acts.push({ type: "WALK_TO_WP", floor: 0, wpName: "entrance" });
    acts.push({ type: "WALK_TO_WP", floor: 0, wpName: "front_door_threshold" });
    acts.push({ type: "WALK_TO_WP", floor: 0, wpName: "outside" });
    acts.push({ type: "EXIT_BUILDING" });
    return acts;
}

function chooseNextActivity(ag) {
    if (clockObj.simMinute >= ag.departureTime) return planLeaveBuilding(ag);
    for (var i = 0; i < ag.plannedMeetingTimes.length; i++) {
        if (clockObj.simMinute >= ag.plannedMeetingTimes[i]) {
            ag.plannedMeetingTimes.splice(i, 1);
            return planAttendMeeting(ag);
        }
    }
    if (!ag.hasLunched && clockObj.simMinute >= ag.lunchTime) return planGoToLunch(ag);
    var rv = Math.random();
    if (rv < 0.14) return planAttendMeeting(ag);
    if (rv < 0.26) return planVisitLounge(ag);
    if (rv < 0.41) return planVisitCoworker(ag);
    return [{ type: "WAIT_SIM", minutes: 18 + Math.random() * 47 }, { type: "PICK_NEXT_ACTIVITY" }];
}

// Action execution
function startAction(ag, action) {
    ag.currentAction = action;
    var t = action.type;
    if (t === "WALK_TO_WP") {
        var flNodes = world.floors[action.floor].nodes;
        var fromWp = findNearestWp(ag, action.floor);
        var path = [];
        if (fromWp && flNodes[fromWp] && flNodes[action.wpName]) {
            path = bfsPath(flNodes, fromWp, action.wpName);
        } else if (flNodes[action.wpName]) {
            path = [flNodes[action.wpName].pos.clone()];
        }
        // If cross-floor walk (shouldn't happen, but fallback)
        if (path.length === 0 && flNodes[action.wpName]) path = [flNodes[action.wpName].pos.clone()];
        action.path = path;
        action.pathIdx = 0;
        action._stallT = 0;
        action._prevPos = ag.group.position.clone();
        ag.group.userData.isWalking = true;
        ag.group.userData.isSitting = false;
        if (path.length === 0) { ag.currentAction = null; return true; }
    } else if (t === "WAIT_SIM") {
        action.untilMin = clockObj.simMinute + action.minutes;
    } else if (t === "WAIT_AT_PANEL") {
        // press call
        if (action.dir > 0) elevator.callUp(action.floor);
        else elevator.callDown(action.floor);
    } else if (t === "SIT") {
        var fl2 = world.floors[action.floor];
        var st = fl2.sitTargets[action.wpName];
        var targetPos = fl2.nodes[action.wpName] ? fl2.nodes[action.wpName].pos.clone() : new THREE.Vector3(0, 0, 0);
        if (st && !st.sit) {
            // jitter for standing spots
            var ang = Math.random() * Math.PI * 2;
            var rad = 0.35 + Math.random() * 0.4;
            targetPos.x += Math.cos(ang) * rad;
            targetPos.z += Math.sin(ang) * rad;
        }
        ag.group.position.copy(targetPos);
        if (st) ag.group.rotation.y = st.facing;
        ag.group.userData.isSitting = true;
        ag.group.userData.isWalking = false;
        // lower body
        var fy = action.floor * WORLD.FLOOR_HEIGHT;
        // if sitting, y should be floor + (-0.35 offset handled via group y)
        // Actually group y is floor level; isSitting lowers via position y adjustment
        if (ag.group.parent === elevator.carGroup) {
            // inside car - keep at 0
        } else {
            ag.group.position.y = fy + 0.01 - 0.35;
        }
        ag._sittingFloor = action.floor;
        ag.currentAction = null; return true;
    } else if (t === "STAND") {
        ag.group.userData.isSitting = false;
        if (ag.group.parent !== elevator.carGroup) {
            var cf = ag.floor;
            ag.group.position.y = cf * WORLD.FLOOR_HEIGHT + 0.01;
        }
        ag.currentAction = null; return true;
    } else if (t === "RELEASE_SEAT") {
        if (ag._meetingSeat) {
            seatReservations.delete(ag._meetingFloor + ":" + ag._meetingSeat);
            ag._meetingSeat = null; ag._meetingFloor = null;
        }
        ag.currentAction = null; return true;
    } else if (t === "ENTER_STATE") {
        ag.state = action.state;
        ag.currentAction = null; return true;
    } else if (t === "MARK_LUNCHED") {
        ag.hasLunched = true;
        ag.currentAction = null; return true;
    } else if (t === "PICK_NEXT_ACTIVITY") {
        var nextPlan = chooseNextActivity(ag);
        ag.plan = nextPlan.concat(ag.plan);
        ag.currentAction = null; return true;
    } else if (t === "PRESS_FLOOR") {
        elevator.pressDestination(action.floor);
        ag.currentAction = null; return true;
    } else if (t === "EXIT_BUILDING") {
        ag.group.visible = false;
        ag.group.position.set(0, -10, 0);
        ag.state = "GONE";
        ag.plan = []; ag.currentAction = null;
        return true;
    } else if (t === "ENTER_ELEVATOR") {
        action.phase = "reserve";
        action._stallT = 0;
        action._prevWalk = ag.group.position.clone();
    } else if (t === "WAIT_FOR_FLOOR") {
        // nothing to init
    } else if (t === "EXIT_ELEVATOR") {
        action.phase = "reparent";
    }
    return false;
}

function findNearestWp(ag, floor) {
    var nodes = world.floors[floor].nodes;
    var best = null, bestDist = Infinity;
    for (var k in nodes) {
        var d = ag.group.position.distanceTo(nodes[k].pos);
        if (d < bestDist) { bestDist = d; best = k; }
    }
    return best;
}

function updateAction(ag, motionDt) {
    var a = ag.currentAction;
    if (!a) return true;
    var t = a.type;
    if (t === "WALK_TO_WP") {
        if (a.pathIdx >= a.path.length) { ag.group.userData.isWalking = false; return true; }
        var dest = a.path[a.pathIdx];
        var dir = dest.clone().sub(ag.group.position);
        dir.y = 0;
        var dist = dir.length();
        if (dist < 0.3) { a.pathIdx++; a._stallT = 0; if (a.pathIdx >= a.path.length) { ag.group.userData.isWalking = false; return true; } return false; }
        dir.normalize();
        var speed = 1.3 * motionDt;
        // entrance exemption
        var isEntranceChain = a.wpName === "outside" || a.wpName === "front_door_threshold" || a.wpName === "entrance" || a.wpName === "lobby_center";
        // Move
        var move = dir.clone().multiplyScalar(Math.min(speed, dist));
        ag.group.position.add(move);
        // Face direction
        ag.group.rotation.y = Math.atan2(dir.x, dir.z);
        // Stall detection
        var moved = ag.group.position.distanceTo(a._prevPos);
        if (moved < 0.005) {
            a._stallT += motionDt;
            if (a._stallT > 1.2) { a.pathIdx++; a._stallT = 0; }
            // entrance special: advance faster
            if (isEntranceChain && a._stallT > 1.5) { a.pathIdx++; a._stallT = 0; }
        } else { a._stallT = 0; }
        a._prevPos.copy(ag.group.position);
        return false;
    } else if (t === "WAIT_SIM") {
        if (clockObj.simMinute >= a.untilMin) return true;
        return false;
    } else if (t === "WAIT_AT_PANEL") {
        // re-press every frame
        if (a.dir > 0) elevator.callUp(a.floor); else elevator.callDown(a.floor);
        if (elevator.state === "DOOR_OPEN" && elevator.currentFloor === a.floor && elevator.currentCapacityFree() > 0) {
            // Check direction match
            if (elevator.isAcceptingAt(a.floor, a.dir)) return true;
        }
        return false;
    } else if (t === "ENTER_ELEVATOR") {
        if (a.phase === "reserve") {
            var spot = elevator.reserveBoardingSpot(ag);
            if (!spot) {
                // re-call if car left
                if (a.toFloor > a.floor || a.toFloor > elevator.currentFloor) elevator.callUp(a.floor !== undefined ? a.floor : ag.floor);
                else elevator.callDown(a.floor !== undefined ? a.floor : ag.floor);
                // Use ag.floor
                var af = ag.floor;
                if (elevator.currentFloor !== af || elevator.state !== "DOOR_OPEN") return false;
                return false;
            }
            a.spot = spot;
            a.phase = "walkToDoor";
            a._threshold = new THREE.Vector3(spot.x, ag.group.position.y, 2.2);
            // but use spot x for lane
            a._threshold.x = spot.x;
            a._stallT = 0; a._prevWalk = ag.group.position.clone();
        }
        if (a.phase === "walkToDoor") {
            // walk to threshold in world space
            var dest2 = a._threshold;
            var dir2 = dest2.clone().sub(ag.group.position); dir2.y = 0;
            var dist2 = dir2.length();
            if (dist2 < 0.25) {
                // reparent to car
                var worldPos = ag.group.position.clone();
                scene.remove(ag.group);
                elevator.carGroup.add(ag.group);
                // convert to car local: subtract car y
                ag.group.position.set(a.spot.x, 0.01, a.spot.z);
                // keep world y correct via carGroup
                a.phase = "walkInside";
                return false;
            }
            dir2.normalize();
            ag.group.position.add(dir2.multiplyScalar(1.3 * motionDt));
            ag.group.rotation.y = Math.atan2(dir2.x, dir2.z);
            ag.group.userData.isWalking = true;
            var moved2 = ag.group.position.distanceTo(a._prevWalk);
            if (moved2 < 0.005) { a._stallT += motionDt; if (a._stallT > 1.5) { // teleport
                ag.group.position.copy(a._threshold); a._stallT = 0;
            }} else { a._stallT = 0; }
            a._prevWalk.copy(ag.group.position);
            return false;
        }
        if (a.phase === "walkInside") {
            var dest3 = new THREE.Vector3(a.spot.x, 0.01, a.spot.z);
            var dir3 = dest3.clone().sub(ag.group.position);
            var dist3 = dir3.length();
            if (dist3 < 0.15) {
                ag.group.position.copy(dest3);
                elevator.completeBoard(ag);
                ag.group.rotation.y = 0;
                ag.group.userData.isWalking = false;
                ag.floor = a.toFloor;
                return true;
            }
            dir3.normalize();
            ag.group.position.add(dir3.multiplyScalar(1.0 * motionDt));
            return false;
        }
        return false;
    } else if (t === "WAIT_FOR_FLOOR") {
        if (elevator.state === "DOOR_OPEN" && elevator.currentFloor === a.floor) return true;
        return false;
    } else if (t === "EXIT_ELEVATOR") {
        if (a.phase === "reparent") {
            elevator.registerDisembark(ag);
            // reparent car -> scene
            var worldY = elevator.carGroup.position.y;
            var localPos = ag.group.position.clone();
            elevator.carGroup.remove(ag.group);
            scene.add(ag.group);
            ag.group.position.set(localPos.x, worldY + 0.01, localPos.z);
            ag.group.userData.isWalking = true;
            ag.floor = a.toFloor;
            a.phase = "walkOut";
            a.dest = world.floors[a.toFloor].nodes.elevWait.pos.clone();
            a._prevWalk = ag.group.position.clone(); a._stallT = 0;
        }
        if (a.phase === "walkOut") {
            var dest4 = a.dest;
            var dir4 = dest4.clone().sub(ag.group.position);
            dir4.y = 0;
            if (dir4.length() < 0.3) {
                elevator.completeDisembark(ag);
                ag.group.userData.isWalking = false;
                return true;
            }
            dir4.normalize();
            ag.group.position.add(dir4.multiplyScalar(1.3 * motionDt));
            ag.group.rotation.y = Math.atan2(dir4.x, dir4.z);
            return false;
        }
        return false;
    }
    return false;
}

function countPresent() {
    var c = 0;
    for (var i = 0; i < agents.length; i++) if (agents[i].state !== "AWAY" && agents[i].state !== "GONE" && agents[i].state !== "DISABLED") c++;
    return c;
}

function topUpVisitors() {
    if (clockObj.simMinute < 8 * 60 || clockObj.simMinute > 19 * 60) return;
    var deficit = targetOccupancy - countPresent();
    if (deficit <= 0) return;
    for (var i = 0; i < agents.length && deficit > 0; i++) {
        var ag = agents[i];
        if (ag.role !== "VISITOR") continue;
        if (ag.state !== "AWAY" && ag.state !== "GONE") continue;
        ag.arrivalTime = clockObj.simMinute + Math.floor(Math.random() * 6);
        ag.visitDuration = 15 + Math.floor(Math.random() * 30);
        ag.state = "AWAY";
        ag.group.visible = false;
        deficit--;
    }
}

function applyOccupancy() {
    for (var i = 0; i < agents.length; i++) {
        var ag = agents[i];
        if (ag.id < targetOccupancy) {
            if (ag.state === "DISABLED") { ag.state = "AWAY"; rollSchedule(ag); }
        } else {
            if (ag.state === "AWAY" || ag.state === "GONE") ag.state = "DISABLED";
        }
    }
}

function applyCollisions() {
    for (var i = 0; i < agents.length; i++) {
        for (var j = i + 1; j < agents.length; j++) {
            var a = agents[i], b = agents[j];
            if (!a.group.visible || !b.group.visible) continue;
            if (a.group.userData.isSitting || b.group.userData.isSitting) continue;
            if (a.group.parent === elevator.carGroup || b.group.parent === elevator.carGroup) continue;
            if (a.currentAction && a.currentAction.type === "ENTER_ELEVATOR") continue;
            if (b.currentAction && b.currentAction.type === "ENTER_ELEVATOR") continue;
            if (a.group.parent !== b.group.parent) continue;
            if (Math.abs(a.group.position.y - b.group.position.y) > 1) continue;
            var dx = a.group.position.x - b.group.position.x;
            var dz = a.group.position.z - b.group.position.z;
            var d = Math.sqrt(dx * dx + dz * dz);
            if (d < 0.7 && d > 1e-3) {
                var push = (0.7 - d) * 0.18;
                var nx = dx / d, nz = dz / d;
                a.group.position.x += nx * push; a.group.position.z += nz * push;
                b.group.position.x -= nx * push; b.group.position.z -= nz * push;
            } else if (d < 1e-3) {
                var ang2 = Math.random() * Math.PI * 2;
                a.group.position.x += Math.cos(ang2) * 0.1; a.group.position.z += Math.sin(ang2) * 0.1;
                b.group.position.x -= Math.cos(ang2) * 0.1; b.group.position.z -= Math.sin(ang2) * 0.1;
            }
        }
    }
}

function updateDayNight() {
    var m = clockObj.simMinute % (24 * 60);
    var h = m / 60;
    var bgColor, sunInt, ambInt, hemiInt, sunColor;
    // Keyframes
    if (h < 6) { bgColor = new THREE.Color(0x0a0a1a); sunInt = 0.1; ambInt = 0.45; hemiInt = 0.32; sunColor = new THREE.Color(0x333355); }
    else if (h < 6.5) { var t = (h - 6) / 0.5; bgColor = new THREE.Color().lerpColors(new THREE.Color(0x0a0a1a), new THREE.Color(0x6688cc), t); sunInt = 0.1 + t * 0.7; ambInt = 0.45; hemiInt = 0.32 + t * 0.13; sunColor = new THREE.Color().lerpColors(new THREE.Color(0x333355), new THREE.Color(0xffaa66), t); }
    else if (h < 17.5) { bgColor = new THREE.Color(0x6688cc); sunInt = 0.9; ambInt = 0.55; hemiInt = 0.45; sunColor = new THREE.Color(0xffffff); }
    else if (h < 18.5) { var t2 = (h - 17.5) / 1.0; bgColor = new THREE.Color().lerpColors(new THREE.Color(0x6688cc), new THREE.Color(0x1a1a3a), t2); sunInt = 0.9 - t2 * 0.8; ambInt = 0.55 - t2 * 0.1; hemiInt = 0.45 - t2 * 0.13; sunColor = new THREE.Color().lerpColors(new THREE.Color(0xffffff), new THREE.Color(0x332233), t2); }
    else { bgColor = new THREE.Color(0x1a1a3a); sunInt = 0.1; ambInt = 0.45; hemiInt = 0.32; sunColor = new THREE.Color(0x332233); }
    scene.background = bgColor;
    // Find sun
    scene.traverse(function(obj) { if (obj.isDirectionalLight) { obj.intensity = sunInt; obj.color.copy(sunColor); } if (obj.isAmbientLight) obj.intensity = ambInt; if (obj.isHemisphereLight) obj.intensity = hemiInt; });
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
    scene.add(new THREE.AmbientLight(0xffffff, 0.45));
    scene.add(new THREE.HemisphereLight(0xbfd7ff, 0x303020, 0.45));
    var sun = new THREE.DirectionalLight(0xffffff, 0.9);
    sun.position.set(20, 35, 18);
    scene.add(sun);
    world = createWorld(scene);
    elevator = new Elevator(scene, world);
    clockObj = new Clock();
    createAgents();

    // UI
    var speedSlider = document.getElementById("speedSlider");
    var occSlider = document.getElementById("occSlider");
    if (speedSlider) {
        var speeds = [1, 5, 20, 60, 120, 300, 600];
        speedSlider.addEventListener("input", function(ev) {
            var idx = parseInt(ev.target.value); clockObj.timeScale = speeds[idx];
            document.getElementById("speedLabel").textContent = speeds[idx] + "x";
        });
        clockObj.timeScale = speeds[parseInt(speedSlider.value)];
        document.getElementById("speedLabel").textContent = clockObj.timeScale + "x";
    }
    if (occSlider) {
        occSlider.addEventListener("input", function(ev) {
            targetOccupancy = parseInt(ev.target.value);
            document.getElementById("occLabel").textContent = targetOccupancy + " / 100";
            applyOccupancy();
        });
    }

    window.addEventListener("resize", function() {
        camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    function animate() {
        requestAnimationFrame(animate);
        var realDt = Math.min(0.05, clockObj.getDelta());
        clockObj.tick(realDt);
        updateDayNight();
        var motionDt = realDt * clockObj.timeScale;
        elevator.tick(motionDt);

        // Agent daily schedule
        for (var i = 0; i < agents.length; i++) {
            var ag = agents[i];
            if (ag.state === "DISABLED") continue;
            if (ag.state === "AWAY" && clockObj.simMinute >= ag.arrivalTime) {
                ag.state = "ARRIVING";
                ag.group.visible = true;
                ag.floor = 0;
                // spawn jitter
                var spawnPos = world.floors[0].nodes.outside.pos.clone();
                spawnPos.x += (Math.random() - 0.5) * 2.2;
                spawnPos.z += (Math.random() - 0.5) * 1.5;
                ag.group.position.copy(spawnPos);
                ag.group.position.y = 0.01;
                scene.add(ag.group);
                if (ag.role === "WORKER") ag.plan = planArriveToDesk(ag);
                else ag.plan = planVisitorVisit(ag);
            }
            // Past departure -> override to leave (workers only, visitors have their own plan)
            if (ag.role === "WORKER" && ag.state !== "AWAY" && ag.state !== "GONE" && ag.state !== "LEAVING" && ag.state !== "DISABLED" && clockObj.simMinute >= ag.departureTime) {
                // Don't interrupt elevator ride
                if (!ag.currentAction || (ag.currentAction.type !== "ENTER_ELEVATOR" && ag.currentAction.type !== "WAIT_FOR_FLOOR" && ag.currentAction.type !== "EXIT_ELEVATOR")) {
                    // release seat
                    if (ag._meetingSeat) { seatReservations.delete(ag._meetingFloor + ":" + ag._meetingSeat); ag._meetingSeat = null; }
                    ag.plan = planLeaveBuilding(ag);
                    ag.currentAction = null;
                    ag.state = "LEAVING";
                }
            }
            // Action dispatch loop (up to 16 iterations)
            for (var iter = 0; iter < 16; iter++) {
                if (!ag.currentAction) {
                    if (ag.plan.length === 0) break;
                    var next = ag.plan.shift();
                    var immediate = startAction(ag, next);
                    if (immediate) continue;
                    else break;
                } else {
                    var done = updateAction(ag, motionDt);
                    if (done) { ag.currentAction = null; continue; }
                    else break;
                }
            }
        }

        topUpVisitors();
        applyCollisions();
        for (var j = 0; j < agents.length; j++) {
            if (agents[j].group.visible) animatePersonWalking(agents[j].group, motionDt);
        }

        // HUD
        var td = document.getElementById("timeDisplay");
        if (td) td.textContent = clockObj.format();
        var stats = document.getElementById("stats");
        if (stats) {
            var counts = {};
            for (var k = 0; k < agents.length; k++) { var s = agents[k].state; counts[s] = (counts[s] || 0) + 1; }
            var html = "";
            for (var key in counts) html += key + ": " + counts[key] + "<br>";
            html += "Elevator: F" + elevator.currentFloor + " " + elevator.state + " dir:" + elevator.direction + " pax:" + elevator.passengers.size + "<br>";
            html += "Dest:" + JSON.stringify(Array.from(elevator.destinations)) + " Up:" + JSON.stringify(Array.from(elevator.upCalls)) + " Dn:" + JSON.stringify(Array.from(elevator.downCalls));
            stats.innerHTML = html;
        }

        controls.update();
        renderer.render(scene, camera);
    }
    animate();
}

if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", startSimulation);
} else {
    startSimulation();
}
