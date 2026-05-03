const MAX_WORKERS = 20;
const MAX_VISITORS = 80;
const MAX_OCCUPANCY = MAX_WORKERS + MAX_VISITORS;
let targetOccupancy = 45;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth/window.innerHeight, 0.1, 1000);
camera.position.set(28, 24, 28);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.sortObjects = true;
document.body.appendChild(renderer.domElement);

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.target.set(0, 10, 0);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
scene.add(ambientLight);
const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.32);
scene.add(hemiLight);
const sunLight = new THREE.DirectionalLight(0xffeedd, 0.8);
sunLight.position.set(10, 20, 10);
scene.add(sunLight);

const world = createWorld(scene);
const elevator = new Elevator(scene, world);

const clock = {
    simMinute: 7 * 60 + 30, // 07:30
    timeScale: 120,
    tick: function(realDt) {
        this.simMinute += realDt * this.timeScale / 60;
        if (this.simMinute >= 24 * 60) {
            this.simMinute -= 24 * 60;
            resetDay();
        }
    },
    format: function() {
        const h = Math.floor(this.simMinute / 60);
        const m = Math.floor(this.simMinute % 60);
        const period = h >= 12 ? 'PM' : 'AM';
        const h12 = h % 12 === 0 ? 12 : h % 12;
        return `${h12.toString().padStart(2, ' ')}:${m.toString().padStart(2, '0')} ${period}`;
    }
};

const UI = {
    timeDisplay: document.getElementById('timeDisplay'),
    speedVal: document.getElementById('speedVal'),
    speedSlider: document.getElementById('speedSlider'),
    occVal: document.getElementById('occVal'),
    occSlider: document.getElementById('occSlider'),
    stateBreakdown: document.getElementById('stateBreakdown')
};

// Log-scale speed slider
function setSpeedFromSlider() {
    const val = parseFloat(UI.speedSlider.value);
    const minL = Math.log(1), maxL = Math.log(600);
    const scale = Math.exp(minL + val * (maxL - minL));
    clock.timeScale = scale;
    UI.speedVal.innerText = `${Math.round(scale)}x`;
}
UI.speedSlider.addEventListener('input', setSpeedFromSlider);
setSpeedFromSlider();

UI.occSlider.value = targetOccupancy;
UI.occVal.innerText = targetOccupancy;
UI.occSlider.addEventListener('input', () => {
    targetOccupancy = parseInt(UI.occSlider.value);
    UI.occVal.innerText = targetOccupancy;
    applyOccupancy();
});

const agents = [];
const seatReservations = new Set();

function resetDay() {
    elevator.reset();
    seatReservations.clear();
    
    // Re-roll schedules
    agents.forEach(agent => {
        agent.hasLunched = false;
        agent.plannedMeetingTimes = [];
        if (Math.random() < 0.4) {
            agent.plannedMeetingTimes.push((8 + Math.random()*3) * 60);
        }
        if (Math.random() < 0.4) {
            agent.plannedMeetingTimes.push((13 + Math.random()*3) * 60);
        }
        agent.plannedMeetingTimes.sort((a,b)=>a-b);
        
        if (agent.role === 'WORKER') {
            agent.arrivalTime = (8.25 + Math.random() * 1.25) * 60;
            agent.lunchTime = (11.5 + Math.random() * 2) * 60;
            agent.lunchDuration = 25 + Math.random() * 35;
            agent.departureTime = (Math.random() < 0.15 ? (18.5 + Math.random() * 1.25) : (16.75 + Math.random() * 1.75)) * 60;
            
            if (agent.state !== 'DISABLED') agent.state = 'AWAY';
        } else {
            if (agent.state !== 'DISABLED') agent.state = 'GONE'; // will be topped up
        }
        
        // Remove from scene if they were active
        if (agent.group.parent) agent.group.parent.remove(agent.group);
        agent.plan = [];
        agent.currentAction = null;
    });
    applyOccupancy();
}

function applyOccupancy() {
    agents.forEach((a, i) => {
        if (i < targetOccupancy) {
            if (a.state === 'DISABLED') {
                a.state = a.role === 'WORKER' ? 'AWAY' : 'GONE';
            }
        } else {
            // Only force DISABLED if they are completely gone, otherwise let them finish
            if (a.state === 'AWAY' || a.state === 'GONE') {
                a.state = 'DISABLED';
            }
        }
    });
}

function countPresent() {
    return agents.filter(a => a.state !== 'DISABLED' && a.state !== 'AWAY' && a.state !== 'GONE').length;
}

