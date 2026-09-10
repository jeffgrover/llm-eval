// sim.js - simulated clock, day/night lighting, agent state machine + daily schedules,
// render loop, and HUD. Loaded last; depends on person.js, world.js, elevator_logic.js.

const MAX_WORKERS = 20;
const MAX_VISITORS = 80;
const MAX_OCCUPANCY = MAX_WORKERS + MAX_VISITORS;
const DEFAULT_OCCUPANCY = 45;
const MEETING_PROB = 0.36;
const WALK_SPEED = 1.35;
const SPEED_STOPS = [1, 2, 5, 10, 20, 40, 60, 90, 120, 200, 350, 600];
const FIRST_NAMES = ['Ava', 'Ben', 'Cleo', 'Dana', 'Eli', 'Fay', 'Gus', 'Hana', 'Ike',
    'Jo', 'Kira', 'Liam', 'Mia', 'Nico', 'Otto', 'Pia', 'Quinn', 'Rosa', 'Sam', 'Tess',
    'Umar', 'Vera', 'Wade', 'Xena', 'Yuri', 'Zoe', 'Leo', 'Nora', 'Owen', 'Pria'];

const ACTIVE_STATES = ['ARRIVING', 'WAITING_ELEVATOR', 'IN_CAR', 'ON_FLOOR', 'AT_DESK',
    'IN_MEETING', 'AT_BREAK', 'AT_LUNCH', 'VISITING', 'LEAVING'];
const ENTRANCE_WPS = ['outside', 'front_door_threshold', 'entrance'];
const BLOCKING_ELEV_ACTIONS = ['WAIT_AT_PANEL', 'ENTER_ELEVATOR', 'WAIT_FOR_FLOOR', 'EXIT_ELEVATOR'];
const CONF_SEATS = ['conf_seat0', 'conf_seat1', 'conf_seat2', 'conf_seat3'];
const LOUNGE_SEATS = ['lounge_spot0', 'lounge_spot1', 'lounge_spot2'];
const BISTRO_SEATS = ['bistro0_S', 'bistro0_N', 'bistro1_S', 'bistro1_N',
    'bistro2_S', 'bistro2_N', 'bistro3_S', 'bistro3_N'];
const BACK_SEATS = ['back_lounge_N', 'back_lounge_S', 'pit_N', 'pit_S', 'pit_E', 'pit_W'];

// day/night keyframes: long flat daytime, narrow golden hours at dawn/dusk,
// and a night that stays readable (ambient ~0.45, hemi ~0.32)
const DAY_KFS = [
    { h: 0.0, bg: 0x0a0d16, sun: 0x334466, sunI: 0.06, amb: 0.45, hemi: 0.32 },
    { h: 5.4, bg: 0x0a0d16, sun: 0x334466, sunI: 0.06, amb: 0.45, hemi: 0.32 },
    { h: 6.0, bg: 0x59405c, sun: 0xff9a4d, sunI: 0.50, amb: 0.50, hemi: 0.40 },
    { h: 6.7, bg: 0x8fb0dd, sun: 0xffd9a0, sunI: 0.85, amb: 0.58, hemi: 0.50 },
    { h: 8.5, bg: 0xa5c8ee, sun: 0xfff2d8, sunI: 0.95, amb: 0.62, hemi: 0.55 },
    { h: 12.5, bg: 0xaed6f7, sun: 0xffffff, sunI: 1.00, amb: 0.65, hemi: 0.58 },
    { h: 16.5, bg: 0xa5c8ee, sun: 0xffe9c0, sunI: 0.92, amb: 0.62, hemi: 0.55 },
    { h: 17.7, bg: 0x7a5570, sun: 0xff8c3a, sunI: 0.50, amb: 0.52, hemi: 0.42 },
    { h: 18.7, bg: 0x232a3d, sun: 0x556688, sunI: 0.12, amb: 0.46, hemi: 0.34 },
    { h: 19.8, bg: 0x0a0d16, sun: 0x334466, sunI: 0.06, amb: 0.45, hemi: 0.32 },
    { h: 24.0, bg: 0x0a0d16, sun: 0x334466, sunI: 0.06, amb: 0.45, hemi: 0.32 }
];

let simScene, simCamera, simRenderer, simControls, simWorld, simElevator;
let simSun, simAmb, simHemi;
let simClock = null;
let simFrameClock = null;
let simAgents = [];
let simSeatReservations = new Set();
let simTargetOccupancy = DEFAULT_OCCUPANCY;
let simHudTime, simHudStates, simHudElevator;
let simHudSpeedLabel, simHudSpeedSlider, simHudOccSlider, simHudOccLabel;
let simLastHudT = 0;
let simPrevT = 0;

// ---------- small helpers ----------

function randInt(a, b) {
    return a + Math.floor(Math.random() * (b - a + 1));
}

function pickFrom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function absMinutes() {
    return simClock.day * 24 * 60 + simClock.simMinute;
}

// Simulated clock: pure real-time multiplier so motion, elevator cycles and the
// clock all advance in lockstep (motionDt = realDt * timeScale).
class Clock {
    constructor() {
        this.simMinute = 7 * 60 + 30;
        this.timeScale = 120;
        this.day = 1;
    }
    tick(realDt) {
        this.simMinute += realDt * this.timeScale / 60;
        if (this.simMinute >= 24 * 60) {
            this.simMinute -= 24 * 60;
            this.day += 1;
            return true;
        }
        return false;
    }
    format() {
        const total = Math.floor(this.simMinute);
        const h24 = Math.floor(total / 60) % 24;
        const m = total % 60;
        const h12 = (h24 % 12) === 0 ? 12 : (h24 % 12);
        const ampm = h24 < 12 ? 'AM' : 'PM';
        return ' ' + h12 + ':' + (m < 10 ? '0' : '') + m + ' ' + ampm;
    }
}

// ---------- agents ----------

function makeAgent(id, role) {
    const agent = {
        id: id,
        role: role,
        name: FIRST_NAMES[id % FIRST_NAMES.length],
        group: createPerson({}),
        homeFloor: null,
        deskId: null,
        deskWpName: null,
        deskDoorWpName: null,
        arrivalTime: 8 * 60,
        lunchTime: 12 * 60,
        lunchDuration: 30,
        departureTime: 17 * 60,
        plannedMeetingTimes: [],
        hasLunched: false,
        visitDuration: 20,
        state: 'DISABLED',
        plan: [],
        currentAction: null,
        floor: 0,
        lastWp: 'outside',
        inCar: false,
        seatReservation: null,
        leavingPlanned: false,
        waitUntilAbs: 0,
        path: [],
        pathIdx: 0,
        _stallT: 0,
        _prevX: 0,
        _prevZ: 0
    };
    if (role === 'WORKER') {
        agent.deskId = id;
        agent.homeFloor = 1 + Math.floor(id / 4);
        const letter = ['A', 'B', 'C', 'D'][id % 4];
        agent.deskWpName = 'office' + letter + '_desk';
        agent.deskDoorWpName = 'office' + letter + '_door';
    }
    return agent;
}

