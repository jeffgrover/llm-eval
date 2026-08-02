// sim.js - Simulated clock, day/night, agent state machine, daily schedules, render loop, UI
// Loaded as classic <script> in browser. Depends on person.js, world.js, elevator_logic.js, elevator.js.

// =================== Clock ===================
class Clock {
    constructor() {
        this.simMinute = 7 * 60 + 30;
        this.timeScale = 120; // 120x realtime by default
        this._lastT = null;
    }
    format() {
        const m = Math.floor(this.simMinute) % (24 * 60);
        const hh = Math.floor(m / 60);
        const mm = Math.floor(m % 60);
        const ampm = hh >= 12 ? "PM" : "AM";
        let h12 = hh % 12;
        if (h12 === 0) h12 = 12;
        return (h12 < 10 ? " " : "") + h12 + ":" + (mm < 10 ? "0" : "") + mm + " " + ampm;
    }
    getDelta() {
        const now = performance.now() / 1000;
        if (this._lastT === null) { this._lastT = now; return 0.016; }
        const dt = Math.min(0.1, now - this._lastT);
        this._lastT = now;
        return dt;
    }
    tick(realDt) {
        this.simMinute += realDt * this.timeScale / 60;
        if (this.simMinute >= 24 * 60) {
            this.simMinute -= 24 * 60;
            dayWrap();
        }
    }
}

// =================== Globals ===================
let scene, camera, renderer, controls;
let world, elevator;
let clock = new Clock();
const agents = [];     // All agents (workers + visitors), each with .group
let seatReservations = new Set(); // "floor:wpName" reservations
let targetOccupancy = 45;
let hud;

// =================== Constants ===================
const MAX_WORKERS = 20;
const MAX_VISITORS = 80;
const MAX_OCCUPANCY = MAX_WORKERS + MAX_VISITORS;
const FLOOR_HEIGHT = (window.WORLD && window.WORLD.FLOOR_HEIGHT) || 3.4;
const FLOOR_COUNT = (window.WORLD && window.WORLD.FLOOR_COUNT) || 6;
const FIRST_NAMES = [
    "Alex", "Bob", "Cathy", "Dan", "Eve", "Frank", "Gina", "Hank",
    "Iris", "Jack", "Kim", "Leo", "Mia", "Ned", "Olive", "Paul",
    "Quinn", "Rita", "Sam", "Tina", "Uma", "Vic", "Wendy", "Xander",
    "Yara", "Zane", "Adan", "Bea", "Cara", "Drew", "Eli", "Faye",
    "Gus", "Hana", "Ian", "Jade", "Kyle", "Lara", "Maya", "Noor",
    "Owen", "Pia", "Rex", "Suri", "Tess", "Uri", "Vera", "Wes"
];

// Agent states
const STATE = {
    DISABLED: "DISABLED",
    AWAY: "AWAY",
    ARRIVING: "ARRIVING",
    WAITING_ELEVATOR: "WAITING_ELEVATOR",
    IN_CAR: "IN_CAR",
    ON_FLOOR: "ON_FLOOR",
    AT_DESK: "AT_DESK",
    IN_MEETING: "IN_MEETING",
    AT_BREAK: "AT_BREAK",
    AT_LUNCH: "AT_LUNCH",
    VISITING: "VISITING",
    LEAVING: "LEAVING",
    GONE: "GONE",
};

const ROLE = { WORKER: "WORKER", VISITOR: "VISITOR" };

// =================== Day/night ===================
// Keyframes: [hour, bg, sunColor, sunIntensity, ambient, hemi]
const DAY_KEYS = [
    { h: 5.5, bg: 0x101018, sun: 0x553344, sunI: 0.15, amb: 0.30, hemi: 0.20 },
    { h: 6.0, bg: 0x202030, sun: 0x886655, sunI: 0.35, amb: 0.35, hemi: 0.25 },
    { h: 6.5, bg: 0x303a4a, sun: 0xffcc88, sunI: 0.7,  amb: 0.40, hemi: 0.32 },
    { h: 7.0, bg: 0x6080a0, sun: 0xfff0d0, sunI: 0.9,  amb: 0.45, hemi: 0.40 },
    { h: 9.0, bg: 0x88aacc, sun: 0xffffff, sunI: 1.0,  amb: 0.50, hemi: 0.45 },
    { h: 16.0, bg: 0x88aacc, sun: 0xffffff, sunI: 1.0,  amb: 0.50, hemi: 0.45 },
    { h: 17.5, bg: 0x88aacc, sun: 0xfff0d0, sunI: 0.9,  amb: 0.45, hemi: 0.40 },
    { h: 18.0, bg: 0x554466, sun: 0xff9966, sunI: 0.6,  amb: 0.40, hemi: 0.32 },
    { h: 18.5, bg: 0x332a3a, sun: 0x664466, sunI: 0.25, amb: 0.35, hemi: 0.25 },
    { h: 19.0, bg: 0x101018, sun: 0x332244, sunI: 0.15, amb: 0.30, hemi: 0.20 },
    { h: 22.0, bg: 0x080810, sun: 0x222244, sunI: 0.10, amb: 0.25, hemi: 0.15 },
];

function lerp(a, b, t) { return a + (b - a) * t; }
function lerpColor(out, a, b, t) {
    const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
    const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
    const r = Math.round(lerp(ar, br, t));
    const g = Math.round(lerp(ag, bg, t));
    const bl = Math.round(lerp(ab, bb, t));
    return (r << 16) | (g << 8) | bl;
}

let sun, ambientLight, hemiLight;
function updateDayNight() {
    if (!sun || !ambientLight || !hemiLight) return;
    const hour = (clock.simMinute / 60) % 24;
    // Find surrounding keyframes
    let i = 0;
    for (; i < DAY_KEYS.length - 1; i++) {
        if (hour < DAY_KEYS[i + 1].h) break;
    }
    const a = DAY_KEYS[i];
    const b = DAY_KEYS[Math.min(DAY_KEYS.length - 1, i + 1)];
    const t = b.h === a.h ? 0 : (hour - a.h) / (b.h - a.h);
    scene.background.setHex(lerpColor(0, a.bg, b.bg, t));
    sun.color.setHex(lerpColor(0, a.sun, b.sun, t));
    sun.intensity = lerp(a.sunI, b.sunI, t);
    ambientLight.intensity = lerp(a.amb, b.amb, t);
    hemiLight.intensity = lerp(a.hemi, b.hemi, t);
}

// =================== Agent creation ===================
function newAgentSchedule(agent) {
    const arrivalH = 8.25 + Math.random() * 1.05; // 8:15 - 9:18
    agent.arrivalTime = arrivalH * 60;
    const lunchH = 11.5 + Math.random() * 2.0;
    agent.lunchTime = lunchH * 60;
    agent.lunchDuration = 25 + Math.floor(Math.random() * 36);
    if (Math.random() < 0.15) {
        agent.departureTime = (18.5 + Math.random() * 1.25) * 60;
        agent.isStraggler = true;
    } else {
        agent.departureTime = (16.75 + Math.random() * 1.75) * 60;
        agent.isStraggler = false;
    }
    agent.hasLunched = false;
    // Planned meetings: 0..2
    const numMeetings = Math.floor(Math.random() * 3); // 0, 1, or 2
    agent.plannedMeetingTimes = [];
    for (let i = 0; i < numMeetings; i++) {
        const mh = 9.5 + Math.random() * 7.5; // 9:30 - 17:00
        agent.plannedMeetingTimes.push(mh * 60);
    }
    agent.plannedMeetingTimes.sort(function (a, b) { return a - b; });
}

