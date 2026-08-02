// sim.js - simulated clock, day/night lighting, agent state machine + daily schedules, render loop, UI
// Classic browser script. Auto-starts on DOMContentLoaded.

const MAX_WORKERS = 20;
const MAX_VISITORS = 80;
const MAX_OCCUPANCY = 100;
const DEFAULT_OCCUPANCY = 45;
const WALK_SPEED = 1.3;
const DESK_LETTERS = ["A", "B", "C", "D"];
const BISTRO_SEATS = ["bistro0a", "bistro0b", "bistro1a", "bistro1b", "bistro2a", "bistro2b", "bistro3a", "bistro3b"];
const LOUNGE_SEATS = ["lounge_spot0", "lounge_spot1", "lounge_spot2"];
const FRONT_LOUNGE_SEATS = ["front_lounge0", "front_lounge1", "front_lounge2"];
const BACK_SEATS = ["back_lounge_N", "back_lounge_S", "pit_N", "pit_S", "pit_E", "pit_W"];
const STAND_SPOTS = ["reception", "kiosk", "lobby_wc_front", "lobby_wc_back"];
const LOITER_SPOTS = ["lobby_stand_center", "lobby_stand_NE", "lobby_stand_NW", "lobby_stand_midE", "lobby_stand_midW", "lobby_stand_entry"];
const OFFICE_LOUNGE = ["lounge_spot0", "lounge_spot1", "lounge_spot2", "hall_stand_N", "hall_stand_S"];
const FIRST_NAMES = ["Al", "Bob", "Cara", "Dan", "Eve", "Finn", "Gina", "Hank", "Iris", "Jake", "Kim", "Leo", "Mia", "Ned", "Olive", "Pax", "Quin", "Ria", "Sam", "Tess", "Uma", "Van", "Will", "Xan", "Yuki", "Zed"];

const LIGHT_KEYFRAMES = [
    { hour: 0, bg: 0x0a0e1a, sun: 0x223344, sunI: 0.12, amb: 0.45, hemi: 0.32 },
    { hour: 6, bg: 0x2a2a3a, sun: 0x886644, sunI: 0.3, amb: 0.42, hemi: 0.34 },
    { hour: 7, bg: 0x6a6a8a, sun: 0xffaa66, sunI: 0.7, amb: 0.5, hemi: 0.5 },
    { hour: 9, bg: 0x20242a, sun: 0xffffff, sunI: 0.9, amb: 0.45, hemi: 0.45 },
    { hour: 17, bg: 0x20242a, sun: 0xffffff, sunI: 0.9, amb: 0.45, hemi: 0.45 },
    { hour: 18, bg: 0x6a5a4a, sun: 0xffaa66, sunI: 0.6, amb: 0.4, hemi: 0.4 },
    { hour: 19, bg: 0x2a2a3a, sun: 0x445566, sunI: 0.25, amb: 0.45, hemi: 0.32 },
    { hour: 24, bg: 0x0a0e1a, sun: 0x223344, sunI: 0.12, amb: 0.45, hemi: 0.32 }
];

const Clock = {
    simMinute: 8 * 60 + 30,
    timeScale: 120,
    _three: null,
    init: function () { this._three = new THREE.Clock(); },
    getDelta: function () { return this._three ? this._three.getDelta() : 0; },
    tick: function (realDt) {
        this.simMinute += realDt * this.timeScale / 60;
        if (this.simMinute >= 24 * 60) {
            this.simMinute -= 24 * 60;
            resetDay();
        }
    },
    format: function () {
        let m = Math.floor(this.simMinute);
        let h = Math.floor(m / 60);
        m = m % 60;
        const ampm = h < 12 ? "AM" : "PM";
        let hh = h % 12;
        if (hh === 0) hh = 12;
        return (hh < 10 ? " " : "") + hh + ":" + (m < 10 ? "0" : "") + m + " " + ampm;
    }
};

let scene, camera, renderer, controls, world, elevator, agents, targetOccupancy;
let sun, ambient, hemi;
let hudTime, hudCounts, speedSlider, occSlider;
const seatReservations = new Set();