function topUpVisitors() {
    if (clock.simMinute < 8 * 60 || clock.simMinute > 18 * 60) return;
    
    let currentOccupants = agents.filter(a => a.state !== 'DISABLED' && a.state !== 'AWAY' && a.state !== 'GONE').length;
    let deficit = targetOccupancy - currentOccupants;
    
    if (deficit > 0) {
        for (let a of agents) {
            if (a.role === 'VISITOR' && (a.state === 'GONE' || a.state === 'AWAY')) {
                // Re-arm this visitor
                a.arrivalTime = clock.simMinute + Math.random() * 6;
                a.visitDuration = 15 + Math.random() * 45;
                a.state = 'AWAY';
                deficit--;
                if (deficit <= 0) break;
            }
        }
    }
}

// Build pool
let workerDesks = [];
world.floors.forEach(f => {
    f.desks.forEach(d => workerDesks.push({ floor: f.floorNumber, desk: d }));
});
workerDesks = workerDesks.slice(0, MAX_WORKERS); // Limit to MAX_WORKERS

for (let i = 0; i < MAX_OCCUPANCY; i++) {
    let role = i < MAX_WORKERS ? 'WORKER' : 'VISITOR';
    let agent = {
        id: i,
        role: role,
        group: createPerson(),
        state: 'DISABLED',
        plan: [],
        currentAction: null,
        name: `Agent${i}`,
        arrivalTime: 0,
        lunchTime: 0,
        lunchDuration: 0,
        departureTime: 0,
        plannedMeetingTimes: [],
        hasLunched: false
    };
    
    if (role === 'WORKER') {
        const d = workerDesks[i % workerDesks.length];
        agent.homeFloor = d.floor;
        agent.deskId = d.desk.id;
        agent.deskWpName = d.desk.wpName;
        agent.deskDoorWpName = d.desk.doorWpName;
    }
    
    agents.push(agent);
}
resetDay();

// Lighting keyframes
const LIGHT_KEYS = [
    { m: 0, bg: 0x111122, sunCol: 0xffaa55, sunInt: 0, ambInt: 0.45, hemiInt: 0.32 },
    { m: 6*60, bg: 0x111122, sunCol: 0xffaa55, sunInt: 0.1, ambInt: 0.45, hemiInt: 0.32 },
    { m: 6*60+30, bg: 0x88bbff, sunCol: 0xffddaa, sunInt: 0.6, ambInt: 0.6, hemiInt: 0.5 },
    { m: 8*60, bg: 0xaaccff, sunCol: 0xffeedd, sunInt: 0.8, ambInt: 0.7, hemiInt: 0.6 },
    { m: 16*60, bg: 0xaaccff, sunCol: 0xffeedd, sunInt: 0.8, ambInt: 0.7, hemiInt: 0.6 },
    { m: 17*60+30, bg: 0xaa8866, sunCol: 0xffaa55, sunInt: 0.4, ambInt: 0.55, hemiInt: 0.45 },
    { m: 18*60+30, bg: 0x111122, sunCol: 0xffaa55, sunInt: 0, ambInt: 0.45, hemiInt: 0.32 },
    { m: 24*60, bg: 0x111122, sunCol: 0xffaa55, sunInt: 0, ambInt: 0.45, hemiInt: 0.32 }
];

function updateLighting() {
    let m = clock.simMinute;
    let k0 = LIGHT_KEYS[0], k1 = LIGHT_KEYS[LIGHT_KEYS.length-1];
    for (let i=0; i<LIGHT_KEYS.length-1; i++) {
        if (m >= LIGHT_KEYS[i].m && m <= LIGHT_KEYS[i+1].m) {
            k0 = LIGHT_KEYS[i]; k1 = LIGHT_KEYS[i+1]; break;
        }
    }
    let t = (m - k0.m) / Math.max(1, (k1.m - k0.m));
    const lerpC = (c1, c2, t) => {
        const c = new THREE.Color(c1);
        c.lerp(new THREE.Color(c2), t);
        return c;
    };
    scene.background = lerpC(k0.bg, k1.bg, t);
    sunLight.color = lerpC(k0.sunCol, k1.sunCol, t);
    sunLight.intensity = k0.sunInt + (k1.sunInt - k0.sunInt) * t;
    ambientLight.intensity = k0.ambInt + (k1.ambInt - k0.ambInt) * t;
    hemiLight.intensity = k0.hemiInt + (k1.hemiInt - k0.hemiInt) * t;
}

