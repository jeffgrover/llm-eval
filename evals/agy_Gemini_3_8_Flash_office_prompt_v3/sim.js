/**
 * sim.js
 * Simulated clock, day/night lighting, agents and daily schedules, action execution,
 * collision avoidance, render loop, and HUD.
 */

let scene, camera, renderer, controls, world, elevator;
let ambientLight, hemiLight, dirSun;

const WORKER_NAMES = [
    "Alice", "Bob", "Charlie", "Diana", "Evan", "Fiona", "George", "Hannah",
    "Ian", "Julia", "Kevin", "Laura", "Mike", "Nina", "Oscar", "Paula",
    "Quinn", "Rachel", "Sam", "Tina"
];

const VISITOR_NAMES = [
    "Alex", "Blake", "Casey", "Dakota", "Emerson", "Finley", "Gray", "Harper",
    "Jordan", "Kendall", "Logan", "Morgan", "Noel", "Parker", "Reese", "Riley",
    "Rowan", "Sawyer", "Taylor", "Val", "Avery", "Cameron", "Devon", "Drew",
    "Eden", "Francis", "Glenn", "Hayden", "Jamie", "Jesse", "Kai", "Lane",
    "Lee", "Marlo", "Micah", "Nico", "Pat", "Peyton", "Quincy", "Robin",
    "Rory", "Sage", "Sammy", "Shiloh", "Sky", "Stevie", "Sydney", "Toby",
    "Tristan", "Winter", "Adrian", "Amari", "Andy", "Angel", "Archer", "Arlo",
    "Ashton", "August", "Bailey", "Billie", "Bobby", "Brett", "Brook", "Carey",
    "Chris", "Cody", "Corey", "Dana", "Darian", "Dallas", "Elliot", "Ellis",
    "Frankie", "Gene", "Harley", "Haven", "Indigo", "Jean", "Jules", "Justice"
];

const MAX_WORKERS = 20;
const MAX_VISITORS = 80;
const MAX_OCCUPANCY = 100;
let targetOccupancy = 45;

const agents = window.agents = [];
const seatReservations = new Set(); // Key: "floor:wpName"

const simClock = window.simClock = {
    simMinute: 7 * 60 + 30, // 07:30 AM
    timeScale: 120, // 1 real sec = 120 sim sec = 2 sim min

    tick: function(realDt) {
        this.simMinute += (realDt * this.timeScale) / 60;
        if (this.simMinute >= 24 * 60) {
            this.simMinute -= 24 * 60;
            onDayWrap();
        }
    },

    format: function() {
        const totalMin = Math.floor(this.simMinute) % (24 * 60);
        const h24 = Math.floor(totalMin / 60);
        const m = totalMin % 60;
        const ampm = h24 >= 12 ? "PM" : "AM";
        let h = h24 % 12;
        if (h === 0) h = 12;
        const mStr = m < 10 ? "0" + m : "" + m;
        const hStr = h < 10 ? " " + h : "" + h;
        return `${hStr}:${mStr} ${ampm}`;
    }
};

function randInt(min, max) {
    return Math.floor(min + Math.random() * (max - min + 1));
}

function randFloat(min, max) {
    return min + Math.random() * (max - min);
}

function updateDayNightLighting(simMinute) {
    const hour = (simMinute / 60) % 24;

    // Daytime is long and flat from 7:00 to 17:00
    // Dawn from 5:30 to 6:45, Dusk from 17:30 to 18:45
    // Night is never pitch black (ambient 0.45, hemi 0.32)
    let skyCol, sunCol, sunInt, ambInt, hemiInt;

    if (hour < 5.5) {
        // Night
        skyCol = new THREE.Color(0x181a24);
        sunCol = new THREE.Color(0x303550);
        sunInt = 0.08;
        ambInt = 0.45;
        hemiInt = 0.32;
    } else if (hour < 6.75) {
        // Dawn transition
        const t = (hour - 5.5) / 1.25;
        skyCol = new THREE.Color(0x181a24).lerp(new THREE.Color(0xffb74d), t);
        sunCol = new THREE.Color(0xff9800);
        sunInt = 0.1 + t * 0.7;
        ambInt = 0.45 + t * 0.15;
        hemiInt = 0.32 + t * 0.15;
    } else if (hour < 17.5) {
        // Daytime flat
        skyCol = new THREE.Color(0x384152);
        sunCol = new THREE.Color(0xffffff);
        sunInt = 0.95;
        ambInt = 0.60;
        hemiInt = 0.48;
    } else if (hour < 18.75) {
        // Dusk transition
        const t = (hour - 17.5) / 1.25;
        skyCol = new THREE.Color(0x384152).lerp(new THREE.Color(0xbf360c), t * 0.5).lerp(new THREE.Color(0x181a24), t);
        sunCol = new THREE.Color(0xff7043);
        sunInt = 0.95 - t * 0.85;
        ambInt = 0.60 - t * 0.15;
        hemiInt = 0.48 - t * 0.16;
    } else {
        // Night
        skyCol = new THREE.Color(0x181a24);
        sunCol = new THREE.Color(0x303550);
        sunInt = 0.08;
        ambInt = 0.45;
        hemiInt = 0.32;
    }

    if (scene) scene.background = skyCol;
    if (ambientLight) ambientLight.intensity = ambInt;
    if (hemiLight) hemiLight.intensity = hemiInt;
    if (dirSun) {
        dirSun.color = sunCol;
        dirSun.intensity = sunInt;
    }
}

function initAgentPool() {
    // 20 Workers: Floors 1..5, 4 offices per floor = 20 desks
    let deskIdx = 0;
    const workerDesks = [];
    for (let f = 1; f < WORLD.FLOOR_COUNT; f++) {
        const floorDesks = world.floors[f].desks;
        for (let d = 0; d < floorDesks.length; d++) {
            workerDesks.push(floorDesks[d]);
        }
    }

    for (let i = 0; i < MAX_WORKERS; i++) {
        const desk = workerDesks[deskIdx++];
        const personGroup = window.createPerson();
        const agent = {
            id: i,
            role: "WORKER",
            name: WORKER_NAMES[i % WORKER_NAMES.length],
            homeFloor: desk.floor,
            deskId: desk.id,
            deskWpName: desk.deskWpName,
            deskDoorWpName: desk.doorWpName,
            currentFloor: 0,
            group: personGroup,
            state: "AWAY",
            plan: [],
            currentAction: null,
            reservedSeatKey: null,
            hasLunched: false,
            // Daily schedule
            arrivalTime: randFloat(8 * 60 + 15, 9 * 60 + 30),
            lunchTime: randFloat(11 * 60 + 30, 13 * 60 + 30),
            lunchDuration: randFloat(25, 60),
            departureTime: Math.random() < 0.15 ? randFloat(18 * 60 + 30, 19 * 60 + 45) : randFloat(16 * 60 + 45, 18 * 60 + 30),
            plannedMeetingTimes: []
        };

        // 0..2 planned meeting times
        if (Math.random() < 0.8) {
            agent.plannedMeetingTimes.push(randFloat(10 * 60, 11 * 60 + 15));
        }
        if (Math.random() < 0.7) {
            agent.plannedMeetingTimes.push(randFloat(14 * 60, 15 * 60 + 30));
        }
        agent.plannedMeetingTimes.sort((a, b) => a - b);

        agents.push(agent);
    }

    // 80 Visitors
    for (let i = 0; i < MAX_VISITORS; i++) {
        const agentId = MAX_WORKERS + i;
        const personGroup = window.createPerson();
        const agent = {
            id: agentId,
            role: "VISITOR",
            name: VISITOR_NAMES[i % VISITOR_NAMES.length],
            homeFloor: 0,
            deskId: null,
            deskWpName: null,
            deskDoorWpName: null,
            currentFloor: 0,
            group: personGroup,
            state: agentId < targetOccupancy ? "AWAY" : "DISABLED",
            plan: [],
            currentAction: null,
            reservedSeatKey: null,
            hasLunched: false,
            arrivalTime: randFloat(8 * 60, 17 * 60),
            lunchTime: 0,
            lunchDuration: 0,
            departureTime: 0,
            plannedMeetingTimes: []
        };
        agents.push(agent);
    }
}

