// sim.js - simulated clock, day/night lighting, agent state machine + daily
// schedules, render loop, UI. Classic script; depends on person.js, world.js,
// elevator_logic.js, elevator.js being loaded first.

var simScene, simCamera, simRenderer, simControls;
var simWorld, simElevator;
var simSun, simAmbient, simHemi;
var realClock;
var hudTimeEl, hudStatsEl, hudSpeedLabel, hudOccLabel;

var MAX_WORKERS = 20;
var MAX_VISITORS = 80;
var MAX_OCCUPANCY = MAX_WORKERS + MAX_VISITORS;
var DEFAULT_OCCUPANCY = 45;
var targetOccupancy = DEFAULT_OCCUPANCY;

var WALK_SPEED = 1.3;
var agents = [];
var seatReservations = new Set();

var AGENT_NAMES = ["Ava", "Ben", "Cara", "Dev", "Elle", "Finn", "Gia", "Hank",
    "Iris", "Jon", "Kai", "Lena", "Milo", "Nina", "Omar", "Pia", "Quinn",
    "Rex", "Sara", "Theo", "Uma", "Vic", "Wren", "Xane", "Yara", "Zed"];

function randRange(a, b) { return a + Math.random() * (b - a); }
function randInt(a, b) { return Math.floor(randRange(a, b + 1)); }

// ---------------- simulated clock ----------------
var simClock = {
    simMinute: 7 * 60 + 30,
    timeScale: 120,
    tick: function(realDt) {
        this.simMinute += realDt * this.timeScale / 60;
        if (this.simMinute >= 24 * 60) {
            this.simMinute -= 24 * 60;
            simOnNewDay();
        }
    },
    format: function() {
        var m = Math.floor(this.simMinute);
        var h = Math.floor(m / 60);
        var mm = m % 60;
        var ampm = h >= 12 ? "PM" : "AM";
        var h12 = h % 12;
        if (h12 === 0) { h12 = 12; }
        var hs = (h12 < 10 ? " " : "") + h12;
        var ms = (mm < 10 ? "0" : "") + mm;
        return hs + ":" + ms + " " + ampm;
    }
};

// ---------------- day / night lighting ----------------
var LIGHT_KEYS = [
    { h: 0.0,  bg: 0x0a0d1c, sun: 0x223355, si: 0.05, ai: 0.45, hi: 0.32 },
    { h: 5.75, bg: 0x0a0d1c, sun: 0x223355, si: 0.05, ai: 0.45, hi: 0.32 },
    { h: 6.0,  bg: 0x7a4a3a, sun: 0xffaa66, si: 0.5,  ai: 0.5,  hi: 0.36 },
    { h: 6.5,  bg: 0x87b5e6, sun: 0xffffff, si: 0.9,  ai: 0.55, hi: 0.45 },
    { h: 17.5, bg: 0x87b5e6, sun: 0xffffff, si: 0.9,  ai: 0.55, hi: 0.45 },
    { h: 18.0, bg: 0xcc7744, sun: 0xff9955, si: 0.55, ai: 0.5,  hi: 0.4 },
    { h: 18.5, bg: 0x141830, sun: 0x334466, si: 0.08, ai: 0.45, hi: 0.32 },
    { h: 21.0, bg: 0x0a0d1c, sun: 0x223355, si: 0.05, ai: 0.45, hi: 0.32 },
    { h: 24.0, bg: 0x0a0d1c, sun: 0x223355, si: 0.05, ai: 0.45, hi: 0.32 }
];

function updateLighting() {
    var hour = simClock.simMinute / 60;
    var k0 = LIGHT_KEYS[0];
    var k1 = LIGHT_KEYS[LIGHT_KEYS.length - 1];
    for (var i = 0; i < LIGHT_KEYS.length - 1; i++) {
        if (hour >= LIGHT_KEYS[i].h && hour <= LIGHT_KEYS[i + 1].h) {
            k0 = LIGHT_KEYS[i];
            k1 = LIGHT_KEYS[i + 1];
            break;
        }
    }
    var span = k1.h - k0.h;
    var t = span > 0 ? (hour - k0.h) / span : 0;
    var bg = new THREE.Color(k0.bg).lerp(new THREE.Color(k1.bg), t);
    var sc = new THREE.Color(k0.sun).lerp(new THREE.Color(k1.sun), t);
    simScene.background = bg;
    simSun.color = sc;
    simSun.intensity = k0.si + (k1.si - k0.si) * t;
    simAmbient.intensity = k0.ai + (k1.ai - k0.ai) * t;
    simHemi.intensity = k0.hi + (k1.hi - k0.hi) * t;
}

// ---------------- seat reservations ----------------
function seatKey(floor, wp) { return floor + ":" + wp; }
function reserveSeat(agent, floor, wp) {
    var key = seatKey(floor, wp);
    if (seatReservations.has(key)) { return false; }
    seatReservations.add(key);
    agent.heldSeats.push(key);
    return true;
}
function releaseAgentSeats(agent) {
    for (var i = 0; i < agent.heldSeats.length; i++) {
        seatReservations.delete(agent.heldSeats[i]);
    }
    agent.heldSeats.length = 0;
}

// ---------------- schedules ----------------
function sampleWorkerSchedule(agent) {
    agent.arrivalTime = randRange(8 * 60 + 15, 9 * 60 + 30);
    agent.lunchTime = randRange(11 * 60 + 30, 13 * 60 + 30);
    agent.lunchDuration = randRange(25, 60);
    if (Math.random() < 0.15) {
        agent.departureTime = randRange(18 * 60 + 30, 19 * 60 + 45);
    } else {
        agent.departureTime = randRange(16 * 60 + 45, 18 * 60 + 30);
    }
    agent.hasLunched = false;
    agent.plannedMeetingTimes = [];
    if (Math.random() < 0.6) {
        agent.plannedMeetingTimes.push(randRange(9 * 60 + 45, 11 * 60 + 15));
    }
    if (Math.random() < 0.5) {
        agent.plannedMeetingTimes.push(randRange(13 * 60 + 45, 16 * 60));
    }
}

