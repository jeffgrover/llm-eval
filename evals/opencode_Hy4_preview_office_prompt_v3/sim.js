/* sim.js - simulated clock, day/night lighting, agent state machines +
   daily schedules, render loop and UI. Classic browser script. */

const MAX_WORKERS = 20;
const MAX_VISITORS = 80;
const MAX_OCCUPANCY = MAX_WORKERS + MAX_VISITORS;
const DEFAULT_OCCUPANCY = 45;
const WALK_SPEED = 1.35;
const SIT_DROP = 0.35;
const SEPARATION_R = 0.7;
const PUSH_SCALAR = 0.18;

const ROLE_WORKER = "WORKER";
const ROLE_VISITOR = "VISITOR";

const FIRST_NAMES = [
    "Ana", "Ben", "Cara", "Dev", "Eli", "Fay", "Gus", "Hana", "Ivan", "Jules",
    "Kira", "Liam", "Mona", "Nate", "Omar", "Pia", "Quin", "Rosa", "Sam", "Tess",
    "Uma", "Victor", "Wren", "Xan", "Yara", "Zev", "Iris", "Otto", "Lena", "Milo",
    "Noor", "Pablo", "Rhea", "Silas", "Tara", "Ugo", "Vera", "Wes", "Zoe", "Bruno"
];

const DAY_KEYFRAMES = [
    { hour: 0, bg: 0x10131a, sun: 0x2a3350, sunI: 0.05, ambI: 0.45, hemiI: 0.32 },
    { hour: 5.0, bg: 0x141824, sun: 0x333d60, sunI: 0.07, ambI: 0.45, hemiI: 0.32 },
    { hour: 6.0, bg: 0x2a2b3c, sun: 0x7a5f55, sunI: 0.2, ambI: 0.46, hemiI: 0.35 },
    { hour: 6.5, bg: 0x6d5a55, sun: 0xff9a55, sunI: 0.55, ambI: 0.48, hemiI: 0.45 },
    { hour: 7.5, bg: 0x8fb6d8, sun: 0xffd9a8, sunI: 0.9, ambI: 0.5, hemiI: 0.55 },
    { hour: 12.0, bg: 0x9ec8ea, sun: 0xffffff, sunI: 1.0, ambI: 0.55, hemiI: 0.6 },
    { hour: 16.0, bg: 0x9cc0e0, sun: 0xfff0d0, sunI: 0.95, ambI: 0.52, hemiI: 0.56 },
    { hour: 17.5, bg: 0xb18a6c, sun: 0xffb070, sunI: 0.68, ambI: 0.5, hemiI: 0.48 },
    { hour: 18.5, bg: 0x534859, sun: 0xd06a4a, sunI: 0.34, ambI: 0.46, hemiI: 0.36 },
    { hour: 19.5, bg: 0x1b2030, sun: 0x3a4a70, sunI: 0.12, ambI: 0.45, hemiI: 0.32 },
    { hour: 24.0, bg: 0x10131a, sun: 0x2a3350, sunI: 0.05, ambI: 0.45, hemiI: 0.32 }
];

let scene;
let camera;
let renderer;
let controls;
let world;
let elevator;
let sunLight;
let ambientLight;
let hemiLight;
let hudRoot;
let hudTime;
let hudStates;
let hudElevator;
let hudSpeedLabel;
let hudOccLabel;

const agents = [];
const seatReservations = new Set();
let allDesks = [];
let targetOccupancy = DEFAULT_OCCUPANCY;

/* ------------------------------------------------------------------ */
/* simulated clock                                                     */
/* ------------------------------------------------------------------ */

const Clock = {
    simMinute: 7 * 60 + 30,
    timeScale: 120,
    lastRealSeconds: null,

    getDelta: function () {
        const now = performance.now() / 1000;
        if (this.lastRealSeconds === null) {
            this.lastRealSeconds = now;
            return 0;
        }
        const delta = now - this.lastRealSeconds;
        this.lastRealSeconds = now;
        if (!isFinite(delta) || delta < 0) return 0;
        return Math.min(0.1, delta);
    },

    tick: function (realDt) {
        this.simMinute += (realDt * this.timeScale) / 60;
        if (this.simMinute >= 24 * 60) {
            this.simMinute = 5 * 60 + 30;
            return true;
        }
        return false;
    },

    format: function () {
        const total = Math.floor(this.simMinute) % (24 * 60);
        const hours24 = Math.floor(total / 60);
        const minutes = total % 60;
        const suffix = hours24 >= 12 ? "PM" : "AM";
        let hours = hours24 % 12;
        if (hours === 0) hours = 12;
        const hourText = hours < 10 ? ` ${hours}` : `${hours}`;
        const minuteText = minutes < 10 ? `0${minutes}` : `${minutes}`;
        return `${hourText}:${minuteText} ${suffix}`;
    }
};

/* ------------------------------------------------------------------ */
/* small helpers                                                       */
/* ------------------------------------------------------------------ */

function randi(min, max) {
    return Math.floor(min + Math.random() * (max - min + 1));
}

function randf(min, max) {
    return min + Math.random() * (max - min);
}

function pickOne(list) {
    if (!list.length) return null;
    return list[Math.floor(Math.random() * list.length)];
}

function shuffleList(list) {
    const copy = list.slice();
    for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = copy[i];
        copy[i] = copy[j];
        copy[j] = tmp;
    }
    return copy;
}

function seatKey(floor, wp) {
    return `${floor}:${wp}`;
}

function reserveSeat(agent, floor, wp) {
    const key = seatKey(floor, wp);
    seatReservations.add(key);
    agent.seatKey = key;
    return key;
}

function releaseSeat(agent) {
    if (agent.seatKey) {
        seatReservations.delete(agent.seatKey);
        agent.seatKey = null;
    }
}

function pickFreeSeat(agent, floor, candidates) {
    for (const wp of shuffleList(candidates)) {
        if (!seatReservations.has(seatKey(floor, wp))) {
            reserveSeat(agent, floor, wp);
            return wp;
        }
    }
    return null;
}

function countStates() {
    const counts = {};
    for (const agent of agents) {
        counts[agent.state] = (counts[agent.state] || 0) + 1;
    }
    return counts;
}

function countPresent() {
    let count = 0;
    for (const agent of agents) {
        if (agent.state === "DISABLED" || agent.state === "AWAY" || agent.state === "GONE") continue;
        count += 1;
    }
    return count;
}