function reRollWorkerSchedule(agent) {
    agent.arrivalTime = randFloat(8 * 60 + 15, 9 * 60 + 30);
    agent.lunchTime = randFloat(11 * 60 + 30, 13 * 60 + 30);
    agent.lunchDuration = randFloat(25, 60);
    agent.departureTime = Math.random() < 0.15 ? randFloat(18 * 60 + 30, 19 * 60 + 45) : randFloat(16 * 60 + 45, 18 * 60 + 30);
    agent.hasLunched = false;
    agent.plannedMeetingTimes = [];
    if (Math.random() < 0.8) agent.plannedMeetingTimes.push(randFloat(10 * 60, 11 * 60 + 15));
    if (Math.random() < 0.7) agent.plannedMeetingTimes.push(randFloat(14 * 60, 15 * 60 + 30));
    agent.plannedMeetingTimes.sort((a, b) => a - b);
}

function onDayWrap() {
    // Reset elevator
    if (elevator) elevator.reset();
    seatReservations.clear();

    for (let i = 0; i < agents.length; i++) {
        const agent = agents[i];
        if (agent.group && agent.group.parent) {
            agent.group.parent.remove(agent.group);
        }
        agent.currentAction = null;
        agent.plan = [];
        agent.reservedSeatKey = null;
        agent.currentFloor = 0;
        agent.group.userData.isSitting = false;
        agent.group.userData.isWalking = false;

        if (agent.id < targetOccupancy) {
            agent.state = "AWAY";
            if (agent.role === "WORKER") {
                reRollWorkerSchedule(agent);
            } else {
                agent.arrivalTime = randFloat(8 * 60, 17 * 60);
            }
        } else {
            agent.state = "DISABLED";
        }
    }
}

function countPresent() {
    let count = 0;
    for (let i = 0; i < agents.length; i++) {
        const st = agents[i].state;
        if (st !== "DISABLED" && st !== "AWAY" && st !== "GONE") {
            count++;
        }
    }
    return count;
}

function topUpVisitors() {
    const curMin = simClock.simMinute;
    // Business hours between 7:45 and 18:00
    if (curMin < 7 * 60 + 45 || curMin > 18 * 60) return;

    let deficit = targetOccupancy - countPresent();
    if (deficit <= 0) return;

    for (let i = 0; i < agents.length; i++) {
        const agent = agents[i];
        if (agent.role === "VISITOR" && agent.id < targetOccupancy) {
            if (agent.state === "AWAY" || agent.state === "GONE") {
                // Re-arm visitor with arrival 0..6 sim minutes out
                agent.arrivalTime = curMin + randFloat(0.1, 5.0);
                agent.state = "AWAY";
                deficit--;
                if (deficit <= 0) break;
            }
        }
    }
}

function applyOccupancy() {
    for (let i = 0; i < agents.length; i++) {
        const agent = agents[i];
        if (agent.id >= targetOccupancy) {
            if (agent.state === "AWAY" || agent.state === "GONE") {
                agent.state = "DISABLED";
                if (agent.group && agent.group.parent) {
                    agent.group.parent.remove(agent.group);
                }
            }
        } else {
            if (agent.state === "DISABLED") {
                agent.state = "AWAY";
                if (agent.role === "VISITOR") {
                    agent.arrivalTime = simClock.simMinute + randFloat(0.2, 4.0);
                }
            }
        }
    }
}

// ---------------- Action System ----------------
function startAction(agent, action) {
    switch (action.type) {
        case "WALK_TO_WP": {
            const floorData = world.floors[action.floor];
            const startWp = findNearestWaypoint(floorData.nodes, agent.group.position);
            action.path = window.bfsPath(floorData.nodes, startWp, action.wpName);
            action.pathIndex = 0;
            action.stallT = 0;
            action.prevPos = agent.group.position.clone();
            agent.group.userData.isWalking = true;
            agent.currentFloor = action.floor;
            break;
        }
        case "WAIT_AT_PANEL": {
            agent.group.userData.isWalking = false;
            agent.state = "WAITING_ELEVATOR";
            if (action.dir > 0) elevator.callUp(action.floor);
            else elevator.callDown(action.floor);
            break;
        }
        case "ENTER_ELEVATOR": {
            agent.state = "IN_CAR";
            action.phase = "reserve";
            action.stallT = 0;
            action.prevPos = agent.group.position.clone();
            break;
        }
        case "PRESS_FLOOR": {
            elevator.pressDestination(action.floor);
            break;
        }
        case "WAIT_FOR_FLOOR": {
            agent.group.userData.isWalking = false;
            break;
        }
        case "EXIT_ELEVATOR": {
            action.phase = "disembark";
            elevator.registerDisembark(agent);
            // Reparent to scene preserving world position
            scene.attach(agent.group);
            agent.currentFloor = action.floor;
            const floorData = world.floors[action.floor];
            action.exitPath = [floorData.nodes["elevWait"].pos.clone()];
            action.pathIndex = 0;
            agent.group.userData.isWalking = true;
            break;
        }
        case "SIT": {
            const floorData = world.floors[action.floor];
            const target = floorData.sitTargets[action.wpName] || { sit: false, facing: 0 };
            const nodePos = floorData.nodes[action.wpName].pos;

            if (target.sit) {
                // Seated figure: hips align with chair cushion, legs directed forward away from backrest
                agent.group.position.set(nodePos.x, floorData.floorY + 0.45 - 0.75, nodePos.z);
                agent.group.rotation.set(0, target.facing, 0);
                agent.group.userData.isSitting = true;
                agent.group.userData.isWalking = false;
            } else {
                // Standing waypoint: jitter by small random ring (0.35..0.75)
                const angle = Math.random() * Math.PI * 2;
                const r = randFloat(0.35, 0.75);
                agent.group.position.set(nodePos.x + Math.cos(angle) * r, floorData.floorY, nodePos.z + Math.sin(angle) * r);
                agent.group.rotation.set(0, target.facing, 0);
                agent.group.userData.isSitting = false;
                agent.group.userData.isWalking = false;
            }
            break;
        }
        case "STAND": {
            agent.group.userData.isSitting = false;
            agent.group.position.y = world.floors[agent.currentFloor].floorY;
            break;
        }
        case "RELEASE_SEAT": {
            if (action.seatKey) seatReservations.delete(action.seatKey);
            if (agent.reservedSeatKey === action.seatKey) agent.reservedSeatKey = null;
            break;
        }
        case "WAIT_SIM": {
            action.untilMin = simClock.simMinute + action.minutes;
            agent.group.userData.isWalking = false;
            break;
        }
        case "EXIT_BUILDING": {
            if (agent.group && agent.group.parent) {
                agent.group.parent.remove(agent.group);
            }
            agent.state = "GONE";
            if (agent.reservedSeatKey) {
                seatReservations.delete(agent.reservedSeatKey);
                agent.reservedSeatKey = null;
            }
            break;
        }
        case "ENTER_STATE": {
            agent.state = action.state;
            break;
        }
        case "MARK_LUNCHED": {
            agent.hasLunched = true;
            break;
        }
        case "PICK_NEXT_ACTIVITY": {
            chooseNextActivity(agent);
            break;
        }
    }
}

