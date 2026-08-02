// sim.js - simulated clock, day/night lighting, agent state machines, render loop, UI.

const MAX_WORKERS = 20;
const MAX_VISITORS = 80;
const MAX_OCCUPANCY = MAX_WORKERS + MAX_VISITORS;
const DEFAULT_OCCUPANCY = 45;
const WALK_SPEED = 1.3;
const SPEED_STOPS = [1, 2, 5, 10, 20, 50, 120, 200, 400, 600];
const ENTRANCE_CHAIN = { outside: 1, front_door_threshold: 1, entrance: 1 };
const TRANSIT_STATES = {
    ARRIVING: 1, WAITING_ELEVATOR: 1, IN_CAR: 1, ON_FLOOR: 1, LEAVING: 1,
};

const FIRST_NAMES = [
    "Ada", "Ben", "Cy", "Dee", "Eli", "Fay", "Gus", "Hal", "Ivy", "Jo",
    "Kim", "Lee", "Mia", "Ned", "Ola", "Pia", "Ray", "Sam", "Tia", "Uma",
    "Val", "Wes", "Zoe", "Ari", "Bea", "Cal", "Dia", "Ezra", "Gia", "Hugo",
];

let scene = null;
let camera = null;
let renderer = null;
let controls = null;
let world = null;
let elevator = null;
let sunLight = null;
let ambientLight = null;
let hemiLight = null;
let agents = [];
let targetOccupancy = DEFAULT_OCCUPANCY;
let lastFrameTime = 0;
let hudCounter = 0;
let timeEl = null;
let speedLabel = null;
let occupancyLabel = null;
let statesEl = null;
let elevEl = null;

const seatReservations = new Set();

const Clock = {
    simMinute: 7 * 60 + 30,
    timeScale: 120,
    tick: function tick(realDt) {
        this.simMinute += realDt * this.timeScale / 60;
        if (this.simMinute >= 24 * 60) {
            this.simMinute -= 24 * 60;
            resetDay();
        }
    },
    format: function format() {
        const m = Math.floor(this.simMinute) % 1440;
        let h = Math.floor(m / 60);
        const mm = m % 60;
        const suffix = h < 12 ? "AM" : "PM";
        h = h % 12;
        if (h === 0) h = 12;
        return " " + h + ":" + (mm < 10 ? "0" + mm : String(mm)) + " " + suffix;
    },
};

function randInt(a, b) {
    return a + Math.floor(Math.random() * (b - a + 1));
}

