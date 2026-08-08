// sim.js - simulated clock, day/night lighting, agent state machine + daily
// schedules, render loop, UI. Classic script, auto-starts on page load.

// ---------------------------------------------------------------------------
// Simulated clock: pure real-time multiplier, motion and clock in lockstep
// ---------------------------------------------------------------------------

const Clock = {
    simMinute: 7 * 60 + 30,
    timeScale: 120,
    _lastMs: null,
    getDelta: function () {
        const now = performance.now();
        if (this._lastMs === null) {
            this._lastMs = now;
            return 0;
        }
        const dt = (now - this._lastMs) / 1000;
        this._lastMs = now;
        return dt;
    },
    tick: function (realDt) {
        this.simMinute += realDt * this.timeScale / 60;
        if (this.simMinute >= 24 * 60) {
            this.simMinute -= 24 * 60;
            resetDay();
        }
    },
    format: function () {
        const total = Math.floor(this.simMinute);
        let h = Math.floor(total / 60) % 24;
        const m = total % 60;
        const ap = h >= 12 ? "PM" : "AM";
        let hh = h % 12;
        if (hh === 0) hh = 12;
        return " " + hh + ":" + (m < 10 ? "0" + m : String(m)) + " " + ap;
    }
};

// ---------------------------------------------------------------------------
// Day/night lighting keyframes: long flat day, compressed golden hours
// ---------------------------------------------------------------------------

const DAY_KEYS = [
    { h: 0.0, bg: 0x0d1220, sun: 0xaabbdd, si: 0.06, ai: 0.45, hi: 0.32 },
    { h: 5.5, bg: 0x0d1220, sun: 0xaabbdd, si: 0.06, ai: 0.45, hi: 0.32 },
    { h: 6.0, bg: 0x37406b, sun: 0xffb377, si: 0.30, ai: 0.50, hi: 0.38 },
    { h: 6.5, bg: 0xc98a5a, sun: 0xffcf99, si: 0.65, ai: 0.55, hi: 0.45 },
    { h: 7.5, bg: 0x8fb8d8, sun: 0xfff3e0, si: 0.90, ai: 0.62, hi: 0.55 },
    { h: 13.0, bg: 0x99c4e0, sun: 0xffffff, si: 0.95, ai: 0.65, hi: 0.58 },
    { h: 17.0, bg: 0x8fb4d0, sun: 0xffe9c4, si: 0.85, ai: 0.60, hi: 0.52 },
    { h: 17.9, bg: 0xd08a55, sun: 0xffbb77, si: 0.55, ai: 0.52, hi: 0.42 },
    { h: 18.6, bg: 0x3a3f66, sun: 0xbb99aa, si: 0.15, ai: 0.47, hi: 0.34 },
    { h: 19.3, bg: 0x0d1220, sun: 0xaabbdd, si: 0.06, ai: 0.45, hi: 0.32 },
    { h: 24.0, bg: 0x0d1220, sun: 0xaabbdd, si: 0.06, ai: 0.45, hi: 0.32 }
];
const DAY_COLORS = DAY_KEYS.map(function (k) {
    return { h: k.h, bg: new THREE.Color(k.bg), sun: new THREE.Color(k.sun), si: k.si, ai: k.ai, hi: k.hi };
});

// ---------------------------------------------------------------------------
// Population constants
// ---------------------------------------------------------------------------

const MAX_WORKERS = 20;
const MAX_VISITORS = 80;
const MAX_OCCUPANCY = MAX_WORKERS + MAX_VISITORS;
const DEFAULT_OCCUPANCY = 45;
const WALK_SPEED = 1.3;
const SPEED_STOPS = [1, 2, 4, 8, 15, 30, 60, 120, 180, 240, 360, 480, 600];

const SIM_NAMES = [
    "Ava", "Ben", "Cara", "Dan", "Elle", "Finn", "Gia", "Hugo", "Iris", "Jack",
    "Kira", "Liam", "Mona", "Noel", "Olive", "Pete", "Quinn", "Rosa", "Seth", "Tara",
    "Uma", "Vince", "Wren", "Xavi", "Yara", "Zane", "Ada", "Bo", "Cleo", "Dev",
    "Ezra", "Faye", "Gus", "Hope", "Ivan", "Jade", "Kai", "Lena", "Max", "Nia"
];

const SURFACE_STATES = new Set(["AT_DESK", "IN_MEETING", "AT_BREAK", "AT_LUNCH", "VISITING", "ON_FLOOR"]);

let scene = null;
let camera = null;
let renderer = null;
let controls = null;
let world = null;
let elevator = null;
let ambientLight = null;
let hemiLight = null;
let sunLight = null;
let targetOccupancy = DEFAULT_OCCUPANCY;
let hudAccum = 0;

const agents = [];
const seatReservations = new Set();

function simRandInt(n) {
    return Math.floor(Math.random() * n);
}

// ---------------------------------------------------------------------------
// Lighting
// ---------------------------------------------------------------------------

function updateLighting() {
    const hour = Clock.simMinute / 60;
    let i = 0;
    while (i < DAY_COLORS.length - 2 && hour >= DAY_COLORS[i + 1].h) i++;
    const k0 = DAY_COLORS[i];
    const k1 = DAY_COLORS[i + 1];
    const span = k1.h - k0.h;
    const t = span > 0 ? Math.min(1, Math.max(0, (hour - k0.h) / span)) : 0;
    scene.background.copy(k0.bg).lerp(k1.bg, t);
    sunLight.color.copy(k0.sun).lerp(k1.sun, t);
    sunLight.intensity = k0.si + (k1.si - k0.si) * t;
    ambientLight.intensity = k0.ai + (k1.ai - k0.ai) * t;
    hemiLight.intensity = k0.hi + (k1.hi - k0.hi) * t;
}