function sampleVisitorSchedule(agent, baseMinute) {
    var base = (baseMinute !== undefined) ? baseMinute : randRange(8 * 60 + 30, 16 * 60);
    agent.arrivalTime = base;
    agent.visitDuration = randRange(10, 55);
    agent.departureTime = 20 * 60;
    agent.hasLunched = true;
    agent.plannedMeetingTimes = [];
}

// ---------------- agent creation ----------------
function makeAgent(id, role) {
    var agent = {
        id: id,
        role: role,
        name: AGENT_NAMES[id % AGENT_NAMES.length] + "-" + id,
        group: null,
        state: "DISABLED",
        plan: [],
        currentAction: null,
        heldSeats: [],
        homeFloor: null,
        deskId: null,
        deskWpName: null,
        deskDoorWpName: null,
        leaving: false,
        noCollide: false
    };
    if (role === "WORKER") {
        var wIdx = id;
        agent.homeFloor = 1 + Math.floor(wIdx / 4);
        var deskInfo = simWorld.floors[agent.homeFloor].desks[wIdx % 4];
        agent.deskId = deskInfo.id;
        agent.deskWpName = deskInfo.wpName;
        agent.deskDoorWpName = deskInfo.doorWpName;
        sampleWorkerSchedule(agent);
    } else {
        sampleVisitorSchedule(agent);
    }
    return agent;
}

function spawnAgent(agent) {
    if (!agent.group) {
        agent.group = createPerson({});
        agent.group.userData.agent = agent;
    }
    var outside = simWorld.floors[0].nodes["outside"].pos;
    agent.group.position.set(
        outside.x + randRange(-1.1, 1.1), 0, outside.z + randRange(-0.75, 0.75));
    agent.group.rotation.y = Math.PI;
    agent.group.userData.isSitting = false;
    agent.group.userData.isWalking = false;
    simScene.add(agent.group);
}

function despawnAgent(agent) {
    if (agent.group && agent.group.parent) {
        agent.group.parent.remove(agent.group);
    }
}

// ---------------- primitive action helpers ----------------
function actWalk(floor, wp) { return { type: "WALK_TO_WP", floor: floor, wp: wp }; }
function actWaitPanel(floor, dir, toFloor) {
    return { type: "WAIT_AT_PANEL", floor: floor, dir: dir, toFloor: toFloor };
}
function actEnter(fromFloor, toFloor) {
    return { type: "ENTER_ELEVATOR", fromFloor: fromFloor, toFloor: toFloor };
}
function actPress(floor) { return { type: "PRESS_FLOOR", floor: floor }; }
function actWaitFloor(floor) { return { type: "WAIT_FOR_FLOOR", floor: floor }; }
function actExitElev(toFloor) { return { type: "EXIT_ELEVATOR", toFloor: toFloor }; }
function actSit(floor, wp) { return { type: "SIT", floor: floor, wp: wp }; }
function actStand() { return { type: "STAND" }; }
function actReleaseSeat() { return { type: "RELEASE_SEAT" }; }
function actWaitSim(minutes) { return { type: "WAIT_SIM", minutes: minutes }; }
function actExitBuilding() { return { type: "EXIT_BUILDING" }; }
function actEnterState(state) { return { type: "ENTER_STATE", state: state }; }
function actMarkLunched() { return { type: "MARK_LUNCHED" }; }
function actPickNext() { return { type: "PICK_NEXT_ACTIVITY" }; }

function subRide(fromFloor, toFloor) {
    if (fromFloor === toFloor) { return []; }
    var dir = toFloor > fromFloor ? 1 : -1;
    return [
        actWalk(fromFloor, "elevWait"),
        actEnterState("WAITING_ELEVATOR"),
        actWaitPanel(fromFloor, dir, toFloor),
        actEnter(fromFloor, toFloor),
        actPress(toFloor),
        actWaitFloor(toFloor),
        actExitElev(toFloor)
    ];
}

function subBackToDesk(agent, fromFloor) {
    var plan = [];
    plan = plan.concat(subRide(fromFloor, agent.homeFloor));
    plan.push(actWalk(agent.homeFloor, agent.deskDoorWpName));
    plan.push(actWalk(agent.homeFloor, agent.deskWpName));
    plan.push(actSit(agent.homeFloor, agent.deskWpName));
    plan.push(actEnterState("AT_DESK"));
    plan.push(actWaitSim(randRange(18, 65)));
    plan.push(actPickNext());
    return plan;
}

// ---------------- plan compilers ----------------
function planArriveToDesk(agent) {
    var plan = [
        actEnterState("ARRIVING"),
        actWalk(0, "front_door_threshold"),
        actWalk(0, "entrance"),
        actWalk(0, "lobby_center")
    ];
    plan = plan.concat(subRide(0, agent.homeFloor));
    plan.push(actWalk(agent.homeFloor, agent.deskDoorWpName));
    plan.push(actWalk(agent.homeFloor, agent.deskWpName));
    plan.push(actSit(agent.homeFloor, agent.deskWpName));
    plan.push(actEnterState("AT_DESK"));
    plan.push(actWaitSim(randRange(18, 65)));
    plan.push(actPickNext());
    return plan;
}