function createAgentPool() {
    // Workers: 1 per office (4 offices * 5 office floors = 20)
    for (let i = 0; i < MAX_WORKERS; i++) {
        const floorIdx = 1 + Math.floor(i / 4);
        const officeIdx = i % 4;
        const officeIds = ["A", "B", "C", "D"];
        const a = {
            id: i,
            role: ROLE.WORKER,
            name: FIRST_NAMES[i % FIRST_NAMES.length] + (i >= FIRST_NAMES.length ? ("_" + Math.floor(i / FIRST_NAMES.length)) : ""),
            homeFloor: floorIdx,
            deskId: "office" + officeIds[officeIdx],
            deskWpName: "office" + officeIds[officeIdx] + "_desk",
            deskDoorWpName: "office" + officeIds[officeIdx] + "_door",
            state: STATE.AWAY,
            plan: [],
            currentAction: null,
            isSitting: false,
            isWalking: false,
            group: null,
            bodyY: 0,
        };
        newAgentSchedule(a);
        a.arrivalTime = -1; // Will be re-armed by topUpVisitors-like logic
        a.state = STATE.DISABLED; // Start disabled
        agents.push(a);
    }
    // Visitors
    for (let i = MAX_WORKERS; i < MAX_WORKERS + MAX_VISITORS; i++) {
        const a = {
            id: i,
            role: ROLE.VISITOR,
            name: FIRST_NAMES[i % FIRST_NAMES.length] + (i >= FIRST_NAMES.length ? ("_" + Math.floor(i / FIRST_NAMES.length)) : ""),
            homeFloor: null,
            deskId: null,
            deskWpName: null,
            deskDoorWpName: null,
            state: STATE.AWAY,
            plan: [],
            currentAction: null,
            isSitting: false,
            isWalking: false,
            group: null,
            bodyY: 0,
        };
        newAgentSchedule(a);
        a.arrivalTime = -1;
        a.state = STATE.DISABLED;
        agents.push(a);
    }
}

function applyOccupancy() {
    for (let i = 0; i < agents.length; i++) {
        const a = agents[i];
        if (i < targetOccupancy) {
            if (a.state === STATE.DISABLED) {
                a.state = STATE.AWAY;
                // Re-arm arrival
                a.arrivalTime = clock.simMinute + Math.floor(Math.random() * 6);
            }
        } else {
            // Move to disabled; let in-progress finish naturally
            if (a.state === STATE.AWAY) {
                a.state = STATE.DISABLED;
            }
        }
    }
}

function countPresent() {
    let n = 0;
    for (const a of agents) {
        if (a.state !== STATE.DISABLED && a.state !== STATE.GONE) n += 1;
    }
    return n;
}

function topUpVisitors() {
    if (clock.simMinute < 7.5 * 60 || clock.simMinute > 19.5 * 60) return;
    const present = countPresent();
    const deficit = targetOccupancy - present;
    if (deficit <= 0) return;
    let armed = 0;
    for (const a of agents) {
        if (armed >= deficit) break;
        if (a.role === ROLE.VISITOR && (a.state === STATE.AWAY || a.state === STATE.GONE)) {
            if (a.state === STATE.GONE) {
                // Re-init this visitor
                newAgentSchedule(a);
                a.arrivalTime = clock.simMinute + Math.floor(Math.random() * 6);
                a.state = STATE.AWAY;
            } else if (a.arrivalTime < clock.simMinute - 60) {
                // Stale away - re-arm
                a.arrivalTime = clock.simMinute + Math.floor(Math.random() * 6);
            }
            armed += 1;
        }
    }
}

function dayWrap() {
    // Reset all agents and the elevator
    elevator.reset();
    seatReservations.clear();
    for (const a of agents) {
        if (a.state !== STATE.DISABLED) {
            newAgentSchedule(a);
            a.state = STATE.AWAY;
            a.arrivalTime = clock.simMinute + Math.random() * 6;
            a.plan = [];
            a.currentAction = null;
        }
    }
}

// =================== Person creation hook ===================
function createAgentGroup(agent) {
    if (agent.group) return;
    const g = createPerson({});
    agent.group = g;
    g.userData.agent = agent;
}

function attachAgentToScene(agent, parent, x, y, z) {
    if (!agent.group) createAgentGroup(agent);
    if (agent.group.parent) agent.group.parent.remove(agent.group);
    parent.add(agent.group);
    agent.group.position.set(x, y, z);
    agent.bodyY = y;
}

function detachAgent(agent) {
    if (agent.group && agent.group.parent) {
        agent.group.parent.remove(agent.group);
    }
}

// =================== Navigation helpers ===================
function getNodeForAgent(agent) {
    // Find the closest waypoint to the agent's current position
    const x = agent.group.position.x;
    const z = agent.group.position.z;
    const floor = currentFloorOfAgent(agent);
    const nodes = world.floors[floor].nodes;
    let best = null;
    let bestD = Infinity;
    for (const name in nodes) {
        const n = nodes[name];
        const d = (n.x - x) * (n.x - x) + (n.z - z) * (n.z - z);
        if (d < bestD) { bestD = d; best = name; }
    }
    return best;
}

function currentFloorOfAgent(agent) {
    if (agent.state === STATE.IN_CAR) {
        return elevator.currentFloor;
    }
    return Math.round(agent.group.position.y / FLOOR_HEIGHT);
}

// =================== Plan compilers ===================

function planArriveToDesk(agent) {
    const wp = agent.deskWpName;
    const doorWp = agent.deskDoorWpName;
    return [
        { type: "WALK_TO_WP", floor: 0, wpName: "front_door_threshold" },
        { type: "WALK_TO_WP", floor: 0, wpName: "entrance" },
        { type: "WALK_TO_WP", floor: 0, wpName: "lobby_center" },
        { type: "WAIT_AT_PANEL", floor: 0, dir: 1, toFloor: agent.homeFloor },
        { type: "ENTER_ELEVATOR", toFloor: agent.homeFloor },
        { type: "PRESS_FLOOR", floor: agent.homeFloor },
        { type: "WAIT_FOR_FLOOR", floor: agent.homeFloor },
        { type: "EXIT_ELEVATOR", toFloor: agent.homeFloor },
        { type: "WALK_TO_WP", floor: agent.homeFloor, wpName: doorWp },
        { type: "WALK_TO_WP", floor: agent.homeFloor, wpName: wp },
        { type: "SIT", floor: agent.homeFloor, wpName: wp },
        { type: "WAIT_SIM", minutes: 18 + Math.random() * 47 },
        { type: "STAND" },
        { type: "PICK_NEXT_ACTIVITY" },
    ];
}