/* ------------------------------------------------------------------ */
/* agents                                                              */
/* ------------------------------------------------------------------ */

function rollSchedule(agent) {
    agent.arrivalTime = randi(8 * 60 + 15, 9 * 60 + 30);
    agent.lunchTime = randi(11 * 60 + 30, 13 * 60 + 30);
    agent.lunchDuration = randi(25, 60);
    if (Math.random() < 0.15) {
        agent.departureTime = randi(18 * 60 + 30, 19 * 60 + 45);
    } else {
        agent.departureTime = randi(16 * 60 + 45, 18 * 60 + 30);
    }
    agent.plannedMeetingTimes = [];
    const meetingCount = randi(0, 2);
    if (meetingCount >= 1) agent.plannedMeetingTimes.push(randi(9 * 60 + 30, 11 * 60 + 30));
    if (meetingCount === 2) agent.plannedMeetingTimes.push(randi(13 * 60, 16 * 60));
    agent.hasLunched = false;
}

function makeAgent(id, role) {
    const group = window.createPerson({});
    group.visible = false;
    group.userData.isWalking = false;
    group.userData.isSitting = false;
    const agent = {
        id: id,
        role: role,
        name: pickOne(FIRST_NAMES),
        group: group,
        state: "DISABLED",
        plan: [],
        currentAction: null,
        actionPhase: null,
        phaseT: 0,
        homeFloor: 1,
        deskId: null,
        deskWpName: null,
        deskDoorWpName: null,
        deskInWpName: null,
        arrivalTime: 0,
        lunchTime: 0,
        lunchDuration: 30,
        departureTime: 0,
        plannedMeetingTimes: [],
        hasLunched: false,
        leaving: false,
        currentFloor: 0,
        inCar: false,
        spot: null,
        seatKey: null,
        path: null,
        pathIndex: 0,
        stallT: 0,
        waitUntil: 0,
        waitSpot: null
    };
    rollSchedule(agent);
    return agent;
}

function buildAgents() {
    agents.length = 0;
    allDesks = [];
    for (const floor of world.floors) {
        for (const desk of floor.desks) allDesks.push(desk);
    }
    for (let i = 0; i < MAX_WORKERS; i += 1) {
        const agent = makeAgent(i, ROLE_WORKER);
        const desk = allDesks[i % Math.max(1, allDesks.length)];
        if (desk) {
            agent.homeFloor = desk.floor;
            agent.deskId = desk.id;
            agent.deskWpName = desk.wpName;
            agent.deskDoorWpName = desk.doorWpName;
            agent.deskInWpName = desk.inWpName;
        }
        agents.push(agent);
    }
    for (let i = 0; i < MAX_VISITORS; i += 1) {
        agents.push(makeAgent(MAX_WORKERS + i, ROLE_VISITOR));
    }
}

function detachAgent(agent) {
    if (agent.group.parent) agent.group.parent.remove(agent.group);
    agent.group.visible = false;
    agent.group.userData.isWalking = false;
    agent.group.userData.isSitting = false;
    agent.inCar = false;
}

function clearElevatorState(agent) {
    const logic = elevator.logic;
    logic.passengers.delete(agent);
    logic.pendingBoarders.delete(agent);
    logic.pendingDisembark.delete(agent);
    logic.releaseSpotFor(agent);
    agent.spot = null;
}

function disableAgent(agent) {
    releaseSeat(agent);
    clearElevatorState(agent);
    detachAgent(agent);
    agent.plan = [];
    agent.currentAction = null;
    agent.state = "DISABLED";
}

function setPlan(agent, plan) {
    if (agent.spot && !agent.inCar) {
        elevator.cancelBoarding(agent);
        agent.spot = null;
    }
    agent.plan = plan || [];
    agent.currentAction = null;
    agent.actionPhase = null;
}

function spawnAgent(agent) {
    const outside = world.floors[0].nodes.outside;
    releaseSeat(agent);
    clearElevatorState(agent);
    agent.group.position.set(outside.x + randf(-1.1, 1.1), 0, outside.z + randf(-0.75, 0.75));
    agent.group.rotation.set(0, Math.PI, 0);
    agent.group.userData.isSitting = false;
    agent.group.userData.isWalking = false;
    agent.group.visible = true;
    scene.add(agent.group);
    agent.currentFloor = 0;
    agent.inCar = false;
    agent.leaving = false;
    agent.state = "ARRIVING";
    setPlan(agent, agent.role === ROLE_WORKER ? planArriveToDesk(agent) : planVisitorVisit(agent));
    updateAgent(agent, 0);
}

/* ------------------------------------------------------------------ */
/* plan compilers                                                      */
/* ------------------------------------------------------------------ */

function travelActions(fromFloor, toFloor) {
    if (fromFloor === toFloor) return [];
    const dir = toFloor > fromFloor ? 1 : -1;
    return [
        { type: "WAIT_AT_PANEL", floor: fromFloor, dir: dir, toFloor: toFloor },
        { type: "ENTER_ELEVATOR", floor: fromFloor, dir: dir, toFloor: toFloor },
        { type: "PRESS_FLOOR", floor: toFloor },
        { type: "WAIT_FOR_FLOOR", floor: toFloor },
        { type: "EXIT_ELEVATOR", toFloor: toFloor }
    ];
}

function backToDeskActions(agent) {
    return [
        { type: "WALK_TO_WP", floor: agent.homeFloor, wp: agent.deskWpName },
        { type: "SIT", floor: agent.homeFloor, wp: agent.deskWpName },
        { type: "ENTER_STATE", state: "AT_DESK" },
        { type: "WAIT_SIM", minutes: randi(20, 60) },
        { type: "PICK_NEXT_ACTIVITY" }
    ];
}

function planWorkMore(agent) {
    return [
        { type: "WAIT_SIM", minutes: randi(18, 65) },
        { type: "PICK_NEXT_ACTIVITY" }
    ];
}

