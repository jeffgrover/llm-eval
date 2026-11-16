let scene = null;
let camera = null;
let renderer = null;
let controls = null;
let world = null;
let elevator = null;
let sunLight = null;
let ambientLight = null;
let hemiLight = null;

const MAX_WORKERS = 20;
const MAX_VISITORS = 80;
const MAX_OCCUPANCY = MAX_WORKERS + MAX_VISITORS;
const DEFAULT_OCCUPANCY = 45;
const WALK_SPEED = 1.35;

let targetOccupancy = DEFAULT_OCCUPANCY;
const agents = [];
const seatReservations = new Set();
const hudEls = {};

const FIRST_NAMES = [
    "Alex", "Sam", "Jordan", "Taylor", "Morgan", "Casey", "Riley", "Jamie",
    "Drew", "Avery", "Quinn", "Blake", "Reese", "Parker", "Skyler", "Rowan",
    "Elena", "Marcus", "Priya", "Liam", "Noah", "Maya", "Zoe", "Leo",
    "Nora", "Owen", "Chloe", "Ethan", "Ruby", "Miles"
];

function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randFloat(min, max) {
    return Math.random() * (max - min) + min;
}

function pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

const simClock = {
    simMinute: 7 * 60 + 30,
    timeScale: 120,
    tick: function (realDt) {
        this.simMinute += (realDt * this.timeScale) / 60;
        if (this.simMinute >= 24 * 60) {
            this.simMinute -= 24 * 60;
            resetDay();
        }
    },
    format: function () {
        const total = Math.floor(this.simMinute) % (24 * 60);
        const h24 = Math.floor(total / 60);
        const m = total % 60;
        const ampm = h24 >= 12 ? "PM" : "AM";
        let h12 = h24 % 12;
        if (h12 === 0) h12 = 12;
        const hStr = h12 < 10 ? " " + h12 : String(h12);
        const mStr = m < 10 ? "0" + m : String(m);
        return hStr + ":" + mStr + " " + ampm;
    }
};

const LIGHTING_KEYFRAMES = [
    { h: 0.0,  bg: 0x151822, sun: 0x334466, si: 0.12, ai: 0.45, hi: 0.32 },
    { h: 5.5,  bg: 0x1a1e2e, sun: 0x445577, si: 0.15, ai: 0.45, hi: 0.32 },
    { h: 6.0,  bg: 0x5d4a66, sun: 0xff8844, si: 0.45, ai: 0.50, hi: 0.38 },
    { h: 6.5,  bg: 0x87b5d6, sun: 0xfff0d4, si: 0.90, ai: 0.52, hi: 0.48 },
    { h: 12.0, bg: 0x99c8e8, sun: 0xffffff, si: 1.00, ai: 0.55, hi: 0.50 },
    { h: 17.5, bg: 0x87b5d6, sun: 0xffe8c2, si: 0.88, ai: 0.52, hi: 0.46 },
    { h: 18.0, bg: 0x6b4b63, sun: 0xff7733, si: 0.45, ai: 0.48, hi: 0.36 },
    { h: 18.5, bg: 0x1c2030, sun: 0x334466, si: 0.14, ai: 0.45, hi: 0.32 },
    { h: 24.0, bg: 0x151822, sun: 0x334466, si: 0.12, ai: 0.45, hi: 0.32 }
];

const _tmpColorA = new THREE.Color();
const _tmpColorB = new THREE.Color();

function updateLighting(simMinute) {
    const h = (simMinute / 60) % 24;
    let k0 = LIGHTING_KEYFRAMES[0];
    let k1 = LIGHTING_KEYFRAMES[LIGHTING_KEYFRAMES.length - 1];
    for (let i = 0; i < LIGHTING_KEYFRAMES.length - 1; i++) {
        if (h >= LIGHTING_KEYFRAMES[i].h && h <= LIGHTING_KEYFRAMES[i + 1].h) {
            k0 = LIGHTING_KEYFRAMES[i];
            k1 = LIGHTING_KEYFRAMES[i + 1];
            break;
        }
    }
    const span = Math.max(0.0001, k1.h - k0.h);
    const t = Math.max(0, Math.min(1, (h - k0.h) / span));

    _tmpColorA.setHex(k0.bg);
    _tmpColorB.setHex(k1.bg);
    scene.background.copy(_tmpColorA).lerp(_tmpColorB, t);

    _tmpColorA.setHex(k0.sun);
    _tmpColorB.setHex(k1.sun);
    sunLight.color.copy(_tmpColorA).lerp(_tmpColorB, t);

    sunLight.intensity = k0.si + (k1.si - k0.si) * t;
    ambientLight.intensity = k0.ai + (k1.ai - k0.ai) * t;
    hemiLight.intensity = k0.hi + (k1.hi - k0.hi) * t;
}

function rollWorkerSchedule(agent) {
    agent.arrivalTime = randInt(8 * 60 + 15, 9 * 60 + 30);
    agent.lunchTime = randInt(11 * 60 + 30, 13 * 60 + 15);
    agent.lunchDuration = randInt(25, 60);
    agent.hasLunched = false;
    if (Math.random() < 0.15) {
        agent.departureTime = randInt(18 * 60 + 30, 19 * 60 + 45);
    } else {
        agent.departureTime = randInt(16 * 60 + 45, 18 * 60 + 30);
    }
    agent.plannedMeetingTimes = [];
    const mCount = randInt(0, 2);
    if (mCount >= 1) agent.plannedMeetingTimes.push(randInt(9 * 60 + 45, 11 * 60 + 15));
    if (mCount >= 2) agent.plannedMeetingTimes.push(randInt(13 * 60 + 45, 16 * 60 + 15));
}

function rollVisitorSchedule(agent, baseMin) {
    const start = baseMin !== undefined ? baseMin : 8 * 60 + 15;
    agent.arrivalTime = start + randInt(0, 6);
    agent.visitDuration = randInt(8, 28);
    agent.lunchTime = 9999;
    agent.lunchDuration = 0;
    agent.hasLunched = true;
    agent.departureTime = 9999;
    agent.plannedMeetingTimes = [];
}

