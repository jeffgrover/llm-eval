var MAX_WORKERS = 20;
var MAX_VISITORS = 80;
var MAX_OCCUPANCY = MAX_WORKERS + MAX_VISITORS;
var targetOccupancy = 45;

var FIRST_NAMES = ['Alice','Bob','Carol','Dave','Eve','Frank','Grace','Hank','Iris','Jack','Kate','Liam','Mia','Noah','Olivia','Paul','Quinn','Rose','Sam','Tina','Uma','Vince','Wendy','Xander','Yara','Zack','Ava','Ben','Chloe','Dan','Ella','Finn','Gina','Hugo','Ivy','Jake','Kara','Leo','Nina','Oscar','Pia','Rex','Sage','Troy','Vera','Walt','Zoe','Adam','Belle','Carl','Diana','Eric','Faye','Greg','Holly','Ivan','Jade','Kurt','Luna','Mark','Nora','Owen','Pearl','Rolf','Suki','Todd','Ursa','Vince','Wade','Xena','Yves','Zara','Aria','Blake','Cora','Drew','Eden','Finn','Gwen','Hank','Iris','Jade','Kai','Lena','Milo','Nero','Opal','Peri','Reed','Sage','Troy','Vera','Wade'];

var MEETING_PROB = 0.36;

var AGENT_STATE = {
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

var ACTION_TYPE = {
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

// Global state
var scene, camera, renderer, controls, world, elevator, agents = [];
var clock = null;
var sunLight;
var ambientLight;
var hemiLight;
var seatReservations = {};
var speedSlider, occSlider, speedLabel, occLabel, clockDisplay, stateInfo;

function rand(min, max) { return Math.random() * (max - min) + min; }
function randInt(min, max) { return Math.floor(rand(min, max + 1)); }

function pickName() {
    return FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
}

function shuffleArray(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
}

// Seat reservation system
function reserveSeat(wpName) {
    var key = wpName;
    if (seatReservations[key]) return false;
    seatReservations[key] = true;
    return true;
}

function releaseSeat(wpName) {
    delete seatReservations[wpName];
}

function clearAllSeatReservations() {
    seatReservations = {};
}

// Clock
function makeClock() {
    return {
        simMinute: 7 * 60 + 30,
        timeScale: 120,
        tick: function(realDt) {
            this.simMinute += realDt * this.timeScale / 60;
            if (this.simMinute >= 24 * 60) {
                this.simMinute -= 24 * 60;
                return true; // day wrapped
            }
            return false;
        },
        format: function() {
            var h = Math.floor(this.simMinute / 60);
            var m = Math.floor(this.simMinute % 60);
            var ampm = h >= 12 ? 'PM' : 'AM';
            var h12 = h % 12;
            if (h12 === 0) h12 = 12;
            return ' ' + h12 + ':' + (m < 10 ? '0' : '') + m + ' ' + ampm;
        }
    };
}

// Day/night lighting
function updateLighting(simMinute) {
    var hour = simMinute / 60;
    // Keyframes: (hour, bg r/g/b, sunIntensity, ambientIntensity, hemiIntensity)
    // Dawn ~5:30-6:30, Day 6:30-17:30, Dusk 17:30-18:30, Night 18:30-5:30
    var t = hour;
    var bgColor, sunInt, ambInt, hemiInt;

    if (t < 5.5 || t >= 19) {
        // Night
        bgColor = new THREE.Color(0x0a0a14);
        sunInt = 0.05;
        ambInt = 0.45;
        hemiInt = 0.32;
    } else if (t < 6.5) {
        // Dawn transition
        var p = (t - 5.5) / 1.0;
        bgColor = new THREE.Color(0x0a0a14).lerp(new THREE.Color(0x4a6a9a), p);
        sunInt = 0.05 + p * 0.85;
        ambInt = 0.45;
        hemiInt = 0.32 + p * 0.13;
    } else if (t < 17.5) {
        // Day
        bgColor = new THREE.Color(0x4a6a9a);
        sunInt = 0.9;
        ambInt = 0.45;
        hemiInt = 0.45;
    } else if (t < 18.5) {
        // Dusk transition
        var p = (t - 17.5) / 1.0;
        bgColor = new THREE.Color(0x4a6a9a).lerp(new THREE.Color(0x2a2a3a), p);
        sunInt = 0.9 - p * 0.85;
        ambInt = 0.45;
        hemiInt = 0.45 - p * 0.13;
    } else {
        // Night
        bgColor = new THREE.Color(0x0a0a14);
        sunInt = 0.05;
        ambInt = 0.45;
        hemiInt = 0.32;
    }

    if (scene) scene.background = bgColor;
    if (sunLight) sunLight.intensity = sunInt;
    if (ambientLight) ambientLight.intensity = ambInt;
    if (hemiLight) hemiLight.intensity = hemiInt;
}

// Agent creation
function createAgent(id, role) {
    var group = createPerson();
    var name = pickName();
    var homeFloor = role === 'WORKER' ? randInt(1, WORLD.FLOOR_COUNT - 1) : 0;
    var deskId = -1;
    var deskWpName = null;
    var deskDoorWpName = null;

    if (role === 'WORKER') {
        deskId = id % MAX_WORKERS;
        var letter = String.fromCharCode(65 + (deskId % 4));
        deskWpName = 'office' + letter + '_desk_f' + homeFloor;
        deskDoorWpName = 'office' + letter + '_door_f' + homeFloor;
    }

    // Daily schedule
    var schedule = makeSchedule(role === 'WORKER');

    return {
        id: id,
        name: name,
        role: role,
        homeFloor: homeFloor,
        deskId: deskId,
        deskWpName: deskWpName,
        deskDoorWpName: deskDoorWpName,
        group: group,
        state: 'AWAY',
        currentAction: null,
        actionQueue: [],
        plan: [],
        hasLunched: false,
        schedule: schedule,
        // Walking state
        walkPath: null,
        walkIndex: 0,
        walkTarget: null,
        walkSpeed: 2.0,
        _prevWp: null,
        _stallT: 0,
        // Elevator state
        toFloor: -1,
        spotIndex: -1,
        // Seat
        reservedSeat: null,
        // Sitting
        bodyYOffset: 0
    };
}

function makeSchedule(isWorker) {
    if (isWorker) {
        var arrival = randInt(8 * 60 + 15, 9 * 60 + 30);
        var lunch = randInt(11 * 60 + 30, 13 * 60 + 30);
        var lunchDur = randInt(25, 60);
        var isStraggler = Math.random() < 0.15;
        var depart = isStraggler ? randInt(18 * 60 + 30, 19 * 60 + 45) : randInt(16 * 60 + 45, 18 * 60 + 30);
        var meetings = [];
        var numMeetings = Math.random() < 0.5 ? 0 : (Math.random() < 0.5 ? 1 : 2);
        for (var i = 0; i < numMeetings; i++) {
            var mt = i === 0 ? randInt(9 * 60 + 30, 11 * 60) : randInt(13 * 60 + 30, 16 * 60);
            meetings.push(mt);
        }
        return {
            arrivalTime: arrival,
            lunchTime: lunch,
            lunchDuration: lunchDur,
            departureTime: depart,
            plannedMeetingTimes: meetings
        };
    } else {
        // Visitors get a lightweight schedule generated on the fly
        return null;
    }
}

function makeVisitorSchedule() {
    var duration = randInt(15, 90);
    return {
        arrivalTime: 0, // Set dynamically
        duration: duration
    };
}

// Plan compilers
function planArriveToDesk(agent) {
    var actions = [];
    actions.push({ type: 'ENTER_STATE', state: 'ARRIVING' });
    actions.push({ type: 'WALK_TO_WP', floor: 0, wpName: 'outside' });
    actions.push({ type: 'WALK_TO_WP', floor: 0, wpName: 'front_door_threshold' });
    actions.push({ type: 'WALK_TO_WP', floor: 0, wpName: 'entrance' });
    actions.push({ type: 'WALK_TO_WP', floor: 0, wpName: 'lobby_center' });
    actions.push({ type: 'ENTER_STATE', state: 'WAITING_ELEVATOR' });
    actions.push({ type: 'WAIT_AT_PANEL', floor: 0, dir: 1, toFloor: agent.homeFloor });
    actions.push({ type: 'ENTER_ELEVATOR', toFloor: agent.homeFloor });
    actions.push({ type: 'PRESS_FLOOR', floor: agent.homeFloor });
    actions.push({ type: 'WAIT_FOR_FLOOR', floor: agent.homeFloor });
    actions.push({ type: 'EXIT_ELEVATOR' });
    actions.push({ type: 'ENTER_STATE', state: 'ON_FLOOR' });
    if (agent.deskWpName) {
        actions.push({ type: 'WALK_TO_WP', floor: agent.homeFloor, wpName: agent.deskDoorWpName });
        actions.push({ type: 'WALK_TO_WP', floor: agent.homeFloor, wpName: agent.deskWpName });
        actions.push({ type: 'SIT', floor: agent.homeFloor, wpName: agent.deskWpName });
        actions.push({ type: 'ENTER_STATE', state: 'AT_DESK' });
    }
    actions.push({ type: 'WAIT_SIM', duration: randInt(30, 120) });
    actions.push({ type: 'PICK_NEXT_ACTIVITY' });
    return actions;
}

function planGoToLunch(agent) {
    var actions = [];
    actions.push({ type: 'STAND' });
    if (agent.deskWpName) {
        actions.push({ type: 'WALK_TO_WP', floor: agent.homeFloor, wpName: agent.deskDoorWpName });
    }
    actions.push({ type: 'WALK_TO_WP', floor: agent.homeFloor, wpName: 'elevWait_f' + agent.homeFloor });
    actions.push({ type: 'ENTER_STATE', state: 'WAITING_ELEVATOR' });
    actions.push({ type: 'WAIT_AT_PANEL', floor: agent.homeFloor, dir: -1, toFloor: 0 });
    actions.push({ type: 'ENTER_ELEVATOR', toFloor: 0 });
    actions.push({ type: 'PRESS_FLOOR', floor: 0 });
    actions.push({ type: 'WAIT_FOR_FLOOR', floor: 0 });
    actions.push({ type: 'EXIT_ELEVATOR' });
    actions.push({ type: 'WALK_TO_WP', floor: 0, wpName: 'lobby_center' });
    // Sit at a bistro table
    var bistroSeat = findBistroSeat();
    if (bistroSeat) {
        actions.push({ type: 'WALK_TO_WP', floor: 0, wpName: bistroSeat });
        actions.push({ type: 'SIT', floor: 0, wpName: bistroSeat });
    }
    actions.push({ type: 'ENTER_STATE', state: 'AT_LUNCH' });
    actions.push({ type: 'WAIT_SIM', duration: agent.schedule ? agent.schedule.lunchDuration : randInt(25, 60) });
    actions.push({ type: 'STAND' });
    actions.push({ type: 'MARK_LUNCHED' });
    if (bistroSeat) {
        actions.push({ type: 'RELEASE_SEAT', wpName: bistroSeat });
    }
    // Go back to desk
    actions.push({ type: 'WALK_TO_WP', floor: 0, wpName: 'lobby_center' });
    actions.push({ type: 'WAIT_AT_PANEL', floor: 0, dir: 1, toFloor: agent.homeFloor });
    actions.push({ type: 'ENTER_ELEVATOR', toFloor: agent.homeFloor });
    actions.push({ type: 'PRESS_FLOOR', floor: agent.homeFloor });
    actions.push({ type: 'WAIT_FOR_FLOOR', floor: agent.homeFloor });
    actions.push({ type: 'EXIT_ELEVATOR' });
    actions.push({ type: 'WALK_TO_WP', floor: agent.homeFloor, wpName: agent.deskDoorWpName });
    actions.push({ type: 'WALK_TO_WP', floor: agent.homeFloor, wpName: agent.deskWpName });
    actions.push({ type: 'SIT', floor: agent.homeFloor, wpName: agent.deskWpName });
    actions.push({ type: 'ENTER_STATE', state: 'AT_DESK' });
    actions.push({ type: 'WAIT_SIM', duration: randInt(30, 120) });
    actions.push({ type: 'PICK_NEXT_ACTIVITY' });
    return actions;
}

function planVisitLounge(agent) {
    var actions = [];
    actions.push({ type: 'STAND' });
    if (agent.deskWpName) {
        actions.push({ type: 'WALK_TO_WP', floor: agent.homeFloor, wpName: agent.deskDoorWpName });
    }
    actions.push({ type: 'WALK_TO_WP', floor: agent.homeFloor, wpName: 'lounge_center_f' + agent.homeFloor });
    actions.push({ type: 'ENTER_STATE', state: 'AT_BREAK' });
    actions.push({ type: 'WAIT_SIM', duration: randInt(5, 12) });
    // Return to desk
    actions.push({ type: 'WALK_TO_WP', floor: agent.homeFloor, wpName: agent.deskDoorWpName });
    actions.push({ type: 'WALK_TO_WP', floor: agent.homeFloor, wpName: agent.deskWpName });
    actions.push({ type: 'SIT', floor: agent.homeFloor, wpName: agent.deskWpName });
    actions.push({ type: 'ENTER_STATE', state: 'AT_DESK' });
    actions.push({ type: 'WAIT_SIM', duration: randInt(30, 120) });
    actions.push({ type: 'PICK_NEXT_ACTIVITY' });
    return actions;
}

function planAttendMeeting(agent, meetingFloor) {
    meetingFloor = meetingFloor || (Math.random() < 0.65 ? agent.homeFloor : randInt(1, WORLD.FLOOR_COUNT - 1));
    var actions = [];
    actions.push({ type: 'STAND' });
    if (agent.deskWpName) {
        actions.push({ type: 'WALK_TO_WP', floor: agent.homeFloor, wpName: agent.deskDoorWpName });
    }

    if (meetingFloor !== agent.homeFloor) {
        // Need to take elevator
        actions.push({ type: 'WALK_TO_WP', floor: agent.homeFloor, wpName: 'elevWait_f' + agent.homeFloor });
        actions.push({ type: 'ENTER_STATE', state: 'WAITING_ELEVATOR' });
        var dir = meetingFloor > agent.homeFloor ? 1 : -1;
        actions.push({ type: 'WAIT_AT_PANEL', floor: agent.homeFloor, dir: dir, toFloor: meetingFloor });
        actions.push({ type: 'ENTER_ELEVATOR', toFloor: meetingFloor });
        actions.push({ type: 'PRESS_FLOOR', floor: meetingFloor });
        actions.push({ type: 'WAIT_FOR_FLOOR', floor: meetingFloor });
        actions.push({ type: 'EXIT_ELEVATOR' });
    }

    // Find a conference seat
    var seatName = null;
    for (var ci = 0; ci < 4; ci++) {
        var sn = 'conf_seat' + ci + '_f' + meetingFloor;
        if (reserveSeat(sn)) {
            seatName = sn;
            break;
        }
    }
    if (seatName) {
        actions.push({ type: 'WALK_TO_WP', floor: meetingFloor, wpName: 'conf_door_f' + meetingFloor });
        actions.push({ type: 'WALK_TO_WP', floor: meetingFloor, wpName: 'conf_center_f' + meetingFloor });
        actions.push({ type: 'WALK_TO_WP', floor: meetingFloor, wpName: seatName });
        actions.push({ type: 'SIT', floor: meetingFloor, wpName: seatName });
    }
    actions.push({ type: 'ENTER_STATE', state: 'IN_MEETING' });
    actions.push({ type: 'WAIT_SIM', duration: randInt(22, 45) });
    actions.push({ type: 'STAND' });
    if (seatName) {
        actions.push({ type: 'RELEASE_SEAT', wpName: seatName });
    }

    // Return to desk
    if (meetingFloor !== agent.homeFloor) {
        actions.push({ type: 'WALK_TO_WP', floor: meetingFloor, wpName: 'elevWait_f' + meetingFloor });
        actions.push({ type: 'ENTER_STATE', state: 'WAITING_ELEVATOR' });
        var dir2 = agent.homeFloor > meetingFloor ? 1 : -1;
        actions.push({ type: 'WAIT_AT_PANEL', floor: meetingFloor, dir: dir2, toFloor: agent.homeFloor });
        actions.push({ type: 'ENTER_ELEVATOR', toFloor: agent.homeFloor });
        actions.push({ type: 'PRESS_FLOOR', floor: agent.homeFloor });
        actions.push({ type: 'WAIT_FOR_FLOOR', floor: agent.homeFloor });
        actions.push({ type: 'EXIT_ELEVATOR' });
    }
    actions.push({ type: 'WALK_TO_WP', floor: agent.homeFloor, wpName: agent.deskDoorWpName });
    actions.push({ type: 'WALK_TO_WP', floor: agent.homeFloor, wpName: agent.deskWpName });
    actions.push({ type: 'SIT', floor: agent.homeFloor, wpName: agent.deskWpName });
    actions.push({ type: 'ENTER_STATE', state: 'AT_DESK' });
    actions.push({ type: 'WAIT_SIM', duration: randInt(30, 120) });
    actions.push({ type: 'PICK_NEXT_ACTIVITY' });
    return actions;
}

function planVisitCoworker(agent) {
    // Find a coworker AT_DESK
    var target = null;
    var candidates = [];
    for (var i = 0; i < agents.length; i++) {
        var a = agents[i];
        if (a.id !== agent.id && a.role === 'WORKER' && a.state === 'AT_DESK') {
            candidates.push(a);
        }
    }
    if (candidates.length > 0) {
        target = candidates[Math.floor(Math.random() * candidates.length)];
    }
    if (!target) {
        return planKeepWorking(agent);
    }

    var actions = [];
    actions.push({ type: 'STAND' });
    if (agent.deskWpName) {
        actions.push({ type: 'WALK_TO_WP', floor: agent.homeFloor, wpName: agent.deskDoorWpName });
    }

    if (target.homeFloor !== agent.homeFloor) {
        // Take elevator
        actions.push({ type: 'WALK_TO_WP', floor: agent.homeFloor, wpName: 'elevWait_f' + agent.homeFloor });
        actions.push({ type: 'ENTER_STATE', state: 'WAITING_ELEVATOR' });
        var dir = target.homeFloor > agent.homeFloor ? 1 : -1;
        actions.push({ type: 'WAIT_AT_PANEL', floor: agent.homeFloor, dir: dir, toFloor: target.homeFloor });
        actions.push({ type: 'ENTER_ELEVATOR', toFloor: target.homeFloor });
        actions.push({ type: 'PRESS_FLOOR', floor: target.homeFloor });
        actions.push({ type: 'WAIT_FOR_FLOOR', floor: target.homeFloor });
        actions.push({ type: 'EXIT_ELEVATOR' });
    }

    // Walk to coworker's door
    actions.push({ type: 'WALK_TO_WP', floor: target.homeFloor, wpName: target.deskDoorWpName });
    actions.push({ type: 'ENTER_STATE', state: 'VISITING' });
    actions.push({ type: 'WAIT_SIM', duration: randInt(6, 18) });

    // Return to desk
    if (target.homeFloor !== agent.homeFloor) {
        actions.push({ type: 'WALK_TO_WP', floor: target.homeFloor, wpName: 'elevWait_f' + target.homeFloor });
        actions.push({ type: 'ENTER_STATE', state: 'WAITING_ELEVATOR' });
        var dir2 = agent.homeFloor > target.homeFloor ? 1 : -1;
        actions.push({ type: 'WAIT_AT_PANEL', floor: target.homeFloor, dir: dir2, toFloor: agent.homeFloor });
        actions.push({ type: 'ENTER_ELEVATOR', toFloor: agent.homeFloor });
        actions.push({ type: 'PRESS_FLOOR', floor: agent.homeFloor });
        actions.push({ type: 'WAIT_FOR_FLOOR', floor: agent.homeFloor });
        actions.push({ type: 'EXIT_ELEVATOR' });
    }
    actions.push({ type: 'WALK_TO_WP', floor: agent.homeFloor, wpName: agent.deskDoorWpName });
    actions.push({ type: 'WALK_TO_WP', floor: agent.homeFloor, wpName: agent.deskWpName });
    actions.push({ type: 'SIT', floor: agent.homeFloor, wpName: agent.deskWpName });
    actions.push({ type: 'ENTER_STATE', state: 'AT_DESK' });
    actions.push({ type: 'WAIT_SIM', duration: randInt(30, 120) });
    actions.push({ type: 'PICK_NEXT_ACTIVITY' });
    return actions;
}

function planKeepWorking(agent) {
    return [
        { type: 'WAIT_SIM', duration: randInt(18, 65) },
        { type: 'PICK_NEXT_ACTIVITY' }
    ];
}

function planLeaveBuilding(agent) {
    var actions = [];
    actions.push({ type: 'STAND' });
    if (agent.role === 'WORKER' && agent.deskWpName) {
        actions.push({ type: 'WALK_TO_WP', floor: agent.homeFloor, wpName: agent.deskDoorWpName });
    }
    // If not on floor 0, take elevator down
    if (agent.homeFloor > 0 || agent.role === 'VISITOR') {
        var currentFloor = agent.homeFloor;
        var elevWp = 'elevWait_f' + currentFloor;
        if (agent.role === 'VISITOR') {
            currentFloor = 0;
            elevWp = 'elevWait';
        }
        if (agent.role === 'WORKER') {
            actions.push({ type: 'WALK_TO_WP', floor: currentFloor, wpName: elevWp });
            actions.push({ type: 'ENTER_STATE', state: 'WAITING_ELEVATOR' });
            actions.push({ type: 'WAIT_AT_PANEL', floor: currentFloor, dir: -1, toFloor: 0 });
            actions.push({ type: 'ENTER_ELEVATOR', toFloor: 0 });
            actions.push({ type: 'PRESS_FLOOR', floor: 0 });
            actions.push({ type: 'WAIT_FOR_FLOOR', floor: 0 });
            actions.push({ type: 'EXIT_ELEVATOR' });
        }
    }
    actions.push({ type: 'WALK_TO_WP', floor: 0, wpName: 'lobby_center' });
    actions.push({ type: 'WALK_TO_WP', floor: 0, wpName: 'entrance' });
    actions.push({ type: 'WALK_TO_WP', floor: 0, wpName: 'front_door_threshold' });
    actions.push({ type: 'WALK_TO_WP', floor: 0, wpName: 'outside' });
    actions.push({ type: 'EXIT_BUILDING' });
    return actions;
}

function findBistroSeat() {
    for (var bi = 0; bi < 4; bi++) {
        for (var ci = 0; ci < 2; ci++) {
            var sn = 'bistro_' + bi + '_' + ci;
            if (reserveSeat(sn)) return sn;
        }
    }
    return null;
}

function planVisitorVisit(agent) {
    var actions = [];
    actions.push({ type: 'ENTER_STATE', state: 'ARRIVING' });
    actions.push({ type: 'WALK_TO_WP', floor: 0, wpName: 'outside' });
    actions.push({ type: 'WALK_TO_WP', floor: 0, wpName: 'front_door_threshold' });
    actions.push({ type: 'WALK_TO_WP', floor: 0, wpName: 'entrance' });
    actions.push({ type: 'WALK_TO_WP', floor: 0, wpName: 'lobby_center' });

    // Roll activity
    var roll = Math.random();
    var activity = null;

    if (roll < 0.10) {
        // Bistro table
        var seat = findBistroSeat();
        if (seat) {
            activity = [
                { type: 'WALK_TO_WP', floor: 0, wpName: seat },
                { type: 'SIT', floor: 0, wpName: seat },
                { type: 'WAIT_SIM', duration: randInt(8, 20) },
                { type: 'STAND' },
                { type: 'RELEASE_SEAT', wpName: seat }
            ];
        }
    } else if (roll < 0.16) {
        // Cafe counter
        activity = [
            { type: 'WALK_TO_WP', floor: 0, wpName: 'cafe_order' },
            { type: 'WAIT_SIM', duration: randInt(3, 8) }
        ];
    } else if (roll < 0.30) {
        // Front lounge
        var loungeSpots = ['front_lounge_couch', 'front_lounge_chair0', 'front_lounge_chair1'];
        var picked = null;
        for (var li = 0; li < loungeSpots.length; li++) {
            if (reserveSeat(loungeSpots[li])) { picked = loungeSpots[li]; break; }
        }
        if (picked) {
            activity = [
                { type: 'WALK_TO_WP', floor: 0, wpName: picked },
                { type: 'SIT', floor: 0, wpName: picked },
                { type: 'WAIT_SIM', duration: randInt(8, 20) },
                { type: 'STAND' },
                { type: 'RELEASE_SEAT', wpName: picked }
            ];
        }
    } else if (roll < 0.42) {
        // Back lounge / conversation pit
        var backSpots = ['back_lounge_N', 'back_lounge_S', 'pit_N', 'pit_S', 'pit_E', 'pit_W'];
        var picked2 = null;
        for (var bi = 0; bi < backSpots.length; bi++) {
            if (reserveSeat(backSpots[bi])) { picked2 = backSpots[bi]; break; }
        }
        if (picked2) {
            activity = [
                { type: 'WALK_TO_WP', floor: 0, wpName: picked2 },
                { type: 'SIT', floor: 0, wpName: picked2 },
                { type: 'WAIT_SIM', duration: randInt(8, 18) },
                { type: 'STAND' },
                { type: 'RELEASE_SEAT', wpName: picked2 }
            ];
        }
    } else if (roll < 0.52) {
        // Reception / kiosk / water cooler
        var standSpots = ['reception', 'kiosk', 'lobby_wc_front', 'lobby_wc_back'];
        var picked3 = standSpots[Math.floor(Math.random() * standSpots.length)];
        activity = [
            { type: 'WALK_TO_WP', floor: 0, wpName: picked3 },
            { type: 'WAIT_SIM', duration: randInt(3, 8) }
        ];
    } else if (roll < 0.62) {
        // Lobby loiter
        var loiterSpots = ['lobby_stand_center', 'lobby_stand_NE', 'lobby_stand_NW', 'lobby_stand_midE', 'lobby_stand_midW', 'lobby_stand_entry'];
        var picked4 = loiterSpots[Math.floor(Math.random() * loiterSpots.length)];
        activity = [
            { type: 'WALK_TO_WP', floor: 0, wpName: picked4 },
            { type: 'WAIT_SIM', duration: randInt(5, 15) }
        ];
    } else if (roll < 0.77) {
        // Ride up to an office floor lounge
        var officeFloor = randInt(1, WORLD.FLOOR_COUNT - 1);
        activity = [
            { type: 'WAIT_AT_PANEL', floor: 0, dir: 1, toFloor: officeFloor },
            { type: 'ENTER_ELEVATOR', toFloor: officeFloor },
            { type: 'PRESS_FLOOR', floor: officeFloor },
            { type: 'WAIT_FOR_FLOOR', floor: officeFloor },
            { type: 'EXIT_ELEVATOR' },
            { type: 'WALK_TO_WP', floor: officeFloor, wpName: 'lounge_center_f' + officeFloor },
            { type: 'WAIT_SIM', duration: randInt(8, 20) },
            { type: 'WALK_TO_WP', floor: officeFloor, wpName: 'elevWait_f' + officeFloor },
            { type: 'WAIT_AT_PANEL', floor: officeFloor, dir: -1, toFloor: 0 },
            { type: 'ENTER_ELEVATOR', toFloor: 0 },
            { type: 'PRESS_FLOOR', floor: 0 },
            { type: 'WAIT_FOR_FLOOR', floor: 0 },
            { type: 'EXIT_ELEVATOR' }
        ];
    } else {
        // Sit in on a meeting
        var meetingFloor = randInt(1, WORLD.FLOOR_COUNT - 1);
        var seatName = null;
        for (var ci = 0; ci < 4; ci++) {
            var sn = 'conf_seat' + ci + '_f' + meetingFloor;
            if (reserveSeat(sn)) { seatName = sn; break; }
        }
        if (seatName) {
            activity = [
                { type: 'WAIT_AT_PANEL', floor: 0, dir: 1, toFloor: meetingFloor },
                { type: 'ENTER_ELEVATOR', toFloor: meetingFloor },
                { type: 'PRESS_FLOOR', floor: meetingFloor },
                { type: 'WAIT_FOR_FLOOR', floor: meetingFloor },
                { type: 'EXIT_ELEVATOR' },
                { type: 'WALK_TO_WP', floor: meetingFloor, wpName: 'conf_door_f' + meetingFloor },
                { type: 'WALK_TO_WP', floor: meetingFloor, wpName: 'conf_center_f' + meetingFloor },
                { type: 'WALK_TO_WP', floor: meetingFloor, wpName: 'conf_center_f' + meetingFloor },
                { type: 'SIT', floor: meetingFloor, wpName: seatName },
                { type: 'WAIT_SIM', duration: randInt(15, 35) },
                { type: 'STAND' },
                { type: 'RELEASE_SEAT', wpName: seatName },
                { type: 'WALK_TO_WP', floor: meetingFloor, wpName: 'elevWait_f' + meetingFloor },
                { type: 'WAIT_AT_PANEL', floor: meetingFloor, dir: -1, toFloor: 0 },
                { type: 'ENTER_ELEVATOR', toFloor: 0 },
                { type: 'PRESS_FLOOR', floor: 0 },
                { type: 'WAIT_FOR_FLOOR', floor: 0 },
                { type: 'EXIT_ELEVATOR' }
            ];
        } else {
            // Fallback to lobby loiter
            activity = [
                { type: 'WALK_TO_WP', floor: 0, wpName: 'lobby_stand_center' },
                { type: 'WAIT_SIM', duration: randInt(5, 15) }
            ];
        }
    }

    if (!activity) {
        activity = [
            { type: 'WALK_TO_WP', floor: 0, wpName: 'lobby_stand_center' },
            { type: 'WAIT_SIM', duration: randInt(5, 15) }
        ];
    }

    // Leave
    actions = actions.concat(activity);
    actions.push({ type: 'WALK_TO_WP', floor: 0, wpName: 'lobby_center' });
    actions.push({ type: 'WALK_TO_WP', floor: 0, wpName: 'entrance' });
    actions.push({ type: 'WALK_TO_WP', floor: 0, wpName: 'front_door_threshold' });
    actions.push({ type: 'WALK_TO_WP', floor: 0, wpName: 'outside' });
    actions.push({ type: 'EXIT_BUILDING' });
    return actions;
}

function chooseNextActivity(agent) {
    var t = clock.simMinute;
    var sched = agent.schedule;
    if (!sched) {
        // No schedule = keep working
        agent.plan = planKeepWorking(agent);
        return;
    }

    // Past departure time
    if (t >= sched.departureTime) {
        agent.plan = planLeaveBuilding(agent);
        return;
    }

    // Check planned meetings
    if (sched.plannedMeetingTimes) {
        for (var i = 0; i < sched.plannedMeetingTimes.length; i++) {
            if (t >= sched.plannedMeetingTimes[i] && t < sched.plannedMeetingTimes[i] + 60) {
                sched.plannedMeetingTimes.splice(i, 1);
                agent.plan = planAttendMeeting(agent);
                return;
            }
        }
    }

    // Lunch
    if (!agent.hasLunched && t >= sched.lunchTime && t < sched.lunchTime + 120) {
        agent.plan = planGoToLunch(agent);
        return;
    }

    // Random activity
    var roll = Math.random();
    if (roll < 0.14) {
        // Meeting
        agent.plan = planAttendMeeting(agent);
        return;
    } else if (roll < 0.26) {
        // Lounge break
        agent.plan = planVisitLounge(agent);
        return;
    } else if (roll < 0.41) {
        // Visit coworker
        agent.plan = planVisitCoworker(agent);
        return;
    } else {
        // Keep working
        agent.plan = planKeepWorking(agent);
        return;
    }
}

// Action dispatch
function startAction(agent, action) {
    agent.currentAction = action;
    if (!action) return;

    switch (action.type) {
        case 'WALK_TO_WP':
            startWalkAction(agent, action);
            break;
        case 'WAIT_AT_PANEL':
            // Press the hall call
            if (action.dir > 0) elevator.callUp(action.floor);
            else elevator.callDown(action.floor);
            agent.toFloor = action.toFloor;
            break;
        case 'ENTER_ELEVATOR':
            startEnterElevator(agent, action);
            break;
        case 'PRESS_FLOOR':
            elevator.pressDestination(action.floor);
            break;
        case 'WAIT_FOR_FLOOR':
            // Just wait
            break;
        case 'EXIT_ELEVATOR':
            startExitElevator(agent, action);
            break;
        case 'SIT':
            applySit(agent, action);
            break;
        case 'STAND':
            applyStand(agent);
            break;
        case 'RELEASE_SEAT':
            if (action.wpName) releaseSeat(action.wpName);
            break;
        case 'WAIT_SIM':
            action.untilMin = clock.simMinute + action.duration;
            break;
        case 'EXIT_BUILDING':
            if (agent.group.parent) {
                agent.group.parent.remove(agent.group);
            }
            agent.state = 'GONE';
            agent.currentAction = null;
            break;
        case 'ENTER_STATE':
            agent.state = action.state;
            break;
        case 'MARK_LUNCHED':
            agent.hasLunched = true;
            break;
        case 'PICK_NEXT_ACTIVITY':
            chooseNextActivity(agent);
            break;
    }
}

function startWalkAction(agent, action) {
    var wpName = action.wpName;
    var floor = action.floor;
    var pos = getWpPos(wpName, floor);
    if (!pos) {
        // Try to find the exact position
        pos = world.getWaypointPos(wpName);
        if (!pos) {
            // Fallback: use floor level
            pos = new THREE.Vector3(0, floor * WORLD.FLOOR_HEIGHT, 0);
        } else {
            pos = pos.clone();
        }
    }

    // Get current position
    var currentPos = agent.group.position.clone();
    var currentFloorY = Math.round(currentPos.y / WORLD.FLOOR_HEIGHT) * WORLD.FLOOR_HEIGHT;

    // BFS from current position to target
    var fromNode = findNearestNode(currentPos, floor);
    var toNode = findNearestNode(pos, floor);

    if (fromNode && toNode) {
        var path = bfsPath(world.allNodes, fromNode, toNode);
        if (path && path.length > 0) {
            agent.walkPath = [];
            // Add current position as first point
            agent.walkPath.push(currentPos.clone());
            for (var i = 0; i < path.length; i++) {
                var wp = getWpPos(path[i], floor);
                if (wp) {
                    agent.walkPath.push(wp);
                }
            }
            agent.walkPath.push(pos.clone());
            agent.walkIndex = 0;
            agent.walkTarget = null;
            agent._prevWp = null;
            agent._stallT = 0;
            agent.group.userData.isWalking = true;
            return;
        }
    }

    // Fallback: direct walk
    agent.walkPath = [currentPos.clone(), pos.clone()];
    agent.walkIndex = 0;
    agent.walkTarget = null;
    agent._prevWp = null;
    agent._stallT = 0;
    agent.group.userData.isWalking = true;
}

function findNearestNode(pos, floor) {
    var best = null;
    var bestDist = Infinity;
    for (var name in world.wpPositions) {
        var wp = world.wpPositions[name];
        if (Math.abs(wp.y - floor * WORLD.FLOOR_HEIGHT) > 0.1) continue;
        if (name.indexOf('_f') > 0 && name.indexOf('_f' + floor) < 0) continue;
        var d = pos.distanceTo(wp);
        if (d < bestDist) {
            bestDist = d;
            best = name;
        }
    }
    return best;
}

function getWpPos(wpName, floor) {
    // Try floor-specific first
    var specific = wpName + '_f' + floor;
    var p = world.getWaypointPos(specific);
    if (p) return p;
    // Try the name directly
    p = world.getWaypointPos(wpName);
    if (p) {
        p = p.clone();
        if (floor > 0) p.y = floor * WORLD.FLOOR_HEIGHT;
        return p;
    }
    return null;
}

function startEnterElevator(agent, action) {
    var toFloor = action.toFloor;
    agent.toFloor = toFloor;

    // Reserve boarding spot
    var spot = elevator.reserveBoardingSpot('agent_' + agent.id);
    if (!spot) {
        // Car is full, wait and retry
        elevator.callUp(0); // Re-press call
        return;
    }
    agent.spotIndex = spot.index;

    // Walk to door threshold then reparent
    var elevPos = new THREE.Vector3(0, 0, 1.5);
    agent.walkPath = [agent.group.position.clone(), elevPos.clone()];
    agent.walkIndex = 0;
    agent.walkTarget = null;
    agent._prevWp = null;
    agent._stallT = 0;
    agent.group.userData.isWalking = true;
    agent._enterPhase = 'walk_to_door';
}

function startExitElevator(agent, action) {
    elevator.registerDisembark('agent_' + agent.id);

    // Walk from car to elevWait
    var exitPos = new THREE.Vector3(0, agent.group.position.y, 1.5);
    agent.walkPath = [agent.group.position.clone(), exitPos.clone()];
    agent.walkIndex = 0;
    agent.walkTarget = null;
    agent._prevWp = null;
    agent._stallT = 0;
    agent.group.userData.isWalking = true;
    agent._exitPhase = 'walk_out';
}

function applySit(agent, action) {
    agent.group.userData.isSitting = true;
    agent.group.userData.isWalking = false;
    agent.bodyYOffset = -0.35;

    // Get the sit target info
    var wpName = action.wpName;
    var st = world.allSitTargets[wpName];
    if (!st) {
        // Try floor-specific
        st = world.allSitTargets[wpName + '_f' + action.floor];
    }
    if (st) {
        agent.group.rotation.y = st.facing;
    }

    // Lower body
    agent.group.position.y += agent.bodyYOffset;
}

function applyStand(agent) {
    agent.group.userData.isSitting = false;
    if (agent.bodyYOffset !== 0) {
        agent.group.position.y -= agent.bodyYOffset;
        agent.bodyYOffset = 0;
    }
}

function updateAction(agent, dt) {
    var action = agent.currentAction;
    if (!action) {
        // Advance to next action
        advanceAction(agent);
        return;
    }

    switch (action.type) {
        case 'WALK_TO_WP':
            updateWalkAction(agent, action, dt);
            break;
        case 'WAIT_AT_PANEL':
            updateWaitAtPanel(agent, action);
            break;
        case 'ENTER_ELEVATOR':
            updateEnterElevator(agent, action, dt);
            break;
        case 'WAIT_FOR_FLOOR':
            updateWaitForFloor(agent, action);
            break;
        case 'EXIT_ELEVATOR':
            updateExitElevator(agent, action, dt);
            break;
        case 'WAIT_SIM':
            if (clock.simMinute >= action.untilMin) {
                advanceAction(agent);
            }
            break;
        case 'EXIT_BUILDING':
        case 'ENTER_STATE':
        case 'MARK_LUNCHED':
        case 'PICK_NEXT_ACTIVITY':
        case 'SIT':
        case 'STAND':
        case 'PRESS_FLOOR':
        case 'RELEASE_SEAT':
            // These are instant, advance
            advanceAction(agent);
            break;
    }
}

function updateWalkAction(agent, action, dt) {
    if (!agent.walkPath || agent.walkPath.length === 0) {
        advanceAction(agent);
        return;
    }

    var target = agent.walkPath[agent.walkIndex];
    if (!target) {
        advanceAction(agent);
        return;
    }

    var pos = agent.group.position;
    var dx = target.x - pos.x;
    var dz = target.z - pos.z;
    // Y check: use floor Y
    var floorY = action.floor * WORLD.FLOOR_HEIGHT;
    if (Math.abs(pos.y - floorY) > 0.5) {
        pos.y = floorY;
    }
    var dy = target.y - pos.y;

    var dist = Math.sqrt(dx * dx + dz * dz);

    // Stall detection
    if (agent._prevWp) {
        var prevDist = agent._prevWp.distanceTo(pos);
        if (prevDist < 0.005) {
            agent._stallT += dt;
            if (agent._stallT > 1.5) {
                // Skip this waypoint
                agent.walkIndex++;
                agent._stallT = 0;
                if (agent.walkIndex >= agent.walkPath.length) {
                    advanceAction(agent);
                    return;
                }
                target = agent.walkPath[agent.walkIndex];
                dx = target.x - pos.x;
                dz = target.z - pos.z;
                dist = Math.sqrt(dx * dx + dz * dz);
            }
        } else {
            agent._stallT = 0;
        }
    }
    agent._prevWp = pos.clone();

    if (dist < 0.2) {
        agent.walkIndex++;
        if (agent.walkIndex >= agent.walkPath.length) {
            agent.group.userData.isWalking = false;
            advanceAction(agent);
            return;
        }
        target = agent.walkPath[agent.walkIndex];
        dx = target.x - pos.x;
        dz = target.z - pos.z;
        dist = Math.sqrt(dx * dx + dz * dz);
    }

    // Move toward target
    var speed = agent.walkSpeed * dt;
    if (speed > dist) speed = dist;

    // Face direction of movement
    if (dist > 0.01) {
        var angle = Math.atan2(dx, dz);
        agent.group.rotation.y = angle;
    }

    pos.x += (dx / dist) * speed;
    pos.z += (dz / dist) * speed;
    pos.y += (dy / dist) * speed;
}

function updateWaitAtPanel(agent, action) {
    // Re-press call every frame
    if (action.dir > 0) elevator.callUp(action.floor);
    else elevator.callDown(action.floor);

    // Check if car is accepting
    if (elevator.isAcceptingAt(action.floor, action.dir)) {
        // Check capacity
        if (elevator.currentCapacityFree() > 0) {
            advanceAction(agent);
        }
    }
}

function updateEnterElevator(agent, action, dt) {
    if (agent._enterPhase === 'walk_to_door') {
        // Walk to door threshold
        var doorPos = new THREE.Vector3(0, 0, 1.5);
        // Try to use spot X coordinate for lane
        if (agent.spotIndex >= 0) {
            var spotX = [-0.7, 0.7, -0.7, 0.7][agent.spotIndex];
            doorPos.x = spotX * 0.4;
        }
        doorPos.y = 0;

        var pos = agent.group.position;
        var dx = doorPos.x - pos.x;
        var dz = doorPos.z - pos.z;
        var dist = Math.sqrt(dx * dx + dz * dz);

        // Stall recovery
        if (agent._prevWp) {
            var prevDist = agent._prevWp.distanceTo(pos);
            if (prevDist < 0.005) {
                agent._stallT += dt;
                if (agent._stallT > 1.5) {
                    // Teleport to threshold
                    pos.set(doorPos.x, 0, doorPos.z);
                    agent._stallT = 0;
                }
            } else {
                agent._stallT = 0;
            }
        }
        agent._prevWp = pos.clone();

        if (dist < 0.3) {
            // Reparent to car
            var worldPos = pos.clone();
            agent.group.parent.remove(agent.group);
            elevator.carGroup.add(agent.group);
            agent.group.position.copy(worldPos);
            // Convert to local
            agent.group.position.sub(elevator.carGroup.position);
            agent.group.position.y = 0;

            agent._enterPhase = 'walk_to_spot';
            // Now walk to interior spot
            var spot = { x: [-0.7, 0.7, -0.7, 0.7][agent.spotIndex], z: [-0.7, -0.7, 0.6, 0.6][agent.spotIndex] };
            agent.walkPath = [agent.group.position.clone(), new THREE.Vector3(spot.x, 0, spot.z)];
            agent.walkIndex = 0;
            agent._prevWp = null;
            agent._stallT = 0;

            // Complete boarding
            elevator.completeBoard('agent_' + agent.id);
            agent.state = 'IN_CAR';
        } else {
            // Move toward door
            var speed = agent.walkSpeed * dt;
            if (speed > dist) speed = dist;
            var angle = Math.atan2(dx, dz);
            agent.group.rotation.y = angle;
            pos.x += (dx / dist) * speed;
            pos.z += (dz / dist) * speed;
        }
    } else if (agent._enterPhase === 'walk_to_spot') {
        if (!agent.walkPath || agent.walkIndex >= agent.walkPath.length) {
            agent.group.rotation.y = 0; // Face doors
            agent.group.userData.isWalking = false;
            advanceAction(agent);
            return;
        }
        var target = agent.walkPath[agent.walkIndex];
        var pos = agent.group.position;
        var dx = target.x - pos.x;
        var dz = target.z - pos.z;
        var dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < 0.2) {
            agent.walkIndex++;
            if (agent.walkIndex >= agent.walkPath.length) {
                agent.group.rotation.y = 0;
                agent.group.userData.isWalking = false;
                advanceAction(agent);
                return;
            }
        }
        var speed = agent.walkSpeed * dt;
        if (speed > dist) speed = dist;
        pos.x += (dx / dist) * speed;
        pos.z += (dz / dist) * speed;
    }
}

function updateWaitForFloor(agent, action) {
    if (elevator.currentFloor === action.floor && elevator.state === 'DOOR_OPEN') {
        advanceAction(agent);
    }
}

function updateExitElevator(agent, action, dt) {
    if (agent._exitPhase === 'walk_out') {
        var exitPos = new THREE.Vector3(0, elevator.carGroup.position.y, 1.5);
        var pos = agent.group.position;

        // Convert to world space
        var worldPos = pos.clone();
        // We're in car local space, need to convert
        if (agent.group.parent === elevator.carGroup) {
            worldPos.add(elevator.carGroup.position);
        }

        var dx = exitPos.x - worldPos.x;
        var dz = exitPos.z - worldPos.z;
        var dist = Math.sqrt(dx * dx + dz * dz);

        if (dist < 0.3) {
            // Reparent to scene
            var wPos = worldPos.clone();
            agent.group.parent.remove(agent.group);
            scene.add(agent.group);
            agent.group.position.copy(wPos);

            agent._exitPhase = 'walk_to_elevwait';
            var elevWaitPos = new THREE.Vector3(0, wPos.y, 2.5);
            agent.walkPath = [wPos.clone(), elevWaitPos];
            agent.walkIndex = 0;
            agent._prevWp = null;
            agent._stallT = 0;

            elevator.completeDisembark('agent_' + agent.id);
        }

        // Move toward exit
        var speed = agent.walkSpeed * dt;
        if (speed > dist) speed = dist;
        var angle = Math.atan2(dx, dz);
        agent.group.rotation.y = angle;
        worldPos.x += (dx / dist) * speed;
        worldPos.z += (dz / dist) * speed;
        agent.group.position.copy(worldPos);
        if (agent.group.parent === elevator.carGroup) {
            agent.group.position.sub(elevator.carGroup.position);
        }
    } else if (agent._exitPhase === 'walk_to_elevwait') {
        if (!agent.walkPath || agent.walkIndex >= agent.walkPath.length) {
            agent.group.userData.isWalking = false;
            advanceAction(agent);
            return;
        }
        var target = agent.walkPath[agent.walkIndex];
        var pos = agent.group.position;
        var dx = target.x - pos.x;
        var dz = target.z - pos.z;
        var dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < 0.2) {
            agent.walkIndex++;
            if (agent.walkIndex >= agent.walkPath.length) {
                agent.group.userData.isWalking = false;
                advanceAction(agent);
                return;
            }
        }
        var speed = agent.walkSpeed * dt;
        if (speed > dist) speed = dist;
        pos.x += (dx / dist) * speed;
        pos.z += (dz / dist) * speed;
    }
}

