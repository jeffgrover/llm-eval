// sim.js - simulated clock, day/night lighting, agent state machine + daily
// schedules, render loop and HUD.  Classic browser script: no import / export.

// ---------------------------------------------------------------------------
// tuning constants
// ---------------------------------------------------------------------------
const MAX_WORKERS = 20;
const MAX_VISITORS = 80;
const MAX_OCCUPANCY = MAX_WORKERS + MAX_VISITORS;
const DEFAULT_OCCUPANCY = 45;

const WALK_SPEED = 1.3;          // metres / second of simulated motion time
const MEETING_PROB = 0.36;
const SIT_DROP = 0.35;           // hips onto the seat instead of floating
const ARRIVE_MIN = 8 * 60 + 15;
const ARRIVE_MAX = 9 * 60 + 30;
const COLLISION_RADIUS = 0.7;
const COLLISION_PUSH = 0.18;

const FIRST_NAMES = [
    "Ada", "Ben", "Cleo", "Dmitri", "Elena", "Femi", "Greta", "Hugo", "Iris",
    "Jonas", "Kira", "Luis", "Maya", "Nils", "Oona", "Pablo", "Quinn", "Rosa",
    "Sven", "Tessa", "Umar", "Vera", "Wren", "Xiu", "Yusuf", "Zara", "Anya",
    "Bruno", "Cato", "Dora", "Emil", "Fiona", "Gus", "Hana", "Ivo", "Jia",
    "Karl", "Lena", "Milo", "Nora", "Otto", "Petra", "Rafa", "Sanne", "Theo",
    "Ulla", "Vik", "Willa", "Yara", "Zeno"
];

const ENTRANCE_CHAIN = ["outside", "front_door_threshold", "entrance", "lobby_center"];

// Long flat daytime with the transitions squeezed into a short golden hour.
const DAY_KEYFRAMES = [
    { h: 0.0, bg: 0x0a0f1e, sun: 0x2a3a66, sunI: 0.10, ambI: 0.45, hemiI: 0.32 },
    { h: 5.6, bg: 0x0d1426, sun: 0x33406e, sunI: 0.12, ambI: 0.45, hemiI: 0.32 },
    { h: 6.0, bg: 0x4a3f5c, sun: 0xff8a4a, sunI: 0.40, ambI: 0.47, hemiI: 0.36 },
    { h: 6.5, bg: 0x8fb0d6, sun: 0xffc48c, sunI: 0.78, ambI: 0.49, hemiI: 0.44 },
    { h: 7.5, bg: 0xa4c8ea, sun: 0xfff4e0, sunI: 0.92, ambI: 0.50, hemiI: 0.50 },
    { h: 17.0, bg: 0xa4c8ea, sun: 0xfff4e0, sunI: 0.92, ambI: 0.50, hemiI: 0.50 },
    { h: 17.6, bg: 0xdda579, sun: 0xffb070, sunI: 0.78, ambI: 0.49, hemiI: 0.45 },
    { h: 18.4, bg: 0x6b4d63, sun: 0xff7a4a, sunI: 0.34, ambI: 0.47, hemiI: 0.38 },
    { h: 19.2, bg: 0x0a0f1e, sun: 0x2a3a66, sunI: 0.10, ambI: 0.45, hemiI: 0.32 },
    { h: 24.0, bg: 0x0a0f1e, sun: 0x2a3a66, sunI: 0.10, ambI: 0.45, hemiI: 0.32 }
];

// ---------------------------------------------------------------------------
// module state
// ---------------------------------------------------------------------------
let scene = null;
let camera = null;
let renderer = null;
let controls = null;
let world = null;
let elevator = null;
let renderClock = null;
let sunLight = null;
let ambientLight = null;
let hemiLight = null;

let agents = [];
let seatReservations = new Set();
let targetOccupancy = DEFAULT_OCCUPANCY;
let hudTimeEl = null;
let hudStatsEl = null;
let speedInput = null;
let speedLabel = null;
let occInput = null;
let occLabel = null;
let hudTimer = 0;
let dayIndex = 0;

// ---------------------------------------------------------------------------
// simulated clock
// ---------------------------------------------------------------------------
const Clock = {
    simMinute: 7 * 60 + 30,
    timeScale: 120,
    tick: function (realDt) {
        this.simMinute += realDt * this.timeScale / 60;
        if (this.simMinute >= 24 * 60) {
            this.simMinute -= 24 * 60;
            dayIndex += 1;
            startNewDay();
        }
    },
    format: function () {
        const total = Math.floor(this.simMinute);
        let hour = Math.floor(total / 60) % 24;
        const minute = total % 60;
        const suffix = hour < 12 ? "AM" : "PM";
        hour = hour % 12;
        if (hour === 0) hour = 12;
        const hh = hour < 10 ? " " + hour : String(hour);
        const mm = minute < 10 ? "0" + minute : String(minute);
        return hh + ":" + mm + " " + suffix;
    }
};

// ---------------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------------
function randRange(lo, hi) {
    return lo + Math.random() * (hi - lo);
}

function randInt(lo, hi) {
    return Math.floor(lo + Math.random() * (hi - lo + 1));
}

function pickOne(list) {
    return list[Math.floor(Math.random() * list.length)];
}

function floorRecord(floorNumber) {
    return world.floors[floorNumber];
}

function seatKeyFor(floorNumber, wpName) {
    return floorNumber + ":" + wpName;
}

function reserveSeat(agent, floorNumber, wpName) {
    const key = seatKeyFor(floorNumber, wpName);
    if (seatReservations.has(key)) return null;
    seatReservations.add(key);
    agent.heldSeats.push(key);
    return key;
}

function reserveAnySeat(agent, floorNumber, names) {
    const order = names.slice();
    for (let i = order.length - 1; i > 0; i -= 1) {
        const j = randInt(0, i);
        const tmp = order[i];
        order[i] = order[j];
        order[j] = tmp;
    }
    for (let i = 0; i < order.length; i += 1) {
        const key = reserveSeat(agent, floorNumber, order[i]);
        if (key) return { wp: order[i], key: key };
    }
    return null;
}

function releaseSeatKey(agent, key) {
    if (!key) return;
    seatReservations.delete(key);
    const at = agent.heldSeats.indexOf(key);
    if (at !== -1) agent.heldSeats.splice(at, 1);
}