function rollDailySchedule(agent) {
    if (agent.role === 'WORKER') {
        agent.arrivalTime = randInt(8 * 60 + 15, 9 * 60 + 30);
        agent.lunchTime = randInt(11 * 60 + 30, 13 * 60 + 30);
        agent.lunchDuration = randInt(25, 60);
        agent.departureTime = Math.random() < 0.15
            ? randInt(18 * 60 + 30, 19 * 60 + 45)
            : randInt(16 * 60 + 45, 18 * 60 + 30);
        agent.plannedMeetingTimes = [];
        if (Math.random() < 0.55) agent.plannedMeetingTimes.push(randInt(10 * 60, 11 * 60 + 30));
        if (Math.random() < 0.55) agent.plannedMeetingTimes.push(randInt(14 * 60, 16 * 60));
        agent.plannedMeetingTimes.sort(function (a, b) { return a - b; });
    } else {
        agent.visitDuration = randInt(15, 60);
        agent.arrivalTime = 7 * 60 + 30 + randInt(0, 240);
    }
    agent.hasLunched = false;
}

function countPresent() {
    let n = 0;
    for (let i = 0; i < simAgents.length; i++) {
        if (ACTIVE_STATES.indexOf(simAgents[i].state) >= 0) n += 1;
    }
    return n;
}

// ---------- seats ----------

function pickFreeSeat(floor, wpNames) {
    const free = [];
    for (let i = 0; i < wpNames.length; i++) {
        if (!simSeatReservations.has(floor + ':' + wpNames[i])) free.push(wpNames[i]);
    }
    if (!free.length) return null;
    const wp = pickFrom(free);
    const key = floor + ':' + wp;
    simSeatReservations.add(key);
    return { wp: wp, key: key };
}

// ---------- primitive action shorthands ----------

function walkAct(floor, wp) {
    return { type: 'WALK_TO_WP', floor: floor, wp: wp };
}

function sitAct(floor, wp) {
    return { type: 'SIT', floor: floor, wp: wp };
}

function planRide(fromFloor, toFloor) {
    if (fromFloor === toFloor) return [];
    const dir = toFloor > fromFloor ? 1 : -1;
    return [
        walkAct(fromFloor, 'elevWait'),
        { type: 'WAIT_AT_PANEL', floor: fromFloor, dir: dir, toFloor: toFloor },
        { type: 'ENTER_ELEVATOR', floor: fromFloor, dir: dir, toFloor: toFloor },
        { type: 'PRESS_FLOOR', floor: toFloor },
        { type: 'WAIT_FOR_FLOOR', floor: toFloor },
        { type: 'EXIT_ELEVATOR', toFloor: toFloor }
    ];
}

// ---------- goal -> plan compilers ----------

function planArriveToDesk(agent) {
    const acts = [
        { type: 'ENTER_STATE', state: 'ARRIVING' },
        walkAct(0, 'front_door_threshold'),
        walkAct(0, 'entrance'),
        walkAct(0, 'lobby_center')
    ];
    Array.prototype.push.apply(acts, planRide(0, agent.homeFloor));
    acts.push(walkAct(agent.homeFloor, agent.deskDoorWpName));
    acts.push(walkAct(agent.homeFloor, agent.deskWpName));
    acts.push(sitAct(agent.homeFloor, agent.deskWpName));
    acts.push({ type: 'ENTER_STATE', state: 'AT_DESK' });
    acts.push({ type: 'WAIT_SIM', minutes: randInt(35, 90) });
    acts.push({ type: 'PICK_NEXT_ACTIVITY' });
    return acts;
}

function planGoToLunch(agent) {
    const f = agent.homeFloor;
    const acts = [
        { type: 'STAND' },
        { type: 'ENTER_STATE', state: 'ON_FLOOR' },
        walkAct(f, agent.deskDoorWpName)
    ];
    Array.prototype.push.apply(acts, planRide(f, 0));
    const seat = pickFreeSeat(0, BISTRO_SEATS);
    if (seat) {
        acts.push(walkAct(0, seat.wp));
        acts.push(sitAct(0, seat.wp));
        acts.push({ type: 'ENTER_STATE', state: 'AT_LUNCH' });
        acts.push({ type: 'WAIT_SIM', minutes: agent.lunchDuration });
        acts.push({ type: 'STAND' });
        acts.push({ type: 'RELEASE_SEAT' });
    } else {
        acts.push(walkAct(0, 'cafe_order'));
        acts.push(sitAct(0, 'cafe_order'));
        acts.push({ type: 'ENTER_STATE', state: 'AT_LUNCH' });
        acts.push({ type: 'WAIT_SIM', minutes: agent.lunchDuration });
        acts.push({ type: 'STAND' });
    }
    acts.push({ type: 'MARK_LUNCHED' });
    Array.prototype.push.apply(acts, planRide(0, f));
    acts.push(walkAct(f, agent.deskDoorWpName));
    acts.push(walkAct(f, agent.deskWpName));
    acts.push(sitAct(f, agent.deskWpName));
    acts.push({ type: 'ENTER_STATE', state: 'AT_DESK' });
    acts.push({ type: 'WAIT_SIM', minutes: randInt(15, 40) });
    acts.push({ type: 'PICK_NEXT_ACTIVITY' });
    return acts;
}

function planVisitLounge(agent) {
    const f = agent.homeFloor;
    const acts = [
        { type: 'STAND' },
        { type: 'ENTER_STATE', state: 'ON_FLOOR' },
        walkAct(f, agent.deskDoorWpName)
    ];
    const seat = pickFreeSeat(f, LOUNGE_SEATS);
    if (seat) {
        acts.push(walkAct(f, seat.wp));
        acts.push(sitAct(f, seat.wp));
        acts.push({ type: 'ENTER_STATE', state: 'AT_BREAK' });
        acts.push({ type: 'WAIT_SIM', minutes: randInt(5, 12) });
        acts.push({ type: 'STAND' });
        acts.push({ type: 'RELEASE_SEAT' });
    } else {
        acts.push(walkAct(f, 'water_cooler'));
        acts.push(sitAct(f, 'water_cooler'));
        acts.push({ type: 'ENTER_STATE', state: 'AT_BREAK' });
        acts.push({ type: 'WAIT_SIM', minutes: randInt(4, 8) });
        acts.push({ type: 'STAND' });
    }
    acts.push(walkAct(f, agent.deskDoorWpName));
    acts.push(walkAct(f, agent.deskWpName));
    acts.push(sitAct(f, agent.deskWpName));
    acts.push({ type: 'ENTER_STATE', state: 'AT_DESK' });
    acts.push({ type: 'WAIT_SIM', minutes: randInt(18, 55) });
    acts.push({ type: 'PICK_NEXT_ACTIVITY' });
    return acts;
}

