/*  elevator.js  –  Three.js elevator car + doors + indicators + adapter  */

var Elevator = (function () {
    "use strict";

    var CAR_W = 2.6, CAR_D = 2.4, CAR_H = 2.8;
    var DOOR_GAP = 0.06;
    var SHAFT_W = 3, SHAFT_D = 3;
    var MOVE_SPEED = 3.4;   // must match elevator_logic

    // ---- glow materials for buttons ----
    var btnOffMat  = new THREE.MeshLambertMaterial({ color: 0x333333 });
    var btnOnMat   = new THREE.MeshLambertMaterial({ color: 0x44ff44, emissive: 0x22aa22 });

    function createTextTexture(w, h, fgColor, bgColor, fontSize) {
        var canvas = document.createElement("canvas");
        canvas.width  = w;
        canvas.height = h;
        var tex = new THREE.CanvasTexture(canvas);
        tex.minFilter  = THREE.LinearFilter;
        tex.magFilter  = THREE.LinearFilter;
        tex.generateMipmaps = true;
        tex._lastText = "";
        tex._canvas   = canvas;
        tex._ctx      = canvas.getContext("2d");
        tex._fg       = fgColor || "#ffbb22";
        tex._bg       = bgColor || "#050505";
        tex._fontSize = fontSize || Math.floor(h * 0.82);
        return tex;
    }

    function updateTextTexture(tex, text) {
        if (tex._lastText === text) return;
        tex._lastText = text;
        var c   = tex._canvas;
        var ctx = tex._ctx;
        ctx.fillStyle = tex._bg;
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.fillStyle   = tex._fg;
        ctx.font        = "bold " + tex._fontSize + "px monospace";
        ctx.textAlign   = "center";
        ctx.textBaseline = "middle";
        ctx.shadowColor = tex._fg;
        ctx.shadowBlur  = 8;
        ctx.fillText(text, c.width / 2, c.height / 2);
        ctx.shadowBlur  = 0;
        tex.needsUpdate = true;
    }

    function ElevatorAdapter(scene, world) {
        this.logic = new ElevatorLogic({
            floorCount:  WORLD.FLOOR_COUNT,
            maxCapacity: 4,
            floorHeight: WORLD.FLOOR_HEIGHT
        });

        this.world = world;
        this.scene = scene;

        // Car group
        this.carGroup = new THREE.Group();
        this.carGroup.renderOrder = 1;
        scene.add(this.carGroup);

        var frameMat = new THREE.MeshLambertMaterial({
            color: 0xccaa00, transparent: true, opacity: 0.5,
            depthWrite: false, side: THREE.DoubleSide
        });
        var floorMat = new THREE.MeshLambertMaterial({
            color: 0xbb9900, transparent: true, opacity: 0.5,
            depthWrite: false
        });
        var doorMat = new THREE.MeshLambertMaterial({
            color: 0xddbb22, transparent: true, opacity: 0.7,
            depthWrite: false, side: THREE.DoubleSide
        });
        var backMat = new THREE.MeshLambertMaterial({
            color: 0xccaa00
        });

        // Floor
        var carFloor = new THREE.Mesh(
            new THREE.BoxGeometry(CAR_W, 0.1, CAR_D),
            floorMat
        );
        carFloor.position.y = 0.05;
        carFloor.renderOrder = 1;
        this.carGroup.add(carFloor);

        // Ceiling
        var carCeil = new THREE.Mesh(
            new THREE.BoxGeometry(CAR_W, 0.08, CAR_D),
            frameMat
        );
        carCeil.position.y = CAR_H;
        carCeil.renderOrder = 1;
        this.carGroup.add(carCeil);

        // Side walls
        var sideL = new THREE.Mesh(
            new THREE.BoxGeometry(0.06, CAR_H, CAR_D),
            frameMat
        );
        sideL.position.set(-CAR_W / 2, CAR_H / 2, 0);
        sideL.renderOrder = 1;
        this.carGroup.add(sideL);

        var sideR = sideL.clone();
        sideR.position.x = CAR_W / 2;
        this.carGroup.add(sideR);

        // Back wall (opaque)
        var backW = new THREE.Mesh(
            new THREE.BoxGeometry(CAR_W, CAR_H, 0.06),
            backMat
        );
        backW.position.set(0, CAR_H / 2, -CAR_D / 2);
        backW.renderOrder = 1;
        this.carGroup.add(backW);

        // Sliding doors
        var doorH = CAR_H - 0.1;
        var doorW = CAR_W / 2 - DOOR_GAP;
        this.doorL = new THREE.Mesh(
            new THREE.BoxGeometry(doorW, doorH, 0.06),
            doorMat
        );
        this.doorL.position.set(-doorW / 2, doorH / 2 + 0.05, CAR_D / 2);
        this.doorL.renderOrder = 1;
        this.carGroup.add(this.doorL);

        this.doorR = this.doorL.clone();
        this.doorR.position.x = doorW / 2;
        this.carGroup.add(this.doorR);

        this.doorOpenOffset = doorW;  // how far each door slides

        // Destination panel (back-right wall)
        var panelGroup = new THREE.Group();
        panelGroup.position.set(CAR_W / 2 - 0.35, CAR_H * 0.6, -CAR_D / 2 + 0.06);
        this.carGroup.add(panelGroup);

        var panelPlate = new THREE.Mesh(
            new THREE.BoxGeometry(0.5, 1.2, 0.04),
            new THREE.MeshLambertMaterial({ color: 0x222222 })
        );
        panelPlate.renderOrder = 1;
        panelGroup.add(panelPlate);

        this.destButtons = [];
        for (var i = 0; i < WORLD.FLOOR_COUNT; i++) {
            var btn = new THREE.Mesh(
                new THREE.CylinderGeometry(0.06, 0.06, 0.04, 8),
                btnOffMat
            );
            btn.rotation.x = Math.PI / 2;
            btn.position.set(0, 0.45 - i * 0.17, 0.03);
            btn.renderOrder = 1;
            panelGroup.add(btn);
            this.destButtons.push(btn);
        }

        // In-car floor indicator (above doors, inside)
        this.carIndicatorTex = createTextTexture(256, 256, "#ffbb22", "#050505");
        var carIndMat = new THREE.MeshBasicMaterial({
            map: this.carIndicatorTex, transparent: true, depthWrite: false
        });
        var carInd = new THREE.Mesh(
            new THREE.PlaneGeometry(0.6, 0.6),
            carIndMat
        );
        carInd.position.set(0, CAR_H - 0.35, CAR_D / 2 - 0.05);
        carInd.rotation.y = Math.PI;
        carInd.renderOrder = 1;
        this.carGroup.add(carInd);

        // Spot local positions (for 4 boarders)
        this.spotPositions = [
            { x: -0.5, y: 0, z: 0.3 },
            { x:  0.5, y: 0, z: 0.3 },
            { x: -0.5, y: 0, z: -0.3 },
            { x:  0.5, y: 0, z: -0.3 }
        ];

        this._syncPosition();
    }

    ElevatorAdapter.prototype._syncPosition = function () {
        this.carGroup.position.y = this.logic.currentFloor * WORLD.FLOOR_HEIGHT;
    };

    // ---- delegate to logic ----

    ElevatorAdapter.prototype.callUp   = function (f) { this.logic.callUp(f); };
    ElevatorAdapter.prototype.callDown = function (f) { this.logic.callDown(f); };
    ElevatorAdapter.prototype.pressDestination = function (f) { this.logic.pressDestination(f); };
    ElevatorAdapter.prototype.isAcceptingAt = function (f, d) { return this.logic.isAcceptingAt(f, d); };
    ElevatorAdapter.prototype.currentCapacityFree = function () { return this.logic.currentCapacityFree(); };
    ElevatorAdapter.prototype.reserveBoardingSpot = function (pid) { return this.logic.reserveBoardingSpot(pid); };
    ElevatorAdapter.prototype.completeBoard = function (pid, df) { this.logic.completeBoard(pid, df); };
    ElevatorAdapter.prototype.registerDisembark = function (pid) { this.logic.registerDisembark(pid); };
    ElevatorAdapter.prototype.completeDisembark = function (pid) { this.logic.completeDisembark(pid); };
    ElevatorAdapter.prototype.reset = function () { this.logic.reset(); this._syncPosition(); };

    Object.defineProperty(ElevatorAdapter.prototype, "state",        { get: function () { return this.logic.state; } });
    Object.defineProperty(ElevatorAdapter.prototype, "direction",    { get: function () { return this.logic.direction; } });
    Object.defineProperty(ElevatorAdapter.prototype, "currentFloor", { get: function () { return this.logic.currentFloor; } });
    Object.defineProperty(ElevatorAdapter.prototype, "targetFloor",  { get: function () { return this.logic.targetFloor; } });
    Object.defineProperty(ElevatorAdapter.prototype, "passengers",   { get: function () { return this.logic.passengers; } });
    Object.defineProperty(ElevatorAdapter.prototype, "pendingBoarders",  { get: function () { return this.logic.pendingBoarders; } });
    Object.defineProperty(ElevatorAdapter.prototype, "pendingDisembark", { get: function () { return this.logic.pendingDisembark; } });
    Object.defineProperty(ElevatorAdapter.prototype, "upCalls",      { get: function () { return this.logic.upCalls; } });
    Object.defineProperty(ElevatorAdapter.prototype, "downCalls",    { get: function () { return this.logic.downCalls; } });
    Object.defineProperty(ElevatorAdapter.prototype, "destinations", { get: function () { return this.logic.destinations; } });

    ElevatorAdapter.prototype.getSpotWorldPosition = function (spotIndex) {
        var sp = this.spotPositions[spotIndex];
        return new THREE.Vector3(
            this.carGroup.position.x + sp.x,
            this.carGroup.position.y + sp.y,
            this.carGroup.position.z + sp.z
        );
    };

    ElevatorAdapter.prototype.getDoorThresholdWorld = function () {
        return new THREE.Vector3(
            this.carGroup.position.x,
            this.carGroup.position.y,
            this.carGroup.position.z + CAR_D / 2 + 0.3
        );
    };

    ElevatorAdapter.prototype.tick = function (dt) {
        this.logic.tick(dt);
        this._syncPosition();

        // Animate doors
        var frac = this.logic.doorFraction;
        this.doorL.position.x = -this.doorOpenOffset / 2 - frac * this.doorOpenOffset / 2;
        this.doorR.position.x =  this.doorOpenOffset / 2 + frac * this.doorOpenOffset / 2;

        // Update destination button glow
        var dests = this.logic.destinations;
        for (var i = 0; i < this.destButtons.length; i++) {
            this.destButtons[i].material = dests[i] ? btnOnMat : btnOffMat;
        }

        // Floor indicator text
        var fNum = Math.round(this.logic.currentFloor);
        var dirS = this.logic.direction === 1 ? "^" : (this.logic.direction === -1 ? "v" : "");
        updateTextTexture(this.carIndicatorTex, "" + fNum + dirS);

        // Update world shaft indicators & call panels
        this._updateWorldIndicators(fNum, dirS);
    };

    ElevatorAdapter.prototype._updateWorldIndicators = function (fNum, dirS) {
        var world = this.world;
        if (!world || !world.floors) return;
        for (var i = 0; i < world.floors.length; i++) {
            var fl = world.floors[i];
            if (fl.shaftIndicator && fl.shaftIndicator.userData.setIndicator) {
                fl.shaftIndicator.userData.setIndicator("" + fNum + dirS);
            }
            if (fl.callPanel && fl.callPanel.userData) {
                var upOn   = !!this.logic.upCalls[fl.floorNumber];
                var downOn = !!this.logic.downCalls[fl.floorNumber];
                if (fl.callPanel.userData.setUp)   fl.callPanel.userData.setUp(upOn);
                if (fl.callPanel.userData.setDown) fl.callPanel.userData.setDown(downOn);
            }
        }
    };

    return Elevator;
})();