function createAgents() {
    let idCounter = 0;
    // 20 Workers (floors 1..5, 4 desks each)
    for (let f = 1; f < WORLD.FLOOR_COUNT; f++) {
        const fl = world.floors[f];
        for (let d = 0; d < fl.desks.length; d++) {
            const desk = fl.desks[d];
            const mesh = createPerson();
            const agent = {
                id: idCounter++,
                role: "WORKER",
                name: pickRandom(FIRST_NAMES),
                homeFloor: f,
                deskId: desk.id,
                deskWpName: desk.deskWpName,
                deskDoorWpName: desk.doorWpName,
                group: mesh,
                state: "AWAY",
                currentFloor: 0,
                plan: [],
                currentAction: null,
                reservedSeatKey: null
            };
            rollWorkerSchedule(agent);
            agents.push(agent);
        }
    }

    // 80 Visitors
    for (let v = 0; v < MAX_VISITORS; v++) {
        const mesh = createPerson();
        const agent = {
            id: idCounter++,
            role: "VISITOR",
            name: pickRandom(FIRST_NAMES),
            homeFloor: null,
            deskId: null,
            deskWpName: null,
            deskDoorWpName: null,
            group: mesh,
            state: "AWAY",
            currentFloor: 0,
            plan: [],
            currentAction: null,
            reservedSeatKey: null
        };
        rollVisitorSchedule(agent, 8 * 60 + randInt(0, 120));
        agents.push(agent);
    }

    applyOccupancy();
}

function releaseSeat(agent) {
    if (agent.reservedSeatKey) {
        seatReservations.delete(agent.reservedSeatKey);
        agent.reservedSeatKey = null;
    }
}

function reserveConfSeat(floor) {
    for (let i = 0; i < 4; i++) {
        const wpName = "conf_seat" + i;
        const key = floor + ":" + wpName;
        if (!seatReservations.has(key)) {
            seatReservations.add(key);
            return { key: key, wpName: wpName };
        }
    }
    return null;
}

function applyOccupancy() {
    for (let i = 0; i < agents.length; i++) {
        const a = agents[i];
        if (a.id < targetOccupancy) {
            if (a.state === "DISABLED") {
                a.state = "AWAY";
            }
        } else {
            if (a.state === "AWAY" || a.state === "GONE") {
                a.state = "DISABLED";
                if (a.group.parent) a.group.parent.remove(a.group);
            }
        }
    }
}

function countPresent() {
    let count = 0;
    for (let i = 0; i < agents.length; i++) {
        const s = agents[i].state;
        if (s !== "DISABLED" && s !== "AWAY" && s !== "GONE") {
            count++;
        }
    }
    return count;
}

function topUpVisitors() {
    if (simClock.simMinute < 7 * 60 + 30 || simClock.simMinute > 18 * 60 + 30) return;
    const deficit = targetOccupancy - countPresent();
    if (deficit <= 0) return;

    let armed = 0;
    for (let i = 0; i < agents.length; i++) {
        const a = agents[i];
        if (a.role !== "VISITOR" || a.id >= targetOccupancy) continue;
        if (a.state === "GONE" || (a.state === "AWAY" && a.arrivalTime > simClock.simMinute + 12)) {
            rollVisitorSchedule(a, simClock.simMinute);
            a.state = "AWAY";
            armed++;
            if (armed >= deficit) break;
        }
    }
}

function resetDay() {
    seatReservations.clear();
    if (elevator) elevator.reset();

    for (let i = 0; i < agents.length; i++) {
        const a = agents[i];
        if (a.group.parent) a.group.parent.remove(a.group);
        a.group.userData.isWalking = false;
        a.group.userData.isSitting = false;
        a.plan = [];
        a.currentAction = null;
        a.reservedSeatKey = null;
        a.currentFloor = 0;

        if (a.role === "WORKER") {
            rollWorkerSchedule(a);
        } else {
            rollVisitorSchedule(a, 8 * 60 + randInt(0, 90));
        }
        a.state = a.id < targetOccupancy ? "AWAY" : "DISABLED";
    }
}

// --- Plan Compilers ---

function addElevatorTrip(plan, fromFloor, toFloor) {
    if (fromFloor === toFloor) return;
    const dir = toFloor > fromFloor ? 1 : -1;
    plan.push({ type: "WALK_TO_WP", floor: fromFloor, wpName: "elevWait" });
    plan.push({ type: "WAIT_AT_PANEL", floor: fromFloor, dir: dir, toFloor: toFloor });
    plan.push({ type: "ENTER_ELEVATOR", toFloor: toFloor });
    plan.push({ type: "PRESS_FLOOR", floor: toFloor });
    plan.push({ type: "WAIT_FOR_FLOOR", floor: toFloor });
    plan.push({ type: "EXIT_ELEVATOR", toFloor: toFloor });
    plan.push({ type: "ENTER_STATE", state: "ON_FLOOR" });
}

function planArriveToDesk(agent) {
    const plan = [];
    plan.push({ type: "ENTER_STATE", state: "ARRIVING" });
    plan.push({ type: "WALK_TO_WP", floor: 0, wpName: "front_door_threshold" });
    plan.push({ type: "WALK_TO_WP", floor: 0, wpName: "entrance" });
    plan.push({ type: "WALK_TO_WP", floor: 0, wpName: "lobby_center" });
    addElevatorTrip(plan, 0, agent.homeFloor);
    plan.push({ type: "WALK_TO_WP", floor: agent.homeFloor, wpName: agent.deskDoorWpName });
    plan.push({ type: "WALK_TO_WP", floor: agent.homeFloor, wpName: agent.deskWpName });
    plan.push({ type: "SIT", floor: agent.homeFloor, wpName: agent.deskWpName });
    plan.push({ type: "ENTER_STATE", state: "AT_DESK" });
    plan.push({ type: "WAIT_SIM", minutes: randInt(20, 55) });
    plan.push({ type: "PICK_NEXT_ACTIVITY" });
    return plan;
}