function planAttendMeeting(agent) {
    const fl = Math.random() < 0.65 ? agent.homeFloor : randInt(1, 5);
    const seat = pickFreeSeat(fl, CONF_SEATS);
    if (!seat) return planVisitLounge(agent);
    const acts = [
        { type: 'STAND' },
        { type: 'ENTER_STATE', state: 'ON_FLOOR' },
        walkAct(agent.homeFloor, agent.deskDoorWpName)
    ];
    Array.prototype.push.apply(acts, planRide(agent.homeFloor, fl));
    acts.push(walkAct(fl, seat.wp));
    acts.push(sitAct(fl, seat.wp));
    acts.push({ type: 'ENTER_STATE', state: 'IN_MEETING' });
    acts.push({ type: 'WAIT_SIM', minutes: randInt(22, 45) });
    acts.push({ type: 'STAND' });
    acts.push({ type: 'RELEASE_SEAT' });
    Array.prototype.push.apply(acts, planRide(fl, agent.homeFloor));
    acts.push(walkAct(agent.homeFloor, agent.deskDoorWpName));
    acts.push(walkAct(agent.homeFloor, agent.deskWpName));
    acts.push(sitAct(agent.homeFloor, agent.deskWpName));
    acts.push({ type: 'ENTER_STATE', state: 'AT_DESK' });
    acts.push({ type: 'WAIT_SIM', minutes: randInt(15, 45) });
    acts.push({ type: 'PICK_NEXT_ACTIVITY' });
    return acts;
}

function planVisitCoworker(agent) {
    const others = [];
    for (let i = 0; i < simAgents.length; i++) {
        const o = simAgents[i];
        if (o !== agent && o.role === 'WORKER' && o.state === 'AT_DESK') others.push(o);
    }
    if (!others.length) {
        return [
            { type: 'WAIT_SIM', minutes: randInt(8, 20) },
            { type: 'PICK_NEXT_ACTIVITY' }
        ];
    }
    const target = pickFrom(others);
    const f = agent.homeFloor;
    const acts = [
        { type: 'STAND' },
        { type: 'ENTER_STATE', state: 'ON_FLOOR' },
        walkAct(f, agent.deskDoorWpName)
    ];
    Array.prototype.push.apply(acts, planRide(f, target.homeFloor));
    acts.push(walkAct(target.homeFloor, target.deskDoorWpName));
    acts.push(sitAct(target.homeFloor, target.deskDoorWpName));
    acts.push({ type: 'ENTER_STATE', state: 'VISITING' });
    acts.push({ type: 'WAIT_SIM', minutes: randInt(6, 18) });
    Array.prototype.push.apply(acts, planRide(target.homeFloor, f));
    acts.push(walkAct(f, agent.deskDoorWpName));
    acts.push(walkAct(f, agent.deskWpName));
    acts.push(sitAct(f, agent.deskWpName));
    acts.push({ type: 'ENTER_STATE', state: 'AT_DESK' });
    acts.push({ type: 'WAIT_SIM', minutes: randInt(15, 45) });
    acts.push({ type: 'PICK_NEXT_ACTIVITY' });
    return acts;
}

function planLeaveBuilding(agent) {
    const f = agent.floor;
    const acts = [
        { type: 'STAND' },
        { type: 'RELEASE_SEAT' },
        { type: 'ENTER_STATE', state: 'LEAVING' }
    ];
    if (f > 0 && agent.deskDoorWpName) acts.push(walkAct(f, agent.deskDoorWpName));
    Array.prototype.push.apply(acts, planRide(f, 0));
    acts.push(walkAct(0, 'lobby_center'));
    acts.push(walkAct(0, 'entrance'));
    acts.push(walkAct(0, 'front_door_threshold'));
    acts.push(walkAct(0, 'outside'));
    acts.push({ type: 'EXIT_BUILDING' });
    return acts;
}

