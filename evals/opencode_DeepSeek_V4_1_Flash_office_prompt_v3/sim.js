"use strict";

var MAX_WORKERS = 20;
var MAX_VISITORS = 80;
var MAX_OCCUPANCY = MAX_WORKERS + MAX_VISITORS;
var DEFAULT_OCCUPANCY = 45;
var WORK_START = 7 * 60;
var WORK_END = 20 * 60;
var PERSON_SPEED = 1.35;
var ENTRANCE_WPS = { outside: 1, front_door_threshold: 1, entrance: 1 };

var NAMES = [
    "Ava", "Ben", "Cara", "Dan", "Eve", "Finn", "Gia", "Hugo", "Iris", "Jack",
    "Kira", "Liam", "Mia", "Noah", "Omar", "Pia", "Quinn", "Rosa", "Sam", "Tess",
    "Uma", "Vic", "Wes", "Xena", "Yuri", "Zoe", "Abel", "Bree", "Cleo", "Drew",
    "Eli", "Faye", "Gus", "Hana", "Ivan", "Jo", "Kai", "Lena", "Milo", "Nina"
];

var LIGHT_KEYFRAMES = [
    { m: 0, bg: 0x0a0e18, sun: 0x223355, sunI: 0.05, amb: 0.45, hemi: 0.32, hemiSky: 0x223355 },
    { m: 5 * 60, bg: 0x0a0e18, sun: 0x223355, sunI: 0.05, amb: 0.45, hemi: 0.32, hemiSky: 0x223355 },
    { m: 6 * 60, bg: 0x3a3550, sun: 0xff9955, sunI: 0.3, amb: 0.5, hemi: 0.35, hemiSky: 0x554466 },
    { m: 6.5 * 60, bg: 0x87b7e8, sun: 0xffddaa, sunI: 0.8, amb: 0.55, hemi: 0.42, hemiSky: 0xbfd7ff },
    { m: 8 * 60, bg: 0x9fc6ee, sun: 0xffffff, sunI: 0.95, amb: 0.6, hemi: 0.46, hemiSky: 0xbfd7ff },
    { m: 12 * 60, bg: 0x9fc6ee, sun: 0xffffff, sunI: 0.95, amb: 0.6, hemi: 0.46, hemiSky: 0xbfd7ff },
    { m: 17.5 * 60, bg: 0xe8b07a, sun: 0xffaa55, sunI: 0.6, amb: 0.55, hemi: 0.42, hemiSky: 0xffcc99 },
    { m: 18.5 * 60, bg: 0x3a3550, sun: 0xff7733, sunI: 0.25, amb: 0.48, hemi: 0.35, hemiSky: 0x554466 },
    { m: 20 * 60, bg: 0x0a0e18, sun: 0x223355, sunI: 0.06, amb: 0.45, hemi: 0.32, hemiSky: 0x223355 },
    { m: 24 * 60, bg: 0x0a0e18, sun: 0x223355, sunI: 0.05, amb: 0.45, hemi: 0.32, hemiSky: 0x223355 }
];

let scene = null;
let camera = null;
let renderer = null;
let controls = null;
let world = null;
let elevator = null;
let renderClock = null;
let sunLight = null;
let ambientLight = null;
let hemiLight = null;
let agents = [];
let targetOccupancy = DEFAULT_OCCUPANCY;
let hudTime = null;
let hudInfo = null;
let speedSlider = null;
let occSlider = null;
let occLabel = null;

const seatReservations = new Set();
const LIGHT_COLORS = LIGHT_KEYFRAMES.map(function map(kf) {
    return {
        m: kf.m,
        bg: new THREE.Color(kf.bg),
        sun: new THREE.Color(kf.sun),
        sunI: kf.sunI,
        amb: kf.amb,
        hemi: kf.hemi,
        hemiSky: new THREE.Color(kf.hemiSky)
    };
});
const sceneBackground = new THREE.Color(0x20242a);

const Clock = {
    simMinute: 7 * 60 + 30,
    timeScale: 120,
    tick: function tick(realDt) {
        this.simMinute += (realDt * this.timeScale) / 60;
        if (this.simMinute >= 24 * 60) {
            this.simMinute -= 24 * 60;
            beginNewDay();
        }
    },
    format: function format() {
        var total = Math.floor(this.simMinute) % 1440;
        var h = Math.floor(total / 60);
        var m = Math.floor(total % 60);
        var ampm = h >= 12 ? "PM" : "AM";
        var hh = h % 12;
        if (hh === 0) hh = 12;
        return (hh < 10 ? " " : "") + hh + ":" + (m < 10 ? "0" : "") + m + " " + ampm;
    }
};

function randInt(a, b) {
    return a + Math.floor(Math.random() * (b - a + 1));
}

function pickRandom(list) {
    return list[Math.floor(Math.random() * list.length)];
}

function shuffle(list) {
    var arr = list.slice();
    var i;
    for (i = arr.length - 1; i > 0; i -= 1) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = arr[i];
        arr[i] = arr[j];
        arr[j] = tmp;
    }
    return arr;
}

function pushAll(target, items) {
    var i;
    for (i = 0; i < items.length; i += 1) target.push(items[i]);
}

function floorY(floor) {
    return floor * WORLD.FLOOR_HEIGHT;
}

function reserveSeat(agent, floor, candidates) {
    var order = shuffle(candidates);
    var i;
    for (i = 0; i < order.length; i += 1) {
        var key = floor + ":" + order[i];
        if (!seatReservations.has(key)) {
            seatReservations.add(key);
            agent._seatKey = key;
            return order[i];
        }
    }
    return null;
}

function seatRelease(agent) {
    if (agent._seatKey) {
        seatReservations.delete(agent._seatKey);
        agent._seatKey = null;
    }
}

