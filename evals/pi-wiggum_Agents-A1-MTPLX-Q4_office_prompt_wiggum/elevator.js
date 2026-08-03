(function(global) {
    var STATES = {
        IDLE: 'IDLE',
        MOVING: 'MOVING',
        DOOR_OPENING: 'DOOR_OPENING',
        DOOR_OPEN: 'DOOR_OPEN',
        DOOR_CLOSING: 'DOOR_CLOSING'
    };

    function Elevator(scene, world) {
        this.world = world;
        this.floorCount = world.FLOOR_COUNT;
        this.floorHeight = world.FLOOR_HEIGHT;
        this.maxCapacity = 4;
        this.moveSpeed = 1.0;

        // Create ElevatorLogic instance
        this.logic = new ElevatorLogic({
            floorCount: this.floorCount,
            maxCapacity: this.maxCapacity,
            floorHeight: this.floorHeight,
            moveSpeed: this.moveSpeed
        });

        // Car geometry
        this.carGroup = new THREE.Group();
        this.carGroup.renderOrder = 1;

        this.carWidth = 2.5;
        this.carDepth = 2.0;
        this.carHeight = 2.5;
        var backWallX = 0;

        // Yellow semi-transparent frame
        var yellow = 0xffdd00;
        var yellowMat = new THREE.MeshLambertMaterial({
            color: yellow,
            opacity: 0.5,
            transparent: true,
            side: THREE.DoubleSide
        });
        var backWallMat = new THREE.MeshLambertMaterial({ color: yellow });

        // Floor and ceiling
        var floorGeo = new THREE.PlaneGeometry(this.carWidth, this.carDepth);
        var floor = new THREE.Mesh(floorGeo, yellowMat);
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = 0;
        this.carGroup.add(floor);

        var ceiling = new THREE.Mesh(floorGeo, yellowMat);
        ceiling.rotation.x = Math.PI / 2;
        ceiling.position.y = this.carHeight;
        this.carGroup.add(ceiling);

        // Side walls
        var sideGeo = new THREE.PlaneGeometry(this.carWidth, this.carHeight);
        var leftWall = new THREE.Mesh(sideGeo, yellowMat);
        leftWall.position.set(-this.carWidth/2, this.carHeight/2, 0);
        this.carGroup.add(leftWall);

        var rightWall = new THREE.Mesh(sideGeo, yellowMat);
        rightWall.position.set(this.carWidth/2, this.carHeight/2, 0);
        this.carGroup.add(rightWall);

        // Back wall - solid yellow
        var backGeo = new THREE.PlaneGeometry(this.carWidth, this.carHeight);
        var backWall = new THREE.Mesh(backGeo, backWallMat);
        backWall.position.set(backWallX, this.carHeight/2, this.carDepth/2);
        backWall.renderOrder = 2;
        this.carGroup.add(backWall);

        // Sliding doors on +Z face (car face looks +Z, doors are on +Z wall)
        // Actually, car doors face +Z, meaning when car moves up, doors are at +Z side
        // We need two panels that slide outward to left and right
        var doorHeight = this.carHeight;
        var doorWidth = this.carWidth / 2;
        var doorMat = new THREE.MeshLambertMaterial({ color: 0x4444aa, opacity: 0.7, transparent: true });

        // Left door panel
        this.leftDoor = new THREE.Mesh(new THREE.PlaneGeometry(doorWidth, doorHeight), doorMat);
        this.leftDoor.position.set(-this.carWidth/4, this.carHeight/2, this.carDepth/2);
        this.carGroup.add(this.leftDoor);

        // Right door panel
        this.rightDoor = new THREE.Mesh(new THREE.PlaneGeometry(doorWidth, doorHeight), doorMat);
        this.rightDoor.position.set(this.carWidth/4, this.carHeight/2, this.carDepth/2);
        this.carGroup.add(this.rightDoor);

        // In-car destination buttons panel on back-right wall
        this.destinationPanel = new THREE.Group();
        this.destinationPanel.position.set(this.carWidth/2 - 0.3, this.carHeight/2, 0);
        this.destinationPanel.rotation.y = -Math.PI / 2; // face inward
        for (var f = 0; f < this.floorCount; f++) {
            var buttonGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.1, 8);
            var buttonMat = new THREE.MeshBasicMaterial({ color: 0x333333 });
            var button = new THREE.Mesh(buttonGeo, buttonMat);
            button.rotation.x = Math.PI / 2;
            button.position.y = 0.3 - f * 0.35;
            button.userData = { floor: f };
            this.destinationPanel.add(button);
        }
        this.carGroup.add(this.destinationPanel);

        // In-car indicator (canvas texture) above doors from inside
        var indicatorGeo = new THREE.PlaneGeometry(0.6, 0.6);
        var indicatorMat = new THREE.MeshBasicMaterial({ color: 0x050505 });
        this.indicatorMesh = new THREE.Mesh(indicatorGeo, indicatorMat);
        this.indicatorMesh.position.set(0, this.carHeight, 0.4);
        this.indicatorMesh.rotation.x = -Math.PI / 4; // angled inward
        this.carGroup.add(this.indicatorMesh);

        // Building-side indicator (shaft indicator) above doors facing +Z
        var shaftIndGeo = new THREE.PlaneGeometry(0.9, 0.9);
        var shaftIndMat = new THREE.MeshBasicMaterial({ color: 0x050505 });
        this.shaftIndicator = new THREE.Mesh(shaftIndGeo, shaftIndMat);
        this.shaftIndicator.position.set(0, this.carHeight + 0.1, 1.5);
        this.shaftIndicator.rotation.x = -Math.PI / 4; // angled outward
        this.carGroup.add(this.shaftIndicator);

        // Call panel lamps - up and down triangles (these are per-floor, not on car)
        // Car maintains reference to its own call panel? Actually call panels are attached to walls.
        // In elevator.js we don't have direct access to wall call panels, so we won't update them here.

        // Position car
        this.carGroup.position.y = 0;
        scene.add(this.carGroup);
    }

    Elevator.prototype.callUp = function(floor) {
        this.logic.callUp(floor);
    };

    Elevator.prototype.callDown = function(floor) {
        this.logic.callDown(floor);
    };

    Elevator.prototype.pressDestination = function(floor) {
        this.logic.pressDestination(floor);
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
        // Update logic
        this.logic.tick(dt);

        // Update car position
        var targetFloor = this.logic.targetFloor;
        var currentFloor = this.logic.currentFloor;
        var diff = targetFloor - currentFloor;
        var step = dt * this.moveSpeed;

        if (Math.abs(diff) <= step) {
            this.carGroup.position.y = targetFloor * this.floorHeight;
            this.currentFloor = targetFloor;
        } else {
            var dirSign = diff > 0 ? 1 : -1;
            this.currentFloor += dirSign * step;
            this.carGroup.position.y = this.currentFloor * this.floorHeight;
        }

        // Update state
        var state = this.logic.getState();
        this.state = state;
        this.direction = this.logic.getDirection();

        // Update doors
        this._updateDoors(state);

        // Update in-car indicator and shaft indicator
        this._updateIndicators();

        // Update destination buttons
        this._updateDestinationButtons();

        // Update call panel lamps (these are on walls, not car - but we can try to find them)
        this._updateCallPanelLamps();
    };

    Elevator.prototype._updateDoors = function(state) {
        if (state === STATES.DOOR_OPEN || state === STATES.DOOR_OPENING) {
            // Open doors: slide panels outward
            var openAmount = (state === STATES.DOOR_OPEN) ? 0.8 : (state === STATES.DOOR_OPENING ? 0.4 : 0);
            this.leftDoor.position.x = -this.carWidth/4 - openAmount * 0.5;
            this.rightDoor.position.x = this.carWidth/4 + openAmount * 0.5;
        } else {
            // Close doors
            this.leftDoor.position.x = -this.carWidth/4;
            this.rightDoor.position.x = this.carWidth/4;
        }
    };

    Elevator.prototype._updateIndicators = function() {
        // Update in-car indicator text
        var floor = Math.round(this.currentFloor);
        var text = floor + "";
        this._updateCanvasText(this.indicatorMesh, text, 0, '#ffbb22');

        // Update shaft indicator: show current floor and direction if moving
        var dirChar = "";
        if (this.direction === 1) dirChar = "^";
        else if (this.direction === -1) dirChar = "v";
        var shaftText = floor + dirChar;
        this._updateCanvasText(this.shaftIndicator, shaftText, 0, '#ffbb22');
    };

    Elevator.prototype._updateDestinationButtons = function() {
        // Light buttons for destinations that are active
        var children = this.destinationPanel.children;
        for (var i = 0; i < children.length; i++) {
            var btn = children[i];
            var f = btn.userData.floor;
            if (this.logic.destinations && this.logic.destinations.has(f)) {
                btn.material.color.setHex(0x00ff00);
            } else {
                btn.material.color.setHex(0x333333);
            }
        }
    };

    Elevator.prototype._updateCallPanelLamps = function() {
        // Update call panels on walls - this is tricky because we don't have references.
        // In world.js we created call panels but didn't store them globally.
        // For now, we'll skip updating them; they can be static for simulation.
    };

    Elevator.prototype.reset = function() {
        this.logic.reset();
        this.carGroup.position.y = 0;
        this.currentFloor = 0;
        this.state = STATES.IDLE;
    };

    // Helper: update canvas texture on a mesh with text
    Elevator.prototype._updateCanvasText = function(mesh, text, offset, color) {
        if (!mesh) return;
        // Create or reuse a canvas element
        var canvas = mesh.userData.canvas;
        if (!canvas) {
            canvas = document.createElement('canvas');
            canvas.width = 128;
            canvas.height = 128;
            mesh.userData.canvas = canvas;
            var ctx = canvas.getContext('2d');
            ctx.fillStyle = '#050505';
            ctx.fillRect(0, 0, 128, 128);
            ctx.font = 'bold 48px monospace';
            ctx.fillStyle = color || '#ffbb22';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(text, 64, 64);
            var texture = new THREE.CanvasTexture(canvas);
            mesh.material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
            mesh.material.depthWrite = true;
            mesh.material.depthTest = true;
        } else {
            var ctx = canvas.getContext('2d');
            ctx.fillStyle = '#050505';
            ctx.fillRect(0, 0, 128, 128);
            ctx.font = 'bold 48px monospace';
            ctx.fillStyle = color || '#ffbb22';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            // Handle text length
            if (text.length > 2) {
                ctx.font = 'bold 32px monospace';
            }
            ctx.fillText(text, 64, 64);
            var texture = new THREE.CanvasTexture(canvas);
            mesh.material.map = texture;
            mesh.material.needsUpdate = true;
        }
    };

    // Expose Elevator class globally
    global.Elevator = Elevator;

})(typeof window !== "undefined" ? window : globalThis);
