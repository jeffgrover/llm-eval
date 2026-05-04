var MAX_WORKERS = 20;
var MAX_VISITORS = 80;
var MAX_OCCUPANCY = MAX_WORKERS + MAX_VISITORS;
var DEFAULT_OCCUPANCY = 45;
var MEETING_PROB = 0.36;

var FIRST_NAMES = ['Alice','Bob','Carol','Dave','Eve','Frank','Grace','Heidi','Ivan','Judy','Ken','Laura','Mal','Nina','Oscar','Pat','Quinn','Rita','Steve','Tina','Uma','Vic','Wendy','Xander','Yara','Zoe','Aaron','Beth','Cory','Diana','Eddy','Fiona','Gary','Holly','Iris','Jake','Kara','Liam','Maya','Noah','Olga','Peter'];

var ALPHA_MAT_SKY = new THREE.MeshBasicMaterial({color: 0x8899bb, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide});
var ALPHA_MAT_GROUND = new THREE.MeshBasicMaterial({color: 0x556677, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide});

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randFloat(min, max) {
    return Math.random() * (max - min) + min;
}

// ========== Scene setup ==========
var scene = new THREE.Scene();
scene.background = new THREE.Color(0x222233);
scene.fog = new THREE.Fog(0x222233, 60, 120);

var camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.5, 200);
camera.position.set(28, 24, 28);
camera.lookAt(0, 8, 0);

var renderer = new THREE.WebGLRenderer({antialias: true, alpha: true});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.sortObjects = true;
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

renderer.domElement.addEventListener('wheel', function(e) { e.stopPropagation(); }, {passive: false});

var controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.target.set(0, 8, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI * 0.7;
controls.update();

var ambientLight = new THREE.AmbientLight(0x8899bb, 0.6);
scene.add(ambientLight);

var sunLight = new THREE.DirectionalLight(0xffeedd, 1.2);
sunLight.position.set(50, 80, -30);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(512, 512);
sunLight.shadow.camera.near = 0.5;
sunLight.shadow.camera.far = 200;
sunLight.shadow.camera.left = -40;
sunLight.shadow.camera.right = 40;
sunLight.shadow.camera.top = 40;
sunLight.shadow.camera.bottom = -5;
scene.add(sunLight);

var hemiLight = new THREE.HemisphereLight(0x8899bb, 0x334455, 0.5);
scene.add(hemiLight);

// ========== World + Elevator ==========
var world = createWorld(scene);
var elevator = new Elevator(scene, world);

// ========== Simulated Clock ==========
var Clock = {
    simMinute: 7 * 60 + 30,
    timeScale: 120,
    format: function() {
        var h = Math.floor(this.simMinute / 60);
        var m = Math.floor(this.simMinute % 60);
        var ampm = h >= 12 ? 'PM' : 'AM';
        var h12 = h % 12 === 0 ? 12 : h % 12;
        var ms = m < 10 ? '0' + m : '' + m;
        return h12 + ':' + ms + ' ' + ampm;
    },
    tick: function(realDt) {
        var prevMin = this.simMinute;
        this.simMinute += realDt * this.timeScale / 60;
        if (this.simMinute >= 24 * 60) {
            this.simMinute = 7 * 60 + 30;
            elevator.reset();
            for (var ai = 0; ai < agents.length; ai++) {
                var a = agents[ai];
                if (a && a.state !== 'DISABLED') {
                    initAgentSchedule(a);
                }
            }
        }
    }
};

// ========== Day/Night lighting ==========
var dayNightKeyframes = [
    {hour: 0, sky: [0.06, 0.06, 0.12], sunColor: [0.05, 0.05, 0.08], sunInt: 0.02, ambInt: 0.22, hemiInt: 0.15},
    {hour: 5.5, sky: [0.06, 0.06, 0.12], sunColor: [0.05, 0.05, 0.08], sunInt: 0.02, ambInt: 0.22, hemiInt: 0.15},
    {hour: 6.0, sky: [0.3, 0.3, 0.5], sunColor: [0.8, 0.5, 0.2], sunInt: 0.5, ambInt: 0.4, hemiInt: 0.3},
    {hour: 6.5, sky: [0.5, 0.5, 0.7], sunColor: [1.0, 0.9, 0.7], sunInt: 0.9, ambInt: 0.6, hemiInt: 0.48},
    {hour: 7.0, sky: [0.5, 0.55, 0.75], sunColor: [1.0, 0.95, 0.85], sunInt: 1.2, ambInt: 0.7, hemiInt: 0.55},
    {hour: 17.0, sky: [0.5, 0.55, 0.75], sunColor: [1.0, 0.95, 0.85], sunInt: 1.2, ambInt: 0.7, hemiInt: 0.55},
    {hour: 17.5, sky: [0.45, 0.45, 0.6], sunColor: [0.9, 0.6, 0.3], sunInt: 0.8, ambInt: 0.6, hemiInt: 0.48},
    {hour: 18.0, sky: [0.3, 0.25, 0.35], sunColor: [0.6, 0.3, 0.15], sunInt: 0.4, ambInt: 0.45, hemiInt: 0.32},
    {hour: 18.5, sky: [0.1, 0.1, 0.15], sunColor: [0.1, 0.08, 0.05], sunInt: 0.05, ambInt: 0.28, hemiInt: 0.2},
    {hour: 19.0, sky: [0.06, 0.06, 0.12], sunColor: [0.05, 0.05, 0.08], sunInt: 0.02, ambInt: 0.22, hemiInt: 0.15},
    {hour: 24.0, sky: [0.06, 0.06, 0.12], sunColor: [0.05, 0.05, 0.08], sunInt: 0.02, ambInt: 0.22, hemiInt: 0.15}
];

function lerp(a, b, t) { return a + (b - a) * t; }
function lerpColor(a, b, t) { return [lerp(a[0],b[0],t), lerp(a[1],b[1],t), lerp(a[2],b[2],t), lerp(a[3],b[3],t)]; }

function updateLighting(simMinute) {
    var h = simMinute / 60;

    if (h < 5.5) h = 5.5;
    if (h > 19) h = 19;

    var kfs = dayNightKeyframes;
    var i = 0;
    while (i < kfs.length - 1 && kfs[i + 1].hour <= h) i++;
    var k0 = kfs[i], k1 = kfs[Math.min(i + 1, kfs.length - 1)];
    var t = (h - k0.hour) / (k1.hour - k0.hour || 0.01);
    t = Math.max(0, Math.min(1, t));

    var sc = lerpColor(k0.sunColor, k1.sunColor, t);
    sunLight.color.setRGB(sc[0], sc[1], sc[2]);
    sunLight.intensity = lerp(k0.sunInt, k1.sunInt, t);
    ambientLight.intensity = lerp(k0.ambInt, k1.ambInt, t);
    hemiLight.intensity = lerp(k0.hemiInt, k1.hemiInt, t);
    var sb = lerpColor(k0.sky, k1.sky, t);
    scene.background = new THREE.Color(sb[0], sb[1], sb[2]);
    scene.fog.color.copy(scene.background);
}

// ========== Agents ==========
var agents = [];
var seatReservations = {};
var targetOccupancy = DEFAULT_OCCUPANCY;

function makeSeatKey(floorNum, wpName) {
    return floorNum + ':' + wpName;
}

function reserveSeat(floorNum, wpName) {
    var key = makeSeatKey(floorNum, wpName);
    if (seatReservations[key]) return false;
    seatReservations[key] = true;
    return true;
}

function releaseSeat(floorNum, wpName) {
    var key = makeSeatKey(floorNum, wpName);
    delete seatReservations[key];
}

function initAgentSchedule(agent) {
    if (agent.state === 'DISABLED') return;

    var arrH = randInt(8, 9);
    var arrM = randInt(0, 59);
    if (agent.role === 'WORKER') {
        var arrM2 = randInt(0, 30);
        agent.arrivalTime = 8 * 60 + 15 + arrM2;
    } else {
        agent.arrivalTime = 8 * 60 + randInt(0, 90);
    }

    agent.lunchTime = randInt(11 * 60 + 30, 13 * 60 + 30);
    agent.lunchDuration = randInt(25, 60);
    agent.hasLunched = false;

    var isStraggler = Math.random() < 0.15;
    if (isStraggler) {
        agent.departureTime = randInt(18 * 60 + 30, 19 * 60 + 45);
    } else {
        agent.departureTime = randInt(16 * 60 + 45, 18 * 60 + 30);
    }

    agent.plannedMeetingTimes = [];
    var numMeetings = Math.floor(Math.random() * 3);
    for (var m = 0; m < numMeetings; m++) {
        if (m === 0) {
            agent.plannedMeetingTimes.push(randInt(9 * 60 + 30, 11 * 60 + 30));
        } else {
            agent.plannedMeetingTimes.push(randInt(14 * 60, 16 * 60 + 30));
        }
    }
    agent.plannedMeetingTimes.sort(function(a, b) { return a - b; });

    agent.state = 'AWAY';
    agent.plan = [];
    agent.currentAction = null;
    agent.inCar = false;
    agent.toFloor = -1;
    agent.spotted = false;
    if (agent.group) {
        agent.group.visible = false;
        agent.group.userData.isWalking = false;
        agent.group.userData.isSitting = false;
        agent.group.userData._standY = 0;
        agent.group.userData._sitY = -0.35;
    }
}

function applyOccupancy() {
    for (var i = 0; i < agents.length; i++) {
        var a = agents[i];
        if (a.id < targetOccupancy && a.state === 'DISABLED') {
            a.state = 'AWAY';
            initAgentSchedule(a);
        } else if (a.id >= targetOccupancy && a.state === 'AWAY') {
            if (a.group) a.group.visible = false;
            a.state = 'DISABLED';
        }
    }
}

function countPresent() {
    var c = 0;
    for (var i = 0; i < agents.length; i++) {
        var s = agents[i].state;
        if (s !== 'DISABLED' && s !== 'AWAY' && s !== 'GONE') c++;
    }
    return c;
}

function topUpVisitors() {
    if (Clock.simMinute < 7 * 60 || Clock.simMinute > 19 * 60) return;
    var deficit = targetOccupancy - countPresent();
    if (deficit <= 0) return;

    for (var i = 0; i < agents.length && deficit > 0; i++) {
        var a = agents[i];
        if (a.role !== 'VISITOR') continue;
        if (a.state === 'AWAY' || a.state === 'GONE') {
            a.state = 'AWAY';
            a.arrivalTime = Math.floor(Clock.simMinute) + randInt(0, 6);
            a.visitDuration = randInt(15, 90);
            a.hasLunched = false;
            if (a.group) a.group.visible = false;
            deficit--;
        }
    }
}

// ========== Build agent pool ==========
var deskIdx = 0;
for (var i = 0; i < MAX_OCCUPANCY; i++) {
    var role = i < MAX_WORKERS ? 'WORKER' : 'VISITOR';
    var agent = {
        id: i,
        role: role,
        name: pick(FIRST_NAMES),
        state: 'DISABLED',
        plan: [],
        currentAction: null,
        inCar: false,
        toFloor: -1,
        homeFloor: 0,
        deskId: null,
        deskWpName: null,
        deskDoorWpName: null,
        seatReservationKey: null,
        group: null,
        arrivalTime: 480,
        lunchTime: 720,
        lunchDuration: 30,
        departureTime: 1020,
        hasLunched: false,
        plannedMeetingTimes: [],
        visitDuration: randInt(15, 90),
        _prevWp: null,
        _stallT: 0,
        _prevWalk: null,
        pathIndex: 0,
        currentPath: null,
        interiorSpot: null
    };

    if (role === 'WORKER' && deskIdx < world.deskCount) {
        var desk = null;
        for (var fi = 0; fi < world.floors.length; fi++) {
            if (world.floors[fi].desks && deskIdx < deskCountHelper(world.floors, fi)) {
                var localIdx = deskIdx;
                for (var fj = 0; fj < fi; fj++) {
                    if (world.floors[fj].desks) localIdx -= world.floors[fj].desks.length;
                }
                if (localIdx < world.floors[fi].desks.length) {
                    desk = world.floors[fi].desks[localIdx];
                    break;
                }
            }
        }
        if (!desk) {
            for (var fi = 0; fi < world.floors.length; fi++) {
                if (world.floors[fi].desks && world.floors[fi].desks.length > 0) {
                    var d2 = world.floors[fi].desks[deskIdx % world.floors[fi].desks.length];
                    if (d2) { desk = d2; break; }
                }
            }
        }
        if (desk) {
            agent.homeFloor = desk.floorNum;
            agent.deskId = desk.id;
            agent.deskWpName = desk.deskWpName;
            agent.deskDoorWpName = desk.deskDoorWpName;
        }
        deskIdx++;
    }

    agents.push(agent);
}

function deskCountHelper(floors, fi) {
    var c = 0;
    for (var j = 0; j <= fi; j++) {
        if (floors[j].desks) c += floors[j].desks.length;
    }
    return c;
}

// ========== Action types ==========
var ACT = {
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

// ========== Helper to get floor data ==========
function getFloor(floorNum) {
    for (var i = 0; i < world.floors.length; i++) {
        if (world.floors[i].floorNumber === floorNum) return world.floors[i];
    }
    return null;
}

// ========== Action processing ==========
function startAction(agent) {
    var act = agent.currentAction;
    if (!act) return;
    agent.group.userData.isWalking = false;

    var floorData = getFloor(act.floorNum !== undefined ? act.floorNum : agent.homeFloor);

    switch (act.type) {
        case ACT.WALK_TO_WP:
            if (!floorData || !floorData.nodes[act.wpName]) {
                agent.currentAction = null;
                return;
            }
            var fromP = agent.group.position.clone();
            var fromFloor = Math.round(fromP.y / WORLD.FLOOR_HEIGHT);
            var fromG = floorData.nodes['elevWait'];
            var toG = floorData.nodes[act.wpName];
            if (!fromG || !toG) { agent.currentAction = null; return; }

            var path;
            if (fromFloor === act.floorNum) {
                var closestNode = null;
                var cDist = Infinity;
                var nodeNames = Object.keys(floorData.nodes);
                for (var n = 0; n < nodeNames.length; n++) {
                    var nd = floorData.nodes[nodeNames[n]];
                    var dx = fromP.x - nd.x;
                    var dz = fromP.z - nd.z;
                    var dist = dx * dx + dz * dz;
                    if (dist < cDist) { cDist = dist; closestNode = nodeNames[n]; }
                }
                if (closestNode) {
                    path = world.bfsPath(floorData.nodes, closestNode, act.wpName);
                } else {
                    path = world.bfsPath(floorData.nodes, 'elevWait', act.wpName);
                }
            } else {
                path = world.bfsPath(floorData.nodes, 'elevWait', act.wpName);
            }

            agent.currentPath = path;
            agent.pathIndex = 0;
            agent._prevWp = agent.group.position.clone();
            agent._stallT = 0;

            if (path && path.length > 0 && agent.currentPath[0]) {
                agent.group.position.x = agent.currentPath[0].x;
                agent.group.position.z = agent.currentPath[0].z;
            }
            break;

        case ACT.WAIT_AT_PANEL:
            act._pressed = false;
            break;

        case ACT.ENTER_ELEVATOR:
            act._phase = 'reserve';
            act._prevWalk = null;
            act._stallT = 0;
            break;

        case ACT.WAIT_SIM:
            act.untilMin = Math.floor(Clock.simMinute) + act.duration;
            break;

        case ACT.SIT:
            if (floorData && floorData.sitTargets[act.wpName]) {
                var target = floorData.sitTargets[act.wpName];
                agent.group.userData.isSitting = target.sit;
                agent.group.userData.isWalking = false;
                if (target.sit) {
                    agent.group.position.y = act.floorNum * WORLD.FLOOR_HEIGHT - 0.35;
                    agent.group.userData._sitY = act.floorNum * WORLD.FLOOR_HEIGHT - 0.35;
                } else {
                    agent.group.position.y = act.floorNum * WORLD.FLOOR_HEIGHT;
                    agent.group.userData._standY = act.floorNum * WORLD.FLOOR_HEIGHT;
                }
                agent.group.rotation.y = target.facing;

                if (!target.sit) {
                    var angle = Math.random() * Math.PI * 2;
                    var rad = randFloat(0.35, 0.75);
                    agent.group.position.x += Math.cos(angle) * rad;
                    agent.group.position.z += Math.sin(angle) * rad;
                }
            }
            agent.currentAction = null;
            break;

        case ACT.STAND:
            agent.group.userData.isSitting = false;
            agent.group.userData.isWalking = false;
            var fy = Math.round(agent.group.position.y / WORLD.FLOOR_HEIGHT);
            if (agent.inCar) {
                agent.group.userData._standY = 0;
            } else {
                agent.group.userData._standY = fy * WORLD.FLOOR_HEIGHT;
            }
            agent.currentAction = null;
            break;

        case ACT.RELEASE_SEAT:
            if (agent.seatReservationKey) {
                var parts = agent.seatReservationKey.split(':');
                releaseSeat(parseInt(parts[0]), parts.slice(1).join(':'));
                agent.seatReservationKey = null;
            }
            agent.currentAction = null;
            break;

        case ACT.PRESS_FLOOR:
            elevator.pressDestination(act.destFloor);
            agent.toFloor = -1;
            agent.currentAction = null;
            break;

        case ACT.EXIT_BUILDING:
            if (agent.group) scene.remove(agent.group);
            agent.state = 'GONE';
            agent.inCar = false;
            agent.currentAction = null;
            break;

        case ACT.ENTER_STATE:
            agent.state = act.targetState;
            agent.currentAction = null;
            break;

        case ACT.MARK_LUNCHED:
            agent.hasLunched = true;
            agent.currentAction = null;
            break;

        case ACT.PICK_NEXT_ACTIVITY:
            agent.currentAction = null;
            var planned = chooseNextActivity(agent);
            if (planned && planned.length > 0) {
                agent.plan = planned;
            } else {
                agent.plan = [{type: ACT.WAIT_SIM, duration: randInt(15, 45), floorNum: agent.homeFloor}];
            }
            break;

        default:
            agent.currentAction = null;
            break;
    }
}

function processAction(agent, dt) {
    var act = agent.currentAction;
    if (!act) return;

    var floorData = getFloor(act.floorNum !== undefined ? act.floorNum : agent.homeFloor);

    switch (act.type) {
        case ACT.WALK_TO_WP:
            walkAlongPath(agent, dt);
            break;

        case ACT.WAIT_AT_PANEL:
            var dir = act.dir === 1 ? ElevatorLogic.DIRECTIONS.UP : ElevatorLogic.DIRECTIONS.DOWN;
            if (act.floorNum === 0 && dir === ElevatorLogic.DIRECTIONS.DOWN) {
                agent.currentAction = null;
                return;
            }
            if (act.floorNum === WORLD.FLOOR_COUNT - 1 && dir === ElevatorLogic.DIRECTIONS.UP) {
                agent.currentAction = null;
                return;
            }
            if (dir === ElevatorLogic.DIRECTIONS.UP) {
                elevator.callUp(act.floorNum);
            } else {
                elevator.callDown(act.floorNum);
            }
            act._pressed = true;

            if (elevator.isAcceptingAt(act.floorNum, dir) && elevator.currentCapacityFree() > 0) {
                agent.state = 'WAITING_ELEVATOR';
                agent.currentAction = null;
            }
            agent.state = 'WAITING_ELEVATOR';
            break;

        case ACT.ENTER_ELEVATOR:
            var elState = elevator.state;
            var elFloor = elevator.currentFloor;
            var elDoorOpen = elState === ElevatorLogic.DOOR_OPEN;

            if (!elDoorOpen || elFloor !== act.floorNum) {
                agent.currentAction = null;
                agent.plan.unshift({type: ACT.WAIT_AT_PANEL, floorNum: act.floorNum, dir: act.dir, toFloor: act.toFloor});
                return;
            }

            if (act._phase === 'reserve') {
                var spot = elevator.reserveBoardingSpot(agent);
                if (!spot) {
                    if (act.floorNum === 0) elevator.callUp(0);
                    else if (act.dir === 1) elevator.callUp(act.floorNum);
                    else elevator.callDown(act.floorNum);
                    agent.state = 'WAITING_ELEVATOR';
                    return;
                }
                agent.interiorSpot = spot;
                agent.toFloor = act.toFloor;
                act._phase = 'walkToDoor';
                act._prevWalk = agent.group.position.clone();
                act._stallT = 0;
            }

            if (act._phase === 'walkToDoor') {
                var spotX = agent.interiorSpot.x;
                var doorZ = WORLD.SHAFT_DEPTH / 2 + 1.2;
                var doorX = spotX + elevator.group.position.x;
                var doorWZ = doorZ + elevator.group.position.z;
                var targetX = doorX;
                var targetZ = doorWZ;

                var dx = targetX - agent.group.position.x;
                var dz = targetZ - agent.group.position.z;
                var dist = Math.sqrt(dx * dx + dz * dz);

                if (dist > 0.15) {
                    var eSpeed = 1.3;
                    agent.group.position.x += (dx / dist) * eSpeed * dt;
                    agent.group.position.z += (dz / dist) * eSpeed * dt;
                    agent.group.rotation.y = Math.atan2(dx, dz);
                    agent.group.userData.isWalking = true;

                    var cur = agent.group.position.clone();
                    var pdx = cur.x - (act._prevWalk ? act._prevWalk.x : 0);
                    var pdz = cur.z - (act._prevWalk ? act._prevWalk.z : 0);
                    var pdist = Math.sqrt(pdx * pdx + pdz * pdz);
                    if (pdist < 0.005) act._stallT += dt;
                    else act._stallT = 0;
                    act._prevWalk = cur.clone();

                    if (act._stallT > 1.5) {
                        agent.group.position.x = targetX;
                        agent.group.position.z = targetZ;
                    }
                } else {
                    agent.group.position.x = targetX;
                    agent.group.position.z = targetZ;
                    agent.group.position.y = elevator.group.position.y;
                    act._phase = 'enterCar';
                }
            }

            if (act._phase === 'enterCar') {
                elevator.group.add(agent.group);
                agent.inCar = true;
                agent.group.userData._standY = 0;
                agent.group.userData.isWalking = true;
                act._phase = 'walkToSpot';
                act._prevWalk = agent.group.position.clone();
                act._stallT = 0;
            }

            if (act._phase === 'walkToSpot') {
                var sx = agent.interiorSpot.x;
                var sz = agent.interiorSpot.z;
                var ldx = sx - agent.group.position.x;
                var ldz = sz - agent.group.position.z;
                var ldist = Math.sqrt(ldx * ldx + ldz * ldz);

                if (ldist > 0.1) {
                    var sSpeed = 1.3;
                    agent.group.position.x += (ldx / ldist) * sSpeed * dt;
                    agent.group.position.z += (ldz / ldist) * sSpeed * dt;
                    agent.group.userData.isWalking = true;
                } else {
                    agent.group.position.x = sx;
                    agent.group.position.z = sz;
                    agent.group.userData.isWalking = false;
                    agent.group.rotation.y = 0;
                    elevator.completeBoard(agent);
                    agent.state = 'IN_CAR';
                    agent.currentAction = null;
                }
            }
            break;

        case ACT.WAIT_FOR_FLOOR:
            if (elevator.state === ElevatorLogic.DOOR_OPEN && elevator.currentFloor === act.floorNum) {
                agent.currentAction = null;
            }
            break;

        case ACT.EXIT_ELEVATOR:
            if (act._phase === undefined || act._phase === 'register') {
                elevator.registerDisembark(agent);
                act._phase = 'reparent';
            }

            if (act._phase === 'reparent') {
                scene.add(agent.group);
                var wp = agent.group.position.clone();
                agent.group.position.copy(wp);
                agent.inCar = false;
                var tFloor = act.toFloor ? act.toFloor : elevator.currentFloor;
                agent.group.position.y = tFloor * WORLD.FLOOR_HEIGHT;
                agent.group.userData._standY = tFloor * WORLD.FLOOR_HEIGHT;
                act._phase = 'walkOut';
                act._prevWalk = agent.group.position.clone();
                act._stallT = 0;
            }

            if (act._phase === 'walkOut') {
                var ef = act.toFloor ? act.toFloor : elevator.currentFloor;
                var eFloorData = getFloor(ef);
                var ew = eFloorData && eFloorData.nodes['elevWait'];
                if (!ew) { agent.currentAction = null; return; }

                var edx = ew.x - agent.group.position.x;
                var edz = ew.z - agent.group.position.z;
                var edist = Math.sqrt(edx * edx + edz * edz);

                if (edist > 0.2) {
                    var eoSpd = 1.3;
                    agent.group.position.x += (edx / edist) * eoSpd * dt;
                    agent.group.position.z += (edz / edist) * eoSpd * dt;
                    agent.group.rotation.y = Math.atan2(edx, edz);
                    agent.group.userData.isWalking = true;
                } else {
                    agent.group.position.x = ew.x;
                    agent.group.position.z = ew.z;
                    agent.group.userData.isWalking = false;
                    elevator.completeDisembark(agent);
                    agent.interiorSpot = null;
                    agent.state = 'ON_FLOOR';
                    agent.currentAction = null;
                }
            }
            break;

        case ACT.WAIT_SIM:
            if (Clock.simMinute >= act.untilMin) {
                agent.currentAction = null;
            }
            break;

        default:
            agent.currentAction = null;
            break;
    }
}

function walkAlongPath(agent, dt) {
    if (!agent.currentPath || agent.pathIndex >= agent.currentPath.length) {
        agent.group.userData.isWalking = false;
        agent.currentAction = null;
        return;
    }

    var wp = agent.currentPath[agent.pathIndex];
    var dx = wp.x - agent.group.position.x;
    var dz = wp.z - agent.group.position.z;
    var dist = Math.sqrt(dx * dx + dz * dz);

    if (dist < 0.3) {
        agent.pathIndex++;
        agent._stallT = 0;
        agent._prevWp = agent.group.position.clone();
        if (agent.pathIndex >= agent.currentPath.length) {
            agent.group.userData.isWalking = false;
            agent.currentAction = null;
        }
        return;
    }

    agent.group.userData.isWalking = true;
    var walkSpeed = 1.3;
    agent.group.position.x += (dx / dist) * walkSpeed * dt;
    agent.group.position.z += (dz / dist) * walkSpeed * dt;
    agent.group.rotation.y = Math.atan2(dx, dz);

    var cur = agent.group.position.clone();
    var pdx2 = cur.x - (agent._prevWp ? agent._prevWp.x : 0);
    var pdz2 = cur.z - (agent._prevWp ? agent._prevWp.z : 0);
    var pdist2 = Math.sqrt(pdx2 * pdx2 + pdz2 * pdz2);
    if (pdist2 < 0.005) agent._stallT += dt;
    else { agent._stallT = 0; agent._prevWp = cur.clone(); }

    if (agent._stallT > 1.2) {
        agent.pathIndex++;
        agent._stallT = 0;
    }
}

// ========== Plan compilers ==========
function compilePlan(actions) {
    var plan = [];
    for (var i = 0; i < actions.length; i++) {
        plan.push(actions[i]);
    }
    return plan;
}

function planArriveToDesk(agent) {
    var hf = agent.homeFloor;
    return compilePlan([
        {type: ACT.WALK_TO_WP, floorNum: 0, wpName: 'entrance'},
        {type: ACT.WAIT_AT_PANEL, floorNum: 0, dir: 1, toFloor: hf},
        {type: ACT.ENTER_ELEVATOR, floorNum: 0, dir: 1, toFloor: hf},
        {type: ACT.PRESS_FLOOR, destFloor: hf},
        {type: ACT.WAIT_FOR_FLOOR, floorNum: hf},
        {type: ACT.EXIT_ELEVATOR, floorNum: hf, toFloor: hf},
        {type: ACT.STAND},
        {type: ACT.WALK_TO_WP, floorNum: hf, wpName: agent.deskDoorWpName},
        {type: ACT.WALK_TO_WP, floorNum: hf, wpName: agent.deskWpName},
        {type: ACT.SIT, floorNum: hf, wpName: agent.deskWpName},
        {type: ACT.ENTER_STATE, targetState: 'AT_DESK'},
        {type: ACT.WAIT_SIM, duration: randInt(18, 65), floorNum: hf},
        {type: ACT.PICK_NEXT_ACTIVITY}
    ]);
}

function planGoToLunch(agent) {
    var hf = agent.homeFloor;
    var bistroTable = randInt(0, 3);
    var bistroChair = randInt(0, 1);
    return compilePlan([
        {type: ACT.STAND},
        {type: ACT.WALK_TO_WP, floorNum: hf, wpName: agent.deskDoorWpName},
        {type: ACT.WAIT_AT_PANEL, floorNum: hf, dir: -1, toFloor: 0},
        {type: ACT.ENTER_ELEVATOR, floorNum: hf, dir: -1, toFloor: 0},
        {type: ACT.PRESS_FLOOR, destFloor: 0},
        {type: ACT.WAIT_FOR_FLOOR, floorNum: 0},
        {type: ACT.EXIT_ELEVATOR, floorNum: 0, toFloor: 0},
        {type: ACT.STAND},
        {type: ACT.WALK_TO_WP, floorNum: 0, wpName: 'cafe_bistro_' + bistroTable + '_' + bistroChair},
        {type: ACT.SIT, floorNum: 0, wpName: 'cafe_bistro_' + bistroTable + '_' + bistroChair},
        {type: ACT.ENTER_STATE, targetState: 'AT_LUNCH'},
        {type: ACT.WAIT_SIM, duration: agent.lunchDuration, floorNum: 0},
        {type: ACT.STAND},
        {type: ACT.MARK_LUNCHED},
        {type: ACT.ENTER_STATE, targetState: 'ON_FLOOR'},
        {type: ACT.WALK_TO_WP, floorNum: 0, wpName: 'elevWait'},
        {type: ACT.WAIT_AT_PANEL, floorNum: 0, dir: 1, toFloor: hf},
        {type: ACT.ENTER_ELEVATOR, floorNum: 0, dir: 1, toFloor: hf},
        {type: ACT.PRESS_FLOOR, destFloor: hf},
        {type: ACT.WAIT_FOR_FLOOR, floorNum: hf},
        {type: ACT.EXIT_ELEVATOR, floorNum: hf, toFloor: hf},
        {type: ACT.STAND},
        {type: ACT.WALK_TO_WP, floorNum: hf, wpName: agent.deskDoorWpName},
        {type: ACT.WALK_TO_WP, floorNum: hf, wpName: agent.deskWpName},
        {type: ACT.SIT, floorNum: hf, wpName: agent.deskWpName},
        {type: ACT.ENTER_STATE, targetState: 'AT_DESK'},
        {type: ACT.WAIT_SIM, duration: randInt(18, 65), floorNum: hf},
        {type: ACT.PICK_NEXT_ACTIVITY}
    ]);
}

function planVisitLounge(agent) {
    var hf = agent.homeFloor;
    var spotIdx = randInt(0, 2);
    var spotName = 'lounge_spot' + spotIdx;
    return compilePlan([
        {type: ACT.STAND},
        {type: ACT.WALK_TO_WP, floorNum: hf, wpName: agent.deskDoorWpName},
        {type: ACT.WALK_TO_WP, floorNum: hf, wpName: 'lounge_door'},
        {type: ACT.WALK_TO_WP, floorNum: hf, wpName: spotName},
        {type: ACT.SIT, floorNum: hf, wpName: spotName},
        {type: ACT.ENTER_STATE, targetState: 'AT_BREAK'},
        {type: ACT.WAIT_SIM, duration: randInt(5, 12), floorNum: hf},
        {type: ACT.STAND},
        {type: ACT.WALK_TO_WP, floorNum: hf, wpName: agent.deskDoorWpName},
        {type: ACT.WALK_TO_WP, floorNum: hf, wpName: agent.deskWpName},
        {type: ACT.SIT, floorNum: hf, wpName: agent.deskWpName},
        {type: ACT.ENTER_STATE, targetState: 'AT_DESK'},
        {type: ACT.WAIT_SIM, duration: randInt(18, 65), floorNum: hf},
        {type: ACT.PICK_NEXT_ACTIVITY}
    ]);
}

function planAttendMeeting(agent) {
    var hf = agent.homeFloor;
    var mFloor;
    if (Math.random() < 0.65) mFloor = hf;
    else mFloor = randInt(1, WORLD.FLOOR_COUNT - 1);

    var seatIdx = randInt(0, 3);
    var seatName = 'conf_seat' + seatIdx;

    if (!reserveSeat(mFloor, seatName)) {
        return planVisitLounge(agent);
    }
    agent.seatReservationKey = makeSeatKey(mFloor, seatName);
    agent.state = 'IN_MEETING';

    var plan = [];
    plan.push({type: ACT.STAND});
    plan.push({type: ACT.WALK_TO_WP, floorNum: hf, wpName: agent.deskDoorWpName});

    if (mFloor === hf) {
        plan.push({type: ACT.WALK_TO_WP, floorNum: hf, wpName: 'conf_door'});
        plan.push({type: ACT.WALK_TO_WP, floorNum: hf, wpName: 'conf_center'});
        plan.push({type: ACT.WALK_TO_WP, floorNum: hf, wpName: seatName});
        plan.push({type: ACT.SIT, floorNum: hf, wpName: seatName});
        plan.push({type: ACT.WAIT_SIM, duration: randInt(22, 45), floorNum: hf});
        plan.push({type: ACT.STAND});
        plan.push({type: ACT.RELEASE_SEAT});
        plan.push({type: ACT.WALK_TO_WP, floorNum: hf, wpName: agent.deskDoorWpName});
        plan.push({type: ACT.WALK_TO_WP, floorNum: hf, wpName: agent.deskWpName});
    } else {
        plan.push({type: ACT.WAIT_AT_PANEL, floorNum: hf, dir: mFloor > hf ? 1 : -1, toFloor: mFloor});
        plan.push({type: ACT.ENTER_ELEVATOR, floorNum: hf, dir: mFloor > hf ? 1 : -1, toFloor: mFloor});
        plan.push({type: ACT.PRESS_FLOOR, destFloor: mFloor});
        plan.push({type: ACT.WAIT_FOR_FLOOR, floorNum: mFloor});
        plan.push({type: ACT.EXIT_ELEVATOR, floorNum: mFloor, toFloor: mFloor});
        plan.push({type: ACT.STAND});
        plan.push({type: ACT.WALK_TO_WP, floorNum: mFloor, wpName: 'conf_door'});
        plan.push({type: ACT.WALK_TO_WP, floorNum: mFloor, wpName: 'conf_center'});
        plan.push({type: ACT.WALK_TO_WP, floorNum: mFloor, wpName: seatName});
        plan.push({type: ACT.SIT, floorNum: mFloor, wpName: seatName});
        plan.push({type: ACT.WAIT_SIM, duration: randInt(22, 45), floorNum: mFloor});
        plan.push({type: ACT.STAND});
        plan.push({type: ACT.RELEASE_SEAT});
        plan.push({type: ACT.WALK_TO_WP, floorNum: mFloor, wpName: 'elevWait'});
        plan.push({type: ACT.WAIT_AT_PANEL, floorNum: mFloor, dir: hf > mFloor ? 1 : -1, toFloor: hf});
        plan.push({type: ACT.ENTER_ELEVATOR, floorNum: mFloor, dir: hf > mFloor ? 1 : -1, toFloor: hf});
        plan.push({type: ACT.PRESS_FLOOR, destFloor: hf});
        plan.push({type: ACT.WAIT_FOR_FLOOR, floorNum: hf});
        plan.push({type: ACT.EXIT_ELEVATOR, floorNum: hf, toFloor: hf});
        plan.push({type: ACT.STAND});
        plan.push({type: ACT.WALK_TO_WP, floorNum: hf, wpName: agent.deskDoorWpName});
        plan.push({type: ACT.WALK_TO_WP, floorNum: hf, wpName: agent.deskWpName});
    }

    plan.push({type: ACT.SIT, floorNum: hf, wpName: agent.deskWpName});
    plan.push({type: ACT.ENTER_STATE, targetState: 'AT_DESK'});
    plan.push({type: ACT.WAIT_SIM, duration: randInt(18, 65), floorNum: hf});
    plan.push({type: ACT.PICK_NEXT_ACTIVITY});

    return compilePlan(plan);
}

function planVisitCoworker(agent) {
    var hf = agent.homeFloor;
    var coworkers = [];
    for (var i = 0; i < agents.length; i++) {
        var a = agents[i];
        if (a !== agent && a.role === 'WORKER' && a.state === 'AT_DESK') {
            coworkers.push(a);
        }
    }
    if (coworkers.length === 0) return planVisitLounge(agent);

    var target = pick(coworkers);
    var tFloor = target.homeFloor;
    var tDoor = target.deskDoorWpName;

    var plan = [];
    plan.push({type: ACT.STAND});
    plan.push({type: ACT.WALK_TO_WP, floorNum: hf, wpName: agent.deskDoorWpName});

    if (tFloor !== hf) {
        plan.push({type: ACT.WAIT_AT_PANEL, floorNum: hf, dir: tFloor > hf ? 1 : -1, toFloor: tFloor});
        plan.push({type: ACT.ENTER_ELEVATOR, floorNum: hf, dir: tFloor > hf ? 1 : -1, toFloor: tFloor});
        plan.push({type: ACT.PRESS_FLOOR, destFloor: tFloor});
        plan.push({type: ACT.WAIT_FOR_FLOOR, floorNum: tFloor});
        plan.push({type: ACT.EXIT_ELEVATOR, floorNum: tFloor, toFloor: tFloor});
        plan.push({type: ACT.STAND});
    }

    plan.push({type: ACT.WALK_TO_WP, floorNum: tFloor, wpName: tDoor});
    plan.push({type: ACT.ENTER_STATE, targetState: 'VISITING'});
    plan.push({type: ACT.WAIT_SIM, duration: randInt(6, 18), floorNum: tFloor});

    if (tFloor !== hf) {
        plan.push({type: ACT.WALK_TO_WP, floorNum: tFloor, wpName: 'elevWait'});
        plan.push({type: ACT.WAIT_AT_PANEL, floorNum: tFloor, dir: hf > tFloor ? 1 : -1, toFloor: hf});
        plan.push({type: ACT.ENTER_ELEVATOR, floorNum: tFloor, dir: hf > tFloor ? 1 : -1, toFloor: hf});
        plan.push({type: ACT.PRESS_FLOOR, destFloor: hf});
        plan.push({type: ACT.WAIT_FOR_FLOOR, floorNum: hf});
        plan.push({type: ACT.EXIT_ELEVATOR, floorNum: hf, toFloor: hf});
        plan.push({type: ACT.STAND});
    }

    plan.push({type: ACT.WALK_TO_WP, floorNum: hf, wpName: agent.deskWpName});
    plan.push({type: ACT.SIT, floorNum: hf, wpName: agent.deskWpName});
    plan.push({type: ACT.ENTER_STATE, targetState: 'AT_DESK'});
    plan.push({type: ACT.WAIT_SIM, duration: randInt(18, 65), floorNum: hf});
    plan.push({type: ACT.PICK_NEXT_ACTIVITY});

    return compilePlan(plan);
}

function planLeaveBuilding(agent) {
    var hf = agent.homeFloor;
    var plan = [];
    plan.push({type: ACT.STAND});
    if (agent.seatReservationKey) {
        plan.push({type: ACT.RELEASE_SEAT});
    }
    plan.push({type: ACT.WALK_TO_WP, floorNum: hf, wpName: agent.deskDoorWpName});
    plan.push({type: ACT.WAIT_AT_PANEL, floorNum: hf, dir: -1, toFloor: 0});
    plan.push({type: ACT.ENTER_ELEVATOR, floorNum: hf, dir: -1, toFloor: 0});
    plan.push({type: ACT.PRESS_FLOOR, destFloor: 0});
    plan.push({type: ACT.WAIT_FOR_FLOOR, floorNum: 0});
    plan.push({type: ACT.EXIT_ELEVATOR, floorNum: 0, toFloor: 0});
    plan.push({type: ACT.STAND});
    plan.push({type: ACT.WALK_TO_WP, floorNum: 0, wpName: 'entrance'});
    plan.push({type: ACT.ENTER_STATE, targetState: 'LEAVING'});
    plan.push({type: ACT.WALK_TO_WP, floorNum: 0, wpName: 'outside'});
    plan.push({type: ACT.EXIT_BUILDING});
    return compilePlan(plan);
}

function planVisitorVisit(agent) {
    var r = Math.random();
    var plan = [];

    plan.push({type: ACT.WALK_TO_WP, floorNum: 0, wpName: 'entrance'});

    if (r < 0.10) {
        var bt = randInt(0, 3);
        var bc = randInt(0, 1);
        plan.push({type: ACT.WALK_TO_WP, floorNum: 0, wpName: 'cafe_bistro_' + bt + '_' + bc});
        plan.push({type: ACT.SIT, floorNum: 0, wpName: 'cafe_bistro_' + bt + '_' + bc});
        plan.push({type: ACT.ENTER_STATE, targetState: 'VISITING'});
        plan.push({type: ACT.WAIT_SIM, duration: randInt(10, 30), floorNum: 0});
        plan.push({type: ACT.STAND});
    } else if (r < 0.16) {
        plan.push({type: ACT.WALK_TO_WP, floorNum: 0, wpName: 'cafe_order'});
        plan.push({type: ACT.ENTER_STATE, targetState: 'VISITING'});
        plan.push({type: ACT.WAIT_SIM, duration: randInt(3, 8), floorNum: 0});
    } else if (r < 0.30) {
        var flSpot = pick(['front_lounge_spot0', 'front_lounge_spot1']);
        plan.push({type: ACT.WALK_TO_WP, floorNum: 0, wpName: flSpot});
        plan.push({type: ACT.SIT, floorNum: 0, wpName: flSpot});
        plan.push({type: ACT.ENTER_STATE, targetState: 'VISITING'});
        plan.push({type: ACT.WAIT_SIM, duration: randInt(8, 25), floorNum: 0});
        plan.push({type: ACT.STAND});
    } else if (r < 0.42) {
        var blSpots = ['back_lounge_S', 'back_lounge_N', 'pit_N', 'pit_S', 'pit_E', 'pit_W'];
        var bls = pick(blSpots);
        plan.push({type: ACT.WALK_TO_WP, floorNum: 0, wpName: bls});
        plan.push({type: ACT.SIT, floorNum: 0, wpName: bls});
        plan.push({type: ACT.ENTER_STATE, targetState: 'VISITING'});
        plan.push({type: ACT.WAIT_SIM, duration: randInt(8, 25), floorNum: 0});
        plan.push({type: ACT.STAND});
    } else if (r < 0.52) {
        var spots = ['reception', 'kiosk', 'lobby_wc_front', 'lobby_wc_back'];
        var sp = pick(spots);
        plan.push({type: ACT.WALK_TO_WP, floorNum: 0, wpName: sp});
        plan.push({type: ACT.ENTER_STATE, targetState: 'VISITING'});
        plan.push({type: ACT.WAIT_SIM, duration: randInt(3, 10), floorNum: 0});
    } else if (r < 0.62) {
        var loit = pick(['lobby_stand_center', 'lobby_stand_NE', 'lobby_stand_NW', 'lobby_stand_midE', 'lobby_stand_midW', 'lobby_stand_entry']);
        plan.push({type: ACT.WALK_TO_WP, floorNum: 0, wpName: loit});
        plan.push({type: ACT.ENTER_STATE, targetState: 'VISITING'});
        plan.push({type: ACT.WAIT_SIM, duration: randInt(4, 15), floorNum: 0});
    } else if (r < 0.77) {
        var vFloor = randInt(1, WORLD.FLOOR_COUNT - 1);
        var lSpot = pick(['lounge_spot0', 'lounge_spot1', 'lounge_spot2', 'water_cooler', 'hall_stand_N', 'hall_stand_S']);
        plan.push({type: ACT.WAIT_AT_PANEL, floorNum: 0, dir: 1, toFloor: vFloor});
        plan.push({type: ACT.ENTER_ELEVATOR, floorNum: 0, dir: 1, toFloor: vFloor});
        plan.push({type: ACT.PRESS_FLOOR, destFloor: vFloor});
        plan.push({type: ACT.WAIT_FOR_FLOOR, floorNum: vFloor});
        plan.push({type: ACT.EXIT_ELEVATOR, floorNum: vFloor, toFloor: vFloor});
        plan.push({type: ACT.STAND});
        plan.push({type: ACT.WALK_TO_WP, floorNum: vFloor, wpName: 'lounge_door'});
        plan.push({type: ACT.WALK_TO_WP, floorNum: vFloor, wpName: lSpot});
        plan.push({type: ACT.SIT, floorNum: vFloor, wpName: lSpot});
        plan.push({type: ACT.ENTER_STATE, targetState: 'VISITING'});
        plan.push({type: ACT.WAIT_SIM, duration: randInt(8, 20), floorNum: vFloor});
        plan.push({type: ACT.STAND});
        plan.push({type: ACT.WALK_TO_WP, floorNum: vFloor, wpName: 'elevWait'});
        plan.push({type: ACT.WAIT_AT_PANEL, floorNum: vFloor, dir: -1, toFloor: 0});
        plan.push({type: ACT.ENTER_ELEVATOR, floorNum: vFloor, dir: -1, toFloor: 0});
        plan.push({type: ACT.PRESS_FLOOR, destFloor: 0});
        plan.push({type: ACT.WAIT_FOR_FLOOR, floorNum: 0});
        plan.push({type: ACT.EXIT_ELEVATOR, floorNum: 0, toFloor: 0});
        plan.push({type: ACT.STAND});
    } else {
        var mFloor = randInt(1, WORLD.FLOOR_COUNT - 1);
        var mSeatIdx = randInt(0, 3);
        var mSeatName = 'conf_seat' + mSeatIdx;

        if (reserveSeat(mFloor, mSeatName)) {
            agent.seatReservationKey = makeSeatKey(mFloor, mSeatName);

            plan.push({type: ACT.WAIT_AT_PANEL, floorNum: 0, dir: 1, toFloor: mFloor});
            plan.push({type: ACT.ENTER_ELEVATOR, floorNum: 0, dir: 1, toFloor: mFloor});
            plan.push({type: ACT.PRESS_FLOOR, destFloor: mFloor});
            plan.push({type: ACT.WAIT_FOR_FLOOR, floorNum: mFloor});
            plan.push({type: ACT.EXIT_ELEVATOR, floorNum: mFloor, toFloor: mFloor});
            plan.push({type: ACT.STAND});
            plan.push({type: ACT.WALK_TO_WP, floorNum: mFloor, wpName: 'conf_door'});
            plan.push({type: ACT.WALK_TO_WP, floorNum: mFloor, wpName: 'conf_center'});
            plan.push({type: ACT.WALK_TO_WP, floorNum: mFloor, wpName: mSeatName});
            plan.push({type: ACT.SIT, floorNum: mFloor, wpName: mSeatName});
            plan.push({type: ACT.ENTER_STATE, targetState: 'VISITING'});
            plan.push({type: ACT.WAIT_SIM, duration: randInt(15, 40), floorNum: mFloor});
            plan.push({type: ACT.STAND});
            plan.push({type: ACT.RELEASE_SEAT});
            plan.push({type: ACT.WALK_TO_WP, floorNum: mFloor, wpName: 'elevWait'});
            plan.push({type: ACT.WAIT_AT_PANEL, floorNum: mFloor, dir: -1, toFloor: 0});
            plan.push({type: ACT.ENTER_ELEVATOR, floorNum: mFloor, dir: -1, toFloor: 0});
            plan.push({type: ACT.PRESS_FLOOR, destFloor: 0});
            plan.push({type: ACT.WAIT_FOR_FLOOR, floorNum: 0});
            plan.push({type: ACT.EXIT_ELEVATOR, floorNum: 0, toFloor: 0});
            plan.push({type: ACT.STAND});
        } else {
            var fallback = pick(['lobby_stand_center', 'lobby_stand_NE', 'lobby_stand_midE', 'kiosk']);
            plan.push({type: ACT.WALK_TO_WP, floorNum: 0, wpName: fallback});
            plan.push({type: ACT.ENTER_STATE, targetState: 'VISITING'});
            plan.push({type: ACT.WAIT_SIM, duration: randInt(4, 15), floorNum: 0});
        }
    }

    plan.push({type: ACT.WALK_TO_WP, floorNum: 0, wpName: 'entrance'});
    plan.push({type: ACT.WALK_TO_WP, floorNum: 0, wpName: 'outside'});
    plan.push({type: ACT.EXIT_BUILDING});
    return compilePlan(plan);
}

function chooseNextActivity(agent) {
    if (agent.role === 'WORKER') {
        if (Clock.simMinute >= agent.departureTime && !agent.hasLunched) {
            agent.hasLunched = true;
        }
        if (Clock.simMinute >= agent.departureTime && (agent.hasLunched || Clock.simMinute > 14 * 60)) {
            return planLeaveBuilding(agent);
        }

        if (agent.plannedMeetingTimes && agent.plannedMeetingTimes.length > 0 &&
            Clock.simMinute >= agent.plannedMeetingTimes[0]) {
            agent.plannedMeetingTimes.shift();
            return planAttendMeeting(agent);
        }

        if (Clock.simMinute >= agent.lunchTime && !agent.hasLunched &&
            Clock.simMinute < 14 * 60) {
            return planGoToLunch(agent);
        }

        var roll = Math.random();
        if (roll < MEETING_PROB * 0.4) {
            return planAttendMeeting(agent);
        } else if (roll < MEETING_PROB * 0.4 + 0.12) {
            return planVisitLounge(agent);
        } else if (roll < MEETING_PROB * 0.4 + 0.12 + 0.15) {
            return planVisitCoworker(agent);
        } else {
            return compilePlan([
                {type: ACT.WAIT_SIM, duration: randInt(18, 65), floorNum: agent.homeFloor},
                {type: ACT.PICK_NEXT_ACTIVITY}
            ]);
        }
    } else {
        return planVisitorVisit(agent);
    }
}

// ========== Collision handling ==========
function applyCollisions(dt) {
    var active = [];
    for (var i = 0; i < agents.length; i++) {
        var a = agents[i];
        if (!a.group || !a.group.visible || a.group.userData.isSitting) continue;
        if (a.inCar) continue;
        if (a.currentAction && a.currentAction.type === 'ENTER_ELEVATOR') continue;
        if (a.state === 'GONE' || a.state === 'DISABLED' || a.state === 'AWAY') continue;
        active.push(a);
    }

    var pushScalar = 0.18;
    var minD = 0.7;

    for (var i = 0; i < active.length; i++) {
        var ai = active[i];
        for (var j = i + 1; j < active.length; j++) {
            var aj = active[j];
            if (ai.group.parent !== aj.group.parent) continue;

            var dx = ai.group.position.x - aj.group.position.x;
            var dz = ai.group.position.z - aj.group.position.z;
            var dy = ai.group.position.y - aj.group.position.y;

            if (Math.abs(dy) > 1.0) continue;

            var d = Math.sqrt(dx * dx + dz * dz);
            if (d < minD && d > 1e-6) {
                var force = (minD - d) * pushScalar;
                var nx = dx / d;
                var nz = dz / d;
                ai.group.position.x += nx * force * 0.5;
                ai.group.position.z += nz * force * 0.5;
                aj.group.position.x -= nx * force * 0.5;
                aj.group.position.z -= nz * force * 0.5;
            } else if (d < 1e-6) {
                var angle = Math.random() * Math.PI * 2;
                ai.group.position.x += Math.cos(angle) * 0.1;
                ai.group.position.z += Math.sin(angle) * 0.1;
                aj.group.position.x += Math.cos(angle + Math.PI) * 0.1;
                aj.group.position.z += Math.sin(angle + Math.PI) * 0.1;
            }
        }
    }
}

// ========== UI / HUD ==========
var hudEl = document.createElement('div');
hudEl.style.cssText = 'position:fixed;top:10px;left:10px;color:#ddd;font-family:monospace;font-size:13px;background:rgba(0,0,0,0.7);padding:10px;border-radius:6px;z-index:100;pointer-events:none;line-height:1.5;max-width:320px';
document.body.appendChild(hudEl);

var speedSliderCont = document.createElement('div');
speedSliderCont.style.cssText = 'position:fixed;bottom:20px;left:20px;color:#ccc;font-family:monospace;font-size:12px;background:rgba(0,0,0,0.7);padding:10px;border-radius:6px;z-index:100';
speedSliderCont.innerHTML = 'Speed: <input type="range" id="speedSlider" min="1" max="600" value="120" style="width:150px;vertical-align:middle"> <span id="speedLabel">120x</span>';
document.body.appendChild(speedSliderCont);

var occSliderCont = document.createElement('div');
occSliderCont.style.cssText = 'position:fixed;bottom:20px;left:250px;color:#ccc;font-family:monospace;font-size:12px;background:rgba(0,0,0,0.7);padding:10px;border-radius:6px;z-index:100';
occSliderCont.innerHTML = 'Occupancy: <input type="range" id="occSlider" min="1" max="' + MAX_OCCUPANCY + '" value="' + DEFAULT_OCCUPANCY + '" style="width:150px;vertical-align:middle"> <span id="occLabel">' + DEFAULT_OCCUPANCY + ' / ' + MAX_OCCUPANCY + '</span>';
document.body.appendChild(occSliderCont);

var speedSlider = document.getElementById('speedSlider');
var speedLabel = document.getElementById('speedLabel');
var occSlider = document.getElementById('occSlider');
var occLabel = document.getElementById('occLabel');

speedSlider.addEventListener('input', function() {
    var val = parseInt(speedSlider.value);
    Clock.timeScale = val;
    speedLabel.textContent = val + 'x';
});

occSlider.addEventListener('input', function() {
    var val = parseInt(occSlider.value);
    targetOccupancy = val;
    occLabel.textContent = val + ' / ' + MAX_OCCUPANCY;
    applyOccupancy();
});

function updateHUD() {
    var stateCounts = {};
    for (var i = 0; i < agents.length; i++) {
        var s = agents[i].state;
        stateCounts[s] = (stateCounts[s] || 0) + 1;
    }

    var ecf = elevator.currentFloor;
    var edir = elevator.direction === 1 ? 'UP' : elevator.direction === -1 ? 'DOWN' : 'IDLE';
    var est = ElevatorLogic.STATE_NAMES[elevator.logic.state];
    var epc = elevator.logic.passengers.size;

    var html = '<b style="font-size:16px;color:#ffbb22">' + Clock.format() + '</b><br>';
    html += '<b>Elevator:</b> Floor ' + ecf + ' ' + edir + ' (' + est + ') <br>';
    html += '&nbsp;&nbsp;Passengers: ' + epc + '/4<br>';
    html += '&nbsp;&nbsp;Up calls: ' + elevator.logic.upCalls.map(function(v, i) { return v ? i : -1; }).filter(function(v) { return v >= 0; }).join(',') + '<br>';
    html += '&nbsp;&nbsp;Down calls: ' + elevator.logic.downCalls.map(function(v, i) { return v ? i : -1; }).filter(function(v) { return v >= 0; }).join(',') + '<br>';
    html += '&nbsp;&nbsp;Dests: ' + elevator.logic.destinations.map(function(v, i) { return v ? i : -1; }).filter(function(v) { return v >= 0; }).join(',') + '<br>';
    html += '<br><b>Agents:</b><br>';
    var stateOrder = ['AT_DESK', 'WAITING_ELEVATOR', 'IN_CAR', 'ON_FLOOR', 'IN_MEETING', 'AT_BREAK', 'AT_LUNCH', 'VISITING', 'LEAVING', 'ARRIVING', 'AWAY', 'GONE', 'DISABLED'];
    for (var s = 0; s < stateOrder.length; s++) {
        var sn = stateOrder[s];
        if (stateCounts[sn]) {
            html += '&nbsp;&nbsp;' + sn + ': ' + stateCounts[sn] + '<br>';
        }
    }
    hudEl.innerHTML = html;
}

// ========== Initialize agents ==========
for (var i = 0; i < agents.length; i++) {
    var agent = agents[i];
    var g = createPerson();
    g.visible = false;
    g.userData.isWalking = false;
    g.userData.isSitting = false;
    g.userData._standY = 0;
    g.userData._sitY = -0.35;
    scene.add(g);
    agent.group = g;

    if (i < DEFAULT_OCCUPANCY) {
        agent.state = 'AWAY';
        initAgentSchedule(agent);
    } else {
        agent.state = 'DISABLED';
    }
}
applyOccupancy();

// ========== Render loop ==========
var clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);

    var realDt = Math.min(0.05, clock.getDelta());
    Clock.tick(realDt);
    updateLighting(Clock.simMinute);

    var motionDt = realDt * Clock.timeScale;

    topUpVisitors();
    elevator.tick(motionDt);

    for (var i = 0; i < agents.length; i++) {
        var agent = agents[i];
        if (agent.state === 'DISABLED') {
            if (agent.group) agent.group.visible = false;
            continue;
        }

        if (agent.state === 'AWAY' && Clock.simMinute >= agent.arrivalTime) {
            agent.state = 'ARRIVING';
            if (!agent.group.parent) scene.add(agent.group);
            agent.group.visible = true;
            agent.group.position.set(
                randFloat(-1.1, 1.1),
                0,
                WORLD.BUILDING_DEPTH / 2 + 3 + randFloat(-0.75, 0.75)
            );
            agent.group.userData._standY = 0;
            agent.group.userData.isSitting = false;
            agent.group.userData.isWalking = false;
            agent.inCar = false;

            if (agent.role === 'WORKER') {
                agent.plan = planArriveToDesk(agent);
            } else {
                agent.plan = planVisitorVisit(agent);
            }
        }

        if (agent.role === 'WORKER' &&
            agent.state !== 'LEAVING' && agent.state !== 'GONE' &&
            agent.state !== 'AWAY' && agent.state !== 'ARRIVING' &&
            agent.state !== 'DISABLED' &&
            Clock.simMinute >= agent.departureTime &&
            (agent.hasLunched || Clock.simMinute > 14 * 60)) {
            agent.plan = planLeaveBuilding(agent);
            agent.state = 'LEAVING';
        }

        if (agent.plan.length > 0 && !agent.currentAction) {
            agent.currentAction = agent.plan.shift();
            startAction(agent);
        }

        if (agent.currentAction) {
            var iterations = 0;
            while (agent.currentAction && iterations < 16) {
                processAction(agent, motionDt);
                if (!agent.currentAction && agent.plan.length > 0) {
                    agent.currentAction = agent.plan.shift();
                    startAction(agent);
                    iterations++;
                } else {
                    break;
                }
            }
        }
    }

    applyCollisions(motionDt);

    for (var i = 0; i < agents.length; i++) {
        if (agents[i].group && agents[i].group.visible) {
            animatePersonWalking(agents[i].group, motionDt);
        }
    }

    controls.update();
    renderer.render(scene, camera);
    updateHUD();
}

window.addEventListener('resize', function() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();
