// sim.js - simulated clock, day/night lighting, agent state machine + daily schedules,
// render loop, UI. Classic script, no ES modules. Auto-starts on load.

// ---- Top-level state (declared once, referenced across this file only) --------------
let scene, camera, renderer, controls, sun;
let simWorld, simElevator;
let simClock;
let agentsPool;
let seatReservations;
let simAgentsEl;
let speedSlider;
let occupancySlider;
let hudTimeEl;

const SIM_CONFIG = {
    MAX_WORKERS: 20,
    MAX_VISITORS: 80,
    MAX_OCCUPANCY: 100,
    DEFAULT_OCCUPANCY: 45,
    WALK_SPEED: 1.35,
    MAX_STEP_PER_FRAME: 1.35,
    COLLIDE_DIST: 0.7,
    COLLIDE_PUSH: 0.18,
    SPEED_STOPS: [1, 2, 5, 10, 20, 40, 60, 120, 240, 360, 600]
};

let targetOccupancy = SIM_CONFIG.DEFAULT_OCCUPANCY;

function simRandom(min, max) { return min + Math.random() * (max - min); }
function simRandInt(min, max) { return Math.floor(min + Math.random() * (max - min + 1)); }
function simPick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// ---- Simulated clock ---------------------------------------------------------------
function createSimClock() {
    return {
        simMinute: 7 * 60 + 30,
        timeScale: 120,
        realClock: new THREE.Clock(),
        tick: function (realDt) {
            this.simMinute += realDt * this.timeScale / 60;
            if (this.simMinute >= 24 * 60) {
                this.simMinute -= 24 * 60;
                onDayWrap();
            }
        },
        format: function () {
            let m = Math.floor(this.simMinute);
            const h24 = Math.floor(m / 60);
            const mm = m % 60;
            const ap = h24 < 12 ? "AM" : "PM";
            let h = h24 % 12;
            if (h === 0) h = 12;
            return " " + h + ":" + (mm < 10 ? "0" : "") + mm + " " + ap;
        }
    };
}

// ---- Day / night keyframes (hour, sky, ambient, hemi, sunIntensity, sunColor) -------
const DAYNIGHT_KEYS = [
    { h: 5.0, sky: 0x0e1420, ai: 0.45, hi: 0.32, si: 0.12, sc: 0x8899cc },
    { h: 6.0, sky: 0x3a4a7a, ai: 0.55, hi: 0.4, si: 0.55, sc: 0xffd9a0 },
    { h: 6.5, sky: 0x8fb4e8, ai: 0.7, hi: 0.5, si: 0.95, sc: 0xfff2d0 },
    { h: 9.0, sky: 0xbcd4f2, ai: 0.85, hi: 0.55, si: 1.0, sc: 0xffffff },
    { h: 13.0, sky: 0xc3ddf7, ai: 0.9, hi: 0.55, si: 1.05, sc: 0xffffff },
    { h: 17.0, sky: 0xbcd4f2, ai: 0.8, hi: 0.5, si: 0.95, sc: 0xfff2d0 },
    { h: 18.0, sky: 0xe88a4a, ai: 0.6, hi: 0.4, si: 0.6, sc: 0xffb066 },
    { h: 18.5, sky: 0x3a2f55, ai: 0.5, hi: 0.34, si: 0.25, sc: 0xcc88cc },
    { h: 19.5, sky: 0x0e1420, ai: 0.45, hi: 0.32, si: 0.12, sc: 0x8899cc }
];

function hexToRgb(hex) {
    return { r: ((hex >> 16) & 255) / 255, g: ((hex >> 8) & 255) / 255, b: (hex & 255) / 255 };
}
function mixHex(a, b, t) {
    const ca = hexToRgb(a), cb = hexToRgb(b);
    const r = Math.round((ca.r + (cb.r - ca.r) * t) * 255);
    const g = Math.round((ca.g + (cb.g - ca.g) * t) * 255);
    const bl = Math.round((ca.b + (cb.b - ca.b) * t) * 255);
    return new THREE.Color(r / 255, g / 255, bl / 255);
}

function updateLighting(simHour) {
    const keys = DAYNIGHT_KEYS;
    let lo = keys[0], hi = keys[keys.length - 1];
    if (simHour <= keys[0].h) { lo = hi = keys[0]; }
    else if (simHour >= keys[keys.length - 1].h) { lo = hi = keys[keys.length - 1]; }
    else {
        for (let i = 0; i < keys.length - 1; i++) {
            if (simHour >= keys[i].h && simHour <= keys[i + 1].h) { lo = keys[i]; hi = keys[i + 1]; break; }
        }
    }
    let t = 0;
    if (hi.h > lo.h) t = (simHour - lo.h) / (hi.h - lo.h);
    scene.background = mixHex(lo.sky, hi.sky, t);
    scene.fog = null;
    const ambient = scene.children.find((c) => c.isAmbientLight);
    const hemi = scene.children.find((c) => c.isHemisphereLight);
    if (ambient) ambient.intensity = lo.ai + (hi.ai - lo.ai) * t;
    if (hemi) hemi.intensity = lo.hi + (hi.hi - lo.hi) * t;
    if (sun) {
        sun.intensity = lo.si + (hi.si - lo.si) * t;
        sun.color.copy(mixHex(lo.sc, hi.sc, t));
    }
}

// ---- Agents ------------------------------------------------------------------------

function makeAgent(id, role) {
    const group = createPerson();
    const agent = {
        id: id,
        role: role,
        name: agentName(),
        group: group,
        state: "DISABLED",
        plan: [],
        planIndex: 0,
        currentAction: null,
        homeFloor: null,
        deskId: null,
        deskWpName: null,
        deskDoorWpName: null,
        floor: 0,
        inCar: false,
        nearWp: null,
        hasLunched: false,
        arrivalTime: 0,
        lunchTime: 0,
        lunchDuration: 40,
        departureTime: 0,
        visitDuration: 20,
        plannedMeetingTimes: [],
        // per-action scratch
        action: null,
        entranceExempt: false,
        _prevPos: null,
        _stallT: 0
    };
    agent.group.userData.agentRef = agent;
    scene.add(group);
    group.visible = false;
    return agent;
}

