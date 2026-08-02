function Elevator(scene, world) {
    this.logic = new ElevatorLogic({
        floorCount: WORLD.FLOOR_COUNT,
        maxCapacity: 4,
        floorHeight: WORLD.FLOOR_HEIGHT
    });

    this.carGroup = new THREE.Group();
    this.carGroup.renderOrder = 1;
    var cw = WORLD.SHAFT_WIDTH * 0.7;
    var cd = WORLD.SHAFT_DEPTH * 0.7;
    var ch = WORLD.FLOOR_HEIGHT * 0.8;

    // Floor
    var floorMat = new THREE.MeshLambertMaterial({ color: 0x444444, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide });
    var floor = new THREE.Mesh(new THREE.BoxGeometry(cw, 0.05, cd), floorMat);
    floor.position.y = 0;
    floor.renderOrder = 1;
    this.carGroup.add(floor);

    // Ceiling
    var ceilMat = new THREE.MeshLambertMaterial({ color: 0x444444, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide });
    var ceiling = new THREE.Mesh(new THREE.BoxGeometry(cw, 0.05, cd), ceilMat);
    ceiling.position.y = ch;
    ceiling.renderOrder = 1;
    this.carGroup.add(ceiling);

    // Side walls
    var wallMat = new THREE.MeshLambertMaterial({ color: 0xcccc44, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide });
    // Left wall
    var lw = new THREE.Mesh(new THREE.BoxGeometry(0.05, ch, cd), wallMat);
    lw.position.set(-cw / 2, ch / 2, 0);
    lw.renderOrder = 1;
    this.carGroup.add(lw);
    // Right wall
    var rw = new THREE.Mesh(new THREE.BoxGeometry(0.05, ch, cd), wallMat);
    rw.position.set(cw / 2, ch / 2, 0);
    rw.renderOrder = 1;
    this.carGroup.add(rw);

    // Back wall (opaque)
    var backMat = new THREE.MeshLambertMaterial({ color: 0xcccc44 });
    var bw = new THREE.Mesh(new THREE.BoxGeometry(cw, ch, 0.05), backMat);
    bw.position.set(0, ch / 2, -cd / 2);
    bw.renderOrder = 1;
    this.carGroup.add(bw);

    // Sliding doors (two halves)
    var doorMat = new THREE.MeshLambertMaterial({ color: 0xcccc44, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide });
    this.doorLeft = new THREE.Mesh(new THREE.BoxGeometry(cw / 2 - 0.05, ch, 0.05), doorMat);
    this.doorLeft.position.set(-cw / 4, ch / 2, cd / 2);
    this.doorLeft.renderOrder = 1;
    this.carGroup.add(this.doorLeft);

    this.doorRight = new THREE.Mesh(new THREE.BoxGeometry(cw / 2 - 0.05, ch, 0.05), doorMat);
    this.doorRight.position.set(cw / 4, ch / 2, cd / 2);
    this.doorRight.renderOrder = 1;
    this.carGroup.add(this.doorRight);

    this.doorOpenAmount = 0;
    this.carWidth = cw;
    this.carDepth = cd;

    // Destination panel (back-right wall)
    this.destButtons = [];
    var buttonMat = new THREE.MeshLambertMaterial({ color: 0x444444 });
    var buttonLitMat = new THREE.MeshLambertMaterial({ color: 0xffaa00 });
    for (var f = 0; f < WORLD.FLOOR_COUNT; f++) {
        var btn = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 6), buttonMat);
        btn.position.set(cw / 2 - 0.15, ch * 0.2 + f * 0.12, -cd / 2 + 0.05);
        btn.rotation.x = Math.PI / 2;
        btn.renderOrder = 1;
        btn.userData = {
            floor: f,
            lit: false,
            dimMat: buttonMat,
            litMat: buttonLitMat,
            setLit: function(on) {
                if (on && !this.lit) {
                    this.material = this.litMat;
                    this.lit = true;
                } else if (!on && this.lit) {
                    this.material = this.dimMat;
                    this.lit = false;
                }
            }
        };
        this.carGroup.add(btn);
        this.destButtons.push(btn);
    }

    // In-car floor indicator
    this.inCarIndicator = makeInCarIndicator();
    this.inCarIndicator.position.set(0, ch * 0.85, cd / 2 - 0.05);
    this.inCarIndicator.renderOrder = 1;
    this.carGroup.add(this.inCarIndicator);

    scene.add(this.carGroup);

    // Track world for shaft indicator updates
    this.world = world;
    this.shaftIndicators = world.shaftIndicators || [];
    this.callPanels = world.callPanels || [];
}