// ---------------------------------------------------------------------------
// Seat reservations
// ---------------------------------------------------------------------------

function seatKey(floor, wp) {
    return floor + ":" + wp;
}

function tryReserveSeat(agent, floor, candidates) {
    const order = candidates.slice();
    for (let i = order.length - 1; i > 0; i--) {
        const j = simRandInt(i + 1);
        const tmp = order[i];
        order[i] = order[j];
        order[j] = tmp;
    }
    for (let i = 0; i < order.length; i++) {
        const wp = order[i];
        if (!seatReservations.has(seatKey(floor, wp))) {
            seatReservations.add(seatKey(floor, wp));
            agent.mySeats.push({ floor: floor, wp: wp });
            return wp;
        }
    }
    return null;
}

function releaseSeatKey(agent, floor, wp) {
    seatReservations.delete(seatKey(floor, wp));
    for (let i = agent.mySeats.length - 1; i >= 0; i--) {
        if (agent.mySeats[i].floor === floor && agent.mySeats[i].wp === wp) {
            agent.mySeats.splice(i, 1);
        }
    }
}

function releaseAllSeats(agent) {
    for (let i = 0; i < agent.mySeats.length; i++) {
        seatReservations.delete(seatKey(agent.mySeats[i].floor, agent.mySeats[i].wp));
    }
    agent.mySeats.length = 0;
}

// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------

function makeAgent(id, role) {
    return {
        id: id,
        role: role,
        name: SIM_NAMES[id % SIM_NAMES.length],
        group: null,
        state: "AWAY",
        homeFloor: null,
        deskId: null,
        deskWpName: null,
        deskDoorWpName: null,
        chatWpName: null,
        plan: [],
        currentAction: null,
        mySeats: [],
        arrivalTime: 0,
        lunchTime: 0,
        lunchDuration: 0,
        departureTime: 99999,
        plannedMeetingTimes: [],
        hasLunched: false,
        currentFloor: 0,
        leaving: false,
        _carSpot: null,
        _doorExempt: false
    };
}

function rollSchedule(agent) {
    agent.hasLunched = false;
    agent.leaving = false;
    agent.plannedMeetingTimes = [];
    agent.plan = [];
    agent.currentAction = null;
    if (agent.role === "WORKER") {
        agent.arrivalTime = 495 + simRandInt(76);      // 8:15 .. 9:30
        agent.lunchTime = 690 + simRandInt(121);       // 11:30 .. 13:30
        agent.lunchDuration = 25 + simRandInt(36);     // 25 .. 60 min
        agent.departureTime = Math.random() < 0.15
            ? 1110 + simRandInt(76)                    // straggler 18:30 .. 19:45
            : 1005 + simRandInt(106);                  // 16:45 .. 18:30
        if (Math.random() < 0.6) agent.plannedMeetingTimes.push(540 + simRandInt(150));
        if (Math.random() < 0.5) agent.plannedMeetingTimes.push(800 + simRandInt(160));
        agent.plannedMeetingTimes.sort(function (a, b) { return a - b; });
    } else {
        agent.arrivalTime = 99999; // armed by topUpVisitors
    }
}

function buildAgents() {
    let id = 0;
    for (let f = 1; f < WORLD.FLOOR_COUNT; f++) {
        for (let d = 0; d < 4; d++) {
            const desk = world.floors[f].desks[d];
            const a = makeAgent(id, "WORKER");
            id++;
            a.homeFloor = f;
            a.deskId = desk.id;
            a.deskWpName = desk.wp;
            a.deskDoorWpName = desk.door;
            a.chatWpName = desk.chat;
            agents.push(a);
        }
    }
    while (id < MAX_OCCUPANCY) {
        agents.push(makeAgent(id, "VISITOR"));
        id++;
    }
    for (let i = 0; i < agents.length; i++) {
        rollSchedule(agents[i]);
        agents[i].state = agents[i].id < DEFAULT_OCCUPANCY ? "AWAY" : "DISABLED";
    }
}

function spawnAgent(agent) {
    if (!agent.group) {
        agent.group = createPerson({});
        agent.group.userData.agent = agent;
    }
    agent.group.userData.isSitting = false;
    agent.group.userData.isWalking = false;
    // Jitter so same-frame arrivals don't pile up on one sidewalk point
    const jx = (Math.random() * 2 - 1) * 1.1;
    const jz = (Math.random() * 2 - 1) * 0.75;
    agent.group.position.set(jx, 0, 12 + jz);
    agent.group.rotation.y = Math.PI; // face the building
    if (agent.group.parent !== scene) scene.add(agent.group);
    agent.currentFloor = 0;
    agent._doorExempt = true;
    agent._carSpot = null;
    agent.state = "ARRIVING";
    agent.plan = agent.role === "WORKER" ? planArriveToDesk(agent) : planVisitorVisit(agent);
    agent.currentAction = null;
}

// ---------------------------------------------------------------------------
// Primitive action helpers
// ---------------------------------------------------------------------------

function elevatorSeq(fromFloor, toFloor) {
    if (fromFloor === toFloor) return [];
    const dir = toFloor > fromFloor ? 1 : -1;
    return [
        { type: "WALK_TO_WP", floor: fromFloor, wp: "elevWait" },
        { type: "WAIT_AT_PANEL", floor: fromFloor, dir: dir, toFloor: toFloor },
        { type: "ENTER_ELEVATOR", floor: fromFloor, dir: dir, toFloor: toFloor },
        { type: "PRESS_FLOOR", floor: toFloor },
        { type: "WAIT_FOR_FLOOR", floor: toFloor },
        { type: "EXIT_ELEVATOR", toFloor: toFloor }
    ];
}