function planVisitorVisit(agent) {
    const acts = [
        walkAct(0, 'front_door_threshold'),
        walkAct(0, 'entrance')
    ];
    const roll = Math.random();
    if (roll < 0.10) {
        const seat = pickFreeSeat(0, BISTRO_SEATS);
        if (seat) {
            acts.push(walkAct(0, seat.wp), sitAct(0, seat.wp),
                { type: 'ENTER_STATE', state: 'VISITING' },
                { type: 'WAIT_SIM', minutes: randInt(8, 22) },
                { type: 'STAND' }, { type: 'RELEASE_SEAT' });
        } else {
            acts.push(walkAct(0, 'cafe_order'), sitAct(0, 'cafe_order'),
                { type: 'ENTER_STATE', state: 'VISITING' },
                { type: 'WAIT_SIM', minutes: randInt(4, 10) }, { type: 'STAND' });
        }
    } else if (roll < 0.16) {
        acts.push(walkAct(0, 'cafe_order'), sitAct(0, 'cafe_order'),
            { type: 'ENTER_STATE', state: 'VISITING' },
            { type: 'WAIT_SIM', minutes: randInt(3, 8) }, { type: 'STAND' });
    } else if (roll < 0.30) {
        const seat = pickFreeSeat(0, LOUNGE_SEATS);
        if (seat) {
            acts.push(walkAct(0, seat.wp), sitAct(0, seat.wp),
                { type: 'ENTER_STATE', state: 'VISITING' },
                { type: 'WAIT_SIM', minutes: randInt(8, 20) },
                { type: 'STAND' }, { type: 'RELEASE_SEAT' });
        } else {
            acts.push(walkAct(0, 'lobby_stand_center'), sitAct(0, 'lobby_stand_center'),
                { type: 'ENTER_STATE', state: 'VISITING' },
                { type: 'WAIT_SIM', minutes: randInt(5, 12) }, { type: 'STAND' });
        }
    } else if (roll < 0.42) {
        const seat = pickFreeSeat(0, BACK_SEATS);
        if (seat) {
            acts.push(walkAct(0, seat.wp), sitAct(0, seat.wp),
                { type: 'ENTER_STATE', state: 'VISITING' },
                { type: 'WAIT_SIM', minutes: randInt(8, 18) },
                { type: 'STAND' }, { type: 'RELEASE_SEAT' });
        } else {
            acts.push(walkAct(0, 'lobby_stand_midW'), sitAct(0, 'lobby_stand_midW'),
                { type: 'ENTER_STATE', state: 'VISITING' },
                { type: 'WAIT_SIM', minutes: randInt(5, 12) }, { type: 'STAND' });
        }
    } else if (roll < 0.52) {
        const wp = pickFrom(['reception', 'kiosk', 'lobby_wc_front', 'lobby_wc_back']);
        acts.push(walkAct(0, wp), sitAct(0, wp),
            { type: 'ENTER_STATE', state: 'VISITING' },
            { type: 'WAIT_SIM', minutes: randInt(3, 7) }, { type: 'STAND' });
    } else if (roll < 0.62) {
        const stands = ['lobby_stand_center', 'lobby_stand_NE', 'lobby_stand_NW',
            'lobby_stand_midE', 'lobby_stand_midW', 'lobby_stand_entry'];
        const wp = pickFrom(stands);
        acts.push(walkAct(0, wp), sitAct(0, wp),
            { type: 'ENTER_STATE', state: 'VISITING' },
            { type: 'WAIT_SIM', minutes: randInt(5, 15) }, { type: 'STAND' });
    } else if (roll < 0.77) {
        const fl = randInt(1, 5);
        const seat = pickFreeSeat(fl, LOUNGE_SEATS);
        Array.prototype.push.apply(acts, planRide(0, fl));
        if (seat) {
            acts.push(walkAct(fl, seat.wp), sitAct(fl, seat.wp),
                { type: 'ENTER_STATE', state: 'VISITING' },
                { type: 'WAIT_SIM', minutes: randInt(8, 18) },
                { type: 'STAND' }, { type: 'RELEASE_SEAT' });
        } else {
            acts.push(walkAct(fl, 'hall_stand_S'), sitAct(fl, 'hall_stand_S'),
                { type: 'ENTER_STATE', state: 'VISITING' },
                { type: 'WAIT_SIM', minutes: randInt(6, 14) }, { type: 'STAND' });
        }
        Array.prototype.push.apply(acts, planRide(fl, 0));
    } else {
        const fl = randInt(1, 5);
        const seat = pickFreeSeat(fl, CONF_SEATS);
        if (seat) {
            Array.prototype.push.apply(acts, planRide(0, fl));
            acts.push(walkAct(fl, seat.wp), sitAct(fl, seat.wp),
                { type: 'ENTER_STATE', state: 'IN_MEETING' },
                { type: 'WAIT_SIM', minutes: randInt(22, 45) },
                { type: 'STAND' }, { type: 'RELEASE_SEAT' });
            Array.prototype.push.apply(acts, planRide(fl, 0));
        } else {
            acts.push(walkAct(0, 'lobby_stand_NE'), sitAct(0, 'lobby_stand_NE'),
                { type: 'ENTER_STATE', state: 'VISITING' },
                { type: 'WAIT_SIM', minutes: randInt(6, 14) }, { type: 'STAND' });
        }
    }
    acts.push(walkAct(0, 'lobby_center'));
    acts.push(walkAct(0, 'entrance'));
    acts.push(walkAct(0, 'front_door_threshold'));
    acts.push(walkAct(0, 'outside'));
    acts.push({ type: 'EXIT_BUILDING' });
    return acts;
}

// Decision rules at a desk-level decision point (workers only).
function chooseNextActivity(agent) {
    const now = simClock.simMinute;
    if (agent.role !== 'WORKER') {
        agent.plan = [{ type: 'WAIT_SIM', minutes: randInt(5, 15) }, { type: 'PICK_NEXT_ACTIVITY' }];
        return;
    }
    if (now >= agent.departureTime) {
        agent.plan = planLeaveBuilding(agent);
        agent.leavingPlanned = true;
        return;
    }
    if (agent.plannedMeetingTimes.length && agent.plannedMeetingTimes[0] <= now) {
        agent.plannedMeetingTimes.shift();
        agent.plan = planAttendMeeting(agent);
        return;
    }
    if (now >= agent.lunchTime && !agent.hasLunched) {
        agent.plan = planGoToLunch(agent);
        return;
    }
    const roll = Math.random();
    if (roll < 0.14) {
        agent.plan = planAttendMeeting(agent);
    } else if (roll < 0.26) {
        agent.plan = planVisitLounge(agent);
    } else if (roll < 0.41) {
        agent.plan = planVisitCoworker(agent);
    } else {
        agent.plan = [
            { type: 'WAIT_SIM', minutes: randInt(18, 65) },
            { type: 'PICK_NEXT_ACTIVITY' }
        ];
    }
}

// ---------- movement helpers ----------

function moveTowards(agent, tx, ty, tz, step, arriveR) {
    const p = agent.group.position;
    const dx = tx - p.x;
    const dy = ty - p.y;
    const dz = tz - p.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist <= arriveR) {
        agent.group.userData.isWalking = false;
        return true;
    }
    const move = Math.min(step, dist);
    if (Math.abs(dx) + Math.abs(dz) > 0.0001) {
        agent.group.rotation.y = Math.atan2(dx, dz);
    }
    p.x += dx / dist * move;
    p.y += dy / dist * move;
    p.z += dz / dist * move;
    agent.group.userData.isWalking = true;
    return dist - move <= arriveR;
}

function walkAlongPath(agent, dt) {
    if (agent.pathIdx >= agent.path.length) return true;
    const target = agent.path[agent.pathIdx];
    const arrived = moveTowards(agent, target.x, target.y, target.z, WALK_SPEED * dt, 0.15);
    const prog = Math.hypot(agent.group.position.x - agent._prevX, agent.group.position.z - agent._prevZ);
    if (prog < 0.005) {
        agent._stallT += dt;
        if (agent._stallT > 1.2) {
            // legs twitching in place -> skip the blocked waypoint
            agent.pathIdx += 1;
            agent._stallT = 0;
            if (agent.pathIdx >= agent.path.length) return true;
        }
    } else {
        agent._stallT = 0;
    }
    agent._prevX = agent.group.position.x;
    agent._prevZ = agent.group.position.z;
    if (arrived) {
        agent.pathIdx += 1;
        if (agent.pathIdx >= agent.path.length) return true;
    }
    return false;
}

function nearestNodeName(floorData, agent) {
    const p = agent.group.position;
    let bestName = null;
    let bestD = Infinity;
    for (const name in floorData.nodes) {
        const node = floorData.nodes[name];
        const d = (node.pos.x - p.x) * (node.pos.x - p.x) + (node.pos.z - p.z) * (node.pos.z - p.z);
        if (d < bestD) {
            bestD = d;
            bestName = name;
        }
    }
    return bestName;
}

