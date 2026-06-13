/* elevator.js — Three.js elevator car, doors, indicators, and adapter around ElevatorLogic */

(function (root) {
    const THREE = root.THREE;
    const ElevatorLogic = root.ElevatorLogic;

    class Elevator {
        constructor(scene, world) {
            this.scene = scene;
            this.world = world;
            this.logic = new ElevatorLogic({
                floorCount: root.WORLD.FLOOR_COUNT,
                maxCapacity: 4,
                floorHeight: root.WORLD.FLOOR_HEIGHT
            });

            this.carGroup = new THREE.Group();
            this.carGroup.renderOrder = 1;
            scene.add(this.carGroup);

            this.carW = 2.4;
            this.carD = 2.4;
            this.carH = 2.8;

            const frameMat = new THREE.MeshLambertMaterial({
                color: 0xffcc00, transparent: true, opacity: 0.5,
                depthWrite: false, side: THREE.DoubleSide
            });
            const doorMat = new THREE.MeshLambertMaterial({
                color: 0xffdd44, transparent: true, opacity: 0.7,
                depthWrite: false, side: THREE.DoubleSide
            });
            const solidYellow = new THREE.MeshLambertMaterial({ color: 0xffcc00 });

            const floor = new THREE.Mesh(new THREE.BoxGeometry(this.carW, 0.1, this.carD), frameMat);
            floor.position.y = 0.05;
            floor.renderOrder = 1;
            this.carGroup.add(floor);

            const ceiling = new THREE.Mesh(new THREE.BoxGeometry(this.carW, 0.1, this.carD), frameMat);
            ceiling.position.y = this.carH - 0.05;
            ceiling.renderOrder = 1;
            this.carGroup.add(ceiling);

            const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.1, this.carH, this.carD), frameMat);
            leftWall.position.set(-this.carW / 2 + 0.05, this.carH / 2, 0);
            leftWall.renderOrder = 1;
            this.carGroup.add(leftWall);

            const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.1, this.carH, this.carD), frameMat);
            rightWall.position.set(this.carW / 2 - 0.05, this.carH / 2, 0);
            rightWall.renderOrder = 1;
            this.carGroup.add(rightWall);

            const backWall = new THREE.Mesh(new THREE.BoxGeometry(this.carW, this.carH, 0.1), solidYellow);
            backWall.position.set(0, this.carH / 2, -this.carD / 2 + 0.05);
            backWall.renderOrder = 1;
            this.carGroup.add(backWall);

            this.doorL = new THREE.Mesh(new THREE.BoxGeometry(this.carW / 2 - 0.05, this.carH - 0.2, 0.08), doorMat);
            this.doorL.position.set(-this.carW / 4, this.carH / 2, this.carD / 2 - 0.04);
            this.doorL.renderOrder = 1;
            this.carGroup.add(this.doorL);

            this.doorR = new THREE.Mesh(new THREE.BoxGeometry(this.carW / 2 - 0.05, this.carH - 0.2, 0.08), doorMat);
            this.doorR.position.set(this.carW / 4, this.carH / 2, this.carD / 2 - 0.04);
            this.doorR.renderOrder = 1;
            this.carGroup.add(this.doorR);

            // Destination panel buttons
            this.buttons = [];
            const btnGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.04, 16);
            const btnOff = new THREE.MeshLambertMaterial({ color: 0x333333 });
            const btnOn = new THREE.MeshBasicMaterial({ color: 0x33ff33 });
            for (let f = 0; f < root.WORLD.FLOOR_COUNT; f++) {
                const btn = new THREE.Mesh(btnGeo, btnOff.clone());
                btn.rotation.x = Math.PI / 2;
                btn.position.set(0.85, 0.7 + f * 0.35, -this.carD / 2 + 0.1);
                btn.renderOrder = 1;
                this.carGroup.add(btn);
                this.buttons.push({ mesh: btn, off: btnOff, on: btnOn });
            }

            // In-car floor indicator
            const indGeo = new THREE.PlaneGeometry(0.6, 0.6);
            const indTex = root.createTextTexture ? root.createTextTexture("0") : null;
            // Fallback if texture helper not loaded yet
            const indMat = new THREE.MeshBasicMaterial({
                color: 0xffbb22,
                transparent: true, depthWrite: false, side: THREE.DoubleSide
            });
            if (indTex) indMat.map = indTex;
            this.inCarIndicator = new THREE.Mesh(indGeo, indMat);
            this.inCarIndicator.position.set(0, this.carH - 0.45, this.carD / 2 - 0.1);
            this.inCarIndicator.rotation.y = Math.PI;
            this.inCarIndicator.renderOrder = 1;
            this.carGroup.add(this.inCarIndicator);

            // Car-local interior spot offsets (match ElevatorLogic)
            this.spotOffsets = [
                new THREE.Vector3(-0.55, 0, 0.55),
                new THREE.Vector3(0.55, 0, 0.55),
                new THREE.Vector3(-0.55, 0, -0.55),
                new THREE.Vector3(0.55, 0, -0.55)
            ];

            // Mirror logic state for HUD
            this.state = this.logic.state;
            this.direction = this.logic.direction;
            this.currentFloor = this.logic.currentFloor;
            this.targetFloor = this.logic.targetFloor;
            this.upCalls = this.logic.upCalls;
            this.downCalls = this.logic.downCalls;
            this.destinations = this.logic.destinations;
            this.passengers = this.logic.passengers;
            this.pendingBoarders = this.logic.pendingBoarders;
            this.pendingDisembark = this.logic.pendingDisembark;
        }

        // Text texture helper reused from world.js if available; otherwise create inline
        _makeTexture(text) {
            if (root.createTextTexture) return root.createTextTexture(text);
            // Inline fallback (browser only)
            const canvas = document.createElement("canvas");
            canvas.width = 256; canvas.height = 256;
            const ctx = canvas.getContext("2d");
            ctx.fillStyle = "#050505"; ctx.fillRect(0, 0, 256, 256);
            ctx.shadowColor = "#ff8800"; ctx.shadowBlur = 18;
            ctx.fillStyle = "#ffbb22"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.font = "bold 190px system-ui, sans-serif";
            ctx.fillText(text, 128, 135);
            const tex = new THREE.CanvasTexture(canvas);
            tex._lastText = text;
            tex.minFilter = THREE.LinearFilter;
            tex.magFilter = THREE.LinearFilter;
            tex.generateMipmaps = true;
            tex.anisotropy = 4;
            return tex;
        }

        _updateIndicatorText(mesh, text) {
            if (!mesh.material.map || mesh.material.map._lastText !== text) {
                mesh.material.map = this._makeTexture(text);
            }
        }

        // Delegated API
        callUp(floor) { return this.logic.callUp(floor); }
        callDown(floor) { return this.logic.callDown(floor); }
        pressDestination(floor) { return this.logic.pressDestination(floor); }
        isAcceptingAt(floor, direction) { return this.logic.isAcceptingAt(floor, direction); }
        currentCapacityFree() { return this.logic.currentCapacityFree(); }
        reserveBoardingSpot(person) { return this.logic.reserveBoardingSpot(person); }
        completeBoard(person) { return this.logic.completeBoard(person); }
        registerDisembark(person) { return this.logic.registerDisembark(person); }
        completeDisembark(person) { return this.logic.completeDisembark(person); }
        reset() { return this.logic.reset(); }

        getSpotWorldPosition(index) {
            const local = this.spotOffsets[index];
            return this.carGroup.localToWorld(local.clone());
        }

        tick(dt) {
            this.logic.tick(dt);

            // Sync state for HUD
            this.state = this.logic.state;
            this.direction = this.logic.direction;
            this.currentFloor = this.logic.currentFloor;
            this.targetFloor = this.logic.targetFloor;
            this.upCalls = this.logic.upCalls;
            this.downCalls = this.logic.downCalls;
            this.destinations = this.logic.destinations;
            this.passengers = this.logic.passengers;
            this.pendingBoarders = this.logic.pendingBoarders;
            this.pendingDisembark = this.logic.pendingDisembark;

            // Car position
            this.carGroup.position.y = this.logic.y;

            // Doors
            const open = this.logic.doorOpen;
            const halfTravel = this.carW / 2 - 0.15;
            this.doorL.position.x = -this.carW / 4 - open * halfTravel;
            this.doorR.position.x = this.carW / 4 + open * halfTravel;

            // Indicators
            const dirChar = this.logic.direction > 0 ? "^" : (this.logic.direction < 0 ? "v" : "-");
            const text = `${this.logic.currentFloor}${dirChar}`;
            this._updateIndicatorText(this.inCarIndicator, text);
            for (const floorObj of this.world.floors) {
                floorObj.shaftIndicator.userData.setIndicator(text);
            }

            // Call panel lamps
            for (const floorObj of this.world.floors) {
                floorObj.callPanel.userData.setUp(this.logic.upCalls.has(floorObj.floorNumber));
                floorObj.callPanel.userData.setDown(this.logic.downCalls.has(floorObj.floorNumber));
            }

            // Destination buttons
            this.buttons.forEach((b, f) => {
                b.mesh.material.color.setHex(this.logic.destinations.has(f) ? 0x33ff33 : 0x333333);
            });
        }
    }

    root.Elevator = Elevator;
})(typeof window !== "undefined" ? window : globalThis);
