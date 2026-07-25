// sim.js - simulated clock, day/night lighting, agent state machine + schedules, render loop, UI

/* global THREE, WORLD, createWorld, createPerson, animatePersonWalking, Elevator, bfsPath */

let scene, camera, renderer, controls, world, elevator;
let sunLight, ambLight, hemiLight;
let agents = [];
let seatReservations = new Set();
let targetOccupancy = 45;
let threeClock = null;
let hudEls = {};
let hudTimer = 0;

const MAX_WORKERS = 20;
const MAX_VISITORS = 80;
const MAX_OCCUPANCY = MAX_WORKERS + MAX_VISITORS;
const WALK_SPEED = 1.3;
const SIT_DROP = 0.35;

const AGENT_NAMES = ["Ava", "Ben", "Cara", "Dev", "Ella", "Finn", "Gia", "Hugo", "Iris", "Jack",
    "Kara", "Liam", "Mia", "Noah", "Opal", "Pete", "Quin", "Rosa", "Sam", "Tara",
    "Uma", "Vic", "Wes", "Xena", "Yuri", "Zoe", "Ari", "Bea", "Cole", "Dana"];

const SimClock = {
    simMinute: 7 * 60 + 30,
    timeScale: 120,
    day: 0,
    tick: function(realDt) {
        this.simMinute += realDt * this.timeScale / 60;
        if (this.simMinute >= 24 * 60) {
            this.simMinute -= 24 * 60;
            this.day++;
            resetForNewDay();
        }
    },
    format: function() {
        let h = Math.floor(this.simMinute / 60);
        const m = Math.floor(this.simMinute % 60);
        const ap = h >= 12 ? "PM" : "AM";
        let h12 = h % 12;
        if (h12 === 0) { h12 = 12; }
        return (h12 < 10 ? " " : "") + h12 + ":" + (m < 10 ? "0" : "") + m + " " + ap;
    }
};
window.SimClock = SimClock;

// ---------- helpers ----------

