/* sim.js - simulated clock, office workers, visitors, lighting and render loop. */
(function () {
    "use strict";

    const SIM_MAX_WORKERS = 20;
    const SIM_MAX_VISITORS = 80;
    const SIM_MAX_OCCUPANCY = SIM_MAX_WORKERS + SIM_MAX_VISITORS;
    const SIM_DEFAULT_OCCUPANCY = 45;
    const AGENT_WALK_SPEED = 1.35;
    const AGENT_SEPARATION = 0.78;
    const ENTRANCE_WAYPOINTS = ["outside", "front_door_threshold", "entrance", "lobby_center"];

    const FIRST_NAMES = [
        "Ava", "Ben", "Cara", "Dev", "Elena", "Finn", "Gina", "Hugo", "Iris", "Jack",
        "Kira", "Liam", "Maya", "Nico", "Olive", "Pablo", "Quinn", "Rosa", "Sam", "Tara",
        "Uma", "Vince", "Willa", "Xander", "Yara", "Zane", "Noah", "Mia", "Owen", "Ruby"
    ];

    const DAY_KEYFRAMES = [
        { hour: 0, bg: 0x111827, sun: 0x8899bb, sunInt: 0.12, amb: 0.45, hemi: 0.32 },
        { hour: 5.5, bg: 0x111827, sun: 0x8899bb, sunInt: 0.12, amb: 0.45, hemi: 0.32 },
        { hour: 6.0, bg: 0x2b2b3d, sun: 0xffb066, sunInt: 0.35, amb: 0.48, hemi: 0.35 },
        { hour: 6.5, bg: 0x8fb7d9, sun: 0xffe0b0, sunInt: 0.8, amb: 0.55, hemi: 0.5 },
        { hour: 7.0, bg: 0xbfd9ef, sun: 0xfff2cc, sunInt: 1.0, amb: 0.55, hemi: 0.55 },
        { hour: 12.0, bg: 0xcfe6f7, sun: 0xffffff, sunInt: 1.05, amb: 0.55, hemi: 0.55 },
        { hour: 17.0, bg: 0xd9c8a8, sun: 0xffd28a, sunInt: 0.9, amb: 0.52, hemi: 0.5 },
        { hour: 17.5, bg: 0xb97b52, sun: 0xff9a55, sunInt: 0.55, amb: 0.48, hemi: 0.42 },
        { hour: 18.0, bg: 0x5c4a5e, sun: 0xcc7744, sunInt: 0.3, amb: 0.46, hemi: 0.36 },
        { hour: 18.5, bg: 0x1b2233, sun: 0x7788aa, sunInt: 0.14, amb: 0.45, hemi: 0.32 },
        { hour: 24, bg: 0x111827, sun: 0x8899bb, sunInt: 0.12, amb: 0.45, hemi: 0.32 }
    ];

    let scene = null;
    let camera = null;
    let renderer = null;
    let controls = null;
    let world = null;
    let elevator = null;
    let sunLight = null;
    let ambientLight = null;
    let hemiLight = null;
    let agents = [];
    let seatReservations = new Set();
    let targetOccupancy = SIM_DEFAULT_OCCUPANCY;
    let hudTime = null;
    let hudStats = null;
    let hudOccupancy = null;
    let lastFrameMs = 0;

    const simClock = {
        simMinute: 7 * 60 + 30,
        timeScale: 120,
        onNewDay: null,
        tick: function (realDt) {
            this.simMinute += realDt * this.timeScale / 60;
            if (this.simMinute >= 24 * 60) {
                this.simMinute -= 24 * 60;
                if (this.onNewDay) this.onNewDay();
            }
        },
        format: function () {
            const total = Math.floor(this.simMinute) % (24 * 60);
            let hour = Math.floor(total / 60);
            const minute = total % 60;
            const suffix = hour >= 12 ? "PM" : "AM";
            hour = hour % 12;
            if (hour === 0) hour = 12;
            return " " + hour + ":" + String(minute).padStart(2, "0") + " " + suffix;
        }
    };

    function randInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    function randomChoice(list) {
        if (!list || !list.length) return null;
        return list[Math.floor(Math.random() * list.length)];
    }

    function seatKey(floor, wpName) {
        return String(floor) + ":" + wpName;
    }

    function reserveSeat(agent, floor, wpName) {
        const key = seatKey(floor, wpName);
        if (seatReservations.has(key)) return null;
        seatReservations.add(key);
        if (agent.reservedSeats.indexOf(key) === -1) agent.reservedSeats.push(key);
        return key;
    }

    function releaseSeatKey(agent, key) {
        if (!key) return;
        seatReservations.delete(key);
        const index = agent.reservedSeats.indexOf(key);
        if (index >= 0) agent.reservedSeats.splice(index, 1);
    }

    function releaseAgentSeats(agent) {
        for (let i = 0; i < agent.reservedSeats.length; i += 1) {
            seatReservations.delete(agent.reservedSeats[i]);
        }
        agent.reservedSeats = [];
    }

    function findFreeSeat(agent, floor, names) {
        if (!names || !names.length) return null;
        const start = Math.floor(Math.random() * names.length);
        for (let offset = 0; offset < names.length; offset += 1) {
            const wpName = names[(start + offset) % names.length];
            const key = reserveSeat(agent, floor, wpName);
            if (key) return { wp: wpName, key: key };
        }
        return null;
    }

    function resampleSchedule(agent, initial) {
        releaseAgentSeats(agent);
        agent.hasLunched = false;
        agent.leaving = false;
        agent.plan = [];
        agent.currentAction = null;
        agent.path = [];
        agent.pathIndex = 0;
        agent.group.userData.isSitting = false;
        agent.group.userData.isWalking = false;
        agent.plannedMeetingTimes = [];

        if (agent.role === "WORKER") {
            agent.arrivalTime = randInt(8 * 60 + 15, 9 * 60 + 30);
            agent.lunchTime = randInt(11 * 60 + 30, 13 * 60 + 30);
            agent.lunchDuration = randInt(25, 60);
            agent.departureTime = randInt(16 * 60 + 45, 18 * 60 + 30);
            if (Math.random() < 0.15) agent.departureTime = randInt(18 * 60 + 30, 19 * 60 + 45);
            if (Math.random() < 0.65) agent.plannedMeetingTimes.push(randInt(9 * 60 + 30, 11 * 60 + 20));
            if (Math.random() < 0.6) agent.plannedMeetingTimes.push(randInt(13 * 60 + 30, 16 * 60));
            agent.plannedMeetingTimes.sort(function (a, b) { return a - b; });
        } else {
            if (initial) {
                agent.arrivalTime = randInt(8 * 60, 10 * 60);
            } else {
                agent.arrivalTime = simClock.simMinute + randInt(0, 6);
            }
            agent.visitDuration = randInt(30, 100);
            agent.lunchTime = randInt(11 * 60 + 30, 13 * 60 + 30);
            agent.lunchDuration = randInt(25, 50);
            agent.departureTime = agent.arrivalTime + agent.visitDuration;
        }
    }

    function buildAgents() {
        const deskPool = [];
        for (let floor = 1; floor < WORLD.FLOOR_COUNT; floor += 1) {
            const desks = world.floors[floor].desks;
            for (let i = 0; i < desks.length; i += 1) deskPool.push(desks[i]);
        }

        for (let i = 0; i < SIM_MAX_WORKERS; i += 1) {
            const desk = deskPool[i % deskPool.length];
            const group = createPerson();
            group.visible = false;
            group.position.set(0, 0, 12);
            scene.add(group);
            const agent = {
                id: i,
                role: "WORKER",
                name: FIRST_NAMES[i % FIRST_NAMES.length],
                group: group,
                state: "AWAY",
                floor: 0,
                plan: [],
                currentAction: null,
                path: [],
                pathIndex: 0,
                homeFloor: desk.floor,
                deskId: desk.id,
                deskWpName: desk.wp,
                deskDoorWpName: desk.door,
                arrivalTime: 0,
                lunchTime: 0,
                lunchDuration: 30,
                departureTime: 0,
                hasLunched: false,
                plannedMeetingTimes: [],
                visitDuration: 0,
                reservedSeats: [],
                leaving: false
            };
            group.userData.agent = agent;
            agents.push(agent);
            resampleSchedule(agent, true);
        }

        for (let v = 0; v < SIM_MAX_VISITORS; v += 1) {
            const group = createPerson();
            group.visible = false;
            group.position.set(0, 0, 12);
            scene.add(group);
            const agent = {
                id: SIM_MAX_WORKERS + v,
                role: "VISITOR",
                name: randomChoice(FIRST_NAMES) || "Guest",
                group: group,
                state: "AWAY",
                floor: 0,
                plan: [],
                currentAction: null,
                path: [],
                pathIndex: 0,
                homeFloor: null,
                deskId: null,
                deskWpName: null,
                deskDoorWpName: null,
                arrivalTime: 0,
                lunchTime: 0,
                lunchDuration: 30,
                departureTime: 0,
                hasLunched: true,
                plannedMeetingTimes: [],
                visitDuration: 60,
                reservedSeats: [],
                leaving: false
            };
            group.userData.agent = agent;
            agents.push(agent);
            resampleSchedule(agent, true);
        }
    }

    function applyOccupancy() {
        for (let i = 0; i < agents.length; i += 1) {
            const agent = agents[i];
            const enabled = agent.id < targetOccupancy;
            if (enabled) {
                if (agent.state === "DISABLED") agent.state = "AWAY";
            } else if (agent.state === "AWAY") {
                agent.state = "DISABLED";
            } else if (agent.state === "GONE") {
                agent.state = "DISABLED";
                agent.group.visible = false;
                if (agent.group.parent) agent.group.parent.remove(agent.group);
            }
        }
        if (hudOccupancy) {
            hudOccupancy.textContent = "Occupancy: " + targetOccupancy + " / " + SIM_MAX_OCCUPANCY + " people";
        }
    }

    function resetDay() {
        seatReservations.clear();
        for (let i = 0; i < agents.length; i += 1) {
            const agent = agents[i];
            agent.group.visible = false;
            if (agent.group.parent) agent.group.parent.remove(agent.group);
            agent.group.userData.isSitting = false;
            agent.group.userData.isWalking = false;
            agent.group.position.set(0, 0, 12);
            agent.floor = 0;
            agent.state = agent.id < targetOccupancy ? "AWAY" : "DISABLED";
            resampleSchedule(agent, true);
        }
        if (elevator) elevator.reset();
    }

    function countPresent() {
        let count = 0;
        for (let i = 0; i < agents.length; i += 1) {
            const state = agents[i].state;
            if (state !== "AWAY" && state !== "DISABLED" && state !== "GONE") count += 1;
        }
        return count;
    }

    function topUpVisitors() {
        const now = simClock.simMinute;
        if (now < 8 * 60 || now > 18 * 60) return;
        let deficit = targetOccupancy - countPresent();
        if (deficit <= 0) return;
        for (let i = 0; i < agents.length && deficit > 0; i += 1) {
            const agent = agents[i];
            if (agent.role !== "VISITOR" || agent.id >= targetOccupancy) continue;
            if (agent.state !== "GONE" && agent.state !== "AWAY") continue;
            if (agent.state === "AWAY" && agent.arrivalTime <= now + 15) continue;
            agent.state = "AWAY";
            agent.arrivalTime = now + randInt(0, 6);
            agent.visitDuration = randInt(30, 100);
            agent.departureTime = agent.arrivalTime + agent.visitDuration;
            agent.hasLunched = true;
            agent.plan = [];
            agent.currentAction = null;
            agent.path = [];
            agent.pathIndex = 0;
            releaseAgentSeats(agent);
            agent.group.visible = false;
            if (agent.group.parent) agent.group.parent.remove(agent.group);
            deficit -= 1;
        }
    }

    function spawnAgent(agent) {
        if (agent.group.parent && agent.group.parent !== scene) {
            scene.attach(agent.group);
        }
        if (!agent.group.parent) scene.add(agent.group);
        agent.group.visible = true;
        agent.group.userData.isSitting = false;
        agent.group.userData.isWalking = true;
        agent.group.position.set(
            (Math.random() - 0.5) * 2.2,
            0,
            12 + (Math.random() - 0.5) * 1.5
        );
        agent.group.rotation.y = Math.PI;
        agent.floor = 0;
        agent.state = "ARRIVING";
        agent.leaving = false;
        agent.path = [];
        agent.pathIndex = 0;
        agent.currentAction = null;
        releaseAgentSeats(agent);
        if (agent.role === "WORKER") {
            agent.plan = planArriveToDesk(agent);
        } else {
            agent.plan = planVisitorVisit(agent);
        }
    }

    function maybeSpawn(agent) {
        if (agent.state !== "AWAY") return;
        if (agent.id >= targetOccupancy) return;
        const now = simClock.simMinute;
        if (now < agent.arrivalTime) return;
        if (agent.role === "WORKER" && now > agent.departureTime) return;
        if (agent.role === "VISITOR" && now > agent.departureTime + 10) return;
        spawnAgent(agent);
    }

    function appendTravel(actions, fromFloor, toFloor) {
        if (fromFloor === toFloor) return;
        const dir = toFloor > fromFloor ? 1 : -1;
        actions.push({ type: "WALK_TO_WP", floor: fromFloor, wp: "elevWait" });
        actions.push({ type: "WAIT_AT_PANEL", floor: fromFloor, dir: dir, toFloor: toFloor });
        actions.push({ type: "ENTER_ELEVATOR", floor: fromFloor, toFloor: toFloor });
        actions.push({ type: "PRESS_FLOOR", floor: toFloor });
        actions.push({ type: "WAIT_FOR_FLOOR", floor: toFloor });
        actions.push({ type: "EXIT_ELEVATOR", floor: toFloor, toFloor: toFloor });
    }

    function appendExitBuilding(actions) {
        actions.push({ type: "WALK_TO_WP", floor: 0, wp: "lobby_center" });
        actions.push({ type: "WALK_TO_WP", floor: 0, wp: "entrance" });
        actions.push({ type: "WALK_TO_WP", floor: 0, wp: "front_door_threshold" });
        actions.push({ type: "WALK_TO_WP", floor: 0, wp: "outside" });
        actions.push({ type: "EXIT_BUILDING" });
    }

    function planArriveToDesk(agent) {
        const actions = [
            { type: "WALK_TO_WP", floor: 0, wp: "outside" },
            { type: "WALK_TO_WP", floor: 0, wp: "front_door_threshold" },
            { type: "WALK_TO_WP", floor: 0, wp: "entrance" },
            { type: "WALK_TO_WP", floor: 0, wp: "lobby_center" }
        ];
        appendTravel(actions, 0, agent.homeFloor);
        actions.push({ type: "WALK_TO_WP", floor: agent.homeFloor, wp: agent.deskDoorWpName });
        actions.push({ type: "WALK_TO_WP", floor: agent.homeFloor, wp: agent.deskWpName });
        actions.push({ type: "ENTER_STATE", state: "AT_DESK" });
        actions.push({ type: "SIT", floor: agent.homeFloor, wp: agent.deskWpName });
        actions.push({ type: "WAIT_SIM", minutes: randInt(20, 55) });
        actions.push({ type: "PICK_NEXT_ACTIVITY" });
        return actions;
    }

    function planLeaveBuilding(agent) {
        agent.leaving = true;
        releaseAgentSeats(agent);
        const floor = agent.floor;
        const actions = [
            { type: "STAND" },
            { type: "RELEASE_SEAT" }
        ];
        if (floor !== 0) appendTravel(actions, floor, 0);
        appendExitBuilding(actions);
        return actions;
    }

    function planGoToLunch(agent) {
        const actions = [
            { type: "STAND" },
            { type: "RELEASE_SEAT" }
        ];
        appendTravel(actions, agent.floor, 0);
        const floorData = world.floors[0];
        const seat = findFreeSeat(agent, 0, floorData.cafeSpots);
        if (seat) {
            actions.push({ type: "WALK_TO_WP", floor: 0, wp: seat.wp });
            actions.push({ type: "ENTER_STATE", state: "AT_LUNCH" });
            actions.push({ type: "SIT", floor: 0, wp: seat.wp });
            actions.push({ type: "WAIT_SIM", minutes: agent.lunchDuration });
            actions.push({ type: "STAND" });
            actions.push({ type: "RELEASE_SEAT", seatKey: seat.key });
        } else {
            actions.push({ type: "WALK_TO_WP", floor: 0, wp: "cafe_order" });
            actions.push({ type: "ENTER_STATE", state: "AT_LUNCH" });
            actions.push({ type: "WAIT_SIM", minutes: agent.lunchDuration });
        }
        actions.push({ type: "MARK_LUNCHED" });
        appendTravel(actions, 0, agent.homeFloor);
        actions.push({ type: "WALK_TO_WP", floor: agent.homeFloor, wp: agent.deskDoorWpName });
        actions.push({ type: "WALK_TO_WP", floor: agent.homeFloor, wp: agent.deskWpName });
        actions.push({ type: "ENTER_STATE", state: "AT_DESK" });
        actions.push({ type: "SIT", floor: agent.homeFloor, wp: agent.deskWpName });
        actions.push({ type: "WAIT_SIM", minutes: randInt(20, 45) });
        actions.push({ type: "PICK_NEXT_ACTIVITY" });
        return actions;
    }

    function planVisitLounge(agent) {
        const floor = agent.floor;
        const floorData = world.floors[floor];
        const seat = findFreeSeat(agent, floor, floorData.loungeSpots);
        const actions = [
            { type: "STAND" },
            { type: "RELEASE_SEAT" }
        ];
        if (seat) {
            actions.push({ type: "WALK_TO_WP", floor: floor, wp: seat.wp });
            actions.push({ type: "ENTER_STATE", state: "AT_BREAK" });
            actions.push({ type: "SIT", floor: floor, wp: seat.wp });
            actions.push({ type: "WAIT_SIM", minutes: randInt(5, 12) });
            actions.push({ type: "STAND" });
            actions.push({ type: "RELEASE_SEAT", seatKey: seat.key });
        } else {
            actions.push({ type: "WALK_TO_WP", floor: floor, wp: "water_cooler" });
            actions.push({ type: "ENTER_STATE", state: "AT_BREAK" });
            actions.push({ type: "WAIT_SIM", minutes: randInt(5, 12) });
        }
        actions.push({ type: "WALK_TO_WP", floor: floor, wp: agent.deskDoorWpName });
        actions.push({ type: "WALK_TO_WP", floor: floor, wp: agent.deskWpName });
        actions.push({ type: "ENTER_STATE", state: "AT_DESK" });
        actions.push({ type: "SIT", floor: floor, wp: agent.deskWpName });
        actions.push({ type: "WAIT_SIM", minutes: randInt(15, 40) });
        actions.push({ type: "PICK_NEXT_ACTIVITY" });
        return actions;
    }

    function planAttendMeeting(agent) {
        let targetFloor = agent.homeFloor;
        if (Math.random() >= 0.65) targetFloor = randInt(1, WORLD.FLOOR_COUNT - 1);
        const floorData = world.floors[targetFloor];
        const seat = findFreeSeat(agent, targetFloor, floorData.confSeats);
        if (!seat) return planVisitLounge(agent);

        const actions = [
            { type: "STAND" },
            { type: "RELEASE_SEAT" }
        ];
        appendTravel(actions, agent.floor, targetFloor);
        actions.push({ type: "WALK_TO_WP", floor: targetFloor, wp: "conf_center" });
        actions.push({ type: "WALK_TO_WP", floor: targetFloor, wp: seat.wp });
        actions.push({ type: "ENTER_STATE", state: "IN_MEETING" });
        actions.push({ type: "SIT", floor: targetFloor, wp: seat.wp });
        actions.push({ type: "WAIT_SIM", minutes: randInt(22, 45) });
        actions.push({ type: "STAND" });
        actions.push({ type: "RELEASE_SEAT", seatKey: seat.key });
        appendTravel(actions, targetFloor, agent.homeFloor);
        actions.push({ type: "WALK_TO_WP", floor: agent.homeFloor, wp: agent.deskDoorWpName });
        actions.push({ type: "WALK_TO_WP", floor: agent.homeFloor, wp: agent.deskWpName });
        actions.push({ type: "ENTER_STATE", state: "AT_DESK" });
        actions.push({ type: "SIT", floor: agent.homeFloor, wp: agent.deskWpName });
        actions.push({ type: "WAIT_SIM", minutes: randInt(20, 50) });
        actions.push({ type: "PICK_NEXT_ACTIVITY" });
        return actions;
    }

    function planVisitCoworker(agent) {
        const candidates = [];
        for (let i = 0; i < agents.length; i += 1) {
            const other = agents[i];
            if (other.id === agent.id) continue;
            if (other.role === "WORKER" && other.state === "AT_DESK") candidates.push(other);
        }
        if (!candidates.length) return planWorkAtDesk(agent);
        const coworker = randomChoice(candidates);
        const targetFloor = coworker.homeFloor;
        const actions = [
            { type: "STAND" },
            { type: "RELEASE_SEAT" }
        ];
        appendTravel(actions, agent.floor, targetFloor);
        actions.push({ type: "WALK_TO_WP", floor: targetFloor, wp: coworker.deskDoorWpName });
        actions.push({ type: "ENTER_STATE", state: "VISITING" });
        actions.push({ type: "WAIT_SIM", minutes: randInt(6, 18) });
        appendTravel(actions, targetFloor, agent.homeFloor);
        actions.push({ type: "WALK_TO_WP", floor: agent.homeFloor, wp: agent.deskDoorWpName });
        actions.push({ type: "WALK_TO_WP", floor: agent.homeFloor, wp: agent.deskWpName });
        actions.push({ type: "ENTER_STATE", state: "AT_DESK" });
        actions.push({ type: "SIT", floor: agent.homeFloor, wp: agent.deskWpName });
        actions.push({ type: "WAIT_SIM", minutes: randInt(20, 45) });
        actions.push({ type: "PICK_NEXT_ACTIVITY" });
        return actions;
    }

    function planWorkAtDesk(agent) {
        if (agent.floor === agent.homeFloor && agent.state === "AT_DESK") {
            return [
                { type: "WAIT_SIM", minutes: randInt(18, 65) },
                { type: "PICK_NEXT_ACTIVITY" }
            ];
        }
        const actions = [];
        if (agent.floor !== agent.homeFloor) appendTravel(actions, agent.floor, agent.homeFloor);
        actions.push({ type: "WALK_TO_WP", floor: agent.homeFloor, wp: agent.deskDoorWpName });
        actions.push({ type: "WALK_TO_WP", floor: agent.homeFloor, wp: agent.deskWpName });
        actions.push({ type: "ENTER_STATE", state: "AT_DESK" });
        actions.push({ type: "SIT", floor: agent.homeFloor, wp: agent.deskWpName });
        actions.push({ type: "WAIT_SIM", minutes: randInt(18, 65) });
        actions.push({ type: "PICK_NEXT_ACTIVITY" });
        return actions;
    }

    function planVisitorVisit(agent) {
        const actions = [
            { type: "WALK_TO_WP", floor: 0, wp: "outside" },
            { type: "WALK_TO_WP", floor: 0, wp: "front_door_threshold" },
            { type: "WALK_TO_WP", floor: 0, wp: "entrance" },
            { type: "WALK_TO_WP", floor: 0, wp: "lobby_center" }
        ];
        const lobby = world.floors[0];
        const roll = Math.random();
        let upperFloor = 0;

        if (roll < 0.10) {
            const seat = findFreeSeat(agent, 0, lobby.cafeSpots);
            if (seat) {
                actions.push({ type: "WALK_TO_WP", floor: 0, wp: seat.wp });
                actions.push({ type: "ENTER_STATE", state: "VISITING" });
                actions.push({ type: "SIT", floor: 0, wp: seat.wp });
                actions.push({ type: "WAIT_SIM", minutes: randInt(15, 35) });
                actions.push({ type: "STAND" });
                actions.push({ type: "RELEASE_SEAT", seatKey: seat.key });
            } else {
                actions.push({ type: "WALK_TO_WP", floor: 0, wp: "lobby_stand_center" });
                actions.push({ type: "ENTER_STATE", state: "VISITING" });
                actions.push({ type: "WAIT_SIM", minutes: randInt(8, 18) });
            }
        } else if (roll < 0.16) {
            actions.push({ type: "WALK_TO_WP", floor: 0, wp: "cafe_order" });
            actions.push({ type: "ENTER_STATE", state: "VISITING" });
            actions.push({ type: "WAIT_SIM", minutes: randInt(5, 12) });
        } else if (roll < 0.30) {
            const seat = findFreeSeat(agent, 0, lobby.loungeSpots);
            if (seat) {
                actions.push({ type: "WALK_TO_WP", floor: 0, wp: seat.wp });
                actions.push({ type: "ENTER_STATE", state: "VISITING" });
                actions.push({ type: "SIT", floor: 0, wp: seat.wp });
                actions.push({ type: "WAIT_SIM", minutes: randInt(12, 30) });
                actions.push({ type: "STAND" });
                actions.push({ type: "RELEASE_SEAT", seatKey: seat.key });
            } else {
                actions.push({ type: "WALK_TO_WP", floor: 0, wp: "lobby_stand_NE" });
                actions.push({ type: "ENTER_STATE", state: "VISITING" });
                actions.push({ type: "WAIT_SIM", minutes: randInt(8, 18) });
            }
        } else if (roll < 0.42) {
            const seat = findFreeSeat(agent, 0, lobby.backSpots);
            if (seat) {
                actions.push({ type: "WALK_TO_WP", floor: 0, wp: seat.wp });
                actions.push({ type: "ENTER_STATE", state: "VISITING" });
                actions.push({ type: "SIT", floor: 0, wp: seat.wp });
                actions.push({ type: "WAIT_SIM", minutes: randInt(12, 30) });
                actions.push({ type: "STAND" });
                actions.push({ type: "RELEASE_SEAT", seatKey: seat.key });
            } else {
                actions.push({ type: "WALK_TO_WP", floor: 0, wp: "pit_N" });
                actions.push({ type: "ENTER_STATE", state: "VISITING" });
                actions.push({ type: "WAIT_SIM", minutes: randInt(8, 18) });
            }
        } else if (roll < 0.52) {
            const spot = randomChoice(lobby.standSpots) || "reception";
            actions.push({ type: "WALK_TO_WP", floor: 0, wp: spot });
            actions.push({ type: "ENTER_STATE", state: "VISITING" });
            actions.push({ type: "WAIT_SIM", minutes: randInt(5, 15) });
        } else if (roll < 0.62) {
            const spot = randomChoice(lobby.loiterSpots) || "lobby_stand_center";
            actions.push({ type: "WALK_TO_WP", floor: 0, wp: spot });
            actions.push({ type: "ENTER_STATE", state: "VISITING" });
            actions.push({ type: "WAIT_SIM", minutes: randInt(8, 20) });
        } else if (roll < 0.77) {
            upperFloor = randInt(1, WORLD.FLOOR_COUNT - 1);
            const upper = world.floors[upperFloor];
            const seat = findFreeSeat(agent, upperFloor, upper.loungeSpots);
            appendTravel(actions, 0, upperFloor);
            if (seat) {
                actions.push({ type: "WALK_TO_WP", floor: upperFloor, wp: seat.wp });
                actions.push({ type: "ENTER_STATE", state: "AT_BREAK" });
                actions.push({ type: "SIT", floor: upperFloor, wp: seat.wp });
                actions.push({ type: "WAIT_SIM", minutes: randInt(10, 25) });
                actions.push({ type: "STAND" });
                actions.push({ type: "RELEASE_SEAT", seatKey: seat.key });
            } else {
                actions.push({ type: "WALK_TO_WP", floor: upperFloor, wp: "water_cooler" });
                actions.push({ type: "ENTER_STATE", state: "AT_BREAK" });
                actions.push({ type: "WAIT_SIM", minutes: randInt(8, 18) });
            }
            appendTravel(actions, upperFloor, 0);
        } else {
            upperFloor = randInt(1, WORLD.FLOOR_COUNT - 1);
            const upper = world.floors[upperFloor];
            const seat = findFreeSeat(agent, upperFloor, upper.confSeats);
            if (!seat) {
                const spot = randomChoice(lobby.loiterSpots) || "lobby_stand_center";
                actions.push({ type: "WALK_TO_WP", floor: 0, wp: spot });
                actions.push({ type: "ENTER_STATE", state: "VISITING" });
                actions.push({ type: "WAIT_SIM", minutes: randInt(8, 20) });
            } else {
                appendTravel(actions, 0, upperFloor);
                actions.push({ type: "WALK_TO_WP", floor: upperFloor, wp: "conf_center" });
                actions.push({ type: "WALK_TO_WP", floor: upperFloor, wp: seat.wp });
                actions.push({ type: "ENTER_STATE", state: "IN_MEETING" });
                actions.push({ type: "SIT", floor: upperFloor, wp: seat.wp });
                actions.push({ type: "WAIT_SIM", minutes: randInt(20, 40) });
                actions.push({ type: "STAND" });
                actions.push({ type: "RELEASE_SEAT", seatKey: seat.key });
                appendTravel(actions, upperFloor, 0);
            }
        }

        void upperFloor;
        appendExitBuilding(actions);
        return actions;
    }

    function chooseNextActivity(agent) {
        if (agent.role === "VISITOR") {
            agent.plan = planVisitorVisit(agent);
            return;
        }
        const now = simClock.simMinute;
        if (now >= agent.departureTime) {
            agent.plan = planLeaveBuilding(agent);
            return;
        }

        const remainingMeetings = [];
        let meetingDue = false;
        for (let i = 0; i < agent.plannedMeetingTimes.length; i += 1) {
            const meetingTime = agent.plannedMeetingTimes[i];
            if (now >= meetingTime && now - meetingTime < 120) {
                meetingDue = true;
            } else if (now < meetingTime) {
                remainingMeetings.push(meetingTime);
            }
        }
        agent.plannedMeetingTimes = remainingMeetings;
        if (meetingDue) {
            agent.plan = planAttendMeeting(agent);
            return;
        }

        if (!agent.hasLunched && now >= agent.lunchTime && now < 15 * 60) {
            agent.plan = planGoToLunch(agent);
            return;
        }

        const roll = Math.random();
        if (roll < 0.14) {
            agent.plan = planAttendMeeting(agent);
        } else if (roll < 0.26) {
            agent.plan = planVisitLounge(agent);
        } else if (roll < 0.41) {
            agent.plan = planVisitCoworker(agent);
        } else {
            agent.plan = planWorkAtDesk(agent);
        }
    }

    function maybeDepart(agent) {
        if (agent.role !== "WORKER" || agent.leaving) return;
        if (simClock.simMinute < agent.departureTime) return;
        if (agent.state === "GONE" || agent.state === "AWAY" || agent.state === "DISABLED") return;
        if (agent.state === "IN_CAR" || agent.state === "WAITING_ELEVATOR") return;
        const action = agent.currentAction;
        if (action && (action.type === "WAIT_AT_PANEL" || action.type === "ENTER_ELEVATOR" ||
            action.type === "PRESS_FLOOR" || action.type === "WAIT_FOR_FLOOR" ||
            action.type === "EXIT_ELEVATOR")) {
            return;
        }
        releaseAgentSeats(agent);
        agent.plan = planLeaveBuilding(agent);
        agent.currentAction = null;
    }

    function isEntranceWaypoint(name) {
        return ENTRANCE_WAYPOINTS.indexOf(name) !== -1;
    }

    function buildWalkPath(agent, floor, wpName) {
        const floorData = world.floors[floor];
        if (!floorData) {
            agent.path = [];
            agent.pathIndex = 0;
            return;
        }
        const targetNode = floorData.nodes[wpName];
        if (!targetNode) {
            agent.path = [];
            agent.pathIndex = 0;
            return;
        }
        const startName = world.nearestNode(floorData.nodes, agent.group.position);
        let path = world.bfsPath(floorData.nodes, startName, wpName);
        if (!path.length) path = [targetNode.pos.clone()];
        agent.path = path;
        agent.pathIndex = 0;
        if (path.length > 1 && path[0].distanceTo(agent.group.position) < 0.55) {
            agent.pathIndex = 1;
        }
        agent._prevPos = agent.group.position.clone();
        agent._stallT = 0;
    }

    function walkAlongPath(agent, dt) {
        if (!agent.path || agent.pathIndex >= agent.path.length) return true;
        let budget = AGENT_WALK_SPEED * dt;
        let guard = 0;
        while (budget > 0 && agent.pathIndex < agent.path.length && guard < 40) {
            guard += 1;
            const target = agent.path[agent.pathIndex];
            const pos = agent.group.position;
            const dx = target.x - pos.x;
            const dz = target.z - pos.z;
            const dist = Math.sqrt(dx * dx + dz * dz);
            if (dist < 0.12) {
                agent.pathIndex += 1;
                continue;
            }
            const step = Math.min(dist, budget);
            pos.x += dx / dist * step;
            pos.z += dz / dist * step;
            pos.y = agent.floor * WORLD.FLOOR_HEIGHT;
            agent.group.rotation.y = Math.atan2(dx, dz);
            budget -= step;
        }
        if (agent.pathIndex >= agent.path.length) return true;

        const prev = agent._prevPos || agent.group.position.clone();
        const moved = agent.group.position.distanceTo(prev);
        if (moved < 0.005) {
            agent._stallT = (agent._stallT || 0) + dt;
            if (agent._stallT > 1.2) {
                agent.pathIndex += 1;
                agent._stallT = 0;
                const action = agent.currentAction;
                if (action && action.type === "WALK_TO_WP" && isEntranceWaypoint(action.wp) &&
                    agent.pathIndex < agent.path.length) {
                    const next = agent.path[agent.pathIndex];
                    agent.group.position.x = next.x;
                    agent.group.position.z = next.z;
                }
            }
        } else {
            agent._stallT = 0;
        }
        agent._prevPos = agent.group.position.clone();
        return false;
    }

    function startAction(agent, action) {
        if (action.type === "WALK_TO_WP") {
            buildWalkPath(agent, action.floor, action.wp);
            agent.state = agent.state === "AT_DESK" ? "ON_FLOOR" : agent.state;
            if (agent.state === "AT_DESK" || agent.state === "IN_MEETING" ||
                agent.state === "AT_BREAK" || agent.state === "AT_LUNCH" ||
                agent.state === "VISITING") {
                agent.state = "ON_FLOOR";
            }
        } else if (action.type === "WAIT_AT_PANEL") {
            agent.state = "WAITING_ELEVATOR";
            action.dir = action.toFloor > action.floor ? 1 : -1;
            if (action.dir > 0) elevator.callUp(action.floor);
            else elevator.callDown(action.floor);
        } else if (action.type === "ENTER_ELEVATOR") {
            action.phase = "reserve";
            action.spot = null;
            action._stallT = 0;
        } else if (action.type === "EXIT_ELEVATOR") {
            elevator.registerDisembark(agent);
            scene.attach(agent.group);
            agent.floor = action.toFloor;
            agent.group.position.y = agent.floor * WORLD.FLOOR_HEIGHT;
            agent.state = "ON_FLOOR";
            action._exitTarget = world.floors[action.toFloor].nodes.elevWait.pos.clone();
            action._prevPos = agent.group.position.clone();
            action._stallT = 0;
        } else if (action.type === "SIT") {
            const floorData = world.floors[action.floor];
            const node = floorData.nodes[action.wp];
            const target = floorData.sitTargets[action.wp] || { sit: false, facing: 0 };
            if (node) {
                let x = node.pos.x;
                let z = node.pos.z;
                if (!target.sit) {
                    const angle = Math.random() * Math.PI * 2;
                    const radius = 0.35 + Math.random() * 0.4;
                    x += Math.cos(angle) * radius;
                    z += Math.sin(angle) * radius;
                }
                agent.floor = action.floor;
                agent.group.position.set(x, action.floor * WORLD.FLOOR_HEIGHT, z);
                agent.group.rotation.y = target.facing;
                agent.group.userData.isSitting = Boolean(target.sit);
                agent.group.userData.isWalking = false;
                if (target.sit) agent.group.position.y = action.floor * WORLD.FLOOR_HEIGHT - 0.35;
            }
        } else if (action.type === "STAND") {
            agent.group.userData.isSitting = false;
            agent.group.userData.isWalking = false;
            if (agent.group.parent === elevator.carGroup) {
                agent.group.position.y = 0;
            } else {
                agent.group.position.y = agent.floor * WORLD.FLOOR_HEIGHT;
            }
        } else if (action.type === "RELEASE_SEAT") {
            if (action.seatKey) releaseSeatKey(agent, action.seatKey);
            else releaseAgentSeats(agent);
        } else if (action.type === "WAIT_SIM") {
            action.untilMin = simClock.simMinute + (action.minutes || 0);
        } else if (action.type === "EXIT_BUILDING") {
            releaseAgentSeats(agent);
            if (agent.group.parent) agent.group.parent.remove(agent.group);
            agent.group.visible = false;
            agent.state = "GONE";
            agent.leaving = false;
        } else if (action.type === "PRESS_FLOOR") {
            elevator.pressDestination(action.floor);
            agent.state = "IN_CAR";
        } else if (action.type === "WAIT_FOR_FLOOR") {
            agent.state = "IN_CAR";
        } else if (action.type === "ENTER_STATE") {
            agent.state = action.state;
        } else if (action.type === "MARK_LUNCHED") {
            agent.hasLunched = true;
        } else if (action.type === "PICK_NEXT_ACTIVITY") {
            chooseNextActivity(agent);
        }
        action._started = true;
    }

    function processAction(agent, action, dt) {
        if (!action._started) startAction(agent, action);

        if (action.type === "WALK_TO_WP") {
            return walkAlongPath(agent, dt);
        }

        if (action.type === "WAIT_AT_PANEL") {
            const dir = action.dir;
            if (elevator.state === "DOOR_OPEN" && elevator.currentFloor === action.floor &&
                elevator.isAcceptingAt(action.floor, dir) && elevator.currentCapacityFree() > 0) {
                return true;
            }
            if (dir > 0) elevator.callUp(action.floor);
            else elevator.callDown(action.floor);
            return false;
        }

        if (action.type === "ENTER_ELEVATOR") {
            const floorY = action.floor * WORLD.FLOOR_HEIGHT;
            const dir = action.toFloor > action.floor ? 1 : -1;
            if (action.phase === "reserve") {
                if (!elevator.isAcceptingAt(action.floor, dir) || elevator.currentCapacityFree() <= 0) {
                    if (dir > 0) elevator.callUp(action.floor);
                    else elevator.callDown(action.floor);
                    return false;
                }
                action.spot = elevator.reserveBoardingSpot(agent);
                if (!action.spot) return false;
                action.phase = "door";
                action._prevPos = agent.group.position.clone();
                action._stallT = 0;
            }

            if (action.phase === "door") {
                const targetX = action.spot.x;
                const targetZ = 1.42;
                const pos = agent.group.position;
                const dx = targetX - pos.x;
                const dz = targetZ - pos.z;
                const dist = Math.sqrt(dx * dx + dz * dz);
                const step = AGENT_WALK_SPEED * dt;
                if (dist <= 0.3 || step >= dist) {
                    pos.set(targetX, floorY, targetZ);
                    action.phase = "inside";
                } else {
                    pos.x += dx / dist * step;
                    pos.z += dz / dist * step;
                    pos.y = floorY;
                    agent.group.rotation.y = Math.atan2(dx, dz);
                    const moved = pos.distanceTo(action._prevPos);
                    action._stallT = (action._stallT || 0) + dt;
                    if (moved < 0.005 && action._stallT > 1.5) {
                        pos.set(targetX, floorY, targetZ);
                        action.phase = "inside";
                        action._stallT = 0;
                    } else if (moved >= 0.005) {
                        action._stallT = 0;
                    }
                    action._prevPos = pos.clone();
                }
            }

            if (action.phase === "inside") {
                elevator.carGroup.attach(agent.group);
                agent.state = "IN_CAR";
                action.phase = "spot";
            }

            if (action.phase === "spot") {
                const pos = agent.group.position;
                const dx = action.spot.x - pos.x;
                const dz = action.spot.z - pos.z;
                const dist = Math.sqrt(dx * dx + dz * dz);
                const step = AGENT_WALK_SPEED * dt;
                if (dist <= 0.08 || step >= dist) {
                    pos.set(action.spot.x, 0, action.spot.z);
                    agent.group.rotation.y = 0;
                    elevator.completeBoard(agent);
                    return true;
                }
                pos.x += dx / dist * step;
                pos.z += dz / dist * step;
                pos.y = 0;
                return false;
            }
            return false;
        }

        if (action.type === "PRESS_FLOOR") {
            elevator.pressDestination(action.floor);
            agent.state = "IN_CAR";
            return true;
        }

        if (action.type === "WAIT_FOR_FLOOR") {
            agent.state = "IN_CAR";
            return elevator.state === "DOOR_OPEN" && elevator.currentFloor === action.floor;
        }

        if (action.type === "EXIT_ELEVATOR") {
            const target = action._exitTarget;
            const pos = agent.group.position;
            const dx = target.x - pos.x;
            const dz = target.z - pos.z;
            const dist = Math.sqrt(dx * dx + dz * dz);
            const step = AGENT_WALK_SPEED * dt;
            if (dist <= 0.25 || step >= dist) {
                pos.x = target.x;
                pos.z = target.z;
                pos.y = agent.floor * WORLD.FLOOR_HEIGHT;
                elevator.completeDisembark(agent);
                return true;
            }
            pos.x += dx / dist * step;
            pos.z += dz / dist * step;
            pos.y = agent.floor * WORLD.FLOOR_HEIGHT;
            agent.group.rotation.y = Math.atan2(dx, dz);
            const moved = pos.distanceTo(action._prevPos);
            action._stallT = (action._stallT || 0) + dt;
            if (moved < 0.005 && action._stallT > 1.5) {
                pos.x = target.x;
                pos.z = target.z;
                elevator.completeDisembark(agent);
                return true;
            } else if (moved >= 0.005) {
                action._stallT = 0;
            }
            action._prevPos = pos.clone();
            return false;
        }

        if (action.type === "WAIT_SIM") {
            return simClock.simMinute >= action.untilMin;
        }

        if (action.type === "SIT" || action.type === "STAND" || action.type === "RELEASE_SEAT" ||
            action.type === "EXIT_BUILDING" || action.type === "ENTER_STATE" ||
            action.type === "MARK_LUNCHED" || action.type === "PICK_NEXT_ACTIVITY") {
            return true;
        }

        return true;
    }

    function dispatchActions(agent, dt) {
        let guard = 0;
        while (guard < 16) {
            guard += 1;
            if (!agent.currentAction) {
                if (agent.plan && agent.plan.length) {
                    agent.currentAction = agent.plan.shift();
                } else {
                    chooseNextActivity(agent);
                    if (!agent.plan || !agent.plan.length) break;
                    continue;
                }
            }
            const done = processAction(agent, agent.currentAction, dt);
            if (!done) break;
            agent.currentAction = null;
            if (agent.state === "GONE" || agent.state === "DISABLED") break;
        }
    }

    function updateAgents(dt) {
        for (let i = 0; i < agents.length; i += 1) {
            const agent = agents[i];
            if (agent.state === "DISABLED") continue;
            if (agent.state === "AWAY") {
                maybeSpawn(agent);
                continue;
            }
            if (agent.state === "GONE") continue;
            maybeDepart(agent);
            dispatchActions(agent, dt);
        }
    }

    function collisionExempt(agent) {
        const action = agent.currentAction;
        if (!action) return false;
        if (action.type === "ENTER_ELEVATOR" || action.type === "EXIT_ELEVATOR") return true;
        if (action.type === "WALK_TO_WP" && isEntranceWaypoint(action.wp)) return true;
        return false;
    }

    function applyCollisions() {
        for (let i = 0; i < agents.length; i += 1) {
            const a = agents[i];
            if (!a.group.parent || !a.group.visible || a.group.userData.isSitting) continue;
            if (a.group.parent === elevator.carGroup) continue;
            if (collisionExempt(a)) continue;
            for (let j = i + 1; j < agents.length; j += 1) {
                const b = agents[j];
                if (!b.group.parent || !b.group.visible || b.group.userData.isSitting) continue;
                if (b.group.parent === elevator.carGroup) continue;
                if (a.group.parent !== b.group.parent) continue;
                if (collisionExempt(b)) continue;
                const dy = a.group.position.y - b.group.position.y;
                if (Math.abs(dy) > 1.2) continue;
                let dx = a.group.position.x - b.group.position.x;
                let dz = a.group.position.z - b.group.position.z;
                let dist = Math.sqrt(dx * dx + dz * dz);
                if (dist >= AGENT_SEPARATION) continue;
                let nx;
                let nz;
                if (dist < 0.001) {
                    const angle = Math.random() * Math.PI * 2;
                    nx = Math.cos(angle);
                    nz = Math.sin(angle);
                    dist = 0;
                } else {
                    nx = dx / dist;
                    nz = dz / dist;
                }
                const push = (AGENT_SEPARATION - dist) * 0.18;
                a.group.position.x += nx * push;
                a.group.position.z += nz * push;
                b.group.position.x -= nx * push;
                b.group.position.z -= nz * push;
            }
        }
    }

    function updateLighting() {
        const hour = simClock.simMinute / 60;
        let first = DAY_KEYFRAMES[0];
        let second = DAY_KEYFRAMES[DAY_KEYFRAMES.length - 1];
        for (let i = 0; i < DAY_KEYFRAMES.length - 1; i += 1) {
            if (hour >= DAY_KEYFRAMES[i].hour && hour <= DAY_KEYFRAMES[i + 1].hour) {
                first = DAY_KEYFRAMES[i];
                second = DAY_KEYFRAMES[i + 1];
                break;
            }
        }
        const span = second.hour - first.hour || 1;
        const t = Math.max(0, Math.min(1, (hour - first.hour) / span));
        const bgA = new THREE.Color(first.bg);
        const bgB = new THREE.Color(second.bg);
        const sunA = new THREE.Color(first.sun);
        const sunB = new THREE.Color(second.sun);
        if (scene.background && scene.background.isColor) {
            scene.background.copy(bgA).lerp(bgB, t);
        }
        if (sunLight) {
            sunLight.color.copy(sunA).lerp(sunB, t);
            sunLight.intensity = first.sunInt + (second.sunInt - first.sunInt) * t;
        }
        if (ambientLight) {
            ambientLight.intensity = first.amb + (second.amb - first.amb) * t;
        }
        if (hemiLight) {
            hemiLight.intensity = first.hemi + (second.hemi - first.hemi) * t;
        }
    }

    function updateHUD() {
        if (hudTime) hudTime.textContent = simClock.format();
        if (!hudStats) return;
        const counts = {};
        for (let i = 0; i < agents.length; i += 1) {
            const state = agents[i].state;
            counts[state] = (counts[state] || 0) + 1;
        }
        const stateParts = [];
        const order = ["AT_DESK", "IN_MEETING", "AT_BREAK", "AT_LUNCH", "VISITING",
            "WAITING_ELEVATOR", "IN_CAR", "ON_FLOOR", "ARRIVING", "LEAVING", "AWAY", "GONE", "DISABLED"];
        for (let i = 0; i < order.length; i += 1) {
            if (counts[order[i]]) stateParts.push(order[i] + ":" + counts[order[i]]);
        }
        const directionText = elevator.direction > 0 ? "UP" : (elevator.direction < 0 ? "DOWN" : "-");
        const destList = Array.from(elevator.destinations).sort(function (a, b) { return a - b; }).join(",");
        const upList = Array.from(elevator.upCalls).sort(function (a, b) { return a - b; }).join(",");
        const downList = Array.from(elevator.downCalls).sort(function (a, b) { return a - b; }).join(",");
        hudStats.textContent =
            "People: " + countPresent() + " present / " + targetOccupancy + " target\n" +
            stateParts.join("  ") + "\n" +
            "Elevator: floor " + elevator.currentFloor + " " + directionText +
            " | " + elevator.state + " | riders " + elevator.passengers.size +
            "\nDest: [" + destList + "]  Up: [" + upList + "]  Down: [" + downList + "]";
    }

    function buildHUD() {
        const hud = document.createElement("div");
        hud.style.position = "fixed";
        hud.style.left = "12px";
        hud.style.top = "12px";
        hud.style.zIndex = "10";
        hud.style.padding = "12px 14px";
        hud.style.background = "rgba(10, 14, 20, 0.72)";
        hud.style.color = "#e8eef6";
        hud.style.fontFamily = "monospace";
        hud.style.fontSize = "12px";
        hud.style.border = "1px solid rgba(150, 180, 220, 0.3)";
        hud.style.borderRadius = "8px";
        hud.style.minWidth = "330px";
        hud.style.whiteSpace = "pre";
        hud.style.pointerEvents = "auto";

        hudTime = document.createElement("div");
        hudTime.style.fontSize = "26px";
        hudTime.style.fontWeight = "bold";
        hudTime.style.color = "#ffcc55";
        hudTime.style.marginBottom = "8px";
        hudTime.textContent = simClock.format();
        hud.appendChild(hudTime);

        const speedLabel = document.createElement("div");
        speedLabel.textContent = "Speed: 120x realtime";
        hud.appendChild(speedLabel);
        const speedSlider = document.createElement("input");
        speedSlider.type = "range";
        speedSlider.min = "0";
        speedSlider.max = "100";
        speedSlider.step = "1";
        speedSlider.value = String(Math.round(Math.log(120) / Math.log(600) * 100));
        speedSlider.style.width = "100%";
        speedSlider.addEventListener("input", function () {
            const t = Number(speedSlider.value) / 100;
            simClock.timeScale = Math.exp(t * Math.log(600));
            speedLabel.textContent = "Speed: " + Math.round(simClock.timeScale) + "x realtime";
        });
        hud.appendChild(speedSlider);

        hudOccupancy = document.createElement("div");
        hudOccupancy.textContent = "Occupancy: " + targetOccupancy + " / " + SIM_MAX_OCCUPANCY + " people";
        hudOccupancy.style.marginTop = "8px";
        hud.appendChild(hudOccupancy);
        const occupancySlider = document.createElement("input");
        occupancySlider.type = "range";
        occupancySlider.min = "1";
        occupancySlider.max = String(SIM_MAX_OCCUPANCY);
        occupancySlider.step = "1";
        occupancySlider.value = String(targetOccupancy);
        occupancySlider.style.width = "100%";
        occupancySlider.addEventListener("input", function () {
            targetOccupancy = Number(occupancySlider.value);
            applyOccupancy();
        });
        hud.appendChild(occupancySlider);

        hudStats = document.createElement("div");
        hudStats.style.marginTop = "10px";
        hudStats.style.lineHeight = "1.5";
        hudStats.style.fontSize = "11px";
        hud.appendChild(hudStats);
        document.body.appendChild(hud);
    }

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
        controls.target.set(0, 6, 0);
        controls.update();

        ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
        scene.add(ambientLight);
        hemiLight = new THREE.HemisphereLight(0xbfd7ff, 0x303020, 0.45);
        scene.add(hemiLight);
        sunLight = new THREE.DirectionalLight(0xffffff, 0.9);
        sunLight.position.set(20, 35, 18);
        scene.add(sunLight);

        world = createWorld(scene);
        elevator = new Elevator(scene, world);
        buildAgents();
        applyOccupancy();
        buildHUD();
        simClock.onNewDay = resetDay;
        updateLighting();

        window.addEventListener("resize", function () {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        });

        function animate() {
            requestAnimationFrame(animate);
            const now = performance.now();
            let realDt = 0.016;
            if (lastFrameMs > 0) realDt = (now - lastFrameMs) / 1000;
            lastFrameMs = now;
            realDt = Math.min(0.05, realDt);

            simClock.tick(realDt);
            updateLighting();
            const motionDt = realDt * simClock.timeScale;
            elevator.tick(motionDt);
            updateAgents(motionDt);
            topUpVisitors();
            applyCollisions();

            for (let i = 0; i < agents.length; i += 1) {
                const agent = agents[i];
                if (agent.group.parent) animatePersonWalking(agent.group, motionDt);
            }

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
})();