function resetSchedule(agent) {
    agent.arrivalTime = 8 * 60 + 15 + randInt(0, 75);
    agent.lunchTime = 11 * 60 + 30 + randInt(0, 120);
    agent.lunchDuration = randInt(25, 60);
    var dep = 16 * 60 + 45 + randInt(0, 105);
    if (Math.random() < 0.15) dep = 18 * 60 + 30 + randInt(0, 75);
    agent.departureTime = dep;
    agent.plannedMeetingTimes = [];
    if (Math.random() < 0.6) agent.plannedMeetingTimes.push(9 * 60 + 30 + randInt(0, 120));
    if (Math.random() < 0.5) agent.plannedMeetingTimes.push(13 * 60 + 30 + randInt(0, 120));
    agent.plannedMeetingTimes.sort(function sort(a, b) { return a - b; });
    agent.hasLunched = false;
}

function resetVisitorSchedule(agent) {
    agent.arrivalTime = Clock.simMinute + randInt(0, 6);
    agent.visitDuration = randInt(15, 45);
}

function createAgentObject(id, role) {
    var group = createPerson();
    group.visible = false;
    group.position.set(0, 0, 14);
    scene.add(group);
    return {
        id: id,
        role: role,
        name: NAMES[id % NAMES.length],
        group: group,
        state: "DISABLED",
        plan: [],
        currentAction: null,
        homeFloor: 0,
        deskWpName: null,
        deskDoorWpName: null,
        arrivalTime: 8 * 60,
        lunchTime: 12 * 60,
        lunchDuration: 30,
        departureTime: 17 * 60,
        visitDuration: 30,
        plannedMeetingTimes: [],
        hasLunched: false,
        _floor: 0,
        _seatKey: null,
        _leaving: false,
        _armed: false,
        _entrance: false
    };
}

function initAgents() {
    agents = [];
    var i;
    for (i = 0; i < MAX_WORKERS; i += 1) {
        var worker = createAgentObject(i, "WORKER");
        var homeFloor = 1 + Math.floor(i / 4);
        var deskIndex = i % 4;
        var deskList = world.floors[homeFloor].desks;
        var desk = deskList[deskIndex];
        worker.homeFloor = homeFloor;
        worker.deskWpName = desk.seatWp;
        worker.deskDoorWpName = desk.doorWp;
        resetSchedule(worker);
        worker.state = "AWAY";
        agents.push(worker);
    }
    for (i = 0; i < MAX_VISITORS; i += 1) {
        var visitor = createAgentObject(MAX_WORKERS + i, "VISITOR");
        resetVisitorSchedule(visitor);
        visitor.state = "AWAY";
        agents.push(visitor);
    }
    applyOccupancy();
}

function applyOccupancy() {
    var i;
    for (i = 0; i < agents.length; i += 1) {
        var agent = agents[i];
        if (agent.id < targetOccupancy) {
            if (agent.state === "DISABLED") {
                resetSchedule(agent);
                if (agent.role === "VISITOR") {
                    resetVisitorSchedule(agent);
                    agent._armed = true;
                }
                agent.state = "AWAY";
            }
        } else if (agent.state === "AWAY" || agent.state === "GONE" || agent.state === "DISABLED") {
            if (agent.group.parent) agent.group.parent.remove(agent.group);
            agent.group.visible = false;
            agent.state = "DISABLED";
            agent.plan = [];
            agent.currentAction = null;
        }
    }
}

function countPresent() {
    var n = 0;
    var i;
    for (i = 0; i < agents.length; i += 1) {
        var s = agents[i].state;
        if (s !== "AWAY" && s !== "GONE" && s !== "DISABLED") n += 1;
    }
    return n;
}

function topUpVisitors() {
    if (Clock.simMinute < WORK_START || Clock.simMinute > WORK_END) return;
    var deficit = targetOccupancy - countPresent();
    if (deficit <= 0) return;
    var armed = 0;
    var i;
    for (i = 0; i < agents.length && armed < deficit; i += 1) {
        var agent = agents[i];
        if (agent.role !== "VISITOR") continue;
        if (agent.state !== "AWAY" && agent.state !== "GONE") continue;
        if (agent._armed) continue;
        resetVisitorSchedule(agent);
        agent.state = "AWAY";
        agent.plan = [];
        agent.currentAction = null;
        agent._armed = true;
        agent.group.visible = false;
        armed += 1;
    }
}

function beginNewDay() {
    seatReservations.clear();
    var i;
    for (i = 0; i < agents.length; i += 1) {
        var agent = agents[i];
        agent._seatKey = null;
        agent._leaving = false;
        agent._armed = false;
        agent._entrance = false;
        agent.plan = [];
        agent.currentAction = null;
        if (agent.group.parent) agent.group.parent.remove(agent.group);
        agent.group.visible = false;
        agent.group.position.set(0, 0, 14);
        agent.group.userData.isSitting = false;
        agent.group.userData.isWalking = false;
        resetSchedule(agent);
        if (agent.role === "VISITOR") resetVisitorSchedule(agent);
        if (agent.id >= targetOccupancy) agent.state = "DISABLED";
        else agent.state = "AWAY";
    }
    if (elevator) elevator.reset();
}

function spawnAgent(agent, plan) {
    var g = agent.group;
    if (g.parent && g.parent !== scene) g.parent.remove(g);
    if (!g.parent) scene.add(g);
    g.visible = true;
    g.position.set((Math.random() - 0.5) * 2.2, 0, 12 + (Math.random() - 0.5) * 1.5);
    g.rotation.y = 0;
    g.userData.isSitting = false;
    g.userData.isWalking = false;
    g.userData.walkPhase = 0;
    agent._floor = 0;
    agent._entrance = true;
    agent._armed = false;
    agent.currentAction = null;
    agent.plan = plan;
}

function spawnWorker(agent) {
    agent._leaving = false;
    seatRelease(agent);
    spawnAgent(agent, planArriveToDesk(agent));
    agent.state = "ARRIVING";
}

function spawnVisitor(agent) {
    spawnAgent(agent, planVisitorVisit(agent));
    agent.state = "VISITING";
}

function pressCall(agent, floor, dir) {
    if (dir > 0) elevator.callUp(floor);
    else elevator.callDown(floor);
}

