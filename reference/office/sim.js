// Simulation driver — time-of-day clock, agentic people with daily schedules,
// scene/lighting setup, UI, and the render loop.
//
// Agents have goals + plans; each plan is a queue of primitive actions
// (WALK_TO_WP, WAIT_AT_PANEL, etc.). Each frame we advance the clock, tick
// the elevator, then tick every agent's current action. When an action ends,
// the next one is popped; when the plan is empty, the agent decides a new
// goal based on state + time of day.

// ---------- Tunables ----------
// Time model: `timeScale` is a PURE REAL-TIME MULTIPLIER. 1x means one real
// second advances one sim second — walks, elevator cycles, and the sim clock
// all tick in lockstep. Cranking the slider up scales everything: 120x means
// an 11-hour workday in about 5.5 real minutes, while people still walk at a
// recognizable speed (since walking also plays back at 120x). The previous
// "minutes per second" semantics decoupled clock from motion which created
// the morning/evening bottleneck.
const SIM = {
    START_MINUTE: 7 * 60 + 30,    // day starts at 07:30
    END_MINUTE:   20 * 60 + 30,
    DEFAULT_TIME_SCALE: 120,      // default: 1 real sec = 120 sim sec = 2 sim min
    MAX_TIME_SCALE:     600,
    WALK_SPEED: 1.3,              // m/s (realistic walking pace)
    // Occupancy mixes WORKERS (long-stay, one per desk) and VISITORS
    // (short-stay: deliveries, clients, job candidates, wanderers).
    // Workers are capped by desk count; visitors can share standing spots.
    MAX_WORKERS:   20,            // 4 desks × 5 office floors
    MAX_VISITORS:  80,
    MAX_OCCUPANCY: 100,           // MAX_WORKERS + MAX_VISITORS
    DEFAULT_OCCUPANCY: 45,
    VISITOR_ARRIVAL_WINDOW:   [ 8*60,    16*60+30 ],
    // Durations split between "short drop-ins" (deliveries, quick questions)
    // and "long visitors" (clients in meetings, interviewees) — the mix is
    // what keeps the building looking lively across the whole day instead
    // of bursting and clearing.
    VISITOR_SHORT_DURATION:   [ 12, 40 ],
    VISITOR_LONG_DURATION:    [ 60, 200 ],
    VISITOR_LONG_RATIO:       0.55,
    ARRIVAL_WINDOW:   [ 8*60+ 0,  9*60+45  ],
    LUNCH_WINDOW:     [11*60+30, 13*60+30  ],
    LUNCH_DURATION:   [30, 70],
    DEPARTURE_WINDOW: [16*60+30, 18*60+30  ],
    STRAGGLER_CHANCE: 0.18,
    STRAGGLER_DEPARTURE: [18*60+30, 19*60+45],
    AT_DESK_MIN:  18, AT_DESK_MAX: 65,
    // Meeting weight bumped so conference rooms see more traffic; lounge
    // weight pulled down a notch to compensate (the sit-on-a-couch spots
    // were stealing the draw).
    MEETING_PROB: 0.36,
    LOUNGE_PROB:  0.12,
    VISIT_PROB:   0.15,
    WORK_LONG_PROB: 0.45,
};

function randRange(min, max)   { return min + Math.random() * (max - min); }
function randInt(min, max)     { return Math.floor(randRange(min, max + 1)); }
function randChoice(a)         { return a[Math.floor(Math.random() * a.length)]; }

