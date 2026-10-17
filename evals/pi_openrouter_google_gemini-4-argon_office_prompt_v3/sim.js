const MAX_WORKERS = 20;
const MAX_VISITORS = 80;
const MAX_OCCUPANCY = MAX_WORKERS + MAX_VISITORS;
const DEFAULT_OCCUPANCY = 45;
const MEETING_PROB = 0.36;

const FIRST_NAMES = [
    "Alex", "Sam", "Jordan", "Taylor", "Morgan", "Casey", "Riley", "Jamie", "Avery", "Quinn",
    "Dana", "Robin", "Drew", "Cameron", "Devon", "Skyler", "Reese", "Finley", "Rowan", "sage",
    "Mia", "Liam", "Noah", "Emma", "Olivia", "Ava", "Sophia", "Lucas", "Mason", "Ethan"
];

let scene = null;
let camera = null;
let renderer = null;
let controls = null;
let world = null;
let elevator = null;
let ambientLight = null;
let hemiLight = null;
let sunLight = null;
let threeClock = null;
let targetOccupancy = DEFAULT_OCCUPANCY;
const agents = [];
const seatReservations = new Set();

function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randFloat(min, max) {
    return min + Math.random() * (max - min);
}

const Clock = {
    simMinute: 7 * 60 + 30,
    timeScale: 120,
    tick: function(realDt) {
        this.simMinute += (realDt * this.timeScale) / 60;
        if (this.simMinute >= 24 * 60) {
            this.simMinute -= 24 * 60;
            onNewSimulatedDay();
        }
    },
    format: function() {
        const total = Math.floor(this.simMinute) % (24 * 60);
        const h24 = Math.floor(total / 60);
        const m = total % 60;
        const ampm = h24 >= 12 ? "PM" : "AM";
        const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
        const hStr = h12 < 10 ? " " + h12 : String(h12);
        const mStr = m < 10 ? "0" + m : String(m);
        return hStr + ":" + mStr + " " + ampm;
    }
};

const DAY_KEYFRAMES = [
    { h: 0.0, bg: 0x161925, sun: 0x334466, si: 0.15, ai: 0.45, hi: 0.32 },
    { h: 5.8, bg: 0x1a1e2e, sun: 0x445577, si: 0.18, ai: 0.45, hi: 0.32 },
    { h: 6.2, bg: 0x553b4e, sun: 0xff9966, si: 0.55, ai: 0.52, hi: 0.38 },
    { h: 6.6, bg: 0x7fa6d2, sun: 0xfff4e0, si: 0.90, ai: 0.60, hi: 0.48 },
    { h: 12.0, bg: 0x87b5e5, sun: 0xffffff, si: 0.95, ai: 0.62, hi: 0.50 },
    { h: 17.4, bg: 0x7fa6d2, sun: 0xfff0d6, si: 0.90, ai: 0.60, hi: 0.48 },
    { h: 18.0, bg: 0x5c3a4d, sun: 0xff7744, si: 0.50, ai: 0.50, hi: 0.36 },
    { h: 18.5, bg: 0x1c2030, sun: 0x334466, si: 0.18, ai: 0.45, hi: 0.32 },
    { h: 24.0, bg: 0x161925, sun: 0x334466, si: 0.15, ai: 0.45, hi: 0.32 }
];

const _tmpColorA = new THREE.Color();
const _tmpColorB = new THREE.Color();

function updateDayNightLighting() {
    if (!scene || !sunLight || !ambientLight || !hemiLight) return;
    const h = (Clock.simMinute / 60) % 24;
    let k0 = DAY_KEYFRAMES[0];
    let k1 = DAY_KEYFRAMES[DAY_KEYFRAMES.length - 1];
    for (let i = 0; i < DAY_KEYFRAMES.length - 1; i++) {
        if (h >= DAY_KEYFRAMES[i].h && h <= DAY_KEYFRAMES[i + 1].h) {
            k0 = DAY_KEYFRAMES[i];
            k1 = DAY_KEYFRAMES[i + 1];
            break;
        }
    }
    const span = Math.max(0.0001, k1.h - k0.h);
    const t = Math.max(0, Math.min(1, (h - k0.h) / span));

    _tmpColorA.setHex(k0.bg);
    _tmpColorB.setHex(k1.bg);
    scene.background.copy(_tmpColorA.lerp(_tmpColorB, t));

    _tmpColorA.setHex(k0.sun);
    _tmpColorB.setHex(k1.sun);
    sunLight.color.copy(_tmpColorA.lerp(_tmpColorB, t));

    sunLight.intensity = k0.si + (k1.si - k0.si) * t;
    ambientLight.intensity = k0.ai + (k1.ai - k0.ai) * t;
    hemiLight.intensity = k0.hi + (k1.hi - k0.hi) * t;

    const sunAngle = ((h - 6) / 12) * Math.PI;
    sunLight.position.set(Math.cos(sunAngle) * 28, Math.max(8, Math.sin(sunAngle) * 36), 18);
}

function reserveConfSeat(agent, floor) {
    releaseAgentSeat(agent);
    const indices = [0, 1, 2, 3];
    for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = indices[i];
        indices[i] = indices[j];
        indices[j] = tmp;
    }
    for (let i = 0; i < indices.length; i++) {
        const wp = "conf_seat" + indices[i];
        const key = floor + ":" + wp;
        if (!seatReservations.has(key)) {
            seatReservations.add(key);
            agent.reservedSeatKey = key;
            return wp;
        }
    }
    return null;
}