function computePath(agent, floor, wpName) {
    var floorObj = world.floors[floor];
    if (!floorObj) return [];
    var nodes = floorObj.nodes;
    var pos = agent.group.position;
    var nearest = null;
    var nearestDist = Infinity;
    var name;
    for (name in nodes) {
        if (!nodes.hasOwnProperty(name)) continue;
        var dx = nodes[name].pos.x - pos.x;
        var dz = nodes[name].pos.z - pos.z;
        var d = dx * dx + dz * dz;
        if (d < nearestDist) { nearestDist = d; nearest = name; }
    }
    var path = world.bfsPath(nodes, nearest, wpName);
    if (path.length === 0 && nodes[wpName]) path = [nodes[wpName].pos.clone()];
    return path;
}

function startWalk(agent, action) {
    agent._floor = action.floor;
    agent._entrance = action.floor === 0 && (ENTRANCE_WPS[action.wp] === 1);
    action.path = computePath(agent, action.floor, action.wp);
    action.index = 0;
    action._bestDist = Infinity;
    action._stallT = 0;
    agent.group.userData.isWalking = true;
}

function updateWalk(agent, dt) {
    var action = agent.currentAction;
    if (!action || !action.path || action.index >= action.path.length) {
        agent.group.userData.isWalking = false;
        agent._entrance = false;
        return true;
    }
    var target = action.path[action.index];
    var pos = agent.group.position;
    var dx = target.x - pos.x;
    var dz = target.z - pos.z;
    var dist = Math.sqrt(dx * dx + dz * dz);
    var step = PERSON_SPEED * dt;

    if (dist <= step + 0.02) {
        pos.x = target.x;
        pos.z = target.z;
        pos.y = floorY(agent._floor);
        action.index += 1;
        action._bestDist = Infinity;
        action._stallT = 0;
        if (action.index >= action.path.length) {
            agent.group.userData.isWalking = false;
            agent._entrance = false;
            return true;
        }
        return false;
    }

    pos.x += (dx / dist) * step;
    pos.z += (dz / dist) * step;
    pos.y = floorY(agent._floor);
    agent.group.rotation.y = Math.atan2(dx, dz);

    if (dist < action._bestDist - 0.01) {
        action._bestDist = dist;
        action._stallT = 0;
    } else {
        action._stallT += dt;
        if (action._stallT > 1.2) {
            action.index += 1;
            action._bestDist = Infinity;
            action._stallT = 0;
        }
    }
    return false;
}

function startSit(agent, floor, wp) {
    var floorObj = world.floors[floor];
    var target = floorObj.sitTargets[wp];
    var node = floorObj.nodes[wp];
    var g = agent.group;
    agent._floor = floor;
    agent._entrance = false;
    var x = node ? node.pos.x : 0;
    var z = node ? node.pos.z : 0;
    if (target && target.sit) {
        g.position.set(x, floorY(floor) - 0.35, z);
        g.rotation.y = target.facing;
        g.userData.isSitting = true;
    } else {
        var ang = Math.random() * Math.PI * 2;
        var rad = 0.35 + Math.random() * 0.4;
        g.position.set(x + Math.cos(ang) * rad, floorY(floor), z + Math.sin(ang) * rad);
        g.rotation.y = target ? target.facing : 0;
        g.userData.isSitting = false;
    }
    g.userData.isWalking = false;
}

function startStand(agent) {
    var g = agent.group;
    g.userData.isSitting = false;
    g.userData.isWalking = false;
    if (g.parent && g.parent !== scene) {
        g.position.y = 0;
    } else {
        g.position.y = floorY(agent._floor || 0);
    }
}

function exitBuilding(agent) {
    if (agent.group.parent) agent.group.parent.remove(agent.group);
    agent.group.visible = false;
    agent.group.userData.isWalking = false;
    agent.group.userData.isSitting = false;
    agent.state = agent.id >= targetOccupancy ? "DISABLED" : "GONE";
    agent.plan = [];
}

function elevatorTravel(fromFloor, toFloor) {
    if (fromFloor === toFloor) return [];
    var dir = toFloor > fromFloor ? 1 : -1;
    return [
        { type: "WALK_TO_WP", floor: fromFloor, wp: "elevWait" },
        { type: "WAIT_AT_PANEL", floor: fromFloor, dir: dir, toFloor: toFloor },
        { type: "ENTER_ELEVATOR", toFloor: toFloor },
        { type: "PRESS_FLOOR", floor: toFloor },
        { type: "WAIT_FOR_FLOOR", floor: toFloor },
        { type: "EXIT_ELEVATOR", toFloor: toFloor }
    ];
}

function entranceChain() {
    return [
        { type: "WALK_TO_WP", floor: 0, wp: "front_door_threshold" },
        { type: "WALK_TO_WP", floor: 0, wp: "entrance" },
        { type: "WALK_TO_WP", floor: 0, wp: "lobby_center" }
    ];
}

function exitChain() {
    return [
        { type: "WALK_TO_WP", floor: 0, wp: "lobby_center" },
        { type: "WALK_TO_WP", floor: 0, wp: "entrance" },
        { type: "WALK_TO_WP", floor: 0, wp: "front_door_threshold" },
        { type: "WALK_TO_WP", floor: 0, wp: "outside" },
        { type: "EXIT_BUILDING" }
    ];
}

function planArriveToDesk(agent) {
    var a = [];
    pushAll(a, entranceChain());
    pushAll(a, elevatorTravel(0, agent.homeFloor));
    a.push({ type: "WALK_TO_WP", floor: agent.homeFloor, wp: agent.deskDoorWpName });
    a.push({ type: "WALK_TO_WP", floor: agent.homeFloor, wp: agent.deskWpName });
    a.push({ type: "SIT", floor: agent.homeFloor, wp: agent.deskWpName });
    a.push({ type: "ENTER_STATE", state: "AT_DESK" });
    a.push({ type: "WAIT_SIM", minutes: randInt(20, 60) });
    a.push({ type: "PICK_NEXT_ACTIVITY" });
    return a;
}

