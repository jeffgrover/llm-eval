(function elevatorVisualModule(root) {
    function elevatorTransparentMaterial(color, opacity) {
        return new THREE.MeshStandardMaterial({
            color: color,
            transparent: true,
            opacity: opacity,
            depthWrite: false,
            side: THREE.DoubleSide,
            roughness: 0.72,
            metalness: 0.08,
        });
    }

    function elevatorTextTexture(text) {
        var canvas = document.createElement("canvas");
        canvas.width = 256;
        canvas.height = 256;
        var texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = true;
        texture.anisotropy = 4;
        texture._lastText = "";
        elevatorUpdateTextTexture(texture, text);
        return texture;
    }

    function elevatorUpdateTextTexture(texture, text) {
        var value = String(text);
        if (texture._lastText === value) return;
        texture._lastText = value;
        var context = texture.image.getContext("2d");
        context.clearRect(0, 0, 256, 256);
        context.fillStyle = "#050505";
        context.fillRect(0, 0, 256, 256);
        context.font = "bold 154px monospace";
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.shadowColor = "#ffbb22";
        context.shadowBlur = 22;
        context.fillStyle = "#ffbb22";
        context.fillText(value, 128, 133, 212);
        context.shadowBlur = 0;
        texture.needsUpdate = true;
    }

    function elevatorSetRenderOrder(object) {
        object.renderOrder = 1;
        for (var childIndex = 0; childIndex < object.children.length; childIndex += 1) elevatorSetRenderOrder(object.children[childIndex]);
    }

    class Elevator {
        constructor(scene, world) {
            this.scene = scene;
            this.world = world;
            this.logic = new ElevatorLogic({ floorCount: WORLD.FLOOR_COUNT, maxCapacity: 4, floorHeight: WORLD.FLOOR_HEIGHT });
            this.carGroup = new THREE.Group();
            this.carGroup.name = "ElevatorCar";
            this.carGroup.position.set(0, 0, 0);
            this.carGroup.renderOrder = 1;
            this.doorLeft = null;
            this.doorRight = null;
            this.destinationButtons = [];
            this.floorTexture = elevatorTextTexture("0");
            this._buildCar();
            scene.add(this.carGroup);
            this._syncMirrorState();
            this._updateVisuals();
        }

        _buildCar() {
            var frameMaterial = elevatorTransparentMaterial(0xf0b52f, 0.5);
            var doorMaterial = elevatorTransparentMaterial(0xffc847, 0.7);
            var backMaterial = new THREE.MeshStandardMaterial({ color: 0xe5a820, roughness: 0.67, metalness: 0.12 });
            var width = 2.4;
            var depth = 2.4;
            var height = 2.85;
            var carFloor = new THREE.Mesh(new THREE.BoxGeometry(width, 0.12, depth), frameMaterial);
            carFloor.position.y = 0.06;
            this.carGroup.add(carFloor);
            var carCeiling = new THREE.Mesh(new THREE.BoxGeometry(width, 0.12, depth), frameMaterial);
            carCeiling.position.y = height;
            this.carGroup.add(carCeiling);
            var sideLeft = new THREE.Mesh(new THREE.BoxGeometry(0.12, height, depth), frameMaterial);
            sideLeft.position.set(-width / 2, height / 2, 0);
            this.carGroup.add(sideLeft);
            var sideRight = new THREE.Mesh(new THREE.BoxGeometry(0.12, height, depth), frameMaterial);
            sideRight.position.set(width / 2, height / 2, 0);
            this.carGroup.add(sideRight);
            var back = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.12), backMaterial);
            back.position.set(0, height / 2, -depth / 2);
            this.carGroup.add(back);

            this.doorLeft = new THREE.Mesh(new THREE.BoxGeometry(width / 2, 2.55, 0.1), doorMaterial);
            this.doorLeft.position.set(-width / 4, 1.33, depth / 2);
            this.carGroup.add(this.doorLeft);
            this.doorRight = new THREE.Mesh(new THREE.BoxGeometry(width / 2, 2.55, 0.1), doorMaterial);
            this.doorRight.position.set(width / 4, 1.33, depth / 2);
            this.carGroup.add(this.doorRight);

            var panelMaterial = new THREE.MeshStandardMaterial({ color: 0x202a36, roughness: 0.5, metalness: 0.35 });
            var buttonOff = new THREE.MeshStandardMaterial({ color: 0x536275, emissive: 0x000000, roughness: 0.5, metalness: 0.3 });
            var buttonOn = new THREE.MeshStandardMaterial({ color: 0xffd463, emissive: 0xff8a18, emissiveIntensity: 1.6, roughness: 0.35, metalness: 0.25 });
            var buttonPanel = new THREE.Mesh(new THREE.BoxGeometry(0.28, 2.25, 0.08), panelMaterial);
            buttonPanel.position.set(0.82, 1.37, -1.13);
            this.carGroup.add(buttonPanel);
            for (var floorIndex = 0; floorIndex < WORLD.FLOOR_COUNT; floorIndex += 1) {
                var button = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.06, 12), buttonOff);
                button.rotation.x = Math.PI / 2;
                button.position.set(0.82, 2.1 - floorIndex * 0.32, -1.19);
                button.userData.offMaterial = buttonOff;
                button.userData.onMaterial = buttonOn;
                button.userData.floor = floorIndex;
                this.destinationButtons.push(button);
                this.carGroup.add(button);
            }
            var indicatorMaterial = new THREE.MeshBasicMaterial({ map: this.floorTexture, transparent: true, depthWrite: false, side: THREE.DoubleSide });
            var indicator = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), indicatorMaterial);
            indicator.position.set(0, 2.78, 1.19);
            indicator.name = "InCarFloorIndicator";
            this.carGroup.add(indicator);
            this.inCarIndicator = indicator;
            elevatorSetRenderOrder(this.carGroup);
        }

        _syncMirrorState() {
            this.state = this.logic.state;
            this.direction = this.logic.direction;
            this.currentFloor = this.logic.currentFloor;
            this.positionFloor = this.logic.positionFloor;
            this.targetFloor = this.logic.targetFloor;
            this.upCalls = this.logic.upCalls;
            this.downCalls = this.logic.downCalls;
            this.destinations = this.logic.destinations;
            this.passengers = this.logic.passengers;
            this.pendingBoarders = this.logic.pendingBoarders;
            this.pendingDisembark = this.logic.pendingDisembark;
        }

        _updateVisuals() {
            this.carGroup.position.y = this.logic.positionFloor * WORLD.FLOOR_HEIGHT;
            var openAmount = this.logic.doorOpenFraction;
            this.doorLeft.position.x = -0.6 - openAmount * 0.48;
            this.doorRight.position.x = 0.6 + openAmount * 0.48;
            var directionText = this.logic.direction > 0 ? "^" : (this.logic.direction < 0 ? "v" : "-");
            var displayText = String(this.logic.currentFloor) + directionText;
            elevatorUpdateTextTexture(this.floorTexture, displayText);
            for (var floorIndex = 0; floorIndex < this.world.floors.length; floorIndex += 1) {
                var floorRecord = this.world.floors[floorIndex];
                var panelData = floorRecord.callPanel.userData;
                panelData.setUp(this.logic.upCalls.has(floorIndex));
                panelData.setDown(this.logic.downCalls.has(floorIndex));
                panelData.setIndicator(String(floorIndex));
                floorRecord.shaftIndicator.userData.setIndicator(displayText);
            }
            for (var buttonIndex = 0; buttonIndex < this.destinationButtons.length; buttonIndex += 1) {
                var destinationButton = this.destinationButtons[buttonIndex];
                destinationButton.material = this.logic.destinations.has(destinationButton.userData.floor) ? destinationButton.userData.onMaterial : destinationButton.userData.offMaterial;
            }
        }

        callUp(floor) {
            var result = this.logic.callUp(floor);
            this._syncMirrorState();
            return result;
        }

        callDown(floor) {
            var result = this.logic.callDown(floor);
            this._syncMirrorState();
            return result;
        }

        pressDestination(floor) {
            var result = this.logic.pressDestination(floor);
            this._syncMirrorState();
            return result;
        }

        isAcceptingAt(floor, direction) {
            return this.logic.isAcceptingAt(floor, direction);
        }

        currentCapacityFree() {
            return this.logic.currentCapacityFree();
        }

        reserveBoardingSpot(person) {
            var result = this.logic.reserveBoardingSpot(person);
            this._syncMirrorState();
            return result;
        }

        cancelBoarding(person) {
            var result = this.logic.cancelBoarding(person);
            this._syncMirrorState();
            return result;
        }

        completeBoard(person) {
            var result = this.logic.completeBoard(person);
            this._syncMirrorState();
            return result;
        }

        registerDisembark(person) {
            var result = this.logic.registerDisembark(person);
            this._syncMirrorState();
            return result;
        }

        completeDisembark(person) {
            var result = this.logic.completeDisembark(person);
            this._syncMirrorState();
            return result;
        }

        tick(dt) {
            this.logic.tick(dt);
            this._syncMirrorState();
            this._updateVisuals();
        }

        reset() {
            this.logic.reset();
            this._syncMirrorState();
            this._updateVisuals();
        }

        localSpotToWorld(spot) {
            var local = new THREE.Vector3(spot.x, spot.y, spot.z);
            return this.carGroup.localToWorld(local);
        }

        doorThresholdWorld(spot) {
            var local = new THREE.Vector3(spot.x, 0.06, 1.43);
            return this.carGroup.localToWorld(local);
        }

        exitWorld(person) {
            var spot = this.logic.spotByPerson.get(person) || { x: 0, y: 0.06, z: 0 };
            var local = new THREE.Vector3(spot.x, 0.05, 1.64);
            return this.carGroup.localToWorld(local);
        }
    }

    root.Elevator = Elevator;
})(window);
