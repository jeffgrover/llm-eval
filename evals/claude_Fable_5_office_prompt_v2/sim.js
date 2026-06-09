// sim.js — simulated clock, day/night lighting, agent state machine + daily
// schedules, render loop, UI. Depends on person.js, world.js,
// elevator_logic.js, elevator.js (loaded before this file).

(function () {
    "use strict";

    // ---------------- tunables ----------------

    const MAX_WORKERS = 20;
    const MAX_VISITORS = 80;
    const MAX_OCCUPANCY = MAX_WORKERS + MAX_VISITORS;  // 100
    const DEFAULT_OCCUPANCY = 45;
    const WALK_SPEED = 1.3;          // m/s at 1x
    const SIT_DROP = 0.16;           // body drop so hips meet the chair seat
    const MEETING_PROB = 0.36;       // gated by 0.4 in the decision roll
    const FH = WORLD.FLOOR_HEIGHT;

    const NAMES = ["Ava", "Ben", "Caro", "Dev", "Elle", "Finn", "Gia", "Hank",
        "Iris", "Jon", "Kira", "Liam", "Mona", "Nate", "Opal", "Pete",
        "Quinn", "Rosa", "Sam", "Tara", "Uma", "Vic", "Wren", "Zane"];

    function rand(a, b) { return a + Math.random() * (b - a); }
    function randInt(a, b) { return Math.floor(rand(a, b + 1)); }
    function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

    // ---------------- scene ----------------

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 400);
    camera.position.set(28, 24, 28);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.sortObjects = true;
    document.body.appendChild(renderer.domElement);

    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 8, 0);
    controls.update();

    const ambient = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambient);
    const sun = new THREE.DirectionalLight(0xffffff, 1.0);
    sun.position.set(40, 60, 30);
    scene.add(sun);
    scene.add(sun.target);
    const hemi = new THREE.HemisphereLight(0xbbccff, 0x444433, 0.5);
    scene.add(hemi);

    const world = createWorld(scene);
    const elevator = new Elevator(scene, world);

    window.addEventListener("resize", function () {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // ---------------- simulated clock ----------------

    const Clock = {
        simMinute: 7 * 60 + 30,
        timeScale: 120,
        tick: function (realDt) {
            this.simMinute += realDt * this.timeScale / 60;
            if (this.simMinute >= 24 * 60) {
                this.simMinute -= 24 * 60;
                resetDay();   // re-init agents AND elevator
            }
        },
        format: function () {
            let h = Math.floor(this.simMinute / 60);
            const m = Math.floor(this.simMinute % 60);
            const ap = h >= 12 ? "PM" : "AM";
            h = h % 12; if (h === 0) h = 12;
            return (h < 10 ? " " : "") + h + ":" + (m < 10 ? "0" : "") + m + " " + ap;
        }
    };

    // ---------------- day / night lighting ----------------
    // long flat daytime, compressed golden hours at dawn and dusk;
    // night stays readable (ambient 0.45 / hemi 0.32).

    const LIGHT_KEYS = [
        { h: 0.0, bg: 0x0a0e1e, sun: 0x223355, si: 0.05, ai: 0.45, hi: 0.32 },
        { h: 5.75, bg: 0x141a30, sun: 0x445577, si: 0.08, ai: 0.45, hi: 0.32 },
        { h: 6.0, bg: 0x9a5a55, sun: 0xff8844, si: 0.5, ai: 0.52, hi: 0.36 },
        { h: 6.5, bg: 0x87b5e6, sun: 0xffeedd, si: 1.0, ai: 0.7, hi: 0.5 },
        { h: 12.0, bg: 0x9cc8f0, sun: 0xffffff, si: 1.15, ai: 0.75, hi: 0.55 },
        { h: 17.5, bg: 0x87b5e6, sun: 0xffeecc, si: 1.0, ai: 0.7, hi: 0.5 },
        { h: 18.0, bg: 0xb06a4a, sun: 0xff7733, si: 0.45, ai: 0.55, hi: 0.4 },
        { h: 18.5, bg: 0x141a30, sun: 0x445577, si: 0.08, ai: 0.45, hi: 0.32 },
        { h: 24.0, bg: 0x0a0e1e, sun: 0x223355, si: 0.05, ai: 0.45, hi: 0.32 }
    ];
    const _bgA = new THREE.Color(), _bgB = new THREE.Color();
    const _sunA = new THREE.Color(), _sunB = new THREE.Color();
    scene.background = new THREE.Color(0x9cc8f0);

    function updateLighting() {
        const hour = Clock.simMinute / 60;
        let i = 0;
        while (i < LIGHT_KEYS.length - 2 && hour >= LIGHT_KEYS[i + 1].h) i++;
        const a = LIGHT_KEYS[i], b = LIGHT_KEYS[i + 1];
        const t = Math.min(1, Math.max(0, (hour - a.h) / (b.h - a.h)));
        scene.background.copy(_bgA.setHex(a.bg)).lerp(_bgB.setHex(b.bg), t);
        sun.color.copy(_sunA.setHex(a.sun)).lerp(_sunB.setHex(b.sun), t);
        sun.intensity = a.si + (b.si - a.si) * t;
        ambient.intensity = a.ai + (b.ai - a.ai) * t;
        hemi.intensity = a.hi + (b.hi - a.hi) * t;
    }

    // ---------------- seat reservations ----------------

    const seatReservations = new Set();   // "floor:wpName"

    function seatKey(floor, wp) { return floor + ":" + wp; }

    function reserveSeat(agent, floor, wp) {
        const key = seatKey(floor, wp);
        if (seatReservations.has(key)) return false;
        if (agent.reservedSeat) seatReservations.delete(agent.reservedSeat);
        seatReservations.add(key);
        agent.reservedSeat = key;
        return true;
    }

    function releaseSeat(agent) {
        if (agent.reservedSeat) {
            seatReservations.delete(agent.reservedSeat);
            agent.reservedSeat = null;
        }
    }

    function reserveFrom(agent, floor, wpList) {
        const order = wpList.slice();
        for (let i = order.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const tmp = order[i]; order[i] = order[j]; order[j] = tmp;
        }
        for (let i = 0; i < order.length; i++) {
            if (reserveSeat(agent, floor, order[i])) return order[i];
        }
        return null;
    }

    function reserveConfSeat(agent, floor) {
        return reserveFrom(agent, floor, world.floors[floor].confSeats);
    }

    // ---------------- agents ----------------

    const agents = [];
    let targetOccupancy = DEFAULT_OCCUPANCY;

    function sampleWorkerSchedule(a) {
        a.arrivalTime = rand(495, 570);            // 8:15..9:30
        a.lunchTime = rand(690, 810);              // 11:30..13:30
        a.lunchDuration = rand(25, 60);
        a.departureTime = Math.random() < 0.15 ? rand(1110, 1185) : rand(1005, 1110);
        a.hasLunched = false;
        a.plannedMeetingTimes = [];
        const n = randInt(0, 2);
        if (n >= 1) a.plannedMeetingTimes.push(rand(575, 690));   // morning
        if (n >= 2) a.plannedMeetingTimes.push(rand(815, 985));   // afternoon
    }

    function sampleVisitorSchedule(a) {
        a.arrivalTime = rand(510, 1020);           // 8:30..17:00
        a.hasLunched = true;
        a.plannedMeetingTimes = [];
        a.departureTime = 24 * 60 + 999;           // visitors leave via their plan
    }

    function buildAgents() {
        const allDesks = [];
        for (let f = 1; f < WORLD.FLOOR_COUNT; f++) {
            world.floors[f].desks.forEach(function (d) { allDesks.push(d); });
        }
        for (let id = 0; id < MAX_OCCUPANCY; id++) {
            const role = id < MAX_WORKERS ? "WORKER" : "VISITOR";
            const a = {
                id: id, role: role,
                name: NAMES[id % NAMES.length] + (id >= NAMES.length ? "-" + id : ""),
                group: createPerson({}),
                state: id < targetOccupancy ? "AWAY" : "DISABLED",
                plan: [], currentAction: null,
                floorIdx: 0, reservedSeat: null,
                homeFloor: null, deskId: null, deskWp: null, doorWp: null
            };
            if (role === "WORKER") {
                const d = allDesks[id];
                a.homeFloor = d.floor; a.deskId = d.id;
                a.deskWp = d.deskWp; a.doorWp = d.doorWp;
                sampleWorkerSchedule(a);
            } else {
                sampleVisitorSchedule(a);
            }
            agents.push(a);
        }
    }

    function countPresent() {
        let n = 0;
        for (let i = 0; i < agents.length; i++) {
            const s = agents[i].state;
            if (s !== "AWAY" && s !== "GONE" && s !== "DISABLED") n++;
        }
        return n;
    }

    function resetDay() {
        agents.forEach(function (a) {
            if (a.group.parent) a.group.parent.remove(a.group);
            releaseSeat(a);
            a.plan = []; a.currentAction = null;
            a.group.userData.isSitting = false;
            a.group.userData.isWalking = false;
            a.floorIdx = 0;
            a.state = a.id < targetOccupancy ? "AWAY" : "DISABLED";
            if (a.role === "WORKER") sampleWorkerSchedule(a);
            else sampleVisitorSchedule(a);
        });
        seatReservations.clear();
        elevator.reset();   // phantom passengers would jam the next day
    }

    function applyOccupancy() {
        agents.forEach(function (a) {
            if (a.id < targetOccupancy) {
                if (a.state === "DISABLED") {
                    a.state = "AWAY";
                    if (Clock.simMinute > a.arrivalTime && Clock.simMinute < 960) {
                        a.arrivalTime = Clock.simMinute + rand(1, 15);
                    }
                }
            } else if (a.state === "AWAY") {
                a.state = "DISABLED";
                // mid-day agents finish naturally; parked on day-wrap
            }
        });
    }

    function topUpVisitors() {
        const m = Clock.simMinute;
        if (m < 480 || m > 1050) return;   // business hours only
        let incoming = 0;
        agents.forEach(function (a) {
            if (a.state === "AWAY" && a.arrivalTime <= m + 6) incoming++;
        });
        let deficit = targetOccupancy - countPresent() - incoming;
        if (deficit <= 0) return;
        for (let i = 0; i < agents.length && deficit > 0; i++) {
            const a = agents[i];
            if (a.role !== "VISITOR" || a.id >= targetOccupancy) continue;
            if (a.state === "GONE" || (a.state === "AWAY" && a.arrivalTime > m + 6)) {
                a.arrivalTime = m + rand(0, 6);
                a.state = "AWAY";
                deficit--;
            }
        }
    }

    // ---------------- primitive actions ----------------

    function A(type, props) {
        const a = { type: type };
        if (props) for (const k in props) a[k] = props[k];
        return a;
    }

    function dirOf(from, to) { return to > from ? 1 : -1; }

    // personal waiting spot in front of the elevator: spread agents out
    function panelWaitSpot(agent, floor) {
        const ang = agent.id * 2.39996;
        const r = 0.55 + (agent.id % 4) * 0.3;
        let x = Math.cos(ang) * r * 1.7;
        let z = 2.45 + Math.abs(Math.sin(ang)) * r * 0.9 + 0.15;
        x = Math.max(-2.3, Math.min(2.3, x));
        z = Math.max(1.95, Math.min(4.4, z));
        return new THREE.Vector3(x, floor * FH, z);
    }

    function moveToward(agent, target, dt, speed) {
        // returns remaining distance after the move; rotates to face motion
        const g = agent.group;
        const dx = target.x - g.position.x;
        const dz = target.z - g.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < 1e-6) return 0;
        const step = Math.min(dist, (speed || WALK_SPEED) * dt);
        g.position.x += dx / dist * step;
        g.position.z += dz / dist * step;
        g.rotation.y = Math.atan2(dx, dz);
        return dist - step;
    }

    function startAction(agent, act) {
        const g = agent.group;
        switch (act.type) {
            case "WALK_TO_WP": {
                const nodes = world.floors[act.floor].nodes;
                const fromName = world.nearestNodeName(nodes, g.position);
                const path = bfsPath(nodes, fromName, act.wp) || [nodes[act.wp].pos.clone()];
                act._path = path;
                act._i = 0;
                act._stallT = 0; act._prev = g.position.clone();
                g.userData.isWalking = true;
                g.userData.isSitting = false;
                break;
            }
            case "WAIT_AT_PANEL":
                act._spot = panelWaitSpot(agent, act.floor);
                g.userData.isWalking = false;
                break;
            case "ENTER_ELEVATOR":
                act._phase = 0;
                act._stallT = 0;
                g.userData.isWalking = true;
                break;
            case "EXIT_ELEVATOR": {
                elevator.registerDisembark(agent);
                // reparent car -> scene, preserving world position
                const wp = new THREE.Vector3();
                g.getWorldPosition(wp);
                scene.add(g);
                g.position.set(wp.x, act.floor * FH, wp.z);
                agent.floorIdx = act.floor;
                const spot = panelWaitSpot(agent, act.floor);
                act._target = spot;
                act._stallT = 0;
                g.userData.isWalking = true;
                break;
            }
            case "WAIT_SIM":
                act._untilMin = Clock.simMinute + act.minutes;  // resolved HERE, not at compile
                g.userData.isWalking = false;
                break;
            default:
                break;
        }
    }

    // returns true when the action is complete
    function updateAction(agent, act, dt) {
        const g = agent.group;
        switch (act.type) {

            case "WALK_TO_WP": {
                const path = act._path;
                if (act._i >= path.length) { g.userData.isWalking = false; return true; }
                const target = path[act._i];
                const before = g.position.distanceTo(target);
                moveToward(agent, target, dt);
                const moved = g.position.distanceTo(act._prev);
                act._prev.copy(g.position);
                if (moved < 0.005) {
                    act._stallT += dt;
                    if (act._stallT > 1.2) { act._i++; act._stallT = 0; }  // skip blocked waypoint
                } else {
                    act._stallT = 0;
                }
                if (before < 0.1 || g.position.distanceTo(target) < 0.1) act._i++;
                if (act._i >= path.length) { g.userData.isWalking = false; return true; }
                return false;
            }

            case "WAIT_AT_PANEL": {
                // re-press the call every frame in case a cycle cleared it
                if (act.dir > 0) elevator.callUp(act.floor); else elevator.callDown(act.floor);
                // drift to the personal waiting spot so waiters don't stack
                const d = g.position.distanceTo(act._spot);
                if (d > 0.12) {
                    g.userData.isWalking = true;
                    moveToward(agent, act._spot, dt, WALK_SPEED * 0.7);
                } else {
                    g.userData.isWalking = false;
                    g.rotation.y = Math.PI;   // face the elevator doors
                }
                return elevator.isAcceptingAt(act.floor, act.dir) &&
                    elevator.currentCapacityFree() > 0;
            }

            case "ENTER_ELEVATOR": {
                // Phases fall through within one call: at high time scales a
                // single frame must be able to cover reserve -> walk ->
                // reparent -> walk-in -> completeBoard, or the door timer
                // (which also runs frames) abandons the boarder mid-walk.
                const floor = agent.floorIdx;

                if (act._phase === 0) {            // reserve a spot
                    if (!(elevator.state === "DOOR_OPEN" && elevator.currentFloor === floor)) {
                        requeueBoard(agent, act); return true;
                    }
                    const spot = elevator.reserveBoardingSpot(agent);
                    if (!spot) { requeueBoard(agent, act); return true; }
                    act._spot = spot;
                    const laneX = Math.max(-0.75, Math.min(0.75, spot.local.x));
                    act._threshold = new THREE.Vector3(laneX, floor * FH, 1.45);
                    act._phase = 1;
                    act._prev = g.position.clone();
                    g.userData.isWalking = true;
                }

                if (act._phase === 1) {            // walk to the door threshold (world)
                    if (!(elevator.state === "DOOR_OPEN" && elevator.currentFloor === floor)) {
                        elevator.cancelBoard(agent);   // car slipped away — start over
                        requeueBoard(agent, act);
                        return true;
                    }
                    moveToward(agent, act._threshold, dt);
                    const moved = g.position.distanceTo(act._prev);
                    act._prev.copy(g.position);
                    if (moved < 0.005) {
                        act._stallT += dt;
                        if (act._stallT > 1.5) {   // crowd-block recovery: force through
                            g.position.copy(act._threshold);
                            act._stallT = 0;
                        }
                    } else act._stallT = 0;
                    if (g.position.distanceTo(act._threshold) < 0.1) {
                        // reparent scene -> car
                        const car = elevator.car;
                        g.position.set(g.position.x - car.position.x, 0, g.position.z - car.position.z);
                        car.add(g);
                        act._phase = 2;            // fall through this frame
                    } else return false;
                }

                // phase 2: walk to the reserved interior spot (car-local)
                if (!elevator.pendingBoarders.has(agent) && !elevator.passengers.has(agent)) {
                    // force-abandoned by the door safety cap — step back out
                    const wp = new THREE.Vector3();
                    g.getWorldPosition(wp);
                    scene.add(g);
                    g.position.set(wp.x, agent.floorIdx * FH, Math.max(wp.z, 2.0));
                    requeueBoard(agent, act);
                    return true;
                }
                moveToward(agent, act._spot.local, dt);
                act._stallT += dt;
                if (g.position.distanceTo(act._spot.local) < 0.08 || act._stallT > 2.5) {
                    g.position.set(act._spot.local.x, 0, act._spot.local.z);
                    elevator.completeBoard(agent);
                    g.rotation.y = 0;          // face the doors
                    g.userData.isWalking = false;
                    return true;
                }
                return false;
            }

            case "PRESS_FLOOR":
                // exact destination from the plan compiler — never floor+dir
                elevator.pressDestination(act.floor);
                return true;

            case "WAIT_FOR_FLOOR":
                if (elevator.state === "DOOR_OPEN" && elevator.currentFloor === act.floor) return true;
                // safety: re-press if our destination got cleared somehow
                if (!elevator.destinations.has(act.floor) && elevator.currentFloor !== act.floor) {
                    elevator.pressDestination(act.floor);
                }
                return false;

            case "EXIT_ELEVATOR": {
                const left = moveToward(agent, act._target, dt);
                act._stallT += dt;
                if (left < 0.12 || act._stallT > 2.5) {
                    elevator.completeDisembark(agent);
                    g.userData.isWalking = false;
                    return true;
                }
                return false;
            }

            case "SIT": {
                const fl = world.floors[act.floor];
                const t = fl.sitTargets[act.wp];
                const pos = fl.nodes[act.wp].pos;
                if (t && t.sit) {
                    g.position.set(pos.x, act.floor * FH - SIT_DROP, pos.z);
                    g.rotation.y = t.facing;
                    g.userData.isSitting = true;
                } else {
                    // standing waypoint: jitter a small ring so two agents
                    // assigned the same spot don't overlap exactly
                    const ang = rand(0, Math.PI * 2);
                    const r = rand(0.35, 0.75);
                    g.position.set(pos.x + Math.cos(ang) * r, act.floor * FH, pos.z + Math.sin(ang) * r);
                    g.rotation.y = t ? t.facing : rand(0, Math.PI * 2);
                    g.userData.isSitting = false;
                }
                g.userData.isWalking = false;
                return true;
            }

            case "STAND":
                g.userData.isSitting = false;
                g.position.y = (g.parent === elevator.car) ? 0 : agent.floorIdx * FH;
                // NOTE: seat reservation is NOT released here — see RELEASE_SEAT
                return true;

            case "RELEASE_SEAT":
                releaseSeat(agent);
                return true;

            case "WAIT_SIM":
                return Clock.simMinute >= act._untilMin;

            case "EXIT_BUILDING":
                if (g.parent) g.parent.remove(g);
                agent.state = "GONE";
                g.userData.isWalking = false;
                return true;

            case "ENTER_STATE":
                agent.state = act.state;
                return true;

            case "MARK_LUNCHED":
                agent.hasLunched = true;
                return true;

            case "PICK_NEXT_ACTIVITY":
                chooseNextActivity(agent);
                return true;

            default:
                return true;
        }
    }

    function requeueBoard(agent, act) {
        // car left or filled before we could board: wait + try again
        const floor = agent.floorIdx;
        if (act.dir > 0) elevator.callUp(floor); else elevator.callDown(floor);
        agent.plan.unshift(
            A("WAIT_AT_PANEL", { floor: floor, dir: act.dir, toFloor: act.toFloor }),
            A("ENTER_ELEVATOR", { toFloor: act.toFloor, dir: act.dir })
        );
    }

    // ---------------- plan compilers ----------------

    function ride(from, to) {
        if (from === to) return [];
        const dir = dirOf(from, to);
        return [
            A("WALK_TO_WP", { floor: from, wp: "elevWait" }),
            A("ENTER_STATE", { state: "WAITING_ELEVATOR" }),
            A("WAIT_AT_PANEL", { floor: from, dir: dir, toFloor: to }),
            A("ENTER_ELEVATOR", { toFloor: to, dir: dir }),
            A("ENTER_STATE", { state: "IN_CAR" }),
            A("PRESS_FLOOR", { floor: to }),       // explicit toFloor, not floor+dir
            A("WAIT_FOR_FLOOR", { floor: to }),
            A("EXIT_ELEVATOR", { floor: to }),
            A("ENTER_STATE", { state: "ON_FLOOR" })
        ];
    }

    function backToDesk(a) {
        return [
            A("WALK_TO_WP", { floor: a.homeFloor, wp: a.doorWp }),
            A("WALK_TO_WP", { floor: a.homeFloor, wp: a.deskWp }),
            A("SIT", { floor: a.homeFloor, wp: a.deskWp }),
            A("ENTER_STATE", { state: "AT_DESK" }),
            A("WAIT_SIM", { minutes: rand(18, 65) }),
            A("PICK_NEXT_ACTIVITY")
        ];
    }

    function planArriveToDesk(a) {
        return [
            A("ENTER_STATE", { state: "ARRIVING" }),
            A("WALK_TO_WP", { floor: 0, wp: "entrance" })
        ].concat(ride(0, a.homeFloor)).concat(backToDesk(a));
    }

    function planGoToLunch(a) {
        const lobby = world.floors[0];
        let seat = reserveFrom(a, 0, lobby.bistroChairs);
        if (!seat) seat = reserveFrom(a, 0, lobby.frontLoungeSeats.concat(lobby.backLoungeSeats));
        const lunchWp = seat || pick(lobby.standSpots);
        const seatActs = [A("WALK_TO_WP", { floor: 0, wp: lunchWp }),
        A("SIT", { floor: 0, wp: lunchWp })];
        return [
            A("STAND"), A("ENTER_STATE", { state: "ON_FLOOR" }),
            A("WALK_TO_WP", { floor: a.homeFloor, wp: a.doorWp })
        ].concat(ride(a.homeFloor, 0))
            .concat(seatActs)
            .concat([
                A("ENTER_STATE", { state: "AT_LUNCH" }),
                A("WAIT_SIM", { minutes: a.lunchDuration }),
                A("MARK_LUNCHED"),
                A("STAND"), A("RELEASE_SEAT")
            ])
            .concat(ride(0, a.homeFloor))
            .concat(backToDesk(a));
    }

    function planVisitLounge(a) {
        const fl = world.floors[a.homeFloor];
        let seat = reserveFrom(a, a.homeFloor, fl.loungeSpots);
        if (!seat) seat = pick(fl.standSpots);   // stand at the cooler instead
        return [
            A("STAND"), A("ENTER_STATE", { state: "ON_FLOOR" }),
            A("WALK_TO_WP", { floor: a.homeFloor, wp: a.doorWp }),
            A("WALK_TO_WP", { floor: a.homeFloor, wp: seat }),
            A("SIT", { floor: a.homeFloor, wp: seat }),
            A("ENTER_STATE", { state: "AT_BREAK" }),
            A("WAIT_SIM", { minutes: rand(5, 12) }),
            A("STAND"), A("RELEASE_SEAT")
        ].concat(backToDesk(a));
    }

    function planAttendMeeting(a) {
        const mf = Math.random() < 0.65 ? a.homeFloor : randInt(1, WORLD.FLOOR_COUNT - 1);
        const seat = reserveConfSeat(a, mf);
        if (!seat) return planVisitLounge(a);    // all four seats taken
        return [
            A("STAND"), A("ENTER_STATE", { state: "ON_FLOOR" }),
            A("WALK_TO_WP", { floor: a.homeFloor, wp: a.doorWp })
        ].concat(ride(a.homeFloor, mf))
            .concat([
                A("WALK_TO_WP", { floor: mf, wp: seat }),
                A("SIT", { floor: mf, wp: seat }),
                A("ENTER_STATE", { state: "IN_MEETING" }),
                A("WAIT_SIM", { minutes: rand(22, 45) }),
                A("STAND"), A("RELEASE_SEAT")
            ])
            .concat(ride(mf, a.homeFloor))
            .concat(backToDesk(a));
    }

    function planVisitCoworker(a) {
        const candidates = agents.filter(function (o) {
            return o !== a && o.role === "WORKER" && o.state === "AT_DESK";
        });
        if (!candidates.length) {
            return [A("WAIT_SIM", { minutes: rand(10, 25) }), A("PICK_NEXT_ACTIVITY")];
        }
        const c = pick(candidates);
        return [
            A("STAND"), A("ENTER_STATE", { state: "ON_FLOOR" }),
            A("WALK_TO_WP", { floor: a.homeFloor, wp: a.doorWp })
        ].concat(ride(a.homeFloor, c.homeFloor))
            .concat([
                A("WALK_TO_WP", { floor: c.homeFloor, wp: c.doorWp }),
                A("ENTER_STATE", { state: "VISITING" }),
                A("WAIT_SIM", { minutes: rand(6, 18) })
            ])
            .concat(ride(c.homeFloor, a.homeFloor))
            .concat(backToDesk(a));
    }

    function planLeaveBuilding(a) {
        return [
            A("STAND"), A("RELEASE_SEAT"),
            A("ENTER_STATE", { state: "LEAVING" })
        ].concat(ride(a.floorIdx, 0)).concat([
            A("WALK_TO_WP", { floor: 0, wp: "entrance" }),
            A("WALK_TO_WP", { floor: 0, wp: "outside" }),
            A("EXIT_BUILDING")
        ]);
    }

    function planVisitorVisit(a) {
        const lobby = world.floors[0];
        const r = Math.random();
        let acts = [];

        function sitFor(floor, wp, lo, hi, state) {
            return [
                A("WALK_TO_WP", { floor: floor, wp: wp }),
                A("SIT", { floor: floor, wp: wp }),
                A("ENTER_STATE", { state: state || "VISITING" }),
                A("WAIT_SIM", { minutes: rand(lo, hi) }),
                A("STAND"), A("RELEASE_SEAT")
            ];
        }
        function loiter() {
            return sitFor(0, pick(lobby.standSpots), 4, 15);
        }

        if (r < 0.10) {                                   // bistro table
            const s = reserveFrom(a, 0, lobby.bistroChairs);
            acts = s ? sitFor(0, s, 8, 25) : loiter();
        } else if (r < 0.16) {                            // cafe counter
            acts = sitFor(0, lobby.cafeOrder, 2, 6);
        } else if (r < 0.30) {                            // front lounge
            const s = reserveFrom(a, 0, lobby.frontLoungeSeats);
            acts = s ? sitFor(0, s, 6, 20) : loiter();
        } else if (r < 0.42) {                            // back lounge / pit
            const s = reserveFrom(a, 0, lobby.backLoungeSeats.concat(lobby.pitSeats));
            acts = s ? sitFor(0, s, 6, 20) : loiter();
        } else if (r < 0.52) {                            // reception / kiosk / cooler
            acts = sitFor(0, pick(lobby.quickStops), 2, 6);
        } else if (r < 0.62) {                            // lobby loiter
            acts = loiter();
        } else if (r < 0.77) {                            // office-floor lounge
            const f = randInt(1, WORLD.FLOOR_COUNT - 1);
            const fl = world.floors[f];
            let s = reserveFrom(a, f, fl.loungeSpots);
            if (!s) s = pick(fl.standSpots);
            acts = ride(0, f).concat(sitFor(f, s, 6, 18)).concat(ride(f, 0));
        } else {                                          // sit in on a meeting
            const f = randInt(1, WORLD.FLOOR_COUNT - 1);
            const s = reserveConfSeat(a, f);
            if (s) {
                acts = ride(0, f)
                    .concat(sitFor(f, s, 22, 45, "IN_MEETING"))
                    .concat(ride(f, 0));
            } else {
                acts = loiter();                          // all four seats taken
            }
        }

        return [
            A("ENTER_STATE", { state: "ARRIVING" }),
            A("WALK_TO_WP", { floor: 0, wp: "entrance" })
        ].concat(acts).concat([
            A("WALK_TO_WP", { floor: 0, wp: "entrance" }),
            A("WALK_TO_WP", { floor: 0, wp: "outside" }),
            A("EXIT_BUILDING")
        ]);
    }

    // ---------------- decision rules ----------------

    function chooseNextActivity(a) {
        if (a.role !== "WORKER") { a.plan = []; return; }
        const m = Clock.simMinute;

        if (m >= a.departureTime) {                       // 1. go home
            a.plan = planLeaveBuilding(a);
            return;
        }
        for (let i = 0; i < a.plannedMeetingTimes.length; i++) {
            if (m >= a.plannedMeetingTimes[i]) {          // 2. scheduled meeting
                a.plannedMeetingTimes.splice(i, 1);
                a.plan = planAttendMeeting(a);
                return;
            }
        }
        if (m >= a.lunchTime && !a.hasLunched) {          // 3. lunch
            a.plan = planGoToLunch(a);
            return;
        }
        const r = Math.random();                          // 4. weighted roll
        if (r < MEETING_PROB * 0.4) {                     // ~14% ad-hoc meeting
            a.plan = planAttendMeeting(a);
        } else if (r < MEETING_PROB * 0.4 + 0.12) {       // ~12% lounge break
            a.plan = planVisitLounge(a);
        } else if (r < MEETING_PROB * 0.4 + 0.27) {       // ~15% visit a coworker
            a.plan = planVisitCoworker(a);
        } else {                                          // keep working
            a.plan = [
                A("WAIT_SIM", { minutes: rand(18, 65) }),
                A("PICK_NEXT_ACTIVITY")
            ];
        }
    }

    // ---------------- per-frame agent processing ----------------

    function spawnAgent(a) {
        const g = a.group;
        g.position.set(rand(-1.1, 1.1), 0, 12 + rand(-0.75, 0.75));  // sidewalk jitter
        g.rotation.y = Math.PI;
        g.userData.isSitting = false;
        a.floorIdx = 0;
        scene.add(g);
        a.plan = a.role === "WORKER" ? planArriveToDesk(a) : planVisitorVisit(a);
        a.currentAction = null;
        a.state = "ARRIVING";
    }

    const SAFE_OVERRIDE_STATES = { AT_DESK: 1, AT_BREAK: 1, IN_MEETING: 1, VISITING: 1, ON_FLOOR: 1 };

    function processAgent(a, dt) {
        if (a.state === "DISABLED" || a.state === "GONE") return;

        if (a.state === "AWAY") {
            if (Clock.simMinute >= a.arrivalTime && Clock.simMinute < 1230) spawnAgent(a);
            else return;
        }

        // end-of-day override — workers only; visitors finish their own plan
        if (a.role === "WORKER" && Clock.simMinute >= a.departureTime &&
            SAFE_OVERRIDE_STATES[a.state] &&
            a.currentAction && a.currentAction.type === "WAIT_SIM") {
            a.currentAction = null;
            a.plan = planLeaveBuilding(a);
        }

        // action dispatch — loop so zero-duration actions chain within one
        // frame (otherwise doors can close between WAIT_FOR_FLOOR and
        // EXIT_ELEVATOR registering the disembark)
        for (let iter = 0; iter < 16; iter++) {
            if (!a.currentAction) {
                if (!a.plan.length) {
                    if (a.state !== "GONE" && a.state !== "AWAY") chooseNextActivity(a);
                    if (!a.plan.length) break;
                }
                a.currentAction = a.plan.shift();
                startAction(a, a.currentAction);
            }
            const done = updateAction(a, a.currentAction, dt);
            if (!done) break;
            a.currentAction = null;
            if (a.state === "GONE") break;
        }
    }

    // ---------------- collisions ----------------

    function applyCollisions() {
        const active = [];
        for (let i = 0; i < agents.length; i++) {
            const a = agents[i];
            if (a.state === "DISABLED" || a.state === "GONE" || a.state === "AWAY") continue;
            if (a.group.parent !== scene) continue;          // skip in-car agents
            if (a.group.userData.isSitting) continue;
            if (a.currentAction && a.currentAction.type === "ENTER_ELEVATOR") continue;
            active.push(a);
        }
        const R = 0.7, PUSH = 0.18;
        for (let i = 0; i < active.length; i++) {
            for (let j = i + 1; j < active.length; j++) {
                const p = active[i].group.position, q = active[j].group.position;
                if (Math.abs(p.y - q.y) > 1) continue;
                let dx = p.x - q.x, dz = p.z - q.z;
                let d = Math.sqrt(dx * dx + dz * dz);
                if (d >= R) continue;
                if (d < 1e-3) {                              // exact overlap: random axis
                    const ang = Math.random() * Math.PI * 2;
                    dx = Math.cos(ang); dz = Math.sin(ang); d = 1;
                }
                const push = (R - Math.min(d, R)) * PUSH;
                const nx = dx / d, nz = dz / d;
                p.x += nx * push; p.z += nz * push;
                q.x -= nx * push; q.z -= nz * push;
            }
        }
    }

    // ---------------- HUD ----------------

    const hud = document.createElement("div");
    hud.style.cssText = "position:fixed;top:10px;left:10px;color:#dde4ff;" +
        "font:12px/1.5 monospace;background:rgba(10,12,24,0.72);padding:10px 14px;" +
        "border-radius:8px;z-index:10;min-width:240px;user-select:none";
    hud.innerHTML =
        '<div id="hud-time" style="font-size:26px;font-weight:bold"></div>' +
        '<div style="margin-top:6px">Speed: <span id="hud-speed"></span>x<br>' +
        '<input id="speed-slider" type="range" min="0" max="100" step="1" style="width:210px"></div>' +
        '<div style="margin-top:4px">Occupancy: <span id="hud-occ"></span> / ' + MAX_OCCUPANCY + ' people<br>' +
        '<input id="occ-slider" type="range" min="1" max="' + MAX_OCCUPANCY + '" step="1" style="width:210px"></div>' +
        '<div id="hud-states" style="margin-top:8px;white-space:pre"></div>' +
        '<div id="hud-elev" style="margin-top:8px;white-space:pre;color:#ffd76e"></div>';
    document.body.appendChild(hud);

    const elTime = document.getElementById("hud-time");
    const elSpeed = document.getElementById("hud-speed");
    const elOcc = document.getElementById("hud-occ");
    const elStates = document.getElementById("hud-states");
    const elElev = document.getElementById("hud-elev");
    const speedSlider = document.getElementById("speed-slider");
    const occSlider = document.getElementById("occ-slider");

    // log-spaced speed slider over 1..600
    function sliderToScale(v) { return Math.round(Math.pow(600, v / 100)); }
    speedSlider.value = String(Math.round(100 * Math.log(120) / Math.log(600)));
    speedSlider.addEventListener("input", function () {
        Clock.timeScale = sliderToScale(+speedSlider.value);
    });
    occSlider.value = String(DEFAULT_OCCUPANCY);
    occSlider.addEventListener("input", function () {
        targetOccupancy = +occSlider.value;
        applyOccupancy();
    });

    function setText(el, s) { if (el._last !== s) { el._last = s; el.textContent = s; } }

    function updateHUD() {
        setText(elTime, Clock.format());
        setText(elSpeed, String(Clock.timeScale));
        setText(elOcc, String(targetOccupancy));

        const counts = {};
        agents.forEach(function (a) { counts[a.state] = (counts[a.state] || 0) + 1; });
        let s = "present: " + countPresent() + "\n";
        Object.keys(counts).sort().forEach(function (k) {
            if (k !== "DISABLED") s += k + ": " + counts[k] + "\n";
        });
        setText(elStates, s.trim());

        const lg = elevator;
        const dir = lg.direction > 0 ? "UP" : lg.direction < 0 ? "DOWN" : "-";
        setText(elElev,
            "ELEVATOR  floor " + lg.currentFloor + " " + dir + "  " + lg.state +
            "\npassengers " + lg.passengers.size + "/4" +
            "  dest {" + Array.from(lg.destinations).sort().join(",") + "}" +
            "\nup {" + Array.from(lg.upCalls).sort().join(",") + "}" +
            "  down {" + Array.from(lg.downCalls).sort().join(",") + "}");
    }

    // ---------------- main loop ----------------

    buildAgents();
    const threeClock = new THREE.Clock();
    let hudT = 0;

    function animate() {
        requestAnimationFrame(animate);
        const realDt = Math.min(0.05, threeClock.getDelta());
        Clock.tick(realDt);
        updateLighting();

        // motion and the sim clock advance in lockstep — never decouple
        const motionDt = realDt * Clock.timeScale;
        elevator.tick(motionDt);
        topUpVisitors();

        for (let i = 0; i < agents.length; i++) processAgent(agents[i], motionDt);
        applyCollisions();
        for (let i = 0; i < agents.length; i++) {
            const a = agents[i];
            if (a.group.parent) animatePersonWalking(a.group, motionDt);
        }

        controls.update();
        renderer.render(scene, camera);
        hudT += realDt;
        if (hudT > 0.12) { hudT = 0; updateHUD(); }
    }

    animate();

    // debug / inspection handle (harmless in the browser, used by tests)
    window.__sim = { agents: agents, Clock: Clock, elevator: elevator, world: world };
})();