function updateAction(agent, action, motionDt) {
    switch (action.type) {
        case "WALK_TO_WP": {
            if (!action.path || action.pathIndex >= action.path.length) {
                agent.group.userData.isWalking = false;
                return true;
            }
            const targetPos = action.path[action.pathIndex];
            const curPos = agent.group.position;
            const dx = targetPos.x - curPos.x;
            const dz = targetPos.z - curPos.z;
            const dist = Math.sqrt(dx * dx + dz * dz);
            const step = 1.4 * motionDt;

            // Stall detector
            const moved = curPos.distanceTo(action.prevPos);
            action.prevPos.copy(curPos);
            if (moved < 0.005) {
                action.stallT += motionDt;
                // If stalled for > 1.2s, skip to next waypoint
                if (action.stallT > 1.2) {
                    action.stallT = 0;
                    action.pathIndex++;
                    return action.pathIndex >= action.path.length;
                }
            } else {
                action.stallT = 0;
            }

            if (dist <= step || dist < 0.1) {
                curPos.x = targetPos.x;
                curPos.z = targetPos.z;
                action.pathIndex++;
                if (action.pathIndex >= action.path.length) {
                    agent.group.userData.isWalking = false;
                    return true;
                }
            } else {
                curPos.x += (dx / dist) * step;
                curPos.z += (dz / dist) * step;
                agent.group.rotation.y = Math.atan2(dx, dz);
            }
            return false;
        }

        case "WAIT_AT_PANEL": {
            // Re-press hall call every frame in case cleared by opposite car cycle
            if (action.dir > 0) elevator.callUp(action.floor);
            else elevator.callDown(action.floor);

            if (elevator.isAcceptingAt(action.floor, action.dir)) {
                return true;
            }
            return false;
        }

        case "ENTER_ELEVATOR": {
            if (action.phase === "reserve") {
                if (elevator.currentCapacityFree() <= 0 || elevator.state !== "DOOR_OPEN" || elevator.currentFloor !== action.fromFloor) {
                    // Car slipped away; re-press call and wait again
                    if (action.dir > 0) elevator.callUp(action.fromFloor);
                    else elevator.callDown(action.fromFloor);
                    agent.plan.unshift(action);
                    agent.plan.unshift({ type: "WAIT_AT_PANEL", floor: action.fromFloor, dir: action.dir, toFloor: action.toFloor });
                    return true;
                }
                const spot = elevator.reserveBoardingSpot(agent);
                if (!spot) {
                    agent.plan.unshift(action);
                    agent.plan.unshift({ type: "WAIT_AT_PANEL", floor: action.fromFloor, dir: action.dir, toFloor: action.toFloor });
                    return true;
                }
                action.reservedSpot = spot;
                action.phase = "walkToThreshold";
                action.stallT = 0;
                // Target lane: each of the 4 boarders enters at their own spot.x coordinate!
                action.targetLane = new THREE.Vector3(spot.x, world.floors[action.fromFloor].floorY, 1.4);
                agent.group.userData.isWalking = true;
            }

            if (action.phase === "walkToThreshold") {
                const curPos = agent.group.position;
                const tgt = action.targetLane;
                const dx = tgt.x - curPos.x;
                const dz = tgt.z - curPos.z;
                const dist = Math.sqrt(dx * dx + dz * dz);
                const step = 1.4 * motionDt;

                // Stall recovery
                const moved = curPos.distanceTo(action.prevPos);
                action.prevPos.copy(curPos);
                if (moved < 0.005) {
                    action.stallT += motionDt;
                    if (action.stallT > 1.5) {
                        curPos.x = tgt.x;
                        curPos.z = tgt.z;
                    }
                } else {
                    action.stallT = 0;
                }

                if (dist <= step || dist < 0.1) {
                    curPos.x = tgt.x;
                    curPos.z = tgt.z;
                    // Reparent to carGroup
                    elevator.carGroup.attach(agent.group);
                    action.phase = "walkToSpot";
                } else {
                    curPos.x += (dx / dist) * step;
                    curPos.z += (dz / dist) * step;
                    agent.group.rotation.y = Math.atan2(dx, dz);
                    return false;
                }
            }

            if (action.phase === "walkToSpot") {
                // Moving in car-local space
                const spot = action.reservedSpot;
                const curPos = agent.group.position;
                const dx = spot.x - curPos.x;
                const dz = spot.z - curPos.z;
                const dist = Math.sqrt(dx * dx + dz * dz);
                const step = 1.4 * motionDt;

                if (dist <= step || dist < 0.08) {
                    curPos.x = spot.x;
                    curPos.y = 0;
                    curPos.z = spot.z;
                    // Complete board and turn to face doors (+Z, rotation.y = 0)
                    elevator.completeBoard(agent);
                    agent.group.rotation.y = 0;
                    agent.group.userData.isWalking = false;
                    return true;
                } else {
                    curPos.x += (dx / dist) * step;
                    curPos.z += (dz / dist) * step;
                    curPos.y = 0;
                    agent.group.rotation.y = Math.atan2(dx, dz);
                    return false;
                }
            }
            return false;
        }

        case "PRESS_FLOOR":
        case "SIT":
        case "STAND":
        case "RELEASE_SEAT":
        case "EXIT_BUILDING":
        case "ENTER_STATE":
        case "MARK_LUNCHED":
        case "PICK_NEXT_ACTIVITY":
            return true;

        case "WAIT_FOR_FLOOR": {
            if (elevator.state === "DOOR_OPEN" && elevator.currentFloor === action.floor) {
                return true;
            }
            return false;
        }

        case "EXIT_ELEVATOR": {
            if (!action.exitPath || action.pathIndex >= action.exitPath.length) {
                elevator.completeDisembark(agent);
                agent.group.userData.isWalking = false;
                return true;
            }
            const targetPos = action.exitPath[action.pathIndex];
            const curPos = agent.group.position;
            const dx = targetPos.x - curPos.x;
            const dz = targetPos.z - curPos.z;
            const dist = Math.sqrt(dx * dx + dz * dz);
            const step = 1.4 * motionDt;

            if (dist <= step || dist < 0.1) {
                curPos.x = targetPos.x;
                curPos.z = targetPos.z;
                action.pathIndex++;
                if (action.pathIndex >= action.exitPath.length) {
                    elevator.completeDisembark(agent);
                    agent.group.userData.isWalking = false;
                    return true;
                }
            } else {
                curPos.x += (dx / dist) * step;
                curPos.z += (dz / dist) * step;
                agent.group.rotation.y = Math.atan2(dx, dz);
            }
            return false;
        }

        case "WAIT_SIM": {
            return simClock.simMinute >= action.untilMin;
        }
    }
    return true;
}