function planArriveToDesk(agent) {
    const f = agent.homeFloor;
    return [
        { type: "ENTER_STATE", state: "ARRIVING" },
        { type: "WALK_TO_WP", floor: 0, wp: "front_door_threshold" },
        { type: "WALK_TO_WP", floor: 0, wp: "entrance" },
        { type: "WALK_TO_WP", floor: 0, wp: "lobby_center" },
        { type: "WAIT_AT_PANEL", floor: 0, dir: 1, toFloor: f },
        { type: "ENTER_ELEVATOR", floor: 0, dir: 1, toFloor: f },
        { type: "PRESS_FLOOR", floor: f },
        { type: "WAIT_FOR_FLOOR", floor: f },
        { type: "EXIT_ELEVATOR", toFloor: f },
        { type: "ENTER_STATE", state: "ON_FLOOR" },
        { type: "WALK_TO_WP", floor: f, wp: agent.deskWpName },
        { type: "SIT", floor: f, wp: agent.deskWpName },
        { type: "ENTER_STATE", state: "AT_DESK" },
        { type: "WAIT_SIM", minutes: randi(25, 70) },
        { type: "PICK_NEXT_ACTIVITY" }
    ];
}

function planGoToLunch(agent) {
    const f = agent.homeFloor;
    const seat = pickFreeSeat(agent, 0, world.floors[0].cafeSeats);
    if (!seat) return planVisitLounge(agent);
    const prefix = [
        { type: "ENTER_STATE", state: "AT_BREAK" },
        { type: "STAND" }
    ];
    return prefix
        .concat(travelActions(f, 0))
        .concat([
            { type: "ENTER_STATE", state: "AT_LUNCH" },
            { type: "WALK_TO_WP", floor: 0, wp: "lobby_center" },
            { type: "WALK_TO_WP", floor: 0, wp: seat },
            { type: "SIT", floor: 0, wp: seat },
            { type: "WAIT_SIM", minutes: agent.lunchDuration },
            { type: "MARK_LUNCHED" },
            { type: "STAND" },
            { type: "RELEASE_SEAT" },
            { type: "WALK_TO_WP", floor: 0, wp: "lobby_center" }
        ])
        .concat(travelActions(0, f))
        .concat(backToDeskActions(agent));
}

function planVisitLounge(agent) {
    const f = agent.homeFloor;
    const floorObj = world.floors[f];
    const seat = pickFreeSeat(agent, f, floorObj.loungeSeats.concat(["water_cooler"]));
    if (!seat) return planWorkMore(agent);
    const actions = [
        { type: "ENTER_STATE", state: "AT_BREAK" },
        { type: "STAND" },
        { type: "WALK_TO_WP", floor: f, wp: "lounge_door" },
        { type: "WALK_TO_WP", floor: f, wp: seat },
        { type: "SIT", floor: f, wp: seat },
        { type: "WAIT_SIM", minutes: randi(5, 12) },
        { type: "STAND" },
        { type: "RELEASE_SEAT" },
        { type: "WALK_TO_WP", floor: f, wp: "lounge_door" }
    ];
    return actions.concat(backToDeskActions(agent));
}

function planAttendMeeting(agent) {
    const f = Math.random() < 0.65 ? agent.homeFloor : randi(1, WORLD.FLOOR_COUNT - 1);
    const seat = pickFreeSeat(agent, f, world.floors[f].confSeats);
    if (!seat) return planVisitLounge(agent);
    return [
        { type: "ENTER_STATE", state: "IN_MEETING" },
        { type: "STAND" }
    ]
        .concat(travelActions(agent.homeFloor, f))
        .concat([
            { type: "WALK_TO_WP", floor: f, wp: "conf_door" },
            { type: "WALK_TO_WP", floor: f, wp: seat },
            { type: "SIT", floor: f, wp: seat },
            { type: "WAIT_SIM", minutes: randi(22, 45) },
            { type: "STAND" },
            { type: "RELEASE_SEAT" },
            { type: "WALK_TO_WP", floor: f, wp: "conf_door" }
        ])
        .concat(travelActions(f, agent.homeFloor))
        .concat(backToDeskActions(agent));
}

function planVisitCoworker(agent) {
    const candidates = agents.filter((other) =>
        other !== agent && other.role === ROLE_WORKER && other.state === "AT_DESK" && other.deskInWpName
    );
    if (!candidates.length) return planWorkMore(agent);
    const target = pickOne(candidates);
    const f = target.homeFloor;
    return [
        { type: "ENTER_STATE", state: "VISITING" },
        { type: "STAND" }
    ]
        .concat(travelActions(agent.homeFloor, f))
        .concat([
            { type: "WALK_TO_WP", floor: f, wp: target.deskInWpName },
            { type: "WAIT_SIM", minutes: randi(6, 18) }
        ])
        .concat(travelActions(f, agent.homeFloor))
        .concat(backToDeskActions(agent));
}

function planLeaveBuilding(agent) {
    const actions = [
        { type: "ENTER_STATE", state: "LEAVING" },
        { type: "STAND" }
    ];
    if (agent.homeFloor !== 0) {
        actions.push({ type: "WALK_TO_WP", floor: agent.homeFloor, wp: "elevWait" });
        actions.push(...travelActions(agent.homeFloor, 0));
    }
    return actions.concat([
        { type: "WALK_TO_WP", floor: 0, wp: "lobby_center" },
        { type: "WALK_TO_WP", floor: 0, wp: "entrance" },
        { type: "WALK_TO_WP", floor: 0, wp: "front_door_threshold" },
        { type: "WALK_TO_WP", floor: 0, wp: "outside" },
        { type: "EXIT_BUILDING" }
    ]);
}

function exitBuildingActions() {
    return [
        { type: "WALK_TO_WP", floor: 0, wp: "lobby_center" },
        { type: "WALK_TO_WP", floor: 0, wp: "entrance" },
        { type: "WALK_TO_WP", floor: 0, wp: "front_door_threshold" },
        { type: "WALK_TO_WP", floor: 0, wp: "outside" },
        { type: "EXIT_BUILDING" }
    ];
}