function randRange(a, b) { return a + Math.random() * (b - a); }
function randInt(a, b) { return Math.floor(randRange(a, b + 1)); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function floorY(f) { return f * WORLD.FLOOR_HEIGHT; }

function nearestNodeName(floorObj, pos) {
    let best = null, bestD = Infinity;
    const nodes = floorObj.nodes;
    for (const name in nodes) {
        const d = pos.distanceToSquared(nodes[name].pos);
        if (d < bestD) { bestD = d; best = name; }
    }
    return best;
}

function seatKey(floor, wpName) { return floor + ":" + wpName; }

function reserveSeat(agent, floor, wpName) {
    const key = seatKey(floor, wpName);
    if (seatReservations.has(key)) { return false; }
    seatReservations.add(key);
    agent.reservedSeats.push(key);
    return true;
}

function releaseAgentSeats(agent) {
    for (let i = 0; i < agent.reservedSeats.length; i++) {
        seatReservations.delete(agent.reservedSeats[i]);
    }
    agent.reservedSeats.length = 0;
}

// ---------- schedules ----------

function rollWorkerSchedule(agent) {
    agent.arrivalTime = randRange(8 * 60 + 15, 9 * 60 + 30);
    agent.lunchTime = randRange(11 * 60 + 30, 13 * 60 + 30);
    agent.lunchDuration = randRange(25, 60);
    agent.departureTime = (Math.random() < 0.15)
        ? randRange(18 * 60 + 30, 19 * 60 + 45)
        : randRange(16 * 60 + 45, 18 * 60 + 30);
    agent.hasLunched = false;
    agent.plannedMeetingTimes = [];
    if (Math.random() < 0.5) { agent.plannedMeetingTimes.push(randRange(9 * 60 + 45, 11 * 60 + 15)); }
    if (Math.random() < 0.5) { agent.plannedMeetingTimes.push(randRange(13 * 60 + 45, 16 * 60)); }
}

function rollVisitorSchedule(agent, arrivalBase) {
    const base = (arrivalBase !== undefined) ? arrivalBase : randRange(8 * 60, 16 * 60 + 30);
    agent.arrivalTime = base;
    agent.visitDuration = randRange(15, 70);
    agent.departureTime = 18 * 60;
    agent.hasLunched = true;
    agent.plannedMeetingTimes = [];
}

// ---------- agent pool ----------

function buildAgents() {
    const allDesks = [];
    for (let f = 1; f < world.floors.length; f++) {
        const dl = world.floors[f].desks;
        for (let d = 0; d < dl.length; d++) { allDesks.push(dl[d]); }
    }
    for (let i = 0; i < MAX_OCCUPANCY; i++) {
        const isWorker = i < MAX_WORKERS;
        const group = createPerson({});
        const agent = {
            id: i,
            name: pick(AGENT_NAMES) + "-" + i,
            role: isWorker ? "WORKER" : "VISITOR",
            group: group,
            state: (i < targetOccupancy) ? "AWAY" : "DISABLED",
            floor: 0,
            plan: [],
            currentAction: null,
            reservedSeats: [],
            homeFloor: null, deskId: null, deskWpName: null, deskDoorWpName: null
        };
        if (isWorker) {
            const desk = allDesks[i];
            agent.homeFloor = desk.floor;
            agent.deskId = desk.id;
            agent.deskWpName = desk.wpName;
            agent.deskDoorWpName = desk.doorWpName;
            rollWorkerSchedule(agent);
        } else {
            rollVisitorSchedule(agent);
        }
        agents.push(agent);
    }
}

function despawnAgent(agent) {
    if (agent.group.parent) { agent.group.parent.remove(agent.group); }
    agent.group.userData.isWalking = false;
    agent.group.userData.isSitting = false;
    agent.plan = [];
    agent.currentAction = null;
    releaseAgentSeats(agent);
}

function resetForNewDay() {
    for (let i = 0; i < agents.length; i++) {
        const agent = agents[i];
        despawnAgent(agent);
        agent.state = (agent.id < targetOccupancy) ? "AWAY" : "DISABLED";
        agent.floor = 0;
        if (agent.role === "WORKER") { rollWorkerSchedule(agent); }
        else { rollVisitorSchedule(agent); }
    }
    seatReservations.clear();
    elevator.reset();
}

// ---------- primitive actions ----------

function A(type, floor, wpName, extra) {
    const a = { type: type, floor: floor, wpName: wpName };
    if (extra) { for (const k in extra) { a[k] = extra[k]; } }
    return a;
}

function elevatorRideActions(fromFloor, toFloor) {
    const dir = (toFloor > fromFloor) ? 1 : -1;
    return [
        A("WALK_TO_WP", fromFloor, "elevWait"),
        A("WAIT_AT_PANEL", fromFloor, null, { dir: dir, toFloor: toFloor }),
        A("ENTER_ELEVATOR", fromFloor, null, { toFloor: toFloor, dir: dir }),
        A("PRESS_FLOOR", toFloor, null, {}),
        A("WAIT_FOR_FLOOR", toFloor, null, {}),
        A("EXIT_ELEVATOR", toFloor, null, { toFloor: toFloor })
    ];
}

function travelActions(agent, fromFloor, toFloor, destWp) {
    const acts = [];
    if (fromFloor !== toFloor) {
        acts.push.apply(acts, elevatorRideActions(fromFloor, toFloor));
    }
    if (destWp) { acts.push(A("WALK_TO_WP", toFloor, destWp)); }
    return acts;
}

// ---- action start ----

function startAction(agent, action) {
    const g = agent.group;
    switch (action.type) {
        case "WALK_TO_WP": {
            const floorObj = world.floors[action.floor];
            const target = floorObj.nodes[action.wpName];
            if (!target) { action._done = true; break; }
            const startName = nearestNodeName(floorObj, g.position);
            const path = world.bfsPath(floorObj.nodes, startName, action.wpName);
            // Prepend current position if we're off-graph.
            if (path.length === 0 || g.position.distanceTo(path[0]) > 0.2) {
                path.unshift(g.position.clone().setY(floorY(action.floor)));
            }
            action._path = path;
            action._i = 1;
            action._stallT = 0;
            action._prevD = Infinity;
            g.userData.isWalking = true;
            g.userData.isSitting = false;
            break;
        }
        case "WAIT_AT_PANEL":
            g.userData.isWalking = false;
            break;
        case "ENTER_ELEVATOR":
            action._phase = "reserve";
            action._spot = null;
            action._stallT = 0;
            action._prevD = Infinity;
            break;
        case "PRESS_FLOOR":
            elevator.pressDestination(action.floor);
            action._done = true;
            break;
        case "WAIT_FOR_FLOOR":
            g.userData.isWalking = false;
            break;
        case "EXIT_ELEVATOR": {
            elevator.registerDisembark(agent);
            // Reparent car -> scene preserving world position.
            const wp = new THREE.Vector3();
            g.getWorldPosition(wp);
            scene.add(g);
            g.position.set(wp.x, floorY(action.toFloor), wp.z);
            const wait = world.floors[action.toFloor].nodes["elevWait"].pos;
            action._target = new THREE.Vector3(
                wait.x + randRange(-0.9, 0.9), floorY(action.toFloor), wait.z + randRange(0, 0.8));
            action._stallT = 0;
            action._prevD = Infinity;
            g.userData.isWalking = true;
            break;
        }
        case "SIT": {
            const floorObj = world.floors[action.floor];
            const target = floorObj.sitTargets[action.wpName];
            const node = floorObj.nodes[action.wpName];
            if (!node) { action._done = true; break; }
            const p = node.pos;
            if (target && target.sit) {
                g.position.set(p.x, p.y - SIT_DROP, p.z);
                g.rotation.y = target.facing;
                g.userData.isSitting = true;
            } else {
                // Standing waypoint: jitter in a ring so agents spread out.
                const ang = Math.random() * Math.PI * 2;
                const r = randRange(0.35, 0.75);
                g.position.set(p.x + Math.cos(ang) * r, p.y, p.z + Math.sin(ang) * r);
                g.rotation.y = (target ? target.facing : 0) + randRange(-0.4, 0.4);
                g.userData.isSitting = false;
            }
            g.userData.isWalking = false;
            action._done = true;
            break;
        }
        case "STAND":
            g.userData.isSitting = false;
            g.position.y = (g.parent === elevator.carGroup) ? 0 : floorY(agent.floor);
            action._done = true;
            break;
        case "RELEASE_SEAT":
            releaseAgentSeats(agent);
            action._done = true;
            break;
        case "WAIT_SIM":
            action._untilMin = SimClock.simMinute + action.minutes;
            agent.group.userData.isWalking = false;
            break;
        case "EXIT_BUILDING":
            despawnAgent(agent);
            agent.state = "GONE";
            action._done = true;
            break;
        case "ENTER_STATE":
            agent.state = action.state;
            action._done = true;
            break;
        case "MARK_LUNCHED":
            agent.hasLunched = true;
            action._done = true;
            break;
        case "PICK_NEXT_ACTIVITY":
            agent.plan = chooseNextActivity(agent);
            action._done = true;
            break;
        default:
            action._done = true;
    }
}

// ---- per-frame action update; returns true when finished ----

function updateAction(agent, action, dt) {
    if (action._done) { return true; }
    const g = agent.group;
    switch (action.type) {
        case "WALK_TO_WP": {
            const path = action._path;
            if (action._i >= path.length) { g.userData.isWalking = false; return true; }
            const tgt = path[action._i];
            const done = stepToward(g, tgt, dt);
            // Stall recovery: skip the waypoint if blocked.
            const d = g.position.distanceTo(tgt);
            if (action._prevD - d < 0.005) {
                action._stallT += dt;
                if (action._stallT > 1.2) {
                    action._i++;
                    action._stallT = 0;
                    action._prevD = Infinity;
                    if (action._i >= path.length) {
                        g.position.set(tgt.x, tgt.y, tgt.z);
                        g.userData.isWalking = false;
                        return true;
                    }
                    return false;
                }
            } else {
                action._stallT = 0;
            }
            action._prevD = d;
            if (done) {
                action._i++;
                action._prevD = Infinity;
                action._stallT = 0;
                if (action._i >= path.length) {
                    g.userData.isWalking = false;
                    return true;
                }
            }
            return false;
        }
        case "WAIT_AT_PANEL": {
            // Re-press the hall call every frame until accepted.
            if (action.dir > 0) { elevator.callUp(action.floor); }
            else { elevator.callDown(action.floor); }
            if (elevator.isAcceptingAt(action.floor, action.dir) &&
                elevator.currentCapacityFree() > 0) {
                return true;
            }
            return false;
        }
        case "ENTER_ELEVATOR": {
            const atFloorOpen = (elevator.currentFloor === action.floor) &&
                (elevator.state === "DOOR_OPEN" || elevator.state === "DOOR_OPENING");
            if (action._phase === "reserve") {
                if (!atFloorOpen || !elevator.isAcceptingAt(action.floor, action.dir)) {
                    // Car slipped away: re-press and keep waiting.
                    if (action.dir > 0) { elevator.callUp(action.floor); }
                    else { elevator.callDown(action.floor); }
                    return false;
                }
                const spot = elevator.reserveBoardingSpot(agent);
                if (!spot) {
                    if (action.dir > 0) { elevator.callUp(action.floor); }
                    else { elevator.callDown(action.floor); }
                    return false;
                }
                action._spot = spot;
                action._phase = "toDoor";
                action._target = elevator.doorThresholdWorld(spot.x);
                action._target.y = floorY(action.floor);
                action._stallT = 0;
                action._prevD = Infinity;
                g.userData.isWalking = true;
                return false;
            }
            if (action._phase === "toDoor") {
                if (g.parent !== elevator.carGroup &&
                    !(elevator.currentFloor === action.floor &&
                      (elevator.state === "DOOR_OPEN" || elevator.state === "DOOR_OPENING"))) {
                    // Doors closed before we got there: abort and retry.
                    elevator.cancelBoard(agent);
                    action._spot = null;
                    action._phase = "reserve";
                    return false;
                }
                const arrived = stepToward(g, action._target, dt);
                const d = g.position.distanceTo(action._target);
                if (action._prevD - d < 0.005) {
                    action._stallT += dt;
                    if (action._stallT > 1.5) {
                        g.position.copy(action._target);
                        action._stallT = 0;
                    }
                } else { action._stallT = 0; }
                action._prevD = d;
                if (arrived || g.position.distanceTo(action._target) < 0.1) {
                    // Reparent scene -> car; continue in car-local space.
                    const wx = g.position.x, wz = g.position.z;
                    elevator.carGroup.add(g);
                    g.position.set(wx, 0, wz);
                    action._phase = "toSpot";
                    action._local = new THREE.Vector3(action._spot.x, 0, action._spot.z);
                    action._stallT = 0;
                    action._prevD = Infinity;
                }
                return false;
            }
            if (action._phase === "toSpot") {
                const arrived = stepToward(g, action._local, dt);
                const d = g.position.distanceTo(action._local);
                if (action._prevD - d < 0.005) {
                    action._stallT += dt;
                    if (action._stallT > 1.5) {
                        g.position.copy(action._local);
                        action._stallT = 0;
                    }
                } else { action._stallT = 0; }
                action._prevD = d;
                if (arrived || g.position.distanceTo(action._local) < 0.08) {
                    g.position.copy(action._local);
                    elevator.completeBoard(agent);
                    g.rotation.y = 0; // face the doors
                    g.userData.isWalking = false;
                    return true;
                }
                return false;
            }
            return false;
        }
        case "WAIT_FOR_FLOOR":
            return (elevator.state === "DOOR_OPEN" && elevator.currentFloor === action.floor);
        case "EXIT_ELEVATOR": {
            const arrived = stepToward(g, action._target, dt);
            const d = g.position.distanceTo(action._target);
            if (action._prevD - d < 0.005) {
                action._stallT += dt;
                if (action._stallT > 1.5) {
                    g.position.copy(action._target);
                    action._stallT = 0;
                }
            } else { action._stallT = 0; }
            action._prevD = d;
            if (arrived || g.position.distanceTo(action._target) < 0.1) {
                elevator.completeDisembark(agent);
                agent.floor = action.toFloor;
                g.userData.isWalking = false;
                return true;
            }
            return false;
        }
        case "WAIT_SIM":
            return SimClock.simMinute >= action._untilMin;
        default:
            return true;
    }
}

function stepToward(g, target, dt) {
    const dx = target.x - g.position.x;
    const dy = target.y - g.position.y;
    const dz = target.z - g.position.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const step = WALK_SPEED * dt;
    if (dist <= step || dist < 0.02) {
        g.position.set(target.x, target.y, target.z);
        return true;
    }
    g.position.x += dx / dist * step;
    g.position.y += dy / dist * step;
    g.position.z += dz / dist * step;
    if (Math.abs(dx) > 0.0001 || Math.abs(dz) > 0.0001) {
        g.rotation.y = Math.atan2(dx, dz);
    }
    return false;
}

// ---------- plan compilers ----------

function planArriveToDesk(agent) {
    const acts = [A("ENTER_STATE", null, null, { state: "ARRIVING" }),
        A("WALK_TO_WP", 0, "front_door_threshold"),
        A("WALK_TO_WP", 0, "entrance"),
        A("WALK_TO_WP", 0, "lobby_center"),
        A("ENTER_STATE", null, null, { state: "WAITING_ELEVATOR" })];
    acts.push.apply(acts, elevatorRideActions(0, agent.homeFloor));
    acts.push(A("ENTER_STATE", null, null, { state: "ON_FLOOR" }));
    acts.push(A("WALK_TO_WP", agent.homeFloor, agent.deskDoorWpName));
    acts.push(A("WALK_TO_WP", agent.homeFloor, agent.deskWpName));
    acts.push(A("SIT", agent.homeFloor, agent.deskWpName));
    acts.push(A("ENTER_STATE", null, null, { state: "AT_DESK" }));
    acts.push(A("WAIT_SIM", null, null, { minutes: randRange(18, 65) }));
    acts.push(A("PICK_NEXT_ACTIVITY", null, null, {}));
    return acts;
}

function lunchSeatChoice(agent) {
    const lobby = world.floors[0];
    const options = ["bistro0a", "bistro0b", "bistro1a", "bistro1b",
        "bistro2a", "bistro2b", "bistro3a", "bistro3b"];
    for (let i = options.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const t = options[i]; options[i] = options[j]; options[j] = t;
    }
    for (let i = 0; i < options.length; i++) {
        if (reserveSeat(agent, 0, options[i])) { return options[i]; }
    }
    const fallback = ["flounge_chair0", "flounge_chair1", "flounge_couch0", "flounge_couch1"];
    for (let i = 0; i < fallback.length; i++) {
        if (reserveSeat(agent, 0, fallback[i])) { return fallback[i]; }
    }
    return "lobby_stand_center";
}

function planGoToLunch(agent) {
    const seat = lunchSeatChoice(agent);
    const acts = [A("STAND", null, null, {}),
        A("ENTER_STATE", null, null, { state: "AT_LUNCH" }),
        A("WALK_TO_WP", agent.homeFloor, agent.deskDoorWpName)];
    acts.push.apply(acts, elevatorRideActions(agent.homeFloor, 0));
    acts.push(A("WALK_TO_WP", 0, seat));
    acts.push(A("SIT", 0, seat));
    acts.push(A("WAIT_SIM", null, null, { minutes: agent.lunchDuration }));
    acts.push(A("MARK_LUNCHED", null, null, {}));
    acts.push(A("STAND", null, null, {}));
    acts.push(A("RELEASE_SEAT", null, null, {}));
    acts.push.apply(acts, elevatorRideActions(0, agent.homeFloor));
    acts.push(A("WALK_TO_WP", agent.homeFloor, agent.deskDoorWpName));
    acts.push(A("WALK_TO_WP", agent.homeFloor, agent.deskWpName));
    acts.push(A("SIT", agent.homeFloor, agent.deskWpName));
    acts.push(A("ENTER_STATE", null, null, { state: "AT_DESK" }));
    acts.push(A("WAIT_SIM", null, null, { minutes: randRange(18, 65) }));
    acts.push(A("PICK_NEXT_ACTIVITY", null, null, {}));
    return acts;
}

function planVisitLounge(agent) {
    const f = agent.homeFloor;
    const spot = pick(["lounge_spot0", "lounge_spot1", "lounge_spot2", "water_cooler"]);
    const useSpot = reserveSeat(agent, f, spot) ? spot : "water_cooler";
    const acts = [A("STAND", null, null, {}),
        A("ENTER_STATE", null, null, { state: "AT_BREAK" }),
        A("WALK_TO_WP", f, agent.deskDoorWpName),
        A("WALK_TO_WP", f, useSpot),
        A("SIT", f, useSpot),
        A("WAIT_SIM", null, null, { minutes: randRange(5, 12) }),
        A("STAND", null, null, {}),
        A("RELEASE_SEAT", null, null, {}),
        A("WALK_TO_WP", f, agent.deskDoorWpName),
        A("WALK_TO_WP", f, agent.deskWpName),
        A("SIT", f, agent.deskWpName),
        A("ENTER_STATE", null, null, { state: "AT_DESK" }),
        A("WAIT_SIM", null, null, { minutes: randRange(18, 65) }),
        A("PICK_NEXT_ACTIVITY", null, null, {})];
    return acts;
}

function reserveConfSeat(agent, floor) {
    const options = ["conf_seat0", "conf_seat1", "conf_seat2", "conf_seat3"];
    for (let i = options.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const t = options[i]; options[i] = options[j]; options[j] = t;
    }
    for (let i = 0; i < options.length; i++) {
        if (reserveSeat(agent, floor, options[i])) { return options[i]; }
    }
    return null;
}

function planAttendMeeting(agent) {
    const f = (Math.random() < 0.65) ? agent.homeFloor : randInt(1, 5);
    const seat = reserveConfSeat(agent, f);
    if (!seat) { return planVisitLounge(agent); }
    const acts = [A("STAND", null, null, {}),
        A("ENTER_STATE", null, null, { state: "IN_MEETING" }),
        A("WALK_TO_WP", agent.homeFloor, agent.deskDoorWpName)];
    acts.push.apply(acts, travelActions(agent, agent.homeFloor, f, "conf_door"));
    acts.push(A("WALK_TO_WP", f, seat));
    acts.push(A("SIT", f, seat));
    acts.push(A("WAIT_SIM", null, null, { minutes: randRange(22, 45) }));
    acts.push(A("STAND", null, null, {}));
    acts.push(A("RELEASE_SEAT", null, null, {}));
    acts.push.apply(acts, travelActions(agent, f, agent.homeFloor, agent.deskDoorWpName));
    acts.push(A("WALK_TO_WP", agent.homeFloor, agent.deskWpName));
    acts.push(A("SIT", agent.homeFloor, agent.deskWpName));
    acts.push(A("ENTER_STATE", null, null, { state: "AT_DESK" }));
    acts.push(A("WAIT_SIM", null, null, { minutes: randRange(18, 65) }));
    acts.push(A("PICK_NEXT_ACTIVITY", null, null, {}));
    return acts;
}

function planVisitCoworker(agent) {
    const candidates = agents.filter(function(other) {
        return other !== agent && other.state === "AT_DESK" && other.role === "WORKER";
    });
    if (candidates.length === 0) { return planVisitLounge(agent); }
    const buddy = pick(candidates);
    const acts = [A("STAND", null, null, {}),
        A("ENTER_STATE", null, null, { state: "ON_FLOOR" }),
        A("WALK_TO_WP", agent.homeFloor, agent.deskDoorWpName)];
    acts.push.apply(acts, travelActions(agent, agent.homeFloor, buddy.homeFloor, buddy.deskDoorWpName));
    acts.push(A("SIT", buddy.homeFloor, buddy.deskDoorWpName)); // standing wp: jittered stand
    acts.push(A("WAIT_SIM", null, null, { minutes: randRange(6, 18) }));
    acts.push.apply(acts, travelActions(agent, buddy.homeFloor, agent.homeFloor, agent.deskDoorWpName));
    acts.push(A("WALK_TO_WP", agent.homeFloor, agent.deskWpName));
    acts.push(A("SIT", agent.homeFloor, agent.deskWpName));
    acts.push(A("ENTER_STATE", null, null, { state: "AT_DESK" }));
    acts.push(A("WAIT_SIM", null, null, { minutes: randRange(18, 65) }));
    acts.push(A("PICK_NEXT_ACTIVITY", null, null, {}));
    return acts;
}

function exitBuildingActions() {
    return [
        A("WALK_TO_WP", 0, "lobby_center"),
        A("WALK_TO_WP", 0, "entrance"),
        A("WALK_TO_WP", 0, "front_door_threshold"),
        A("WALK_TO_WP", 0, "outside"),
        A("EXIT_BUILDING", null, null, {})
    ];
}

function planLeaveBuilding(agent) {
    const acts = [A("STAND", null, null, {}),
        A("RELEASE_SEAT", null, null, {}),
        A("ENTER_STATE", null, null, { state: "LEAVING" })];
    if (agent.floor !== 0) {
        acts.push(A("WALK_TO_WP", agent.floor, agent.deskDoorWpName || "hallS"));
        acts.push.apply(acts, elevatorRideActions(agent.floor, 0));
    }
    acts.push.apply(acts, exitBuildingActions());
    return acts;
}

function planVisitorVisit(agent) {
    const acts = [A("ENTER_STATE", null, null, { state: "ARRIVING" }),
        A("WALK_TO_WP", 0, "front_door_threshold"),
        A("WALK_TO_WP", 0, "entrance"),
        A("ENTER_STATE", null, null, { state: "VISITING" })];
    const dur = agent.visitDuration;
    const roll = Math.random();
    if (roll < 0.10) {
        const seat = lunchSeatChoice(agent);
        acts.push(A("WALK_TO_WP", 0, "lobby_center"));
        acts.push(A("WALK_TO_WP", 0, seat));
        acts.push(A("SIT", 0, seat));
        acts.push(A("WAIT_SIM", null, null, { minutes: Math.min(dur, randRange(8, 25)) }));
        acts.push(A("STAND", null, null, {}));
        acts.push(A("RELEASE_SEAT", null, null, {}));
    } else if (roll < 0.16) {
        acts.push(A("WALK_TO_WP", 0, "cafe_order"));
        acts.push(A("SIT", 0, "cafe_order"));
        acts.push(A("WAIT_SIM", null, null, { minutes: randRange(3, 8) }));
    } else if (roll < 0.30) {
        const seat = pick(["flounge_couch0", "flounge_couch1", "flounge_chair0", "flounge_chair1"]);
        const use = reserveSeat(agent, 0, seat) ? seat : "lobby_stand_center";
        acts.push(A("WALK_TO_WP", 0, use));
        acts.push(A("SIT", 0, use));
        acts.push(A("WAIT_SIM", null, null, { minutes: randRange(8, 25) }));
        acts.push(A("STAND", null, null, {}));
        acts.push(A("RELEASE_SEAT", null, null, {}));
    } else if (roll < 0.42) {
        const seat = pick(["back_lounge_N", "back_lounge_S", "pit_N", "pit_S", "pit_E", "pit_W"]);
        const use = reserveSeat(agent, 0, seat) ? seat : "lobby_stand_NE";
        acts.push(A("WALK_TO_WP", 0, use));
        acts.push(A("SIT", 0, use));
        acts.push(A("WAIT_SIM", null, null, { minutes: randRange(8, 25) }));
        acts.push(A("STAND", null, null, {}));
        acts.push(A("RELEASE_SEAT", null, null, {}));
    } else if (roll < 0.52) {
        const spot = pick(["reception", "kiosk", "lobby_wc_front", "lobby_wc_back"]);
        acts.push(A("WALK_TO_WP", 0, spot));
        acts.push(A("SIT", 0, spot));
        acts.push(A("WAIT_SIM", null, null, { minutes: randRange(3, 10) }));
    } else if (roll < 0.62) {
        const spot = pick(["lobby_stand_center", "lobby_stand_NE", "lobby_stand_NW",
            "lobby_stand_midE", "lobby_stand_midW", "lobby_stand_entry"]);
        acts.push(A("WALK_TO_WP", 0, spot));
        acts.push(A("SIT", 0, spot));
        acts.push(A("WAIT_SIM", null, null, { minutes: randRange(5, 20) }));
    } else if (roll < 0.77) {
        const f = randInt(1, 5);
        const spot = pick(["lounge_spot0", "lounge_spot1", "lounge_spot2",
            "water_cooler", "hall_stand_N", "hall_stand_S"]);
        const use = reserveSeat(agent, f, spot) ? spot : "hall_stand_S";
        acts.push(A("WALK_TO_WP", 0, "lobby_center"));
        acts.push.apply(acts, elevatorRideActions(0, f));
        acts.push(A("WALK_TO_WP", f, use));
        acts.push(A("SIT", f, use));
        acts.push(A("WAIT_SIM", null, null, { minutes: randRange(8, 25) }));
        acts.push(A("STAND", null, null, {}));
        acts.push(A("RELEASE_SEAT", null, null, {}));
        acts.push.apply(acts, elevatorRideActions(f, 0));
    } else {
        // Sit in on a meeting as an external attendee.
        const f = randInt(1, 5);
        const seat = reserveConfSeat(agent, f);
        if (seat) {
            acts.push(A("WALK_TO_WP", 0, "lobby_center"));
            acts.push.apply(acts, elevatorRideActions(0, f));
            acts.push(A("WALK_TO_WP", f, "conf_door"));
            acts.push(A("WALK_TO_WP", f, seat));
            acts.push(A("SIT", f, seat));
            acts.push(A("WAIT_SIM", null, null, { minutes: randRange(15, 40) }));
            acts.push(A("STAND", null, null, {}));
            acts.push(A("RELEASE_SEAT", null, null, {}));
            acts.push.apply(acts, elevatorRideActions(f, 0));
        } else {
            acts.push(A("WALK_TO_WP", 0, "lobby_stand_center"));
            acts.push(A("SIT", 0, "lobby_stand_center"));
            acts.push(A("WAIT_SIM", null, null, { minutes: randRange(5, 15) }));
        }
    }
    acts.push(A("ENTER_STATE", null, null, { state: "LEAVING" }));
    acts.push.apply(acts, exitBuildingActions());
    return acts;
}

// ---------- decision rules ----------

function chooseNextActivity(agent) {
    if (agent.role === "VISITOR") { return exitBuildingActions(); }
    if (SimClock.simMinute >= agent.departureTime) { return planLeaveBuilding(agent); }
    for (let i = 0; i < agent.plannedMeetingTimes.length; i++) {
        if (SimClock.simMinute >= agent.plannedMeetingTimes[i]) {
            agent.plannedMeetingTimes.splice(i, 1);
            return planAttendMeeting(agent);
        }
    }
    if (SimClock.simMinute >= agent.lunchTime && !agent.hasLunched) {
        return planGoToLunch(agent);
    }
    const roll = Math.random();
    if (roll < 0.14) { return planAttendMeeting(agent); }
    if (roll < 0.26) { return planVisitLounge(agent); }
    if (roll < 0.41) { return planVisitCoworker(agent); }
    return [A("WAIT_SIM", null, null, { minutes: randRange(18, 65) }),
        A("PICK_NEXT_ACTIVITY", null, null, {})];
}

// ---------- spawning / occupancy ----------

function spawnAgent(agent) {
    const g = agent.group;
    g.position.set(randRange(-1.1, 1.1), 0, 12 + randRange(-0.75, 0.75));
    g.rotation.y = Math.PI; // facing the building (-Z)
    scene.add(g);
    agent.floor = 0;
    agent.currentAction = null;
    agent.plan = (agent.role === "WORKER") ? planArriveToDesk(agent) : planVisitorVisit(agent);
}

function countPresent() {
    let n = 0;
    for (let i = 0; i < agents.length; i++) {
        const s = agents[i].state;
        if (s !== "AWAY" && s !== "GONE" && s !== "DISABLED") { n++; }
    }
    return n;
}

function topUpVisitors() {
    const now = SimClock.simMinute;
    if (now < 7 * 60 || now > 17 * 60 + 30) { return; }
    let incoming = 0;
    for (let i = 0; i < agents.length; i++) {
        const agent = agents[i];
        if (agent.state === "AWAY" && agent.arrivalTime <= now + 8) { incoming++; }
    }
    let deficit = targetOccupancy - countPresent() - incoming;
    if (deficit <= 0) { return; }
    for (let i = 0; i < agents.length && deficit > 0; i++) {
        const agent = agents[i];
        if (agent.role !== "VISITOR" || agent.id >= targetOccupancy) { continue; }
        if (agent.state === "GONE" ||
            (agent.state === "AWAY" && agent.arrivalTime > now + 8)) {
            rollVisitorSchedule(agent, now + randRange(0, 6));
            agent.state = "AWAY";
            deficit--;
        }
    }
}

function applyOccupancy() {
    for (let i = 0; i < agents.length; i++) {
        const agent = agents[i];
        if (agent.id < targetOccupancy) {
            if (agent.state === "DISABLED") {
                agent.state = "AWAY";
                if (agent.role === "WORKER") {
                    if (SimClock.simMinute > agent.arrivalTime) {
                        agent.arrivalTime = SimClock.simMinute + randRange(1, 10);
                    }
                } else {
                    rollVisitorSchedule(agent, SimClock.simMinute + randRange(0, 6));
                }
            }
        } else {
            if (agent.state === "AWAY" || agent.state === "GONE") {
                agent.state = "DISABLED";
            }
        }
    }
}

// ---------- per-frame agent processing ----------

function processAgent(agent, dt) {
    if (agent.state === "DISABLED" || agent.state === "GONE") { return; }
    const now = SimClock.simMinute;

    if (agent.state === "AWAY") {
        const cutoff = (agent.role === "WORKER") ? agent.departureTime : 17 * 60 + 45;
        if (now >= agent.arrivalTime && now < cutoff) { spawnAgent(agent); }
        else { return; }
    }

    // End-of-day override for workers idling at their desk.
    if (agent.role === "WORKER" && agent.state === "AT_DESK" &&
        now >= agent.departureTime &&
        agent.currentAction && agent.currentAction.type === "WAIT_SIM") {
        agent.currentAction = null;
        agent.plan = planLeaveBuilding(agent);
    }

    // Dispatch loop: zero-duration actions hand off within the same frame.
    let guard = 0;
    while (guard < 16) {
        guard++;
        if (!agent.currentAction) {
            if (agent.plan.length === 0) {
                if (agent.state !== "GONE") {
                    agent.plan = (agent.role === "WORKER")
                        ? chooseNextActivity(agent) : exitBuildingActions();
                } else { break; }
            }
            agent.currentAction = agent.plan.shift();
            if (!agent.currentAction) { break; }
            startAction(agent, agent.currentAction);
            // EXIT_BUILDING despawns the agent and clears currentAction.
            if (!agent.currentAction) { break; }
        }
        const done = updateAction(agent, agent.currentAction, dt);
        if (done) {
            agent.currentAction = null;
            if (agent.state === "GONE") { break; }
        } else {
            break;
        }
    }
}

// ---------- collisions ----------

function applyCollisions() {
    const present = [];
    for (let i = 0; i < agents.length; i++) {
        const agent = agents[i];
        if (agent.state === "DISABLED" || agent.state === "GONE" || agent.state === "AWAY") { continue; }
        const g = agent.group;
        if (!g.parent || g.parent === elevator.carGroup) { continue; }
        if (g.userData.isSitting) { continue; }
        if (agent.currentAction && agent.currentAction.type === "ENTER_ELEVATOR") { continue; }
        // Entrance-chain exemption: don't let door crowds block arrivals/exits.
        if (agent.floor === 0 && g.position.z > 6.8) { continue; }
        present.push(agent);
    }
    for (let i = 0; i < present.length; i++) {
        for (let j = i + 1; j < present.length; j++) {
            const a = present[i].group.position;
            const b = present[j].group.position;
            if (Math.abs(a.y - b.y) > 1) { continue; }
            let dx = a.x - b.x;
            let dz = a.z - b.z;
            const d = Math.sqrt(dx * dx + dz * dz);
            if (d >= 0.7) { continue; }
            if (d < 0.001) {
                const ang = Math.random() * Math.PI * 2;
                dx = Math.cos(ang); dz = Math.sin(ang);
                const push = 0.18;
                a.x += dx * push; a.z += dz * push;
                b.x -= dx * push; b.z -= dz * push;
            } else {
                const push = 0.18 * (0.7 - d) / 0.7;
                dx /= d; dz /= d;
                a.x += dx * push; a.z += dz * push;
                b.x -= dx * push; b.z -= dz * push;
            }
        }
    }
}

// ---------- day / night lighting ----------

const DAY_KEYS = [
    { h: 0.0, bg: 0x0a0e1a, sunC: 0x334466, sunI: 0.05, amb: 0.45, hemi: 0.32 },
    { h: 5.5, bg: 0x0a0e1a, sunC: 0x334466, sunI: 0.05, amb: 0.45, hemi: 0.32 },
    { h: 6.0, bg: 0x8a5a4a, sunC: 0xffaa66, sunI: 0.45, amb: 0.50, hemi: 0.35 },
    { h: 6.5, bg: 0x87b8e8, sunC: 0xfff2dd, sunI: 0.95, amb: 0.60, hemi: 0.45 },
    { h: 17.5, bg: 0x87b8e8, sunC: 0xfff2dd, sunI: 0.95, amb: 0.60, hemi: 0.45 },
    { h: 18.0, bg: 0xb06a4a, sunC: 0xff9955, sunI: 0.40, amb: 0.50, hemi: 0.35 },
    { h: 18.5, bg: 0x141a2e, sunC: 0x445577, sunI: 0.08, amb: 0.45, hemi: 0.32 },
    { h: 22.0, bg: 0x0a0e1a, sunC: 0x334466, sunI: 0.05, amb: 0.45, hemi: 0.32 },
    { h: 24.0, bg: 0x0a0e1a, sunC: 0x334466, sunI: 0.05, amb: 0.45, hemi: 0.32 }
];

function updateDayNight() {
    const h = SimClock.simMinute / 60;
    let k0 = DAY_KEYS[0], k1 = DAY_KEYS[DAY_KEYS.length - 1];
    for (let i = 0; i < DAY_KEYS.length - 1; i++) {
        if (h >= DAY_KEYS[i].h && h <= DAY_KEYS[i + 1].h) {
            k0 = DAY_KEYS[i]; k1 = DAY_KEYS[i + 1];
            break;
        }
    }
    const span = Math.max(0.000001, k1.h - k0.h);
    const t = Math.min(1, Math.max(0, (h - k0.h) / span));
    const bg = new THREE.Color(k0.bg).lerp(new THREE.Color(k1.bg), t);
    scene.background = bg;
    sunLight.color.set(new THREE.Color(k0.sunC).lerp(new THREE.Color(k1.sunC), t));
    sunLight.intensity = k0.sunI + (k1.sunI - k0.sunI) * t;
    ambLight.intensity = k0.amb + (k1.amb - k0.amb) * t;
    hemiLight.intensity = k0.hemi + (k1.hemi - k0.hemi) * t;
}

// ---------- HUD ----------

function setupUI() {
    hudEls.clock = document.getElementById("hudClock");
    hudEls.stats = document.getElementById("hudStats");
    hudEls.speedLabel = document.getElementById("speedLabel");
    hudEls.occLabel = document.getElementById("occLabel");
    const speedSlider = document.getElementById("speedSlider");
    const occSlider = document.getElementById("occSlider");
    if (speedSlider) {
        speedSlider.addEventListener("input", function(event) {
            const v = Number(event.target.value);
            SimClock.timeScale = Math.round(Math.pow(600, v / 100));
            if (hudEls.speedLabel) { hudEls.speedLabel.textContent = SimClock.timeScale + "x"; }
        });
    }
    if (occSlider) {
        occSlider.addEventListener("input", function(event) {
            targetOccupancy = Number(event.target.value);
            if (hudEls.occLabel) {
                hudEls.occLabel.textContent = targetOccupancy + " / " + MAX_OCCUPANCY + " people";
            }
            applyOccupancy();
        });
    }
}

function setToText(s) {
    const arr = [];
    s.forEach(function(v) { arr.push(v); });
    arr.sort();
    return arr.length ? arr.join(",") : "-";
}

function updateHUD() {
    if (!hudEls.clock) { return; }
    hudEls.clock.textContent = SimClock.format();
    const counts = {};
    for (let i = 0; i < agents.length; i++) {
        counts[agents[i].state] = (counts[agents[i].state] || 0) + 1;
    }
    const order = ["AT_DESK", "IN_MEETING", "AT_LUNCH", "AT_BREAK", "VISITING",
        "ARRIVING", "WAITING_ELEVATOR", "IN_CAR", "ON_FLOOR", "LEAVING",
        "AWAY", "GONE", "DISABLED"];
    let lines = "";
    for (let i = 0; i < order.length; i++) {
        if (counts[order[i]]) { lines += order[i] + ": " + counts[order[i]] + "\n"; }
    }
    const dirTxt = elevator.direction > 0 ? "UP" : elevator.direction < 0 ? "DOWN" : "-";
    lines += "\nELEV fl " + elevator.currentFloor + " " + dirTxt + " " + elevator.state +
        "\n riders " + elevator.passengers.size + "/4" +
        "\n dest {" + setToText(elevator.destinations) + "}" +
        "\n up {" + setToText(elevator.upCalls) + "}" +
        " down {" + setToText(elevator.downCalls) + "}";
    hudEls.stats.textContent = lines;
}

// ---------- agent visual-state sync ----------

function syncAgentStates() {
    // Keep IN_CAR / WAITING_ELEVATOR display states coherent with reality.
    const rideActions = { WAIT_AT_PANEL: 1, ENTER_ELEVATOR: 1, PRESS_FLOOR: 1, WAIT_FOR_FLOOR: 1, EXIT_ELEVATOR: 1 };
    for (let i = 0; i < agents.length; i++) {
        const agent = agents[i];
        if (agent.state === "DISABLED" || agent.state === "GONE" || agent.state === "AWAY") { continue; }
        if (!agent.currentAction) { continue; }
        const t = agent.currentAction.type;
        if (t === "WAIT_AT_PANEL") {
            if (agent.state !== "WAITING_ELEVATOR" && agent.state !== "IN_CAR") {
                agent._preElevState = agent.state;
            }
            agent.state = "WAITING_ELEVATOR";
        } else if (t === "WAIT_FOR_FLOOR" || t === "ENTER_ELEVATOR") {
            if (agent.group.parent === elevator.carGroup) { agent.state = "IN_CAR"; }
        } else if (!rideActions[t] &&
            (agent.state === "WAITING_ELEVATOR" || agent.state === "IN_CAR")) {
            agent.state = agent._preElevState ||
                (agent.role === "VISITOR" ? "VISITING" : "ON_FLOOR");
        }
    }
}

// ---------- bootstrap ----------

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
    controls.target.set(0, WORLD.FLOOR_HEIGHT * 2.2, 0);

    ambLight = new THREE.AmbientLight(0xffffff, 0.45);
    scene.add(ambLight);
    hemiLight = new THREE.HemisphereLight(0xbfd7ff, 0x303020, 0.45);
    scene.add(hemiLight);
    sunLight = new THREE.DirectionalLight(0xffffff, 0.9);
    sunLight.position.set(20, 35, 18);
    scene.add(sunLight);

    world = createWorld(scene);
    elevator = new Elevator(scene, world);

    buildAgents();
    setupUI();

    window.addEventListener("resize", function() {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    threeClock = new THREE.Clock();

    function animate() {
        requestAnimationFrame(animate);
        const realDt = Math.min(0.05, threeClock.getDelta());
        const motionDt = realDt * SimClock.timeScale;
        // Sub-step the sim so agents keep up with elevator door cycles even at
        // high time scale: clock, elevator, and agents advance in lockstep
        // slices no longer than MAX_SLICE sim-seconds.
        const MAX_SLICE = 0.3;
        let remaining = motionDt;
        let sliceGuard = 0;
        while (remaining > 0.0001 && sliceGuard < 400) {
            const slice = Math.min(remaining, MAX_SLICE);
            remaining -= slice;
            sliceGuard++;
            SimClock.tick(slice / SimClock.timeScale);
            elevator.tick(slice);
            for (let i = 0; i < agents.length; i++) {
                processAgent(agents[i], slice);
            }
        }
        updateDayNight();
        topUpVisitors();
        syncAgentStates();
        applyCollisions();
        for (let i = 0; i < agents.length; i++) {
            if (agents[i].group.parent) {
                animatePersonWalking(agents[i].group, motionDt);
            }
        }
        hudTimer += realDt;
        if (hudTimer > 0.2) {
            hudTimer = 0;
            updateHUD();
        }
        controls.update();
        renderer.render(scene, camera);
    }
    animate();
}
window.startSimulation = startSimulation;

if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", startSimulation);
} else {
    startSimulation();
}