function findNearestWaypoint(nodes, pos) {
    let nearest = "hallS";
    let minDist = 9999;
    for (const name in nodes) {
        const node = nodes[name];
        const dx = node.pos.x - pos.x;
        const dz = node.pos.z - pos.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < minDist) {
            minDist = dist;
            nearest = name;
        }
    }
    return nearest;
}

// ---------------- Plan Compilers ----------------
function planArriveToDesk(agent) {
    return [
        { type: "ENTER_STATE", state: "ARRIVING" },
        { type: "WALK_TO_WP", floor: 0, wpName: "front_door_threshold" },
        { type: "WALK_TO_WP", floor: 0, wpName: "entrance" },
        { type: "WALK_TO_WP", floor: 0, wpName: "lobby_center" },
        { type: "WAIT_AT_PANEL", floor: 0, dir: 1, toFloor: agent.homeFloor },
        { type: "ENTER_ELEVATOR", fromFloor: 0, dir: 1, toFloor: agent.homeFloor },
        { type: "PRESS_FLOOR", floor: agent.homeFloor },
        { type: "WAIT_FOR_FLOOR", floor: agent.homeFloor },
        { type: "EXIT_ELEVATOR", floor: agent.homeFloor },
        { type: "ENTER_STATE", state: "ON_FLOOR" },
        { type: "WALK_TO_WP", floor: agent.homeFloor, wpName: agent.deskDoorWpName },
        { type: "WALK_TO_WP", floor: agent.homeFloor, wpName: agent.deskWpName },
        { type: "ENTER_STATE", state: "AT_DESK" },
        { type: "SIT", floor: agent.homeFloor, wpName: agent.deskWpName },
        { type: "WAIT_SIM", minutes: randFloat(25, 55) },
        { type: "PICK_NEXT_ACTIVITY" }
    ];
}

function planGoToLunch(agent) {
    // Pick bistro chair in lobby cafe
    const bistroSpots = [
        "cafe_bistro0_a", "cafe_bistro0_b", "cafe_bistro1_a", "cafe_bistro1_b",
        "cafe_bistro2_a", "cafe_bistro2_b", "cafe_bistro3_a", "cafe_bistro3_b"
    ];
    const spot = bistroSpots[Math.floor(Math.random() * bistroSpots.length)];

    return [
        { type: "STAND" },
        { type: "WALK_TO_WP", floor: agent.homeFloor, wpName: agent.deskDoorWpName },
        { type: "WAIT_AT_PANEL", floor: agent.homeFloor, dir: -1, toFloor: 0 },
        { type: "ENTER_ELEVATOR", fromFloor: agent.homeFloor, dir: -1, toFloor: 0 },
        { type: "PRESS_FLOOR", floor: 0 },
        { type: "WAIT_FOR_FLOOR", floor: 0 },
        { type: "EXIT_ELEVATOR", floor: 0 },
        { type: "WALK_TO_WP", floor: 0, wpName: spot },
        { type: "ENTER_STATE", state: "AT_LUNCH" },
        { type: "SIT", floor: 0, wpName: spot },
        { type: "WAIT_SIM", minutes: agent.lunchDuration },
        { type: "MARK_LUNCHED" },
        { type: "STAND" },
        { type: "WALK_TO_WP", floor: 0, wpName: "lobby_center" },
        { type: "WAIT_AT_PANEL", floor: 0, dir: 1, toFloor: agent.homeFloor },
        { type: "ENTER_ELEVATOR", fromFloor: 0, dir: 1, toFloor: agent.homeFloor },
        { type: "PRESS_FLOOR", floor: agent.homeFloor },
        { type: "WAIT_FOR_FLOOR", floor: agent.homeFloor },
        { type: "EXIT_ELEVATOR", floor: agent.homeFloor },
        { type: "WALK_TO_WP", floor: agent.homeFloor, wpName: agent.deskDoorWpName },
        { type: "WALK_TO_WP", floor: agent.homeFloor, wpName: agent.deskWpName },
        { type: "ENTER_STATE", state: "AT_DESK" },
        { type: "SIT", floor: agent.homeFloor, wpName: agent.deskWpName },
        { type: "WAIT_SIM", minutes: randFloat(25, 55) },
        { type: "PICK_NEXT_ACTIVITY" }
    ];
}

function planVisitLounge(agent) {
    const spots = ["lounge_spot0", "lounge_spot1", "lounge_spot2", "water_cooler"];
    const spot = spots[Math.floor(Math.random() * spots.length)];

    return [
        { type: "STAND" },
        { type: "WALK_TO_WP", floor: agent.homeFloor, wpName: agent.deskDoorWpName },
        { type: "WALK_TO_WP", floor: agent.homeFloor, wpName: "lounge_door" },
        { type: "WALK_TO_WP", floor: agent.homeFloor, wpName: spot },
        { type: "ENTER_STATE", state: "AT_BREAK" },
        { type: "SIT", floor: agent.homeFloor, wpName: spot },
        { type: "WAIT_SIM", minutes: randFloat(5, 12) },
        { type: "STAND" },
        { type: "WALK_TO_WP", floor: agent.homeFloor, wpName: "lounge_door" },
        { type: "WALK_TO_WP", floor: agent.homeFloor, wpName: agent.deskDoorWpName },
        { type: "WALK_TO_WP", floor: agent.homeFloor, wpName: agent.deskWpName },
        { type: "ENTER_STATE", state: "AT_DESK" },
        { type: "SIT", floor: agent.homeFloor, wpName: agent.deskWpName },
        { type: "WAIT_SIM", minutes: randFloat(20, 50) },
        { type: "PICK_NEXT_ACTIVITY" }
    ];
}

