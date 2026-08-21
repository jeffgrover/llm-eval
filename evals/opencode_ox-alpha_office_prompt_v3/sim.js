const MAX_WORKERS = 20;
const MAX_VISITORS = 80;
const MAX_OCCUPANCY = MAX_WORKERS + MAX_VISITORS;
const DEFAULT_OCCUPANCY = 45;
const WORKER_NAMES = ["Ava", "Ben", "Cal", "Dot", "Eli", "Fay", "Gus", "Hana", "Ike", "June", "Kip", "Lena", "Milo", "Nora", "Omar", "Pia", "Quinn", "Ravi", "Sara", "Theo", "Uma", "Vic", "Wren", "Xan", "Yuki", "Zoe"];
const ELEV_ACTION_TYPES = new Set(["WAIT_AT_PANEL", "ENTER_ELEVATOR", "PRESS_FLOOR", "WAIT_FOR_FLOOR", "EXIT_ELEVATOR"]);
const PRESENT_STATES = new Set(["ARRIVING", "WAITING_ELEVATOR", "IN_CAR", "ON_FLOOR", "AT_DESK", "IN_MEETING", "AT_BREAK", "AT_LUNCH", "VISITING", "LEAVING"]);
const BISTRO_SEATS = ["bistro0w", "bistro0e", "bistro1w", "bistro1e", "bistro2w", "bistro2e", "bistro3w", "bistro3e"];
const FRONT_LOUNGE_SEATS = ["fl_couch", "fl_arm0", "fl_arm1"];
const BACK_LOUNGE_SEATS = ["back_lounge_N", "back_lounge_S", "pit_N", "pit_S", "pit_E", "pit_W"];
const LOITER_SEATS = ["lobby_stand_center", "lobby_stand_NE", "lobby_stand_NW", "lobby_stand_midE", "lobby_stand_midW", "lobby_stand_entry"];
const OFFICE_LOUNGE_SEATS = ["lounge_spot0", "lounge_spot1", "lounge_spot2"];
const CONF_SEATS = ["conf_seat0", "conf_seat1", "conf_seat2", "conf_seat3"];

const DAY_KEYS = [
    { h: 0.0, bg: [0.055, 0.065, 0.10], sun: [0.55, 0.62, 0.85], si: 0.05, ai: 0.45, hi: 0.32 },
    { h: 5.6, bg: [0.055, 0.065, 0.10], sun: [0.55, 0.62, 0.85], si: 0.05, ai: 0.45, hi: 0.32 },
    { h: 6.15, bg: [0.45, 0.33, 0.34], sun: [1.0, 0.62, 0.35], si: 0.35, ai: 0.46, hi: 0.36 },
    { h: 6.7, bg: [0.55, 0.70, 0.88], sun: [1.0, 0.88, 0.68], si: 0.85, ai: 0.54, hi: 0.55 },
    { h: 9.0, bg: [0.62, 0.78, 0.93], sun: [1.0, 0.96, 0.88], si: 0.95, ai: 0.58, hi: 0.60 },
    { h: 16.6, bg: [0.62, 0.78, 0.93], sun: [1.0, 0.96, 0.88], si: 0.95, ai: 0.58, hi: 0.60 },
    { h: 17.7, bg: [0.82, 0.60, 0.40], sun: [1.0, 0.60, 0.30], si: 0.65, ai: 0.50, hi: 0.44 },
    { h: 18.4, bg: [0.26, 0.24, 0.36], sun: [1.0, 0.45, 0.35], si: 0.20, ai: 0.46, hi: 0.35 },
    { h: 19.2, bg: [0.055, 0.065, 0.10], sun: [0.55, 0.62, 0.85], si: 0.05, ai: 0.45, hi: 0.32 },
    { h: 24.0, bg: [0.055, 0.065, 0.10], sun: [0.55, 0.62, 0.85], si: 0.05, ai: 0.45, hi: 0.32 }
];

let scene = null;
let camera = null;
let renderer = null;
let controls = null;
let world = null;
let elevator = null;
let simClock = null;
let frameClock = null;
let agents = null;
let seatReservations = null;
let targetOccupancy = DEFAULT_OCCUPANCY;
let ambientLight = null;
let hemiLight = null;
let sunLight = null;
let hudTime = null;
let hudStats = null;
let hudSpeedLabel = null;
let hudOccLabel = null;
let speedSlider = null;
let occSlider = null;
let frameCounter = 0;

function startSimulation() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x20242a);
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(28, 24, 28);
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.sortObjects = true;
    document.body.appendChild(renderer.domElement);
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 9, 0);
    controls.enableDamping = true;
    ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
    scene.add(ambientLight);
    hemiLight = new THREE.HemisphereLight(0xbfd7ff, 0x303020, 0.45);
    scene.add(hemiLight);
    sunLight = new THREE.DirectionalLight(0xffffff, 0.9);
    sunLight.position.set(20, 35, 18);
    scene.add(sunLight);
    world = createWorld(scene);
    elevator = new Elevator(scene, world);
    initSim();
    frameCounter = 0;
    function animate() {
        requestAnimationFrame(animate);
        const realDt = Math.min(0.05, frameClock.getDelta());
        simClock.tick(realDt);
        updateDaylight();
        const motionDt = realDt * simClock.timeScale;
        topUpVisitors();
        const subCount = Math.max(1, Math.min(12, Math.ceil(motionDt / 1.0)));
        const subDt = motionDt / subCount;
        for (let s = 0; s < subCount; s++) {
            elevator.tick(subDt);
            for (const agent of agents) updateAgent(agent, subDt);
        }
        applyCollisions(motionDt);
        updateStalls(motionDt);
        for (const agent of agents) {
            if (agent.group.parent) animatePersonWalking(agent.group, motionDt);
        }
        controls.update();
        renderer.render(scene, camera);
        frameCounter += 1;
        if (frameCounter % 6 === 0) updateHUD();
    }
    animate();
}

