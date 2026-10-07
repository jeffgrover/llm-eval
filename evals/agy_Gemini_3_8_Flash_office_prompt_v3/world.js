/**
 * world.js
 * Building geometry, per-floor layouts, furniture, navigation graphs, call panels.
 */

const WORLD = {
    FLOOR_HEIGHT: 3.4,
    FLOOR_COUNT: 6,
    BUILDING_WIDTH: 22,
    BUILDING_DEPTH: 18,
    SHAFT_WIDTH: 3,
    SHAFT_DEPTH: 3,
    PERSON_R: 0.4
};

function createDigitTexture(width, height) {
    const canvas = document.createElement("canvas");
    canvas.width = width || 256;
    canvas.height = height || 256;
    const ctx = canvas.getContext("2d");
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture._lastText = "";

    function update(text) {
        if (texture._lastText === text) return;
        texture._lastText = text;

        ctx.fillStyle = "#050505";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Border
        ctx.strokeStyle = "#222222";
        ctx.lineWidth = 4;
        ctx.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);

        ctx.fillStyle = "#ffbb22";
        ctx.shadowColor = "#ffaa00";
        ctx.shadowBlur = 14;
        ctx.font = `bold ${Math.floor(canvas.height * 0.72)}px monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(text, canvas.width / 2, canvas.height / 2);

        texture.needsUpdate = true;
    }

    update("0");
    return { texture: texture, update: update };
}

function createArrowGeometry(pointingUp) {
    const shape = new THREE.Shape();
    const halfW = 0.12;
    const h = 0.22;
    if (pointingUp) {
        shape.moveTo(0, h / 2);
        shape.lineTo(halfW, -h / 2);
        shape.lineTo(-halfW, -h / 2);
    } else {
        shape.moveTo(0, -h / 2);
        shape.lineTo(halfW, h / 2);
        shape.lineTo(-halfW, h / 2);
    }
    shape.closePath();
    return new THREE.ShapeGeometry(shape);
}

function createCallPanel(floorY) {
    const group = new THREE.Group();
    // Plate 0.55 x 1.4 x 0.05
    const plateGeo = new THREE.BoxGeometry(0.55, 1.4, 0.05);
    const plateMat = new THREE.MeshLambertMaterial({ color: 0x2b2b2b });
    const plate = new THREE.Mesh(plateGeo, plateMat);
    group.add(plate);

    // Screen
    const screenTex = createDigitTexture(256, 256);
    const screenGeo = new THREE.PlaneGeometry(0.42, 0.42);
    const screenMat = new THREE.MeshBasicMaterial({ map: screenTex.texture });
    const screenMesh = new THREE.Mesh(screenGeo, screenMat);
    screenMesh.position.set(0, 0.38, 0.028);
    group.add(screenMesh);

    // Arrows
    const unlitMat = new THREE.MeshBasicMaterial({ color: 0x222222 });
    const litMat = new THREE.MeshBasicMaterial({ color: 0x00ff44 });

    const upGeo = createArrowGeometry(true);
    const upMesh = new THREE.Mesh(upGeo, unlitMat);
    upMesh.position.set(0, 0.02, 0.028);
    group.add(upMesh);

    const downGeo = createArrowGeometry(false);
    const downMesh = new THREE.Mesh(downGeo, unlitMat);
    downMesh.position.set(0, -0.28, 0.028);
    group.add(downMesh);

    group.position.set(1.75, floorY + 1.4, 1.53);

    group.userData = {
        setUp: function(on) { upMesh.material = on ? litMat : unlitMat; },
        setDown: function(on) { downMesh.material = on ? litMat : unlitMat; },
        setIndicator: function(text) { screenTex.update(text); }
    };

    return group;
}

function createShaftIndicator(floorY) {
    const screenTex = createDigitTexture(256, 256);
    const geo = new THREE.PlaneGeometry(0.9, 0.9);
    const mat = new THREE.MeshBasicMaterial({ map: screenTex.texture, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(0, floorY + 2.7, 1.53);
    mesh.userData = {
        setIndicator: function(text) { screenTex.update(text); }
    };
    return mesh;
}

function bfsPath(nodes, fromName, toName) {
    if (!nodes[fromName] || !nodes[toName]) return [];
    if (fromName === toName) return [nodes[fromName].pos.clone()];

    const queue = [[fromName]];
    const visited = new Set([fromName]);

    while (queue.length > 0) {
        const path = queue.shift();
        const curr = path[path.length - 1];

        if (curr === toName) {
            return path.map(function(name) { return nodes[name].pos.clone(); });
        }

        const node = nodes[curr];
        if (!node || !node.neighbors) continue;

        for (let i = 0; i < node.neighbors.length; i++) {
            const next = node.neighbors[i];
            if (!visited.has(next)) {
                visited.add(next);
                queue.push(path.concat([next]));
            }
        }
    }
    return [nodes[fromName].pos.clone(), nodes[toName].pos.clone()];
}

function createChairMesh(color) {
    const chairGroup = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: color || 0x37474f });
    const legMat = new THREE.MeshLambertMaterial({ color: 0x222222 });

    // Seat cushion at y = 0.45, size 0.5 x 0.08 x 0.5
    const seatGeo = new THREE.BoxGeometry(0.5, 0.08, 0.5);
    const seatMesh = new THREE.Mesh(seatGeo, mat);
    seatMesh.position.set(0, 0.45, 0);
    chairGroup.add(seatMesh);

    // Backrest at -Z (local back)
    const backGeo = new THREE.BoxGeometry(0.5, 0.45, 0.08);
    const backMesh = new THREE.Mesh(backGeo, mat);
    backMesh.position.set(0, 0.68, -0.21);
    chairGroup.add(backMesh);

    // Legs
    const legGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.45, 6);
    const offsets = [
        [-0.2, 0.225, -0.2],
        [0.2, 0.225, -0.2],
        [-0.2, 0.225, 0.2],
        [0.2, 0.225, 0.2]
    ];
    for (let i = 0; i < offsets.length; i++) {
        const leg = new THREE.Mesh(legGeo, legMat);
        leg.position.set(offsets[i][0], offsets[i][1], offsets[i][2]);
        chairGroup.add(leg);
    }

    return chairGroup;
}

function createCouchMesh(width, color) {
    const couchGroup = new THREE.Group();
    const w = width || 1.8;
    const mat = new THREE.MeshLambertMaterial({ color: color || 0x455a64 });

    // Seat
    const seatGeo = new THREE.BoxGeometry(w, 0.35, 0.75);
    const seatMesh = new THREE.Mesh(seatGeo, mat);
    seatMesh.position.set(0, 0.35 / 2 + 0.1, 0);
    couchGroup.add(seatMesh);

    // Backrest at -Z
    const backGeo = new THREE.BoxGeometry(w, 0.5, 0.2);
    const backMesh = new THREE.Mesh(backGeo, mat);
    backMesh.position.set(0, 0.55, -0.28);
    couchGroup.add(backMesh);

    // Armrests
    const armGeo = new THREE.BoxGeometry(0.2, 0.4, 0.75);
    const leftArm = new THREE.Mesh(armGeo, mat);
    leftArm.position.set(-w / 2 + 0.1, 0.45, 0);
    couchGroup.add(leftArm);
    const rightArm = new THREE.Mesh(armGeo, mat);
    rightArm.position.set(w / 2 - 0.1, 0.45, 0);
    couchGroup.add(rightArm);

    return couchGroup;
}

function createDeskMesh() {
    const deskGroup = new THREE.Group();
    const woodMat = new THREE.MeshLambertMaterial({ color: 0x8d6e63 });
    const metalMat = new THREE.MeshLambertMaterial({ color: 0x333333 });

    // Desktop: 1.8 x 0.08 x 0.9 at y = 0.72
    const topGeo = new THREE.BoxGeometry(1.8, 0.08, 0.9);
    const topMesh = new THREE.Mesh(topGeo, woodMat);
    topMesh.position.set(0, 0.72, 0);
    deskGroup.add(topMesh);

    // Legs
    const legGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.7, 8);
    const legOffsets = [
        [-0.82, 0.35, -0.38],
        [0.82, 0.35, -0.38],
        [-0.82, 0.35, 0.38],
        [0.82, 0.35, 0.38]
    ];
    for (let i = 0; i < legOffsets.length; i++) {
        const leg = new THREE.Mesh(legGeo, metalMat);
        leg.position.set(legOffsets[i][0], legOffsets[i][1], legOffsets[i][2]);
        deskGroup.add(leg);
    }

    // Monitor on back of desk (-Z)
    const monBase = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.02, 0.2), metalMat);
    monBase.position.set(0, 0.77, -0.22);
    deskGroup.add(monBase);

    const monStem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.2, 6), metalMat);
    monStem.position.set(0, 0.87, -0.22);
    deskGroup.add(monStem);

    const screenGeo = new THREE.BoxGeometry(0.65, 0.4, 0.03);
    const screenMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
    const screenMesh = new THREE.Mesh(screenGeo, screenMat);
    screenMesh.position.set(0, 1.05, -0.22);
    deskGroup.add(screenMesh);

    return deskGroup;
}

function createWaterCooler() {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0xe0e0e0 });
    const bottleMat = new THREE.MeshLambertMaterial({
        color: 0x00b0ff,
        transparent: true,
        opacity: 0.75,
        depthWrite: false,
        side: THREE.DoubleSide
    });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.9, 0.4), bodyMat);
    body.position.set(0, 0.45, 0);
    group.add(body);

    const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.45, 10), bottleMat);
    bottle.position.set(0, 1.15, 0);
    group.add(bottle);

    return group;
}

function createPottedPlant() {
    const group = new THREE.Group();
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.18, 0.45, 10), new THREE.MeshLambertMaterial({ color: 0xd7ccc8 }));
    pot.position.set(0, 0.225, 0);
    group.add(pot);

    const leaves = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 8), new THREE.MeshLambertMaterial({ color: 0x2e7d32 }));
    leaves.position.set(0, 0.65, 0);
    group.add(leaves);
    return group;
}

function createWorld(scene) {
    const buildingGroup = new THREE.Group();
    buildingGroup.renderOrder = 0;

    const floorHeight = WORLD.FLOOR_HEIGHT;
    const floorCount = WORLD.FLOOR_COUNT;
    const bWidth = WORLD.BUILDING_WIDTH;
    const bDepth = WORLD.BUILDING_DEPTH;
    const shaftW = WORLD.SHAFT_WIDTH;
    const shaftD = WORLD.SHAFT_DEPTH;
    const totalHeight = floorCount * floorHeight;

    // Materials
    const groundMat = new THREE.MeshLambertMaterial({ color: 0x474b52 });
    const sidewalkMat = new THREE.MeshLambertMaterial({ color: 0x858990 });
    const roofMat = new THREE.MeshLambertMaterial({ color: 0x373b42 });

    const floorMat = new THREE.MeshLambertMaterial({
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

    const innerWallMat = new THREE.MeshLambertMaterial({
        color: 0xbbc5e6,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
        side: THREE.DoubleSide
    });

    // 1. Ground Slab (Floor 0 floor)
    const groundSlab = new THREE.Mesh(new THREE.BoxGeometry(bWidth, 0.2, bDepth), groundMat);
    groundSlab.position.set(0, -0.1, 0);
    buildingGroup.add(groundSlab);

    // Sidewalk outside front wall at z = +12
    const sidewalk = new THREE.Mesh(new THREE.BoxGeometry(16, 0.15, 6), sidewalkMat);
    sidewalk.position.set(0, -0.075, 12);
    buildingGroup.add(sidewalk);

    // Roof Slab at top
    const roof = new THREE.Mesh(new THREE.BoxGeometry(bWidth, 0.2, bDepth), roofMat);
    roof.position.set(0, totalHeight + 0.1, 0);
    buildingGroup.add(roof);

    // 2. Intermediate Floor Slabs (floors 1..5) as 4 strips around shaft
    for (let f = 1; f < floorCount; f++) {
        const fy = f * floorHeight;
        // North strip: z in [-9, -1.5], depth 7.5, center z = -5.25
        const nStrip = new THREE.Mesh(new THREE.BoxGeometry(bWidth, 0.08, (bDepth - shaftD) / 2), floorMat);
        nStrip.position.set(0, fy - 0.04, -(bDepth / 2 + shaftD / 2) / 2);
        buildingGroup.add(nStrip);

        // South strip: z in [1.5, 9], depth 7.5, center z = 5.25
        const sStrip = new THREE.Mesh(new THREE.BoxGeometry(bWidth, 0.08, (bDepth - shaftD) / 2), floorMat);
        sStrip.position.set(0, fy - 0.04, (bDepth / 2 + shaftD / 2) / 2);
        buildingGroup.add(sStrip);

        // West strip: x in [-11, -1.5], width 9.5, center x = -6.25, z in [-1.5, 1.5]
        const wStrip = new THREE.Mesh(new THREE.BoxGeometry((bWidth - shaftW) / 2, 0.08, shaftD), floorMat);
        wStrip.position.set(-(bWidth / 2 + shaftW / 2) / 2, fy - 0.04, 0);
        buildingGroup.add(wStrip);

        // East strip: x in [1.5, 11], width 9.5, center x = 6.25, z in [-1.5, 1.5]
        const eStrip = new THREE.Mesh(new THREE.BoxGeometry((bWidth - shaftW) / 2, 0.08, shaftD), floorMat);
        eStrip.position.set((bWidth / 2 + shaftW / 2) / 2, fy - 0.04, 0);
        buildingGroup.add(eStrip);
    }

    // 3. Outer Walls
    // Back wall (z = -9): full width 22, full height 20.4
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(bWidth, totalHeight, 0.08), outerWallMat);
    backWall.position.set(0, totalHeight / 2, -bDepth / 2);
    buildingGroup.add(backWall);

    // Left wall (x = -11): full depth 18, full height 20.4
    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.08, totalHeight, bDepth), outerWallMat);
    leftWall.position.set(-bWidth / 2, totalHeight / 2, 0);
    buildingGroup.add(leftWall);

    // Right wall (x = +11): full depth 18, full height 20.4
    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.08, totalHeight, bDepth), outerWallMat);
    rightWall.position.set(bWidth / 2, totalHeight / 2, 0);
    buildingGroup.add(rightWall);

    // Front wall (z = +9):
    // 3-unit-wide gap on floor 0 centered at x = 0 (entrance doorway: x in [-1.5, 1.5], y in [0, 3.4])
    // Left panel: x in [-11, -1.5], width 9.5, height 20.4
    const frontLeft = new THREE.Mesh(new THREE.BoxGeometry((bWidth - 3) / 2, totalHeight, 0.08), outerWallMat);
    frontLeft.position.set(-(bWidth / 2 + 1.5) / 2, totalHeight / 2, bDepth / 2);
    buildingGroup.add(frontLeft);

    // Right panel: x in [1.5, 11], width 9.5, height 20.4
    const frontRight = new THREE.Mesh(new THREE.BoxGeometry((bWidth - 3) / 2, totalHeight, 0.08), outerWallMat);
    frontRight.position.set((bWidth / 2 + 1.5) / 2, totalHeight / 2, bDepth / 2);
    buildingGroup.add(frontRight);

    // Above-the-gap panel: x in [-1.5, 1.5], width 3.0, height covering floors 1..5 (from y=3.4 to 20.4, height 17.0)
    const upperHeight = totalHeight - floorHeight;
    const frontUpper = new THREE.Mesh(new THREE.BoxGeometry(3.0, upperHeight, 0.08), outerWallMat);
    frontUpper.position.set(0, floorHeight + upperHeight / 2, bDepth / 2);
    buildingGroup.add(frontUpper);

    // Entrance visual glass doors (positioned open / wide so agents pass freely)
    const doorGlassMat = new THREE.MeshLambertMaterial({
        color: 0xbbd7ff,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
        side: THREE.DoubleSide
    });
    const doorL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.7, 1.2), doorGlassMat);
    doorL.position.set(-1.42, 1.35, 9.5);
    doorL.rotation.y = 0.2;
    buildingGroup.add(doorL);

    const doorR = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.7, 1.2), doorGlassMat);
    doorR.position.set(1.42, 1.35, 9.5);
    doorR.rotation.y = -0.2;
    buildingGroup.add(doorR);

    // Potted plants by entrance
    const plant1 = createPottedPlant();
    plant1.position.set(-2.0, 0, 8.4);
    buildingGroup.add(plant1);
    const plant2 = createPottedPlant();
    plant2.position.set(2.0, 0, 8.4);
    buildingGroup.add(plant2);

    // Setup floors data structure
    const floors = [];

    // Build Floors 0 through 5
    for (let f = 0; f < floorCount; f++) {
        const fy = f * floorHeight;
        const nodes = {};
        const sitTargets = {};
        const desks = [];

        // Call panel and shaft indicator on each floor
        const callPanel = createCallPanel(fy);
        buildingGroup.add(callPanel);

        const shaftIndicator = createShaftIndicator(fy);
        buildingGroup.add(shaftIndicator);

        if (f === 0) {
            // ==================== LOBBY (Floor 0) ====================
            // Navigation nodes
            nodes["outside"] = { pos: new THREE.Vector3(0, 0, 12), neighbors: ["front_door_threshold"] };
            nodes["front_door_threshold"] = { pos: new THREE.Vector3(0, 0, 9.35), neighbors: ["outside", "entrance"] };
            nodes["entrance"] = { pos: new THREE.Vector3(0, 0, 7.4), neighbors: ["front_door_threshold", "lobby_center", "kiosk", "reception", "lobby_stand_entry"] };
            nodes["lobby_center"] = { pos: new THREE.Vector3(0, 0, 4.5), neighbors: ["entrance", "elevWait", "cafe_order", "front_lounge_center", "lobby_stand_center"] };
            nodes["elevWait"] = { pos: new THREE.Vector3(0, 0, 2.2), neighbors: ["lobby_center", "hallE", "hallW", "hallS"] };

            // Hallway ring nodes around shaft
            nodes["hallS"] = { pos: new THREE.Vector3(0, 0, 2.4), neighbors: ["elevWait", "hallSE", "hallSW"] };
            nodes["hallSE"] = { pos: new THREE.Vector3(2.5, 0, 2.4), neighbors: ["hallS", "hallE", "front_lounge_center"] };
            nodes["hallE"] = { pos: new THREE.Vector3(2.5, 0, 0), neighbors: ["hallSE", "hallNE", "lobby_stand_midE"] };
            nodes["hallNE"] = { pos: new THREE.Vector3(2.5, 0, -2.4), neighbors: ["hallE", "hallN", "back_lounge_center"] };
            nodes["hallN"] = { pos: new THREE.Vector3(0, 0, -2.4), neighbors: ["hallNE", "hallNW"] };
            nodes["hallNW"] = { pos: new THREE.Vector3(-2.5, 0, -2.4), neighbors: ["hallN", "hallW", "pit_center"] };
            nodes["hallW"] = { pos: new THREE.Vector3(-2.5, 0, 0), neighbors: ["hallNW", "hallSW", "cafe_order", "lobby_stand_midW"] };
            nodes["hallSW"] = { pos: new THREE.Vector3(-2.5, 0, 2.4), neighbors: ["hallW", "hallS", "reception"] };

            // Cafe on the left
            const counterMat = new THREE.MeshLambertMaterial({ color: 0x4e342e });
            const topMat = new THREE.MeshLambertMaterial({ color: 0x212121 });
            const cafeCounter = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.95, 4.5), counterMat);
            cafeCounter.position.set(-8.5, 0.475, 0);
            buildingGroup.add(cafeCounter);
            const cafeTop = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.08, 4.65), topMat);
            cafeTop.position.set(-8.5, 0.99, 0);
            buildingGroup.add(cafeTop);

            // Coffee machine and pastry display
            const coffeeMachine = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.45, 0.6), new THREE.MeshLambertMaterial({ color: 0x90a4ae }));
            coffeeMachine.position.set(-8.5, 1.25, -1.2);
            buildingGroup.add(coffeeMachine);
            const pastryCase = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.35, 1.2), new THREE.MeshLambertMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: 0.5,
                depthWrite: false,
                side: THREE.DoubleSide
            }));
            pastryCase.position.set(-8.5, 1.2, 0.8);
            buildingGroup.add(pastryCase);

            nodes["cafe_order"] = { pos: new THREE.Vector3(-7.0, 0, 0), neighbors: ["lobby_center", "hallW", "cafe_bistro0_a", "cafe_bistro1_a"] };
            sitTargets["cafe_order"] = { sit: false, facing: -Math.PI / 2 };

            // 4 Bistro tables in cafe
            const bistroTableCoords = [
                { x: -5.5, z: 2.2, tName: "0" },
                { x: -5.5, z: -2.2, tName: "1" },
                { x: -8.0, z: 3.5, tName: "2" },
                { x: -8.0, z: -3.5, tName: "3" }
            ];

            for (let b = 0; b < bistroTableCoords.length; b++) {
                const tc = bistroTableCoords[b];
                const tableMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.72, 12), new THREE.MeshLambertMaterial({ color: 0x3e2723 }));
                tableMesh.position.set(tc.x, 0.36, tc.z);
                buildingGroup.add(tableMesh);

                const cAName = `cafe_bistro${tc.tName}_a`;
                const cBName = `cafe_bistro${tc.tName}_b`;

                // Chair A at z - 0.65, facing +Z (0) toward table
                const chairA = createChairMesh(0x546e7a);
                chairA.position.set(tc.x, 0, tc.z - 0.65);
                chairA.rotation.y = 0;
                buildingGroup.add(chairA);
                nodes[cAName] = { pos: new THREE.Vector3(tc.x, 0, tc.z - 0.65), neighbors: ["cafe_order", "lobby_center"] };
                sitTargets[cAName] = { sit: true, facing: 0 };

                // Chair B at z + 0.65, facing -Z (PI) toward table
                const chairB = createChairMesh(0x546e7a);
                chairB.position.set(tc.x, 0, tc.z + 0.65);
                chairB.rotation.y = Math.PI;
                buildingGroup.add(chairB);
                nodes[cBName] = { pos: new THREE.Vector3(tc.x, 0, tc.z + 0.65), neighbors: ["cafe_order", "lobby_center"] };
                sitTargets[cBName] = { sit: true, facing: Math.PI };
            }

            // Front Lounge (right side)
            nodes["front_lounge_center"] = { pos: new THREE.Vector3(7.0, 0, 6.0), neighbors: ["lobby_center", "hallSE", "front_lounge_couch", "front_lounge_chair1", "front_lounge_chair2"] };
            const flCouch = createCouchMesh(2.2, 0x3949ab);
            flCouch.position.set(7.0, 0, 7.5);
            flCouch.rotation.y = Math.PI; // facing -Z into room
            buildingGroup.add(flCouch);
            nodes["front_lounge_couch"] = { pos: new THREE.Vector3(7.0, 0, 7.2), neighbors: ["front_lounge_center"] };
            sitTargets["front_lounge_couch"] = { sit: true, facing: Math.PI };

            const flCoffeeTable = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.35, 0.8), new THREE.MeshLambertMaterial({ color: 0x4e342e }));
            flCoffeeTable.position.set(7.0, 0.175, 6.0);
            buildingGroup.add(flCoffeeTable);

            const flChair1 = createChairMesh(0x283593);
            flChair1.position.set(5.3, 0, 6.0);
            flChair1.rotation.y = Math.PI / 2; // facing +X toward coffee table
            buildingGroup.add(flChair1);
            nodes["front_lounge_chair1"] = { pos: new THREE.Vector3(5.5, 0, 6.0), neighbors: ["front_lounge_center"] };
            sitTargets["front_lounge_chair1"] = { sit: true, facing: Math.PI / 2 };

            const flChair2 = createChairMesh(0x283593);
            flChair2.position.set(8.7, 0, 6.0);
            flChair2.rotation.y = -Math.PI / 2; // facing -X toward coffee table
            buildingGroup.add(flChair2);
            nodes["front_lounge_chair2"] = { pos: new THREE.Vector3(8.5, 0, 6.0), neighbors: ["front_lounge_center"] };
            sitTargets["front_lounge_chair2"] = { sit: true, facing: -Math.PI / 2 };

            // Back Lounge (z < -3, x > 1)
            nodes["back_lounge_center"] = { pos: new THREE.Vector3(5.5, 0, -6.0), neighbors: ["hallNE", "back_lounge_N", "back_lounge_S"] };
            const blCoffeeTable = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.35, 0.8), new THREE.MeshLambertMaterial({ color: 0x4e342e }));
            blCoffeeTable.position.set(5.5, 0.175, -6.0);
            buildingGroup.add(blCoffeeTable);

            // Couch N facing +Z (0)
            const blCouchN = createCouchMesh(2.0, 0x00695c);
            blCouchN.position.set(5.5, 0, -7.3);
            blCouchN.rotation.y = 0;
            buildingGroup.add(blCouchN);
            nodes["back_lounge_N"] = { pos: new THREE.Vector3(5.5, 0, -7.0), neighbors: ["back_lounge_center"] };
            sitTargets["back_lounge_N"] = { sit: true, facing: 0 };

            // Couch S facing -Z (PI)
            const blCouchS = createCouchMesh(2.0, 0x00695c);
            blCouchS.position.set(5.5, 0, -4.7);
            blCouchS.rotation.y = Math.PI;
            buildingGroup.add(blCouchS);
            nodes["back_lounge_S"] = { pos: new THREE.Vector3(5.5, 0, -5.0), neighbors: ["back_lounge_center"] };
            sitTargets["back_lounge_S"] = { sit: true, facing: Math.PI };

            // Conversation pit (back-left, z < -3, x < -2)
            nodes["pit_center"] = { pos: new THREE.Vector3(-5.5, 0, -6.0), neighbors: ["hallNW", "pit_N", "pit_S", "pit_E", "pit_W"] };
            const pitTable = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.4, 12), new THREE.MeshLambertMaterial({ color: 0x37474f }));
            pitTable.position.set(-5.5, 0.2, -6.0);
            buildingGroup.add(pitTable);

            // Pit armchairs
            const pitChairN = createChairMesh(0xd84315);
            pitChairN.position.set(-5.5, 0, -7.1);
            pitChairN.rotation.y = 0; // facing +Z toward table
            buildingGroup.add(pitChairN);
            nodes["pit_N"] = { pos: new THREE.Vector3(-5.5, 0, -7.0), neighbors: ["pit_center"] };
            sitTargets["pit_N"] = { sit: true, facing: 0 };

            const pitChairS = createChairMesh(0xd84315);
            pitChairS.position.set(-5.5, 0, -4.9);
            pitChairS.rotation.y = Math.PI; // facing -Z toward table
            buildingGroup.add(pitChairS);
            nodes["pit_S"] = { pos: new THREE.Vector3(-5.5, 0, -5.0), neighbors: ["pit_center"] };
            sitTargets["pit_S"] = { sit: true, facing: Math.PI };

            const pitChairE = createChairMesh(0xd84315);
            pitChairE.position.set(-4.4, 0, -6.0);
            pitChairE.rotation.y = -Math.PI / 2; // facing -X toward table
            buildingGroup.add(pitChairE);
            nodes["pit_E"] = { pos: new THREE.Vector3(-4.5, 0, -6.0), neighbors: ["pit_center"] };
            sitTargets["pit_E"] = { sit: true, facing: -Math.PI / 2 };

            const pitChairW = createChairMesh(0xd84315);
            pitChairW.position.set(-6.6, 0, -6.0);
            pitChairW.rotation.y = Math.PI / 2; // facing +X toward table
            buildingGroup.add(pitChairW);
            nodes["pit_W"] = { pos: new THREE.Vector3(-6.5, 0, -6.0), neighbors: ["pit_center"] };
            sitTargets["pit_W"] = { sit: true, facing: Math.PI / 2 };

            // Water coolers in lobby
            const wcFront = createWaterCooler();
            wcFront.position.set(4.5, 0, 3.2);
            buildingGroup.add(wcFront);
            nodes["lobby_wc_front"] = { pos: new THREE.Vector3(4.5, 0, 3.8), neighbors: ["lobby_center", "front_lounge_center"] };
            sitTargets["lobby_wc_front"] = { sit: false, facing: -Math.PI / 2 };

            const wcBack = createWaterCooler();
            wcBack.position.set(-2.5, 0, -5.5);
            buildingGroup.add(wcBack);
            nodes["lobby_wc_back"] = { pos: new THREE.Vector3(-2.5, 0, -4.8), neighbors: ["hallNW", "pit_center"] };
            sitTargets["lobby_wc_back"] = { sit: false, facing: Math.PI / 2 };

            // Reception desk tucked at x = -3, z = 6
            const recDesk = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.95, 0.8), new THREE.MeshLambertMaterial({ color: 0x5d4037 }));
            recDesk.position.set(-3.0, 0.475, 6.2);
            buildingGroup.add(recDesk);
            nodes["reception"] = { pos: new THREE.Vector3(-3.0, 0, 5.0), neighbors: ["entrance", "lobby_center", "hallSW"] };
            sitTargets["reception"] = { sit: false, facing: 0 };

            // Info Kiosk at x = 3, z = 7.5
            const kioskMesh = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.3, 0.4), new THREE.MeshLambertMaterial({ color: 0x0277bd }));
            kioskMesh.position.set(3.0, 0.65, 7.5);
            buildingGroup.add(kioskMesh);
            nodes["kiosk"] = { pos: new THREE.Vector3(3.0, 0, 6.7), neighbors: ["entrance", "lobby_center"] };
            sitTargets["kiosk"] = { sit: false, facing: 0 };

            // Generic loiter waypoints
            nodes["lobby_stand_center"] = { pos: new THREE.Vector3(1.5, 0, 4.0), neighbors: ["lobby_center", "front_lounge_center"] };
            sitTargets["lobby_stand_center"] = { sit: false, facing: -Math.PI / 4 };

            nodes["lobby_stand_NE"] = { pos: new THREE.Vector3(6.0, 0, 2.0), neighbors: ["hallSE", "hallE"] };
            sitTargets["lobby_stand_NE"] = { sit: false, facing: -Math.PI / 2 };

            nodes["lobby_stand_NW"] = { pos: new THREE.Vector3(-4.5, 0, 5.0), neighbors: ["entrance", "reception"] };
            sitTargets["lobby_stand_NW"] = { sit: false, facing: Math.PI / 4 };

            nodes["lobby_stand_midE"] = { pos: new THREE.Vector3(7.0, 0, -1.0), neighbors: ["hallE", "back_lounge_center"] };
            sitTargets["lobby_stand_midE"] = { sit: false, facing: -Math.PI / 2 };

            nodes["lobby_stand_midW"] = { pos: new THREE.Vector3(-4.0, 0, 0), neighbors: ["hallW", "cafe_order"] };
            sitTargets["lobby_stand_midW"] = { sit: false, facing: Math.PI / 2 };

            nodes["lobby_stand_entry"] = { pos: new THREE.Vector3(-1.8, 0, 7.5), neighbors: ["entrance", "reception"] };
            sitTargets["lobby_stand_entry"] = { sit: false, facing: 0 };

        } else {
            // ==================== OFFICE FLOORS (Floors 1..5) ====================
            // Interior walls
            // Partition wall separating offices from hallway at z = -3 (with 1.2m gaps for office doors)
            // Office A door at x = -8.25, B at -2.75, C at 2.75, D at 8.25
            const wallH = 3.2;

            // Office dividers at x = -5.5, 0, 5.5 from z = -9 to -3
            const divA = new THREE.Mesh(new THREE.BoxGeometry(0.08, wallH, 6.0), innerWallMat);
            divA.position.set(-5.5, fy + wallH / 2, -6.0);
            buildingGroup.add(divA);

            const divB = new THREE.Mesh(new THREE.BoxGeometry(0.08, wallH, 6.0), innerWallMat);
            divB.position.set(0, fy + wallH / 2, -6.0);
            buildingGroup.add(divB);

            const divC = new THREE.Mesh(new THREE.BoxGeometry(0.08, wallH, 6.0), innerWallMat);
            divC.position.set(5.5, fy + wallH / 2, -6.0);
            buildingGroup.add(divC);

            // Office front wall segments along z = -3 with doorway gaps
            // [-11, -8.85], [-7.65, -3.35], [-2.15, -0.6], [0.6, 2.15], [3.35, 7.65], [8.85, 11]
            const wallSegments = [
                { x1: -11, x2: -8.85 },
                { x1: -7.65, x2: -3.35 },
                { x1: -2.15, x2: -0.6 },
                { x1: 0.6, x2: 2.15 },
                { x1: 3.35, x2: 7.65 },
                { x1: 8.85, x2: 11 }
            ];
            for (let s = 0; s < wallSegments.length; s++) {
                const seg = wallSegments[s];
                const sw = seg.x2 - seg.x1;
                const sm = new THREE.Mesh(new THREE.BoxGeometry(sw, wallH, 0.08), innerWallMat);
                sm.position.set((seg.x1 + seg.x2) / 2, fy + wallH / 2, -3.0);
                buildingGroup.add(sm);
            }

            // Conference Room walls (front-left: x: [-11, -3], z: [3, 9])
            // Wall at x = -3 (z in [3, 9])
            const confWallX = new THREE.Mesh(new THREE.BoxGeometry(0.08, wallH, 6.0), innerWallMat);
            confWallX.position.set(-3.0, fy + wallH / 2, 6.0);
            buildingGroup.add(confWallX);

            // Wall at z = 3 (x in [-11, -3]) with doorway at x = -4.5 (width 1.2)
            const confWallZ1 = new THREE.Mesh(new THREE.BoxGeometry(5.9, wallH, 0.08), innerWallMat);
            confWallZ1.position.set(-8.05, fy + wallH / 2, 3.0);
            buildingGroup.add(confWallZ1);
            const confWallZ2 = new THREE.Mesh(new THREE.BoxGeometry(0.9, wallH, 0.08), innerWallMat);
            confWallZ2.position.set(-3.45, fy + wallH / 2, 3.0);
            buildingGroup.add(confWallZ2);

            // Lounge walls (front-right: x: [3, 11], z: [3, 9])
            // Wall at x = 3 (z in [3, 9])
            const loungeWallX = new THREE.Mesh(new THREE.BoxGeometry(0.08, wallH, 6.0), innerWallMat);
            loungeWallX.position.set(3.0, fy + wallH / 2, 6.0);
            buildingGroup.add(loungeWallX);

            // Wall at z = 3 (x in [3, 11]) with doorway at x = 4.5 (width 1.2)
            const loungeWallZ1 = new THREE.Mesh(new THREE.BoxGeometry(0.9, wallH, 0.08), innerWallMat);
            loungeWallZ1.position.set(3.45, fy + wallH / 2, 3.0);
            buildingGroup.add(loungeWallZ1);
            const loungeWallZ2 = new THREE.Mesh(new THREE.BoxGeometry(5.9, wallH, 0.08), innerWallMat);
            loungeWallZ2.position.set(8.05, fy + wallH / 2, 3.0);
            buildingGroup.add(loungeWallZ2);

            // Hallway ring nodes around shaft
            nodes["hallS"] = { pos: new THREE.Vector3(0, fy, 2.4), neighbors: ["elevWait", "hallSE", "hallSW"] };
            nodes["hallSE"] = { pos: new THREE.Vector3(2.5, fy, 2.4), neighbors: ["hallS", "hallE", "lounge_door", "hall_stand_S"] };
            nodes["hallE"] = { pos: new THREE.Vector3(2.5, fy, 0), neighbors: ["hallSE", "hallNE"] };
            nodes["hallNE"] = { pos: new THREE.Vector3(2.5, fy, -2.4), neighbors: ["hallE", "hallN", "officeC_door", "officeD_door"] };
            nodes["hallN"] = { pos: new THREE.Vector3(0, fy, -2.4), neighbors: ["hallNE", "hallNW", "hall_stand_N"] };
            nodes["hallNW"] = { pos: new THREE.Vector3(-2.5, fy, -2.4), neighbors: ["hallN", "hallW", "officeA_door", "officeB_door"] };
            nodes["hallW"] = { pos: new THREE.Vector3(-2.5, fy, 0), neighbors: ["hallNW", "hallSW"] };
            nodes["hallSW"] = { pos: new THREE.Vector3(-2.5, fy, 2.4), neighbors: ["hallW", "hallS", "conf_door"] };
            nodes["elevWait"] = { pos: new THREE.Vector3(0, fy, 2.2), neighbors: ["hallS"] };

            // Four private offices along back wall
            const officeConfigs = [
                { id: "A", x: -8.25, doorNode: "officeA_door", deskNode: "officeA_desk" },
                { id: "B", x: -2.75, doorNode: "officeB_door", deskNode: "officeB_desk" },
                { id: "C", x: 2.75, doorNode: "officeC_door", deskNode: "officeC_desk" },
                { id: "D", x: 8.25, doorNode: "officeD_door", deskNode: "officeD_desk" }
            ];

            for (let o = 0; o < officeConfigs.length; o++) {
                const conf = officeConfigs[o];
                // Desk at z = -6.5
                const desk = createDeskMesh();
                desk.position.set(conf.x, fy, -6.5);
                buildingGroup.add(desk);

                // Chair in front of desk at z = -5.5 facing -Z (Math.PI)
                // "the user sits in the chair facing the desk (-Z)... office-desk chairs have rotation.y = Math.PI
                // so the seat opens toward the monitor; the person faces the monitor (Math.PI)"
                const chair = createChairMesh(0x263238);
                chair.position.set(conf.x, fy, -5.5);
                chair.rotation.y = Math.PI; // seat facing -Z toward desk, backrest at -5.0 toward door
                buildingGroup.add(chair);

                nodes[conf.doorNode] = {
                    pos: new THREE.Vector3(conf.x, fy, -3.0),
                    neighbors: [conf.deskNode, o < 2 ? "hallNW" : "hallNE"]
                };
                nodes[conf.deskNode] = {
                    pos: new THREE.Vector3(conf.x, fy, -5.5),
                    neighbors: [conf.doorNode]
                };
                sitTargets[conf.deskNode] = { sit: true, facing: Math.PI };

                desks.push({
                    id: `F${f}_${conf.id}`,
                    floor: f,
                    deskWpName: conf.deskNode,
                    doorWpName: conf.doorNode,
                    x: conf.x,
                    y: fy,
                    z: -5.5
                });
            }

            // Conference Room (front-left: x: [-11, -3], z: [3, 9])
            nodes["conf_door"] = { pos: new THREE.Vector3(-4.5, fy, 3.0), neighbors: ["hallSW", "conf_center"] };
            nodes["conf_center"] = { pos: new THREE.Vector3(-7.0, fy, 6.0), neighbors: ["conf_door", "conf_seat0", "conf_seat1", "conf_seat2", "conf_seat3"] };

            // Long table along Z
            const confTable = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.75, 3.2), new THREE.MeshLambertMaterial({ color: 0x4e342e }));
            confTable.position.set(-7.0, fy + 0.375, 6.0);
            buildingGroup.add(confTable);

            // 4 Conference chairs: 2 on left facing +X (Math.PI/2), 2 on right facing -X (-Math.PI/2)
            const seatPositions = [
                { name: "conf_seat0", x: -8.1, z: 5.2, facing: Math.PI / 2 },
                { name: "conf_seat1", x: -8.1, z: 6.8, facing: Math.PI / 2 },
                { name: "conf_seat2", x: -5.9, z: 5.2, facing: -Math.PI / 2 },
                { name: "conf_seat3", x: -5.9, z: 6.8, facing: -Math.PI / 2 }
            ];

            for (let sc = 0; sc < seatPositions.length; sc++) {
                const sp = seatPositions[sc];
                const cMesh = createChairMesh(0x37474f);
                cMesh.position.set(sp.x, fy, sp.z);
                cMesh.rotation.y = sp.facing;
                buildingGroup.add(cMesh);

                nodes[sp.name] = { pos: new THREE.Vector3(sp.x, fy, sp.z), neighbors: ["conf_center"] };
                sitTargets[sp.name] = { sit: true, facing: sp.facing };
            }

            // Lounge / Break area (front-right: x: [3, 11], z: [3, 9])
            nodes["lounge_door"] = { pos: new THREE.Vector3(4.5, fy, 3.0), neighbors: ["hallSE", "lounge_center"] };
            nodes["lounge_center"] = { pos: new THREE.Vector3(7.0, fy, 6.0), neighbors: ["lounge_door", "lounge_spot0", "lounge_spot1", "lounge_spot2", "water_cooler"] };

            // Couch facing -Z (Math.PI)
            const oCouch = createCouchMesh(2.2, 0x1565c0);
            oCouch.position.set(7.0, fy, 7.5);
            oCouch.rotation.y = Math.PI;
            buildingGroup.add(oCouch);
            nodes["lounge_spot0"] = { pos: new THREE.Vector3(7.0, fy, 7.2), neighbors: ["lounge_center"] };
            sitTargets["lounge_spot0"] = { sit: true, facing: Math.PI };

            // Coffee table
            const oCoffeeTable = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.35, 0.8), new THREE.MeshLambertMaterial({ color: 0x4e342e }));
            oCoffeeTable.position.set(7.0, fy + 0.175, 6.0);
            buildingGroup.add(oCoffeeTable);

            // 2 Armchairs
            const oChair1 = createChairMesh(0x0d47a1);
            oChair1.position.set(5.4, fy, 6.0);
            oChair1.rotation.y = Math.PI / 2;
            buildingGroup.add(oChair1);
            nodes["lounge_spot1"] = { pos: new THREE.Vector3(5.5, fy, 6.0), neighbors: ["lounge_center"] };
            sitTargets["lounge_spot1"] = { sit: true, facing: Math.PI / 2 };

            const oChair2 = createChairMesh(0x0d47a1);
            oChair2.position.set(8.6, fy, 6.0);
            oChair2.rotation.y = -Math.PI / 2;
            buildingGroup.add(oChair2);
            nodes["lounge_spot2"] = { pos: new THREE.Vector3(8.5, fy, 6.0), neighbors: ["lounge_center"] };
            sitTargets["lounge_spot2"] = { sit: true, facing: -Math.PI / 2 };

            // Water cooler in office lounge
            const oCooler = createWaterCooler();
            oCooler.position.set(9.5, fy, 4.0);
            buildingGroup.add(oCooler);
            nodes["water_cooler"] = { pos: new THREE.Vector3(9.5, fy, 4.8), neighbors: ["lounge_center"] };
            sitTargets["water_cooler"] = { sit: false, facing: -Math.PI / 2 };

            // Hallway loiter spots
            nodes["hall_stand_N"] = { pos: new THREE.Vector3(0, fy, -2.4), neighbors: ["hallN"] };
            sitTargets["hall_stand_N"] = { sit: false, facing: 0 };

            nodes["hall_stand_S"] = { pos: new THREE.Vector3(2.2, fy, 1.8), neighbors: ["hallSE"] };
            sitTargets["hall_stand_S"] = { sit: false, facing: -Math.PI / 2 };
        }

        floors.push({
            floorNumber: f,
            floorY: fy,
            nodes: nodes,
            sitTargets: sitTargets,
            desks: desks,
            callPanel: callPanel,
            shaftIndicator: shaftIndicator
        });
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
