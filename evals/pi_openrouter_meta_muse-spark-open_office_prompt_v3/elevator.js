function Elevator(scene, world) {
    this.scene = scene;
    this.world = world;
    this.logic = new ElevatorLogic({ floorCount: WORLD.FLOOR_COUNT, maxCapacity: 4, floorHeight: WORLD.FLOOR_HEIGHT });

    var carW = 2.6, carH = 2.4, carD = 2.6;
    this.carGroup = new THREE.Group();
    this.carGroup.renderOrder = 1;
    scene.add(this.carGroup);

    // Floor
    var floorMesh = new THREE.Mesh(new THREE.BoxGeometry(carW, 0.08, carD), new THREE.MeshLambertMaterial({ color: 0xccaa00 }));
    floorMesh.position.set(0, 0, 0); floorMesh.renderOrder = 1; this.carGroup.add(floorMesh);
    // Ceiling
    var ceilMesh = new THREE.Mesh(new THREE.BoxGeometry(carW, 0.08, carD), new THREE.MeshLambertMaterial({ color: 0xccaa00 }));
    ceilMesh.position.set(0, carH, 0); ceilMesh.renderOrder = 1; this.carGroup.add(ceilMesh);
    // Side walls
    var sideMat = new THREE.MeshLambertMaterial({ color: 0xddbb22, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide });
    var leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.08, carH, carD), sideMat);
    leftWall.position.set(-carW / 2, carH / 2, 0); leftWall.renderOrder = 1; this.carGroup.add(leftWall);
    var rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.08, carH, carD), sideMat);
    rightWall.position.set(carW / 2, carH / 2, 0); rightWall.renderOrder = 1; this.carGroup.add(rightWall);
    // Back wall opaque
    var backWall = new THREE.Mesh(new THREE.BoxGeometry(carW, carH, 0.08), new THREE.MeshLambertMaterial({ color: 0xccaa00 }));
    backWall.position.set(0, carH / 2, -carD / 2); backWall.renderOrder = 1; this.carGroup.add(backWall);

    // Doors
    var doorMat = new THREE.MeshLambertMaterial({ color: 0xddbb33, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide });
    this.doorL = new THREE.Mesh(new THREE.BoxGeometry(carW / 2, carH, 0.06), doorMat);
    this.doorL.position.set(-carW / 4, carH / 2, carD / 2); this.doorL.renderOrder = 1; this.carGroup.add(this.doorL);
    this.doorR = new THREE.Mesh(new THREE.BoxGeometry(carW / 2, carH, 0.06), doorMat);
    this.doorR.position.set(carW / 4, carH / 2, carD / 2); this.doorR.renderOrder = 1; this.carGroup.add(this.doorR);
    this.carW = carW; this.carH = carH; this.carD = carD;

    // Destination panel
    this.destButtons = [];
    for (var fi2 = 0; fi2 < WORLD.FLOOR_COUNT; fi2++) {
        var btnGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.04, 12);
        var btnMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
        var btnOnMat = new THREE.MeshLambertMaterial({ color: 0x33ff33, emissive: 0x33ff33, emissiveIntensity: 0.8 });
        var btn = new THREE.Mesh(btnGeo, btnMat);
        btn.rotation.z = Math.PI / 2;
        btn.position.set(carW / 2 - 0.12, 0.4 + fi2 * 0.22, -carD / 2 + 0.15);
        btn.userData.matOff = btnMat; btn.userData.matOn = btnOnMat; btn.userData.floor = fi2;
        btn.renderOrder = 1; this.carGroup.add(btn);
        this.destButtons.push(btn);
    }

    // In-car indicator
    var carTex = this._makeIndicatorTex("0");
    var carIndGeo = new THREE.PlaneGeometry(0.6, 0.6);
    this.carIndicator = new THREE.Mesh(carIndGeo, new THREE.MeshBasicMaterial({ map: carTex }));
    this.carIndicator.position.set(0, carH - 0.3, -carD / 2 + 0.05);
    this.carIndicator.userData.tex = carTex;
    this.carGroup.add(this.carIndicator);

    this._updateDoors();
}