function randInt(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
function chance(p) { return Math.random() < p; }
function pushAll(arr, items) { for (let i = 0; i < items.length; i += 1) arr.push(items[i]); }

// ---- action constructors ----
function A_WALK(floor, wp) { return { type: "WALK_TO_WP", floor: floor, wp: wp, _started: false }; }
function A_PANEL(floor, dir, toFloor) { return { type: "WAIT_AT_PANEL", floor: floor, dir: dir, toFloor: toFloor, _started: false }; }
function A_ENTER(toFloor) { return { type: "ENTER_ELEVATOR", toFloor: toFloor, _started: false, _phase: 0, _dir: 0 }; }
function A_PRESS(floor) { return { type: "PRESS_FLOOR", floor: floor, _started: false }; }
function A_WAIT_FLOOR(floor) { return { type: "WAIT_FOR_FLOOR", floor: floor, _started: false }; }
function A_EXIT(toFloor) { return { type: "EXIT_ELEVATOR", toFloor: toFloor, _started: false, _phase: 0 }; }
function A_SIT(floor, wp) { return { type: "SIT", floor: floor, wp: wp, _started: false }; }
function A_STAND() { return { type: "STAND", _started: false }; }
function A_RELEASE() { return { type: "RELEASE_SEAT", _started: false }; }
function A_WAIT(minutes) { return { type: "WAIT_SIM", minutes: minutes, _started: false, _untilMin: 0 }; }
function A_EXIT_BUILD() { return { type: "EXIT_BUILDING", _started: false }; }
function A_STATE(s) { return { type: "ENTER_STATE", state: s, _started: false }; }
function A_LUNCHED() { return { type: "MARK_LUNCHED", _started: false }; }
function A_PICK() { return { type: "PICK_NEXT_ACTIVITY", _started: false }; }

// ---- seat reservation ----
function reserveSeatFor(agent, floor, wpNames) {
    for (let i = 0; i < wpNames.length; i += 1) {
        const wp = wpNames[i];
        const key = floor + ":" + wp;
        if (!seatReservations.has(key)) { seatReservations.add(key); agent.seatResKey = key; return wp; }
    }
    return null;
}
function reserveConfSeat(floor) { return null; }
function releaseSeat(agent) {
    if (agent.seatResKey) { seatReservations.delete(agent.seatResKey); agent.seatResKey = null; }
}

// ---- plan compilers ----
function travelTo(fromFloor, toFloor, toWp) {
    const arr = [];
    if (fromFloor === toFloor) { arr.push(A_WALK(toFloor, toWp)); return arr; }
    arr.push(A_WALK(fromFloor, "elevWait"));
    arr.push(A_PANEL(fromFloor, toFloor > fromFloor ? 1 : -1, toFloor));
    arr.push(A_ENTER(toFloor));
    arr.push(A_PRESS(toFloor));
    arr.push(A_WAIT_FLOOR(toFloor));
    arr.push(A_EXIT(toFloor));
    arr.push(A_WALK(toFloor, toWp));
    return arr;
}

function planArriveToDesk(agent) {
    const a = [];
    a.push(A_STATE("ARRIVING"));
    a.push(A_WALK(0, "front_door_threshold"));
    a.push(A_WALK(0, "entrance"));
    a.push(A_WALK(0, "lobby_center"));
    pushAll(a, travelTo(0, agent.homeFloor, agent.deskDoorWpName));
    a.push(A_WALK(agent.homeFloor, agent.deskWpName));
    a.push(A_SIT(agent.homeFloor, agent.deskWpName));
    a.push(A_STATE("AT_DESK"));
    a.push(A_WAIT(randInt(18, 65)));
    a.push(A_PICK());
    return a;
}

function planGoToLunch(agent) {
    const a = [A_STAND(), A_RELEASE()];
    const seat = reserveSeatFor(agent, 0, BISTRO_SEATS);
    if (seat) {
        pushAll(a, travelTo(agent.floor, 0, seat));
        a.push(A_SIT(0, seat));
        a.push(A_STATE("AT_LUNCH"));
        a.push(A_WAIT(agent.lunchDuration));
        a.push(A_LUNCHED());
        a.push(A_STAND());
        a.push(A_RELEASE());
    } else {
        pushAll(a, travelTo(agent.floor, 0, "lobby_stand_center"));
        a.push(A_SIT(0, "lobby_stand_center"));
        a.push(A_STATE("AT_LUNCH"));
        a.push(A_WAIT(agent.lunchDuration));
        a.push(A_LUNCHED());
        a.push(A_STAND());
    }
    pushAll(a, travelTo(0, agent.homeFloor, agent.deskWpName));
    a.push(A_SIT(agent.homeFloor, agent.deskWpName));
    a.push(A_STATE("AT_DESK"));
    a.push(A_WAIT(randInt(18, 65)));
    a.push(A_PICK());
    return a;
}

function planVisitLounge(agent) {
    const a = [A_STAND(), A_RELEASE()];
    const seat = reserveSeatFor(agent, agent.floor, LOUNGE_SEATS);
    if (seat) {
        a.push(A_WALK(agent.floor, seat));
        a.push(A_SIT(agent.floor, seat));
        a.push(A_STATE("AT_BREAK"));
        a.push(A_WAIT(randInt(5, 12)));
        a.push(A_STAND());
        a.push(A_RELEASE());
    } else {
        a.push(A_WALK(agent.floor, "water_cooler"));
        a.push(A_SIT(agent.floor, "water_cooler"));
        a.push(A_STATE("AT_BREAK"));
        a.push(A_WAIT(randInt(5, 12)));
        a.push(A_STAND());
    }
    a.push(A_WALK(agent.homeFloor, agent.deskWpName));
    a.push(A_SIT(agent.homeFloor, agent.deskWpName));
    a.push(A_STATE("AT_DESK"));
    a.push(A_WAIT(randInt(18, 65)));
    a.push(A_PICK());
    return a;
}

function planAttendMeeting(agent) {
    const mFloor = chance(0.65) ? agent.homeFloor : randInt(1, 5);
    const seats = ["conf_seat0", "conf_seat1", "conf_seat2", "conf_seat3"];
    const seat = reserveSeatFor(agent, mFloor, seats);
    if (!seat) return planVisitLounge(agent);
    const a = [A_STAND(), A_RELEASE()];
    pushAll(a, travelTo(agent.floor, mFloor, seat));
    a.push(A_SIT(mFloor, seat));
    a.push(A_STATE("IN_MEETING"));
    a.push(A_WAIT(randInt(22, 45)));
    a.push(A_STAND());
    a.push(A_RELEASE());
    pushAll(a, travelTo(mFloor, agent.homeFloor, agent.deskWpName));
    a.push(A_SIT(agent.homeFloor, agent.deskWpName));
    a.push(A_STATE("AT_DESK"));
    a.push(A_WAIT(randInt(18, 65)));
    a.push(A_PICK());
    return a;
}

function planVisitCoworker(agent) {
    const targets = [];
    for (let i = 0; i < agents.length; i += 1) {
        const t = agents[i];
        if (t.role === "WORKER" && t.state === "AT_DESK" && t.id !== agent.id) targets.push(t);
    }
    if (!targets.length) return [A_WAIT(randInt(10, 30)), A_PICK()];
    const target = targets[randInt(0, targets.length - 1)];
    const a = [A_STAND(), A_RELEASE()];
    pushAll(a, travelTo(agent.floor, target.homeFloor, target.deskDoorWpName));
    a.push(A_STATE("VISITING"));
    a.push(A_WAIT(randInt(6, 18)));
    pushAll(a, travelTo(target.homeFloor, agent.homeFloor, agent.deskWpName));
    a.push(A_SIT(agent.homeFloor, agent.deskWpName));
    a.push(A_STATE("AT_DESK"));
    a.push(A_WAIT(randInt(18, 65)));
    a.push(A_PICK());
    return a;
}

function planLeaveBuilding(agent) {
    const a = [A_STAND(), A_RELEASE()];
    if (agent.floor === 0) {
        a.push(A_WALK(0, "lobby_center"));
    } else {
        a.push(A_WALK(agent.floor, "elevWait"));
        a.push(A_PANEL(agent.floor, -1, 0));
        a.push(A_ENTER(0));
        a.push(A_PRESS(0));
        a.push(A_WAIT_FLOOR(0));
        a.push(A_EXIT(0));
        a.push(A_WALK(0, "lobby_center"));
    }
    a.push(A_WALK(0, "entrance"));
    a.push(A_WALK(0, "front_door_threshold"));
    a.push(A_WALK(0, "outside"));
    a.push(A_EXIT_BUILD());
    a.push(A_STATE("GONE"));
    return a;
}

function planVisitorVisit(agent) {
    const a = [A_STATE("VISITING")];
    const r = Math.random();
    if (r < 0.10) {
        const seat = reserveSeatFor(agent, 0, BISTRO_SEATS);
        if (seat) { a.push(A_WALK(0, seat)); a.push(A_SIT(0, seat)); a.push(A_WAIT(randInt(10, 30))); a.push(A_STAND()); a.push(A_RELEASE()); }
        else { a.push(A_WALK(0, "lobby_stand_center")); a.push(A_SIT(0, "lobby_stand_center")); a.push(A_WAIT(randInt(8, 20))); a.push(A_STAND()); }
    } else if (r < 0.16) {
        a.push(A_WALK(0, "cafe_order")); a.push(A_SIT(0, "cafe_order")); a.push(A_WAIT(randInt(5, 15))); a.push(A_STAND());
    } else if (r < 0.30) {
        const seat = reserveSeatFor(agent, 0, FRONT_LOUNGE_SEATS);
        if (seat) { a.push(A_WALK(0, seat)); a.push(A_SIT(0, seat)); a.push(A_WAIT(randInt(8, 20))); a.push(A_STAND()); a.push(A_RELEASE()); }
        else { a.push(A_WALK(0, "lobby_stand_center")); a.push(A_SIT(0, "lobby_stand_center")); a.push(A_WAIT(randInt(8, 20))); a.push(A_STAND()); }
    } else if (r < 0.42) {
        const seat = reserveSeatFor(agent, 0, BACK_SEATS);
        if (seat) { a.push(A_WALK(0, seat)); a.push(A_SIT(0, seat)); a.push(A_WAIT(randInt(8, 20))); a.push(A_STAND()); a.push(A_RELEASE()); }
        else { a.push(A_WALK(0, "lobby_stand_center")); a.push(A_SIT(0, "lobby_stand_center")); a.push(A_WAIT(randInt(8, 20))); a.push(A_STAND()); }
    } else if (r < 0.52) {
        const spot = STAND_SPOTS[randInt(0, STAND_SPOTS.length - 1)];
        a.push(A_WALK(0, spot)); a.push(A_SIT(0, spot)); a.push(A_WAIT(randInt(4, 12))); a.push(A_STAND());
    } else if (r < 0.62) {
        const spot = LOITER_SPOTS[randInt(0, LOITER_SPOTS.length - 1)];
        a.push(A_WALK(0, spot)); a.push(A_SIT(0, spot)); a.push(A_WAIT(randInt(6, 16))); a.push(A_STAND());
    } else if (r < 0.77) {
        const fl = randInt(1, 5);
        const seat = reserveSeatFor(agent, fl, OFFICE_LOUNGE);
        if (seat) {
            pushAll(a, travelTo(0, fl, seat));
            a.push(A_SIT(fl, seat)); a.push(A_WAIT(randInt(10, 25))); a.push(A_STAND()); a.push(A_RELEASE());
            pushAll(a, travelTo(fl, 0, "lobby_center"));
        } else {
            a.push(A_WALK(0, "lobby_stand_center")); a.push(A_SIT(0, "lobby_stand_center")); a.push(A_WAIT(randInt(8, 20))); a.push(A_STAND());
        }
    } else {
        const fl = randInt(1, 5);
        const seat = reserveSeatFor(agent, fl, ["conf_seat0", "conf_seat1", "conf_seat2", "conf_seat3"]);
        if (seat) {
            pushAll(a, travelTo(0, fl, seat));
            a.push(A_SIT(fl, seat)); a.push(A_WAIT(randInt(15, 35))); a.push(A_STAND()); a.push(A_RELEASE());
            pushAll(a, travelTo(fl, 0, "lobby_center"));
        } else {
            a.push(A_WALK(0, "lobby_stand_center")); a.push(A_SIT(0, "lobby_stand_center")); a.push(A_WAIT(randInt(8, 20))); a.push(A_STAND());
        }
    }
    a.push(A_WALK(0, "lobby_center"));
    a.push(A_WALK(0, "entrance"));
    a.push(A_WALK(0, "front_door_threshold"));
    a.push(A_WALK(0, "outside"));
    a.push(A_EXIT_BUILD());
    a.push(A_STATE("GONE"));
    return a;
}

function chooseNextActivity(agent) {
    if (Clock.simMinute >= agent.departureTime) return planLeaveBuilding(agent);
    if (agent.plannedMeetingTimes.length && Clock.simMinute >= agent.plannedMeetingTimes[0]) {
        agent.plannedMeetingTimes.shift();
        return planAttendMeeting(agent);
    }
    if (!agent.hasLunched && Clock.simMinute >= agent.lunchTime) return planGoToLunch(agent);
    const r = Math.random();
    if (r < 0.14) return planAttendMeeting(agent);
    if (r < 0.26) return planVisitLounge(agent);
    if (r < 0.41) return planVisitCoworker(agent);
    return [A_WAIT(randInt(18, 65)), A_PICK()];
}

// ---- agent setup ----
function makeAgent(id, role) {
    const group = createPerson();
    group.visible = false;
    group.renderOrder = 1;
    return {
        id: id, role: role, group: group, name: "",
        state: "AWAY", plan: [], planIndex: 0, currentAction: null,
        floor: 0, currentWp: "outside", isSitting: false, _inCar: false,
        spot: null, toFloor: null, seatResKey: null,
        homeFloor: null, deskId: null, deskWpName: null, deskDoorWpName: null,
        arrivalTime: 0, lunchTime: 0, lunchDuration: 0, departureTime: 0,
        plannedMeetingTimes: [], hasLunched: false, visitDuration: 0,
        _walkPath: null, _pathIdx: 0, _stallT: 0, _prevX: 0, _prevZ: 0
    };
}

function makeSchedule(a) {
    a.arrivalTime = randInt(8 * 60 + 15, 9 * 60 + 30);
    a.lunchTime = randInt(11 * 60 + 30, 13 * 60 + 30);
    a.lunchDuration = randInt(25, 60);
    a.departureTime = chance(0.15) ? randInt(18 * 60 + 30, 19 * 60 + 45) : randInt(16 * 60 + 45, 18 * 60 + 30);
    a.visitDuration = randInt(15, 50);
    a.plannedMeetingTimes = [];
    if (a.role === "WORKER") {
        if (chance(0.6)) a.plannedMeetingTimes.push(randInt(9 * 60 + 30, 11 * 60));
        if (chance(0.5)) a.plannedMeetingTimes.push(randInt(13 * 60, 16 * 60));
        a.plannedMeetingTimes.sort(function (x, y) { return x - y; });
    }
    a.hasLunched = false;
}

function initAgents() {
    agents = [];
    for (let i = 0; i < MAX_WORKERS; i += 1) {
        const homeFloor = 1 + Math.floor(i / 4);
        const letter = DESK_LETTERS[i % 4];
        const a = makeAgent(i, "WORKER");
        a.homeFloor = homeFloor;
        a.deskId = letter + (i % 4);
        a.deskWpName = "office" + letter + "_desk";
        a.deskDoorWpName = "office" + letter + "_door";
        a.name = FIRST_NAMES[i % FIRST_NAMES.length];
        makeSchedule(a);
        a.state = i < DEFAULT_OCCUPANCY ? "AWAY" : "DISABLED";
        agents.push(a);
    }
    for (let i = 0; i < MAX_VISITORS; i += 1) {
        const id = MAX_WORKERS + i;
        const a = makeAgent(id, "VISITOR");
        a.name = "Guest" + (i + 1);
        makeSchedule(a);
        a.state = id < DEFAULT_OCCUPANCY ? "AWAY" : "DISABLED";
        agents.push(a);
    }
}

function spawnAgent(agent) {
    const pos = world.floors[0].nodes["outside"].pos;
    agent.group.position.set(
        pos.x + (Math.random() - 0.5) * 2.2,
        pos.y,
        pos.z + (Math.random() - 0.5) * 1.5
    );
    agent.group.rotation.y = Math.PI;
    agent.group.visible = true;
    if (!agent.group.parent) scene.add(agent.group);
    agent.floor = 0;
    agent.currentWp = "outside";
    agent.isSitting = false;
    agent._inCar = false;
    agent.spot = null;
    agent.group.userData.isSitting = false;
    agent.group.userData.isWalking = false;
}

// ---- action dispatch ----
function startAction(agent, action) {
    action._started = true;
    const t = action.type;
    if (t === "WALK_TO_WP") {
        const nodes = world.floors[action.floor].nodes;
        let path = world.bfsPath(nodes, agent.currentWp, action.wp);
        if (!path.length) path = [nodes[action.wp] ? nodes[action.wp].pos.clone() : agent.group.position.clone()];
        agent._walkPath = path;
        agent._pathIdx = 0;
        agent._stallT = 0;
        agent._prevX = agent.group.position.x;
        agent._prevZ = agent.group.position.z;
        agent.group.userData.isWalking = true;
        agent.group.userData.isSitting = false;
        agent.isSitting = false;
    } else if (t === "WAIT_AT_PANEL") {
        if (action.dir > 0) elevator.callUp(action.floor); else elevator.callDown(action.floor);
        agent.group.userData.isWalking = false;
    } else if (t === "ENTER_ELEVATOR") {
        action._dir = action.toFloor > agent.floor ? 1 : -1;
        agent.group.userData.isWalking = true;
    } else if (t === "PRESS_FLOOR") {
        elevator.pressDestination(action.floor);
    } else if (t === "SIT") {
        const node = world.floors[action.floor].nodes[action.wp];
        const target = world.floors[action.floor].sitTargets[action.wp];
        if (!node) { action._skip = true; return; }
        agent.floor = action.floor;
        if (target && target.sit) {
            agent.group.position.set(node.pos.x, node.pos.y - 0.35, node.pos.z);
            agent.group.rotation.y = target.facing;
            agent.isSitting = true;
            agent.group.userData.isSitting = true;
        } else {
            const ang = Math.random() * Math.PI * 2;
            const rad = 0.35 + Math.random() * 0.4;
            agent.group.position.set(node.pos.x + Math.cos(ang) * rad, node.pos.y, node.pos.z + Math.sin(ang) * rad);
            agent.group.rotation.y = target ? target.facing : 0;
            agent.isSitting = false;
            agent.group.userData.isSitting = false;
        }
        agent.currentWp = action.wp;
        agent.group.userData.isWalking = false;
    } else if (t === "STAND") {
        agent.isSitting = false;
        agent.group.userData.isSitting = false;
        agent.group.position.y = agent._inCar ? 0 : agent.floor * WORLD.FLOOR_HEIGHT;
    } else if (t === "RELEASE_SEAT") {
        releaseSeat(agent);
    } else if (t === "WAIT_SIM") {
        action._untilMin = Clock.simMinute + action.minutes;
    } else if (t === "EXIT_BUILDING") {
        if (agent.group.parent) scene.remove(agent.group);
        releaseSeat(agent);
        agent.state = "GONE";
    } else if (t === "ENTER_STATE") {
        agent.state = action.state;
    } else if (t === "MARK_LUNCHED") {
        agent.hasLunched = true;
    } else if (t === "PICK_NEXT_ACTIVITY") {
        if (agent.role === "WORKER") {
            agent.plan = chooseNextActivity(agent);
            agent.planIndex = 0;
        } else {
            agent.plan = [A_EXIT_BUILD(), A_STATE("GONE")];
            agent.planIndex = 0;
        }
    }
}

function updateAction(agent, action, dt) {
    const t = action.type;
    if (t === "WALK_TO_WP") return walkAlongPath(agent, dt);
    if (t === "WAIT_AT_PANEL") {
        if (action.dir > 0 && !elevator.upCalls.has(action.floor)) elevator.callUp(action.floor);
        if (action.dir < 0 && !elevator.downCalls.has(action.floor)) elevator.callDown(action.floor);
        return elevator.isAcceptingAt(action.floor, action.dir);
    }
    if (t === "ENTER_ELEVATOR") return updateEnterElevator(agent, action, dt);
    if (t === "PRESS_FLOOR") return true;
    if (t === "WAIT_FOR_FLOOR") return elevator.state === "DOOR_OPEN" && Math.round(elevator.currentFloor) === action.floor;
    if (t === "EXIT_ELEVATOR") return updateExitElevator(agent, action, dt);
    if (t === "SIT") return true;
    if (t === "STAND") return true;
    if (t === "RELEASE_SEAT") return true;
    if (t === "WAIT_SIM") return Clock.simMinute >= action._untilMin;
    if (t === "EXIT_BUILDING") return true;
    if (t === "ENTER_STATE") return true;
    if (t === "MARK_LUNCHED") return true;
    if (t === "PICK_NEXT_ACTIVITY") return true;
    return true;
}

function walkAlongPath(agent, dt) {
    const path = agent._walkPath;
    if (!path || !path.length) return true;
    let step = WALK_SPEED * dt;
    const startX = agent.group.position.x;
    const startZ = agent.group.position.z;
    while (step > 0 && agent._pathIdx < path.length) {
        const tgt = path[agent._pathIdx];
        const dx = tgt.x - agent.group.position.x;
        const dz = tgt.z - agent.group.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < 0.08) { agent._pathIdx += 1; continue; }
        const move = Math.min(step, dist);
        agent.group.position.x += dx / dist * move;
        agent.group.position.z += dz / dist * move;
        agent.group.rotation.y = Math.atan2(dx, dz);
        step -= move;
    }
    const moved = Math.hypot(agent.group.position.x - startX, agent.group.position.z - startZ);
    if (moved < 0.005 && dt > 0 && agent._pathIdx < path.length) {
        agent._stallT += dt;
        if (agent._stallT > 1.2) { agent._pathIdx += 1; agent._stallT = 0; }
    } else {
        agent._stallT = 0;
    }
    return agent._pathIdx >= path.length;
}