const FIRST_NAMES = ["Ava", "Ben", "Cara", "Dev", "Elle", "Finn", "Gia", "Hugo", "Ivy", "Jack",
    "Kira", "Liam", "Maya", "Nate", "Ola", "Pia", "Quinn", "Rae", "Sam", "Tess",
    "Uma", "Vic", "Wes", "Xia", "Yara", "Zane", "Nina", "Omar", "Lila", "Rex"];
let nameCounter = 0;
function agentName() { return FIRST_NAMES[nameCounter % FIRST_NAMES.length]; }

function resampleSchedule(agent) {
    const isVisitor = agent.role === "VISITOR";
    agent.hasLunched = false;
    agent.plannedMeetingTimes = [];
    if (isVisitor) {
        agent.arrivalTime = simRandInt(8 * 60, 11 * 60);
        agent.visitDuration = simRandInt(15, 45);
        agent.departureTime = agent.arrivalTime + agent.visitDuration;
    } else {
        agent.arrivalTime = simRandInt(8 * 60 + 15, 9 * 60 + 30);
        agent.lunchTime = simRandInt(11 * 60 + 30, 13 * 60 + 30);
        agent.lunchDuration = simRandInt(25, 60);
        if (Math.random() < 0.15) agent.departureTime = simRandInt(18 * 60 + 30, 19 * 60 + 45);
        else agent.departureTime = simRandInt(16 * 60 + 45, 18 * 60 + 30);
        // 0..2 planned meetings (one morning, one afternoon).
        const nMeet = simRandInt(0, 2);
        if (nMeet >= 1) agent.plannedMeetingTimes.push(simRandInt(9 * 60, 11 * 60));
        if (nMeet >= 2) agent.plannedMeetingTimes.push(simRandInt(14 * 60, 16 * 60));
    }
}

function assignDesks() {
    let deskIdx = 0;
    for (let i = 0; i < agentsPool.length; i++) {
        const a = agentsPool[i];
        if (a.role === "WORKER") {
            a.homeFloor = 1 + Math.floor(deskIdx / 4);
            a.deskId = ["officeA", "officeB", "officeC", "officeD"][deskIdx % 4];
            a.deskWpName = a.deskId + "_desk";
            a.deskDoorWpName = a.deskId + "_door";
            deskIdx++;
        }
    }
}

function presentCount() {
    let n = 0;
    for (let i = 0; i < agentsPool.length; i++) {
        const s = agentsPool[i].state;
        if (s !== "DISABLED" && s !== "AWAY" && s !== "GONE") n++;
    }
    return n;
}

function applyOccupancy() {
    for (let i = 0; i < agentsPool.length; i++) {
        const a = agentsPool[i];
        if (a.id < targetOccupancy) {
            if (a.state === "DISABLED") { a.state = "AWAY"; }
        } else {
            if (a.state === "AWAY") { a.state = "DISABLED"; a.group.visible = false; }
        }
    }
}

function onDayWrap() {
    simElevator.reset();
    for (let i = 0; i < agentsPool.length; i++) {
        const a = agentsPool[i];
        if (a.id < targetOccupancy) {
            // Remove any lingering visual, restart the day.
            if (a.group.parent) a.group.parent.remove(a.group);
            scene.add(a.group);
            a.group.position.set(0, 0, 0);
            a.group.rotation.y = 0;
            a.inCar = false;
            a.nearWp = null;
            a.currentAction = null;
            a.action = null;
            a.plan = [];
            a.planIndex = 0;
            a.group.visible = false;
            resampleSchedule(a);
            a.state = "AWAY";
        } else {
            a.state = "DISABLED";
            a.group.visible = false;
            a.inCar = false;
            a.currentAction = null;
            a.action = null;
            a.plan = [];
            a.planIndex = 0;
            if (a.group.parent) a.group.parent.remove(a.group);
        }
    }
}

function topUpVisitors() {
    const hour = simClock.simMinute / 60;
    if (hour < 8 || hour > 19.5) return;
    const deficit = targetOccupancy - presentCount();
    if (deficit <= 0) return;
    let reArmed = 0;
    for (let i = 0; i < agentsPool.length && reArmed < deficit; i++) {
        const a = agentsPool[i];
        if (a.role !== "VISITOR") continue;
        if (a.state === "AWAY" || a.state === "GONE") {
            a.arrivalTime = Math.floor(simClock.simMinute) + simRandInt(0, 6);
            a.visitDuration = simRandInt(15, 45);
            a.departureTime = a.arrivalTime + a.visitDuration;
            a.hasLunched = false;
            a.state = "AWAY";
            reArmed++;
        }
    }
}

// ---- Navigation helpers -------------------------------------------------------------

function floorForY(y) {
    return Math.max(0, Math.min(simWorld.floors.length - 1, Math.round(y / WORLD.FLOOR_HEIGHT)));
}

function pathTo(agent, floor, wpName) {
    const nodes = simWorld.floors[floor].nodes;
    if (!nodes[wpName]) return null;
    const path = simWorld.bfsPath(nodes, agent.nearWp, wpName) || [];
    const target = nodes[wpName].pos;
    if (path.length === 0) {
        // Disconnected or already at target: hand back a direct segment.
        if (agent.nearWp && nodes[agent.nearWp]) {
            const startPos = nodes[agent.nearWp].pos;
            if (agent.group.position.distanceTo(startPos) > 0.25) path.unshift(agent.group.position.clone());
            path.push(target);
        } else {
            if (agent.group.position.distanceTo(target) > 0.25) path.push(target.clone());
        }
        if (path.length === 0) return [target.clone()];
        return path;
    }
    // Prepend a direct segment if the agent is not already at the path start.
    if (agent.nearWp && nodes[agent.nearWp]) {
        const startPos = nodes[agent.nearWp].pos;
        if (agent.group.position.distanceTo(startPos) > 0.25) path.unshift(agent.group.position.clone());
    } else {
        path.unshift(agent.group.position.clone());
    }
    return path;
}

// ---- Movement primitives -------------------------------------------------------------

function startAction(agent, action) {
    agent.currentAction = action;
    agent.action = action;
    // Resolve time-relative values now (not at plan compile time).
    if (action.type === "WAIT_SIM") {
        action.untilMin = simClock.simMinute + action.minutes;
    }
    if (action.type === "WALK_TO_WP") {
        agent.floor = action.floor;
        agent._stallT = 0;
    }
}

