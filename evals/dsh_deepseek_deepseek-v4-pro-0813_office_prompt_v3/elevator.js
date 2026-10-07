/* elevator.js — Three.js car + adapter around ElevatorLogic.
 * No ES modules. Exposes window.Elevator.
 */
(function () {
    "use strict";

    const FH = (typeof WORLD !== "undefined" && WORLD.FLOOR_HEIGHT) ? WORLD.FLOOR_HEIGHT : 3.4;

    function canvasTextureHolder() {
        const canvas = document.createElement("canvas");
        canvas.width = 256;
        canvas.height = 256;
        const tex = new THREE.CanvasTexture(canvas);
        tex.magFilter = THREE.LinearFilter;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex._lastText = null;
        return { canvas: canvas, texture: tex };
    }

    function updateIndicator(holder, text) {
        if (holder.texture._lastText === text) return;
        holder.texture._lastText = text;
        const c = holder.canvas;
        const ctx = c.getContext("2d");
        ctx.fillStyle = "#050505";
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.font = "bold 180px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.shadowColor = "#ffbb22";
        ctx.shadowBlur = 16;
        ctx.fillStyle = "#ffbb22";
        ctx.fillText(text, c.width / 2, c.height / 2);
        holder.texture.needsUpdate = true;
    }

    function Elevator(scene, world) {
        this.scene = scene;
        this.world = world;
        this.logic = new ElevatorLogic({
            floorCount: WORLD.FLOOR_COUNT,
            maxCapacity: 4,
            floorHeight: WORLD.FLOOR_HEIGHT
        });

        this.carWidth = WORLD.SHAFT_WIDTH - 0.3;   // 2.7
        this.carDepth = WORLD.SHAFT_DEPTH - 0.3;   // 2.7
        this.carHeight = WORLD.FLOOR_HEIGHT - 0.3; // 3.1

        this.group = new THREE.Group();
        this.group.renderOrder = 1;

        // ---- frame ----
        const frameMat = new THREE.MeshLambertMaterial({
            color: 0xffff55, opacity: 0.5, transparent: true, depthWrite: false, side: THREE.DoubleSide
        });
        const backMat = new THREE.MeshLambertMaterial({ color: 0xffff55, opacity: 1.0, transparent: false });

        const cw = this.carWidth, cd = this.carDepth, ch = this.carHeight;

        // floor
        const floorMesh = new THREE.Mesh(new THREE.BoxGeometry(cw, 0.1, cd), frameMat);
        floorMesh.position.set(0, 0.05, 0);
        this.group.add(floorMesh);
        // ceiling
        const ceilingMesh = new THREE.Mesh(new THREE.BoxGeometry(cw, 0.1, cd), frameMat);
        ceilingMesh.position.set(0, ch - 0.05, 0);
        this.group.add(ceilingMesh);
        // back wall (solid yellow)
        const backWall = new THREE.Mesh(new THREE.BoxGeometry(cw, ch, 0.12), backMat);
        backWall.position.set(0, ch / 2, -cd / 2);
        this.group.add(backWall);
        // side walls
        const sideMat = frameMat;
        const sideL = new THREE.Mesh(new THREE.BoxGeometry(0.12, ch, cd), sideMat);
        sideL.position.set(-cw / 2, ch / 2, 0);
        this.group.add(sideL);
        const sideR = new THREE.Mesh(new THREE.BoxGeometry(0.12, ch, cd), sideMat);
        sideR.position.set(cw / 2, ch / 2, 0);
        this.group.add(sideR);

        // ---- sliding doors on +Z face ----
        const doorMat = new THREE.MeshLambertMaterial({
            color: 0xffff55, opacity: 0.7, transparent: true, depthWrite: false, side: THREE.DoubleSide
        });
        this.doorHalf = cw / 2 - 0.03;
        this.doorL = new THREE.Mesh(new THREE.BoxGeometry(cw / 2, ch - 0.2, 0.08), doorMat);
        this.doorL.position.set(-cw / 4, ch / 2, cd / 2);
        this.group.add(this.doorL);
        this.doorR = new THREE.Mesh(new THREE.BoxGeometry(cw / 2, ch - 0.2, 0.08), doorMat);
        this.doorR.position.set(cw / 4, ch / 2, cd / 2);
        this.group.add(this.doorR);
        // door frame posts
        const postGeo = new THREE.BoxGeometry(0.1, ch - 0.2, 0.1);
        const postL = new THREE.Mesh(postGeo, backMat);
        postL.position.set(-cw / 2, ch / 2, cd / 2);
        this.group.add(postL);
        const postR = new THREE.Mesh(postGeo, backMat);
        postR.position.set(cw / 2, ch / 2, cd / 2);
        this.group.add(postR);

        this.doorOffset = 0; // 0..1 (relative; 0 closed, 1 open)

        // ---- in-car floor indicator (above doors, looking back) ----
        this.inCarInd = canvasTextureHolder();
        const icMesh = new THREE.Mesh(
            new THREE.PlaneGeometry(0.6, 0.6),
            new THREE.MeshBasicMaterial({ map: this.inCarInd.texture, side: THREE.DoubleSide })
        );
        icMesh.position.set(0, ch - 0.35, cd / 2 - 0.5);
        icMesh.rotation.y = Math.PI; // faces -Z (toward passengers)
        this.group.add(icMesh);
        this.inCarMesh = icMesh;

        // ---- destination panel on back-right wall ----
        this.buttonMeshes = [];
        const nButtons = WORLD.FLOOR_COUNT;
        for (let f = 0; f < nButtons; f++) {
            const btn = new THREE.Mesh(
                new THREE.CylinderGeometry(0.09, 0.09, 0.06, 12),
                new THREE.MeshBasicMaterial({ color: 0x333333 })
            );
            btn.position.set(cw / 2 - 0.35, 0.3 + f * 0.42, -cd / 2 + 0.08);
            btn.rotation.x = Math.PI / 2;
            this.group.add(btn);
            this.buttonMeshes.push(btn);
        }

        scene.add(this.group);

        // position at floor 0
        this.group.position.y = 0;

        // store spot world-offset references
        this._spotLocal = [
            { x: -0.7, z: -0.4 },
            { x: 0.7, z: -0.4 },
            { x: -0.7, z: 0.5 },
            { x: 0.7, z: 0.5 }
        ];
    }

    // ---- mirror logic state ----
    Object.defineProperties(Elevator.prototype, {
        state: { get: function () { return this.logic.state; } },
        direction: { get: function () { return this.logic.direction; } },
        currentFloor: { get: function () { return this.logic.currentFloor; } },
        targetFloor: { get: function () { return this.logic.targetFloor; } },
        upCalls: { get: function () { return this.logic.upCalls; } },
        downCalls: { get: function () { return this.logic.downCalls; } },
        destinations: { get: function () { return this.logic.destinations; } },
        passengers: { get: function () { return this.logic.passengers; } },
        pendingBoarders: { get: function () { return this.logic.pendingBoarders; } },
        pendingDisembark: { get: function () { return this.logic.pendingDisembark; } }
    });

    Elevator.prototype.callUp = function (floor) { this.logic.callUp(floor); };
    Elevator.prototype.callDown = function (floor) { this.logic.callDown(floor); };
    Elevator.prototype.pressDestination = function (floor) { this.logic.pressDestination(floor); };
    Elevator.prototype.isAcceptingAt = function (floor, dir) { return this.logic.isAcceptingAt(floor, dir); };
    Elevator.prototype.currentCapacityFree = function () { return this.logic.currentCapacityFree(); };
    Elevator.prototype.reserveBoardingSpot = function (person) { return this.logic.reserveBoardingSpot(person); };
    Elevator.prototype.completeBoard = function (person) { this.logic.completeBoard(person); };
    Elevator.prototype.registerDisembark = function (person) { this.logic.registerDisembark(person); };
    Elevator.prototype.completeDisembark = function (person) { this.logic.completeDisembark(person); };
    Elevator.prototype.reset = function () {
        this.logic.reset();
        this.group.position.y = 0;
        this.doorOffset = 0;
        this._syncVisual();
    };

    Elevator.prototype.spotLocal = function (index) {
        return this._spotLocal[index] || this._spotLocal[0];
    };

    Elevator.prototype.tick = function (dt) {
        this.logic.tick(dt);
        this._syncVisual(dt);
    };

    Elevator.prototype._syncVisual = function (dt) {
        // car Y position from logic
        const targetY = this.logic.positionY;
        this.group.position.y = targetY;

        // doors
        const openAmount = this._doorOpenAmount();
        const half = this.carWidth / 2;
        // closed: meet at x=0 (each half spans half width centered at +/-cw/4).
        // open: each half slides outward by ~(half - small gap).
        const slideAmt = openAmount * (half - 0.15);
        this.doorL.position.x = -this.carWidth / 4 - slideAmt;
        this.doorR.position.x = this.carWidth / 4 + slideAmt;
        // keep doors within the shaft bounds (they slide outward into walls)
        this.doorL.position.x = Math.max(this.doorL.position.x, -this.carWidth);
        this.doorR.position.x = Math.min(this.doorR.position.x, this.carWidth);

        // in-car indicator text: "3^" / "3v" / "3"
        let dirChar = "";
        if (this.logic.direction > 0) dirChar = "^";
        else if (this.logic.direction < 0) dirChar = "v";
        const floorText = String(this.logic.currentFloor) + dirChar;
        updateIndicator(this.inCarInd, floorText);

        // destination buttons
        for (let f = 0; f < this.buttonMeshes.length; f++) {
            const lit = this.logic.destinations.has(f);
            this.buttonMeshes[f].material.color.setHex(lit ? 0xff8833 : 0x333333);
        }

        // update world call panels + shaft indicators for the current floor
        this._updateFloorPanels();
    };

    Elevator.prototype._doorOpenAmount = function () {
        if (this.logic.state === "DOOR_OPEN") return 1;
        if (this.logic.state === "DOOR_CLOSING") return 0;
        if (this.logic.state === "DOOR_OPENING") {
            const t = Math.min(1, this.logic.stateTimer / 1.2);
            return t;
        }
        return 0;
    };

    Elevator.prototype._updateFloorPanels = function () {
        const world = this.world;
        if (!world) return;
        for (let f = 0; f < world.floors.length; f++) {
            const fl = world.floors[f];
            if (!fl || !fl.callPanel) continue;
            const panel = fl.callPanel;
            const upOn = this.logic.upCalls.has(f);
            const downOn = this.logic.downCalls.has(f);
            panel.setUp(upOn);
            panel.setDown(downOn);
            panel.setIndicator(String(f));

            if (fl.shaftIndicator) {
                let dirChar = "";
                if (this.logic.currentFloor === f) {
                    if (this.logic.direction > 0) dirChar = "^";
                    else if (this.logic.direction < 0) dirChar = "v";
                }
                fl.shaftIndicator.set(String(f) + dirChar);
            }
        }
    };

    window.Elevator = Elevator;
})();