function updateEnterElevator(agent, action, dt) {
    const L = elevator;
    if (action._phase === 0) {
        if (!agent.spot) agent.spot = L.reserveBoardingSpot(agent);
        if (!agent.spot) {
            if (action._dir > 0) L.callUp(agent.floor); else L.callDown(agent.floor);
            return false;
        }
        action._phase = 1;
        agent._stallT = 0;
        agent._prevX = agent.group.position.x;
        agent._prevZ = agent.group.position.z;
        agent.group.userData.isWalking = true;
    }
    if (action._phase === 1) {
        const tx = agent.spot.x, tz = 1.0;
        const dx = tx - agent.group.position.x, dz = tz - agent.group.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.2) { action._phase = 2; }
        else {
            const move = Math.min(WALK_SPEED * dt, dist);
            agent.group.position.x += dx / dist * move;
            agent.group.position.z += dz / dist * move;
            agent.group.rotation.y = Math.atan2(dx, dz);
            const moved = Math.hypot(agent.group.position.x - agent._prevX, agent.group.position.z - agent._prevZ);
            if (moved < 0.005 && dt > 0) { agent._stallT += dt; if (agent._stallT > 1.5) { agent.group.position.x = tx; agent.group.position.z = tz; action._phase = 2; agent._stallT = 0; } }
            else agent._stallT = 0;
            agent._prevX = agent.group.position.x; agent._prevZ = agent.group.position.z;
            return false;
        }
    }
    if (action._phase === 2) {
        L.carGroup.attach(agent.group);
        agent._inCar = true;
        action._phase = 3;
    }
    if (action._phase === 3) {
        const tx = agent.spot.x, tz = agent.spot.z;
        const dx = tx - agent.group.position.x, dz = tz - agent.group.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.15) { action._phase = 4; }
        else {
            const move = Math.min(WALK_SPEED * dt, dist);
            agent.group.position.x += dx / dist * move;
            agent.group.position.z += dz / dist * move;
            agent.group.rotation.y = Math.atan2(dx, dz);
            return false;
        }
    }
    if (action._phase === 4) {
        L.completeBoard(agent);
        L.pressDestination(action.toFloor);
        agent.group.position.set(agent.spot.x, 0, agent.spot.z);
        agent.group.rotation.y = 0;
        agent.group.userData.isWalking = false;
        agent.state = "IN_CAR";
        agent.spot = null;
        return true;
    }
    return false;
}