function releaseAgentSeat(agent) {
    if (agent && agent.reservedSeatKey) {
        seatReservations.delete(agent.reservedSeatKey);
        agent.reservedSeatKey = null;
    }
}

function findNearestNodeName(floorObj, pos) {
    let bestName = "elevWait";
    let bestDist = Infinity;
    const keys = Object.keys(floorObj.nodes);
    for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        const d = floorObj.nodes[k].pos.distanceToSquared(pos);
        if (d < bestDist) {
            bestDist = d;
            bestName = k;
        }
    }
    return bestName;
}

function planElevatorTrip(fromFloor, toFloor) {
    if (fromFloor === toFloor) return [];
    const dir = toFloor > fromFloor ? 1 : -1;
    return [
        { type: "WALK_TO_WP", floor: fromFloor, wpName: "elevWait" },
        { type: "ENTER_STATE", state: "WAITING_ELEVATOR" },
        { type: "WAIT_AT_PANEL", floor: fromFloor, dir: dir, toFloor: toFloor },
        { type: "ENTER_ELEVATOR", toFloor: toFloor },
        { type: "ENTER_STATE", state: "IN_CAR" },
        { type: "PRESS_FLOOR", floor: toFloor },
        { type: "WAIT_FOR_FLOOR", floor: toFloor },
        { type: "EXIT_ELEVATOR", toFloor: toFloor },
        { type: "ENTER_STATE", state: "ON_FLOOR" }
    ];
}

function planArriveToDesk(agent) {
    const f = agent.homeFloor;
    return [
        { type: "ENTER_STATE", state: "ARRIVING" },
        { type: "WALK_TO_WP", floor: 0, wpName: "front_door_threshold" },
        { type: "WALK_TO_WP", floor: 0, wpName: "entrance" },
        { type: "WALK_TO_WP", floor: 0, wpName: "lobby_center" }
    ].concat(planElevatorTrip(0, f)).concat([
        { type: "WALK_TO_WP", floor: f, wpName: agent.deskDoorWpName },
        { type: "WALK_TO_WP", floor: f, wpName: agent.deskWpName },
        { type: "SIT", floor: f, wpName: agent.deskWpName },
        { type: "ENTER_STATE", state: "AT_DESK" },
        { type: "WAIT_SIM", minutes: randInt(20, 55) },
        { type: "PICK_NEXT_ACTIVITY" }
    ]);
}

function planGoToLunch(agent) {
    const f = agent.homeFloor;
    const cafeSpots = world.floors[0].cafeSpots;
    const spot = cafeSpots[randInt(0, cafeSpots.length - 1)];
    return [
        { type: "STAND" },
        { type: "ENTER_STATE", state: "ON_FLOOR" },
        { type: "WALK_TO_WP", floor: f, wpName: agent.deskDoorWpName }
    ].concat(planElevatorTrip(f, 0)).concat([
        { type: "WALK_TO_WP", floor: 0, wpName: spot },
        { type: "SIT", floor: 0, wpName: spot },
        { type: "ENTER_STATE", state: "AT_LUNCH" },
        { type: "WAIT_SIM", minutes: agent.lunchDuration },
        { type: "MARK_LUNCHED" },
        { type: "STAND" }
    ]).concat(planElevatorTrip(0, f)).concat([
        { type: "WALK_TO_WP", floor: f, wpName: agent.deskDoorWpName },
        { type: "WALK_TO_WP", floor: f, wpName: agent.deskWpName },
        { type: "SIT", floor: f, wpName: agent.deskWpName },
        { type: "ENTER_STATE", state: "AT_DESK" },
        { type: "WAIT_SIM", minutes: randInt(18, 45) },
        { type: "PICK_NEXT_ACTIVITY" }
    ]);
}

function planVisitLounge(agent) {
    const f = agent.homeFloor;
    const spots = ["lounge_spot0", "lounge_spot1", "lounge_spot2", "water_cooler"];
    const spot = spots[randInt(0, spots.length - 1)];
    return [
        { type: "STAND" },
        { type: "ENTER_STATE", state: "ON_FLOOR" },
        { type: "WALK_TO_WP", floor: f, wpName: agent.deskDoorWpName },
        { type: "WALK_TO_WP", floor: f, wpName: spot },
        { type: "SIT", floor: f, wpName: spot },
        { type: "ENTER_STATE", state: "AT_BREAK" },
        { type: "WAIT_SIM", minutes: randInt(5, 12) },
        { type: "STAND" },
        { type: "WALK_TO_WP", floor: f, wpName: agent.deskDoorWpName },
        { type: "WALK_TO_WP", floor: f, wpName: agent.deskWpName },
        { type: "SIT", floor: f, wpName: agent.deskWpName },
        { type: "ENTER_STATE", state: "AT_DESK" },
        { type: "WAIT_SIM", minutes: randInt(18, 50) },
        { type: "PICK_NEXT_ACTIVITY" }
    ];
}

