// sim.js - simulated clock, day/night lighting, agent schedules, render loop, HUD.
// Classic script - no ES modules. Depends on THREE, WORLD/createWorld, Elevator (all loaded earlier).

const MAX_WORKERS = 20;
const MAX_VISITORS = 80;
const MAX_OCCUPANCY = MAX_WORKERS + MAX_VISITORS;
const DEFAULT_OCCUPANCY = 45;
const WALK_SPEED = 1.3;
const SPEED_STOPS = [1, 2, 4, 8, 16, 30, 60, 90, 120, 180, 240, 360, 480, 600];
const ENTRANCE_CHAIN_SET = new Set(["outside", "front_door_threshold", "entrance"]);
const FIRST_NAMES = [
    "Alex", "Jordan", "Sam", "Taylor", "Morgan", "Casey", "Riley", "Jamie", "Avery", "Quinn",
    "Drew", "Reese", "Skyler", "Rowan", "Hayden", "Emerson", "Finley", "Parker", "Dakota", "Sage",
    "Blair", "Cameron", "Elliot", "Harper", "Kendall",
];

const MEETING_PROB = 0.36 * 0.4;
const LOUNGE_BREAK_PROB = MEETING_PROB + 0.12;
const VISIT_COWORKER_PROB = LOUNGE_BREAK_PROB + 0.15;

const VISITOR_ACTIVITY_TABLE = [
    { weight: 0.10, kind: "bistro" },
    { weight: 0.06, kind: "cafe_counter" },
    { weight: 0.14, kind: "front_lounge" },
    { weight: 0.12, kind: "back_or_pit" },
    { weight: 0.10, kind: "reception_kiosk_wc" },
    { weight: 0.10, kind: "lobby_loiter" },
    { weight: 0.15, kind: "office_lounge" },
    { weight: 0.23, kind: "meeting" },
];

const DAY_KEYFRAMES = [
    { hour: 0, sky: 0x05070d, sun: 0x0a0e1a, sunIntensity: 0.0, ambient: 0.45, hemi: 0.32 },
    { hour: 5, sky: 0x05070d, sun: 0x0a0e1a, sunIntensity: 0.0, ambient: 0.45, hemi: 0.32 },
    { hour: 6, sky: 0x22324a, sun: 0xffa358, sunIntensity: 0.4, ambient: 0.5, hemi: 0.4 },
    { hour: 6.5, sky: 0x9fc7e8, sun: 0xfff1d8, sunIntensity: 0.95, ambient: 0.6, hemi: 0.55 },
    { hour: 12, sky: 0xbfe0f7, sun: 0xffffff, sunIntensity: 1.0, ambient: 0.62, hemi: 0.55 },
    { hour: 17.5, sky: 0x9fc7e8, sun: 0xfff1d8, sunIntensity: 0.95, ambient: 0.6, hemi: 0.55 },
    { hour: 18, sky: 0x4a3a52, sun: 0xff7849, sunIntensity: 0.35, ambient: 0.5, hemi: 0.4 },
    { hour: 18.5, sky: 0x161a2c, sun: 0x0a0e1a, sunIntensity: 0.0, ambient: 0.45, hemi: 0.32 },
    { hour: 24, sky: 0x05070d, sun: 0x0a0e1a, sunIntensity: 0.0, ambient: 0.45, hemi: 0.32 },
];

// ---------------------------------------------------------------------------
// Global mutable state
// ---------------------------------------------------------------------------

let scene;
let camera;
let renderer;
let controls;
let world;
let elevator;
let sunLight;
let ambientLight;
let hemiLight;
let realClock;
let hud;
let agents = [];
let nextAgentId = 0;
let targetOccupancy = DEFAULT_OCCUPANCY;
const seatReservations = new Set();

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function randInt(min, max) {
    return Math.floor(min + Math.random() * (max - min + 1));
}

function randRange(min, max) {
    return min + Math.random() * (max - min);
}

function randMinuteInRange(startH, startM, endH, endM) {
    return randInt(startH * 60 + startM, endH * 60 + endM);
}

function lerpNum(a, b, t) {
    return a + (b - a) * t;
}

function stepToward(group, target, dt, speed) {
    const dx = target.x - group.position.x;
    const dz = target.z - group.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const step = (speed || WALK_SPEED) * dt;
    if (dist <= step || dist < 0.0001) {
        group.position.x = target.x;
        group.position.z = target.z;
        return true;
    }
    group.position.x += (dx / dist) * step;
    group.position.z += (dz / dist) * step;
    group.rotation.y = Math.atan2(dx, dz);
    return false;
}

function defaultSpeedIndex() {
    let idx = 0;
    for (let i = 0; i < SPEED_STOPS.length; i += 1) {
        if (SPEED_STOPS[i] === 120) idx = i;
    }
    return idx;
}

// ---------------------------------------------------------------------------
// Simulated clock
// ---------------------------------------------------------------------------

class SimClock {
    constructor() {
        this.simMinute = 7 * 60 + 30;
        this.timeScale = 120;
    }

    tick(realDt) {
        this.simMinute += (realDt * this.timeScale) / 60;
        if (this.simMinute >= 24 * 60) {
            this.simMinute -= 24 * 60;
            onNewDay();
        }
    }

    format() {
        const totalMinutes = Math.floor(this.simMinute);
        const hour24 = Math.floor(totalMinutes / 60) % 24;
        const minute = totalMinutes % 60;
        const isPM = hour24 >= 12;
        let hour12 = hour24 % 12;
        if (hour12 === 0) hour12 = 12;
        const minuteStr = minute < 10 ? "0" + minute : String(minute);
        const hourStr = hour12 < 10 ? " " + hour12 : String(hour12);
        return hourStr + ":" + minuteStr + " " + (isPM ? "PM" : "AM");
    }
}

