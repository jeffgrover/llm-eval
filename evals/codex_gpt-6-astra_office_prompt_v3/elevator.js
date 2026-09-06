(function () {
    'use strict';
    class Elevator {
        constructor(scene, world) {
            this.world = world;
            this.logic = new window.ElevatorLogic({ floorCount: window.WORLD.FLOOR_COUNT, maxCapacity: 4, floorHeight: window.WORLD.FLOOR_HEIGHT });
            this.car = new THREE.Group(); this.car.name = 'Four-person elevator'; this.car.renderOrder = 1; scene.add(this.car);
            const yellow = new THREE.MeshLambertMaterial({ color: 0xe8bc51, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide });
            const back = new THREE.MeshLambertMaterial({ color: 0xbb8f31, side: THREE.DoubleSide });
            const doorMat = new THREE.MeshLambertMaterial({ color: 0xf1cd72, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide });
            const addBox = (x,y,z,w,h,d,mat) => {
                const mesh = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mat);
                mesh.position.set(x,y,z); mesh.renderOrder = 1; this.car.add(mesh); return mesh;
            };
            addBox(0,-0.055,0,2.88,0.11,2.88,yellow); addBox(0,2.65,0,2.88,0.11,2.88,yellow);
            addBox(-1.41,1.3,0,0.06,2.6,2.8,yellow); addBox(1.41,1.3,0,0.06,2.6,2.8,yellow);
            addBox(0,1.3,-1.41,2.8,2.6,0.06,back);
            this.doors = [-1,1].map((side) => addBox(side * 0.7,1.25,1.44,1.4,2.5,0.065,doorMat));
            addBox(1.06,1.35,-1.35,0.48,1.27,0.055,back);
            this.buttons = [];
            for (let i = 0; i < window.WORLD.FLOOR_COUNT; i++) {
                const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.073,0.073,0.045,10), new THREE.MeshBasicMaterial({ color: 0x635932 }));
                mesh.rotation.x = Math.PI / 2; mesh.position.set(1.06,0.9 + i * 0.19,-1.29); this.car.add(mesh); this.buttons.push(mesh);
            }
            const tex = window.createTextTexture('0');
            const indicator = new THREE.Mesh(new THREE.PlaneGeometry(0.6,0.6),new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
            indicator.position.set(0,2.29,1.35); indicator.rotation.y = Math.PI; this.car.add(indicator); this.indicatorTexture = tex;
            this.car.traverse((object) => { object.renderOrder = 1; });
            ['state','direction','currentFloor','targetFloor','upCalls','downCalls','destinations','passengers','pendingBoarders','pendingDisembark','spotOccupancy','maxCapacity'].forEach((key) => {
                Object.defineProperty(this,key,{ get: () => this.logic[key] });
            });
            this.updateVisuals();
        }
        callUp(floor) { this.logic.callUp(floor); }
        callDown(floor) { this.logic.callDown(floor); }
        pressDestination(floor) { this.logic.pressDestination(floor); }
        isAcceptingAt(floor,dir) { return this.logic.isAcceptingAt(floor,dir); }
        currentCapacityFree() { return this.logic.currentCapacityFree(); }
        reserveBoardingSpot(person) {
            const spot = this.logic.reserveBoardingSpot(person);
            return spot ? new THREE.Vector3(spot.x,spot.y,spot.z) : null;
        }
        completeBoard(person) { return this.logic.completeBoard(person); }
        registerDisembark(person) { this.logic.registerDisembark(person); }
        completeDisembark(person) { this.logic.completeDisembark(person); }
        reset() { this.logic.reset(); this.updateVisuals(); }
        tick(dt) { this.logic.tick(dt); this.updateVisuals(); }
        updateVisuals() {
            this.car.position.y = this.logic.positionY;
            const amount = this.logic.doorAmount;
            this.doors[0].position.x = -0.7 - amount * 1.32; this.doors[1].position.x = 0.7 + amount * 1.32;
            const lampKey = [this.currentFloor,this.direction,[...this.upCalls].join(','),[...this.downCalls].join(','),[...this.destinations].join(',')].join('|');
            if (lampKey === this.lastLampKey) return;
            this.lastLampKey = lampKey;
            const label = String(this.currentFloor) + (this.direction > 0 ? '↑' : this.direction < 0 ? '↓' : '');
            this.world.floors.forEach((floor) => {
                floor.callPanel.userData.setUp(this.upCalls.has(floor.floorNumber));
                floor.callPanel.userData.setDown(this.downCalls.has(floor.floorNumber));
                floor.callPanel.userData.setIndicator(String(this.currentFloor));
                floor.shaftIndicator.userData.setIndicator(label);
            });
            this.buttons.forEach((button, i) => { button.material.color.setHex(this.destinations.has(i) ? 0x9effb4 : 0x635932); });
            window.updateTextTexture(this.indicatorTexture,label);
        }
    }
    window.Elevator = Elevator;
})();
