(function(root) {
    const WORLD = {
        FLOOR_HEIGHT: 3.4, FLOOR_COUNT: 6,
        BUILDING_WIDTH: 22, BUILDING_DEPTH: 18,
        SHAFT_WIDTH: 3, SHAFT_DEPTH: 3,
        PERSON_R: 0.4
    };

    function bfsPath(nodes, fromName, toName) {
        if (!nodes[fromName] || !nodes[toName]) return [];
        if (fromName === toName) return [nodes[fromName].clone()];

        const visited = new Set();
        const queue = [[fromName]];
        visited.add(fromName);

        while (queue.length > 0) {
            const path = queue.shift();
            const current = path[path.length - 1];
            const node = nodes[current];
            if (!node) continue;

            const neighbors = node.userData.neighbors || [];
            for (const nName of neighbors) {
                if (visited.has(nName)) continue;
                visited.add(nName);
                const newPath = path.concat([nName]);
                if (nName === toName) {
                    return newPath.map(name => nodes[name].clone());
                }
                queue.push(newPath);
            }
        }
        return [];
    }

    function createCallPanel(scene, floorY) {
        const plateGeo = new THREE.BoxGeometry(0.55, 1.4, 0.05);
        const plateMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
        const plate = new THREE.Mesh(plateGeo, plateMat);
        plate.position.set(1.8, floorY + 1.2, 1.65);
        plate.renderOrder = 0;
        scene.add(plate);

        const darkMat = new THREE.MeshBasicMaterial({ color: 0x222222 });
        const greenMat = new THREE.MeshBasicMaterial({ color: 0x00ff44 });

        // Up arrow (triangle pointing up)
        const arrowShape = new THREE.Shape();
        arrowShape.moveTo(0, 0.13);
        arrowShape.lineTo(-0.13, -0.08);
        arrowShape.lineTo(0.13, -0.08);
        arrowShape.closePath();
        const arrowGeo = new THREE.ShapeGeometry(arrowShape);

        const upArrow = new THREE.Mesh(arrowGeo, darkMat.clone());
        upArrow.position.set(1.8, floorY + 1.65, 1.68);
        upArrow.renderOrder = 0;
        scene.add(upArrow);

        const downArrow = new THREE.Mesh(arrowGeo.clone(), darkMat.clone());
        downArrow.position.set(1.8, floorY + 1.35, 1.68);
        downArrow.rotation.z = Math.PI;
        downArrow.renderOrder = 0;
        scene.add(downArrow);

        // Floor indicator canvas texture
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const tex = new THREE.CanvasTexture(canvas);
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.anisotropy = 4;
        tex._lastText = '';

        const indicatorGeo = new THREE.PlaneGeometry(0.45, 0.45);
        const indicatorMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
        const indicator = new THREE.Mesh(indicatorGeo, indicatorMat);
        indicator.position.set(1.8, floorY + 1.0, 1.68);
        indicator.renderOrder = 0;
        scene.add(indicator);

        function updateTextTexture(text) {
            if (tex._lastText === text) return;
            tex._lastText = text;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#050505';
            ctx.fillRect(0, 0, 256, 256);
            ctx.fillStyle = '#ffbb22';
            ctx.font = 'bold 180px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowBlur = 12;
            ctx.shadowColor = '#ffaa00';
            ctx.fillText(text, 128, 128);
            tex.needsUpdate = true;
        }

        function setUp(on) {
            upArrow.material = on ? greenMat : darkMat;
        }

        function setDown(on) {
            downArrow.material = on ? greenMat : darkMat;
        }

        function setIndicator(text) {
            updateTextTexture(text);
        }

        const panel = new THREE.Group();
        panel.add(plate);
        panel.add(upArrow);
        panel.add(downArrow);
        panel.add(indicator);
        panel.userData = { setUp, setDown, setIndicator, plate, upArrow, downArrow, indicator };

        return panel;
    }

    function createShaftIndicator(scene, floorY) {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const tex = new THREE.CanvasTexture(canvas);
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.anisotropy = 4;
        tex._lastText = '';

        const geo = new THREE.PlaneGeometry(0.9, 0.9);
        const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(0, floorY + 2.8, 1.6);
        mesh.renderOrder = 0;
        scene.add(mesh);

        function updateText(text) {
            if (tex._lastText === text) return;
            tex._lastText = text;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#050505';
            ctx.fillRect(0, 0, 256, 256);
            ctx.fillStyle = '#ffbb22';
            ctx.font = 'bold 140px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowBlur = 12;
            ctx.shadowColor = '#ffaa00';
            ctx.fillText(text, 128, 128);
            tex.needsUpdate = true;
        }

        return { mesh, updateText };
    }

    function createCarIndicator(carGroup) {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const tex = new THREE.CanvasTexture(canvas);
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.anisotropy = 4;
        tex._lastText = '';

        const geo = new THREE.PlaneGeometry(0.6, 0.6);
        const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(0, 2.2, -1.45);
        mesh.rotation.y = Math.PI;
        mesh.renderOrder = 1;
        carGroup.add(mesh);

        function updateText(text) {
            if (tex._lastText === text) return;
            tex._lastText = text;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#050505';
            ctx.fillRect(0, 0, 256, 256);
            ctx.fillStyle = '#ffbb22';
            ctx.font = 'bold 140px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowBlur = 12;
            ctx.shadowColor = '#ffaa00';
            ctx.fillText(text, 128, 128);
            tex.needsUpdate = true;
        }

        return { mesh, updateText };
    }

    function addNode(nodes, name, x, y, z, neighbors) {
        const v = new THREE.Vector3(x, y, z);
        v.userData = { name, neighbors: neighbors || [] };
        nodes[name] = v;
        return v;
    }

    function addBidirectional(nodes, a, b) {
        if (!nodes[a].userData.neighbors) nodes[a].userData.neighbors = [];
        if (!nodes[b].userData.neighbors) nodes[b].userData.neighbors = [];
        if (!nodes[a].userData.neighbors.includes(b)) nodes[a].userData.neighbors.push(b);
        if (!nodes[b].userData.neighbors.includes(a)) nodes[b].userData.neighbors.push(a);
    }

    function createFloorNodes(nodes, sitTargets, floorNum, floorY) {
        const hw = WORLD.BUILDING_WIDTH / 2;
        const hd = WORLD.BUILDING_DEPTH / 2;
        const sw = WORLD.SHAFT_WIDTH / 2;
        const sd = WORLD.SHAFT_DEPTH / 2;

        // Hallway ring
        addNode(nodes, 'hallS', 0, floorY, sd + 0.5);
        addNode(nodes, 'hallSE', hw - 1, floorY, sd + 0.5);
        addNode(nodes, 'hallE', hw - 1, floorY, 0);
        addNode(nodes, 'hallNE', hw - 1, floorY, -(sd + 0.5));
        addNode(nodes, 'hallN', 0, floorY, -(sd + 0.5));
        addNode(nodes, 'hallNW', -(hw - 1), floorY, -(sd + 0.5));
        addNode(nodes, 'hallW', -(hw - 1), floorY, 0);
        addNode(nodes, 'hallSW', -(hw - 1), floorY, sd + 0.5);

        // Ring connections
        addBidirectional(nodes, 'hallS', 'hallSE');
        addBidirectional(nodes, 'hallSE', 'hallE');
        addBidirectional(nodes, 'hallE', 'hallNE');
        addBidirectional(nodes, 'hallNE', 'hallN');
        addBidirectional(nodes, 'hallN', 'hallNW');
        addBidirectional(nodes, 'hallNW', 'hallW');
        addBidirectional(nodes, 'hallW', 'hallSW');
        addBidirectional(nodes, 'hallSW', 'hallS');

        // Elevator wait node
        addNode(nodes, 'elevWait', 0, floorY, sd + 1.2);
        addBidirectional(nodes, 'elevWait', 'hallS');
    }

    function createOfficeFloorNodes(nodes, sitTargets, floorNum, floorY) {
        createFloorNodes(nodes, sitTargets, floorNum, floorY);

        // Four private offices along back wall (z in [-9, -3])
        const offices = [
            { id: 'A', doorX: -7, doorZ: -3.5, deskX: -7, deskZ: -7.5 },
            { id: 'B', doorX: -3, doorZ: -3.5, deskX: -3, deskZ: -7.5 },
            { id: 'C', doorX: 3, doorZ: -3.5, deskX: 3, deskZ: -7.5 },
            { id: 'D', doorX: 7, doorZ: -3.5, deskX: 7, deskZ: -7.5 },
        ];

        for (const o of offices) {
            const doorName = `office${o.id}_door`;
            const deskName = `office${o.id}_desk`;
            addNode(nodes, doorName, o.doorX, floorY, o.doorZ);
            addNode(nodes, deskName, o.deskX, floorY, o.deskZ);

            // Link door to nearest hallway corner
            const hallCorner = o.doorX < 0 ? 'hallNW' : 'hallNE';
            addBidirectional(nodes, doorName, hallCorner);
            addBidirectional(nodes, doorName, deskName);

            // Sit target: facing -Z (toward monitor), sit=true
            sitTargets[deskName] = { sit: true, facing: Math.PI };
        }

        // Conference room (front-left: x[-11,-3], z[3,9])
        addNode(nodes, 'conf_door', -7, floorY, 3);
        addBidirectional(nodes, 'conf_door', 'hallSW');

        addNode(nodes, 'conf_center', -7, floorY, 6);
        addBidirectional(nodes, 'conf_door', 'conf_center');

        for (let i = 0; i < 4; i++) {
            const seatName = `conf_seat${i}`;
            let sx, sz, facing;
            if (i === 0) { sx = -9; sz = 5; facing = Math.PI / 2; }
            else if (i === 1) { sx = -9; sz = 7; facing = Math.PI / 2; }
            else if (i === 2) { sx = -5; sz = 5; facing = -Math.PI / 2; }
            else { sx = -5; sz = 7; facing = -Math.PI / 2; }
            addNode(nodes, seatName, sx, floorY, sz);
            addBidirectional(nodes, seatName, 'conf_center');
            sitTargets[seatName] = { sit: true, facing };
        }

        // Lounge / break area (front-right: x[3,11], z[3,9])
        addNode(nodes, 'lounge_door', 7, floorY, 3);
        addBidirectional(nodes, 'lounge_door', 'hallSE');

        addNode(nodes, 'lounge_center', 7, floorY, 6);
        addBidirectional(nodes, 'lounge_door', 'lounge_center');

        for (let i = 0; i < 3; i++) {
            const spotName = `lounge_spot${i}`;
            let sx, sz, facing;
            if (i === 0) { sx = 5; sz = 5; facing = Math.PI / 4; }
            else if (i === 1) { sx = 9; sz = 5; facing = -Math.PI / 4; }
            else { sx = 7; sz = 8; facing = 0; }
            addNode(nodes, spotName, sx, floorY, sz);
            addBidirectional(nodes, spotName, 'lounge_center');
            sitTargets[spotName] = { sit: true, facing };
        }

        // Water cooler standing waypoint
        addNode(nodes, 'water_cooler', 10, floorY, 8);
        addBidirectional(nodes, 'water_cooler', 'lounge_center');
        sitTargets['water_cooler'] = { sit: false, facing: Math.PI };

        // Hallway standing spots
        addNode(nodes, 'hall_stand_N', 0, floorY, -(sd + 1.5));
        addBidirectional(nodes, 'hall_stand_N', 'hallN');
        sitTargets['hall_stand_N'] = { sit: false, facing: 0 };

        addNode(nodes, 'hall_stand_S', 0, floorY, sd + 1.5);
        addBidirectional(nodes, 'hall_stand_S', 'hallS');
        sitTargets['hall_stand_S'] = { sit: false, facing: Math.PI };
    }

    function createLobbyNodes(nodes, sitTargets, floorY) {
        createFloorNodes(nodes, sitTargets, 0, floorY);

        // Entrance and outside
        addNode(nodes, 'entrance', 0, floorY, 9);
        addNode(nodes, 'outside', 0, floorY, 12);
        addBidirectional(nodes, 'entrance', 'elevWait');
        addBidirectional(nodes, 'entrance', 'outside');

        // Cafe (left side)
        addNode(nodes, 'cafe_door', -7, floorY, 3);
        addBidirectional(nodes, 'cafe_door', 'hallSW');
        addNode(nodes, 'cafe_order', -9, floorY, -5);
        addBidirectional(nodes, 'cafe_order', 'cafe_door');
        sitTargets['cafe_order'] = { sit: false, facing: Math.PI / 2 };

        // Bistro tables
        for (let i = 0; i < 4; i++) {
            const bistroName = `bistro${i}`;
            let bx, bz, bf;
            if (i === 0) { bx = -5; bz = 0; bf = Math.PI / 2; }
            else if (i === 1) { bx = -8; bz = 0; bf = Math.PI / 2; }
            else if (i === 2) { bx = -5; bz = -3; bf = Math.PI / 2; }
            else { bx = -8; bz = -3; bf = Math.PI / 2; }
            addNode(nodes, bistroName, bx, floorY, bz);
            addBidirectional(nodes, bistroName, 'cafe_door');
            sitTargets[bistroName] = { sit: true, facing: bf };
        }

        // Front lounge (right side)
        addNode(nodes, 'front_lounge', 7, floorY, 5);
        addBidirectional(nodes, 'front_lounge', 'hallSE');
        sitTargets['front_lounge'] = { sit: true, facing: -Math.PI / 4 };

        // Back lounge
        addNode(nodes, 'back_lounge_N', 0, floorY, -6);
        addNode(nodes, 'back_lounge_S', 0, floorY, -8);
        addBidirectional(nodes, 'back_lounge_N', 'hallN');
        addBidirectional(nodes, 'back_lounge_S', 'back_lounge_N');
        sitTargets['back_lounge_N'] = { sit: true, facing: 0 };
        sitTargets['back_lounge_S'] = { sit: true, facing: Math.PI };

        // Conversation pit (back-left)
        addNode(nodes, 'pit_N', -5, floorY, -6);
        addNode(nodes, 'pit_S', -5, floorY, -8);
        addNode(nodes, 'pit_E', -3, floorY, -7);
        addNode(nodes, 'pit_W', -7, floorY, -7);
        addBidirectional(nodes, 'pit_N', 'hallNW');
        addBidirectional(nodes, 'pit_S', 'pit_N');
        addBidirectional(nodes, 'pit_E', 'pit_N');
        addBidirectional(nodes, 'pit_W', 'pit_N');
        sitTargets['pit_N'] = { sit: true, facing: 0 };
        sitTargets['pit_S'] = { sit: true, facing: Math.PI };
        sitTargets['pit_E'] = { sit: true, facing: Math.PI / 2 };
        sitTargets['pit_W'] = { sit: true, facing: -Math.PI / 2 };

        // Water coolers
        addNode(nodes, 'lobby_wc_front', 5, floorY, 2);
        addNode(nodes, 'lobby_wc_back', -3, floorY, -4);
        addBidirectional(nodes, 'lobby_wc_front', 'hallSE');
        addBidirectional(nodes, 'lobby_wc_back', 'hallN');
        sitTargets['lobby_wc_front'] = { sit: false, facing: 0 };
        sitTargets['lobby_wc_back'] = { sit: false, facing: Math.PI };

        // Reception
        addNode(nodes, 'reception', -3, floorY, 6);
        addBidirectional(nodes, 'reception', 'hallSW');
        sitTargets['reception'] = { sit: false, facing: Math.PI / 2 };

        // Info kiosk
        addNode(nodes, 'kiosk', 3, floorY, 7);
        addBidirectional(nodes, 'kiosk', 'hallSE');
        sitTargets['kiosk'] = { sit: false, facing: -Math.PI / 2 };

        // Generic loiter waypoints
        const loiterSpots = [
            { name: 'lobby_stand_center', x: 0, z: 3, f: 0 },
            { name: 'lobby_stand_NE', x: 5, z: 5, f: Math.PI / 4 },
            { name: 'lobby_stand_NW', x: -5, z: 5, f: -Math.PI / 4 },
            { name: 'lobby_stand_midE', x: 8, z: 0, f: Math.PI / 2 },
            { name: 'lobby_stand_midW', x: -8, z: 0, f: -Math.PI / 2 },
            { name: 'lobby_stand_entry', x: 0, z: 7, f: 0 },
        ];
        for (const ls of loiterSpots) {
            addNode(nodes, ls.name, ls.x, floorY, ls.z);
            addBidirectional(nodes, ls.name, 'hallS');
            sitTargets[ls.name] = { sit: false, facing: ls.f };
        }
    }

    function createWorld(scene) {
        const buildingGroup = new THREE.Group();
        buildingGroup.renderOrder = 0;
        scene.add(buildingGroup);

        const floors = [];
        const floorHeight = WORLD.FLOOR_HEIGHT;
        const floorCount = WORLD.FLOOR_COUNT;
        const bw = WORLD.BUILDING_WIDTH;
        const bd = WORLD.BUILDING_DEPTH;
        const sw = WORLD.SHAFT_WIDTH;
        const sd = WORLD.SHAFT_DEPTH;
        const hw = bw / 2;
        const hd = bd / 2;

        // Ground slab
        const groundGeo = new THREE.BoxGeometry(bw, 0.3, bd);
        const groundMat = new THREE.MeshLambertMaterial({ color: 0x666666 });
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.position.y = -0.15;
        ground.renderOrder = 0;
        buildingGroup.add(ground);

        // Sidewalk
        const sidewalkGeo = new THREE.BoxGeometry(6, 0.1, 4);
        const sidewalkMat = new THREE.MeshLambertMaterial({ color: 0x888888 });
        const sidewalk = new THREE.Mesh(sidewalkGeo, sidewalkMat);
        sidewalk.position.set(0, 0.05, 11);
        sidewalk.renderOrder = 0;
        buildingGroup.add(sidewalk);

        // Roof
        const roofGeo = new THREE.BoxGeometry(bw, 0.3, bd);
        const roofMat = new THREE.MeshLambertMaterial({ color: 0x555555 });
        const roof = new THREE.Mesh(roofGeo, roofMat);
        roof.position.y = floorCount * floorHeight + 0.15;
        roof.renderOrder = 0;
        buildingGroup.add(roof);

        // Outer walls - semi-transparent blue
        const wallMat = new THREE.MeshLambertMaterial({
            color: 0x9999ff, transparent: true, opacity: 0.2,
            depthWrite: false, side: THREE.DoubleSide
        });

        // Back wall (full height)
        const backWallGeo = new THREE.BoxGeometry(bw, floorCount * floorHeight, 0.15);
        const backWall = new THREE.Mesh(backWallGeo, wallMat);
        backWall.position.set(0, (floorCount * floorHeight) / 2, -hd);
        backWall.renderOrder = 0;
        buildingGroup.add(backWall);

        // Left wall
        const sideWallGeo = new THREE.BoxGeometry(0.15, floorCount * floorHeight, bd);
        const leftWall = new THREE.Mesh(sideWallGeo, wallMat);
        leftWall.position.set(-hw, (floorCount * floorHeight) / 2, 0);
        leftWall.renderOrder = 0;
        buildingGroup.add(leftWall);

        // Right wall
        const rightWall = new THREE.Mesh(sideWallGeo.clone(), wallMat);
        rightWall.position.set(hw, (floorCount * floorHeight) / 2, 0);
        rightWall.renderOrder = 0;
        buildingGroup.add(rightWall);

        // Front wall - three segments: left panel, right panel, above-gap panel
        const frontWallLeftGeo = new THREE.BoxGeometry((bw - 3) / 2, floorCount * floorHeight, 0.15);
        const frontWallLeft = new THREE.Mesh(frontWallLeftGeo, wallMat);
        frontWallLeft.position.set(-(3 / 2 + (bw - 3) / 4), (floorCount * floorHeight) / 2, hd);
        frontWallLeft.renderOrder = 0;
        buildingGroup.add(frontWallLeft);

        const frontWallRight = new THREE.Mesh(frontWallLeftGeo.clone(), wallMat);
        frontWallRight.position.set((3 / 2 + (bw - 3) / 4), (floorCount * floorHeight) / 2, hd);
        frontWallRight.renderOrder = 0;
        buildingGroup.add(frontWallRight);

        // Above-gap panel (floors 1-5)
        const aboveGapH = (floorCount - 1) * floorHeight;
        const aboveGapGeo = new THREE.BoxGeometry(3, aboveGapH, 0.15);
        const aboveGap = new THREE.Mesh(aboveGapGeo, wallMat);
        aboveGap.position.set(0, floorHeight + aboveGapH / 2, hd);
        aboveGap.renderOrder = 0;
        buildingGroup.add(aboveGap);

        // Floor slabs and interior elements
        const slabMat = new THREE.MeshLambertMaterial({
            color: 0x888888, transparent: true, opacity: 0.3,
            depthWrite: false, side: THREE.DoubleSide
        });
        const interiorWallMat = new THREE.MeshLambertMaterial({
            color: 0xbbc5e6, transparent: true, opacity: 0.28,
            depthWrite: false, side: THREE.DoubleSide
        });

        for (let f = 1; f < floorCount; f++) {
            const y = f * floorHeight;

            // Floor slab as four strips around shaft
            // Front strip
            const frontStripGeo = new THREE.BoxGeometry(bw, 0.15, (bd - sd) / 2);
            const frontStrip = new THREE.Mesh(frontStripGeo, slabMat);
            frontStrip.position.set(0, y, (bd + sd) / 4);
            frontStrip.renderOrder = 0;
            buildingGroup.add(frontStrip);

            // Back strip
            const backStrip = new THREE.Mesh(frontStripGeo.clone(), slabMat);
            backStrip.position.set(0, y, -(bd + sd) / 4);
            backStrip.renderOrder = 0;
            buildingGroup.add(backStrip);

            // Left strip
            const leftStripGeo = new THREE.BoxGeometry((bw - sw) / 2, 0.15, sd);
            const leftStrip = new THREE.Mesh(leftStripGeo, slabMat);
            leftStrip.position.set(-(bw + sw) / 4, y, 0);
            leftStrip.renderOrder = 0;
            buildingGroup.add(leftStrip);

            // Right strip
            const rightStrip = new THREE.Mesh(leftStripGeo.clone(), slabMat);
            rightStrip.position.set((bw + sw) / 4, y, 0);
            rightStrip.renderOrder = 0;
            buildingGroup.add(rightStrip);

            // Interior walls for offices (back wall area z in [-9,-3])
            // Separators between offices at x=-5, x=0, x=5
            const officeWallGeo = new THREE.BoxGeometry(0.1, 2.8, 6);
            for (const wx of [-5, 0, 5]) {
                const wall = new THREE.Mesh(officeWallGeo, interiorWallMat);
                wall.position.set(wx, y + 1.4, -6);
                wall.renderOrder = 0;
                buildingGroup.add(wall);
            }

            // Conference room walls (front-left)
            const confWallGeo1 = new THREE.BoxGeometry(8, 2.8, 0.1);
            const confWall1 = new THREE.Mesh(confWallGeo1, interiorWallMat);
            confWall1.position.set(-7, y + 1.4, 3);
            confWall1.renderOrder = 0;
            buildingGroup.add(confWall1);

            const confWallGeo2 = new THREE.BoxGeometry(0.1, 2.8, 6);
            const confWall2 = new THREE.Mesh(confWallGeo2, interiorWallMat);
            confWall2.position.set(-3, y + 1.4, 6);
            confWall2.renderOrder = 0;
            buildingGroup.add(confWall2);

            // Lounge walls (front-right)
            const loungeWall1 = new THREE.Mesh(confWallGeo1.clone(), interiorWallMat);
            loungeWall1.position.set(7, y + 1.4, 3);
            loungeWall1.renderOrder = 0;
            buildingGroup.add(loungeWall1);

            const loungeWall2 = new THREE.Mesh(confWallGeo2.clone(), interiorWallMat);
            loungeWall2.position.set(3, y + 1.4, 6);
            loungeWall2.renderOrder = 0;
            buildingGroup.add(loungeWall2);

            // Call panel
            const callPanel = createCallPanel(buildingGroup, y);
            const shaftIndicator = createShaftIndicator(buildingGroup, y);

            // Navigation nodes
            const nodes = {};
            const sitTargets = {};
            createOfficeFloorNodes(nodes, sitTargets, f, y);

            // Furniture on office floors
            // Desks and chairs in offices
            const desks = [];
            const officePositions = [
                { x: -7, z: -7.5 }, { x: -3, z: -7.5 },
                { x: 3, z: -7.5 }, { x: 7, z: -7.5 }
            ];
            for (const op of officePositions) {
                // Desk
                const deskGeo = new THREE.BoxGeometry(1.4, 0.08, 0.7);
                const deskMat = new THREE.MeshLambertMaterial({ color: 0x8B7355 });
                const desk = new THREE.Mesh(deskGeo, deskMat);
                desk.position.set(op.x, y + 0.75, op.z);
                desk.renderOrder = 0;
                buildingGroup.add(desk);

                // Monitor
                const monitorGeo = new THREE.BoxGeometry(0.5, 0.35, 0.05);
                const monitorMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
                const monitor = new THREE.Mesh(monitorGeo, monitorMat);
                monitor.position.set(op.x, y + 1.1, op.z - 0.3);
                monitor.renderOrder = 0;
                buildingGroup.add(monitor);

                // Chair
                const chairGeo = new THREE.BoxGeometry(0.5, 0.08, 0.5);
                const chairMat = new THREE.MeshLambertMaterial({ color: 0x444444 });
                const chair = new THREE.Mesh(chairGeo, chairMat);
                chair.position.set(op.x, y + 0.45, op.z + 0.5);
                chair.renderOrder = 0;
                buildingGroup.add(chair);

                desks.push(desk);
            }

            // Conference room table and chairs
            const confTableGeo = new THREE.BoxGeometry(3, 0.08, 1.5);
            const confTableMat = new THREE.MeshLambertMaterial({ color: 0x6B4226 });
            const confTable = new THREE.Mesh(confTableGeo, confTableMat);
            confTable.position.set(-7, y + 0.75, 6);
            confTable.renderOrder = 0;
            buildingGroup.add(confTable);

            const confChairPositions = [
                { x: -9, z: 5 }, { x: -9, z: 7 },
                { x: -5, z: 5 }, { x: -5, z: 7 }
            ];
            for (const cp of confChairPositions) {
                const chairGeo = new THREE.BoxGeometry(0.45, 0.08, 0.45);
                const chair = new THREE.Mesh(chairGeo, chairMat);
                chair.position.set(cp.x, y + 0.45, cp.z);
                chair.renderOrder = 0;
                buildingGroup.add(chair);
            }

            // Lounge furniture
            // Couch
            const couchGeo = new THREE.BoxGeometry(2, 0.4, 0.8);
            const couchMat = new THREE.MeshLambertMaterial({ color: 0x556B2F });
            const couch = new THREE.Mesh(couchGeo, couchMat);
            couch.position.set(5, y + 0.3, 5);
            couch.renderOrder = 0;
            buildingGroup.add(couch);

            // Coffee table
            const coffeeTableGeo = new THREE.BoxGeometry(1, 0.05, 0.6);
            const coffeeTableMat = new THREE.MeshLambertMaterial({ color: 0x8B7355 });
            const coffeeTable = new THREE.Mesh(coffeeTableGeo, coffeeTableMat);
            coffeeTable.position.set(7, y + 0.45, 6);
            coffeeTable.renderOrder = 0;
            buildingGroup.add(coffeeTable);

            // Armchairs
            const armchairGeo = new THREE.BoxGeometry(0.6, 0.4, 0.6);
            const armchairMat = new THREE.MeshLambertMaterial({ color: 0x8B4513 });
            const ac1 = new THREE.Mesh(armchairGeo, armchairMat);
            ac1.position.set(9, y + 0.3, 5);
            ac1.renderOrder = 0;
            buildingGroup.add(ac1);

            const ac2 = new THREE.Mesh(armchairGeo.clone(), armchairMat);
            ac2.position.set(7, y + 0.3, 8);
            ac2.renderOrder = 0;
            buildingGroup.add(ac2);

            // Water cooler
            const wcGeo = new THREE.CylinderGeometry(0.2, 0.2, 1, 8);
            const wcMat = new THREE.MeshLambertMaterial({ color: 0x88ccff });
            const wc = new THREE.Mesh(wcGeo, wcMat);
            wc.position.set(10, y + 0.5, 8);
            wc.renderOrder = 0;
            buildingGroup.add(wc);

            floors.push({
                floorNumber: f, nodes, callPanel, shaftIndicator, desks, sitTargets
            });
        }

        // Floor 0 - Lobby
        const lobbyY = 0;
        const lobbyNodes = {};
        const lobbySitTargets = {};
        createLobbyNodes(lobbyNodes, lobbySitTargets, lobbyY);

        // Lobby call panel
        const lobbyCallPanel = createCallPanel(buildingGroup, lobbyY);
        const lobbyShaftIndicator = createShaftIndicator(buildingGroup, lobbyY);

        // Lobby furniture
        // Glass doors at entrance
        const doorGeo = new THREE.BoxGeometry(1.4, 2.5, 0.05);
        const doorMat = new THREE.MeshLambertMaterial({
            color: 0x9999ff, transparent: true, opacity: 0.3,
            depthWrite: false, side: THREE.DoubleSide
        });
        const doorL = new THREE.Mesh(doorGeo, doorMat);
        doorL.position.set(-0.75, 1.25, 9);
        doorL.renderOrder = 0;
        buildingGroup.add(doorL);

        const doorR = new THREE.Mesh(doorGeo.clone(), doorMat);
        doorR.position.set(0.75, 1.25, 9);
        doorR.renderOrder = 0;
        buildingGroup.add(doorR);

        // Cafe counter
        const counterGeo = new THREE.BoxGeometry(3, 1, 0.8);
        const counterMat = new THREE.MeshLambertMaterial({ color: 0x8B7355 });
        const counter = new THREE.Mesh(counterGeo, counterMat);
        counter.position.set(-9, 0.5, -5);
        counter.renderOrder = 0;
        buildingGroup.add(counter);

        // Countertop
        const topGeo = new THREE.BoxGeometry(3.1, 0.05, 0.85);
        const topMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
        const countertop = new THREE.Mesh(topGeo, topMat);
        countertop.position.set(-9, 1.02, -5);
        countertop.renderOrder = 0;
        buildingGroup.add(countertop);

        // Coffee machine
        const cmGeo = new THREE.BoxGeometry(0.4, 0.5, 0.3);
        const cmMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
        const coffeeMachine = new THREE.Mesh(cmGeo, cmMat);
        coffeeMachine.position.set(-9.5, 1.3, -5);
        coffeeMachine.renderOrder = 0;
        buildingGroup.add(coffeeMachine);

        // Pastry display
        const pdGeo = new THREE.BoxGeometry(0.6, 0.3, 0.3);
        const pdMat = new THREE.MeshLambertMaterial({ color: 0xffeedd });
        const pastryDisplay = new THREE.Mesh(pdGeo, pdMat);
        pastryDisplay.position.set(-8.5, 1.2, -5);
        pastryDisplay.renderOrder = 0;
        buildingGroup.add(pastryDisplay);

        // Bistro tables
        const bistroTablePositions = [
            { x: -5, z: 0 }, { x: -8, z: 0 },
            { x: -5, z: -3 }, { x: -8, z: -3 }
        ];
        for (const bp of bistroTablePositions) {
            const btGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.05, 12);
            const btMat = new THREE.MeshLambertMaterial({ color: 0x8B7355 });
            const bt = new THREE.Mesh(btGeo, btMat);
            bt.position.set(bp.x, 0.75, bp.z);
            bt.renderOrder = 0;
            buildingGroup.add(bt);

            // Chairs
            const bcGeo = new THREE.BoxGeometry(0.4, 0.08, 0.4);
            const bcMat = new THREE.MeshLambertMaterial({ color: 0x444444 });
            const bc1 = new THREE.Mesh(bcGeo, bcMat);
            bc1.position.set(bp.x - 0.5, 0.45, bp.z);
            bc1.renderOrder = 0;
            buildingGroup.add(bc1);

            const bc2 = new THREE.Mesh(bcGeo.clone(), bcMat);
            bc2.position.set(bp.x + 0.5, 0.45, bp.z);
            bc2.renderOrder = 0;
            buildingGroup.add(bc2);
        }

        // Front lounge
        const flCouch = new THREE.Mesh(couchGeo.clone(), couchMat);
        flCouch.position.set(7, 0.3, 5);
        flCouch.renderOrder = 0;
        buildingGroup.add(flCouch);

        const flCoffeeTable = new THREE.Mesh(coffeeTableGeo.clone(), coffeeTableMat);
        flCoffeeTable.position.set(7, 0.45, 6);
        flCoffeeTable.renderOrder = 0;
        buildingGroup.add(flCoffeeTable);

        const flAc1 = new THREE.Mesh(armchairGeo.clone(), armchairMat);
        flAc1.position.set(9, 0.3, 5);
        flAc1.renderOrder = 0;
        buildingGroup.add(flAc1);

        const flAc2 = new THREE.Mesh(armchairGeo.clone(), armchairMat);
        flAc2.position.set(7, 0.3, 8);
        flAc2.renderOrder = 0;
        buildingGroup.add(flAc2);

        // Back lounge
        const blCouch1 = new THREE.Mesh(couchGeo.clone(), couchMat);
        blCouch1.position.set(0, 0.3, -6);
        blCouch1.renderOrder = 0;
        buildingGroup.add(blCouch1);

        const blCouch2 = new THREE.Mesh(couchGeo.clone(), couchMat);
        blCouch2.position.set(0, 0.3, -8);
        blCouch2.rotation.y = Math.PI;
        blCouch2.renderOrder = 0;
        buildingGroup.add(blCouch2);

        const blCoffeeTable = new THREE.Mesh(coffeeTableGeo.clone(), coffeeTableMat);
        blCoffeeTable.position.set(0, 0.45, -7);
        blCoffeeTable.renderOrder = 0;
        buildingGroup.add(blCoffeeTable);

        // Conversation pit
        const pitTableGeo = new THREE.CylinderGeometry(0.6, 0.6, 0.05, 12);
        const pitTable = new THREE.Mesh(pitTableGeo, coffeeTableMat);
        pitTable.position.set(-5, 0.45, -7);
        pitTable.renderOrder = 0;
        buildingGroup.add(pitTable);

        const pitChairPositions = [
            { x: -5, z: -6 }, { x: -5, z: -8 },
            { x: -3, z: -7 }, { x: -7, z: -7 }
        ];
        for (const pp of pitChairPositions) {
            const pc = new THREE.Mesh(armchairGeo.clone(), armchairMat);
            pc.position.set(pp.x, 0.3, pp.z);
            pc.renderOrder = 0;
            buildingGroup.add(pc);
        }

        // Water coolers
        const lobbyWc1 = new THREE.Mesh(wcGeo.clone(), wcMat);
        lobbyWc1.position.set(5, 0.5, 2);
        lobbyWc1.renderOrder = 0;
        buildingGroup.add(lobbyWc1);

        const lobbyWc2 = new THREE.Mesh(wcGeo.clone(), wcMat);
        lobbyWc2.position.set(-3, 0.5, -4);
        lobbyWc2.renderOrder = 0;
        buildingGroup.add(lobbyWc2);

        // Reception desk
        const recepGeo = new THREE.BoxGeometry(1.5, 1, 0.8);
        const recepMat = new THREE.MeshLambertMaterial({ color: 0x8B7355 });
        const recepDesk = new THREE.Mesh(recepGeo, recepMat);
        recepDesk.position.set(-3, 0.5, 6);
        recepDesk.renderOrder = 0;
        buildingGroup.add(recepDesk);

        // Info kiosk
        const kioskGeo = new THREE.CylinderGeometry(0.4, 0.4, 1.5, 12);
        const kioskMat = new THREE.MeshLambertMaterial({ color: 0x4488cc });
        const kiosk = new THREE.Mesh(kioskGeo, kioskMat);
        kiosk.position.set(3, 0.75, 7);
        kiosk.renderOrder = 0;
        buildingGroup.add(kiosk);

        // Potted plants
        const potGeo = new THREE.CylinderGeometry(0.25, 0.2, 0.4, 8);
        const potMat = new THREE.MeshLambertMaterial({ color: 0x8B4513 });
        const plantGeo = new THREE.SphereGeometry(0.35, 8, 6);
        const plantMat = new THREE.MeshLambertMaterial({ color: 0x228B22 });

        for (const px of [-1.5, 1.5]) {
            const pot = new THREE.Mesh(potGeo, potMat);
            pot.position.set(px, 0.2, 9.5);
            pot.renderOrder = 0;
            buildingGroup.add(pot);

            const plant = new THREE.Mesh(plantGeo, plantMat);
            plant.position.set(px, 0.6, 9.5);
            plant.renderOrder = 0;
            buildingGroup.add(plant);
        }

        // Lobby desks array (empty, no desks on lobby)
        const lobbyDesks = [];

        floors.unshift({
            floorNumber: 0, nodes: lobbyNodes, callPanel: lobbyCallPanel,
            shaftIndicator: lobbyShaftIndicator, desks: lobbyDesks,
            sitTargets: lobbySitTargets,
            entranceSpot: lobbyNodes['entrance'],
            cafeSpots: ['bistro0', 'bistro1', 'bistro2', 'bistro3'],
        });

        return {
            buildingGroup,
            floors,
            bfsPath: function(fromName, toName) {
                // Find which floor each node is on
                let fromFloor = null, toFloor = null;
                for (const floor of floors) {
                    if (floor.nodes[fromName]) fromFloor = floor;
                    if (floor.nodes[toName]) toFloor = floor;
                }
                if (!fromFloor || !toFloor) return [];

                // If same floor, just BFS
                if (fromFloor === toFloor) {
                    return bfsPath(fromFloor.nodes, fromName, toName);
                }

                // Different floors: path to elevWait on fromFloor, then to elevWait on toFloor
                const fromPath = bfsPath(fromFloor.nodes, fromName, 'elevWait');
                const toPath = bfsPath(toFloor.nodes, 'elevWait', toName);
                if (fromPath.length === 0 || toPath.length === 0) return [];
                return fromPath.concat(toPath);
            },
        };
    }

    root.WORLD = WORLD;
    root.createWorld = createWorld;
    root.createCarIndicator = createCarIndicator;
})(typeof window !== 'undefined' ? window : globalThis);