function planGoToLunch(agent) {
    const plan = [];
    const cafeSpots = world.floors[0].cafeSpots;
    const bistroWp = pickRandom(cafeSpots);

    plan.push({ type: "STAND" });
    plan.push({ type: "ENTER_STATE", state: "ON_FLOOR" });
    plan.push({ type: "WALK_TO_WP", floor: agent.homeFloor, wpName: agent.deskDoorWpName });
    addElevatorTrip(plan, agent.homeFloor, 0);
    plan.push({ type: "WALK_TO_WP", floor: 0, wpName: bistroWp });
    plan.push({ type: "SIT", floor: 0, wpName: bistroWp });
    plan.push({ type: "ENTER_STATE", state: "AT_LUNCH" });
    plan.push({ type: "WAIT_SIM", minutes: agent.lunchDuration });
    plan.push({ type: "MARK_LUNCHED" });
    plan.push({ type: "STAND" });
    plan.push({ type: "ENTER_STATE", state: "ON_FLOOR" });
    addElevatorTrip(plan, 0, agent.homeFloor);
    plan.push({ type: "WALK_TO_WP", floor: agent.homeFloor, wpName: agent.deskDoorWpName });
    plan.push({ type: "WALK_TO_WP", floor: agent.homeFloor, wpName: agent.deskWpName });
    plan.push({ type: "SIT", floor: agent.homeFloor, wpName: agent.deskWpName });
    plan.push({ type: "ENTER_STATE", state: "AT_DESK" });
    plan.push({ type: "WAIT_SIM", minutes: randInt(20, 50) });
    plan.push({ type: "PICK_NEXT_ACTIVITY" });
    return plan;
}

function planVisitLounge(agent) {
    const plan = [];
    const spots = ["lounge_spot0", "lounge_spot1", "lounge_spot2", "water_cooler"];
    const spot = pickRandom(spots);

    plan.push({ type: "STAND" });
    plan.push({ type: "ENTER_STATE", state: "ON_FLOOR" });
    plan.push({ type: "WALK_TO_WP", floor: agent.homeFloor, wpName: agent.deskDoorWpName });
    plan.push({ type: "WALK_TO_WP", floor: agent.homeFloor, wpName: spot });
    plan.push({ type: "SIT", floor: agent.homeFloor, wpName: spot });
    plan.push({ type: "ENTER_STATE", state: "AT_BREAK" });
    plan.push({ type: "WAIT_SIM", minutes: randInt(5, 12) });
    plan.push({ type: "STAND" });
    plan.push({ type: "ENTER_STATE", state: "ON_FLOOR" });
    plan.push({ type: "WALK_TO_WP", floor: agent.homeFloor, wpName: agent.deskDoorWpName });
    plan.push({ type: "WALK_TO_WP", floor: agent.homeFloor, wpName: agent.deskWpName });
    plan.push({ type: "SIT", floor: agent.homeFloor, wpName: agent.deskWpName });
    plan.push({ type: "ENTER_STATE", state: "AT_DESK" });
    plan.push({ type: "WAIT_SIM", minutes: randInt(18, 50) });
    plan.push({ type: "PICK_NEXT_ACTIVITY" });
    return plan;
}

function planAttendMeeting(agent) {
    const meetFloor = Math.random() < 0.65 ? agent.homeFloor : randInt(1, WORLD.FLOOR_COUNT - 1);
    const seat = reserveConfSeat(meetFloor);
    if (!seat) {
        return planVisitLounge(agent);
    }
    agent.reservedSeatKey = seat.key;

    const plan = [];
    plan.push({ type: "STAND" });
    plan.push({ type: "ENTER_STATE", state: "ON_FLOOR" });
    plan.push({ type: "WALK_TO_WP", floor: agent.homeFloor, wpName: agent.deskDoorWpName });
    addElevatorTrip(plan, agent.homeFloor, meetFloor);
    plan.push({ type: "WALK_TO_WP", floor: meetFloor, wpName: seat.wpName });
    plan.push({ type: "SIT", floor: meetFloor, wpName: seat.wpName });
    plan.push({ type: "ENTER_STATE", state: "IN_MEETING" });
    plan.push({ type: "WAIT_SIM", minutes: randInt(22, 45) });
    plan.push({ type: "STAND" });
    plan.push({ type: "RELEASE_SEAT" });
    plan.push({ type: "ENTER_STATE", state: "ON_FLOOR" });
    addElevatorTrip(plan, meetFloor, agent.homeFloor);
    plan.push({ type: "WALK_TO_WP", floor: agent.homeFloor, wpName: agent.deskDoorWpName });
    plan.push({ type: "WALK_TO_WP", floor: agent.homeFloor, wpName: agent.deskWpName });
    plan.push({ type: "SIT", floor: agent.homeFloor, wpName: agent.deskWpName });
    plan.push({ type: "ENTER_STATE", state: "AT_DESK" });
    plan.push({ type: "WAIT_SIM", minutes: randInt(18, 50) });
    plan.push({ type: "PICK_NEXT_ACTIVITY" });
    return plan;
}