Elevator.prototype.callUp = function(floor) { this.logic.callUp(floor); };
Elevator.prototype.callDown = function(floor) { this.logic.callDown(floor); };
Elevator.prototype.pressDestination = function(floor) { this.logic.pressDestination(floor); };
Elevator.prototype.isAcceptingAt = function(floor, direction) { return this.logic.isAcceptingAt(floor, direction); };
Elevator.prototype.currentCapacityFree = function() { return this.logic.currentCapacityFree(); };
Elevator.prototype.reserveBoardingSpot = function(personId) {
    var s = this.logic.reserveBoardingSpot(personId);
    if (s) {
        // Convert spot to world position within the car
        s.worldPosition = new THREE.Vector3(s.x, 0, s.z);
    }
    return s;
};
Elevator.prototype.completeBoard = function(personId) { this.logic.completeBoard(personId); };
Elevator.prototype.registerDisembark = function(personId) { this.logic.registerDisembark(personId); };
Elevator.prototype.completeDisembark = function(personId) { this.logic.completeDisembark(personId); };

Elevator.prototype.tick = function(dt) {
    this.logic.tick(dt);

    // Update car position
    var targetY = this.logic.floorY;
    this.carGroup.position.y = targetY;

    // Update door animation
    var state = this.logic.getState();
    var targetOpen = 0;
    if (state === 'DOOR_OPENING') {
        targetOpen = Math.min(1, this.logic.doorTimer / this.logic.DOOR_MOVE_S);
    } else if (state === 'DOOR_OPEN') {
        targetOpen = 1;
    } else if (state === 'DOOR_CLOSING') {
        targetOpen = Math.max(0, 1 - this.logic.doorTimer / this.logic.DOOR_MOVE_S);
    } else {
        targetOpen = 0;
    }
    this.doorOpenAmount = targetOpen;

    var halfW = this.carWidth / 2;
    var gap = 0.03;
    var openOffset = (halfW / 2 - gap) * targetOpen;
    this.doorLeft.position.x = -halfW / 4 - openOffset;
    this.doorRight.position.x = halfW / 4 + openOffset;

    // Update destination buttons
    var calls = this.logic.getCalls();
    var dests = calls.destinations;
    for (var i = 0; i < this.destButtons.length; i++) {
        var btn = this.destButtons[i];
        btn.userData.setLit(dests.indexOf(btn.userData.floor) >= 0);
    }

    // Update floor indicators
    var floorText = String(this.logic.currentFloor);
    var dirArrow = '';
    if (this.logic.direction > 0) dirArrow = '^';
    else if (this.logic.direction < 0) dirArrow = 'v';
    var displayText = floorText + dirArrow;

    this.inCarIndicator.userData.setText(displayText);

    // Update shaft indicators and call panels
    for (var si = 0; si < this.shaftIndicators.length; si++) {
        this.shaftIndicators[si].userData.setText(displayText);
    }
    for (var pi = 0; pi < this.callPanels.length; pi++) {
        var panel = this.callPanels[pi];
        var panelFloor = Math.round((this.carGroup.position.y) / WORLD.FLOOR_HEIGHT);
        panel.userData.setIndicator(String(panelFloor));
        panel.userData.setUp(calls.upCalls.indexOf(panelFloor) >= 0);
        panel.userData.setDown(calls.downCalls.indexOf(panelFloor) >= 0);
    }
};

// Read-through properties
Object.defineProperty(Elevator.prototype, 'state', {
    get: function() { return this.logic.getState(); }
});
Object.defineProperty(Elevator.prototype, 'direction', {
    get: function() { return this.logic.direction; }
});
Object.defineProperty(Elevator.prototype, 'currentFloor', {
    get: function() { return this.logic.currentFloor; }
});
Object.defineProperty(Elevator.prototype, 'targetFloor', {
    get: function() { return this.logic.targetFloor; }
});
Object.defineProperty(Elevator.prototype, 'upCalls', {
    get: function() { return Object.keys(this.logic.upCalls).map(Number); }
});
Object.defineProperty(Elevator.prototype, 'downCalls', {
    get: function() { return Object.keys(this.logic.downCalls).map(Number); }
});
Object.defineProperty(Elevator.prototype, 'destinations', {
    get: function() { return Object.keys(this.logic.destinations).map(Number); }
});
Object.defineProperty(Elevator.prototype, 'passengers', {
    get: function() { return this.logic.getPassengerIds(); }
});
Object.defineProperty(Elevator.prototype, 'pendingBoarders', {
    get: function() { return this.logic.getPendingBoarderIds(); }
});
Object.defineProperty(Elevator.prototype, 'pendingDisembark', {
    get: function() { return this.logic.getPendingDisembarkIds(); }
});

window.Elevator = Elevator;