    // Utility function for floor Y coordinate (added above)
    const Y_FLOOR_LEVEL = (i) => i * FLOOR_HEIGHT;

    // Elevator movement logic
    function moveElevator(targetFloor) {
        const targetY = Y_FLOOR_LEVEL(targetFloor);
        const currentY = elevatorCar.position.y;
        const distance = Math.abs(targetY - currentY);
        
        // Calculate movement vector
        const direction = targetY > currentY ? 1 : -1;
        let travelDistance = 0;

        function updateCarPosition() {
            if (travelDistance < distance) {
                const step = ELEVATOR_SPEED * animationSpeed * 0.016; // Scale speed by frame time (assuming 60fps target)
                
                if (direction === 1) {
                    elevatorCar.position.y += step;
                } else {
                    elevatorCar.position.y -= step;
                }
                
                travelDistance += step;
                requestAnimationFrame(updateCarPosition);
            } else {
                // Reached target floor
                elevatorCar.position.y = targetY;
                elevatorMoving = false;
                console.log("Elevator arrived at floor: " + targetFloor);
                // Trigger next step (e.g., open doors)
                if (currentTask === 'traveling') {
                    currentTask = 'boarding';
                    isDoorsOpen = true;
                    // Start door animation if needed
                }
            }
        }
        updateCarPosition();
    }

    // Door animation (Simplified sliding for now)
    function animateDoors(isOpen) {
        // Implementation of door movement (sliding on X-axis)
        const targetX = isOpen ? 0 : SHAFT_WIDTH * 0.4 / 2; // Doors retract fully or meet in middle
        
        const updateDoorPosition = () => {
            const currentXLeft = elevatorCar.leftDoor.position.x;
            const targetXLeft = isOpen ? 0 : -SHAFT_WIDTH * 0.4 / 2; // Needs refinement based on door geometry
            
            // Simplified: just set position for now, full animation will be complex
            elevatorCar.leftDoor.position.x = isOpen ? 0 : SHAFT_WIDTH * 0.2;
            elevatorCar.rightDoor.position.x = isOpen ? 0 : -SHAFT_WIDTH * 0.2;
            
            if (isOpen) {
                isDoorsOpen = true;
            } else {
                isDoorsOpen = false;
            }
        };
        
        updateDoorPosition();
    }

    // Reparenting logic (H8)
    function boardPerson(person) {
        // Boarding (scene -> elevator): preserves world position using attach()
        elevatorCar.attach(person);
        console.log(person.name + " boarded elevator.");
    }

    function exitPerson(person) {
        // Exiting (elevator -> scene): preserves world position using attach()
        scene.attach(person);
        console.log(person.name + " exited elevator.");
    }