function planReturnToDesk(agent) {
    return [
        { type: "WALK_TO_WP", floor: agent.homeFloor, wp: agent.deskDoorWpName },
        { type: "WALK_TO_WP", floor: agent.homeFloor, wp: agent.deskWpName },
        { type: "SIT", floor: agent.homeFloor, wp: agent.deskWpName },
        { type: "ENTER_STATE", state: "AT_DESK" },
        { type: "WAIT_SIM", minutes: randInt(18, 55) },
        { type: "PICK_NEXT_ACTIVITY" }
    ];
}

function planGoToLunch(agent) {
    var a = [{ type: "STAND" }];
    a.push({ type: "WALK_TO_WP", floor: agent.homeFloor, wp: agent.deskDoorWpName });
    pushAll(a, elevatorTravel(agent.homeFloor, 0));
    var seat = reserveSeat(agent, 0, ["cafe_seat0", "cafe_seat1", "cafe_seat2", "cafe_seat3"]);
    if (seat) {
        a.push({ type: "WALK_TO_WP", floor: 0, wp: "cafe_center" });
        a.push({ type: "SIT", floor: 0, wp: seat });
        a.push({ type: "ENTER_STATE", state: "AT_LUNCH" });
        a.push({ type: "MARK_LUNCHED" });
        a.push({ type: "WAIT_SIM", minutes: agent.lunchDuration });
        a.push({ type: "STAND" });
        a.push({ type: "RELEASE_SEAT" });
    } else {
        a.push({ type: "WALK_TO_WP", floor: 0, wp: "cafe_order" });
        a.push({ type: "ENTER_STATE", state: "AT_LUNCH" });
        a.push({ type: "MARK_LUNCHED" });
        a.push({ type: "WAIT_SIM", minutes: agent.lunchDuration });
    }
    pushAll(a, elevatorTravel(0, agent.homeFloor));
    pushAll(a, planReturnToDesk(agent));
    return a;
}

function planVisitLounge(agent) {
    var a = [{ type: "STAND" }];
    a.push({ type: "WALK_TO_WP", floor: agent.homeFloor, wp: agent.deskDoorWpName });
    var seat = reserveSeat(agent, agent.homeFloor, ["lounge_spot0", "lounge_spot1", "lounge_spot2"]);
    if (seat) {
        a.push({ type: "WALK_TO_WP", floor: agent.homeFloor, wp: "lounge_center" });
        a.push({ type: "SIT", floor: agent.homeFloor, wp: seat });
        a.push({ type: "ENTER_STATE", state: "AT_BREAK" });
        a.push({ type: "WAIT_SIM", minutes: randInt(5, 12) });
        a.push({ type: "STAND" });
        a.push({ type: "RELEASE_SEAT" });
    } else {
        a.push({ type: "WALK_TO_WP", floor: agent.homeFloor, wp: "water_cooler" });
        a.push({ type: "ENTER_STATE", state: "AT_BREAK" });
        a.push({ type: "WAIT_SIM", minutes: randInt(5, 10) });
    }
    pushAll(a, planReturnToDesk(agent));
    return a;
}

function planAttendMeeting(agent) {
    var meetingFloor = Math.random() < 0.65 ? agent.homeFloor : 1 + Math.floor(Math.random() * 5);
    var seat = reserveSeat(agent, meetingFloor, ["conf_seat0", "conf_seat1", "conf_seat2", "conf_seat3"]);
    if (!seat) return planVisitLounge(agent);
    var a = [{ type: "STAND" }];
    a.push({ type: "WALK_TO_WP", floor: agent.homeFloor, wp: agent.deskDoorWpName });
    pushAll(a, elevatorTravel(agent.homeFloor, meetingFloor));
    a.push({ type: "WALK_TO_WP", floor: meetingFloor, wp: "conf_center" });
    a.push({ type: "SIT", floor: meetingFloor, wp: seat });
    a.push({ type: "ENTER_STATE", state: "IN_MEETING" });
    a.push({ type: "WAIT_SIM", minutes: randInt(22, 45) });
    a.push({ type: "STAND" });
    a.push({ type: "RELEASE_SEAT" });
    pushAll(a, elevatorTravel(meetingFloor, agent.homeFloor));
    pushAll(a, planReturnToDesk(agent));
    return a;
}

function findCoworker(agent) {
    var candidates = [];
    var i;
    for (i = 0; i < agents.length; i += 1) {
        var other = agents[i];
        if (other.id === agent.id) continue;
        if (other.role !== "WORKER") continue;
        if (other.state !== "AT_DESK") continue;
        if (!other.group.visible) continue;
        candidates.push(other);
    }
    if (candidates.length === 0) return null;
    return pickRandom(candidates);
}

function planVisitCoworker(agent, other) {
    var a = [{ type: "STAND" }];
    a.push({ type: "WALK_TO_WP", floor: agent.homeFloor, wp: agent.deskDoorWpName });
    pushAll(a, elevatorTravel(agent.homeFloor, other.homeFloor));
    a.push({ type: "WALK_TO_WP", floor: other.homeFloor, wp: other.deskDoorWpName });
    a.push({ type: "ENTER_STATE", state: "VISITING" });
    a.push({ type: "WAIT_SIM", minutes: randInt(6, 18) });
    pushAll(a, elevatorTravel(other.homeFloor, agent.homeFloor));
    pushAll(a, planReturnToDesk(agent));
    return a;
}

function planLeaveBuilding(agent) {
    var a = [{ type: "STAND" }];
    a.push({ type: "WALK_TO_WP", floor: agent.homeFloor, wp: agent.deskDoorWpName });
    pushAll(a, elevatorTravel(agent.homeFloor, 0));
    pushAll(a, exitChain());
    return a;
}

