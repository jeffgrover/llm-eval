(function () {
    "use strict";

    var simScene;
    var simCamera;
    var simRenderer;
    var simControls;
    var simWorld;
    var simElevator;
    var simFrameClock;
    var simOfficeClock;
    var simAmbient;
    var simHemisphere;
    var simSun;
    var simAgents = [];
    var simSeatReservations = new Set();
    var simTargetOccupancy = 45;

    var MAX_WORKERS = 20;
    var MAX_VISITORS = 80;
    var MAX_OCCUPANCY = MAX_WORKERS + MAX_VISITORS;
    var DEFAULT_OCCUPANCY = 45;
    var MEETING_PROB = 0.36;
    var OFFICE_WALK_SPEED = 1.3;
    var OFFICE_ACTION_LIMIT = 16;
    var OFFICE_SPEED_STOPS = [1, 2, 5, 10, 20, 40, 60, 90, 120, 180, 240, 360, 480, 600];
    var OFFICE_NAMES = [
        "Ari", "Bea", "Cal", "Dee", "Eli", "Flo", "Gus", "Hope", "Ira", "Jae",
        "Kai", "Liv", "Max", "Nia", "Oli", "Pia", "Quin", "Ren", "Sol", "Tess",
        "Uma", "Vic", "Wes", "Xia", "Yuri", "Zoe", "Ada", "Ben", "Cleo", "Dax",
        "Emi", "Finn", "Gia", "Hugo", "Inez", "Juno", "Kira", "Leo", "Maya", "Noah",
        "Opal", "Pax", "Rina", "Sam", "Theo", "Ula", "Vera", "Will", "Xena", "Yael",
        "Zane", "Alma", "Bo", "Cora", "Drew", "Esme", "Fox", "Gray", "Hana", "Ivan",
        "Jo", "Kit", "Lena", "Milo", "Nell", "Omar", "Prue", "Rafi", "Sage", "Tori",
        "Uri", "Vale", "Wynn", "Xavi", "Yara", "Ziv", "Anne", "Bryn", "Cole", "Demi",
        "Evan", "Faye", "Gabe", "Hiro", "Indy", "Jill", "Kian", "Lark", "Mina", "Nico",
        "Orla", "Penn", "Rain", "Sara", "Toby", "Una", "Vito", "Wren", "Xiom", "Zara"
    ];

    class OfficeClock {
        constructor() {
            this.simMinute = 7 * 60 + 30;
            this.timeScale = 120;
        }

        tick(realDt) {
            this.simMinute += realDt * this.timeScale / 60;
            if (this.simMinute >= 24 * 60) {
                this.simMinute %= 24 * 60;
                return true;
            }
            return false;
        }

        format() {
            var totalMinutes = Math.floor(this.simMinute + 0.0001);
            var hour24 = Math.floor(totalMinutes / 60) % 24;
            var minute = totalMinutes % 60;
            var suffix = hour24 >= 12 ? "PM" : "AM";
            var displayHour = hour24 % 12 || 12;
            return String(displayHour).padStart(2, " ") + ":" + String(minute).padStart(2, "0") + " " + suffix;
        }
    }

    function officeRandom(minimum, maximum) {
        return minimum + Math.random() * (maximum - minimum);
    }

    function officeRandomInt(minimum, maximum) {
        return Math.floor(officeRandom(minimum, maximum + 1));
    }

    function officeChoice(values) {
        return values[Math.floor(Math.random() * values.length)];
    }

    function officeShuffle(values) {
        var copy = values.slice();
        for (var index = copy.length - 1; index > 0; index -= 1) {
            var swapIndex = Math.floor(Math.random() * (index + 1));
            var temporary = copy[index];
            copy[index] = copy[swapIndex];
            copy[swapIndex] = temporary;
        }
        return copy;
    }

    function officeAction(type, details) {
        return Object.assign({ type: type }, details || {});
    }

    function officeWalkAction(floor, waypoint) {
        return officeAction("WALK_TO_WP", { floor: floor, wpName: waypoint });
    }

    function officeWaitAction(minutes) {
        return officeAction("WAIT_SIM", { minutes: minutes });
    }

    function officeStateAction(state) {
        return officeAction("ENTER_STATE", { state: state });
    }

    function officeAppendTravel(actions, fromFloor, toFloor) {
        if (fromFloor === toFloor) {
            return;
        }
        var direction = toFloor > fromFloor ? 1 : -1;
        actions.push(officeWalkAction(fromFloor, "elevWait"));
        actions.push(officeAction("WAIT_AT_PANEL", { floor: fromFloor, dir: direction, toFloor: toFloor }));
        actions.push(officeAction("ENTER_ELEVATOR", { floor: fromFloor, dir: direction, toFloor: toFloor }));
        actions.push(officeAction("PRESS_FLOOR", { floor: toFloor }));
        actions.push(officeAction("WAIT_FOR_FLOOR", { floor: toFloor }));
        actions.push(officeAction("EXIT_ELEVATOR", { toFloor: toFloor }));
    }

    function officeReleaseSeat(agent, key) {
        var releaseKey = key || agent.reservedSeatKey;
        if (releaseKey) {
            simSeatReservations.delete(releaseKey);
            if (agent.reservedSeatKey === releaseKey) {
                agent.reservedSeatKey = null;
            }
        }
    }

    function officeReserveSeat(agent, floor, names) {
        var candidates = officeShuffle(names);
        for (var index = 0; index < candidates.length; index += 1) {
            var waypoint = candidates[index];
            var key = String(floor) + ":" + waypoint;
            if (!simSeatReservations.has(key)) {
                simSeatReservations.add(key);
                agent.reservedSeatKey = key;
                return { floor: floor, waypoint: waypoint, key: key };
            }
        }
        return null;
    }

    function reserveConfSeat(agent, floor) {
        return officeReserveSeat(agent, floor, ["conf_seat0", "conf_seat1", "conf_seat2", "conf_seat3"]);
    }

    function officeDeskTail(agent, actions) {
        actions.push(officeWalkAction(agent.homeFloor, agent.deskDoorWpName));
        actions.push(officeWalkAction(agent.homeFloor, agent.deskWpName));
        actions.push(officeAction("SIT", { floor: agent.homeFloor, wpName: agent.deskWpName }));
        actions.push(officeStateAction("AT_DESK"));
        actions.push(officeWaitAction(officeRandomInt(18, 55)));
        actions.push(officeAction("PICK_NEXT_ACTIVITY"));
    }

    function planArriveToDesk(agent) {
        var actions = [
            officeStateAction("ARRIVING"),
            officeWalkAction(0, "front_door_threshold"),
            officeWalkAction(0, "entrance"),
            officeWalkAction(0, "lobby_center")
        ];
        officeAppendTravel(actions, 0, agent.homeFloor);
        officeDeskTail(agent, actions);
        return actions;
    }

    function planGoToLunch(agent) {
        var lunchSeat = officeReserveSeat(agent, 0, ["cafe_seat0", "cafe_seat1", "cafe_seat2", "cafe_seat3", "cafe_seat4", "cafe_seat5", "cafe_seat6", "cafe_seat7"]);
        var actions = [officeAction("STAND"), officeWalkAction(agent.homeFloor, agent.deskDoorWpName)];
        officeAppendTravel(actions, agent.homeFloor, 0);
        if (lunchSeat) {
            actions.push(officeWalkAction(0, lunchSeat.waypoint));
            actions.push(officeAction("SIT", { floor: 0, wpName: lunchSeat.waypoint }));
        } else {
            actions.push(officeWalkAction(0, "cafe_order"));
            actions.push(officeAction("SIT", { floor: 0, wpName: "cafe_order" }));
        }
        actions.push(officeStateAction("AT_LUNCH"));
        actions.push(officeWaitAction(agent.lunchDuration));
        actions.push(officeAction("MARK_LUNCHED"));
        actions.push(officeAction("STAND"));
        if (lunchSeat) actions.push(officeAction("RELEASE_SEAT", { key: lunchSeat.key }));
        officeAppendTravel(actions, 0, agent.homeFloor);
        officeDeskTail(agent, actions);
        return actions;
    }

    function planVisitLounge(agent) {
        var loungeSeat = officeReserveSeat(agent, agent.homeFloor, ["lounge_spot0", "lounge_spot1", "lounge_spot2"]);
        var targetName = loungeSeat ? loungeSeat.waypoint : "water_cooler";
        var actions = [
            officeAction("STAND"),
            officeWalkAction(agent.homeFloor, agent.deskDoorWpName),
            officeWalkAction(agent.homeFloor, targetName),
            officeAction("SIT", { floor: agent.homeFloor, wpName: targetName }),
            officeStateAction("AT_BREAK"),
            officeWaitAction(officeRandomInt(5, 12)),
            officeAction("STAND")
        ];
        if (loungeSeat) actions.push(officeAction("RELEASE_SEAT", { key: loungeSeat.key }));
        officeDeskTail(agent, actions);
        return actions;
    }

    function planAttendMeeting(agent) {
        var meetingFloor = Math.random() < 0.65 ? agent.homeFloor : officeRandomInt(1, window.WORLD.FLOOR_COUNT - 1);
        var meetingSeat = reserveConfSeat(agent, meetingFloor);
        if (!meetingSeat) {
            return planVisitLounge(agent);
        }
        var actions = [officeAction("STAND"), officeWalkAction(agent.homeFloor, agent.deskDoorWpName)];
        officeAppendTravel(actions, agent.homeFloor, meetingFloor);
        actions.push(officeWalkAction(meetingFloor, "conf_door"));
        actions.push(officeWalkAction(meetingFloor, meetingSeat.waypoint));
        actions.push(officeAction("SIT", { floor: meetingFloor, wpName: meetingSeat.waypoint }));
        actions.push(officeStateAction("IN_MEETING"));
        actions.push(officeWaitAction(officeRandomInt(22, 45)));
        actions.push(officeAction("STAND"));
        actions.push(officeAction("RELEASE_SEAT", { key: meetingSeat.key }));
        actions.push(officeWalkAction(meetingFloor, "conf_door"));
        officeAppendTravel(actions, meetingFloor, agent.homeFloor);
        officeDeskTail(agent, actions);
        return actions;
    }

    function planVisitCoworker(agent) {
        var coworkers = simAgents.filter(function (candidate) {
            return candidate.role === "WORKER" && candidate !== agent && candidate.state === "AT_DESK";
        });
        if (!coworkers.length) {
            return [officeStateAction("AT_DESK"), officeWaitAction(officeRandomInt(18, 42)), officeAction("PICK_NEXT_ACTIVITY")];
        }
        var coworker = officeChoice(coworkers);
        var actions = [officeAction("STAND"), officeWalkAction(agent.homeFloor, agent.deskDoorWpName)];
        officeAppendTravel(actions, agent.homeFloor, coworker.homeFloor);
        actions.push(officeWalkAction(coworker.homeFloor, coworker.deskDoorWpName));
        actions.push(officeAction("SIT", { floor: coworker.homeFloor, wpName: coworker.deskDoorWpName }));
        actions.push(officeStateAction("VISITING"));
        actions.push(officeWaitAction(officeRandomInt(6, 18)));
        actions.push(officeAction("STAND"));
        officeAppendTravel(actions, coworker.homeFloor, agent.homeFloor);
        officeDeskTail(agent, actions);
        return actions;
    }

    function planLeaveBuilding(agent) {
        officeReleaseSeat(agent);
        var fromFloor = Math.max(0, Math.min(window.WORLD.FLOOR_COUNT - 1, agent.currentFloor));
        var actions = [officeStateAction("LEAVING"), officeAction("STAND")];
        if (fromFloor === agent.homeFloor && agent.role === "WORKER") {
            actions.push(officeWalkAction(fromFloor, agent.deskDoorWpName));
        }
        officeAppendTravel(actions, fromFloor, 0);
        actions.push(officeWalkAction(0, "lobby_center"));
        actions.push(officeWalkAction(0, "entrance"));
        actions.push(officeWalkAction(0, "front_door_threshold"));
        actions.push(officeWalkAction(0, "outside"));
        actions.push(officeAction("EXIT_BUILDING"));
        return actions;
    }

    function officeAddVisitorSeatActivity(actions, agent, floor, seat, state, minutes) {
        actions.push(officeWalkAction(floor, seat.waypoint));
        actions.push(officeAction("SIT", { floor: floor, wpName: seat.waypoint }));
        actions.push(officeStateAction(state));
        actions.push(officeWaitAction(minutes));
        actions.push(officeAction("STAND"));
        actions.push(officeAction("RELEASE_SEAT", { key: seat.key }));
    }

    function officeAddVisitorStandingActivity(actions, floor, waypoint, minutes) {
        actions.push(officeWalkAction(floor, waypoint));
        actions.push(officeAction("SIT", { floor: floor, wpName: waypoint }));
        actions.push(officeStateAction("VISITING"));
        actions.push(officeWaitAction(minutes));
        actions.push(officeAction("STAND"));
    }

    function officeAddVisitorFallback(actions, agent) {
        var waypoint = officeChoice(["lobby_stand_center", "lobby_stand_NE", "lobby_stand_NW", "lobby_stand_midE", "lobby_stand_midW", "lobby_stand_entry"]);
        officeAddVisitorStandingActivity(actions, 0, waypoint, officeRandomInt(8, 22));
        agent.visitKind = "lobby loiter";
    }

    function planVisitorVisit(agent) {
        var actions = [
            officeStateAction("ARRIVING"),
            officeWalkAction(0, "front_door_threshold"),
            officeWalkAction(0, "entrance"),
            officeWalkAction(0, "lobby_center")
        ];
        var roll = Math.random();
        var activityFloor = 0;
        if (roll < 0.10) {
            var cafeSeat = officeReserveSeat(agent, 0, ["cafe_seat0", "cafe_seat1", "cafe_seat2", "cafe_seat3", "cafe_seat4", "cafe_seat5", "cafe_seat6", "cafe_seat7"]);
            if (cafeSeat) officeAddVisitorSeatActivity(actions, agent, 0, cafeSeat, "VISITING", officeRandomInt(12, 32));
            else officeAddVisitorFallback(actions, agent);
            agent.visitKind = "cafe table";
        } else if (roll < 0.16) {
            officeAddVisitorStandingActivity(actions, 0, "cafe_order", officeRandomInt(4, 11));
            agent.visitKind = "coffee pickup";
        } else if (roll < 0.30) {
            var frontSeat = officeReserveSeat(agent, 0, ["front_lounge0", "front_lounge1", "front_lounge2"]);
            if (frontSeat) officeAddVisitorSeatActivity(actions, agent, 0, frontSeat, "VISITING", officeRandomInt(10, 28));
            else officeAddVisitorFallback(actions, agent);
            agent.visitKind = "front lounge";
        } else if (roll < 0.42) {
            var backSeat = officeReserveSeat(agent, 0, ["back_lounge_N", "back_lounge_S", "pit_N", "pit_S", "pit_E", "pit_W"]);
            if (backSeat) officeAddVisitorSeatActivity(actions, agent, 0, backSeat, "VISITING", officeRandomInt(12, 34));
            else officeAddVisitorFallback(actions, agent);
            agent.visitKind = "conversation";
        } else if (roll < 0.52) {
            officeAddVisitorStandingActivity(actions, 0, officeChoice(["reception", "kiosk", "lobby_wc_front", "lobby_wc_back"]), officeRandomInt(5, 16));
            agent.visitKind = "lobby errand";
        } else if (roll < 0.62) {
            officeAddVisitorFallback(actions, agent);
        } else if (roll < 0.77) {
            activityFloor = officeRandomInt(1, window.WORLD.FLOOR_COUNT - 1);
            officeAppendTravel(actions, 0, activityFloor);
            var upstairsSeat = officeReserveSeat(agent, activityFloor, ["lounge_spot0", "lounge_spot1", "lounge_spot2"]);
            if (upstairsSeat) officeAddVisitorSeatActivity(actions, agent, activityFloor, upstairsSeat, "VISITING", officeRandomInt(10, 28));
            else officeAddVisitorStandingActivity(actions, activityFloor, "hall_stand_S", officeRandomInt(8, 18));
            agent.visitKind = "upstairs visit";
        } else {
            activityFloor = officeRandomInt(1, window.WORLD.FLOOR_COUNT - 1);
            var externalSeat = reserveConfSeat(agent, activityFloor);
            if (externalSeat) {
                officeAppendTravel(actions, 0, activityFloor);
                actions.push(officeWalkAction(activityFloor, "conf_door"));
                officeAddVisitorSeatActivity(actions, agent, activityFloor, externalSeat, "IN_MEETING", officeRandomInt(22, 45));
                agent.visitKind = "client meeting";
            } else {
                activityFloor = 0;
                officeAddVisitorFallback(actions, agent);
            }
        }
        if (activityFloor > 0) {
            officeAppendTravel(actions, activityFloor, 0);
        }
        actions.push(officeStateAction("LEAVING"));
        actions.push(officeWalkAction(0, "lobby_center"));
        actions.push(officeWalkAction(0, "entrance"));
        actions.push(officeWalkAction(0, "front_door_threshold"));
        actions.push(officeWalkAction(0, "outside"));
        actions.push(officeAction("EXIT_BUILDING"));
        return actions;
    }

    function chooseNextActivity(agent) {
        var now = simOfficeClock.simMinute;
        if (now >= agent.departureTime) {
            agent.departureTriggered = true;
            return planLeaveBuilding(agent);
        }
        var dueIndex = agent.plannedMeetingTimes.findIndex(function (meetingTime) { return meetingTime <= now; });
        if (dueIndex >= 0) {
            agent.plannedMeetingTimes.splice(dueIndex, 1);
            return planAttendMeeting(agent);
        }
        if (!agent.hasLunched && now >= agent.lunchTime) {
            return planGoToLunch(agent);
        }
        var roll = Math.random();
        if (roll < MEETING_PROB * 0.4) {
            return planAttendMeeting(agent);
        }
        if (roll < MEETING_PROB * 0.4 + 0.12) {
            return planVisitLounge(agent);
        }
        if (roll < MEETING_PROB * 0.4 + 0.27) {
            return planVisitCoworker(agent);
        }
        return [officeStateAction("AT_DESK"), officeWaitAction(officeRandomInt(18, 65)), officeAction("PICK_NEXT_ACTIVITY")];
    }

    function officeSampleMeetings() {
        var meetingCount = officeRandomInt(0, 2);
        var times = [];
        if (meetingCount >= 1) times.push(officeRandomInt(9 * 60 + 45, 11 * 60 + 20));
        if (meetingCount >= 2) times.push(officeRandomInt(13 * 60 + 35, 16 * 60 + 10));
        return times.sort(function (left, right) { return left - right; });
    }

    function officeSampleSchedule(agent) {
        agent.arrivalTime = officeRandomInt(8 * 60 + 15, 9 * 60 + 30);
        agent.lunchTime = officeRandomInt(11 * 60 + 30, 13 * 60 + 30);
        agent.lunchDuration = officeRandomInt(25, 60);
        agent.departureTime = Math.random() < 0.15 ? officeRandomInt(18 * 60 + 30, 19 * 60 + 45) : officeRandomInt(16 * 60 + 45, 18 * 60 + 30);
        agent.plannedMeetingTimes = agent.role === "WORKER" ? officeSampleMeetings() : [];
        agent.hasLunched = false;
        agent.visitDuration = officeRandomInt(18, 75);
        agent.departureTriggered = false;
    }

    function officeRemoveAgentMesh(agent) {
        if (agent.group.parent === simElevator.car) {
            simScene.attach(agent.group);
        }
        if (agent.group.parent) {
            agent.group.parent.remove(agent.group);
        }
        agent.group.visible = false;
    }

    function officeResetAgentForDay(agent) {
        officeReleaseSeat(agent);
        officeRemoveAgentMesh(agent);
        agent.plan = [];
        agent.currentAction = null;
        agent.currentFloor = 0;
        agent.elevatorSpot = null;
        agent.group.userData.isSitting = false;
        agent.group.userData.isWalking = false;
        agent.group.position.set(0, 0, 12);
        agent.group.rotation.set(0, Math.PI, 0);
        officeSampleSchedule(agent);
        if (agent.id < simTargetOccupancy) {
            agent.state = "AWAY";
            agent.queuedArrival = agent.role === "VISITOR";
        } else {
            agent.state = "DISABLED";
            agent.queuedArrival = false;
        }
    }

    function officeHandleDayWrap() {
        simSeatReservations.clear();
        simElevator.reset();
        simAgents.forEach(function (agent) {
            officeResetAgentForDay(agent);
        });
    }

    function officeCreateAgents() {
        for (var agentIndex = 0; agentIndex < MAX_OCCUPANCY; agentIndex += 1) {
            var isWorker = agentIndex < MAX_WORKERS;
            var homeFloor = isWorker ? 1 + Math.floor(agentIndex / 4) : null;
            var deskIndex = isWorker ? agentIndex % 4 : null;
            var deskLetter = isWorker ? ["A", "B", "C", "D"][deskIndex] : null;
            var group = window.createPerson({});
            group.name = (isWorker ? "worker-" : "visitor-") + String(agentIndex);
            group.visible = false;
            group.scale.setScalar(isWorker ? 0.96 : officeRandom(0.9, 1.02));
            var agent = {
                id: agentIndex,
                role: isWorker ? "WORKER" : "VISITOR",
                name: OFFICE_NAMES[agentIndex] || ("Person " + String(agentIndex + 1)),
                homeFloor: homeFloor,
                deskId: deskLetter,
                deskWpName: isWorker ? "office" + deskLetter + "_desk" : null,
                deskDoorWpName: isWorker ? "office" + deskLetter + "_door" : null,
                group: group,
                state: "DISABLED",
                plan: [],
                currentAction: null,
                currentFloor: 0,
                reservedSeatKey: null,
                elevatorSpot: null,
                queuedArrival: false,
                visitKind: ""
            };
            group.userData.agent = agent;
            simAgents.push(agent);
            officeResetAgentForDay(agent);
        }
    }

    function officeSpawnAgent(agent) {
        if (agent.group.parent) {
            agent.group.parent.remove(agent.group);
        }
        simScene.add(agent.group);
        agent.group.visible = true;
        agent.group.position.set(officeRandom(-1.1, 1.1), 0, 12 + officeRandom(-0.75, 0.75));
        agent.group.rotation.set(0, Math.PI, 0);
        agent.group.userData.isSitting = false;
        agent.group.userData.isWalking = false;
        agent.currentFloor = 0;
        agent.currentAction = null;
        agent.elevatorSpot = null;
        agent.queuedArrival = false;
        agent.state = "ARRIVING";
        agent.plan = agent.role === "WORKER" ? planArriveToDesk(agent) : planVisitorVisit(agent);
    }

    function officeNearestNodeName(floorData, position) {
        var nearestName = null;
        var nearestDistance = Infinity;
        Object.keys(floorData.nodes).forEach(function (name) {
            var nodePosition = floorData.nodes[name].pos;
            var dx = nodePosition.x - position.x;
            var dz = nodePosition.z - position.z;
            var distance = dx * dx + dz * dz;
            if (distance < nearestDistance) {
                nearestDistance = distance;
                nearestName = name;
            }
        });
        return nearestName;
    }

    function officeStartAction(agent, action) {
        if (action.type === "WALK_TO_WP") {
            var floorData = simWorld.floors[action.floor];
            var worldPosition = new THREE.Vector3();
            agent.group.getWorldPosition(worldPosition);
            var fromName = officeNearestNodeName(floorData, worldPosition);
            action._path = simWorld.bfsPath(floorData.nodes, fromName, action.wpName);
            if (!action._path.length || action._path[action._path.length - 1].distanceTo(floorData.nodes[action.wpName].pos) > 0.01) {
                action._path.push(floorData.nodes[action.wpName].pos.clone());
            }
            action._pathIndex = 0;
            action._previousDistance = Infinity;
            action._stallT = 0;
            agent.group.userData.isSitting = false;
        } else if (action.type === "WAIT_SIM") {
            action.untilMin = simOfficeClock.simMinute + action.minutes;
        } else if (action.type === "ENTER_ELEVATOR") {
            action.phase = "reserve";
            action.spot = null;
            action._previousDistance = Infinity;
            action._stallT = 0;
        } else if (action.type === "EXIT_ELEVATOR") {
            simElevator.registerDisembark(agent);
            action.phase = "cabinDoor";
            action._previousDistance = Infinity;
            action._stallT = 0;
        } else if (action.type === "WAIT_AT_PANEL") {
            agent.state = "WAITING_ELEVATOR";
        }
    }

    function officeMoveDirect(agent, target, motionDt, action, stallLimit) {
        var position = agent.group.position;
        var dx = target.x - position.x;
        var dy = target.y - position.y;
        var dz = target.z - position.z;
        var distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (distance < 0.035) {
            position.copy(target);
            agent.group.userData.isWalking = false;
            return true;
        }
        if (action) {
            if (action._previousDistance - distance < 0.005) {
                action._stallT += motionDt;
            } else {
                action._stallT = 0;
            }
            action._previousDistance = distance;
            if (action._stallT > (stallLimit || 1.2)) {
                position.copy(target);
                action._stallT = 0;
                agent.group.userData.isWalking = false;
                return true;
            }
        }
        var step = OFFICE_WALK_SPEED * motionDt;
        agent.group.rotation.y = Math.atan2(dx, dz);
        agent.group.userData.isWalking = true;
        if (step >= distance) {
            position.copy(target);
            agent.group.userData.isWalking = false;
            return true;
        }
        position.x += dx / distance * step;
        position.y += dy / distance * step;
        position.z += dz / distance * step;
        return false;
    }

    function officeWalkAlongPath(agent, action, motionDt) {
        if (action._pathIndex >= action._path.length) {
            agent.currentFloor = action.floor;
            agent.group.userData.isWalking = false;
            return true;
        }
        var target = action._path[action._pathIndex];
        var entranceWaypoint = action.wpName === "front_door_threshold" || action.wpName === "entrance" || action.wpName === "outside";
        var arrived = officeMoveDirect(agent, target, motionDt, action, entranceWaypoint ? 1.5 : 1.2);
        if (arrived) {
            action._pathIndex += 1;
            action._previousDistance = Infinity;
            action._stallT = 0;
            if (action._pathIndex >= action._path.length) {
                agent.currentFloor = action.floor;
                return true;
            }
        }
        return false;
    }

    function officeTickEnterElevator(agent, action, motionDt) {
        if (action.phase === "reserve") {
            if (!simElevator.isAcceptingAt(action.floor, action.dir)) {
                if (action.dir > 0) simElevator.callUp(action.floor);
                else simElevator.callDown(action.floor);
                return false;
            }
            var reservedSpot = simElevator.reserveBoardingSpot(agent);
            if (!reservedSpot) {
                if (action.dir > 0) simElevator.callUp(action.floor);
                else simElevator.callDown(action.floor);
                return false;
            }
            action.spot = reservedSpot;
            agent.elevatorSpot = reservedSpot;
            action.phase = "walkToDoor";
            action._previousDistance = Infinity;
            action._stallT = 0;
        }
        if (action.phase === "walkToDoor") {
            var threshold = new THREE.Vector3(action.spot.x, 0.12, 1.76);
            simElevator.car.localToWorld(threshold);
            if (officeMoveDirect(agent, threshold, motionDt, action, 1.5)) {
                simElevator.car.attach(agent.group);
                action.phase = "walkToSpot";
                action._previousDistance = Infinity;
                action._stallT = 0;
            } else {
                return false;
            }
        }
        if (action.phase === "walkToSpot") {
            if (officeMoveDirect(agent, action.spot.localTarget, motionDt, action, 1.5)) {
                simElevator.completeBoard(agent);
                agent.group.rotation.y = 0;
                agent.group.userData.isWalking = false;
                agent.state = "IN_CAR";
                return true;
            }
        }
        return false;
    }

    function officeTickExitElevator(agent, action, motionDt) {
        var laneX = agent.elevatorSpot ? agent.elevatorSpot.x : 0;
        if (action.phase === "cabinDoor") {
            var localDoorTarget = new THREE.Vector3(laneX, 0.12, 1.76);
            if (officeMoveDirect(agent, localDoorTarget, motionDt, action, 1.5)) {
                simScene.attach(agent.group);
                action.phase = "floorWait";
                action._previousDistance = Infinity;
                action._stallT = 0;
            } else {
                return false;
            }
        }
        if (action.phase === "floorWait") {
            var floorTarget = simWorld.floors[action.toFloor].nodes.elevWait.pos.clone();
            floorTarget.x += laneX * 0.72;
            floorTarget.z += 0.38;
            if (officeMoveDirect(agent, floorTarget, motionDt, action, 1.5)) {
                simElevator.completeDisembark(agent);
                agent.elevatorSpot = null;
                agent.currentFloor = action.toFloor;
                agent.state = "ON_FLOOR";
                return true;
            }
        }
        return false;
    }

    function officeTickAction(agent, action, motionDt) {
        if (action.type === "WALK_TO_WP") {
            return officeWalkAlongPath(agent, action, motionDt);
        }
        if (action.type === "WAIT_AT_PANEL") {
            if (action.dir > 0) simElevator.callUp(action.floor);
            else simElevator.callDown(action.floor);
            return simElevator.isAcceptingAt(action.floor, action.dir) && simElevator.currentCapacityFree() > 0;
        }
        if (action.type === "ENTER_ELEVATOR") {
            return officeTickEnterElevator(agent, action, motionDt);
        }
        if (action.type === "PRESS_FLOOR") {
            simElevator.pressDestination(action.floor);
            return true;
        }
        if (action.type === "WAIT_FOR_FLOOR") {
            return simElevator.state === "DOOR_OPEN" && simElevator.currentFloor === action.floor;
        }
        if (action.type === "EXIT_ELEVATOR") {
            return officeTickExitElevator(agent, action, motionDt);
        }
        if (action.type === "SIT") {
            var target = simWorld.floors[action.floor].sitTargets[action.wpName];
            if (target) {
                var targetPosition = target.position.clone();
                if (target.sit) {
                    targetPosition.y -= 0.35;
                } else {
                    var jitterAngle = officeRandom(0, Math.PI * 2);
                    var jitterRadius = officeRandom(0.35, 0.75);
                    targetPosition.x += Math.cos(jitterAngle) * jitterRadius;
                    targetPosition.z += Math.sin(jitterAngle) * jitterRadius;
                }
                agent.group.position.copy(targetPosition);
                agent.group.rotation.y = target.facing;
                agent.group.userData.isSitting = target.sit;
                agent.group.userData.isWalking = false;
                agent.currentFloor = action.floor;
            }
            return true;
        }
        if (action.type === "STAND") {
            agent.group.userData.isSitting = false;
            agent.group.userData.isWalking = false;
            agent.group.position.y = agent.group.parent === simElevator.car ? 0.12 : agent.currentFloor * window.WORLD.FLOOR_HEIGHT;
            return true;
        }
        if (action.type === "RELEASE_SEAT") {
            officeReleaseSeat(agent, action.key);
            return true;
        }
        if (action.type === "WAIT_SIM") {
            return simOfficeClock.simMinute >= action.untilMin;
        }
        if (action.type === "EXIT_BUILDING") {
            officeReleaseSeat(agent);
            officeRemoveAgentMesh(agent);
            agent.state = agent.id < simTargetOccupancy ? "GONE" : "DISABLED";
            agent.queuedArrival = false;
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
            if (agent.role === "WORKER") {
                agent.plan = chooseNextActivity(agent);
            }
            return true;
        }
        return true;
    }

    function officeProcessActions(agent, motionDt) {
        for (var transition = 0; transition < OFFICE_ACTION_LIMIT; transition += 1) {
            if (!agent.currentAction) {
                if (!agent.plan.length) {
                    agent.group.userData.isWalking = false;
                    return;
                }
                agent.currentAction = agent.plan.shift();
                officeStartAction(agent, agent.currentAction);
            }
            var complete = officeTickAction(agent, agent.currentAction, motionDt);
            if (!complete) {
                return;
            }
            agent.group.userData.isWalking = false;
            agent.currentAction = null;
        }
    }

    function officeProcessSchedule(agent, motionDt) {
        var now = simOfficeClock.simMinute;
        if (agent.state === "DISABLED") {
            return;
        }
        if (agent.state === "AWAY") {
            if (now >= agent.arrivalTime) {
                officeSpawnAgent(agent);
            } else {
                return;
            }
        }
        if (agent.state === "GONE") {
            return;
        }
        if (agent.role === "WORKER" && !agent.departureTriggered && now >= agent.departureTime) {
            var entering = agent.currentAction && agent.currentAction.type === "ENTER_ELEVATOR";
            var exiting = agent.currentAction && agent.currentAction.type === "EXIT_ELEVATOR";
            if (agent.group.parent !== simElevator.car && !entering && !exiting) {
                agent.departureTriggered = true;
                officeReleaseSeat(agent);
                agent.currentAction = null;
                agent.plan = planLeaveBuilding(agent);
            }
        }
        officeProcessActions(agent, motionDt);
    }

    function officeCountPresent() {
        return simAgents.filter(function (agent) {
            return agent.state !== "DISABLED" && agent.state !== "AWAY" && agent.state !== "GONE";
        }).length;
    }

    function topUpVisitors() {
        var now = simOfficeClock.simMinute;
        if (now < 8 * 60 || now > 19 * 60 + 30) {
            return;
        }
        var present = officeCountPresent();
        var arrivingSoon = simAgents.filter(function (agent) {
            return agent.role === "VISITOR" && agent.id < simTargetOccupancy && agent.state === "AWAY" && agent.queuedArrival && agent.arrivalTime <= now + 6;
        }).length;
        var deficit = simTargetOccupancy - present - arrivingSoon;
        if (deficit <= 0) {
            return;
        }
        var available = simAgents.filter(function (agent) {
            return agent.role === "VISITOR" && agent.id < simTargetOccupancy && (agent.state === "AWAY" || agent.state === "GONE") && (!agent.queuedArrival || agent.arrivalTime > now + 6);
        });
        for (var index = 0; index < available.length && deficit > 0; index += 1) {
            var visitor = available[index];
            visitor.arrivalTime = now + officeRandomInt(0, 6);
            visitor.visitDuration = officeRandomInt(18, 75);
            visitor.state = "AWAY";
            visitor.queuedArrival = true;
            visitor.plan = [];
            visitor.currentAction = null;
            deficit -= 1;
        }
    }

    function officeIsEntranceTransit(agent) {
        if (!agent.currentAction || agent.currentAction.type !== "WALK_TO_WP") {
            return false;
        }
        var waypoint = agent.currentAction.wpName;
        var isEntranceWaypoint = waypoint === "outside" || waypoint === "front_door_threshold" || waypoint === "entrance" || waypoint === "lobby_center";
        return isEntranceWaypoint && (agent.state === "ARRIVING" || agent.state === "LEAVING");
    }

    function applyCollisions() {
        var candidates = simAgents.filter(function (agent) {
            if (!agent.group.parent || !agent.group.visible || agent.group.userData.isSitting) return false;
            if (agent.group.parent === simElevator.car) return false;
            if (agent.currentAction && agent.currentAction.type === "ENTER_ELEVATOR") return false;
            if (officeIsEntranceTransit(agent)) return false;
            return agent.state !== "DISABLED" && agent.state !== "AWAY" && agent.state !== "GONE";
        });
        for (var leftIndex = 0; leftIndex < candidates.length; leftIndex += 1) {
            for (var rightIndex = leftIndex + 1; rightIndex < candidates.length; rightIndex += 1) {
                var left = candidates[leftIndex];
                var right = candidates[rightIndex];
                if (left.group.parent !== right.group.parent || Math.abs(left.group.position.y - right.group.position.y) > 1.0) continue;
                var dx = left.group.position.x - right.group.position.x;
                var dz = left.group.position.z - right.group.position.z;
                var distance = Math.sqrt(dx * dx + dz * dz);
                if (distance >= 0.72) continue;
                if (distance < 0.001) {
                    var randomAngle = officeRandom(0, Math.PI * 2);
                    dx = Math.cos(randomAngle) * 0.001;
                    dz = Math.sin(randomAngle) * 0.001;
                    distance = 0.001;
                }
                var push = (0.72 - distance) * 0.18;
                var normalX = dx / distance;
                var normalZ = dz / distance;
                left.group.position.x += normalX * push;
                left.group.position.z += normalZ * push;
                right.group.position.x -= normalX * push;
                right.group.position.z -= normalZ * push;
            }
        }
    }

    function officeApplyOccupancy() {
        simAgents.forEach(function (agent) {
            if (agent.id < simTargetOccupancy) {
                if (agent.state === "DISABLED") {
                    officeSampleSchedule(agent);
                    if (simOfficeClock.simMinute >= 8 * 60 && simOfficeClock.simMinute < 19 * 60) {
                        agent.arrivalTime = simOfficeClock.simMinute + officeRandomInt(0, 6);
                    }
                    agent.state = "AWAY";
                    agent.queuedArrival = agent.role === "VISITOR";
                }
            } else if (agent.state === "AWAY" || agent.state === "GONE") {
                officeReleaseSeat(agent);
                officeRemoveAgentMesh(agent);
                agent.state = "DISABLED";
                agent.queuedArrival = false;
            }
        });
    }

    function officeLightingFrames() {
        return [
            { minute: 0, bg: 0x18212d, sun: 0x7188a8, si: 0.05, ai: 0.45, hi: 0.32 },
            { minute: 5 * 60 + 55, bg: 0x18212d, sun: 0x7188a8, si: 0.05, ai: 0.45, hi: 0.32 },
            { minute: 6 * 60 + 5, bg: 0x614c5d, sun: 0xff865c, si: 0.32, ai: 0.5, hi: 0.36 },
            { minute: 6 * 60 + 30, bg: 0x9ac5df, sun: 0xffe4ba, si: 0.92, ai: 0.62, hi: 0.54 },
            { minute: 12 * 60, bg: 0xa8d3ea, sun: 0xffffff, si: 1.0, ai: 0.66, hi: 0.58 },
            { minute: 17 * 60 + 30, bg: 0x9fcbe4, sun: 0xfff4d7, si: 0.94, ai: 0.64, hi: 0.56 },
            { minute: 18 * 60, bg: 0xc97860, sun: 0xff8050, si: 0.48, ai: 0.55, hi: 0.43 },
            { minute: 18 * 60 + 30, bg: 0x283044, sun: 0x6e7fa6, si: 0.08, ai: 0.45, hi: 0.32 },
            { minute: 24 * 60, bg: 0x18212d, sun: 0x7188a8, si: 0.05, ai: 0.45, hi: 0.32 }
        ];
    }

    function officeUpdateLighting() {
        var frames = officeLightingFrames();
        var now = simOfficeClock.simMinute;
        var leftFrame = frames[0];
        var rightFrame = frames[frames.length - 1];
        for (var index = 0; index < frames.length - 1; index += 1) {
            if (now >= frames[index].minute && now <= frames[index + 1].minute) {
                leftFrame = frames[index];
                rightFrame = frames[index + 1];
                break;
            }
        }
        var span = Math.max(1, rightFrame.minute - leftFrame.minute);
        var amount = THREE.MathUtils.clamp((now - leftFrame.minute) / span, 0, 1);
        simScene.background = new THREE.Color(leftFrame.bg).lerp(new THREE.Color(rightFrame.bg), amount);
        simSun.color.copy(new THREE.Color(leftFrame.sun).lerp(new THREE.Color(rightFrame.sun), amount));
        simSun.intensity = THREE.MathUtils.lerp(leftFrame.si, rightFrame.si, amount);
        simAmbient.intensity = THREE.MathUtils.lerp(leftFrame.ai, rightFrame.ai, amount);
        simHemisphere.intensity = THREE.MathUtils.lerp(leftFrame.hi, rightFrame.hi, amount);
    }

    function officeSetList(collection) {
        var values = Array.from(collection).sort(function (left, right) { return left - right; });
        return values.length ? values.join(", ") : "—";
    }

    function officeUpdateHUD() {
        var timeElement = document.getElementById("sim-time");
        var elevatorElement = document.getElementById("elevator-readout");
        var statesElement = document.getElementById("state-breakdown");
        if (!timeElement || !elevatorElement || !statesElement) return;
        timeElement.textContent = simOfficeClock.format();
        var directionText = simElevator.direction > 0 ? "↑ up" : simElevator.direction < 0 ? "↓ down" : "— idle";
        elevatorElement.innerHTML =
            "<span>Elevator</span><b>floor " + String(simElevator.currentFloor) + " · " + directionText + "</b>" +
            "<span>Motion</span><b>" + simElevator.state.split("_").join(" ").toLowerCase() + " · " + String(simElevator.passengers.size) + "/4 riders</b>" +
            "<span>Destinations</span><b>" + officeSetList(simElevator.destinations) + "</b>" +
            "<span>Up / down calls</span><b>" + officeSetList(simElevator.upCalls) + " / " + officeSetList(simElevator.downCalls) + "</b>";
        var counts = {};
        simAgents.forEach(function (agent) {
            counts[agent.state] = (counts[agent.state] || 0) + 1;
        });
        var visibleStates = Object.keys(counts).filter(function (state) { return state !== "DISABLED" && state !== "AWAY" && state !== "GONE"; });
        visibleStates.sort();
        statesElement.textContent = "Present " + String(officeCountPresent()) + " · " + (visibleStates.length ? visibleStates.map(function (state) {
            return state.split("_").join(" ").toLowerCase() + " " + String(counts[state]);
        }).join(" · ") : "office opening soon");
    }

    function officeSetupUI() {
        var speedSlider = document.getElementById("speed-slider");
        var speedValue = document.getElementById("speed-value");
        var occupancySlider = document.getElementById("occupancy-slider");
        var occupancyValue = document.getElementById("occupancy-value");
        speedSlider.addEventListener("input", function (event) {
            var speedIndex = Number(event.target.value);
            simOfficeClock.timeScale = OFFICE_SPEED_STOPS[speedIndex];
            speedValue.textContent = String(simOfficeClock.timeScale) + "× realtime";
        });
        occupancySlider.addEventListener("input", function (event) {
            simTargetOccupancy = Number(event.target.value);
            occupancyValue.textContent = String(simTargetOccupancy) + " / " + String(MAX_OCCUPANCY) + " people";
            officeApplyOccupancy();
        });
        simTargetOccupancy = DEFAULT_OCCUPANCY;
        speedValue.textContent = String(simOfficeClock.timeScale) + "× realtime";
        occupancyValue.textContent = String(simTargetOccupancy) + " / " + String(MAX_OCCUPANCY) + " people";
    }

    function officeHandleResize() {
        if (!simCamera || !simRenderer) return;
        simCamera.aspect = window.innerWidth / window.innerHeight;
        simCamera.updateProjectionMatrix();
        simRenderer.setSize(window.innerWidth, window.innerHeight);
        simRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    }

    function startSimulation() {
        simScene = new THREE.Scene();
        simScene.background = new THREE.Color(0x20242a);
        simScene.fog = new THREE.FogExp2(0x20242a, 0.006);
        simCamera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
        simCamera.position.set(28, 24, 28);
        simCamera.lookAt(0, 8.5, 0);
        simRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        simRenderer.setSize(window.innerWidth, window.innerHeight);
        simRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        simRenderer.outputEncoding = THREE.sRGBEncoding;
        simRenderer.sortObjects = true;
        document.body.appendChild(simRenderer.domElement);
        simControls = new THREE.OrbitControls(simCamera, simRenderer.domElement);
        simControls.target.set(0, 8.4, 0);
        simControls.enableDamping = true;
        simControls.dampingFactor = 0.06;
        simControls.minDistance = 17;
        simControls.maxDistance = 72;
        simControls.maxPolarAngle = Math.PI * 0.49;
        simAmbient = new THREE.AmbientLight(0xffffff, 0.45);
        simScene.add(simAmbient);
        simHemisphere = new THREE.HemisphereLight(0xbfd7ff, 0x303020, 0.45);
        simScene.add(simHemisphere);
        simSun = new THREE.DirectionalLight(0xffffff, 0.9);
        simSun.position.set(20, 35, 18);
        simScene.add(simSun);
        var plazaMaterial = new THREE.MeshStandardMaterial({ color: 0x343d43, roughness: 1, side: THREE.DoubleSide });
        var plaza = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), plazaMaterial);
        plaza.rotation.x = -Math.PI * 0.5;
        plaza.position.y = -0.23;
        simScene.add(plaza);
        var grid = new THREE.GridHelper(70, 35, 0x56626a, 0x414b52);
        grid.position.y = -0.21;
        simScene.add(grid);
        simWorld = window.createWorld(simScene);
        simElevator = new window.Elevator(simScene, simWorld);
        simOfficeClock = new OfficeClock();
        simFrameClock = new THREE.Clock();
        officeCreateAgents();
        officeSetupUI();
        officeUpdateLighting();
        officeUpdateHUD();
        window.addEventListener("resize", officeHandleResize);

        function animate() {
            requestAnimationFrame(animate);
            var realDt = Math.min(0.05, simFrameClock.getDelta());
            if (simOfficeClock.tick(realDt)) {
                officeHandleDayWrap();
            }
            officeUpdateLighting();
            var motionDt = realDt * simOfficeClock.timeScale;
            simElevator.tick(motionDt);
            topUpVisitors();
            simAgents.forEach(function (agent) {
                officeProcessSchedule(agent, motionDt);
            });
            applyCollisions();
            simAgents.forEach(function (agent) {
                if (agent.group.parent && agent.group.visible) {
                    window.animatePersonWalking(agent.group, motionDt);
                }
            });
            simControls.update();
            simRenderer.render(simScene, simCamera);
            officeUpdateHUD();
        }
        animate();
    }

    window.startSimulation = startSimulation;
    if (document.readyState === "loading") {
        window.addEventListener("DOMContentLoaded", startSimulation);
    } else {
        startSimulation();
    }
})();