// ---- Action Primitives ----
const ACTIONS = {
    WALK_TO_WP: (floor, wpName) => ({ type: 'WALK_TO_WP', floor, wpName }),
    WAIT_AT_PANEL: (floor, dir, toFloor) => ({ type: 'WAIT_AT_PANEL', floor, dir, toFloor }),
    ENTER_ELEVATOR: (toFloor) => ({ type: 'ENTER_ELEVATOR', toFloor }),
    PRESS_FLOOR: (floor) => ({ type: 'PRESS_FLOOR', floor }),
    WAIT_FOR_FLOOR: (floor) => ({ type: 'WAIT_FOR_FLOOR', floor }),
    EXIT_ELEVATOR: (toFloor) => ({ type: 'EXIT_ELEVATOR', toFloor }),
    SIT: (floor, wpName) => ({ type: 'SIT', floor, wpName }),
    STAND: () => ({ type: 'STAND' }),
    RELEASE_SEAT: (floor, wpName) => ({ type: 'RELEASE_SEAT', floor, wpName }),
    WAIT_SIM: (minDuration, maxDuration) => ({ type: 'WAIT_SIM', minDuration, maxDuration }),
    EXIT_BUILDING: () => ({ type: 'EXIT_BUILDING' }),
    ENTER_STATE: (state) => ({ type: 'ENTER_STATE', state }),
    MARK_LUNCHED: () => ({ type: 'MARK_LUNCHED' }),
    PICK_NEXT_ACTIVITY: () => ({ type: 'PICK_NEXT_ACTIVITY' })
};

function getDir(f1, f2) { return f2 > f1 ? 1 : -1; }

function compileRideElevator(fromFloor, toFloor) {
    if (fromFloor === toFloor) return [];
    const dir = getDir(fromFloor, toFloor);
    return [
        ACTIONS.WALK_TO_WP(fromFloor, 'elevWait'),
        ACTIONS.ENTER_STATE('WAITING_ELEVATOR'),
        ACTIONS.WAIT_AT_PANEL(fromFloor, dir, toFloor),
        ACTIONS.ENTER_ELEVATOR(toFloor),
        ACTIONS.ENTER_STATE('IN_CAR'),
        ACTIONS.PRESS_FLOOR(toFloor),
        ACTIONS.WAIT_FOR_FLOOR(toFloor),
        ACTIONS.EXIT_ELEVATOR(toFloor)
    ];
}

// ---- Plan Compilers ----
function planArriveToDesk(agent) {
    return [
        ACTIONS.ENTER_STATE('ARRIVING'),
        ACTIONS.WALK_TO_WP(0, 'entrance'),
        ...compileRideElevator(0, agent.homeFloor),
        ACTIONS.ENTER_STATE('ON_FLOOR'),
        ACTIONS.WALK_TO_WP(agent.homeFloor, agent.deskDoorWpName),
        ACTIONS.WALK_TO_WP(agent.homeFloor, agent.deskWpName),
        ACTIONS.SIT(agent.homeFloor, agent.deskWpName),
        ACTIONS.ENTER_STATE('AT_DESK'),
        ACTIONS.WAIT_SIM(15, 45),
        ACTIONS.PICK_NEXT_ACTIVITY()
    ];
}

function planGoToLunch(agent) {
    const chairs = [0,1,2,3].map(i => `bistro_${i}`);
    const chair = chairs[Math.floor(Math.random()*chairs.length)];
    seatReservations.add(`0:${chair}`); // Soft reserve
    return [
        ACTIONS.STAND(),
        ACTIONS.WALK_TO_WP(agent.homeFloor, agent.deskDoorWpName),
        ...compileRideElevator(agent.homeFloor, 0),
        ACTIONS.WALK_TO_WP(0, 'cafe_door'),
        ACTIONS.WALK_TO_WP(0, chair),
        ACTIONS.SIT(0, chair),
        ACTIONS.ENTER_STATE('AT_LUNCH'),
        ACTIONS.WAIT_SIM(agent.lunchDuration, agent.lunchDuration),
        ACTIONS.STAND(),
        ACTIONS.RELEASE_SEAT(0, chair),
        ACTIONS.MARK_LUNCHED(),
        ...compileRideElevator(0, agent.homeFloor),
        ACTIONS.WALK_TO_WP(agent.homeFloor, agent.deskDoorWpName),
        ACTIONS.WALK_TO_WP(agent.homeFloor, agent.deskWpName),
        ACTIONS.SIT(agent.homeFloor, agent.deskWpName),
        ACTIONS.ENTER_STATE('AT_DESK'),
        ACTIONS.WAIT_SIM(15, 30),
        ACTIONS.PICK_NEXT_ACTIVITY()
    ];
}