function planGoToLunch(agent) {
    const wp = agent.deskWpName;
    const doorWp = agent.deskDoorWpName;
    // Pick a random bistro chair
    const chairId = Math.floor(Math.random() * 6);
    const chairWp = "cafe_chair" + (chairId < 3 ? chairId : (chairId - 3)) + (chairId < 3 ? "" : "b");
    const chairWpFixed = ["cafe_chair0", "cafe_chair0b", "cafe_chair1", "cafe_chair1b", "cafe_chair2", "cafe_chair2b"][chairId];
    return [
        { type: "STAND" },
        { type: "WALK_TO_WP", floor: agent.homeFloor, wpName: doorWp },
        { type: "WAIT_AT_PANEL", floor: agent.homeFloor, dir: -1, toFloor: 0 },
        { type: "ENTER_ELEVATOR", toFloor: 0 },
        { type: "PRESS_FLOOR", floor: 0 },
        { type: "WAIT_FOR_FLOOR", floor: 0 },
        { type: "EXIT_ELEVATOR", toFloor: 0 },
        { type: "WALK_TO_WP", floor: 0, wpName: "lobby_center" },
        { type: "WALK_TO_WP", floor: 0, wpName: "cafe_door" },
        { type: "WALK_TO_WP", floor: 0, wpName: chairWpFixed },
        { type: "SIT", floor: 0, wpName: chairWpFixed },
        { type: "WAIT_SIM", minutes: agent.lunchDuration },
        { type: "MARK_LUNCHED" },
        { type: "STAND" },
        { type: "WALK_TO_WP", floor: 0, wpName: "cafe_door" },
        { type: "WALK_TO_WP", floor: 0, wpName: "lobby_center" },
        { type: "WAIT_AT_PANEL", floor: 0, dir: 1, toFloor: agent.homeFloor },
        { type: "ENTER_ELEVATOR", toFloor: agent.homeFloor },
        { type: "PRESS_FLOOR", floor: agent.homeFloor },
        { type: "WAIT_FOR_FLOOR", floor: agent.homeFloor },
        { type: "EXIT_ELEVATOR", toFloor: agent.homeFloor },
        { type: "WALK_TO_WP", floor: agent.homeFloor, wpName: doorWp },
        { type: "WALK_TO_WP", floor: agent.homeFloor, wpName: wp },
        { type: "SIT", floor: agent.homeFloor, wpName: wp },
        { type: "WAIT_SIM", minutes: 18 + Math.random() * 47 },
        { type: "STAND" },
        { type: "PICK_NEXT_ACTIVITY" },
    ];
}

function planVisitLounge(agent) {
    const wp = agent.deskWpName;
    const doorWp = agent.deskDoorWpName;
    const dur = 5 + Math.random() * 7;
    const spotId = Math.floor(Math.random() * 3);
    const spotWp = "lounge_spot" + spotId;
    return [
        { type: "STAND" },
        { type: "WALK_TO_WP", floor: agent.homeFloor, wpName: doorWp },
        { type: "WALK_TO_WP", floor: agent.homeFloor, wpName: "lounge_door" },
        { type: "WALK_TO_WP", floor: agent.homeFloor, wpName: spotWp },
        { type: "SIT", floor: agent.homeFloor, wpName: spotWp },
        { type: "WAIT_SIM", minutes: dur },
        { type: "STAND" },
        { type: "RELEASE_SEAT" },
        { type: "WALK_TO_WP", floor: agent.homeFloor, wpName: "lounge_door" },
        { type: "WALK_TO_WP", floor: agent.homeFloor, wpName: doorWp },
        { type: "WALK_TO_WP", floor: agent.homeFloor, wpName: wp },
        { type: "SIT", floor: agent.homeFloor, wpName: wp },
        { type: "WAIT_SIM", minutes: 18 + Math.random() * 47 },
        { type: "STAND" },
        { type: "PICK_NEXT_ACTIVITY" },
    ];
}

function planAttendMeeting(agent) {
    // 65% home floor, else random
    let meetingFloor;
    if (Math.random() < 0.65) meetingFloor = agent.homeFloor;
    else meetingFloor = 1 + Math.floor(Math.random() * (FLOOR_COUNT - 1));
    const dur = 22 + Math.random() * 23;
    // Pick the first available seat on the meeting floor
    const seatId = pickFreeConfSeat(meetingFloor);
    if (seatId === -1) {
        // Fallback to lounge
        return planVisitLounge(agent);
    }
    const seatWp = "conf_seat" + seatId;
    const doorWp = agent.deskDoorWpName;
    return [
        { type: "STAND" },
        { type: "WALK_TO_WP", floor: agent.homeFloor, wpName: doorWp },
        { type: "WAIT_AT_PANEL", floor: agent.homeFloor, dir: meetingFloor > agent.homeFloor ? 1 : -1, toFloor: meetingFloor },
        { type: "ENTER_ELEVATOR", toFloor: meetingFloor },
        { type: "PRESS_FLOOR", floor: meetingFloor },
        { type: "WAIT_FOR_FLOOR", floor: meetingFloor },
        { type: "EXIT_ELEVATOR", toFloor: meetingFloor },
        { type: "WALK_TO_WP", floor: meetingFloor, wpName: "conf_door" },
        { type: "WALK_TO_WP", floor: meetingFloor, wpName: "conf_center" },
        { type: "WALK_TO_WP", floor: meetingFloor, wpName: seatWp },
        { type: "SIT", floor: meetingFloor, wpName: seatWp },
        { type: "WAIT_SIM", minutes: dur },
        { type: "STAND" },
        { type: "RELEASE_SEAT" },
        { type: "WALK_TO_WP", floor: meetingFloor, wpName: "conf_door" },
        { type: "WAIT_AT_PANEL", floor: meetingFloor, dir: meetingFloor > agent.homeFloor ? -1 : 1, toFloor: agent.homeFloor },
        { type: "ENTER_ELEVATOR", toFloor: agent.homeFloor },
        { type: "PRESS_FLOOR", floor: agent.homeFloor },
        { type: "WAIT_FOR_FLOOR", floor: agent.homeFloor },
        { type: "EXIT_ELEVATOR", toFloor: agent.homeFloor },
        { type: "WALK_TO_WP", floor: agent.homeFloor, wpName: doorWp },
        { type: "WALK_TO_WP", floor: agent.homeFloor, wpName: agent.deskWpName },
        { type: "SIT", floor: agent.homeFloor, wpName: agent.deskWpName },
        { type: "WAIT_SIM", minutes: 18 + Math.random() * 47 },
        { type: "STAND" },
        { type: "PICK_NEXT_ACTIVITY" },
    ];
}

