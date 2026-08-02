// sim.js - simulated clock, day/night lighting, agent state machine, render loop, UI
// Uses THREE global. No ES modules.

// === Globals ===
var scene, camera, renderer, controls;
var world, elevator;
var sunLight, ambientLight, hemiLight;
var agents = [];
var MAX_WORKERS = 20;
var MAX_VISITORS = 80;
var MAX_OCCUPANCY = 100;
var targetOccupancy = 45;
var seatReservations = {};
var firstNamePool = [
    'Alex', 'Blake', 'Casey', 'Dana', 'Ellis', 'Finley', 'Gray', 'Harper',
    'Jamie', 'Kai', 'Lane', 'Morgan', 'Nico', 'Ollie', 'Parker', 'Quinn',
    'Riley', 'Sage', 'Taylor', 'Val', 'Wren', 'Avery', 'Bailey', 'Cameron',
    'Drew', 'Emery', 'Frankie', 'Gale', 'Haven', 'Indigo'
];

// === Clock ===
function Clock() {
    this.simMinute = 7 * 60 + 30;
    this.timeScale = 120;
}
Clock.prototype.tick = function(realDt) {
    this.simMinute += realDt * this.timeScale / 60;
    if (this.simMinute >= 24 * 60) {
        this.simMinute -= 24 * 60;
        resetDay();
    }
};
Clock.prototype.format = function() {
    var h = Math.floor(this.simMinute / 60) % 24;
    var m = Math.floor(this.simMinute % 60);
    var ampm = h >= 12 ? 'PM' : 'AM';
    var h12 = h % 12;
    if (h12 === 0) h12 = 12;
    return (h12 < 10 ? ' ' : '') + h12 + ':' + (m < 10 ? '0' : '') + m + ' ' + ampm;
};
var simClock = new Clock();

// === Agent creation ===
function randomRange(a, b) {
    return a + Math.random() * (b - a);
}
function randomInt(a, b) {
    return Math.floor(randomRange(a, b + 1));
}

function createAgent(id, role, deskInfo) {
    var person = window.createPerson({});
    person.visible = false;
    scene.add(person);

    var schedule = rollSchedule(role);

    return {
        id: id,
        role: role,
        name: firstNamePool[id % firstNamePool.length],
        group: person,
        state: 'AWAY',
        homeFloor: deskInfo ? deskInfo.floor : null,
        deskId: deskInfo ? deskInfo.label : null,
        deskWpName: deskInfo ? 'office' + deskInfo.label + '_desk' : null,
        deskDoorWpName: deskInfo ? 'office' + deskInfo.label + '_door' : null,
        hasLunched: false,
        arrivalTime: schedule.arrivalTime,
        lunchTime: schedule.lunchTime,
        lunchDuration: schedule.lunchDuration,
        departureTime: schedule.departureTime,
        plannedMeetingTimes: schedule.plannedMeetingTimes,
        currentAction: null,
        plan: [],
        planPhase: 0,
        currentFloor: 0,
        path: [],
        pathIndex: 0,
        walkPhase: 0,
        sitTarget: null,
        // Per-action state
        _reservedSpot: null,
        _waitUntilMin: 0,
        _prevWalk: null,
        _stallT: 0,
        _enterPhase: 0,
        _toFloor: null
    };
}

function rollSchedule(role) {
    var arrival = randomRange(8 * 60 + 15, 9 * 60 + 30);
    var lunch = randomRange(11 * 60 + 30, 13 * 60 + 30);
    var lunchDur = randomRange(25, 60);
    var departure;
    if (Math.random() < 0.15) {
        departure = randomRange(18 * 60 + 30, 19 * 60 + 45);
    } else {
        departure = randomRange(16 * 60 + 45, 18 * 60 + 30);
    }
    var meetings = [];
    var meetingCount = randomInt(0, 2);
    for (var mi = 0; mi < meetingCount; mi++) {
        var mt;
        if (mi === 0) mt = randomRange(9 * 60 + 30, 11 * 60 + 30);
        else mt = randomRange(13 * 60 + 30, 16 * 60);
        meetings.push(mt);
    }
    meetings.sort();
    return {
        arrivalTime: arrival,
        lunchTime: lunch,
        lunchDuration: lunchDur,
        departureTime: departure,
        plannedMeetingTimes: meetings
    };
}

function createAgentPool() {
    agents = [];
    seatReservations = {};

    // Workers - one per desk across floors 1-5
    var workerDesks = [];
    for (var f = 1; f < WORLD.FLOOR_COUNT; f++) {
        var floorData = world.floors[f];
        if (floorData.desks) {
            for (var di = 0; di < floorData.desks.length; di++) {
                workerDesks.push({
                    floor: f,
                    label: floorData.desks[di].label
                });
            }
        }
    }

    for (var wi = 0; wi < Math.min(MAX_WORKERS, workerDesks.length); wi++) {
        var deskInfo = workerDesks[wi];
        var ag = createAgent(wi, 'WORKER', deskInfo);
        agents.push(ag);
    }

    // Visitors
    for (var vi = 0; vi < MAX_VISITORS; vi++) {
        var vag = createAgent(MAX_WORKERS + vi, 'VISITOR', null);
        vag.state = 'DISABLED';
        vag.group.visible = false;
        agents.push(vag);
    }

    // Apply initial occupancy
    applyOccupancy();
}

// === Seat reservations ===
function reserveSeat(floor, wpName) {
    var key = floor + ':' + wpName;
    if (seatReservations[key]) return false;
    seatReservations[key] = true;
    return true;
}
function releaseSeat(floor, wpName) {
    var key = floor + ':' + wpName;
    delete seatReservations[key];
}

// === Navigation helpers ===
function getFloorData(floorNum) {
    return world.floors[floorNum];
}

function findPath(agent, fromFloor, toFloor, fromWp, toWp) {
    // If same floor, use floor's BFS
    if (fromFloor === toFloor) {
        var fd = getFloorData(fromFloor);
        return world.bfsPath(fromFloor, fromWp, toWp);
    }
    // Different floors: need elevator
    // First, path to elevator on fromFloor
    var fdFrom = getFloorData(fromFloor);
    var pathToElev = world.bfsPath(fromFloor, fromWp, 'elevWait');
    // Then path from elevator on toFloor to destination
    var fdTo = getFloorData(toFloor);
    var pathFromElev = world.bfsPath(toFloor, 'elevWait', toWp);
    return { fromPath: pathToElev, toPath: pathFromElev, toFloor: toFloor };
}