function pickOne(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

// ---------------- day / night ----------------

const DAY_KEYS = [
    { h: 0.0, bg: 0x0a0e18, sun: 0x3a4a6a, si: 0.06, ai: 0.45, hi: 0.32 },
    { h: 5.5, bg: 0x0a0e18, sun: 0x3a4a6a, si: 0.06, ai: 0.45, hi: 0.32 },
    { h: 6.25, bg: 0xc98a52, sun: 0xffb36b, si: 0.55, ai: 0.5, hi: 0.42 },
    { h: 7.0, bg: 0x87a5c8, sun: 0xfff2d9, si: 0.95, ai: 0.55, hi: 0.6 },
    { h: 17.0, bg: 0x87a5c8, sun: 0xfff2d9, si: 0.95, ai: 0.55, hi: 0.6 },
    { h: 17.75, bg: 0xd98f52, sun: 0xffab5e, si: 0.55, ai: 0.5, hi: 0.42 },
    { h: 18.5, bg: 0x0a0e18, sun: 0x3a4a6a, si: 0.06, ai: 0.45, hi: 0.32 },
    { h: 24.0, bg: 0x0a0e18, sun: 0x3a4a6a, si: 0.06, ai: 0.45, hi: 0.32 },
];

const _bgA = new THREE.Color();
const _bgB = new THREE.Color();
const _sunA = new THREE.Color();
const _sunB = new THREE.Color();

function updateLighting() {
    const hour = (Clock.simMinute % 1440) / 60;
    let i = 0;
    while (i < DAY_KEYS.length - 2 && hour > DAY_KEYS[i + 1].h) i += 1;
    const a = DAY_KEYS[i];
    const b = DAY_KEYS[i + 1];
    const t = Math.min(1, Math.max(0, (hour - a.h) / (b.h - a.h)));
    _bgA.setHex(a.bg);
    _bgB.setHex(b.bg);
    scene.background = _bgA.clone().lerp(_bgB, t);
    _sunA.setHex(a.sun);
    _sunB.setHex(b.sun);
    sunLight.color = _sunA.clone().lerp(_sunB, t);
    sunLight.intensity = a.si + (b.si - a.si) * t;
    ambientLight.intensity = a.ai + (b.ai - a.ai) * t;
    hemiLight.intensity = a.hi + (b.hi - a.hi) * t;
}

// ---------------- agents ----------------

function newWorkerSchedule(a) {
    a.arrivalTime = randInt(8 * 60 + 15, 9 * 60 + 30);
    a.lunchTime = randInt(11 * 60 + 30, 13 * 60 + 30);
    a.lunchDuration = randInt(25, 60);
    a.departureTime = Math.random() < 0.15
        ? randInt(18 * 60 + 30, 19 * 60 + 45)
        : randInt(16 * 60 + 45, 18 * 60 + 30);
    a.plannedMeetingTimes = [];
    if (Math.random() < 0.6) a.plannedMeetingTimes.push(randInt(9 * 60 + 30, 11 * 60 + 30));
    if (Math.random() < 0.6) a.plannedMeetingTimes.push(randInt(14 * 60, 16 * 60 + 30));
    a.plannedMeetingTimes.sort((x, y) => x - y);
    a.hasLunched = false;
}

function armVisitor(a, recycled) {
    a.visitDuration = randInt(12, 45);
    if (recycled) {
        a.arrivalTime = Clock.simMinute + randInt(0, 6);
    } else if (Clock.simMinute < 8 * 60) {
        a.arrivalTime = randInt(8 * 60, 10 * 60 + 40);
    } else {
        a.arrivalTime = Clock.simMinute + randInt(0, 6);
    }
}

function createAgents() {
    agents = [];
    let id = 0;
    for (let w = 0; w < MAX_WORKERS; w += 1) {
        const floor = 1 + Math.floor(w / 4);
        const desk = world.floors[floor].desks[w % 4];
        const a = {
            id: id, role: "WORKER",
            name: FIRST_NAMES[id % FIRST_NAMES.length],
            group: createPerson({}),
            homeFloor: desk.floor, deskId: w,
            deskWp: desk.deskWp, deskDoorWp: desk.doorWp,
            deskKey: desk.floor + ":" + desk.deskWp,
            state: "DISABLED", plan: [], currentAction: null,
            floor: 0, tempSeatKey: null,
            hasLunched: false, plannedMeetingTimes: [],
            arrivalTime: 0, lunchTime: 0, lunchDuration: 0, departureTime: 0,
        };
        newWorkerSchedule(a);
        agents.push(a);
        id += 1;
    }
    for (let v = 0; v < MAX_VISITORS; v += 1) {
        const a = {
            id: id, role: "VISITOR",
            name: FIRST_NAMES[id % FIRST_NAMES.length],
            group: createPerson({}),
            homeFloor: null, deskId: null, deskWp: null, deskDoorWp: null, deskKey: null,
            state: "DISABLED", plan: [], currentAction: null,
            floor: 0, tempSeatKey: null,
            hasLunched: false, plannedMeetingTimes: [],
            arrivalTime: 0, lunchTime: 0, lunchDuration: 0, departureTime: 0,
        };
        armVisitor(a, false);
        agents.push(a);
        id += 1;
    }
    applyOccupancy();
}

function countPresent() {
    let n = 0;
    for (const a of agents) {
        if (a.state !== "DISABLED" && a.state !== "AWAY" && a.state !== "GONE") n += 1;
    }
    return n;
}

function applyOccupancy() {
    for (const a of agents) {
        if (a.id < targetOccupancy) {
            if (a.state === "DISABLED") {
                a.state = "AWAY";
                if (a.role === "WORKER") newWorkerSchedule(a);
                else armVisitor(a, false);
            }
        } else if (a.state === "DISABLED" || a.state === "AWAY") {
            a.state = "DISABLED";
        }
    }
}

function topUpVisitors() {
    if (Clock.simMinute < 8 * 60 || Clock.simMinute > 19 * 60) return;
    let deficit = targetOccupancy - countPresent();
    if (deficit <= 0) return;
    for (const a of agents) {
        if (deficit <= 0) break;
        if (a.role !== "VISITOR") continue;
        if (a.id >= targetOccupancy) continue;
        if (a.state !== "GONE") continue;
        armVisitor(a, true);
        a.state = "AWAY";
        deficit -= 1;
    }
}

function resetDay() {
    elevator.reset();
    seatReservations.clear();
    for (const a of agents) {
        if (a.group.parent) a.group.parent.remove(a.group);
        a.group.userData.isSitting = false;
        a.group.userData.isWalking = false;
        a.plan = [];
        a.currentAction = null;
        a.tempSeatKey = null;
        if (a.id < targetOccupancy) {
            a.state = "AWAY";
            if (a.role === "WORKER") newWorkerSchedule(a);
            else armVisitor(a, false);
        } else {
            a.state = "DISABLED";
        }
    }
}

function spawnAgent(a) {
    a.group.position.set(
        (Math.random() * 2 - 1) * 1.1,
        0,
        12 + (Math.random() * 2 - 1) * 0.75
    );
    a.group.rotation.y = Math.PI;
    a.group.userData.isSitting = false;
    a.floor = 0;
    scene.add(a.group);
    a.currentAction = null;
    a.state = "ARRIVING";
    a.plan = a.role === "WORKER" ? planArriveToDesk(a) : planVisitorVisit(a);
}

// ---------------- seats ----------------

function seatKeyOf(floor, wp) {
    return floor + ":" + wp;
}

function findFreeSeat(agent, floor, wpList) {
    const order = wpList.slice();
    for (let i = order.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = order[i];
        order[i] = order[j];
        order[j] = tmp;
    }
    for (let i = 0; i < order.length; i += 1) {
        const wp = order[i];
        const key = seatKeyOf(floor, wp);
        if (!seatReservations.has(key)) {
            seatReservations.add(key);
            agent.tempSeatKey = key;
            return wp;
        }
    }
    return null;
}

function releaseTempSeat(agent) {
    if (agent.tempSeatKey) {
        seatReservations.delete(agent.tempSeatKey);
        agent.tempSeatKey = null;
    }
}

// ---------------- plan compilers ----------------

function walkTo(floor, wp) {
    return { type: "WALK_TO_WP", floor: floor, wp: wp };
}

function elevatorRide(fromFloor, toFloor) {
    const dir = toFloor > fromFloor ? 1 : -1;
    return [
        { type: "WAIT_AT_PANEL", floor: fromFloor, dir: dir, toFloor: toFloor },
        { type: "ENTER_ELEVATOR", floor: fromFloor, dir: dir, toFloor: toFloor },
        { type: "PRESS_FLOOR", floor: toFloor },
        { type: "WAIT_FOR_FLOOR", floor: toFloor },
        { type: "EXIT_ELEVATOR", toFloor: toFloor },
    ];
}

function confSeatNames() {
    return ["conf_seat0", "conf_seat1", "conf_seat2", "conf_seat3"];
}

function planArriveToDesk(a) {
    seatReservations.add(a.deskKey);
    const acts = [
        walkTo(0, "front_door_threshold"),
        walkTo(0, "entrance"),
        walkTo(0, "lobby_center"),
    ];
    for (const s of elevatorRide(0, a.homeFloor)) acts.push(s);
    acts.push(walkTo(a.homeFloor, a.deskDoorWp));
    acts.push(walkTo(a.homeFloor, a.deskWp));
    acts.push({ type: "SIT", floor: a.homeFloor, wp: a.deskWp });
    acts.push({ type: "ENTER_STATE", st: "AT_DESK" });
    acts.push({ type: "WAIT_SIM", minutes: randInt(25, 70) });
    acts.push({ type: "PICK_NEXT_ACTIVITY" });
    return acts;
}

function planGoToLunch(a) {
    const bistro = findFreeSeat(a, 0, world.floors[0].lobby.bistroChairs);
    const acts = [{ type: "STAND" }];
    acts.push(walkTo(a.homeFloor, a.deskDoorWp));
    for (const s of elevatorRide(a.homeFloor, 0)) acts.push(s);
    if (bistro) {
        acts.push(walkTo(0, bistro));
        acts.push({ type: "SIT", floor: 0, wp: bistro });
        acts.push({ type: "ENTER_STATE", st: "AT_LUNCH" });
        acts.push({ type: "WAIT_SIM", minutes: a.lunchDuration });
        acts.push({ type: "MARK_LUNCHED" });
        acts.push({ type: "STAND" });
        acts.push({ type: "RELEASE_SEAT" });
    } else {
        acts.push(walkTo(0, "cafe_order"));
        acts.push({ type: "ENTER_STATE", st: "AT_LUNCH" });
        acts.push({ type: "WAIT_SIM", minutes: a.lunchDuration });
        acts.push({ type: "MARK_LUNCHED" });
    }
    acts.push(walkTo(0, "lobby_center"));
    for (const s of elevatorRide(0, a.homeFloor)) acts.push(s);
    acts.push(walkTo(a.homeFloor, a.deskDoorWp));
    acts.push(walkTo(a.homeFloor, a.deskWp));
    acts.push({ type: "SIT", floor: a.homeFloor, wp: a.deskWp });
    acts.push({ type: "ENTER_STATE", st: "AT_DESK" });
    acts.push({ type: "WAIT_SIM", minutes: randInt(25, 70) });
    acts.push({ type: "PICK_NEXT_ACTIVITY" });
    return acts;
}

function planVisitLounge(a) {
    const spots = world.floors[a.homeFloor].office.loungeChairs;
    const seat = findFreeSeat(a, a.homeFloor, spots);
    const target = seat || world.floors[a.homeFloor].office.cooler;
    const acts = [{ type: "STAND" }];
    acts.push(walkTo(a.homeFloor, a.deskDoorWp));
    acts.push(walkTo(a.homeFloor, "lounge_door"));
    acts.push(walkTo(a.homeFloor, target));
    acts.push({ type: "SIT", floor: a.homeFloor, wp: target });
    acts.push({ type: "ENTER_STATE", st: "AT_BREAK" });
    acts.push({ type: "WAIT_SIM", minutes: randInt(5, 12) });
    acts.push({ type: "STAND" });
    acts.push({ type: "RELEASE_SEAT" });
    acts.push(walkTo(a.homeFloor, "lounge_door"));
    acts.push(walkTo(a.homeFloor, a.deskDoorWp));
    acts.push(walkTo(a.homeFloor, a.deskWp));
    acts.push({ type: "SIT", floor: a.homeFloor, wp: a.deskWp });
    acts.push({ type: "ENTER_STATE", st: "AT_DESK" });
    acts.push({ type: "WAIT_SIM", minutes: randInt(20, 60) });
    acts.push({ type: "PICK_NEXT_ACTIVITY" });
    return acts;
}

function planAttendMeeting(a) {
    const mFloor = Math.random() < 0.65 ? a.homeFloor : randInt(1, WORLD.FLOOR_COUNT - 1);
    const seat = findFreeSeat(a, mFloor, confSeatNames());
    if (!seat) return planVisitLounge(a);
    const acts = [{ type: "STAND" }];
    acts.push(walkTo(a.homeFloor, a.deskDoorWp));
    if (mFloor !== a.homeFloor) {
        for (const s of elevatorRide(a.homeFloor, mFloor)) acts.push(s);
    }
    acts.push(walkTo(mFloor, "conf_door"));
    acts.push(walkTo(mFloor, "conf_center"));
    acts.push(walkTo(mFloor, seat));
    acts.push({ type: "SIT", floor: mFloor, wp: seat });
    acts.push({ type: "ENTER_STATE", st: "IN_MEETING" });
    acts.push({ type: "WAIT_SIM", minutes: randInt(22, 45) });
    acts.push({ type: "STAND" });
    acts.push({ type: "RELEASE_SEAT" });
    acts.push(walkTo(mFloor, "conf_door"));
    if (mFloor !== a.homeFloor) {
        acts.push(walkTo(mFloor, "elevWait"));
        for (const s of elevatorRide(mFloor, a.homeFloor)) acts.push(s);
    }
    acts.push(walkTo(a.homeFloor, a.deskDoorWp));
    acts.push(walkTo(a.homeFloor, a.deskWp));
    acts.push({ type: "SIT", floor: a.homeFloor, wp: a.deskWp });
    acts.push({ type: "ENTER_STATE", st: "AT_DESK" });
    acts.push({ type: "WAIT_SIM", minutes: randInt(20, 60) });
    acts.push({ type: "PICK_NEXT_ACTIVITY" });
    return acts;
}

function planVisitCoworker(a) {
    const candidates = [];
    for (const o of agents) {
        if (o !== a && o.role === "WORKER" && o.state === "AT_DESK") candidates.push(o);
    }
    if (candidates.length === 0) {
        return [
            { type: "WAIT_SIM", minutes: randInt(10, 25) },
            { type: "PICK_NEXT_ACTIVITY" },
        ];
    }
    const buddy = pickOne(candidates);
    const cf = buddy.homeFloor;
    const acts = [{ type: "STAND" }];
    acts.push(walkTo(a.homeFloor, a.deskDoorWp));
    if (cf !== a.homeFloor) {
        for (const s of elevatorRide(a.homeFloor, cf)) acts.push(s);
    }
    acts.push(walkTo(cf, buddy.deskDoorWp));
    acts.push({ type: "ENTER_STATE", st: "VISITING" });
    acts.push({ type: "WAIT_SIM", minutes: randInt(6, 18) });
    acts.push(walkTo(cf, "elevWait"));
    if (cf !== a.homeFloor) {
        for (const s of elevatorRide(cf, a.homeFloor)) acts.push(s);
    }
    acts.push(walkTo(a.homeFloor, a.deskDoorWp));
    acts.push(walkTo(a.homeFloor, a.deskWp));
    acts.push({ type: "SIT", floor: a.homeFloor, wp: a.deskWp });
    acts.push({ type: "ENTER_STATE", st: "AT_DESK" });
    acts.push({ type: "WAIT_SIM", minutes: randInt(20, 60) });
    acts.push({ type: "PICK_NEXT_ACTIVITY" });
    return acts;
}

function planLeaveBuilding(a) {
    if (a.deskKey) seatReservations.delete(a.deskKey);
    releaseTempSeat(a);
    const acts = [
        { type: "ENTER_STATE", st: "LEAVING" },
        { type: "STAND" },
    ];
    acts.push(walkTo(a.homeFloor, a.deskDoorWp));
    for (const s of elevatorRide(a.homeFloor, 0)) acts.push(s);
    acts.push(walkTo(0, "lobby_center"));
    acts.push(walkTo(0, "entrance"));
    acts.push(walkTo(0, "front_door_threshold"));
    acts.push(walkTo(0, "outside"));
    acts.push({ type: "EXIT_BUILDING" });
    return acts;
}

function planVisitorVisit(a) {
    const L = world.floors[0].lobby;
    const acts = [{ type: "ENTER_STATE", st: "VISITING" }];
    acts.push(walkTo(0, "front_door_threshold"));
    acts.push(walkTo(0, "entrance"));
    acts.push(walkTo(0, "lobby_center"));

    const roll = Math.random() * 100;
    if (roll < 10) {
        const seat = findFreeSeat(a, 0, L.bistroChairs);
        if (seat) {
            acts.push(walkTo(0, seat));
            acts.push({ type: "SIT", floor: 0, wp: seat });
            acts.push({ type: "ENTER_STATE", st: "AT_BREAK" });
            acts.push({ type: "WAIT_SIM", minutes: randInt(6, 16) });
            acts.push({ type: "STAND" });
            acts.push({ type: "RELEASE_SEAT" });
        } else {
            acts.push(walkTo(0, "cafe_order"));
            acts.push({ type: "WAIT_SIM", minutes: randInt(3, 8) });
        }
    } else if (roll < 16) {
        acts.push(walkTo(0, "cafe_order"));
        acts.push({ type: "ENTER_STATE", st: "AT_BREAK" });
        acts.push({ type: "WAIT_SIM", minutes: randInt(2, 6) });
    } else if (roll < 30) {
        const seat = findFreeSeat(a, 0, L.frontLounge);
        if (seat) {
            acts.push(walkTo(0, seat));
            acts.push({ type: "SIT", floor: 0, wp: seat });
            acts.push({ type: "ENTER_STATE", st: "AT_BREAK" });
            acts.push({ type: "WAIT_SIM", minutes: randInt(6, 18) });
            acts.push({ type: "STAND" });
            acts.push({ type: "RELEASE_SEAT" });
        } else {
            acts.push(walkTo(0, pickOne(L.loiter)));
            acts.push({ type: "WAIT_SIM", minutes: randInt(4, 10) });
        }
    } else if (roll < 42) {
        const seat = findFreeSeat(a, 0, L.backLounge.concat(L.pit));
        if (seat) {
            acts.push(walkTo(0, seat));
            acts.push({ type: "SIT", floor: 0, wp: seat });
            acts.push({ type: "ENTER_STATE", st: "AT_BREAK" });
            acts.push({ type: "WAIT_SIM", minutes: randInt(6, 18) });
            acts.push({ type: "STAND" });
            acts.push({ type: "RELEASE_SEAT" });
        } else {
            acts.push(walkTo(0, pickOne(L.loiter)));
            acts.push({ type: "WAIT_SIM", minutes: randInt(4, 10) });
        }
    } else if (roll < 52) {
        const wp = pickOne([L.reception, L.kiosk, L.coolers[0], L.coolers[1]]);
        acts.push(walkTo(0, wp));
        acts.push({ type: "WAIT_SIM", minutes: randInt(3, 8) });
    } else if (roll < 62) {
        acts.push(walkTo(0, pickOne(L.loiter)));
        acts.push({ type: "WAIT_SIM", minutes: randInt(4, 12) });
    } else if (roll < 77) {
        const f = randInt(1, WORLD.FLOOR_COUNT - 1);
        const spots = world.floors[f].office.loungeChairs;
        const seat = findFreeSeat(a, f, spots);
        const target = seat || world.floors[f].office.cooler;
        for (const s of elevatorRide(0, f)) acts.push(s);
        acts.push(walkTo(f, "lounge_door"));
        acts.push(walkTo(f, target));
        acts.push({ type: "SIT", floor: f, wp: target });
        acts.push({ type: "ENTER_STATE", st: "AT_BREAK" });
        acts.push({ type: "WAIT_SIM", minutes: randInt(5, 15) });
        acts.push({ type: "STAND" });
        acts.push({ type: "RELEASE_SEAT" });
        acts.push(walkTo(f, "lounge_door"));
        acts.push(walkTo(f, "elevWait"));
        for (const s of elevatorRide(f, 0)) acts.push(s);
    } else {
        const f = randInt(1, WORLD.FLOOR_COUNT - 1);
        const seat = findFreeSeat(a, f, confSeatNames());
        if (seat) {
            for (const s of elevatorRide(0, f)) acts.push(s);
            acts.push(walkTo(f, "conf_door"));
            acts.push(walkTo(f, "conf_center"));
            acts.push(walkTo(f, seat));
            acts.push({ type: "SIT", floor: f, wp: seat });
            acts.push({ type: "ENTER_STATE", st: "IN_MEETING" });
            acts.push({ type: "WAIT_SIM", minutes: randInt(10, 30) });
            acts.push({ type: "STAND" });
            acts.push({ type: "RELEASE_SEAT" });
            acts.push(walkTo(f, "conf_door"));
            acts.push(walkTo(f, "elevWait"));
            for (const s of elevatorRide(f, 0)) acts.push(s);
        } else {
            acts.push(walkTo(0, pickOne(L.loiter)));
            acts.push({ type: "WAIT_SIM", minutes: randInt(4, 10) });
        }
    }

    acts.push(walkTo(0, "lobby_center"));
    acts.push(walkTo(0, "entrance"));
    acts.push(walkTo(0, "front_door_threshold"));
    acts.push(walkTo(0, "outside"));
    acts.push({ type: "EXIT_BUILDING" });
    return acts;
}

function chooseNextActivity(a) {
    if (Clock.simMinute >= a.departureTime) {
        a.plan = planLeaveBuilding(a);
        return;
    }
    for (let i = 0; i < a.plannedMeetingTimes.length; i += 1) {
        if (Clock.simMinute >= a.plannedMeetingTimes[i]) {
            a.plannedMeetingTimes.splice(i, 1);
            a.plan = planAttendMeeting(a);
            return;
        }
    }
    if (Clock.simMinute >= a.lunchTime && !a.hasLunched) {
        a.plan = planGoToLunch(a);
        return;
    }
    const r = Math.random();
    if (r < 0.14) a.plan = planAttendMeeting(a);
    else if (r < 0.26) a.plan = planVisitLounge(a);
    else if (r < 0.41) a.plan = planVisitCoworker(a);
    else {
        a.plan = [
            { type: "WAIT_SIM", minutes: randInt(18, 65) },
            { type: "PICK_NEXT_ACTIVITY" },
        ];
    }
}

// ---------------- primitive actions ----------------

function nearestNodeName(floor, x, z) {
    const nodes = world.floors[floor].nodes;
    let best = null;
    let bd = Infinity;
    for (const name in nodes) {
        const p = nodes[name].pos;
        const d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
        if (d < bd) {
            bd = d;
            best = name;
        }
    }
    return best;
}

function pressHallCall(action) {
    if (action.dir > 0) elevator.callUp(action.floor);
    else elevator.callDown(action.floor);
}

function moveToward(pos, tx, tz, step) {
    const dx = tx - pos.x;
    const dz = tz - pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist <= step) {
        pos.x = tx;
        pos.z = tz;
        return step - dist;
    }
    pos.x += dx / dist * step;
    pos.z += dz / dist * step;
    return 0;
}