function planGoToLunch(agent) {
    var lobby = simWorld.floors[0];
    var seat = null;
    for (var i = 0; i < lobby.cafeSpots.length; i++) {
        var c = lobby.cafeSpots[Math.floor(Math.random() * lobby.cafeSpots.length)];
        if (reserveSeat(agent, 0, c)) { seat = c; break; }
    }
    var plan = [actStand(), actEnterState("AT_LUNCH"),
        actWalk(agent.homeFloor, agent.deskDoorWpName)];
    plan = plan.concat(subRide(agent.homeFloor, 0));
    if (seat) {
        plan.push(actWalk(0, seat));
        plan.push(actSit(0, seat));
        plan.push(actWaitSim(agent.lunchDuration));
        plan.push(actStand());
        plan.push(actReleaseSeat());
    } else {
        plan.push(actWalk(0, "lobby_stand_midW"));
        plan.push(actSit(0, "lobby_stand_midW"));
        plan.push(actWaitSim(agent.lunchDuration));
        plan.push(actStand());
    }
    plan.push(actMarkLunched());
    return plan.concat(subBackToDesk(agent, 0));
}

function planVisitLounge(agent) {
    var fl = agent.homeFloor;
    var spots = simWorld.floors[fl].loungeSpots;
    var seat = null;
    for (var i = 0; i < spots.length; i++) {
        var s = spots[Math.floor(Math.random() * spots.length)];
        if (reserveSeat(agent, fl, s)) { seat = s; break; }
    }
    var plan = [actStand(), actEnterState("AT_BREAK"),
        actWalk(fl, agent.deskDoorWpName)];
    if (seat) {
        plan.push(actWalk(fl, "lounge_door"));
        plan.push(actWalk(fl, seat));
        plan.push(actSit(fl, seat));
        plan.push(actWaitSim(randRange(5, 12)));
        plan.push(actStand());
        plan.push(actReleaseSeat());
    } else {
        plan.push(actWalk(fl, "water_cooler"));
        plan.push(actSit(fl, "water_cooler"));
        plan.push(actWaitSim(randRange(5, 12)));
        plan.push(actStand());
    }
    return plan.concat(subBackToDesk(agent, fl));
}

function reserveConfSeat(agent, floor) {
    var order = [0, 1, 2, 3].sort(function(a, b) { return Math.random() - 0.5; });
    for (var i = 0; i < order.length; i++) {
        var wp = "conf_seat" + order[i];
        if (reserveSeat(agent, floor, wp)) { return wp; }
    }
    return null;
}

function planAttendMeeting(agent) {
    var floor = (Math.random() < 0.65) ? agent.homeFloor : randInt(1, 5);
    var seat = reserveConfSeat(agent, floor);
    if (!seat) { return planVisitLounge(agent); }
    var plan = [actStand(), actEnterState("IN_MEETING"),
        actWalk(agent.homeFloor, agent.deskDoorWpName)];
    plan = plan.concat(subRide(agent.homeFloor, floor));
    plan.push(actWalk(floor, "conf_door"));
    plan.push(actWalk(floor, "conf_center"));
    plan.push(actWalk(floor, seat));
    plan.push(actSit(floor, seat));
    plan.push(actWaitSim(randRange(22, 45)));
    plan.push(actStand());
    plan.push(actReleaseSeat());
    return plan.concat(subBackToDesk(agent, floor));
}

function planVisitCoworker(agent) {
    var candidates = [];
    for (var i = 0; i < agents.length; i++) {
        var other = agents[i];
        if (other !== agent && other.role === "WORKER" && other.state === "AT_DESK") {
            candidates.push(other);
        }
    }
    if (candidates.length === 0) { return planVisitLounge(agent); }
    var target = candidates[Math.floor(Math.random() * candidates.length)];
    var plan = [actStand(), actEnterState("VISITING"),
        actWalk(agent.homeFloor, agent.deskDoorWpName)];
    plan = plan.concat(subRide(agent.homeFloor, target.homeFloor));
    plan.push(actWalk(target.homeFloor, target.deskDoorWpName));
    plan.push(actSit(target.homeFloor, target.deskDoorWpName)); // standing waypoint
    plan.push(actWaitSim(randRange(6, 18)));
    plan.push(actStand());
    return plan.concat(subBackToDesk(agent, target.homeFloor));
}

function planLeaveBuilding(agent, fromFloor) {
    var plan = [actStand(), actEnterState("LEAVING")];
    if (fromFloor === undefined) { fromFloor = agent.homeFloor; }
    if (fromFloor > 0) {
        if (agent.role === "WORKER") {
            plan.push(actWalk(fromFloor, agent.deskDoorWpName));
        }
        plan = plan.concat(subRide(fromFloor, 0));
    }
    plan.push(actWalk(0, "lobby_center"));
    plan.push(actWalk(0, "entrance"));
    plan.push(actWalk(0, "front_door_threshold"));
    plan.push(actWalk(0, "outside"));
    plan.push(actExitBuilding());
    return plan;
}