function pressHallCall(floor, dir) {
    if (dir > 0) simElevator.callUp(floor);
    else simElevator.callDown(floor);
}

// ---------- action engine ----------

function startAction(agent, act) {
    const ud = agent.group.userData;
    switch (act.type) {
        case 'WALK_TO_WP': {
            const floorData = simWorld.floors[act.floor];
            const from = (agent.lastWp && floorData.nodes[agent.lastWp])
                ? agent.lastWp
                : nearestNodeName(floorData, agent);
            agent.path = simWorld.bfsPath(floorData.nodes, from, act.wp);
            agent.pathIdx = 0;
            agent._stallT = 0;
            agent._prevX = agent.group.position.x;
            agent._prevZ = agent.group.position.z;
            if (!agent.path.length) {
                act.done = true;
                break;
            }
            if (!agent.inCar) agent.group.position.y = floorData.floorY;
            break;
        }
        case 'WAIT_AT_PANEL': {
            agent.state = 'WAITING_ELEVATOR';
            agent.lastWp = 'elevWait';
            // deterministic spread so waiters do not stack on one point
            const p = agent.group.position;
            p.x += ((agent.id % 9) - 4) * 0.42;
            p.z = simWorld.floors[act.floor].floorY + 2.1 + (agent.id % 4) * 0.38;
            break;
        }
        case 'ENTER_ELEVATOR':
            act.phase = 'reserve';
            agent.state = 'ON_FLOOR';
            break;
        case 'PRESS_FLOOR':
            simElevator.pressDestination(act.floor);
            act.done = true;
            break;
        case 'WAIT_FOR_FLOOR':
            break;
        case 'EXIT_ELEVATOR': {
            simElevator.registerDisembark(agent);
            simScene.attach(agent.group);
            agent.inCar = false;
            agent.floor = act.toFloor;
            agent.state = 'ON_FLOOR';
            act.exitX = ((agent.id % 7) - 3) * 0.4;
            act.exitZ = 2.15 + (agent.id % 3) * 0.35;
            agent._stallT = 0;
            agent._prevX = agent.group.position.x;
            agent._prevZ = agent.group.position.z;
            break;
        }
        case 'SIT': {
            const floorData = simWorld.floors[act.floor];
            const node = floorData.nodes[act.wp];
            const target = floorData.sitTargets[act.wp];
            if (!node) {
                act.done = true;
                break;
            }
            ud.isWalking = false;
            if (target && target.sit) {
                // hips drop to seat height; legs point toward the desk/table
                agent.group.position.set(node.pos.x, floorData.floorY - 0.35, node.pos.z);
                ud.isSitting = true;
            } else {
                // standing waypoint: jitter on a small ring for personal space
                const r = 0.35 + Math.random() * 0.4;
                const a = Math.random() * Math.PI * 2;
                agent.group.position.set(node.pos.x + Math.cos(a) * r, floorData.floorY, node.pos.z + Math.sin(a) * r);
                if (ud.isSitting) agent.group.position.y = floorData.floorY;
                ud.isSitting = false;
            }
            if (target && typeof target.facing === 'number') {
                agent.group.rotation.y = target.facing;
            }
            agent.lastWp = act.wp;
            act.done = true;
            break;
        }
        case 'STAND': {
            ud.isSitting = false;
            ud.isWalking = false;
            agent.group.position.y = agent.inCar ? 0.1 : simWorld.floors[agent.floor].floorY;
            act.done = true;
            break;
        }
        case 'RELEASE_SEAT':
            if (agent.seatReservation) {
                simSeatReservations.delete(agent.seatReservation);
                agent.seatReservation = null;
            }
            act.done = true;
            break;
        case 'WAIT_SIM':
            agent.waitUntilAbs = absMinutes() + act.minutes;
            break;
        case 'EXIT_BUILDING':
            if (agent.group.parent) agent.group.parent.remove(agent.group);
            agent.inCar = false;
            if (agent.seatReservation) {
                simSeatReservations.delete(agent.seatReservation);
                agent.seatReservation = null;
            }
            agent.state = 'GONE';
            agent.plan = [];
            act.done = true;
            break;
        case 'ENTER_STATE':
            agent.state = act.state;
            act.done = true;
            break;
        case 'MARK_LUNCHED':
            agent.hasLunched = true;
            act.done = true;
            break;
        case 'PICK_NEXT_ACTIVITY':
            chooseNextActivity(agent);
            act.done = true;
            break;
        default:
            act.done = true;
            break;
    }
}