Elevator.prototype._makeIndicatorTex = function(text) {
    var canvas = document.createElement("canvas"); canvas.width = 256; canvas.height = 256;
    var ctx = canvas.getContext("2d");
    ctx.fillStyle = "#050505"; ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = "#ffbb22"; ctx.font = "bold 150px monospace"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.shadowColor = "#ffbb22"; ctx.shadowBlur = 18; ctx.fillText(text, 128, 128);
    var tex = new THREE.CanvasTexture(canvas); tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = true;
    tex._canvas = canvas; tex._ctx = ctx; tex._lastText = text; return tex;
};

Elevator.prototype._updateIndicatorTex = function(tex, text) {
    if (tex._lastText === text) return;
    tex._lastText = text;
    var ctx = tex._ctx; ctx.fillStyle = "#050505"; ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = "#ffbb22"; ctx.font = "bold 150px monospace"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.shadowColor = "#ffbb22"; ctx.shadowBlur = 18; ctx.fillText(text, 128, 128);
    tex.needsUpdate = true;
};

Elevator.prototype._updateDoors = function() {
    var p = this.logic.doorProgress;
    var half = this.carW / 2;
    this.doorL.position.x = -half / 2 - p * (half / 2);
    this.doorR.position.x = half / 2 + p * (half / 2);
};

Elevator.prototype.tick = function(dt) {
    this.logic.tick(dt);
    this.carGroup.position.y = this.logic.positionY;
    this._updateDoors();
    // Update destination buttons
    for (var i = 0; i < this.destButtons.length; i++) {
        var btn = this.destButtons[i];
        btn.material = this.logic.destinations.has(btn.userData.floor) ? btn.userData.matOn : btn.userData.matOff;
    }
    // Update call panels
    for (var fi3 = 0; fi3 < this.world.floors.length; fi3++) {
        var fl = this.world.floors[fi3];
        if (fl.callPanel) {
            fl.callPanel.userData.setUp(this.logic.upCalls.has(fi3));
            fl.callPanel.userData.setDown(this.logic.downCalls.has(fi3));
        }
        if (fl.shaftIndicator) {
            var dirChar = this.logic.direction > 0 ? "^" : (this.logic.direction < 0 ? "v" : "-");
            fl.shaftIndicator.userData.setText(String(this.logic.currentFloor) + dirChar);
        }
    }
    this._updateIndicatorTex(this.carIndicator.userData.tex, String(this.logic.currentFloor));
};

// Delegate to logic
Elevator.prototype.callUp = function(f) { this.logic.callUp(f); };
Elevator.prototype.callDown = function(f) { this.logic.callDown(f); };
Elevator.prototype.pressDestination = function(f) { this.logic.pressDestination(f); };
Elevator.prototype.isAcceptingAt = function(f, d) { return this.logic.isAcceptingAt(f, d); };
Elevator.prototype.currentCapacityFree = function() { return this.logic.currentCapacityFree(); };
Elevator.prototype.reserveBoardingSpot = function(p) {
    var r = this.logic.reserveBoardingSpot(p);
    if (r) { p._elevSpot = r.index; }
    return r;
};
Elevator.prototype.completeBoard = function(p) { this.logic.completeBoard(p); };
Elevator.prototype.registerDisembark = function(p) { this.logic.registerDisembark(p); };
Elevator.prototype.completeDisembark = function(p) { this.logic.completeDisembark(p); };
Elevator.prototype.reset = function() { this.logic.reset(); this.carGroup.position.y = 0; this._updateDoors(); };

// Expose logic state via getters
Object.defineProperties(Elevator.prototype, {
    state: { get: function() { return this.logic.state; } },
    direction: { get: function() { return this.logic.direction; } },
    currentFloor: { get: function() { return this.logic.currentFloor; } },
    targetFloor: { get: function() { return this.logic.targetFloor; } },
    upCalls: { get: function() { return this.logic.upCalls; } },
    downCalls: { get: function() { return this.logic.downCalls; } },
    destinations: { get: function() { return this.logic.destinations; } },
    passengers: { get: function() { return this.logic.passengers; } },
    pendingBoarders: { get: function() { return this.logic.pendingBoarders; } },
    pendingDisembark: { get: function() { return this.logic.pendingDisembark; } }
});

window.Elevator = Elevator;
