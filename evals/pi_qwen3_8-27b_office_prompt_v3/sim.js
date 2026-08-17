/**
 * sim.js - simulated clock, day/night lighting, agent state machine + daily
 * schedules, render loop, collisions and HUD. Loads after person/world/
 * elevator_logic/elevator (classic scripts, window globals only).
 */

// ---------------- constants ----------------

const SIM_START_MINUTE = 7 * 60 + 30;      // 07:30
const SIM_TIME_SCALE_DEFAULT = 120;        // pure realtime multiplier
const SPEED_STOPS = [1, 5, 15, 30, 60, 120, 240, 480, 600]; // log-spaced slider stops
const MAX_WORKERS = 20;
const MAX_VISITORS = 80;
const MAX_OCCUPANCY = MAX_WORKERS + MAX_VISITORS;
const DEFAULT_OCCUPANCY = 45;
const PERSON_SPEED = 1.3;                  // world units / sim second at 1x
const DESK_SEAT_DROP = 0.35;
const OFFICE_FLOOR_LIST = [1, 2, 3, 4, 5];

const SIM_FIRST_NAMES = [
    "Ada", "Ben", "Cara", "Dan", "Eve", "Fay", "Gus", "Hal", "Ivy", "Jon",
    "Kim", "Lia", "Moe", "Nia", "Omar", "Pia", "Quin", "Rex", "Sue", "Tom",
    "Uma", "Vic", "Wes", "Xia", "Yara", "Zed"
];

// ---------------- shared state (top-level, spelled consistently) ----------------

let sceneRoot = null;
let cameraView = null;
let rendererMain = null;
let orbitControls = null;
let worldRef = null;
let elevatorRef = null;
let agentList = [];
let sunLight = null;
let ambientLight = null;
let hemiLight = null;
let targetOccupancy = DEFAULT_OCCUPANCY;
let seatReservations = new Set();   // keys: "floor:wpName"
let lastFrameTime = 0;

const clockRef = {
    simMinute: SIM_START_MINUTE,
    timeScale: SIM_TIME_SCALE_DEFAULT,
    tick: function (realDt) {
        this.simMinute += realDt * this.timeScale / 60;
    },
    format: function () {
        const total = Math.floor(this.simMinute);
        let hours = Math.floor(total / 60) % 24;
        const mins = total % 60;
        const meridiem = hours >= 12 ? "PM" : "AM";
        let display = hours % 12;
        if (display === 0) display = 12;
        return " " + display + ":" + String(mins).padStart(2, "0") + " " + meridiem;
    }
};

// ---------------- small utilities ----------------

function simRandomInt(lo, hi) {
    return lo + Math.floor(Math.random() * (hi - lo + 1));
}

function simRandomRange(lo, hi) {
    return lo + Math.random() * (hi - lo);
}

function pickFrom(list) {
    return list[Math.floor(Math.random() * list.length)];
}

// ---------------- day / night lighting ----------------

const LIGHT_KEYFRAMES = [
    { h: 5.5, bg: 0x1a1d2e, sun: 0xff9966, si: 0.35, ai: 0.45, hi: 0.32 },
    { h: 6.0, bg: 0xd98a5f, sun: 0xffb070, si: 0.85, ai: 0.60, hi: 0.55 },
    { h: 6.5, bg: 0x9fc4ea, sun: 0xfff1cf, si: 0.95, ai: 0.72, hi: 0.65 },
    { h: 8.0, bg: 0x86b7e8, sun: 0xffffff, si: 1.00, ai: 0.75, hi: 0.70 },
    { h: 12.0, bg: 0x9fcdf2, sun: 0xffffff, si: 1.00, ai: 0.80, hi: 0.75 },
    { h: 16.5, bg: 0x8fb9e4, sun: 0xfff6df, si: 0.98, ai: 0.74, hi: 0.68 },
    { h: 17.8, bg: 0xe0a35c, sun: 0xffb25e, si: 0.88, ai: 0.62, hi: 0.55 },
    { h: 18.4, bg: 0x4d4470, sun: 0xc96a4a, si: 0.45, ai: 0.50, hi: 0.40 },
    { h: 19.2, bg: 0x23263c, sun: 0x8878b0, si: 0.28, ai: 0.45, hi: 0.32 }
];

function hexLerp(hexA, hexB, t) {
    const r = Math.round(((hexA >> 16) & 255) * (1 - t) + ((hexB >> 16) & 255) * t);
    const g = Math.round(((hexA >> 8) & 255) * (1 - t) + ((hexB >> 8) & 255) * t);
    const b = Math.round((hexA & 255) * (1 - t) + (hexB & 255) * t);
    return (r << 16) | (g << 8) | b;
}

function updateLighting(hourFloat) {
    const frames = LIGHT_KEYFRAMES;
    let i = 0;
    while (i < frames.length - 1 && hourFloat >= frames[i + 1].h) i += 1;
    if (hourFloat >= frames[frames.length - 1].h) i = frames.length - 2;
    const a = frames[i];
    const b = frames[i + 1];
    let t = (hourFloat - a.h) / (b.h - a.h);
    if (t < 0) t = 0;
    if (t > 1) t = 1;
    sceneRoot.background.setHex(hexLerp(a.bg, b.bg, t));
    sunLight.color.setHex(hexLerp(a.sun, b.sun, t));
    sunLight.intensity = a.si + (b.si - a.si) * t;
    ambientLight.intensity = a.ai + (b.ai - a.ai) * t;
    hemiLight.intensity = a.hi + (b.hi - a.hi) * t;
}

// ---------------- agent construction ----------------

function rollWorkerSchedule(agent) {
    agent.arrivalTime = simRandomInt(8 * 60 + 15, 9 * 60 + 30);
    agent.lunchTime = simRandomInt(11 * 60 + 30, 13 * 60 + 30);
    agent.lunchDuration = simRandomInt(25, 60);
    if (Math.random() < 0.15) {
        agent.departureTime = simRandomInt(18 * 60 + 30, 19 * 60 + 45); // straggler
    } else {
        agent.departureTime = simRandomInt(16 * 60 + 45, 18 * 60 + 30);
    }
    agent.hasLunched = false;
    agent.plannedMeetingTimes = [];
    const meetingCount = simRandomInt(0, 2);
    if (meetingCount > 0) agent.plannedMeetingTimes.push(simRandomInt(10 * 60, 11 * 60 + 45));
    if (meetingCount > 1) agent.plannedMeetingTimes.push(simRandomInt(14 * 60, 16 * 60 + 30));
}

