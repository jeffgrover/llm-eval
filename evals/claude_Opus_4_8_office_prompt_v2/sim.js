// sim.js — simulated clock, day/night lighting, agent state machine + daily
// schedules, render loop, collisions, and HUD. Depends on person.js, world.js,
// elevator_logic.js, elevator.js (all loaded before this).
(function () {
    "use strict";

    const WORLD = window.WORLD;
    const FH = WORLD.FLOOR_HEIGHT;
    const FLOOR_COUNT = WORLD.FLOOR_COUNT;

    // ---- tunables ---------------------------------------------------------
    const MAX_WORKERS = 20;
    const MAX_VISITORS = 80;
    const MAX_OCCUPANCY = MAX_WORKERS + MAX_VISITORS;   // 100
    const DEFAULT_OCCUPANCY = 45;
    const WALK_SPEED = 1.35;          // m/s of sim time
    const ARRIVE_EPS = 0.18;
    const MEETING_PROB = 0.36;

    const PRESENT_STATES = {
        ARRIVING: 1, WAITING_ELEVATOR: 1, IN_CAR: 1, ON_FLOOR: 1, AT_DESK: 1,
        IN_MEETING: 1, AT_BREAK: 1, AT_LUNCH: 1, VISITING: 1, LEAVING: 1,
    };
    const SETTLED_STATES = { AT_DESK: 1, IN_MEETING: 1, AT_BREAK: 1, VISITING: 1 };

    const NAMES = ["Ava", "Ben", "Cara", "Dan", "Eve", "Finn", "Gia", "Hal", "Ivy",
        "Jon", "Kim", "Leo", "Mia", "Ned", "Ola", "Pia", "Quinn", "Rex", "Sia",
        "Tom", "Uma", "Vic", "Wes", "Xena", "Yas", "Zoe", "Amy", "Cole", "Drew",
        "Elle", "Gus", "Hana", "Ian", "Jade", "Kai", "Luca", "Maya", "Nia"];

    // ---- random helpers ---------------------------------------------------
    function randInt(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
    function randRange(a, b) { return a + Math.random() * (b - a); }
    function choice(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

    // ---- three.js scene ---------------------------------------------------
    let scene, camera, renderer, controls;
    let ambient, sun, hemi;
    let world, elevator, lobby;
    let agents = [];
    let targetOccupancy = DEFAULT_OCCUPANCY;
    const seatReservations = new Set();
    const _v = new THREE.Vector3();

    function floorByNum(n) { return world.floors[n]; }

    // ---- simulated clock --------------------------------------------------
    const Clock = {
        simMinute: 7 * 60 + 30,
        timeScale: 120,
        tick: function (realDt) {
            this.simMinute += realDt * this.timeScale / 60;
            if (this.simMinute >= 24 * 60) { this.simMinute -= 24 * 60; dayReset(); }
        },
        format: function () {
            let m = Math.floor(this.simMinute);
            let h = Math.floor(m / 60) % 24, mm = m % 60;
            const ap = h < 12 ? "AM" : "PM";
            let hr = h % 12; if (hr === 0) hr = 12;
            return (hr < 10 ? " " : "") + hr + ":" + (mm < 10 ? "0" : "") + mm + " " + ap;
        },
    };

    // ---- day / night lighting --------------------------------------------
    const SKY = [
        { h: 0.0, bg: 0x0a0e1a, sun: 0x223355, sunI: 0.05, ambI: 0.45, hemiI: 0.32 },
        { h: 5.5, bg: 0x0c1020, sun: 0x33446a, sunI: 0.08, ambI: 0.45, hemiI: 0.32 },
        { h: 6.0, bg: 0x3a405a, sun: 0xff8844, sunI: 0.45, ambI: 0.52, hemiI: 0.42 },
        { h: 6.5, bg: 0x9fc4ef, sun: 0xfff4d6, sunI: 1.0, ambI: 0.72, hemiI: 0.6 },
        { h: 12.0, bg: 0xa8cef5, sun: 0xffffff, sunI: 1.1, ambI: 0.78, hemiI: 0.66 },
        { h: 17.0, bg: 0x9fc4ef, sun: 0xfff0cc, sunI: 1.0, ambI: 0.72, hemiI: 0.6 },
        { h: 17.8, bg: 0x8a9ac0, sun: 0xffaa66, sunI: 0.7, ambI: 0.62, hemiI: 0.5 },
        { h: 18.5, bg: 0x3a3a55, sun: 0xcc6644, sunI: 0.3, ambI: 0.52, hemiI: 0.42 },
        { h: 19.5, bg: 0x12162a, sun: 0x33446a, sunI: 0.08, ambI: 0.45, hemiI: 0.32 },
        { h: 24.0, bg: 0x0a0e1a, sun: 0x223355, sunI: 0.05, ambI: 0.45, hemiI: 0.32 },
    ];
    const _cA = new THREE.Color(), _cB = new THREE.Color();
    function updateLighting() {
        const h = Clock.simMinute / 60;
        let a = SKY[0], b = SKY[SKY.length - 1];
        for (let i = 0; i < SKY.length - 1; i++) {
            if (h >= SKY[i].h && h <= SKY[i + 1].h) { a = SKY[i]; b = SKY[i + 1]; break; }
        }
        const t = b.h === a.h ? 0 : (h - a.h) / (b.h - a.h);
        scene.background.copy(_cA.setHex(a.bg)).lerp(_cB.setHex(b.bg), t);
        sun.color.copy(_cA.setHex(a.sun)).lerp(_cB.setHex(b.sun), t);
        sun.intensity = a.sunI + (b.sunI - a.sunI) * t;
        ambient.intensity = a.ambI + (b.ambI - a.ambI) * t;
        hemi.intensity = a.hemiI + (b.hemiI - a.hemiI) * t;
    }

    // ---- agents -----------------------------------------------------------
    function makeAgent(id, role) {
        const g = window.createPerson({});
        g.visible = false;
        const a = {
            id: id, role: role, name: choice(NAMES), group: g,
            state: "DISABLED", plan: [], currentAction: null, _started: false,
            currentFloor: 0, currentWp: "outside",
            homeFloor: null, deskId: null, deskWpName: null, deskDoorWpName: null,
            hasLunched: false, plannedMeetingTimes: [],
            arrivalTime: 0, lunchTime: 0, lunchDuration: 30, departureTime: 0,
            visitDuration: 20, _headingHome: false, _reservedSeat: null,
            _spot: null, _enterPhase: 0, _exitPhase: 0,
            _walkPath: null, _walkIdx: 0, _stallT: 0, _walkPrev: new THREE.Vector3(),
            _untilMin: 0,
        };
        return a;
    }

    function initSchedule(a) {
        a.hasLunched = false;
        a.plannedMeetingTimes = [];
        a._headingHome = false;
        a._reservedSeat = null;
        if (a.role === "WORKER") {
            a.arrivalTime = randInt(8 * 60 + 15, 9 * 60 + 30);
            a.lunchTime = randInt(11 * 60 + 30, 13 * 60 + 30);
            a.lunchDuration = randInt(25, 60);
            if (Math.random() < 0.15) a.departureTime = randInt(18 * 60 + 30, 19 * 60 + 45);
            else a.departureTime = randInt(16 * 60 + 45, 18 * 60 + 30);
            if (Math.random() < 0.5) a.plannedMeetingTimes.push(randInt(9 * 60 + 30, 11 * 60));
            if (Math.random() < 0.5) a.plannedMeetingTimes.push(randInt(13 * 60 + 30, 16 * 60));
        } else {
            a.arrivalTime = randInt(8 * 60, 17 * 60);
            a.visitDuration = randInt(10, 40);
        }
    }

    function buildAgents() {
        agents = [];
        // workers (ids 0..19) get a desk each
        const desks = [];
        for (let f = 1; f < FLOOR_COUNT; f++) {
            floorByNum(f).desks.forEach(function (d) { desks.push(d); });
        }
        for (let i = 0; i < MAX_WORKERS; i++) {
            const a = makeAgent(i, "WORKER");
            const d = desks[i % desks.length];
            a.homeFloor = d.floor; a.deskId = i;
            a.deskWpName = d.deskWpName; a.deskDoorWpName = d.doorWpName;
            initSchedule(a);
            scene.add(a.group);
            agents.push(a);
        }
        for (let i = 0; i < MAX_VISITORS; i++) {
            const a = makeAgent(MAX_WORKERS + i, "VISITOR");
            initSchedule(a);
            scene.add(a.group);
            agents.push(a);
        }
    }

    function enabled(a) { return a.id < targetOccupancy; }
    function countPresent() {
        let n = 0;
        for (let i = 0; i < agents.length; i++) if (PRESENT_STATES[agents[i].state]) n++;
        return n;
    }

    function applyOccupancy() {
        for (let i = 0; i < agents.length; i++) {
            const a = agents[i];
            if (enabled(a)) {
                if (a.state === "DISABLED") { a.state = "AWAY"; }
            } else {
                if (a.state === "AWAY" || a.state === "GONE") {
                    a.state = "DISABLED"; hideAgent(a);
                }
            }
        }
    }

    function hideAgent(a) {
        if (a.group.parent) a.group.parent.remove(a.group);
        a.group.visible = false;
        a.plan = []; a.currentAction = null; a._started = false;
    }

    function spawnAgent(a) {
        // place on the sidewalk with jitter so simultaneous arrivals don't pile up
        const s = lobby.spawnSpot;
        a.group.position.set(s.x + randRange(-1.1, 1.1), 0, s.z + randRange(-0.75, 0.75));
        a.group.rotation.y = Math.PI;       // facing into the building (-Z)
        a.group.visible = true;
        a.group.userData.isSitting = false; a.group.userData.isWalking = false;
        if (a.group.parent !== scene) scene.add(a.group);
        a.currentFloor = 0; a.currentWp = "outside";
        a._headingHome = false; a._reservedSeat = null;
        a.currentAction = null; a._started = false;
        a.state = "ARRIVING";          // leave AWAY so we don't respawn every frame
        a.plan = a.role === "WORKER" ? planArriveToDesk(a) : planVisitorVisit(a);
    }

    // ---- seat reservation -------------------------------------------------
    function seatKey(floor, wp) { return floor + ":" + wp; }
    function reserveSeat(a, floor, wp) {
        const k = seatKey(floor, wp);
        if (seatReservations.has(k)) return false;
        seatReservations.add(k); a._reservedSeat = { floor: floor, wp: wp };
        return true;
    }
    function pickSeat(a, floor, list) {
        const order = list.slice();
        for (let i = order.length - 1; i > 0; i--) { const j = randInt(0, i); const t = order[i]; order[i] = order[j]; order[j] = t; }
        for (let i = 0; i < order.length; i++) {
            if (reserveSeat(a, floor, order[i])) return order[i];
        }
        return null;
    }
    function releaseSeat(a) {
        if (a._reservedSeat) {
            seatReservations.delete(seatKey(a._reservedSeat.floor, a._reservedSeat.wp));
            a._reservedSeat = null;
        }
    }

    // ---- plan building blocks --------------------------------------------
    function A(type, props) { return Object.assign({ type: type }, props || {}); }

    function rideElevator(fromF, toF) {
        const dir = toF > fromF ? 1 : -1;
        return [
            A("WALK_TO_WP", { floor: fromF, wp: "elevWait" }),
            A("ENTER_STATE", { state: "WAITING_ELEVATOR" }),
            A("WAIT_AT_PANEL", { floor: fromF, dir: dir, toFloor: toF }),
            A("ENTER_ELEVATOR", { toFloor: toF }),
            A("ENTER_STATE", { state: "IN_CAR" }),
            A("PRESS_FLOOR", { floor: toF }),
            A("WAIT_FOR_FLOOR", { floor: toF }),
            A("EXIT_ELEVATOR", { toFloor: toF }),
            A("ENTER_STATE", { state: "ON_FLOOR" }),
        ];
    }

    function planArriveToDesk(a) {
        let p = [A("ENTER_STATE", { state: "ARRIVING" }),
        A("WALK_TO_WP", { floor: 0, wp: "entrance" })];
        p = p.concat(rideElevator(0, a.homeFloor));
        p = p.concat([
            A("WALK_TO_WP", { floor: a.homeFloor, wp: a.deskDoorWpName }),
            A("WALK_TO_WP", { floor: a.homeFloor, wp: a.deskWpName }),
            A("ENTER_STATE", { state: "AT_DESK" }),
            A("SIT", { floor: a.homeFloor, wp: a.deskWpName }),
            A("WAIT_SIM", { minutes: randInt(12, 35) }),
            A("STAND"),
            A("PICK_NEXT_ACTIVITY"),
        ]);
        return p;
    }

    function keepWorking(a) {
        return [
            A("SIT", { floor: a.homeFloor, wp: a.deskWpName }),
            A("ENTER_STATE", { state: "AT_DESK" }),
            A("WAIT_SIM", { minutes: randInt(18, 65) }),
            A("STAND"),
            A("PICK_NEXT_ACTIVITY"),
        ];
    }

    function backToDeskTail(a, waitMin) {
        return [
            A("WALK_TO_WP", { floor: a.homeFloor, wp: a.deskWpName }),
            A("ENTER_STATE", { state: "AT_DESK" }),
            A("SIT", { floor: a.homeFloor, wp: a.deskWpName }),
            A("WAIT_SIM", { minutes: waitMin }),
            A("STAND"),
            A("PICK_NEXT_ACTIVITY"),
        ];
    }

    function planGoToLunch(a) {
        const seat = pickSeat(a, 0, lobby.cafeSpots);
        let p = [A("STAND")];
        p = p.concat(rideElevator(a.homeFloor, 0));
        if (seat) {
            p = p.concat([
                A("WALK_TO_WP", { floor: 0, wp: seat }),
                A("ENTER_STATE", { state: "AT_LUNCH" }),
                A("SIT", { floor: 0, wp: seat }),
                A("WAIT_SIM", { minutes: a.lunchDuration }),
                A("STAND"),
                A("RELEASE_SEAT"),
                A("MARK_LUNCHED"),
            ]);
        } else {
            p = p.concat([
                A("WALK_TO_WP", { floor: 0, wp: choice(lobby.loiterSpots) }),
                A("ENTER_STATE", { state: "AT_LUNCH" }),
                A("WAIT_SIM", { minutes: Math.min(20, a.lunchDuration) }),
                A("MARK_LUNCHED"),
            ]);
        }
        p = p.concat(rideElevator(0, a.homeFloor));
        p = p.concat(backToDeskTail(a, randInt(15, 40)));
        return p;
    }

    function planVisitLounge(a) {
        const fl = floorByNum(a.homeFloor);
        const seat = pickSeat(a, a.homeFloor, fl.loungeSpots);
        if (!seat) return keepWorking(a);
        return [
            A("STAND"),
            A("WALK_TO_WP", { floor: a.homeFloor, wp: seat }),
            A("ENTER_STATE", { state: "AT_BREAK" }),
            A("SIT", { floor: a.homeFloor, wp: seat }),
            A("WAIT_SIM", { minutes: randInt(5, 12) }),
            A("STAND"),
            A("RELEASE_SEAT"),
        ].concat(backToDeskTail(a, randInt(15, 35)));
    }

    function planAttendMeeting(a) {
        const mf = Math.random() < 0.65 ? a.homeFloor : randInt(1, FLOOR_COUNT - 1);
        const seat = pickSeat(a, mf, floorByNum(mf).confSeats);
        if (!seat) return planVisitLounge(a);
        let p = [A("STAND")];
        if (mf !== a.currentFloor) p = p.concat(rideElevator(a.currentFloor, mf));
        p = p.concat([
            A("WALK_TO_WP", { floor: mf, wp: seat }),
            A("ENTER_STATE", { state: "IN_MEETING" }),
            A("SIT", { floor: mf, wp: seat }),
            A("WAIT_SIM", { minutes: randInt(22, 45) }),
            A("STAND"),
            A("RELEASE_SEAT"),
        ]);
        if (mf !== a.homeFloor) p = p.concat(rideElevator(mf, a.homeFloor));
        p = p.concat(backToDeskTail(a, randInt(10, 30)));
        return p;
    }

    function planVisitCoworker(a) {
        const candidates = agents.filter(function (o) {
            return o !== a && o.role === "WORKER" && o.state === "AT_DESK";
        });
        if (!candidates.length) return keepWorking(a);
        const t = choice(candidates);
        const tf = t.homeFloor, doorWp = t.deskDoorWpName;
        let p = [A("STAND")];
        if (tf !== a.currentFloor) p = p.concat(rideElevator(a.currentFloor, tf));
        p = p.concat([
            A("WALK_TO_WP", { floor: tf, wp: doorWp }),
            A("ENTER_STATE", { state: "VISITING" }),
            A("SIT", { floor: tf, wp: doorWp }),     // stand-and-chat (door has no sit target → stand+jitter)
            A("WAIT_SIM", { minutes: randInt(6, 18) }),
            A("STAND"),
        ]);
        if (tf !== a.homeFloor) p = p.concat(rideElevator(tf, a.homeFloor));
        p = p.concat(backToDeskTail(a, randInt(10, 25)));
        return p;
    }

    function planLeaveBuilding(a) {
        let p = [A("STAND")];
        if (a.currentFloor !== 0) p = p.concat(rideElevator(a.currentFloor, 0));
        p = p.concat([
            A("ENTER_STATE", { state: "LEAVING" }),
            A("WALK_TO_WP", { floor: 0, wp: "entrance" }),
            A("WALK_TO_WP", { floor: 0, wp: "outside" }),
            A("EXIT_BUILDING"),
        ]);
        return p;
    }

    // visitor activities (each must end with the visitor back on floor 0)
    function standAt(floor, wp, lo, hi) {
        return [A("WALK_TO_WP", { floor: floor, wp: wp }),
        A("SIT", { floor: floor, wp: wp }),
        A("WAIT_SIM", { minutes: randInt(lo, hi) }),
        A("STAND")];
    }
    function sitAt(a, floor, wp, lo, hi, stateName) {
        return [A("WALK_TO_WP", { floor: floor, wp: wp }),
        A("ENTER_STATE", { state: stateName || "VISITING" }),
        A("SIT", { floor: floor, wp: wp }),
        A("WAIT_SIM", { minutes: randInt(lo, hi) }),
        A("STAND"),
        A("RELEASE_SEAT")];
    }

    function visitorActivity(a) {
        const r = Math.random();
        // weighted die (see prompt). Cumulative thresholds:
        if (r < 0.10) {                               // bistro table
            const s = pickSeat(a, 0, lobby.cafeSpots);
            return s ? sitAt(a, 0, s, 8, 20) : standAt(0, choice(lobby.loiterSpots), 4, 9);
        } else if (r < 0.16) {                        // cafe counter
            return standAt(0, "cafe_order", 3, 8);
        } else if (r < 0.30) {                        // front lounge
            const s = pickSeat(a, 0, lobby.frontLoungeSpots);
            return s ? sitAt(a, 0, s, 8, 20) : standAt(0, choice(lobby.loiterSpots), 4, 9);
        } else if (r < 0.42) {                        // back lounge / conversation pit
            const s = pickSeat(a, 0, lobby.backLoungeSpots.concat(lobby.pitSpots));
            return s ? sitAt(a, 0, s, 8, 20) : standAt(0, choice(lobby.loiterSpots), 4, 9);
        } else if (r < 0.52) {                        // reception / kiosk / cooler (stand briefly)
            return standAt(0, choice(lobby.standSpots), 3, 8);
        } else if (r < 0.62) {                        // lobby loiter
            return standAt(0, choice(lobby.loiterSpots), 4, 12);
        } else if (r < 0.77) {                        // ride up to an office-floor lounge
            const f = randInt(1, FLOOR_COUNT - 1);
            const s = pickSeat(a, f, floorByNum(f).loungeSpots);
            if (!s) return standAt(0, choice(lobby.loiterSpots), 4, 9);
            return rideElevator(0, f)
                .concat(sitAt(a, f, s, 8, 18))
                .concat(rideElevator(f, 0));
        } else {                                      // sit in on a meeting (client archetype)
            const f = randInt(1, FLOOR_COUNT - 1);
            const s = pickSeat(a, f, floorByNum(f).confSeats);
            if (!s) return standAt(0, choice(lobby.loiterSpots), 4, 9);
            return rideElevator(0, f)
                .concat(sitAt(a, f, s, 15, 35, "IN_MEETING"))
                .concat(rideElevator(f, 0));
        }
    }

    function planVisitorVisit(a) {
        let p = [A("ENTER_STATE", { state: "ARRIVING" }),
        A("WALK_TO_WP", { floor: 0, wp: "entrance" }),
        A("ENTER_STATE", { state: "VISITING" })];
        p = p.concat(visitorActivity(a));
        p = p.concat([
            A("ENTER_STATE", { state: "LEAVING" }),
            A("WALK_TO_WP", { floor: 0, wp: "entrance" }),
            A("WALK_TO_WP", { floor: 0, wp: "outside" }),
            A("EXIT_BUILDING"),
        ]);
        return p;
    }

    // ---- desk-level decision ---------------------------------------------
    function chooseNextActivity(a) {
        const now = Clock.simMinute;
        if (now >= a.departureTime) return planLeaveBuilding(a);
        for (let i = 0; i < a.plannedMeetingTimes.length; i++) {
            if (now >= a.plannedMeetingTimes[i]) {
                a.plannedMeetingTimes.splice(i, 1);
                return planAttendMeeting(a);
            }
        }
        if (now >= a.lunchTime && !a.hasLunched) return planGoToLunch(a);
        const r = Math.random();
        if (r < MEETING_PROB * 0.4) return planAttendMeeting(a);   // ~14%
        if (r < MEETING_PROB * 0.4 + 0.12) return planVisitLounge(a);
        if (r < MEETING_PROB * 0.4 + 0.12 + 0.15) return planVisitCoworker(a);
        return keepWorking(a);
    }

    // ---- action execution -------------------------------------------------
    function walkToward(g, tx, ty, tz, dt) {
        const dx = tx - g.position.x, dz = tz - g.position.z;
        const d = Math.sqrt(dx * dx + dz * dz);
        const step = WALK_SPEED * dt;
        if (d > 1e-4) {
            const f = Math.min(1, step / d);
            g.position.x += dx * f; g.position.z += dz * f;
            if (step > 1e-4) g.rotation.y = Math.atan2(dx, dz);
        }
        g.position.y += (ty - g.position.y) * Math.min(1, dt * 6);
        return d;
    }

    function startAction(a, act) {
        const g = a.group;
        switch (act.type) {
            case "WALK_TO_WP": {
                const nodes = floorByNum(act.floor).nodes;
                a._walkPath = world.bfsPath(nodes, a.currentWp, act.wp);
                if (!a._walkPath.length && nodes[act.wp]) a._walkPath = [nodes[act.wp].pos.clone()];
                a._walkIdx = 0; a._stallT = 0; a._walkPrev.copy(g.position);
                g.userData.isWalking = true; g.userData.isSitting = false;
                break;
            }
            case "ENTER_ELEVATOR":
                a._enterPhase = 0; a._spot = null;
                a._floor = a.currentFloor; a._dir = act.toFloor > a.currentFloor ? 1 : -1;
                a._stallT = 0; a._walkPrev.copy(g.position);
                break;
            case "EXIT_ELEVATOR":
                a._exitPhase = 0; a._stallT = 0; a._walkPrev.copy(g.position);
                break;
            case "PRESS_FLOOR": elevator.pressDestination(act.floor); break;
            case "WAIT_SIM": a._untilMin = Clock.simMinute + act.minutes; break;
            case "ENTER_STATE": a.state = act.state; break;
            case "MARK_LUNCHED": a.hasLunched = true; break;
        }
    }

    function updateAction(a, act, dt) {
        const g = a.group;
        switch (act.type) {
            case "WALK_TO_WP": return doWalk(a, act, dt);
            case "WAIT_AT_PANEL": {
                g.userData.isWalking = false;
                const acc = elevator.isAcceptingAt(act.floor, act.dir) && elevator.currentCapacityFree() > 0;
                if (acc) return true;
                if (act.dir > 0) elevator.callUp(act.floor); else elevator.callDown(act.floor);
                return false;
            }
            case "ENTER_ELEVATOR": return doEnter(a, act, dt);
            case "PRESS_FLOOR": return true;
            case "WAIT_FOR_FLOOR": {
                g.userData.isWalking = false;
                return elevator.state === "DOOR_OPEN" && elevator.currentFloor === act.floor;
            }
            case "EXIT_ELEVATOR": return doExit(a, act, dt);
            case "SIT": return doSit(a, act);
            case "STAND": {
                g.userData.isSitting = false;
                const base = (g.parent === elevator.carGroup) ? 0 : a.currentFloor * FH;
                g.position.y = base;
                return true;
            }
            case "RELEASE_SEAT": releaseSeat(a); return true;
            case "WAIT_SIM":
                g.userData.isWalking = false;
                return Clock.simMinute >= a._untilMin;
            case "EXIT_BUILDING":
                releaseSeat(a);
                if (g.parent) g.parent.remove(g);
                g.visible = false;
                a.state = "GONE"; a.plan = [];
                return true;
            case "ENTER_STATE": return true;
            case "MARK_LUNCHED": return true;
            case "PICK_NEXT_ACTIVITY": a.plan = chooseNextActivity(a); return true;
        }
        return true;
    }

    function doWalk(a, act, dt) {
        const g = a.group;
        const path = a._walkPath;
        if (!path || a._walkIdx >= path.length) {
            g.userData.isWalking = false; a.currentWp = act.wp; return true;
        }
        const tgt = path[a._walkIdx];
        const d = walkToward(g, tgt.x, tgt.y, tgt.z, dt);
        if (d < ARRIVE_EPS) { a._walkIdx++; a._stallT = 0; a._walkPrev.copy(g.position); }
        else {
            // stall recovery: skip a waypoint if blocked for too long
            const moved = g.position.distanceTo(a._walkPrev);
            if (moved < 0.01) { a._stallT += dt; if (a._stallT > 1.2) { a._walkIdx++; a._stallT = 0; } }
            else { a._stallT = 0; }
            a._walkPrev.copy(g.position);
        }
        if (a._walkIdx >= path.length) { g.userData.isWalking = false; a.currentWp = act.wp; return true; }
        return false;
    }

    function doEnter(a, act, dt) {
        const g = a.group;
        const car = elevator.carGroup;
        if (a._enterPhase === 0) {           // reserve a spot
            const here = elevator.state === "DOOR_OPEN" && elevator.currentFloor === a._floor;
            if (!a._spot) {
                if (here && elevator.currentCapacityFree() > 0) {
                    a._spot = elevator.reserveBoardingSpot(a);
                }
                if (!a._spot) {              // car not here / full → keep the call alive and wait
                    if (a._dir > 0) elevator.callUp(a._floor); else elevator.callDown(a._floor);
                    g.userData.isWalking = false;
                    return false;
                }
            }
            a._enterPhase = 1; a._stallT = 0; a._walkPrev.copy(g.position);
            return false;
        }
        if (a._enterPhase === 1) {           // walk to the door threshold on our own lane
            const ty = a._floor * FH;
            const d = walkToward(g, a._spot.x, ty, 1.55, dt);
            g.userData.isWalking = true;
            const moved = g.position.distanceTo(a._walkPrev); a._walkPrev.copy(g.position);
            if (moved < 0.01) { a._stallT += dt; } else { a._stallT = 0; }
            if (d < 0.25 || a._stallT > 1.5) {
                g.position.set(a._spot.x, ty, 1.55);
                g.getWorldPosition(_v); car.add(g); g.position.copy(car.worldToLocal(_v.clone()));
                a._enterPhase = 2;
            }
            return false;
        }
        // phase 2: walk to the reserved interior spot in car-local space
        const d = walkToward(g, a._spot.x, 0, a._spot.z, dt);
        g.userData.isWalking = true;
        if (d < 0.12) {
            g.position.set(a._spot.x, 0, a._spot.z);
            elevator.completeBoard(a);
            g.rotation.y = 0;               // face the doors (+Z)
            g.userData.isWalking = false;
            return true;
        }
        return false;
    }

    function doExit(a, act, dt) {
        const g = a.group;
        if (a._exitPhase === 0) {
            elevator.registerDisembark(a);
            g.getWorldPosition(_v); scene.add(g); g.position.copy(_v);
            a._exitPhase = 1; a._stallT = 0; a._walkPrev.copy(g.position);
            return false;
        }
        const node = floorByNum(act.toFloor).nodes["elevWait"];
        const ty = act.toFloor * FH;
        const d = walkToward(g, node.pos.x, ty, node.pos.z, dt);
        g.userData.isWalking = true;
        const moved = g.position.distanceTo(a._walkPrev); a._walkPrev.copy(g.position);
        if (moved < 0.01) { a._stallT += dt; } else { a._stallT = 0; }
        if (d < ARRIVE_EPS || a._stallT > 1.5) {
            // small ring jitter so several riders disembarking together don't stack on elevWait
            const ja = Math.random() * Math.PI * 2, jr = 0.25 + Math.random() * 0.4;
            g.position.set(node.pos.x + Math.cos(ja) * jr, ty, node.pos.z + Math.sin(ja) * jr);
            elevator.completeDisembark(a);
            a.currentFloor = act.toFloor; a.currentWp = "elevWait";
            g.userData.isWalking = false;
            return true;
        }
        return false;
    }

    function doSit(a, act) {
        const g = a.group;
        const fl = floorByNum(act.floor);
        const t = fl.sitTargets[act.wp];
        const node = fl.nodes[act.wp];
        const base = act.floor * FH;
        const x = node ? node.pos.x : g.position.x;
        const z = node ? node.pos.z : g.position.z;
        if (t && t.sit) {
            g.position.set(x, base - 0.35, z);
            g.rotation.y = t.facing;
            g.userData.isSitting = true; g.userData.isWalking = false;
        } else {
            const ang = Math.random() * Math.PI * 2, rr = 0.35 + Math.random() * 0.4;
            g.position.set(x + Math.cos(ang) * rr, base, z + Math.sin(ang) * rr);
            g.rotation.y = t ? t.facing : Math.PI;
            g.userData.isSitting = false; g.userData.isWalking = false;
        }
        a.currentWp = act.wp;
        return true;
    }

    // ---- per-agent frame --------------------------------------------------
    function updateAgent(a, motionDt) {
        if (a.state === "DISABLED" || a.state === "GONE") return;
        if (a.state === "AWAY") {
            if (Clock.simMinute >= a.arrivalTime && enabled(a)) spawnAgent(a); // -> ARRIVING
            if (a.state === "AWAY") return;     // still waiting for arrival time
        }

        // end-of-day override for workers (only when settled, so we never interrupt a ride)
        if (a.role === "WORKER" && !a._headingHome &&
            Clock.simMinute >= a.departureTime && SETTLED_STATES[a.state]) {
            a._headingHome = true;
            releaseSeat(a);
            a.group.userData.isSitting = false;
            a.plan = planLeaveBuilding(a);
            a.currentAction = null; a._started = false;
        }

        let iter = 0;
        while (iter++ < 16) {
            if (!a.currentAction) {
                if (!a.plan.length) break;
                a.currentAction = a.plan.shift(); a._started = false;
            }
            if (!a._started) { startAction(a, a.currentAction); a._started = true; }
            const done = updateAction(a, a.currentAction, motionDt);
            if (done) { a.currentAction = null; continue; }
            break;
        }
    }

    // ---- collisions -------------------------------------------------------
    function applyCollisions() {
        const list = [];
        for (let i = 0; i < agents.length; i++) {
            const a = agents[i];
            if (!PRESENT_STATES[a.state]) continue;
            if (a.group.userData.isSitting) continue;
            if (a.group.parent === elevator.carGroup) continue;     // tiny cabin: pre-assigned spots
            if (a.currentAction && a.currentAction.type === "ENTER_ELEVATOR") continue; // boarders push through
            list.push(a);
        }
        for (let i = 0; i < list.length; i++) {
            for (let j = i + 1; j < list.length; j++) {
                const ga = list[i].group, gb = list[j].group;
                if (ga.parent !== gb.parent) continue;
                if (Math.abs(ga.position.y - gb.position.y) > 1.0) continue;
                let dx = ga.position.x - gb.position.x, dz = ga.position.z - gb.position.z;
                let d = Math.sqrt(dx * dx + dz * dz);
                if (d > 0.7) continue;
                let nx, nz;
                if (d < 1e-3) { const ang = Math.random() * Math.PI * 2; nx = Math.cos(ang); nz = Math.sin(ang); d = 0.001; }
                else { nx = dx / d; nz = dz / d; }
                const push = 0.18 * (0.7 - d);
                ga.position.x += nx * push; ga.position.z += nz * push;
                gb.position.x -= nx * push; gb.position.z -= nz * push;
            }
        }
    }

    // ---- top-up scheduler -------------------------------------------------
    function topUpVisitors() {
        const now = Clock.simMinute;
        if (now < 8 * 60 || now > 18 * 60 + 30) return;
        let incoming = 0;
        for (let i = 0; i < agents.length; i++) {
            const a = agents[i];
            if (a.role === "VISITOR" && enabled(a) && a.state === "AWAY" &&
                a.arrivalTime <= now + 6 && a.arrivalTime >= now - 1) incoming++;
        }
        let deficit = targetOccupancy - countPresent() - incoming;
        if (deficit <= 0) return;
        for (let i = 0; i < agents.length && deficit > 0; i++) {
            const a = agents[i];
            if (a.role !== "VISITOR" || !enabled(a)) continue;
            if (a.state === "GONE" || (a.state === "AWAY" && a.arrivalTime > now + 10)) {
                a.arrivalTime = now + randInt(0, 6);
                a.visitDuration = randInt(10, 40);
                a.state = "AWAY";
                deficit--;
            }
        }
    }

    // ---- day wrap ---------------------------------------------------------
    function dayReset() {
        seatReservations.clear();
        for (let i = 0; i < agents.length; i++) {
            const a = agents[i];
            if (a.group.parent) a.group.parent.remove(a.group);
            a.group.visible = false;
            a.group.userData.isSitting = false; a.group.userData.isWalking = false;
            a.plan = []; a.currentAction = null; a._started = false;
            a._reservedSeat = null; a._headingHome = false; a._spot = null;
            a.currentFloor = 0; a.currentWp = "outside";
            initSchedule(a);
            a.state = enabled(a) ? "AWAY" : "DISABLED";
        }
        elevator.reset();
    }

    // ---- HUD --------------------------------------------------------------
    let hud, timeEl, speedEl, speedVal, occEl, occVal, statsEl;
    function buildHUD() {
        hud = document.createElement("div");
        hud.style.cssText = "position:fixed;top:10px;left:10px;width:260px;padding:12px 14px;" +
            "font-family:Menlo,Consolas,monospace;font-size:12px;color:#eef;" +
            "background:rgba(20,24,40,0.78);border:1px solid #556;border-radius:8px;" +
            "z-index:10;line-height:1.5;user-select:none";
        hud.innerHTML =
            '<div id="simtime" style="font-size:26px;font-weight:bold;letter-spacing:1px;margin-bottom:6px">--:--</div>' +
            '<div>Speed: <span id="spv"></span>x</div>' +
            '<input id="spd" type="range" min="0" max="1000" style="width:100%">' +
            '<div>Occupancy: <span id="ocv"></span> / ' + MAX_OCCUPANCY + ' people</div>' +
            '<input id="occ" type="range" min="1" max="' + MAX_OCCUPANCY + '" style="width:100%">' +
            '<div id="stats" style="margin-top:8px;font-size:11px;color:#cdf"></div>';
        document.body.appendChild(hud);
        timeEl = hud.querySelector("#simtime");
        speedEl = hud.querySelector("#spd"); speedVal = hud.querySelector("#spv");
        occEl = hud.querySelector("#occ"); occVal = hud.querySelector("#ocv");
        statsEl = hud.querySelector("#stats");

        speedEl.value = Math.round(1000 * Math.log(Clock.timeScale) / Math.log(600));
        speedVal.textContent = Clock.timeScale;
        speedEl.addEventListener("input", function () {
            const ts = Math.pow(600, speedEl.value / 1000);
            Clock.timeScale = Math.max(1, Math.min(600, Math.round(ts)));
            speedVal.textContent = Clock.timeScale;
        });

        occEl.value = targetOccupancy; occVal.textContent = targetOccupancy;
        occEl.addEventListener("input", function () {
            targetOccupancy = parseInt(occEl.value, 10);
            occVal.textContent = targetOccupancy;
            applyOccupancy();
        });
    }

    function updateHUD() {
        timeEl.textContent = Clock.format();
        const c = {};
        for (let i = 0; i < agents.length; i++) {
            const s = agents[i].state; c[s] = (c[s] || 0) + 1;
        }
        const order = ["AT_DESK", "IN_MEETING", "AT_BREAK", "AT_LUNCH", "VISITING",
            "WAITING_ELEVATOR", "IN_CAR", "ON_FLOOR", "ARRIVING", "LEAVING", "AWAY", "GONE", "DISABLED"];
        let html = "<b>Present: " + countPresent() + "</b><br>";
        for (let i = 0; i < order.length; i++) if (c[order[i]]) html += order[i] + ": " + c[order[i]] + "<br>";
        const dir = elevator.direction > 0 ? "UP" : elevator.direction < 0 ? "DOWN" : "idle";
        html += "<br><b>Elevator</b><br>";
        html += "floor " + Math.round(elevator.position) + " · " + dir + " · " + elevator.state + "<br>";
        html += "pax " + elevator.passengers.size + " · dest {" + Array.from(elevator.destinations).sort().join(",") + "}<br>";
        html += "up {" + Array.from(elevator.upCalls).sort().join(",") + "} down {" +
            Array.from(elevator.downCalls).sort().join(",") + "}";
        statsEl.innerHTML = html;
    }

    // ---- render loop ------------------------------------------------------
    const three = new THREE.Clock();
    function animate() {
        requestAnimationFrame(animate);
        const realDt = Math.min(0.05, three.getDelta());
        Clock.tick(realDt);
        updateLighting();

        const motionDt = realDt * Clock.timeScale;
        elevator.tick(motionDt);

        topUpVisitors();
        for (let i = 0; i < agents.length; i++) updateAgent(agents[i], motionDt);
        applyCollisions();
        for (let i = 0; i < agents.length; i++) {
            const a = agents[i];
            if (a.group.visible) window.animatePersonWalking(a.group, motionDt);
        }

        controls.update();
        renderer.render(scene, camera);
        updateHUD();
    }

    // ---- init -------------------------------------------------------------
    function init() {
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x9fc4ef);

        camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 500);
        camera.position.set(28, 24, 28);

        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.sortObjects = true;
        document.body.appendChild(renderer.domElement);

        controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.target.set(0, 7, 0);
        controls.enableDamping = true;

        ambient = new THREE.AmbientLight(0xffffff, 0.72);
        scene.add(ambient);
        sun = new THREE.DirectionalLight(0xfff4d6, 1.0);
        sun.position.set(30, 50, 20);
        scene.add(sun);
        hemi = new THREE.HemisphereLight(0xaaccff, 0x554433, 0.6);
        scene.add(hemi);

        world = window.createWorld(scene);
        elevator = new window.Elevator(scene, world);
        lobby = world.floors[0];

        buildAgents();
        applyOccupancy();
        buildHUD();

        window.addEventListener("resize", function () {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        });

        // expose for debugging
        window._sim = { Clock: Clock, agents: agents, elevator: elevator, world: world };

        animate();
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
})();