function planVisitorVisit(agent) {
    var a = [];
    pushAll(a, entranceChain());
    var roll = Math.random() * 100;
    var i;
    var seat;
    var floor;

    if (roll < 10) {
        seat = reserveSeat(agent, 0, ["cafe_seat0", "cafe_seat1", "cafe_seat2", "cafe_seat3"]);
        if (seat) {
            a.push({ type: "WALK_TO_WP", floor: 0, wp: "cafe_center" });
            a.push({ type: "SIT", floor: 0, wp: seat });
            a.push({ type: "ENTER_STATE", state: "AT_LUNCH" });
            a.push({ type: "WAIT_SIM", minutes: randInt(15, 35) });
            a.push({ type: "STAND" });
            a.push({ type: "RELEASE_SEAT" });
        } else {
            a.push({ type: "WALK_TO_WP", floor: 0, wp: "cafe_order" });
            a.push({ type: "ENTER_STATE", state: "AT_LUNCH" });
            a.push({ type: "WAIT_SIM", minutes: randInt(6, 14) });
        }
    } else if (roll < 16) {
        a.push({ type: "WALK_TO_WP", floor: 0, wp: "cafe_order" });
        a.push({ type: "ENTER_STATE", state: "VISITING" });
        a.push({ type: "WAIT_SIM", minutes: randInt(6, 14) });
    } else if (roll < 30) {
        seat = reserveSeat(agent, 0, ["lounge_spot0", "lounge_spot1", "lounge_spot2"]);
        if (seat) {
            a.push({ type: "WALK_TO_WP", floor: 0, wp: "lounge_center" });
            a.push({ type: "SIT", floor: 0, wp: seat });
            a.push({ type: "ENTER_STATE", state: "VISITING" });
            a.push({ type: "WAIT_SIM", minutes: randInt(10, 25) });
            a.push({ type: "STAND" });
            a.push({ type: "RELEASE_SEAT" });
        } else {
            a.push({ type: "WALK_TO_WP", floor: 0, wp: "lobby_stand_center" });
            a.push({ type: "ENTER_STATE", state: "VISITING" });
            a.push({ type: "WAIT_SIM", minutes: randInt(8, 16) });
        }
    } else if (roll < 42) {
        seat = reserveSeat(agent, 0, ["back_lounge_N", "back_lounge_S", "pit_N", "pit_S", "pit_E", "pit_W"]);
        if (seat) {
            a.push({ type: "WALK_TO_WP", floor: 0, wp: seat });
            a.push({ type: "SIT", floor: 0, wp: seat });
            a.push({ type: "ENTER_STATE", state: "VISITING" });
            a.push({ type: "WAIT_SIM", minutes: randInt(10, 28) });
            a.push({ type: "STAND" });
            a.push({ type: "RELEASE_SEAT" });
        } else {
            a.push({ type: "WALK_TO_WP", floor: 0, wp: "lobby_stand_NW" });
            a.push({ type: "WAIT_SIM", minutes: randInt(8, 16) });
        }
    } else if (roll < 52) {
        var standSpots = ["reception", "kiosk", "lobby_wc_front", "lobby_wc_back"];
        a.push({ type: "WALK_TO_WP", floor: 0, wp: pickRandom(standSpots) });
        a.push({ type: "ENTER_STATE", state: "VISITING" });
        a.push({ type: "WAIT_SIM", minutes: randInt(5, 12) });
    } else if (roll < 62) {
        var loiterSpots = ["lobby_stand_center", "lobby_stand_NE", "lobby_stand_NW", "lobby_stand_midE", "lobby_stand_midW", "lobby_stand_entry"];
        a.push({ type: "WALK_TO_WP", floor: 0, wp: pickRandom(loiterSpots) });
        a.push({ type: "ENTER_STATE", state: "VISITING" });
        a.push({ type: "WAIT_SIM", minutes: randInt(8, 20) });
    } else if (roll < 77) {
        floor = 1 + Math.floor(Math.random() * 5);
        seat = reserveSeat(agent, floor, ["lounge_spot0", "lounge_spot1", "lounge_spot2"]);
        pushAll(a, elevatorTravel(0, floor));
        if (seat) {
            a.push({ type: "WALK_TO_WP", floor: floor, wp: "lounge_center" });
            a.push({ type: "SIT", floor: floor, wp: seat });
            a.push({ type: "ENTER_STATE", state: "VISITING" });
            a.push({ type: "WAIT_SIM", minutes: randInt(10, 25) });
            a.push({ type: "STAND" });
            a.push({ type: "RELEASE_SEAT" });
        } else {
            a.push({ type: "WALK_TO_WP", floor: floor, wp: "water_cooler" });
            a.push({ type: "WAIT_SIM", minutes: randInt(6, 14) });
        }
        pushAll(a, elevatorTravel(floor, 0));
    } else {
        floor = 1 + Math.floor(Math.random() * 5);
        seat = reserveSeat(agent, floor, ["conf_seat0", "conf_seat1", "conf_seat2", "conf_seat3"]);
        if (seat) {
            pushAll(a, elevatorTravel(0, floor));
            a.push({ type: "WALK_TO_WP", floor: floor, wp: "conf_center" });
            a.push({ type: "SIT", floor: floor, wp: seat });
            a.push({ type: "ENTER_STATE", state: "IN_MEETING" });
            a.push({ type: "WAIT_SIM", minutes: randInt(15, 40) });
            a.push({ type: "STAND" });
            a.push({ type: "RELEASE_SEAT" });
            pushAll(a, elevatorTravel(floor, 0));
        } else {
            a.push({ type: "WALK_TO_WP", floor: 0, wp: "lobby_stand_center" });
            a.push({ type: "WAIT_SIM", minutes: randInt(8, 16) });
        }
    }

    pushAll(a, exitChain());
    return a;
}

function chooseNextActivity(agent) {
    if (agent.role !== "WORKER") {
        agent.plan = planVisitorVisit(agent);
        return;
    }
    if (Clock.simMinute >= agent.departureTime) {
        agent._leaving = true;
        seatRelease(agent);
        agent.plan = planLeaveBuilding(agent);
        return;
    }
    while (agent.plannedMeetingTimes.length > 0 && agent.plannedMeetingTimes[0] <= Clock.simMinute) {
        agent.plannedMeetingTimes.shift();
        agent.plan = planAttendMeeting(agent);
        return;
    }
    if (!agent.hasLunched && Clock.simMinute >= agent.lunchTime) {
        agent.plan = planGoToLunch(agent);
        return;
    }
    var roll = Math.random();
    if (roll < 0.14) {
        agent.plan = planAttendMeeting(agent);
    } else if (roll < 0.26) {
        agent.plan = planVisitLounge(agent);
    } else if (roll < 0.41) {
        var other = findCoworker(agent);
        if (other) agent.plan = planVisitCoworker(agent, other);
        else agent.plan = planVisitLounge(agent);
    } else {
        agent.plan = [
            { type: "WAIT_SIM", minutes: randInt(18, 65) },
            { type: "PICK_NEXT_ACTIVITY" }
        ];
    }
}

