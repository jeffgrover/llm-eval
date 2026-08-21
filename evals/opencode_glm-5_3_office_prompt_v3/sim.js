let scene = null;
let camera = null;
let renderer = null;
let controls = null;
let world = null;
let elevator = null;
let frameClock = null;
let simClock = null;
let sun = null;
let ambientLight = null;
let hemiLight = null;
let agents = [];
let targetOccupancy = 45;
let seatReservations = new Set();
let hudRefs = null;

const MAX_WORKERS = 20;
const MAX_VISITORS = 80;
const MAX_OCCUPANCY = MAX_WORKERS + MAX_VISITORS;
const DEFAULT_OCCUPANCY = 45;
const MEETING_PROB = 0.36;

const FIRST_NAMES = ["Ava", "Ben", "Cara", "Dan", "Elsa", "Finn", "Gia", "Hugo", "Iris", "Jack",
    "Kim", "Leo", "Mia", "Nate", "Omar", "Pia", "Quinn", "Rose", "Sam", "Tara",
    "Uma", "Vic", "Wes", "Yara", "Zane", "Alice", "Boris", "Cleo", "Dmitri", "Elena"];

const BISTRO_SEATS = ["bistro1a", "bistro1b", "bistro2a", "bistro2b", "bistro3a", "bistro3b", "bistro4a", "bistro4b"];
const FRONT_LOUNGE_SEATS = ["fl_couch", "fl_chair1", "fl_chair2"];
const BACK_SEATS = ["back_lounge_N", "back_lounge_S", "pit_N", "pit_S", "pit_E", "pit_W"];
const LOBBY_STANDS = ["lobby_stand_center", "lobby_stand_NE", "lobby_stand_NW", "lobby_stand_midE", "lobby_stand_midW", "lobby_stand_entry"];
const STAND_SPOTS = ["reception", "kiosk", "lobby_wc_front", "lobby_wc_back"];
const LOUNGE_SEATS = ["lounge_spot0", "lounge_spot1", "lounge_spot2"];
const CONF_SEATS = ["conf_seat0", "conf_seat1", "conf_seat2", "conf_seat3"];

const LIGHT_KEYFRAMES = [
    { h: 0.0, sky: new THREE.Color(0x0d1120), sun: new THREE.Color(0x2a3a66), sunI: 0.0, amb: 0.42, hemi: 0.32 },
    { h: 5.5, sky: new THREE.Color(0x101426), sun: new THREE.Color(0x2a3a66), sunI: 0.0, amb: 0.42, hemi: 0.32 },
    { h: 6.0, sky: new THREE.Color(0x6b4f63), sun: new THREE.Color(0xff9a5c), sunI: 0.30, amb: 0.46, hemi: 0.36 },
    { h: 6.6, sky: new THREE.Color(0x9fc0de), sun: new THREE.Color(0xffd9a0), sunI: 0.70, amb: 0.52, hemi: 0.44 },
    { h: 8.0, sky: new THREE.Color(0xaecfec), sun: new THREE.Color(0xffffff), sunI: 0.90, amb: 0.55, hemi: 0.50 },
    { h: 16.5, sky: new THREE.Color(0xaac9e8), sun: new THREE.Color(0xfff2dd), sunI: 0.85, amb: 0.55, hemi: 0.50 },
    { h: 17.5, sky: new THREE.Color(0xd8a878), sun: new THREE.Color(0xffb070), sunI: 0.62, amb: 0.50, hemi: 0.42 },
    { h: 18.4, sky: new THREE.Color(0x7a5570), sun: new THREE.Color(0xff8050), sunI: 0.28, amb: 0.46, hemi: 0.36 },
    { h: 19.3, sky: new THREE.Color(0x1c2340), sun: new THREE.Color(0x33406a), sunI: 0.05, amb: 0.43, hemi: 0.33 },
    { h: 21.0, sky: new THREE.Color(0x0d1120), sun: new THREE.Color(0x2a3a66), sunI: 0.0, amb: 0.42, hemi: 0.32 },
    { h: 24.0, sky: new THREE.Color(0x0d1120), sun: new THREE.Color(0x2a3a66), sunI: 0.0, amb: 0.42, hemi: 0.32 }
];

function randRange(a, b) {
    return a + Math.random() * (b - a);
}

function randInt(a, b) {
    return a + Math.floor(Math.random() * (b - a + 1));
}

function pickFrom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function appendActions(plan, actions) {
    for (let i = 0; i < actions.length; i++) plan.push(actions[i]);
}

function createSimClock() {
    return {
        simMinute: 7 * 60 + 30,
        timeScale: 120,
        tick: function (realDt) {
            this.simMinute += (realDt * this.timeScale) / 60;
        },
        format: function () {
            const total = Math.floor(this.simMinute);
            const h24 = Math.floor(total / 60) % 24;
            const m = total % 60;
            const ampm = h24 < 12 ? "AM" : "PM";
            let h12 = h24 % 12;
            if (h12 === 0) h12 = 12;
            return (h12 < 10 ? " " : "") + h12 + ":" + (m < 10 ? "0" : "") + m + " " + ampm;
        }
    };
}

function updateLighting() {
    const hour = (simClock.simMinute / 60) % 24;
    let a = LIGHT_KEYFRAMES[0];
    let b = LIGHT_KEYFRAMES[LIGHT_KEYFRAMES.length - 1];
    for (let i = 0; i < LIGHT_KEYFRAMES.length - 1; i++) {
        if (hour >= LIGHT_KEYFRAMES[i].h && hour <= LIGHT_KEYFRAMES[i + 1].h) {
            a = LIGHT_KEYFRAMES[i];
            b = LIGHT_KEYFRAMES[i + 1];
            break;
        }
    }
    const span = b.h - a.h;
    const t = span > 0 ? (hour - a.h) / span : 0;
    scene.background.copy(a.sky).lerp(b.sky, t);
    sun.color.copy(a.sun).lerp(b.sun, t);
    sun.intensity = a.sunI + (b.sunI - a.sunI) * t;
    ambientLight.intensity = a.amb + (b.amb - a.amb) * t;
    hemiLight.intensity = a.hemi + (b.hemi - a.hemi) * t;
}

