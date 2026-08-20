/*
 * sim.js - simulation driver: scene/camera, simulated day clock, day/night
 * lighting, a pool of worker + visitor agents that pursue goals through a
 * plan/action brain, the elevator boarding protocol, anti-bunching
 * soft separation, and the HUD.
 *
 * Classic script: references window globals created by person.js, world.js,
 * elevator_logic.js and elevator.js (THREE is the CDN global). All motion
 * runs on the simulated clock - motionDt = realDt * timeScale - so the
 * elevator and the morning rush it serves scale up together.
 */
(function () {
    "use strict";

    // ---------- constants ----------
    var FLOOR_COUNT = WORLD.FLOOR_COUNT;
    var FH = WORLD.FLOOR_HEIGHT;
    var PERSON_R = WORLD.PERSON_R;
    var MAX_WORKERS = 20;
    var MAX_VISITORS = 80;
    var MAX_OCCUPANCY = MAX_WORKERS + MAX_VISITORS; // 100
    var DEFAULT_OCCUPANCY = 45;
    var WALK_MIN = 1.2;
    var WALK_MAX = 1.8;
    var CAR_FACE_Z = 1.3; // car front (+Z) face, world space
    var OFFICE_LETTERS = ["A", "B", "C", "D"];
    var CONF_SEATS = ["conf_seat0", "conf_seat1", "conf_seat2", "conf_seat3"];
    var LOUNGE_SPOTS = ["lounge_spot0", "lounge_spot1", "lounge_spot2"];
    var OFFICE_DOORS = ["officeA_door", "officeB_door", "officeC_door", "officeD_door"];
    var BISTRO_SEATS = ["bistro_c0", "bistro_c1", "bistro_c2", "bistro_c3",
        "bistro_c4", "bistro_c5", "bistro_c6", "bistro_c7"];
    var LOBBY_SEATS = ["lobby_fc0", "lobby_fc1", "lobby_fca", "lobby_fcb",
        "back_lounge_N", "back_lounge_S", "pit_N", "pit_S", "pit_E", "pit_W"];
    var LOBBY_WANDER = ["lobby_stand_entry", "lobby_stand_NE", "lobby_stand_NW",
        "lobby_stand_midE", "lobby_stand_midW", "lobby_stand_center"];
    var LOBBY_STANDS = ["reception", "kiosk", "lobby_wc_front", "lobby_wc_back"];
    var ENTRANCE_CHAIN = { front_door_threshold: 1, entrance: 1, lobby_center: 1 };
    var FIRST_NAMES = ["Alex", "Sam", "Jo", "Riley", "Casey", "Morgan", "Dre",
        "Nico", "Ivy", "Leo", "Mia", "Kai", "Ana", "Ben", "Zoe", "Eli",
        "Ada", "Ruth", "Max", "Pia"];

    // ---------- scene / runtime state ----------
    var scene, camera, renderer, controls, world, elevator;
    var ambientLight, hemiLight, sunLight;
    var agents = [];
    var seatReservations = {}; // "floor:wpName" -> agent id
    var targetOccupancy = DEFAULT_OCCUPANCY;
    var dayCount = 1;
    var lastReal = null;
    var hudT = 0;
    var hudEls = {};

    // ---------- helpers ----------
    function rand(a, b) { return a + Math.random() * (b - a); }
    function randInt(a, b) { return Math.floor(rand(a, b + 1)); }
    function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
    function fY(f) { return f * FH; }

    // ---------- simulated clock ----------
    var Clock = {
        simMinute: 7 * 60 + 30,
        timeScale: 120,
        tick: function (realDt) {
            this.simMinute += (realDt * this.timeScale) / 60;
            if (this.simMinute >= 24 * 60) {
                this.simMinute = 7 * 60 + 30;
                onNewDay();
            }
        },
        format: function () {
            var m = Math.floor(this.simMinute);
            var hh = Math.floor(m / 60) % 24;
            var mm = m % 60;
            var ap = hh >= 12 ? "PM" : "AM";
            var h12 = hh % 12;
            if (h12 === 0) h12 = 12;
            return " " + h12 + ":" + (mm < 10 ? "0" + mm : String(mm)) + " " + ap;
        }
    };

    // ---------- day / night lighting ----------
    var LIGHT_KEYS = [
        { t: 0,       bg: 0x07090f, bg2: 0x0e1420, sun: 0x223355, si: 0.0,  ai: 0.45, hi: 0.32 },
        { t: 5 * 60,  bg: 0x0a0e1a, bg2: 0x141c2c, sun: 0x553322, si: 0.1,  ai: 0.45, hi: 0.32 },
        { t: 6.5 * 60,bg: 0x3a2c44, bg2: 0x55405e, sun: 0xff9a3c, si: 0.6,  ai: 0.45, hi: 0.40 },
        { t: 8 * 60,  bg: 0x7d94c2, bg2: 0xa8bcd8, sun: 0xffd9a0, si: 0.85, ai: 0.48, hi: 0.50 },
        { t: 16 * 60, bg: 0x9fc0e8, bg2: 0xc4d8ec, sun: 0xffffff, si: 0.9,  ai: 0.50, hi: 0.55 },
        { t: 17.5 * 60,bg: 0x8a94c0, bg2: 0xb0a8c8, sun: 0xffcf8a, si: 0.85, ai: 0.48, hi: 0.50 },
        { t: 18.5 * 60,bg: 0x3a2c4a, bg2: 0x5e4468, sun: 0xff7a2a, si: 0.5,  ai: 0.45, hi: 0.36 },
        { t: 19.5 * 60,bg: 0x10131f, bg2: 0x1a2233, sun: 0x334466, si: 0.05, ai: 0.45, hi: 0.32 },
        { t: 24 * 60, bg: 0x07090f, bg2: 0x0e1420, sun: 0x223355, si: 0.0,  ai: 0.45, hi: 0.32 }
    ];

    function updateLighting() {
        var t = Clock.simMinute;
        var i = 0;
        while (i < LIGHT_KEYS.length - 2 && LIGHT_KEYS[i + 1].t <= t) i++;
        var a = LIGHT_KEYS[i], b = LIGHT_KEYS[i + 1];
        var span = b.t - a.t;
        var k = span > 0 ? (t - a.t) / span : 0;
        if (k < 0) k = 0;
        if (k > 1) k = 1;
        var c1 = new THREE.Color(a.bg), c2 = new THREE.Color(b.bg);
        c1.lerp(c2, k);
        scene.background = c1;
        var g1 = new THREE.Color(a.bg2), g2 = new THREE.Color(b.bg2);
        g1.lerp(g2, k);
        scene.fog.color = g1;
        var s1 = new THREE.Color(a.sun), s2 = new THREE.Color(b.sun);
        s1.lerp(s2, k);
        sunLight.color = s1;
        sunLight.intensity = a.si + (b.si - a.si) * k;
        ambientLight.intensity = a.ai + (b.ai - a.ai) * k;
        hemiLight.intensity = a.hi + (b.hi - a.hi) * k;
    }

    // ---------- schedules ----------
    function freshSchedule() {
        var sched = {
            arrivalTime: rand(8 * 60 + 15, 9 * 60 + 30),
            lunchTime: rand(11 * 60 + 30, 13 * 60 + 30),
            lunchDuration: randInt(25, 60),
            departureTime: Math.random() < 0.85
                ? rand(16 * 60 + 45, 18 * 60 + 30)
                : rand(18 * 60 + 30, 19 * 60 + 45),
            plannedMeetingTimes: []
        };
        var nMeetings = randInt(0, 2);
        if (nMeetings >= 1) sched.plannedMeetingTimes.push(rand(10 * 60, 11 * 60 + 45));
        if (nMeetings >= 2) sched.plannedMeetingTimes.push(rand(14 * 60, 16 * 60 + 15));
        return sched;
    }

    // ---------- agent pool ----------
    function buildAgents() {
        agents = [];
        var i;
        for (i = 0; i < MAX_WORKERS; i++) {
            var letter = OFFICE_LETTERS[i % 4];
            agents.push({
                id: i,
                role: "WORKER",
                name: FIRST_NAMES[i % FIRST_NAMES.length] + " " + (40 + i),
                homeFloor: 1 + Math.floor(i / 4),
                deskId: i,
                deskWpName: "office" + letter + "_desk",
                deskDoorWpName: "office" + letter + "_door",
                mesh: createPerson({}),
                floor: 0,
                posNode: null,
                state: "DISABLED",
                hasLunched: false,
                schedule: freshSchedule(),
                plan: null,
                idx: 0,
                speed: rand(WALK_MIN, WALK_MAX),
                entryExempt: false
            });
        }
        for (i = 0; i < MAX_VISITORS; i++) {
            agents.push({
                id: MAX_WORKERS + i,
                role: "VISITOR",
                name: FIRST_NAMES[i % FIRST_NAMES.length] + " " + (100 + i),
                homeFloor: null,
                deskId: null,
                deskWpName: null,
                deskDoorWpName: null,
                mesh: createPerson({}),
                floor: 0,
                posNode: null,
                state: "DISABLED",
                hasLunched: false,
                schedule: freshSchedule(),
                plan: null,
                idx: 0,
                speed: rand(WALK_MIN, WALK_MAX),
                entryExempt: false
            });
        }
    }

    function applyOccupancy() {
        for (var i = 0; i < agents.length; i++) {
            var a = agents[i];
            var enabled = a.id < targetOccupancy;
            if (a.state === "DISABLED" && enabled) {
                a.hasLunched = false;
                a.schedule = freshSchedule();
                a.plan = null;
                a.idx = 0;
                a.state = "AWAY";
            } else if (a.state === "AWAY" && !enabled) {
                a.state = "DISABLED";
            }
            // Mid-workday agents keep running; they finish naturally,
            // reach GONE, and get parked on the next day wrap.
        }
    }

    function countPresent() {
        var n = 0;
        for (var i = 0; i < agents.length; i++) {
            var s = agents[i].state;
            if (s !== "DISABLED" && s !== "AWAY" && s !== "GONE") n++;
        }
        return n;
    }

    function onNewDay() {
        dayCount++;
        seatReservations = {};
        for (var i = 0; i < agents.length; i++) {
            var a = agents[i];
            a.hasLunched = false;
            a.schedule = freshSchedule();
            a.plan = null;
            a.idx = 0;
            a.posNode = null;
            a.entryExempt = false;
            a.mesh.userData.isWalking = false;
            a.mesh.userData.isSitting = false;
            a.state = (a.id < targetOccupancy) ? "AWAY" : "DISABLED";
        }
        elevator.reset();
    }

    function topUpVisitors() {
        var t = Clock.simMinute;
        if (t < 8 * 60 || t > 20 * 60) return;
        var deficit = targetOccupancy - countPresent();
        if (deficit <= 0) return;
        for (var i = 0; i < agents.length && deficit > 0; i++) {
            var a = agents[i];
            if (a.role !== "VISITOR") continue;
            if (a.state !== "AWAY" && a.state !== "GONE") continue;
            a.schedule.arrivalTime = t + randInt(0, 6);
            a.state = "AWAY";
            deficit--;
        }
    }

    // ---------- seat reservations ----------
    function reserveSeat(floor, wpName, agentId) {
        var key = floor + ":" + wpName;
        if (seatReservations[key] === undefined) {
            seatReservations[key] = agentId;
            return true;
        }
        return false;
    }

    function reserveAnySeat(floor, candidates, agentId) {
        var order = candidates.slice();
        for (var i = order.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var tmp = order[i]; order[i] = order[j]; order[j] = tmp;
        }
        for (var k = 0; k < order.length; k++) {
            if (reserveSeat(floor, order[k], agentId)) return order[k];
        }
        return null;
    }

    function releaseSeatsFor(a) {
        for (var key in seatReservations) {
            if (seatReservations[key] === a.id) delete seatReservations[key];
        }
    }

    // ---------- primitive actions ----------
    function computeWalk(a, floor, wpName) {
        var fd = world.floors[floor];
        var nodes = fd.nodes;
        if (!nodes || !nodes[wpName]) return null;
        var startName = null;
        if (a.floor === floor && a.posNode && nodes[a.posNode]) startName = a.posNode;
        if (!startName) {
            var p = a.mesh.position;
            var best = null, bestD = Infinity;
            for (var k in nodes) {
                var n = nodes[k];
                var dx = n.x - p.x, dz = n.z - p.z;
                var d2 = dx * dx + dz * dz;
                if (d2 < bestD) { bestD = d2; best = k; }
            }
            if (!best) return null;
            startName = best;
        }
        var pts = bfsPath(nodes, startName, wpName);
        if (!pts || pts.length === 0) {
            return [{ x: nodes[wpName].x, y: fY(floor), z: nodes[wpName].z }];
        }
        var out = [];
        var skip = (startName === wpName) ? 0 : 1;
        for (var i = skip; i < pts.length; i++) {
            out.push({ x: pts[i].x, y: fY(floor), z: pts[i].z });
        }
        if (out.length === 0) {
            out.push({ x: nodes[wpName].x, y: fY(floor), z: nodes[wpName].z });
        }
        return out;
    }

    function moveAlong(a, act, dt) {
        var p = a.mesh.position;
        var target = act.path[0];
        var dx = target.x - p.x, dz = target.z - p.z;
        var d = Math.sqrt(dx * dx + dz * dz);
        var step = a.speed * dt;
        if (d <= Math.max(step, 0.06)) {
            p.x = target.x;
            p.z = target.z;
            p.y = target.y;
            act.path.shift();
        } else {
            p.x += (dx / d) * step;
            p.z += (dz / d) * step;
            p.y = target.y;
            a.mesh.rotation.y = Math.atan2(dx, dz);
        }
        var prog = (act._sx === undefined) ? -1 : Math.abs(p.x - act._sx) + Math.abs(p.z - act._sz);
        act._sx = p.x;
        act._sz = p.z;
        if (prog >= 0 && prog < 0.005) act._stallT = (act._stallT || 0) + dt;
        else act._stallT = 0;
        if (act._stallT > (act.stallLimit || 1.2)) {
            act._stallT = 0;
            act.path.shift(); // skip the blocking waypoint
        }
        return act.path.length === 0;
    }

    function stepAction(a, act, dt) {
        var p = a.mesh.position;
        switch (act.type) {
            case "ENTER_STATE":
                a.state = act.state;
                return true;

            case "MARK_LUNCHED":
                a.hasLunched = true;
                return true;

            case "RELEASE_SEAT":
                releaseSeatsFor(a);
                return true;

            case "PICK_NEXT_ACTIVITY":
                chooseNextActivity(a);
                return true;

            case "WAIT_SIM":
                if (act.untilMin === undefined) act.untilMin = Clock.simMinute + act.minutes;
                a.mesh.userData.isWalking = false;
                return Clock.simMinute >= act.untilMin;

            case "EXIT_BUILDING":
                scene.remove(a.mesh);
                a.mesh.userData.isWalking = false;
                a.mesh.userData.isSitting = false;
                a.state = "GONE";
                return true;

            case "STAND":
                a.mesh.userData.isSitting = false;
                a.mesh.userData.isWalking = false;
                if (a.mesh.parent === elevator.car) p.y = 0;
                else p.y = fY(a.floor);
                return true;

            case "WALK_TO_WP": {
                if (!act.path) {
                    act.path = computeWalk(a, act.floor, act.wpName);
                    act.stallLimit = ENTRANCE_CHAIN[act.wpName] ? 1.5 : 1.2;
                    a.entryExempt = (act.floor === 0 && !!ENTRANCE_CHAIN[act.wpName]);
                    a.floor = act.floor;
                    if (act.path) a.mesh.userData.isWalking = true;
                }
                if (!act.path || act.path.length === 0) {
                    var n = world.floors[act.floor].nodes[act.wpName];
                    if (n) { p.x = n.x; p.y = fY(act.floor); p.z = n.z; }
                    a.posNode = act.wpName;
                    a.floor = act.floor;
                    a.entryExempt = false;
                    a.mesh.userData.isWalking = false;
                    return true;
                }
                if (moveAlong(a, act, dt)) {
                    a.posNode = act.wpName;
                    a.floor = act.floor;
                    a.entryExempt = false;
                    a.mesh.userData.isWalking = false;
                    return true;
                }
                return false;
            }

            case "WAIT_AT_PANEL": {
                a.state = "WAITING_ELEVATOR";
                a.mesh.userData.isWalking = false;
                if (act.dir > 0) elevator.callUp(act.floor);
                else elevator.callDown(act.floor);
                return elevator.isAcceptingAt(act.floor, act.dir) &&
                    elevator.currentCapacityFree() > 0;
            }

            case "ENTER_ELEVATOR": {
                if (a.floor === act.toFloor) return true;
                a.state = "IN_CAR";
                var wantDir = act.toFloor > a.floor ? 1 : -1;
                if (act.phase === undefined) act.phase = "reserve";

                // Failsafe: the car left without us (should not happen while
                // our reservation holds the door). Force-complete boarding.
                if (act.spot && a.mesh.parent !== elevator.car &&
                        elevator.logic.state === "MOVING") {
                    elevator.car.attach(a.mesh);
                    p.x = act.spot.x; p.y = act.spot.y; p.z = act.spot.z;
                    a.mesh.position.y = act.spot.y;
                    elevator.completeBoard(a.mesh);
                    a.mesh.rotation.y = 0;
                    a.mesh.userData.isWalking = false;
                    return true;
                }

                if (act.phase === "reserve") {
                    if (wantDir > 0) elevator.callUp(a.floor);
                    else elevator.callDown(a.floor);
                    if (elevator.isAcceptingAt(a.floor, wantDir) &&
                            elevator.currentCapacityFree() > 0) {
                        var spot = elevator.reserveBoardingSpot(a.mesh);
                        if (spot) {
                            act.spot = spot;
                            act.phase = "toDoor";
                            act._stallT = 0;
                            act._sx = undefined;
                        }
                    }
                    a.mesh.userData.isWalking = false;
                    return false;
                }

                if (act.phase === "toDoor") {
                    var lane = { x: act.spot.x, y: fY(a.floor), z: CAR_FACE_Z + 0.15 };
                    var dx = lane.x - p.x, dz = lane.z - p.z;
                    var d = Math.sqrt(dx * dx + dz * dz);
                    var step = a.speed * dt;
                    a.mesh.userData.isWalking = d > 0.08;
                    if (d <= Math.max(step, 0.08)) {
                        p.x = lane.x; p.z = lane.z;
                        elevator.car.attach(a.mesh);
                        act.phase = "inCar";
                        act._stallT = 0;
                        act._sx = undefined;
                    } else {
                        p.x += (dx / d) * step;
                        p.z += (dz / d) * step;
                        a.mesh.rotation.y = Math.atan2(dx, dz);
                    }
                    if (act._sx !== undefined) {
                        var pg = Math.abs(p.x - act._sx) + Math.abs(p.z - act._sz);
                        if (pg < 0.005) act._stallT += dt; else act._stallT = 0;
                        if (act._stallT > 1.5) {
                            p.x = lane.x; p.z = lane.z;
                            elevator.car.attach(a.mesh);
                            act.phase = "inCar";
                            act._stallT = 0;
                            act._sx = undefined;
                        }
                    }
                    act._sx = p.x;
                    act._sz = p.z;
                    return false;
                }

                // phase "inCar": car-local walk to the reserved spot.
                a.mesh.userData.isWalking = true;
                var tx = act.spot.x, ty = act.spot.y, tz = act.spot.z;
                var dxx = tx - p.x, dzz = tz - p.z;
                var dd = Math.sqrt(dxx * dxx + dzz * dzz);
                var stp = a.speed * dt;
                if (dd <= Math.max(stp, 0.08)) {
                    p.x = tx; p.y = ty; p.z = tz;
                    elevator.completeBoard(a.mesh);
                    a.mesh.rotation.y = 0;
                    a.mesh.userData.isWalking = false;
                    return true;
                }
                p.x += (dxx / dd) * stp;
                p.z += (dzz / dd) * stp;
                a.mesh.rotation.y = Math.atan2(dxx, dzz);
                return false;
            }

            case "PRESS_FLOOR":
                elevator.pressDestination(act.floor);
                return true;

            case "WAIT_FOR_FLOOR":
                a.state = "IN_CAR";
                a.mesh.userData.isWalking = false;
                return elevator.logic.state === "DOOR_OPEN" &&
                    elevator.logic.currentFloor === act.floor;

            case "EXIT_ELEVATOR": {
                a.state = "ON_FLOOR";
                if (!act.done) {
                    elevator.registerDisembark(a.mesh);
                    scene.attach(a.mesh); // car -> scene, keeps world position
                    a.floor = act.toFloor;
                    a.mesh.userData.isWalking = true;
                    act.done = true;
                }
                var fd = world.floors[a.floor];
                var ew = fd.nodes["elevWait"];
                var dxe = ew.x - p.x, dze = ew.z - p.z;
                var de = Math.sqrt(dxe * dxe + dze * dze);
                var ste = a.speed * dt;
                if (de <= Math.max(ste, 0.08)) {
                    p.x = ew.x; p.y = fY(a.floor); p.z = ew.z;
                    a.posNode = "elevWait";
                    elevator.completeDisembark(a.mesh);
                    a.mesh.userData.isWalking = false;
                    return true;
                }
                p.x += (dxe / de) * ste;
                p.z += (dze / de) * ste;
                p.y = fY(a.floor);
                a.mesh.rotation.y = Math.atan2(dxe, dze);
                return false;
            }

            case "SIT": {
                var fd2 = world.floors[act.floor];
                var node = fd2 ? fd2.nodes[act.wpName] : null;
                if (!node) return true;
                var st = fd2.sitTargets ? fd2.sitTargets[act.wpName] : null;
                var key = act.floor + ":" + act.wpName;
                var ownedByOther = seatReservations[key] !== undefined &&
                    seatReservations[key] !== a.id;
                var canSit = !!(st && st.sit) && !ownedByOther;
                if (canSit) {
                    p.x = node.x;
                    p.z = node.z;
                    p.y = fY(act.floor) - 0.35; // hips sink to the chair seat
                    a.mesh.rotation.y = (st && typeof st.facing === "number") ? st.facing : 0;
                    a.mesh.userData.isSitting = true;
                } else {
                    var ang = Math.random() * Math.PI * 2;
                    var rad = rand(0.35, 0.75);
                    p.x = node.x + Math.cos(ang) * rad;
                    p.z = node.z + Math.sin(ang) * rad;
                    p.y = fY(act.floor);
                    a.mesh.rotation.y = (st && typeof st.facing === "number") ? st.facing : ang;
                    a.mesh.userData.isSitting = false;
                }
                a.mesh.userData.isWalking = false;
                a.posNode = act.wpName;
                a.floor = act.floor;
                return true;
            }

            default:
                return true;
        }
    }

    // ---------- ride helper ----------
    function ride(a, fromFloor, toFloor) {
        var out = [];
        if (toFloor === fromFloor) return out;
        var dir = toFloor > fromFloor ? 1 : -1;
        out.push({ type: "WAIT_AT_PANEL", floor: fromFloor, dir: dir, toFloor: toFloor });
        out.push({ type: "ENTER_ELEVATOR", toFloor: toFloor });
        out.push({ type: "PRESS_FLOOR", floor: toFloor });
        out.push({ type: "WAIT_FOR_FLOOR", floor: toFloor });
        out.push({ type: "EXIT_ELEVATOR", toFloor: toFloor });
        out.push({ type: "ENTER_STATE", state: "ON_FLOOR" });
        return out;
    }

    // ---------- plan compilers ----------
    function planArriveToDesk(a) {
        var home = a.homeFloor;
        var plan = [
            { type: "ENTER_STATE", state: "ARRIVING" },
            { type: "WALK_TO_WP", floor: 0, wpName: "front_door_threshold" },
            { type: "WALK_TO_WP", floor: 0, wpName: "entrance" },
            { type: "WALK_TO_WP", floor: 0, wpName: "lobby_center" }
        ];
        plan = plan.concat(ride(a, 0, home));
        plan.push({ type: "WALK_TO_WP", floor: home, wpName: a.deskWpName });
        plan.push({ type: "SIT", floor: home, wpName: a.deskWpName });
        plan.push({ type: "ENTER_STATE", state: "AT_DESK" });
        plan.push({ type: "WAIT_SIM", minutes: randInt(10, 25) });
        plan.push({ type: "PICK_NEXT_ACTIVITY" });
        a.plan = plan;
        a.idx = 0;
    }

    function planGoToLunch(a) {
        var home = a.homeFloor;
        var seat = reserveAnySeat(0, BISTRO_SEATS, a.id);
        var plan = [
            { type: "STAND" },
            { type: "ENTER_STATE", state: "AT_LUNCH" },
            { type: "WALK_TO_WP", floor: home, wpName: "lobby_center" }
        ];
        if (home !== 0) plan = plan.concat(ride(a, home, 0));
        if (seat) {
            plan.push({ type: "WALK_TO_WP", floor: 0, wpName: seat });
            plan.push({ type: "SIT", floor: 0, wpName: seat });
        } else {
            plan.push({ type: "WALK_TO_WP", floor: 0, wpName: "cafe_order" });
            plan.push({ type: "SIT", floor: 0, wpName: "cafe_order" });
        }
        plan.push({ type: "WAIT_SIM", minutes: a.schedule.lunchDuration });
        plan.push({ type: "STAND" });
        if (seat) plan.push({ type: "RELEASE_SEAT" });
        plan.push({ type: "MARK_LUNCHED" });
        var back = [];
        if (0 !== home) back = ride(a, 0, home);
        plan = plan.concat(back);
        plan.push({ type: "WALK_TO_WP", floor: home, wpName: a.deskWpName });
        plan.push({ type: "SIT", floor: home, wpName: a.deskWpName });
        plan.push({ type: "ENTER_STATE", state: "AT_DESK" });
        plan.push({ type: "WAIT_SIM", minutes: randInt(10, 20) });
        plan.push({ type: "PICK_NEXT_ACTIVITY" });
        a.plan = plan;
        a.idx = 0;
    }

    function planVisitLounge(a) {
        var home = a.homeFloor;
        var spot = reserveAnySeat(home, LOUNGE_SPOTS, a.id);
        var plan = [
            { type: "STAND" },
            { type: "ENTER_STATE", state: "AT_BREAK" }
        ];
        if (spot) {
            plan.push({ type: "WALK_TO_WP", floor: home, wpName: spot });
            plan.push({ type: "SIT", floor: home, wpName: spot });
        } else {
            var standSpot = (home === 0)
                ? pick(LOBBY_WANDER)
                : (Math.random() < 0.5 ? "water_cooler" : "hall_stand_N");
            plan.push({ type: "WALK_TO_WP", floor: home, wpName: standSpot });
            plan.push({ type: "SIT", floor: home, wpName: standSpot });
        }
        plan.push({ type: "WAIT_SIM", minutes: randInt(5, 12) });
        plan.push({ type: "STAND" });
        if (spot) plan.push({ type: "RELEASE_SEAT" });
        plan.push({ type: "WALK_TO_WP", floor: home, wpName: a.deskWpName });
        plan.push({ type: "SIT", floor: home, wpName: a.deskWpName });
        plan.push({ type: "ENTER_STATE", state: "AT_DESK" });
        plan.push({ type: "WAIT_SIM", minutes: randInt(10, 25) });
        plan.push({ type: "PICK_NEXT_ACTIVITY" });
        a.plan = plan;
        a.idx = 0;
    }

    function planAttendMeeting(a, fromSchedule) {
        var home = a.homeFloor;
        var mFloor = (Math.random() < 0.65 || fromSchedule) ? home : randInt(1, FLOOR_COUNT - 1);
        var seat = reserveAnySeat(mFloor, CONF_SEATS, a.id);
        if (!seat) {
            // All four seats taken elsewhere: fall back to a lounge break.
            planVisitLounge(a);
            return;
        }
        var plan = [
            { type: "STAND" },
            { type: "ENTER_STATE", state: "IN_MEETING" },
            { type: "WALK_TO_WP", floor: home, wpName: "lobby_center" }
        ];
        if (mFloor !== home) {
            if (home !== 0) plan = plan.concat(ride(a, home, 0));
            plan = plan.concat(ride(a, 0, mFloor));
        } else {
            plan = plan;
        }
        plan.push({ type: "WALK_TO_WP", floor: mFloor, wpName: seat });
        plan.push({ type: "SIT", floor: mFloor, wpName: seat });
        plan.push({ type: "WAIT_SIM", minutes: randInt(22, 45) });
        plan.push({ type: "STAND" });
        plan.push({ type: "RELEASE_SEAT" });
        plan.push({ type: "ENTER_STATE", state: "ON_FLOOR" });
        var back = [];
        if (mFloor !== home) {
            if (mFloor !== 0) back = back.concat(ride(a, mFloor, 0));
            back = back.concat(ride(a, 0, home));
        }
        plan = plan.concat(back);
        plan.push({ type: "WALK_TO_WP", floor: home, wpName: a.deskWpName });
        plan.push({ type: "SIT", floor: home, wpName: a.deskWpName });
        plan.push({ type: "ENTER_STATE", state: "AT_DESK" });
        plan.push({ type: "WAIT_SIM", minutes: randInt(10, 25) });
        plan.push({ type: "PICK_NEXT_ACTIVITY" });
        a.plan = plan;
        a.idx = 0;
    }

    function planVisitCoworker(a) {
        var home = a.homeFloor;
        var cands = [];
        for (var i = 0; i < agents.length; i++) {
            var c = agents[i];
            if (c.id === a.id || c.state !== "AT_DESK") continue;
            cands.push(c);
        }
        var cw = (cands.length > 0) ? pick(cands) : null;
        var doorName = (cw && cw.deskDoorWpName) ? cw.deskDoorWpName : "elevWait";
        var talkFloor = (cw && cw.homeFloor) ? cw.homeFloor : home;
        var plan = [
            { type: "STAND" },
            { type: "ENTER_STATE", state: "VISITING" },
            { type: "WALK_TO_WP", floor: home, wpName: "lobby_center" }
        ];
        if (talkFloor !== home) {
            if (home !== 0) plan = plan.concat(ride(a, home, 0));
            plan = plan.concat(ride(a, 0, talkFloor));
        }
        plan.push({ type: "WALK_TO_WP", floor: talkFloor, wpName: doorName });
        plan.push({ type: "WAIT_SIM", minutes: randInt(6, 18) });
        var back = [];
        if (talkFloor !== home) {
            if (talkFloor !== 0) back = back.concat(ride(a, talkFloor, 0));
            back = back.concat(ride(a, 0, home));
        }
        plan = plan.concat(back);
        plan.push({ type: "WALK_TO_WP", floor: home, wpName: a.deskWpName });
        plan.push({ type: "SIT", floor: home, wpName: a.deskWpName });
        plan.push({ type: "ENTER_STATE", state: "AT_DESK" });
        plan.push({ type: "WAIT_SIM", minutes: randInt(10, 25) });
        plan.push({ type: "PICK_NEXT_ACTIVITY" });
        a.plan = plan;
        a.idx = 0;
    }

    function planLeaveBuilding(a) {
        var home = a.homeFloor;
        var plan = [
            { type: "STAND" },
            { type: "RELEASE_SEAT" },
            { type: "ENTER_STATE", state: "LEAVING" },
            { type: "WALK_TO_WP", floor: home, wpName: "lobby_center" }
        ];
        if (home !== 0) plan = plan.concat(ride(a, home, 0));
        plan.push({ type: "WALK_TO_WP", floor: 0, wpName: "entrance" });
        plan.push({ type: "WALK_TO_WP", floor: 0, wpName: "front_door_threshold" });
        plan.push({ type: "WALK_TO_WP", floor: 0, wpName: "outside" });
        plan.push({ type: "EXIT_BUILDING" });
        a.plan = plan;
        a.idx = 0;
    }

    function visitorActivity(a) {
        var r = Math.random();
        var act = [];
        if (r < 0.10) {
            // bistro table
            var seat = reserveAnySeat(0, BISTRO_SEATS, a.id);
            if (seat) {
                act.push({ type: "WALK_TO_WP", floor: 0, wpName: seat });
                act.push({ type: "SIT", floor: 0, wpName: seat });
                act.push({ type: "WAIT_SIM", minutes: randInt(6, 12) });
                act.push({ type: "STAND" });
                act.push({ type: "RELEASE_SEAT" });
            } else {
                act.push({ type: "WALK_TO_WP", floor: 0, wpName: "cafe_order" });
                act.push({ type: "SIT", floor: 0, wpName: "cafe_order" });
                act.push({ type: "WAIT_SIM", minutes: randInt(2, 4) });
                act.push({ type: "STAND" });
            }
        } else if (r < 0.16) {
            // cafe counter
            act.push({ type: "WALK_TO_WP", floor: 0, wpName: "cafe_order" });
            act.push({ type: "SIT", floor: 0, wpName: "cafe_order" });
            act.push({ type: "WAIT_SIM", minutes: randInt(1, 3) });
            act.push({ type: "STAND" });
        } else if (r < 0.30) {
            // front lounge
            var fs = reserveAnySeat(0, ["lobby_fc0", "lobby_fc1", "lobby_fca", "lobby_fcb"], a.id);
            if (fs) {
                act.push({ type: "WALK_TO_WP", floor: 0, wpName: fs });
                act.push({ type: "SIT", floor: 0, wpName: fs });
                act.push({ type: "WAIT_SIM", minutes: randInt(5, 12) });
                act.push({ type: "STAND" });
                act.push({ type: "RELEASE_SEAT" });
            } else {
                act.push({ type: "WALK_TO_WP", floor: 0, wpName: pick(LOBBY_WANDER) });
                act.push({ type: "SIT", floor: 0, wpName: pick(LOBBY_WANDER) });
                act.push({ type: "WAIT_SIM", minutes: randInt(4, 10) });
                act.push({ type: "STAND" });
            }
        } else if (r < 0.42) {
            // back lounge / conversation pit
            var bs = reserveAnySeat(0, ["back_lounge_N", "back_lounge_S", "pit_N", "pit_S", "pit_E", "pit_W"], a.id);
            if (bs) {
                act.push({ type: "WALK_TO_WP", floor: 0, wpName: bs });
                act.push({ type: "SIT", floor: 0, wpName: bs });
                act.push({ type: "WAIT_SIM", minutes: randInt(5, 12) });
                act.push({ type: "STAND" });
                act.push({ type: "RELEASE_SEAT" });
            } else {
                act.push({ type: "WALK_TO_WP", floor: 0, wpName: pick(LOBBY_WANDER) });
                act.push({ type: "SIT", floor: 0, wpName: pick(LOBBY_WANDER) });
                act.push({ type: "WAIT_SIM", minutes: randInt(4, 10) });
                act.push({ type: "STAND" });
            }
        } else if (r < 0.52) {
            // reception / kiosk / water cooler
            var s = pick(LOBBY_STANDS);
            act.push({ type: "WALK_TO_WP", floor: 0, wpName: s });
            act.push({ type: "SIT", floor: 0, wpName: s });
            act.push({ type: "WAIT_SIM", minutes: randInt(1, 3) });
            act.push({ type: "STAND" });
        } else if (r < 0.62) {
            // lobby loiter
            act.push({ type: "WALK_TO_WP", floor: 0, wpName: pick(LOBBY_WANDER) });
            act.push({ type: "SIT", floor: 0, wpName: pick(LOBBY_WANDER) });
            act.push({ type: "WAIT_SIM", minutes: randInt(3, 8) });
            act.push({ type: "STAND" });
        } else if (r < 0.77) {
            // ride up to an office-floor lounge
            var f = randInt(1, FLOOR_COUNT - 1);
            var ls = reserveAnySeat(f, LOUNGE_SPOTS, a.id);
            act = act.concat(ride(a, 0, f));
            if (ls) {
                act.push({ type: "WALK_TO_WP", floor: f, wpName: ls });
                act.push({ type: "SIT", floor: f, wpName: ls });
                act.push({ type: "WAIT_SIM", minutes: randInt(5, 10) });
                act.push({ type: "STAND" });
                act.push({ type: "RELEASE_SEAT" });
            } else {
                act.push({ type: "WALK_TO_WP", floor: f, wpName: "water_cooler" });
                act.push({ type: "SIT", floor: f, wpName: "water_cooler" });
                act.push({ type: "WAIT_SIM", minutes: randInt(3, 6) });
                act.push({ type: "STAND" });
            }
            act = act.concat(ride(a, f, 0));
        } else {
            // sit in on a meeting (client / external attendee)
            var mf = randInt(1, FLOOR_COUNT - 1);
            var cs = reserveAnySeat(mf, CONF_SEATS, a.id);
            if (cs) {
                act = act.concat(ride(a, 0, mf));
                act.push({ type: "WALK_TO_WP", floor: mf, wpName: cs });
                act.push({ type: "SIT", floor: mf, wpName: cs });
                act.push({ type: "WAIT_SIM", minutes: randInt(15, 40) });
                act.push({ type: "STAND" });
                act.push({ type: "RELEASE_SEAT" });
                act = act.concat(ride(a, mf, 0));
            } else {
                // all seats taken: fall back to a lobby loiter
                act.push({ type: "WALK_TO_WP", floor: 0, wpName: pick(LOBBY_WANDER) });
                act.push({ type: "SIT", floor: 0, wpName: pick(LOBBY_WANDER) });
                act.push({ type: "WAIT_SIM", minutes: randInt(3, 8) });
                act.push({ type: "STAND" });
            }
        }
        act.push({ type: "ENTER_STATE", state: "AT_BREAK" });
        return act;
    }

    function planVisitorVisit(a) {
        var plan = [
            { type: "ENTER_STATE", state: "ARRIVING" },
            { type: "WALK_TO_WP", floor: 0, wpName: "front_door_threshold" },
            { type: "WALK_TO_WP", floor: 0, wpName: "entrance" },
            { type: "WALK_TO_WP", floor: 0, wpName: "lobby_center" },
            { type: "ENTER_STATE", state: "VISITING" }
        ];
        plan = plan.concat(visitorActivity(a));
        plan.push({ type: "WALK_TO_WP", floor: 0, wpName: "lobby_center" });
        plan.push({ type: "WALK_TO_WP", floor: 0, wpName: "entrance" });
        plan.push({ type: "WALK_TO_WP", floor: 0, wpName: "front_door_threshold" });
        plan.push({ type: "WALK_TO_WP", floor: 0, wpName: "outside" });
        plan.push({ type: "EXIT_BUILDING" });
        a.plan = plan;
        a.idx = 0;
    }

    // ---------- decision logic ----------
    function chooseNextActivity(a) {
        var t = Clock.simMinute;
        var sched = a.schedule;
        if (t >= sched.departureTime) {
            planLeaveBuilding(a);
            return;
        }
        for (var i = 0; i < sched.plannedMeetingTimes.length; i++) {
            if (t >= sched.plannedMeetingTimes[i]) {
                sched.plannedMeetingTimes.splice(i, 1);
                planAttendMeeting(a, true);
                return;
            }
        }
        if (t >= sched.lunchTime && !a.hasLunched) {
            planGoToLunch(a);
            return;
        }
        var r = Math.random();
        if (r < 0.14) planAttendMeeting(a, false);
        else if (r < 0.26) planVisitLounge(a);
        else if (r < 0.41) planVisitCoworker(a);
        else {
            a.plan = [{ type: "WAIT_SIM", minutes: randInt(18, 65) }, { type: "PICK_NEXT_ACTIVITY" }];
            a.idx = 0;
        }
    }

    // ---------- spawning ----------
    function spawnAgent(a) {
        var n = world.floors[0].nodes["outside"];
        var p = a.mesh.position;
        p.x = n.x + rand(-1.1, 1.1);
        p.y = 0;
        p.z = n.z + rand(-0.75, 0.75);
        a.mesh.rotation.y = Math.PI;
        a.mesh.userData.isWalking = false;
        a.mesh.userData.isSitting = false;
        a.floor = 0;
        a.posNode = null;
        scene.add(a.mesh);
        if (a.role === "WORKER") planArriveToDesk(a);
        else planVisitorVisit(a);
    }

    // ---------- per-frame agent step ----------
    function stepAgent(a, dt) {
        if (a.state === "AWAY" && Clock.simMinute >= a.schedule.arrivalTime) {
            spawnAgent(a);
        }
        // End-of-day override for workers stuck in a low-priority state.
        if (a.role === "WORKER" &&
            Clock.simMinute >= a.schedule.departureTime &&
            a.state !== "LEAVING" && a.state !== "IN_CAR" &&
            a.state !== "WAITING_ELEVATOR" && a.state !== "ARRIVING" &&
            a.state !== "GONE" && a.plan) {
            planLeaveBuilding(a);
        }
        if (!a.plan || a.idx >= a.plan.length || a.state === "GONE" ||
                a.state === "DISABLED") {
            return;
        }
        var guard = 16;
        while (a.idx < a.plan.length && guard-- > 0) {
            var act = a.plan[a.idx];
            if (act.type === "PICK_NEXT_ACTIVITY") {
                a.idx++;
                continue; // the new plan is dispatched immediately
            }
            if (stepAction(a, act, dt)) a.idx++;
            else break;
        }
        // Safety: exhausted without a terminal state.
        if (a.plan && a.idx >= a.plan.length && a.state !== "GONE" && a.state !== "DISABLED") {
            if (a.role === "WORKER") {
                a.plan = null;
                chooseNextActivity(a);
            } else {
                scene.remove(a.mesh);
                a.mesh.userData.isWalking = false;
                a.state = "GONE";
            }
        }
    }

    // ---------- anti-bunching soft separation ----------
    function applyCollisions(dt) {
        var minD = PERSON_R * 1.7;
        var minD2 = minD * minD;
        var n = agents.length;
        var i, j, a, b;
        for (var pass = 0; pass < 3; pass++) {
            for (i = 0; i < n; i++) {
                a = agents[i];
                if (a.state === "GONE" || a.state === "DISABLED" || a.state === "AWAY" ||
                        a.state === "ARRIVING") continue;
                if (a.mesh.userData.isSitting) continue;
                var ca = a.plan ? a.plan[Math.min(a.idx, (a.plan ? a.plan.length - 1 : 0))] : null;
                if (ca && ca.type === "ENTER_ELEVATOR") continue;
                for (j = i + 1; j < n; j++) {
                    b = agents[j];
                    if (b.state === "GONE" || b.state === "DISABLED" || b.state === "AWAY" ||
                            b.state === "ARRIVING") continue;
                    if (b.mesh.userData.isSitting) continue;
                    if (a.mesh.parent !== b.mesh.parent) continue;
                    var dy = b.mesh.position.y - a.mesh.position.y;
                    if (dy > 1 || dy < -1) continue;
                    var dx = b.mesh.position.x - a.mesh.position.x;
                    var dz = b.mesh.position.z - a.mesh.position.z;
                    var d2 = dx * dx + dz * dz;
                    if (d2 >= minD2) continue;
                    if (d2 < 0.000001) {
                        var ang = Math.random() * Math.PI * 2;
                        dx = Math.cos(ang);
                        dz = Math.sin(ang);
                        d2 = 1;
                    }
                    var d = Math.sqrt(d2);
                    var push = Math.min(0.18, (minD - d) / 2);
                    var nx = dx / d, nz = dz / d;
                    a.mesh.position.x -= nx * push;
                    a.mesh.position.z -= nz * push;
                    b.mesh.position.x += nx * push;
                    b.mesh.position.z += nz * push;
                }
            }
        }
        void dt;
    }

    // ---------- HUD ----------
    function makeHud() {
        var el = document.createElement("div");
        el.style.position = "fixed";
        el.style.top = "10px";
        el.style.left = "10px";
        el.style.zIndex = "10";
        el.style.fontFamily = "monospace";
        el.style.fontSize = "13px";
        el.style.color = "#ffd97a";
        el.style.background = "rgba(8,10,16,0.74)";
        el.style.padding = "8px 12px";
        el.style.borderRadius = "8px";
        el.style.pointerEvents = "none";
        el.style.minWidth = "250px";
        var speedSlider =
            "<input type='range' id='hudSpeed' min='0' max='3000' value='1000'>" +
            "<input type='range' id='hudOcc' min='1' max='" + MAX_OCCUPANCY + "' value='" +
            targetOccupancy + "'>";
        el.innerHTML =
            "<div id='hudClock' style='font-size:22px;font-weight:bold'></div>" +
            "<div>Day <span id='hudDay'>" + dayCount + "</span>" +
            " &nbsp;people: <span id='hudPeople'></span></div>" +
            "<div id='hudStates'></div>" +
            "<div id='hudElv'></div>" +
            "<div style='pointer-events:auto'>speed <span id='hudSpeedVal'></span>x " +
            "<span style='display:inline-block;width:120px'>" + speedSlider.replace("><input", " style='width:60px'><input") + "</span></div>" +
            "<div id='hudOccLabel' style='pointer-events:auto'></div>";
        document.body.appendChild(el);

        var speed = el.querySelector("#hudSpeed");
        var occ = el.querySelector("#hudOcc");
        function onSpeed() {
            var v = Math.max(0, Math.min(3000, parseInt(speed.value, 10) || 0));
            Clock.timeScale = Math.round(Math.pow(600, v / 3000));
            hudEls.speedVal.textContent = String(Clock.timeScale);
        }
        function onOcc() {
            targetOccupancy = Math.max(1, Math.min(MAX_OCCUPANCY, parseInt(occ.value, 10) || 1));
            applyOccupancy();
            hudEls.occLabel.textContent = "Occupancy: " + targetOccupancy + " / " +
                MAX_OCCUPANCY + " people";
        }
        speed.addEventListener("input", onSpeed);
        speed.addEventListener("change", onSpeed);
        occ.addEventListener("input", onOcc);
        occ.addEventListener("change", onOcc);
        hudEls = {
            clock: el.querySelector("#hudClock"),
            day: el.querySelector("#hudDay"),
            people: el.querySelector("#hudPeople"),
            states: el.querySelector("#hudStates"),
            elv: el.querySelector("#hudElv"),
            speedVal: el.querySelector("#hudSpeedVal"),
            occLabel: el.querySelector("#hudOccLabel")
        };
        onSpeed();
        onOcc();
    }

    function formatCallList(list) {
        return list.length > 0 ? list.join(",") : "-";
    }

    function updateHud() {
        if (!hudEls.clock) return;
        hudEls.clock.textContent = Clock.format();
        hudEls.day.textContent = String(dayCount);
        var byState = {};
        for (var i = 0; i < agents.length; i++) {
            var a = agents[i];
            if (a.state === "GONE") continue;
            byState[a.state] = (byState[a.state] || 0) + 1;
        }
        var stateText = [];
        for (var s in byState) stateText.push(s.substring(0, 7) + ":" + byState[s]);
        hudEls.people.textContent = "present " + countPresent() + " / " + agents.length;
        hudEls.states.textContent = stateText.join("  ");
        var lg = elevator.logic;
        var arrow = lg.direction > 0 ? "^up" : (lg.direction < 0 ? "vdown" : "idle");
        hudEls.elv.textContent = "F" + lg.currentFloor + " " + arrow + " " +
            lg.passengers.size + "/" + lg.maxCapacity + " " + lg.state +
            " dst " + formatCallList(elevator.getDestinations()) +
            " up " + formatCallList(elevator.getUpCalls()) +
            " dn " + formatCallList(elevator.getDownCalls());
    }

    // ---------- render loop ----------
    function frame(tMs) {
        requestAnimationFrame(frame);
        if (lastReal === null) lastReal = tMs;
        var realDt = (tMs - lastReal) / 1000;
        lastReal = tMs;
        if (!(realDt > 0)) realDt = 0;
        if (realDt > 0.05) realDt = 0.05;

        Clock.tick(realDt);
        updateLighting();
        var motionDt = realDt * Clock.timeScale;

        elevator.tick(motionDt);

        for (var i = 0; i < agents.length; i++) stepAgent(agents[i], motionDt);
        topUpVisitors();
        applyCollisions(motionDt);

        for (var k = 0; k < agents.length; k++) {
            var ag = agents[k];
            if (ag.state === "GONE" || ag.state === "DISABLED") continue;
            animatePersonWalking(ag.mesh, motionDt);
        }

        // keep standing agents glued to their deck (the car owns its own y)
        for (var m = 0; m < agents.length; m++) {
            var am = agents[m].mesh;
            if (am.parent === scene) {
                am.position.y = fY(agents[m].floor);
            }
        }

        controls.update();
        renderer.render(scene, camera);

        hudT += realDt;
        if (hudT >= 0.25) {
            hudT = 0;
            updateHud();
        }
    }

    // ---------- bootstrap ----------
    function startSimulation() {
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x20242a);
        scene.fog = new THREE.Fog(0x20242a, 70, 170);
        camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.set(28, 24, 28);

        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.sortObjects = true;
        renderer.domElement.style.position = "fixed";
        renderer.domElement.style.left = "0";
        renderer.domElement.style.top = "0";
        document.body.appendChild(renderer.domElement);
        camera.lookAt(0, 8, 0);

        controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.target.set(0, 8, 0);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.minDistance = 6;
        controls.maxDistance = 120;

        ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
        scene.add(ambientLight);
        hemiLight = new THREE.HemisphereLight(0xbfd7ff, 0x303020, 0.45);
        scene.add(hemiLight);
        sunLight = new THREE.DirectionalLight(0xffffff, 0.9);
        sunLight.position.set(20, 35, 18);
        scene.add(sunLight);

        world = createWorld(scene);
        elevator = new Elevator(scene, world);
        buildAgents();
        applyOccupancy();
        makeHud();
        updateLighting();
        updateHud();
        frame(performance.now());
    }

    if (document.readyState === "loading") {
        window.addEventListener("DOMContentLoaded", startSimulation);
    } else {
        startSimulation();
    }
})();