function startAction(agent, action) {
    agent.currentAction = action;
    if (action.type === "WALK_TO_WP") {
        startWalk(agent, action);
    } else if (action.type === "WAIT_AT_PANEL") {
        agent._floor = action.floor;
        agent._entrance = false;
        pressCall(agent, action.floor, action.dir);
        agent.group.userData.isWalking = false;
        agent.state = "WAITING_ELEVATOR";
    } else if (action.type === "ENTER_ELEVATOR") {
        action.phase = "reserve";
        action.spot = null;
        action.stallT = 0;
        action.lastX = null;
        action.lastZ = null;
    } else if (action.type === "PRESS_FLOOR") {
        elevator.pressDestination(action.floor);
    } else if (action.type === "WAIT_FOR_FLOOR") {
        agent.group.userData.isWalking = false;
        agent.state = "IN_CAR";
    } else if (action.type === "EXIT_ELEVATOR") {
        elevator.registerDisembark(agent);
        action.phase = "toDoor";
        action.stallT = 0;
    } else if (action.type === "SIT") {
        startSit(agent, action.floor, action.wp);
    } else if (action.type === "STAND") {
        startStand(agent);
    } else if (action.type === "RELEASE_SEAT") {
        seatRelease(agent);
    } else if (action.type === "WAIT_SIM") {
        action.untilMin = Clock.simMinute + action.minutes;
    } else if (action.type === "EXIT_BUILDING") {
        exitBuilding(agent);
    } else if (action.type === "ENTER_STATE") {
        agent.state = action.state;
    } else if (action.type === "MARK_LUNCHED") {
        agent.hasLunched = true;
    } else if (action.type === "PICK_NEXT_ACTIVITY") {
        chooseNextActivity(agent);
    }
}

function updateEnterElevator(agent, action, dt) {
    var g = agent.group;
    var floor = agent._floor;
    var dir = action.toFloor > floor ? 1 : -1;
    var carHalf = WORLD.SHAFT_DEPTH / 2;
    var guard = 0;

    while (guard < 5) {
        guard += 1;

        if (action.phase === "reserve") {
            var spot = null;
            if (elevator.isAcceptingAt(floor, dir) && elevator.currentCapacityFree() > 0) {
                spot = elevator.reserveBoardingSpot(agent);
            }
            if (!spot) {
                pressCall(agent, floor, dir);
                agent.state = "WAITING_ELEVATOR";
                return false;
            }
            action.spot = spot;
            action.phase = "toDoor";
            action.stallT = 0;
            action.lastX = null;
            action.lastZ = null;
            pressCall(agent, floor, dir);
            continue;
        }

        if (!action.spot) {
            action.phase = "reserve";
            return false;
        }

        if (action.phase === "toDoor") {
            if (!elevator.isAcceptingAt(floor, dir)) {
                elevator.cancelBoard(agent);
                action.spot = null;
                action.phase = "reserve";
                pressCall(agent, floor, dir);
                return false;
            }
            var tx = elevator.car.position.x + action.spot.x;
            var tz = carHalf + 0.45;
            var dx = tx - g.position.x;
            var dz = tz - g.position.z;
            var dist = Math.sqrt(dx * dx + dz * dz);
            if (dist < 0.0001) dist = 0.0001;
            var step = PERSON_SPEED * dt;
            g.userData.isWalking = true;
            if (dist <= step + 0.03) {
                g.position.set(tx, floorY(floor), tz);
                elevator.car.attach(g);
                action.phase = "toSpot";
                continue;
            }
            g.position.x += (dx / dist) * step;
            g.position.z += (dz / dist) * step;
            g.position.y = floorY(floor);
            g.rotation.y = Math.atan2(dx, dz);
            if (action.lastX !== null) {
                var moved = Math.sqrt((g.position.x - action.lastX) * (g.position.x - action.lastX) + (g.position.z - action.lastZ) * (g.position.z - action.lastZ));
                if (moved < 0.004 * dt * 60) action.stallT += dt;
                else action.stallT = 0;
            }
            action.lastX = g.position.x;
            action.lastZ = g.position.z;
            if (action.stallT > 1.5) {
                g.position.set(tx, floorY(floor), tz);
                elevator.car.attach(g);
                action.phase = "toSpot";
                continue;
            }
            return false;
        }

        if (action.phase === "toSpot") {
            var lx = action.spot.x;
            var lz = action.spot.z;
            var ddx = lx - g.position.x;
            var ddz = lz - g.position.z;
            var ddist = Math.sqrt(ddx * ddx + ddz * ddz);
            if (ddist < 0.0001) ddist = 0.0001;
            var dstep = PERSON_SPEED * dt;
            if (ddist <= dstep + 0.02) {
                g.position.set(lx, 0, lz);
                g.rotation.y = 0;
                g.userData.isWalking = false;
                elevator.completeBoard(agent);
                return true;
            }
            g.position.x += (ddx / ddist) * dstep;
            g.position.z += (ddz / ddist) * dstep;
            g.position.y = 0;
            return false;
        }
        return true;
    }
    return false;
}