function planVisitCoworker(agent) {
    const candidates = [];
    for (let i = 0; i < agents.length; i++) {
        const other = agents[i];
        if (other !== agent && other.role === "WORKER" && other.state === "AT_DESK") {
            candidates.push(other);
        }
    }
    if (candidates.length === 0) {
        return planVisitLounge(agent);
    }
    const target = pickRandom(candidates);
    const plan = [];
    plan.push({ type: "STAND" });
    plan.push({ type: "ENTER_STATE", state: "ON_FLOOR" });
    plan.push({ type: "WALK_TO_WP", floor: agent.homeFloor, wpName: agent.deskDoorWpName });
    addElevatorTrip(plan, agent.homeFloor, target.homeFloor);
    plan.push({ type: "WALK_TO_WP", floor: target.homeFloor, wpName: target.deskDoorWpName });
    plan.push({ type: "ENTER_STATE", state: "VISITING" });
    plan.push({ type: "WAIT_SIM", minutes: randInt(6, 18) });
    plan.push({ type: "ENTER_STATE", state: "ON_FLOOR" });
    addElevatorTrip(plan, target.homeFloor, agent.homeFloor);
    plan.push({ type: "WALK_TO_WP", floor: agent.homeFloor, wpName: agent.deskDoorWpName });
    plan.push({ type: "WALK_TO_WP", floor: agent.homeFloor, wpName: agent.deskWpName });
    plan.push({ type: "SIT", floor: agent.homeFloor, wpName: agent.deskWpName });
    plan.push({ type: "ENTER_STATE", state: "AT_DESK" });
    plan.push({ type: "WAIT_SIM", minutes: randInt(18, 50) });
    plan.push({ type: "PICK_NEXT_ACTIVITY" });
    return plan;
}

function planLeaveBuilding(agent) {
    const plan = [];
    plan.push({ type: "STAND" });
    plan.push({ type: "RELEASE_SEAT" });
    plan.push({ type: "ENTER_STATE", state: "LEAVING" });
    if (agent.currentFloor > 0) {
        addElevatorTrip(plan, agent.currentFloor, 0);
    }
    plan.push({ type: "WALK_TO_WP", floor: 0, wpName: "lobby_center" });
    plan.push({ type: "WALK_TO_WP", floor: 0, wpName: "entrance" });
    plan.push({ type: "WALK_TO_WP", floor: 0, wpName: "front_door_threshold" });
    plan.push({ type: "WALK_TO_WP", floor: 0, wpName: "outside" });
    plan.push({ type: "EXIT_BUILDING" });
    return plan;
}

function planVisitorVisit(agent) {
    const plan = [];
    plan.push({ type: "ENTER_STATE", state: "ARRIVING" });
    plan.push({ type: "WALK_TO_WP", floor: 0, wpName: "front_door_threshold" });
    plan.push({ type: "WALK_TO_WP", floor: 0, wpName: "entrance" });
    plan.push({ type: "WALK_TO_WP", floor: 0, wpName: "lobby_center" });

    const r = Math.random();
    const dur = agent.visitDuration || randInt(8, 25);

    if (r < 0.10) {
        // Bistro table
        const wp = pickRandom(world.floors[0].cafeSpots);
        plan.push({ type: "WALK_TO_WP", floor: 0, wpName: wp });
        plan.push({ type: "SIT", floor: 0, wpName: wp });
        plan.push({ type: "ENTER_STATE", state: "VISITING" });
        plan.push({ type: "WAIT_SIM", minutes: dur });
        plan.push({ type: "STAND" });
    } else if (r < 0.16) {
        // Cafe counter
        plan.push({ type: "WALK_TO_WP", floor: 0, wpName: "cafe_order" });
        plan.push({ type: "SIT", floor: 0, wpName: "cafe_order" });
        plan.push({ type: "ENTER_STATE", state: "VISITING" });
        plan.push({ type: "WAIT_SIM", minutes: randInt(4, 10) });
        plan.push({ type: "STAND" });
    } else if (r < 0.30) {
        // Front lounge
        const wp = pickRandom(["front_lounge_0", "front_lounge_1", "front_lounge_2"]);
        plan.push({ type: "WALK_TO_WP", floor: 0, wpName: wp });
        plan.push({ type: "SIT", floor: 0, wpName: wp });
        plan.push({ type: "ENTER_STATE", state: "VISITING" });
        plan.push({ type: "WAIT_SIM", minutes: dur });
        plan.push({ type: "STAND" });
    } else if (r < 0.42) {
        // Back lounge / conversation pit
        const wp = pickRandom(["back_lounge_N", "back_lounge_S", "pit_N", "pit_S", "pit_E", "pit_W"]);
        plan.push({ type: "WALK_TO_WP", floor: 0, wpName: wp });
        plan.push({ type: "SIT", floor: 0, wpName: wp });
        plan.push({ type: "ENTER_STATE", state: "VISITING" });
        plan.push({ type: "WAIT_SIM", minutes: dur });
        plan.push({ type: "STAND" });
    } else if (r < 0.52) {
        // Reception / kiosk / water cooler
        const wp = pickRandom(["reception", "kiosk", "lobby_wc_front", "lobby_wc_back"]);
        plan.push({ type: "WALK_TO_WP", floor: 0, wpName: wp });
        plan.push({ type: "SIT", floor: 0, wpName: wp });
        plan.push({ type: "ENTER_STATE", state: "VISITING" });
        plan.push({ type: "WAIT_SIM", minutes: randInt(4, 12) });
        plan.push({ type: "STAND" });
    } else if (r < 0.62) {
        // Lobby loiter
        const wp = pickRandom(["lobby_stand_center", "lobby_stand_NE", "lobby_stand_NW", "lobby_stand_midE", "lobby_stand_midW", "lobby_stand_entry"]);
        plan.push({ type: "WALK_TO_WP", floor: 0, wpName: wp });
        plan.push({ type: "SIT", floor: 0, wpName: wp });
        plan.push({ type: "ENTER_STATE", state: "VISITING" });
        plan.push({ type: "WAIT_SIM", minutes: randInt(5, 15) });
        plan.push({ type: "STAND" });
    } else if (r < 0.77) {
        // Ride up to an office-floor lounge
        const upFloor = randInt(1, WORLD.FLOOR_COUNT - 1);
        const wp = pickRandom(["lounge_spot0", "lounge_spot1", "lounge_spot2", "water_cooler", "hall_stand_N", "hall_stand_S"]);
        addElevatorTrip(plan, 0, upFloor);
        plan.push({ type: "WALK_TO_WP", floor: upFloor, wpName: wp });
        plan.push({ type: "SIT", floor: upFloor, wpName: wp });
        plan.push({ type: "ENTER_STATE", state: "VISITING" });
        plan.push({ type: "WAIT_SIM", minutes: randInt(6, 16) });
        plan.push({ type: "STAND" });
        plan.push({ type: "ENTER_STATE", state: "ON_FLOOR" });
        addElevatorTrip(plan, upFloor, 0);
    } else {
        // Sit in on a meeting (23%)
        const meetFloor = randInt(1, WORLD.FLOOR_COUNT - 1);
        const seat = reserveConfSeat(meetFloor);
        if (seat) {
            agent.reservedSeatKey = seat.key;
            addElevatorTrip(plan, 0, meetFloor);
            plan.push({ type: "WALK_TO_WP", floor: meetFloor, wpName: seat.wpName });
            plan.push({ type: "SIT", floor: meetFloor, wpName: seat.wpName });
            plan.push({ type: "ENTER_STATE", state: "IN_MEETING" });
            plan.push({ type: "WAIT_SIM", minutes: randInt(15, 32) });
            plan.push({ type: "STAND" });
            plan.push({ type: "RELEASE_SEAT" });
            plan.push({ type: "ENTER_STATE", state: "ON_FLOOR" });
            addElevatorTrip(plan, meetFloor, 0);
        } else {
            const wp = pickRandom(["lobby_stand_center", "lobby_stand_NE", "lobby_stand_NW"]);
            plan.push({ type: "WALK_TO_WP", floor: 0, wpName: wp });
            plan.push({ type: "SIT", floor: 0, wpName: wp });
            plan.push({ type: "ENTER_STATE", state: "VISITING" });
            plan.push({ type: "WAIT_SIM", minutes: randInt(6, 14) });
            plan.push({ type: "STAND" });
        }
    }

    plan.push({ type: "ENTER_STATE", state: "LEAVING" });
    plan.push({ type: "WALK_TO_WP", floor: 0, wpName: "lobby_center" });
    plan.push({ type: "WALK_TO_WP", floor: 0, wpName: "entrance" });
    plan.push({ type: "WALK_TO_WP", floor: 0, wpName: "front_door_threshold" });
    plan.push({ type: "WALK_TO_WP", floor: 0, wpName: "outside" });
    plan.push({ type: "EXIT_BUILDING" });
    return plan;
}