function releaseAllSeats(agent) {
    for (let i = 0; i < agent.heldSeats.length; i += 1) {
        seatReservations.delete(agent.heldSeats[i]);
    }
    agent.heldSeats.length = 0;
}

const CONF_SEATS = ["conf_seat0", "conf_seat1", "conf_seat2", "conf_seat3"];

// ---------------------------------------------------------------------------
// primitive action constructors
// ---------------------------------------------------------------------------
function aWalk(floorNumber, wpName) {
    return { type: "WALK_TO_WP", floor: floorNumber, wp: wpName };
}
function aWaitPanel(floorNumber, dir, toFloor) {
    return { type: "WAIT_AT_PANEL", floor: floorNumber, dir: dir, toFloor: toFloor };
}
function aEnterElevator(toFloor) {
    return { type: "ENTER_ELEVATOR", toFloor: toFloor };
}
function aPressFloor(floorNumber) {
    return { type: "PRESS_FLOOR", floor: floorNumber };
}
function aWaitForFloor(floorNumber) {
    return { type: "WAIT_FOR_FLOOR", floor: floorNumber };
}
function aExitElevator(toFloor) {
    return { type: "EXIT_ELEVATOR", toFloor: toFloor };
}
function aSit(floorNumber, wpName) {
    return { type: "SIT", floor: floorNumber, wp: wpName };
}
function aStand() {
    return { type: "STAND" };
}
function aReleaseSeat(key) {
    return { type: "RELEASE_SEAT", key: key };
}
function aWaitSim(minutes) {
    return { type: "WAIT_SIM", minutes: minutes };
}
function aExitBuilding() {
    return { type: "EXIT_BUILDING" };
}
function aState(stateName) {
    return { type: "ENTER_STATE", state: stateName };
}
function aMarkLunched() {
    return { type: "MARK_LUNCHED" };
}
function aPickNext() {
    return { type: "PICK_NEXT_ACTIVITY" };
}

function ride(fromFloor, toFloor) {
    if (fromFloor === toFloor) return [];
    const dir = toFloor > fromFloor ? 1 : -1;
    return [
        aWalk(fromFloor, "elevWait"),
        aState("WAITING_ELEVATOR"),
        aWaitPanel(fromFloor, dir, toFloor),
        aEnterElevator(toFloor),
        aState("IN_CAR"),
        aPressFloor(toFloor),
        aWaitForFloor(toFloor),
        aExitElevator(toFloor),
        aState("ON_FLOOR")
    ];
}

function concatPlan(target, more) {
    for (let i = 0; i < more.length; i += 1) target.push(more[i]);
    return target;
}

// ---------------------------------------------------------------------------
// goal -> plan compilers
// ---------------------------------------------------------------------------
function planArriveToDesk(agent) {
    const plan = [
        aState("ARRIVING"),
        aWalk(0, "front_door_threshold"),
        aWalk(0, "entrance"),
        aWalk(0, "lobby_center")
    ];
    concatPlan(plan, ride(0, agent.homeFloor));
    plan.push(aWalk(agent.homeFloor, agent.deskDoorWpName));
    plan.push(aWalk(agent.homeFloor, agent.deskWpName));
    plan.push(aSit(agent.homeFloor, agent.deskWpName));
    plan.push(aState("AT_DESK"));
    plan.push(aWaitSim(randRange(12, 40)));
    plan.push(aPickNext());
    return plan;
}

function planGoToLunch(agent) {
    const seat = reserveAnySeat(agent, 0, floorRecord(0).bistroSpots);
    const plan = [aStand(), aWalk(agent.floor, agent.deskDoorWpName)];
    concatPlan(plan, ride(agent.floor, 0));
    plan.push(aWalk(0, "cafe_door"));
    if (seat) {
        plan.push(aWalk(0, seat.wp));
        plan.push(aSit(0, seat.wp));
        plan.push(aState("AT_LUNCH"));
        plan.push(aWaitSim(agent.lunchDuration));
        plan.push(aStand());
        plan.push(aReleaseSeat(seat.key));
    } else {
        plan.push(aWalk(0, "cafe_order"));
        plan.push(aSit(0, "cafe_order"));
        plan.push(aState("AT_LUNCH"));
        plan.push(aWaitSim(Math.min(agent.lunchDuration, 22)));
        plan.push(aStand());
    }
    plan.push(aMarkLunched());
    plan.push(aWalk(0, "lobby_center"));
    concatPlan(plan, ride(0, agent.homeFloor));
    plan.push(aWalk(agent.homeFloor, agent.deskDoorWpName));
    plan.push(aWalk(agent.homeFloor, agent.deskWpName));
    plan.push(aSit(agent.homeFloor, agent.deskWpName));
    plan.push(aState("AT_DESK"));
    plan.push(aWaitSim(randRange(20, 60)));
    plan.push(aPickNext());
    return plan;
}

function planVisitLounge(agent) {
    const seat = reserveAnySeat(agent, agent.floor, ["lounge_spot0", "lounge_spot1", "lounge_spot2", "lounge_spot3"]);
    const plan = [aStand(), aWalk(agent.floor, agent.deskDoorWpName), aWalk(agent.floor, "lounge_door")];
    if (seat) {
        plan.push(aWalk(agent.floor, seat.wp));
        plan.push(aSit(agent.floor, seat.wp));
        plan.push(aState("AT_BREAK"));
        plan.push(aWaitSim(randRange(5, 12)));
        plan.push(aStand());
        plan.push(aReleaseSeat(seat.key));
    } else {
        plan.push(aWalk(agent.floor, "water_cooler"));
        plan.push(aSit(agent.floor, "water_cooler"));
        plan.push(aState("AT_BREAK"));
        plan.push(aWaitSim(randRange(4, 9)));
        plan.push(aStand());
    }
    plan.push(aWalk(agent.floor, agent.deskDoorWpName));
    plan.push(aWalk(agent.floor, agent.deskWpName));
    plan.push(aSit(agent.floor, agent.deskWpName));
    plan.push(aState("AT_DESK"));
    plan.push(aWaitSim(randRange(15, 50)));
    plan.push(aPickNext());
    return plan;
}