function initSim() {
    frameClock = new THREE.Clock();
    simClock = {
        simMinute: 7 * 60 + 30,
        timeScale: 120,
        tick: function (realDt) {
            this.simMinute += realDt * this.timeScale / 60;
            if (this.simMinute >= 1260) {
                this.simMinute = 450;
                resetAgentStates();
            }
        },
        format: function () {
            const h = Math.floor(this.simMinute / 60) % 24;
            const m = Math.floor(this.simMinute % 60);
            const ampm = h >= 12 ? "PM" : "AM";
            const h12 = h % 12 === 0 ? 12 : h % 12;
            return " " + h12 + ":" + (m < 10 ? "0" : "") + m + " " + ampm;
        }
    };
    seatReservations = new Set();
    targetOccupancy = DEFAULT_OCCUPANCY;
    agents = buildAgentPool();
    resetAgentStates();
    buildHUD();
    updateHUD();
    window.simAgents = agents;
    window.simElevator = elevator;
    window.simClockRef = simClock;
}

function buildAgentPool() {
    const pool = [];
    let deskIndex = 0;
    for (let i = 0; i < MAX_OCCUPANCY; i++) {
        const isWorker = i < MAX_WORKERS;
        const group = createPerson();
        const agent = {
            id: i,
            role: isWorker ? "WORKER" : "VISITOR",
            name: WORKER_NAMES[Math.floor(Math.random() * WORKER_NAMES.length)],
            group: group,
            speed: 1.15 + Math.random() * 0.3,
            laneX: 0,
            laneZ: 0,
            state: "AWAY",
            floor: 0,
            node: null,
            inCar: false,
            plan: [],
            currentAction: null,
            walkPath: [],
            walkIndex: 0,
            walkTargetName: null,
            seatKey: null,
            departing: false,
            _stallT: 0,
            _framePos: null,
            homeFloor: 0,
            deskWpName: null,
            deskDoorWpName: null,
            arrivalTime: 460,
            lunchTime: 720,
            lunchDuration: 30,
            departureTime: 1020,
            plannedMeetingTimes: [],
            hasLunched: false
        };
        if (isWorker) {
            const f = 1 + Math.floor(deskIndex / 4);
            const desk = world.floors[f].desks[deskIndex % 4];
            agent.homeFloor = f;
            agent.deskWpName = desk.wpName;
            agent.deskDoorWpName = desk.doorWpName;
            deskIndex += 1;
        }
        resampleSchedule(agent);
        pool.push(agent);
    }
    return pool;
}

function resampleSchedule(agent) {
    if (agent.role === "WORKER") {
        agent.arrivalTime = 495 + Math.random() * 75;
        agent.lunchTime = 690 + Math.random() * 90;
        agent.lunchDuration = 25 + Math.random() * 35;
        agent.departureTime = Math.random() < 0.85 ? 1005 + Math.random() * 105 : 1110 + Math.random() * 75;
        agent.hasLunched = false;
        agent.plannedMeetingTimes = [];
        if (Math.random() < 0.5) agent.plannedMeetingTimes.push(570 + Math.random() * 120);
        if (Math.random() < 0.5) agent.plannedMeetingTimes.push(810 + Math.random() * 150);
        agent.plannedMeetingTimes.sort(function (x, y) { return x - y; });
    } else {
        agent.arrivalTime = 460 + Math.random() * 60;
    }
}

function resetAgentStates() {
    seatReservations.clear();
    for (const agent of agents) {
        if (agent.group.parent) agent.group.parent.remove(agent.group);
        agent.group.userData.isSitting = false;
        agent.group.userData.isWalking = false;
        agent.inCar = false;
        agent.plan = [];
        agent.currentAction = null;
        agent.walkPath = [];
        agent.walkIndex = 0;
        agent.walkTargetName = null;
        agent.node = null;
        agent.floor = 0;
        agent.seatKey = null;
        agent.departing = false;
        agent._stallT = 0;
        agent._framePos = null;
        agent.hasLunched = false;
        resampleSchedule(agent);
        agent.state = agent.id < targetOccupancy ? "AWAY" : "DISABLED";
    }
    if (elevator) elevator.reset();
}

function countPresent() {
    let n = 0;
    for (const agent of agents) {
        if (PRESENT_STATES.has(agent.state)) n += 1;
    }
    return n;
}

function topUpVisitors() {
    const now = simClock.simMinute;
    if (now < 455 || now > 1030) return;
    const present = countPresent();
    if (present >= targetOccupancy) return;
    let deficit = targetOccupancy - present;
    for (const agent of agents) {
        if (deficit <= 0) break;
        if (agent.role !== "VISITOR") continue;
        const rearmable = agent.state === "GONE" || (agent.state === "AWAY" && agent.arrivalTime - now > 6);
        if (!rearmable) continue;
        agent.arrivalTime = now + Math.random() * 6;
        agent.state = "AWAY";
        deficit -= 1;
    }
}

function applyOccupancy() {
    for (const agent of agents) {
        if (agent.id < targetOccupancy) {
            if (agent.state === "DISABLED") {
                agent.state = "AWAY";
                if (agent.role === "VISITOR") agent.arrivalTime = simClock.simMinute + Math.random() * 6;
            }
        } else {
            if (agent.state === "AWAY" || agent.state === "GONE") {
                agent.state = "DISABLED";
                agent.plan = [];
                agent.currentAction = null;
                if (agent.group.parent) agent.group.parent.remove(agent.group);
            }
        }
    }
}