function nearestNodeName(nodes, pos) {
    let best = null;
    let bestD = Infinity;
    for (const name in nodes) {
        const np = nodes[name].pos;
        const dx = np.x - pos.x;
        const dz = np.z - pos.z;
        const d = dx * dx + dz * dz;
        if (d < bestD) {
            bestD = d;
            best = name;
        }
    }
    return best;
}

// ---------------------------------------------------------------------------
// Goal -> plan compilers
// ---------------------------------------------------------------------------

function planArriveToDesk(agent) {
    const f = agent.homeFloor;
    const plan = [
        { type: "WALK_TO_WP", floor: 0, wp: "front_door_threshold" },
        { type: "WALK_TO_WP", floor: 0, wp: "entrance" },
        { type: "WALK_TO_WP", floor: 0, wp: "lobby_center" }
    ];
    plan.push.apply(plan, elevatorSeq(0, f));
    plan.push({ type: "WALK_TO_WP", floor: f, wp: agent.deskDoorWpName });
    plan.push({ type: "WALK_TO_WP", floor: f, wp: agent.deskWpName });
    plan.push({ type: "SIT", floor: f, wp: agent.deskWpName });
    plan.push({ type: "ENTER_STATE", state: "AT_DESK" });
    plan.push({ type: "WAIT_SIM", minutes: 40 + simRandInt(50) });
    plan.push({ type: "PICK_NEXT_ACTIVITY" });
    return plan;
}

function planGoToLunch(agent) {
    const f = agent.homeFloor;
    const chair = tryReserveSeat(agent, 0, world.floors[0].bistroChairs);
    const plan = [{ type: "STAND" }];
    plan.push({ type: "WALK_TO_WP", floor: f, wp: agent.deskDoorWpName });
    plan.push.apply(plan, elevatorSeq(f, 0));
    if (chair) {
        plan.push({ type: "WALK_TO_WP", floor: 0, wp: chair });
        plan.push({ type: "SIT", floor: 0, wp: chair });
        plan.push({ type: "ENTER_STATE", state: "AT_LUNCH" });
        plan.push({ type: "WAIT_SIM", minutes: agent.lunchDuration });
        plan.push({ type: "STAND" });
        plan.push({ type: "RELEASE_SEAT", floor: 0, wp: chair });
    } else {
        const loiter = world.floors[0].loiterSpots[simRandInt(world.floors[0].loiterSpots.length)];
        plan.push({ type: "WALK_TO_WP", floor: 0, wp: loiter });
        plan.push({ type: "ENTER_STATE", state: "AT_LUNCH" });
        plan.push({ type: "WAIT_SIM", minutes: agent.lunchDuration });
    }
    plan.push({ type: "MARK_LUNCHED" });
    plan.push({ type: "WALK_TO_WP", floor: 0, wp: "lobby_center" });
    plan.push.apply(plan, elevatorSeq(0, f));
    plan.push({ type: "WALK_TO_WP", floor: f, wp: agent.deskDoorWpName });
    plan.push({ type: "WALK_TO_WP", floor: f, wp: agent.deskWpName });
    plan.push({ type: "SIT", floor: f, wp: agent.deskWpName });
    plan.push({ type: "ENTER_STATE", state: "AT_DESK" });
    plan.push({ type: "WAIT_SIM", minutes: 30 + simRandInt(40) });
    plan.push({ type: "PICK_NEXT_ACTIVITY" });
    return plan;
}

function planVisitLounge(agent) {
    const f = agent.homeFloor;
    const spot = tryReserveSeat(agent, f, world.floors[f].loungeSpots);
    if (!spot) {
        return [
            { type: "WAIT_SIM", minutes: 15 + simRandInt(30) },
            { type: "PICK_NEXT_ACTIVITY" }
        ];
    }
    return [
        { type: "STAND" },
        { type: "WALK_TO_WP", floor: f, wp: "lounge_door" },
        { type: "SIT", floor: f, wp: spot },
        { type: "ENTER_STATE", state: "AT_BREAK" },
        { type: "WAIT_SIM", minutes: 5 + simRandInt(8) },
        { type: "STAND" },
        { type: "RELEASE_SEAT", floor: f, wp: spot },
        { type: "WALK_TO_WP", floor: f, wp: "lounge_door" },
        { type: "WALK_TO_WP", floor: f, wp: agent.deskDoorWpName },
        { type: "WALK_TO_WP", floor: f, wp: agent.deskWpName },
        { type: "SIT", floor: f, wp: agent.deskWpName },
        { type: "ENTER_STATE", state: "AT_DESK" },
        { type: "WAIT_SIM", minutes: 20 + simRandInt(40) },
        { type: "PICK_NEXT_ACTIVITY" }
    ];
}

function planAttendMeeting(agent) {
    const mf = Math.random() < 0.65 ? agent.homeFloor : 1 + simRandInt(5);
    const seat = tryReserveSeat(agent, mf, world.floors[mf].confSeats);
    if (!seat) return planVisitLounge(agent);
    const plan = [{ type: "STAND" }];
    plan.push.apply(plan, elevatorSeq(agent.homeFloor, mf));
    plan.push({ type: "WALK_TO_WP", floor: mf, wp: "conf_door" });
    plan.push({ type: "SIT", floor: mf, wp: seat });
    plan.push({ type: "ENTER_STATE", state: "IN_MEETING" });
    plan.push({ type: "WAIT_SIM", minutes: 22 + simRandInt(24) });
    plan.push({ type: "STAND" });
    plan.push({ type: "RELEASE_SEAT", floor: mf, wp: seat });
    plan.push({ type: "WALK_TO_WP", floor: mf, wp: "conf_door" });
    plan.push.apply(plan, elevatorSeq(mf, agent.homeFloor));
    plan.push({ type: "WALK_TO_WP", floor: agent.homeFloor, wp: agent.deskDoorWpName });
    plan.push({ type: "WALK_TO_WP", floor: agent.homeFloor, wp: agent.deskWpName });
    plan.push({ type: "SIT", floor: agent.homeFloor, wp: agent.deskWpName });
    plan.push({ type: "ENTER_STATE", state: "AT_DESK" });
    plan.push({ type: "WAIT_SIM", minutes: 25 + simRandInt(45) });
    plan.push({ type: "PICK_NEXT_ACTIVITY" });
    return plan;
}