function planAttendMeeting(agent) {
    const meetingFloor = Math.random() < 0.65 ? agent.homeFloor : randInt(1, WORLD.FLOOR_COUNT - 1);
    const seatNames = ["conf_seat0", "conf_seat1", "conf_seat2", "conf_seat3"];
    let chosenSeat = null;
    let chosenKey = null;

    for (let s = 0; s < seatNames.length; s++) {
        const key = `${meetingFloor}:${seatNames[s]}`;
        if (!seatReservations.has(key)) {
            chosenSeat = seatNames[s];
            chosenKey = key;
            break;
        }
    }

    if (!chosenSeat) {
        return planVisitLounge(agent);
    }

    seatReservations.add(chosenKey);
    agent.reservedSeatKey = chosenKey;

    const plan = [
        { type: "STAND" },
        { type: "WALK_TO_WP", floor: agent.homeFloor, wpName: agent.deskDoorWpName }
    ];

    if (meetingFloor !== agent.homeFloor) {
        const dir = meetingFloor > agent.homeFloor ? 1 : -1;
        plan.push({ type: "WAIT_AT_PANEL", floor: agent.homeFloor, dir: dir, toFloor: meetingFloor });
        plan.push({ type: "ENTER_ELEVATOR", fromFloor: agent.homeFloor, dir: dir, toFloor: meetingFloor });
        plan.push({ type: "PRESS_FLOOR", floor: meetingFloor });
        plan.push({ type: "WAIT_FOR_FLOOR", floor: meetingFloor });
        plan.push({ type: "EXIT_ELEVATOR", floor: meetingFloor });
    }

    plan.push({ type: "WALK_TO_WP", floor: meetingFloor, wpName: "conf_door" });
    plan.push({ type: "WALK_TO_WP", floor: meetingFloor, wpName: chosenSeat });
    plan.push({ type: "ENTER_STATE", state: "IN_MEETING" });
    plan.push({ type: "SIT", floor: meetingFloor, wpName: chosenSeat });
    plan.push({ type: "WAIT_SIM", minutes: randFloat(22, 45) });
    plan.push({ type: "STAND" });
    plan.push({ type: "RELEASE_SEAT", seatKey: chosenKey });
    plan.push({ type: "WALK_TO_WP", floor: meetingFloor, wpName: "conf_door" });

    if (meetingFloor !== agent.homeFloor) {
        const backDir = agent.homeFloor > meetingFloor ? 1 : -1;
        plan.push({ type: "WAIT_AT_PANEL", floor: meetingFloor, dir: backDir, toFloor: agent.homeFloor });
        plan.push({ type: "ENTER_ELEVATOR", fromFloor: meetingFloor, dir: backDir, toFloor: agent.homeFloor });
        plan.push({ type: "PRESS_FLOOR", floor: agent.homeFloor });
        plan.push({ type: "WAIT_FOR_FLOOR", floor: agent.homeFloor });
        plan.push({ type: "EXIT_ELEVATOR", floor: agent.homeFloor });
    }

    plan.push({ type: "WALK_TO_WP", floor: agent.homeFloor, wpName: agent.deskDoorWpName });
    plan.push({ type: "WALK_TO_WP", floor: agent.homeFloor, wpName: agent.deskWpName });
    plan.push({ type: "ENTER_STATE", state: "AT_DESK" });
    plan.push({ type: "SIT", floor: agent.homeFloor, wpName: agent.deskWpName });
    plan.push({ type: "WAIT_SIM", minutes: randFloat(20, 50) });
    plan.push({ type: "PICK_NEXT_ACTIVITY" });

    return plan;
}

function planVisitCoworker(agent) {
    // Pick coworker currently AT_DESK
    const candidates = [];
    for (let i = 0; i < MAX_WORKERS; i++) {
        const other = agents[i];
        if (other.id !== agent.id && other.state === "AT_DESK") {
            candidates.push(other);
        }
    }
    if (candidates.length === 0) {
        return planVisitLounge(agent);
    }
    const other = candidates[Math.floor(Math.random() * candidates.length)];

    const plan = [
        { type: "STAND" },
        { type: "WALK_TO_WP", floor: agent.homeFloor, wpName: agent.deskDoorWpName }
    ];

    if (other.homeFloor !== agent.homeFloor) {
        const dir = other.homeFloor > agent.homeFloor ? 1 : -1;
        plan.push({ type: "WAIT_AT_PANEL", floor: agent.homeFloor, dir: dir, toFloor: other.homeFloor });
        plan.push({ type: "ENTER_ELEVATOR", fromFloor: agent.homeFloor, dir: dir, toFloor: other.homeFloor });
        plan.push({ type: "PRESS_FLOOR", floor: other.homeFloor });
        plan.push({ type: "WAIT_FOR_FLOOR", floor: other.homeFloor });
        plan.push({ type: "EXIT_ELEVATOR", floor: other.homeFloor });
    }

    plan.push({ type: "WALK_TO_WP", floor: other.homeFloor, wpName: other.deskDoorWpName });
    plan.push({ type: "ENTER_STATE", state: "VISITING" });
    plan.push({ type: "SIT", floor: other.homeFloor, wpName: other.deskDoorWpName });
    plan.push({ type: "WAIT_SIM", minutes: randFloat(6, 18) });
    plan.push({ type: "STAND" });

    if (other.homeFloor !== agent.homeFloor) {
        const backDir = agent.homeFloor > other.homeFloor ? 1 : -1;
        plan.push({ type: "WAIT_AT_PANEL", floor: other.homeFloor, dir: backDir, toFloor: agent.homeFloor });
        plan.push({ type: "ENTER_ELEVATOR", fromFloor: other.homeFloor, dir: backDir, toFloor: agent.homeFloor });
        plan.push({ type: "PRESS_FLOOR", floor: agent.homeFloor });
        plan.push({ type: "WAIT_FOR_FLOOR", floor: agent.homeFloor });
        plan.push({ type: "EXIT_ELEVATOR", floor: agent.homeFloor });
    }

    plan.push({ type: "WALK_TO_WP", floor: agent.homeFloor, wpName: agent.deskDoorWpName });
    plan.push({ type: "WALK_TO_WP", floor: agent.homeFloor, wpName: agent.deskWpName });
    plan.push({ type: "ENTER_STATE", state: "AT_DESK" });
    plan.push({ type: "SIT", floor: agent.homeFloor, wpName: agent.deskWpName });
    plan.push({ type: "WAIT_SIM", minutes: randFloat(18, 45) });
    plan.push({ type: "PICK_NEXT_ACTIVITY" });

    return plan;
}

function planLeaveBuilding(agent) {
    const plan = [{ type: "STAND" }];
    if (agent.reservedSeatKey) {
        plan.push({ type: "RELEASE_SEAT", seatKey: agent.reservedSeatKey });
    }

    if (agent.currentFloor > 0) {
        plan.push({ type: "WALK_TO_WP", floor: agent.currentFloor, wpName: agent.deskDoorWpName || "elevWait" });
        plan.push({ type: "WAIT_AT_PANEL", floor: agent.currentFloor, dir: -1, toFloor: 0 });
        plan.push({ type: "ENTER_ELEVATOR", fromFloor: agent.currentFloor, dir: -1, toFloor: 0 });
        plan.push({ type: "PRESS_FLOOR", floor: 0 });
        plan.push({ type: "WAIT_FOR_FLOOR", floor: 0 });
        plan.push({ type: "EXIT_ELEVATOR", floor: 0 });
    }

    plan.push({ type: "ENTER_STATE", state: "LEAVING" });
    plan.push({ type: "WALK_TO_WP", floor: 0, wpName: "lobby_center" });
    plan.push({ type: "WALK_TO_WP", floor: 0, wpName: "entrance" });
    plan.push({ type: "WALK_TO_WP", floor: 0, wpName: "front_door_threshold" });
    plan.push({ type: "WALK_TO_WP", floor: 0, wpName: "outside" });
    plan.push({ type: "EXIT_BUILDING" });

    return plan;
}