function advanceAction(agent) {
    agent.currentAction = null;
    if (agent.plan && agent.plan.length > 0) {
        var action = agent.plan.shift();
        startAction(agent, action);
    }
}

// Collision system
function applyCollisions() {
    var activeAgents = [];
    for (var i = 0; i < agents.length; i++) {
        var a = agents[i];
        if (a.state === 'DISABLED' || a.state === 'AWAY' || a.state === 'GONE') continue;
        if (!a.group.parent) continue;
        // Skip agents in the elevator car
        if (a.group.parent === elevator.carGroup) continue;
        // Skip agents entering elevator (they have reserved spots)
        if (a.currentAction && a.currentAction.type === 'ENTER_ELEVATOR') continue;
        // Skip entrance threshold exempt
        if (a.currentAction && a.currentAction.type === 'WALK_TO_WP') {
            var wp = a.currentAction.wpName;
            if (wp === 'front_door_threshold') continue;
        }
        activeAgents.push(a);
    }

    for (var i = 0; i < activeAgents.length; i++) {
        for (var j = i + 1; j < activeAgents.length; j++) {
            var a = activeAgents[i];
            var b = activeAgents[j];
            if (a.group.userData.isSitting && b.group.userData.isSitting) continue;

            var pa = a.group.position;
            var pb = b.group.position;
            var dy = Math.abs(pa.y - pb.y);
            if (dy > 1.0) continue;

            var dx = pa.x - pb.x;
            var dz = pa.z - pb.z;
            var dist = Math.sqrt(dx * dx + dz * dz);
            var minDist = WORLD.PERSON_R * 2;

            if (dist < minDist) {
                var push = (minDist - dist) * 0.18;
                if (dist < 0.001) {
                    // Random direction
                    var angle = Math.random() * Math.PI * 2;
                    dx = Math.cos(angle);
                    dz = Math.sin(angle);
                    dist = 1;
                }
                var nx = dx / dist;
                var nz = dz / dist;

                if (!a.group.userData.isSitting) {
                    pa.x += nx * push;
                    pa.z += nz * push;
                }
                if (!b.group.userData.isSitting) {
                    pb.x -= nx * push;
                    pb.z -= nz * push;
                }
            }
        }
    }
}