function planVisitorVisit(agent) {
    var plan = [
        actEnterState("ARRIVING"),
        actWalk(0, "front_door_threshold"),
        actWalk(0, "entrance")
    ];
    var lobby = simWorld.floors[0];
    var dur = agent.visitDuration;
    var roll = Math.random();
    var i, s, seat;
    if (roll < 0.10) {
        // bistro table
        seat = null;
        for (i = 0; i < 4; i++) {
            s = lobby.cafeSpots[Math.floor(Math.random() * lobby.cafeSpots.length)];
            if (reserveSeat(agent, 0, s)) { seat = s; break; }
        }
        if (seat) {
            plan.push(actWalk(0, seat));
            plan.push(actEnterState("VISITING"));
            plan.push(actSit(0, seat));
            plan.push(actWaitSim(dur));
            plan.push(actStand());
            plan.push(actReleaseSeat());
        } else {
            plan.push(actWalk(0, "lobby_stand_center"));
            plan.push(actEnterState("VISITING"));
            plan.push(actSit(0, "lobby_stand_center"));
            plan.push(actWaitSim(dur));
            plan.push(actStand());
        }
    } else if (roll < 0.16) {
        plan.push(actWalk(0, "cafe_order"));
        plan.push(actEnterState("VISITING"));
        plan.push(actSit(0, "cafe_order"));
        plan.push(actWaitSim(Math.min(dur, 12)));
        plan.push(actStand());
    } else if (roll < 0.30) {
        // front lounge
        seat = null;
        var fspots = ["flounge_couch", "flounge_chair0", "flounge_chair1"];
        for (i = 0; i < fspots.length; i++) {
            s = fspots[Math.floor(Math.random() * fspots.length)];
            if (reserveSeat(agent, 0, s)) { seat = s; break; }
        }
        if (!seat) { seat = "flounge_center"; }
        plan.push(actWalk(0, seat));
        plan.push(actEnterState("VISITING"));
        plan.push(actSit(0, seat));
        plan.push(actWaitSim(dur));
        plan.push(actStand());
        plan.push(actReleaseSeat());
    } else if (roll < 0.42) {
        // back lounge / conversation pit
        seat = null;
        var bspots = ["back_lounge_N", "back_lounge_S", "pit_N", "pit_S", "pit_E", "pit_W"];
        for (i = 0; i < bspots.length; i++) {
            s = bspots[Math.floor(Math.random() * bspots.length)];
            if (reserveSeat(agent, 0, s)) { seat = s; break; }
        }
        if (!seat) { seat = "pit_center"; }
        plan.push(actWalk(0, seat));
        plan.push(actEnterState("VISITING"));
        plan.push(actSit(0, seat));
        plan.push(actWaitSim(dur));
        plan.push(actStand());
        plan.push(actReleaseSeat());
    } else if (roll < 0.52) {
        // reception / kiosk / water cooler
        var stands = ["reception", "kiosk", "lobby_wc_front", "lobby_wc_back"];
        s = stands[Math.floor(Math.random() * stands.length)];
        plan.push(actWalk(0, s));
        plan.push(actEnterState("VISITING"));
        plan.push(actSit(0, s));
        plan.push(actWaitSim(Math.min(dur, 15)));
        plan.push(actStand());
    } else if (roll < 0.62) {
        // lobby loiter
        s = lobby.loiterSpots[Math.floor(Math.random() * lobby.loiterSpots.length)];
        plan.push(actWalk(0, s));
        plan.push(actEnterState("VISITING"));
        plan.push(actSit(0, s));
        plan.push(actWaitSim(dur));
        plan.push(actStand());
    } else if (roll < 0.77) {
        // ride up to an office-floor lounge
        var lf = randInt(1, 5);
        seat = null;
        var lspots = simWorld.floors[lf].loungeSpots;
        for (i = 0; i < lspots.length; i++) {
            s = lspots[Math.floor(Math.random() * lspots.length)];
            if (reserveSeat(agent, lf, s)) { seat = s; break; }
        }
        plan.push(actWalk(0, "lobby_center"));
        plan = plan.concat(subRide(0, lf));
        plan.push(actEnterState("VISITING"));
        if (seat) {
            plan.push(actWalk(lf, "lounge_door"));
            plan.push(actWalk(lf, seat));
            plan.push(actSit(lf, seat));
            plan.push(actWaitSim(dur));
            plan.push(actStand());
            plan.push(actReleaseSeat());
        } else {
            var hs = (Math.random() < 0.5) ? "hall_stand_N" : "hall_stand_S";
            plan.push(actWalk(lf, hs));
            plan.push(actSit(lf, hs));
            plan.push(actWaitSim(dur));
            plan.push(actStand());
        }
        plan = plan.concat(subRide(lf, 0));
    } else {
        // sit in on a meeting on a random floor
        var mf = randInt(1, 5);
        seat = reserveConfSeat(agent, mf);
        if (seat) {
            plan.push(actWalk(0, "lobby_center"));
            plan = plan.concat(subRide(0, mf));
            plan.push(actEnterState("IN_MEETING"));
            plan.push(actWalk(mf, "conf_door"));
            plan.push(actWalk(mf, "conf_center"));
            plan.push(actWalk(mf, seat));
            plan.push(actSit(mf, seat));
            plan.push(actWaitSim(Math.max(dur, 22)));
            plan.push(actStand());
            plan.push(actReleaseSeat());
            plan = plan.concat(subRide(mf, 0));
        } else {
            s = lobby.loiterSpots[Math.floor(Math.random() * lobby.loiterSpots.length)];
            plan.push(actWalk(0, s));
            plan.push(actEnterState("VISITING"));
            plan.push(actSit(0, s));
            plan.push(actWaitSim(dur));
            plan.push(actStand());
        }
    }
    plan.push(actEnterState("LEAVING"));
    plan.push(actWalk(0, "lobby_center"));
    plan.push(actWalk(0, "entrance"));
    plan.push(actWalk(0, "front_door_threshold"));
    plan.push(actWalk(0, "outside"));
    plan.push(actExitBuilding());
    return plan;
}

// ---------------- decision rules ----------------
var MEETING_PROB = 0.36;

