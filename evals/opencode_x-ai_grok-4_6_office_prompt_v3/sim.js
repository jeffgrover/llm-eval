let scene;
let camera;
let renderer;
let controls;
let world;
let elevator;
let simSun;
let simAmbient;
let simHemi;
let hudRoot;
let occupancyInput;
let speedInput;

const MAX_WORKERS = 20;
const MAX_VISITORS = 80;
const MAX_OCCUPANCY = 100;
const DEFAULT_OCCUPANCY = 45;
const WALK_SPEED = 1.3;
const SIT_DROP = 0.35;
const MEETING_PROB = 0.36;

const FIRST_NAMES = [
    "Ada", "Ben", "Cara", "Drew", "Eve", "Finn", "Gia", "Hank", "Ivy", "Jake",
    "Kara", "Leo", "Mia", "Nate", "Oli", "Pia", "Quinn", "Remy", "Sage", "Tess",
    "Uma", "Val", "Wes", "Xan", "Yara", "Zoe", "Art", "Bea", "Cal", "Dee"
];

const Clock = {
    simMinute: 7 * 60 + 30,
    timeScale: 120,
    tick: function (realDt) {
        this.simMinute += realDt * this.timeScale / 60;
        if (this.simMinute >= 24 * 60) {
            this.simMinute -= 24 * 60;
            resetSimDay();
        }
    },
    format: function () {
        let total = Math.floor(this.simMinute);
        if (total < 0) total += 24 * 60;
        total = total % (24 * 60);
        let hour = Math.floor(total / 60);
        const minute = total % 60;
        const ap = hour >= 12 ? "PM" : "AM";
        hour = hour % 12;
        if (hour === 0) hour = 12;
        const hs = hour < 10 ? " " + hour : String(hour);
        const ms = minute < 10 ? "0" + minute : String(minute);
        return hs + ":" + ms + " " + ap;
    }
};

const renderClock = new THREE.Clock();
const agents = [];
const seatReservations = new Set();
let targetOccupancy = DEFAULT_OCCUPANCY;
let hudStateEl;
let hudTimeEl;
let hudElevEl;

const LIGHT_KEYS = [
    { h: 0, bg: 0x12151c, sun: 0x8899bb, si: 0.12, ai: 0.45, hi: 0.32 },
    { h: 5.8, bg: 0x141820, sun: 0x8899bb, si: 0.14, ai: 0.45, hi: 0.32 },
    { h: 6.15, bg: 0xc47a4a, sun: 0xff9966, si: 0.55, ai: 0.5, hi: 0.4 },
    { h: 6.5, bg: 0x87b4e0, sun: 0xfff2d0, si: 0.95, ai: 0.55, hi: 0.5 },
    { h: 12, bg: 0x8ec4f0, sun: 0xffffff, si: 1.05, ai: 0.58, hi: 0.52 },
    { h: 17.4, bg: 0x8ec4f0, sun: 0xfff2d0, si: 0.95, ai: 0.55, hi: 0.5 },
    { h: 17.85, bg: 0xd4783c, sun: 0xff8844, si: 0.5, ai: 0.5, hi: 0.38 },
    { h: 18.5, bg: 0x1a2230, sun: 0x8899bb, si: 0.18, ai: 0.45, hi: 0.32 },
    { h: 24, bg: 0x12151c, sun: 0x8899bb, si: 0.12, ai: 0.45, hi: 0.32 }
];

function randInt(a, b) {
    return a + Math.floor(Math.random() * (b - a + 1));
}

function randChoice(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function lerpHex(a, b, t) {
    const ar = (a >> 16) & 255;
    const ag = (a >> 8) & 255;
    const ab = a & 255;
    const br = (b >> 16) & 255;
    const bg = (b >> 8) & 255;
    const bb = b & 255;
    const r = Math.round(ar + (br - ar) * t);
    const g = Math.round(ag + (bg - ag) * t);
    const bl = Math.round(ab + (bb - ab) * t);
    return (r << 16) | (g << 8) | bl;
}

function applyDayNight() {
    const hour = (Clock.simMinute / 60) % 24;
    let i = 0;
    while (i < LIGHT_KEYS.length - 1 && LIGHT_KEYS[i + 1].h < hour) i++;
    const a = LIGHT_KEYS[i];
    const b = LIGHT_KEYS[Math.min(i + 1, LIGHT_KEYS.length - 1)];
    const span = b.h - a.h;
    const t = span <= 0 ? 0 : (hour - a.h) / span;
    scene.background.setHex(lerpHex(a.bg, b.bg, t));
    simSun.color.setHex(lerpHex(a.sun, b.sun, t));
    simSun.intensity = a.si + (b.si - a.si) * t;
    simAmbient.intensity = a.ai + (b.ai - a.ai) * t;
    simHemi.intensity = a.hi + (b.hi - a.hi) * t;
}

function nearestNodeName(nodes, pos) {
    let best = null;
        let bestD = 1000000000;
    const names = Object.keys(nodes);
    for (let ni = 0; ni < names.length; ni++) {
        const node = nodes[names[ni]];
        const dx = node.pos.x - pos.x;
        const dz = node.pos.z - pos.z;
        const d = dx * dx + dz * dz;
        if (d < bestD) {
            bestD = d;
            best = names[ni];
        }
    }
    return best;
}

function seatKey(floor, wpName) {
    return floor + ":" + wpName;
}

function reserveNamedSeat(floor, wpName) {
    const key = seatKey(floor, wpName);
    if (seatReservations.has(key)) return false;
    seatReservations.add(key);
    return true;
}

function releaseNamedSeat(floor, wpName) {
    seatReservations.delete(seatKey(floor, wpName));
}

function reserveConfSeat(floor) {
    const names = ["conf_seat0", "conf_seat1", "conf_seat2", "conf_seat3"];
    for (let i = 0; i < names.length; i++) {
        if (reserveNamedSeat(floor, names[i])) return names[i];
    }
    return null;
}

function reserveFromList(floor, names) {
    const shuffled = names.slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = shuffled[i];
        shuffled[i] = shuffled[j];
        shuffled[j] = tmp;
    }
    for (let i = 0; i < shuffled.length; i++) {
        if (reserveNamedSeat(floor, shuffled[i])) return shuffled[i];
    }
    return null;
}

