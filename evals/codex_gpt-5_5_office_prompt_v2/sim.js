(function(root) {
    "use strict";

    const MAX_WORKERS = 20;
    const MAX_VISITORS = 80;
    const MAX_OCCUPANCY = MAX_WORKERS + MAX_VISITORS;
    const DEFAULT_OCCUPANCY = 45;
    const WALK_SPEED = 1.3;
    const names = ["Ava","Noah","Mia","Leo","Ivy","Owen","Nia","Max","Zoe","Eli","Kai","Luz","Sam","Rey","Ian","Ada","Ben","Taj","Uma","Pia","Cam","Liv","Jay","Ana"];

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x222233);
    const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(28, 24, 28);
    camera.lookAt(0, 8, 0);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.sortObjects = true;
    document.body.appendChild(renderer.domElement);
    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 8, 0);
    controls.enableDamping = true;
    const ambient = new THREE.AmbientLight(0xffffff, 0.7);
    const sun = new THREE.DirectionalLight(0xffffff, 1.0);
    sun.position.set(16, 32, 10);
    const hemi = new THREE.HemisphereLight(0xbdd8ff, 0x4b3b32, 0.55);
    scene.add(ambient, sun, hemi);
    const world = createWorld(scene);
    const elevator = new Elevator(scene, world);
    const realClock = new THREE.Clock();
    const seatReservations = new Set();
    let targetOccupancy = DEFAULT_OCCUPANCY;
    let agents = [];

    const Clock = {
        simMinute: 7 * 60 + 30,
        timeScale: 120,
        tick(realDt) {
            const before = this.simMinute;
            this.simMinute += realDt * this.timeScale / 60;
            if (this.simMinute >= 24 * 60) {
                this.simMinute %= 24 * 60;
                resetDay();
            } else if (before > this.simMinute) {
                resetDay();
            }
        },
        format() {
            const total = Math.floor(this.simMinute) % (24 * 60);
            let h = Math.floor(total / 60), m = total % 60;
            const ap = h >= 12 ? "PM" : "AM";
            h = h % 12 || 12;
            return (h < 10 ? " " : "") + h + ":" + String(m).padStart(2, "0") + " " + ap;
        }
    };

    function rand(a, b) { return a + Math.random() * (b - a); }
    function randi(a, b) { return Math.floor(rand(a, b + 1)); }
    function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
    function chance(p) { return Math.random() < p; }
    function minutes(h, m) { return h * 60 + m; }

    function makeHUD() {
        const hud = document.createElement("div");
        hud.id = "hud";
        hud.style.cssText = "position:absolute;left:12px;top:12px;min-width:260px;max-width:360px;background:rgba(8,10,16,.72);color:#f5f7fb;font:13px/1.35 system-ui,Arial,sans-serif;padding:12px;border:1px solid rgba(255,255,255,.18);border-radius:8px";
        hud.innerHTML = '<div id="time" style="font-size:28px;font-weight:700;margin-bottom:8px"></div><label>Speed: <span id="speedLbl"></span>x</label><input id="speed" type="range" min="0" max="1" step="0.001" value="0.69" style="width:100%"><label>Occupancy: <span id="occLbl"></span> / 100 people</label><input id="occ" type="range" min="1" max="100" value="' + DEFAULT_OCCUPANCY + '" style="width:100%"><pre id="stats" style="white-space:pre-wrap;margin:8px 0 0;font:12px/1.25 ui-monospace,Menlo,monospace"></pre>';
        document.body.appendChild(hud);
        const speed = document.getElementById("speed");
        const occ = document.getElementById("occ");
        speed.addEventListener("input", () => {
            const t = Number(speed.value);
            Clock.timeScale = Math.round(Math.exp(Math.log(1) + t * (Math.log(600) - Math.log(1))));
            document.getElementById("speedLbl").textContent = Clock.timeScale;
        });
        occ.addEventListener("input", () => {
            targetOccupancy = Number(occ.value);
            applyOccupancy();
        });
        speed.dispatchEvent(new Event("input"));
        occ.dispatchEvent(new Event("input"));
    }

    function scheduleWorker(a) {
        a.arrivalTime = randi(minutes(8,15), minutes(9,30));
        a.lunchTime = randi(minutes(11,30), minutes(13,30));
        a.lunchDuration = randi(25, 60);
        a.departureTime = chance(0.15) ? randi(minutes(18,30), minutes(19,45)) : randi(minutes(16,45), minutes(18,30));
        a.hasLunched = false;
        a.plannedMeetingTimes = [];
        if (chance(0.65)) a.plannedMeetingTimes.push(randi(minutes(9,45), minutes(11,20)));
        if (chance(0.55)) a.plannedMeetingTimes.push(randi(minutes(13,45), minutes(16,10)));
    }

    function scheduleVisitor(a, now) {
        a.arrivalTime = now === undefined ? randi(minutes(8,40), minutes(17,20)) : now + randi(0, 6);
        a.visitDuration = randi(12, 55);
        a.departureTime = a.arrivalTime + a.visitDuration + 20;
        a.hasLunched = false;
        a.plannedMeetingTimes = [];
    }

    function makeAgents() {
        const allDesks = [];
        for (let f = 1; f < WORLD.FLOOR_COUNT; f++) world.floors[f].desks.forEach(d => allDesks.push({ floor: f, desk: d }));
        for (let i = 0; i < MAX_OCCUPANCY; i++) {
            const role = i < MAX_WORKERS ? "WORKER" : "VISITOR";
            const g = createPerson({});
            g.visible = false;
            g.userData.agentId = i;
            const a = { id: i, role, name: pick(names), group: g, state: "AWAY", plan: [], currentAction: null, floor: 0, disabled: false, reservedSeat: null };
            if (role === "WORKER") {
                const d = allDesks[i % allDesks.length];
                a.homeFloor = d.floor; a.deskId = d.desk.id; a.deskWpName = d.desk.wpName; a.deskDoorWpName = d.desk.doorWpName;
                scheduleWorker(a);
            } else {
                a.homeFloor = null; a.deskId = null; a.deskWpName = null; a.deskDoorWpName = null;
                scheduleVisitor(a);
            }
            agents.push(a);
        }
        applyOccupancy();
    }

    function resetAgent(a) {
        releaseSeat(a);
        if (a.group.parent) a.group.parent.remove(a.group);
        a.group.visible = false;
        a.group.userData.isSitting = false;
        a.group.userData.isWalking = false;
        a.group.position.set(0, 0, 12);
        a.group.rotation.y = 0;
        a.plan = [];
        a.currentAction = null;
        a.floor = 0;
        a.state = a.id < targetOccupancy ? "AWAY" : "DISABLED";
        if (a.role === "WORKER") scheduleWorker(a); else scheduleVisitor(a);
    }

    function resetDay() {
        seatReservations.clear();
        elevator.reset();
        agents.forEach(resetAgent);
        applyOccupancy();
    }

    function applyOccupancy() {
        agents.forEach(a => {
            if (a.id >= targetOccupancy && (a.state === "AWAY" || a.state === "GONE" || a.state === "DISABLED")) {
                a.state = "DISABLED";
                a.group.visible = false;
            } else if (a.id < targetOccupancy && a.state === "DISABLED") {
                a.state = "AWAY";
                if (a.role === "VISITOR") scheduleVisitor(a, Clock.simMinute);
            }
        });
        const lbl = document.getElementById("occLbl");
        if (lbl) lbl.textContent = targetOccupancy;
    }

    function countPresent() {
        return agents.filter(a => a.state !== "AWAY" && a.state !== "GONE" && a.state !== "DISABLED").length;
    }

    function topUpVisitors() {
        if (Clock.simMinute < minutes(8, 20) || Clock.simMinute > minutes(18, 30)) return;
        let deficit = targetOccupancy - countPresent();
        if (deficit <= 0) return;
        for (const a of agents) {
            if (deficit <= 0) break;
            if (a.role === "VISITOR" && a.id < targetOccupancy && (a.state === "AWAY" || a.state === "GONE")) {
                scheduleVisitor(a, Clock.simMinute);
                a.state = "AWAY";
                deficit--;
            }
        }
    }

    function floorNodes(f) { return world.floors[f].nodes; }
    function wpPos(f, wp) { return floorNodes(f)[wp].pos.clone(); }
    function action(type, data) { data = data || {}; data.type = type; return data; }

    function travelPlan(fromFloor, toFloor) {
        if (fromFloor === toFloor) return [];
        const dir = toFloor > fromFloor ? 1 : -1;
        return [action("WALK_TO_WP", { floor: fromFloor, wpName: "elevWait" }), action("WAIT_AT_PANEL", { floor: fromFloor, dir, toFloor }), action("ENTER_ELEVATOR", { toFloor }), action("PRESS_FLOOR", { floor: toFloor }), action("WAIT_FOR_FLOOR", { floor: toFloor }), action("EXIT_ELEVATOR", { toFloor })];
    }

    function reserveSeat(a, floor, wp) {
        const key = floor + ":" + wp;
        if (seatReservations.has(key)) return false;
        seatReservations.add(key);
        a.reservedSeat = key;
        return true;
    }

    function releaseSeat(a) {
        if (a.reservedSeat) seatReservations.delete(a.reservedSeat);
        a.reservedSeat = null;
    }

    function reserveAny(a, floor, wps) {
        for (const wp of wps) if (reserveSeat(a, floor, wp)) return wp;
        return null;
    }

    function currentFloorOf(a) {
        return Math.max(0, Math.min(WORLD.FLOOR_COUNT - 1, Math.round(a.group.getWorldPosition(new THREE.Vector3()).y / WORLD.FLOOR_HEIGHT)));
    }

    function planArriveToDesk(a) {
        return [action("ENTER_STATE", { state: "ARRIVING" }), action("WALK_TO_WP", { floor: 0, wpName: "entrance" })]
            .concat(travelPlan(0, a.homeFloor), [action("WALK_TO_WP", { floor: a.homeFloor, wpName: a.deskDoorWpName }), action("WALK_TO_WP", { floor: a.homeFloor, wpName: a.deskWpName }), action("SIT", { floor: a.homeFloor, wpName: a.deskWpName }), action("ENTER_STATE", { state: "AT_DESK" }), action("WAIT_SIM", { minutes: randi(18, 45) }), action("PICK_NEXT_ACTIVITY")]);
    }

    function planGoToLunch(a) {
        const seat = reserveAny(a, 0, ["bistro_0","bistro_1","bistro_2","bistro_3"]) || "lobby_stand_midW";
        return [action("STAND"), action("WALK_TO_WP", { floor: a.homeFloor, wpName: a.deskDoorWpName })]
            .concat(travelPlan(a.homeFloor, 0), [action("WALK_TO_WP", { floor: 0, wpName: seat }), action("SIT", { floor: 0, wpName: seat }), action("ENTER_STATE", { state: "AT_LUNCH" }), action("WAIT_SIM", { minutes: a.lunchDuration }), action("STAND"), action("RELEASE_SEAT"), action("MARK_LUNCHED")])
            .concat(travelPlan(0, a.homeFloor), [action("WALK_TO_WP", { floor: a.homeFloor, wpName: a.deskWpName }), action("SIT", { floor: a.homeFloor, wpName: a.deskWpName }), action("ENTER_STATE", { state: "AT_DESK" }), action("WAIT_SIM", { minutes: randi(15, 35) }), action("PICK_NEXT_ACTIVITY")]);
    }

    function planVisitLounge(a) {
        const wp = pick(["lounge_spot0","lounge_spot1","lounge_spot2","water_cooler","hall_stand_S"]);
        return [action("STAND"), action("WALK_TO_WP", { floor: a.homeFloor, wpName: a.deskDoorWpName }), action("WALK_TO_WP", { floor: a.homeFloor, wpName: wp }), action("SIT", { floor: a.homeFloor, wpName: wp }), action("ENTER_STATE", { state: "AT_BREAK" }), action("WAIT_SIM", { minutes: randi(5, 12) }), action("STAND"), action("WALK_TO_WP", { floor: a.homeFloor, wpName: a.deskWpName }), action("SIT", { floor: a.homeFloor, wpName: a.deskWpName }), action("ENTER_STATE", { state: "AT_DESK" }), action("PICK_NEXT_ACTIVITY")];
    }

    function planAttendMeeting(a) {
        const mf = chance(0.65) ? a.homeFloor : randi(1, WORLD.FLOOR_COUNT - 1);
        const seat = reserveAny(a, mf, ["conf_seat0","conf_seat1","conf_seat2","conf_seat3"]);
        if (!seat) return planVisitLounge(a);
        return [action("STAND"), action("WALK_TO_WP", { floor: a.homeFloor, wpName: a.deskDoorWpName })]
            .concat(travelPlan(a.homeFloor, mf), [action("WALK_TO_WP", { floor: mf, wpName: "conf_door" }), action("WALK_TO_WP", { floor: mf, wpName: seat }), action("SIT", { floor: mf, wpName: seat }), action("ENTER_STATE", { state: "IN_MEETING" }), action("WAIT_SIM", { minutes: randi(22, 45) }), action("STAND"), action("RELEASE_SEAT")])
            .concat(travelPlan(mf, a.homeFloor), [action("WALK_TO_WP", { floor: a.homeFloor, wpName: a.deskWpName }), action("SIT", { floor: a.homeFloor, wpName: a.deskWpName }), action("ENTER_STATE", { state: "AT_DESK" }), action("PICK_NEXT_ACTIVITY")]);
    }

    function planVisitCoworker(a) {
        const peers = agents.filter(p => p !== a && p.role === "WORKER" && p.state === "AT_DESK");
        const p = peers.length ? pick(peers) : null;
        if (!p) return [action("WAIT_SIM", { minutes: randi(18, 45) }), action("PICK_NEXT_ACTIVITY")];
        return [action("STAND"), action("WALK_TO_WP", { floor: a.homeFloor, wpName: a.deskDoorWpName })]
            .concat(travelPlan(a.homeFloor, p.homeFloor), [action("WALK_TO_WP", { floor: p.homeFloor, wpName: p.deskDoorWpName }), action("SIT", { floor: p.homeFloor, wpName: "hall_stand_N" }), action("ENTER_STATE", { state: "VISITING" }), action("WAIT_SIM", { minutes: randi(6, 18) }), action("STAND")])
            .concat(travelPlan(p.homeFloor, a.homeFloor), [action("WALK_TO_WP", { floor: a.homeFloor, wpName: a.deskWpName }), action("SIT", { floor: a.homeFloor, wpName: a.deskWpName }), action("ENTER_STATE", { state: "AT_DESK" }), action("PICK_NEXT_ACTIVITY")]);
    }

    function planLeaveBuilding(a) {
        releaseSeat(a);
        return [action("ENTER_STATE", { state: "LEAVING" }), action("STAND"), action("WALK_TO_WP", { floor: a.homeFloor, wpName: a.deskDoorWpName })]
            .concat(travelPlan(a.homeFloor, 0), [action("WALK_TO_WP", { floor: 0, wpName: "entrance" }), action("WALK_TO_WP", { floor: 0, wpName: "outside" }), action("EXIT_BUILDING")]);
    }

    function planVisitorVisit(a) {
        const roll = Math.random();
        let middle = [], visitFloor = 0, seat;
        if (roll < 0.10) { seat = reserveAny(a, 0, ["bistro_0","bistro_1","bistro_2","bistro_3"]) || "lobby_stand_midW"; middle = [action("WALK_TO_WP", { floor: 0, wpName: seat }), action("SIT", { floor: 0, wpName: seat }), action("WAIT_SIM", { minutes: a.visitDuration }), action("STAND"), action("RELEASE_SEAT")]; }
        else if (roll < 0.16) middle = [action("WALK_TO_WP", { floor: 0, wpName: "cafe_order" }), action("SIT", { floor: 0, wpName: "cafe_order" }), action("WAIT_SIM", { minutes: randi(4, 9) }), action("STAND")];
        else if (roll < 0.30) { seat = pick(["front_lounge_0","front_lounge_1","front_lounge_2"]); middle = [action("WALK_TO_WP", { floor: 0, wpName: seat }), action("SIT", { floor: 0, wpName: seat }), action("WAIT_SIM", { minutes: a.visitDuration }), action("STAND")]; }
        else if (roll < 0.42) { seat = pick(["back_lounge_N","back_lounge_S","pit_N","pit_S","pit_E","pit_W"]); middle = [action("WALK_TO_WP", { floor: 0, wpName: seat }), action("SIT", { floor: 0, wpName: seat }), action("WAIT_SIM", { minutes: a.visitDuration }), action("STAND")]; }
        else if (roll < 0.52) { seat = pick(["reception","kiosk","lobby_wc_front","lobby_wc_back"]); middle = [action("WALK_TO_WP", { floor: 0, wpName: seat }), action("SIT", { floor: 0, wpName: seat }), action("WAIT_SIM", { minutes: randi(5, 14) }), action("STAND")]; }
        else if (roll < 0.62) { seat = pick(["lobby_stand_center","lobby_stand_NE","lobby_stand_NW","lobby_stand_midE","lobby_stand_midW","lobby_stand_entry"]); middle = [action("WALK_TO_WP", { floor: 0, wpName: seat }), action("SIT", { floor: 0, wpName: seat }), action("WAIT_SIM", { minutes: a.visitDuration }), action("STAND")]; }
        else if (roll < 0.77) { visitFloor = randi(1, WORLD.FLOOR_COUNT - 1); seat = pick(["lounge_spot0","lounge_spot1","lounge_spot2","water_cooler","hall_stand_S"]); middle = travelPlan(0, visitFloor).concat([action("WALK_TO_WP", { floor: visitFloor, wpName: seat }), action("SIT", { floor: visitFloor, wpName: seat }), action("WAIT_SIM", { minutes: a.visitDuration }), action("STAND")]).concat(travelPlan(visitFloor, 0)); }
        else { visitFloor = randi(1, WORLD.FLOOR_COUNT - 1); seat = reserveAny(a, visitFloor, ["conf_seat0","conf_seat1","conf_seat2","conf_seat3"]); if (!seat) seat = "lobby_stand_center"; middle = seat.indexOf("conf_") === 0 ? travelPlan(0, visitFloor).concat([action("WALK_TO_WP", { floor: visitFloor, wpName: seat }), action("SIT", { floor: visitFloor, wpName: seat }), action("WAIT_SIM", { minutes: randi(18, 40) }), action("STAND"), action("RELEASE_SEAT")]).concat(travelPlan(visitFloor, 0)) : [action("WALK_TO_WP", { floor: 0, wpName: seat }), action("SIT", { floor: 0, wpName: seat }), action("WAIT_SIM", { minutes: a.visitDuration }), action("STAND")]; }
        return [action("ENTER_STATE", { state: "ARRIVING" }), action("WALK_TO_WP", { floor: 0, wpName: "entrance" }), action("ENTER_STATE", { state: "VISITING" })].concat(middle, [action("ENTER_STATE", { state: "LEAVING" }), action("WALK_TO_WP", { floor: 0, wpName: "entrance" }), action("WALK_TO_WP", { floor: 0, wpName: "outside" }), action("EXIT_BUILDING")]);
    }

    function chooseNextActivity(a) {
        if (Clock.simMinute >= a.departureTime) return planLeaveBuilding(a);
        const due = a.plannedMeetingTimes.find(t => Clock.simMinute >= t);
        if (due !== undefined) { a.plannedMeetingTimes = a.plannedMeetingTimes.filter(t => t !== due); return planAttendMeeting(a); }
        if (Clock.simMinute >= a.lunchTime && !a.hasLunched) return planGoToLunch(a);
        const r = Math.random();
        if (r < 0.14) return planAttendMeeting(a);
        if (r < 0.26) return planVisitLounge(a);
        if (r < 0.41) return planVisitCoworker(a);
        return [action("WAIT_SIM", { minutes: randi(18, 65) }), action("PICK_NEXT_ACTIVITY")];
    }

    function startAction(a, act) {
        a.currentAction = act;
        a.group.userData.isWalking = false;
        if (act.type === "WALK_TO_WP") {
            const from = nearestNodeName(act.floor, a.group.getWorldPosition(new THREE.Vector3()));
            act.path = world.bfsPath(world.floors[act.floor].nodes, from, act.wpName);
            act.index = 0;
            act.prev = null; act.stallT = 0;
        } else if (act.type === "WAIT_SIM") {
            act.untilMin = Clock.simMinute + act.minutes;
        } else if (act.type === "ENTER_ELEVATOR") {
            act.phase = "reserve"; act.spot = null; act.prev = null; act.stallT = 0;
        } else if (act.type === "SIT") {
            const target = world.floors[act.floor].sitTargets[act.wpName] || { sit: false, facing: 0 };
            const p = wpPos(act.floor, act.wpName);
            if (!target.sit) {
                const rr = rand(0.35, 0.75), aa = rand(0, Math.PI * 2);
                p.x += Math.cos(aa) * rr; p.z += Math.sin(aa) * rr;
            }
            if (a.group.parent !== scene) scene.add(a.group);
            a.group.position.copy(p);
            a.group.position.y += target.sit ? -0.35 : 0;
            a.group.rotation.y = target.facing || 0;
            a.group.userData.isSitting = !!target.sit;
        } else if (act.type === "STAND") {
            a.group.userData.isSitting = false;
            const wp = new THREE.Vector3();
            a.group.getWorldPosition(wp);
            if (a.group.parent !== scene) scene.add(a.group);
            a.group.position.y = currentFloorOf(a) * WORLD.FLOOR_HEIGHT;
        } else if (act.type === "ENTER_STATE") {
            a.state = act.state;
        } else if (act.type === "MARK_LUNCHED") {
            a.hasLunched = true;
        } else if (act.type === "RELEASE_SEAT") {
            releaseSeat(a);
        } else if (act.type === "PRESS_FLOOR") {
            elevator.pressDestination(act.floor);
        } else if (act.type === "EXIT_ELEVATOR") {
            if (a.group.parent === elevator.group) {
                const wp = new THREE.Vector3();
                a.group.getWorldPosition(wp);
                scene.add(a.group);
                a.group.position.copy(wp);
            }
            elevator.registerDisembark(a);
            act.phase = "walk";
            act.path = [wpPos(act.toFloor, "elevWait")];
            act.index = 0;
        } else if (act.type === "EXIT_BUILDING") {
            releaseSeat(a);
            if (a.group.parent) a.group.parent.remove(a.group);
            a.group.visible = false;
            a.state = "GONE";
        }
    }

    function nearestNodeName(floor, pos) {
        const nodes = world.floors[floor].nodes;
        let best = "elevWait", bd = Infinity;
        Object.keys(nodes).forEach(n => {
            const d = nodes[n].pos.distanceToSquared(pos);
            if (d < bd) { bd = d; best = n; }
        });
        return best;
    }

    function walkToward(a, target, dt, local) {
        const p = a.group.position;
        const dx = target.x - p.x, dz = target.z - p.z, dy = target.y - p.y;
        const dist = Math.sqrt(dx * dx + dz * dz + dy * dy);
        if (dist < 0.08) { p.copy(target); a.group.userData.isWalking = false; return true; }
        const step = Math.min(dist, WALK_SPEED * dt);
        p.x += dx / dist * step; p.y += dy / dist * step; p.z += dz / dist * step;
        a.group.rotation.y = Math.atan2(dx, dz);
        a.group.userData.isWalking = true;
        return false;
    }

    function stepWalkAction(a, act, dt) {
        if (!act.path || act.index >= act.path.length) return true;
        const target = act.path[act.index];
        const before = a.group.position.clone();
        if (walkToward(a, target, dt)) act.index++;
        const moved = before.distanceTo(a.group.position);
        if (moved < 0.005) act.stallT = (act.stallT || 0) + dt; else act.stallT = 0;
        if (act.stallT > 1.2) { act.index++; act.stallT = 0; }
        return act.index >= act.path.length;
    }

    function processAction(a, dt) {
        const act = a.currentAction;
        if (!act) return true;
        if (act.type === "WALK_TO_WP") {
            const done = stepWalkAction(a, act, dt);
            if (done) a.floor = act.floor;
            return done;
        }
        if (act.type === "WAIT_AT_PANEL") {
            a.state = "WAITING_ELEVATOR";
            if (act.dir > 0) elevator.callUp(act.floor); else elevator.callDown(act.floor);
            return elevator.isAcceptingAt(act.floor, act.dir) && elevator.currentCapacityFree() > 0;
        }
        if (act.type === "ENTER_ELEVATOR") {
            a.state = "WAITING_ELEVATOR";
            if (act.phase === "reserve") {
                if (!elevator.isAcceptingAt(a.floor, act.toFloor > a.floor ? 1 : -1)) {
                    if (act.toFloor > a.floor) elevator.callUp(a.floor); else elevator.callDown(a.floor);
                    return false;
                }
                act.spot = elevator.reserveBoardingSpot(a);
                if (!act.spot) return false;
                const w = elevator.localSpotToWorld(act.spot);
                act.threshold = new THREE.Vector3(w.x, a.floor * WORLD.FLOOR_HEIGHT, 1.72);
                act.phase = "door";
            }
            if (act.phase === "door") {
                const before = a.group.position.clone();
                if (walkToward(a, act.threshold, dt)) {
                    const wp = new THREE.Vector3();
                    a.group.getWorldPosition(wp);
                    elevator.group.add(a.group);
                    a.group.position.copy(elevator.group.worldToLocal(wp));
                    act.phase = "spot";
                }
                const moved = before.distanceTo(a.group.position);
                act.stallT = moved < 0.005 ? (act.stallT || 0) + dt : 0;
                if (act.stallT > 1.5) { a.group.position.copy(act.threshold); act.stallT = 0; }
                return false;
            }
            if (act.phase === "spot") {
                const target = new THREE.Vector3(act.spot.x, act.spot.y, act.spot.z);
                if (walkToward(a, target, dt, true)) {
                    elevator.completeBoard(a);
                    a.state = "IN_CAR";
                    a.group.rotation.y = 0;
                    a.floor = null;
                    return true;
                }
            }
            return false;
        }
        if (act.type === "WAIT_FOR_FLOOR") return elevator.state === "DOOR_OPEN" && elevator.currentFloor === act.floor;
        if (act.type === "EXIT_ELEVATOR") {
            const done = stepWalkAction(a, act, dt);
            if (done) { elevator.completeDisembark(a); a.floor = act.toFloor; return true; }
            return false;
        }
        if (act.type === "WAIT_SIM") return Clock.simMinute >= act.untilMin;
        if (act.type === "PICK_NEXT_ACTIVITY") { a.plan = chooseNextActivity(a); return true; }
        return true;
    }

    function tickAgent(a, dt) {
        if (a.state === "DISABLED") return;
        if (a.state === "AWAY" && Clock.simMinute >= a.arrivalTime) {
            if (a.role === "WORKER") a.plan = planArriveToDesk(a); else a.plan = planVisitorVisit(a);
            scene.add(a.group);
            a.group.visible = true;
            a.group.position.set(rand(-1.1, 1.1), 0, 12 + rand(-0.75, 0.75));
            a.floor = 0;
            a.state = "ARRIVING";
        }
        if (a.role === "WORKER" && Clock.simMinute >= a.departureTime && !["LEAVING","GONE","AWAY","DISABLED","IN_CAR","WAITING_ELEVATOR"].includes(a.state)) {
            a.plan = planLeaveBuilding(a);
            a.currentAction = null;
        }
        let guard = 0;
        while (guard++ < 16 && a.state !== "AWAY" && a.state !== "GONE" && a.state !== "DISABLED") {
            if (!a.currentAction) {
                const next = a.plan.shift();
                if (!next) break;
                startAction(a, next);
            }
            const done = processAction(a, dt);
            if (done) a.currentAction = null; else break;
        }
    }

    function applyCollisions() {
        for (let i = 0; i < agents.length; i++) {
            const a = agents[i];
            if (!a.group.visible || a.group.userData.isSitting || a.group.parent === elevator.group || (a.currentAction && a.currentAction.type === "ENTER_ELEVATOR")) continue;
            for (let j = i + 1; j < agents.length; j++) {
                const b = agents[j];
                if (!b.group.visible || b.group.userData.isSitting || b.group.parent === elevator.group || (b.currentAction && b.currentAction.type === "ENTER_ELEVATOR")) continue;
                if (a.group.parent !== b.group.parent) continue;
                const dy = Math.abs(a.group.position.y - b.group.position.y);
                if (dy > 1) continue;
                let dx = a.group.position.x - b.group.position.x, dz = a.group.position.z - b.group.position.z;
                let d = Math.sqrt(dx * dx + dz * dz);
                if (d < 1e-3) { const ang = rand(0, Math.PI * 2); dx = Math.cos(ang); dz = Math.sin(ang); d = 1; }
                if (d < 0.7) {
                    const push = (0.7 - d) * 0.18;
                    a.group.position.x += dx / d * push; a.group.position.z += dz / d * push;
                    b.group.position.x -= dx / d * push; b.group.position.z -= dz / d * push;
                }
            }
        }
    }

    function updateLighting() {
        const h = Clock.simMinute / 60;
        const keys = [
            [0, 0x161927, 0.45, 0.32, 0x8090b8, 0.15],
            [5.9, 0x20233a, 0.46, 0.34, 0xffad66, 0.35],
            [6.5, 0x8ebbe8, 0.75, 0.55, 0xffe0a3, 0.9],
            [8, 0xbfdcff, 0.9, 0.7, 0xffffff, 1.05],
            [16.9, 0xbfdcff, 0.9, 0.7, 0xffffff, 1.05],
            [17.5, 0xf0b47d, 0.72, 0.55, 0xffb15e, 0.85],
            [18.5, 0x323650, 0.5, 0.36, 0xe88c73, 0.25],
            [20, 0x171a2b, 0.45, 0.32, 0x8090b8, 0.12],
            [24, 0x161927, 0.45, 0.32, 0x8090b8, 0.15]
        ];
        let a = keys[0], b = keys[keys.length - 1];
        for (let i = 0; i < keys.length - 1; i++) if (h >= keys[i][0] && h <= keys[i + 1][0]) { a = keys[i]; b = keys[i + 1]; break; }
        const t = Math.max(0, Math.min(1, (h - a[0]) / (b[0] - a[0])));
        scene.background = new THREE.Color(a[1]).lerp(new THREE.Color(b[1]), t);
        ambient.intensity = a[2] + (b[2] - a[2]) * t;
        hemi.intensity = a[3] + (b[3] - a[3]) * t;
        sun.color.copy(new THREE.Color(a[4]).lerp(new THREE.Color(b[4]), t));
        sun.intensity = a[5] + (b[5] - a[5]) * t;
    }

    function updateHUD() {
        document.getElementById("time").textContent = Clock.format();
        const counts = {};
        agents.forEach(a => { counts[a.state] = (counts[a.state] || 0) + 1; });
        const set = s => Array.from(s).sort((a,b)=>a-b).join(",");
        document.getElementById("stats").textContent =
            "Present: " + countPresent() + "\n" +
            Object.keys(counts).sort().map(k => k + ": " + counts[k]).join("\n") + "\n\n" +
            "Elevator f" + elevator.currentFloor + " " + (elevator.direction > 0 ? "UP" : elevator.direction < 0 ? "DOWN" : "-") + " " + elevator.state + "\n" +
            "Passengers: " + elevator.passengers.size + "/4\nDest: [" + set(elevator.destinations) + "]\nUp: [" + set(elevator.upCalls) + "]\nDown: [" + set(elevator.downCalls) + "]";
    }

    function animate() {
        requestAnimationFrame(animate);
        const realDt = Math.min(0.05, realClock.getDelta());
        Clock.tick(realDt);
        updateLighting();
        topUpVisitors();
        const motionDt = realDt * Clock.timeScale;
        elevator.tick(motionDt);
        agents.forEach(a => tickAgent(a, motionDt));
        applyCollisions();
        agents.forEach(a => { if (a.group.visible) animatePersonWalking(a.group, motionDt); });
        controls.update();
        renderer.render(scene, camera);
        updateHUD();
    }

    window.addEventListener("resize", () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    makeHUD();
    makeAgents();
    updateLighting();
    animate();
})(window);