function updateAction(agent, act, dt) {
    const ud = agent.group.userData;
    switch (act.type) {
        case 'WALK_TO_WP': {
            if (walkAlongPath(agent, dt)) act.done = true;
            break;
        }
        case 'WAIT_AT_PANEL': {
            pressHallCall(act.floor, act.dir);
            if (simElevator.isDoorUsableAt(act.floor, act.dir) &&
                simElevator.currentCapacityFree() > 0) {
                act.done = true;
            }
            break;
        }
        case 'ENTER_ELEVATOR': {
            const fl = act.floor;
            const floorY = simWorld.floors[fl].floorY;
            if (act.phase === 'reserve') {
                if (!simElevator.isDoorUsableAt(fl, act.dir) ||
                    simElevator.state === 'DOOR_CLOSING') {
                    // car slipped away or doors nearly shut: re-press and keep waiting
                    pressHallCall(fl, act.dir);
                    break;
                }
                if (simElevator.currentCapacityFree() <= 0) {
                    pressHallCall(fl, act.dir);
                    break;
                }
                const spot = simElevator.reserveBoardingSpot(agent);
                if (!spot) {
                    pressHallCall(fl, act.dir);
                    break;
                }
                act.spot = spot;
                act.doorX = spot.x; // aim each boarder at their own lane
                act.phase = 'toDoor';
                agent._stallT = 0;
                agent._prevX = agent.group.position.x;
                agent._prevZ = agent.group.position.z;
                break;
            }
            if (act.phase === 'toDoor') {
                if (!simElevator.isDoorUsableAt(fl, act.dir)) {
                    if (agent.group.parent !== simScene) {
                        simScene.attach(agent.group);
                        agent.group.position.y = floorY;
                    }
                    act.phase = 'reserve';
                    break;
                }
                const arrived = moveTowards(agent, act.doorX, floorY, 1.8, WALK_SPEED * dt, 0.12);
                const prog = Math.hypot(agent.group.position.x - agent._prevX, agent.group.position.z - agent._prevZ);
                if (prog < 0.005) {
                    agent._stallT += dt;
                    if (agent._stallT > 1.5) {
                        // forced entry: teleport to the threshold
                        agent.group.position.set(act.doorX, floorY, 1.8);
                        simElevator.car.attach(agent.group);
                        act.phase = 'board';
                        agent._stallT = 0;
                        agent._prevX = agent.group.position.x;
                        agent._prevZ = agent.group.position.z;
                        break;
                    }
                } else {
                    agent._stallT = 0;
                }
                agent._prevX = agent.group.position.x;
                agent._prevZ = agent.group.position.z;
                if (arrived && act.phase === 'toDoor') {
                    simElevator.car.attach(agent.group);
                    act.phase = 'board';
                    agent._stallT = 0;
                }
                break;
            }
            // phase === 'board': walk to the reserved interior spot (car-local)
            if (simElevator.state === 'MOVING' || simElevator.currentFloor !== fl) {
                simScene.attach(agent.group);
                agent.group.position.y = floorY;
                agent.inCar = false;
                act.phase = 'reserve';
                break;
            }
            const spot = act.spot;
            const p = agent.group.position;
            const dx = spot.x - p.x;
            const dy = 0.1 - p.y;
            const dz = spot.z - p.z;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (dist < 0.08) {
                simElevator.completeBoard(agent);
                agent.inCar = true;
                agent.floor = fl;
                agent.state = 'IN_CAR';
                agent.group.rotation.y = 0; // face the doors
                act.done = true;
            } else {
                const move = Math.min(WALK_SPEED * dt, dist);
                p.x += dx / dist * move;
                p.y += dy / dist * move;
                p.z += dz / dist * move;
                ud.isWalking = true;
            }
            break;
        }
        case 'WAIT_FOR_FLOOR': {
            if (simElevator.currentFloor === act.floor && simElevator.state === 'DOOR_OPEN') {
                act.done = true;
            }
            break;
        }
        case 'EXIT_ELEVATOR': {
            const floorY = simWorld.floors[act.toFloor].floorY;
            let arrived = moveTowards(agent, act.exitX, floorY, act.exitZ, WALK_SPEED * dt, 0.14);
            const prog = Math.hypot(agent.group.position.x - agent._prevX, agent.group.position.z - agent._prevZ);
            if (prog < 0.005) {
                agent._stallT += dt;
                if (agent._stallT > 1.5) {
                    agent.group.position.set(act.exitX, floorY, act.exitZ);
                    arrived = true;
                }
            } else {
                agent._stallT = 0;
            }
            agent._prevX = agent.group.position.x;
            agent._prevZ = agent.group.position.z;
            if (arrived) {
                simElevator.completeDisembark(agent);
                agent.lastWp = 'elevWait';
                act.done = true;
            }
            break;
        }
        case 'WAIT_SIM': {
            if (absMinutes() >= agent.waitUntilAbs) act.done = true;
            break;
        }
        default:
            act.done = true;
            break;
    }
}

function cleanupAction(agent, act) {
    if (act.type === 'WALK_TO_WP') agent.lastWp = act.wp;
}

function dispatchActions(agent, dt) {
    if (agent.state === 'DISABLED' || agent.state === 'AWAY' || agent.state === 'GONE') return;
    agent.group.userData.isWalking = false;
    let iter = 0;
    while (iter < 16) {
        iter += 1;
        if (!agent.currentAction) {
            if (!agent.plan.length) break;
            agent.currentAction = agent.plan.shift();
            startAction(agent, agent.currentAction);
        }
        const act = agent.currentAction;
        if (!act) break;
        if (act.done) {
            cleanupAction(agent, act);
            agent.currentAction = null;
            continue;
        }
        updateAction(agent, act, dt);
        if (act.done) {
            cleanupAction(agent, act);
            agent.currentAction = null;
            continue;
        }
        break;
    }
}

// ---------- daily schedule / lifecycle ----------

function spawnAgent(agent) {
    const jx = (Math.random() * 2 - 1) * 1.1;
    const jz = (Math.random() * 2 - 1) * 0.75;
    if (agent.group.parent) agent.group.parent.remove(agent.group);
    agent.group.position.set(jx, 0, 12 + (Math.random() * 0.8 - 0.4));
    agent.group.rotation.y = Math.PI;
    const ud = agent.group.userData;
    ud.isSitting = false;
    ud.isWalking = false;
    ud.walkPhase = 0;
    ud.legL.rotation.x = 0;
    ud.legR.rotation.x = 0;
    ud.armL.rotation.x = 0;
    ud.armR.rotation.x = 0;
    simScene.add(agent.group);
    agent.inCar = false;
    agent.floor = 0;
    agent.lastWp = 'outside';
    agent.seatReservation = null;
    agent.leavingPlanned = false;
    agent.currentAction = null;
    agent.path = [];
    agent.pathIdx = 0;
    agent.plan = agent.role === 'WORKER' ? planArriveToDesk(agent) : planVisitorVisit(agent);
    agent.state = 'ARRIVING';
}

function processDailySchedule(agent) {
    if (agent.state === 'DISABLED') return;
    const now = simClock.simMinute;
    if (agent.state === 'AWAY') {
        if (now >= agent.arrivalTime) {
            if (agent.role === 'WORKER' && now >= agent.departureTime) return;
            spawnAgent(agent);
        }
        return;
    }
    if (agent.role === 'WORKER' && !agent.leavingPlanned &&
        now >= agent.departureTime && !agent.inCar && agent.state !== 'GONE') {
        const t = agent.currentAction ? agent.currentAction.type : null;
        if (BLOCKING_ELEV_ACTIONS.indexOf(t) < 0) {
            agent.plan = planLeaveBuilding(agent);
            agent.leavingPlanned = true;
            agent.currentAction = null;
        }
    }
}

function resetForNewDay() {
    simElevator.reset();
    simSeatReservations.clear();
    for (let i = 0; i < simAgents.length; i++) {
        const a = simAgents[i];
        if (a.group.parent) a.group.parent.remove(a.group);
        rollDailySchedule(a);
        a.plan = [];
        a.currentAction = null;
        a.inCar = false;
        a.seatReservation = null;
        a.leavingPlanned = false;
        a.floor = 0;
        a.path = [];
        a.pathIdx = 0;
        a._stallT = 0;
        a.state = a.id < simTargetOccupancy ? 'AWAY' : 'DISABLED';
        const ud = a.group.userData;
        ud.isSitting = false;
        ud.isWalking = false;
        ud.walkPhase = 0;
        if (ud.legL) {
            ud.legL.rotation.x = 0;
            ud.legR.rotation.x = 0;
            ud.armL.rotation.x = 0;
            ud.armR.rotation.x = 0;
        }
    }
}