function planVisitCoworker(agent) {
    // Pick a random AT_DESK agent (worker)
    const candidates = agents.filter(function (a) {
        return a.role === ROLE.WORKER && a.id !== agent.id && a.state === STATE.AT_DESK;
    });
    if (candidates.length === 0) {
        // fallback: just keep working
        return [
            { type: "STAND" },
            { type: "SIT", floor: agent.homeFloor, wpName: agent.deskWpName },
            { type: "WAIT_SIM", minutes: 15 + Math.random() * 20 },
            { type: "STAND" },
            { type: "PICK_NEXT_ACTIVITY" },
        ];
    }
    const target = candidates[Math.floor(Math.random() * candidates.length)];
    const dur = 6 + Math.random() * 12;
    const standWp = target.deskDoorWpName;
    return [
        { type: "STAND" },
        { type: "WALK_TO_WP", floor: agent.homeFloor, wpName: standWp },
        { type: "WAIT_SIM", minutes: dur },
        { type: "WALK_TO_WP", floor: agent.homeFloor, wpName: agent.deskDoorWpName },
        { type: "WALK_TO_WP", floor: agent.homeFloor, wpName: agent.deskWpName },
        { type: "SIT", floor: agent.homeFloor, wpName: agent.deskWpName },
        { type: "WAIT_SIM", minutes: 18 + Math.random() * 47 },
        { type: "STAND" },
        { type: "PICK_NEXT_ACTIVITY" },
    ];
}

function planLeaveBuilding(agent) {
    return [
        { type: "STAND" },
        { type: "WALK_TO_WP", floor: agent.homeFloor, wpName: agent.deskDoorWpName },
        { type: "WAIT_AT_PANEL", floor: agent.homeFloor, dir: -1, toFloor: 0 },
        { type: "ENTER_ELEVATOR", toFloor: 0 },
        { type: "PRESS_FLOOR", floor: 0 },
        { type: "WAIT_FOR_FLOOR", floor: 0 },
        { type: "EXIT_ELEVATOR", toFloor: 0 },
        { type: "WALK_TO_WP", floor: 0, wpName: "lobby_center" },
        { type: "WALK_TO_WP", floor: 0, wpName: "entrance" },
        { type: "WALK_TO_WP", floor: 0, wpName: "front_door_threshold" },
        { type: "WALK_TO_WP", floor: 0, wpName: "outside" },
        { type: "EXIT_BUILDING" },
    ];
}

function planVisitorVisit(agent) {
    // Weighted random pick
    const r = Math.random();
    let subPlan;
    if (r < 0.10) {
        // Bistro table
        const chairId = Math.floor(Math.random() * 6);
        const chairWpFixed = ["cafe_chair0", "cafe_chair0b", "cafe_chair1", "cafe_chair1b", "cafe_chair2", "cafe_chair2b"][chairId];
        subPlan = [
            { type: "WALK_TO_WP", floor: 0, wpName: "lobby_center" },
            { type: "WALK_TO_WP", floor: 0, wpName: "cafe_door" },
            { type: "WALK_TO_WP", floor: 0, wpName: chairWpFixed },
            { type: "SIT", floor: 0, wpName: chairWpFixed },
            { type: "WAIT_SIM", minutes: 8 + Math.random() * 12 },
            { type: "STAND" },
        ];
    } else if (r < 0.16) {
        // Cafe counter
        subPlan = [
            { type: "WALK_TO_WP", floor: 0, wpName: "lobby_center" },
            { type: "WALK_TO_WP", floor: 0, wpName: "cafe_door" },
            { type: "WALK_TO_WP", floor: 0, wpName: "cafe_order" },
            { type: "WAIT_SIM", minutes: 3 + Math.random() * 5 },
        ];
    } else if (r < 0.30) {
        // Front lounge
        const sp = Math.floor(Math.random() * 3);
        subPlan = [
            { type: "WALK_TO_WP", floor: 0, wpName: "lobby_center" },
            { type: "WALK_TO_WP", floor: 0, wpName: "lounge_spot" + sp },
            { type: "SIT", floor: 0, wpName: "lounge_spot" + sp },
            { type: "WAIT_SIM", minutes: 8 + Math.random() * 15 },
            { type: "STAND" },
        ];
    } else if (r < 0.42) {
        // Back lounge or pit
        const sp = Math.random() < 0.5 ? "back_lounge_N" : "pit_S";
        subPlan = [
            { type: "WALK_TO_WP", floor: 0, wpName: "lobby_center" },
            { type: "WALK_TO_WP", floor: 0, wpName: sp },
            { type: "SIT", floor: 0, wpName: sp },
            { type: "WAIT_SIM", minutes: 8 + Math.random() * 15 },
            { type: "STAND" },
        ];
    } else if (r < 0.52) {
        // Reception / kiosk / water cooler
        const wps = ["reception", "kiosk", "lobby_wc_front", "lobby_wc_back"];
        const wp = wps[Math.floor(Math.random() * wps.length)];
        subPlan = [
            { type: "WALK_TO_WP", floor: 0, wpName: "lobby_center" },
            { type: "WALK_TO_WP", floor: 0, wpName: wp },
            { type: "WAIT_SIM", minutes: 3 + Math.random() * 6 },
        ];
    } else if (r < 0.62) {
        // Lobby loiter
        const wps = ["lobby_stand_center", "lobby_stand_NE", "lobby_stand_NW", "lobby_stand_midE", "lobby_stand_midW", "lobby_stand_entry"];
        const wp = wps[Math.floor(Math.random() * wps.length)];
        subPlan = [
            { type: "WALK_TO_WP", floor: 0, wpName: "lobby_center" },
            { type: "WALK_TO_WP", floor: 0, wpName: wp },
            { type: "WAIT_SIM", minutes: 5 + Math.random() * 10 },
        ];
    } else if (r < 0.77) {
        // Ride up to office floor lounge
        const f = 1 + Math.floor(Math.random() * (FLOOR_COUNT - 1));
        subPlan = [
            { type: "WALK_TO_WP", floor: 0, wpName: "lobby_center" },
            { type: "WAIT_AT_PANEL", floor: 0, dir: 1, toFloor: f },
            { type: "ENTER_ELEVATOR", toFloor: f },
            { type: "PRESS_FLOOR", floor: f },
            { type: "WAIT_FOR_FLOOR", floor: f },
            { type: "EXIT_ELEVATOR", toFloor: f },
            { type: "WALK_TO_WP", floor: f, wpName: "lounge_door" },
            { type: "WALK_TO_WP", floor: f, wpName: "lounge_spot" + Math.floor(Math.random() * 3) },
            { type: "SIT", floor: f, wpName: "lounge_spot0" },
            { type: "WAIT_SIM", minutes: 5 + Math.random() * 8 },
            { type: "STAND" },
            { type: "WAIT_AT_PANEL", floor: f, dir: -1, toFloor: 0 },
            { type: "ENTER_ELEVATOR", toFloor: 0 },
            { type: "PRESS_FLOOR", floor: 0 },
            { type: "WAIT_FOR_FLOOR", floor: 0 },
            { type: "EXIT_ELEVATOR", toFloor: 0 },
        ];
    } else {
        // Sit in on a meeting
        const f = 1 + Math.floor(Math.random() * (FLOOR_COUNT - 1));
        const seatId = pickFreeConfSeat(f);
        if (seatId === -1) {
            // Fallback to lounge
            const sp = Math.floor(Math.random() * 3);
            subPlan = [
                { type: "WALK_TO_WP", floor: 0, wpName: "lobby_center" },
                { type: "WALK_TO_WP", floor: 0, wpName: "lounge_spot" + sp },
                { type: "SIT", floor: 0, wpName: "lounge_spot" + sp },
                { type: "WAIT_SIM", minutes: 6 + Math.random() * 10 },
                { type: "STAND" },
            ];
        } else {
            const seatWp = "conf_seat" + seatId;
            const dur = 18 + Math.random() * 25;
            subPlan = [
                { type: "WALK_TO_WP", floor: 0, wpName: "lobby_center" },
                { type: "WAIT_AT_PANEL", floor: 0, dir: 1, toFloor: f },
                { type: "ENTER_ELEVATOR", toFloor: f },
                { type: "PRESS_FLOOR", floor: f },
                { type: "WAIT_FOR_FLOOR", floor: f },
                { type: "EXIT_ELEVATOR", toFloor: f },
                { type: "WALK_TO_WP", floor: f, wpName: "conf_door" },
                { type: "WALK_TO_WP", floor: f, wpName: "conf_center" },
                { type: "WALK_TO_WP", floor: f, wpName: seatWp },
                { type: "SIT", floor: f, wpName: seatWp },
                { type: "WAIT_SIM", minutes: dur },
                { type: "STAND" },
                { type: "RELEASE_SEAT" },
                { type: "WALK_TO_WP", floor: f, wpName: "conf_door" },
                { type: "WAIT_AT_PANEL", floor: f, dir: -1, toFloor: 0 },
                { type: "ENTER_ELEVATOR", toFloor: 0 },
                { type: "PRESS_FLOOR", floor: 0 },
                { type: "WAIT_FOR_FLOOR", floor: 0 },
                { type: "EXIT_ELEVATOR", toFloor: 0 },
            ];
        }
    }
    // Tail: walk out
    return subPlan.concat([
        { type: "WALK_TO_WP", floor: 0, wpName: "lobby_center" },
        { type: "WALK_TO_WP", floor: 0, wpName: "entrance" },
        { type: "WALK_TO_WP", floor: 0, wpName: "front_door_threshold" },
        { type: "WALK_TO_WP", floor: 0, wpName: "outside" },
        { type: "EXIT_BUILDING" },
    ]);
}

