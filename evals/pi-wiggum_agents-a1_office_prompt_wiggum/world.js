// world.js - Building geometry, per-floor layouts, furniture, navigation graph, call panels

(function() {
    const WORLD = {
        FLOOR_HEIGHT: 3.4,
        FLOOR_COUNT: 6,
        BUILDING_WIDTH: 22,
        BUILDING_DEPTH: 18,
        SHAFT_WIDTH: 3,
        SHAFT_DEPTH: 3,
        PERSON_R: 0.4
    };
    // Make halfShaft globally accessible for functions that need it
    const halfShaft = WORLD.SHAFT_WIDTH / 2;

    // Materials
    const SOLID_GRAY = new THREE.MeshLambertMaterial({ color: 0x888888 });
    const TRANSP_FLOOR = new THREE.MeshLambertMaterial({ 
        color: 0xaaaaaa, 
        opacity: 0.3, 
        depthWrite: false, 
        side: THREE.DoubleSide 
    });
    const TRANSP_WALL = new THREE.MeshLambertMaterial({ 
        color: 0x9999ff, 
        opacity: 0.2, 
        depthWrite: false, 
        side: THREE.DoubleSide 
    });
    const INTERIOR_WALL = new THREE.MeshLambertMaterial({ 
        color: 0xbbc5e6, 
        opacity: 0.28, 
        depthWrite: false, 
        side: THREE.DoubleSide 
    });

    // Helper function to build conference room (moved outside createWorld)
    function buildConferenceRoom(floorY, shaftX, shaftZ, nodes, sitTargets) {
        const halfD = WORLD.BUILDING_DEPTH / 2;
        const confDoorNode = 'conf_door';
        nodes[confDoorNode] = new Vector3WithNeighbors(-6, floorY, halfD - 0.5);
        nodes[confDoorNode].addNode('hallSW');

        const confCenterNode = 'conf_center';
        nodes[confCenterNode] = new Vector3WithNeighbors(-6, floorY, 0);
        nodes[confDoorNode].addNode(confCenterNode);

        // Conference table chairs (facing each other)
        for (let i = 0; i < 4; i++) {
            const seatNode = `conf_seat${i}`;
            if (i < 2) {
                new Vector3WithNeighbors(-6 + (i===0?-1:1), floorY, -2);
            } else {
                new Vector3WithNeighbors(-6 + (i===2?1:-1), floorY, 2);
            }
            nodes[confCenterNode].addNode(seatNode);
            sitTargets[seatNode] = {
                sit: true,
                facing: i < 2 ? Math.PI / 2 : -Math.PI / 2 // Face across table
            };
        }
    }

    function buildLoungeArea(floorY, shaftX, shaftZ, nodes, sitTargets) {
        const halfD = WORLD.BUILDING_DEPTH / 2;
        const loungeDoorNode = 'lounge_door';
        nodes[loungeDoorNode] = new Vector3WithNeighbors(6, floorY, halfD - 0.5);
        nodes[loungeDoorNode].addNode('hallSE');

        const loungeCenterNode = 'lounge_center';
        nodes[loungeCenterNode] = new Vector3WithNeighbors(6, floorY, 0);
        nodes[loungeDoorNode].addNode(loungeCenterNode);

        // Lounge seating
        sitTargets['lounge_spot0'] = { sit: true, facing: Math.PI };
        sitTargets['lounge_spot1'] = { sit: true, facing: 0 };
        sitTargets['lounge_spot2'] = { sit: true, facing: Math.PI / 2 };

        // Water cooler
        new Vector3WithNeighbors(8, floorY, -3);
    }

    function buildPrivateOffices(floorY, shaftX, shaftZ, nodes, sitTargets) {
        const halfD = WORLD.BUILDING_DEPTH / 2;
        const backWallZ = -halfD + 1;
        const offices = [
            { name: 'officeA', x: -8, z: -6 },
            { name: 'officeB', x: -5, z: -6 },
            { name: 'officeC', x: -2, z: -6 },
            { name: 'officeD', x: 1, z: -6 }
        ];

        for (const office of offices) {
            const doorNode = `${office.name}_door`;
            nodes[doorNode] = new Vector3WithNeighbors(office.x, floorY, backWallZ + 0.5);
            nodes[doorNode].addNode('hallSW'); // Link to hallway

            const deskNode = `${office.name}_desk`;
            nodes[deskNode] = new Vector3WithNeighbors(office.x, floorY, office.z - 1);
            nodes[doorNode].addNode(deskNode);

            sitTargets[deskNode] = {
                sit: true,
                facing: Math.PI, // Face monitor (-Z)
                desk: true
            };
        }
    }

    function createWorld(scene) {
        const buildingGroup = new THREE.Group();
        buildingGroup.renderOrder = 0;
        scene.add(buildingGroup);

        const floors = [];
        const shaftCenterX = 0;
        const shaftCenterZ = 0;

        // Ground slab (solid)
        const groundSlab = new THREE.Mesh(
            new THREE.PlaneGeometry(WORLD.BUILDING_WIDTH, WORLD.BUILDING_DEPTH),
            SOLID_GRAY
        );
        groundSlab.rotation.x = -Math.PI / 2;
        groundSlab.position.set(shaftCenterX, 0, shaftCenterZ);
        buildingGroup.add(groundSlab);

        // Roof (solid) - positioned on top of the building
        const roof = new THREE.Mesh(
            new THREE.PlaneGeometry(WORLD.BUILDING_WIDTH, WORLD.BUILDING_DEPTH),
            SOLID_GRAY
        );
        roof.rotation.x = -Math.PI / 2;
        roof.position.set(shaftCenterX, WORLD.FLOOR_HEIGHT * WORLD.FLOOR_COUNT, shaftCenterZ);
        buildingGroup.add(roof);

        // Build floors and walls
        for (let floorNum = 0; floorNum < WORLD.FLOOR_COUNT; floorNum++) {
            const floorY = floorNum * WORLD.FLOOR_HEIGHT;
            const floorData = buildFloor(buildingGroup, floorNum, floorY, shaftCenterX, shaftCenterZ);
            floors.push(floorData.floor);

            // Add floor geometry to buildingGroup
            buildingGroup.add(floorData.mesh);



            // Add call panel and shaft indicator to buildingGroup
            if (floorData.callPanel) {
                buildingGroup.add(floorData.callPanel);
                floorData.floor.callPanelMesh = floorData.callPanel;
            }
            if (floorData.shaftIndicator) {
                buildingGroup.add(floorData.shaftIndicator);
                floorData.floor.shaftIndicatorMesh = floorData.shaftIndicator;
            }
        }

        return {
            buildingGroup,
            floors
        };
    }

    // BFS pathfinding - exposed globally
    function bfsPath(nodes, fromName, toName) {
        if (!nodes || !nodes[fromName] || !nodes[toName]) return null;
        
        const queue = [[fromName]];
        const visited = new Set([fromName]);

        while (queue.length > 0) {
            const path = queue.shift();
            const current = path[path.length - 1];

            if (current === toName) {
                return path.map(name => nodes[name].clone());
            }

            const neighbors = nodes[current].neighbors || [];
            for (const neighbor of neighbors) {
                if (!visited.has(neighbor)) {
                    visited.add(neighbor);
                    queue.push([...path, neighbor]);
                }
            }
        }

        return null;
    }

    function buildFloor(buildingGroup, floorNum, floorY, shaftX, shaftZ) {
        const nodes = {};
        const sitTargets = {};
        let callPanel = null;
        let shaftIndicator = null;
        const floor = { floorNumber: floorNum, nodes: null, callPanel: null, shaftIndicator: null, desks: [], sitTargets: {} };
        let floorMesh = null; // Declare at function scope for all branches

        // Shaft opening - hole through all floors (except ground slab and roof handled separately)
        // For intermediate floors, we build four strips around the shaft

        if (floorNum > 0 && floorNum < WORLD.FLOOR_COUNT) {
            // Intermediate office floors (floors 1 to top)
            const floorWidth = WORLD.BUILDING_WIDTH;
            const floorDepth = WORLD.BUILDING_DEPTH;
            const halfW = floorWidth / 2;
            const halfD = floorDepth / 2;

            // Four strips around shaft opening
            const strips = [
                // Front strip (between shaft and front wall)
                { x: -halfW, y: floorY, z: shaftZ, w: floorWidth, h: WORLD.SHAFT_WIDTH / 2 + halfD, d: 0.1 },
                // Back strip
                { x: -halfW, y: floorY, z: shaftZ, w: floorWidth, h: WORLD.SHAFT_WIDTH / 2 + halfD, d: 0.1 },
                // Left strip
                { x: shaftX, y: floorY, z: -halfD, w: WORLD.SHAFT_WIDTH / 2 + halfW, h: floorDepth, d: 0.1 },
                // Right strip
                { x: shaftX, y: floorY, z: -halfD, w: WORLD.SHAFT_WIDTH / 2 + halfW, h: floorDepth, d: 0.1 }
            ];

            for (const s of strips) {
                const mesh = new THREE.Mesh(
                    new THREE.PlaneGeometry(s.w, s.h),
                    TRANSP_FLOOR
                );
                mesh.rotation.x = -Math.PI / 2;
                mesh.position.set(s.x, s.y, s.z);
                mesh.renderOrder = 0;
                buildingGroup.add(mesh);
                floorMesh = mesh; // Assign to outer scope variable
            }

            // Build walls for office floors
            buildOfficeFloorWalls(floorY, shaftX, shaftZ, nodes, sitTargets);

            // Build conference room
            buildConferenceRoom(floorY, shaftX, shaftZ, nodes, sitTargets);

            // Build lounge area
            buildLoungeArea(floorY, shaftX, shaftZ, nodes, sitTargets);

            // Build private offices
            buildPrivateOffices(floorY, shaftX, shaftZ, nodes, sitTargets);

            // Call panel next to shaft
            callPanel = createCallPanel(floorNum, floorY, shaftX, shaftZ);
            shaftIndicator = createShaftIndicator(floorNum, floorY, shaftX, shaftZ);

        } else if (floorNum === 0) {
            // Ground floor lobby
            const halfW = WORLD.BUILDING_WIDTH / 2;
            const halfD = WORLD.BUILDING_DEPTH / 2;

            // Full floor slab for lobby
            const lobbyFloor = new THREE.Mesh(
                new THREE.PlaneGeometry(WORLD.BUILDING_WIDTH, WORLD.BUILDING_DEPTH),
                TRANSP_FLOOR
            );
            lobbyFloor.rotation.x = -Math.PI / 2;
            lobbyFloor.position.set(shaftX, floorY, shaftZ);
            buildingGroup.add(lobbyFloor); // Add to building group
            floorMesh = lobbyFloor; // Assign to outer scope variable

            // Front wall with gap for entrance (3-unit wide)
            const frontWallSegments = [
                { x: -WORLD.BUILDING_WIDTH/2, z: halfD, w: WORLD.BUILDING_WIDTH/2 - 1.5, h: WORLD.FLOOR_HEIGHT * WORLD.FLOOR_COUNT },
                { x: WORLD.BUILDING_WIDTH/2 - 1.5, z: halfD, w: WORLD.BUILDING_WIDTH/2 - 1.5, h: WORLD.FLOOR_HEIGHT * WORLD.FLOOR_COUNT },
                // Header above gap for floors 1-5
                { x: -1.5, z: halfD, w: 3, h: WORLD.FLOOR_HEIGHT * (WORLD.FLOOR_COUNT - 1), y: WORLD.FLOOR_HEIGHT }
            ];

            for (const seg of frontWallSegments) {
                const wall = new THREE.Mesh(
                    new THREE.PlaneGeometry(seg.w, seg.h),
                    TRANSP_WALL
                );
                wall.position.set(seg.x, seg.y + WORLD.FLOOR_HEIGHT/2, seg.z);
                wall.rotation.y = 0;
            }

            // Side walls (full height)
            const sideWalls = [
                { x: -halfW, z: shaftZ, w: WORLD.SHAFT_WIDTH/2 + halfD, h: WORLD.FLOOR_HEIGHT * WORLD.FLOOR_COUNT },
                { x: halfW, z: shaftZ, w: WORLD.SHAFT_WIDTH/2 + halfD, h: WORLD.FLOOR_HEIGHT * WORLD.FLOOR_COUNT }
            ];

            for (const wall of sideWalls) {
                const mesh = new THREE.Mesh(
                    new THREE.PlaneGeometry(wall.w, wall.h),
                    TRANSP_WALL
                );
                mesh.position.set(wall.x, WORLD.FLOOR_HEIGHT/2, wall.z);
                mesh.rotation.y = 0;
            }

            // Back wall (solid)
            const backWall = new THREE.Mesh(
                new THREE.PlaneGeometry(WORLD.BUILDING_WIDTH, WORLD.FLOOR_HEIGHT * WORLD.FLOOR_COUNT),
                TRANSP_WALL
            );
            backWall.position.set(shaftX, WORLD.FLOOR_HEIGHT/2, -halfD);
            backWall.rotation.y = Math.PI;

            // Build lobby layout
            buildLobbyLayout(floorY, shaftX, shaftZ, nodes, sitTargets);

            // Call panel and shaft indicator for lobby
            callPanel = createCallPanel(floorNum, floorY, shaftX, shaftZ);
            shaftIndicator = createShaftIndicator(floorNum, floorY, shaftX, shaftZ);
        }

        // Set floor properties
        floor.nodes = nodes;
        floor.callPanel = callPanel;
        floor.shaftIndicator = shaftIndicator;
        floor.sitTargets = sitTargets;

        return { mesh: floorMesh, floor, nodes, callPanel, shaftIndicator, sitTargets };
    }

    function buildOfficeFloorWalls(floorY, shaftX, shaftZ, nodes, sitTargets) {
        const halfW = WORLD.BUILDING_WIDTH / 2;
        const halfD = WORLD.BUILDING_DEPTH / 2;
        const wallHeight = WORLD.FLOOR_HEIGHT;

        // Hallway ring around shaft - add corner nodes
        const hallNodes = ['hallS', 'hallSE', 'hallE', 'hallNE', 'hallN', 'hallNW', 'hallW', 'hallSW'];
        for (const node of hallNodes) {
            let pos;
            switch(node) {
                case 'hallS': pos = new Vector3WithNeighbors(0, floorY, halfD + 1); break;
                case 'hallSE': pos = new Vector3WithNeighbors(halfW/2, floorY, halfD + 1); break;
                case 'hallE': pos = new Vector3WithNeighbors(halfW/2, floorY, 0); break;
                case 'hallNE': pos = new Vector3WithNeighbors(halfW/2, floorY, -halfD/2); break;
                case 'hallN': pos = new Vector3WithNeighbors(0, floorY, -halfD - 1); break;
                case 'hallNW': pos = new Vector3WithNeighbors(-halfW/2, floorY, -halfD/2); break;
                case 'hallW': pos = new Vector3WithNeighbors(-halfW/2, floorY, 0); break;
                case 'hallSW': pos = new Vector3WithNeighbors(-halfW/2, floorY, halfD + 1); break;
            }
            if (pos) nodes[node] = pos;
        }

        // Elevator wait area in front of doors
        nodes['elevWait'] = new Vector3WithNeighbors(0, floorY, halfD + 2);
        nodes['hallS'].addNode('elevWait');

        // Interior walls for offices (back wall area)
        const backWallZ = -halfD + 1;
        const officeYRange = [-9, -3];
        
        // Office doors and desks
        const offices = [
            { name: 'officeA', x: -8, z: -6 },
            { name: 'officeB', x: -5, z: -6 },
            { name: 'officeC', x: -2, z: -6 },
            { name: 'officeD', x: 1, z: -6 }
        ];

        for (const office of offices) {
            const doorNode = `${office.name}_door`;
            nodes[doorNode] = new Vector3WithNeighbors(office.x, floorY, backWallZ + 0.5);
            nodes[doorNode].addNode('hallSW'); // Link to hallway

            const deskNode = `${office.name}_desk`;
            nodes[deskNode] = new Vector3WithNeighbors(office.x, floorY, office.z - 1);
            nodes[doorNode].addNode(deskNode);

            if (sitTargets) {
                sitTargets[deskNode] = {
                    sit: true,
                    facing: Math.PI, // Face monitor (-Z)
                    desk: true
                };
            }
        }

        // Conference room (front-left quadrant)
        const confDoorNode = 'conf_door';
        nodes[confDoorNode] = new Vector3WithNeighbors(-6, floorY, halfD - 0.5);
        nodes[confDoorNode].addNode('hallSW');

        const confCenterNode = 'conf_center';
        nodes[confCenterNode] = new Vector3WithNeighbors(-6, floorY, 0);
        nodes[confDoorNode].addNode(confCenterNode);

        // Conference table chairs (facing each other)
        for (let i = 0; i < 4; i++) {
            const seatNode = `conf_seat${i}`;
            if (i < 2) {
                new Vector3WithNeighbors(-6 + (i===0?-1:1), floorY, -2);
            } else {
                new Vector3WithNeighbors(-6 + (i===2?1:-1), floorY, 2);
            }
            nodes[confCenterNode].addNode(seatNode);
            if (sitTargets) {
                sitTargets[seatNode] = {
                    sit: true,
                    facing: i < 2 ? Math.PI / 2 : -Math.PI / 2 // Face across table
                };
            }
        }

        // Lounge area (front-right quadrant)
        const loungeDoorNode = 'lounge_door';
        nodes[loungeDoorNode] = new Vector3WithNeighbors(6, floorY, halfD - 0.5);
        nodes[loungeDoorNode].addNode('hallSE');

        const loungeCenterNode = 'lounge_center';
        nodes[loungeCenterNode] = new Vector3WithNeighbors(6, floorY, 0);
        nodes[loungeDoorNode].addNode(loungeCenterNode);

        // Lounge seating
        if (sitTargets) {
            sitTargets['lounge_spot0'] = { sit: true, facing: Math.PI };
            sitTargets['lounge_spot1'] = { sit: true, facing: 0 };
            sitTargets['lounge_spot2'] = { sit: true, facing: Math.PI / 2 };

            // Water cooler
            new Vector3WithNeighbors(8, floorY, -3);
        }
    }

    function buildLobbyLayout(floorY, shaftX, shaftZ, nodes, sitTargets) {
        const halfW = WORLD.BUILDING_WIDTH / 2;
        const halfD = WORLD.BUILDING_DEPTH / 2;

        // Entrance chain: outside -> front_door_threshold -> entrance -> lobby_center
        nodes['outside'] = new Vector3WithNeighbors(0, floorY, 12);
        nodes['front_door_threshold'] = new Vector3WithNeighbors(0, floorY, 9.35);
        nodes['entrance'] = new Vector3WithNeighbors(0, floorY, 7.4);
        nodes['lobby_center'] = new Vector3WithNeighbors(0, floorY, 3);

        // Link them in order
        nodes['outside'].addNode('front_door_threshold');
        nodes['front_door_threshold'].addNode('entrance');
        nodes['entrance'].addNode('lobby_center');
        nodes['lobby_center'].addNode('elevWait'); // Direct link to elevator

        // Cafe area (left side)
        nodes['cafe_table1'] = new Vector3WithNeighbors(-8, floorY, 6);
        nodes['cafe_table2'] = new Vector3WithNeighbors(-8, floorY, 4);
        nodes['cafe_table3'] = new Vector3WithNeighbors(-8, floorY, 2);

        sitTargets['cafe_table1'] = { sit: true, facing: Math.PI / 2 };
        sitTargets['cafe_table2'] = { sit: true, facing: -Math.PI / 2 };

        // Front lounge (right side)
        nodes['front_lounge_N'] = new Vector3WithNeighbors(8, floorY, 4);
        nodes['front_lounge_S'] = new Vector3WithNeighbors(8, floorY, 0);
        sitTargets['front_lounge_N'] = { sit: true, facing: Math.PI };
        sitTargets['front_lounge_S'] = { sit: true, facing: 0 };

        // Back lounge (Z < 0)
        nodes['back_lounge_N'] = new Vector3WithNeighbors(6, floorY, -4);
        nodes['back_lounge_S'] = new Vector3WithNeighbors(6, floorY, -8);
        sitTargets['back_lounge_N'] = { sit: true, facing: Math.PI };
        sitTargets['back_lounge_S'] = { sit: true, facing: 0 };

        // Conversation pit (back-left)
        nodes['pit_N'] = new Vector3WithNeighbors(-8, floorY, -6);
        nodes['pit_S'] = new Vector3WithNeighbors(-8, floorY, -10);
        nodes['pit_E'] = new Vector3WithNeighbors(-4, floorY, -8);
        nodes['pit_W'] = new Vector3WithNeighbors(-12, floorY, -8);
        sitTargets['pit_N'] = { sit: true, facing: Math.PI };
        sitTargets['pit_S'] = { sit: true, facing: 0 };
        sitTargets['pit_E'] = { sit: true, facing: -Math.PI / 2 };
        sitTargets['pit_W'] = { sit: true, facing: Math.PI / 2 };

        // Water coolers
        nodes['water_cooler1'] = new Vector3WithNeighbors(-6, floorY, 8);
        nodes['water_cooler2'] = new Vector3WithNeighbors(4, floorY, -6);

        // Reception desk (tucked to side)
        nodes['reception_desk'] = new Vector3WithNeighbors(-3, floorY, 6);

        // Info kiosk near entrance
        nodes['info_kiosk'] = new Vector3WithNeighbors(4, floorY, 7);

        // Generic loiter waypoints
        sitTargets['lobby_stand_center'] = { sit: false };
        sitTargets['lobby_stand_NE'] = { sit: false };
        sitTargets['lobby_stand_NW'] = { sit: false };
        sitTargets['lobby_stand_midE'] = { sit: false };
        sitTargets['lobby_stand_midW'] = { sit: false };
        sitTargets['lobby_stand_entry'] = { sit: false };

        // Add connections for loiter spots to main paths
        nodes['cafe_table1'].addNode('lobby_center');
        nodes['cafe_table2'].addNode('lobby_center');
        nodes['front_lounge_N'].addNode('lobby_center');
        nodes['front_lounge_S'].addNode('lobby_center');
        nodes['back_lounge_N'].addNode('lobby_center');
        nodes['back_lounge_S'].addNode('lobby_center');
        nodes['pit_N'].addNode('lobby_center');
        nodes['pit_S'].addNode('lobby_center');
        nodes['pit_E'].addNode('lobby_center');
        nodes['pit_W'].addNode('lobby_center');
    }

    function createCallPanel(floorNum, floorY, shaftX, shaftZ) {
        const panel = new THREE.Group();
        
        // Base plate
        const base = new THREE.Mesh(
            new THREE.BoxGeometry(0.55, 1.4, 0.05),
            new THREE.MeshLambertMaterial({ color: 0x888888 })
        );
        base.position.set(shaftX + halfShaft + 0.3, floorY + 1.2, shaftZ);
        panel.add(base);

        // Up arrow (flat ShapeGeometry triangle)
        const upShape = new THREE.Shape();
        upShape.moveTo(-0.13, 0);
        upShape.lineTo(0.13, 0);
        upShape.lineTo(0, 0.25);
        upShape.closePath();
        const upGeo = new THREE.ShapeGeometry(upShape);
        const upArrow = new THREE.Mesh(
            upGeo,
            new THREE.MeshLambertMaterial({ color: 0x888888 }) // Dark gray when off
        );
        upArrow.position.set(shaftX + halfShaft + 0.35, floorY + 1.6, shaftZ);
        panel.add(upArrow);

        // Down arrow
        const downShape = new THREE.Shape();
        downShape.moveTo(-0.13, 0);
        downShape.lineTo(0.13, 0);
        downShape.lineTo(0, -0.25);
        downShape.closePath();
        const downGeo = new THREE.ShapeGeometry(downShape);
        const downArrow = new THREE.Mesh(
            downGeo,
            new THREE.MeshLambertMaterial({ color: 0x888888 })
        );
        downArrow.position.set(shaftX + halfShaft + 0.35, floorY + 0.8, shaftZ);
        panel.add(downArrow);

        // Floor indicator (canvas texture)
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#050505';
        ctx.fillRect(0, 0, 256, 256);
        
        const indicatorMat = new THREE.MeshLambertMaterial({ 
            map: new THREE.CanvasTexture(canvas),
            depthWrite: false
        });
        const indicator = new THREE.Mesh(
            new THREE.PlaneGeometry(0.45, 0.45),
            indicatorMat
        );
        indicator.position.set(shaftX + halfShaft + 0.35, floorY + 1.2, shaftZ);
        panel.add(indicator);

        // Expose methods on userData
        panel.userData = {
            upArrow: upArrow,
            downArrow: downArrow,
            indicator: indicator,
            setUp: function(on) {
                this.upArrow.material.color.setHex(on ? 0x00ff00 : 0x888888);
                this.upArrow.material.needsUpdate = true;
            },
            setDown: function(on) {
                this.downArrow.material.color.setHex(on ? 0x00ff00 : 0x888888);
                this.downArrow.material.needsUpdate = true;
            },
            setIndicator: function(text) {
                const tex = this.indicator.material.map;
                if (tex._lastText === text) return; // Cache check
                tex._lastText = text;
                
                ctx.fillStyle = '#050505';
                ctx.fillRect(0, 0, 256, 256);
                ctx.fillStyle = '#ffbb22';
                ctx.font = 'bold 180px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.shadowColor = '#ffbb22';
                ctx.shadowBlur = 20;
                ctx.fillText(text, 128, 128);
                tex.needsUpdate = true;
            }
        };

        return panel;
    }

    function createShaftIndicator(floorNum, floorY, shaftX, shaftZ) {
        const indicatorGroup = new THREE.Group();

        // Base plate
        const base = new THREE.Mesh(
            new THREE.PlaneGeometry(0.9, 0.9),
            new THREE.MeshLambertMaterial({ color: 0x888888 })
        );
        base.position.set(shaftX, floorY + 2.5, shaftZ + halfShaft + 0.3);
        indicatorGroup.add(base);

        // Canvas texture for display
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#050505';
        ctx.fillRect(0, 0, 256, 256);

        const indicatorMat = new THREE.MeshLambertMaterial({ 
            map: new THREE.CanvasTexture(canvas),
            depthWrite: false
        });
        const indicator = new THREE.Mesh(
            new THREE.PlaneGeometry(0.9, 0.9),
            indicatorMat
        );
        indicator.position.set(shaftX, floorY + 2.5, shaftZ + halfShaft + 0.3);
        indicatorGroup.add(indicator);

        // Expose update method
        indicatorGroup.userData = {
            indicator: indicator,
            updateDisplay: function(floorNum, direction) {
                const tex = this.indicator.material.map;
                if (tex._lastText === `${floorNum}${direction}`) return;
                tex._lastText = `${floorNum}${direction}`;

                ctx.fillStyle = '#050505';
                ctx.fillRect(0, 0, 256, 256);
                ctx.fillStyle = '#ffbb22';
                ctx.font = 'bold 180px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.shadowColor = '#ffbb22';
                ctx.shadowBlur = 20;
                let text = floorNum.toString();
                if (direction !== 0) text += direction > 0 ? '^' : 'v';
                ctx.fillText(text, 128, 128);
                tex.needsUpdate = true;
            }
        };

        return indicatorGroup;
    }

    // Helper to add neighbor relationships
    function Vector3WithNeighbors(x, y, z) {
        this.x = x;
        this.y = y;
        this.z = z;
        this.neighbors = [];
        this.addNode = function(name) {
            if (!this.neighbors.includes(name)) {
                this.neighbors.push(name);
            }
        };
    }
    Vector3WithNeighbors.prototype = Object.create(THREE.Vector3.prototype);

    // Expose globally
    window.WORLD = WORLD;
    window.createWorld = createWorld;
    window.bfsPath = bfsPath;

})();