function walkAlongPath(agent, motionDt) {
    if (agent.pathIndex >= agent.path.length) return true;

    var target = agent.path[agent.pathIndex];
    var pos = agent.group.position;
    var dx = target.x - pos.x;
    var dz = target.z - pos.z;
    var targetY = target.y || (agent.currentFloor * WORLD.FLOOR_HEIGHT);
    var dy = targetY - pos.y;
    var dist = Math.sqrt(dx * dx + dz * dz);

    if (dist < 0.2) {
        agent.pathIndex++;
        agent._prevWalk = null;
        agent._stallT = 0;
        if (agent.pathIndex >= agent.path.length) return true;
        target = agent.path[agent.pathIndex];
        dx = target.x - pos.x;
        dz = target.z - pos.z;
        dist = Math.sqrt(dx * dx + dz * dz);
    }

    var speed = 1.3;
    var step = speed * motionDt;
    if (step > dist) step = dist;

    if (dist > 0.001) {
        pos.x += (dx / dist) * step;
        pos.z += (dz / dist) * step;
        agent.group.rotation.y = Math.atan2(dx, dz);
        agent.group.userData.isWalking = true;

        // Stall detection
        if (agent._prevWalk) {
            var moved = Math.sqrt(
                (pos.x - agent._prevWalk.x) * (pos.x - agent._prevWalk.x) +
                (pos.z - agent._prevWalk.z) * (pos.z - agent._prevWalk.z)
            );
            if (moved < 0.005) {
                agent._stallT += motionDt;
                if (agent._stallT > 1.2) {
                    agent.pathIndex++;
                    agent._stallT = 0;
                }
            } else {
                agent._stallT = 0;
            }
        }
        agent._prevWalk = { x: pos.x, z: pos.z };
    }

    if (Math.abs(dy) > 0.01) {
        pos.y += Math.sign(dy) * Math.min(Math.abs(dy), step);
    }

    return false;
}

// === Primitive action handlers ===
function startAction(agent, action) {
    agent.currentAction = action;
    agent.planPhase = 0;
    agent._reservedSpot = null;
    agent._enterPhase = 0;
    agent._prevWalk = null;
    agent._stallT = 0;
    agent._toFloor = action.toFloor || null;

    if (action.type === 'WALK_TO_WP') {
        agent.path = world.bfsPath(agent.currentFloor, findNearestWp(agent), action.wpName);
        agent.pathIndex = 0;
    }
    if (action.type === 'ENTER_STATE') {
        agent.state = action.newState;
    }
    if (action.type === 'MARK_LUNCHED') {
        agent.hasLunched = true;
    }
    if (action.type === 'WAIT_SIM') {
        agent._waitUntilMin = simClock.simMinute + action.minutes;
    }
    if (action.type === 'EXIT_BUILDING') {
        agent.group.visible = false;
        agent.state = 'GONE';
    }
    if (action.type === 'SIT') {
        var fd = getFloorData(agent.currentFloor);
        var wp = fd.nodes[action.wpName];
        if (wp) {
            agent.group.position.set(wp[0], wp[1], wp[2]);
            var st = fd.sitTargets[action.wpName];
            if (st) {
                agent.group.rotation.y = st.facing || 0;
                if (st.sit) {
                    agent.group.userData.isSitting = true;
                    agent.group.position.y -= 0.35;
                }
            }
        }
    }
    if (action.type === 'STAND') {
        agent.group.userData.isSitting = false;
        agent.group.position.y = agent.currentFloor * WORLD.FLOOR_HEIGHT;
    }
    if (action.type === 'RELEASE_SEAT') {
        releaseSeat(agent.currentFloor, action.wpName);
    }
    if (action.type === 'PRESS_FLOOR') {
        elevator.pressDestination(action.floor);
    }
    if (action.type === 'PICK_NEXT_ACTIVITY') {
        chooseNextActivity(agent);
        return;
    }
}

function findNearestWp(agent) {
    var fd = getFloorData(agent.currentFloor);
    var nodes = fd.nodes;
    var pos = agent.group.position;
    var nearest = null;
    var nearestD = Infinity;
    for (var name in nodes) {
        var n = nodes[name];
        var d = Math.sqrt(
            (n[0] - pos.x) * (n[0] - pos.x) +
            (n[2] - pos.z) * (n[2] - pos.z)
        );
        if (d < nearestD) {
            nearestD = d;
            nearest = name;
        }
    }
    return nearest || 'elevWait';
}

