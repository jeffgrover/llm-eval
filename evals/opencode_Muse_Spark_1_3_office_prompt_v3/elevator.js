function Elevator(scene, world) {
    this.scene = scene;
    this.world = world;
    this.logic = new window.ElevatorLogic({ floorCount: 6, maxCapacity: 4, floorHeight: 3.4 });
    var FH = window.WORLD.FLOOR_HEIGHT;
    this.carGroup = new THREE.Group();
    scene.add(this.carGroup);
    var frameMat = new THREE.MeshLambertMaterial({
        color: 0xddbb22, transparent: true, opacity: 0.5,
        depthWrite: false, side: THREE.DoubleSide
    });
    var doorMat = new THREE.MeshLambertMaterial({
        color: 0xccaa33, transparent: true, opacity: 0.7,
        depthWrite: false, side: THREE.DoubleSide
    });
    var backMat = new THREE.MeshLambertMaterial({ color: 0xccaa22 });
    var CW = 2.6;
    var CH = 2.6;
    function elevBox(w, h, d, x, y, z, m) {
        var mm = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
        mm.position.set(x, y, z);
        mm.renderOrder = 1;
        this.carGroup.add(mm);
        return mm;
    }
    elevBox.call(this, CW, 0.12, CW, 0, 0.06, 0, frameMat);
    elevBox.call(this, CW, 0.12, CW, 0, CH, 0, frameMat);
    elevBox.call(this, 0.1, CH, CW, -CW / 2, CH / 2, 0, frameMat);
    elevBox.call(this, 0.1, CH, CW, CW / 2, CH / 2, 0, frameMat);
    elevBox.call(this, CW, CH, 0.1, 0, CH / 2, -CW / 2, backMat);
    this.doorL = new THREE.Mesh(new THREE.BoxGeometry(CW / 2, 2.2, 0.08), doorMat);
    this.doorL.position.set(-CW / 4, 1.15, CW / 2);
    this.doorL.renderOrder = 1;
    this.carGroup.add(this.doorL);
    this.doorR = new THREE.Mesh(new THREE.BoxGeometry(CW / 2, 2.2, 0.08), doorMat);
    this.doorR.position.set(CW / 4, 1.15, CW / 2);
    this.doorR.renderOrder = 1;
    this.carGroup.add(this.doorR);
    this.carW = CW;
    this.destButtons = [];
    this.destButtonMats = [];
    for (var bi = 0; bi < 6; bi++) {
        var bmat = new THREE.MeshBasicMaterial({ color: 0x332200 });
        var btn = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 10), bmat);
        btn.rotation.x = Math.PI / 2;
        btn.position.set(0.9, 1.9 - bi * 0.18, -CW / 2 + 0.12);
        btn.renderOrder = 1;
        this.carGroup.add(btn);
        this.destButtons.push(btn);
        this.destButtonMats.push(bmat);
    }
    var inTexCanvas = document.createElement("canvas");
    inTexCanvas.width = 256;
    inTexCanvas.height = 256;
    this.inCanvas = inTexCanvas;
    this.inCtx = inTexCanvas.getContext("2d");
    this.inTex = new THREE.CanvasTexture(inTexCanvas);
    this.inTex.magFilter = THREE.LinearFilter;
    this.inTex._lastText = null;
    var inInd = new THREE.Mesh(
        new THREE.PlaneGeometry(0.6, 0.6),
        new THREE.MeshBasicMaterial({ map: this.inTex, side: THREE.DoubleSide })
    );
    inInd.position.set(0, 2.35, -CW / 2 + 0.12);
    inInd.rotation.y = 0;
    inInd.renderOrder = 1;
    this.carGroup.add(inInd);
    this.carGroup.position.set(0, 0, 0);
    this.syncMirrors();
}

Elevator.prototype.syncMirrors = function() {
    var L = this.logic;
    this.state = L.state;
    this.direction = L.direction;
    this.currentFloor = L.currentFloor;
    this.targetFloor = L.targetFloor;
    this.carPos = L.carPos;
    this.upCalls = L.upCalls;
    this.downCalls = L.downCalls;
    this.destinations = L.destinations;
    this.passengers = L.passengers;
    this.pendingBoarders = L.pendingBoarders;
    this.pendingDisembark = L.pendingDisembark;
};