function planVisitorVisit(agent) {
    const lobby = world.floors[0];
    const actions = [
        { type: "ENTER_STATE", state: "ARRIVING" },
        { type: "WALK_TO_WP", floor: 0, wp: "front_door_threshold" },
        { type: "WALK_TO_WP", floor: 0, wp: "entrance" },
        { type: "WALK_TO_WP", floor: 0, wp: "lobby_center" },
        { type: "ENTER_STATE", state: "VISITING" }
    ];

    const roll = Math.random();
    let activity = [];

    if (roll < 0.1) {
        // bistro table
        const seat = pickFreeSeat(agent, 0, lobby.cafeSeats);
        if (seat) {
            activity = [
                { type: "WALK_TO_WP", floor: 0, wp: "cafe_door" },
                { type: "WALK_TO_WP", floor: 0, wp: seat },
                { type: "SIT", floor: 0, wp: seat },
                { type: "WAIT_SIM", minutes: randi(12, 30) },
                { type: "STAND" },
                { type: "RELEASE_SEAT" }
            ];
        }
    } else if (roll < 0.16) {
        // cafe counter
        activity = [
            { type: "WALK_TO_WP", floor: 0, wp: "cafe_door" },
            { type: "WALK_TO_WP", floor: 0, wp: "cafe_order" },
            { type: "SIT", floor: 0, wp: "cafe_order" },
            { type: "WAIT_SIM", minutes: randi(3, 7) },
            { type: "STAND" }
        ];
    } else if (roll < 0.3) {
        // front lounge
        const seat = pickFreeSeat(agent, 0, lobby.loungeSeats);
        if (seat) {
            activity = [
                { type: "WALK_TO_WP", floor: 0, wp: "fl_door" },
                { type: "WALK_TO_WP", floor: 0, wp: seat },
                { type: "SIT", floor: 0, wp: seat },
                { type: "WAIT_SIM", minutes: randi(10, 25) },
                { type: "STAND" },
                { type: "RELEASE_SEAT" }
            ];
        }
    } else if (roll < 0.42) {
        // back lounge or conversation pit
        const seat = pickFreeSeat(agent, 0, lobby.backLounge.concat(lobby.pitSeats));
        if (seat) {
            activity = [
                { type: "WALK_TO_WP", floor: 0, wp: "back_mid" },
                { type: "WALK_TO_WP", floor: 0, wp: seat },
                { type: "SIT", floor: 0, wp: seat },
                { type: "WAIT_SIM", minutes: randi(10, 25) },
                { type: "STAND" },
                { type: "RELEASE_SEAT" }
            ];
        }
    } else if (roll < 0.52) {
        // quick errand: reception / kiosk / water cooler
        const spot = pickFreeSeat(agent, 0, lobby.quickSpots);
        if (spot) {
            activity = [
                { type: "WALK_TO_WP", floor: 0, wp: spot },
                { type: "SIT", floor: 0, wp: spot },
                { type: "WAIT_SIM", minutes: randi(2, 6) },
                { type: "STAND" },
                { type: "RELEASE_SEAT" }
            ];
        }
    } else if (roll < 0.62) {
        // lobby loiter
        const spot = pickOne(lobby.standSpots);
        if (spot) {
            activity = [
                { type: "WALK_TO_WP", floor: 0, wp: spot },
                { type: "SIT", floor: 0, wp: spot },
                { type: "WAIT_SIM", minutes: randi(4, 12) },
                { type: "STAND" }
            ];
        }
    } else if (roll < 0.77) {
        // ride up to an office-floor lounge
        const f = randi(1, WORLD.FLOOR_COUNT - 1);
        const seat = pickFreeSeat(agent, f, world.floors[f].loungeSeats.concat(["water_cooler"]));
        if (seat) {
            activity = travelActions(0, f)
                .concat([
                    { type: "WALK_TO_WP", floor: f, wp: "lounge_door" },
                    { type: "WALK_TO_WP", floor: f, wp: seat },
                    { type: "SIT", floor: f, wp: seat },
                    { type: "WAIT_SIM", minutes: randi(8, 20) },
                    { type: "STAND" },
                    { type: "RELEASE_SEAT" },
                    { type: "WALK_TO_WP", floor: f, wp: "lounge_door" },
                    { type: "WALK_TO_WP", floor: f, wp: "elevWait" }
                ])
                .concat(travelActions(f, 0));
        }
    } else {
        // sit in on a meeting somewhere upstairs
        const f = randi(1, WORLD.FLOOR_COUNT - 1);
        const confSeat = pickFreeSeat(agent, f, world.floors[f].confSeats);
        if (confSeat) {
            activity = travelActions(0, f)
                .concat([
                    { type: "WALK_TO_WP", floor: f, wp: "conf_door" },
                    { type: "WALK_TO_WP", floor: f, wp: confSeat },
                    { type: "SIT", floor: f, wp: confSeat },
                    { type: "WAIT_SIM", minutes: randi(20, 45) },
                    { type: "STAND" },
                    { type: "RELEASE_SEAT" },
                    { type: "WALK_TO_WP", floor: f, wp: "conf_door" },
                    { type: "WALK_TO_WP", floor: f, wp: "elevWait" }
                ])
                .concat(travelActions(f, 0));
        }
    }

    if (!activity.length) {
        const spot = pickOne(lobby.standSpots) || "lobby_stand_center";
        activity = [
            { type: "WALK_TO_WP", floor: 0, wp: spot },
            { type: "SIT", floor: 0, wp: spot },
            { type: "WAIT_SIM", minutes: randi(4, 12) },
            { type: "STAND" }
        ];
    }

    return actions.concat(activity).concat(exitBuildingActions());
}

function chooseNextActivity(agent) {
    if (agent.role === ROLE_VISITOR) {
        setPlan(agent, planVisitorVisit(agent));
        return;
    }
    if (Clock.simMinute >= agent.departureTime) {
        agent.leaving = true;
        releaseSeat(agent);
        setPlan(agent, planLeaveBuilding(agent));
        return;
    }
    for (let i = 0; i < agent.plannedMeetingTimes.length; i += 1) {
        if (Clock.simMinute >= agent.plannedMeetingTimes[i]) {
            agent.plannedMeetingTimes.splice(i, 1);
            setPlan(agent, planAttendMeeting(agent));
            return;
        }
    }
    if (!agent.hasLunched && Clock.simMinute >= agent.lunchTime) {
        setPlan(agent, planGoToLunch(agent));
        return;
    }
    const roll = Math.random();
    if (roll < 0.14) {
        setPlan(agent, planAttendMeeting(agent));
        return;
    }
    if (roll < 0.26) {
        setPlan(agent, planVisitLounge(agent));
        return;
    }
    if (roll < 0.41) {
        setPlan(agent, planVisitCoworker(agent));
        return;
    }
    setPlan(agent, planWorkMore(agent));
}

/* ------------------------------------------------------------------ */
/* action execution                                                    */
/* ------------------------------------------------------------------ */

function pathFromTo(floorIndex, fromX, fromZ, wpName) {
    const floorObj = world.floors[floorIndex];
    const target = floorObj.nodes[wpName];
    if (!target) return null;
    const startName = nearestNodeName(floorObj, fromX, fromZ) || wpName;
    let path = world.bfsPath(floorObj.nodes, startName, wpName);
    if (!path || !path.length) path = [target.clone()];
    path = [new THREE.Vector3(fromX, floorObj.floorY, fromZ)].concat(path);
    path[path.length - 1] = target.clone();
    return path;
}

