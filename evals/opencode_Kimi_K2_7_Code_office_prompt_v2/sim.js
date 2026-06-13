/* sim.js — simulated clock, day/night lighting, agent state machine + daily schedules, render loop, UI */

(function (root) {
    const THREE = root.THREE;
    const WORLD = root.WORLD;
    const createPerson = root.createPerson;
    const animatePersonWalking = root.animatePersonWalking;
    const createWorld = root.createWorld;
    const bfsPath = root.bfsPath;
    const Elevator = root.Elevator;

    const MAX_WORKERS = 20;
    const MAX_VISITORS = 80;
    const MAX_OCCUPANCY = MAX_WORKERS + MAX_VISITORS;
    const WALK_SPEED = 1.3;

    let scene, camera, renderer, controls;
    let world, elevator;
    let clock;
    let agents = [];
    let targetOccupancy = 45;
    let seatReservations = new Set();

    const FIRST_NAMES = [
        "Ada", "Ben", "Cal", "Dot", "Eli", "Fay", "Gus", "Hal", "Ivy", "Jax",
        "Kay", "Leo", "Mae", "Ned", "Ora", "Paz", "Quin", "Rae", "Sam", "Tess",
        "Uma", "Van", "Wes", "Xia", "Yul", "Zoe", "Al", "Bo", "Cy", "Di"
    ];

    function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
    function randRange(min, max) { return min + Math.random() * (max - min); }
    function sample(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
    function key(floor, wp) { return `${floor}:${wp}`; }

    function reserveSeat(floor, wpName) {
        const k = key(floor, wpName);
        if (seatReservations.has(k)) return false;
        seatReservations.add(k);
        return true;
    }
    function releaseSeat(floor, wpName) { seatReservations.delete(key(floor, wpName)); }
    function releaseAgentSeat(agent) {
        if (agent.reservedSeat) {
            releaseSeat(agent.reservedSeat.floor, agent.reservedSeat.wpName);
            agent.reservedSeat = null;
        }
    }

    class Clock {
        constructor() {
            this.simMinute = 7 * 60 + 30;
            this.timeScale = 120;
            this.lastRealTime = performance.now() / 1000;
        }
        getDelta() {
            const now = performance.now() / 1000;
            const dt = now - this.lastRealTime;
            this.lastRealTime = now;
            return dt;
        }
        tick(realDt) {
            this.simMinute += realDt * this.timeScale / 60;
            if (this.simMinute >= 24 * 60) {
                this.simMinute -= 24 * 60;
                startNewDay();
            }
        }
        format() {
            const total = Math.floor(this.simMinute);
            const h24 = Math.floor(total / 60) % 24;
            const m = total % 60;
            const ampm = h24 >= 12 ? "PM" : "AM";
            const h12 = h24 % 12 || 12;
            const ms = m.toString().padStart(2, "0");
            return `${h12.toString().padStart(2, " ")}:${ms} ${ampm}`;
        }
    }

    function getFloorNodes(floor, wpName) {
        const floorObj = world.floors[floor];
        return floorObj.nodes.find(n => n.name === wpName);
    }

    function getWpWorldPos(floor, wpName) {
        const n = getFloorNodes(floor, wpName);
        if (!n) return new THREE.Vector3(0, floor * WORLD.FLOOR_HEIGHT, 0);
        return new THREE.Vector3(n.x, n.y, n.z);
    }

    function getSitTarget(floor, wpName) {
        const floorObj = world.floors[floor];
        return floorObj.sitTargets[wpName] || { sit: false, facing: 0 };
    }

    function getDeskIndexInfo(deskIndex) {
        const floor = 1 + Math.floor(deskIndex / 4);
        const labels = ["A", "B", "C", "D"];
        const office = labels[deskIndex % 4];
        return { floor, deskWp: `office${office}_desk`, doorWp: `office${office}_door` };
    }

    function createAgent(id, role) {
        const deskIndex = role === "WORKER" ? id : null;
        const deskInfo = deskIndex !== null ? getDeskIndexInfo(deskIndex) : null;
        const agent = {
            id, role,
            name: sample(FIRST_NAMES) + (role === "WORKER" ? " W" + id : " V" + (id - MAX_WORKERS)),
            homeFloor: deskInfo ? deskInfo.floor : null,
            deskId: deskIndex,
            deskWpName: deskInfo ? deskInfo.deskWp : null,
            deskDoorWpName: deskInfo ? deskInfo.doorWp : null,
            group: createPerson(),
            state: "AWAY",
            plan: [],
            currentAction: null,
            arrivalTime: 0, lunchTime: 0, lunchDuration: 0, departureTime: 0,
            plannedMeetingTimes: [],
            hasLunched: false,
            reservedSeat: null,
            path: [],
            pathIndex: 0,
            waitUntil: 0,
            spawnJitter: { x: randRange(-1.1, 1.1), z: randRange(-0.75, 0.75) },
            lastPos: new THREE.Vector3(),
            stallT: 0
        };
        agent.group.visible = false;
        return agent;
    }

    function sampleSchedule(agent) {
        agent.arrivalTime = randInt(8 * 60 + 15, 9 * 60 + 30);
        agent.lunchTime = randInt(11 * 60 + 30, 13 * 60 + 30);
        agent.lunchDuration = randInt(25, 60);
        if (Math.random() < 0.15) {
            agent.departureTime = randInt(18 * 60 + 30, 19 * 60 + 45);
        } else {
            agent.departureTime = randInt(16 * 60 + 45, 18 * 60 + 30);
        }
        agent.plannedMeetingTimes = [];
        if (agent.role === "WORKER") {
            const nMeetings = randInt(0, 2);
            if (nMeetings >= 1) {
                agent.plannedMeetingTimes.push(randInt(agent.arrivalTime + 30, agent.lunchTime - 30));
            }
            if (nMeetings >= 2) {
                agent.plannedMeetingTimes.push(randInt(agent.lunchTime + agent.lunchDuration + 30, agent.departureTime - 30));
            }
            agent.plannedMeetingTimes.sort((a, b) => a - b);
        }
        agent.hasLunched = false;
    }

    function initAgents() {
        agents = [];
        for (let i = 0; i < MAX_WORKERS; i++) agents.push(createAgent(i, "WORKER"));
        for (let i = MAX_WORKERS; i < MAX_OCCUPANCY; i++) agents.push(createAgent(i, "VISITOR"));
        agents.forEach(a => { sampleSchedule(a); scene.add(a.group); });
        applyOccupancy();
    }

    function countPresent() {
        return agents.filter(a => a.state !== "AWAY" && a.state !== "GONE" && a.state !== "DISABLED").length;
    }

    function applyOccupancy() {
        agents.forEach(a => {
            if (a.id < targetOccupancy) {
                if (a.state === "DISABLED") {
                    a.state = "AWAY";
                    a.group.visible = false;
                }
            } else {
                if (a.state === "AWAY" || a.state === "GONE") {
                    a.state = "DISABLED";
                    a.group.visible = false;
                    releaseAgentSeat(a);
                }
            }
        });
    }

    function topUpVisitors() {
        const now = clock.simMinute;
        if (now < 7 * 60 || now > 20 * 60) return;
        const deficit = targetOccupancy - countPresent();
        if (deficit <= 0) return;
        let armed = 0;
        for (const a of agents) {
            if (a.role !== "VISITOR") continue;
            if (a.state !== "AWAY" && a.state !== "GONE") continue;
            if (a.id >= targetOccupancy) continue;
            a.state = "AWAY";
            a.arrivalTime = now + randInt(0, 6);
            a.lunchTime = 0;
            a.lunchDuration = 0;
            a.departureTime = now + randInt(20, 90);
            a.plannedMeetingTimes = [];
            a.hasLunched = true;
            a.group.visible = false;
            releaseAgentSeat(a);
            armed++;
            if (armed >= deficit) break;
        }
    }

    function startNewDay() {
        seatReservations.clear();
        agents.forEach(a => {
            releaseAgentSeat(a);
            sampleSchedule(a);
            a.plan = [];
            a.currentAction = null;
            a.path = [];
            a.group.visible = false;
            a.group.position.set(0, 0, 0);
            a.group.rotation.set(0, 0, 0);
            a.group.userData.isSitting = false;
            a.group.userData.isWalking = false;
            if (a.id < targetOccupancy) a.state = "AWAY";
            else a.state = "DISABLED";
            if (a.group.parent) a.group.parent.remove(a.group);
            scene.add(a.group);
        });
        elevator.reset();
        elevator.carGroup.position.y = 0;
    }

    // ----------------- Plans -----------------

    function planArriveToDesk(agent) {
        const f = agent.homeFloor;
        return [
            { type: "STAND" },
            { type: "ENTER_STATE", state: "ARRIVING" },
            { type: "WALK_TO_WP", floor: 0, wpName: "outside" },
            { type: "WALK_TO_WP", floor: 0, wpName: "entrance" },
            { type: "WAIT_AT_PANEL", floor: 0, dir: 1, toFloor: f },
            { type: "ENTER_ELEVATOR", toFloor: f },
            { type: "PRESS_FLOOR", floor: f },
            { type: "WAIT_FOR_FLOOR", floor: f },
            { type: "EXIT_ELEVATOR", toFloor: f },
            { type: "WALK_TO_WP", floor: f, wpName: agent.deskDoorWpName },
            { type: "WALK_TO_WP", floor: f, wpName: agent.deskWpName },
            { type: "SIT", floor: f, wpName: agent.deskWpName },
            { type: "ENTER_STATE", state: "AT_DESK" },
            { type: "WAIT_SIM", minutes: randInt(18, 65) },
            { type: "PICK_NEXT_ACTIVITY" }
        ];
    }

    function reserveRandomSpot(floor, spots) {
        const shuffled = spots.slice().sort(() => Math.random() - 0.5);
        for (const s of shuffled) {
            if (reserveSeat(floor, s)) return s;
        }
        return null;
    }

    function planGoToLunch(agent) {
        const f = agent.homeFloor;
        let cafeSpot = reserveRandomSpot(0, world.floors[0].cafeSpots);
        if (cafeSpot) agent.reservedSeat = { floor: 0, wpName: cafeSpot };
        else cafeSpot = "cafe_order";
        return [
            { type: "STAND" },
            { type: "RELEASE_SEAT" },
            { type: "ENTER_STATE", state: "AT_LUNCH" },
            { type: "WALK_TO_WP", floor: f, wpName: agent.deskDoorWpName },
            { type: "WAIT_AT_PANEL", floor: f, dir: -1, toFloor: 0 },
            { type: "ENTER_ELEVATOR", toFloor: 0 },
            { type: "PRESS_FLOOR", floor: 0 },
            { type: "WAIT_FOR_FLOOR", floor: 0 },
            { type: "EXIT_ELEVATOR", toFloor: 0 },
            { type: "WALK_TO_WP", floor: 0, wpName: cafeSpot },
            { type: "SIT", floor: 0, wpName: cafeSpot },
            { type: "WAIT_SIM", minutes: agent.lunchDuration },
            { type: "STAND" },
            { type: "RELEASE_SEAT" },
            { type: "WALK_TO_WP", floor: 0, wpName: "elevWait" },
            { type: "WAIT_AT_PANEL", floor: 0, dir: 1, toFloor: f },
            { type: "ENTER_ELEVATOR", toFloor: f },
            { type: "PRESS_FLOOR", floor: f },
            { type: "WAIT_FOR_FLOOR", floor: f },
            { type: "EXIT_ELEVATOR", toFloor: f },
            { type: "WALK_TO_WP", floor: f, wpName: agent.deskDoorWpName },
            { type: "WALK_TO_WP", floor: f, wpName: agent.deskWpName },
            { type: "SIT", floor: f, wpName: agent.deskWpName },
            { type: "MARK_LUNCHED" },
            { type: "ENTER_STATE", state: "AT_DESK" },
            { type: "WAIT_SIM", minutes: randInt(18, 65) },
            { type: "PICK_NEXT_ACTIVITY" }
        ];
    }

    function planVisitLounge(agent) {
        const f = agent.homeFloor;
        const spot = reserveRandomSpot(f, world.floors[f].loungeSpots);
        if (spot) agent.reservedSeat = { floor: f, wpName: spot };
        if (!spot) {
            return [
                { type: "STAND" },
                { type: "RELEASE_SEAT" },
                { type: "ENTER_STATE", state: "AT_BREAK" },
                { type: "WALK_TO_WP", floor: f, wpName: "hall_stand_N" },
                { type: "WAIT_SIM", minutes: randInt(5, 12) },
                { type: "WALK_TO_WP", floor: f, wpName: agent.deskDoorWpName },
                { type: "WALK_TO_WP", floor: f, wpName: agent.deskWpName },
                { type: "SIT", floor: f, wpName: agent.deskWpName },
                { type: "ENTER_STATE", state: "AT_DESK" },
                { type: "WAIT_SIM", minutes: randInt(18, 65) },
                { type: "PICK_NEXT_ACTIVITY" }
            ];
        }
        return [
            { type: "STAND" },
            { type: "RELEASE_SEAT" },
            { type: "ENTER_STATE", state: "AT_BREAK" },
            { type: "WALK_TO_WP", floor: f, wpName: agent.deskDoorWpName },
            { type: "WALK_TO_WP", floor: f, wpName: "lounge_door" },
            { type: "WALK_TO_WP", floor: f, wpName: spot },
            { type: "SIT", floor: f, wpName: spot },
            { type: "WAIT_SIM", minutes: randInt(5, 12) },
            { type: "STAND" },
            { type: "RELEASE_SEAT" },
            { type: "WALK_TO_WP", floor: f, wpName: "lounge_door" },
            { type: "WALK_TO_WP", floor: f, wpName: agent.deskDoorWpName },
            { type: "WALK_TO_WP", floor: f, wpName: agent.deskWpName },
            { type: "SIT", floor: f, wpName: agent.deskWpName },
            { type: "ENTER_STATE", state: "AT_DESK" },
            { type: "WAIT_SIM", minutes: randInt(18, 65) },
            { type: "PICK_NEXT_ACTIVITY" }
        ];
    }

    function reserveConfSeat(floor) {
        const floorObj = world.floors[floor];
        for (const seat of floorObj.confSeats) {
            if (reserveSeat(floor, seat)) return seat;
        }
        return null;
    }

    function planAttendMeeting(agent, meetingFloor) {
        const f = meetingFloor !== undefined ? meetingFloor : (Math.random() < 0.65 ? agent.homeFloor : randInt(1, WORLD.FLOOR_COUNT - 1));
        const seat = reserveConfSeat(f);
        if (!seat) return planVisitLounge(agent);
        agent.reservedSeat = { floor: f, wpName: seat };
        const ownF = agent.homeFloor;
        const plan = [
            { type: "STAND" },
            { type: "RELEASE_SEAT" },
            { type: "ENTER_STATE", state: "IN_MEETING" }
        ];
        if (f !== ownF) {
            plan.push({ type: "WALK_TO_WP", floor: ownF, wpName: agent.deskDoorWpName });
            plan.push({ type: "WAIT_AT_PANEL", floor: ownF, dir: f > ownF ? 1 : -1, toFloor: f });
            plan.push({ type: "ENTER_ELEVATOR", toFloor: f });
            plan.push({ type: "PRESS_FLOOR", floor: f });
            plan.push({ type: "WAIT_FOR_FLOOR", floor: f });
            plan.push({ type: "EXIT_ELEVATOR", toFloor: f });
        }
        plan.push({ type: "WALK_TO_WP", floor: f, wpName: "conf_door" });
        plan.push({ type: "WALK_TO_WP", floor: f, wpName: seat });
        plan.push({ type: "SIT", floor: f, wpName: seat });
        plan.push({ type: "WAIT_SIM", minutes: randInt(22, 45) });
        plan.push({ type: "STAND" });
        plan.push({ type: "RELEASE_SEAT" });
        if (f !== ownF) {
            plan.push({ type: "WALK_TO_WP", floor: f, wpName: "conf_door" });
            plan.push({ type: "WALK_TO_WP", floor: f, wpName: "elevWait" });
            plan.push({ type: "WAIT_AT_PANEL", floor: f, dir: ownF > f ? 1 : -1, toFloor: ownF });
            plan.push({ type: "ENTER_ELEVATOR", toFloor: ownF });
            plan.push({ type: "PRESS_FLOOR", floor: ownF });
            plan.push({ type: "WAIT_FOR_FLOOR", floor: ownF });
            plan.push({ type: "EXIT_ELEVATOR", toFloor: ownF });
        }
        plan.push({ type: "WALK_TO_WP", floor: ownF, wpName: agent.deskDoorWpName });
        plan.push({ type: "WALK_TO_WP", floor: ownF, wpName: agent.deskWpName });
        plan.push({ type: "SIT", floor: ownF, wpName: agent.deskWpName });
        plan.push({ type: "ENTER_STATE", state: "AT_DESK" });
        plan.push({ type: "WAIT_SIM", minutes: randInt(18, 65) });
        plan.push({ type: "PICK_NEXT_ACTIVITY" });
        return plan;
    }

    function planVisitCoworker(agent) {
        const candidates = agents.filter(b => b.role === "WORKER" && b.state === "AT_DESK" && b.id !== agent.id);
        if (candidates.length === 0) return planVisitLounge(agent);
        const target = sample(candidates);
        const f = target.homeFloor;
        const ownF = agent.homeFloor;
        const plan = [
            { type: "STAND" },
            { type: "RELEASE_SEAT" },
            { type: "ENTER_STATE", state: "VISITING" }
        ];
        if (f !== ownF) {
            plan.push({ type: "WALK_TO_WP", floor: ownF, wpName: agent.deskDoorWpName });
            plan.push({ type: "WAIT_AT_PANEL", floor: ownF, dir: f > ownF ? 1 : -1, toFloor: f });
            plan.push({ type: "ENTER_ELEVATOR", toFloor: f });
            plan.push({ type: "PRESS_FLOOR", floor: f });
            plan.push({ type: "WAIT_FOR_FLOOR", floor: f });
            plan.push({ type: "EXIT_ELEVATOR", toFloor: f });
        }
        plan.push({ type: "WALK_TO_WP", floor: f, wpName: target.deskDoorWpName });
        plan.push({ type: "WAIT_SIM", minutes: randInt(6, 18) });
        if (f !== ownF) {
            plan.push({ type: "WALK_TO_WP", floor: f, wpName: "elevWait" });
            plan.push({ type: "WAIT_AT_PANEL", floor: f, dir: ownF > f ? 1 : -1, toFloor: ownF });
            plan.push({ type: "ENTER_ELEVATOR", toFloor: ownF });
            plan.push({ type: "PRESS_FLOOR", floor: ownF });
            plan.push({ type: "WAIT_FOR_FLOOR", floor: ownF });
            plan.push({ type: "EXIT_ELEVATOR", toFloor: ownF });
        }
        plan.push({ type: "WALK_TO_WP", floor: ownF, wpName: agent.deskDoorWpName });
        plan.push({ type: "WALK_TO_WP", floor: ownF, wpName: agent.deskWpName });
        plan.push({ type: "SIT", floor: ownF, wpName: agent.deskWpName });
        plan.push({ type: "ENTER_STATE", state: "AT_DESK" });
        plan.push({ type: "WAIT_SIM", minutes: randInt(18, 65) });
        plan.push({ type: "PICK_NEXT_ACTIVITY" });
        return plan;
    }

    function planLeaveBuilding(agent) {
        const f = agent.homeFloor;
        const plan = [
            { type: "STAND" },
            { type: "RELEASE_SEAT" },
            { type: "ENTER_STATE", state: "LEAVING" }
        ];
        if (f !== null && f !== 0) {
            plan.push({ type: "WALK_TO_WP", floor: f, wpName: agent.deskDoorWpName });
            plan.push({ type: "WAIT_AT_PANEL", floor: f, dir: -1, toFloor: 0 });
            plan.push({ type: "ENTER_ELEVATOR", toFloor: 0 });
            plan.push({ type: "PRESS_FLOOR", floor: 0 });
            plan.push({ type: "WAIT_FOR_FLOOR", floor: 0 });
            plan.push({ type: "EXIT_ELEVATOR", toFloor: 0 });
        }
        plan.push({ type: "WALK_TO_WP", floor: 0, wpName: "entrance" });
        plan.push({ type: "WALK_TO_WP", floor: 0, wpName: "outside" });
        plan.push({ type: "EXIT_BUILDING" });
        return plan;
    }

    function planVisitorVisit(agent) {
        const r = Math.random();
        let wpName, floor = 0, sit = true;
        if (r < 0.10) {
            wpName = reserveRandomSpot(0, world.floors[0].cafeSpots);
            if (!wpName) { wpName = "cafe_order"; sit = false; }
        } else if (r < 0.16) {
            wpName = "cafe_order"; sit = false;
        } else if (r < 0.30) {
            wpName = reserveRandomSpot(0, world.floors[0].loungeSpots);
            if (!wpName) { wpName = sample(["lobby_stand_center", "lobby_stand_NE", "lobby_stand_NW", "lobby_stand_midE", "lobby_stand_midW", "lobby_stand_entry"]); sit = false; }
        } else if (r < 0.42) {
            const backSpots = world.floors[0].loungeSpots.filter(n => n.startsWith("back_") || n.startsWith("pit_"));
            wpName = reserveRandomSpot(0, backSpots.length ? backSpots : world.floors[0].loungeSpots);
            if (!wpName) { wpName = sample(["lobby_stand_center", "lobby_stand_NE", "lobby_stand_NW", "lobby_stand_midE", "lobby_stand_midW", "lobby_stand_entry"]); sit = false; }
        } else if (r < 0.52) {
            wpName = sample(["reception", "kiosk", "lobby_wc_front", "lobby_wc_back"]); sit = false;
        } else if (r < 0.62) {
            wpName = sample(["lobby_stand_center", "lobby_stand_NE", "lobby_stand_NW", "lobby_stand_midE", "lobby_stand_midW", "lobby_stand_entry"]); sit = false;
        } else if (r < 0.77) {
            floor = randInt(1, WORLD.FLOOR_COUNT - 1);
            wpName = reserveRandomSpot(floor, world.floors[floor].loungeSpots);
            if (!wpName) { floor = 0; wpName = sample(["lobby_stand_center", "lobby_stand_NE", "lobby_stand_NW", "lobby_stand_midE", "lobby_stand_midW", "lobby_stand_entry"]); sit = false; }
        } else {
            floor = randInt(1, WORLD.FLOOR_COUNT - 1);
            const seat = reserveConfSeat(floor);
            if (seat) {
                wpName = seat; sit = true;
                agent.reservedSeat = { floor, wpName: seat };
            } else {
                floor = 0;
                wpName = sample(["lobby_stand_center", "lobby_stand_NE", "lobby_stand_NW", "lobby_stand_midE", "lobby_stand_midW", "lobby_stand_entry"]);
                sit = false;
            }
        }
        if (sit && !agent.reservedSeat) {
            agent.reservedSeat = { floor, wpName };
        }

        const plan = [
            { type: "STAND" },
            { type: "ENTER_STATE", state: "VISITING" },
            { type: "WALK_TO_WP", floor: 0, wpName: "outside" },
            { type: "WALK_TO_WP", floor: 0, wpName: "entrance" }
        ];
        if (floor !== 0) {
            plan.push({ type: "WAIT_AT_PANEL", floor: 0, dir: 1, toFloor: floor });
            plan.push({ type: "ENTER_ELEVATOR", toFloor: floor });
            plan.push({ type: "PRESS_FLOOR", floor: floor });
            plan.push({ type: "WAIT_FOR_FLOOR", floor: floor });
            plan.push({ type: "EXIT_ELEVATOR", toFloor: floor });
        }
        plan.push({ type: "WALK_TO_WP", floor: floor, wpName: wpName });
        if (sit) plan.push({ type: "SIT", floor: floor, wpName: wpName });
        plan.push({ type: "WAIT_SIM", minutes: randInt(8, 35) });
        if (sit) plan.push({ type: "STAND" });
        plan.push({ type: "RELEASE_SEAT" });
        if (floor !== 0) {
            plan.push({ type: "WALK_TO_WP", floor: floor, wpName: "elevWait" });
            plan.push({ type: "WAIT_AT_PANEL", floor: floor, dir: -1, toFloor: 0 });
            plan.push({ type: "ENTER_ELEVATOR", toFloor: 0 });
            plan.push({ type: "PRESS_FLOOR", floor: 0 });
            plan.push({ type: "WAIT_FOR_FLOOR", floor: 0 });
            plan.push({ type: "EXIT_ELEVATOR", toFloor: 0 });
        }
        plan.push({ type: "WALK_TO_WP", floor: 0, wpName: "entrance" });
        plan.push({ type: "WALK_TO_WP", floor: 0, wpName: "outside" });
        plan.push({ type: "EXIT_BUILDING" });
        return plan;
    }

    function chooseNextActivity(agent) {
        const now = clock.simMinute;
        if (agent.role === "VISITOR") {
            return planVisitorVisit(agent);
        }
        if (now >= agent.departureTime) {
            return planLeaveBuilding(agent);
        }
        if (agent.plannedMeetingTimes.length && now >= agent.plannedMeetingTimes[0]) {
            agent.plannedMeetingTimes.shift();
            return planAttendMeeting(agent);
        }
        if (!agent.hasLunched && now >= agent.lunchTime) {
            return planGoToLunch(agent);
        }
        const roll = Math.random();
        if (roll < 0.14) {
            return planAttendMeeting(agent);
        } else if (roll < 0.26) {
            return planVisitLounge(agent);
        } else if (roll < 0.41) {
            return planVisitCoworker(agent);
        } else {
            return [
                { type: "ENTER_STATE", state: "AT_DESK" },
                { type: "WAIT_SIM", minutes: randInt(18, 65) },
                { type: "PICK_NEXT_ACTIVITY" }
            ];
        }
    }

    // ----------------- Action execution -----------------

    function startAction(agent, action) {
        if (!action) return;
        if (action.type === "WAIT_SIM") {
            agent.waitUntil = clock.simMinute + action.minutes;
        }
        if (action.type === "WAIT_AT_PANEL") {
            agent.state = "WAITING_ELEVATOR";
        }
        if (action.type === "WALK_TO_WP") {
            computePath(agent, action.floor, action.wpName);
            agent.lastPos.copy(agent.group.position);
            agent.stallT = 0;
        }
        if (action.type === "ENTER_ELEVATOR") {
            agent.state = "IN_CAR";
            agent.enterElevatorPhase = 0;
            agent.stallT = 0;
            agent.lastPos.copy(agent.group.position);
        }
        if (action.type === "EXIT_ELEVATOR") {
            agent.state = "ON_FLOOR";
            agent.exitElevatorPhase = 0;
            agent.stallT = 0;
            agent.lastPos.copy(agent.group.position);
        }
        if (action.type === "SIT") {
            const target = getSitTarget(action.floor, action.wpName);
            const pos = getWpWorldPos(action.floor, action.wpName);
            let jx = 0, jz = 0;
            if (!target.sit) {
                const ring = randRange(0.35, 0.75);
                const ang = randRange(0, Math.PI * 2);
                jx = Math.cos(ang) * ring;
                jz = Math.sin(ang) * ring;
            }
            agent.group.position.x = pos.x + jx;
            agent.group.position.z = pos.z + jz;
            agent.group.position.y = pos.y - 0.35;
            agent.group.rotation.y = target.facing;
            agent.group.userData.isSitting = true;
            agent.group.userData.isWalking = false;
        }
        if (action.type === "STAND") {
            const inCar = agent.group.parent === elevator.carGroup;
            agent.group.position.y = inCar ? 0 : Math.round(agent.group.position.y / WORLD.FLOOR_HEIGHT) * WORLD.FLOOR_HEIGHT;
            agent.group.userData.isSitting = false;
        }
    }

    function computePath(agent, floor, wpName) {
        const floorObj = world.floors[floor];
        const targetNode = floorObj.nodes.find(n => n.name === wpName);
        if (!targetNode) { agent.path = []; agent.pathIndex = 0; return; }

        const pos = new THREE.Vector3();
        agent.group.getWorldPosition(pos);
        // Find nearest node on this floor by XZ distance
        let best = null, bestDist = Infinity;
        for (const n of floorObj.nodes) {
            const d = Math.hypot(n.x - pos.x, n.z - pos.z);
            if (d < bestDist) { bestDist = d; best = n; }
        }
        const wayNames = bfsPath(floorObj.nodes, best.name, wpName);
        agent.path = wayNames;
        agent.pathIndex = 0;
    }

    function walkAlongPath(agent, dt) {
        if (agent.pathIndex >= agent.path.length) return true;
        const target = agent.path[agent.pathIndex];
        const pos = agent.group.position;
        const dx = target.x - pos.x;
        const dz = target.z - pos.z;
        const dist = Math.hypot(dx, dz);

        if (dist < 0.1) {
            agent.pathIndex++;
            agent.stallT = 0;
            agent.lastPos.copy(pos);
            return agent.pathIndex >= agent.path.length;
        }

        const step = WALK_SPEED * dt;
        const move = Math.min(step, dist);
        const nx = dx / dist, nz = dz / dist;
        pos.x += nx * move;
        pos.z += nz * move;
        agent.group.rotation.y = Math.atan2(nx, nz);
        agent.group.userData.isWalking = true;

        const progress = Math.hypot(pos.x - agent.lastPos.x, pos.z - agent.lastPos.z);
        if (progress < 0.005) agent.stallT += dt;
        else { agent.stallT = 0; agent.lastPos.copy(pos); }
        if (agent.stallT > 1.2) {
            agent.pathIndex++;
            agent.stallT = 0;
            agent.lastPos.copy(pos);
        }
        return false;
    }

    function updateAction(agent, action, dt) {
        switch (action.type) {
            case "WALK_TO_WP": {
                agent.group.userData.isWalking = true;
                const done = walkAlongPath(agent, dt);
                if (done) agent.group.userData.isWalking = false;
                return done;
            }
            case "WAIT_AT_PANEL": {
                if (action.dir === 1) elevator.callUp(action.floor);
                else elevator.callDown(action.floor);
                const canEnter = elevator.isAcceptingAt(action.floor, action.dir) && elevator.currentCapacityFree() > 0;
                if (canEnter) {
                    // Move toward the car threshold so ENTER_ELEVATOR begins close
                    const waitPos = getWpWorldPos(action.floor, "elevWait");
                    agent.group.position.x = waitPos.x;
                    agent.group.position.z = waitPos.z;
                    return true;
                }
                agent.group.userData.isWalking = false;
                return false;
            }
            case "ENTER_ELEVATOR": {
                if (agent.enterElevatorPhase === 0) {
                    agent.reservedSpot = elevator.reserveBoardingSpot(agent);
                    if (!agent.reservedSpot) {
                        elevator.callUp(action.floor);
                        return false;
                    }
                    agent.enterElevatorPhase = 1;
                }
                if (agent.enterElevatorPhase === 1) {
                    // Walk to door threshold, x aligned with reserved spot
                    const threshold = getWpWorldPos(action.floor, "elevWait");
                    threshold.x = agent.reservedSpot.x;
                    threshold.z = 2.6;
                    const pos = agent.group.position;
                    const dx = threshold.x - pos.x;
                    const dz = threshold.z - pos.z;
                    const dist = Math.hypot(dx, dz);
                    if (dist < 0.2) {
                        agent.enterElevatorPhase = 2;
                        agent.stallT = 0;
                    } else {
                        const step = WALK_SPEED * dt;
                        const move = Math.min(step, dist);
                        pos.x += (dx / dist) * move;
                        pos.z += (dz / dist) * move;
                        agent.group.rotation.y = Math.atan2(dx, dz);
                        agent.group.userData.isWalking = true;
                        const progress = Math.hypot(pos.x - agent.lastPos.x, pos.z - agent.lastPos.z);
                        if (progress < 0.005) agent.stallT += dt;
                        else { agent.stallT = 0; agent.lastPos.copy(pos); }
                        if (agent.stallT > 1.5) {
                            pos.x = threshold.x; pos.z = threshold.z;
                            agent.enterElevatorPhase = 2;
                            agent.stallT = 0;
                        }
                        return false;
                    }
                }
                if (agent.enterElevatorPhase === 2) {
                    // Reparent to car preserving world transform
                    const worldPos = agent.group.position.clone();
                    elevator.carGroup.attach(agent.group);
                    agent.group.position.copy(worldPos);
                    agent.group.position.y = 0;
                    agent.enterElevatorPhase = 3;
                    agent.stallT = 0;
                    agent.lastPos.copy(agent.group.position);
                }
                if (agent.enterElevatorPhase === 3) {
                    const target = new THREE.Vector3(agent.reservedSpot.x, 0, agent.reservedSpot.z);
                    const pos = agent.group.position;
                    const dx = target.x - pos.x;
                    const dz = target.z - pos.z;
                    const dist = Math.hypot(dx, dz);
                    if (dist < 0.15) {
                        elevator.completeBoard(agent);
                        agent.group.rotation.y = 0;
                        agent.group.userData.isWalking = false;
                        return true;
                    }
                    const step = WALK_SPEED * dt;
                    const move = Math.min(step, dist);
                    pos.x += (dx / dist) * move;
                    pos.z += (dz / dist) * move;
                    agent.group.rotation.y = Math.atan2(dx, dz);
                    agent.group.userData.isWalking = true;
                    return false;
                }
                return false;
            }
            case "PRESS_FLOOR":
                elevator.pressDestination(action.floor);
                return true;
            case "WAIT_FOR_FLOOR":
                return elevator.state === "DOOR_OPEN" && elevator.currentFloor === action.floor;
            case "EXIT_ELEVATOR": {
                if (agent.exitElevatorPhase === 0) {
                    elevator.registerDisembark(agent);
                    const worldPos = agent.group.position.clone();
                    elevator.carGroup.updateMatrixWorld();
                    worldPos.applyMatrix4(elevator.carGroup.matrixWorld);
                    scene.attach(agent.group);
                    agent.group.position.copy(worldPos);
                    agent.group.position.y = action.toFloor * WORLD.FLOOR_HEIGHT;
                    agent.exitElevatorPhase = 1;
                    agent.stallT = 0;
                    agent.lastPos.copy(agent.group.position);
                    return false;
                }
                if (agent.exitElevatorPhase === 1) {
                    const target = getWpWorldPos(action.toFloor, "elevWait");
                    const pos = agent.group.position;
                    const dx = target.x - pos.x;
                    const dz = target.z - pos.z;
                    const dist = Math.hypot(dx, dz);
                    if (dist < 0.2) {
                        elevator.completeDisembark(agent);
                        agent.exitElevatorPhase = 0;
                        agent.group.rotation.y = 0;
                        agent.group.userData.isWalking = false;
                        return true;
                    }
                    const step = WALK_SPEED * dt;
                    const move = Math.min(step, dist);
                    pos.x += (dx / dist) * move;
                    pos.z += (dz / dist) * move;
                    agent.group.rotation.y = Math.atan2(dx, dz);
                    agent.group.userData.isWalking = true;
                    const progress = Math.hypot(pos.x - agent.lastPos.x, pos.z - agent.lastPos.z);
                    if (progress < 0.005) agent.stallT += dt;
                    else { agent.stallT = 0; agent.lastPos.copy(pos); }
                    if (agent.stallT > 1.5) {
                        pos.x = target.x; pos.z = target.z;
                        elevator.completeDisembark(agent);
                        agent.exitElevatorPhase = 0;
                        agent.group.rotation.y = 0;
                        agent.group.userData.isWalking = false;
                        return true;
                    }
                    return false;
                }
                return true;
            }
            case "SIT": {
                const target = getSitTarget(action.floor, action.wpName);
                const pos = getWpWorldPos(action.floor, action.wpName);
                let jx = 0, jz = 0;
                if (!target.sit) {
                    const ring = randRange(0.35, 0.75);
                    const ang = randRange(0, Math.PI * 2);
                    jx = Math.cos(ang) * ring;
                    jz = Math.sin(ang) * ring;
                }
                agent.group.position.x = pos.x + jx;
                agent.group.position.z = pos.z + jz;
                agent.group.position.y = pos.y - 0.35;
                agent.group.rotation.y = target.facing;
                agent.group.userData.isSitting = true;
                agent.group.userData.isWalking = false;
                return true;
            }
            case "STAND": {
                const inCar = agent.group.parent === elevator.carGroup;
                agent.group.position.y = inCar ? 0 : Math.round(agent.group.position.y / WORLD.FLOOR_HEIGHT) * WORLD.FLOOR_HEIGHT;
                agent.group.userData.isSitting = false;
                return true;
            }
            case "RELEASE_SEAT":
                releaseAgentSeat(agent);
                return true;
            case "WAIT_SIM":
                agent.group.userData.isWalking = false;
                return clock.simMinute >= agent.waitUntil;
            case "EXIT_BUILDING":
                agent.state = "GONE";
                agent.group.visible = false;
                if (agent.group.parent) agent.group.parent.remove(agent.group);
                scene.add(agent.group);
                agent.group.position.set(0, 0, 0);
                releaseAgentSeat(agent);
                return true;
            case "ENTER_STATE":
                agent.state = action.state;
                return true;
            case "MARK_LUNCHED":
                agent.hasLunched = true;
                return true;
            case "PICK_NEXT_ACTIVITY": {
                const newPlan = chooseNextActivity(agent);
                agent.plan = newPlan;
                return true;
            }
            default:
                return true;
        }
    }

    // ----------------- Per-frame agent processing -----------------

    function spawnIfNeeded(agent) {
        if (agent.state !== "AWAY") return;
        if (clock.simMinute < agent.arrivalTime) return;
        if (agent.role === "WORKER") {
            agent.plan = planArriveToDesk(agent);
        } else {
            agent.plan = planVisitorVisit(agent);
        }
        agent.currentAction = agent.plan[0];
        startAction(agent, agent.currentAction);
        agent.group.visible = true;
        // Spawn on sidewalk with jitter
        const out = getWpWorldPos(0, "outside");
        agent.group.position.set(out.x + agent.spawnJitter.x, out.y, out.z + agent.spawnJitter.z);
    }

    function maybeLeaveOverride(agent) {
        if (agent.role !== "WORKER") return;
        if (clock.simMinute < agent.departureTime) return;
        if (agent.state === "LEAVING" || agent.state === "GONE" || agent.state === "AWAY" || agent.state === "DISABLED") return;
        releaseAgentSeat(agent);
        agent.plan = planLeaveBuilding(agent);
        agent.currentAction = agent.plan[0];
        startAction(agent, agent.currentAction);
    }

    function processAgent(agent, motionDt) {
        if (agent.state === "AWAY" || agent.state === "GONE" || agent.state === "DISABLED") return;
        if (!agent.currentAction) {
            if (agent.plan.length) {
                agent.currentAction = agent.plan[0];
                startAction(agent, agent.currentAction);
            } else {
                const fallback = chooseNextActivity(agent);
                agent.plan = fallback;
                agent.currentAction = agent.plan[0];
                startAction(agent, agent.currentAction);
            }
        }
        let iters = 0;
        while (agent.currentAction && iters < 16) {
            const done = updateAction(agent, agent.currentAction, motionDt);
            if (!done) break;
            agent.plan.shift();
            agent.currentAction = agent.plan[0] || null;
            if (agent.currentAction) startAction(agent, agent.currentAction);
            iters++;
        }
    }

    // ----------------- Collision -----------------

    function applyCollisions() {
        const present = agents.filter(a => a.group.visible && a.state !== "DISABLED");
        for (let i = 0; i < present.length; i++) {
            const a = present[i];
            if (a.group.userData.isSitting) continue;
            if (a.group.parent === elevator.carGroup) continue;
            if (a.currentAction && a.currentAction.type === "ENTER_ELEVATOR") continue;
            for (let j = i + 1; j < present.length; j++) {
                const b = present[j];
                if (b.group.userData.isSitting) continue;
                if (b.group.parent === elevator.carGroup) continue;
                if (b.currentAction && b.currentAction.type === "ENTER_ELEVATOR") continue;
                if (a.group.parent !== b.group.parent) continue;
                const dy = Math.abs(a.group.position.y - b.group.position.y);
                if (dy > 1.0) continue;
                const dx = b.group.position.x - a.group.position.x;
                const dz = b.group.position.z - a.group.position.z;
                const d = Math.hypot(dx, dz);
                const minD = 0.85;
                if (d < minD && d > 1e-3) {
                    const push = (minD - d) * 0.18;
                    const nx = dx / d, nz = dz / d;
                    a.group.position.x -= nx * push;
                    a.group.position.z -= nz * push;
                    b.group.position.x += nx * push;
                    b.group.position.z += nz * push;
                } else if (d <= 1e-3) {
                    const ang = Math.random() * Math.PI * 2;
                    const push = 0.2;
                    a.group.position.x -= Math.cos(ang) * push;
                    a.group.position.z -= Math.sin(ang) * push;
                    b.group.position.x += Math.cos(ang) * push;
                    b.group.position.z += Math.sin(ang) * push;
                }
            }
        }
    }

    // ----------------- Lighting -----------------

    const LIGHT_KEYFRAMES = [
        { h: 0,  bg: 0x0a0a15, sun: 0x223355, sunI: 0.0, ambI: 0.45, hemiI: 0.32 },
        { h: 5,  bg: 0x1a1a2e, sun: 0x554433, sunI: 0.1, ambI: 0.45, hemiI: 0.35 },
        { h: 6,  bg: 0x553322, sun: 0xffaa55, sunI: 0.6, ambI: 0.55, hemiI: 0.50 },
        { h: 6.5,bg: 0x87aadd, sun: 0xffffee, sunI: 1.1, ambI: 0.65, hemiI: 0.62 },
        { h: 12, bg: 0xaaccff, sun: 0xfffff0, sunI: 1.2, ambI: 0.68, hemiI: 0.65 },
        { h: 17.5,bg:0x87aadd, sun: 0xffffee, sunI: 1.0, ambI: 0.62, hemiI: 0.60 },
        { h: 18, bg: 0x553322, sun: 0xffaa55, sunI: 0.5, ambI: 0.55, hemiI: 0.48 },
        { h: 18.5,bg:0x1a1a2e, sun: 0x554433, sunI: 0.1, ambI: 0.48, hemiI: 0.38 },
        { h: 24, bg: 0x0a0a15, sun: 0x223355, sunI: 0.0, ambI: 0.45, hemiI: 0.32 }
    ];
    let sunLight, ambientLight, hemiLight;

    function lerpColor(c1, c2, t) {
        const col1 = new THREE.Color(c1);
        const col2 = new THREE.Color(c2);
        return col1.lerp(col2, t);
    }

    function updateLighting() {
        const hour = clock.simMinute / 60;
        let k0 = LIGHT_KEYFRAMES[0], k1 = LIGHT_KEYFRAMES[LIGHT_KEYFRAMES.length - 1];
        let t = 0;
        for (let i = 0; i < LIGHT_KEYFRAMES.length - 1; i++) {
            const a = LIGHT_KEYFRAMES[i], b = LIGHT_KEYFRAMES[i + 1];
            if (hour >= a.h && hour <= b.h) {
                k0 = a; k1 = b;
                t = (hour - a.h) / (b.h - a.h);
                break;
            }
        }
        scene.background = lerpColor(k0.bg, k1.bg, t);
        scene.fog.color.copy(scene.background);
        sunLight.color.copy(lerpColor(k0.sun, k1.sun, t));
        sunLight.intensity = k0.sunI + (k1.sunI - k0.sunI) * t;
        ambientLight.intensity = k0.ambI + (k1.ambI - k0.ambI) * t;
        hemiLight.intensity = k0.hemiI + (k1.hemiI - k0.hemiI) * t;
        // Sun angle
        const sunAngle = ((hour - 6) / 12) * Math.PI; // from -pi/2 at 6 to pi/2 at 18
        sunLight.position.set(Math.cos(sunAngle) * 30, Math.sin(sunAngle) * 30 + 10, 20);
    }

    // ----------------- HUD -----------------

    function updateHUD() {
        document.getElementById("timeDisp").textContent = clock.format();
        const stateCounts = {};
        agents.forEach(a => { stateCounts[a.state] = (stateCounts[a.state] || 0) + 1; });
        const states = ["AWAY","ARRIVING","WAITING_ELEVATOR","IN_CAR","ON_FLOOR","AT_DESK","IN_MEETING","AT_BREAK","AT_LUNCH","VISITING","LEAVING","GONE","DISABLED"];
        const breakdown = states.filter(s => stateCounts[s]).map(s => `${s}:${stateCounts[s]}`).join(" ");
        document.getElementById("stateBreakdown").textContent = breakdown;
        const dir = elevator.direction > 0 ? "^" : (elevator.direction < 0 ? "v" : "-");
        const dest = Array.from(elevator.destinations).join(",");
        const up = Array.from(elevator.upCalls).join(",");
        const down = Array.from(elevator.downCalls).join(",");
        document.getElementById("elevInfo").innerHTML =
            `Fl:${elevator.currentFloor}${dir} ${elevator.state} P:${elevator.passengers.size}/${elevator.passengers.size+elevator.pendingBoarders.size}<br>` +
            `Dest:{${dest}} Up:{${up}} Down:{${down}}`;
    }

    function setupUI() {
        const speedSlider = document.getElementById("speedSlider");
        const speedLabel = document.getElementById("speedLabel");
        const stops = [1, 5, 15, 60, 120, 240, 600];
        speedSlider.addEventListener("input", () => {
            const idx = parseInt(speedSlider.value);
            clock.timeScale = stops[clamp(idx, 0, stops.length - 1)];
            speedLabel.textContent = clock.timeScale + "x";
        });
        clock.timeScale = stops[parseInt(speedSlider.value)];
        speedLabel.textContent = clock.timeScale + "x";

        const occSlider = document.getElementById("occSlider");
        const occLabel = document.getElementById("occLabel");
        occSlider.addEventListener("input", () => {
            targetOccupancy = parseInt(occSlider.value);
            occLabel.textContent = targetOccupancy + " / " + MAX_OCCUPANCY;
            applyOccupancy();
        });
        targetOccupancy = parseInt(occSlider.value);
        occLabel.textContent = targetOccupancy + " / " + MAX_OCCUPANCY;
    }

    // ----------------- Init -----------------

    function init() {
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x87aadd);

        camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 200);
        camera.position.set(28, 24, 28);

        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.sortObjects = true;
        document.body.appendChild(renderer.domElement);

        controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.target.set(0, WORLD.FLOOR_HEIGHT * WORLD.FLOOR_COUNT / 2, 0);
        controls.enableDamping = true;

        ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
        scene.add(ambientLight);
        sunLight = new THREE.DirectionalLight(0xfffff0, 1.1);
        sunLight.position.set(30, 40, 20);
        sunLight.castShadow = false;
        scene.add(sunLight);
        hemiLight = new THREE.HemisphereLight(0x87aadd, 0x222233, 0.62);
        scene.add(hemiLight);
        scene.fog = new THREE.Fog(scene.background, 30, 90);

        world = createWorld(scene);
        elevator = new Elevator(scene, world);

        clock = new Clock();
        initAgents();
        setupUI();
        updateLighting();

        window.addEventListener("resize", onWindowResize);
    }

    function onWindowResize() {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }

    function animate() {
        requestAnimationFrame(animate);
        const realDt = Math.min(0.05, clock.getDelta());
        clock.tick(realDt);
        updateLighting();
        const motionDt = realDt * clock.timeScale;
        elevator.tick(motionDt);

        topUpVisitors();
        for (const a of agents) {
            spawnIfNeeded(a);
            maybeLeaveOverride(a);
            processAgent(a, motionDt);
        }

        applyCollisions();
        for (const a of agents) {
            if (a.group.visible) animatePersonWalking(a.group, motionDt);
        }

        controls.update();
        renderer.render(scene, camera);
        updateHUD();
    }

    init();
    animate();
})(window);
