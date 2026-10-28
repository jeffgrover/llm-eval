// world.js - building geometry, per-floor layouts, furniture, navigation graph, call panels.
// Classic browser script: no ES modules. Shared symbols are attached to window.

const WORLD = {
    FLOOR_HEIGHT: 3.4,
    FLOOR_COUNT: 6,
    BUILDING_WIDTH: 22,
    BUILDING_DEPTH: 18,
    SHAFT_WIDTH: 3,
    SHAFT_DEPTH: 3,
    PERSON_R: 0.4
};

const SEAT_DROP = 0.35;

function worldMaterials() {
    return {
        slab: new THREE.MeshLambertMaterial({ color: 0x8a8f96 }),
        wall: new THREE.MeshLambertMaterial({
            color: 0x9999ff, opacity: 0.2, transparent: true, depthWrite: false, side: THREE.DoubleSide
        }),
        innerWall: new THREE.MeshLambertMaterial({
            color: 0xbbc5e6, opacity: 0.28, transparent: true, depthWrite: false, side: THREE.DoubleSide
        }),
        floorSlab: new THREE.MeshLambertMaterial({
            color: 0x9aa0a8, opacity: 0.3, transparent: true, depthWrite: false, side: THREE.DoubleSide
        }),
        sidewalk: new THREE.MeshLambertMaterial({ color: 0xb0aca4 }),
        glass: new THREE.MeshLambertMaterial({
            color: 0xa8d8e8, opacity: 0.25, transparent: true, depthWrite: false, side: THREE.DoubleSide
        }),
        furniture: new THREE.MeshLambertMaterial({ color: 0x7f6b53 }),
        darkFurniture: new THREE.MeshLambertMaterial({ color: 0x4a4f57 }),
        chairSeat: new THREE.MeshLambertMaterial({ color: 0x5c6b7a }),
        counterTop: new THREE.MeshLambertMaterial({ color: 0x33383e }),
        plantPot: new THREE.MeshLambertMaterial({ color: 0x6b4a35 }),
        plantLeaf: new THREE.MeshLambertMaterial({ color: 0x2f7d45 }),
        waterCooler: new THREE.MeshLambertMaterial({ color: 0xd8dde2 }),
        monitorScreen: new THREE.MeshBasicMaterial({ color: 0x1c3f66 })
    };
}

// ---------------------------------------------------------------------------
// Canvas-texture floor displays (cached so we do not re-upload every frame)
// ---------------------------------------------------------------------------
function createTextDisplay(planeSize) {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");

    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = 8;
    texture._lastText = "";

    function drawText(text) {
        ctx.fillStyle = "#050505";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        ctx.fillStyle = "#ffbb22";
        ctx.font = "bold 210px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.shadowColor = "#ff8a1c";
        ctx.shadowBlur = 26;
        ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 8);
        ctx.restore();
    }

    drawText("0");
    texture.needsUpdate = true;

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(planeSize, planeSize), new THREE.MeshBasicMaterial({ map: texture }));

    function updateTextTexture(text) {
        if (texture._lastText === text) return;
        texture._lastText = text;
        drawText(text);
        texture.needsUpdate = true;
    }

    return { mesh: mesh, texture: texture, setIndicator: updateTextTexture };
}

function arrowShape(pointUp) {
    const half = 0.13;
    const height = 0.24;
    const shape = new THREE.Shape();
    if (pointUp) {
        shape.moveTo(-half, -height / 2);
        shape.lineTo(half, -height / 2);
        shape.lineTo(0, height / 2);
    } else {
        shape.moveTo(-half, height / 2);
        shape.lineTo(half, height / 2);
        shape.lineTo(0, -height / 2);
    }
    shape.closePath();
    return shape;
}

function createCallPanel() {
    const group = new THREE.Group();

    const plate = new THREE.Mesh(
        new THREE.BoxGeometry(0.55, 1.4, 0.05),
        new THREE.MeshLambertMaterial({ color: 0x39414c })
    );
    group.add(plate);

    const offMat = new THREE.MeshBasicMaterial({ color: 0x2a2f36 });
    const onMat = new THREE.MeshBasicMaterial({ color: 0x35e07a });

    const upArrow = new THREE.Mesh(new THREE.ShapeGeometry(arrowShape(true)), offMat);
    upArrow.position.set(0, 0.42, 0.031);
    group.add(upArrow);

    const downArrow = new THREE.Mesh(new THREE.ShapeGeometry(arrowShape(false)), offMat);
    downArrow.position.set(0, -0.16, 0.031);
    group.add(downArrow);

    const display = createTextDisplay(0.45);
    display.mesh.position.set(0, -0.62, 0.031);
    group.add(display.mesh);

    function setTriangle(mesh, on) {
        mesh.material = on ? onMat : offMat;
    }

    group.userData = {
        setUp: function (on) { setTriangle(upArrow, on); },
        setDown: function (on) { setTriangle(downArrow, on); },
        setIndicator: function (text) { display.setIndicator(text); },
        upOn: false,
        downOn: false
    };

    return group;
}