function createAgent(id, role) {
    return {
        id: id,
        role: role,
        name: FIRST_NAMES[id % FIRST_NAMES.length],
        group: null,
        homeFloor: null,
        deskId: null,
        deskWpName: null,
        deskDoorWpName: null,
        arrivalTime: 0,
        lunchTime: 0,
        lunchDuration: 30,
        departureTime: 0,
        visitDuration: 20,
        plannedMeetingTimes: [],
        hasLunched: false,
        state: "AWAY",
        plan: [],
        currentAction: null,
        floor: 0,
        speed: randRange(1.15, 1.5),
        inCar: false,
        stallT: 0,
        doorwayPass: false,
        reservedSeat: null,
        spotX: 0,
        skipShift: false,
        isLeaving: false
    };
}

function sampleWorkerSchedule(agent) {
    agent.arrivalTime = 8 * 60 + 15 + Math.random() * 75;
    agent.lunchTime = 11 * 60 + 30 + Math.random() * 120;
    agent.lunchDuration = randRange(25, 60);
    agent.departureTime = Math.random() < 0.15
        ? 18 * 60 + 30 + Math.random() * 75
        : 16 * 60 + 45 + Math.random() * 105;
    agent.plannedMeetingTimes = [];
    const n = randInt(0, 2);
    if (n >= 1) agent.plannedMeetingTimes.push(9 * 60 + 30 + Math.random() * 120);
    if (n >= 2) agent.plannedMeetingTimes.push(13 * 60 + 30 + Math.random() * 180);
    agent.hasLunched = false;
}

function sampleVisitorSchedule(agent) {
    agent.arrivalTime = randRange(8 * 60, 17 * 60 + 30);
    agent.visitDuration = randRange(8, 48);
}

function initAgents() {
    agents = [];
    let id = 0;
    for (let w = 0; w < MAX_WORKERS; w++) {
        const agent = createAgent(id, "WORKER");
        id += 1;
        const floor = 1 + Math.floor(w / 4);
        const letter = "ABCD"[w % 4];
        agent.homeFloor = floor;
        agent.deskId = "f" + floor + "_office" + letter;
        agent.deskWpName = "office" + letter + "_desk";
        agent.deskDoorWpName = "office" + letter + "_door";
        sampleWorkerSchedule(agent);
        agent.state = agent.id < targetOccupancy ? "AWAY" : "DISABLED";
        agents.push(agent);
    }
    for (let v = 0; v < MAX_VISITORS; v++) {
        const agent = createAgent(id, "VISITOR");
        id += 1;
        sampleVisitorSchedule(agent);
        agent.state = agent.id < targetOccupancy ? "AWAY" : "DISABLED";
        agents.push(agent);
    }
}

function reserveSeat(floorNum, wpName) {
    const key = floorNum + ":" + wpName;
    if (seatReservations.has(key)) return null;
    seatReservations.add(key);
    return key;
}

function releaseSeat(agent) {
    if (agent.reservedSeat) {
        seatReservations.delete(agent.reservedSeat);
        agent.reservedSeat = null;
    }
}

function tryReserveSeat(floorNum, names) {
    const shuffled = names.slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = shuffled[i];
        shuffled[i] = shuffled[j];
        shuffled[j] = tmp;
    }
    for (let i = 0; i < shuffled.length; i++) {
        const key = reserveSeat(floorNum, shuffled[i]);
        if (key) return { name: shuffled[i], key: key };
    }
    return null;
}

function reserveConfSeat(floorNum) {
    return tryReserveSeat(floorNum, CONF_SEATS);
}

function nearestNodeName(nodes, x, z) {
    let best = null;
    let bestD = Infinity;
    for (const name in nodes) {
        const n = nodes[name];
        const d = (n.x - x) * (n.x - x) + (n.z - z) * (n.z - z);
        if (d < bestD) {
            bestD = d;
            best = name;
        }
    }
    return best;
}

function spawnAgent(agent) {
    if (!agent.group) agent.group = createPerson({});
    agent.group.userData.isSitting = false;
    agent.group.userData.isWalking = false;
    agent.group.userData.walkPhase = 0;
    agent.group.position.set((Math.random() - 0.5) * 2.2, 0, 12 + (Math.random() - 0.5) * 1.5);
    agent.group.rotation.y = Math.PI;
    scene.add(agent.group);
    agent.floor = 0;
    agent.inCar = false;
    agent.stallT = 0;
    agent.doorwayPass = false;
    agent.isLeaving = false;
    agent.plan = [];
    agent.currentAction = null;
    agent.state = "ARRIVING";
    if (agent.role === "WORKER") {
        agent.plan = planArriveToDesk(agent);
    } else {
        agent.plan = planVisitorVisit(agent);
    }
}

function isOverrideSafeState(state) {
    return state === "AT_DESK" || state === "AT_BREAK" || state === "AT_LUNCH" ||
        state === "IN_MEETING" || state === "VISITING" || state === "ON_FLOOR";
}

function dailyTick(agent) {
    if (agent.state === "DISABLED" || agent.state === "GONE") return;
    const now = simClock.simMinute;
    if (agent.state === "AWAY") {
        if (now >= agent.arrivalTime) {
            if (agent.role === "WORKER" && now >= agent.departureTime) {
                agent.state = "GONE";
                return;
            }
            spawnAgent(agent);
        }
        return;
    }
    if (agent.role === "WORKER") {
        if (now >= agent.departureTime && !agent.isLeaving && isOverrideSafeState(agent.state)) {
            releaseSeat(agent);
            agent.plan = planLeaveBuilding(agent);
            agent.currentAction = null;
            agent.state = "LEAVING";
            agent.isLeaving = true;
        }
    } else {
        if (now >= agent.arrivalTime + agent.visitDuration + 60 && !agent.isLeaving && isOverrideSafeState(agent.state)) {
            releaseSeat(agent);
            agent.plan = planExitBuildingFrom(agent);
            agent.currentAction = null;
            agent.state = "LEAVING";
            agent.isLeaving = true;
        }
    }
}

function makeElevatorRide(fromFloor, toFloor) {
    const dir = toFloor > fromFloor ? 1 : -1;
    return [
        { type: "WALK_TO_WP", floor: fromFloor, wp: "elevWait" },
        { type: "ENTER_STATE", state: "WAITING_ELEVATOR" },
        { type: "WAIT_AT_PANEL", floor: fromFloor, dir: dir, toFloor: toFloor },
        { type: "ENTER_ELEVATOR", toFloor: toFloor },
        { type: "PRESS_FLOOR", floor: toFloor },
        { type: "WAIT_FOR_FLOOR", floor: toFloor },
        { type: "EXIT_ELEVATOR", toFloor: toFloor }
    ];
}