function planAttendMeeting(agent) {
    let meetingFloor = agent.homeFloor;
    if (Math.random() > 0.65) meetingFloor = randInt(1, WORLD.FLOOR_COUNT - 1);
    const seat = reserveAnySeat(agent, meetingFloor, CONF_SEATS);
    if (!seat) return planVisitLounge(agent);

    const plan = [aStand(), aWalk(agent.floor, agent.deskDoorWpName)];
    concatPlan(plan, ride(agent.floor, meetingFloor));
    plan.push(aWalk(meetingFloor, "conf_door"));
    plan.push(aWalk(meetingFloor, seat.wp));
    plan.push(aSit(meetingFloor, seat.wp));
    plan.push(aState("IN_MEETING"));
    plan.push(aWaitSim(randRange(22, 45)));
    plan.push(aStand());
    plan.push(aReleaseSeat(seat.key));
    plan.push(aWalk(meetingFloor, "conf_door"));
    concatPlan(plan, ride(meetingFloor, agent.homeFloor));
    plan.push(aWalk(agent.homeFloor, agent.deskDoorWpName));
    plan.push(aWalk(agent.homeFloor, agent.deskWpName));
    plan.push(aSit(agent.homeFloor, agent.deskWpName));
    plan.push(aState("AT_DESK"));
    plan.push(aWaitSim(randRange(15, 45)));
    plan.push(aPickNext());
    return plan;
}

function planVisitCoworker(agent) {
    const candidates = [];
    for (let i = 0; i < agents.length; i += 1) {
        const other = agents[i];
        if (other === agent) continue;
        if (other.role !== "WORKER") continue;
        if (other.state !== "AT_DESK") continue;
        candidates.push(other);
    }
    if (!candidates.length) return planVisitLounge(agent);
    const host = pickOne(candidates);

    const plan = [aStand(), aWalk(agent.floor, agent.deskDoorWpName)];
    concatPlan(plan, ride(agent.floor, host.homeFloor));
    plan.push(aWalk(host.homeFloor, host.deskDoorWpName));
    plan.push(aSit(host.homeFloor, host.deskDoorWpName));
    plan.push(aState("AT_BREAK"));
    plan.push(aWaitSim(randRange(6, 18)));
    plan.push(aStand());
    concatPlan(plan, ride(host.homeFloor, agent.homeFloor));
    plan.push(aWalk(agent.homeFloor, agent.deskDoorWpName));
    plan.push(aWalk(agent.homeFloor, agent.deskWpName));
    plan.push(aSit(agent.homeFloor, agent.deskWpName));
    plan.push(aState("AT_DESK"));
    plan.push(aWaitSim(randRange(15, 45)));
    plan.push(aPickNext());
    return plan;
}

function planLeaveBuilding(agent) {
    const plan = [aStand(), aState("LEAVING")];
    if (agent.floor !== 0) {
        if (agent.deskDoorWpName && agent.floor === agent.homeFloor) {
            plan.push(aWalk(agent.floor, agent.deskDoorWpName));
        }
        concatPlan(plan, ride(agent.floor, 0));
        plan.push(aState("LEAVING"));
    }
    plan.push(aWalk(0, "lobby_center"));
    plan.push(aWalk(0, "entrance"));
    plan.push(aWalk(0, "front_door_threshold"));
    plan.push(aWalk(0, "outside"));
    plan.push(aExitBuilding());
    return plan;
}

// Visitors: walk in, do exactly one thing, leave.  Weights are tuned so no
// single venue dominates and the conference rooms stay busy.
function planVisitorVisit(agent) {
    const lobby = floorRecord(0);
    const plan = [
        aState("ARRIVING"),
        aWalk(0, "front_door_threshold"),
        aWalk(0, "entrance"),
        aState("VISITING")
    ];

    const roll = Math.random();
    let handled = false;

    if (roll < 0.10) {
        const seat = reserveAnySeat(agent, 0, lobby.bistroSpots);
        if (seat) {
            plan.push(aWalk(0, "cafe_door"));
            plan.push(aWalk(0, seat.wp));
            plan.push(aSit(0, seat.wp));
            plan.push(aWaitSim(randRange(10, 26)));
            plan.push(aStand());
            plan.push(aReleaseSeat(seat.key));
            handled = true;
        }
    } else if (roll < 0.16) {
        plan.push(aWalk(0, "cafe_door"));
        plan.push(aWalk(0, "cafe_order"));
        plan.push(aSit(0, "cafe_order"));
        plan.push(aWaitSim(randRange(4, 10)));
        plan.push(aStand());
        handled = true;
    } else if (roll < 0.30) {
        const seat = reserveAnySeat(agent, 0, lobby.loungeSpots);
        if (seat) {
            plan.push(aWalk(0, "flounge_center"));
            plan.push(aWalk(0, seat.wp));
            plan.push(aSit(0, seat.wp));
            plan.push(aWaitSim(randRange(8, 24)));
            plan.push(aStand());
            plan.push(aReleaseSeat(seat.key));
            handled = true;
        }
    } else if (roll < 0.42) {
        const seat = reserveAnySeat(agent, 0, lobby.backLoungeSpots);
        if (seat) {
            plan.push(aWalk(0, seat.wp));
            plan.push(aSit(0, seat.wp));
            plan.push(aWaitSim(randRange(8, 22)));
            plan.push(aStand());
            plan.push(aReleaseSeat(seat.key));
            handled = true;
        }
    } else if (roll < 0.52) {
        const spot = pickOne(lobby.serviceSpots);
        plan.push(aWalk(0, spot));
        plan.push(aSit(0, spot));
        plan.push(aWaitSim(randRange(3, 9)));
        plan.push(aStand());
        handled = true;
    } else if (roll < 0.62) {
        const spot = pickOne(lobby.standSpots);
        plan.push(aWalk(0, spot));
        plan.push(aSit(0, spot));
        plan.push(aWaitSim(randRange(5, 16)));
        plan.push(aStand());
        handled = true;
    } else if (roll < 0.77) {
        const upFloor = randInt(1, WORLD.FLOOR_COUNT - 1);
        const seat = reserveAnySeat(agent, upFloor, ["lounge_spot0", "lounge_spot1", "lounge_spot2", "lounge_spot3"]);
        concatPlan(plan, ride(0, upFloor));
        if (seat) {
            plan.push(aWalk(upFloor, "lounge_door"));
            plan.push(aWalk(upFloor, seat.wp));
            plan.push(aSit(upFloor, seat.wp));
            plan.push(aWaitSim(randRange(8, 20)));
            plan.push(aStand());
            plan.push(aReleaseSeat(seat.key));
        } else {
            const stand = pickOne(["water_cooler", "hall_stand_N", "hall_stand_S"]);
            plan.push(aWalk(upFloor, stand));
            plan.push(aSit(upFloor, stand));
            plan.push(aWaitSim(randRange(5, 14)));
            plan.push(aStand());
        }
        concatPlan(plan, ride(upFloor, 0));
        handled = true;
    } else {
        const meetFloor = randInt(1, WORLD.FLOOR_COUNT - 1);
        const seat = reserveAnySeat(agent, meetFloor, CONF_SEATS);
        if (seat) {
            concatPlan(plan, ride(0, meetFloor));
            plan.push(aWalk(meetFloor, "conf_door"));
            plan.push(aWalk(meetFloor, seat.wp));
            plan.push(aSit(meetFloor, seat.wp));
            plan.push(aState("IN_MEETING"));
            plan.push(aWaitSim(randRange(14, 30)));
            plan.push(aStand());
            plan.push(aReleaseSeat(seat.key));
            plan.push(aWalk(meetFloor, "conf_door"));
            concatPlan(plan, ride(meetFloor, 0));
            handled = true;
        }
    }

    if (!handled) {
        const spot = pickOne(lobby.standSpots);
        plan.push(aWalk(0, spot));
        plan.push(aSit(0, spot));
        plan.push(aWaitSim(randRange(5, 14)));
        plan.push(aStand());
    }

    plan.push(aState("LEAVING"));
    plan.push(aWalk(0, "lobby_center"));
    plan.push(aWalk(0, "entrance"));
    plan.push(aWalk(0, "front_door_threshold"));
    plan.push(aWalk(0, "outside"));
    plan.push(aExitBuilding());
    return plan;
}