function planVisitLounge(agent) {
    const f = agent.homeFloor;
    const spots = [0,1,2].map(i => `lounge_spot${i}`);
    const spot = spots[Math.floor(Math.random()*spots.length)];
    return [
        ACTIONS.STAND(),
        ACTIONS.WALK_TO_WP(f, agent.deskDoorWpName),
        ACTIONS.WALK_TO_WP(f, 'lounge_door'),
        ACTIONS.WALK_TO_WP(f, 'lounge_center'),
        ACTIONS.WALK_TO_WP(f, spot),
        ACTIONS.SIT(f, spot),
        ACTIONS.ENTER_STATE('AT_BREAK'),
        ACTIONS.WAIT_SIM(5, 12),
        ACTIONS.STAND(),
        ACTIONS.WALK_TO_WP(f, 'lounge_center'),
        ACTIONS.WALK_TO_WP(f, 'lounge_door'),
        ACTIONS.WALK_TO_WP(f, agent.deskDoorWpName),
        ACTIONS.WALK_TO_WP(f, agent.deskWpName),
        ACTIONS.SIT(f, agent.deskWpName),
        ACTIONS.ENTER_STATE('AT_DESK'),
        ACTIONS.WAIT_SIM(20, 60),
        ACTIONS.PICK_NEXT_ACTIVITY()
    ];
}

function planAttendMeeting(agent) {
    let f = Math.random() < 0.65 ? agent.homeFloor : Math.floor(Math.random()*5)+1;
    const seats = [0,1,2,3].map(i => `conf_seat${i}`);
    let seat = seats.find(s => !seatReservations.has(`${f}:${s}`));
    if (!seat) return planVisitLounge(agent); // Fallback
    seatReservations.add(`${f}:${seat}`);

    return [
        ACTIONS.STAND(),
        ACTIONS.WALK_TO_WP(agent.homeFloor, agent.deskDoorWpName),
        ...compileRideElevator(agent.homeFloor, f),
        ACTIONS.WALK_TO_WP(f, 'conf_door'),
        ACTIONS.WALK_TO_WP(f, 'conf_center'),
        ACTIONS.WALK_TO_WP(f, seat),
        ACTIONS.SIT(f, seat),
        ACTIONS.ENTER_STATE('IN_MEETING'),
        ACTIONS.WAIT_SIM(22, 45),
        ACTIONS.STAND(),
        ACTIONS.RELEASE_SEAT(f, seat),
        ACTIONS.WALK_TO_WP(f, 'conf_center'),
        ACTIONS.WALK_TO_WP(f, 'conf_door'),
        ...compileRideElevator(f, agent.homeFloor),
        ACTIONS.WALK_TO_WP(agent.homeFloor, agent.deskDoorWpName),
        ACTIONS.WALK_TO_WP(agent.homeFloor, agent.deskWpName),
        ACTIONS.SIT(agent.homeFloor, agent.deskWpName),
        ACTIONS.ENTER_STATE('AT_DESK'),
        ACTIONS.WAIT_SIM(15, 45),
        ACTIONS.PICK_NEXT_ACTIVITY()
    ];
}

function planVisitCoworker(agent) {
    let peers = agents.filter(a => a.role === 'WORKER' && a.state === 'AT_DESK' && a !== agent);
    if (peers.length === 0) return planVisitLounge(agent);
    let peer = peers[Math.floor(Math.random()*peers.length)];
    
    return [
        ACTIONS.STAND(),
        ACTIONS.WALK_TO_WP(agent.homeFloor, agent.deskDoorWpName),
        ...compileRideElevator(agent.homeFloor, peer.homeFloor),
        ACTIONS.WALK_TO_WP(peer.homeFloor, peer.deskDoorWpName),
        ACTIONS.ENTER_STATE('AT_BREAK'),
        ACTIONS.WAIT_SIM(6, 18),
        ...compileRideElevator(peer.homeFloor, agent.homeFloor),
        ACTIONS.WALK_TO_WP(agent.homeFloor, agent.deskDoorWpName),
        ACTIONS.WALK_TO_WP(agent.homeFloor, agent.deskWpName),
        ACTIONS.SIT(agent.homeFloor, agent.deskWpName),
        ACTIONS.ENTER_STATE('AT_DESK'),
        ACTIONS.WAIT_SIM(15, 45),
        ACTIONS.PICK_NEXT_ACTIVITY()
    ];
}

function planLeaveBuilding(agent) {
    return [
        ACTIONS.STAND(),
        agent.role === 'WORKER' ? ACTIONS.WALK_TO_WP(agent.homeFloor, agent.deskDoorWpName) : ACTIONS.ENTER_STATE('LEAVING'),
        ACTIONS.ENTER_STATE('LEAVING'),
        ...compileRideElevator(agent.homeFloor || agent.currentFloor, 0),
        ACTIONS.WALK_TO_WP(0, 'entrance'),
        ACTIONS.WALK_TO_WP(0, 'outside'),
        ACTIONS.EXIT_BUILDING()
    ];
}

