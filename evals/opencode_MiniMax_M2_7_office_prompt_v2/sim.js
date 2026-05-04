var MAX_WORKERS = 20;
var MAX_VISITORS = 80;
var MAX_OCCUPANCY = MAX_WORKERS + MAX_VISITORS;
var DEFAULT_OCCUPANCY = 45;

var clock = {
    simMinute: 7 * 60 + 30,
    timeScale: 120,

    tick: function(realDt) {
        this.simMinute += realDt * this.timeScale / 60;
        if (this.simMinute >= 24 * 60) {
            this.simMinute -= 24 * 60;
            return true;
        }
        return false;
    },

    format: function() {
        var totalMin = Math.floor(this.simMinute);
        var h = Math.floor(totalMin / 60);
        var m = totalMin % 60;
        var ampm = h >= 12 ? 'PM' : 'AM';
        if (h === 0) h = 12;
        if (h > 12) h -= 12;
        return ' ' + h + ':' + (m < 10 ? '0' : '') + m + ' ' + ampm;
    }
};

var targetOccupancy = DEFAULT_OCCUPANCY;

var STATE = {
    DISABLED: 'DISABLED',
    AWAY: 'AWAY',
    ARRIVING: 'ARRIVING',
    WAITING_ELEVATOR: 'WAITING_ELEVATOR',
    IN_CAR: 'IN_CAR',
    ON_FLOOR: 'ON_FLOOR',
    AT_DESK: 'AT_DESK',
    IN_MEETING: 'IN_MEETING',
    AT_BREAK: 'AT_BREAK',
    AT_LUNCH: 'AT_LUNCH',
    VISITING: 'VISITING',
    LEAVING: 'LEAVING',
    GONE: 'GONE'
};

var agents = [];
var elevator;
var world;
var scene, camera, renderer, controls;
var ambientLight, sunLight, hemiLight;
var hudElement;

function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randFloat(min, max) {
    return Math.random() * (max - min) + min;
}