// ---------------------------------------------------------------------------
// decision point
// ---------------------------------------------------------------------------
function chooseNextActivity(agent) {
    if (agent.role === "VISITOR") {
        agent.plan = planVisitorVisit(agent);
        return;
    }
    if (Clock.simMinute >= agent.departureTime) {
        agent.plan = planLeaveBuilding(agent);
        return;
    }
    for (let i = 0; i < agent.plannedMeetingTimes.length; i += 1) {
        if (Clock.simMinute >= agent.plannedMeetingTimes[i]) {
            agent.plannedMeetingTimes.splice(i, 1);
            agent.plan = planAttendMeeting(agent);
            return;
        }
    }
    if (Clock.simMinute >= agent.lunchTime && !agent.hasLunched) {
        agent.plan = planGoToLunch(agent);
        return;
    }
    const roll = Math.random();
    if (roll < MEETING_PROB * 0.4) {
        agent.plan = planAttendMeeting(agent);
    } else if (roll < MEETING_PROB * 0.4 + 0.12) {
        agent.plan = planVisitLounge(agent);
    } else if (roll < MEETING_PROB * 0.4 + 0.27) {
        agent.plan = planVisitCoworker(agent);
    } else {
        agent.plan = [aWaitSim(randRange(18, 65)), aPickNext()];
    }
}

// ---------------------------------------------------------------------------
// agents
// ---------------------------------------------------------------------------
function rollWorkerSchedule(agent) {
    agent.arrivalTime = randRange(ARRIVE_MIN, ARRIVE_MAX);
    agent.lunchTime = randRange(11 * 60 + 30, 13 * 60 + 30);
    agent.lunchDuration = randRange(25, 60);
    if (Math.random() < 0.15) {
        agent.departureTime = randRange(18 * 60 + 30, 19 * 60 + 45);
    } else {
        agent.departureTime = randRange(16 * 60 + 45, 18 * 60 + 30);
    }
    agent.hasLunched = false;
    agent.plannedMeetingTimes = [];
    if (Math.random() < 0.55) agent.plannedMeetingTimes.push(randRange(9 * 60 + 45, 11 * 60 + 15));
    if (Math.random() < 0.55) agent.plannedMeetingTimes.push(randRange(13 * 60 + 45, 16 * 60 + 15));
}

function rollVisitorSchedule(agent, earliest) {
    const from = earliest !== undefined ? earliest : 7 * 60 + 40;
    agent.arrivalTime = randRange(from, Math.max(from + 5, 18 * 60));
    agent.visitDuration = randRange(8, 32);
    agent.lunchTime = 0;
    agent.lunchDuration = 0;
    agent.departureTime = 24 * 60;
    agent.hasLunched = true;
    agent.plannedMeetingTimes = [];
}

function createAgent(id) {
    const group = createPerson({});
    const agent = {
        id: id,
        role: id < MAX_WORKERS ? "WORKER" : "VISITOR",
        name: pickOne(FIRST_NAMES),
        group: group,
        state: "AWAY",
        floor: 0,
        plan: [],
        currentAction: null,
        heldSeats: [],
        inCar: false,
        homeFloor: null,
        deskId: null,
        deskWpName: null,
        deskDoorWpName: null,
        walkPath: null,
        walkIndex: 0,
        spot: null,
        boardPhase: "reserve",
        exitPhase: "detach",
        doorTarget: null,
        stallT: 0,
        entranceExempt: false,
        arrivalTime: 0,
        lunchTime: 0,
        lunchDuration: 0,
        departureTime: 0,
        visitDuration: 0,
        hasLunched: false,
        plannedMeetingTimes: []
    };
    group.userData.agentName = agent.name;
    if (agent.role === "WORKER") {
        const desk = world.desks[id % world.desks.length];
        agent.homeFloor = desk.floor;
        agent.deskId = desk.id;
        agent.deskWpName = desk.wpName;
        agent.deskDoorWpName = desk.doorWpName;
        rollWorkerSchedule(agent);
    } else {
        rollVisitorSchedule(agent, 8 * 60 + 5);
    }
    return agent;
}

function buildAgents() {
    agents = [];
    for (let i = 0; i < MAX_OCCUPANCY; i += 1) {
        const agent = createAgent(i);
        if (i >= targetOccupancy) agent.state = "DISABLED";
        agents.push(agent);
    }
}

function agentIsPresent(agent) {
    return agent.state !== "AWAY" && agent.state !== "GONE" && agent.state !== "DISABLED";
}

function countPresent() {
    let n = 0;
    for (let i = 0; i < agents.length; i += 1) {
        if (agentIsPresent(agents[i])) n += 1;
    }
    return n;
}