function tickAction(agent, motionDt) {
    var action = agent.currentAction;
    if (!action) return true;

    switch (action.type) {
        case 'WALK_TO_WP':
            if (walkAlongPath(agent, motionDt)) {
                return true;
            }
            return false;

        case 'WAIT_AT_PANEL': {
            var dir = action.dir;
            if (dir > 0) elevator.callUp(agent.currentFloor);
            else elevator.callDown(agent.currentFloor);
            agent.state = 'WAITING_ELEVATOR';
            if (elevator.isAcceptingAt(agent.currentFloor, dir) && elevator.currentCapacityFree() > 0) {
                return true;
            }
            return false;
        }

        case 'ENTER_ELEVATOR': {
            var toFloor = agent._toFloor || action.toFloor;
            agent.state = 'IN_CAR';

            if (agent._enterPhase === 0) {
                // Reserve spot
                agent._reservedSpot = elevator.reserveBoardingSpot(agent.id);
                if (!agent._reservedSpot) {
                    // Re-press call
                    var adir = toFloor > agent.currentFloor ? 1 : -1;
                    if (adir > 0) elevator.callUp(agent.currentFloor);
                    else elevator.callDown(agent.currentFloor);
                    return false;
                }
                agent._enterPhase = 1;
                // Target the door threshold at this agent's spot x
                agent._doorTarget = new THREE.Vector3(
                    agent._reservedSpot.x,
                    elevator.carGroup.position.y - WORLD.FLOOR_HEIGHT / 2,
                    elevator.carGroup.position.z - WORLD.SHAFT_DEPTH / 2 - 0.5
                );
                agent._prevWalk = null;
                agent._stallT = 0;
            }

            if (agent._enterPhase === 1) {
                // Walk to door threshold
                var target = agent._doorTarget;
                var pos = agent.group.position;
                var dx = target.x - pos.x;
                var dz = target.z - pos.z;
                var dist = Math.sqrt(dx * dx + dz * dz);
                var speed = 1.3;
                var step = speed * motionDt;

                if (dist < 0.3) {
                    agent._enterPhase = 2;
                    // Reparent to car
                    var worldPos = agent.group.position.clone();
                    elevator.carGroup.add(agent.group);
                    agent.group.position.copy(
                        elevator.carGroup.worldToLocal(worldPos)
                    );
                    agent.group.position.y = 0;
                    agent._prevWalk = null;
                    agent._stallT = 0;
                } else {
                    if (step > dist) step = dist;
                    pos.x += (dx / dist) * step;
                    pos.z += (dz / dist) * step;
                    agent.group.rotation.y = Math.atan2(dx, dz);
                    agent.group.userData.isWalking = true;

                    // Stall recovery
                    if (agent._prevWalk) {
                        var moved = Math.sqrt(
                            (pos.x - agent._prevWalk.x) * (pos.x - agent._prevWalk.x) +
                            (pos.z - agent._prevWalk.z) * (pos.z - agent._prevWalk.z)
                        );
                        if (moved < 0.005) {
                            agent._stallT += motionDt;
                            if (agent._stallT > 1.5) {
                                pos.x = target.x;
                                pos.z = target.z;
                                agent._enterPhase = 2;
                                var wp2 = agent.group.position.clone();
                                elevator.carGroup.add(agent.group);
                                agent.group.position.copy(elevator.carGroup.worldToLocal(wp2));
                                agent.group.position.y = 0;
                            }
                        } else {
                            agent._stallT = 0;
                        }
                    }
                    agent._prevWalk = { x: pos.x, z: pos.z };
                    return false;
                }
            }

            if (agent._enterPhase === 2) {
                // Walk to interior spot
                var spot = agent._reservedSpot;
                var lx = agent.group.position.x;
                var lz = agent.group.position.z;
                var sx = spot.x, sz = spot.z;
                var d2 = Math.sqrt((sx - lx) * (sx - lx) + (sz - lz) * (sz - lz));
                if (d2 < 0.15) {
                    agent.group.position.set(sx, spot.y, sz);
                    agent.group.rotation.y = 0;
                    agent.group.userData.isWalking = false;
                    elevator.completeBoard(agent.id);
                    return true;
                }
                var sp = 0.8 * motionDt;
                if (sp > d2) sp = d2;
                agent.group.position.x += ((sx - lx) / d2) * sp;
                agent.group.position.z += ((sz - lz) / d2) * sp;
                agent.group.userData.isWalking = true;
                return false;
            }
            return false;
        }

        case 'EXIT_ELEVATOR': {
            var toFloor = agent._toFloor || action.toFloor;
            agent.state = 'ON_FLOOR';
            agent.currentFloor = toFloor;

            if (agent._enterPhase === 0) {
                elevator.registerDisembark(agent.id);
                agent._enterPhase = 1;
                // Compute exit target in world space
                var localPos = agent.group.position.clone();
                var worldPos = elevator.carGroup.localToWorld(localPos);
                elevator.carGroup.remove(agent.group);
                agent.group.position.copy(worldPos);
                agent.group.position.y = toFloor * WORLD.FLOOR_HEIGHT;
                agent._exitTarget = new THREE.Vector3(0, toFloor * WORLD.FLOOR_HEIGHT, worldPos.z - 1.5);
                agent._prevWalk = null;
                agent._stallT = 0;
            }

            if (agent._enterPhase === 1) {
                var et = agent._exitTarget;
                var pos = agent.group.position;
                var dx2 = et.x - pos.x;
                var dz2 = et.z - pos.z;
                var d3 = Math.sqrt(dx2 * dx2 + dz2 * dz2);
                if (d3 < 0.3) {
                    elevator.completeDisembark(agent.id);
                    agent._reservedSpot = null;
                    return true;
                }
                var sp2 = 1.3 * motionDt;
                if (sp2 > d3) sp2 = d3;
                pos.x += (dx2 / d3) * sp2;
                pos.z += (dz2 / d3) * sp2;
                agent.group.userData.isWalking = true;
                return false;
            }
            return false;
        }

        case 'WAIT_FOR_FLOOR': {
            var wf = agent._toFloor || action.floor;
            if (elevator.state === 'DOOR_OPEN' && Math.abs(elevator.currentFloor - wf) < 0.01) {
                return true;
            }
            return false;
        }

        case 'WAIT_SIM': {
            if (simClock.simMinute >= agent._waitUntilMin) {
                return true;
            }
            agent.group.userData.isWalking = false;
            return false;
        }

        case 'SIT':
        case 'STAND':
        case 'PRESS_FLOOR':
        case 'RELEASE_SEAT':
        case 'ENTER_STATE':
        case 'MARK_LUNCHED':
        case 'EXIT_BUILDING':
        case 'PICK_NEXT_ACTIVITY':
            return true;

        default:
            return true;
    }
}

function isZeroDurationAction(type) {
    return type === 'SIT' || type === 'STAND' || type === 'PRESS_FLOOR' ||
        type === 'RELEASE_SEAT' || type === 'ENTER_STATE' || type === 'MARK_LUNCHED' ||
        type === 'EXIT_BUILDING' || type === 'PICK_NEXT_ACTIVITY';
}

// === Plan compilers ===
function planArriveToDesk(agent) {
    return [
        { type: 'WALK_TO_WP', wpName: 'front_door_threshold' },
        { type: 'WALK_TO_WP', wpName: 'entrance' },
        { type: 'WALK_TO_WP', wpName: 'lobby_center' },
        { type: 'WAIT_AT_PANEL', dir: 1, toFloor: agent.homeFloor },
        { type: 'ENTER_ELEVATOR', toFloor: agent.homeFloor },
        { type: 'PRESS_FLOOR', floor: agent.homeFloor },
        { type: 'WAIT_FOR_FLOOR', floor: agent.homeFloor },
        { type: 'EXIT_ELEVATOR', toFloor: agent.homeFloor },
        { type: 'WALK_TO_WP', wpName: agent.deskDoorWpName },
        { type: 'STAND' },
        { type: 'WALK_TO_WP', wpName: agent.deskWpName },
        { type: 'SIT', wpName: agent.deskWpName },
        { type: 'ENTER_STATE', newState: 'AT_DESK' },
        { type: 'WAIT_SIM', minutes: randomInt(18, 65) },
        { type: 'PICK_NEXT_ACTIVITY' }
    ];
}