function startAction(a, action) {
    const data = {};
    a.actionData = data;
    const pos = a.group.position;
    switch (action.type) {
        case "WALK_TO_WP": {
            const nodes = world.floors[action.floor].nodes;
            const from = nearestNodeName(action.floor, pos.x, pos.z);
            const path = bfsPath(nodes, from, action.wp);
            path.unshift(pos.clone());
            data.path = path;
            data.idx = 1;
            data.stallT = 0;
            data.prevX = pos.x;
            data.prevZ = pos.z;
            a.floor = action.floor;
            break;
        }
        case "WAIT_AT_PANEL": {
            pressHallCall(action);
            a.state = "WAITING_ELEVATOR";
            a.group.rotation.y = Math.atan2(0 - pos.x, 1.7 - pos.z);
            break;
        }
        case "ENTER_ELEVATOR": {
            data.phase = "reserve";
            data.stallT = 0;
            break;
        }
        case "EXIT_ELEVATOR": {
            elevator.registerDisembark(a);
            data.phase = "reparent";
            const wait = world.floors[action.toFloor].nodes.elevWait.pos;
            data.targetX = wait.x;
            data.targetZ = wait.z;
            data.stallT = 0;
            break;
        }
        case "WAIT_SIM": {
            data.until = Clock.simMinute + action.minutes;
            a.group.userData.isWalking = false;
            break;
        }
        case "SIT": {
            const nodes = world.floors[action.floor].nodes;
            const st = world.floors[action.floor].sitTargets[action.wp];
            const np = nodes[action.wp].pos;
            const y0 = action.floor * WORLD.FLOOR_HEIGHT;
            if (st && st.sit) {
                a.group.position.set(np.x, y0 - 0.35, np.z);
                a.group.rotation.y = st.facing;
                a.group.userData.isSitting = true;
            } else {
                const ang = Math.random() * Math.PI * 2;
                const r = 0.35 + Math.random() * 0.4;
                a.group.position.set(np.x + Math.cos(ang) * r, y0, np.z + Math.sin(ang) * r);
                a.group.userData.isSitting = false;
            }
            a.group.userData.isWalking = false;
            a.floor = action.floor;
            break;
        }
        case "STAND": {
            a.group.userData.isSitting = false;
            a.group.position.y = a.group.parent === elevator.carGroup
                ? 0
                : a.floor * WORLD.FLOOR_HEIGHT;
            break;
        }
        case "RELEASE_SEAT":
            releaseTempSeat(a);
            break;
        case "ENTER_STATE":
            a.state = action.st;
            break;
        case "MARK_LUNCHED":
            a.hasLunched = true;
            break;
        case "PICK_NEXT_ACTIVITY":
            chooseNextActivity(a);
            break;
        case "PRESS_FLOOR":
            elevator.pressDestination(action.floor);
            break;
        case "EXIT_BUILDING":
            break;
        default:
            break;
    }
}