function pickFreeConfSeat(floor) {
    for (let i = 0; i < 4; i++) {
        const k = floor + ":conf_seat" + i;
        if (!seatReservations.has(k)) return i;
    }
    return -1;
}

function reserveSeatKey(floor, wpName) {
    return floor + ":" + wpName;
}

function chooseNextActivity(agent) {
    if (agent.role === ROLE.VISITOR) {
        return planVisitorVisit(agent);
    }
    // Worker
    if (clock.simMinute >= agent.departureTime) {
        return planLeaveBuilding(agent);
    }
    // Planned meeting?
    if (agent.plannedMeetingTimes && agent.plannedMeetingTimes.length > 0) {
        const next = agent.plannedMeetingTimes[0];
        if (clock.simMinute >= next) {
            agent.plannedMeetingTimes.shift();
            return planAttendMeeting(agent);
        }
    }
    // Lunch window
    const lunchEnd = agent.lunchTime + 90;
    if (!agent.hasLunched && clock.simMinute >= agent.lunchTime && clock.simMinute < lunchEnd) {
        return planGoToLunch(agent);
    }
    // Random weighted
    const r = Math.random();
    const MEETING_PROB = 0.36 * 0.4; // ~14.4%
    if (r < MEETING_PROB) {
        return planAttendMeeting(agent);
    } else if (r < MEETING_PROB + 0.12) {
        return planVisitLounge(agent);
    } else if (r < MEETING_PROB + 0.12 + 0.15) {
        return planVisitCoworker(agent);
    } else {
        const wait = 18 + Math.random() * 47;
        return [
            { type: "STAND" },
            { type: "SIT", floor: agent.homeFloor, wpName: agent.deskWpName },
            { type: "WAIT_SIM", minutes: wait },
            { type: "STAND" },
            { type: "PICK_NEXT_ACTIVITY" },
        ];
    }
}

// =================== Action dispatch ===================

function startAction(agent, action) {
    agent.currentAction = action;
    agent._actStarted = clock.simMinute;
    agent._actData = {};

    switch (action.type) {
        case "WALK_TO_WP": {
            // Plan a path from current position to target waypoint on the given floor
            const floor = action.floor;
            if (currentFloorOfAgent(agent) !== floor && agent.state !== STATE.IN_CAR) {
                // Wrong floor - skip (this is a bug; advance to next action)
                agent.currentAction = null;
                return false;
            }
            const targetNode = world.floors[floor].nodes[action.wpName];
            if (!targetNode) {
                agent.currentAction = null;
                return false;
            }
            const startName = getNodeForAgent(agent);
            const path = world.bfsPath(world.floors[floor].nodes, startName, action.wpName);
            if (!path || path.length === 0) {
                agent.currentAction = null;
                return false;
            }
            agent._actData.path = path;
            agent._actData.pathIdx = 0;
            agent._actData.targetFloor = floor;
            agent._actData.stallT = 0;
            agent._actData.prevPos = new THREE.Vector3().copy(agent.group.position);
            agent.isWalking = true;
            return true;
        }
        case "WAIT_AT_PANEL": {
            agent._actData.toFloor = action.toFloor;
            // Move to the elevWait node on this floor
            const waitNode = world.floors[action.floor].nodes["elevWait"];
            if (waitNode) {
                agent.group.position.x = waitNode.x;
                agent.group.position.z = waitNode.z;
                agent.group.position.y = action.floor * FLOOR_HEIGHT;
            }
            agent.isWalking = false;
            // Press the call
            if (action.dir > 0) elevator.callUp(action.floor);
            else elevator.callDown(action.floor);
            agent.state = STATE.WAITING_ELEVATOR;
            return true;
        }
        case "ENTER_ELEVATOR": {
            const dir = action.toFloor > action.floor ? 1 : -1;
            agent._actData.toFloor = action.toFloor;
            agent._actData.dir = dir;
            agent._actData.phase = "walk-to-door";
            // Compute door threshold position in world space
            const floorY = elevator.currentFloor * FLOOR_HEIGHT;
            const thresholdZ = 1.55;
            agent._actData.threshold = new THREE.Vector3(0, floorY, thresholdZ);
            agent._actData.stallT = 0;
            agent._actData.prevPos = new THREE.Vector3().copy(agent.group.position);
            agent.isWalking = true;
            return true;
        }
        case "PRESS_FLOOR": {
            elevator.pressDestination(action.floor);
            agent.isWalking = false;
            return true;
        }
        case "WAIT_FOR_FLOOR": {
            agent._actData.toFloor = action.floor;
            agent.isWalking = false;
            return true;
        }
        case "EXIT_ELEVATOR": {
            agent._actData.toFloor = action.toFloor;
            agent._actData.phase = "walk-to-elevwait";
            elevator.registerDisembark(agent);
            const floorY = elevator.currentFloor * FLOOR_HEIGHT;
            const elevWaitNode = world.floors[elevator.currentFloor].nodes["elevWait"];
            if (elevWaitNode) {
                agent._actData.targetPos = new THREE.Vector3(elevWaitNode.x, floorY, elevWaitNode.z);
            } else {
                agent._actData.targetPos = new THREE.Vector3(0, floorY, 1.6);
            }
            agent.isWalking = true;
            return true;
        }
        case "SIT": {
            const sit = world.floors[action.floor].sitTargets[action.wpName];
            if (sit) {
                // Reserve seat if not already reserved
                const seatKey = reserveSeatKey(action.floor, action.wpName);
                if (!seatReservations.has(seatKey)) {
                    seatReservations.add(seatKey);
                    agent._actData.seatReserved = true;
                } else {
                    agent._actData.seatReserved = false;
                }
                let pos = sit.sitPos;
                let useX = pos.x, useZ = pos.z;
                // Jitter if standing waypoint
                if (!sit.sit) {
                    const ang = Math.random() * Math.PI * 2;
                    const r = 0.35 + Math.random() * 0.4;
                    useX += Math.cos(ang) * r;
                    useZ += Math.sin(ang) * r;
                } else {
                    // Small jitter for sit so two visitors don't snap identically
                    useX += (Math.random() - 0.5) * 0.1;
                    useZ += (Math.random() - 0.5) * 0.1;
                }
                agent.group.position.x = useX;
                agent.group.position.z = useZ;
                agent.group.position.y = action.floor * FLOOR_HEIGHT;
                agent.group.rotation.y = sit.facing;
                // Lower body for sitting
                agent.group.position.y = action.floor * FLOOR_HEIGHT - 0.35;
                agent.isSitting = true;
                agent.isWalking = false;
            }
            return true;
        }
        case "STAND": {
            // Don't release seat here; explicit RELEASE_SEAT handles it.
            if (agent.isSitting) {
                agent.isSitting = false;
                // Restore y to floor level
                if (agent.state === STATE.IN_CAR) {
                    agent.group.position.y = elevator.currentFloor * FLOOR_HEIGHT;
                } else {
                    agent.group.position.y = Math.round(agent.group.position.y / FLOOR_HEIGHT) * FLOOR_HEIGHT;
                }
            }
            return true;
        }
        case "RELEASE_SEAT": {
            // Release any seat reservation for this agent
            const toRemove = [];
            seatReservations.forEach(function (k) { toRemove.push(k); });
            // We don't track agent->seat directly; use the agent's _actData
            if (agent._lastSeatKey) {
                seatReservations.delete(agent._lastSeatKey);
                agent._lastSeatKey = null;
            }
            return true;
        }
        case "WAIT_SIM": {
            agent._actData.untilMin = clock.simMinute + action.minutes;
            agent.isWalking = false;
            return true;
        }
        case "EXIT_BUILDING": {
            detachAgent(agent);
            agent.state = STATE.GONE;
            agent.isWalking = false;
            return true;
        }
        case "ENTER_STATE": {
            agent.state = action.state;
            return true;
        }
        case "MARK_LUNCHED": {
            agent.hasLunched = true;
            return true;
        }
        case "PICK_NEXT_ACTIVITY": {
            agent.plan = chooseNextActivity(agent);
            agent.currentAction = null;
            return true;
        }
    }
    return false;
}