const Clock = new SimClock();

function updateLighting() {
    const hour = Clock.simMinute / 60;
    let lower = DAY_KEYFRAMES[0];
    let upper = DAY_KEYFRAMES[DAY_KEYFRAMES.length - 1];
    for (let i = 0; i < DAY_KEYFRAMES.length - 1; i += 1) {
        if (hour >= DAY_KEYFRAMES[i].hour && hour <= DAY_KEYFRAMES[i + 1].hour) {
            lower = DAY_KEYFRAMES[i];
            upper = DAY_KEYFRAMES[i + 1];
            break;
        }
    }
    const span = upper.hour - lower.hour;
    const t = span > 0 ? (hour - lower.hour) / span : 0;
    scene.background = new THREE.Color(lower.sky).lerp(new THREE.Color(upper.sky), t);
    sunLight.color = new THREE.Color(lower.sun).lerp(new THREE.Color(upper.sun), t);
    sunLight.intensity = lerpNum(lower.sunIntensity, upper.sunIntensity, t);
    ambientLight.intensity = lerpNum(lower.ambient, upper.ambient, t);
    hemiLight.intensity = lerpNum(lower.hemi, upper.hemi, t);
}

// ---------------------------------------------------------------------------
// Agent pool + daily schedules
// ---------------------------------------------------------------------------

function createAgent(id, role) {
    const group = window.createPerson({});
    group.visible = false;
    scene.add(group);
    return {
        id,
        role,
        name: FIRST_NAMES[randInt(0, FIRST_NAMES.length - 1)] + (id % 37),
        group,
        homeFloor: 0,
        deskId: -1,
        deskWpName: null,
        deskDoorWpName: null,
        state: "DISABLED",
        plan: [],
        currentAction: null,
        currentFloor: 0,
        wp: "outside",
        inCar: false,
        hasLunched: false,
        plannedMeetingTimes: [],
        arrivalTime: 0,
        lunchTime: 0,
        lunchDuration: 30,
        departureTime: 17 * 60,
        visitDuration: 10,
        _reservedSeatKey: null,
    };
}

function buildDeskList() {
    const list = [];
    for (let floor = 1; floor < WORLD.FLOOR_COUNT; floor += 1) {
        const floorData = world.floors[floor];
        for (let i = 0; i < floorData.desks.length; i += 1) {
            const desk = floorData.desks[i];
            list.push({ floor, deskId: desk.id, deskWpName: desk.deskWp, deskDoorWpName: desk.doorWp });
        }
    }
    return list;
}

function buildAgentPool() {
    agents = [];
    nextAgentId = 0;
    const desks = buildDeskList();
    for (let i = 0; i < MAX_WORKERS; i += 1) {
        const agent = createAgent(nextAgentId, "WORKER");
        nextAgentId += 1;
        const desk = desks[i % desks.length];
        agent.homeFloor = desk.floor;
        agent.deskId = desk.deskId;
        agent.deskWpName = desk.deskWpName;
        agent.deskDoorWpName = desk.deskDoorWpName;
        agents.push(agent);
    }
    for (let i = 0; i < MAX_VISITORS; i += 1) {
        const agent = createAgent(nextAgentId, "VISITOR");
        nextAgentId += 1;
        agents.push(agent);
    }
    for (let i = 0; i < agents.length; i += 1) {
        if (agents[i].id < targetOccupancy) resetAgentForNewDay(agents[i]);
    }
}

function applyOccupancy() {
    for (let i = 0; i < agents.length; i += 1) {
        const agent = agents[i];
        const shouldBeActive = agent.id < targetOccupancy;
        if (shouldBeActive && agent.state === "DISABLED") {
            resetAgentForNewDay(agent);
        } else if (!shouldBeActive && agent.state === "AWAY") {
            agent.state = "DISABLED";
        }
    }
}

function rollWorkerSchedule(agent) {
    agent.arrivalTime = randMinuteInRange(8, 15, 9, 30);
    agent.lunchTime = randMinuteInRange(11, 30, 13, 30);
    agent.lunchDuration = randInt(25, 60);
    agent.hasLunched = false;
    const straggler = Math.random() < 0.15;
    agent.departureTime = straggler ? randMinuteInRange(18, 30, 19, 45) : randMinuteInRange(16, 45, 18, 30);
    agent.plannedMeetingTimes = [];
    if (Math.random() < 0.5) agent.plannedMeetingTimes.push(randMinuteInRange(9, 0, 11, 30));
    if (Math.random() < 0.5) agent.plannedMeetingTimes.push(randMinuteInRange(13, 30, 16, 30));
}

function rollVisitorSchedule(agent, fromMinute) {
    agent.arrivalTime = fromMinute + randInt(0, 6);
    agent.visitDuration = randInt(8, 30);
    agent.hasLunched = true;
    agent.plannedMeetingTimes = [];
    agent.departureTime = 24 * 60;
}

function releaseAllSeatsFor(agent) {
    if (agent._reservedSeatKey) {
        seatReservations.delete(agent._reservedSeatKey);
        agent._reservedSeatKey = null;
    }
}

function resetAgentForNewDay(agent) {
    agent.state = "AWAY";
    agent.plan = [];
    agent.currentAction = null;
    agent.wp = "outside";
    agent.currentFloor = 0;
    agent.inCar = false;
    agent.group.visible = false;
    agent.group.userData.isSitting = false;
    agent.group.userData.isWalking = false;
    releaseAllSeatsFor(agent);
    if (agent.role === "WORKER") {
        rollWorkerSchedule(agent);
    } else {
        rollVisitorSchedule(agent, Clock.simMinute);
    }
}