function spawnAgent(agent) {
    const jx = (Math.random() - 0.5) * 2.2;
    const jz = (Math.random() - 0.5) * 0.75;
    if (agent.group.parent) agent.group.parent.remove(agent.group);
    agent.group.position.set(jx, 0, 12 + jz);
    agent.group.rotation.y = Math.PI;
    scene.add(agent.group);
    agent.floor = 0;
    agent.node = "outside";
    agent.state = "ARRIVING";
    agent.inCar = false;
    agent.currentAction = null;
    agent.seatKey = null;
    agent.departing = false;
    agent.walkPath = [];
    agent.walkIndex = 0;
    agent.laneX = (Math.random() - 0.5) * 0.9;
    agent.laneZ = (Math.random() - 0.5) * 0.6;
    agent._stallT = 0;
    agent._framePos = null;
    agent.plan = agent.role === "WORKER" ? planArriveToDesk(agent) : planVisitorVisit(agent);
}

function walkAct(floor, wp) {
    return { type: "WALK_TO_WP", floor: floor, wp: wp };
}

function travelActs(fromFloor, toFloor) {
    if (fromFloor === toFloor) return [];
    return [
        walkAct(fromFloor, "elevWait"),
        { type: "WAIT_AT_PANEL", floor: fromFloor, toFloor: toFloor },
        { type: "ENTER_ELEVATOR", floor: fromFloor, toFloor: toFloor },
        { type: "PRESS_FLOOR", floor: toFloor },
        { type: "WAIT_FOR_FLOOR", floor: toFloor },
        { type: "EXIT_ELEVATOR", floor: toFloor }
    ];
}

function releaseHeldSeat(agent) {
    if (agent.seatKey) {
        seatReservations.delete(agent.seatKey);
        agent.seatKey = null;
    }
}

function reserveSeat(agent, floor, wpName) {
    const key = floor + ":" + wpName;
    if (seatReservations.has(key)) return false;
    seatReservations.add(key);
    agent.seatKey = key;
    return true;
}

function tryReserveAny(agent, floor, names) {
    const shuffled = names.slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = shuffled[i];
        shuffled[i] = shuffled[j];
        shuffled[j] = tmp;
    }
    for (const nm of shuffled) {
        if (reserveSeat(agent, floor, nm)) return nm;
    }
    return null;
}

function pushLoiter(acts) {
    const wp = LOITER_SEATS[Math.floor(Math.random() * LOITER_SEATS.length)];
    acts.push(walkAct(0, wp));
    acts.push({ type: "SIT", floor: 0, wp: wp });
    acts.push({ type: "WAIT_SIM", minutes: 8 + Math.random() * 12 });
    acts.push({ type: "STAND" });
}

function planArriveToDesk(agent) {
    const acts = [];
    acts.push.apply(acts, travelActs(0, agent.homeFloor));
    acts.push(walkAct(agent.homeFloor, agent.deskDoorWpName));
    acts.push(walkAct(agent.homeFloor, agent.deskWpName));
    acts.push({ type: "SIT", floor: agent.homeFloor, wp: agent.deskWpName });
    acts.push({ type: "ENTER_STATE", state: "AT_DESK" });
    acts.push({ type: "WAIT_SIM", minutes: 25 + Math.random() * 45 });
    acts.push({ type: "PICK_NEXT_ACTIVITY" });
    return acts;
}

function planGoToLunch(agent) {
    const acts = [{ type: "STAND" }];
    acts.push.apply(acts, travelActs(agent.floor, 0));
    const seat = tryReserveAny(agent, 0, BISTRO_SEATS);
    if (seat) {
        acts.push(walkAct(0, seat));
        acts.push({ type: "SIT", floor: 0, wp: seat });
        acts.push({ type: "ENTER_STATE", state: "AT_LUNCH" });
        acts.push({ type: "WAIT_SIM", minutes: agent.lunchDuration });
        acts.push({ type: "MARK_LUNCHED" });
        acts.push({ type: "STAND" });
        acts.push({ type: "RELEASE_SEAT" });
    } else {
        acts.push(walkAct(0, "cafe_order"));
        acts.push({ type: "SIT", floor: 0, wp: "cafe_order" });
        acts.push({ type: "ENTER_STATE", state: "AT_LUNCH" });
        acts.push({ type: "WAIT_SIM", minutes: agent.lunchDuration });
        acts.push({ type: "MARK_LUNCHED" });
        acts.push({ type: "STAND" });
    }
    acts.push.apply(acts, travelActs(0, agent.homeFloor));
    acts.push(walkAct(agent.homeFloor, agent.deskDoorWpName));
    acts.push(walkAct(agent.homeFloor, agent.deskWpName));
    acts.push({ type: "SIT", floor: agent.homeFloor, wp: agent.deskWpName });
    acts.push({ type: "ENTER_STATE", state: "AT_DESK" });
    acts.push({ type: "WAIT_SIM", minutes: 20 + Math.random() * 40 });
    acts.push({ type: "PICK_NEXT_ACTIVITY" });
    return acts;
}

function planVisitLounge(agent) {
    const acts = [{ type: "STAND" }];
    const seat = tryReserveAny(agent, agent.homeFloor, OFFICE_LOUNGE_SEATS);
    const wp = seat ? seat : "water_cooler";
    acts.push(walkAct(agent.homeFloor, wp));
    acts.push({ type: "SIT", floor: agent.homeFloor, wp: wp });
    acts.push({ type: "ENTER_STATE", state: "AT_BREAK" });
    acts.push({ type: "WAIT_SIM", minutes: 5 + Math.random() * 7 });
    acts.push({ type: "STAND" });
    if (seat) acts.push({ type: "RELEASE_SEAT" });
    acts.push(walkAct(agent.homeFloor, agent.deskWpName));
    acts.push({ type: "SIT", floor: agent.homeFloor, wp: agent.deskWpName });
    acts.push({ type: "ENTER_STATE", state: "AT_DESK" });
    acts.push({ type: "WAIT_SIM", minutes: 18 + Math.random() * 45 });
    acts.push({ type: "PICK_NEXT_ACTIVITY" });
    return acts;
}