function planVisitCoworker(agent) {
    const candidates = [];
    for (let i = 0; i < agents.length; i++) {
        const o = agents[i];
        if (o !== agent && o.role === "WORKER" && o.state === "AT_DESK") candidates.push(o);
    }
    if (candidates.length === 0) {
        return [
            { type: "WAIT_SIM", minutes: 15 + simRandInt(30) },
            { type: "PICK_NEXT_ACTIVITY" }
        ];
    }
    const buddy = candidates[simRandInt(candidates.length)];
    const bf = buddy.homeFloor;
    const f = agent.homeFloor;
    const plan = [{ type: "STAND" }];
    plan.push.apply(plan, elevatorSeq(f, bf));
    plan.push({ type: "WALK_TO_WP", floor: bf, wp: buddy.deskDoorWpName });
    plan.push({ type: "WALK_TO_WP", floor: bf, wp: buddy.chatWpName });
    plan.push({ type: "SIT", floor: bf, wp: buddy.chatWpName }); // standing waypoint: jitter only
    plan.push({ type: "ENTER_STATE", state: "VISITING" });
    plan.push({ type: "WAIT_SIM", minutes: 6 + simRandInt(13) });
    plan.push({ type: "STAND" });
    plan.push({ type: "WALK_TO_WP", floor: bf, wp: buddy.deskDoorWpName });
    plan.push.apply(plan, elevatorSeq(bf, f));
    plan.push({ type: "WALK_TO_WP", floor: f, wp: agent.deskDoorWpName });
    plan.push({ type: "WALK_TO_WP", floor: f, wp: agent.deskWpName });
    plan.push({ type: "SIT", floor: f, wp: agent.deskWpName });
    plan.push({ type: "ENTER_STATE", state: "AT_DESK" });
    plan.push({ type: "WAIT_SIM", minutes: 20 + simRandInt(40) });
    plan.push({ type: "PICK_NEXT_ACTIVITY" });
    return plan;
}

function planLeaveBuilding(agent) {
    const f = agent.homeFloor;
    const plan = [{ type: "STAND" }];
    plan.push({ type: "WALK_TO_WP", floor: f, wp: agent.deskDoorWpName });
    plan.push.apply(plan, elevatorSeq(f, 0));
    plan.push({ type: "WALK_TO_WP", floor: 0, wp: "lobby_center" });
    plan.push({ type: "WALK_TO_WP", floor: 0, wp: "entrance" });
    plan.push({ type: "WALK_TO_WP", floor: 0, wp: "front_door_threshold" });
    plan.push({ type: "WALK_TO_WP", floor: 0, wp: "outside" });
    plan.push({ type: "EXIT_BUILDING" });
    return plan;
}

function visitorExitChain() {
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
    const plan = [
        { type: "WALK_TO_WP", floor: 0, wp: "front_door_threshold" },
        { type: "WALK_TO_WP", floor: 0, wp: "entrance" },
        { type: "ENTER_STATE", state: "VISITING" }
    ];
    const r = Math.random();
    let activity = null;

    if (r < 0.10) {
        // Bistro table
        const chair = tryReserveSeat(agent, 0, lobby.bistroChairs);
        if (chair) {
            activity = [
                { type: "WALK_TO_WP", floor: 0, wp: chair },
                { type: "SIT", floor: 0, wp: chair },
                { type: "WAIT_SIM", minutes: 10 + simRandInt(16) },
                { type: "STAND" },
                { type: "RELEASE_SEAT", floor: 0, wp: chair }
            ];
        }
    } else if (r < 0.16) {
        // Cafe counter order
        activity = [
            { type: "WALK_TO_WP", floor: 0, wp: "cafe_order" },
            { type: "SIT", floor: 0, wp: "cafe_order" },
            { type: "WAIT_SIM", minutes: 3 + simRandInt(6) }
        ];
    } else if (r < 0.30) {
        // Front lounge
        const spot = tryReserveSeat(agent, 0, lobby.frontLoungeSpots);
        if (spot) {
            activity = [
                { type: "WALK_TO_WP", floor: 0, wp: spot },
                { type: "SIT", floor: 0, wp: spot },
                { type: "WAIT_SIM", minutes: 8 + simRandInt(13) },
                { type: "STAND" },
                { type: "RELEASE_SEAT", floor: 0, wp: spot }
            ];
        }
    } else if (r < 0.42) {
        // Back lounge or conversation pit
        const pool = lobby.backLoungeSpots.concat(lobby.pitSpots);
        const spot = tryReserveSeat(agent, 0, pool);
        if (spot) {
            activity = [
                { type: "WALK_TO_WP", floor: 0, wp: spot },
                { type: "SIT", floor: 0, wp: spot },
                { type: "WAIT_SIM", minutes: 8 + simRandInt(13) },
                { type: "STAND" },
                { type: "RELEASE_SEAT", floor: 0, wp: spot }
            ];
        }
    } else if (r < 0.52) {
        // Reception / kiosk / water cooler: stand briefly
        const wp = lobby.briefStandSpots[simRandInt(lobby.briefStandSpots.length)];
        activity = [
            { type: "WALK_TO_WP", floor: 0, wp: wp },
            { type: "SIT", floor: 0, wp: wp },
            { type: "WAIT_SIM", minutes: 3 + simRandInt(6) }
        ];
    } else if (r < 0.62) {
        // Lobby loiter
        const wp = lobby.loiterSpots[simRandInt(lobby.loiterSpots.length)];
        activity = [
            { type: "WALK_TO_WP", floor: 0, wp: wp },
            { type: "SIT", floor: 0, wp: wp },
            { type: "WAIT_SIM", minutes: 4 + simRandInt(9) }
        ];
    } else if (r < 0.77) {
        // Ride up to an office-floor lounge
        const mf = 1 + simRandInt(5);
        const spot = tryReserveSeat(agent, mf, world.floors[mf].loungeSpots);
        if (spot) {
            activity = elevatorSeq(0, mf);
            activity.push({ type: "WALK_TO_WP", floor: mf, wp: "lounge_door" });
            activity.push({ type: "SIT", floor: mf, wp: spot });
            activity.push({ type: "WAIT_SIM", minutes: 8 + simRandInt(11) });
            activity.push({ type: "STAND" });
            activity.push({ type: "RELEASE_SEAT", floor: mf, wp: spot });
            activity.push({ type: "WALK_TO_WP", floor: mf, wp: "lounge_door" });
            activity.push.apply(activity, elevatorSeq(mf, 0));
        }
    } else {
        // Sit in on a meeting (external attendee / client)
        const mf = 1 + simRandInt(5);
        const seat = tryReserveSeat(agent, mf, world.floors[mf].confSeats);
        if (seat) {
            activity = elevatorSeq(0, mf);
            activity.push({ type: "WALK_TO_WP", floor: mf, wp: "conf_door" });
            activity.push({ type: "SIT", floor: mf, wp: seat });
            activity.push({ type: "WAIT_SIM", minutes: 15 + simRandInt(21) });
            activity.push({ type: "STAND" });
            activity.push({ type: "RELEASE_SEAT", floor: mf, wp: seat });
            activity.push({ type: "WALK_TO_WP", floor: mf, wp: "conf_door" });
            activity.push.apply(activity, elevatorSeq(mf, 0));
        }
    }

    if (!activity) {
        // Fallback: loiter in the lobby
        const wp = lobby.loiterSpots[simRandInt(lobby.loiterSpots.length)];
        activity = [
            { type: "WALK_TO_WP", floor: 0, wp: wp },
            { type: "SIT", floor: 0, wp: wp },
            { type: "WAIT_SIM", minutes: 4 + simRandInt(9) }
        ];
    }

    plan.push.apply(plan, activity);
    plan.push.apply(plan, visitorExitChain());
    return plan;
}