function tickAction(agent, motionDt) {
    const a = agent.currentAction;
    if (!a) return;
    const speed = 1.3; // m/s

    switch (a.type) {
        case "WALK_TO_WP": {
            if (agent.state === STATE.IN_CAR) {
                agent.currentAction = null;
                return;
            }
            const path = agent._actData.path;
            if (!path) {
                agent.currentAction = null;
                return;
            }
            // Make sure agent is on the right floor
            const curFloor = Math.round(agent.group.position.y / FLOOR_HEIGHT);
            if (curFloor !== a.floor) {
                agent.group.position.y = a.floor * FLOOR_HEIGHT;
            }
            if (agent._actData.pathIdx >= path.length) {
                agent.currentAction = null;
                agent.isWalking = false;
                return;
            }
            const targetWp = path[agent._actData.pathIdx];
            const dx = targetWp.x - agent.group.position.x;
            const dz = targetWp.z - agent.group.position.z;
            const dist = Math.hypot(dx, dz);
            const step = speed * motionDt;
            if (dist < 0.1 || step >= dist) {
                agent.group.position.x = targetWp.x;
                agent.group.position.z = targetWp.z;
                agent._actData.pathIdx += 1;
                agent._actData.stallT = 0;
                return;
            }
            // Stall recovery
            const moved = Math.hypot(agent.group.position.x - agent._actData.prevPos.x, agent.group.position.z - agent._actData.prevPos.z);
            if (moved < 0.005) {
                agent._actData.stallT += motionDt;
                if (agent._actData.stallT > 1.2) {
                    // Skip waypoint
                    agent._actData.pathIdx += 1;
                    agent._actData.stallT = 0;
                }
            } else {
                agent._actData.stallT = 0;
            }
            agent._actData.prevPos.x = agent.group.position.x;
            agent._actData.prevPos.z = agent.group.position.z;
            // Walk
            const ux = dx / dist, uz = dz / dist;
            agent.group.position.x += ux * step;
            agent.group.position.z += uz * step;
            // Face direction of travel
            agent.group.rotation.y = Math.atan2(ux, uz);
            agent.isWalking = true;
            return;
        }
        case "WAIT_AT_PANEL": {
            // Re-press the call every frame
            if (a.dir > 0) elevator.callUp(a.floor);
            else elevator.callDown(a.floor);
            const dir = a.dir;
            const floor = a.floor;
            if (elevator.state === "DOOR_OPEN" && elevator.currentFloor === floor) {
                if (elevator.isAcceptingAt(floor, dir) && elevator.currentCapacityFree() > 0) {
                    agent.currentAction = null;
                    agent.state = STATE.ON_FLOOR;
                }
            }
            return;
        }
        case "ENTER_ELEVATOR": {
            const dir = a.dir;
            const toFloor = a.toFloor;
            // Press call if the car has slipped away
            if (a.phase === "walk-to-door" || a.phase === "reserve") {
                if (a.dir > 0) elevator.callUp(elevator.currentFloor);
                else elevator.callDown(elevator.currentFloor);
            }
            if (a.phase === "walk-to-door") {
                if (elevator.state !== "DOOR_OPEN" || elevator.currentFloor !== Math.round(agent.group.position.y / FLOOR_HEIGHT)) {
                    // Car not here, wait
                    agent.isWalking = false;
                    return;
                }
                // Reserve a spot
                const spot = elevator.reserveBoardingSpot(agent);
                if (!spot) {
                    // Wait - car is full
                    agent.isWalking = false;
                    return;
                }
                a.spotWorld = spot.worldPos || new THREE.Vector3(spot.x, 0, spot.z);
                a.phase = "approach";
                agent.isWalking = true;
                return;
            }
            if (a.phase === "approach" || a.phase === "walk-to-spot") {
                // Walk to threshold, then into the car to the spot
                if (a.phase === "approach") {
                    // Walk to threshold at door center y
                    const t = a.threshold;
                    const dx = t.x - agent.group.position.x;
                    const dz = t.z - agent.group.position.z;
                    const dist = Math.hypot(dx, dz);
                    if (dist < 0.1) {
                        a.phase = "walk-to-spot";
                    } else {
                        const step = speed * motionDt;
                        agent.group.position.x += (dx / dist) * Math.min(step, dist);
                        agent.group.position.z += (dz / dist) * Math.min(step, dist);
                        agent.group.rotation.y = Math.atan2(dx / dist, dz / dist);
                        agent.isWalking = true;
                    }
                    // Stall check
                    const moved = Math.hypot(agent.group.position.x - agent._actData.prevPos.x, agent.group.position.z - agent._actData.prevPos.z);
                    if (moved < 0.005) {
                        agent._actData.stallT += motionDt;
                        if (agent._actData.stallT > 1.5) {
                            // Force advance
                            agent.group.position.x = t.x;
                            agent.group.position.z = t.z;
                            a.phase = "walk-to-spot";
                        }
                    } else {
                        agent._actData.stallT = 0;
                    }
                    agent._actData.prevPos.x = agent.group.position.x;
                    agent._actData.prevPos.z = agent.group.position.z;
                    return;
                }
                if (a.phase === "walk-to-spot") {
                    // Reparent to the car
                    const spotWorld = a.spotWorld;
                    // Compute target in car-local space: car is at (0, currentFloor*FH, 0)
                    const carY = elevator.currentFloor * FLOOR_HEIGHT;
                    const targetLocal = new THREE.Vector3(spotWorld.x, 0, spotWorld.z);
                    // Convert to world by adding car position
                    const targetWorld = new THREE.Vector3(spotWorld.x, carY, spotWorld.z);
                    const dx = targetWorld.x - agent.group.position.x;
                    const dz = targetWorld.z - agent.group.position.z;
                    const dist = Math.hypot(dx, dz);
                    if (dist < 0.1) {
                        // Reparent
                        elevator.group.add(agent.group);
                        // Position in car-local space
                        agent.group.position.set(spotWorld.x, 0, spotWorld.z);
                        agent.group.rotation.y = 0;
                        agent.state = STATE.IN_CAR;
                        // Complete boarding
                        elevator.completeBoard(agent, toFloor);
                        agent.currentAction = null;
                        agent.isWalking = false;
                        return;
                    }
                    const step = speed * motionDt;
                    agent.group.position.x += (dx / dist) * Math.min(step, dist);
                    agent.group.position.z += (dz / dist) * Math.min(step, dist);
                    agent.group.rotation.y = Math.atan2(dx / dist, dz / dist);
                    agent.isWalking = true;
                    // Stall check
                    const moved = Math.hypot(agent.group.position.x - agent._actData.prevPos.x, agent.group.position.z - agent._actData.prevPos.z);
                    if (moved < 0.005) {
                        agent._actData.stallT += motionDt;
                        if (agent._actData.stallT > 1.5) {
                            elevator.group.add(agent.group);
                            agent.group.position.set(spotWorld.x, 0, spotWorld.z);
                            agent.group.rotation.y = 0;
                            agent.state = STATE.IN_CAR;
                            elevator.completeBoard(agent, toFloor);
                            agent.currentAction = null;
                            agent.isWalking = false;
                        }
                    } else {
                        agent._actData.stallT = 0;
                    }
                    agent._actData.prevPos.x = agent.group.position.x;
                    agent._actData.prevPos.z = agent.group.position.z;
                    return;
                }
            }
            return;
        }
        case "PRESS_FLOOR": {
            agent.currentAction = null;
            return;
        }
        case "WAIT_FOR_FLOOR": {
            if (elevator.state === "DOOR_OPEN" && elevator.currentFloor === a.toFloor) {
                agent.currentAction = null;
                agent.state = STATE.IN_CAR;
            }
            return;
        }
        case "EXIT_ELEVATOR": {
            const toFloor = a.toFloor;
            if (a.phase === "walk-to-elevwait") {
                // Reparent to scene (preserving world pos)
                if (agent.group.parent !== scene && agent.group.parent !== elevator.group) {
                    // Already in scene? Skip reparenting
                }
                if (agent.group.parent === elevator.group) {
                    const worldPos = new THREE.Vector3();
                    agent.group.getWorldPosition(worldPos);
                    elevator.group.remove(agent.group);
                    scene.add(agent.group);
                    agent.group.position.copy(worldPos);
                }
                // Make sure disembark is registered
                if (!elevator.pendingDisembark.has(agent)) {
                    elevator.registerDisembark(agent);
                }
                const t = a.targetPos;
                const dx = t.x - agent.group.position.x;
                const dz = t.z - agent.group.position.z;
                const dist = Math.hypot(dx, dz);
                if (dist < 0.1) {
                    elevator.completeDisembark(agent);
                    agent.currentAction = null;
                    agent.isWalking = false;
                    return;
                }
                const step = speed * motionDt;
                agent.group.position.x += (dx / dist) * Math.min(step, dist);
                agent.group.position.z += (dz / dist) * Math.min(step, dist);
                agent.group.rotation.y = Math.atan2(dx / dist, dz / dist);
                agent.isWalking = true;
                return;
            }
            return;
        }
        case "SIT": {
            agent.currentAction = null;
            // Remember seat key for release
            agent._lastSeatKey = reserveSeatKey(a.floor, a.wpName);
            return;
        }
        case "STAND": {
            agent.currentAction = null;
            return;
        }
        case "RELEASE_SEAT": {
            agent.currentAction = null;
            return;
        }
        case "WAIT_SIM": {
            if (clock.simMinute >= agent._actData.untilMin) {
                agent.currentAction = null;
            }
            return;
        }
        case "ENTER_STATE": {
            agent.currentAction = null;
            return;
        }
        case "MARK_LUNCHED": {
            agent.currentAction = null;
            return;
        }
        case "PICK_NEXT_ACTIVITY": {
            agent.currentAction = null;
            return;
        }
    }
}