function chooseNextActivity(agent) {
    if (simClock.simMinute >= agent.departureTime) {
        return planLeaveBuilding(agent);
    }

    if (agent.plannedMeetingTimes && agent.plannedMeetingTimes.length > 0) {
        for (let i = 0; i < agent.plannedMeetingTimes.length; i++) {
            if (simClock.simMinute >= agent.plannedMeetingTimes[i]) {
                agent.plannedMeetingTimes.splice(i, 1);
                return planAttendMeeting(agent);
            }
        }
    }

    if (!agent.hasLunched && simClock.simMinute >= agent.lunchTime) {
        return planGoToLunch(agent);
    }

    const r = Math.random();
    if (r < 0.14) {
        return planAttendMeeting(agent);
    } else if (r < 0.26) {
        return planVisitLounge(agent);
    } else if (r < 0.41) {
        return planVisitCoworker(agent);
    } else {
        return [
            { type: "WAIT_SIM", minutes: randInt(18, 65) },
            { type: "PICK_NEXT_ACTIVITY" }
        ];
    }
}

// --- Action Execution ---

function nearestNodeName(nodes, pos) {
    let bestName = null;
    let bestDistSq = Infinity;
    const keys = Object.keys(nodes);
    for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        const np = nodes[k].pos;
        const dx = np.x - pos.x;
        const dz = np.z - pos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < bestDistSq) {
            bestDistSq = d2;
            bestName = k;
        }
    }
    return bestName;
}

function startAction(agent, action) {
    agent.currentAction = action;
    if (action.type === "WALK_TO_WP") {
        const nodes = world.floors[action.floor].nodes;
        const fromName = nearestNodeName(nodes, agent.group.position);
        action.waypoints = bfsPath(nodes, fromName, action.wpName);
        action.wpIdx = 0;
        action._prevPos = agent.group.position.clone();
        action._stallT = 0;
        agent.group.userData.isWalking = true;
        agent.group.userData.isSitting = false;
    } else if (action.type === "WAIT_AT_PANEL") {
        agent.group.userData.isWalking = false;
    } else if (action.type === "ENTER_ELEVATOR") {
        action.phase = "reserve";
        action.spot = null;
        action._prevPos = agent.group.position.clone();
        action._stallT = 0;
    } else if (action.type === "EXIT_ELEVATOR") {
        // Reparent from carGroup to scene preserving world position
        const worldPos = new THREE.Vector3();
        agent.group.getWorldPosition(worldPos);
        scene.add(agent.group);
        agent.group.position.copy(worldPos);
        agent.currentFloor = action.toFloor;
        elevator.registerDisembark(agent);
        const elevWaitPos = world.floors[action.toFloor].nodes.elevWait.pos.clone();
        action.targetPos = elevWaitPos;
        action._prevPos = agent.group.position.clone();
        action._stallT = 0;
        agent.group.userData.isWalking = true;
    } else if (action.type === "WAIT_SIM") {
        action.untilMin = simClock.simMinute + action.minutes;
        agent.group.userData.isWalking = false;
    }
}

function moveToward(pos, target, speed, dt) {
    const dx = target.x - pos.x;
    const dz = target.z - pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist <= speed * dt + 0.05) {
        pos.x = target.x;
        pos.z = target.z;
        return { arrived: true, dx: dx, dz: dz };
    }
    const step = (speed * dt) / dist;
    pos.x += dx * step;
    pos.z += dz * step;
    return { arrived: false, dx: dx, dz: dz };
}