function planAttendMeeting(agent) {
    const f = agent.homeFloor;
    const meetFloor = Math.random() < 0.65 ? f : randInt(1, WORLD.FLOOR_COUNT - 1);
    const seatWp = reserveConfSeat(agent, meetFloor);
    if (!seatWp) return planVisitLounge(agent);
    return [
        { type: "STAND" },
        { type: "ENTER_STATE", state: "ON_FLOOR" },
        { type: "WALK_TO_WP", floor: f, wpName: agent.deskDoorWpName }
    ].concat(planElevatorTrip(f, meetFloor)).concat([
        { type: "WALK_TO_WP", floor: meetFloor, wpName: seatWp },
        { type: "SIT", floor: meetFloor, wpName: seatWp },
        { type: "ENTER_STATE", state: "IN_MEETING" },
        { type: "WAIT_SIM", minutes: randInt(22, 45) },
        { type: "STAND" },
        { type: "RELEASE_SEAT" }
    ]).concat(planElevatorTrip(meetFloor, f)).concat([
        { type: "WALK_TO_WP", floor: f, wpName: agent.deskDoorWpName },
        { type: "WALK_TO_WP", floor: f, wpName: agent.deskWpName },
        { type: "SIT", floor: f, wpName: agent.deskWpName },
        { type: "ENTER_STATE", state: "AT_DESK" },
        { type: "WAIT_SIM", minutes: randInt(18, 50) },
        { type: "PICK_NEXT_ACTIVITY" }
    ]);
}

function planVisitCoworker(agent) {
    const f = agent.homeFloor;
    const peers = agents.filter((a) => a !== agent && a.role === "WORKER" && a.state === "AT_DESK");
    if (peers.length === 0) return planVisitLounge(agent);
    const peer = peers[randInt(0, peers.length - 1)];
    const pf = peer.homeFloor;
    return [
        { type: "STAND" },
        { type: "ENTER_STATE", state: "ON_FLOOR" },
        { type: "WALK_TO_WP", floor: f, wpName: agent.deskDoorWpName }
    ].concat(planElevatorTrip(f, pf)).concat([
        { type: "WALK_TO_WP", floor: pf, wpName: peer.deskDoorWpName },
        { type: "SIT", floor: pf, wpName: peer.deskDoorWpName },
        { type: "ENTER_STATE", state: "AT_BREAK" },
        { type: "WAIT_SIM", minutes: randInt(6, 18) },
        { type: "STAND" }
    ]).concat(planElevatorTrip(pf, f)).concat([
        { type: "WALK_TO_WP", floor: f, wpName: agent.deskDoorWpName },
        { type: "WALK_TO_WP", floor: f, wpName: agent.deskWpName },
        { type: "SIT", floor: f, wpName: agent.deskWpName },
        { type: "ENTER_STATE", state: "AT_DESK" },
        { type: "WAIT_SIM", minutes: randInt(18, 50) },
        { type: "PICK_NEXT_ACTIVITY" }
    ]);
}

function planLeaveBuilding(agent) {
    releaseAgentSeat(agent);
    const f = agent.currentFloor || 0;
    const prefix = [{ type: "STAND" }, { type: "ENTER_STATE", state: "LEAVING" }];
    if (f > 0 && agent.deskDoorWpName && agent.state === "AT_DESK") {
        prefix.push({ type: "WALK_TO_WP", floor: f, wpName: agent.deskDoorWpName });
    }
    return prefix.concat(planElevatorTrip(f, 0)).concat([
        { type: "WALK_TO_WP", floor: 0, wpName: "lobby_center" },
        { type: "WALK_TO_WP", floor: 0, wpName: "entrance" },
        { type: "WALK_TO_WP", floor: 0, wpName: "front_door_threshold" },
        { type: "WALK_TO_WP", floor: 0, wpName: "outside" },
        { type: "EXIT_BUILDING" }
    ]);
}

function planVisitorVisit(agent) {
    const r = Math.random();
    const enterActions = [
        { type: "ENTER_STATE", state: "ARRIVING" },
        { type: "WALK_TO_WP", floor: 0, wpName: "front_door_threshold" },
        { type: "WALK_TO_WP", floor: 0, wpName: "entrance" },
        { type: "WALK_TO_WP", floor: 0, wpName: "lobby_center" },
        { type: "ENTER_STATE", state: "VISITING" }
    ];
    const exitActions = [
        { type: "STAND" },
        { type: "ENTER_STATE", state: "LEAVING" },
        { type: "WALK_TO_WP", floor: 0, wpName: "lobby_center" },
        { type: "WALK_TO_WP", floor: 0, wpName: "entrance" },
        { type: "WALK_TO_WP", floor: 0, wpName: "front_door_threshold" },
        { type: "WALK_TO_WP", floor: 0, wpName: "outside" },
        { type: "EXIT_BUILDING" }
    ];

    if (r < 0.23) {
        const mf = randInt(1, WORLD.FLOOR_COUNT - 1);
        const seatWp = reserveConfSeat(agent, mf);
        if (seatWp) {
            return enterActions.concat(planElevatorTrip(0, mf)).concat([
                { type: "WALK_TO_WP", floor: mf, wpName: seatWp },
                { type: "SIT", floor: mf, wpName: seatWp },
                { type: "ENTER_STATE", state: "IN_MEETING" },
                { type: "WAIT_SIM", minutes: randInt(20, 40) },
                { type: "STAND" },
                { type: "RELEASE_SEAT" }
            ]).concat(planElevatorTrip(mf, 0)).concat(exitActions);
        }
    } else if (r < 0.38) {
        const uf = randInt(1, WORLD.FLOOR_COUNT - 1);
        const uSpots = ["lounge_spot0", "lounge_spot1", "lounge_spot2", "water_cooler", "hall_stand_N", "hall_stand_S"];
        const uSpot = uSpots[randInt(0, uSpots.length - 1)];
        return enterActions.concat(planElevatorTrip(0, uf)).concat([
            { type: "WALK_TO_WP", floor: uf, wpName: uSpot },
            { type: "SIT", floor: uf, wpName: uSpot },
            { type: "ENTER_STATE", state: "VISITING" },
            { type: "WAIT_SIM", minutes: randInt(10, 26) },
            { type: "STAND" }
        ]).concat(planElevatorTrip(uf, 0)).concat(exitActions);
    }

    const cafeSpots = world.floors[0].cafeSpots;
    let lobbyWp = "lobby_stand_center";
    if (r < 0.48) lobbyWp = cafeSpots[randInt(0, cafeSpots.length - 1)];
    else if (r < 0.54) lobbyWp = "cafe_order";
    else if (r < 0.68) lobbyWp = ["lounge_spot0", "lounge_spot1", "lounge_spot2"][randInt(0, 2)];
    else if (r < 0.80) lobbyWp = ["back_lounge_N", "back_lounge_S", "pit_N", "pit_S", "pit_E", "pit_W"][randInt(0, 5)];
    else if (r < 0.90) lobbyWp = ["reception", "kiosk", "lobby_wc_front", "lobby_wc_back"][randInt(0, 3)];
    else lobbyWp = ["lobby_stand_center", "lobby_stand_NE", "lobby_stand_NW", "lobby_stand_midE", "lobby_stand_midW", "lobby_stand_entry"][randInt(0, 5)];

    return enterActions.concat([
        { type: "WALK_TO_WP", floor: 0, wpName: lobbyWp },
        { type: "SIT", floor: 0, wpName: lobbyWp },
        { type: "WAIT_SIM", minutes: agent.visitDuration || randInt(12, 32) }
    ]).concat(exitActions);
}

