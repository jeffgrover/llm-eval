// sim.js — Simulated clock, day/night lighting, agent state machine + daily schedules, render loop, UI

(function () {
    // -------------------------------------------------------------------------
    // Constants & Configuration
    // -------------------------------------------------------------------------
    const MAX_WORKERS = 20;
    const MAX_VISITORS = 80;
    const MAX_OCCUPANCY = MAX_WORKERS + MAX_VISITORS; // 100
    const DEFAULT_OCCUPANCY = 45;

    const WALK_SPEED = 1.42;        // m/s
    const BOARD_WALK_SPEED = 1.65;  // slightly brisker through elevator doors
    const SIT_DROP_Y = 0.35;        // drop hips onto chair seat
    const MEETING_PROB = 0.36;      // gated by 0.4 -> ~14.4% ad-hoc meeting weight
    const MAX_SUBSTEP_DT = 0.25;    // motion-seconds per physics substep for lockstep accuracy up to 600x

    const FIRST_NAMES = [
        'Alex', 'Sam', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Jamie',
        'Avery', 'Quinn', 'Cameron', 'Drew', 'Skyler', 'Reese', 'Parker', 'Hayden',
        'Elena', 'Marcus', 'Priya', 'Liam', 'Sofia', 'Noah', 'Maya', 'Ethan',
        'Chloe', 'Lucas', 'Zoe', 'Owen', 'Nora', 'Leo', 'Hannah', 'Isaac',
        'Aria', 'Caleb', 'Mila', 'julian', 'Layla', 'Mateo', 'ruby', 'Eli',
        'Clara', 'logan', 'Eva', 'Miles', 'Naomi', 'Theo', 'Iris', 'Felix',
        'tessa', 'omar', 'Nina', 'Victor', 'Jade', 'simon', 'Vera', 'Hugo'
    ].map(function (n) { return n.charAt(0).toUpperCase() + n.slice(1); });

    function randRange(min, max) {
        return min + Math.random() * (max - min);
    }

    function randInt(min, max) {
        return Math.floor(min + Math.random() * (max - min + 1));
    }

    function shuffled(arr) {
        const copy = arr.slice();
        for (let i = copy.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const tmp = copy[i];
            copy[i] = copy[j];
            copy[j] = tmp;
        }
        return copy;
    }

    // -------------------------------------------------------------------------
    // Scene, Camera, Renderer, Lights, Controls
    // -------------------------------------------------------------------------
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87b5e5);

    const camera = new THREE.PerspectiveCamera(
        45,
        window.innerWidth / window.innerHeight,
        0.5,
        300
    );
    camera.position.set(28, 24, 28);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.sortObjects = true;
    document.body.appendChild(renderer.domElement);

    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.target.set(0, (WORLD.FLOOR_COUNT * WORLD.FLOOR_HEIGHT) * 0.45, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxDistance = 110;
    controls.minDistance = 8;
    controls.update();

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
    scene.add(ambientLight);

    const hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x3b4252, 0.50);
    hemiLight.position.set(0, 40, 0);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xfff5e0, 0.90);
    sunLight.position.set(30, 45, 25);
    scene.add(sunLight);

    window.addEventListener('resize', function () {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // Build World + Elevator
    const world = window.createWorld(scene);
    const elevator = new window.Elevator(scene, world);

    // -------------------------------------------------------------------------
    // Day / Night Lighting Keyframes (9 keyframes, bright flat day, readable night)
    // -------------------------------------------------------------------------
    const DAY_KEYFRAMES = [
        { h: 0.00, bg: 0x181e34, sun: 0x4b5c8a, sunI: 0.10, ambI: 0.45, hemiI: 0.32 },
        { h: 5.75, bg: 0x1e2642, sun: 0x626b9e, sunI: 0.14, ambI: 0.46, hemiI: 0.33 },
        { h: 6.18, bg: 0xdf7c5d, sun: 0xff9a52, sunI: 0.56, ambI: 0.56, hemiI: 0.42 },
        { h: 6.60, bg: 0x86b6e6, sun: 0xfff1d6, sunI: 0.90, ambI: 0.68, hemiI: 0.52 },
        { h: 12.0, bg: 0x98c6f0, sun: 0xfffaf2, sunI: 1.00, ambI: 0.72, hemiI: 0.56 },
        { h: 17.4, bg: 0x89b7e5, sun: 0xffeed2, sunI: 0.88, ambI: 0.67, hemiI: 0.50 },
        { h: 18.0, bg: 0xd86b45, sun: 0xff7c3b, sunI: 0.52, ambI: 0.55, hemiI: 0.41 },
        { h: 18.6, bg: 0x1f2744, sun: 0x546594, sunI: 0.14, ambI: 0.46, hemiI: 0.33 },
        { h: 24.0, bg: 0x181e34, sun: 0x4b5c8a, sunI: 0.10, ambI: 0.45, hemiI: 0.32 }
    ].map(function (k) {
        return {
            h: k.h,
            bgColor: new THREE.Color(k.bg),
            sunColor: new THREE.Color(k.sun),
            sunI: k.sunI,
            ambI: k.ambI,
            hemiI: k.hemiI
        };
    });

    const _tmpBg = new THREE.Color();
    const _tmpSun = new THREE.Color();

    function updateDayNightLighting(simMinute) {
        const hour = Math.max(0, Math.min(24, simMinute / 60));
        let k0 = DAY_KEYFRAMES[0];
        let k1 = DAY_KEYFRAMES[DAY_KEYFRAMES.length - 1];
        for (let i = 0; i < DAY_KEYFRAMES.length - 1; i++) {
            if (hour >= DAY_KEYFRAMES[i].h && hour <= DAY_KEYFRAMES[i + 1].h) {
                k0 = DAY_KEYFRAMES[i];
                k1 = DAY_KEYFRAMES[i + 1];
                break;
            }
        }
        const span = Math.max(1e-4, k1.h - k0.h);
        const t = (hour - k0.h) / span;

        _tmpBg.lerpColors(k0.bgColor, k1.bgColor, t);
        _tmpSun.lerpColors(k0.sunColor, k1.sunColor, t);

        scene.background.copy(_tmpBg);
        sunLight.color.copy(_tmpSun);
        sunLight.intensity = k0.sunI + (k1.sunI - k0.sunI) * t;
        ambientLight.intensity = k0.ambI + (k1.ambI - k0.ambI) * t;
        hemiLight.intensity = k0.hemiI + (k1.hemiI - k0.hemiI) * t;

        // Sun arc from east (+X) at 6:00 through overhead south at 12:00 to west (-X) at 18:00
        const dayAngle = ((hour - 6) / 12) * Math.PI;
        const sx = Math.cos(dayAngle) * 45;
        const sy = Math.max(10, Math.sin(dayAngle) * 52);
        const sz = 26;
        sunLight.position.set(sx, sy, sz);
    }

    // -------------------------------------------------------------------------
    // Simulated Clock
    // -------------------------------------------------------------------------
    let targetOccupancy = DEFAULT_OCCUPANCY;
    const seatReservations = new Set();
    const agents = [];

    const SimClock = {
        simMinute: 7 * 60 + 30, // Start at 07:30 AM
        timeScale: 120,         // Pure real-time multiplier (default 120x)
        day: 1,

        tick: function (realDt) {
            this.simMinute += (realDt * this.timeScale) / 60;
            if (this.simMinute >= 24 * 60) {
                this.simMinute -= 24 * 60;
                this.day += 1;
                resetForNewDay();
            }
        },

        format: function () {
            const total = Math.floor(this.simMinute) % (24 * 60);
            const h24 = Math.floor(total / 60);
            const m = total % 60;
            const ampm = h24 >= 12 ? 'PM' : 'AM';
            let h12 = h24 % 12;
            if (h12 === 0) h12 = 12;
            const hStr = h12 < 10 ? ' ' + h12 : String(h12);
            const mStr = m < 10 ? '0' + m : String(m);
            return hStr + ':' + mStr + ' ' + ampm;
        }
    };

    // -------------------------------------------------------------------------
    // Seat Reservation Helpers
    // -------------------------------------------------------------------------
    function reserveSeatFromList(agent, floor, wpList) {
        const candidates = shuffled(wpList);
        for (let i = 0; i < candidates.length; i++) {
            const wp = candidates[i];
            const key = floor + ':' + wp;
            if (!seatReservations.has(key)) {
                seatReservations.add(key);
                agent.reservedSeats.add(key);
                return { wpName: wp, key: key };
            }
        }
        return null;
    }

    function reserveConfSeat(agent, floor) {
        return reserveSeatFromList(agent, floor, [
            'conf_seat0', 'conf_seat1', 'conf_seat2', 'conf_seat3'
        ]);
    }

    function releaseAllAgentSeats(agent) {
        if (!agent.reservedSeats) return;
        for (const key of agent.reservedSeats) {
            seatReservations.delete(key);
        }
        agent.reservedSeats.clear();
    }

    // -------------------------------------------------------------------------
    // Agent Initialization & Schedules
    // -------------------------------------------------------------------------
    function rollWorkerSchedule(agent) {
        agent.arrivalTime = randRange(8 * 60 + 15, 9 * 60 + 30);
        agent.lunchTime = randRange(11 * 60 + 30, 13 * 60 + 30);
        agent.lunchDuration = randRange(25, 60);
        agent.hasLunched = false;

        // ~15% stragglers staying 18:30..19:45, else 16:45..18:30
        if (Math.random() < 0.15) {
            agent.departureTime = randRange(18 * 60 + 30, 19 * 60 + 45);
        } else {
            agent.departureTime = randRange(16 * 60 + 45, 18 * 60 + 30);
        }

        const meetings = [];
        if (Math.random() < 0.60) {
            meetings.push(randRange(9 * 60 + 45, 11 * 60 + 15));
        }
        if (Math.random() < 0.60) {
            meetings.push(randRange(14 * 60 + 0, 16 * 60 + 15));
        }
        meetings.sort(function (a, b) { return a - b; });
        agent.plannedMeetingTimes = meetings;
    }

    function rollVisitorSchedule(agent, arrivalMin) {
        agent.arrivalTime = arrivalMin !== undefined
            ? arrivalMin
            : randRange(8 * 60 + 25, 16 * 60 + 30);
        agent.visitDuration = randRange(12, 36);
        agent.lunchTime = 12 * 60;
        agent.lunchDuration = 30;
        agent.hasLunched = true;
        agent.departureTime = 23 * 60 + 30;
        agent.plannedMeetingTimes = [];
    }

    function buildAgentPool() {
        // Collect all 20 desks distributed round-robin across floors 1..5
        const deskAssignments = [];
        for (let dIdx = 0; dIdx < 4; dIdx++) {
            for (let f = 1; f < WORLD.FLOOR_COUNT; f++) {
                const desk = world.floors[f].desks[dIdx];
                deskAssignments.push({
                    floor: f,
                    deskId: desk.id,
                    deskWpName: desk.wpName,
                    deskDoorWpName: desk.doorWpName
                });
            }
        }

        for (let id = 0; id < MAX_OCCUPANCY; id++) {
            const isWorker = id < MAX_WORKERS;
            const group = window.createPerson();
            group.visible = false;

            const agent = {
                id: id,
                role: isWorker ? 'WORKER' : 'VISITOR',
                name: FIRST_NAMES[id % FIRST_NAMES.length],
                group: group,
                homeFloor: isWorker ? deskAssignments[id].floor : null,
                deskId: isWorker ? deskAssignments[id].deskId : null,
                deskWpName: isWorker ? deskAssignments[id].deskWpName : null,
                deskDoorWpName: isWorker ? deskAssignments[id].deskDoorWpName : null,
                currentFloor: 0,
                state: id < targetOccupancy ? 'AWAY' : 'DISABLED',
                plan: [],
                currentAction: null,
                reservedSeats: new Set(),
                arrivalTime: 0,
                lunchTime: 0,
                lunchDuration: 30,
                hasLunched: false,
                departureTime: 17 * 60,
                visitDuration: 20,
                plannedMeetingTimes: []
            };

            if (isWorker) {
                rollWorkerSchedule(agent);
            } else {
                // Stagger initial morning visitors; topUpVisitors() recycles them all day
                rollVisitorSchedule(agent, randRange(8 * 60 + 30, 15 * 60 + 30));
            }

            agents.push(agent);
        }
    }

    function resetForNewDay() {
        seatReservations.clear();
        elevator.reset();

        for (let i = 0; i < agents.length; i++) {
            const a = agents[i];
            if (a.group.parent) {
                a.group.parent.remove(a.group);
            }
            a.group.visible = false;
            a.group.userData.isWalking = false;
            a.group.userData.isSitting = false;
            window.animatePersonWalking(a.group, 0);

            a.plan = [];
            a.currentAction = null;
            a.reservedSeats.clear();
            a.currentFloor = 0;

            if (a.role === 'WORKER') {
                rollWorkerSchedule(a);
            } else {
                rollVisitorSchedule(a, randRange(8 * 60 + 30, 15 * 60 + 30));
            }

            a.state = a.id < targetOccupancy ? 'AWAY' : 'DISABLED';
        }
    }

    function applyOccupancy() {
        for (let i = 0; i < agents.length; i++) {
            const a = agents[i];
            const shouldEnable = a.id < targetOccupancy;
            if (shouldEnable) {
                if (a.state === 'DISABLED') {
                    if (a.role === 'WORKER') {
                        // If workday hasn't ended yet, let worker arrive soon if past arrivalTime
                        if (SimClock.simMinute < a.departureTime - 30) {
                            if (a.arrivalTime < SimClock.simMinute) {
                                a.arrivalTime = SimClock.simMinute + randRange(0.2, 4.0);
                            }
                            a.state = 'AWAY';
                        } else {
                            a.state = 'GONE';
                        }
                    } else {
                        a.arrivalTime = SimClock.simMinute + randRange(0.2, 5.0);
                        a.state = 'AWAY';
                    }
                }
            } else {
                // Only park immediately if not currently active in the building;
                // active agents finish naturally and transition to DISABLED on EXIT_BUILDING / day-wrap.
                if (a.state === 'AWAY' || a.state === 'GONE') {
                    a.state = 'DISABLED';
                }
            }
        }
    }

    // -------------------------------------------------------------------------
    // Dynamic Visitor Top-Up Scheduler
    // -------------------------------------------------------------------------
    function countPresentOrImminent() {
        const now = SimClock.simMinute;
        let count = 0;
        for (let i = 0; i < agents.length; i++) {
            const a = agents[i];
            if (a.state === 'DISABLED') continue;
            if (a.state !== 'AWAY' && a.state !== 'GONE') {
                count++;
            } else if (
                a.id < targetOccupancy &&
                a.state === 'AWAY' &&
                a.arrivalTime >= now - 1 &&
                a.arrivalTime <= now + 10
            ) {
                count++;
            }
        }
        return count;
    }

    function topUpVisitors() {
        const now = SimClock.simMinute;
        // Run during business hours (08:25 AM .. 05:15 PM)
        if (now < 8 * 60 + 25 || now > 17 * 60 + 15) return;

        let deficit = targetOccupancy - countPresentOrImminent();
        if (deficit <= 0) return;

        for (let i = 0; i < agents.length && deficit > 0; i++) {
            const a = agents[i];
            if (a.id >= targetOccupancy) continue;
            if (a.role !== 'VISITOR') continue;

            const isAvailableGone = a.state === 'GONE';
            const isUnarmedAway =
                a.state === 'AWAY' &&
                (a.arrivalTime > now + 10 || a.arrivalTime < now - 1);

            if (isAvailableGone || isUnarmedAway) {
                a.arrivalTime = now + randRange(0.1, 6.0);
                a.visitDuration = randRange(12, 36);
                a.state = 'AWAY';
                deficit--;
            }
        }
    }

    // -------------------------------------------------------------------------
    // Goal -> Plan Compilers
    // -------------------------------------------------------------------------
    function appendElevatorRide(plan, fromFloor, toFloor) {
        if (fromFloor === toFloor) return;
        const dir = toFloor > fromFloor ? 1 : -1;
        plan.push({ type: 'WALK_TO_WP', floor: fromFloor, wpName: 'elevWait' });
        plan.push({ type: 'ENTER_STATE', state: 'WAITING_ELEVATOR' });
        plan.push({ type: 'WAIT_AT_PANEL', floor: fromFloor, dir: dir });
        plan.push({ type: 'ENTER_ELEVATOR', floor: fromFloor, dir: dir });
        plan.push({ type: 'ENTER_STATE', state: 'IN_CAR' });
        plan.push({ type: 'PRESS_FLOOR', floor: toFloor });
        plan.push({ type: 'WAIT_FOR_FLOOR', floor: toFloor });
        plan.push({ type: 'EXIT_ELEVATOR', toFloor: toFloor });
    }

    function planArriveToDesk(agent) {
        const hf = agent.homeFloor;
        const plan = [
            { type: 'ENTER_STATE', state: 'ARRIVING' },
            { type: 'WALK_TO_WP', floor: 0, wpName: 'entrance' }
        ];
        appendElevatorRide(plan, 0, hf);
        plan.push(
            { type: 'ENTER_STATE', state: 'ON_FLOOR' },
            { type: 'WALK_TO_WP', floor: hf, wpName: agent.deskDoorWpName },
            { type: 'WALK_TO_WP', floor: hf, wpName: agent.deskWpName },
            { type: 'SIT', floor: hf, wpName: agent.deskWpName },
            { type: 'ENTER_STATE', state: 'AT_DESK' },
            { type: 'WAIT_SIM', minutes: randRange(20, 55) },
            { type: 'PICK_NEXT_ACTIVITY' }
        );
        return plan;
    }

    function planGoToLunch(agent) {
        const hf = agent.homeFloor;
        const bistroRes = reserveSeatFromList(agent, 0, world.floors[0].cafeSpots) ||
            reserveSeatFromList(agent, 0, ['front_lounge_0', 'front_lounge_1', 'front_lounge_2', 'front_lounge_3']);
        const lunchWp = bistroRes ? bistroRes.wpName : 'cafe_order';
        const lunchKey = bistroRes ? bistroRes.key : null;

        const plan = [
            { type: 'STAND' },
            { type: 'ENTER_STATE', state: 'ON_FLOOR' },
            { type: 'WALK_TO_WP', floor: hf, wpName: agent.deskDoorWpName }
        ];
        appendElevatorRide(plan, hf, 0);
        plan.push(
            { type: 'ENTER_STATE', state: 'AT_LUNCH' },
            { type: 'WALK_TO_WP', floor: 0, wpName: lunchWp },
            { type: 'SIT', floor: 0, wpName: lunchWp },
            { type: 'WAIT_SIM', minutes: agent.lunchDuration },
            { type: 'STAND' },
            { type: 'RELEASE_SEAT', key: lunchKey },
            { type: 'MARK_LUNCHED' }
        );
        appendElevatorRide(plan, 0, hf);
        plan.push(
            { type: 'ENTER_STATE', state: 'ON_FLOOR' },
            { type: 'WALK_TO_WP', floor: hf, wpName: agent.deskDoorWpName },
            { type: 'WALK_TO_WP', floor: hf, wpName: agent.deskWpName },
            { type: 'SIT', floor: hf, wpName: agent.deskWpName },
            { type: 'ENTER_STATE', state: 'AT_DESK' },
            { type: 'WAIT_SIM', minutes: randRange(20, 50) },
            { type: 'PICK_NEXT_ACTIVITY' }
        );
        return plan;
    }

    function planVisitLounge(agent) {
        const hf = agent.homeFloor;
        const seatRes = reserveSeatFromList(agent, hf, ['lounge_spot0', 'lounge_spot1', 'lounge_spot2']);
        const spotWp = seatRes ? seatRes.wpName : 'water_cooler';
        const seatKey = seatRes ? seatRes.key : null;

        return [
            { type: 'STAND' },
            { type: 'ENTER_STATE', state: 'ON_FLOOR' },
            { type: 'WALK_TO_WP', floor: hf, wpName: agent.deskDoorWpName },
            { type: 'WALK_TO_WP', floor: hf, wpName: 'lounge_door' },
            { type: 'WALK_TO_WP', floor: hf, wpName: spotWp },
            { type: 'SIT', floor: hf, wpName: spotWp },
            { type: 'ENTER_STATE', state: 'AT_BREAK' },
            { type: 'WAIT_SIM', minutes: randRange(5, 12) },
            { type: 'STAND' },
            { type: 'RELEASE_SEAT', key: seatKey },
            { type: 'ENTER_STATE', state: 'ON_FLOOR' },
            { type: 'WALK_TO_WP', floor: hf, wpName: 'lounge_door' },
            { type: 'WALK_TO_WP', floor: hf, wpName: agent.deskDoorWpName },
            { type: 'WALK_TO_WP', floor: hf, wpName: agent.deskWpName },
            { type: 'SIT', floor: hf, wpName: agent.deskWpName },
            { type: 'ENTER_STATE', state: 'AT_DESK' },
            { type: 'WAIT_SIM', minutes: randRange(20, 50) },
            { type: 'PICK_NEXT_ACTIVITY' }
        ];
    }

    function planAttendMeeting(agent) {
        const hf = agent.homeFloor;
        let meetFloor = Math.random() < 0.65 ? hf : randInt(1, WORLD.FLOOR_COUNT - 1);
        let res = reserveConfSeat(agent, meetFloor);

        if (!res) {
            // Try another floor before falling back to lounge break
            const otherFloors = shuffled([1, 2, 3, 4, 5]);
            for (let i = 0; i < otherFloors.length; i++) {
                res = reserveConfSeat(agent, otherFloors[i]);
                if (res) {
                    meetFloor = otherFloors[i];
                    break;
                }
            }
        }
        if (!res) {
            return planVisitLounge(agent);
        }

        const plan = [
            { type: 'STAND' },
            { type: 'ENTER_STATE', state: 'ON_FLOOR' },
            { type: 'WALK_TO_WP', floor: hf, wpName: agent.deskDoorWpName }
        ];
        appendElevatorRide(plan, hf, meetFloor);
        plan.push(
            { type: 'ENTER_STATE', state: 'ON_FLOOR' },
            { type: 'WALK_TO_WP', floor: meetFloor, wpName: 'conf_door' },
            { type: 'WALK_TO_WP', floor: meetFloor, wpName: res.wpName },
            { type: 'SIT', floor: meetFloor, wpName: res.wpName },
            { type: 'ENTER_STATE', state: 'IN_MEETING' },
            { type: 'WAIT_SIM', minutes: randRange(22, 45) },
            { type: 'STAND' },
            { type: 'RELEASE_SEAT', key: res.key },
            { type: 'ENTER_STATE', state: 'ON_FLOOR' },
            { type: 'WALK_TO_WP', floor: meetFloor, wpName: 'conf_door' }
        );
        appendElevatorRide(plan, meetFloor, hf);
        plan.push(
            { type: 'ENTER_STATE', state: 'ON_FLOOR' },
            { type: 'WALK_TO_WP', floor: hf, wpName: agent.deskDoorWpName },
            { type: 'WALK_TO_WP', floor: hf, wpName: agent.deskWpName },
            { type: 'SIT', floor: hf, wpName: agent.deskWpName },
            { type: 'ENTER_STATE', state: 'AT_DESK' },
            { type: 'WAIT_SIM', minutes: randRange(18, 50) },
            { type: 'PICK_NEXT_ACTIVITY' }
        );
        return plan;
    }

    function planVisitCoworker(agent) {
        const hf = agent.homeFloor;
        const candidates = [];
        for (let i = 0; i < MAX_WORKERS; i++) {
            const other = agents[i];
            if (other !== agent && other.state === 'AT_DESK') {
                candidates.push(other);
            }
        }
        if (candidates.length === 0) {
            return [
                { type: 'WAIT_SIM', minutes: randRange(18, 40) },
                { type: 'PICK_NEXT_ACTIVITY' }
            ];
        }

        const cw = candidates[Math.floor(Math.random() * candidates.length)];
        const cwf = cw.homeFloor;

        const plan = [
            { type: 'STAND' },
            { type: 'ENTER_STATE', state: 'ON_FLOOR' },
            { type: 'WALK_TO_WP', floor: hf, wpName: agent.deskDoorWpName }
        ];
        appendElevatorRide(plan, hf, cwf);
        plan.push(
            { type: 'ENTER_STATE', state: 'ON_FLOOR' },
            { type: 'WALK_TO_WP', floor: cwf, wpName: cw.deskDoorWpName },
            { type: 'SIT', floor: cwf, wpName: cw.deskDoorWpName },
            { type: 'ENTER_STATE', state: 'VISITING' },
            { type: 'WAIT_SIM', minutes: randRange(6, 18) },
            { type: 'STAND' },
            { type: 'ENTER_STATE', state: 'ON_FLOOR' }
        );
        appendElevatorRide(plan, cwf, hf);
        plan.push(
            { type: 'ENTER_STATE', state: 'ON_FLOOR' },
            { type: 'WALK_TO_WP', floor: hf, wpName: agent.deskDoorWpName },
            { type: 'WALK_TO_WP', floor: hf, wpName: agent.deskWpName },
            { type: 'SIT', floor: hf, wpName: agent.deskWpName },
            { type: 'ENTER_STATE', state: 'AT_DESK' },
            { type: 'WAIT_SIM', minutes: randRange(20, 50) },
            { type: 'PICK_NEXT_ACTIVITY' }
        );
        return plan;
    }

    function planLeaveBuilding(agent) {
        releaseAllAgentSeats(agent);
        const cf = agent.currentFloor;
        const wasAtOwnDesk = (cf === agent.homeFloor && agent.state === 'AT_DESK');

        const plan = [
            { type: 'STAND' },
            { type: 'ENTER_STATE', state: 'LEAVING' }
        ];
        if (wasAtOwnDesk && agent.deskDoorWpName) {
            plan.push({ type: 'WALK_TO_WP', floor: cf, wpName: agent.deskDoorWpName });
        }
        if (cf > 0) {
            appendElevatorRide(plan, cf, 0);
            plan.push({ type: 'ENTER_STATE', state: 'LEAVING' });
        }
        plan.push(
            { type: 'WALK_TO_WP', floor: 0, wpName: 'entrance' },
            { type: 'WALK_TO_WP', floor: 0, wpName: 'outside' },
            { type: 'EXIT_BUILDING' }
        );
        return plan;
    }

    function appendLobbyLoiterSubPlan(plan) {
        const loiters = [
            'lobby_stand_center', 'lobby_stand_NE', 'lobby_stand_NW',
            'lobby_stand_midE', 'lobby_stand_midW', 'lobby_stand_entry'
        ];
        const wp1 = loiters[Math.floor(Math.random() * loiters.length)];
        plan.push(
            { type: 'WALK_TO_WP', floor: 0, wpName: wp1 },
            { type: 'SIT', floor: 0, wpName: wp1 },
            { type: 'ENTER_STATE', state: 'VISITING' },
            { type: 'WAIT_SIM', minutes: randRange(8, 20) },
            { type: 'STAND' }
        );
    }

    function planVisitorVisit(agent) {
        const plan = [
            { type: 'ENTER_STATE', state: 'ARRIVING' },
            { type: 'WALK_TO_WP', floor: 0, wpName: 'entrance' }
        ];

        const r = Math.random();

        if (r < 0.10) {
            // ~10% Bistro table (cafe)
            const res = reserveSeatFromList(agent, 0, world.floors[0].cafeSpots);
            if (res) {
                plan.push(
                    { type: 'WALK_TO_WP', floor: 0, wpName: res.wpName },
                    { type: 'SIT', floor: 0, wpName: res.wpName },
                    { type: 'ENTER_STATE', state: 'VISITING' },
                    { type: 'WAIT_SIM', minutes: randRange(12, 28) },
                    { type: 'STAND' },
                    { type: 'RELEASE_SEAT', key: res.key }
                );
            } else {
                appendLobbyLoiterSubPlan(plan);
            }
        } else if (r < 0.16) {
            // ~6% Cafe counter
            plan.push(
                { type: 'WALK_TO_WP', floor: 0, wpName: 'cafe_order' },
                { type: 'SIT', floor: 0, wpName: 'cafe_order' },
                { type: 'ENTER_STATE', state: 'VISITING' },
                { type: 'WAIT_SIM', minutes: randRange(4, 11) },
                { type: 'STAND' }
            );
        } else if (r < 0.30) {
            // ~14% Front lounge
            const res = reserveSeatFromList(agent, 0, [
                'front_lounge_0', 'front_lounge_1', 'front_lounge_2', 'front_lounge_3'
            ]);
            if (res) {
                plan.push(
                    { type: 'WALK_TO_WP', floor: 0, wpName: res.wpName },
                    { type: 'SIT', floor: 0, wpName: res.wpName },
                    { type: 'ENTER_STATE', state: 'VISITING' },
                    { type: 'WAIT_SIM', minutes: randRange(12, 28) },
                    { type: 'STAND' },
                    { type: 'RELEASE_SEAT', key: res.key }
                );
            } else {
                appendLobbyLoiterSubPlan(plan);
            }
        } else if (r < 0.42) {
            // ~12% Back lounge / conversation pit
            const res = reserveSeatFromList(agent, 0, [
                'back_lounge_N', 'back_lounge_S', 'pit_N', 'pit_S', 'pit_E', 'pit_W'
            ]);
            if (res) {
                plan.push(
                    { type: 'WALK_TO_WP', floor: 0, wpName: res.wpName },
                    { type: 'SIT', floor: 0, wpName: res.wpName },
                    { type: 'ENTER_STATE', state: 'VISITING' },
                    { type: 'WAIT_SIM', minutes: randRange(14, 30) },
                    { type: 'STAND' },
                    { type: 'RELEASE_SEAT', key: res.key }
                );
            } else {
                appendLobbyLoiterSubPlan(plan);
            }
        } else if (r < 0.52) {
            // ~10% Reception / kiosk / lobby water cooler
            const standSpots = ['reception', 'kiosk', 'lobby_wc_front', 'lobby_wc_back'];
            const wp = standSpots[Math.floor(Math.random() * standSpots.length)];
            plan.push(
                { type: 'WALK_TO_WP', floor: 0, wpName: wp },
                { type: 'SIT', floor: 0, wpName: wp },
                { type: 'ENTER_STATE', state: 'VISITING' },
                { type: 'WAIT_SIM', minutes: randRange(4, 12) },
                { type: 'STAND' }
            );
        } else if (r < 0.62) {
            // ~10% Lobby loiter
            appendLobbyLoiterSubPlan(plan);
        } else if (r < 0.77) {
            // ~15% Ride up to an office-floor lounge / hallway / cooler
            const f = randInt(1, WORLD.FLOOR_COUNT - 1);
            const res = reserveSeatFromList(agent, f, ['lounge_spot0', 'lounge_spot1', 'lounge_spot2']);
            const standFallbacks = ['water_cooler', 'hall_stand_N', 'hall_stand_S'];
            const targetWp = res ? res.wpName : standFallbacks[Math.floor(Math.random() * standFallbacks.length)];
            const seatKey = res ? res.key : null;

            appendElevatorRide(plan, 0, f);
            plan.push({ type: 'ENTER_STATE', state: 'VISITING' });
            if (targetWp.indexOf('lounge_') === 0 || targetWp === 'water_cooler') {
                plan.push({ type: 'WALK_TO_WP', floor: f, wpName: 'lounge_door' });
            }
            plan.push(
                { type: 'WALK_TO_WP', floor: f, wpName: targetWp },
                { type: 'SIT', floor: f, wpName: targetWp },
                { type: 'WAIT_SIM', minutes: randRange(10, 24) },
                { type: 'STAND' },
                { type: 'RELEASE_SEAT', key: seatKey }
            );
            if (targetWp.indexOf('lounge_') === 0 || targetWp === 'water_cooler') {
                plan.push({ type: 'WALK_TO_WP', floor: f, wpName: 'lounge_door' });
            }
            appendElevatorRide(plan, f, 0);
        } else {
            // ~23% External attendee / client sitting in on a conference room meeting
            const f = randInt(1, WORLD.FLOOR_COUNT - 1);
            const res = reserveConfSeat(agent, f);
            if (res) {
                appendElevatorRide(plan, 0, f);
                plan.push(
                    { type: 'ENTER_STATE', state: 'ON_FLOOR' },
                    { type: 'WALK_TO_WP', floor: f, wpName: 'conf_door' },
                    { type: 'WALK_TO_WP', floor: f, wpName: res.wpName },
                    { type: 'SIT', floor: f, wpName: res.wpName },
                    { type: 'ENTER_STATE', state: 'IN_MEETING' },
                    { type: 'WAIT_SIM', minutes: randRange(20, 40) },
                    { type: 'STAND' },
                    { type: 'RELEASE_SEAT', key: res.key },
                    { type: 'ENTER_STATE', state: 'ON_FLOOR' },
                    { type: 'WALK_TO_WP', floor: f, wpName: 'conf_door' }
                );
                appendElevatorRide(plan, f, 0);
            } else {
                appendLobbyLoiterSubPlan(plan);
            }
        }

        plan.push(
            { type: 'ENTER_STATE', state: 'LEAVING' },
            { type: 'WALK_TO_WP', floor: 0, wpName: 'entrance' },
            { type: 'WALK_TO_WP', floor: 0, wpName: 'outside' },
            { type: 'EXIT_BUILDING' }
        );

        return plan;
    }

    // -------------------------------------------------------------------------
    // Worker Desk-Level Decision Rules
    // -------------------------------------------------------------------------
    function chooseNextActivity(agent) {
        const now = SimClock.simMinute;

        // 1. Past departure time -> head home
        if (now >= agent.departureTime) {
            return planLeaveBuilding(agent);
        }

        // 2. Any planned meeting whose time has arrived
        if (agent.plannedMeetingTimes.length > 0 && now >= agent.plannedMeetingTimes[0]) {
            agent.plannedMeetingTimes.shift();
            return planAttendMeeting(agent);
        }

        // 3. Past lunch window and hasn't lunched yet
        if (!agent.hasLunched && now >= agent.lunchTime) {
            return planGoToLunch(agent);
        }

        // 4. Weighted random activity die
        const adHocMeetWeight = MEETING_PROB * 0.4; // ~0.144
        const loungeWeight = 0.12;
        const coworkerWeight = 0.15;
        const roll = Math.random();

        if (roll < adHocMeetWeight) {
            return planAttendMeeting(agent);
        } else if (roll < adHocMeetWeight + loungeWeight) {
            return planVisitLounge(agent);
        } else if (roll < adHocMeetWeight + loungeWeight + coworkerWeight) {
            return planVisitCoworker(agent);
        } else {
            return [
                { type: 'WAIT_SIM', minutes: randRange(18, 65) },
                { type: 'PICK_NEXT_ACTIVITY' }
            ];
        }
    }

    // -------------------------------------------------------------------------
    // Action Execution Engine
    // -------------------------------------------------------------------------
    function findNearestNodeName(nodes, pos) {
        let bestName = null;
        let bestD2 = Infinity;
        const names = Object.keys(nodes);
        for (let i = 0; i < names.length; i++) {
            const p = nodes[names[i]].pos;
            const dx = p.x - pos.x;
            const dz = p.z - pos.z;
            const d2 = dx * dx + dz * dz;
            if (d2 < bestD2) {
                bestD2 = d2;
                bestName = names[i];
            }
        }
        return bestName;
    }

    function startAction(agent, action) {
        switch (action.type) {
            case 'WALK_TO_WP': {
                const floorObj = world.floors[action.floor];
                const fromName = findNearestNodeName(floorObj.nodes, agent.group.position);
                const path = world.bfsPath(floorObj.nodes, fromName, action.wpName);
                action.path = path;
                action.idx = 0;
                if (path.length > 1) {
                    const dx = path[0].x - agent.group.position.x;
                    const dz = path[0].z - agent.group.position.z;
                    if (dx * dx + dz * dz < 0.09) {
                        action.idx = 1;
                    }
                }
                action._prevWp = agent.group.position.clone();
                action._stallT = 0;
                agent.currentFloor = action.floor;
                break;
            }

            case 'WAIT_AT_PANEL': {
                agent.group.userData.isWalking = false;
                agent.group.rotation.y = Math.PI; // face shaft doors (-Z)
                if (action.dir > 0) elevator.callUp(action.floor);
                else elevator.callDown(action.floor);
                break;
            }

            case 'ENTER_ELEVATOR': {
                action.phase = 'reserve';
                action._prevWalk = agent.group.position.clone();
                action._stallT = 0;
                break;
            }

            case 'EXIT_ELEVATOR': {
                elevator.registerDisembark(agent.group);
                const worldPos = new THREE.Vector3();
                agent.group.getWorldPosition(worldPos);
                if (agent.group.parent) {
                    agent.group.parent.remove(agent.group);
                }
                scene.add(agent.group);
                const targetY = action.toFloor * WORLD.FLOOR_HEIGHT;
                agent.group.position.set(worldPos.x, targetY, worldPos.z);
                agent.currentFloor = action.toFloor;

                const waitPos = world.floors[action.toFloor].nodes['elevWait'].pos;
                action.exitTarget = new THREE.Vector3(
                    waitPos.x + worldPos.x * 0.55,
                    targetY,
                    waitPos.z
                );
                action._prevWalk = agent.group.position.clone();
                action._stallT = 0;
                break;
            }

            case 'WAIT_SIM': {
                // Resolved here in startAction (not at plan compile time!)
                action.untilMin = SimClock.simMinute + action.minutes;
                agent.group.userData.isWalking = false;
                break;
            }

            default:
                break;
        }
    }

    // Returns true when action completes
    function executeAction(agent, action, dt) {
        switch (action.type) {
            case 'ENTER_STATE':
                agent.state = action.state;
                return true;

            case 'MARK_LUNCHED':
                agent.hasLunched = true;
                return true;

            case 'PICK_NEXT_ACTIVITY': {
                const nextPlan = chooseNextActivity(agent);
                for (let i = 0; i < nextPlan.length; i++) {
                    agent.plan.push(nextPlan[i]);
                }
                return true;
            }

            case 'RELEASE_SEAT':
                if (action.key) {
                    seatReservations.delete(action.key);
                    agent.reservedSeats.delete(action.key);
                }
                return true;

            case 'SIT': {
                const floorObj = world.floors[action.floor];
                const node = floorObj.nodes[action.wpName];
                const target = floorObj.sitTargets[action.wpName] || { sit: false, facing: 0 };
                const baseFloorY = action.floor * WORLD.FLOOR_HEIGHT;
                agent.group.userData.isWalking = false;
                agent.currentFloor = action.floor;

                if (target.sit) {
                    agent.group.position.set(node.pos.x, baseFloorY - SIT_DROP_Y, node.pos.z);
                    agent.group.rotation.y = target.facing;
                    agent.group.userData.isSitting = true;
                } else {
                    // Standing waypoint: jitter on a small ring (0.35..0.75) for personal space
                    const ang = Math.random() * Math.PI * 2;
                    const rad = 0.35 + Math.random() * 0.40;
                    const jx = Math.max(-10.3, Math.min(10.3, node.pos.x + Math.cos(ang) * rad));
                    const jz = Math.max(-8.3, Math.min(8.4, node.pos.z + Math.sin(ang) * rad));
                    agent.group.position.set(jx, baseFloorY, jz);
                    agent.group.rotation.y = target.facing + (Math.random() - 0.5) * 0.45;
                    agent.group.userData.isSitting = false;
                }
                return true;
            }

            case 'STAND': {
                agent.group.userData.isSitting = false;
                if (agent.group.parent === elevator.group) {
                    agent.group.position.y = 0;
                } else {
                    agent.group.position.y = agent.currentFloor * WORLD.FLOOR_HEIGHT;
                }
                // Seat reservations are intentionally NOT released here; RELEASE_SEAT handles it.
                return true;
            }

            case 'PRESS_FLOOR':
                elevator.pressDestination(action.floor);
                return true;

            case 'WAIT_FOR_FLOOR':
                agent.group.userData.isWalking = false;
                agent.group.rotation.y = 0;
                return (
                    elevator.state === 'DOOR_OPEN' &&
                    elevator.currentFloor === action.floor
                );

            case 'WAIT_AT_PANEL': {
                agent.group.userData.isWalking = false;
                if (
                    elevator.isAcceptingAt(action.floor, action.dir) &&
                    elevator.currentCapacityFree() > 0
                ) {
                    return true;
                }
                // Re-press every frame if call got cleared before we could board
                if (action.dir > 0) elevator.callUp(action.floor);
                else elevator.callDown(action.floor);
                return false;
            }

            case 'ENTER_ELEVATOR': {
                const floorY = action.floor * WORLD.FLOOR_HEIGHT;

                if (action.phase === 'reserve') {
                    if (!elevator.isAcceptingAt(action.floor, action.dir)) {
                        if (action.dir > 0) elevator.callUp(action.floor);
                        else elevator.callDown(action.floor);
                        agent.plan.unshift(
                            { type: 'WAIT_AT_PANEL', floor: action.floor, dir: action.dir },
                            { type: 'ENTER_ELEVATOR', floor: action.floor, dir: action.dir }
                        );
                        return true;
                    }
                    const spot = elevator.reserveBoardingSpot(agent.group);
                    if (!spot) {
                        if (action.dir > 0) elevator.callUp(action.floor);
                        else elevator.callDown(action.floor);
                        agent.plan.unshift(
                            { type: 'WAIT_AT_PANEL', floor: action.floor, dir: action.dir },
                            { type: 'ENTER_ELEVATOR', floor: action.floor, dir: action.dir }
                        );
                        return true;
                    }
                    action.localSpot = spot;
                    // Aim at spotWorld.x at door threshold so all 4 boarders use separate lanes
                    action.doorTarget = new THREE.Vector3(spot.x, floorY, 1.42);
                    action._prevWalk.copy(agent.group.position);
                    action._stallT = 0;
                    action.phase = 'walkToDoor';
                }

                if (action.phase === 'walkToDoor') {
                    if (
                        elevator.currentFloor !== action.floor ||
                        (elevator.state !== 'DOOR_OPEN' && elevator.state !== 'DOOR_OPENING')
                    ) {
                        elevator.cancelBoarding(agent.group);
                        if (action.dir > 0) elevator.callUp(action.floor);
                        else elevator.callDown(action.floor);
                        agent.plan.unshift(
                            { type: 'WAIT_AT_PANEL', floor: action.floor, dir: action.dir },
                            { type: 'ENTER_ELEVATOR', floor: action.floor, dir: action.dir }
                        );
                        return true;
                    }

                    const dx = action.doorTarget.x - agent.group.position.x;
                    const dz = action.doorTarget.z - agent.group.position.z;
                    const dist = Math.hypot(dx, dz);

                    if (dist <= 0.12) {
                        agent.group.position.copy(action.doorTarget);
                    } else {
                        agent.group.userData.isWalking = true;
                        agent.group.rotation.y = Math.atan2(dx, dz);
                        const step = Math.min(dist, BOARD_WALK_SPEED * dt);
                        agent.group.position.x += (dx / dist) * step;
                        agent.group.position.z += (dz / dist) * step;
                        agent.group.position.y = floorY;

                        const moved = agent.group.position.distanceTo(action._prevWalk);
                        action._prevWalk.copy(agent.group.position);
                        if (moved < 0.005) {
                            action._stallT += dt;
                        } else {
                            action._stallT = 0;
                        }
                        if (action._stallT > 1.5) {
                            agent.group.position.copy(action.doorTarget);
                        } else {
                            return false;
                        }
                    }

                    // Reparent scene -> elevator car preserving world XZ
                    const wx = agent.group.position.x;
                    const wz = agent.group.position.z;
                    if (agent.group.parent) agent.group.parent.remove(agent.group);
                    elevator.group.add(agent.group);
                    agent.group.position.set(
                        wx - elevator.group.position.x,
                        0,
                        wz - elevator.group.position.z
                    );
                    action._prevWalk.copy(agent.group.position);
                    action._stallT = 0;
                    action.phase = 'walkToSpot';
                }

                if (action.phase === 'walkToSpot') {
                    const dx = action.localSpot.x - agent.group.position.x;
                    const dz = action.localSpot.z - agent.group.position.z;
                    const dist = Math.hypot(dx, dz);

                    if (dist <= 0.08) {
                        agent.group.position.copy(action.localSpot);
                        agent.group.rotation.y = 0; // turn to face +Z doors
                        agent.group.userData.isWalking = false;
                        elevator.completeBoard(agent.group);
                        return true;
                    }

                    agent.group.userData.isWalking = true;
                    agent.group.rotation.y = Math.atan2(dx, dz);
                    const step = Math.min(dist, BOARD_WALK_SPEED * dt);
                    agent.group.position.x += (dx / dist) * step;
                    agent.group.position.z += (dz / dist) * step;
                    agent.group.position.y = 0;

                    const moved = agent.group.position.distanceTo(action._prevWalk);
                    action._prevWalk.copy(agent.group.position);
                    if (moved < 0.005) {
                        action._stallT += dt;
                        if (action._stallT > 1.2) {
                            agent.group.position.copy(action.localSpot);
                            agent.group.rotation.y = 0;
                            agent.group.userData.isWalking = false;
                            elevator.completeBoard(agent.group);
                            return true;
                        }
                    } else {
                        action._stallT = 0;
                    }
                    return false;
                }

                return false;
            }

            case 'EXIT_ELEVATOR': {
                const floorY = action.toFloor * WORLD.FLOOR_HEIGHT;
                const dx = action.exitTarget.x - agent.group.position.x;
                const dz = action.exitTarget.z - agent.group.position.z;
                const dist = Math.hypot(dx, dz);

                if (dist <= 0.14) {
                    agent.group.position.copy(action.exitTarget);
                    agent.group.userData.isWalking = false;
                    elevator.completeDisembark(agent.group);
                    return true;
                }

                agent.group.userData.isWalking = true;
                agent.group.rotation.y = Math.atan2(dx, dz);
                const step = Math.min(dist, BOARD_WALK_SPEED * dt);
                agent.group.position.x += (dx / dist) * step;
                agent.group.position.z += (dz / dist) * step;
                agent.group.position.y = floorY;

                const moved = agent.group.position.distanceTo(action._prevWalk);
                action._prevWalk.copy(agent.group.position);
                if (moved < 0.005) {
                    action._stallT += dt;
                    if (action._stallT > 1.5) {
                        agent.group.position.copy(action.exitTarget);
                        agent.group.userData.isWalking = false;
                        elevator.completeDisembark(agent.group);
                        return true;
                    }
                } else {
                    action._stallT = 0;
                }
                return false;
            }

            case 'WALK_TO_WP': {
                if (!action.path || action.idx >= action.path.length) {
                    agent.group.userData.isWalking = false;
                    return true;
                }

                const floorY = action.floor * WORLD.FLOOR_HEIGHT;
                const wp = action.path[action.idx];
                const isLast = action.idx === action.path.length - 1;
                const reachR = isLast ? 0.12 : 0.20;

                const dx = wp.x - agent.group.position.x;
                const dz = wp.z - agent.group.position.z;
                const dist = Math.hypot(dx, dz);

                if (dist <= reachR) {
                    action.idx += 1;
                    action._stallT = 0;
                    action._prevWp.copy(agent.group.position);
                    if (action.idx >= action.path.length) {
                        agent.group.userData.isWalking = false;
                        return true;
                    }
                    return false;
                }

                agent.group.userData.isWalking = true;
                agent.group.rotation.y = Math.atan2(dx, dz);
                const step = Math.min(dist, WALK_SPEED * dt);
                agent.group.position.x += (dx / dist) * step;
                agent.group.position.z += (dz / dist) * step;
                agent.group.position.y = floorY;

                // Stall recovery if blocked for >1.2 motion-seconds
                const moved = agent.group.position.distanceTo(action._prevWp);
                action._prevWp.copy(agent.group.position);
                if (moved < 0.005) {
                    action._stallT += dt;
                    if (action._stallT > 1.2) {
                        action._stallT = 0;
                        if (!isLast) {
                            action.idx += 1;
                        } else {
                            agent.group.position.set(wp.x, floorY, wp.z);
                            agent.group.userData.isWalking = false;
                            return true;
                        }
                    }
                } else {
                    action._stallT = 0;
                }
                return false;
            }

            case 'WAIT_SIM':
                agent.group.userData.isWalking = false;
                return SimClock.simMinute >= action.untilMin;

            case 'EXIT_BUILDING':
                releaseAllAgentSeats(agent);
                if (agent.group.parent) {
                    agent.group.parent.remove(agent.group);
                }
                agent.group.visible = false;
                agent.group.userData.isWalking = false;
                agent.group.userData.isSitting = false;
                agent.state = agent.id < targetOccupancy ? 'GONE' : 'DISABLED';
                return true;

            default:
                return true;
        }
    }

    function spawnAgentOnSidewalk(agent) {
        const jx = (Math.random() * 2 - 1) * 1.1;
        const jz = 12.0 + (Math.random() * 2 - 1) * 0.75;
        agent.group.position.set(jx, 0, jz);
        agent.group.rotation.y = Math.PI;
        agent.group.visible = true;
        agent.group.userData.isWalking = false;
        agent.group.userData.isSitting = false;
        agent.currentFloor = 0;
        scene.add(agent.group);

        if (agent.role === 'WORKER') {
            agent.state = 'ARRIVING';
            agent.plan = planArriveToDesk(agent);
            agent.currentAction = null;
        } else {
            agent.state = 'ARRIVING';
            agent.plan = planVisitorVisit(agent);
            agent.currentAction = null;
        }
    }

    function tickAgent(agent, dt) {
        if (agent.state === 'DISABLED' || agent.state === 'GONE') return;

        if (agent.state === 'AWAY') {
            if (SimClock.simMinute >= agent.arrivalTime) {
                spawnAgentOnSidewalk(agent);
            } else {
                return;
            }
        }

        // End-of-day departure override for WORKERS only (never override mid-elevator)
        if (
            agent.role === 'WORKER' &&
            SimClock.simMinute >= agent.departureTime &&
            agent.state !== 'LEAVING' &&
            agent.state !== 'WAITING_ELEVATOR' &&
            agent.state !== 'IN_CAR' &&
            agent.group.parent === scene &&
            (!agent.currentAction ||
                (agent.currentAction.type !== 'ENTER_ELEVATOR' &&
                 agent.currentAction.type !== 'EXIT_ELEVATOR'))
        ) {
            agent.plan = planLeaveBuilding(agent);
            agent.currentAction = null;
        }

        // Loop up to 16 action transitions in a single frame so zero-duration actions
        // (SIT, STAND, PRESS_FLOOR, EXIT_ELEVATOR registration, etc.) hand off immediately.
        let guard = 0;
        while (guard < 16) {
            guard++;
            if (!agent.currentAction) {
                if (agent.plan.length === 0) break;
                agent.currentAction = agent.plan.shift();
                startAction(agent, agent.currentAction);
            }

            const done = executeAction(agent, agent.currentAction, dt);
            if (done) {
                agent.currentAction = null;
                if (agent.state === 'GONE' || agent.state === 'DISABLED') break;
                // Continue loop to start next action immediately with dt = 0
                dt = 0;
            } else {
                break;
            }
        }
    }

    // -------------------------------------------------------------------------
    // Soft Collision Separation (O(n^2) on scene-parented non-sitting agents)
    // -------------------------------------------------------------------------
    function applyCollisions() {
        const eligible = [];
        for (let i = 0; i < agents.length; i++) {
            const a = agents[i];
            if (a.state === 'DISABLED' || a.state === 'AWAY' || a.state === 'GONE') continue;
            // Skip agents inside elevator car
            if (a.group.parent !== scene) continue;
            // Skip sitting agents
            if (a.group.userData.isSitting) continue;
            // Exempt boarders & disembarkers so crowds never trap the elevator doors
            const actType = a.currentAction ? a.currentAction.type : null;
            if (actType === 'ENTER_ELEVATOR' || actType === 'EXIT_ELEVATOR') continue;

            eligible.push(a);
        }

        const minDist = 0.72;
        const pushScalar = 0.18;

        for (let i = 0; i < eligible.length; i++) {
            const pi = eligible[i].group.position;
            for (let j = i + 1; j < eligible.length; j++) {
                const pj = eligible[j].group.position;
                if (Math.abs(pi.y - pj.y) > 1.0) continue;

                const dx = pi.x - pj.x;
                const dz = pi.z - pj.z;
                const d = Math.hypot(dx, dz);

                if (d < minDist) {
                    let nx, nz;
                    if (d < 1e-3) {
                        const ang = Math.random() * Math.PI * 2;
                        nx = Math.cos(ang);
                        nz = Math.sin(ang);
                    } else {
                        nx = dx / d;
                        nz = dz / d;
                    }
                    const push = (minDist - d) * pushScalar;
                    pi.x += nx * push;
                    pi.z += nz * push;
                    pj.x -= nx * push;
                    pj.z -= nz * push;

                    clampAgentBounds(eligible[i]);
                    clampAgentBounds(eligible[j]);
                }
            }
        }
    }

    function clampAgentBounds(agent) {
        const p = agent.group.position;
        p.x = Math.max(-10.55, Math.min(10.55, p.x));
        if (agent.currentFloor === 0 && Math.abs(p.x) < 1.35 && p.z > 8.4) {
            p.z = Math.min(13.8, p.z);
        } else {
            p.z = Math.max(-8.55, Math.min(8.55, p.z));
        }

        // Prevent nudging into the 3x3 central elevator shaft
        if (Math.abs(p.x) < 1.65 && Math.abs(p.z) < 1.65) {
            if (Math.abs(p.x) > Math.abs(p.z)) {
                p.x = p.x >= 0 ? 1.65 : -1.65;
            } else {
                p.z = p.z >= 0 ? 1.65 : -1.65;
            }
        }
    }

    // -------------------------------------------------------------------------
    // Top-Left HUD Panel
    // -------------------------------------------------------------------------
    function createHUD() {
        const panel = document.createElement('div');
        panel.style.cssText = [
            'position:fixed',
            'top:12px',
            'left:12px',
            'width:296px',
            'padding:12px 14px',
            'background:rgba(16,20,32,0.84)',
            'backdrop-filter:blur(6px)',
            'border:1px solid rgba(148,163,184,0.25)',
            'border-radius:10px',
            'color:#e2e8f0',
            'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
            'font-size:12px',
            'line-height:1.45',
            'user-select:none',
            'z-index:10'
        ].join(';');

        // Prevent pointer events on HUD from spinning OrbitControls
        ['pointerdown', 'mousedown', 'touchstart', 'wheel'].forEach(function (evt) {
            panel.addEventListener(evt, function (e) { e.stopPropagation(); });
        });

        // Clock Header
        const headerRow = document.createElement('div');
        headerRow.style.cssText = 'display:flex;align-items:baseline;justify-content:space-between;margin-bottom:8px;';

        const clockEl = document.createElement('div');
        clockEl.style.cssText = 'font-size:26px;font-weight:700;font-variant-numeric:tabular-nums;color:#f8fafc;letter-spacing:0.5px;';
        clockEl.textContent = SimClock.format();

        const dayEl = document.createElement('div');
        dayEl.style.cssText = 'font-size:12px;font-weight:600;color:#94a3b8;';
        dayEl.textContent = 'Day 1';

        headerRow.appendChild(clockEl);
        headerRow.appendChild(dayEl);
        panel.appendChild(headerRow);

        // Log-spaced Speed Slider (1x .. 600x, default 120x)
        const speedBlock = document.createElement('div');
        speedBlock.style.marginBottom = '8px';

        const speedLabel = document.createElement('div');
        speedLabel.style.cssText = 'display:flex;justify-content:space-between;margin-bottom:2px;color:#cbd5e1;';
        const speedTitle = document.createElement('span');
        speedTitle.textContent = 'Sim Speed';
        const speedVal = document.createElement('span');
        speedVal.style.fontWeight = '600';
        speedVal.style.color = '#fbbf24';
        speedVal.textContent = '120\u00d7 realtime';
        speedLabel.appendChild(speedTitle);
        speedLabel.appendChild(speedVal);

        const speedSlider = document.createElement('input');
        speedSlider.type = 'range';
        speedSlider.min = '0';
        speedSlider.max = '1000';
        // Solve 600^(v/1000) = 120 -> v = 1000 * ln(120)/ln(600) ≈ 748
        speedSlider.value = String(Math.round(1000 * (Math.log(120) / Math.log(600))));
        speedSlider.style.cssText = 'width:100%;cursor:pointer;accent-color:#fbbf24;';

        speedSlider.addEventListener('input', function () {
            const norm = Number(speedSlider.value) / 1000;
            const raw = Math.pow(600, norm);
            const scale = raw < 10 ? Math.max(1, Math.round(raw)) : Math.round(raw);
            SimClock.timeScale = scale;
            speedVal.textContent = scale + '\u00d7 realtime';
        });

        speedBlock.appendChild(speedLabel);
        speedBlock.appendChild(speedSlider);
        panel.appendChild(speedBlock);

        // Occupancy Slider (1 .. 100, default 45)
        const occBlock = document.createElement('div');
        occBlock.style.marginBottom = '10px';

        const occLabel = document.createElement('div');
        occLabel.style.cssText = 'margin-bottom:2px;color:#cbd5e1;font-weight:500;';
        occLabel.textContent = 'Occupancy: ' + targetOccupancy + ' / ' + MAX_OCCUPANCY + ' people';

        const occSlider = document.createElement('input');
        occSlider.type = 'range';
        occSlider.min = '1';
        occSlider.max = String(MAX_OCCUPANCY);
        occSlider.value = String(targetOccupancy);
        occSlider.style.cssText = 'width:100%;cursor:pointer;accent-color:#38bdf8;';

        occSlider.addEventListener('input', function () {
            targetOccupancy = Number(occSlider.value);
            occLabel.textContent = 'Occupancy: ' + targetOccupancy + ' / ' + MAX_OCCUPANCY + ' people';
            applyOccupancy();
        });

        occBlock.appendChild(occLabel);
        occBlock.appendChild(occSlider);
        panel.appendChild(occBlock);

        // Live Telemetry Readout
        const statsEl = document.createElement('pre');
        statsEl.style.cssText = [
            'margin:0',
            'padding-top:8px',
            'border-top:1px solid rgba(148,163,184,0.2)',
            'font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace',
            'font-size:11px',
            'line-height:1.42',
            'color:#cbd5e1',
            'white-space:pre-wrap'
        ].join(';');
        panel.appendChild(statsEl);

        document.body.appendChild(panel);

        return {
            clockEl: clockEl,
            dayEl: dayEl,
            statsEl: statsEl
        };
    }

    function formatSet(s) {
        if (s.size === 0) return '-';
        return Array.from(s).sort(function (a, b) { return a - b; }).join(',');
    }

    function updateHUD(hud) {
        hud.clockEl.textContent = SimClock.format();
        hud.dayEl.textContent = 'Day ' + SimClock.day;

        const counts = {
            AT_DESK: 0,
            IN_MEETING: 0,
            AT_LUNCH: 0,
            AT_BREAK: 0,
            VISITING: 0,
            ON_FLOOR: 0,
            ARRIVING: 0,
            WAITING_ELEVATOR: 0,
            IN_CAR: 0,
            LEAVING: 0,
            AWAY: 0,
            GONE: 0,
            DISABLED: 0
        };

        let workersPresent = 0;
        let visitorsPresent = 0;

        for (let i = 0; i < agents.length; i++) {
            const a = agents[i];
            counts[a.state] = (counts[a.state] || 0) + 1;
            if (a.state !== 'DISABLED' && a.state !== 'AWAY' && a.state !== 'GONE') {
                if (a.role === 'WORKER') workersPresent++;
                else visitorsPresent++;
            }
        }

        const dirSym = elevator.direction > 0 ? 'UP \u2191' : (elevator.direction < 0 ? 'DOWN \u2193' : 'IDLE');
        const riders = elevator.passengers.size;
        const boarding = elevator.pendingBoarders.size;
        const exiting = elevator.pendingDisembark.size;

        const lines = [
            'ELEVATOR',
            '  Floor: ' + elevator.currentFloor + ' (' + dirSym + ')  [' + elevator.state + ']',
            '  Riders: ' + riders + '/' + elevator.MAX_CAPACITY +
                (boarding || exiting ? ' (board:' + boarding + ' exit:' + exiting + ')' : ''),
            '  Dest: [' + formatSet(elevator.destinations) + ']  Up: [' +
                formatSet(elevator.upCalls) + ']  Dn: [' + formatSet(elevator.downCalls) + ']',
            '',
            'PEOPLE (' + (workersPresent + visitorsPresent) + ' inside: ' +
                workersPresent + 'W / ' + visitorsPresent + 'V)',
            '  At desk:    ' + String(counts.AT_DESK).padStart(2, ' ') +
                '   In meeting: ' + String(counts.IN_MEETING).padStart(2, ' '),
            '  At lunch:   ' + String(counts.AT_LUNCH).padStart(2, ' ') +
                '   On break:   ' + String(counts.AT_BREAK).padStart(2, ' '),
            '  Visiting:   ' + String(counts.VISITING).padStart(2, ' ') +
                '   Walking:    ' + String(counts.ON_FLOOR + counts.ARRIVING + counts.LEAVING).padStart(2, ' '),
            '  Wait elev:  ' + String(counts.WAITING_ELEVATOR).padStart(2, ' ') +
                '   In car:     ' + String(counts.IN_CAR).padStart(2, ' '),
            '  Away/Gone:  ' + String(counts.AWAY + counts.GONE).padStart(2, ' ') +
                '   Disabled:   ' + String(counts.DISABLED).padStart(2, ' ')
        ];

        hud.statsEl.textContent = lines.join('\n');
    }

    // -------------------------------------------------------------------------
    // Bootstrap & Main Render Loop
    // -------------------------------------------------------------------------
    buildAgentPool();
    const hud = createHUD();
    updateDayNightLighting(SimClock.simMinute);

    const frameClock = new THREE.Clock();

    function animate() {
        requestAnimationFrame(animate);

        const realDt = Math.min(0.05, frameClock.getDelta());
        const totalMotionDt = realDt * SimClock.timeScale;

        // Substep physics so high timeScales (up to 600x) stay in exact lockstep
        // with elevator door timers, mid-motion stops, and waypoint walks.
        const steps = Math.max(1, Math.ceil(totalMotionDt / MAX_SUBSTEP_DT));
        const subRealDt = realDt / steps;
        const subMotionDt = totalMotionDt / steps;

        for (let s = 0; s < steps; s++) {
            SimClock.tick(subRealDt);
            topUpVisitors();
            elevator.tick(subMotionDt);

            for (let i = 0; i < agents.length; i++) {
                tickAgent(agents[i], subMotionDt);
            }

            applyCollisions();
        }

        updateDayNightLighting(SimClock.simMinute);

        // Animate limbs for all visible agents in the scene graph
        const animDt = Math.min(totalMotionDt, 0.35);
        for (let i = 0; i < agents.length; i++) {
            const g = agents[i].group;
            if (g.parent) {
                window.animatePersonWalking(g, animDt);
            }
        }

        controls.update();
        renderer.render(scene, camera);
        updateHUD(hud);
    }

    window.Clock = SimClock;
    window.scene = scene;
    window.camera = camera;
    window.renderer = renderer;
    window.controls = controls;
    window.world = world;
    window.elevator = elevator;
    window.agents = agents;
    window.seatReservations = seatReservations;

    window.SIM = {
        scene: scene,
        camera: camera,
        renderer: renderer,
        controls: controls,
        world: world,
        elevator: elevator,
        clock: SimClock,
        agents: agents,
        seatReservations: seatReservations
    };

    animate();
})();