function planArriveToDesk(agent) {
    const hf = agent.homeFloor;
    const plan = [
        { type: "STAND" },
        { type: "WALK_TO_WP", floor: 0, wp: "front_door_threshold" },
        { type: "WALK_TO_WP", floor: 0, wp: "entrance" },
        { type: "WALK_TO_WP", floor: 0, wp: "lobby_center" }
    ];
    appendActions(plan, makeElevatorRide(0, hf));
    plan.push({ type: "ENTER_STATE", state: "ON_FLOOR" });
    plan.push({ type: "WALK_TO_WP", floor: hf, wp: agent.deskDoorWpName });
    plan.push({ type: "WALK_TO_WP", floor: hf, wp: agent.deskWpName });
    plan.push({ type: "ENTER_STATE", state: "AT_DESK" });
    plan.push({ type: "SIT", floor: hf, wp: agent.deskWpName });
    plan.push({ type: "WAIT_SIM", minutes: randRange(20, 80) });
    plan.push({ type: "PICK_NEXT_ACTIVITY" });
    return plan;
}

function planGoToLunch(agent) {
    const hf = agent.homeFloor;
    const plan = [{ type: "STAND" }];
    plan.push({ type: "WALK_TO_WP", floor: hf, wp: agent.deskDoorWpName });
    appendActions(plan, makeElevatorRide(hf, 0));
    const seat = tryReserveSeat(0, BISTRO_SEATS);
    if (seat) {
        agent.reservedSeat = seat.key;
        plan.push({ type: "WALK_TO_WP", floor: 0, wp: seat.name });
        plan.push({ type: "ENTER_STATE", state: "AT_LUNCH" });
        plan.push({ type: "SIT", floor: 0, wp: seat.name });
        plan.push({ type: "WAIT_SIM", minutes: agent.lunchDuration });
        plan.push({ type: "MARK_LUNCHED" });
        plan.push({ type: "STAND" });
        plan.push({ type: "RELEASE_SEAT" });
    } else {
        const spot = pickFrom(LOBBY_STANDS);
        plan.push({ type: "WALK_TO_WP", floor: 0, wp: spot });
        plan.push({ type: "ENTER_STATE", state: "AT_LUNCH" });
        plan.push({ type: "SIT", floor: 0, wp: spot });
        plan.push({ type: "WAIT_SIM", minutes: agent.lunchDuration });
        plan.push({ type: "MARK_LUNCHED" });
    }
    plan.push({ type: "WALK_TO_WP", floor: 0, wp: "lobby_center" });
    appendActions(plan, makeElevatorRide(0, hf));
    plan.push({ type: "WALK_TO_WP", floor: hf, wp: agent.deskDoorWpName });
    plan.push({ type: "WALK_TO_WP", floor: hf, wp: agent.deskWpName });
    plan.push({ type: "ENTER_STATE", state: "AT_DESK" });
    plan.push({ type: "SIT", floor: hf, wp: agent.deskWpName });
    plan.push({ type: "WAIT_SIM", minutes: randRange(15, 40) });
    plan.push({ type: "PICK_NEXT_ACTIVITY" });
    return plan;
}

function planVisitLounge(agent) {
    const hf = agent.homeFloor;
    const plan = [{ type: "STAND" }, { type: "ENTER_STATE", state: "AT_BREAK" }];
    const seat = tryReserveSeat(hf, LOUNGE_SEATS);
    plan.push({ type: "WALK_TO_WP", floor: hf, wp: "lounge_door" });
    if (seat) {
        agent.reservedSeat = seat.key;
        plan.push({ type: "WALK_TO_WP", floor: hf, wp: seat.name });
        plan.push({ type: "SIT", floor: hf, wp: seat.name });
        plan.push({ type: "WAIT_SIM", minutes: randRange(5, 12) });
        plan.push({ type: "STAND" });
        plan.push({ type: "RELEASE_SEAT" });
    } else {
        const spot = pickFrom(["water_cooler", "hall_stand_N", "hall_stand_S"]);
        plan.push({ type: "WALK_TO_WP", floor: hf, wp: spot });
        plan.push({ type: "SIT", floor: hf, wp: spot });
        plan.push({ type: "WAIT_SIM", minutes: randRange(4, 10) });
    }
    plan.push({ type: "WALK_TO_WP", floor: hf, wp: agent.deskDoorWpName });
    plan.push({ type: "WALK_TO_WP", floor: hf, wp: agent.deskWpName });
    plan.push({ type: "ENTER_STATE", state: "AT_DESK" });
    plan.push({ type: "SIT", floor: hf, wp: agent.deskWpName });
    plan.push({ type: "WAIT_SIM", minutes: randRange(18, 65) });
    plan.push({ type: "PICK_NEXT_ACTIVITY" });
    return plan;
}

function planAttendMeeting(agent) {
    const hf = agent.homeFloor;
    const meetingFloor = Math.random() < 0.65 ? hf : randInt(1, 5);
    const seat = reserveConfSeat(meetingFloor);
    if (!seat) return planVisitLounge(agent);
    agent.reservedSeat = seat.key;
    const plan = [{ type: "STAND" }];
    if (meetingFloor !== hf) {
        plan.push({ type: "WALK_TO_WP", floor: hf, wp: agent.deskDoorWpName });
        appendActions(plan, makeElevatorRide(hf, meetingFloor));
    }
    plan.push({ type: "WALK_TO_WP", floor: meetingFloor, wp: "conf_door" });
    plan.push({ type: "WALK_TO_WP", floor: meetingFloor, wp: "conf_center" });
    plan.push({ type: "WALK_TO_WP", floor: meetingFloor, wp: seat.name });
    plan.push({ type: "ENTER_STATE", state: "IN_MEETING" });
    plan.push({ type: "SIT", floor: meetingFloor, wp: seat.name });
    plan.push({ type: "WAIT_SIM", minutes: randRange(22, 45) });
    plan.push({ type: "STAND" });
    plan.push({ type: "RELEASE_SEAT" });
    if (meetingFloor !== hf) {
        plan.push({ type: "WALK_TO_WP", floor: meetingFloor, wp: "elevWait" });
        appendActions(plan, makeElevatorRide(meetingFloor, hf));
    }
    plan.push({ type: "WALK_TO_WP", floor: hf, wp: agent.deskDoorWpName });
    plan.push({ type: "WALK_TO_WP", floor: hf, wp: agent.deskWpName });
    plan.push({ type: "ENTER_STATE", state: "AT_DESK" });
    plan.push({ type: "SIT", floor: hf, wp: agent.deskWpName });
    plan.push({ type: "WAIT_SIM", minutes: randRange(10, 30) });
    plan.push({ type: "PICK_NEXT_ACTIVITY" });
    return plan;
}