function buildAgents() {
    agentList = [];
    let id = 0;
    for (let i = 0; i < MAX_WORKERS; i += 1) {
        const deskId = i % 4;
        const floorNumber = Math.floor(i / 4) + 1; // floors 1..5, 4 desks each
        const letter = String.fromCharCode(65 + deskId);
        const agent = {
            id: id,
            role: "WORKER",
            name: SIM_FIRST_NAMES[i % SIM_FIRST_NAMES.length] + (i >= SIM_FIRST_NAMES.length ? (id + 1) : ""),
            group: null,
            state: "AWAY",
            homeFloor: floorNumber,
            deskId: deskId,
            deskWpName: "office" + letter + "_desk",
            doorWpName: "office" + letter + "_door",
            arrivalTime: 0, lunchTime: 0, lunchDuration: 30, departureTime: 17 * 60,
            hasLunched: false,
            plannedMeetingTimes: [],
            plan: [],
            currentAction: null
        };
        rollWorkerSchedule(agent);
        agentList.push(agent);
        id += 1;
    }
    for (let i = 0; i < MAX_VISITORS; i += 1) {
        const agent = {
            id: id,
            role: "VISITOR",
            name: pickFrom(SIM_FIRST_NAMES) + "-" + (i + 1),
            group: null,
            state: "AWAY",
            homeFloor: null,
            deskId: null,
            deskWpName: null,
            doorWpName: null,
            arrivalTime: 0, lunchTime: 0, lunchDuration: 0, departureTime: 0,
            hasLunched: false,
            plannedMeetingTimes: [],
            plan: [],
            currentAction: null
        };
        agentList.push(agent);
        id += 1;
    }
    applyOccupancy();
}

function applyOccupancy() {
    for (let i = 0; i < agentList.length; i += 1) {
        const agent = agentList[i];
        if (agent.id < targetOccupancy && agent.state === "DISABLED") {
            agent.state = "AWAY";
        } else if (agent.id >= targetOccupancy && (agent.state === "AWAY" || agent.state === "GONE")) {
            if (agent.group) {
                sceneRoot.remove(agent.group);
                agent.group = null;
            }
            agent.plan = [];
            agent.currentAction = null;
            agent.state = "DISABLED";
        }
    }
}

function countPresent() {
    let n = 0;
    for (let i = 0; i < agentList.length; i += 1) {
        const st = agentList[i].state;
        if (st !== "AWAY" && st !== "DISABLED" && st !== "GONE") n += 1;
    }
    return n;
}

// ---------------- visitor top-up (keeps the building at the slider value) ----------------

function rearmVisitorForVisit(agent) {
    agent.arrivalTime = Math.floor(clockRef.simMinute) + simRandomInt(0, 6);
    agent.hasLunched = false;
    agent.plannedMeetingTimes = [];
    // AWAY (not GONE) so the spawn check in updateAgent picks them back up
    agent.state = "AWAY";
}

function topUpVisitors() {
    const deficit = targetOccupancy - countPresent();
    if (deficit <= 0) return;
    let reArmed = 0;
    for (let i = 0; i < agentList.length && reArmed < deficit; i += 1) {
        const agent = agentList[i];
        if (agent.role !== "VISITOR") continue;
        if (agent.id >= targetOccupancy) continue;
        if (agent.state === "AWAY" || agent.state === "GONE") {
            rearmVisitorForVisit(agent);
            reArmed += 1;
        }
    }
}

// ---------------- plan primitives (factories) ----------------

function actWalkTo(floor, wpName) { return { type: "WALK_TO_WP", floor: floor, wpName: wpName }; }
function actWaitAtPanel(floor, dir, toFloor) { return { type: "WAIT_AT_PANEL", floor: floor, dir: dir, toFloor: toFloor }; }
function actEnterElevator(toFloor) { return { type: "ENTER_ELEVATOR", toFloor: toFloor, phase: null }; }
function actPressFloor(floor) { return { type: "PRESS_FLOOR", floor: floor }; }
function actWaitForFloor(floor) { return { type: "WAIT_FOR_FLOOR", floor: floor }; }
function actExitElevator(toFloor) { return { type: "EXIT_ELEVATOR", toFloor: toFloor, phase: null }; }
function actSit(wpName) { return { type: "SIT", wpName: wpName }; }
function actStand() { return { type: "STAND" }; }
function actReleaseSeat() { return { type: "RELEASE_SEAT" }; }
function actWaitSim(minutes) { return { type: "WAIT_SIM", minutes: minutes, untilMin: 0 }; }
function actExitBuilding() { return { type: "EXIT_BUILDING" }; }
function actEnterState(stateName) { return { type: "ENTER_STATE", state: stateName }; }
function actMarkLunched() { return { type: "MARK_LUNCHED" }; }
function actPickNext() { return { type: "PICK_NEXT_ACTIVITY" }; }

// ---------------- navigation helpers ----------------

function currentFloorOf(agent) {
    if (agent.group && agent.group.parent === elevatorRef.car) {
        return elevatorRef.logic.floorOfY(elevatorRef.car.position.y);
    }
    const y = agent.group ? agent.group.position.y : 0;
    return Math.max(0, Math.round(y / WORLD.FLOOR_HEIGHT));
}

function nearestNodeName(nodes, pos) {
    let bestName = null;
    let bestDist = Infinity;
    for (const key in nodes) {
        const d = nodes[key].pos.distanceToSquared(pos);
        if (d < bestDist) { bestDist = d; bestName = key; }
    }
    return bestName;
}

/**
 * Resolve a walk to named waypoint: BFS path from nearest node to target.
 * Returns { path, entranceChain }. Falls back to a direct line if the graph
 * is disconnected (should not happen, but keeps agents making progress).
 */
function resolveWalkPath(agent, floor, wpName) {
    const nodes = worldRef.floors[floor].nodes;
    const targetNode = nodes[wpName];
    if (!targetNode) return null;
    const entranceChain = (wpName === "outside" || wpName === "front_door_threshold" || wpName === "entrance");
    const fromName = nearestNodeName(nodes, agent.group.position);
    let path = worldRef.bfsPath(nodes, fromName, wpName);
    if (!path || path.length === 0) {
        path = [targetNode.pos.clone()];
    }
    return { path: path, entranceChain: entranceChain };
}

// ---------------- seat reservation ----------------

function reserveSeat(floor, wpName) {
    const key = floor + ":" + wpName;
    if (seatReservations.has(key)) return false;
    seatReservations.add(key);
    return true;
}

function releaseSeatByKey(key) {
    if (!key) return;
    seatReservations.delete(key);
}

// ---------------- elevator leg planning ----------------

/**
 * Compile the elevator traversal between two floors. The destination floor is
 * carried explicitly on every action - never inferred from direction.
 * Ends with EXIT + walk to elevWait on the arrival floor.
 */