function onNewDay() {
    seatReservations.clear();
    for (let i = 0; i < agents.length; i += 1) {
        const agent = agents[i];
        if (agent.id < targetOccupancy) {
            resetAgentForNewDay(agent);
        } else {
            agent.state = "DISABLED";
            agent.group.visible = false;
            agent.plan = [];
            agent.currentAction = null;
        }
    }
    elevator.reset();
}

function countPresent() {
    let count = 0;
    for (let i = 0; i < agents.length; i += 1) {
        const st = agents[i].state;
        if (st !== "DISABLED" && st !== "AWAY" && st !== "GONE") count += 1;
    }
    return count;
}

function topUpVisitors() {
    const hour = Clock.simMinute / 60;
    if (hour < 7.5 || hour > 19.5) return;
    let deficit = targetOccupancy - countPresent();
    if (deficit <= 0) return;
    for (let i = 0; i < agents.length; i += 1) {
        if (deficit <= 0) break;
        const agent = agents[i];
        if (agent.role !== "VISITOR" || agent.id >= targetOccupancy) continue;
        if (agent.state === "GONE") {
            rollVisitorSchedule(agent, Clock.simMinute);
            agent.state = "AWAY";
            deficit -= 1;
        }
    }
}

function spawnAgent(agent) {
    agent.group.visible = true;
    agent.currentFloor = 0;
    agent.wp = "outside";
    agent.inCar = false;
    const outsideNode = world.floors[0].nodes.outside;
    agent.group.position.set(outsideNode.pos.x + randRange(-1.1, 1.1), 0, outsideNode.pos.z + randRange(-0.75, 0.75));
    agent.group.rotation.y = Math.PI;
    agent.group.userData.isSitting = false;
    agent.group.userData.isWalking = false;
    agent.currentAction = null;
    agent.plan = agent.role === "WORKER" ? planArriveToDesk(agent) : planVisitorVisit(agent);
    agent.state = "ARRIVING";
}

// ---------------------------------------------------------------------------
// Primitive action factories
// ---------------------------------------------------------------------------

function actWalk(floor, wp) {
    return { type: "WALK_TO_WP", floor, wp };
}
function actWaitPanel(floor, dir, toFloor) {
    return { type: "WAIT_AT_PANEL", floor, dir, toFloor };
}
function actEnter(floor, dir, toFloor) {
    return { type: "ENTER_ELEVATOR", floor, dir, toFloor };
}
function actPressFloor(floor) {
    return { type: "PRESS_FLOOR", floor };
}
function actWaitFloor(floor) {
    return { type: "WAIT_FOR_FLOOR", floor };
}
function actExit(floor) {
    return { type: "EXIT_ELEVATOR", floor };
}
function actSit(floor, wp) {
    return { type: "SIT", floor, wp };
}
function actStand() {
    return { type: "STAND" };
}
function actReleaseSeat() {
    return { type: "RELEASE_SEAT" };
}
function actWaitSim(minutes) {
    return { type: "WAIT_SIM", minutes };
}
function actExitBuilding() {
    return { type: "EXIT_BUILDING" };
}
function actEnterState(state) {
    return { type: "ENTER_STATE", state };
}
function actMarkLunched() {
    return { type: "MARK_LUNCHED" };
}
function actPickNext() {
    return { type: "PICK_NEXT_ACTIVITY" };
}

function rideElevator(actions, fromFloor, toFloor) {
    const dir = toFloor > fromFloor ? 1 : -1;
    actions.push(actWaitPanel(fromFloor, dir, toFloor));
    actions.push(actEnter(fromFloor, dir, toFloor));
    actions.push(actPressFloor(toFloor));
    actions.push(actWaitFloor(toFloor));
    actions.push(actExit(toFloor));
}

// ---------------------------------------------------------------------------
// Plan compilers
// ---------------------------------------------------------------------------

function pickBistroSeat() {
    const spots = world.floors[0].cafeSpots.filter((name) => name !== "cafe_order");
    return spots[randInt(0, spots.length - 1)];
}

function reserveConfSeat(floor) {
    const seats = world.floors[floor].confSeats;
    for (let i = 0; i < seats.length; i += 1) {
        const key = floor + ":" + seats[i];
        if (!seatReservations.has(key)) {
            seatReservations.add(key);
            return { wp: seats[i], key };
        }
    }
    return null;
}

function planArriveToDesk(agent) {
    const actions = [];
    actions.push(actWalk(0, "front_door_threshold"));
    actions.push(actWalk(0, "entrance"));
    actions.push(actWalk(0, "lobby_center"));
    if (agent.homeFloor !== 0) rideElevator(actions, 0, agent.homeFloor);
    actions.push(actWalk(agent.homeFloor, agent.deskDoorWpName));
    actions.push(actWalk(agent.homeFloor, agent.deskWpName));
    actions.push(actSit(agent.homeFloor, agent.deskWpName));
    actions.push(actEnterState("AT_DESK"));
    actions.push(actWaitSim(randInt(18, 50)));
    actions.push(actPickNext());
    return actions;
}

