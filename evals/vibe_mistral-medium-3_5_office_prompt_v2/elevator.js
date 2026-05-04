(function() {
    const DOOR_OPEN = 'DOOR_OPEN';
    const DOOR_OPENING = 'DOOR_OPENING';
    const DOOR_CLOSING = 'DOOR_CLOSING';
    const IDLE = 'IDLE';
    const MOVING = 'MOVING';

    // Text texture helper for in-car indicator
    let textCanvas, textCtx;
    function getTextCanvas() {
        if (!textCanvas) {
            textCanvas = document.createElement('canvas');
            textCanvas.width = 256; textCanvas.height = 256;
            textCtx = textCanvas.getContext('2d');
            textCtx.font = 'Bold 180px Arial';
        }
        return { canvas: textCanvas, ctx: textCtx };
    }

    function updateTextTexture(text, tex) {
        if (tex && tex._lastText === text) return;
        const { ctx, canvas } = getTextCanvas();
        ctx.fillStyle = '#050505';
        ctx.fillRect(0, 0, 256, 256);
        ctx.fillStyle = '#ffbb22';
        ctx.shadowColor = '#ffbb22';
        ctx.shadowBlur = 20;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 128, 128, 200);
        if (tex) {
            tex.needsUpdate = true;
            tex._lastText = text;
        } else {
            tex = new THREE.CanvasTexture(canvas);
            tex.minFilter = THREE.LinearFilter;
            tex.magFilter = THREE.LinearFilter;
            tex.anisotropy = 4;
            tex._lastText = text;
        }
        return tex;
    }

    class Elevator {
        constructor(scene, world) {
            this.scene = scene;
            this.world = world;
            this.logic = new ElevatorLogic({
                floorCount: world.FLOOR_COUNT,
                maxCapacity: 4,
                floorHeight: world.WORLD.FLOOR_HEIGHT
            });

            this.carGroup = new THREE.Group();
            this.carGroup.renderOrder = 1;
            this.scene.add(this.carGroup);

            // Car dimensions
            const carWidth = 2.8;
            const carDepth = 2.8;
            const carHeight = 2.5;

            // Car frame (yellow semi-transparent)
            const frameMat = new THREE.MeshPhongMaterial({
                color: 0xffff00,
                opacity: 0.5,
                transparent: true,
                depthWrite: false,
                side: THREE.DoubleSide
            });

            // Floor
            const floor = new THREE.Mesh(
                new THREE.BoxGeometry(carWidth, 0.1, carDepth),
                frameMat
            );
            floor.position.y = -carHeight/2 + 0.05;
            this.carGroup.add(floor);

            // Ceiling
            const ceiling = new THREE.Mesh(
                new THREE.BoxGeometry(carWidth, 0.1, carDepth),
                frameMat
            );
            ceiling.position.y = carHeight/2 - 0.05;
            this.carGroup.add(ceiling);

            // Side walls
            const sideMat = new THREE.MeshPhongMaterial({
                color: 0xffff00,
                opacity: 0.7,
                transparent: true,
                depthWrite: false,
                side: THREE.DoubleSide
            });

            const leftWall = new THREE.Mesh(
                new THREE.BoxGeometry(0.1, carHeight - 0.2, carDepth),
                sideMat
            );
            leftWall.position.set(-carWidth/2 + 0.05, 0, 0);
            this.carGroup.add(leftWall);

            const rightWall = new THREE.Mesh(
                new THREE.BoxGeometry(0.1, carHeight - 0.2, carDepth),
                sideMat
            );
            rightWall.position.set(carWidth/2 - 0.05, 0, 0);
            this.carGroup.add(rightWall);

            // Back wall (solid yellow)
            const backWall = new THREE.Mesh(
                new THREE.BoxGeometry(carWidth, carHeight - 0.2, 0.1),
                new THREE.MeshPhongMaterial({ color: 0xffff00 })
            );
            backWall.position.set(0, 0, -carDepth/2 + 0.05);
            this.carGroup.add(backWall);

            // Sliding doors on +Z face
            this.leftDoor = new THREE.Mesh(
                new THREE.BoxGeometry(carWidth/2 - 0.05, carHeight - 0.2, 0.1),
                sideMat
            );
            this.leftDoor.position.set(-carWidth/4, 0, carDepth/2 - 0.05);
            this.carGroup.add(this.leftDoor);

            this.rightDoor = new THREE.Mesh(
                new THREE.BoxGeometry(carWidth/2 - 0.05, carHeight - 0.2, 0.1),
                sideMat
            );
            this.rightDoor.position.set(carWidth/4, 0, carDepth/2 - 0.05);
            this.carGroup.add(this.rightDoor);

            this.doorOffset = 0;
            this.doorOpenState = 0; // 0 = closed, 1 = fully open

            // Interior spots (4 positions)
            this.spotPositions = [
                new THREE.Vector3(-0.8, 0, -0.4),
                new THREE.Vector3(0.8, 0, -0.4),
                new THREE.Vector3(-0.8, 0, 0.4),
                new THREE.Vector3(0.8, 0, 0.4)
            ];

            // Destination panel on back-right wall
            this.destinationButtons = [];
            const buttonGroup = new THREE.Group();
            buttonGroup.position.set(carWidth/2 - 0.3, 0.5, -carDepth/2 + 0.15);
            this.carGroup.add(buttonGroup);

            for (let f = 0; f < this.world.FLOOR_COUNT; f++) {
                const button = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.08, 0.08, 0.1, 16),
                    new THREE.MeshPhongMaterial({ color: 0x444444, emissive: 0x222222, emissiveIntensity: 0.1 })
                );
                button.position.set(0, 0.6 - f * 0.25, 0);
                button.userData = { floor: f, on: false };
                buttonGroup.add(button);
                this.destinationButtons.push(button);
            }

            // In-car floor indicator
            const indicatorGroup = new THREE.Group();
            indicatorGroup.position.set(0, carHeight/2 - 0.1, -carDepth/2 + 0.1);
            this.carGroup.add(indicatorGroup);

            const indSize = 0.6;
            const indGeo = new THREE.PlaneGeometry(indSize, indSize);
            const indTex = {};
            const indMat = new THREE.MeshBasicMaterial({ map: indTex, transparent: true });
            this.carIndicator = new THREE.Mesh(indGeo, indMat);
            this.carIndicator.rotation.x = -Math.PI / 2;
            indicatorGroup.add(this.carIndicator);

            this.carIndicator.userData = {
                setIndicator: text => {
                    if (!indTex.map) {
                        const t = new THREE.CanvasTexture();
                        t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = 4;
                        indTex.map = t; indTex._lastText = '';
                    }
                    updateTextTexture(text, indTex.map);
                    this.carIndicator.material.map = indTex.map;
                }
            };
            this.carIndicator.userData.setIndicator('G');

            // Position at floor 0
            this.carGroup.position.y = 0;

            // Track previous floor for position updates
            this.previousFloor = 0;
        }

        callUp(floor) {
            this.logic.callUp(floor);
        }

        callDown(floor) {
            this.logic.callDown(floor);
        }

        pressDestination(floor) {
            this.logic.pressDestination(floor);
            // Light up the button
            for (const btn of this.destinationButtons) {
                if (btn.userData.floor === floor) {
                    btn.material.color.set(0xffff00);
                    btn.material.emissive.set(0xffff00);
                    btn.material.emissiveIntensity = 0.8;
                    btn.userData.on = true;
                }
            }
        }

        isAcceptingAt(floor, direction) {
            return this.logic.isAcceptingAt(floor, direction);
        }

        currentCapacityFree() {
            return this.logic.currentCapacityFree();
        }

        reserveBoardingSpot(person) {
            const spot = this.logic.reserveBoardingSpot(person);
            if (spot) {
                // Add world position info for the spot
                spot.worldPosition = new THREE.Vector3(
                    this.carGroup.position.x + spot.x,
                    this.carGroup.position.y + this.world.WORLD.FLOOR_HEIGHT * this.logic.currentFloor,
                    this.carGroup.position.z + spot.z
                );
            }
            return spot;
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

        tick(dt) {
            // Advance logic
            this.logic.tick(dt);

            // Update car position based on logic state
            const currentFloorHeight = this.logic.currentFloor * this.world.WORLD.FLOOR_HEIGHT;
            const targetY = currentFloorHeight;

            // Smooth movement
            const moveSpeed = 4.0; // units per second
            const dist = targetY - this.carGroup.position.y;
            if (Math.abs(dist) > 0.01) {
                const move = Math.sign(dist) * Math.min(Math.abs(dist), moveSpeed * dt);
                this.carGroup.position.y += move;
            } else {
                this.carGroup.position.y = targetY;
            }

            // Update doors
            const doorState = this.logic.state;
            let targetDoorOffset = 0;

            if (doorState === DOOR_OPENING) {
                const progress = this.logic.doorOpenTimer / 0.8;
                targetDoorOffset = progress * (carWidth / 2 - 0.1);
            } else if (doorState === DOOR_OPEN) {
                targetDoorOffset = carWidth / 2 - 0.1;
            } else if (doorState === DOOR_CLOSING) {
                const progress = 1.0 - (this.logic.doorOpenTimer / 0.8);
                targetDoorOffset = progress * (carWidth / 2 - 0.1);
            } else {
                targetDoorOffset = 0;
            }

            this.doorOffset = targetDoorOffset;
            this.leftDoor.position.x = -carWidth/2 + 0.05 + this.doorOffset;
            this.rightDoor.position.x = carWidth/2 - 0.05 - this.doorOffset;

            // Update call panel lamps on each floor
            for (const floorInfo of this.world.floors) {
                const panel = floorInfo.callPanel;
                if (panel && panel.userData) {
                    const floor = floorInfo.floorNumber;
                    panel.userData.setUp(this.logic.upCalls.has(floor));
                    panel.userData.setDown(this.logic.downCalls.has(floor));
                    panel.userData.setIndicator('' + (this.logic.state === DOOR_OPEN && this.logic.currentFloor === floor ? Math.round(this.logic.currentFloor) : floor));
                }
            }

            // Update shaft indicators
            const dirChar = this.logic.direction === 1 ? '^' : this.logic.direction === -1 ? 'v' : '';
            for (const floorInfo of this.world.floors) {
                const indicator = floorInfo.shaftIndicator;
                if (indicator && indicator.userData && indicator.userData.setIndicator) {
                    if (this.logic.state === DOOR_OPEN && this.logic.currentFloor === floorInfo.floorNumber) {
                        indicator.userData.setIndicator(floorInfo.floorNumber + '');
                    } else if (this.logic.state === MOVING && this.logic.currentFloor >= floorInfo.floorNumber - 0.5 && this.logic.currentFloor <= floorInfo.floorNumber + 0.5) {
                        indicator.userData.setIndicator(floorInfo.floorNumber + dirChar);
                    } else {
                        indicator.userData.setIndicator(floorInfo.floorNumber + '');
                    }
                }
            }

            // Update in-car indicator
            if (this.carIndicator && this.carIndicator.userData && this.carIndicator.userData.setIndicator) {
                const dirStr = this.logic.direction === 1 ? '^' : this.logic.direction === -1 ? 'v' : '';
                const floorStr = Math.round(this.logic.currentFloor);
                this.carIndicator.userData.setIndicator(floorStr + dirStr);
            }

            // Update destination buttons (dim when destination is cleared)
            for (const btn of this.destinationButtons) {
                if (btn.userData.on && !this.logic.destinations.has(btn.userData.floor)) {
                    btn.material.color.set(0x444444);
                    btn.material.emissive.set(0x222222);
                    btn.material.emissiveIntensity = 0.1;
                    btn.userData.on = false;
                }
            }

            // Update previous floor tracking
            if (Math.abs(this.logic.currentFloor - Math.round(this.logic.currentFloor)) < 0.01) {
                this.previousFloor = Math.round(this.logic.currentFloor);
            }
        }

        reset() {
            this.logic.reset();
            this.carGroup.position.y = 0;
            this.doorOffset = 0;
            this.leftDoor.position.x = -carWidth/2 + 0.05;
            this.rightDoor.position.x = carWidth/2 - 0.05;
            for (const btn of this.destinationButtons) {
                btn.material.color.set(0x444444);
                btn.material.emissive.set(0x222222);
                btn.material.emissiveIntensity = 0.1;
                btn.userData.on = false;
            }
            if (this.carIndicator && this.carIndicator.userData && this.carIndicator.userData.setIndicator) {
                this.carIndicator.userData.setIndicator('G');
            }
        }

        // Mirror logic properties for HUD
        get state() { return this.logic.state; }
        get direction() { return this.logic.direction; }
        get currentFloor() { return Math.round(this.logic.currentFloor); }
        get targetFloor() { return this.logic.targetFloor; }
        get upCalls() { return Array.from(this.logic.upCalls); }
        get downCalls() { return Array.from(this.logic.downCalls); }
        get destinations() { return Array.from(this.logic.destinations); }
        get passengers() { return Array.from(this.logic.passengers); }
        get pendingBoarders() { return Array.from(this.logic.pendingBoarders); }
        get pendingDisembark() { return Array.from(this.logic.pendingDisembark); }
    }

    window.Elevator = Elevator;
})();