// ---------------------------------------------------------------------------
// Navigation graph
// ---------------------------------------------------------------------------
function bfsPath(nodes, fromName, toName) {
    if (!nodes[fromName] || !nodes[toName]) return [];
    const visited = new Set([fromName]);
    const prev = new Map();
    const queue = [fromName];

    while (queue.length) {
        const current = queue.shift();
        if (current === toName) break;
        for (const next of nodes[current].links) {
            if (!visited.has(next) && nodes[next]) {
                visited.add(next);
                prev.set(next, current);
                queue.push(next);
            }
        }
    }

    if (!prev.has(toName) && fromName !== toName) return [];

    const path = [];
    let cursor = toName;
    while (cursor) {
        path.push(nodes[cursor].pos.clone());
        cursor = prev.get(cursor);
    }
    path.reverse();
    return path;
}

function worldNearestNode(nodes, point) {
    let bestName = null;
    let bestDist = Infinity;
    for (const name of Object.keys(nodes)) {
        const node = nodes[name];
        if (Math.abs(node.pos.y - point.y) > 0.6) continue;
        const dx = node.pos.x - point.x;
        const dz = node.pos.z - point.z;
        const dist = dx * dx + dz * dz;
        if (dist < bestDist) {
            bestDist = dist;
            bestName = name;
        }
    }
    return bestName;
}

function faceToward(from, to) {
    return Math.atan2(to.x - from.x, to.z - from.z);
}

// ---------------------------------------------------------------------------
// Furniture builders. Each returns the mesh group; seat nodes are registered by callers.
// ---------------------------------------------------------------------------
function addBox(group, material, width, height, depth, x, y, z) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
}

function buildChair(group, mats, x, y, z, facing) {
    const chair = new THREE.Group();
    addBox(chair, mats.chairSeat, 0.52, 0.06, 0.52, 0, 0.45, 0);
    // Backrest sits behind the sitter (local -Z), so legs point toward the table/desk.
    addBox(chair, mats.chairSeat, 0.52, 0.56, 0.06, 0, 0.74, -0.28);
    addBox(chair, mats.darkFurniture, 0.08, 0.45, 0.08, 0, 0.225, 0);
    addBox(chair, mats.darkFurniture, 0.46, 0.03, 0.46, 0, 0.02, 0);

    chair.position.set(x, y, z);
    chair.rotation.y = facing;
    group.add(chair);
    return chair;
}

function buildArmchair(group, mats, x, y, z, facing) {
    const chair = new THREE.Group();
    addBox(chair, mats.furniture, 0.62, 0.14, 0.62, 0, 0.38, 0);
    addBox(chair, mats.furniture, 0.62, 0.5, 0.12, 0, 0.62, -0.3);
    addBox(chair, mats.furniture, 0.12, 0.4, 0.62, -0.28, 0.5, 0);
    addBox(chair, mats.furniture, 0.12, 0.4, 0.62, 0.28, 0.5, 0);
    chair.position.set(x, y, z);
    chair.rotation.y = facing;
    group.add(chair);
    return chair;
}

function buildCouch(group, mats, x, y, z, facing) {
    const couch = new THREE.Group();
    addBox(couch, mats.furniture, 1.6, 0.14, 0.7, 0, 0.38, 0);
    addBox(couch, mats.furniture, 1.6, 0.55, 0.12, 0, 0.62, -0.34);
    addBox(couch, mats.furniture, 0.12, 0.42, 0.7, -0.74, 0.5, 0);
    addBox(couch, mats.furniture, 0.12, 0.42, 0.7, 0.74, 0.5, 0);
    couch.position.set(x, y, z);
    couch.rotation.y = facing;
    group.add(couch);
    return couch;
}

function buildTable(group, mats, x, y, z, width, depth, height) {
    const table = new THREE.Group();
    addBox(table, mats.furniture, width, 0.06, depth, 0, height, 0);
    const legX = width / 2 - 0.1;
    const legZ = depth / 2 - 0.1;
    for (const sx of [-legX, legX]) {
        for (const sz of [-legZ, legZ]) {
            addBox(table, mats.darkFurniture, 0.06, height, 0.06, sx, height / 2, sz);
        }
    }
    table.position.set(x, y, z);
    group.add(table);
    return table;
}