function updateExitElevator(agent, action, dt) {
    const L = elevator;
    if (action._phase === 0) {
        scene.attach(agent.group);
        L.registerDisembark(agent);
        agent._inCar = false;
        action._phase = 1;
        agent.group.userData.isWalking = true;
    }
    if (action._phase === 1) {
        const tx = 0, tz = 2.2;
        const dx = tx - agent.group.position.x, dz = tz - agent.group.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.2) { action._phase = 2; }
        else {
            const move = Math.min(WALK_SPEED * dt, dist);
            agent.group.position.x += dx / dist * move;
            agent.group.position.z += dz / dist * move;
            agent.group.rotation.y = Math.atan2(dx, dz);
            return false;
        }
    }
    if (action._phase === 2) {
        L.completeDisembark(agent);
        agent.floor = action.toFloor;
        agent.currentWp = "elevWait";
        agent.group.position.y = agent.floor * WORLD.FLOOR_HEIGHT;
        agent.group.userData.isWalking = false;
        return true;
    }
    return false;
}

function dispatch(agent, dt) {
    let iters = 0;
    let curDt = dt;
    while (agent.planIndex < agent.plan.length && iters < 16) {
        const action = agent.plan[agent.planIndex];
        agent.currentAction = action;
        if (!action._started) startAction(agent, action);
        const done = updateAction(agent, action, curDt);
        if (done) {
            if (action.type === "WALK_TO_WP") { agent.currentWp = action.wp; agent.group.userData.isWalking = false; }
            if (action.type === "PICK_NEXT_ACTIVITY") { curDt = 0; iters += 1; continue; }
            agent.planIndex += 1;
            curDt = 0;
            iters += 1;
        } else {
            break;
        }
    }
    if (agent.planIndex >= agent.plan.length) onPlanEmpty(agent);
}

