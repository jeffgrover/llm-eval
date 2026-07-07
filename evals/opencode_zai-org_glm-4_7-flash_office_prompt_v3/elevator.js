const Elevator = {
    create: function() {
        const elevator = new THREE.Group();
        elevator.userData = {
            currentFloor: 0,
            targetFloor: null,
            state: 'idle',
            direction: 0,
            doorsOpen: false,
            doorsClosed: true,
            waiting: false,
            passengers: [],
            callTime: null
        };

        const carWidth = 2.2;
        const carDepth = 1.8;
        const carHeight = 2.6;

        const car = new THREE.Group();
        car.position.y = carHeight / 2;

        const carMesh = new THREE.Mesh(
            new THREE.BoxGeometry(carWidth, carHeight, carDepth),
            new THREE.MeshLambertMaterial({ color: 0x8b9dc3 })
        );
        car.add(carMesh);

        const floorMesh = new THREE.Mesh(
            new THREE.BoxGeometry(carWidth, 0.1, carDepth),
            new THREE.MeshLambertMaterial({ color: 0x5d6d7e })
        );
        floorMesh.position.y = 0.05;
        car.add(floorMesh);

        const ceilingMesh = new THREE.Mesh(
            new THREE.BoxGeometry(carWidth, 0.1, carDepth),
            new THREE.MeshLambertMaterial({ color: 0x5d6d7e })
        );
        ceilingMesh.position.y = carHeight - 0.05;
        car.add(ceilingMesh);

        const leftDoor = new THREE.Group();
        leftDoor.position.set(-carWidth / 2 + 0.1, carHeight / 2, 0);
        car.add(leftDoor);

        const rightDoor = new THREE.Group();
        rightDoor.position.set(carWidth / 2 - 0.1, carHeight / 2, 0);
        car.add(rightDoor);

        const doorWidth = 0.8;
        const doorHeight = carHeight - 0.3;
        const doorDepth = 0.05;

        const leftDoorMesh = new THREE.Mesh(
            new THREE.BoxGeometry(doorWidth, doorHeight, doorDepth),
            new THREE.MeshLambertMaterial({ color: 0x34495e })
        );
        leftDoor.add(leftDoorMesh);

        const rightDoorMesh = new THREE.Mesh(
            new THREE.BoxGeometry(doorWidth, doorHeight, doorDepth),
            new THREE.MeshLambertMaterial({ color: 0x34495e })
        );
        rightDoor.add(rightDoorMesh);

        const indicator = new THREE.Group();
        indicator.position.set(0, carHeight / 2 + 0.3, carDepth / 2 + 0.1);
        car.add(indicator);

        const indicatorMesh = new THREE.Mesh(
            new THREE.BoxGeometry(0.6, 0.3, 0.05),
            new THREE.MeshLambertMaterial({ color: 0x2ecc71 })
        );
        indicator.add(indicatorMesh);

        const indicatorText = new THREE.Mesh(
            new THREE.BoxGeometry(0.5, 0.2, 0.05),
            new THREE.MeshBasicMaterial({ color: 0xffffff })
        );
        indicatorText.position.set(0, 0.15, 0.03);
        indicator.add(indicatorText);

        elevator.userData.car = car;
        elevator.userData.leftDoor = leftDoor;
        elevator.userData.rightDoor = rightDoor;
        elevator.userData.indicator = indicator;

        return elevator;
    },

    update: function(elevator, dt) {
        const { currentFloor, targetFloor, state, doorsOpen, waiting, passengers } = elevator.userData;

        if (state === 'moving') {
            const floorHeight = WORLD.FLOOR_HEIGHT;
            const speed = 3;
            const direction = targetFloor > currentFloor ? 1 : -1;

            elevator.position.y += direction * speed * dt;

            if (Math.abs(elevator.position.y - targetFloor * floorHeight) < speed * dt) {
                elevator.position.y = targetFloor * floorHeight;
                elevator.userData.currentFloor = targetFloor;
                elevator.userData.state = 'doorsOpening';
                elevator.userData.targetFloor = null;
                elevator.userData.direction = 0;
            }
        } else if (state === 'doorsOpening') {
            const doorSpeed = 2;
            const leftDoor = elevator.userData.leftDoor;
            const rightDoor = elevator.userData.rightDoor;

            if (!elevator.userData.doorsOpen) {
                leftDoor.position.x += doorSpeed * dt;
                rightDoor.position.x -= doorSpeed * dt;
                elevator.userData.doorsOpen = true;
                elevator.userData.doorsClosed = false;

                if (Math.abs(leftDoor.position.x) > 0.4) {
                    elevator.userData.state = 'doorsOpen';
                }
            }
        } else if (state === 'doorsOpen') {
            const openDuration = 1;
            if (Date.now() - elevator.userData.callTime > openDuration * 1000) {
                elevator.userData.state = 'doorsClosing';
                elevator.userData.doorsClosed = true;
            }
        } else if (state === 'doorsClosing') {
            const doorSpeed = 2;
            const leftDoor = elevator.userData.leftDoor;
            const rightDoor = elevator.userData.rightDoor;

            if (elevator.userData.doorsClosed) {
                leftDoor.position.x -= doorSpeed * dt;
                rightDoor.position.x += doorSpeed * dt;

                if (Math.abs(leftDoor.position.x) < 0.1) {
                    elevator.userData.state = 'idle';
                    elevator.userData.waiting = false;
                }
            }
        } else if (state === 'idle' && waiting) {
            elevator.userData.state = 'doorsOpening';
            elevator.userData.doorsOpen = false;
            elevator.userData.doorsClosed = true;
            elevator.userData.callTime = Date.now();
        }

        const indicator = elevator.userData.indicator;
        const indicatorMesh = indicator.children[0];
        const indicatorText = indicator.children[1];

        if (targetFloor !== null) {
            indicatorMesh.material.color.setHex(0xe74c3c);
            indicatorText.material.color.setHex(0x000000);
        } else if (state === 'idle') {
            indicatorMesh.material.color.setHex(0x2ecc71);
            indicatorText.material.color.setHex(0xffffff);
        } else {
            indicatorMesh.material.color.setHex(0xf39c12);
            indicatorText.material.color.setHex(0x000000);
        }
    }
};

window.Elevator = Elevator;