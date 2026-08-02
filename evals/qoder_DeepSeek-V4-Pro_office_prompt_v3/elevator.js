// elevator.js - Three.js elevator car + adapter around ElevatorLogic
// Uses THREE global. No ES modules.

function Elevator(scene, world) {
    var self = this;
    this.scene = scene;
    this.world = world;
    this.logic = new ElevatorLogic({ floorCount: world.FLOOR_COUNT, maxCapacity: 4, floorHeight: world.FLOOR_HEIGHT });

    // Car group (moves up/down)
    this.carGroup = new THREE.Group();
    this.carGroup.renderOrder = 1;
    scene.add(this.carGroup);

    // Car dimensions
    var cw = world.SHAFT_WIDTH - 0.2;
    var cd = world.SHAFT_DEPTH - 0.2;
    var ch = 2.6;
    var halfW = cw / 2;
    var halfD = cd / 2;

    var frameMat = new THREE.MeshLambertMaterial({ color: 0xddcc44, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide });

    // Floor
    var floorGeo = new THREE.PlaneGeometry(cw, cd);
    var floorMesh = new THREE.Mesh(floorGeo, frameMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.y = -ch / 2;
    floorMesh.renderOrder = 1;
    this.carGroup.add(floorMesh);

    // Ceiling
    var ceilMesh = new THREE.Mesh(floorGeo, frameMat);
    ceilMesh.rotation.x = -Math.PI / 2;
    ceilMesh.position.y = ch / 2;
    ceilMesh.renderOrder = 1;
    this.carGroup.add(ceilMesh);

    // Left wall
    var sideGeo = new THREE.PlaneGeometry(cd, ch);
    var leftWall = new THREE.Mesh(sideGeo, frameMat);
    leftWall.position.set(-halfW, 0, 0);
    leftWall.rotation.y = Math.PI / 2;
    leftWall.renderOrder = 1;
    this.carGroup.add(leftWall);

    // Right wall
    var rightWall = new THREE.Mesh(sideGeo, frameMat);
    rightWall.position.set(halfW, 0, 0);
    rightWall.rotation.y = -Math.PI / 2;
    rightWall.renderOrder = 1;
    this.carGroup.add(rightWall);

    // Back wall (opaque yellow)
    var backMat = new THREE.MeshLambertMaterial({ color: 0xddcc44, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide });
    var backGeo = new THREE.PlaneGeometry(cw, ch);
    var backWall = new THREE.Mesh(backGeo, backMat);
    backWall.position.set(0, 0, -halfD);
    backWall.renderOrder = 1;
    this.carGroup.add(backWall);

    // Sliding doors (on +Z face)
    var doorMat = new THREE.MeshLambertMaterial({ color: 0xeedd55, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide });
    var doorGeo = new THREE.PlaneGeometry(halfW, ch * 0.9);

    this.doorLeft = new THREE.Mesh(doorGeo, doorMat);
    this.doorLeft.position.set(0, 0, halfD);
    this.doorLeft.renderOrder = 1;
    this.carGroup.add(this.doorLeft);

    this.doorRight = new THREE.Mesh(doorGeo, doorMat);
    this.doorRight.position.set(0, 0, halfD);
    this.doorRight.renderOrder = 1;
    this.carGroup.add(this.doorRight);

    // Destination panel (back wall, right side)
    this.destButtons = [];
    var buttonGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.04, 8);
    var buttonOffMat = new THREE.MeshLambertMaterial({ color: 0x444444 });
    var buttonOnMat = new THREE.MeshLambertMaterial({ color: 0x44ff44, emissive: 0x228822 });

    for (var i = 0; i < world.FLOOR_COUNT; i++) {
        var btn = new THREE.Mesh(buttonGeo, buttonOffMat);
        btn.position.set(halfW - 0.3, -ch / 2 + 0.5 + i * 0.35, -halfD + 0.06);
        btn.rotation.x = Math.PI / 2;
        btn.renderOrder = 1;
        btn.userData = { floor: i, offMat: buttonOffMat, onMat: buttonOnMat };
        this.carGroup.add(btn);
        this.destButtons.push(btn);
    }

    // In-car floor indicator (above doors, facing back at passengers)
    this._indicatorCanvas = document.createElement('canvas');
    this._indicatorCanvas.width = 256;
    this._indicatorCanvas.height = 256;
    this._indicatorTex = new THREE.CanvasTexture(this._indicatorCanvas);
    this._indicatorTex.minFilter = THREE.LinearFilter;
    this._indicatorTex.magFilter = THREE.LinearFilter;
    this._indicatorTex._lastText = '';

    var indicatorGeo = new THREE.PlaneGeometry(0.6, 0.6);
    var indicatorMat = new THREE.MeshBasicMaterial({ map: this._indicatorTex, transparent: true });
    var indicator = new THREE.Mesh(indicatorGeo, indicatorMat);
    indicator.position.set(0, ch / 2 - 0.4, halfD - 0.05);
    indicator.renderOrder = 1;
    this.carGroup.add(indicator);
    this._inCarIndicator = indicator;

    // Position car at floor 0
    this.carGroup.position.set(0, world.FLOOR_HEIGHT / 2, 0);
    this._updateDoors(false);

    // Expose logic properties
    this.state = this.logic.state;
    this.direction = this.logic.direction;
    this.currentFloor = this.logic.currentFloor;
    this.targetFloor = this.logic.targetFloor;
    this.upCalls = this.logic.upCalls;
    this.downCalls = this.logic.downCalls;
    this.destinations = this.logic.destinations;
    this.passengers = this.logic.passengers;
    this.pendingBoarders = this.logic.pendingBoarders;
    this.pendingDisembark = this.logic.pendingDisembark;
}