function buildDesk(group, mats, x, y, z) {
    const desk = new THREE.Group();
    addBox(desk, mats.furniture, 1.8, 0.06, 0.9, 0, 0.75, 0);
    addBox(desk, mats.darkFurniture, 0.06, 0.75, 0.9, -0.87, 0.375, 0);
    addBox(desk, mats.darkFurniture, 0.06, 0.75, 0.9, 0.87, 0.375, 0);
    // Monitor at the back of the desk (the -Z side, which is where the sitter faces).
    addBox(desk, mats.darkFurniture, 0.62, 0.42, 0.04, 0, 1.05, -0.38);
    addBox(desk, mats.monitorScreen, 0.54, 0.34, 0.02, 0, 1.05, -0.36);
    addBox(desk, mats.darkFurniture, 0.12, 0.08, 0.12, 0, 0.81, -0.34);
    desk.position.set(x, y, z);
    group.add(desk);
    return desk;
}

function buildWaterCooler(group, mats, x, y, z) {
    const cooler = new THREE.Group();
    addBox(cooler, mats.waterCooler, 0.45, 1.0, 0.45, 0, 0.5, 0);
    addBox(cooler, new THREE.MeshLambertMaterial({ color: 0x6fa8d8 }), 0.32, 0.45, 0.32, 0, 1.25, 0);
    cooler.position.set(x, y, z);
    group.add(cooler);
    return cooler;
}

function buildPlant(group, mats, x, y, z) {
    const plant = new THREE.Group();
    addBox(plant, mats.plantPot, 0.42, 0.45, 0.42, 0, 0.225, 0);
    const leaves = new THREE.Mesh(new THREE.SphereGeometry(0.38, 10, 8), mats.plantLeaf);
    leaves.position.y = 0.78;
    plant.add(leaves);
    plant.position.set(x, y, z);
    group.add(plant);
    return plant;
}