function chooseNextActivity(agent) {
    var now = simClock.simMinute;
    if (now >= agent.departureTime) {
        agent.leaving = true;
        agent.plan = planLeaveBuilding(agent, agent.homeFloor);
        return;
    }
    for (var i = 0; i < agent.plannedMeetingTimes.length; i++) {
        if (now >= agent.plannedMeetingTimes[i]) {
            agent.plannedMeetingTimes.splice(i, 1);
            agent.plan = planAttendMeeting(agent);
            return;
        }
    }
    if (now >= agent.lunchTime && !agent.hasLunched) {
        agent.plan = planGoToLunch(agent);
        return;
    }
    var roll = Math.random();
    if (roll < MEETING_PROB * 0.4) {
        agent.plan = planAttendMeeting(agent);
    } else if (roll < MEETING_PROB * 0.4 + 0.12) {
        agent.plan = planVisitLounge(agent);
    } else if (roll < MEETING_PROB * 0.4 + 0.12 + 0.15) {
        agent.plan = planVisitCoworker(agent);
    } else {
        agent.plan = [actWaitSim(randRange(18, 65)), actPickNext()];
    }
}

// ---------------- walking machinery ----------------
var ENTRANCE_CHAIN = { outside: 1, front_door_threshold: 1, entrance: 1 };

function beginWalk(agent, action) {
    var floorData = simWorld.floors[action.floor];
    var nodes = floorData.nodes;
    var fromName = nearestNodeName(nodes, agent.group.position);
    action.path = bfsPath(nodes, fromName, action.wp);
    if (action.path.length === 0) {
        action.path = [nodes[action.wp] ? nodes[action.wp].pos.clone()
            : agent.group.position.clone()];
    }
    action.pathIndex = 0;
    action.stallT = 0;
    action.prevPos = agent.group.position.clone();
    agent.group.userData.isWalking = true;
    agent.group.userData.isSitting = false;
    agent.noCollide = !!ENTRANCE_CHAIN[action.wp];
}

function stepWalk(agent, action, dt) {
    var group = agent.group;
    var remaining = WALK_SPEED * dt;
    var guard = 0;
    while (remaining > 0 && action.pathIndex < action.path.length && guard < 64) {
        guard++;
        var target = action.path[action.pathIndex];
        var dx = target.x - group.position.x;
        var dz = target.z - group.position.z;
        var dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < 0.06) {
            action.pathIndex++;
            continue;
        }
        var step = Math.min(remaining, dist);
        group.position.x += dx / dist * step;
        group.position.z += dz / dist * step;
        group.rotation.y = Math.atan2(dx, dz);
        remaining -= step;
    }
    // stall detection
    var moved = Math.sqrt(
        Math.pow(group.position.x - action.prevPos.x, 2) +
        Math.pow(group.position.z - action.prevPos.z, 2));
    if (moved < 0.005) {
        action.stallT += dt;
        if (action.stallT > 1.2 && action.pathIndex < action.path.length) {
            var wp = action.path[action.pathIndex];
            group.position.x = wp.x;
            group.position.z = wp.z;
            action.pathIndex++;
            action.stallT = 0;
        }
    } else {
        action.stallT = 0;
    }
    action.prevPos.copy(group.position);
    if (action.pathIndex >= action.path.length) {
        agent.group.userData.isWalking = false;
        agent.noCollide = false;
        return true;
    }
    return false;
}

// ---------------- action dispatch ----------------
function startAction(agent, action) {
    switch (action.type) {
        case "WALK_TO_WP":
            beginWalk(agent, action);
            break;
        case "WAIT_AT_PANEL":
            agent.state = "WAITING_ELEVATOR";
            agent.group.userData.isWalking = false;
            // spread waiters out in front of the panel
            action.waitX = agent.group.position.x + randRange(-0.9, 0.9);
            action.waitZ = agent.group.position.z + randRange(0.1, 1.1);
            break;
        case "ENTER_ELEVATOR":
            action.phase = 0;
            action.stallT = 0;
            action.prevPos = agent.group.position.clone();
            break;
        case "WAIT_SIM":
            action.untilMin = simClock.simMinute + action.minutes;
            agent.group.userData.isWalking = false;
            break;
        case "EXIT_ELEVATOR":
            action.phase = 0;
            break;
        default:
            break;
    }
}