function planGoToLunch(agent) {
    return [
        { type: 'STAND' },
        { type: 'WALK_TO_WP', wpName: agent.deskDoorWpName },
        { type: 'WAIT_AT_PANEL', dir: -1, toFloor: 0 },
        { type: 'ENTER_ELEVATOR', toFloor: 0 },
        { type: 'PRESS_FLOOR', floor: 0 },
        { type: 'WAIT_FOR_FLOOR', floor: 0 },
        { type: 'EXIT_ELEVATOR', toFloor: 0 },
        { type: 'WALK_TO_WP', wpName: 'cafe_table0' },
        { type: 'SIT', wpName: 'cafe_table0' },
        { type: 'ENTER_STATE', newState: 'AT_LUNCH' },
        { type: 'WAIT_SIM', minutes: agent.lunchDuration },
        { type: 'MARK_LUNCHED' },
        { type: 'STAND' },
        { type: 'WALK_TO_WP', wpName: 'lobby_center' },
        { type: 'WAIT_AT_PANEL', dir: 1, toFloor: agent.homeFloor },
        { type: 'ENTER_ELEVATOR', toFloor: agent.homeFloor },
        { type: 'PRESS_FLOOR', floor: agent.homeFloor },
        { type: 'WAIT_FOR_FLOOR', floor: agent.homeFloor },
        { type: 'EXIT_ELEVATOR', toFloor: agent.homeFloor },
        { type: 'WALK_TO_WP', wpName: agent.deskDoorWpName },
        { type: 'WALK_TO_WP', wpName: agent.deskWpName },
        { type: 'SIT', wpName: agent.deskWpName },
        { type: 'ENTER_STATE', newState: 'AT_DESK' },
        { type: 'WAIT_SIM', minutes: randomInt(18, 65) },
        { type: 'PICK_NEXT_ACTIVITY' }
    ];
}

function planVisitLounge(agent) {
    return [
        { type: 'STAND' },
        { type: 'WALK_TO_WP', wpName: agent.deskDoorWpName },
        { type: 'WALK_TO_WP', wpName: 'lounge_door' },
        { type: 'WALK_TO_WP', wpName: 'lounge_spot0' },
        { type: 'SIT', wpName: 'lounge_spot0' },
        { type: 'ENTER_STATE', newState: 'AT_BREAK' },
        { type: 'WAIT_SIM', minutes: randomInt(5, 12) },
        { type: 'STAND' },
        { type: 'WALK_TO_WP', wpName: 'lounge_door' },
        { type: 'WALK_TO_WP', wpName: agent.deskDoorWpName },
        { type: 'WALK_TO_WP', wpName: agent.deskWpName },
        { type: 'SIT', wpName: agent.deskWpName },
        { type: 'ENTER_STATE', newState: 'AT_DESK' },
        { type: 'WAIT_SIM', minutes: randomInt(18, 65) },
        { type: 'PICK_NEXT_ACTIVITY' }
    ];
}

function planAttendMeeting(agent) {
    var meetFloor;
    if (Math.random() < 0.65) {
        meetFloor = agent.homeFloor;
    } else {
        meetFloor = randomInt(1, WORLD.FLOOR_COUNT - 1);
    }
    var seatWp = 'conf_seat' + randomInt(0, 3);
    if (!reserveSeat(meetFloor, seatWp)) {
        return planVisitLounge(agent);
    }

    var plan = [];
    plan.push({ type: 'STAND' });
    plan.push({ type: 'WALK_TO_WP', wpName: agent.deskDoorWpName });

    if (meetFloor !== agent.currentFloor) {
        var dir = meetFloor > agent.currentFloor ? 1 : -1;
        plan.push({ type: 'WAIT_AT_PANEL', dir: dir, toFloor: meetFloor });
        plan.push({ type: 'ENTER_ELEVATOR', toFloor: meetFloor });
        plan.push({ type: 'PRESS_FLOOR', floor: meetFloor });
        plan.push({ type: 'WAIT_FOR_FLOOR', floor: meetFloor });
        plan.push({ type: 'EXIT_ELEVATOR', toFloor: meetFloor });
    }
    plan.push({ type: 'WALK_TO_WP', wpName: 'conf_door' });
    plan.push({ type: 'WALK_TO_WP', wpName: seatWp });
    plan.push({ type: 'SIT', wpName: seatWp });
    plan.push({ type: 'ENTER_STATE', newState: 'IN_MEETING' });
    plan.push({ type: 'WAIT_SIM', minutes: randomInt(22, 45) });
    plan.push({ type: 'STAND' });
    plan.push({ type: 'RELEASE_SEAT', wpName: seatWp });

    if (meetFloor !== agent.homeFloor) {
        var rdir = agent.homeFloor > meetFloor ? 1 : -1;
        plan.push({ type: 'WALK_TO_WP', wpName: 'elevWait' });
        plan.push({ type: 'WAIT_AT_PANEL', dir: rdir, toFloor: agent.homeFloor });
        plan.push({ type: 'ENTER_ELEVATOR', toFloor: agent.homeFloor });
        plan.push({ type: 'PRESS_FLOOR', floor: agent.homeFloor });
        plan.push({ type: 'WAIT_FOR_FLOOR', floor: agent.homeFloor });
        plan.push({ type: 'EXIT_ELEVATOR', toFloor: agent.homeFloor });
    }

    plan.push({ type: 'WALK_TO_WP', wpName: agent.deskDoorWpName });
    plan.push({ type: 'WALK_TO_WP', wpName: agent.deskWpName });
    plan.push({ type: 'SIT', wpName: agent.deskWpName });
    plan.push({ type: 'ENTER_STATE', newState: 'AT_DESK' });
    plan.push({ type: 'WAIT_SIM', minutes: randomInt(18, 65) });
    plan.push({ type: 'PICK_NEXT_ACTIVITY' });
    return plan;
}