function stepAction(agent, dt) {
    const action = agent.currentAction;
    if (!action) return true;

    if (action.type === "ENTER_STATE") {
        agent.state = action.state;
        return true;
    }

    if (action.type === "MARK_LUNCHED") {
        agent.hasLunched = true;
        return true;
    }

    if (action.type === "RELEASE_SEAT") {
        releaseSeat(agent);
        return true;
    }

    if (action.type === "PICK_NEXT_ACTIVITY") {
        agent.plan = chooseNextActivity(agent);
        return true;
    }

    if (action.type === "EXIT_BUILDING") {
        if (agent.group.parent) agent.group.parent.remove(agent.group);
        agent.group.userData.isWalking = false;
        agent.group.userData.isSitting = false;
        agent.state = "GONE";
        agent.plan = [];
        return true;
    }

    if (action.type === "PRESS_FLOOR") {
        elevator.pressDestination(action.floor);
        return true;
    }

    if (action.type === "WAIT_FOR_FLOOR") {
        agent.group.userData.isWalking = false;
        return elevator.state === "DOOR_OPEN" && elevator.currentFloor === action.floor;
    }

    if (action.type === "SIT") {
        const fl = world.floors[action.floor];
        const node = fl.nodes[action.wpName];
        const st = fl.sitTargets[action.wpName];
        agent.group.userData.isWalking = false;
        if (node) {
            agent.group.position.x = node.pos.x;
            agent.group.position.z = node.pos.z;
        }
        if (st && st.sit) {
            agent.group.position.y = action.floor * WORLD.FLOOR_HEIGHT - 0.35;
            agent.group.rotation.y = st.facing;
            agent.group.userData.isSitting = true;
        } else {
            // Standing waypoint: jitter in small ring so visitors don't stack identically
            const angle = Math.random() * Math.PI * 2;
            const radius = randFloat(0.35, 0.75);
            agent.group.position.x += Math.cos(angle) * radius;
            agent.group.position.z += Math.sin(angle) * radius;
            agent.group.position.y = action.floor * WORLD.FLOOR_HEIGHT;
            if (st) agent.group.rotation.y = st.facing;
            agent.group.userData.isSitting = false;
        }
        return true;
    }

    if (action.type === "STAND") {
        agent.group.userData.isSitting = false;
        if (agent.group.parent === elevator.carGroup) {
            agent.group.position.y = 0;
        } else {
            agent.group.position.y = agent.currentFloor * WORLD.FLOOR_HEIGHT;
        }
        return true;
    }

    if (action.type === "WAIT_SIM") {
        return simClock.simMinute >= action.untilMin;
    }

    if (action.type === "WALK_TO_WP") {
        if (!action.waypoints || action.wpIdx >= action.waypoints.length) {
            agent.group.userData.isWalking = false;
            return true;
        }
        const target = action.waypoints[action.wpIdx];
        const res = moveToward(agent.group.position, target, WALK_SPEED, dt);
        agent.group.position.y = action.floor * WORLD.FLOOR_HEIGHT;
        if (Math.hypot(res.dx, res.dz) > 0.001) {
            agent.group.rotation.y = Math.atan2(res.dx, res.dz);
        }

        const moved = Math.hypot(
            agent.group.position.x - action._prevPos.x,
            agent.group.position.z - action._prevPos.z
        );
        action._prevPos.copy(agent.group.position);
        if (moved < 0.005) {
            action._stallT += dt;
            const stallLimit = action.wpName === "front_door_threshold" ? 1.5 : 1.2;
            if (action._stallT > stallLimit) {
                action._stallT = 0;
                action.wpIdx++;
                if (action.wpIdx >= action.waypoints.length) {
                    agent.group.position.x = target.x;
                    agent.group.position.z = target.z;
                    agent.group.userData.isWalking = false;
                    return true;
                }
                return false;
            }
        } else {
            action._stallT = 0;
        }

        if (res.arrived) {
            action.wpIdx++;
            action._stallT = 0;
            if (action.wpIdx >= action.waypoints.length) {
                agent.group.userData.isWalking = false;
                return true;
            }
        }
        return false;
    }

    if (action.type === "WAIT_AT_PANEL") {
        agent.state = "WAITING_ELEVATOR";
        if (action.dir > 0) elevator.callUp(action.floor);
        else elevator.callDown(action.floor);

        if (elevator.isAcceptingAt(action.floor, action.dir) && elevator.currentCapacityFree() > 0) {
            return true;
        }
        return false;
    }

    if (action.type === "ENTER_ELEVATOR") {
        if (action.phase === "reserve") {
            const dir = action.toFloor > agent.currentFloor ? 1 : -1;
            if (!elevator.isAcceptingAt(agent.currentFloor, dir)) {
                if (dir > 0) elevator.callUp(agent.currentFloor);
                else elevator.callDown(agent.currentFloor);
                return false;
            }
            const spot = elevator.reserveBoardingSpot(agent);
            if (!spot) {
                if (dir > 0) elevator.callUp(agent.currentFloor);
                else elevator.callDown(agent.currentFloor);
                return false;
            }
            action.spot = spot;
            action.phase = "toDoor";
            action._prevPos.copy(agent.group.position);
            action._stallT = 0;
            agent.group.userData.isWalking = true;
            return false;
        }

        if (action.phase === "toDoor") {
            const doorTarget = new THREE.Vector3(
                action.spot.x,
                agent.currentFloor * WORLD.FLOOR_HEIGHT,
                1.55
            );
            const res = moveToward(agent.group.position, doorTarget, WALK_SPEED * 1.15, dt);
            if (Math.hypot(res.dx, res.dz) > 0.001) {
                agent.group.rotation.y = Math.atan2(res.dx, res.dz);
            }
            const moved = Math.hypot(
                agent.group.position.x - action._prevPos.x,
                agent.group.position.z - action._prevPos.z
            );
            action._prevPos.copy(agent.group.position);
            if (moved < 0.005) {
                action._stallT += dt;
                if (action._stallT > 1.5) {
                    agent.group.position.x = doorTarget.x;
                    agent.group.position.z = doorTarget.z;
                    res.arrived = true;
                }
            } else {
                action._stallT = 0;
            }

            if (res.arrived) {
                const worldPos = agent.group.position.clone();
                elevator.carGroup.add(agent.group);
                agent.group.position.set(
                    worldPos.x - elevator.carGroup.position.x,
                    0,
                    worldPos.z - elevator.carGroup.position.z
                );
                action.phase = "toSpot";
                action._prevPos.copy(agent.group.position);
                action._stallT = 0;
            }
            return false;
        }

        if (action.phase === "toSpot") {
            const spotTarget = new THREE.Vector3(action.spot.x, 0, action.spot.z);
            const res = moveToward(agent.group.position, spotTarget, WALK_SPEED * 1.15, dt);
            if (Math.hypot(res.dx, res.dz) > 0.001) {
                agent.group.rotation.y = Math.atan2(res.dx, res.dz);
            }
            const moved = Math.hypot(
                agent.group.position.x - action._prevPos.x,
                agent.group.position.z - action._prevPos.z
            );
            action._prevPos.copy(agent.group.position);
            if (moved < 0.005) {
                action._stallT += dt;
                if (action._stallT > 1.5) {
                    agent.group.position.x = spotTarget.x;
                    agent.group.position.z = spotTarget.z;
                    res.arrived = true;
                }
            } else {
                action._stallT = 0;
            }

            if (res.arrived) {
                agent.group.position.set(action.spot.x, 0, action.spot.z);
                agent.group.rotation.y = 0;
                agent.group.userData.isWalking = false;
                agent.state = "IN_CAR";
                elevator.completeBoard(agent);
                return true;
            }
            return false;
        }
    }

    if (action.type === "EXIT_ELEVATOR") {
        const res = moveToward(agent.group.position, action.targetPos, WALK_SPEED * 1.15, dt);
        if (Math.hypot(res.dx, res.dz) > 0.001) {
            agent.group.rotation.y = Math.atan2(res.dx, res.dz);
        }
        const moved = Math.hypot(
            agent.group.position.x - action._prevPos.x,
            agent.group.position.z - action._prevPos.z
        );
        action._prevPos.copy(agent.group.position);
        if (moved < 0.005) {
            action._stallT += dt;
            if (action._stallT > 1.5) {
                agent.group.position.x = action.targetPos.x;
                agent.group.position.z = action.targetPos.z;
                res.arrived = true;
            }
        } else {
            action._stallT = 0;
        }

        if (res.arrived) {
            elevator.completeDisembark(agent);
            agent.group.userData.isWalking = false;
            return true;
        }
        return false;
    }

    return true;
}