function planVisitCoworker(agent) {
    const hf = agent.homeFloor;
    const candidates = [];
    for (let i = 0; i < agents.length; i++) {
        const other = agents[i];
        if (other === agent || other.role !== "WORKER") continue;
        if (other.state === "AT_DESK") candidates.push(other);
    }
    if (candidates.length === 0) {
        return [{ type: "WAIT_SIM", minutes: randRange(10, 25) }, { type: "PICK_NEXT_ACTIVITY" }];
    }
    const target = pickFrom(candidates);
    const plan = [{ type: "STAND" }, { type: "ENTER_STATE", state: "AT_BREAK" }];
    if (target.homeFloor !== hf) {
        plan.push({ type: "WALK_TO_WP", floor: hf, wp: agent.deskDoorWpName });
        appendActions(plan, makeElevatorRide(hf, target.homeFloor));
    }
    plan.push({ type: "WALK_TO_WP", floor: target.homeFloor, wp: target.deskDoorWpName });
    plan.push({ type: "SIT", floor: target.homeFloor, wp: target.deskDoorWpName });
    plan.push({ type: "WAIT_SIM", minutes: randRange(6, 18) });
    if (target.homeFloor !== hf) {
        plan.push({ type: "WALK_TO_WP", floor: target.homeFloor, wp: "elevWait" });
        appendActions(plan, makeElevatorRide(target.homeFloor, hf));
    }
    plan.push({ type: "WALK_TO_WP", floor: hf, wp: agent.deskDoorWpName });
    plan.push({ type: "WALK_TO_WP", floor: hf, wp: agent.deskWpName });
    plan.push({ type: "ENTER_STATE", state: "AT_DESK" });
    plan.push({ type: "SIT", floor: hf, wp: agent.deskWpName });
    plan.push({ type: "WAIT_SIM", minutes: randRange(18, 65) });
    plan.push({ type: "PICK_NEXT_ACTIVITY" });
    return plan;
}

function planLeaveBuilding(agent) {
    const hf = agent.homeFloor;
    const plan = [{ type: "STAND" }, { type: "RELEASE_SEAT" }, { type: "ENTER_STATE", state: "LEAVING" }];
    plan.push({ type: "WALK_TO_WP", floor: hf, wp: "elevWait" });
    appendActions(plan, makeElevatorRide(hf, 0));
    plan.push({ type: "WALK_TO_WP", floor: 0, wp: "lobby_center" });
    plan.push({ type: "WALK_TO_WP", floor: 0, wp: "entrance" });
    plan.push({ type: "WALK_TO_WP", floor: 0, wp: "front_door_threshold" });
    plan.push({ type: "WALK_TO_WP", floor: 0, wp: "outside" });
    plan.push({ type: "EXIT_BUILDING" });
    return plan;
}

function planExitBuildingFrom(agent) {
    const fl = agent.floor;
    const plan = [{ type: "STAND" }, { type: "RELEASE_SEAT" }, { type: "ENTER_STATE", state: "LEAVING" }];
    if (fl > 0) {
        plan.push({ type: "WALK_TO_WP", floor: fl, wp: "elevWait" });
        appendActions(plan, makeElevatorRide(fl, 0));
    }
    plan.push({ type: "WALK_TO_WP", floor: 0, wp: "lobby_center" });
    plan.push({ type: "WALK_TO_WP", floor: 0, wp: "entrance" });
    plan.push({ type: "WALK_TO_WP", floor: 0, wp: "front_door_threshold" });
    plan.push({ type: "WALK_TO_WP", floor: 0, wp: "outside" });
    plan.push({ type: "EXIT_BUILDING" });
    return plan;
}

function appendLoiterVisit(plan) {
    const spot = pickFrom(LOBBY_STANDS);
    plan.push({ type: "WALK_TO_WP", floor: 0, wp: "lobby_center" });
    plan.push({ type: "WALK_TO_WP", floor: 0, wp: spot });
    plan.push({ type: "SIT", floor: 0, wp: spot });
    plan.push({ type: "WAIT_SIM", minutes: randRange(5, 15) });
}

function appendBistroVisit(plan, agent) {
    plan.push({ type: "WALK_TO_WP", floor: 0, wp: "lobby_center" });
    const seat = tryReserveSeat(0, BISTRO_SEATS);
    if (seat) {
        agent.reservedSeat = seat.key;
        plan.push({ type: "WALK_TO_WP", floor: 0, wp: seat.name });
        plan.push({ type: "SIT", floor: 0, wp: seat.name });
        plan.push({ type: "WAIT_SIM", minutes: randRange(10, 25) });
        plan.push({ type: "STAND" });
        plan.push({ type: "RELEASE_SEAT" });
    } else {
        appendLoiterVisit(plan);
    }
}

function appendCafeVisit(plan) {
    plan.push({ type: "WALK_TO_WP", floor: 0, wp: "lobby_center" });
    plan.push({ type: "WALK_TO_WP", floor: 0, wp: "cafe_order" });
    plan.push({ type: "SIT", floor: 0, wp: "cafe_order" });
    plan.push({ type: "WAIT_SIM", minutes: randRange(3, 8) });
}

function appendFrontLoungeVisit(plan, agent) {
    plan.push({ type: "WALK_TO_WP", floor: 0, wp: "lobby_center" });
    const seat = tryReserveSeat(0, FRONT_LOUNGE_SEATS);
    if (seat) {
        agent.reservedSeat = seat.key;
        plan.push({ type: "WALK_TO_WP", floor: 0, wp: seat.name });
        plan.push({ type: "SIT", floor: 0, wp: seat.name });
        plan.push({ type: "WAIT_SIM", minutes: randRange(8, 20) });
        plan.push({ type: "STAND" });
        plan.push({ type: "RELEASE_SEAT" });
    } else {
        appendLoiterVisit(plan);
    }
}

function appendBackLoungeVisit(plan, agent) {
    plan.push({ type: "WALK_TO_WP", floor: 0, wp: "lobby_center" });
    const seat = tryReserveSeat(0, BACK_SEATS);
    if (seat) {
        agent.reservedSeat = seat.key;
        plan.push({ type: "WALK_TO_WP", floor: 0, wp: seat.name });
        plan.push({ type: "SIT", floor: 0, wp: seat.name });
        plan.push({ type: "WAIT_SIM", minutes: randRange(8, 20) });
        plan.push({ type: "STAND" });
        plan.push({ type: "RELEASE_SEAT" });
    } else {
        appendLoiterVisit(plan);
    }
}

