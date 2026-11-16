const WORLD = {
    FLOOR_HEIGHT: 3.4,
    FLOOR_COUNT: 6,
    BUILDING_WIDTH: 22,
    BUILDING_DEPTH: 18,
    SHAFT_WIDTH: 3,
    SHAFT_DEPTH: 3,
    PERSON_R: 0.4
};

function createTextDisplay(width, height) {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = 4;
    tex._lastText = null;
    tex._canvas = canvas;

    const geo = new THREE.PlaneGeometry(width, height);
    const mat = new THREE.MeshBasicMaterial({
        map: tex,
        side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData.texture = tex;
    updateTextDisplay(tex, "0");
    return mesh;
}

function updateTextDisplay(tex, text) {
    const str = String(text);
    if (tex._lastText === str) return;
    tex._lastText = str;
    const canvas = tex._canvas;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#050505";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.fillStyle = "#ffbb22";
    ctx.shadowColor = "#ff8800";
    ctx.shadowBlur = 18;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const fontSize = str.length >= 2 ? 150 : 200;
    ctx.font = "bold " + fontSize + "px monospace";
    ctx.fillText(str, canvas.width / 2, canvas.height / 2 + 8);
    ctx.restore();

    tex.needsUpdate = true;
}

function bfsPath(nodes, fromName, toName) {
    if (!nodes[fromName] || !nodes[toName]) return [];
    if (fromName === toName) return [nodes[toName].pos.clone()];

    const queue = [fromName];
    const visited = new Set([fromName]);
    const parent = {};

    while (queue.length > 0) {
        const cur = queue.shift();
        if (cur === toName) break;
        const neighbors = nodes[cur].neighbors;
        for (let i = 0; i < neighbors.length; i++) {
            const nxt = neighbors[i];
            if (!visited.has(nxt) && nodes[nxt]) {
                visited.add(nxt);
                parent[nxt] = cur;
                queue.push(nxt);
            }
        }
    }

    if (!visited.has(toName)) {
        return [nodes[toName].pos.clone()];
    }

    const path = [];
    let step = toName;
    while (step !== undefined && step !== fromName) {
        path.push(nodes[step].pos.clone());
        step = parent[step];
    }
    path.reverse();
    return path;
}

function createWorld(scene) {
    const buildingGroup = new THREE.Group();
    buildingGroup.renderOrder = 0;

    const FH = WORLD.FLOOR_HEIGHT;
    const FC = WORLD.FLOOR_COUNT;
    const BW = WORLD.BUILDING_WIDTH;
    const BD = WORLD.BUILDING_DEPTH;
    const SW = WORLD.SHAFT_WIDTH;
    const SD = WORLD.SHAFT_DEPTH;
    const totalH = FH * FC;

    const solidFloorMat = new THREE.MeshLambertMaterial({ color: 0x666a73 });
    const sidewalkMat = new THREE.MeshLambertMaterial({ color: 0x8a8f99 });
    const slabMat = new THREE.MeshLambertMaterial({
        color: 0x7a7f8a,
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
    const shaftPostMat = new THREE.MeshLambertMaterial({
        color: 0x555a66,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
        side: THREE.DoubleSide
    });

    const woodMat = new THREE.MeshLambertMaterial({ color: 0x8b5a2b });
    const darkWoodMat = new THREE.MeshLambertMaterial({ color: 0x4e342e });
    const chairMat = new THREE.MeshLambertMaterial({ color: 0x2f3640 });
    const couchMat = new THREE.MeshLambertMaterial({ color: 0x3b6e8c });
    const armchairMat = new THREE.MeshLambertMaterial({ color: 0x4a7c59 });
    const monitorMat = new THREE.MeshLambertMaterial({ color: 0x1e272e });
    const screenMat = new THREE.MeshBasicMaterial({ color: 0x48dbfb });
    const coolerMat = new THREE.MeshLambertMaterial({ color: 0xecf0f1 });
    const waterMat = new THREE.MeshLambertMaterial({
        color: 0x3498db,
        transparent: true,
        opacity: 0.6,
        depthWrite: false,
        side: THREE.DoubleSide
    });
    const plantPotMat = new THREE.MeshLambertMaterial({ color: 0xa0522d });
    const plantLeafMat = new THREE.MeshLambertMaterial({ color: 0x2ecc71 });
    const counterMat = new THREE.MeshLambertMaterial({ color: 0xd7ccc8 });
    const counterTopMat = new THREE.MeshLambertMaterial({ color: 0x3e2723 });

    function addBox(w, h, d, x, y, z, mat, parent) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        mesh.position.set(x, y, z);
        mesh.renderOrder = 0;
        (parent || buildingGroup).add(mesh);
        return mesh;
    }

    // Ground slab, sidewalk, roof
    addBox(BW, 0.14, BD, 0, -0.07, 0, solidFloorMat);
    addBox(BW, 0.12, 5.2, 0, -0.06, BD / 2 + 2.6, sidewalkMat);
    addBox(BW, 0.16, BD, 0, totalH + 0.08, 0, solidFloorMat);

    // Outer walls
    // Back wall
    addBox(BW, totalH, 0.12, 0, totalH / 2, -BD / 2, outerWallMat);
    // Left & right walls
    addBox(0.12, totalH, BD, -BW / 2, totalH / 2, 0, outerWallMat);
    addBox(0.12, totalH, BD, BW / 2, totalH / 2, 0, outerWallMat);

    // Front wall: 3.6-unit-wide clear doorway on floor 0 centered at x=0
    const doorHalfW = 1.8;
    const sideFrontW = BW / 2 - doorHalfW; // 9.2
    addBox(sideFrontW, totalH, 0.12, -(doorHalfW + sideFrontW / 2), totalH / 2, BD / 2, outerWallMat);
    addBox(sideFrontW, totalH, 0.12, (doorHalfW + sideFrontW / 2), totalH / 2, BD / 2, outerWallMat);
    // Header panel above floor 0 entrance (floors 1..5)
    addBox(doorHalfW * 2, totalH - FH, 0.12, 0, FH + (totalH - FH) / 2, BD / 2, outerWallMat);

    // Decorative open glass doors swung open at x = +-1.8 (never blocking the doorway)
    const glassDoorMat = new THREE.MeshLambertMaterial({
        color: 0xaaddff,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
        side: THREE.DoubleSide
    });
    addBox(0.06, 2.6, 1.3, -doorHalfW, 1.3, BD / 2 + 0.65, glassDoorMat);
    addBox(0.06, 2.6, 1.3, doorHalfW, 1.3, BD / 2 + 0.65, glassDoorMat);

    // Shaft framing posts
    const postPositions = [
        [-SW / 2, -SD / 2],
        [SW / 2, -SD / 2],
        [-SW / 2, SD / 2],
        [SW / 2, SD / 2]
    ];
    for (let i = 0; i < postPositions.length; i++) {
        addBox(0.12, totalH, 0.12, postPositions[i][0], totalH / 2, postPositions[i][1], shaftPostMat);
    }

    // Helper furniture builders (facing = rotation.y; local +Z is open front of seat)
    function createChair(x, y, z, facing, mat) {
        const g = new THREE.Group();
        g.position.set(x, y, z);
        g.rotation.y = facing;
        const m = mat || chairMat;
        // Seat cushion
        addBox(0.48, 0.08, 0.48, 0, 0.40, 0, m, g);
        // Backrest on local -Z
        addBox(0.48, 0.48, 0.08, 0, 0.68, -0.20, m, g);
        // Legs
        addBox(0.06, 0.38, 0.06, -0.18, 0.19, -0.18, m, g);
        addBox(0.06, 0.38, 0.06, 0.18, 0.19, -0.18, m, g);
        addBox(0.06, 0.38, 0.06, -0.18, 0.19, 0.18, m, g);
        addBox(0.06, 0.38, 0.06, 0.18, 0.19, 0.18, m, g);
        buildingGroup.add(g);
        return g;
    }

    function createArmchair(x, y, z, facing) {
        const g = new THREE.Group();
        g.position.set(x, y, z);
        g.rotation.y = facing;
        addBox(0.76, 0.36, 0.72, 0, 0.22, 0, armchairMat, g);
        addBox(0.76, 0.45, 0.14, 0, 0.60, -0.29, armchairMat, g);
        addBox(0.12, 0.26, 0.72, -0.32, 0.50, 0, armchairMat, g);
        addBox(0.12, 0.26, 0.72, 0.32, 0.50, 0, armchairMat, g);
        buildingGroup.add(g);
        return g;
    }

    function createCouch(x, y, z, facing) {
        const g = new THREE.Group();
        g.position.set(x, y, z);
        g.rotation.y = facing;
        addBox(2.2, 0.38, 0.85, 0, 0.22, 0, couchMat, g);
        addBox(2.2, 0.50, 0.16, 0, 0.64, -0.34, couchMat, g);
        addBox(0.16, 0.28, 0.85, -1.02, 0.52, 0, couchMat, g);
        addBox(0.16, 0.28, 0.85, 1.02, 0.52, 0, couchMat, g);
        buildingGroup.add(g);
        return g;
    }

    function createDesk(x, y, z) {
        addBox(1.8, 0.08, 0.9, x, y + 0.74, z, woodMat);
        addBox(0.08, 0.72, 0.8, x - 0.82, y + 0.36, z, darkWoodMat);
        addBox(0.08, 0.72, 0.8, x + 0.82, y + 0.36, z, darkWoodMat);
        // Monitor at back of desk (-Z)
        addBox(0.08, 0.18, 0.08, x, y + 0.87, z - 0.26, monitorMat);
        addBox(0.62, 0.40, 0.05, x, y + 1.08, z - 0.26, monitorMat);
        addBox(0.56, 0.34, 0.02, x, y + 1.08, z - 0.23, screenMat);
    }

    function createWaterCooler(x, y, z) {
        addBox(0.42, 0.95, 0.42, x, y + 0.475, z, coolerMat);
        const jug = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.42, 10), waterMat);
        jug.position.set(x, y + 1.16, z);
        buildingGroup.add(jug);
    }

    function createPlant(x, y, z) {
        const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.18, 0.40, 10), plantPotMat);
        pot.position.set(x, y + 0.20, z);
        buildingGroup.add(pot);
        const foliage = new THREE.Mesh(new THREE.SphereGeometry(0.36, 10, 8), plantLeafMat);
        foliage.position.set(x, y + 0.65, z);
        buildingGroup.add(foliage);
    }

    function createCallPanel(floorNum, floorY) {
        const panel = new THREE.Group();
        panel.position.set(1.95, floorY + 1.4, 1.56);

        const plate = new THREE.Mesh(
            new THREE.BoxGeometry(0.55, 1.4, 0.05),
            new THREE.MeshLambertMaterial({ color: 0x333842 })
        );
        panel.add(plate);

        const offMat = new THREE.MeshBasicMaterial({ color: 0x444850, side: THREE.DoubleSide });
        const onMat = new THREE.MeshBasicMaterial({ color: 0x22ff66, side: THREE.DoubleSide });

        const upShape = new THREE.Shape();
        upShape.moveTo(0, 0.16);
        upShape.lineTo(-0.13, -0.06);
        upShape.lineTo(0.13, -0.06);
        upShape.closePath();
        const upTri = new THREE.Mesh(new THREE.ShapeGeometry(upShape), offMat);
        upTri.position.set(0, -0.14, 0.032);
        panel.add(upTri);

        const downShape = new THREE.Shape();
        downShape.moveTo(0, -0.16);
        downShape.lineTo(-0.13, 0.06);
        downShape.lineTo(0.13, 0.06);
        downShape.closePath();
        const downTri = new THREE.Mesh(new THREE.ShapeGeometry(downShape), offMat);
        downTri.position.set(0, -0.44, 0.032);
        panel.add(downTri);

        const disp = createTextDisplay(0.45, 0.45);
        disp.position.set(0, 0.34, 0.032);
        panel.add(disp);

        if (floorNum === FC - 1) upTri.visible = false;
        if (floorNum === 0) downTri.visible = false;

        panel.userData = {
            upTri: upTri,
            downTri: downTri,
            displayTex: disp.userData.texture,
            setUp: function (on) {
                upTri.material = on ? onMat : offMat;
            },
            setDown: function (on) {
                downTri.material = on ? onMat : offMat;
            },
            setIndicator: function (text) {
                updateTextDisplay(disp.userData.texture, text);
            }
        };

        buildingGroup.add(panel);
        return panel;
    }

    function createShaftIndicator(floorY) {
        const mesh = createTextDisplay(0.9, 0.9);
        mesh.position.set(0, floorY + 2.75, 1.56);
        buildingGroup.add(mesh);
        mesh.userData.setText = function (text) {
            updateTextDisplay(mesh.userData.texture, text);
        };
        return mesh;
    }

    // Wall with doorway gap along X (at fixed z)
    function addWallWithDoorX(x1, x2, z, doorX, doorW, yBase) {
        const h = FH - 0.15;
        const leftEnd = doorX - doorW / 2;
        const rightStart = doorX + doorW / 2;
        if (leftEnd > x1) {
            const w = leftEnd - x1;
            addBox(w, h, 0.10, x1 + w / 2, yBase + h / 2, z, innerWallMat);
        }
        if (x2 > rightStart) {
            const w = x2 - rightStart;
            addBox(w, h, 0.10, rightStart + w / 2, yBase + h / 2, z, innerWallMat);
        }
    }

    // Wall with doorway gap along Z (at fixed x)
    function addWallWithDoorZ(z1, z2, x, doorZ, doorW, yBase) {
        const h = FH - 0.15;
        const topEnd = doorZ - doorW / 2;
        const botStart = doorZ + doorW / 2;
        if (topEnd > z1) {
            const d = topEnd - z1;
            addBox(0.10, h, d, x, yBase + h / 2, z1 + d / 2, innerWallMat);
        }
        if (z2 > botStart) {
            const d = z2 - botStart;
            addBox(0.10, h, d, x, yBase + h / 2, botStart + d / 2, innerWallMat);
        }
    }

    const floors = [];

    for (let f = 0; f < FC; f++) {
        const fy = f * FH;
        const nodes = {};
        const sitTargets = {};

        function addNode(name, x, z, sit, facing) {
            nodes[name] = {
                pos: new THREE.Vector3(x, fy, z),
                neighbors: []
            };
            if (sit !== undefined) {
                sitTargets[name] = { sit: !!sit, facing: facing !== undefined ? facing : 0 };
            }
        }

        function link(a, b) {
            if (!nodes[a] || !nodes[b]) return;
            if (nodes[a].neighbors.indexOf(b) === -1) nodes[a].neighbors.push(b);
            if (nodes[b].neighbors.indexOf(a) === -1) nodes[b].neighbors.push(a);
        }

        // Intermediate floor slabs (4 strips around 3x3 shaft)
        if (f > 0) {
            // Back strip: z in [-9, -1.5]
            addBox(BW, 0.08, 7.5, 0, fy - 0.04, -5.25, slabMat);
            // Front strip: z in [1.5, 9]
            addBox(BW, 0.08, 7.5, 0, fy - 0.04, 5.25, slabMat);
            // Left strip: x in [-11, -1.5], z in [-1.5, 1.5]
            addBox(9.5, 0.08, 3.0, -6.25, fy - 0.04, 0, slabMat);
            // Right strip: x in [1.5, 11], z in [-1.5, 1.5]
            addBox(9.5, 0.08, 3.0, 6.25, fy - 0.04, 0, slabMat);
        }

        // Hallway ring around shaft
        addNode("elevWait", 0, 2.2);
        addNode("hallS", 0, 2.8);
        addNode("hallSE", 2.8, 2.8);
        addNode("hallE", 2.8, 0);
        addNode("hallNE", 2.8, -2.8);
        addNode("hallN", 0, -2.8);
        addNode("hallNW", -2.8, -2.8);
        addNode("hallW", -2.8, 0);
        addNode("hallSW", -2.8, 2.8);

        link("elevWait", "hallS");
        link("hallS", "hallSE");
        link("hallSE", "hallE");
        link("hallE", "hallNE");
        link("hallNE", "hallN");
        link("hallN", "hallNW");
        link("hallNW", "hallW");
        link("hallW", "hallSW");
        link("hallSW", "hallS");

        const callPanel = createCallPanel(f, fy);
        const shaftIndicator = createShaftIndicator(fy);

        const desks = [];

        if (f === 0) {
            // LOBBY
            // Entrance chain (clear path from sidewalk through 3.6-unit doorway)
            addNode("outside", 0, 12.0);
            addNode("front_door_threshold", 0, 9.35);
            addNode("entrance", 0, 7.4);
            addNode("lobby_center", 0, 5.0);
            link("outside", "front_door_threshold");
            link("front_door_threshold", "entrance");
            link("entrance", "lobby_center");
            link("lobby_center", "elevWait");
            link("lobby_center", "hallS");

            // Potted plants flanking doorway (well clear of [-1.8, 1.8])
            createPlant(-2.4, fy, 8.2);
            createPlant(2.4, fy, 8.2);

            // Reception desk tucked off to the side
            addBox(1.1, 1.0, 2.2, -3.5, fy + 0.5, 6.2, darkWoodMat);
            addNode("reception", -2.5, 6.2, false, -Math.PI / 2);
            link("reception", "lobby_center");

            // Info kiosk
            addBox(0.7, 1.3, 0.7, 2.9, fy + 0.65, 7.4, darkWoodMat);
            addNode("kiosk", 2.1, 7.4, false, Math.PI / 2);
            link("kiosk", "entrance");
            link("kiosk", "lobby_center");

            // Cafe counter on left wall
            addBox(1.1, 0.95, 5.4, -10.0, fy + 0.475, 5.0, counterMat);
            addBox(1.2, 0.08, 5.5, -10.0, fy + 0.99, 5.0, counterTopMat);
            // Coffee machine & pastry display
            addBox(0.45, 0.5, 0.5, -10.0, fy + 1.28, 3.6, monitorMat);
            addBox(0.55, 0.4, 1.1, -10.0, fy + 1.23, 5.8, glassDoorMat);

            addNode("cafe_door", -4.2, 3.6);
            addNode("cafe_order", -8.8, 5.0, false, -Math.PI / 2);
            link("cafe_door", "hallSW");
            link("cafe_door", "lobby_center");
            link("cafe_door", "cafe_order");

            // 4 bistro tables with 2 chairs each
            const bistroCoords = [
                [-6.8, 6.8],
                [-6.8, 4.2],
                [-4.6, 6.8],
                [-6.8, 2.0]
            ];
            const cafeSpots = [];
            for (let b = 0; b < bistroCoords.length; b++) {
                const bx = bistroCoords[b][0];
                const bz = bistroCoords[b][1];
                const top = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.06, 12), woodMat);
                top.position.set(bx, fy + 0.74, bz);
                buildingGroup.add(top);
                const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.18, 0.72, 8), darkWoodMat);
                leg.position.set(bx, fy + 0.36, bz);
                buildingGroup.add(leg);

                createChair(bx - 0.70, fy, bz, Math.PI / 2);
                createChair(bx + 0.70, fy, bz, -Math.PI / 2);

                const nL = "bistro" + (b * 2);
                const nR = "bistro" + (b * 2 + 1);
                addNode(nL, bx - 0.70, bz, true, Math.PI / 2);
                addNode(nR, bx + 0.70, bz, true, -Math.PI / 2);
                link(nL, "cafe_door");
                link(nR, "cafe_door");
                cafeSpots.push(nL, nR);
            }

            // Front lounge (right side)
            addNode("front_lounge_center", 6.0, 5.2);
            link("front_lounge_center", "hallSE");
            link("front_lounge_center", "lobby_center");

            createCouch(7.5, fy, 7.6, Math.PI);
            addBox(1.4, 0.42, 0.8, 7.5, fy + 0.21, 6.2, woodMat);
            createArmchair(5.5, fy, 6.2, Math.PI / 2);
            createArmchair(9.5, fy, 6.2, -Math.PI / 2);

            addNode("front_lounge_0", 7.5, 7.55, true, Math.PI);
            addNode("front_lounge_1", 5.5, 6.2, true, Math.PI / 2);
            addNode("front_lounge_2", 9.5, 6.2, true, -Math.PI / 2);
            link("front_lounge_0", "front_lounge_center");
            link("front_lounge_1", "front_lounge_center");
            link("front_lounge_2", "front_lounge_center");

            // Back lounge (Z < 0, right-back)
            addNode("back_lounge_center", 6.5, -5.8);
            link("back_lounge_center", "hallNE");
            createCouch(6.5, fy, -7.2, 0);
            createCouch(6.5, fy, -4.4, Math.PI);
            addBox(1.5, 0.42, 0.8, 6.5, fy + 0.21, -5.8, woodMat);
            addNode("back_lounge_N", 6.5, -7.15, true, 0);
            addNode("back_lounge_S", 6.5, -4.45, true, Math.PI);
            link("back_lounge_N", "back_lounge_center");
            link("back_lounge_S", "back_lounge_center");

            // Conversation pit (back-left)
            addNode("pit_center", -6.5, -5.8);
            link("pit_center", "hallNW");
            const pitTable = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.44, 14), woodMat);
            pitTable.position.set(-6.5, fy + 0.22, -5.8);
            buildingGroup.add(pitTable);
            createArmchair(-6.5, fy, -7.2, 0);
            createArmchair(-6.5, fy, -4.4, Math.PI);
            createArmchair(-5.1, fy, -5.8, -Math.PI / 2);
            createArmchair(-7.9, fy, -5.8, Math.PI / 2);
            addNode("pit_N", -6.5, -7.2, true, 0);
            addNode("pit_S", -6.5, -4.4, true, Math.PI);
            addNode("pit_E", -5.1, -5.8, true, -Math.PI / 2);
            addNode("pit_W", -7.9, -5.8, true, Math.PI / 2);
            link("pit_N", "pit_center");
            link("pit_S", "pit_center");
            link("pit_E", "pit_center");
            link("pit_W", "pit_center");

            // Two water coolers
            createWaterCooler(10.2, fy, 3.8);
            addNode("lobby_wc_front", 9.4, 3.8, false, Math.PI / 2);
            link("lobby_wc_front", "hallSE");

            createWaterCooler(10.2, fy, -2.5);
            addNode("lobby_wc_back", 9.4, -2.5, false, Math.PI / 2);
            link("lobby_wc_back", "hallE");

            // Generic loiter waypoints
            addNode("lobby_stand_center", 1.2, 4.8, false, 0);
            link("lobby_stand_center", "lobby_center");
            addNode("lobby_stand_NE", 4.5, -1.8, false, -Math.PI / 2);
            link("lobby_stand_NE", "hallE");
            addNode("lobby_stand_NW", -4.5, -1.8, false, Math.PI / 2);
            link("lobby_stand_NW", "hallW");
            addNode("lobby_stand_midE", 4.5, 1.5, false, -Math.PI / 2);
            link("lobby_stand_midE", "hallE");
            addNode("lobby_stand_midW", -4.5, 0.2, false, Math.PI / 2);
            link("lobby_stand_midW", "hallW");
            addNode("lobby_stand_entry", -1.6, 7.0, false, 0);
            link("lobby_stand_entry", "entrance");

            floors.push({
                floorNumber: f,
                nodes: nodes,
                callPanel: callPanel,
                shaftIndicator: shaftIndicator,
                desks: desks,
                sitTargets: sitTargets,
                entranceSpot: "entrance",
                cafeSpots: cafeSpots
            });
        } else {
            // OFFICE FLOORS 1..5
            // Four private offices along back wall (z in [-9, -3.2])
            const officeDefs = [
                { id: "A", xMin: -11, xMax: -5.5, centerX: -8.25, doorX: -7.0, hallNode: "hallNW" },
                { id: "B", xMin: -5.5, xMax: 0, centerX: -2.75, doorX: -2.2, hallNode: "hallN" },
                { id: "C", xMin: 0, xMax: 5.5, centerX: 2.75, doorX: 2.2, hallNode: "hallN" },
                { id: "D", xMin: 5.5, xMax: 11, centerX: 8.25, doorX: 7.0, hallNode: "hallNE" }
            ];

            // Dividing walls between offices
            addBox(0.10, FH - 0.15, 5.8, -5.5, fy + (FH - 0.15) / 2, -6.1, innerWallMat);
            addBox(0.10, FH - 0.15, 5.8, 0, fy + (FH - 0.15) / 2, -6.1, innerWallMat);
            addBox(0.10, FH - 0.15, 5.8, 5.5, fy + (FH - 0.15) / 2, -6.1, innerWallMat);

            for (let oi = 0; oi < officeDefs.length; oi++) {
                const od = officeDefs[oi];
                addWallWithDoorX(od.xMin, od.xMax, -3.2, od.doorX, 1.2, fy);
                createDesk(od.centerX, fy, -6.8);
                createChair(od.centerX, fy, -5.9, Math.PI);

                const doorWp = "office" + od.id + "_door";
                const deskWp = "office" + od.id + "_desk";
                addNode(doorWp, od.doorX, -3.2);
                addNode(deskWp, od.centerX, -5.9, true, Math.PI);
                link(doorWp, od.hallNode);
                link(doorWp, deskWp);

                desks.push({
                    id: "F" + f + "_" + od.id,
                    floor: f,
                    doorWpName: doorWp,
                    deskWpName: deskWp
                });
            }

            // Conference room (front-left: x in [-11, -3.2], z in [3.2, 9])
            addBox(7.8, FH - 0.15, 0.10, -7.1, fy + (FH - 0.15) / 2, 3.2, innerWallMat);
            addWallWithDoorZ(3.2, 9.0, -3.2, 4.2, 1.2, fy);

            addBox(3.4, 0.08, 1.3, -7.2, fy + 0.74, 6.1, woodMat);
            addBox(0.12, 0.72, 0.9, -8.4, fy + 0.36, 6.1, darkWoodMat);
            addBox(0.12, 0.72, 0.9, -6.0, fy + 0.36, 6.1, darkWoodMat);

            createChair(-8.0, fy, 5.1, 0);
            createChair(-6.4, fy, 5.1, 0);
            createChair(-8.0, fy, 7.1, Math.PI);
            createChair(-6.4, fy, 7.1, Math.PI);

            addNode("conf_door", -3.2, 4.2);
            addNode("conf_center", -4.8, 5.0);
            addNode("conf_seat0", -8.0, 5.1, true, 0);
            addNode("conf_seat1", -6.4, 5.1, true, 0);
            addNode("conf_seat2", -8.0, 7.1, true, Math.PI);
            addNode("conf_seat3", -6.4, 7.1, true, Math.PI);
            link("conf_door", "hallSW");
            link("conf_door", "conf_center");
            link("conf_center", "conf_seat0");
            link("conf_center", "conf_seat1");
            link("conf_center", "conf_seat2");
            link("conf_center", "conf_seat3");

            // Lounge / break area (front-right: x in [3.2, 11], z in [3.2, 9])
            addBox(7.8, FH - 0.15, 0.10, 7.1, fy + (FH - 0.15) / 2, 3.2, innerWallMat);
            addWallWithDoorZ(3.2, 9.0, 3.2, 4.2, 1.2, fy);

            createCouch(7.5, fy, 7.8, Math.PI);
            addBox(1.4, 0.42, 0.8, 7.5, fy + 0.21, 6.3, woodMat);
            createArmchair(5.5, fy, 6.8, Math.PI / 2);
            createArmchair(9.5, fy, 6.8, -Math.PI / 2);
            createWaterCooler(9.9, fy, 4.2);

            addNode("lounge_door", 3.2, 4.2);
            addNode("lounge_center", 5.5, 5.5);
            addNode("lounge_spot0", 7.5, 7.75, true, Math.PI);
            addNode("lounge_spot1", 5.5, 6.8, true, Math.PI / 2);
            addNode("lounge_spot2", 9.5, 6.8, true, -Math.PI / 2);
            addNode("water_cooler", 9.0, 4.2, false, Math.PI / 2);
            link("lounge_door", "hallSE");
            link("lounge_door", "lounge_center");
            link("lounge_center", "lounge_spot0");
            link("lounge_center", "lounge_spot1");
            link("lounge_center", "lounge_spot2");
            link("lounge_center", "water_cooler");

            // Hallway loiter spots
            addNode("hall_stand_N", -1.4, -2.8, false, 0);
            link("hall_stand_N", "hallN");
            addNode("hall_stand_S", 1.4, 2.8, false, Math.PI);
            link("hall_stand_S", "hallS");

            floors.push({
                floorNumber: f,
                nodes: nodes,
                callPanel: callPanel,
                shaftIndicator: shaftIndicator,
                desks: desks,
                sitTargets: sitTargets
            });
        }
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
window.createTextDisplay = createTextDisplay;
window.updateTextDisplay = updateTextDisplay;