function onPlanEmpty(agent) {
    if (agent.state === "GONE") return;
    if (agent.role === "VISITOR") { agent.state = "GONE"; return; }
    agent.plan = chooseNextActivity(agent);
    agent.planIndex = 0;
}

function processSchedule(agent) {
    if (agent.state === "AWAY") {
        if (Clock.simMinute >= agent.arrivalTime) {
            spawnAgent(agent);
            if (agent.role === "WORKER") {
                agent.plan = planArriveToDesk(agent);
                agent.state = "ARRIVING";
            } else {
                agent.plan = planVisitorVisit(agent);
                agent.state = "VISITING";
            }
            agent.planIndex = 0;
        }
        return;
    }
}

// ---- collisions ----
function isExempt(a) {
    const act = a.currentAction;
    if (act && act.type === "ENTER_ELEVATOR") return true;
    if (act && act.type === "WALK_TO_WP" && (act.wp === "front_door_threshold" || act.wp === "entrance")) return true;
    return false;
}

function applyCollisions() {
    const list = [];
    for (let i = 0; i < agents.length; i += 1) {
        const a = agents[i];
        if (a.state === "GONE" || a.state === "DISABLED") continue;
        if (a._inCar) continue;
        if (a.isSitting) continue;
        if (!a.group.parent) continue;
        list.push(a);
    }
    for (let i = 0; i < list.length; i += 1) {
        const a = list[i];
        if (isExempt(a)) continue;
        for (let j = i + 1; j < list.length; j += 1) {
            const b = list[j];
            if (isExempt(b)) continue;
            if (Math.abs(a.group.position.y - b.group.position.y) > 1.0) continue;
            const dx = a.group.position.x - b.group.position.x;
            const dz = a.group.position.z - b.group.position.z;
            const dist = Math.hypot(dx, dz);
            if (dist < 0.85) {
                let nx, nz;
                if (dist < 0.001) { const ang = Math.random() * Math.PI * 2; nx = Math.cos(ang); nz = Math.sin(ang); }
                else { nx = dx / dist; nz = dz / dist; }
                const push = (0.85 - dist) * 0.18;
                a.group.position.x += nx * push; a.group.position.z += nz * push;
                b.group.position.x -= nx * push; b.group.position.z -= nz * push;
            }
        }
    }
}

