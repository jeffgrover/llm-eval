// elevator.js - Three.js elevator car, doors, indicators, and adapter around ElevatorLogic

(function() {
    class Elevator {
        constructor(scene, world) {
            this.world = world;
            this.logic = new window.ElevatorLogic({
                floorCount: world.FLOOR_COUNT,
                maxCapacity: 4,
                floorHeight: world.FLOOR_HEIGHT
            });

            // Car geometry parameters
            this.carWidth = 2.5;
            this.carDepth = 3.0;
            this.carHeight = 2.2;
            this.floorY = 0;

            // Create car group
            this.carGroup = new THREE.Group();
            this.carGroup.renderOrder = 1;

            // Yellow semi-transparent frame material
            const frameMat = new THREE.MeshLambertMaterial({ 
                color: 0xffcc00, 
                opacity: 0.5, 
                depthWrite: false, 
                side: THREE.DoubleSide 
            });

            // Solid back wall material (opaque)
            const backMat = new THREE.MeshLambertMaterial({ 
                color: 0xffcc00,
                depthWrite: true 
            });

            // Door material (slightly more opaque)
            const doorMat = new THREE.MeshLambertMaterial({ 
                color: 0xffcc00, 
                opacity: 0.7, 
                depthWrite: false, 
                side: THREE.DoubleSide 
            });

            // Floor
            const floorMesh = new THREE.Mesh(
                new THREE.PlaneGeometry(this.carWidth, this.carDepth),
                frameMat
            );
            floorMesh.rotation.x = -Math.PI / 2;
            floorMesh.position.y = 0;
            this.carGroup.add(floorMesh);

            // Ceiling
            const ceilingMesh = new THREE.Mesh(
                new THREE.PlaneGeometry(this.carWidth, this.carDepth),
                frameMat
            );
            ceilingMesh.rotation.x = Math.PI / 2;
            ceilingMesh.position.y = this.carHeight;
            this.carGroup.add(ceilingMesh);

            // Side walls
            const sideWallGeo = new THREE.PlaneGeometry(this.carWidth, this.carHeight);
            const leftWall = new THREE.Mesh(sideWallGeo, frameMat);
            leftWall.position.set(-this.carWidth/2, this.carHeight/2, 0);
            this.carGroup.add(leftWall);

            const rightWall = new THREE.Mesh(sideWallGeo, frameMat);
            rightWall.position.set(this.carWidth/2, this.carHeight/2, 0);
            this.carGroup.add(rightWall);

            // Back wall (solid)
            const backWall = new THREE.Mesh(
                new THREE.PlaneGeometry(this.carDepth, this.carHeight),
                backMat
            );
            backWall.rotation.y = Math.PI;
            backWall.position.set(0, this.carHeight/2, -this.carDepth/2);
            this.carGroup.add(backWall);

            // Sliding doors on +Z face (two panels)
            const doorGeo = new THREE.PlaneGeometry(this.carWidth/2, this.carHeight);
            
            this.leftDoor = new THREE.Mesh(doorGeo, doorMat);
            this.leftDoor.position.set(-this.carWidth/4, this.carHeight/2, this.carDepth/2);
            this.carGroup.add(this.leftDoor);

            this.rightDoor = new THREE.Mesh(doorGeo, doorMat);
            this.rightDoor.position.set(this.carWidth/4, this.carHeight/2, this.carDepth/2);
            this.carGroup.add(this.rightDoor);

            // Destination panel on back-right wall
            this.destinationPanel = new THREE.Group();
            const panelBase = new THREE.Mesh(
                new THREE.PlaneGeometry(0.8, 1.0),
                new THREE.MeshLambertMaterial({ color: 0x333333 })
            );
            this.destinationPanel.add(panelBase);

            // Create buttons for each floor (glowing cylinders)
            this.buttonRefs = [];
            for (let i = 0; i < world.FLOOR_COUNT; i++) {
                const button = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.1, 0.1, 0.05, 8),
                    new THREE.MeshLambertMaterial({ color: 0x666666 })
                );
                button.rotation.x = Math.PI / 2;
                button.position.set(-0.3 + (i % 2) * 0.4, 0.5 - Math.floor(i/2) * 0.4, 0.1);
                this.destinationPanel.add(button);
                this.buttonRefs.push(button);
            }

            // In-car indicator above doors (looking back at passengers)
            const inCarIndicator = new THREE.Mesh(
                new THREE.PlaneGeometry(0.6, 0.6),
                new THREE.MeshLambertMaterial({ 
                    color: 0x888888,
                    depthWrite: false 
                })
            );
            inCarIndicator.position.set(0, this.carHeight - 0.3, -this.carDepth/2 + 0.1);
            this.destinationPanel.add(inCarIndicator);

            this.destinationPanel.position.set(0, this.carHeight/2, -this.carDepth/2 + 0.5);
            this.carGroup.add(this.destinationPanel);

            // Add car group to scene
            scene.add(this.carGroup);

            // Update initial positions and indicators
            this.updateCarPosition();
            this.updateIndicators();
        }

        updateCarPosition() {
            // Sync car position with logic.currentFloor
            this.carGroup.position.y = this.logic.currentFloor * this.world.FLOOR_HEIGHT;
        }

        updateDoors() {
            const isOpening = this.logic.state === this.logic.DOOR_OPENING;
            const isClosing = this.logic.state === this.logic.DOOR_CLOSING;
            const isOpen = this.logic.state === this.logic.DOOR_OPEN;

            // Sliding doors: closed at x=0, open when moved outward
            const openOffset = (this.carWidth / 2) - 0.1; // Small gap when closed
            
            if (isOpening || isClosing) {
                // Animate door movement based on timer
                const speed = isOpening ? 0.5 : 0.5;
                this.leftDoor.position.x = -openOffset * (isOpen ? 1 : 0);
                this.rightDoor.position.x = openOffset * (isOpen ? 1 : 0);
            } else if (isOpen) {
                // Fully open
                this.leftDoor.position.x = -openOffset;
                this.rightDoor.position.x = openOffset;
            } else {
                // Closed
                this.leftDoor.position.x = -0.1;
                this.rightDoor.position.x = 0.1;
            }
        }

        updateIndicators() {
            // Update building-side call panel lamps and indicators
            for (const floor of this.world.floors) {
                if (floor.callPanelMesh) {
                    const panel = floor.callPanelMesh;
                    
                    // Up arrow lamp
                    panel.userData.setUp(this.logic.upCalls.has(floor.floorNumber) && 
                        this.logic.direction !== -1);
                    
                    // Down arrow lamp
                    panel.userData.setDown(this.logic.downCalls.has(floor.floorNumber) && 
                        this.logic.direction !== 1);
                    
                    // Floor indicator (car's current floor and direction)
                    const dir = this.logic.direction;
                    let text = Math.round(this.logic.currentFloor).toString();
                    if (dir !== 0) text += dir > 0 ? '^' : 'v';
                    panel.userData.setIndicator(text);
                }

                // Update shaft indicator above doors
                if (floor.shaftIndicatorMesh) {
                    const ind = floor.shaftIndicatorMesh;
                    const dir = this.logic.direction;
                    let text = Math.round(this.logic.currentFloor).toString();
                    if (dir !== 0) text += dir > 0 ? '^' : 'v';
                    ind.userData.updateDisplay(Math.round(this.logic.currentFloor), dir);
                }
            }

            // Update in-car destination buttons
            for (const floor of this.logic.destinations) {
                if (this.buttonRefs[floor]) {
                    this.buttonRefs[floor].material.color.setHex(0x00ff00); // Green when pressed
                }
            }

            // Reset other buttons
            for (let i = 0; i < this.buttonRefs.length; i++) {
                if (!this.logic.destinations.has(i)) {
                    this.buttonRefs[i].material.color.setHex(0x666666);
                }
            }
        }

        // Public API - mirrors ElevatorLogic methods
        callUp(floor) { this.logic.callUp(floor); }
        callDown(floor) { this.logic.callDown(floor); }
        pressDestination(floor) { this.logic.pressDestination(floor); }
        isAcceptingAt(floor, direction) { return this.logic.isAcceptingAt(floor, direction); }
        currentCapacityFree() { return this.logic.currentCapacityFree(); }
        
        reserveBoardingSpot(person) {
            const spot = this.logic.reserveBoardingSpot(person);
            if (spot) {
                // Convert car-local spot position to world position for boarding
                person.boardingSpotIndex = spot.index;
                const worldPos = new THREE.Vector3(spot.x, spot.y, spot.z);
                worldPos.applyMatrix4(this.carGroup.matrixWorld);
                return worldPos;
            }
            return null;
        }

        completeBoard(person) { this.logic.completeBoard(person); }
        registerDisembark(person) { this.logic.registerDisembark(person); }
        completeDisembark(person) { this.logic.completeDisembark(person); }

        tick(dt) {
            // Advance logic state machine
            this.logic.tick(dt);
            
            // Update visual components
            this.updateCarPosition();
            this.updateDoors();
            this.updateIndicators();
        }

        reset() {
            this.logic.reset();
            this.carGroup.position.y = 0;
            this.leftDoor.position.x = -0.1;
            this.rightDoor.position.x = 0.1;
        }

        // Expose state for HUD
        getState() {
            return this.logic.getState();
        }
    }

    window.Elevator = Elevator;
})();