function spawnAgent(agent) {
    const lobby = floorRecord(0);
    const spawnNode = lobby.nodes.outside;
    // Spread arrivals across the sidewalk: top-up can spawn a dozen visitors
    // in the same frame and a tight jitter piles them all on one paving slab.
    agent.group.position.set(
        spawnNode.pos.x + randRange(-4.5, 4.5),
        0,
        spawnNode.pos.z + randRange(-1.1, 1.6)
    );
    agent.group.rotation.y = Math.PI;
    agent.group.userData.isSitting = false;
    agent.group.userData.isWalking = true;
    agent.floor = 0;
    agent.inCar = false;
    agent.stallT = 0;
    agent.currentAction = null;
    agent.walkPath = null;
    scene.add(agent.group);
    agent.state = "ARRIVING";
    agent.plan = agent.role === "WORKER" ? planArriveToDesk(agent) : planVisitorVisit(agent);
}

function despawnAgent(agent) {
    if (agent.group.parent) agent.group.parent.remove(agent.group);
    releaseAllSeats(agent);
    agent.state = "GONE";
    agent.plan = [];
    agent.currentAction = null;
    agent.inCar = false;
    agent.group.userData.isWalking = false;
    agent.group.userData.isSitting = false;
}

// ---------------------------------------------------------------------------
// action execution
// ---------------------------------------------------------------------------
function actionUsesTime(action) {
    return action.type === "WALK_TO_WP" || action.type === "ENTER_ELEVATOR" || action.type === "EXIT_ELEVATOR";
}

function beginWalk(agent, floorNumber, wpName) {
    const record = floorRecord(floorNumber);
    const from = world.nearestNodeName(record.nodes, agent.group.position);
    const path = world.bfsPath(record.nodes, from, wpName);
    if (path.length > 1) {
        const first = path[0];
        const dx = first.x - agent.group.position.x;
        const dz = first.z - agent.group.position.z;
        if (Math.sqrt(dx * dx + dz * dz) < 1.2) path.shift();
    }
    agent.walkPath = path;
    agent.walkIndex = 0;
    agent.stallT = 0;
    agent.group.userData.isSitting = false;
    agent.group.userData.isWalking = true;
    agent.group.position.y = record.y;
}

function walkStep(agent, dt) {
    const path = agent.walkPath;
    if (!path || agent.walkIndex >= path.length) return true;
    if (agent.stallT > 1.2) {
        agent.stallT = 0;
        agent.walkIndex += 1;
        if (agent.walkIndex >= path.length) return true;
    }
    const target = path[agent.walkIndex];
    const pos = agent.group.position;
    const dx = target.x - pos.x;
    const dz = target.z - pos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < 0.18) {
        agent.walkIndex += 1;
        return agent.walkIndex >= path.length;
    }
    const step = WALK_SPEED * dt;
    agent.group.rotation.y = Math.atan2(dx, dz);
    if (step >= dist) {
        pos.x = target.x;
        pos.z = target.z;
        agent.walkIndex += 1;
        return agent.walkIndex >= path.length;
    }
    pos.x += (dx / dist) * step;
    pos.z += (dz / dist) * step;
    return false;
}

function startAction(agent, action) {
    if (action.type === "WALK_TO_WP") {
        beginWalk(agent, action.floor, action.wp);
    } else if (action.type === "ENTER_ELEVATOR") {
        agent.boardPhase = "reserve";
        agent.spot = null;
        agent.doorTarget = null;
        agent.stallT = 0;
        agent.group.userData.isWalking = true;
    } else if (action.type === "EXIT_ELEVATOR") {
        agent.exitPhase = "detach";
        agent.stallT = 0;
    } else if (action.type === "WAIT_SIM") {
        action.untilMin = Clock.simMinute + action.minutes;
        action.startedMin = Clock.simMinute;
    } else if (action.type === "WAIT_AT_PANEL" || action.type === "WAIT_FOR_FLOOR") {
        agent.group.userData.isWalking = false;
    }
}

function updateEnterElevator(agent, action, dt) {
    const dir = action.toFloor > agent.floor ? 1 : -1;

    // The car gave up on us (safety cap) - climb back out and try again.
    if (elevator.strandedBoarders.has(agent)) {
        elevator.strandedBoarders.delete(agent);
        if (agent.inCar) {
            scene.attach(agent.group);
            agent.inCar = false;
            const wait = floorRecord(agent.floor).nodes.elevWait;
            agent.group.position.set(wait.pos.x, floorRecord(agent.floor).y, wait.pos.z + 0.6);
        }
        agent.spot = null;
        agent.boardPhase = "reserve";
        agent.stallT = 0;
    }

    if (agent.boardPhase === "reserve") {
        if (dir > 0) elevator.callUp(agent.floor);
        else elevator.callDown(agent.floor);
        agent.group.userData.isWalking = false;
        if (!elevator.isAcceptingAt(agent.floor, dir)) return false;
        const spot = elevator.reserveBoardingSpot(agent);
        if (!spot) return false;
        agent.spot = spot;
        agent.doorTarget = elevator.doorThresholdWorld(spot.local);
        agent.boardPhase = "toDoor";
        agent.stallT = 0;
        agent.group.userData.isWalking = true;
        return false;
    }

    if (agent.boardPhase === "toDoor") {
        const pos = agent.group.position;
        const dx = agent.doorTarget.x - pos.x;
        const dz = agent.doorTarget.z - pos.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        const stalled = agent.stallT > 1.5;
        if (dist > 0.2 && !stalled) {
            const step = WALK_SPEED * dt;
            agent.group.rotation.y = Math.atan2(dx, dz);
            if (step >= dist) {
                pos.x = agent.doorTarget.x;
                pos.z = agent.doorTarget.z;
            } else {
                pos.x += (dx / dist) * step;
                pos.z += (dz / dist) * step;
                return false;
            }
        }
        // Reached the threshold (or forced through a crowd): step inside.
        agent.stallT = 0;
        elevator.group.attach(agent.group);
        agent.inCar = true;
        agent.group.position.y = 0;
        agent.boardPhase = "inside";
        return false;
    }

    if (agent.boardPhase === "inside") {
        const pos = agent.group.position;
        const dx = agent.spot.local.x - pos.x;
        const dz = agent.spot.local.z - pos.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        const step = WALK_SPEED * dt;
        if (dist > 0.12 && step < dist && agent.stallT < 1.5) {
            pos.x += (dx / dist) * step;
            pos.z += (dz / dist) * step;
            pos.y = 0;
            agent.group.rotation.y = Math.atan2(dx, dz);
            return false;
        }
        pos.set(agent.spot.local.x, 0, agent.spot.local.z);
        agent.group.rotation.y = 0; // face the doors
        agent.group.userData.isWalking = false;
        elevator.completeBoard(agent);
        agent.stallT = 0;
        return true;
    }
    return false;
}

