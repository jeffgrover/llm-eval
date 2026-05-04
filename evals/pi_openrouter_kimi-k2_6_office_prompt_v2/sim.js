(function() {
    // ============ Constants ============
    const MAX_WORKERS = 20;
    const MAX_VISITORS = 80;
    const MAX_OCCUPANCY = MAX_WORKERS + MAX_VISITORS;
    const MEETING_PROB = 0.36 * 0.4; // ~14%

    const FH = WORLD.FLOOR_HEIGHT;
    const FC = WORLD.FLOOR_COUNT;

    // ============ Names & Palettes ============
    const FIRST_NAMES = [
        "Alex","Jordan","Taylor","Casey","Morgan","Riley","Quinn","Avery","Cameron","Dakota",
        "Reese","Skyler","Parker","Sam","Jamie","Drew","Devin","Charlie","Rowan","Finley",
        "Hayden","Peyton","Dallas","River","Sage","Phoenix","Sawyer","Spencer","Sterling","Val"
    ];
    function randPick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
    function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
    function randFloat(min, max) { return Math.random() * (max - min) + min; }

    // ============ Scene Setup ============
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 200);
    camera.position.set(28, 24, 28);
    camera.lookAt(0, 10, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.sortObjects = true;
    renderer.domElement.style.display = 'block';
    document.body.appendChild(renderer.domElement);

    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 8, 0);
    controls.update();

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    const sunLight = new THREE.DirectionalLight(0xffffff, 1.0);
    sunLight.position.set(20, 50, 20);
    scene.add(sunLight);
    const hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x222233, 0.4);
    scene.add(hemiLight);

    // ============ World & Elevator ============
    const world = createWorld(scene);
    const elevator = new Elevator(scene, world);
    elevator.carGroup.position.y = 0;

    // ============ Day/Night Lighting ============
    // Keyframes: hour -> {bg, sunColor, sunIntensity, ambientIntensity, hemiIntensity}
    const DAY_KEYS = [
        { h: 0,  bg: [0.05,0.05,0.12], sun: [0.2,0.2,0.4], si: 0.0, ai: 0.45, hi: 0.32 },
        { h: 6,  bg: [0.05,0.05,0.12], sun: [0.3,0.2,0.1], si: 0.2, ai: 0.45, hi: 0.35 },
        { h: 6.5,bg: [0.4,0.3,0.2], sun: [1.0,0.7,0.3], si: 1.0, ai: 0.50, hi: 0.45 },
        { h: 7,  bg: [0.5,0.55,0.65], sun: [1.0,0.95,0.85], si: 1.2, ai: 0.55, hi: 0.50 },
        { h: 8,  bg: [0.6,0.7,0.8], sun: [1.0,1.0,1.0], si: 1.3, ai: 0.60, hi: 0.55 },
        { h: 12, bg: [0.65,0.75,0.85], sun: [1.0,1.0,1.0], si: 1.4, ai: 0.65, hi: 0.60 },
        { h: 17.5,bg:[0.65,0.75,0.85], sun: [1.0,1.0,1.0], si: 1.2, ai: 0.60, hi: 0.55 },
        { h: 18, bg: [0.5,0.4,0.3], sun: [1.0,0.7,0.3], si: 0.8, ai: 0.50, hi: 0.45 },
        { h: 18.5,bg:[0.15,0.12,0.18], sun: [0.4,0.2,0.15], si: 0.2, ai: 0.45, hi: 0.35 },
        { h: 19.5,bg:[0.05,0.05,0.12], sun: [0.2,0.2,0.4], si: 0.0, ai: 0.45, hi: 0.32 },
        { h: 24, bg: [0.05,0.05,0.12], sun: [0.2,0.2,0.4], si: 0.0, ai: 0.45, hi: 0.32 },
    ];
    function lerp(a, b, t) { return a + (b - a) * t; }
    function updateLighting(simHour) {
        let k0 = DAY_KEYS[0], k1 = DAY_KEYS[DAY_KEYS.length-1];
        for (let i = 0; i < DAY_KEYS.length - 1; i++) {
            if (simHour >= DAY_KEYS[i].h && simHour <= DAY_KEYS[i+1].h) {
                k0 = DAY_KEYS[i]; k1 = DAY_KEYS[i+1]; break;
            }
        }
        const t = k0.h === k1.h ? 0 : (simHour - k0.h) / (k1.h - k0.h);
        scene.background = new THREE.Color(
            lerp(k0.bg[0], k1.bg[0], t), lerp(k0.bg[1], k1.bg[1], t), lerp(k0.bg[2], k1.bg[2], t)
        );
        sunLight.color.setRGB(lerp(k0.sun[0],k1.sun[0],t), lerp(k0.sun[1],k1.sun[1],t), lerp(k0.sun[2],k1.sun[2],t));
        sunLight.intensity = lerp(k0.si, k1.si, t);
        ambientLight.intensity = lerp(k0.ai, k1.ai, t);
        hemiLight.intensity = lerp(k0.hi, k1.hi, t);
    }
    scene.background = new THREE.Color(0.05, 0.05, 0.12);

    // ============ Clock ============
    const clock = new THREE.Clock();
    let simMinute = 7 * 60 + 30; // 07:30
    let timeScale = 120;
    let targetOccupancy = 45;

    function formatSimTime(m) {
        m = Math.floor(m) % (24 * 60);
        if (m < 0) m += 24 * 60;
        const h = Math.floor(m / 60);
        const min = m % 60;
        const ampm = h >= 12 ? 'PM' : 'AM';
        const h12 = h % 12 || 12;
        const mm = min < 10 ? '0' + min : String(min);
        return `${h12}:${mm} ${ampm}`;
    }

    // ============ Agent Pool ============
    const agents = [];
    const seatReservations = new Set();

    function createAgentPool() {
        const officeFloors = [];
        for (let f = 1; f < FC; f++) {
            world.floors[f].desks.forEach(d => officeFloors.push({ floor: f, desk: d }));
        }
        // Workers
        for (let i = 0; i < MAX_WORKERS; i++) {
            const of = officeFloors[i % officeFloors.length]; // 20 desks across 5 floors = 4 per floor
            const deskName = `office${String.fromCharCode(65 + (i % 4))}_desk`;
            const doorName = `office${String.fromCharCode(65 + (i % 4))}_door`;
            const chairName = `office${String.fromCharCode(65 + (i % 4))}_chair`;
            const group = createPerson({});
            group.visible = false;
            scene.add(group);
            agents.push({
                id: i,
                role: 'WORKER',
                name: randPick(FIRST_NAMES),
                homeFloor: of.floor,
                deskId: i % 4,
                deskWpName: chairName,
                deskDoorWpName: doorName,
                arrivalTime: 0, lunchTime: 0, lunchDuration: 0,
                departureTime: 0, plannedMeetingTimes: [],
                hasLunched: false,
                state: 'DISABLED', plan: [], currentActionIndex: 0,
                currentAction: null,
                group: group,
                path: [], pathIndex: 0,
                assignedSpot: null,
                reservedSeat: null,
                _prevPos: null, _stallT: 0,
                _prevWalk: null, _walkStallT: 0,
            });
        }
        // Visitors
        for (let i = MAX_WORKERS; i < MAX_OCCUPANCY; i++) {
            const group = createPerson({});
            group.visible = false;
            scene.add(group);
            agents.push({
                id: i,
                role: 'VISITOR',
                name: randPick(FIRST_NAMES),
                homeFloor: null, deskId: null, deskWpName: null, deskDoorWpName: null,
                arrivalTime: 0, lunchTime: null, lunchDuration: 0,
                departureTime: 0, plannedMeetingTimes: [],
                hasLunched: false,
                state: 'DISABLED', plan: [], currentActionIndex: 0,
                currentAction: null,
                group: group,
                path: [], pathIndex: 0,
                assignedSpot: null,
                reservedSeat: null,
                _prevPos: null, _stallT: 0,
                _prevWalk: null, _walkStallT: 0,
            });
        }
    }
    createAgentPool();

    // ============ Daily Schedule Resampling ============
    function resampleSchedule(agent) {
        agent.arrivalTime = randFloat(8.25, 9.5) * 60;
        agent.lunchTime = randFloat(11.5, 13.5) * 60;
        agent.lunchDuration = randFloat(25, 60);
        agent.hasLunched = false;
        if (Math.random() < 0.15) {
            agent.departureTime = randFloat(18.5, 19.75) * 60;
        } else {
            agent.departureTime = randFloat(16.75, 18.5) * 60;
        }
        agent.plannedMeetingTimes = [];
        // Morning meeting, 0-1 meetings
        if (Math.random() < 0.4) {
            agent.plannedMeetingTimes.push(randFloat(10, 12) * 60);
        }
        // Afternoon meeting
        if (Math.random() < 0.3) {
            agent.plannedMeetingTimes.push(randFloat(13.5, 16.5) * 60);
        }
        agent.plannedMeetingTimes.sort((a,b) => a-b);
    }

    // ============ Elevator Helpers ============
    function getSpotWorld(spot) {
        const carY = elevator.carGroup.position.y;
        return new THREE.Vector3(spot.x, carY + 0.85, spot.z);
    }
    function getElevWaitPos(floor) {
        return new THREE.Vector3(0, floor * FH, 1.6);
    }

    // ============ Primitive Actions ============
    // Action types: WALK_TO_WP, WAIT_AT_PANEL, ENTER_ELEVATOR, PRESS_FLOOR, WAIT_FOR_FLOOR,
    //               EXIT_ELEVATOR, SIT, STAND, RELEASE_SEAT, WAIT_SIM, EXIT_BUILDING,
    //               ENTER_STATE, MARK_LUNCHED, PICK_NEXT_ACTIVITY

    const WALK_SPEED = 1.3; // m/s at 1x

    function startAction(agent, action) {
        agent.currentAction = action;
        switch (action.type) {
            case 'WALK_TO_WP': {
                agent.path = [];
                agent.pathIndex = 0;
                agent._prevPos = null;
                agent._stallT = 0;
                agent._prevWalk = null;
                agent._walkStallT = 0;
                const floor = action.floor;
                const fromName = action.fromName || agent.currentFloorName;
                const wpName = action.wpName;
                const nodes = world.floors[floor || 0].nodes;
                const pathVecs = world.bfsPath(nodes, fromName, wpName);
                if (pathVecs.length > 0) {
                    agent.path = pathVecs;
                    agent.pathIndex = 0;
                }
                break;
            }
            case 'WAIT_AT_PANEL': {
                agent.currentFloorName = action.fromName;
                break;
            }
            case 'ENTER_ELEVATOR': {
                agent._phase = 'reserve';
                agent._prevWalk = null;
                agent._walkStallT = 0;
                break;
            }
            case 'SIT': {
                const st = window._sitTargets[action.wpName];
                if (st) {
                    agent.group.position.y = st.y - 0.35;
                    agent.group.rotation.y = st.facing;
                    agent.group.userData.isSitting = true;
                    if (!st.sit) {
                        // Jitter for standing waypoint
                        const r = randFloat(0.35, 0.75);
                        const a = randFloat(0, Math.PI * 2);
                        agent.group.position.x += Math.cos(a) * r;
                        agent.group.position.z += Math.sin(a) * r;
                    }
                }
                break;
            }
            case 'STAND': {
                const st = window._sitTargets[action.wpName];
                if (st) {
                    agent.group.position.y = st.y;
                } else {
                    // In elevator or default
                    const p = agent.group.position;
                    agent.group.position.y = p.y + 0.35;
                }
                agent.group.userData.isSitting = false;
                break;
            }
            case 'WAIT_SIM': {
                action.untilMin = simMinute + action.minutes;
                break;
            }
            case 'EXIT_BUILDING': {
                agent.group.visible = false;
                break;
            }
            case 'ENTER_STATE': {
                agent.state = action.state;
                break;
            }
            case 'MARK_LUNCHED': {
                agent.hasLunched = true;
                break;
            }
            case 'RELEASE_SEAT': {
                if (agent.reservedSeat) {
                    seatReservations.delete(agent.reservedSeat);
                    agent.reservedSeat = null;
                }
                break;
            }
            case 'PICK_NEXT_ACTIVITY': {
                chooseNextActivity(agent);
                break;
            }
        }
    }

    function updateAction(agent, motionDt) {
        const act = agent.currentAction;
        if (!act) return false;
        switch (act.type) {
            case 'WALK_TO_WP': {
                if (agent.pathIndex >= agent.path.length) return true;
                const target = agent.path[agent.pathIndex];
                const pos = agent.group.position;
                const dx = target.x - pos.x;
                const dy = target.y - pos.y;
                const dz = target.z - pos.z;
                const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
                const step = WALK_SPEED * motionDt;

                // Stall detection
                if (agent._prevPos) {
                    const moved = Math.sqrt(
                        (pos.x - agent._prevPos.x)**2 +
                        (pos.y - agent._prevPos.y)**2 +
                        (pos.z - agent._prevPos.z)**2);
                    if (moved < 0.005 * motionDt) {
                        agent._stallT += motionDt;
                        if (agent._stallT > 1.2) {
                            agent.pathIndex++;
                            agent._stallT = 0;
                        }
                    } else {
                        agent._stallT = 0;
                    }
                }
                agent._prevPos = pos.clone();

                if (dist < step) {
                    pos.set(target.x, target.y, target.z);
                    agent.pathIndex++;
                    if (agent.pathIndex >= agent.path.length) {
                        agent.group.userData.isWalking = false;
                        agent.currentFloorName = action.wpName;
                        return true;
                    }
                } else {
                    const scale = step / dist;
                    pos.x += dx * scale;
                    pos.y += dy * scale;
                    pos.z += dz * scale;
                    agent.group.rotation.y = Math.atan2(dx, dz);
                    agent.group.userData.isWalking = true;
                }
                return false;
            }
            case 'WAIT_AT_PANEL': {
                const floor = act.floor;
                const dir = act.dir;
                if (dir > 0) elevator.callUp(floor); else elevator.callDown(floor);
                const accepting = elevator.isAcceptingAt(floor, dir) && elevator.currentCapacityFree() > 0;
                if (accepting) {
                    return true;
                }
                return false;
            }
            case 'ENTER_ELEVATOR': {
                const toFloor = act.toFloor;
                if (agent._phase === 'reserve') {
                    if (!agent.assignedSpot) {
                        const spot = elevator.reserveBoardingSpot(agent.name);
                        if (!spot) return false;
                        agent.assignedSpot = spot;
                    }
                    // Walk to door threshold
                    const carWorld = elevator.carGroup.position;
                    const threshold = new THREE.Vector3(agent.assignedSpot.x, carWorld.y + 0.85, carWorld.z + 1.2);
                    // Actually the door is at z = carWorld.z + D/2. Let's aim at threshold on the spot's x
                    // Threshold near car front: z = carWorld.z + 1.1 (since car depth is 2.2)
                    threshold.set(agent.assignedSpot.x, carWorld.y + 0.85, carWorld.z + 1.1);
                    const pos = agent.group.position;
                    const dx = threshold.x - pos.x;
                    const dy = threshold.y - pos.y;
                    const dz = threshold.z - pos.z;
                    const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
                    const step = WALK_SPEED * motionDt;

                    // Stall recovery
                    if (agent._prevWalk) {
                        const moved = pos.distanceTo(agent._prevWalk);
                        if (moved < 0.005 * motionDt) {
                            agent._walkStallT += motionDt;
                            if (agent._walkStallT > 1.5) {
                                pos.copy(threshold);
                            }
                        } else {
                            agent._walkStallT = 0;
                        }
                    }
                    agent._prevWalk = pos.clone();

                    if (dist < step || agent._walkStallT > 1.5) {
                        pos.copy(threshold);
                        // Reparent to car
                        elevator.carGroup.attach(agent.group);
                        agent._phase = 'walk_in';
                    } else {
                        const scale = step / dist;
                        pos.x += dx * scale; pos.y += dy * scale; pos.z += dz * scale;
                        agent.group.rotation.y = Math.atan2(dx, dz);
                        agent.group.userData.isWalking = true;
                    }
                    return false;
                }
                if (agent._phase === 'walk_in') {
                    const spotLocal = new THREE.Vector3(agent.assignedSpot.x, 0.85, agent.assignedSpot.z);
                    const pos = agent.group.position;
                    const dx = spotLocal.x - pos.x;
                    const dy = spotLocal.y - pos.y;
                    const dz = spotLocal.z - pos.z;
                    const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
                    const step = WALK_SPEED * motionDt;
                    if (dist < step) {
                        pos.copy(spotLocal);
                        elevator.completeBoard(agent.name);
                        agent.group.rotation.y = 0;
                        agent.group.userData.isWalking = false;
                        return true;
                    } else {
                        const scale = step / dist;
                        pos.x += dx * scale; pos.y += dy * scale; pos.z += dz * scale;
                        agent.group.rotation.y = Math.atan2(dx, dz);
                        agent.group.userData.isWalking = true;
                    }
                    return false;
                }
                return false;
            }
            case 'PRESS_FLOOR': {
                elevator.pressDestination(act.floor);
                return true;
            }
            case 'WAIT_FOR_FLOOR': {
                if (elevator.state === 3 /* DOOR_OPEN */ && elevator.currentFloor === act.floor) {
                    return true;
                }
                return false;
            }
            case 'EXIT_ELEVATOR': {
                const toFloorNode = world.floors[act.toFloor].nodes['elevWait'];
                if (!toFloorNode) return true;
                const target = toFloorNode.pos.clone();
                if (!elevator.pendingDisembark.has(agent.name)) {
                    elevator.registerDisembark(agent.name);
                    // Reparent back to scene preserving world position
                    scene.attach(agent.group);
                }
                const pos = agent.group.position;
                const dx = target.x - pos.x;
                const dy = target.y - pos.y;
                const dz = target.z - pos.z;
                const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
                const step = WALK_SPEED * motionDt;
                if (dist < step) {
                    pos.copy(target);
                    elevator.completeDisembark(agent.name);
                    agent.group.userData.isWalking = false;
                    agent.assignedSpot = null;
                    return true;
                } else {
                    const scale = step / dist;
                    pos.x += dx * scale; pos.y += dy * scale; pos.z += dz * scale;
                    agent.group.rotation.y = Math.atan2(dx, dz);
                    agent.group.userData.isWalking = true;
                }
                return false;
            }
            case 'SIT':
            case 'STAND':
            case 'WAIT_SIM': {
                if (simMinute >= act.untilMin) return true;
                return false;
            }
            case 'EXIT_BUILDING':
            case 'ENTER_STATE':
            case 'MARK_LUNCHED':
            case 'RELEASE_SEAT':
            case 'PICK_NEXT_ACTIVITY':
                return true;
        }
        return true;
    }

    // ============ Plan Compilers ============
    function planArriveToDesk(agent) {
        const f = agent.homeFloor;
        const desk = agent.deskWpName;
        const door = agent.deskDoorWpName;
        const plan = [
            { type: 'ENTER_STATE', state: 'ARRIVING' },
            { type: 'STAND', wpName: 'outside' },
            { type: 'WALK_TO_WP', floor: 0, fromName: 'outside', wpName: 'entrance' },
            { type: 'WALK_TO_WP', floor: 0, fromName: 'entrance', wpName: 'elevWait' },
            { type: 'WAIT_AT_PANEL', floor: 0, dir: 1, toFloor: f, fromName: 'elevWait' },
            { type: 'ENTER_ELEVATOR', toFloor: f },
            { type: 'PRESS_FLOOR', floor: f },
            { type: 'WAIT_FOR_FLOOR', floor: f },
            { type: 'EXIT_ELEVATOR', toFloor: f },
            { type: 'WALK_TO_WP', floor: f, fromName: 'elevWait', wpName: door },
            { type: 'WALK_TO_WP', floor: f, fromName: door, wpName: desk },
            { type: 'SIT', floor: f, wpName: desk },
            { type: 'ENTER_STATE', state: 'AT_DESK' },
            { type: 'WAIT_SIM', minutes: randFloat(18, 65) },
            { type: 'PICK_NEXT_ACTIVITY' },
        ];
        return plan;
    }

    function planGoToLunch(agent) {
        const f = agent.homeFloor;
        const desk = agent.deskWpName;
        const door = agent.deskDoorWpName;
        const bistro = randPick(['bistro0_chair0','bistro0_chair1','bistro1_chair0','bistro1_chair1']);
        const plan = [
            { type: 'STAND', wpName: desk },
            { type: 'RELEASE_SEAT' },
            { type: 'WALK_TO_WP', floor: f, fromName: desk, wpName: door },
            { type: 'WALK_TO_WP', floor: f, fromName: door, wpName: 'elevWait' },
            { type: 'WAIT_AT_PANEL', floor: f, dir: -1, toFloor: 0, fromName: 'elevWait' },
            { type: 'ENTER_ELEVATOR', toFloor: 0 },
            { type: 'PRESS_FLOOR', floor: 0 },
            { type: 'WAIT_FOR_FLOOR', floor: 0 },
            { type: 'EXIT_ELEVATOR', toFloor: 0 },
            { type: 'WALK_TO_WP', floor: 0, fromName: 'elevWait', wpName: bistro },
            { type: 'SIT', floor: 0, wpName: bistro },
            { type: 'ENTER_STATE', state: 'AT_LUNCH' },
            { type: 'WAIT_SIM', minutes: agent.lunchDuration },
            { type: 'MARK_LUNCHED' },
            { type: 'STAND', wpName: bistro },
            // Back to desk
            { type: 'WALK_TO_WP', floor: 0, fromName: bistro, wpName: 'elevWait' },
            { type: 'WAIT_AT_PANEL', floor: 0, dir: 1, toFloor: f, fromName: 'elevWait' },
            { type: 'ENTER_ELEVATOR', toFloor: f },
            { type: 'PRESS_FLOOR', floor: f },
            { type: 'WAIT_FOR_FLOOR', floor: f },
            { type: 'EXIT_ELEVATOR', toFloor: f },
            { type: 'WALK_TO_WP', floor: f, fromName: 'elevWait', wpName: door },
            { type: 'WALK_TO_WP', floor: f, fromName: door, wpName: desk },
            { type: 'SIT', floor: f, wpName: desk },
            { type: 'ENTER_STATE', state: 'AT_DESK' },
            { type: 'WAIT_SIM', minutes: randFloat(18, 65) },
            { type: 'PICK_NEXT_ACTIVITY' },
        ];
        return plan;
    }

    function planVisitLounge(agent) {
        const f = agent.homeFloor || randInt(1, FC-1);
        const spots = ['lounge_spot0', 'lounge_spot1', 'lounge_spot2'];
        const spot = randPick(spots);
        const plan = [
            { type: 'STAND', wpName: agent.deskWpName || 'elevWait' },
            { type: 'RELEASE_SEAT' },
            { type: 'WALK_TO_WP', floor: f, fromName: 'elevWait', wpName: 'lounge_door' },
            { type: 'WALK_TO_WP', floor: f, fromName: 'lounge_door', wpName: spot },
            { type: 'SIT', floor: f, wpName: spot },
            { type: 'ENTER_STATE', state: 'AT_BREAK' },
            { type: 'WAIT_SIM', minutes: randFloat(5, 12) },
            { type: 'STAND', wpName: spot },
            { type: 'WALK_TO_WP', floor: f, fromName: spot, wpName: 'lounge_door' },
            { type: 'WALK_TO_WP', floor: f, fromName: 'lounge_door', wpName: 'elevWait' },
            { type: 'WALK_TO_WP', floor: f, fromName: 'elevWait', wpName: agent.deskWpName || 'elevWait' },
            { type: 'SIT', floor: f, wpName: agent.deskWpName || 'elevWait' },
            { type: 'ENTER_STATE', state: 'AT_DESK' },
            { type: 'WAIT_SIM', minutes: randFloat(18, 65) },
            { type: 'PICK_NEXT_ACTIVITY' },
        ];
        return plan;
    }

    function planAttendMeeting(agent) {
        const mf = Math.random() < 0.65 ? agent.homeFloor || randInt(1, FC-1) : randInt(1, FC-1);
        const confCenter = 'conf_center';
        const seats = ['conf_seat0','conf_seat1','conf_seat2','conf_seat3'];
        // Find an available seat
        let seat = null;
        for (const s of seats) {
            const key = `${mf}:${s}`;
            if (!seatReservations.has(key)) { seat = s; seatReservations.add(key); agent.reservedSeat = key; break; }
        }
        if (!seat) return planVisitLounge(agent);

        const startWp = agent.deskWpName || 'elevWait';
        const startDoor = agent.deskDoorWpName || 'officeA_door';
        const plan = [
            { type: 'STAND', wpName: startWp },
            { type: 'RELEASE_SEAT' },
            { type: 'WALK_TO_WP', floor: agent.homeFloor || 0, fromName: startWp, wpName: startDoor },
            { type: 'WALK_TO_WP', floor: agent.homeFloor || 0, fromName: startDoor, wpName: 'elevWait' },
            { type: 'WAIT_AT_PANEL', floor: agent.homeFloor || 0, dir: (mf > (agent.homeFloor||0)) ? 1 : -1, toFloor: mf, fromName: 'elevWait' },
            { type: 'ENTER_ELEVATOR', toFloor: mf },
            { type: 'PRESS_FLOOR', floor: mf },
            { type: 'WAIT_FOR_FLOOR', floor: mf },
            { type: 'EXIT_ELEVATOR', toFloor: mf },
            { type: 'WALK_TO_WP', floor: mf, fromName: 'elevWait', wpName: 'conf_door' },
            { type: 'WALK_TO_WP', floor: mf, fromName: 'conf_door', wpName: seat },
            { type: 'SIT', floor: mf, wpName: seat },
            { type: 'ENTER_STATE', state: 'IN_MEETING' },
            { type: 'WAIT_SIM', minutes: randFloat(22, 45) },
            { type: 'STAND', wpName: seat },
            { type: 'RELEASE_SEAT' },
            { type: 'WALK_TO_WP', floor: mf, fromName: seat, wpName: 'conf_door' },
            { type: 'WALK_TO_WP', floor: mf, fromName: 'conf_door', wpName: 'elevWait' },
            { type: 'WAIT_AT_PANEL', floor: mf, dir: (agent.homeFloor||0) > mf ? 1 : -1, toFloor: agent.homeFloor||0, fromName: 'elevWait' },
            { type: 'ENTER_ELEVATOR', toFloor: agent.homeFloor||0 },
            { type: 'PRESS_FLOOR', floor: agent.homeFloor||0 },
            { type: 'WAIT_FOR_FLOOR', floor: agent.homeFloor||0 },
            { type: 'EXIT_ELEVATOR', toFloor: agent.homeFloor||0 },
            { type: 'WALK_TO_WP', floor: agent.homeFloor||0, fromName: 'elevWait', wpName: startDoor },
            { type: 'WALK_TO_WP', floor: agent.homeFloor||0, fromName: startDoor, wpName: startWp },
            { type: 'SIT', floor: agent.homeFloor||0, wpName: startWp },
            { type: 'ENTER_STATE', state: 'AT_DESK' },
            { type: 'WAIT_SIM', minutes: randFloat(18, 65) },
            { type: 'PICK_NEXT_ACTIVITY' },
        ];
        return plan;
    }

    function planVisitCoworker(agent) {
        // Pick a random agent currently AT_DESK
        const candidates = agents.filter(a => a !== agent && a.state === 'AT_DESK' && a.deskDoorWpName);
        if (candidates.length === 0) return planVisitLounge(agent);
        const target = randPick(candidates);
        const tf = target.homeFloor;
        const td = target.deskDoorWpName;
        const startWp = agent.deskWpName || 'elevWait';
        const startDoor = agent.deskDoorWpName || 'officeA_door';
        const plan = [
            { type: 'STAND', wpName: startWp },
            { type: 'RELEASE_SEAT' },
            { type: 'WALK_TO_WP', floor: agent.homeFloor || 0, fromName: startWp, wpName: startDoor },
            { type: 'WALK_TO_WP', floor: agent.homeFloor || 0, fromName: startDoor, wpName: 'elevWait' },
            { type: 'WAIT_AT_PANEL', floor: agent.homeFloor || 0, dir: tf > (agent.homeFloor||0) ? 1 : -1, toFloor: tf, fromName: 'elevWait' },
            { type: 'ENTER_ELEVATOR', toFloor: tf },
            { type: 'PRESS_FLOOR', floor: tf },
            { type: 'WAIT_FOR_FLOOR', floor: tf },
            { type: 'EXIT_ELEVATOR', toFloor: tf },
            { type: 'WALK_TO_WP', floor: tf, fromName: 'elevWait', wpName: td },
            { type: 'ENTER_STATE', state: 'VISITING' },
            { type: 'WAIT_SIM', minutes: randFloat(6, 18) },
            { type: 'WALK_TO_WP', floor: tf, fromName: td, wpName: 'elevWait' },
            { type: 'WAIT_AT_PANEL', floor: tf, dir: (agent.homeFloor||0) > tf ? 1 : -1, toFloor: agent.homeFloor||0, fromName: 'elevWait' },
            { type: 'ENTER_ELEVATOR', toFloor: agent.homeFloor||0 },
            { type: 'PRESS_FLOOR', floor: agent.homeFloor||0 },
            { type: 'WAIT_FOR_FLOOR', floor: agent.homeFloor||0 },
            { type: 'EXIT_ELEVATOR', toFloor: agent.homeFloor||0 },
            { type: 'WALK_TO_WP', floor: agent.homeFloor||0, fromName: 'elevWait', wpName: startDoor },
            { type: 'WALK_TO_WP', floor: agent.homeFloor||0, fromName: startDoor, wpName: startWp },
            { type: 'SIT', floor: agent.homeFloor||0, wpName: startWp },
            { type: 'ENTER_STATE', state: 'AT_DESK' },
            { type: 'WAIT_SIM', minutes: randFloat(18, 65) },
            { type: 'PICK_NEXT_ACTIVITY' },
        ];
        return plan;
    }

    function planLeaveBuilding(agent) {
        const f = agent.homeFloor || 0;
        const desk = agent.deskWpName;
        const door = agent.deskDoorWpName;
        let plan = [];
        if (desk) {
            plan.push({ type: 'STAND', wpName: desk });
            plan.push({ type: 'RELEASE_SEAT' });
            plan.push({ type: 'WALK_TO_WP', floor: f, fromName: desk, wpName: door || 'elevWait' });
        } else {
            plan.push({ type: 'WALK_TO_WP', floor: 0, fromName: agent.currentFloorName || 'outside', wpName: 'elevWait' });
        }
        if (f > 0) {
            plan.push({ type: 'WALK_TO_WP', floor: f, fromName: door || desk || 'elevWait', wpName: 'elevWait' });
            plan.push({ type: 'WAIT_AT_PANEL', floor: f, dir: -1, toFloor: 0, fromName: 'elevWait' });
            plan.push({ type: 'ENTER_ELEVATOR', toFloor: 0 });
            plan.push({ type: 'PRESS_FLOOR', floor: 0 });
            plan.push({ type: 'WAIT_FOR_FLOOR', floor: 0 });
            plan.push({ type: 'EXIT_ELEVATOR', toFloor: 0 });
        }
        plan.push({ type: 'WALK_TO_WP', floor: 0, fromName: 'elevWait', wpName: 'entrance' });
        plan.push({ type: 'WALK_TO_WP', floor: 0, fromName: 'entrance', wpName: 'outside' });
        plan.push({ type: 'EXIT_BUILDING' });
        plan.push({ type: 'ENTER_STATE', state: 'GONE' });
        return plan;
    }

    function planVisitorVisit(agent) {
        const r = Math.random();
        let plan = [
            { type: 'ENTER_STATE', state: 'ARRIVING' },
            { type: 'STAND', wpName: 'outside' },
            { type: 'WALK_TO_WP', floor: 0, fromName: 'outside', wpName: 'entrance' },
        ];

        if (r < 0.10) {
            // Bistro table (cafe)
            const bistro = randPick(['bistro0_chair0','bistro0_chair1','bistro1_chair0','bistro1_chair1']);
            plan.push({ type: 'WALK_TO_WP', floor: 0, fromName: 'entrance', wpName: bistro });
            plan.push({ type: 'SIT', floor: 0, wpName: bistro });
            plan.push({ type: 'ENTER_STATE', state: 'VISITING' });
            plan.push({ type: 'WAIT_SIM', minutes: randFloat(10, 30) });
            plan.push({ type: 'STAND', wpName: bistro });
        } else if (r < 0.16) {
            // Cafe counter
            plan.push({ type: 'WALK_TO_WP', floor: 0, fromName: 'entrance', wpName: 'cafe_order' });
            plan.push({ type: 'ENTER_STATE', state: 'VISITING' });
            plan.push({ type: 'WAIT_SIM', minutes: randFloat(5, 12) });
        } else if (r < 0.30) {
            // Front lounge
            const spot = randPick(['front_lounge_chair0','front_lounge_chair1','front_lounge_center']);
            plan.push({ type: 'WALK_TO_WP', floor: 0, fromName: 'entrance', wpName: spot });
            plan.push({ type: 'SIT', floor: 0, wpName: spot });
            plan.push({ type: 'ENTER_STATE', state: 'VISITING' });
            plan.push({ type: 'WAIT_SIM', minutes: randFloat(8, 25) });
            plan.push({ type: 'STAND', wpName: spot });
        } else if (r < 0.42) {
            // Back lounge / conversation pit
            const spot = randPick(['back_lounge_N','back_lounge_S','pit_N','pit_S','pit_E','pit_W']);
            plan.push({ type: 'WALK_TO_WP', floor: 0, fromName: 'entrance', wpName: spot });
            plan.push({ type: 'SIT', floor: 0, wpName: spot });
            plan.push({ type: 'ENTER_STATE', state: 'VISITING' });
            plan.push({ type: 'WAIT_SIM', minutes: randFloat(6, 20) });
            plan.push({ type: 'STAND', wpName: spot });
        } else if (r < 0.52) {
            // Reception / kiosk / water cooler
            const spot = randPick(['reception','kiosk','lobby_wc_front','lobby_wc_back']);
            plan.push({ type: 'WALK_TO_WP', floor: 0, fromName: 'entrance', wpName: spot });
            plan.push({ type: 'ENTER_STATE', state: 'VISITING' });
            plan.push({ type: 'WAIT_SIM', minutes: randFloat(3, 10) });
        } else if (r < 0.62) {
            // Lobby loiter
            const spot = randPick(['lobby_stand_center','lobby_stand_NE','lobby_stand_NW','lobby_stand_midE','lobby_stand_midW','lobby_stand_entry']);
            plan.push({ type: 'WALK_TO_WP', floor: 0, fromName: 'entrance', wpName: spot });
            plan.push({ type: 'ENTER_STATE', state: 'VISITING' });
            plan.push({ type: 'WAIT_SIM', minutes: randFloat(5, 15) });
        } else if (r < 0.77) {
            // Ride up to office-floor lounge
            const of = randInt(1, FC-1);
            const spot = randPick(['lounge_spot0','lounge_spot1','lounge_spot2']);
            plan.push({ type: 'WALK_TO_WP', floor: 0, fromName: 'entrance', wpName: 'elevWait' });
            plan.push({ type: 'WAIT_AT_PANEL', floor: 0, dir: 1, toFloor: of, fromName: 'elevWait' });
            plan.push({ type: 'ENTER_ELEVATOR', toFloor: of });
            plan.push({ type: 'PRESS_FLOOR', floor: of });
            plan.push({ type: 'WAIT_FOR_FLOOR', floor: of });
            plan.push({ type: 'EXIT_ELEVATOR', toFloor: of });
            plan.push({ type: 'WALK_TO_WP', floor: of, fromName: 'elevWait', wpName: spot });
            plan.push({ type: 'SIT', floor: of, wpName: spot });
            plan.push({ type: 'ENTER_STATE', state: 'VISITING' });
            plan.push({ type: 'WAIT_SIM', minutes: randFloat(8, 25) });
            plan.push({ type: 'STAND', wpName: spot });
            plan.push({ type: 'WALK_TO_WP', floor: of, fromName: spot, wpName: 'lounge_door' });
            plan.push({ type: 'WALK_TO_WP', floor: of, fromName: 'lounge_door', wpName: 'elevWait' });
            plan.push({ type: 'WAIT_AT_PANEL', floor: of, dir: -1, toFloor: 0, fromName: 'elevWait' });
            plan.push({ type: 'ENTER_ELEVATOR', toFloor: 0 });
            plan.push({ type: 'PRESS_FLOOR', floor: 0 });
            plan.push({ type: 'WAIT_FOR_FLOOR', floor: 0 });
            plan.push({ type: 'EXIT_ELEVATOR', toFloor: 0 });
        } else {
            // Sit in on a meeting (23%)
            const of = randInt(1, FC-1);
            const seats = ['conf_seat0','conf_seat1','conf_seat2','conf_seat3'];
            let seat = null;
            for (const s of seats) {
                const key = `${of}:${s}`;
                if (!seatReservations.has(key)) { seat = s; seatReservations.add(key); agent.reservedSeat = key; break; }
            }
            if (!seat) {
                // fallback to lobby loiter
                const spot = randPick(['lobby_stand_center','lobby_stand_NE','lobby_stand_NW','lobby_stand_midE','lobby_stand_midW','lobby_stand_entry']);
                plan.push({ type: 'WALK_TO_WP', floor: 0, fromName: 'entrance', wpName: spot });
                plan.push({ type: 'ENTER_STATE', state: 'VISITING' });
                plan.push({ type: 'WAIT_SIM', minutes: randFloat(5, 15) });
                plan.push({ type: 'WALK_TO_WP', floor: 0, fromName: spot, wpName: 'outside' });
                plan.push({ type: 'EXIT_BUILDING' });
                plan.push({ type: 'ENTER_STATE', state: 'GONE' });
                return plan;
            }
            plan.push({ type: 'WALK_TO_WP', floor: 0, fromName: 'entrance', wpName: 'elevWait' });
            plan.push({ type: 'WAIT_AT_PANEL', floor: 0, dir: 1, toFloor: of, fromName: 'elevWait' });
            plan.push({ type: 'ENTER_ELEVATOR', toFloor: of });
            plan.push({ type: 'PRESS_FLOOR', floor: of });
            plan.push({ type: 'WAIT_FOR_FLOOR', floor: of });
            plan.push({ type: 'EXIT_ELEVATOR', toFloor: of });
            plan.push({ type: 'WALK_TO_WP', floor: of, fromName: 'elevWait', wpName: 'conf_door' });
            plan.push({ type: 'WALK_TO_WP', floor: of, fromName: 'conf_door', wpName: seat });
            plan.push({ type: 'SIT', floor: of, wpName: seat });
            plan.push({ type: 'ENTER_STATE', state: 'IN_MEETING' });
            plan.push({ type: 'WAIT_SIM', minutes: randFloat(22, 45) });
            plan.push({ type: 'STAND', wpName: seat });
            plan.push({ type: 'RELEASE_SEAT' });
            plan.push({ type: 'WALK_TO_WP', floor: of, fromName: seat, wpName: 'conf_door' });
            plan.push({ type: 'WALK_TO_WP', floor: of, fromName: 'conf_door', wpName: 'elevWait' });
            plan.push({ type: 'WAIT_AT_PANEL', floor: of, dir: -1, toFloor: 0, fromName: 'elevWait' });
            plan.push({ type: 'ENTER_ELEVATOR', toFloor: 0 });
            plan.push({ type: 'PRESS_FLOOR', floor: 0 });
            plan.push({ type: 'WAIT_FOR_FLOOR', floor: 0 });
            plan.push({ type: 'EXIT_ELEVATOR', toFloor: 0 });
        }
        plan.push({ type: 'WALK_TO_WP', floor: 0, fromName: 'elevWait', wpName: 'entrance' });
        plan.push({ type: 'WALK_TO_WP', floor: 0, fromName: 'entrance', wpName: 'outside' });
        plan.push({ type: 'EXIT_BUILDING' });
        plan.push({ type: 'ENTER_STATE', state: 'GONE' });
        return plan;
    }

    function chooseNextActivity(agent) {
        const now = simMinute;
        if (agent.role === 'WORKER') {
            if (now >= agent.departureTime) {
                agent.plan = planLeaveBuilding(agent);
                agent.currentActionIndex = 0;
                return;
            }
            if (agent.plannedMeetingTimes.length > 0 && now >= agent.plannedMeetingTimes[0]) {
                agent.plannedMeetingTimes.shift();
                agent.plan = planAttendMeeting(agent);
                agent.currentActionIndex = 0;
                return;
            }
            if (!agent.hasLunched && now >= agent.lunchTime) {
                agent.plan = planGoToLunch(agent);
                agent.currentActionIndex = 0;
                return;
            }
            const r = Math.random();
            if (r < MEETING_PROB) {
                agent.plan = planAttendMeeting(agent);
            } else if (r < MEETING_PROB + 0.12) {
                agent.plan = planVisitLounge(agent);
            } else if (r < MEETING_PROB + 0.12 + 0.15) {
                agent.plan = planVisitCoworker(agent);
            } else {
                agent.plan = [
                    { type: 'WAIT_SIM', minutes: randFloat(18, 65) },
                    { type: 'PICK_NEXT_ACTIVITY' },
                ];
            }
            agent.currentActionIndex = 0;
        } else {
            // Visitor
            agent.plan = planVisitorVisit(agent);
            agent.currentActionIndex = 0;
        }
    }

    // ============ Spawn / Apply Occupancy ============
    function spawnAgent(agent) {
        // Jitter at spawn
        const x = randFloat(-1.1, 1.1);
        const z = 12 + randFloat(-0.75, 0.75);
        agent.group.position.set(x, 0, z);
        agent.group.rotation.y = Math.PI;
        agent.group.visible = true;
        agent.state = 'AWAY';
        agent.group.userData.isSitting = false;
        agent.group.userData.isWalking = false;
        agent.assignedSpot = null;
        agent.currentFloorName = 'outside';
        agent.path = []; agent.pathIndex = 0;
        resampleSchedule(agent);
    }

    function applyOccupancy() {
        for (const agent of agents) {
            if (agent.id < targetOccupancy) {
                if (agent.state === 'DISABLED') spawnAgent(agent);
            } else {
                // Don't immediately disable active agents; they'll naturally finish
                // Only disable if AWAY or GONE
                if (agent.state === 'AWAY' || agent.state === 'GONE') {
                    agent.state = 'DISABLED';
                    agent.group.visible = false;
                }
            }
        }
    }
    applyOccupancy();

    function countPresent() {
        let n = 0;
        for (const a of agents) {
            if (a.state !== 'DISABLED' && a.state !== 'AWAY' && a.state !== 'GONE') n++;
        }
        return n;
    }

    function topUpVisitors() {
        const now = simMinute;
        if (now < 8*60 || now > 18*60) return; // business hours roughly
        const deficit = targetOccupancy - countPresent();
        if (deficit <= 0) return;
        let armed = 0;
        for (const a of agents) {
            if (a.role !== 'VISITOR') continue;
            if (a.state === 'AWAY' || a.state === 'GONE') {
                a.arrivalTime = now + randInt(0, 6);
                a.departureTime = now + randFloat(20, 90);
                a.state = 'AWAY';
                a.group.visible = false;
                armed++;
                if (armed >= deficit) break;
            }
        }
    }

    // ============ Day Wrap Reset ============
    function resetDay() {
        simMinute = 7*60 + 30;
        // Reset agents: re-parent any still in elevator car
        for (const a of agents) {
            if (a.group.parent !== scene) scene.attach(a.group);
        }
        seatReservations.clear();
        for (const a of agents) {
            a.group.visible = false;
            a.state = 'AWAY';
            a.plan = [];
            a.currentAction = null;
            a.currentActionIndex = 0;
            a.hasLunched = false;
            a.plannedMeetingTimes = [];
            a.assignedSpot = null;
            a.reservedSeat = null;
            a.path = [];
            a.pathIndex = 0;
            if (a.role === 'WORKER') {
                resampleSchedule(a);
                a.arrivalTime = randFloat(8.25, 9.5) * 60;
            }
            if (a.id >= targetOccupancy) {
                a.state = 'DISABLED';
            }
        }
        // Reset elevator
        elevator.reset();
    }

    // ============ Apply Occupancy on first run already done above ============

    // ============ Collision ============
    function applyCollisions() {
        // O(n^2) soft repulsion
        const active = agents.filter(a => a.group.visible && a.group.parent === scene);
        const pushScalar = 0.18;
        for (let i = 0; i < active.length; i++) {
            const ai = active[i];
            if (ai.currentAction && ai.currentAction.type === 'ENTER_ELEVATOR') continue; // boarders exempt
            if (ai.group.userData.isSitting) continue;
            const pi = ai.group.position;
            for (let j = i+1; j < active.length; j++) {
                const aj = active[j];
                if (aj.currentAction && aj.currentAction.type === 'ENTER_ELEVATOR') continue;
                if (aj.group.userData.isSitting) continue;
                const pj = aj.group.position;
                const dy = Math.abs(pi.y - pj.y);
                if (dy > 1) continue;
                const dx = pi.x - pj.x;
                const dz = pi.z - pj.z;
                const dist = Math.sqrt(dx*dx + dz*dz);
                if (dist < WORLD.PERSON_R * 1.75) {
                    let nx = dx, nz = dz;
                    if (dist < 1e-3) {
                        const angle = Math.random() * Math.PI * 2;
                        nx = Math.cos(angle); nz = Math.sin(angle);
                    } else {
                        nx = dx / dist; nz = dz / dist;
                    }
                    const force = (WORLD.PERSON_R * 1.75 - dist) * pushScalar;
                    aj.group.position.x += nx * force;
                    aj.group.position.z += nz * force;
                    ai.group.position.x -= nx * force;
                    ai.group.position.z -= nz * force;
                }
            }
        }
    }

    // ============ HUD / UI ============
    const hud = document.createElement('div');
    hud.style.cssText = 'position:absolute;top:10px;left:10px;background:rgba(0,0,0,0.6);color:#fff;padding:12px;font-family:monospace;font-size:13px;border-radius:6px;pointer-events:none;z-index:10;min-width:220px;';
    document.body.appendChild(hud);

    const controlsDiv = document.createElement('div');
    controlsDiv.style.cssText = 'position:absolute;top:10px;left:250px;background:rgba(0,0,0,0.6);color:#fff;padding:12px;font-family:monospace;font-size:13px;border-radius:6px;pointer-events:auto;z-index:10;';
    document.body.appendChild(controlsDiv);

    const timeDisplay = document.createElement('div');
    timeDisplay.style.cssText = 'font-size:22px;font-weight:bold;margin-bottom:4px;';
    controlsDiv.appendChild(timeDisplay);

    const speedRow = document.createElement('div');
    speedRow.innerHTML = 'Speed: ';
    const speedSlider = document.createElement('input');
    speedSlider.type = 'range';
    speedSlider.min = 0; speedSlider.max = 5; speedSlider.value = 2; // log10(120) ~ 2.08
    speedSlider.style.cssText = 'width:120px;vertical-align:middle;';
    const speedLabel = document.createElement('span');
    const LOG_SPEEDS = [1, 5, 10, 30, 60, 120, 300, 600];
    function getSpeedFromSlider() {
        const idx = Math.round(parseFloat(speedSlider.value));
        return LOG_SPEEDS[Math.max(0, Math.min(idx, LOG_SPEEDS.length-1))];
    }
    speedSlider.addEventListener('input', () => { timeScale = getSpeedFromSlider(); speedLabel.textContent = timeScale + 'x'; });
    speedLabel.textContent = '120x';
    speedRow.appendChild(speedSlider);
    speedRow.appendChild(speedLabel);
    controlsDiv.appendChild(speedRow);

    const occRow = document.createElement('div');
    occRow.innerHTML = 'Occupancy: ';
    const occSlider = document.createElement('input');
    occSlider.type = 'range';
    occSlider.min = 1; occSlider.max = MAX_OCCUPANCY; occSlider.value = 45;
    occSlider.style.cssText = 'width:120px;vertical-align:middle;';
    const occLabel = document.createElement('span');
    occLabel.textContent = '45 / 100';
    occSlider.addEventListener('input', () => {
        targetOccupancy = parseInt(occSlider.value);
        occLabel.textContent = targetOccupancy + ' / ' + MAX_OCCUPANCY;
        applyOccupancy();
    });
    occRow.appendChild(occSlider);
    occRow.appendChild(occLabel);
    controlsDiv.appendChild(occRow);

    const stateDisplay = document.createElement('div');
    stateDisplay.style.cssText = 'margin-top:8px;font-size:11px;line-height:1.4;';
    controlsDiv.appendChild(stateDisplay);

    function updateHUD() {
        timeDisplay.textContent = formatSimTime(simMinute);
        const counts = {};
        for (const a of agents) {
            counts[a.state] = (counts[a.state] || 0) + 1;
        }
        const present = countPresent();
        let txt = `People: ${present} / ${MAX_OCCUPANCY}<br>`;
        txt += `Elevator: Fl ${elevator.currentFloor} dir ${elevator.direction > 0 ? 'UP' : elevator.direction < 0 ? 'DOWN' : '-'}<br>`;
        const st = elevator.state;
        txt += `State: ${['IDLE','MOVING','OPNG','OPEN','CLSG'][st] || st}<br>`;
        txt += `Passengers: ${elevator.passengers.size}<br>`;
        txt += `Destinations: ${[...elevator.destinations].join(',') || '-'}<br>`;
        txt += `UpCalls: ${[...elevator.upCalls].join(',') || '-'}<br>`;
        txt += `DownCalls: ${[...elevator.downCalls].join(',') || '-'}<br>`;
        txt += `PendingBoard: ${elevator.pendingBoarders.size} PendingExit: ${elevator.pendingDisembark.size}<br>`;
        txt += `<br>States: `;
        for (const [k,v] of Object.entries(counts)) txt += `${k}=${v} `;
        stateDisplay.innerHTML = txt;
        hud.innerHTML = txt;
    }

    // ============ Main Render Loop ============
    function animate() {
        requestAnimationFrame(animate);
        const realDt = Math.min(0.05, clock.getDelta());
        const motionDt = realDt * timeScale;
        simMinute += motionDt / 60;

        // Day wrap
        if (simMinute >= 24*60) {
            resetDay();
        }

        updateLighting(simMinute / 60);
        elevator.tick(motionDt);

        // Visitor top-up
        topUpVisitors();

        // Action dispatch loop
        for (const agent of agents) {
            if (agent.state === 'DISABLED' || agent.state === 'GONE') continue;

            // Spawn
            if (agent.state === 'AWAY' && simMinute >= agent.arrivalTime) {
                agent.state = 'ARRIVING';
                agent.group.visible = true;
                // If visitor, compile visitor plan from outside
                if (agent.role === 'VISITOR') {
                    agent.plan = planVisitorVisit(agent);
                    agent.currentActionIndex = 0;
                    // Jitter spawn
                    agent.group.position.set(randFloat(-1.1,1.1), 0, 12+randFloat(-0.75,0.75));
                    agent.group.rotation.y = Math.PI;
                    agent.currentFloorName = 'outside';
                } else {
                    agent.plan = planArriveToDesk(agent);
                    agent.currentActionIndex = 0;
                    agent.group.position.set(randFloat(-1.1,1.1), 0, 12+randFloat(-0.75,0.75));
                    agent.group.rotation.y = Math.PI;
                    agent.currentFloorName = 'outside';
                }
            }

            // End-of-day override for workers
            if (agent.role === 'WORKER' && agent.state !== 'LEAVING' && agent.state !== 'GONE' && simMinute >= agent.departureTime) {
                if (agent.state !== 'DISABLED' && agent.state !== 'AWAY') {
                    // Force leave
                    if (agent.reservedSeat) { seatReservations.delete(agent.reservedSeat); agent.reservedSeat = null; }
                    agent.plan = planLeaveBuilding(agent);
                    agent.currentActionIndex = 0;
                    if (agent.state === 'IN_CAR') {
                        // Already in elevator, skip to waiting for floor 0
                        // Simpler: let planLeaveBuilding handle from current position
                    }
                }
            }

            // Run action dispatch loop
            let iter = 0;
            while (iter < 16) {
                iter++;
                if (agent.currentActionIndex >= agent.plan.length) {
                    // No plan
                    break;
                }
                if (!agent.currentAction || agent.currentActionIndex >= agent.plan.length) {
                    const act = agent.plan[agent.currentActionIndex];
                    if (!act) break;
                    startAction(agent, act);
                }
                const done = updateAction(agent, motionDt);
                if (!done) break;
                // Move to next action
                agent.currentActionIndex++;
                agent.currentAction = null;
                if (agent.currentActionIndex >= agent.plan.length) {
                    // End of plan, choose next
                    if (agent.role === 'WORKER' && agent.state !== 'GONE' && agent.state !== 'DISABLED' && agent.state !== 'AWAY') {
                        chooseNextActivity(agent);
                        agent.currentActionIndex = 0;
                        if (agent.plan.length === 0) break;
                    } else {
                        break;
                    }
                }
            }
        }

        applyCollisions();

        for (const agent of agents) {
            if (agent.group.visible) {
                animatePersonWalking(agent.group, motionDt);
            }
        }

        controls.update();
        renderer.render(scene, camera);
        updateHUD();
    }

    // Handle resize
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    animate();
})();
