/**
 * sim.js
 * Master simulation controller: simulated clock, day/night lighting, agent state machine,
 * schedule generator, goal-plan compilers, render loop, collision avoidance, and interactive HUD.
 * Auto-starts on DOMContentLoaded.
 */
(function() {
    "use strict";

    // Global simulation state
    let scene = null;
    let camera = null;
    let renderer = null;
    let controls = null;
    let world = null;
    let elevator = null;

    let ambientLight = null;
    let hemiLight = null;
    let dirLight = null;

    const MAX_WORKERS = 20;
    const MAX_VISITORS = 80;
    const MAX_OCCUPANCY = 100;
    let targetOccupancy = 45;

    const agents = [];
    const seatReservations = new Set(); // Keyed by "floor:wpName"

    const FIRST_NAMES = [
        "Alex", "Jordan", "Taylor", "Morgan", "Sam", "Chris", "Pat", "Riley",
        "Casey", "Jamie", "Avery", "Logan", "Parker", "Quinn", "Cameron", "Dakota",
        "Reese", "Skyler", "Rowan", "Kendall", "Hayden", "Emerson", "Finley", "Harper",
        "Kai", "Micah", "Peyton", "Sawyer", "Charlie", "Elliot", "Robin", "Jesse",
        "Dana", "Drew", "Eden", "Frankie", "Harley", "Justice", "Lee", "Marion"
    ];

    function pickRandom(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    function randInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    function randFloat(min, max) {
        return Math.random() * (max - min) + min;
    }

    // Simulated Clock
    const Clock = {
        simMinute: 7 * 60 + 30, // 07:30
        timeScale: 120, // 120x realtime default

        tick: function(realDt) {
            this.simMinute += (realDt * this.timeScale) / 60;
            if (this.simMinute >= 24 * 60) {
                this.simMinute -= 24 * 60;
                onDayWrap();
            }
        },

        format: function() {
            let totalMins = Math.floor(this.simMinute) % (24 * 60);
            if (totalMins < 0) totalMins += 24 * 60;
            let hours = Math.floor(totalMins / 60);
            const mins = totalMins % 60;
            const ampm = hours >= 12 ? "PM" : "AM";
            let displayHours = hours % 12;
            if (displayHours === 0) displayHours = 12;
            const padMins = mins < 10 ? `0${mins}` : `${mins}`;
            return `${displayHours}:${padMins} ${ampm}`;
        }
    };

    // Day / Night Lighting Curve
    function updateDayNightLighting() {
        const hour = (Clock.simMinute / 60) % 24;

        // Keyframes: [hour, bgHex, sunHex, sunInt, ambInt, hemiInt]
        const keyframes = [
            [0, 0x0c1017, 0x223355, 0.05, 0.45, 0.32],
            [5.5, 0x121824, 0xff6633, 0.2, 0.45, 0.32],
            [6.25, 0x3b4d66, 0xffaa44, 0.8, 0.55, 0.42],
            [7.0, 0x6888aa, 0xfff5e6, 1.0, 0.65, 0.5],
            [12.0, 0x87b0db, 0xffffff, 1.1, 0.7, 0.55],
            [17.0, 0x87a8cb, 0xffeedd, 1.0, 0.68, 0.52],
            [18.0, 0x5c4048, 0xff6622, 0.8, 0.55, 0.42],
            [19.0, 0x1e202f, 0x443366, 0.2, 0.48, 0.35],
            [21.0, 0x0c1017, 0x223355, 0.05, 0.45, 0.32],
            [24.0, 0x0c1017, 0x223355, 0.05, 0.45, 0.32]
        ];

        let k1 = keyframes[0];
        let k2 = keyframes[1];
        for (let i = 0; i < keyframes.length - 1; i++) {
            if (hour >= keyframes[i][0] && hour <= keyframes[i + 1][0]) {
                k1 = keyframes[i];
                k2 = keyframes[i + 1];
                break;
            }
        }

        const span = k2[0] - k1[0];
        const t = span > 0 ? (hour - k1[0]) / span : 0;

        const cBg1 = new THREE.Color(k1[1]);
        const cBg2 = new THREE.Color(k2[1]);
        scene.background = cBg1.clone().lerp(cBg2, t);

        const cSun1 = new THREE.Color(k1[2]);
        const cSun2 = new THREE.Color(k2[2]);
        dirLight.color = cSun1.clone().lerp(cSun2, t);
        dirLight.intensity = k1[3] + (k2[3] - k1[3]) * t;

        ambientLight.intensity = k1[4] + (k2[4] - k1[4]) * t;
        hemiLight.intensity = k1[5] + (k2[5] - k1[5]) * t;
    }

    // Schedule Generator
    function createWorkerSchedule() {
        const arrival = randInt(8 * 60 + 15, 9 * 60 + 30); // 8:15 - 9:30
        const lunch = randInt(11 * 60 + 30, 13 * 60 + 30); // 11:30 - 13:30
        const lunchDur = randInt(25, 55);

        // 15% straggler chance
        const isStraggler = Math.random() < 0.15;
        const departure = isStraggler
            ? randInt(18 * 60 + 30, 19 * 60 + 45) // 18:30 - 19:45
            : randInt(16 * 60 + 45, 18 * 60 + 30); // 16:45 - 18:30

        const meetings = [];
        if (Math.random() < 0.5) {
            meetings.push(randInt(10 * 60, 11 * 60 + 15));
        }
        if (Math.random() < 0.5) {
            meetings.push(randInt(14 * 60, 15 * 60 + 30));
        }

        return {
            arrivalTime: arrival,
            lunchTime: lunch,
            lunchDuration: lunchDur,
            departureTime: departure,
            plannedMeetingTimes: meetings,
            hasLunched: false
        };
    }

    function createVisitorSchedule(nowMin) {
        const offset = randInt(0, 6);
        return {
            arrivalTime: (nowMin || Clock.simMinute) + offset,
            visitDuration: randInt(15, 45),
            activityType: null
        };
    }

    // Seat reservation helpers
    function reserveConfSeat(floor) {
        for (let i = 0; i < 4; i++) {
            const wp = `conf_seat${i}`;
            const key = `${floor}:${wp}`;
            if (!seatReservations.has(key)) {
                seatReservations.add(key);
                return wp;
            }
        }
        return null;
    }

    function releaseSeat(floor, wpName) {
        seatReservations.delete(`${floor}:${wpName}`);
    }

    // Plan Compilers
    function planArriveToDesk(agent) {
        const actions = [];
        actions.push({ type: "WALK_TO_WP", floor: 0, wpName: "front_door_threshold" });
        actions.push({ type: "WALK_TO_WP", floor: 0, wpName: "entrance" });
        actions.push({ type: "WALK_TO_WP", floor: 0, wpName: "lobby_center" });

        if (agent.homeFloor > 0) {
            actions.push({ type: "WALK_TO_WP", floor: 0, wpName: "elevWait" });
            actions.push({ type: "WAIT_AT_PANEL", floor: 0, dir: 1, toFloor: agent.homeFloor });
            actions.push({ type: "ENTER_ELEVATOR", toFloor: agent.homeFloor });
            actions.push({ type: "PRESS_FLOOR", floor: agent.homeFloor });
            actions.push({ type: "WAIT_FOR_FLOOR", floor: agent.homeFloor });
            actions.push({ type: "EXIT_ELEVATOR", toFloor: agent.homeFloor });
        }

        actions.push({ type: "WALK_TO_WP", floor: agent.homeFloor, wpName: agent.deskDoorWpName });
        actions.push({ type: "WALK_TO_WP", floor: agent.homeFloor, wpName: agent.deskWpName });
        actions.push({ type: "SIT", floor: agent.homeFloor, wpName: agent.deskWpName });
        actions.push({ type: "ENTER_STATE", state: "AT_DESK" });
        actions.push({ type: "WAIT_SIM", minutes: randInt(25, 60) });
        actions.push({ type: "PICK_NEXT_ACTIVITY" });

        return actions;
    }

    function planGoToLunch(agent) {
        const actions = [];
        actions.push({ type: "STAND" });
        actions.push({ type: "WALK_TO_WP", floor: agent.currentFloor, wpName: agent.deskDoorWpName || "hallS" });

        if (agent.currentFloor > 0) {
            actions.push({ type: "WALK_TO_WP", floor: agent.currentFloor, wpName: "elevWait" });
            actions.push({ type: "WAIT_AT_PANEL", floor: agent.currentFloor, dir: -1, toFloor: 0 });
            actions.push({ type: "ENTER_ELEVATOR", toFloor: 0 });
            actions.push({ type: "PRESS_FLOOR", floor: 0 });
            actions.push({ type: "WAIT_FOR_FLOOR", floor: 0 });
            actions.push({ type: "EXIT_ELEVATOR", toFloor: 0 });
        }

        actions.push({ type: "ENTER_STATE", state: "AT_LUNCH" });
        const bistroSeat = `bistro_seat${randInt(0, 7)}`;
        actions.push({ type: "WALK_TO_WP", floor: 0, wpName: bistroSeat });
        actions.push({ type: "SIT", floor: 0, wpName: bistroSeat });
        actions.push({ type: "WAIT_SIM", minutes: agent.schedule.lunchDuration });
        actions.push({ type: "MARK_LUNCHED" });
        actions.push({ type: "STAND" });

        if (agent.homeFloor > 0) {
            actions.push({ type: "WALK_TO_WP", floor: 0, wpName: "lobby_center" });
            actions.push({ type: "WALK_TO_WP", floor: 0, wpName: "elevWait" });
            actions.push({ type: "WAIT_AT_PANEL", floor: 0, dir: 1, toFloor: agent.homeFloor });
            actions.push({ type: "ENTER_ELEVATOR", toFloor: agent.homeFloor });
            actions.push({ type: "PRESS_FLOOR", floor: agent.homeFloor });
            actions.push({ type: "WAIT_FOR_FLOOR", floor: agent.homeFloor });
            actions.push({ type: "EXIT_ELEVATOR", toFloor: agent.homeFloor });
        }

        actions.push({ type: "WALK_TO_WP", floor: agent.homeFloor, wpName: agent.deskDoorWpName });
        actions.push({ type: "WALK_TO_WP", floor: agent.homeFloor, wpName: agent.deskWpName });
        actions.push({ type: "SIT", floor: agent.homeFloor, wpName: agent.deskWpName });
        actions.push({ type: "ENTER_STATE", state: "AT_DESK" });
        actions.push({ type: "WAIT_SIM", minutes: randInt(20, 50) });
        actions.push({ type: "PICK_NEXT_ACTIVITY" });

        return actions;
    }

    function planVisitLounge(agent) {
        const actions = [];
        actions.push({ type: "STAND" });
        actions.push({ type: "WALK_TO_WP", floor: agent.currentFloor, wpName: agent.deskDoorWpName || "hallS" });
        actions.push({ type: "WALK_TO_WP", floor: agent.currentFloor, wpName: "lounge_door" });
        actions.push({ type: "WALK_TO_WP", floor: agent.currentFloor, wpName: "lounge_center" });

        const spot = pickRandom(["lounge_spot0", "lounge_spot1", "lounge_spot2", "water_cooler"]);
        actions.push({ type: "WALK_TO_WP", floor: agent.currentFloor, wpName: spot });
        actions.push({ type: "SIT", floor: agent.currentFloor, wpName: spot });
        actions.push({ type: "ENTER_STATE", state: "AT_BREAK" });
        actions.push({ type: "WAIT_SIM", minutes: randInt(6, 15) });
        actions.push({ type: "STAND" });
        actions.push({ type: "WALK_TO_WP", floor: agent.currentFloor, wpName: "lounge_door" });
        actions.push({ type: "WALK_TO_WP", floor: agent.currentFloor, wpName: agent.deskDoorWpName || "hallS" });
        actions.push({ type: "WALK_TO_WP", floor: agent.homeFloor, wpName: agent.deskWpName });
        actions.push({ type: "SIT", floor: agent.homeFloor, wpName: agent.deskWpName });
        actions.push({ type: "ENTER_STATE", state: "AT_DESK" });
        actions.push({ type: "WAIT_SIM", minutes: randInt(20, 50) });
        actions.push({ type: "PICK_NEXT_ACTIVITY" });

        return actions;
    }

    function planAttendMeeting(agent) {
        const meetingFloor = Math.random() < 0.65 ? agent.homeFloor : randInt(1, 5);
        const seatWp = reserveConfSeat(meetingFloor);

        if (!seatWp) {
            // Conference full, fall back to lounge
            return planVisitLounge(agent);
        }

        const actions = [];
        actions.push({ type: "STAND" });
        actions.push({ type: "WALK_TO_WP", floor: agent.currentFloor, wpName: agent.deskDoorWpName || "hallS" });

        if (meetingFloor !== agent.currentFloor) {
            const dir = meetingFloor > agent.currentFloor ? 1 : -1;
            actions.push({ type: "WALK_TO_WP", floor: agent.currentFloor, wpName: "elevWait" });
            actions.push({ type: "WAIT_AT_PANEL", floor: agent.currentFloor, dir: dir, toFloor: meetingFloor });
            actions.push({ type: "ENTER_ELEVATOR", toFloor: meetingFloor });
            actions.push({ type: "PRESS_FLOOR", floor: meetingFloor });
            actions.push({ type: "WAIT_FOR_FLOOR", floor: meetingFloor });
            actions.push({ type: "EXIT_ELEVATOR", toFloor: meetingFloor });
        }

        actions.push({ type: "WALK_TO_WP", floor: meetingFloor, wpName: "conf_door" });
        actions.push({ type: "WALK_TO_WP", floor: meetingFloor, wpName: "conf_center" });
        actions.push({ type: "WALK_TO_WP", floor: meetingFloor, wpName: seatWp });
        actions.push({ type: "SIT", floor: meetingFloor, wpName: seatWp });
        actions.push({ type: "ENTER_STATE", state: "IN_MEETING" });
        actions.push({ type: "WAIT_SIM", minutes: randInt(22, 45) });
        actions.push({ type: "STAND" });
        actions.push({ type: "RELEASE_SEAT", floor: meetingFloor, wpName: seatWp });
        actions.push({ type: "WALK_TO_WP", floor: meetingFloor, wpName: "conf_door" });

        if (meetingFloor !== agent.homeFloor) {
            const dir = agent.homeFloor > meetingFloor ? 1 : -1;
            actions.push({ type: "WALK_TO_WP", floor: meetingFloor, wpName: "elevWait" });
            actions.push({ type: "WAIT_AT_PANEL", floor: meetingFloor, dir: dir, toFloor: agent.homeFloor });
            actions.push({ type: "ENTER_ELEVATOR", toFloor: agent.homeFloor });
            actions.push({ type: "PRESS_FLOOR", floor: agent.homeFloor });
            actions.push({ type: "WAIT_FOR_FLOOR", floor: agent.homeFloor });
            actions.push({ type: "EXIT_ELEVATOR", toFloor: agent.homeFloor });
        }

        actions.push({ type: "WALK_TO_WP", floor: agent.homeFloor, wpName: agent.deskDoorWpName });
        actions.push({ type: "WALK_TO_WP", floor: agent.homeFloor, wpName: agent.deskWpName });
        actions.push({ type: "SIT", floor: agent.homeFloor, wpName: agent.deskWpName });
        actions.push({ type: "ENTER_STATE", state: "AT_DESK" });
        actions.push({ type: "WAIT_SIM", minutes: randInt(20, 50) });
        actions.push({ type: "PICK_NEXT_ACTIVITY" });

        return actions;
    }

    function planVisitCoworker(agent) {
        const potentialCoworkers = agents.filter(a =>
            a.role === "WORKER" && a.id !== agent.id && a.state === "AT_DESK"
        );

        if (potentialCoworkers.length === 0) {
            return [{ type: "WAIT_SIM", minutes: 10 }, { type: "PICK_NEXT_ACTIVITY" }];
        }

        const coworker = pickRandom(potentialCoworkers);
        const actions = [];
        actions.push({ type: "STAND" });
        actions.push({ type: "WALK_TO_WP", floor: agent.currentFloor, wpName: agent.deskDoorWpName || "hallS" });

        if (coworker.homeFloor !== agent.currentFloor) {
            const dir = coworker.homeFloor > agent.currentFloor ? 1 : -1;
            actions.push({ type: "WALK_TO_WP", floor: agent.currentFloor, wpName: "elevWait" });
            actions.push({ type: "WAIT_AT_PANEL", floor: agent.currentFloor, dir: dir, toFloor: coworker.homeFloor });
            actions.push({ type: "ENTER_ELEVATOR", toFloor: coworker.homeFloor });
            actions.push({ type: "PRESS_FLOOR", floor: coworker.homeFloor });
            actions.push({ type: "WAIT_FOR_FLOOR", floor: coworker.homeFloor });
            actions.push({ type: "EXIT_ELEVATOR", toFloor: coworker.homeFloor });
        }

        actions.push({ type: "WALK_TO_WP", floor: coworker.homeFloor, wpName: coworker.deskDoorWpName });
        actions.push({ type: "ENTER_STATE", state: "VISITING" });
        actions.push({ type: "WAIT_SIM", minutes: randInt(6, 18) });

        if (coworker.homeFloor !== agent.homeFloor) {
            const dir = agent.homeFloor > coworker.homeFloor ? 1 : -1;
            actions.push({ type: "WALK_TO_WP", floor: coworker.homeFloor, wpName: "elevWait" });
            actions.push({ type: "WAIT_AT_PANEL", floor: coworker.homeFloor, dir: dir, toFloor: agent.homeFloor });
            actions.push({ type: "ENTER_ELEVATOR", toFloor: agent.homeFloor });
            actions.push({ type: "PRESS_FLOOR", floor: agent.homeFloor });
            actions.push({ type: "WAIT_FOR_FLOOR", floor: agent.homeFloor });
            actions.push({ type: "EXIT_ELEVATOR", toFloor: agent.homeFloor });
        }

        actions.push({ type: "WALK_TO_WP", floor: agent.homeFloor, wpName: agent.deskDoorWpName });
        actions.push({ type: "WALK_TO_WP", floor: agent.homeFloor, wpName: agent.deskWpName });
        actions.push({ type: "SIT", floor: agent.homeFloor, wpName: agent.deskWpName });
        actions.push({ type: "ENTER_STATE", state: "AT_DESK" });
        actions.push({ type: "WAIT_SIM", minutes: randInt(20, 50) });
        actions.push({ type: "PICK_NEXT_ACTIVITY" });

        return actions;
    }

    function planLeaveBuilding(agent) {
        const actions = [];
        actions.push({ type: "STAND" });
        actions.push({ type: "ENTER_STATE", state: "LEAVING" });

        if (agent.currentFloor > 0) {
            actions.push({ type: "WALK_TO_WP", floor: agent.currentFloor, wpName: agent.deskDoorWpName || "hallS" });
            actions.push({ type: "WALK_TO_WP", floor: agent.currentFloor, wpName: "elevWait" });
            actions.push({ type: "WAIT_AT_PANEL", floor: agent.currentFloor, dir: -1, toFloor: 0 });
            actions.push({ type: "ENTER_ELEVATOR", toFloor: 0 });
            actions.push({ type: "PRESS_FLOOR", floor: 0 });
            actions.push({ type: "WAIT_FOR_FLOOR", floor: 0 });
            actions.push({ type: "EXIT_ELEVATOR", toFloor: 0 });
        }

        actions.push({ type: "WALK_TO_WP", floor: 0, wpName: "lobby_center" });
        actions.push({ type: "WALK_TO_WP", floor: 0, wpName: "entrance" });
        actions.push({ type: "WALK_TO_WP", floor: 0, wpName: "front_door_threshold" });
        actions.push({ type: "WALK_TO_WP", floor: 0, wpName: "outside" });
        actions.push({ type: "EXIT_BUILDING" });

        return actions;
    }

    function planVisitorVisit(agent) {
        const actions = [];
        actions.push({ type: "WALK_TO_WP", floor: 0, wpName: "front_door_threshold" });
        actions.push({ type: "WALK_TO_WP", floor: 0, wpName: "entrance" });
        actions.push({ type: "WALK_TO_WP", floor: 0, wpName: "lobby_center" });

        const roll = Math.random();

        if (roll < 0.10) {
            // 10% Bistro table in lobby
            const seat = `bistro_seat${randInt(0, 7)}`;
            actions.push({ type: "WALK_TO_WP", floor: 0, wpName: seat });
            actions.push({ type: "SIT", floor: 0, wpName: seat });
            actions.push({ type: "ENTER_STATE", state: "VISITING" });
            actions.push({ type: "WAIT_SIM", minutes: randInt(12, 28) });
            actions.push({ type: "STAND" });

        } else if (roll < 0.16) {
            // 6% Cafe counter order
            actions.push({ type: "WALK_TO_WP", floor: 0, wpName: "cafe_order" });
            actions.push({ type: "SIT", floor: 0, wpName: "cafe_order" });
            actions.push({ type: "ENTER_STATE", state: "VISITING" });
            actions.push({ type: "WAIT_SIM", minutes: randInt(4, 10) });
            actions.push({ type: "STAND" });

        } else if (roll < 0.30) {
            // 14% Front lounge
            const spot = pickRandom(["front_lounge_couch", "front_lounge_chairL", "front_lounge_chairR"]);
            actions.push({ type: "WALK_TO_WP", floor: 0, wpName: spot });
            actions.push({ type: "SIT", floor: 0, wpName: spot });
            actions.push({ type: "ENTER_STATE", state: "VISITING" });
            actions.push({ type: "WAIT_SIM", minutes: randInt(10, 25) });
            actions.push({ type: "STAND" });

        } else if (roll < 0.42) {
            // 12% Back lounge / Conversation pit
            const spot = pickRandom(["back_lounge_N", "back_lounge_S", "pit_N", "pit_S", "pit_E", "pit_W"]);
            actions.push({ type: "WALK_TO_WP", floor: 0, wpName: spot });
            actions.push({ type: "SIT", floor: 0, wpName: spot });
            actions.push({ type: "ENTER_STATE", state: "VISITING" });
            actions.push({ type: "WAIT_SIM", minutes: randInt(10, 25) });
            actions.push({ type: "STAND" });

        } else if (roll < 0.52) {
            // 10% Reception / Kiosk / Water cooler
            const spot = pickRandom(["reception", "kiosk", "lobby_wc_front", "lobby_wc_back"]);
            actions.push({ type: "WALK_TO_WP", floor: 0, wpName: spot });
            actions.push({ type: "SIT", floor: 0, wpName: spot });
            actions.push({ type: "ENTER_STATE", state: "VISITING" });
            actions.push({ type: "WAIT_SIM", minutes: randInt(4, 12) });
            actions.push({ type: "STAND" });

        } else if (roll < 0.62) {
            // 10% Lobby loiter
            const spot = pickRandom([
                "lobby_stand_center", "lobby_stand_NE", "lobby_stand_NW",
                "lobby_stand_midE", "lobby_stand_midW", "lobby_stand_entry"
            ]);
            actions.push({ type: "WALK_TO_WP", floor: 0, wpName: spot });
            actions.push({ type: "SIT", floor: 0, wpName: spot });
            actions.push({ type: "ENTER_STATE", state: "VISITING" });
            actions.push({ type: "WAIT_SIM", minutes: randInt(5, 18) });
            actions.push({ type: "STAND" });

        } else if (roll < 0.77) {
            // 15% Ride up to office floor lounge
            const targetFloor = randInt(1, 5);
            actions.push({ type: "WALK_TO_WP", floor: 0, wpName: "elevWait" });
            actions.push({ type: "WAIT_AT_PANEL", floor: 0, dir: 1, toFloor: targetFloor });
            actions.push({ type: "ENTER_ELEVATOR", toFloor: targetFloor });
            actions.push({ type: "PRESS_FLOOR", floor: targetFloor });
            actions.push({ type: "WAIT_FOR_FLOOR", floor: targetFloor });
            actions.push({ type: "EXIT_ELEVATOR", toFloor: targetFloor });

            const spot = pickRandom(["lounge_spot0", "lounge_spot1", "lounge_spot2", "water_cooler", "hall_stand_N", "hall_stand_S"]);
            actions.push({ type: "WALK_TO_WP", floor: targetFloor, wpName: spot });
            actions.push({ type: "SIT", floor: targetFloor, wpName: spot });
            actions.push({ type: "ENTER_STATE", state: "VISITING" });
            actions.push({ type: "WAIT_SIM", minutes: randInt(10, 25) });
            actions.push({ type: "STAND" });

            actions.push({ type: "WALK_TO_WP", floor: targetFloor, wpName: "elevWait" });
            actions.push({ type: "WAIT_AT_PANEL", floor: targetFloor, dir: -1, toFloor: 0 });
            actions.push({ type: "ENTER_ELEVATOR", toFloor: 0 });
            actions.push({ type: "PRESS_FLOOR", floor: 0 });
            actions.push({ type: "WAIT_FOR_FLOOR", floor: 0 });
            actions.push({ type: "EXIT_ELEVATOR", toFloor: 0 });

        } else {
            // 23% Sit in on a meeting (client / external attendee)
            const targetFloor = randInt(1, 5);
            const seat = reserveConfSeat(targetFloor);

            if (seat) {
                actions.push({ type: "WALK_TO_WP", floor: 0, wpName: "elevWait" });
                actions.push({ type: "WAIT_AT_PANEL", floor: 0, dir: 1, toFloor: targetFloor });
                actions.push({ type: "ENTER_ELEVATOR", toFloor: targetFloor });
                actions.push({ type: "PRESS_FLOOR", floor: targetFloor });
                actions.push({ type: "WAIT_FOR_FLOOR", floor: targetFloor });
                actions.push({ type: "EXIT_ELEVATOR", toFloor: targetFloor });

                actions.push({ type: "WALK_TO_WP", floor: targetFloor, wpName: "conf_door" });
                actions.push({ type: "WALK_TO_WP", floor: targetFloor, wpName: "conf_center" });
                actions.push({ type: "WALK_TO_WP", floor: targetFloor, wpName: seat });
                actions.push({ type: "SIT", floor: targetFloor, wpName: seat });
                actions.push({ type: "ENTER_STATE", state: "IN_MEETING" });
                actions.push({ type: "WAIT_SIM", minutes: randInt(20, 45) });
                actions.push({ type: "STAND" });
                actions.push({ type: "RELEASE_SEAT", floor: targetFloor, wpName: seat });
                actions.push({ type: "WALK_TO_WP", floor: targetFloor, wpName: "conf_door" });

                actions.push({ type: "WALK_TO_WP", floor: targetFloor, wpName: "elevWait" });
                actions.push({ type: "WAIT_AT_PANEL", floor: targetFloor, dir: -1, toFloor: 0 });
                actions.push({ type: "ENTER_ELEVATOR", toFloor: 0 });
                actions.push({ type: "PRESS_FLOOR", floor: 0 });
                actions.push({ type: "WAIT_FOR_FLOOR", floor: 0 });
                actions.push({ type: "EXIT_ELEVATOR", toFloor: 0 });
            } else {
                // Fallback to lobby loiter
                const spot = "lobby_stand_center";
                actions.push({ type: "WALK_TO_WP", floor: 0, wpName: spot });
                actions.push({ type: "SIT", floor: 0, wpName: spot });
                actions.push({ type: "ENTER_STATE", state: "VISITING" });
                actions.push({ type: "WAIT_SIM", minutes: randInt(6, 16) });
                actions.push({ type: "STAND" });
            }
        }

        // Leave building
        actions.push({ type: "ENTER_STATE", state: "LEAVING" });
        actions.push({ type: "WALK_TO_WP", floor: 0, wpName: "lobby_center" });
        actions.push({ type: "WALK_TO_WP", floor: 0, wpName: "entrance" });
        actions.push({ type: "WALK_TO_WP", floor: 0, wpName: "front_door_threshold" });
        actions.push({ type: "WALK_TO_WP", floor: 0, wpName: "outside" });
        actions.push({ type: "EXIT_BUILDING" });

        return actions;
    }

    function chooseNextActivity(agent) {
        if (agent.role === "VISITOR") {
            return;
        }

        const now = Clock.simMinute;
        const sch = agent.schedule;

        // 1. Past departure time
        if (now >= sch.departureTime) {
            agent.plan = planLeaveBuilding(agent);
            agent.currentAction = null;
            return;
        }

        // 2. Pre-scheduled meetings
        if (sch.plannedMeetingTimes && sch.plannedMeetingTimes.length > 0) {
            for (let i = 0; i < sch.plannedMeetingTimes.length; i++) {
                if (now >= sch.plannedMeetingTimes[i]) {
                    sch.plannedMeetingTimes.splice(i, 1);
                    agent.plan = planAttendMeeting(agent);
                    agent.currentAction = null;
                    return;
                }
            }
        }

        // 3. Lunch window
        if (!sch.hasLunched && now >= sch.lunchTime) {
            agent.plan = planGoToLunch(agent);
            agent.currentAction = null;
            return;
        }

        // 4. Weighted daytime decisions
        const roll = Math.random();
        if (roll < 0.14) {
            agent.plan = planAttendMeeting(agent);
        } else if (roll < 0.26) {
            agent.plan = planVisitLounge(agent);
        } else if (roll < 0.41) {
            agent.plan = planVisitCoworker(agent);
        } else {
            // Keep working at desk
            agent.plan = [
                { type: "WAIT_SIM", minutes: randInt(18, 55) },
                { type: "PICK_NEXT_ACTIVITY" }
            ];
        }
        agent.currentAction = null;
    }

    // Population Initialization
    function initAgents() {
        agents.length = 0;
        let deskIndex = 0;
        const allDesks = [];

        for (let f = 1; f < world.floors.length; f++) {
            const flDesks = world.floors[f].desks;
            for (let d = 0; d < flDesks.length; d++) {
                allDesks.push({ floor: f, desk: flDesks[d] });
            }
        }

        for (let i = 0; i < MAX_OCCUPANCY; i++) {
            const isWorker = i < MAX_WORKERS;
            let homeFloor = 0;
            let deskId = null;
            let deskWpName = null;
            let deskDoorWpName = null;

            if (isWorker && deskIndex < allDesks.length) {
                const assigned = allDesks[deskIndex++];
                homeFloor = assigned.floor;
                deskId = assigned.desk.id;
                deskWpName = assigned.desk.deskWp;
                deskDoorWpName = assigned.desk.doorWp;
            }

            const personGroup = window.createPerson();
            personGroup.position.set(0, -100, 0); // Park offscreen initially
            personGroup.visible = false;

            const agent = {
                id: i,
                name: pickRandom(FIRST_NAMES),
                role: isWorker ? "WORKER" : "VISITOR",
                homeFloor: homeFloor,
                deskId: deskId,
                deskWpName: deskWpName,
                deskDoorWpName: deskDoorWpName,
                state: i < targetOccupancy ? "AWAY" : "DISABLED",
                currentFloor: 0,
                group: personGroup,
                schedule: isWorker ? createWorkerSchedule() : createVisitorSchedule(),
                plan: [],
                currentAction: null,
                pathWaypoints: null,
                pathIndex: 0,
                walkStallTime: 0,
                lastWalkPos: new THREE.Vector3(),
                reservedSpot: null
            };

            agents.push(agent);
        }
    }

    function countPresent() {
        let count = 0;
        for (let i = 0; i < agents.length; i++) {
            const s = agents[i].state;
            if (s !== "DISABLED" && s !== "AWAY" && s !== "GONE") {
                count++;
            }
        }
        return count;
    }

    function topUpVisitors() {
        const now = Clock.simMinute;
        // Business hours: 07:30 to 19:30
        if (now < 7 * 60 + 30 || now > 19 * 60 + 30) return;

        const deficit = targetOccupancy - countPresent();
        if (deficit <= 0) return;

        let rearmed = 0;
        for (let i = 0; i < agents.length; i++) {
            const agent = agents[i];
            if (agent.id < targetOccupancy && agent.role === "VISITOR" && (agent.state === "AWAY" || agent.state === "GONE")) {
                agent.schedule = createVisitorSchedule(now);
                agent.state = "AWAY";
                agent.plan = [];
                agent.currentAction = null;
                rearmed++;
                if (rearmed >= deficit) break;
            }
        }
    }

    function applyOccupancy() {
        for (let i = 0; i < agents.length; i++) {
            const agent = agents[i];
            if (agent.id >= targetOccupancy) {
                if (agent.state === "AWAY" || agent.state === "GONE") {
                    agent.state = "DISABLED";
                    agent.group.visible = false;
                }
            } else {
                if (agent.state === "DISABLED") {
                    agent.state = "AWAY";
                    if (agent.role === "VISITOR") {
                        agent.schedule = createVisitorSchedule(Clock.simMinute);
                    }
                }
            }
        }
    }

    function onDayWrap() {
        seatReservations.clear();
        elevator.reset();

        for (let i = 0; i < agents.length; i++) {
            const agent = agents[i];
            agent.plan = [];
            agent.currentAction = null;
            agent.pathWaypoints = null;
            agent.pathIndex = 0;
            agent.reservedSpot = null;
            agent.currentFloor = 0;
            agent.group.userData.isSitting = false;
            agent.group.userData.isWalking = false;

            if (agent.group.parent) {
                agent.group.parent.remove(agent.group);
            }
            agent.group.position.set(0, -100, 0);
            agent.group.visible = false;

            if (agent.id < targetOccupancy) {
                agent.state = "AWAY";
                if (agent.role === "WORKER") {
                    agent.schedule = createWorkerSchedule();
                } else {
                    agent.schedule = createVisitorSchedule(Clock.simMinute);
                }
            } else {
                agent.state = "DISABLED";
            }
        }
    }

    // Spawn agent at sidewalk
    function spawnAgent(agent) {
        agent.state = "ARRIVING";
        agent.currentFloor = 0;
        agent.group.userData.isSitting = false;
        agent.group.userData.isWalking = false;

        // Sidewalk outside: x in [-1.1, 1.1], z in [11.5, 12.5]
        const spawnX = randFloat(-1.1, 1.1);
        const spawnZ = randFloat(11.5, 12.5);
        agent.group.position.set(spawnX, 0, spawnZ);
        agent.group.visible = true;

        if (agent.group.parent) {
            agent.group.parent.remove(agent.group);
        }
        scene.add(agent.group);

        if (agent.role === "WORKER") {
            agent.plan = planArriveToDesk(agent);
        } else {
            agent.plan = planVisitorVisit(agent);
        }
        agent.currentAction = null;
    }

    // Action Execution Engine
    function stepAgentActions(agent, motionDt) {
        if (agent.state === "DISABLED" || agent.state === "AWAY" || agent.state === "GONE") {
            return;
        }

        // Global end-of-day check for workers
        if (agent.role === "WORKER" && agent.state !== "LEAVING" && agent.state !== "ARRIVING") {
            if (Clock.simMinute >= agent.schedule.departureTime && agent.state !== "IN_CAR") {
                agent.plan = planLeaveBuilding(agent);
                agent.currentAction = null;
            }
        }

        // Dispatch loop up to 16 iterations for immediate zero-duration transitions
        let iterations = 0;
        while (iterations++ < 16) {
            if (!agent.currentAction) {
                if (!agent.plan || agent.plan.length === 0) {
                    break;
                }
                agent.currentAction = agent.plan.shift();
                initAction(agent, agent.currentAction);
            }

            const done = updateAction(agent, agent.currentAction, motionDt);
            if (done) {
                agent.currentAction = null;
            } else {
                break; // Action is ongoing (e.g. walking, waiting)
            }
        }
    }

    function initAction(agent, act) {
        switch (act.type) {
            case "WALK_TO_WP": {
                const floorNodes = world.floors[act.floor].nodes;
                let fromWp = "hallS";
                let closestDist = Infinity;
                const pos = agent.group.position;

                // Find closest node to start path
                for (const name in floorNodes) {
                    const n = floorNodes[name];
                    const d = Math.hypot(pos.x - n.x, pos.z - n.z);
                    if (d < closestDist) {
                        closestDist = d;
                        fromWp = name;
                    }
                }

                const floorY = act.floor * WORLD.FLOOR_HEIGHT;
                agent.pathWaypoints = world.bfsPath(floorNodes, fromWp, act.wpName, floorY);
                agent.pathIndex = 0;
                agent.walkStallTime = 0;
                agent.lastWalkPos.copy(agent.group.position);
                agent.group.userData.isWalking = true;
                break;
            }

            case "WAIT_SIM": {
                act.untilMin = Clock.simMinute + act.minutes;
                break;
            }

            case "ENTER_ELEVATOR": {
                act.phase = "RESERVE";
                act.stallTime = 0;
                break;
            }

            case "EXIT_ELEVATOR": {
                act.phase = "REGISTER";
                break;
            }
        }
    }

    function updateAction(agent, act, motionDt) {
        const floorY = agent.currentFloor * WORLD.FLOOR_HEIGHT;

        switch (act.type) {
            case "WALK_TO_WP": {
                if (!agent.pathWaypoints || agent.pathIndex >= agent.pathWaypoints.length) {
                    agent.group.userData.isWalking = false;
                    return true;
                }

                const targetWp = agent.pathWaypoints[agent.pathIndex];
                const curPos = agent.group.position;
                const dx = targetWp.x - curPos.x;
                const dz = targetWp.z - curPos.z;
                const dist = Math.hypot(dx, dz);
                const walkSpeed = 1.4; // m/s
                const step = walkSpeed * motionDt;

                // Stall recovery
                const moved = curPos.distanceTo(agent.lastWalkPos);
                if (moved < 0.005) {
                    agent.walkStallTime += motionDt;
                    if (agent.walkStallTime > 1.2) {
                        // Skip current waypoint if stalled
                        agent.pathIndex++;
                        agent.walkStallTime = 0;
                        if (agent.pathIndex >= agent.pathWaypoints.length) {
                            curPos.set(targetWp.x, floorY, targetWp.z);
                            agent.group.userData.isWalking = false;
                            return true;
                        }
                    }
                } else {
                    agent.walkStallTime = 0;
                }
                agent.lastWalkPos.copy(curPos);

                if (dist <= step) {
                    curPos.x = targetWp.x;
                    curPos.z = targetWp.z;
                    curPos.y = floorY;
                    agent.pathIndex++;
                    if (agent.pathIndex >= agent.pathWaypoints.length) {
                        agent.group.userData.isWalking = false;
                        return true;
                    }
                } else {
                    curPos.x += (dx / dist) * step;
                    curPos.z += (dz / dist) * step;
                    curPos.y = floorY;
                    agent.group.rotation.y = Math.atan2(dx, dz);
                    agent.group.userData.isWalking = true;
                }
                return false;
            }

            case "WAIT_AT_PANEL": {
                agent.state = "WAITING_ELEVATOR";
                agent.group.userData.isWalking = false;

                // Re-press call every frame
                if (act.dir > 0) {
                    elevator.callUp(act.floor);
                } else {
                    elevator.callDown(act.floor);
                }

                if (elevator.isAcceptingAt(act.floor, act.dir)) {
                    return true;
                }
                return false;
            }

            case "ENTER_ELEVATOR": {
                agent.state = "IN_CAR";

                if (act.phase === "RESERVE") {
                    const spot = elevator.reserveBoardingSpot(agent);
                    if (!spot) {
                        // Elevator became full or closed; re-press call
                        const dir = act.toFloor > agent.currentFloor ? 1 : -1;
                        if (dir > 0) elevator.callUp(agent.currentFloor);
                        else elevator.callDown(agent.currentFloor);
                        return false;
                    }
                    agent.reservedSpot = spot;
                    act.phase = "WALK_DOOR";
                    act.doorTargetX = spot.x;
                }

                if (act.phase === "WALK_DOOR") {
                    agent.group.userData.isWalking = true;
                    const curPos = agent.group.position;
                    // Aim for dedicated door lane X
                    const targetX = act.doorTargetX;
                    const targetZ = 1.55;
                    const dx = targetX - curPos.x;
                    const dz = targetZ - curPos.z;
                    const dist = Math.hypot(dx, dz);
                    const step = 1.4 * motionDt;

                    act.stallTime += motionDt;
                    if (act.stallTime > 1.5 || dist <= step) {
                        // Arrived at doorway threshold -> reparent to elevator car
                        agent.group.parent.remove(agent.group);
                        elevator.carGroup.add(agent.group);
                        // Convert to car local space
                        agent.group.position.set(targetX, 0, 1.3);
                        act.phase = "WALK_SPOT";
                    } else {
                        curPos.x += (dx / dist) * step;
                        curPos.z += (dz / dist) * step;
                        agent.group.rotation.y = Math.atan2(dx, dz);
                    }
                    return false;
                }

                if (act.phase === "WALK_SPOT") {
                    agent.group.userData.isWalking = true;
                    const spot = agent.reservedSpot;
                    const curPos = agent.group.position;
                    const dx = spot.x - curPos.x;
                    const dz = spot.z - curPos.z;
                    const dist = Math.hypot(dx, dz);
                    const step = 1.4 * motionDt;

                    if (dist <= step) {
                        curPos.set(spot.x, 0, spot.z);
                        elevator.completeBoard(agent);
                        // Turn to face doors (+Z)
                        agent.group.rotation.y = 0;
                        agent.group.userData.isWalking = false;
                        return true;
                    } else {
                        curPos.x += (dx / dist) * step;
                        curPos.z += (dz / dist) * step;
                        agent.group.rotation.y = Math.atan2(dx, dz);
                    }
                    return false;
                }
                return false;
            }

            case "PRESS_FLOOR": {
                elevator.pressDestination(act.floor);
                return true;
            }

            case "WAIT_FOR_FLOOR": {
                agent.group.userData.isWalking = false;
                if (elevator.currentFloor === act.floor && elevator.state === "DOOR_OPEN") {
                    agent.currentFloor = act.floor;
                    return true;
                }
                return false;
            }

            case "EXIT_ELEVATOR": {
                if (act.phase === "REGISTER") {
                    elevator.registerDisembark(agent);
                    // Reparent back to scene at world coordinates
                    const carWorldY = elevator.positionY;
                    const localPos = agent.group.position;
                    elevator.carGroup.remove(agent.group);
                    scene.add(agent.group);
                    agent.group.position.set(localPos.x, carWorldY, 1.4);
                    act.phase = "WALK_OUT";
                }

                if (act.phase === "WALK_OUT") {
                    agent.group.userData.isWalking = true;
                    const targetX = 0;
                    const targetZ = 2.2;
                    const curPos = agent.group.position;
                    const dx = targetX - curPos.x;
                    const dz = targetZ - curPos.z;
                    const dist = Math.hypot(dx, dz);
                    const step = 1.4 * motionDt;

                    if (dist <= step) {
                        curPos.set(targetX, floorY, targetZ);
                        elevator.completeDisembark(agent);
                        agent.reservedSpot = null;
                        agent.state = "ON_FLOOR";
                        agent.group.userData.isWalking = false;
                        return true;
                    } else {
                        curPos.x += (dx / dist) * step;
                        curPos.z += (dz / dist) * step;
                        curPos.y = floorY;
                        agent.group.rotation.y = Math.atan2(dx, dz);
                    }
                    return false;
                }
                return false;
            }

            case "SIT": {
                const flSit = world.floors[act.floor].sitTargets[act.wpName];
                const node = world.floors[act.floor].nodes[act.wpName];

                if (flSit && flSit.sit) {
                    // True sitting: lower body Y by 0.35
                    agent.group.position.set(node.x, floorY - 0.35, node.z);
                    agent.group.rotation.y = flSit.facing;
                    agent.group.userData.isSitting = true;
                    agent.group.userData.isWalking = false;
                } else {
                    // Standing loiter spot: small random jitter so visitors don't stack perfectly
                    const jitAng = Math.random() * Math.PI * 2;
                    const jitR = randFloat(0.15, 0.45);
                    agent.group.position.set(
                        node.x + Math.cos(jitAng) * jitR,
                        floorY,
                        node.z + Math.sin(jitAng) * jitR
                    );
                    agent.group.rotation.y = (flSit && flSit.facing) || 0;
                    agent.group.userData.isSitting = false;
                    agent.group.userData.isWalking = false;
                }
                return true;
            }

            case "STAND": {
                agent.group.userData.isSitting = false;
                agent.group.position.y = floorY;
                return true;
            }

            case "RELEASE_SEAT": {
                releaseSeat(act.floor, act.wpName);
                return true;
            }

            case "WAIT_SIM": {
                agent.group.userData.isWalking = false;
                if (Clock.simMinute >= act.untilMin) {
                    return true;
                }
                return false;
            }

            case "EXIT_BUILDING": {
                agent.group.visible = false;
                if (agent.group.parent) {
                    agent.group.parent.remove(agent.group);
                }
                agent.group.position.set(0, -100, 0);
                agent.state = "GONE";
                return true;
            }

            case "ENTER_STATE": {
                agent.state = act.state;
                return true;
            }

            case "MARK_LUNCHED": {
                agent.schedule.hasLunched = true;
                return true;
            }

            case "PICK_NEXT_ACTIVITY": {
                chooseNextActivity(agent);
                return true;
            }
        }

        return true;
    }

    // Soft Crowd Separation Repulsion
    function applyCollisions(motionDt) {
        const repulseDist = 0.65;
        const repulseDistSq = repulseDist * repulseDist;
        const pushFactor = 0.18 * motionDt;

        for (let i = 0; i < agents.length; i++) {
            const a = agents[i];
            if (a.state === "DISABLED" || a.state === "AWAY" || a.state === "GONE") continue;
            if (a.group.userData.isSitting) continue;
            if (a.group.parent === elevator.carGroup) continue;
            if (a.currentAction && a.currentAction.type === "ENTER_ELEVATOR") continue;

            const posA = a.group.position;

            for (let j = i + 1; j < agents.length; j++) {
                const b = agents[j];
                if (b.state === "DISABLED" || b.state === "AWAY" || b.state === "GONE") continue;
                if (b.group.userData.isSitting) continue;
                if (b.group.parent === elevator.carGroup) continue;
                if (b.currentAction && b.currentAction.type === "ENTER_ELEVATOR") continue;

                const posB = b.group.position;

                // Only interact if on same floor level
                if (Math.abs(posA.y - posB.y) > 0.8) continue;

                const dx = posA.x - posB.x;
                const dz = posA.z - posB.z;
                const dSq = dx * dx + dz * dz;

                if (dSq < repulseDistSq) {
                    if (dSq < 0.0001) {
                        // Exact overlap: pick random separation angle
                        const randAng = Math.random() * Math.PI * 2;
                        const push = 0.05;
                        posA.x += Math.cos(randAng) * push;
                        posA.z += Math.sin(randAng) * push;
                        posB.x -= Math.cos(randAng) * push;
                        posB.z -= Math.sin(randAng) * push;
                    } else {
                        const dist = Math.sqrt(dSq);
                        const overlap = (repulseDist - dist) * 0.5 * pushFactor;
                        const nx = dx / dist;
                        const nz = dz / dist;

                        posA.x += nx * overlap;
                        posA.z += nz * overlap;
                        posB.x -= nx * overlap;
                        posB.z -= nz * overlap;
                    }
                }
            }
        }
    }

    // Interactive HUD
    let hudElement = null;
    function createHUD() {
        hudElement = document.createElement("div");
        hudElement.style.position = "absolute";
        hudElement.style.top = "12px";
        hudElement.style.left = "12px";
        hudElement.style.padding = "14px 18px";
        hudElement.style.background = "rgba(18, 22, 30, 0.85)";
        hudElement.style.backdropFilter = "blur(8px)";
        hudElement.style.border = "1px solid rgba(255, 255, 255, 0.12)";
        hudElement.style.borderRadius = "10px";
        hudElement.style.color = "#eceff4";
        hudElement.style.fontFamily = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
        hudElement.style.fontSize = "13px";
        hudElement.style.lineHeight = "1.5";
        hudElement.style.zIndex = "1000";
        hudElement.style.userSelect = "none";
        hudElement.style.boxShadow = "0 8px 32px rgba(0, 0, 0, 0.37)";
        hudElement.style.minWidth = "260px";

        hudElement.innerHTML = `
            <div style="font-size: 18px; font-weight: 700; color: #ffbb22; letter-spacing: 0.5px; margin-bottom: 8px;">
                <span id="hud-clock">--:-- AM</span>
                <span style="font-size: 12px; font-weight: 500; color: #88c0d0; margin-left: 8px;">(Floor 0-5 Office)</span>
            </div>

            <div style="margin-bottom: 8px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
                    <span>Speed:</span>
                    <b id="hud-speed-val">120x</b>
                </div>
                <input id="hud-speed-slider" type="range" min="0" max="8" value="5" style="width: 100%; cursor: pointer;">
            </div>

            <div style="margin-bottom: 12px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
                    <span>Occupancy:</span>
                    <b id="hud-occ-val">45 / 100</b>
                </div>
                <input id="hud-occ-slider" type="range" min="1" max="100" value="45" style="width: 100%; cursor: pointer;">
            </div>

            <div style="border-top: 1px solid rgba(255,255,255,0.1); padding-top: 8px; font-size: 12px;">
                <div style="font-weight: 600; color: #81a1c1; margin-bottom: 4px;">ELEVATOR STATUS</div>
                <div id="hud-elevator-info">Floor: 0 | IDLE | Riders: 0/4</div>
                <div id="hud-elevator-calls" style="color: #d8dee9; font-size: 11px;">Calls: none | Dest: none</div>
            </div>

            <div style="border-top: 1px solid rgba(255,255,255,0.1); margin-top: 8px; padding-top: 8px; font-size: 12px;">
                <div style="font-weight: 600; color: #81a1c1; margin-bottom: 4px;">ACTIVE WORKERS & VISITORS</div>
                <div id="hud-agent-counts">Present: 0 | Working: 0 | In Car: 0</div>
            </div>
        `;

        document.body.appendChild(hudElement);

        const speedSlider = document.getElementById("hud-speed-slider");
        const speedVal = document.getElementById("hud-speed-val");
        const speedStops = [1, 5, 15, 30, 60, 120, 240, 400, 600];

        speedSlider.addEventListener("input", function() {
            const val = speedStops[parseInt(speedSlider.value, 10)];
            Clock.timeScale = val;
            speedVal.textContent = `${val}x`;
        });

        const occSlider = document.getElementById("hud-occ-slider");
        const occVal = document.getElementById("hud-occ-val");

        occSlider.addEventListener("input", function() {
            targetOccupancy = parseInt(occSlider.value, 10);
            occVal.textContent = `${targetOccupancy} / 100`;
            applyOccupancy();
        });
    }

    function updateHUD() {
        if (!hudElement) return;

        const clockEl = document.getElementById("hud-clock");
        if (clockEl) clockEl.textContent = Clock.format();

        const elInfo = document.getElementById("hud-elevator-info");
        const elCalls = document.getElementById("hud-elevator-calls");
        if (elInfo && elevator) {
            const dirStr = elevator.direction > 0 ? "UP" : (elevator.direction < 0 ? "DOWN" : "IDLE");
            elInfo.textContent = `Floor: ${elevator.currentFloor} [${dirStr}] | ${elevator.state} | ${elevator.passengers.size}/${elevator.maxCapacity}`;

            const upArr = Array.from(elevator.upCalls).sort((a, b) => a - b).join(",");
            const downArr = Array.from(elevator.downCalls).sort((a, b) => a - b).join(",");
            const destArr = Array.from(elevator.destinations).sort((a, b) => a - b).join(",");
            elCalls.textContent = `Calls: [^ ${upArr || "-"}] [v ${downArr || "-"}] | Dest: [${destArr || "-"}]`;
        }

        const agentCounts = document.getElementById("hud-agent-counts");
        if (agentCounts) {
            let present = 0;
            let atDesk = 0;
            let inCar = 0;
            let inMeeting = 0;
            let onBreak = 0;

            for (let i = 0; i < agents.length; i++) {
                const s = agents[i].state;
                if (s !== "DISABLED" && s !== "AWAY" && s !== "GONE") {
                    present++;
                    if (s === "AT_DESK") atDesk++;
                    else if (s === "IN_CAR") inCar++;
                    else if (s === "IN_MEETING") inMeeting++;
                    else if (s === "AT_BREAK" || s === "AT_LUNCH" || s === "VISITING") onBreak++;
                }
            }
            agentCounts.textContent = `Active: ${present} | Desks: ${atDesk} | Mtg: ${inMeeting} | Lift: ${inCar}`;
        }
    }

    // Main Simulation Entry Point
    function startSimulation() {
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x20242a);

        camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.set(28, 24, 28);

        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.sortObjects = true;
        document.body.appendChild(renderer.domElement);

        controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.target.set(0, 10, 0);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;

        ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
        scene.add(ambientLight);

        hemiLight = new THREE.HemisphereLight(0xbfd7ff, 0x303020, 0.5);
        scene.add(hemiLight);

        dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
        dirLight.position.set(20, 35, 18);
        scene.add(dirLight);

        world = window.createWorld(scene);
        elevator = new window.Elevator(scene, world);

        initAgents();
        createHUD();

        window.addEventListener("resize", function() {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        });

        const threeClock = new THREE.Clock();

        function animate() {
            requestAnimationFrame(animate);

            const realDt = Math.min(0.05, threeClock.getDelta());
            Clock.tick(realDt);
            updateDayNightLighting();

            const motionDt = realDt * Clock.timeScale;

            // Advance elevator physics and state
            elevator.tick(motionDt);

            // Spawn and schedule checks
            const now = Clock.simMinute;
            for (let i = 0; i < agents.length; i++) {
                const agent = agents[i];
                if (agent.state === "AWAY" && now >= agent.schedule.arrivalTime) {
                    spawnAgent(agent);
                }
                stepAgentActions(agent, motionDt);
            }

            topUpVisitors();
            applyCollisions(motionDt);

            // Animate limbs for all visible agents
            for (let i = 0; i < agents.length; i++) {
                const agent = agents[i];
                if (agent.group.visible && agent.group.parent) {
                    window.animatePersonWalking(agent.group, motionDt);
                }
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