function appendStandVisit(plan) {
    const spot = pickFrom(STAND_SPOTS);
    plan.push({ type: "WALK_TO_WP", floor: 0, wp: "lobby_center" });
    plan.push({ type: "WALK_TO_WP", floor: 0, wp: spot });
    plan.push({ type: "SIT", floor: 0, wp: spot });
    plan.push({ type: "WAIT_SIM", minutes: randRange(3, 10) });
}

function appendOfficeLoungeVisit(plan, agent) {
    const fl = randInt(1, 5);
    const seat = tryReserveSeat(fl, LOUNGE_SEATS);
    plan.push({ type: "WALK_TO_WP", floor: 0, wp: "lobby_center" });
    appendActions(plan, makeElevatorRide(0, fl));
    plan.push({ type: "WALK_TO_WP", floor: fl, wp: "lounge_door" });
    if (seat) {
        agent.reservedSeat = seat.key;
        plan.push({ type: "WALK_TO_WP", floor: fl, wp: seat.name });
        plan.push({ type: "SIT", floor: fl, wp: seat.name });
        plan.push({ type: "WAIT_SIM", minutes: randRange(8, 20) });
        plan.push({ type: "STAND" });
        plan.push({ type: "RELEASE_SEAT" });
    } else {
        const spot = pickFrom(["hall_stand_N", "hall_stand_S", "water_cooler"]);
        plan.push({ type: "WALK_TO_WP", floor: fl, wp: spot });
        plan.push({ type: "SIT", floor: fl, wp: spot });
        plan.push({ type: "WAIT_SIM", minutes: randRange(6, 14) });
    }
    plan.push({ type: "WALK_TO_WP", floor: fl, wp: "elevWait" });
    appendActions(plan, makeElevatorRide(fl, 0));
}

function appendMeetingVisit(plan, agent) {
    const fl = randInt(1, 5);
    const seat = reserveConfSeat(fl);
    if (!seat) {
        appendLoiterVisit(plan);
        return;
    }
    agent.reservedSeat = seat.key;
    plan.push({ type: "WALK_TO_WP", floor: 0, wp: "lobby_center" });
    appendActions(plan, makeElevatorRide(0, fl));
    plan.push({ type: "WALK_TO_WP", floor: fl, wp: "conf_door" });
    plan.push({ type: "WALK_TO_WP", floor: fl, wp: "conf_center" });
    plan.push({ type: "WALK_TO_WP", floor: fl, wp: seat.name });
    plan.push({ type: "ENTER_STATE", state: "IN_MEETING" });
    plan.push({ type: "SIT", floor: fl, wp: seat.name });
    plan.push({ type: "WAIT_SIM", minutes: randRange(15, 35) });
    plan.push({ type: "STAND" });
    plan.push({ type: "RELEASE_SEAT" });
    plan.push({ type: "WALK_TO_WP", floor: fl, wp: "elevWait" });
    appendActions(plan, makeElevatorRide(fl, 0));
}

function planVisitorVisit(agent) {
    const plan = [
        { type: "STAND" },
        { type: "WALK_TO_WP", floor: 0, wp: "front_door_threshold" },
        { type: "WALK_TO_WP", floor: 0, wp: "entrance" },
        { type: "ENTER_STATE", state: "VISITING" }
    ];
    const r = Math.random();
    if (r < 0.10) appendBistroVisit(plan, agent);
    else if (r < 0.16) appendCafeVisit(plan);
    else if (r < 0.30) appendFrontLoungeVisit(plan, agent);
    else if (r < 0.42) appendBackLoungeVisit(plan, agent);
    else if (r < 0.52) appendStandVisit(plan);
    else if (r < 0.62) appendLoiterVisit(plan);
    else if (r < 0.77) appendOfficeLoungeVisit(plan, agent);
    else appendMeetingVisit(plan, agent);
    plan.push({ type: "WALK_TO_WP", floor: 0, wp: "lobby_center" });
    plan.push({ type: "WALK_TO_WP", floor: 0, wp: "entrance" });
    plan.push({ type: "WALK_TO_WP", floor: 0, wp: "front_door_threshold" });
    plan.push({ type: "WALK_TO_WP", floor: 0, wp: "outside" });
    plan.push({ type: "EXIT_BUILDING" });
    return plan;
}

function chooseNextActivity(agent) {
    if (agent.role === "VISITOR") return planExitBuildingFrom(agent);
    const now = simClock.simMinute;
    if (now >= agent.departureTime) return planLeaveBuilding(agent);
    if (agent.plannedMeetingTimes.length > 0 && now >= agent.plannedMeetingTimes[0]) {
        agent.plannedMeetingTimes.shift();
        return planAttendMeeting(agent);
    }
    if (!agent.hasLunched && now > 14 * 60 + 30) agent.hasLunched = true;
    if (!agent.hasLunched && now >= agent.lunchTime) return planGoToLunch(agent);
    const r = Math.random();
    if (r < MEETING_PROB * 0.4) return planAttendMeeting(agent);
    if (r < 0.264) return planVisitLounge(agent);
    if (r < 0.414) return planVisitCoworker(agent);
    return [{ type: "WAIT_SIM", minutes: randRange(18, 65) }, { type: "PICK_NEXT_ACTIVITY" }];
}