function compileElevatorLeg(fromFloor, toFloor) {
    const actions = [];
    if (fromFloor === toFloor) return actions;
    const dir = toFloor > fromFloor ? 1 : -1;
    // walk over to the hall call panel first (agents may be anywhere on floor)
    actions.push(actWalkTo(fromFloor, "elevWait"));
    actions.push(actWaitAtPanel(fromFloor, dir, toFloor));
    actions.push(actEnterElevator(toFloor));
    actions.push(actPressFloor(toFloor));
    actions.push(actWaitForFloor(toFloor));
    actions.push(actExitElevator(toFloor));
    actions.push(actWalkTo(toFloor, "elevWait"));
    return actions;
}

function appendActions(targetList, sourceList) {
    for (let i = 0; i < sourceList.length; i += 1) targetList.push(sourceList[i]);
}

// ---------------- goal -> plan compilers ----------------

/** Every worker plan ends with a short wait + decision, keeping the loop alive. */
function endOfDayTail() {
    return [actWaitSim(simRandomInt(2, 5)), actPickNext()];
}

function planArriveToDesk(agent) {
    // Agent is spawning on the sidewalk: logically floor 0.
    const actions = [actEnterState("ARRIVING")];
    actions.push(actWalkTo(0, "front_door_threshold"));
    actions.push(actWalkTo(0, "entrance"));
    actions.push(actWalkTo(0, "lobby_center"));
    appendActions(actions, compileElevatorLeg(0, agent.homeFloor));
    // office door -> desk -> sit -> work
    actions.push(actWalkTo(agent.homeFloor, agent.doorWpName));
    actions.push(actWalkTo(agent.homeFloor, agent.deskWpName));
    if (reserveSeat(agent.homeFloor, agent.deskWpName)) {
        agent._reservedSeatKey = agent.homeFloor + ":" + agent.deskWpName;
        actions.push(actSit(agent.deskWpName));
        actions.push(actEnterState("AT_DESK"));
        actions.push(actWaitSim(simRandomInt(25, 70)));
    } else {
        // desk taken (shouldn't happen: one worker per desk) - stand at the door
        actions.push(actWaitSim(simRandomInt(10, 20)));
    }
    for (let i = 0; i < endOfDayTail().length; i += 1) actions.push(endOfDayTail()[i]);
    agent.plan = actions;
}

function planGoToLunch(agent) {
    // Compiled while the agent is at their desk on homeFloor.
    const actions = [];
    actions.push(actStand());
    actions.push(actWalkTo(agent.homeFloor, agent.doorWpName));
    appendActions(actions, compileElevatorLeg(agent.homeFloor, 0));
    actions.push(actWalkTo(0, "lobby_center"));
    // pick a free bistro seat
    const seats = worldRef.floors[0].cafeSpots || [];
    let chosen = null;
    for (let i = 0; i < seats.length && !chosen; i += 1) {
        if (reserveSeat(0, seats[i])) chosen = seats[i];
    }
    if (chosen) {
        actions.push(actWalkTo(0, chosen));
        actions.push(actSit(chosen));
        actions.push(actEnterState("AT_LUNCH"));
        actions.push(actWaitSim(agent.lunchDuration));
        actions.push(actStand());
        actions.push(actMarkLunched());
        actions.push(releaseSeatByKeyWrap("0:" + chosen));
    } else {
        // cafe full: just stand at the counter for a bit
        actions.push(actWalkTo(0, "cafe_order"));
        actions.push(actEnterState("AT_LUNCH"));
        actions.push(actWaitSim(Math.min(20, agent.lunchDuration)));
        actions.push(actMarkLunched());
    }
    // ride back up and return to the desk
    appendActions(actions, compileElevatorLeg(0, agent.homeFloor));
    actions.push(actWalkTo(agent.homeFloor, agent.doorWpName));
    if (reserveSeat(agent.homeFloor, agent.deskWpName)) {
        agent._reservedSeatKey = agent.homeFloor + ":" + agent.deskWpName;
        actions.push(actWalkTo(agent.homeFloor, agent.deskWpName));
        actions.push(actSit(agent.deskWpName));
        actions.push(actEnterState("AT_DESK"));
    } else {
        actions.push(actEnterState("ON_FLOOR"));
    }
    for (let i = 0; i < endOfDayTail().length; i += 1) actions.push(endOfDayTail()[i]);
    agent.plan = actions;
}

function planVisitLounge(agent) {
    // Compiled while the agent is at their desk (workers only).
    if (!agent.deskWpName) return null;
    const floorNumber = agent.homeFloor;
    const chosen = pickFrom(["lounge_spot1", "lounge_spot2"]);
    const actions = [actStand()];
    actions.push(actWalkTo(floorNumber, agent.doorWpName));
    actions.push(actWalkTo(floorNumber, "lounge_door"));
    actions.push(actWalkTo(floorNumber, "lounge_center"));
    actions.push(actWalkTo(floorNumber, chosen));
    actions.push(actSit(chosen));   // standing-style spot: just pose + jitter
    actions.push(actEnterState("AT_BREAK"));
    actions.push(actWaitSim(simRandomInt(5, 12)));
    actions.push(actStand());
    actions.push(actWalkTo(floorNumber, agent.doorWpName));
    if (reserveSeat(floorNumber, agent.deskWpName)) {
        agent._reservedSeatKey = floorNumber + ":" + agent.deskWpName;
        actions.push(actWalkTo(floorNumber, agent.deskWpName));
        actions.push(actSit(agent.deskWpName));
        actions.push(actEnterState("AT_DESK"));
    }
    for (let i = 0; i < endOfDayTail().length; i += 1) actions.push(endOfDayTail()[i]);
    agent.plan = actions;
    return true;
}

function planAttendMeeting(agent) {
    let floorNumber = (agent.role === "WORKER") ? agent.homeFloor : 0;
    if (Math.random() > 0.65 || agent.role !== "WORKER") floorNumber = pickFrom(OFFICE_FLOOR_LIST);
    const seatIndex = simRandomInt(0, 3);
    const wpName = "conf_seat" + seatIndex;
    if (!reserveSeat(floorNumber, wpName)) {
        // conference full: lounge break fallback for workers
        return (agent.role === "WORKER" && planVisitLounge(agent)) ? true : null;
    }

    const actions = [];
    let here = (agent.role === "WORKER") ? agent.homeFloor : 0;
    if (agent.role === "WORKER") {
        actions.push(actStand());
        actions.push(actWalkTo(agent.homeFloor, agent.doorWpName));
    }
    appendActions(actions, compileElevatorLeg(here, floorNumber));

    actions.push(actWalkTo(floorNumber, "conf_door"));
    actions.push(actWalkTo(floorNumber, "conf_center"));
    actions.push(actWalkTo(floorNumber, wpName));
    actions.push(actSit(wpName));
    actions.push(actEnterState("IN_MEETING"));
    actions.push(actWaitSim(simRandomInt(22, 45)));
    actions.push(actStand());
    actions.push(releaseSeatByKeyWrap(floorNumber + ":" + wpName));

    if (agent.role === "WORKER") {
        // back to own desk
        appendActions(actions, compileElevatorLeg(floorNumber, agent.homeFloor));
        actions.push(actWalkTo(agent.homeFloor, agent.doorWpName));
        if (reserveSeat(agent.homeFloor, agent.deskWpName)) {
            agent._reservedSeatKey = agent.homeFloor + ":" + agent.deskWpName;
            actions.push(actWalkTo(agent.homeFloor, agent.deskWpName));
            actions.push(actSit(agent.deskWpName));
            actions.push(actEnterState("AT_DESK"));
        }
        appendActions(actions, endOfDayTail());
    } else {
        // visitor: ride back down and leave the building
        appendActions(actions, compileElevatorLeg(floorNumber, 0));
        appendActions(actions, visitorExitTail());
    }
    agent.plan = actions;
    return true;
}