function chooseNextActivity(agent) {
    if (Clock.simMinute >= agent.departureTime) {
        agent.leaving = true;
        return planLeaveBuilding(agent);
    }
    if (agent.plannedMeetingTimes.length > 0 && Clock.simMinute >= agent.plannedMeetingTimes[0]) {
        agent.plannedMeetingTimes.shift();
        return planAttendMeeting(agent);
    }
    if (!agent.hasLunched && Clock.simMinute >= agent.lunchTime) return planGoToLunch(agent);
    const roll = Math.random();
    if (roll < 0.14) return planAttendMeeting(agent);
    if (roll < 0.26) return planVisitLounge(agent);
    if (roll < 0.41) return planVisitCoworker(agent);
    return [
        { type: "WAIT_SIM", minutes: 18 + simRandInt(48) },
        { type: "PICK_NEXT_ACTIVITY" }
    ];
}

// ---------------------------------------------------------------------------
// Action execution
// ---------------------------------------------------------------------------

function startAction(agent, act) {
    switch (act.type) {
        case "WALK_TO_WP": {
            const fl = world.floors[act.floor];
            const startName = nearestNodeName(fl.nodes, agent.group.position);
            let path = bfsPath(fl.nodes, startName, act.wp);
            if (!path || path.length === 0) {
                path = [fl.nodes[act.wp].pos.clone()];
            }
            act.path = path;
            act.idx = 0;
            act._stallT = 0;
            act._prev = agent.group.position.clone();
            agent.group.position.y = act.floor * WORLD.FLOOR_HEIGHT;
            agent.currentFloor = act.floor;
            break;
        }
        case "WAIT_AT_PANEL":
            if (act.dir > 0) elevator.callUp(act.floor);
            else elevator.callDown(act.floor);
            agent.state = "WAITING_ELEVATOR";
            break;
        case "ENTER_ELEVATOR":
            act.phase = "reserve";
            act._spot = null;
            act._stallT = 0;
            break;
        case "PRESS_FLOOR":
            elevator.pressDestination(act.floor);
            break;
        case "EXIT_ELEVATOR":
            elevator.registerDisembark(agent);
            act.phase = "reparent";
            break;
        case "SIT": {
            const fl = world.floors[act.floor];
            const st = fl.sitTargets[act.wp];
            const np = fl.nodes[act.wp].pos;
            let px = np.x;
            let pz = np.z;
            if (!st.sit) {
                // Standing waypoint: jitter so two agents don't share one point
                const ang = Math.random() * Math.PI * 2;
                const rad = 0.35 + Math.random() * 0.4;
                px += Math.cos(ang) * rad;
                pz += Math.sin(ang) * rad;
            }
            agent.group.position.set(px, act.floor * WORLD.FLOOR_HEIGHT - (st.sit ? 0.35 : 0), pz);
            agent.group.rotation.y = st.facing;
            agent.group.userData.isSitting = st.sit;
            agent.group.userData.isWalking = false;
            agent.group.userData.walkPhase = 0;
            break;
        }
        case "STAND":
            agent.group.userData.isSitting = false;
            if (agent.group.parent === elevator.carGroup) {
                agent.group.position.y = 0;
            }
            // Outside the car keep the current y: a standing agent already
            // stands on their floor, and only SIT ever lowers the body.
            break;
        case "RELEASE_SEAT":
            releaseSeatKey(agent, act.floor, act.wp);
            break;
        case "WAIT_SIM":
            act.untilMin = Clock.simMinute + act.minutes;
            break;
        case "ENTER_STATE":
            agent.state = act.state;
            break;
        case "MARK_LUNCHED":
            agent.hasLunched = true;
            break;
        case "EXIT_BUILDING":
            if (agent.group.parent) agent.group.parent.remove(agent.group);
            agent.state = "GONE";
            break;
        case "PICK_NEXT_ACTIVITY":
            agent.plan = chooseNextActivity(agent);
            break;
        default:
            break;
    }
}