function planRide(fromFloor, toFloor) {
    if (fromFloor === toFloor) return [];
    const dir = toFloor > fromFloor ? 1 : -1;
    return [
        { type: "WALK_TO_WP", floor: fromFloor, wpName: "elevWait" },
        { type: "WAIT_AT_PANEL", floor: fromFloor, dir: dir, toFloor: toFloor },
        { type: "ENTER_ELEVATOR", toFloor: toFloor },
        { type: "PRESS_FLOOR", floor: toFloor },
        { type: "WAIT_FOR_FLOOR", floor: toFloor },
        { type: "EXIT_ELEVATOR", toFloor: toFloor }
    ];
}

function planArriveToDesk(agent) {
    const desk = agent.deskWpName;
    const door = agent.deskDoorWpName;
    return [
        { type: "ENTER_STATE", state: "ARRIVING" },
        { type: "WALK_TO_WP", floor: 0, wpName: "front_door_threshold" },
        { type: "WALK_TO_WP", floor: 0, wpName: "entrance" },
        { type: "WALK_TO_WP", floor: 0, wpName: "lobby_center" }
    ].concat(planRide(0, agent.homeFloor)).concat([
        { type: "WALK_TO_WP", floor: agent.homeFloor, wpName: door },
        { type: "WALK_TO_WP", floor: agent.homeFloor, wpName: desk },
        { type: "SIT", floor: agent.homeFloor, wpName: desk },
        { type: "ENTER_STATE", state: "AT_DESK" },
        { type: "WAIT_SIM", minutes: randInt(12, 28) },
        { type: "PICK_NEXT_ACTIVITY" }
    ]);
}

function planGoToLunch(agent) {
    const chair = reserveFromList(0, world.floors[0].cafeSpots || ["bistro0", "bistro1", "bistro2", "bistro3"]);
    const eatWp = chair || "cafe_order";
    if (chair) {
        agent.reservedSeatKey = seatKey(0, chair);
        agent.reservedSeatFloor = 0;
        agent.reservedSeatWp = chair;
    }
    const afterEat = chair
        ? [{ type: "STAND" }, { type: "RELEASE_SEAT" }]
        : [];
    return [
        { type: "STAND" },
        { type: "ENTER_STATE", state: "AT_LUNCH" },
        { type: "WALK_TO_WP", floor: agent.homeFloor, wpName: agent.deskDoorWpName }
    ].concat(planRide(agent.homeFloor, 0)).concat([
        { type: "WALK_TO_WP", floor: 0, wpName: eatWp },
        chair ? { type: "SIT", floor: 0, wpName: eatWp } : { type: "WAIT_SIM", minutes: 1 },
        { type: "WAIT_SIM", minutes: agent.lunchDuration }
    ]).concat(afterEat).concat([
        { type: "MARK_LUNCHED" }
    ]).concat(planRide(0, agent.homeFloor)).concat([
        { type: "WALK_TO_WP", floor: agent.homeFloor, wpName: agent.deskDoorWpName },
        { type: "WALK_TO_WP", floor: agent.homeFloor, wpName: agent.deskWpName },
        { type: "SIT", floor: agent.homeFloor, wpName: agent.deskWpName },
        { type: "ENTER_STATE", state: "AT_DESK" },
        { type: "WAIT_SIM", minutes: randInt(10, 22) },
        { type: "PICK_NEXT_ACTIVITY" }
    ]);
}

function planVisitLounge(agent) {
    const fl = agent.floor != null ? agent.floor : agent.homeFloor;
    const spots = ["lounge_spot0", "lounge_spot1", "lounge_spot2", "water_cooler"];
    const spot = reserveFromList(fl, spots) || "hall_stand_S";
    if (spot.indexOf("lounge") === 0) {
        agent.reservedSeatKey = seatKey(fl, spot);
        agent.reservedSeatFloor = fl;
        agent.reservedSeatWp = spot;
    }
    const sit = spot.indexOf("lounge") === 0;
    return [
        { type: "STAND" },
        { type: "ENTER_STATE", state: "AT_BREAK" },
        { type: "WALK_TO_WP", floor: fl, wpName: "lounge_door" },
        { type: "WALK_TO_WP", floor: fl, wpName: spot },
        sit ? { type: "SIT", floor: fl, wpName: spot } : { type: "WAIT_SIM", minutes: 1 },
        { type: "WAIT_SIM", minutes: randInt(5, 12) },
        { type: "STAND" },
        { type: "RELEASE_SEAT" },
        { type: "WALK_TO_WP", floor: fl, wpName: agent.deskDoorWpName },
        { type: "WALK_TO_WP", floor: fl, wpName: agent.deskWpName },
        { type: "SIT", floor: fl, wpName: agent.deskWpName },
        { type: "ENTER_STATE", state: "AT_DESK" },
        { type: "WAIT_SIM", minutes: randInt(8, 20) },
        { type: "PICK_NEXT_ACTIVITY" }
    ];
}