function planVisitCoworker(agent) {
    let target = null;
    for (let tries = 0; tries < 8 && !target; tries += 1) {
        const candidate = pickFrom(agentList);
        if (candidate.role === "WORKER" && candidate.id !== agent.id && candidate.state === "AT_DESK") target = candidate;
    }
    if (!target) return null;
    const floorNumber = target.homeFloor;

    const actions = [];
    let here = 0; // visitors spawn on the sidewalk (logically floor 0)
    if (agent.role === "WORKER") {
        actions.push(actStand());
        actions.push(actWalkTo(agent.homeFloor, agent.doorWpName));
        here = agent.homeFloor;
    }
    appendActions(actions, compileElevatorLeg(here, floorNumber));

    // stand just inside the coworker's office door and chat for a while
    actions.push(actWalkTo(floorNumber, target.doorWpName));
    actions.push(actWaitSim(simRandomInt(6, 18)));
    actions.push(actEnterState("ON_FLOOR"));

    if (agent.role === "WORKER") {
        appendActions(actions, compileElevatorLeg(floorNumber, agent.homeFloor));
        actions.push(actWalkTo(agent.homeFloor, agent.doorWpName));
        if (reserveSeat(agent.homeFloor, agent.deskWpName)) {
            agent._reservedSeatKey = agent.homeFloor + ":" + agent.deskWpName;
            actions.push(actWalkTo(agent.homeFloor, agent.deskWpName));
            actions.push(actSit(agent.deskWpName));
            actions.push(actEnterState("AT_DESK"));
        }
        appendActions(actions, endOfDayTail());
    } else {
        appendActions(actions, compileElevatorLeg(floorNumber, 0));
        appendActions(actions, visitorExitTail());
    }
    agent.plan = actions;
    return true;
}

function visitorExitTail() {
    return [
        actWalkTo(0, "lobby_center"),
        actWalkTo(0, "entrance"),
        actWalkTo(0, "front_door_threshold"),
        actWalkTo(0, "outside"),
        actExitBuilding()
    ];
}

function planVisitorVisit(agent) {
    // Compiled at spawn: the agent is on the sidewalk (logically floor 0).
    const roll = Math.random();
    const actions = [actEnterState("ARRIVING")];
    actions.push(actWalkTo(0, "front_door_threshold"));
    actions.push(actWalkTo(0, "entrance"));

    let bodyPlan = [];
    if (roll < 0.10) {
        // bistro table at the cafe
        const seats = worldRef.floors[0].cafeSpots || [];
        const chosen = pickFrom(seats);
        if (reserveSeat(0, chosen)) {
            bodyPlan = [
                actWalkTo(0, chosen), actSit(chosen),
                actWaitSim(simRandomInt(12, 35)), actStand(),
                releaseSeatByKeyWrap("0:" + chosen)
            ];
        } else {
            bodyPlan = [actWalkTo(0, "cafe_order"), actWaitSim(simRandomInt(4, 9))];
        }
    } else if (roll < 0.16) {
        bodyPlan = [actWalkTo(0, "cafe_order"), actWaitSim(simRandomInt(4, 10))];
    } else if (roll < 0.30) {
        // front lounge
        const spot = pickFrom(["lounge_spot0", "lounge_spot1", "lounge_spot2"]);
        bodyPlan = [actWalkTo(0, "lounge_door"), actWalkTo(0, "lounge_center"), actWalkTo(0, spot), actSit(spot), actWaitSim(simRandomInt(8, 25)), actStand()];
    } else if (roll < 0.42) {
        // back lounge / conversation pit
        const spot = pickFrom(["back_lounge_N", "back_lounge_S", "pit_N", "pit_S", "pit_E", "pit_W"]);
        bodyPlan = [actWalkTo(0, spot), actSit(spot), actWaitSim(simRandomInt(8, 20)), actStand()];
    } else if (roll < 0.52) {
        // reception / kiosk / water cooler
        const spot = pickFrom(["reception", "kiosk", "lobby_wc_front", "lobby_wc_back"]);
        bodyPlan = [actWalkTo(0, spot), actWaitSim(simRandomInt(3, 8))];
    } else if (roll < 0.62) {
        // generic lobby loiter
        const spot = pickFrom(["lobby_stand_center", "lobby_stand_NE", "lobby_stand_NW", "lobby_stand_midE", "lobby_stand_midW", "lobby_stand_entry"]);
        bodyPlan = [actWalkTo(0, spot), actWaitSim(simRandomInt(5, 14)), actStand()];
    } else if (roll < 0.77) {
        // ride up to an office-floor lounge / water cooler
        const floorNumber = pickFrom(OFFICE_FLOOR_LIST);
        appendActions(bodyPlan, compileElevatorLeg(0, floorNumber));
        const spot = pickFrom(["lounge_spot0", "water_cooler", "hall_stand_N", "hall_stand_S"]);
        if (spot === "water_cooler" || spot.indexOf("hall_stand") === 0) {
            bodyPlan.push(actWalkTo(floorNumber, spot), actWaitSim(simRandomInt(4, 10)));
        } else {
            bodyPlan.push(actWalkTo(floorNumber, "lounge_door"), actWalkTo(floorNumber, "lounge_center"), actWalkTo(floorNumber, spot), actSit(spot), actWaitSim(simRandomInt(8, 20)), actStand());
        }
        // ride back down
        appendActions(bodyPlan, compileElevatorLeg(floorNumber, 0));
    } else {
        // sit in on a meeting (client / external attendee archetype)
        const floorNumber = pickFrom(OFFICE_FLOOR_LIST);
        const seatIndex = simRandomInt(0, 3);
        const wpName = "conf_seat" + seatIndex;
        if (reserveSeat(floorNumber, wpName)) {
            appendActions(bodyPlan, compileElevatorLeg(0, floorNumber));
            bodyPlan.push(actWalkTo(floorNumber, "conf_door"), actWalkTo(floorNumber, "conf_center"), actWalkTo(floorNumber, wpName));
            bodyPlan.push(actSit(wpName));
            bodyPlan.push(actEnterState("IN_MEETING"));
            bodyPlan.push(actWaitSim(simRandomInt(20, 45)));
            bodyPlan.push(actStand());
            bodyPlan.push(releaseSeatByKeyWrap(floorNumber + ":" + wpName));
            appendActions(bodyPlan, compileElevatorLeg(floorNumber, 0)); // ride back down
        } else {
            // all seats taken -> lobby loiter instead
            const spot = pickFrom(["lobby_stand_center", "lobby_stand_NE", "lobby_stand_midW"]);
            bodyPlan = [actWalkTo(0, spot), actWaitSim(simRandomInt(6, 15)), actStand()];
        }
    }

    appendActions(actions, bodyPlan);
    // leave: back through the real doorway to the sidewalk
    appendActions(actions, visitorExitTail());
    agent.plan = actions;
}