Elevator.prototype.callUp = function(floor) { this.logic.callUp(floor); this.syncMirrors(); };
Elevator.prototype.callDown = function(floor) { this.logic.callDown(floor); this.syncMirrors(); };
Elevator.prototype.pressDestination = function(floor) { this.logic.pressDestination(floor); this.syncMirrors(); };
Elevator.prototype.isAcceptingAt = function(floor, dir) { return this.logic.isAcceptingAt(floor, dir); };
Elevator.prototype.currentCapacityFree = function() { return this.logic.currentCapacityFree(); };
Elevator.prototype.reserveBoardingSpot = function(person) {
    var s = this.logic.reserveBoardingSpot(person);
    this.syncMirrors();
    return s;
};
Elevator.prototype.completeBoard = function(person) { this.logic.completeBoard(person); this.syncMirrors(); };
Elevator.prototype.registerDisembark = function(person) { this.logic.registerDisembark(person); this.syncMirrors(); };
Elevator.prototype.completeDisembark = function(person) { this.logic.completeDisembark(person); this.syncMirrors(); };
Elevator.prototype.reset = function() { this.logic.reset(); this.syncMirrors(); };

Elevator.prototype.spotToWorld = function(spot) {
    var v = new THREE.Vector3(spot.x, 0, spot.z);
    this.carGroup.updateMatrixWorld(true);
    return this.carGroup.localToWorld(v);
};

Elevator.prototype.updateInIndicator = function(text) {
    if (this.inTex._lastText === text) { return; }
    this.inTex._lastText = text;
    var ctx = this.inCtx;
    ctx.fillStyle = "#050505";
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = "#ffbb22";
    ctx.shadowColor = "#ffbb22";
    ctx.shadowBlur = 18;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold 150px monospace";
    ctx.fillText(text, 128, 134);
    this.inTex.needsUpdate = true;
};

Elevator.prototype.tick = function(dt) {
    this.logic.tick(dt);
    this.syncMirrors();
    var L = this.logic;
    var FH = window.WORLD.FLOOR_HEIGHT;
    this.carGroup.position.set(0, L.carPos * FH, 0);
    var openAmt = 0;
    if (L.state === "DOOR_OPEN") { openAmt = 1; }
    else if (L.state === "DOOR_OPENING") { openAmt = Math.min(1, L.doorTimer / L.DOOR_TRANSIT_S); }
    else if (L.state === "DOOR_CLOSING") { openAmt = Math.max(0, 1 - L.doorTimer / L.DOOR_TRANSIT_S); }
    var slide = openAmt * (this.carW / 2 - 0.06);
    this.doorL.position.x = -this.carW / 4 - slide;
    this.doorR.position.x = this.carW / 4 + slide;
    var dirSym = "";
    if (L.direction > 0) { dirSym = "^"; }
    else if (L.direction < 0) { dirSym = "v"; }
    var label = String(Math.round(L.carPos)) + dirSym;
    for (var fi = 0; fi < this.world.floors.length; fi++) {
        var fl = this.world.floors[fi];
        if (fl.callPanel && fl.callPanel.userData) {
            fl.callPanel.userData.setUp(L.upCalls.has(fi));
            fl.callPanel.userData.setDown(L.downCalls.has(fi));
            fl.callPanel.userData.setIndicator(String(Math.round(L.carPos)));
        }
        if (fl.shaftIndicator && fl.shaftIndicator.userData) {
            fl.shaftIndicator.userData.setIndicator(label);
        }
    }
    this.updateInIndicator(label);
    for (var db = 0; db < this.destButtonMats.length; db++) {
        if (L.destinations.has(db)) {
            this.destButtonMats[db].color.setHex(0xffcc33);
        } else {
            this.destButtonMats[db].color.setHex(0x332200);
        }
    }
};

window.Elevator = Elevator;