function planVisitorVisit(visitor) {
    const plan = [
        { type: "ENTER_STATE", state: "ARRIVING" },
        { type: "WALK_TO_WP", floor: 0, wpName: "front_door_threshold" },
        { type: "WALK_TO_WP", floor: 0, wpName: "entrance" }
    ];

    // Roll weighted die:
    // 10% bistro table (cafe), 6% cafe counter, 14% front lounge, 12% back lounge / pit,
    // 10% reception / kiosk / water cooler, 10% lobby loiter, 15% office floor lounge, 23% meeting
    const roll = Math.random();

    if (roll < 0.10) {
        // Bistro table
        const spots = ["cafe_bistro0_a", "cafe_bistro0_b", "cafe_bistro1_a", "cafe_bistro1_b", "cafe_bistro2_a", "cafe_bistro2_b"];
        const spot = spots[Math.floor(Math.random() * spots.length)];
        plan.push({ type: "WALK_TO_WP", floor: 0, wpName: "cafe_order" });
        plan.push({ type: "WALK_TO_WP", floor: 0, wpName: spot });
        plan.push({ type: "ENTER_STATE", state: "AT_BREAK" });
        plan.push({ type: "SIT", floor: 0, wpName: spot });
        plan.push({ type: "WAIT_SIM", minutes: randFloat(12, 30) });
        plan.push({ type: "STAND" });
    } else if (roll < 0.16) {
        // Cafe counter
        plan.push({ type: "WALK_TO_WP", floor: 0, wpName: "cafe_order" });
        plan.push({ type: "ENTER_STATE", state: "VISITING" });
        plan.push({ type: "SIT", floor: 0, wpName: "cafe_order" });
        plan.push({ type: "WAIT_SIM", minutes: randFloat(6, 16) });
        plan.push({ type: "STAND" });
    } else if (roll < 0.30) {
        // Front lounge
        const spots = ["front_lounge_couch", "front_lounge_chair1", "front_lounge_chair2"];
        const spot = spots[Math.floor(Math.random() * spots.length)];
        plan.push({ type: "WALK_TO_WP", floor: 0, wpName: "front_lounge_center" });
        plan.push({ type: "WALK_TO_WP", floor: 0, wpName: spot });
        plan.push({ type: "ENTER_STATE", state: "AT_BREAK" });
        plan.push({ type: "SIT", floor: 0, wpName: spot });
        plan.push({ type: "WAIT_SIM", minutes: randFloat(12, 28) });
        plan.push({ type: "STAND" });
    } else if (roll < 0.42) {
        // Back lounge / Pit
        const spots = ["back_lounge_N", "back_lounge_S", "pit_N", "pit_S", "pit_E", "pit_W"];
        const spot = spots[Math.floor(Math.random() * spots.length)];
        plan.push({ type: "WALK_TO_WP", floor: 0, wpName: spot.startsWith("pit") ? "pit_center" : "back_lounge_center" });
        plan.push({ type: "WALK_TO_WP", floor: 0, wpName: spot });
        plan.push({ type: "ENTER_STATE", state: "AT_BREAK" });
        plan.push({ type: "SIT", floor: 0, wpName: spot });
        plan.push({ type: "WAIT_SIM", minutes: randFloat(14, 32) });
        plan.push({ type: "STAND" });
    } else if (roll < 0.52) {
        // Reception / Kiosk / Water cooler
        const spots = ["reception", "kiosk", "lobby_wc_front", "lobby_wc_back"];
        const spot = spots[Math.floor(Math.random() * spots.length)];
        plan.push({ type: "WALK_TO_WP", floor: 0, wpName: spot });
        plan.push({ type: "ENTER_STATE", state: "VISITING" });
        plan.push({ type: "SIT", floor: 0, wpName: spot });
        plan.push({ type: "WAIT_SIM", minutes: randFloat(5, 12) });
        plan.push({ type: "STAND" });
    } else if (roll < 0.62) {
        // Lobby loiter
        const spots = ["lobby_stand_center", "lobby_stand_NE", "lobby_stand_NW", "lobby_stand_midE", "lobby_stand_midW"];
        const spot = spots[Math.floor(Math.random() * spots.length)];
        plan.push({ type: "WALK_TO_WP", floor: 0, wpName: spot });
        plan.push({ type: "ENTER_STATE", state: "VISITING" });
        plan.push({ type: "SIT", floor: 0, wpName: spot });
        plan.push({ type: "WAIT_SIM", minutes: randFloat(8, 20) });
        plan.push({ type: "STAND" });
    } else if (roll < 0.77) {
        // Ride up to an office-floor lounge
        const targetFloor = randInt(1, WORLD.FLOOR_COUNT - 1);
        const spots = ["lounge_spot0", "lounge_spot1", "lounge_spot2", "water_cooler", "hall_stand_N"];
        const spot = spots[Math.floor(Math.random() * spots.length)];

        plan.push({ type: "WALK_TO_WP", floor: 0, wpName: "lobby_center" });
        plan.push({ type: "WAIT_AT_PANEL", floor: 0, dir: 1, toFloor: targetFloor });
        plan.push({ type: "ENTER_ELEVATOR", fromFloor: 0, dir: 1, toFloor: targetFloor });
        plan.push({ type: "PRESS_FLOOR", floor: targetFloor });
        plan.push({ type: "WAIT_FOR_FLOOR", floor: targetFloor });
        plan.push({ type: "EXIT_ELEVATOR", floor: targetFloor });
        plan.push({ type: "WALK_TO_WP", floor: targetFloor, wpName: spot.startsWith("hall") ? spot : "lounge_door" });
        if (!spot.startsWith("hall")) plan.push({ type: "WALK_TO_WP", floor: targetFloor, wpName: spot });
        plan.push({ type: "ENTER_STATE", state: "VISITING" });
        plan.push({ type: "SIT", floor: targetFloor, wpName: spot });
        plan.push({ type: "WAIT_SIM", minutes: randFloat(12, 26) });
        plan.push({ type: "STAND" });
        plan.push({ type: "WALK_TO_WP", floor: targetFloor, wpName: "elevWait" });
        plan.push({ type: "WAIT_AT_PANEL", floor: targetFloor, dir: -1, toFloor: 0 });
        plan.push({ type: "ENTER_ELEVATOR", fromFloor: targetFloor, dir: -1, toFloor: 0 });
        plan.push({ type: "PRESS_FLOOR", floor: 0 });
        plan.push({ type: "WAIT_FOR_FLOOR", floor: 0 });
        plan.push({ type: "EXIT_ELEVATOR", floor: 0 });
    } else {
        // External attendee sitting in on a meeting
        const confFloor = randInt(1, WORLD.FLOOR_COUNT - 1);
        const seatNames = ["conf_seat0", "conf_seat1", "conf_seat2", "conf_seat3"];
        let chosenSeat = null;
        let chosenKey = null;
        for (let s = 0; s < seatNames.length; s++) {
            const key = `${confFloor}:${seatNames[s]}`;
            if (!seatReservations.has(key)) {
                chosenSeat = seatNames[s];
                chosenKey = key;
                break;
            }
        }

        if (chosenSeat) {
            seatReservations.add(chosenKey);
            visitor.reservedSeatKey = chosenKey;

            plan.push({ type: "WALK_TO_WP", floor: 0, wpName: "lobby_center" });
            plan.push({ type: "WAIT_AT_PANEL", floor: 0, dir: 1, toFloor: confFloor });
            plan.push({ type: "ENTER_ELEVATOR", fromFloor: 0, dir: 1, toFloor: confFloor });
            plan.push({ type: "PRESS_FLOOR", floor: confFloor });
            plan.push({ type: "WAIT_FOR_FLOOR", floor: confFloor });
            plan.push({ type: "EXIT_ELEVATOR", floor: confFloor });
            plan.push({ type: "WALK_TO_WP", floor: confFloor, wpName: "conf_door" });
            plan.push({ type: "WALK_TO_WP", floor: confFloor, wpName: chosenSeat });
            plan.push({ type: "ENTER_STATE", state: "IN_MEETING" });
            plan.push({ type: "SIT", floor: confFloor, wpName: chosenSeat });
            plan.push({ type: "WAIT_SIM", minutes: randFloat(20, 40) });
            plan.push({ type: "STAND" });
            plan.push({ type: "RELEASE_SEAT", seatKey: chosenKey });
            plan.push({ type: "WALK_TO_WP", floor: confFloor, wpName: "conf_door" });
            plan.push({ type: "WAIT_AT_PANEL", floor: confFloor, dir: -1, toFloor: 0 });
            plan.push({ type: "ENTER_ELEVATOR", fromFloor: confFloor, dir: -1, toFloor: 0 });
            plan.push({ type: "PRESS_FLOOR", floor: 0 });
            plan.push({ type: "WAIT_FOR_FLOOR", floor: 0 });
            plan.push({ type: "EXIT_ELEVATOR", floor: 0 });
        } else {
            // Fallback to lobby loiter
            plan.push({ type: "WALK_TO_WP", floor: 0, wpName: "lobby_stand_center" });
            plan.push({ type: "ENTER_STATE", state: "VISITING" });
            plan.push({ type: "SIT", floor: 0, wpName: "lobby_stand_center" });
            plan.push({ type: "WAIT_SIM", minutes: randFloat(10, 20) });
            plan.push({ type: "STAND" });
        }
    }

    // Departure chain
    plan.push({ type: "ENTER_STATE", state: "LEAVING" });
    plan.push({ type: "WALK_TO_WP", floor: 0, wpName: "lobby_center" });
    plan.push({ type: "WALK_TO_WP", floor: 0, wpName: "entrance" });
    plan.push({ type: "WALK_TO_WP", floor: 0, wpName: "front_door_threshold" });
    plan.push({ type: "WALK_TO_WP", floor: 0, wpName: "outside" });
    plan.push({ type: "EXIT_BUILDING" });

    return plan;
}