function stepWalk(agent, motionDt) {
    const act = agent.action;
    if (act.path == null) {
        act.path = pathTo(agent, act.floor, act.wpName);
        if (!act.path || act.path.length === 0) {
            // No usable path: snap to target so we do not loop forever.
            agent.group.position.copy(act.target || new THREE.Vector3(0, 0, 0));
            agent.nearWp = act.wpName;
            if (act.wpName === "front_door_threshold" || act.wpName === "entrance" || act.wpName === "outside") {
                agent.entranceExempt = false;
            }
            return true;
        }
        act.pi = 0;
        agent._stallT = 0;
    }
    const path = act.path;
    const speed = SIM_CONFIG.WALK_SPEED;
    let budget = Math.min(SIM_CONFIG.MAX_STEP_PER_FRAME, speed * motionDt);
    if (act.type === "WALK_TO_WP" && (act.wpName === "outside" || act.wpName === "front_door_threshold" || act.wpName === "entrance")) {
        agent.entranceExempt = true;
    }
    const pos = agent.group.position;
    let stall = 0;
    while (budget > 0.0001 && act.pi < path.length) {
        const target = path[act.pi];
        const dx = target.x - pos.x, dz = target.z - pos.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < 0.06) { act.pi++; continue; }
        const step = Math.min(budget, dist);
        pos.x += (dx / dist) * step;
        pos.z += (dz / dist) * step;
        budget -= step;
        stall = dist;
    }
    // Snap Y to the target floor height (or car-local 0 while boarding).
    if (agent.inCar) pos.y = 0;
    else pos.y = act.floor * WORLD.FLOOR_HEIGHT;

    // Stall recovery: barely any progress for a while -> skip the waypoint.
    if (stall < 0.005) {
        agent._stallT += motionDt;
        if (agent._stallT > 1.5 && act.pi < path.length) {
            act.pi++;
            agent._stallT = 0;
        }
    } else {
        agent._stallT = 0;
    }

    if (act.pi >= path.length) {
        agent.nearWp = act.wpName;
        if (act.wpName === "front_door_threshold" || act.wpName === "entrance" || act.wpName === "outside") {
            agent.entranceExempt = false;
        }
        return true;
    }
    return false;
}

function stepWalkToDoor(agent, motionDt) {
    const act = agent.action;
    if (act.phase === "reserve") {
        if (agent.inCar) return true;
        // Walk to the door threshold if not already there.
        if (!act.atDoor) {
            if (!act.doorPath) act.doorPath = [act.doorWorld.clone()];
            const pos = agent.group.position;
            const target = act.doorPath[0];
            const dx = target.x - pos.x, dz = target.z - pos.z;
            const dist = Math.sqrt(dx * dx + dz * dz);
            const budget = Math.min(SIM_CONFIG.MAX_STEP_PER_FRAME, SIM_CONFIG.WALK_SPEED * motionDt);
            if (dist < 0.12) {
                agent.entranceExempt = false;
                act.atDoor = true;
                act.phase = "board";
                act._stallT = 0;
                return false;
            }
            const step = Math.min(budget, dist);
            pos.x += (dx / dist) * step;
            pos.z += (dz / dist) * step;
            agent._stallT += (step < 0.005) ? motionDt : 0;
            if (agent._stallT > 1.5) {
                pos.copy(target);
                act.atDoor = true;
                act.phase = "board";
            }
        }
        return false;
    }
    if (act.phase === "board") {
        // Reparent to the car, then walk to the reserved interior spot.
        if (!agent.inCar) {
            simElevator.car.attach(agent.group);
            agent.inCar = true;
        }
        const pos = agent.group.position;
        const sx = act.spot.x, sz = act.spot.z;
        const dx = sx - pos.x, dz = sz - pos.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        const budget = Math.min(SIM_CONFIG.MAX_STEP_PER_FRAME, SIM_CONFIG.WALK_SPEED * motionDt);
        if (dist < 0.12) {
            simElevator.completeBoard(agent);
            agent.group.rotation.y = 0;
            agent.group.userData.isSitting = false;
            return true;
        }
        const step = Math.min(budget, dist);
        pos.x += (dx / dist) * step;
        pos.z += (dz / dist) * step;
        return false;
    }
    return true;
}

// ---- Action handlers -----------------------------------------------------------------

function handleAction(agent, motionDt) {
    const a = agent.currentAction;
    if (!a) return true;
    const t = a.type;
    if (t === "NOOP") return true;
    if (t === "ENTER_STATE") { agent.state = a.state; return true; }
    if (t === "MARK_LUNCHED") { agent.hasLunched = true; return true; }
    if (t === "WAIT_SIM") { return simClock.simMinute >= a.untilMin; }
    if (t === "WALK_TO_WP") return stepWalk(agent, motionDt);
    if (t === "SIT") return doSit(agent);
    if (t === "STAND") return doStand(agent);
    if (t === "RELEASE_SEAT") { releaseSeat(agent); return true; }
    if (t === "EXIT_BUILDING") { doExit(agent); return true; }
    if (t === "WAIT_AT_PANEL") return stepWaitAtPanel(agent, motionDt);
    if (t === "ENTER_ELEVATOR") return stepEnterElevator(agent, motionDt);
    if (t === "PRESS_FLOOR") { simElevator.pressDestination(a.floor); return true; }
    if (t === "WAIT_FOR_FLOOR") return stepWaitForFloor(agent);
    if (t === "EXIT_ELEVATOR") return stepExitElevator(agent, motionDt);
    if (t === "PICK_NEXT_ACTIVITY") { chooseNextActivity(agent); return true; }
    return true;
}

function stepWaitAtPanel(agent, motionDt) {
    if (agent.inCar) return true;
    const a = agent.action;
    if (agent.nearWp !== "elevWait") {
        // Walk to the panel with a proper WALK_TO_WP action, then hand back to the panel action.
        if (!a.walkAction) a.walkAction = A("WALK_TO_WP", { floor: agent.floor, wpName: "elevWait" });
        agent.action = a.walkAction;
        const done = stepWalk(agent, motionDt);
        if (done) {
            agent.action = a;
            a.walkAction = null;
            return false;
        }
        return false;
    }
    // At the panel: re-press the hall call every frame until accepted (in case another cycle cleared it).
    if (a.fromFloor < a.toFloor) simElevator.callUp(agent.floor);
    else if (a.fromFloor > a.toFloor) simElevator.callDown(agent.floor);
    if (simElevator.isAcceptingAt(agent.floor, a.toFloor)) return true;
    return false;
}