function planAttendMeeting(agent) {
    const floor = Math.random() < 0.65 ? agent.homeFloor : 1 + Math.floor(Math.random() * 5);
    const seat = tryReserveAny(agent, floor, CONF_SEATS);
    if (!seat) return planVisitLounge(agent);
    const acts = [{ type: "STAND" }];
    acts.push.apply(acts, travelActs(agent.floor, floor));
    acts.push(walkAct(floor, seat));
    acts.push({ type: "SIT", floor: floor, wp: seat });
    acts.push({ type: "ENTER_STATE", state: "IN_MEETING" });
    acts.push({ type: "WAIT_SIM", minutes: 22 + Math.random() * 23 });
    acts.push({ type: "STAND" });
    acts.push({ type: "RELEASE_SEAT" });
    acts.push.apply(acts, travelActs(floor, agent.homeFloor));
    acts.push(walkAct(agent.homeFloor, agent.deskWpName));
    acts.push({ type: "SIT", floor: agent.homeFloor, wp: agent.deskWpName });
    acts.push({ type: "ENTER_STATE", state: "AT_DESK" });
    acts.push({ type: "WAIT_SIM", minutes: 15 + Math.random() * 30 });
    acts.push({ type: "PICK_NEXT_ACTIVITY" });
    return acts;
}

function planVisitCoworker(agent) {
    const candidates = [];
    for (const other of agents) {
        if (other !== agent && other.role === "WORKER" && other.state === "AT_DESK") candidates.push(other);
    }
    if (candidates.length === 0) return planVisitLounge(agent);
    const target = candidates[Math.floor(Math.random() * candidates.length)];
    const acts = [{ type: "STAND" }];
    acts.push.apply(acts, travelActs(agent.floor, target.homeFloor));
    acts.push(walkAct(target.homeFloor, target.deskDoorWpName));
    acts.push({ type: "ENTER_STATE", state: "AT_BREAK" });
    acts.push({ type: "WAIT_SIM", minutes: 6 + Math.random() * 12 });
    acts.push.apply(acts, travelActs(target.homeFloor, agent.homeFloor));
    acts.push(walkAct(agent.homeFloor, agent.deskWpName));
    acts.push({ type: "SIT", floor: agent.homeFloor, wp: agent.deskWpName });
    acts.push({ type: "ENTER_STATE", state: "AT_DESK" });
    acts.push({ type: "WAIT_SIM", minutes: 15 + Math.random() * 30 });
    acts.push({ type: "PICK_NEXT_ACTIVITY" });
    return acts;
}

function planLeaveFrom(agent) {
    releaseHeldSeat(agent);
    agent.departing = true;
    const acts = [{ type: "STAND" }];
    if (agent.floor > 0) {
        acts.push.apply(acts, travelActs(agent.floor, 0));
    } else if (agent.node !== "lobby_center" && agent.node !== "entrance" && agent.node !== "front_door_threshold" && agent.node !== "outside") {
        acts.push(walkAct(0, "lobby_center"));
    }
    acts.push(walkAct(0, "entrance"));
    acts.push(walkAct(0, "front_door_threshold"));
    acts.push(walkAct(0, "outside"));
    acts.push({ type: "ENTER_STATE", state: "LEAVING" });
    acts.push({ type: "EXIT_BUILDING" });
    return acts;
}

function planVisitorVisit(agent) {
    const acts = [{ type: "ENTER_STATE", state: "VISITING" }];
    acts.push(walkAct(0, "front_door_threshold"));
    acts.push(walkAct(0, "entrance"));
    acts.push(walkAct(0, "lobby_center"));
    const r = Math.random();
    if (r < 0.10) {
        const seat = tryReserveAny(agent, 0, BISTRO_SEATS);
        if (seat) {
            acts.push(walkAct(0, seat));
            acts.push({ type: "SIT", floor: 0, wp: seat });
            acts.push({ type: "WAIT_SIM", minutes: 15 + Math.random() * 20 });
            acts.push({ type: "STAND" });
            acts.push({ type: "RELEASE_SEAT" });
        } else {
            pushLoiter(acts);
        }
    } else if (r < 0.16) {
        acts.push(walkAct(0, "cafe_order"));
        acts.push({ type: "SIT", floor: 0, wp: "cafe_order" });
        acts.push({ type: "WAIT_SIM", minutes: 6 + Math.random() * 9 });
        acts.push({ type: "STAND" });
    } else if (r < 0.30) {
        const seat = tryReserveAny(agent, 0, FRONT_LOUNGE_SEATS);
        if (seat) {
            acts.push(walkAct(0, seat));
            acts.push({ type: "SIT", floor: 0, wp: seat });
            acts.push({ type: "WAIT_SIM", minutes: 12 + Math.random() * 18 });
            acts.push({ type: "STAND" });
            acts.push({ type: "RELEASE_SEAT" });
        } else {
            pushLoiter(acts);
        }
    } else if (r < 0.42) {
        const seat = tryReserveAny(agent, 0, BACK_LOUNGE_SEATS);
        if (seat) {
            acts.push(walkAct(0, seat));
            acts.push({ type: "SIT", floor: 0, wp: seat });
            acts.push({ type: "WAIT_SIM", minutes: 10 + Math.random() * 20 });
            acts.push({ type: "STAND" });
            acts.push({ type: "RELEASE_SEAT" });
        } else {
            pushLoiter(acts);
        }
    } else if (r < 0.52) {
        const stands = ["reception", "kiosk", "lobby_wc_front", "lobby_wc_back"];
        const pick = stands[Math.floor(Math.random() * stands.length)];
        acts.push(walkAct(0, pick));
        acts.push({ type: "SIT", floor: 0, wp: pick });
        acts.push({ type: "WAIT_SIM", minutes: 4 + Math.random() * 6 });
        acts.push({ type: "STAND" });
    } else if (r < 0.62) {
        pushLoiter(acts);
    } else if (r < 0.77) {
        const f = 1 + Math.floor(Math.random() * 5);
        const seat = tryReserveAny(agent, f, OFFICE_LOUNGE_SEATS);
        const wp = seat ? seat : ["water_cooler", "hall_stand_N", "hall_stand_S"][Math.floor(Math.random() * 3)];
        acts.push.apply(acts, travelActs(0, f));
        acts.push(walkAct(f, wp));
        acts.push({ type: "SIT", floor: f, wp: wp });
        acts.push({ type: "WAIT_SIM", minutes: 15 + Math.random() * 20 });
        acts.push({ type: "STAND" });
        if (seat) acts.push({ type: "RELEASE_SEAT" });
        acts.push.apply(acts, travelActs(f, 0));
    } else {
        const f = 1 + Math.floor(Math.random() * 5);
        const seat = tryReserveAny(agent, f, CONF_SEATS);
        if (seat) {
            acts.push.apply(acts, travelActs(0, f));
            acts.push(walkAct(f, seat));
            acts.push({ type: "SIT", floor: f, wp: seat });
            acts.push({ type: "ENTER_STATE", state: "IN_MEETING" });
            acts.push({ type: "WAIT_SIM", minutes: 22 + Math.random() * 23 });
            acts.push({ type: "STAND" });
            acts.push({ type: "RELEASE_SEAT" });
            acts.push.apply(acts, travelActs(f, 0));
        } else {
            pushLoiter(acts);
        }
    }
    acts.push(walkAct(0, "lobby_center"));
    acts.push(walkAct(0, "entrance"));
    acts.push(walkAct(0, "front_door_threshold"));
    acts.push(walkAct(0, "outside"));
    acts.push({ type: "ENTER_STATE", state: "LEAVING" });
    acts.push({ type: "EXIT_BUILDING" });
    return acts;
}