function updateExitElevator(agent, action, dt) {
    const record = floorRecord(action.toFloor);
    if (agent.exitPhase === "detach") {
        elevator.registerDisembark(agent);
        if (agent.inCar) {
            scene.attach(agent.group);
            agent.inCar = false;
        }
        agent.floor = action.toFloor;
        agent.group.position.y = record.y;
        const wait = record.nodes.elevWait;
        agent.doorTarget = new THREE.Vector3(
            wait.pos.x + randRange(-0.55, 0.55),
            record.y,
            wait.pos.z + randRange(-0.2, 0.5)
        );
        agent.group.userData.isWalking = true;
        agent.exitPhase = "out";
        agent.stallT = 0;
        return false;
    }

    const pos = agent.group.position;
    const dx = agent.doorTarget.x - pos.x;
    const dz = agent.doorTarget.z - pos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > 0.2 && agent.stallT < 1.5) {
        const step = WALK_SPEED * dt;
        agent.group.rotation.y = Math.atan2(dx, dz);
        if (step >= dist) {
            pos.x = agent.doorTarget.x;
            pos.z = agent.doorTarget.z;
        } else {
            pos.x += (dx / dist) * step;
            pos.z += (dz / dist) * step;
            return false;
        }
    }
    pos.x = agent.doorTarget.x;
    pos.z = agent.doorTarget.z;
    pos.y = record.y;
    elevator.completeDisembark(agent);
    agent.stallT = 0;
    return true;
}

function updateAction(agent, action, dt) {
    const type = action.type;

    if (type === "WALK_TO_WP") {
        return walkStep(agent, dt);
    }
    if (type === "WAIT_AT_PANEL") {
        if (action.dir > 0) elevator.callUp(action.floor);
        else elevator.callDown(action.floor);
        agent.group.userData.isWalking = false;
        agent.group.rotation.y = Math.PI;
        return elevator.isAcceptingAt(action.floor, action.dir) && elevator.currentCapacityFree() > 0;
    }
    if (type === "ENTER_ELEVATOR") {
        return updateEnterElevator(agent, action, dt);
    }
    if (type === "PRESS_FLOOR") {
        elevator.pressDestination(action.floor);
        return true;
    }
    if (type === "WAIT_FOR_FLOOR") {
        agent.group.userData.isWalking = false;
        elevator.pressDestination(action.floor);
        return elevator.state === "DOOR_OPEN" && elevator.currentFloor === action.floor;
    }
    if (type === "EXIT_ELEVATOR") {
        return updateExitElevator(agent, action, dt);
    }
    if (type === "SIT") {
        const record = floorRecord(action.floor);
        const node = record.nodes[action.wp];
        const target = record.sitTargets[action.wp];
        if (node) {
            agent.group.position.x = node.pos.x;
            agent.group.position.z = node.pos.z;
        }
        agent.group.userData.isWalking = false;
        if (target && target.sit) {
            agent.group.rotation.y = target.facing;
            agent.group.userData.isSitting = true;
            agent.group.position.y = record.y - SIT_DROP;
        } else {
            // standing waypoint: spread out on a small ring so two visitors
            // sent to the same spot do not share one pair of shoes
            const angle = Math.random() * Math.PI * 2;
            const radius = 0.35 + Math.random() * 0.4;
            agent.group.position.x += Math.cos(angle) * radius;
            agent.group.position.z += Math.sin(angle) * radius;
            agent.group.userData.isSitting = false;
            agent.group.position.y = record.y;
            if (target) agent.group.rotation.y = target.facing;
        }
        return true;
    }
    if (type === "STAND") {
        agent.group.userData.isSitting = false;
        agent.group.position.y = agent.inCar ? 0 : floorRecord(agent.floor).y;
        return true;
    }
    if (type === "RELEASE_SEAT") {
        releaseSeatKey(agent, action.key);
        return true;
    }
    if (type === "WAIT_SIM") {
        agent.group.userData.isWalking = false;
        if (Clock.simMinute < action.startedMin) return true; // day wrapped
        return Clock.simMinute >= action.untilMin;
    }
    if (type === "EXIT_BUILDING") {
        despawnAgent(agent);
        return true;
    }
    if (type === "ENTER_STATE") {
        agent.state = action.state;
        return true;
    }
    if (type === "MARK_LUNCHED") {
        agent.hasLunched = true;
        return true;
    }
    if (type === "PICK_NEXT_ACTIVITY") {
        chooseNextActivity(agent);
        return true;
    }
    return true;
}

function updateAgent(agent, dt) {
    if (agent.state === "DISABLED") return;

    if (agent.state === "AWAY") {
        if (Clock.simMinute >= agent.arrivalTime) spawnAgent(agent);
        return;
    }
    if (agent.state === "GONE") return;

    // End-of-day override: only interrupt an agent that is parked in a wait,
    // never mid-ride.
    if (agent.role === "WORKER" && agent.state !== "LEAVING" &&
        Clock.simMinute >= agent.departureTime && !agent.inCar &&
        (!agent.currentAction || agent.currentAction.type === "WAIT_SIM")) {
        agent.currentAction = null;
        releaseAllSeats(agent);
        agent.plan = planLeaveBuilding(agent);
    }

    const startX = agent.group.position.x;
    const startZ = agent.group.position.z;

    let budget = dt;
    let guard = 0;
    while (guard < 16) {
        guard += 1;
        if (!agent.currentAction) {
            if (!agent.plan || agent.plan.length === 0) {
                if (agent.role === "VISITOR") agent.plan = planVisitorVisit(agent);
                else chooseNextActivity(agent);
                if (!agent.plan || agent.plan.length === 0) break;
            }
            agent.currentAction = agent.plan.shift();
            startAction(agent, agent.currentAction);
        }
        const usesTime = actionUsesTime(agent.currentAction);
        const done = updateAction(agent, agent.currentAction, budget);
        if (usesTime) budget = 0;
        if (agent.state === "GONE") return;
        if (!done) break;
        agent.currentAction = null;
    }

    // Stall bookkeeping (motion-seconds of near-zero progress).
    const action = agent.currentAction;
    const moving = action && (action.type === "WALK_TO_WP" || action.type === "ENTER_ELEVATOR" || action.type === "EXIT_ELEVATOR");
    if (moving) {
        const dx = agent.group.position.x - startX;
        const dz = agent.group.position.z - startZ;
        if (Math.sqrt(dx * dx + dz * dz) < 0.05 * dt) agent.stallT += dt;
        else agent.stallT = 0;
    } else {
        agent.stallT = 0;
    }

    // Arriving / leaving agents get a free pass through the door crowd.
    agent.entranceExempt = false;
    if (action && action.type === "WALK_TO_WP" && agent.floor === 0 &&
        ENTRANCE_CHAIN.indexOf(action.wp) !== -1 && agent.group.position.z > 8.2) {
        agent.entranceExempt = true;
    }
}