function chooseNextActivity(agent) {
    const now = Clock.simMinute;
    if (now >= agent.departureTime) return planLeaveBuilding(agent);
    for (let i = 0; i < agent.plannedMeetingTimes.length; i++) {
        if (now >= agent.plannedMeetingTimes[i]) {
            agent.plannedMeetingTimes.splice(i, 1);
            return planAttendMeeting(agent);
        }
    }
    if (!agent.hasLunched && now >= agent.lunchTime) {
        return planGoToLunch(agent);
    }
    const r = Math.random();
    if (r < MEETING_PROB * 0.4) return planAttendMeeting(agent);
    if (r < MEETING_PROB * 0.4 + 0.12) return planVisitLounge(agent);
    if (r < MEETING_PROB * 0.4 + 0.27) return planVisitCoworker(agent);
    return [
        { type: "SIT", floor: agent.homeFloor, wpName: agent.deskWpName },
        { type: "ENTER_STATE", state: "AT_DESK" },
        { type: "WAIT_SIM", minutes: randInt(18, 65) },
        { type: "PICK_NEXT_ACTIVITY" }
    ];
}

function rollDailySchedule(agent) {
    agent.hasLunched = false;
    agent.lunchTime = randInt(11 * 60 + 30, 13 * 60 + 30);
    agent.lunchDuration = randInt(25, 60);
    const isStraggler = Math.random() < 0.15;
    agent.departureTime = isStraggler ? randInt(18 * 60 + 30, 19 * 60 + 45) : randInt(16 * 60 + 45, 18 * 60 + 30);
    agent.plannedMeetingTimes = [];
    if (Math.random() < 0.65) agent.plannedMeetingTimes.push(randInt(9 * 60 + 45, 11 * 60 + 15));
    if (Math.random() < 0.65) agent.plannedMeetingTimes.push(randInt(14 * 60, 16 * 60));
    if (agent.role === "WORKER") {
        agent.arrivalTime = randInt(8 * 60 + 15, 9 * 60 + 30);
    } else {
        agent.arrivalTime = randInt(8 * 60 + 20, 16 * 60 + 30);
        agent.visitDuration = randInt(14, 38);
    }
}

function initAgents() {
    agents.length = 0;
    const allDesks = [];
    for (let f = 1; f < world.floors.length; f++) {
        const fl = world.floors[f];
        for (let d = 0; d < fl.desks.length; d++) allDesks.push(fl.desks[d]);
    }
    for (let i = 0; i < MAX_OCCUPANCY; i++) {
        const isWorker = i < MAX_WORKERS && i < allDesks.length;
        const desk = isWorker ? allDesks[i] : null;
        const group = createPerson();
        group.visible = false;
        const agent = {
            id: i,
            name: FIRST_NAMES[i % FIRST_NAMES.length] + (i >= FIRST_NAMES.length ? String(i) : ""),
            role: isWorker ? "WORKER" : "VISITOR",
            homeFloor: isWorker ? desk.floor : null,
            deskId: isWorker ? desk.id : null,
            deskWpName: isWorker ? desk.deskWpName : null,
            deskDoorWpName: isWorker ? desk.deskDoorWpName : null,
            currentFloor: 0,
            state: i < targetOccupancy ? "AWAY" : "DISABLED",
            group: group,
            plan: [],
            currentAction: null,
            reservedSeatKey: null
        };
        rollDailySchedule(agent);
        if (i < 6) {
            agent.arrivalTime = 7 * 60 + 30 + i;
        } else if (!isWorker && i < targetOccupancy) {
            agent.arrivalTime = randInt(7 * 60 + 32, 9 * 60 + 40);
        }
        agents.push(agent);
    }
}