function applyOccupancy() {
    for (let i = 0; i < simAgents.length; i++) {
        const a = simAgents[i];
        if (a.id < simTargetOccupancy) {
            if (a.state === 'DISABLED') {
                a.state = 'AWAY';
                a.plan = [];
                a.currentAction = null;
                a.hasLunched = false;
                a.arrivalTime = simClock.simMinute + (a.role === 'WORKER' ? randInt(1, 25) : randInt(0, 8));
            }
        } else if (a.state === 'AWAY') {
            a.state = 'DISABLED';
        }
    }
}

function topUpVisitors() {
    const now = simClock.simMinute;
    if (now < 7 * 60 || now > 20 * 60) return;
    const deficit = simTargetOccupancy - countPresent();
    if (deficit <= 0) return;
    let armed = 0;
    for (let i = 0; i < simAgents.length; i++) {
        if (armed >= deficit || armed >= 2) break;
        const a = simAgents[i];
        if (a.role !== 'VISITOR') continue;
        if (a.state !== 'AWAY' && a.state !== 'GONE') continue;
        a.arrivalTime = now + randInt(0, 6);
        a.visitDuration = randInt(15, 60);
        a.hasLunched = false;
        a.plan = [];
        a.currentAction = null;
        a.leavingPlanned = false;
        a.state = 'AWAY';
        armed += 1;
    }
}

// ---------- collisions (soft personal-space repulsion) ----------

function applyCollisions() {
    const actives = [];
    for (let i = 0; i < simAgents.length; i++) {
        const a = simAgents[i];
        if (a.state === 'DISABLED' || a.state === 'AWAY' || a.state === 'GONE') continue;
        if (!a.group.parent || a.group.parent !== simScene) continue; // car riders skipped
        if (a.group.userData.isSitting) continue;
        const t = a.currentAction ? a.currentAction.type : null;
        if (t === 'ENTER_ELEVATOR') continue; // boarders push through the crowd
        if (t === 'WALK_TO_WP' && ENTRANCE_WPS.indexOf(a.currentAction.wp) >= 0) continue;
        actives.push(a);
    }
    for (let i = 0; i < actives.length; i++) {
        const a = actives[i];
        for (let j = i + 1; j < actives.length; j++) {
            const b = actives[j];
            if (Math.abs(a.group.position.y - b.group.position.y) > 1) continue;
            const dx = b.group.position.x - a.group.position.x;
            const dz = b.group.position.z - a.group.position.z;
            const d2 = dx * dx + dz * dz;
            if (d2 > 0.49) continue;
            let d = Math.sqrt(d2);
            let nx, nz;
            if (d < 0.001) {
                const ang = Math.random() * Math.PI * 2;
                nx = Math.cos(ang);
                nz = Math.sin(ang);
                d = 0;
            } else {
                nx = dx / d;
                nz = dz / d;
            }
            const push = (0.7 - d) * 0.18;
            a.group.position.x -= nx * push;
            a.group.position.z -= nz * push;
            b.group.position.x += nx * push;
            b.group.position.z += nz * push;
        }
    }
}

// ---------- day / night ----------

let simDayColors = [];
const simTmpBg = new THREE.Color();
const simTmpSun = new THREE.Color();

function sampleDaylight(hour) {
    const kfs = simDayColors;
    let i = 0;
    while (i < kfs.length - 2 && hour > kfs[i + 1].h) i += 1;
    const a = kfs[i];
    const b = kfs[i + 1];
    let t = (hour - a.h) / Math.max(0.0001, b.h - a.h);
    t = Math.max(0, Math.min(1, t));
    const s = t * t * (3 - 2 * t);
    simTmpBg.lerpColors(a.bgC, b.bgC, s);
    simTmpSun.lerpColors(a.sunC, b.sunC, s);
    return {
        sunI: a.sunI + (b.sunI - a.sunI) * s,
        amb: a.amb + (b.amb - a.amb) * s,
        hemi: a.hemi + (b.hemi - a.hemi) * s
    };
}

function updateLighting() {
    const hour = simClock.simMinute / 60;
    const d = sampleDaylight(hour);
    simScene.background.copy(simTmpBg);
    simSun.color.copy(simTmpSun);
    simSun.intensity = d.sunI;
    simAmb.intensity = d.amb;
    simHemi.intensity = d.hemi;
    const ang = (hour - 6) / 12 * Math.PI;
    simSun.position.set(Math.cos(ang) * 30, Math.max(3, Math.sin(ang) * 35), 18);
}

// ---------- HUD ----------

function setStr(set) {
    return Array.from(set).join(',');
}

function buildHud() {
    const panel = document.createElement('div');
    panel.style.cssText = 'position:fixed;top:12px;left:12px;z-index:10;background:rgba(10,12,20,0.78);' +
        'color:#eef2ff;font:13px/1.5 Menlo,Consolas,monospace;padding:10px 14px;border-radius:10px;min-width:270px;user-select:none;';
    simHudTime = document.createElement('div');
    simHudTime.style.cssText = 'font-size:26px;font-weight:bold;margin-bottom:6px;letter-spacing:1px;';
    panel.appendChild(simHudTime);

    const speedRow = document.createElement('div');
    simHudSpeedLabel = document.createElement('div');
    simHudSpeedLabel.textContent = 'Speed: 120x';
    speedRow.appendChild(simHudSpeedLabel);
    simHudSpeedSlider = document.createElement('input');
    simHudSpeedSlider.type = 'range';
    simHudSpeedSlider.min = '0';
    simHudSpeedSlider.max = String(SPEED_STOPS.length - 1);
    simHudSpeedSlider.step = '1';
    simHudSpeedSlider.value = '8';
    simHudSpeedSlider.style.width = '240px';
    simHudSpeedSlider.addEventListener('input', function (event) {
        const idx = parseInt(event.target.value, 10);
        simClock.timeScale = SPEED_STOPS[idx];
        simHudSpeedLabel.textContent = 'Speed: ' + simClock.timeScale + 'x';
    });
    speedRow.appendChild(simHudSpeedSlider);
    panel.appendChild(speedRow);

    const occRow = document.createElement('div');
    simHudOccLabel = document.createElement('div');
    simHudOccLabel.textContent = 'Occupancy: ' + simTargetOccupancy + ' / ' + MAX_OCCUPANCY + ' people';
    occRow.appendChild(simHudOccLabel);
    simHudOccSlider = document.createElement('input');
    simHudOccSlider.type = 'range';
    simHudOccSlider.min = '1';
    simHudOccSlider.max = String(MAX_OCCUPANCY);
    simHudOccSlider.value = String(simTargetOccupancy);
    simHudOccSlider.style.width = '240px';
    simHudOccSlider.addEventListener('input', function (event) {
        simTargetOccupancy = parseInt(event.target.value, 10);
        simHudOccLabel.textContent = 'Occupancy: ' + simTargetOccupancy + ' / ' + MAX_OCCUPANCY + ' people';
        applyOccupancy();
    });
    occRow.appendChild(simHudOccSlider);
    panel.appendChild(occRow);

    simHudStates = document.createElement('div');
    simHudStates.style.marginTop = '6px';
    panel.appendChild(simHudStates);
    simHudElevator = document.createElement('div');
    simHudElevator.style.marginTop = '4px';
    panel.appendChild(simHudElevator);
    document.body.appendChild(panel);
}