function planAttendMeeting(agent) {
    let meetFloor = agent.homeFloor;
    if (Math.random() > 0.65) meetFloor = randInt(1, WORLD.FLOOR_COUNT - 1);
    const seat = reserveConfSeat(meetFloor);
    if (!seat) return planVisitLounge(agent);
    agent.reservedSeatKey = seatKey(meetFloor, seat);
    agent.reservedSeatFloor = meetFloor;
    agent.reservedSeatWp = seat;
    return [
        { type: "STAND" },
        { type: "ENTER_STATE", state: "IN_MEETING" },
        { type: "WALK_TO_WP", floor: agent.homeFloor, wpName: agent.deskDoorWpName }
    ].concat(planRide(agent.homeFloor, meetFloor)).concat([
        { type: "WALK_TO_WP", floor: meetFloor, wpName: "conf_door" },
        { type: "WALK_TO_WP", floor: meetFloor, wpName: seat },
        { type: "SIT", floor: meetFloor, wpName: seat },
        { type: "WAIT_SIM", minutes: randInt(22, 45) },
        { type: "STAND" },
        { type: "RELEASE_SEAT" }
    ]).concat(planRide(meetFloor, agent.homeFloor)).concat([
        { type: "WALK_TO_WP", floor: agent.homeFloor, wpName: agent.deskDoorWpName },
        { type: "WALK_TO_WP", floor: agent.homeFloor, wpName: agent.deskWpName },
        { type: "SIT", floor: agent.homeFloor, wpName: agent.deskWpName },
        { type: "ENTER_STATE", state: "AT_DESK" },
        { type: "WAIT_SIM", minutes: randInt(10, 24) },
        { type: "PICK_NEXT_ACTIVITY" }
    ]);
}

function planVisitCoworker(agent) {
    const others = agents.filter(function (other) {
        return other !== agent && other.role === "WORKER" && other.state === "AT_DESK" && other.homeFloor != null;
    });
    if (others.length === 0) {
        return [
            { type: "WAIT_SIM", minutes: randInt(8, 18) },
            { type: "PICK_NEXT_ACTIVITY" }
        ];
    }
    const pal = randChoice(others);
    return [
        { type: "STAND" },
        { type: "ENTER_STATE", state: "ON_FLOOR" },
        { type: "WALK_TO_WP", floor: agent.homeFloor, wpName: agent.deskDoorWpName }
    ].concat(planRide(agent.homeFloor, pal.homeFloor)).concat([
        { type: "WALK_TO_WP", floor: pal.homeFloor, wpName: pal.deskDoorWpName },
        { type: "WAIT_SIM", minutes: randInt(6, 18) }
    ]).concat(planRide(pal.homeFloor, agent.homeFloor)).concat([
        { type: "WALK_TO_WP", floor: agent.homeFloor, wpName: agent.deskDoorWpName },
        { type: "WALK_TO_WP", floor: agent.homeFloor, wpName: agent.deskWpName },
        { type: "SIT", floor: agent.homeFloor, wpName: agent.deskWpName },
        { type: "ENTER_STATE", state: "AT_DESK" },
        { type: "WAIT_SIM", minutes: randInt(8, 20) },
        { type: "PICK_NEXT_ACTIVITY" }
    ]);
}

function planLeaveBuilding(agent) {
    const from = agent.floor != null ? agent.floor : (agent.homeFloor || 0);
    return [
        { type: "STAND" },
        { type: "RELEASE_SEAT" },
        { type: "ENTER_STATE", state: "LEAVING" },
        { type: "WALK_TO_WP", floor: from, wpName: from === 0 ? "lobby_center" : (agent.deskDoorWpName || "elevWait") }
    ].concat(from === 0 ? [] : planRide(from, 0)).concat([
        { type: "WALK_TO_WP", floor: 0, wpName: "lobby_center" },
        { type: "WALK_TO_WP", floor: 0, wpName: "entrance" },
        { type: "WALK_TO_WP", floor: 0, wpName: "front_door_threshold" },
        { type: "WALK_TO_WP", floor: 0, wpName: "outside" },
        { type: "EXIT_BUILDING" }
    ]);
}

