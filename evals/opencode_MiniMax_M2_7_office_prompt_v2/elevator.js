function Elevator(scene, world) {
    this.logic = new ElevatorLogic({
        floorCount: WORLD.FLOOR_COUNT,
        maxCapacity: 4,
        floorHeight: WORLD.FLOOR_HEIGHT
    });

    this.scene = scene;
    this.world = world;
    this.carGroup = new THREE.Group();

    var carWidth = WORLD.SHAFT_WIDTH - 0.3;
    var carDepth = WORLD.SHAFT_DEPTH - 0.3;
    var carHeight = WORLD.FLOOR_HEIGHT - 0.2;

    var frameMat = new THREE.MeshLambertMaterial({
        color: 0xffcc00,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        side: THREE.DoubleSide
    });

    var doorMat = new THREE.MeshLambertMaterial({
        color: 0xffcc00,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
        side: THREE.DoubleSide
    });

    var solidDoorMat = new THREE.MeshLambertMaterial({
        color: 0xffcc00,
        transparent: false,
        opacity: 1.0
    });

    var backWallMat = new THREE.MeshLambertMaterial({
        color: 0xffcc00,
        transparent: false,
        opacity: 1.0
    });

    this.carFloor = new THREE.Mesh(
        new THREE.PlaneGeometry(carWidth, carDepth),
        new THREE.MeshLambertMaterial({ color: 0xffcc00, transparent: true, opacity: 0.6 })
    );
    this.carFloor.rotation.x = -Math.PI / 2;
    this.carFloor.position.y = 0.01;
    this.carFloor.renderOrder = 1;
    this.carGroup.add(this.carFloor);

    this.carCeiling = new THREE.Mesh(
        new THREE.PlaneGeometry(carWidth, carDepth),
        new THREE.MeshLambertMaterial({ color: 0xffcc00, transparent: true, opacity: 0.4 })
    );
    this.carCeiling.rotation.x = Math.PI / 2;
    this.carCeiling.position.y = carHeight;
    this.carCeiling.renderOrder = 1;
    this.carGroup.add(this.carCeiling);

    this.leftWall = new THREE.Mesh(
        new THREE.PlaneGeometry(carDepth, carHeight),
        frameMat
    );
    this.leftWall.rotation.y = Math.PI / 2;
    this.leftWall.position.set(-carWidth / 2, carHeight / 2, 0);
    this.leftWall.renderOrder = 1;
    this.carGroup.add(this.leftWall);

    this.rightWall = new THREE.Mesh(
        new THREE.PlaneGeometry(carDepth, carHeight),
        frameMat
    );
    this.rightWall.rotation.y = -Math.PI / 2;
    this.rightWall.position.set(carWidth / 2, carHeight / 2, 0);
    this.rightWall.renderOrder = 1;
    this.carGroup.add(this.rightWall);

    this.backWall = new THREE.Mesh(
        new THREE.PlaneGeometry(carWidth, carHeight),
        backWallMat
    );
    this.backWall.position.set(0, carHeight / 2, -carDepth / 2);
    this.backWall.renderOrder = 1;
    this.carGroup.add(this.backWall);

    this.leftDoor = new THREE.Mesh(
        new THREE.BoxGeometry(carWidth / 2 - 0.05, carHeight - 0.2, 0.08),
        solidDoorMat
    );
    this.leftDoor.position.set(-carWidth / 4 - 0.025, carHeight / 2, carDepth / 2);
    this.leftDoor.renderOrder = 1;
    this.carGroup.add(this.leftDoor);

    this.rightDoor = new THREE.Mesh(
        new THREE.BoxGeometry(carWidth / 2 - 0.05, carHeight - 0.2, 0.08),
        solidDoorMat
    );
    this.rightDoor.position.set(carWidth / 4 + 0.025, carHeight / 2, carDepth / 2);
    this.rightDoor.renderOrder = 1;
    this.carGroup.add(this.rightDoor);

    var indCanvas = document.createElement('canvas');
    indCanvas.width = 128;
    indCanvas.height = 128;
    var indTex = new THREE.CanvasTexture(indCanvas);
    indTex.minFilter = THREE.LinearFilter;
    indTex.magFilter = THREE.LinearFilter;
    this.carIndicatorTex = indTex;
    this.carIndicator = new THREE.Mesh(
        new THREE.PlaneGeometry(0.6, 0.6),
        indTex
    );
    this.carIndicator.position.set(carWidth / 2 - 0.5, carHeight - 0.3, -carDepth / 2 + 0.1);
    this.carIndicator.rotation.y = Math.PI;
    this.carIndicator.renderOrder = 1;
    this.carGroup.add(this.carIndicator);

    this.destButtons = [];
    for (var f = 0; f < WORLD.FLOOR_COUNT; f++) {
        var btnGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.05, 8);
        var btnMat = new THREE.MeshBasicMaterial({ color: 0x333333 });
        var btn = new THREE.Mesh(btnGeo, btnMat);
        var row = Math.floor(f / 3);
        var col = f % 3;
        btn.position.set(
            carWidth / 2 - 0.3 + col * 0.2,
            0.5 + row * 0.6,
            -carDepth / 2 + 0.2
        );
        btn.rotation.x = Math.PI / 2;
        btn.renderOrder = 1;
        this.carGroup.add(btn);
        this.destButtons.push({ mesh: btn, floor: f, mat: btnMat });
    }

    this.carGroup.position.set(0, 0.1, 0);
    scene.add(this.carGroup);

    this.currentDoorPosition = 0;
}