function sample(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

var NAMES = ['Alice', 'Bob', 'Carol', 'Dave', 'Eve', 'Frank', 'Grace', 'Hank', 'Iris', 'Jack', 'Kate', 'Leo', 'Mia', 'Noah', 'Olivia', 'Pete', 'Quinn', 'Rose', 'Sam', 'Tara', 'Uma', 'Victor', 'Wendy', 'Xander', 'Yuki', 'Zoe', 'Adam', 'Beth', 'Carl', 'Dina', 'Erik', 'Fay', 'Greg', 'Hope', 'Ivan', 'Jade', 'Kris', 'Lia', 'Mark', 'Nora'];

function createAgents() {
    agents = [];
    for (var i = 0; i < MAX_WORKERS; i++) {
        var homeFloor = randInt(1, WORLD.FLOOR_COUNT - 1);
        var deskInfo = world.floors[homeFloor].desks[i % world.floors[homeFloor].desks.length];
        var agent = {
            id: i,
            role: 'WORKER',
            name: sample(NAMES) + ' ' + String.fromCharCode(65 + i),
            homeFloor: homeFloor,
            deskId: i % world.floors[homeFloor].desks.length,
            deskWpName: deskInfo ? deskInfo.deskWp : 'hallN',
            deskDoorWpName: deskInfo ? deskInfo.doorWp : 'hallN',
            group: null,
            state: STATE.DISABLED,
            plan: [],
            currentAction: null,
            arrivalTime: 0,
            lunchTime: 0,
            lunchDuration: 0,
            departureTime: 0,
            hasLunched: false,
            plannedMeetingTimes: [],
            isStraggler: false,
            _prevWp: null,
            _stallT: 0,
            _enterElevatorStallT: 0,
            _enterElevatorPrevX: 0,
            _enterElevatorPrevZ: 0,
            _inCarX: 0,
            _inCarZ: 0
        };
        agents.push(agent);
    }

    for (var i = 0; i < MAX_VISITORS; i++) {
        var agent = {
            id: MAX_WORKERS + i,
            role: 'VISITOR',
            name: sample(NAMES) + ' (V)',
            homeFloor: null,
            deskId: null,
            deskWpName: null,
            deskDoorWpName: null,
            group: null,
            state: STATE.DISABLED,
            plan: [],
            currentAction: null,
            arrivalTime: 0,
            lunchTime: 0,
            lunchDuration: 0,
            departureTime: 0,
            hasLunched: false,
            plannedMeetingTimes: [],
            isStraggler: false,
            _prevWp: null,
            _stallT: 0,
            _enterElevatorStallT: 0,
            _enterElevatorPrevX: 0,
            _enterElevatorPrevZ: 0,
            _inCarX: 0,
            _inCarZ: 0
        };
        agents.push(agent);
    }
}

function assignDailySchedule(agent) {
    if (agent.role === 'WORKER') {
        agent.arrivalTime = 8 * 60 + 15 + randInt(0, 75);
        agent.lunchTime = 11 * 60 + 30 + randInt(0, 120);
        agent.lunchDuration = 25 + randInt(0, 35);
        agent.departureTime = 16 * 60 + 45 + randInt(0, 105);
        agent.isStraggler = Math.random() < 0.15;
        if (agent.isStraggler) {
            agent.departureTime = 18 * 60 + 30 + randInt(0, 75);
        }
        agent.hasLunched = false;
        agent.plannedMeetingTimes = [];
        if (Math.random() < 0.5) {
            agent.plannedMeetingTimes.push(9 * 60 + 30 + randInt(0, 60));
        }
        if (Math.random() < 0.4) {
            agent.plannedMeetingTimes.push(14 * 60 + 30 + randInt(0, 90));
        }
    } else {
        agent.arrivalTime = 8 * 60 + 30 + randInt(0, 120);
        agent.departureTime = agent.arrivalTime + 20 + randInt(0, 60);
    }
}

function initAgent(agent) {
    if (agent.group) {
        scene.remove(agent.group);
    }
    agent.group = createPerson();
    agent.group.position.set(0, 0, 12 + randFloat(-1.1, 1.1));
    agent.group.userData.isWalking = false;
    agent.group.userData.isSitting = false;
    agent.plan = [];
    agent.currentAction = null;
    assignDailySchedule(agent);
}

function countPresent() {
    var count = 0;
    for (var i = 0; i < agents.length; i++) {
        var a = agents[i];
        if (a.state !== STATE.DISABLED && a.state !== STATE.AWAY && a.state !== STATE.GONE) {
            count++;
        }
    }
    return count;
}

function topUpVisitors() {
    var deficit = targetOccupancy - countPresent();
    if (deficit <= 0) return;

    for (var i = 0; i < agents.length && deficit > 0; i++) {
        var a = agents[i];
        if (a.role !== 'VISITOR') continue;
        if (a.state !== STATE.AWAY && a.state !== STATE.GONE) continue;

        a.arrivalTime = clock.simMinute + randInt(0, 6);
        a.departureTime = a.arrivalTime + 20 + randInt(0, 60);
        a.state = STATE.AWAY;
        deficit--;
    }
}

function planArriveToDesk(agent) {
    var homeFloor = agent.homeFloor;
    var deskWp = agent.deskWpName;
    var deskDoorWp = agent.deskDoorWpName;
    var floorNodes = world.floors[homeFloor].nodes;

    var pathToDesk = world.bfsPath(floorNodes, 'elevWait', deskDoorWp);
    var actions = [];

    actions.push({ type: 'WALK_TO_WP', floor: 0, wpName: 'entrance' });
    actions.push({ type: 'WALK_TO_WP', floor: 0, wpName: 'elevWait' });
    actions.push({ type: 'WAIT_AT_PANEL', floor: 0, dir: 1, toFloor: homeFloor });
    actions.push({ type: 'ENTER_ELEVATOR', toFloor: homeFloor });
    actions.push({ type: 'PRESS_FLOOR', floor: homeFloor });
    actions.push({ type: 'WAIT_FOR_FLOOR', floor: homeFloor });
    actions.push({ type: 'EXIT_ELEVATOR', toFloor: homeFloor });

    var pathFromElev = world.bfsPath(floorNodes, 'elevWait', deskDoorWp);
    for (var i = 1; i < pathFromElev.length; i++) {
        var wpName = findWaypointName(floorNodes, pathFromElev[i]);
        if (wpName) {
            actions.push({ type: 'WALK_TO_WP', floor: homeFloor, wpName: wpName });
        }
    }

    actions.push({ type: 'SIT', floor: homeFloor, wpName: deskWp });
    actions.push({ type: 'WAIT_SIM', minutes: 60 + randInt(0, 90) });
    actions.push({ type: 'STAND' });
    actions.push({ type: 'PICK_NEXT_ACTIVITY' });

    return actions;
}

function planGoToLunch(agent) {
    var homeFloor = agent.homeFloor;
    var lunchDuration = agent.lunchDuration;

    var actions = [];
    actions.push({ type: 'STAND' });
    actions.push({ type: 'WALK_TO_WP', floor: homeFloor, wpName: agent.deskDoorWpName });
    actions.push({ type: 'WAIT_AT_PANEL', floor: homeFloor, dir: -1, toFloor: 0 });
    actions.push({ type: 'ENTER_ELEVATOR', toFloor: 0 });
    actions.push({ type: 'PRESS_FLOOR', floor: 0 });
    actions.push({ type: 'WAIT_FOR_FLOOR', floor: 0 });
    actions.push({ type: 'EXIT_ELEVATOR', toFloor: 0 });
    actions.push({ type: 'WALK_TO_WP', floor: 0, wpName: 'bistro0' });
    actions.push({ type: 'SIT', floor: 0, wpName: 'bistro0' });
    actions.push({ type: 'WAIT_SIM', minutes: lunchDuration });
    actions.push({ type: 'STAND' });
    actions.push({ type: 'MARK_LUNCHED' });
    actions.push({ type: 'WALK_TO_WP', floor: 0, wpName: 'elevWait' });
    actions.push({ type: 'WAIT_AT_PANEL', floor: 0, dir: 1, toFloor: homeFloor });
    actions.push({ type: 'ENTER_ELEVATOR', toFloor: homeFloor });
    actions.push({ type: 'PRESS_FLOOR', floor: homeFloor });
    actions.push({ type: 'WAIT_FOR_FLOOR', floor: homeFloor });
    actions.push({ type: 'EXIT_ELEVATOR', toFloor: homeFloor });
    actions.push({ type: 'WALK_TO_WP', floor: homeFloor, wpName: agent.deskWpName });
    actions.push({ type: 'SIT', floor: homeFloor, wpName: agent.deskWpName });
    actions.push({ type: 'WAIT_SIM', minutes: 30 + randInt(0, 30) });
    actions.push({ type: 'STAND' });
    actions.push({ type: 'PICK_NEXT_ACTIVITY' });

    return actions;
}

function planVisitLounge(agent) {
    var homeFloor = agent.homeFloor;
    var loungeSpots = ['lounge_spot0', 'lounge_spot1', 'lounge_spot2'];
    var spot = sample(loungeSpots);

    var actions = [];
    actions.push({ type: 'STAND' });
    actions.push({ type: 'WALK_TO_WP', floor: homeFloor, wpName: agent.deskDoorWpName });
    actions.push({ type: 'WALK_TO_WP', floor: homeFloor, wpName: 'lounge_center' });
    actions.push({ type: 'WALK_TO_WP', floor: homeFloor, wpName: spot });
    actions.push({ type: 'SIT', floor: homeFloor, wpName: spot });
    actions.push({ type: 'WAIT_SIM', minutes: 5 + randInt(0, 7) });
    actions.push({ type: 'STAND' });
    actions.push({ type: 'WALK_TO_WP', floor: homeFloor, wpName: agent.deskWpName });
    actions.push({ type: 'SIT', floor: homeFloor, wpName: agent.deskWpName });
    actions.push({ type: 'PICK_NEXT_ACTIVITY' });

    return actions;
}

function planAttendMeeting(agent) {
    var targetFloor;
    if (Math.random() < 0.65) {
        targetFloor = agent.homeFloor;
    } else {
        targetFloor = randInt(1, WORLD.FLOOR_COUNT - 1);
    }

    var confSeats = ['conf_seat0', 'conf_seat1', 'conf_seat2', 'conf_seat3'];
    var seat = sample(confSeats);

    var actions = [];
    actions.push({ type: 'STAND' });
    actions.push({ type: 'WALK_TO_WP', floor: agent.homeFloor, wpName: agent.deskDoorWpName });

    if (targetFloor !== agent.homeFloor) {
        actions.push({ type: 'WAIT_AT_PANEL', floor: agent.homeFloor, dir: 1, toFloor: targetFloor });
        actions.push({ type: 'ENTER_ELEVATOR', toFloor: targetFloor });
        actions.push({ type: 'PRESS_FLOOR', floor: targetFloor });
        actions.push({ type: 'WAIT_FOR_FLOOR', floor: targetFloor });
        actions.push({ type: 'EXIT_ELEVATOR', toFloor: targetFloor });
    }

    actions.push({ type: 'WALK_TO_WP', floor: targetFloor, wpName: 'conf_door' });
    actions.push({ type: 'WALK_TO_WP', floor: targetFloor, wpName: seat });
    actions.push({ type: 'SIT', floor: targetFloor, wpName: seat });
    actions.push({ type: 'WAIT_SIM', minutes: 22 + randInt(0, 23) });
    actions.push({ type: 'STAND' });
    actions.push({ type: 'RELEASE_SEAT' });

    if (targetFloor !== agent.homeFloor) {
        actions.push({ type: 'WALK_TO_WP', floor: targetFloor, wpName: 'elevWait' });
        actions.push({ type: 'WAIT_AT_PANEL', floor: targetFloor, dir: -1, toFloor: agent.homeFloor });
        actions.push({ type: 'ENTER_ELEVATOR', toFloor: agent.homeFloor });
        actions.push({ type: 'PRESS_FLOOR', floor: agent.homeFloor });
        actions.push({ type: 'WAIT_FOR_FLOOR', floor: agent.homeFloor });
        actions.push({ type: 'EXIT_ELEVATOR', toFloor: agent.homeFloor });
    }

    actions.push({ type: 'WALK_TO_WP', floor: agent.homeFloor, wpName: agent.deskWpName });
    actions.push({ type: 'SIT', floor: agent.homeFloor, wpName: agent.deskWpName });
    actions.push({ type: 'PICK_NEXT_ACTIVITY' });

    return actions;
}

function planVisitCoworker(agent) {
    var targetFloor = agent.homeFloor;
    var coworker = null;
    for (var i = 0; i < agents.length; i++) {
        var a = agents[i];
        if (a !== agent && a.role === 'WORKER' && a.state === STATE.AT_DESK && a.homeFloor === targetFloor) {
            coworker = a;
            break;
        }
    }

    if (!coworker) {
        return planVisitLounge(agent);
    }

    var actions = [];
    actions.push({ type: 'STAND' });
    actions.push({ type: 'WALK_TO_WP', floor: targetFloor, wpName: agent.deskDoorWpName });
    actions.push({ type: 'WALK_TO_WP', floor: targetFloor, wpName: coworker.deskDoorWpName });
    actions.push({ type: 'WAIT_SIM', minutes: 6 + randInt(0, 12) });
    actions.push({ type: 'WALK_TO_WP', floor: targetFloor, wpName: agent.deskWpName });
    actions.push({ type: 'SIT', floor: targetFloor, wpName: agent.deskWpName });
    actions.push({ type: 'PICK_NEXT_ACTIVITY' });

    return actions;
}

function planLeaveBuilding(agent) {
    var actions = [];
    actions.push({ type: 'STAND' });
    actions.push({ type: 'WALK_TO_WP', floor: agent.homeFloor, wpName: agent.deskDoorWpName });
    actions.push({ type: 'WAIT_AT_PANEL', floor: agent.homeFloor, dir: -1, toFloor: 0 });
    actions.push({ type: 'ENTER_ELEVATOR', toFloor: 0 });
    actions.push({ type: 'PRESS_FLOOR', floor: 0 });
    actions.push({ type: 'WAIT_FOR_FLOOR', floor: 0 });
    actions.push({ type: 'EXIT_ELEVATOR', toFloor: 0 });
    actions.push({ type: 'WALK_TO_WP', floor: 0, wpName: 'entrance' });
    actions.push({ type: 'WALK_TO_WP', floor: 0, wpName: 'outside' });
    actions.push({ type: 'EXIT_BUILDING' });
    return actions;
}

function planVisitorVisit(agent) {
    var actions = [];
    var roll = Math.random();

    actions.push({ type: 'WALK_TO_WP', floor: 0, wpName: 'entrance' });
    actions.push({ type: 'WALK_TO_WP', floor: 0, wpName: 'cafe_counter' });

    if (roll < 0.10) {
        actions.push({ type: 'WALK_TO_WP', floor: 0, wpName: 'bistro0' });
        actions.push({ type: 'SIT', floor: 0, wpName: 'bistro0' });
        actions.push({ type: 'WAIT_SIM', minutes: 15 + randInt(0, 20) });
        actions.push({ type: 'STAND' });
    } else if (roll < 0.16) {
        actions.push({ type: 'WAIT_SIM', minutes: 5 + randInt(0, 5) });
    } else if (roll < 0.30) {
        actions.push({ type: 'WALK_TO_WP', floor: 0, wpName: 'lounge_front_N' });
        actions.push({ type: 'SIT', floor: 0, wpName: 'lounge_front_N' });
        actions.push({ type: 'WAIT_SIM', minutes: 15 + randInt(0, 15) });
        actions.push({ type: 'STAND' });
    } else if (roll < 0.42) {
        actions.push({ type: 'WALK_TO_WP', floor: 0, wpName: 'back_lounge_N' });
        actions.push({ type: 'SIT', floor: 0, wpName: 'back_lounge_N' });
        actions.push({ type: 'WAIT_SIM', minutes: 15 + randInt(0, 15) });
        actions.push({ type: 'STAND' });
    } else if (roll < 0.52) {
        actions.push({ type: 'WALK_TO_WP', floor: 0, wpName: 'pit_N' });
        actions.push({ type: 'SIT', floor: 0, wpName: 'pit_N' });
        actions.push({ type: 'WAIT_SIM', minutes: 10 + randInt(0, 10) });
        actions.push({ type: 'STAND' });
    } else if (roll < 0.62) {
        actions.push({ type: 'WALK_TO_WP', floor: 0, wpName: 'reception' });
        actions.push({ type: 'WAIT_SIM', minutes: 5 + randInt(0, 5) });
    } else if (roll < 0.72) {
        actions.push({ type: 'WALK_TO_WP', floor: 0, wpName: 'lobby_stand_center' });
        actions.push({ type: 'WAIT_SIM', minutes: 8 + randInt(0, 8) });
    } else if (roll < 0.87) {
        var targetFloor = randInt(1, WORLD.FLOOR_COUNT - 1);
        actions.push({ type: 'WALK_TO_WP', floor: 0, wpName: 'elevWait' });
        actions.push({ type: 'WAIT_AT_PANEL', floor: 0, dir: 1, toFloor: targetFloor });
        actions.push({ type: 'ENTER_ELEVATOR', toFloor: targetFloor });
        actions.push({ type: 'PRESS_FLOOR', floor: targetFloor });
        actions.push({ type: 'WAIT_FOR_FLOOR', floor: targetFloor });
        actions.push({ type: 'EXIT_ELEVATOR', toFloor: targetFloor });
        actions.push({ type: 'WALK_TO_WP', floor: targetFloor, wpName: 'lounge_spot0' });
        actions.push({ type: 'SIT', floor: targetFloor, wpName: 'lounge_spot0' });
        actions.push({ type: 'WAIT_SIM', minutes: 12 + randInt(0, 15) });
        actions.push({ type: 'STAND' });
        actions.push({ type: 'WALK_TO_WP', floor: targetFloor, wpName: 'elevWait' });
        actions.push({ type: 'WAIT_AT_PANEL', floor: targetFloor, dir: -1, toFloor: 0 });
        actions.push({ type: 'ENTER_ELEVATOR', toFloor: 0 });
        actions.push({ type: 'PRESS_FLOOR', floor: 0 });
        actions.push({ type: 'WAIT_FOR_FLOOR', floor: 0 });
        actions.push({ type: 'EXIT_ELEVATOR', toFloor: 0 });
    } else {
        var targetFloor = randInt(1, WORLD.FLOOR_COUNT - 1);
        var confSeats = ['conf_seat0', 'conf_seat1', 'conf_seat2', 'conf_seat3'];
        var seat = sample(confSeats);
        actions.push({ type: 'WALK_TO_WP', floor: 0, wpName: 'elevWait' });
        actions.push({ type: 'WAIT_AT_PANEL', floor: 0, dir: 1, toFloor: targetFloor });
        actions.push({ type: 'ENTER_ELEVATOR', toFloor: targetFloor });
        actions.push({ type: 'PRESS_FLOOR', floor: targetFloor });
        actions.push({ type: 'WAIT_FOR_FLOOR', floor: targetFloor });
        actions.push({ type: 'EXIT_ELEVATOR', toFloor: targetFloor });
        actions.push({ type: 'WALK_TO_WP', floor: targetFloor, wpName: 'conf_door' });
        actions.push({ type: 'WALK_TO_WP', floor: targetFloor, wpName: seat });
        actions.push({ type: 'SIT', floor: targetFloor, wpName: seat });
        actions.push({ type: 'WAIT_SIM', minutes: 25 + randInt(0, 20) });
        actions.push({ type: 'STAND' });
        actions.push({ type: 'RELEASE_SEAT' });
        actions.push({ type: 'WALK_TO_WP', floor: targetFloor, wpName: 'elevWait' });
        actions.push({ type: 'WAIT_AT_PANEL', floor: targetFloor, dir: -1, toFloor: 0 });
        actions.push({ type: 'ENTER_ELEVATOR', toFloor: 0 });
        actions.push({ type: 'PRESS_FLOOR', floor: 0 });
        actions.push({ type: 'WAIT_FOR_FLOOR', floor: 0 });
        actions.push({ type: 'EXIT_ELEVATOR', toFloor: 0 });
    }

    actions.push({ type: 'WALK_TO_WP', floor: 0, wpName: 'entrance' });
    actions.push({ type: 'WALK_TO_WP', floor: 0, wpName: 'outside' });
    actions.push({ type: 'EXIT_BUILDING' });

    return actions;
}

function chooseNextActivity(agent) {
    if (agent.role === 'WORKER') {
        if (clock.simMinute >= agent.departureTime) {
            return planLeaveBuilding(agent);
        }

        for (var i = 0; i < agent.plannedMeetingTimes.length; i++) {
            if (clock.simMinute >= agent.plannedMeetingTimes[i] - 5 && clock.simMinute <= agent.plannedMeetingTimes[i] + 10) {
                agent.plannedMeetingTimes.splice(i, 1);
                return planAttendMeeting(agent);
            }
        }

        if (!agent.hasLunched && clock.simMinute >= agent.lunchTime - 10) {
            return planGoToLunch(agent);
        }

        var roll = Math.random();
        if (roll < 0.14) {
            return planAttendMeeting(agent);
        } else if (roll < 0.26) {
            return planVisitLounge(agent);
        } else if (roll < 0.41) {
            return planVisitCoworker(agent);
        } else {
            return [{ type: 'WAIT_SIM', minutes: 18 + randInt(0, 47) }, { type: 'PICK_NEXT_ACTIVITY' }];
        }
    } else {
        return planVisitorVisit(agent);
    }
}

function findWaypointName(nodes, vec3) {
    for (var key in nodes) {
        if (nodes.hasOwnProperty(key)) {
            var node = nodes[key];
            if (Math.abs(node.x - vec3.x) < 0.1 && Math.abs(node.y - vec3.y) < 0.1 && Math.abs(node.z - vec3.z) < 0.1) {
                return key;
            }
        }
    }
    return null;
}

function getNodeByName(floorNum, name) {
    return world.floors[floorNum].nodes[name];
}

function startAction(agent, action) {
    if (!action) return;

    switch (action.type) {
        case 'WALK_TO_WP':
            var floorNodes = world.floors[action.floor].nodes;
            var currentPos = agent.group.position;
            var targetWp = floorNodes[action.wpName];
            if (!targetWp) {
                agent.currentAction = null;
                return;
            }
            var fromName = findWaypointName(floorNodes, currentPos) || 'elevWait';
            var path = world.bfsPath(floorNodes, fromName, action.wpName);
            if (path.length === 0) {
                agent.currentAction = null;
                return;
            }
            agent._walkPath = path;
            agent._walkPathIndex = 0;
            agent._prevWp = currentPos.clone();
            agent._stallT = 0;
            agent.state = STATE.ON_FLOOR;
            agent.group.userData.isWalking = true;
            break;

        case 'WAIT_AT_PANEL':
            if (action.dir === 1) {
                elevator.callUp(action.floor);
            } else {
                elevator.callDown(action.floor);
            }
            agent._waitToFloor = action.toFloor;
            agent.state = STATE.WAITING_ELEVATOR;
            break;

        case 'ENTER_ELEVATOR':
            agent._enterToFloor = action.toFloor;
            var spot = elevator.reserveBoardingSpot(agent.id);
            if (!spot) {
                if (action.dir === 1) {
                    elevator.callUp(action.floor);
                } else {
                    elevator.callDown(action.floor);
                }
                return;
            }
            agent._boardingSpot = spot;
            agent._enterElevatorPhase = 'reserve';
            agent._enterElevatorStallT = 0;
            agent._enterElevatorPrevX = agent.group.position.x;
            agent._enterElevatorPrevZ = agent.group.position.z;
            if (action.dir === 1) {
                elevator.callUp(action.floor);
            } else {
                elevator.callDown(action.floor);
            }
            break;

        case 'PRESS_FLOOR':
            elevator.pressDestination(action.floor);
            break;

        case 'WAIT_FOR_FLOOR':
            agent._waitForFloor = action.floor;
            break;

        case 'EXIT_ELEVATOR':
            agent._exitToFloor = action.toFloor;
            elevator.registerDisembark(agent.id);
            break;

        case 'SIT':
            var sitTarget = world.sitTargets[action.wpName];
            if (!sitTarget) {
                agent.currentAction = null;
                return;
            }
            var wp = getNodeByName(action.floor, action.wpName);
            if (!wp) {
                agent.currentAction = null;
                return;
            }
            if (!sitTarget.sit) {
                var jitterR = 0.35 + Math.random() * 0.4;
                var jitterA = Math.random() * Math.PI * 2;
                agent.group.position.set(wp.x + Math.cos(jitterA) * jitterR, wp.y, wp.z + Math.sin(jitterA) * jitterR);
            } else {
                agent.group.position.set(wp.x, wp.y - 0.35, wp.z);
            }
            agent.group.rotation.y = sitTarget.facing.y;
            agent.group.userData.isSitting = true;
            agent.group.userData.isWalking = false;
            agent.state = action.floor === 0 ? STATE.VISITING : STATE.AT_DESK;
            break;

        case 'STAND':
            agent.group.userData.isSitting = false;
            var floorY = agent.group.position.y;
            if (agent.group.parent === elevator.carGroup) {
                floorY = agent._exitToFloor * WORLD.FLOOR_HEIGHT;
            } else {
                floorY = Math.round(floorY / WORLD.FLOOR_HEIGHT) * WORLD.FLOOR_HEIGHT;
            }
            agent.group.position.y = floorY;
            agent.group.userData.isWalking = false;
            break;

        case 'RELEASE_SEAT':
            break;

        case 'WAIT_SIM':
            agent._untilMin = clock.simMinute + action.minutes;
            break;

        case 'MARK_LUNCHED':
            agent.hasLunched = true;
            break;

        case 'PICK_NEXT_ACTIVITY':
            var nextPlan = chooseNextActivity(agent);
            agent.plan = nextPlan;
            agent.currentAction = null;
            break;

        case 'ENTER_STATE':
            agent.state = action.state;
            break;

        case 'EXIT_BUILDING':
            scene.remove(agent.group);
            agent.state = STATE.GONE;
            agent.plan = [];
            agent.currentAction = null;
            break;
    }
}

function updateWalkAlongPath(agent, dt, motionDt) {
    if (!agent._walkPath || agent._walkPathIndex >= agent._walkPath.length) {
        agent.group.userData.isWalking = false;
        agent.currentAction = null;
        return;
    }

    var target = agent._walkPath[agent._walkPathIndex];
    var pos = agent.group.position;
    var dx = target.x - pos.x;
    var dz = target.z - pos.z;
    var dist = Math.sqrt(dx * dx + dz * dz);
    var speed = 1.3;

    if (agent._prevWp) {
        var px = agent._prevWp.x - pos.x;
        var pz = agent._prevWp.z - pos.z;
        var pdist = Math.sqrt(px * px + pz * pz);
        if (pdist < 0.005) {
            agent._stallT += motionDt;
            if (agent._stallT > 1.2) {
                agent._walkPathIndex++;
                agent._stallT = 0;
                if (agent._walkPathIndex < agent._walkPath.length) {
                    agent._prevWp = agent._walkPath[agent._walkPathIndex - 1].clone();
                }
                return;
            }
        } else {
            agent._stallT = 0;
        }
    }

    if (dist < 0.15) {
        agent._prevWp = target.clone();
        agent._walkPathIndex++;
        return;
    }

    var move = speed * motionDt;
    if (move > dist) move = dist;
    agent.group.position.x += (dx / dist) * move;
    agent.group.position.z += (dz / dist) * move;

    if (dx !== 0 || dz !== 0) {
        agent.group.rotation.y = Math.atan2(dx, dz);
    }
}

function updateEnterElevator(agent, dt, motionDt) {
    if (!agent._boardingSpot) return;

    if (agent._enterElevatorPhase === 'reserve') {
        elevator.callUp(0);
        var carFloor = Math.floor(elevator.logic.currentFloor);
        var atFloor = Math.abs(carFloor - 0) < 0.2;
        var doorOpen = elevator.getState() === 'DOOR_OPEN';
        if (atFloor && doorOpen) {
            agent._enterElevatorPhase = 'walkToDoor';
            agent._enterElevatorStallT = 0;
            agent._enterElevatorPrevX = agent.group.position.x;
            agent._enterElevatorPrevZ = agent.group.position.z;
        }
    } else if (agent._enterElevatorPhase === 'walkToDoor') {
        var targetX = agent._boardingSpot.x;
        var targetZ = 1.2;
        var dx = targetX - agent.group.position.x;
        var dz = targetZ - agent.group.position.z;
        var dist = Math.sqrt(dx * dx + dz * dz);

        if (dist < 0.15) {
            agent._enterElevatorPhase = 'reparent';
        } else {
            var move = 1.3 * motionDt;
            if (move > dist) move = dist;
            agent.group.position.x += (dx / dist) * move;
            agent.group.position.z += (dz / dist) * move;

            if (dx !== 0 || dz !== 0) {
                agent.group.rotation.y = Math.atan2(dx, dz);
            }

            var px = agent._enterElevatorPrevX - agent.group.position.x;
            var pz = agent._enterElevatorPrevZ - agent.group.position.z;
            var pdist = Math.sqrt(px * px + pz * pz);
            if (pdist < 0.005) {
                agent._enterElevatorStallT += motionDt;
            } else {
                agent._enterElevatorStallT = 0;
            }
            agent._enterElevatorPrevX = agent.group.position.x;
            agent._enterElevatorPrevZ = agent.group.position.z;

            if (agent._enterElevatorStallT > 1.5) {
                agent.group.position.x = targetX;
                agent.group.position.z = targetZ;
                agent._enterElevatorPhase = 'reparent';
            }
        }
    } else if (agent._enterElevatorPhase === 'reparent') {
        var worldPos = agent.group.position.clone();
        agent.group.parent.remove(agent.group);
        elevator.carGroup.add(agent.group);
        agent.group.position.set(agent._boardingSpot.x, agent._boardingSpot.y, agent._boardingSpot.z);
        agent.state = STATE.IN_CAR;
        elevator.completeBoard(agent.id);
        agent._enterElevatorPhase = 'walkToSpot';
    } else if (agent._enterElevatorPhase === 'walkToSpot') {
        var targetX = agent._boardingSpot.x;
        var targetZ = agent._boardingSpot.z;
        var dx = targetX - agent.group.position.x;
        var dz = targetZ - agent.group.position.z;
        var dist = Math.sqrt(dx * dx + dz * dz);

        if (dist < 0.1) {
            agent.group.position.x = targetX;
            agent.group.position.z = targetZ;
            agent.group.rotation.y = 0;
            agent.currentAction = null;
            agent._enterElevatorPhase = null;
            return;
        }

        var move = 1.3 * motionDt;
        if (move > dist) move = dist;
        agent.group.position.x += (dx / dist) * move;
        agent.group.position.z += (dz / dist) * move;
    }
}

function updateExitElevator(agent, dt, motionDt) {
    var targetFloor = agent._exitToFloor;
    var carFloor = Math.floor(elevator.logic.currentFloor);

    if (agent.group.parent === elevator.carGroup) {
        var worldPos = agent.group.position.clone();
        var localPos = elevator.carGroup.worldToLocal(worldPos);
        agent.group.parent.remove(agent.group);
        scene.add(agent.group);
        agent.group.position.copy(worldPos);
    }

    var floorNodes = world.floors[targetFloor].nodes;
    var targetWp = floorNodes.elevWait;
    if (!targetWp) {
        agent.currentAction = null;
        return;
    }

    var dx = targetWp.x - agent.group.position.x;
    var dz = targetWp.z - agent.group.position.z;
    var dist = Math.sqrt(dx * dx + dz * dz);

    if (dist < 0.15) {
        elevator.completeDisembark(agent.id);
        agent.group.position.y = targetFloor * WORLD.FLOOR_HEIGHT;
        agent.state = STATE.ON_FLOOR;
        agent.currentAction = null;
        return;
    }

    var move = 1.3 * motionDt;
    if (move > dist) move = dist;
    agent.group.position.x += (dx / dist) * move;
    agent.group.position.z += (dz / dist) * move;
    agent.group.userData.isWalking = true;
}

function processAction(agent, dt, motionDt) {
    if (!agent.currentAction) {
        if (agent.plan.length === 0) return false;
        agent.currentAction = agent.plan.shift();
        startAction(agent, agent.currentAction);
        return agent.currentAction !== null;
    }

    var action = agent.currentAction;

    switch (action.type) {
        case 'WALK_TO_WP':
            updateWalkAlongPath(agent, dt, motionDt);
            break;

        case 'WAIT_AT_PANEL':
            var accepting = elevator.isAcceptingAt(action.floor, action.dir);
            if (!accepting) {
                if (action.dir === 1) elevator.callUp(action.floor);
                else elevator.callDown(action.floor);
                break;
            }
            agent.currentAction = null;
            break;

        case 'ENTER_ELEVATOR':
            updateEnterElevator(agent, dt, motionDt);
            break;

        case 'WAIT_FOR_FLOOR':
            var currentFloor = Math.floor(elevator.logic.currentFloor);
            if (currentFloor === action.floor && elevator.getState() === 'DOOR_OPEN') {
                agent.currentAction = null;
            }
            break;

        case 'EXIT_ELEVATOR':
            updateExitElevator(agent, dt, motionDt);
            break;

        case 'WAIT_SIM':
            if (clock.simMinute >= agent._untilMin) {
                agent.currentAction = null;
            }
            break;
    }

    return true;
}

function applyCollisions() {
    for (var i = 0; i < agents.length; i++) {
        var a = agents[i];
        if (a.state === STATE.DISABLED || a.state === STATE.GONE) continue;
        if (a.currentAction && a.currentAction.type === 'ENTER_ELEVATOR') continue;
        if (a.group.parent === elevator.carGroup) continue;
        if (a.group.userData.isSitting) continue;

        for (var j = i + 1; j < agents.length; j++) {
            var b = agents[j];
            if (b.state === STATE.DISABLED || b.state === STATE.GONE) continue;
            if (b.currentAction && b.currentAction.type === 'ENTER_ELEVATOR') continue;
            if (b.group.parent === elevator.carGroup) continue;
            if (b.group.userData.isSitting) continue;

            var ax = a.group.position.x;
            var ay = a.group.position.y;
            var az = a.group.position.z;
            var bx = b.group.position.x;
            var by = b.group.position.y;
            var bz = b.group.position.z;

            var dy = Math.abs(ay - by);
            if (dy > 1.0) continue;

            var dx = ax - bx;
            var dz = az - bz;
            var dist = Math.sqrt(dx * dx + dz * dz);

            if (dist < 0.8 && dist > 1e-6) {
                var push = (0.8 - dist) * 0.18;
                var nx = dx / dist;
                var nz = dz / dist;
                a.group.position.x += nx * push;
                a.group.position.z += nz * push;
                b.group.position.x -= nx * push;
                b.group.position.z -= nz * push;
            } else if (dist < 1e-3) {
                var angle = Math.random() * Math.PI * 2;
                var push = 0.3;
                a.group.position.x += Math.cos(angle) * push;
                a.group.position.z += Math.sin(angle) * push;
            }
        }
    }
}

var DAY_LIGHTING = [
    { hour: 0, bg: 0x111122, sun: 0x333355, si: 0.0, ai: 0.45, hi: 0.32 },
    { hour: 5, bg: 0x111122, sun: 0x333355, si: 0.0, ai: 0.45, hi: 0.32 },
    { hour: 6, bg: 0xff6633, sun: 0xff8844, si: 0.3, ai: 0.5, hi: 0.4 },
    { hour: 6.5, bg: 0xffaa66, sun: 0xffbb66, si: 0.7, ai: 0.55, hi: 0.45 },
    { hour: 7, bg: 0x99aacc, sun: 0xffccaa, si: 0.85, ai: 0.6, hi: 0.5 },
    { hour: 9, bg: 0x7799bb, sun: 0xffffcc, si: 1.0, ai: 0.6, hi: 0.5 },
    { hour: 17, bg: 0x7799bb, sun: 0xffffcc, si: 1.0, ai: 0.6, hi: 0.5 },
    { hour: 17.5, bg: 0xffaa66, sun: 0xffbb66, si: 0.7, ai: 0.55, hi: 0.45 },
    { hour: 18, bg: 0xff6633, sun: 0xff8844, si: 0.3, ai: 0.5, hi: 0.4 },
    { hour: 18.5, bg: 0x222244, sun: 0x444466, si: 0.0, ai: 0.45, hi: 0.32 },
    { hour: 19, bg: 0x111122, sun: 0x333355, si: 0.0, ai: 0.45, hi: 0.32 },
    { hour: 24, bg: 0x111122, sun: 0x333355, si: 0.0, ai: 0.45, hi: 0.32 }
];

function updateLighting() {
    var hour = clock.simMinute / 60;
    var prev = DAY_LIGHTING[0];
    var next = DAY_LIGHTING[1];

    for (var i = 0; i < DAY_LIGHTING.length - 1; i++) {
        if (hour >= DAY_LIGHTING[i].hour && hour < DAY_LIGHTING[i + 1].hour) {
            prev = DAY_LIGHTING[i];
            next = DAY_LIGHTING[i + 1];
            break;
        }
    }

    var t = (hour - prev.hour) / (next.hour - prev.hour);
    if (t < 0) t = 0;
    if (t > 1) t = 1;

    var bgColor = new THREE.Color(prev.bg).lerp(new THREE.Color(next.bg), t);
    scene.background = bgColor;

    var sunColor = new THREE.Color(prev.sun).lerp(new THREE.Color(next.sun), t);
    sunLight.color.copy(sunColor);
    sunLight.intensity = prev.si + (next.si - prev.si) * t;
    ambientLight.intensity = prev.ai + (next.ai - prev.ai) * t;
    hemiLight.intensity = prev.hi + (next.hi - prev.hi) * t;
}

function applyOccupancy() {
    for (var i = 0; i < agents.length; i++) {
        var a = agents[i];
        if (a.id < targetOccupancy) {
            if (a.state === STATE.DISABLED) {
                a.state = STATE.AWAY;
            }
        } else {
            if (a.state !== STATE.AT_DESK && a.state !== STATE.IN_CAR && a.state !== STATE.WAITING_ELEVATOR && a.state !== STATE.ON_FLOOR && a.state !== STATE.IN_MEETING && a.state !== STATE.AT_BREAK && a.state !== STATE.AT_LUNCH && a.state !== STATE.VISITING) {
                a.state = STATE.DISABLED;
            }
        }
    }
}

function updateHUD() {
    if (!hudElement) return;

    var timeStr = clock.format();
    var stateCounts = {};
    for (var key in STATE) {
        stateCounts[STATE[key]] = 0;
    }
    for (var i = 0; i < agents.length; i++) {
        var a = agents[i];
        if (a.state !== STATE.DISABLED && a.state !== STATE.AWAY && a.state !== STATE.GONE) {
            stateCounts[a.state]++;
        }
    }

    var elevState = elevator.getState();
    var elevDir = elevator.getDirection();
    var elevFloor = elevator.getCurrentFloor();
    var elevPassengers = elevator.logic.passengers.size;
    var elevDests = elevator.logic.destinations.size;
    var elevUpCalls = elevator.logic.upCalls.size;
    var elevDownCalls = elevator.logic.downCalls.size;

    hudElement.innerHTML =
        '<div style="font-family:monospace;font-size:14px;color:#aac;color padding:10px;">' +
        '<div style="font-size:24px;font-weight:bold;color:#ffbb22;margin-bottom:8px;">' + timeStr + '</div>' +
        '<div style="margin-bottom:6px;">Speed: ' + clock.timeScale + 'x</div>' +
        '<div style="margin-bottom:6px;">Occupancy: ' + countPresent() + ' / ' + targetOccupancy + '</div>' +
        '<div style="margin-bottom:8px;border-top:1px solid #445;padding-top:8px;">States:</div>' +
        '<div style="font-size:11px;line-height:1.4;">' +
        'AT_DESK:' + stateCounts.AT_DESK + '<br>' +
        'WAITING:' + stateCounts.WAITING_ELEVATOR + '<br>' +
        'IN_CAR:' + stateCounts.IN_CAR + '<br>' +
        'ON_FLOOR:' + stateCounts.ON_FLOOR + '<br>' +
        'IN_MEETING:' + stateCounts.IN_MEETING + '<br>' +
        'AT_BREAK:' + stateCounts.AT_BREAK + '<br>' +
        'VISITING:' + stateCounts.VISITING + '<br>' +
        'AWAY:' + stateCounts.AWAY + '<br>' +
        '</div>' +
        '<div style="margin-top:8px;border-top:1px solid #445;padding-top:8px;">Elevator:</div>' +
        '<div style="font-size:11px;line-height:1.4;">' +
        'Floor:' + Math.floor(elevFloor) + '<br>' +
        'Dir:' + (elevDir === 1 ? '^' : elevDir === -1 ? 'v' : '-') + '<br>' +
        'State:' + elevState + '<br>' +
        'Passengers:' + elevPassengers + '/' + elevator.logic.maxCapacity + '<br>' +
        'Dests:' + elevDests + '<br>' +
        'UpCalls:' + elevUpCalls + '<br>' +
        'DownCalls:' + elevDownCalls + '<br>' +
        '</div>' +
        '</div>';
}

function createUI() {
    var div = document.createElement('div');
    div.style.position = 'absolute';
    div.style.left = '10px';
    div.style.top = '10px';
    div.style.zIndex = '100';
    div.style.background = 'rgba(20,20,40,0.85)';
    div.style.borderRadius = '6px';
    div.style.color = '#aac';
    div.style.fontSize = '12px';
    document.body.appendChild(div);
    hudElement = div;

    var speedDiv = document.createElement('div');
    speedDiv.style.margin = '10px';
    speedDiv.innerHTML = 'Speed: <input type="range" id="speedSlider" min="1" max="600" value="120" style="width:150px;"> <span id="speedVal">120</span>x';
    div.appendChild(speedDiv);

    var occDiv = document.createElement('div');
    occDiv.style.margin = '10px';
    occDiv.innerHTML = 'Occupancy: <input type="range" id="occSlider" min="1" max="100" value="45" style="width:150px;"> <span id="occVal">45</span>';
    div.appendChild(occDiv);

    document.getElementById('speedSlider').addEventListener('input', function(e) {
        var val = parseInt(e.target.value);
        var logVal = Math.round(Math.pow(600, val / 600));
        if (logVal < 1) logVal = 1;
        clock.timeScale = logVal;
        document.getElementById('speedVal').textContent = logVal;
    });

    document.getElementById('occSlider').addEventListener('input', function(e) {
        targetOccupancy = parseInt(e.target.value);
        document.getElementById('occVal').textContent = targetOccupancy;
        applyOccupancy();
    });
}

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111122);
    scene.sortObjects = true;

    camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(28, 24, 28);
    camera.lookAt(0, 12, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.sortObjects = true;
    document.body.appendChild(renderer.domElement);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 12, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.maxDistance = 80;
    controls.update();

    ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
    scene.add(ambientLight);

    sunLight = new THREE.DirectionalLight(0xffffff, 0.0);
    sunLight.position.set(30, 40, 20);
    scene.add(sunLight);

    hemiLight = new THREE.HemisphereLight(0x7799bb, 0x445566, 0.32);
    scene.add(hemiLight);

    world = createWorld(scene);
    elevator = new Elevator(scene, world);

    createAgents();
    createUI();

    for (var i = 0; i < DEFAULT_OCCUPANCY; i++) {
        agents[i].state = STATE.AWAY;
    }

    window.addEventListener('resize', function() {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    animate();
}

function resetDay() {
    elevator.reset();
    for (var i = 0; i < agents.length; i++) {
        var a = agents[i];
        if (a.state !== STATE.DISABLED) {
            if (a.group) scene.remove(a.group);
            a.group = null;
            a.plan = [];
            a.currentAction = null;
            a.state = STATE.AWAY;
            a.hasLunched = false;
            a.plannedMeetingTimes = [];
        }
    }
    applyOccupancy();
}

function animate() {
    requestAnimationFrame(animate);

    var realDt = Math.min(0.05, (typeof clock !== 'undefined' && clock._lastDt) ? clock._lastDt : 0.016);
    if (typeof clock !== 'undefined') clock._lastDt = realDt;

    var dayWrap = clock.tick(realDt);
    if (dayWrap) {
        resetDay();
    }

    updateLighting();

    var motionDt = realDt * clock.timeScale;

    elevator.tick(motionDt);

    for (var iter = 0; iter < 16; iter++) {
        var madeProgress = false;
        for (var i = 0; i < agents.length; i++) {
            var a = agents[i];
            if (a.state === STATE.DISABLED || a.state === STATE.GONE) continue;

            if (a.state === STATE.AWAY) {
                if (clock.simMinute >= a.arrivalTime) {
                    if (!a.group) {
                        initAgent(a);
                        scene.add(a.group);
                    }
                    a.state = STATE.ARRIVING;
                }
            }

            if (a.state === STATE.ARRIVING || a.state === STATE.ON_FLOOR) {
                if (processAction(a, realDt, motionDt)) {
                    madeProgress = true;
                }
            }

            if (a.state === STATE.AT_DESK || a.state === STATE.IN_MEETING || a.state === STATE.AT_BREAK || a.state === STATE.AT_LUNCH || a.state === STATE.VISITING) {
                if (a.plan.length > 0 || a.currentAction) {
                    a.state = STATE.ON_FLOOR;
                    if (processAction(a, realDt, motionDt)) {
                        madeProgress = true;
                    }
                }
            }

            if (a.state === STATE.LEAVING) {
                if (processAction(a, realDt, motionDt)) {
                    madeProgress = true;
                }
            }

            if (a.state === STATE.WAITING_ELEVATOR) {
                var accepting = elevator.isAcceptingAt(0, 1);
                if (accepting) {
                    a.state = STATE.ARRIVING;
                    if (processAction(a, realDt, motionDt)) {
                        madeProgress = true;
                    }
                }
            }

            if (a.state === STATE.IN_CAR) {
                if (processAction(a, realDt, motionDt)) {
                    madeProgress = true;
                }
            }
        }
        if (!madeProgress) break;
    }

    if (clock.simMinute >= agents[i]?.departureTime && agents[i]?.role === 'WORKER' && agents[i]?.state === STATE.AT_DESK) {
    }

    for (var i = 0; i < agents.length; i++) {
        var a = agents[i];
        if (a.state !== STATE.DISABLED && a.state !== STATE.GONE && a.group) {
            animatePersonWalking(a.group, motionDt);
        }
    }

    applyCollisions();

    topUpVisitors();

    controls.update();
    renderer.render(scene, camera);
    updateHUD();
}

if (typeof THREE !== 'undefined') {
    init();
}