function planGoToLunch(agent) {
    const actions = [];
    actions.push(actStand());
    actions.push(actWalk(agent.homeFloor, agent.deskDoorWpName));
    rideElevator(actions, agent.homeFloor, 0);
    const seat = pickBistroSeat();
    actions.push(actWalk(0, "cafe_door"));
    actions.push(actWalk(0, seat));
    actions.push(actSit(0, seat));
    actions.push(actEnterState("AT_LUNCH"));
    actions.push(actWaitSim(agent.lunchDuration));
    actions.push(actMarkLunched());
    actions.push(actStand());
    actions.push(actWalk(0, "lobby_center"));
    rideElevator(actions, 0, agent.homeFloor);
    actions.push(actWalk(agent.homeFloor, agent.deskDoorWpName));
    actions.push(actWalk(agent.homeFloor, agent.deskWpName));
    actions.push(actSit(agent.homeFloor, agent.deskWpName));
    actions.push(actEnterState("AT_DESK"));
    actions.push(actWaitSim(randInt(18, 50)));
    actions.push(actPickNext());
    return actions;
}

function planVisitLounge(agent) {
    const actions = [];
    const spot = "lounge_spot" + randInt(0, 2);
    actions.push(actStand());
    actions.push(actWalk(agent.homeFloor, "lounge_door"));
    actions.push(actWalk(agent.homeFloor, spot));
    actions.push(actSit(agent.homeFloor, spot));
    actions.push(actEnterState("AT_BREAK"));
    actions.push(actWaitSim(randInt(5, 12)));
    actions.push(actStand());
    actions.push(actWalk(agent.homeFloor, agent.deskDoorWpName));
    actions.push(actWalk(agent.homeFloor, agent.deskWpName));
    actions.push(actSit(agent.homeFloor, agent.deskWpName));
    actions.push(actEnterState("AT_DESK"));
    actions.push(actWaitSim(randInt(18, 50)));
    actions.push(actPickNext());
    return actions;
}

function planAttendMeeting(agent) {
    const useHome = Math.random() < 0.65;
    const meetingFloor = useHome ? agent.homeFloor : randInt(1, WORLD.FLOOR_COUNT - 1);
    const reservation = reserveConfSeat(meetingFloor);
    if (!reservation) return planVisitLounge(agent);

    agent._reservedSeatKey = reservation.key;
    const actions = [];
    actions.push(actStand());
    actions.push(actWalk(agent.homeFloor, agent.deskDoorWpName));
    if (meetingFloor !== agent.homeFloor) rideElevator(actions, agent.homeFloor, meetingFloor);
    actions.push(actWalk(meetingFloor, "conf_door"));
    actions.push(actWalk(meetingFloor, reservation.wp));
    actions.push(actSit(meetingFloor, reservation.wp));
    actions.push(actEnterState("IN_MEETING"));
    actions.push(actWaitSim(randInt(22, 45)));
    actions.push(actStand());
    actions.push(actReleaseSeat());
    actions.push(actWalk(meetingFloor, "conf_door"));
    if (meetingFloor !== agent.homeFloor) rideElevator(actions, meetingFloor, agent.homeFloor);
    actions.push(actWalk(agent.homeFloor, agent.deskDoorWpName));
    actions.push(actWalk(agent.homeFloor, agent.deskWpName));
    actions.push(actSit(agent.homeFloor, agent.deskWpName));
    actions.push(actEnterState("AT_DESK"));
    actions.push(actWaitSim(randInt(18, 50)));
    actions.push(actPickNext());
    return actions;
}

function planVisitCoworker(agent) {
    const candidates = agents.filter((other) => other.state === "AT_DESK" && other.id !== agent.id && other.role === "WORKER");
    if (!candidates.length) return planVisitLounge(agent);
    const target = candidates[randInt(0, candidates.length - 1)];
    const targetFloor = target.homeFloor;
    const targetDoorWp = target.deskDoorWpName;

    const actions = [];
    actions.push(actStand());
    actions.push(actWalk(agent.homeFloor, agent.deskDoorWpName));
    if (targetFloor !== agent.homeFloor) rideElevator(actions, agent.homeFloor, targetFloor);
    actions.push(actWalk(targetFloor, targetDoorWp));
    actions.push(actEnterState("IN_MEETING"));
    actions.push(actWaitSim(randInt(6, 18)));
    if (targetFloor !== agent.homeFloor) rideElevator(actions, targetFloor, agent.homeFloor);
    actions.push(actWalk(agent.homeFloor, agent.deskDoorWpName));
    actions.push(actWalk(agent.homeFloor, agent.deskWpName));
    actions.push(actSit(agent.homeFloor, agent.deskWpName));
    actions.push(actEnterState("AT_DESK"));
    actions.push(actWaitSim(randInt(18, 50)));
    actions.push(actPickNext());
    return actions;
}

function planLeaveBuilding(agent) {
    const actions = [];
    actions.push(actEnterState("LEAVING"));
    actions.push(actStand());
    actions.push(actReleaseSeat());
    actions.push(actWalk(agent.homeFloor, agent.deskDoorWpName));
    if (agent.homeFloor !== 0) rideElevator(actions, agent.homeFloor, 0);
    actions.push(actWalk(0, "lobby_center"));
    actions.push(actWalk(0, "entrance"));
    actions.push(actWalk(0, "front_door_threshold"));
    actions.push(actWalk(0, "outside"));
    actions.push(actExitBuilding());
    return actions;
}

function rollVisitorActivity() {
    const roll = Math.random();
    let acc = 0;
    for (let i = 0; i < VISITOR_ACTIVITY_TABLE.length; i += 1) {
        acc += VISITOR_ACTIVITY_TABLE[i].weight;
        if (roll < acc) return VISITOR_ACTIVITY_TABLE[i].kind;
    }
    return VISITOR_ACTIVITY_TABLE[VISITOR_ACTIVITY_TABLE.length - 1].kind;
}

