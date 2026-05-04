(function(root) {
    class Elevator {
        constructor(scene, world) {
            this.scene = scene;
            this.world = world;
            this.logic = new ElevatorLogic({
                floorCount: world.WORLD.FLOOR_COUNT,
                maxCapacity: 4,
                floorHeight: world.WORLD.FLOOR_HEIGHT
            });
            
            this.createCar();
            this.createDoors();
            this.createIndicators();
            this.createButtons();
        }

        createCar() {
            this.carGroup = new THREE.Group();
            this.carGroup.renderOrder = 1;
            
            const mat = new THREE.MeshPhongMaterial({ 
                color: 0xffff00, 
                opacity: 0.5, 
                transparent: true,
                depthWrite: false,
                side: THREE.DoubleSide
            });
            
            const floor = new THREE.Mesh(
                new THREE.BoxGeometry(2.8, 0.2, 2.8),
                mat
            );
            this.carGroup.add(floor);
            
            const ceiling = new THREE.Mesh(
                new THREE.BoxGeometry(2.8, 0.2, 2.8),
                mat
            );
            ceiling.position.y = 2.4;
            this.carGroup.add(ceiling);
            
            const sideMat = new THREE.MeshPhongMaterial({ 
                color: 0xffff00, 
                opacity: 0.4, 
                transparent: true,
                depthWrite: false,
                side: THREE.DoubleSide
            });
            
            const backWall = new THREE.Mesh(
                new THREE.BoxGeometry(2.8, 2.2, 0.1),
                sideMat
            );
            backWall.position.set(0, 1.1, -1.35);
            this.carGroup.add(backWall);
            
            this.scene.add(this.carGroup);
        }

        createDoors() {
            const doorMat = new THREE.MeshPhongMaterial({ 
                color: 0xffff00, 
                opacity: 0.7, 
                transparent: true,
                depthWrite: false,
                side: THREE.DoubleSide
            });
            
            this.leftDoor = new THREE.Mesh(
                new THREE.BoxGeometry(1.35, 2.2, 0.15),
                doorMat
            );
            this.leftDoor.position.set(-0.68, 1, 1.35);
            this.carGroup.add(this.leftDoor);
            
            this.rightDoor = new THREE.Mesh(
                new THREE.BoxGeometry(1.35, 2.2, 0.15),
                doorMat
            );
            this.rightDoor.position.set(0.68, 1, 1.35);
            this.carGroup.add(this.rightDoor);
            
            this.doorOpen = false;
            this.doorOpenAmount = 0;
        }

        createIndicators() {
            const tex = createTextTexture('0');
            const mat = new THREE.MeshPhongMaterial({ map: tex, transparent: true });
            const geom = new THREE.PlaneGeometry(0.6, 0.6);
            
            this.carIndicator = new THREE.Mesh(geom, mat);
            this.carIndicator.position.set(0, 2.1, -1.4);
            this.carGroup.add(this.carIndicator);
            
            this.carIndicator.userData = {
                tex,
                setIndicator: (text) => {
                    updateTextTexture(tex, text);
                }
            };
        }

        createButtons() {
            const buttonGroup = new THREE.Group();
            
            const buttonMatOff = new THREE.MeshPhongMaterial({ color: 0x333333 });
            const buttonMatOn = new THREE.MeshPhongMaterial({ 
                color: 0x22aa22,
                emissive: 0x22aa22,
                emissiveIntensity: 0.8
            });
            
            this.buttons = [];
            for (let i = 0; i < this.world.WORLD.FLOOR_COUNT; i++) {
                const btn = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.12, 0.12, 0.08, 8),
                    buttonMatOff
                );
                btn.position.set(-0.8 + (i % 3) * 0.5, 1.8 - Math.floor(i / 3) * 0.5, -1.35);
                btn.userData = { floor: i, lit: false };
                buttonGroup.add(btn);
                this.buttons.push(btn);
            }
            
            this.carGroup.add(buttonGroup);
        }

        callUp(floor) { this.logic.callUp(floor); }
        callDown(floor) { this.logic.callDown(floor); }
        pressDestination(floor) { this.logic.pressDestination(floor); }
        isAcceptingAt(floor, direction) { return this.logic.isAcceptingAt(floor, direction); }
        currentCapacityFree() { return this.logic.currentCapacityFree(); }
        reserveBoardingSpot(person) { return this.logic.reserveBoardingSpot(person); }
        completeBoard(person) { this.logic.completeBoard(person); }
        registerDisembark(person) { this.logic.registerDisembark(person); }
        completeDisembark(person) { this.logic.completeDisembark(person); }
        reset() { this.logic.reset(); }

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
            
            this.carGroup.position.y = this.logic.positionY;
            
            this.updateDoors(dt);
            this.updateIndicators();
        }

        updateDoors(dt) {
            const isOpen = this.logic.state === 'DOOR_OPEN' || this.logic.state === 'DOOR_OPENING';
            const targetOpen = isOpen ? 1 : 0;
            
            if (this.doorOpenAmount < targetOpen) {
                this.doorOpenAmount = Math.min(1, this.doorOpenAmount + dt * 2);
            } else if (this.doorOpenAmount > targetOpen) {
                this.doorOpenAmount = Math.max(0, this.doorOpenAmount - dt * 3);
            }
            
            const offset = this.doorOpenAmount * 0.65;
            this.leftDoor.position.x = -0.68 - offset;
            this.rightDoor.position.x = 0.68 + offset;
        }

        updateIndicators() {
            const floorText = String(this.logic.currentFloor) + 
                (this.logic.direction > 0 ? '^' : this.logic.direction < 0 ? 'v' : '');
            this.carIndicator.userData.setIndicator(floorText);
            
            for (const btn of this.buttons) {
                const isLit = this.logic.destinations.has(btn.userData.floor);
                const mat = isLit ? 
                    new THREE.MeshPhongMaterial({ 
                        color: 0x22aa22,
                        emissive: 0x22aa22,
                        emissiveIntensity: 0.8
                    }) :
                    new THREE.MeshPhongMaterial({ color: 0x333333 });
                btn.material = mat;
            }
        }
    }

    function createTextTexture(text) {
        const size = 256;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        
        ctx.fillStyle = '#050505';
        ctx.fillRect(0, 0, size, size);
        
        ctx.fillStyle = '#ffbb22';
        ctx.font = 'bold 180px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = '#ffbb22';
        ctx.shadowBlur = 20;
        ctx.fillText(text, size / 2, size / 2);
        
        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.anisotropy = 16;
        texture._lastText = text;
        return texture;
    }

    function updateTextTexture(texture, text) {
        if (texture._lastText === text) return;
        texture._lastText = text;
        const size = texture.image.width;
        const ctx = texture.image.getContext('2d');
        ctx.fillStyle = '#050505';
        ctx.fillRect(0, 0, size, size);
        ctx.fillStyle = '#ffbb22';
        ctx.font = 'bold 180px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = '#ffbb22';
        ctx.shadowBlur = 20;
        ctx.fillText(text, size / 2, size / 2);
        texture.needsUpdate = true;
    }

    root.Elevator = Elevator;
})(typeof window !== 'undefined' ? window : globalThis);