function updateWalk(agent, act, dt) {
    if (act.idx >= act.path.length) return true;
    const pos = agent.group.position;
    const target = act.path[act.idx];
    const dx = target.x - pos.x;
    const dz = target.z - pos.z;
    const dist = Math.hypot(dx, dz);
    const step = WALK_SPEED * dt;
    if (dist <= step) {
        pos.x = target.x;
        pos.z = target.z;
        act.idx++;
        act._stallT = 0;
        act._prev.copy(pos);
        return act.idx >= act.path.length;
    }
    pos.x += (dx / dist) * step;
    pos.z += (dz / dist) * step;
    agent.group.rotation.y = Math.atan2(dx, dz);
    agent.group.userData.isWalking = true;
    const moved = Math.hypot(pos.x - act._prev.x, pos.z - act._prev.z);
    act._stallT = moved < 0.005 ? act._stallT + dt : 0;
    act._prev.copy(pos);
    if (act._stallT > 1.2) {
        // Blocked too long: skip this waypoint instead of twitching forever
        act.idx++;
        act._stallT = 0;
    }
    return false;
}

function updateEnterElevator(agent, act, dt) {
    const fromY = act.floor * WORLD.FLOOR_HEIGHT;
    if (act.phase === "reserve") {
        if (elevator.state !== "DOOR_OPEN" || elevator.currentFloor !== act.floor) {
            // The car slipped away: re-press the call and wait again.
            if (act.dir > 0) elevator.callUp(act.floor);
            else elevator.callDown(act.floor);
            agent.currentAction = {
                type: "WAIT_AT_PANEL",
                floor: act.floor,
                dir: act.dir,
                toFloor: act.toFloor
            };
            startAction(agent, agent.currentAction);
            return false;
        }
        if (!act._spot) {
            act._spot = elevator.reserveBoardingSpot(agent);
            if (!act._spot) return false;
            agent._carSpot = act._spot;
        }
        act.phase = "walkToDoor";
        act._stallT = 0;
        act._prev = agent.group.position.clone();
        return false;
    }
    // If the doors were forced closed mid-boarding, bail out and requeue.
    if (elevator.state !== "DOOR_OPEN" && elevator.state !== "DOOR_CLOSING") {
        scene.attach(agent.group);
        agent.group.position.set(0.8, fromY, 2.8);
        agent.group.userData.isSitting = false;
        if (act.dir > 0) elevator.callUp(act.floor);
        else elevator.callDown(act.floor);
        agent.currentAction = {
            type: "WAIT_AT_PANEL",
            floor: act.floor,
            dir: act.dir,
            toFloor: act.toFloor
        };
        startAction(agent, agent.currentAction);
        return false;
    }
    if (act.phase === "walkToDoor") {
        const pos = agent.group.position;
        // Each boarder lanes toward their own spot's X, not the door center
        const tx = act._spot.x;
        const tz = 2.3;
        const dx = tx - pos.x;
        const dz = tz - pos.z;
        const dist = Math.hypot(dx, dz);
        const step = WALK_SPEED * dt;
        if (dist <= step) {
            pos.set(tx, fromY, tz);
            elevator.carGroup.attach(agent.group);
            act.phase = "inside";
            return false;
        }
        pos.x += (dx / dist) * step;
        pos.z += (dz / dist) * step;
        agent.group.rotation.y = Math.atan2(dx, dz);
        agent.group.userData.isWalking = true;
        const moved = Math.hypot(pos.x - act._prev.x, pos.z - act._prev.z);
        act._stallT = moved < 0.005 ? act._stallT + dt : 0;
        act._prev.copy(pos);
        if (act._stallT > 1.5) {
            // Crowded lobby: force-complete to the threshold
            pos.set(tx, fromY, tz);
            elevator.carGroup.attach(agent.group);
            act.phase = "inside";
        }
        return false;
    }
    // phase "inside": walk to the reserved spot in car-local space
    const posL = agent.group.position;
    const dx = act._spot.x - posL.x;
    const dz = act._spot.z - posL.z;
    const dist = Math.hypot(dx, dz);
    const step = WALK_SPEED * dt;
    if (dist <= step || dist < 0.03) {
        posL.set(act._spot.x, 0, act._spot.z);
        elevator.completeBoard(agent);
        agent.group.rotation.y = 0; // face the doors
        agent.group.userData.isWalking = false;
        agent.state = "IN_CAR";
        return true;
    }
    posL.x += (dx / dist) * step;
    posL.z += (dz / dist) * step;
    agent.group.rotation.y = Math.atan2(dx, dz);
    agent.group.userData.isWalking = true;
    return false;
}

function updateExitElevator(agent, act, dt) {
    if (act.phase === "reparent") {
        scene.attach(agent.group); // preserve world position
        act.phase = "walkOut";
        act._tx = agent._carSpot ? agent._carSpot.x : 0;
        act._tz = 2.7;
        return false;
    }
    const pos = agent.group.position;
    const ty = act.toFloor * WORLD.FLOOR_HEIGHT;
    const dx = act._tx - pos.x;
    const dz = act._tz - pos.z;
    const dist = Math.hypot(dx, dz);
    const step = WALK_SPEED * dt;
    // dist === 0 also covers large-step overshoot: the exit completes anyway.
    if (dist <= step || dist < 0.35) {
        pos.set(act._tx, ty, act._tz);
        elevator.completeDisembark(agent);
        agent.currentFloor = act.toFloor;
        agent.state = "ON_FLOOR";
        return true;
    }
    pos.x += (dx / dist) * step;
    pos.z += (dz / dist) * step;
    pos.y = ty;
    agent.group.rotation.y = Math.atan2(dx, dz);
    agent.group.userData.isWalking = true;
    return false;
}