function countPresent() {
    let c = 0;
    for (let i = 0; i < agents.length; i++) {
        const st = agents[i].state;
        if (st !== "DISABLED" && st !== "AWAY" && st !== "GONE") c++;
    }
    return c;
}

function applyOccupancy() {
    for (let i = 0; i < agents.length; i++) {
        const a = agents[i];
        if (a.id < targetOccupancy) {
            if (a.state === "DISABLED") {
                a.state = "AWAY";
                rollDailySchedule(a);
            }
        } else {
            if (a.state === "AWAY" || a.state === "GONE") {
                a.state = "DISABLED";
                a.group.visible = false;
                if (a.group.parent) a.group.parent.remove(a.group);
            }
        }
    }
}

function topUpVisitors() {
    const now = Clock.simMinute;
    if (now < 8 * 60 + 10 || now > 17 * 60 + 10) return;
    let deficit = targetOccupancy - countPresent();
    if (deficit <= 0) return;
    for (let i = 0; i < agents.length && deficit > 0; i++) {
        const a = agents[i];
        if (a.role === "VISITOR" && a.id < targetOccupancy && (a.state === "AWAY" || a.state === "GONE")) {
            if (a.state === "AWAY" && a.arrivalTime >= now && a.arrivalTime <= now + 8) {
                deficit--;
                continue;
            }
            a.arrivalTime = now + randInt(0, 6);
            a.visitDuration = randInt(14, 36);
            a.state = "AWAY";
            deficit--;
        }
    }
}

function onNewSimulatedDay() {
    seatReservations.clear();
    if (elevator) elevator.reset();
    for (let i = 0; i < agents.length; i++) {
        const a = agents[i];
        a.reservedSeatKey = null;
        a.plan = [];
        a.currentAction = null;
        a.currentFloor = 0;
        a.group.userData.isSitting = false;
        a.group.userData.isWalking = false;
        a.group.visible = false;
        if (a.group.parent) a.group.parent.remove(a.group);
        rollDailySchedule(a);
        a.state = a.id < targetOccupancy ? "AWAY" : "DISABLED";
    }
}

function spawnAgentAtOutside(agent) {
    const outPos = world.floors[0].nodes.outside.pos;
    agent.currentFloor = 0;
    agent.group.position.set(
        outPos.x + randFloat(-1.1, 1.1),
        0,
        outPos.z + randFloat(-0.75, 0.75)
    );
    agent.group.rotation.y = Math.PI;
    agent.group.userData.isSitting = false;
    agent.group.userData.isWalking = false;
    agent.group.visible = true;
    scene.add(agent.group);
    agent.plan = agent.role === "WORKER" ? planArriveToDesk(agent) : planVisitorVisit(agent);
    agent.currentAction = null;
}

function startAction(agent, act) {
    if (act.type === "WALK_TO_WP") {
        const floorObj = world.floors[act.floor];
        const fromWp = findNearestNodeName(floorObj, agent.group.position);
        const path = world.bfsPath(floorObj.nodes, fromWp, act.wpName);
        if (path.length > 1 && path[0].distanceTo(agent.group.position) < 0.35) {
            path.shift();
        }
        act._path = path;
        act._idx = 0;
        act._prevPos = agent.group.position.clone();
        act._stallT = 0;
    } else if (act.type === "WAIT_SIM") {
        act.untilMin = Clock.simMinute + act.minutes;
        agent.group.userData.isWalking = false;
    } else if (act.type === "ENTER_ELEVATOR") {
        act._phase = "reserve";
        act._spot = null;
        act._stallT = 0;
        act._prevWalk = agent.group.position.clone();
    } else if (act.type === "EXIT_ELEVATOR") {
        const worldPos = new THREE.Vector3();
        agent.group.getWorldPosition(worldPos);
        scene.add(agent.group);
        agent.group.position.copy(worldPos);
        agent.currentFloor = act.toFloor;
        agent.group.position.y = act.toFloor * WORLD.FLOOR_HEIGHT;
        elevator.registerDisembark(agent);
        const waitPos = world.floors[act.toFloor].nodes.elevWait.pos;
        act._target = new THREE.Vector3(
            waitPos.x + randFloat(-0.45, 0.45),
            act.toFloor * WORLD.FLOOR_HEIGHT,
            waitPos.z + randFloat(-0.2, 0.35)
        );
        act._stallT = 0;
        act._prevWalk = agent.group.position.clone();
    }
}

function moveTowardsXZ(group, target, speed, dt) {
    const dx = target.x - group.position.x;
    const dz = target.z - group.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist <= speed * dt || dist < 0.05) {
        group.position.x = target.x;
        group.position.z = target.z;
        return true;
    }
    const step = speed * dt;
    group.position.x += (dx / dist) * step;
    group.position.z += (dz / dist) * step;
    group.rotation.y = Math.atan2(dx, dz);
    return false;
}