function planVisitorVisit(agent) {
    const roll = Math.random();
    let mid = [];
    if (roll < 0.10) {
        const chair = reserveFromList(0, world.floors[0].cafeSpots || ["bistro0"]);
        if (chair) {
            agent.reservedSeatKey = seatKey(0, chair);
            agent.reservedSeatFloor = 0;
            agent.reservedSeatWp = chair;
            mid = [
                { type: "WALK_TO_WP", floor: 0, wpName: chair },
                { type: "SIT", floor: 0, wpName: chair },
                { type: "WAIT_SIM", minutes: randInt(8, 20) },
                { type: "STAND" },
                { type: "RELEASE_SEAT" }
            ];
        }
    } else if (roll < 0.16) {
        mid = [
            { type: "WALK_TO_WP", floor: 0, wpName: "cafe_order" },
            { type: "WAIT_SIM", minutes: randInt(3, 8) }
        ];
    } else if (roll < 0.30) {
        const fls = ["front_lounge0", "front_lounge1", "front_lounge2"];
        const spot = reserveFromList(0, fls) || "lobby_stand_NE";
        if (spot.indexOf("front_") === 0) {
            agent.reservedSeatKey = seatKey(0, spot);
            agent.reservedSeatFloor = 0;
            agent.reservedSeatWp = spot;
        }
        mid = [
            { type: "WALK_TO_WP", floor: 0, wpName: spot },
            { type: "SIT", floor: 0, wpName: spot },
            { type: "WAIT_SIM", minutes: randInt(6, 16) },
            { type: "STAND" },
            { type: "RELEASE_SEAT" }
        ];
    } else if (roll < 0.42) {
        const bl = Math.random() < 0.5
            ? ["back_lounge_N", "back_lounge_S"]
            : ["pit_N", "pit_S", "pit_E", "pit_W"];
        const spot = reserveFromList(0, bl) || "lobby_stand_midW";
        if (spot.indexOf("lobby_stand") < 0) {
            agent.reservedSeatKey = seatKey(0, spot);
            agent.reservedSeatFloor = 0;
            agent.reservedSeatWp = spot;
        }
        mid = [
            { type: "WALK_TO_WP", floor: 0, wpName: spot },
            { type: "SIT", floor: 0, wpName: spot },
            { type: "WAIT_SIM", minutes: randInt(6, 16) },
            { type: "STAND" },
            { type: "RELEASE_SEAT" }
        ];
    } else if (roll < 0.52) {
        const stand = randChoice(["reception", "kiosk", "lobby_wc_front", "lobby_wc_back"]);
        mid = [
            { type: "WALK_TO_WP", floor: 0, wpName: stand },
            { type: "WAIT_SIM", minutes: randInt(3, 9) }
        ];
    } else if (roll < 0.62) {
        const lo = randChoice(["lobby_stand_center", "lobby_stand_NE", "lobby_stand_NW", "lobby_stand_midE", "lobby_stand_midW", "lobby_stand_entry"]);
        mid = [
            { type: "WALK_TO_WP", floor: 0, wpName: lo },
            { type: "SIT", floor: 0, wpName: lo },
            { type: "WAIT_SIM", minutes: randInt(4, 12) }
        ];
    } else if (roll < 0.77) {
        const upFloor = randInt(1, WORLD.FLOOR_COUNT - 1);
        const spots = ["lounge_spot0", "lounge_spot1", "lounge_spot2", "water_cooler", "hall_stand_N"];
        const spot = reserveFromList(upFloor, spots) || "hall_stand_S";
        if (spot.indexOf("lounge") === 0) {
            agent.reservedSeatKey = seatKey(upFloor, spot);
            agent.reservedSeatFloor = upFloor;
            agent.reservedSeatWp = spot;
        }
        mid = planRide(0, upFloor).concat([
            { type: "WALK_TO_WP", floor: upFloor, wpName: spot },
            { type: "SIT", floor: upFloor, wpName: spot },
            { type: "WAIT_SIM", minutes: randInt(8, 18) },
            { type: "STAND" },
            { type: "RELEASE_SEAT" }
        ]).concat(planRide(upFloor, 0));
    } else {
        const meetFloor = randInt(1, WORLD.FLOOR_COUNT - 1);
        const seat = reserveConfSeat(meetFloor);
        if (seat) {
            agent.reservedSeatKey = seatKey(meetFloor, seat);
            agent.reservedSeatFloor = meetFloor;
            agent.reservedSeatWp = seat;
            mid = planRide(0, meetFloor).concat([
                { type: "WALK_TO_WP", floor: meetFloor, wpName: "conf_door" },
                { type: "WALK_TO_WP", floor: meetFloor, wpName: seat },
                { type: "SIT", floor: meetFloor, wpName: seat },
                { type: "ENTER_STATE", state: "IN_MEETING" },
                { type: "WAIT_SIM", minutes: randInt(18, 36) },
                { type: "STAND" },
                { type: "RELEASE_SEAT" }
            ]).concat(planRide(meetFloor, 0));
        } else {
            const lo = randChoice(["lobby_stand_center", "lobby_stand_midE", "lobby_stand_NW"]);
            mid = [
                { type: "WALK_TO_WP", floor: 0, wpName: lo },
                { type: "WAIT_SIM", minutes: randInt(5, 12) }
            ];
        }
    }
    if (mid.length === 0) {
        mid = [
            { type: "WALK_TO_WP", floor: 0, wpName: "lobby_stand_center" },
            { type: "WAIT_SIM", minutes: randInt(4, 10) }
        ];
    }
    return [
        { type: "ENTER_STATE", state: "VISITING" },
        { type: "WALK_TO_WP", floor: 0, wpName: "front_door_threshold" },
        { type: "WALK_TO_WP", floor: 0, wpName: "entrance" },
        { type: "WALK_TO_WP", floor: 0, wpName: "lobby_center" }
    ].concat(mid).concat([
        { type: "WALK_TO_WP", floor: 0, wpName: "lobby_center" },
        { type: "WALK_TO_WP", floor: 0, wpName: "entrance" },
        { type: "WALK_TO_WP", floor: 0, wpName: "front_door_threshold" },
        { type: "WALK_TO_WP", floor: 0, wpName: "outside" },
        { type: "EXIT_BUILDING" }
    ]);
}

function chooseNextActivity(agent) {
    if (agent.role === "VISITOR") {
        agent.plan = planLeaveBuilding(agent);
        return;
    }
    if (Clock.simMinute >= agent.departureTime) {
        agent.plan = planLeaveBuilding(agent);
        return;
    }
    if (agent.plannedMeetingTimes && agent.plannedMeetingTimes.length) {
        const due = agent.plannedMeetingTimes.findIndex(function (t) { return Clock.simMinute >= t; });
        if (due >= 0) {
            agent.plannedMeetingTimes.splice(due, 1);
            agent.plan = planAttendMeeting(agent);
            return;
        }
    }
    if (!agent.hasLunched && Clock.simMinute >= agent.lunchTime) {
        agent.plan = planGoToLunch(agent);
        return;
    }
    const roll = Math.random();
    if (roll < MEETING_PROB * 0.4) {
        agent.plan = planAttendMeeting(agent);
    } else if (roll < MEETING_PROB * 0.4 + 0.12) {
        agent.plan = planVisitLounge(agent);
    } else if (roll < MEETING_PROB * 0.4 + 0.12 + 0.15) {
        agent.plan = planVisitCoworker(agent);
    } else {
        agent.plan = [
            { type: "WAIT_SIM", minutes: randInt(18, 65) },
            { type: "PICK_NEXT_ACTIVITY" }
        ];
    }
}