function appendVisitorActivity(actions, agent, kind) {
    const dur = agent.visitDuration;
    const briefDur = Math.max(2, Math.round(dur * 0.35));
    if (kind === "bistro") {
        const seat = pickBistroSeat();
        actions.push(actWalk(0, "cafe_door"));
        actions.push(actWalk(0, seat));
        actions.push(actSit(0, seat));
        actions.push(actWaitSim(dur));
        actions.push(actStand());
        return;
    }
    if (kind === "cafe_counter") {
        actions.push(actWalk(0, "cafe_door"));
        actions.push(actWalk(0, "cafe_order"));
        actions.push(actWaitSim(briefDur));
        return;
    }
    if (kind === "front_lounge") {
        const spot = "front_lounge_spot" + randInt(0, 2);
        actions.push(actWalk(0, "front_lounge_door"));
        actions.push(actWalk(0, spot));
        actions.push(actSit(0, spot));
        actions.push(actWaitSim(dur));
        actions.push(actStand());
        return;
    }
    if (kind === "back_or_pit") {
        if (Math.random() < 0.5) {
            const spot = Math.random() < 0.5 ? "back_lounge_N" : "back_lounge_S";
            actions.push(actWalk(0, "back_lounge_hub"));
            actions.push(actWalk(0, spot));
            actions.push(actSit(0, spot));
            actions.push(actWaitSim(dur));
            actions.push(actStand());
        } else {
            const pitSpots = ["pit_N", "pit_S", "pit_E", "pit_W"];
            const spot = pitSpots[randInt(0, pitSpots.length - 1)];
            actions.push(actWalk(0, "pit_hub"));
            actions.push(actWalk(0, spot));
            actions.push(actSit(0, spot));
            actions.push(actWaitSim(dur));
            actions.push(actStand());
        }
        return;
    }
    if (kind === "reception_kiosk_wc") {
        const options = ["reception", "kiosk", "lobby_wc_front", "lobby_wc_back"];
        const wp = options[randInt(0, options.length - 1)];
        actions.push(actWalk(0, wp));
        actions.push(actWaitSim(briefDur));
        return;
    }
    if (kind === "lobby_loiter") {
        const loiter = world.floors[0].loiterSpots;
        const wp = loiter[randInt(0, loiter.length - 1)];
        actions.push(actWalk(0, wp));
        actions.push(actWaitSim(briefDur));
        return;
    }
    if (kind === "office_lounge") {
        const floor = randInt(1, WORLD.FLOOR_COUNT - 1);
        const spot = "lounge_spot" + randInt(0, 2);
        rideElevator(actions, 0, floor);
        actions.push(actWalk(floor, "lounge_door"));
        actions.push(actWalk(floor, spot));
        actions.push(actSit(floor, spot));
        actions.push(actWaitSim(dur));
        actions.push(actStand());
        rideElevator(actions, floor, 0);
        return;
    }
    const meetingFloor = randInt(1, WORLD.FLOOR_COUNT - 1);
    const reservation = reserveConfSeat(meetingFloor);
    if (!reservation) {
        const loiter = world.floors[0].loiterSpots;
        const wp = loiter[randInt(0, loiter.length - 1)];
        actions.push(actWalk(0, wp));
        actions.push(actWaitSim(briefDur));
        return;
    }
    agent._reservedSeatKey = reservation.key;
    rideElevator(actions, 0, meetingFloor);
    actions.push(actWalk(meetingFloor, "conf_door"));
    actions.push(actWalk(meetingFloor, reservation.wp));
    actions.push(actSit(meetingFloor, reservation.wp));
    actions.push(actWaitSim(Math.max(dur, 15)));
    actions.push(actStand());
    actions.push(actReleaseSeat());
    actions.push(actWalk(meetingFloor, "conf_door"));
    rideElevator(actions, meetingFloor, 0);
}

function planVisitorVisit(agent) {
    const actions = [];
    actions.push(actWalk(0, "front_door_threshold"));
    actions.push(actWalk(0, "entrance"));
    actions.push(actEnterState("VISITING"));
    const kind = rollVisitorActivity();
    appendVisitorActivity(actions, agent, kind);
    actions.push(actEnterState("LEAVING"));
    actions.push(actWalk(0, "lobby_center"));
    actions.push(actWalk(0, "entrance"));
    actions.push(actWalk(0, "front_door_threshold"));
    actions.push(actWalk(0, "outside"));
    actions.push(actExitBuilding());
    return actions;
}

function chooseNextActivity(agent) {
    if (Clock.simMinute >= agent.departureTime) {
        agent.plan = planLeaveBuilding(agent);
        return;
    }
    if (agent.plannedMeetingTimes.length) {
        let dueIndex = -1;
        for (let i = 0; i < agent.plannedMeetingTimes.length; i += 1) {
            if (Clock.simMinute >= agent.plannedMeetingTimes[i]) {
                dueIndex = i;
                break;
            }
        }
        if (dueIndex !== -1) {
            agent.plannedMeetingTimes.splice(dueIndex, 1);
            agent.plan = planAttendMeeting(agent);
            return;
        }
    }
    if (!agent.hasLunched && Clock.simMinute >= agent.lunchTime) {
        agent.plan = planGoToLunch(agent);
        return;
    }
    const roll = Math.random();
    if (roll < MEETING_PROB) {
        agent.plan = planAttendMeeting(agent);
    } else if (roll < LOUNGE_BREAK_PROB) {
        agent.plan = planVisitLounge(agent);
    } else if (roll < VISIT_COWORKER_PROB) {
        agent.plan = planVisitCoworker(agent);
    } else {
        agent.plan = [actWaitSim(randInt(18, 65)), actPickNext()];
    }
}