// Agent spawning
function spawnAgent(agent) {
    if (agent.state !== 'AWAY') return;
    // Check if at arrival time
    if (agent.role === 'WORKER' && agent.schedule) {
        if (clock.simMinute < agent.schedule.arrivalTime) return;
    }
    if (agent.role === 'VISITOR') {
        // Visitors are spawned by topUpVisitors
        return;
    }

    // Place on sidewalk
    var startPos = new THREE.Vector3(rand(-1.1, 1.1), 0, WORLD.BUILDING_DEPTH / 2 + 3);
    agent.group.position.copy(startPos);
    scene.add(agent.group);
    agent.state = 'ARRIVING';

    // Generate plan
    if (agent.role === 'WORKER') {
        agent.plan = planArriveToDesk(agent);
    } else {
        agent.plan = planVisitorVisit(agent);
    }
    agent.currentAction = null;
    advanceAction(agent);
}

function topUpVisitors() {
    if (!clock) return;
    var t = clock.simMinute;
    // Only during business hours (7:00 - 20:00)
    if (t < 7 * 60 || t > 20 * 60) return;

    var present = countPresent();
    var deficit = targetOccupancy - present;
    if (deficit <= 0) return;

    var rearmed = 0;
    for (var i = 0; i < agents.length && rearmed < deficit; i++) {
        var a = agents[i];
        if (a.role !== 'VISITOR') continue;
        if (a.state !== 'AWAY' && a.state !== 'GONE') continue;

        // Re-arm visitor
        a.schedule = makeVisitorSchedule();
        a.schedule.arrivalTime = t + randInt(0, 6);
        a.homeFloor = 0;
        a.state = 'AWAY';
        rearmed++;
    }
}