function stepAction(a, action, dt) {
    const data = a.actionData || {};
    const pos = a.group.position;
    switch (action.type) {
        case "WALK_TO_WP": {
            let remaining = WALK_SPEED * dt;
            while (remaining > 0 && data.idx < data.path.length) {
                const wp = data.path[data.idx];
                const dx = wp.x - pos.x;
                const dz = wp.z - pos.z;
                const dist = Math.hypot(dx, dz);
                if (dist <= remaining) {
                    pos.x = wp.x;
                    pos.z = wp.z;
                    remaining -= dist;
                    data.idx += 1;
                } else {
                    pos.x += dx / dist * remaining;
                    pos.z += dz / dist * remaining;
                    a.group.rotation.y = Math.atan2(dx, dz);
                    remaining = 0;
                }
            }
            const moved = Math.hypot(pos.x - data.prevX, pos.z - data.prevZ);
            data.prevX = pos.x;
            data.prevZ = pos.z;
            if (moved < 0.005) data.stallT += dt;
            else data.stallT = 0;
            if (data.stallT > 1.2) {
                data.stallT = 0;
                data.idx += 1;
            }
            if (data.idx >= data.path.length) {
                a.group.userData.isWalking = false;
                return true;
            }
            a.group.userData.isWalking = true;
            return false;
        }
        case "WAIT_AT_PANEL": {
            a.group.userData.isWalking = false;
            if (action.dir > 0 && !elevator.upCalls.has(action.floor)) elevator.callUp(action.floor);
            if (action.dir < 0 && !elevator.downCalls.has(action.floor)) elevator.callDown(action.floor);
            return elevator.isAcceptingAt(action.floor, action.dir) &&
                elevator.currentCapacityFree() > 0;
        }
        case "ENTER_ELEVATOR": {
            if (data.phase === "reserve" || data.phase === "recall") {
                const openHere = elevator.state === "DOOR_OPEN" &&
                    elevator.currentFloor === action.floor;
                if (!openHere) {
                    pressHallCall(action);
                    data.phase = "recall";
                    a.group.userData.isWalking = false;
                    return false;
                }
                if (elevator.currentCapacityFree() <= 0) return false;
                const spot = elevator.reserveBoardingSpot(a);
                if (!spot) return false;
                data.spot = spot;
                data.threshX = spot.x;
                data.threshZ = 2.0;
                data.phase = "walkToDoor";
                data.prevX = pos.x;
                data.prevZ = pos.z;
                data.stallT = 0;
                return false;
            }
            if (data.phase === "walkToDoor") {
                const step = WALK_SPEED * dt;
                const dx = data.threshX - pos.x;
                const dz = data.threshZ - pos.z;
                const dist = Math.hypot(dx, dz);
                if (dist > 0.000001) {
                    const use = Math.min(step, dist);
                    pos.x += dx / dist * use;
                    pos.z += dz / dist * use;
                    a.group.rotation.y = Math.atan2(dx, dz);
                    a.group.userData.isWalking = true;
                }
                const moved = Math.hypot(pos.x - data.prevX, pos.z - data.prevZ);
                data.prevX = pos.x;
                data.prevZ = pos.z;
                if (moved < 0.005) data.stallT += dt;
                else data.stallT = 0;
                if (dist <= 0.05 || data.stallT > 1.5) {
                    pos.x = data.threshX;
                    pos.z = data.threshZ;
                    data.phase = "reparent";
                    data.stallT = 0;
                }
                return false;
            }
            if (data.phase === "reparent") {
                elevator.carGroup.attach(a.group);
                data.phase = "walkToSpot";
                data.prevX = pos.x;
                data.prevZ = pos.z;
                data.stallT = 0;
                return false;
            }
            if (data.phase === "walkToSpot") {
                const step = WALK_SPEED * dt;
                const dx = data.spot.x - pos.x;
                const dz = data.spot.z - pos.z;
                const dist = Math.hypot(dx, dz);
                if (dist > 0.000001) {
                    const use = Math.min(step, dist);
                    pos.x += dx / dist * use;
                    pos.z += dz / dist * use;
                    a.group.rotation.y = Math.atan2(dx, dz);
                    a.group.userData.isWalking = true;
                }
                if (dist <= 0.05) {
                    pos.x = data.spot.x;
                    pos.z = data.spot.z;
                    if (elevator.pendingBoarders.has(a)) {
                        elevator.completeBoard(a);
                    } else {
                        elevator.ensurePassenger(a, action.toFloor);
                    }
                    a.group.rotation.y = 0;
                    a.group.userData.isWalking = false;
                    a.state = "IN_CAR";
                    return true;
                }
                return false;
            }
            return true;
        }
        case "PRESS_FLOOR":
            return true;
        case "WAIT_FOR_FLOOR": {
            a.group.userData.isWalking = false;
            return elevator.state === "DOOR_OPEN" && elevator.currentFloor === action.floor;
        }
        case "EXIT_ELEVATOR": {
            if (data.phase === "reparent") {
                scene.attach(a.group);
                data.phase = "walkOut";
                data.prevX = pos.x;
                data.prevZ = pos.z;
                data.stallT = 0;
                return false;
            }
            const step = WALK_SPEED * dt;
            const dx = data.targetX - pos.x;
            const dz = data.targetZ - pos.z;
            const dist = Math.hypot(dx, dz);
            if (dist > 0.000001) {
                const use = Math.min(step, dist);
                pos.x += dx / dist * use;
                pos.z += dz / dist * use;
                a.group.rotation.y = Math.atan2(dx, dz);
                a.group.userData.isWalking = true;
            }
            const moved = Math.hypot(pos.x - data.prevX, pos.z - data.prevZ);
            data.prevX = pos.x;
            data.prevZ = pos.z;
            if (moved < 0.005) data.stallT += dt;
            else data.stallT = 0;
            if (dist <= 0.05 || data.stallT > 1.5) {
                pos.x = data.targetX;
                pos.z = data.targetZ;
                pos.y = action.toFloor * WORLD.FLOOR_HEIGHT;
                elevator.completeDisembark(a);
                a.group.userData.isWalking = false;
                a.floor = action.toFloor;
                a.state = "ON_FLOOR";
                return true;
            }
            return false;
        }
        case "SIT":
            return true;
        case "STAND":
            return true;
        case "RELEASE_SEAT":
            return true;
        case "WAIT_SIM": {
            a.group.userData.isWalking = false;
            return Clock.simMinute >= data.until;
        }
        case "EXIT_BUILDING": {
            if (a.group.parent) a.group.parent.remove(a.group);
            a.group.userData.isWalking = false;
            a.group.userData.isSitting = false;
            a.state = "GONE";
            a.plan = [];
            return true;
        }
        case "ENTER_STATE":
            return true;
        case "MARK_LUNCHED":
            return true;
        case "PICK_NEXT_ACTIVITY":
            return true;
        default:
            return true;
    }
}

