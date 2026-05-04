(function(root) {

var W = root.WORLD;

function Elevator(scene, world) {
    this.scene = scene;
    this.world = world;
    this.logic = new ElevatorLogic({
        floorCount: W.FLOOR_COUNT,
        maxCapacity: 4,
        floorHeight: W.FLOOR_HEIGHT
    });

    this.group = new THREE.Group();
    this.group.renderOrder = 1;

    var carW = W.SHAFT_WIDTH - 0.3;
    var carD = W.SHAFT_DEPTH - 0.3;
    var carH = 2.6;

    this.carW = carW;
    this.carD = carD;
    this.carH = carH;

    var frameMat = new THREE.MeshLambertMaterial({
        color: 0xcccc00, transparent: true, opacity: 0.5,
        depthWrite: false, side: THREE.DoubleSide
    });
    var solidBackMat = new THREE.MeshLambertMaterial({color: 0xcccc00});
    var doorMat = new THREE.MeshLambertMaterial({
        color: 0xcccc00, transparent: true, opacity: 0.7,
        depthWrite: false, side: THREE.DoubleSide
    });

    var floor = new THREE.Mesh(new THREE.BoxGeometry(carW, 0.1, carD), frameMat);
    floor.position.y = 0.05;
    this.group.add(floor);

    var ceiling = new THREE.Mesh(new THREE.BoxGeometry(carW, 0.1, carD), frameMat);
    ceiling.position.y = carH - 0.05;
    this.group.add(ceiling);

    var leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.05, carH, carD), frameMat);
    leftWall.position.set(-carW / 2, carH / 2, 0);
    this.group.add(leftWall);

    var rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.05, carH, carD), frameMat);
    rightWall.position.set(carW / 2, carH / 2, 0);
    this.group.add(rightWall);

    var backWall = new THREE.Mesh(new THREE.BoxGeometry(carW, carH, 0.05), solidBackMat);
    backWall.position.set(0, carH / 2, -carD / 2 + 0.025);
    this.group.add(backWall);

    this.leftDoor = new THREE.Mesh(new THREE.BoxGeometry(carW / 2 - 0.02, carH - 0.2, 0.04), doorMat);
    this.rightDoor = new THREE.Mesh(new THREE.BoxGeometry(carW / 2 - 0.02, carH - 0.2, 0.04), doorMat);
    this.group.add(this.leftDoor);
    this.group.add(this.rightDoor);

    this._setDoorPosition(0);

    this.destButtons = [];
    this.destPanelGroup = new THREE.Group();
    for (var i = 0; i < W.FLOOR_COUNT; i++) {
        var btnMat = new THREE.MeshLambertMaterial({color: 0x555555});
        var btn = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.04, 8), btnMat);
        btn.rotation.x = Math.PI / 2;
        btn.position.set(0.15, carH * 0.65 - i * 0.25, -carD / 2 + 0.2);
        this.destPanelGroup.add(btn);
        this.destButtons.push({mesh: btn, mat: btnMat, floor: i});
    }
    this.group.add(this.destPanelGroup);

    this.inCarIndicator = root.createInCarIndicator ? root.createInCarIndicator(this.group, 0, carH - 0.35, carD / 2 - 0.05) : null;

    this.group.position.set(0, 0, 0);
    scene.add(this.group);
}

Elevator.prototype._setDoorPosition = function(openAmount) {
    var halfW = this.carW / 2 - 0.02;
    var slideDist = halfW * 0.95;
    this.leftDoor.position.set(-halfW + openAmount * slideDist, this.carH / 2, this.carD / 2 - 0.02);
    this.rightDoor.position.set(halfW - openAmount * slideDist, this.carH / 2, this.carD / 2 - 0.02);
};

Elevator.prototype.callUp = function(floor) { this.logic.callUp(floor); };
Elevator.prototype.callDown = function(floor) { this.logic.callDown(floor); };
Elevator.prototype.pressDestination = function(floor) { this.logic.pressDestination(floor); };

