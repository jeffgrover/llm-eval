(function() {

var W = window.WORLD;
var MAX_WORKERS = 20;
var MAX_VISITORS = 80;
var MAX_OCCUPANCY = MAX_WORKERS + MAX_VISITORS;
var DEFAULT_OCCUPANCY = 45;
var WALK_SPEED = 1.3;

var FIRST_NAMES = ['Alex','Sam','Jordan','Taylor','Morgan','Casey','Riley','Quinn',
    'Avery','Blake','Cameron','Drew','Emery','Finley','Harper','Jamie',
    'Kendall','Lane','Marley','Parker','Reese','Sage','Skyler','Dana',
    'Ellis','Fran','Gray','Hayden','Ira','Jan','Kit','Lee',
    'Max','Noel','Pat','Ray','Shawn','Teri','Val','Wes',
    'Ash','Burt','Carl','Dion','Eve','Faye','Gene','Hana',
    'Ida','Jo','Kim','Lou','Mel','Nat','Oren','Paz',
    'Red','Sol','Taj','Uma','Vic','Wren','Xan','Yuri','Zoe'];

var states = {
    DISABLED: 'DISABLED', AWAY: 'AWAY', ARRIVING: 'ARRIVING',
    WAITING_ELEVATOR: 'WAITING_ELEVATOR', IN_CAR: 'IN_CAR',
    ON_FLOOR: 'ON_FLOOR', AT_DESK: 'AT_DESK', IN_MEETING: 'IN_MEETING',
    AT_BREAK: 'AT_BREAK', AT_LUNCH: 'AT_LUNCH', VISITING: 'VISITING',
    LEAVING: 'LEAVING', GONE: 'GONE'
};

var actionTypes = {
    WALK_TO_WP: 'WALK_TO_WP',
    WAIT_AT_PANEL: 'WAIT_AT_PANEL',
    ENTER_ELEVATOR: 'ENTER_ELEVATOR',
    PRESS_FLOOR: 'PRESS_FLOOR',
    WAIT_FOR_FLOOR: 'WAIT_FOR_FLOOR',
    EXIT_ELEVATOR: 'EXIT_ELEVATOR',
    SIT: 'SIT',
    STAND: 'STAND',
    RELEASE_SEAT: 'RELEASE_SEAT',
    WAIT_SIM: 'WAIT_SIM',
    EXIT_BUILDING: 'EXIT_BUILDING',
    ENTER_STATE: 'ENTER_STATE',
    MARK_LUNCHED: 'MARK_LUNCHED',
    PICK_NEXT_ACTIVITY: 'PICK_NEXT_ACTIVITY'
};

var seatReservations = new Set();

function reserveSeat(floor, wpName) {
    var key = floor + ':' + wpName;
    if (seatReservations.has(key)) return false;
    seatReservations.add(key);
    return true;
}

function releaseSeat(floor, wpName) {
    var key = floor + ':' + wpName;
    seatReservations.delete(key);
}

function randInt(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
function randFloat(a, b) { return a + Math.random() * (b - a); }
function randChoice(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function Clock() {
    this.simMinute = 7 * 60 + 30;
    this.timeScale = 120;
    this.realAccum = 0;
}

Clock.prototype.tick = function(realDt) {
    this.simMinute += realDt * this.timeScale / 60;
    if (this.simMinute >= 24 * 60) {
        this.simMinute -= 24 * 60;
        return true;
    }
    return false;
};

Clock.prototype.format = function() {
    var h = Math.floor(this.simMinute / 60);
    var m = Math.floor(this.simMinute % 60);
    var ampm = h >= 12 ? 'PM' : 'AM';
    var dh = h > 12 ? h - 12 : (h === 0 ? 12 : h);
    return (dh < 10 ? ' ' : '') + dh + ':' + (m < 10 ? '0' : '') + m + ' ' + ampm;
};

function Agent(id, role) {
    this.id = id;
    this.role = role;
    this.name = randChoice(FIRST_NAMES) + id;
    this.group = null;
    this.state = states.DISABLED;
    this.plan = [];
    this.currentAction = null;
    this.actionIndex = 0;

    this.homeFloor = null;
    this.deskId = null;
    this.deskWpName = null;
    this.deskDoorWpName = null;

    this.arrivalTime = 0;
    this.lunchTime = 0;
    this.lunchDuration = 30;
    this.departureTime = 0;
    this.hasLunched = false;
    this.plannedMeetingTimes = [];

    this.walkPath = [];
    this.walkPathIndex = 0;
    this.walkTarget = null;
    this.walkFloor = 0;

    this.elevatorToFloor = 0;
    this.reservedSpot = null;
    this.boardedSpotIndex = -1;

    this.isSitting = false;
    this.sitDrop = 0;

    this._prevWp = null;
    this._stallT = 0;
    this._prevWalk = null;
    this._stallWalkT = 0;

    this.visitActivity = null;
}

function scheduleWorker(agent) {
    agent.arrivalTime = randInt(8 * 60 + 15, 9 * 60 + 30);
    agent.lunchTime = randInt(11 * 60 + 30, 13 * 60 + 30);
    agent.lunchDuration = randInt(25, 60);
    var isStraggler = Math.random() < 0.15;
    if (isStraggler) {
        agent.departureTime = randInt(18 * 60 + 30, 19 * 60 + 45);
    } else {
        agent.departureTime = randInt(16 * 60 + 45, 18 * 60 + 30);
    }
    var numMeetings = randInt(0, 2);
    agent.plannedMeetingTimes = [];
    for (var i = 0; i < numMeetings; i++) {
        var meetingTime = randInt(9 * 60 + 30, 16 * 60 + 30);
        agent.plannedMeetingTimes.push(meetingTime);
    }
    agent.plannedMeetingTimes.sort(function(a, b) { return a - b; });
    agent.hasLunched = false;
}

function scheduleVisitor(agent) {
    agent.arrivalTime = randInt(8 * 60, 17 * 60);
    agent.visitDuration = randInt(15, 90);
    agent.departureTime = agent.arrivalTime + agent.visitDuration;
    agent.hasLunched = true;
    agent.plannedMeetingTimes = [];
}

function planArriveToDesk(agent) {
    var plan = [];
    var hf = agent.homeFloor;
    if (hf === 0) {
        plan.push({type: actionTypes.WALK_TO_WP, floor: 0, wpName: 'office' + agent.deskId + '_desk'});
        plan.push({type: actionTypes.SIT, floor: 0, wpName: 'office' + agent.deskId + '_desk'});
    } else {
        plan.push({type: actionTypes.WALK_TO_WP, floor: 0, wpName: 'elevWait'});
        plan.push({type: actionTypes.WAIT_AT_PANEL, floor: 0, dir: 1, toFloor: hf});
        plan.push({type: actionTypes.ENTER_ELEVATOR, toFloor: hf});
        plan.push({type: actionTypes.PRESS_FLOOR, floor: hf});
        plan.push({type: actionTypes.WAIT_FOR_FLOOR, floor: hf});
        plan.push({type: actionTypes.EXIT_ELEVATOR, toFloor: hf});
        plan.push({type: actionTypes.WALK_TO_WP, floor: hf, wpName: agent.deskDoorWpName});
        plan.push({type: actionTypes.WALK_TO_WP, floor: hf, wpName: agent.deskWpName});
        plan.push({type: actionTypes.SIT, floor: hf, wpName: agent.deskWpName});
    }
    plan.push({type: actionTypes.WAIT_SIM, minutes: randInt(18, 65)});
    plan.push({type: actionTypes.PICK_NEXT_ACTIVITY});
    return plan;
}

function planGoToLunch(agent) {
    var plan = [];
    var hf = agent.homeFloor;
    plan.push({type: actionTypes.STAND});
    plan.push({type: actionTypes.WALK_TO_WP, floor: hf, wpName: agent.deskDoorWpName});
    if (hf !== 0) {
        plan.push({type: actionTypes.WALK_TO_WP, floor: hf, wpName: 'elevWait'});
        plan.push({type: actionTypes.WAIT_AT_PANEL, floor: hf, dir: -1, toFloor: 0});
        plan.push({type: actionTypes.ENTER_ELEVATOR, toFloor: 0});
        plan.push({type: actionTypes.PRESS_FLOOR, floor: 0});
        plan.push({type: actionTypes.WAIT_FOR_FLOOR, floor: 0});
        plan.push({type: actionTypes.EXIT_ELEVATOR, toFloor: 0});
    }
    var cafeSeats = ['bistro0_c0','bistro0_c1','bistro1_c0','bistro1_c1',
        'bistro2_c0','bistro2_c1','bistro3_c0','bistro3_c1'];
    var seat = randChoice(cafeSeats);
    plan.push({type: actionTypes.WALK_TO_WP, floor: 0, wpName: seat});
    plan.push({type: actionTypes.SIT, floor: 0, wpName: seat});
    plan.push({type: actionTypes.WAIT_SIM, minutes: agent.lunchDuration});
    plan.push({type: actionTypes.STAND});
    plan.push({type: actionTypes.RELEASE_SEAT});
    plan.push({type: actionTypes.MARK_LUNCHED});
    if (hf !== 0) {
        plan.push({type: actionTypes.WALK_TO_WP, floor: 0, wpName: 'elevWait'});
        plan.push({type: actionTypes.WAIT_AT_PANEL, floor: 0, dir: 1, toFloor: hf});
        plan.push({type: actionTypes.ENTER_ELEVATOR, toFloor: hf});
        plan.push({type: actionTypes.PRESS_FLOOR, floor: hf});
        plan.push({type: actionTypes.WAIT_FOR_FLOOR, floor: hf});
        plan.push({type: actionTypes.EXIT_ELEVATOR, toFloor: hf});
    }
    plan.push({type: actionTypes.WALK_TO_WP, floor: hf, wpName: agent.deskDoorWpName});
    plan.push({type: actionTypes.WALK_TO_WP, floor: hf, wpName: agent.deskWpName});
    plan.push({type: actionTypes.SIT, floor: hf, wpName: agent.deskWpName});
    plan.push({type: actionTypes.WAIT_SIM, minutes: randInt(18, 65)});
    plan.push({type: actionTypes.PICK_NEXT_ACTIVITY});
    return plan;
}

function planVisitLounge(agent) {
    var plan = [];
    var hf = agent.homeFloor;
    plan.push({type: actionTypes.STAND});
    var loungeSpots = ['lounge_couch', 'lounge_arm0', 'lounge_arm1'];
    var spot = randChoice(loungeSpots);
    plan.push({type: actionTypes.WALK_TO_WP, floor: hf, wpName: 'lounge_door'});
    plan.push({type: actionTypes.WALK_TO_WP, floor: hf, wpName: spot});
    plan.push({type: actionTypes.SIT, floor: hf, wpName: spot});
    plan.push({type: actionTypes.WAIT_SIM, minutes: randInt(5, 12)});
    plan.push({type: actionTypes.STAND});
    plan.push({type: actionTypes.RELEASE_SEAT});
    plan.push({type: actionTypes.WALK_TO_WP, floor: hf, wpName: agent.deskDoorWpName});
    plan.push({type: actionTypes.WALK_TO_WP, floor: hf, wpName: agent.deskWpName});
    plan.push({type: actionTypes.SIT, floor: hf, wpName: agent.deskWpName});
    plan.push({type: actionTypes.WAIT_SIM, minutes: randInt(18, 65)});
    plan.push({type: actionTypes.PICK_NEXT_ACTIVITY});
    return plan;
}

function planAttendMeeting(agent) {
    var plan = [];
    var hf = agent.homeFloor;
    var meetingFloor = (Math.random() < 0.65) ? hf : randInt(1, W.FLOOR_COUNT - 1);
    plan.push({type: actionTypes.STAND});

    var confSeats = ['conf_seat0','conf_seat1','conf_seat2','conf_seat3'];
    var reserved = false;
    var chosenSeat = null;
    for (var i = 0; i < confSeats.length; i++) {
        if (reserveSeat(meetingFloor, confSeats[i])) {
            chosenSeat = confSeats[i];
            reserved = true;
            break;
        }
    }
    if (!reserved) {
        return planVisitLounge(agent);
    }

    if (meetingFloor !== hf) {
        plan.push({type: actionTypes.WALK_TO_WP, floor: hf, wpName: 'elevWait'});
        plan.push({type: actionTypes.WAIT_AT_PANEL, floor: hf, dir: meetingFloor > hf ? 1 : -1, toFloor: meetingFloor});
        plan.push({type: actionTypes.ENTER_ELEVATOR, toFloor: meetingFloor});
        plan.push({type: actionTypes.PRESS_FLOOR, floor: meetingFloor});
        plan.push({type: actionTypes.WAIT_FOR_FLOOR, floor: meetingFloor});
        plan.push({type: actionTypes.EXIT_ELEVATOR, toFloor: meetingFloor});
    }
    plan.push({type: actionTypes.WALK_TO_WP, floor: meetingFloor, wpName: 'conf_door'});
    plan.push({type: actionTypes.WALK_TO_WP, floor: meetingFloor, wpName: 'conf_center'});
    plan.push({type: actionTypes.WALK_TO_WP, floor: meetingFloor, wpName: chosenSeat});
    plan.push({type: actionTypes.SIT, floor: meetingFloor, wpName: chosenSeat});
    plan.push({type: actionTypes.ENTER_STATE, state: states.IN_MEETING});
    plan.push({type: actionTypes.WAIT_SIM, minutes: randInt(22, 45)});
    plan.push({type: actionTypes.STAND});
    plan.push({type: actionTypes.RELEASE_SEAT});
    if (meetingFloor !== hf) {
        plan.push({type: actionTypes.WALK_TO_WP, floor: meetingFloor, wpName: 'elevWait'});
        plan.push({type: actionTypes.WAIT_AT_PANEL, floor: meetingFloor, dir: hf > meetingFloor ? 1 : -1, toFloor: hf});
        plan.push({type: actionTypes.ENTER_ELEVATOR, toFloor: hf});
        plan.push({type: actionTypes.PRESS_FLOOR, floor: hf});
        plan.push({type: actionTypes.WAIT_FOR_FLOOR, floor: hf});
        plan.push({type: actionTypes.EXIT_ELEVATOR, toFloor: hf});
    }
    plan.push({type: actionTypes.WALK_TO_WP, floor: hf, wpName: agent.deskDoorWpName});
    plan.push({type: actionTypes.WALK_TO_WP, floor: hf, wpName: agent.deskWpName});
    plan.push({type: actionTypes.SIT, floor: hf, wpName: agent.deskWpName});
    plan.push({type: actionTypes.WAIT_SIM, minutes: randInt(18, 65)});
    plan.push({type: actionTypes.PICK_NEXT_ACTIVITY});
    return plan;
}

function planVisitCoworker(agent) {
    var plan = [];
    var hf = agent.homeFloor;
    plan.push({type: actionTypes.STAND});
    var other = null;
    var attempts = 0;
    while (attempts < 20) {
        var candidate = randChoice(allAgents.filter(function(a) {
            return a.role === 'WORKER' && a.id !== agent.id && a.state === states.AT_DESK;
        }));
        if (candidate) { other = candidate; break; }
        attempts++;
    }
    if (!other) {
        return planVisitLounge(agent);
    }
    var targetFloor = other.homeFloor;
    var targetDoor = other.deskDoorWpName;
    if (targetFloor !== hf) {
        plan.push({type: actionTypes.WALK_TO_WP, floor: hf, wpName: 'elevWait'});
        plan.push({type: actionTypes.WAIT_AT_PANEL, floor: hf, dir: targetFloor > hf ? 1 : -1, toFloor: targetFloor});
        plan.push({type: actionTypes.ENTER_ELEVATOR, toFloor: targetFloor});
        plan.push({type: actionTypes.PRESS_FLOOR, floor: targetFloor});
        plan.push({type: actionTypes.WAIT_FOR_FLOOR, floor: targetFloor});
        plan.push({type: actionTypes.EXIT_ELEVATOR, toFloor: targetFloor});
    }
    plan.push({type: actionTypes.WALK_TO_WP, floor: targetFloor, wpName: targetDoor});
    plan.push({type: actionTypes.WAIT_SIM, minutes: randInt(6, 18)});
    if (targetFloor !== hf) {
        plan.push({type: actionTypes.WALK_TO_WP, floor: targetFloor, wpName: 'elevWait'});
        plan.push({type: actionTypes.WAIT_AT_PANEL, floor: targetFloor, dir: hf > targetFloor ? 1 : -1, toFloor: hf});
        plan.push({type: actionTypes.ENTER_ELEVATOR, toFloor: hf});
        plan.push({type: actionTypes.PRESS_FLOOR, floor: hf});
        plan.push({type: actionTypes.WAIT_FOR_FLOOR, floor: hf});
        plan.push({type: actionTypes.EXIT_ELEVATOR, toFloor: hf});
    }
    plan.push({type: actionTypes.WALK_TO_WP, floor: hf, wpName: agent.deskDoorWpName});
    plan.push({type: actionTypes.WALK_TO_WP, floor: hf, wpName: agent.deskWpName});
    plan.push({type: actionTypes.SIT, floor: hf, wpName: agent.deskWpName});
    plan.push({type: actionTypes.WAIT_SIM, minutes: randInt(18, 65)});
    plan.push({type: actionTypes.PICK_NEXT_ACTIVITY});
    return plan;
}

function planLeaveBuilding(agent) {
    var plan = [];
    var hf = agent.homeFloor;
    plan.push({type: actionTypes.STAND});
    if (hf !== 0) {
        plan.push({type: actionTypes.WALK_TO_WP, floor: hf, wpName: 'elevWait'});
        plan.push({type: actionTypes.WAIT_AT_PANEL, floor: hf, dir: -1, toFloor: 0});
        plan.push({type: actionTypes.ENTER_ELEVATOR, toFloor: 0});
        plan.push({type: actionTypes.PRESS_FLOOR, floor: 0});
        plan.push({type: actionTypes.WAIT_FOR_FLOOR, floor: 0});
        plan.push({type: actionTypes.EXIT_ELEVATOR, toFloor: 0});
    }
    plan.push({type: actionTypes.WALK_TO_WP, floor: 0, wpName: 'entrance'});
    plan.push({type: actionTypes.WALK_TO_WP, floor: 0, wpName: 'outside'});
    plan.push({type: actionTypes.EXIT_BUILDING});
    return plan;
}

function planVisitorVisit(agent) {
    var plan = [];
    plan.push({type: actionTypes.WALK_TO_WP, floor: 0, wpName: 'entrance'});
    var r = Math.random();
    var activity, targetFloor = 0;

    if (r < 0.10) {
        activity = 'bistro';
        var bistroSeats = ['bistro0_c0','bistro0_c1','bistro1_c0','bistro1_c1','bistro2_c0','bistro2_c1','bistro3_c0','bistro3_c1'];
        var seat = randChoice(bistroSeats);
        plan.push({type: actionTypes.WALK_TO_WP, floor: 0, wpName: seat});
        plan.push({type: actionTypes.SIT, floor: 0, wpName: seat});
        plan.push({type: actionTypes.WAIT_SIM, minutes: randInt(10, 30)});
        plan.push({type: actionTypes.STAND});
        plan.push({type: actionTypes.RELEASE_SEAT});
    } else if (r < 0.16) {
        activity = 'cafe_counter';
        plan.push({type: actionTypes.WALK_TO_WP, floor: 0, wpName: 'cafe_order'});
        plan.push({type: actionTypes.WAIT_SIM, minutes: randInt(5, 15)});
    } else if (r < 0.30) {
        activity = 'front_lounge';
        var seats = ['frontLounge_arm0','frontLounge_arm1','frontLounge_couch'];
        var seat = randChoice(seats);
        plan.push({type: actionTypes.WALK_TO_WP, floor: 0, wpName: seat});
        plan.push({type: actionTypes.SIT, floor: 0, wpName: seat});
        plan.push({type: actionTypes.WAIT_SIM, minutes: randInt(10, 30)});
        plan.push({type: actionTypes.STAND});
        plan.push({type: actionTypes.RELEASE_SEAT});
    } else if (r < 0.42) {
        activity = 'back_lounge';
        var seats2 = ['backLounge_N','backLounge_S','pit_N','pit_S','pit_E','pit_W'];
        var seat = randChoice(seats2);
        plan.push({type: actionTypes.WALK_TO_WP, floor: 0, wpName: seat});
        plan.push({type: actionTypes.SIT, floor: 0, wpName: seat});
        plan.push({type: actionTypes.WAIT_SIM, minutes: randInt(10, 30)});
        plan.push({type: actionTypes.STAND});
        plan.push({type: actionTypes.RELEASE_SEAT});
    } else if (r < 0.52) {
        activity = 'lobby_stand';
        var stands = ['reception','kiosk','lobby_wc_front','lobby_wc_back',
            'lobby_stand_center','lobby_stand_NE','lobby_stand_NW',
            'lobby_stand_midE','lobby_stand_midW','lobby_stand_entry'];
        var s = randChoice(stands);
        plan.push({type: actionTypes.WALK_TO_WP, floor: 0, wpName: s});
        plan.push({type: actionTypes.SIT, floor: 0, wpName: s});
        plan.push({type: actionTypes.WAIT_SIM, minutes: randInt(5, 15)});
        plan.push({type: actionTypes.STAND});
    } else if (r < 0.62) {
        activity = 'lobby_loiter';
        var stands2 = ['lobby_stand_center','lobby_stand_NE','lobby_stand_NW',
            'lobby_stand_midE','lobby_stand_midW','lobby_stand_entry'];
        var s = randChoice(stands2);
        plan.push({type: actionTypes.WALK_TO_WP, floor: 0, wpName: s});
        plan.push({type: actionTypes.SIT, floor: 0, wpName: s});
        plan.push({type: actionTypes.WAIT_SIM, minutes: randInt(8, 20)});
        plan.push({type: actionTypes.STAND});
    } else if (r < 0.77) {
        activity = 'office_lounge';
        targetFloor = randInt(1, W.FLOOR_COUNT - 1);
        var loungeSeats = ['lounge_couch','lounge_arm0','lounge_arm1'];
        var seat = randChoice(loungeSeats);
        plan.push({type: actionTypes.WALK_TO_WP, floor: 0, wpName: 'elevWait'});
        plan.push({type: actionTypes.WAIT_AT_PANEL, floor: 0, dir: 1, toFloor: targetFloor});
        plan.push({type: actionTypes.ENTER_ELEVATOR, toFloor: targetFloor});
        plan.push({type: actionTypes.PRESS_FLOOR, floor: targetFloor});
        plan.push({type: actionTypes.WAIT_FOR_FLOOR, floor: targetFloor});
        plan.push({type: actionTypes.EXIT_ELEVATOR, toFloor: targetFloor});
        plan.push({type: actionTypes.WALK_TO_WP, floor: targetFloor, wpName: 'lounge_door'});
        plan.push({type: actionTypes.WALK_TO_WP, floor: targetFloor, wpName: 'lounge_center'});
        plan.push({type: actionTypes.WALK_TO_WP, floor: targetFloor, wpName: seat});
        plan.push({type: actionTypes.SIT, floor: targetFloor, wpName: seat});
        plan.push({type: actionTypes.WAIT_SIM, minutes: randInt(10, 30)});
        plan.push({type: actionTypes.STAND});
        plan.push({type: actionTypes.RELEASE_SEAT});
        plan.push({type: actionTypes.WALK_TO_WP, floor: targetFloor, wpName: 'elevWait'});
        plan.push({type: actionTypes.WAIT_AT_PANEL, floor: targetFloor, dir: -1, toFloor: 0});
        plan.push({type: actionTypes.ENTER_ELEVATOR, toFloor: 0});
        plan.push({type: actionTypes.PRESS_FLOOR, floor: 0});
        plan.push({type: actionTypes.WAIT_FOR_FLOOR, floor: 0});
        plan.push({type: actionTypes.EXIT_ELEVATOR, toFloor: 0});
    } else {
        activity = 'meeting';
        targetFloor = randInt(1, W.FLOOR_COUNT - 1);
        var confSeats = ['conf_seat0','conf_seat1','conf_seat2','conf_seat3'];
        var chosenSeat = null;
        for (var i = 0; i < confSeats.length; i++) {
            if (reserveSeat(targetFloor, confSeats[i])) {
                chosenSeat = confSeats[i];
                break;
            }
        }
        if (!chosenSeat) {
            var stands3 = ['lobby_stand_center','lobby_stand_NE','lobby_stand_entry'];
            var s = randChoice(stands3);
            plan.push({type: actionTypes.WALK_TO_WP, floor: 0, wpName: s});
            plan.push({type: actionTypes.SIT, floor: 0, wpName: s});
            plan.push({type: actionTypes.WAIT_SIM, minutes: randInt(10, 25)});
            plan.push({type: actionTypes.STAND});
        } else {
            plan.push({type: actionTypes.WALK_TO_WP, floor: 0, wpName: 'elevWait'});
            plan.push({type: actionTypes.WAIT_AT_PANEL, floor: 0, dir: 1, toFloor: targetFloor});
            plan.push({type: actionTypes.ENTER_ELEVATOR, toFloor: targetFloor});
            plan.push({type: actionTypes.PRESS_FLOOR, floor: targetFloor});
            plan.push({type: actionTypes.WAIT_FOR_FLOOR, floor: targetFloor});
            plan.push({type: actionTypes.EXIT_ELEVATOR, toFloor: targetFloor});
            plan.push({type: actionTypes.WALK_TO_WP, floor: targetFloor, wpName: 'conf_door'});
            plan.push({type: actionTypes.WALK_TO_WP, floor: targetFloor, wpName: 'conf_center'});
            plan.push({type: actionTypes.WALK_TO_WP, floor: targetFloor, wpName: chosenSeat});
            plan.push({type: actionTypes.SIT, floor: targetFloor, wpName: chosenSeat});
            plan.push({type: actionTypes.ENTER_STATE, state: states.IN_MEETING});
            plan.push({type: actionTypes.WAIT_SIM, minutes: randInt(20, 45)});
            plan.push({type: actionTypes.STAND});
            plan.push({type: actionTypes.RELEASE_SEAT});
            plan.push({type: actionTypes.WALK_TO_WP, floor: targetFloor, wpName: 'elevWait'});
            plan.push({type: actionTypes.WAIT_AT_PANEL, floor: targetFloor, dir: -1, toFloor: 0});
            plan.push({type: actionTypes.ENTER_ELEVATOR, toFloor: 0});
            plan.push({type: actionTypes.PRESS_FLOOR, floor: 0});
            plan.push({type: actionTypes.WAIT_FOR_FLOOR, floor: 0});
            plan.push({type: actionTypes.EXIT_ELEVATOR, toFloor: 0});
        }
    }

    plan.push({type: actionTypes.WALK_TO_WP, floor: 0, wpName: 'entrance'});
    plan.push({type: actionTypes.WALK_TO_WP, floor: 0, wpName: 'outside'});
    plan.push({type: actionTypes.EXIT_BUILDING});
    return plan;
}

function chooseNextActivity(agent) {
    var clock = sim.clock;
    if (clock.simMinute >= agent.departureTime) {
        return planLeaveBuilding(agent);
    }
    for (var i = agent.plannedMeetingTimes.length - 1; i >= 0; i--) {
        if (clock.simMinute >= agent.plannedMeetingTimes[i]) {
            agent.plannedMeetingTimes.splice(i, 1);
            return planAttendMeeting(agent);
        }
    }
    if (!agent.hasLunched && clock.simMinute >= agent.lunchTime) {
        return planGoToLunch(agent);
    }
    var r = Math.random();
    if (r < 0.14) {
        return planAttendMeeting(agent);
    } else if (r < 0.26) {
        return planVisitLounge(agent);
    } else if (r < 0.41) {
        return planVisitCoworker(agent);
    } else {
        var plan = [];
        plan.push({type: actionTypes.WAIT_SIM, minutes: randInt(18, 65)});
        plan.push({type: actionTypes.PICK_NEXT_ACTIVITY});
        return plan;
    }
}

var allAgents = [];
var sim = null;

function countPresent() {
    var count = 0;
    for (var i = 0; i < allAgents.length; i++) {
        var a = allAgents[i];
        if (a.state !== states.DISABLED && a.state !== states.AWAY && a.state !== states.GONE) {
            count++;
        }
    }
    return count;
}

function topUpVisitors() {
    var deficit = sim.targetOccupancy - countPresent();
    if (deficit <= 0) return;
    var hour = sim.clock.simMinute / 60;
    if (hour < 7 || hour > 20) return;
    var armed = 0;
    for (var i = 0; i < allAgents.length && armed < deficit; i++) {
        var a = allAgents[i];
        if (a.role !== 'VISITOR') continue;
        if (a.state === states.AWAY || a.state === states.GONE) {
            a.arrivalTime = sim.clock.simMinute + randInt(0, 6);
            a.visitDuration = randInt(15, 90);
            a.departureTime = a.arrivalTime + a.visitDuration;
            a.hasLunched = true;
            a.plannedMeetingTimes = [];
            a.state = states.AWAY;
            a.plan = [];
            a.currentAction = null;
            a.actionIndex = 0;
            armed++;
        }
    }
}

function applyOccupancy() {
    for (var i = 0; i < allAgents.length; i++) {
        var a = allAgents[i];
        if (i < sim.targetOccupancy) {
            if (a.state === states.DISABLED) {
                a.state = states.AWAY;
                a.group.visible = true;
            }
        } else {
            if (a.state === states.DISABLED) continue;
            if (a.state === states.AT_DESK || a.state === states.ON_FLOOR ||
                a.state === states.IN_MEETING || a.state === states.AT_BREAK ||
                a.state === states.AT_LUNCH || a.state === states.VISITING ||
                a.state === states.ARRIVING || a.state === states.LEAVING ||
                a.state === states.WAITING_ELEVATOR || a.state === states.IN_CAR) {
                continue;
            }
            a.state = states.DISABLED;
            if (a.group && a.group.parent) a.group.parent.remove(a.group);
            a.group.visible = false;
        }
    }
}

function getNodePos(floorNum, wpName) {
    var floor = sim.world.floors[floorNum];
    if (!floor || !floor.nodes[wpName]) {
        for (var f = 0; f < sim.world.floors.length; f++) {
            if (sim.world.floors[f].nodes[wpName]) {
                return sim.world.floors[f].nodes[wpName].pos.clone();
            }
        }
        return new THREE.Vector3(0, floorNum * W.FLOOR_HEIGHT, 0);
    }
    return floor.nodes[wpName].pos.clone();
}

function startAction(agent) {
    var act = agent.currentAction;
    if (!act) return;

    switch (act.type) {
        case actionTypes.WALK_TO_WP:
            var fromNode = null;
            var fromWp = null;
            if (agent.walkPath.length > 0 && agent.walkPathIndex < agent.walkPath.length) {
                fromNode = agent.walkPath[agent.walkPathIndex];
            } else {
                fromNode = agent.group.position.clone();
                fromNode.y = 0;
            }
            var floorData = sim.world.floors[act.floor];
            var toPos = getNodePos(act.floor, act.wpName);
            agent.walkPath = sim.world.bfsPath(floorData.nodes, findClosestNode(floorData.nodes, agent.group.position, act.floor), act.wpName);
            agent.walkPathIndex = 0;
            agent.walkFloor = act.floor;
            agent.isSitting = false;
            agent.group.userData.isWalking = true;
            agent.group.userData.isSitting = false;
            break;

        case actionTypes.WAIT_AT_PANEL:
            if (act.dir > 0) {
                sim.elevator.callUp(act.floor);
            } else {
                sim.elevator.callDown(act.floor);
            }
            agent.state = states.WAITING_ELEVATOR;
            break;

        case actionTypes.ENTER_ELEVATOR:
            agent.elevatorToFloor = act.toFloor;
            break;

        case actionTypes.PRESS_FLOOR:
            sim.elevator.pressDestination(act.floor);
            break;

        case actionTypes.WAIT_FOR_FLOOR:
            agent.state = states.IN_CAR;
            break;

        case actionTypes.EXIT_ELEVATOR:
            sim.elevator.registerDisembark(agent);
            break;

        case actionTypes.SIT:
            var floorData = sim.world.floors[act.floor];
            var sitTarget = floorData.sitTargets[act.wpName];
            var targetPos = getNodePos(act.floor, act.wpName);
            if (sitTarget) {
                if (sitTarget.sit) {
                    agent.isSitting = true;
                    agent.sitDrop = 0.35;
                    agent.group.position.y = targetPos.y - agent.sitDrop;
                    agent.group.rotation.y = sitTarget.facing;
                    agent.group.userData.isSitting = true;
                    agent.group.userData.isWalking = false;
                } else {
                    agent.isSitting = false;
                    agent.sitDrop = 0;
                    agent.group.userData.isSitting = false;
                    agent.group.userData.isWalking = false;
                    var jitter = Math.random() * 0.4 + 0.35;
                    var angle = Math.random() * Math.PI * 2;
                    agent.group.position.x = targetPos.x + Math.cos(angle) * jitter;
                    agent.group.position.z = targetPos.z + Math.sin(angle) * jitter;
                    agent.group.position.y = act.floor * W.FLOOR_HEIGHT;
                    agent.group.rotation.y = sitTarget.facing;
                }
            }
            break;

        case actionTypes.STAND:
            agent.isSitting = false;
            agent.sitDrop = 0;
            agent.group.userData.isSitting = false;
            agent.group.userData.isWalking = false;
            if (agent.group.parent && agent.group.parent !== sim.world.buildingGroup) {
                agent.group.position.y = Math.round(agent.group.position.y / W.FLOOR_HEIGHT) * W.FLOOR_HEIGHT;
            } else {
                var floorY = Math.round(agent.group.position.y / W.FLOOR_HEIGHT) * W.FLOOR_HEIGHT;
                if (floorY < 0) floorY = 0;
                agent.group.position.y = floorY;
            }
            break;

        case actionTypes.RELEASE_SEAT:
            break;

        case actionTypes.WAIT_SIM:
            act.untilMin = sim.clock.simMinute + act.minutes;
            break;

        case actionTypes.EXIT_BUILDING:
            if (agent.group.parent) agent.group.parent.remove(agent.group);
            agent.state = states.GONE;
            break;

        case actionTypes.ENTER_STATE:
            agent.state = act.state;
            break;

        case actionTypes.MARK_LUNCHED:
            agent.hasLunched = true;
            break;

        case actionTypes.PICK_NEXT_ACTIVITY:
            if (agent.role === 'WORKER') {
                agent.plan = chooseNextActivity(agent);
            } else {
                agent.plan = planVisitorVisit(agent);
            }
            agent.actionIndex = 0;
            agent.currentAction = agent.plan.length > 0 ? agent.plan[0] : null;
            if (agent.currentAction) startAction(agent);
            break;
    }
}

function findClosestNode(nodes, pos, floorNum) {
    var bestName = null;
    var bestDist = Infinity;
    var floorY = floorNum * W.FLOOR_HEIGHT;
    for (var name in nodes) {
        if (name === '_edges') continue;
        var n = nodes[name];
        var dx = pos.x - n.pos.x;
        var dz = pos.z - n.pos.z;
        var dist = dx * dx + dz * dz;
        if (dist < bestDist) {
            bestDist = dist;
            bestName = name;
        }
    }
    return bestName;
}

function updateAgent(agent, dt) {
    if (agent.state === states.DISABLED || agent.state === states.GONE || agent.state === states.AWAY) return;

    if (agent.plan.length === 0 && agent.role === 'WORKER' && agent.state === states.AT_DESK) {
        agent.plan = chooseNextActivity(agent);
        agent.actionIndex = 0;
        agent.currentAction = agent.plan[0];
        if (agent.currentAction) startAction(agent);
    }

    var maxIter = 16;
    for (var iter = 0; iter < maxIter; iter++) {
        if (!agent.currentAction) {
            if (agent.plan.length > 0 && agent.actionIndex < agent.plan.length) {
                agent.currentAction = agent.plan[agent.actionIndex];
                startAction(agent);
            } else {
                break;
            }
        }

        var act = agent.currentAction;
        var done = false;

        switch (act.type) {
            case actionTypes.WALK_TO_WP:
                done = walkAlongPath(agent, dt);
                if (done) {
                    agent.group.userData.isWalking = false;
                }
                break;
            case actionTypes.WAIT_AT_PANEL:
                if (act.dir > 0) {
                    sim.elevator.callUp(act.floor);
                } else {
                    sim.elevator.callDown(act.floor);
                }
                var canBoard = sim.elevator.isAcceptingAt(act.floor, act.dir) &&
                    sim.elevator.currentCapacityFree() > 0;
                if (canBoard) {
                    done = true;
                }
                break;
            case actionTypes.ENTER_ELEVATOR:
                done = doEnterElevator(agent, dt);
                break;
            case actionTypes.PRESS_FLOOR:
                done = true;
                break;
            case actionTypes.WAIT_FOR_FLOOR:
                if (sim.elevator.state === ElevatorLogic.DOOR_OPEN &&
                    sim.elevator.currentFloor === act.floor) {
                    done = true;
                }
                break;
            case actionTypes.EXIT_ELEVATOR:
                done = doExitElevator(agent, dt);
                break;
            case actionTypes.SIT:
            case actionTypes.STAND:
            case actionTypes.RELEASE_SEAT:
            case actionTypes.ENTER_STATE:
            case actionTypes.MARK_LUNCHED:
                done = true;
                break;
            case actionTypes.WAIT_SIM:
                if (sim.clock.simMinute >= act.untilMin) {
                    done = true;
                }
                break;
            case actionTypes.EXIT_BUILDING:
                done = true;
                break;
            case actionTypes.PICK_NEXT_ACTIVITY:
                done = true;
                break;
        }

        if (done) {
            if (act.type === actionTypes.EXIT_BUILDING) {
                agent.state = states.GONE;
                return;
            }
            if (act.type === actionTypes.ENTER_STATE) {
                agent.state = act.state;
            }
            if (act.type === actionTypes.MARK_LUNCHED) {
                agent.hasLunched = true;
            }
            if (act.type === actionTypes.RELEASE_SEAT && act._floor !== undefined && act._wpName) {
                releaseSeat(act._floor, act._wpName);
            }
            if (act.type === actionTypes.PICK_NEXT_ACTIVITY) {
                continue;
            }
            agent.actionIndex++;
            agent.currentAction = null;
        } else {
            break;
        }
    }
}

function walkAlongPath(agent, dt) {
    if (agent.walkPath.length === 0) return true;
    if (agent.walkPathIndex >= agent.walkPath.length) return true;

    var target = agent.walkPath[agent.walkPathIndex];
    var dx = target.x - agent.group.position.x;
    var dz = target.z - agent.group.position.z;
    var dist = Math.sqrt(dx * dx + dz * dz);

    if (dist < 0.05) {
        agent._stallT = 0;
        agent._prevWp = null;
        agent.walkPathIndex++;
        if (agent.walkPathIndex >= agent.walkPath.length) {
            agent.group.position.x = target.x;
            agent.group.position.z = target.z;
            return true;
        }
        return false;
    }

    if (dist < 0.005 && agent._prevWp) {
        var stallDist = Math.sqrt(
            Math.pow(agent.group.position.x - agent._prevWp.x, 2) +
            Math.pow(agent.group.position.z - agent._prevWp.z, 2)
        );
        if (stallDist < 0.005) {
            agent._stallT += dt;
            if (agent._stallT > 1.2) {
                agent._stallT = 0;
                agent.walkPathIndex++;
                return agent.walkPathIndex >= agent.walkPath.length;
            }
        } else {
            agent._stallT = 0;
        }
    }
    agent._prevWp = agent.group.position.clone();

    var step = WALK_SPEED * dt;
    if (step >= dist) {
        agent.group.position.x = target.x;
        agent.group.position.z = target.z;
        agent.walkPathIndex++;
        return agent.walkPathIndex >= agent.walkPath.length;
    } else {
        agent.group.position.x += (dx / dist) * step;
        agent.group.position.z += (dz / dist) * step;
        if (Math.abs(dx) > 0.01 || Math.abs(dz) > 0.01) {
            agent.group.rotation.y = Math.atan2(dx, dz);
        }
        return false;
    }
}

function doEnterElevator(agent, dt) {
    var elev = sim.elevator;
    var logic = elev.logic;

    if (!agent.reservedSpot) {
        if (!elev.isAcceptingAt(agent.currentAction.floor || 0, agent.elevatorToFloor > elev.currentFloor ? 1 : -1)) {
            var floor = agent.currentAction.floor;
            if (floor === undefined) floor = elev.currentFloor;
            if (agent.elevatorToFloor > floor) {
                elev.callUp(floor);
            } else {
                elev.callDown(floor);
            }
            return false;
        }
        var spot = elev.reserveBoardingSpot(agent);
        if (!spot) {
            var floor = agent.currentAction.floor;
            if (floor === undefined) floor = elev.currentFloor;
            if (agent.elevatorToFloor > floor) {
                elev.callUp(floor);
            } else {
                elev.callDown(floor);
            }
            return false;
        }
        agent.reservedSpot = spot;
        agent.boardedSpotIndex = spot.index;
        agent._enterPhase = 'walkToDoor';
        agent._stallWalkT = 0;
    }

    var carY = elev.group.position.y + 0.15;
    var doorZ = W.SHAFT_DEPTH / 2 - 0.15;
    var targetX = agent.reservedSpot.x !== undefined ? agent.reservedSpot.x * 0.3 : 0;

    if (agent._enterPhase === 'walkToDoor') {
        var doorPos = new THREE.Vector3(targetX, carY, doorZ);
        var dx = doorPos.x - agent.group.position.x;
        var dz = doorPos.z - agent.group.position.z;
        var dist = Math.sqrt(dx * dx + dz * dz);

        if (dist < 0.05) {
            agent._enterPhase = 'walkToSpot';
        } else {
            var step = WALK_SPEED * dt;
            if (step >= dist) {
                agent._enterPhase = 'walkToSpot';
            } else {
                agent.group.position.x += (dx / dist) * step;
                agent.group.position.z += (dz / dist) * step;

                agent._stallWalkT += dt;
                if (agent._stallWalkT > 1.5) {
                    agent.group.position.x = targetX * 0.3;
                    agent.group.position.z = doorZ;
                    agent._enterPhase = 'walkToSpot';
                }
            }
            return false;
        }
    }

    if (agent._enterPhase === 'walkToSpot') {
        var spotPos = elev.getSpotWorldPos(agent.boardedSpotIndex);
        var dx = spotPos.x - agent.group.position.x;
        var dz = spotPos.z - agent.group.position.z;
        var dist = Math.sqrt(dx * dx + dz * dz);

        sim.world.buildingGroup.remove(agent.group);
        elev.group.add(agent.group);
        agent.group.position.set(spotPos.x, spotPos.y, spotPos.z);
        agent.group.rotation.y = Math.PI;
        agent.state = states.IN_CAR;
        elev.completeBoard(agent);
        agent.reservedSpot = null;
        agent._enterPhase = null;
        return true;
    }

    return false;
}

function doExitElevator(agent, dt) {
    var elev = sim.elevator;
    var targetFloor = agent.currentAction.toFloor;
    var floorData = sim.world.floors[targetFloor];
    var waitPos = getNodePos(targetFloor, 'elevWait');

    var worldPos = new THREE.Vector3();
    agent.group.getWorldPosition(worldPos);

    elev.group.remove(agent.group);
    sim.world.buildingGroup.add(agent.group);

    agent.group.position.copy(worldPos);
    agent.group.position.y = targetFloor * W.FLOOR_HEIGHT;

    elev.completeDisembark(agent);

    agent.walkPath = [waitPos];
    agent.walkPathIndex = 0;
    agent.walkFloor = targetFloor;
    agent.state = states.ON_FLOOR;
    agent.isSitting = false;
    agent.group.userData.isWalking = true;
    agent.group.userData.isSitting = false;

    return true;
}

function applyCollisions() {
    var active = [];
    for (var i = 0; i < allAgents.length; i++) {
        var a = allAgents[i];
        if (a.state === states.DISABLED || a.state === states.GONE || a.state === states.AWAY) continue;
        if (a.isSitting) continue;
        if (a.group.parent && a.group.parent !== sim.world.buildingGroup) continue;
        active.push(a);
    }

    for (var i = 0; i < active.length; i++) {
        for (var j = i + 1; j < active.length; j++) {
            var a = active[i];
            var b = active[j];
            if (Math.abs(a.group.position.y - b.group.position.y) > 1.0) continue;

            var dx = b.group.position.x - a.group.position.x;
            var dz = b.group.position.z - a.group.position.z;
            var dist = Math.sqrt(dx * dx + dz * dz);
            var minDist = 0.7;

            if (dist < minDist && dist > 0.001) {
                var push = (minDist - dist) * 0.18;
                var nx = dx / dist;
                var nz = dz / dist;
                a.group.position.x -= nx * push;
                a.group.position.z -= nz * push;
                b.group.position.x += nx * push;
                b.group.position.z += nz * push;
            } else if (dist <= 0.001) {
                var angle = Math.random() * Math.PI * 2;
                var push = 0.3;
                a.group.position.x += Math.cos(angle) * push;
                a.group.position.z += Math.sin(angle) * push;
                b.group.position.x -= Math.cos(angle) * push;
                b.group.position.z -= Math.sin(angle) * push;
            }
        }
    }
}

var dayKeyframes = [
    {h: 0, bg: 0x111122, sun: 0x334455, sunI: 0.1, ambI: 0.45, hemI: 0.32},
    {h: 5, bg: 0x111122, sun: 0x334455, sunI: 0.1, ambI: 0.45, hemI: 0.32},
    {h: 6, bg: 0x884422, sun: 0xff8844, sunI: 0.6, ambI: 0.55, hemI: 0.42},
    {h: 6.5, bg: 0x6688bb, sun: 0xffcc88, sunI: 0.9, ambI: 0.65, hemI: 0.55},
    {h: 7, bg: 0x88aacc, sun: 0xffffff, sunI: 1.2, ambI: 0.7, hemI: 0.6},
    {h: 12, bg: 0x99bbdd, sun: 0xffffff, sunI: 1.3, ambI: 0.75, hemI: 0.65},
    {h: 17, bg: 0x88aacc, sun: 0xffdd88, sunI: 1.1, ambI: 0.7, hemI: 0.6},
    {h: 17.5, bg: 0x886644, sun: 0xff8844, sunI: 0.7, ambI: 0.55, hemI: 0.45},
    {h: 18.5, bg: 0x332244, sun: 0x443366, sunI: 0.2, ambI: 0.45, hemI: 0.35},
    {h: 19, bg: 0x111122, sun: 0x334455, sunI: 0.1, ambI: 0.45, hemI: 0.32},
    {h: 24, bg: 0x111122, sun: 0x334455, sunI: 0.1, ambI: 0.45, hemI: 0.32}
];

function lerpColor(c1, c2, t) {
    var r1 = (c1 >> 16) & 0xff, g1 = (c1 >> 8) & 0xff, b1 = c1 & 0xff;
    var r2 = (c2 >> 16) & 0xff, g2 = (c2 >> 8) & 0xff, b2 = c2 & 0xff;
    var r = Math.round(r1 + (r2 - r1) * t);
    var g = Math.round(g1 + (g2 - g1) * t);
    var b = Math.round(b1 + (b2 - b1) * t);
    return (r << 16) | (g << 8) | b;
}

function updateLighting(scene, clock) {
    var hour = clock.simMinute / 60;
    var k0 = 0, k1 = 1;
    for (var i = 0; i < dayKeyframes.length - 1; i++) {
        if (hour >= dayKeyframes[i].h && hour < dayKeyframes[i + 1].h) {
            k0 = i;
            k1 = i + 1;
            break;
        }
    }
    var f0 = dayKeyframes[k0];
    var f1 = dayKeyframes[k1];
    var t = (f1.h - f0.h) > 0 ? (hour - f0.h) / (f1.h - f0.h) : 0;

    var bg = lerpColor(f0.bg, f1.bg, t);
    scene.background = new THREE.Color(bg);
    sim.sunLight.color = new THREE.Color(lerpColor(f0.sun, f1.sun, t));
    sim.sunLight.intensity = f0.sunI + (f1.sunI - f0.sunI) * t;
    sim.ambLight.intensity = f0.ambI + (f1.ambI - f0.ambI) * t;
    sim.hemiLight.intensity = f0.hemI + (f1.hemI - f0.hemI) * t;
}

function createHUD() {
    var div = document.createElement('div');
    div.style.cssText = 'position:absolute;top:10px;left:10px;color:#eee;font-family:monospace;font-size:13px;background:rgba(0,0,0,0.7);padding:10px;border-radius:6px;z-index:100;min-width:220px;pointer-events:auto;';
    div.innerHTML = '<div id="hud-time" style="font-size:20px;font-weight:bold;margin-bottom:6px;"></div>' +
        '<div id="hud-speed" style="margin-bottom:4px;"></div>' +
        '<div id="hud-occ" style="margin-bottom:6px;"></div>' +
        '<div id="hud-states" style="margin-bottom:6px;font-size:11px;line-height:1.4;"></div>' +
        '<div id="hud-elev" style="font-size:11px;line-height:1.4;"></div>';
    document.body.appendChild(div);

    var sliderDiv = document.createElement('div');
    sliderDiv.style.cssText = 'margin-bottom:6px;';
    sliderDiv.innerHTML = '<label style="font-size:11px;">Speed: <span id="speed-val">120</span>x</label><br>' +
        '<input type="range" id="speed-slider" min="0" max="100" value="70" style="width:180px;">';
    div.insertBefore(sliderDiv, div.children[2]);

    var occDiv = document.createElement('div');
    occDiv.style.cssText = 'margin-bottom:6px;';
    occDiv.innerHTML = '<label style="font-size:11px;">Occupancy: <span id="occ-val">45</span>/100</label><br>' +
        '<input type="range" id="occ-slider" min="1" max="100" value="45" style="width:180px;">';
    div.insertBefore(occDiv, div.children[3]);

    var speedSlider = document.getElementById('speed-slider');
    speedSlider.addEventListener('input', function() {
        var v = parseInt(this.value);
        var t = v / 100;
        sim.clock.timeScale = Math.round(Math.pow(10, Math.log10(1) + t * (Math.log10(600) - Math.log10(1))));
        sim.clock.timeScale = Math.max(1, sim.clock.timeScale);
        document.getElementById('speed-val').textContent = sim.clock.timeScale;
    });

    var occSlider = document.getElementById('occ-slider');
    occSlider.addEventListener('input', function() {
        sim.targetOccupancy = parseInt(this.value);
        document.getElementById('occ-val').textContent = sim.targetOccupancy;
        applyOccupancy();
    });
}

function updateHUD() {
    var timeStr = sim.clock.format();
    document.getElementById('hud-time').textContent = timeStr;

    var counts = {};
    for (var key in states) counts[states[key]] = 0;
    for (var i = 0; i < allAgents.length; i++) {
        var a = allAgents[i];
        if (a.state) counts[a.state] = (counts[a.state] || 0) + 1;
    }

    var stateStr = '';
    var order = [states.ARRIVING, states.WAITING_ELEVATOR, states.IN_CAR,
        states.ON_FLOOR, states.AT_DESK, states.IN_MEETING,
        states.AT_BREAK, states.AT_LUNCH, states.VISITING,
        states.LEAVING, states.AWAY, states.GONE, states.DISABLED];
    for (var i = 0; i < order.length; i++) {
        if (counts[order[i]] > 0) {
            stateStr += order[i] + ':' + counts[order[i]] + ' ';
        }
    }
    document.getElementById('hud-states').textContent = stateStr;

    var elev = sim.elevator;
    var elevStr = 'Elevator: Floor ' + elev.currentFloor +
        ' Dir:' + (elev.direction > 0 ? '^' : (elev.direction < 0 ? 'v' : '-')) +
        ' State:' + elev.state +
        ' Psg:' + elev.passengers.size +
        ' Dest:[' + Array.from(elev.destinations).join(',') + ']' +
        ' Up:[' + Array.from(elev.upCalls).join(',') + ']' +
        ' Dn:[' + Array.from(elev.downCalls).join(',') + ']';
    document.getElementById('hud-elev').textContent = elevStr;
}

function init() {
    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 200);
    camera.position.set(28, 24, 28);
    camera.lookAt(0, 10, 0);

    var renderer = new THREE.WebGLRenderer({antialias: true, alpha: true});
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.sortObjects = true;
    renderer.setPixelRatio(window.devicePixelRatio);
    document.body.appendChild(renderer.domElement);

    var controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 10, 0);
    controls.update();

    var ambLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambLight);
    var sunLight = new THREE.DirectionalLight(0xffffff, 1.2);
    sunLight.position.set(20, 40, 30);
    scene.add(sunLight);
    var hemiLight = new THREE.HemisphereLight(0x88aacc, 0x443322, 0.6);
    scene.add(hemiLight);

    var world = createWorld(scene);
    var elevator = new Elevator(scene, world);
    var clock = new Clock();

    sim = {
        scene: scene,
        camera: camera,
        renderer: renderer,
        controls: controls,
        world: world,
        elevator: elevator,
        clock: clock,
        sunLight: sunLight,
        ambLight: ambLight,
        hemiLight: hemiLight,
        targetOccupancy: DEFAULT_OCCUPANCY
    };

    var deskIndex = 0;
    for (var fi = 1; fi < W.FLOOR_COUNT; fi++) {
        var floor = world.floors[fi];
        var deskNames = ['A', 'B', 'C', 'D'];
        for (var di = 0; di < deskNames.length; di++) {
            if (deskIndex >= MAX_WORKERS) break;
            var agent = new Agent(deskIndex, 'WORKER');
            agent.homeFloor = fi;
            agent.deskId = deskNames[di];
            agent.deskWpName = 'office' + deskNames[di] + '_desk';
            agent.deskDoorWpName = 'office' + deskNames[di] + '_door';
            agent.group = createPerson();
            agent.group.visible = false;
            agent.state = states.DISABLED;
            world.buildingGroup.add(agent.group);
            allAgents.push(agent);
            deskIndex++;
        }
    }

    for (var vi = 0; vi < MAX_VISITORS; vi++) {
        var agent = new Agent(MAX_WORKERS + vi, 'VISITOR');
        agent.group = createPerson();
        agent.group.visible = false;
        agent.state = states.DISABLED;
        world.buildingGroup.add(agent.group);
        allAgents.push(agent);
    }

    for (var i = 0; i < sim.targetOccupancy; i++) {
        var a = allAgents[i];
        a.state = states.AWAY;
        a.group.visible = true;
        if (a.role === 'WORKER') {
            scheduleWorker(a);
        }
    }

    createHUD();

    window.addEventListener('resize', function() {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    var lastTime = performance.now();

    function animate() {
        requestAnimationFrame(animate);

        var now = performance.now();
        var realDt = Math.min(0.05, (now - lastTime) / 1000);
        lastTime = now;

        var dayWrap = clock.tick(realDt);
        if (dayWrap) {
            resetDay();
        }

        var motionDt = realDt * clock.timeScale;
        updateLighting(scene, clock);

        elevator.tick(motionDt);

        for (var i = 0; i < allAgents.length; i++) {
            var a = allAgents[i];
            if (a.state === states.DISABLED || a.state === states.GONE) continue;
            if (a.state === states.AWAY) {
                if (clock.simMinute >= a.arrivalTime) {
                    spawnAgent(a);
                }
                continue;
            }
            if (a.role === 'WORKER' && a.state !== states.LEAVING && a.state !== states.GONE && a.state !== states.IN_CAR && a.state !== states.WAITING_ELEVATOR) {
                if (clock.simMinute >= a.departureTime) {
                    a.plan = planLeaveBuilding(a);
                    a.actionIndex = 0;
                    a.currentAction = a.plan[0];
                    if (a.currentAction) startAction(a);
                    a.state = states.LEAVING;
                }
            }
            updateAgent(a, motionDt);
        }

        topUpVisitors();
        applyCollisions();

        for (var i = 0; i < allAgents.length; i++) {
            var a = allAgents[i];
            if (a.group.parent && a.group.visible) {
                animatePersonWalking(a.group, motionDt);
            }
        }

        controls.update();
        renderer.render(scene, camera);
        updateHUD();
    }

    animate();
}

function spawnAgent(agent) {
    var floorData = sim.world.floors[0];
    var spawnPos = getNodePos(0, 'outside').clone();
    spawnPos.x += (Math.random() - 0.5) * 2.2;
    spawnPos.z += (Math.random() - 0.5) * 1.5;

    agent.group.position.copy(spawnPos);
    agent.group.position.y = 0;
    agent.group.rotation.y = Math.PI;
    agent.group.visible = true;

    if (!agent.group.parent) {
        sim.world.buildingGroup.add(agent.group);
    }

    agent.state = states.ARRIVING;
    agent.isSitting = false;
    agent.sitDrop = 0;
    agent.group.userData.isSitting = false;
    agent.group.userData.isWalking = false;
    agent.reservedSpot = null;

    if (agent.role === 'VISITOR') {
        scheduleVisitor(agent);
        agent.plan = planVisitorVisit(agent);
    } else {
        agent.plan = planArriveToDesk(agent);
    }
    agent.actionIndex = 0;
    agent.currentAction = agent.plan[0];
    if (agent.currentAction) startAction(agent);
}

function resetDay() {
    seatReservations.clear();

    for (var i = 0; i < allAgents.length; i++) {
        var a = allAgents[i];
        if (i >= sim.targetOccupancy) {
            a.state = states.DISABLED;
            a.group.visible = false;
            if (a.group.parent) a.group.parent.remove(a.group);
            continue;
        }
        if (a.role === 'WORKER') {
            scheduleWorker(a);
        } else {
            scheduleVisitor(a);
        }
        a.state = states.AWAY;
        a.plan = [];
        a.currentAction = null;
        a.actionIndex = 0;
        a.isSitting = false;
        a.sitDrop = 0;
        a.group.userData.isSitting = false;
        a.group.userData.isWalking = false;
        a.group.visible = false;
        if (a.group.parent) a.group.parent.remove(a.group);
        a.reservedSpot = null;
    }

    sim.elevator.reset();
}

init();

})();