/**
 * Simulated clock, day/night lighting, agent state machine + daily schedules, render loop, UI.
 */
(function(root) {
    'use strict';

    const MAX_WORKERS = 20;
    const MAX_VISITORS = 80;
    const MAX_OCCUPANCY = MAX_WORKERS + MAX_VISITORS;
    const DEFAULT_OCCUPANCY = 45;

    const FIRST_NAMES = ['Alex', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Quinn', 'Avery', 'Reese', 'Blake',
        'Sam', 'Jamie', 'Drew', 'Skyler', 'Cameron', 'Dakota', 'Finley', 'Sage', 'River', 'Phoenix'];

    const MEETING_PROB = 0.36;
    const LUNCH_WINDOW_START = 11 * 60;
    const LUNCH_WINDOW_END = 13.5 * 60;

    let scene, camera, renderer, controls;
    let world, elevator;
    let clock;
    let agents = [];
    let targetOccupancy = DEFAULT_OCCUPANCY;
    let timeScale = 120;
    let seatReservations = new Set();
    let agentIdCounter = 0;

    function formatSimTime(minutes) {
        const totalMins = Math.floor(minutes);
        const h = Math.floor(totalMins / 60) % 24;
        const m = totalMins % 60;
        const ampm = h >= 12 ? 'PM' : 'AM';
        const h12 = h % 12 || 12;
        return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
    }

    class SimClock {
        constructor() {
            this.simMinute = 7 * 60 + 30;
            this.timeScale = 120;
            this._lastRealTime = null;
        }

        tick(realDt) {
            this.simMinute += realDt * this.timeScale / 60;
            if (this.simMinute >= 24 * 60) {
                this.simMinute -= 24 * 60;
                return true;
            }
            return false;
        }

        getDelta() {
            const now = performance.now();
            if (this._lastRealTime === null) {
                this._lastRealTime = now;
                return 0.016;
            }
            const dt = (now - this._lastRealTime) / 1000;
            this._lastRealTime = now;
            return Math.min(0.1, dt);
        }

        format() {
            return formatSimTime(this.simMinute);
        }

        isBusinessHours() {
            return this.simMinute >= 7 * 60 && this.simMinute <= 20 * 60;
        }
    }

    function createAgent(role, homeFloor = 0) {
        const id = agentIdCounter++;
        const name = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
        const group = createPerson();

        const agent = {
            id,
            name,
            role,
            homeFloor,
            deskId: null,
            deskWpName: null,
            deskDoorWpName: null,
            group,
            state: 'AWAY',
            simMinute: 0,
            arrivalTime: 8 * 60 + Math.random() * 75,
            lunchTime: LUNCH_WINDOW_START + Math.random() * (LUNCH_WINDOW_END - LUNCH_WINDOW_START),
            lunchDuration: 25 + Math.random() * 35,
            departureTime: 16 * 60 + 45 + Math.random() * 105,
            plannedMeetingTimes: [],
            hasLunched: false,
            currentAction: null,
            actionQueue: [],
            plan: [],
            toFloor: null,
            reservation: null,
            _prevWp: null,
            _stallT: 0,
            _prevWalk: null,
            _stallX: 0,
            _stallZ: 0
        };

        if (role === 'WORKER' && homeFloor >= 1) {
            const deskIndex = homeFloor - 1;
            agent.deskWpName = `${homeFloor}_office${String.fromCharCode(65 + deskIndex)}_desk`;
            agent.deskDoorWpName = `${homeFloor}_office${String.fromCharCode(65 + deskIndex)}_door`;
        }

        group.userData.agent = agent;
        scene.add(group);
        group.visible = false;

        return agent;
    }

    function initAgents() {
        agents = [];
        seatReservations.clear();
        agentIdCounter = 0;

        for (let i = 1; i <= MAX_WORKERS; i++) {
            const floor = ((i - 1) % 5) + 1;
            const agent = createAgent('WORKER', floor);
            agents.push(agent);
        }

        for (let i = 0; i < MAX_VISITORS; i++) {
            const agent = createAgent('VISITOR', 0);
            agents.push(agent);
        }
    }

    function resetAgentForNewDay(agent) {
        agent.state = 'AWAY';
        agent.arrivalTime = 8 * 60 + Math.random() * 75;
        agent.lunchTime = LUNCH_WINDOW_START + Math.random() * (LUNCH_WINDOW_END - LUNCH_WINDOW_START);
        agent.lunchDuration = 25 + Math.random() * 35;
        agent.departureTime = 16 * 60 + 45 + Math.random() * 105;
        if (Math.random() < 0.15) {
            agent.departureTime = 18 * 60 + 30 + Math.random() * 75;
        }
        agent.plannedMeetingTimes = [];
        const numMeetings = Math.floor(Math.random() * 3);
        for (let i = 0; i < numMeetings; i++) {
            const mt = 9 * 60 + Math.random() * (17 * 60 - 9 * 60);
            agent.plannedMeetingTimes.push(mt);
        }
        agent.plannedMeetingTimes.sort((a, b) => a - b);
        agent.hasLunched = false;
        agent.currentAction = null;
        agent.actionQueue = [];
        agent.plan = [];
        agent.toFloor = null;
        agent.reservation = null;
        agent.group.visible = false;
        agent.group.position.set(0, 0, 12);
    }

    function resetDay() {
        resetAgents();
        elevator.reset();
    }

    function resetAgents() {
        seatReservations.clear();
        for (const agent of agents) {
            if (agent.id < targetOccupancy) {
                resetAgentForNewDay(agent);
            } else {
                agent.state = 'DISABLED';
                agent.group.visible = false;
            }
        }
    }

    function getFloorWaypoints(floor) {
        const prefix = floor === 0 ? '' : `${floor}_`;
        const wpNames = ['hallS', 'hallSE', 'hallE', 'hallNE', 'hallN', 'hallNW', 'hallW', 'hallSW', 'elevWait'];
        return wpNames.map(n => (floor === 0 ? n : prefix + n));
    }

    function findPath(fromFloor, fromWp, toFloor, toWp) {
        const combined = {};
        for (const floorData of world.floors) {
            for (const [key, val] of Object.entries(floorData.nodes)) {
                if (key !== '_links') {
                    combined[key] = val;
                }
            }
        }
        combined._links = {};
        for (const floorData of world.floors) {
            if (floorData.nodes._links) {
                for (const [key, val] of Object.entries(floorData.nodes._links)) {
                    combined._links[key] = val;
                }
            }
        }

        const fromKey = fromFloor === 0 ? fromWp : `${fromFloor}_${fromWp}`;
        const toKey = toFloor === 0 ? toWp : `${toFloor}_${toWp}`;

        return bfsPath(combined, fromKey, toKey);
    }

    function reserveConfSeat(floor, seatIndex) {
        const key = `${floor}:conf_seat${seatIndex}`;
        if (seatReservations.has(key)) return false;
        seatReservations.add(key);
        return key;
    }

    function releaseConfSeat(key) {
        seatReservations.delete(key);
    }

    function reserveSeat(agent, wpName) {
        if (!world.sitTargets[wpName]) return null;
        const target = world.sitTargets[wpName];
        if (!target.sit) return null;
        for (const [name, st] of Object.entries(world.sitTargets)) {
            if (name === wpName && st.sit) {
                return { wpName: name, facing: st.facing };
            }
        }
        return null;
    }

    function compilePlanArriveToDesk(agent) {
        const plan = [];
        plan.push({ type: 'ENTER_STATE', state: 'ARRIVING' });

        plan.push({ type: 'WALK_TO_WP', floor: 0, wpName: 'outside' });
        plan.push({ type: 'WALK_TO_WP', floor: 0, wpName: 'entrance' });
        plan.push({ type: 'WALK_TO_WP', floor: 0, wpName: 'elevWait' });
        plan.push({ type: 'WAIT_AT_PANEL', floor: 0, dir: 1, toFloor: agent.homeFloor });
        plan.push({ type: 'ENTER_ELEVATOR', toFloor: agent.homeFloor });
        plan.push({ type: 'PRESS_FLOOR', floor: agent.homeFloor });
        plan.push({ type: 'WAIT_FOR_FLOOR', floor: agent.homeFloor });
        plan.push({ type: 'EXIT_ELEVATOR', toFloor: agent.homeFloor });
        plan.push({ type: 'WALK_TO_WP', floor: agent.homeFloor, wpName: agent.deskDoorWpName });
        plan.push({ type: 'WALK_TO_WP', floor: agent.homeFloor, wpName: agent.deskWpName });
        plan.push({ type: 'STAND' });
        plan.push({ type: 'SIT', floor: agent.homeFloor, wpName: agent.deskWpName });
        plan.push({ type: 'WAIT_SIM', minutes: 90 + Math.random() * 120 });
        plan.push({ type: 'PICK_NEXT_ACTIVITY' });

        return plan;
    }

    function compilePlanGoToLunch(agent) {
        const plan = [];
        plan.push({ type: 'ENTER_STATE', state: 'AT_LUNCH' });
        plan.push({ type: 'STAND' });
        plan.push({ type: 'RELEASE_SEAT' });
        plan.push({ type: 'WALK_TO_WP', floor: agent.homeFloor, wpName: agent.deskDoorWpName });
        plan.push({ type: 'WALK_TO_WP', floor: agent.homeFloor, wpName: 'elevWait' });
        plan.push({ type: 'WAIT_AT_PANEL', floor: agent.homeFloor, dir: -1, toFloor: 0 });
        plan.push({ type: 'ENTER_ELEVATOR', toFloor: 0 });
        plan.push({ type: 'PRESS_FLOOR', floor: 0 });
        plan.push({ type: 'WAIT_FOR_FLOOR', floor: 0 });
        plan.push({ type: 'EXIT_ELEVATOR', toFloor: 0 });
        plan.push({ type: 'WALK_TO_WP', floor: 0, wpName: 'bistro1' });
        plan.push({ type: 'STAND' });
        plan.push({ type: 'SIT', floor: 0, wpName: 'bistro1' });
        plan.push({ type: 'WAIT_SIM', minutes: agent.lunchDuration });
        plan.push({ type: 'MARK_LUNCHED' });
        plan.push({ type: 'STAND' });
        plan.push({ type: 'RELEASE_SEAT' });
        plan.push({ type: 'WALK_TO_WP', floor: 0, wpName: 'elevWait' });
        plan.push({ type: 'WAIT_AT_PANEL', floor: 0, dir: 1, toFloor: agent.homeFloor });
        plan.push({ type: 'ENTER_ELEVATOR', toFloor: agent.homeFloor });
        plan.push({ type: 'PRESS_FLOOR', floor: agent.homeFloor });
        plan.push({ type: 'WAIT_FOR_FLOOR', floor: agent.homeFloor });
        plan.push({ type: 'EXIT_ELEVATOR', toFloor: agent.homeFloor });
        plan.push({ type: 'WALK_TO_WP', floor: agent.homeFloor, wpName: agent.deskDoorWpName });
        plan.push({ type: 'WALK_TO_WP', floor: agent.homeFloor, wpName: agent.deskWpName });
        plan.push({ type: 'SIT', floor: agent.homeFloor, wpName: agent.deskWpName });
        plan.push({ type: 'WAIT_SIM', minutes: 20 + Math.random() * 40 });
        plan.push({ type: 'PICK_NEXT_ACTIVITY' });

        return plan;
    }

    function compilePlanVisitLounge(agent) {
        const plan = [];
        plan.push({ type: 'ENTER_STATE', state: 'AT_BREAK' });
        plan.push({ type: 'STAND' });
        plan.push({ type: 'RELEASE_SEAT' });
        plan.push({ type: 'WALK_TO_WP', floor: agent.homeFloor, wpName: agent.deskDoorWpName });
        const loungeSpots = ['lounge_spot0', 'lounge_spot1', 'lounge_spot2'];
        const spot = loungeSpots[Math.floor(Math.random() * loungeSpots.length)];
        plan.push({ type: 'WALK_TO_WP', floor: agent.homeFloor, wpName: `${agent.homeFloor}_${spot}` });
        plan.push({ type: 'STAND' });
        plan.push({ type: 'SIT', floor: agent.homeFloor, wpName: `${agent.homeFloor}_${spot}` });
        plan.push({ type: 'WAIT_SIM', minutes: 5 + Math.random() * 7 });
        plan.push({ type: 'STAND' });
        plan.push({ type: 'RELEASE_SEAT' });
        plan.push({ type: 'WALK_TO_WP', floor: agent.homeFloor, wpName: agent.deskDoorWpName });
        plan.push({ type: 'WALK_TO_WP', floor: agent.homeFloor, wpName: agent.deskWpName });
        plan.push({ type: 'SIT', floor: agent.homeFloor, wpName: agent.deskWpName });
        plan.push({ type: 'WAIT_SIM', minutes: 15 + Math.random() * 30 });
        plan.push({ type: 'PICK_NEXT_ACTIVITY' });

        return plan;
    }

    function compilePlanAttendMeeting(agent) {
        const plan = [];
        plan.push({ type: 'ENTER_STATE', state: 'IN_MEETING' });

        let meetFloor = agent.homeFloor;
        if (Math.random() > 0.65) {
            meetFloor = 1 + Math.floor(Math.random() * 5);
        }

        const seatKey = reserveConfSeat(meetFloor, 0);
        let seatName = null;
        if (seatKey) {
            seatName = `${meetFloor}_conf_seat0`;
        } else {
            for (let i = 1; i < 4; i++) {
                const k = reserveConfSeat(meetFloor, i);
                if (k) {
                    seatName = `${meetFloor}_conf_seat${i}`;
                    break;
                }
            }
        }

        plan.push({ type: 'STAND' });
        plan.push({ type: 'RELEASE_SEAT' });
        plan.push({ type: 'WALK_TO_WP', floor: agent.homeFloor, wpName: agent.deskDoorWpName });
        plan.push({ type: 'WALK_TO_WP', floor: agent.homeFloor, wpName: 'elevWait' });
        plan.push({ type: 'WAIT_AT_PANEL', floor: agent.homeFloor, dir: meetFloor > agent.homeFloor ? 1 : -1, toFloor: meetFloor });
        plan.push({ type: 'ENTER_ELEVATOR', toFloor: meetFloor });
        plan.push({ type: 'PRESS_FLOOR', floor: meetFloor });
        plan.push({ type: 'WAIT_FOR_FLOOR', floor: meetFloor });
        plan.push({ type: 'EXIT_ELEVATOR', toFloor: meetFloor });
        plan.push({ type: 'WALK_TO_WP', floor: meetFloor, wpName: `${meetFloor}_conf_door` });
        if (seatName) {
            plan.push({ type: 'WALK_TO_WP', floor: meetFloor, wpName: seatName });
            plan.push({ type: 'STAND' });
            plan.push({ type: 'SIT', floor: meetFloor, wpName: seatName });
            plan.push({ type: 'WAIT_SIM', minutes: 22 + Math.random() * 23 });
            plan.push({ type: 'STAND' });
            plan.push({ type: 'RELEASE_SEAT', seatKey: seatName.replace(`${meetFloor}_`, '') });
        }
        plan.push({ type: 'WALK_TO_WP', floor: meetFloor, wpName: 'elevWait' });
        plan.push({ type: 'WAIT_AT_PANEL', floor: meetFloor, dir: agent.homeFloor > meetFloor ? -1 : 1, toFloor: agent.homeFloor });
        plan.push({ type: 'ENTER_ELEVATOR', toFloor: agent.homeFloor });
        plan.push({ type: 'PRESS_FLOOR', floor: agent.homeFloor });
        plan.push({ type: 'WAIT_FOR_FLOOR', floor: agent.homeFloor });
        plan.push({ type: 'EXIT_ELEVATOR', toFloor: agent.homeFloor });
        plan.push({ type: 'WALK_TO_WP', floor: agent.homeFloor, wpName: agent.deskDoorWpName });
        plan.push({ type: 'WALK_TO_WP', floor: agent.homeFloor, wpName: agent.deskWpName });
        plan.push({ type: 'SIT', floor: agent.homeFloor, wpName: agent.deskWpName });
        plan.push({ type: 'WAIT_SIM', minutes: 30 + Math.random() * 60 });
        plan.push({ type: 'PICK_NEXT_ACTIVITY' });

        return plan;
    }

    function compilePlanVisitCoworker(agent) {
        const plan = [];
        plan.push({ type: 'ENTER_STATE', state: 'VISITING' });
        plan.push({ type: 'STAND' });
        plan.push({ type: 'RELEASE_SEAT' });

        const coworkers = agents.filter(a =>
            a.role === 'WORKER' &&
            a.homeFloor === agent.homeFloor &&
            a.state === 'AT_DESK' &&
            a.id !== agent.id
        );

        if (coworkers.length === 0) {
            plan.push({ type: 'WALK_TO_WP', floor: agent.homeFloor, wpName: agent.deskDoorWpName });
            plan.push({ type: 'WALK_TO_WP', floor: agent.homeFloor, wpName: agent.deskWpName });
            plan.push({ type: 'SIT', floor: agent.homeFloor, wpName: agent.deskWpName });
            plan.push({ type: 'WAIT_SIM', minutes: 10 });
            plan.push({ type: 'PICK_NEXT_ACTIVITY' });
            return plan;
        }

        const target = coworkers[Math.floor(Math.random() * coworkers.length)];
        const targetDoor = target.deskDoorWpName;

        plan.push({ type: 'WALK_TO_WP', floor: agent.homeFloor, wpName: targetDoor });
        plan.push({ type: 'WAIT_SIM', minutes: 6 + Math.random() * 12 });
        plan.push({ type: 'WALK_TO_WP', floor: agent.homeFloor, wpName: agent.deskDoorWpName });
        plan.push({ type: 'WALK_TO_WP', floor: agent.homeFloor, wpName: agent.deskWpName });
        plan.push({ type: 'SIT', floor: agent.homeFloor, wpName: agent.deskWpName });
        plan.push({ type: 'WAIT_SIM', minutes: 20 + Math.random() * 40 });
        plan.push({ type: 'PICK_NEXT_ACTIVITY' });

        return plan;
    }

    function compilePlanLeaveBuilding(agent) {
        const plan = [];
        plan.push({ type: 'ENTER_STATE', state: 'LEAVING' });
        plan.push({ type: 'STAND' });
        plan.push({ type: 'RELEASE_SEAT' });
        plan.push({ type: 'WALK_TO_WP', floor: agent.homeFloor, wpName: agent.deskDoorWpName });
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

    function compilePlanVisitorVisit(agent) {
        const plan = [];
        plan.push({ type: 'ENTER_STATE', state: 'ARRIVING' });

        plan.push({ type: 'WALK_TO_WP', floor: 0, wpName: 'outside' });
        plan.push({ type: 'WALK_TO_WP', floor: 0, wpName: 'entrance' });

        const roll = Math.random();
        let activity = 'lobby_loiter';
        if (roll < 0.10) activity = 'bistro';
        else if (roll < 0.16) activity = 'cafe_counter';
        else if (roll < 0.30) activity = 'front_lounge';
        else if (roll < 0.42) activity = 'back_lounge';
        else if (roll < 0.52) activity = 'reception_kiosk';
        else if (roll < 0.62) activity = 'lobby_loiter';
        else if (roll < 0.77) activity = 'ride_up_lounge';
        else activity = 'attend_meeting';

        if (activity === 'bistro') {
            const spots = ['bistro1', 'bistro2'];
            const spot = spots[Math.floor(Math.random() * spots.length)];
            plan.push({ type: 'WALK_TO_WP', floor: 0, wpName: spot });
            plan.push({ type: 'STAND' });
            plan.push({ type: 'SIT', floor: 0, wpName: spot });
            plan.push({ type: 'WAIT_SIM', minutes: 10 + Math.random() * 15 });
        } else if (activity === 'cafe_counter') {
            plan.push({ type: 'WALK_TO_WP', floor: 0, wpName: 'cafe_order' });
            plan.push({ type: 'WAIT_SIM', minutes: 3 + Math.random() * 5 });
        } else if (activity === 'front_lounge') {
            plan.push({ type: 'WALK_TO_WP', floor: 0, wpName: 'front_lounge_1' });
            plan.push({ type: 'STAND' });
            plan.push({ type: 'SIT', floor: 0, wpName: 'front_lounge_1' });
            plan.push({ type: 'WAIT_SIM', minutes: 10 + Math.random() * 15 });
        } else if (activity === 'back_lounge') {
            const spots = ['back_lounge_N', 'back_lounge_S', 'pit_N', 'pit_S', 'pit_E', 'pit_W'];
            const spot = spots[Math.floor(Math.random() * spots.length)];
            plan.push({ type: 'WALK_TO_WP', floor: 0, wpName: spot });
            plan.push({ type: 'STAND' });
            plan.push({ type: 'SIT', floor: 0, wpName: spot });
            plan.push({ type: 'WAIT_SIM', minutes: 10 + Math.random() * 20 });
        } else if (activity === 'reception_kiosk') {
            const spots = ['reception', 'kiosk', 'lobby_wc_front', 'lobby_wc_back'];
            const spot = spots[Math.floor(Math.random() * spots.length)];
            plan.push({ type: 'WALK_TO_WP', floor: 0, wpName: spot });
            plan.push({ type: 'WAIT_SIM', minutes: 3 + Math.random() * 5 });
        } else if (activity === 'lobby_loiter') {
            const spots = ['lobby_stand_center', 'lobby_stand_NE', 'lobby_stand_NW', 'lobby_stand_midE', 'lobby_stand_midW', 'lobby_stand_entry'];
            const spot = spots[Math.floor(Math.random() * spots.length)];
            plan.push({ type: 'WALK_TO_WP', floor: 0, wpName: spot });
            plan.push({ type: 'WAIT_SIM', minutes: 5 + Math.random() * 10 });
        } else if (activity === 'ride_up_lounge') {
            const meetFloor = 1 + Math.floor(Math.random() * 5);
            const loungeSpots = ['lounge_spot0', 'lounge_spot1', 'lounge_spot2'];
            const spot = loungeSpots[Math.floor(Math.random() * loungeSpots.length)];

            plan.push({ type: 'WALK_TO_WP', floor: 0, wpName: 'elevWait' });
            plan.push({ type: 'WAIT_AT_PANEL', floor: 0, dir: 1, toFloor: meetFloor });
            plan.push({ type: 'ENTER_ELEVATOR', toFloor: meetFloor });
            plan.push({ type: 'PRESS_FLOOR', floor: meetFloor });
            plan.push({ type: 'WAIT_FOR_FLOOR', floor: meetFloor });
            plan.push({ type: 'EXIT_ELEVATOR', toFloor: meetFloor });
            plan.push({ type: 'WALK_TO_WP', floor: meetFloor, wpName: `${meetFloor}_${spot}` });
            plan.push({ type: 'STAND' });
            plan.push({ type: 'SIT', floor: meetFloor, wpName: `${meetFloor}_${spot}` });
            plan.push({ type: 'WAIT_SIM', minutes: 10 + Math.random() * 20 });
            plan.push({ type: 'STAND' });
            plan.push({ type: 'RELEASE_SEAT' });
            plan.push({ type: 'WALK_TO_WP', floor: meetFloor, wpName: 'elevWait' });
            plan.push({ type: 'WAIT_AT_PANEL', floor: meetFloor, dir: -1, toFloor: 0 });
            plan.push({ type: 'ENTER_ELEVATOR', toFloor: 0 });
            plan.push({ type: 'PRESS_FLOOR', floor: 0 });
            plan.push({ type: 'WAIT_FOR_FLOOR', floor: 0 });
            plan.push({ type: 'EXIT_ELEVATOR', toFloor: 0 });
        } else if (activity === 'attend_meeting') {
            const meetFloor = 1 + Math.floor(Math.random() * 5);
            let seatName = null;
            let seatKey = null;

            for (let i = 0; i < 4; i++) {
                const k = reserveConfSeat(meetFloor, i);
                if (k) {
                    seatName = `${meetFloor}_conf_seat${i}`;
                    seatKey = i;
                    break;
                }
            }

            if (!seatName) {
                const fallbackSpots = ['lobby_stand_center', 'lobby_stand_NE'];
                const spot = fallbackSpots[Math.floor(Math.random() * fallbackSpots.length)];
                plan.push({ type: 'WALK_TO_WP', floor: 0, wpName: spot });
                plan.push({ type: 'WAIT_SIM', minutes: 15 + Math.random() * 15 });
            } else {
                plan.push({ type: 'WALK_TO_WP', floor: 0, wpName: 'elevWait' });
                plan.push({ type: 'WAIT_AT_PANEL', floor: 0, dir: 1, toFloor: meetFloor });
                plan.push({ type: 'ENTER_ELEVATOR', toFloor: meetFloor });
                plan.push({ type: 'PRESS_FLOOR', floor: meetFloor });
                plan.push({ type: 'WAIT_FOR_FLOOR', floor: meetFloor });
                plan.push({ type: 'EXIT_ELEVATOR', toFloor: meetFloor });
                plan.push({ type: 'WALK_TO_WP', floor: meetFloor, wpName: `${meetFloor}_conf_door` });
                plan.push({ type: 'WALK_TO_WP', floor: meetFloor, wpName: seatName });
                plan.push({ type: 'STAND' });
                plan.push({ type: 'SIT', floor: meetFloor, wpName: seatName });
                plan.push({ type: 'WAIT_SIM', minutes: 20 + Math.random() * 25 });
                plan.push({ type: 'STAND' });
                plan.push({ type: 'RELEASE_SEAT' });
                plan.push({ type: 'WALK_TO_WP', floor: meetFloor, wpName: 'elevWait' });
                plan.push({ type: 'WAIT_AT_PANEL', floor: meetFloor, dir: -1, toFloor: 0 });
                plan.push({ type: 'ENTER_ELEVATOR', toFloor: 0 });
                plan.push({ type: 'PRESS_FLOOR', floor: 0 });
                plan.push({ type: 'WAIT_FOR_FLOOR', floor: 0 });
                plan.push({ type: 'EXIT_ELEVATOR', toFloor: 0 });
            }
        }

        plan.push({ type: 'WALK_TO_WP', floor: 0, wpName: 'entrance' });
        plan.push({ type: 'WALK_TO_WP', floor: 0, wpName: 'outside' });
        plan.push({ type: 'EXIT_BUILDING' });

        return plan;
    }

    function chooseNextActivity(agent) {
        if (agent.role === 'WORKER') {
            if (clock.simMinute >= agent.departureTime) {
                return compilePlanLeaveBuilding(agent);
            }

            for (let i = agent.plannedMeetingTimes.length - 1; i >= 0; i--) {
                if (clock.simMinute >= agent.plannedMeetingTimes[i]) {
                    agent.plannedMeetingTimes.splice(i, 1);
                    return compilePlanAttendMeeting(agent);
                }
            }

            if (clock.simMinute >= agent.lunchTime && !agent.hasLunched) {
                return compilePlanGoToLunch(agent);
            }

            const roll = Math.random();
            if (roll < 0.14 * MEETING_PROB * 0.4) {
                return compilePlanAttendMeeting(agent);
            } else if (roll < 0.14 * MEETING_PROB * 0.4 + 0.12) {
                return compilePlanVisitLounge(agent);
            } else if (roll < 0.14 * MEETING_PROB * 0.4 + 0.12 + 0.15) {
                return compilePlanVisitCoworker(agent);
            } else {
                const waitTime = 18 + Math.random() * 47;
                return [{ type: 'WAIT_SIM', minutes: waitTime }, { type: 'PICK_NEXT_ACTIVITY' }];
            }
        } else {
            return compilePlanVisitorVisit(agent);
        }
    }

    function startAction(agent, action) {
        agent.currentAction = action;

        switch (action.type) {
            case 'ENTER_STATE':
                agent.state = action.state;
                break;

            case 'WALK_TO_WP':
                agent.state = agent.role === 'WORKER' ? 'ON_FLOOR' : 'VISITING';
                {
                    const path = findPath(
                        agent.group.userData.currentFloor || 0,
                        agent._currentWp || 'elevWait',
                        action.floor,
                        action.wpName
                    );
                    agent._walkPath = path;
                    agent._walkIndex = 0;
                    agent._prevWp = agent._currentWp;
                    agent._stallT = 0;
                    agent._prevWalk = null;
                }
                break;

            case 'WAIT_AT_PANEL':
                agent.state = 'WAITING_ELEVATOR';
                if (action.dir === 1) {
                    elevator.callUp(action.floor);
                } else {
                    elevator.callDown(action.floor);
                }
                agent._panelFloor = action.floor;
                agent._panelDir = action.dir;
                agent._panelToFloor = action.toFloor;
                break;

            case 'ENTER_ELEVATOR':
                agent.state = 'ENTERING_ELEVATOR';
                {
                    const spot = elevator.reserveBoardingSpot(agent.id);
                    if (!spot) {
                        break;
                    }
                    agent.reservation = spot;
                    agent.toFloor = action.toFloor;
                    agent._boardingStage = 'approach';
                    agent._targetX = spot.x;
                    agent._targetZ = spot.z;
                }
                break;

            case 'PRESS_FLOOR':
                elevator.pressDestination(action.floor);
                agent.toFloor = action.floor;
                break;

            case 'WAIT_FOR_FLOOR':
                agent.state = 'IN_CAR';
                break;

            case 'EXIT_ELEVATOR':
                elevator.registerDisembark(agent.id);
                agent._exitingStage = 'to_door';
                agent.state = 'EXITING_ELEVATOR';
                {
                    const parent = agent.group.parent;
                    if (parent === elevator.carGroup) {
                        const worldPos = new THREE.Vector3();
                        agent.group.getWorldPosition(worldPos);
                        parent.remove(agent.group);
                        scene.add(agent.group);
                        agent.group.position.copy(worldPos);
                        agent.group.position.y -= agent.group.parent ? 0 : 0;
                    }
                }
                break;

            case 'SIT':
                {
                    const target = world.sitTargets[action.wpName];
                    if (target && target.sit) {
                        agent.group.position.y -= 0.35;
                        agent.group.rotation.y = target.facing;
                        agent.group.userData.isSitting = true;
                        agent._sittingWp = action.wpName;
                    }
                }
                break;

            case 'STAND':
                agent.group.userData.isSitting = false;
                agent.group.position.y = agent.group.userData.currentFloor * FLOOR_HEIGHT || 0;
                if (agent.group.parent === elevator.carGroup) {
                    agent.group.position.y += FLOOR_HEIGHT * 0.5;
                }
                break;

            case 'RELEASE_SEAT':
                if (agent._sittingWp) {
                    seatReservations.delete(agent._sittingWp);
                    agent._sittingWp = null;
                }
                break;

            case 'WAIT_SIM':
                {
                    const untilMin = clock.simMinute + action.minutes;
                    agent._waitUntilMin = untilMin;
                }
                break;

            case 'EXIT_BUILDING':
                agent.state = 'GONE';
                agent.group.visible = false;
                break;

            case 'MARK_LUNCHED':
                agent.hasLunched = true;
                break;

            case 'PICK_NEXT_ACTIVITY':
                agent.plan = chooseNextActivity(agent);
                break;
        }
    }

    function updateAction(agent, dt) {
        const action = agent.currentAction;
        if (!action) return;

        const iterations = 16;
        for (let i = 0; i < iterations; i++) {
            const current = agent.currentAction;
            if (!current) break;

            switch (current.type) {
                case 'WALK_TO_WP':
                    {
                        const path = agent._walkPath;
                        const idx = agent._walkIndex;
                        if (!path || idx >= path.length) {
                            agent.currentAction = null;
                            agent.state = agent.role === 'WORKER' ? 'ON_FLOOR' : 'VISITING';
                            break;
                        }

                        const target = path[idx];
                        const dx = target.x - agent.group.position.x;
                        const dz = target.z - agent.group.position.z;
                        const dist = Math.sqrt(dx * dx + dz * dz);

                        if (dist < 0.15) {
                            agent._prevWp = agent._currentWp;
                            agent._currentWp = current.wpName;
                            agent.group.userData.currentFloor = current.floor;
                            agent._walkIndex++;
                            if (agent._walkIndex >= path.length) {
                                agent._currentWp = current.wpName;
                                agent.group.userData.currentFloor = current.floor;
                            }
                            break;
                        }

                        const speed = 1.3;
                        const move = Math.min(speed * dt, dist);
                        agent.group.position.x += (dx / dist) * move;
                        agent.group.position.z += (dz / dist) * move;

                        const angle = Math.atan2(dx, dz);
                        agent.group.rotation.y = angle;

                        agent.group.userData.isWalking = true;

                        if (agent._prevWalk) {
                            const prevDist = Math.sqrt(
                                Math.pow(agent.group.position.x - agent._prevWalk.x, 2) +
                                Math.pow(agent.group.position.z - agent._prevWalk.z, 2)
                            );
                            if (prevDist < 0.005) {
                                agent._stallT += dt;
                                if (agent._stallT > 1.2) {
                                    agent._walkIndex++;
                                    agent._stallT = 0;
                                }
                            } else {
                                agent._stallT = 0;
                            }
                        }
                        agent._prevWalk = { x: agent.group.position.x, z: agent.group.position.z };
                    }
                    break;

                case 'WAIT_AT_PANEL':
                    {
                        const accepting = elevator.isAcceptingAt(current.floor, current.dir);
                        if (accepting) {
                            if (elevator.currentCapacityFree() > 0) {
                                agent.currentAction = { type: 'ENTER_ELEVATOR', toFloor: current.toFloor };
                            }
                            break;
                        }
                        if (current.dir === 1) {
                            elevator.callUp(current.floor);
                        } else {
                            elevator.callDown(current.floor);
                        }
                    }
                    break;

                case 'ENTER_ELEVATOR':
                    {
                        if (agent._boardingStage === 'approach') {
                            const dx = agent._targetX - agent.group.position.x;
                            const dz = agent._targetZ - agent.group.position.z;
                            const dist = Math.sqrt(dx * dx + dz * dz);

                            if (dist < 0.2) {
                                agent._boardingStage = 'board';
                                elevator.completeBoard(agent.id);
                                agent.group.parent.remove(agent.group);
                                elevator.carGroup.add(agent.group);
                                agent.group.position.set(agent.reservation.x, agent.reservation.y, agent.reservation.z);
                                agent.group.rotation.y = 0;
                                agent.currentAction = { type: 'PRESS_FLOOR', floor: agent.toFloor };
                            } else {
                                const speed = 1.0;
                                const move = Math.min(speed * dt, dist);
                                agent.group.position.x += (dx / dist) * move;
                                agent.group.position.z += (dz / dist) * move;
                                agent.group.userData.isWalking = true;
                            }
                        }
                    }
                    break;

                case 'WAIT_FOR_FLOOR':
                    {
                        const state = elevator.getState();
                        if (state === 'DOOR_OPEN' && elevator.getCurrentFloor() === current.floor) {
                            agent.currentAction = { type: 'EXIT_ELEVATOR', toFloor: current.floor };
                        }
                    }
                    break;

                case 'EXIT_ELEVATOR':
                    {
                        if (agent._exitingStage === 'to_door') {
                            agent._exitingStage = 'disembark';
                        }

                        elevator.completeDisembark(agent.id);
                        agent.group.parent.remove(agent.group);
                        scene.add(agent.group);
                        const floor = agent.group.userData.currentFloor || 0;
                        const nodeName = floor === 0 ? 'elevWait' : `${floor}_elevWait`;
                        const node = world.floors[floor].nodes[nodeName];
                        if (node) {
                            agent.group.position.set(node.x, floor * FLOOR_HEIGHT, node.z);
                        }
                        agent.group.userData.isWalking = false;
                        agent.reservation = null;
                        agent.currentAction = null;
                    }
                    break;

                case 'WAIT_SIM':
                    {
                        if (clock.simMinute >= agent._waitUntilMin) {
                            agent.currentAction = null;
                        }
                    }
                    break;

                case 'SIT':
                case 'STAND':
                case 'PRESS_FLOOR':
                case 'ENTER_STATE':
                case 'MARK_LUNCHED':
                case 'RELEASE_SEAT':
                    agent.currentAction = null;
                    break;

                case 'PICK_NEXT_ACTIVITY':
                    if (agent.plan.length > 0) {
                        const next = agent.plan.shift();
                        startAction(agent, next);
                    } else {
                        agent.currentAction = null;
                    }
                    break;

                case 'EXIT_BUILDING':
                    break;

                default:
                    agent.currentAction = null;
            }

            if (agent.currentAction !== current) continue;
            if (!agent.currentAction) break;
        }
    }

    function processAgent(agent, dt) {
        if (agent.state === 'DISABLED' || agent.state === 'GONE') return;

        if (agent.state === 'AWAY') {
            if (clock.simMinute >= agent.arrivalTime) {
                agent.group.visible = true;
                agent.state = 'ARRIVING';
                agent.group.position.set(
                    (Math.random() - 0.5) * 2.2,
                    0,
                    12 + (Math.random() - 0.5) * 1.5
                );
                agent.group.userData.currentFloor = 0;

                if (agent.role === 'WORKER') {
                    agent.plan = compilePlanArriveToDesk(agent);
                } else {
                    agent.plan = compilePlanVisitorVisit(agent);
                }

                if (agent.plan.length > 0) {
                    const firstAction = agent.plan.shift();
                    startAction(agent, firstAction);
                }
            }
            return;
        }

        if (agent.role === 'WORKER' && agent.state !== 'LEAVING' && agent.state !== 'GONE') {
            if (clock.simMinute >= agent.departureTime && !agent.currentAction?.type?.startsWith('WALK')) {
                agent.plan = compilePlanLeaveBuilding(agent);
                if (agent.plan.length > 0) {
                    const firstAction = agent.plan.shift();
                    startAction(agent, firstAction);
                }
            }
        }

        if (!agent.currentAction && agent.plan.length > 0) {
            const next = agent.plan.shift();
            startAction(agent, next);
        }

        if (agent.currentAction) {
            updateAction(agent, dt);
        }
    }

    function applyCollisions(dt) {
        const agents_array = agents.filter(a =>
            a.state !== 'DISABLED' &&
            a.state !== 'GONE' &&
            a.state !== 'AWAY'
        );

        const pushScalar = 0.18;

        for (let i = 0; i < agents_array.length; i++) {
            for (let j = i + 1; j < agents_array.length; j++) {
                const a = agents_array[i];
                const b = agents_array[j];

                if (a.currentAction?.type === 'ENTER_ELEVATOR' || b.currentAction?.type === 'ENTER_ELEVATOR') {
                    continue;
                }

                if (a.group.parent === elevator.carGroup || b.group.parent === elevator.carGroup) {
                    continue;
                }

                const dx = b.group.position.x - a.group.position.x;
                const dz = b.group.position.z - a.group.position.z;
                const dist = Math.sqrt(dx * dx + dz * dz);
                const minDist = 0.7;

                if (dist < minDist && dist > 1e-4) {
                    const overlap = minDist - dist;
                    const nx = dx / dist;
                    const nz = dz / dist;

                    a.group.position.x -= nx * overlap * pushScalar;
                    a.group.position.z -= nz * overlap * pushScalar;
                    b.group.position.x += nx * overlap * pushScalar;
                    b.group.position.z += nz * overlap * pushScalar;
                } else if (dist < 1e-3) {
                    const angle = Math.random() * Math.PI * 2;
                    const nx = Math.cos(angle);
                    const nz = Math.sin(angle);
                    a.group.position.x -= nx * 0.1;
                    a.group.position.z -= nz * 0.1;
                    b.group.position.x += nx * 0.1;
                    b.group.position.z += nz * 0.1;
                }
            }
        }
    }

    function countPresent() {
        return agents.filter(a =>
            a.state !== 'DISABLED' &&
            a.state !== 'GONE' &&
            a.state !== 'AWAY'
        ).length;
    }

    function topUpVisitors() {
        if (!clock.isBusinessHours()) return;

        const present = countPresent();
        let deficit = targetOccupancy - present;

        if (deficit <= 0) return;

        for (const agent of agents) {
            if (agent.role !== 'VISITOR') continue;
            if (agent.state !== 'AWAY' && agent.state !== 'GONE') continue;

            if (deficit <= 0) break;

            agent.arrivalTime = clock.simMinute + Math.floor(Math.random() * 6);
            agent.state = 'AWAY';
            agent.plan = [];
            agent.currentAction = null;
            agent.hasLunched = false;
            agent.group.visible = false;

            deficit--;
        }
    }

    function applyOccupancy() {
        for (const agent of agents) {
            if (agent.id < targetOccupancy) {
                if (agent.state === 'DISABLED') {
                    agent.state = 'AWAY';
                }
            } else {
                if (agent.state !== 'DISABLED' && agent.state !== 'AWAY' &&
                    agent.state !== 'GONE' && agent.state !== 'ARRIVING' &&
                    agent.state !== 'WAITING_ELEVATOR' && agent.state !== 'IN_CAR' &&
                    agent.state !== 'EXITING_ELEVATOR' && agent.state !== 'ENTERING_ELEVATOR') {
                }
            }
        }
    }

    function updateDayNight() {
        const t = clock.simMinute;
        const t6 = Math.abs(t - 6 * 60);
        const t18 = Math.abs(t - 18 * 60);

        let bgColor, sunColor, sunIntensity, ambientIntensity, hemiIntensity;

        if (t >= 6.5 * 60 && t <= 17 * 60) {
            bgColor = new THREE.Color(0x87ceeb);
            sunColor = new THREE.Color(0xffffff);
            sunIntensity = 1.0;
            ambientIntensity = 0.6;
            hemiIntensity = 0.7;
        } else if (t >= 6 * 60 && t < 6.5 * 60) {
            const blend = 1 - (t - 6 * 60) / (0.5 * 60);
            bgColor = new THREE.Color(0x4a4a5c).lerp(new THREE.Color(0x87ceeb), 1 - blend);
            sunColor = new THREE.Color(0xffaa44);
            sunIntensity = 0.3 + blend * 0.7;
            ambientIntensity = 0.3 + blend * 0.3;
            hemiIntensity = 0.35 + blend * 0.35;
        } else if (t > 17 * 60 && t < 18 * 60) {
            const blend = (t - 17 * 60) / (1 * 60);
            bgColor = new THREE.Color(0x87ceeb).lerp(new THREE.Color(0x4a4a5c), blend);
            sunColor = new THREE.Color(0xffaa44);
            sunIntensity = 1.0 - blend * 0.7;
            ambientIntensity = 0.6 - blend * 0.3;
            hemiIntensity = 0.7 - blend * 0.35;
        } else {
            bgColor = new THREE.Color(0x1a1a2c);
            sunColor = new THREE.Color(0x444466);
            sunIntensity = 0.15;
            ambientIntensity = 0.45;
            hemiIntensity = 0.32;
        }

        renderer.setClearColor(bgColor);
        scene.fog = new THREE.Fog(bgColor, 40, 120);
    }

    function updateHUD() {
        const timeStr = clock.format();
        document.getElementById('simTime').textContent = timeStr;

        const stateCounts = {};
        for (const agent of agents) {
            if (agent.state !== 'DISABLED') {
                stateCounts[agent.state] = (stateCounts[agent.state] || 0) + 1;
            }
        }
        document.getElementById('stateBreakdown').textContent = JSON.stringify(stateCounts, null, '');

        const elevState = elevator.getState();
        const elevFloor = elevator.getCurrentFloor();
        const elevDir = elevator.getDirection();
        const elevPass = elevator.getPassengerCount();
        const elevDests = Array.from(elevator.getDestinations()).join(',');
        const elevUp = Array.from(elevator.getUpCalls()).join(',');
        const elevDown = Array.from(elevator.getDownCalls()).join(',');

        document.getElementById('elevatorInfo').textContent =
            `Floor: ${elevFloor} | Dir: ${elevDir > 0 ? 'UP' : elevDir < 0 ? 'DOWN' : '--'} | State: ${elevState} | Px: ${elevPass} | Dests: [${elevDests}] | Up: [${elevUp}] | Down: [${elevDown}]`;
    }

    function init() {
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x87ceeb);
        scene.fog = new THREE.Fog(0x87ceeb, 40, 120);

        camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.set(28, 24, 28);
        camera.lookAt(0, 12, 0);

        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.sortObjects = true;
        document.body.appendChild(renderer.domElement);

        controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controls.target.set(0, 10, 0);

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambientLight);

        const sunLight = new THREE.DirectionalLight(0xffffff, 1.0);
        sunLight.position.set(20, 30, 20);
        scene.add(sunLight);

        const hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x444444, 0.7);
        scene.add(hemiLight);

        const worldResult = createWorld(scene);
        world = worldResult;

        elevator = new Elevator(scene, world);

        clock = new SimClock();
        initAgents();

        createUI();

        window.addEventListener('resize', onWindowResize);

        animate();
    }

    function createUI() {
        const hud = document.createElement('div');
        hud.style.cssText = 'position:absolute;top:20px;left:20px;background:rgba(0,0,0,0.75);color:#fff;font-family:monospace;font-size:13px;padding:15px;border-radius:8px;min-width:280px;z-index:100';
        hud.innerHTML = `
            <div id="simTime" style="font-size:28px;font-weight:bold;margin-bottom:10px;"> 8:30 AM</div>
            <div style="margin-bottom:10px;">
                <label>Speed: </label>
                <input type="range" id="speedSlider" min="1" max="600" value="120" style="width:200px">
                <span id="speedLabel">120x</span>
            </div>
            <div style="margin-bottom:10px;">
                <label>Occupancy: </label>
                <input type="range" id="occupancySlider" min="1" max="100" value="45" style="width:200px">
                <span id="occupancyLabel">45 / 100</span>
            </div>
            <div id="stateBreakdown" style="font-size:11px;margin-bottom:8px;"></div>
            <div id="elevatorInfo" style="font-size:11px;"></div>
        `;
        document.body.appendChild(hud);

        const speedSlider = document.getElementById('speedSlider');
        const speedLabel = document.getElementById('speedLabel');
        speedSlider.addEventListener('input', function() {
            const vals = [1, 2, 5, 10, 20, 40, 60, 100, 150, 200, 300, 450, 600];
            const idx = Math.floor((this.value / 600) * (vals.length - 1));
            timeScale = vals[idx];
            speedLabel.textContent = timeScale + 'x';
            clock.timeScale = timeScale;
        });

        const occSlider = document.getElementById('occupancySlider');
        const occLabel = document.getElementById('occupancyLabel');
        occSlider.addEventListener('input', function() {
            targetOccupancy = parseInt(this.value);
            occLabel.textContent = targetOccupancy + ' / 100';
            applyOccupancy();
        });
    }

    function onWindowResize() {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }

    function animate() {
        requestAnimationFrame(animate);

        const realDt = Math.min(0.05, clock.getDelta ? clock.getDelta() : 0.016);
        const didDayWrap = clock.tick(realDt);
        if (didDayWrap) {
            resetDay();
        }

        updateDayNight();

        const motionDt = realDt * timeScale;

        elevator.tick(motionDt);

        for (const agent of agents) {
            processAgent(agent, motionDt);
        }

        topUpVisitors();

        applyCollisions(motionDt);

        for (const agent of agents) {
            if (agent.state !== 'DISABLED' && agent.state !== 'GONE') {
                animatePersonWalking(agent.group, motionDt);
            }
        }

        controls.update();
        renderer.render(scene, camera);
        updateHUD();
    }

    function getClock() {
        return clock;
    }

    root.init = init;
    root.getClock = getClock;

})(typeof window !== 'undefined' ? window : globalThis);