function stepEnterElevator(agent, motionDt) {
    const a = agent.action;
    if (agent.inCar) {
        if (a.phase === "board") return stepWalkToDoor(agent, motionDt);
        return true;
    }
    if (!a.phase || a.phase === "reserve") {
        if (a.phase !== "reserve") a.phase = "reserve";
        // If the car slipped away, re-call so it comes back.
        if (a.fromFloor < a.toFloor) simElevator.callUp(agent.floor);
        else if (a.fromFloor > a.toFloor) simElevator.callDown(agent.floor);
        if (!simElevator.isAcceptingAt(agent.floor, a.toFloor)) return false;
        const spot = simElevator.reserveBoardingSpot(agent);
        if (!spot) { a.slipped = true; return false; }
        a.spot = spot;
        const doorWorld = new THREE.Vector3(spot.x, agent.floor * WORLD.FLOOR_HEIGHT, 1.9);
        a.doorWorld = doorWorld;
        a.phase = "reserve-walk";
        return false;
    }
    if (a.phase === "reserve-walk" || a.phase === "board") {
        return stepWalkToDoor(agent, motionDt);
    }
    return false;
}

function stepWaitForFloor(agent) {
    if (!agent.inCar) return false;
    const a = agent.action;
    if (simElevator.currentFloor === a.floor && simElevator.state === "DOOR_OPEN") return true;
    return false;
}

function stepExitElevator(agent, motionDt) {
    if (agent.inCar) {
        // Hold the door by registering disembark, then leave the car.
        if (!agent.action.disembarked) {
            simElevator.registerDisembark(agent);
            agent.action.disembarked = true;
        }
        simElevator.car; // (car reference intentionally touched)
        // Reparent to scene preserving world position.
        const worldPos = agent.group.getWorldPosition(new THREE.Vector3());
        scene.attach(agent.group);
        agent.group.position.copy(worldPos);
        agent.inCar = false;
        agent.floor = agent.action.toFloor;
        agent.nearWp = null;
        // Walk to elevWait on the target floor.
        if (!agent.action.exitPath) {
            agent.action.exitWp = "elevWait";
            agent.action.walkFloor = agent.action.toFloor;
        }
        return stepWalk(agent, motionDt);
    } else {
        // Already out: ensure we walked to elevWait, then complete.
        if (agent.nearWp === "elevWait") {
            simElevator.completeDisembark(agent);
            return true;
        }
        if (agent.action.exitWp === "elevWait") return stepWalk(agent, motionDt);
        return true;
    }
}

function doSit(agent) {
    const a = agent.action;
    const floor = simWorld.floors[a.floor];
    const target = floor.sitTargets[a.wpName];
    const node = floor.nodes[a.wpName];
    if (!node) return true;
    let px = node.pos.x, py = a.floor * WORLD.FLOOR_HEIGHT, pz = node.pos.z;
    if (target && target.sit === false) {
        // Standing waypoint: jitter into a small ring so co-assigned agents spread out.
        const ang = Math.random() * Math.PI * 2;
        const rad = 0.35 + Math.random() * 0.4;
        px += Math.cos(ang) * rad;
        pz += Math.sin(ang) * rad;
    }
    agent.group.position.set(px, py, pz);
    if (target) agent.group.rotation.y = target.facing;
    agent.group.userData.isSitting = !!target.sit;
    agent.group.userData.seatFacing = target ? target.facing : 0;
    if (agent.inCar) {
        agent.group.position.y = 0;
    } else if (target && target.sit) {
        agent.group.position.y = py - 0.35; // lower so hips align with the seat
    } else {
        agent.group.position.y = py;
    }
    agent.nearWp = a.wpName;
    return true;
}

function doStand(agent) {
    agent.group.userData.isSitting = false;
    const a = agent.action;
    const floor = a.floor !== undefined ? a.floor : agent.floor;
    if (!agent.inCar) agent.group.position.y = floor * WORLD.FLOOR_HEIGHT;
    return true;
}

function doExit(agent) {
    agent.state = "GONE";
    if (agent.group.parent) agent.group.parent.remove(agent.group);
    agent.group.visible = false;
    return true;
}

function releaseSeat(agent) {
    const wp = agent.nearWp || (agent.action && agent.action.wpName) || agent.deskWpName;
    if (wp) {
        const key = (agent.floor !== undefined && agent.inCar ? "car" : agent.floor) + ":" + wp;
        seatReservations.delete(agent.floor + ":" + wp);
    }
}

function reserveSeat(floor, wpName, agent) {
    const key = floor + ":" + wpName;
    if (seatReservations.has(key)) return false;
    seatReservations.add(key);
    agent._reservedSeat = key;
    return true;
}

// ---- Plan compilers (return arrays of action objects) --------------------------------

function A(type, fields) { const o = { type: type }; if (fields) for (const k in fields) o[k] = fields[k]; return o; }

function standFrom(floor) { return [A("STAND", { floor: floor })]; }

function walkChain(floor, wpNames) {
    const acts = [];
    for (let i = 0; i < wpNames.length; i++) acts.push(A("WALK_TO_WP", { floor: floor, wpName: wpNames[i] }));
    return acts;
}

function elevatorRide(fromFloor, toFloor) {
    const dir = toFloor > fromFloor ? "up" : "down";
    return [
        A("WAIT_AT_PANEL", { fromFloor: fromFloor, toFloor: toFloor, dir: dir }),
        A("ENTER_ELEVATOR", { fromFloor: fromFloor, toFloor: toFloor, dir: dir }),
        A("PRESS_FLOOR", { floor: toFloor }),
        A("WAIT_FOR_FLOOR", { floor: toFloor }),
        A("EXIT_ELEVATOR", { toFloor: toFloor })
    ];
}

function walkToElevator(floor) { return walkChain(floor, ["lobby_center", "elevWait"]); }

function exitCarToFloor(floor) { return [A("EXIT_ELEVATOR", { toFloor: floor })]; }