function updateAction(agent, action, dt) {
    var group = agent.group;
    var fy;
    switch (action.type) {
        case "WALK_TO_WP":
            return stepWalk(agent, action, dt);

        case "WAIT_AT_PANEL": {
            // re-press the hall call every frame in case it was cleared
            if (action.dir > 0) { simElevator.callUp(action.floor); }
            else { simElevator.callDown(action.floor); }
            if (simElevator.isAcceptingAt(action.floor, action.dir) &&
                simElevator.currentCapacityFree() > 0) {
                return true;
            }
            return false;
        }

        case "ENTER_ELEVATOR": {
            fy = action.fromFloor * WORLD.FLOOR_HEIGHT;
            var lg = simElevator.logic;
            if (action.phase === 0) {
                // reserve
                if (!(lg.state === "DOOR_OPEN" && lg.currentFloor === action.fromFloor)) {
                    // car slipped away - re-press and bail back to waiting
                    var dir0 = action.toFloor > action.fromFloor ? 1 : -1;
                    if (dir0 > 0) { simElevator.callUp(action.fromFloor); }
                    else { simElevator.callDown(action.fromFloor); }
                    return false;
                }
                var spot = simElevator.reserveBoardingSpot(agent);
                if (spot === null) {
                    var dir1 = action.toFloor > action.fromFloor ? 1 : -1;
                    if (dir1 > 0) { simElevator.callUp(action.fromFloor); }
                    else { simElevator.callDown(action.fromFloor); }
                    return false;
                }
                action.spot = spot;
                action.phase = 1;
                agent.state = "IN_CAR";
                group.userData.isWalking = true;
                action.stallT = 0;
                action.prevPos.copy(group.position);
                return false;
            }
            // lost reservation? (safety cap fired)
            if (!lg.pendingBoarders.has(agent) && !lg.passengers.has(agent)) {
                action.phase = 0;
                agent.state = "WAITING_ELEVATOR";
                return false;
            }
            if (action.phase === 1) {
                // walk to the door threshold in world space, on own lane (spot.x)
                var tx = action.spot.x;
                var tz = 1.9;
                var ddx = tx - group.position.x;
                var ddz = tz - group.position.z;
                var dd = Math.sqrt(ddx * ddx + ddz * ddz);
                var mv = WALK_SPEED * dt;
                if (dd <= Math.max(mv, 0.08)) {
                    group.position.x = tx;
                    group.position.z = tz;
                    action.phase = 2;
                    // reparent scene -> car
                    simElevator.carGroup.add(group);
                    group.position.set(tx, 0, tz);
                    action.stallT = 0;
                } else {
                    group.position.x += ddx / dd * mv;
                    group.position.z += ddz / dd * mv;
                    group.rotation.y = Math.atan2(ddx, ddz);
                    var mvd = Math.sqrt(
                        Math.pow(group.position.x - action.prevPos.x, 2) +
                        Math.pow(group.position.z - action.prevPos.z, 2));
                    if (mvd < 0.005) {
                        action.stallT += dt;
                        if (action.stallT > 1.5) {
                            group.position.x = tx;
                            group.position.z = tz;
                            action.stallT = 0;
                        }
                    } else { action.stallT = 0; }
                    action.prevPos.copy(group.position);
                }
                return false;
            }
            if (action.phase === 2) {
                // walk to reserved interior spot in car-local space
                var sx = action.spot.x;
                var sz = action.spot.z;
                var cdx = sx - group.position.x;
                var cdz = sz - group.position.z;
                var cd = Math.sqrt(cdx * cdx + cdz * cdz);
                var cmv = WALK_SPEED * dt;
                if (cd <= Math.max(cmv, 0.06)) {
                    group.position.set(sx, 0, sz);
                    simElevator.completeBoard(agent);
                    group.rotation.y = 0; // face the doors
                    group.userData.isWalking = false;
                    return true;
                }
                group.position.x += cdx / cd * cmv;
                group.position.z += cdz / cd * cmv;
                group.rotation.y = Math.atan2(cdx, cdz);
                return false;
            }
            return false;
        }

        case "PRESS_FLOOR":
            simElevator.pressDestination(action.floor);
            return true;

        case "WAIT_FOR_FLOOR":
            return simElevator.state === "DOOR_OPEN" &&
                simElevator.currentFloor === action.floor;

        case "EXIT_ELEVATOR": {
            fy = action.toFloor * WORLD.FLOOR_HEIGHT;
            if (action.phase === 0) {
                simElevator.registerDisembark(agent);
                // reparent car -> scene, preserving world position
                var wx = group.position.x;
                var wz = group.position.z;
                simScene.add(group);
                group.position.set(wx, fy, wz);
                group.userData.isWalking = true;
                action.phase = 1;
                action.stallT = 0;
                action.prevPos = group.position.clone();
                return false;
            }
            var ew = simWorld.floors[action.toFloor].nodes["elevWait"].pos;
            var edx = ew.x - group.position.x;
            var edz = ew.z - group.position.z;
            var ed = Math.sqrt(edx * edx + edz * edz);
            var emv = WALK_SPEED * dt;
            if (ed <= Math.max(emv, 0.08)) {
                group.position.x = ew.x;
                group.position.z = ew.z;
                simElevator.completeDisembark(agent);
                group.userData.isWalking = false;
                agent.state = "ON_FLOOR";
                return true;
            }
            group.position.x += edx / ed * emv;
            group.position.z += edz / ed * emv;
            group.rotation.y = Math.atan2(edx, edz);
            var emvd = Math.sqrt(
                Math.pow(group.position.x - action.prevPos.x, 2) +
                Math.pow(group.position.z - action.prevPos.z, 2));
            if (emvd < 0.005) {
                action.stallT += dt;
                if (action.stallT > 1.5) {
                    group.position.x = ew.x;
                    group.position.z = ew.z;
                    action.stallT = 0;
                }
            } else { action.stallT = 0; }
            action.prevPos.copy(group.position);
            return false;
        }

        case "SIT": {
            var floorData = simWorld.floors[action.floor];
            var node = floorData.nodes[action.wp];
            var st = floorData.sitTargets[action.wp];
            fy = action.floor * WORLD.FLOOR_HEIGHT;
            if (node) {
                group.position.set(node.pos.x, fy, node.pos.z);
            }
            if (st && st.sit) {
                group.rotation.y = st.facing;
                group.userData.isSitting = true;
                group.position.y = fy - 0.35;
            } else {
                // standing waypoint: jitter in a small ring for personal space
                var ang = Math.random() * Math.PI * 2;
                var rad = randRange(0.35, 0.75);
                group.position.x += Math.sin(ang) * rad;
                group.position.z += Math.cos(ang) * rad;
                if (st) { group.rotation.y = st.facing; }
                group.userData.isSitting = false;
            }
            group.userData.isWalking = false;
            return true;
        }

        case "STAND":
            group.userData.isSitting = false;
            if (group.parent === simElevator.carGroup) {
                group.position.y = 0;
            } else {
                group.position.y = Math.round(group.position.y / WORLD.FLOOR_HEIGHT) * WORLD.FLOOR_HEIGHT;
            }
            return true;

        case "RELEASE_SEAT":
            releaseAgentSeats(agent);
            return true;

        case "WAIT_SIM":
            return simClock.simMinute >= action.untilMin;

        case "EXIT_BUILDING":
            despawnAgent(agent);
            agent.state = "GONE";
            agent.leaving = false;
            releaseAgentSeats(agent);
            return true;

        case "ENTER_STATE":
            agent.state = action.state;
            return true;

        case "MARK_LUNCHED":
            agent.hasLunched = true;
            return true;

        case "PICK_NEXT_ACTIVITY":
            chooseNextActivity(agent);
            return true;

        default:
            return true;
    }
}