// ---------------- per-frame agent processing ----------------

function rescueCarAgents() {
    const st = elevator.state;
    const carClosed = st !== "DOOR_OPEN" && st !== "DOOR_OPENING";
    if (!carClosed) return;
    for (const a of agents) {
        if (a.group.parent !== elevator.carGroup) continue;
        const act = a.currentAction;
        if (act && act.type === "ENTER_ELEVATOR") {
            elevator.ensurePassenger(a, act.toFloor);
            a.currentAction = { type: "WAIT_FOR_FLOOR", floor: act.toFloor };
            a.actionData = {};
            a.plan.unshift({ type: "EXIT_ELEVATOR", toFloor: act.toFloor });
            a.state = "IN_CAR";
        }
    }
}

function updateAgent(a, motionDt) {
    if (a.state === "DISABLED" || a.state === "GONE") return;
    if (a.state === "AWAY") {
        if (Clock.simMinute >= a.arrivalTime) spawnAgent(a);
        return;
    }
    if (a.role === "WORKER" && Clock.simMinute >= a.departureTime &&
        a.state !== "LEAVING" && !TRANSIT_STATES[a.state]) {
        a.plan = planLeaveBuilding(a);
        a.currentAction = null;
    }
    for (let iter = 0; iter < 16; iter += 1) {
        if (!a.currentAction) {
            if (a.plan.length === 0) break;
            a.currentAction = a.plan.shift();
            startAction(a, a.currentAction);
        }
        const done = stepAction(a, a.currentAction, motionDt);
        if (done) {
            a.currentAction = null;
        } else {
            break;
        }
    }
}