function planVisitorVisit(agent) {
    const roll = Math.random() * 100;
    let subPlan = [];
    
    if (roll < 10) {
        subPlan = [
            ACTIONS.WALK_TO_WP(0, 'cafe_door'),
            ACTIONS.WALK_TO_WP(0, 'bistro_' + Math.floor(Math.random()*4)),
            ACTIONS.SIT(0, 'bistro_' + Math.floor(Math.random()*4)),
            ACTIONS.WAIT_SIM(15, 30),
            ACTIONS.STAND()
        ];
    } else if (roll < 16) {
        subPlan = [
            ACTIONS.WALK_TO_WP(0, 'cafe_door'),
            ACTIONS.WALK_TO_WP(0, 'cafe_order'),
            ACTIONS.WAIT_SIM(5, 15)
        ];
    } else if (roll < 30) {
        subPlan = [
            ACTIONS.WALK_TO_WP(0, 'front_lounge_door'),
            ACTIONS.WALK_TO_WP(0, 'front_lounge_' + Math.floor(Math.random()*4)),
            ACTIONS.SIT(0, 'front_lounge_' + Math.floor(Math.random()*4)),
            ACTIONS.WAIT_SIM(10, 25),
            ACTIONS.STAND()
        ];
    } else if (roll < 42) {
        const pitWp = ['pit_N','pit_S','pit_E','pit_W'][Math.floor(Math.random()*4)];
        subPlan = [
            ACTIONS.WALK_TO_WP(0, pitWp),
            ACTIONS.SIT(0, pitWp),
            ACTIONS.WAIT_SIM(10, 25),
            ACTIONS.STAND()
        ];
    } else if (roll < 52) {
        const wp = ['reception','kiosk','lobby_wc_front'][Math.floor(Math.random()*3)];
        subPlan = [ACTIONS.WALK_TO_WP(0, wp), ACTIONS.WAIT_SIM(5, 15)];
    } else if (roll < 62) {
        const wps = ['center','NE','NW','midE','midW','entry'].map(s => 'lobby_stand_'+s);
        subPlan = [ACTIONS.WALK_TO_WP(0, wps[Math.floor(Math.random()*wps.length)]), ACTIONS.WAIT_SIM(5, 15)];
    } else if (roll < 77) {
        let f = Math.floor(Math.random()*5)+1;
        const spot = `lounge_spot${Math.floor(Math.random()*3)}`;
        subPlan = [
            ...compileRideElevator(0, f),
            ACTIONS.WALK_TO_WP(f, 'lounge_door'),
            ACTIONS.WALK_TO_WP(f, 'lounge_center'),
            ACTIONS.WALK_TO_WP(f, spot),
            ACTIONS.SIT(f, spot),
            ACTIONS.WAIT_SIM(10, 25),
            ACTIONS.STAND(),
            ACTIONS.WALK_TO_WP(f, 'lounge_center'),
            ACTIONS.WALK_TO_WP(f, 'lounge_door'),
            ...compileRideElevator(f, 0)
        ];
    } else {
        let f = Math.floor(Math.random()*5)+1;
        const seats = [0,1,2,3].map(i => `conf_seat${i}`);
        let seat = seats.find(s => !seatReservations.has(`${f}:${s}`));
        if (seat) {
            seatReservations.add(`${f}:${seat}`);
            subPlan = [
                ...compileRideElevator(0, f),
                ACTIONS.WALK_TO_WP(f, 'conf_door'),
                ACTIONS.WALK_TO_WP(f, 'conf_center'),
                ACTIONS.WALK_TO_WP(f, seat),
                ACTIONS.SIT(f, seat),
                ACTIONS.WAIT_SIM(22, 45),
                ACTIONS.STAND(),
                ACTIONS.RELEASE_SEAT(f, seat),
                ACTIONS.WALK_TO_WP(f, 'conf_center'),
                ACTIONS.WALK_TO_WP(f, 'conf_door'),
                ...compileRideElevator(f, 0)
            ];
        } else {
            subPlan = [ACTIONS.WALK_TO_WP(0, 'lobby_stand_center'), ACTIONS.WAIT_SIM(5, 15)];
        }
    }
    
    return [
        ACTIONS.ENTER_STATE('VISITING'),
        ACTIONS.WALK_TO_WP(0, 'entrance'),
        ...subPlan,
        ACTIONS.ENTER_STATE('LEAVING'),
        ACTIONS.WALK_TO_WP(0, 'entrance'),
        ACTIONS.WALK_TO_WP(0, 'outside'),
        ACTIONS.EXIT_BUILDING()
    ];
}