function releaseSeatByKeyWrap(key) {
    return { type: "RELEASE_SEAT", key: key };
}

// ---------------- decision point ----------------

function chooseNextActivity(agent) {
    if (agent.role === "VISITOR") {
        // visitors run one visit per re-arm; leave through the door
        agent.plan = [actEnterState("LEAVING"), actPickNext()];
        return;
    }
    // workers
    const nowMin = clockRef.simMinute;
    if (nowMin >= agent.departureTime) {
        planLeaveBuilding(agent);
        return;
    }
    for (let i = 0; i < agent.plannedMeetingTimes.length; i += 1) {
        if (nowMin >= agent.plannedMeetingTimes[i]) {
            agent.plannedMeetingTimes.splice(i, 1);
            if (planAttendMeeting(agent)) return;
            // meeting full: fall through to other options
            break;
        }
    }
    if (!agent.hasLunched && nowMin >= agent.lunchTime) {
        planGoToLunch(agent);
        return;
    }
    const roll = Math.random();
    if (roll < 0.14) {
        if (planAttendMeeting(agent)) return;   // ad-hoc meeting (lounge fallback inside)
    } else if (roll < 0.26) {
        if (planVisitLounge(agent)) return;
    } else if (roll < 0.41) {
        if (planVisitCoworker(agent)) return;
    }
    // keep working a while longer, then decide again
    agent.plan = [actWaitSim(simRandomInt(18, 65)), actPickNext()];
}

function planLeaveBuilding(agent) {
    if (agent.role !== "WORKER") return; // visitors finish their own plans
    // Compiled at a decision point: live position is trustworthy here.
    const floor = currentFloorOf(agent);
    const actions = [];
    if (agent.group && agent.group.userData.isSitting) {
        actions.push(actStand());
    }
    releaseSeatByKey(agent._reservedSeatKey);
    agent._reservedSeatKey = null;

    if (floor > 0) {
        if (floor === agent.homeFloor) {
            // leaving from the office: walk out to the elevator hall first
            actions.push(actWalkTo(floor, agent.doorWpName));
        }
        appendActions(actions, compileElevatorLeg(floor, 0));
    }
    actions.push(actEnterState("LEAVING"));
    actions.push(actWalkTo(0, "lobby_center"));
    actions.push(actWalkTo(0, "entrance"));
    actions.push(actWalkTo(0, "front_door_threshold"));
    actions.push(actWalkTo(0, "outside"));
    actions.push(actExitBuilding());
    agent.plan = actions;
}

// ---------------- spawning ----------------

function spawnAgent(agent) {
    if (agent.group) return;
    const group = createPerson({});
    // spawn jitter so same-frame arrivals don't pile on one spot
    const jx = simRandomRange(-1.1, 1.1);
    const jz = simRandomRange(0.35, 1.25);
    group.position.set(jx, 0, 12 + jz * 0.4);
    sceneRoot.add(group);
    agent.group = group;
}

// ---------------- action execution ----------------

function startAction(agent, action) {
    switch (action.type) {
        case "WALK_TO_WP": {
            // initialize exactly once - re-resolving every frame would reset
            // progress and trap agents on the graph node under their feet
            if (action._started) break;
            const resolved = resolveWalkPath(agent, action.floor, action.wpName);
            if (!resolved) {
                agent.currentAction = null; // drop the walk, re-decide soon
                return true;
            }
            action._path = resolved.path;
            action._index = 0;
            action._entranceChain = resolved.entranceChain;
            action._prevPos = agent.group.position.clone();
            action._stallT = 0;
            action._started = true;
            break;
        }
        case "WAIT_AT_PANEL": {
            break;
        }
        case "ENTER_ELEVATOR": {
            if (!action._started) {
                action.phase = "reserve";
                action._prevWalk = null;
                action._stallT = 0;
                action._started = true;
            }
            break;
        }
        case "PRESS_FLOOR": {
            elevatorRef.pressDestination(action.floor);
            return true; // zero duration: complete immediately
        }
        case "WAIT_FOR_FLOOR": {
            break;
        }
        case "EXIT_ELEVATOR": {
            if (!action._started) {
                action.phase = "stepOut";
                action._prevWalk = null;
                action._stallT = 0;
                action._started = true;
            }
            break;
        }
        case "SIT": {
            const floorNumber = currentFloorOf(agent);
            const node = worldRef.floors[floorNumber] ? worldRef.floors[floorNumber].nodes[action.wpName] : null;
            if (!node) return true;
            let targetPos = node.pos.clone();
            const sitTarget = worldRef.floors[floorNumber].sitTargets[action.wpName];
            if (sitTarget && !sitTarget.sit) {
                // standing waypoint: jitter on a small ring so co-assignees spread out
                const ang = Math.random() * Math.PI * 2;
                const rad = simRandomRange(0.35, 0.75);
                targetPos = targetPos.clone().add(new THREE.Vector3(Math.cos(ang) * rad, 0, Math.sin(ang) * rad));
            }
            agent.group.position.set(targetPos.x, floorNumber * WORLD.FLOOR_HEIGHT, targetPos.z);
            agent.group.rotation.y = sitTarget ? sitTarget.facing : 0;
            if (sitTarget && sitTarget.sit) {
                agent.group.userData.isSitting = true;
                // drop the body so hips align with the seat instead of floating
                agent.group.position.y -= DESK_SEAT_DROP;
            }
            return true;
        }
        case "STAND": {
            const inCar = agent.group.parent === elevatorRef.car;
            agent.group.userData.isSitting = false;
            if (!inCar) {
                const floorNumber = currentFloorOf(agent);
                agent.group.position.y = floorNumber * WORLD.FLOOR_HEIGHT;
            } else {
                agent.group.position.y = 0;
            }
            // NOTE: seat reservation is intentionally NOT released here -
            // STAND runs at the start of a plan, long before the next seat.
            return true;
        }
        case "RELEASE_SEAT": {
            releaseSeatByKey(action.key || agent._reservedSeatKey);
            if (!action.key) agent._reservedSeatKey = null;
            return true;
        }
        case "WAIT_SIM": {
            // resolve the deadline exactly once on start (not per frame, not
            // at plan-compile time): waiting must actually terminate
            if (!action._started) {
                action.untilMin = clockRef.simMinute + action.minutes;
                action._started = true;
            }
            break;
        }
        case "EXIT_BUILDING": {
            if (agent.group && agent.group.parent === elevatorRef.car) {
                sceneRoot.attach(agent.group); // preserve world position while detaching
            }
            if (agent.group) sceneRoot.remove(agent.group);
            agent.group = null;
            agent.state = "GONE";
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
            // re-decide; the dispatch loop shifts in the new first action
            chooseNextActivity(agent);
            return true;
        }
        default:
            return true;
    }
}