function stepAction(agent, act, motionDt) {
    const walkSpeed = 1.45;
    if (act.type === "WALK_TO_WP") {
        if (!act._path || act._idx >= act._path.length) {
            agent.group.userData.isWalking = false;
            return true;
        }
        agent.group.userData.isWalking = true;
        agent.group.userData.isSitting = false;
        const target = act._path[act._idx];
        const reached = moveTowardsXZ(agent.group, target, walkSpeed, motionDt);
        const moved = agent.group.position.distanceTo(act._prevPos);
        act._prevPos.copy(agent.group.position);
        if (moved < 0.005) act._stallT += motionDt;
        else act._stallT = 0;

        if (reached || act._stallT > 1.2) {
            if (act._stallT > 1.2) {
                agent.group.position.x = target.x;
                agent.group.position.z = target.z;
            }
            act._stallT = 0;
            act._idx++;
            if (act._idx >= act._path.length) {
                agent.group.userData.isWalking = false;
                return true;
            }
        }
        return false;
    }

    if (act.type === "WAIT_AT_PANEL") {
        agent.group.userData.isWalking = false;
        if (act.dir > 0) elevator.callUp(act.floor);
        else elevator.callDown(act.floor);
        if (elevator.isAcceptingAt(act.floor, act.dir) && elevator.currentCapacityFree() > 0) {
            return true;
        }
        return false;
    }

    if (act.type === "ENTER_ELEVATOR") {
        const curFloor = agent.currentFloor;
        const dir = act.toFloor > curFloor ? 1 : -1;
        if (act._phase === "reserve") {
            if (!elevator.isAcceptingAt(curFloor, dir)) {
                if (dir > 0) elevator.callUp(curFloor);
                else elevator.callDown(curFloor);
                agent.plan.unshift({ type: "WAIT_AT_PANEL", floor: curFloor, dir: dir, toFloor: act.toFloor }, act);
                return true;
            }
            const spot = elevator.reserveBoardingSpot(agent);
            if (!spot) {
                if (dir > 0) elevator.callUp(curFloor);
                else elevator.callDown(curFloor);
                agent.plan.unshift({ type: "WAIT_AT_PANEL", floor: curFloor, dir: dir, toFloor: act.toFloor }, act);
                return true;
            }
            act._spot = spot;
            act._doorTarget = new THREE.Vector3(spot.worldPos.x, curFloor * WORLD.FLOOR_HEIGHT, 1.45);
            act._phase = "walkToDoor";
            act._stallT = 0;
            act._prevWalk.copy(agent.group.position);
        }
        if (act._phase === "walkToDoor") {
            agent.group.userData.isWalking = true;
            const reached = moveTowardsXZ(agent.group, act._doorTarget, walkSpeed, motionDt);
            const moved = agent.group.position.distanceTo(act._prevWalk);
            act._prevWalk.copy(agent.group.position);
            if (moved < 0.005) act._stallT += motionDt;
            else act._stallT = 0;
            if (reached || act._stallT > 1.5) {
                agent.group.position.copy(act._doorTarget);
                elevator.carGroup.add(agent.group);
                agent.group.position.set(act._spot.localPos.x, 0, 1.35);
                act._phase = "walkToSpot";
                act._stallT = 0;
                act._prevWalk.copy(agent.group.position);
            }
            return false;
        }
        if (act._phase === "walkToSpot") {
            agent.group.userData.isWalking = true;
            const reached = moveTowardsXZ(agent.group, act._spot.localPos, walkSpeed, motionDt);
            const moved = agent.group.position.distanceTo(act._prevWalk);
            act._prevWalk.copy(agent.group.position);
            if (moved < 0.005) act._stallT += motionDt;
            else act._stallT = 0;
            if (reached || act._stallT > 1.2) {
                agent.group.position.copy(act._spot.localPos);
                agent.group.rotation.y = 0;
                agent.group.userData.isWalking = false;
                elevator.completeBoard(agent);
                return true;
            }
            return false;
        }
    }
    return stepActionRemaining(agent, act, motionDt, walkSpeed);
}

function stepActionRemaining(agent, act, motionDt, walkSpeed) {
    if (act.type === "PRESS_FLOOR") {
        elevator.pressDestination(act.floor);
        return true;
    }
    if (act.type === "WAIT_FOR_FLOOR") {
        agent.group.userData.isWalking = false;
        if (!elevator.destinations.has(act.floor) && elevator.currentFloor !== act.floor) {
            elevator.pressDestination(act.floor);
        }
        return elevator.state === "DOOR_OPEN" && elevator.currentFloor === act.floor;
    }
    if (act.type === "EXIT_ELEVATOR") {
        agent.group.userData.isWalking = true;
        const reached = moveTowardsXZ(agent.group, act._target, walkSpeed, motionDt);
        const moved = agent.group.position.distanceTo(act._prevWalk);
        act._prevWalk.copy(agent.group.position);
        if (moved < 0.005) act._stallT += motionDt;
        else act._stallT = 0;
        if (reached || act._stallT > 1.2) {
            agent.group.position.copy(act._target);
            agent.group.userData.isWalking = false;
            elevator.completeDisembark(agent);
            return true;
        }
        return false;
    }
    if (act.type === "SIT") {
        const floorObj = world.floors[act.floor];
        const node = floorObj.nodes[act.wpName];
        const st = floorObj.sitTargets[act.wpName] || { sit: false, facing: 0 };
        agent.group.userData.isWalking = false;
        if (st.sit) {
            if (node) {
                agent.group.position.x = node.pos.x;
                agent.group.position.z = node.pos.z;
            }
            agent.group.position.y = act.floor * WORLD.FLOOR_HEIGHT - 0.35;
            agent.group.rotation.y = st.facing;
            agent.group.userData.isSitting = true;
        } else {
            if (node) {
                const ang = Math.random() * Math.PI * 2;
                const rad = randFloat(0.35, 0.75);
                agent.group.position.x = node.pos.x + Math.cos(ang) * rad;
                agent.group.position.z = node.pos.z + Math.sin(ang) * rad;
            }
            agent.group.position.y = act.floor * WORLD.FLOOR_HEIGHT;
            agent.group.rotation.y = st.facing;
            agent.group.userData.isSitting = false;
        }
        return true;
    }
    if (act.type === "STAND") {
        agent.group.userData.isSitting = false;
        agent.group.userData.isWalking = false;
        const inCar = agent.group.parent === elevator.carGroup;
        agent.group.position.y = inCar ? 0 : agent.currentFloor * WORLD.FLOOR_HEIGHT;
        return true;
    }
    if (act.type === "RELEASE_SEAT") {
        releaseAgentSeat(agent);
        return true;
    }
    if (act.type === "WAIT_SIM") {
        agent.group.userData.isWalking = false;
        return Clock.simMinute >= act.untilMin;
    }
    if (act.type === "EXIT_BUILDING") {
        releaseAgentSeat(agent);
        agent.group.userData.isWalking = false;
        agent.group.userData.isSitting = false;
        agent.group.visible = false;
        if (agent.group.parent) agent.group.parent.remove(agent.group);
        agent.state = "GONE";
        return true;
    }
    if (act.type === "ENTER_STATE") {
        agent.state = act.state;
        return true;
    }
    if (act.type === "MARK_LUNCHED") {
        agent.hasLunched = true;
        return true;
    }
    if (act.type === "PICK_NEXT_ACTIVITY") {
        const nextPlan = chooseNextActivity(agent);
        agent.plan = nextPlan.concat(agent.plan);
        return true;
    }
    return true;
}