function walkAlongPath(agent, dt, y, stallLimit) {
    const pos = agent.group.position;
    pos.y = y;
    const path = agent.path;
    if (!path || agent.pathIndex >= path.length) {
        agent.group.userData.isWalking = false;
        return true;
    }
    const startX = pos.x;
    const startZ = pos.z;
    const beforeIndex = agent.pathIndex;
    let beforeDist = null;
    const wp0 = path[beforeIndex];
    if (wp0) beforeDist = Math.hypot(wp0.x - pos.x, wp0.z - pos.z);

    let remaining = WALK_SPEED * dt;
    let moved = 0;
    while (remaining > 0 && agent.pathIndex < path.length) {
        const wp = path[agent.pathIndex];
        const dx = wp.x - pos.x;
        const dz = wp.z - pos.z;
        const dist = Math.hypot(dx, dz);
        if (dist <= remaining || dist < 0.04) {
            pos.x = wp.x;
            pos.z = wp.z;
            moved += dist;
            remaining -= dist;
            agent.pathIndex += 1;
        } else {
            pos.x += (dx / dist) * remaining;
            pos.z += (dz / dist) * remaining;
            moved += remaining;
            remaining = 0;
        }
    }
    if (moved > 0.0001) {
        agent.group.rotation.set(0, Math.atan2(pos.x - startX, pos.z - startZ), 0);
    }
    agent.group.userData.isWalking = true;

    if (agent.pathIndex >= path.length) {
        agent.group.userData.isWalking = false;
        agent.stallT = 0;
        return true;
    }

    const nextWp = path[agent.pathIndex];
    const afterDist = Math.hypot(nextWp.x - pos.x, nextWp.z - pos.z);
    if (agent.pathIndex === beforeIndex && beforeDist !== null && beforeDist > 0.25 && beforeDist - afterDist < 0.02) {
        agent.stallT += dt;
        if (agent.stallT > (stallLimit || 1.2)) {
            agent.pathIndex += 1;
            agent.stallT = 0;
        }
    } else {
        agent.stallT = 0;
    }
    return false;
}

function isEntranceWaypoint(wp) {
    return wp === "outside" || wp === "front_door_threshold" || wp === "entrance";
}

function startAction(agent, action) {
    agent.currentAction = action;
    agent.actionPhase = null;
    agent.phaseT = 0;
    agent.stallT = 0;

    if (action.type === "WALK_TO_WP") {
        const floorObj = world.floors[action.floor];
        if (!floorObj || !floorObj.nodes[action.wp]) {
            finishAction(agent);
            return;
        }
        if (agent.inCar) {
            // safety: never walk floor coordinates from inside the car
            finishAction(agent);
            return;
        }
        const pos = agent.group.position;
        if (Math.abs(pos.y - floorObj.floorY) > 1.5) {
            pos.y = floorObj.floorY;
            agent.currentFloor = action.floor;
        }
        agent.currentFloor = action.floor;
        agent.path = pathFromTo(action.floor, pos.x, pos.z, action.wp);
        agent.pathIndex = 1;
        return;
    }

    if (action.type === "WAIT_AT_PANEL") {
        const floorObj = world.floors[action.floor];
        const elevWait = floorObj.nodes.elevWait;
        agent.waitOffsetX = randf(-2.3, 2.3);
        agent.waitOffsetZ = randf(-0.2, 1.8);
        const target = new THREE.Vector3(
            Math.max(-2.7, Math.min(2.7, elevWait.x + agent.waitOffsetX)),
            0,
            Math.max(1.9, Math.min(4.4, elevWait.z + agent.waitOffsetZ))
        );
        agent.waitSpot = target;
        const pos = agent.group.position;
        if (Math.abs(pos.y - floorObj.floorY) > 1.5) {
            pos.y = floorObj.floorY;
            agent.currentFloor = action.floor;
        }
        agent.currentFloor = action.floor;
        agent.path = pathFromTo(action.floor, pos.x, pos.z, "elevWait");
        agent.path[agent.path.length - 1] = target.clone();
        agent.pathIndex = 1;
        agent.actionPhase = "walk";
        agent.state = "WAITING_ELEVATOR";
        return;
    }

    if (action.type === "ENTER_ELEVATOR") {
        agent.actionPhase = "reserve";
        agent.spot = null;
        agent.state = "WAITING_ELEVATOR";
        return;
    }

    if (action.type === "WAIT_SIM") {
        agent.waitUntil = Clock.simMinute + action.minutes;
        agent.group.userData.isWalking = false;
        return;
    }

    if (action.type === "EXIT_ELEVATOR") {
        agent.actionPhase = "step_out";
        return;
    }
}

function finishAction(agent) {
    agent.currentAction = null;
    agent.actionPhase = null;
    agent.path = null;
    agent.pathIndex = 0;
    agent.stallT = 0;
}