function applyCollisions() {
    const movers = [];
    for (const a of agents) {
        if (!a.group.parent || a.group.parent !== scene) continue;
        if (a.group.userData.isSitting) continue;
        const act = a.currentAction;
        if (act && (act.type === "ENTER_ELEVATOR" || act.type === "EXIT_ELEVATOR")) continue;
        if (act && act.type === "WALK_TO_WP" && ENTRANCE_CHAIN[act.wp]) continue;
        movers.push(a);
    }
    for (let i = 0; i < movers.length; i += 1) {
        for (let j = i + 1; j < movers.length; j += 1) {
            const A = movers[i].group.position;
            const B = movers[j].group.position;
            if (Math.abs(A.y - B.y) > 1) continue;
            let dx = B.x - A.x;
            let dz = B.z - A.z;
            let d = Math.hypot(dx, dz);
            if (d >= 0.7) continue;
            if (d < 0.001) {
                const ang = Math.random() * Math.PI * 2;
                dx = Math.cos(ang);
                dz = Math.sin(ang);
                d = 1;
            }
            const push = (0.7 - d) * 0.18;
            const nx = dx / d;
            const nz = dz / d;
            A.x -= nx * push * 0.5;
            A.z -= nz * push * 0.5;
            B.x += nx * push * 0.5;
            B.z += nz * push * 0.5;
        }
    }
}