function updateAgent(agent, motionDt) {
    if (agent.state === "DISABLED" || agent.state === "GONE") return;
    if (agent.state === "AWAY") {
        if (Clock.simMinute >= agent.arrivalTime) {
            spawnAgentAtOutside(agent);
        } else {
            return;
        }
    }

    if (
        agent.role === "WORKER" &&
        Clock.simMinute >= agent.departureTime &&
        agent.state !== "LEAVING" &&
        agent.state !== "WAITING_ELEVATOR" &&
        agent.state !== "IN_CAR" &&
        agent.group.parent === scene &&
        (!agent.currentAction || (agent.currentAction.type !== "ENTER_ELEVATOR" && agent.currentAction.type !== "EXIT_ELEVATOR"))
    ) {
        agent.plan = planLeaveBuilding(agent);
        agent.currentAction = null;
    }

    for (let iter = 0; iter < 16; iter++) {
        if (!agent.currentAction) {
            if (agent.plan.length === 0) break;
            agent.currentAction = agent.plan.shift();
            startAction(agent, agent.currentAction);
        }
        const done = stepAction(agent, agent.currentAction, iter === 0 ? motionDt : 0);
        if (done) {
            agent.currentAction = null;
        } else {
            break;
        }
    }
}

function isExemptFromCollision(a) {
    if (!a.group.visible || !a.group.parent) return true;
    if (a.state === "DISABLED" || a.state === "AWAY" || a.state === "GONE") return true;
    if (a.group.userData.isSitting) return true;
    if (a.group.parent === elevator.carGroup) return true;
    if (a.currentAction) {
        const t = a.currentAction.type;
        if (t === "ENTER_ELEVATOR" || t === "EXIT_ELEVATOR") return true;
        if (t === "WALK_TO_WP" && a.currentAction.floor === 0) {
            const wp = a.currentAction.wpName;
            if (wp === "outside" || wp === "front_door_threshold" || wp === "entrance" || wp === "lobby_center") {
                if (a.group.position.z > 6.8) return true;
            }
        }
    }
    return false;
}

function applyCollisions() {
    const minDist = 0.7;
    const pushScalar = 0.18;
    for (let i = 0; i < agents.length; i++) {
        const a = agents[i];
        if (isExemptFromCollision(a)) continue;
        for (let j = i + 1; j < agents.length; j++) {
            const b = agents[j];
            if (isExemptFromCollision(b)) continue;
            if (a.group.parent !== b.group.parent) continue;
            if (Math.abs(a.group.position.y - b.group.position.y) > 1.0) continue;

            const dx = b.group.position.x - a.group.position.x;
            const dz = b.group.position.z - a.group.position.z;
            const d = Math.hypot(dx, dz);
            if (d < minDist) {
                let nx = 0;
                let nz = 0;
                if (d < 1e-3) {
                    const ang = Math.random() * Math.PI * 2;
                    nx = Math.cos(ang);
                    nz = Math.sin(ang);
                } else {
                    nx = dx / d;
                    nz = dz / d;
                }
                const overlap = (minDist - d) * pushScalar;
                a.group.position.x -= nx * overlap;
                a.group.position.z -= nz * overlap;
                b.group.position.x += nx * overlap;
                b.group.position.z += nz * overlap;
            }
        }
    }
}

let hudClockEl = null;
let hudSpeedValEl = null;
let hudOccValEl = null;
let hudStatsEl = null;

