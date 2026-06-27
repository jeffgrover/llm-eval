// sim.js — simulated clock, day/night lighting, agents, render loop, UI
(function (root) {
    "use strict";
    const THREE = root.THREE;
    const WORLD = root.WORLD;
    const createPerson = root.createPerson;
    const animatePersonWalking = root.animatePersonWalking;
    const bfsPath = root.bfsPath;
    const Elevator = root.Elevator;
    const createWorld = root.createWorld;

    const MAX_WORKERS = 20;
    const MAX_VISITORS = 80;
    const MAX_OCCUPANCY = MAX_WORKERS + MAX_VISITORS;
    const DEFAULT_OCCUPANCY = 45;
    const WALK_SPEED = 1.3;
    const SIT_DROP = 0.35;

    const FIRST_NAMES = ["Al", "Bo", "Cy", "Di", "Ed", "Fi", "Go", "Ha", "Iv", "Jo", "Ka", "Le",
        "Mo", "Ni", "Os", "Pa", "Qu", "Ro", "Sa", "Tu", "Um", "Vi", "Wo", "Xi", "Yu", "Za"];

    function rand(a, b) { return a + Math.random() * (b - a); }
    function randInt(a, b) { return Math.floor(rand(a, b + 1)); }
    function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

    // ---- Clock ----
    class Clock {
        constructor() {
            this.simMinute = 7 * 60 + 30;
            this.timeScale = 120;
        }
        tick(realDt) {
            this.simMinute += realDt * this.timeScale / 60;
            if (this.simMinute >= 24 * 60) {
                this.simMinute -= 24 * 60;
                this.onWrap();
            }
        }
        format() {
            const total = Math.floor(this.simMinute);
            let h = Math.floor(total / 60) % 24;
            const m = total % 60;
            const ampm = h < 12 ? "AM" : "PM";
            let hh = h % 12; if (hh === 0) hh = 12;
            return (hh < 10 ? " " : "") + hh + ":" + (m < 10 ? "0" : "") + m + " " + ampm;
        }
        onWrap() { if (typeof sim !== "undefined" && sim.onDayWrap) sim.onDayWrap(); }
    }

    // ---- day/night lighting ----
    const DAY_KEYS = [
        { h: 0, bg: 0x1a1a2e, sun: 0x223355, si: 0.05, ai: 0.45, hi: 0.32 },
        { h: 5.5, bg: 0x2a2a3e, sun: 0x334466, si: 0.08, ai: 0.45, hi: 0.32 },
        { h: 6.0, bg: 0x3a3050, sun: 0xff9966, si: 0.4, ai: 0.5, hi: 0.4 },
        { h: 6.5, bg: 0x88aacc, sun: 0xffeecc, si: 0.9, ai: 0.55, hi: 0.5 },
        { h: 8.0, bg: 0x9bbbd9, sun: 0xffffee, si: 1.1, ai: 0.6, hi: 0.55 },
        { h: 16.5, bg: 0x9bbbd9, sun: 0xffffee, si: 1.1, ai: 0.6, hi: 0.55 },
        { h: 17.5, bg: 0xc89866, sun: 0xff8844, si: 0.8, ai: 0.55, hi: 0.5 },
        { h: 18.5, bg: 0x4a3060, sun: 0x554477, si: 0.2, ai: 0.5, hi: 0.38 },
        { h: 20.0, bg: 0x1a1a2e, sun: 0x223355, si: 0.05, ai: 0.45, hi: 0.32 },
        { h: 24.0, bg: 0x1a1a2e, sun: 0x223355, si: 0.05, ai: 0.45, hi: 0.32 }
    ];
    function lerp(a, b, t) { return a + (b - a) * t; }
    function lerpColor(c1, c2, t) {
        return new THREE.Color(
            (Math.round(lerp((c1 >> 16) & 255, (c2 >> 16) & 255, t))),
            (Math.round(lerp((c1 >> 8) & 255, (c2 >> 8) & 255, t))),
            (Math.round(lerp(c1 & 255, c2 & 255, t)))
        );
    }
    function updateLighting(scene, sun, ambient, hemi, simMinute) {
        const hours = simMinute / 60;
        let k0 = DAY_KEYS[0], k1 = DAY_KEYS[DAY_KEYS.length - 1];
        for (let i = 0; i < DAY_KEYS.length - 1; i++) {
            if (hours >= DAY_KEYS[i].h && hours <= DAY_KEYS[i + 1].h) {
                k0 = DAY_KEYS[i]; k1 = DAY_KEYS[i + 1]; break;
            }
        }
        const span = k1.h - k0.h || 1;
        const t = Math.max(0, Math.min(1, (hours - k0.h) / span));
        scene.background = lerpColor(k0.bg, k1.bg, t);
        sun.color = lerpColor(k0.sun, k1.sun, t);
        sun.intensity = lerp(k0.si, k1.si, t);
        ambient.intensity = lerp(k0.ai, k1.ai, t);
        hemi.intensity = lerp(k0.hi, k1.hi, t);
    }

    // ---- seat reservations ----
    const seatReservations = new Set();
    function reserveSeat(floor, wpName) {
        const key = floor + ":" + wpName;
        if (seatReservations.has(key)) return false;
        seatReservations.add(key);
        return true;
    }
    function releaseSeat(floor, wpName) {
        seatReservations.delete(floor + ":" + wpName);
    }

    // ---- agent ----
    function makeAgent(id, role) {
        const group = createPerson();
        const ag = {
            id, role, name: pick(FIRST_NAMES),
            group,
            state: "AWAY",
            plan: [],
            actionIdx: 0,
            currentAction: null,
            homeFloor: null, deskId: null, deskWpName: null, deskDoorWpName: null,
            arrivalTime: 0, lunchTime: 0, lunchDuration: 30, departureTime: 0,
            hasLunched: false, plannedMeetingTimes: [],
            // motion
            path: null, pathIdx: 0, _prevWp: null, _stallT: 0,
            _prevWalk: null, _walkStallT: 0,
            disabled: false
        };
        group.visible = false;
        return ag;
    }

    function resampleSchedule(ag) {
        ag.arrivalTime = rand(8 * 60 + 15, 9 * 60 + 30);
        ag.lunchTime = rand(11 * 60 + 30, 13 * 60 + 30);
        ag.lunchDuration = randInt(25, 60);
        if (Math.random() < 0.15) {
            ag.departureTime = rand(18 * 60 + 30, 19 * 60 + 45);
            ag.isStraggler = true;
        } else {
            ag.departureTime = rand(16 * 60 + 45, 18 * 60 + 30);
            ag.isStraggler = false;
        }
        ag.hasLunched = false;
        ag.plannedMeetingTimes = [];
        if (Math.random() < 0.6) ag.plannedMeetingTimes.push(randInt(9 * 60 + 30, 11 * 60 + 30));
        if (Math.random() < 0.5) ag.plannedMeetingTimes.push(randInt(13 * 60 + 30, 16 * 60 + 30));
    }

    function resampleVisitorVisit(ag) {
        ag.arrivalTime = sim.clock.simMinute + randInt(0, 6);
        ag.visitDuration = randInt(8, 30);
        ag.hasLunched = false;
    }

    // ---- plan compilers ----
    function actions() { return []; }

    function planMoveToWp(ag, fromFloor, toFloor, wpName) {
        const plan = [];
        if (fromFloor !== toFloor) {
            const dir = toFloor > fromFloor ? 1 : -1;
            plan.push({ type: "WALK_TO_WP", floor: fromFloor, wpName: "elevWait" });
            plan.push({ type: "WAIT_AT_PANEL", floor: fromFloor, dir, toFloor });
            plan.push({ type: "ENTER_ELEVATOR", toFloor });
            plan.push({ type: "PRESS_FLOOR", floor: toFloor });
            plan.push({ type: "WAIT_FOR_FLOOR", floor: toFloor });
            plan.push({ type: "EXIT_ELEVATOR", toFloor });
        }
        plan.push({ type: "WALK_TO_WP", floor: toFloor, wpName });
        return plan;
    }

    function planArriveToDesk(ag) {
        const plan = [];
        plan.push({ type: "STAND" });
        plan.push({ type: "WALK_TO_WP", floor: 0, wpName: "entrance" });
        // ride up
        const dir = ag.homeFloor > 0 ? 1 : 0;
        plan.push({ type: "WALK_TO_WP", floor: 0, wpName: "elevWait" });
        plan.push({ type: "WAIT_AT_PANEL", floor: 0, dir: 1, toFloor: ag.homeFloor });
        plan.push({ type: "ENTER_ELEVATOR", toFloor: ag.homeFloor });
        plan.push({ type: "PRESS_FLOOR", floor: ag.homeFloor });
        plan.push({ type: "WAIT_FOR_FLOOR", floor: ag.homeFloor });
        plan.push({ type: "EXIT_ELEVATOR", toFloor: ag.homeFloor });
        plan.push({ type: "WALK_TO_WP", floor: ag.homeFloor, wpName: ag.deskDoorWpName });
        plan.push({ type: "WALK_TO_WP", floor: ag.homeFloor, wpName: ag.deskWpName });
        plan.push({ type: "SIT", floor: ag.homeFloor, wpName: ag.deskWpName });
        plan.push({ type: "ENTER_STATE", state: "AT_DESK" });
        plan.push({ type: "WAIT_SIM", minutes: randInt(18, 65) });
        plan.push({ type: "PICK_NEXT_ACTIVITY" });
        return plan;
    }

    function planGoToLunch(ag) {
        const plan = [];
        const fromFloor = ag.homeFloor;
        // leave desk
        plan.push({ type: "STAND" });
        plan.push({ type: "RELEASE_SEAT", floor: fromFloor, wpName: ag.deskWpName });
        plan.push({ type: "WALK_TO_WP", floor: fromFloor, wpName: ag.deskDoorWpName });
        // down to lobby
        plan.push({ type: "WALK_TO_WP", floor: fromFloor, wpName: "elevWait" });
        plan.push({ type: "WAIT_AT_PANEL", floor: fromFloor, dir: -1, toFloor: 0 });
        plan.push({ type: "ENTER_ELEVATOR", toFloor: 0 });
        plan.push({ type: "PRESS_FLOOR", floor: 0 });
        plan.push({ type: "WAIT_FOR_FLOOR", floor: 0 });
        plan.push({ type: "EXIT_ELEVATOR", toFloor: 0 });
        // walk to a bistro chair
        const bistroIdx = randInt(0, 3);
        const seat = (Math.random() < 0.5) ? "_seat0" : "_seat1";
        const wp = "bistro_" + bistroIdx + seat;
        plan.push({ type: "WALK_TO_WP", floor: 0, wpName: wp });
        plan.push({ type: "SIT", floor: 0, wpName: wp });
        plan.push({ type: "ENTER_STATE", state: "AT_LUNCH" });
        plan.push({ type: "WAIT_SIM", minutes: ag.lunchDuration });
        plan.push({ type: "MARK_LUNCHED" });
        plan.push({ type: "STAND" });
        plan.push({ type: "RELEASE_SEAT", floor: 0, wpName: wp });
        // back to desk
        plan.push({ type: "WALK_TO_WP", floor: 0, wpName: "elevWait" });
        plan.push({ type: "WAIT_AT_PANEL", floor: 0, dir: 1, toFloor: fromFloor });
        plan.push({ type: "ENTER_ELEVATOR", toFloor: fromFloor });
        plan.push({ type: "PRESS_FLOOR", floor: fromFloor });
        plan.push({ type: "WAIT_FOR_FLOOR", floor: fromFloor });
        plan.push({ type: "EXIT_ELEVATOR", toFloor: fromFloor });
        plan.push({ type: "WALK_TO_WP", floor: fromFloor, wpName: ag.deskDoorWpName });
        plan.push({ type: "WALK_TO_WP", floor: fromFloor, wpName: ag.deskWpName });
        plan.push({ type: "SIT", floor: fromFloor, wpName: ag.deskWpName });
        plan.push({ type: "ENTER_STATE", state: "AT_DESK" });
        plan.push({ type: "WAIT_SIM", minutes: randInt(20, 60) });
        plan.push({ type: "PICK_NEXT_ACTIVITY" });
        return plan;
    }

    function planVisitLounge(ag) {
        const plan = [];
        const f = ag.homeFloor;
        const spot = "lounge_spot" + randInt(0, 2);
        plan.push({ type: "STAND" });
        plan.push({ type: "RELEASE_SEAT", floor: f, wpName: ag.deskWpName });
        plan.push({ type: "WALK_TO_WP", floor: f, wpName: "lounge_door" });
        plan.push({ type: "WALK_TO_WP", floor: f, wpName: spot });
        plan.push({ type: "SIT", floor: f, wpName: spot });
        plan.push({ type: "ENTER_STATE", state: "AT_BREAK" });
        plan.push({ type: "WAIT_SIM", minutes: randInt(5, 12) });
        plan.push({ type: "STAND" });
        plan.push({ type: "RELEASE_SEAT", floor: f, wpName: spot });
        plan.push({ type: "WALK_TO_WP", floor: f, wpName: "lounge_door" });
        plan.push({ type: "WALK_TO_WP", floor: f, wpName: ag.deskDoorWpName });
        plan.push({ type: "WALK_TO_WP", floor: f, wpName: ag.deskWpName });
        plan.push({ type: "SIT", floor: f, wpName: ag.deskWpName });
        plan.push({ type: "ENTER_STATE", state: "AT_DESK" });
        plan.push({ type: "WAIT_SIM", minutes: randInt(18, 65) });
        plan.push({ type: "PICK_NEXT_ACTIVITY" });
        return plan;
    }

    function planAttendMeeting(ag) {
        const plan = [];
        let mf = ag.homeFloor;
        if (Math.random() < 0.35) {
            mf = randInt(1, 5);
            while (mf === ag.homeFloor) mf = randInt(1, 5);
        }
        // reserve a conf seat
        let seatName = null;
        for (let tries = 0; tries < 4; tries++) {
            const s = "conf_seat" + randInt(0, 3);
            if (reserveSeat(mf, s)) { seatName = s; break; }
        }
        if (!seatName) {
            // fallback lounge break
            return planVisitLounge(ag);
        }
        const fromFloor = ag.homeFloor;
        plan.push({ type: "STAND" });
        plan.push({ type: "RELEASE_SEAT", floor: fromFloor, wpName: ag.deskWpName });
        if (mf !== fromFloor) {
            const dir = mf > fromFloor ? 1 : -1;
            plan.push({ type: "WALK_TO_WP", floor: fromFloor, wpName: "elevWait" });
            plan.push({ type: "WAIT_AT_PANEL", floor: fromFloor, dir, toFloor: mf });
            plan.push({ type: "ENTER_ELEVATOR", toFloor: mf });
            plan.push({ type: "PRESS_FLOOR", floor: mf });
            plan.push({ type: "WAIT_FOR_FLOOR", floor: mf });
            plan.push({ type: "EXIT_ELEVATOR", toFloor: mf });
        }
        plan.push({ type: "WALK_TO_WP", floor: mf, wpName: "conf_door" });
        plan.push({ type: "WALK_TO_WP", floor: mf, wpName: "conf_center" });
        plan.push({ type: "WALK_TO_WP", floor: mf, wpName: seatName });
        plan.push({ type: "SIT", floor: mf, wpName: seatName });
        plan.push({ type: "ENTER_STATE", state: "IN_MEETING" });
        plan.push({ type: "WAIT_SIM", minutes: randInt(22, 45) });
        plan.push({ type: "STAND" });
        plan.push({ type: "RELEASE_SEAT", floor: mf, wpName: seatName });
        // return to desk
        if (mf !== fromFloor) {
            const dir2 = fromFloor > mf ? 1 : -1;
            plan.push({ type: "WALK_TO_WP", floor: mf, wpName: "elevWait" });
            plan.push({ type: "WAIT_AT_PANEL", floor: mf, dir: dir2, toFloor: fromFloor });
            plan.push({ type: "ENTER_ELEVATOR", toFloor: fromFloor });
            plan.push({ type: "PRESS_FLOOR", floor: fromFloor });
            plan.push({ type: "WAIT_FOR_FLOOR", floor: fromFloor });
            plan.push({ type: "EXIT_ELEVATOR", toFloor: fromFloor });
        }
        plan.push({ type: "WALK_TO_WP", floor: fromFloor, wpName: ag.deskDoorWpName });
        plan.push({ type: "WALK_TO_WP", floor: fromFloor, wpName: ag.deskWpName });
        plan.push({ type: "SIT", floor: fromFloor, wpName: ag.deskWpName });
        plan.push({ type: "ENTER_STATE", state: "AT_DESK" });
        plan.push({ type: "WAIT_SIM", minutes: randInt(18, 65) });
        plan.push({ type: "PICK_NEXT_ACTIVITY" });
        return plan;
    }

    function planVisitCoworker(ag) {
        const plan = [];
        const candidates = sim.agents.filter(o => o.role === "WORKER" && o.state === "AT_DESK" && o.id !== ag.id);
        if (candidates.length === 0) {
            return planVisitLounge(ag);
        }
        const tgt = pick(candidates);
        const tf = tgt.homeFloor;
        const fromFloor = ag.homeFloor;
        plan.push({ type: "STAND" });
        plan.push({ type: "RELEASE_SEAT", floor: fromFloor, wpName: ag.deskWpName });
        if (tf !== fromFloor) {
            const dir = tf > fromFloor ? 1 : -1;
            plan.push({ type: "WALK_TO_WP", floor: fromFloor, wpName: "elevWait" });
            plan.push({ type: "WAIT_AT_PANEL", floor: fromFloor, dir, toFloor: tf });
            plan.push({ type: "ENTER_ELEVATOR", toFloor: tf });
            plan.push({ type: "PRESS_FLOOR", floor: tf });
            plan.push({ type: "WAIT_FOR_FLOOR", floor: tf });
            plan.push({ type: "EXIT_ELEVATOR", toFloor: tf });
        }
        plan.push({ type: "WALK_TO_WP", floor: tf, wpName: tgt.deskDoorWpName });
        plan.push({ type: "ENTER_STATE", state: "VISITING" });
        plan.push({ type: "WAIT_SIM", minutes: randInt(6, 18) });
        // return
        if (tf !== fromFloor) {
            const dir2 = fromFloor > tf ? 1 : -1;
            plan.push({ type: "WALK_TO_WP", floor: tf, wpName: "elevWait" });
            plan.push({ type: "WAIT_AT_PANEL", floor: tf, dir: dir2, toFloor: fromFloor });
            plan.push({ type: "ENTER_ELEVATOR", toFloor: fromFloor });
            plan.push({ type: "PRESS_FLOOR", floor: fromFloor });
            plan.push({ type: "WAIT_FOR_FLOOR", floor: fromFloor });
            plan.push({ type: "EXIT_ELEVATOR", toFloor: fromFloor });
        }
        plan.push({ type: "WALK_TO_WP", floor: fromFloor, wpName: ag.deskDoorWpName });
        plan.push({ type: "WALK_TO_WP", floor: fromFloor, wpName: ag.deskWpName });
        plan.push({ type: "SIT", floor: fromFloor, wpName: ag.deskWpName });
        plan.push({ type: "ENTER_STATE", state: "AT_DESK" });
        plan.push({ type: "WAIT_SIM", minutes: randInt(18, 65) });
        plan.push({ type: "PICK_NEXT_ACTIVITY" });
        return plan;
    }

    function planLeaveBuilding(ag) {
        const plan = [];
        const fromFloor = ag.homeFloor || 0;
        if (ag.role === "WORKER" && ag.state !== "AT_DESK" && ag.currentAction) {
            // ensure we're standing
        }
        plan.push({ type: "STAND" });
        if (ag.role === "WORKER" && ag.deskWpName) {
            plan.push({ type: "RELEASE_SEAT", floor: fromFloor, wpName: ag.deskWpName });
        }
        plan.push({ type: "ENTER_STATE", state: "LEAVING" });
        if (fromFloor > 0) {
            plan.push({ type: "WALK_TO_WP", floor: fromFloor, wpName: "elevWait" });
            plan.push({ type: "WAIT_AT_PANEL", floor: fromFloor, dir: -1, toFloor: 0 });
            plan.push({ type: "ENTER_ELEVATOR", toFloor: 0 });
            plan.push({ type: "PRESS_FLOOR", floor: 0 });
            plan.push({ type: "WAIT_FOR_FLOOR", floor: 0 });
            plan.push({ type: "EXIT_ELEVATOR", toFloor: 0 });
        }
        plan.push({ type: "WALK_TO_WP", floor: 0, wpName: "entrance" });
        plan.push({ type: "WALK_TO_WP", floor: 0, wpName: "outside" });
        plan.push({ type: "EXIT_BUILDING" });
        return plan;
    }

    function planVisitorVisit(ag) {
        const plan = [];
        const r = Math.random();
        let activity;
        if (r < 0.10) activity = "bistro";
        else if (r < 0.16) activity = "cafe_counter";
        else if (r < 0.30) activity = "front_lounge";
        else if (r < 0.42) activity = "back_pit";
        else if (r < 0.52) activity = "stand";
        else if (r < 0.62) activity = "loiter";
        else if (r < 0.77) activity = "floor_lounge";
        else activity = "meeting";

        plan.push({ type: "STAND" });
        plan.push({ type: "ENTER_STATE", state: "VISITING" });

        if (activity === "meeting") {
            // sit in on a meeting on random floor
            const mf = randInt(1, 5);
            let seatName = null;
            for (let t = 0; t < 4; t++) {
                const s = "conf_seat" + randInt(0, 3);
                if (reserveSeat(mf, s)) { seatName = s; break; }
            }
            if (seatName) {
                plan.push({ type: "WALK_TO_WP", floor: 0, wpName: "elevWait" });
                plan.push({ type: "WAIT_AT_PANEL", floor: 0, dir: 1, toFloor: mf });
                plan.push({ type: "ENTER_ELEVATOR", toFloor: mf });
                plan.push({ type: "PRESS_FLOOR", floor: mf });
                plan.push({ type: "WAIT_FOR_FLOOR", floor: mf });
                plan.push({ type: "EXIT_ELEVATOR", toFloor: mf });
                plan.push({ type: "WALK_TO_WP", floor: mf, wpName: "conf_door" });
                plan.push({ type: "WALK_TO_WP", floor: mf, wpName: "conf_center" });
                plan.push({ type: "WALK_TO_WP", floor: mf, wpName: seatName });
                plan.push({ type: "SIT", floor: mf, wpName: seatName });
                plan.push({ type: "WAIT_SIM", minutes: randInt(15, 35) });
                plan.push({ type: "STAND" });
                plan.push({ type: "RELEASE_SEAT", floor: mf, wpName: seatName });
                plan.push({ type: "WALK_TO_WP", floor: mf, wpName: "elevWait" });
                plan.push({ type: "WAIT_AT_PANEL", floor: mf, dir: -1, toFloor: 0 });
                plan.push({ type: "ENTER_ELEVATOR", toFloor: 0 });
                plan.push({ type: "PRESS_FLOOR", floor: 0 });
                plan.push({ type: "WAIT_FOR_FLOOR", floor: 0 });
                plan.push({ type: "EXIT_ELEVATOR", toFloor: 0 });
            } else {
                activity = "loiter";
            }
        }
        if (activity === "floor_lounge") {
            const mf = randInt(1, 5);
            const spot = "lounge_spot" + randInt(0, 2);
            plan.push({ type: "WALK_TO_WP", floor: 0, wpName: "elevWait" });
            plan.push({ type: "WAIT_AT_PANEL", floor: 0, dir: 1, toFloor: mf });
            plan.push({ type: "ENTER_ELEVATOR", toFloor: mf });
            plan.push({ type: "PRESS_FLOOR", floor: mf });
            plan.push({ type: "WAIT_FOR_FLOOR", floor: mf });
            plan.push({ type: "EXIT_ELEVATOR", toFloor: mf });
            plan.push({ type: "WALK_TO_WP", floor: mf, wpName: "lounge_door" });
            plan.push({ type: "WALK_TO_WP", floor: mf, wpName: spot });
            plan.push({ type: "SIT", floor: mf, wpName: spot });
            plan.push({ type: "WAIT_SIM", minutes: randInt(8, 20) });
            plan.push({ type: "STAND" });
            plan.push({ type: "RELEASE_SEAT", floor: mf, wpName: spot });
            plan.push({ type: "WALK_TO_WP", floor: mf, wpName: "elevWait" });
            plan.push({ type: "WAIT_AT_PANEL", floor: mf, dir: -1, toFloor: 0 });
            plan.push({ type: "ENTER_ELEVATOR", toFloor: 0 });
            plan.push({ type: "PRESS_FLOOR", floor: 0 });
            plan.push({ type: "WAIT_FOR_FLOOR", floor: 0 });
            plan.push({ type: "EXIT_ELEVATOR", toFloor: 0 });
        }
        if (activity === "bistro") {
            const bi = randInt(0, 3);
            const seat = (Math.random() < 0.5) ? "_seat0" : "_seat1";
            const wp = "bistro_" + bi + seat;
            plan.push({ type: "WALK_TO_WP", floor: 0, wpName: wp });
            plan.push({ type: "SIT", floor: 0, wpName: wp });
            plan.push({ type: "WAIT_SIM", minutes: randInt(10, 25) });
            plan.push({ type: "STAND" });
            plan.push({ type: "RELEASE_SEAT", floor: 0, wpName: wp });
        }
        if (activity === "cafe_counter") {
            plan.push({ type: "WALK_TO_WP", floor: 0, wpName: "cafe_order" });
            plan.push({ type: "SIT", floor: 0, wpName: "cafe_order" });
            plan.push({ type: "WAIT_SIM", minutes: randInt(3, 8) });
            plan.push({ type: "STAND" });
        }
        if (activity === "front_lounge") {
            const spot = "front_lounge_" + randInt(0, 2);
            plan.push({ type: "WALK_TO_WP", floor: 0, wpName: spot });
            plan.push({ type: "SIT", floor: 0, wpName: spot });
            plan.push({ type: "WAIT_SIM", minutes: randInt(8, 20) });
            plan.push({ type: "STAND" });
            plan.push({ type: "RELEASE_SEAT", floor: 0, wpName: spot });
        }
        if (activity === "back_pit") {
            const spot = pick(["back_lounge_N", "back_lounge_S", "pit_N", "pit_S", "pit_E", "pit_W"]);
            plan.push({ type: "WALK_TO_WP", floor: 0, wpName: spot });
            plan.push({ type: "SIT", floor: 0, wpName: spot });
            plan.push({ type: "WAIT_SIM", minutes: randInt(8, 20) });
            plan.push({ type: "STAND" });
            plan.push({ type: "RELEASE_SEAT", floor: 0, wpName: spot });
        }
        if (activity === "stand") {
            const spot = pick(["lobby_wc_front", "lobby_wc_back", "reception", "kiosk", "water_cooler"]);
            plan.push({ type: "WALK_TO_WP", floor: 0, wpName: spot });
            plan.push({ type: "SIT", floor: 0, wpName: spot });
            plan.push({ type: "WAIT_SIM", minutes: randInt(3, 10) });
            plan.push({ type: "STAND" });
        }
        if (activity === "loiter") {
            const spot = pick(["lobby_stand_center", "lobby_stand_NE", "lobby_stand_NW",
                "lobby_stand_midE", "lobby_stand_midW", "lobby_stand_entry",
                "hall_stand_N", "hall_stand_S"]);
            const floor = (spot.startsWith("hall_stand")) ? randInt(1, 5) : 0;
            if (floor > 0) {
                plan.push({ type: "WALK_TO_WP", floor: 0, wpName: "elevWait" });
                plan.push({ type: "WAIT_AT_PANEL", floor: 0, dir: 1, toFloor: floor });
                plan.push({ type: "ENTER_ELEVATOR", toFloor: floor });
                plan.push({ type: "PRESS_FLOOR", floor: floor });
                plan.push({ type: "WAIT_FOR_FLOOR", floor: floor });
                plan.push({ type: "EXIT_ELEVATOR", toFloor: floor });
            }
            plan.push({ type: "WALK_TO_WP", floor: floor, wpName: spot });
            plan.push({ type: "SIT", floor: floor, wpName: spot });
            plan.push({ type: "WAIT_SIM", minutes: randInt(5, 15) });
            plan.push({ type: "STAND" });
            if (floor > 0) {
                plan.push({ type: "WALK_TO_WP", floor: floor, wpName: "elevWait" });
                plan.push({ type: "WAIT_AT_PANEL", floor: floor, dir: -1, toFloor: 0 });
                plan.push({ type: "ENTER_ELEVATOR", toFloor: 0 });
                plan.push({ type: "PRESS_FLOOR", floor: 0 });
                plan.push({ type: "WAIT_FOR_FLOOR", floor: 0 });
                plan.push({ type: "EXIT_ELEVATOR", toFloor: 0 });
            }
        }

        plan.push({ type: "WALK_TO_WP", floor: 0, wpName: "entrance" });
        plan.push({ type: "WALK_TO_WP", floor: 0, wpName: "outside" });
        plan.push({ type: "EXIT_BUILDING" });
        return plan;
    }

    function chooseNextActivity(ag) {
        const now = sim.clock.simMinute;
        if (now >= ag.departureTime) return planLeaveBuilding(ag);
        if (ag.plannedMeetingTimes && ag.plannedMeetingTimes.length > 0) {
            if (now >= ag.plannedMeetingTimes[0]) {
                ag.plannedMeetingTimes.shift();
                return planAttendMeeting(ag);
            }
        }
        if (!ag.hasLunched && now >= ag.lunchTime && now <= ag.lunchTime + 60) {
            return planGoToLunch(ag);
        }
        const r = Math.random();
        if (r < 0.14) return planAttendMeeting(ag);
        if (r < 0.26) return planVisitLounge(ag);
        if (r < 0.41) return planVisitCoworker(ag);
        // continue working
        const plan = [];
        plan.push({ type: "WAIT_SIM", minutes: randInt(18, 65) });
        plan.push({ type: "PICK_NEXT_ACTIVITY" });
        return plan;
    }

    // ---- set plan & start ----
    function setPlan(ag, plan) {
        ag.plan = plan;
        ag.actionIdx = 0;
        ag.currentAction = plan[0] || null;
        if (ag.currentAction) startAction(ag);
    }

    function nextAction(ag) {
        ag.actionIdx++;
        ag.currentAction = ag.plan[ag.actionIdx] || null;
        if (ag.currentAction) startAction(ag);
        else {
            // plan ended
            if (ag.role === "VISITOR" && ag.state !== "GONE") {
                ag.state = "AWAY";
                ag.group.visible = false;
                if (ag.group.parent) ag.group.parent.remove(ag.group);
            }
        }
    }

    function currentFloorY(ag) {
        if (ag._inCar) return sim.elevator.car.position.y;
        return (ag._currentFloor || 0) * WORLD.FLOOR_HEIGHT;
    }

    // ---- startAction: resolve deferred fields ----
    function startAction(ag) {
        const a = ag.currentAction;
        if (!a) return;
        a._done = false;
        if (a.type === "WALK_TO_WP") {
            const fromPos = ag.group.getWorldPosition(new THREE.Vector3());
            // determine current floor (from last known)
            const cf = ag._currentFloor || 0;
            const nodes = sim.world.floors[a.floor].nodes;
            const path = bfsPath(nodes, nearestNodeName(nodes, fromPos), a.wpName);
            ag.path = path.length > 0 ? path : [nodes[a.wpName] ? nodes[a.wpName].pos.clone() : fromPos];
            ag.pathIdx = 0;
            ag._prevWp = ag.group.position.clone();
            ag._stallT = 0;
            ag.group.userData.isWalking = true;
            ag.group.userData.isSitting = false;
        } else if (a.type === "WAIT_AT_PANEL") {
            // press call
            if (a.dir > 0) sim.elevator.callUp(a.floor);
            else sim.elevator.callDown(a.floor);
            ag.state = "WAITING_ELEVATOR";
        } else if (a.type === "ENTER_ELEVATOR") {
            ag._enterPhase = "reserve";
            ag._prevWalk = ag.group.position.clone();
            ag._walkStallT = 0;
        } else if (a.type === "PRESS_FLOOR") {
            sim.elevator.pressDestination(a.floor);
            a._done = true;
        } else if (a.type === "WAIT_FOR_FLOOR") {
            ag.state = "IN_CAR";
        } else if (a.type === "EXIT_ELEVATOR") {
            ag._exitPhase = "unparent";
        } else if (a.type === "SIT") {
            const floorData = sim.world.floors[a.floor];
            const target = floorData.sitTargets[a.wpName];
            const nodes = floorData.nodes;
            const wpNode = nodes[a.wpName];
            const pos = wpNode ? wpNode.pos.clone() : new THREE.Vector3();
            pos.y = a.floor * WORLD.FLOOR_HEIGHT;
            // jitter for standing waypoints
            if (target && target.sit === false) {
                const ang = Math.random() * Math.PI * 2;
                const rad = rand(0.35, 0.75);
                pos.x += Math.cos(ang) * rad;
                pos.z += Math.sin(ang) * rad;
            }
            ag.group.position.copy(pos);
            ag.group.position.y -= SIT_DROP;
            if (target) ag.group.rotation.y = target.facing;
            ag.group.userData.isSitting = true;
            ag.group.userData.isWalking = false;
            a._done = true;
        } else if (a.type === "STAND") {
            ag.group.userData.isSitting = false;
            ag.group.userData.isWalking = false;
            // restore Y to floor height
            const fy = (ag._inCar ? sim.elevator.car.position.y : (ag._currentFloor || 0) * WORLD.FLOOR_HEIGHT);
            ag.group.position.y = fy;
            a._done = true;
        } else if (a.type === "RELEASE_SEAT") {
            releaseSeat(a.floor, a.wpName);
            a._done = true;
        } else if (a.type === "WAIT_SIM") {
            a.untilMin = sim.clock.simMinute + a.minutes;
            a._done = false;
        } else if (a.type === "EXIT_BUILDING") {
            if (ag.group.parent) ag.group.parent.remove(ag.group);
            ag.state = "GONE";
            ag.group.visible = false;
            a._done = true;
        } else if (a.type === "ENTER_STATE") {
            ag.state = a.state;
            a._done = true;
        } else if (a.type === "MARK_LUNCHED") {
            ag.hasLunched = true;
            a._done = true;
        } else if (a.type === "PICK_NEXT_ACTIVITY") {
            const np = chooseNextActivity(ag);
            setPlan(ag, np);
            // setPlan already calls startAction on first action; signal we replaced plan
            a._replaced = true;
        }
    }

    function nearestNodeName(nodes, pos) {
        let best = null, bd = Infinity;
        for (const k in nodes) {
            const n = nodes[k];
            const d = n.pos.distanceTo(pos);
            if (d < bd) { bd = d; best = k; }
        }
        return best;
    }

    // ---- action dispatch ----
    function dispatchAction(ag, motionDt) {
        const a = ag.currentAction;
        if (!a) return;
        if (a.type === "WALK_TO_WP") {
            if (!ag.path || ag.pathIdx >= ag.path.length) {
                a._done = true;
                ag._currentFloor = a.floor;
                return;
            }
            const tgt = ag.path[ag.pathIdx];
            const pos = ag.group.position;
            const dx = tgt.x - pos.x, dz = tgt.z - pos.z;
            const dist = Math.hypot(dx, dz);
            // stall recovery
            const moved = pos.distanceTo(ag._prevWp);
            if (moved < 0.005) ag._stallT += motionDt;
            else ag._stallT = 0;
            ag._prevWp.copy(pos);
            if (ag._stallT > 1.2) {
                ag.pathIdx++;
                ag._stallT = 0;
                return;
            }
            if (dist < 0.15) {
                ag.pathIdx++;
                return;
            }
            const step = Math.min(WALK_SPEED * motionDt, dist);
            pos.x += (dx / dist) * step;
            pos.z += (dz / dist) * step;
            // face direction of motion
            ag.group.rotation.y = Math.atan2(dx, dz);
        } else if (a.type === "WAIT_AT_PANEL") {
            // re-press call every frame if missing
            if (a.dir > 0) { if (!sim.elevator.upCalls.has(a.floor)) sim.elevator.callUp(a.floor); }
            else { if (!sim.elevator.downCalls.has(a.floor)) sim.elevator.callDown(a.floor); }
            if (sim.elevator.isAcceptingAt(a.floor, a.dir) && sim.elevator.currentCapacityFree() > 0) {
                a._done = true;
            }
        } else if (a.type === "ENTER_ELEVATOR") {
            const ev = sim.elevator;
            if (ag._enterPhase === "reserve") {
                // re-press if car left
                if (ev.currentFloor !== a.toFloor && ev.currentFloor !== (ag._currentFloor || 0)) {
                    // car slipped away: re-call
                    if (a.toFloor > (ag._currentFloor || 0)) ev.callUp(ag._currentFloor || 0);
                    else ev.callDown(ag._currentFloor || 0);
                    return;
                }
                if (!ev.isAcceptingAt(ag._currentFloor || 0, a.toFloor > (ag._currentFloor || 0) ? 1 : -1)) {
                    // re-call
                    if (a.toFloor > (ag._currentFloor || 0)) ev.callUp(ag._currentFloor || 0);
                    else ev.callDown(ag._currentFloor || 0);
                    return;
                }
                const spot = ev.reserveBoardingSpot(ag, a.toFloor);
                if (!spot) return;
                ag._spot = spot;
                ag._thresholdPos = ev.doorThresholdWorldPos(spot.x);
                ag._spotWorld = ev.spotWorldPos(spot);
                ag._enterPhase = "toThreshold";
                ag._prevWalk = ag.group.position.clone();
                ag._walkStallT = 0;
                return;
            }
            if (ag._enterPhase === "toThreshold") {
                const tgt = ag._thresholdPos;
                const pos = ag.group.position;
                const dx = tgt.x - pos.x, dz = tgt.z - pos.z;
                const dist = Math.hypot(dx, dz);
                const moved = pos.distanceTo(ag._prevWalk);
                if (moved < 0.005) ag._walkStallT += motionDt; else ag._walkStallT = 0;
                ag._prevWalk.copy(pos);
                if (ag._walkStallT > 1.5 || dist < 0.1) {
                    // teleport / done with this phase
                    pos.copy(tgt);
                    ag._enterPhase = "reparent";
                    return;
                }
                if (dist < 0.1) { ag._enterPhase = "reparent"; return; }
                const step = Math.min(WALK_SPEED * motionDt, dist);
                pos.x += (dx / dist) * step;
                pos.z += (dz / dist) * step;
                ag.group.rotation.y = Math.atan2(dx, dz);
                return;
            }
            if (ag._enterPhase === "reparent") {
                // reparent scene -> car (preserve world pos)
                const wp = ag.group.getWorldPosition(new THREE.Vector3());
                if (ag.group.parent) ag.group.parent.remove(ag.group);
                ev.addToCar(ag.group);
                ag.group.position.copy(wp).sub(ev.car.position);
                ag._inCar = true;
                ag._enterPhase = "toSpot";
                ag._prevWalk = ag.group.position.clone();
                ag._walkStallT = 0;
                return;
            }
            if (ag._enterPhase === "toSpot") {
                const tgt = ag._spotWorld.clone().sub(ev.car.position);
                const pos = ag.group.position;
                const dx = tgt.x - pos.x, dz = tgt.z - pos.z;
                const dist = Math.hypot(dx, dz);
                if (dist < 0.1) {
                    ev.completeBoard(ag);
                    ag.group.rotation.y = 0;
                    ag._enterPhase = null;
                    a._done = true;
                    return;
                }
                const step = Math.min(WALK_SPEED * motionDt, dist);
                pos.x += (dx / dist) * step;
                pos.z += (dz / dist) * step;
                return;
            }
        } else if (a.type === "WAIT_FOR_FLOOR") {
            if (sim.elevator.state === "DOOR_OPEN" && Math.abs(sim.elevator.currentFloor - a.floor) < 0.01) {
                a._done = true;
            }
        } else if (a.type === "EXIT_ELEVATOR") {
            const ev = sim.elevator;
            if (ag._exitPhase === "unparent") {
                ev.registerDisembark(ag);
                // reparent car -> scene preserving world pos
                const wp = ag.group.getWorldPosition(new THREE.Vector3());
                if (ag.group.parent) ag.group.parent.remove(ag.group);
                ev.removeFromCar(ag.group);
                ag.group.position.copy(wp);
                ag._inCar = false;
                ag._currentFloor = a.toFloor;
                // walk to elevWait
                const nodes = sim.world.floors[a.toFloor].nodes;
                ag._exitTgt = nodes.elevWait.pos.clone();
                ag._exitTgt.y = a.toFloor * WORLD.FLOOR_HEIGHT;
                ag._exitPhase = "toWait";
                ag._prevWalk = ag.group.position.clone();
                ag._walkStallT = 0;
                return;
            }
            if (ag._exitPhase === "toWait") {
                const tgt = ag._exitTgt;
                const pos = ag.group.position;
                const dx = tgt.x - pos.x, dz = tgt.z - pos.z;
                const dist = Math.hypot(dx, dz);
                if (dist < 0.15) {
                    ev.completeDisembark(ag);
                    ag._exitPhase = null;
                    a._done = true;
                    return;
                }
                const step = Math.min(WALK_SPEED * motionDt, dist);
                pos.x += (dx / dist) * step;
                pos.z += (dz / dist) * step;
                ag.group.rotation.y = Math.atan2(dx, dz);
                return;
            }
        } else if (a.type === "WAIT_SIM") {
            if (sim.clock.simMinute >= a.untilMin) a._done = true;
        }
    }

    // ---- collisions ----
    function applyCollisions(agents) {
        const n = agents.length;
        for (let i = 0; i < n; i++) {
            const a = agents[i];
            if (a.disabled || !a.group.visible) continue;
            if (a.group.userData.isSitting) continue;
            if (a._inCar) continue;
            if (a.currentAction && a.currentAction.type === "ENTER_ELEVATOR") continue;
            const pa = a.group.position;
            for (let j = i + 1; j < n; j++) {
                const b = agents[j];
                if (b.disabled || !b.group.visible) continue;
                if (b.group.userData.isSitting) continue;
                if (b._inCar) continue;
                if (b.currentAction && b.currentAction.type === "ENTER_ELEVATOR") continue;
                if (Math.abs(pa.y - b.group.position.y) > 1.0) continue;
                const pb = b.group.position;
                const dx = pb.x - pa.x, dz = pb.z - pa.z;
                let d = Math.hypot(dx, dz);
                const minD = 0.8;
                if (d < minD) {
                    let nx, nz;
                    if (d < 1e-3) {
                        const ang = Math.random() * Math.PI * 2;
                        nx = Math.cos(ang); nz = Math.sin(ang);
                        d = 0.001;
                    } else {
                        nx = dx / d; nz = dz / d;
                    }
                    const push = (minD - d) * 0.18;
                    pa.x -= nx * push; pa.z -= nz * push;
                    pb.x += nx * push; pb.z += nz * push;
                }
            }
        }
    }

    // ---- spawn / top-up ----
    function spawnAgent(ag) {
        // spawn at sidewalk
        const outside = sim.world.floors[0].nodes.outside;
        ag.group.position.set(
            outside.pos.x + rand(-1.1, 1.1),
            0,
            outside.pos.z + rand(-0.75, 0.75)
        );
        ag.group.rotation.y = 0;
        ag._currentFloor = 0;
        ag._inCar = false;
        ag.group.userData.isWalking = false;
        ag.group.userData.isSitting = false;
        ag.group.visible = true;
        if (!ag.group.parent) sim.scene.add(ag.group);
        ag.state = "ARRIVING";
    }

    function countPresent() {
        return sim.agents.filter(a => !a.disabled && a.state !== "AWAY" && a.state !== "GONE" && a.group.visible).length;
    }

    function topUpVisitors() {
        const deficit = sim.targetOccupancy - countPresent();
        if (deficit <= 0) return;
        let armed = 0;
        for (const ag of sim.agents) {
            if (armed >= deficit) break;
            if (ag.role !== "VISITOR") continue;
            if (ag.disabled) continue;
            if (ag.state === "AWAY" || ag.state === "GONE") {
                resampleVisitorVisit(ag);
                ag.state = "AWAY";
                armed++;
            }
        }
    }

    function applyOccupancy() {
        for (const ag of sim.agents) {
            const should = ag.id < sim.targetOccupancy;
            if (!should && (ag.state === "AWAY" || ag.state === "GONE")) {
                ag.disabled = true;
                ag.group.visible = false;
            } else if (should && ag.disabled) {
                ag.disabled = false;
                ag.state = "AWAY";
            }
        }
    }

    function onDayWrap() {
        // reset elevator
        sim.elevator.reset();
        seatReservations.clear();
        for (const ag of sim.agents) {
            if (ag.role === "WORKER") {
                resampleSchedule(ag);
            } else {
                resampleVisitorVisit(ag);
            }
            ag.state = "AWAY";
            ag.plan = []; ag.currentAction = null; ag.actionIdx = 0;
            ag._inCar = false;
            ag.disabled = ag.id >= sim.targetOccupancy;
            ag.group.visible = false;
            if (ag.group.parent) ag.group.parent.remove(ag.group);
        }
    }

    // ---- main sim object ----
    const sim = {
        clock: null,
        scene: null, camera: null, renderer: null, controls: null,
        sun: null, ambient: null, hemi: null,
        world: null, elevator: null,
        agents: [],
        targetOccupancy: DEFAULT_OCCUPANCY,
        onDayWrap
    };
    root.sim = sim;

    function init() {
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x222233);
        const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 500);
        camera.position.set(28, 24, 28);
        camera.lookAt(0, 8, 0);
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.sortObjects = true;
        document.body.appendChild(renderer.domElement);
        const controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.target.set(0, 8, 0);
        controls.enableDamping = true;
        controls.dampingFactor = 0.1;

        const ambient = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambient);
        const sun = new THREE.DirectionalLight(0xffffff, 1.0);
        sun.position.set(20, 40, 15);
        scene.add(sun);
        const hemi = new THREE.HemisphereLight(0x88bbff, 0x443322, 0.5);
        scene.add(hemi);

        const world = createWorld(scene);
        const elevator = new Elevator(scene, world);

        sim.scene = scene; sim.camera = camera; sim.renderer = renderer;
        sim.controls = controls; sim.sun = sun; sim.ambient = ambient; sim.hemi = hemi;
        sim.world = world; sim.elevator = elevator;
        sim.clock = new Clock();

        // build agent pool
        const agents = [];
        // assign workers to desks (4 offices x 5 floors = 20 desks)
        const deskAssignments = [];
        for (let f = 1; f < WORLD.FLOOR_COUNT; f++) {
            const fdata = world.floors[f];
            for (const k of ["officeA", "officeB", "officeC", "officeD"]) {
                if (fdata.desks[k]) deskAssignments.push({ floor: f, deskId: k, deskWpName: k + "_desk", deskDoorWpName: k + "_door" });
            }
        }
        for (let i = 0; i < MAX_WORKERS; i++) {
            const ag = makeAgent(i, "WORKER");
            const da = deskAssignments[i % deskAssignments.length];
            ag.homeFloor = da.floor;
            ag.deskId = da.deskId;
            ag.deskWpName = da.deskWpName;
            ag.deskDoorWpName = da.deskDoorWpName;
            resampleSchedule(ag);
            ag.disabled = i >= sim.targetOccupancy;
            agents.push(ag);
        }
        for (let i = 0; i < MAX_VISITORS; i++) {
            const ag = makeAgent(MAX_WORKERS + i, "VISITOR");
            resampleVisitorVisit(ag);
            ag.disabled = true; // visitors enabled via topUp
            agents.push(ag);
        }
        sim.agents = agents;

        buildUI();
        window.addEventListener("resize", onResize);
        requestAnimationFrame(loop);
    }

    function onResize() {
        sim.camera.aspect = window.innerWidth / window.innerHeight;
        sim.camera.updateProjectionMatrix();
        sim.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    // ---- HUD ----
    let hudDiv, timeDiv, occSlider, speedSlider, statsDiv;
    function buildUI() {
        hudDiv = document.createElement("div");
        hudDiv.style.cssText = "position:fixed;top:8px;left:8px;background:rgba(0,0,0,0.55);color:#ddd;padding:10px 12px;font:13px monospace;border-radius:6px;pointer-events:none;min-width:240px;z-index:10";
        document.body.appendChild(hudDiv);
        timeDiv = document.createElement("div");
        timeDiv.style.cssText = "font-size:22px;font-weight:bold;color:#ffbb22;margin-bottom:6px";
        hudDiv.appendChild(timeDiv);

        const speedLabel = document.createElement("div");
        speedLabel.textContent = "Speed:";
        speedLabel.style.pointerEvents = "auto";
        hudDiv.appendChild(speedLabel);
        speedSlider = document.createElement("input");
        speedSlider.type = "range"; speedSlider.min = 0; speedSlider.max = 100;
        speedSlider.value = 50; speedSlider.style.width = "220px";
        speedSlider.style.pointerEvents = "auto";
        speedSlider.addEventListener("input", () => {
            // log-spaced 1..600
            const t = speedSlider.value / 100;
            sim.clock.timeScale = Math.round(Math.pow(10, Math.log10(1) + t * (Math.log10(600) - 0))) ;
        });
        hudDiv.appendChild(speedSlider);

        const occLabel = document.createElement("div");
        occLabel.textContent = "Occupancy:";
        occLabel.style.pointerEvents = "auto";
        hudDiv.appendChild(occLabel);
        occSlider = document.createElement("input");
        occSlider.type = "range"; occSlider.min = 1; occSlider.max = MAX_OCCUPANCY;
        occSlider.value = DEFAULT_OCCUPANCY; occSlider.style.width = "220px";
        occSlider.style.pointerEvents = "auto";
        occSlider.addEventListener("input", () => {
            sim.targetOccupancy = parseInt(occSlider.value);
            applyOccupancy();
        });
        hudDiv.appendChild(occSlider);

        statsDiv = document.createElement("div");
        statsDiv.style.cssText = "margin-top:6px;font-size:11px;color:#9ab";
        hudDiv.appendChild(statsDiv);
    }

    function updateHUD() {
        if (!timeDiv) return;
        timeDiv.textContent = sim.clock.format() + "  (" + sim.clock.timeScale + "x)";
        occLabel = hudDiv.childNodes[4];
        occLabel.textContent = "Occupancy: " + sim.targetOccupancy + " / " + MAX_OCCUPANCY + " people";
        // state breakdown
        const counts = {};
        let present = 0;
        for (const ag of sim.agents) {
            if (ag.disabled || !ag.group.visible) continue;
            present++;
            counts[ag.state] = (counts[ag.state] || 0) + 1;
        }
        let lines = ["Present: " + present];
        for (const k of Object.keys(counts).sort()) lines.push(k + ": " + counts[k]);
        const ev = sim.elevator;
        lines.push("Elevator: F" + ev.currentFloor + " " + (ev.direction > 0 ? "^" : ev.direction < 0 ? "v" : "-") + " " + ev.state);
        lines.push("  pass=" + ev.passengers.size + " pendB=" + ev.pendingBoarders.size + " pendD=" + ev.pendingDisembark.size);
        lines.push("  dest=[" + Array.from(ev.destinations).join(",") + "] up=[" + Array.from(ev.upCalls).join(",") + "] dn=[" + Array.from(ev.downCalls).join(",") + "]");
        statsDiv.innerHTML = lines.join("<br>");
    }

    // ---- loop ----
    let lastT = performance.now();
    function loop(now) {
        const realDt = Math.min(0.05, (now - lastT) / 1000);
        lastT = now;
        sim.clock.tick(realDt);
        updateLighting(sim.scene, sim.sun, sim.ambient, sim.hemi, sim.clock.simMinute);
        const motionDt = realDt * sim.clock.timeScale;

        sim.elevator.tick(motionDt);

        // top-up visitors
        if (sim.clock.simMinute > 8 * 60 && sim.clock.simMinute < 19 * 60 + 45) {
            topUpVisitors();
        }

        // agent daily schedule + dispatch
        for (const ag of sim.agents) {
            if (ag.disabled) continue;
            // spawn
            if (ag.state === "AWAY" && sim.clock.simMinute >= ag.arrivalTime) {
                spawnAgent(ag);
                if (ag.role === "WORKER") setPlan(ag, planArriveToDesk(ag));
                else setPlan(ag, planVisitorVisit(ag));
                continue;
            }
            // departure override for workers mid-day
            if (ag.role === "WORKER" && ag.state === "AT_DESK" && sim.clock.simMinute >= ag.departureTime) {
                if (!ag.currentAction || ag.currentAction.type !== "PICK_NEXT_ACTIVITY") {
                    // let the next PICK_NEXT_ACTIVITY handle it (chooseNextActivity checks departure)
                }
            }
            // action dispatch loop (multiple transitions per frame)
            for (let iter = 0; iter < 16; iter++) {
                if (!ag.currentAction) break;
                if (!ag.currentAction._replaced) dispatchAction(ag, motionDt);
                if (ag.currentAction && ag.currentAction._replaced) {
                    ag.currentAction._replaced = false;
                    continue; // plan was replaced; new currentAction already started
                }
                if (!ag.currentAction) break;
                if (ag.currentAction._done) {
                    nextAction(ag);
                    if (!ag.currentAction) break;
                    continue;
                }
                break;
            }
            // animate
            if (ag.group.parent) animatePersonWalking(ag.group, motionDt);
        }

        applyCollisions(sim.agents);

        sim.controls.update();
        sim.renderer.render(sim.scene, sim.camera);
        updateHUD();
        requestAnimationFrame(loop);
    }

    // boot
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})(typeof window !== "undefined" ? window : globalThis);