function planVisitCoworker(agent) {
    var targetWorkers = [];
    for (var ti = 0; ti < agents.length; ti++) {
        var ta = agents[ti];
        if (ta.role === 'WORKER' && ta.state === 'AT_DESK' && ta.id !== agent.id) {
            targetWorkers.push(ta);
        }
    }
    if (targetWorkers.length === 0) {
        return planVisitLounge(agent);
    }
    var coworker = targetWorkers[Math.floor(Math.random() * targetWorkers.length)];

    var plan = [];
    plan.push({ type: 'STAND' });
    plan.push({ type: 'WALK_TO_WP', wpName: agent.deskDoorWpName });

    if (coworker.homeFloor !== agent.currentFloor) {
        var cdir = coworker.homeFloor > agent.currentFloor ? 1 : -1;
        plan.push({ type: 'WAIT_AT_PANEL', dir: cdir, toFloor: coworker.homeFloor });
        plan.push({ type: 'ENTER_ELEVATOR', toFloor: coworker.homeFloor });
        plan.push({ type: 'PRESS_FLOOR', floor: coworker.homeFloor });
        plan.push({ type: 'WAIT_FOR_FLOOR', floor: coworker.homeFloor });
        plan.push({ type: 'EXIT_ELEVATOR', toFloor: coworker.homeFloor });
    }

    plan.push({ type: 'WALK_TO_WP', wpName: coworker.deskDoorWpName });
    plan.push({ type: 'ENTER_STATE', newState: 'VISITING' });
    plan.push({ type: 'WAIT_SIM', minutes: randomInt(6, 18) });

    if (coworker.homeFloor !== agent.homeFloor) {
        var hdir = agent.homeFloor > coworker.homeFloor ? 1 : -1;
        plan.push({ type: 'WALK_TO_WP', wpName: 'elevWait' });
        plan.push({ type: 'WAIT_AT_PANEL', dir: hdir, toFloor: agent.homeFloor });
        plan.push({ type: 'ENTER_ELEVATOR', toFloor: agent.homeFloor });
        plan.push({ type: 'PRESS_FLOOR', floor: agent.homeFloor });
        plan.push({ type: 'WAIT_FOR_FLOOR', floor: agent.homeFloor });
        plan.push({ type: 'EXIT_ELEVATOR', toFloor: agent.homeFloor });
    }

    plan.push({ type: 'WALK_TO_WP', wpName: agent.deskDoorWpName });
    plan.push({ type: 'WALK_TO_WP', wpName: agent.deskWpName });
    plan.push({ type: 'SIT', wpName: agent.deskWpName });
    plan.push({ type: 'ENTER_STATE', newState: 'AT_DESK' });
    plan.push({ type: 'WAIT_SIM', minutes: randomInt(18, 65) });
    plan.push({ type: 'PICK_NEXT_ACTIVITY' });
    return plan;
}

function planLeaveBuilding(agent) {
    return [
        { type: 'STAND' },
        { type: 'WALK_TO_WP', wpName: agent.deskDoorWpName || 'elevWait' },
        { type: 'WAIT_AT_PANEL', dir: -1, toFloor: 0 },
        { type: 'ENTER_ELEVATOR', toFloor: 0 },
        { type: 'PRESS_FLOOR', floor: 0 },
        { type: 'WAIT_FOR_FLOOR', floor: 0 },
        { type: 'EXIT_ELEVATOR', toFloor: 0 },
        { type: 'WALK_TO_WP', wpName: 'lobby_center' },
        { type: 'WALK_TO_WP', wpName: 'entrance' },
        { type: 'WALK_TO_WP', wpName: 'front_door_threshold' },
        { type: 'WALK_TO_WP', wpName: 'outside' },
        { type: 'EXIT_BUILDING' }
    ];
}

function planVisitorVisit(agent) {
    var roll = Math.random();
    var plan = [];

    // Arrive
    plan.push({ type: 'WALK_TO_WP', wpName: 'front_door_threshold' });
    plan.push({ type: 'WALK_TO_WP', wpName: 'entrance' });

    // Jitter spawn position
    agent.group.position.x += (Math.random() - 0.5) * 2.2;
    agent.group.position.z += (Math.random() - 0.5) * 1.5;

    if (roll < 0.10) {
        // Bistro table
        plan.push({ type: 'WALK_TO_WP', wpName: 'cafe_table1' });
        plan.push({ type: 'SIT', wpName: 'cafe_table1' });
        plan.push({ type: 'ENTER_STATE', newState: 'AT_BREAK' });
        plan.push({ type: 'WAIT_SIM', minutes: randomInt(10, 25) });
        plan.push({ type: 'STAND' });
    } else if (roll < 0.16) {
        // Cafe counter
        plan.push({ type: 'WALK_TO_WP', wpName: 'cafe_order' });
        plan.push({ type: 'ENTER_STATE', newState: 'AT_BREAK' });
        plan.push({ type: 'WAIT_SIM', minutes: randomInt(3, 8) });
    } else if (roll < 0.30) {
        // Front lounge
        plan.push({ type: 'WALK_TO_WP', wpName: 'fl_couch' });
        plan.push({ type: 'SIT', wpName: 'fl_couch' });
        plan.push({ type: 'ENTER_STATE', newState: 'AT_BREAK' });
        plan.push({ type: 'WAIT_SIM', minutes: randomInt(10, 25) });
        plan.push({ type: 'STAND' });
    } else if (roll < 0.42) {
        // Back lounge / conversation pit
        var pitWp = 'pit_' + ['N', 'S', 'E', 'W'][randomInt(0, 3)];
        plan.push({ type: 'WALK_TO_WP', wpName: pitWp });
        plan.push({ type: 'SIT', wpName: pitWp });
        plan.push({ type: 'ENTER_STATE', newState: 'AT_BREAK' });
        plan.push({ type: 'WAIT_SIM', minutes: randomInt(10, 20) });
        plan.push({ type: 'STAND' });
    } else if (roll < 0.52) {
        // Reception / kiosk / water cooler
        var lobbyWps = ['reception', 'kiosk', 'lobby_wc_front', 'lobby_wc_back'];
        var lw = lobbyWps[randomInt(0, lobbyWps.length - 1)];
        plan.push({ type: 'WALK_TO_WP', wpName: lw });
        plan.push({ type: 'ENTER_STATE', newState: 'VISITING' });
        plan.push({ type: 'WAIT_SIM', minutes: randomInt(3, 10) });
    } else if (roll < 0.62) {
        // Lobby loiter
        var llWps = ['lobby_stand_center', 'lobby_stand_NE', 'lobby_stand_NW', 'lobby_stand_midE', 'lobby_stand_midW', 'lobby_stand_entry'];
        var ll = llWps[randomInt(0, llWps.length - 1)];
        plan.push({ type: 'WALK_TO_WP', wpName: ll });
        plan.push({ type: 'ENTER_STATE', newState: 'VISITING' });
        plan.push({ type: 'WAIT_SIM', minutes: randomInt(5, 15) });
    } else if (roll < 0.77) {
        // Ride up to office floor lounge
        var upFloor = randomInt(1, WORLD.FLOOR_COUNT - 1);
        plan.push({ type: 'WALK_TO_WP', wpName: 'lobby_center' });
        plan.push({ type: 'WAIT_AT_PANEL', dir: 1, toFloor: upFloor });
        plan.push({ type: 'ENTER_ELEVATOR', toFloor: upFloor });
        plan.push({ type: 'PRESS_FLOOR', floor: upFloor });
        plan.push({ type: 'WAIT_FOR_FLOOR', floor: upFloor });
        plan.push({ type: 'EXIT_ELEVATOR', toFloor: upFloor });
        var olw = 'lounge_spot' + randomInt(0, 2);
        plan.push({ type: 'WALK_TO_WP', wpName: 'lounge_door' });
        plan.push({ type: 'WALK_TO_WP', wpName: olw });
        plan.push({ type: 'SIT', wpName: olw });
        plan.push({ type: 'ENTER_STATE', newState: 'AT_BREAK' });
        plan.push({ type: 'WAIT_SIM', minutes: randomInt(10, 30) });
        plan.push({ type: 'STAND' });
        plan.push({ type: 'WALK_TO_WP', wpName: 'elevWait' });
        plan.push({ type: 'WAIT_AT_PANEL', dir: -1, toFloor: 0 });
        plan.push({ type: 'ENTER_ELEVATOR', toFloor: 0 });
        plan.push({ type: 'PRESS_FLOOR', floor: 0 });
        plan.push({ type: 'WAIT_FOR_FLOOR', floor: 0 });
        plan.push({ type: 'EXIT_ELEVATOR', toFloor: 0 });
    } else {
        // Meeting (external attendee)
        var mf = randomInt(1, WORLD.FLOOR_COUNT - 1);
        var mseat = 'conf_seat' + randomInt(0, 3);
        if (!reserveSeat(mf, mseat)) {
            // Fall back to lobby loiter
            plan.push({ type: 'WALK_TO_WP', wpName: 'lobby_stand_center' });
            plan.push({ type: 'ENTER_STATE', newState: 'VISITING' });
            plan.push({ type: 'WAIT_SIM', minutes: randomInt(5, 15) });
        } else {
            plan.push({ type: 'WALK_TO_WP', wpName: 'lobby_center' });
            plan.push({ type: 'WAIT_AT_PANEL', dir: 1, toFloor: mf });
            plan.push({ type: 'ENTER_ELEVATOR', toFloor: mf });
            plan.push({ type: 'PRESS_FLOOR', floor: mf });
            plan.push({ type: 'WAIT_FOR_FLOOR', floor: mf });
            plan.push({ type: 'EXIT_ELEVATOR', toFloor: mf });
            plan.push({ type: 'WALK_TO_WP', wpName: 'conf_door' });
            plan.push({ type: 'WALK_TO_WP', wpName: mseat });
            plan.push({ type: 'SIT', wpName: mseat });
            plan.push({ type: 'ENTER_STATE', newState: 'IN_MEETING' });
            plan.push({ type: 'WAIT_SIM', minutes: randomInt(15, 35) });
            plan.push({ type: 'STAND' });
            plan.push({ type: 'RELEASE_SEAT', wpName: mseat });
            plan.push({ type: 'WALK_TO_WP', wpName: 'elevWait' });
            plan.push({ type: 'WAIT_AT_PANEL', dir: -1, toFloor: 0 });
            plan.push({ type: 'ENTER_ELEVATOR', toFloor: 0 });
            plan.push({ type: 'PRESS_FLOOR', floor: 0 });
            plan.push({ type: 'WAIT_FOR_FLOOR', floor: 0 });
            plan.push({ type: 'EXIT_ELEVATOR', toFloor: 0 });
        }
    }

    // Exit building
    plan.push({ type: 'WALK_TO_WP', wpName: 'lobby_center' });
    plan.push({ type: 'WALK_TO_WP', wpName: 'entrance' });
    plan.push({ type: 'WALK_TO_WP', wpName: 'front_door_threshold' });
    plan.push({ type: 'WALK_TO_WP', wpName: 'outside' });
    plan.push({ type: 'EXIT_BUILDING' });
    return plan;
}