function chooseNextActivity(agent) {
    releaseHeldSeat(agent);
    if (simClock.simMinute >= agent.departureTime) return planLeaveFrom(agent);
    if (agent.plannedMeetingTimes.length > 0 && simClock.simMinute >= agent.plannedMeetingTimes[0]) {
        agent.plannedMeetingTimes.shift();
        return planAttendMeeting(agent);
    }
    if (!agent.hasLunched && simClock.simMinute >= agent.lunchTime) return planGoToLunch(agent);
    const r = Math.random();
    if (r < 0.144) return planAttendMeeting(agent);
    if (r < 0.264) return planVisitLounge(agent);
    if (r < 0.414) return planVisitCoworker(agent);
    return [{ type: "WAIT_SIM", minutes: 18 + Math.random() * 47 }, { type: "PICK_NEXT_ACTIVITY" }];
}

function nearestNodeName(nodes, pos) {
    let best = null;
    let bestD = Infinity;
    for (const key in nodes) {
        const p = nodes[key].pos;
        const d = (p.x - pos.x) * (p.x - pos.x) + (p.z - pos.z) * (p.z - pos.z);
        if (d < bestD) {
            bestD = d;
            best = key;
        }
    }
    return best;
}

function startAction(agent, act) {
    const ud = agent.group.userData;
    if (act.type === "WALK_TO_WP") {
        const floorData = world.floors[act.floor];
        let fromName = null;
        if (agent.node && floorData.nodes[agent.node]) {
            const np = floorData.nodes[agent.node].pos;
            const d = Math.hypot(agent.group.position.x - np.x, agent.group.position.z - np.z);
            if (d < 2.5) fromName = agent.node;
        }
        if (!fromName) fromName = nearestNodeName(floorData.nodes, agent.group.position);
        let path = world.bfsPath(floorData.nodes, fromName, act.wp);
        if (!path) path = [floorData.nodes[act.wp].pos.clone()];
        agent.walkPath = path;
        agent.walkIndex = 0;
        agent.walkTargetName = act.wp;
        ud.isWalking = true;
    } else if (act.type === "WAIT_AT_PANEL") {
        agent.state = "WAITING_ELEVATOR";
        ud.isWalking = false;
    } else if (act.type === "ENTER_ELEVATOR") {
        act.phase = "reserve";
        act.spot = null;
        act.tx = 0;
        act.tz = 2.15;
        act.stallT = 0;
        act.prevDist = null;
        ud.isWalking = false;
    } else if (act.type === "PRESS_FLOOR") {
        elevator.pressDestination(act.floor);
    } else if (act.type === "WAIT_FOR_FLOOR") {
        ud.isWalking = false;
    } else if (act.type === "EXIT_ELEVATOR") {
        elevator.registerDisembark(agent);
        if (agent.group.parent === elevator.carGroup) {
            const lp = agent.group.position;
            const wy = elevator.carGroup.position.y + lp.y;
            agent.group.position.set(lp.x, wy, lp.z);
        }
        scene.add(agent.group);
        agent.inCar = false;
        act.phase = "walkOut";
        act.tx = (Math.random() - 0.5) * 1.3;
        act.tz = 3.6 + (Math.random() - 0.5) * 0.7;
        act.stallT = 0;
        act.prevDist = null;
        ud.isWalking = true;
    } else if (act.type === "SIT") {
        const floorData = world.floors[act.floor];
        const target = floorData.sitTargets[act.wp];
        const nodePos = floorData.nodes[act.wp].pos;
        const floorY = act.floor * WORLD.FLOOR_HEIGHT;
        if (target && target.sit) {
            agent.group.position.set(nodePos.x, floorY - 0.35, nodePos.z);
            ud.isSitting = true;
        } else {
            const ang = Math.random() * Math.PI * 2;
            const rad = 0.35 + Math.random() * 0.4;
            agent.group.position.set(nodePos.x + Math.cos(ang) * rad, floorY, nodePos.z + Math.sin(ang) * rad);
            ud.isSitting = false;
        }
        ud.isWalking = false;
        agent.group.rotation.y = target ? target.facing : 0;
        agent.node = act.wp;
        agent.floor = act.floor;
    } else if (act.type === "STAND") {
        ud.isSitting = false;
        ud.isWalking = false;
        if (agent.inCar) {
            agent.group.position.y = 0;
        } else {
            agent.group.position.y = agent.floor * WORLD.FLOOR_HEIGHT;
        }
    } else if (act.type === "RELEASE_SEAT") {
        if (agent.seatKey) {
            seatReservations.delete(agent.seatKey);
            agent.seatKey = null;
        }
    } else if (act.type === "WAIT_SIM") {
        act.untilMin = simClock.simMinute + act.minutes;
    } else if (act.type === "EXIT_BUILDING") {
        if (agent.group.parent) agent.group.parent.remove(agent.group);
        agent.state = "GONE";
        ud.isWalking = false;
    } else if (act.type === "ENTER_STATE") {
        agent.state = act.state;
    } else if (act.type === "MARK_LUNCHED") {
        agent.hasLunched = true;
    } else if (act.type === "PICK_NEXT_ACTIVITY") {
        agent.plan = chooseNextActivity(agent);
    }
}