function dispatchAgent(agent) {
    for (let iter = 0; iter < 16; iter++) {
        // If no current action, start next
        if (!agent.currentAction) {
            if (!agent.plan || agent.plan.length === 0) {
                agent.plan = chooseNextActivity(agent);
            }
            if (agent.plan.length === 0) return;
            const next = agent.plan.shift();
            const ok = startAction(agent, next);
            if (!ok) {
                continue;
            }
        }
        // Process the action; many are zero-duration and will set currentAction = null
        tickAction(agent, 0);
        if (agent.currentAction) {
            // Real-time action in progress; break out
            return;
        }
    }
}

// =================== Collision resolution ===================
function applyCollisions() {
    // Group agents by parent
    const groups = new Map();
    for (const a of agents) {
        if (!a.group || !a.group.parent) continue;
        if (a.isSitting) continue;
        if (a.state === STATE.IN_CAR) continue;
        // Skip agents in ENTER_ELEVATOR
        if (a.currentAction && a.currentAction.type === "ENTER_ELEVATOR") continue;
        const p = a.group.parent;
        if (!groups.has(p)) groups.set(p, []);
        groups.get(p).push(a);
    }
    for (const list of groups.values()) {
        const n = list.length;
        for (let i = 0; i < n; i++) {
            const ai = list[i];
            for (let j = i + 1; j < n; j++) {
                const aj = list[j];
                if (Math.abs(ai.group.position.y - aj.group.position.y) > 1.0) continue;
                const dx = aj.group.position.x - ai.group.position.x;
                const dz = aj.group.position.z - ai.group.position.z;
                let dist = Math.hypot(dx, dz);
                if (dist < 0.0001) {
                    // Random separation direction
                    const ang = Math.random() * Math.PI * 2;
                    const push = 0.18;
                    ai.group.position.x -= Math.cos(ang) * push;
                    ai.group.position.z -= Math.sin(ang) * push;
                    aj.group.position.x += Math.cos(ang) * push;
                    aj.group.position.z += Math.sin(ang) * push;
                    continue;
                }
                if (dist < 0.7) {
                    const overlap = 0.7 - dist;
                    const push = 0.18;
                    const ux = dx / dist;
                    const uz = dz / dist;
                    ai.group.position.x -= ux * push * (overlap / 0.7);
                    ai.group.position.z -= uz * push * (overlap / 0.7);
                    aj.group.position.x += ux * push * (overlap / 0.7);
                    aj.group.position.z += uz * push * (overlap / 0.7);
                }
            }
        }
    }
}