// ---- visitor top-up + occupancy ----
function countPresent() {
    let n = 0;
    for (let i = 0; i < agents.length; i += 1) {
        const s = agents[i].state;
        if (s !== "DISABLED" && s !== "AWAY" && s !== "GONE") n += 1;
    }
    return n;
}

function topUpVisitors() {
    if (Clock.simMinute < 8 * 60 || Clock.simMinute > 19 * 60 + 45) return;
    const deficit = targetOccupancy - countPresent();
    if (deficit <= 0) return;
    let armed = 0;
    for (let i = 0; i < agents.length && armed < deficit; i += 1) {
        const a = agents[i];
        if (a.role === "VISITOR" && (a.state === "AWAY" || a.state === "GONE")) {
            a.arrivalTime = Clock.simMinute + randInt(0, 6);
            a.visitDuration = randInt(15, 50);
            a.state = "AWAY";
            a.hasLunched = false;
            a.plannedMeetingTimes = [];
            releaseSeat(a);
            armed += 1;
        }
    }
}

function applyOccupancy() {
    for (let i = 0; i < agents.length; i += 1) {
        const a = agents[i];
        const enabled = a.id < targetOccupancy;
        if (!enabled) {
            if (a.state === "AWAY" || a.state === "GONE") a.state = "DISABLED";
        } else {
            if (a.state === "DISABLED") { a.state = "AWAY"; a.arrivalTime = Clock.simMinute + randInt(1, 20); }
        }
    }
}

