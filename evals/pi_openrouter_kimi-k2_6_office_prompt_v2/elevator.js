(function() {
    class Elevator {
        constructor(scene, world) {
            this.scene = scene;
            this.world = world;
            this.logic = new ElevatorLogic({});
            this.carGroup = new THREE.Group();
            this.carGroup.renderOrder = 1;
            scene.add(this.carGroup);

            this.W = 2.2; this.D = 2.2; this.H = 2.8;
            this.buildCar();
            this._spotMap = new Map(); // person -> spot index
        }

        buildCar() {
            const g = this.carGroup;
            const fh = WORLD.FLOOR_HEIGHT;
            const carMat = new THREE.MeshLambertMaterial({ color: 0xffcc00, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide });
            const solidMat = new THREE.MeshLambertMaterial({ color: 0xffcc00 });
            const doorMat = new THREE.MeshLambertMaterial({ color: 0xffdd44, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide });

            // Floor
            g.add((()=>{const m=new THREE.Mesh(new THREE.BoxGeometry(this.W,0.1,this.D),carMat); m.position.y=0.05; return m;})());
            // Ceiling
            g.add((()=>{const m=new THREE.Mesh(new THREE.BoxGeometry(this.W,0.1,this.D),carMat); m.position.y=this.H-0.05; return m;})());
            // Left wall
            g.add((()=>{const m=new THREE.Mesh(new THREE.BoxGeometry(0.05,this.H,this.D),carMat); m.position.x=-this.W/2+0.025; m.position.y=this.H/2; return m;})());
            // Right wall
            g.add((()=>{const m=new THREE.Mesh(new THREE.BoxGeometry(0.05,this.H,this.D),carMat); m.position.x=this.W/2-0.025; m.position.y=this.H/2; return m;})());
            // Back wall (opaque)
            g.add((()=>{const m=new THREE.Mesh(new THREE.BoxGeometry(this.W,this.H,0.05),solidMat); m.position.z=-this.D/2+0.025; m.position.y=this.H/2; return m;})());

            // Doors (front, +Z)
            this.leftDoor = new THREE.Mesh(new THREE.BoxGeometry(this.W/2, this.H-0.2, 0.05), doorMat);
            this.leftDoor.position.set(-this.W/4, this.H/2, this.D/2-0.025);
            g.add(this.leftDoor);

            this.rightDoor = new THREE.Mesh(new THREE.BoxGeometry(this.W/2, this.H-0.2, 0.05), doorMat);
            this.rightDoor.position.set(this.W/4, this.H/2, this.D/2-0.025);
            g.add(this.rightDoor);

            // Destination panel on back-right wall
            this.destButtons = [];
            const btnOff = new THREE.MeshLambertMaterial({ color: 0x333333 });
            const btnOn = new THREE.MeshBasicMaterial({ color: 0x00ff44 });
            for (let i=0; i<WORLD.FLOOR_COUNT; i++) {
                const b = new THREE.Mesh(new THREE.CylinderGeometry(0.1,0.1,0.04,12), btnOff.clone());
                b.position.set(this.W/2 - 0.25, 0.3 + i*0.42, -this.D/2 + 0.06);
                b.rotation.x = Math.PI/2;
                g.add(b);
                this.destButtons.push({ mesh: b, onMat: btnOn, offMat: btnOff });
            }

            // In-car indicator
            const tex = createInCarIndicator('0');
            this.inCarIndicator = tex;
            tex.position.set(0, this.H - 0.35, this.D/2 - 0.06);
            g.add(tex);
        }

        callUp(floor) { this.logic.callUp(floor); }
        callDown(floor) { this.logic.callDown(floor); }
        pressDestination(floor) { this.logic.pressDestination(floor); }
        isAcceptingAt(floor, direction) { return this.logic.isAcceptingAt(floor, direction); }
        currentCapacityFree() { return this.logic.currentCapacityFree(); }
        reserveBoardingSpot(person) {
            const spot = this.logic.reserveBoardingSpot(person);
            if (spot) {
                // find index
                for (let i=0;i<this.logic.spots.length;i++) {
                    if (Math.abs(this.logic.spots[i].x - spot.x) < 1e-6) {
                        this._spotMap.set(person, i); break;
                    }
                }
            }
            return spot;
        }
        completeBoard(person) { this.logic.completeBoard(person); }
        registerDisembark(person) { this.logic.registerDisembark(person); }
        completeDisembark(person) {
            this.logic.completeDisembark(person);
            const idx = this._spotMap.get(person);
            if (idx !== undefined) {
                this.logic.spotOccupied[idx] = false;
                this._spotMap.delete(person);
            }
        }
        reset() { this.logic.reset(); this._spotMap.clear(); }
        tick(dt) {
            this.logic.tick(dt);
            // Sync car y to logic's tracked position
            this.carGroup.position.y = this.logic.carY;

            // Update doors
            const ratio = this.logic.doorOpenRatio;
            const doorMaxSlide = this.W/2 - 0.05;
            this.leftDoor.position.x = -this.W/4 - ratio * doorMaxSlide;
            this.rightDoor.position.x = this.W/4 + ratio * doorMaxSlide;

            // Update call panels and shaft indicators
            for (let f=0; f<WORLD.FLOOR_COUNT; f++) {
                const fl = this.world.floors[f];
                const panel = fl.callPanel;
                panel.userData.setUp(this.logic.upCalls.has(f));
                panel.userData.setDown(this.logic.downCalls.has(f));
                panel.userData.setIndicator(String(this.logic.currentFloor));
                fl.shaftIndicator.userData.setText(String(this.logic.currentFloor));
            }

            // In-car indicator
            const dirStr = this.logic.direction > 0 ? '^' : (this.logic.direction < 0 ? 'v' : '-');
            this.inCarIndicator.userData.setText(`${this.logic.currentFloor}${dirStr}`);

            // Destination buttons
            for (let i=0;i<WORLD.FLOOR_COUNT;i++) {
                const on = this.logic.destinations.has(i);
                this.destButtons[i].mesh.material = on ? this.destButtons[i].onMat : this.destButtons[i].offMat;
            }
        }

        get state() { return this.logic.state; }
        get currentFloor() { return this.logic.currentFloor; }
        get targetFloor() { return this.logic.targetFloor; }
        get direction() { return this.logic.direction; }
        get upCalls() { return this.logic.upCalls; }
        get downCalls() { return this.logic.downCalls; }
        get destinations() { return this.logic.destinations; }
        get passengers() { return this.logic.passengers; }
        get pendingBoarders() { return this.logic.pendingBoarders; }
        get pendingDisembark() { return this.logic.pendingDisembark; }
    }

    window.Elevator = Elevator;
})();
