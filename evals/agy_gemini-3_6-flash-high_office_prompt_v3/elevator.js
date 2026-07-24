(function() {
    function createDigitTexture(text) {
        const canvas = document.createElement("canvas");
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext("2d");

        function draw(str) {
            ctx.fillStyle = "#050505";
            ctx.fillRect(0, 0, 256, 256);
            ctx.fillStyle = "#ffbb22";
            ctx.shadowColor = "#ff8800";
            ctx.shadowBlur = 15;
            ctx.font = "bold 160px sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(str, 128, 128);
        }

        draw(text || "0");
        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture._canvas = canvas;
        texture._ctx = ctx;
        texture._draw = draw;
        texture._lastText = text || "0";
        return texture;
    }

    function updateDigitTexture(texture, text) {
        if (!texture || texture._lastText === text) return;
        texture._lastText = text;
        texture._draw(text);
        texture.needsUpdate = true;
    }

    class Elevator {
        constructor(scene, world) {
            this.scene = scene;
            this.world = world;
            this.logic = new window.ElevatorLogic({
                floorCount: window.WORLD.FLOOR_COUNT,
                maxCapacity: 4,
                floorHeight: window.WORLD.FLOOR_HEIGHT
            });

            this.carGroup = new THREE.Group();
            this.carGroup.renderOrder = 1;

            const yellowFrameMat = new THREE.MeshLambertMaterial({
                color: 0xffcc00,
                transparent: true,
                opacity: 0.5,
                depthWrite: false,
                side: THREE.DoubleSide
            });
            const yellowSolidMat = new THREE.MeshLambertMaterial({ color: 0xddaa00 });
            const doorMat = new THREE.MeshLambertMaterial({
                color: 0xffee66,
                transparent: true,
                opacity: 0.7,
                depthWrite: false,
                side: THREE.DoubleSide
            });

            // Car dimensions: 2.8 wide (X), 3.0 high (Y), 2.8 deep (Z)
            // Car floor (local y = 0)
            const floorMesh = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.1, 2.8), yellowSolidMat);
            floorMesh.position.set(0, -0.05, 0);
            floorMesh.renderOrder = 1;
            this.carGroup.add(floorMesh);

            // Car ceiling (local y = 3.0)
            const ceilMesh = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.1, 2.8), yellowFrameMat);
            ceilMesh.position.set(0, 3.05, 0);
            ceilMesh.renderOrder = 1;
            this.carGroup.add(ceilMesh);

            // Car left wall (x = -1.4)
            const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.1, 3.0, 2.8), yellowFrameMat);
            leftWall.position.set(-1.4, 1.5, 0);
            leftWall.renderOrder = 1;
            this.carGroup.add(leftWall);

            // Car right wall (x = 1.4)
            const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.1, 3.0, 2.8), yellowFrameMat);
            rightWall.position.set(1.4, 1.5, 0);
            rightWall.renderOrder = 1;
            this.carGroup.add(rightWall);

            // Car solid back wall (z = -1.4)
            const backWall = new THREE.Mesh(new THREE.BoxGeometry(2.8, 3.0, 0.1), yellowSolidMat);
            backWall.position.set(0, 1.5, -1.4);
            backWall.renderOrder = 1;
            this.carGroup.add(backWall);

            // Car sliding doors on front (+Z = 1.4)
            // Left door (default closed x = -0.7)
            this.leftDoor = new THREE.Mesh(new THREE.BoxGeometry(1.35, 3.0, 0.08), doorMat);
            this.leftDoor.position.set(-0.7, 1.5, 1.4);
            this.leftDoor.renderOrder = 1;
            this.carGroup.add(this.leftDoor);

            // Right door (default closed x = 0.7)
            this.rightDoor = new THREE.Mesh(new THREE.BoxGeometry(1.35, 3.0, 0.08), doorMat);
            this.rightDoor.position.set(0.7, 1.5, 1.4);
            this.rightDoor.renderOrder = 1;
            this.carGroup.add(this.rightDoor);

            // Destination panel on back-right wall (x = 1.3, z = 0.5)
            const panelGeo = new THREE.BoxGeometry(0.05, 1.6, 0.6);
            const panelMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
            const destPanel = new THREE.Mesh(panelGeo, panelMat);
            destPanel.position.set(1.35, 1.5, 0.5);
            destPanel.renderOrder = 1;
            this.carGroup.add(destPanel);

            this.buttons = [];
            const offBtnMat = new THREE.MeshBasicMaterial({ color: 0x555555 });
            const onBtnMat = new THREE.MeshBasicMaterial({ color: 0x00ff88 });

            for (let f = 0; f < window.WORLD.FLOOR_COUNT; f++) {
                const btnGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.06, 12);
                btnGeo.rotateZ(Math.PI / 2);
                const btnMesh = new THREE.Mesh(btnGeo, offBtnMat);
                // Stack buttons vertically 0..5
                const by = 0.9 + f * 0.24;
                btnMesh.position.set(1.32, by, 0.5);
                btnMesh.renderOrder = 1;
                this.carGroup.add(btnMesh);
                this.buttons.push({ mesh: btnMesh, offMat: offBtnMat, onMat: onBtnMat });
            }

            // In-car floor indicator above doors looking back at passengers
            this.carTex = createDigitTexture("0");
            const carIndMat = new THREE.MeshBasicMaterial({ map: this.carTex });
            const carIndMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), carIndMat);
            carIndMesh.position.set(0, 2.5, 1.35);
            carIndMesh.rotation.y = Math.PI; // Faces interior (-Z)
            carIndMesh.renderOrder = 1;
            this.carGroup.add(carIndMesh);

            this.scene.add(this.carGroup);
        }

        // Delegate API methods to ElevatorLogic
        callUp(floor) { this.logic.callUp(floor); }
        callDown(floor) { this.logic.callDown(floor); }
        pressDestination(floor) { this.logic.pressDestination(floor); }
        isAcceptingAt(floor, dir) { return this.logic.isAcceptingAt(floor, dir); }
        currentCapacityFree() { return this.logic.currentCapacityFree(); }
        reserveBoardingSpot(person) { return this.logic.reserveBoardingSpot(person); }
        completeBoard(person) { this.logic.completeBoard(person); }
        registerDisembark(person) { this.logic.registerDisembark(person); }
        completeDisembark(person) { this.logic.completeDisembark(person); }
        reset() {
            this.logic.reset();
            this.carGroup.position.y = 0;
            this.leftDoor.position.x = -0.7;
            this.rightDoor.position.x = 0.7;
        }

        // Mirrors/Getters for UI and sim dispatch
        get state() { return this.logic.state; }
        get direction() { return this.logic.direction; }
        get currentFloor() { return this.logic.currentFloor; }
        get targetFloor() { return this.logic.targetFloor; }
        get upCalls() { return this.logic.upCalls; }
        get downCalls() { return this.logic.downCalls; }
        get destinations() { return this.logic.destinations; }
        get passengers() { return this.logic.passengers; }
        get pendingBoarders() { return this.logic.pendingBoarders; }
        get pendingDisembark() { return this.logic.pendingDisembark; }

        tick(dt) {
            this.logic.tick(dt);

            // Update Y position of car
            this.carGroup.position.y = this.logic.currentY;

            // Update sliding doors (open offset = 0.65)
            const slide = 0.65 * this.logic.doorProgress;
            this.leftDoor.position.x = -0.7 - slide;
            this.rightDoor.position.x = 0.7 + slide;

            // Update interior destination panel button lights
            for (let f = 0; f < this.buttons.length; f++) {
                const b = this.buttons[f];
                b.mesh.material = this.logic.destinations.has(f) ? b.onMat : b.offMat;
            }

            // Indicator text formatting (e.g. "3^", "2v", "0")
            const dirSymbol = this.logic.direction > 0 ? "^" : (this.logic.direction < 0 ? "v" : "");
            const fStr = String(this.logic.currentFloor) + dirSymbol;

            updateDigitTexture(this.carTex, fStr);

            // Update floor call panels and shaft-side indicators
            if (this.world && this.world.floors) {
                for (let f = 0; f < this.world.floors.length; f++) {
                    const fl = this.world.floors[f];
                    if (fl.callPanel) {
                        fl.callPanel.setUp(this.logic.upCalls.has(f));
                        fl.callPanel.setDown(this.logic.downCalls.has(f));
                        fl.callPanel.setIndicator(fStr);
                    }
                    if (fl.shaftIndicator) {
                        fl.shaftIndicator.setIndicator(fStr);
                    }
                }
            }
        }
    }

    window.Elevator = Elevator;
})();