function updateHud(realDt) {
    simLastHudT += realDt;
    if (simLastHudT < 0.15) return;
    simLastHudT = 0;
    simHudTime.textContent = simClock.format() + '  day ' + simClock.day;
    const counts = {};
    for (let i = 0; i < simAgents.length; i++) {
        const s = simAgents[i].state;
        counts[s] = (counts[s] || 0) + 1;
    }
    const parts = [];
    const order = ['AT_DESK', 'IN_MEETING', 'AT_BREAK', 'AT_LUNCH', 'VISITING', 'WAITING_ELEVATOR', 'IN_CAR', 'ON_FLOOR', 'ARRIVING', 'LEAVING', 'AWAY', 'GONE', 'DISABLED'];
    for (let i = 0; i < order.length; i++) {
        if (counts[order[i]]) parts.push(order[i] + ': ' + counts[order[i]]);
    }
    simHudStates.textContent = 'people ' + countPresent() + '/' + simTargetOccupancy + '  ' + parts.join('  ');
    const E = simElevator;
    simHudElevator.textContent = 'elev f' + E.currentFloor +
        (E.direction > 0 ? '^' : E.direction < 0 ? 'v' : '-') + ' ' + E.state +
        ' | riders ' + E.passengers.size + '/' + E.maxCapacity +
        ' | dest ' + (E.destinations.size ? setStr(E.destinations) : '-') +
        ' | up ' + (E.upCalls.size ? setStr(E.upCalls) : '-') +
        ' | down ' + (E.downCalls.size ? setStr(E.downCalls) : '-');
}

// ---------- render loop + bootstrap ----------

function onResize() {
    simCamera.aspect = window.innerWidth / window.innerHeight;
    simCamera.updateProjectionMatrix();
    simRenderer.setSize(window.innerWidth, window.innerHeight);
}

function buildAgents() {
    simAgents = [];
    for (let i = 0; i < MAX_WORKERS; i++) {
        const a = makeAgent(i, 'WORKER');
        rollDailySchedule(a);
        simAgents.push(a);
    }
    for (let i = MAX_WORKERS; i < MAX_OCCUPANCY; i++) {
        const a = makeAgent(i, 'VISITOR');
        rollDailySchedule(a);
        simAgents.push(a);
    }
    for (let i = 0; i < simAgents.length; i++) {
        const a = simAgents[i];
        a.state = a.id < simTargetOccupancy ? 'AWAY' : 'DISABLED';
    }
}

function animate() {
    requestAnimationFrame(animate);
    const realDt = Math.min(0.05, simFrameClock.getDelta());
    if (simClock.tick(realDt)) resetForNewDay();
    updateLighting();
    const motionDt = realDt * simClock.timeScale;

    // Lockstep sub-stepping: the elevator and every agent advance through the same
    // motion-time in small slices, so agents can observe door-open phases even when
    // one real frame spans many motion seconds (high time scales). Motion and the
    // sim clock stay in exact lockstep - only the sampling granularity changes.
    for (let i = 0; i < simAgents.length; i++) {
        processDailySchedule(simAgents[i]);
    }
    let rem = motionDt;
    let guard = 0;
    while (rem > 0.0001 && guard < 48) {
        const sub = Math.min(0.4, rem);
        simElevator.tick(sub);
        for (let i = 0; i < simAgents.length; i++) {
            dispatchActions(simAgents[i], sub);
        }
        rem -= sub;
        guard += 1;
    }
    topUpVisitors();
    applyCollisions();
    for (let i = 0; i < simAgents.length; i++) {
        const a = simAgents[i];
        if (a.group.parent) animatePersonWalking(a.group, motionDt);
    }
    simControls.update();
    simRenderer.render(simScene, simCamera);
    updateHud(realDt);
}

function startSimulation() {
    simScene = new THREE.Scene();
    simScene.background = new THREE.Color(0x20242a);
    simCamera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    simCamera.position.set(28, 24, 28);
    simRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    simRenderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    simRenderer.setSize(window.innerWidth, window.innerHeight);
    simRenderer.sortObjects = true;
    document.body.appendChild(simRenderer.domElement);
    simControls = new THREE.OrbitControls(simCamera, simRenderer.domElement);
    simControls.target.set(0, 8, 0);
    simAmb = new THREE.AmbientLight(0xffffff, 0.45);
    simScene.add(simAmb);
    simHemi = new THREE.HemisphereLight(0xbfd7ff, 0x303020, 0.45);
    simScene.add(simHemi);
    simSun = new THREE.DirectionalLight(0xffffff, 0.9);
    simSun.position.set(20, 35, 18);
    simScene.add(simSun);

    simDayColors = [];
    for (let i = 0; i < DAY_KFS.length; i++) {
        simDayColors.push({
            h: DAY_KFS[i].h,
            sunI: DAY_KFS[i].sunI,
            amb: DAY_KFS[i].amb,
            hemi: DAY_KFS[i].hemi,
            bgC: new THREE.Color(DAY_KFS[i].bg),
            sunC: new THREE.Color(DAY_KFS[i].sun)
        });
    }

    simWorld = createWorld(simScene);
    simElevator = new Elevator(simScene, simWorld);
    simClock = new Clock();
    simFrameClock = new THREE.Clock();
    simPrevT = 0;
    buildAgents();
    buildHud();
    window.addEventListener('resize', function () {
        simCamera.aspect = window.innerWidth / window.innerHeight;
        simCamera.updateProjectionMatrix();
        simRenderer.setSize(window.innerWidth, window.innerHeight);
    });
    window.SIM_DEBUG = {
        getAgents: function () { return simAgents; },
        getClock: function () { return simClock; },
        getElevator: function () { return simElevator; }
    };
    animate();
}

if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', startSimulation);
} else {
    startSimulation();
}