// ---------------- HUD ----------------

function buildHUD() {
    const hud = document.createElement("div");
    hud.style.cssText = "position:absolute;top:10px;left:10px;z-index:10;padding:10px 14px;" +
        "background:rgba(8,12,20,0.74);color:#dfe8ff;font-family:monospace;font-size:12px;" +
        "border-radius:8px;min-width:250px;user-select:none;pointer-events:auto;";
    document.body.appendChild(hud);

    timeEl = document.createElement("div");
    timeEl.style.cssText = "font-size:22px;font-weight:bold;color:#ffd479;margin-bottom:6px;";
    hud.appendChild(timeEl);

    speedLabel = document.createElement("div");
    hud.appendChild(speedLabel);
    const speedSlider = document.createElement("input");
    speedSlider.type = "range";
    speedSlider.min = "0";
    speedSlider.max = String(SPEED_STOPS.length - 1);
    speedSlider.step = "1";
    speedSlider.value = "6";
    speedSlider.style.width = "100%";
    speedSlider.addEventListener("input", function onSpeedInput() {
        Clock.timeScale = SPEED_STOPS[parseInt(speedSlider.value, 10)];
        speedLabel.textContent = "Speed: " + Clock.timeScale + "x realtime";
    });
    hud.appendChild(speedSlider);
    speedLabel.textContent = "Speed: " + Clock.timeScale + "x realtime";

    occupancyLabel = document.createElement("div");
    occupancyLabel.style.marginTop = "6px";
    hud.appendChild(occupancyLabel);
    const occSlider = document.createElement("input");
    occSlider.type = "range";
    occSlider.min = "1";
    occSlider.max = String(MAX_OCCUPANCY);
    occSlider.step = "1";
    occSlider.value = String(DEFAULT_OCCUPANCY);
    occSlider.style.width = "100%";
    occSlider.addEventListener("input", function onOccInput() {
        targetOccupancy = parseInt(occSlider.value, 10);
        applyOccupancy();
        occupancyLabel.textContent = "Occupancy: " + targetOccupancy + " / " + MAX_OCCUPANCY + " people";
    });
    hud.appendChild(occSlider);
    occupancyLabel.textContent = "Occupancy: " + targetOccupancy + " / " + MAX_OCCUPANCY + " people";

    statesEl = document.createElement("div");
    statesEl.style.cssText = "margin-top:8px;white-space:pre-line;color:#a9c1e8;";
    hud.appendChild(statesEl);

    elevEl = document.createElement("div");
    elevEl.style.cssText = "margin-top:8px;white-space:pre-line;color:#9fe8b0;";
    hud.appendChild(elevEl);
}