function dispatchAgent(agent, dt) {
    for (var iter = 0; iter < 16; iter++) {
        if (!agent.currentAction) {
            if (agent.plan.length === 0) {
                if (agent.role === "WORKER") { chooseNextActivity(agent); }
                else { agent.plan = [actWalk(0, "outside"), actExitBuilding()]; }
            }
            agent.currentAction = agent.plan.shift();
            if (!agent.currentAction) { return; }
            startAction(agent, agent.currentAction);
        }
        var done = updateAction(agent, agent.currentAction, dt);
        if (done) {
            agent.currentAction = null;
            dt = 0; // subsequent actions this frame get zero-duration handoff
        } else {
            return;
        }
    }
}

// ---------------- lifecycle / scheduling ----------------
function countPresentOrInbound() {
    var n = 0;
    var now = simClock.simMinute;
    for (var i = 0; i < agents.length; i++) {
        var a = agents[i];
        if (a.state === "DISABLED" || a.state === "GONE") { continue; }
        if (a.state === "AWAY") {
            if (a.arrivalTime <= now + 6) { n++; }
            continue;
        }
        n++;
    }
    return n;
}

function topUpVisitors() {
    var now = simClock.simMinute;
    if (now < 8 * 60 || now > 17 * 60) { return; }
    var deficit = targetOccupancy - countPresentOrInbound();
    if (deficit <= 0) { return; }
    for (var i = 0; i < agents.length && deficit > 0; i++) {
        var a = agents[i];
        if (a.role !== "VISITOR") { continue; }
        if (a.id >= targetOccupancy) { continue; }
        if (a.state === "GONE" || (a.state === "AWAY" && a.arrivalTime > now + 6)) {
            sampleVisitorSchedule(a, now + randInt(0, 6));
            a.state = "AWAY";
            deficit--;
        }
    }
}

function processSchedule(agent) {
    var now = simClock.simMinute;
    if (agent.state === "AWAY" && now >= agent.arrivalTime && now < 20 * 60) {
        spawnAgent(agent);
        agent.state = "ARRIVING";
        agent.plan = (agent.role === "WORKER") ? planArriveToDesk(agent)
            : planVisitorVisit(agent);
        agent.currentAction = null;
    }
    // end-of-day override for workers sitting at their desk
    if (agent.role === "WORKER" && agent.state === "AT_DESK" && !agent.leaving &&
        now >= agent.departureTime && agent.currentAction &&
        agent.currentAction.type === "WAIT_SIM") {
        agent.leaving = true;
        releaseAgentSeats(agent);
        agent.plan = planLeaveBuilding(agent, agent.homeFloor);
        agent.currentAction = null;
    }
}

function simOnNewDay() {
    for (var i = 0; i < agents.length; i++) {
        var a = agents[i];
        despawnAgent(a);
        a.plan = [];
        a.currentAction = null;
        a.leaving = false;
        releaseAgentSeats(a);
        if (a.role === "WORKER") { sampleWorkerSchedule(a); }
        else { sampleVisitorSchedule(a); }
        a.state = (a.id < targetOccupancy) ? "AWAY" : "DISABLED";
    }
    seatReservations.clear();
    simElevator.reset();
}

function applyOccupancy() {
    var now = simClock.simMinute;
    for (var i = 0; i < agents.length; i++) {
        var a = agents[i];
        if (a.id < targetOccupancy && a.state === "DISABLED") {
            a.state = "AWAY";
            if (a.role === "WORKER" && now > a.arrivalTime && now < a.departureTime - 60) {
                a.arrivalTime = now + randRange(1, 10);
            }
        } else if (a.id >= targetOccupancy && a.state === "AWAY") {
            a.state = "DISABLED";
        }
    }
}

// ---------------- collisions ----------------
function applyCollisions() {
    var active = [];
    for (var i = 0; i < agents.length; i++) {
        var a = agents[i];
        if (!a.group || !a.group.parent) { continue; }
        if (a.group.parent !== simScene) { continue; } // skip in-car agents
        if (a.group.userData.isSitting) { continue; }
        if (a.noCollide) { continue; }
        if (a.currentAction && a.currentAction.type === "ENTER_ELEVATOR") { continue; }
        active.push(a);
    }
    for (var p = 0; p < active.length; p++) {
        for (var q = p + 1; q < active.length; q++) {
            var g1 = active[p].group;
            var g2 = active[q].group;
            if (Math.abs(g1.position.y - g2.position.y) > 1) { continue; }
            var dx = g2.position.x - g1.position.x;
            var dz = g2.position.z - g1.position.z;
            var d = Math.sqrt(dx * dx + dz * dz);
            if (d >= 0.7) { continue; }
            var pushX, pushZ;
            if (d < 0.001) {
                var ra = Math.random() * Math.PI * 2;
                pushX = Math.sin(ra);
                pushZ = Math.cos(ra);
            } else {
                pushX = dx / d;
                pushZ = dz / d;
            }
            var overlap = (0.7 - d) * 0.18;
            g1.position.x -= pushX * overlap;
            g1.position.z -= pushZ * overlap;
            g2.position.x += pushX * overlap;
            g2.position.z += pushZ * overlap;
        }
    }
}