function startAction(agent, action) {
    if (action.type === "WALK_TO_WP") {
        const floorData = world.floors[agent.floor];
        const fromName = nearestNodeName(floorData.nodes, agent.group.position.x, agent.group.position.z);
        action.path = bfsPath(floorData.nodes, fromName, action.wp);
        action.pathIndex = 0;
        agent.stallT = 0;
        agent.doorwayPass = action.wp === "outside" || action.wp === "front_door_threshold" ||
            (action.wp === "entrance" && agent.group.position.z > 8.5);
    } else if (action.type === "WAIT_SIM") {
        action.until = simClock.simMinute + action.minutes;
    } else if (action.type === "ENTER_ELEVATOR") {
        action.phase = "reserve";
        agent.stallT = 0;
    } else if (action.type === "EXIT_ELEVATOR") {
        elevator.registerDisembark(agent);
        scene.attach(agent.group);
        agent.group.position.y = action.toFloor * WORLD.FLOOR_HEIGHT;
        const laneX = agent.spotX * 0.5;
        action.target = new THREE.Vector3(laneX, action.toFloor * WORLD.FLOOR_HEIGHT, 2.6);
        action.phase = "walk";
        agent.inCar = false;
        agent.floor = action.toFloor;
        agent.stallT = 0;
    } else if (action.type === "SIT") {
        const target = world.floors[action.floor].sitTargets[action.wp];
        const pos = agent.group.position;
        if (target && target.sit) {
            pos.x = target.x;
            pos.z = target.z;
            pos.y = action.floor * WORLD.FLOOR_HEIGHT - 0.35;
            agent.group.rotation.y = target.facing;
            agent.group.userData.isSitting = true;
            agent.group.userData.isWalking = false;
        } else if (target) {
            const ang = Math.random() * Math.PI * 2;
            const rad = 0.35 + Math.random() * 0.4;
            pos.x = target.x + Math.cos(ang) * rad;
            pos.z = target.z + Math.sin(ang) * rad;
            pos.y = action.floor * WORLD.FLOOR_HEIGHT;
            agent.group.rotation.y = target.facing;
            agent.group.userData.isSitting = false;
        }
    }
}

function walkAlongPath(agent, action, dt) {
    const pos = agent.group.position;
    const startX = pos.x;
    const startZ = pos.z;
    let budget = agent.speed * dt;
    let guard = 0;
    while (budget > 0.000001 && action.pathIndex < action.path.length && guard < 300) {
        guard += 1;
        const wp = action.path[action.pathIndex];
        const dx = wp.x - pos.x;
        const dz = wp.z - pos.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < 0.0001) {
            action.pathIndex += 1;
            continue;
        }
        const step = Math.min(budget, dist, 0.6);
        if (step >= dist) {
            pos.x = wp.x;
            pos.z = wp.z;
            action.pathIndex += 1;
            budget -= dist;
        } else {
            pos.x += (dx / dist) * step;
            pos.z += (dz / dist) * step;
            agent.group.rotation.y = Math.atan2(dx, dz);
            budget = 0;
        }
    }
    const moved = Math.abs(pos.x - startX) + Math.abs(pos.z - startZ);
    if (moved < 0.005) agent.stallT += dt;
    else agent.stallT = 0;
    if (agent.stallT > 1.2 && action.pathIndex < action.path.length) {
        action.pathIndex += 1;
        agent.stallT = 0;
    }
    return action.pathIndex >= action.path.length;
}

function walkToPoint(agent, target, dt, stallLimit) {
    const pos = agent.group.position;
    const startX = pos.x;
    const startZ = pos.z;
    let budget = agent.speed * dt;
    let guard = 0;
    while (budget > 0.000001 && guard < 200) {
        guard += 1;
        const dx = target.x - pos.x;
        const dz = target.z - pos.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < 0.0001) break;
        const step = Math.min(budget, dist, 0.6);
        pos.x += (dx / dist) * step;
        pos.z += (dz / dist) * step;
        agent.group.rotation.y = Math.atan2(dx, dz);
        budget -= step;
    }
    const moved = Math.abs(pos.x - startX) + Math.abs(pos.z - startZ);
    if (moved < 0.005) agent.stallT += dt;
    else agent.stallT = 0;
    if (agent.stallT > stallLimit) {
        pos.x = target.x;
        pos.z = target.z;
        agent.stallT = 0;
        return true;
    }
    const arrived = Math.abs(target.x - pos.x) + Math.abs(target.z - pos.z) < 0.02;
    if (arrived) {
        pos.x = target.x;
        pos.z = target.z;
    }
    return arrived;
}

function runEnterElevator(agent, action, dt) {
    const pos = agent.group.position;
    if (action.phase === "reserve") {
        const spot = elevator.reserveBoardingSpot(agent);
        if (!spot) {
            const dir = action.toFloor > agent.floor ? 1 : -1;
            if (dir > 0) elevator.callUp(agent.floor);
            else elevator.callDown(agent.floor);
            agent.currentAction = { type: "WAIT_AT_PANEL", floor: agent.floor, dir: dir, toFloor: action.toFloor };
            agent.skipShift = true;
            return true;
        }
        action.spot = spot;
        agent.spotX = spot.x;
        action.doorTarget = new THREE.Vector3(spot.x, agent.floor * WORLD.FLOOR_HEIGHT, 1.45);
        action.spotTarget = new THREE.Vector3(spot.x, 0, spot.z);
        action.phase = "toDoor";
        agent.stallT = 0;
        return false;
    }
    if (action.phase === "toDoor") {
        if (elevator.state !== "DOOR_OPEN" || elevator.currentFloor !== agent.floor) {
            elevator.cancelBoarding(agent);
            const dir = action.toFloor > agent.floor ? 1 : -1;
            if (dir > 0) elevator.callUp(agent.floor);
            else elevator.callDown(agent.floor);
            agent.currentAction = { type: "WAIT_AT_PANEL", floor: agent.floor, dir: dir, toFloor: action.toFloor };
            agent.skipShift = true;
            return true;
        }
        agent.group.userData.isWalking = true;
        const arrived = walkToPoint(agent, action.doorTarget, dt, 1.5);
        if (arrived) {
            elevator.carGroup.attach(agent.group);
            agent.group.position.y = 0;
            action.phase = "inside";
            agent.stallT = 0;
        }
        return false;
    }
    agent.group.userData.isWalking = true;
    const arrivedInside = walkToPoint(agent, action.spotTarget, dt, 1.5);
    if (arrivedInside) {
        elevator.completeBoard(agent);
        agent.group.rotation.y = 0;
        agent.inCar = true;
    }
    return arrivedInside;
}