function updateAgent(agent, dt) {
    if (agent.state === "DISABLED" || agent.state === "GONE") return;

    if (agent.state === "AWAY") {
        if (simClock.simMinute >= agent.arrivalTime) {
            const outsidePos = world.floors[0].nodes.outside.pos;
            agent.group.position.set(
                outsidePos.x + randFloat(-1.1, 1.1),
                0,
                outsidePos.z + randFloat(-0.75, 0.75)
            );
            agent.group.rotation.y = Math.PI;
            agent.currentFloor = 0;
            scene.add(agent.group);
            if (agent.role === "WORKER") {
                agent.plan = planArriveToDesk(agent);
            } else {
                agent.plan = planVisitorVisit(agent);
            }
            agent.currentAction = null;
        } else {
            return;
        }
    }

    // Worker end-of-day check while idle at desk
    if (
        agent.role === "WORKER" &&
        agent.state === "AT_DESK" &&
        simClock.simMinute >= agent.departureTime &&
        agent.currentAction &&
        agent.currentAction.type === "WAIT_SIM"
    ) {
        agent.plan = planLeaveBuilding(agent);
        agent.currentAction = null;
    }

    // Action dispatch loop (up to 16 transitions per frame)
    for (let iter = 0; iter < 16; iter++) {
        if (!agent.currentAction) {
            if (agent.plan.length === 0) break;
            const next = agent.plan.shift();
            startAction(agent, next);
        }
        const done = stepAction(agent, dt);
        if (done) {
            agent.currentAction = null;
            if (agent.state === "GONE" || agent.state === "DISABLED") break;
        } else {
            break;
        }
    }
}

const ENTRANCE_WPS = {
    outside: true,
    front_door_threshold: true,
    entrance: true,
    lobby_center: true
};

function isCollisionExempt(agent) {
    if (agent.state === "DISABLED" || agent.state === "AWAY" || agent.state === "GONE") return true;
    if (agent.group.userData.isSitting) return true;
    if (agent.group.parent === elevator.carGroup) return true;
    if (!agent.group.parent) return true;
    if (agent.currentAction) {
        if (agent.currentAction.type === "ENTER_ELEVATOR") return true;
        if (
            agent.currentAction.type === "WALK_TO_WP" &&
            agent.currentAction.floor === 0 &&
            ENTRANCE_WPS[agent.currentAction.wpName]
        ) {
            return true;
        }
    }
    return false;
}

function applyCollisions() {
    const minSep = WORLD.PERSON_R * 1.75; // ~0.7
    const pushScalar = 0.18;

    for (let i = 0; i < agents.length; i++) {
        const a = agents[i];
        if (isCollisionExempt(a)) continue;

        for (let j = i + 1; j < agents.length; j++) {
            const b = agents[j];
            if (isCollisionExempt(b)) continue;
            if (a.group.parent !== b.group.parent) continue;
            if (Math.abs(a.group.position.y - b.group.position.y) > 1.0) continue;

            let dx = a.group.position.x - b.group.position.x;
            let dz = a.group.position.z - b.group.position.z;
            let d = Math.hypot(dx, dz);

            if (d < minSep) {
                if (d < 1e-3) {
                    const ang = Math.random() * Math.PI * 2;
                    dx = Math.cos(ang);
                    dz = Math.sin(ang);
                    d = 1;
                } else {
                    dx /= d;
                    dz /= d;
                }
                const overlap = (minSep - d) * pushScalar;
                a.group.position.x += dx * overlap;
                a.group.position.z += dz * overlap;
                b.group.position.x -= dx * overlap;
                b.group.position.z -= dz * overlap;
            }
        }
    }
}

