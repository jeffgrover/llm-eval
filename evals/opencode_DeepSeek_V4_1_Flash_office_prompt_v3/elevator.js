function createElevatorCar() {
    var car = new THREE.Group();
    var FH = WORLD.FLOOR_HEIGHT;
    var carHeight = FH - 0.5;
    var half = WORLD.SHAFT_WIDTH / 2;

    var frameMat = new THREE.MeshLambertMaterial({ color: 0xffd24a, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide });
    var doorMat = new THREE.MeshLambertMaterial({ color: 0xffc21c, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide });
    var backMat = new THREE.MeshLambertMaterial({ color: 0xe0a820 });

    function add(mesh) {
        mesh.renderOrder = 1;
        car.add(mesh);
        return mesh;
    }

    var floorMesh = add(new THREE.Mesh(new THREE.BoxGeometry(half * 2, 0.12, half * 2), frameMat));
    floorMesh.position.y = 0.06;

    var ceiling = add(new THREE.Mesh(new THREE.BoxGeometry(half * 2, 0.12, half * 2), frameMat));
    ceiling.position.y = carHeight;

    var backWall = add(new THREE.Mesh(new THREE.BoxGeometry(half * 2, carHeight, 0.1), backMat));
    backWall.position.set(0, carHeight / 2, -half + 0.05);

    var leftWall = add(new THREE.Mesh(new THREE.BoxGeometry(0.08, carHeight, half * 2), frameMat));
    leftWall.position.set(-half + 0.04, carHeight / 2, 0);
    var rightWall = add(new THREE.Mesh(new THREE.BoxGeometry(0.08, carHeight, half * 2), frameMat));
    rightWall.position.set(half - 0.04, carHeight / 2, 0);

    var doorWidth = half - 0.06;
    var leftDoor = add(new THREE.Mesh(new THREE.BoxGeometry(doorWidth, carHeight - 0.2, 0.08), doorMat));
    leftDoor.position.set(-doorWidth / 2, (carHeight - 0.2) / 2, half - 0.04);
    var rightDoor = add(new THREE.Mesh(new THREE.BoxGeometry(doorWidth, carHeight - 0.2, 0.08), doorMat));
    rightDoor.position.set(doorWidth / 2, (carHeight - 0.2) / 2, half - 0.04);

    var panelMat = new THREE.MeshLambertMaterial({ color: 0x2b2b2b });
    var panelMesh = add(new THREE.Mesh(new THREE.BoxGeometry(0.5, WORLD.FLOOR_COUNT * 0.34 + 0.2, 0.06), panelMat));
    panelMesh.position.set(half - 0.35, carHeight * 0.55, -half + 0.13);

    var buttons = [];
    var i;
    for (i = 0; i < WORLD.FLOOR_COUNT; i += 1) {
        var btnMat = new THREE.MeshBasicMaterial({ color: 0x4a4a4a });
        var btn = add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 10), btnMat));
        btn.rotation.x = Math.PI / 2;
        btn.position.set(half - 0.35, 0.4 + i * 0.32, -half + 0.18);
        btn.userData.on = false;
        buttons.push(btn);
    }

    var tex = document.createElement("canvas");
    tex.width = 256;
    tex.height = 256;
    var ctx = tex.getContext("2d");
    var carTex = new THREE.CanvasTexture(tex);
    carTex.minFilter = THREE.LinearMipmapLinearFilter;
    carTex.magFilter = THREE.LinearFilter;
    carTex.anisotropy = 4;
    carTex._canvas = tex;
    carTex._ctx = ctx;
    carTex._lastText = null;

    function drawIndicator(text) {
        if (carTex._lastText === text) return;
        carTex._lastText = text;
        ctx.clearRect(0, 0, 256, 256);
        ctx.fillStyle = "#050505";
        ctx.fillRect(0, 0, 256, 256);
        ctx.fillStyle = "#ffbb22";
        ctx.font = "bold 180px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.shadowColor = "#ffbb22";
        ctx.shadowBlur = 30;
        ctx.fillText(text, 128, 134);
        ctx.shadowBlur = 0;
        carTex.needsUpdate = true;
    }
    drawIndicator("1");

    var indMat = new THREE.MeshBasicMaterial({ map: carTex, transparent: true, depthWrite: false });
    var innerIndicator = add(new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), indMat));
    innerIndicator.position.set(0, carHeight - 0.35, half - 0.12);
    innerIndicator.rotation.y = Math.PI;

    car.userData.leftDoor = leftDoor;
    car.userData.rightDoor = rightDoor;
    car.userData.buttons = buttons;
    car.userData.setIndicator = drawIndicator;

    return car;
}