function assignSchedule(agent) {
    agent.arrivalTime = 8 * 60 + 15 + randInt(0, 75);
    agent.lunchTime = 11 * 60 + 30 + randInt(0, 120);
    agent.lunchDuration = randInt(25, 60);
    if (Math.random() < 0.15) {
        agent.departureTime = 18 * 60 + 30 + randInt(0, 75);
    } else {
        agent.departureTime = 16 * 60 + 45 + randInt(0, 105);
    }
    agent.hasLunched = false;
    agent.plannedMeetingTimes = [];
    if (agent.role === "WORKER") {
        if (Math.random() < 0.7) agent.plannedMeetingTimes.push(9 * 60 + 30 + randInt(0, 90));
        if (Math.random() < 0.55) agent.plannedMeetingTimes.push(14 * 60 + randInt(0, 90));
    }
    if (agent.role === "VISITOR") {
        agent.visitDuration = randInt(18, 55);
        agent.arrivalTime = 8 * 60 + 20 + randInt(0, 480);
    }
}

function makeAgent(id, role, deskInfo) {
    const group = createPerson({});
    group.visible = false;
    const agent = {
        id: id,
        role: role,
        name: FIRST_NAMES[id % FIRST_NAMES.length] + (id >= FIRST_NAMES.length ? String(Math.floor(id / FIRST_NAMES.length)) : ""),
        homeFloor: deskInfo ? deskInfo.floor : null,
        deskId: deskInfo ? deskInfo.id : null,
        deskWpName: deskInfo ? deskInfo.deskWp : null,
        deskDoorWpName: deskInfo ? deskInfo.doorWp : null,
        state: id < targetOccupancy ? "AWAY" : "DISABLED",
        plan: [],
        currentAction: null,
        group: group,
        floor: 0,
        hasLunched: false,
        goal: "workday",
        reservedSeatKey: null,
        reservedSeatFloor: null,
        reservedSeatWp: null
    };
    assignSchedule(agent);
    return agent;
}

function spawnAgent(agent) {
    agent.floor = 0;
    agent.state = "ARRIVING";
    agent.group.visible = true;
    agent.group.userData.isSitting = false;
    agent.group.userData.isWalking = false;
    agent.group.position.set(
        (Math.random() - 0.5) * 2.2,
        0,
        12 + (Math.random() - 0.5) * 1.5
    );
    agent.group.rotation.y = Math.PI;
    if (!agent.group.parent) scene.add(agent.group);
    if (agent.role === "WORKER") {
        agent.plan = planArriveToDesk(agent);
    } else {
        agent.plan = planVisitorVisit(agent);
    }
    agent.currentAction = null;
}

function despawnAgent(agent) {
    if (agent.reservedSeatKey) {
        seatReservations.delete(agent.reservedSeatKey);
        agent.reservedSeatKey = null;
    }
    if (agent.group.parent) agent.group.parent.remove(agent.group);
    agent.group.visible = false;
    agent.group.userData.isWalking = false;
    agent.group.userData.isSitting = false;
    agent.state = "GONE";
    agent.plan = [];
    agent.currentAction = null;
    if (elevator.passengers.has(agent) || elevator.pendingBoarders.has(agent) || elevator.pendingDisembark.has(agent)) {
        elevator.completeDisembark(agent);
    }
}

function releaseAgentSeat(agent) {
    if (agent.reservedSeatKey) {
        seatReservations.delete(agent.reservedSeatKey);
        agent.reservedSeatKey = null;
        agent.reservedSeatFloor = null;
        agent.reservedSeatWp = null;
    }
}

function faceToward(agent, tx, tz) {
    const dx = tx - agent.group.position.x;
    const dz = tz - agent.group.position.z;
    if (Math.abs(dx) + Math.abs(dz) > 0.0001) {
        agent.group.rotation.y = Math.atan2(dx, dz);
    }
}

function walkToward(agent, tx, ty, tz, dt) {
    const pos = agent.group.position;
    const dx = tx - pos.x;
    const dz = tz - pos.z;
    const dist = Math.hypot(dx, dz);
    const step = WALK_SPEED * dt;
    pos.y = ty;
    if (dist <= step || dist < 0.04) {
        pos.x = tx;
        pos.z = tz;
        return true;
    }
    pos.x += (dx / dist) * step;
    pos.z += (dz / dist) * step;
    faceToward(agent, tx, tz);
    agent.group.userData.isWalking = true;
    return false;
}

function isEntranceWp(name) {
    return name === "outside" || name === "front_door_threshold" || name === "entrance" || name === "lobby_center";
}

function startAction(agent, action) {
    agent.currentAction = action;
    agent._stallT = 0;
    agent._prevWp = agent.group.position.clone();
    const type = action.type;
    if (type === "WALK_TO_WP") {
        const fl = world.floors[action.floor];
        const from = nearestNodeName(fl.nodes, agent.group.position);
        agent.path = world.bfsPath(fl.nodes, from, action.wpName);
        agent.pathIndex = 0;
        agent.group.userData.isWalking = true;
        agent.group.userData.isSitting = false;
    } else if (type === "WAIT_SIM") {
        action.untilMin = Clock.simMinute + (action.minutes || 1);
        agent.group.userData.isWalking = false;
    } else if (type === "WAIT_AT_PANEL") {
        agent.state = "WAITING_ELEVATOR";
        agent.group.userData.isWalking = false;
    } else if (type === "ENTER_ELEVATOR") {
        action.phase = "reserve";
        action._stallT = 0;
        action._prevWalk = agent.group.position.clone();
    } else if (type === "SIT") {
        const fl = world.floors[action.floor];
        const target = fl.sitTargets[action.wpName] || { sit: true, facing: agent.group.rotation.y, x: agent.group.position.x, z: agent.group.position.z };
        let sx = target.x != null ? target.x : agent.group.position.x;
        let sz = target.z != null ? target.z : agent.group.position.z;
        if (!target.sit) {
            const ang = Math.random() * Math.PI * 2;
            const rad = 0.35 + Math.random() * 0.4;
            sx += Math.cos(ang) * rad;
            sz += Math.sin(ang) * rad;
        }
        agent.group.position.x = sx;
        agent.group.position.z = sz;
        agent.group.position.y = action.floor * WORLD.FLOOR_HEIGHT - (target.sit ? SIT_DROP : 0);
        agent.group.rotation.y = target.facing;
        agent.group.userData.isSitting = !!target.sit;
        agent.group.userData.isWalking = false;
        agent.floor = action.floor;
    } else if (type === "STAND") {
        agent.group.userData.isSitting = false;
        const inCar = agent.group.parent === elevator.car;
        agent.group.position.y = inCar ? 0 : (agent.floor || 0) * WORLD.FLOOR_HEIGHT;
        agent.group.userData.isWalking = false;
    } else if (type === "RELEASE_SEAT") {
        releaseAgentSeat(agent);
    } else if (type === "PRESS_FLOOR") {
        elevator.pressDestination(action.floor);
    } else if (type === "ENTER_STATE") {
        agent.state = action.state;
    } else if (type === "MARK_LUNCHED") {
        agent.hasLunched = true;
    } else if (type === "PICK_NEXT_ACTIVITY") {
        chooseNextActivity(agent);
    } else if (type === "EXIT_BUILDING") {
        despawnAgent(agent);
    }
}

