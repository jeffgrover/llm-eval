function Elevator(scene, world) {
    var self = this;
    var W = world.WORLD;
    var SH = W.SHAFT_WIDTH / 2;
    var FH = W.FLOOR_HEIGHT;
    var carWidth = 2.8;
    var carDepth = 2.6;
    var carHeight = 2.8;
    var cw = carWidth / 2;
    var cd = carDepth / 2;

    this.logic = new ElevatorLogic({floorCount: W.FLOOR_COUNT, maxCapacity: 4, floorHeight: FH});

    var carGroup = new THREE.Group();
    carGroup.renderOrder = 1;
    scene.add(carGroup);

    var sMat = createVisualMat(0xffff44, 0.5);
    function createVisualMat(color, opacity) {
        return new THREE.MeshLambertMaterial({color: color, opacity: opacity, transparent: true, depthWrite: false, side: THREE.DoubleSide});
    }

    // Floor
    var floorGeo = new THREE.BoxGeometry(carWidth, 0.1, carDepth);
    var floorM = new THREE.Mesh(floorGeo, createVisualMat(0xdddd44, 0.5));
    floorM.position.y = 0.05;
    carGroup.add(floorM);

    // Ceiling
    var ceilGeo = new THREE.BoxGeometry(carWidth, 0.1, carDepth);
    var ceilM = new THREE.Mesh(ceilGeo, createVisualMat(0xdddd44, 0.5));
    ceilM.position.y = carHeight - 0.05;
    carGroup.add(ceilM);

    // Left wall
    var lwGeo = new THREE.BoxGeometry(0.1, carHeight, carDepth);
    var lwM = new THREE.Mesh(lwGeo, sMat);
    lwM.position.set(-cw + 0.05, carHeight / 2, 0);
    carGroup.add(lwM);

    // Right wall
    var rwM = new THREE.Mesh(lwGeo, sMat);
    rwM.position.set(cw - 0.05, carHeight / 2, 0);
    carGroup.add(rwM);

    // Back wall (opaque)
    var bwGeo = new THREE.BoxGeometry(carWidth, carHeight, 0.1);
    var bwMat = new THREE.MeshLambertMaterial({color: 0xdddd22});
    var bwM = new THREE.Mesh(bwGeo, bwMat);
    bwM.position.set(0, carHeight / 2, -cd + 0.05);
    carGroup.add(bwM);

    // Sliding doors on +Z face
    var doorH = carHeight - 0.2;
    var doorGeo = new THREE.BoxGeometry(cw - 0.05, doorH, 0.06);
    var doorMat = createVisualMat(0xaaaaff, 0.7);

    var doorL = new THREE.Mesh(doorGeo, doorMat);
    doorL.position.set(-cw / 2, doorH / 2 + 0.1, cd);
    carGroup.add(doorL);

    var doorR = new THREE.Mesh(doorGeo, doorMat);
    doorR.position.set(cw / 2, doorH / 2 + 0.1, cd);
    carGroup.add(doorR);

    // Destination panel on back-right wall
    var destPanelGroup = new THREE.Group();
    for (var f = 0; f < W.FLOOR_COUNT; f++) {
        var btnGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.04, 12);
        var btnOffMat = new THREE.MeshLambertMaterial({color: 0x444444});
        var btn = new THREE.Mesh(btnGeo, btnOffMat);
        btn.position.set(cw - 0.25, 0.5 + f * 0.35, -cd + 0.25);
        btn.rotation.x = Math.PI / 2;
        btn.rotation.z = Math.PI / 2;
        btn.userData = {offMat: btnOffMat, onMat: new THREE.MeshLambertMaterial({color: 0x00ff00})};
        btn.userData.floorNum = f;
        destPanelGroup.add(btn);
    }
    carGroup.add(destPanelGroup);
    this._destButtons = destPanelGroup.children;

    // In-car floor indicator
    var inCarTex = _makeCarIndicatorTex();
    var inCarGeo = new THREE.PlaneGeometry(0.6, 0.6);
    var inCarMat = new THREE.MeshBasicMaterial({map: inCarTex, depthWrite: false, side: THREE.DoubleSide});
    var inCarInd = new THREE.Mesh(inCarGeo, inCarMat);
    inCarInd.position.set(0, carHeight - 0.3, cd - 0.05);
    inCarInd.rotation.y = Math.PI;
    carGroup.add(inCarInd);
    this._carIndicatorTex = inCarTex;

    this.group = carGroup;
    this._doorL = doorL;
    this._doorR = doorR;
    this._callPanels = [];

    // Reference to world floors for panel updates
    this._world = world;
    this._scene = scene;

    carGroup.position.y = 0;
}