function stepAction(agent, action, motionDt) {
    switch (action.type) {
        case "WALK_TO_WP": {
            if (walkAlongPath(agent, action, motionDt)) return true;
            return false;
        }
        case "WAIT_AT_PANEL": {
            const floorNumber = action.floor;
            const dir = action.dir;
            // exact destination - never re-derived from direction
            if (dir > 0) elevatorRef.callUp(floorNumber);   // re-press until accepted
            else elevatorRef.callDown(floorNumber);
            if (elevatorRef.isAcceptingAt(floorNumber, dir) && elevatorRef.currentCapacityFree() > 0) {
                agent.state = "WAITING_ELEVATOR";
                return true; // ENTER_ELEVATOR takes over next frame
            }
            return false;
        }
        case "ENTER_ELEVATOR": {
            return stepEnterElevator(agent, action, motionDt);
        }
        case "WAIT_FOR_FLOOR": {
            if (elevatorRef.state === "DOOR_OPEN" && elevatorRef.currentFloor === action.floor) {
                agent.state = "IN_CAR";
                return true;
            }
            return false;
        }
        case "EXIT_ELEVATOR": {
            return stepExitElevator(agent, action, motionDt);
        }
        case "WAIT_SIM": {
            if (clockRef.simMinute >= action.untilMin) return true;
            agent.group.userData.isWalking = false;
            return false;
        }
        default:
            return true;
    }
}

function walkAlongPath(agent, action, motionDt) {
    const group = agent.group;
    if (!group || !action._path || action._index >= action._path.length) return true;
    const target = action._path[action._index];
    const pos = group.position;
    const dx = target.x - pos.x;
    const dz = target.z - pos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const stepLen = PERSON_SPEED * motionDt;

    if (dist <= Math.max(0.12, stepLen)) {
        // reached this waypoint; align facing toward the next one (nose reads direction)
        pos.x = target.x;
        pos.z = target.z;
        action._index += 1;
        if (action._index >= action._path.length) {
            group.userData.isWalking = false;
            return true;
        }
        const nextWp = action._path[action._index];
        group.rotation.y = Math.atan2(nextWp.x - target.x, nextWp.z - target.z);
        group.userData.isWalking = true;
        return false;
    }

    group.rotation.y = Math.atan2(dx, dz);
    pos.x += (dx / dist) * stepLen;
    pos.z += (dz / dist) * stepLen;
    group.userData.isWalking = true;

    // stall recovery: if the crowd has pinned us for >1.2 motion-seconds,
    // skip the current waypoint instead of twitching in place
    const moved = Math.sqrt(
        (pos.x - action._prevPos.x) * (pos.x - action._prevPos.x) +
        (pos.z - action._prevPos.z) * (pos.z - action._prevPos.z)
    );
    if (moved < 0.005 && motionDt > 0) {
        action._stallT += motionDt;
        if (action._stallT > 1.2) {
            action._index += 1;
            action._stallT = 0;
            if (action._index >= action._path.length) {
                group.userData.isWalking = false;
                return true;
            }
        }
    } else {
        action._stallT = 0;
    }
    action._prevPos.set(pos.x, pos.y, pos.z);
    return false;
}

function stepEnterElevator(agent, action, motionDt) {
    const group = agent.group;
    if (!group) return true;
    const toFloor = action.toFloor;
    const floorNumber = currentFloorOf(agent);

    if (action.phase === "reserve") {
        // keep the hall call alive until we actually have a spot
        if (toFloor > floorNumber) elevatorRef.callUp(floorNumber);
        else elevatorRef.callDown(floorNumber);
        let spot = null;
        const desiredDir = toFloor > floorNumber ? 1 : -1;
        // only board when the car is actually serving our direction, so we
        // never catch a car moving the wrong way and bounce around the shaft
        if (elevatorRef.state === "DOOR_OPEN" &&
            elevatorRef.currentFloor === floorNumber &&
            (elevatorRef.direction === desiredDir || elevatorRef.passengers.has(agent)) &&
            elevatorRef.currentCapacityFree() > 0) {
            spot = elevatorRef.reserveBoardingSpot(agent);
        }
        if (!spot) {
            // car slipped away or is full: keep waiting, re-press every frame
            return false;
        }
        action._spot = spot;
        action.phase = "walkIn";
        action._stallT = 0;
        return false;
    }

    if (action.phase === "walkIn") {
        // walk to our own lane at the door threshold (X of our reserved spot)
        const threshold = elevatorRef.doorThreshold(action._spot.index);
        const pos = group.position;
        const dx = threshold.x - pos.x;
        const dz = threshold.z - pos.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        const stepLen = PERSON_SPEED * motionDt;
        if (dist <= Math.max(0.15, stepLen)) {
            pos.x = threshold.x;
            pos.z = threshold.z;
            // step through the doorway and reparent into the car
            sceneRoot.attach(group);
            elevatorRef.car.attach(group);
            group.rotation.y = 0; // face the doors (+Z in car space)
            action.phase = "boardWalk";
            action._prevWalk = pos.clone();
            return false;
        }
        if (motionDt > 0) {
            group.rotation.y = Math.atan2(dx, dz);
            pos.x += (dx / dist) * stepLen;
            pos.z += (dz / dist) * stepLen;
            // stall recovery: crowd in the lobby can trap boarders - after
            // ~1.5 motion-seconds with no progress, snap to the threshold.
            const moved = Math.sqrt((pos.x - action._prevWalk.x) ** 2 + (pos.z - action._prevWalk.z) ** 2);
            if (moved < 0.005) {
                action._stallT += motionDt;
                if (action._stallT > 1.5) {
                    pos.set(threshold.x, threshold.y, threshold.z);
                    action._stallT = 0;
                }
            } else {
                action._stallT = 0;
            }
        }
        group.userData.isWalking = true;
        return false;
    }

    if (action.phase === "boardWalk") {
        const targetLocal = new THREE.Vector3(action._spot.x, 0, action._spot.z);
        const pos = group.position; // car-local now
        const dx = targetLocal.x - pos.x;
        const dz = targetLocal.z - pos.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        const stepLen = PERSON_SPEED * motionDt;
        if (dist <= stepLen) {
            pos.x = targetLocal.x;
            pos.z = targetLocal.z;
            group.rotation.y = 0;
            elevatorRef.completeBoard(agent); // fully aboard now
            return true;
        }
        group.rotation.y = Math.atan2(dx, dz);
        pos.x += (dx / dist) * stepLen;
        pos.z += (dz / dist) * stepLen;
        group.userData.isWalking = true;
        return false;
    }

    return false;
}