function tickWalkPath(agent, dt) {
    const action = agent.currentAction;
    if (!agent.path || agent.pathIndex >= agent.path.length) return true;
    const wp = agent.path[agent.pathIndex];
    const arrived = walkToward(agent, wp.x, action.floor * WORLD.FLOOR_HEIGHT, wp.z, dt);
    const moved = agent.group.position.distanceTo(agent._prevWp);
    if (moved < 0.005) agent._stallT += dt;
    else agent._stallT = 0;
    agent._prevWp.copy(agent.group.position);
    const nearDoor = action.wpName === "front_door_threshold" || action.wpName === "entrance" || action.wpName === "outside";
    if (nearDoor && agent._stallT > 1.5) {
        agent.pathIndex = agent.path.length;
        const last = world.floors[action.floor].nodes[action.wpName];
        if (last) {
            agent.group.position.x = last.pos.x;
            agent.group.position.z = last.pos.z;
        }
        return true;
    }
    if (agent._stallT > 1.2) {
        agent.pathIndex += 1;
        agent._stallT = 0;
        return agent.pathIndex >= agent.path.length;
    }
    if (arrived) {
        agent.pathIndex += 1;
        return agent.pathIndex >= agent.path.length;
    }
    return false;
}

function tickEnterElevator(agent, dt) {
    const action = agent.currentAction;
    const toFloor = action.toFloor;
    if (action.phase === "reserve") {
        if (elevator.state !== "DOOR_OPEN" || elevator.currentFloor !== agent.floor) {
            if (toFloor > agent.floor) elevator.callUp(agent.floor);
            else elevator.callDown(agent.floor);
            return false;
        }
        const spot = elevator.reserveBoardingSpot(agent);
        if (!spot) {
            if (toFloor > agent.floor) elevator.callUp(agent.floor);
            else elevator.callDown(agent.floor);
            return false;
        }
        agent.reservedSpot = spot;
        action.phase = "toDoor";
        action._stallT = 0;
        action._prevWalk = agent.group.position.clone();
        return false;
    }
    if (action.phase === "toDoor") {
        const ty = agent.floor * WORLD.FLOOR_HEIGHT;
        const tx = agent.reservedSpot.x;
        const tz = 1.55;
        const arrived = walkToward(agent, tx, ty, tz, dt);
        const moved = agent.group.position.distanceTo(action._prevWalk);
        if (moved < 0.005) action._stallT += dt;
        else action._stallT = 0;
        action._prevWalk.copy(agent.group.position);
        if (action._stallT > 1.5 || arrived) {
            agent.group.position.set(tx, ty, tz);
            elevator.car.attach(agent.group);
            action.phase = "toSpot";
            action._stallT = 0;
        }
        return false;
    }
    if (action.phase === "toSpot") {
        const spot = agent.reservedSpot;
        const arrived = walkToward(agent, spot.x, 0, spot.z, dt);
        if (arrived) {
            elevator.completeBoard(agent);
            agent.group.rotation.y = 0;
            agent.group.userData.isWalking = false;
            agent.state = "IN_CAR";
            return true;
        }
        return false;
    }
    return true;
}

function tickExitElevator(agent, dt) {
    const action = agent.currentAction;
    if (!action.phase) {
        action.phase = "leave";
        elevator.registerDisembark(agent);
        const worldY = action.toFloor * WORLD.FLOOR_HEIGHT;
        scene.attach(agent.group);
        agent.group.position.y = worldY;
        agent.floor = action.toFloor;
        action._stallT = 0;
        action._prevWalk = agent.group.position.clone();
    }
    const wait = world.floors[action.toFloor].nodes.elevWait.pos;
    const arrived = walkToward(agent, wait.x, action.toFloor * WORLD.FLOOR_HEIGHT, wait.z, dt);
    const moved = agent.group.position.distanceTo(action._prevWalk);
    if (moved < 0.005) action._stallT += dt;
    else action._stallT = 0;
    action._prevWalk.copy(agent.group.position);
    if (arrived || action._stallT > 1.5) {
        agent.group.position.set(wait.x, action.toFloor * WORLD.FLOOR_HEIGHT, wait.z);
        elevator.completeDisembark(agent);
        agent.state = "ON_FLOOR";
        agent.group.userData.isWalking = false;
        return true;
    }
    return false;
}