// ---------------------------------------------------------------------------
// Action dispatch
// ---------------------------------------------------------------------------

function isInEntranceChain(agent) {
    const action = agent.currentAction;
    if (!action || action.type !== "WALK_TO_WP") return false;
    return ENTRANCE_CHAIN_SET.has(action.wp) || ENTRANCE_CHAIN_SET.has(agent.wp);
}

function stepWalkAlongPath(agent, action, dt) {
    const path = action._path;
    if (!path || !path.length) {
        agent.group.userData.isWalking = false;
        return true;
    }
    agent.group.userData.isWalking = true;
    const target = path[action._idx];
    const before = action._lastPos || agent.group.position.clone();
    const reachedSegment = stepToward(agent.group, target, dt, WALK_SPEED);
    const progressed = agent.group.position.distanceTo(before);
    action._stallT = progressed < 0.005 ? (action._stallT || 0) + dt : 0;
    action._lastPos = agent.group.position.clone();
    if (reachedSegment || action._stallT > 1.2) {
        action._idx += 1;
        action._stallT = 0;
        if (action._idx >= path.length) {
            agent.wp = action.wp;
            agent.group.userData.isWalking = false;
            return true;
        }
        action._lastPos = agent.group.position.clone();
    }
    return false;
}

function stepWaitAtPanel(agent, action) {
    if (action.dir > 0) elevator.callUp(action.floor);
    else elevator.callDown(action.floor);
    agent.group.userData.isWalking = false;
    return elevator.isAcceptingAt(action.floor, action.dir) && elevator.currentCapacityFree() > 0;
}

function stepEnterElevator(agent, action, dt) {
    if (action._phase === "RESERVE") {
        if (elevator.state !== "DOOR_OPEN" || elevator.currentFloor !== action.floor) {
            if (action.dir > 0) elevator.callUp(action.floor);
            else elevator.callDown(action.floor);
            return false;
        }
        const spot = elevator.reserveBoardingSpot(agent);
        if (!spot) {
            if (action.dir > 0) elevator.callUp(action.floor);
            else elevator.callDown(action.floor);
            return false;
        }
        action._spot = spot;
        action._phase = "WALK_TO_DOOR";
        action._stallT = 0;
        action._lastPos = agent.group.position.clone();
        return false;
    }
    if (action._phase === "WALK_TO_DOOR") {
        const doorSpotWorld = elevator.spotWorld(action._spot);
        const threshold = new THREE.Vector3(doorSpotWorld.x, elevator.group.position.y, WORLD.SHAFT_DEPTH / 2 - 0.1);
        agent.group.userData.isWalking = true;
        const before = action._lastPos || agent.group.position.clone();
        const reached = stepToward(agent.group, threshold, dt, WALK_SPEED);
        const progressed = agent.group.position.distanceTo(before);
        action._stallT = progressed < 0.005 ? (action._stallT || 0) + dt : 0;
        action._lastPos = agent.group.position.clone();
        if (reached || action._stallT > 1.5) {
            const worldPos = agent.group.position.clone();
            elevator.group.add(agent.group);
            agent.group.position.copy(worldPos.sub(elevator.group.position));
            action._phase = "WALK_TO_SPOT";
            action._stallT = 0;
            action._lastPos = agent.group.position.clone();
        }
        return false;
    }
    if (action._phase === "WALK_TO_SPOT") {
        const target = new THREE.Vector3(action._spot.x, action._spot.y, action._spot.z);
        const before = action._lastPos || agent.group.position.clone();
        const reachedSpot = stepToward(agent.group, target, dt, WALK_SPEED);
        const progressed = agent.group.position.distanceTo(before);
        action._stallT = progressed < 0.005 ? (action._stallT || 0) + dt : 0;
        action._lastPos = agent.group.position.clone();
        if (reachedSpot || action._stallT > 1.5) {
            elevator.completeBoard(agent);
            agent.group.rotation.y = 0;
            agent.group.userData.isWalking = false;
            agent.inCar = true;
            return true;
        }
        return false;
    }
    return true;
}

function stepPressFloor(agent, action) {
    elevator.pressDestination(action.floor);
    return true;
}

function stepWaitForFloor(agent, action) {
    return elevator.state === "DOOR_OPEN" && elevator.currentFloor === action.floor;
}

function stepExitElevator(agent, action, dt) {
    if (action._phase === "REGISTER") {
        elevator.registerDisembark(agent);
        const worldPos = agent.group.position.clone().add(elevator.group.position);
        scene.add(agent.group);
        agent.group.position.copy(worldPos);
        action._phase = "WALK_OUT";
        action._stallT = 0;
        action._lastPos = agent.group.position.clone();
        return false;
    }
    if (action._phase === "WALK_OUT") {
        const target = world.floors[action.floor].nodes.elevWait.pos;
        agent.group.userData.isWalking = true;
        const before = action._lastPos || agent.group.position.clone();
        const reached = stepToward(agent.group, target, dt, WALK_SPEED);
        const progressed = agent.group.position.distanceTo(before);
        action._stallT = progressed < 0.005 ? (action._stallT || 0) + dt : 0;
        action._lastPos = agent.group.position.clone();
        if (reached || action._stallT > 1.5) {
            elevator.completeDisembark(agent);
            agent.wp = "elevWait";
            agent.currentFloor = action.floor;
            agent.inCar = false;
            agent.group.userData.isWalking = false;
            return true;
        }
        return false;
    }
    return true;
}