function stepExitElevator(agent, action, motionDt) {
    const group = agent.group;
    if (!group) return true;
    const toFloor = action.toFloor;

    if (action.phase === "stepOut") {
        // hold the doors while we move out of the car
        elevatorRef.registerDisembark(agent);
        sceneRoot.attach(group); // preserve world position, leave the car parent
        group.userData.isWalking = true;
        action.phase = "walkOut";
        action._prevWalk = group.position.clone();
        action._stallT = 0;
        return false;
    }

    if (action.phase === "walkOut") {
        const nodes = worldRef.floors[toFloor].nodes;
        const target = nodes.elevWait ? nodes.elevWait.pos : new THREE.Vector3(0, toFloor * WORLD.FLOOR_HEIGHT, 2.75);
        const pos = group.position;
        const dx = target.x - pos.x;
        const dz = target.z - pos.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        const stepLen = PERSON_SPEED * motionDt;
        if (dist <= Math.max(0.12, stepLen)) {
            pos.set(target.x, toFloor * WORLD.FLOOR_HEIGHT, target.z);
            group.userData.isWalking = false;
            elevatorRef.completeDisembark(agent);
            return true;
        }
        group.rotation.y = Math.atan2(dx, dz);
        pos.x += (dx / dist) * stepLen;
        pos.z += (dz / dist) * stepLen;
        if (motionDt > 0) {
            const moved = Math.sqrt((pos.x - action._prevWalk.x) ** 2 + (pos.z - action._prevWalk.z) ** 2);
            if (moved < 0.005) {
                action._stallT += motionDt;
                if (action._stallT > 1.5) {
                    pos.set(target.x, toFloor * WORLD.FLOOR_HEIGHT, target.z);
                    elevatorRef.completeDisembark(agent);
                    group.userData.isWalking = false;
                    return true;
                }
            } else {
                action._stallT = 0;
            }
        }
        action._prevWalk.set(pos.x, pos.y, pos.z);
        return false;
    }
    return false;
}

/**
 * Move to the next plan action (or re-decide when the plan is exhausted).
 * Returns false if the agent has vanished / been disabled (stop dispatching).
 */
function advancePlan(agent) {
    if (agent.state === "GONE" || agent.state === "DISABLED") {
        agent.currentAction = null;
        return false;
    }
    agent.currentAction = null;
    if (agent.plan.length > 0) {
        agent.currentAction = agent.plan.shift();
        return true;
    }
    // plan exhausted without a decision: re-decide right away
    chooseNextActivity(agent);
    if (agent.plan.length > 0) agent.currentAction = agent.plan.shift();
    else agent.currentAction = null;
    return true;
}

// ---------------- per-frame agent update ----------------

function updateAgent(agent, realDt, motionDt) {
    if (agent.state === "DISABLED" || agent.state === "GONE") return;

    // spawn when the arrival time is reached
    if (agent.state === "AWAY") {
        if (agent.arrivalTime <= clockRef.simMinute) {
            spawnAgent(agent);
            if (agent.role === "WORKER") {
                planArriveToDesk(agent);
            } else {
                planVisitorVisit(agent);
            }
            if (agent.plan.length > 0) agent.currentAction = agent.plan.shift();
            agent.state = "ARRIVING";
        } else {
            return;
        }
    }

    // end-of-day override for workers who are not already heading home
    if (agent.role === "WORKER" &&
        clockRef.simMinute >= agent.departureTime &&
        agent.state !== "LEAVING" &&
        agent.state !== "GONE") {
        const inElevator = agent.group && agent.group.parent === elevatorRef.car;
        if (!inElevator) {
            planLeaveBuilding(agent);
            if (agent.plan.length > 0) agent.currentAction = agent.plan.shift();
            return;
        }
    }

    // action dispatch: loop within one frame so zero-duration actions hand off
    // immediately (no one-frame gap where doors can close on a disembarker)
    let iterations = 0;
    while (agent.currentAction && iterations < 16) {
        iterations += 1;
        const action = agent.currentAction;
        if (startAction(agent, action)) {
            // zero-duration action completed at start: advance immediately
            if (!advancePlan(agent)) break;
            continue;
        }
        const done = stepAction(agent, action, motionDt);
        if (done) {
            if (!advancePlan(agent)) break;
        } else {
            break; // still in progress: resume next frame
        }
    }
}

// ---------------- collisions (soft separation, no bunching) ----------------

function applyCollisions(motionDt) {
    const push = 0.18;
    for (let i = 0; i < agentList.length; i += 1) {
        const a = agentList[i];
        if (!a.group || a.state === "DISABLED" || a.state === "GONE") continue;
        if (a.group.userData.isSitting) continue;
        // boarders must push through the lobby crowd to reach their spot
        if (a.currentAction && a.currentAction.type === "ENTER_ELEVATOR") continue;
        const aParent = a.group.parent;
        // agents inside the car keep their pre-assigned spots - no repulsion
        if (aParent === elevatorRef.car) continue;

        for (let j = i + 1; j < agentList.length; j += 1) {
            const b = agentList[j];
            if (!b.group || b.state === "DISABLED" || b.state === "GONE") continue;
            if (b.group.userData.isSitting) continue;
            if (b.currentAction && b.currentAction.type === "ENTER_ELEVATOR") continue;
            if (b.group.parent !== aParent) continue; // different floors / car
            const pa = a.group.position;
            const pb = b.group.position;
            if (Math.abs(pa.y - pb.y) > 1.0) continue;

            let dx = pb.x - pa.x;
            let dz = pb.z - pa.z;
            let d = Math.sqrt(dx * dx + dz * dz);
            if (d >= 0.7) continue;
            if (d < 0.001) {
                // exact overlap: no gradient axis exists - pick a random direction
                const ang = Math.random() * Math.PI * 2;
                dx = Math.cos(ang);
                dz = Math.sin(ang);
                d = 1;
            } else {
                dx /= d;
                dz /= d;
            }
            const overlap = (0.7 - d) * push;
            pa.x -= dx * overlap;
            pa.z -= dz * overlap;
            pb.x += dx * overlap;
            pb.z += dz * overlap;
        }
    }
}

// ---------------- day wrap (new simulated day) ----------------