function updateAction(agent, dt) {
    const action = agent.currentAction;
    if (!action) return true;

    if (action.type === "WALK_TO_WP") {
        const floorObj = world.floors[action.floor];
        const entranceHop = isEntranceWaypoint(action.wp);
        const limit = entranceHop ? 0.8 : 1.2;
        const done = walkAlongPath(agent, dt, floorObj.floorY, limit);
        if (!done && entranceHop && agent.stallT > 0.5) {
            const target = floorObj.nodes[action.wp];
            agent.group.position.set(target.x, floorObj.floorY, target.z);
            agent.group.userData.isWalking = false;
            done = true;
        }
        return done;
    }

    if (action.type === "WAIT_AT_PANEL") {
        const floorObj = world.floors[action.floor];
        if (agent.actionPhase === "walk") {
            const done = walkAlongPath(agent, dt, floorObj.floorY, 1.2);
            if (done) {
                agent.actionPhase = "wait";
                agent.group.userData.isWalking = false;
                agent.group.rotation.set(0, Math.PI, 0);
            }
            return false;
        }
        agent.group.userData.isWalking = false;
        if (agent.waitSpot) {
            const dx = agent.waitSpot.x - agent.group.position.x;
            const dz = agent.waitSpot.z - agent.group.position.z;
            if (Math.hypot(dx, dz) > 1.4) {
                const pos = agent.group.position;
                agent.path = [new THREE.Vector3(pos.x, floorObj.floorY, pos.z), agent.waitSpot.clone()];
                agent.pathIndex = 1;
                agent.actionPhase = "walk";
                return false;
            }
        }
        // re-press the hall call every frame: another direction's cycle may
        // have cleared it while this rider is still waiting.
        if (action.dir > 0) elevator.callUp(action.floor);
        else elevator.callDown(action.floor);
        agent.state = "WAITING_ELEVATOR";
        const accepting = elevator.isAcceptingAt(action.floor, action.dir);
        return accepting && elevator.currentCapacityFree() > 0;
    }

    if (action.type === "ENTER_ELEVATOR") {
        const floor = action.floor !== undefined ? action.floor : agent.currentFloor;
        const floorObj = world.floors[floor];
        // car left without us: snap aboard so nobody is stranded mid-boarding
        if (agent.spot && !agent.inCar && elevator.currentFloor !== floor && elevator.state === "MOVING") {
            teleportIntoCar(agent);
            return true;
        }
        if (agent.actionPhase === "reserve") {
            if (action.dir > 0) elevator.callUp(floor);
            else elevator.callDown(floor);
            const spot = elevator.reserveBoardingSpot(agent);
            if (spot) {
                agent.spot = spot;
                agent.actionPhase = "walkDoor";
                const pos = agent.group.position;
                const threshold = new THREE.Vector3(spot.x * 0.7, floorObj.floorY, 1.62);
                agent.path = [new THREE.Vector3(pos.x, floorObj.floorY, pos.z), threshold];
                agent.pathIndex = 1;
                agent.stallT = 0;
            } else {
                agent.phaseT += dt;
                agent.group.userData.isWalking = false;
                if (agent.phaseT > 240) {
                    // give up on this trip and re-plan later
                    agent.phaseT = 0;
                    finishAction(agent);
                    setPlan(agent, planWorkMore(agent));
                    return true;
                }
            }
            return false;
        }
        if (agent.actionPhase === "walkDoor") {
            const done = walkAlongPath(agent, dt, floorObj.floorY, 1.2);
            if (agent.stallT > 1.5) {
                const threshold = agent.path[agent.path.length - 1];
                agent.group.position.set(threshold.x, floorObj.floorY, threshold.z);
                done = true;
            }
            if (done) {
                agent.actionPhase = "enter";
                agent.group.userData.isWalking = false;
            }
            return false;
        }
        if (agent.actionPhase === "enter") {
            elevator.car.attach(agent.group);
            agent.inCar = true;
            agent.currentFloor = action.toFloor;
            agent.group.position.y = 0;
            agent.actionPhase = "walkSpot";
            const pos = agent.group.position;
            const spot = agent.spot;
            agent.path = [
                new THREE.Vector3(pos.x, 0, pos.z),
                new THREE.Vector3(spot.x, 0, spot.z)
            ];
            agent.pathIndex = 1;
            agent.stallT = 0;
            return false;
        }
        if (agent.actionPhase === "walkSpot") {
            const done = walkAlongPath(agent, dt, 0, 0.8);
            if (agent.stallT > 1.0) {
                const spot = agent.spot;
                agent.group.position.set(spot.x, 0, spot.z);
                done = true;
            }
            if (done) {
                elevator.completeBoard(agent);
                agent.group.userData.isWalking = false;
                agent.group.rotation.set(0, 0, 0);
                agent.state = "IN_CAR";
                finishAction(agent);
                return true;
            }
            return false;
        }
        finishAction(agent);
        return true;
    }

    if (action.type === "PRESS_FLOOR") {
        elevator.pressDestination(action.floor);
        finishAction(agent);
        return true;
    }

    if (action.type === "WAIT_FOR_FLOOR") {
        agent.group.userData.isWalking = false;
        if (!elevator.logic.passengers.has(agent)) return true;
        return elevator.state === "DOOR_OPEN" && elevator.currentFloor === action.floor;
    }

    if (action.type === "EXIT_ELEVATOR") {
        const floorObj = world.floors[action.toFloor];
        if (agent.inCar || agent.group.parent === elevator.car) {
            elevator.registerDisembark(agent);
            scene.attach(agent.group);
            agent.inCar = false;
            agent.currentFloor = action.toFloor;
            agent.group.position.y = floorObj.floorY;
            agent.state = "ON_FLOOR";
            const pos = agent.group.position;
            const elevWait = floorObj.nodes.elevWait;
            agent.path = [
                new THREE.Vector3(pos.x, floorObj.floorY, pos.z),
                new THREE.Vector3(pos.x * 0.5, floorObj.floorY, 2.0),
                new THREE.Vector3(elevWait.x, floorObj.floorY, elevWait.z)
            ];
            agent.pathIndex = 1;
            agent.stallT = 0;
            return false;
        }
        const done = walkAlongPath(agent, dt, floorObj.floorY, 1.0);
        if (agent.stallT > 1.2) {
            const elevWait = floorObj.nodes.elevWait;
            agent.group.position.set(
                elevWait.x + randf(-0.8, 0.8),
                floorObj.floorY,
                elevWait.z + randf(-0.3, 0.9)
            );
            agent.stallT = 0;
            elevator.completeDisembark(agent);
            finishAction(agent);
            return true;
        }
        if (done) {
            elevator.completeDisembark(agent);
            agent.group.userData.isWalking = false;
            agent.currentFloor = action.toFloor;
            finishAction(agent);
            return true;
        }
        return false;
    }

    if (action.type === "SIT") {
        const floorObj = world.floors[action.floor];
        const node = floorObj.nodes[action.wp];
        const target = floorObj.sitTargets[action.wp] || { sit: false, facing: 0 };
        let x = node.x;
        let z = node.z;
        if (!target.sit) {
            const angle = Math.random() * Math.PI * 2;
            const radius = randf(0.35, 0.75);
            x += Math.cos(angle) * radius;
            z += Math.sin(angle) * radius;
        }
        agent.group.position.set(x, floorObj.floorY - (target.sit ? SIT_DROP : 0), z);
        agent.group.rotation.set(0, target.facing, 0);
        agent.group.userData.isSitting = !!target.sit;
        agent.group.userData.isWalking = false;
        agent.currentFloor = action.floor;
        finishAction(agent);
        return true;
    }

    if (action.type === "STAND") {
        agent.group.userData.isSitting = false;
        agent.group.position.y = agent.inCar ? 0 : agent.currentFloor * WORLD.FLOOR_HEIGHT;
        finishAction(agent);
        return true;
    }

    if (action.type === "RELEASE_SEAT") {
        releaseSeat(agent);
        finishAction(agent);
        return true;
    }

    if (action.type === "WAIT_SIM") {
        agent.group.userData.isWalking = false;
        return Clock.simMinute >= agent.waitUntil;
    }

    if (action.type === "EXIT_BUILDING") {
        releaseSeat(agent);
        clearElevatorState(agent);
        detachAgent(agent);
        agent.state = "GONE";
        agent.plan = [];
        finishAction(agent);
        return true;
    }

    if (action.type === "ENTER_STATE") {
        agent.state = action.state;
        finishAction(agent);
        return true;
    }

    if (action.type === "MARK_LUNCHED") {
        agent.hasLunched = true;
        finishAction(agent);
        return true;
    }

    if (action.type === "PICK_NEXT_ACTIVITY") {
        finishAction(agent);
        chooseNextActivity(agent);
        return true;
    }

    finishAction(agent);
    return true;
}