// === Decision rules ===
function chooseNextActivity(agent) {
    if (agent.role === 'VISITOR') return;

    var now = simClock.simMinute;

    // Past departure time?
    if (now >= agent.departureTime) {
        agent.plan = planLeaveBuilding(agent);
        agent.planPhase = 0;
        startAction(agent, agent.plan[0]);
        return;
    }

    // Planned meeting?
    for (var mi = 0; mi < agent.plannedMeetingTimes.length; mi++) {
        if (agent.plannedMeetingTimes[mi] > 0 && now >= agent.plannedMeetingTimes[mi]) {
            agent.plannedMeetingTimes.splice(mi, 1);
            agent.plan = planAttendMeeting(agent);
            agent.planPhase = 0;
            startAction(agent, agent.plan[0]);
            return;
        }
    }

    // Lunch?
    if (!agent.hasLunched && now >= agent.lunchTime) {
        agent.plan = planGoToLunch(agent);
        agent.planPhase = 0;
        startAction(agent, agent.plan[0]);
        return;
    }

    // Weighted die
    var r = Math.random();
    if (r < 0.14 && Math.random() < 0.4) {
        agent.plan = planAttendMeeting(agent);
    } else if (r < 0.26) {
        agent.plan = planVisitLounge(agent);
    } else if (r < 0.41) {
        agent.plan = planVisitCoworker(agent);
    } else {
        agent.plan = [
            { type: 'WAIT_SIM', minutes: randomInt(18, 65) },
            { type: 'PICK_NEXT_ACTIVITY' }
        ];
    }
    agent.planPhase = 0;
    startAction(agent, agent.plan[0]);
}

// === Collision ===
function applyCollisions(motionDt) {
    var active = [];
    for (var ai = 0; ai < agents.length; ai++) {
        var a = agents[ai];
        if (!a.group.visible || a.state === 'GONE' || a.state === 'DISABLED' || a.state === 'AWAY') continue;
        if (a.group.userData.isSitting) continue;
        if (a.currentAction && a.currentAction.type === 'ENTER_ELEVATOR') continue;
        if (a.group.parent !== scene) continue;
        active.push(a);
    }

    for (var i = 0; i < active.length; i++) {
        for (var j = i + 1; j < active.length; j++) {
            var a1 = active[i], a2 = active[j];
            var dx = a1.group.position.x - a2.group.position.x;
            var dy = a1.group.position.y - a2.group.position.y;
            var dz = a1.group.position.z - a2.group.position.z;
            if (Math.abs(dy) > 1.0) continue;
            var d = Math.sqrt(dx * dx + dz * dz);
            var minD = WORLD.PERSON_R * 2.2;
            if (d < minD && d > 0.0001) {
                var overlap = minD - d;
                var nx = dx / d, nz = dz / d;
                var push = overlap * 0.18;
                a1.group.position.x += nx * push * 0.5;
                a1.group.position.z += nz * push * 0.5;
                a2.group.position.x -= nx * push * 0.5;
                a2.group.position.z -= nz * push * 0.5;
            } else if (d < 0.0001) {
                var angle = Math.random() * Math.PI * 2;
                a1.group.position.x += Math.cos(angle) * 0.1;
                a1.group.position.z += Math.sin(angle) * 0.1;
                a2.group.position.x -= Math.cos(angle) * 0.1;
                a2.group.position.z -= Math.sin(angle) * 0.1;
            }
        }
    }
}

