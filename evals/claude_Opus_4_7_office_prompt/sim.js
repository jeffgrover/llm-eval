// sim.js — simulated clock, day/night lighting, agent state machine, render loop, UI

(function () {
    const FH = window.WORLD_CONST.FLOOR_HEIGHT;
    const FLOOR_COUNT = window.WORLD_CONST.FLOOR_COUNT;
    const HD = window.WORLD_CONST.BUILDING_DEPTH / 2;

    const MAX_WORKERS = 20;
    const MAX_VISITORS = 80;
    const MAX_OCCUPANCY = MAX_WORKERS + MAX_VISITORS;
    const DEFAULT_OCCUPANCY = 45;

    const WALK_SPEED = 1.3;   // m/s of motion-seconds
    const MEETING_PROB = 0.36;

    const NAMES = [
        'Alex','Blair','Casey','Devon','Eli','Finn','Glenn','Harper','Iris','Jules',
        'Kai','Lane','Morgan','Noa','Owen','Parker','Quinn','Reese','Sage','Tess',
        'Uri','Vic','Wren','Xan','Yael','Zane','Ari','Bo','Cam','Dana',
        'Evan','Faye','Gale','Hollis','Indigo','Jay','Kit','Lee','Max','Nash',
        'Onyx','Perry','Quincy','Ricky','Sam','Teo','Val','Wyatt','Yin','Zed',
        'Ana','Beni','Cruz','Drew','Emi','Flo','Gus','Hal','Ian','Jude',
        'Kara','Lou','Mika','Nico','Opal','Pax','Remy','Shay','Tai','Umi',
        'Vega','Wes','Yaz','Zuri','Abel','Bex','Cory','Dari','Elin','Finley',
        'Gio','Hana','Indi','Joss','Keira','Leni','Mel','Niko','Ori','Pavi',
        'Qi','Rio','Sky','Tori','Una','Vesper','Willa','Xochi','Yara','Zelda'
    ];

    // --- Globals ---
    let scene, camera, renderer, controls;
    let sun, ambient, hemi;
    let world, floors, elevator;
    let agents = [];
    let targetOccupancy = DEFAULT_OCCUPANCY;
    const seatReservations = new Set();

    const Clock = {
        simMinute: 7 * 60 + 30,
        timeScale: 120,
        wrapDay: false,
        tick(realDt) {
            // timeScale is a pure real-time multiplier: 1× means 1 sim-second per real second.
            this.simMinute += realDt * this.timeScale / 60;
            if (this.simMinute >= 24 * 60) {
                this.simMinute -= 24 * 60;
                this.wrapDay = true;
            }
        },
        format() {
            const m = Math.floor(this.simMinute) % (24 * 60);
            const h = Math.floor(m / 60);
            const mi = m % 60;
            const ampm = h >= 12 ? 'PM' : 'AM';
            const h12 = h % 12 === 0 ? 12 : h % 12;
            return (h12 < 10 ? ' ' : '') + h12 + ':' + (mi < 10 ? '0' : '') + mi + ' ' + ampm;
        }
    };

    // ------------------------------------------------------------------
    // Day/night keyframes — long flat daytime, narrow golden hour
    // ------------------------------------------------------------------
    const KF = [
        { t: 0,    bg: 0x050818, sun: 0x223355, si: 0.05, ai: 0.45, hi: 0.32 },
        { t: 5.5,  bg: 0x050818, sun: 0x223355, si: 0.05, ai: 0.45, hi: 0.32 },
        { t: 6.0,  bg: 0x553355, sun: 0xff9966, si: 0.55, ai: 0.60, hi: 0.48 },
        { t: 6.5,  bg: 0x99aadd, sun: 0xffe4c0, si: 1.05, ai: 0.85, hi: 0.75 },
        { t: 9.0,  bg: 0x87a9d8, sun: 0xffffee, si: 1.15, ai: 0.95, hi: 0.85 },
        { t: 17.0, bg: 0x87a9d8, sun: 0xffffee, si: 1.15, ai: 0.95, hi: 0.85 },
        { t: 17.5, bg: 0x99aadd, sun: 0xffe4c0, si: 1.05, ai: 0.85, hi: 0.75 },
        { t: 18.0, bg: 0x8a5a6a, sun: 0xff9966, si: 0.55, ai: 0.60, hi: 0.48 },
        { t: 18.5, bg: 0x050818, sun: 0x223355, si: 0.05, ai: 0.45, hi: 0.32 },
        { t: 24.0, bg: 0x050818, sun: 0x223355, si: 0.05, ai: 0.45, hi: 0.32 }
    ];
    function lerpColor(a, b, t) {
        const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
        const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
        return (Math.round(ar + (br - ar) * t) << 16) |
               (Math.round(ag + (bg - ag) * t) << 8) |
                Math.round(ab + (bb - ab) * t);
    }
    function updateLighting() {
        const hour = Clock.simMinute / 60;
        let i = 0;
        while (i < KF.length - 1 && KF[i + 1].t <= hour) i++;
        const a = KF[i], b = KF[Math.min(i + 1, KF.length - 1)];
        const span = b.t - a.t;
        const t = span > 0 ? (hour - a.t) / span : 0;
        const bg = lerpColor(a.bg, b.bg, t);
        const sc = lerpColor(a.sun, b.sun, t);
        const si = a.si + (b.si - a.si) * t;
        const ai = a.ai + (b.ai - a.ai) * t;
        const hi = a.hi + (b.hi - a.hi) * t;
        scene.background = new THREE.Color(bg);
        sun.color.setHex(sc);
        sun.intensity = si;
        ambient.intensity = ai;
        hemi.intensity = hi;
    }

    // ------------------------------------------------------------------
    // Scene setup
    // ------------------------------------------------------------------
    function setupScene() {
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x87a9d8);

        camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 400);
        camera.position.set(28, 24, 28);
        camera.lookAt(0, 8, 0);

        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.sortObjects = true;
        document.body.appendChild(renderer.domElement);

        controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.target.set(0, 8, 0);
        controls.update();

        sun = new THREE.DirectionalLight(0xffffee, 1.1);
        sun.position.set(30, 60, 20);
        scene.add(sun);

        ambient = new THREE.AmbientLight(0xffffff, 0.9);
        scene.add(ambient);

        hemi = new THREE.HemisphereLight(0x88aaff, 0x332211, 0.7);
        scene.add(hemi);

        window.addEventListener('resize', () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        });
    }

    // ------------------------------------------------------------------
    // Agent
    // ------------------------------------------------------------------
    class Agent {
        constructor(id) {
            this.id = id;
            this.role = id < MAX_WORKERS ? 'WORKER' : 'VISITOR';
            this.name = NAMES[id % NAMES.length];
            this.state = 'DISABLED';
            this.plan = [];
            this.currentAction = null;
            this.currentFloor = 0;
            this.reservedSeats = new Set();
            this.hasLunched = false;
            this.arrivalTime = 0;
            this.lunchTime = 0;
            this.lunchDuration = 0;
            this.departureTime = 0;
            this.visitDuration = 10;
            this.plannedMeetingTimes = [];
            this.group = createPerson();
            this.group.userData.agentId = id;

            if (this.role === 'WORKER') {
                // Assign to a desk. 4 desks per floor × 5 office floors = 20 desks.
                const deskIdx = id % 4;
                const homeFloor = 1 + Math.floor(id / 4);
                this.homeFloor = Math.min(homeFloor, FLOOR_COUNT - 1);
                const fd = floors[this.homeFloor];
                if (fd && fd.desks && fd.desks[deskIdx]) {
                    this.deskId = fd.desks[deskIdx].id;
                    this.deskWpName = fd.desks[deskIdx].deskWpName;
                    this.deskDoorWpName = fd.desks[deskIdx].doorWpName;
                }
            } else {
                this.homeFloor = null;
                this.deskId = null;
                this.deskWpName = null;
                this.deskDoorWpName = null;
            }
        }
    }

    function initAgentSchedule(agent, nowMin) {
        if (agent.role === 'WORKER') {
            agent.arrivalTime = 8 * 60 + 15 + Math.random() * 75;      // 8:15 – 9:30
            agent.lunchTime = 11 * 60 + 30 + Math.random() * 120;      // 11:30 – 13:30
            agent.lunchDuration = 25 + Math.random() * 35;
            if (Math.random() < 0.15) {
                agent.departureTime = 18 * 60 + 30 + Math.random() * 75;   // 18:30 – 19:45
            } else {
                agent.departureTime = 16 * 60 + 45 + Math.random() * 105;  // 16:45 – 18:30
            }
            agent.plannedMeetingTimes = [];
            const r = Math.random();
            if (r < 0.50) agent.plannedMeetingTimes.push(9 * 60 + 30 + Math.random() * 120);
            if (r < 0.20) agent.plannedMeetingTimes.push(13 * 60 + 30 + Math.random() * 150);
        } else {
            agent.arrivalTime = Math.max(nowMin, 8 * 60) + Math.random() * 6;
            agent.visitDuration = 8 + Math.random() * 20;
            agent.lunchTime = 0;
            agent.lunchDuration = 0;
            agent.departureTime = 0;
            agent.plannedMeetingTimes = [];
        }
        agent.hasLunched = false;
    }

    // ------------------------------------------------------------------
    // Seat reservations
    // ------------------------------------------------------------------
    function reserveSeat(agent, floor, candidates) {
        for (let i = 0; i < candidates.length; i++) {
            const wp = candidates[i];
            const key = floor + ':' + wp;
            if (!seatReservations.has(key)) {
                seatReservations.add(key);
                agent.reservedSeats.add(key);
                return wp;
            }
        }
        return null;
    }
    function releaseAgentSeats(agent) {
        if (!agent.reservedSeats) return;
        agent.reservedSeats.forEach(k => seatReservations.delete(k));
        agent.reservedSeats.clear();
    }

    // ------------------------------------------------------------------
    // Plan helpers
    // ------------------------------------------------------------------
    function push(agent, action) { agent.plan.push(action); }

    function spawnAgent(agent) {
        const outsideNode = floors[0].nodes['outside'];
        const jx = (Math.random() * 2 - 1) * 1.1;
        const jz = (Math.random() * 2 - 1) * 0.75;
        agent.group.position.set(outsideNode.pos.x + jx, 0, outsideNode.pos.z + jz);
        agent.group.rotation.y = Math.PI;
        agent.group.userData.isWalking = false;
        agent.group.userData.isSitting = false;
        scene.add(agent.group);
        agent.state = 'ARRIVING';
        agent.currentFloor = 0;
        agent.plan = [];
        agent.currentAction = null;
    }

    function rideElevator(agent, fromFloor, toFloor) {
        push(agent, { type: 'WALK_TO_WP', params: { floor: fromFloor, wpName: 'elevWait' } });
        const dir = toFloor > fromFloor ? 1 : -1;
        push(agent, { type: 'ENTER_STATE', params: { state: 'WAITING_ELEVATOR' } });
        push(agent, { type: 'WAIT_AT_PANEL', params: { floor: fromFloor, direction: dir } });
        push(agent, { type: 'ENTER_STATE', params: { state: 'IN_CAR' } });
        push(agent, { type: 'ENTER_ELEVATOR', params: { direction: dir } });
        push(agent, { type: 'PRESS_FLOOR', params: { floor: toFloor } });
        push(agent, { type: 'WAIT_FOR_FLOOR', params: { floor: toFloor } });
        push(agent, { type: 'EXIT_ELEVATOR', params: { toFloor: toFloor } });
    }

    // ------------------------------------------------------------------
    // Plan compilers
    // ------------------------------------------------------------------
    function planArriveToDesk(agent) {
        const floor = agent.homeFloor;
        push(agent, { type: 'WALK_TO_WP', params: { floor: 0, wpName: 'entrance' } });
        rideElevator(agent, 0, floor);
        push(agent, { type: 'ENTER_STATE', params: { state: 'ON_FLOOR' } });
        push(agent, { type: 'WALK_TO_WP', params: { floor, wpName: agent.deskDoorWpName } });
        push(agent, { type: 'WALK_TO_WP', params: { floor, wpName: agent.deskWpName } });
        push(agent, { type: 'ENTER_STATE', params: { state: 'AT_DESK' } });
        push(agent, { type: 'SIT', params: { floor, wpName: agent.deskWpName } });
        push(agent, { type: 'WAIT_SIM', params: { minutes: 18 + Math.random() * 32 } });
        push(agent, { type: 'PICK_NEXT_ACTIVITY' });
    }

    function planGoToLunch(agent) {
        const homeFloor = agent.homeFloor;
        let cur = agent.currentFloor;
        if (agent.state === 'AT_DESK') {
            push(agent, { type: 'STAND' });
            push(agent, { type: 'WALK_TO_WP', params: { floor: cur, wpName: agent.deskDoorWpName } });
        }
        if (cur !== 0) {
            rideElevator(agent, cur, 0);
            cur = 0;
        }
        const cafeSpots = floors[0].cafeSpots;
        const spot = reserveSeat(agent, 0, cafeSpots);
        if (spot) {
            push(agent, { type: 'WALK_TO_WP', params: { floor: 0, wpName: 'cafe_door' } });
            push(agent, { type: 'WALK_TO_WP', params: { floor: 0, wpName: spot } });
            push(agent, { type: 'ENTER_STATE', params: { state: 'AT_LUNCH' } });
            push(agent, { type: 'SIT', params: { floor: 0, wpName: spot } });
            push(agent, { type: 'WAIT_SIM', params: { minutes: agent.lunchDuration } });
            push(agent, { type: 'STAND' });
            push(agent, { type: 'RELEASE_SEAT', params: { floor: 0, wpName: spot } });
        } else {
            // Fallback: stand at cafe_order
            push(agent, { type: 'WALK_TO_WP', params: { floor: 0, wpName: 'cafe_order' } });
            push(agent, { type: 'SIT', params: { floor: 0, wpName: 'cafe_order' } });
            push(agent, { type: 'WAIT_SIM', params: { minutes: agent.lunchDuration } });
        }
        push(agent, { type: 'MARK_LUNCHED' });
        // Back up to desk
        rideElevator(agent, 0, homeFloor);
        push(agent, { type: 'WALK_TO_WP', params: { floor: homeFloor, wpName: agent.deskDoorWpName } });
        push(agent, { type: 'WALK_TO_WP', params: { floor: homeFloor, wpName: agent.deskWpName } });
        push(agent, { type: 'ENTER_STATE', params: { state: 'AT_DESK' } });
        push(agent, { type: 'SIT', params: { floor: homeFloor, wpName: agent.deskWpName } });
        push(agent, { type: 'WAIT_SIM', params: { minutes: 15 + Math.random() * 30 } });
        push(agent, { type: 'PICK_NEXT_ACTIVITY' });
    }

    function planVisitLounge(agent) {
        const floor = agent.homeFloor;
        const spots = ['lounge_spot0', 'lounge_spot1', 'lounge_spot2', 'lounge_spot3'];
        const spot = reserveSeat(agent, floor, spots);
        if (!spot) {
            push(agent, { type: 'WAIT_SIM', params: { minutes: 10 + Math.random() * 15 } });
            push(agent, { type: 'PICK_NEXT_ACTIVITY' });
            return;
        }
        if (agent.state === 'AT_DESK') {
            push(agent, { type: 'STAND' });
            push(agent, { type: 'WALK_TO_WP', params: { floor, wpName: agent.deskDoorWpName } });
        }
        push(agent, { type: 'WALK_TO_WP', params: { floor, wpName: 'lounge_door' } });
        push(agent, { type: 'WALK_TO_WP', params: { floor, wpName: spot } });
        push(agent, { type: 'ENTER_STATE', params: { state: 'AT_BREAK' } });
        push(agent, { type: 'SIT', params: { floor, wpName: spot } });
        push(agent, { type: 'WAIT_SIM', params: { minutes: 5 + Math.random() * 7 } });
        push(agent, { type: 'STAND' });
        push(agent, { type: 'RELEASE_SEAT', params: { floor, wpName: spot } });
        push(agent, { type: 'WALK_TO_WP', params: { floor, wpName: agent.deskDoorWpName } });
        push(agent, { type: 'WALK_TO_WP', params: { floor, wpName: agent.deskWpName } });
        push(agent, { type: 'ENTER_STATE', params: { state: 'AT_DESK' } });
        push(agent, { type: 'SIT', params: { floor, wpName: agent.deskWpName } });
        push(agent, { type: 'WAIT_SIM', params: { minutes: 15 + Math.random() * 30 } });
        push(agent, { type: 'PICK_NEXT_ACTIVITY' });
    }

    function planAttendMeeting(agent) {
        const homeFloor = agent.homeFloor;
        const meetingFloor = (Math.random() < 0.65)
            ? homeFloor
            : 1 + Math.floor(Math.random() * (FLOOR_COUNT - 1));
        const seats = ['conf_seat0', 'conf_seat1', 'conf_seat2', 'conf_seat3'];
        const seat = reserveSeat(agent, meetingFloor, seats);
        if (!seat) { planVisitLounge(agent); return; }
        let cur = agent.currentFloor;
        if (agent.state === 'AT_DESK') {
            push(agent, { type: 'STAND' });
            push(agent, { type: 'WALK_TO_WP', params: { floor: cur, wpName: agent.deskDoorWpName } });
        }
        if (cur !== meetingFloor) {
            rideElevator(agent, cur, meetingFloor);
            cur = meetingFloor;
        }
        push(agent, { type: 'WALK_TO_WP', params: { floor: meetingFloor, wpName: 'conf_door' } });
        push(agent, { type: 'WALK_TO_WP', params: { floor: meetingFloor, wpName: seat } });
        push(agent, { type: 'ENTER_STATE', params: { state: 'IN_MEETING' } });
        push(agent, { type: 'SIT', params: { floor: meetingFloor, wpName: seat } });
        push(agent, { type: 'WAIT_SIM', params: { minutes: 22 + Math.random() * 23 } });
        push(agent, { type: 'STAND' });
        push(agent, { type: 'RELEASE_SEAT', params: { floor: meetingFloor, wpName: seat } });
        push(agent, { type: 'WALK_TO_WP', params: { floor: meetingFloor, wpName: 'conf_door' } });
        if (meetingFloor !== homeFloor) {
            rideElevator(agent, meetingFloor, homeFloor);
        }
        push(agent, { type: 'WALK_TO_WP', params: { floor: homeFloor, wpName: agent.deskDoorWpName } });
        push(agent, { type: 'WALK_TO_WP', params: { floor: homeFloor, wpName: agent.deskWpName } });
        push(agent, { type: 'ENTER_STATE', params: { state: 'AT_DESK' } });
        push(agent, { type: 'SIT', params: { floor: homeFloor, wpName: agent.deskWpName } });
        push(agent, { type: 'WAIT_SIM', params: { minutes: 12 + Math.random() * 30 } });
        push(agent, { type: 'PICK_NEXT_ACTIVITY' });
    }

    function planVisitCoworker(agent) {
        const homeFloor = agent.homeFloor;
        const cands = agents.filter(a =>
            a !== agent && a.role === 'WORKER' && a.state === 'AT_DESK' &&
            a.homeFloor != null && a.deskDoorWpName);
        if (cands.length === 0) {
            push(agent, { type: 'WAIT_SIM', params: { minutes: 8 + Math.random() * 15 } });
            push(agent, { type: 'PICK_NEXT_ACTIVITY' });
            return;
        }
        const target = cands[Math.floor(Math.random() * cands.length)];
        const targetFloor = target.homeFloor;
        let cur = agent.currentFloor;
        if (agent.state === 'AT_DESK') {
            push(agent, { type: 'STAND' });
            push(agent, { type: 'WALK_TO_WP', params: { floor: cur, wpName: agent.deskDoorWpName } });
        }
        if (cur !== targetFloor) {
            rideElevator(agent, cur, targetFloor);
            cur = targetFloor;
        }
        push(agent, { type: 'WALK_TO_WP', params: { floor: targetFloor, wpName: target.deskDoorWpName } });
        push(agent, { type: 'ENTER_STATE', params: { state: 'VISITING' } });
        push(agent, { type: 'WAIT_SIM', params: { minutes: 6 + Math.random() * 12 } });
        if (cur !== homeFloor) {
            rideElevator(agent, cur, homeFloor);
        }
        push(agent, { type: 'WALK_TO_WP', params: { floor: homeFloor, wpName: agent.deskDoorWpName } });
        push(agent, { type: 'WALK_TO_WP', params: { floor: homeFloor, wpName: agent.deskWpName } });
        push(agent, { type: 'ENTER_STATE', params: { state: 'AT_DESK' } });
        push(agent, { type: 'SIT', params: { floor: homeFloor, wpName: agent.deskWpName } });
        push(agent, { type: 'WAIT_SIM', params: { minutes: 15 + Math.random() * 30 } });
        push(agent, { type: 'PICK_NEXT_ACTIVITY' });
    }

    function planLeaveBuilding(agent) {
        releaseAgentSeats(agent);
        agent.group.userData.isSitting = false;
        let cur = agent.currentFloor;
        // Stand up if sitting; walk out of office if AT_DESK
        push(agent, { type: 'STAND' });
        if (cur === agent.homeFloor && agent.deskDoorWpName) {
            push(agent, { type: 'WALK_TO_WP', params: { floor: cur, wpName: agent.deskDoorWpName } });
        }
        push(agent, { type: 'ENTER_STATE', params: { state: 'LEAVING' } });
        if (cur !== 0) rideElevator(agent, cur, 0);
        push(agent, { type: 'WALK_TO_WP', params: { floor: 0, wpName: 'entrance' } });
        push(agent, { type: 'WALK_TO_WP', params: { floor: 0, wpName: 'outside' } });
        push(agent, { type: 'EXIT_BUILDING' });
    }

    function pushLobbyLoiter(agent) {
        const opts = floors[0].loiterSpots;
        const spot = opts[Math.floor(Math.random() * opts.length)];
        push(agent, { type: 'WALK_TO_WP', params: { floor: 0, wpName: spot } });
        push(agent, { type: 'SIT', params: { floor: 0, wpName: spot } });
        push(agent, { type: 'WAIT_SIM', params: { minutes: 2 + Math.random() * 6 } });
    }

    function planVisitorVisit(agent) {
        push(agent, { type: 'WALK_TO_WP', params: { floor: 0, wpName: 'entrance' } });
        push(agent, { type: 'ENTER_STATE', params: { state: 'VISITING' } });

        const r = Math.random();
        if (r < 0.10) {
            // Bistro table
            const spot = reserveSeat(agent, 0, floors[0].cafeSpots);
            if (spot) {
                push(agent, { type: 'WALK_TO_WP', params: { floor: 0, wpName: 'cafe_door' } });
                push(agent, { type: 'WALK_TO_WP', params: { floor: 0, wpName: spot } });
                push(agent, { type: 'SIT', params: { floor: 0, wpName: spot } });
                push(agent, { type: 'WAIT_SIM', params: { minutes: 6 + Math.random() * 14 } });
                push(agent, { type: 'STAND' });
                push(agent, { type: 'RELEASE_SEAT', params: { floor: 0, wpName: spot } });
            } else pushLobbyLoiter(agent);
        } else if (r < 0.16) {
            push(agent, { type: 'WALK_TO_WP', params: { floor: 0, wpName: 'cafe_order' } });
            push(agent, { type: 'SIT', params: { floor: 0, wpName: 'cafe_order' } });
            push(agent, { type: 'WAIT_SIM', params: { minutes: 2 + Math.random() * 5 } });
        } else if (r < 0.30) {
            const spot = reserveSeat(agent, 0, floors[0].frontLoungeSpots);
            if (spot) {
                push(agent, { type: 'WALK_TO_WP', params: { floor: 0, wpName: 'front_lounge_center' } });
                push(agent, { type: 'WALK_TO_WP', params: { floor: 0, wpName: spot } });
                push(agent, { type: 'SIT', params: { floor: 0, wpName: spot } });
                push(agent, { type: 'WAIT_SIM', params: { minutes: 6 + Math.random() * 14 } });
                push(agent, { type: 'STAND' });
                push(agent, { type: 'RELEASE_SEAT', params: { floor: 0, wpName: spot } });
            } else pushLobbyLoiter(agent);
        } else if (r < 0.42) {
            const pickBack = Math.random() < 0.45;
            const cand = pickBack ? floors[0].backLoungeSpots : floors[0].pitSpots;
            const center = pickBack ? 'back_lounge_center' : 'pit_center';
            const spot = reserveSeat(agent, 0, cand);
            if (spot) {
                push(agent, { type: 'WALK_TO_WP', params: { floor: 0, wpName: center } });
                push(agent, { type: 'WALK_TO_WP', params: { floor: 0, wpName: spot } });
                push(agent, { type: 'SIT', params: { floor: 0, wpName: spot } });
                push(agent, { type: 'WAIT_SIM', params: { minutes: 6 + Math.random() * 14 } });
                push(agent, { type: 'STAND' });
                push(agent, { type: 'RELEASE_SEAT', params: { floor: 0, wpName: spot } });
            } else pushLobbyLoiter(agent);
        } else if (r < 0.52) {
            const opts = ['reception', 'kiosk', 'lobby_wc_front', 'lobby_wc_back'];
            const spot = opts[Math.floor(Math.random() * opts.length)];
            push(agent, { type: 'WALK_TO_WP', params: { floor: 0, wpName: spot } });
            push(agent, { type: 'SIT', params: { floor: 0, wpName: spot } });
            push(agent, { type: 'WAIT_SIM', params: { minutes: 2 + Math.random() * 5 } });
        } else if (r < 0.62) {
            pushLobbyLoiter(agent);
        } else if (r < 0.77) {
            const floor = 1 + Math.floor(Math.random() * (FLOOR_COUNT - 1));
            const spots = ['lounge_spot0', 'lounge_spot1', 'lounge_spot2', 'lounge_spot3'];
            const spot = reserveSeat(agent, floor, spots);
            if (spot) {
                rideElevator(agent, 0, floor);
                push(agent, { type: 'WALK_TO_WP', params: { floor, wpName: 'lounge_center' } });
                push(agent, { type: 'WALK_TO_WP', params: { floor, wpName: spot } });
                push(agent, { type: 'SIT', params: { floor, wpName: spot } });
                push(agent, { type: 'WAIT_SIM', params: { minutes: 8 + Math.random() * 18 } });
                push(agent, { type: 'STAND' });
                push(agent, { type: 'RELEASE_SEAT', params: { floor, wpName: spot } });
                rideElevator(agent, floor, 0);
            } else pushLobbyLoiter(agent);
        } else {
            // Sit in on a meeting
            const floor = 1 + Math.floor(Math.random() * (FLOOR_COUNT - 1));
            const seats = ['conf_seat0', 'conf_seat1', 'conf_seat2', 'conf_seat3'];
            const seat = reserveSeat(agent, floor, seats);
            if (seat) {
                rideElevator(agent, 0, floor);
                push(agent, { type: 'WALK_TO_WP', params: { floor, wpName: 'conf_door' } });
                push(agent, { type: 'WALK_TO_WP', params: { floor, wpName: seat } });
                push(agent, { type: 'ENTER_STATE', params: { state: 'IN_MEETING' } });
                push(agent, { type: 'SIT', params: { floor, wpName: seat } });
                push(agent, { type: 'WAIT_SIM', params: { minutes: 20 + Math.random() * 25 } });
                push(agent, { type: 'STAND' });
                push(agent, { type: 'RELEASE_SEAT', params: { floor, wpName: seat } });
                push(agent, { type: 'WALK_TO_WP', params: { floor, wpName: 'conf_door' } });
                rideElevator(agent, floor, 0);
            } else pushLobbyLoiter(agent);
        }

        push(agent, { type: 'WALK_TO_WP', params: { floor: 0, wpName: 'entrance' } });
        push(agent, { type: 'WALK_TO_WP', params: { floor: 0, wpName: 'outside' } });
        push(agent, { type: 'EXIT_BUILDING' });
    }

    function chooseNextActivity(agent) {
        if (agent.role === 'VISITOR') return;  // visitors don't loop
        const now = Clock.simMinute;
        if (now >= agent.departureTime) {
            planLeaveBuilding(agent);
            return;
        }
        for (let i = 0; i < agent.plannedMeetingTimes.length; i++) {
            if (now >= agent.plannedMeetingTimes[i]) {
                agent.plannedMeetingTimes.splice(i, 1);
                planAttendMeeting(agent);
                return;
            }
        }
        if (now >= agent.lunchTime && !agent.hasLunched) {
            planGoToLunch(agent);
            return;
        }
        const r = Math.random();
        const p1 = MEETING_PROB * 0.4;          // 0.144
        const p2 = p1 + 0.12;                    // 0.264 lounge
        const p3 = p2 + 0.15;                    // 0.414 coworker
        if (r < p1) planAttendMeeting(agent);
        else if (r < p2) planVisitLounge(agent);
        else if (r < p3) planVisitCoworker(agent);
        else {
            push(agent, { type: 'WAIT_SIM', params: { minutes: 18 + Math.random() * 47 } });
            push(agent, { type: 'PICK_NEXT_ACTIVITY' });
        }
    }

    // ------------------------------------------------------------------
    // Action ticks
    // ------------------------------------------------------------------
    function stepToward(pos, target, motionDt, group) {
        const dx = target.x - pos.x;
        const dz = target.z - pos.z;
        const d = Math.hypot(dx, dz);
        const step = WALK_SPEED * motionDt;
        if (d < 1e-4 || d < step) {
            pos.x = target.x;
            pos.z = target.z;
            return true;
        }
        const nx = dx / d, nz = dz / d;
        pos.x += nx * step;
        pos.z += nz * step;
        if (group) group.rotation.y = Math.atan2(nx, nz);
        return false;
    }

    function startAction(agent, action) {
        action._inited = false;
        action._phase = 0;
        if (action.type === 'WAIT_SIM') {
            action.untilMin = Clock.simMinute + action.params.minutes;
            action._inited = true;
        }
    }

    function tickWalkToWp(agent, action, dt) {
        if (!action._inited) {
            action._inited = true;
            const floor = action.params.floor;
            const wpName = action.params.wpName;
            const fd = floors[floor];
            const target = fd && fd.nodes[wpName];
            if (!target) { agent.group.userData.isWalking = false; return true; }
            const wp = new THREE.Vector3();
            agent.group.getWorldPosition(wp);
            let fromName = null, bestD = Infinity;
            for (const name in fd.nodes) {
                const np = fd.nodes[name].pos;
                const d = (wp.x - np.x) ** 2 + (wp.z - np.z) ** 2;
                if (d < bestD) { bestD = d; fromName = name; }
            }
            action.path = world.bfsPath(fd.nodes, fromName, wpName) || [target.pos.clone()];
            action.pathIdx = 0;
            action._prev = new THREE.Vector3().copy(agent.group.position);
            action._stallT = 0;
            agent.group.userData.isWalking = true;
        }
        if (!action.path || action.pathIdx >= action.path.length) {
            agent.group.userData.isWalking = false;
            return true;
        }
        const pos = agent.group.position;
        const target = action.path[action.pathIdx];
        const reached = stepToward(pos, target, dt, agent.group);
        if (reached) {
            action.pathIdx++;
            action._stallT = 0;
            action._prev.copy(pos);
            if (action.pathIdx >= action.path.length) {
                agent.group.userData.isWalking = false;
                return true;
            }
        } else {
            const moved = Math.hypot(pos.x - action._prev.x, pos.z - action._prev.z);
            if (moved < 0.005) {
                action._stallT += dt;
                if (action._stallT > 1.2) {
                    action.pathIdx++;
                    action._stallT = 0;
                    if (action.pathIdx >= action.path.length) {
                        agent.group.userData.isWalking = false;
                        return true;
                    }
                }
            } else {
                action._stallT = 0;
                action._prev.copy(pos);
            }
        }
        return false;
    }

    function tickWaitAtPanel(agent, action, dt) {
        const floor = action.params.floor;
        const dir = action.params.direction;
        if (dir === 1) elevator.callUp(floor);
        else elevator.callDown(floor);
        agent.group.userData.isWalking = false;
        if (elevator.isAcceptingAt(floor, dir) && elevator.currentCapacityFree() > 0) {
            return true;
        }
        return false;
    }

    function tickEnterElevator(agent, action, dt) {
        const dir = action.params.direction;
        if (action._phase === 0) {
            const floor = agent.currentFloor;
            if (!elevator.isAcceptingAt(floor, dir) || elevator.currentCapacityFree() <= 0) {
                if (dir === 1) elevator.callUp(floor);
                else elevator.callDown(floor);
                return false;
            }
            const spot = elevator.reserveBoardingSpot(agent);
            if (!spot) return false;
            action._spotLocal = spot;
            action._threshTarget = new THREE.Vector3(
                spot.x,
                agent.currentFloor * FH,
                elevator.getDoorWorldZ() - 0.05
            );
            action._prev = new THREE.Vector3().copy(agent.group.position);
            action._stallT = 0;
            action._phase = 1;
            agent.group.userData.isWalking = true;
        }
        if (action._phase === 1) {
            const pos = agent.group.position;
            const reached = stepToward(pos, action._threshTarget, dt, agent.group);
            const moved = Math.hypot(pos.x - action._prev.x, pos.z - action._prev.z);
            if (moved < 0.003) {
                action._stallT += dt;
                if (action._stallT > 1.5) {
                    pos.x = action._threshTarget.x;
                    pos.z = action._threshTarget.z;
                    action._phase = 2;
                    return false;
                }
            } else {
                action._stallT = 0;
                action._prev.copy(pos);
            }
            if (reached) action._phase = 2;
            else return false;
        }
        if (action._phase === 2) {
            // Reparent to car
            const wp = new THREE.Vector3();
            agent.group.getWorldPosition(wp);
            elevator.carGroup.add(agent.group);
            agent.group.position.x = wp.x - elevator.carGroup.position.x;
            agent.group.position.y = 0;
            agent.group.position.z = wp.z - elevator.carGroup.position.z;
            action._phase = 3;
        }
        if (action._phase === 3) {
            const pos = agent.group.position;
            const reached = stepToward(pos, action._spotLocal, dt, agent.group);
            if (reached) {
                elevator.completeBoard(agent);
                agent.group.rotation.y = 0;
                agent.group.userData.isWalking = false;
                return true;
            }
            return false;
        }
        return false;
    }

    function tickPressFloor(agent, action, dt) {
        elevator.pressDestination(action.params.floor);
        return true;
    }

    function tickWaitForFloor(agent, action, dt) {
        const f = action.params.floor;
        agent.group.userData.isWalking = false;
        if (elevator.currentFloor === f && elevator.state === 'DOOR_OPEN') return true;
        return false;
    }

    function tickExitElevator(agent, action, dt) {
        const toFloor = action.params.toFloor;
        if (action._phase === 0) {
            elevator.registerDisembark(agent);
            const wp = new THREE.Vector3();
            agent.group.getWorldPosition(wp);
            scene.add(agent.group);
            agent.group.position.copy(wp);
            agent.group.userData.isWalking = true;
            const fd = floors[toFloor];
            const node = fd.nodes['elevWait'].pos;
            action._target = new THREE.Vector3(node.x, toFloor * FH, node.z);
            action._phase = 1;
        }
        if (action._phase === 1) {
            const pos = agent.group.position;
            const reached = stepToward(pos, action._target, dt, agent.group);
            if (reached) {
                elevator.completeDisembark(agent);
                agent.group.userData.isWalking = false;
                agent.currentFloor = toFloor;
                return true;
            }
            return false;
        }
        return false;
    }

    function tickSit(agent, action, dt) {
        const floor = action.params.floor;
        const wpName = action.params.wpName;
        const fd = floors[floor];
        const wp = fd && fd.nodes[wpName];
        const target = fd && fd.sitTargets[wpName];
        if (wp) {
            agent.group.position.x = wp.pos.x;
            agent.group.position.z = wp.pos.z;
            agent.group.position.y = floor * FH;
            if (target) {
                agent.group.rotation.y = target.facing;
                if (target.sit) {
                    agent.group.position.y = floor * FH - 0.35;
                    agent.group.userData.isSitting = true;
                } else {
                    const r = 0.35 + Math.random() * 0.4;
                    const ang = Math.random() * Math.PI * 2;
                    agent.group.position.x += Math.cos(ang) * r;
                    agent.group.position.z += Math.sin(ang) * r;
                }
            }
        }
        agent.group.userData.isWalking = false;
        return true;
    }

    function tickStand(agent, action, dt) {
        agent.group.userData.isSitting = false;
        if (agent.group.parent === elevator.carGroup) {
            agent.group.position.y = 0;
        } else {
            agent.group.position.y = agent.currentFloor * FH;
        }
        return true;
    }

    function tickReleaseSeat(agent, action, dt) {
        const key = action.params.floor + ':' + action.params.wpName;
        seatReservations.delete(key);
        agent.reservedSeats.delete(key);
        return true;
    }

    function tickWaitSim(agent, action, dt) {
        if (Clock.simMinute >= action.untilMin) return true;
        return false;
    }

    function tickExitBuilding(agent, action, dt) {
        if (agent.group && agent.group.parent) agent.group.parent.remove(agent.group);
        releaseAgentSeats(agent);
        agent.state = 'GONE';
        return true;
    }

    function tickEnterState(agent, action, dt) {
        agent.state = action.params.state;
        return true;
    }

    function tickMarkLunched(agent, action, dt) {
        agent.hasLunched = true;
        return true;
    }

    function tickPickNextActivity(agent, action, dt) {
        chooseNextActivity(agent);
        return true;
    }

    function updateAction(agent, action, dt) {
        switch (action.type) {
            case 'WALK_TO_WP':      return tickWalkToWp(agent, action, dt);
            case 'WAIT_AT_PANEL':   return tickWaitAtPanel(agent, action, dt);
            case 'ENTER_ELEVATOR':  return tickEnterElevator(agent, action, dt);
            case 'PRESS_FLOOR':     return tickPressFloor(agent, action, dt);
            case 'WAIT_FOR_FLOOR':  return tickWaitForFloor(agent, action, dt);
            case 'EXIT_ELEVATOR':   return tickExitElevator(agent, action, dt);
            case 'SIT':             return tickSit(agent, action, dt);
            case 'STAND':           return tickStand(agent, action, dt);
            case 'RELEASE_SEAT':    return tickReleaseSeat(agent, action, dt);
            case 'WAIT_SIM':        return tickWaitSim(agent, action, dt);
            case 'EXIT_BUILDING':   return tickExitBuilding(agent, action, dt);
            case 'ENTER_STATE':     return tickEnterState(agent, action, dt);
            case 'MARK_LUNCHED':    return tickMarkLunched(agent, action, dt);
            case 'PICK_NEXT_ACTIVITY': return tickPickNextActivity(agent, action, dt);
            default: return true;
        }
    }

    // ------------------------------------------------------------------
    // Per-frame agent update
    // ------------------------------------------------------------------
    function processSchedule(agent) {
        // Arrival trigger
        if (agent.state === 'AWAY' && Clock.simMinute >= agent.arrivalTime) {
            spawnAgent(agent);
            if (agent.role === 'WORKER') planArriveToDesk(agent);
            else planVisitorVisit(agent);
        }

        // End-of-day override for workers
        if (agent.role === 'WORKER' &&
            agent.state !== 'AWAY' && agent.state !== 'GONE' &&
            agent.state !== 'LEAVING' && agent.state !== 'DISABLED' &&
            Clock.simMinute >= agent.departureTime) {
            agent.plan = [];
            agent.currentAction = null;
            planLeaveBuilding(agent);
        }
    }

    function updateAgent(agent, dt) {
        if (agent.state === 'DISABLED' || agent.state === 'AWAY' || agent.state === 'GONE') return;
        let iter = 0;
        while (iter < 16) {
            if (!agent.currentAction && agent.plan.length > 0) {
                agent.currentAction = agent.plan.shift();
                startAction(agent, agent.currentAction);
            }
            if (!agent.currentAction) break;
            const done = updateAction(agent, agent.currentAction, dt);
            if (done) {
                agent.currentAction = null;
                iter++;
            } else {
                break;
            }
        }
    }

    // ------------------------------------------------------------------
    // Collisions
    // ------------------------------------------------------------------
    function applyCollisions() {
        const R = 0.72;
        const R2 = R * R;
        const push = 0.18;
        for (let i = 0; i < agents.length; i++) {
            const a = agents[i];
            if (!a.group || !a.group.parent) continue;
            if (a.group.userData.isSitting) continue;
            if (a.group.parent === elevator.carGroup) continue;
            if (a.currentAction && a.currentAction.type === 'ENTER_ELEVATOR') continue;
            for (let j = i + 1; j < agents.length; j++) {
                const b = agents[j];
                if (!b.group || !b.group.parent) continue;
                if (b.group.parent !== a.group.parent) continue;
                if (b.group.userData.isSitting) continue;
                if (b.group.parent === elevator.carGroup) continue;
                if (b.currentAction && b.currentAction.type === 'ENTER_ELEVATOR') continue;
                const dy = Math.abs(a.group.position.y - b.group.position.y);
                if (dy > 1.0) continue;
                const dx = a.group.position.x - b.group.position.x;
                const dz = a.group.position.z - b.group.position.z;
                const d2 = dx * dx + dz * dz;
                if (d2 >= R2) continue;
                if (d2 < 1e-6) {
                    const ang = Math.random() * Math.PI * 2;
                    a.group.position.x += Math.cos(ang) * push;
                    a.group.position.z += Math.sin(ang) * push;
                    b.group.position.x -= Math.cos(ang) * push;
                    b.group.position.z -= Math.sin(ang) * push;
                } else {
                    const d = Math.sqrt(d2);
                    const overlap = R - d;
                    const nx = dx / d, nz = dz / d;
                    const s = overlap * push;
                    a.group.position.x += nx * s;
                    a.group.position.z += nz * s;
                    b.group.position.x -= nx * s;
                    b.group.position.z -= nz * s;
                }
            }
        }
    }

    // ------------------------------------------------------------------
    // Occupancy
    // ------------------------------------------------------------------
    function countPresent() {
        let n = 0;
        for (let i = 0; i < agents.length; i++) {
            const a = agents[i];
            if (a.state === 'DISABLED' || a.state === 'AWAY' || a.state === 'GONE') continue;
            n++;
        }
        return n;
    }

    function applyOccupancy() {
        for (let i = 0; i < agents.length; i++) {
            const a = agents[i];
            if (a.id < targetOccupancy) {
                if (a.state === 'DISABLED') a.state = 'AWAY';
            } else {
                if (a.state === 'AWAY') a.state = 'DISABLED';
                // else leave running agents alone — they'll finish and next day be DISABLED
            }
        }
    }

    function topUpVisitors() {
        const now = Clock.simMinute;
        if (now < 8 * 60 || now > 18 * 60 + 30) return;
        const deficit = targetOccupancy - countPresent();
        if (deficit <= 0) return;
        let rearmed = 0;
        for (let i = 0; i < agents.length && rearmed < deficit; i++) {
            const a = agents[i];
            if (a.role !== 'VISITOR') continue;
            if (a.id >= targetOccupancy) continue;
            if (a.state !== 'AWAY' && a.state !== 'GONE') continue;
            a.arrivalTime = now + Math.random() * 6;
            a.visitDuration = 8 + Math.random() * 20;
            a.state = 'AWAY';
            a.plan = [];
            a.currentAction = null;
            rearmed++;
        }
    }

    // ------------------------------------------------------------------
    // Day wrap
    // ------------------------------------------------------------------
    function handleDayWrap() {
        seatReservations.clear();
        for (let i = 0; i < agents.length; i++) {
            const a = agents[i];
            if (a.group && a.group.parent) a.group.parent.remove(a.group);
            a.group.userData.isSitting = false;
            a.group.userData.isWalking = false;
            a.plan = [];
            a.currentAction = null;
            a.reservedSeats.clear();
            a.hasLunched = false;
            initAgentSchedule(a, Clock.simMinute);
            a.state = (a.id < targetOccupancy) ? 'AWAY' : 'DISABLED';
            a.currentFloor = 0;
        }
        elevator.reset();
    }

    // ------------------------------------------------------------------
    // UI
    // ------------------------------------------------------------------
    let hudTime, hudSpeed, hudOcc, hudState, hudElev, hudSpeedLabel, hudOccLabel;

    function buildHUD() {
        const div = document.createElement('div');
        div.id = 'hud';
        div.style.cssText =
            'position:absolute;top:10px;left:10px;color:#eee;' +
            'background:rgba(10,10,20,0.55);padding:12px 14px;border-radius:10px;' +
            'font-family:sans-serif;font-size:12px;width:250px;' +
            'backdrop-filter:blur(4px);line-height:1.45;pointer-events:auto;';
        div.innerHTML =
            '<div id="timeLabel" style="font-size:26px;font-weight:bold;margin-bottom:8px;letter-spacing:1px;"></div>' +
            '<div style="margin-bottom:8px;">' +
              '<label>Speed: <span id="speedLabel"></span>×</label>' +
              '<input type="range" min="0" max="100" value="75" id="speedSlider" style="width:100%;">' +
            '</div>' +
            '<div style="margin-bottom:8px;">' +
              '<label>Occupancy: <span id="occLabel"></span> / ' + MAX_OCCUPANCY + ' people</label>' +
              '<input type="range" min="1" max="' + MAX_OCCUPANCY + '" value="' + DEFAULT_OCCUPANCY + '" id="occSlider" style="width:100%;">' +
            '</div>' +
            '<div id="stateBreakdown" style="margin-top:8px;font-size:11px;"></div>' +
            '<div id="elevInfo" style="margin-top:8px;font-size:11px;"></div>';
        document.body.appendChild(div);

        hudTime = document.getElementById('timeLabel');
        hudSpeedLabel = document.getElementById('speedLabel');
        hudOccLabel = document.getElementById('occLabel');
        hudSpeed = document.getElementById('speedSlider');
        hudOcc = document.getElementById('occSlider');
        hudState = document.getElementById('stateBreakdown');
        hudElev = document.getElementById('elevInfo');

        hudSpeed.addEventListener('input', () => {
            const s = parseFloat(hudSpeed.value) / 100;
            Clock.timeScale = Math.pow(600, s);
            hudSpeedLabel.textContent = Clock.timeScale.toFixed(
                Clock.timeScale < 10 ? 1 : 0
            );
        });
        hudSpeed.dispatchEvent(new Event('input'));

        hudOcc.addEventListener('input', () => {
            targetOccupancy = parseInt(hudOcc.value, 10);
            hudOccLabel.textContent = String(targetOccupancy);
            applyOccupancy();
        });
        hudOcc.dispatchEvent(new Event('input'));
    }

    function updateHUD() {
        hudTime.textContent = Clock.format();
        // State breakdown
        const counts = {};
        let present = 0;
        for (let i = 0; i < agents.length; i++) {
            const a = agents[i];
            counts[a.state] = (counts[a.state] || 0) + 1;
            if (a.state !== 'DISABLED' && a.state !== 'AWAY' && a.state !== 'GONE') present++;
        }
        const order = ['ARRIVING','WAITING_ELEVATOR','IN_CAR','ON_FLOOR','AT_DESK',
                       'IN_MEETING','AT_BREAK','AT_LUNCH','VISITING','LEAVING'];
        let html = '<b>Present: ' + present + '</b>';
        for (let i = 0; i < order.length; i++) {
            const s = order[i];
            if (counts[s]) html += '<br>' + s.toLowerCase().replace(/_/g, ' ') + ': ' + counts[s];
        }
        hudState.innerHTML = html;
        // Elevator info
        hudElev.innerHTML =
            '<b>Elevator</b><br>' +
            'floor ' + elevator.currentFloor + ' · ' + elevator.state +
            ' · dir ' + (elevator.direction === 1 ? '↑' : elevator.direction === -1 ? '↓' : '—') +
            '<br>passengers: ' + elevator.passengers.size +
            ' (+' + elevator.pendingBoarders.size + ' boarding, ' +
            elevator.pendingDisembark.size + ' exiting)' +
            '<br>dest: {' + Array.from(elevator.destinations).sort().join(',') + '}' +
            '<br>up: {' + Array.from(elevator.upCalls).sort().join(',') + '} ' +
            'down: {' + Array.from(elevator.downCalls).sort().join(',') + '}';
    }

    // ------------------------------------------------------------------
    // Main
    // ------------------------------------------------------------------
    let realClock;

    function init() {
        setupScene();
        world = createWorld(scene);
        floors = world.floors;
        elevator = new Elevator(scene, world);

        // Build all agents
        for (let i = 0; i < MAX_OCCUPANCY; i++) {
            const a = new Agent(i);
            initAgentSchedule(a, Clock.simMinute);
            a.state = (i < targetOccupancy) ? 'AWAY' : 'DISABLED';
            agents.push(a);
        }

        buildHUD();
        realClock = new THREE.Clock();
        animate();
    }

    function animate() {
        requestAnimationFrame(animate);
        const realDt = Math.min(0.05, realClock.getDelta());
        Clock.tick(realDt);
        if (Clock.wrapDay) {
            Clock.wrapDay = false;
            handleDayWrap();
        }
        updateLighting();
        const motionDt = realDt * Clock.timeScale;
        elevator.tick(motionDt);
        topUpVisitors();
        for (let i = 0; i < agents.length; i++) {
            const a = agents[i];
            processSchedule(a);
            updateAgent(a, motionDt);
        }
        applyCollisions();
        for (let i = 0; i < agents.length; i++) {
            const a = agents[i];
            if (a.group && a.group.parent) animatePersonWalking(a.group, motionDt);
        }
        controls.update();
        renderer.render(scene, camera);
        updateHUD();
    }

    // Kick off when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
