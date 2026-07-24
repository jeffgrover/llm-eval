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

    function createCallPanel(scene, floorNum, floorY) {
        const panelGroup = new THREE.Group();
        panelGroup.position.set(2.0, floorY + 1.4, 1.53);

        const plateMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
        const plateGeo = new THREE.BoxGeometry(0.55, 1.4, 0.05);
        const plateMesh = new THREE.Mesh(plateGeo, plateMat);
        plateMesh.renderOrder = 0;
        panelGroup.add(plateMesh);

        // Arrow materials
        const darkArrowMat = new THREE.MeshBasicMaterial({ color: 0x333333 });
        const litArrowMat = new THREE.MeshBasicMaterial({ color: 0x00ff66 });

        // Up arrow triangle
        const upShape = new THREE.Shape();
        upShape.moveTo(0, 0.12);
        upShape.lineTo(-0.12, -0.08);
        upShape.lineTo(0.12, -0.08);
        upShape.closePath();
        const upGeo = new THREE.ShapeGeometry(upShape);
        const upMesh = new THREE.Mesh(upGeo, darkArrowMat);
        upMesh.position.set(0, 0.45, 0.03);
        panelGroup.add(upMesh);

        // Down arrow triangle
        const downShape = new THREE.Shape();
        downShape.moveTo(0, -0.12);
        downShape.lineTo(-0.12, 0.08);
        downShape.lineTo(0.12, 0.08);
        downShape.closePath();
        const downGeo = new THREE.ShapeGeometry(downShape);
        const downMesh = new THREE.Mesh(downGeo, darkArrowMat);
        downMesh.position.set(0, 0.18, 0.03);
        panelGroup.add(downMesh);

        // Canvas Floor Indicator
        const tex = createDigitTexture(String(floorNum));
        const indMat = new THREE.MeshBasicMaterial({ map: tex });
        const indGeo = new THREE.PlaneGeometry(0.45, 0.45);
        const indMesh = new THREE.Mesh(indGeo, indMat);
        indMesh.position.set(0, -0.3, 0.03);
        panelGroup.add(indMesh);

        scene.add(panelGroup);

        return {
            group: panelGroup,
            setUp: function(on) { upMesh.material = on ? litArrowMat : darkArrowMat; },
            setDown: function(on) { downMesh.material = on ? litArrowMat : darkArrowMat; },
            setIndicator: function(text) { updateDigitTexture(tex, text); }
        };
    }

    function createShaftIndicator(scene, floorY) {
        const tex = createDigitTexture("0");
        const mat = new THREE.MeshBasicMaterial({ map: tex });
        const geo = new THREE.PlaneGeometry(0.9, 0.9);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(0, floorY + 2.45, 1.53);
        mesh.renderOrder = 0;
        scene.add(mesh);

        return {
            mesh: mesh,
            setIndicator: function(text) { updateDigitTexture(tex, text); }
        };
    }

    function bfsPath(nodes, fromName, toName) {
        if (!nodes || !nodes[fromName] || !nodes[toName]) return [];
        if (fromName === toName) return [nodes[fromName].pos.clone()];
        const queue = [fromName];
        const visited = {};
        const parent = {};
        visited[fromName] = true;

        while (queue.length > 0) {
            const curr = queue.shift();
            if (curr === toName) break;
            const neighbors = nodes[curr].neighbors || [];
            for (let i = 0; i < neighbors.length; i++) {
                const nxt = neighbors[i];
                if (!visited[nxt] && nodes[nxt]) {
                    visited[nxt] = true;
                    parent[nxt] = curr;
                    queue.push(nxt);
                }
            }
        }

        if (!visited[toName]) return [nodes[fromName].pos.clone(), nodes[toName].pos.clone()];

        const path = [];
        let curr = toName;
        while (curr) {
            path.unshift(nodes[curr].pos.clone());
            curr = parent[curr];
        }
        return path;
    }

    function createWorld(scene) {
        const buildingGroup = new THREE.Group();
        buildingGroup.renderOrder = 0;

        const solidGrayMat = new THREE.MeshLambertMaterial({ color: 0x555566 });
        const slabTransMat = new THREE.MeshLambertMaterial({
            color: 0x888899,
            transparent: true,
            opacity: 0.3,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        const outerWallMat = new THREE.MeshLambertMaterial({
            color: 0x9999ff,
            transparent: true,
            opacity: 0.2,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        const intWallMat = new THREE.MeshLambertMaterial({
            color: 0xbbc5e6,
            transparent: true,
            opacity: 0.28,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        const furnitureWoodMat = new THREE.MeshLambertMaterial({ color: 0xa06535 });
        const chairMat = new THREE.MeshLambertMaterial({ color: 0x334455 });
        const couchMat = new THREE.MeshLambertMaterial({ color: 0x773333 });
        const counterMat = new THREE.MeshLambertMaterial({ color: 0x333344 });
        const sidewalkMat = new THREE.MeshLambertMaterial({ color: 0x777777 });

        // Ground slab (y=0)
        const groundGeo = new THREE.BoxGeometry(24, 0.2, 20);
        const groundMesh = new THREE.Mesh(groundGeo, solidGrayMat);
        groundMesh.position.set(0, -0.1, 0);
        groundMesh.renderOrder = 0;
        buildingGroup.add(groundMesh);

        // Sidewalk slab (y=0, z=12)
        const sidewalkGeo = new THREE.BoxGeometry(12, 0.1, 5);
        const sidewalkMesh = new THREE.Mesh(sidewalkGeo, sidewalkMat);
        sidewalkMesh.position.set(0, -0.05, 12);
        sidewalkMesh.renderOrder = 0;
        buildingGroup.add(sidewalkMesh);

        // Roof slab
        const roofGeo = new THREE.BoxGeometry(24, 0.2, 20);
        const roofMesh = new THREE.Mesh(roofGeo, solidGrayMat);
        roofMesh.position.set(0, WORLD.FLOOR_COUNT * WORLD.FLOOR_HEIGHT + 0.1, 0);
        roofMesh.renderOrder = 0;
        buildingGroup.add(roofMesh);

        // Intermediate floor slabs (Floors 1..5) - 4 strips around shaft opening
        for (let f = 1; f < WORLD.FLOOR_COUNT; f++) {
            const fy = f * WORLD.FLOOR_HEIGHT;
            // Left strip
            const leftSlab = new THREE.Mesh(new THREE.BoxGeometry(9.5, 0.1, 18), slabTransMat);
            leftSlab.position.set(-6.25, fy - 0.05, 0);
            leftSlab.renderOrder = 0;
            buildingGroup.add(leftSlab);
            // Right strip
            const rightSlab = new THREE.Mesh(new THREE.BoxGeometry(9.5, 0.1, 18), slabTransMat);
            rightSlab.position.set(6.25, fy - 0.05, 0);
            rightSlab.renderOrder = 0;
            buildingGroup.add(rightSlab);
            // Front strip
            const frontSlab = new THREE.Mesh(new THREE.BoxGeometry(3, 0.1, 7.5), slabTransMat);
            frontSlab.position.set(0, fy - 0.05, 5.25);
            frontSlab.renderOrder = 0;
            buildingGroup.add(frontSlab);
            // Back strip
            const backSlab = new THREE.Mesh(new THREE.BoxGeometry(3, 0.1, 7.5), slabTransMat);
            backSlab.position.set(0, fy - 0.05, -5.25);
            backSlab.renderOrder = 0;
            buildingGroup.add(backSlab);
        }

        // Outer Walls
        const totalHeight = WORLD.FLOOR_COUNT * WORLD.FLOOR_HEIGHT;
        const midH = totalHeight / 2;

        // Back Wall (z = -9)
        const backWall = new THREE.Mesh(new THREE.BoxGeometry(22, totalHeight, 0.1), outerWallMat);
        backWall.position.set(0, midH, -9);
        backWall.renderOrder = 0;
        buildingGroup.add(backWall);

        // Left Wall (x = -11)
        const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.1, totalHeight, 18), outerWallMat);
        leftWall.position.set(-11, midH, 0);
        leftWall.renderOrder = 0;
        buildingGroup.add(leftWall);

        // Right Wall (x = 11)
        const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.1, totalHeight, 18), outerWallMat);
        rightWall.position.set(11, midH, 0);
        rightWall.renderOrder = 0;
        buildingGroup.add(rightWall);

        // Front Wall (z = +9): Left segment, Right segment, Above-gap panel
        const frontLeft = new THREE.Mesh(new THREE.BoxGeometry(9.5, totalHeight, 0.1), outerWallMat);
        frontLeft.position.set(-6.25, midH, 9);
        frontLeft.renderOrder = 0;
        buildingGroup.add(frontLeft);

        const frontRight = new THREE.Mesh(new THREE.BoxGeometry(9.5, totalHeight, 0.1), outerWallMat);
        frontRight.position.set(6.25, midH, 9);
        frontRight.renderOrder = 0;
        buildingGroup.add(frontRight);

        // Above gap panel covering floors 1..5 above entrance gap
        const frontAboveGapHeight = (WORLD.FLOOR_COUNT - 1) * WORLD.FLOOR_HEIGHT;
        const frontAboveGap = new THREE.Mesh(new THREE.BoxGeometry(3, frontAboveGapHeight, 0.1), outerWallMat);
        frontAboveGap.position.set(0, WORLD.FLOOR_HEIGHT + frontAboveGapHeight / 2, 9);
        frontAboveGap.renderOrder = 0;
        buildingGroup.add(frontAboveGap);

        const floors = [];

        // Build per-floor layouts
        for (let f = 0; f < WORLD.FLOOR_COUNT; f++) {
            const fy = f * WORLD.FLOOR_HEIGHT;
            const callPanel = createCallPanel(scene, f, fy);
            const shaftIndicator = createShaftIndicator(scene, fy);

            const floorData = {
                floorNumber: f,
                nodes: {},
                callPanel: callPanel,
                shaftIndicator: shaftIndicator,
                desks: [],
                sitTargets: {}
            };

            // Hallway ring around shaft
            const hRing = {
                elevWait: new THREE.Vector3(0, fy, 2.2),
                hallS: new THREE.Vector3(0, fy, 3.2),
                hallSE: new THREE.Vector3(4, fy, 3.2),
                hallE: new THREE.Vector3(4, fy, 0),
                hallNE: new THREE.Vector3(4, fy, -3.2),
                hallN: new THREE.Vector3(0, fy, -3.2),
                hallNW: new THREE.Vector3(-4, fy, -3.2),
                hallW: new THREE.Vector3(-4, fy, 0),
                hallSW: new THREE.Vector3(-4, fy, 3.2)
            };

            for (let name in hRing) {
                floorData.nodes[name] = { pos: hRing[name], neighbors: [] };
            }

            // Connect hallway ring
            function link(n1, n2) {
                if (floorData.nodes[n1] && floorData.nodes[n2]) {
                    if (floorData.nodes[n1].neighbors.indexOf(n2) === -1) floorData.nodes[n1].neighbors.push(n2);
                    if (floorData.nodes[n2].neighbors.indexOf(n1) === -1) floorData.nodes[n2].neighbors.push(n1);
                }
            }

            link("elevWait", "hallS");
            link("hallS", "hallSE");
            link("hallSE", "hallE");
            link("hallE", "hallNE");
            link("hallNE", "hallN");
            link("hallN", "hallNW");
            link("hallNW", "hallW");
            link("hallW", "hallSW");
            link("hallSW", "hallS");

            if (f === 0) {
                // Ground Floor (Lobby)
                const outsidePos = new THREE.Vector3(0, fy, 12);
                const thresholdPos = new THREE.Vector3(0, fy, 9.35);
                const entrancePos = new THREE.Vector3(0, fy, 7.4);
                const lobbyCenterPos = new THREE.Vector3(0, fy, 4.5);

                floorData.nodes["outside"] = { pos: outsidePos, neighbors: ["front_door_threshold"] };
                floorData.nodes["front_door_threshold"] = { pos: thresholdPos, neighbors: ["outside", "entrance"] };
                floorData.nodes["entrance"] = { pos: entrancePos, neighbors: ["front_door_threshold", "lobby_center", "elevWait"] };
                floorData.nodes["lobby_center"] = { pos: lobbyCenterPos, neighbors: ["entrance", "elevWait", "hallS", "hallSW", "hallSE"] };

                link("entrance", "elevWait");
                link("lobby_center", "elevWait");

                // Cafe
                const cafeCounter = new THREE.Mesh(new THREE.BoxGeometry(4, 0.9, 1.2), counterMat);
                cafeCounter.position.set(-7, fy + 0.45, 3.5);
                cafeCounter.renderOrder = 0;
                buildingGroup.add(cafeCounter);

                floorData.nodes["cafe_order"] = { pos: new THREE.Vector3(-5, fy, 3.5), neighbors: ["hallSW", "lobby_center"] };
                floorData.sitTargets["cafe_order"] = { sit: false, facing: -Math.PI / 2 };

                // 4 Bistro Tables
                const bistroCoords = [
                    { t: [-8.5, 6], c1: [-9.2, 6, Math.PI / 2], c2: [-7.8, 6, -Math.PI / 2], idx: 0 },
                    { t: [-5.5, 6], c1: [-6.2, 6, Math.PI / 2], c2: [-4.8, 6, -Math.PI / 2], idx: 2 },
                    { t: [-8.5, 1.5], c1: [-9.2, 1.5, Math.PI / 2], c2: [-7.8, 1.5, -Math.PI / 2], idx: 4 },
                    { t: [-5.5, 1.5], c1: [-6.2, 1.5, Math.PI / 2], c2: [-4.8, 1.5, -Math.PI / 2], idx: 6 }
                ];

                bistroCoords.forEach(function(b) {
                    const tableMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.7, 12), furnitureWoodMat);
                    tableMesh.position.set(b.t[0], fy + 0.35, b.t[1]);
                    tableMesh.renderOrder = 0;
                    buildingGroup.add(tableMesh);

                    // Seat 1
                    const s1Name = "bistro_seat" + b.idx;
                    const c1Mesh = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), chairMat);
                    c1Mesh.position.set(b.c1[0], fy + 0.2, b.c1[1]);
                    c1Mesh.rotation.y = b.c1[2];
                    c1Mesh.renderOrder = 0;
                    buildingGroup.add(c1Mesh);
                    floorData.nodes[s1Name] = { pos: new THREE.Vector3(b.c1[0], fy, b.c1[1]), neighbors: ["cafe_order", "hallSW"] };
                    floorData.sitTargets[s1Name] = { sit: true, facing: b.c1[2] };

                    // Seat 2
                    const s2Name = "bistro_seat" + (b.idx + 1);
                    const c2Mesh = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), chairMat);
                    c2Mesh.position.set(b.c2[0], fy + 0.2, b.c2[1]);
                    c2Mesh.rotation.y = b.c2[2];
                    c2Mesh.renderOrder = 0;
                    buildingGroup.add(c2Mesh);
                    floorData.nodes[s2Name] = { pos: new THREE.Vector3(b.c2[0], fy, b.c2[1]), neighbors: ["cafe_order", "hallSW"] };
                    floorData.sitTargets[s2Name] = { sit: true, facing: b.c2[2] };
                });

                // Front Lounge (right side)
                const fCouch = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 1.8), couchMat);
                fCouch.position.set(9.5, fy + 0.25, 6);
                fCouch.renderOrder = 0;
                buildingGroup.add(fCouch);
                floorData.nodes["front_lounge_0"] = { pos: new THREE.Vector3(9.5, fy, 6), neighbors: ["hallSE", "lobby_center"] };
                floorData.sitTargets["front_lounge_0"] = { sit: true, facing: -Math.PI / 2 };

                const fChair1 = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 0.6), couchMat);
                fChair1.position.set(7.5, fy + 0.25, 4.5);
                fChair1.renderOrder = 0;
                buildingGroup.add(fChair1);
                floorData.nodes["front_lounge_1"] = { pos: new THREE.Vector3(7.5, fy, 4.5), neighbors: ["hallSE", "lobby_center"] };
                floorData.sitTargets["front_lounge_1"] = { sit: true, facing: 0 };

                const fChair2 = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 0.6), couchMat);
                fChair2.position.set(7.5, fy + 0.25, 7.5);
                fChair2.renderOrder = 0;
                buildingGroup.add(fChair2);
                floorData.nodes["front_lounge_2"] = { pos: new THREE.Vector3(7.5, fy, 7.5), neighbors: ["hallSE", "lobby_center"] };
                floorData.sitTargets["front_lounge_2"] = { sit: true, facing: Math.PI };

                // Back Lounge (z < 0)
                const bCouchN = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.5, 0.8), couchMat);
                bCouchN.position.set(7.5, fy + 0.25, -7);
                bCouchN.renderOrder = 0;
                buildingGroup.add(bCouchN);
                floorData.nodes["back_lounge_N"] = { pos: new THREE.Vector3(7.5, fy, -7), neighbors: ["hallNE"] };
                floorData.sitTargets["back_lounge_N"] = { sit: true, facing: 0 };

                const bCouchS = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.5, 0.8), couchMat);
                bCouchS.position.set(7.5, fy + 0.25, -4);
                bCouchS.renderOrder = 0;
                buildingGroup.add(bCouchS);
                floorData.nodes["back_lounge_S"] = { pos: new THREE.Vector3(7.5, fy, -4), neighbors: ["hallSE", "hallE"] };
                floorData.sitTargets["back_lounge_S"] = { sit: true, facing: Math.PI };

                // Conversation Pit (back left)
                const pitSeats = [
                    { name: "pit_N", pos: [-6.5, -7.0], facing: 0 },
                    { name: "pit_S", pos: [-6.5, -4.0], facing: Math.PI },
                    { name: "pit_E", pos: [-4.5, -5.5], facing: -Math.PI / 2 },
                    { name: "pit_W", pos: [-8.5, -5.5], facing: Math.PI / 2 }
                ];
                pitSeats.forEach(function(ps) {
                    const pChair = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 0.6), couchMat);
                    pChair.position.set(ps.pos[0], fy + 0.25, ps.pos[1]);
                    pChair.rotation.y = ps.facing;
                    pChair.renderOrder = 0;
                    buildingGroup.add(pChair);
                    floorData.nodes[ps.name] = { pos: new THREE.Vector3(ps.pos[0], fy, ps.pos[1]), neighbors: ["hallNW", "hallW"] };
                    floorData.sitTargets[ps.name] = { sit: true, facing: ps.facing };
                });

                // Waypoints: Reception, Kiosk, Water Coolers, Loiter spots
                const lobbyWaypoints = [
                    { name: "reception", pos: [-3, fy, 5], facing: 0, sit: false },
                    { name: "kiosk", pos: [2.5, fy, 6.2], facing: 0, sit: false },
                    { name: "lobby_wc_front", pos: [4.5, fy, 7.5], facing: 0, sit: false },
                    { name: "lobby_wc_back", pos: [4.5, fy, -7.5], facing: 0, sit: false },
                    { name: "lobby_stand_center", pos: [0, fy, 4.5], facing: 0, sit: false },
                    { name: "lobby_stand_NE", pos: [5, fy, 3], facing: 0, sit: false },
                    { name: "lobby_stand_NW", pos: [-5, fy, 3], facing: 0, sit: false },
                    { name: "lobby_stand_midE", pos: [7, fy, -1], facing: 0, sit: false },
                    { name: "lobby_stand_midW", pos: [-7, fy, -1], facing: 0, sit: false },
                    { name: "lobby_stand_entry", pos: [2, fy, 8], facing: 0, sit: false }
                ];

                lobbyWaypoints.forEach(function(wp) {
                    floorData.nodes[wp.name] = { pos: wp.pos, neighbors: ["lobby_center", "hallS", "hallSE", "hallSW"] };
                    floorData.sitTargets[wp.name] = { sit: wp.sit, facing: wp.facing };
                });

            } else {
                // Office Floors (Floors 1..5)

                // Interior Walls
                // 3 dividing walls for 4 back offices
                const divWallsX = [-5, 0, 5];
                divWallsX.forEach(function(wx) {
                    const wMesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 3, 6), intWallMat);
                    wMesh.position.set(wx, fy + 1.5, -6);
                    wMesh.renderOrder = 0;
                    buildingGroup.add(wMesh);
                });

                // Front wall of offices at z = -3 (with 1.2m doorways)
                // Segment 1: x in [-11, -8.1]
                const ow1 = new THREE.Mesh(new THREE.BoxGeometry(2.9, 3, 0.1), intWallMat);
                ow1.position.set(-9.55, fy + 1.5, -3);
                ow1.renderOrder = 0;
                buildingGroup.add(ow1);
                // Segment 2: x in [-6.9, -3.1]
                const ow2 = new THREE.Mesh(new THREE.BoxGeometry(3.8, 3, 0.1), intWallMat);
                ow2.position.set(-5.0, fy + 1.5, -3);
                ow2.renderOrder = 0;
                buildingGroup.add(ow2);
                // Segment 3: x in [-1.9, 1.9]
                const ow3 = new THREE.Mesh(new THREE.BoxGeometry(3.8, 3, 0.1), intWallMat);
                ow3.position.set(0.0, fy + 1.5, -3);
                ow3.renderOrder = 0;
                buildingGroup.add(ow3);
                // Segment 4: x in [3.1, 6.9]
                const ow4 = new THREE.Mesh(new THREE.BoxGeometry(3.8, 3, 0.1), intWallMat);
                ow4.position.set(5.0, fy + 1.5, -3);
                ow4.renderOrder = 0;
                buildingGroup.add(ow4);
                // Segment 5: x in [8.1, 11]
                const ow5 = new THREE.Mesh(new THREE.BoxGeometry(2.9, 3, 0.1), intWallMat);
                ow5.position.set(9.55, fy + 1.5, -3);
                ow5.renderOrder = 0;
                buildingGroup.add(ow5);

                // Conference Room Walls (front left x: [-11, -3], z: [3, 9])
                const confWallZ = new THREE.Mesh(new THREE.BoxGeometry(6.8, 3, 0.1), intWallMat);
                confWallZ.position.set(-7.6, fy + 1.5, 3);
                confWallZ.renderOrder = 0;
                buildingGroup.add(confWallZ);

                const confWallX = new THREE.Mesh(new THREE.BoxGeometry(0.1, 3, 6), intWallMat);
                confWallX.position.set(-3, fy + 1.5, 6);
                confWallX.renderOrder = 0;
                buildingGroup.add(confWallX);

                // Lounge Wall (front right x: [3, 11], z: [3, 9])
                const loungeWallZ = new THREE.Mesh(new THREE.BoxGeometry(6.8, 3, 0.1), intWallMat);
                loungeWallZ.position.set(7.6, fy + 1.5, 3);
                loungeWallZ.renderOrder = 0;
                buildingGroup.add(loungeWallZ);

                // 4 Private Offices (A, B, C, D)
                const offices = [
                    { id: "officeA", deskX: -7.5, doorX: -7.5, linkTo: "hallNW" },
                    { id: "officeB", deskX: -2.5, doorX: -2.5, linkTo: "hallN" },
                    { id: "officeC", deskX: 2.5, doorX: 2.5, linkTo: "hallN" },
                    { id: "officeD", deskX: 7.5, doorX: 7.5, linkTo: "hallNE" }
                ];

                offices.forEach(function(off) {
                    // Desk
                    const deskMesh = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.7, 0.8), furnitureWoodMat);
                    deskMesh.position.set(off.deskX, fy + 0.35, -7.5);
                    deskMesh.renderOrder = 0;
                    buildingGroup.add(deskMesh);

                    // Monitor
                    const monMesh = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.1), new THREE.MeshLambertMaterial({ color: 0x111111 }));
                    monMesh.position.set(off.deskX, fy + 0.9, -7.8);
                    monMesh.renderOrder = 0;
                    buildingGroup.add(monMesh);

                    // Chair
                    const chairMesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.5), chairMat);
                    chairMesh.position.set(off.deskX, fy + 0.2, -6.5);
                    chairMesh.rotation.y = Math.PI; // Chair opens toward desk (-Z)
                    chairMesh.renderOrder = 0;
                    buildingGroup.add(chairMesh);

                    const doorName = off.id + "_door";
                    const deskWpName = off.id + "_desk";

                    floorData.nodes[doorName] = { pos: new THREE.Vector3(off.doorX, fy, -3.2), neighbors: [off.linkTo, deskWpName] };
                    floorData.nodes[deskWpName] = { pos: new THREE.Vector3(off.deskX, fy, -6.5), neighbors: [doorName] };

                    link(doorName, off.linkTo);

                    // User sits at desk facing Math.PI (facing -Z towards desk & monitor!)
                    floorData.sitTargets[deskWpName] = { sit: true, facing: Math.PI };
                    floorData.desks.push({ id: off.id, doorWp: doorName, deskWp: deskWpName });
                });

                // Conference Room
                const confTable = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.7, 1.4), furnitureWoodMat);
                confTable.position.set(-7, fy + 0.35, 6);
                confTable.renderOrder = 0;
                buildingGroup.add(confTable);

                floorData.nodes["conf_door"] = { pos: new THREE.Vector3(-4, fy, 3.2), neighbors: ["hallSW", "conf_center"] };
                floorData.nodes["conf_center"] = { pos: new THREE.Vector3(-7, fy, 4.5), neighbors: ["conf_door"] };
                link("conf_door", "hallSW");

                // 4 Conference Seats
                const confSeats = [
                    { name: "conf_seat0", pos: [-8.0, 4.4], facing: 0 },         // South side, facing +Z towards table
                    { name: "conf_seat1", pos: [-6.0, 4.4], facing: 0 },         // South side, facing +Z towards table
                    { name: "conf_seat2", pos: [-8.0, 7.6], facing: Math.PI },   // North side, facing -Z towards table
                    { name: "conf_seat3", pos: [-6.0, 7.6], facing: Math.PI }    // North side, facing -Z towards table
                ];

                confSeats.forEach(function(cs) {
                    const cMesh = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.4, 0.45), chairMat);
                    cMesh.position.set(cs.pos[0], fy + 0.2, cs.pos[1]);
                    cMesh.rotation.y = cs.facing;
                    cMesh.renderOrder = 0;
                    buildingGroup.add(cMesh);

                    floorData.nodes[cs.name] = { pos: new THREE.Vector3(cs.pos[0], fy, cs.pos[1]), neighbors: ["conf_center"] };
                    link("conf_center", cs.name);
                    floorData.sitTargets[cs.name] = { sit: true, facing: cs.facing };
                });

                // Lounge / Break Area (front right x: [3, 11], z: [3, 9])
                const couchMesh = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 1.8), couchMat);
                couchMesh.position.set(9.5, fy + 0.25, 6);
                couchMesh.renderOrder = 0;
                buildingGroup.add(couchMesh);

                const cTable = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.35, 1.0), furnitureWoodMat);
                cTable.position.set(7.5, fy + 0.18, 6);
                cTable.renderOrder = 0;
                buildingGroup.add(cTable);

                floorData.nodes["lounge_door"] = { pos: new THREE.Vector3(4, fy, 3.2), neighbors: ["hallSE", "lounge_center"] };
                floorData.nodes["lounge_center"] = { pos: new THREE.Vector3(7, fy, 4.5), neighbors: ["lounge_door"] };
                link("lounge_door", "hallSE");

                const loungeSeats = [
                    { name: "lounge_spot0", pos: [9.5, 6.0], facing: -Math.PI / 2 },
                    { name: "lounge_spot1", pos: [7.5, 4.5], facing: 0 },
                    { name: "lounge_spot2", pos: [7.5, 7.5], facing: Math.PI }
                ];

                loungeSeats.forEach(function(ls) {
                    const lMesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.5), couchMat);
                    lMesh.position.set(ls.pos[0], fy + 0.2, ls.pos[1]);
                    lMesh.rotation.y = ls.facing;
                    lMesh.renderOrder = 0;
                    buildingGroup.add(lMesh);

                    floorData.nodes[ls.name] = { pos: new THREE.Vector3(ls.pos[0], fy, ls.pos[1]), neighbors: ["lounge_center"] };
                    link("lounge_center", ls.name);
                    floorData.sitTargets[ls.name] = { sit: true, facing: ls.facing };
                });

                // Water cooler & Hall standing spots
                floorData.nodes["water_cooler"] = { pos: new THREE.Vector3(4.5, fy, 7.5), neighbors: ["lounge_center", "hallSE"] };
                floorData.sitTargets["water_cooler"] = { sit: false, facing: 0 };
                link("lounge_center", "water_cooler");

                floorData.nodes["hall_stand_N"] = { pos: new THREE.Vector3(0, fy, -3.2), neighbors: ["hallN"] };
                floorData.sitTargets["hall_stand_N"] = { sit: false, facing: 0 };

                floorData.nodes["hall_stand_S"] = { pos: new THREE.Vector3(0, fy, 3.2), neighbors: ["hallS"] };
                floorData.sitTargets["hall_stand_S"] = { sit: false, facing: 0 };
            }

            floors.push(floorData);
        }

        scene.add(buildingGroup);

        return {
            buildingGroup: buildingGroup,
            floors: floors,
            bfsPath: bfsPath
        };
    }

    window.WORLD = WORLD;
    window.createWorld = createWorld;
    window.bfsPath = bfsPath;
})();