function chooseNextActivity(agent) {
    if (agent.role === "VISITOR") {
        return;
    }

    const curMin = simClock.simMinute;

    // 1. Past departure time
    if (curMin >= agent.departureTime) {
        agent.plan = planLeaveBuilding(agent);
        return;
    }

    // 2. Planned meeting whose time has arrived
    if (agent.plannedMeetingTimes.length > 0 && curMin >= agent.plannedMeetingTimes[0]) {
        agent.plannedMeetingTimes.shift();
        agent.plan = planAttendMeeting(agent);
        return;
    }

    // 3. Past lunch window and not lunched
    if (curMin >= agent.lunchTime && !agent.hasLunched) {
        agent.plan = planGoToLunch(agent);
        return;
    }

    // 4. Roll weighted die
    const roll = Math.random();
    if (roll < 0.14) {
        agent.plan = planAttendMeeting(agent);
    } else if (roll < 0.26) {
        agent.plan = planVisitLounge(agent);
    } else if (roll < 0.41) {
        agent.plan = planVisitCoworker(agent);
    } else {
        // Keep working at desk
        agent.plan = [
            { type: "WAIT_SIM", minutes: randFloat(18, 55) },
            { type: "PICK_NEXT_ACTIVITY" }
        ];
    }
}

// ---------------- Collision Avoidance ----------------
function applyCollisions() {
    const active = [];
    for (let i = 0; i < agents.length; i++) {
        const ag = agents[i];
        if (!ag.group || !ag.group.parent) continue;
        if (ag.group.userData.isSitting) continue;
        if (ag.group.parent === elevator.carGroup) continue;
        if (ag.currentAction && ag.currentAction.type === "ENTER_ELEVATOR") continue;

        // Skip collision while on entrance chain so nobody bunches outside doorway
        if (ag.currentAction && ag.currentAction.type === "WALK_TO_WP") {
            const wp = ag.currentAction.wpName;
            if (wp === "outside" || wp === "front_door_threshold" || wp === "entrance") {
                continue;
            }
        }
        active.push(ag);
    }

    const pushScalar = 0.18;
    const minDist = 0.70;

    for (let i = 0; i < active.length; i++) {
        const p1 = active[i].group.position;
        for (let j = i + 1; j < active.length; j++) {
            const p2 = active[j].group.position;

            // Only collide if on same floor (y within 1 unit)
            if (Math.abs(p1.y - p2.y) > 1.0) continue;

            const dx = p1.x - p2.x;
            const dz = p1.z - p2.z;
            const dist = Math.sqrt(dx * dx + dz * dz);

            if (dist < minDist) {
                let nx, nz;
                if (dist < 0.001) {
                    // Exact overlap: pick random direction
                    const angle = Math.random() * Math.PI * 2;
                    nx = Math.cos(angle);
                    nz = Math.sin(angle);
                } else {
                    nx = dx / dist;
                    nz = dz / dist;
                }
                const push = (minDist - dist) * pushScalar;
                p1.x += nx * push * 0.5;
                p1.z += nz * push * 0.5;
                p2.x -= nx * push * 0.5;
                p2.z -= nz * push * 0.5;
            }
        }
    }
}

// ---------------- UI and HUD ----------------
let hudClockElem, hudSpeedLabel, hudOccLabel, hudStateCountsElem, hudElevElem;

