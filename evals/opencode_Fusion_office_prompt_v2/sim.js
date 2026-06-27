(function () {
    // ============================================================
    // Constants
    // ============================================================
    const FLOOR_HEIGHT = WORLD.FLOOR_HEIGHT;
    const FLOOR_COUNT = WORLD.FLOOR_COUNT;
    const MAX_WORKERS = 20;
    const MAX_VISITORS = 80;
    const MAX_OCCUPANCY = MAX_WORKERS + MAX_VISITORS;
    const DEFAULT_OCCUPANCY = 45;
    const WALK_SPEED = 1.3;
    const PERSON_R = WORLD.PERSON_R;
    const MEETING_PROB = 0.36;

    const NAMES = ["Ava", "Ben", "Cy", "Dot", "Eli", "Fay", "Gus", "Hana", "Ike", "Jo",
        "Kai", "Lia", "Max", "Nel", "Ola", "Pia", "Quin", "Rae", "Sid", "Tom",
        "Uma", "Val", "Wes", "Xan", "Yuki", "Zed", "Ace", "Bea", "Cole", "Drew"];

    function randInt(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
    function randRange(a, b) { return a + Math.random() * (b - a); }
    function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

    // ============================================================
    // Scene setup
    // ============================================================
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x223344);

    const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(28, 24, 28);
    camera.lookAt(0, FLOOR_COUNT * FLOOR_HEIGHT / 2, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.sortObjects = true;
    document.body.appendChild(renderer.domElement);

    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.target.set(0, FLOOR_COUNT * FLOOR_HEIGHT / 2, 0);
    controls.update();

    const ambient = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambient);
    const sun = new THREE.DirectionalLight(0xffffff, 0.8);
    sun.position.set(30, 50, 20);
    scene.add(sun);
    const hemi = new THREE.HemisphereLight(0xaaccff, 0x444433, 0.5);
    scene.add(hemi);

    const world = createWorld(scene);
    const elevator = new Elevator(scene, world);

    window.addEventListener("resize", function () {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    function floorByNumber(n) { return world.floors[n]; }

    // ============================================================
    // Simulated clock
    // ============================================================
    const Clock = {
        simMinute: 7 * 60 + 30,
        timeScale: 120,
        threeClock: new THREE.Clock(),
        tick: function (realDt) {
            this.simMinute += realDt * this.timeScale / 60;
            if (this.simMinute >= 24 * 60) {
                this.simMinute -= 24 * 60;
                onDayWrap();
            }
        },
        format: function () {
            let m = Math.floor(this.simMinute) % (24 * 60);
            let h = Math.floor(m / 60);
            let mm = m % 60;
            const ampm = h < 12 ? "AM" : "PM";
            let hh = h % 12; if (hh === 0) hh = 12;
            const hs = (hh < 10 ? " " : "") + hh;
            return hs + ":" + (mm < 10 ? "0" : "") + mm + " " + ampm;
        }
    };

    // ============================================================
    // Day / night lighting
    // ============================================================
    const LIGHT_KEYS = [
        { h: 0, bg: 0x0a0e1a, sun: 0x223355, sunI: 0.05, amb: 0.45, hemi: 0.32 },
        { h: 5.5, bg: 0x0a0e1a, sun: 0x223355, sunI: 0.05, amb: 0.45, hemi: 0.32 },
        { h: 6.0, bg: 0x4a3a55, sun: 0xff8844, sunI: 0.4, amb: 0.55, hemi: 0.45 },
        { h: 6.5, bg: 0x88aadd, sun: 0xfff0cc, sunI: 0.9, amb: 0.8, hemi: 0.7 },
        { h: 12, bg: 0x99bbff, sun: 0xffffff, sunI: 1.0, amb: 0.9, hemi: 0.8 },
        { h: 17.5, bg: 0x99bbee, sun: 0xfff0cc, sunI: 0.9, amb: 0.8, hemi: 0.7 },
        { h: 18.0, bg: 0x553355, sun: 0xff7733, sunI: 0.4, amb: 0.6, hemi: 0.5 },
        { h: 18.5, bg: 0x1a1e2e, sun: 0x223355, sunI: 0.08, amb: 0.45, hemi: 0.32 },
        { h: 24, bg: 0x0a0e1a, sun: 0x223355, sunI: 0.05, amb: 0.45, hemi: 0.32 }
    ];
    const _c1 = new THREE.Color(), _c2 = new THREE.Color();
    function lerp(a, b, t) { return a + (b - a) * t; }
    function updateLighting() {
        const h = Clock.simMinute / 60;
        let k0 = LIGHT_KEYS[0], k1 = LIGHT_KEYS[LIGHT_KEYS.length - 1];
        for (let i = 0; i < LIGHT_KEYS.length - 1; i++) {
            if (h >= LIGHT_KEYS[i].h && h <= LIGHT_KEYS[i + 1].h) {
                k0 = LIGHT_KEYS[i]; k1 = LIGHT_KEYS[i + 1]; break;
            }
        }
        const span = (k1.h - k0.h) || 1;
        const t = Math.max(0, Math.min(1, (h - k0.h) / span));
        _c1.setHex(k0.bg); _c2.setHex(k1.bg);
        scene.background.copy(_c1).lerp(_c2, t);
        _c1.setHex(k0.sun); _c2.setHex(k1.sun);
        sun.color.copy(_c1).lerp(_c2, t);
        sun.intensity = lerp(k0.sunI, k1.sunI, t);
        ambient.intensity = lerp(k0.amb, k1.amb, t);
        hemi.intensity = lerp(k0.hemi, k1.hemi, t);
    }

    // ============================================================
    // Seat reservations (conf seats + desks)
    // ============================================================
    const seatReservations = new Set();
    function seatKey(floor, wp) { return floor + ":" + wp; }
    function reserveConfSeat(floor) {
        for (let i = 0; i < 4; i++) {
            const k = seatKey(floor, "conf_seat" + i);
            if (!seatReservations.has(k)) { seatReservations.add(k); return "conf_seat" + i; }
        }
        return null;
    }
    function releaseSeat(floor, wp) { seatReservations.delete(seatKey(floor, wp)); }

    // ============================================================
    // Agents
    // ============================================================
    let agents = [];
    let targetOccupancy = DEFAULT_OCCUPANCY;

    // Build worker desk assignments: one per desk across floors 1..5.
    const deskSlots = [];
    for (let f = 1; f < FLOOR_COUNT; f++) {
        const fl = floorByNumber(f);
        for (const d of fl.desks) {
            deskSlots.push({ floor: f, deskId: d.id });
        }
    }

    function makeSchedule(role) {
        const sched = {
            arrivalTime: randInt(8 * 60 + 15, 9 * 60 + 30),
            lunchTime: randInt(11 * 60 + 30, 13 * 60 + 30),
            lunchDuration: randInt(25, 60),
            hasLunched: false,
            plannedMeetingTimes: []
        };
        if (Math.random() < 0.15) {
            sched.departureTime = randInt(18 * 60 + 30, 19 * 60 + 45);
        } else {
            sched.departureTime = randInt(16 * 60 + 45, 18 * 60 + 30);
        }
        // 0..2 planned meetings
        if (role === "WORKER") {
            if (Math.random() < 0.6) sched.plannedMeetingTimes.push(randInt(9 * 60 + 30, 11 * 60));
            if (Math.random() < 0.5) sched.plannedMeetingTimes.push(randInt(13 * 60 + 30, 16 * 60));
        }
        return sched;
    }

    function createAgent(id, role) {
        const group = createPerson({});
        group.visible = false;
        const agent = {
            id: id,
            role: role,
            name: pick(NAMES),
            group: group,
            state: "DISABLED",
            homeFloor: null,
            deskId: null,
            deskWpName: null,
            deskDoorWpName: null,
            currentFloor: 0,
            plan: [],
            currentAction: null,
            boardSpot: null,
            seatFloor: null,
            seatWp: null,
            _prevWp: null,
            _stallT: 0,
            _walkPath: null,
            _walkIdx: 0,
            sched: makeSchedule(role)
        };
        if (role === "WORKER" && id < deskSlots.length) {
            const slot = deskSlots[id];
            agent.homeFloor = slot.floor;
            agent.deskId = slot.deskId;
            agent.deskWpName = slot.deskId + "_desk";
            agent.deskDoorWpName = slot.deskId + "_door";
        }
        scene.add(group);
        return agent;
    }

    function buildPool() {
        agents = [];
        let id = 0;
        for (let i = 0; i < MAX_WORKERS; i++) agents.push(createAgent(id++, "WORKER"));
        for (let i = 0; i < MAX_VISITORS; i++) agents.push(createAgent(id++, "VISITOR"));
        applyOccupancy();
    }

    function countPresent() {
        let n = 0;
        for (const a of agents) {
            if (a.state !== "DISABLED" && a.state !== "AWAY" && a.state !== "GONE") n++;
        }
        return n;
    }

    function applyOccupancy() {
        for (const a of agents) {
            const shouldBeActive = a.id < targetOccupancy;
            if (!shouldBeActive) {
                if (a.state === "AWAY" || a.state === "GONE" || a.state === "DISABLED") {
                    a.state = "DISABLED";
                    a.group.visible = false;
                }
            } else {
                if (a.state === "DISABLED") {
                    a.state = "AWAY";
                }
            }
        }
    }

    // ============================================================
    // Primitive action helpers
    // ============================================================
    function setSimWorldPos(agent, vec) {
        agent.group.position.set(vec.x, vec.y, vec.z);
    }

    function nodePos(floor, wp) {
        const fl = floorByNumber(floor);
        if (fl.nodes[wp]) return fl.nodes[wp].pos.clone();
        return new THREE.Vector3(0, floor * FLOOR_HEIGHT, 0);
    }

    function actionWalkTo(floor, wp) { return { type: "WALK_TO_WP", floor: floor, wp: wp }; }
    function actionWaitPanel(floor, dir, toFloor) { return { type: "WAIT_AT_PANEL", floor: floor, dir: dir, toFloor: toFloor }; }
    function actionEnter(toFloor) { return { type: "ENTER_ELEVATOR", toFloor: toFloor }; }
    function actionPress(floor) { return { type: "PRESS_FLOOR", floor: floor }; }
    function actionWaitFloor(floor) { return { type: "WAIT_FOR_FLOOR", floor: floor }; }
    function actionExit(toFloor) { return { type: "EXIT_ELEVATOR", toFloor: toFloor }; }
    function actionSit(floor, wp) { return { type: "SIT", floor: floor, wp: wp }; }
    function actionStand() { return { type: "STAND" }; }
    function actionReleaseSeat() { return { type: "RELEASE_SEAT" }; }
    function actionWaitSim(min) { return { type: "WAIT_SIM", minutes: min }; }
    function actionExitBuilding() { return { type: "EXIT_BUILDING" }; }
    function actionEnterState(s) { return { type: "ENTER_STATE", state: s }; }
    function actionMarkLunched() { return { type: "MARK_LUNCHED" }; }
    function actionPickNext() { return { type: "PICK_NEXT_ACTIVITY" }; }

    // Ride helper: build sequence to travel from `fromFloor` to `toFloor`.
    function rideTo(fromFloor, toFloor) {
        const dir = toFloor > fromFloor ? 1 : -1;
        return [
            actionWalkTo(fromFloor, "elevWait"),
            actionWaitPanel(fromFloor, dir, toFloor),
            actionEnter(toFloor),
            actionPress(toFloor),
            actionWaitFloor(toFloor),
            actionExit(toFloor)
        ];
    }

    // ============================================================
    // Plan compilers
    // ============================================================
    function planArriveToDesk(agent) {
        const plan = [];
        plan.push(actionEnterState("ARRIVING"));
        plan.push(actionWalkTo(0, "outside"));
        plan.push(actionWalkTo(0, "entrance"));
        if (agent.homeFloor !== 0) {
            plan.push.apply(plan, rideTo(0, agent.homeFloor));
        }
        plan.push(actionEnterState("ON_FLOOR"));
        plan.push(actionWalkTo(agent.homeFloor, agent.deskDoorWpName));
        plan.push(actionWalkTo(agent.homeFloor, agent.deskWpName));
        plan.push(actionEnterState("AT_DESK"));
        plan.push(actionSit(agent.homeFloor, agent.deskWpName));
        plan.push(actionWaitSim(randInt(20, 50)));
        plan.push(actionStand());
        plan.push(actionPickNext());
        return plan;
    }

    function planGoToLunch(agent) {
        const plan = [];
        plan.push(actionEnterState("AT_LUNCH"));
        plan.push(actionStand());
        plan.push(actionWalkTo(agent.homeFloor, agent.deskDoorWpName));
        plan.push.apply(plan, rideTo(agent.homeFloor, 0));
        const bistro = "bistro" + randInt(0, 3) + (Math.random() < 0.5 ? "_n" : "_s");
        plan.push(actionWalkTo(0, "cafe_door"));
        plan.push(actionWalkTo(0, bistro));
        plan.push(actionSit(0, bistro));
        plan.push(actionWaitSim(agent.sched.lunchDuration));
        plan.push(actionStand());
        plan.push(actionMarkLunched());
        plan.push.apply(plan, rideTo(0, agent.homeFloor));
        plan.push(actionWalkTo(agent.homeFloor, agent.deskDoorWpName));
        plan.push(actionWalkTo(agent.homeFloor, agent.deskWpName));
        plan.push(actionEnterState("AT_DESK"));
        plan.push(actionSit(agent.homeFloor, agent.deskWpName));
        plan.push(actionWaitSim(randInt(20, 50)));
        plan.push(actionStand());
        plan.push(actionPickNext());
        return plan;
    }

    function planVisitLounge(agent) {
        const plan = [];
        plan.push(actionEnterState("AT_BREAK"));
        plan.push(actionStand());
        plan.push(actionWalkTo(agent.homeFloor, agent.deskDoorWpName));
        const spot = "lounge_spot" + randInt(0, 2);
        plan.push(actionWalkTo(agent.homeFloor, "lounge_door"));
        plan.push(actionWalkTo(agent.homeFloor, spot));
        plan.push(actionSit(agent.homeFloor, spot));
        plan.push(actionWaitSim(randInt(5, 12)));
        plan.push(actionStand());
        plan.push(actionWalkTo(agent.homeFloor, agent.deskDoorWpName));
        plan.push(actionWalkTo(agent.homeFloor, agent.deskWpName));
        plan.push(actionEnterState("AT_DESK"));
        plan.push(actionSit(agent.homeFloor, agent.deskWpName));
        plan.push(actionWaitSim(randInt(15, 40)));
        plan.push(actionStand());
        plan.push(actionPickNext());
        return plan;
    }

    function planAttendMeeting(agent) {
        const meetFloor = Math.random() < 0.65 ? agent.homeFloor : randInt(1, FLOOR_COUNT - 1);
        const seat = reserveConfSeat(meetFloor);
        if (!seat) return planVisitLounge(agent);
        agent.seatFloor = meetFloor; agent.seatWp = seat;
        const plan = [];
        plan.push(actionEnterState("IN_MEETING"));
        plan.push(actionStand());
        plan.push(actionWalkTo(agent.homeFloor, agent.deskDoorWpName));
        if (meetFloor !== agent.homeFloor) {
            plan.push.apply(plan, rideTo(agent.homeFloor, meetFloor));
        }
        plan.push(actionWalkTo(meetFloor, "conf_door"));
        plan.push(actionWalkTo(meetFloor, seat));
        plan.push(actionSit(meetFloor, seat));
        plan.push(actionWaitSim(randInt(22, 45)));
        plan.push(actionStand());
        plan.push(actionReleaseSeat());
        if (meetFloor !== agent.homeFloor) {
            plan.push.apply(plan, rideTo(meetFloor, agent.homeFloor));
        }
        plan.push(actionWalkTo(agent.homeFloor, agent.deskDoorWpName));
        plan.push(actionWalkTo(agent.homeFloor, agent.deskWpName));
        plan.push(actionEnterState("AT_DESK"));
        plan.push(actionSit(agent.homeFloor, agent.deskWpName));
        plan.push(actionWaitSim(randInt(15, 40)));
        plan.push(actionStand());
        plan.push(actionPickNext());
        return plan;
    }

    function planVisitCoworker(agent) {
        const targets = agents.filter((a) => a !== agent && a.state === "AT_DESK" && a.homeFloor != null);
        if (targets.length === 0) return planVisitLounge(agent);
        const t = pick(targets);
        const plan = [];
        plan.push(actionEnterState("ON_FLOOR"));
        plan.push(actionStand());
        plan.push(actionWalkTo(agent.homeFloor, agent.deskDoorWpName));
        if (t.homeFloor !== agent.homeFloor) {
            plan.push.apply(plan, rideTo(agent.homeFloor, t.homeFloor));
        }
        plan.push(actionWalkTo(t.homeFloor, t.deskDoorWpName));
        plan.push(actionSit(t.homeFloor, t.deskDoorWpName));
        plan.push(actionWaitSim(randInt(6, 18)));
        plan.push(actionStand());
        if (t.homeFloor !== agent.homeFloor) {
            plan.push.apply(plan, rideTo(t.homeFloor, agent.homeFloor));
        }
        plan.push(actionWalkTo(agent.homeFloor, agent.deskDoorWpName));
        plan.push(actionWalkTo(agent.homeFloor, agent.deskWpName));
        plan.push(actionEnterState("AT_DESK"));
        plan.push(actionSit(agent.homeFloor, agent.deskWpName));
        plan.push(actionWaitSim(randInt(15, 40)));
        plan.push(actionStand());
        plan.push(actionPickNext());
        return plan;
    }

    function planLeaveBuilding(agent) {
        const plan = [];
        plan.push(actionEnterState("LEAVING"));
        plan.push(actionStand());
        if (agent.homeFloor && agent.homeFloor !== 0) {
            plan.push(actionWalkTo(agent.homeFloor, agent.deskDoorWpName));
            plan.push.apply(plan, rideTo(agent.homeFloor, 0));
        }
        plan.push(actionWalkTo(0, "entrance"));
        plan.push(actionWalkTo(0, "outside"));
        plan.push(actionExitBuilding());
        return plan;
    }

    function planVisitorVisit(agent) {
        const plan = [];
        plan.push(actionEnterState("VISITING"));
        plan.push(actionWalkTo(0, "outside"));
        plan.push(actionWalkTo(0, "entrance"));

        const r = Math.random();
        if (r < 0.10) {
            // bistro table
            const b = "bistro" + randInt(0, 3) + (Math.random() < 0.5 ? "_n" : "_s");
            plan.push(actionWalkTo(0, "cafe_door"));
            plan.push(actionWalkTo(0, b));
            plan.push(actionSit(0, b));
            plan.push(actionWaitSim(randInt(8, 20)));
            plan.push(actionStand());
        } else if (r < 0.16) {
            // cafe counter
            plan.push(actionWalkTo(0, "cafe_door"));
            plan.push(actionWalkTo(0, "cafe_order"));
            plan.push(actionSit(0, "cafe_order"));
            plan.push(actionWaitSim(randInt(3, 8)));
            plan.push(actionStand());
        } else if (r < 0.30) {
            // front lounge
            const s = "flounge" + randInt(0, 2);
            plan.push(actionWalkTo(0, s));
            plan.push(actionSit(0, s));
            plan.push(actionWaitSim(randInt(8, 18)));
            plan.push(actionStand());
        } else if (r < 0.42) {
            // back lounge / pit
            const opts = ["back_lounge_N", "back_lounge_S", "pit_N", "pit_S", "pit_E", "pit_W"];
            const s = pick(opts);
            plan.push(actionWalkTo(0, s));
            plan.push(actionSit(0, s));
            plan.push(actionWaitSim(randInt(8, 18)));
            plan.push(actionStand());
        } else if (r < 0.52) {
            // reception / kiosk / water cooler stand
            const s = pick(["reception", "kiosk", "lobby_wc_front", "lobby_wc_back"]);
            plan.push(actionWalkTo(0, s));
            plan.push(actionSit(0, s));
            plan.push(actionWaitSim(randInt(3, 8)));
            plan.push(actionStand());
        } else if (r < 0.62) {
            // lobby loiter
            const s = pick(["lobby_stand_center", "lobby_stand_NE", "lobby_stand_NW",
                "lobby_stand_midE", "lobby_stand_midW", "lobby_stand_entry"]);
            plan.push(actionWalkTo(0, s));
            plan.push(actionSit(0, s));
            plan.push(actionWaitSim(randInt(4, 12)));
            plan.push(actionStand());
        } else if (r < 0.77) {
            // ride up to an office-floor lounge
            const f = randInt(1, FLOOR_COUNT - 1);
            plan.push.apply(plan, rideTo(0, f));
            const opts = ["lounge_spot0", "lounge_spot1", "lounge_spot2", "water_cooler", "hall_stand_N", "hall_stand_S"];
            const s = pick(opts);
            plan.push(actionWalkTo(f, s));
            plan.push(actionSit(f, s));
            plan.push(actionWaitSim(randInt(6, 16)));
            plan.push(actionStand());
            plan.push.apply(plan, rideTo(f, 0));
        } else {
            // sit in on a meeting
            const f = randInt(1, FLOOR_COUNT - 1);
            const seat = reserveConfSeat(f);
            if (!seat) {
                const s = pick(["lobby_stand_center", "lobby_stand_NE", "lobby_stand_NW"]);
                plan.push(actionWalkTo(0, s));
                plan.push(actionSit(0, s));
                plan.push(actionWaitSim(randInt(5, 12)));
                plan.push(actionStand());
            } else {
                agent.seatFloor = f; agent.seatWp = seat;
                plan.push.apply(plan, rideTo(0, f));
                plan.push(actionWalkTo(f, "conf_door"));
                plan.push(actionWalkTo(f, seat));
                plan.push(actionSit(f, seat));
                plan.push(actionWaitSim(randInt(15, 35)));
                plan.push(actionStand());
                plan.push(actionReleaseSeat());
                plan.push.apply(plan, rideTo(f, 0));
            }
        }

        plan.push(actionWalkTo(0, "entrance"));
        plan.push(actionWalkTo(0, "outside"));
        plan.push(actionExitBuilding());
        return plan;
    }

    function chooseNextActivity(agent) {
        const t = Clock.simMinute;
        if (t >= agent.sched.departureTime) return planLeaveBuilding(agent);
        // planned meeting due
        for (let i = 0; i < agent.sched.plannedMeetingTimes.length; i++) {
            if (t >= agent.sched.plannedMeetingTimes[i]) {
                agent.sched.plannedMeetingTimes.splice(i, 1);
                return planAttendMeeting(agent);
            }
        }
        if (t >= agent.sched.lunchTime && !agent.sched.hasLunched) {
            return planGoToLunch(agent);
        }
        const r = Math.random();
        if (r < MEETING_PROB * 0.4) return planAttendMeeting(agent);
        if (r < MEETING_PROB * 0.4 + 0.12) return planVisitLounge(agent);
        if (r < MEETING_PROB * 0.4 + 0.12 + 0.15) return planVisitCoworker(agent);
        return [actionWaitSim(randInt(18, 65)), actionStand(), actionPickNext()];
    }

    // ============================================================
    // Action execution
    // ============================================================
    function startAction(agent, action) {
        agent.currentAction = action;
        switch (action.type) {
            case "WALK_TO_WP": {
                const fromPos = agent.group.position.clone();
                // find nearest node on this floor as start? use BFS from a synthetic.
                const fl = floorByNumber(action.floor);
                let startWp = nearestNode(fl, fromPos);
                const path = world.bfsPath(fl.nodes, startWp, action.wp);
                // prepend current position so the first segment starts where we are
                agent._walkPath = [fromPos].concat(path);
                agent._walkIdx = 0;
                agent._prevWp = null;
                agent._stallT = 0;
                break;
            }
            case "WAIT_AT_PANEL":
                // press immediately
                if (action.dir > 0) elevator.callUp(action.floor);
                else elevator.callDown(action.floor);
                break;
            case "ENTER_ELEVATOR":
                agent._enterPhase = "reserve";
                agent._stallT = 0;
                agent._prevWalk = null;
                break;
            case "WAIT_SIM":
                action.untilMin = Clock.simMinute + action.minutes;
                break;
        }
    }

    function nearestNode(fl, pos) {
        let best = null, bestD = Infinity;
        for (const name in fl.nodes) {
            const d = fl.nodes[name].pos.distanceToSquared(pos);
            if (d < bestD) { bestD = d; best = name; }
        }
        return best;
    }

    // Walk agent along its path. Returns true when done.
    function walkAlongPath(agent, motionDt) {
        const path = agent._walkPath;
        if (!path || agent._walkIdx >= path.length - 1) {
            agent.group.userData.isWalking = false;
            return true;
        }
        agent.group.userData.isWalking = true;
        const target = path[agent._walkIdx + 1];
        const pos = agent.group.position;
        const dx = target.x - pos.x, dz = target.z - pos.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        const step = WALK_SPEED * motionDt;

        // stall detection
        if (agent._prevWp == null) agent._prevWp = pos.clone();
        const prog = pos.distanceTo(agent._prevWp);
        if (prog < 0.005) {
            agent._stallT += motionDt;
            if (agent._stallT > 1.2) {
                agent._walkIdx++;
                agent._stallT = 0;
                agent._prevWp = pos.clone();
                return agent._walkIdx >= path.length - 1;
            }
        } else {
            agent._stallT = 0;
        }
        agent._prevWp.copy(pos);

        if (dist <= step || dist < 0.01) {
            pos.x = target.x; pos.z = target.z;
            pos.y = target.y;
            agent._walkIdx++;
            if (agent._walkIdx >= path.length - 1) {
                agent.group.userData.isWalking = false;
                return true;
            }
            return false;
        }
        const nx = dx / dist, nz = dz / dist;
        pos.x += nx * step;
        pos.z += nz * step;
        pos.y = target.y;
        agent.group.rotation.y = Math.atan2(nx, nz);
        return false;
    }

    // ENTER_ELEVATOR phased handler. Returns true when boarded.
    function handleEnterElevator(agent, action, motionDt) {
        const phase = agent._enterPhase;
        if (phase === "reserve") {
            if (!agent.boardSpot) {
                const dir = action.toFloor > agent.currentFloor ? 1 : -1;
                // ensure call is still pressed
                if (dir > 0) elevator.callUp(agent.currentFloor); else elevator.callDown(agent.currentFloor);
                if (elevator.isAcceptingAt(agent.currentFloor, dir)) {
                    const spot = elevator.reserveBoardingSpot(agent);
                    if (spot) {
                        agent.boardSpot = spot;
                        agent._enterPhase = "toDoor";
                        agent._stallT = 0;
                        agent._prevWalk = agent.group.position.clone();
                    }
                }
            }
            return false;
        }
        if (phase === "toDoor") {
            // walk to door threshold at the spot's X lane
            const spotWorld = elevator.spotWorldPosition(agent.boardSpot);
            const threshZ = WORLD.SHAFT_DEPTH / 2 + 0.4;
            const tx = spotWorld.x, tz = threshZ;
            const pos = agent.group.position;
            const dx = tx - pos.x, dz = tz - pos.z;
            const dist = Math.sqrt(dx * dx + dz * dz);
            const step = WALK_SPEED * motionDt;
            agent.group.userData.isWalking = true;
            // stall recovery
            const prog = pos.distanceTo(agent._prevWalk);
            if (prog < 0.005) { agent._stallT += motionDt; } else { agent._stallT = 0; }
            agent._prevWalk.copy(pos);
            if (dist <= step || dist < 0.05 || agent._stallT > 1.5) {
                pos.x = tx; pos.z = tz;
                agent._enterPhase = "toSpot";
                agent._stallT = 0;
                return false;
            }
            pos.x += dx / dist * step; pos.z += dz / dist * step;
            agent.group.rotation.y = Math.atan2(dx / dist, dz / dist);
            return false;
        }
        if (phase === "toSpot") {
            // reparent scene -> car, preserving world position
            if (agent.group.parent !== elevator.group) {
                const wp = new THREE.Vector3();
                agent.group.getWorldPosition(wp);
                elevator.group.add(agent.group);
                const local = elevator.group.worldToLocal(wp.clone());
                agent.group.position.copy(local);
            }
            const localTarget = elevator.spotLocalPosition(agent.boardSpot);
            const pos = agent.group.position;
            const dx = localTarget.x - pos.x, dz = localTarget.z - pos.z;
            const dist = Math.sqrt(dx * dx + dz * dz);
            const step = WALK_SPEED * motionDt;
            agent.group.userData.isWalking = true;
            if (dist <= step || dist < 0.03) {
                pos.set(localTarget.x, localTarget.y, localTarget.z);
                elevator.completeBoard(agent);
                agent.group.rotation.y = 0; // face doors (+Z)
                agent.group.userData.isWalking = false;
                agent.boardSpot = null;
                return true;
            }
            pos.x += dx / dist * step; pos.z += dz / dist * step;
            return false;
        }
        return false;
    }

    function handleExitElevator(agent, action, motionDt) {
        // reparent car -> scene first time
        if (agent.group.parent === elevator.group) {
            const wp = new THREE.Vector3();
            agent.group.getWorldPosition(wp);
            scene.add(agent.group);
            agent.group.position.copy(wp);
            elevator.registerDisembark(agent);
            agent.currentFloor = action.toFloor;
            agent._exitDone = false;
        }
        // walk to elevWait on target floor
        const target = nodePos(action.toFloor, "elevWait");
        const pos = agent.group.position;
        const dx = target.x - pos.x, dz = target.z - pos.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        const step = WALK_SPEED * motionDt;
        agent.group.userData.isWalking = true;
        if (dist <= step || dist < 0.05) {
            pos.set(target.x, target.y, target.z);
            elevator.completeDisembark(agent);
            agent.group.userData.isWalking = false;
            return true;
        }
        pos.x += dx / dist * step; pos.z += dz / dist * step;
        pos.y = target.y;
        agent.group.rotation.y = Math.atan2(dx / dist, dz / dist);
        return false;
    }

    // Returns true if action complete.
    function updateAction(agent, action, motionDt) {
        switch (action.type) {
            case "WALK_TO_WP":
                return walkAlongPath(agent, motionDt);
            case "WAIT_AT_PANEL": {
                if (action.dir > 0) elevator.callUp(action.floor);
                else elevator.callDown(action.floor);
                if (elevator.isAcceptingAt(action.floor, action.dir)) return true;
                return false;
            }
            case "ENTER_ELEVATOR":
                return handleEnterElevator(agent, action, motionDt);
            case "PRESS_FLOOR":
                elevator.pressDestination(action.floor);
                elevator.lightButton(action.floor);
                return true;
            case "WAIT_FOR_FLOOR":
                return (elevator.state === ElevatorLogic.STATE.DOOR_OPEN && elevator.currentFloor === action.floor);
            case "EXIT_ELEVATOR":
                return handleExitElevator(agent, action, motionDt);
            case "SIT": {
                const fl = floorByNumber(action.floor);
                const target = fl.sitTargets[action.wp];
                const np = nodePos(action.floor, action.wp);
                agent.currentFloor = action.floor;
                if (target && target.sit) {
                    agent.group.position.set(np.x, np.y - 0.35, np.z);
                    agent.group.userData.isSitting = true;
                    agent.group.rotation.y = target.facing;
                } else {
                    // standing waypoint: jitter on a small ring
                    const ang = Math.random() * Math.PI * 2;
                    const rad = randRange(0.35, 0.75);
                    agent.group.position.set(np.x + Math.cos(ang) * rad, np.y, np.z + Math.sin(ang) * rad);
                    agent.group.userData.isSitting = false;
                    if (target) agent.group.rotation.y = target.facing;
                }
                return true;
            }
            case "STAND": {
                agent.group.userData.isSitting = false;
                const insideCar = agent.group.parent === elevator.group;
                const y = insideCar ? 0.04 : (agent.currentFloor * FLOOR_HEIGHT);
                agent.group.position.y = y;
                return true;
            }
            case "RELEASE_SEAT":
                if (agent.seatFloor != null && agent.seatWp != null) {
                    releaseSeat(agent.seatFloor, agent.seatWp);
                    agent.seatFloor = null; agent.seatWp = null;
                }
                return true;
            case "WAIT_SIM":
                if (action.untilMin == null) action.untilMin = Clock.simMinute + action.minutes;
                return Clock.simMinute >= action.untilMin;
            case "EXIT_BUILDING":
                if (agent.group.parent) agent.group.parent.remove(agent.group);
                agent.state = "GONE";
                agent.group.visible = false;
                return true;
            case "ENTER_STATE":
                agent.state = action.state;
                return true;
            case "MARK_LUNCHED":
                agent.sched.hasLunched = true;
                return true;
            case "PICK_NEXT_ACTIVITY":
                agent.plan = chooseNextActivity(agent);
                return true;
        }
        return true;
    }

    // Dispatch loop: process multiple zero-duration transitions per frame.
    function dispatchAgent(agent, motionDt) {
        let guard = 0;
        let dt = motionDt;
        while (guard++ < 16) {
            if (!agent.currentAction) {
                if (agent.plan.length === 0) return;
                const next = agent.plan.shift();
                startAction(agent, next);
            }
            const done = updateAction(agent, agent.currentAction, dt);
            if (done) {
                agent.currentAction = null;
                dt = 0; // subsequent transitions are zero-duration
                continue;
            }
            break;
        }
    }

    // ============================================================
    // Collision resolver
    // ============================================================
    function applyCollisions() {
        const list = agents.filter((a) =>
            a.group.visible &&
            !a.group.userData.isSitting &&
            a.group.parent !== elevator.group &&
            !(a.currentAction && a.currentAction.type === "ENTER_ELEVATOR")
        );
        const PUSH = 0.18;
        for (let i = 0; i < list.length; i++) {
            const a = list[i];
            for (let j = i + 1; j < list.length; j++) {
                const b = list[j];
                if (Math.abs(a.group.position.y - b.group.position.y) > 1.0) continue;
                let dx = a.group.position.x - b.group.position.x;
                let dz = a.group.position.z - b.group.position.z;
                let d = Math.sqrt(dx * dx + dz * dz);
                const minD = 0.7;
                if (d >= minD) continue;
                if (d < 1e-3) {
                    const ang = Math.random() * Math.PI * 2;
                    dx = Math.cos(ang); dz = Math.sin(ang); d = 1e-3;
                }
                const push = (minD - d) * PUSH;
                const nx = dx / d, nz = dz / d;
                a.group.position.x += nx * push; a.group.position.z += nz * push;
                b.group.position.x -= nx * push; b.group.position.z -= nz * push;
            }
        }
    }

    // ============================================================
    // Visitor top-up scheduler
    // ============================================================
    function topUpVisitors() {
        const h = Clock.simMinute / 60;
        if (h < 8 || h > 19) return;
        let deficit = targetOccupancy - countPresent();
        if (deficit <= 0) return;
        for (const a of agents) {
            if (deficit <= 0) break;
            if (a.role !== "VISITOR") continue;
            if (a.id >= targetOccupancy) continue;
            if (a.state === "AWAY" || a.state === "GONE") {
                a.sched.arrivalTime = Clock.simMinute + randInt(0, 6);
                a.sched.lunchDuration = randInt(8, 25);
                a.state = "AWAY";
                a._armed = true;
                deficit--;
            }
        }
    }

    // ============================================================
    // Per-agent schedule processing
    // ============================================================
    function spawnAgent(agent) {
        agent.group.visible = true;
        agent.currentFloor = 0;
        // jitter spawn on sidewalk
        const jx = randRange(-1.1, 1.1), jz = randRange(-0.75, 0.75);
        agent.group.position.set(0 + jx, 0, 12 + jz);
        agent.group.userData.isSitting = false;
        agent.currentAction = null;
        agent.boardSpot = null;
        if (agent.role === "WORKER") {
            agent.plan = planArriveToDesk(agent);
        } else {
            agent.plan = planVisitorVisit(agent);
        }
    }

    function processAgent(agent, motionDt) {
        if (agent.state === "DISABLED" || agent.state === "GONE") return;
        if (agent.state === "AWAY") {
            if (Clock.simMinute >= agent.sched.arrivalTime) {
                spawnAgent(agent);
            }
            return;
        }
        // end-of-day override for workers (visitors run their own plan to completion)
        if (agent.role === "WORKER" && agent.state !== "LEAVING" &&
            Clock.simMinute >= agent.sched.departureTime &&
            !agent._leaving) {
            agent._leaving = true;
            // release any seat held
            if (agent.seatFloor != null && agent.seatWp != null) {
                releaseSeat(agent.seatFloor, agent.seatWp);
                agent.seatFloor = null; agent.seatWp = null;
            }
            agent.plan = planLeaveBuilding(agent);
            agent.currentAction = null;
        }
        dispatchAgent(agent, motionDt);
    }

    // ============================================================
    // Day wrap reset
    // ============================================================
    function onDayWrap() {
        // reset elevator fully
        elevator.reset();
        seatReservations.clear();
        for (const a of agents) {
            // remove from scene parent if mid-ride
            if (a.group.parent === elevator.group) {
                scene.add(a.group);
            }
            a.sched = makeSchedule(a.role);
            a.currentAction = null;
            a.plan = [];
            a.boardSpot = null;
            a.seatFloor = null; a.seatWp = null;
            a._leaving = false;
            a.group.userData.isSitting = false;
            a.group.visible = false;
            if (a.id < targetOccupancy) {
                a.state = "AWAY";
            } else {
                a.state = "DISABLED";
            }
        }
    }

    // ============================================================
    // HUD
    // ============================================================
    const hud = document.createElement("div");
    hud.style.cssText = "position:fixed;top:8px;left:8px;background:rgba(10,12,24,0.82);color:#cde;" +
        "font-family:monospace;font-size:12px;padding:10px;border-radius:6px;z-index:10;min-width:240px;line-height:1.4";
    document.body.appendChild(hud);

    const timeDisplay = document.createElement("div");
    timeDisplay.style.cssText = "font-size:26px;font-weight:bold;color:#ffdd88;margin-bottom:6px";
    hud.appendChild(timeDisplay);

    function makeSlider(label, min, max, val) {
        const wrap = document.createElement("div");
        wrap.style.marginBottom = "6px";
        const lab = document.createElement("div");
        lab.textContent = label;
        const input = document.createElement("input");
        input.type = "range";
        input.min = min; input.max = max; input.value = val;
        input.style.width = "100%";
        wrap.appendChild(lab); wrap.appendChild(input);
        hud.appendChild(wrap);
        return { input: input, label: lab };
    }

    // Speed slider: log-spaced 1..600
    const speedSlider = makeSlider("Speed: 120x", 0, 1000, Math.round(1000 * Math.log(120) / Math.log(600)));
    speedSlider.input.addEventListener("input", function () {
        const frac = speedSlider.input.value / 1000;
        const v = Math.round(Math.pow(600, frac));
        Clock.timeScale = Math.max(1, v);
        speedSlider.label.textContent = "Speed: " + Clock.timeScale + "x";
    });

    const occSlider = makeSlider("Occupancy: " + DEFAULT_OCCUPANCY + " / 100 people", 1, MAX_OCCUPANCY, DEFAULT_OCCUPANCY);
    occSlider.input.addEventListener("input", function () {
        targetOccupancy = parseInt(occSlider.input.value, 10);
        occSlider.label.textContent = "Occupancy: " + targetOccupancy + " / 100 people";
        applyOccupancy();
    });

    const stats = document.createElement("div");
    stats.style.cssText = "margin-top:6px;font-size:11px";
    hud.appendChild(stats);

    function updateHUD() {
        timeDisplay.textContent = Clock.format();
        const counts = {};
        for (const a of agents) {
            counts[a.state] = (counts[a.state] || 0) + 1;
        }
        const order = ["AWAY", "ARRIVING", "ON_FLOOR", "AT_DESK", "IN_MEETING", "AT_BREAK",
            "AT_LUNCH", "VISITING", "LEAVING", "GONE", "DISABLED"];
        let s = "<b>Present: " + countPresent() + " / " + targetOccupancy + "</b><br>";
        for (const k of order) {
            if (counts[k]) s += k + ": " + counts[k] + "<br>";
        }
        s += "<br><b>Elevator</b><br>";
        s += "floor " + elevator.currentFloor + " dir " +
            (elevator.direction > 0 ? "UP" : elevator.direction < 0 ? "DOWN" : "-") + "<br>";
        s += "state " + elevator.state + "<br>";
        s += "pax " + elevator.passengers.size + " pend " + elevator.pendingBoarders.size + "<br>";
        s += "dest {" + Array.from(elevator.destinations).join(",") + "}<br>";
        s += "up {" + Array.from(elevator.upCalls).join(",") + "} down {" + Array.from(elevator.downCalls).join(",") + "}";
        stats.innerHTML = s;
    }

    // ============================================================
    // Render loop
    // ============================================================
    buildPool();

    function animate() {
        requestAnimationFrame(animate);
        const realDt = Math.min(0.05, Clock.threeClock.getDelta());
        Clock.tick(realDt);
        updateLighting();
        const motionDt = realDt * Clock.timeScale;

        elevator.tick(motionDt);
        topUpVisitors();

        for (const a of agents) {
            processAgent(a, motionDt);
        }
        applyCollisions();

        for (const a of agents) {
            if (a.group.visible) animatePersonWalking(a.group, motionDt);
        }

        controls.update();
        renderer.render(scene, camera);
        updateHUD();
    }
    animate();
})();