// --- HUD ---

function createHUD() {
    const panel = document.createElement("div");
    panel.style.position = "fixed";
    panel.style.top = "12px";
    panel.style.left = "12px";
    panel.style.padding = "12px 14px";
    panel.style.background = "rgba(18, 22, 30, 0.82)";
    panel.style.color = "#e8edf5";
    panel.style.fontFamily = "monospace";
    panel.style.fontSize = "12px";
    panel.style.borderRadius = "8px";
    panel.style.border = "1px solid rgba(255,255,255,0.14)";
    panel.style.minWidth = "235px";
    panel.style.zIndex = "100";

    const timeEl = document.createElement("div");
    timeEl.style.fontSize = "22px";
    timeEl.style.fontWeight = "bold";
    timeEl.style.color = "#ffbb22";
    timeEl.style.marginBottom = "8px";
    panel.appendChild(timeEl);

    // Speed slider (log-spaced 1..600)
    const speedLabel = document.createElement("div");
    speedLabel.textContent = "Speed: 120x";
    panel.appendChild(speedLabel);

    const speedSlider = document.createElement("input");
    speedSlider.type = "range";
    speedSlider.min = "0";
    speedSlider.max = "100";
    speedSlider.value = String(Math.round((Math.log(120) / Math.log(600)) * 100));
    speedSlider.style.width = "100%";
    speedSlider.style.marginBottom = "6px";
    speedSlider.addEventListener("input", (event) => {
        const frac = Number(event.target.value) / 100;
        const val = Math.round(Math.pow(600, frac));
        simClock.timeScale = Math.max(1, Math.min(600, val));
        speedLabel.textContent = "Speed: " + simClock.timeScale + "x";
    });
    panel.appendChild(speedSlider);

    // Occupancy slider (1..100)
    const occLabel = document.createElement("div");
    occLabel.textContent = "Occupancy: " + targetOccupancy + " / " + MAX_OCCUPANCY + " people";
    panel.appendChild(occLabel);

    const occSlider = document.createElement("input");
    occSlider.type = "range";
    occSlider.min = "1";
    occSlider.max = String(MAX_OCCUPANCY);
    occSlider.value = String(targetOccupancy);
    occSlider.style.width = "100%";
    occSlider.style.marginBottom = "8px";
    occSlider.addEventListener("input", (event) => {
        targetOccupancy = Number(event.target.value);
        occLabel.textContent = "Occupancy: " + targetOccupancy + " / " + MAX_OCCUPANCY + " people";
        applyOccupancy();
    });
    panel.appendChild(occSlider);

    const statsEl = document.createElement("div");
    statsEl.style.lineHeight = "1.45";
    statsEl.style.whiteSpace = "pre";
    panel.appendChild(statsEl);

    document.body.appendChild(panel);
    hudEls.timeEl = timeEl;
    hudEls.statsEl = statsEl;
}

function updateHUD() {
    if (!hudEls.timeEl) return;
    hudEls.timeEl.textContent = simClock.format();

    const counts = {};
    for (let i = 0; i < agents.length; i++) {
        const s = agents[i].state;
        counts[s] = (counts[s] || 0) + 1;
    }

    const dirChar = elevator.direction > 0 ? "^" : (elevator.direction < 0 ? "v" : "-");
    const dests = Array.from(elevator.destinations).sort().join(",") || "-";
    const ups = Array.from(elevator.upCalls).sort().join(",") || "-";
    const dns = Array.from(elevator.downCalls).sort().join(",") || "-";

    const lines = [
        "Present: " + countPresent() + " / " + targetOccupancy,
        "Elevator: F" + elevator.currentFloor + " " + dirChar + " (" + elevator.state + ")",
        "Car: " + elevator.passengers.size + "/4  Dests:[" + dests + "]",
        "Calls: U[" + ups + "] D[" + dns + "]",
        "AT_DESK:" + (counts.AT_DESK || 0) + " MEET:" + (counts.IN_MEETING || 0),
        "WAIT:" + (counts.WAITING_ELEVATOR || 0) + " VISIT:" + (counts.VISITING || 0),
        "LUNCH:" + (counts.AT_LUNCH || 0) + " BREAK:" + (counts.AT_BREAK || 0)
    ];
    hudEls.statsEl.textContent = lines.join("\n");
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
    controls.update();

    ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
    scene.add(ambientLight);

    hemiLight = new THREE.HemisphereLight(0xbfd7ff, 0x303020, 0.45);
    scene.add(hemiLight);

    sunLight = new THREE.DirectionalLight(0xffffff, 0.9);
    sunLight.position.set(20, 35, 18);
    scene.add(sunLight);

    world = createWorld(scene);
    elevator = new Elevator(scene, world);
    createAgents();
    createHUD();

    window.addEventListener("resize", () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    const frameClock = new THREE.Clock();

    function animate() {
        requestAnimationFrame(animate);
        const realDt = Math.min(0.05, frameClock.getDelta());
        simClock.tick(realDt);
        updateLighting(simClock.simMinute);

        const motionDt = realDt * simClock.timeScale;
        elevator.tick(motionDt);

        topUpVisitors();
        for (let i = 0; i < agents.length; i++) {
            updateAgent(agents[i], motionDt);
        }

        applyCollisions();

        for (let i = 0; i < agents.length; i++) {
            const a = agents[i];
            if (a.group.parent) {
                animatePersonWalking(a.group, motionDt);
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