function chooseNextActivity(agent) {
    if (clock.simMinute >= agent.departureTime) {
        agent.plan = planLeaveBuilding(agent);
        return;
    }
    if (agent.plannedMeetingTimes.length > 0 && clock.simMinute >= agent.plannedMeetingTimes[0]) {
        agent.plannedMeetingTimes.shift();
        agent.plan = planAttendMeeting(agent);
        return;
    }
    if (clock.simMinute >= agent.lunchTime && !agent.hasLunched) {
        agent.plan = planGoToLunch(agent);
        return;
    }
    
    const roll = Math.random();
    if (roll < 0.14) agent.plan = planAttendMeeting(agent);
    else if (roll < 0.26) agent.plan = planVisitLounge(agent);
    else if (roll < 0.41) agent.plan = planVisitCoworker(agent);
    else {
        agent.plan = [ACTIONS.WAIT_SIM(18, 65), ACTIONS.PICK_NEXT_ACTIVITY()];
    }
}

// ---- Action Runner ----
function startAction(agent, action) {
    if (!action) return false;
    agent.currentAction = action;
    
    if (action.type === "WALK_TO_WP") {
        const path = world.bfsPath(action.floor, agent.lastWp || "entrance", action.wpName);
        agent._path = path;
        agent._pathIndex = 0;
        agent._stallT = 0;
        agent._prevWp = new THREE.Vector3().copy(agent.group.position);
        agent.userData.isWalking = true;
        agent.userData.isSitting = false;
        agent.group.position.y = action.floor * WORLD.FLOOR_HEIGHT;
    } else if (action.type === "WAIT_SIM") {
        action.untilMin = clock.simMinute + action.minDuration + Math.random() * (action.maxDuration - action.minDuration);
    } else if (action.type === "SIT") {
        agent.userData.isSitting = true;
        agent.userData.isWalking = false;
        const target = world.floors[action.floor].sitTargets[action.wpName];
        if (target) {
            agent.group.position.copy(world.floors[action.floor].nodes[action.wpName]);
            if (!target.sit) {
                // Jitter standing spots
                const ang = Math.random() * Math.PI * 2;
                const r = 0.35 + Math.random() * 0.4;
                agent.group.position.x += Math.cos(ang) * r;
                agent.group.position.z += Math.sin(ang) * r;
                agent.group.rotation.y = target.facing;
            } else {
                agent.group.position.y -= 0.35; // Drop hips
                agent.group.rotation.y = target.facing;
            }
        }
        agent.lastWp = action.wpName;
    } else if (action.type === "STAND") {
        agent.userData.isSitting = false;
        agent.group.position.y = agent.currentFloor * WORLD.FLOOR_HEIGHT;
    } else if (action.type === "RELEASE_SEAT") {
        seatReservations.delete(action.floor + ":" + action.wpName);
    } else if (action.type === "ENTER_STATE") {
        agent.state = action.state;
    } else if (action.type === "MARK_LUNCHED") {
        agent.hasLunched = true;
    } else if (action.type === "PICK_NEXT_ACTIVITY") {
        chooseNextActivity(agent);
    } else if (action.type === "WAIT_AT_PANEL") {
        agent.userData.isWalking = false;
        agent.userData.isSitting = false;
    } else if (action.type === "ENTER_ELEVATOR") {
        agent._elevPhase = "reserve";
        agent._stallT = 0;
    } else if (action.type === "EXIT_ELEVATOR") {
        elevator.registerDisembark(agent);
        agent.group.parent.remove(agent.group);
        scene.add(agent.group);
        const wPos = new THREE.Vector3(0, elevator.logic.carY, 2.5);
        agent.group.position.copy(wPos);
        agent._path = [world.floors[action.toFloor].nodes["elevWait"]];
        agent._pathIndex = 0;
        agent._prevWp = new THREE.Vector3().copy(agent.group.position);
        agent.userData.isWalking = true;
    } else if (action.type === "EXIT_BUILDING") {
        agent.state = "GONE";
        if (agent.group.parent) agent.group.parent.remove(agent.group);
    } else if (action.type === "PRESS_FLOOR") {
        elevator.pressDestination(action.floor);
    }
    return true; // zero-duration actions can process next immediately if pumpAction returns true
}