Elevator.prototype.isAcceptingAt = function(floor, direction) {
    return this.logic.isAcceptingAt(floor, direction);
};

Elevator.prototype.currentCapacityFree = function() {
    return this.logic.currentCapacityFree();
};

Elevator.prototype.reserveBoardingSpot = function(person) {
    var spot = this.logic.reserveBoardingSpot(person);
    if (!spot) return null;
    return {
        index: spot.index,
        x: spot.x,
        y: this.group.position.y + 0.15,
        z: spot.z
    };
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

Elevator.prototype.reset = function() {
    this.logic.reset();
};

Object.defineProperty(Elevator.prototype, 'state', {
    get: function() { return this.logic.state; }
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
    get: function() { return this.logic.upCalls; }
});
Object.defineProperty(Elevator.prototype, 'downCalls', {
    get: function() { return this.logic.downCalls; }
});
Object.defineProperty(Elevator.prototype, 'destinations', {
    get: function() { return this.logic.destinations; }
});
Object.defineProperty(Elevator.prototype, 'passengers', {
    get: function() { return this.logic.passengers; }
});
Object.defineProperty(Elevator.prototype, 'pendingBoarders', {
    get: function() { return this.logic.pendingBoarders; }
});
Object.defineProperty(Elevator.prototype, 'pendingDisembark', {
    get: function() { return this.logic.pendingDisembark; }
});

Elevator.prototype.tick = function(dt) {
    this.logic.tick(dt);

    this.group.position.y = this.logic.y;

    this._setDoorPosition(this.logic.doorOpenAmount);

    for (var f = 0; f < this.world.floors.length; f++) {
        var panel = this.world.floors[f].callPanel;
        panel.userData.setUp(this.logic.upCalls.has(f));
        panel.userData.setDown(this.logic.downCalls.has(f));
        panel.userData.setIndicator('' + f);
    }

    for (var f = 0; f < this.world.floors.length; f++) {
        var shaftInd = this.world.floors[f].shaftIndicator;
        var dirChar = this.logic.direction > 0 ? '^' : (this.logic.direction < 0 ? 'v' : '-');
        var text = '' + this.logic.currentFloor + dirChar;
        if (shaftInd.tex) {
            if (typeof root.updateTextTexture === 'function') {
                root.updateTextTexture(shaftInd.tex, text);
            }
        }
    }

    for (var i = 0; i < this.destButtons.length; i++) {
        var btn = this.destButtons[i];
        var isLit = this.logic.destinations.has(btn.floor);
        btn.mesh.material = isLit ?
            new THREE.MeshLambertMaterial({color: 0xffff00, emissive: 0xffff00, emissiveIntensity: 0.5}) :
            new THREE.MeshLambertMaterial({color: 0x555555});
    }

    if (this.inCarIndicator && this.inCarIndicator.tex) {
        var dirChar2 = this.logic.direction > 0 ? '^' : (this.logic.direction < 0 ? 'v' : '-');
        var text2 = '' + this.logic.currentFloor + dirChar2;
        if (typeof root.updateTextTexture === 'function') {
            root.updateTextTexture(this.inCarIndicator.tex, text2);
        }
    }
};

Elevator.prototype.getDoorWorldPos = function() {
    var pos = new THREE.Vector3(0, this.group.position.y + this.carH / 2, this.carD / 2);
    this.group.localToWorld(pos);
    return pos;
};

Elevator.prototype.getSpotWorldPos = function(spotIndex) {
    var offsets = [
        {x: -0.8, z: -0.5},
        {x: 0.8, z: -0.5},
        {x: -0.8, z: 0.5},
        {x: 0.8, z: 0.5}
    ];
    var off = offsets[spotIndex] || offsets[0];
    var pos = new THREE.Vector3(off.x, this.carH / 2, off.z);
    this.group.localToWorld(pos);
    return pos;
};

root.Elevator = Elevator;

})(window);