/* sim.js — simulated clock, day/night lighting, agent state machine + daily
 * schedules, render loop, UI. No ES modules. Auto-starts on page load.
 */
(function () {
    "use strict";

    // ---------- globals ----------
    let scene, camera, renderer, controls, world, elevator;
    let sunLight, ambientLight, hemiLight;

    const MAX_WORKERS = 20;
    const MAX_VISITORS = 80;
    const MAX_OCCUPANCY = MAX_WORKERS + MAX_VISITORS; // 100
    let targetOccupancy = 45;

    let agents = [];
    let seatReservations = new Set();
    let agentIdCounter = 0;

    const MEETING_PROB = 0.36;

    // ---------- clocks ----------
    const Clock = {
        simMinute: 7 * 60 + 30, // 07:30
        timeScale: 120,
        tick: function (realDt) {
            this.simMinute += realDt * this.timeScale / 60;
            if (this.simMinute >= 24 * 60) {
                this.simMinute = 7 * 60 + 30;
                onNewDay();
            }
        },
        format: function () {
            let m = Math.floor(this.simMinute);
            const h = Math.floor(m / 60) % 24;
            m = m % 60;
            const ampm = h >= 12 ? "PM" : "AM";
            let hh = h % 12;
            if (hh === 0) hh = 12;
            const mm = (m < 10 ? "0" : "") + m;
            return " " + hh + ":" + mm + " " + ampm;
        }
    };

    // ---------- random helpers ----------
    function rand(a, b) { return a + Math.random() * (b - a); }
    function randInt(a, b) { return Math.floor(rand(a, b + 1)); }

    const FIRST_NAMES = ["Ava", "Ben", "Cleo", "Dan", "Eve", "Finn", "Gia", "Hugo",
        "Ivy", "Jax", "Kira", "Leo", "Mia", "Nate", "Ora", "Pax", "Quinn", "Ray",
        "Sol", "Tia", "Uma", "Vic", "Wes", "Xia", "Yara", "Zoe", "Ali", "Bo", "Cy", "Dee"];

    // ---------- agent ----------
    function makeAgent(role, index) {
        const a = {
            id: agentIdCounter++,
            role: role,
            name: FIRST_NAMES[randInt(0, FIRST_NAMES.length - 1)],
            state: "AWAY",
            plan: [],
            currentAction: null,
            actionPhase: 0,
            homeFloor: null,
            deskId: null,
            deskWpName: null,
            deskDoorWpName: null,
            arrivalTime: 0,
            lunchTime: 0,
            lunchDuration: 25,
            departureTime: 0,
            plannedMeetingTimes: [],
            hasLunched: false,
            group: null,
            targetPos: null,
            path: [],
            pathIndex: 0,
            facing: 0,
            isSitting: false,
            reservedSeatKey: null,
            _spotIndex: null,
            _prevWp: null,
            _stallT: 0,
            _prevX: 0,
            _prevZ: 0,
            _phaseT: 0,
            _walkSpeed: 1.3,
            _spawned: false
        };

        if (role === "WORKER") {
            a.homeFloor = randInt(1, 5);
            const deskLetter = ["A", "B", "C", "D"][index % 4];
            a.deskId = index;
            a.deskWpName = "office" + deskLetter + "_desk";
            a.deskDoorWpName = "office" + deskLetter + "_door";
        }
        rollSchedule(a, true);
        return a;
    }

    function rollSchedule(a, isInit) {
        const now = Clock.simMinute;
        a.arrivalTime = rand(8 * 60 + 15, 9 * 60 + 30);
        a.lunchTime = rand(11 * 60 + 30, 13 * 60 + 30);
        a.lunchDuration = randInt(25, 60);
        // departure: 16:45..18:30, with ~15% straggler to 19:45
        if (Math.random() < 0.15) {
            a.departureTime = rand(18 * 60 + 30, 19 * 60 + 45);
        } else {
            a.departureTime = rand(16 * 60 + 45, 18 * 60 + 30);
        }
        // planned meetings: 0..2
        a.plannedMeetingTimes = [];
        const nMeetings = randInt(0, 2);
        for (let i = 0; i < nMeetings; i++) {
            if (i === 0) a.plannedMeetingTimes.push(randInt(9 * 60 + 30, 11 * 60 + 30));
            else a.plannedMeetingTimes.push(randInt(13 * 60 + 30, 16 * 60));
        }
        a.plannedMeetingTimes.sort(function (x, y) { return x - y; });
        a.hasLunched = false;
        if (a.role === "VISITOR") {
            a.visitDuration = randInt(8, 30);
        }
        if (!isInit) {
            // re-sampled mid-run for visitors via top-up; keep arrival near now
        }
    }

    function initAgentPool() {
        agents = [];
        agentIdCounter = 0;
        for (let i = 0; i < MAX_WORKERS; i++) {
            agents.push(makeAgent("WORKER", i));
        }
        for (let i = 0; i < MAX_VISITORS; i++) {
            agents.push(makeAgent("VISITOR", i));
        }
        applyOccupancy();
    }

    function countPresent() {
        let n = 0;
        for (let i = 0; i < agents.length; i++) {
            const st = agents[i].state;
            if (st !== "DISABLED" && st !== "AWAY" && st !== "GONE") n++;
        }
        return n;
    }

    function applyOccupancy() {
        for (let i = 0; i < agents.length; i++) {
            const a = agents[i];
            if (a.id < targetOccupancy) {
                if (a.state === "DISABLED") {
                    a.state = "AWAY";
                    a._spawned = false;
                }
            } else {
                // Only park fully-away agents; leave mid-workday agents running.
                if (a.state === "AWAY" || a.state === "GONE") {
                    if (a.group && a.group.parent) a.group.parent.remove(a.group);
                    a.state = "DISABLED";
                    a._spawned = false;
                }
            }
        }
    }

    // ---------- top-up visitors ----------
    function topUpVisitors() {
        const now = Clock.simMinute;
        if (now < 8 * 60 || now > 19 * 60) return;
        const deficit = targetOccupancy - countPresent();
        if (deficit <= 0) return;
        let rearmed = 0;
        for (let i = 0; i < agents.length && rearmed < deficit; i++) {
            const a = agents[i];
            if (a.role !== "VISITOR") continue;
            if (a.state !== "AWAY" && a.state !== "GONE") continue;
            if (a.id >= targetOccupancy) continue;
            a.arrivalTime = now + randInt(0, 6) * (60 / 60); // 0..6 sim-minutes
            a.visitDuration = randInt(8, 30);
            a.state = "AWAY";
            a._spawned = false;
            rearmed++;
        }
    }

    // ---------- scene setup ----------
    function startSimulation() {
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x20242a);
        camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.set(28, 24, 28);
        camera.lookAt(0, 8, 0);
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.sortObjects = true;
        document.body.appendChild(renderer.domElement);

        controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.target.set(0, 8, 0);
        controls.update();

        ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
        scene.add(ambientLight);
        hemiLight = new THREE.HemisphereLight(0xbfd7ff, 0x303020, 0.45);
        scene.add(hemiLight);
        sunLight = new THREE.DirectionalLight(0xffffff, 0.9);
        sunLight.position.set(20, 35, 18);
        scene.add(sunLight);

        world = createWorld(scene);
        elevator = new Elevator(scene, world);

        initAgentPool();
        buildHUD();

        const clock = new THREE.Clock();
        function animate() {
            requestAnimationFrame(animate);
            const realDt = Math.min(0.05, clock.getDelta());
            frame(realDt);
        }
        animate();
    }

    // ---------- frame ----------
    function frame(realDt) {
        Clock.tick(realDt);
        updateLighting();

        const motionDt = realDt * Clock.timeScale;

        elevator.tick(motionDt);
        topUpVisitors();

        // process agents
        updateAgents(motionDt);

        applyCollisions();

        for (let i = 0; i < agents.length; i++) {
            if (agents[i].group && agents[i].group.parent) {
                window.animatePersonWalking(agents[i].group, motionDt);
            }
        }

        controls.update();
        renderer.render(scene, camera);
        updateHUD();
    }

    // ---------- lighting ----------
    // keyframes at hours: dawn transition 06:00-06:30, long flat day,
    // dusk 17:30-18:30, night (not pitch black).
    const LIGHT_KEYFRAMES = [
        { h: 0.0, sky: 0x050510, sunC: 0x8899bb, sunI: 0.08, amb: 0.45, hemi: 0.32 },
        { h: 5.5, sky: 0x0a0a1a, sunC: 0x8899bb, sunI: 0.08, amb: 0.45, hemi: 0.32 },
        { h: 6.0, sky: 0x2a2030, sunC: 0xff8855, sunI: 0.25, amb: 0.5, hemi: 0.36 },
        { h: 6.5, sky: 0x8899cc, sunC: 0xffffff, sunI: 0.85, amb: 0.5, hemi: 0.42 },
        { h: 7.0, sky: 0x9fc0e8, sunC: 0xffffff, sunI: 0.9, amb: 0.45, hemi: 0.45 },
        { h: 16.0, sky: 0x9fc0e8, sunC: 0xffffff, sunI: 0.9, amb: 0.45, hemi: 0.45 },
        { h: 17.5, sky: 0x9fb0d8, sunC: 0xfff0c0, sunI: 0.7, amb: 0.45, hemi: 0.42 },
        { h: 18.0, sky: 0xc07040, sunC: 0xff8855, sunI: 0.35, amb: 0.45, hemi: 0.34 },
        { h: 18.5, sky: 0x101020, sunC: 0x8899bb, sunI: 0.08, amb: 0.45, hemi: 0.32 },
        { h: 24.0, sky: 0x050510, sunC: 0x8899bb, sunI: 0.08, amb: 0.45, hemi: 0.32 }
    ];

    function lerp(a, b, t) { return a + (b - a) * t; }
    function lerpColor(c1, c2, t) {
        const a = new THREE.Color(c1), b = new THREE.Color(c2);
        return a.lerp(b, t);
    }

    function updateLighting() {
        const h = Clock.simMinute / 60;
        // find surrounding keyframes
        let i = 0;
        for (let k = 0; k < LIGHT_KEYFRAMES.length - 1; k++) {
            if (h >= LIGHT_KEYFRAMES[k].h && h <= LIGHT_KEYFRAMES[k + 1].h) { i = k; break; }
        }
        const k0 = LIGHT_KEYFRAMES[i];
        const k1 = LIGHT_KEYFRAMES[i + 1];
        let t = (h - k0.h) / (k1.h - k0.h);
        t = Math.max(0, Math.min(1, t));

        scene.background = lerpColor(k0.sky, k1.sky, t);
        sunLight.color = lerpColor(k0.sunC, k1.sunC, t);
        sunLight.intensity = lerp(k0.sunI, k1.sunI, t);
        ambientLight.intensity = lerp(k0.amb, k1.amb, t);
        hemiLight.intensity = lerp(k0.hemi, k1.hemi, t);
    }

    // ---------- day wrap ----------
    function onNewDay() {
        seatReservations.clear();
        for (let i = 0; i < agents.length; i++) {
            const a = agents[i];
            if (a.group && a.group.parent) a.group.parent.remove(a.group);
            a.group = null;
            a.plan = [];
            a.currentAction = null;
            a.state = "AWAY";
            a._spawned = false;
            a.reservedSeatKey = null;
            a._spotIndex = null;
            a.hasLunched = false;
            rollSchedule(a, true);
        }
        // honor targetOccupancy
        for (let i = 0; i < agents.length; i++) {
            if (agents[i].id >= targetOccupancy) agents[i].state = "DISABLED";
        }
        elevator.reset();
    }

    // ---------- action primitives ----------
    function startAction(agent, action) {
        agent.currentAction = action;
        agent.actionPhase = 0;
        agent._phaseT = 0;
        agent._stallT = 0;
        agent._prevWp = null;
        if (action.type === "WAIT_SIM") {
            action.untilMin = Clock.simMinute + action.minutes;
        }
        if (action.type === "WALK_TO_WP" || action.type === "WALK_STEPS") {
            agent.pathIndex = 0;
            agent.path = [];
        }
    }

    function finishAction(agent) {
        agent.currentAction = null;
    }

    function advancePlan(agent) {
        if (agent.plan.length === 0) {
            agent.currentAction = null;
            return;
        }
        const action = agent.plan.shift();
        startAction(agent, action);
    }

    // ---------- path walking ----------
    function walkAlongPath(agent, motionDt) {
        const action = agent.currentAction;
        if (!action.path || action.path.length === 0) {
            return true; // reached
        }
        const idx = action.pathIndex;
        if (idx >= action.path.length) return true;

        const wp = action.path[idx];
        const g = agent.group.position;
        const dx = wp.x - g.x;
        const dz = wp.z - g.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        const speed = agent._walkSpeed;
        const step = speed * motionDt;

        if (dist <= step) {
            g.x = wp.x;
            g.z = wp.z;
            action.pathIndex++;
        } else {
            g.x += (dx / dist) * step;
            g.z += (dz / dist) * step;
            agent.group.rotation.y = Math.atan2(dx, dz);
        }

        agent.group.userData.isWalking = dist > 0.001;
        agent.group.userData.isSitting = false;

        // stall detection
        const progress = Math.hypot(g.x - agent._prevX, g.z - agent._prevZ);
        agent._prevX = g.x;
        agent._prevZ = g.z;
        if (progress < 0.005) {
            agent._stallT += motionDt;
            if (agent._stallT > 1.2) {
                // skip current waypoint
                action.pathIndex++;
                agent._stallT = 0;
            }
        } else {
            agent._stallT = 0;
        }

        return action.pathIndex >= action.path.length;
    }

    function getAgentFloor(agent) {
        return Math.round(agent.group.position.y / WORLD.FLOOR_HEIGHT);
    }

    function setAgentY(agent, y) {
        agent.group.position.y = y;
    }

    // ---------- update loop ----------
    function updateAgents(motionDt) {
        const now = Clock.simMinute;
        for (let i = 0; i < agents.length; i++) {
            const a = agents[i];
            if (a.state === "DISABLED") continue;

            // spawn AWAY agents at arrival time
            if (a.state === "AWAY") {
                if (now >= a.arrivalTime && now < (a.role === "WORKER" ? a.departureTime : 19 * 60)) {
                    spawnAgent(a);
                }
                continue;
            }

            // daily schedule overrides
            if (a.role === "WORKER") {
                if (now >= a.departureTime &&
                    a.state !== "LEAVING" && a.state !== "GONE" &&
                    !(a.currentAction && a.currentAction.type === "EXIT_BUILDING")) {
                    // force leave
                    const plan = planLeaveBuilding(a);
                    a.plan = plan;
                    a.currentAction = null;
                }
            } else {
                // visitors run their own plan to completion; never override
            }

            // run action dispatch loop (up to ~16 transitions/frame)
            for (let step = 0; step < 16; step++) {
                if (!a.currentAction) {
                    advancePlan(a);
                    if (!a.currentAction) break;
                }
                // Re-check: if the current action is terminal/complete, advance
                const done = runAction(a, a.currentAction, motionDt);
                if (done) {
                    finishAction(a);
                    continue;
                }
                break; // action in progress
            }
        }
    }

    function spawnAgent(a) {
        a.group = window.createPerson({});
        // jitter spawn position +/-1.1 / +/-0.75
        const jx = rand(-1.1, 1.1);
        const jz = rand(-0.75, 0.75);
        a.group.position.set(jx, 0, 12 + jz);
        a.group.rotation.y = Math.PI; // face -Z (toward building)
        scene.add(a.group);
        a._spawned = true;
        a.state = "ARRIVING";
        a._prevX = a.group.position.x;
        a._prevZ = a.group.position.z;

        // compile initial plan
        if (a.role === "WORKER") {
            a.plan = planArriveToDesk(a);
        } else {
            a.plan = planVisitorVisit(a);
        }
        a.currentAction = null;
    }

    // ---------- run a single action, returns true when complete ----------
    function runAction(agent, action, motionDt) {
        switch (action.type) {
            case "WALK_TO_WP":
                return runWalkToWp(agent, action, motionDt);
            case "WALK_STEPS":
                return runWalkSteps(agent, action, motionDt);
            case "WAIT_AT_PANEL":
                return runWaitAtPanel(agent, action, motionDt);
            case "ENTER_ELEVATOR":
                return runEnterElevator(agent, action, motionDt);
            case "PRESS_FLOOR":
                elevator.pressDestination(action.floor);
                return true;
            case "WAIT_FOR_FLOOR":
                return runWaitForFloor(agent, action, motionDt);
            case "EXIT_ELEVATOR":
                return runExitElevator(agent, action, motionDt);
            case "SIT":
                return runSit(agent, action);
            case "STAND":
                return runStand(agent, action);
            case "RELEASE_SEAT":
                releaseSeat(agent);
                return true;
            case "WAIT_SIM":
                return Clock.simMinute >= action.untilMin;
            case "EXIT_BUILDING":
                if (agent.group && agent.group.parent) agent.group.parent.remove(agent.group);
                agent.group = null;
                agent.state = "GONE";
                releaseSeat(agent);
                return true;
            case "ENTER_STATE":
                agent.state = action.stateName;
                return true;
            case "MARK_LUNCHED":
                agent.hasLunched = true;
                return true;
            case "PICK_NEXT_ACTIVITY":
                agent.plan = chooseNextActivityPlan(agent);
                return true;
            default:
                return true;
        }
    }

    // ---------- WALK_TO_WP ----------
    function runWalkToWp(agent, action, motionDt) {
        if (!action.path || action.path.length === 0) {
            // compute path
            const floor = action.floor;
            const fl = world.floors[floor];
            if (!fl) return true;
            const wp = fl.nodes[action.wpName];
            if (!wp) return true;
            // find start node nearest to current position
            const startNode = nearestNode(fl, agent.group.position.x, agent.group.position.z);
            const endNode = action.wpName;
            const path = bfsPath(fl.nodes, startNode, endNode);
            if (path.length === 0) {
                // direct walk
                action.path = [wp.clone()];
            } else {
                action.path = path;
            }
            action.pathIndex = 0;
            // if path has just one node equal to current, done
            if (action.pathIndex >= action.path.length) return true;
        }

        const isEntranceChain = (action.wpName === "front_door_threshold" ||
            action.wpName === "entrance" || action.wpName === "outside" ||
            action.wpName === "lobby_center");
        // exempt from collision while crossing threshold handled in applyCollisions

        const done = walkAlongPath(agent, motionDt);

        if (done) {
            // snap to final wp
            const fl = world.floors[getAgentFloor(agent)];
            const wp = fl && fl.nodes[action.wpName];
            if (wp) {
                agent.group.position.x = wp.x;
                agent.group.position.z = wp.z;
            }
        }
        return done;
    }

    function nearestNode(fl, x, z) {
        let best = "elevWait";
        let bestDist = Infinity;
        for (const name in fl.nodes) {
            const n = fl.nodes[name];
            const d = (n.x - x) * (n.x - x) + (n.z - z) * (n.z - z);
            if (d < bestDist) { bestDist = d; best = name; }
        }
        return best;
    }

    // ---------- WALK_STEPS (world-space steps, used for door threshold) ----------
    function runWalkSteps(agent, action, motionDt) {
        if (!action.steps || action.steps.length === 0) return true;
        const idx = action.stepIndex || 0;
        if (idx >= action.steps.length) return true;
        const t = action.steps[idx];
        const g = agent.group.position;
        const dx = t.x - g.x, dz = t.z - g.z;
        const dist = Math.hypot(dx, dz);
        const step = agent._walkSpeed * motionDt;
        if (dist <= step) {
            g.x = t.x; g.z = t.z;
            action.stepIndex = idx + 1;
        } else {
            g.x += (dx / dist) * step;
            g.z += (dz / dist) * step;
            agent.group.rotation.y = Math.atan2(dx, dz);
        }
        agent.group.userData.isWalking = dist > 0.001;
        // stall recovery
        const prog = Math.hypot(g.x - agent._prevX, g.z - agent._prevZ);
        agent._prevX = g.x; agent._prevZ = g.z;
        if (prog < 0.005) {
            agent._stallT += motionDt;
            if (agent._stallT > 1.5) { action.stepIndex = (action.stepIndex || 0) + 1; agent._stallT = 0; }
        } else agent._stallT = 0;

        return (action.stepIndex || 0) >= action.steps.length;
    }

    // ---------- WAIT_AT_PANEL ----------
    function runWaitAtPanel(agent, action, motionDt) {
        // press the call every frame if missing
        const floor = action.floor;
        const dir = action.dir;
        if (dir > 0) {
            if (!elevator.upCalls.has(floor)) elevator.callUp(floor);
        } else {
            if (!elevator.downCalls.has(floor)) elevator.callDown(floor);
        }
        agent.group.userData.isWalking = false;
        // re-face toward elevator doors
        agent.group.rotation.y = Math.PI;

        const accepting = elevator.isAcceptingAt(floor, dir);
        if (accepting) return true;
        return false;
    }

    // ---------- ENTER_ELEVATOR ----------
    function runEnterElevator(agent, action, motionDt) {
        if (!action.spot) {
            // reserve a spot (re-call if car slipped away)
            const spot = elevator.reserveBoardingSpot(agent);
            if (!spot) {
                // re-press call and wait
                const floor = action.floor;
                const dir = action.dir;
                if (dir > 0) { if (!elevator.upCalls.has(floor)) elevator.callUp(floor); }
                else { if (!elevator.downCalls.has(floor)) elevator.callDown(floor); }
                return false;
            }
            action.spot = spot;
            action.phase = 0;
            agent._spotIndex = spot.index;
        }

        // phases: 0 = walk to threshold, 1 = reparent to car + walk to spot, 2 = complete
        if (action.phase === 0) {
            // aim at door threshold using spot.x lane
            const targetX = action.spot.x;
            const thresholdZ = action.floor === 0 ? 2.0 : 2.0; // door threshold world-ish
            // The car doors are at floor's y, z ~ 1.5 in world (in front of shaft)
            const ty = getAgentFloor(agent) * WORLD.FLOOR_HEIGHT;
            // walk toward the door threshold (in front of car at z ~ +1.5..2)
            const target = new THREE.Vector3(targetX, ty, 2.0);
            if (!action.steps) {
                action.steps = [target];
                action.stepIndex = 0;
            }
            const done = runWalkSteps(agent, action, motionDt);
            if (done) {
                // reparent scene -> car, preserving world pos
                const worldPos = agent.group.position.clone();
                // also capture world yaw
                const yaw = agent.group.rotation.y;
                scene.remove(agent.group);
                elevator.group.add(agent.group);
                // car-local: subtract car world position then map spot
                const carWorld = elevator.group.position.clone();
                agent.group.position.set(
                    action.spot.x,
                    0,
                    action.spot.z
                );
                agent.group.rotation.y = 0; // face doors
                action.phase = 1;
                action._inCar = true;
                agent._inCar = true;
            }
        } else if (action.phase === 1) {
            // walk toward reserved interior spot in car-local space
            const spot = action.spot;
            const tx = spot.x, tz = spot.z;
            const g = agent.group.position;
            const dx = tx - g.x, dz = tz - g.z;
            const dist = Math.hypot(dx, dz);
            const step = agent._walkSpeed * motionDt;
            if (dist <= step) {
                g.x = tx; g.z = tz;
                elevator.completeBoard(agent);
                agent.group.rotation.y = 0;
                agent.group.userData.isWalking = false;
                action.phase = 2;
                return true;
            } else {
                g.x += (dx / dist) * step;
                g.z += (dz / dist) * step;
                agent.group.userData.isWalking = true;
            }
        } else {
            return true;
        }
        return false;
    }

    // ---------- WAIT_FOR_FLOOR ----------
    function runWaitForFloor(agent, action, motionDt) {
        agent.group.userData.isWalking = false;
        if (elevator.state === "DOOR_OPEN" && elevator.currentFloor === action.floor) {
            return true;
        }
        return false;
    }

    // ---------- EXIT_ELEVATOR ----------
    function runExitElevator(agent, action, motionDt) {
        if (!action._registered) {
            elevator.registerDisembark(agent);
            action._registered = true;
            // reparent car -> scene, preserving world position
            const wpos = new THREE.Vector3();
            agent.group.getWorldPosition(wpos);
            const targetFloorY = action.floor * WORLD.FLOOR_HEIGHT;
            elevator.group.remove(agent.group);
            scene.add(agent.group);
            agent.group.position.copy(wpos);
            agent.group.position.y = targetFloorY;
            agent._inCar = false;
            agent._spotIndex = null;
        }
        // walk to elevWait on target floor
        const fl = world.floors[action.floor];
        const wp = fl ? fl.nodes["elevWait"] : null;
        if (!wp) {
            elevator.completeDisembark(agent);
            return true;
        }
        const g = agent.group.position;
        const dx = wp.x - g.x, dz = wp.z - g.z;
        const dist = Math.hypot(dx, dz);
        const step = agent._walkSpeed * motionDt;
        if (dist <= step) {
            g.x = wp.x; g.z = wp.z;
            elevator.completeDisembark(agent);
            agent.group.userData.isWalking = false;
            agent.group.rotation.y = 0;
            return true;
        } else {
            g.x += (dx / dist) * step;
            g.z += (dz / dist) * step;
            agent.group.rotation.y = Math.atan2(dx, dz);
            agent.group.userData.isWalking = true;
        }
        return false;
    }

    // ---------- SIT / STAND ----------
    function runSit(agent, action) {
        const fl = world.floors[action.floor];
        const target = fl ? fl.sitTargets[action.wpName] : null;
        if (!target) return true;
        const wp = fl.nodes[action.wpName];
        if (wp) {
            agent.group.position.x = wp.x;
            agent.group.position.z = wp.z;
        }
        agent.group.rotation.y = target.facing;
        agent.group.userData.isSitting = true;
        agent.isSitting = true;
        // lower body by ~0.35 so hips align with chair seat
        agent.group.position.y = action.floor * WORLD.FLOOR_HEIGHT - 0.35;
        agent.group.userData.isWalking = false;
        return true;
    }

    function runStand(agent, action) {
        agent.group.userData.isSitting = false;
        agent.isSitting = false;
        agent.group.position.y = Math.round(agent.group.position.y / WORLD.FLOOR_HEIGHT) * WORLD.FLOOR_HEIGHT;
        agent.group.userData.isWalking = false;
        return true;
    }

    // ---------- seat reservation ----------
    function reserveSeat(agent, floor, wpName) {
        const key = floor + ":" + wpName;
        if (seatReservations.has(key)) return false;
        seatReservations.add(key);
        agent.reservedSeatKey = key;
        return true;
    }
    function releaseSeat(agent) {
        if (agent.reservedSeatKey) {
            seatReservations.delete(agent.reservedSeatKey);
            agent.reservedSeatKey = null;
        }
    }

    // ---------- collision ----------
    function applyCollisions() {
        const n = agents.length;
        for (let i = 0; i < n; i++) {
            const a = agents[i];
            if (!a.group || !a.group.parent) continue;
            if (a.isSitting) continue;
            if (a._inCar) continue; // skip in-car (pre-assigned spots)
            if (a.currentAction && a.currentAction.type === "ENTER_ELEVATOR") continue;

            for (let j = i + 1; j < n; j++) {
                const b = agents[j];
                if (!b.group || !b.group.parent) continue;
                if (b.isSitting) continue;
                if (b._inCar) continue;
                if (b.currentAction && b.currentAction.type === "ENTER_ELEVATOR") continue;

                // only same parent and similar Y
                if (a.group.parent !== b.group.parent) continue;
                if (Math.abs(a.group.position.y - b.group.position.y) > 1.0) continue;

                const dx = a.group.position.x - b.group.position.x;
                const dz = a.group.position.z - b.group.position.z;
                const d = Math.hypot(dx, dz);
                if (d > 0.7) continue;

                let nx, nz;
                if (d < 0.001) {
                    // exact overlap: random separation direction
                    const ang = Math.random() * Math.PI * 2;
                    nx = Math.cos(ang); nz = Math.sin(ang);
                } else {
                    nx = dx / d; nz = dz / d;
                }
                const push = 0.18 * (0.7 - d);
                a.group.position.x += nx * push;
                a.group.position.z += nz * push;
                b.group.position.x -= nx * push;
                b.group.position.z -= nz * push;
            }
        }
    }

    // ---------- goal -> plan compilers ----------
    function planArriveToDesk(a) {
        const plan = [];
        plan.push({ type: "WALK_TO_WP", floor: 0, wpName: "front_door_threshold" });
        plan.push({ type: "WALK_TO_WP", floor: 0, wpName: "entrance" });
        plan.push({ type: "WALK_TO_WP", floor: 0, wpName: "lobby_center" });
        plan.push({ type: "ENTER_STATE", stateName: "WAITING_ELEVATOR" });
        plan.push({ type: "WAIT_AT_PANEL", floor: 0, dir: 1, toFloor: a.homeFloor });
        plan.push({ type: "ENTER_ELEVATOR", floor: 0, dir: 1, toFloor: a.homeFloor });
        plan.push({ type: "PRESS_FLOOR", floor: a.homeFloor });
        plan.push({ type: "ENTER_STATE", stateName: "IN_CAR" });
        plan.push({ type: "WAIT_FOR_FLOOR", floor: a.homeFloor });
        plan.push({ type: "EXIT_ELEVATOR", floor: a.homeFloor });
        plan.push({ type: "ENTER_STATE", stateName: "ON_FLOOR" });
        plan.push({ type: "WALK_TO_WP", floor: a.homeFloor, wpName: a.deskDoorWpName });
        plan.push({ type: "WALK_TO_WP", floor: a.homeFloor, wpName: a.deskWpName });
        plan.push({ type: "SIT", floor: a.homeFloor, wpName: a.deskWpName });
        plan.push({ type: "ENTER_STATE", stateName: "AT_DESK" });
        plan.push({ type: "WAIT_SIM", minutes: randInt(18, 65) });
        plan.push({ type: "PICK_NEXT_ACTIVITY" });
        return plan;
    }

    function planGoToLunch(a) {
        const plan = [];
        plan.push({ type: "STAND" });
        plan.push({ type: "ENTER_STATE", stateName: "ON_FLOOR" });
        plan.push({ type: "WALK_TO_WP", floor: a.homeFloor, wpName: a.deskDoorWpName });
        plan.push({ type: "WALK_TO_WP", floor: a.homeFloor, wpName: "elevWait" });
        plan.push({ type: "WAIT_AT_PANEL", floor: a.homeFloor, dir: -1, toFloor: 0 });
        plan.push({ type: "ENTER_ELEVATOR", floor: a.homeFloor, dir: -1, toFloor: 0 });
        plan.push({ type: "PRESS_FLOOR", floor: 0 });
        plan.push({ type: "ENTER_STATE", stateName: "IN_CAR" });
        plan.push({ type: "WAIT_FOR_FLOOR", floor: 0 });
        plan.push({ type: "EXIT_ELEVATOR", floor: 0 });
        plan.push({ type: "ENTER_STATE", stateName: "AT_LUNCH" });
        plan.push({ type: "WALK_TO_WP", floor: 0, wpName: "cafe_door" });
        plan.push({ type: "WALK_TO_WP", floor: 0, wpName: pickBistro() });
        plan.push({ type: "SIT", floor: 0, wpName: pickBistro() });
        plan.push({ type: "WAIT_SIM", minutes: a.lunchDuration });
        plan.push({ type: "MARK_LUNCHED" });
        plan.push({ type: "STAND" });
        plan.push({ type: "WALK_TO_WP", floor: 0, wpName: "elevWait" });
        plan.push({ type: "WAIT_AT_PANEL", floor: 0, dir: 1, toFloor: a.homeFloor });
        plan.push({ type: "ENTER_ELEVATOR", floor: 0, dir: 1, toFloor: a.homeFloor });
        plan.push({ type: "PRESS_FLOOR", floor: a.homeFloor });
        plan.push({ type: "ENTER_STATE", stateName: "IN_CAR" });
        plan.push({ type: "WAIT_FOR_FLOOR", floor: a.homeFloor });
        plan.push({ type: "EXIT_ELEVATOR", floor: a.homeFloor });
        plan.push({ type: "WALK_TO_WP", floor: a.homeFloor, wpName: a.deskDoorWpName });
        plan.push({ type: "WALK_TO_WP", floor: a.homeFloor, wpName: a.deskWpName });
        plan.push({ type: "SIT", floor: a.homeFloor, wpName: a.deskWpName });
        plan.push({ type: "ENTER_STATE", stateName: "AT_DESK" });
        plan.push({ type: "WAIT_SIM", minutes: randInt(18, 65) });
        plan.push({ type: "PICK_NEXT_ACTIVITY" });
        return plan;
    }

    function pickBistro() {
        const names = ["bistro0", "bistro1", "bistro2", "bistro3"];
        return names[randInt(0, 3)];
    }

    function planVisitLounge(a) {
        const plan = [];
        plan.push({ type: "STAND" });
        plan.push({ type: "WALK_TO_WP", floor: a.homeFloor, wpName: "lounge_door" });
        plan.push({ type: "WALK_TO_WP", floor: a.homeFloor, wpName: "lounge_center" });
        const spot = "lounge_spot" + randInt(0, 2);
        plan.push({ type: "WALK_TO_WP", floor: a.homeFloor, wpName: spot });
        plan.push({ type: "SIT", floor: a.homeFloor, wpName: spot });
        plan.push({ type: "ENTER_STATE", stateName: "AT_BREAK" });
        plan.push({ type: "WAIT_SIM", minutes: randInt(5, 12) });
        plan.push({ type: "STAND" });
        plan.push({ type: "WALK_TO_WP", floor: a.homeFloor, wpName: a.deskDoorWpName });
        plan.push({ type: "WALK_TO_WP", floor: a.homeFloor, wpName: a.deskWpName });
        plan.push({ type: "SIT", floor: a.homeFloor, wpName: a.deskWpName });
        plan.push({ type: "ENTER_STATE", stateName: "AT_DESK" });
        plan.push({ type: "WAIT_SIM", minutes: randInt(18, 65) });
        plan.push({ type: "PICK_NEXT_ACTIVITY" });
        return plan;
    }

    function planAttendMeeting(a) {
        const meetingFloor = Math.random() < 0.65 ? a.homeFloor : randInt(1, 5);
        // reserve a conference seat
        let seat = null;
        for (let s = 0; s < 4; s++) {
            const wp = "conf_seat" + s;
            if (reserveSeat(a, meetingFloor, wp)) { seat = wp; break; }
        }
        if (!seat) {
            // fall back to lounge break
            return planVisitLounge(a);
        }
        const plan = [];
        plan.push({ type: "STAND" });
        plan.push({ type: "WALK_TO_WP", floor: a.homeFloor, wpName: "elevWait" });
        if (meetingFloor !== a.homeFloor) {
            plan.push({ type: "WAIT_AT_PANEL", floor: a.homeFloor, dir: meetingFloor > a.homeFloor ? 1 : -1, toFloor: meetingFloor });
            plan.push({ type: "ENTER_ELEVATOR", floor: a.homeFloor, dir: meetingFloor > a.homeFloor ? 1 : -1, toFloor: meetingFloor });
            plan.push({ type: "PRESS_FLOOR", floor: meetingFloor });
            plan.push({ type: "ENTER_STATE", stateName: "IN_CAR" });
            plan.push({ type: "WAIT_FOR_FLOOR", floor: meetingFloor });
            plan.push({ type: "EXIT_ELEVATOR", floor: meetingFloor });
        }
        plan.push({ type: "ENTER_STATE", stateName: "IN_MEETING" });
        plan.push({ type: "WALK_TO_WP", floor: meetingFloor, wpName: "conf_door" });
        plan.push({ type: "WALK_TO_WP", floor: meetingFloor, wpName: "conf_center" });
        plan.push({ type: "WALK_TO_WP", floor: meetingFloor, wpName: seat });
        plan.push({ type: "SIT", floor: meetingFloor, wpName: seat });
        plan.push({ type: "WAIT_SIM", minutes: randInt(22, 45) });
        plan.push({ type: "STAND" });
        plan.push({ type: "RELEASE_SEAT" });
        plan.push({ type: "WALK_TO_WP", floor: meetingFloor, wpName: "conf_door" });
        plan.push({ type: "WALK_TO_WP", floor: meetingFloor, wpName: "elevWait" });
        if (meetingFloor !== a.homeFloor) {
            plan.push({ type: "WAIT_AT_PANEL", floor: meetingFloor, dir: meetingFloor > a.homeFloor ? -1 : 1, toFloor: a.homeFloor });
            plan.push({ type: "ENTER_ELEVATOR", floor: meetingFloor, dir: meetingFloor > a.homeFloor ? -1 : 1, toFloor: a.homeFloor });
            plan.push({ type: "PRESS_FLOOR", floor: a.homeFloor });
            plan.push({ type: "ENTER_STATE", stateName: "IN_CAR" });
            plan.push({ type: "WAIT_FOR_FLOOR", floor: a.homeFloor });
            plan.push({ type: "EXIT_ELEVATOR", floor: a.homeFloor });
        }
        plan.push({ type: "WALK_TO_WP", floor: a.homeFloor, wpName: a.deskDoorWpName });
        plan.push({ type: "WALK_TO_WP", floor: a.homeFloor, wpName: a.deskWpName });
        plan.push({ type: "SIT", floor: a.homeFloor, wpName: a.deskWpName });
        plan.push({ type: "ENTER_STATE", stateName: "AT_DESK" });
        plan.push({ type: "WAIT_SIM", minutes: randInt(18, 65) });
        plan.push({ type: "PICK_NEXT_ACTIVITY" });
        return plan;
    }

    function planVisitCoworker(a) {
        // pick a random agent currently AT_DESK (not self)
        let coworker = null;
        const candidates = agents.filter(function (x) {
            return x.role === "WORKER" && x.state === "AT_DESK" && x !== a;
        });
        if (candidates.length) coworker = candidates[randInt(0, candidates.length - 1)];
        if (!coworker) return planVisitLounge(a);

        const targetFloor = coworker.homeFloor;
        const plan = [];
        plan.push({ type: "STAND" });
        plan.push({ type: "WALK_TO_WP", floor: a.homeFloor, wpName: "elevWait" });
        if (targetFloor !== a.homeFloor) {
            const dir = targetFloor > a.homeFloor ? 1 : -1;
            plan.push({ type: "WAIT_AT_PANEL", floor: a.homeFloor, dir: dir, toFloor: targetFloor });
            plan.push({ type: "ENTER_ELEVATOR", floor: a.homeFloor, dir: dir, toFloor: targetFloor });
            plan.push({ type: "PRESS_FLOOR", floor: targetFloor });
            plan.push({ type: "ENTER_STATE", stateName: "IN_CAR" });
            plan.push({ type: "WAIT_FOR_FLOOR", floor: targetFloor });
            plan.push({ type: "EXIT_ELEVATOR", floor: targetFloor });
        }
        plan.push({ type: "WALK_TO_WP", floor: targetFloor, wpName: coworker.deskDoorWpName });
        plan.push({ type: "ENTER_STATE", stateName: "VISITING" });
        plan.push({ type: "WAIT_SIM", minutes: randInt(6, 18) });
        plan.push({ type: "WALK_TO_WP", floor: targetFloor, wpName: "elevWait" });
        if (targetFloor !== a.homeFloor) {
            const dir2 = targetFloor > a.homeFloor ? -1 : 1;
            plan.push({ type: "WAIT_AT_PANEL", floor: targetFloor, dir: dir2, toFloor: a.homeFloor });
            plan.push({ type: "ENTER_ELEVATOR", floor: targetFloor, dir: dir2, toFloor: a.homeFloor });
            plan.push({ type: "PRESS_FLOOR", floor: a.homeFloor });
            plan.push({ type: "ENTER_STATE", stateName: "IN_CAR" });
            plan.push({ type: "WAIT_FOR_FLOOR", floor: a.homeFloor });
            plan.push({ type: "EXIT_ELEVATOR", floor: a.homeFloor });
        }
        plan.push({ type: "WALK_TO_WP", floor: a.homeFloor, wpName: a.deskDoorWpName });
        plan.push({ type: "WALK_TO_WP", floor: a.homeFloor, wpName: a.deskWpName });
        plan.push({ type: "SIT", floor: a.homeFloor, wpName: a.deskWpName });
        plan.push({ type: "ENTER_STATE", stateName: "AT_DESK" });
        plan.push({ type: "WAIT_SIM", minutes: randInt(18, 65) });
        plan.push({ type: "PICK_NEXT_ACTIVITY" });
        return plan;
    }

    function planLeaveBuilding(a) {
        const plan = [];
        plan.push({ type: "STAND" });
        plan.push({ type: "WALK_TO_WP", floor: a.homeFloor, wpName: a.deskDoorWpName });
        plan.push({ type: "WALK_TO_WP", floor: a.homeFloor, wpName: "elevWait" });
        plan.push({ type: "ENTER_STATE", stateName: "LEAVING" });
        plan.push({ type: "WAIT_AT_PANEL", floor: a.homeFloor, dir: -1, toFloor: 0 });
        plan.push({ type: "ENTER_ELEVATOR", floor: a.homeFloor, dir: -1, toFloor: 0 });
        plan.push({ type: "PRESS_FLOOR", floor: 0 });
        plan.push({ type: "ENTER_STATE", stateName: "IN_CAR" });
        plan.push({ type: "WAIT_FOR_FLOOR", floor: 0 });
        plan.push({ type: "EXIT_ELEVATOR", floor: 0 });
        plan.push({ type: "WALK_TO_WP", floor: 0, wpName: "lobby_center" });
        plan.push({ type: "WALK_TO_WP", floor: 0, wpName: "entrance" });
        plan.push({ type: "WALK_TO_WP", floor: 0, wpName: "front_door_threshold" });
        plan.push({ type: "WALK_TO_WP", floor: 0, wpName: "outside" });
        plan.push({ type: "EXIT_BUILDING" });
        return plan;
    }

    function planVisitorVisit(a) {
        // roll a weighted activity
        const r = Math.random();
        const plan = [];
        plan.push({ type: "WALK_TO_WP", floor: 0, wpName: "front_door_threshold" });
        plan.push({ type: "WALK_TO_WP", floor: 0, wpName: "entrance" });
        plan.push({ type: "WALK_TO_WP", floor: 0, wpName: "lobby_center" });
        plan.push({ type: "ENTER_STATE", stateName: "VISITING" });

        if (r < 0.10) {
            // bistro table (cafe)
            const b = pickBistro();
            plan.push({ type: "WALK_TO_WP", floor: 0, wpName: "cafe_door" });
            plan.push({ type: "WALK_TO_WP", floor: 0, wpName: b });
            plan.push({ type: "SIT", floor: 0, wpName: b });
            plan.push({ type: "WAIT_SIM", minutes: randInt(10, 25) });
            plan.push({ type: "STAND" });
        } else if (r < 0.16) {
            // cafe counter
            plan.push({ type: "WALK_TO_WP", floor: 0, wpName: "cafe_door" });
            plan.push({ type: "WALK_TO_WP", floor: 0, wpName: "cafe_order" });
            plan.push({ type: "WAIT_SIM", minutes: randInt(3, 8) });
        } else if (r < 0.30) {
            // front lounge
            plan.push({ type: "WALK_TO_WP", floor: 0, wpName: "front_lounge" });
            const s = "fl_spot" + randInt(0, 2);
            plan.push({ type: "WALK_TO_WP", floor: 0, wpName: s });
            plan.push({ type: "SIT", floor: 0, wpName: s });
            plan.push({ type: "WAIT_SIM", minutes: randInt(8, 18) });
            plan.push({ type: "STAND" });
        } else if (r < 0.42) {
            // back lounge / conversation pit
            plan.push({ type: "WALK_TO_WP", floor: 0, wpName: "back_lounge_N" });
            plan.push({ type: "SIT", floor: 0, wpName: "back_lounge_N" });
            plan.push({ type: "WAIT_SIM", minutes: randInt(8, 18) });
            plan.push({ type: "STAND" });
        } else if (r < 0.52) {
            // reception / kiosk / water cooler (stand briefly)
            const opts = ["reception", "kiosk", "lobby_wc_front", "lobby_wc_back"];
            const w = opts[randInt(0, opts.length - 1)];
            plan.push({ type: "WALK_TO_WP", floor: 0, wpName: w });
            plan.push({ type: "WAIT_SIM", minutes: randInt(3, 8) });
        } else if (r < 0.62) {
            // lobby loiter
            const opts = ["lobby_stand_center", "lobby_stand_NE", "lobby_stand_NW", "lobby_stand_midE", "lobby_stand_midW", "lobby_stand_entry"];
            const w = opts[randInt(0, opts.length - 1)];
            plan.push({ type: "WALK_TO_WP", floor: 0, wpName: w });
            plan.push({ type: "WAIT_SIM", minutes: randInt(4, 12) });
        } else if (r < 0.77) {
            // ride up to office-floor lounge
            const f = randInt(1, 5);
            plan.push({ type: "WALK_TO_WP", floor: 0, wpName: "elevWait" });
            plan.push({ type: "WAIT_AT_PANEL", floor: 0, dir: 1, toFloor: f });
            plan.push({ type: "ENTER_ELEVATOR", floor: 0, dir: 1, toFloor: f });
            plan.push({ type: "PRESS_FLOOR", floor: f });
            plan.push({ type: "ENTER_STATE", stateName: "IN_CAR" });
            plan.push({ type: "WAIT_FOR_FLOOR", floor: f });
            plan.push({ type: "EXIT_ELEVATOR", floor: f });
            plan.push({ type: "WALK_TO_WP", floor: f, wpName: "lounge_door" });
            plan.push({ type: "WALK_TO_WP", floor: f, wpName: "lounge_center" });
            plan.push({ type: "WAIT_SIM", minutes: randInt(6, 14) });
            // go back down
            plan.push({ type: "WALK_TO_WP", floor: f, wpName: "elevWait" });
            plan.push({ type: "WAIT_AT_PANEL", floor: f, dir: -1, toFloor: 0 });
            plan.push({ type: "ENTER_ELEVATOR", floor: f, dir: -1, toFloor: 0 });
            plan.push({ type: "PRESS_FLOOR", floor: 0 });
            plan.push({ type: "ENTER_STATE", stateName: "IN_CAR" });
            plan.push({ type: "WAIT_FOR_FLOOR", floor: 0 });
            plan.push({ type: "EXIT_ELEVATOR", floor: 0 });
        } else {
            // sit in on a meeting in a random conference room
            const f = randInt(1, 5);
            let seat = null;
            for (let s = 0; s < 4; s++) {
                const wp2 = "conf_seat" + s;
                if (reserveSeat(a, f, wp2)) { seat = wp2; break; }
            }
            if (!seat) {
                // fall back to lobby loiter
                plan.push({ type: "WALK_TO_WP", floor: 0, wpName: "lobby_stand_center" });
                plan.push({ type: "WAIT_SIM", minutes: randInt(4, 12) });
            } else {
                plan.push({ type: "WALK_TO_WP", floor: 0, wpName: "elevWait" });
                plan.push({ type: "WAIT_AT_PANEL", floor: 0, dir: 1, toFloor: f });
                plan.push({ type: "ENTER_ELEVATOR", floor: 0, dir: 1, toFloor: f });
                plan.push({ type: "PRESS_FLOOR", floor: f });
                plan.push({ type: "ENTER_STATE", stateName: "IN_CAR" });
                plan.push({ type: "WAIT_FOR_FLOOR", floor: f });
                plan.push({ type: "EXIT_ELEVATOR", floor: f });
                plan.push({ type: "WALK_TO_WP", floor: f, wpName: "conf_door" });
                plan.push({ type: "WALK_TO_WP", floor: f, wpName: "conf_center" });
                plan.push({ type: "WALK_TO_WP", floor: f, wpName: seat });
                plan.push({ type: "SIT", floor: f, wpName: seat });
                plan.push({ type: "WAIT_SIM", minutes: randInt(15, 35) });
                plan.push({ type: "STAND" });
                plan.push({ type: "RELEASE_SEAT" });
                plan.push({ type: "WALK_TO_WP", floor: f, wpName: "conf_door" });
                plan.push({ type: "WALK_TO_WP", floor: f, wpName: "elevWait" });
                plan.push({ type: "WAIT_AT_PANEL", floor: f, dir: -1, toFloor: 0 });
                plan.push({ type: "ENTER_ELEVATOR", floor: f, dir: -1, toFloor: 0 });
                plan.push({ type: "PRESS_FLOOR", floor: 0 });
                plan.push({ type: "ENTER_STATE", stateName: "IN_CAR" });
                plan.push({ type: "WAIT_FOR_FLOOR", floor: 0 });
                plan.push({ type: "EXIT_ELEVATOR", floor: 0 });
            }
        }

        // leave building
        plan.push({ type: "WALK_TO_WP", floor: 0, wpName: "lobby_center" });
        plan.push({ type: "WALK_TO_WP", floor: 0, wpName: "entrance" });
        plan.push({ type: "WALK_TO_WP", floor: 0, wpName: "front_door_threshold" });
        plan.push({ type: "WALK_TO_WP", floor: 0, wpName: "outside" });
        plan.push({ type: "EXIT_BUILDING" });
        return plan;
    }

    // ---------- choose next activity (worker at desk) ----------
    function chooseNextActivityPlan(a) {
        const now = Clock.simMinute;
        // 1. past departure -> leave
        if (now >= a.departureTime) {
            return planLeaveBuilding(a);
        }
        // 2. planned meeting
        for (let i = 0; i < a.plannedMeetingTimes.length; i++) {
            if (now >= a.plannedMeetingTimes[i]) {
                a.plannedMeetingTimes.splice(i, 1);
                return planAttendMeeting(a);
            }
        }
        // 3. past lunch window and not lunched
        if (now >= a.lunchTime && !a.hasLunched) {
            return planGoToLunch(a);
        }
        // 4. weighted die
        const r = Math.random();
        const meetingGated = MEETING_PROB * 0.4;
        if (r < meetingGated) {
            return planAttendMeeting(a);
        } else if (r < meetingGated + 0.12) {
            return planVisitLounge(a);
        } else if (r < meetingGated + 0.12 + 0.15) {
            return planVisitCoworker(a);
        } else {
            // keep working
            const plan = [];
            plan.push({ type: "WAIT_SIM", minutes: randInt(18, 65) });
            plan.push({ type: "PICK_NEXT_ACTIVITY" });
            return plan;
        }
    }

    // ---------- HUD ----------
    let hudEl, timeEl, speedSlider, occupancySlider, occLabel, stateEl, elevEl;

    function buildHUD() {
        hudEl = document.createElement("div");
        hudEl.style.cssText = "position:absolute;top:10px;left:10px;background:rgba(20,22,30,0.82);color:#dfe6f0;font:12px/1.5 monospace;padding:12px 14px;border-radius:8px;user-select:none;z-index:10;min-width:260px";
        document.body.appendChild(hudEl);

        timeEl = document.createElement("div");
        timeEl.style.cssText = "font-size:22px;font-weight:bold;color:#ffcc66;margin-bottom:6px";
        timeEl.textContent = Clock.format();
        hudEl.appendChild(timeEl);

        // speed slider
        const speedLabel = document.createElement("div");
        speedLabel.textContent = "Speed: 120x";
        hudEl.appendChild(speedLabel);
        speedSlider = document.createElement("input");
        speedSlider.type = "range";
        speedSlider.min = "0";
        speedSlider.max = "9";
        speedSlider.value = "6"; // index of 120 in log scale
        speedSlider.style.width = "100%";
        speedSlider.addEventListener("input", function (ev) {
            const idx = parseInt(ev.target.value, 10);
            const stops = [1, 2, 4, 8, 15, 30, 60, 120, 240, 600];
            Clock.timeScale = stops[idx];
            speedLabel.textContent = "Speed: " + Clock.timeScale + "x";
        });
        hudEl.appendChild(speedSlider);

        // occupancy slider
        occLabel = document.createElement("div");
        occLabel.textContent = "Occupancy: 45 / 100 people";
        hudEl.appendChild(occLabel);
        occupancySlider = document.createElement("input");
        occupancySlider.type = "range";
        occupancySlider.min = "1";
        occupancySlider.max = String(MAX_OCCUPANCY);
        occupancySlider.value = String(targetOccupancy);
        occupancySlider.style.width = "100%";
        occupancySlider.addEventListener("input", function (ev) {
            targetOccupancy = parseInt(ev.target.value, 10);
            occLabel.textContent = "Occupancy: " + targetOccupancy + " / 100 people";
            applyOccupancy();
        });
        hudEl.appendChild(occupancySlider);

        stateEl = document.createElement("div");
        stateEl.style.cssText = "margin-top:8px;white-space:pre";
        hudEl.appendChild(stateEl);

        elevEl = document.createElement("div");
        elevEl.style.cssText = "margin-top:4px;white-space:pre;color:#9fd0ff";
        hudEl.appendChild(elevEl);
    }

    const STATE_LABELS = ["DISABLED", "AWAY", "ARRIVING", "WAITING_ELEVATOR", "IN_CAR", "ON_FLOOR", "AT_DESK", "IN_MEETING", "AT_BREAK", "AT_LUNCH", "VISITING", "LEAVING", "GONE"];

    function updateHUD() {
        if (!hudEl) return;
        timeEl.textContent = Clock.format();

        const counts = {};
        STATE_LABELS.forEach(function (s) { counts[s] = 0; });
        for (let i = 0; i < agents.length; i++) {
            const st = agents[i].state;
            counts[st] = (counts[st] || 0) + 1;
        }
        let stateStr = "";
        ["AWAY", "ARRIVING", "WAITING_ELEVATOR", "IN_CAR", "ON_FLOOR", "AT_DESK", "IN_MEETING", "AT_BREAK", "AT_LUNCH", "VISITING", "LEAVING", "GONE"].forEach(function (s) {
            if (counts[s] > 0) stateStr += s + ": " + counts[s] + "  ";
        });
        stateEl.textContent = stateStr || "no agents present";

        // elevator readout
        let dirTxt = "=";
        if (elevator && elevator.direction > 0) dirTxt = "^";
        else if (elevator && elevator.direction < 0) dirTxt = "v";
        const destArr = elevator ? Array.from(elevator.destinations).sort(function (a, b) { return a - b; }) : [];
        const upArr = elevator ? Array.from(elevator.upCalls).sort(function (a, b) { return a - b; }) : [];
        const downArr = elevator ? Array.from(elevator.downCalls).sort(function (a, b) { return a - b; }) : [];
        elevEl.textContent =
            "Elevator: F" + (elevator ? elevator.currentFloor : 0) + dirTxt + " " + (elevator ? elevator.state : "IDLE") +
            "\npassengers: " + (elevator ? elevator.passengers.size : 0) +
            "\ndest: [" + destArr.join(",") + "]" +
            "\nup: [" + upArr.join(",") + "]  down: [" + downArr.join(",") + "]";
    }

    // ---------- expose for debug ----------
    window.Clock = Clock;
    window.__simDebug = {
        agents: function () { return agents; },
        elevator: function () { return elevator; },
        world: function () { return world; },
        seatReservations: function () { return seatReservations; }
    };

    // ---------- auto-start ----------
    if (document.readyState === "loading") {
        window.addEventListener("DOMContentLoaded", startSimulation);
    } else {
        startSimulation();
    }
})();