function tickAction(agent, dt) {
    const action = agent.currentAction;
    if (!action) return true;
    const type = action.type;
    if (type === "WALK_TO_WP") return tickWalkPath(agent, dt);
    if (type === "WAIT_SIM") return Clock.simMinute >= action.untilMin;
    if (type === "WAIT_AT_PANEL") {
        const dir = action.dir;
        const floor = action.floor;
        if (dir > 0) elevator.callUp(floor);
        else elevator.callDown(floor);
        return elevator.isAcceptingAt(floor, dir) && elevator.currentCapacityFree() > 0;
    }
    if (type === "ENTER_ELEVATOR") return tickEnterElevator(agent, dt);
    if (type === "WAIT_FOR_FLOOR") {
        return elevator.state === "DOOR_OPEN" && elevator.currentFloor === action.floor;
    }
    if (type === "EXIT_ELEVATOR") return tickExitElevator(agent, dt);
    return true;
}

function dispatchAgent(agent, dt) {
    if (agent.state === "DISABLED" || agent.state === "GONE" || agent.state === "AWAY") return;
    if (!agent.group.parent && agent.state !== "GONE") return;
    for (let n = 0; n < 16; n++) {
        if (agent.state === "GONE") return;
        if (!agent.currentAction) {
            if (!agent.plan || agent.plan.length === 0) return;
            startAction(agent, agent.plan.shift());
            if (agent.state === "GONE") return;
            continue;
        }
        const done = tickAction(agent, dt);
        if (!done) return;
        agent.currentAction = null;
    }
}

function countPresent() {
    let n = 0;
    for (let i = 0; i < agents.length; i++) {
        const st = agents[i].state;
        if (st !== "DISABLED" && st !== "AWAY" && st !== "GONE") n++;
    }
    return n;
}

function applyOccupancy() {
    for (let i = 0; i < agents.length; i++) {
        const agent = agents[i];
        if (agent.id < targetOccupancy) {
            if (agent.state === "DISABLED") {
                agent.state = "AWAY";
                assignSchedule(agent);
                if (agent.role === "VISITOR") agent.arrivalTime = Clock.simMinute + randInt(0, 6);
            }
        } else if (agent.state === "AWAY" || agent.state === "GONE") {
            agent.state = "DISABLED";
        }
    }
}

function topUpVisitors() {
    if (Clock.simMinute < 8 * 60 || Clock.simMinute > 18 * 60 + 40) return;
    let deficit = targetOccupancy - countPresent();
    if (deficit <= 0) return;
    for (let i = 0; i < agents.length && deficit > 0; i++) {
        const agent = agents[i];
        if (agent.role !== "VISITOR") continue;
        if (agent.state !== "AWAY" && agent.state !== "GONE") continue;
        if (agent.id >= targetOccupancy) continue;
        assignSchedule(agent);
        agent.arrivalTime = Clock.simMinute + randInt(0, 6);
        agent.state = "AWAY";
        deficit--;
    }
}

function resetSimDay() {
    seatReservations.clear();
    elevator.reset();
    for (let i = 0; i < agents.length; i++) {
        const agent = agents[i];
        if (agent.group.parent) agent.group.parent.remove(agent.group);
        agent.group.visible = false;
        agent.group.userData.isSitting = false;
        agent.group.userData.isWalking = false;
        agent.currentAction = null;
        agent.plan = [];
        agent.floor = 0;
        releaseAgentSeat(agent);
        assignSchedule(agent);
        agent.state = agent.id < targetOccupancy ? "AWAY" : "DISABLED";
    }
}

function applyCollisions() {
    const active = [];
    for (let i = 0; i < agents.length; i++) {
        const agent = agents[i];
        if (!agent.group.parent) continue;
        if (agent.state === "DISABLED" || agent.state === "GONE" || agent.state === "AWAY") continue;
        if (agent.group.userData.isSitting) continue;
        if (agent.group.parent === elevator.car) continue;
        if (agent.currentAction && agent.currentAction.type === "ENTER_ELEVATOR") continue;
        active.push(agent);
    }
    for (let i = 0; i < active.length; i++) {
        const a = active[i];
        const aEnter = a.currentAction && a.currentAction.type === "WALK_TO_WP" && isEntranceWp(a.currentAction.wpName) && a.group.position.z > 7.2;
        for (let j = i + 1; j < active.length; j++) {
            const b = active[j];
            if (a.group.parent !== b.group.parent) continue;
            const dy = Math.abs(a.group.position.y - b.group.position.y);
            if (dy > 1.0) continue;
            const bEnter = b.currentAction && b.currentAction.type === "WALK_TO_WP" && isEntranceWp(b.currentAction.wpName) && b.group.position.z > 7.2;
            if (aEnter || bEnter) continue;
            const dx = a.group.position.x - b.group.position.x;
            const dz = a.group.position.z - b.group.position.z;
            let d = Math.hypot(dx, dz);
            if (d > 0.7) continue;
            let nx;
            let nz;
            if (d < 0.001) {
                const ang = Math.random() * Math.PI * 2;
                nx = Math.cos(ang);
                nz = Math.sin(ang);
                d = 0.001;
            } else {
                nx = dx / d;
                nz = dz / d;
            }
            const push = (0.7 - d) * 0.18;
            a.group.position.x += nx * push;
            a.group.position.z += nz * push;
            b.group.position.x -= nx * push;
            b.group.position.z -= nz * push;
        }
    }
}

function tickAgents(motionDt) {
    for (let i = 0; i < agents.length; i++) {
        const agent = agents[i];
        if (agent.state === "DISABLED") continue;
        if (agent.state === "AWAY" && Clock.simMinute >= agent.arrivalTime) {
            spawnAgent(agent);
        }
        if (agent.role === "WORKER" && agent.state !== "AWAY" && agent.state !== "GONE" && agent.state !== "LEAVING" && agent.state !== "DISABLED") {
            if (Clock.simMinute >= agent.departureTime) {
                const act = agent.currentAction;
                const leavingAlready = act && (act.type === "EXIT_BUILDING" || (agent.state === "LEAVING"));
                if (!leavingAlready) {
                    releaseAgentSeat(agent);
                    agent.plan = planLeaveBuilding(agent);
                    agent.currentAction = null;
                }
            }
        }
        dispatchAgent(agent, motionDt);
        if (agent.group.parent) animatePersonWalking(agent.group, motionDt);
    }
}