// ---------------------------------------------------------------------------
// crowd separation
// ---------------------------------------------------------------------------
function applyCollisions() {
    const list = [];
    for (let i = 0; i < agents.length; i += 1) {
        const agent = agents[i];
        if (!agentIsPresent(agent)) continue;
        if (agent.inCar) continue;
        if (agent.group.parent !== scene) continue;
        if (agent.group.userData.isSitting) continue;
        if (agent.entranceExempt) continue;
        if (agent.currentAction && agent.currentAction.type === "ENTER_ELEVATOR") continue;
        list.push(agent);
    }
    for (let i = 0; i < list.length; i += 1) {
        const a = list[i].group.position;
        for (let j = i + 1; j < list.length; j += 1) {
            const b = list[j].group.position;
            if (Math.abs(a.y - b.y) > 1.0) continue;
            const dx = b.x - a.x;
            const dz = b.z - a.z;
            let d = Math.sqrt(dx * dx + dz * dz);
            if (d > COLLISION_RADIUS) continue;
            let nx;
            let nz;
            if (d < 0.001) {
                const angle = Math.random() * Math.PI * 2;
                nx = Math.cos(angle);
                nz = Math.sin(angle);
                d = 0.001;
            } else {
                nx = dx / d;
                nz = dz / d;
            }
            const push = (COLLISION_RADIUS - d) * COLLISION_PUSH;
            a.x -= nx * push;
            a.z -= nz * push;
            b.x += nx * push;
            b.z += nz * push;
        }
    }
}

// ---------------------------------------------------------------------------
// occupancy management
// ---------------------------------------------------------------------------
function applyOccupancy() {
    for (let i = 0; i < agents.length; i += 1) {
        const agent = agents[i];
        const enabled = agent.id < targetOccupancy;
        if (!enabled && (agent.state === "AWAY" || agent.state === "GONE")) {
            agent.state = "DISABLED";
        } else if (enabled && agent.state === "DISABLED") {
            agent.state = "AWAY";
            if (agent.role === "VISITOR") rollVisitorSchedule(agent, Clock.simMinute);
        }
    }
}

// The building does not go from empty to packed at 07:31 - visitor traffic
// ramps with the working day and tails off in the evening.
function occupancyDayFactor() {
    const m = Clock.simMinute;
    if (m < 7 * 60 + 35) return 0;
    // a few early birds, then the real ramp into the working day
    if (m < 9 * 60 + 45) return 0.08 + 0.92 * (m - (7 * 60 + 35)) / 130;
    if (m < 16 * 60 + 30) return 1;
    if (m < 19 * 60) return Math.max(0, 1 - (m - (16 * 60 + 30)) / 150);
    return 0;
}

// Keeps the concurrent population near the slider value all day long by
// recycling visitors that have already been and gone.
function topUpVisitors() {
    if (Clock.simMinute < 7 * 60 + 35 || Clock.simMinute > 19 * 60) return;
    const effectiveTarget = Math.round(targetOccupancy * occupancyDayFactor());
    let deficit = effectiveTarget - countPresent();
    if (deficit <= 0) return;
    for (let i = 0; i < agents.length && deficit > 0; i += 1) {
        const agent = agents[i];
        if (agent.role !== "VISITOR") continue;
        if (agent.id >= targetOccupancy) continue;
        if (agent.state !== "AWAY" && agent.state !== "GONE") continue;
        agent.arrivalTime = Clock.simMinute + randInt(0, 6);
        agent.visitDuration = randRange(8, 32);
        agent.state = "AWAY";
        deficit -= 1;
    }
}

function startNewDay() {
    for (let i = 0; i < agents.length; i += 1) {
        const agent = agents[i];
        if (agent.group.parent) agent.group.parent.remove(agent.group);
        releaseAllSeats(agent);
        agent.plan = [];
        agent.currentAction = null;
        agent.walkPath = null;
        agent.spot = null;
        agent.inCar = false;
        agent.floor = 0;
        agent.stallT = 0;
        agent.hasLunched = false;
        agent.group.userData.isSitting = false;
        agent.group.userData.isWalking = false;
        if (agent.role === "WORKER") rollWorkerSchedule(agent);
        else rollVisitorSchedule(agent, 8 * 60 + 5);
        agent.state = agent.id < targetOccupancy ? "AWAY" : "DISABLED";
    }
    seatReservations.clear();
    elevator.reset();
}

// ---------------------------------------------------------------------------
// lighting
// ---------------------------------------------------------------------------
function lerpNumber(a, b, t) {
    return a + (b - a) * t;
}

function updateDayNight() {
    const hour = Clock.simMinute / 60;
    let k0 = DAY_KEYFRAMES[0];
    let k1 = DAY_KEYFRAMES[DAY_KEYFRAMES.length - 1];
    for (let i = 0; i < DAY_KEYFRAMES.length - 1; i += 1) {
        if (hour >= DAY_KEYFRAMES[i].h && hour <= DAY_KEYFRAMES[i + 1].h) {
            k0 = DAY_KEYFRAMES[i];
            k1 = DAY_KEYFRAMES[i + 1];
            break;
        }
    }
    const span = k1.h - k0.h;
    const t = span > 0 ? (hour - k0.h) / span : 0;

    const bg0 = new THREE.Color(k0.bg);
    const bg1 = new THREE.Color(k1.bg);
    scene.background = bg0.lerp(bg1, t);

    const sc0 = new THREE.Color(k0.sun);
    const sc1 = new THREE.Color(k1.sun);
    sunLight.color = sc0.lerp(sc1, t);
    sunLight.intensity = lerpNumber(k0.sunI, k1.sunI, t);
    ambientLight.intensity = lerpNumber(k0.ambI, k1.ambI, t);
    hemiLight.intensity = lerpNumber(k0.hemiI, k1.hemiI, t);

    const arc = Math.PI * (hour - 6) / 12;
    sunLight.position.set(Math.cos(arc) * 34, Math.max(6, Math.sin(arc) * 38), 18);
}

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------
function sliderToScale(value) {
    const t = value / 1000;
    return Math.max(1, Math.round(Math.exp(lerpNumber(Math.log(1), Math.log(600), t))));
}