function walkToward(agent, tx, tz, dt) {
    const pos = agent.group.position;
    const dx = tx - pos.x;
    const dz = tz - pos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist <= 0.04) return 0;
    const step = Math.min(dist, agent.speed * dt);
    pos.x += (dx / dist) * step;
    pos.z += (dz / dist) * step;
    agent.group.rotation.y = Math.atan2(dx, dz);
    return dist - step;
}

function walkAlongPath(agent, motionDt) {
    const pos = agent.group.position;
    const ud = agent.group.userData;
    let remaining = motionDt;
    while (remaining > 0.000001 && agent.walkIndex < agent.walkPath.length) {
        const tgt = agent.walkPath[agent.walkIndex];
        const tx = tgt.x + agent.laneX;
        const tz = tgt.z + agent.laneZ;
        const dx = tx - pos.x;
        const dz = tz - pos.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < 0.02) {
            agent.walkIndex += 1;
            continue;
        }
        const timeNeeded = dist / agent.speed;
        if (timeNeeded <= remaining) {
            pos.x = tx;
            pos.z = tz;
            remaining -= timeNeeded;
            agent.walkIndex += 1;
            continue;
        }
        const step = agent.speed * remaining;
        pos.x += (dx / dist) * step;
        pos.z += (dz / dist) * step;
        agent.group.rotation.y = Math.atan2(dx, dz);
        remaining = 0;
    }
    const done = agent.walkIndex >= agent.walkPath.length;
    ud.isWalking = !done;
    if (done) {
        agent.node = agent.walkTargetName;
        agent._stallT = 0;
    }
    return done;
}

function updateAgent(agent, motionDt) {
    if (agent.state === "DISABLED" || agent.state === "GONE") return;
    if (agent.state === "AWAY") {
        if (simClock.simMinute >= agent.arrivalTime) spawnAgent(agent);
        else return;
    }
    if (agent.role === "WORKER" && !agent.departing && agent.state !== "LEAVING" && simClock.simMinute >= agent.departureTime) {
        const act = agent.currentAction;
        const busy = agent.inCar || (act && ELEV_ACTION_TYPES.has(act.type));
        if (!busy) {
            agent.plan = planLeaveFrom(agent);
            agent.currentAction = null;
        }
    }
    let transitions = 0;
    while (transitions < 16) {
        if (!agent.currentAction) {
            if (agent.plan.length === 0) {
                agent.plan = agent.role === "WORKER" ? chooseNextActivity(agent) : [{ type: "EXIT_BUILDING" }];
            }
            agent.currentAction = agent.plan.shift();
            startAction(agent, agent.currentAction);
            transitions += 1;
        }
        if (updateAgentAction(agent, agent.currentAction, motionDt)) {
            agent.currentAction = null;
            transitions += 1;
            if (agent.state === "GONE") return;
        } else {
            break;
        }
    }
}