// ---------- Scene ----------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x222233);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(28, 24, 28);
camera.lookAt(0, WORLD.FLOOR_HEIGHT * WORLD.FLOOR_COUNT / 2, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.sortObjects = true;
document.body.appendChild(renderer.domElement);

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.target.set(0, WORLD.FLOOR_HEIGHT * WORLD.FLOOR_COUNT / 2, 0);
controls.update();

// Lighting — these get color/intensity shifted by time of day.
const ambient = new THREE.AmbientLight(0xffffff, 0.55);
scene.add(ambient);
const sun = new THREE.DirectionalLight(0xffffff, 0.8);
sun.position.set(20, 40, 15);
scene.add(sun);
const hemi = new THREE.HemisphereLight(0x88aaff, 0x221a10, 0.25);
scene.add(hemi);

// Build world + elevator.
const world = createWorld(scene);
const elevator = new Elevator(scene, world);

// ---------- Time of day ----------
const Clock = {
    simMinute: SIM.START_MINUTE,
    timeScale: SIM.DEFAULT_TIME_SCALE,   // real-time multiplier
    // One real sec at `timeScale` = timeScale sim seconds = timeScale/60 sim minutes.
    tick(realDt) {
        this.simMinute += (realDt * this.timeScale) / 60;
        if (this.simMinute >= 24 * 60) {
            this.simMinute -= 24 * 60;
            // Reset the elevator too; otherwise phantom passengers from the
            // previous day jam the scheduler forever.
            elevator.upCalls.clear();
            elevator.downCalls.clear();
            elevator.destinations.clear();
            elevator.passengers.clear();
            elevator.pendingBoarders.clear();
            elevator.pendingDisembark.clear();
            elevator.spotOccupancy = [null, null, null, null];
            elevator.state = 'IDLE';
            elevator.direction = DIR_IDLE;
            elevator.doorOpenAmount = 0;
            elevator.car.userData.leftDoor.position.x  = elevator.car.userData.leftDoorClosedX;
            elevator.car.userData.rightDoor.position.x = elevator.car.userData.rightDoorClosedX;
            elevator.car.position.y = 0;
            elevator.currentFloor = 0;
            seatReservations.clear();
            // New day: reset every agent with a fresh random schedule so
            // arrival / lunch / departure vary across days.
            for (const a of agents) {
                a.hasLunched = false;
                a.attendedMeetings = 0;
                a.state = (a.id < targetOccupancy) ? 'AWAY' : 'DISABLED';
                a._reservedSeatKey = null;
                if (a.group.parent) a.group.parent.remove(a.group);
                a.plan = [];
                a.currentAction = null;
                a.currentFloor = null;
                a.container = null;
                const sched = a.role === 'VISITOR' ? newVisitorSchedule() : newWorkerSchedule();
                Object.assign(a, sched);
            }
        }
    },
    format() {
        const m = Math.floor(this.simMinute) % (24*60);
        const h = Math.floor(m / 60);
        const mm = m % 60;
        const ampm = h < 12 ? 'AM' : 'PM';
        const hh = ((h + 11) % 12) + 1;
        return `${String(hh).padStart(2,' ')}:${String(mm).padStart(2,'0')} ${ampm}`;
    },
};

// ---------- Day/night lighting ----------
// Keyframes shaped like a real day: long flat midday, narrow golden-hour
// ramps at dawn (~06:00–06:30) and dusk (~17:30–18:30), then night. Night
// is deliberately not pitch-black — enough ambient / hemi to read the
// building's geometry and transparent walls.
const LIGHT_KEY = [
    { h:  0.0, bg: 0x1a2040, sun: 0x4a5a88, si: 0.12, ai: 0.45, hi: 0.32 },
    { h:  5.5, bg: 0x1a2040, sun: 0x4a5a88, si: 0.15, ai: 0.46, hi: 0.33 },
    { h:  6.0, bg: 0x7a5a70, sun: 0xffaa77, si: 0.55, ai: 0.50, hi: 0.34 },
    { h:  6.5, bg: 0x9abbdd, sun: 0xfff2cc, si: 0.95, ai: 0.60, hi: 0.30 },
    { h: 17.5, bg: 0xa8ccf0, sun: 0xffffff, si: 0.95, ai: 0.60, hi: 0.30 },
    { h: 18.0, bg: 0xd99966, sun: 0xff8844, si: 0.70, ai: 0.52, hi: 0.32 },
    { h: 18.5, bg: 0x5a3a6c, sun: 0x6644aa, si: 0.28, ai: 0.46, hi: 0.33 },
    { h: 19.0, bg: 0x1a2040, sun: 0x4a5a88, si: 0.15, ai: 0.46, hi: 0.33 },
    { h: 24.0, bg: 0x1a2040, sun: 0x4a5a88, si: 0.12, ai: 0.45, hi: 0.32 },
];
function lerp(a, b, t) { return a + (b - a) * t; }
function lerpColor(c1, c2, t) {
    const r = lerp((c1 >> 16) & 255, (c2 >> 16) & 255, t);
    const g = lerp((c1 >> 8)  & 255, (c2 >> 8)  & 255, t);
    const b = lerp( c1        & 255,  c2        & 255, t);
    return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
}
function updateLighting() {
    const hour = (Clock.simMinute / 60) % 24;
    let k0 = LIGHT_KEY[0], k1 = LIGHT_KEY[LIGHT_KEY.length - 1];
    for (let i = 0; i < LIGHT_KEY.length - 1; i++) {
        if (hour >= LIGHT_KEY[i].h && hour < LIGHT_KEY[i+1].h) {
            k0 = LIGHT_KEY[i]; k1 = LIGHT_KEY[i+1]; break;
        }
    }
    const span = k1.h - k0.h || 1;
    const t = (hour - k0.h) / span;
    scene.background = new THREE.Color(lerpColor(k0.bg, k1.bg, t));
    sun.color.setHex(lerpColor(k0.sun, k1.sun, t));
    sun.intensity = lerp(k0.si, k1.si, t);
    ambient.intensity = lerp(k0.ai, k1.ai, t);
    hemi.intensity = lerp(k0.hi, k1.hi, t);
}

// ---------- Agent schedules ----------
function pickMeetingTimes() {
    const times = [];
    if (Math.random() < 0.65) times.push(randInt(9*60+30, 11*60));
    if (Math.random() < 0.55) times.push(randInt(13*60+30, 16*60));
    return times;
}

// Assign unique (floor, deskId) pairs.
const assignments = [];
for (let f = 1; f < WORLD.FLOOR_COUNT; f++) {
    for (const d of ['A','B','C','D']) assignments.push({ floor: f, deskId: d });
}
// Shuffle.
for (let i = assignments.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [assignments[i], assignments[j]] = [assignments[j], assignments[i]];
}

const FIRST_NAMES = ['Ava','Ben','Cara','Dan','Eli','Finn','Gia','Hugo','Ivy','Jax','Kai','Lia','Mae','Nico','Oli','Pia','Quin','Rae','Sol','Tess'];

// The user-controlled "occupancy" is tracked separately from the total agent
// pool. We always build MAX_OCCUPANCY agents at startup so desk assignments
// + roles stay stable; the slider then decides how many come in today.
let targetOccupancy = SIM.DEFAULT_OCCUPANCY;

function newWorkerSchedule() {
    const isStraggler = Math.random() < SIM.STRAGGLER_CHANCE;
    return {
        arrivalTime:   randInt(SIM.ARRIVAL_WINDOW[0],   SIM.ARRIVAL_WINDOW[1]),
        lunchTime:     randInt(SIM.LUNCH_WINDOW[0],     SIM.LUNCH_WINDOW[1]),
        lunchDuration: randInt(SIM.LUNCH_DURATION[0],   SIM.LUNCH_DURATION[1]),
        departureTime: isStraggler
            ? randInt(SIM.STRAGGLER_DEPARTURE[0], SIM.STRAGGLER_DEPARTURE[1])
            : randInt(SIM.DEPARTURE_WINDOW[0],    SIM.DEPARTURE_WINDOW[1]),
        plannedMeetingTimes: pickMeetingTimes(),
    };
}
function newVisitorSchedule() {
    const arrival = randInt(SIM.VISITOR_ARRIVAL_WINDOW[0], SIM.VISITOR_ARRIVAL_WINDOW[1]);
    const long = Math.random() < SIM.VISITOR_LONG_RATIO;
    const duration = long
        ? randInt(SIM.VISITOR_LONG_DURATION[0],  SIM.VISITOR_LONG_DURATION[1])
        : randInt(SIM.VISITOR_SHORT_DURATION[0], SIM.VISITOR_SHORT_DURATION[1]);
    return {
        arrivalTime:   arrival,
        departureTime: arrival + duration + 15,
        visitDuration: duration,
    };
}

const agents = [];
// Workers (one per desk) — ids 0..MAX_WORKERS-1.
for (let i = 0; i < SIM.MAX_WORKERS; i++) {
    const a = assignments[i];
    const sched = newWorkerSchedule();
    agents.push({
        id: i,
        role: 'WORKER',
        name: FIRST_NAMES[i % FIRST_NAMES.length],
        homeFloor: a.floor,
        deskId: a.deskId,
        deskWpName: `office${a.deskId}_desk`,
        deskDoorWpName: `office${a.deskId}_door`,
        ...sched,
        hasLunched: false,
        attendedMeetings: 0,
        state: (i < targetOccupancy ? 'AWAY' : 'DISABLED'),
        currentFloor: null,
        container: null,
        group: createPerson(),
        plan: [],
        currentAction: null,
        tmp: {},
    });
}
// Visitors — ids MAX_WORKERS..MAX_OCCUPANCY-1. No desk.
for (let i = SIM.MAX_WORKERS; i < SIM.MAX_OCCUPANCY; i++) {
    const sched = newVisitorSchedule();
    agents.push({
        id: i,
        role: 'VISITOR',
        name: FIRST_NAMES[i % FIRST_NAMES.length],
        homeFloor: null,
        deskId: null,
        ...sched,
        state: (i < targetOccupancy ? 'AWAY' : 'DISABLED'),
        currentFloor: null,
        container: null,
        group: createPerson(),
        plan: [],
        currentAction: null,
        tmp: {},
    });
}

// ---------- Agent helpers ----------
function spawnAtEntrance(agent) {
    // Spawn on the sidewalk *outside* the building so the agent visibly
    // walks through the front doors instead of popping into existence.
    // Jitter in X/Z so multiple arrivals in the same frame don't stack.
    const outside = world.floors[0].outsideSpot.clone();
    outside.x += (Math.random() - 0.5) * 2.2;
    outside.z += (Math.random() - 0.5) * 1.5;
    agent.group.position.copy(outside);
    agent.group.rotation.y = Math.PI;   // face into the building (-Z)
    agent.group.userData.isSitting = false;
    agent.group.userData.isWalking = false;
    scene.add(agent.group);
    agent.container = scene;
    agent.currentFloor = 0;
    agent.state = 'ARRIVING';
}
function despawnAgent(agent) {
    if (agent.group.parent) agent.group.parent.remove(agent.group);
    agent.container = null;
    agent.currentFloor = null;
    agent.state = 'GONE';
}

function findNearestNode(floorNodes, worldPos) {
    let best = null, bd = Infinity;
    for (const name in floorNodes) {
        const n = floorNodes[name];
        const dx = n.pos.x - worldPos.x;
        const dz = n.pos.z - worldPos.z;
        const d = dx*dx + dz*dz;
        if (d < bd) { bd = d; best = name; }
    }
    return best;
}

// Build a WALK_TO_WP action that paths from the agent's current world (xz)
// position to a named waypoint on a given floor.
function makeWalkToWp(floor, wpName) {
    return { type: 'WALK_TO_WP', floor, wpName, _pathIdx: 0, _worldPath: null };
}
function makeWaitAtPanel(floor, dir) {
    return { type: 'WAIT_AT_PANEL', floor, dir };
}
function makeEnterElevator() {
    return { type: 'ENTER_ELEVATOR', _phase: 'walkToDoor', _worldPath: null };
}
function makePressFloor(floor) {
    return { type: 'PRESS_FLOOR', floor };
}
function makeWaitForFloor(floor) {
    return { type: 'WAIT_FOR_FLOOR', floor };
}
function makeExitElevator(toFloor) {
    return { type: 'EXIT_ELEVATOR', toFloor, _phase: 'walkOut', _worldPath: null };
}
function makeSit(floor, wpName) {
    return { type: 'SIT', floor, wpName };
}
function makeStand() {
    return { type: 'STAND' };
}
function makeWaitSim(minutes) {
    // `untilMin` is resolved in startAction so it uses the sim clock at the
    // moment the wait actually begins (not when the plan was compiled).
    return { type: 'WAIT_SIM', durationMin: minutes, untilMin: null };
}
function makeExitBuilding() {
    return { type: 'EXIT_BUILDING' };
}

// Conference-seat reservations — avoids two agents walking to the same chair
// and then oscillating via collision push. Keyed by "floor:wpName".
const seatReservations = new Set();
function reserveConfSeat(floor, agent) {
    for (let i = 0; i < 4; i++) {
        const key = `${floor}:conf_seat${i}`;
        if (!seatReservations.has(key)) {
            seatReservations.add(key);
            agent._reservedSeatKey = key;
            return `conf_seat${i}`;
        }
    }
    return null;
}
function releaseAgentSeat(agent) {
    if (agent._reservedSeatKey) {
        seatReservations.delete(agent._reservedSeatKey);
        agent._reservedSeatKey = null;
    }
}

// Apply the occupancy slider by flipping AWAY <-> DISABLED. Agents already
// in the middle of a day are left running; they'll age out to GONE on
// their normal schedule and then be parked DISABLED on the next day-wrap.
function applyOccupancy() {
    for (const a of agents) {
        if (a.id < targetOccupancy) {
            if (a.state === 'DISABLED') a.state = 'AWAY';
        } else {
            if (a.state === 'AWAY') a.state = 'DISABLED';
        }
    }
}

// Dynamic visitor spawner. The slider represents concurrent population, not
// daily roster — so as soon as one visitor leaves, another (from the pool
// that's currently eligible) gets a new arrival time a few minutes in the
// future. This is what keeps the building *sustainably* busy.
function countPresent() {
    let n = 0;
    for (const a of agents) {
        const s = a.state;
        if (s !== 'AWAY' && s !== 'DISABLED' && s !== 'GONE') n++;
    }
    return n;
}
function topUpVisitors() {
    const t = Clock.simMinute;
    // Only spawn during business hours; let the building sleep at night.
    if (t < SIM.VISITOR_ARRIVAL_WINDOW[0] - 30 || t > SIM.VISITOR_ARRIVAL_WINDOW[1] + 30) return;

    const present = countPresent();
    const deficit = targetOccupancy - present;
    if (deficit <= 0) return;

    // Re-arm visitors that are currently AWAY (queued for later today) or
    // GONE (already finished one visit). Pulling their arrival forward keeps
    // the occupancy slider actually mean "concurrent count".
    let spawned = 0;
    for (const a of agents) {
        if (spawned >= deficit) break;
        if (a.role !== 'VISITOR') continue;
        if (a.state !== 'AWAY' && a.state !== 'GONE') continue;
        const sched = newVisitorSchedule();
        a.arrivalTime   = t + randInt(0, 6);
        a.visitDuration = sched.visitDuration;
        a.departureTime = a.arrivalTime + a.visitDuration + 15;
        a.state = 'AWAY';
        a.hasLunched = false;
        spawned++;
    }
}

// ---------- Goal → plan compilers ----------
function planArriveToDesk(agent) {
    const plan = [];
    // Walk in through the doors first, then continue to the elevator.
    plan.push(makeWalkToWp(0, 'entrance'));
    plan.push(makeWalkToWp(0, 'elevWait'));
    plan.push(makeWaitAtPanel(0, DIR_UP));
    plan.push(makeEnterElevator());
    plan.push(makePressFloor(agent.homeFloor));
    plan.push(makeWaitForFloor(agent.homeFloor));
    plan.push(makeExitElevator(agent.homeFloor));
    plan.push(makeWalkToWp(agent.homeFloor, agent.deskDoorWpName));
    plan.push(makeWalkToWp(agent.homeFloor, agent.deskWpName));
    plan.push(makeSit(agent.homeFloor, agent.deskWpName));
    plan.push({ type: 'ENTER_STATE', state: 'AT_DESK' });
    plan.push(makeWaitSim(randInt(SIM.AT_DESK_MIN, SIM.AT_DESK_MAX)));
    plan.push({ type: 'PICK_NEXT_ACTIVITY' });
    return plan;
}

// Leave current seat, go back to elevator area on current floor.
function appendLeaveSeat(plan, agent) {
    plan.push(makeStand());
}

function planGoToLunch(agent) {
    const plan = [];
    appendLeaveSeat(plan, agent);
    // Route from current position via office door back to elevator wait.
    plan.push(makeWalkToWp(agent.homeFloor, agent.deskDoorWpName));
    plan.push(makeWalkToWp(agent.homeFloor, 'elevWait'));
    plan.push(makeWaitAtPanel(agent.homeFloor, DIR_DOWN));
    plan.push(makeEnterElevator());
    plan.push(makePressFloor(0));
    plan.push(makeWaitForFloor(0));
    plan.push(makeExitElevator(0));
    const cafeSpot = randChoice(['bistro1','bistro2']);
    plan.push(makeWalkToWp(0, cafeSpot));
    plan.push(makeSit(0, cafeSpot));
    plan.push({ type: 'ENTER_STATE', state: 'AT_LUNCH' });
    plan.push(makeWaitSim(agent.lunchDuration));
    plan.push({ type: 'MARK_LUNCHED' });
    plan.push(makeStand());
    plan.push(makeWalkToWp(0, 'elevWait'));
    plan.push(makeWaitAtPanel(0, DIR_UP));
    plan.push(makeEnterElevator());
    plan.push(makePressFloor(agent.homeFloor));
    plan.push(makeWaitForFloor(agent.homeFloor));
    plan.push(makeExitElevator(agent.homeFloor));
    plan.push(makeWalkToWp(agent.homeFloor, agent.deskDoorWpName));
    plan.push(makeWalkToWp(agent.homeFloor, agent.deskWpName));
    plan.push(makeSit(agent.homeFloor, agent.deskWpName));
    plan.push({ type: 'ENTER_STATE', state: 'AT_DESK' });
    plan.push(makeWaitSim(randInt(SIM.AT_DESK_MIN, SIM.AT_DESK_MAX)));
    plan.push({ type: 'PICK_NEXT_ACTIVITY' });
    return plan;
}

function planVisitLounge(agent) {
    const plan = [];
    appendLeaveSeat(plan, agent);
    plan.push(makeWalkToWp(agent.homeFloor, agent.deskDoorWpName));
    const loungeWp = randChoice(['lounge_spot0','lounge_spot1','lounge_spot2']);
    plan.push(makeWalkToWp(agent.homeFloor, loungeWp));
    plan.push(makeSit(agent.homeFloor, loungeWp));
    plan.push({ type: 'ENTER_STATE', state: 'AT_BREAK' });
    plan.push(makeWaitSim(randInt(5, 12)));
    plan.push(makeStand());
    plan.push(makeWalkToWp(agent.homeFloor, agent.deskDoorWpName));
    plan.push(makeWalkToWp(agent.homeFloor, agent.deskWpName));
    plan.push(makeSit(agent.homeFloor, agent.deskWpName));
    plan.push({ type: 'ENTER_STATE', state: 'AT_DESK' });
    plan.push(makeWaitSim(randInt(SIM.AT_DESK_MIN, SIM.AT_DESK_MAX)));
    plan.push({ type: 'PICK_NEXT_ACTIVITY' });
    return plan;
}

function planAttendMeeting(agent) {
    const plan = [];
    // Meeting is on a random floor 1..5 (often own floor).
    const meetingFloor = Math.random() < 0.65 ? agent.homeFloor : randInt(1, 5);
    appendLeaveSeat(plan, agent);
    plan.push(makeWalkToWp(agent.homeFloor, agent.deskDoorWpName));
    if (meetingFloor !== agent.homeFloor) {
        plan.push(makeWalkToWp(agent.homeFloor, 'elevWait'));
        const dir = meetingFloor > agent.homeFloor ? DIR_UP : DIR_DOWN;
        plan.push(makeWaitAtPanel(agent.homeFloor, dir));
        plan.push(makeEnterElevator());
        plan.push(makePressFloor(meetingFloor));
        plan.push(makeWaitForFloor(meetingFloor));
        plan.push(makeExitElevator(meetingFloor));
    }
    const seatWp = reserveConfSeat(meetingFloor, agent);
    if (!seatWp) {
        // All conference seats taken — fall back to a lounge break instead.
        return planVisitLounge(agent);
    }
    plan.push(makeWalkToWp(meetingFloor, 'conf_door'));
    plan.push(makeWalkToWp(meetingFloor, seatWp));
    plan.push(makeSit(meetingFloor, seatWp));
    plan.push({ type: 'ENTER_STATE', state: 'IN_MEETING' });
    plan.push(makeWaitSim(randInt(22, 45)));
    plan.push(makeStand());
    plan.push({ type: 'RELEASE_SEAT' });
    if (meetingFloor !== agent.homeFloor) {
        plan.push(makeWalkToWp(meetingFloor, 'elevWait'));
        const dir = meetingFloor < agent.homeFloor ? DIR_UP : DIR_DOWN;
        plan.push(makeWaitAtPanel(meetingFloor, dir));
        plan.push(makeEnterElevator());
        plan.push(makePressFloor(agent.homeFloor));
        plan.push(makeWaitForFloor(agent.homeFloor));
        plan.push(makeExitElevator(agent.homeFloor));
    } else {
        plan.push(makeWalkToWp(meetingFloor, 'conf_door'));
    }
    plan.push(makeWalkToWp(agent.homeFloor, agent.deskDoorWpName));
    plan.push(makeWalkToWp(agent.homeFloor, agent.deskWpName));
    plan.push(makeSit(agent.homeFloor, agent.deskWpName));
    plan.push({ type: 'ENTER_STATE', state: 'AT_DESK' });
    plan.push(makeWaitSim(randInt(SIM.AT_DESK_MIN, SIM.AT_DESK_MAX)));
    plan.push({ type: 'PICK_NEXT_ACTIVITY' });
    return plan;
}

function planVisitCoworker(agent) {
    const plan = [];
    // Pick a random other agent currently AT_DESK.
    const candidates = agents.filter(o => o !== agent && o.state === 'AT_DESK');
    if (!candidates.length) {
        // Fall back to lounge visit.
        return planVisitLounge(agent);
    }
    const other = randChoice(candidates);
    appendLeaveSeat(plan, agent);
    plan.push(makeWalkToWp(agent.homeFloor, agent.deskDoorWpName));
    if (other.homeFloor !== agent.homeFloor) {
        plan.push(makeWalkToWp(agent.homeFloor, 'elevWait'));
        const dir = other.homeFloor > agent.homeFloor ? DIR_UP : DIR_DOWN;
        plan.push(makeWaitAtPanel(agent.homeFloor, dir));
        plan.push(makeEnterElevator());
        plan.push(makePressFloor(other.homeFloor));
        plan.push(makeWaitForFloor(other.homeFloor));
        plan.push(makeExitElevator(other.homeFloor));
    }
    plan.push(makeWalkToWp(other.homeFloor, other.deskDoorWpName));
    // Stand just beside their desk (use their office door waypoint).
    plan.push({ type: 'ENTER_STATE', state: 'VISITING' });
    plan.push(makeWaitSim(randInt(6, 18)));
    if (other.homeFloor !== agent.homeFloor) {
        plan.push(makeWalkToWp(other.homeFloor, 'elevWait'));
        const dir = other.homeFloor < agent.homeFloor ? DIR_UP : DIR_DOWN;
        plan.push(makeWaitAtPanel(other.homeFloor, dir));
        plan.push(makeEnterElevator());
        plan.push(makePressFloor(agent.homeFloor));
        plan.push(makeWaitForFloor(agent.homeFloor));
        plan.push(makeExitElevator(agent.homeFloor));
    }
    plan.push(makeWalkToWp(agent.homeFloor, agent.deskDoorWpName));
    plan.push(makeWalkToWp(agent.homeFloor, agent.deskWpName));
    plan.push(makeSit(agent.homeFloor, agent.deskWpName));
    plan.push({ type: 'ENTER_STATE', state: 'AT_DESK' });
    plan.push(makeWaitSim(randInt(SIM.AT_DESK_MIN, SIM.AT_DESK_MAX)));
    plan.push({ type: 'PICK_NEXT_ACTIVITY' });
    return plan;
}

// Visitor: walks in, does a single short activity, walks out.
// Weights roughly: 10% bistro, 6% cafe counter, 14% front lounge,
// 12% back lounge, 10% stand-at-reception/kiosk/cooler, 10% lobby loiter,
// 15% ride up to an office-floor lounge, 23% sit in on a conference-room
// meeting (the "client / external attendee" archetype).
function planVisitorVisit(agent) {
    const plan = [];
    plan.push(makeWalkToWp(0, 'entrance'));

    const r = Math.random();
    if (r < 0.10) {
        // Cafe visit — pick a bistro chair.
        const spot = randChoice(['bistro1','bistro2','bistro3','bistro4']);
        plan.push(makeWalkToWp(0, spot));
        plan.push(makeSit(0, spot));
        plan.push({ type: 'ENTER_STATE', state: 'VISITING' });
        plan.push(makeWaitSim(agent.visitDuration));
        plan.push(makeStand());
    } else if (r < 0.16) {
        // Queue briefly at cafe counter.
        plan.push(makeWalkToWp(0, 'cafe_order'));
        plan.push(makeSit(0, 'cafe_order'));
        plan.push({ type: 'ENTER_STATE', state: 'VISITING' });
        plan.push(makeWaitSim(Math.min(12, agent.visitDuration)));
        plan.push(makeStand());
    } else if (r < 0.30) {
        // Front lounge.
        const spot = randChoice(['lounge_couch','lounge_chair_L','lounge_chair_R']);
        plan.push(makeWalkToWp(0, spot));
        plan.push(makeSit(0, spot));
        plan.push({ type: 'ENTER_STATE', state: 'VISITING' });
        plan.push(makeWaitSim(agent.visitDuration));
        plan.push(makeStand());
    } else if (r < 0.42) {
        // Back lounge / conversation pit.
        const spot = randChoice(['back_lounge_N','back_lounge_S','pit_N','pit_S','pit_E','pit_W']);
        plan.push(makeWalkToWp(0, spot));
        plan.push(makeSit(0, spot));
        plan.push({ type: 'ENTER_STATE', state: 'VISITING' });
        plan.push(makeWaitSim(agent.visitDuration));
        plan.push(makeStand());
    } else if (r < 0.52) {
        // Reception / kiosk standing.
        const spot = randChoice(['reception','kiosk','lobby_wc_front','lobby_wc_back']);
        plan.push(makeWalkToWp(0, spot));
        plan.push(makeSit(0, spot));
        plan.push({ type: 'ENTER_STATE', state: 'VISITING' });
        plan.push(makeWaitSim(Math.min(15, agent.visitDuration)));
        plan.push(makeStand());
    } else if (r < 0.62) {
        // Just loiter somewhere in the lobby.
        const spot = randChoice(['lobby_stand_center','lobby_stand_NE','lobby_stand_NW',
                                  'lobby_stand_midE','lobby_stand_midW','lobby_stand_entry']);
        plan.push(makeWalkToWp(0, spot));
        plan.push(makeSit(0, spot));
        plan.push({ type: 'ENTER_STATE', state: 'VISITING' });
        plan.push(makeWaitSim(Math.min(18, agent.visitDuration)));
        plan.push(makeStand());
    } else if (r < 0.77) {
        // Ride up to a random office floor and hang out in its lounge.
        const floor = randInt(1, WORLD.FLOOR_COUNT - 1);
        plan.push(makeWalkToWp(0, 'elevWait'));
        plan.push(makeWaitAtPanel(0, DIR_UP));
        plan.push(makeEnterElevator());
        plan.push(makePressFloor(floor));
        plan.push(makeWaitForFloor(floor));
        plan.push(makeExitElevator(floor));
        const spot = randChoice(['lounge_spot0','lounge_spot1','lounge_spot2',
                                  'water_cooler','hall_stand_N','hall_stand_S']);
        plan.push(makeWalkToWp(floor, spot));
        plan.push(makeSit(floor, spot));
        plan.push({ type: 'ENTER_STATE', state: 'VISITING' });
        plan.push(makeWaitSim(agent.visitDuration));
        plan.push(makeStand());
        plan.push(makeWalkToWp(floor, 'elevWait'));
        plan.push(makeWaitAtPanel(floor, DIR_DOWN));
        plan.push(makeEnterElevator());
        plan.push(makePressFloor(0));
        plan.push(makeWaitForFloor(0));
        plan.push(makeExitElevator(0));
    } else {
        // Sit in on a meeting in one of the conference rooms — the
        // "external attendee" archetype. Reserve a seat first; if the
        // room is already full, fall back to a lobby loiter spot.
        const floor = randInt(1, WORLD.FLOOR_COUNT - 1);
        const seatWp = reserveConfSeat(floor, agent);
        if (!seatWp) {
            const spot = randChoice(['lobby_stand_center','lobby_stand_NE',
                                      'lobby_stand_midE','lobby_stand_midW']);
            plan.push(makeWalkToWp(0, spot));
            plan.push(makeSit(0, spot));
            plan.push({ type: 'ENTER_STATE', state: 'VISITING' });
            plan.push(makeWaitSim(Math.min(15, agent.visitDuration)));
            plan.push(makeStand());
        } else {
            plan.push(makeWalkToWp(0, 'elevWait'));
            plan.push(makeWaitAtPanel(0, DIR_UP));
            plan.push(makeEnterElevator());
            plan.push(makePressFloor(floor));
            plan.push(makeWaitForFloor(floor));
            plan.push(makeExitElevator(floor));
            plan.push(makeWalkToWp(floor, 'conf_door'));
            plan.push(makeWalkToWp(floor, seatWp));
            plan.push(makeSit(floor, seatWp));
            plan.push({ type: 'ENTER_STATE', state: 'IN_MEETING' });
            plan.push(makeWaitSim(agent.visitDuration));
            plan.push(makeStand());
            plan.push({ type: 'RELEASE_SEAT' });
            plan.push(makeWalkToWp(floor, 'elevWait'));
            plan.push(makeWaitAtPanel(floor, DIR_DOWN));
            plan.push(makeEnterElevator());
            plan.push(makePressFloor(0));
            plan.push(makeWaitForFloor(0));
            plan.push(makeExitElevator(0));
        }
    }

    // Walk out.
    plan.push(makeWalkToWp(0, 'entrance'));
    plan.push(makeWalkToWp(0, 'outside'));
    plan.push(makeExitBuilding());
    plan.push({ type: 'ENTER_STATE', state: 'GONE' });
    return plan;
}

function planLeaveBuilding(agent) {
    const plan = [];
    appendLeaveSeat(plan, agent);
    plan.push(makeWalkToWp(agent.homeFloor, agent.deskDoorWpName));
    plan.push(makeWalkToWp(agent.homeFloor, 'elevWait'));
    plan.push(makeWaitAtPanel(agent.homeFloor, DIR_DOWN));
    plan.push(makeEnterElevator());
    plan.push(makePressFloor(0));
    plan.push(makeWaitForFloor(0));
    plan.push(makeExitElevator(0));
    plan.push(makeWalkToWp(0, 'entrance'));
    // Walk past the entrance onto the sidewalk, then vanish — so the exit
    // is visible rather than a pop-out at the lobby doors.
    plan.push(makeWalkToWp(0, 'outside'));
    plan.push(makeExitBuilding());
    plan.push({ type: 'ENTER_STATE', state: 'GONE' });
    return plan;
}

// Choose the next activity at a desk decision point.
function chooseNextActivity(agent) {
    const t = Clock.simMinute;
    // Time-gated hard decisions first.
    if (t >= agent.departureTime) return planLeaveBuilding(agent);

    const dueForMeeting = agent.plannedMeetingTimes.find(mt => t >= mt);
    if (dueForMeeting != null) {
        agent.plannedMeetingTimes = agent.plannedMeetingTimes.filter(mt => mt !== dueForMeeting);
        agent.attendedMeetings++;
        return planAttendMeeting(agent);
    }

    if (!agent.hasLunched && t >= agent.lunchTime && t < SIM.LUNCH_WINDOW[1] + 30) {
        return planGoToLunch(agent);
    }

    const r = Math.random();
    if (r < SIM.MEETING_PROB * 0.4)          return planAttendMeeting(agent);
    if (r < SIM.MEETING_PROB * 0.4 + SIM.LOUNGE_PROB) return planVisitLounge(agent);
    if (r < SIM.MEETING_PROB * 0.4 + SIM.LOUNGE_PROB + SIM.VISIT_PROB) return planVisitCoworker(agent);
    // Otherwise stay at desk working longer.
    const plan = [];
    plan.push(makeWaitSim(randInt(SIM.AT_DESK_MIN, SIM.AT_DESK_MAX)));
    plan.push({ type: 'PICK_NEXT_ACTIVITY' });
    return plan;
}

// ---------- Action execution ----------
function startAction(agent, action) {
    switch (action.type) {
        case 'WALK_TO_WP': {
            const nodes = world.floors[action.floor].nodes;
            // If currently child of elevator, reparent to scene first (we're on a floor).
            if (agent.group.parent !== scene) {
                // Reparent preserving world pos.
                const wp = new THREE.Vector3();
                agent.group.getWorldPosition(wp);
                if (agent.group.parent) agent.group.parent.remove(agent.group);
                scene.add(agent.group);
                agent.group.position.copy(wp);
                agent.container = scene;
            }
            const wp = new THREE.Vector3();
            agent.group.getWorldPosition(wp);
            const startNode = findNearestNode(nodes, wp);
            const path = bfsPath(nodes, startNode, action.wpName);
            if (!path || path.length === 0) {
                action._worldPath = [nodes[action.wpName].pos.clone()];
            } else {
                action._worldPath = path;
            }
            action._pathIdx = 0;
            agent.group.userData.isSitting = false;
            agent.group.userData.isWalking = true;
            break;
        }
        case 'WAIT_AT_PANEL': {
            if (action.dir === DIR_UP) elevator.callUp(action.floor);
            else elevator.callDown(action.floor);
            agent.state = 'WAITING_ELEVATOR';
            break;
        }
        case 'ENTER_ELEVATOR': {
            action._phase = 'reserve';
            break;
        }
        case 'PRESS_FLOOR': {
            elevator.pressDestination(action.floor);
            action.done = true;
            break;
        }
        case 'WAIT_FOR_FLOOR': {
            agent.state = 'IN_CAR';
            break;
        }
        case 'EXIT_ELEVATOR': {
            // Reparent: car -> scene, preserving world pos.
            const wp = new THREE.Vector3();
            agent.group.getWorldPosition(wp);
            if (agent.group.parent === elevator.car) {
                elevator.registerDisembark(agent.group);
                elevator.car.remove(agent.group);
                scene.add(agent.group);
                agent.group.position.copy(wp);
                agent.container = scene;
            }
            // Build path from current world pos to elevator waiting spot on toFloor.
            const targetNode = 'elevWait';
            const nodes = world.floors[action.toFloor].nodes;
            const path = bfsPath(nodes, findNearestNode(nodes, wp), targetNode);
            action._worldPath = path;
            action._pathIdx = 0;
            agent.group.userData.isWalking = true;
            agent.currentFloor = action.toFloor;
            break;
        }
        case 'SIT': {
            // Move to the named spot + apply facing from floor.sitTargets.
            const nodes = world.floors[action.floor].nodes;
            const node = nodes[action.wpName];
            if (node) agent.group.position.copy(node.pos);
            const target = world.floors[action.floor].sitTargets[action.wpName];
            if (target) {
                agent.group.rotation.y = target.facing;
                agent.group.userData.isSitting = !!target.sit;
                agent.group.userData.isWalking = false;
                if (target.sit) {
                    // Drop body to chair height so hips align with seat top.
                    agent.group.position.y -= 0.35;
                } else {
                    // Standing waypoint — jitter position in a small ring so
                    // multiple agents sharing the same named spot don't end
                    // up drawn on top of each other. Collision can only push
                    // bodies apart if they start slightly separated.
                    const angle = Math.random() * Math.PI * 2;
                    const radius = 0.35 + Math.random() * 0.4;  // 0.35–0.75
                    agent.group.position.x += Math.cos(angle) * radius;
                    agent.group.position.z += Math.sin(angle) * radius;
                }
            }
            action.done = true;
            break;
        }
        case 'STAND': {
            agent.group.userData.isSitting = false;
            agent.group.userData.isWalking = false;
            // Restore feet to floor level (undo the SIT drop).
            if (agent.container === elevator.car) {
                agent.group.position.y = 0;
            } else if (agent.currentFloor != null) {
                agent.group.position.y = agent.currentFloor * WORLD.FLOOR_HEIGHT;
            }
            // NOTE: don't release a seat reservation here — STAND is also
            // called at the *beginning* of plans (to get up from a desk),
            // long before the agent reaches the seat they reserved. Release
            // goes in the explicit RELEASE_SEAT action instead.
            action.done = true;
            break;
        }
        case 'RELEASE_SEAT': {
            releaseAgentSeat(agent);
            action.done = true;
            break;
        }
        case 'WAIT_SIM': {
            action.untilMin = Clock.simMinute + action.durationMin;
            break;
        }
        case 'EXIT_BUILDING': {
            despawnAgent(agent);
            action.done = true;
            break;
        }
        case 'ENTER_STATE': {
            agent.state = action.state;
            action.done = true;
            break;
        }
        case 'MARK_LUNCHED': {
            agent.hasLunched = true;
            action.done = true;
            break;
        }
        case 'PICK_NEXT_ACTIVITY': {
            const nextPlan = chooseNextActivity(agent);
            agent.plan = nextPlan.concat(agent.plan);
            action.done = true;
            break;
        }
    }
}

function tickAction(agent, action, dt) {
    switch (action.type) {
        case 'WALK_TO_WP': {
            walkAlongPath(agent, action, dt);
            break;
        }
        case 'WAIT_AT_PANEL': {
            // Keep the call registered — if the elevator visited this floor
            // for the opposite direction and cleared the button, re-press it.
            if (action.dir === DIR_UP   && !elevator.upCalls.has(action.floor))   elevator.callUp(action.floor);
            if (action.dir === DIR_DOWN && !elevator.downCalls.has(action.floor)) elevator.callDown(action.floor);
            // If doors are open at our floor and we can board, proceed.
            if (elevator.currentFloor === action.floor && elevator.state === 'DOOR_OPEN') {
                if (elevator.isAcceptingAt(action.floor, action.dir) && elevator.currentCapacityFree() > 0) {
                    action.done = true;
                }
            }
            break;
        }
        case 'ENTER_ELEVATOR': {
            // Phases:
            // reserve -> walkToDoor (world) -> reparent -> walkToSpot (local) -> complete
            if (action._phase === 'reserve') {
                // Bail out if elevator has moved on before we reserved — re-call
                // in our destination direction so it comes back for us.
                if (elevator.state !== 'DOOR_OPEN' || elevator.currentFloor !== agent.currentFloor) {
                    const nextPress = agent.plan.find(a => a && a.type === 'PRESS_FLOOR');
                    const destFloor = nextPress ? nextPress.floor : agent.currentFloor;
                    if (destFloor > agent.currentFloor)      elevator.callUp(agent.currentFloor);
                    else if (destFloor < agent.currentFloor) elevator.callDown(agent.currentFloor);
                    return;
                }
                const spot = elevator.reserveBoardingSpot(agent.group);
                if (spot === null) {
                    // Full right now. Wait; when the car leaves we'll re-call
                    // (via the check above on its next visit).
                    return;
                }
                action._spotLocal = spot;
                // World-space target: spot transformed by car's world matrix.
                const spotWorld = spot.clone();
                elevator.car.localToWorld(spotWorld);
                action._worldTargetSpot = spotWorld;
                // Threshold is aligned with the agent's assigned spot in X so
                // multiple boarders don't all converge at x=0 and collide.
                const doorThresholdWorld = new THREE.Vector3(spotWorld.x, elevator.car.position.y, WORLD.SHAFT_DEPTH/2 - 0.2);
                action._phase = 'walkToDoor';
                action._worldPath = [doorThresholdWorld];
                action._pathIdx = 0;
                agent.group.userData.isWalking = true;
                agent.group.userData.isSitting = false;
            }
            if (action._phase === 'walkToDoor') {
                // Stall guard: if a crowded lobby stops the boarder from
                // reaching the threshold, teleport after 1.5 motion-seconds.
                const wpNow = new THREE.Vector3(); agent.group.getWorldPosition(wpNow);
                if (action._prevWalk) {
                    const moved = Math.hypot(wpNow.x - action._prevWalk.x, wpNow.z - action._prevWalk.z);
                    action._stallT = moved < 0.005 ? (action._stallT || 0) + dt : 0;
                }
                action._prevWalk = wpNow;
                if ((action._stallT || 0) > 1.5) {
                    const t = action._worldPath[0];
                    const local = t.clone();
                    if (agent.group.parent) agent.group.parent.worldToLocal(local);
                    agent.group.position.x = local.x;
                    agent.group.position.z = local.z;
                }
                const done = walkStepWorld(agent, action._worldPath[0], dt) || (action._stallT || 0) > 1.5;
                if (done) {
                    // Reparent scene -> car, preserving world pos.
                    const wp = new THREE.Vector3();
                    agent.group.getWorldPosition(wp);
                    scene.remove(agent.group);
                    elevator.car.add(agent.group);
                    agent.container = elevator.car;
                    // Convert world to car-local.
                    const local = wp.clone();
                    elevator.car.worldToLocal(local);
                    agent.group.position.copy(local);
                    action._phase = 'walkToSpot';
                    action._stallT = 0;
                    action._prevWalk = null;
                }
            }
            if (action._phase === 'walkToSpot') {
                const target = action._spotLocal;
                const done = walkStepLocal(agent, target, dt);
                if (done) {
                    elevator.completeBoard(agent.group);
                    // Doors are on the car's +Z face, so face +Z (rotation.y = 0)
                    // to look "forward" toward the exit while riding.
                    agent.group.rotation.y = 0;
                    agent.group.userData.isWalking = false;
                    agent.state = 'IN_CAR';
                    agent.currentFloor = null;
                    action.done = true;
                }
            }
            break;
        }
        case 'WAIT_FOR_FLOOR': {
            if (elevator.currentFloor === action.floor && elevator.state === 'DOOR_OPEN') {
                action.done = true;
            }
            break;
        }
        case 'EXIT_ELEVATOR': {
            walkAlongPath(agent, action, dt);
            if (action.done) {
                elevator.completeDisembark(agent.group);
                agent.state = 'ON_FLOOR';
            }
            break;
        }
        case 'WAIT_SIM': {
            if (Clock.simMinute >= action.untilMin) {
                action.done = true;
            }
            break;
        }
        // STAND, SIT, EXIT_BUILDING, ENTER_STATE, MARK_LUNCHED, PICK_NEXT_ACTIVITY, PRESS_FLOOR all finish in startAction.
    }
}

function walkStepWorld(agent, targetWorld, dt) {
    const wp = new THREE.Vector3();
    agent.group.getWorldPosition(wp);
    const dx = targetWorld.x - wp.x;
    const dz = targetWorld.z - wp.z;
    const dist = Math.sqrt(dx*dx + dz*dz);
    if (dist < 0.08) return true;
    const step = Math.min(dist, SIM.WALK_SPEED * dt);
    const nx = dx / dist, nz = dz / dist;
    const newWorld = wp.clone();
    newWorld.x += nx * step;
    newWorld.z += nz * step;
    const local = newWorld.clone();
    if (agent.group.parent) agent.group.parent.worldToLocal(local);
    agent.group.position.x = local.x;
    agent.group.position.z = local.z;
    agent.group.rotation.y = Math.atan2(nx, nz);
    return false;
}
function walkStepLocal(agent, targetLocal, dt) {
    const dx = targetLocal.x - agent.group.position.x;
    const dz = targetLocal.z - agent.group.position.z;
    const dist = Math.sqrt(dx*dx + dz*dz);
    if (dist < 0.06) return true;
    const step = Math.min(dist, SIM.WALK_SPEED * dt);
    const nx = dx / dist, nz = dz / dist;
    agent.group.position.x += nx * step;
    agent.group.position.z += nz * step;
    agent.group.rotation.y = Math.atan2(nx, nz);
    return false;
}
function walkAlongPath(agent, action, dt) {
    if (action._pathIdx >= action._worldPath.length) {
        action.done = true;
        agent.group.userData.isWalking = false;
        return;
    }
    const target = action._worldPath[action._pathIdx];
    // Track position so we can detect stalls (agent blocked by a body at or
    // beyond the waypoint). Without this, walking legs would animate forever.
    const wp = new THREE.Vector3(); agent.group.getWorldPosition(wp);
    const prev = action._prevWp;
    if (prev) {
        const moved = Math.hypot(wp.x - prev.x, wp.z - prev.z);
        action._stallT = moved < 0.005 * dt * 60 ? (action._stallT || 0) + dt : 0;
    }
    action._prevWp = wp;
    if ((action._stallT || 0) > 1.2) {
        // Give up on this waypoint; skip to the next one.
        action._pathIdx++;
        action._stallT = 0;
        if (action._pathIdx >= action._worldPath.length) {
            action.done = true;
            agent.group.userData.isWalking = false;
        }
        return;
    }
    const done = walkStepWorld(agent, target, dt);
    if (done) {
        action._pathIdx++;
        action._stallT = 0;
        if (action._pathIdx >= action._worldPath.length) {
            action.done = true;
            agent.group.userData.isWalking = false;
        }
    }
}

// ---------- Collision avoidance (soft repulsion) ----------
// Gentle, low-strength nudge so bodies don't occupy the same spot. Skipped
// inside the elevator car because spots are pre-assigned (without the skip,
// four boarders in a 3×3 car push each other around forever — the "twitch
// in place" bug).
function applyCollisions() {
    const R = 0.7;
    for (let i = 0; i < agents.length; i++) {
        const A = agents[i];
        if (A.state === 'AWAY' || A.state === 'GONE' || A.state === 'DISABLED') continue;
        if (A.group.userData.isSitting) continue;
        if (A.group.parent === elevator.car) continue;
        // Boarders get a collision exemption — they have an assigned spot
        // and *must* be able to push through a crowded lobby to reach the
        // open doors before the MAX_DOOR_OPEN_S safety timer fires.
        if (A.currentAction && A.currentAction.type === 'ENTER_ELEVATOR') continue;
        for (let j = i + 1; j < agents.length; j++) {
            const B = agents[j];
            if (B.state === 'AWAY' || B.state === 'GONE' || B.state === 'DISABLED') continue;
            if (B.group.userData.isSitting) continue;
            if (B.currentAction && B.currentAction.type === 'ENTER_ELEVATOR') continue;
            if (A.group.parent !== B.group.parent) continue;
            const wA = new THREE.Vector3(); A.group.getWorldPosition(wA);
            const wB = new THREE.Vector3(); B.group.getWorldPosition(wB);
            if (Math.abs(wA.y - wB.y) > 1.0) continue;
            const dx = wA.x - wB.x, dz = wA.z - wB.z;
            const d = Math.sqrt(dx*dx + dz*dz);
            if (d > R) continue;
            let nx, nz, effectiveD;
            if (d < 1e-3) {
                // Exact overlap — no gradient direction. Pick a random one
                // so the bodies separate instead of sitting on each other.
                const a = Math.random() * Math.PI * 2;
                nx = Math.cos(a); nz = Math.sin(a);
                effectiveD = 0;
            } else {
                nx = dx / d; nz = dz / d;
                effectiveD = d;
            }
            // Reduced strength so an agent walking toward a goal can still
            // make progress past a stationary body — but strong enough to
            // enforce some personal space over a few frames.
            const push = (R - effectiveD) * 0.22;
            A.group.position.x += nx * push;
            A.group.position.z += nz * push;
            B.group.position.x -= nx * push;
            B.group.position.z -= nz * push;
        }
    }
}

// ---------- Main loop ----------
const realClock = new THREE.Clock();
function render() {
    requestAnimationFrame(render);
    const realDt = Math.min(0.05, realClock.getDelta());  // cap at 50ms to keep sim stable
    Clock.tick(realDt);
    updateLighting();

    // Pure real-time multiplier: at 1x, motion plays at walking pace and the
    // sim clock advances at wall-clock speed. Higher slider values fast-
    // forward EVERYTHING in lockstep, so elevator trips never fall behind
    // arrivals the way they did with the old decoupled model.
    const motionDt = realDt * Clock.timeScale;

    elevator.tick(motionDt);
    topUpVisitors();

    for (const agent of agents) {
        const t = Clock.simMinute;

        // Spawning — workers follow the full daily schedule; visitors do
        // a single short visit plan then leave.
        if (agent.state === 'AWAY' && t >= agent.arrivalTime) {
            spawnAtEntrance(agent);
            agent.plan = agent.role === 'VISITOR'
                ? planVisitorVisit(agent)
                : planArriveToDesk(agent);
        }
        if (agent.state === 'GONE' || agent.state === 'DISABLED') continue;
        if (agent.state === 'AWAY') continue;

        // Forced departure override — only applies to workers (visitors run
        // their own visit plan which already ends in EXIT_BUILDING).
        if (agent.role === 'WORKER' && t >= agent.departureTime && agent.state !== 'LEAVING' && agent.state !== 'GONE') {
            // Replace current plan with leave plan (after any critical action completes).
            if (!agent.plan.some(a => a && a.type === 'EXIT_BUILDING')) {
                // If they're mid-elevator cycle (boarding/waiting-for-floor/exiting),
                // let that finish naturally and queue leave at the end.
                const criticalInProgress = agent.currentAction &&
                    ['ENTER_ELEVATOR','WAIT_FOR_FLOOR','EXIT_ELEVATOR','WAIT_AT_PANEL'].includes(agent.currentAction.type);
                if (!criticalInProgress) {
                    releaseAgentSeat(agent);
                    agent.plan = planLeaveBuilding(agent);
                    agent.currentAction = null;
                    agent.state = 'LEAVING';
                }
            }
        }

        // Action dispatch — loop so zero-duration actions (SIT, STAND, PRESS,
        // ENTER_STATE, MARK_LUNCHED, PICK_NEXT_ACTIVITY) finish in the same
        // frame they start, handing off to the next real action without a gap.
        let iters = 0;
        while (iters++ < 16) {
            if (!agent.currentAction) {
                if (agent.plan.length === 0) break;
                agent.currentAction = agent.plan.shift();
                startAction(agent, agent.currentAction);
                if (agent.currentAction.done) { agent.currentAction = null; continue; }
            }
            tickAction(agent, agent.currentAction, motionDt);
            if (agent.currentAction.done) { agent.currentAction = null; continue; }
            break;
        }
    }

    applyCollisions();

    // Walk animation for all people.
    for (const a of agents) {
        if (a.group.parent) animatePersonWalking(a.group, motionDt);
    }

    controls.update();
    renderer.render(scene, camera);
    updateHUD();
}

// ---------- UI ----------
let hudEl, timeEl, speedLabel, occupancyLabel, legendEl;
function buildUI() {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:absolute;top:10px;left:10px;background:rgba(0,0,0,0.65);color:#fff;padding:12px 14px;border-radius:6px;font-family:system-ui,sans-serif;font-size:13px;z-index:10;min-width:240px;';

    timeEl = document.createElement('div');
    timeEl.style.cssText = 'font-size:22px;font-weight:700;letter-spacing:0.5px;margin-bottom:8px;color:#ffcc66;';
    wrap.appendChild(timeEl);

    speedLabel = document.createElement('div');
    speedLabel.textContent = `Speed: ${Clock.timeScale}× realtime`;
    wrap.appendChild(speedLabel);

    // Log-ish slider stops so the range 1..600 is steerable.
    const STOPS = [1, 2, 5, 10, 20, 40, 60, 90, 120, 180, 240, 360, 480, 600];
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = String(STOPS.length - 1);
    slider.step = '1';
    slider.value = String(STOPS.indexOf(Clock.timeScale));
    if (parseInt(slider.value, 10) < 0) slider.value = String(STOPS.indexOf(120));
    slider.style.cssText = 'width:220px;display:block;margin:4px 0 10px;';
    slider.addEventListener('input', () => {
        Clock.timeScale = STOPS[parseInt(slider.value, 10)];
        speedLabel.textContent = `Speed: ${Clock.timeScale}× realtime`;
    });
    wrap.appendChild(slider);

    // Occupancy slider — controls how many of the max-capacity agents come in.
    occupancyLabel = document.createElement('div');
    occupancyLabel.textContent = `Occupancy: ${targetOccupancy} / ${SIM.MAX_OCCUPANCY} people`;
    wrap.appendChild(occupancyLabel);

    const occSlider = document.createElement('input');
    occSlider.type = 'range';
    occSlider.min = '1';
    occSlider.max = String(SIM.MAX_OCCUPANCY);
    occSlider.step = '1';
    occSlider.value = String(targetOccupancy);
    occSlider.style.cssText = 'width:220px;display:block;margin:4px 0 10px;';
    occSlider.addEventListener('input', () => {
        targetOccupancy = parseInt(occSlider.value, 10);
        occupancyLabel.textContent = `Occupancy: ${targetOccupancy} / ${SIM.MAX_OCCUPANCY} people`;
        applyOccupancy();
    });
    wrap.appendChild(occSlider);

    hudEl = document.createElement('div');
    hudEl.style.cssText = 'font-size:11px;line-height:1.4;opacity:0.85;max-height:320px;overflow-y:auto;';
    wrap.appendChild(hudEl);

    legendEl = document.createElement('div');
    legendEl.style.cssText = 'margin-top:8px;padding-top:8px;border-top:1px solid #444;font-size:11px;opacity:0.8;';
    legendEl.innerHTML = `
        <div>Elevator: yellow car, capacity ${ELEVATOR.MAX_CAPACITY}</div>
        <div>Orange display = current floor + direction</div>
        <div>Green arrows lit = call pending that direction</div>
    `;
    wrap.appendChild(legendEl);

    document.body.appendChild(wrap);
}
function updateHUD() {
    if (!timeEl) return;
    timeEl.textContent = Clock.format();
    const stateCount = {};
    for (const a of agents) stateCount[a.state] = (stateCount[a.state] || 0) + 1;
    const dirStr = elevator.direction === DIR_UP ? 'UP' : (elevator.direction === DIR_DOWN ? 'DOWN' : 'IDLE');
    const lines = [];
    lines.push(`<b>Elevator</b>: floor ${elevator.currentFloor} · ${dirStr} · ${elevator.state}`);
    lines.push(`  passengers: ${elevator.passengers.size}/${ELEVATOR.MAX_CAPACITY}   destinations: {${[...elevator.destinations].sort().join(',')}}`);
    lines.push(`  up-calls: {${[...elevator.upCalls].sort().join(',')}}   down-calls: {${[...elevator.downCalls].sort().join(',')}}`);
    lines.push(`<b>Agents</b>:`);
    const order = ['AWAY','ARRIVING','WAITING_ELEVATOR','IN_CAR','ON_FLOOR','AT_DESK','AT_BREAK','IN_MEETING','VISITING','AT_LUNCH','LEAVING','GONE'];
    for (const s of order) {
        if (stateCount[s]) lines.push(`  ${s}: ${stateCount[s]}`);
    }
    hudEl.innerHTML = lines.join('<br>');
}

// ---------- Boot ----------
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
buildUI();
render();