Elevator.prototype.callUp = function(floor) { this.logic.callUp(floor); };
Elevator.prototype.callDown = function(floor) { this.logic.callDown(floor); };
Elevator.prototype.pressDestination = function(floor) { this.logic.pressDestination(floor); };
Elevator.prototype.isAcceptingAt = function(floor, direction) { return this.logic.isAcceptingAt(floor, direction); };
Elevator.prototype.currentCapacityFree = function() { return this.logic.currentCapacityFree(); };
Elevator.prototype.reserveBoardingSpot = function(person) { return this.logic.reserveBoardingSpot(person); };
Elevator.prototype.completeBoard = function(person) { this.logic.completeBoard(person); };
Elevator.prototype.registerDisembark = function(person) { this.logic.registerDisembark(person); };
Elevator.prototype.completeDisembark = function(person) { this.logic.completeDisembark(person); };
Elevator.prototype.reset = function() { this.logic.reset(); };

Elevator.prototype._updateDoors = function(open) {
    var gap = open ? 1.2 : 0.05;
    this.doorLeft.position.x = -gap;
    this.doorRight.position.x = gap;
};

Elevator.prototype._updateIndicator = function(text) {
    if (this._indicatorTex._lastText === text) return;
    this._indicatorTex._lastText = text;

    var ctx = this._indicatorCanvas.getContext('2d');
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, 256, 256);

    ctx.font = 'bold 140px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = '#ffbb22';
    ctx.shadowBlur = 18;
    ctx.fillStyle = '#ffbb22';
    ctx.fillText(text, 128, 128);

    this._indicatorTex.needsUpdate = true;
};

Elevator.prototype.tick = function(dt) {
    var self = this;
    self.logic.tick(dt);

    // Sync state properties
    self.state = self.logic.state;
    self.direction = self.logic.direction;
    self.currentFloor = self.logic.currentFloor;
    self.targetFloor = self.logic.targetFloor;

    // Update car position
    var targetY = self.logic.currentFloor * self.world.FLOOR_HEIGHT + self.world.FLOOR_HEIGHT / 2;
    if (self.logic.state === 'MOVING') {
        targetY += self.logic.direction * self.logic._moveProgress;
    }
    self.carGroup.position.y = targetY;

    // Update doors
    if (self.logic.state === 'DOOR_OPEN' || self.logic.state === 'DOOR_OPENING') {
        var openAmount = self.logic.state === 'DOOR_OPENING' ? self.logic._doorTimer / 0.8 : 1.0;
        self._updateDoors(openAmount > 0.5);
    } else if (self.logic.state === 'DOOR_CLOSING') {
        var closeAmount = 1.0 - self.logic._doorTimer / 1.2;
        self._updateDoors(closeAmount > 0.5);
    } else {
        self._updateDoors(false);
    }

    // Update dest buttons
    for (var i = 0; i < self.destButtons.length; i++) {
        var btn = self.destButtons[i];
        if (self.logic.destinations.has(btn.userData.floor)) {
            btn.material = btn.userData.onMat;
        } else {
            btn.material = btn.userData.offMat;
        }
    }

    // Update in-car indicator
    var dirStr = '';
    if (self.logic.state === 'MOVING') {
        dirStr = self.logic.direction > 0 ? '^' : 'v';
    }
    self._updateIndicator(String(Math.round(self.logic.currentFloor)) + dirStr);

    // Update call panel lamps on each floor
    self._updateCallPanels();

    // Update shaft indicators
    self._updateShaftIndicators();
};

Elevator.prototype._updateCallPanels = function() {
    var floors = this.world.floors;
    if (!floors) return;
    for (var i = 0; i < floors.length; i++) {
        var panel = floors[i].callPanel;
        if (!panel || !panel.userData) continue;
        var fn = floors[i].floorNumber;
        if (panel.userData.setUp) panel.userData.setUp(this.logic.upCalls.has(fn));
        if (panel.userData.setDown) panel.userData.setDown(this.logic.downCalls.has(fn));
        var indText = String(Math.round(this.logic.currentFloor));
        if (this.logic.state === 'MOVING') {
            indText += this.logic.direction > 0 ? '^' : 'v';
        }
        if (panel.userData.setIndicator) panel.userData.setIndicator(indText);
    }
};

Elevator.prototype._updateShaftIndicators = function() {
    var floors = this.world.floors;
    if (!floors) return;
    var indText = String(Math.round(this.logic.currentFloor));
    if (this.logic.state === 'MOVING') {
        indText += this.logic.direction > 0 ? '^' : 'v';
    }
    for (var i = 0; i < floors.length; i++) {
        var si = floors[i].shaftIndicator;
        if (si && si.userData && si.userData.setText) {
            si.userData.setText(indText);
        }
    }
};

window.Elevator = Elevator;