// === Day/night ===
function updateLighting() {
    var hour = simClock.simMinute / 60;
    var sunIntensity, ambientIntensity, hemiIntensity, bgR, bgG, bgB;

    if (hour < 5.5) {
        // Night
        sunIntensity = 0.1;
        ambientIntensity = 0.45;
        hemiIntensity = 0.32;
        bgR = 0.05; bgG = 0.05; bgB = 0.12;
    } else if (hour < 6.0) {
        // Dawn transition
        var t = (hour - 5.5) / 0.5;
        sunIntensity = 0.1 + t * 0.7;
        ambientIntensity = 0.45 + t * 0.1;
        hemiIntensity = 0.32 + t * 0.13;
        bgR = 0.05 + t * 0.15;
        bgG = 0.05 + t * 0.1;
        bgB = 0.12 + t * 0.1;
    } else if (hour < 17.5) {
        // Day
        sunIntensity = 0.8;
        ambientIntensity = 0.55;
        hemiIntensity = 0.45;
        bgR = 0.2; bgG = 0.22; bgB = 0.28;
    } else if (hour < 18.5) {
        // Dusk transition
        var t2 = (hour - 17.5) / 1.0;
        sunIntensity = 0.8 - t2 * 0.7;
        ambientIntensity = 0.55 - t2 * 0.1;
        hemiIntensity = 0.45 - t2 * 0.13;
        bgR = 0.2 - t2 * 0.15;
        bgG = 0.22 - t2 * 0.17;
        bgB = 0.28 - t2 * 0.16;
    } else {
        // Night
        sunIntensity = 0.1;
        ambientIntensity = 0.45;
        hemiIntensity = 0.32;
        bgR = 0.05; bgG = 0.05; bgB = 0.12;
    }

    scene.background = new THREE.Color(bgR, bgG, bgB);
    sunLight.intensity = sunIntensity;
    sunLight.color.setHex(0xffffff);
    ambientLight.intensity = ambientIntensity;
    hemiLight.intensity = hemiIntensity;
}

// === Visitor top-up ===
function topUpVisitors() {
    var now = simClock.simMinute;
    if (now < 7 * 60 || now > 19 * 60) return;

    var present = 0;
    for (var ai = 0; ai < agents.length; ai++) {
        var a = agents[ai];
        if (a.state !== 'AWAY' && a.state !== 'GONE' && a.state !== 'DISABLED') {
            present++;
        }
    }

    var deficit = targetOccupancy - present;
    if (deficit <= 0) return;

    for (var vi = 0; vi < agents.length && deficit > 0; vi++) {
        var v = agents[vi];
        if (v.role !== 'VISITOR') continue;
        if (v.state === 'AWAY' || v.state === 'GONE') {
            if (v.id >= targetOccupancy) continue; // disabled by slider
            v.arrivalTime = now + randomInt(0, 6);
            v.state = 'AWAY';
            v.group.visible = false;
            v.hasLunched = false;
            deficit--;
        }
    }
}

// === Occupancy ===
function applyOccupancy() {
    for (var ai = 0; ai < agents.length; ai++) {
        var a = agents[ai];
        if (a.id < targetOccupancy) {
            if (a.state === 'DISABLED') {
                a.state = 'AWAY';
                a.group.visible = false;
                a.arrivalTime = simClock.simMinute + randomInt(0, 15);
            }
        } else {
            if (a.state !== 'GONE' && a.state !== 'DISABLED') {
                // Don't yank mid-activity; will park on next cycle
                a.state = 'DISABLED';
                a.group.visible = false;
                if (a.group.parent === elevator.carGroup) {
                    elevator.carGroup.remove(a.group);
                    scene.add(a.group);
                    a.group.visible = false;
                }
            }
        }
    }
}

// === Day reset ===
function resetDay() {
    elevator.reset();
    elevator.carGroup.position.set(0, WORLD.FLOOR_HEIGHT / 2, 0);
    seatReservations = {};

    for (var ai = 0; ai < agents.length; ai++) {
        var a = agents[ai];
        // Remove from scene or elevator
        if (a.group.parent === elevator.carGroup) {
            elevator.carGroup.remove(a.group);
            scene.add(a.group);
        }
        a.group.visible = false;
        a.group.userData.isSitting = false;
        a.group.userData.isWalking = false;
        a.group.position.set(0, -100, 0);
        a.group.rotation.y = 0;
        a.currentAction = null;
        a.plan = [];
        a.planPhase = 0;
        a.path = [];
        a.pathIndex = 0;
        a._reservedSpot = null;
        a._enterPhase = 0;

        if (a.id >= targetOccupancy) {
            a.state = 'DISABLED';
        } else {
            // Re-roll schedule
            var sched = rollSchedule(a.role);
            a.arrivalTime = sched.arrivalTime;
            a.lunchTime = sched.lunchTime;
            a.lunchDuration = sched.lunchDuration;
            a.departureTime = sched.departureTime;
            a.plannedMeetingTimes = sched.plannedMeetingTimes;
            a.hasLunched = false;
            a.state = 'AWAY';
        }
    }
}