function arriveToDesk(agent) {
    const f = agent.homeFloor;
    const acts = [];
    acts.push(A("ENTER_STATE", { state: "ARRIVING" }));
    acts.push(A("WALK_TO_WP", { floor: 0, wpName: "outside" }));
    acts.push.apply(acts, walkChain(0, ["front_door_threshold", "entrance", "lobby_center"]));
    acts.push.apply(acts, elevatorRide(0, f));
    acts.push(A("ENTER_STATE", { state: "ON_FLOOR" }));
    acts.push.apply(acts, walkChain(f, [agent.deskDoorWpName]));
    acts.push(A("SIT", { floor: f, wpName: agent.deskWpName }));
    acts.push(A("ENTER_STATE", { state: "AT_DESK" }));
    acts.push(A("WAIT_SIM", { minutes: simRandInt(18, 50) }));
    acts.push(A("PICK_NEXT_ACTIVITY"));
    return acts;
}

function goToLunch(agent) {
    const f = agent.homeFloor;
    const acts = [];
    acts.push.apply(acts, standFrom(f));
    acts.push(A("RELEASE_SEAT"));
    acts.push(A("ENTER_STATE", { state: "AT_LUNCH" }));
    acts.push.apply(acts, walkChain(f, [agent.deskDoorWpName]));
    acts.push.apply(acts, walkToElevator(f));
    acts.push.apply(acts, elevatorRide(f, 0));
    const cafeSpot = simPick(simWorld.floors[0].cafeSpots);
    acts.push.apply(acts, walkChain(0, ["lobby_center", cafeSpot]));
    acts.push(A("SIT", { floor: 0, wpName: cafeSpot }));
    acts.push(A("WAIT_SIM", { minutes: agent.lunchDuration }));
    acts.push(A("MARK_LUNCHED"));
    acts.push.apply(acts, standFrom(0));
    acts.push.apply(acts, walkChain(0, ["lobby_center", "elevWait"]));
    acts.push.apply(acts, elevatorRide(0, f));
    acts.push.apply(acts, walkChain(f, [agent.deskDoorWpName]));
    acts.push(A("SIT", { floor: f, wpName: agent.deskWpName }));
    acts.push(A("ENTER_STATE", { state: "AT_DESK" }));
    acts.push(A("WAIT_SIM", { minutes: simRandInt(10, 30) }));
    acts.push(A("PICK_NEXT_ACTIVITY"));
    return acts;
}

function visitLounge(agent) {
    const f = agent.homeFloor;
    const acts = [];
    acts.push.apply(acts, standFrom(f));
    acts.push(A("ENTER_STATE", { state: "AT_BREAK" }));
    const spots = simWorld.floors[f].loungeSpots;
    const spot = simPick(spots);
    acts.push.apply(acts, walkChain(f, [agent.deskDoorWpName]));
    acts.push.apply(acts, walkChain(f, ["lounge_center", spot]));
    acts.push(A("SIT", { floor: f, wpName: spot }));
    acts.push(A("WAIT_SIM", { minutes: simRandInt(5, 12) }));
    acts.push.apply(acts, standFrom(f));
    acts.push(A("RELEASE_SEAT"));
    acts.push.apply(acts, walkChain(f, [agent.deskDoorWpName]));
    acts.push(A("SIT", { floor: f, wpName: agent.deskWpName }));
    acts.push(A("ENTER_STATE", { state: "AT_DESK" }));
    acts.push(A("WAIT_SIM", { minutes: simRandInt(10, 40) }));
    acts.push(A("PICK_NEXT_ACTIVITY"));
    return acts;
}

function attendMeeting(agent, minutes) {
    const f = agent.homeFloor;
    let mFloor = f;
    if (Math.random() > 0.65) mFloor = simRandInt(1, 5);
    const acts = [];
    acts.push.apply(acts, standFrom(f));
    acts.push(A("ENTER_STATE", { state: "IN_MEETING" }));
    let seats = simWorld.floors[mFloor].confSeats;
    let seat = null;
    for (let i = seats.length - 1; i >= 0; i--) {
        if (reserveSeat(mFloor, seats[i], agent)) { seat = seats[i]; break; }
    }
    if (!seat) {
        // All seats taken -> fall back to a lounge break on the home floor.
        releaseSeat(agent);
        return visitLounge(agent);
    }
    if (mFloor !== f) acts.push.apply(acts, elevatorRide(f, mFloor));
    acts.push.apply(acts, walkChain(mFloor, ["conf_center", seat]));
    acts.push(A("SIT", { floor: mFloor, wpName: seat }));
    acts.push(A("WAIT_SIM", { minutes: minutes || simRandInt(22, 45) }));
    acts.push.apply(acts, standFrom(mFloor));
    acts.push(A("RELEASE_SEAT"));
    if (mFloor !== f) {
        acts.push.apply(acts, walkChain(mFloor, ["conf_center", "conf_door"]));
        acts.push.apply(acts, walkToElevator(mFloor));
        acts.push.apply(acts, elevatorRide(mFloor, f));
        acts.push.apply(acts, walkChain(f, [agent.deskDoorWpName]));
    } else {
        acts.push.apply(acts, walkChain(mFloor, ["conf_center", "conf_door", agent.deskDoorWpName]));
    }
    acts.push(A("SIT", { floor: f, wpName: agent.deskWpName }));
    acts.push(A("ENTER_STATE", { state: "AT_DESK" }));
    acts.push(A("WAIT_SIM", { minutes: simRandInt(10, 40) }));
    acts.push(A("PICK_NEXT_ACTIVITY"));
    return acts;
}

function visitCoworker(agent) {
    const f = agent.homeFloor;
    const acts = [];
    acts.push.apply(acts, standFrom(f));
    acts.push(A("ENTER_STATE", { state: "AT_BREAK" }));
    // Pick a random agent currently at a desk.
    let target = null;
    for (let tries = 0; tries < 8; tries++) {
        const cand = simPick(agentsPool);
        if (cand.id !== agent.id && cand.role === "WORKER" && cand.state === "AT_DESK") { target = cand; break; }
    }
    if (target) {
        const tf = target.homeFloor;
        const door = target.deskDoorWpName;
        if (tf !== f) acts.push.apply(acts, elevatorRide(f, tf));
        acts.push.apply(acts, walkChain(tf, [door]));
        acts.push(A("SIT", { floor: tf, wpName: door }));
        acts.push(A("WAIT_SIM", { minutes: simRandInt(6, 18) }));
        acts.push.apply(acts, standFrom(tf));
        if (tf !== f) {
            acts.push.apply(acts, walkChain(tf, ["elevWait"]));
            acts.push.apply(acts, elevatorRide(tf, f));
        } else {
            acts.push.apply(acts, walkChain(f, ["elevWait"]));
        }
    } else {
        acts.push(A("WAIT_SIM", { minutes: simRandInt(8, 20) }));
        acts.push.apply(acts, walkChain(f, ["elevWait"]));
    }
    acts.push.apply(acts, walkChain(f, [agent.deskDoorWpName]));
    acts.push(A("SIT", { floor: f, wpName: agent.deskWpName }));
    acts.push(A("ENTER_STATE", { state: "AT_DESK" }));
    acts.push(A("WAIT_SIM", { minutes: simRandInt(10, 40) }));
    acts.push(A("PICK_NEXT_ACTIVITY"));
    return acts;
}