function updateExitElevator(agent, action, dt) {
    var g = agent.group;
    var floor = action.toFloor;
    var carHalf = WORLD.SHAFT_DEPTH / 2;
    var guard = 0;

    while (guard < 5) {
        guard += 1;

        if (action.phase === "toDoor") {
            var lz = carHalf - 0.35;
            var dx = 0 - g.position.x;
            var dz = lz - g.position.z;
            var dist = Math.sqrt(dx * dx + dz * dz);
            if (dist < 0.0001) dist = 0.0001;
            var step = PERSON_SPEED * dt;
            g.userData.isWalking = true;
            if (dist <= step + 0.03) {
                g.position.x = 0;
                g.position.z = lz;
                g.position.y = 0;
                scene.attach(g);
                g.position.y = floorY(floor);
                agent._floor = floor;
                action.phase = "out";
                continue;
            }
            g.position.x += (dx / dist) * step;
            g.position.z += (dz / dist) * step;
            g.rotation.y = Math.atan2(dx, dz);
            return false;
        }

        if (action.phase === "out") {
            var wx = 0;
            var wz = carHalf + 1.35;
            var ddx = wx - g.position.x;
            var ddz = wz - g.position.z;
            var ddist = Math.sqrt(ddx * ddx + ddz * ddz);
            if (ddist < 0.0001) ddist = 0.0001;
            var dstep = PERSON_SPEED * dt;
            if (ddist <= dstep + 0.03) {
                g.position.set(wx, floorY(floor), wz);
                g.userData.isWalking = false;
                elevator.completeDisembark(agent);
                return true;
            }
            g.position.x += (ddx / ddist) * dstep;
            g.position.z += (ddz / ddist) * dstep;
            g.position.y = floorY(floor);
            g.rotation.y = Math.atan2(ddx, ddz);
            return false;
        }
        return true;
    }
    return false;
}

function updateAction(agent, dt) {
    var action = agent.currentAction;
    if (!action) return true;
    if (action.type === "WALK_TO_WP") return updateWalk(agent, dt);
    if (action.type === "WAIT_AT_PANEL") {
        pressCall(agent, action.floor, action.dir);
        agent.state = "WAITING_ELEVATOR";
        agent.group.userData.isWalking = false;
        return elevator.isAcceptingAt(action.floor, action.dir) && elevator.currentCapacityFree() > 0;
    }
    if (action.type === "ENTER_ELEVATOR") return updateEnterElevator(agent, action, dt);
    if (action.type === "PRESS_FLOOR") return true;
    if (action.type === "WAIT_FOR_FLOOR") {
        return elevator.state === "DOOR_OPEN" && elevator.currentFloor === action.floor;
    }
    if (action.type === "EXIT_ELEVATOR") return updateExitElevator(agent, action, dt);
    if (action.type === "WAIT_SIM") return Clock.simMinute >= action.untilMin;
    if (action.type === "EXIT_BUILDING") return true;
    return true;
}

function updateAgents(dt) {
    var i;
    for (i = 0; i < agents.length; i += 1) {
        var agent = agents[i];
        if (agent.state === "DISABLED") continue;
        if (agent.state === "GONE") {
            if (agent.id >= targetOccupancy) agent.state = "DISABLED";
            continue;
        }
        if (agent.state === "AWAY") {
            if (agent.role === "VISITOR") {
                if (agent._armed && Clock.simMinute >= agent.arrivalTime) spawnVisitor(agent);
            } else if (Clock.simMinute >= agent.arrivalTime && Clock.simMinute < WORK_END) {
                spawnWorker(agent);
            }
            continue;
        }

        if (agent.role === "WORKER" && !agent._leaving && Clock.simMinute >= agent.departureTime) {
            agent._leaving = true;
            seatRelease(agent);
            agent.plan = planLeaveBuilding(agent);
            agent.currentAction = null;
            agent.group.userData.isSitting = false;
        }

        var guard = 0;
        while (guard < 16) {
            guard += 1;
            if (!agent.currentAction) {
                if (agent.plan.length > 0) {
                    startAction(agent, agent.plan.shift());
                } else {
                    break;
                }
            }
            if (!agent.currentAction) break;
            var done = updateAction(agent, dt);
            if (done) {
                agent.currentAction = null;
            } else {
                break;
            }
        }
    }
}

function applyCollisions() {
    var i;
    var j;
    for (i = 0; i < agents.length; i += 1) {
        var a = agents[i];
        if (!a.group.parent || a.group.parent !== scene) continue;
        if (!a.group.visible) continue;
        if (a.group.userData.isSitting) continue;
        if (a.currentAction && a.currentAction.type === "ENTER_ELEVATOR") continue;
        if (a._entrance && a.group.position.z > 6.5) continue;
        for (j = i + 1; j < agents.length; j += 1) {
            var b = agents[j];
            if (!b.group.parent || b.group.parent !== scene) continue;
            if (!b.group.visible) continue;
            if (b.group.userData.isSitting) continue;
            if (b.currentAction && b.currentAction.type === "ENTER_ELEVATOR") continue;
            if (b._entrance && b.group.position.z > 6.5) continue;
            var dx = b.group.position.x - a.group.position.x;
            var dz = b.group.position.z - a.group.position.z;
            var dy = b.group.position.y - a.group.position.y;
            if (Math.abs(dy) > 1) continue;
            var d2 = dx * dx + dz * dz;
            if (d2 > 1.0) continue;
            var d = Math.sqrt(d2);
            var push = 0.18;
            if (d < 0.001) {
                var ang = Math.random() * Math.PI * 2;
                dx = Math.cos(ang);
                dz = Math.sin(ang);
            } else {
                dx /= d;
                dz /= d;
            }
            a.group.position.x -= dx * push;
            a.group.position.z -= dz * push;
            b.group.position.x += dx * push;
            b.group.position.z += dz * push;
        }
    }
}

function updateLighting() {
    var m = Clock.simMinute;
    var i;
    for (i = 0; i < LIGHT_COLORS.length - 1; i += 1) {
        var a = LIGHT_COLORS[i];
        var b = LIGHT_COLORS[i + 1];
        if (m >= a.m && m <= b.m) {
            var span = b.m - a.m;
            var t = span > 0 ? (m - a.m) / span : 0;
            sceneBackground.copy(a.bg).lerp(b.bg, t);
            scene.background = sceneBackground;
            if (sunLight) {
                sunLight.color.copy(a.sun).lerp(b.sun, t);
                sunLight.intensity = a.sunI + (b.sunI - a.sunI) * t;
            }
            if (ambientLight) ambientLight.intensity = a.amb + (b.amb - a.amb) * t;
            if (hemiLight) {
                hemiLight.intensity = a.hemi + (b.hemi - a.hemi) * t;
                hemiLight.color.copy(a.hemiSky).lerp(b.hemiSky, t);
            }
            return;
        }
    }
}