function updateAgentAction(agent, act, motionDt) {
    const ud = agent.group.userData;
    if (act.type === "WALK_TO_WP") {
        if (agent.inCar) return true;
        return walkAlongPath(agent, motionDt);
    }
    if (act.type === "WAIT_AT_PANEL") {
        const dir = act.toFloor > act.floor ? 1 : -1;
        if (dir > 0) {
            if (!elevator.upCalls.has(act.floor)) elevator.callUp(act.floor);
        } else {
            if (!elevator.downCalls.has(act.floor)) elevator.callDown(act.floor);
        }
        if (elevator.isAcceptingAt(act.floor, dir) && elevator.currentCapacityFree() > 0) return true;
        return false;
    }
    if (act.type === "ENTER_ELEVATOR") {
        const dir = act.toFloor > act.floor ? 1 : -1;
        if (act.phase === "reserve") {
            if (elevator.isAcceptingAt(act.floor, dir)) {
                const spot = elevator.reserveBoardingSpot(agent);
                if (spot) {
                    act.spot = spot;
                    act.tx = spot.x;
                    act.tz = 2.15;
                    act.phase = "toDoor";
                    act.stallT = 0;
                    act.prevDist = null;
                } else {
                    agent.plan.unshift({ type: "ENTER_ELEVATOR", floor: act.floor, toFloor: act.toFloor });
                    agent.plan.unshift({ type: "WAIT_AT_PANEL", floor: act.floor, toFloor: act.toFloor });
                    return true;
                }
            } else {
                if (dir > 0) {
                    if (!elevator.upCalls.has(act.floor)) elevator.callUp(act.floor);
                } else {
                    if (!elevator.downCalls.has(act.floor)) elevator.callDown(act.floor);
                }
            }
            return false;
        }
        if (act.phase === "toDoor") {
            if (elevator.currentFloor !== act.floor || elevator.state === "MOVING" || elevator.state === "IDLE") {
                act.phase = "reserve";
                act.spot = null;
                return false;
            }
            const remaining = walkToward(agent, act.tx, act.tz, motionDt);
            if (act.prevDist !== null && Math.abs(act.prevDist - remaining) < 0.005) {
                act.stallT += motionDt;
            } else {
                act.stallT = 0;
            }
            act.prevDist = remaining;
            ud.isWalking = true;
            let arrived = remaining <= 0.04;
            if (!arrived && act.stallT > 1.5) {
                agent.group.position.set(act.tx, act.floor * WORLD.FLOOR_HEIGHT, act.tz);
                arrived = true;
            }
            if (arrived) {
                const wx = agent.group.position.x;
                const wz = agent.group.position.z;
                agent.group.position.set(wx, 0, wz);
                elevator.carGroup.add(agent.group);
                act.phase = "toSpot";
                act.stallT = 0;
                act.prevDist = null;
            }
            return false;
        }
        if (act.phase === "toSpot") {
            const remaining = walkToward(agent, act.spot.x, act.spot.z, motionDt);
            if (act.prevDist !== null && Math.abs(act.prevDist - remaining) < 0.005) {
                act.stallT += motionDt;
            } else {
                act.stallT = 0;
            }
            act.prevDist = remaining;
            ud.isWalking = true;
            if (remaining <= 0.04 || act.stallT > 1.5) {
                if (elevator.pendingBoarders.has(agent)) {
                    agent.group.position.set(act.spot.x, 0, act.spot.z);
                    elevator.completeBoard(agent);
                    agent.inCar = true;
                    agent.group.rotation.y = 0;
                    ud.isWalking = false;
                    ud.isSitting = false;
                    agent.state = "IN_CAR";
                    agent.node = null;
                    return true;
                }
                const lp = agent.group.position;
                const wy = elevator.carGroup.position.y + lp.y;
                agent.group.position.set(lp.x, wy, lp.z);
                scene.add(agent.group);
                agent.inCar = false;
                agent.floor = elevator.currentFloor;
                agent.group.position.y = agent.floor * WORLD.FLOOR_HEIGHT;
                agent.state = "WAITING_ELEVATOR";
                agent.node = "elevWait";
                agent.plan.unshift({ type: "ENTER_ELEVATOR", floor: agent.floor, toFloor: act.toFloor });
                agent.plan.unshift({ type: "WAIT_AT_PANEL", floor: agent.floor, toFloor: act.toFloor });
                agent.plan.unshift({ type: "WALK_TO_WP", floor: agent.floor, wp: "elevWait" });
                return true;
            }
            return false;
        }
        return false;
    }
    if (act.type === "WAIT_FOR_FLOOR") {
        if (!agent.inCar) {
            const travel = travelActs(agent.floor, act.floor);
            for (let k = travel.length - 1; k >= 0; k--) agent.plan.unshift(travel[k]);
            return true;
        }
        return elevator.state === "DOOR_OPEN" && elevator.currentFloor === act.floor;
    }
    if (act.type === "EXIT_ELEVATOR") {
        const remaining = walkToward(agent, act.tx, act.tz, motionDt);
        if (act.prevDist !== null && Math.abs(act.prevDist - remaining) < 0.005) {
            act.stallT += motionDt;
        } else {
            act.stallT = 0;
        }
        act.prevDist = remaining;
        ud.isWalking = true;
        if (remaining <= 0.04 || act.stallT > 1.5) {
            agent.group.position.set(act.tx, act.floor * WORLD.FLOOR_HEIGHT, act.tz);
            elevator.completeDisembark(agent);
            agent.floor = act.floor;
            agent.node = "elevWait";
            agent.state = "ON_FLOOR";
            ud.isWalking = false;
            return true;
        }
        return false;
    }
    if (act.type === "WAIT_SIM") {
        return simClock.simMinute >= act.untilMin;
    }
    return true;
}

function applyCollisions(motionDt) {
    const visible = [];
    for (const agent of agents) {
        if (agent.state === "DISABLED" || agent.state === "AWAY" || agent.state === "GONE") continue;
        if (agent.group.parent !== scene) continue;
        if (agent.group.userData.isSitting) continue;
        const act = agent.currentAction;
        if (act && act.type === "ENTER_ELEVATOR") continue;
        if (agent.floor === 0 && agent.group.position.z > 8.8) continue;
        visible.push(agent);
    }
    const minD = 0.72;
    const push = Math.min(0.3, 0.18 * motionDt);
    for (let i = 0; i < visible.length; i++) {
        for (let j = i + 1; j < visible.length; j++) {
            const a = visible[i];
            const b = visible[j];
            const pa = a.group.position;
            const pb = b.group.position;
            if (Math.abs(pa.y - pb.y) > 1) continue;
            const dx = pb.x - pa.x;
            const dz = pb.z - pa.z;
            const d2 = dx * dx + dz * dz;
            if (d2 >= minD * minD) continue;
            let d = Math.sqrt(d2);
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
            const depth = (minD - d) / minD;
            const move = push * depth + 0.004;
            pa.x -= nx * move * 0.5;
            pa.z -= nz * move * 0.5;
            pb.x += nx * move * 0.5;
            pb.z += nz * move * 0.5;
        }
    }
}

function updateStalls(motionDt) {
    for (const agent of agents) {
        const act = agent.currentAction;
        if (act && act.type === "WALK_TO_WP" && agent.group.parent === scene) {
            const pos = agent.group.position;
            if (agent._framePos) {
                const moved = Math.hypot(pos.x - agent._framePos.x, pos.z - agent._framePos.z);
                const expected = Math.max(0.05, agent.speed * motionDt);
                if (moved < Math.max(0.005, expected * 0.12)) {
                    agent._stallT += motionDt;
                    if (agent._stallT > 1.2) {
                        agent._stallT = 0;
                        if (agent.walkIndex < agent.walkPath.length - 1) agent.walkIndex += 1;
                        else agent.walkIndex = agent.walkPath.length;
                    }
                } else {
                    agent._stallT = 0;
                }
            }
            agent._framePos = { x: pos.x, z: pos.z };
        } else {
            agent._framePos = null;
            agent._stallT = 0;
        }
    }
}