function leaveBuilding(agent) {
    const f = agent.homeFloor;
    const acts = [];
    acts.push.apply(acts, standFrom(f));
    acts.push(A("RELEASE_SEAT"));
    acts.push(A("ENTER_STATE", { state: "LEAVING" }));
    acts.push.apply(acts, walkChain(f, [agent.deskDoorWpName]));
    acts.push.apply(acts, walkToElevator(f));
    acts.push.apply(acts, elevatorRide(f, 0));
    acts.push.apply(acts, walkChain(0, ["lobby_center", "entrance", "front_door_threshold", "outside"]));
    acts.push(A("EXIT_BUILDING"));
    return acts;
}

function visitorVisit(agent) {
    const acts = [];
    acts.push(A("ENTER_STATE", { state: "ARRIVING" }));
    acts.push(A("WALK_TO_WP", { floor: 0, wpName: "outside" }));
    acts.push.apply(acts, walkChain(0, ["front_door_threshold", "entrance", "lobby_center"]));
    acts.push.apply(acts, visitorPickActivity(agent));
    // Head home.
    acts.push.apply(acts, walkChain(0, ["lobby_center", "entrance", "front_door_threshold", "outside"]));
    acts.push(A("EXIT_BUILDING"));
    return acts;
}

function visitorPickActivity(agent) {
    const roll = Math.random();
    const L = simWorld.floors[0];
    // ~23% sit in on a meeting on a random floor.
    if (roll < 0.23) {
        const mFloor = simRandInt(1, 5);
        const acts = [];
        const seats = simWorld.floors[mFloor].confSeats;
        let seat = null;
        for (let i = seats.length - 1; i >= 0; i--) {
            if (reserveSeat(mFloor, seats[i], agent)) { seat = seats[i]; break; }
        }
        if (!seat) {
            // Fallback: lobby loiter.
            return visitorLobbyLoiter(agent);
        }
        acts.push.apply(acts, elevatorRide(0, mFloor));
        acts.push.apply(acts, walkChain(mFloor, ["conf_center", seat]));
        acts.push(A("SIT", { floor: mFloor, wpName: seat }));
        acts.push(A("ENTER_STATE", { state: "IN_MEETING" }));
        acts.push(A("WAIT_SIM", { minutes: simRandInt(15, 35) }));
        acts.push.apply(acts, standFrom(mFloor));
        acts.push(A("RELEASE_SEAT"));
        acts.push.apply(acts, walkChain(mFloor, ["conf_center", "conf_door"]));
        acts.push.apply(acts, walkToElevator(mFloor));
        acts.push.apply(acts, elevatorRide(mFloor, 0));
        return acts;
    }
    if (roll < 0.33) { // ~10% bistro table (cafe)
        const spot = simPick(L.cafeSpots.filter((s) => s !== "cafe_order"));
        const acts = walkChain(0, ["cafe_door", spot]);
        acts.push(A("SIT", { floor: 0, wpName: spot }));
        acts.push(A("ENTER_STATE", { state: "VISITING" }));
        acts.push(A("WAIT_SIM", { minutes: simRandInt(10, 25) }));
        acts.push.apply(acts, standFrom(0));
        return acts;
    }
    if (roll < 0.39) { // ~6% cafe counter
        const acts = walkChain(0, ["cafe_door", "cafe_order"]);
        acts.push(A("SIT", { floor: 0, wpName: "cafe_order" }));
        acts.push(A("WAIT_SIM", { minutes: simRandInt(3, 8) }));
        acts.push.apply(acts, standFrom(0));
        return acts;
    }
    if (roll < 0.53) { // ~14% front lounge
        const spot = simPick(["fl_spot0", "fl_spot1", "fl_spot2"]);
        const acts = walkChain(0, ["fl_center", spot]);
        acts.push(A("SIT", { floor: 0, wpName: spot }));
        acts.push(A("ENTER_STATE", { state: "VISITING" }));
        acts.push(A("WAIT_SIM", { minutes: simRandInt(8, 20) }));
        acts.push.apply(acts, standFrom(0));
        return acts;
    }
    if (roll < 0.65) { // ~12% back lounge / conversation pit
        const spot = simPick(["back_lounge_N", "back_lounge_S", "pit_N", "pit_S", "pit_E", "pit_W"]);
        const acts = walkChain(0, [spot]);
        acts.push(A("SIT", { floor: 0, wpName: spot }));
        acts.push(A("ENTER_STATE", { state: "VISITING" }));
        acts.push(A("WAIT_SIM", { minutes: simRandInt(8, 20) }));
        acts.push.apply(acts, standFrom(0));
        return acts;
    }
    if (roll < 0.75) { // ~10% reception / kiosk / water cooler (stand briefly)
        const spot = simPick(L.standSpots);
        const acts = walkChain(0, [spot]);
        acts.push(A("SIT", { floor: 0, wpName: spot }));
        acts.push(A("WAIT_SIM", { minutes: simRandInt(3, 8) }));
        acts.push.apply(acts, standFrom(0));
        return acts;
    }
    if (roll < 0.85) { // ~10% lobby loiter
        return visitorLobbyLoiter(agent);
    }
    // ~15% ride up to an office-floor lounge.
    const f = simRandInt(1, 5);
    const spot = simPick(simWorld.floors[f].loungeSpots);
    const acts = [];
    acts.push.apply(acts, elevatorRide(0, f));
    acts.push.apply(acts, walkChain(f, ["lounge_center", spot]));
    acts.push(A("SIT", { floor: f, wpName: spot }));
    acts.push(A("ENTER_STATE", { state: "VISITING" }));
    acts.push(A("WAIT_SIM", { minutes: simRandInt(6, 15) }));
    acts.push.apply(acts, standFrom(f));
    acts.push.apply(acts, walkChain(f, ["elevWait"]));
    acts.push.apply(acts, elevatorRide(f, 0));
    return acts;
}