function scaleToSlider(scale) {
    return Math.round(1000 * Math.log(scale) / Math.log(600));
}

function buildHUD() {
    const panel = document.createElement("div");
    panel.style.cssText = [
        "position:fixed", "top:12px", "left:12px", "z-index:10",
        "font-family:ui-monospace,Menlo,Consolas,monospace", "font-size:12px",
        "color:#e8eef8", "background:rgba(16,20,30,0.78)",
        "border:1px solid rgba(140,170,220,0.35)", "border-radius:8px",
        "padding:10px 12px", "width:250px", "line-height:1.45",
        "box-shadow:0 6px 20px rgba(0,0,0,0.45)"
    ].join(";");

    hudTimeEl = document.createElement("div");
    hudTimeEl.style.cssText = "font-size:26px;font-weight:700;letter-spacing:1px;color:#ffd77a;margin-bottom:6px";
    hudTimeEl.textContent = Clock.format();
    panel.appendChild(hudTimeEl);

    speedLabel = document.createElement("div");
    speedLabel.textContent = "Speed: 120x realtime";
    panel.appendChild(speedLabel);

    speedInput = document.createElement("input");
    speedInput.type = "range";
    speedInput.min = "0";
    speedInput.max = "1000";
    speedInput.step = "1";
    speedInput.value = String(scaleToSlider(Clock.timeScale));
    speedInput.style.cssText = "width:100%;margin:2px 0 8px 0";
    speedInput.addEventListener("input", (event) => {
        Clock.timeScale = sliderToScale(Number(event.target.value));
        speedLabel.textContent = "Speed: " + Clock.timeScale + "x realtime";
    });
    panel.appendChild(speedInput);

    occLabel = document.createElement("div");
    occLabel.textContent = "Occupancy: " + targetOccupancy + " / " + MAX_OCCUPANCY + " people";
    panel.appendChild(occLabel);

    occInput = document.createElement("input");
    occInput.type = "range";
    occInput.min = "1";
    occInput.max = String(MAX_OCCUPANCY);
    occInput.step = "1";
    occInput.value = String(targetOccupancy);
    occInput.style.cssText = "width:100%;margin:2px 0 8px 0";
    occInput.addEventListener("input", (event) => {
        targetOccupancy = Number(event.target.value);
        occLabel.textContent = "Occupancy: " + targetOccupancy + " / " + MAX_OCCUPANCY + " people";
        applyOccupancy();
    });
    panel.appendChild(occInput);

    hudStatsEl = document.createElement("div");
    hudStatsEl.style.cssText = "white-space:pre;color:#b9c9e2;border-top:1px solid rgba(140,170,220,0.25);padding-top:6px";
    panel.appendChild(hudStatsEl);

    document.body.appendChild(panel);
}

function setListText(set) {
    const out = [];
    set.forEach((value) => out.push(value));
    out.sort();
    return out.length ? out.join(",") : "-";
}

function updateHUD() {
    hudTimeEl.textContent = Clock.format();
    const counts = {};
    let present = 0;
    for (let i = 0; i < agents.length; i += 1) {
        const agent = agents[i];
        if (agent.state === "DISABLED") continue;
        counts[agent.state] = (counts[agent.state] || 0) + 1;
        if (agentIsPresent(agent)) present += 1;
    }
    const keys = Object.keys(counts).sort();
    const lines = [];
    lines.push("in building : " + present);
    for (let i = 0; i < keys.length; i += 1) {
        if (keys[i] === "AWAY" || keys[i] === "GONE") continue;
        lines.push(("  " + keys[i].toLowerCase() + "               ").slice(0, 16) + counts[keys[i]]);
    }
    const dirText = elevator.direction > 0 ? "up" : (elevator.direction < 0 ? "down" : "idle");
    lines.push("");
    lines.push("elevator floor " + elevator.currentFloor + " -> " + elevator.targetFloor);
    lines.push("  state  " + elevator.state.toLowerCase());
    lines.push("  dir    " + dirText);
    lines.push("  riders " + elevator.passengers.size + "/" + elevator.maxCapacity +
        " (+" + elevator.pendingBoarders.size + " boarding)");
    lines.push("  dest   " + setListText(elevator.destinations));
    lines.push("  up     " + setListText(elevator.upCalls));
    lines.push("  down   " + setListText(elevator.downCalls));
    hudStatsEl.textContent = lines.join("\n");
}

// ---------------------------------------------------------------------------
// bootstrap + render loop
// ---------------------------------------------------------------------------
function onWindowResize() {
    if (!camera || !renderer) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function startSimulation() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x20242a);
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(26, 21, 26);
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.sortObjects = true;
    document.body.appendChild(renderer.domElement);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 8, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;

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
    buildHUD();
    updateDayNight();

    renderClock = new THREE.Clock();
    window.addEventListener("resize", onWindowResize);

    function animate() {
        requestAnimationFrame(animate);
        const realDt = Math.min(0.05, renderClock.getDelta());
        Clock.tick(realDt);
        updateDayNight();

        const motionDt = realDt * Clock.timeScale;
        // Sub-step so a 600x frame does not teleport the whole building.
        const steps = Math.max(1, Math.min(8, Math.ceil(motionDt / 0.5)));
        const stepDt = motionDt / steps;
        for (let s = 0; s < steps; s += 1) {
            elevator.tick(stepDt);
            for (let i = 0; i < agents.length; i += 1) updateAgent(agents[i], stepDt);
        }
        topUpVisitors();
        applyCollisions();

        for (let i = 0; i < agents.length; i += 1) {
            const agent = agents[i];
            if (agent.group.parent) animatePersonWalking(agent.group, motionDt);
        }

        controls.update();
        renderer.render(scene, camera);

        hudTimer += realDt;
        if (hudTimer > 0.2) {
            hudTimer = 0;
            updateHUD();
        }
    }
    animate();
}

if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", startSimulation);
} else {
    startSimulation();
}