function runAction(agent, action, dt) {
    const pos = agent.group.position;
    if (action.type === "WALK_TO_WP") {
        agent.group.userData.isWalking = true;
        const arrived = walkAlongPath(agent, action, dt);
        if (arrived) {
            agent.doorwayPass = false;
            return true;
        }
        return false;
    }
    if (action.type === "WAIT_AT_PANEL") {
        agent.group.userData.isWalking = false;
        if (elevator.isAcceptingAt(action.floor, action.dir) && elevator.currentCapacityFree() > 0) return true;
        if (action.dir > 0) {
            if (!elevator.upCalls.has(action.floor)) elevator.callUp(action.floor);
        } else {
            if (!elevator.downCalls.has(action.floor)) elevator.callDown(action.floor);
        }
        return false;
    }
    if (action.type === "ENTER_ELEVATOR") {
        return runEnterElevator(agent, action, dt);
    }
    if (action.type === "PRESS_FLOOR") {
        elevator.pressDestination(action.floor);
        return true;
    }
    if (action.type === "WAIT_FOR_FLOOR") {
        agent.group.userData.isWalking = false;
        return elevator.state === "DOOR_OPEN" && elevator.currentFloor === action.floor;
    }
    if (action.type === "EXIT_ELEVATOR") {
        agent.group.userData.isWalking = true;
        const arrived = walkToPoint(agent, action.target, dt, 1.5);
        if (arrived) {
            elevator.completeDisembark(agent);
            if (agent.state === "WAITING_ELEVATOR") agent.state = "ON_FLOOR";
        }
        return arrived;
    }
    if (action.type === "SIT") {
        return true;
    }
    if (action.type === "STAND") {
        agent.group.userData.isSitting = false;
        if (agent.inCar) pos.y = 0;
        else pos.y = agent.floor * WORLD.FLOOR_HEIGHT;
        return true;
    }
    if (action.type === "RELEASE_SEAT") {
        releaseSeat(agent);
        return true;
    }
    if (action.type === "WAIT_SIM") {
        agent.group.userData.isWalking = false;
        return simClock.simMinute >= action.until;
    }
    if (action.type === "EXIT_BUILDING") {
        if (agent.group.parent) agent.group.parent.remove(agent.group);
        releaseSeat(agent);
        agent.state = "GONE";
        agent.doorwayPass = false;
        return true;
    }
    if (action.type === "ENTER_STATE") {
        agent.state = action.state;
        if (action.state === "LEAVING") agent.isLeaving = true;
        return true;
    }
    if (action.type === "MARK_LUNCHED") {
        agent.hasLunched = true;
        return true;
    }
    if (action.type === "PICK_NEXT_ACTIVITY") {
        agent.plan = chooseNextActivity(agent);
        return true;
    }
    return true;
}

function dispatchAgent(agent, dt) {
    let guard = 0;
    while (guard < 16) {
        guard += 1;
        if (!agent.currentAction) {
            const nextAction = agent.plan.shift();
            if (!nextAction) {
                if (agent.state === "GONE" || agent.state === "AWAY" || agent.state === "DISABLED" || agent.state === "LEAVING") return;
                agent.plan = chooseNextActivity(agent);
                if (!agent.plan || agent.plan.length === 0) return;
                continue;
            }
            agent.currentAction = nextAction;
            startAction(agent, nextAction);
        }
        const done = runAction(agent, agent.currentAction, dt);
        if (agent.skipShift) {
            agent.skipShift = false;
            startAction(agent, agent.currentAction);
            continue;
        }
        if (!done) return;
        agent.currentAction = null;
    }
}

function applyCollisions() {
    const FH = WORLD.FLOOR_HEIGHT;
    const buckets = new Map();
    for (let i = 0; i < agents.length; i++) {
        const agent = agents[i];
        if (!agent.group || !agent.group.parent) continue;
        if (agent.group.parent !== scene) continue;
        const st = agent.state;
        if (st === "AWAY" || st === "GONE" || st === "DISABLED") continue;
        const act = agent.currentAction;
        const exempt = agent.doorwayPass || (act !== null && act !== undefined && act.type === "ENTER_ELEVATOR");
        const entry = {
            agent: agent,
            x: agent.group.position.x,
            z: agent.group.position.z,
            sitting: agent.group.userData.isSitting === true,
            exempt: exempt
        };
        entry.movable = !entry.sitting && !entry.exempt;
        const key = Math.round(agent.group.position.y / FH);
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(entry);
    }
    buckets.forEach(function (list) {
        for (let i = 0; i < list.length; i++) {
            for (let j = i + 1; j < list.length; j++) {
                const a = list[i];
                const b = list[j];
                if (a.exempt || b.exempt) continue;
                const dx = b.x - a.x;
                const dz = b.z - a.z;
                if (dx > 0.7 || dx < -0.7 || dz > 0.7 || dz < -0.7) continue;
                const d2 = dx * dx + dz * dz;
                if (d2 > 0.49) continue;
                let d = Math.sqrt(d2);
                let nx;
                let nz;
                if (d < 0.001) {
                    const ang = Math.random() * Math.PI * 2;
                    nx = Math.cos(ang);
                    nz = Math.sin(ang);
                    d = 0.0001;
                } else {
                    nx = dx / d;
                    nz = dz / d;
                }
                const push = (0.7 - d) * 0.18;
                if (a.movable && b.movable) {
                    a.x -= nx * push * 0.5;
                    a.z -= nz * push * 0.5;
                    b.x += nx * push * 0.5;
                    b.z += nz * push * 0.5;
                } else if (a.movable) {
                    a.x -= nx * push;
                    a.z -= nz * push;
                } else if (b.movable) {
                    b.x += nx * push;
                    b.z += nz * push;
                }
            }
        }
        for (let i = 0; i < list.length; i++) {
            const entry = list[i];
            entry.agent.group.position.x = entry.x;
            entry.agent.group.position.z = entry.z;
        }
    });
}

function countPresent() {
    let n = 0;
    for (let i = 0; i < agents.length; i++) {
        const st = agents[i].state;
        if (st !== "AWAY" && st !== "GONE" && st !== "DISABLED") n += 1;
    }
    return n;
}

function topUpVisitors() {
    const hour = simClock.simMinute / 60;
    if (hour < 7.8 || hour > 19.0) return;
    const deficit = targetOccupancy - countPresent();
    if (deficit <= 0) return;
    let armed = 0;
    for (let i = 0; i < agents.length && armed < deficit; i++) {
        const agent = agents[i];
        if (agent.role !== "VISITOR") continue;
        if (agent.id >= targetOccupancy) continue;
        if (agent.state === "AWAY" || agent.state === "GONE") {
            agent.arrivalTime = simClock.simMinute + randInt(0, 6);
            agent.visitDuration = randRange(8, 48);
            agent.state = "AWAY";
            armed += 1;
        }
    }
}

function applyOccupancy() {
    for (let i = 0; i < agents.length; i++) {
        const agent = agents[i];
        if (agent.id < targetOccupancy) {
            if (agent.state === "DISABLED") {
                agent.state = "AWAY";
                if (agent.arrivalTime < simClock.simMinute) {
                    agent.arrivalTime = simClock.simMinute + randRange(0, 18);
                }
            }
        } else {
            if (agent.state === "AWAY" || agent.state === "GONE") agent.state = "DISABLED";
        }
    }
}

