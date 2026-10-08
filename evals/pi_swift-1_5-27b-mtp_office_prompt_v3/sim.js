/*
 * sim.js - simulation orchestration: people state machines, plan compiler,
 * elevator handshake, collision avoidance, HUD. Browser globals only.
 */
(function () {
    "use strict";

    // ---------- globals ----------
    var scene, camera, renderer, controls, clock;
    var world, elevLogic, elevator;
    var people = [];
    var simTime = 0;
    var lastHudUpdate = 0;

    var W = window.WORLD;
    var FH = W.FLOOR_HEIGHT;

    // ---------- setup ----------

    function setup() {
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x20242e);
        scene.fog = new THREE.Fog(0x20242e, 60, 140);
        window.scene = scene;

        camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 300);
        camera.position.set(26, 20, 30);

        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        document.body.appendChild(renderer.domElement);

        var ambient = new THREE.AmbientLight(0xffffff, 0.55);
        scene.add(ambient);
        var dir = new THREE.DirectionalLight(0xfff2dd, 0.8);
        dir.position.set(30, 50, 20);
        scene.add(dir);
        var dir2 = new THREE.DirectionalLight(0xbdd2ff, 0.3);
        dir2.position.set(-25, 30, -20);
        scene.add(dir2);

        var grid = new THREE.GridHelper(80, 40, 0x444a5a, 0x333947);
        grid.position.y = -0.36;
        scene.add(grid);

        controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.target.set(0, 6, 0);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;

        world = window.createWorld(scene);
        window.world = world;

        elevLogic = new window.ElevatorLogic({ floorCount: W.FLOOR_COUNT, maxCapacity: 4 });
        window.elevLogic = elevLogic;
        elevator = window.createElevator(null, elevLogic, world);

        spawnPeople();
        clock = new THREE.Clock();

        window.addEventListener("resize", function () {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        });

        animate();
    }

    // ---------- people ----------

    var WORKER_COUNT = 20;
    var VISITOR_COUNT = 80;

    function spawnPeople() {
        // workers on floors 1..5, 4 per floor, one per desk
        var desksByFloor = {};
        for (var f = 1; f < W.FLOOR_COUNT; f++) {
            desksByFloor[f] = world.floors[f].desks.slice();
        }
        var workerId = 0;
        for (var ff = 1; ff < W.FLOOR_COUNT; ff++) {
            var list = desksByFloor[ff];
            for (var d = 0; d < 4 && d < list.length; d++) {
                var desk = list[d];
                workerId++;
                var p = makePerson("worker", workerId, 0);
                p.deskNode = desk.name;
                p.deskFloor = ff;
                // start outside the building; they walk in and take the elevator
                var wa = Math.random() * Math.PI * 2;
                p.group.position.set(Math.cos(wa) * 5, 0, 12.5 + Math.sin(wa) * 2);
                p.state = "AWAY";
                p.spawnDelay = rand(1, 75);
                p.nextEventAt = 0;
                scene.add(p.group);
                people.push(p);
            }
        }

        // visitors spawn outside and arrive throughout the first ~6 minutes
        var visId = 1000;
        for (var v = 0; v < VISITOR_COUNT; v++) {
            visId++;
            var vp = makePerson("visitor", visId, 0);
            var ang = Math.random() * Math.PI * 2;
            var rad = 4 + Math.random() * 5;
            vp.group.position.set(Math.cos(ang) * rad, 0, 12.5 + Math.sin(ang) * rad * 0.5);
            vp.state = "AWAY";
            vp.spawnDelay = v < 4 ? rand(1, 3) : (v / VISITOR_COUNT) * 360 + rand(-20, 20);
            vp.spawnDelay = Math.max(0.5, vp.spawnDelay);
            scene.add(vp.group);
            people.push(vp);
        }
    }

    function makePerson(type, id, floor) {
        var opts = {};
        if (type === "worker") {
            opts.bodyColor = new THREE.Color(0x4f7fd9).offsetHSL(0, 0, rand(-0.05, 0.05)).getHex();
        }
        var g = window.createPerson(opts);
        return {
            id: id,
            type: type,
            group: g,
            floor: floor,
            state: "AWAY",
            speed: type === "worker" ? rand(1.3, 1.6) : rand(1.0, 1.4),
            path: [],
            pathIndex: 0,
            action: null,
            plan: [],
            planIndex: 0,
            currentNode: null,
            destFloor: 0,
            boards: false,
            pendingSit: null,
            loiterUntil: 0,
            idleUntil: 0,
            nextEventAt: 0,
            crowdFactor: 1,
            followTarget: null,
            followUntil: 0,
            talkTarget: null,
            talkUntil: 0
        };
    }

    function rand(a, b) { return a + Math.random() * (b - a); }
    function randInt(a, b) { return Math.floor(rand(a, b + 1)); }

    // ---------- plan compiler ----------

    // Action types:
    // MOVE_TO {floor,node, epsilon?}
    // WAIT_AT_PANEL {floor}
    // ENTER_ELEVATOR {}
    // PRESS_FLOOR {}
    // WAIT_FOR_FLOOR {}
    // EXIT_ELEVATOR {}
    // SIT_AT {node}
    // STAND_UP {}
    // LOITER_AT {node, duration}
    // STAND_AT {node}
    // WANDER_TO {node}
    // IDLE_TILL {duration}
    // LOOK {}
    // TALK_TO {person, duration}
    // FOLLOW {person, stopWhen}  // stopWhen: function(p, other)->bool
    // FINISH {}

    function compileArriveToDesk(p) {
        var plan = [
            { action: "MOVE_TO", floor: 0, node: "outside" },
            { action: "MOVE_TO", floor: 0, node: "front_door_threshold" },
            { action: "MOVE_TO", floor: 0, node: "entrance" },
            { action: "WAIT_AT_PANEL", floor: 0 },
            { action: "ENTER_ELEVATOR" },
            { action: "SET_DEST", floor: p.deskFloor },
            { action: "PRESS_FLOOR", floor: p.deskFloor },
            { action: "WAIT_FOR_FLOOR" },
            { action: "EXIT_ELEVATOR" },
            { action: "MOVE_TO", floor: p.deskFloor, node: "elevWait" },
            { action: "MOVE_TO", floor: p.deskFloor, node: p.deskNode },
            { action: "SIT_AT", node: p.deskNode },
            { action: "FINISH" }
        ];
        return plan;
    }

    function compileLeaveBuilding(p) {
        return [
            { action: "STAND_UP" },
            { action: "MOVE_TO", floor: p.floor, node: "elevWait" },
            { action: "WAIT_AT_PANEL", floor: p.floor },
            { action: "ENTER_ELEVATOR" },
            { action: "SET_DEST", floor: 0 },
            { action: "PRESS_FLOOR", floor: 0 },
            { action: "WAIT_FOR_FLOOR" },
            { action: "EXIT_ELEVATOR" },
            { action: "MOVE_TO", floor: 0, node: "lobby_center" },
            { action: "MOVE_TO", floor: 0, node: "entrance" },
            { action: "MOVE_TO", floor: 0, node: "front_door_threshold" },
            { action: "FINISH" }
        ];
    }

    function compileVisitorVisit(p, targetWorker) {
        var plan = [
            { action: "MOVE_TO", floor: 0, node: "outside" },
            { action: "MOVE_TO", floor: 0, node: "front_door_threshold" },
            { action: "MOVE_TO", floor: 0, node: "entrance" },
            { action: "WAIT_AT_PANEL", floor: 0 },
            { action: "ENTER_ELEVATOR" },
            { action: "SET_DEST", floor: targetWorker.deskFloor },
            { action: "PRESS_FLOOR", floor: targetWorker.deskFloor },
            { action: "WAIT_FOR_FLOOR" },
            { action: "EXIT_ELEVATOR" },
            { action: "MOVE_TO", floor: targetWorker.deskFloor, node: "elevWait" },
            { action: "MOVE_TO", floor: targetWorker.deskFloor, node: targetWorker.deskNode },
            { action: "LOITER_AT", node: targetWorker.deskNode, duration: rand(8, 14) },
            { action: "MOVE_TO", floor: targetWorker.deskFloor, node: "elevWait" },
            { action: "WAIT_AT_PANEL", floor: targetWorker.deskFloor },
            { action: "ENTER_ELEVATOR" },
            { action: "SET_DEST", floor: 0 },
            { action: "PRESS_FLOOR", floor: 0 },
            { action: "WAIT_FOR_FLOOR" },
            { action: "EXIT_ELEVATOR" },
            { action: "MOVE_TO", floor: 0, node: "lobby_center" },
            { action: "MOVE_TO", floor: 0, node: "entrance" },
            { action: "MOVE_TO", floor: 0, node: "front_door_threshold" },
            { action: "FINISH" }
        ];
        return plan;
    }

    function compileLunch(p, cafe) {
        var toCafe = cafe;
        var plan = [
            { action: "STAND_UP" },
            { action: "MOVE_TO", floor: p.floor, node: "elevWait" }
        ];
        if (toCafe) {
            plan = plan.concat([
                { action: "WAIT_AT_PANEL", floor: p.floor },
                { action: "ENTER_ELEVATOR" },
                { action: "SET_DEST", floor: 0 },
                { action: "PRESS_FLOOR", floor: 0 },
                { action: "WAIT_FOR_FLOOR" },
                { action: "EXIT_ELEVATOR" },
                { action: "MOVE_TO", floor: 0, node: "lobby_center" },
                { action: "MOVE_TO", floor: 0, node: "cafe_order" },
                { action: "LOITER_AT", node: "cafe_order", duration: rand(6, 12) },
                { action: "SIT_AT", node: p.cafeSeat },
                { action: "IDLE_TILL", duration: rand(30, 70) }
            ]);
        } else {
            plan = plan.concat([
                { action: "WANDER_TO", floor: p.floor, node: pickHallStand(p) }
            ]);
        }
        plan = plan.concat([
            { action: "STAND_UP" },
            { action: "MOVE_TO", floor: p.floor, node: "elevWait" },
            { action: "WAIT_AT_PANEL", floor: p.floor },
            { action: "ENTER_ELEVATOR" },
            { action: "SET_DEST", floor: p.floor },
            { action: "PRESS_FLOOR", floor: p.floor },
            { action: "WAIT_FOR_FLOOR" },
            { action: "EXIT_ELEVATOR" },
            { action: "MOVE_TO", floor: p.floor, node: "elevWait" },
            { action: "MOVE_TO", floor: p.floor, node: p.deskNode },
            { action: "SIT_AT", node: p.deskNode },
            { action: "FINISH" }
        ]);
        return plan;
    }

    function pick(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    function pickHallStand(p) {
        var f = world.floors[p.floor];
        return Math.random() < 0.5 ? "hall_stand_N" : "hall_stand_S";
    }

    function compileLounge(p) {
        var spot = pick(["lounge_spot0", "lounge_spot1", "lounge_spot2"]);
        return [
            { action: "STAND_UP" },
            { action: "MOVE_TO", floor: p.floor, node: "lounge_door" },
            { action: "MOVE_TO", floor: p.floor, node: "lounge_center" },
            { action: "SIT_AT", node: spot },
            { action: "IDLE_TILL", duration: rand(30, 80) },
            { action: "STAND_UP" },
            { action: "MOVE_TO", floor: p.floor, node: "lounge_center" },
            { action: "MOVE_TO", floor: p.floor, node: "lounge_door" },
            { action: "MOVE_TO", floor: p.floor, node: "elevWait" },
            { action: "MOVE_TO", floor: p.floor, node: p.deskNode },
            { action: "SIT_AT", node: p.deskNode },
            { action: "FINISH" }
        ];
    }

    function compileMeeting(p, organizer, seats, duration) {
        var plan;
        if (p === organizer) {
            plan = [
                { action: "STAND_UP" },
                { action: "MOVE_TO", floor: p.floor, node: "conf_door" },
                { action: "MOVE_TO", floor: p.floor, node: "conf_center" },
                { action: "SIT_AT", node: seats[0] },
                { action: "IDLE_TILL", duration: duration }
            ];
        } else {
            plan = [
                { action: "STAND_UP" },
                { action: "FOLLOW", person: organizer, stopWhen: function (other) {
                    return other.group.position.distanceTo(p.group.position) < 1.5;
                } },
                { action: "MOVE_TO", floor: p.floor, node: "conf_center" },
                { action: "SIT_AT", node: seats[1] },
                { action: "IDLE_TILL", duration: duration }
            ];
        }
        plan = plan.concat([
            { action: "STAND_UP" },
            { action: "MOVE_TO", floor: p.floor, node: "conf_door" },
            { action: "MOVE_TO", floor: p.floor, node: p.deskNode },
            { action: "SIT_AT", node: p.deskNode },
            { action: "FINISH" }
        ]);
        return plan;
    }

    function compileVisitCoworker(p, other) {
        return [
            { action: "STAND_UP" },
            { action: "MOVE_TO", floor: p.floor, node: other.deskNode },
            { action: "TALK_TO", person: other, duration: rand(4, 9) },
            { action: "MOVE_TO", floor: p.floor, node: p.deskNode },
            { action: "SIT_AT", node: p.deskNode },
            { action: "FINISH" }
        ];
    }

    function compileVisitorCafe(p) {
        var seat = pick(world.floors[0].cafeSpots);
        return [
            { action: "MOVE_TO", floor: 0, node: "outside" },
            { action: "MOVE_TO", floor: 0, node: "front_door_threshold" },
            { action: "MOVE_TO", floor: 0, node: "entrance" },
            { action: "MOVE_TO", floor: 0, node: "lobby_center" },
            { action: "MOVE_TO", floor: 0, node: "cafe_order" },
            { action: "LOITER_AT", node: "cafe_order", duration: rand(4, 9) },
            { action: "SIT_AT", node: seat },
            { action: "IDLE_TILL", duration: rand(40, 90) },
            { action: "STAND_UP" },
            { action: "MOVE_TO", floor: 0, node: "lobby_center" },
            { action: "MOVE_TO", floor: 0, node: "entrance" },
            { action: "MOVE_TO", floor: 0, node: "front_door_threshold" },
            { action: "FINISH" }
        ];
    }

    function compileLobbyLoiter(p) {
        var spots = ["lobby_stand_center", "lobby_stand_NE", "lobby_stand_NW",
            "lobby_stand_midE", "lobby_stand_midW", "lobby_stand_entry",
            "back_lounge_N", "back_lounge_S", "pit_N", "pit_S", "pit_E", "pit_W",
            "front_lounge0", "front_lounge1", "front_lounge2", "kiosk", "reception"];
        var a = pick(spots);
        var b = pick(spots);
        var plan = [
            { action: "MOVE_TO", floor: 0, node: "outside" },
            { action: "MOVE_TO", floor: 0, node: "front_door_threshold" },
            { action: "MOVE_TO", floor: 0, node: "entrance" },
            { action: "MOVE_TO", floor: 0, node: a },
            { action: "LOITER_AT", node: a, duration: rand(8, 20) }
        ];
        var s1 = world.floors[0].sitTargets[a];
        if (s1 && s1.sit) {
            plan.push({ action: "SIT_AT", node: a });
            plan.push({ action: "IDLE_TILL", duration: rand(15, 35) });
            plan.push({ action: "STAND_UP" });
        }
        plan = plan.concat([
            { action: "MOVE_TO", floor: 0, node: b },
            { action: "LOITER_AT", node: b, duration: rand(8, 20) },
            { action: "MOVE_TO", floor: 0, node: "entrance" },
            { action: "MOVE_TO", floor: 0, node: "front_door_threshold" },
            { action: "FINISH" }
        ]);
        return plan;
    }

    // ---------- plan / action execution ----------

    function startPlan(p, plan, kind) {
        p.plan = plan;
        p.planKind = kind;
        p.planIndex = 0;
        p.action = null;
        nextAction(p);
    }

    function nextAction(p) {
        if (p.planIndex >= p.plan.length) {
            finishPlan(p);
            return;
        }
        var act = p.plan[p.planIndex++];
        startAction(p, act);
    }

    function finishPlan(p) {
        p.plan = [];
        p.planIndex = 0;
        p.action = null;
        switch (p.planKind) {
            case "ARRIVE":
                p.state = "AT_DESK";
                scheduleNextEvent(p);
                break;
            case "LEAVE":
                p.state = "GONE";
                p.group.visible = false;
                break;
            case "LUNCH":
            case "LOUNGE":
            case "MEETING":
            case "VISIT":
                p.state = "AT_DESK";
                scheduleNextEvent(p);
                break;
            case "VISITOR_CAFE":
            case "VISITOR_LOITER":
            case "VISITOR_VISIT":
                p.state = "GONE";
                p.group.visible = false;
                break;
            default:
                break;
        }
    }

    function scheduleNextEvent(p) {
        if (p.nextEventAt === 0) {
            p.nextEventAt = simTime + rand(40, 240);
        }
        p.nextEventAt = Math.max(p.nextEventAt, simTime + 25);
    }

    // ---------- action start ----------

    function currentFloorData(p) {
        return world.floors[p.floor];
    }

    function nodeWorldPos(floorData, node) {
        var n = floorData.graph.nodes[node];
        if (!n) return null;
        return new THREE.Vector3(n.x, 0, n.z);
    }

    function goToNode(p, floor, node, epsilon) {
        var fd = world.floors[floor];
        var to = nodeWorldPos(fd, node);
        if (!to) {
            // unknown node: fail safe, finish action
            return false;
        }
        var from = p.currentNode;
        if (!from || !fd.graph.nodes[from]) {
            from = window.nearestNodeName(fd, p.group.position.x, p.group.position.z);
        }
        var path = window.bfsPath(fd, from, node);
        if (!path || path.length === 0) return false;
        p.path = path;
        p.pathIndex = 0;
        p.currentNode = node;
        p.arrivalEpsilon = epsilon !== undefined ? epsilon : 0.22;
        p.floor = floor;
        p.group.position.y = floor * FH;
        return true;
    }

    function startAction(p, act) {
        p.action = act;
        switch (act.action) {
            case "MOVE_TO":
            case "WANDER_TO": {
                if (!goToNode(p, act.floor, act.node)) {
                    p.planIndex++; // skip this action
                    nextAction(p);
                    return;
                }
                p.state = stateForAction(p, act);
                break;
            }
            case "WAIT_AT_PANEL": {
                p.state = "WAITING_ELEVATOR";
                p.panelFloor = act.floor;
                // call the panel once when the car is not already serving
                if (!elevLogic.upCalls.has(0) && act.floor === 0) {
                    elevLogic.callUp(0);
                } else if (act.floor !== 0) {
                    elevLogic.callUp(act.floor);
                }
                // ensure we are standing near the panel (elevWait)
                if (p.floor === 0 && p.currentNode !== "elevWait") {
                    goToNode(p, 0, "elevWait");
                }
                break;
            }
            case "SET_DEST": {
                p.destFloor = act.floor;
                nextAction(p);
                break;
            }
            case "ENTER_ELEVATOR": {
                // destination is the following SET_DEST action of this leg.
                // planIndex already points past ENTER, so the SET_DEST is at
                // p.plan[p.planIndex].
                var nextAct = p.plan[p.planIndex];
                var destF = (nextAct && nextAct.action === "SET_DEST") ? nextAct.floor : p.destFloor;
                var pfl = p.panelFloor || 0;
                var dir = destF > pfl ? 1 : -1;
                var spot = null;
                if (elevLogic.isAcceptingAt(pfl, dir)) {
                    spot = elevLogic.reserveBoardingSpot(p);
                }
                if (spot) {
                    p.boards = true;
                    p.state = "IN_CAR";
                    // move to the 2x2 interior spot (world coords: door at z=1.5)
                    p.path = [new THREE.Vector3(spot.x, 0, 1.5 + spot.z)];
                    p.pathIndex = 0;
                    p.boardSpot = spot;
                } else {
                    // not accepting: stay waiting (repeat WAIT_AT_PANEL)
                    p.planIndex = Math.max(0, p.planIndex - 2);
                    nextAction(p);
                    return;
                }
                break;
            }
            case "PRESS_FLOOR": {
                p.destFloor = act.floor;
                elevLogic.pressDestination(act.floor);
                p.state = "IN_CAR";
                nextAction(p);
                break;
            }
            case "WAIT_FOR_FLOOR": {
                p.state = "IN_CAR";
                break;
            }
            case "EXIT_ELEVATOR": {
                if (elevLogic.state === "DOOR_OPEN" && elevLogic.currentFloor === p.destFloor) {
                    elevLogic.registerDisembark(p);
                    elevLogic.completeDisembark(p);
                    p.boards = false;
                    p.floor = p.destFloor;
                    p.group.position.y = p.destFloor * FH;
                    // step out of the car to the door plane
                    p.path = [new THREE.Vector3(p.group.position.x, p.destFloor * FH, 2.35)];
                    p.pathIndex = 0;
                    p.state = "ON_FLOOR";
                }
                break;
            }
            case "SIT_AT": {
                var tgt = currentFloorData(p).sitTargets[act.node];
                if (!tgt) {
                    p.planIndex++;
                    nextAction(p);
                    return;
                }
                if (p.currentNode === act.node && p.group.userData.isSitting) {
                    nextAction(p);
                    return;
                }
                p.pendingSit = { node: act.node, sit: tgt };
                if (!goToNode(p, p.floor, act.node, 0.25)) {
                    p.planIndex++;
                    nextAction(p);
                    return;
                }
                break;
            }
            case "STAND_UP": {
                p.group.userData.isSitting = false;
                p.group.userData.isWalking = true;
                p.group.position.y = p.floor * FH;
                nextAction(p);
                break;
            }
            case "LOITER_AT":
            case "STAND_AT": {
                if (act.action === "LOITER_AT" && p.currentNode === act.node && p.path.length === 0) {
                    p.loiterUntil = simTime + (act.duration || 5);
                    break;
                }
                if (!goToNode(p, p.floor, act.node)) {
                    p.planIndex++;
                    nextAction(p);
                    return;
                }
                if (act.action === "LOITER_AT") {
                    p.pendingLoiterDur = act.duration || 5;
                }
                break;
            }
            case "IDLE_TILL": {
                p.idleUntil = simTime + (act.duration || 3);
                break;
            }
            case "LOOK": {
                p.group.rotation.y = rand(0, Math.PI * 2);
                p.idleUntil = simTime + (act.duration || 1.5);
                break;
            }
            case "TALK_TO": {
                p.talkTarget = act.person;
                p.talkUntil = simTime + (act.duration || 5);
                var talkNode = nodeNearPerson(act.person);
                if (!talkNode || !goToNode(p, p.floor, talkNode, 0.6)) {
                    p.planIndex++;
                    nextAction(p);
                    return;
                }
                break;
            }
            case "FOLLOW": {
                p.followTarget = act.person;
                p.followStop = act.stopWhen || null;
                break;
            }
            case "FINISH":
            default:
                nextAction(p);
                break;
        }
    }

    function nodeNearPerson(other) {
        if (!other || other.state === "GONE") return null;
        var fd = world.floors[other.floor];
        return window.nearestNodeName(fd, other.group.position.x, other.group.position.z);
    }

    function stateForAction(p, act) {
        var n = act.node;
        if (n === "elevWait") return "WAITING_ELEVATOR";
        if (p.planKind === "ARRIVE" || p.planKind === "VISITOR_VISIT") {
            if (act.floor === 0 && (n === "outside" || n === "front_door_threshold" || n === "entrance")) return "ARRIVING";
            if (act.floor !== 0 && act.floor === (p.deskFloor || p.destFloor)) return "ON_FLOOR";
        }
        if (p.planKind === "LUNCH") {
            if (act.floor === 0 && n === "cafe_order") return "AT_LUNCH";
            if (act.floor === 0 && n === "lobby_center") return "AT_BREAK";
        }
        if (p.planKind === "LOUNGE") return "AT_BREAK";
        if (p.planKind === "MEETING") return "IN_MEETING";
        if (p.planKind === "VISIT") return "ON_FLOOR";
        if (p.planKind === "LEAVE") return "LEAVING";
        if (p.planKind === "VISITOR_CAFE") return "AT_LUNCH";
        return "ON_FLOOR";
    }

    // ---------- per-person update ----------

    function updatePerson(p, dt) {
        if (p.state === "GONE" || p.state === "DISABLED") return;

        // AWAY: waiting to spawn / workers pre-day
        if (p.state === "AWAY") {
            if (p.type === "worker") {
                if (simTime > (p.spawnDelay || 0)) {
                    p.spawnDelay = 0;
                    p.floor = 0;
                    p.currentNode = "outside";
                    p.group.userData.isSitting = false;
                    startPlan(p, compileArriveToDesk(p), "ARRIVE");
                }
                return;
            }
            if (simTime >= p.spawnDelay) {
                p.state = "ARRIVING";
                p.currentNode = "outside";
                // choose visitor activity
                var r = Math.random();
                var targetWorker = null;
                if (r < 0.25) {
                    var workers = people.filter(function (q) {
                        return q.type === "worker" && q.state === "AT_DESK";
                    });
                    if (workers.length) targetWorker = pick(workers);
                }
                if (targetWorker) {
                    p.destFloor = targetWorker.deskFloor;
                    startPlan(p, compileVisitorVisit(p, targetWorker), "VISITOR_VISIT");
                } else if (r < 0.6) {
                    startPlan(p, compileVisitorCafe(p), "VISITOR_CAFE");
                } else {
                    startPlan(p, compileLobbyLoiter(p), "VISITOR_LOITER");
                }
            }
            return;
        }

        var act = p.action;

        // FOLLOW: track the other person
        if (act && act.action === "FOLLOW") {
            var other = p.followTarget;
            if (!other || other.state === "GONE") {
                p.followTarget = null;
                nextAction(p);
                return;
            }
            var d = other.group.position.distanceTo(p.group.position);
            if ((p.followStop && p.followStop(other)) || d < 0.9) {
                p.followTarget = null;
                nextAction(p);
                return;
            }
            // move toward other (same floor assumed)
            var dx = other.group.position.x - p.group.position.x;
            var dz = other.group.position.z - p.group.position.z;
            var dist = Math.hypot(dx, dz);
            if (dist > 0.01) {
                var step = p.speed * dt * 0.9;
                if (dist > step) {
                    p.group.position.x += dx / dist * step;
                    p.group.position.z += dz / dist * step;
                    p.group.rotation.y = Math.atan2(dx, dz);
                } else {
                    p.group.position.x = other.group.position.x;
                    p.group.position.z = other.group.position.z;
                }
                p.group.userData.isWalking = true;
            }
            return;
        }

        // TALK_TO: face and stay
        if (act && act.action === "TALK_TO" && p.path.length === 0) {
            p.group.userData.isWalking = false;
            var other2 = p.talkTarget;
            if (other2 && other2.state !== "GONE") {
                var fx = other2.group.position.x - p.group.position.x;
                var fz = other2.group.position.z - p.group.position.z;
                if (fx * fx + fz * fz > 0.001) p.group.rotation.y = Math.atan2(fx, fz);
            }
            if (simTime >= p.talkUntil || !other2 || other2.state === "GONE" || other2.state !== "AT_DESK") {
                p.talkTarget = null;
                nextAction(p);
            }
            return;
        }

        // IDLE_TILL / LOOK timers
        if (act && (act.action === "IDLE_TILL" || act.action === "LOOK") && p.path.length === 0) {
            p.group.userData.isWalking = false;
            if (simTime >= p.idleUntil) nextAction(p);
            return;
        }

        // LOITER_AT timing
        if (act && act.action === "LOITER_AT" && p.path.length === 0) {
            p.group.userData.isWalking = false;
            if (p.loiterUntil === 0) p.loiterUntil = simTime + (p.pendingLoiterDur || 5);
            if (simTime >= p.loiterUntil) {
                p.loiterUntil = 0;
                nextAction(p);
            }
            return;
        }

        // path movement
        if (p.path && p.path.length > 0) {
            moveAlongPath(p, dt);
            return;
        }

        // no path and no timer: nudge forward
        if (act && (act.action === "WAIT_FOR_FLOOR" || act.action === "EXIT_ELEVATOR")) {
            // inside car: follow the car
            if (p.boards && elevLogic.passengers.has(p)) {
                p.group.position.x *= 0.9;
                p.group.position.z = 1.5 + (p.boardSpot ? p.boardSpot.z : -1) * 0.9;
                p.group.position.y = elevLogic.position * FH + 0.1;
                // per-tick exit check: doors open at our destination floor.
                // nextAction() consumes the following EXIT_ELEVATOR action and
                // runs its startAction (which performs the disembark).
                if (act.action === "WAIT_FOR_FLOOR" &&
                    elevLogic.state === "DOOR_OPEN" && elevLogic.currentFloor === p.destFloor) {
                    nextAction(p);
                }
                return;
            }
            if (act.action === "EXIT_ELEVATOR" && elevLogic.state === "DOOR_OPEN" &&
                elevLogic.currentFloor === p.destFloor) {
                startAction(p, act); // retry disembark
                return;
            }
            return;
        }

        if (act && act.action === "WAIT_AT_PANEL") {
            // stand by the panel; ENTER_ELEVATOR is the next plan action.
            // Re-press the hall call if it was cleared (e.g. doors opened and
            // closed before we arrived) so the car keeps coming back.
            var pf = p.panelFloor || 0;
            var carServingHere = elevLogic.currentFloor === pf &&
                (elevLogic.state === "DOOR_OPENING" || elevLogic.state === "DOOR_OPEN");
            if (!elevLogic.hasCall(pf, pf > 0 ? 1 : -1) && !carServingHere) {
                elevLogic.callUp(pf);
            }
            // Advance to ENTER_ELEVATOR once the car is accepting us here.
            // The destination is the SET_DEST action after ENTER_ELEVATOR.
            var enterDest = p.plan[p.planIndex + 1];
            var dF = (enterDest && enterDest.action === "SET_DEST") ? enterDest.floor : p.destFloor;
            var dDir = dF > pf ? 1 : -1;
            if (carServingHere && elevLogic.isAcceptingAt(pf, dDir)) {
                nextAction(p); // -> ENTER_ELEVATOR (boards if a spot is free)
            }
            return;
        }

        if (act) {
            // generic fallback: complete the action to avoid stalling
            p.planIndex++;
            nextAction(p);
            return;
        }

        // no action: idle
        p.group.userData.isWalking = false;
    }

    function moveAlongPath(p, dt) {
        var target = p.path[p.pathIndex];
        var pos = p.group.position;
        var dx = target.x - pos.x;
        var dz = target.z - pos.z;
        var dist = Math.hypot(dx, dz);
        var step = p.speed * dt * p.crowdFactor;
        // Arrival tolerance: snap when close enough so single-point
        // bottlenecks (e.g. the entrance) don't deadlock on collision push.
        if (dist <= step + 0.35) {
            pos.x = target.x;
            pos.z = target.z;
            p.pathIndex++;
            if (p.pathIndex >= p.path.length) {
                p.path = [];
                onArrived(p);
            }
        } else {
            pos.x += dx / dist * step;
            pos.z += dz / dist * step;
            p.group.rotation.y = Math.atan2(dx, dz);
        }
        p.group.userData.isWalking = true;
    }

    function onArrived(p) {
        var act = p.action;
        if (!act) return;

        if (p.pendingSit) {
            var tgt = p.pendingSit.sit;
            p.group.position.y = p.floor * FH + 0.45;
            p.group.rotation.y = tgt.facing;
            p.group.userData.isSitting = true;
            p.group.userData.isWalking = false;
            p.pendingSit = null;
            nextAction(p);
            return;
        }

        if (act.action === "ENTER_ELEVATOR" && p.boards) {
            elevLogic.completeBoard(p);
            // destination is pressed by the SET_DEST + PRESS_FLOOR actions
            // that follow in the plan
            nextAction(p);
            return;
        }

        if (act.action === "EXIT_ELEVATOR") {
            // stepped out; continue
            nextAction(p);
            return;
        }

        if (act.action === "LOITER_AT") {
            p.loiterUntil = 0; // set on next frame
            p.group.rotation.y = rand(0, Math.PI * 2);
            nextAction(p);
            return;
        }

        // generic arrival: advance
        nextAction(p);
    }

    // ---------- collision avoidance ----------

    function resolveCollisions() {
        var R = W.PERSON_R;
        var minDist = R * 2;
        // group by floor
        var byFloor = {};
        for (var i = 0; i < people.length; i++) {
            var p = people[i];
            if (p.state === "GONE" || p.state === "DISABLED" || !p.group.visible) continue;
            (byFloor[p.floor] = byFloor[p.floor] || []).push(p);
        }
        for (var f in byFloor) {
            var arr = byFloor[f];
            for (var a = 0; a < arr.length; a++) {
                var pa = arr[a];
                for (var b = a + 1; b < arr.length; b++) {
                    var pb = arr[b];
                    var exempt = (pa.boards || pb.boards) &&
                        pa.floor === 0 && pb.floor === 0 &&
                        Math.abs(pa.group.position.z - 1.5) < 1.2 &&
                        Math.abs(pb.group.position.z - 1.5) < 1.2;
                    if (exempt) continue;
                    // entrance threshold exclusion: both near the door gap
                    var nearDoor = Math.abs(pa.group.position.x) < 1.6 && pa.group.position.z > 8.6 &&
                        Math.abs(pb.group.position.x) < 1.6 && pb.group.position.z > 8.6;
                    if (nearDoor) continue;

                    var dx = pb.group.position.x - pa.group.position.x;
                    var dz = pb.group.position.z - pa.group.position.z;
                    var d2 = dx * dx + dz * dz;
                    if (d2 < minDist * minDist && d2 > 0.000000001) {
                        var d = Math.sqrt(d2);
                        var push = (minDist - d) / 2;
                        var nx = dx / d, nz = dz / d;
                        pa.group.position.x -= nx * push;
                        pa.group.position.z -= nz * push;
                        pb.group.position.x += nx * push;
                        pb.group.position.z += nz * push;
                        pa.crowdFactor = Math.max(0.45, pa.crowdFactor * 0.995);
                        pb.crowdFactor = Math.max(0.45, pb.crowdFactor * 0.995);
                    }
                }
            }
        }
        // slow recovery
        for (var k = 0; k < people.length; k++) {
            people[k].crowdFactor = Math.min(1, people[k].crowdFactor + 0.01);
        }
    }

    // ---------- worker event scheduling ----------

    function maybeScheduleEvents() {
        for (var i = 0; i < people.length; i++) {
            var p = people[i];
            if (p.type !== "worker" || p.state !== "AT_DESK" || p.plan.length > 0) continue;
            if (simTime < p.nextEventAt) continue;
            p.nextEventAt = 0;
            var r = Math.random();
            if (r < 0.34) {
                p.cafeSeat = pick(world.floors[0].cafeSpots);
                startPlan(p, compileLunch(p, true), "LUNCH");
            } else if (r < 0.62) {
                startPlan(p, compileLounge(p), "LOUNGE");
            } else if (r < 0.80) {
                // meeting: 2-4 people on the same floor
                var mates = people.filter(function (q) {
                    return q.type === "worker" && q !== p && q.deskFloor === p.deskFloor &&
                        q.state === "AT_DESK" && q.plan.length === 0;
                });
                var count = Math.min(mates.length, randInt(1, 3));
                var seats = ["conf_seat0", "conf_seat1", "conf_seat2", "conf_seat3"];
                var dur = rand(25, 50);
                startPlan(p, compileMeeting(p, p, seats, dur), "MEETING");
                for (var m = 0; m < count; m++) {
                    var mate = mates[m];
                    startPlan(mate, compileMeeting(mate, p, [seats[m + 1]], dur), "MEETING");
                }
            } else if (r < 0.94) {
                var peers = people.filter(function (q) {
                    return q.type === "worker" && q !== p && q.deskFloor === p.deskFloor &&
                        q.state === "AT_DESK" && q.plan.length === 0;
                });
                if (peers.length) {
                    startPlan(p, compileVisitCoworker(p, pick(peers)), "VISIT");
                } else {
                    p.nextEventAt = simTime + rand(15, 40);
                }
            } else {
                // leave the building (rare)
                startPlan(p, compileLeaveBuilding(p), "LEAVE");
            }
        }
    }

    // ---------- HUD ----------

    var hud = null;

    function makeHUD() {
        hud = document.createElement("div");
        hud.style.cssText = "position:fixed;top:10px;left:10px;z-index:10;background:rgba(10,12,18,0.75);" +
            "color:#cfe3ff;font:12px/1.5 monospace;padding:8px 12px;border-radius:6px;min-width:230px;" +
            "pointer-events:none;border:1px solid #2c3550;white-space:pre;";
        document.body.appendChild(hud);
    }

    function updateHUD() {
        if (!hud) return;
        var riders = elevLogic.passengers.size + elevLogic.pendingBoarders.size;
        var inBuilding = 0, atDesk = 0, lunch = 0, meeting = 0, elev = 0, outside = 0;
        for (var i = 0; i < people.length; i++) {
            var p = people[i];
            if (p.state === "GONE" || p.state === "DISABLED") continue;
            inBuilding++;
            if (p.state === "AT_DESK") atDesk++;
            else if (p.state === "AT_LUNCH" || p.state === "AT_BREAK") lunch++;
            else if (p.state === "IN_MEETING") meeting++;
            else if (p.state === "WAITING_ELEVATOR" || p.state === "IN_CAR") elev++;
            else if (p.state === "ARRIVING") outside++;
        }
        var floor = elevLogic.currentFloor;
        hud.textContent =
            "t=" + simTime.toFixed(0).padStart(4, "0") + "s   " + elevLogic.state +
            "  car@F" + floor + (elevLogic.direction > 0 ? " \u2191" : elevLogic.direction < 0 ? " \u2193" : "") +
            (elevLogic.targetFloor !== floor ? " \u2192F" + elevLogic.targetFloor : "") + "\n" +
            "riders: " + riders + "/4   in-building: " + inBuilding +
            "   at-desk: " + atDesk + "\n" +
            "lunch/lounge: " + lunch + "   meeting: " + meeting +
            "   elevator: " + elev + "   arriving: " + outside;
    }

    // ---------- main loop ----------

    function simStep(dt) {
        simTime += dt;

        elevLogic.tick(dt);

        for (var i = 0; i < people.length; i++) {
            updatePerson(people[i], dt);
        }

        for (var j = 0; j < people.length; j++) {
            var pp = people[j];
            if (pp.state !== "GONE" && pp.state !== "DISABLED") {
                window.animatePersonWalking(pp.group, dt);
            }
        }

        resolveCollisions();
        elevator.update(dt);
        maybeScheduleEvents();

        if (simTime - lastHudUpdate > 0.25) {
            lastHudUpdate = simTime;
            updateHUD();
        }
    }

    function animate() {
        requestAnimationFrame(animate);
        var dt = Math.min(clock.getDelta(), 0.1);
        simStep(dt);
        controls.update();
        renderer.render(scene, camera);
    }

    // ---------- boot ----------

    makeHUD();
    setup();

    // debug/test hook (used by the headless runtime check)
    window.simDebug = {
        step: simStep,
        people: function () { return people; },
        simTime: function () { return simTime; },
        elevLogic: function () { return elevLogic; }
    };
})();