function teleportIntoCar(agent) {
    const spot = agent.spot || { x: 0, z: 0 };
    elevator.car.attach(agent.group);
    agent.inCar = true;
    agent.group.position.set(spot.x, 0, spot.z);
    agent.group.rotation.set(0, 0, 0);
    agent.group.userData.isWalking = false;
    elevator.completeBoard(agent);
    agent.state = "IN_CAR";
}

/* ------------------------------------------------------------------ */
/* per-frame agent update                                              */
/* ------------------------------------------------------------------ */

function updateAgent(agent, dt) {
    if (agent.state === "DISABLED" || agent.state === "AWAY" || agent.state === "GONE") return;
    let iterations = 0;
    while (iterations < 16) {
        iterations += 1;
        if (!agent.currentAction) {
            if (!agent.plan.length) {
                agent.plan = planWorkMore(agent);
            }
            const next = agent.plan.shift();
            startAction(agent, next);
            if (!agent.currentAction) continue;
        }
        const done = updateAction(agent, dt);
        if (!done) return;
        if (agent.currentAction) finishAction(agent);
    }
}

function processDailySchedule(agent) {
    if (agent.state === "DISABLED" || agent.state === "GONE") return;
    if (agent.state === "AWAY") {
        if (Clock.simMinute >= agent.arrivalTime) spawnAgent(agent);
        return;
    }
    if (agent.role !== ROLE_WORKER) return;
    if (agent.leaving || agent.inCar) return;
    if (Clock.simMinute >= agent.departureTime) {
        agent.leaving = true;
        releaseSeat(agent);
        setPlan(agent, planLeaveBuilding(agent));
    }
}

function topUpVisitors() {
    if (Clock.simMinute < 7 * 60 || Clock.simMinute > 20 * 60) return;
    const deficit = targetOccupancy - countPresent();
    if (deficit <= 0) return;
    let armed = 0;
    for (const agent of agents) {
        if (armed >= deficit) break;
        if (agent.role !== ROLE_VISITOR) continue;
        if (agent.id >= targetOccupancy) {
            if (agent.state === "AWAY" || agent.state === "GONE") disableAgent(agent);
            continue;
        }
        if (agent.state !== "AWAY" && agent.state !== "GONE") continue;
        agent.state = "AWAY";
        agent.arrivalTime = Clock.simMinute + randi(0, 6);
        agent.lunchDuration = randi(10, 30);
        armed += 1;
    }
}

function applyOccupancy() {
    for (const agent of agents) {
        if (agent.id < targetOccupancy) {
            if (agent.state === "DISABLED") {
                agent.state = "AWAY";
                rollSchedule(agent);
            }
        } else if (agent.state === "AWAY" || agent.state === "GONE") {
            disableAgent(agent);
        }
    }
}

function resetForNewDay() {
    elevator.reset();
    seatReservations.clear();
    for (const agent of agents) {
        releaseSeat(agent);
        clearElevatorState(agent);
        detachAgent(agent);
        agent.plan = [];
        agent.currentAction = null;
        agent.actionPhase = null;
        agent.hasLunched = false;
        agent.leaving = false;
        agent.currentFloor = 0;
        agent.inCar = false;
        agent.spot = null;
        rollSchedule(agent);
        agent.state = agent.id < targetOccupancy ? "AWAY" : "DISABLED";
    }
}

/* ------------------------------------------------------------------ */
/* collisions                                                          */
/* ------------------------------------------------------------------ */

function collisionExempt(agent) {
    const action = agent.currentAction;
    if (action && action.type === "ENTER_ELEVATOR") return true;
    if (action && action.type === "WALK_TO_WP" && isEntranceWaypoint(action.wp)) return true;
    if (agent.group.position.z > 8.4) return true;
    return false;
}

function applyCollisions() {
    const active = [];
    for (const agent of agents) {
        if (agent.state === "DISABLED" || agent.state === "AWAY" || agent.state === "GONE") continue;
        if (!agent.group.parent) continue;
        if (agent.inCar) continue;
        active.push(agent);
    }
    for (let i = 0; i < active.length; i += 1) {
        const a = active[i];
        if (a.group.userData.isSitting) continue;
        if (collisionExempt(a)) continue;
        const pa = a.group.position;
        for (let j = i + 1; j < active.length; j += 1) {
            const b = active[j];
            const pb = b.group.position;
            if (Math.abs(pa.y - pb.y) > 1.0) continue;
            let dx = pa.x - pb.x;
            let dz = pa.z - pb.z;
            let dist = Math.hypot(dx, dz);
            if (dist >= SEPARATION_R) continue;
            if (dist < 0.001) {
                const angle = Math.random() * Math.PI * 2;
                dx = Math.cos(angle);
                dz = Math.sin(angle);
                dist = 0.001;
            }
            const push = (SEPARATION_R - dist) * PUSH_SCALAR;
            const nx = (dx / dist) * push;
            const nz = (dz / dist) * push;
            const bFixed = b.group.userData.isSitting || collisionExempt(b);
            if (bFixed) {
                pa.x += nx;
                pa.z += nz;
            } else {
                pa.x += nx * 0.5;
                pa.z += nz * 0.5;
                pb.x -= nx * 0.5;
                pb.z -= nz * 0.5;
            }
        }
    }
}

/* ------------------------------------------------------------------ */
/* lighting                                                            */
/* ------------------------------------------------------------------ */