// ---------------------------------------------------------------------------
// World assembly
// ---------------------------------------------------------------------------
function createWorld(scene) {
    const mats = worldMaterials();
    const buildingGroup = new THREE.Group();
    buildingGroup.renderOrder = 0;
    scene.add(buildingGroup);

    const floors = [];
    const halfW = WORLD.BUILDING_WIDTH / 2;
    const halfD = WORLD.BUILDING_DEPTH / 2;
    const shaftHalfX = WORLD.SHAFT_WIDTH / 2;
    const shaftHalfZ = WORLD.SHAFT_DEPTH / 2;

    function addNode(floorInfo, name, x, y, z) {
        floorInfo.nodes[name] = { name: name, pos: new THREE.Vector3(x, y, z), links: [] };
        if (!floorInfo.sitTargets[name]) {
            floorInfo.sitTargets[name] = { sit: false, facing: 0 };
        }
        return floorInfo.nodes[name];
    }

    function link(floorInfo, a, b) {
        if (!floorInfo.nodes[a] || !floorInfo.nodes[b]) return;
        if (floorInfo.nodes[a].links.indexOf(b) === -1) floorInfo.nodes[a].links.push(b);
        if (floorInfo.nodes[b].links.indexOf(a) === -1) floorInfo.nodes[b].links.push(a);
    }

    function publishSeat(floorInfo, wpName, facing) {
        floorInfo.sitTargets[wpName] = { sit: true, facing: facing };
    }

    // Ground slab + sidewalk
    addBox(buildingGroup, mats.slab, WORLD.BUILDING_WIDTH, 0.15, WORLD.BUILDING_DEPTH, 0, -0.075, 0);
    const sidewalk = new THREE.Mesh(new THREE.BoxGeometry(16, 0.12, 5), mats.sidewalk);
    sidewalk.position.set(0, -0.04, 12);
    buildingGroup.add(sidewalk);

    // Roof
    addBox(buildingGroup, mats.slab, WORLD.BUILDING_WIDTH, 0.18, WORLD.BUILDING_DEPTH, 0, WORLD.FLOOR_COUNT * WORLD.FLOOR_HEIGHT + 0.09, 0);

    // Outer walls: left, right, back (full height)
    addBox(buildingGroup, mats.wall, 0.15, WORLD.FLOOR_COUNT * WORLD.FLOOR_HEIGHT, WORLD.BUILDING_DEPTH, -halfW, WORLD.FLOOR_COUNT * WORLD.FLOOR_HEIGHT / 2, 0);
    addBox(buildingGroup, mats.wall, 0.15, WORLD.FLOOR_COUNT * WORLD.FLOOR_HEIGHT, WORLD.BUILDING_DEPTH, halfW, WORLD.FLOOR_COUNT * WORLD.FLOOR_HEIGHT / 2, 0);
    addBox(buildingGroup, mats.wall, WORLD.BUILDING_WIDTH, WORLD.FLOOR_COUNT * WORLD.FLOOR_HEIGHT, 0.15, 0, WORLD.FLOOR_COUNT * WORLD.FLOOR_HEIGHT / 2, -halfD);

    // Front wall: two side panels full height + header above the floor-0 entrance gap
    addBox(buildingGroup, mats.wall, halfW - shaftHalfZ, WORLD.FLOOR_COUNT * WORLD.FLOOR_HEIGHT, 0.15, -(halfW + shaftHalfZ) / 2, WORLD.FLOOR_COUNT * WORLD.FLOOR_HEIGHT / 2, halfD);
    addBox(buildingGroup, mats.wall, halfW - shaftHalfZ, WORLD.FLOOR_COUNT * WORLD.FLOOR_HEIGHT, 0.15, (halfW + shaftHalfZ) / 2, WORLD.FLOOR_COUNT * WORLD.FLOOR_HEIGHT / 2, halfD);
    addBox(buildingGroup, mats.wall, shaftHalfZ * 2, (WORLD.FLOOR_COUNT - 1) * WORLD.FLOOR_HEIGHT, 0.15, 0, (WORLD.FLOOR_COUNT - 1) * WORLD.FLOOR_HEIGHT / 2 + WORLD.FLOOR_HEIGHT, halfD);

    // Visual-only open glass doors on the floor-0 entrance (no collider across the doorway)
    const doorFrame = new THREE.Group();
    for (const side of [-1, 1]) {
        const leaf = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.3, 0.05), mats.glass);
        leaf.position.set(side * 1.6, 1.15, halfD);
        doorFrame.add(leaf);
    }
    addBox(doorFrame, mats.darkFurniture, shaftHalfZ * 2, 0.12, 0.18, 0, 3.05, halfD);
    buildingGroup.add(doorFrame);

    // Shaft side walls (the +Z face stays open for the car doors)
    addBox(buildingGroup, mats.slab, 0.12, WORLD.FLOOR_COUNT * WORLD.FLOOR_HEIGHT, WORLD.SHAFT_DEPTH, -shaftHalfX, WORLD.FLOOR_COUNT * WORLD.FLOOR_HEIGHT / 2, 0);
    addBox(buildingGroup, mats.slab, 0.12, WORLD.FLOOR_COUNT * WORLD.FLOOR_HEIGHT, WORLD.SHAFT_DEPTH, shaftHalfX, WORLD.FLOOR_COUNT * WORLD.FLOOR_HEIGHT / 2, 0);
    addBox(buildingGroup, mats.slab, WORLD.SHAFT_WIDTH, WORLD.FLOOR_COUNT * WORLD.FLOOR_HEIGHT, 0.12, 0, WORLD.FLOOR_COUNT * WORLD.FLOOR_HEIGHT / 2, -shaftHalfZ);

    for (let f = 0; f < WORLD.FLOOR_COUNT; f += 1) {
        const y = f * WORLD.FLOOR_HEIGHT;
        const floorInfo = {
            floorNumber: f,
            nodes: {},
            callPanel: null,
            shaftIndicator: null,
            desks: [],
            sitTargets: {}
        };

        // Intermediate floor slabs as four strips around the shaft opening.
        if (f > 0) {
            addBox(buildingGroup, mats.floorSlab, WORLD.BUILDING_WIDTH, 0.14, halfD - shaftHalfZ, 0, y - 0.07, (halfD + shaftHalfZ) / 2);
            addBox(buildingGroup, mats.floorSlab, WORLD.BUILDING_WIDTH, 0.14, halfD - shaftHalfZ, 0, y - 0.07, -(halfD + shaftHalfZ) / 2);
            addBox(buildingGroup, mats.floorSlab, halfW - shaftHalfX, 0.14, WORLD.SHAFT_DEPTH, -(halfW + shaftHalfX) / 2, y - 0.07, 0);
            addBox(buildingGroup, mats.floorSlab, halfW - shaftHalfX, 0.14, WORLD.SHAFT_DEPTH, (halfW + shaftHalfX) / 2, y - 0.07, 0);
        }

        // Hallway ring around the shaft. hallS is the side in front of the doors (+Z).
        const ring = {
            hallS: [0, 2.6],
            hallSE: [2.6, 2.6],
            hallE: [2.6, 0],
            hallNE: [2.6, -2.6],
            hallN: [0, -2.6],
            hallNW: [-2.6, -2.6],
            hallW: [-2.6, 0],
            hallSW: [-2.6, 2.6]
        };
        for (const name of Object.keys(ring)) addNode(floorInfo, name, ring[name][0], y, ring[name][1]);
        const ringOrder = ["hallS", "hallSE", "hallE", "hallNE", "hallN", "hallNW", "hallW", "hallSW"];
        for (let i = 0; i < ringOrder.length; i += 1) {
            link(floorInfo, ringOrder[i], ringOrder[(i + 1) % ringOrder.length]);
        }

        const elevWait = addNode(floorInfo, "elevWait", 0, y, 2.35);
        link(floorInfo, elevWait.name, "hallS");
        floorInfo.sitTargets["elevWait"] = { sit: false, facing: Math.PI };

        // Call panel next to the shaft, facing +Z, plus the shaft indicator above the doors.
        const panel = createCallPanel();
        panel.position.set(-1.05, y + 1.25, shaftHalfZ + 0.04);
        buildingGroup.add(panel);
        floorInfo.callPanel = panel;

        const indicator = createTextDisplay(0.9);
        indicator.mesh.position.set(0, y + 2.6, shaftHalfZ + 0.05);
        buildingGroup.add(indicator.mesh);
        floorInfo.shaftIndicator = indicator;

        if (f === 0) {
            buildLobby(floorInfo, buildingGroup, mats, addNode, link, publishSeat);
        } else {
            buildOfficeFloor(floorInfo, buildingGroup, mats, addNode, link, publishSeat);
        }

        floors.push(floorInfo);
    }

    return {
        buildingGroup: buildingGroup,
        floors: floors,
        bfsPath: bfsPath,
        nearestNodeName: worldNearestNode
    };
}

