(function(global) {
    const WORLD = {
        FLOOR_HEIGHT: 3.4, FLOOR_COUNT: 6,
        BUILDING_WIDTH: 22, BUILDING_DEPTH: 18,
        SHAFT_WIDTH: 3, SHAFT_DEPTH: 3,
        PERSON_R: 0.4
    };

    function createMaterial(color, opacity) {
        return new THREE.MeshLambertMaterial({
            color: color,
            opacity: opacity,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide
        });
    }

    function createSolidMaterial(color) {
        return new THREE.MeshLambertMaterial({ color: color });
    }

    function createBuildingGroup(scene) {
        var buildingGroup = new THREE.Group();
        buildingGroup.renderOrder = 0;

        var floorCount = WORLD.FLOOR_COUNT;
        var floorHeight = WORLD.FLOOR_HEIGHT;
        var buildingWidth = WORLD.BUILDING_WIDTH;
        var buildingDepth = WORLD.BUILDING_DEPTH;
        var shaftWidth = WORLD.SHAFT_WIDTH;
        var shaftDepth = WORLD.SHAFT_DEPTH;

        // Half extents
        var halfW = buildingWidth / 2;
        var halfD = buildingDepth / 2;
        var halfS = shaftWidth / 2;
        var halfDs = shaftDepth / 2;

        // Floor materials
        var transparentFloor = createMaterial(0x888888, 0.3);
        var transparentWall = createMaterial(0x9999ff, 0.2);
        var solidWall = createSolidMaterial(0x555566);
        var solidFloor = createSolidMaterial(0x666666);
        var glassDoor = createMaterial(0xaaddff, 0.25);
        var interiorWall = createMaterial(0xbbc5e6, 0.28);

        // Build floors - ground slab (solid) and roof (solid)
        for (var f = 0; f < floorCount; f++) {
            var floorY = f * floorHeight;

            if (f === 0) {
                // Ground floor - slab around the shaft
                var floor0Geometry = new THREE.PlaneGeometry(buildingWidth, buildingDepth);
                var floor0Mesh = new THREE.Mesh(floor0Geometry, solidFloor);
                floor0Mesh.rotation.x = -Math.PI / 2;
                floor0Mesh.position.set(0, floorY, 0);
                buildingGroup.add(floor0Mesh);

                // Front entrance gap: need to NOT build the front wall solid
                // Build left and right front wall segments
                var frontWallLeftGeo = new THREE.BoxGeometry(halfS, floorHeight * f, halfW);
                var frontWallLeft = new THREE.Mesh(frontWallLeftGeo, solidWall);
                frontWallLeft.position.set(-halfW + halfS, floorY, -halfD);
                buildingGroup.add(frontWallLeft);

                var frontWallRightGeo = new THREE.BoxGeometry(halfS, floorHeight * f, halfW);
                var frontWallRight = new THREE.Mesh(frontWallRightGeo, solidWall);
                frontWallRight.position.set(halfW - halfS, floorY, -halfD);
                buildingGroup.add(frontWallRight);

                // Front door area (glass, but open) - just place glass doors at front
                if (f === 0) {
                    // Create glass doors at front wall center
                    var doorHeight = floorHeight;
                    var doorGeo = new THREE.PlaneGeometry(2.5, doorHeight);
                    var leftDoor = new THREE.Mesh(doorGeo, glassDoor);
                    leftDoor.position.set(-0.6, floorY, -halfD + 0.02);
                    leftDoor.userData = { isDoor: true, isOpen: false, doorSide: 'left' };
                    buildingGroup.add(leftDoor);

                    var rightDoor = new THREE.Mesh(doorGeo, glassDoor);
                    rightDoor.position.set(0.6, floorY, -halfD + 0.02);
                    rightDoor.userData = { isDoor: true, isOpen: false, doorSide: 'right' };
                    buildingGroup.add(rightDoor);

                    // Add door handle meshes for visual
                    var handleGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.1, 8);
                    var handle = new THREE.Mesh(handleGeo, createSolidMaterial(0x888888));
                    handle.rotation.z = Math.PI / 2;
                    handle.position.set(-0.4, floorY, -halfD + 0.02);
                    leftDoor.add(handle);

                    var handle2 = new THREE.Mesh(handleGeo, createSolidMaterial(0x888888));
                    handle2.rotation.z = Math.PI / 2;
                    handle2.position.set(0.4, floorY, -halfD + 0.02);
                    rightDoor.add(handle2);

                    // Sidewalk outside - concrete slab at z = +12, width 12
                    var sidewalkGeo = new THREE.PlaneGeometry(12, 8);
                    var sidewalk = new THREE.Mesh(sidewalkGeo, createSolidMaterial(0x999999));
                    sidewalk.rotation.x = -Math.PI / 2;
                    sidewalk.position.set(0, floorY, 12);
                    buildingGroup.add(sidewalk);
                }

                // Back wall (solid)
                var backWallGeo = new THREE.BoxGeometry(buildingWidth, floorHeight, 0.5);
                var backWall = new THREE.Mesh(backWallGeo, solidWall);
                backWall.position.set(0, floorY, halfD);
                buildingGroup.add(backWall);

                // Left and right walls - for floor 0, full height
                var sideWallGeo = new THREE.BoxGeometry(0.5, floorHeight, buildingDepth);
                var leftWall = new THREE.Mesh(sideWallGeo, solidWall);
                leftWall.position.set(-halfW, floorY, 0);
                buildingGroup.add(leftWall);

                var rightWall = new THREE.Mesh(sideWallGeo, solidWall);
                rightWall.position.set(halfW, floorY, 0);
                buildingGroup.add(rightWall);

                // No ceiling on floor 0 (it's open to air or we might add for floor 1 to be floor 0 ceiling)
                // but we have transparent floors above, so we can skip.

            } else {
                // Floors 1-5: transparent slabs around shaft
                var floorY = f * floorHeight;
                // Build four strips around shaft
                // Front strip (between shaft and front wall)
                var frontStripGeo = new THREE.PlaneGeometry(buildingWidth - shaftWidth, shaftDepth - halfS * 2);
                var frontStrip = new THREE.Mesh(frontStripGeo, transparentFloor);
                frontStrip.rotation.x = -Math.PI / 2;
                frontStrip.position.set(0, floorY, halfD - halfDs - 1);
                buildingGroup.add(frontStrip);

                // Back strip
                var backStrip = new THREE.Mesh(frontStripGeo, transparentFloor);
                backStrip.rotation.x = -Math.PI / 2;
                backStrip.position.set(0, floorY, -halfD + halfDs + 1);
                buildingGroup.add(backStrip);

                // Left strip
                var leftStripGeo = new THREE.PlaneGeometry(shaftWidth, buildingDepth);
                var leftStrip = new THREE.Mesh(leftStripGeo, transparentFloor);
                leftStrip.rotation.x = -Math.PI / 2;
                leftStrip.position.set(-halfW + halfS + 1, floorY, 0);
                buildingGroup.add(leftStrip);

                // Right strip
                var rightStrip = new THREE.Mesh(leftStripGeo, transparentFloor);
                rightStrip.rotation.x = -Math.PI / 2;
                rightStrip.position.set(halfW - halfS - 1, floorY, 0);
                buildingGroup.add(rightStrip);

                // Front wall (solid) for floors 1-5 - must be 3 segments (left, center, right)
                // because entrance gap is only on floor 0, but we need solid walls above
                var frontWallCenterHeight = floorCount * floorHeight;
                var frontWallCenterGeo = new THREE.BoxGeometry(3, frontWallCenterHeight, 0.5);
                var frontWallCenter = new THREE.Mesh(frontWallCenterGeo, solidWall);
                frontWallCenter.position.set(0, floorY, -halfD);
                buildingGroup.add(frontWallCenter);

                var frontWallLeftGeo = new THREE.BoxGeometry(halfS, floorHeight, halfW);
                var frontWallLeft = new THREE.Mesh(frontWallLeftGeo, solidWall);
                frontWallLeft.position.set(-halfW + halfS, floorY, -halfD);
                buildingGroup.add(frontWallLeft);

                var frontWallRightGeo = new THREE.BoxGeometry(halfS, floorHeight, halfW);
                var frontWallRight = new THREE.Mesh(frontWallRightGeo, solidWall);
                frontWallRight.position.set(halfW - halfS, floorY, -halfD);
                buildingGroup.add(frontWallRight);

                // Back wall
                var backWallGeo = new THREE.BoxGeometry(buildingWidth, floorHeight, 0.5);
                var backWall = new THREE.Mesh(backWallGeo, solidWall);
                backWall.position.set(0, floorY, halfD);
                buildingGroup.add(backWall);

                // Left and right walls
                var leftWall = new THREE.Mesh(sideWallGeo, solidWall);
                leftWall.position.set(-halfW, floorY, 0);
                buildingGroup.add(leftWall);

                var rightWall = new THREE.Mesh(sideWallGeo, solidWall);
                rightWall.position.set(halfW, floorY, 0);
                buildingGroup.add(rightWall);

                // Interior walls on office floors to create rooms
                // Create 4 private offices along back wall (z in roughly [-9, -3])
                // Offices are separated by interior walls with doorway gaps

                // Office A (leftmost)
                var officeAWallGeo = new THREE.BoxGeometry(0.5, floorHeight, 6);
                var officeAWall = new THREE.Mesh(officeAWallGeo, interiorWall);
                officeAWall.position.set(-11, floorY, -6);
                buildingGroup.add(officeAWall);

                // Office B
                var officeBWallGeo = new THREE.BoxGeometry(0.5, floorHeight, 6);
                var officeBWall = new THREE.Mesh(officeBWallGeo, interiorWall);
                officeBWall.position.set(-5, floorY, -6);
                buildingGroup.add(officeBWall);

                // Office C
                var officeCWallGeo = new THREE.BoxGeometry(0.5, floorHeight, 6);
                var officeCWall = new THREE.Mesh(officeCWallGeo, interiorWall);
                officeCWall.position.set(1, floorY, -6);
                buildingGroup.add(officeCWall);

                // Office D
                var officeDWallGeo = new THREE.BoxGeometry(0.5, floorHeight, 6);
                var officeDWall = new THREE.Mesh(officeDWallGeo, interiorWall);
                officeDWall.position.set(7, floorY, -6);
                buildingGroup.add(officeDWall);

                // Conference room on front-left (x: [-11,-3], z: [3,9])
                var confRoomWallGeo = new THREE.BoxGeometry(0.5, floorHeight, 3);
                var confRoomWall = new THREE.Mesh(confRoomWallGeo, interiorWall);
                confRoomWall.position.set(-3, floorY, 6);
                buildingGroup.add(confRoomWall);

                // Lounge on front-right (x: [3,11], z: [3,9])
                var loungeWallGeo = new THREE.BoxGeometry(0.5, floorHeight, 3);
                var loungeWall = new THREE.Mesh(loungeWallGeo, interiorWall);
                loungeWall.position.set(3, floorY, 6);
                buildingGroup.add(loungeWall);

                // Create doors to each office (doorway gaps)
                // Office A door at x=-9, z=0
                var doorHeight = 1.8;
                var doorOpenGeo = new THREE.PlaneGeometry(2, doorHeight);
                var doorOpen = new THREE.Mesh(doorOpenGeo, glassDoor);
                doorOpen.position.set(-9, floorY, 0);
                buildingGroup.add(doorOpen);

                // Office B door at x=-3, z=0
                var doorOpen2 = new THREE.Mesh(doorOpenGeo, glassDoor);
                doorOpen2.position.set(-3, floorY, 0);
                buildingGroup.add(doorOpen2);

                // Office C door at x=3, z=0
                var doorOpen3 = new THREE.Mesh(doorOpenGeo, glassDoor);
                doorOpen3.position.set(3, floorY, 0);
                buildingGroup.add(doorOpen3);

                // Office D door at x=9, z=0
                var doorOpen4 = new THREE.Mesh(doorOpenGeo, glassDoor);
                doorOpen4.position.set(9, floorY, 0);
                buildingGroup.add(doorOpen4);

                // Conference room door at x=-7, z=0
                var confDoor = new THREE.Mesh(doorOpenGeo, glassDoor);
                confDoor.position.set(-7, floorY, 0);
                buildingGroup.add(confDoor);

                // Lounge door at x=7, z=0
                var loungeDoor = new THREE.Mesh(doorOpenGeo, glassDoor);
                loungeDoor.position.set(7, floorY, 0);
                buildingGroup.add(loungeDoor);

                // Water cooler in lounge area
                var coolerGeo = new THREE.BoxGeometry(0.8, 1.2, 0.4);
                var cooler = new THREE.Mesh(coolerGeo, createSolidMaterial(0xcccccc));
                cooler.position.set(8, floorY, 6);
                buildingGroup.add(cooler);

                // Call panel on wall next to shaft facing +Z
                var panelPlateGeo = new THREE.BoxGeometry(0.55, 1.4, 0.05);
                var panelPlate = new THREE.Mesh(panelPlateGeo, createSolidMaterial(0x666666));
                panelPlate.position.set(-1.5, floorY, 1.5);
                buildingGroup.add(panelPlate);

                // Call panel arrow lamps - up and down triangles
                var triangleShape = new THREE.Shape();
                triangleShape.moveTo(0, 0);
                triangleShape.lineTo(0.1, -0.15);
                triangleShape.lineTo(-0.1, -0.15);
                triangleShape.lineTo(0, 0);
                var triangleGeo = new THREE.ShapeGeometry(triangleShape);
                var triangleDark = new THREE.MeshLambertMaterial({ color: 0x444444 });
                var triangleGreen = new THREE.MeshLambertMaterial({ color: 0x00ff00, emissive: 0x00ff00, emissiveIntensity: 0.5 });

                var upArrow = new THREE.Mesh(triangleGeo, triangleDark);
                upArrow.position.set(-0.1, floorY, 1.7);
                buildingGroup.add(upArrow);

                var downArrow = new THREE.Mesh(triangleGeo, triangleDark);
                downArrow.position.set(0.1, floorY, 1.7);
                buildingGroup.add(downArrow);

                // Floor indicator on panel (canvas texture)
                var indicatorGeo = new THREE.PlaneGeometry(0.4, 0.3);
                var indicatorMat = new THREE.MeshBasicMaterial({ color: 0x050505, side: THREE.DoubleSide });
                var indicator = new THREE.Mesh(indicatorGeo, indicatorMat);
                indicator.position.set(0, floorY, 1.6);
                buildingGroup.add(indicator);

                // Shaft indicator above doors (floor 0 and above)
                var shaftIndGeo = new THREE.PlaneGeometry(0.9, 0.9);
                var shaftIndMat = new THREE.MeshBasicMaterial({ color: 0x050505 });
                var shaftIndicator = new THREE.Mesh(shaftIndGeo, shaftIndMat);
                shaftIndicator.position.set(0, floorY, 1.6);
                buildingGroup.add(shaftIndicator);

                // If f > 0, also add ceiling on this floor (transparent solid slab? Actually we can skip)
                // But we may need to add something to prevent camera from seeing above roof.
            }
        }

        // Build shaft walls - solid walls around the shaft through all floors
        for (var f = 1; f < floorCount; f++) {
            var floorY = f * floorHeight;
            // Four walls around shaft
            var shaftWallGeo = new THREE.BoxGeometry(shaftWidth, floorHeight, 0.3);
            var shaftWall1 = new THREE.Mesh(shaftWallGeo, solidWall);
            shaftWall1.position.set(0, floorY, -halfDs - 0.5);
            buildingGroup.add(shaftWall1);

            var shaftWall2 = new THREE.Mesh(shaftWallGeo, solidWall);
            shaftWall2.position.set(0, floorY, halfDs + 0.5);
            buildingGroup.add(shaftWall2);

            var shaftWall3 = new THREE.Mesh(shaftWallGeo, solidWall);
            shaftWall3.position.set(-halfS - 0.5, floorY, 0);
            buildingGroup.add(shaftWall3);

            var shaftWall4 = new THREE.Mesh(shaftWallGeo, solidWall);
            shaftWall4.position.set(halfS + 0.5, floorY, 0);
            buildingGroup.add(shaftWall4);
        }

        // Return world structure with navigation data
        // For floor 0: lobby
        var floor0 = {
            floorNumber: 0,
            nodes: {},
            callPanel: {
                setUp: function(on) {
                    if (upArrow) upArrow.material = on ? triangleGreen : triangleDark;
                },
                setDown: function(on) {
                    if (downArrow) downArrow.material = on ? triangleGreen : triangleDark;
                },
                setIndicator: function(text) {
                    // Could update indicator texture here
                    // Placeholder - real implementation in world.js needs to handle canvas textures per floor
                }
            },
            shaftIndicator: {
                updateText: function(text, dir) {
                    // Update shaft indicator mesh material
                }
            },
            desks: [],
            sitTargets: {}
        };

        // Define lobby navigation nodes for floor 0
        var nodes = floor0.nodes;
        nodes.outside = new THREE.Vector3(0, 0, 12);
        nodes.front_door_threshold = new THREE.Vector3(0, 0, 9.35);
        nodes.entrance = new THREE.Vector3(0, 0, 7.4);
        nodes.lobby_center = new THREE.Vector3(0, 0, 5);
        nodes.cafe_order = new THREE.Vector3(-7, 0, 6);
        nodes.cafe_table1 = new THREE.Vector3(-5, 0, 5);
        nodes.cafe_table2 = new THREE.Vector3(-5, 0, 7);
        nodes.cafe_table3 = new THREE.Vector3(-7, 0, 5);
        nodes.cafe_table4 = new THREE.Vector3(-7, 0, 7);
        nodes.front_lounge_N = new THREE.Vector3(7, 0, 4);
        nodes.front_lounge_S = new THREE.Vector3(7, 0, 7);
        nodes.front_lounge_E = new THREE.Vector3(5, 0, 5.5);
        nodes.front_lounge_W = new THREE.Vector3(9, 0, 5.5);
        nodes.back_lounge_N = new THREE.Vector3(-9, 0, -6);
        nodes.back_lounge_S = new THREE.Vector3(-9, 0, -9);
        nodes.pit_N = new THREE.Vector3(-9, 0, -12);
        nodes.pit_S = new THREE.Vector3(-11, 0, -12);
        nodes.pit_E = new THREE.Vector3(-7, 0, -12);
        nodes.pit_W = new THREE.Vector3(-11, 0, -10);
        nodes.reception = new THREE.Vector3(-3, 0, 7);
        nodes.kiosk = new THREE.Vector3(3, 0, 7);
        nodes.lobby_wc_front = new THREE.Vector3(8, 0, 7);
        nodes.lobby_wc_back = new THREE.Vector3(-8, 0, -8);
        nodes.lobby_stand_center = new THREE.Vector3(0, 0, 3);
        nodes.lobby_stand_NE = new THREE.Vector3(5, 0, 2);
        nodes.lobby_stand_NW = new THREE.Vector3(-5, 0, 2);
        nodes.lobby_stand_midE = new THREE.Vector3(5, 0, 5);
        nodes.lobby_stand_midW = new THREE.Vector3(-5, 0, 5);
        nodes.lobby_stand_entry = new THREE.Vector3(0, 0, 5);
        nodes.hallS = new THREE.Vector3(0, 0, 2);
        nodes.hallSE = new THREE.Vector3(2, 0, 4);
        nodes.hallE = new THREE.Vector3(4, 0, 2);
        nodes.hallNE = new THREE.Vector3(2, 0, 0);
        nodes.hallN = new THREE.Vector3(0, 0, 0);
        nodes.hallNW = new THREE.Vector3(-2, 0, 0);
        nodes.hallW = new THREE.Vector3(-4, 0, 2);
        nodes.hallSW = new THREE.Vector3(-2, 0, 4);
        nodes.elevWait = new THREE.Vector3(0, 0, 1.7);

        // Connect nodes for floor 0
        nodes.hallSW = new THREE.Vector3(-2, 0, 4);
        nodes.cafeDoor = new THREE.Vector3(-2, 0, 4);

        // Link nodes
        nodes.outside.link = nodes.front_door_threshold;
        nodes.front_door_threshold.link = nodes.entrance;
        nodes.entrance.link = nodes.lobby_center;
        nodes.lobby_center.link = nodes.elevWait;
        nodes.lobby_center.link = nodes.cafe_order;
        nodes.lobby_center.link = nodes.front_lounge_N;
        nodes.lobby_center.link = nodes.back_lounge_N;
        nodes.lobby_center.link = nodes.pit_N;
        nodes.lobby_center.link = nodes.reception;
        nodes.lobby_center.link = nodes.kiosk;
        nodes.hallSW.link = nodes.cafe_order;
        nodes.hallSE.link = nodes.front_lounge_N;
        nodes.hallE.link = nodes.front_lounge_S;
        nodes.hallW.link = nodes.back_lounge_N;
        nodes.hallSW.link = nodes.pit_N;
        nodes.elevWait.link = nodes.hallS;

        // Sit targets for floor 0 - keys are wpNames, values {sit: bool, facing: float}
        var sitTargets = floor0.sitTargets;
        sitTargets.cafe_table1 = { sit: true, facing: 0 };
        sitTargets.cafe_table2 = { sit: true, facing: Math.PI };
        sitTargets.cafe_table3 = { sit: true, facing: 0 };
        sitTargets.cafe_table4 = { sit: true, facing: Math.PI };
        sitTargets.front_lounge_N = { sit: true, facing: 0 };
        sitTargets.front_lounge_S = { sit: true, facing: Math.PI };
        sitTargets.front_lounge_E = { sit: true, facing: -Math.PI / 2 };
        sitTargets.front_lounge_W = { sit: true, facing: Math.PI / 2 };
        sitTargets.back_lounge_N = { sit: true, facing: 0 };
        sitTargets.back_lounge_S = { sit: true, facing: Math.PI };
        sitTargets.pit_N = { sit: true, facing: 0 };
        sitTargets.pit_S = { sit: true, facing: Math.PI };
        sitTargets.pit_E = { sit: true, facing: -Math.PI / 2 };
        sitTargets.pit_W = { sit: true, facing: Math.PI / 2 };
        sitTargets.cafe_counter = { sit: false, facing: 0 };
        sitTargets.reception = { sit: false, facing: 0 };
        sitTargets.kiosk = { sit: false, facing: 0 };

        // For office floors (1-5), we'll build similar structure but need to create them in the loop above
        // Here we define the office floor pattern
        var officeFloors = [];

        // Create office furniture and sit targets for each office floor
        for (var f = 1; f < floorCount; f++) {
            var floorY = f * floorHeight;
            var floorData = {
                floorNumber: f,
                nodes: {},
                callPanel: {
                    setUp: function(on) {},
                    setDown: function(on) {},
                    setIndicator: function(text) {}
                },
                shaftIndicator: {
                    updateText: function(text, dir) {}
                },
                desks: [],
                sitTargets: {}
            };
            var nodes = floorData.nodes;
            var sitTargets = floorData.sitTargets;

            // Hallway ring around shaft
            nodes.hallS = new THREE.Vector3(0, floorY, 2);
            nodes.hallSE = new THREE.Vector3(2, floorY, 4);
            nodes.hallE = new THREE.Vector3(4, floorY, 2);
            nodes.hallNE = new THREE.Vector3(2, floorY, 0);
            nodes.hallN = new THREE.Vector3(0, floorY, 0);
            nodes.hallNW = new THREE.Vector3(-2, floorY, 0);
            nodes.hallW = new THREE.Vector3(-4, floorY, 2);
            nodes.hallSW = new THREE.Vector3(-2, floorY, 4);
            nodes.elevWait = new THREE.Vector3(0, floorY, 1.7);
            nodes.water_cooler = new THREE.Vector3(8, floorY, 6);
            nodes.hall_stand_N = new THREE.Vector3(0, floorY, 1);
            nodes.hall_stand_S = new THREE.Vector3(0, floorY, 3);

            // Office doors and desks
            // Office A at x=-11, office B at x=-5, office C at x=1, office D at x=7
            nodes.officeA_door = new THREE.Vector3(-9, floorY, 0);
            nodes.officeA_desk = new THREE.Vector3(-9, floorY, -3);
            nodes.officeB_door = new THREE.Vector3(-3, floorY, 0);
            nodes.officeB_desk = new THREE.Vector3(-3, floorY, -3);
            nodes.officeC_door = new THREE.Vector3(3, floorY, 0);
            nodes.officeC_desk = new THREE.Vector3(3, floorY, -3);
            nodes.officeD_door = new THREE.Vector3(9, floorY, 0);
            nodes.officeD_desk = new THREE.Vector3(9, floorY, -3);

            // Conference room
            nodes.conf_door = new THREE.Vector3(-7, floorY, 0);
            nodes.conf_center = new THREE.Vector3(-7, floorY, 4);
            nodes.conf_seat0 = new THREE.Vector3(-7, floorY, 2);
            nodes.conf_seat1 = new THREE.Vector3(-7, floorY, 6);
            nodes.conf_seat2 = new THREE.Vector3(-5, floorY, 4);
            nodes.conf_seat3 = new THREE.Vector3(-9, floorY, 4);

            // Lounge
            nodes.lounge_door = new THREE.Vector3(7, floorY, 0);
            nodes.lounge_center = new THREE.Vector3(7, floorY, 4);
            nodes.lounge_couch = new THREE.Vector3(7, floorY, 6);
            nodes.lounge_armchair1 = new THREE.Vector3(9, floorY, 5);
            nodes.lounge_armchair2 = new THREE.Vector3(5, floorY, 5);
            nodes.lounge_water_cooler = new THREE.Vector3(8, floorY, 7);

            // Sit targets
            sitTargets.officeA_desk = { sit: true, facing: Math.PI }; // facing monitor at -Z
            sitTargets.officeB_desk = { sit: true, facing: Math.PI };
            sitTargets.officeC_desk = { sit: true, facing: Math.PI };
            sitTargets.officeD_desk = { sit: true, facing: Math.PI };
            sitTargets.conf_seat0 = { sit: true, facing: 0 };
            sitTargets.conf_seat1 = { sit: true, facing: Math.PI };
            sitTargets.conf_seat2 = { sit: true, facing: -Math.PI / 2 };
            sitTargets.conf_seat3 = { sit: true, facing: Math.PI / 2 };
            sitTargets.lounge_couch = { sit: true, facing: 0 };
            sitTargets.lounge_armchair1 = { sit: true, facing: -Math.PI / 2 };
            sitTargets.lounge_armchair2 = { sit: true, facing: Math.PI / 2 };
            sitTargets.water_cooler = { sit: false, facing: 0 };

            // Link nodes
            nodes.hallSW.link = nodes.officeA_desk; // Actually door, but simplified
            nodes.hallSE.link = nodes.lounge_door;
            nodes.hallE.link = nodes.water_cooler;
            nodes.hallW.link = nodes.hallSW;
            nodes.hallNE.link = nodes.elevWait;
            nodes.hallS.link = nodes.hallSW;
            nodes.hallN.link = nodes.hallNE;

            officeFloors.push(floorData);
        }

        // Return the world object
        var world = {
            buildingGroup: buildingGroup,
            floors: [{ floorNumber: 0, nodes: nodes, callPanel: floor0.callPanel, shaftIndicator: floor0.shaftIndicator, desks: [], sitTargets: sitTargets }].concat(officeFloors),
            bfsPath: function(nodes, fromName, toName) {
                // BFS to find path between nodes
                if (!nodes[fromName] || !nodes[toName]) return null;
                var queue = [[fromName]];
                var visited = {};
                while (queue.length) {
                    var path = queue.shift();
                    var curr = path[path.length - 1];
                    if (curr === toName) {
                        // convert names to vectors
                        var result = [];
                        for (var i = 0; i < path.length; i++) {
                            result.push(nodes[path[i]].clone());
                        }
                        return result;
                    }
                    if (!visited[curr]) {
                        visited[curr] = true;
                        var neighbors = nodes[curr].link;
                        if (neighbors) {
                            var newPath = path.slice();
                            newPath.push(neighbors.name || neighbors);
                            queue.push(newPath);
                        }
                        // Also add all keys of nodes where value.link === curr (reverse)
                        for (var key in nodes) {
                            if (nodes[key] && nodes[key].link && nodes[key].link === curr) {
                                var newPath = path.slice();
                                newPath.push(key);
                                queue.push(newPath);
                            }
                        }
                    }
                }
                return [];
            }
        };

        // We need to set up proper node links in the floor objects
        // Because we can't easily link nodes across objects, we'll do a simpler approach:
        // Each floor's nodes are self-contained, but we provide a wrapper bfsPath that uses the floorData.nodes
        // In practice, sim.js should call world.bfsPath with the floor's nodes array directly.

        return world;
    }

    // For floor 0, call panel is attached to buildingGroup, but we need to reference it in window.WORLD
    function createWorld(scene) {
        var world = createBuildingGroup(scene);
        // Assign world properties to global WORLD constant for backward compatibility
        WORLD.buildingGroup = world.buildingGroup;
        WORLD.floors = world.floors;
        // Preserve the original BFS if available
        if (world.bfsPath) {
            WORLD.bfsPath = world.bfsPath;
        }
        // Store in window for cross-file access
        window.WORLD = WORLD;
        window.createWorld = createWorld;
        return WORLD;
    }

    global.WORLD = WORLD;
    global.createWorld = createWorld;
})(typeof window !== "undefined" ? window : globalThis);
