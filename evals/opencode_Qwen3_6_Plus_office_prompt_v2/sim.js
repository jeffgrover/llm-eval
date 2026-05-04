(function() {
    var MAX_WORKERS = 20;
    var MAX_VISITORS = 80;
    var MAX_OCCUPANCY = MAX_WORKERS + MAX_VISITORS;
    var DEFAULT_OCCUPANCY = 45;
    var WALK_SPEED = 1.3;
    var MEETING_PROB = 0.36;

    var FIRST_NAMES = ['Alex','Sam','Jordan','Taylor','Morgan','Casey','Riley','Quinn','Avery','Harper',
        'Blake','Drew','Ellis','Finley','Gray','Hayden','Indigo','Jules','Kendall','Lane',
        'Marlowe','Nico','Oakley','Parker','Reese','Sage','Skyler','Toby','Uma','Val',
        'Winter','Xander','Yael','Zion','Ada','Bea','Cal','Dex','Eve','Fay',
        'Gus','Hugo','Iris','Jade','Kit','Leo','Mia','Noel','Opal','Pat',
        'Ren','Sue','Ty','Uma','Viv','Wren','Xia','Yuri','Zara','Ben',
        'Cleo','Dana','Eli','Fia','Glen','Hope','Ivan','Jin','Kai','Lynn',
        'Max','Nia','Omar','Pia','Rex','Sia','Troy','Una','Vince','Wade',
        'Yuki','Zane','Amy','Bob','Cora','Dan','Eva','Finn','Gia','Hal',
        'Ivy','Jay','Kim','Lee','Moe','Nora','Owen','Pam','Roy','Sue'];

    function randInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    function randFloat(min, max) {
        return Math.random() * (max - min) + min;
    }

    function pick(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    function formatTime(simMinute) {
        var mins = ((simMinute % (24 * 60)) + 24 * 60) % (24 * 60);
        var h = Math.floor(mins / 60);
        var m = Math.floor(mins % 60);
        var ampm = h >= 12 ? 'PM' : 'AM';
        var h12 = h % 12;
        if (h12 === 0) h12 = 12;
        return ' ' + h12 + ':' + (m < 10 ? '0' : '') + m + ' ' + ampm;
    }

    // Clock
    var Clock = {
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
            return formatTime(this.simMinute);
        }
    };

    // Scene setup
    var scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);

    var camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 200);
    camera.position.set(28, 24, 28);

    var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.sortObjects = true;
    document.body.appendChild(renderer.domElement);

    var controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.target.set(0, WORLD.FLOOR_HEIGHT * WORLD.FLOOR_COUNT / 2, 0);

    var ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    var sunLight = new THREE.DirectionalLight(0xffffff, 0.8);
    sunLight.position.set(10, 20, 10);
    scene.add(sunLight);

    var hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x444444, 0.4);
    scene.add(hemiLight);

    var world = createWorld(scene);
    var elevator = new Elevator(scene, world);

    // Day/night keyframes
    var dayNightKeyframes = [
        { hour: 0, bg: 0x0a0a1a, sunColor: 0x222244, sunIntensity: 0.05, ambientIntensity: 0.45, hemiIntensity: 0.32 },
        { hour: 5, bg: 0x0a0a1a, sunColor: 0x222244, sunIntensity: 0.05, ambientIntensity: 0.45, hemiIntensity: 0.32 },
        { hour: 6, bg: 0x2a1a3a, sunColor: 0xff8844, sunIntensity: 0.3, ambientIntensity: 0.5, hemiIntensity: 0.35 },
        { hour: 6.5, bg: 0x87ceeb, sunColor: 0xffeedd, sunIntensity: 0.7, ambientIntensity: 0.6, hemiIntensity: 0.4 },
        { hour: 7, bg: 0x87ceeb, sunColor: 0xffffff, sunIntensity: 0.8, ambientIntensity: 0.6, hemiIntensity: 0.4 },
        { hour: 17, bg: 0x87ceeb, sunColor: 0xffffff, sunIntensity: 0.8, ambientIntensity: 0.6, hemiIntensity: 0.4 },
        { hour: 17.5, bg: 0xff8844, sunColor: 0xff6622, sunIntensity: 0.5, ambientIntensity: 0.55, hemiIntensity: 0.38 },
        { hour: 18.5, bg: 0x2a1a3a, sunColor: 0x442266, sunIntensity: 0.1, ambientIntensity: 0.45, hemiIntensity: 0.32 },
        { hour: 19, bg: 0x0a0a1a, sunColor: 0x222244, sunIntensity: 0.05, ambientIntensity: 0.45, hemiIntensity: 0.32 },
        { hour: 24, bg: 0x0a0a1a, sunColor: 0x222244, sunIntensity: 0.05, ambientIntensity: 0.45, hemiIntensity: 0.32 },
    ];

    function lerpColor(c1, c2, t) {
        var r1 = (c1 >> 16) & 0xff, g1 = (c1 >> 8) & 0xff, b1 = c1 & 0xff;
        var r2 = (c2 >> 16) & 0xff, g2 = (c2 >> 8) & 0xff, b2 = c2 & 0xff;
        var r = Math.round(r1 + (r2 - r1) * t);
        var g = Math.round(g1 + (g2 - g1) * t);
        var b = Math.round(b1 + (b2 - b1) * t);
        return (r << 16) | (g << 8) | b;
    }

    function updateDayNight() {
        var hour = (Clock.simMinute / 60) % 24;
        var kf = dayNightKeyframes;
        var prev = kf[0], next = kf[kf.length - 1];
        for (var i = 0; i < kf.length - 1; i++) {
            if (hour >= kf[i].hour && hour < kf[i + 1].hour) {
                prev = kf[i];
                next = kf[i + 1];
                break;
            }
        }
        var range = next.hour - prev.hour;
        var t = range > 0 ? (hour - prev.hour) / range : 0;

        scene.background.setHex(lerpColor(prev.bg, next.bg, t));
        sunLight.color.setHex(lerpColor(prev.sunColor, next.sunColor, t));
        sunLight.intensity = prev.sunIntensity + (next.sunIntensity - prev.sunIntensity) * t;
        ambientLight.intensity = prev.ambientIntensity + (next.ambientIntensity - prev.ambientIntensity) * t;
        hemiLight.intensity = prev.hemiIntensity + (next.hemiIntensity - prev.hemiIntensity) * t;
    }

    // Agent creation
    var agents = [];
    var seatReservations = {};
    var targetOccupancy = DEFAULT_OCCUPANCY;

    function createAgent(index) {
        var isWorker = index < MAX_WORKERS;
        var role = isWorker ? 'WORKER' : 'VISITOR';
        var name = pick(FIRST_NAMES);

        var colors;
        if (isWorker) {
            colors = {
                bodyColor: pick(['#3498db', '#2ecc71', '#e74c3c', '#f39c12', '#9b59b6']),
                skinColor: pick(['#f5d0a9', '#d4a574', '#c68642', '#8d5524']),
                legColor: pick(['#2c3e50', '#34495e', '#1a1a2e'])
            };
        } else {
            colors = {
                bodyColor: pick(['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#34495e']),
                skinColor: pick(['#f5d0a9', '#d4a574', '#c68642', '#8d5524', '#f1c27d', '#e0ac69']),
                legColor: pick(['#2c3e50', '#34495e', '#1a1a2e', '#4a4a4a', '#2d3436', '#636e72'])
            };
        }

        var group = createPerson(colors);
        group.visible = false;

        var homeFloor = isWorker ? randInt(1, WORLD.FLOOR_COUNT - 1) : 0;
        var deskId = isWorker ? 'office' + pick(['A', 'B', 'C', 'D']) + '_desk' : null;

        var agent = {
            id: index,
            role: role,
            name: name,
            group: group,
            homeFloor: homeFloor,
            deskId: deskId,
            deskWpName: deskId,
            deskDoorWpName: deskId ? deskId.replace('_desk', '_door') : null,
            state: 'DISABLED',
            plan: [],
            currentAction: null,
            actionPhase: 0,
            path: [],
            pathIndex: 0,
            hasLunched: false,
            plannedMeetingTimes: [],
            arrivalTime: 0,
            lunchTime: 0,
            lunchDuration: 0,
            departureTime: 0,
            toFloor: 0,
            reservedSpot: null,
            _prevWp: null,
            _stallT: 0,
            _prevWalk: null,
            _stallWalkT: 0,
        };

        resampleSchedule(agent);
        scene.add(group);
        return agent;
    }

    function resampleSchedule(agent) {
        agent.arrivalTime = randInt(8 * 60 + 15, 9 * 60 + 30);
        agent.lunchTime = randInt(11 * 60 + 30, 13 * 60 + 30);
        agent.lunchDuration = randInt(25, 60);
        if (Math.random() < 0.15) {
            agent.departureTime = randInt(18 * 60 + 30, 19 * 60 + 45);
        } else {
            agent.departureTime = randInt(16 * 60 + 45, 18 * 60 + 30);
        }
        agent.plannedMeetingTimes = [];
        if (Math.random() < 0.5) {
            agent.plannedMeetingTimes.push(randInt(9 * 60, 11 * 60));
        }
        if (Math.random() < 0.3) {
            agent.plannedMeetingTimes.push(randInt(13 * 60, 15 * 60));
        }
        agent.hasLunched = false;
    }

    function initAgents() {
        for (var i = 0; i < MAX_OCCUPANCY; i++) {
            agents.push(createAgent(i));
        }
        applyOccupancy();
    }

    function applyOccupancy() {
        for (var i = 0; i < agents.length; i++) {
            var a = agents[i];
            if (a.state === 'GONE' || a.state === 'DISABLED') {
                if (i < targetOccupancy) {
                    a.state = 'AWAY';
                }
            } else if (i >= targetOccupancy) {
                // Leave running agents alone, they'll finish naturally
            }
        }
    }

    function countPresent() {
        var count = 0;
        for (var i = 0; i < agents.length; i++) {
            var a = agents[i];
            if (a.state !== 'DISABLED' && a.state !== 'GONE' && a.state !== 'AWAY') {
                count++;
            }
        }
        return count;
    }

    function topUpVisitors() {
        var hour = Clock.simMinute / 60;
        if (hour < 7 || hour > 20) return;

        var present = countPresent();
        var deficit = targetOccupancy - present;
        if (deficit <= 0) return;

        var armed = 0;
        for (var i = 0; i < agents.length && armed < deficit; i++) {
            var a = agents[i];
            if (a.role !== 'VISITOR') continue;
            if (a.state !== 'AWAY' && a.state !== 'GONE') continue;
            if (a.id >= targetOccupancy) continue;

            resampleSchedule(a);
            a.arrivalTime = Clock.simMinute + randInt(0, 6);
            a.state = 'AWAY';
            armed++;
        }
    }

    function getFloorData(floorNum) {
        return world.floors[floorNum];
    }

    function getNodePos(floorNum, wpName) {
        var fd = getFloorData(floorNum);
        if (!fd || !fd.nodes[wpName]) return null;
        return fd.nodes[wpName];
    }

    function getSitTarget(wpName) {
        for (var i = 0; i < world.floors.length; i++) {
            if (world.floors[i].sitTargets[wpName]) {
                return world.floors[i].sitTargets[wpName];
            }
        }
        return null;
    }

    function getAgentFloor(agent) {
        if (agent.group.parent === elevator.carGroup) {
            return Math.round(elevator.logic.currentFloor);
        }
        var y = agent.group.position.y;
        return Math.round(y / WORLD.FLOOR_HEIGHT);
    }

    function getAgentWorldPos(agent) {
        var pos = new THREE.Vector3();
        agent.group.getWorldPosition(pos);
        return pos;
    }

    // Plan compilers
    function planArriveToDesk(agent) {
        var actions = [];
        actions.push({ type: 'ENTER_STATE', state: 'ARRIVING' });
        actions.push({ type: 'WALK_TO_WP', floor: 0, wpName: 'entrance' });
        actions.push({ type: 'WALK_TO_WP', floor: 0, wpName: 'elevWait' });
        actions.push({ type: 'WAIT_AT_PANEL', floor: 0, dir: 1, toFloor: agent.homeFloor });
        actions.push({ type: 'ENTER_ELEVATOR', toFloor: agent.homeFloor });
        actions.push({ type: 'PRESS_FLOOR', floor: agent.homeFloor });
        actions.push({ type: 'WAIT_FOR_FLOOR', floor: agent.homeFloor });
        actions.push({ type: 'EXIT_ELEVATOR', toFloor: agent.homeFloor });
        actions.push({ type: 'WALK_TO_WP', floor: agent.homeFloor, wpName: agent.deskDoorWpName });
        actions.push({ type: 'WALK_TO_WP', floor: agent.homeFloor, wpName: agent.deskWpName });
        actions.push({ type: 'SIT', floor: agent.homeFloor, wpName: agent.deskWpName });
        actions.push({ type: 'ENTER_STATE', state: 'AT_DESK' });
        actions.push({ type: 'WAIT_SIM', minutes: randInt(15, 45) });
        actions.push({ type: 'PICK_NEXT_ACTIVITY' });
        return actions;
    }

    function planGoToLunch(agent) {
        var actions = [];
        actions.push({ type: 'STAND' });
        actions.push({ type: 'WALK_TO_WP', floor: agent.homeFloor, wpName: agent.deskDoorWpName });
        actions.push({ type: 'WALK_TO_WP', floor: agent.homeFloor, wpName: 'elevWait' });
        actions.push({ type: 'WAIT_AT_PANEL', floor: agent.homeFloor, dir: -1, toFloor: 0 });
        actions.push({ type: 'ENTER_ELEVATOR', toFloor: 0 });
        actions.push({ type: 'PRESS_FLOOR', floor: 0 });
        actions.push({ type: 'WAIT_FOR_FLOOR', floor: 0 });
        actions.push({ type: 'EXIT_ELEVATOR', toFloor: 0 });

        var bistroSpots = ['bistro0', 'bistro1', 'bistro2', 'bistro3'];
        var lunchSpot = pick(bistroSpots);
        actions.push({ type: 'WALK_TO_WP', floor: 0, wpName: lunchSpot });
        actions.push({ type: 'SIT', floor: 0, wpName: lunchSpot });
        actions.push({ type: 'ENTER_STATE', state: 'AT_LUNCH' });
        actions.push({ type: 'WAIT_SIM', minutes: agent.lunchDuration });
        actions.push({ type: 'MARK_LUNCHED' });
        actions.push({ type: 'STAND' });
        actions.push({ type: 'WALK_TO_WP', floor: 0, wpName: 'elevWait' });
        actions.push({ type: 'WAIT_AT_PANEL', floor: 0, dir: 1, toFloor: agent.homeFloor });
        actions.push({ type: 'ENTER_ELEVATOR', toFloor: agent.homeFloor });
        actions.push({ type: 'PRESS_FLOOR', floor: agent.homeFloor });
        actions.push({ type: 'WAIT_FOR_FLOOR', floor: agent.homeFloor });
        actions.push({ type: 'EXIT_ELEVATOR', toFloor: agent.homeFloor });
        actions.push({ type: 'WALK_TO_WP', floor: agent.homeFloor, wpName: agent.deskDoorWpName });
        actions.push({ type: 'WALK_TO_WP', floor: agent.homeFloor, wpName: agent.deskWpName });
        actions.push({ type: 'SIT', floor: agent.homeFloor, wpName: agent.deskWpName });
        actions.push({ type: 'ENTER_STATE', state: 'AT_DESK' });
        actions.push({ type: 'WAIT_SIM', minutes: randInt(10, 30) });
        actions.push({ type: 'PICK_NEXT_ACTIVITY' });
        return actions;
    }

    function planVisitLounge(agent) {
        var actions = [];
        actions.push({ type: 'STAND' });
        actions.push({ type: 'WALK_TO_WP', floor: agent.homeFloor, wpName: 'lounge_door' });
        actions.push({ type: 'WALK_TO_WP', floor: agent.homeFloor, wpName: 'lounge_spot0' });
        actions.push({ type: 'SIT', floor: agent.homeFloor, wpName: 'lounge_spot0' });
        actions.push({ type: 'ENTER_STATE', state: 'AT_BREAK' });
        actions.push({ type: 'WAIT_SIM', minutes: randInt(5, 12) });
        actions.push({ type: 'STAND' });
        actions.push({ type: 'WALK_TO_WP', floor: agent.homeFloor, wpName: agent.deskDoorWpName });
        actions.push({ type: 'WALK_TO_WP', floor: agent.homeFloor, wpName: agent.deskWpName });
        actions.push({ type: 'SIT', floor: agent.homeFloor, wpName: agent.deskWpName });
        actions.push({ type: 'ENTER_STATE', state: 'AT_DESK' });
        actions.push({ type: 'WAIT_SIM', minutes: randInt(10, 30) });
        actions.push({ type: 'PICK_NEXT_ACTIVITY' });
        return actions;
    }

    function planAttendMeeting(agent) {
        var meetingFloor;
        if (Math.random() < 0.65) {
            meetingFloor = agent.homeFloor;
        } else {
            meetingFloor = randInt(1, WORLD.FLOOR_COUNT - 1);
        }

        // Try to reserve a conference seat
        var seatKey = meetingFloor + ':conf_seat0';
        var seatName = null;
        for (var s = 0; s < 4; s++) {
            var key = meetingFloor + ':conf_seat' + s;
            if (!seatReservations[key]) {
                seatReservations[key] = agent.id;
                seatName = 'conf_seat' + s;
                break;
            }
        }

        if (!seatName) {
            // All seats taken, fall back to lounge break
            return planVisitLounge(agent);
        }

        var actions = [];
        actions.push({ type: 'STAND' });
        actions.push({ type: 'RELEASE_SEAT' });

        if (meetingFloor !== agent.homeFloor) {
            actions.push({ type: 'WALK_TO_WP', floor: agent.homeFloor, wpName: 'elevWait' });
            actions.push({ type: 'WAIT_AT_PANEL', floor: agent.homeFloor, dir: meetingFloor > agent.homeFloor ? 1 : -1, toFloor: meetingFloor });
            actions.push({ type: 'ENTER_ELEVATOR', toFloor: meetingFloor });
            actions.push({ type: 'PRESS_FLOOR', floor: meetingFloor });
            actions.push({ type: 'WAIT_FOR_FLOOR', floor: meetingFloor });
            actions.push({ type: 'EXIT_ELEVATOR', toFloor: meetingFloor });
        }

        actions.push({ type: 'WALK_TO_WP', floor: meetingFloor, wpName: 'conf_door' });
        actions.push({ type: 'WALK_TO_WP', floor: meetingFloor, wpName: seatName });
        actions.push({ type: 'SIT', floor: meetingFloor, wpName: seatName });
        actions.push({ type: 'ENTER_STATE', state: 'IN_MEETING' });
        actions.push({ type: 'WAIT_SIM', minutes: randInt(22, 45) });
        actions.push({ type: 'STAND' });
        actions.push({ type: 'RELEASE_SEAT' });

        if (meetingFloor !== agent.homeFloor) {
            actions.push({ type: 'WALK_TO_WP', floor: meetingFloor, wpName: 'elevWait' });
            actions.push({ type: 'WAIT_AT_PANEL', floor: meetingFloor, dir: agent.homeFloor > meetingFloor ? 1 : -1, toFloor: agent.homeFloor });
            actions.push({ type: 'ENTER_ELEVATOR', toFloor: agent.homeFloor });
            actions.push({ type: 'PRESS_FLOOR', floor: agent.homeFloor });
            actions.push({ type: 'WAIT_FOR_FLOOR', floor: agent.homeFloor });
            actions.push({ type: 'EXIT_ELEVATOR', toFloor: agent.homeFloor });
        }

        actions.push({ type: 'WALK_TO_WP', floor: agent.homeFloor, wpName: agent.deskDoorWpName });
        actions.push({ type: 'WALK_TO_WP', floor: agent.homeFloor, wpName: agent.deskWpName });
        actions.push({ type: 'SIT', floor: agent.homeFloor, wpName: agent.deskWpName });
        actions.push({ type: 'ENTER_STATE', state: 'AT_DESK' });
        actions.push({ type: 'WAIT_SIM', minutes: randInt(10, 30) });
        actions.push({ type: 'PICK_NEXT_ACTIVITY' });
        return actions;
    }

    function planVisitCoworker(agent) {
        // Find a random agent currently AT_DESK
        var candidates = [];
        for (var i = 0; i < agents.length; i++) {
            var other = agents[i];
            if (other.id === agent.id) continue;
            if (other.role !== 'WORKER') continue;
            if (other.state !== 'AT_DESK') continue;
            candidates.push(other);
        }

        if (candidates.length === 0) {
            return planVisitLounge(agent);
        }

        var target = pick(candidates);
        var targetFloor = target.homeFloor;
        var actions = [];
        actions.push({ type: 'STAND' });
        actions.push({ type: 'RELEASE_SEAT' });

        if (targetFloor !== agent.homeFloor) {
            actions.push({ type: 'WALK_TO_WP', floor: agent.homeFloor, wpName: 'elevWait' });
            actions.push({ type: 'WAIT_AT_PANEL', floor: agent.homeFloor, dir: targetFloor > agent.homeFloor ? 1 : -1, toFloor: targetFloor });
            actions.push({ type: 'ENTER_ELEVATOR', toFloor: targetFloor });
            actions.push({ type: 'PRESS_FLOOR', floor: targetFloor });
            actions.push({ type: 'WAIT_FOR_FLOOR', floor: targetFloor });
            actions.push({ type: 'EXIT_ELEVATOR', toFloor: targetFloor });
        }

        actions.push({ type: 'WALK_TO_WP', floor: targetFloor, wpName: target.deskDoorWpName });
        actions.push({ type: 'ENTER_STATE', state: 'VISITING' });
        actions.push({ type: 'WAIT_SIM', minutes: randInt(6, 18) });
        actions.push({ type: 'WALK_TO_WP', floor: agent.homeFloor === targetFloor ? agent.homeFloor : agent.homeFloor, wpName: 'elevWait' });

        if (targetFloor !== agent.homeFloor) {
            actions.push({ type: 'WAIT_AT_PANEL', floor: targetFloor, dir: agent.homeFloor > targetFloor ? 1 : -1, toFloor: agent.homeFloor });
            actions.push({ type: 'ENTER_ELEVATOR', toFloor: agent.homeFloor });
            actions.push({ type: 'PRESS_FLOOR', floor: agent.homeFloor });
            actions.push({ type: 'WAIT_FOR_FLOOR', floor: agent.homeFloor });
            actions.push({ type: 'EXIT_ELEVATOR', toFloor: agent.homeFloor });
        }

        actions.push({ type: 'WALK_TO_WP', floor: agent.homeFloor, wpName: agent.deskDoorWpName });
        actions.push({ type: 'WALK_TO_WP', floor: agent.homeFloor, wpName: agent.deskWpName });
        actions.push({ type: 'SIT', floor: agent.homeFloor, wpName: agent.deskWpName });
        actions.push({ type: 'ENTER_STATE', state: 'AT_DESK' });
        actions.push({ type: 'WAIT_SIM', minutes: randInt(10, 30) });
        actions.push({ type: 'PICK_NEXT_ACTIVITY' });
        return actions;
    }

    function planLeaveBuilding(agent) {
        var actions = [];
        actions.push({ type: 'STAND' });
        actions.push({ type: 'RELEASE_SEAT' });
        actions.push({ type: 'WALK_TO_WP', floor: agent.homeFloor, wpName: 'elevWait' });
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
        actions.push({ type: 'ENTER_STATE', state: 'ARRIVING' });
        // Spawn jitter
        actions.push({ type: 'WALK_TO_WP', floor: 0, wpName: 'outside' });
        actions.push({ type: 'WALK_TO_WP', floor: 0, wpName: 'entrance' });

        // Roll weighted activity
        var roll = Math.random();
        var activity;
        if (roll < 0.10) {
            // Bistro table
            var bistro = pick(['bistro0', 'bistro1', 'bistro2', 'bistro3']);
            actions.push({ type: 'WALK_TO_WP', floor: 0, wpName: bistro });
            actions.push({ type: 'SIT', floor: 0, wpName: bistro });
            actions.push({ type: 'ENTER_STATE', state: 'VISITING' });
            actions.push({ type: 'WAIT_SIM', minutes: randInt(8, 20) });
            actions.push({ type: 'STAND' });
        } else if (roll < 0.16) {
            // Cafe counter
            actions.push({ type: 'WALK_TO_WP', floor: 0, wpName: 'cafe_order' });
            actions.push({ type: 'ENTER_STATE', state: 'VISITING' });
            actions.push({ type: 'WAIT_SIM', minutes: randInt(3, 8) });
        } else if (roll < 0.30) {
            // Front lounge
            actions.push({ type: 'WALK_TO_WP', floor: 0, wpName: 'front_lounge' });
            actions.push({ type: 'SIT', floor: 0, wpName: 'front_lounge' });
            actions.push({ type: 'ENTER_STATE', state: 'VISITING' });
            actions.push({ type: 'WAIT_SIM', minutes: randInt(10, 25) });
            actions.push({ type: 'STAND' });
        } else if (roll < 0.42) {
            // Back lounge / conversation pit
            var pitSpot = pick(['back_lounge_N', 'back_lounge_S', 'pit_N', 'pit_S', 'pit_E', 'pit_W']);
            actions.push({ type: 'WALK_TO_WP', floor: 0, wpName: pitSpot });
            actions.push({ type: 'SIT', floor: 0, wpName: pitSpot });
            actions.push({ type: 'ENTER_STATE', state: 'VISITING' });
            actions.push({ type: 'WAIT_SIM', minutes: randInt(8, 20) });
            actions.push({ type: 'STAND' });
        } else if (roll < 0.52) {
            // Reception / kiosk / water cooler
            var standSpot = pick(['reception', 'kiosk', 'lobby_wc_front', 'lobby_wc_back']);
            actions.push({ type: 'WALK_TO_WP', floor: 0, wpName: standSpot });
            actions.push({ type: 'ENTER_STATE', state: 'VISITING' });
            actions.push({ type: 'WAIT_SIM', minutes: randInt(3, 10) });
        } else if (roll < 0.62) {
            // Lobby loiter
            var loiterSpot = pick(['lobby_stand_center', 'lobby_stand_NE', 'lobby_stand_NW', 'lobby_stand_midE', 'lobby_stand_midW', 'lobby_stand_entry']);
            actions.push({ type: 'WALK_TO_WP', floor: 0, wpName: loiterSpot });
            actions.push({ type: 'ENTER_STATE', state: 'VISITING' });
            actions.push({ type: 'WAIT_SIM', minutes: randInt(5, 15) });
        } else if (roll < 0.77) {
            // Ride up to office-floor lounge
            var upFloor = randInt(1, WORLD.FLOOR_COUNT - 1);
            actions.push({ type: 'WALK_TO_WP', floor: 0, wpName: 'elevWait' });
            actions.push({ type: 'WAIT_AT_PANEL', floor: 0, dir: 1, toFloor: upFloor });
            actions.push({ type: 'ENTER_ELEVATOR', toFloor: upFloor });
            actions.push({ type: 'PRESS_FLOOR', floor: upFloor });
            actions.push({ type: 'WAIT_FOR_FLOOR', floor: upFloor });
            actions.push({ type: 'EXIT_ELEVATOR', toFloor: upFloor });
            actions.push({ type: 'WALK_TO_WP', floor: upFloor, wpName: 'lounge_spot0' });
            actions.push({ type: 'SIT', floor: upFloor, wpName: 'lounge_spot0' });
            actions.push({ type: 'ENTER_STATE', state: 'VISITING' });
            actions.push({ type: 'WAIT_SIM', minutes: randInt(5, 15) });
            actions.push({ type: 'STAND' });
            actions.push({ type: 'WALK_TO_WP', floor: upFloor, wpName: 'elevWait' });
            actions.push({ type: 'WAIT_AT_PANEL', floor: upFloor, dir: -1, toFloor: 0 });
            actions.push({ type: 'ENTER_ELEVATOR', toFloor: 0 });
            actions.push({ type: 'PRESS_FLOOR', floor: 0 });
            actions.push({ type: 'WAIT_FOR_FLOOR', floor: 0 });
            actions.push({ type: 'EXIT_ELEVATOR', toFloor: 0 });
        } else {
            // Sit in on a meeting (~23%)
            var meetingFloor = randInt(1, WORLD.FLOOR_COUNT - 1);
            var seatKey2 = meetingFloor + ':conf_seat0';
            var seatName2 = null;
            for (var s2 = 0; s2 < 4; s2++) {
                var key2 = meetingFloor + ':conf_seat' + s2;
                if (!seatReservations[key2]) {
                    seatReservations[key2] = agent.id;
                    seatName2 = 'conf_seat' + s2;
                    break;
                }
            }
            if (!seatName2) {
                // Fallback to lobby loiter
                var loiterSpot2 = pick(['lobby_stand_center', 'lobby_stand_NE', 'lobby_stand_NW']);
                actions.push({ type: 'WALK_TO_WP', floor: 0, wpName: loiterSpot2 });
                actions.push({ type: 'ENTER_STATE', state: 'VISITING' });
                actions.push({ type: 'WAIT_SIM', minutes: randInt(10, 20) });
            } else {
                actions.push({ type: 'WALK_TO_WP', floor: 0, wpName: 'elevWait' });
                actions.push({ type: 'WAIT_AT_PANEL', floor: 0, dir: 1, toFloor: meetingFloor });
                actions.push({ type: 'ENTER_ELEVATOR', toFloor: meetingFloor });
                actions.push({ type: 'PRESS_FLOOR', floor: meetingFloor });
                actions.push({ type: 'WAIT_FOR_FLOOR', floor: meetingFloor });
                actions.push({ type: 'EXIT_ELEVATOR', toFloor: meetingFloor });
                actions.push({ type: 'WALK_TO_WP', floor: meetingFloor, wpName: 'conf_door' });
                actions.push({ type: 'WALK_TO_WP', floor: meetingFloor, wpName: seatName2 });
                actions.push({ type: 'SIT', floor: meetingFloor, wpName: seatName2 });
                actions.push({ type: 'ENTER_STATE', state: 'IN_MEETING' });
                actions.push({ type: 'WAIT_SIM', minutes: randInt(15, 35) });
                actions.push({ type: 'STAND' });
                actions.push({ type: 'RELEASE_SEAT' });
                actions.push({ type: 'WALK_TO_WP', floor: meetingFloor, wpName: 'elevWait' });
                actions.push({ type: 'WAIT_AT_PANEL', floor: meetingFloor, dir: -1, toFloor: 0 });
                actions.push({ type: 'ENTER_ELEVATOR', toFloor: 0 });
                actions.push({ type: 'PRESS_FLOOR', floor: 0 });
                actions.push({ type: 'WAIT_FOR_FLOOR', floor: 0 });
                actions.push({ type: 'EXIT_ELEVATOR', toFloor: 0 });
            }
        }

        actions.push({ type: 'WALK_TO_WP', floor: 0, wpName: 'entrance' });
        actions.push({ type: 'WALK_TO_WP', floor: 0, wpName: 'outside' });
        actions.push({ type: 'EXIT_BUILDING' });
        return actions;
    }

    function chooseNextActivity(agent) {
        var mins = Clock.simMinute;

        // Past departure time
        if (mins >= agent.departureTime) {
            return planLeaveBuilding(agent);
        }

        // Planned meeting
        for (var i = 0; i < agent.plannedMeetingTimes.length; i++) {
            if (mins >= agent.plannedMeetingTimes[i]) {
                agent.plannedMeetingTimes.splice(i, 1);
                return planAttendMeeting(agent);
            }
        }

        // Past lunch window and hasn't lunched
        if (mins >= agent.lunchTime + agent.lunchDuration && !agent.hasLunched && mins >= 11 * 60 + 30) {
            return planGoToLunch(agent);
        }

        // Weighted die
        var roll = Math.random();
        if (roll < MEETING_PROB * 0.4) {
            return planAttendMeeting(agent);
        } else if (roll < MEETING_PROB * 0.4 + 0.12) {
            return planVisitLounge(agent);
        } else if (roll < MEETING_PROB * 0.4 + 0.12 + 0.15) {
            return planVisitCoworker(agent);
        } else {
            var actions = [];
            actions.push({ type: 'WAIT_SIM', minutes: randInt(18, 65) });
            actions.push({ type: 'PICK_NEXT_ACTIVITY' });
            return actions;
        }
    }

    // Action execution
    function startAction(agent, action) {
        agent.currentAction = action;
        agent.actionPhase = 0;
        agent.path = [];
        agent.pathIndex = 0;
        agent._prevWp = null;
        agent._stallT = 0;
        agent._prevWalk = null;
        agent._stallWalkT = 0;

        if (action.type === 'WAIT_SIM') {
            action._untilMin = Clock.simMinute + action.minutes;
        }

        if (action.type === 'SIT') {
            var target = getSitTarget(action.wpName);
            if (target) {
                agent.group.userData.isSitting = true;
                agent.group.rotation.y = target.facing;
                if (target.sit === false) {
                    // Standing waypoint - jitter position
                    agent.group.position.x += randFloat(-0.35, 0.35);
                    agent.group.position.z += randFloat(-0.35, 0.35);
                } else {
                    agent.group.position.y -= 0.35;
                }
            }
        }

        if (action.type === 'STAND') {
            agent.group.userData.isSitting = false;
            if (agent.group.parent !== elevator.carGroup) {
                var floor = getAgentFloor(agent);
                agent.group.position.y = floor * WORLD.FLOOR_HEIGHT;
            } else {
                agent.group.position.y = 0;
            }
        }

        if (action.type === 'RELEASE_SEAT') {
            for (var key in seatReservations) {
                if (seatReservations[key] === agent.id) {
                    delete seatReservations[key];
                }
            }
        }

        if (action.type === 'WALK_TO_WP') {
            var fromPos = getAgentWorldPos(agent);
            var toPos = getNodePos(action.floor, action.wpName);
            if (toPos) {
                agent.path = world.bfsPath(action.wpName, action.wpName);
                if (agent.path.length === 0) {
                    agent.path = [fromPos.clone(), toPos.clone()];
                }
                agent.pathIndex = 0;
            }
        }

        if (action.type === 'ENTER_ELEVATOR') {
            agent.toFloor = action.toFloor;
        }

        if (action.type === 'EXIT_ELEVATOR') {
            agent.toFloor = action.toFloor;
        }

        if (action.type === 'ENTER_STATE') {
            agent.state = action.state;
        }

        if (action.type === 'MARK_LUNCHED') {
            agent.hasLunched = true;
        }

        if (action.type === 'PICK_NEXT_ACTIVITY') {
            if (agent.role === 'VISITOR') {
                agent.plan = planVisitorVisit(agent);
            } else {
                agent.plan = chooseNextActivity(agent);
            }
            agent.currentAction = null;
            return;
        }

        if (action.type === 'EXIT_BUILDING') {
            agent.group.visible = false;
            agent.state = 'GONE';
            agent.currentAction = null;
            return;
        }

        if (action.type === 'PRESS_FLOOR') {
            elevator.pressDestination(action.floor);
            agent.currentAction = null;
            return;
        }
    }

    function updateAction(agent, motionDt) {
        if (!agent.currentAction) return;

        var action = agent.currentAction;

        if (action.type === 'WAIT_SIM') {
            if (Clock.simMinute >= action._untilMin) {
                agent.currentAction = null;
            }
            return;
        }

        if (action.type === 'WAIT_AT_PANEL') {
            // Re-press call every frame
            if (action.dir > 0) {
                elevator.callUp(action.floor);
            } else {
                elevator.callDown(action.floor);
            }

            var accepting = elevator.isAcceptingAt(action.floor, action.dir);
            if (accepting) {
                agent.currentAction = null;
            }
            agent.group.userData.isWalking = false;
            return;
        }

        if (action.type === 'WAIT_FOR_FLOOR') {
            if (elevator.state === 'DOOR_OPEN' && Math.round(elevator.logic.currentFloor) === action.floor) {
                agent.currentAction = null;
            }
            agent.group.userData.isWalking = false;
            return;
        }

        if (action.type === 'ENTER_ELEVATOR') {
            var spot = agent.reservedSpot;
            if (!spot) {
                spot = elevator.reserveBoardingSpot(agent);
                if (!spot) {
                    // Car left, re-press call
                    if (action.toFloor > agent.homeFloor || (agent.homeFloor === 0 && action.toFloor > 0)) {
                        elevator.callUp(0);
                    } else {
                        elevator.callDown(Math.round(elevator.logic.currentFloor));
                    }
                    return;
                }
                agent.reservedSpot = spot;
            }

            var carFloor = Math.round(elevator.logic.currentFloor);
            var carY = carFloor * WORLD.FLOOR_HEIGHT;

            if (agent.actionPhase === 0) {
                // Walk to door threshold
                agent.group.userData.isWalking = true;
                var doorX = spot.x;
                var doorZ = WORLD.SHAFT_DEPTH / 2 + 0.5;
                var targetPos = new THREE.Vector3(doorX, carY, doorZ);
                var pos = agent.group.position;
                var dx = targetPos.x - pos.x;
                var dz = targetPos.z - pos.z;
                var dist = Math.sqrt(dx * dx + dz * dz);

                if (dist < 0.3) {
                    agent.actionPhase = 1;
                    agent._prevWalk = null;
                    agent._stallWalkT = 0;
                } else {
                    var moveX = (dx / dist) * WALK_SPEED * motionDt;
                    var moveZ = (dz / dist) * WALK_SPEED * motionDt;
                    pos.x += moveX;
                    pos.z += moveZ;

                    // Face direction of movement
                    agent.group.rotation.y = Math.atan2(dx, dz);

                    // Stall recovery
                    if (!agent._prevWalk) {
                        agent._prevWalk = pos.clone();
                        agent._stallWalkT = 0;
                    } else {
                        var progress = pos.distanceTo(agent._prevWalk);
                        if (progress < 0.005) {
                            agent._stallWalkT += motionDt;
                        } else {
                            agent._prevWalk = pos.clone();
                            agent._stallWalkT = 0;
                        }
                        if (agent._stallWalkT > 1.5) {
                            pos.x = doorX;
                            pos.z = doorZ;
                            agent.actionPhase = 1;
                        }
                    }
                }
            } else if (agent.actionPhase === 1) {
                // Reparent to car
                var worldPos = new THREE.Vector3();
                agent.group.getWorldPosition(worldPos);
                agent.group.parent.remove(agent.group);
                elevator.carGroup.add(agent.group);
                agent.group.position.set(worldPos.x, 0, worldPos.z - carY);
                agent.actionPhase = 2;
            } else if (agent.actionPhase === 2) {
                // Walk to interior spot in car-local space
                agent.group.userData.isWalking = true;
                var spotPos = new THREE.Vector3(spot.x, 0, spot.z);
                var pos2 = agent.group.position;
                var dx2 = spotPos.x - pos2.x;
                var dz2 = spotPos.z - pos2.z;
                var dist2 = Math.sqrt(dx2 * dx2 + dz2 * dz2);

                if (dist2 < 0.2) {
                    elevator.completeBoard(agent);
                    agent.group.rotation.y = 0; // Face doors
                    agent.group.userData.isWalking = false;
                    agent.currentAction = null;
                } else {
                    var moveX2 = (dx2 / dist2) * WALK_SPEED * motionDt;
                    var moveZ2 = (dz2 / dist2) * WALK_SPEED * motionDt;
                    pos2.x += moveX2;
                    pos2.z += moveZ2;
                }
            }
            return;
        }

        if (action.type === 'EXIT_ELEVATOR') {
            if (agent.actionPhase === 0) {
                // Reparent car -> scene
                var worldPos2 = new THREE.Vector3();
                agent.group.getWorldPosition(worldPos2);
                elevator.carGroup.remove(agent.group);
                scene.add(agent.group);
                var exitFloor = agent.toFloor;
                agent.group.position.set(worldPos2.x, exitFloor * WORLD.FLOOR_HEIGHT, worldPos2.z);
                elevator.registerDisembark(agent);
                agent.actionPhase = 1;
            } else if (agent.actionPhase === 1) {
                // Walk to elevWait on target floor
                agent.group.userData.isWalking = true;
                var elevWaitPos = getNodePos(agent.toFloor, 'elevWait');
                if (elevWaitPos) {
                    var pos3 = agent.group.position;
                    var dx3 = elevWaitPos.x - pos3.x;
                    var dz3 = elevWaitPos.z - pos3.z;
                    var dist3 = Math.sqrt(dx3 * dx3 + dz3 * dz3);

                    if (dist3 < 0.3) {
                        elevator.completeDisembark(agent);
                        agent.group.userData.isWalking = false;
                        agent.currentAction = null;
                    } else {
                        var moveX3 = (dx3 / dist3) * WALK_SPEED * motionDt;
                        var moveZ3 = (dz3 / dist3) * WALK_SPEED * motionDt;
                        pos3.x += moveX3;
                        pos3.z += moveZ3;
                        agent.group.rotation.y = Math.atan2(dx3, dz3);
                    }
                } else {
                    elevator.completeDisembark(agent);
                    agent.currentAction = null;
                }
            }
            return;
        }

        if (action.type === 'WALK_TO_WP') {
            agent.group.userData.isWalking = true;
            if (agent.path.length < 2) {
                agent.group.userData.isWalking = false;
                agent.currentAction = null;
                return;
            }

            var target = agent.path[Math.min(agent.pathIndex + 1, agent.path.length - 1)];
            var pos4 = agent.group.position;
            var dx4 = target.x - pos4.x;
            var dz4 = target.z - pos4.z;
            var dist4 = Math.sqrt(dx4 * dx4 + dz4 * dz4);

            if (dist4 < 0.3) {
                agent.pathIndex++;
                if (agent.pathIndex >= agent.path.length - 1) {
                    agent.group.userData.isWalking = false;
                    agent.currentAction = null;
                }
                agent._prevWp = null;
                agent._stallT = 0;
            } else {
                var moveX4 = (dx4 / dist4) * WALK_SPEED * motionDt;
                var moveZ4 = (dz4 / dist4) * WALK_SPEED * motionDt;
                pos4.x += moveX4;
                pos4.z += moveZ4;
                agent.group.rotation.y = Math.atan2(dx4, dz4);

                // Stall recovery
                if (!agent._prevWp) {
                    agent._prevWp = pos4.clone();
                    agent._stallT = 0;
                } else {
                    var progress4 = pos4.distanceTo(agent._prevWp);
                    if (progress4 < 0.005) {
                        agent._stallT += motionDt;
                    } else {
                        agent._prevWp = pos4.clone();
                        agent._stallT = 0;
                    }
                    if (agent._stallT > 1.2) {
                        agent.pathIndex++;
                        agent._prevWp = null;
                        agent._stallT = 0;
                        if (agent.pathIndex >= agent.path.length - 1) {
                            agent.group.userData.isWalking = false;
                            agent.currentAction = null;
                        }
                    }
                }
            }
            return;
        }

        // Zero-duration actions
        if (action.type === 'SIT' || action.type === 'STAND' || action.type === 'RELEASE_SEAT' ||
            action.type === 'ENTER_STATE' || action.type === 'MARK_LUNCHED') {
            agent.currentAction = null;
            return;
        }
    }

    function processAgent(agent, motionDt) {
        if (agent.state === 'DISABLED' || agent.state === 'GONE') return;

        // Spawn if AWAY and arrived
        if (agent.state === 'AWAY') {
            if (Clock.simMinute >= agent.arrivalTime) {
                agent.state = 'ARRIVING';
                agent.group.visible = true;

                // Spawn at outside with jitter
                var outsidePos = getNodePos(0, 'outside');
                if (outsidePos) {
                    agent.group.parent = scene;
                    agent.group.position.set(
                        outsidePos.x + randFloat(-1.1, 1.1),
                        0,
                        outsidePos.z + randFloat(-0.75, 0.75)
                    );
                }

                if (agent.role === 'WORKER') {
                    agent.plan = planArriveToDesk(agent);
                } else {
                    agent.plan = planVisitorVisit(agent);
                }
            }
            return;
        }

        // Check if past departure for workers
        if (agent.role === 'WORKER' && agent.state !== 'LEAVING' && agent.state !== 'GONE' && agent.state !== 'ARRIVING') {
            if (Clock.simMinute >= agent.departureTime) {
                agent.plan = planLeaveBuilding(agent);
                agent.currentAction = null;
            }
        }

        // Action dispatch loop (up to 16 iterations per frame)
        for (var i = 0; i < 16; i++) {
            if (!agent.currentAction && agent.plan.length > 0) {
                var nextAction = agent.plan.shift();
                startAction(agent, nextAction);
            }

            if (agent.currentAction) {
                updateAction(agent, motionDt);
                if (agent.currentAction === null) continue;
            }

            if (agent.state === 'GONE' || agent.state === 'DISABLED') break;
            break;
        }
    }

    // Collisions
    function applyCollisions() {
        for (var i = 0; i < agents.length; i++) {
            var a = agents[i];
            if (a.state === 'DISABLED' || a.state === 'GONE') continue;
            if (!a.group.visible) continue;
            if (a.group.userData.isSitting) continue;
            if (a.group.parent === elevator.carGroup) continue;
            if (a.currentAction && a.currentAction.type === 'ENTER_ELEVATOR') continue;

            var posA = getAgentWorldPos(a);

            for (var j = i + 1; j < agents.length; j++) {
                var b = agents[j];
                if (b.state === 'DISABLED' || b.state === 'GONE') continue;
                if (!b.group.visible) continue;
                if (b.group.userData.isSitting) continue;
                if (b.group.parent === elevator.carGroup) continue;
                if (b.currentAction && b.currentAction.type === 'ENTER_ELEVATOR') continue;

                if (Math.abs(posA.y - b.group.parent.children.indexOf(b) >= 0 ? b.group.position.y + (b.group.parent === scene ? 0 : b.group.parent.position.y) : 0) > 1) continue;

                var posB = getAgentWorldPos(b);
                var dy = Math.abs(posA.y - posB.y);
                if (dy > 1) continue;

                var dx = posA.x - posB.x;
                var dz = posA.z - posB.z;
                var d = Math.sqrt(dx * dx + dz * dz);

                if (d < 0.7) {
                    var push = 0.18;
                    if (d < 1e-3) {
                        // Exact overlap - random separation
                        var angle = Math.random() * Math.PI * 2;
                        dx = Math.cos(angle);
                        dz = Math.sin(angle);
                        d = 0.01;
                    }
                    var nx = dx / d;
                    var nz = dz / d;
                    a.group.position.x += nx * push;
                    a.group.position.z += nz * push;
                    b.group.position.x -= nx * push;
                    b.group.position.z -= nz * push;
                }
            }
        }
    }

    // HUD
    var hudDiv = document.createElement('div');
    hudDiv.style.cssText = 'position:fixed;top:10px;left:10px;color:#fff;font-family:monospace;font-size:13px;background:rgba(0,0,0,0.6);padding:12px;border-radius:8px;z-index:100;min-width:280px;';
    document.body.appendChild(hudDiv);

    var speedSlider = document.createElement('input');
    speedSlider.type = 'range';
    speedSlider.min = 0;
    speedSlider.max = 100;
    speedSlider.value = Math.round(100 * Math.log(120) / Math.log(600));
    speedSlider.style.cssText = 'width:200px;';
    hudDiv.appendChild(document.createTextNode('Speed: '));
    hudDiv.appendChild(speedSlider);
    hudDiv.appendChild(document.createElement('br'));

    var occSlider = document.createElement('input');
    occSlider.type = 'range';
    occSlider.min = 1;
    occSlider.max = MAX_OCCUPANCY;
    occSlider.value = DEFAULT_OCCUPANCY;
    occSlider.style.cssText = 'width:200px;';
    hudDiv.appendChild(document.createTextNode('Occupancy: ' + DEFAULT_OCCUPANCY + ' / ' + MAX_OCCUPANCY + ' people'));
    hudDiv.appendChild(occSlider);
    hudDiv.appendChild(document.createElement('br'));

    var stateDiv = document.createElement('div');
    stateDiv.style.cssText = 'margin-top:8px;font-size:11px;';
    hudDiv.appendChild(stateDiv);

    speedSlider.addEventListener('input', function() {
        var t = this.value / 100;
        Clock.timeScale = Math.exp(t * Math.log(600));
    });

    occSlider.addEventListener('input', function() {
        targetOccupancy = parseInt(this.value);
        hudDiv.childNodes[2].textContent = 'Occupancy: ' + targetOccupancy + ' / ' + MAX_OCCUPANCY + ' people';
        applyOccupancy();
    });

    function updateHUD() {
        var timeStr = Clock.format();
        hudDiv.childNodes[0].textContent = 'Time: ' + timeStr + ' | ';

        var stateCounts = {};
        for (var i = 0; i < agents.length; i++) {
            var s = agents[i].state;
            stateCounts[s] = (stateCounts[s] || 0) + 1;
        }

        var lines = ['States:'];
        for (var s in stateCounts) {
            lines.push('  ' + s + ': ' + stateCounts[s]);
        }

        lines.push('Elevator: floor=' + elevator.currentFloor + ' dir=' + elevator.direction +
            ' state=' + elevator.state + ' passengers=' + elevator.passengers.size);
        lines.push('  destinations: [' + [...elevator.destinations].join(',') + ']');
        lines.push('  upCalls: [' + [...elevator.upCalls].join(',') + ']');
        lines.push('  downCalls: [' + [...elevator.downCalls].join(',') + ']');

        stateDiv.innerHTML = lines.join('<br>');
    }

    // Init
    initAgents();

    var clock = new THREE.Clock();

    function animate() {
        requestAnimationFrame(animate);

        var realDt = Math.min(0.05, clock.getDelta());
        var dayWrapped = Clock.tick(realDt);

        if (dayWrapped) {
            // Reset agents and elevator
            for (var i = 0; i < agents.length; i++) {
                var a = agents[i];
                resampleSchedule(a);
                a.state = 'DISABLED';
                a.group.visible = false;
                a.plan = [];
                a.currentAction = null;
                a.reservedSpot = null;
                // Release any seat reservations
                for (var key in seatReservations) {
                    if (seatReservations[key] === a.id) {
                        delete seatReservations[key];
                    }
                }
            }
            elevator.reset();
            applyOccupancy();
        }

        updateDayNight();

        var motionDt = realDt * Clock.timeScale;
        elevator.tick(motionDt);

        topUpVisitors();

        for (var i = 0; i < agents.length; i++) {
            processAgent(agents[i], motionDt);
        }

        applyCollisions();

        for (var i = 0; i < agents.length; i++) {
            var a = agents[i];
            if (a.group.visible && a.group.parent) {
                animatePersonWalking(a.group, motionDt);
            }
        }

        controls.update();
        renderer.render(scene, camera);
        updateHUD();
    }

    animate();

    window.addEventListener('resize', function() {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
})();