function visitorLobbyLoiter(agent) {
    const spot = simPick(simWorld.floors[0].standSpots);
    const acts = walkChain(0, [spot]);
    acts.push(A("SIT", { floor: 0, wpName: spot }));
    acts.push(A("WAIT_SIM", { minutes: simRandInt(6, 16) }));
    acts.push.apply(acts, standFrom(0));
    return acts;
}

// ---- Decision rules ------------------------------------------------------------------

function chooseNextActivity(agent) {
    const now = simClock.simMinute;
    // 1) Past departure -> leave.
    if (agent.role === "WORKER" && now >= agent.departureTime) {
        pushPlan(agent, leaveBuilding(agent));
        return;
    }
    // 2) A planned meeting whose time has arrived.
    for (let i = agent.plannedMeetingTimes.length - 1; i >= 0; i--) {
        if (agent.plannedMeetingTimes[i] <= now) {
            const m = agent.plannedMeetingTimes.splice(i, 1)[0];
            pushPlan(agent, attendMeeting(agent));
            return;
        }
    }
    // 3) Past lunch window and not lunched.
    if (agent.role === "WORKER" && now >= agent.lunchTime && !agent.hasLunched) {
        pushPlan(agent, goToLunch(agent));
        return;
    }
    // 4) Weighted die.
    const r = Math.random();
    if (r < 0.14) {
        pushPlan(agent, attendMeeting(agent));
    } else if (r < 0.26) {
        pushPlan(agent, visitLounge(agent));
    } else if (r < 0.41) {
        pushPlan(agent, visitCoworker(agent));
    } else {
        // Keep working a while, then decide again.
        const acts = [A("WAIT_SIM", { minutes: simRandInt(18, 65) }), A("PICK_NEXT_ACTIVITY")];
        pushPlan(agent, acts);
    }
}

function pushPlan(agent, acts) {
    for (let i = 0; i < acts.length; i++) agent.plan.push(acts[i]);
}

// ---- Per-frame agent processing ------------------------------------------------------

function processAgent(agent, motionDt) {
    if (agent.state === "DISABLED") return;
    const now = simClock.simMinute;
    if (agent.state === "AWAY") {
        if (now >= agent.arrivalTime) {
            spawnAgent(agent);
        }
        return;
    }
    if (agent.state === "GONE") return;

    // Worker end-of-day override (only if still working and not already leaving).
    if (agent.role === "WORKER" && agent.state === "AT_DESK" && now >= agent.departureTime && !agent._leaving) {
        agent._leaving = true;
        agent.plan = leaveBuilding(agent);
        agent.planIndex = 0;
    }

    // Action dispatch loop (multiple zero-duration hand-offs per frame).
    for (let it = 0; it < 16; it++) {
        if (agent.planIndex >= agent.plan.length) {
            onPlanComplete(agent);
            return;
        }
        const next = agent.plan[agent.planIndex];
        startAction(agent, next);
        agent.planIndex++;
        const done = handleAction(agent, motionDt);
        if (!done) return;
        if (agent.state === "GONE") return;
    }
}

function spawnAgent(agent) {
    // Spawn on the sidewalk with a small jitter so co-arrivals do not pile up.
    const jitterX = (Math.random() - 0.5) * 2.2;
    const jitterZ = (Math.random() - 0.5) * 1.5;
    agent.group.position.set(jitterX, 0, 12 + jitterZ);
    agent.group.rotation.y = Math.PI; // face the building (-Z)
    agent.group.visible = true;
    agent.group.userData.isWalking = true;
    agent.group.userData.isSitting = false;
    agent.inCar = false;
    agent.nearWp = "outside";
    agent.floor = 0;
    agent.state = "ARRIVING";
    if (agent.role === "WORKER") {
        agent.plan = arriveToDesk(agent);
    } else {
        agent.plan = visitorVisit(agent);
    }
    agent.planIndex = 0;
}

function onPlanComplete(agent) {
    if (agent.role === "WORKER") {
        // Workers always loop back into a decision (plans end with PICK_NEXT_ACTIVITY);
        // if somehow empty, keep them at the desk.
        agent.state = "AT_DESK";
    } else {
        agent.state = "GONE";
        if (agent.group.parent) agent.group.parent.remove(agent.group);
        agent.group.visible = false;
    }
    agent.plan = [];
    agent.planIndex = 0;
}

// ---- Collisions ----------------------------------------------------------------------

function applyCollisions() {
    const n = agentsPool.length;
    for (let i = 0; i < n; i++) {
        const a = agentsPool[i];
        if (a.state === "DISABLED" || a.state === "GONE" || !a.group.visible) continue;
        if (a.group.userData.isSitting) continue;
        if (a.inCar) continue; // car interior spots are pre-assigned
        if (a.currentAction && a.currentAction.type === "ENTER_ELEVATOR") continue; // boarders push through
        for (let j = i + 1; j < n; j++) {
            const b = agentsPool[j];
            if (b.state === "DISABLED" || b.state === "GONE" || !b.group.visible) continue;
            if (b.group.userData.isSitting) continue;
            if (b.inCar) continue;
            if (a.group.parent !== b.group.parent) continue;
            const pa = a.group.position, pb = b.group.position;
            const dy = Math.abs(pa.y - pb.y);
            if (dy > 1.0) continue;
            const dx = pb.x - pa.x, dz = pb.z - pa.z;
            let dist = Math.sqrt(dx * dx + dz * dz);
            if (dist > SIM_CONFIG.COLLIDE_DIST) continue;
            let ux, uz;
            if (dist < 0.001) {
                const ang = Math.random() * Math.PI * 2;
                ux = Math.cos(ang); uz = Math.sin(ang);
            } else {
                ux = dx / dist; uz = dz / dist;
            }
            const push = SIM_CONFIG.COLLIDE_PUSH * (1 - dist / SIM_CONFIG.COLLIDE_DIST);
            pa.x -= ux * push; pa.z -= uz * push;
            pb.x += ux * push; pb.z += uz * push;
        }
    }
}

// ---- HUD / UI ------------------------------------------------------------------------