function stepSit(agent, action) {
    const node = world.floors[action.floor].nodes[action.wp];
    const sitInfo = world.floors[action.floor].sitTargets[action.wp];
    agent.group.position.set(node.pos.x, node.pos.y - 0.35, node.pos.z);
    agent.group.rotation.y = sitInfo.facing;
    agent.group.userData.isSitting = true;
    agent.group.userData.isWalking = false;
    agent.wp = action.wp;
    return true;
}

function stepStand(agent) {
    agent.group.userData.isSitting = false;
    agent.group.position.y = agent.inCar ? 0 : agent.currentFloor * WORLD.FLOOR_HEIGHT;
    return true;
}

function stepReleaseSeat(agent) {
    releaseAllSeatsFor(agent);
    return true;
}

function stepWaitSim(agent, action) {
    return Clock.simMinute >= action._untilMin;
}

function stepExitBuilding(agent) {
    agent.group.visible = false;
    agent.group.userData.isWalking = false;
    agent.group.userData.isSitting = false;
    agent.state = "GONE";
    agent.plan = [];
    return true;
}

function stepEnterState(agent, action) {
    agent.state = action.state;
    return true;
}

function stepMarkLunched(agent) {
    agent.hasLunched = true;
    return true;
}

function stepPickNextActivity(agent) {
    chooseNextActivity(agent);
    return true;
}

function startAction(agent, action) {
    if (action.type === "WALK_TO_WP") {
        const nodes = world.floors[action.floor].nodes;
        let path = bfsPath(nodes, agent.wp, action.wp);
        if (!path.length) path = [nodes[action.wp].pos.clone()];
        action._path = path;
        action._idx = 0;
        action._stallT = 0;
        action._lastPos = agent.group.position.clone();
    } else if (action.type === "ENTER_ELEVATOR") {
        action._phase = "RESERVE";
    } else if (action.type === "EXIT_ELEVATOR") {
        action._phase = "REGISTER";
    } else if (action.type === "WAIT_SIM") {
        action._untilMin = Clock.simMinute + action.minutes;
    }
}

function stepAction(agent, action, dt) {
    if (action.type === "WALK_TO_WP") return stepWalkAlongPath(agent, action, dt);
    if (action.type === "WAIT_AT_PANEL") return stepWaitAtPanel(agent, action);
    if (action.type === "ENTER_ELEVATOR") return stepEnterElevator(agent, action, dt);
    if (action.type === "PRESS_FLOOR") return stepPressFloor(agent, action);
    if (action.type === "WAIT_FOR_FLOOR") return stepWaitForFloor(agent, action);
    if (action.type === "EXIT_ELEVATOR") return stepExitElevator(agent, action, dt);
    if (action.type === "SIT") return stepSit(agent, action);
    if (action.type === "STAND") return stepStand(agent);
    if (action.type === "RELEASE_SEAT") return stepReleaseSeat(agent);
    if (action.type === "WAIT_SIM") return stepWaitSim(agent, action);
    if (action.type === "EXIT_BUILDING") return stepExitBuilding(agent);
    if (action.type === "ENTER_STATE") return stepEnterState(agent, action);
    if (action.type === "MARK_LUNCHED") return stepMarkLunched(agent);
    if (action.type === "PICK_NEXT_ACTIVITY") return stepPickNextActivity(agent);
    return true;
}

function runAgentActions(agent, motionDt) {
    let iterations = 0;
    while (iterations < 16) {
        iterations += 1;
        if (!agent.currentAction) {
            if (!agent.plan.length) return;
            agent.currentAction = agent.plan.shift();
            startAction(agent, agent.currentAction);
        }
        const done = stepAction(agent, agent.currentAction, motionDt);
        if (done) {
            agent.currentAction = null;
        } else {
            return;
        }
    }
}

function updateAgent(agent, motionDt) {
    if (agent.state === "DISABLED" || agent.state === "GONE") return;
    if (agent.state === "AWAY") {
        if (Clock.simMinute >= agent.arrivalTime) spawnAgent(agent);
        return;
    }
    runAgentActions(agent, motionDt);
}

// ---------------------------------------------------------------------------
// Collision resolution
// ---------------------------------------------------------------------------

function isCollidable(agent) {
    if (agent.state === "DISABLED" || agent.state === "AWAY" || agent.state === "GONE") return false;
    if (agent.group.userData.isSitting) return false;
    if (agent.group.parent === elevator.group) return false;
    if (agent.currentAction && agent.currentAction.type === "ENTER_ELEVATOR") return false;
    if (isInEntranceChain(agent)) return false;
    return true;
}

function resolvePush(a, b) {
    const dx = b.group.position.x - a.group.position.x;
    const dz = b.group.position.z - a.group.position.z;
    const dy = Math.abs(b.group.position.y - a.group.position.y);
    if (dy > 1) return;
    let dist = Math.sqrt(dx * dx + dz * dz);
    const minDist = 0.7;
    if (dist >= minDist) return;
    let nx;
    let nz;
    if (dist < 0.001) {
        const angle = Math.random() * Math.PI * 2;
        nx = Math.cos(angle);
        nz = Math.sin(angle);
        dist = 0.001;
    } else {
        nx = dx / dist;
        nz = dz / dist;
    }
    const overlap = (minDist - dist) * 0.18;
    a.group.position.x -= nx * overlap;
    a.group.position.z -= nz * overlap;
    b.group.position.x += nx * overlap;
    b.group.position.z += nz * overlap;
}

function applyCollisions() {
    for (let i = 0; i < agents.length; i += 1) {
        const a = agents[i];
        if (!isCollidable(a)) continue;
        for (let j = i + 1; j < agents.length; j += 1) {
            const b = agents[j];
            if (!isCollidable(b)) continue;
            if (a.group.parent !== b.group.parent) continue;
            resolvePush(a, b);
        }
    }
}

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------