function dayWrap() {
    simClock.simMinute -= 24 * 60;
    seatReservations.clear();
    for (let i = 0; i < agents.length; i++) {
        const agent = agents[i];
        releaseSeat(agent);
        if (agent.group && agent.group.parent) agent.group.parent.remove(agent.group);
        agent.plan = [];
        agent.currentAction = null;
        agent.inCar = false;
        agent.stallT = 0;
        agent.doorwayPass = false;
        agent.skipShift = false;
        agent.isLeaving = false;
        agent.hasLunched = false;
        if (agent.role === "WORKER") sampleWorkerSchedule(agent);
        else sampleVisitorSchedule(agent);
        agent.state = agent.id < targetOccupancy ? "AWAY" : "DISABLED";
    }
    elevator.reset();
}

function speedFromSlider(v) {
    return Math.max(1, Math.round(Math.exp((v / 100) * Math.log(600))));
}

function sliderFromSpeed(ts) {
    return Math.round((Math.log(ts) / Math.log(600)) * 100);
}

function buildHUD() {
    const hud = document.createElement("div");
    hud.id = "hud";
    hud.style.cssText = "position:fixed;top:8px;left:8px;z-index:10;background:rgba(15,18,26,0.85);color:#dfe6f3;font:13px/1.5 'Segoe UI',system-ui,sans-serif;padding:10px 12px;border-radius:8px;min-width:250px;pointer-events:auto;";
    hud.innerHTML = "<div id='timeDisplay' style='font-size:24px;font-weight:bold;letter-spacing:1px;margin-bottom:6px;'> 7:30 AM</div>" +
        "<div style='margin-bottom:4px;'>Speed: <span id='speedLabel'>120x</span></div>" +
        "<input id='speedSlider' type='range' min='0' max='100' step='1' value='75' style='width:100%;'>" +
        "<div style='margin:8px 0 4px 0;'>Occupancy: <span id='occupancyLabel'>45 / 100 people</span></div>" +
        "<input id='occupancySlider' type='range' min='1' max='100' step='1' value='45' style='width:100%;'>" +
        "<div id='stateCounts' style='margin-top:8px;font-size:12px;color:#aab6cc;'></div>" +
        "<div id='elevInfo' style='margin-top:4px;font-size:12px;color:#ffcc77;'></div>";
    document.body.appendChild(hud);
    hudRefs = {
        timeDisplay: document.getElementById("timeDisplay"),
        speedLabel: document.getElementById("speedLabel"),
        speedSlider: document.getElementById("speedSlider"),
        occupancyLabel: document.getElementById("occupancyLabel"),
        occupancySlider: document.getElementById("occupancySlider"),
        stateCounts: document.getElementById("stateCounts"),
        elevInfo: document.getElementById("elevInfo")
    };
    hudRefs.speedSlider.addEventListener("input", function (ev) {
        const v = Number(ev.target.value);
        simClock.timeScale = speedFromSlider(v);
        hudRefs.speedLabel.textContent = simClock.timeScale + "x";
    });
    hudRefs.occupancySlider.addEventListener("input", function (ev) {
        targetOccupancy = Number(ev.target.value);
        hudRefs.occupancyLabel.textContent = targetOccupancy + " / " + MAX_OCCUPANCY + " people";
        applyOccupancy();
    });
}

function updateHUD() {
    if (!hudRefs) return;
    hudRefs.timeDisplay.textContent = simClock.format();
    const counts = {};
    for (let i = 0; i < agents.length; i++) {
        const st = agents[i].state;
        counts[st] = (counts[st] || 0) + 1;
    }
    const parts = [];
    const keys = Object.keys(counts).sort();
    for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        if (k === "AWAY" || k === "GONE" || k === "DISABLED") continue;
        parts.push(k.toLowerCase() + " " + counts[k]);
    }
    parts.push("present " + countPresent());
    hudRefs.stateCounts.textContent = parts.join("  ");
    const dirGlyph = elevator.direction > 0 ? "^" : (elevator.direction < 0 ? "v" : "-");
    const destList = Array.from(elevator.destinations).join(",");
    const upList = Array.from(elevator.upCalls).join(",");
    const downList = Array.from(elevator.downCalls).join(",");
    hudRefs.elevInfo.textContent = "Elevator f" + elevator.currentFloor + dirGlyph + " " + elevator.state +
        " riders " + (4 - elevator.currentCapacityFree()) + "/4 dest[" + destList + "] up[" + upList + "] down[" + downList + "]";
}

function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);
    const realDt = Math.min(0.05, frameClock.getDelta());
    simClock.tick(realDt);
    if (simClock.simMinute >= 24 * 60) dayWrap();
    updateLighting();
    const motionDt = realDt * simClock.timeScale;
    const sliceCount = Math.max(1, Math.min(240, Math.ceil(motionDt / 0.5)));
    const sliceDt = motionDt / sliceCount;
    topUpVisitors();
    for (let s = 0; s < sliceCount; s++) {
        elevator.tick(sliceDt);
        for (let i = 0; i < agents.length; i++) {
            dailyTick(agents[i]);
        }
        for (let i = 0; i < agents.length; i++) {
            const agent = agents[i];
            const st = agent.state;
            if (st === "AWAY" || st === "GONE" || st === "DISABLED") continue;
            if (!agent.group || !agent.group.parent) continue;
            dispatchAgent(agent, sliceDt);
        }
    }
    applyCollisions();
    for (let i = 0; i < agents.length; i++) {
        const agent = agents[i];
        if (agent.group && agent.group.parent) {
            animatePersonWalking(agent.group, Math.min(motionDt, 0.15));
        }
    }
    controls.update();
    renderer.render(scene, camera);
    updateHUD();
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
    controls.target.set(0, 9, 0);
    camera.lookAt(0, 9, 0);
    ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
    scene.add(ambientLight);
    hemiLight = new THREE.HemisphereLight(0xbfd7ff, 0x303020, 0.45);
    scene.add(hemiLight);
    sun = new THREE.DirectionalLight(0xffffff, 0.9);
    sun.position.set(20, 35, 18);
    scene.add(sun);
    world = createWorld(scene);
    elevator = new Elevator(scene, world);
    frameClock = new THREE.Clock();
    simClock = createSimClock();
    targetOccupancy = DEFAULT_OCCUPANCY;
    seatReservations = new Set();
    initAgents();
    buildHUD();
    window.addEventListener("resize", onResize);
    animate();
}

if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", startSimulation);
} else {
    startSimulation();
}
