(function () {
    const MAX_WORKERS = 20, MAX_VISITORS = 80, MAX_OCCUPANCY = 100, DEFAULT_OCCUPANCY = 45;
    const WALK_SPEED = 1.3;
    const firstNames = ["Ari", "Bea", "Cam", "Dee", "Eli", "Fin", "Gia", "Hui", "Ira", "Jae", "Kai", "Lea", "Mia", "Noa", "Oli", "Pia", "Raj", "Sam", "Tia", "Uma", "Vic", "Wes", "Yen", "Zoe"];
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(28, 24, 28);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.sortObjects = true;
    document.body.appendChild(renderer.domElement);
    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 8, 0);
    controls.enableDamping = true;
    const ambient = new THREE.AmbientLight(0xffffff, 0.7);
    const sun = new THREE.DirectionalLight(0xffffff, 1.1);
    sun.position.set(12, 24, 8);
    const hemi = new THREE.HemisphereLight(0xcfe7ff, 0x2b2338, 0.65);
    scene.add(ambient, sun, hemi);
    const world = window.createWorld(scene);
    const elevator = new window.Elevator(scene, world);
    const agents = [], seatReservations = new Set();
    let targetOccupancy = DEFAULT_OCCUPANCY;

    function rand(a, b) { return a + Math.random() * (b - a); }
    function randInt(a, b) { return Math.floor(rand(a, b + 1)); }
    function choice(a) { return a[Math.floor(Math.random() * a.length)]; }
    function minOfDay(h, m) { return h * 60 + (m || 0); }
    function distXZ(a, b) { const dx = a.x - b.x, dz = a.z - b.z; return Math.sqrt(dx * dx + dz * dz); }
    function key(floor, wp) { return floor + ":" + wp; }
    function dirTo(a, b) { return b > a ? 1 : -1; }
    function nodePos(floor, wp) { return world.floors[floor].nodes[wp].pos.clone(); }

    const ClockModel = {
        simMinute: 7 * 60 + 30,
        timeScale: 120,
        tick(realDt) {
            this.simMinute += realDt * this.timeScale / 60;
            if (this.simMinute >= 1440) {
                this.simMinute %= 1440;
                resetDay();
            }
        },
        format() {
            const total = Math.floor(this.simMinute) % 1440;
            let h = Math.floor(total / 60), m = total % 60;
            const ap = h >= 12 ? "PM" : "AM";
            h = h % 12 || 12;
            return (h < 10 ? " " : "") + h + ":" + String(m).padStart(2, "0") + " " + ap;
        }
    };

    function lerp(a, b, t) { return a + (b - a) * t; }
    function colorLerp(a, b, t) { return new THREE.Color(a).lerp(new THREE.Color(b), t); }
    const lightKeys = [
        { h: 0, bg: 0x101322, si: 0.15, ai: 0.45, hi: 0.32, sc: 0x8aa4ff },
        { h: 6.0, bg: 0x20263d, si: 0.35, ai: 0.48, hi: 0.36, sc: 0xffb06a },
        { h: 6.5, bg: 0x8fc7ff, si: 1.0, ai: 0.72, hi: 0.65, sc: 0xfff2cc },
        { h: 9.0, bg: 0xbddcff, si: 1.25, ai: 0.78, hi: 0.72, sc: 0xffffff },
        { h: 16.8, bg: 0xbddcff, si: 1.18, ai: 0.75, hi: 0.68, sc: 0xffffff },
        { h: 17.5, bg: 0xffb875, si: 0.85, ai: 0.62, hi: 0.52, sc: 0xffc06b },
        { h: 18.5, bg: 0x27304c, si: 0.22, ai: 0.48, hi: 0.36, sc: 0x8aa4ff },
        { h: 24, bg: 0x101322, si: 0.15, ai: 0.45, hi: 0.32, sc: 0x8aa4ff }
    ];
    function updateLighting() {
        const hour = ClockModel.simMinute / 60;
        let a = lightKeys[0], b = lightKeys[lightKeys.length - 1];
        for (let i = 0; i < lightKeys.length - 1; i++) if (hour >= lightKeys[i].h && hour <= lightKeys[i + 1].h) { a = lightKeys[i]; b = lightKeys[i + 1]; break; }
        const t = (hour - a.h) / Math.max(0.001, b.h - a.h);
        scene.background = colorLerp(a.bg, b.bg, t);
        sun.color.copy(colorLerp(a.sc, b.sc, t)); sun.intensity = lerp(a.si, b.si, t);
        ambient.intensity = lerp(a.ai, b.ai, t);
        hemi.intensity = lerp(a.hi, b.hi, t);
        const angle = (hour - 6) / 12 * Math.PI;
        sun.position.set(Math.cos(angle) * 18, Math.max(5, Math.sin(angle) * 26), 10);
    }

    function makeAgent(id, role, desk) {
        const group = window.createPerson({});
        group.visible = false;
        const agent = {
            id, role, name: choice(firstNames), group, floor: 0, currentWp: "outside",
            homeFloor: desk ? desk.floor : null, deskId: desk ? desk.id : null, deskWpName: desk ? desk.wpName : null, deskDoorWpName: desk ? desk.doorWpName : null,
            state: "AWAY", plan: [], currentAction: null, hasLunched: false, plannedMeetingTimes: [], reservedSeatKey: null,
            visitDuration: 20, destinationFloor: null, elevatorSpotIndex: undefined
        };
        sampleSchedule(agent);
        if (id >= targetOccupancy) agent.state = "DISABLED";
        agents.push(agent);
        return agent;
    }
    function sampleSchedule(a) {
        a.arrivalTime = randInt(minOfDay(8, 15), minOfDay(9, 30));
        a.lunchTime = randInt(minOfDay(11, 30), minOfDay(13, 30));
        a.lunchDuration = randInt(25, 60);
        a.departureTime = Math.random() < 0.15 ? randInt(minOfDay(18, 30), minOfDay(19, 45)) : randInt(minOfDay(16, 45), minOfDay(18, 30));
        a.hasLunched = false;
        a.plannedMeetingTimes = [];
        if (Math.random() < 0.75) a.plannedMeetingTimes.push(randInt(minOfDay(9, 45), minOfDay(11, 20)));
        if (Math.random() < 0.55) a.plannedMeetingTimes.push(randInt(minOfDay(13, 30), minOfDay(16, 15)));
        if (a.role === "VISITOR") {
            a.arrivalTime = randInt(minOfDay(8, 20), minOfDay(17, 10));
            a.visitDuration = randInt(12, 70);
        }
    }
    function initAgents() {
        const desks = [];
        world.floors.forEach(f => f.desks.forEach(d => desks.push(d)));
        for (let i = 0; i < MAX_WORKERS; i++) makeAgent(i, "WORKER", desks[i]);
        for (let i = 0; i < MAX_VISITORS; i++) makeAgent(MAX_WORKERS + i, "VISITOR", null);
    }

    function applyOccupancy() {
        agents.forEach(a => {
            if (a.id < targetOccupancy) {
                if (a.state === "DISABLED") { a.state = "AWAY"; sampleSchedule(a); }
            } else if (a.state === "AWAY" || a.state === "GONE") {
                a.state = "DISABLED"; a.group.visible = false;
            }
        });
    }
    function countPresent() {
        return agents.filter(a => a.group.parent && a.group.visible && a.state !== "GONE" && a.state !== "AWAY" && a.state !== "DISABLED").length;
    }
    function topUpVisitors() {
        const now = ClockModel.simMinute;
        if (now < minOfDay(8, 0) || now > minOfDay(18, 15)) return;
        let deficit = targetOccupancy - countPresent();
        if (deficit <= 0) return;
        for (const a of agents) {
            if (deficit <= 0) break;
            if (a.role === "VISITOR" && a.id < targetOccupancy && (a.state === "AWAY" || a.state === "GONE")) {
                sampleSchedule(a);
                a.arrivalTime = now + randInt(0, 6);
                a.state = "AWAY";
                deficit--;
            }
        }
    }

    function resetAgent(a) {
        releaseSeat(a);
        if (a.group.parent) a.group.parent.remove(a.group);
        a.group.visible = false; a.floor = 0; a.currentWp = "outside"; a.plan = []; a.currentAction = null; a.destinationFloor = null;
        a.group.userData.isSitting = false; a.group.position.set(0, 0, 12); a.group.rotation.y = Math.PI;
        sampleSchedule(a);
        a.state = a.id < targetOccupancy ? "AWAY" : "DISABLED";
    }
    function resetDay() {
        seatReservations.clear();
        agents.forEach(resetAgent);
        elevator.reset();
    }

    function reserveSeat(floor, wp) {
        const k = key(floor, wp);
        if (seatReservations.has(k)) return null;
        seatReservations.add(k);
        return k;
    }
    function releaseSeat(a) {
        if (a.reservedSeatKey) seatReservations.delete(a.reservedSeatKey);
        a.reservedSeatKey = null;
    }
    function reserveConfSeat(floor) {
        for (let i = 0; i < 4; i++) {
            const wp = "conf_seat" + i, k = reserveSeat(floor, wp);
            if (k) return { floor, wp, key: k };
        }
        return null;
    }
    function reserveAny(floor, names) {
        for (const wp of names) {
            const k = reserveSeat(floor, wp);
            if (k) return { floor, wp, key: k };
        }
        return null;
    }

    function pathTo(a, floor, wp) { return [{ type: "WALK_TO_WP", floor, wpName: wp }]; }
    function rideTo(from, to) {
        if (from === to) return [];
        const dir = dirTo(from, to);
        return [{ type: "WALK_TO_WP", floor: from, wpName: "elevWait" }, { type: "WAIT_AT_PANEL", floor: from, dir }, { type: "ENTER_ELEVATOR" }, { type: "PRESS_FLOOR", floor: to }, { type: "WAIT_FOR_FLOOR", floor: to }, { type: "EXIT_ELEVATOR", floor: to }];
    }
    function loopWork(minutes) { return [{ type: "WAIT_SIM", minutes }, { type: "PICK_NEXT_ACTIVITY" }]; }
    function planArriveToDesk(a) {
        return [{ type: "ENTER_STATE", state: "ARRIVING" }, ...pathTo(a, 0, "entrance"), ...rideTo(0, a.homeFloor), ...pathTo(a, a.homeFloor, a.deskDoorWpName), ...pathTo(a, a.homeFloor, a.deskWpName), { type: "SIT", floor: a.homeFloor, wpName: a.deskWpName }, { type: "ENTER_STATE", state: "AT_DESK" }, ...loopWork(randInt(18, 55))];
    }
    function planGoToLunch(a) {
        const seat = reserveAny(0, ["cafe_seat0a", "cafe_seat0b", "cafe_seat1a", "cafe_seat1b", "cafe_seat2a", "cafe_seat2b", "cafe_seat3a", "cafe_seat3b"]);
        const wp = seat ? seat.wp : "cafe_order";
        if (seat) a.reservedSeatKey = seat.key;
        return [{ type: "STAND" }, ...pathTo(a, a.floor, a.deskDoorWpName), ...rideTo(a.floor, 0), ...pathTo(a, 0, wp), { type: "SIT", floor: 0, wpName: wp }, { type: "ENTER_STATE", state: "AT_LUNCH" }, { type: "WAIT_SIM", minutes: a.lunchDuration }, { type: "STAND" }, { type: "RELEASE_SEAT" }, { type: "MARK_LUNCHED" }, ...rideTo(0, a.homeFloor), ...pathTo(a, a.homeFloor, a.deskWpName), { type: "SIT", floor: a.homeFloor, wpName: a.deskWpName }, { type: "ENTER_STATE", state: "AT_DESK" }, ...loopWork(randInt(18, 50))];
    }
    function planVisitLounge(a) {
        const floor = a.floor || a.homeFloor;
        const wp = choice(["lounge_spot0", "lounge_spot1", "lounge_spot2", "water_cooler"]);
        return [{ type: "STAND" }, ...pathTo(a, floor, "lounge_door"), ...pathTo(a, floor, wp), { type: "SIT", floor, wpName: wp }, { type: "ENTER_STATE", state: "AT_BREAK" }, { type: "WAIT_SIM", minutes: randInt(5, 12) }, { type: "STAND" }, ...pathTo(a, floor, a.deskWpName), { type: "SIT", floor, wpName: a.deskWpName }, { type: "ENTER_STATE", state: "AT_DESK" }, ...loopWork(randInt(18, 55))];
    }
    function planAttendMeeting(a) {
        const floor = Math.random() < 0.65 ? a.homeFloor : randInt(1, WORLD.FLOOR_COUNT - 1);
        const seat = reserveConfSeat(floor);
        if (!seat) return planVisitLounge(a);
        a.reservedSeatKey = seat.key;
        return [{ type: "STAND" }, ...pathTo(a, a.floor, a.deskDoorWpName), ...rideTo(a.floor, floor), ...pathTo(a, floor, "conf_door"), ...pathTo(a, floor, seat.wp), { type: "SIT", floor, wpName: seat.wp }, { type: "ENTER_STATE", state: "IN_MEETING" }, { type: "WAIT_SIM", minutes: randInt(22, 45) }, { type: "STAND" }, { type: "RELEASE_SEAT" }, ...rideTo(floor, a.homeFloor), ...pathTo(a, a.homeFloor, a.deskWpName), { type: "SIT", floor: a.homeFloor, wpName: a.deskWpName }, { type: "ENTER_STATE", state: "AT_DESK" }, ...loopWork(randInt(15, 45))];
    }
    function planVisitCoworker(a) {
        const targets = agents.filter(o => o !== a && o.role === "WORKER" && o.state === "AT_DESK");
        const t = targets.length ? choice(targets) : null;
        if (!t) return loopWork(randInt(15, 45));
        return [{ type: "STAND" }, ...pathTo(a, a.floor, a.deskDoorWpName), ...rideTo(a.floor, t.homeFloor), ...pathTo(a, t.homeFloor, t.deskDoorWpName), { type: "SIT", floor: t.homeFloor, wpName: t.deskDoorWpName }, { type: "ENTER_STATE", state: "AT_BREAK" }, { type: "WAIT_SIM", minutes: randInt(6, 18) }, { type: "STAND" }, ...rideTo(t.homeFloor, a.homeFloor), ...pathTo(a, a.homeFloor, a.deskWpName), { type: "SIT", floor: a.homeFloor, wpName: a.deskWpName }, { type: "ENTER_STATE", state: "AT_DESK" }, ...loopWork(randInt(15, 50))];
    }
    function planLeaveBuilding(a) {
        releaseSeat(a);
        return [{ type: "STAND" }, { type: "ENTER_STATE", state: "LEAVING" }, ...pathTo(a, a.floor, a.deskDoorWpName || "elevWait"), ...rideTo(a.floor, 0), ...pathTo(a, 0, "entrance"), ...pathTo(a, 0, "outside"), { type: "EXIT_BUILDING" }];
    }
    function visitorPlan(a) {
        const r = Math.random();
        let actions = [{ type: "ENTER_STATE", state: "ARRIVING" }, ...pathTo(a, 0, "entrance")];
        if (r < 0.10) {
            const seat = reserveAny(0, ["cafe_seat0a", "cafe_seat0b", "cafe_seat1a", "cafe_seat1b", "cafe_seat2a", "cafe_seat2b"]);
            if (seat) { a.reservedSeatKey = seat.key; actions.push(...pathTo(a, 0, seat.wp), { type: "SIT", floor: 0, wpName: seat.wp }); }
        } else if (r < 0.16) actions.push(...pathTo(a, 0, "cafe_order"), { type: "SIT", floor: 0, wpName: "cafe_order" });
        else if (r < 0.30) {
            const wp = choice(["front_lounge0", "front_lounge1", "front_lounge2"]);
            actions.push(...pathTo(a, 0, wp), { type: "SIT", floor: 0, wpName: wp });
        } else if (r < 0.42) {
            const wp = choice(["back_lounge_N", "back_lounge_S", "pit_N", "pit_S", "pit_E", "pit_W"]);
            actions.push(...pathTo(a, 0, wp), { type: "SIT", floor: 0, wpName: wp });
        } else if (r < 0.52) {
            const wp = choice(["reception", "kiosk", "lobby_wc_front", "lobby_wc_back"]);
            actions.push(...pathTo(a, 0, wp), { type: "SIT", floor: 0, wpName: wp });
        } else if (r < 0.62) {
            const wp = choice(["lobby_stand_center", "lobby_stand_NE", "lobby_stand_NW", "lobby_stand_midE", "lobby_stand_midW", "lobby_stand_entry"]);
            actions.push(...pathTo(a, 0, wp), { type: "SIT", floor: 0, wpName: wp });
        }
        else if (r < 0.77) {
            const f = randInt(1, WORLD.FLOOR_COUNT - 1);
            const wp = choice(["lounge_spot0", "lounge_spot1", "lounge_spot2", "water_cooler", "hall_stand_N", "hall_stand_S"]);
            actions.push(...rideTo(0, f), ...pathTo(a, f, wp), { type: "SIT", floor: f, wpName: wp }, { type: "ENTER_STATE", state: "VISITING" }, { type: "WAIT_SIM", minutes: a.visitDuration }, { type: "STAND" }, { type: "RELEASE_SEAT" }, ...rideTo(f, 0), ...pathTo(a, 0, "entrance"), ...pathTo(a, 0, "outside"), { type: "EXIT_BUILDING" });
            return actions;
        } else {
            const f = randInt(1, WORLD.FLOOR_COUNT - 1), seat = reserveConfSeat(f);
            if (seat) {
                a.reservedSeatKey = seat.key;
                actions.push(...rideTo(0, f), ...pathTo(a, f, seat.wp), { type: "SIT", floor: f, wpName: seat.wp }, { type: "ENTER_STATE", state: "VISITING" }, { type: "WAIT_SIM", minutes: a.visitDuration }, { type: "STAND" }, { type: "RELEASE_SEAT" }, ...rideTo(f, 0), ...pathTo(a, 0, "entrance"), ...pathTo(a, 0, "outside"), { type: "EXIT_BUILDING" });
                return actions;
            }
            else actions.push(...pathTo(a, 0, "lobby_stand_center"), { type: "SIT", floor: 0, wpName: "lobby_stand_center" });
        }
        actions.push({ type: "ENTER_STATE", state: "VISITING" }, { type: "WAIT_SIM", minutes: a.visitDuration }, { type: "STAND" }, { type: "RELEASE_SEAT" });
        if (a.floor !== 0) actions.push(...rideTo(a.floor, 0));
        actions.push(...pathTo(a, 0, "entrance"), ...pathTo(a, 0, "outside"), { type: "EXIT_BUILDING" });
        return actions;
    }
    function chooseNextActivity(a) {
        const now = ClockModel.simMinute;
        if (now >= a.departureTime) return planLeaveBuilding(a);
        const due = a.plannedMeetingTimes.findIndex(t => now >= t);
        if (due >= 0) { a.plannedMeetingTimes.splice(due, 1); return planAttendMeeting(a); }
        if (now >= a.lunchTime && !a.hasLunched) return planGoToLunch(a);
        const r = Math.random();
        if (r < 0.14) return planAttendMeeting(a);
        if (r < 0.26) return planVisitLounge(a);
        if (r < 0.41) return planVisitCoworker(a);
        return loopWork(randInt(18, 65));
    }

    function spawnAgent(a) {
        scene.add(a.group);
        a.group.visible = true;
        a.group.position.copy(nodePos(0, "outside"));
        a.group.position.x += rand(-1.1, 1.1);
        a.group.position.z += rand(-0.75, 0.75);
        a.group.rotation.y = Math.PI;
        a.floor = 0; a.currentWp = "outside";
        a.plan = a.role === "WORKER" ? planArriveToDesk(a) : visitorPlan(a);
        a.currentAction = null;
    }

    function startAction(a, act) {
        a.currentAction = act;
        if (act.type === "WALK_TO_WP") {
            const start = nearestNodeName(a.floor, a.group.getWorldPosition(new THREE.Vector3()));
            act.path = world.bfsPath(world.floors[act.floor].nodes, a.floor === act.floor ? start : "elevWait", act.wpName);
            act.idx = 0; act._stallT = 0; act._prevWp = a.group.position.clone();
        } else if (act.type === "WAIT_SIM") act.untilMin = ClockModel.simMinute + act.minutes;
        else if (act.type === "ENTER_ELEVATOR") { act.phase = "reserve"; act._stallT = 0; act._prevWalk = a.group.position.clone(); }
        else if (act.type === "EXIT_ELEVATOR") { elevator.registerDisembark(a); act.phase = "out"; }
    }
    function nearestNodeName(floor, pos) {
        let best = "elevWait", bd = Infinity;
        const nodes = world.floors[floor].nodes;
        Object.keys(nodes).forEach(n => { const d = distXZ(pos, nodes[n].pos); if (d < bd) { bd = d; best = n; } });
        return best;
    }
    function finishAction(a) { a.currentAction = null; return true; }
    function walkToward(group, target, dt, local) {
        const p = group.position, dx = target.x - p.x, dz = target.z - p.z, dy = target.y - p.y;
        const d = Math.sqrt(dx * dx + dz * dz + dy * dy);
        if (d < 0.045) { group.position.copy(target); group.userData.isWalking = false; return true; }
        const step = Math.min(d, WALK_SPEED * dt);
        group.position.add(new THREE.Vector3(dx / d * step, dy / d * step, dz / d * step));
        group.rotation.y = Math.atan2(dx, dz);
        group.userData.isWalking = true;
        return false;
    }
    function updateAction(a, dt) {
        const act = a.currentAction;
        if (!act) return true;
        if (act.type === "ENTER_STATE") { a.state = act.state; return finishAction(a); }
        if (act.type === "MARK_LUNCHED") { a.hasLunched = true; return finishAction(a); }
        if (act.type === "RELEASE_SEAT") { releaseSeat(a); return finishAction(a); }
        if (act.type === "PICK_NEXT_ACTIVITY") { a.plan = chooseNextActivity(a); return finishAction(a); }
        if (act.type === "EXIT_BUILDING") { if (a.group.parent) a.group.parent.remove(a.group); a.group.visible = false; a.state = "GONE"; return finishAction(a); }
        if (act.type === "WAIT_SIM") { a.group.userData.isWalking = false; return ClockModel.simMinute >= act.untilMin ? finishAction(a) : false; }
        if (act.type === "STAND") { a.group.userData.isSitting = false; a.group.position.y = a.group.parent === elevator.group ? 0 : a.floor * WORLD.FLOOR_HEIGHT; return finishAction(a); }
        if (act.type === "SIT") {
            const f = world.floors[act.floor], target = f.sitTargets[act.wpName] || { sit: false, facing: 0 }, pos = nodePos(act.floor, act.wpName);
            if (!target.sit) { const r = rand(0.35, 0.75), th = rand(0, Math.PI * 2); pos.x += Math.cos(th) * r; pos.z += Math.sin(th) * r; }
            a.group.position.copy(pos); a.group.position.y += target.sit ? -0.35 : 0; a.group.rotation.y = target.facing;
            a.group.userData.isSitting = !!target.sit; a.group.userData.isWalking = false; a.floor = act.floor; a.currentWp = act.wpName;
            return finishAction(a);
        }
        if (act.type === "WALK_TO_WP") {
            if (a.group.userData.isSitting) a.group.userData.isSitting = false;
            const p = act.path[Math.min(act.idx, act.path.length - 1)];
            if (!p) return finishAction(a);
            if (walkToward(a.group, p, dt)) {
                act.idx++;
                act._stallT = 0;
                if (act.idx >= act.path.length) { a.floor = act.floor; a.currentWp = act.wpName; return finishAction(a); }
            } else {
                if (distXZ(a.group.position, act._prevWp) < 0.005) act._stallT += dt; else act._stallT = 0;
                act._prevWp.copy(a.group.position);
                if (act._stallT > 1.2) { act.idx++; act._stallT = 0; }
            }
            return false;
        }
        if (act.type === "WAIT_AT_PANEL") {
            a.state = "WAITING_ELEVATOR";
            if (act.dir > 0) elevator.callUp(act.floor); else elevator.callDown(act.floor);
            return elevator.isAcceptingAt(act.floor, act.dir) && elevator.currentCapacityFree() > 0 ? finishAction(a) : false;
        }
        if (act.type === "ENTER_ELEVATOR") {
            if (act.phase === "reserve") {
                if (!elevator.isAcceptingAt(a.floor, dirTo(a.floor, a.destinationFloor || a.floor)) || elevator.currentCapacityFree() <= 0) {
                    const d = dirTo(a.floor, a.destinationFloor || a.floor);
                    if (d > 0) elevator.callUp(a.floor); else elevator.callDown(a.floor);
                    return false;
                }
                act.localTarget = elevator.reserveBoardingSpot(a);
                if (!act.localTarget) return false;
                act.phase = "door";
            }
            if (act.phase === "door") {
                const spotWorld = act.localTarget.clone().applyMatrix4(elevator.group.matrixWorld);
                const threshold = new THREE.Vector3(spotWorld.x, a.floor * WORLD.FLOOR_HEIGHT, 1.55);
                if (walkToward(a.group, threshold, dt)) {
                    const wp = new THREE.Vector3(); a.group.getWorldPosition(wp);
                    scene.remove(a.group); elevator.group.add(a.group); a.group.position.copy(elevator.group.worldToLocal(wp));
                    act.phase = "spot";
                } else {
                    if (distXZ(a.group.position, act._prevWalk) < 0.005) act._stallT += dt; else act._stallT = 0;
                    act._prevWalk.copy(a.group.position);
                    if (act._stallT > 1.5) a.group.position.copy(threshold);
                }
                return false;
            }
            if (act.phase === "spot") {
                if (walkToward(a.group, act.localTarget, dt)) {
                    elevator.completeBoard(a); a.state = "IN_CAR"; a.group.rotation.y = 0; a.floor = elevator.currentFloor; return finishAction(a);
                }
                return false;
            }
        }
        if (act.type === "PRESS_FLOOR") { a.destinationFloor = act.floor; elevator.pressDestination(act.floor); return finishAction(a); }
        if (act.type === "WAIT_FOR_FLOOR") { a.group.userData.isWalking = false; return elevator.state === "DOOR_OPEN" && elevator.currentFloor === act.floor ? finishAction(a) : false; }
        if (act.type === "EXIT_ELEVATOR") {
            if (act.phase === "out") {
                const wp = new THREE.Vector3(); a.group.getWorldPosition(wp);
                elevator.group.remove(a.group); scene.add(a.group); a.group.position.copy(wp);
                act.phase = "wait";
            }
            const target = nodePos(act.floor, "elevWait");
            if (walkToward(a.group, target, dt)) {
                elevator.completeDisembark(a); a.floor = act.floor; a.currentWp = "elevWait"; return finishAction(a);
            }
            return false;
        }
        return finishAction(a);
    }

    function stepAgent(a, dt) {
        if (a.state === "DISABLED") return;
        if ((a.state === "AWAY" || a.state === "GONE") && ClockModel.simMinute >= a.arrivalTime && a.id < targetOccupancy) spawnAgent(a);
        if (a.role === "WORKER" && a.state !== "AWAY" && a.state !== "GONE" && a.state !== "DISABLED" && a.state !== "LEAVING" && ClockModel.simMinute >= a.departureTime) {
            a.plan = planLeaveBuilding(a); a.currentAction = null;
        }
        for (let i = 0; i < 16; i++) {
            if (!a.currentAction) {
                if (!a.plan.length) return;
                const next = a.plan.shift();
                if (next.type === "WAIT_AT_PANEL") a.destinationFloor = next.floor + next.dir;
                if (next.type === "PRESS_FLOOR") a.destinationFloor = next.floor;
                startAction(a, next);
            }
            if (!updateAction(a, dt)) break;
        }
    }

    function applyCollisions() {
        for (let i = 0; i < agents.length; i++) {
            const a = agents[i];
            if (!a.group.parent || !a.group.visible || a.group.userData.isSitting || a.group.parent === elevator.group || (a.currentAction && a.currentAction.type === "ENTER_ELEVATOR")) continue;
            for (let j = i + 1; j < agents.length; j++) {
                const b = agents[j];
                if (!b.group.parent || !b.group.visible || b.group.userData.isSitting || b.group.parent === elevator.group || (b.currentAction && b.currentAction.type === "ENTER_ELEVATOR")) continue;
                if (a.group.parent !== b.group.parent || Math.abs(a.group.position.y - b.group.position.y) > 1) continue;
                let dx = a.group.position.x - b.group.position.x, dz = a.group.position.z - b.group.position.z;
                let d = Math.sqrt(dx * dx + dz * dz);
                if (d < 1e-3) { const th = rand(0, Math.PI * 2); dx = Math.cos(th); dz = Math.sin(th); d = 1; }
                if (d < 0.7) {
                    const push = (0.7 - d) * 0.18;
                    a.group.position.x += dx / d * push; a.group.position.z += dz / d * push;
                    b.group.position.x -= dx / d * push; b.group.position.z -= dz / d * push;
                }
            }
        }
    }

    function makeHUD() {
        const hud = document.createElement("div");
        hud.style.cssText = "position:fixed;left:12px;top:12px;z-index:10;color:#f5f7fb;background:rgba(8,10,18,.72);font:13px/1.35 system-ui,sans-serif;padding:12px;border-radius:8px;min-width:285px;backdrop-filter:blur(4px)";
        hud.innerHTML = '<div id="timeHud" style="font-size:28px;font-weight:700;margin-bottom:8px"></div><label>Speed: <span id="speedHud">120</span>x</label><input id="speedSlider" type="range" min="0" max="100" value="69" style="width:100%"><label>Occupancy: <span id="occHud">45 / 100 people</span></label><input id="occSlider" type="range" min="1" max="100" value="45" style="width:100%"><pre id="stateHud" style="white-space:pre-wrap;margin:8px 0 0;color:#cfd6e6"></pre>';
        document.body.appendChild(hud);
        document.getElementById("speedSlider").addEventListener("input", e => {
            const t = Number(e.target.value) / 100;
            ClockModel.timeScale = Math.round(Math.exp(Math.log(1) + t * (Math.log(600) - Math.log(1))));
            document.getElementById("speedHud").textContent = ClockModel.timeScale;
        });
        document.getElementById("occSlider").addEventListener("input", e => {
            targetOccupancy = Number(e.target.value);
            document.getElementById("occHud").textContent = targetOccupancy + " / 100 people";
            applyOccupancy();
        });
    }
    function updateHUD() {
        document.getElementById("timeHud").textContent = ClockModel.format();
        const counts = {};
        agents.forEach(a => counts[a.state] = (counts[a.state] || 0) + 1);
        document.getElementById("stateHud").textContent =
            "Present: " + countPresent() + "\n" +
            Object.keys(counts).sort().map(k => k + ": " + counts[k]).join("  ") + "\n" +
            "Elevator: F" + elevator.currentFloor + " " + (elevator.direction > 0 ? "UP" : elevator.direction < 0 ? "DOWN" : "IDLE") + " " + elevator.state + " " + elevator.passengers.size + "/" + elevator.MAX_CAPACITY + "\n" +
            "Dest: [" + [...elevator.destinations].join(",") + "] Up: [" + [...elevator.upCalls].join(",") + "] Down: [" + [...elevator.downCalls].join(",") + "]";
    }

    window.addEventListener("resize", () => {
        camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight);
    });

    initAgents();
    makeHUD();
    const clock = new THREE.Clock();
    function animate() {
        requestAnimationFrame(animate);
        const realDt = Math.min(0.05, clock.getDelta());
        ClockModel.tick(realDt);
        updateLighting();
        const motionDt = realDt * ClockModel.timeScale;
        topUpVisitors();
        elevator.tick(motionDt);
        agents.forEach(a => stepAgent(a, motionDt));
        applyCollisions();
        agents.forEach(a => { if (a.group.visible) window.animatePersonWalking(a.group, motionDt); });
        controls.update();
        renderer.render(scene, camera);
        updateHUD();
    }
    updateLighting();
    animate();
})();