function sortedSet(set) {
    const arr = Array.from(set);
    arr.sort((x, y) => x - y);
    return arr.join(",");
}

function updateHUD() {
    hudCounter += 1;
    if (hudCounter % 6 !== 0) return;
    timeEl.textContent = Clock.format();
    const counts = {};
    for (const a of agents) {
        counts[a.state] = (counts[a.state] || 0) + 1;
    }
    let lines = "People (" + countPresent() + " present):";
    for (const st in counts) {
        lines += "\n  " + st + ": " + counts[st];
    }
    statesEl.textContent = lines;
    const dirChar = elevator.direction > 0 ? "UP" : elevator.direction < 0 ? "DOWN" : "--";
    elevEl.textContent = "Elevator: floor " + elevator.currentFloor + " " + dirChar +
        " [" + elevator.state + "]" +
        "\n  riders " + elevator.passengers.size +
        "  dest {" + sortedSet(elevator.destinations) + "}" +
        "\n  up {" + sortedSet(elevator.upCalls) + "}" +
        "  down {" + sortedSet(elevator.downCalls) + "}";
}

// ---------------- boot ----------------

function startSimulation() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x20242a);
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(28, 24, 28);
    camera.lookAt(0, WORLD.FLOOR_HEIGHT * 2.5, 0);
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.sortObjects = true;
    document.body.appendChild(renderer.domElement);
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.target.set(0, WORLD.FLOOR_HEIGHT * 2.5, 0);

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
    buildHUD();

    window.addEventListener("resize", function onResize() {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    lastFrameTime = performance.now();
    animate();
}

function animate() {
    requestAnimationFrame(animate);
    const now = performance.now();
    let realDt = (now - lastFrameTime) / 1000;
    lastFrameTime = now;
    if (realDt > 0.05) realDt = 0.05;
    if (realDt < 0) realDt = 0;

    Clock.tick(realDt);
    const motionDt = realDt * Clock.timeScale;

    updateLighting();
    elevator.tick(motionDt);
    rescueCarAgents();
    topUpVisitors();

    for (const a of agents) updateAgent(a, motionDt);
    applyCollisions();
    for (const a of agents) {
        if (a.group.parent) animatePersonWalking(a.group, motionDt);
    }

    controls.update();
    renderer.render(scene, camera);
    updateHUD();
}

if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", startSimulation);
} else {
    startSimulation();
}