function updateLighting() {
    const hour = Clock.simMinute / 60;
    let lo = DAY_KEYFRAMES[0];
    let hi = DAY_KEYFRAMES[DAY_KEYFRAMES.length - 1];
    for (let i = 0; i < DAY_KEYFRAMES.length - 1; i += 1) {
        if (hour >= DAY_KEYFRAMES[i].hour && hour <= DAY_KEYFRAMES[i + 1].hour) {
            lo = DAY_KEYFRAMES[i];
            hi = DAY_KEYFRAMES[i + 1];
            break;
        }
    }
    const span = hi.hour - lo.hour;
    const t = span <= 0 ? 0 : (hour - lo.hour) / span;
    scene.background = new THREE.Color(lo.bg).lerp(new THREE.Color(hi.bg), t);
    sunLight.color = new THREE.Color(lo.sun).lerp(new THREE.Color(hi.sun), t);
    sunLight.intensity = lo.sunI + (hi.sunI - lo.sunI) * t;
    ambientLight.intensity = lo.ambI + (hi.ambI - lo.ambI) * t;
    hemiLight.intensity = lo.hemiI + (hi.hemiI - lo.hemiI) * t;
}

/* ------------------------------------------------------------------ */
/* HUD                                                                 */
/* ------------------------------------------------------------------ */

function speedFromSlider(value) {
    const t = Math.max(0, Math.min(1, value / 1000));
    return Math.exp(Math.log(1) + t * (Math.log(600) - Math.log(1)));
}

function sliderFromSpeed(speed) {
    const t = Math.log(Math.max(1, Math.min(600, speed))) / Math.log(600);
    return Math.round(t * 1000);
}

function buildHUD() {
    hudRoot = document.createElement("div");
    hudRoot.style.cssText =
        "position:fixed;top:12px;left:12px;z-index:20;background:rgba(12,15,20,0.74);" +
        "color:#dfe6f0;font:12px/1.5 'Courier New',monospace;padding:10px 12px;" +
        "border-radius:6px;min-width:262px;user-select:none;";
    hudRoot.innerHTML =
        '<div id="hudTime" style="font-size:26px;font-weight:bold;letter-spacing:1px;color:#ffd479">' +
        ' 7:30 AM</div>' +
        '<div style="margin-top:6px">Speed <span id="hudSpeedLabel">120x</span></div>' +
        '<input id="hudSpeed" type="range" min="0" max="1000" step="1" style="width:100%">' +
        '<div style="margin-top:4px"><span id="hudOccLabel">Occupancy: 45 / 100 people</span></div>' +
        '<input id="hudOcc" type="range" min="1" max="100" step="1" style="width:100%">' +
        '<div id="hudElevator" style="margin-top:6px;color:#9fe0ff"></div>' +
        '<div id="hudStates" style="margin-top:6px;white-space:pre"></div>';
    document.body.appendChild(hudRoot);

    hudTime = document.getElementById("hudTime");
    hudSpeedLabel = document.getElementById("hudSpeedLabel");
    hudOccLabel = document.getElementById("hudOccLabel");
    hudElevator = document.getElementById("hudElevator");
    hudStates = document.getElementById("hudStates");

    const speedInput = document.getElementById("hudSpeed");
    speedInput.value = String(sliderFromSpeed(Clock.timeScale));
    speedInput.addEventListener("input", (event) => {
        Clock.timeScale = speedFromSlider(Number(event.target.value));
        hudSpeedLabel.textContent = `${Math.round(Clock.timeScale)}x`;
    });

    const occInput = document.getElementById("hudOcc");
    occInput.value = String(targetOccupancy);
    occInput.addEventListener("input", (event) => {
        targetOccupancy = Math.max(1, Math.min(MAX_OCCUPANCY, Number(event.target.value)));
        hudOccLabel.textContent = `Occupancy: ${targetOccupancy} / ${MAX_OCCUPANCY} people`;
        applyOccupancy();
    });
}

let hudAccumulator = 0;

function updateHUD(realDt) {
    hudAccumulator += realDt;
    if (hudAccumulator < 0.15) return;
    hudAccumulator = 0;
    const counts = countStates();
    const interesting = [
        "ARRIVING", "WAITING_ELEVATOR", "IN_CAR", "AT_DESK", "IN_MEETING",
        "AT_BREAK", "AT_LUNCH", "VISITING", "LEAVING", "AWAY"
    ];
    const lines = interesting
        .filter((state) => counts[state])
        .map((state) => `${state.toLowerCase().replace(/_/g, " ")}: ${counts[state]}`);
    lines.push(`present: ${countPresent()}`);
    hudStates.textContent = lines.join("\n");

    const dirText = elevator.direction > 0 ? "up" : elevator.direction < 0 ? "down" : "--";
    const dests = Array.from(elevator.destinations).sort().join(",") || "-";
    const ups = Array.from(elevator.upCalls).sort().join(",") || "-";
    const downs = Array.from(elevator.downCalls).sort().join(",") || "-";
    hudElevator.textContent =
        `car: floor ${elevator.currentFloor} ${dirText} [${elevator.state}] ` +
        `-> ${elevator.targetFloor === null ? "-" : elevator.targetFloor}\n` +
        `riders ${elevator.passengers.size}/4  dest[${dests}] up[${ups}] down[${downs}]`;
    hudTime.textContent = Clock.format();
}

/* ------------------------------------------------------------------ */
/* bootstrap                                                           */
/* ------------------------------------------------------------------ */

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
    sunLight = new THREE.DirectionalLight(0xffffff, 0.9);
    sunLight.position.set(20, 35, 18);
    scene.add(sunLight);

    world = createWorld(scene);
    elevator = new Elevator(scene, world);
    buildAgents();
    applyOccupancy();
    buildHUD();

    window.addEventListener("resize", () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    function animate() {
        requestAnimationFrame(animate);
        const realDt = Math.min(0.05, Clock.getDelta());
        const wrapped = Clock.tick(realDt);
        if (wrapped) resetForNewDay();
        updateLighting();

        const motionDt = realDt * Clock.timeScale;
        elevator.tick(motionDt);
        for (const agent of agents) {
            processDailySchedule(agent);
            updateAgent(agent, motionDt);
        }
        topUpVisitors();
        applyCollisions();
        for (const agent of agents) {
            if (agent.group.parent) animatePersonWalking(agent.group, motionDt);
        }
        controls.update();
        renderer.render(scene, camera);
        updateHUD(realDt);
    }
    animate();
}

if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", startSimulation);
} else {
    startSimulation();
}
