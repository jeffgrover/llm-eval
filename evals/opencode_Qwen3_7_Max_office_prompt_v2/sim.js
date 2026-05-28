(function() {
    const MAX_WORKERS = 20;
    const MAX_VISITORS = 80;
    const MAX_OCCUPANCY = MAX_WORKERS + MAX_VISITORS;
    const DEFAULT_OCCUPANCY = 45;
    const MEETING_PROB = 0.36;

    const FIRST_NAMES = ['Alice', 'Bob', 'Carol', 'David', 'Eve', 'Frank', 'Grace', 'Henry', 'Iris', 'Jack', 'Kate', 'Leo', 'Mia', 'Noah', 'Olivia', 'Paul', 'Quinn', 'Ryan', 'Sarah', 'Tom'];

    class Clock {
        constructor() {
            this.simMinute = 7 * 60 + 30;
            this.timeScale = 120;
        }

        tick(realDt) {
            this.simMinute += realDt * this.timeScale / 60;
            if (this.simMinute >= 24 * 60) {
                this.simMinute -= 24 * 60;
                return true;
            }
            return false;
        }

        format() {
            const hours = Math.floor(this.simMinute / 60);
            const mins = Math.floor(this.simMinute % 60);
            const ampm = hours >= 12 ? 'PM' : 'AM';
            const h12 = hours % 12 || 12;
            return `${h12}:${mins.toString().padStart(2, '0')} ${ampm}`;
        }
    }

    function randInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    function randFloat(min, max) {
        return Math.random() * (max - min) + min;
    }

    function generateSchedule() {
        const arrivalTime = randInt(8 * 60 + 15, 9 * 60 + 30);
        const lunchTime = randInt(11 * 60 + 30, 13 * 60 + 30);
        const lunchDuration = randInt(25, 60);
        const isStraggler = Math.random() < 0.15;
        const departureTime = isStraggler ? randInt(18 * 60 + 30, 19 * 60 + 45) : randInt(16 * 60 + 45, 18 * 60 + 30);

        const plannedMeetingTimes = [];
        if (Math.random() < 0.5) {
            plannedMeetingTimes.push(randInt(9 * 60 + 30, 11 * 60 + 30));
        }
        if (Math.random() < 0.5) {
            plannedMeetingTimes.push(randInt(14 * 60, 16 * 60));
        }

        return {
            arrivalTime,
            lunchTime,
            lunchDuration,
            departureTime,
            plannedMeetingTimes
        };
    }

    class Agent {
        constructor(id, role) {
            this.id = id;
            this.role = role;
            this.name = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
            this.state = 'DISABLED';
            this.group = null;
            this.currentFloor = 0;
            this.plan = [];
            this.currentAction = null;
            this.hasLunched = false;
            this.homeFloor = 0;
            this.deskId = null;
            this.deskWpName = null;
            this.deskDoorWpName = null;
            this.seatReservation = null;

            this.schedule = generateSchedule();
        }

        reset() {
            this.state = 'DISABLED';
            this.plan = [];
            this.currentAction = null;
            this.hasLunched = false;
            this.schedule = generateSchedule();
            if (this.seatReservation) {
                seatReservations.delete(this.seatReservation);
                this.seatReservation = null;
            }
            if (this.group && this.group.parent) {
                this.group.parent.remove(this.group);
            }
        }
    }

    const seatReservations = new Set();

    function reserveConfSeat(floor, wpName) {
        const key = `${floor}:${wpName}`;
        if (seatReservations.has(key)) return false;
        seatReservations.add(key);
        return true;
    }

    function releaseConfSeat(floor, wpName) {
        const key = `${floor}:${wpName}`;
        seatReservations.delete(key);
    }

    let scene, camera, renderer, controls;
    let world, elevator;
    let clock;
    let agents = [];
    let targetOccupancy = DEFAULT_OCCUPANCY;
    let ambientLight, directionalLight, hemisphereLight;

    function init() {
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x87ceeb);

        camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.set(28, 24, 28);
        camera.lookAt(0, 10, 0);

        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.sortObjects = true;
        document.body.appendChild(renderer.domElement);

        controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.target.set(0, 10, 0);
        controls.update();

        ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambientLight);

        directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(10, 20, 10);
        scene.add(directionalLight);

        hemisphereLight = new THREE.HemisphereLight(0x87ceeb, 0x444444, 0.4);
        scene.add(hemisphereLight);

        world = createWorld(scene);
        elevator = new Elevator(scene, world);
        clock = new Clock();

        for (let i = 0; i < MAX_WORKERS; i++) {
            const agent = new Agent(i, 'WORKER');
            agent.homeFloor = (i % 5) + 1;
            agent.deskId = String.fromCharCode(65 + (i % 4));
            agent.deskWpName = `office${agent.deskId}_desk`;
            agent.deskDoorWpName = `office${agent.deskId}_door`;
            agents.push(agent);
        }

        for (let i = 0; i < MAX_VISITORS; i++) {
            const agent = new Agent(MAX_WORKERS + i, 'VISITOR');
            agents.push(agent);
        }

        applyOccupancy();
        createUI();

        window.addEventListener('resize', onWindowResize);

        animate();
    }

    function applyOccupancy() {
        for (const agent of agents) {
            if (agent.id < targetOccupancy) {
                if (agent.state === 'DISABLED') {
                    agent.state = 'AWAY';
                }
            } else {
                if (agent.state !== 'AT_DESK' && agent.state !== 'IN_CAR' && agent.state !== 'IN_MEETING') {
                    agent.state = 'DISABLED';
                }
            }
        }
    }

    function countPresent() {
        let count = 0;
        for (const agent of agents) {
            if (agent.state !== 'DISABLED' && agent.state !== 'AWAY' && agent.state !== 'GONE') {
                count++;
            }
        }
        return count;
    }

    function topUpVisitors() {
        const deficit = targetOccupancy - countPresent();
        if (deficit <= 0) return;

        let rearmed = 0;
        for (const agent of agents) {
            if (agent.role === 'VISITOR' && (agent.state === 'AWAY' || agent.state === 'GONE')) {
                agent.schedule.arrivalTime = clock.simMinute + randInt(0, 6);
                agent.schedule.lunchTime = 0;
                agent.schedule.lunchDuration = 0;
                agent.schedule.departureTime = agent.schedule.arrivalTime + randInt(30, 90);
                agent.schedule.plannedMeetingTimes = [];
                agent.state = 'AWAY';
                agent.hasLunched = false;
                rearmed++;
                if (rearmed >= deficit) break;
            }
        }
    }

    function updateLighting() {
        const hour = clock.simMinute / 60;

        let bgColor, sunIntensity, ambientIntensity, hemiIntensity;

        if (hour < 6) {
            bgColor = new THREE.Color(0x1a1a2e);
            sunIntensity = 0.1;
            ambientIntensity = 0.45;
            hemiIntensity = 0.32;
        } else if (hour < 6.5) {
            const t = (hour - 6) / 0.5;
            bgColor = new THREE.Color(0x1a1a2e).lerp(new THREE.Color(0xffa07a), t);
            sunIntensity = 0.1 + t * 0.5;
            ambientIntensity = 0.45 + t * 0.15;
            hemiIntensity = 0.32 + t * 0.08;
        } else if (hour < 7) {
            const t = (hour - 6.5) / 0.5;
            bgColor = new THREE.Color(0xffa07a).lerp(new THREE.Color(0x87ceeb), t);
            sunIntensity = 0.6 + t * 0.2;
            ambientIntensity = 0.6;
            hemiIntensity = 0.4;
        } else if (hour < 17.5) {
            bgColor = new THREE.Color(0x87ceeb);
            sunIntensity = 0.8;
            ambientIntensity = 0.6;
            hemiIntensity = 0.4;
        } else if (hour < 18) {
            const t = (hour - 17.5) / 0.5;
            bgColor = new THREE.Color(0x87ceeb).lerp(new THREE.Color(0xffa07a), t);
            sunIntensity = 0.8 - t * 0.2;
            ambientIntensity = 0.6;
            hemiIntensity = 0.4;
        } else if (hour < 18.5) {
            const t = (hour - 18) / 0.5;
            bgColor = new THREE.Color(0xffa07a).lerp(new THREE.Color(0x1a1a2e), t);
            sunIntensity = 0.6 - t * 0.5;
            ambientIntensity = 0.6 - t * 0.15;
            hemiIntensity = 0.4 - t * 0.08;
        } else {
            bgColor = new THREE.Color(0x1a1a2e);
            sunIntensity = 0.1;
            ambientIntensity = 0.45;
            hemiIntensity = 0.32;
        }

        scene.background = bgColor;
        directionalLight.intensity = sunIntensity;
        ambientLight.intensity = ambientIntensity;
        hemisphereLight.intensity = hemiIntensity;
    }

    function spawnAgent(agent) {
        if (agent.group) return;

        agent.group = createPerson();
        agent.group.userData.agent = agent;

        const entranceNode = world.floors[0].nodes.entrance;
        const jitterX = (Math.random() - 0.5) * 2.2;
        const jitterZ = (Math.random() - 0.5) * 1.5;
        agent.group.position.set(entranceNode.position.x + jitterX, 0, entranceNode.position.z + jitterZ);
        agent.currentFloor = 0;

        scene.add(agent.group);
    }

    function planArriveToDesk(agent) {
        const plan = [];
        plan.push({ type: 'WALK_TO_WP', floor: 0, wpName: 'elevWait' });
        plan.push({ type: 'WAIT_AT_PANEL', floor: 0, dir: 1, toFloor: agent.homeFloor });
        plan.push({ type: 'ENTER_ELEVATOR', toFloor: agent.homeFloor });
        plan.push({ type: 'PRESS_FLOOR', floor: agent.homeFloor });
        plan.push({ type: 'WAIT_FOR_FLOOR', floor: agent.homeFloor });
        plan.push({ type: 'EXIT_ELEVATOR', toFloor: agent.homeFloor });
        plan.push({ type: 'WALK_TO_WP', floor: agent.homeFloor, wpName: agent.deskDoorWpName });
        plan.push({ type: 'WALK_TO_WP', floor: agent.homeFloor, wpName: agent.deskWpName });
        plan.push({ type: 'SIT', floor: agent.homeFloor, wpName: agent.deskWpName });
        plan.push({ type: 'ENTER_STATE', state: 'AT_DESK' });
        plan.push({ type: 'WAIT_SIM', minutes: randInt(30, 90) });
        plan.push({ type: 'PICK_NEXT_ACTIVITY' });
        return plan;
    }

    function planGoToLunch(agent) {
        const plan = [];
        plan.push({ type: 'STAND' });
        plan.push({ type: 'WALK_TO_WP', floor: agent.homeFloor, wpName: agent.deskDoorWpName });
        plan.push({ type: 'WALK_TO_WP', floor: agent.homeFloor, wpName: 'elevWait' });
        plan.push({ type: 'WAIT_AT_PANEL', floor: agent.homeFloor, dir: -1, toFloor: 0 });
        plan.push({ type: 'ENTER_ELEVATOR', toFloor: 0 });
        plan.push({ type: 'PRESS_FLOOR', floor: 0 });
        plan.push({ type: 'WAIT_FOR_FLOOR', floor: 0 });
        plan.push({ type: 'EXIT_ELEVATOR', toFloor: 0 });

        const bistroSpots = ['bistro_0', 'bistro_1', 'bistro_2', 'bistro_3'];
        const spot = bistroSpots[Math.floor(Math.random() * bistroSpots.length)];
        plan.push({ type: 'WALK_TO_WP', floor: 0, wpName: spot });
        plan.push({ type: 'SIT', floor: 0, wpName: spot });
        plan.push({ type: 'ENTER_STATE', state: 'AT_LUNCH' });
        plan.push({ type: 'WAIT_SIM', minutes: agent.schedule.lunchDuration });
        plan.push({ type: 'MARK_LUNCHED' });
        plan.push({ type: 'STAND' });

        plan.push({ type: 'WALK_TO_WP', floor: 0, wpName: 'elevWait' });
        plan.push({ type: 'WAIT_AT_PANEL', floor: 0, dir: 1, toFloor: agent.homeFloor });
        plan.push({ type: 'ENTER_ELEVATOR', toFloor: agent.homeFloor });
        plan.push({ type: 'PRESS_FLOOR', floor: agent.homeFloor });
        plan.push({ type: 'WAIT_FOR_FLOOR', floor: agent.homeFloor });
        plan.push({ type: 'EXIT_ELEVATOR', toFloor: agent.homeFloor });
        plan.push({ type: 'WALK_TO_WP', floor: agent.homeFloor, wpName: agent.deskDoorWpName });
        plan.push({ type: 'WALK_TO_WP', floor: agent.homeFloor, wpName: agent.deskWpName });
        plan.push({ type: 'SIT', floor: agent.homeFloor, wpName: agent.deskWpName });
        plan.push({ type: 'ENTER_STATE', state: 'AT_DESK' });
        plan.push({ type: 'WAIT_SIM', minutes: randInt(20, 60) });
        plan.push({ type: 'PICK_NEXT_ACTIVITY' });
        return plan;
    }

    function planVisitLounge(agent) {
        const plan = [];
        plan.push({ type: 'STAND' });
        plan.push({ type: 'WALK_TO_WP', floor: agent.homeFloor, wpName: agent.deskDoorWpName });
        plan.push({ type: 'WALK_TO_WP', floor: agent.homeFloor, wpName: 'lounge_door' });

        const spots = ['lounge_spot0', 'lounge_spot1', 'lounge_spot2'];
        const spot = spots[Math.floor(Math.random() * spots.length)];
        plan.push({ type: 'WALK_TO_WP', floor: agent.homeFloor, wpName: spot });
        plan.push({ type: 'SIT', floor: agent.homeFloor, wpName: spot });
        plan.push({ type: 'ENTER_STATE', state: 'AT_BREAK' });
        plan.push({ type: 'WAIT_SIM', minutes: randInt(5, 12) });
        plan.push({ type: 'STAND' });
        plan.push({ type: 'WALK_TO_WP', floor: agent.homeFloor, wpName: 'lounge_door' });
        plan.push({ type: 'WALK_TO_WP', floor: agent.homeFloor, wpName: agent.deskDoorWpName });
        plan.push({ type: 'WALK_TO_WP', floor: agent.homeFloor, wpName: agent.deskWpName });
        plan.push({ type: 'SIT', floor: agent.homeFloor, wpName: agent.deskWpName });
        plan.push({ type: 'ENTER_STATE', state: 'AT_DESK' });
        plan.push({ type: 'WAIT_SIM', minutes: randInt(15, 45) });
        plan.push({ type: 'PICK_NEXT_ACTIVITY' });
        return plan;
    }

    function planAttendMeeting(agent) {
        const meetingFloor = Math.random() < 0.65 ? agent.homeFloor : randInt(1, 5);
        const seats = ['conf_seat0', 'conf_seat1', 'conf_seat2', 'conf_seat3'];
        let chosenSeat = null;

        for (const seat of seats) {
            if (reserveConfSeat(meetingFloor, seat)) {
                chosenSeat = seat;
                agent.seatReservation = `${meetingFloor}:${seat}`;
                break;
            }
        }

        if (!chosenSeat) {
            return planVisitLounge(agent);
        }

        const plan = [];
        plan.push({ type: 'STAND' });
        plan.push({ type: 'WALK_TO_WP', floor: agent.homeFloor, wpName: agent.deskDoorWpName });

        if (meetingFloor !== agent.homeFloor) {
            const dir = meetingFloor > agent.homeFloor ? 1 : -1;
            plan.push({ type: 'WALK_TO_WP', floor: agent.homeFloor, wpName: 'elevWait' });
            plan.push({ type: 'WAIT_AT_PANEL', floor: agent.homeFloor, dir: dir, toFloor: meetingFloor });
            plan.push({ type: 'ENTER_ELEVATOR', toFloor: meetingFloor });
            plan.push({ type: 'PRESS_FLOOR', floor: meetingFloor });
            plan.push({ type: 'WAIT_FOR_FLOOR', floor: meetingFloor });
            plan.push({ type: 'EXIT_ELEVATOR', toFloor: meetingFloor });
        }

        plan.push({ type: 'WALK_TO_WP', floor: meetingFloor, wpName: 'conf_door' });
        plan.push({ type: 'WALK_TO_WP', floor: meetingFloor, wpName: chosenSeat });
        plan.push({ type: 'SIT', floor: meetingFloor, wpName: chosenSeat });
        plan.push({ type: 'ENTER_STATE', state: 'IN_MEETING' });
        plan.push({ type: 'WAIT_SIM', minutes: randInt(22, 45) });
        plan.push({ type: 'STAND' });
        plan.push({ type: 'RELEASE_SEAT' });

        if (meetingFloor !== agent.homeFloor) {
            const dir = agent.homeFloor > meetingFloor ? 1 : -1;
            plan.push({ type: 'WALK_TO_WP', floor: meetingFloor, wpName: 'conf_door' });
            plan.push({ type: 'WALK_TO_WP', floor: meetingFloor, wpName: 'elevWait' });
            plan.push({ type: 'WAIT_AT_PANEL', floor: meetingFloor, dir: dir, toFloor: agent.homeFloor });
            plan.push({ type: 'ENTER_ELEVATOR', toFloor: agent.homeFloor });
            plan.push({ type: 'PRESS_FLOOR', floor: agent.homeFloor });
            plan.push({ type: 'WAIT_FOR_FLOOR', floor: agent.homeFloor });
            plan.push({ type: 'EXIT_ELEVATOR', toFloor: agent.homeFloor });
        }

        plan.push({ type: 'WALK_TO_WP', floor: agent.homeFloor, wpName: agent.deskDoorWpName });
        plan.push({ type: 'WALK_TO_WP', floor: agent.homeFloor, wpName: agent.deskWpName });
        plan.push({ type: 'SIT', floor: agent.homeFloor, wpName: agent.deskWpName });
        plan.push({ type: 'ENTER_STATE', state: 'AT_DESK' });
        plan.push({ type: 'WAIT_SIM', minutes: randInt(20, 50) });
        plan.push({ type: 'PICK_NEXT_ACTIVITY' });
        return plan;
    }

    function planVisitCoworker(agent) {
        const coworkers = agents.filter(a => a.role === 'WORKER' && a.state === 'AT_DESK' && a.id !== agent.id);
        if (coworkers.length === 0) {
            return [{ type: 'WAIT_SIM', minutes: randInt(10, 30) }, { type: 'PICK_NEXT_ACTIVITY' }];
        }

        const target = coworkers[Math.floor(Math.random() * coworkers.length)];
        const plan = [];
        plan.push({ type: 'STAND' });
        plan.push({ type: 'WALK_TO_WP', floor: agent.homeFloor, wpName: agent.deskDoorWpName });

        if (target.homeFloor !== agent.homeFloor) {
            const dir = target.homeFloor > agent.homeFloor ? 1 : -1;
            plan.push({ type: 'WALK_TO_WP', floor: agent.homeFloor, wpName: 'elevWait' });
            plan.push({ type: 'WAIT_AT_PANEL', floor: agent.homeFloor, dir: dir, toFloor: target.homeFloor });
            plan.push({ type: 'ENTER_ELEVATOR', toFloor: target.homeFloor });
            plan.push({ type: 'PRESS_FLOOR', floor: target.homeFloor });
            plan.push({ type: 'WAIT_FOR_FLOOR', floor: target.homeFloor });
            plan.push({ type: 'EXIT_ELEVATOR', toFloor: target.homeFloor });
        }

        plan.push({ type: 'WALK_TO_WP', floor: target.homeFloor, wpName: target.deskDoorWpName });
        plan.push({ type: 'ENTER_STATE', state: 'VISITING' });
        plan.push({ type: 'WAIT_SIM', minutes: randInt(6, 18) });

        if (target.homeFloor !== agent.homeFloor) {
            const dir = agent.homeFloor > target.homeFloor ? 1 : -1;
            plan.push({ type: 'WALK_TO_WP', floor: target.homeFloor, wpName: 'elevWait' });
            plan.push({ type: 'WAIT_AT_PANEL', floor: target.homeFloor, dir: dir, toFloor: agent.homeFloor });
            plan.push({ type: 'ENTER_ELEVATOR', toFloor: agent.homeFloor });
            plan.push({ type: 'PRESS_FLOOR', floor: agent.homeFloor });
            plan.push({ type: 'WAIT_FOR_FLOOR', floor: agent.homeFloor });
            plan.push({ type: 'EXIT_ELEVATOR', toFloor: agent.homeFloor });
        }

        plan.push({ type: 'WALK_TO_WP', floor: agent.homeFloor, wpName: agent.deskDoorWpName });
        plan.push({ type: 'WALK_TO_WP', floor: agent.homeFloor, wpName: agent.deskWpName });
        plan.push({ type: 'SIT', floor: agent.homeFloor, wpName: agent.deskWpName });
        plan.push({ type: 'ENTER_STATE', state: 'AT_DESK' });
        plan.push({ type: 'WAIT_SIM', minutes: randInt(15, 40) });
        plan.push({ type: 'PICK_NEXT_ACTIVITY' });
        return plan;
    }

    function planLeaveBuilding(agent) {
        const plan = [];
        if (agent.state === 'AT_DESK' || agent.state === 'IN_MEETING' || agent.state === 'AT_BREAK') {
            plan.push({ type: 'STAND' });
            if (agent.seatReservation) {
                plan.push({ type: 'RELEASE_SEAT' });
            }
            plan.push({ type: 'WALK_TO_WP', floor: agent.currentFloor, wpName: agent.deskDoorWpName || 'hallN' });
        }

        plan.push({ type: 'WALK_TO_WP', floor: agent.homeFloor, wpName: 'elevWait' });
        plan.push({ type: 'WAIT_AT_PANEL', floor: agent.homeFloor, dir: -1, toFloor: 0 });
        plan.push({ type: 'ENTER_ELEVATOR', toFloor: 0 });
        plan.push({ type: 'PRESS_FLOOR', floor: 0 });
        plan.push({ type: 'WAIT_FOR_FLOOR', floor: 0 });
        plan.push({ type: 'EXIT_ELEVATOR', toFloor: 0 });
        plan.push({ type: 'WALK_TO_WP', floor: 0, wpName: 'entrance' });
        plan.push({ type: 'WALK_TO_WP', floor: 0, wpName: 'outside' });
        plan.push({ type: 'EXIT_BUILDING' });
        return plan;
    }

    function planVisitorVisit(agent) {
        const plan = [];
        plan.push({ type: 'WALK_TO_WP', floor: 0, wpName: 'entrance' });

        const roll = Math.random();
        let activity;

        if (roll < 0.10) {
            const spots = ['bistro_0', 'bistro_1', 'bistro_2', 'bistro_3'];
            activity = { type: 'cafe', wp: spots[Math.floor(Math.random() * spots.length)] };
        } else if (roll < 0.16) {
            activity = { type: 'cafe_counter', wp: 'cafe_order' };
        } else if (roll < 0.30) {
            const spots = ['lounge_spot0', 'lounge_spot1', 'lounge_spot2'];
            activity = { type: 'front_lounge', wp: spots[Math.floor(Math.random() * spots.length)] };
        } else if (roll < 0.42) {
            const spots = ['back_lounge_N', 'back_lounge_S', 'pit_N', 'pit_S', 'pit_E', 'pit_W'];
            activity = { type: 'back_lounge', wp: spots[Math.floor(Math.random() * spots.length)] };
        } else if (roll < 0.52) {
            const spots = ['reception', 'kiosk', 'lobby_wc_front', 'lobby_wc_back'];
            activity = { type: 'stand', wp: spots[Math.floor(Math.random() * spots.length)] };
        } else if (roll < 0.62) {
            const spots = ['lobby_stand_center', 'lobby_stand_NE', 'lobby_stand_NW', 'lobby_stand_midE', 'lobby_stand_midW', 'lobby_stand_entry'];
            activity = { type: 'loiter', wp: spots[Math.floor(Math.random() * spots.length)] };
        } else if (roll < 0.77) {
            const floor = randInt(1, 5);
            activity = { type: 'office_lounge', floor: floor, wp: 'lounge_spot0' };
        } else {
            const floor = randInt(1, 5);
            const seats = ['conf_seat0', 'conf_seat1', 'conf_seat2', 'conf_seat3'];
            let chosenSeat = null;
            for (const seat of seats) {
                if (reserveConfSeat(floor, seat)) {
                    chosenSeat = seat;
                    agent.seatReservation = `${floor}:${seat}`;
                    break;
                }
            }
            if (chosenSeat) {
                activity = { type: 'meeting', floor: floor, wp: chosenSeat };
            } else {
                activity = { type: 'loiter', wp: 'lobby_stand_center' };
            }
        }

        if (activity.type === 'cafe' || activity.type === 'front_lounge' || activity.type === 'back_lounge') {
            plan.push({ type: 'WALK_TO_WP', floor: 0, wpName: activity.wp });
            plan.push({ type: 'SIT', floor: 0, wpName: activity.wp });
            plan.push({ type: 'ENTER_STATE', state: 'VISITING' });
            plan.push({ type: 'WAIT_SIM', minutes: randInt(15, 45) });
            plan.push({ type: 'STAND' });
        } else if (activity.type === 'cafe_counter' || activity.type === 'stand') {
            plan.push({ type: 'WALK_TO_WP', floor: 0, wpName: activity.wp });
            plan.push({ type: 'ENTER_STATE', state: 'VISITING' });
            plan.push({ type: 'WAIT_SIM', minutes: randInt(5, 15) });
        } else if (activity.type === 'loiter') {
            plan.push({ type: 'WALK_TO_WP', floor: 0, wpName: activity.wp });
            plan.push({ type: 'ENTER_STATE', state: 'VISITING' });
            plan.push({ type: 'WAIT_SIM', minutes: randInt(10, 30) });
        } else if (activity.type === 'office_lounge') {
            plan.push({ type: 'WALK_TO_WP', floor: 0, wpName: 'elevWait' });
            plan.push({ type: 'WAIT_AT_PANEL', floor: 0, dir: 1, toFloor: activity.floor });
            plan.push({ type: 'ENTER_ELEVATOR', toFloor: activity.floor });
            plan.push({ type: 'PRESS_FLOOR', floor: activity.floor });
            plan.push({ type: 'WAIT_FOR_FLOOR', floor: activity.floor });
            plan.push({ type: 'EXIT_ELEVATOR', toFloor: activity.floor });
            plan.push({ type: 'WALK_TO_WP', floor: activity.floor, wpName: 'lounge_door' });
            plan.push({ type: 'WALK_TO_WP', floor: activity.floor, wpName: activity.wp });
            plan.push({ type: 'SIT', floor: activity.floor, wpName: activity.wp });
            plan.push({ type: 'ENTER_STATE', state: 'VISITING' });
            plan.push({ type: 'WAIT_SIM', minutes: randInt(15, 40) });
            plan.push({ type: 'STAND' });
            plan.push({ type: 'WALK_TO_WP', floor: activity.floor, wpName: 'lounge_door' });
            plan.push({ type: 'WALK_TO_WP', floor: activity.floor, wpName: 'elevWait' });
            plan.push({ type: 'WAIT_AT_PANEL', floor: activity.floor, dir: -1, toFloor: 0 });
            plan.push({ type: 'ENTER_ELEVATOR', toFloor: 0 });
            plan.push({ type: 'PRESS_FLOOR', floor: 0 });
            plan.push({ type: 'WAIT_FOR_FLOOR', floor: 0 });
            plan.push({ type: 'EXIT_ELEVATOR', toFloor: 0 });
        } else if (activity.type === 'meeting') {
            plan.push({ type: 'WALK_TO_WP', floor: 0, wpName: 'elevWait' });
            plan.push({ type: 'WAIT_AT_PANEL', floor: 0, dir: 1, toFloor: activity.floor });
            plan.push({ type: 'ENTER_ELEVATOR', toFloor: activity.floor });
            plan.push({ type: 'PRESS_FLOOR', floor: activity.floor });
            plan.push({ type: 'WAIT_FOR_FLOOR', floor: activity.floor });
            plan.push({ type: 'EXIT_ELEVATOR', toFloor: activity.floor });
            plan.push({ type: 'WALK_TO_WP', floor: activity.floor, wpName: 'conf_door' });
            plan.push({ type: 'WALK_TO_WP', floor: activity.floor, wpName: activity.wp });
            plan.push({ type: 'SIT', floor: activity.floor, wpName: activity.wp });
            plan.push({ type: 'ENTER_STATE', state: 'VISITING' });
            plan.push({ type: 'WAIT_SIM', minutes: randInt(25, 50) });
            plan.push({ type: 'STAND' });
            plan.push({ type: 'RELEASE_SEAT' });
            plan.push({ type: 'WALK_TO_WP', floor: activity.floor, wpName: 'conf_door' });
            plan.push({ type: 'WALK_TO_WP', floor: activity.floor, wpName: 'elevWait' });
            plan.push({ type: 'WAIT_AT_PANEL', floor: activity.floor, dir: -1, toFloor: 0 });
            plan.push({ type: 'ENTER_ELEVATOR', toFloor: 0 });
            plan.push({ type: 'PRESS_FLOOR', floor: 0 });
            plan.push({ type: 'WAIT_FOR_FLOOR', floor: 0 });
            plan.push({ type: 'EXIT_ELEVATOR', toFloor: 0 });
        }

        plan.push({ type: 'WALK_TO_WP', floor: 0, wpName: 'entrance' });
        plan.push({ type: 'WALK_TO_WP', floor: 0, wpName: 'outside' });
        plan.push({ type: 'EXIT_BUILDING' });
        return plan;
    }

    function chooseNextActivity(agent) {
        if (clock.simMinute >= agent.schedule.departureTime) {
            return planLeaveBuilding(agent);
        }

        for (let i = 0; i < agent.schedule.plannedMeetingTimes.length; i++) {
            if (clock.simMinute >= agent.schedule.plannedMeetingTimes[i]) {
                agent.schedule.plannedMeetingTimes.splice(i, 1);
                return planAttendMeeting(agent);
            }
        }

        if (!agent.hasLunched && clock.simMinute >= agent.schedule.lunchTime) {
            return planGoToLunch(agent);
        }

        const roll = Math.random();
        if (roll < MEETING_PROB * 0.4) {
            return planAttendMeeting(agent);
        } else if (roll < MEETING_PROB * 0.4 + 0.12) {
            return planVisitLounge(agent);
        } else if (roll < MEETING_PROB * 0.4 + 0.12 + 0.15) {
            return planVisitCoworker(agent);
        } else {
            return [{ type: 'WAIT_SIM', minutes: randInt(18, 65) }, { type: 'PICK_NEXT_ACTIVITY' }];
        }
    }

    function startAction(agent, action) {
        agent.currentAction = action;

        if (action.type === 'WALK_TO_WP') {
            const floorData = world.floors[action.floor];
            const path = bfsPath(floorData.nodes, getCurrentWp(agent, action.floor), action.wpName);
            action.path = path;
            action.pathIndex = 0;
            action._prevWp = null;
            action._stallT = 0;
            if (agent.group) {
                agent.group.userData.isWalking = true;
                agent.group.userData.isSitting = false;
            }
        } else if (action.type === 'WAIT_AT_PANEL') {
            if (action.dir > 0) {
                elevator.callUp(action.floor);
            } else {
                elevator.callDown(action.floor);
            }
        } else if (action.type === 'ENTER_ELEVATOR') {
            action.phase = 'reserve';
            action._prevWalk = null;
            action._stallT = 0;
        } else if (action.type === 'WAIT_FOR_FLOOR') {
        } else if (action.type === 'EXIT_ELEVATOR') {
            action.phase = 'disembark';
            elevator.registerDisembark(agent);
        } else if (action.type === 'SIT') {
            const floorData = world.floors[action.floor];
            const target = floorData.sitTargets[action.wpName];
            if (target) {
                if (target.sit) {
                    agent.group.userData.isSitting = true;
                    agent.group.userData.isWalking = false;
                    agent.group.position.y -= 0.35;
                } else {
                    const jitter = Math.random() * Math.PI * 2;
                    const radius = randFloat(0.35, 0.75);
                    agent.group.position.x += Math.cos(jitter) * radius;
                    agent.group.position.z += Math.sin(jitter) * radius;
                }
                agent.group.rotation.y = target.facing;
            }
        } else if (action.type === 'STAND') {
            agent.group.userData.isSitting = false;
            agent.group.position.y = agent.currentFloor * WORLD.FLOOR_HEIGHT;
        } else if (action.type === 'RELEASE_SEAT') {
            if (agent.seatReservation) {
                releaseConfSeat(parseInt(agent.seatReservation.split(':')[0]), agent.seatReservation.split(':')[1]);
                agent.seatReservation = null;
            }
        } else if (action.type === 'WAIT_SIM') {
            action.untilMin = clock.simMinute + action.minutes;
        } else if (action.type === 'PRESS_FLOOR') {
            elevator.pressDestination(action.floor);
        } else if (action.type === 'ENTER_STATE') {
            agent.state = action.state;
        } else if (action.type === 'MARK_LUNCHED') {
            agent.hasLunched = true;
        } else if (action.type === 'PICK_NEXT_ACTIVITY') {
            if (agent.role === 'WORKER') {
                agent.plan = chooseNextActivity(agent);
            } else {
                agent.plan = [];
                agent.state = 'GONE';
            }
            agent.currentAction = null;
        } else if (action.type === 'EXIT_BUILDING') {
            if (agent.group && agent.group.parent) {
                agent.group.parent.remove(agent.group);
            }
            agent.group = null;
            agent.state = 'GONE';
            agent.plan = [];
            agent.currentAction = null;
        }
    }

    function getCurrentWp(agent, floor) {
        if (floor === 0 && agent.currentFloor === 0) {
            const pos = agent.group ? agent.group.position : new THREE.Vector3();
            const nodes = world.floors[0].nodes;
            let closest = 'entrance';
            let minDist = Infinity;
            for (const [name, node] of Object.entries(nodes)) {
                const dist = pos.distanceTo(node.position);
                if (dist < minDist) {
                    minDist = dist;
                    closest = name;
                }
            }
            return closest;
        }
        return 'elevWait';
    }

    function updateAction(agent, dt) {
        if (!agent.currentAction) return false;

        const action = agent.currentAction;

        if (action.type === 'WALK_TO_WP') {
            if (!action.path || action.pathIndex >= action.path.length) {
                agent.group.userData.isWalking = false;
                return true;
            }

            const target = action.path[action.pathIndex];
            const pos = agent.group.position;
            const dx = target.x - pos.x;
            const dz = target.z - pos.z;
            const dist = Math.sqrt(dx * dx + dz * dz);

            if (dist < 0.1) {
                action.pathIndex++;
                action._prevWp = null;
                action._stallT = 0;
                return false;
            }

            const speed = 1.3 * dt;
            const moveX = (dx / dist) * Math.min(speed, dist);
            const moveZ = (dz / dist) * Math.min(speed, dist);
            pos.x += moveX;
            pos.z += moveZ;

            agent.group.rotation.y = Math.atan2(dx, dz);

            const progress = Math.sqrt(moveX * moveX + moveZ * moveZ);
            if (action._prevWp && progress < 0.005) {
                action._stallT += dt;
                if (action._stallT > 1.2) {
                    action.pathIndex++;
                    action._prevWp = null;
                    action._stallT = 0;
                }
            } else {
                action._prevWp = pos.clone();
                action._stallT = 0;
            }

            return false;
        } else if (action.type === 'WAIT_AT_PANEL') {
            if (action.dir > 0) {
                elevator.callUp(action.floor);
            } else {
                elevator.callDown(action.floor);
            }

            if (elevator.state === 'DOOR_OPEN' && elevator.currentFloor === action.floor && elevator.isAcceptingAt(action.floor, action.dir) && elevator.currentCapacityFree() > 0) {
                return true;
            }
            return false;
        } else if (action.type === 'ENTER_ELEVATOR') {
            if (action.phase === 'reserve') {
                if (elevator.state !== 'DOOR_OPEN' || elevator.currentFloor !== action.floor) {
                    if (action.dir > 0) {
                        elevator.callUp(action.floor);
                    } else {
                        elevator.callDown(action.floor);
                    }
                    return false;
                }

                const spot = elevator.reserveBoardingSpot(agent);
                if (!spot) return false;

                action.spot = spot;
                action.phase = 'walk_to_door';

                const doorWorldX = spot.x;
                const doorWorldZ = 1.5;
                const doorWorldY = action.floor * WORLD.FLOOR_HEIGHT;
                action.doorTarget = new THREE.Vector3(doorWorldX, doorWorldY, doorWorldZ);
            }

            if (action.phase === 'walk_to_door') {
                const target = action.doorTarget;
                const pos = agent.group.position;
                const dx = target.x - pos.x;
                const dz = target.z - pos.z;
                const dist = Math.sqrt(dx * dx + dz * dz);

                if (dist < 0.1) {
                    action.phase = 'enter_car';
                    return false;
                }

                const speed = 1.3 * dt;
                const moveX = (dx / dist) * Math.min(speed, dist);
                const moveZ = (dz / dist) * Math.min(speed, dist);
                pos.x += moveX;
                pos.z += moveZ;

                const progress = Math.sqrt(moveX * moveX + moveZ * moveZ);
                if (action._prevWalk && progress < 0.005) {
                    action._stallT += dt;
                    if (action._stallT > 1.5) {
                        agent.group.position.copy(target);
                        action.phase = 'enter_car';
                    }
                } else {
                    action._prevWalk = pos.clone();
                    action._stallT = 0;
                }

                return false;
            }

            if (action.phase === 'enter_car') {
                if (agent.group.parent) {
                    agent.group.parent.remove(agent.group);
                }
                elevator.carGroup.add(agent.group);
                agent.group.position.set(action.spot.x, 0, action.spot.z);
                agent.group.rotation.y = 0;
                action.phase = 'walk_to_spot';
                return false;
            }

            if (action.phase === 'walk_to_spot') {
                elevator.completeBoard(agent);
                return true;
            }

            return false;
        } else if (action.type === 'WAIT_FOR_FLOOR') {
            if (elevator.state === 'DOOR_OPEN' && elevator.currentFloor === action.floor) {
                return true;
            }
            return false;
        } else if (action.type === 'EXIT_ELEVATOR') {
            if (action.phase === 'disembark') {
                if (agent.group.parent) {
                    agent.group.parent.remove(agent.group);
                }
                scene.add(agent.group);

                const floorY = action.floor * WORLD.FLOOR_HEIGHT;
                agent.group.position.set(0, floorY, 1.5);
                agent.currentFloor = action.floor;

                action.phase = 'walk_to_elevWait';
                return false;
            }

            if (action.phase === 'walk_to_elevWait') {
                const target = world.floors[action.floor].nodes.elevWait.position;
                const pos = agent.group.position;
                const dx = target.x - pos.x;
                const dz = target.z - pos.z;
                const dist = Math.sqrt(dx * dx + dz * dz);

                if (dist < 0.1) {
                    elevator.completeDisembark(agent);
                    return true;
                }

                const speed = 1.3 * dt;
                const moveX = (dx / dist) * Math.min(speed, dist);
                const moveZ = (dz / dist) * Math.min(speed, dist);
                pos.x += moveX;
                pos.z += moveZ;

                return false;
            }

            return false;
        } else if (action.type === 'WAIT_SIM') {
            return clock.simMinute >= action.untilMin;
        } else if (action.type === 'PRESS_FLOOR' || action.type === 'ENTER_STATE' || action.type === 'MARK_LUNCHED' || action.type === 'STAND' || action.type === 'RELEASE_SEAT' || action.type === 'SIT') {
            return true;
        } else if (action.type === 'PICK_NEXT_ACTIVITY' || action.type === 'EXIT_BUILDING') {
            return true;
        }

        return false;
    }

    function applyCollisions() {
        const present = agents.filter(a => a.group && a.group.parent && !a.group.userData.isSitting && a.currentAction && a.currentAction.type !== 'ENTER_ELEVATOR');

        for (let i = 0; i < present.length; i++) {
            for (let j = i + 1; j < present.length; j++) {
                const a = present[i];
                const b = present[j];

                if (a.group.parent !== b.group.parent) continue;

                const dy = Math.abs(a.group.position.y - b.group.position.y);
                if (dy > 1) continue;

                const dx = a.group.position.x - b.group.position.x;
                const dz = a.group.position.z - b.group.position.z;
                const dist = Math.sqrt(dx * dx + dz * dz);

                if (dist < 0.7) {
                    let pushX, pushZ;
                    if (dist < 1e-3) {
                        const angle = Math.random() * Math.PI * 2;
                        pushX = Math.cos(angle) * 0.18;
                        pushZ = Math.sin(angle) * 0.18;
                    } else {
                        pushX = (dx / dist) * 0.18;
                        pushZ = (dz / dist) * 0.18;
                    }

                    a.group.position.x += pushX;
                    a.group.position.z += pushZ;
                    b.group.position.x -= pushX;
                    b.group.position.z -= pushZ;
                }
            }
        }
    }

    function updateAgent(agent, dt) {
        if (agent.state === 'DISABLED' || agent.state === 'GONE') return;

        if (agent.state === 'AWAY') {
            if (clock.simMinute >= agent.schedule.arrivalTime) {
                spawnAgent(agent);
                agent.state = 'ARRIVING';
                if (agent.role === 'WORKER') {
                    agent.plan = planArriveToDesk(agent);
                } else {
                    agent.plan = planVisitorVisit(agent);
                }
            }
            return;
        }

        if (clock.simMinute >= agent.schedule.departureTime && agent.state !== 'LEAVING' && agent.role === 'WORKER') {
            if (agent.seatReservation) {
                releaseConfSeat(parseInt(agent.seatReservation.split(':')[0]), agent.seatReservation.split(':')[1]);
                agent.seatReservation = null;
            }
            agent.plan = planLeaveBuilding(agent);
            agent.state = 'LEAVING';
        }

        let iterations = 0;
        while (iterations < 16) {
            if (!agent.currentAction && agent.plan.length > 0) {
                const action = agent.plan.shift();
                startAction(agent, action);
            }

            if (!agent.currentAction) break;

            const done = updateAction(agent, dt);
            if (done) {
                agent.currentAction = null;
                iterations++;
            } else {
                break;
            }
        }
    }

    function onWindowResize() {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }

    function animate() {
        requestAnimationFrame(animate);

        const realDt = Math.min(0.05, clock.tick(1 / 60) ? 1 / 60 : 1 / 60);
        const wrapped = clock.tick(0);

        if (wrapped) {
            for (const agent of agents) {
                agent.reset();
            }
            elevator.reset();
            seatReservations.clear();
            applyOccupancy();
        }

        updateLighting();

        const motionDt = realDt * clock.timeScale;
        elevator.tick(motionDt);

        topUpVisitors();

        for (const agent of agents) {
            updateAgent(agent, motionDt);
        }

        applyCollisions();

        for (const agent of agents) {
            if (agent.group) {
                animatePersonWalking(agent.group, motionDt);
            }
        }

        controls.update();
        renderer.render(scene, camera);
        updateHUD();
    }

    function createUI() {
        const hud = document.createElement('div');
        hud.style.position = 'absolute';
        hud.style.top = '10px';
        hud.style.left = '10px';
        hud.style.color = 'white';
        hud.style.fontFamily = 'monospace';
        hud.style.fontSize = '14px';
        hud.style.backgroundColor = 'rgba(0,0,0,0.7)';
        hud.style.padding = '15px';
        hud.style.borderRadius = '5px';
        hud.style.maxWidth = '300px';
        document.body.appendChild(hud);

        const timeDisplay = document.createElement('div');
        timeDisplay.style.fontSize = '24px';
        timeDisplay.style.fontWeight = 'bold';
        timeDisplay.style.marginBottom = '10px';
        hud.appendChild(timeDisplay);

        const speedLabel = document.createElement('div');
        speedLabel.textContent = 'Speed:';
        hud.appendChild(speedLabel);

        const speedSlider = document.createElement('input');
        speedSlider.type = 'range';
        speedSlider.min = '0';
        speedSlider.max = '100';
        speedSlider.value = '50';
        speedSlider.style.width = '100%';
        hud.appendChild(speedSlider);

        const speedValue = document.createElement('div');
        speedValue.textContent = `${clock.timeScale}x`;
        hud.appendChild(speedValue);

        speedSlider.addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            clock.timeScale = Math.round(Math.pow(10, val / 100 * Math.log10(600)));
            speedValue.textContent = `${clock.timeScale}x`;
        });

        const occLabel = document.createElement('div');
        occLabel.textContent = `Occupancy: ${targetOccupancy} / ${MAX_OCCUPANCY} people`;
        occLabel.style.marginTop = '10px';
        hud.appendChild(occLabel);

        const occSlider = document.createElement('input');
        occSlider.type = 'range';
        occSlider.min = '1';
        occSlider.max = MAX_OCCUPANCY;
        occSlider.value = targetOccupancy;
        occSlider.style.width = '100%';
        hud.appendChild(occSlider);

        occSlider.addEventListener('input', (e) => {
            targetOccupancy = parseInt(e.target.value);
            occLabel.textContent = `Occupancy: ${targetOccupancy} / ${MAX_OCCUPANCY} people`;
            applyOccupancy();
        });

        const stateDiv = document.createElement('div');
        stateDiv.style.marginTop = '10px';
        stateDiv.style.fontSize = '12px';
        hud.appendChild(stateDiv);

        window._hudElements = { timeDisplay, speedValue, occLabel, stateDiv };
    }

    function updateHUD() {
        if (!window._hudElements) return;

        const { timeDisplay, stateDiv } = window._hudElements;
        timeDisplay.textContent = clock.format();

        const stateCounts = {};
        for (const agent of agents) {
            stateCounts[agent.state] = (stateCounts[agent.state] || 0) + 1;
        }

        let stateText = '<b>Agent States:</b><br>';
        for (const [state, count] of Object.entries(stateCounts)) {
            stateText += `${state}: ${count}<br>`;
        }

        stateText += `<br><b>Elevator:</b><br>`;
        stateText += `Floor: ${Math.round(elevator.currentFloor)}<br>`;
        stateText += `Direction: ${elevator.direction > 0 ? 'UP' : elevator.direction < 0 ? 'DOWN' : 'IDLE'}<br>`;
        stateText += `State: ${elevator.state}<br>`;
        stateText += `Passengers: ${elevator.passengers.size}<br>`;
        stateText += `Destinations: [${Array.from(elevator.destinations).join(', ')}]<br>`;
        stateText += `Up Calls: [${Array.from(elevator.upCalls).join(', ')}]<br>`;
        stateText += `Down Calls: [${Array.from(elevator.downCalls).join(', ')}]`;

        stateDiv.innerHTML = stateText;
    }

    init();
})();