function createHUD() {
    const panel = document.createElement("div");
    panel.style.cssText = "position:fixed;top:12px;left:12px;width:280px;background:rgba(15,23,42,0.86);color:#f8fafc;font-family:monospace;font-size:12px;padding:12px 14px;border-radius:8px;border:1px solid rgba(148,163,184,0.3);z-index:10;user-select:none;line-height:1.45;";

    hudClockEl = document.createElement("div");
    hudClockEl.style.cssText = "font-size:24px;font-weight:bold;color:#ffbb22;margin-bottom:8px;letter-spacing:1px;";
    hudClockEl.textContent = Clock.format();
    panel.appendChild(hudClockEl);

    const speedRow = document.createElement("div");
    speedRow.style.marginBottom = "8px";
    hudSpeedValEl = document.createElement("div");
    hudSpeedValEl.textContent = "Speed: " + Clock.timeScale + "x realtime";
    const speedSlider = document.createElement("input");
    speedSlider.type = "range";
    speedSlider.min = "0";
    speedSlider.max = "100";
    speedSlider.value = String(Math.round((Math.log(Clock.timeScale) / Math.log(600)) * 100));
    speedSlider.style.width = "100%";
    speedSlider.addEventListener("input", (event) => {
        const v = parseFloat(event.target.value) / 100;
        Clock.timeScale = Math.max(1, Math.round(Math.pow(600, v)));
        hudSpeedValEl.textContent = "Speed: " + Clock.timeScale + "x realtime";
    });
    speedRow.appendChild(hudSpeedValEl);
    speedRow.appendChild(speedSlider);
    panel.appendChild(speedRow);

    const occRow = document.createElement("div");
    occRow.style.marginBottom = "8px";
    hudOccValEl = document.createElement("div");
    hudOccValEl.textContent = "Occupancy: " + targetOccupancy + " / " + MAX_OCCUPANCY + " people";
    const occSlider = document.createElement("input");
    occSlider.type = "range";
    occSlider.min = "1";
    occSlider.max = String(MAX_OCCUPANCY);
    occSlider.value = String(targetOccupancy);
    occSlider.style.width = "100%";
    occSlider.addEventListener("input", (event) => {
        targetOccupancy = parseInt(event.target.value, 10);
        hudOccValEl.textContent = "Occupancy: " + targetOccupancy + " / " + MAX_OCCUPANCY + " people";
        applyOccupancy();
    });
    occRow.appendChild(hudOccValEl);
    occRow.appendChild(occSlider);
    panel.appendChild(occRow);

    hudStatsEl = document.createElement("div");
    hudStatsEl.style.cssText = "border-top:1px solid rgba(148,163,184,0.25);padding-top:8px;white-space:pre;";
    panel.appendChild(hudStatsEl);

    document.body.appendChild(panel);
}

function updateHUD() {
    if (!hudClockEl || !hudStatsEl) return;
    hudClockEl.textContent = Clock.format();
    const counts = {};
    for (let i = 0; i < agents.length; i++) {
        const st = agents[i].state;
        counts[st] = (counts[st] || 0) + 1;
    }
    const dirStr = elevator.direction > 0 ? "UP (^)" : (elevator.direction < 0 ? "DOWN (v)" : "NONE");
    const destArr = Array.from(elevator.destinations).sort().join(",") || "-";
    const upArr = Array.from(elevator.upCalls).sort().join(",") || "-";
    const downArr = Array.from(elevator.downCalls).sort().join(",") || "-";

    const stateOrder = [
        "ARRIVING", "WAITING_ELEVATOR", "IN_CAR", "ON_FLOOR",
        "AT_DESK", "IN_MEETING", "AT_BREAK", "AT_LUNCH",
        "VISITING", "LEAVING", "AWAY", "GONE", "DISABLED"
    ];
    const lines = [
        "--- ELEVATOR ---",
        "Floor: " + elevator.currentFloor + " | Dir: " + dirStr,
        "State: " + elevator.state + " | Riders: " + elevator.passengers.size + "/4",
        "Dest: [" + destArr + "] Up: [" + upArr + "] Dn: [" + downArr + "]",
        "--- AGENTS (Present: " + countPresent() + ") ---"
    ];
    for (let i = 0; i < stateOrder.length; i++) {
        const k = stateOrder[i];
        if (counts[k]) lines.push(k + ": " + counts[k]);
    }
    hudStatsEl.textContent = lines.join("\n");
}

function startSimulation() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x20242a);
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(28, 24, 28);
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.sortObjects = true;
    document.body.appendChild(renderer.domElement);
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 9, 0);
    ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
    scene.add(ambientLight);
    hemiLight = new THREE.HemisphereLight(0xbfd7ff, 0x303020, 0.45);
    scene.add(hemiLight);
    sunLight = new THREE.DirectionalLight(0xffffff, 0.9);
    sunLight.position.set(20, 35, 18);
    scene.add(sunLight);
    world = createWorld(scene);
    elevator = new Elevator(scene, world);
    initAgents();
    createHUD();
    threeClock = new THREE.Clock();

    window.addEventListener("resize", () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    function animate() {
        requestAnimationFrame(animate);
        const realDt = Math.min(0.05, threeClock.getDelta());
        Clock.tick(realDt);
        updateDayNightLighting();
        const motionDt = realDt * Clock.timeScale;
        elevator.tick(motionDt);
        topUpVisitors();
        for (let i = 0; i < agents.length; i++) {
            updateAgent(agents[i], motionDt);
        }
        applyCollisions();
        for (let i = 0; i < agents.length; i++) {
            if (agents[i].group.visible && agents[i].group.parent) {
                animatePersonWalking(agents[i].group, motionDt);
            }
        }
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