function buildOfficeFloor(floorInfo, group, mats, addNode, link, publishSeat) {
    const y = floorInfo.floorNumber * WORLD.FLOOR_HEIGHT;

    // Interior walls: office block front partition at z = -4 with 1.2-unit doorway gaps.
    const doorXs = [-9.5, -7.0, -3.5, 3.5];
    let cursor = -WORLD.BUILDING_WIDTH / 2;
    for (const dx of doorXs) {
        addBox(group, mats.innerWall, dx - 0.6 - cursor, WORLD.FLOOR_HEIGHT, 0.12, (cursor + dx - 0.6) / 2, y + WORLD.FLOOR_HEIGHT / 2, -4);
        cursor = dx + 0.6;
    }
    addBox(group, mats.innerWall, WORLD.BUILDING_WIDTH / 2 - cursor, WORLD.FLOOR_HEIGHT, 0.12, (cursor + WORLD.BUILDING_WIDTH / 2) / 2, y + WORLD.FLOOR_HEIGHT / 2, -4);

    // Office partitions running back to the rear wall.
    for (const px of [-8.0, -5.0, -2.0, 2.0]) {
        addBox(group, mats.innerWall, 0.12, WORLD.FLOOR_HEIGHT, 5.0, px, y + WORLD.FLOOR_HEIGHT / 2, -6.5);
    }

    // Conference room walls (front-left quadrant) with a doorway gap at z = 6.
    addBox(group, mats.innerWall, 0.12, WORLD.FLOOR_HEIGHT, 3.0, -3.0, y + WORLD.FLOOR_HEIGHT / 2, 4.5);
    addBox(group, mats.innerWall, 0.12, WORLD.FLOOR_HEIGHT, 3.0, -3.0, y + WORLD.FLOOR_HEIGHT / 2, 7.5);
    addBox(group, mats.innerWall, 8.0, WORLD.FLOOR_HEIGHT, 0.12, -7.0, y + WORLD.FLOOR_HEIGHT / 2, 3.0);

    // Lounge walls (front-right quadrant) with a doorway gap at z = 6.
    addBox(group, mats.innerWall, 0.12, WORLD.FLOOR_HEIGHT, 3.0, 3.0, y + WORLD.FLOOR_HEIGHT / 2, 4.5);
    addBox(group, mats.innerWall, 0.12, WORLD.FLOOR_HEIGHT, 3.0, 3.0, y + WORLD.FLOOR_HEIGHT / 2, 7.5);
    addBox(group, mats.innerWall, 8.0, WORLD.FLOOR_HEIGHT, 0.12, 7.0, y + WORLD.FLOOR_HEIGHT / 2, 3.0);

    // Four private offices along the back wall. Person sits facing -Z (the monitor).
    const officeCenters = [-9.5, -6.5, -3.5, 3.5];
    for (let i = 0; i < officeCenters.length; i += 1) {
        const letter = String.fromCharCode(65 + i);
        const cx = officeCenters[i];
        const doorName = "office" + letter + "_door";
        const deskName = "office" + letter + "_desk";

        buildDesk(group, mats, cx, y, -7.2);
        const chairFacing = Math.PI; // seat opens toward the monitor, person faces the monitor
        buildChair(group, mats, cx, y, -6.35, chairFacing);

        addNode(floorInfo, doorName, cx, y, -3.8);
        const deskNode = addNode(floorInfo, deskName, cx, y, -6.35);
        publishSeat(floorInfo, deskName, chairFacing);

        const nearestCorner = cx < -2.6 ? "hallNW" : (cx > 2.6 ? "hallNE" : "hallN");
        link(floorInfo, doorName, nearestCorner);
        link(floorInfo, doorName, deskName);
        floorInfo.desks.push({ name: deskName, doorName: doorName, pos: deskNode.pos.clone(), facing: chairFacing });

        if (i === 0) link(floorInfo, "hallNW", "hallW");
    }

    // Conference room: long table with four chairs, two per long side facing each other.
    const confTable = [-7.0, 6.0];
    buildTable(group, mats, confTable[0], y, confTable[1], 3.2, 1.4, 0.75);
    addNode(floorInfo, "conf_door", -2.5, y, 6.0);
    const confCenter = addNode(floorInfo, "conf_center", -6.0, y, 6.0);
    link(floorInfo, "conf_door", "hallSW");
    link(floorInfo, "conf_door", "conf_center");

    const confSeats = [[-8.4, 5.1], [-6.2, 5.1], [-8.4, 6.9], [-6.2, 6.9]];
    for (let i = 0; i < confSeats.length; i += 1) {
        const name = "conf_seat" + i;
        const seatPos = new THREE.Vector3(confSeats[i][0], y, confSeats[i][1]);
        const facing = faceToward(seatPos, new THREE.Vector3(confTable[0], y, confTable[1]));
        buildChair(group, mats, seatPos.x, y, seatPos.z, facing);
        addNode(floorInfo, name, seatPos.x, y, seatPos.z);
        publishSeat(floorInfo, name, facing);
        link(floorInfo, "conf_center", name);
    }

    // Lounge / break area.
    buildTable(group, mats, 6.5, y, 6.0, 1.4, 1.4, 0.72);
    addNode(floorInfo, "lounge_door", 2.5, y, 6.0);
    const loungeCenter = addNode(floorInfo, "lounge_center", 4.2, y, 6.0);
    link(floorInfo, "lounge_door", "hallSE");
    link(floorInfo, "lounge_door", "lounge_center");

    const loungeSeats = [[7.2, 7.5], [4.9, 4.8], [8.6, 4.6]];
    for (let i = 0; i < loungeSeats.length; i += 1) {
        const name = "lounge_spot" + i;
        const seatPos = new THREE.Vector3(loungeSeats[i][0], y, loungeSeats[i][1]);
        const facing = faceToward(seatPos, new THREE.Vector3(6.5, y, 6.0));
        if (i === 0) buildCouch(group, mats, seatPos.x, y, seatPos.z, facing);
        else buildArmchair(group, mats, seatPos.x, y, seatPos.z, facing);
        addNode(floorInfo, name, seatPos.x, y, seatPos.z);
        publishSeat(floorInfo, name, facing);
        link(floorInfo, "lounge_center", name);
    }

    buildWaterCooler(group, mats, 10.2, y, 7.4);
    const coolerNode = addNode(floorInfo, "water_cooler", 9.5, y, 6.8);
    floorInfo.sitTargets["water_cooler"] = { sit: false, facing: faceToward(coolerNode.pos, new THREE.Vector3(10.2, y, 7.4)) };
    link(floorInfo, "lounge_center", "water_cooler");

    // Hallway loiter spots.
    const hallStandN = addNode(floorInfo, "hall_stand_N", -1.5, y, -2.6);
    floorInfo.sitTargets["hall_stand_N"] = { sit: false, facing: 0 };
    link(floorInfo, "hallN", "hall_stand_N");
    const hallStandS = addNode(floorInfo, "hall_stand_S", 1.5, y, 2.6);
    floorInfo.sitTargets["hall_stand_S"] = { sit: false, facing: Math.PI };
    link(floorInfo, "hallS", "hall_stand_S");

    buildPlant(group, mats, -10.4, y, 8.4);
}

