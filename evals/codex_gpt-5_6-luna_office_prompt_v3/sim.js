(function simulationModule(root) {
    var MAX_WORKERS = 20;
    var MAX_VISITORS = 80;
    var MAX_OCCUPANCY = MAX_WORKERS + MAX_VISITORS;
    var DEFAULT_OCCUPANCY = 45;
    var AGENT_NAMES = ["Ava", "Ben", "Casey", "Drew", "Eli", "Faye", "Gus", "Hana", "Iris", "Jules", "Kai", "Lena", "Milo", "Nia", "Owen", "Pia", "Quinn", "Rae", "Sam", "Tess", "Uma", "Vik", "Wren", "Zoe"];
    var scene = null;
    var camera = null;
    var renderer = null;
    var controls = null;
    var world = null;
    var elevator = null;
    var realClock = null;
    var ambientLight = null;
    var hemiLight = null;
    var sunLight = null;
    var agents = [];
    var targetOccupancy = DEFAULT_OCCUPANCY;
    var seatReservations = new Set();
    var hud = {};

    var Clock = {
        simMinute: 7 * 60 + 30,
        timeScale: 120,
        onDayWrap: null,
        tick: function tick(realDt) {
            this.simMinute += realDt * this.timeScale / 60;
            if (this.simMinute >= 24 * 60) {
                this.simMinute %= 24 * 60;
                if (this.onDayWrap) this.onDayWrap();
            }
        },
        format: function format() {
            var hour24 = Math.floor(this.simMinute / 60) % 24;
            var minute = Math.floor(this.simMinute % 60);
            var suffix = hour24 >= 12 ? "PM" : "AM";
            var hour12 = hour24 % 12;
            if (hour12 === 0) hour12 = 12;
            return " " + hour12 + ":" + String(minute).padStart(2, "0") + " " + suffix;
        },
    };

    function simRandomInt(minimum, maximum) {
        return Math.floor(minimum + Math.random() * (maximum - minimum + 1));
    }

    function simAction(type, values) {
        var action = values || {};
        action.type = type;
        return action;
    }

    function simSampleSchedule(agent, visitorRearm) {
        var now = Math.floor(Clock.simMinute);
        if (visitorRearm) {
            agent.arrivalTime = Math.floor(Clock.simMinute) + simRandomInt(0, 6);
            agent.visitDuration = simRandomInt(18, 65);
        } else {
            agent.arrivalTime = simRandomInt(8 * 60 + 15, 9 * 60 + 30);
            agent.lunchTime = simRandomInt(11 * 60 + 30, 13 * 60 + 30);
            agent.lunchDuration = simRandomInt(25, 60);
            agent.departureTime = Math.random() < 0.15 ? simRandomInt(18 * 60 + 30, 19 * 60 + 45) : simRandomInt(16 * 60 + 45, 18 * 60 + 30);
            agent.plannedMeetingTimes = [];
            var meetingCount = simRandomInt(0, 2);
            if (meetingCount > 0) agent.plannedMeetingTimes.push(simRandomInt(9 * 60 + 30, 11 * 60 + 15));
            if (meetingCount > 1) agent.plannedMeetingTimes.push(simRandomInt(14 * 60, 16 * 60 + 15));
            agent.plannedMeetingTimes.sort(function sortTimes(firstTime, secondTime) { return firstTime - secondTime; });
        }
        agent.scheduleDay = Math.floor(now / (24 * 60));
    }

    function simCreateAgent(id, role, workerIndex) {
        var person = createPerson({});
        var agent = {
            id: id,
            role: role,
            name: AGENT_NAMES[id % AGENT_NAMES.length] + " " + (id + 1),
            group: person,
            homeFloor: null,
            deskId: null,
            deskWpName: null,
            deskDoorWpName: null,
            arrivalTime: 0,
            lunchTime: 0,
            lunchDuration: 0,
            departureTime: 0,
            visitDuration: 30,
            visitEnd: null,
            plannedMeetingTimes: [],
            hasLunched: false,
            state: "AWAY",
            plan: [],
            currentAction: null,
            currentFloor: 0,
            currentNode: "outside",
            headingHome: false,
            leaveAfterRide: false,
            path: [],
            pathIndex: 0,
            seatReservation: null,
            elevatorSpot: null,
            entranceTransit: false,
            _stallT: 0,
            _lastWalkPosition: new THREE.Vector3(),
            _directWalkTarget: null,
        };
        person.userData.agentId = id;
        person.userData.agentName = agent.name;
        if (role === "WORKER") {
            agent.homeFloor = 1 + Math.floor(workerIndex / 4);
            agent.deskId = workerIndex;
            var desk = world.floors[agent.homeFloor].desks[workerIndex % 4];
            agent.deskWpName = desk.wpName;
            agent.deskDoorWpName = desk.doorWpName;
        }
        simSampleSchedule(agent, false);
        if (role === "VISITOR") simSampleSchedule(agent, true);
        person.visible = false;
        return agent;
    }

    function simWorldPosition(agent) {
        var position = new THREE.Vector3();
        agent.group.getWorldPosition(position);
        return position;
    }

    function simSetWorldPosition(agent, position) {
        if (!agent.group.parent) return;
        if (agent.group.parent === scene) agent.group.position.copy(position);
        else agent.group.position.copy(agent.group.parent.worldToLocal(position.clone()));
    }

    function simReleaseSeat(agent) {
        if (agent.seatReservation) {
            seatReservations.delete(agent.seatReservation);
            agent.seatReservation = null;
        }
    }

    function simRemoveFromScene(agent) {
        if (agent.group.parent) agent.group.parent.remove(agent.group);
        agent.group.visible = false;
        simReleaseSeat(agent);
        agent.entranceTransit = false;
    }

    function simResetAgentForDay(agent) {
        simRemoveFromScene(agent);
        agent.group.userData.isWalking = false;
        agent.group.userData.isSitting = false;
        agent.group.userData.walkPhase = 0;
        agent.homeFloor = agent.role === "WORKER" ? agent.homeFloor : null;
        agent.hasLunched = false;
        agent.plan = [];
        agent.currentAction = null;
        agent.currentFloor = 0;
        agent.currentNode = "outside";
        agent.headingHome = false;
        agent.leaveAfterRide = false;
        agent.path = [];
        agent.pathIndex = 0;
        agent.elevatorSpot = null;
        simSampleSchedule(agent, false);
        if (agent.role === "VISITOR") simSampleSchedule(agent, true);
        agent.state = agent.id < targetOccupancy ? "AWAY" : "DISABLED";
    }

    function simResetForNewDay() {
        elevator.reset();
        seatReservations.clear();
        for (var agentIndex = 0; agentIndex < agents.length; agentIndex += 1) simResetAgentForDay(agents[agentIndex]);
        simApplyOccupancy();
    }

    function simSpawnAgent(agent) {
        if (agent.state === "DISABLED" || agent.group.parent) return;
        scene.add(agent.group);
        var outside = world.floors[0].nodes.points.outside;
        var jitterX = (Math.random() * 2 - 1) * 1.1;
        var jitterZ = (Math.random() * 2 - 1) * 0.75;
        agent.group.position.set(outside.x + jitterX, outside.y, outside.z + jitterZ);
        agent.group.rotation.y = Math.PI;
        agent.group.visible = true;
        agent.currentFloor = 0;
        agent.currentNode = "outside";
        agent.state = "ARRIVING";
        agent.headingHome = false;
        agent.leaveAfterRide = false;
        agent.hasLunched = false;
        agent.plan = agent.role === "WORKER" ? simPlanArriveToDesk(agent) : simPlanVisitorVisit(agent);
        agent.currentAction = null;
        if (agent.role === "VISITOR") agent.visitEnd = Clock.simMinute + agent.visitDuration;
    }

    function simCountPresent() {
        var count = 0;
        for (var agentIndex = 0; agentIndex < agents.length; agentIndex += 1) {
            var state = agents[agentIndex].state;
            if (state !== "DISABLED" && state !== "AWAY" && state !== "GONE") count += 1;
        }
        return count;
    }

    function simApplyOccupancy() {
        for (var agentIndex = 0; agentIndex < agents.length; agentIndex += 1) {
            var agent = agents[agentIndex];
            if (agent.id < targetOccupancy) {
                if (agent.state === "DISABLED") {
                    agent.state = "AWAY";
                    simSampleSchedule(agent, agent.role === "VISITOR");
                }
            } else if (agent.state === "AWAY" || agent.state === "GONE") {
                simRemoveFromScene(agent);
                agent.state = "DISABLED";
            }
        }
    }

    function simTopUpVisitors() {
        if (Clock.simMinute < 7 * 60 || Clock.simMinute > 20 * 60) return;
        var deficit = targetOccupancy - simCountPresent();
        if (deficit <= 0) return;
        var rearmed = 0;
        for (var agentIndex = MAX_WORKERS; agentIndex < agents.length && rearmed < deficit; agentIndex += 1) {
            var visitor = agents[agentIndex];
            if (visitor.id >= targetOccupancy) continue;
            if (visitor.role === "VISITOR" && (visitor.state === "AWAY" || visitor.state === "GONE")) {
                simSampleSchedule(visitor, true);
                visitor.state = "AWAY";
                rearmed += 1;
            }
        }
    }

    function simNearestNode(agent, floorNumber) {
        var graph = world.floors[floorNumber].nodes;
        if (agent.currentNode && graph.points[agent.currentNode]) return agent.currentNode;
        var position = simWorldPosition(agent);
        var names = Object.keys(graph.points);
        var bestName = names[0];
        var bestDistance = Infinity;
        for (var nameIndex = 0; nameIndex < names.length; nameIndex += 1) {
            var point = graph.points[names[nameIndex]];
            var distance = point.distanceToSquared(position);
            if (distance < bestDistance) {
                bestName = names[nameIndex];
                bestDistance = distance;
            }
        }
        return bestName;
    }

    function simStartWalkAction(agent, action) {
        var floorNumber = action.floor;
        var graph = world.floors[floorNumber].nodes;
        var sourceName = simNearestNode(agent, floorNumber);
        var path = bfsPath(graph, sourceName, action.wpName);
        var startPosition = simWorldPosition(agent);
        agent.path = [startPosition];
        for (var pathPointIndex = 0; pathPointIndex < path.length; pathPointIndex += 1) agent.path.push(path[pathPointIndex]);
        if (agent.path.length === 1) agent.path.push(graph.points[action.wpName].clone());
        agent.pathIndex = 1;
        agent._stallT = 0;
        agent._lastWalkPosition.copy(startPosition);
        action._started = true;
        agent.currentFloor = floorNumber;
        agent.entranceTransit = floorNumber === 0 && (action.wpName === "front_door_threshold" || action.wpName === "entrance");
    }

    function simMoveAlongPath(agent, motionDt, action) {
        if (agent.pathIndex >= agent.path.length) {
            agent.group.userData.isWalking = false;
            agent.currentNode = action.wpName;
            agent.currentFloor = action.floor;
            agent.entranceTransit = false;
            return true;
        }
        var current = simWorldPosition(agent);
        var target = agent.path[agent.pathIndex];
        var distance = current.distanceTo(target);
        var step = Math.max(0.03, motionDt * 1.35);
        agent.group.userData.isWalking = true;
        if (distance <= Math.max(0.14, step)) {
            simSetWorldPosition(agent, target.clone());
            agent.pathIndex += 1;
            if (agent.pathIndex >= agent.path.length) {
                agent.group.userData.isWalking = false;
                agent.currentNode = action.wpName;
                agent.currentFloor = action.floor;
                agent.entranceTransit = false;
                return true;
            }
        } else {
            var direction = target.clone().sub(current).normalize();
            simSetWorldPosition(agent, current.add(direction.multiplyScalar(step)));
            agent.group.rotation.y = Math.atan2(direction.x, direction.z);
        }
        var nowPosition = simWorldPosition(agent);
        if (nowPosition.distanceTo(agent._lastWalkPosition) < 0.005) agent._stallT += motionDt;
        else agent._stallT = 0;
        agent._lastWalkPosition.copy(nowPosition);
        if (agent._stallT > 1.2) {
            simSetWorldPosition(agent, target.clone());
            agent.pathIndex += 1;
            agent._stallT = 0;
        }
        return false;
    }

    function simPrepareDirectWalk(agent, target) {
        agent._directWalkTarget = target.clone();
        agent._stallT = 0;
        agent._lastWalkPosition.copy(simWorldPosition(agent));
    }

    function simMoveDirect(agent, motionDt, speed) {
        if (!agent._directWalkTarget) return true;
        var current = simWorldPosition(agent);
        var distance = current.distanceTo(agent._directWalkTarget);
        var step = Math.max(0.03, motionDt * (speed || 1.35));
        agent.group.userData.isWalking = true;
        if (distance <= Math.max(0.12, step)) {
            simSetWorldPosition(agent, agent._directWalkTarget.clone());
            agent._directWalkTarget = null;
            agent.group.userData.isWalking = false;
            return true;
        }
        var direction = agent._directWalkTarget.clone().sub(current).normalize();
        simSetWorldPosition(agent, current.add(direction.multiplyScalar(step)));
        agent.group.rotation.y = Math.atan2(direction.x, direction.z);
        var after = simWorldPosition(agent);
        if (after.distanceTo(agent._lastWalkPosition) < 0.005) agent._stallT += motionDt;
        else agent._stallT = 0;
        agent._lastWalkPosition.copy(after);
        if (agent._stallT > 1.5) {
            simSetWorldPosition(agent, agent._directWalkTarget.clone());
            agent._directWalkTarget = null;
            agent.group.userData.isWalking = false;
            agent._stallT = 0;
            return true;
        }
        return false;
    }

    function simReserveSeat(floorNumber, wpName, agent) {
        var target = world.floors[floorNumber].sitTargets[wpName];
        if (!target || !target.sit) return null;
        var key = floorNumber + ":" + wpName;
        if (seatReservations.has(key)) return null;
        seatReservations.add(key);
        agent.seatReservation = key;
        return wpName;
    }

    function simReserveConferenceSeat(floorNumber, agent) {
        var seatNames = ["conf_seat0", "conf_seat1", "conf_seat2", "conf_seat3"];
        for (var seatIndex = 0; seatIndex < seatNames.length; seatIndex += 1) {
            var reserved = simReserveSeat(floorNumber, seatNames[seatIndex], agent);
            if (reserved) return reserved;
        }
        return null;
    }

    function simTravelActions(agent, targetFloor, finalWp) {
        var actions = [];
        var fromFloor = agent.currentFloor;
        if (fromFloor === targetFloor) {
            actions.push(simAction("WALK_TO_WP", { floor: targetFloor, wpName: finalWp }));
            return actions;
        }
        actions.push(simAction("WALK_TO_WP", { floor: fromFloor, wpName: "elevWait" }));
        var direction = targetFloor > fromFloor ? 1 : -1;
        actions.push(simAction("WAIT_AT_PANEL", { floor: fromFloor, dir: direction, toFloor: targetFloor }));
        actions.push(simAction("ENTER_ELEVATOR", { floor: fromFloor, dir: direction, toFloor: targetFloor }));
        actions.push(simAction("PRESS_FLOOR", { floor: targetFloor }));
        actions.push(simAction("WAIT_FOR_FLOOR", { floor: targetFloor }));
        actions.push(simAction("EXIT_ELEVATOR", { toFloor: targetFloor }));
        actions.push(simAction("WALK_TO_WP", { floor: targetFloor, wpName: finalWp }));
        return actions;
    }

    function simPlanArriveToDesk(agent) {
        var actions = [
            simAction("WALK_TO_WP", { floor: 0, wpName: "front_door_threshold" }),
            simAction("WALK_TO_WP", { floor: 0, wpName: "entrance" }),
            simAction("WALK_TO_WP", { floor: 0, wpName: "lobby_center" }),
            simAction("WALK_TO_WP", { floor: 0, wpName: "elevWait" }),
            simAction("WAIT_AT_PANEL", { floor: 0, dir: 1, toFloor: agent.homeFloor }),
            simAction("ENTER_ELEVATOR", { floor: 0, dir: 1, toFloor: agent.homeFloor }),
            simAction("PRESS_FLOOR", { floor: agent.homeFloor }),
            simAction("WAIT_FOR_FLOOR", { floor: agent.homeFloor }),
            simAction("EXIT_ELEVATOR", { toFloor: agent.homeFloor }),
            simAction("WALK_TO_WP", { floor: agent.homeFloor, wpName: agent.deskDoorWpName }),
            simAction("WALK_TO_WP", { floor: agent.homeFloor, wpName: agent.deskWpName }),
            simAction("SIT", { floor: agent.homeFloor, wpName: agent.deskWpName }),
            simAction("ENTER_STATE", { state: "AT_DESK" }),
            simAction("WAIT_SIM", { minutes: simRandomInt(12, 28) }),
            simAction("PICK_NEXT_ACTIVITY", {}),
        ];
        return actions;
    }

    function simPlanGoToLunch(agent) {
        var floorNumber = 0;
        var lunchNames = world.floors[0].cafeSpots;
        var chosen = null;
        for (var lunchIndex = 0; lunchIndex < lunchNames.length; lunchIndex += 1) {
            var candidate = lunchNames[(agent.id + lunchIndex) % lunchNames.length];
            if (simReserveSeat(floorNumber, candidate, agent)) {
                chosen = candidate;
                break;
            }
        }
        if (!chosen) chosen = "cafe_order";
        var actions = [simAction("STAND", {})];
        var travelDown = simTravelActions(agent, 0, chosen);
        for (var downIndex = 0; downIndex < travelDown.length; downIndex += 1) actions.push(travelDown[downIndex]);
        actions.push(simAction("SIT", { floor: 0, wpName: chosen }));
        actions.push(simAction("ENTER_STATE", { state: "AT_LUNCH" }));
        actions.push(simAction("WAIT_SIM", { minutes: agent.lunchDuration }));
        actions.push(simAction("MARK_LUNCHED", {}));
        actions.push(simAction("STAND", {}));
        actions.push(simAction("RELEASE_SEAT", {}));
        var travelUp = simTravelActions(agent, agent.homeFloor, agent.deskDoorWpName);
        for (var upIndex = 0; upIndex < travelUp.length; upIndex += 1) actions.push(travelUp[upIndex]);
        actions.push(simAction("WALK_TO_WP", { floor: agent.homeFloor, wpName: agent.deskWpName }));
        actions.push(simAction("SIT", { floor: agent.homeFloor, wpName: agent.deskWpName }));
        actions.push(simAction("ENTER_STATE", { state: "AT_DESK" }));
        actions.push(simAction("WAIT_SIM", { minutes: simRandomInt(18, 42) }));
        actions.push(simAction("PICK_NEXT_ACTIVITY", {}));
        return actions;
    }

    function simPlanVisitLounge(agent) {
        var targetName = null;
        var loungeNames = ["lounge_spot0", "lounge_spot1", "lounge_spot2"];
        for (var loungeIndex = 0; loungeIndex < loungeNames.length; loungeIndex += 1) {
            var candidate = loungeNames[(agent.id + loungeIndex) % loungeNames.length];
            if (simReserveSeat(agent.homeFloor, candidate, agent)) {
                targetName = candidate;
                break;
            }
        }
        if (!targetName) return [simAction("WAIT_SIM", { minutes: 8 }), simAction("PICK_NEXT_ACTIVITY", {})];
        var actions = [simAction("STAND", {})];
        var travel = simTravelActions(agent, agent.homeFloor, "lounge_door");
        for (var travelIndex = 0; travelIndex < travel.length; travelIndex += 1) actions.push(travel[travelIndex]);
        actions.push(simAction("WALK_TO_WP", { floor: agent.homeFloor, wpName: "lounge_center" }));
        actions.push(simAction("WALK_TO_WP", { floor: agent.homeFloor, wpName: targetName }));
        actions.push(simAction("SIT", { floor: agent.homeFloor, wpName: targetName }));
        actions.push(simAction("ENTER_STATE", { state: "AT_BREAK" }));
        actions.push(simAction("WAIT_SIM", { minutes: simRandomInt(5, 12) }));
        actions.push(simAction("STAND", {}));
        actions.push(simAction("RELEASE_SEAT", {}));
        actions.push(simAction("WALK_TO_WP", { floor: agent.homeFloor, wpName: agent.deskDoorWpName }));
        actions.push(simAction("WALK_TO_WP", { floor: agent.homeFloor, wpName: agent.deskWpName }));
        actions.push(simAction("SIT", { floor: agent.homeFloor, wpName: agent.deskWpName }));
        actions.push(simAction("ENTER_STATE", { state: "AT_DESK" }));
        actions.push(simAction("WAIT_SIM", { minutes: simRandomInt(16, 40) }));
        actions.push(simAction("PICK_NEXT_ACTIVITY", {}));
        return actions;
    }

    function simPlanAttendMeeting(agent) {
        var meetingFloor = Math.random() < 0.65 ? agent.homeFloor : simRandomInt(1, WORLD.FLOOR_COUNT - 1);
        var meetingSeat = simReserveConferenceSeat(meetingFloor, agent);
        if (!meetingSeat) return simPlanVisitLounge(agent);
        var actions = [simAction("STAND", {})];
        var travel = simTravelActions(agent, meetingFloor, "conf_door");
        for (var travelIndex = 0; travelIndex < travel.length; travelIndex += 1) actions.push(travel[travelIndex]);
        actions.push(simAction("WALK_TO_WP", { floor: meetingFloor, wpName: "conf_center" }));
        actions.push(simAction("WALK_TO_WP", { floor: meetingFloor, wpName: meetingSeat }));
        actions.push(simAction("SIT", { floor: meetingFloor, wpName: meetingSeat }));
        actions.push(simAction("ENTER_STATE", { state: "IN_MEETING" }));
        actions.push(simAction("WAIT_SIM", { minutes: simRandomInt(22, 45) }));
        actions.push(simAction("STAND", {}));
        actions.push(simAction("RELEASE_SEAT", {}));
        var homeTravel = simTravelActions(agent, agent.homeFloor, agent.deskDoorWpName);
        for (var homeIndex = 0; homeIndex < homeTravel.length; homeIndex += 1) actions.push(homeTravel[homeIndex]);
        actions.push(simAction("WALK_TO_WP", { floor: agent.homeFloor, wpName: agent.deskWpName }));
        actions.push(simAction("SIT", { floor: agent.homeFloor, wpName: agent.deskWpName }));
        actions.push(simAction("ENTER_STATE", { state: "AT_DESK" }));
        actions.push(simAction("WAIT_SIM", { minutes: simRandomInt(18, 48) }));
        actions.push(simAction("PICK_NEXT_ACTIVITY", {}));
        return actions;
    }

    function simPlanVisitCoworker(agent) {
        var coworkers = [];
        for (var agentIndex = 0; agentIndex < agents.length; agentIndex += 1) {
            var coworker = agents[agentIndex];
            if (coworker.role === "WORKER" && coworker.id !== agent.id && coworker.state === "AT_DESK") coworkers.push(coworker);
        }
        if (!coworkers.length) return [simAction("WAIT_SIM", { minutes: 10 }), simAction("PICK_NEXT_ACTIVITY", {})];
        var other = coworkers[agent.id % coworkers.length];
        var actions = [simAction("STAND", {})];
        var travel = simTravelActions(agent, other.homeFloor, other.deskDoorWpName);
        for (var travelIndex = 0; travelIndex < travel.length; travelIndex += 1) actions.push(travel[travelIndex]);
        actions.push(simAction("WAIT_SIM", { minutes: simRandomInt(6, 18) }));
        var returnTravel = simTravelActions(agent, agent.homeFloor, agent.deskDoorWpName);
        for (var returnIndex = 0; returnIndex < returnTravel.length; returnIndex += 1) actions.push(returnTravel[returnIndex]);
        actions.push(simAction("WALK_TO_WP", { floor: agent.homeFloor, wpName: agent.deskWpName }));
        actions.push(simAction("SIT", { floor: agent.homeFloor, wpName: agent.deskWpName }));
        actions.push(simAction("ENTER_STATE", { state: "AT_DESK" }));
        actions.push(simAction("WAIT_SIM", { minutes: simRandomInt(18, 42) }));
        actions.push(simAction("PICK_NEXT_ACTIVITY", {}));
        return actions;
    }

    function simPlanLeaveBuilding(agent) {
        agent.headingHome = true;
        var actions = [simAction("STAND", {}), simAction("RELEASE_SEAT", {})];
        if (agent.currentFloor !== 0) {
            var travelDown = simTravelActions(agent, 0, "lobby_center");
            for (var downIndex = 0; downIndex < travelDown.length; downIndex += 1) actions.push(travelDown[downIndex]);
        } else {
            actions.push(simAction("WALK_TO_WP", { floor: 0, wpName: "lobby_center" }));
        }
        actions.push(simAction("WALK_TO_WP", { floor: 0, wpName: "entrance" }));
        actions.push(simAction("WALK_TO_WP", { floor: 0, wpName: "front_door_threshold" }));
        actions.push(simAction("WALK_TO_WP", { floor: 0, wpName: "outside" }));
        actions.push(simAction("EXIT_BUILDING", {}));
        return actions;
    }

    function simAppendLobbyLoiter(actions, agent, wpName, minutes) {
        actions.push(simAction("WALK_TO_WP", { floor: 0, wpName: wpName }));
        actions.push(simAction("SIT", { floor: 0, wpName: wpName }));
        actions.push(simAction("ENTER_STATE", { state: "VISITING" }));
        actions.push(simAction("WAIT_SIM", { minutes: minutes }));
        actions.push(simAction("STAND", {}));
        actions.push(simAction("RELEASE_SEAT", {}));
    }

    function simPlanVisitorVisit(agent) {
        agent.headingHome = false;
        var actions = [
            simAction("WALK_TO_WP", { floor: 0, wpName: "front_door_threshold" }),
            simAction("WALK_TO_WP", { floor: 0, wpName: "entrance" }),
            simAction("WALK_TO_WP", { floor: 0, wpName: "lobby_center" }),
        ];
        var roll = Math.random();
        if (roll < 0.10) {
            var cafeNames = world.floors[0].cafeSpots;
            var cafeSeat = null;
            for (var cafeIndex = 0; cafeIndex < cafeNames.length; cafeIndex += 1) {
                var cafeCandidate = cafeNames[(agent.id + cafeIndex) % cafeNames.length];
                if (simReserveSeat(0, cafeCandidate, agent)) {
                    cafeSeat = cafeCandidate;
                    break;
                }
            }
            if (cafeSeat) simAppendLobbyLoiter(actions, agent, cafeSeat, simRandomInt(12, 30));
            else actions.push(simAction("WALK_TO_WP", { floor: 0, wpName: "cafe_order" }), simAction("WAIT_SIM", { minutes: 6 }));
        } else if (roll < 0.16) {
            actions.push(simAction("WALK_TO_WP", { floor: 0, wpName: "cafe_order" }), simAction("SIT", { floor: 0, wpName: "cafe_order" }), simAction("WAIT_SIM", { minutes: simRandomInt(4, 10) }));
        } else if (roll < 0.30) {
            var frontLoungeNames = ["lobby_lounge0", "lobby_lounge1", "lobby_lounge2"];
            var frontSpot = null;
            for (var frontIndex = 0; frontIndex < frontLoungeNames.length; frontIndex += 1) {
                var frontCandidate = frontLoungeNames[(agent.id + frontIndex) % frontLoungeNames.length];
                if (simReserveSeat(0, frontCandidate, agent)) {
                    frontSpot = frontCandidate;
                    break;
                }
            }
            if (frontSpot) simAppendLobbyLoiter(actions, agent, frontSpot, simRandomInt(8, 22));
            else actions.push(simAction("WALK_TO_WP", { floor: 0, wpName: "lobby_stand_NE" }), simAction("WAIT_SIM", { minutes: 8 }));
        } else if (roll < 0.42) {
            var loungeOrPit = ["back_lounge_N", "back_lounge_S", "pit_N", "pit_S", "pit_E", "pit_W"];
            var pitSpot = null;
            for (var pitIndex = 0; pitIndex < loungeOrPit.length; pitIndex += 1) {
                var pitCandidate = loungeOrPit[(agent.id + pitIndex) % loungeOrPit.length];
                if (simReserveSeat(0, pitCandidate, agent)) {
                    pitSpot = pitCandidate;
                    break;
                }
            }
            if (pitSpot) simAppendLobbyLoiter(actions, agent, pitSpot, simRandomInt(10, 28));
            else actions.push(simAction("WALK_TO_WP", { floor: 0, wpName: "lobby_stand_midW" }), simAction("WAIT_SIM", { minutes: 8 }));
        } else if (roll < 0.52) {
            var standingNames = ["reception", "kiosk", "lobby_wc_front", "lobby_wc_back"];
            var standingSpot = standingNames[agent.id % standingNames.length];
            actions.push(simAction("WALK_TO_WP", { floor: 0, wpName: standingSpot }), simAction("SIT", { floor: 0, wpName: standingSpot }), simAction("WAIT_SIM", { minutes: simRandomInt(4, 12) }));
        } else if (roll < 0.62) {
            var loiterNames = ["lobby_stand_center", "lobby_stand_NE", "lobby_stand_NW", "lobby_stand_midE", "lobby_stand_midW", "lobby_stand_entry"];
            actions.push(simAction("WALK_TO_WP", { floor: 0, wpName: loiterNames[agent.id % loiterNames.length] }), simAction("SIT", { floor: 0, wpName: loiterNames[agent.id % loiterNames.length] }), simAction("WAIT_SIM", { minutes: simRandomInt(6, 18) }));
        } else if (roll < 0.77) {
            var rideFloor = simRandomInt(1, WORLD.FLOOR_COUNT - 1);
            var rideSpot = "lounge_spot" + (agent.id % 3);
            if (simReserveSeat(rideFloor, rideSpot, agent)) {
                actions.push(simAction("WALK_TO_WP", { floor: 0, wpName: "elevWait" }), simAction("WAIT_AT_PANEL", { floor: 0, dir: 1, toFloor: rideFloor }), simAction("ENTER_ELEVATOR", { floor: 0, dir: 1, toFloor: rideFloor }), simAction("PRESS_FLOOR", { floor: rideFloor }), simAction("WAIT_FOR_FLOOR", { floor: rideFloor }), simAction("EXIT_ELEVATOR", { toFloor: rideFloor }), simAction("WALK_TO_WP", { floor: rideFloor, wpName: "lounge_door" }), simAction("WALK_TO_WP", { floor: rideFloor, wpName: "lounge_center" }), simAction("WALK_TO_WP", { floor: rideFloor, wpName: rideSpot }), simAction("SIT", { floor: rideFloor, wpName: rideSpot }), simAction("WAIT_SIM", { minutes: simRandomInt(8, 22) }), simAction("STAND", {}), simAction("RELEASE_SEAT", {}));
                var rideDown = simTravelActions(agent, 0, "lobby_center");
                for (var rideDownIndex = 0; rideDownIndex < rideDown.length; rideDownIndex += 1) actions.push(rideDown[rideDownIndex]);
            } else {
                actions.push(simAction("WALK_TO_WP", { floor: 0, wpName: "lobby_stand_midE" }), simAction("SIT", { floor: 0, wpName: "lobby_stand_midE" }), simAction("WAIT_SIM", { minutes: 8 }));
            }
        } else {
            var meetingFloor = simRandomInt(1, WORLD.FLOOR_COUNT - 1);
            var meetingSeat = simReserveConferenceSeat(meetingFloor, agent);
            if (meetingSeat) {
                actions.push(simAction("WALK_TO_WP", { floor: 0, wpName: "elevWait" }), simAction("WAIT_AT_PANEL", { floor: 0, dir: 1, toFloor: meetingFloor }), simAction("ENTER_ELEVATOR", { floor: 0, dir: 1, toFloor: meetingFloor }), simAction("PRESS_FLOOR", { floor: meetingFloor }), simAction("WAIT_FOR_FLOOR", { floor: meetingFloor }), simAction("EXIT_ELEVATOR", { toFloor: meetingFloor }), simAction("WALK_TO_WP", { floor: meetingFloor, wpName: "conf_door" }), simAction("WALK_TO_WP", { floor: meetingFloor, wpName: "conf_center" }), simAction("WALK_TO_WP", { floor: meetingFloor, wpName: meetingSeat }), simAction("SIT", { floor: meetingFloor, wpName: meetingSeat }), simAction("ENTER_STATE", { state: "IN_MEETING" }), simAction("WAIT_SIM", { minutes: simRandomInt(22, 42) }), simAction("STAND", {}), simAction("RELEASE_SEAT", {}));
                var meetingDown = simTravelActions(agent, 0, "lobby_center");
                for (var meetingDownIndex = 0; meetingDownIndex < meetingDown.length; meetingDownIndex += 1) actions.push(meetingDown[meetingDownIndex]);
            } else {
                actions.push(simAction("WALK_TO_WP", { floor: 0, wpName: "lobby_stand_center" }), simAction("SIT", { floor: 0, wpName: "lobby_stand_center" }), simAction("WAIT_SIM", { minutes: 10 }));
            }
        }
        actions.push(simAction("WALK_TO_WP", { floor: 0, wpName: "lobby_center" }));
        actions.push(simAction("WALK_TO_WP", { floor: 0, wpName: "entrance" }));
        actions.push(simAction("WALK_TO_WP", { floor: 0, wpName: "front_door_threshold" }));
        actions.push(simAction("WALK_TO_WP", { floor: 0, wpName: "outside" }));
        actions.push(simAction("EXIT_BUILDING", {}));
        return actions;
    }

    function simChooseNextActivity(agent) {
        if (agent.role === "VISITOR") return simPlanVisitorVisit(agent);
        if (agent.headingHome) return simPlanLeaveBuilding(agent);
        if (Clock.simMinute >= agent.departureTime) return simPlanLeaveBuilding(agent);
        if (agent.plannedMeetingTimes.length && Clock.simMinute >= agent.plannedMeetingTimes[0]) {
            agent.plannedMeetingTimes.shift();
            return simPlanAttendMeeting(agent);
        }
        if (!agent.hasLunched && Clock.simMinute >= agent.lunchTime) return simPlanGoToLunch(agent);
        var roll = Math.random();
        if (roll < 0.14) return simPlanAttendMeeting(agent);
        if (roll < 0.26) return simPlanVisitLounge(agent);
        if (roll < 0.41) return simPlanVisitCoworker(agent);
        return [simAction("WAIT_SIM", { minutes: simRandomInt(18, 65) }), simAction("PICK_NEXT_ACTIVITY", {})];
    }

    function simProcessDailySchedule(agent) {
        if (agent.state === "DISABLED") return;
        if (agent.state === "AWAY" && agent.id < targetOccupancy && Clock.simMinute >= agent.arrivalTime) {
            simSpawnAgent(agent);
            return;
        }
        if (agent.state === "GONE" || agent.state === "AWAY") return;
        if (agent.role === "WORKER" && !agent.headingHome && Clock.simMinute >= agent.departureTime && agent.state !== "IN_CAR") {
            agent.plan = simPlanLeaveBuilding(agent);
            agent.currentAction = null;
        }
        if (agent.role === "VISITOR" && !agent.headingHome && agent.visitEnd !== null && Clock.simMinute >= agent.visitEnd && agent.state !== "IN_CAR") {
            agent.plan = simPlanLeaveBuilding(agent);
            agent.currentAction = null;
        }
    }

    function simStartAction(agent, action) {
        action._started = true;
        if (action.type === "WALK_TO_WP") {
            action._started = false;
            simStartWalkAction(agent, action);
        } else if (action.type === "WAIT_AT_PANEL") {
            agent.state = "WAITING_ELEVATOR";
        } else if (action.type === "ENTER_ELEVATOR") {
            action.phase = "reserve";
            action.spot = null;
            agent.state = "WAITING_ELEVATOR";
        } else if (action.type === "WAIT_SIM") {
            action.startMinute = Clock.simMinute;
            action.untilMinute = Clock.simMinute + action.minutes;
            action.wraps = action.untilMinute >= 24 * 60;
            action.untilMinute %= 24 * 60;
        } else if (action.type === "EXIT_ELEVATOR") {
            action.phase = "register";
        }
    }

    function simWaitReached(action) {
        if (!action.wraps) return Clock.simMinute >= action.untilMinute;
        return Clock.simMinute >= action.untilMinute && Clock.simMinute < action.startMinute;
    }

    function simProcessWalkAction(agent, action, motionDt) {
        return simMoveAlongPath(agent, motionDt, action);
    }

    function simProcessElevatorEntry(agent, action, motionDt) {
        if (action.phase === "reserve") {
            if (elevator.state !== "DOOR_OPEN" || elevator.currentFloor !== action.floor) {
                if (action.dir > 0) elevator.callUp(action.floor);
                else elevator.callDown(action.floor);
                return false;
            }
            if (!action.spot) action.spot = elevator.reserveBoardingSpot(agent);
            if (!action.spot) {
                if (action.dir > 0) elevator.callUp(action.floor);
                else elevator.callDown(action.floor);
                return false;
            }
            action.phase = "threshold";
            action.threshold = elevator.doorThresholdWorld(action.spot);
            agent._stallT = 0;
            agent._lastWalkPosition.copy(simWorldPosition(agent));
            return false;
        }
        if (action.phase === "threshold") {
            if (elevator.state !== "DOOR_OPEN" || elevator.currentFloor !== action.floor) {
                elevator.cancelBoarding(agent);
                action.spot = null;
                action.phase = "reserve";
                return false;
            }
            var current = simWorldPosition(agent);
            var distance = current.distanceTo(action.threshold);
            var step = Math.max(0.04, motionDt * 1.35);
            agent.group.userData.isWalking = true;
            if (distance > Math.max(0.12, step)) {
                var direction = action.threshold.clone().sub(current).normalize();
                simSetWorldPosition(agent, current.add(direction.multiplyScalar(step)));
                agent.group.rotation.y = Math.atan2(direction.x, direction.z);
                var progressPosition = simWorldPosition(agent);
                if (progressPosition.distanceTo(agent._lastWalkPosition) < 0.005) agent._stallT += motionDt;
                else agent._stallT = 0;
                agent._lastWalkPosition.copy(progressPosition);
                if (agent._stallT < 1.5) return false;
            }
            simSetWorldPosition(agent, action.threshold.clone());
            elevator.carGroup.attach(agent.group);
            agent.group.position.set(action.spot.x, action.spot.y, 1.12);
            action.phase = "inside";
            agent._stallT = 0;
            return false;
        }
        if (action.phase === "inside") {
            if (elevator.state !== "DOOR_OPEN" || elevator.currentFloor !== action.floor) {
                elevator.cancelBoarding(agent);
                if (agent.group.parent === elevator.carGroup) scene.attach(agent.group);
                agent.currentNode = "elevWait";
                action.spot = null;
                action.phase = "reserve";
                return false;
            }
            var localTarget = new THREE.Vector3(action.spot.x, action.spot.y, action.spot.z);
            var localDistance = agent.group.position.distanceTo(localTarget);
            var localStep = Math.max(0.04, motionDt * 1.2);
            if (localDistance > localStep) {
                agent.group.userData.isWalking = true;
                agent.group.position.add(localTarget.clone().sub(agent.group.position).normalize().multiplyScalar(localStep));
                return false;
            }
            agent.group.position.copy(localTarget);
            agent.group.userData.isWalking = false;
            elevator.completeBoard(agent);
            agent.elevatorSpot = action.spot;
            agent.currentNode = "elevator";
            agent.state = "IN_CAR";
            agent.group.rotation.y = 0;
            return true;
        }
        return false;
    }

    function simProcessElevatorExit(agent, action, motionDt) {
        if (action.phase === "register") {
            if (elevator.state !== "DOOR_OPEN" || elevator.currentFloor !== action.toFloor) return false;
            if (!elevator.pendingDisembark.has(agent)) elevator.registerDisembark(agent);
            var exitPosition = elevator.exitWorld(agent);
            scene.attach(agent.group);
            simSetWorldPosition(agent, exitPosition);
            action.phase = "walk";
            simPrepareDirectWalk(agent, world.floors[action.toFloor].nodes.points.elevWait);
            agent.currentFloor = action.toFloor;
            agent.currentNode = "elevWait";
            agent.group.userData.isSitting = false;
            return false;
        }
        if (action.phase === "walk") {
            if (!simMoveDirect(agent, motionDt, 1.35)) return false;
            elevator.completeDisembark(agent);
            agent.state = "ON_FLOOR";
            agent.currentNode = "elevWait";
            agent.group.userData.isWalking = false;
            if (agent.leaveAfterRide) {
                agent.leaveAfterRide = false;
                agent.plan = simPlanLeaveBuilding(agent);
                agent.currentAction = null;
            }
            return true;
        }
        return false;
    }

    function simProcessAction(agent, action, motionDt) {
        if (action.type === "WALK_TO_WP") return simProcessWalkAction(agent, action, motionDt);
        if (action.type === "WAIT_AT_PANEL") {
            if (action.dir > 0) elevator.callUp(action.floor);
            else elevator.callDown(action.floor);
            if (elevator.isAcceptingAt(action.floor, action.dir) && elevator.currentCapacityFree() > 0) return true;
            agent.state = "WAITING_ELEVATOR";
            return false;
        }
        if (action.type === "ENTER_ELEVATOR") return simProcessElevatorEntry(agent, action, motionDt);
        if (action.type === "PRESS_FLOOR") {
            elevator.pressDestination(action.floor);
            agent.state = "IN_CAR";
            return true;
        }
        if (action.type === "WAIT_FOR_FLOOR") {
            agent.state = "IN_CAR";
            return elevator.state === "DOOR_OPEN" && elevator.currentFloor === action.floor;
        }
        if (action.type === "EXIT_ELEVATOR") return simProcessElevatorExit(agent, action, motionDt);
        if (action.type === "SIT") {
            var floorRecord = world.floors[action.floor];
            var targetPoint = floorRecord.nodes.points[action.wpName];
            var targetInfo = floorRecord.sitTargets[action.wpName] || { sit: false, facing: 0 };
            var finalPosition = targetPoint.clone();
            if (!targetInfo.sit) {
                var angle = (agent.id * 2.399 + Clock.simMinute * 0.07) % (Math.PI * 2);
                var radius = 0.35 + (agent.id % 4) * 0.13;
                finalPosition.x += Math.cos(angle) * radius;
                finalPosition.z += Math.sin(angle) * radius;
            }
            simSetWorldPosition(agent, finalPosition);
            agent.currentFloor = action.floor;
            agent.currentNode = action.wpName;
            agent.group.rotation.y = targetInfo.facing;
            agent.group.userData.isWalking = false;
            agent.group.userData.isSitting = Boolean(targetInfo.sit);
            agent.group.position.y = targetInfo.sit ? action.floor * WORLD.FLOOR_HEIGHT - 0.35 : action.floor * WORLD.FLOOR_HEIGHT;
            return true;
        }
        if (action.type === "STAND") {
            agent.group.userData.isSitting = false;
            agent.group.userData.isWalking = false;
            if (agent.group.parent === elevator.carGroup) agent.group.position.y = 0.06;
            else agent.group.position.y = agent.currentFloor * WORLD.FLOOR_HEIGHT;
            return true;
        }
        if (action.type === "RELEASE_SEAT") {
            simReleaseSeat(agent);
            return true;
        }
        if (action.type === "WAIT_SIM") return simWaitReached(action);
        if (action.type === "EXIT_BUILDING") {
            simRemoveFromScene(agent);
            agent.state = "GONE";
            agent.plan = [];
            agent.currentFloor = 0;
            agent.currentNode = "outside";
            agent.headingHome = false;
            return true;
        }
        if (action.type === "ENTER_STATE") {
            agent.state = action.state;
            return true;
        }
        if (action.type === "MARK_LUNCHED") {
            agent.hasLunched = true;
            return true;
        }
        if (action.type === "PICK_NEXT_ACTIVITY") {
            agent.plan = simChooseNextActivity(agent);
            return true;
        }
        return true;
    }

    function simDispatchAgent(agent, motionDt) {
        if (agent.state === "DISABLED" || agent.state === "AWAY" || agent.state === "GONE") return;
        for (var transitionIndex = 0; transitionIndex < 16; transitionIndex += 1) {
            if (!agent.currentAction) {
                if (!agent.plan.length) break;
                agent.currentAction = agent.plan.shift();
                simStartAction(agent, agent.currentAction);
            }
            var done = simProcessAction(agent, agent.currentAction, motionDt);
            if (!done) break;
            agent.currentAction = null;
        }
    }

    function simApplyCollisions() {
        for (var firstIndex = 0; firstIndex < agents.length; firstIndex += 1) {
            var first = agents[firstIndex];
            if (!first.group.parent || first.state === "DISABLED" || first.state === "GONE" || first.group.parent === elevator.carGroup || first.group.userData.isSitting || first.entranceTransit || (first.currentAction && first.currentAction.type === "ENTER_ELEVATOR")) continue;
            for (var secondIndex = firstIndex + 1; secondIndex < agents.length; secondIndex += 1) {
                var second = agents[secondIndex];
                if (!second.group.parent || second.group.parent !== first.group.parent || second.group.parent === elevator.carGroup || second.group.userData.isSitting || second.entranceTransit || (second.currentAction && second.currentAction.type === "ENTER_ELEVATOR")) continue;
                var firstPosition = first.group.position;
                var secondPosition = second.group.position;
                if (Math.abs(firstPosition.y - secondPosition.y) > 1.0) continue;
                var dx = secondPosition.x - firstPosition.x;
                var dz = secondPosition.z - firstPosition.z;
                var distance = Math.sqrt(dx * dx + dz * dz);
                if (distance >= 0.72) continue;
                var nx;
                var nz;
                if (distance < 0.001) {
                    var separationAngle = (first.id * 1.7 + second.id * 2.3 + Clock.simMinute) % (Math.PI * 2);
                    nx = Math.cos(separationAngle);
                    nz = Math.sin(separationAngle);
                    distance = 0.001;
                } else {
                    nx = dx / distance;
                    nz = dz / distance;
                }
                var push = (0.72 - distance) * 0.18;
                firstPosition.x -= nx * push;
                firstPosition.z -= nz * push;
                secondPosition.x += nx * push;
                secondPosition.z += nz * push;
            }
        }
    }

    function simUpdateLighting() {
        var hour = Clock.simMinute / 60;
        var keyframes = [
            { hour: 0, background: 0x101729, sun: 0x8da8e6, sunIntensity: 0.22, ambient: 0.45, hemi: 0.32 },
            { hour: 5.75, background: 0x151d31, sun: 0xc09c84, sunIntensity: 0.28, ambient: 0.45, hemi: 0.32 },
            { hour: 6.2, background: 0x826d72, sun: 0xffb178, sunIntensity: 0.55, ambient: 0.48, hemi: 0.36 },
            { hour: 6.55, background: 0x9fb4d6, sun: 0xffead0, sunIntensity: 0.82, ambient: 0.54, hemi: 0.44 },
            { hour: 8, background: 0x91b5dc, sun: 0xffffff, sunIntensity: 0.96, ambient: 0.62, hemi: 0.5 },
            { hour: 12, background: 0x78a3d2, sun: 0xffffff, sunIntensity: 1.0, ambient: 0.65, hemi: 0.52 },
            { hour: 17.5, background: 0x91b0d5, sun: 0xfff1d0, sunIntensity: 0.88, ambient: 0.6, hemi: 0.48 },
            { hour: 18.05, background: 0xc07872, sun: 0xffa16e, sunIntensity: 0.58, ambient: 0.5, hemi: 0.39 },
            { hour: 18.55, background: 0x2a2d48, sun: 0x8b9dde, sunIntensity: 0.3, ambient: 0.45, hemi: 0.32 },
            { hour: 24, background: 0x101729, sun: 0x8da8e6, sunIntensity: 0.22, ambient: 0.45, hemi: 0.32 },
        ];
        var left = keyframes[0];
        var right = keyframes[keyframes.length - 1];
        for (var keyIndex = 0; keyIndex < keyframes.length - 1; keyIndex += 1) {
            if (hour >= keyframes[keyIndex].hour && hour <= keyframes[keyIndex + 1].hour) {
                left = keyframes[keyIndex];
                right = keyframes[keyIndex + 1];
                break;
            }
        }
        var fraction = right.hour === left.hour ? 0 : (hour - left.hour) / (right.hour - left.hour);
        var backgroundColor = new THREE.Color(left.background).lerp(new THREE.Color(right.background), Math.max(0, Math.min(1, fraction)));
        scene.background.copy(backgroundColor);
        sunLight.color.set(left.sun).lerp(new THREE.Color(right.sun), Math.max(0, Math.min(1, fraction)));
        sunLight.intensity = left.sunIntensity + (right.sunIntensity - left.sunIntensity) * fraction;
        ambientLight.intensity = left.ambient + (right.ambient - left.ambient) * fraction;
        hemiLight.intensity = left.hemi + (right.hemi - left.hemi) * fraction;
    }

    function simMakeHud() {
        var panel = document.createElement("div");
        panel.style.position = "fixed";
        panel.style.left = "14px";
        panel.style.top = "14px";
        panel.style.width = "268px";
        panel.style.padding = "12px 14px";
        panel.style.color = "#e8edf6";
        panel.style.background = "rgba(20, 26, 38, 0.84)";
        panel.style.border = "1px solid rgba(180, 205, 255, 0.3)";
        panel.style.borderRadius = "10px";
        panel.style.font = "12px/1.4 system-ui, sans-serif";
        panel.style.zIndex = "5";
        panel.style.pointerEvents = "auto";
        var time = document.createElement("div");
        time.style.fontSize = "28px";
        time.style.fontWeight = "700";
        time.style.letterSpacing = "0.04em";
        panel.appendChild(time);
        var speedLabel = document.createElement("label");
        speedLabel.textContent = "Speed: ";
        var speedValue = document.createElement("span");
        speedLabel.appendChild(speedValue);
        panel.appendChild(speedLabel);
        var speed = document.createElement("input");
        speed.type = "range";
        speed.min = "0";
        speed.max = "1000";
        speed.step = "1";
        speed.value = String(Math.round(Math.log(Clock.timeScale) / Math.log(600) * 1000));
        speed.style.width = "100%";
        speed.addEventListener("input", function() {
            var normalized = Number(speed.value) / 1000;
            Clock.timeScale = Math.pow(600, normalized);
            speedValue.textContent = Clock.timeScale.toFixed(1) + "x realtime";
        });
        panel.appendChild(speed);
        var occupancyLabel = document.createElement("label");
        occupancyLabel.textContent = "Occupancy: ";
        var occupancyValue = document.createElement("span");
        occupancyLabel.appendChild(occupancyValue);
        panel.appendChild(occupancyLabel);
        var occupancy = document.createElement("input");
        occupancy.type = "range";
        occupancy.min = "1";
        occupancy.max = String(MAX_OCCUPANCY);
        occupancy.step = "1";
        occupancy.value = String(DEFAULT_OCCUPANCY);
        occupancy.style.width = "100%";
        occupancy.addEventListener("input", function() {
            targetOccupancy = Number(occupancy.value);
            simApplyOccupancy();
        });
        panel.appendChild(occupancy);
        var states = document.createElement("div");
        states.style.marginTop = "7px";
        panel.appendChild(states);
        var elevatorLine = document.createElement("div");
        elevatorLine.style.marginTop = "7px";
        panel.appendChild(elevatorLine);
        document.body.appendChild(panel);
        hud.panel = panel;
        hud.time = time;
        hud.speedValue = speedValue;
        hud.occupancy = occupancyValue;
        hud.states = states;
        hud.elevator = elevatorLine;
        speed.dispatchEvent(new Event("input"));
        occupancy.dispatchEvent(new Event("input"));
    }

    function simUpdateHud() {
        if (!hud.time) return;
        hud.time.textContent = Clock.format();
        hud.speedValue.textContent = Clock.timeScale.toFixed(1) + "x realtime";
        hud.occupancy.textContent = simCountPresent() + " / " + MAX_OCCUPANCY + " people (target " + targetOccupancy + ")";
        var counts = Object.create(null);
        for (var agentIndex = 0; agentIndex < agents.length; agentIndex += 1) {
            var state = agents[agentIndex].state;
            counts[state] = (counts[state] || 0) + 1;
        }
        var countParts = [];
        var stateNames = Object.keys(counts).sort();
        for (var stateIndex = 0; stateIndex < stateNames.length; stateIndex += 1) countParts.push(stateNames[stateIndex] + " " + counts[stateNames[stateIndex]]);
        hud.states.textContent = countParts.join("  ·  ");
        var direction = elevator.direction > 0 ? "UP" : (elevator.direction < 0 ? "DOWN" : "IDLE");
        hud.elevator.textContent = "Elevator: F" + elevator.currentFloor + " " + direction + " " + elevator.state + " · riders " + elevator.passengers.size + "/4 · dest " + Array.from(elevator.destinations).join(",") + " · calls ↑" + Array.from(elevator.upCalls).join(",") + " ↓" + Array.from(elevator.downCalls).join(",");
    }

    function simCreateAgentPool() {
        agents = [];
        for (var workerIndex = 0; workerIndex < MAX_WORKERS; workerIndex += 1) {
            var worker = simCreateAgent(workerIndex, "WORKER", workerIndex);
            worker.state = worker.id < targetOccupancy ? "AWAY" : "DISABLED";
            agents.push(worker);
        }
        for (var visitorIndex = 0; visitorIndex < MAX_VISITORS; visitorIndex += 1) {
            var visitorId = MAX_WORKERS + visitorIndex;
            var visitor = simCreateAgent(visitorId, "VISITOR", visitorIndex);
            visitor.state = visitor.id < targetOccupancy ? "AWAY" : "DISABLED";
            agents.push(visitor);
        }
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
        controls.target.set(0, WORLD.FLOOR_HEIGHT * 2.2, 0);
        controls.enableDamping = true;
        ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
        scene.add(ambientLight);
        hemiLight = new THREE.HemisphereLight(0xbfd7ff, 0x303020, 0.45);
        scene.add(hemiLight);
        sunLight = new THREE.DirectionalLight(0xffffff, 0.9);
        sunLight.position.set(20, 35, 18);
        scene.add(sunLight);
        world = createWorld(scene);
        elevator = new Elevator(scene, world);
        simCreateAgentPool();
        simMakeHud();
        Clock.onDayWrap = simResetForNewDay;
        window.addEventListener("resize", function() {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        });
        realClock = new THREE.Clock();
        function animate() {
            requestAnimationFrame(animate);
            var realDt = Math.min(0.05, realClock.getDelta());
            Clock.tick(realDt);
            simUpdateLighting();
            var motionDt = realDt * Clock.timeScale;
            elevator.tick(motionDt);
            for (var agentIndex = 0; agentIndex < agents.length; agentIndex += 1) {
                simProcessDailySchedule(agents[agentIndex]);
                simDispatchAgent(agents[agentIndex], motionDt);
            }
            simTopUpVisitors();
            simApplyCollisions();
            for (var animateIndex = 0; animateIndex < agents.length; animateIndex += 1) {
                if (agents[animateIndex].group.parent) animatePersonWalking(agents[animateIndex].group, motionDt);
            }
            controls.update();
            renderer.render(scene, camera);
            simUpdateHud();
        }
        animate();
    }

    root.Clock = Clock;
    root.startSimulation = startSimulation;
    if (document.readyState === "loading") {
        window.addEventListener("DOMContentLoaded", startSimulation);
    } else {
        startSimulation();
    }
})(window);