function createHUD() {
    const hud = document.createElement("div");
    hud.id = "sim-hud";
    hud.style.position = "absolute";
    hud.style.top = "12px";
    hud.style.left = "12px";
    hud.style.padding = "14px 18px";
    hud.style.background = "rgba(18, 22, 30, 0.88)";
    hud.style.color = "#eceff1";
    hud.style.fontFamily = "system-ui, -apple-system, sans-serif";
    hud.style.fontSize = "13px";
    hud.style.borderRadius = "8px";
    hud.style.boxShadow = "0 4px 16px rgba(0,0,0,0.5)";
    hud.style.zIndex = "1000";
    hud.style.width = "300px";
    hud.style.backdropFilter = "blur(4px)";
    hud.style.border = "1px solid rgba(255,255,255,0.12)";

    hud.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:10px;">
            <span style="font-weight:700; font-size:15px; letter-spacing:0.5px; color:#90caf9;">Office Simulation</span>
            <span id="hud-clock" style="font-family:monospace; font-weight:700; font-size:18px; color:#ffb74d;">07:30 AM</span>
        </div>

        <div style="margin-bottom:10px;">
            <div style="display:flex; justify-content:space-between; margin-bottom:2px;">
                <span>Sim Speed:</span>
                <span id="hud-speed-label" style="font-family:monospace; color:#81c784;">120x</span>
            </div>
            <input id="hud-speed-slider" type="range" min="1" max="600" value="120" style="width:100%; cursor:pointer;">
        </div>

        <div style="margin-bottom:12px;">
            <div style="display:flex; justify-content:space-between; margin-bottom:2px;">
                <span>Occupancy:</span>
                <span id="hud-occ-label" style="font-family:monospace; color:#64b5f6;">45 / 100 people</span>
            </div>
            <input id="hud-occ-slider" type="range" min="1" max="100" value="45" style="width:100%; cursor:pointer;">
        </div>

        <div style="border-top:1px solid rgba(255,255,255,0.15); padding-top:8px; margin-bottom:8px;">
            <div style="font-weight:600; color:#b0bec5; margin-bottom:4px;">Elevator Car:</div>
            <div id="hud-elevator-info" style="font-family:monospace; font-size:12px; line-height:1.4; color:#fff59d;">
                Floor: 0 | State: IDLE | Passengers: 0/4
            </div>
        </div>

        <div style="border-top:1px solid rgba(255,255,255,0.15); padding-top:8px;">
            <div style="font-weight:600; color:#b0bec5; margin-bottom:4px;">Agent Status Breakdown:</div>
            <div id="hud-state-counts" style="font-size:11px; line-height:1.4; color:#cfd8dc;"></div>
        </div>
    `;

    document.body.appendChild(hud);

    hudClockElem = document.getElementById("hud-clock");
    hudSpeedLabel = document.getElementById("hud-speed-label");
    hudOccLabel = document.getElementById("hud-occ-label");
    hudElevElem = document.getElementById("hud-elevator-info");
    hudStateCountsElem = document.getElementById("hud-state-counts");

    const speedSlider = document.getElementById("hud-speed-slider");
    speedSlider.addEventListener("input", function() {
        simClock.timeScale = Number(this.value);
        hudSpeedLabel.textContent = `${this.value}x`;
    });

    const occSlider = document.getElementById("hud-occ-slider");
    occSlider.addEventListener("input", function() {
        targetOccupancy = Number(this.value);
        hudOccLabel.textContent = `${targetOccupancy} / 100 people`;
        applyOccupancy();
    });
}

function updateHUD() {
    if (!hudClockElem) return;

    hudClockElem.textContent = simClock.format();

    // Elevator info
    let dirStr = "-";
    if (elevator.direction > 0) dirStr = "UP";
    else if (elevator.direction < 0) dirStr = "DOWN";

    const dests = Array.from(elevator.destinations).sort().join(",") || "-";
    const upCalls = Array.from(elevator.upCalls).sort().join(",") || "-";
    const downCalls = Array.from(elevator.downCalls).sort().join(",") || "-";

    hudElevElem.innerHTML = `Floor: ${elevator.currentFloor} (${dirStr}) | State: ${elevator.state}<br>` +
        `Riders: ${elevator.passengers.size}/4 (Pend: ${elevator.pendingBoarders.size})<br>` +
        `Dest: [${dests}] | UpCalls: [${upCalls}] | DnCalls: [${downCalls}]`;

    // Counts per state
    const counts = {
        ARRIVING: 0, AT_DESK: 0, IN_MEETING: 0, AT_BREAK: 0,
        AT_LUNCH: 0, VISITING: 0, WAITING_ELEVATOR: 0, IN_CAR: 0,
        LEAVING: 0, AWAY: 0, DISABLED: 0, GONE: 0
    };

    for (let i = 0; i < agents.length; i++) {
        const s = agents[i].state;
        if (counts[s] !== undefined) counts[s]++;
    }

    hudStateCountsElem.innerHTML = `
        Desk: ${counts.AT_DESK} | Meeting: ${counts.IN_MEETING} | Break: ${counts.AT_BREAK} | Lunch: ${counts.AT_LUNCH}<br>
        Elevator Wait: ${counts.WAITING_ELEVATOR} | In Car: ${counts.IN_CAR}<br>
        Arriving: ${counts.ARRIVING} | Visiting: ${counts.VISITING} | Leaving: ${counts.LEAVING}<br>
        Away: ${counts.AWAY} | Disabled: ${counts.DISABLED} | Left: ${counts.GONE}
    `;
}

// ---------------- Bootstrap & Loop ----------------
function startSimulation() {
    scene = window.scene = new THREE.Scene();
    scene.background = new THREE.Color(0x20242a);

    camera = window.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(28, 24, 28);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.sortObjects = true;
    document.body.appendChild(renderer.domElement);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 10, 0);
    controls.update();

    ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
    scene.add(ambientLight);

    hemiLight = new THREE.HemisphereLight(0xbfd7ff, 0x303020, 0.45);
    scene.add(hemiLight);

    dirSun = new THREE.DirectionalLight(0xffffff, 0.9);
    dirSun.position.set(20, 35, 18);
    scene.add(dirSun);

    world = window.world = window.createWorld(scene);
    elevator = window.elevator = new window.Elevator(scene, world);

    initAgentPool();
    createHUD();

    window.addEventListener("resize", function() {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    const threeClock = new THREE.Clock();

    function animate() {
        requestAnimationFrame(animate);

        const realDt = Math.min(0.05, threeClock.getDelta());
        simClock.tick(realDt);
        updateDayNightLighting(simClock.simMinute);

        // Lockstep motion: motionDt advances with timeScale
        const motionDt = realDt * simClock.timeScale;

        elevator.tick(motionDt);
        topUpVisitors();

        // Process agents
        const curMin = simClock.simMinute;

        for (let i = 0; i < agents.length; i++) {
            const agent = agents[i];
            if (agent.state === "DISABLED") continue;

            // Spawn check for AWAY
            if (agent.state === "AWAY") {
                if (curMin >= agent.arrivalTime) {
                    // Spawn on sidewalk outside entrance with jitter
                    const spawnX = randFloat(-1.1, 1.1);
                    const spawnZ = 12.0 + randFloat(-0.75, 0.75);
                    agent.group.position.set(spawnX, 0, spawnZ);
                    agent.group.rotation.set(0, Math.PI, 0); // facing -Z toward entrance
                    agent.currentFloor = 0;
                    scene.add(agent.group);

                    if (agent.role === "WORKER") {
                        agent.plan = planArriveToDesk(agent);
                    } else {
                        agent.plan = planVisitorVisit(agent);
                    }
                    agent.state = "ARRIVING";
                }
                continue;
            }

            if (agent.state === "GONE") continue;

            // Workers end-of-day check
            if (agent.role === "WORKER" && curMin >= agent.departureTime && agent.state !== "LEAVING") {
                if (agent.state === "AT_DESK" || agent.state === "AT_BREAK" || agent.state === "VISITING") {
                    agent.plan = planLeaveBuilding(agent);
                    agent.currentAction = null;
                }
            }

            // Action dispatch loop (up to 16 transitions per frame)
            for (let iter = 0; iter < 16; iter++) {
                if (!agent.currentAction) {
                    if (agent.plan.length > 0) {
                        agent.currentAction = agent.plan.shift();
                        startAction(agent, agent.currentAction);
                    } else {
                        break;
                    }
                }
                const done = updateAction(agent, agent.currentAction, motionDt);
                if (done) {
                    agent.currentAction = null;
                } else {
                    break;
                }
            }

            // Walk animation
            window.animatePersonWalking(agent.group, motionDt);
        }

        applyCollisions();
        controls.update();
        renderer.render(scene, camera);
        updateHUD();
    }

    animate();
}

if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", startSimulation);
} else {
    startSimulation();
}