function updateAction(agent, act, dt) {
    switch (act.type) {
        case "WALK_TO_WP":
            return updateWalk(agent, act, dt);
        case "WAIT_AT_PANEL":
            // Re-press every frame in case another cycle cleared the call
            if (act.dir > 0) elevator.callUp(act.floor);
            else elevator.callDown(act.floor);
            return elevator.isAcceptingAt(act.floor, act.dir) && elevator.currentCapacityFree() > 0;
        case "ENTER_ELEVATOR":
            return updateEnterElevator(agent, act, dt);
        case "PRESS_FLOOR":
            return true;
        case "WAIT_FOR_FLOOR":
            return elevator.state === "DOOR_OPEN" && elevator.currentFloor === act.floor;
        case "EXIT_ELEVATOR":
            return updateExitElevator(agent, act, dt);
        case "WAIT_SIM":
            return Clock.simMinute >= act.untilMin;
        default:
            return true; // zero-duration bookkeeping actions
    }
}

function runAgentPlan(agent, motionDt) {
    let iter = 0;
    while (iter < 16) {
        iter++;
        if (!agent.currentAction) {
            if (agent.plan.length === 0) break;
            agent.currentAction = agent.plan.shift();
            startAction(agent, agent.currentAction);
        }
        const done = updateAction(agent, agent.currentAction, motionDt);
        if (done) {
            agent.currentAction = null;
            continue; // hand off to the next action within the same frame
        }
        break;
    }
}

// ---------------------------------------------------------------------------
// Crowd separation
// ---------------------------------------------------------------------------

function applyCollisions() {
    const active = [];
    for (let i = 0; i < agents.length; i++) {
        const a = agents[i];
        if (!a.group || !a.group.parent) continue;
        if (a.state === "GONE" || a.state === "DISABLED" || a.state === "AWAY") continue;
        active.push(a);
    }
    for (let i = 0; i < active.length; i++) {
        const A = active[i];
        if (A.group.userData.isSitting) continue;
        if (A.group.parent === elevator.carGroup) continue;
        const ca = A.currentAction;
        const aBoarding = ca && ca.type === "ENTER_ELEVATOR";
        for (let j = i + 1; j < active.length; j++) {
            const B = active[j];
            if (B.group.userData.isSitting) continue;
            if (B.group.parent !== A.group.parent) continue;
            if (B.group.parent === elevator.carGroup) continue;
            if (A._doorExempt || B._doorExempt) continue;
            const cb = B.currentAction;
            if (aBoarding || (cb && cb.type === "ENTER_ELEVATOR")) continue;
            const pa = A.group.position;
            const pb = B.group.position;
            const dy = pa.y - pb.y;
            if (dy > 1 || dy < -1) continue;
            let dx = pa.x - pb.x;
            let dz = pa.z - pb.z;
            let d = Math.hypot(dx, dz);
            if (d >= 0.7) continue;
            if (d < 0.001) {
                // Exact overlap: pick a random separation axis
                const ang = Math.random() * Math.PI * 2;
                dx = Math.cos(ang);
                dz = Math.sin(ang);
                d = 1;
            } else {
                dx /= d;
                dz /= d;
            }
            const push = (0.7 - d) * 0.18 * 0.5;
            pa.x += dx * push;
            pa.z += dz * push;
            pb.x -= dx * push;
            pb.z -= dz * push;
        }
    }
}

// ---------------------------------------------------------------------------
// Top-up scheduler + occupancy control + day wrap
// ---------------------------------------------------------------------------

function countPresent() {
    let n = 0;
    for (let i = 0; i < agents.length; i++) {
        const s = agents[i].state;
        if (s !== "DISABLED" && s !== "AWAY" && s !== "GONE") n++;
    }
    return n;
}

function topUpVisitors() {
    const t = Clock.simMinute;
    if (t < 7 * 60 + 45 || t > 18 * 60 + 30) return;
    let deficit = targetOccupancy - countPresent();
    if (deficit <= 0) return;
    for (let i = 0; i < agents.length && deficit > 0; i++) {
        const a = agents[i];
        if (a.role !== "VISITOR") continue;
        if (a.state === "AWAY" || a.state === "GONE") {
            a.arrivalTime = Clock.simMinute + simRandInt(7);
            a.state = "AWAY";
            deficit--;
        }
    }
}

function applyOccupancy() {
    for (let i = 0; i < agents.length; i++) {
        const a = agents[i];
        if (a.id < targetOccupancy) {
            if (a.state === "DISABLED") {
                rollSchedule(a);
                a.state = "AWAY";
            }
        } else if (a.state === "AWAY") {
            a.state = "DISABLED";
        }
        // Agents mid-day keep running; they park on the next day wrap.
    }
}

function resetDay() {
    elevator.reset();
    seatReservations.clear();
    for (let i = 0; i < agents.length; i++) {
        const a = agents[i];
        releaseAllSeats(a);
        if (a.group) {
            if (a.group.parent) a.group.parent.remove(a.group);
            a.group.userData.isSitting = false;
            a.group.userData.isWalking = false;
        }
        a._doorExempt = false;
        a._carSpot = null;
        a.currentFloor = 0;
        if (a.id < targetOccupancy) {
            rollSchedule(a);
            a.state = "AWAY";
        } else {
            a.plan = [];
            a.currentAction = null;
            a.state = "DISABLED";
        }
    }
}

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------

