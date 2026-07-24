(function() {
    let scene, camera, renderer, controls, world, elevator;
    let clockTimer;

    const Clock = {
        simMinute: 7 * 60 + 30, // Start at 07:30 AM
        timeScale: 120, // Default 120x
        tick: function(realDt) {
            this.simMinute += (realDt * this.timeScale) / 60;
            if (this.simMinute >= 24 * 60) {
                this.simMinute %= (24 * 60);
                resetDay();
            }
        },
        format: function() {
            let totalM = Math.floor(this.simMinute);
            let h = Math.floor(totalM / 60) % 24;
            let m = totalM % 60;
            let ampm = h >= 12 ? "PM" : "AM";
            let h12 = h % 12;
            if (h12 === 0) h12 = 12;
            let mStr = m < 10 ? "0" + m : String(m);
            let hStr = h12 < 10 ? " " + h12 : String(h12);
            return hStr + ":" + mStr + " " + ampm;
        }
    };

    const MAX_WORKERS = 20;
    const MAX_VISITORS = 80;
    const TOTAL_AGENTS = MAX_WORKERS + MAX_VISITORS;
    let targetOccupancy = 45;

    const agents = [];
    const seatReservations = new Set();

    const FIRST_NAMES = [
        "Alex", "Jordan", "Taylor", "Morgan", "Sam", "Chris", "Pat", "Riley", "Dakota", "Avery",
        "Cameron", "Reese", "Skyler", "Casey", "Jesse", "Jamie", "Peyton", "Quinn", "Hayden", "Logan",
        "Rowan", "Emerson", "Finley", "Elliot", "Kai", "Sage", "River", "Remy", "Shiloh", "Rory"
    ];

    function randInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    function randChoice(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    function reserveSeat(key) {
        if (seatReservations.has(key)) return false;
        seatReservations.add(key);
        return true;
    }

    function releaseSeat(key) {
        seatReservations.delete(key);
    }

    function initAgentPool() {
        agents.length = 0;

        // Collect desks across office floors 1..5
        const allDesks = [];
        for (let f = 1; f < world.floors.length; f++) {
            const fl = world.floors[f];
            fl.desks.forEach(function(d) {
                allDesks.push({ floor: f, doorWp: d.doorWp, deskWp: d.deskWp });
            });
        }

        for (let i = 0; i < TOTAL_AGENTS; i++) {
            const isWorker = i < MAX_WORKERS;
            const name = randChoice(FIRST_NAMES) + "_" + (i + 1);

            let homeFloor = null;
            let deskWpName = null;
            let deskDoorWpName = null;

            if (isWorker && i < allDesks.length) {
                const dInfo = allDesks[i];
                homeFloor = dInfo.floor;
                deskWpName = dInfo.deskWp;
                deskDoorWpName = dInfo.doorWp;
            }

            const group = window.createPerson();
            group.visible = false;
            scene.add(group);

            const agent = {
                id: i,
                role: isWorker ? "WORKER" : "VISITOR",
                name: name,
                group: group,
                homeFloor: homeFloor,
                deskWpName: deskWpName,
                deskDoorWpName: deskDoorWpName,
                currentFloor: 0,
                currentWp: "outside",
                state: "AWAY",
                plan: [],
                currentAction: null,
                hasLunched: false,
                arrivalTime: 0,
                lunchTime: 0,
                lunchDuration: 0,
                departureTime: 0,
                plannedMeetingTimes: [],
                reservedSeats: [],
                // Motion stall tracking
                _prevPos: new THREE.Vector3(),
                _stallT: 0
            };

            randomizeAgentSchedule(agent);
            agents.push(agent);
        }

        applyOccupancy();
    }

    function randomizeAgentSchedule(agent) {
        if (agent.role === "WORKER") {
            agent.arrivalTime = randInt(8 * 60 + 15, 9 * 60 + 30);
            agent.lunchTime = randInt(11 * 60 + 30, 13 * 60 + 30);
            agent.lunchDuration = randInt(25, 60);

            if (Math.random() < 0.15) {
                agent.departureTime = randInt(18 * 60 + 30, 19 * 60 + 45); // Straggler
            } else {
                agent.departureTime = randInt(16 * 60 + 45, 18 * 60 + 30);
            }

            agent.plannedMeetingTimes = [];
            if (Math.random() < 0.6) {
                agent.plannedMeetingTimes.push(randInt(10 * 60, 11 * 60 + 15));
            }
            if (Math.random() < 0.6) {
                agent.plannedMeetingTimes.push(randInt(14 * 60, 16 * 60));
            }
        } else {
            // Visitor schedule
            agent.arrivalTime = Clock.simMinute + randInt(0, 6);
            agent.departureTime = agent.arrivalTime + randInt(30, 120);
            agent.plannedMeetingTimes = [];
        }

        agent.hasLunched = false;
    }

    function applyOccupancy() {
        for (let i = 0; i < agents.length; i++) {
            const agent = agents[i];
            if (i < targetOccupancy) {
                if (agent.state === "DISABLED") {
                    agent.state = "AWAY";
                }
            } else {
                if (agent.state === "AWAY" || agent.state === "GONE") {
                    agent.state = "DISABLED";
                    agent.group.visible = false;
                }
            }
        }
    }

    function countPresent() {
        let count = 0;
        for (let i = 0; i < agents.length; i++) {
            const st = agents[i].state;
            if (st !== "AWAY" && st !== "DISABLED" && st !== "GONE") {
                count++;
            }
        }
        return count;
    }

    function topUpVisitors() {
        // Only run during normal office hours (08:00 - 18:00)
        if (Clock.simMinute < 8 * 60 || Clock.simMinute > 18 * 60) return;

        const deficit = targetOccupancy - countPresent();
        if (deficit <= 0) return;

        let rearmed = 0;
        for (let i = 0; i < agents.length; i++) {
            const agent = agents[i];
            if (agent.id < targetOccupancy && agent.role === "VISITOR" && (agent.state === "AWAY" || agent.state === "GONE")) {
                agent.arrivalTime = Clock.simMinute + randInt(0, 5);
                agent.state = "AWAY";
                agent.plan = [];
                agent.currentAction = null;
                rearmed++;
                if (rearmed >= deficit) break;
            }
        }
    }

    function resetDay() {
        seatReservations.clear();
        elevator.reset();

        for (let i = 0; i < agents.length; i++) {
            const agent = agents[i];

            // Clean up scene parent
            if (agent.group.parent && agent.group.parent !== scene) {
                scene.add(agent.group);
            }
            agent.group.visible = false;
            agent.group.position.set(0, 0, 12);
            agent.group.userData.isSitting = false;
            agent.group.userData.isWalking = false;
            window.animatePersonWalking(agent.group, 0);

            agent.currentFloor = 0;
            agent.currentWp = "outside";
            agent.plan = [];
            agent.currentAction = null;
            agent.reservedSeats = [];

            randomizeAgentSchedule(agent);

            if (agent.id < targetOccupancy) {
                agent.state = "AWAY";
            } else {
                agent.state = "DISABLED";
            }
        }
    }

    // Plan Compilers
    function compilePlan(agent, actions) {
        agent.plan = actions;
        if (!agent.currentAction && agent.plan.length > 0) {
            agent.currentAction = agent.plan.shift();
            initAgentAction(agent, agent.currentAction);
        }
    }

    function planArriveToDesk(agent) {
        const actions = [
            { type: "ENTER_STATE", state: "ARRIVING" },
            { type: "WALK_TO_WP", floor: 0, wpName: "front_door_threshold" },
            { type: "WALK_TO_WP", floor: 0, wpName: "entrance" },
            { type: "WALK_TO_WP", floor: 0, wpName: "lobby_center" }
        ];

        if (agent.homeFloor !== 0) {
            actions.push(
                { type: "ENTER_STATE", state: "WAITING_ELEVATOR" },
                { type: "WAIT_AT_PANEL", floor: 0, dir: 1, toFloor: agent.homeFloor },
                { type: "ENTER_ELEVATOR", toFloor: agent.homeFloor },
                { type: "PRESS_FLOOR", floor: agent.homeFloor },
                { type: "WAIT_FOR_FLOOR", floor: agent.homeFloor },
                { type: "EXIT_ELEVATOR", toFloor: agent.homeFloor }
            );
        }

        actions.push(
            { type: "ENTER_STATE", state: "ON_FLOOR" },
            { type: "WALK_TO_WP", floor: agent.homeFloor, wpName: agent.deskDoorWpName },
            { type: "WALK_TO_WP", floor: agent.homeFloor, wpName: agent.deskWpName },
            { type: "ENTER_STATE", state: "AT_DESK" },
            { type: "SIT", floor: agent.homeFloor, wpName: agent.deskWpName },
            { type: "WAIT_SIM", minutes: randInt(25, 55) },
            { type: "PICK_NEXT_ACTIVITY" }
        );

        return actions;
    }

    function planGoToLunch(agent) {
        const actions = [
            { type: "STAND" },
            { type: "ENTER_STATE", state: "AT_LUNCH" },
            { type: "WALK_TO_WP", floor: agent.homeFloor, wpName: agent.deskDoorWpName },
            { type: "WALK_TO_WP", floor: agent.homeFloor, wpName: "elevWait" },
            { type: "WAIT_AT_PANEL", floor: agent.homeFloor, dir: -1, toFloor: 0 },
            { type: "ENTER_ELEVATOR", toFloor: 0 },
            { type: "PRESS_FLOOR", floor: 0 },
            { type: "WAIT_FOR_FLOOR", floor: 0 },
            { type: "EXIT_ELEVATOR", toFloor: 0 },
            { type: "WALK_TO_WP", floor: 0, wpName: "lobby_center" }
        ];

        // Pick an open bistro seat or cafe counter
        let bistroWp = null;
        for (let i = 0; i < 8; i++) {
            const seatName = "bistro_seat" + i;
            if (reserveSeat("0:" + seatName)) {
                bistroWp = seatName;
                agent.reservedSeats.push("0:" + seatName);
                break;
            }
        }

        if (bistroWp) {
            actions.push(
                { type: "WALK_TO_WP", floor: 0, wpName: bistroWp },
                { type: "SIT", floor: 0, wpName: bistroWp },
                { type: "WAIT_SIM", minutes: agent.lunchDuration },
                { type: "STAND" },
                { type: "RELEASE_SEAT" }
            );
        } else {
            actions.push(
                { type: "WALK_TO_WP", floor: 0, wpName: "cafe_order" },
                { type: "WAIT_SIM", minutes: agent.lunchDuration }
            );
        }

        actions.push(
            { type: "MARK_LUNCHED" },
            { type: "WALK_TO_WP", floor: 0, wpName: "lobby_center" },
            { type: "WAIT_AT_PANEL", floor: 0, dir: 1, toFloor: agent.homeFloor },
            { type: "ENTER_ELEVATOR", toFloor: agent.homeFloor },
            { type: "PRESS_FLOOR", floor: agent.homeFloor },
            { type: "WAIT_FOR_FLOOR", floor: agent.homeFloor },
            { type: "EXIT_ELEVATOR", toFloor: agent.homeFloor },
            { type: "WALK_TO_WP", floor: agent.homeFloor, wpName: agent.deskDoorWpName },
            { type: "WALK_TO_WP", floor: agent.homeFloor, wpName: agent.deskWpName },
            { type: "ENTER_STATE", state: "AT_DESK" },
            { type: "SIT", floor: agent.homeFloor, wpName: agent.deskWpName },
            { type: "WAIT_SIM", minutes: randInt(30, 60) },
            { type: "PICK_NEXT_ACTIVITY" }
        );

        return actions;
    }

    function planVisitLounge(agent) {
        const actions = [
            { type: "STAND" },
            { type: "ENTER_STATE", state: "AT_BREAK" },
            { type: "WALK_TO_WP", floor: agent.homeFloor, wpName: agent.deskDoorWpName },
            { type: "WALK_TO_WP", floor: agent.homeFloor, wpName: "lounge_spot0" },
            { type: "SIT", floor: agent.homeFloor, wpName: "lounge_spot0" },
            { type: "WAIT_SIM", minutes: randInt(8, 18) },
            { type: "STAND" },
            { type: "WALK_TO_WP", floor: agent.homeFloor, wpName: agent.deskDoorWpName },
            { type: "WALK_TO_WP", floor: agent.homeFloor, wpName: agent.deskWpName },
            { type: "ENTER_STATE", state: "AT_DESK" },
            { type: "SIT", floor: agent.homeFloor, wpName: agent.deskWpName },
            { type: "WAIT_SIM", minutes: randInt(20, 50) },
            { type: "PICK_NEXT_ACTIVITY" }
        ];

        return actions;
    }

    function planAttendMeeting(agent) {
        const meetingFloor = Math.random() < 0.65 ? agent.homeFloor : randInt(1, 5);

        // Find available conference seat
        let seatWp = null;
        for (let i = 0; i < 4; i++) {
            const sName = "conf_seat" + i;
            const key = meetingFloor + ":" + sName;
            if (reserveSeat(key)) {
                seatWp = sName;
                agent.reservedSeats.push(key);
                break;
            }
        }

        if (!seatWp) {
            // Fallback to lounge break if conf seats full
            return planVisitLounge(agent);
        }

        const actions = [
            { type: "STAND" },
            { type: "ENTER_STATE", state: "IN_MEETING" },
            { type: "WALK_TO_WP", floor: agent.homeFloor, wpName: agent.deskDoorWpName }
        ];

        if (meetingFloor !== agent.homeFloor) {
            const dir = meetingFloor > agent.homeFloor ? 1 : -1;
            actions.push(
                { type: "WALK_TO_WP", floor: agent.homeFloor, wpName: "elevWait" },
                { type: "WAIT_AT_PANEL", floor: agent.homeFloor, dir: dir, toFloor: meetingFloor },
                { type: "ENTER_ELEVATOR", toFloor: meetingFloor },
                { type: "PRESS_FLOOR", floor: meetingFloor },
                { type: "WAIT_FOR_FLOOR", floor: meetingFloor },
                { type: "EXIT_ELEVATOR", toFloor: meetingFloor }
            );
        }

        actions.push(
            { type: "WALK_TO_WP", floor: meetingFloor, wpName: "conf_door" },
            { type: "WALK_TO_WP", floor: meetingFloor, wpName: seatWp },
            { type: "SIT", floor: meetingFloor, wpName: seatWp },
            { type: "WAIT_SIM", minutes: randInt(22, 45) },
            { type: "STAND" },
            { type: "RELEASE_SEAT" }
        );

        if (meetingFloor !== agent.homeFloor) {
            const returnDir = agent.homeFloor > meetingFloor ? 1 : -1;
            actions.push(
                { type: "WALK_TO_WP", floor: meetingFloor, wpName: "elevWait" },
                { type: "WAIT_AT_PANEL", floor: meetingFloor, dir: returnDir, toFloor: agent.homeFloor },
                { type: "ENTER_ELEVATOR", toFloor: agent.homeFloor },
                { type: "PRESS_FLOOR", floor: agent.homeFloor },
                { type: "WAIT_FOR_FLOOR", floor: agent.homeFloor },
                { type: "EXIT_ELEVATOR", toFloor: agent.homeFloor }
            );
        }

        actions.push(
            { type: "WALK_TO_WP", floor: agent.homeFloor, wpName: agent.deskDoorWpName },
            { type: "WALK_TO_WP", floor: agent.homeFloor, wpName: agent.deskWpName },
            { type: "ENTER_STATE", state: "AT_DESK" },
            { type: "SIT", floor: agent.homeFloor, wpName: agent.deskWpName },
            { type: "WAIT_SIM", minutes: randInt(25, 55) },
            { type: "PICK_NEXT_ACTIVITY" }
        );

        return actions;
    }

    function planVisitCoworker(agent) {
        // Pick a random coworker currently at desk
        let coworker = null;
        for (let i = 0; i < agents.length; i++) {
            const other = agents[i];
            if (other.id !== agent.id && other.role === "WORKER" && other.state === "AT_DESK") {
                coworker = other;
                break;
            }
        }

        if (!coworker) return planVisitLounge(agent);

        const targetFloor = coworker.homeFloor;

        const actions = [
            { type: "STAND" },
            { type: "ENTER_STATE", state: "VISITING" },
            { type: "WALK_TO_WP", floor: agent.homeFloor, wpName: agent.deskDoorWpName }
        ];

        if (targetFloor !== agent.homeFloor) {
            const dir = targetFloor > agent.homeFloor ? 1 : -1;
            actions.push(
                { type: "WALK_TO_WP", floor: agent.homeFloor, wpName: "elevWait" },
                { type: "WAIT_AT_PANEL", floor: agent.homeFloor, dir: dir, toFloor: targetFloor },
                { type: "ENTER_ELEVATOR", toFloor: targetFloor },
                { type: "PRESS_FLOOR", floor: targetFloor },
                { type: "WAIT_FOR_FLOOR", floor: targetFloor },
                { type: "EXIT_ELEVATOR", toFloor: targetFloor }
            );
        }

        actions.push(
            { type: "WALK_TO_WP", floor: targetFloor, wpName: coworker.deskDoorWpName },
            { type: "WAIT_SIM", minutes: randInt(6, 18) }
        );

        if (targetFloor !== agent.homeFloor) {
            const returnDir = agent.homeFloor > targetFloor ? 1 : -1;
            actions.push(
                { type: "WALK_TO_WP", floor: targetFloor, wpName: "elevWait" },
                { type: "WAIT_AT_PANEL", floor: targetFloor, dir: returnDir, toFloor: agent.homeFloor },
                { type: "ENTER_ELEVATOR", toFloor: agent.homeFloor },
                { type: "PRESS_FLOOR", floor: agent.homeFloor },
                { type: "WAIT_FOR_FLOOR", floor: agent.homeFloor },
                { type: "EXIT_ELEVATOR", toFloor: agent.homeFloor }
            );
        }

        actions.push(
            { type: "WALK_TO_WP", floor: agent.homeFloor, wpName: agent.deskDoorWpName },
            { type: "WALK_TO_WP", floor: agent.homeFloor, wpName: agent.deskWpName },
            { type: "ENTER_STATE", state: "AT_DESK" },
            { type: "SIT", floor: agent.homeFloor, wpName: agent.deskWpName },
            { type: "WAIT_SIM", minutes: randInt(20, 50) },
            { type: "PICK_NEXT_ACTIVITY" }
        );

        return actions;
    }

    function planLeaveBuilding(agent) {
        const actions = [
            { type: "STAND" },
            { type: "RELEASE_SEAT" },
            { type: "ENTER_STATE", state: "LEAVING" }
        ];

        if (agent.currentFloor !== 0) {
            actions.push(
                { type: "WALK_TO_WP", floor: agent.currentFloor, wpName: "elevWait" },
                { type: "WAIT_AT_PANEL", floor: agent.currentFloor, dir: -1, toFloor: 0 },
                { type: "ENTER_ELEVATOR", toFloor: 0 },
                { type: "PRESS_FLOOR", floor: 0 },
                { type: "WAIT_FOR_FLOOR", floor: 0 },
                { type: "EXIT_ELEVATOR", toFloor: 0 }
            );
        }

        actions.push(
            { type: "WALK_TO_WP", floor: 0, wpName: "lobby_center" },
            { type: "WALK_TO_WP", floor: 0, wpName: "entrance" },
            { type: "WALK_TO_WP", floor: 0, wpName: "front_door_threshold" },
            { type: "WALK_TO_WP", floor: 0, wpName: "outside" },
            { type: "EXIT_BUILDING" }
        );

        return actions;
    }

    function planVisitorVisit(agent) {
        const actions = [
            { type: "ENTER_STATE", state: "ARRIVING" },
            { type: "WALK_TO_WP", floor: 0, wpName: "front_door_threshold" },
            { type: "WALK_TO_WP", floor: 0, wpName: "entrance" },
            { type: "WALK_TO_WP", floor: 0, wpName: "lobby_center" }
        ];

        const roll = Math.random();

        if (roll < 0.10) {
            // Bistro table
            let seat = null;
            for (let i = 0; i < 8; i++) {
                const sName = "bistro_seat" + i;
                if (reserveSeat("0:" + sName)) {
                    seat = sName;
                    agent.reservedSeats.push("0:" + sName);
                    break;
                }
            }
            if (seat) {
                actions.push(
                    { type: "ENTER_STATE", state: "AT_BREAK" },
                    { type: "WALK_TO_WP", floor: 0, wpName: seat },
                    { type: "SIT", floor: 0, wpName: seat },
                    { type: "WAIT_SIM", minutes: randInt(15, 35) },
                    { type: "STAND" },
                    { type: "RELEASE_SEAT" }
                );
            }
        } else if (roll < 0.16) {
            // Cafe counter
            actions.push(
                { type: "ENTER_STATE", state: "VISITING" },
                { type: "WALK_TO_WP", floor: 0, wpName: "cafe_order" },
                { type: "WAIT_SIM", minutes: randInt(5, 12) }
            );
        } else if (roll < 0.30) {
            // Front lounge
            actions.push(
                { type: "ENTER_STATE", state: "AT_BREAK" },
                { type: "WALK_TO_WP", floor: 0, wpName: "front_lounge_0" },
                { type: "SIT", floor: 0, wpName: "front_lounge_0" },
                { type: "WAIT_SIM", minutes: randInt(12, 25) },
                { type: "STAND" }
            );
        } else if (roll < 0.42) {
            // Back lounge
            actions.push(
                { type: "ENTER_STATE", state: "AT_BREAK" },
                { type: "WALK_TO_WP", floor: 0, wpName: "back_lounge_N" },
                { type: "SIT", floor: 0, wpName: "back_lounge_N" },
                { type: "WAIT_SIM", minutes: randInt(15, 30) },
                { type: "STAND" }
            );
        } else if (roll < 0.52) {
            // Reception / kiosk
            const wp = Math.random() < 0.5 ? "reception" : "kiosk";
            actions.push(
                { type: "ENTER_STATE", state: "VISITING" },
                { type: "WALK_TO_WP", floor: 0, wpName: wp },
                { type: "WAIT_SIM", minutes: randInt(5, 12) }
            );
        } else if (roll < 0.62) {
            // Lobby loiter
            const wp = randChoice(["lobby_stand_center", "lobby_stand_NE", "lobby_stand_NW", "lobby_stand_entry"]);
            actions.push(
                { type: "ENTER_STATE", state: "VISITING" },
                { type: "WALK_TO_WP", floor: 0, wpName: wp },
                { type: "SIT", floor: 0, wpName: wp },
                { type: "WAIT_SIM", minutes: randInt(8, 20) },
                { type: "STAND" }
            );
        } else if (roll < 0.77) {
            // Ride to office floor lounge
            const targetFloor = randInt(1, 5);
            actions.push(
                { type: "ENTER_STATE", state: "WAITING_ELEVATOR" },
                { type: "WAIT_AT_PANEL", floor: 0, dir: 1, toFloor: targetFloor },
                { type: "ENTER_ELEVATOR", toFloor: targetFloor },
                { type: "PRESS_FLOOR", floor: targetFloor },
                { type: "WAIT_FOR_FLOOR", floor: targetFloor },
                { type: "EXIT_ELEVATOR", toFloor: targetFloor },
                { type: "ENTER_STATE", state: "AT_BREAK" },
                { type: "WALK_TO_WP", floor: targetFloor, wpName: "lounge_spot0" },
                { type: "SIT", floor: targetFloor, wpName: "lounge_spot0" },
                { type: "WAIT_SIM", minutes: randInt(12, 25) },
                { type: "STAND" },
                { type: "WALK_TO_WP", floor: targetFloor, wpName: "elevWait" },
                { type: "WAIT_AT_PANEL", floor: targetFloor, dir: -1, toFloor: 0 },
                { type: "ENTER_ELEVATOR", toFloor: 0 },
                { type: "PRESS_FLOOR", floor: 0 },
                { type: "WAIT_FOR_FLOOR", floor: 0 },
                { type: "EXIT_ELEVATOR", toFloor: 0 }
            );
        } else {
            // Sit in on a meeting (client / guest)
            const targetFloor = randInt(1, 5);
            let seat = null;
            for (let i = 0; i < 4; i++) {
                const sName = "conf_seat" + i;
                const key = targetFloor + ":" + sName;
                if (reserveSeat(key)) {
                    seat = sName;
                    agent.reservedSeats.push(key);
                    break;
                }
            }

            if (seat) {
                actions.push(
                    { type: "ENTER_STATE", state: "WAITING_ELEVATOR" },
                    { type: "WAIT_AT_PANEL", floor: 0, dir: 1, toFloor: targetFloor },
                    { type: "ENTER_ELEVATOR", toFloor: targetFloor },
                    { type: "PRESS_FLOOR", floor: targetFloor },
                    { type: "WAIT_FOR_FLOOR", floor: targetFloor },
                    { type: "EXIT_ELEVATOR", toFloor: targetFloor },
                    { type: "ENTER_STATE", state: "IN_MEETING" },
                    { type: "WALK_TO_WP", floor: targetFloor, wpName: "conf_door" },
                    { type: "WALK_TO_WP", floor: targetFloor, wpName: seat },
                    { type: "SIT", floor: targetFloor, wpName: seat },
                    { type: "WAIT_SIM", minutes: randInt(20, 40) },
                    { type: "STAND" },
                    { type: "RELEASE_SEAT" },
                    { type: "WALK_TO_WP", floor: targetFloor, wpName: "elevWait" },
                    { type: "WAIT_AT_PANEL", floor: targetFloor, dir: -1, toFloor: 0 },
                    { type: "ENTER_ELEVATOR", toFloor: 0 },
                    { type: "PRESS_FLOOR", floor: 0 },
                    { type: "WAIT_FOR_FLOOR", floor: 0 },
                    { type: "EXIT_ELEVATOR", toFloor: 0 }
                );
            }
        }

        actions.push(
            { type: "ENTER_STATE", state: "LEAVING" },
            { type: "WALK_TO_WP", floor: 0, wpName: "lobby_center" },
            { type: "WALK_TO_WP", floor: 0, wpName: "entrance" },
            { type: "WALK_TO_WP", floor: 0, wpName: "front_door_threshold" },
            { type: "WALK_TO_WP", floor: 0, wpName: "outside" },
            { type: "EXIT_BUILDING" }
        );

        return actions;
    }

    function chooseNextActivity(agent) {
        if (agent.role === "VISITOR") {
            compilePlan(agent, planVisitorVisit(agent));
            return;
        }

        // Worker decisions
        if (Clock.simMinute >= agent.departureTime) {
            compilePlan(agent, planLeaveBuilding(agent));
            return;
        }

        if (agent.plannedMeetingTimes.length > 0 && Clock.simMinute >= agent.plannedMeetingTimes[0]) {
            agent.plannedMeetingTimes.shift();
            compilePlan(agent, planAttendMeeting(agent));
            return;
        }

        if (!agent.hasLunched && Clock.simMinute >= agent.lunchTime) {
            compilePlan(agent, planGoToLunch(agent));
            return;
        }

        // Weighted random choices during workday
        const roll = Math.random();
        if (roll < 0.14) {
            compilePlan(agent, planAttendMeeting(agent)); // Ad-hoc meeting
        } else if (roll < 0.26) {
            compilePlan(agent, planVisitLounge(agent));
        } else if (roll < 0.41) {
            compilePlan(agent, planVisitCoworker(agent));
        } else {
            // Keep working at desk
            compilePlan(agent, [
                { type: "WAIT_SIM", minutes: randInt(18, 50) },
                { type: "PICK_NEXT_ACTIVITY" }
            ]);
        }
    }

    // Action Execution & Dispatch
    function initAgentAction(agent, action) {
        if (!action) return;

        if (action.type === "WALK_TO_WP") {
            const fl = world.floors[action.floor];
            const targetPos = fl.nodes[action.wpName].pos;
            const path = world.bfsPath(fl.nodes, agent.currentWp, action.wpName);
            action._path = path;
            action._pathIdx = 0;
            action._targetPos = targetPos;
            agent.group.userData.isWalking = true;
            agent._stallT = 0;
            agent._prevPos.copy(agent.group.position);
        } else if (action.type === "WAIT_SIM") {
            action.untilMin = Clock.simMinute + action.minutes;
        } else if (action.type === "ENTER_ELEVATOR") {
            action.phase = "RESERVE"; // RESERVE -> WALK_DOOR -> IN_CAR -> COMPLETE
            agent._stallT = 0;
            agent._prevPos.copy(agent.group.position);
        } else if (action.type === "EXIT_ELEVATOR") {
            action.phase = "REPARENT"; // REPARENT -> WALK_WAIT -> COMPLETE
        }
    }

    function updateAgentAction(agent, motionDt) {
        const action = agent.currentAction;
        if (!action) return true;

        if (action.type === "ENTER_STATE") {
            agent.state = action.state;
            return true;
        }

        if (action.type === "MARK_LUNCHED") {
            agent.hasLunched = true;
            return true;
        }

        if (action.type === "PICK_NEXT_ACTIVITY") {
            chooseNextActivity(agent);
            return false; // Replanned, continue dispatch
        }

        if (action.type === "RELEASE_SEAT") {
            agent.reservedSeats.forEach(releaseSeat);
            agent.reservedSeats = [];
            return true;
        }

        if (action.type === "STAND") {
            agent.group.userData.isSitting = false;
            if (agent.group.parent === scene) {
                agent.group.position.y = agent.currentFloor * window.WORLD.FLOOR_HEIGHT;
            } else {
                agent.group.position.y = 0;
            }
            return true;
        }

        if (action.type === "SIT") {
            const fl = world.floors[action.floor];
            const targetInfo = fl.sitTargets[action.wpName] || { sit: false, facing: 0 };
            const nodePos = fl.nodes[action.wpName].pos;

            agent.group.position.set(nodePos.x, nodePos.y, nodePos.z);
            agent.group.rotation.y = targetInfo.facing;
            agent.group.userData.isSitting = true;
            agent.group.userData.isWalking = false;

            if (targetInfo.sit) {
                // Lower body height by ~0.35 so hips align with chair seat
                agent.group.position.y = nodePos.y - 0.35;
            } else {
                // Standing waypoint jitter ring (radius 0.35-0.75) to prevent exact overlaps
                const angle = (agent.id * 1.37) % (Math.PI * 2);
                const radius = 0.35 + (agent.id % 5) * 0.08;
                agent.group.position.x += Math.cos(angle) * radius;
                agent.group.position.z += Math.sin(angle) * radius;
            }
            return true;
        }

        if (action.type === "WAIT_SIM") {
            return Clock.simMinute >= action.untilMin;
        }

        if (action.type === "WALK_TO_WP") {
            if (!action._path || action._path.length === 0) {
                agent.currentWp = action.wpName;
                agent.group.userData.isWalking = false;
                return true;
            }

            const targetPt = action._path[action._pathIdx];
            const pos = agent.group.position;
            const dx = targetPt.x - pos.x;
            const dz = targetPt.z - pos.z;
            const dist = Math.sqrt(dx * dx + dz * dz);

            const speed = 1.35 * motionDt;

            if (dist <= speed || dist < 0.08) {
                pos.x = targetPt.x;
                pos.z = targetPt.z;
                action._pathIdx++;
                agent._stallT = 0;
                if (action._pathIdx >= action._path.length) {
                    agent.currentWp = action.wpName;
                    agent.group.userData.isWalking = false;
                    return true;
                }
            } else {
                pos.x += (dx / dist) * speed;
                pos.z += (dz / dist) * speed;
                agent.group.rotation.y = Math.atan2(dx, dz);
                agent.group.userData.isWalking = true;

                // Stall detection
                const stepMoved = pos.distanceTo(agent._prevPos);
                if (stepMoved < 0.005) {
                    agent._stallT += motionDt;
                    if (agent._stallT > 1.2) { // Skip stalled waypoint
                        action._pathIdx++;
                        agent._stallT = 0;
                        if (action._pathIdx >= action._path.length) {
                            agent.currentWp = action.wpName;
                            agent.group.userData.isWalking = false;
                            return true;
                        }
                    }
                } else {
                    agent._stallT = 0;
                }
                agent._prevPos.copy(pos);
            }
            return false;
        }

        if (action.type === "WAIT_AT_PANEL") {
            agent.group.userData.isWalking = false;
            // Continuously press hall call while waiting
            if (action.dir > 0) {
                elevator.callUp(action.floor);
            } else {
                elevator.callDown(action.floor);
            }

            return elevator.isAcceptingAt(action.floor, action.dir);
        }

        if (action.type === "ENTER_ELEVATOR") {
            if (action.phase === "RESERVE") {
                const spot = elevator.reserveBoardingSpot(agent);
                if (!spot) {
                    // Car full/slipped away, re-press panel call
                    if (action.toFloor > agent.currentFloor) elevator.callUp(agent.currentFloor);
                    else elevator.callDown(agent.currentFloor);
                    return false;
                }
                action.spot = spot;
                action.phase = "WALK_DOOR";
                agent.group.userData.isWalking = true;
            }

            if (action.phase === "WALK_DOOR") {
                const pos = agent.group.position;
                // Target door threshold matching boarder spot X lane
                const targetX = action.spot.x;
                const targetZ = 1.6;
                const dx = targetX - pos.x;
                const dz = targetZ - pos.z;
                const dist = Math.sqrt(dx * dx + dz * dz);
                const speed = 1.35 * motionDt;

                if (dist <= speed || dist < 0.1) {
                    // Reparent into car group
                    elevator.carGroup.add(agent.group);
                    pos.set(action.spot.x, 0, 1.4); // Car local threshold
                    action.phase = "IN_CAR";
                } else {
                    pos.x += (dx / dist) * speed;
                    pos.z += (dz / dist) * speed;
                    agent.group.rotation.y = Math.atan2(dx, dz);

                    const stepMoved = pos.distanceTo(agent._prevPos);
                    if (stepMoved < 0.005) {
                        agent._stallT += motionDt;
                        if (agent._stallT > 1.5) { // Force snap if blocked in lobby crowd
                            elevator.carGroup.add(agent.group);
                            pos.set(action.spot.x, 0, 1.4);
                            action.phase = "IN_CAR";
                        }
                    } else {
                        agent._stallT = 0;
                    }
                    agent._prevPos.copy(pos);
                }
                return false;
            }

            if (action.phase === "IN_CAR") {
                const pos = agent.group.position;
                const dx = action.spot.x - pos.x;
                const dz = action.spot.z - pos.z;
                const dist = Math.sqrt(dx * dx + dz * dz);
                const speed = 1.35 * motionDt;

                if (dist <= speed || dist < 0.08) {
                    pos.set(action.spot.x, 0, action.spot.z);
                    agent.group.rotation.y = 0; // Face elevator doors (+Z)
                    agent.group.userData.isWalking = false;
                    elevator.completeBoard(agent);
                    agent.state = "IN_CAR";
                    return true;
                } else {
                    pos.x += (dx / dist) * speed;
                    pos.z += (dz / dist) * speed;
                    agent.group.rotation.y = Math.atan2(dx, dz);
                    return false;
                }
            }
        }

        if (action.type === "PRESS_FLOOR") {
            elevator.pressDestination(action.floor);
            return true;
        }

        if (action.type === "WAIT_FOR_FLOOR") {
            return (elevator.currentFloor === action.floor && elevator.state === "DOOR_OPEN");
        }

        if (action.type === "EXIT_ELEVATOR") {
            if (action.phase === "REPARENT") {
                elevator.registerDisembark(agent);
                // World position offset when leaving car
                const worldY = action.toFloor * window.WORLD.FLOOR_HEIGHT;
                scene.add(agent.group);
                agent.group.position.set(action.spot ? action.spot.x : 0, worldY, 1.5);
                agent.currentFloor = action.toFloor;
                action.phase = "WALK_WAIT";
                agent.group.userData.isWalking = true;
            }

            if (action.phase === "WALK_WAIT") {
                const pos = agent.group.position;
                const targetPt = world.floors[action.toFloor].nodes["elevWait"].pos;
                const dx = targetPt.x - pos.x;
                const dz = targetPt.z - pos.z;
                const dist = Math.sqrt(dx * dx + dz * dz);
                const speed = 1.35 * motionDt;

                if (dist <= speed || dist < 0.08) {
                    pos.set(targetPt.x, targetPt.y, targetPt.z);
                    agent.currentWp = "elevWait";
                    agent.group.userData.isWalking = false;
                    elevator.completeDisembark(agent);
                    agent.state = "ON_FLOOR";
                    return true;
                } else {
                    pos.x += (dx / dist) * speed;
                    pos.z += (dz / dist) * speed;
                    agent.group.rotation.y = Math.atan2(dx, dz);
                    return false;
                }
            }
        }

        if (action.type === "EXIT_BUILDING") {
            agent.state = "GONE";
            agent.group.visible = false;
            agent.group.userData.isWalking = false;
            return true;
        }

        return true;
    }

    function dispatchAgent(agent, motionDt) {
        if (agent.state === "DISABLED") {
            agent.group.visible = false;
            return;
        }

        if (agent.state === "AWAY") {
            agent.group.visible = false;
            if (Clock.simMinute >= agent.arrivalTime) {
                // Spawn on sidewalk
                const jitterX = (Math.random() - 0.5) * 2.2;
                const jitterZ = (Math.random() - 0.5) * 1.5;
                agent.group.position.set(jitterX, 0, 12 + jitterZ);
                agent.group.rotation.y = Math.PI; // Facing building (-Z)
                agent.group.visible = true;
                agent.currentWp = "outside";

                if (agent.role === "WORKER") {
                    compilePlan(agent, planArriveToDesk(agent));
                } else {
                    compilePlan(agent, planVisitorVisit(agent));
                }
            }
            return;
        }

        if (agent.state === "GONE") {
            agent.group.visible = false;
            return;
        }

        agent.group.visible = true;

        // Auto departure check for workers
        if (agent.role === "WORKER" && Clock.simMinute >= agent.departureTime && agent.state !== "LEAVING") {
            compilePlan(agent, planLeaveBuilding(agent));
        }

        // Multi-step action loop per frame
        let loopGuard = 0;
        while (agent.currentAction && loopGuard < 16) {
            loopGuard++;
            const finished = updateAgentAction(agent, motionDt);
            if (finished) {
                if (agent.plan.length > 0) {
                    agent.currentAction = agent.plan.shift();
                    initAgentAction(agent, agent.currentAction);
                } else {
                    agent.currentAction = null;
                    break;
                }
            } else {
                break;
            }
        }
    }

    function applyCollisions() {
        for (let i = 0; i < agents.length; i++) {
            const a1 = agents[i];
            if (!a1.group.visible || a1.state === "DISABLED" || a1.group.userData.isSitting) continue;
            if (a1.group.parent !== scene) continue; // Skip agents parented to elevator
            if (a1.currentAction && a1.currentAction.type === "ENTER_ELEVATOR") continue; // Boarder crowd exemption

            const p1 = a1.group.position;

            for (let j = i + 1; j < agents.length; j++) {
                const a2 = agents[j];
                if (!a2.group.visible || a2.state === "DISABLED" || a2.group.userData.isSitting) continue;
                if (a2.group.parent !== scene) continue;
                if (a2.currentAction && a2.currentAction.type === "ENTER_ELEVATOR") continue;

                const p2 = a2.group.position;

                // Only collide if on same floor level
                if (Math.abs(p1.y - p2.y) > 1.0) continue;

                const dx = p1.x - p2.x;
                const dz = p1.z - p2.z;
                const distSq = dx * dx + dz * dz;

                const minDist = window.WORLD.PERSON_R * 2.0; // 0.8m
                if (distSq < minDist * minDist) {
                    let dist = Math.sqrt(distSq);
                    let nx = dx, nz = dz;

                    if (dist < 0.001) {
                        // Exact overlap fallback
                        const randAngle = Math.random() * Math.PI * 2;
                        nx = Math.cos(randAngle);
                        nz = Math.sin(randAngle);
                        dist = 0.01;
                    } else {
                        nx /= dist;
                        nz /= dist;
                    }

                    const overlap = (minDist - dist) * 0.18; // Soft push scalar

                    p1.x += nx * overlap;
                    p1.z += nz * overlap;
                    p2.x -= nx * overlap;
                    p2.z -= nz * overlap;
                }
            }
        }
    }

    function updateLighting() {
        if (!scene || !scene.background) return;

        // Keyframe interpolation for daylight
        const m = Clock.simMinute;
        let dayRatio = 1.0;

        if (m < 5.5 * 60 || m > 19.5 * 60) {
            dayRatio = 0.05; // Night
        } else if (m >= 5.5 * 60 && m < 6.5 * 60) {
            dayRatio = (m - 5.5 * 60) / 60; // Dawn ramp
        } else if (m >= 17.5 * 60 && m <= 19.5 * 60) {
            dayRatio = 1.0 - (m - 17.5 * 60) / (2 * 60); // Dusk ramp
        }

        const skyNight = new THREE.Color(0x10121a);
        const skyDay = new THREE.Color(0x283244);
        scene.background.lerpColors(skyNight, skyDay, dayRatio);

        // Find sun and ambient lights
        scene.children.forEach(function(child) {
            if (child.isDirectionalLight) {
                child.intensity = 0.2 + dayRatio * 0.7;
            } else if (child.isAmbientLight) {
                child.intensity = 0.45 + dayRatio * 0.15; // Night ambient stays ~0.45
            } else if (child.isHemisphereLight) {
                child.intensity = 0.32 + dayRatio * 0.18;
            }
        });
    }

    function createUI() {
        const hud = document.createElement("div");
        hud.id = "hud_panel";
        hud.style.position = "absolute";
        hud.style.top = "10px";
        hud.style.left = "10px";
        hud.style.padding = "12px 16px";
        hud.style.background = "rgba(15, 18, 25, 0.85)";
        hud.style.color = "#ffffff";
        hud.style.fontFamily = "sans-serif";
        hud.style.fontSize = "13px";
        hud.style.borderRadius = "8px";
        hud.style.boxShadow = "0 4px 12px rgba(0,0,0,0.5)";
        hud.style.pointerEvents = "auto";
        hud.style.zIndex = "1000";

        hud.innerHTML = `
            <div id="hud_time" style="font-size: 22px; font-weight: bold; color: #ffbb22; margin-bottom: 8px;"> 7:30 AM</div>
            <div style="margin-bottom: 8px;">
                <label>Speed: <span id="speed_val">120x</span></label><br/>
                <input id="speed_slider" type="range" min="0" max="100" value="50" style="width:160px;"/>
            </div>
            <div style="margin-bottom: 8px;">
                <label>Occupancy: <span id="occ_val">45</span> / 100</label><br/>
                <input id="occ_slider" type="range" min="1" max="100" value="45" style="width:160px;"/>
            </div>
            <div id="hud_stats" style="font-size: 11px; color: #aabbcc; line-height: 1.4;"></div>
        `;

        document.body.appendChild(hud);

        const speedSlider = document.getElementById("speed_slider");
        const speedVal = document.getElementById("speed_val");
        speedSlider.addEventListener("input", function() {
            // Log spaced 1x to 600x
            const v = parseFloat(speedSlider.value) / 100;
            const scale = Math.round(Math.pow(600, v));
            Clock.timeScale = scale;
            speedVal.textContent = scale + "x";
        });

        const occSlider = document.getElementById("occ_slider");
        const occVal = document.getElementById("occ_val");
        occSlider.addEventListener("input", function() {
            targetOccupancy = parseInt(occSlider.value, 10);
            occVal.textContent = String(targetOccupancy);
            applyOccupancy();
        });
    }

    function updateHUD() {
        const timeDiv = document.getElementById("hud_time");
        if (timeDiv) timeDiv.textContent = Clock.format();

        const statsDiv = document.getElementById("hud_stats");
        if (!statsDiv) return;

        let counts = {};
        let activeTotal = 0;
        agents.forEach(function(a) {
            if (a.state !== "DISABLED" && a.state !== "AWAY" && a.state !== "GONE") {
                counts[a.state] = (counts[a.state] || 0) + 1;
                activeTotal++;
            }
        });

        let breakdown = [];
        for (let k in counts) {
            breakdown.push(k + ": " + counts[k]);
        }

        const eState = elevator.state;
        const eFloor = elevator.currentFloor;
        const eDir = elevator.direction > 0 ? "^" : (elevator.direction < 0 ? "v" : "-");
        const eRiders = elevator.passengers.size;

        statsDiv.innerHTML = `
            <strong>Present Agents: ${activeTotal}</strong><br/>
            ${breakdown.join(" | ") || "All away"}<br/>
            <hr style="border:0; border-top:1px solid #445566; margin: 4px 0;"/>
            <strong>Elevator:</strong> Floor ${eFloor} (${eDir}) [${eState}]<br/>
            Passengers: ${eRiders} / 4
        `;
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
        controls.target.set(0, 10, 0);

        scene.add(new THREE.AmbientLight(0xffffff, 0.45));
        scene.add(new THREE.HemisphereLight(0xbfd7ff, 0x303020, 0.45));
        const sun = new THREE.DirectionalLight(0xffffff, 0.9);
        sun.position.set(20, 35, 18);
        scene.add(sun);

        world = window.createWorld(scene);
        elevator = new window.Elevator(scene, world);

        initAgentPool();
        createUI();

        let lastTime = performance.now();

        function animate(now) {
            requestAnimationFrame(animate);

            const realDt = Math.min(0.05, (now - lastTime) / 1000);
            lastTime = now;

            Clock.tick(realDt);
            updateLighting();

            const motionDt = realDt * Clock.timeScale;

            elevator.tick(motionDt);
            topUpVisitors();

            for (let i = 0; i < agents.length; i++) {
                const agent = agents[i];
                dispatchAgent(agent, motionDt);
                window.animatePersonWalking(agent.group, motionDt);
            }

            applyCollisions();

            controls.update();
            renderer.render(scene, camera);
            updateHUD();
        }

        window.addEventListener("resize", function() {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        });

        animate(performance.now());
    }

    if (document.readyState === "loading") {
        window.addEventListener("DOMContentLoaded", startSimulation);
    } else {
        startSimulation();
    }
})();