function updateDaylight() {
    const hour = (simClock.simMinute / 60) % 24;
    let i = 0;
    while (i < DAY_KEYS.length - 2 && hour > DAY_KEYS[i + 1].h) i += 1;
    const a = DAY_KEYS[i];
    const b = DAY_KEYS[i + 1];
    const span = b.h - a.h;
    const t = span > 0 ? Math.min(1, Math.max(0, (hour - a.h) / span)) : 0;
    scene.background.setRGB(
        a.bg[0] + (b.bg[0] - a.bg[0]) * t,
        a.bg[1] + (b.bg[1] - a.bg[1]) * t,
        a.bg[2] + (b.bg[2] - a.bg[2]) * t
    );
    sunLight.color.setRGB(
        a.sun[0] + (b.sun[0] - a.sun[0]) * t,
        a.sun[1] + (b.sun[1] - a.sun[1]) * t,
        a.sun[2] + (b.sun[2] - a.sun[2]) * t
    );
    sunLight.intensity = a.si + (b.si - a.si) * t;
    ambientLight.intensity = a.ai + (b.ai - a.ai) * t;
    hemiLight.intensity = a.hi + (b.hi - a.hi) * t;
}

function buildHUD() {
    const hud = document.createElement("div");
    hud.style.cssText = "position:fixed;top:10px;left:10px;z-index:10;color:#e8ecf2;background:rgba(18,22,30,0.85);padding:10px 14px;border-radius:10px;font:12px/1.55 'Courier New',monospace;pointer-events:none;min-width:250px;box-shadow:0 2px 12px rgba(0,0,0,0.5)";
    const title = document.createElement("div");
    title.textContent = "Office Building Simulation";
    title.style.cssText = "font-weight:bold;letter-spacing:0.5px;margin-bottom:2px";
    hud.appendChild(title);
    hudTime = document.createElement("div");
    hudTime.textContent = " 7:30 AM";
    hudTime.style.cssText = "font-size:26px;font-weight:bold;color:#ffcf70;margin-bottom:6px";
    hud.appendChild(hudTime);
    hudSpeedLabel = document.createElement("div");
    hudSpeedLabel.textContent = "Speed: 120x";
    hud.appendChild(hudSpeedLabel);
    speedSlider = document.createElement("input");
    speedSlider.type = "range";
    speedSlider.min = "0";
    speedSlider.max = "100";
    speedSlider.step = "1";
    speedSlider.value = "75";
    speedSlider.style.cssText = "width:170px;pointer-events:auto;display:block;margin:2px 0 6px 0";
    hud.appendChild(speedSlider);
    hudOccLabel = document.createElement("div");
    hudOccLabel.textContent = "Occupancy: " + DEFAULT_OCCUPANCY + " / " + MAX_OCCUPANCY + " people";
    hud.appendChild(hudOccLabel);
    occSlider = document.createElement("input");
    occSlider.type = "range";
    occSlider.min = "1";
    occSlider.max = String(MAX_OCCUPANCY);
    occSlider.step = "1";
    occSlider.value = String(DEFAULT_OCCUPANCY);
    occSlider.style.cssText = "width:170px;pointer-events:auto;display:block;margin:2px 0 6px 0";
    hud.appendChild(occSlider);
    hudStats = document.createElement("div");
    hudStats.style.cssText = "white-space:pre;color:#c9d4e4";
    hud.appendChild(hudStats);
    document.body.appendChild(hud);
    speedSlider.addEventListener("input", onSpeedInput);
    occSlider.addEventListener("input", onOccupancyInput);
}

function onSpeedInput(ev) {
    const v = Number(ev.target.value);
    simClock.timeScale = Math.max(1, Math.round(Math.pow(600, v / 100)));
    if (hudSpeedLabel) hudSpeedLabel.textContent = "Speed: " + simClock.timeScale + "x";
}

function onOccupancyInput(ev) {
    targetOccupancy = Math.max(1, Math.min(MAX_OCCUPANCY, Math.round(Number(ev.target.value))));
    if (hudOccLabel) hudOccLabel.textContent = "Occupancy: " + targetOccupancy + " / " + MAX_OCCUPANCY + " people";
    applyOccupancy();
}

function updateHUD() {
    if (!hudTime || !simClock || !agents) return;
    hudTime.textContent = simClock.format();
    const counts = new Map();
    let present = 0;
    for (const agent of agents) {
        if (PRESENT_STATES.has(agent.state)) {
            present += 1;
            counts.set(agent.state, (counts.get(agent.state) || 0) + 1);
        }
    }
    const entries = Array.from(counts.entries()).sort(function (a, b) { return b[1] - a[1]; });
    const parts = [];
    entries.forEach(function (entry) { parts.push(entry[0] + " " + entry[1]); });
    const dfloor = Math.max(0, Math.min(WORLD.FLOOR_COUNT - 1, Math.round(elevator.carY / WORLD.FLOOR_HEIGHT)));
    const dirCh = elevator.direction > 0 ? "^" : (elevator.direction < 0 ? "v" : "");
    const line = "Elevator: " + dfloor + dirCh + " -> " + elevator.targetFloor + " | " + elevator.state +
        " | riders " + elevator.passengers.size + "/4 | dest [" + Array.from(elevator.destinations).join(",") +
        "] | up [" + Array.from(elevator.upCalls).join(",") + "] | down [" + Array.from(elevator.downCalls).join(",") + "]";
    hudStats.textContent = "Present: " + present + " / " + targetOccupancy + "\n" +
        (parts.length > 0 ? parts.join(", ") : "-") + "\n" + line;
}

function onWindowResize() {
    if (!camera || !renderer) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

window.addEventListener("resize", onWindowResize);

if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", startSimulation);
} else {
    startSimulation();
}