function buildHUD() {
    const hud = document.createElement("div");
    hud.style.cssText = "position:fixed;top:10px;left:10px;z-index:10;background:rgba(10,14,20,0.72);" +
        "color:#dfe8ff;font:12px/1.5 monospace;padding:10px 12px;border-radius:8px;min-width:250px;user-select:none;";
    hud.innerHTML =
        '<div id="hudTime" style="font-size:22px;font-weight:bold;color:#ffbb22;"></div>' +
        '<div style="margin-top:6px;">Speed ' +
        '<input id="hudSpeed" type="range" min="0" max="' + (SPEED_STOPS.length - 1) + '" step="1" value="7" ' +
        'style="width:110px;vertical-align:middle;"> <span id="hudSpeedVal"></span></div>' +
        '<div style="margin-top:4px;">Occupancy: <span id="hudOccVal"></span><br>' +
        '<input id="hudOcc" type="range" min="1" max="' + MAX_OCCUPANCY + '" step="1" value="' +
        DEFAULT_OCCUPANCY + '" style="width:170px;"></div>' +
        '<div id="hudStates" style="margin-top:6px;white-space:pre;"></div>' +
        '<div id="hudElev" style="margin-top:6px;color:#9fd0ff;white-space:pre;"></div>';
    document.body.appendChild(hud);

    document.getElementById("hudSpeed").addEventListener("input", (event) => {
        Clock.timeScale = SPEED_STOPS[parseInt(event.target.value, 10)];
    });
    document.getElementById("hudOcc").addEventListener("input", (event) => {
        targetOccupancy = parseInt(event.target.value, 10);
        applyOccupancy();
    });
}

function setToString(set) {
    const arr = [];
    set.forEach(function (v) { arr.push(v); });
    arr.sort(function (a, b) { return a - b; });
    return arr.join(",");
}

function updateHUD(realDt) {
    hudAccum += realDt;
    if (hudAccum < 0.25) return;
    hudAccum = 0;

    document.getElementById("hudTime").textContent = Clock.format();
    document.getElementById("hudSpeedVal").textContent = Clock.timeScale + "x";
    document.getElementById("hudOccVal").textContent = targetOccupancy + " / " + MAX_OCCUPANCY + " people";

    const counts = {};
    for (let i = 0; i < agents.length; i++) {
        const s = agents[i].state;
        if (s === "DISABLED") continue;
        counts[s] = (counts[s] || 0) + 1;
    }
    let stateText = "";
    for (const key in counts) {
        stateText += key.padEnd(17, " ") + counts[key] + "\n";
    }
    document.getElementById("hudStates").textContent = stateText;

    const dirChar = elevator.direction > 0 ? "^" : (elevator.direction < 0 ? "v" : "-");
    document.getElementById("hudElev").textContent =
        "Elevator  floor " + elevator.currentFloor + " " + dirChar +
        "  " + elevator.state + "\n" +
        "pax " + elevator.passengers.size + "/4" +
        "  boarding " + elevator.pendingBoarders.size + "\n" +
        "dest {" + setToString(elevator.destinations) + "}" +
        "  up {" + setToString(elevator.upCalls) + "}" +
        "  down {" + setToString(elevator.downCalls) + "}";
}

// ---------------------------------------------------------------------------
// Render loop + startup
// ---------------------------------------------------------------------------

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
    buildHUD();

    window.addEventListener("resize", () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    function simulateAgents(sdt) {
        for (let i = 0; i < agents.length; i++) {
            const a = agents[i];
            if (a.state === "DISABLED" || a.state === "GONE") continue;
            if (a.state === "AWAY") {
                if (Clock.simMinute >= a.arrivalTime) spawnAgent(a);
                continue;
            }
            if (!a.group) continue;

            // End-of-day override for workers still on a surface state.
            // The leaving flag is sticky: transit actions flip the state
            // through ON_FLOOR / IN_CAR mid-sequence, and re-firing the
            // override there loops the worker up and down forever.
            if (a.role === "WORKER" && Clock.simMinute >= a.departureTime &&
                !a.leaving && SURFACE_STATES.has(a.state)) {
                a.leaving = true;
                releaseAllSeats(a);
                a._doorExempt = true;
                a.state = "LEAVING";
                a.plan = planLeaveBuilding(a);
                a.currentAction = null; // abort any in-flight WAIT_SIM etc.
            }

            // Entrance exemption ends once the agent clears the threshold
            if (a._doorExempt && a.state === "ARRIVING" &&
                a.group.parent === scene && a.group.position.z < 8.8) {
                a._doorExempt = false;
            }

            a.group.userData.isWalking = false;
            runAgentPlan(a, sdt);
        }
    }

    function animate() {
        requestAnimationFrame(animate);
        const realDt = Math.min(0.05, Clock.getDelta());
        Clock.tick(realDt);
        updateLighting();

        const motionDt = realDt * Clock.timeScale;
        topUpVisitors();

        // Fixed substeps keep the elevator and agent dispatch interleaved in
        // lockstep: agents must sample the door state several times per
        // door-open window or boarding becomes a lottery at high speeds.
        const stepCount = Math.min(1000, Math.max(1, Math.ceil(motionDt / 0.25)));
        const sdt = motionDt / stepCount;
        for (let s = 0; s < stepCount; s++) {
            elevator.tick(sdt);
            simulateAgents(sdt);
        }

        applyCollisions();

        for (let i = 0; i < agents.length; i++) {
            const a = agents[i];
            if (a.group && a.group.parent) animatePersonWalking(a.group, motionDt);
        }

        controls.update();
        renderer.render(scene, camera);
        updateHUD(realDt);
    }
    animate();
}

window.Clock = Clock;
window.startSimulation = startSimulation;

if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", startSimulation);
} else {
    startSimulation();
}