function countPresent() {
    var count = 0;
    for (var i = 0; i < agents.length; i++) {
        var a = agents[i];
        if (a.state === 'DISABLED' || a.state === 'AWAY' || a.state === 'GONE') continue;
        count++;
    }
    return count;
}

function applyOccupancy() {
    for (var i = 0; i < agents.length; i++) {
        var a = agents[i];
        if (a.id >= targetOccupancy) {
            if (a.state === 'AWAY') {
                a.state = 'DISABLED';
            }
        } else {
            if (a.state === 'DISABLED') {
                a.state = 'AWAY';
            }
        }
    }
}

function resetDay() {
    // Reset all agents
    for (var i = 0; i < agents.length; i++) {
        var a = agents[i];
        // Remove from scene
        if (a.group.parent) {
            a.group.parent.remove(a.group);
        }
        // Reset state
        a.state = a.id < targetOccupancy ? 'AWAY' : 'DISABLED';
        a.currentAction = null;
        a.plan = [];
        a.hasLunched = false;
        a.bodyYOffset = 0;
        a.group.position.set(0, 0, 0);
        a.group.rotation.set(0, 0, 0);
        a.group.userData.isSitting = false;
        a.group.userData.isWalking = false;
        a.walkPath = null;
        a.walkIndex = 0;
        a._prevWp = null;
        a._stallT = 0;
        a.toFloor = -1;
        a.spotIndex = -1;
        a.reservedSeat = null;
        // New schedule
        if (a.role === 'WORKER') {
            a.schedule = makeSchedule(true);
        }
    }

    // Reset elevator
    elevator.logic.reset();

    // Clear seat reservations
    clearAllSeatReservations();
}