function doDayWrap() {
    seatReservations.clear();
    // re-arm every enabled agent with a fresh schedule
    for (let i = 0; i < agentList.length; i += 1) {
        const agent = agentList[i];
        if (agent.id >= targetOccupancy) {
            agent.state = "DISABLED";
            continue;
        }
        if (agent.group) {
            sceneRoot.remove(agent.group);
            agent.group = null;
        }
        agent.plan = [];
        agent.currentAction = null;
        agent._reservedSeatKey = null;
        rollWorkerSchedule(agent); // re-rolls all daily times for both roles
        agent.arrivalTime = agent.role === "WORKER"
            ? agent.arrivalTime
            : Math.floor(clockRef.simMinute) + simRandomInt(0, 12);
        agent.state = "AWAY";
    }
    // clear every elevator set and park the car on floor 0 with doors closed
    elevatorRef.reset();
}

// ---------------- HUD ----------------

function buildHud() {
    const panel = document.createElement("div");
    panel.style.cssText = "position:fixed;top:12px;left:12px;z-index:10;background:rgba(10,14,22,0.82);" +
        "border:1px solid #3a465e;border-radius:8px;padding:10px 14px;color:#dfe8ff;font-family:monospace;" +
        "font-size:12px;line-height:1.5;min-width:250px;user-select:none;";

    const timeEl = document.createElement("div");
    timeEl.style.cssText = "font-size:26px;font-weight:bold;color:#ffdd77;margin-bottom:4px;";
    panel.appendChild(timeEl);

    const speedRow = document.createElement("div");
    speedRow.textContent = "Speed: 120x realtime";
    panel.appendChild(speedRow);
    const speedSlider = document.createElement("input");
    speedSlider.type = "range";
    speedSlider.min = "0";
    speedSlider.max = String(SPEED_STOPS.length - 1);
    speedSlider.step = "1";
    speedSlider.value = String(SPEED_STOPS.indexOf(SIM_TIME_SCALE_DEFAULT));
    speedSlider.style.width = "220px";
    speedRow.appendChild(speedSlider);

    const occRow = document.createElement("div");
    occRow.textContent = "Occupancy: " + targetOccupancy + " / " + MAX_OCCUPANCY + " people";
    panel.appendChild(occRow);
    const occSlider = document.createElement("input");
    occSlider.type = "range";
    occSlider.min = "1";
    occSlider.max = String(MAX_OCCUPANCY);
    occSlider.step = "1";
    occSlider.value = String(targetOccupancy);
    occSlider.style.width = "220px";
    occRow.appendChild(occSlider);

    const stateEl = document.createElement("div");
    stateEl.style.cssText = "margin-top:6px;color:#9fb4d8;white-space:pre;";
    panel.appendChild(stateEl);

    document.body.appendChild(panel);

    speedSlider.addEventListener("input", function (event) {
        const idx = parseInt(event.target.value, 10);
        clockRef.timeScale = SPEED_STOPS[idx];
        speedRow.textContent = "Speed: " + SPEED_STOPS[idx] + "x realtime";
    });
    occSlider.addEventListener("input", function (event) {
        targetOccupancy = parseInt(event.target.value, 10);
        occRow.textContent = "Occupancy: " + targetOccupancy + " / " + MAX_OCCUPANCY + " people";
        applyOccupancy();
    });

    return { timeEl: timeEl, stateEl: stateEl };
}

function updateHud(hud) {
    hud.timeEl.textContent = clockRef.format();
    const counts = {};
    for (let i = 0; i < agentList.length; i += 1) {
        const st = agentList[i].state;
        counts[st] = (counts[st] || 0) + 1;
    }
    let lines = "";
    for (const key in counts) {
        lines += key + ": " + counts[key] + "\n";
    }
    const dirArrow = elevatorRef.direction > 0 ? "^" : (elevatorRef.direction < 0 ? "v" : "-");
    lines += "---\n";
    lines += "ELEV floor " + elevatorRef.currentFloor + " " + dirArrow + " [" + elevatorRef.state + "]\n";
    lines += "riders: " + elevatorRef.passengers.size;
    if (elevatorRef.destinations.size > 0) lines += " -> " + Array.from(elevatorRef.destinations).join(",");
    lines += "\nup calls: [" + Array.from(elevatorRef.upCalls).join(",") + "]";
    lines += " down calls: [" + Array.from(elevatorRef.downCalls).join(",") + "]";
    hud.stateEl.textContent = lines;
}

// ---------------- simulation bootstrap + render loop ----------------

function startSimulation() {
    sceneRoot = new THREE.Scene();
    sceneRoot.background = new THREE.Color(0x20242a);
    cameraView = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    cameraView.position.set(28, 24, 28);
    rendererMain = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    rendererMain.setSize(window.innerWidth, window.innerHeight);
    rendererMain.sortObjects = true;
    document.body.appendChild(rendererMain.domElement);
    orbitControls = new THREE.OrbitControls(cameraView, rendererMain.domElement);
    orbitControls.target.set(0, 7, 1);

    ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
    sceneRoot.add(ambientLight);
    hemiLight = new THREE.HemisphereLight(0xbfd7ff, 0x303020, 0.45);
    sceneRoot.add(hemiLight);
    sunLight = new THREE.DirectionalLight(0xffffff, 0.9);
    sunLight.position.set(20, 35, 18);
    sceneRoot.add(sunLight);

    worldRef = createWorld(sceneRoot);
    elevatorRef = new Elevator(sceneRoot, worldRef);

    buildAgents();
    const hud = buildHud();

    updateLighting(clockRef.simMinute / 60);

    lastFrameTime = performance.now();

    function animate() {
        requestAnimationFrame(animate);
        const nowMs = performance.now();
        const realDt = Math.min(0.05, (nowMs - lastFrameTime) / 1000);
        lastFrameTime = nowMs;

        // clock + day wrap
        clockRef.tick(realDt);
        if (clockRef.simMinute >= 24 * 60) {
            clockRef.simMinute -= 24 * 60;
            doDayWrap();
        }

        const hourFloat = clockRef.simMinute / 60;
        updateLighting(hourFloat);

        // motion and sim clock advance together (lockstep model)
        const motionDt = realDt * clockRef.timeScale;

        elevatorRef.tick(motionDt);
        topUpVisitors();

        for (let i = 0; i < agentList.length; i += 1) {
            updateAgent(agentList[i], realDt, motionDt);
        }

        applyCollisions(motionDt);

        // animation for every person still in the scene graph
        for (let i = 0; i < agentList.length; i += 1) {
            const g = agentList[i].group;
            if (g) animatePersonWalking(g, motionDt);
        }

        orbitControls.update();
        rendererMain.render(sceneRoot, cameraView);
        updateHud(hud);
    }
    animate();
}

window.addEventListener("resize", function () {
    if (!cameraView || !rendererMain) return;
    cameraView.aspect = window.innerWidth / window.innerHeight;
    cameraView.updateProjectionMatrix();
    rendererMain.setSize(window.innerWidth, window.innerHeight);
});

if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", startSimulation);
} else {
    startSimulation();
}