function buildHud() {
    const panel = document.createElement("div");
    panel.id = "hud";
    panel.style.position = "fixed";
    panel.style.top = "10px";
    panel.style.left = "10px";
    panel.style.padding = "10px 14px";
    panel.style.background = "rgba(10,12,20,0.72)";
    panel.style.border = "1px solid rgba(255,255,255,0.15)";
    panel.style.borderRadius = "8px";
    panel.style.fontSize = "13px";
    panel.style.lineHeight = "1.5";
    panel.style.zIndex = "10";
    panel.style.minWidth = "240px";
    panel.style.userSelect = "none";

    const timeEl = document.createElement("div");
    timeEl.style.fontSize = "22px";
    timeEl.style.fontWeight = "bold";
    timeEl.style.marginBottom = "6px";
    panel.appendChild(timeEl);

    const speedRow = document.createElement("div");
    const speedTitle = document.createElement("span");
    speedTitle.textContent = "Speed: ";
    const speedLabel = document.createElement("span");
    speedRow.appendChild(speedTitle);
    speedRow.appendChild(speedLabel);
    const speedSlider = document.createElement("input");
    speedSlider.type = "range";
    speedSlider.min = "0";
    speedSlider.max = String(SPEED_STOPS.length - 1);
    speedSlider.step = "1";
    speedSlider.value = String(defaultSpeedIndex());
    speedSlider.style.width = "220px";
    speedSlider.style.display = "block";
    panel.appendChild(speedRow);
    panel.appendChild(speedSlider);

    const occLabel = document.createElement("div");
    occLabel.style.marginTop = "8px";
    const occSlider = document.createElement("input");
    occSlider.type = "range";
    occSlider.min = "1";
    occSlider.max = String(MAX_OCCUPANCY);
    occSlider.step = "1";
    occSlider.value = String(targetOccupancy);
    occSlider.style.width = "220px";
    occSlider.style.display = "block";
    panel.appendChild(occLabel);
    panel.appendChild(occSlider);

    const stateEl = document.createElement("div");
    stateEl.style.marginTop = "8px";
    stateEl.style.whiteSpace = "pre";
    panel.appendChild(stateEl);

    const elevEl = document.createElement("div");
    elevEl.style.marginTop = "8px";
    elevEl.style.whiteSpace = "pre";
    panel.appendChild(elevEl);

    document.body.appendChild(panel);

    speedSlider.addEventListener("input", () => {
        Clock.timeScale = SPEED_STOPS[Number(speedSlider.value)];
        speedLabel.textContent = Clock.timeScale + "x";
    });
    occSlider.addEventListener("input", () => {
        targetOccupancy = Number(occSlider.value);
        applyOccupancy();
    });
    speedLabel.textContent = Clock.timeScale + "x";

    return { timeEl, occLabel, stateEl, elevEl };
}

function updateHud() {
    hud.timeEl.textContent = Clock.format();
    hud.occLabel.textContent = "Occupancy: " + targetOccupancy + " / " + MAX_OCCUPANCY + " people";

    const counts = {};
    for (let i = 0; i < agents.length; i += 1) {
        const st = agents[i].state;
        counts[st] = (counts[st] || 0) + 1;
    }
    const lines = ["Present: " + countPresent()];
    const keys = Object.keys(counts).sort();
    for (let i = 0; i < keys.length; i += 1) lines.push(keys[i] + ": " + counts[keys[i]]);
    hud.stateEl.textContent = lines.join("\n");

    const dirText = elevator.direction > 0 ? "UP" : elevator.direction < 0 ? "DOWN" : "-";
    hud.elevEl.textContent =
        "Elevator: floor " + elevator.currentFloor + " " + dirText +
        "\nState: " + elevator.state +
        "\nPassengers: " + elevator.passengers.size + "/4" +
        "\nDestinations: [" + Array.from(elevator.destinations).join(",") + "]" +
        "\nUpCalls: [" + Array.from(elevator.upCalls).join(",") + "]" +
        "\nDownCalls: [" + Array.from(elevator.downCalls).join(",") + "]";
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function startSimulation() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x20242a);
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(28, 24, 28);
    camera.lookAt(0, 10, 0);
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.sortObjects = true;
    document.body.appendChild(renderer.domElement);
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 10, 0);

    const ambient = new THREE.AmbientLight(0xffffff, 0.45);
    scene.add(ambient);
    const hemi = new THREE.HemisphereLight(0xbfd7ff, 0x303020, 0.45);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 0.9);
    sun.position.set(20, 35, 18);
    scene.add(sun);
    ambientLight = ambient;
    hemiLight = hemi;
    sunLight = sun;

    world = createWorld(scene);
    elevator = new Elevator(scene, world);

    realClock = new THREE.Clock();
    buildAgentPool();
    hud = buildHud();

    window.addEventListener("resize", onWindowResize);

    function animate() {
        requestAnimationFrame(animate);
        const realDt = Math.min(0.05, realClock.getDelta());
        Clock.tick(realDt);
        updateLighting();
        const motionDt = realDt * Clock.timeScale;
        elevator.tick(motionDt);
        topUpVisitors();
        for (let i = 0; i < agents.length; i += 1) {
            updateAgent(agents[i], motionDt);
        }
        applyCollisions();
        for (let i = 0; i < agents.length; i += 1) {
            if (agents[i].group.visible) window.animatePersonWalking(agents[i].group, motionDt);
        }
        controls.update();
        renderer.render(scene, camera);
        updateHud();
    }
    animate();
}

if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", startSimulation);
} else {
    startSimulation();
}