function pumpAction(agent, motionDt) {
    let action = agent.currentAction;
    if (!action) {
        if (agent.plan.length > 0) startAction(agent, agent.plan.shift());
        return false;
    }

    let done = false;

    if (action.type === "WALK_TO_WP") {
        if (!agent._path || agent._pathIndex >= agent._path.length) {
            agent.userData.isWalking = false;
            agent.lastWp = action.wpName;
            agent.currentFloor = action.floor;
            done = true;
        } else {
            const target = agent._path[agent._pathIndex];
            const dist = agent.group.position.distanceTo(target);
            const step = 1.3 * motionDt; // 1.3 m/s
            
            // Stall detection
            const moved = agent.group.position.distanceTo(agent._prevWp);
            if (moved < 0.005) agent._stallT += motionDt;
            else agent._stallT = 0;
            agent._prevWp.copy(agent.group.position);
            
            if (dist <= step || agent._stallT > 1.2) {
                agent.group.position.copy(target);
                agent._pathIndex++;
                agent._stallT = 0;
            } else {
                const dir = new THREE.Vector3().subVectors(target, agent.group.position).normalize();
                agent.group.position.addScaledVector(dir, step);
                agent.group.rotation.y = Math.atan2(dir.x, dir.z);
            }
        }
    } else if (action.type === "WAIT_SIM") {
        if (clock.simMinute >= action.untilMin) done = true;
    } else if (action.type === "WAIT_AT_PANEL") {
        if (action.dir === 1) elevator.callUp(action.floor);
        else if (action.dir === -1) elevator.callDown(action.floor);
        else { elevator.callUp(action.floor); elevator.callDown(action.floor); }
        
        if (elevator.isAcceptingAt(action.floor, action.dir) && elevator.currentCapacityFree() > 0) {
            done = true;
        }
    } else if (action.type === "ENTER_ELEVATOR") {
        if (agent._elevPhase === "reserve") {
            const spot = elevator.reserveBoardingSpot(agent);
            if (spot) {
                agent._elevSpot = spot;
                agent._elevPhase = "walk_door";
                agent.userData.isWalking = true;
            } else {
                // Keep waiting by re-pressing call
                if (elevator.state !== elevator.logic.STATE.DOOR_OPEN || elevator.currentFloor !== action.floor) {
                     if (action.toFloor > action.floor) elevator.callUp(action.floor);
                     else elevator.callDown(action.floor);
                }
            }
        } else if (agent._elevPhase === "walk_door") {
            const doorPos = new THREE.Vector3(agent._elevSpot.x, action.floor * WORLD.FLOOR_HEIGHT, 1.5);
            const dist = agent.group.position.distanceTo(doorPos);
            const step = 1.3 * motionDt;
            
            const prev = agent._prevWp || agent.group.position;
            const moved = agent.group.position.distanceTo(prev);
            if (moved < 0.005) agent._stallT += motionDt;
            else agent._stallT = 0;
            agent._prevWp = new THREE.Vector3().copy(agent.group.position);

            if (dist <= step || agent._stallT > 1.5) {
                agent.group.parent.remove(agent.group);
                elevator.carGroup.add(agent.group);
                agent.group.position.set(doorPos.x, 0, 1.5);
                agent._elevPhase = "walk_spot";
                agent._stallT = 0;
            } else {
                const dir = new THREE.Vector3().subVectors(doorPos, agent.group.position).normalize();
                agent.group.position.addScaledVector(dir, step);
                agent.group.rotation.y = Math.atan2(dir.x, dir.z);
            }
        } else if (agent._elevPhase === "walk_spot") {
            const spotPos = new THREE.Vector3(agent._elevSpot.x, 0, agent._elevSpot.z);
            const dist = agent.group.position.distanceTo(spotPos);
            const step = 1.3 * motionDt;
            if (dist <= step) {
                agent.group.position.copy(spotPos);
                elevator.completeBoard(agent);
                agent.group.rotation.y = 0; // Face doors
                agent.userData.isWalking = false;
                done = true;
            } else {
                const dir = new THREE.Vector3().subVectors(spotPos, agent.group.position).normalize();
                agent.group.position.addScaledVector(dir, step);
                agent.group.rotation.y = Math.atan2(dir.x, dir.z);
            }
        }
    } else if (action.type === "WAIT_FOR_FLOOR") {
        if (elevator.state === elevator.logic.STATE.DOOR_OPEN && elevator.currentFloor === action.floor) {
            done = true;
        }
    } else if (action.type === "EXIT_ELEVATOR") {
        if (!agent._path || agent._pathIndex >= agent._path.length) {
            agent.userData.isWalking = false;
            elevator.completeDisembark(agent);
            done = true;
            agent.currentFloor = action.toFloor;
        } else {
            const target = agent._path[agent._pathIndex];
            const dist = agent.group.position.distanceTo(target);
            const step = 1.3 * motionDt;
            if (dist <= step) {
                agent.group.position.copy(target);
                agent._pathIndex++;
            } else {
                const dir = new THREE.Vector3().subVectors(target, agent.group.position).normalize();
                agent.group.position.addScaledVector(dir, step);
                agent.group.rotation.y = Math.atan2(dir.x, dir.z);
            }
        }
    } else {
        // Zero-duration actions
        done = true;
    }

    if (done) {
        agent.currentAction = null;
        if (agent.plan.length > 0) startAction(agent, agent.plan.shift());
        return true; // try next action immediately
    }
    return false;
}