function buildHUD() {
    const hud = document.getElementById("hud");
    hud.innerHTML = "";
    const timeDiv = document.createElement("div");
    timeDiv.className = "t";
    timeDiv.textContent = simClock.format();
    hud.appendChild(timeDiv);
    hudTimeEl = timeDiv;

    // Speed slider (log-spaced stops).
    const slDiv = document.createElement("div");
    slDiv.className = "sl";
    const slLabel = document.createElement("label");
    slLabel.textContent = "Speed: " + simClock.timeScale + "x";
    slDiv.appendChild(slLabel);
    speedSlider = document.createElement("input");
    speedSlider.type = "range";
    speedSlider.min = "0";
    speedSlider.max = String(SIM_CONFIG.SPEED_STOPS.length - 1);
    speedSlider.step = "1";
    // Default 120x -> find its index.
    let defaultIdx = 0;
    for (let i = 0; i < SIM_CONFIG.SPEED_STOPS.length; i++) if (SIM_CONFIG.SPEED_STOPS[i] === 120) defaultIdx = i;
    speedSlider.value = String(defaultIdx);
    speedSlider.addEventListener("input", (event) => {
        const idx = parseInt(event.target.value, 10);
        simClock.timeScale = SIM_CONFIG.SPEED_STOPS[idx];
        slLabel.textContent = "Speed: " + simClock.timeScale + "x";
    });
    slDiv.appendChild(speedSlider);
    hud.appendChild(slDiv);

    // Occupancy slider.
    const ocDiv = document.createElement("div");
    ocDiv.className = "sl";
    const ocLabel = document.createElement("label");
    ocLabel.textContent = "Occupancy: " + targetOccupancy + " / " + SIM_CONFIG.MAX_OCCUPANCY + " people";
    ocDiv.appendChild(ocLabel);
    occupancySlider = document.createElement("input");
    occupancySlider.type = "range";
    occupancySlider.min = "1";
    occupancySlider.max = String(SIM_CONFIG.MAX_OCCUPANCY);
    occupancySlider.step = "1";
    occupancySlider.value = String(targetOccupancy);
    occupancySlider.addEventListener("input", (event) => {
        targetOccupancy = parseInt(event.target.value, 10);
        ocLabel.textContent = "Occupancy: " + targetOccupancy + " / " + SIM_CONFIG.MAX_OCCUPANCY + " people";
        applyOccupancy();
    });
    ocDiv.appendChild(occupancySlider);
    hud.appendChild(ocDiv);

    const eg = document.createElement("div");
    eg.className = "eg";
    eg.textContent = "elevator state";
    hud.appendChild(eg);
    simAgentsEl = document.createElement("div");
    simAgentsEl.className = "sc";
    hud.appendChild(simAgentsEl);
}

function updateHUD() {
    if (hudTimeEl) hudTimeEl.textContent = simClock.format();
    if (!simAgentsEl) return;
    // State breakdown.
    const counts = {};
    for (let i = 0; i < agentsPool.length; i++) {
        const s = agentsPool[i].state;
        counts[s] = (counts[s] || 0) + 1;
    }
    let lines = [];
    lines.push("present: " + presentCount() + "/" + targetOccupancy);
    const order = ["ARRIVING", "WAITING_ELEVATOR", "IN_CAR", "ON_FLOOR", "AT_DESK", "IN_MEETING", "AT_BREAK", "AT_LUNCH", "VISITING", "LEAVING"];
    for (let i = 0; i < order.length; i++) {
        const s = order[i];
        if (counts[s]) lines.push(s + " " + counts[s]);
    }
    const dir = simElevator.direction > 0 ? "^" : (simElevator.direction < 0 ? "v" : "-");
    lines.push("elevator: F" + simElevator.currentFloor + " " + dir + " " + simElevator.state);
    lines.push("riders " + simElevator.passengers.size + " dest " + Array.from(simElevator.destinations).sort().join(","));
    lines.push("up " + Array.from(simElevator.upCalls).sort().join(",") + "  down " + Array.from(simElevator.downCalls).sort().join(","));
    simAgentsEl.innerHTML = lines.join("<br>");
}

// ---- Render loop + startup ------------------------------------------------------------

function startSimulation() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x20242a);
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(28, 24, 28);
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.sortObjects = true;
    document.body.appendChild(renderer.domElement);
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    scene.add(new THREE.AmbientLight(0xffffff, 0.45));
    scene.add(new THREE.HemisphereLight(0xbfd7ff, 0x303020, 0.45));
    sun = new THREE.DirectionalLight(0xffffff, 0.9);
    sun.position.set(20, 35, 18);
    scene.add(sun);

    simWorld = createWorld(scene);
    simElevator = new Elevator(scene, simWorld);
    simClock = createSimClock();
    seatReservations = new Set();

    // Build the full agent pool (roles + desks stay stable across the day).
    agentsPool = [];
    nameCounter = 0;
    for (let i = 0; i < SIM_CONFIG.MAX_WORKERS; i++) agentsPool.push(makeAgent(i, "WORKER"));
    for (let i = 0; i < SIM_CONFIG.MAX_VISITORS; i++) agentsPool.push(makeAgent(SIM_CONFIG.MAX_WORKERS + i, "VISITOR"));
    assignDesks();

    // Initial occupancy + schedules.
    applyOccupancy();
    for (let i = 0; i < agentsPool.length; i++) {
        const a = agentsPool[i];
        if (a.id < targetOccupancy) { resampleSchedule(a); a.state = "AWAY"; }
    }

    buildHUD();
    updateLighting(simClock.simMinute / 60);

    function animate() {
        requestAnimationFrame(animate);
        const realDt = Math.min(0.05, simClock.realClock.getDelta());
        simClock.tick(realDt);
        updateLighting(simClock.simMinute / 60);
        const motionDt = realDt * simClock.timeScale;
        simElevator.tick(motionDt);
        topUpVisitors();
        for (let i = 0; i < agentsPool.length; i++) {
            processAgent(agentsPool[i], motionDt);
        }
        applyCollisions();
        for (let i = 0; i < agentsPool.length; i++) {
            const a = agentsPool[i];
            if (a.group.visible) {
                a.group.userData.isWalking = !!(a.currentAction && (a.currentAction.type === "WALK_TO_WP" || a.currentAction.type === "ENTER_ELEVATOR"));
                animatePersonWalking(a.group, motionDt);
            }
        }
        controls.update();
        renderer.render(scene, camera);
        updateHUD();
    }
    animate();
}

window.startSimulation = startSimulation;
window.addEventListener("resize", () => {
    if (!camera || !renderer) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", startSimulation);
} else {
    startSimulation();
}