function Elevator(scene, world) {
    this.scene = scene;
    this.world = world;
    this.logic = new ElevatorLogic({
        floorCount: WORLD.FLOOR_COUNT,
        maxCapacity: 4,
        floorHeight: WORLD.FLOOR_HEIGHT
    });
    this.car = createElevatorCar();
    this.car.renderOrder = 1;
    scene.add(this.car);
    this.doorOpenAmount = 0;
    this.applyVisuals(0);
}

Elevator.prototype.callUp = function callUp(floor) { this.logic.callUp(floor); };
Elevator.prototype.callDown = function callDown(floor) { this.logic.callDown(floor); };
Elevator.prototype.pressDestination = function pressDestination(floor) { this.logic.pressDestination(floor); };
Elevator.prototype.isAcceptingAt = function isAcceptingAt(floor, direction) { return this.logic.isAcceptingAt(floor, direction); };
Elevator.prototype.currentCapacityFree = function currentCapacityFree() { return this.logic.currentCapacityFree(); };
Elevator.prototype.reserveBoardingSpot = function reserveBoardingSpot(person) { return this.logic.reserveBoardingSpot(person); };
Elevator.prototype.completeBoard = function completeBoard(person) { this.logic.completeBoard(person); };
Elevator.prototype.cancelBoard = function cancelBoard(person) { this.logic.cancelBoard(person); };
Elevator.prototype.registerDisembark = function registerDisembark(person) { this.logic.registerDisembark(person); };
Elevator.prototype.completeDisembark = function completeDisembark(person) { this.logic.completeDisembark(person); };

Elevator.prototype.reset = function reset() {
    this.logic.reset();
    this.doorOpenAmount = 0;
    this.applyVisuals(0);
};

Elevator.prototype.tick = function tick(dt) {
    this.logic.tick(dt);
    this.applyVisuals(dt);
};

Elevator.prototype.applyVisuals = function applyVisuals(dt) {
    var logic = this.logic;
    this.car.position.y = logic.position * WORLD.FLOOR_HEIGHT;

    var openTarget = (logic.state === "DOOR_OPEN" || logic.state === "DOOR_OPENING") ? 1 : 0;
    var rate = Math.min(1, 6 * Math.max(dt, 0.016));
    this.doorOpenAmount += (openTarget - this.doorOpenAmount) * rate;
    if (this.doorOpenAmount < 0.001) this.doorOpenAmount = 0;
    if (this.doorOpenAmount > 0.999) this.doorOpenAmount = 1;
    var slide = this.doorOpenAmount * (WORLD.SHAFT_WIDTH / 2 - 0.1);
    this.car.userData.leftDoor.position.x = -0.69 - slide;
    this.car.userData.rightDoor.position.x = 0.69 + slide;

    var dirChar = logic.direction > 0 ? "^" : (logic.direction < 0 ? "v" : "");
    var text = String(logic.currentFloor) + dirChar;
    this.car.userData.setIndicator(text);

    var i;
    for (i = 0; i < this.car.userData.buttons.length; i += 1) {
        var on = logic.destinations.has(i);
        if (on !== this.car.userData.buttons[i].userData.on) {
            this.car.userData.buttons[i].userData.on = on;
            this.car.userData.buttons[i].material.color.setHex(on ? 0x33ff66 : 0x4a4a4a);
        }
    }

    for (i = 0; i < this.world.floors.length; i += 1) {
        var floor = this.world.floors[i];
        if (floor.callPanel && floor.callPanel.userData.setUp) {
            floor.callPanel.userData.setUp(logic.upCalls.has(i));
            floor.callPanel.userData.setDown(logic.downCalls.has(i));
        }
        if (floor.shaftIndicator && floor.shaftIndicator.userData.setText) {
            floor.shaftIndicator.userData.setText(text);
        }
    }
};

["state", "direction", "currentFloor", "targetFloor", "upCalls", "downCalls", "destinations", "passengers", "pendingBoarders", "pendingDisembark"].forEach(function mirror(name) {
    Object.defineProperty(Elevator.prototype, name, {
        get: function get() { return this.logic[name]; },
        configurable: true
    });
});

window.Elevator = Elevator;
window.createElevatorCar = createElevatorCar;