function updateHUD() {
    if (!hudTimeEl) return;
    hudTimeEl.textContent = Clock.format();
    const counts = {};
    for (let i = 0; i < agents.length; i++) {
        const st = agents[i].state;
        counts[st] = (counts[st] || 0) + 1;
    }
    const parts = Object.keys(counts).sort().map(function (k) { return k + " " + counts[k]; });
    hudStateEl.textContent = parts.join(" · ");
    const dir = elevator.direction > 0 ? "UP" : (elevator.direction < 0 ? "DOWN" : "—");
    const dests = Array.from(elevator.destinations).sort(function (a, b) { return a - b; }).join(",");
    const ups = Array.from(elevator.upCalls).sort(function (a, b) { return a - b; }).join(",");
    const downs = Array.from(elevator.downCalls).sort(function (a, b) { return a - b; }).join(",");
    hudElevEl.textContent = "Car F" + elevator.currentFloor + " " + dir + " " + elevator.state +
        "  pax " + elevator.passengers.size +
        "  dest [" + dests + "]" +
        "  up [" + ups + "]" +
        "  dn [" + downs + "]";
}

function buildHUD() {
    hudRoot = document.createElement("div");
    hudRoot.style.cssText = "position:fixed;left:12px;top:12px;z-index:5;color:#e8e8ef;font:13px/1.35 sans-serif;background:rgba(12,14,22,0.72);padding:12px 14px;border-radius:8px;min-width:260px;";
    hudTimeEl = document.createElement("div");
    hudTimeEl.style.cssText = "font:600 28px/1.1 sans-serif;letter-spacing:0.04em;margin-bottom:8px;";
    hudRoot.appendChild(hudTimeEl);

    const speedLabel = document.createElement("div");
    speedLabel.textContent = "Speed: 120x";
    hudRoot.appendChild(speedLabel);
    speedInput = document.createElement("input");
    speedInput.type = "range";
    speedInput.min = "0";
    speedInput.max = "1000";
    speedInput.value = String(Math.round(Math.log(120) / Math.log(600) * 1000));
    speedInput.style.width = "220px";
    speedInput.addEventListener("input", function () {
        const t = Number(speedInput.value) / 1000;
        Clock.timeScale = Math.max(1, Math.round(Math.pow(600, t)));
        speedLabel.textContent = "Speed: " + Clock.timeScale + "x";
    });
    hudRoot.appendChild(speedInput);

    const occLabel = document.createElement("div");
    occLabel.textContent = "Occupancy: " + targetOccupancy + " / 100 people";
    occLabel.style.marginTop = "8px";
    hudRoot.appendChild(occLabel);
    occupancyInput = document.createElement("input");
    occupancyInput.type = "range";
    occupancyInput.min = "1";
    occupancyInput.max = String(MAX_OCCUPANCY);
    occupancyInput.value = String(targetOccupancy);
    occupancyInput.style.width = "220px";
    occupancyInput.addEventListener("input", function () {
        targetOccupancy = Number(occupancyInput.value);
        occLabel.textContent = "Occupancy: " + targetOccupancy + " / 100 people";
        applyOccupancy();
    });
    hudRoot.appendChild(occupancyInput);

    hudStateEl = document.createElement("div");
    hudStateEl.style.marginTop = "8px";
    hudStateEl.style.opacity = "0.9";
    hudRoot.appendChild(hudStateEl);
    hudElevEl = document.createElement("div");
    hudElevEl.style.marginTop = "6px";
    hudElevEl.style.opacity = "0.9";
    hudRoot.appendChild(hudElevEl);
    document.body.appendChild(hudRoot);
}

function buildAgents() {
    const deskPool = [];
    for (let f = 1; f < WORLD.FLOOR_COUNT; f++) {
        const desks = world.floors[f].desks;
        for (let d = 0; d < desks.length; d++) {
            deskPool.push({
                floor: f,
                id: desks[d].id,
                deskWp: desks[d].deskWp,
                doorWp: desks[d].doorWp
            });
        }
    }
    for (let i = 0; i < MAX_WORKERS; i++) {
        agents.push(makeAgent(i, "WORKER", deskPool[i] || deskPool[0]));
    }
    for (let i = 0; i < MAX_VISITORS; i++) {
        agents.push(makeAgent(MAX_WORKERS + i, "VISITOR", null));
    }
}

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
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.sortObjects = true;
    document.body.appendChild(renderer.domElement);
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 8, 0);
    simAmbient = new THREE.AmbientLight(0xffffff, 0.45);
    scene.add(simAmbient);
    simHemi = new THREE.HemisphereLight(0xbfd7ff, 0x303020, 0.45);
    scene.add(simHemi);
    simSun = new THREE.DirectionalLight(0xffffff, 0.9);
    simSun.position.set(20, 35, 18);
    scene.add(simSun);
    world = createWorld(scene);
    elevator = new Elevator(scene, world);
    buildAgents();
    buildHUD();
    window.addEventListener("resize", onWindowResize);
    applyDayNight();
    function animate() {
        requestAnimationFrame(animate);
        const realDt = Math.min(0.05, renderClock.getDelta());
        Clock.tick(realDt);
        applyDayNight();
        const motionDt = realDt * Clock.timeScale;
        elevator.tick(motionDt);
        topUpVisitors();
        tickAgents(motionDt);
        applyCollisions();
        controls.update();
        renderer.render(scene, camera);
        updateHUD();
    }
    animate();
}

window.startSimulation = startSimulation;
window.Clock = Clock;

if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", startSimulation);
} else {
    startSimulation();
}