Elevator.prototype._updateDoors = function() {
    var logic = this.logic;
    var cw = 1.4;
    var openAmt = 0;
    if (logic.state === ElevatorLogic.DOOR_OPEN) openAmt = cw - 0.15;
    else if (logic.state === ElevatorLogic.DOOR_CLOSING) openAmt = (cw - 0.15) * (logic.transitionTimer / ElevatorLogic.DOOR_TRANSITION_S);
    else if (logic.state === ElevatorLogic.DOOR_OPENING) openAmt = (cw - 0.15) * (1 - logic.transitionTimer / ElevatorLogic.DOOR_TRANSITION_S);

    this._doorL.position.x = -cw / 2 - openAmt;
    this._doorR.position.x = cw / 2 + openAmt;
};

Elevator.prototype._updatePanels = function() {
    var logic = this.logic;
    for (var i = 0; i < this._world.floors.length; i++) {
        var fl = this._world.floors[i];
        if (!fl.callPanel) continue;
        var fn = fl.floorNumber;
        fl.callPanel.userData.setUp(logic.upCalls[fn]);
        fl.callPanel.userData.setDown(logic.downCalls[fn]);

        if (logic.state === ElevatorLogic.DOOR_OPEN && logic.currentFloor === fn) {
            fl.callPanel.userData.setIndicator('');
        } else if (logic.state === ElevatorLogic.MOVING) {
            fl.callPanel.userData.setIndicator('');
        } else {
            var txt = '' + logic.currentFloor;
            if (logic.direction === 1) txt += '^';
            else if (logic.direction === -1) txt += 'v';
            fl.callPanel.userData.setIndicator(txt);
        }
        if (fl.shaftIndicator && fl.shaftIndicator.userData && fl.shaftIndicator.userData.setIndicator) {
            var sTxt = '' + logic.currentFloor;
            if (logic.direction === 1) sTxt += '^';
            else if (logic.direction === -1) sTxt += 'v';
            fl.shaftIndicator.userData.setIndicator(sTxt);
        }
    }

    // In-car indicator
    if (this._carIndicatorTex) {
        var ct = '' + logic.currentFloor;
        updateTextTexture(this._carIndicatorTex, ct);
    }

    // Destination buttons
    if (this._destButtons) {
        for (var b = 0; b < this._destButtons.length; b++) {
            var btn = this._destButtons[b];
            var fn = btn.userData.floorNum;
            btn.material = logic.destinations[fn] ? btn.userData.onMat : btn.userData.offMat;
        }
    }
};

Elevator.prototype.callUp = function(floor) { this.logic.callUp(floor); };
Elevator.prototype.callDown = function(floor) { this.logic.callDown(floor); };
Elevator.prototype.pressDestination = function(floor) { this.logic.pressDestination(floor); };
Elevator.prototype.isAcceptingAt = function(floor, dir) { return this.logic.isAcceptingAt(floor, dir); };
Elevator.prototype.currentCapacityFree = function() { return this.logic.currentCapacityFree(); };
Elevator.prototype.reserveBoardingSpot = function(person) { return this.logic.reserveBoardingSpot(person); };
Elevator.prototype.completeBoard = function(person) { this.logic.completeBoard(person); };
Elevator.prototype.registerDisembark = function(person) { this.logic.registerDisembark(person); };
Elevator.prototype.completeDisembark = function(person) { this.logic.completeDisembark(person); };
Elevator.prototype.reset = function() { this.logic.reset(); };
Elevator.prototype.tick = function(dt) {
    this.logic.tick(dt);
    var logic = this.logic;
    this.group.position.y = logic.floorPosition;
    this._updateDoors();
    this._updatePanels();
};

function _makeCarIndicatorTex() {
    var canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, 128, 128);
    var tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex._lastText = '';
    tex.ctx = ctx;
    return tex;
}

// Mirror elevator logic properties for HUD
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
    pendingDisembark: { get: function() { return this.logic.pendingDisembark; } },
    doorTimer: { get: function() { return this.logic.doorTimer; } }
});