function initAgents() {
    agents = [];
    for (var i = 0; i < MAX_OCCUPANCY; i++) {
        var role = i < MAX_WORKERS ? 'WORKER' : 'VISITOR';
        var a = createAgent(i, role);
        a.state = i < targetOccupancy ? 'AWAY' : 'DISABLED';
        agents.push(a);
    }
}

// HUD update
function updateHUD() {
    if (!clock) return;
    clockDisplay.textContent = clock.format();

    // Speed label
    var speedVal = Number(speedSlider.value);
    // Log-spaced: 1 to 600
    var speed = Math.round(Math.exp(speedVal / 100 * Math.log(600)));
    if (speed < 1) speed = 1;
    clock.timeScale = speed;
    speedLabel.textContent = speed + 'x';

    // Occupancy
    var occVal = Number(occSlider.value);
    targetOccupancy = occVal;
    occLabel.textContent = occVal + ' / 100';

    // State counts
    var stateCounts = {};
    for (var s in AGENT_STATE) {
        stateCounts[AGENT_STATE[s]] = 0;
    }
    for (var i = 0; i < agents.length; i++) {
        var st = agents[i].state;
        stateCounts[st] = (stateCounts[st] || 0) + 1;
    }

    var info = 'State: ';
    for (var s in stateCounts) {
        if (stateCounts[s] > 0) {
            info += s + ':' + stateCounts[s] + ' ';
        }
    }
    info += '| Elev: F' + elevator.currentFloor + ' ';
    info += 'Dir:' + (elevator.direction > 0 ? '^' : elevator.direction < 0 ? 'v' : '-') + ' ';
    info += 'Pass:' + elevator.passengers.length + ' ';
    info += 'Dest:' + elevator.destinations.join(',');
    info += ' Up:' + elevator.upCalls.length + ' Dn:' + elevator.downCalls.length;
    stateInfo.textContent = info;
}