function buildLobby(floorInfo, group, mats, addNode, link, publishSeat) {
    const y = 0;

    // Entrance chain: sidewalk -> threshold -> inside -> lobby centre -> elevator.
    addNode(floorInfo, "outside", 0, y, 12);
    addNode(floorInfo, "front_door_threshold", 0, y, 9.35);
    addNode(floorInfo, "entrance", 0, y, 7.4);
    const lobbyCenter = addNode(floorInfo, "lobby_center", 0, y, 5.8);
    link(floorInfo, "outside", "front_door_threshold");
    link(floorInfo, "front_door_threshold", "entrance");
    link(floorInfo, "entrance", "lobby_center");
    link(floorInfo, "lobby_center", "elevWait");

    // Cafe counter on the left wall.
    addBox(group, mats.furniture, 0.9, 1.0, 5.4, -10.6, 0.5, 5.6);
    addBox(group, mats.counterTop, 1.0, 0.06, 5.4, -10.6, 1.02, 5.6);
    addBox(group, mats.darkFurniture, 0.5, 0.55, 0.5, -10.6, 1.32, 4.2);   // coffee machine
    addBox(group, new THREE.MeshLambertMaterial({ color: 0xc9a06a }), 0.6, 0.28, 1.2, -10.5, 1.17, 6.6); // pastry display

    const cafeOrder = addNode(floorInfo, "cafe_order", -9.3, y, 5.6);
    floorInfo.sitTargets["cafe_order"] = { sit: false, facing: faceToward(cafeOrder.pos, new THREE.Vector3(-10.6, y, 5.6)) };

    addNode(floorInfo, "cafe_door", -2.9, y, 4.2);
    link(floorInfo, "cafe_door", "hallSW");
    const cafeCenter = addNode(floorInfo, "cafe_center", -5.0, y, 3.6);
    link(floorInfo, "cafe_door", "cafe_center");

    // Bistro tables with two chairs each.
    const bistroTables = [[-7.4, 4.2], [-6.2, 6.8], [-9.0, 1.8], [-4.4, 2.4]];
    for (let i = 0; i < bistroTables.length; i += 1) {
        const tx = bistroTables[i][0];
        const tz = bistroTables[i][1];
        buildTable(group, mats, tx, y, tz, 1.1, 1.1, 0.74);
        for (let s = 0; s < 2; s += 1) {
            const name = "cafe_seat" + i + "_" + s;
            const offset = s === 0 ? -0.85 : 0.85;
            const seatPos = new THREE.Vector3(tx, y, tz + offset);
            const facing = faceToward(seatPos, new THREE.Vector3(tx, y, tz));
            buildChair(group, mats, seatPos.x, y, seatPos.z, facing);
            addNode(floorInfo, name, seatPos.x, y, seatPos.z);
            publishSeat(floorInfo, name, facing);
            link(floorInfo, "cafe_center", name);
        }
    }

    // Front lounge (right side).
    const frontTable = new THREE.Vector3(7.0, y, 6.2);
    buildTable(group, mats, frontTable.x, y, frontTable.z, 1.4, 1.4, 0.72);
    const frontLoungeCenter = addNode(floorInfo, "front_lounge_center", 5.6, y, 6.2);
    link(floorInfo, "lobby_center", "front_lounge_center");

    const frontSeats = [[7.0, 7.8], [4.9, 5.0], [9.1, 5.0]];
    for (let i = 0; i < frontSeats.length; i += 1) {
        const name = "front_lounge_seat" + i;
        const seatPos = new THREE.Vector3(frontSeats[i][0], y, frontSeats[i][1]);
        const facing = faceToward(seatPos, frontTable);
        if (i === 0) buildCouch(group, mats, seatPos.x, y, seatPos.z, facing);
        else buildArmchair(group, mats, seatPos.x, y, seatPos.z, facing);
        addNode(floorInfo, name, seatPos.x, y, seatPos.z);
        publishSeat(floorInfo, name, facing);
        link(floorInfo, "front_lounge_center", name);
    }

    // Back lounge: two couches facing each other across a coffee table.
    const backTable = new THREE.Vector3(5.0, y, -6.0);
    buildTable(group, mats, backTable.x, y, backTable.z, 1.4, 1.4, 0.72);
    const backLoungeCenter = addNode(floorInfo, "back_lounge_center", 5.0, y, -3.6);
    link(floorInfo, "lobby_center", "back_lounge_center");

    const backSeats = [[5.0, -4.6], [5.0, -7.4]];
    for (let i = 0; i < backSeats.length; i += 1) {
        const name = i === 0 ? "back_lounge_N" : "back_lounge_S";
        const seatPos = new THREE.Vector3(backSeats[i][0], y, backSeats[i][1]);
        const facing = faceToward(seatPos, backTable);
        buildCouch(group, mats, seatPos.x, y, seatPos.z, facing);
        addNode(floorInfo, name, seatPos.x, y, seatPos.z);
        publishSeat(floorInfo, name, facing);
        link(floorInfo, "back_lounge_center", name);
    }

    // Conversation pit (back-left): round table with four armchairs.
    const pitTable = new THREE.Vector3(-7.0, y, -6.4);
    const roundTop = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.06, 18), mats.furniture);
    roundTop.position.set(pitTable.x, 0.74, pitTable.z);
    group.add(roundTop);
    const pitCenter = addNode(floorInfo, "pit_center", -7.0, y, -3.9);
    link(floorInfo, "lobby_center", "pit_center");

    const pitSeats = { pit_N: [-7.0, -5.4], pit_S: [-7.0, -7.4], pit_E: [-5.6, -6.4], pit_W: [-8.4, -6.4] };
    for (const name of Object.keys(pitSeats)) {
        const seatPos = new THREE.Vector3(pitSeats[name][0], y, pitSeats[name][1]);
        const facing = faceToward(seatPos, pitTable);
        buildArmchair(group, mats, seatPos.x, y, seatPos.z, facing);
        addNode(floorInfo, name, seatPos.x, y, seatPos.z);
        publishSeat(floorInfo, name, facing);
        link(floorInfo, "pit_center", name);
    }

    // Water coolers with standing waypoints.
    const wcFront = buildWaterCooler(group, mats, -3.6, y, 8.4);
    const wcFrontNode = addNode(floorInfo, "lobby_wc_front", -2.9, y, 7.5);
    floorInfo.sitTargets["lobby_wc_front"] = { sit: false, facing: faceToward(wcFrontNode.pos, wcFront.position) };
    link(floorInfo, "entrance", "lobby_wc_front");

    const wcBack = buildWaterCooler(group, mats, -9.6, y, -3.4);
    const wcBackNode = addNode(floorInfo, "lobby_wc_back", -8.7, y, -2.9);
    floorInfo.sitTargets["lobby_wc_back"] = { sit: false, facing: faceToward(wcBackNode.pos, wcBack.position) };
    link(floorInfo, "hallSW", "lobby_wc_back");

    // Reception desk tucked off to the side so it does not block entrance -> elevator.
    addBox(group, mats.furniture, 1.6, 1.05, 0.8, -4.2, 0.525, 6.2);
    const reception = addNode(floorInfo, "reception", -3.4, y, 6.2);
    floorInfo.sitTargets["reception"] = { sit: false, facing: faceToward(reception.pos, new THREE.Vector3(-4.2, y, 6.2)) };
    link(floorInfo, "lobby_center", "reception");

    // Info kiosk near the entrance.
    addBox(group, mats.darkFurniture, 0.7, 1.2, 0.5, 3.4, 0.6, 8.2);
    const kiosk = addNode(floorInfo, "kiosk", 2.6, y, 7.4);
    floorInfo.sitTargets["kiosk"] = { sit: false, facing: faceToward(kiosk.pos, new THREE.Vector3(3.4, y, 8.2)) };
    link(floorInfo, "entrance", "kiosk");

    // Generic loiter waypoints so visitors spread out instead of piling up.
    const loiter = {
        lobby_stand_center: [1.5, 4.4],
        lobby_stand_NE: [8.6, 7.2],
        lobby_stand_NW: [-9.4, 7.0],
        lobby_stand_midE: [6.4, 2.4],
        lobby_stand_midW: [-6.4, 2.4],
        lobby_stand_entry: [1.8, 6.4]
    };
    for (const name of Object.keys(loiter)) {
        const node = addNode(floorInfo, name, loiter[name][0], y, loiter[name][1]);
        floorInfo.sitTargets[name] = { sit: false, facing: faceToward(node.pos, new THREE.Vector3(0, y, 2.4)) };
        link(floorInfo, "lobby_center", name);
    }

    // Potted plants by the entrance (kept clear of the 3-unit doorway).
    buildPlant(group, mats, -2.6, y, 8.4);
    buildPlant(group, mats, 2.6, y, 8.4);

    floorInfo.entranceSpot = "front_door_threshold";
    floorInfo.cafeSpots = Object.keys(floorInfo.nodes).filter((n) => n.indexOf("cafe_seat") === 0);
    floorInfo.frontLoungeSpots = Object.keys(floorInfo.sitTargets).filter((n) => n.indexOf("front_lounge_seat") === 0);
    floorInfo.backLoungeSpots = ["back_lounge_N", "back_lounge_S"];
    floorInfo.pitSpots = ["pit_N", "pit_S", "pit_E", "pit_W"];
    floorInfo.loiterSpots = Object.keys(loiter);
    floorInfo.standingSpots = ["cafe_order", "reception", "kiosk", "lobby_wc_front", "lobby_wc_back"];
}

window.WORLD = WORLD;
window.bfsPath = bfsPath;
window.createWorld = createWorld;
window.worldNearestNode = worldNearestNode;