function applyCollisions() {
    const active = agents.filter(a => a.state !== "DISABLED" && a.state !== "AWAY" && a.state !== "GONE" && a.group.parent);
    for (let i=0; i<active.length; i++) {
        let a1 = active[i];
        if (a1.userData.isSitting) continue;
        if (a1.currentAction && a1.currentAction.type === "ENTER_ELEVATOR") continue;
        if (a1.group.parent === elevator.carGroup) continue;

        for (let j=i+1; j<active.length; j++) {
            let a2 = active[j];
            if (a2.userData.isSitting) continue;
            if (a2.currentAction && a2.currentAction.type === "ENTER_ELEVATOR") continue;
            if (a2.group.parent === elevator.carGroup) continue;
            if (a1.group.parent !== a2.group.parent) continue;

            let dy = Math.abs(a1.group.position.y - a2.group.position.y);
            if (dy > 1.0) continue;

            let dx = a1.group.position.x - a2.group.position.x;
            let dz = a1.group.position.z - a2.group.position.z;
            let distSq = dx*dx + dz*dz;
            let minDist = 0.7;
            if (distSq < minDist*minDist) {
                let dist = Math.sqrt(distSq);
                if (dist < 1e-3) {
                    let ang = Math.random() * Math.PI * 2;
                    dx = Math.cos(ang) * 0.01;
                    dz = Math.sin(ang) * 0.01;
                    dist = 0.01;
                }
                let push = (minDist - dist) * 0.18;
                let px = (dx/dist) * push;
                let pz = (dz/dist) * push;
                a1.group.position.x += px; a1.group.position.z += pz;
                a2.group.position.x -= px; a2.group.position.z -= pz;
            }
        }
    }
}

function updateHUD() {
    UI.timeDisplay.innerText = clock.format();
    let stateCounts = {};
    agents.forEach(a => {
        stateCounts[a.state] = (stateCounts[a.state] || 0) + 1;
    });
    let txt = `Occupancy: ${countPresent()} / ${targetOccupancy}\n\nAgent States:\n`;
    for (let k in stateCounts) {
        if (stateCounts[k] > 0) txt += `  ${k}: ${stateCounts[k]}\n`;
    }
    
    txt += `\nElevator:\n`;
    txt += `  Floor: ${elevator.logic.currentFloor}\n`;
    txt += `  Dir: ${elevator.logic.direction}\n`;
    txt += `  State: ${elevator.logic.state}\n`;
    txt += `  Pax: ${elevator.logic.passengers.size} (+${elevator.logic.pendingBoarders.size} b, -${elevator.logic.pendingDisembark.size} d)\n`;
    txt += `  Dest: ${Array.from(elevator.logic.destinations).join(',')}\n`;
    txt += `  Up: ${Array.from(elevator.logic.upCalls).join(',')}\n`;
    txt += `  Dn: ${Array.from(elevator.logic.downCalls).join(',')}\n`;
    
    UI.stateBreakdown.innerText = txt;
}

const realClock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);

    let realDt = Math.min(0.05, realClock.getDelta());
    clock.tick(realDt);
    updateLighting();
    
    let motionDt = realDt * clock.timeScale;
    
    topUpVisitors();
    elevator.tick(motionDt);
    
    agents.forEach(agent => {
        if (agent.state === "DISABLED" || agent.state === "GONE") return;
        
        if (agent.state === "AWAY") {
            if (clock.simMinute >= agent.arrivalTime) {
                // Spawn
                scene.add(agent.group);
                agent.group.position.set((Math.random()-0.5)*2.2, 0, 12 + (Math.random()-0.5)*1.5);
                agent.currentFloor = 0;
                agent.plan = agent.role === "WORKER" ? planArriveToDesk(agent) : planVisitorVisit(agent);
                agent.state = "ARRIVING";
            }
            return;
        }
        
        let iters = 0;
        while(iters++ < 16) {
            if (!pumpAction(agent, motionDt)) break;
        }
        
        animatePersonWalking(agent.group, motionDt);
    });

    applyCollisions();
    
    controls.update();
    renderer.render(scene, camera);
    updateHUD();
}

animate();
