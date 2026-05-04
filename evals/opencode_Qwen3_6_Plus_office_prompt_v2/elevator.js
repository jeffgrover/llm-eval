(function(root) {
    function Elevator(scene, world) {
        this.logic = new ElevatorLogic({
            floorCount: WORLD.FLOOR_COUNT,
            maxCapacity: 4,
            floorHeight: WORLD.FLOOR_HEIGHT
        });

        this.scene = scene;
        this.world = world;
        this.carGroup = new THREE.Group();
        this.carGroup.renderOrder = 1;
        scene.add(this.carGroup);

        this._buildCar();
        this._buildDestinationPanel();
        this.carIndicator = createCarIndicator(this.carGroup);

        this._updatePosition();
    }

    Elevator.prototype._buildCar = function() {
        var floorHeight = WORLD.FLOOR_HEIGHT;
        var carWidth = 2.8;
        var carDepth = 2.8;
        var carHeight = 2.8;

        var frameMat = new THREE.MeshLambertMaterial({
            color: 0xffdd00, transparent: true, opacity: 0.5,
            depthWrite: false, side: THREE.DoubleSide
        });
        var doorMat = new THREE.MeshLambertMaterial({
            color: 0xffdd00, transparent: true, opacity: 0.7,
            depthWrite: false, side: THREE.DoubleSide
        });
        var backWallMat = new THREE.MeshLambertMaterial({ color: 0xddaa00 });

        // Floor
        var floorGeo = new THREE.BoxGeometry(carWidth, 0.1, carDepth);
        var carFloor = new THREE.Mesh(floorGeo, frameMat);
        carFloor.position.y = 0.05;
        carFloor.renderOrder = 1;
        this.carGroup.add(carFloor);

        // Ceiling
        var ceiling = new THREE.Mesh(floorGeo.clone(), frameMat);
        ceiling.position.y = carHeight;
        ceiling.renderOrder = 1;
        this.carGroup.add(ceiling);

        // Side walls
        var sideGeo = new THREE.BoxGeometry(0.1, carHeight, carDepth);
        var leftWall = new THREE.Mesh(sideGeo, frameMat);
        leftWall.position.set(-carWidth / 2, carHeight / 2, 0);
        leftWall.renderOrder = 1;
        this.carGroup.add(leftWall);

        var rightWall = new THREE.Mesh(sideGeo.clone(), frameMat);
        rightWall.position.set(carWidth / 2, carHeight / 2, 0);
        rightWall.renderOrder = 1;
        this.carGroup.add(rightWall);

        // Back wall (opaque)
        var backGeo = new THREE.BoxGeometry(carWidth, carHeight, 0.1);
        var backWall = new THREE.Mesh(backGeo, backWallMat);
        backWall.position.set(0, carHeight / 2, -carDepth / 2);
        backWall.renderOrder = 1;
        this.carGroup.add(backWall);

        // Sliding doors on +Z face
        var doorWidth = carWidth / 2;
        var doorGeo = new THREE.BoxGeometry(doorWidth - 0.05, carHeight - 0.1, 0.08);
        this.doorLeft = new THREE.Mesh(doorGeo, doorMat);
        this.doorLeft.position.set(-doorWidth / 2, carHeight / 2, carDepth / 2);
        this.doorLeft.renderOrder = 1;
        this.carGroup.add(this.doorLeft);

        this.doorRight = new THREE.Mesh(doorGeo.clone(), doorMat);
        this.doorRight.position.set(doorWidth / 2, carHeight / 2, carDepth / 2);
        this.doorRight.renderOrder = 1;
        this.carGroup.add(this.doorRight);

        this.carWidth = carWidth;
        this.carDepth = carDepth;
        this.carHeight = carHeight;
    };

    Elevator.prototype._buildDestinationPanel = function() {
        var panelGroup = new THREE.Group();
        var btnGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.03, 12);
        var btnDarkMat = new THREE.MeshBasicMaterial({ color: 0x444444 });
        var btnGlowMat = new THREE.MeshBasicMaterial({ color: 0x00ff44 });

        this.buttons = [];

        for (var f = 0; f < WORLD.FLOOR_COUNT; f++) {
            var btn = new THREE.Mesh(btnGeo, btnDarkMat.clone());
            btn.position.set(1.0, 0.5 + f * 0.35, -this.carDepth / 2 + 0.05);
            btn.rotation.x = Math.PI / 2;
            btn.renderOrder = 1;
            this.carGroup.add(btn);
            this.buttons.push({ mesh: btn, darkMat: btnDarkMat, glowMat: btnGlowMat, floor: f });
        }
    };

    Elevator.prototype._updatePosition = function() {
        var floor = this.logic.currentFloor;
        this.carGroup.position.y = floor * WORLD.FLOOR_HEIGHT;
    };

    Elevator.prototype._updateDoors = function() {
        var progress = this.logic.doorProgress;
        var halfWidth = this.carWidth / 2 - 0.1;
        this.doorLeft.position.x = -halfWidth * progress;
        this.doorRight.position.x = halfWidth * progress;
    };

    Elevator.prototype._updateButtons = function() {
        for (var i = 0; i < this.buttons.length; i++) {
            var btn = this.buttons[i];
            if (this.logic.destinations.has(btn.floor)) {
                btn.mesh.material = btn.glowMat;
            } else {
                btn.mesh.material = btn.darkMat;
            }
        }
    };

    Elevator.prototype._updateCallPanels = function() {
        var floors = this.world.floors;
        for (var i = 0; i < floors.length; i++) {
            var floor = floors[i];
            if (floor.callPanel && floor.callPanel.userData) {
                var fn = floor.floorNumber;
                var upOn = this.logic.upCalls.has(fn);
                var downOn = this.logic.downCalls.has(fn);
                floor.callPanel.userData.setUp(upOn);
                floor.callPanel.userData.setDown(downOn);
                floor.callPanel.userData.setIndicator(String(fn));
            }
            if (floor.shaftIndicator && floor.shaftIndicator.updateText) {
                var dir = this.logic.direction;
                var dirStr = dir > 0 ? '^' : (dir < 0 ? 'v' : '-');
                var text = Math.round(this.logic.currentFloor) + dirStr;
                floor.shaftIndicator.updateText(text);
            }
        }
    };

    Elevator.prototype._updateCarIndicator = function() {
        if (this.carIndicator && this.carIndicator.updateText) {
            var dir = this.logic.direction;
            var dirStr = dir > 0 ? '^' : (dir < 0 ? 'v' : '-');
            var text = Math.round(this.logic.currentFloor) + dirStr;
            this.carIndicator.updateText(text);
        }
    };

    Elevator.prototype.callUp = function(floor) {
        this.logic.callUp(floor);
    };

    Elevator.prototype.callDown = function(floor) {
        this.logic.callDown(floor);
    };

    Elevator.prototype.pressDestination = function(floor) {
        this.logic.pressDestination(floor);
    };

    Elevator.prototype.isAcceptingAt = function(floor, dir) {
        return this.logic.isAcceptingAt(floor, dir);
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
        this._updatePosition();
        this._updateDoors();
        this._updateButtons();
        this._updateCallPanels();
        this._updateCarIndicator();
    };

    Elevator.prototype.reset = function() {
        this.logic.reset();
        this._updatePosition();
        this._updateDoors();
        this._updateButtons();
        this._updateCallPanels();
        this._updateCarIndicator();
    };

    Object.defineProperty(Elevator.prototype, 'state', {
        get: function() { return this.logic.state; }
    });
    Object.defineProperty(Elevator.prototype, 'direction', {
        get: function() { return this.logic.direction; }
    });
    Object.defineProperty(Elevator.prototype, 'currentFloor', {
        get: function() { return Math.round(this.logic.currentFloor); }
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

    root.Elevator = Elevator;
})(typeof window !== 'undefined' ? window : globalThis);