function resetDay() {
    elevator.reset();
    for (let i = 0; i < agents.length; i += 1) {
        const a = agents[i];
        releaseSeat(a);
        if (a.group.parent) scene.remove(a.group);
        a.group.visible = false;
        a.isSitting = false;
        a._inCar = false;
        a.spot = null;
        a.plan = [];
        a.planIndex = 0;
        a.currentAction = null;
        a.hasLunched = false;
        a.seatResKey = null;
        a.plannedMeetingTimes = [];
        makeSchedule(a);
        a.state = a.id < targetOccupancy ? "AWAY" : "DISABLED";
    }
}

// ---- lighting ----
function lerpColor(c1, c2, t) {
    const a = new THREE.Color(c1), b = new THREE.Color(c2);
    return a.lerp(b, t);
}

function updateLighting() {
    const hour = Clock.simMinute / 60;
    let k1 = LIGHT_KEYFRAMES[0], k2 = LIGHT_KEYFRAMES[LIGHT_KEYFRAMES.length - 1];
    for (let i = 0; i < LIGHT_KEYFRAMES.length - 1; i += 1) {
        if (hour >= LIGHT_KEYFRAMES[i].hour && hour <= LIGHT_KEYFRAMES[i + 1].hour) {
            k1 = LIGHT_KEYFRAMES[i]; k2 = LIGHT_KEYFRAMES[i + 1]; break;
        }
    }
    const span = k2.hour - k1.hour;
    const t = span > 0 ? (hour - k1.hour) / span : 0;
    scene.background = lerpColor(k1.bg, k2.bg, t);
    sun.color = lerpColor(k1.sun, k2.sun, t);
    sun.intensity = k1.sunI + (k2.sunI - k1.sunI) * t;
    ambient.intensity = k1.amb + (k2.amb - k1.amb) * t;
    hemi.intensity = k1.hemi + (k2.hemi - k1.hemi) * t;
}

