(function () {
    "use strict";

    var scene;
    var camera;
    var renderer;
    var controls;
    var world;
    var elevator;
    var simClock;
    var sun;
    var ambient;
    var hemisphere;
    var hud;
    var timeReadout;
    var speedInput;
    var speedOutput;
    var occupancyInput;
    var occupancyOutput;
    var stateReadout;
    var agents = [];
    var seatReservations = new Set();
    var MAX_WORKERS = 20;
    var MAX_VISITORS = 80;
    var MAX_OCCUPANCY = MAX_WORKERS + MAX_VISITORS;
    var targetOccupancy = 45;
    var names = ["Alex", "Maya", "Sam", "Jordan", "Priya", "Leo", "Avery", "Noah", "Zoe", "Nina", "Omar", "Iris", "Ben", "Rae", "Kai", "Mina", "Eli", "Tess", "Hugo", "Cora", "Miles", "Jules", "Aria", "Theo"];
    var dayFrames = [
        { minute: 0, bg: 0x172033, sun: 0x405478, si: 0.12, ai: 0.45, hi: 0.32 },
        { minute: 330, bg: 0x202a3f, sun: 0x8da1c0, si: 0.25, ai: 0.45, hi: 0.32 },
        { minute: 360, bg: 0x8d7392, sun: 0xffa86b, si: 0.62, ai: 0.55, hi: 0.38 },
        { minute: 390, bg: 0x92c6ed, sun: 0xffe1ad, si: 0.95, ai: 0.68, hi: 0.5 },
        { minute: 540, bg: 0x8fc6e8, sun: 0xffffff, si: 1.05, ai: 0.72, hi: 0.58 },
        { minute: 1020, bg: 0x8fc6e8, sun: 0xffffff, si: 1.03, ai: 0.72, hi: 0.58 },
        { minute: 1050, bg: 0xf0af7d, sun: 0xffa658, si: 0.78, ai: 0.62, hi: 0.46 },
        { minute: 1110, bg: 0x3b4a68, sun: 0x8093bd, si: 0.25, ai: 0.48, hi: 0.34 },
        { minute: 1440, bg: 0x172033, sun: 0x405478, si: 0.12, ai: 0.45, hi: 0.32 }
    ];

    function SimClock() {
        this.simMinute = 7 * 60 + 30;
        this.timeScale = 120;
        this.realClock = new THREE.Clock();
    }

    SimClock.prototype.tick = function (realDt) {
        this.simMinute += realDt * this.timeScale / 60;
        if (this.simMinute >= 24 * 60) {
            this.simMinute -= 24 * 60;
            return true;
        }
        return false;
    };

    SimClock.prototype.format = function () {
        var minutes = Math.floor(this.simMinute) % (24 * 60);
        var hour = Math.floor(minutes / 60);
        var minute = minutes % 60;
        var suffix = hour >= 12 ? "PM" : "AM";
        var displayHour = hour % 12 || 12;
        return " " + displayHour + ":" + String(minute).padStart(2, "0") + " " + suffix;
    };

    function randInt(minimum, maximum) {
        return minimum + Math.floor(Math.random() * (maximum - minimum + 1));
    }

    function randomItem(list) {
        return list[Math.floor(Math.random() * list.length)];
    }

    function action(type, values) {
        var result = values || {};
        result.type = type;
        return result;
    }

    function walk(floor, wpName) {
        return action("WALK_TO_WP", { floor: floor, wpName: wpName });
    }

    function waitSim(minutes) {
        return action("WAIT_SIM", { minutes: minutes });
    }

    function elevatorTrip(fromFloor, toFloor) {
        var direction = toFloor > fromFloor ? 1 : -1;
        if (fromFloor === toFloor) return [];
        return [
            walk(fromFloor, "elevWait"),
            action("WAIT_AT_PANEL", { floor: fromFloor, dir: direction, toFloor: toFloor }),
            action("ENTER_ELEVATOR", { toFloor: toFloor, fromFloor: fromFloor }),
            action("PRESS_FLOOR", { floor: toFloor }),
            action("WAIT_FOR_FLOOR", { floor: toFloor }),
            action("EXIT_ELEVATOR", { toFloor: toFloor })
        ];
    }

    function concatPlans(first, second, third, fourth, fifth, sixth) {
        var result = [];
        var index;
        var plan;
        var plans = [first, second, third, fourth, fifth, sixth];
        for (index = 0; index < plans.length; index += 1) {
            plan = plans[index];
            if (Array.isArray(plan)) result = result.concat(plan);
            else if (plan) result.push(plan);
        }
        return result;
    }

    function homeDesk(agent) {
        return world.floors[agent.homeFloor].desks.find(function (deskItem) { return deskItem.id === agent.deskId; });
    }

    function scheduleAgent(agent, now) {
        var meetingCount;
        agent.hasLunched = false;
        agent.plannedMeetingTimes = [];
        agent.lunchTime = randInt(11 * 60 + 30, 13 * 60 + 30);
        agent.lunchDuration = randInt(25, 60);
        if (agent.role === "WORKER") {
            agent.arrivalTime = randInt(8 * 60 + 15, 9 * 60 + 30);
            agent.departureTime = Math.random() < 0.15 ? randInt(18 * 60 + 30, 19 * 60 + 45) : randInt(16 * 60 + 45, 18 * 60 + 30);
            meetingCount = randInt(0, 2);
            if (meetingCount > 0) agent.plannedMeetingTimes.push(randInt(9 * 60 + 45, 11 * 60 + 30));
            if (meetingCount > 1) agent.plannedMeetingTimes.push(randInt(13 * 60 + 30, 16 * 60 + 30));
            agent.plannedMeetingTimes.sort(function (a, b) { return a - b; });
        } else {
            agent.arrivalTime = now + randInt(0, 6);
            agent.visitDuration = randInt(12, 40);
            agent.departureTime = agent.arrivalTime + agent.visitDuration;
        }
    }

    function createAgent(id, role, workerIndex) {
        var deskNames = ["officeA", "officeB", "officeC", "officeD"];
        var agent = {
            id: id,
            role: role,
            name: names[id % names.length],
            group: createPerson({}),
            homeFloor: null,
            deskId: null,
            deskWpName: null,
            deskDoorWpName: null,
            state: id < targetOccupancy ? "AWAY" : "DISABLED",
            plan: [],
            currentAction: null,
            currentWp: "outside",
            currentFloor: 0,
            seatKey: null,
            hasLunched: false,
            plannedMeetingTimes: []
        };
        if (role === "WORKER") {
            agent.homeFloor = Math.floor(workerIndex / 4) + 1;
            agent.deskId = deskNames[workerIndex % 4];
            agent.deskWpName = agent.deskId + "_desk";
            agent.deskDoorWpName = agent.deskId + "_door";
        }
        agent.group.name = agent.name + " " + role.toLowerCase();
        agent.group.userData.agent = agent;
        scheduleAgent(agent, simClock.simMinute);
        return agent;
    }

    function createAgents() {
        var index;
        agents = [];
        for (index = 0; index < MAX_WORKERS; index += 1) agents.push(createAgent(index, "WORKER", index));
        for (index = 0; index < MAX_VISITORS; index += 1) agents.push(createAgent(MAX_WORKERS + index, "VISITOR", index));
    }

    function removeAgentMesh(agent) {
        if (agent.group.parent) agent.group.parent.remove(agent.group);
    }

    function spawnAgent(agent) {
        var outside = world.floors[0].nodes.outside;
        removeAgentMesh(agent);
        scene.add(agent.group);
        agent.group.position.set(outside.x + (Math.random() * 2.2 - 1.1), outside.y, outside.z + (Math.random() * 1.5 - 0.75));
        agent.group.rotation.y = Math.PI;
        agent.group.userData.isSitting = false;
        agent.group.userData.isWalking = false;
        agent.currentFloor = 0;
        agent.currentWp = "outside";
        agent.state = "ARRIVING";
        agent.plan = agent.role === "WORKER" ? planArriveToDesk(agent) : planVisitorVisit(agent);
        agent.currentAction = null;
    }

    function findNearestNode(floor, position) {
        var best = null;
        var bestDistance = Infinity;
        var key;
        var node;
        var distance;
        for (key in floor.nodes) {
            if (key === "_links") continue;
            node = floor.nodes[key];
            distance = position.distanceToSquared(node);
            if (distance < bestDistance) {
                best = key;
                bestDistance = distance;
            }
        }
        return best;
    }

    function reserveConferenceSeat(agent, floorNumber) {
        var start = randInt(0, 3);
        var index;
        var name;
        var key;
        for (index = 0; index < 4; index += 1) {
            name = "conf_seat" + ((start + index) % 4);
            key = floorNumber + ":" + name;
            if (!seatReservations.has(key)) {
                seatReservations.add(key);
                agent.seatKey = key;
                return { wpName: name, key: key };
            }
        }
        return null;
    }

    function planArriveToDesk(agent) {
        var deskItem = homeDesk(agent);
        return concatPlans(
            [action("ENTER_STATE", { state: "ARRIVING" }), walk(0, "front_door_threshold"), walk(0, "entrance"), walk(0, "lobby_center")],
            elevatorTrip(0, agent.homeFloor),
            [walk(agent.homeFloor, deskItem.doorWpName), walk(agent.homeFloor, deskItem.wpName), action("SIT", { floor: agent.homeFloor, wpName: deskItem.wpName }), action("ENTER_STATE", { state: "AT_DESK" }), waitSim(randInt(15, 35)), action("PICK_NEXT_ACTIVITY")]
        );
    }

    function planGoToLunch(agent) {
        var deskItem = homeDesk(agent);
        var seatName = "cafe_seat" + randInt(0, 7);
        return concatPlans(
            [action("STAND"), walk(agent.homeFloor, deskItem.doorWpName)],
            elevatorTrip(agent.homeFloor, 0),
            [walk(0, "cafe_order"), walk(0, seatName), action("SIT", { floor: 0, wpName: seatName }), action("ENTER_STATE", { state: "AT_LUNCH" }), waitSim(agent.lunchDuration), action("MARK_LUNCHED"), action("STAND")],
            elevatorTrip(0, agent.homeFloor),
            [walk(agent.homeFloor, deskItem.doorWpName), walk(agent.homeFloor, deskItem.wpName), action("SIT", { floor: agent.homeFloor, wpName: deskItem.wpName }), action("ENTER_STATE", { state: "AT_DESK" }), waitSim(randInt(18, 42)), action("PICK_NEXT_ACTIVITY")]
        );
    }

    function planVisitLounge(agent) {
        var deskItem = homeDesk(agent);
        var spot = "lounge_spot" + randInt(0, 2);
        return [
            action("STAND"), walk(agent.homeFloor, "lounge_door"), walk(agent.homeFloor, spot), action("SIT", { floor: agent.homeFloor, wpName: spot }),
            action("ENTER_STATE", { state: "AT_BREAK" }), waitSim(randInt(5, 12)), action("STAND"), walk(agent.homeFloor, deskItem.doorWpName),
            walk(agent.homeFloor, deskItem.wpName), action("SIT", { floor: agent.homeFloor, wpName: deskItem.wpName }), action("ENTER_STATE", { state: "AT_DESK" }),
            waitSim(randInt(18, 42)), action("PICK_NEXT_ACTIVITY")
        ];
    }

    function planAttendMeeting(agent, meetingFloor) {
        var deskItem = homeDesk(agent);
        var floorNumber = meetingFloor || (Math.random() < 0.65 ? agent.homeFloor : randInt(1, WORLD.FLOOR_COUNT - 1));
        var seat = reserveConferenceSeat(agent, floorNumber);
        var leaveHome;
        var returnHome;
        if (!seat) return planVisitLounge(agent);
        leaveHome = agent.currentFloor === agent.homeFloor ? [action("STAND"), walk(agent.homeFloor, deskItem.doorWpName)] : [action("STAND")];
        returnHome = floorNumber === agent.homeFloor ? [] : elevatorTrip(floorNumber, agent.homeFloor);
        return concatPlans(
            leaveHome,
            agent.currentFloor === floorNumber ? [] : elevatorTrip(agent.currentFloor, floorNumber),
            [walk(floorNumber, "conf_door"), walk(floorNumber, "conf_center"), walk(floorNumber, seat.wpName), action("SIT", { floor: floorNumber, wpName: seat.wpName }), action("ENTER_STATE", { state: "IN_MEETING" }), waitSim(randInt(22, 45)), action("STAND"), action("RELEASE_SEAT", { key: seat.key })],
            returnHome,
            [walk(agent.homeFloor, deskItem.doorWpName), walk(agent.homeFloor, deskItem.wpName), action("SIT", { floor: agent.homeFloor, wpName: deskItem.wpName }), action("ENTER_STATE", { state: "AT_DESK" }), waitSim(randInt(16, 40)), action("PICK_NEXT_ACTIVITY")]
        );
    }

    function planVisitCoworker(agent) {
        var candidates = agents.filter(function (other) { return other !== agent && other.role === "WORKER" && other.state === "AT_DESK"; });
        var coworker;
        var deskItem;
        var ownDesk = homeDesk(agent);
        if (!candidates.length) return planVisitLounge(agent);
        coworker = randomItem(candidates);
        deskItem = homeDesk(coworker);
        return concatPlans(
            [action("STAND"), walk(agent.homeFloor, ownDesk.doorWpName)],
            elevatorTrip(agent.homeFloor, coworker.homeFloor),
            [walk(coworker.homeFloor, deskItem.doorWpName), action("ENTER_STATE", { state: "ON_FLOOR" }), waitSim(randInt(6, 18))],
            elevatorTrip(coworker.homeFloor, agent.homeFloor),
            [walk(agent.homeFloor, ownDesk.doorWpName), walk(agent.homeFloor, ownDesk.wpName), action("SIT", { floor: agent.homeFloor, wpName: ownDesk.wpName }), action("ENTER_STATE", { state: "AT_DESK" }), waitSim(randInt(16, 38)), action("PICK_NEXT_ACTIVITY")]
        );
    }

    function planLeaveBuilding(agent) {
        var startingFloor = agent.currentFloor;
        var toElevator = walk(startingFloor, "elevWait");
        return concatPlans(
            [action("ENTER_STATE", { state: "LEAVING" }), action("STAND"), toElevator],
            elevatorTrip(startingFloor, 0),
            [walk(0, "lobby_center"), walk(0, "entrance"), walk(0, "front_door_threshold"), walk(0, "outside"), action("EXIT_BUILDING")]
        );
    }

    function planVisitorVisit(agent) {
        var roll = Math.random();
        var plan = [action("ENTER_STATE", { state: "ARRIVING" }), walk(0, "front_door_threshold"), walk(0, "entrance"), walk(0, "lobby_center")];
        var loungeSpot;
        var standSpot;
        var officeFloor;
        var meetingSeat;
        if (roll < 0.10) {
            loungeSpot = "cafe_seat" + randInt(0, 7);
            plan = concatPlans(plan, [walk(0, "cafe_order"), walk(0, loungeSpot), action("SIT", { floor: 0, wpName: loungeSpot }), action("ENTER_STATE", { state: "VISITING" }), waitSim(randInt(7, 16)), action("STAND")]);
        } else if (roll < 0.16) {
            plan = concatPlans(plan, [walk(0, "cafe_order"), action("SIT", { floor: 0, wpName: "cafe_order" }), action("ENTER_STATE", { state: "VISITING" }), waitSim(randInt(4, 10)), action("STAND")]);
        } else if (roll < 0.30) {
            loungeSpot = randomItem(["front_lounge_couch", "front_lounge_chair0", "front_lounge_chair1"]);
            plan = concatPlans(plan, [walk(0, loungeSpot), action("SIT", { floor: 0, wpName: loungeSpot }), action("ENTER_STATE", { state: "VISITING" }), waitSim(randInt(7, 17)), action("STAND")]);
        } else if (roll < 0.42) {
            loungeSpot = randomItem(["back_lounge_N", "back_lounge_S", "pit_N", "pit_S", "pit_E", "pit_W"]);
            plan = concatPlans(plan, [walk(0, loungeSpot), action("SIT", { floor: 0, wpName: loungeSpot }), action("ENTER_STATE", { state: "VISITING" }), waitSim(randInt(7, 17)), action("STAND")]);
        } else if (roll < 0.52) {
            standSpot = randomItem(["reception", "kiosk", "lobby_wc_front", "lobby_wc_back"]);
            plan = concatPlans(plan, [walk(0, standSpot), action("SIT", { floor: 0, wpName: standSpot }), action("ENTER_STATE", { state: "VISITING" }), waitSim(randInt(4, 12)), action("STAND")]);
        } else if (roll < 0.62) {
            standSpot = randomItem(["lobby_stand_center", "lobby_stand_NE", "lobby_stand_NW", "lobby_stand_midE", "lobby_stand_midW", "lobby_stand_entry"]);
            plan = concatPlans(plan, [walk(0, standSpot), action("SIT", { floor: 0, wpName: standSpot }), action("ENTER_STATE", { state: "VISITING" }), waitSim(randInt(5, 13)), action("STAND")]);
        } else if (roll < 0.77) {
            officeFloor = randInt(1, WORLD.FLOOR_COUNT - 1);
            loungeSpot = "lounge_spot" + randInt(0, 2);
            plan = concatPlans(plan, elevatorTrip(0, officeFloor), [walk(officeFloor, "lounge_door"), walk(officeFloor, loungeSpot), action("SIT", { floor: officeFloor, wpName: loungeSpot }), action("ENTER_STATE", { state: "VISITING" }), waitSim(randInt(7, 17)), action("STAND")], elevatorTrip(officeFloor, 0));
        } else {
            officeFloor = randInt(1, WORLD.FLOOR_COUNT - 1);
            meetingSeat = reserveConferenceSeat(agent, officeFloor);
            if (meetingSeat) {
                plan = concatPlans(plan, elevatorTrip(0, officeFloor), [walk(officeFloor, "conf_door"), walk(officeFloor, "conf_center"), walk(officeFloor, meetingSeat.wpName), action("SIT", { floor: officeFloor, wpName: meetingSeat.wpName }), action("ENTER_STATE", { state: "IN_MEETING" }), waitSim(randInt(14, 28)), action("STAND"), action("RELEASE_SEAT", { key: meetingSeat.key })], elevatorTrip(officeFloor, 0));
            } else {
                plan = concatPlans(plan, [walk(0, "lobby_stand_midE"), action("SIT", { floor: 0, wpName: "lobby_stand_midE" }), waitSim(randInt(5, 12)), action("STAND")]);
            }
        }
        return concatPlans(plan, [walk(0, "lobby_center"), walk(0, "entrance"), walk(0, "front_door_threshold"), walk(0, "outside"), action("EXIT_BUILDING")]);
    }

    function chooseNextActivity(agent) {
        var now = simClock.simMinute;
        var roll;
        if (agent.role !== "WORKER") return [];
        if (now >= agent.departureTime) return planLeaveBuilding(agent);
        if (agent.plannedMeetingTimes.length && now >= agent.plannedMeetingTimes[0]) {
            agent.plannedMeetingTimes.shift();
            return planAttendMeeting(agent);
        }
        if (now >= agent.lunchTime && !agent.hasLunched) return planGoToLunch(agent);
        roll = Math.random();
        if (roll < 0.144) return planAttendMeeting(agent);
        if (roll < 0.264) return planVisitLounge(agent);
        if (roll < 0.414) return planVisitCoworker(agent);
        return [action("ENTER_STATE", { state: "AT_DESK" }), waitSim(randInt(18, 65)), action("PICK_NEXT_ACTIVITY")];
    }

    function prepareWalk(agent, currentAction) {
        var floor = world.floors[currentAction.floor];
        var from = agent.currentFloor === currentAction.floor && floor.nodes[agent.currentWp] ? agent.currentWp : findNearestNode(floor, agent.group.position);
        currentAction.path = world.bfsPath(floor.nodes, from, currentAction.wpName);
        currentAction.pathIndex = 0;
        currentAction._stallT = 0;
        currentAction._lastDistance = Infinity;
        currentAction._entranceChain = currentAction.wpName === "outside" || currentAction.wpName === "front_door_threshold" || currentAction.wpName === "entrance";
    }

    function pointMove(group, target, distance, dt) {
        var dx = target.x - group.position.x;
        var dz = target.z - group.position.z;
        var flat = Math.sqrt(dx * dx + dz * dz);
        var step = distance * dt;
        if (flat <= step || flat < 0.0001) {
            group.position.x = target.x;
            group.position.z = target.z;
            group.position.y = target.y;
            return true;
        }
        group.position.x += dx / flat * step;
        group.position.z += dz / flat * step;
        group.position.y += (target.y - group.position.y) * Math.min(1, dt * 8);
        group.rotation.y = Math.atan2(dx, dz);
        return false;
    }

    function walkAlongPath(agent, currentAction, dt) {
        var distanceLeft = 1.3 * dt;
        var target;
        var dx;
        var dz;
        var flat;
        var progressed = false;
        while (distanceLeft > 0 && currentAction.pathIndex < currentAction.path.length) {
            target = currentAction.path[currentAction.pathIndex];
            dx = target.x - agent.group.position.x;
            dz = target.z - agent.group.position.z;
            flat = Math.sqrt(dx * dx + dz * dz);
            if (flat < 0.06) {
                agent.group.position.copy(target);
                currentAction.pathIndex += 1;
                progressed = true;
                continue;
            }
            agent.group.rotation.y = Math.atan2(dx, dz);
            if (flat <= distanceLeft) {
                agent.group.position.copy(target);
                distanceLeft -= flat;
                currentAction.pathIndex += 1;
                progressed = true;
            } else {
                agent.group.position.x += dx / flat * distanceLeft;
                agent.group.position.z += dz / flat * distanceLeft;
                agent.group.position.y += (target.y - agent.group.position.y) * Math.min(1, dt * 7);
                distanceLeft = 0;
                progressed = true;
            }
        }
        agent.group.userData.isWalking = currentAction.pathIndex < currentAction.path.length;
        if (!progressed || Math.abs(currentAction._lastDistance - (target ? flat : 0)) < 0.005) currentAction._stallT += dt;
        else currentAction._stallT = 0;
        currentAction._lastDistance = target ? flat : 0;
        if (currentAction._stallT > (currentAction.wpName === "front_door_threshold" ? 1.5 : 1.2)) {
            if (currentAction.wpName === "front_door_threshold" && target) agent.group.position.copy(target);
            currentAction.pathIndex += 1;
            currentAction._stallT = 0;
        }
        if (currentAction.pathIndex >= currentAction.path.length) {
            agent.group.userData.isWalking = false;
            agent.currentFloor = currentAction.floor;
            agent.currentWp = currentAction.wpName;
            return true;
        }
        return false;
    }

    function startAction(agent, currentAction) {
        currentAction.started = true;
        if (currentAction.type === "WALK_TO_WP") prepareWalk(agent, currentAction);
        if (currentAction.type === "WAIT_SIM") currentAction.untilMin = simClock.simMinute + currentAction.minutes;
        if (currentAction.type === "ENTER_ELEVATOR") currentAction.phase = "reserve";
        if (currentAction.type === "EXIT_ELEVATOR") currentAction.phase = "start";
    }

    function sitAgent(agent, currentAction) {
        var floor = world.floors[currentAction.floor];
        var target = floor.sitTargets[currentAction.wpName] || { sit: false, facing: agent.group.rotation.y };
        var position = floor.nodes[currentAction.wpName];
        if (!position) return true;
        agent.group.position.copy(position);
        if (target.sit) {
            agent.group.position.y -= 0.35;
            agent.group.userData.isSitting = true;
        } else {
            agent.group.position.x += Math.cos(Math.random() * Math.PI * 2) * (0.35 + Math.random() * 0.4);
            agent.group.position.z += Math.sin(Math.random() * Math.PI * 2) * (0.35 + Math.random() * 0.4);
            agent.group.userData.isSitting = false;
        }
        agent.group.userData.isWalking = false;
        agent.group.rotation.y = target.facing;
        agent.currentFloor = currentAction.floor;
        agent.currentWp = currentAction.wpName;
        return true;
    }

    function standAgent(agent) {
        if (agent.group.parent === elevator.car) agent.group.position.y = 0;
        else agent.group.position.y = agent.currentFloor * WORLD.FLOOR_HEIGHT;
        agent.group.userData.isSitting = false;
        agent.group.userData.isWalking = false;
    }

    function enterElevator(agent, currentAction, dt) {
        var doorTarget;
        var localTarget;
        var moved;
        if (currentAction.phase === "reserve") {
            if (elevator.isAcceptingAt(currentAction.fromFloor, currentAction.toFloor > currentAction.fromFloor ? 1 : -1)) {
                currentAction.spot = elevator.reserveBoardingSpot(agent);
                if (currentAction.spot) currentAction.phase = "door";
            } else if (currentAction.toFloor > currentAction.fromFloor) {
                elevator.callUp(currentAction.fromFloor);
            } else {
                elevator.callDown(currentAction.fromFloor);
            }
            if (currentAction.phase !== "door") return false;
        }
        if (currentAction.phase === "door") {
            if (elevator.state !== "DOOR_OPEN" || elevator.currentFloor !== currentAction.fromFloor) return false;
            doorTarget = elevator.getSpotWorld({ x: currentAction.spot.x, z: 1.48 });
            doorTarget.y = currentAction.fromFloor * WORLD.FLOOR_HEIGHT;
            moved = pointMove(agent.group, doorTarget, 1.55, dt);
            if (!moved) {
                if (currentAction._lastWalk && agent.group.position.distanceToSquared(currentAction._lastWalk) < 0.000025) currentAction._stallT = (currentAction._stallT || 0) + dt;
                else currentAction._stallT = 0;
                currentAction._lastWalk = agent.group.position.clone();
                if (currentAction._stallT > 1.5) {
                    agent.group.position.copy(doorTarget);
                    moved = true;
                }
            }
            if (moved) {
                elevator.car.attach(agent.group);
                currentAction.phase = "inside";
            }
            if (currentAction.phase !== "inside") return false;
        }
        localTarget = new THREE.Vector3(currentAction.spot.x, 0, currentAction.spot.z);
        moved = pointMove(agent.group, localTarget, 1.4, dt);
        if (moved) {
            elevator.completeBoard(agent);
            agent.group.rotation.y = 0;
            agent.currentFloor = currentAction.fromFloor;
            agent.state = "IN_CAR";
            return true;
        }
        return false;
    }

    function exitElevator(agent, currentAction, dt) {
        var target;
        if (currentAction.phase === "start") {
            elevator.registerDisembark(agent);
            scene.attach(agent.group);
            currentAction.phase = "walk";
            agent.currentFloor = currentAction.toFloor;
            agent.group.position.y = currentAction.toFloor * WORLD.FLOOR_HEIGHT;
        }
        target = world.floors[currentAction.toFloor].nodes.elevWait;
        if (pointMove(agent.group, target, 1.55, dt)) {
            elevator.completeDisembark(agent);
            agent.currentWp = "elevWait";
            agent.state = "ON_FLOOR";
            return true;
        }
        return false;
    }

    function stepAction(agent, currentAction, dt) {
        if (currentAction.type === "WALK_TO_WP") return walkAlongPath(agent, currentAction, dt);
        if (currentAction.type === "WAIT_AT_PANEL") {
            if (currentAction.dir > 0) elevator.callUp(currentAction.floor);
            else elevator.callDown(currentAction.floor);
            agent.state = "WAITING_ELEVATOR";
            return elevator.isAcceptingAt(currentAction.floor, currentAction.dir) && elevator.currentCapacityFree() > 0;
        }
        if (currentAction.type === "ENTER_ELEVATOR") return enterElevator(agent, currentAction, dt);
        if (currentAction.type === "PRESS_FLOOR") {
            elevator.pressDestination(currentAction.floor);
            return true;
        }
        if (currentAction.type === "WAIT_FOR_FLOOR") return elevator.state === "DOOR_OPEN" && elevator.currentFloor === currentAction.floor;
        if (currentAction.type === "EXIT_ELEVATOR") return exitElevator(agent, currentAction, dt);
        if (currentAction.type === "SIT") return sitAgent(agent, currentAction);
        if (currentAction.type === "STAND") { standAgent(agent); return true; }
        if (currentAction.type === "RELEASE_SEAT") {
            if (currentAction.key) seatReservations.delete(currentAction.key);
            if (agent.seatKey === currentAction.key) agent.seatKey = null;
            return true;
        }
        if (currentAction.type === "WAIT_SIM") return simClock.simMinute >= currentAction.untilMin;
        if (currentAction.type === "EXIT_BUILDING") {
            if (agent.seatKey) seatReservations.delete(agent.seatKey);
            agent.seatKey = null;
            removeAgentMesh(agent);
            agent.state = "GONE";
            agent.currentAction = null;
            agent.plan = [];
            return true;
        }
        if (currentAction.type === "ENTER_STATE") { agent.state = currentAction.state; return true; }
        if (currentAction.type === "MARK_LUNCHED") { agent.hasLunched = true; return true; }
        if (currentAction.type === "PICK_NEXT_ACTIVITY") {
            agent.plan = chooseNextActivity(agent);
            return true;
        }
        return true;
    }

    function updateAgent(agent, dt) {
        var loops = 0;
        var currentAction;
        if (agent.state === "DISABLED") return;
        if (agent.state === "AWAY" && simClock.simMinute >= agent.arrivalTime) spawnAgent(agent);
        if (agent.role === "WORKER" && agent.state !== "AWAY" && agent.state !== "GONE" && agent.state !== "DISABLED" && simClock.simMinute >= agent.departureTime && agent.state !== "LEAVING" && agent.state !== "IN_CAR") {
            if (agent.seatKey) seatReservations.delete(agent.seatKey);
            agent.seatKey = null;
            agent.plan = planLeaveBuilding(agent);
            agent.currentAction = null;
            agent.state = "LEAVING";
        }
        if (!agent.group.parent || agent.state === "GONE") return;
        while (loops < 16) {
            loops += 1;
            if (!agent.currentAction) agent.currentAction = agent.plan.shift() || null;
            currentAction = agent.currentAction;
            if (!currentAction) break;
            if (!currentAction.started) startAction(agent, currentAction);
            if (stepAction(agent, currentAction, dt)) {
                agent.currentAction = null;
                continue;
            }
            break;
        }
    }

    function applyCollisions(dt) {
        var active = agents.filter(function (agent) {
            return agent.group.parent && agent.group.parent !== elevator.car && !agent.group.userData.isSitting && !(agent.currentAction && agent.currentAction.type === "ENTER_ELEVATOR") && !(agent.currentAction && agent.currentAction._entranceChain);
        });
        var first;
        var second;
        var dx;
        var dz;
        var distance;
        var angle;
        var push;
        var index;
        var other;
        for (index = 0; index < active.length; index += 1) {
            first = active[index];
            for (other = index + 1; other < active.length; other += 1) {
                second = active[other];
                if (first.group.parent !== second.group.parent || Math.abs(first.group.position.y - second.group.position.y) > 1) continue;
                dx = second.group.position.x - first.group.position.x;
                dz = second.group.position.z - first.group.position.z;
                distance = Math.sqrt(dx * dx + dz * dz);
                if (distance >= 0.7) continue;
                if (distance < 0.001) {
                    angle = Math.random() * Math.PI * 2;
                    dx = Math.cos(angle);
                    dz = Math.sin(angle);
                    distance = 1;
                }
                push = Math.min(0.18, (0.7 - distance) * 0.18) * Math.min(1, dt);
                first.group.position.x -= dx / distance * push;
                first.group.position.z -= dz / distance * push;
                second.group.position.x += dx / distance * push;
                second.group.position.z += dz / distance * push;
            }
        }
    }

    function countPresent() {
        return agents.filter(function (agent) { return agent.state !== "DISABLED" && agent.state !== "AWAY" && agent.state !== "GONE"; }).length;
    }

    function topUpVisitors() {
        var deficit;
        var candidates;
        var index;
        if (simClock.simMinute < 7 * 60 + 30 || simClock.simMinute > 20 * 60) return;
        deficit = targetOccupancy - countPresent();
        if (deficit <= 0) return;
        candidates = agents.filter(function (agent) { return agent.role === "VISITOR" && agent.id < targetOccupancy && (agent.state === "AWAY" || agent.state === "GONE"); });
        for (index = 0; index < candidates.length && index < deficit; index += 1) {
            scheduleAgent(candidates[index], simClock.simMinute);
            candidates[index].state = "AWAY";
            candidates[index].plan = [];
            candidates[index].currentAction = null;
        }
    }

    function applyOccupancy() {
        agents.forEach(function (agent) {
            if (agent.id < targetOccupancy) {
                if (agent.state === "DISABLED") {
                    agent.state = "AWAY";
                    scheduleAgent(agent, simClock.simMinute);
                }
            } else if (agent.state === "AWAY" || agent.state === "GONE") {
                removeAgentMesh(agent);
                agent.state = "DISABLED";
                agent.plan = [];
                agent.currentAction = null;
            }
        });
    }

    function resetDay() {
        seatReservations.clear();
        elevator.reset();
        agents.forEach(function (agent) {
            removeAgentMesh(agent);
            agent.plan = [];
            agent.currentAction = null;
            agent.currentFloor = 0;
            agent.currentWp = "outside";
            agent.group.userData.isSitting = false;
            agent.group.userData.isWalking = false;
            scheduleAgent(agent, simClock.simMinute);
            agent.state = agent.id < targetOccupancy ? "AWAY" : "DISABLED";
        });
    }

    function updateLighting() {
        var now = simClock.simMinute;
        var lower = dayFrames[0];
        var upper = dayFrames[dayFrames.length - 1];
        var index;
        var mix;
        var background = new THREE.Color(lower.bg);
        var sunColor = new THREE.Color(lower.sun);
        for (index = 0; index < dayFrames.length - 1; index += 1) {
            if (now >= dayFrames[index].minute && now <= dayFrames[index + 1].minute) {
                lower = dayFrames[index];
                upper = dayFrames[index + 1];
                break;
            }
        }
        mix = (now - lower.minute) / Math.max(1, upper.minute - lower.minute);
        background.lerp(new THREE.Color(upper.bg), mix);
        sunColor.lerp(new THREE.Color(upper.sun), mix);
        scene.background.copy(background);
        sun.color.copy(sunColor);
        sun.intensity = lower.si + (upper.si - lower.si) * mix;
        ambient.intensity = lower.ai + (upper.ai - lower.ai) * mix;
        hemisphere.intensity = lower.hi + (upper.hi - lower.hi) * mix;
    }

    function createHUD() {
        var speedValue = Math.round(Math.log(120) / Math.log(600) * 1000);
        hud = document.createElement("div");
        hud.id = "hud";
        hud.innerHTML = "<div id=\"sim-time\"></div><label class=\"control\"><span>Simulation</span><input id=\"speed-slider\" type=\"range\" min=\"0\" max=\"1000\" value=\"" + speedValue + "\"><output id=\"speed-output\"></output></label><label class=\"control\"><span>Occupancy</span><input id=\"occupancy-slider\" type=\"range\" min=\"1\" max=\"100\" value=\"45\"><output id=\"occupancy-output\"></output></label><div id=\"state-output\" class=\"tiny\"></div>";
        document.body.appendChild(hud);
        timeReadout = document.getElementById("sim-time");
        speedInput = document.getElementById("speed-slider");
        speedOutput = document.getElementById("speed-output");
        occupancyInput = document.getElementById("occupancy-slider");
        occupancyOutput = document.getElementById("occupancy-output");
        stateReadout = document.getElementById("state-output");
        speedInput.addEventListener("input", function () {
            simClock.timeScale = Math.exp(Math.log(600) * Number(speedInput.value) / 1000);
        });
        occupancyInput.addEventListener("input", function () {
            targetOccupancy = Number(occupancyInput.value);
            applyOccupancy();
        });
    }

    function updateHUD() {
        var counts = {};
        var keys;
        agents.forEach(function (agent) { counts[agent.state] = (counts[agent.state] || 0) + 1; });
        keys = Object.keys(counts).sort();
        timeReadout.textContent = simClock.format();
        speedOutput.textContent = Math.round(simClock.timeScale) + "x realtime";
        occupancyOutput.textContent = "Occupancy: " + targetOccupancy + " / " + MAX_OCCUPANCY + " people";
        stateReadout.innerHTML = "<span class=\"state-row\">" + keys.map(function (key) { return key + ": " + counts[key]; }).join(" · ") + "</span><br>Elevator: floor " + elevator.currentFloor + " " + (elevator.direction > 0 ? "↑" : elevator.direction < 0 ? "↓" : "•") + " " + elevator.state + " | riders " + elevator.passengers.size + "/4<br>Dest: [" + Array.from(elevator.destinations).join(",") + "] · Up: [" + Array.from(elevator.upCalls).join(",") + "] · Down: [" + Array.from(elevator.downCalls).join(",") + "]";
    }

    function onResize() {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }

    function startSimulation() {
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x20242a);
        camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.set(28, 24, 28);
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.sortObjects = true;
        document.body.appendChild(renderer.domElement);
        controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.target.set(0, 7.5, 0);
        controls.enableDamping = true;
        controls.dampingFactor = 0.06;
        ambient = new THREE.AmbientLight(0xffffff, 0.45);
        hemisphere = new THREE.HemisphereLight(0xbfd7ff, 0x303020, 0.45);
        sun = new THREE.DirectionalLight(0xffffff, 0.9);
        sun.position.set(20, 35, 18);
        sun.castShadow = true;
        scene.add(ambient);
        scene.add(hemisphere);
        scene.add(sun);
        world = createWorld(scene);
        elevator = new Elevator(scene, world);
        simClock = new SimClock();
        createAgents();
        createHUD();
        window.addEventListener("resize", onResize);
        function animate() {
            var realDt;
            var motionDt;
            requestAnimationFrame(animate);
            realDt = Math.min(0.05, simClock.realClock.getDelta());
            if (simClock.tick(realDt)) resetDay();
            motionDt = realDt * simClock.timeScale;
            updateLighting();
            topUpVisitors();
            elevator.tick(motionDt);
            agents.forEach(function (agent) { updateAgent(agent, motionDt); });
            applyCollisions(motionDt);
            agents.forEach(function (agent) {
                if (agent.group.parent) animatePersonWalking(agent.group, motionDt);
            });
            controls.update();
            renderer.render(scene, camera);
            updateHUD();
        }
        animate();
    }

    window.startOfficeSimulation = startSimulation;
    if (document.readyState === "loading") {
        window.addEventListener("DOMContentLoaded", startSimulation);
    } else {
        startSimulation();
    }
}());
