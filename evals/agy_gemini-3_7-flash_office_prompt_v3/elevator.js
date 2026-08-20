/**
 * elevator.js
 * Three.js Elevator car visual representation and adapter around ElevatorLogic.
 * Manages 3D car mesh, sliding doors, in-car floor indicator, destination button panel,
 * and synchronizes external call panels and shaft indicators.
 */
(function() {
    "use strict";

    class Elevator {
        constructor(scene, world, options = {}) {
            this.scene = scene;
            this.world = world;
            this.logic = new ElevatorLogic({
                floorCount: (world && world.floors && world.floors.length) || 6,
                floorHeight: (window.WORLD && window.WORLD.FLOOR_HEIGHT) || 3.4,
                maxCapacity: options.maxCapacity || 4,
                speed: options.speed || 3.2,
                doorMoveDuration: options.doorMoveDuration || 0.8,
                minDoorOpenTime: options.minDoorOpenTime || 1.5,
                maxDoorOpenTime: options.maxDoorOpenTime || 8.0
            });

            this.carGroup = new THREE.Group();
            this.carGroup.renderOrder = 1;
            this._buildCarMesh();
            this.scene.add(this.carGroup);

            this.updateVisuals(0);
        }

        // Getters mirroring ElevatorLogic state for HUD/Agent inspection
        get state() { return this.logic.state; }
        get direction() { return this.logic.direction; }
        get currentFloor() { return this.logic.currentFloor; }
        get targetFloor() { return this.logic.targetFloor; }
        get positionY() { return this.logic.positionY; }
        get doorOpenFraction() { return this.logic.doorOpenFraction; }
        get upCalls() { return this.logic.upCalls; }
        get downCalls() { return this.logic.downCalls; }
        get destinations() { return this.logic.destinations; }
        get passengers() { return this.logic.passengers; }
        get pendingBoarders() { return this.logic.pendingBoarders; }
        get pendingDisembark() { return this.logic.pendingDisembark; }
        get spotOccupancy() { return this.logic.spotOccupancy; }
        get maxCapacity() { return this.logic.maxCapacity; }

        _buildCarMesh() {
            const carW = 2.6;
            const carD = 2.6;
            const carH = 3.0;

            const frameMat = new THREE.MeshLambertMaterial({
                color: 0xffcc00,
                opacity: 0.5,
                transparent: true,
                depthWrite: false,
                side: THREE.DoubleSide
            });

            const solidBackMat = new THREE.MeshLambertMaterial({
                color: 0xcca000,
                side: THREE.DoubleSide
            });

            const floorCeilMat = new THREE.MeshLambertMaterial({
                color: 0x444444,
                side: THREE.DoubleSide
            });

            const doorMat = new THREE.MeshLambertMaterial({
                color: 0xffdb4d,
                opacity: 0.75,
                transparent: true,
                depthWrite: false,
                side: THREE.DoubleSide
            });

            // Car Floor (local y = 0.05)
            const floorMesh = new THREE.Mesh(new THREE.BoxGeometry(carW, 0.1, carD), floorCeilMat);
            floorMesh.position.set(0, 0.05, 0);
            floorMesh.renderOrder = 1;
            this.carGroup.add(floorMesh);

            // Car Ceiling (local y = carH - 0.05)
            const ceilingMesh = new THREE.Mesh(new THREE.BoxGeometry(carW, 0.1, carD), floorCeilMat);
            ceilingMesh.position.set(0, carH - 0.05, 0);
            ceilingMesh.renderOrder = 1;
            this.carGroup.add(ceilingMesh);

            // Left Side Wall
            const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.06, carH, carD), frameMat);
            leftWall.position.set(-carW / 2, carH / 2, 0);
            leftWall.renderOrder = 1;
            this.carGroup.add(leftWall);

            // Right Side Wall
            const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.06, carH, carD), frameMat);
            rightWall.position.set(carW / 2, carH / 2, 0);
            rightWall.renderOrder = 1;
            this.carGroup.add(rightWall);

            // Solid Back Wall (at -Z)
            const backWall = new THREE.Mesh(new THREE.BoxGeometry(carW, carH, 0.08), solidBackMat);
            backWall.position.set(0, carH / 2, -carD / 2);
            backWall.renderOrder = 1;
            this.carGroup.add(backWall);

            // Sliding Doors (+Z face, closed at x = -0.65 and +0.65)
            this.doorWidth = carW / 2 - 0.05; // 1.25
            const doorGeo = new THREE.BoxGeometry(this.doorWidth, carH - 0.2, 0.05);

            this.leftDoor = new THREE.Mesh(doorGeo, doorMat);
            this.leftDoor.position.set(-this.doorWidth / 2, carH / 2, carD / 2);
            this.leftDoor.renderOrder = 1;
            this.carGroup.add(this.leftDoor);

            this.rightDoor = new THREE.Mesh(doorGeo, doorMat);
            this.rightDoor.position.set(this.doorWidth / 2, carH / 2, carD / 2);
            this.rightDoor.renderOrder = 1;
            this.carGroup.add(this.rightDoor);

            // Inside Destination Button Panel (on back-right interior wall)
            const panelGeo = new THREE.BoxGeometry(0.04, 1.2, 0.4);
            const panelMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
            const panelMesh = new THREE.Mesh(panelGeo, panelMat);
            panelMesh.position.set(carW / 2 - 0.03, 1.4, -0.4);
            panelMesh.renderOrder = 1;
            this.carGroup.add(panelMesh);

            // Destination buttons for 6 floors
            this.destButtons = [];
            for (let f = 0; f < this.logic.floorCount; f++) {
                const btnGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.02, 10);
                const btnMat = new THREE.MeshBasicMaterial({ color: 0x444444 });
                const btn = new THREE.Mesh(btnGeo, btnMat);
                btn.rotation.z = Math.PI / 2;
                const row = Math.floor(f / 2);
                const col = f % 2;
                btn.position.set(
                    carW / 2 - 0.05,
                    0.95 + row * 0.18,
                    -0.5 + col * 0.2
                );
                btn.renderOrder = 1;
                this.carGroup.add(btn);
                this.destButtons.push(btn);
            }

            // In-Car Floor Indicator (above doors looking back towards entrance, facing -Z)
            const canvas = document.createElement("canvas");
            canvas.width = 256;
            canvas.height = 256;
            this.inCarCtx = canvas.getContext("2d");
            this.inCarTex = new THREE.CanvasTexture(canvas);
            this.inCarTex._lastText = null;

            const indGeo = new THREE.PlaneGeometry(0.6, 0.6);
            const indMat = new THREE.MeshBasicMaterial({ map: this.inCarTex, side: THREE.DoubleSide });
            const inCarInd = new THREE.Mesh(indGeo, indMat);
            inCarInd.position.set(0, carH - 0.45, carD / 2 - 0.04);
            inCarInd.rotation.y = Math.PI; // Face towards back of car
            inCarInd.renderOrder = 1;
            this.carGroup.add(inCarInd);

            this._updateInCarText("0");
        }

        _updateInCarText(text) {
            if (this.inCarTex._lastText === text) return;
            this.inCarTex._lastText = text;

            const s = 256;
            const ctx = this.inCarCtx;
            ctx.fillStyle = "#050505";
            ctx.fillRect(0, 0, s, s);

            ctx.shadowColor = "#ff8800";
            ctx.shadowBlur = s * 0.12;
            ctx.fillStyle = "#ffbb22";
            ctx.font = `bold ${Math.round(s * 0.65)}px "Courier New", monospace`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(text, s / 2, s / 2);

            this.inCarTex.needsUpdate = true;
        }

        callUp(floor) {
            this.logic.callUp(floor);
        }

        callDown(floor) {
            this.logic.callDown(floor);
        }

        pressDestination(floor) {
            this.logic.pressDestination(floor);
        }

        isAcceptingAt(floor, dir) {
            return this.logic.isAcceptingAt(floor, dir);
        }

        currentCapacityFree() {
            return this.logic.currentCapacityFree();
        }

        reserveBoardingSpot(person) {
            return this.logic.reserveBoardingSpot(person);
        }

        completeBoard(person) {
            this.logic.completeBoard(person);
        }

        registerDisembark(person) {
            this.logic.registerDisembark(person);
        }

        completeDisembark(person) {
            this.logic.completeDisembark(person);
        }

        reset() {
            this.logic.reset();
            this.carGroup.position.set(0, 0, 0);
            this.updateVisuals(0);
        }

        tick(dt) {
            this.logic.tick(dt);
            this.updateVisuals(dt);
        }

        updateVisuals(dt) {
            // Update car vertical position
            this.carGroup.position.y = this.logic.positionY;

            // Update sliding doors
            const openOffset = this.logic.doorOpenFraction * (this.doorWidth - 0.05);
            this.leftDoor.position.x = -this.doorWidth / 2 - openOffset;
            this.rightDoor.position.x = this.doorWidth / 2 + openOffset;

            // Update In-Car Destination Buttons (glow yellow if registered)
            for (let f = 0; f < this.destButtons.length; f++) {
                const isLit = this.logic.destinations.has(f);
                this.destButtons[f].material.color.setHex(isLit ? 0xffea00 : 0x444444);
            }

            // Direction arrow string
            const dirSymbol = this.logic.direction > 0 ? "^" : (this.logic.direction < 0 ? "v" : "-");
            const indicatorString = `${this.logic.currentFloor} ${dirSymbol}`;

            // Update In-Car Floor Indicator
            this._updateInCarText(indicatorString);

            // Update Floor Call Panels and Shaft Indicators across all floors
            if (this.world && this.world.floors) {
                for (let f = 0; f < this.world.floors.length; f++) {
                    const floor = this.world.floors[f];
                    if (floor.callPanel && floor.callPanel.userData) {
                        floor.callPanel.userData.setUp(this.logic.upCalls.has(f));
                        floor.callPanel.userData.setDown(this.logic.downCalls.has(f));
                        floor.callPanel.userData.setIndicator(String(this.logic.currentFloor));
                    }
                    if (floor.shaftIndicator && floor.shaftIndicator.userData) {
                        floor.shaftIndicator.userData.setIndicator(indicatorString);
                    }
                }
            }
        }
    }

    window.Elevator = Elevator;
})();