function updateHUD() {
    if (hudTime) hudTime.textContent = Clock.format();
    if (hudInfo) {
        var counts = {};
        var i;
        for (i = 0; i < agents.length; i += 1) {
            var s = agents[i].state;
            counts[s] = (counts[s] || 0) + 1;
        }
        var logic = elevator.logic;
        var parts = [];
        parts.push("Present: " + countPresent());
        parts.push("AT_DESK: " + (counts.AT_DESK || 0));
        parts.push("WALKING/ARRIVING: " + ((counts.ARRIVING || 0) + (counts.VISITING || 0)));
        parts.push("WAITING_ELEVATOR: " + (counts.WAITING_ELEVATOR || 0));
        parts.push("IN_CAR: " + (counts.IN_CAR || 0));
        parts.push("IN_MEETING: " + (counts.IN_MEETING || 0));
        parts.push("AT_LUNCH: " + (counts.AT_LUNCH || 0));
        parts.push("AT_BREAK: " + (counts.AT_BREAK || 0));
        parts.push("LEAVING/GONE: " + ((counts.LEAVING || 0) + (counts.GONE || 0)));
        parts.push("AWAY: " + (counts.AWAY || 0));
        parts.push("Elevator: f" + logic.currentFloor + " " + logic.state + " dir=" + logic.direction + " pax=" + logic.passengers.size + " dest=[" + Array.from(logic.destinations).join(",") + "] up=[" + Array.from(logic.upCalls).join(",") + "] down=[" + Array.from(logic.downCalls).join(",") + "]");
        hudInfo.textContent = parts.join("  |  ");
    }
}

function buildHUD() {
    var hud = document.createElement("div");
    hud.style.position = "absolute";
    hud.style.top = "10px";
    hud.style.left = "10px";
    hud.style.padding = "10px 14px";
    hud.style.background = "rgba(12,16,24,0.72)";
    hud.style.color = "#e8eef7";
    hud.style.fontFamily = "monospace";
    hud.style.fontSize = "13px";
    hud.style.borderRadius = "8px";
    hud.style.maxWidth = "560px";
    hud.style.lineHeight = "1.6";

    hudTime = document.createElement("div");
    hudTime.style.fontSize = "26px";
    hudTime.style.fontWeight = "bold";
    hudTime.textContent = Clock.format();
    hud.appendChild(hudTime);

    var speedRow = document.createElement("div");
    speedRow.textContent = "Speed";
    speedSlider = document.createElement("input");
    speedSlider.type = "range";
    speedSlider.min = "0";
    speedSlider.max = "11";
    speedSlider.value = "7";
    speedSlider.style.width = "220px";
    var speedValues = [1, 2, 5, 10, 20, 40, 80, 120, 200, 300, 450, 600];
    var speedLabel = document.createElement("span");
    speedLabel.textContent = " " + Clock.timeScale + "x";
    speedSlider.addEventListener("input", function onSpeed() {
        Clock.timeScale = speedValues[Number(speedSlider.value)];
        speedLabel.textContent = " " + Clock.timeScale + "x";
    });
    speedRow.appendChild(speedSlider);
    speedRow.appendChild(speedLabel);
    hud.appendChild(speedRow);

    var occRow = document.createElement("div");
    occRow.textContent = "Occupancy";
    occSlider = document.createElement("input");
    occSlider.type = "range";
    occSlider.min = "1";
    occSlider.max = String(MAX_OCCUPANCY);
    occSlider.value = String(DEFAULT_OCCUPANCY);
    occSlider.style.width = "220px";
    occLabel = document.createElement("span");
    occLabel.textContent = " " + DEFAULT_OCCUPANCY + " / " + MAX_OCCUPANCY + " people";
    occSlider.addEventListener("input", function onOcc() {
        targetOccupancy = Number(occSlider.value);
        occLabel.textContent = " " + targetOccupancy + " / " + MAX_OCCUPANCY + " people";
        applyOccupancy();
    });
    occRow.appendChild(occSlider);
    occRow.appendChild(occLabel);
    hud.appendChild(occRow);

    hudInfo = document.createElement("div");
    hudInfo.textContent = "";
    hud.appendChild(hudInfo);

    document.body.appendChild(hud);
}

function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);
    var realDt = Math.min(0.05, renderClock.getDelta());
    Clock.tick(realDt);
    updateLighting();
    var motionDt = realDt * Clock.timeScale;
    elevator.tick(motionDt);
    topUpVisitors();
    updateAgents(motionDt);
    applyCollisions();
    var i;
    for (i = 0; i < agents.length; i += 1) {
        if (agents[i].group.parent) animatePersonWalking(agents[i].group, motionDt);
    }
    updateHUD();
    controls.update();
    renderer.render(scene, camera);
}

function startSimulation() {
    scene = new THREE.Scene();
    scene.background = sceneBackground;
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(28, 24, 28);
    camera.lookAt(0, 8, 0);
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.sortObjects = true;
    document.body.appendChild(renderer.domElement);
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 8, 0);

    ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
    scene.add(ambientLight);
    hemiLight = new THREE.HemisphereLight(0xbfd7ff, 0x303020, 0.45);
    scene.add(hemiLight);
    sunLight = new THREE.DirectionalLight(0xffffff, 0.9);
    sunLight.position.set(20, 35, 18);
    scene.add(sunLight);

    world = createWorld(scene);
    elevator = new Elevator(scene, world);
    buildHUD();
    initAgents();
    renderClock = new THREE.Clock();
    window.addEventListener("resize", onResize);
    updateLighting();
    animate();
}

if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", startSimulation);
} else {
    startSimulation();
}