// Main
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

    // Clock
    clock = makeClock();

    // Speed slider
    speedSlider = document.getElementById('speedSlider');
    speedLabel = document.getElementById('speedLabel');
    occSlider = document.getElementById('occSlider');
    occLabel = document.getElementById('occLabel');
    clockDisplay = document.getElementById('clockDisplay');
    stateInfo = document.getElementById('stateInfo');

    // Init agents
    initAgents();

    // Slider event
    occSlider.addEventListener('input', function() {
        applyOccupancy();
    });

    // Resize
    window.addEventListener('resize', function() {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    var lastTime = performance.now();
    var stalledEntrance = {};

    function animate() {
        requestAnimationFrame(animate);

        var now = performance.now();
        var realDt = Math.min(0.05, (now - lastTime) / 1000);
        lastTime = now;

        // Tick clock
        var wrapped = clock.tick(realDt);
        if (wrapped) {
            resetDay();
        }

        var motionDt = realDt * clock.timeScale;

        // Update lighting
        updateLighting(clock.simMinute);

        // Tick elevator
        elevator.tick(motionDt);

        // Top up visitors
        topUpVisitors();

        // Spawn agents
        for (var i = 0; i < agents.length; i++) {
            var a = agents[i];
            if (a.state === 'AWAY') {
                spawnAgent(a);
            }
        }

        // Process agents - loop for instant actions
        for (var i = 0; i < agents.length; i++) {
            var a = agents[i];
            if (a.state === 'DISABLED' || a.state === 'AWAY' || a.state === 'GONE') continue;
            if (!a.group.parent) continue;

            // Process action dispatch in a loop for zero-duration actions
            var iterations = 0;
            while (a.currentAction || (a.plan && a.plan.length > 0)) {
                if (iterations > 20) break;
                updateAction(a, motionDt);
                iterations++;
                // Break if we're in a waiting action
                if (a.currentAction) {
                    var type = a.currentAction.type;
                    if (type === 'WAIT_SIM' || type === 'WAIT_FOR_FLOOR' ||
                        type === 'WALK_TO_WP' || type === 'WAIT_AT_PANEL' ||
                        type === 'ENTER_ELEVATOR' || type === 'EXIT_ELEVATOR') {
                        break;
                    }
                }
            }
        }

        // Entrance stall recovery: check for agents stuck at front_door_threshold
        for (var i = 0; i < agents.length; i++) {
            var a = agents[i];
            if (a.state === 'DISABLED' || a.state === 'AWAY' || a.state === 'GONE') continue;
            if (!a.currentAction || a.currentAction.type !== 'WALK_TO_WP') continue;
            if (a.currentAction.wpName !== 'front_door_threshold' && a.currentAction.wpName !== 'entrance') continue;

            var key = 'agent_' + a.id;
            var pos = a.group.position;
            if (!stalledEntrance[key]) {
                stalledEntrance[key] = { pos: pos.clone(), time: 0 };
            }
            var se = stalledEntrance[key];
            var d = se.pos.distanceTo(pos);
            if (d < 0.005) {
                se.time += motionDt;
                if (se.time > 1.5) {
                    // Force advance to next waypoint
                    var nextWp = a.currentAction.wpName === 'front_door_threshold' ? 'entrance' : 'lobby_center';
                    var nextFloor = 0;
                    var nextPos = getWpPos(nextWp, nextFloor);
                    if (nextPos) {
                        pos.x = nextPos.x;
                        pos.z = nextPos.z;
                        pos.y = nextPos.y;
                    }
                    se.time = 0;
                }
            } else {
                se.pos.copy(pos);
                se.time = 0;
            }
        }

        // Collision
        applyCollisions();

        // Animate people
        for (var i = 0; i < agents.length; i++) {
            var a = agents[i];
            if (a.state === 'DISABLED' || a.state === 'AWAY' || a.state === 'GONE') continue;
            if (!a.group.parent) continue;
            // Determine if walking
            var isWalking = a.currentAction && (
                a.currentAction.type === 'WALK_TO_WP' ||
                (a.currentAction.type === 'ENTER_ELEVATOR' && a._enterPhase) ||
                (a.currentAction.type === 'EXIT_ELEVATOR' && a._exitPhase)
            );
            a.group.userData.isWalking = isWalking;
            animatePersonWalking(a.group, motionDt);
        }

        // Render
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