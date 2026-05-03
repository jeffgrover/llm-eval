// sim.js — clock, agents, day/night, render loop, HUD.

(function (root) {
    // =================== Constants ===================
    const FLOOR_HEIGHT = root.WORLD.FLOOR_HEIGHT;
    const FLOOR_COUNT = root.WORLD.FLOOR_COUNT;
    const PERSON_R = root.WORLD.PERSON_R;
    const WALK_SPEED = 1.3;            // m/s in sim time
    const TURN_SPEED = 6.0;            // rad/s in sim time
    const MAX_WORKERS = 20;            // 4 desks × 5 floors
    const MAX_VISITORS = 80;
    const MAX_OCCUPANCY = MAX_WORKERS + MAX_VISITORS;
    const DEFAULT_OCCUPANCY = 45;
    const SIT_DROP = 0.35;
    const MAX_DISPATCH_ITER = 16;
    const STALL_TIME = 1.2;            // sec of motion-time
    const ENTER_STALL = 1.5;
    const ELEV_DOOR_THRESHOLD_Z = 1.7; // world Z relative to car group (just outside doors)

    const FIRST_NAMES = [
        "Alex","Sam","Jordan","Riley","Taylor","Morgan","Casey","Quinn","Avery","Jamie",
        "Drew","Reese","Emerson","Skyler","Charlie","Devon","Hayden","Logan","Parker","Rowan",
        "Sage","Eden","Blake","Cory","Dakota","Elliot","Frankie","Greer","Harper","Ivy",
        "Jules","Kai","Lane","Mika","Niko","Ollie","Phoenix","Robin","Shay","Toby"
    ];

    // =================== State ===================
    let scene, camera, renderer, controls;
    let world, elevator;
    let ambientLight, sunLight, hemiLight;
    let agents = [];
    let agentIdNext = 0;
    let targetOccupancy = DEFAULT_OCCUPANCY;
    let lastSimDay = 0;
    const seatReservations = new Set(); // "floor:wpName"

    // =================== Clock ===================
    const Clock = {
        simMinute: 7 * 60 + 30,
        timeScale: 120, // 1x means real-time
        format() {
            let m = ((Math.floor(this.simMinute) % (24 * 60)) + 24 * 60) % (24 * 60);
            const h = Math.floor(m / 60);
            const mn = m % 60;
            const ampm = h >= 12 ? "PM" : "AM";
            const hh = ((h + 11) % 12) + 1;
            return `${(hh < 10 ? " " : "") + hh}:${mn < 10 ? "0" + mn : mn} ${ampm}`;
        },
        tick(realDt) {
            this.simMinute += realDt * this.timeScale / 60;
            const day = Math.floor(this.simMinute / (24 * 60));
            if (day !== lastSimDay) {
                lastSimDay = day;
                onDayWrap();
            }
        },
    };

    // =================== Utility ===================
    function rand(a, b) { return a + Math.random() * (b - a); }
    function randInt(a, b) { return Math.floor(rand(a, b + 1)); }
    function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

    function nodePos(floorObj, wpName) {
        const n = floorObj.nodes[wpName];
        if (!n) {
            console.warn("nodePos: missing node", wpName, "on floor", floorObj.floorNumber);
            return null;
        }
        return n.pos.clone();
    }

    function findNearestWaypoint(floorObj, worldXZ) {
        let best = null, bestD = Infinity;
        for (const name in floorObj.nodes) {
            const p = floorObj.nodes[name].pos;
            const d = (p.x - worldXZ.x) * (p.x - worldXZ.x) + (p.z - worldXZ.z) * (p.z - worldXZ.z);
            if (d < bestD) { bestD = d; best = name; }
        }
        return best;
    }

    function getAgentXZ(agent) {
        const w = new THREE.Vector3();
        agent.group.getWorldPosition(w);
        return w;
    }

    function reserveSeat(floor, wp) {
        const key = `${floor}:${wp}`;
        if (seatReservations.has(key)) return false;
        seatReservations.add(key);
        return true;
    }
    function releaseSeat(floor, wp) {
        seatReservations.delete(`${floor}:${wp}`);
    }

    function reserveConfSeat(floor) {
        const seats = ["conf_seat0","conf_seat1","conf_seat2","conf_seat3"];
        const shuffled = seats.slice().sort(() => Math.random() - 0.5);
        for (const s of shuffled) {
            if (reserveSeat(floor, s)) return s;
        }
        return null;
    }

    function releaseAllSeatsForAgent(agent) {
        if (!agent._reservedSeats) return;
        for (const key of agent._reservedSeats) {
            seatReservations.delete(key);
        }
        agent._reservedSeats.clear();
    }

    function pushSeatReservation(agent, floor, wp) {
        if (!agent._reservedSeats) agent._reservedSeats = new Set();
        agent._reservedSeats.add(`${floor}:${wp}`);
    }

    // =================== Agent factory ===================
    function makeAgent(role) {
        const group = root.createPerson({});
        const id = agentIdNext++;
        const agent = {
            id,
            role,
            name: pick(FIRST_NAMES),
            group,
            state: "DISABLED",
            plan: [],
            currentAction: null,
            // schedule
            arrivalTime: 0, lunchTime: 0, lunchDuration: 30, departureTime: 0,
            hasLunched: false,
            plannedMeetingTimes: [],
            homeFloor: null,
            deskId: null,
            deskWpName: null,
            deskDoorWpName: null,
            // walk state
            _path: [],
            _pathIdx: 0,
            _stallT: 0,
            _prevWp: null,
            // headed home flag
            _headingHome: false,
            // seat reservations made
            _reservedSeats: new Set(),
            // visitor revisit count for HUD trivia
            _visitsToday: 0,
        };
        group.userData.agentId = id;
        return agent;
    }

    function rollWorkerSchedule(a) {
        a.arrivalTime = Math.floor(rand(8 * 60 + 15, 9 * 60 + 30));
        a.lunchTime = Math.floor(rand(11 * 60 + 30, 13 * 60 + 30));
        a.lunchDuration = Math.floor(rand(25, 60));
        a.hasLunched = false;
        const isStraggler = Math.random() < 0.15;
        a.departureTime = isStraggler
            ? Math.floor(rand(18 * 60 + 30, 19 * 60 + 45))
            : Math.floor(rand(16 * 60 + 45, 18 * 60 + 30));
        a.plannedMeetingTimes = [];
        if (Math.random() < 0.55) {
            a.plannedMeetingTimes.push(Math.floor(rand(9 * 60 + 30, 11 * 60 + 30)));
        }
        if (Math.random() < 0.45) {
            a.plannedMeetingTimes.push(Math.floor(rand(13 * 60 + 30, 16 * 60)));
        }
        a._headingHome = false;
    }

    function rollVisitorSchedule(a, fromMin) {
        if (fromMin == null) fromMin = Clock.simMinute;
        // Visitors only show up during business hours-ish
        const base = Math.max(fromMin, 8 * 60);
        a.arrivalTime = Math.floor(base + randInt(0, 6));
        a.departureTime = a.arrivalTime + randInt(8, 60); // visit duration (in minutes)
        a.lunchTime = 0; // unused
        a.lunchDuration = 0;
        a.hasLunched = false;
        a.plannedMeetingTimes = [];
        a._headingHome = false;
    }

    function buildAgentPool() {
        agents = [];
        agentIdNext = 0;
        // Workers — assign one per desk. Floors 1..5 × 4 desks each = 20.
        let deskAssignments = [];
        for (let f = 1; f < FLOOR_COUNT; f++) {
            const fl = world.floors[f];
            for (const d of fl.desks) {
                deskAssignments.push({ floor: f, deskId: d.id, doorWp: d.doorWp, deskWp: d.deskWp });
            }
        }
        deskAssignments = deskAssignments.sort(() => Math.random() - 0.5);
        for (let i = 0; i < MAX_WORKERS; i++) {
            const a = makeAgent("WORKER");
            const da = deskAssignments[i];
            a.homeFloor = da.floor;
            a.deskId = da.deskId;
            a.deskDoorWpName = da.doorWp;
            a.deskWpName = da.deskWp;
            rollWorkerSchedule(a);
            agents.push(a);
        }
        // Visitors — initial arrivals spread over the business day so the
        // first wave doesn't all bottleneck the elevator. The top-up scheduler
        // recycles GONE visitors throughout the day to maintain target population.
        for (let i = 0; i < MAX_VISITORS; i++) {
            const a = makeAgent("VISITOR");
            // spread 8:00 to 18:00 (10 hr window)
            const base = 8 * 60 + Math.floor(i * (10 * 60) / MAX_VISITORS);
            rollVisitorSchedule(a, base);
            agents.push(a);
        }
        applyOccupancy();
    }

    function applyOccupancy() {
        for (const a of agents) {
            if (a.id < targetOccupancy) {
                if (a.state === "DISABLED") a.state = "AWAY";
            } else {
                // Only park as DISABLED if currently inactive
                if (a.state === "AWAY" || a.state === "GONE") {
                    a.state = "DISABLED";
                }
                // Active agents keep going; will park on day-wrap
            }
        }
    }

    function countPresent() {
        let n = 0;
        for (const a of agents) {
            if (a.state !== "AWAY" && a.state !== "GONE" && a.state !== "DISABLED") n++;
        }
        return n;
    }

    function topUpVisitors() {
        const minNow = Clock.simMinute;
        // Only top-up during business-ish hours: 7:30 AM .. 7:45 PM
        if (minNow < 7 * 60 + 30 || minNow > 19 * 60 + 45) return;
        const present = countPresent();
        let deficit = targetOccupancy - present;
        if (deficit <= 0) return;
        for (const a of agents) {
            if (deficit <= 0) break;
            if (a.role !== "VISITOR") continue;
            if (a.id >= targetOccupancy) continue;
            // Recycle GONE visitors freely. For AWAY visitors, only pull them
            // earlier if their initial arrival is far in the future — never
            // re-arm an AWAY visitor whose arrival is still pending soon
            // (otherwise we'd reset their scheduled arrival every frame and
            //  they'd never spawn).
            if (a.state === "GONE") {
                rollVisitorSchedule(a, minNow);
                a.state = "AWAY";
                deficit--;
            } else if (a.state === "AWAY" && a.arrivalTime > minNow + 30) {
                rollVisitorSchedule(a, minNow);
                a.state = "AWAY";
                deficit--;
            }
        }
    }

    // =================== Day-wrap reset ===================
    function onDayWrap() {
        // Reset elevator
        elevator.reset();
        // Release all seat reservations
        seatReservations.clear();
        // Reset every agent
        for (const a of agents) {
            // Remove from scene if present
            if (a.group.parent) a.group.parent.remove(a.group);
            a.plan = [];
            a.currentAction = null;
            a.hasLunched = false;
            a._headingHome = false;
            a._path = [];
            a._pathIdx = 0;
            a._stallT = 0;
            a._prevWp = null;
            a._reservedSeats = new Set();
            a._visitsToday = 0;
            if (a.id < targetOccupancy) {
                if (a.role === "WORKER") rollWorkerSchedule(a);
                else rollVisitorSchedule(a, 7 * 60 + 30);
                a.state = "AWAY";
            } else {
                a.state = "DISABLED";
            }
        }
    }

    // =================== Day/night lighting ===================
    // 9 keyframes covering the day, with sharp dawn/dusk
    const LIGHT_KEYFRAMES = [
        { t:  0 * 60,      sky: 0x0a0e1a, sun: 0x222244, sunI: 0.05, ambI: 0.45, hemiI: 0.32 }, // midnight
        { t:  5 * 60 + 30, sky: 0x10162a, sun: 0x442a55, sunI: 0.08, ambI: 0.45, hemiI: 0.32 }, // pre-dawn
        { t:  6 * 60,      sky: 0xff7755, sun: 0xff8855, sunI: 0.5,  ambI: 0.55, hemiI: 0.45 }, // dawn (golden)
        { t:  6 * 60 + 30, sky: 0x88aacc, sun: 0xfff2cc, sunI: 1.0,  ambI: 0.65, hemiI: 0.6 }, // sunrise complete
        { t:  9 * 60,      sky: 0x88bbe6, sun: 0xffffff, sunI: 1.1,  ambI: 0.7,  hemiI: 0.65 }, // morning
        { t: 13 * 60,      sky: 0x88bbe6, sun: 0xffffff, sunI: 1.1,  ambI: 0.7,  hemiI: 0.65 }, // midday
        { t: 17 * 60 + 30, sky: 0xeeaa66, sun: 0xff9955, sunI: 0.85, ambI: 0.6,  hemiI: 0.55 }, // dusk start
        { t: 18 * 60 + 30, sky: 0x4a3355, sun: 0x553355, sunI: 0.18, ambI: 0.5,  hemiI: 0.4 }, // dusk done
        { t: 21 * 60,      sky: 0x14182a, sun: 0x222244, sunI: 0.06, ambI: 0.45, hemiI: 0.32 }, // night
        { t: 24 * 60,      sky: 0x0a0e1a, sun: 0x222244, sunI: 0.05, ambI: 0.45, hemiI: 0.32 }, // wrap
    ];

    function lerp(a, b, t) { return a + (b - a) * t; }
    function lerpColor(a, b, t) {
        const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
        const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
        const r = Math.round(lerp(ar, br, t));
        const g = Math.round(lerp(ag, bg, t));
        const bl = Math.round(lerp(ab, bb, t));
        return (r << 16) | (g << 8) | bl;
    }

    function updateLighting() {
        const m = ((Math.floor(Clock.simMinute) % (24 * 60)) + 24 * 60) % (24 * 60);
        // find bracketing keyframes
        let ki = 0;
        for (let i = 0; i < LIGHT_KEYFRAMES.length - 1; i++) {
            if (m >= LIGHT_KEYFRAMES[i].t && m < LIGHT_KEYFRAMES[i + 1].t) { ki = i; break; }
        }
        const k0 = LIGHT_KEYFRAMES[ki], k1 = LIGHT_KEYFRAMES[ki + 1];
        const t = (m - k0.t) / (k1.t - k0.t || 1);
        const sky = lerpColor(k0.sky, k1.sky, t);
        const sunC = lerpColor(k0.sun, k1.sun, t);
        const sunI = lerp(k0.sunI, k1.sunI, t);
        const ambI = lerp(k0.ambI, k1.ambI, t);
        const hemiI = lerp(k0.hemiI, k1.hemiI, t);

        scene.background.setHex(sky);
        sunLight.color.setHex(sunC);
        sunLight.intensity = sunI;
        ambientLight.intensity = ambI;
        hemiLight.intensity = hemiI;
    }

    // =================== Plan compilers ===================
    // Each returns an array of action objects.

    function planArriveToDesk(agent) {
        const homeFloor = agent.homeFloor;
        return [
            { type: "WALK_TO_WP", floor: 0, wpName: "entrance" },
            { type: "WALK_TO_WP", floor: 0, wpName: "elevWait" },
            { type: "WAIT_AT_PANEL", floor: 0, dir: +1, toFloor: homeFloor },
            { type: "ENTER_ELEVATOR", toFloor: homeFloor },
            { type: "PRESS_FLOOR", floor: homeFloor },
            { type: "WAIT_FOR_FLOOR", floor: homeFloor },
            { type: "EXIT_ELEVATOR", toFloor: homeFloor },
            { type: "WALK_TO_WP", floor: homeFloor, wpName: agent.deskDoorWpName },
            { type: "WALK_TO_WP", floor: homeFloor, wpName: agent.deskWpName },
            { type: "SIT", floor: homeFloor, wpName: agent.deskWpName },
            { type: "ENTER_STATE", state: "AT_DESK" },
            { type: "WAIT_SIM", minutes: randInt(10, 35) },
            { type: "STAND" },
            { type: "PICK_NEXT_ACTIVITY" },
        ];
    }

    function planGoToLunch(agent) {
        const home = agent.homeFloor;
        return [
            { type: "STAND" },
            { type: "WALK_TO_WP", floor: home, wpName: agent.deskDoorWpName },
            { type: "WALK_TO_WP", floor: home, wpName: "elevWait" },
            { type: "WAIT_AT_PANEL", floor: home, dir: -1, toFloor: 0 },
            { type: "ENTER_ELEVATOR", toFloor: 0 },
            { type: "PRESS_FLOOR", floor: 0 },
            { type: "WAIT_FOR_FLOOR", floor: 0 },
            { type: "EXIT_ELEVATOR", toFloor: 0 },
            { type: "WALK_TO_WP", floor: 0, wpName: "cafe_door" },
            { type: "WALK_TO_WP", floor: 0, wpName: pick(world.floors[0].cafeSpots) },
            { type: "ENTER_STATE", state: "AT_LUNCH" },
            { type: "SIT_LATEST" }, // sit at the last walked-to waypoint
            { type: "WAIT_SIM", minutes: agent.lunchDuration },
            { type: "STAND" },
            { type: "MARK_LUNCHED" },
            { type: "WALK_TO_WP", floor: 0, wpName: "elevWait" },
            { type: "WAIT_AT_PANEL", floor: 0, dir: +1, toFloor: home },
            { type: "ENTER_ELEVATOR", toFloor: home },
            { type: "PRESS_FLOOR", floor: home },
            { type: "WAIT_FOR_FLOOR", floor: home },
            { type: "EXIT_ELEVATOR", toFloor: home },
            { type: "WALK_TO_WP", floor: home, wpName: agent.deskDoorWpName },
            { type: "WALK_TO_WP", floor: home, wpName: agent.deskWpName },
            { type: "SIT", floor: home, wpName: agent.deskWpName },
            { type: "ENTER_STATE", state: "AT_DESK" },
            { type: "WAIT_SIM", minutes: randInt(15, 50) },
            { type: "STAND" },
            { type: "PICK_NEXT_ACTIVITY" },
        ];
    }

    function planVisitLounge(agent) {
        const home = agent.homeFloor;
        const spot = pick(["lounge_spot0","lounge_spot1","lounge_spot2","water_cooler"]);
        return [
            { type: "STAND" },
            { type: "WALK_TO_WP", floor: home, wpName: agent.deskDoorWpName },
            { type: "WALK_TO_WP", floor: home, wpName: "lounge_door" },
            { type: "WALK_TO_WP", floor: home, wpName: spot },
            { type: "ENTER_STATE", state: "AT_BREAK" },
            { type: "SIT", floor: home, wpName: spot },
            { type: "WAIT_SIM", minutes: randInt(5, 12) },
            { type: "STAND" },
            { type: "WALK_TO_WP", floor: home, wpName: agent.deskDoorWpName },
            { type: "WALK_TO_WP", floor: home, wpName: agent.deskWpName },
            { type: "SIT", floor: home, wpName: agent.deskWpName },
            { type: "ENTER_STATE", state: "AT_DESK" },
            { type: "WAIT_SIM", minutes: randInt(10, 30) },
            { type: "STAND" },
            { type: "PICK_NEXT_ACTIVITY" },
        ];
    }

    function planAttendMeeting(agent) {
        const home = agent.homeFloor;
        let targetFloor = (Math.random() < 0.65) ? home : randInt(1, FLOOR_COUNT - 1);
        const seat = reserveConfSeat(targetFloor);
        if (!seat) {
            // No seats — fallback to lounge break
            return planVisitLounge(agent);
        }
        pushSeatReservation(agent, targetFloor, seat);

        const plan = [{ type: "STAND" }];
        plan.push({ type: "WALK_TO_WP", floor: home, wpName: agent.deskDoorWpName });
        if (targetFloor !== home) {
            const dir = targetFloor > home ? +1 : -1;
            plan.push({ type: "WALK_TO_WP", floor: home, wpName: "elevWait" });
            plan.push({ type: "WAIT_AT_PANEL", floor: home, dir, toFloor: targetFloor });
            plan.push({ type: "ENTER_ELEVATOR", toFloor: targetFloor });
            plan.push({ type: "PRESS_FLOOR", floor: targetFloor });
            plan.push({ type: "WAIT_FOR_FLOOR", floor: targetFloor });
            plan.push({ type: "EXIT_ELEVATOR", toFloor: targetFloor });
        }
        plan.push({ type: "WALK_TO_WP", floor: targetFloor, wpName: "conf_door" });
        plan.push({ type: "WALK_TO_WP", floor: targetFloor, wpName: "conf_center" });
        plan.push({ type: "WALK_TO_WP", floor: targetFloor, wpName: seat });
        plan.push({ type: "ENTER_STATE", state: "IN_MEETING" });
        plan.push({ type: "SIT", floor: targetFloor, wpName: seat });
        plan.push({ type: "WAIT_SIM", minutes: randInt(22, 45) });
        plan.push({ type: "STAND" });
        plan.push({ type: "RELEASE_SEAT", floor: targetFloor, wpName: seat });
        plan.push({ type: "WALK_TO_WP", floor: targetFloor, wpName: "conf_door" });
        if (targetFloor !== home) {
            const dir = targetFloor > home ? -1 : +1;
            plan.push({ type: "WALK_TO_WP", floor: targetFloor, wpName: "elevWait" });
            plan.push({ type: "WAIT_AT_PANEL", floor: targetFloor, dir, toFloor: home });
            plan.push({ type: "ENTER_ELEVATOR", toFloor: home });
            plan.push({ type: "PRESS_FLOOR", floor: home });
            plan.push({ type: "WAIT_FOR_FLOOR", floor: home });
            plan.push({ type: "EXIT_ELEVATOR", toFloor: home });
        }
        plan.push({ type: "WALK_TO_WP", floor: home, wpName: agent.deskDoorWpName });
        plan.push({ type: "WALK_TO_WP", floor: home, wpName: agent.deskWpName });
        plan.push({ type: "SIT", floor: home, wpName: agent.deskWpName });
        plan.push({ type: "ENTER_STATE", state: "AT_DESK" });
        plan.push({ type: "WAIT_SIM", minutes: randInt(15, 40) });
        plan.push({ type: "STAND" });
        plan.push({ type: "PICK_NEXT_ACTIVITY" });
        return plan;
    }

    function planVisitCoworker(agent) {
        const home = agent.homeFloor;
        // Pick someone currently AT_DESK
        const candidates = agents.filter(o =>
            o.id !== agent.id && o.role === "WORKER" &&
            o.state === "AT_DESK" && o.deskDoorWpName);
        if (candidates.length === 0) return planVisitLounge(agent);
        const target = pick(candidates);
        const tFloor = target.homeFloor;
        const tDoor = target.deskDoorWpName;

        const plan = [{ type: "STAND" }];
        plan.push({ type: "WALK_TO_WP", floor: home, wpName: agent.deskDoorWpName });
        if (tFloor !== home) {
            const dir = tFloor > home ? +1 : -1;
            plan.push({ type: "WALK_TO_WP", floor: home, wpName: "elevWait" });
            plan.push({ type: "WAIT_AT_PANEL", floor: home, dir, toFloor: tFloor });
            plan.push({ type: "ENTER_ELEVATOR", toFloor: tFloor });
            plan.push({ type: "PRESS_FLOOR", floor: tFloor });
            plan.push({ type: "WAIT_FOR_FLOOR", floor: tFloor });
            plan.push({ type: "EXIT_ELEVATOR", toFloor: tFloor });
        }
        plan.push({ type: "WALK_TO_WP", floor: tFloor, wpName: tDoor });
        plan.push({ type: "ENTER_STATE", state: "VISITING" });
        plan.push({ type: "WAIT_SIM", minutes: randInt(6, 18) });
        if (tFloor !== home) {
            const dir = tFloor > home ? -1 : +1;
            plan.push({ type: "WALK_TO_WP", floor: tFloor, wpName: "elevWait" });
            plan.push({ type: "WAIT_AT_PANEL", floor: tFloor, dir, toFloor: home });
            plan.push({ type: "ENTER_ELEVATOR", toFloor: home });
            plan.push({ type: "PRESS_FLOOR", floor: home });
            plan.push({ type: "WAIT_FOR_FLOOR", floor: home });
            plan.push({ type: "EXIT_ELEVATOR", toFloor: home });
        }
        plan.push({ type: "WALK_TO_WP", floor: home, wpName: agent.deskDoorWpName });
        plan.push({ type: "WALK_TO_WP", floor: home, wpName: agent.deskWpName });
        plan.push({ type: "SIT", floor: home, wpName: agent.deskWpName });
        plan.push({ type: "ENTER_STATE", state: "AT_DESK" });
        plan.push({ type: "WAIT_SIM", minutes: randInt(10, 30) });
        plan.push({ type: "STAND" });
        plan.push({ type: "PICK_NEXT_ACTIVITY" });
        return plan;
    }

    function planLeaveBuilding(agent) {
        const currentFloor = nearestFloorOf(agent);
        const plan = [{ type: "STAND" }];
        if (currentFloor !== 0) {
            plan.push({ type: "WALK_TO_WP", floor: currentFloor, wpName: "elevWait" });
            plan.push({ type: "WAIT_AT_PANEL", floor: currentFloor, dir: -1, toFloor: 0 });
            plan.push({ type: "ENTER_ELEVATOR", toFloor: 0 });
            plan.push({ type: "PRESS_FLOOR", floor: 0 });
            plan.push({ type: "WAIT_FOR_FLOOR", floor: 0 });
            plan.push({ type: "EXIT_ELEVATOR", toFloor: 0 });
        }
        plan.push({ type: "ENTER_STATE", state: "LEAVING" });
        plan.push({ type: "WALK_TO_WP", floor: 0, wpName: "entrance" });
        plan.push({ type: "WALK_TO_WP", floor: 0, wpName: "outside" });
        plan.push({ type: "EXIT_BUILDING" });
        return plan;
    }

    function planVisitorVisit(agent) {
        const lobby = world.floors[0];
        const plan = [];
        // start at outside, walk to entrance
        plan.push({ type: "WALK_TO_WP", floor: 0, wpName: "entrance" });

        // Roll weighted die
        const r = Math.random();
        let activity = "stand_lobby";
        if (r < 0.10) activity = "bistro";
        else if (r < 0.16) activity = "cafe_counter";
        else if (r < 0.30) activity = "front_lounge";
        else if (r < 0.42) activity = "back_lounge";
        else if (r < 0.52) activity = "stand_briefly";
        else if (r < 0.62) activity = "lobby_loiter";
        else if (r < 0.77) activity = "upper_lounge";
        else activity = "join_meeting"; // ~23%

        switch (activity) {
            case "bistro": {
                const seat = pick(lobby.cafeSpots);
                plan.push({ type: "WALK_TO_WP", floor: 0, wpName: "cafe_door" });
                plan.push({ type: "WALK_TO_WP", floor: 0, wpName: seat });
                plan.push({ type: "ENTER_STATE", state: "VISITING" });
                plan.push({ type: "SIT", floor: 0, wpName: seat });
                plan.push({ type: "WAIT_SIM", minutes: randInt(8, 28) });
                plan.push({ type: "STAND" });
                break;
            }
            case "cafe_counter": {
                plan.push({ type: "WALK_TO_WP", floor: 0, wpName: "cafe_door" });
                plan.push({ type: "WALK_TO_WP", floor: 0, wpName: "cafe_order" });
                plan.push({ type: "ENTER_STATE", state: "VISITING" });
                plan.push({ type: "SIT", floor: 0, wpName: "cafe_order" });
                plan.push({ type: "WAIT_SIM", minutes: randInt(2, 6) });
                plan.push({ type: "STAND" });
                break;
            }
            case "front_lounge": {
                const seat = pick(["fl_couch","fl_arm0","fl_arm1"]);
                plan.push({ type: "WALK_TO_WP", floor: 0, wpName: "fl_door" });
                plan.push({ type: "WALK_TO_WP", floor: 0, wpName: seat });
                plan.push({ type: "ENTER_STATE", state: "VISITING" });
                plan.push({ type: "SIT", floor: 0, wpName: seat });
                plan.push({ type: "WAIT_SIM", minutes: randInt(10, 30) });
                plan.push({ type: "STAND" });
                break;
            }
            case "back_lounge": {
                const useBackLounge = Math.random() < 0.5;
                if (useBackLounge) {
                    const seat = pick(["back_lounge_N","back_lounge_S"]);
                    plan.push({ type: "WALK_TO_WP", floor: 0, wpName: seat });
                    plan.push({ type: "ENTER_STATE", state: "VISITING" });
                    plan.push({ type: "SIT", floor: 0, wpName: seat });
                } else {
                    const seat = pick(["pit_N","pit_S","pit_E","pit_W"]);
                    plan.push({ type: "WALK_TO_WP", floor: 0, wpName: seat });
                    plan.push({ type: "ENTER_STATE", state: "VISITING" });
                    plan.push({ type: "SIT", floor: 0, wpName: seat });
                }
                plan.push({ type: "WAIT_SIM", minutes: randInt(10, 35) });
                plan.push({ type: "STAND" });
                break;
            }
            case "stand_briefly": {
                const sp = pick(["reception","kiosk","lobby_wc_front","lobby_wc_back"]);
                plan.push({ type: "WALK_TO_WP", floor: 0, wpName: sp });
                plan.push({ type: "ENTER_STATE", state: "VISITING" });
                plan.push({ type: "SIT", floor: 0, wpName: sp });
                plan.push({ type: "WAIT_SIM", minutes: randInt(2, 6) });
                plan.push({ type: "STAND" });
                break;
            }
            case "lobby_loiter": {
                const sp = pick(lobby.standSpots);
                plan.push({ type: "WALK_TO_WP", floor: 0, wpName: sp });
                plan.push({ type: "ENTER_STATE", state: "VISITING" });
                plan.push({ type: "SIT", floor: 0, wpName: sp });
                plan.push({ type: "WAIT_SIM", minutes: randInt(2, 8) });
                plan.push({ type: "STAND" });
                break;
            }
            case "upper_lounge": {
                const tFloor = randInt(1, FLOOR_COUNT - 1);
                const seat = pick(["lounge_spot0","lounge_spot1","lounge_spot2","water_cooler"]);
                plan.push({ type: "WALK_TO_WP", floor: 0, wpName: "elevWait" });
                plan.push({ type: "WAIT_AT_PANEL", floor: 0, dir: +1, toFloor: tFloor });
                plan.push({ type: "ENTER_ELEVATOR", toFloor: tFloor });
                plan.push({ type: "PRESS_FLOOR", floor: tFloor });
                plan.push({ type: "WAIT_FOR_FLOOR", floor: tFloor });
                plan.push({ type: "EXIT_ELEVATOR", toFloor: tFloor });
                plan.push({ type: "WALK_TO_WP", floor: tFloor, wpName: "lounge_door" });
                plan.push({ type: "WALK_TO_WP", floor: tFloor, wpName: seat });
                plan.push({ type: "ENTER_STATE", state: "VISITING" });
                plan.push({ type: "SIT", floor: tFloor, wpName: seat });
                plan.push({ type: "WAIT_SIM", minutes: randInt(8, 25) });
                plan.push({ type: "STAND" });
                plan.push({ type: "WALK_TO_WP", floor: tFloor, wpName: "elevWait" });
                plan.push({ type: "WAIT_AT_PANEL", floor: tFloor, dir: -1, toFloor: 0 });
                plan.push({ type: "ENTER_ELEVATOR", toFloor: 0 });
                plan.push({ type: "PRESS_FLOOR", floor: 0 });
                plan.push({ type: "WAIT_FOR_FLOOR", floor: 0 });
                plan.push({ type: "EXIT_ELEVATOR", toFloor: 0 });
                break;
            }
            case "join_meeting": {
                const tFloor = randInt(1, FLOOR_COUNT - 1);
                const seat = reserveConfSeat(tFloor);
                if (!seat) {
                    // fallback to lobby loiter
                    const sp = pick(lobby.standSpots);
                    plan.push({ type: "WALK_TO_WP", floor: 0, wpName: sp });
                    plan.push({ type: "ENTER_STATE", state: "VISITING" });
                    plan.push({ type: "SIT", floor: 0, wpName: sp });
                    plan.push({ type: "WAIT_SIM", minutes: randInt(3, 10) });
                    plan.push({ type: "STAND" });
                } else {
                    pushSeatReservation(agent, tFloor, seat);
                    plan.push({ type: "WALK_TO_WP", floor: 0, wpName: "elevWait" });
                    plan.push({ type: "WAIT_AT_PANEL", floor: 0, dir: +1, toFloor: tFloor });
                    plan.push({ type: "ENTER_ELEVATOR", toFloor: tFloor });
                    plan.push({ type: "PRESS_FLOOR", floor: tFloor });
                    plan.push({ type: "WAIT_FOR_FLOOR", floor: tFloor });
                    plan.push({ type: "EXIT_ELEVATOR", toFloor: tFloor });
                    plan.push({ type: "WALK_TO_WP", floor: tFloor, wpName: "conf_door" });
                    plan.push({ type: "WALK_TO_WP", floor: tFloor, wpName: "conf_center" });
                    plan.push({ type: "WALK_TO_WP", floor: tFloor, wpName: seat });
                    plan.push({ type: "ENTER_STATE", state: "IN_MEETING" });
                    plan.push({ type: "SIT", floor: tFloor, wpName: seat });
                    plan.push({ type: "WAIT_SIM", minutes: randInt(15, 40) });
                    plan.push({ type: "STAND" });
                    plan.push({ type: "RELEASE_SEAT", floor: tFloor, wpName: seat });
                    plan.push({ type: "WALK_TO_WP", floor: tFloor, wpName: "conf_door" });
                    plan.push({ type: "WALK_TO_WP", floor: tFloor, wpName: "elevWait" });
                    plan.push({ type: "WAIT_AT_PANEL", floor: tFloor, dir: -1, toFloor: 0 });
                    plan.push({ type: "ENTER_ELEVATOR", toFloor: 0 });
                    plan.push({ type: "PRESS_FLOOR", floor: 0 });
                    plan.push({ type: "WAIT_FOR_FLOOR", floor: 0 });
                    plan.push({ type: "EXIT_ELEVATOR", toFloor: 0 });
                }
                break;
            }
        }

        plan.push({ type: "ENTER_STATE", state: "LEAVING" });
        plan.push({ type: "WALK_TO_WP", floor: 0, wpName: "entrance" });
        plan.push({ type: "WALK_TO_WP", floor: 0, wpName: "outside" });
        plan.push({ type: "EXIT_BUILDING" });
        return plan;
    }

    function chooseNextActivity(agent) {
        const min = Clock.simMinute;
        // 1. past departure
        if (min >= agent.departureTime) return planLeaveBuilding(agent);
        // 2. planned meeting
        for (let i = 0; i < agent.plannedMeetingTimes.length; i++) {
            if (min >= agent.plannedMeetingTimes[i]) {
                agent.plannedMeetingTimes.splice(i, 1);
                return planAttendMeeting(agent);
            }
        }
        // 3. lunch window
        if (!agent.hasLunched && min >= agent.lunchTime) return planGoToLunch(agent);
        // 4. weighted
        const r = Math.random();
        if (r < 0.14) return planAttendMeeting(agent);
        if (r < 0.26) return planVisitLounge(agent);
        if (r < 0.41) return planVisitCoworker(agent);
        // fallback: keep working — wait then decide again
        return [
            { type: "ENTER_STATE", state: "AT_DESK" },
            { type: "WAIT_SIM", minutes: randInt(18, 65) },
            { type: "PICK_NEXT_ACTIVITY" },
        ];
    }

    // =================== Action runtime ===================

    function spawnAgentForArrival(agent) {
        // Place at outside (sidewalk), with jitter
        const outside = nodePos(world.floors[0], "outside");
        const jitterX = rand(-1.1, 1.1);
        const jitterZ = rand(-0.75, 0.75);
        agent.group.position.set(outside.x + jitterX, 0, outside.z + jitterZ);
        agent.group.rotation.y = Math.PI; // face into building (-Z)
        scene.add(agent.group);

        if (agent.role === "WORKER") {
            agent.state = "ARRIVING";
            agent.plan = planArriveToDesk(agent);
        } else {
            agent.state = "ARRIVING";
            agent.plan = planVisitorVisit(agent);
            agent._visitsToday++;
        }
        agent.currentAction = null;
    }

    // ---- WALK_TO_WP ----
    function startWalkAction(agent, action) {
        const fromXZ = getAgentXZ(agent);
        const floorObj = world.floors[action.floor];
        if (!floorObj) {
            console.warn("WALK_TO_WP: bad floor", action.floor);
            action._done = true;
            return;
        }
        // Source: nearest waypoint on that floor to current position
        const src = findNearestWaypoint(floorObj, fromXZ);
        const path = world.bfsPath(floorObj.nodes, src, action.wpName);
        if (!path || path.length === 0) {
            // No path — teleport
            const dest = nodePos(floorObj, action.wpName);
            if (dest) agent.group.position.set(dest.x, dest.y, dest.z);
            action._done = true;
            return;
        }
        agent._path = path;
        agent._pathIdx = 0;
        agent._stallT = 0;
        agent._prevWp = agent.group.position.clone();
        agent.group.userData.isWalking = true;
    }

    function stepWalkAction(agent, action, dt) {
        if (action._done) {
            agent.group.userData.isWalking = false;
            return true;
        }
        if (!agent._path || agent._pathIdx >= agent._path.length) {
            agent.group.userData.isWalking = false;
            return true;
        }
        const tgt = agent._path[agent._pathIdx];
        const pos = agent.group.position;
        const dx = tgt.x - pos.x;
        const dz = tgt.z - pos.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        const step = WALK_SPEED * dt;
        if (dist <= step + 0.02) {
            pos.x = tgt.x;
            pos.z = tgt.z;
            agent._pathIdx++;
            agent._prevWp = pos.clone();
            agent._stallT = 0;
            if (agent._pathIdx >= agent._path.length) {
                agent.group.userData.isWalking = false;
                return true;
            }
            return false;
        }
        const ux = dx / dist, uz = dz / dist;
        const newX = pos.x + ux * step;
        const newZ = pos.z + uz * step;
        // stall detection
        const moved = Math.hypot(newX - pos.x, newZ - pos.z);
        if (moved < 0.005) {
            agent._stallT += dt;
        } else {
            agent._stallT = Math.max(0, agent._stallT - dt * 0.5);
        }
        pos.x = newX;
        pos.z = newZ;
        // face direction
        const targetYaw = Math.atan2(ux, uz);
        agent.group.rotation.y = lerpAngle(agent.group.rotation.y, targetYaw, Math.min(1, dt * TURN_SPEED));

        if (agent._stallT > STALL_TIME) {
            // skip this waypoint
            agent._pathIdx++;
            agent._stallT = 0;
        }
        return false;
    }

    function lerpAngle(a, b, t) {
        let diff = b - a;
        while (diff > Math.PI) diff -= 2 * Math.PI;
        while (diff < -Math.PI) diff += 2 * Math.PI;
        return a + diff * t;
    }

    // ---- WAIT_AT_PANEL ----
    function startWaitAtPanel(agent, action) {
        if (action.dir > 0) elevator.callUp(action.floor);
        else elevator.callDown(action.floor);
        agent.state = "WAITING_ELEVATOR";
        agent.group.userData.isWalking = false;
    }
    function stepWaitAtPanel(agent, action, dt) {
        // re-press if cleared
        if (action.dir > 0 && !elevator.upCalls.has(action.floor)) elevator.callUp(action.floor);
        if (action.dir < 0 && !elevator.downCalls.has(action.floor)) elevator.callDown(action.floor);

        if (elevator.isAcceptingAt(action.floor, action.dir) && elevator.currentCapacityFree() > 0) {
            return true;
        }
        return false;
    }

    // ---- ENTER_ELEVATOR ----
    function startEnterElevator(agent, action) {
        action._phase = "reserve";
        action._spot = null;
        action._stallT = 0;
        agent.state = "WAITING_ELEVATOR";
    }

    function stepEnterElevator(agent, action, dt) {
        const carY = elevator.car.position.y;
        const ELEV_FLOOR_TOL = 0.2;
        // require car AT our floor with door open
        switch (action._phase) {
            case "reserve": {
                if (elevator.state !== "DOOR_OPEN") {
                    // car may have left — re-press call
                    if (action.toFloor === undefined) {
                        console.warn("ENTER_ELEVATOR missing toFloor");
                    }
                    // Determine the direction we'd want
                    const fromFloor = elevator.currentFloor; // best guess
                    // Re-press based on agent's intended direction
                    const myFloor = nearestFloorOf(agent);
                    if (action.toFloor > myFloor) elevator.callUp(myFloor);
                    else elevator.callDown(myFloor);
                    return false;
                }
                // car must be at our floor
                if (Math.abs(carY - agent.group.position.y) > ELEV_FLOOR_TOL + FLOOR_HEIGHT * 0.4) return false;
                // try reserve
                const spot = elevator.reserveBoardingSpot(agent);
                if (!spot) {
                    // full
                    return false;
                }
                action._spot = spot;
                agent.group.userData._elevatorSpotIndex = spot.index;
                action._phase = "walkToDoor";
                action._stallT = 0;
                agent.group.userData.isWalking = true;
                return false;
            }
            case "walkToDoor": {
                // Detect being abandoned by the elevator's safety-cap close
                if (!elevator.pendingBoarders.has(agent)) {
                    action._phase = "reserve";
                    action._spot = null;
                    agent.group.userData._elevatorSpotIndex = -1;
                    return false;
                }
                // Walk to door threshold lined up with this spot's X
                const spotX = action._spot.local.x;
                const tgtX = spotX; // line up x
                const tgtZ = ELEV_DOOR_THRESHOLD_Z; // just outside doors
                const carBaseY = elevator.car.position.y;
                const pos = agent.group.position;
                const dx = tgtX - pos.x;
                const dz = tgtZ - pos.z;
                const dist = Math.hypot(dx, dz);
                const step = WALK_SPEED * dt;
                if (dist <= step + 0.02) {
                    pos.x = tgtX;
                    pos.z = tgtZ;
                    pos.y = carBaseY; // step up onto floor of car
                    action._phase = "reparent";
                    action._stallT = 0;
                    return false;
                }
                const ux = dx / dist, uz = dz / dist;
                const moved = step;
                pos.x += ux * moved;
                pos.z += uz * moved;
                action._stallT += dt;
                if (action._stallT > ENTER_STALL) {
                    pos.x = tgtX;
                    pos.z = tgtZ;
                    pos.y = carBaseY;
                    action._phase = "reparent";
                    action._stallT = 0;
                    return false;
                }
                const yaw = Math.atan2(ux, uz);
                agent.group.rotation.y = lerpAngle(agent.group.rotation.y, yaw, Math.min(1, dt * TURN_SPEED));
                return false;
            }
            case "reparent": {
                // Detect being abandoned by the elevator's safety-cap close
                if (!elevator.pendingBoarders.has(agent)) {
                    action._phase = "reserve";
                    action._spot = null;
                    agent.group.userData._elevatorSpotIndex = -1;
                    return false;
                }
                // reparent scene -> car, preserving world position
                if (agent.group.parent !== elevator.car) {
                    elevator.car.attach(agent.group);
                }
                action._phase = "walkToSpot";
                action._stallT = 0;
                return false;
            }
            case "walkToSpot": {
                const spot = action._spot;
                const pos = agent.group.position;
                const tgt = spot.getLocal();
                const dx = tgt.x - pos.x;
                const dz = tgt.z - pos.z;
                const dist = Math.hypot(dx, dz);
                const step = WALK_SPEED * dt;
                if (dist <= step + 0.02) {
                    pos.x = tgt.x;
                    pos.z = tgt.z;
                    pos.y = 0;
                    agent.group.rotation.y = 0; // face -Z (toward doors? doors are at +Z) — wait: face doors which are at +Z, so face +Z
                    // Standard: face doors (+Z) so rotation.y = 0 means facing -Z by Three.js convention?
                    // In our walk code, target rotation = atan2(ux, uz). For (uz=+1) this gives 0.
                    // So rotation.y = 0 means facing +Z (toward doors). Correct.
                    elevator.completeBoard(agent);
                    agent.state = "IN_CAR";
                    agent.group.userData.isWalking = false;
                    return true;
                }
                const ux = dx / dist, uz = dz / dist;
                pos.x += ux * step;
                pos.z += uz * step;
                action._stallT += dt;
                if (action._stallT > ENTER_STALL) {
                    pos.x = tgt.x;
                    pos.z = tgt.z;
                    pos.y = 0;
                    agent.group.rotation.y = 0;
                    elevator.completeBoard(agent);
                    agent.state = "IN_CAR";
                    agent.group.userData.isWalking = false;
                    return true;
                }
                return false;
            }
        }
        return false;
    }

    function nearestFloorOf(agent) {
        // Use world Y as a hint; clamp to nearest floor index
        const worldY = (agent.group.parent === elevator.car)
            ? elevator.car.position.y
            : agent.group.position.y;
        return Math.max(0, Math.min(FLOOR_COUNT - 1, Math.round(worldY / FLOOR_HEIGHT)));
    }

    // ---- PRESS_FLOOR ----
    function startPressFloor(agent, action) {
        elevator.pressDestination(action.floor);
    }

    // ---- WAIT_FOR_FLOOR ----
    function stepWaitForFloor(agent, action, dt) {
        if (elevator.state === "DOOR_OPEN" && elevator.currentFloor === action.floor) {
            return true;
        }
        return false;
    }

    // ---- EXIT_ELEVATOR ----
    function startExitElevator(agent, action) {
        action._phase = "register";
    }

    function stepExitElevator(agent, action, dt) {
        switch (action._phase) {
            case "register": {
                elevator.registerDisembark(agent);
                action._phase = "reparent";
                return false;
            }
            case "reparent": {
                if (agent.group.parent === elevator.car) {
                    scene.attach(agent.group);
                }
                // Snap to threshold
                const tgtFloor = action.toFloor;
                const carY = elevator.car.position.y;
                agent.group.position.y = carY;
                action._phase = "walkOut";
                action._stallT = 0;
                agent.group.userData.isWalking = true;
                return false;
            }
            case "walkOut": {
                const floorObj = world.floors[action.toFloor];
                if (!floorObj) {
                    elevator.completeDisembark(agent);
                    agent.state = "ON_FLOOR";
                    return true;
                }
                const tgt = nodePos(floorObj, "elevWait");
                const pos = agent.group.position;
                const dx = tgt.x - pos.x;
                const dz = tgt.z - pos.z;
                const dist = Math.hypot(dx, dz);
                const step = WALK_SPEED * dt;
                if (dist <= step + 0.02) {
                    pos.x = tgt.x;
                    pos.z = tgt.z;
                    pos.y = action.toFloor * FLOOR_HEIGHT;
                    elevator.completeDisembark(agent);
                    agent.state = "ON_FLOOR";
                    agent.group.userData.isWalking = false;
                    return true;
                }
                const ux = dx / dist, uz = dz / dist;
                pos.x += ux * step;
                pos.z += uz * step;
                pos.y = action.toFloor * FLOOR_HEIGHT;
                action._stallT += dt;
                if (action._stallT > ENTER_STALL * 1.5) {
                    pos.x = tgt.x; pos.z = tgt.z;
                    pos.y = action.toFloor * FLOOR_HEIGHT;
                    elevator.completeDisembark(agent);
                    agent.state = "ON_FLOOR";
                    agent.group.userData.isWalking = false;
                    return true;
                }
                const yaw = Math.atan2(ux, uz);
                agent.group.rotation.y = lerpAngle(agent.group.rotation.y, yaw, Math.min(1, dt * TURN_SPEED));
                return false;
            }
        }
        return false;
    }

    // ---- SIT ----
    function startSit(agent, action) {
        const floorObj = world.floors[action.floor];
        if (!floorObj) return;
        const wp = nodePos(floorObj, action.wpName);
        const target = floorObj.sitTargets[action.wpName];
        if (!wp) return;
        if (target && target.sit === false) {
            // standing waypoint — apply jitter so two visitors don't snap to identical coords
            const ang = Math.random() * Math.PI * 2;
            const radius = 0.35 + Math.random() * 0.4;
            agent.group.position.set(wp.x + Math.cos(ang) * radius, action.floor * FLOOR_HEIGHT, wp.z + Math.sin(ang) * radius);
            if (target.facing != null) agent.group.rotation.y = target.facing;
            agent.group.userData.isSitting = false;
            agent.group.userData.isWalking = false;
            return;
        }
        // sit
        agent.group.position.set(wp.x, action.floor * FLOOR_HEIGHT - SIT_DROP, wp.z);
        if (target && target.facing != null) {
            agent.group.rotation.y = target.facing;
        }
        agent.group.userData.isSitting = true;
        agent.group.userData.isWalking = false;
        agent._lastSatWp = { floor: action.floor, wpName: action.wpName };
    }

    // SIT_LATEST — sit at the last walked-to waypoint
    function startSitLatest(agent, action) {
        // Find the most recent WALK_TO_WP from the original plan: not easy.
        // Instead store from the previous WALK action; but for simplicity we look at agent.position.
        // Actually let's scan back: store last walk target as _lastWalkWp.
        if (!agent._lastWalkWp) return;
        startSit(agent, { floor: agent._lastWalkWp.floor, wpName: agent._lastWalkWp.wpName });
    }

    // ---- STAND ----
    function startStand(agent, action) {
        // Just clear sitting flag, restore y. Do NOT release seat reservation.
        agent.group.userData.isSitting = false;
        const inCar = agent.group.parent === elevator.car;
        agent.group.position.y = inCar ? 0 : Math.round(agent.group.position.y / FLOOR_HEIGHT) * FLOOR_HEIGHT;
    }

    // ---- RELEASE_SEAT ----
    function startReleaseSeat(agent, action) {
        releaseSeat(action.floor, action.wpName);
        if (agent._reservedSeats) agent._reservedSeats.delete(`${action.floor}:${action.wpName}`);
    }

    // ---- WAIT_SIM ----
    function startWaitSim(agent, action) {
        action._untilMin = Clock.simMinute + action.minutes;
    }
    function stepWaitSim(agent, action, dt) {
        return Clock.simMinute >= action._untilMin;
    }

    // ---- EXIT_BUILDING ----
    function startExitBuilding(agent, action) {
        if (agent.group.parent) agent.group.parent.remove(agent.group);
        agent.state = "GONE";
        // release any leftover seat reservations (defensive)
        releaseAllSeatsForAgent(agent);
    }

    // ---- ENTER_STATE ----
    function startEnterState(agent, action) {
        agent.state = action.state;
    }

    // ---- MARK_LUNCHED ----
    function startMarkLunched(agent, action) {
        agent.hasLunched = true;
    }

    // ---- PICK_NEXT_ACTIVITY ----
    function startPickNext(agent, action) {
        const next = chooseNextActivity(agent);
        // splice next plan in front of any remaining
        agent.plan = next.concat(agent.plan);
    }

    // ---- Action dispatch table ----
    const ACTIONS = {
        WALK_TO_WP: { start: (a, x) => {
            if (x._lastWalkSet) return; // don't redo on resume
            startWalkAction(a, x);
            a._lastWalkWp = { floor: x.floor, wpName: x.wpName };
            x._lastWalkSet = true;
        }, step: stepWalkAction, instant: false },

        WAIT_AT_PANEL: { start: startWaitAtPanel, step: stepWaitAtPanel, instant: false },
        ENTER_ELEVATOR: { start: startEnterElevator, step: stepEnterElevator, instant: false },
        PRESS_FLOOR: { start: startPressFloor, step: () => true, instant: true },
        WAIT_FOR_FLOOR: { start: () => {}, step: stepWaitForFloor, instant: false },
        EXIT_ELEVATOR: { start: startExitElevator, step: stepExitElevator, instant: false },
        SIT: { start: startSit, step: () => true, instant: true },
        SIT_LATEST: { start: startSitLatest, step: () => true, instant: true },
        STAND: { start: startStand, step: () => true, instant: true },
        RELEASE_SEAT: { start: startReleaseSeat, step: () => true, instant: true },
        WAIT_SIM: { start: startWaitSim, step: stepWaitSim, instant: false },
        EXIT_BUILDING: { start: startExitBuilding, step: () => true, instant: true },
        ENTER_STATE: { start: startEnterState, step: () => true, instant: true },
        MARK_LUNCHED: { start: startMarkLunched, step: () => true, instant: true },
        PICK_NEXT_ACTIVITY: { start: startPickNext, step: () => true, instant: true },
    };

    function processAgent(agent, motionDt) {
        // Spawn check (AWAY → arriving)
        if (agent.state === "AWAY" && Clock.simMinute >= agent.arrivalTime) {
            spawnAgentForArrival(agent);
        }

        // End-of-day override for workers
        if (agent.role === "WORKER" && agent.state !== "AWAY" && agent.state !== "GONE" &&
            agent.state !== "DISABLED" && agent.state !== "LEAVING" && !agent._headingHome &&
            Clock.simMinute >= agent.departureTime) {
            // Replan to leave — but only if not currently in elevator transit (let them complete that segment)
            if (agent.state === "AT_DESK" || agent.state === "IN_MEETING" || agent.state === "AT_BREAK" ||
                agent.state === "ON_FLOOR" || agent.state === "VISITING") {
                // release any current seat reservations from in-flight plan
                releaseAllSeatsForAgent(agent);
                agent.plan = planLeaveBuilding(agent);
                agent.currentAction = null;
                agent._headingHome = true;
            }
        }

        // Action dispatch loop
        let i = 0;
        while (i < MAX_DISPATCH_ITER) {
            if (!agent.currentAction) {
                if (agent.plan.length === 0) break;
                agent.currentAction = agent.plan.shift();
                const handler = ACTIONS[agent.currentAction.type];
                if (!handler) {
                    console.warn("Unknown action type", agent.currentAction.type);
                    agent.currentAction = null;
                    i++;
                    continue;
                }
                handler.start(agent, agent.currentAction);
            }
            const handler = ACTIONS[agent.currentAction.type];
            const done = handler.step(agent, agent.currentAction, motionDt);
            if (done) {
                agent.currentAction = null;
                i++;
                continue;
            } else {
                break;
            }
        }
    }

    // =================== Collisions ===================
    function applyCollisions() {
        // Group agents by parent (scene vs elevator car) and by approximate y
        const buckets = new Map();
        for (const a of agents) {
            if (a.state === "AWAY" || a.state === "GONE" || a.state === "DISABLED") continue;
            if (a.group.userData.isSitting) continue;
            // Skip agents currently parented to elevator car — interior spots are pre-assigned
            if (a.group.parent === elevator.car) continue;
            const yKey = Math.round(a.group.position.y / FLOOR_HEIGHT);
            const key = "scene:" + yKey;
            if (!buckets.has(key)) buckets.set(key, []);
            buckets.get(key).push(a);
        }
        const PUSH = 0.18;
        const RAD = 0.7;
        for (const arr of buckets.values()) {
            for (let i = 0; i < arr.length; i++) {
                const ai = arr[i];
                // Skip boarders from receiving push (they need to push through crowd)
                const aiBoarding = ai.currentAction && ai.currentAction.type === "ENTER_ELEVATOR";
                for (let j = i + 1; j < arr.length; j++) {
                    const aj = arr[j];
                    const ajBoarding = aj.currentAction && aj.currentAction.type === "ENTER_ELEVATOR";
                    // skip both if either is boarding (boarder exempt)
                    if (aiBoarding || ajBoarding) continue;
                    const dx = aj.group.position.x - ai.group.position.x;
                    const dz = aj.group.position.z - ai.group.position.z;
                    const d = Math.hypot(dx, dz);
                    if (d > RAD) continue;
                    let nx, nz;
                    if (d < 1e-3) {
                        const ang = Math.random() * Math.PI * 2;
                        nx = Math.cos(ang); nz = Math.sin(ang);
                    } else {
                        nx = dx / d; nz = dz / d;
                    }
                    const overlap = (RAD - d) * PUSH;
                    ai.group.position.x -= nx * overlap;
                    ai.group.position.z -= nz * overlap;
                    aj.group.position.x += nx * overlap;
                    aj.group.position.z += nz * overlap;
                }
            }
        }
    }

    // =================== Render loop ===================
    let realClock;
    function render() {
        requestAnimationFrame(render);
        const realDt = Math.min(0.05, realClock.getDelta());
        Clock.tick(realDt);
        updateLighting();
        const motionDt = realDt * Clock.timeScale;

        elevator.tick(motionDt);

        // top-up visitors
        topUpVisitors();

        for (const a of agents) {
            if (a.state === "DISABLED") continue;
            processAgent(a, motionDt);
        }

        applyCollisions();

        for (const a of agents) {
            if (a.state === "AWAY" || a.state === "GONE" || a.state === "DISABLED") continue;
            if (!a.group.parent) continue;
            root.animatePersonWalking(a.group, motionDt);
        }

        controls.update();
        renderer.render(scene, camera);
        updateHUD();
    }

    // =================== HUD ===================
    let hudEls = {};
    function buildHUD() {
        const panel = document.createElement("div");
        panel.style.cssText = `
            position: fixed; top: 12px; left: 12px;
            background: rgba(20,24,40,0.78); color: #eee;
            padding: 12px 14px; border-radius: 8px;
            font: 13px/1.4 system-ui, sans-serif;
            min-width: 260px; z-index: 1000;
            border: 1px solid rgba(255,255,255,0.1);
        `;
        const time = document.createElement("div");
        time.style.cssText = "font: 600 24px monospace; margin-bottom: 8px; color: #ffbb22;";
        panel.appendChild(time);

        const speedRow = document.createElement("div");
        speedRow.style.marginBottom = "8px";
        speedRow.innerHTML = `<label style="font-size:11px;color:#aaa;">Speed: <span id="hud-speed">120x</span></label><br>`;
        const speedSlider = document.createElement("input");
        speedSlider.type = "range";
        speedSlider.min = "0";
        speedSlider.max = "100";
        speedSlider.value = "75"; // ~= 120x on log scale
        speedSlider.style.width = "100%";
        speedRow.appendChild(speedSlider);
        panel.appendChild(speedRow);

        const occRow = document.createElement("div");
        occRow.style.marginBottom = "8px";
        occRow.innerHTML = `<label style="font-size:11px;color:#aaa;">Occupancy: <span id="hud-occ">${DEFAULT_OCCUPANCY} / ${MAX_OCCUPANCY} people</span></label><br>`;
        const occSlider = document.createElement("input");
        occSlider.type = "range";
        occSlider.min = "1";
        occSlider.max = String(MAX_OCCUPANCY);
        occSlider.value = String(DEFAULT_OCCUPANCY);
        occSlider.style.width = "100%";
        occRow.appendChild(occSlider);
        panel.appendChild(occRow);

        const stats = document.createElement("div");
        stats.style.cssText = "font: 11px/1.5 monospace; color: #ccc;";
        panel.appendChild(stats);

        document.body.appendChild(panel);

        hudEls = { time, stats, speedSlider, occSlider };

        speedSlider.addEventListener("input", () => {
            // log scale 1..600
            const v = parseFloat(speedSlider.value) / 100;
            const ts = Math.pow(10, lerp(0, Math.log10(600), v));
            Clock.timeScale = Math.max(1, Math.min(600, ts));
            document.getElementById("hud-speed").textContent = `${Clock.timeScale.toFixed(1)}x`;
        });
        // initial value
        speedSlider.dispatchEvent(new Event("input"));

        occSlider.addEventListener("input", () => {
            targetOccupancy = parseInt(occSlider.value, 10);
            document.getElementById("hud-occ").textContent = `${targetOccupancy} / ${MAX_OCCUPANCY} people`;
            applyOccupancy();
        });
    }

    function updateHUD() {
        if (!hudEls.time) return;
        hudEls.time.textContent = Clock.format();
        // state breakdown
        const counts = {};
        for (const a of agents) {
            counts[a.state] = (counts[a.state] || 0) + 1;
        }
        const stateOrder = ["AT_DESK","IN_CAR","WAITING_ELEVATOR","ON_FLOOR","ARRIVING",
                            "VISITING","IN_MEETING","AT_BREAK","AT_LUNCH","LEAVING","AWAY","GONE","DISABLED"];
        let html = `<b>Present:</b> ${countPresent()}/${targetOccupancy}<br>`;
        for (const s of stateOrder) {
            if (counts[s]) html += `&nbsp;&nbsp;${s}: ${counts[s]}<br>`;
        }
        html += `<br><b>Elevator</b><br>`;
        html += `&nbsp;&nbsp;Floor: ${elevator.currentFloor} (target ${elevator.targetFloor})<br>`;
        html += `&nbsp;&nbsp;Dir: ${elevator.direction === 1 ? "UP" : elevator.direction === -1 ? "DOWN" : "—"}<br>`;
        html += `&nbsp;&nbsp;State: ${elevator.state}<br>`;
        html += `&nbsp;&nbsp;Riders: ${elevator.passengers.size}/4 (pending in: ${elevator.pendingBoarders.size}, out: ${elevator.pendingDisembark.size})<br>`;
        html += `&nbsp;&nbsp;Dest: ${[...elevator.destinations].sort().join(",") || "—"}<br>`;
        html += `&nbsp;&nbsp;Up calls: ${[...elevator.upCalls].sort().join(",") || "—"}<br>`;
        html += `&nbsp;&nbsp;Down calls: ${[...elevator.downCalls].sort().join(",") || "—"}<br>`;
        hudEls.stats.innerHTML = html;
    }

    // =================== Boot ===================
    function init() {
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x88bbe6);

        camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 500);
        camera.position.set(28, 24, 28);
        camera.lookAt(0, 8, 0);

        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.sortObjects = true;
        document.body.appendChild(renderer.domElement);

        controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.target.set(0, 8, 0);
        controls.update();

        ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
        scene.add(ambientLight);

        sunLight = new THREE.DirectionalLight(0xffffff, 1.0);
        sunLight.position.set(40, 50, 30);
        scene.add(sunLight);

        hemiLight = new THREE.HemisphereLight(0xbbeeff, 0x444400, 0.6);
        scene.add(hemiLight);

        world = root.createWorld(scene);
        elevator = new root.Elevator(scene, world);

        buildAgentPool();
        buildHUD();

        window.addEventListener("resize", () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        });

        realClock = new THREE.Clock();
        render();
    }

    // Expose for debugging
    root.SimDebug = {
        get agents() { return agents; },
        get clock() { return Clock; },
        get elevator() { return elevator; },
        get world() { return world; },
        seatReservations,
    };

    // Auto-boot
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})(typeof window !== "undefined" ? window : globalThis);