// === HUD ===
function createHUD() {
    var hud = document.createElement('div');
    hud.id = 'hud';
    hud.style.cssText = 'position:absolute;top:10px;left:10px;color:#fff;font-family:monospace;font-size:14px;background:rgba(0,0,0,0.7);padding:10px;border-radius:6px;z-index:100;pointer-events:none;';
    document.body.appendChild(hud);

    // Speed slider
    var speedContainer = document.createElement('div');
    speedContainer.style.cssText = 'pointer-events:auto;margin-top:8px;';
    var speedLabel = document.createElement('label');
    speedLabel.textContent = 'Speed: 120x';
    speedLabel.style.display = 'block';
    var speedSlider = document.createElement('input');
    speedSlider.type = 'range';
    speedSlider.min = '1';
    speedSlider.max = '600';
    speedSlider.value = '120';
    speedSlider.style.width = '200px';
    speedSlider.addEventListener('input', function() {
        simClock.timeScale = parseInt(speedSlider.value);
        speedLabel.textContent = 'Speed: ' + simClock.timeScale + 'x';
    });
    speedContainer.appendChild(speedLabel);
    speedContainer.appendChild(speedSlider);
    hud.appendChild(speedContainer);

    // Occupancy slider
    var occContainer = document.createElement('div');
    occContainer.style.cssText = 'pointer-events:auto;margin-top:8px;';
    var occLabel = document.createElement('label');
    occLabel.textContent = 'Occupancy: 45 / 100 people';
    occLabel.style.display = 'block';
    var occSlider = document.createElement('input');
    occSlider.type = 'range';
    occSlider.min = '1';
    occSlider.max = '100';
    occSlider.value = '45';
    occSlider.style.width = '200px';
    occSlider.addEventListener('input', function() {
        targetOccupancy = parseInt(occSlider.value);
        occLabel.textContent = 'Occupancy: ' + targetOccupancy + ' / 100 people';
        applyOccupancy();
    });
    occContainer.appendChild(occLabel);
    occContainer.appendChild(occSlider);
    hud.appendChild(occContainer);

    return { hud: hud, timeDisplay: null, stateDisplay: null };
}

function updateHUD(hudData) {
    var hud = document.getElementById('hud');
    if (!hud) return;

    // Update time display
    var timeLine = hud.children[0];
    if (!timeLine || timeLine.tagName !== 'DIV') {
        var td = document.createElement('div');
        td.style.cssText = 'font-size:22px;font-weight:bold;';
        hud.insertBefore(td, hud.firstChild);
        timeLine = td;
    }
    timeLine.textContent = simClock.format();

    // Remove old state display if present
    var stateDiv = hud.querySelector('.state-info');
    if (!stateDiv) {
        stateDiv = document.createElement('div');
        stateDiv.className = 'state-info';
        stateDiv.style.cssText = 'font-size:11px;margin-top:6px;';
        hud.insertBefore(stateDiv, hud.children[1]);
    }

    var counts = {};
    for (var ai = 0; ai < agents.length; ai++) {
        var st = agents[ai].state;
        counts[st] = (counts[st] || 0) + 1;
    }
    var parts = [];
    for (var s in counts) {
        parts.push(s + ':' + counts[s]);
    }

    var elInfo = 'Elev: F' + Math.round(elevator.currentFloor) +
        ' ' + elevator.state +
        ' dir=' + (elevator.direction > 0 ? 'UP' : elevator.direction < 0 ? 'DN' : '--') +
        ' pax=' + elevator.passengers.size +
        ' dest=' + [...elevator.destinations].join(',') +
        ' up=' + [...elevator.upCalls].join(',') +
        ' dn=' + [...elevator.downCalls].join(',');

    stateDiv.textContent = parts.join(' | ') + '\n' + elInfo;
}

var hudData;

// === Render loop ===
var clock = new THREE.Clock();

function processAgent(agent, motionDt) {
    // Spawn check
    if (agent.state === 'AWAY' && simClock.simMinute >= agent.arrivalTime && agent.id < targetOccupancy) {
        agent.state = 'ARRIVING';
        agent.currentFloor = 0;
        agent.group.position.set(0, 0, WORLD.BUILDING_DEPTH / 2 + 2.5);
        // Jitter spawn
        agent.group.position.x += (Math.random() - 0.5) * 2.2;
        agent.group.position.z += (Math.random() - 0.5) * 1.5;
        agent.group.visible = true;
        agent.group.rotation.y = Math.PI;
        scene.add(agent.group);
        agent.group.userData.isWalking = false;
        agent.group.userData.isSitting = false;

        if (agent.role === 'WORKER') {
            agent.plan = planArriveToDesk(agent);
        } else {
            agent.plan = planVisitorVisit(agent);
        }
        agent.planPhase = 0;
        startAction(agent, agent.plan[0]);
    }

    // Departure check for workers
    if (agent.role === 'WORKER' && agent.state !== 'GONE' && agent.state !== 'LEAVING' &&
        agent.state !== 'AWAY' && agent.state !== 'DISABLED') {
        if (simClock.simMinute >= agent.departureTime &&
            agent.state !== 'IN_CAR' &&
            agent.currentAction && agent.currentAction.type !== 'ENTER_ELEVATOR' &&
            agent.currentAction && agent.currentAction.type !== 'EXIT_ELEVATOR') {
            // Only override if not already in leave plan
            var inLeavePlan = false;
            for (var pi = 0; pi < agent.plan.length; pi++) {
                if (agent.plan[pi].type === 'EXIT_BUILDING') { inLeavePlan = true; break; }
            }
            if (!inLeavePlan) {
                agent.state = 'LEAVING';
                agent.plan = planLeaveBuilding(agent);
                agent.planPhase = 0;
                startAction(agent, agent.plan[0]);
            }
        }
    }

    // Action dispatch loop
    if (!agent.currentAction) return;

    for (var loop = 0; loop < 16; loop++) {
        var done = tickAction(agent, motionDt);
        if (!done) break;

        agent.planPhase++;
        if (agent.planPhase >= agent.plan.length) {
            agent.currentAction = null;
            agent.plan = [];
            agent.planPhase = 0;
            break;
        }
        startAction(agent, agent.plan[agent.planPhase]);
        if (!isZeroDurationAction(agent.currentAction.type)) break;
    }
}

function animate() {
    requestAnimationFrame(animate);

    var realDt = Math.min(0.05, clock.getDelta());
    var motionDt = realDt * simClock.timeScale;

    simClock.tick(realDt);
    updateLighting();
    elevator.tick(motionDt);

    topUpVisitors();

    for (var ai = 0; ai < agents.length; ai++) {
        var ag = agents[ai];
        if (ag.state === 'DISABLED' || ag.state === 'AWAY' || ag.state === 'GONE') continue;
        processAgent(ag, motionDt);
        window.animatePersonWalking(ag.group, motionDt);
    }

    applyCollisions(motionDt);
    controls.update();
    renderer.render(scene, camera);
    updateHUD(hudData);
}

// === Start ===
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

    ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
    scene.add(ambientLight);
    hemiLight = new THREE.HemisphereLight(0xbfd7ff, 0x303020, 0.45);
    scene.add(hemiLight);
    sunLight = new THREE.DirectionalLight(0xffffff, 0.9);
    sunLight.position.set(20, 35, 18);
    scene.add(sunLight);

    world = createWorld(scene);
    elevator = new Elevator(scene, world);

    createAgentPool();
    hudData = createHUD();

    window.addEventListener('resize', function() {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    animate();
}

if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', startSimulation);
} else {
    startSimulation();
}
