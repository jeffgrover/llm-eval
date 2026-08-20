/*
 * elevator.js - visual adapter for the pure ElevatorLogic state machine.
 *
 * Owns the yellow car geometry (translucent frame, opaque back wall,
 * sliding +Z doors, glowing cylinder destination buttons, in-car floor
 * indicator) and the per-floor call-panel lamps. All scheduling,
 * direction, capacity and door-timing decisions are delegated to
 * ElevatorLogic (elevator_logic.js); this file only converts logic state
 * into positions, door offsets and canvas text.
 *
 * Classic script: attaches window.Elevator.
 */
(function () {
    "use strict";

    var CAR_W = 2.6;
    var CAR_D = 2.6;
    var CAR_H = 2.3;
    var DOOR_W = CAR_W / 2;              // each door half is half the car width
    var DOOR_TRAVEL = CAR_W / 2 - 0.05;  // open: slide out ~half width minus a gap
    var DOOR_Z = CAR_D / 2 + 0.01;

    function makeDisplay(wWorld, hWorld, px, py) {
        var canvas = document.createElement("canvas");
        canvas.width = px;
        canvas.height = py;
        var ctx = canvas.getContext("2d");
        var tex = new THREE.CanvasTexture(canvas);
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        var mesh = new THREE.Mesh(
            new THREE.PlaneGeometry(wWorld, hWorld),
            new THREE.MeshBasicMaterial({ map: tex, transparent: true })
        );
        return { mesh: mesh, ctx: ctx, tex: tex };
    }

    function drawFloorNumber(ctx, floor, doorOpen, dir) {
        var c = ctx.canvas;
        ctx.fillStyle = "#060608";
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.fillStyle = doorOpen ? "#39e06a" : "#7fd4ff";
        ctx.font = "bold 120px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.shadowColor = doorOpen ? "#00ff66" : "#2288ff";
        ctx.shadowBlur = 22;
        ctx.fillText(String(floor), c.width / 2, c.height / 2 - 26);
        ctx.font = "bold 64px monospace";
        ctx.fillStyle = doorOpen ? "#39e06a" : "#4d5666";
        var arrow = dir > 0 ? "up" : (dir < 0 ? "dn" : "..");
        ctx.shadowBlur = 0;
        ctx.fillStyle = doorOpen ? "#39e06a" : "#333c4a";
        ctx.fillText(arrow, c.width / 2, c.height / 2 + 62);
        ctx.font = "bold 30px monospace";
        ctx.fillText(doorOpen ? "OPEN" : "RUN", c.width / 2, c.height / 2 + 104);
    }

    function Elevator(scene, world) {
        this.scene = scene;
        this.world = world;
        this.logic = new ElevatorLogic({
            floorCount: WORLD.FLOOR_COUNT,
            maxCapacity: 4,
            floorHeight: WORLD.FLOOR_HEIGHT,
            speed: 2.2
        });

        var yellowFrame = new THREE.MeshLambertMaterial({
            color: 0xffc21e, transparent: true, opacity: 0.5,
            depthWrite: false, side: THREE.DoubleSide
        });
        var yellowSolid = new THREE.MeshLambertMaterial({ color: 0xf2b213 });
        var doorMat = new THREE.MeshLambertMaterial({
            color: 0xffd54a, transparent: true, opacity: 0.7,
            depthWrite: false, side: THREE.DoubleSide
        });
        var car = new THREE.Group();

        var carFloor = new THREE.Mesh(new THREE.BoxGeometry(CAR_W, 0.08, CAR_D), yellowFrame);
        carFloor.position.y = -0.04;
        car.add(carFloor);

        var carCeil = new THREE.Mesh(new THREE.BoxGeometry(CAR_W, 0.06, CAR_D), yellowFrame);
        carCeil.position.y = CAR_H + 0.03;
        car.add(carCeil);

        var sx;
        for (sx = -1; sx <= 1; sx += 2) {
            var side = new THREE.Mesh(new THREE.BoxGeometry(0.05, CAR_H - 0.1, CAR_D - 0.16), yellowFrame);
            side.position.set(sx * (CAR_W / 2 - 0.025), CAR_H / 2, 0);
            car.add(side);
        }

        var backWall = new THREE.Mesh(new THREE.BoxGeometry(CAR_W - 0.06, CAR_H - 0.08, 0.06), yellowSolid);
        backWall.position.set(0, CAR_H / 2, -CAR_D / 2 + 0.03);
        car.add(backWall);

        var sz;
        for (sx = -1; sx <= 1; sx += 2) {
            for (sz = -1; sz <= 1; sz += 2) {
                var post = new THREE.Mesh(new THREE.BoxGeometry(0.08, CAR_H, 0.08), yellowSolid);
                post.position.set(sx * (CAR_W / 2 - 0.04), CAR_H / 2, sz * (CAR_D / 2 - 0.04));
                car.add(post);
            }
        }

        // Two sliding doors on the +Z face; closed they meet at x = 0.
        this.leftDoor = new THREE.Mesh(new THREE.BoxGeometry(DOOR_W - 0.02, CAR_H - 0.12, 0.04), doorMat);
        this.leftDoor.position.set(-(DOOR_W / 2 - 0.01), CAR_H / 2 + 0.02, DOOR_Z);
        car.add(this.leftDoor);
        this.rightDoor = new THREE.Mesh(new THREE.BoxGeometry(DOOR_W - 0.02, CAR_H - 0.12, 0.04), doorMat);
        this.rightDoor.position.set(DOOR_W / 2 - 0.01, CAR_H / 2 + 0.02, DOOR_Z);
        car.add(this.rightDoor);

        // Destination panel on the back-right wall: one glowing cylinder
        // button per floor (buttons light up when that floor is a destination).
        var baseX = CAR_W / 2 - 0.45;
        var baseZ = -CAR_D / 2 + 0.10;
        var panelPlate = new THREE.Mesh(new THREE.BoxGeometry(0.42, 1.9, 0.05), yellowSolid);
        panelPlate.position.set(baseX, 1.45, baseZ - 0.03);
        car.add(panelPlate);
        this.destButtons = [];
        var f;
        for (f = 0; f < this.logic.floorCount; f++) {
            var bm = new THREE.MeshLambertMaterial({
                color: 0x20242c, emissive: 0x000000
            });
            var bmOn = new THREE.MeshLambertMaterial({
                color: 0x304030, emissive: 0x33ff88, emissiveIntensity: 0.9
            });
            var btn = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.05, 12), bm);
            btn.rotation.x = Math.PI / 2; // face +Z (into the car)
            btn.position.set(baseX, 0.80 + f * 0.21, baseZ + 0.02);
            btn.userData.offMat = bm;
            btn.userData.onMat = bmOn;
            car.add(btn);
            this.destButtons.push(btn);
        }

        // In-car floor indicator above the doors, INSIDE the car, facing
        // the passengers (-Z).
        this.indicator = makeDisplay(0.6, 0.6, 256, 256);
        this.indicator.mesh.position.set(0, CAR_H - 0.42, DOOR_Z - 0.05);
        this.indicator.mesh.rotation.y = Math.PI;
        car.add(this.indicator.mesh);

        car.traverse(function (obj) { obj.renderOrder = 1; });
        this.car = car;
        car.position.y = 0;
        scene.add(car);

        this.displaySig = "";
        this.updateDisplays();
    }

    Elevator.prototype.spotToWorld = function (spot) {
        return new THREE.Vector3(spot.x, this.logic.position + spot.y, spot.z);
    };

    Elevator.prototype.doorOpenAmount = function () {
        var st = this.logic.state;
        if (st === "DOOR_OPENING") return this.logic.doorT;
        if (st === "DOOR_OPEN") return 1;
        if (st === "DOOR_CLOSING") return 1 - this.logic.doorT;
        return 0;
    };

    // ---- state pass-throughs for the HUD (mirrors the logic core) ----
    Elevator.prototype.getState = function () { return this.logic.state; };
    Elevator.prototype.getDirection = function () { return this.logic.direction; };
    Elevator.prototype.getCurrentFloor = function () { return this.logic.currentFloor; };
    Elevator.prototype.getTargetFloor = function () { return this.logic.targetFloor; };
    Elevator.prototype.getPassengerCount = function () { return this.logic.passengers.size; };
    Elevator.prototype.getPendingBoarders = function () { return this.logic.pendingBoarders.size; };
    Elevator.prototype.getPendingDisembark = function () { return this.logic.pendingDisembark.size; };
    Elevator.prototype.getUpCalls = function () {
        var out = [];
        this.logic.upCalls.forEach(function (f) { out.push(f); });
        out.sort();
        return out;
    };
    Elevator.prototype.getDownCalls = function () {
        var out = [];
        this.logic.downCalls.forEach(function (f) { out.push(f); });
        out.sort();
        return out;
    };
    Elevator.prototype.getDestinations = function () {
        var out = [];
        this.logic.destinations.forEach(function (f) { out.push(f); });
        out.sort();
        return out;
    };

    Elevator.prototype.tick = function (dt) {
        this.logic.tick(dt);
        this.car.position.y = this.logic.position;
        var open = this.doorOpenAmount();
        this.leftDoor.position.x = -(DOOR_W / 2 - 0.01) - open * DOOR_TRAVEL;
        this.rightDoor.position.x = (DOOR_W / 2 - 0.01) + open * DOOR_TRAVEL;
        this.updateDisplays();
    };

    Elevator.prototype.updateDisplays = function () {
        var lg = this.logic;
        var up = this.getUpCalls();
        var down = this.getDownCalls();
        var dest = this.getDestinations();
        var sig = [lg.currentFloor, lg.direction, lg.state, up.join(","), down.join(","), dest.join(",")]
            .join("|");
        if (sig === this.displaySig) return;
        this.displaySig = sig;

        var self = this;
        this.world.floors.forEach(function (fl) {
            var ud = fl.callPanel.userData;
            ud.setUp(lg.upCalls.has(fl.floorNumber));
            ud.setDown(lg.downCalls.has(fl.floorNumber));
            ud.setIndicator(String(lg.currentFloor));
            var tail = lg.direction > 0 ? "u" : (lg.direction < 0 ? "d" : ".");
            fl.shaftIndicator.userData.setIndicator(String(lg.currentFloor) + tail);
        });

        var f;
        for (f = 0; f < this.destButtons.length; f++) {
            var on = lg.destinations.has(f);
            this.destButtons[f].material = on
                ? this.destButtons[f].userData.onMat
                : this.destButtons[f].userData.offMat;
        }

        var doorOpen = (lg.state === "DOOR_OPEN" || lg.state === "DOOR_OPENING");
        drawFloorNumber(this.indicator.ctx, lg.currentFloor, doorOpen, lg.direction);
        this.indicator.tex.needsUpdate = true;
    };

    // ---- delegation to the pure logic core ----
    Elevator.prototype.callUp = function (f) { this.logic.callUp(f); };
    Elevator.prototype.callDown = function (f) { this.logic.callDown(f); };
    Elevator.prototype.pressDestination = function (f) { this.logic.pressDestination(f); };
    Elevator.prototype.isAcceptingAt = function (f, d) { return this.logic.isAcceptingAt(f, d); };
    Elevator.prototype.currentCapacityFree = function () { return this.logic.currentCapacityFree(); };
    Elevator.prototype.reserveBoardingSpot = function (p) { return this.logic.reserveBoardingSpot(p); };
    Elevator.prototype.completeBoard = function (p) { this.logic.completeBoard(p); };
    Elevator.prototype.registerDisembark = function (p) { this.logic.registerDisembark(p); };
    Elevator.prototype.completeDisembark = function (p) { this.logic.completeDisembark(p); };
    Elevator.prototype.reset = function () {
        this.logic.reset();
        this.car.position.y = 0;
        this.displaySig = "";
        this.leftDoor.position.x = -(DOOR_W / 2 - 0.01);
        this.rightDoor.position.x = DOOR_W / 2 - 0.01;
        this.updateDisplays();
    };

    window.Elevator = Elevator;
})();