// ---------------- HUD ----------------
function buildHUD() {
    var hud = document.createElement("div");
    hud.style.cssText = "position:fixed;top:10px;left:10px;z-index:10;" +
        "background:rgba(10,12,20,0.75);color:#dde;padding:12px 14px;" +
        "font-family:monospace;font-size:12px;border-radius:8px;min-width:230px;";

    hudTimeEl = document.createElement("div");
    hudTimeEl.style.cssText = "font-size:26px;font-weight:bold;color:#ffbb22;margin-bottom:8px;";
    hud.appendChild(hudTimeEl);

    hudSpeedLabel = document.createElement("div");
    hud.appendChild(hudSpeedLabel);
    var speedSlider = document.createElement("input");
    speedSlider.type = "range";
    speedSlider.min = "0";
    speedSlider.max = "100";
    speedSlider.step = "1";
    speedSlider.value = String(Math.round(100 * Math.log(120) / Math.log(600)));
    speedSlider.style.width = "100%";
    speedSlider.addEventListener("input", function(ev) {
        var frac = Number(ev.target.value) / 100;
        simClock.timeScale = Math.round(Math.pow(600, frac));
        if (simClock.timeScale < 1) { simClock.timeScale = 1; }
        hudSpeedLabel.textContent = "Speed: " + simClock.timeScale + "x";
    });
    hud.appendChild(speedSlider);
    hudSpeedLabel.textContent = "Speed: " + simClock.timeScale + "x";

    hudOccLabel = document.createElement("div");
    hudOccLabel.style.marginTop = "6px";
    hud.appendChild(hudOccLabel);
    var occSlider = document.createElement("input");
    occSlider.type = "range";
    occSlider.min = "1";
    occSlider.max = String(MAX_OCCUPANCY);
    occSlider.step = "1";
    occSlider.value = String(targetOccupancy);
    occSlider.style.width = "100%";
    occSlider.addEventListener("input", function(ev) {
        targetOccupancy = Number(ev.target.value);
        hudOccLabel.textContent = "Occupancy: " + targetOccupancy + " / " + MAX_OCCUPANCY + " people";
        applyOccupancy();
    });
    hud.appendChild(occSlider);
    hudOccLabel.textContent = "Occupancy: " + targetOccupancy + " / " + MAX_OCCUPANCY + " people";

    hudStatsEl = document.createElement("div");
    hudStatsEl.style.cssText = "margin-top:8px;white-space:pre;line-height:1.5;";
    hud.appendChild(hudStatsEl);

    document.body.appendChild(hud);
}

function updateHUD() {
    hudTimeEl.textContent = simClock.format();
    var counts = {};
    for (var i = 0; i < agents.length; i++) {
        var s = agents[i].state;
        counts[s] = (counts[s] || 0) + 1;
    }
    var lines = [];
    var stateNames = Object.keys(counts).sort();
    for (var k = 0; k < stateNames.length; k++) {
        if (stateNames[k] === "DISABLED") { continue; }
        lines.push(stateNames[k] + ": " + counts[stateNames[k]]);
    }
    var lg = simElevator;
    lines.push("");
    lines.push("ELEVATOR floor " + lg.currentFloor +
        " dir " + (lg.direction > 0 ? "up" : lg.direction < 0 ? "down" : "-") +
        " " + lg.state);
    lines.push("pax " + lg.passengers.size +
        " dest {" + Array.from(lg.destinations).join(",") + "}");
    lines.push("up {" + Array.from(lg.upCalls).join(",") +
        "} down {" + Array.from(lg.downCalls).join(",") + "}");
    hudStatsEl.textContent = lines.join("\n");
}

// ---------------- bootstrap ----------------
function initAgents() {
    for (var i = 0; i < MAX_OCCUPANCY; i++) {
        var role = (i < MAX_WORKERS) ? "WORKER" : "VISITOR";
        var a = makeAgent(i, role);
        a.state = (i < targetOccupancy) ? "AWAY" : "DISABLED";
        agents.push(a);
    }
}

function startSimulation() {
    simScene = new THREE.Scene();
    simScene.background = new THREE.Color(0x20242a);
    simCamera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    simCamera.position.set(28, 24, 28);
    simRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    simRenderer.setSize(window.innerWidth, window.innerHeight);
    simRenderer.sortObjects = true;
    document.body.appendChild(simRenderer.domElement);
    simControls = new THREE.OrbitControls(simCamera, simRenderer.domElement);
    simControls.target.set(0, 8, 0);
    simAmbient = new THREE.AmbientLight(0xffffff, 0.45);
    simScene.add(simAmbient);
    simHemi = new THREE.HemisphereLight(0xbfd7ff, 0x303020, 0.45);
    simScene.add(simHemi);
    simSun = new THREE.DirectionalLight(0xffffff, 0.9);
    simSun.position.set(20, 35, 18);
    simScene.add(simSun);

    simWorld = createWorld(simScene);
    simElevator = new Elevator(simScene, simWorld);
    initAgents();
    buildHUD();
    realClock = new THREE.Clock();

    window.addEventListener("resize", function() {
        simCamera.aspect = window.innerWidth / window.innerHeight;
        simCamera.updateProjectionMatrix();
        simRenderer.setSize(window.innerWidth, window.innerHeight);
    });

    function animate() {
        requestAnimationFrame(animate);
        var realDt = Math.min(0.05, realClock.getDelta());
        simClock.tick(realDt);
        updateLighting();
        var motionDt = realDt * simClock.timeScale;
        simElevator.tick(motionDt);
        topUpVisitors();
        for (var i = 0; i < agents.length; i++) {
            var a = agents[i];
            if (a.state === "DISABLED" || a.state === "GONE") { continue; }
            processSchedule(a);
            if (a.state === "AWAY") { continue; }
            if (a.group && a.group.parent) {
                dispatchAgent(a, motionDt);
            }
        }
        applyCollisions();
        for (var j = 0; j < agents.length; j++) {
            var b = agents[j];
            if (b.group && b.group.parent) {
                animatePersonWalking(b.group, motionDt);
            }
        }
        simControls.update();
        simRenderer.render(simScene, simCamera);
        updateHUD();
    }
    animate();
}

if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", startSimulation);
} else {
    startSimulation();
}