// ---- HUD ----
function setupHUD() {
    const panel = document.createElement("div");
    panel.style.cssText = "position:fixed;top:10px;left:10px;color:#fff;font:13px monospace;background:rgba(0,0,0,0.55);padding:10px;border-radius:6px;z-index:10;min-width:240px";
    const timeDiv = document.createElement("div");
    timeDiv.style.cssText = "font-size:20px;font-weight:bold;margin-bottom:6px";
    panel.appendChild(timeDiv);
    const speedLabel = document.createElement("div");
    speedLabel.textContent = "Speed: 120x";
    panel.appendChild(speedLabel);
    speedSlider = document.createElement("input");
    speedSlider.type = "range"; speedSlider.min = 0; speedSlider.max = 100; speedSlider.value = 75; speedSlider.step = 1;
    speedSlider.style.cssText = "width:220px";
    speedSlider.addEventListener("input", function () {
        Clock.timeScale = Math.pow(600, speedSlider.value / 100);
        speedLabel.textContent = "Speed: " + Clock.timeScale.toFixed(1) + "x";
    });
    panel.appendChild(speedSlider);
    const occLabel = document.createElement("div");
    occLabel.textContent = "Occupancy: " + DEFAULT_OCCUPANCY + " / 100 people";
    panel.appendChild(occLabel);
    occSlider = document.createElement("input");
    occSlider.type = "range"; occSlider.min = 1; occSlider.max = MAX_OCCUPANCY; occSlider.value = DEFAULT_OCCUPANCY; occSlider.step = 1;
    occSlider.style.cssText = "width:220px";
    occSlider.addEventListener("input", function () {
        targetOccupancy = parseInt(occSlider.value, 10);
        applyOccupancy();
        occLabel.textContent = "Occupancy: " + targetOccupancy + " / 100 people";
    });
    panel.appendChild(occSlider);
    const countsDiv = document.createElement("div");
    countsDiv.style.cssText = "margin-top:6px;white-space:pre;line-height:1.4";
    panel.appendChild(countsDiv);
    document.body.appendChild(panel);
    hudTime = timeDiv;
    hudCounts = countsDiv;
    Clock.timeScale = Math.pow(600, speedSlider.value / 100);
}

function updateHUD() {
    if (!hudTime) return;
    hudTime.textContent = Clock.format();
    const counts = {};
    const states = ["DISABLED", "AWAY", "ARRIVING", "WAITING_ELEVATOR", "IN_CAR", "ON_FLOOR", "AT_DESK", "IN_MEETING", "AT_BREAK", "AT_LUNCH", "VISITING", "LEAVING", "GONE"];
    for (let i = 0; i < agents.length; i += 1) { const s = agents[i].state; counts[s] = (counts[s] || 0) + 1; }
    let txt = "";
    for (let i = 0; i < states.length; i += 1) { if (counts[states[i]]) txt += states[i] + ":" + counts[states[i]] + " "; }
    txt += "\nElev F" + Math.round(elevator.currentFloor) + " " + elevator.state + " d=" + elevator.direction + " pax=" + elevator.passengers.size;
    txt += " dest=[" + Array.from(elevator.destinations).join(",") + "] up=[" + Array.from(elevator.upCalls).join(",") + "] dn=[" + Array.from(elevator.downCalls).join(",") + "]";
    hudCounts.textContent = txt;
}

// ---- render loop ----
function animate() {
    requestAnimationFrame(animate);
    const realDt = Math.min(0.05, Clock.getDelta());
    Clock.tick(realDt);
    updateLighting();
    const motionDt = realDt * Clock.timeScale;
    elevator.tick(motionDt);
    topUpVisitors();
    for (let i = 0; i < agents.length; i += 1) {
        const a = agents[i];
        if (a.state === "DISABLED" || a.state === "GONE") continue;
        processSchedule(a);
        if (a.state !== "GONE" && a.state !== "DISABLED" && a.group.parent) {
            dispatch(a, motionDt);
        }
    }
    applyCollisions();
    for (let i = 0; i < agents.length; i += 1) {
        if (agents[i].group.parent) animatePersonWalking(agents[i].group, motionDt);
    }
    controls.update();
    renderer.render(scene, camera);
    updateHUD();
}

function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function startSimulation() {
    Clock.init();
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x20242a);
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(28, 24, 28);
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.sortObjects = true;
    document.body.appendChild(renderer.domElement);
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 10, 0);

    ambient = new THREE.AmbientLight(0xffffff, 0.45);
    scene.add(ambient);
    hemi = new THREE.HemisphereLight(0xbfd7ff, 0x303020, 0.45);
    scene.add(hemi);
    sun = new THREE.DirectionalLight(0xffffff, 0.9);
    sun.position.set(20, 35, 18);
    scene.add(sun);

    world = createWorld(scene);
    elevator = new Elevator(scene, world);
    targetOccupancy = DEFAULT_OCCUPANCY;
    initAgents();
    setupHUD();
    window.addEventListener("resize", onResize);

    animate();
}

if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", startSimulation);
} else {
    startSimulation();
}