// =================== Per-agent update ===================
function updateAgents(motionDt) {
    for (const a of agents) {
        if (a.state === STATE.DISABLED) continue;
        if (a.state === STATE.GONE) {
            // Try to re-arm
            if (a.role === ROLE.VISITOR) {
                // topUpVisitors will handle
            }
            continue;
        }
        // Spawn from AWAY
        if (a.state === STATE.AWAY) {
            if (clock.simMinute >= a.arrivalTime) {
                // Spawn on the sidewalk
                attachAgentToScene(a, scene, (Math.random() - 0.5) * 2.2, 0.05, 12.0);
                a.state = STATE.ARRIVING;
                a.plan = planArriveToDesk(a);
                a.currentAction = null;
            } else {
                continue;
            }
        }
        if (a.state === STATE.LEAVING) {
            // For now, also handled by planLeaveBuilding
        }
        // For agents in the car: keep their world position aligned with the car
        if (a.state === STATE.IN_CAR) {
            // Their position is in car-local; car moves, so they're carried
            // Nothing to do here
        }
        dispatchAgent(a);
        // Animate person
        if (a.group && a.group.parent) {
            animatePersonWalking(a.group, motionDt);
        }
    }
}

// =================== HUD ===================
function setupHUD() {
    hud = document.createElement("div");
    hud.id = "hud";
    document.body.appendChild(hud);
    hud.innerHTML = `
        <h1>Office Simulation</h1>
        <div class="clock" id="hud-clock">7:30 AM</div>
        <div class="row">
            <label>Speed</label>
            <input type="range" id="hud-speed" min="0" max="100" value="60">
            <div class="val" id="hud-speed-val">120x</div>
        </div>
        <div class="row">
            <label>Occupancy</label>
            <input type="range" id="hud-occ" min="1" max="100" value="45">
            <div class="val" id="hud-occ-val">45 / 100</div>
        </div>
        <div class="info" id="hud-info"></div>
    `;
    const speedSlider = document.getElementById("hud-speed");
    const occSlider = document.getElementById("hud-occ");
    function updateSpeed() {
        // Log-spaced 1..600
        const t = parseInt(speedSlider.value, 10) / 100;
        const v = Math.round(Math.exp(Math.log(1) + (Math.log(600) - Math.log(1)) * t));
        clock.timeScale = v;
        document.getElementById("hud-speed-val").textContent = v + "x";
    }
    function updateOcc() {
        targetOccupancy = parseInt(occSlider.value, 10);
        document.getElementById("hud-occ-val").textContent = targetOccupancy + " / 100";
        applyOccupancy();
    }
    speedSlider.addEventListener("input", updateSpeed);
    occSlider.addEventListener("input", updateOcc);
    updateSpeed();
    updateOcc();
    // Hint
    const hint = document.createElement("div");
    hint.id = "hint";
    hint.textContent = "Drag to rotate · Scroll to zoom";
    document.body.appendChild(hint);
}

function updateHUD() {
    if (!hud) return;
    const clk = document.getElementById("hud-clock");
    if (clk) clk.textContent = clock.format();
    const info = document.getElementById("hud-info");
    if (!info) return;
    // Count states
    const stateCounts = {};
    for (const a of agents) {
        if (a.state === STATE.DISABLED) continue;
        stateCounts[a.state] = (stateCounts[a.state] || 0) + 1;
    }
    const present = countPresent();
    let html = "<div><span class='label'>Present:</span> " + present + " / " + targetOccupancy + "</div>";
    html += "<div style='margin-top:4px'>";
    for (const s in stateCounts) {
        html += "<span class='pill alive'>" + s + ":" + stateCounts[s] + "</span>";
    }
    html += "</div>";
    html += "<div style='margin-top:6px'><span class='label'>Elevator:</span> floor " + elevator.currentFloor + " (" + elevator.state + ") dir " + elevator.direction + "</div>";
    html += "<div><span class='label'>Pax:</span> " + elevator.passengers.size + " / 4</div>";
    if (elevator.destinations.size > 0) {
        html += "<div><span class='label'>Destinations:</span> ";
        for (const f of elevator.destinations) html += "<span class='pill dest'>" + f + "</span>";
        html += "</div>";
    }
    if (elevator.upCalls.size > 0) {
        html += "<div><span class='label'>Up calls:</span> ";
        for (const f of elevator.upCalls) html += "<span class='pill up'>" + f + "</span>";
        html += "</div>";
    }
    if (elevator.downCalls.size > 0) {
        html += "<div><span class='label'>Down calls:</span> ";
        for (const f of elevator.downCalls) html += "<span class='pill down'>" + f + "</span>";
        html += "</div>";
    }
    info.innerHTML = html;
}

// =================== Render loop ===================
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
    controls.target.set(0, 8, 0);

    ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
    scene.add(ambientLight);
    hemiLight = new THREE.HemisphereLight(0xbfd7ff, 0x303020, 0.45);
    scene.add(hemiLight);
    sun = new THREE.DirectionalLight(0xffffff, 0.9);
    sun.position.set(20, 35, 18);
    scene.add(sun);

    world = createWorld(scene);
    elevator = new Elevator(scene, world);

    // Create agent pool
    createAgentPool();

    // HUD
    setupHUD();

    // Initial state: arm some visitors
    for (let i = 0; i < Math.min(targetOccupancy, agents.length); i++) {
        agents[i].state = STATE.AWAY;
        agents[i].arrivalTime = clock.simMinute + Math.random() * 6;
    }

    // Resize handler
    window.addEventListener("resize", function () {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // Initial day-night
    updateDayNight();

    // Render loop
    function animate() {
        requestAnimationFrame(animate);
        const realDt = Math.min(0.05, clock.getDelta());
        // Tick the sim clock
        clock.tick(realDt);
        const motionDt = realDt * clock.timeScale;
        // Day/night
        updateDayNight();
        // Elevator
        elevator.tick(motionDt);
        // Top up visitors
        topUpVisitors();
        // Agents
        updateAgents(motionDt);
        // Collisions
        applyCollisions();
        controls.update();
        renderer.render(scene, camera);
        updateHUD();
    }
    animate();
}

if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", startSimulation);
} else {
    startSimulation();
}