Elevator.prototype._updateTextTexture = function(tex, text) {
    if (tex._lastText === text) return;
    tex._lastText = text;
    var canvas = tex.image;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = '#ffbb22';
    ctx.font = 'bold 90px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = '#ffbb22';
    ctx.shadowBlur = 15;
    ctx.fillText(text, 64, 70);
    tex.needsUpdate = true;
};

Elevator.prototype.callUp = function(floor) {
    this.logic.callUp(floor);
};

Elevator.prototype.callDown = function(floor) {
    this.logic.callDown(floor);
};

Elevator.prototype.pressDestination = function(floor) {
    this.logic.pressDestination(floor);
    for (var i = 0; i < this.destButtons.length; i++) {
        if (this.destButtons[i].floor === floor) {
            this.destButtons[i].mat.color.setHex(0x00ff44);
        }
    }
};

Elevator.prototype.isAcceptingAt = function(floor, direction) {
    return this.logic.isAcceptingAt(floor, direction);
};

Elevator.prototype.currentCapacityFree = function() {
    return this.logic.currentCapacityFree();
};

Elevator.prototype.reserveBoardingSpot = function(person) {
    return this.logic.reserveBoardingSpot(person);
};

Elevator.prototype.completeBoard = function(person) {
    this.logic.completeBoard(person);
};

Elevator.prototype.registerDisembark = function(person) {
    this.logic.registerDisembark(person);
};

Elevator.prototype.completeDisembark = function(person) {
    this.logic.completeDisembark(person);
};

Elevator.prototype.tick = function(dt) {
    this.logic.tick(dt);

    var targetY = this.logic.currentFloor * WORLD.FLOOR_HEIGHT + 0.1;
    this.carGroup.position.y = targetY;

    var targetDoorPos = 0;
    if (this.logic.state === 'DOOR_OPEN') {
        targetDoorPos = 1;
    } else if (this.logic.state === 'DOOR_OPENING') {
        targetDoorPos = this.logic.doorPosition;
    } else if (this.logic.state === 'DOOR_CLOSING') {
        targetDoorPos = this.logic.doorPosition;
    }

    var doorOffset = (WORLD.SHAFT_WIDTH / 2 - 0.05) * targetDoorPos;
    var carWidth = WORLD.SHAFT_WIDTH - 0.3;
    this.leftDoor.position.x = -carWidth / 4 - 0.025 - doorOffset;
    this.rightDoor.position.x = carWidth / 4 + 0.025 + doorOffset;

    for (var i = 0; i < this.world.floors.length; i++) {
        var floor = this.world.floors[i];
        var callPanel = floor.callPanel;
        callPanel.userData.setUp(this.logic.upCalls.has(floor.floorNumber));
        callPanel.userData.setDown(this.logic.downCalls.has(floor.floorNumber));
        callPanel.userData.setIndicator(String(Math.floor(this.logic.currentFloor)));
    }

    var carFloor = Math.floor(this.logic.currentFloor);
    var dirStr = '';
    if (this.logic.direction === 1) dirStr = '^';
    else if (this.logic.direction === -1) dirStr = 'v';

    this._updateTextTexture(this.carIndicatorTex, carFloor + dirStr);

    for (var i = 0; i < this.destButtons.length; i++) {
        var btn = this.destButtons[i];
        var isLit = this.logic.destinations.has(btn.floor) ||
                    (this.logic.passengers.size > 0 && this.logic.currentFloor === btn.floor);
        btn.mat.color.setHex(isLit ? 0x00ff44 : 0x333333);
    }

    for (var i = 0; i < this.world.floors.length; i++) {
        var floor = this.world.floors[i];
        if (floor.shaftIndicator && floor.shaftIndicator.userData) {
            var fNum = Math.floor(this.logic.currentFloor);
            var dStr = '';
            if (this.logic.direction === 1) dStr = '^';
            else if (this.logic.direction === -1) dStr = 'v';
            floor.shaftIndicator.userData.setIndicator(fNum + dStr);
        }
    }

    if (this.logic.state === 'IDLE' || this.logic.state === 'MOVING') {
        this.carIndicatorTex._lastText = null;
    }
};

Elevator.prototype.reset = function() {
    this.logic.reset();
    this.carGroup.position.y = 0.1;
    this.leftDoor.position.x = -(WORLD.SHAFT_WIDTH - 0.3) / 4 - 0.025;
    this.rightDoor.position.x = (WORLD.SHAFT_WIDTH - 0.3) / 4 + 0.025;

    for (var i = 0; i < this.destButtons.length; i++) {
        this.destButtons[i].mat.color.setHex(0x333333);
    }
};

Elevator.prototype.getState = function() {
    return this.logic.state;
};

Elevator.prototype.getDirection = function() {
    return this.logic.direction;
};

Elevator.prototype.getCurrentFloor = function() {
    return this.logic.currentFloor;
};

Elevator.prototype.getTargetFloor = function() {
    return this.logic.targetFloor;
};