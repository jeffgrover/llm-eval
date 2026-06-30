// world.js - building geometry, per-floor layouts, furniture, navigation graph, call panels.
// Classic script - no ES modules. Depends only on THREE (loaded earlier).

const WORLD = {
    FLOOR_HEIGHT: 3.4,
    FLOOR_COUNT: 6,
    BUILDING_WIDTH: 22,
    BUILDING_DEPTH: 18,
    SHAFT_WIDTH: 3,
    SHAFT_DEPTH: 3,
    PERSON_R: 0.4,
};

const OFFICE_DEFS = [
    { id: "A", cx: -8.25 },
    { id: "B", cx: -2.75 },
    { id: "C", cx: 2.75 },
    { id: "D", cx: 8.25 },
];

// ---------------------------------------------------------------------------
// Navigation graph helpers
// ---------------------------------------------------------------------------

function makeFloorContext(floorNumber) {
    return {
        floorNumber,
        y: floorNumber * WORLD.FLOOR_HEIGHT,
        group: new THREE.Group(),
        nodes: {},
        sitTargets: {},
        desks: [],
        confSeats: [],
    };
}

function addNode(ctx, name, x, z) {
    ctx.nodes[name] = { name, pos: new THREE.Vector3(x, ctx.y, z), links: [] };
    ctx.sitTargets[name] = { sit: false, facing: 0 };
}

function linkNodes(ctx, a, b) {
    ctx.nodes[a].links.push(b);
    ctx.nodes[b].links.push(a);
}

function addSeat(ctx, name, x, z, facing) {
    addNode(ctx, name, x, z);
    ctx.sitTargets[name] = { sit: true, facing };
}

function addSeatWithMesh(ctx, name, x, z, facing, meshBuilder) {
    addSeat(ctx, name, x, z, facing);
    const mesh = meshBuilder(facing);
    mesh.position.set(x, 0, z);
    ctx.group.add(mesh);
    return mesh;
}

function addHallwayRing(ctx) {
    const r = 2.6;
    addNode(ctx, "hallS", 0, r);
    addNode(ctx, "hallSE", r, r);
    addNode(ctx, "hallE", r, 0);
    addNode(ctx, "hallNE", r, -r);
    addNode(ctx, "hallN", 0, -r);
    addNode(ctx, "hallNW", -r, -r);
    addNode(ctx, "hallW", -r, 0);
    addNode(ctx, "hallSW", -r, r);
    addNode(ctx, "elevWait", 0, 1.6);
    const ring = ["hallS", "hallSE", "hallE", "hallNE", "hallN", "hallNW", "hallW", "hallSW"];
    for (let i = 0; i < ring.length; i += 1) {
        linkNodes(ctx, ring[i], ring[(i + 1) % ring.length]);
    }
    linkNodes(ctx, "elevWait", "hallS");
}

function bfsPath(nodes, fromName, toName) {
    if (!nodes[fromName] || !nodes[toName]) return [];
    if (fromName === toName) return [nodes[toName].pos.clone()];
    const visited = new Set([fromName]);
    const queue = [[fromName]];
    while (queue.length) {
        const path = queue.shift();
        const last = path[path.length - 1];
        if (last === toName) {
            return path.slice(1).map((name) => nodes[name].pos.clone());
        }
        const node = nodes[last];
        for (const neighbor of node.links) {
            if (!visited.has(neighbor)) {
                visited.add(neighbor);
                queue.push(path.concat([neighbor]));
            }
        }
    }
    return [];
}

// ---------------------------------------------------------------------------
// Generic wall builders
// ---------------------------------------------------------------------------

function buildSolidWallAlongX(z, xStart, xEnd, y0, height, material) {
    const thickness = 0.15;
    const seg = new THREE.Mesh(new THREE.BoxGeometry(xEnd - xStart, height, thickness), material);
    seg.position.set((xStart + xEnd) / 2, y0 + height / 2, z);
    return seg;
}

function buildSolidWallAlongZ(x, zStart, zEnd, y0, height, material) {
    const thickness = 0.15;
    const seg = new THREE.Mesh(new THREE.BoxGeometry(thickness, height, zEnd - zStart), material);
    seg.position.set(x, y0 + height / 2, (zStart + zEnd) / 2);
    return seg;
}

function buildWallAlongXWithGap(z, xStart, xEnd, gapCenterX, gapWidth, y0, height, material) {
    const group = new THREE.Group();
    const halfGap = gapWidth / 2;
    const gapLo = gapCenterX - halfGap;
    const gapHi = gapCenterX + halfGap;
    if (gapLo > xStart) group.add(buildSolidWallAlongX(z, xStart, gapLo, y0, height, material));
    if (xEnd > gapHi) group.add(buildSolidWallAlongX(z, gapHi, xEnd, y0, height, material));
    return group;
}

function buildFloorSlabWithShaftHole(y, material) {
    const group = new THREE.Group();
    const w = WORLD.BUILDING_WIDTH;
    const d = WORLD.BUILDING_DEPTH;
    const sw = WORLD.SHAFT_WIDTH;
    const sd = WORLD.SHAFT_DEPTH;
    const thickness = 0.25;
    const northSouthDepth = d / 2 - sd / 2;
    const north = new THREE.Mesh(new THREE.BoxGeometry(w, thickness, northSouthDepth), material);
    north.position.set(0, y, -(sd / 2) - northSouthDepth / 2);
    const south = new THREE.Mesh(new THREE.BoxGeometry(w, thickness, northSouthDepth), material);
    south.position.set(0, y, sd / 2 + northSouthDepth / 2);
    const sideWidth = w / 2 - sw / 2;
    const east = new THREE.Mesh(new THREE.BoxGeometry(sideWidth, thickness, sd), material);
    east.position.set(sw / 2 + sideWidth / 2, y, 0);
    const west = new THREE.Mesh(new THREE.BoxGeometry(sideWidth, thickness, sd), material);
    west.position.set(-(sw / 2) - sideWidth / 2, y, 0);
    group.add(north, south, east, west);
    return group;
}

function buildFloorSlabs(buildingGroup) {
    const groundMat = new THREE.MeshLambertMaterial({ color: 0x555a63 });
    const ground = new THREE.Mesh(new THREE.BoxGeometry(WORLD.BUILDING_WIDTH, 0.3, WORLD.BUILDING_DEPTH), groundMat);
    ground.position.set(0, -0.15, 0);
    buildingGroup.add(ground);

    const roof = new THREE.Mesh(new THREE.BoxGeometry(WORLD.BUILDING_WIDTH, 0.3, WORLD.BUILDING_DEPTH), groundMat);
    roof.position.set(0, WORLD.FLOOR_COUNT * WORLD.FLOOR_HEIGHT + 0.15, 0);
    buildingGroup.add(roof);

    const slabMat = new THREE.MeshLambertMaterial({ color: 0x888c99, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide });
    for (let floor = 1; floor < WORLD.FLOOR_COUNT; floor += 1) {
        buildingGroup.add(buildFloorSlabWithShaftHole(floor * WORLD.FLOOR_HEIGHT, slabMat));
    }
}

function buildExteriorWalls(buildingGroup) {
    const outerMat = new THREE.MeshLambertMaterial({ color: 0x9999ff, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide });
    const w = WORLD.BUILDING_WIDTH;
    const d = WORLD.BUILDING_DEPTH;
    const fullHeight = WORLD.FLOOR_COUNT * WORLD.FLOOR_HEIGHT;
    const groundFloorHeight = WORLD.FLOOR_HEIGHT;
    const gapHalf = 1.5;

    buildingGroup.add(buildSolidWallAlongX(-d / 2, -w / 2, w / 2, 0, fullHeight, outerMat));
    buildingGroup.add(buildSolidWallAlongZ(-w / 2, -d / 2, d / 2, 0, fullHeight, outerMat));
    buildingGroup.add(buildSolidWallAlongZ(w / 2, -d / 2, d / 2, 0, fullHeight, outerMat));

    buildingGroup.add(buildSolidWallAlongX(d / 2, -w / 2, -gapHalf, 0, fullHeight, outerMat));
    buildingGroup.add(buildSolidWallAlongX(d / 2, gapHalf, w / 2, 0, fullHeight, outerMat));

    const aboveGapHeight = fullHeight - groundFloorHeight;
    const aboveGap = new THREE.Mesh(new THREE.BoxGeometry(gapHalf * 2, aboveGapHeight, 0.15), outerMat);
    aboveGap.position.set(0, groundFloorHeight + aboveGapHeight / 2, d / 2);
    buildingGroup.add(aboveGap);
}

function buildGlassDoors(buildingGroup) {
    const mat = new THREE.MeshLambertMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide });
    const doorHeight = WORLD.FLOOR_HEIGHT - 0.4;
    const doorGeo = new THREE.BoxGeometry(0.5, doorHeight, 0.06);
    const left = new THREE.Mesh(doorGeo, mat);
    left.position.set(-1.75, doorHeight / 2, 9);
    const right = new THREE.Mesh(doorGeo, mat);
    right.position.set(1.75, doorHeight / 2, 9);
    buildingGroup.add(left, right);
}

function buildSidewalk(buildingGroup) {
    const mat = new THREE.MeshLambertMaterial({ color: 0x9a9a93 });
    const slab = new THREE.Mesh(new THREE.BoxGeometry(8, 0.15, 6), mat);
    slab.position.set(0, -0.07, 12.5);
    buildingGroup.add(slab);
}

function makeInteriorWallMaterial() {
    return new THREE.MeshLambertMaterial({ color: 0xbbc5e6, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide });
}

// ---------------------------------------------------------------------------
// Furniture builders (local floor-relative Y; X/Z are world-absolute)
// ---------------------------------------------------------------------------

function buildChairMesh(facing, color) {
    const group = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: color || 0x555a66 });
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.08, 0.46), mat);
    seat.position.y = 0.45;
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.5, 0.08), mat);
    back.position.set(0, 0.7, -0.21);
    const legGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.45, 6);
    const legOffsets = [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]];
    for (let i = 0; i < legOffsets.length; i += 1) {
        const leg = new THREE.Mesh(legGeo, mat);
        leg.position.set(legOffsets[i][0], 0.225, legOffsets[i][1]);
        group.add(leg);
    }
    group.add(seat, back);
    group.rotation.y = facing;
    return group;
}

function buildCouchMesh(facing, color, length) {
    const group = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: color || 0x3f6e6e });
    const len = length || 1.8;
    const seat = new THREE.Mesh(new THREE.BoxGeometry(len, 0.36, 0.7), mat);
    seat.position.y = 0.3;
    const back = new THREE.Mesh(new THREE.BoxGeometry(len, 0.5, 0.14), mat);
    back.position.set(0, 0.58, -0.33);
    const armGeo = new THREE.BoxGeometry(0.14, 0.4, 0.7);
    const armLeft = new THREE.Mesh(armGeo, mat);
    armLeft.position.set(-len / 2 + 0.07, 0.4, 0);
    const armRight = new THREE.Mesh(armGeo, mat);
    armRight.position.set(len / 2 - 0.07, 0.4, 0);
    group.add(seat, back, armLeft, armRight);
    group.rotation.y = facing;
    return group;
}

function buildDesk(x, z) {
    const group = new THREE.Group();
    const woodMat = new THREE.MeshLambertMaterial({ color: 0x8a6240 });
    const desk = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.06, 0.7), woodMat);
    desk.position.set(x, 0.72, z);
    group.add(desk);
    const legGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.7, 6);
    const legXOffsets = [-0.55, 0.55];
    const legZOffsets = [-0.25, 0.25];
    for (let i = 0; i < legXOffsets.length; i += 1) {
        for (let j = 0; j < legZOffsets.length; j += 1) {
            const leg = new THREE.Mesh(legGeo, woodMat);
            leg.position.set(x + legXOffsets[i], 0.35, z + legZOffsets[j]);
            group.add(leg);
        }
    }
    const monitor = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.32, 0.04), new THREE.MeshLambertMaterial({ color: 0x111418 }));
    monitor.position.set(x, 0.98, z - 0.28);
    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, 0.06), new THREE.MeshLambertMaterial({ color: 0x222222 }));
    stand.position.set(x, 0.79, z - 0.28);
    group.add(monitor, stand);
    return group;
}

function buildConferenceTable(x, z) {
    const mat = new THREE.MeshLambertMaterial({ color: 0x6b5640 });
    const group = new THREE.Group();
    const top = new THREE.Mesh(new THREE.BoxGeometry(6, 0.08, 1.4), mat);
    top.position.set(x, 0.74, z);
    group.add(top);
    const legGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.74, 8);
    const legOffsets = [[-2.7, -0.55], [2.7, -0.55], [-2.7, 0.55], [2.7, 0.55]];
    for (let i = 0; i < legOffsets.length; i += 1) {
        const leg = new THREE.Mesh(legGeo, mat);
        leg.position.set(x + legOffsets[i][0], 0.37, z + legOffsets[i][1]);
        group.add(leg);
    }
    return group;
}

function buildCoffeeTable(x, z) {
    const mat = new THREE.MeshLambertMaterial({ color: 0x5b4a3a });
    const group = new THREE.Group();
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 0.7), mat);
    top.position.set(x, 0.32, z);
    group.add(top);
    const legGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.3, 6);
    const legOffsets = [[-0.45, -0.25], [0.45, -0.25], [-0.45, 0.25], [0.45, 0.25]];
    for (let i = 0; i < legOffsets.length; i += 1) {
        const leg = new THREE.Mesh(legGeo, mat);
        leg.position.set(x + legOffsets[i][0], 0.16, z + legOffsets[i][1]);
        group.add(leg);
    }
    return group;
}

function buildRoundTable(x, z) {
    const mat = new THREE.MeshLambertMaterial({ color: 0x5b4a3a });
    const group = new THREE.Group();
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.06, 16), mat);
    top.position.set(x, 0.7, z);
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.64, 10), mat);
    pillar.position.set(x, 0.36, z);
    group.add(top, pillar);
    return group;
}

function buildBistroTable(x, z) {
    const mat = new THREE.MeshLambertMaterial({ color: 0x4a4540 });
    const group = new THREE.Group();
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.05, 14), mat);
    top.position.set(x, 0.72, z);
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.66, 8), mat);
    pillar.position.set(x, 0.38, z);
    group.add(top, pillar);
    return group;
}

function buildCafeCounter(x, z) {
    const group = new THREE.Group();
    const counterMat = new THREE.MeshLambertMaterial({ color: 0x6b5040 });
    const topMat = new THREE.MeshLambertMaterial({ color: 0x2c2620 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.95, 0.7), counterMat);
    base.position.set(x, 0.475, z);
    const top = new THREE.Mesh(new THREE.BoxGeometry(3.7, 0.06, 0.78), topMat);
    top.position.set(x, 0.98, z);
    const machine = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.45, 0.4), new THREE.MeshLambertMaterial({ color: 0x33363c }));
    machine.position.set(x - 1.1, 1.25, z);
    const display = new THREE.Mesh(
        new THREE.BoxGeometry(0.7, 0.4, 0.4),
        new THREE.MeshLambertMaterial({ color: 0xcfe3f0, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide })
    );
    display.position.set(x + 1.0, 1.22, z);
    group.add(base, top, machine, display);
    return group;
}

function buildWaterCooler(x, z) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.9, 10), new THREE.MeshLambertMaterial({ color: 0xe6e6e6 }));
    body.position.set(x, 0.45, z);
    const jug = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.13, 0.45, 10),
        new THREE.MeshLambertMaterial({ color: 0x9fd0ee, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide })
    );
    jug.position.set(x, 1.12, z);
    group.add(body, jug);
    return group;
}

function buildReceptionDesk(x, z) {
    const group = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: 0x4a4e5c });
    const base = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.05, 0.6), mat);
    base.position.set(x, 0.525, z);
    group.add(base);
    return group;
}

function buildKiosk(x, z) {
    const group = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: 0x3a3f4a });
    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.1, 0.4), mat);
    stand.position.set(x, 0.55, z);
    const screen = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.35, 0.04), new THREE.MeshLambertMaterial({ color: 0x1f2630 }));
    screen.position.set(x, 1.25, z);
    screen.rotation.x = -0.3;
    group.add(stand, screen);
    return group;
}

function buildPottedPlant(x, z) {
    const group = new THREE.Group();
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.16, 0.32, 10), new THREE.MeshLambertMaterial({ color: 0x6b4030 }));
    pot.position.set(x, 0.16, z);
    const foliage = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 8), new THREE.MeshLambertMaterial({ color: 0x2f7a3f }));
    foliage.position.set(x, 0.62, z);
    group.add(pot, foliage);
    return group;
}

// ---------------------------------------------------------------------------
// Canvas-texture indicator panels (floor displays / shaft + car indicators)
// ---------------------------------------------------------------------------

function createIndicatorPanel(width, height) {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx2d = canvas.getContext("2d");
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.anisotropy = 4;
    texture._lastText = null;

    function updateTextTexture(text) {
        if (texture._lastText === text) return;
        texture._lastText = text;
        ctx2d.fillStyle = "#050505";
        ctx2d.fillRect(0, 0, canvas.width, canvas.height);
        ctx2d.fillStyle = "#ffbb22";
        ctx2d.shadowColor = "#ffbb22";
        ctx2d.shadowBlur = 22;
        ctx2d.textAlign = "center";
        ctx2d.textBaseline = "middle";
        const fontSize = Math.floor(canvas.height * (text.length > 1 ? 0.6 : 0.82));
        ctx2d.font = "bold " + fontSize + "px monospace";
        ctx2d.fillText(text, canvas.width / 2, canvas.height / 2 + canvas.height * 0.02);
        texture.needsUpdate = true;
    }

    const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide });
    const geometry = new THREE.PlaneGeometry(width, height);
    const mesh = new THREE.Mesh(geometry, material);
    updateTextTexture(" ");
    return { mesh, texture, updateText: updateTextTexture };
}

function createCallPanel() {
    const group = new THREE.Group();
    const plateMat = new THREE.MeshLambertMaterial({ color: 0x333344, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide });
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.4, 0.05), plateMat);
    group.add(plate);

    function triangleGeometry(up) {
        const shape = new THREE.Shape();
        const r = 0.13;
        if (up) {
            shape.moveTo(-r, -r);
            shape.lineTo(r, -r);
            shape.lineTo(0, r);
        } else {
            shape.moveTo(-r, r);
            shape.lineTo(r, r);
            shape.lineTo(0, -r);
        }
        shape.closePath();
        return new THREE.ShapeGeometry(shape);
    }

    const upOffMat = new THREE.MeshBasicMaterial({ color: 0x444444 });
    const upOnMat = new THREE.MeshStandardMaterial({ color: 0x33ff66, emissive: 0x33ff66, emissiveIntensity: 1.2 });
    const downOffMat = new THREE.MeshBasicMaterial({ color: 0x444444 });
    const downOnMat = new THREE.MeshStandardMaterial({ color: 0x33ff66, emissive: 0x33ff66, emissiveIntensity: 1.2 });

    const upArrow = new THREE.Mesh(triangleGeometry(true), upOffMat);
    upArrow.position.set(0, 0.32, 0.03);
    const downArrow = new THREE.Mesh(triangleGeometry(false), downOffMat);
    downArrow.position.set(0, -0.02, 0.03);
    group.add(upArrow, downArrow);

    const indicator = createIndicatorPanel(0.45, 0.45);
    indicator.mesh.position.set(0, -0.5, 0.03);
    group.add(indicator.mesh);

    group.userData.setUp = function setUp(on) {
        upArrow.material = on ? upOnMat : upOffMat;
    };
    group.userData.setDown = function setDown(on) {
        downArrow.material = on ? downOnMat : downOffMat;
    };
    group.userData.setIndicator = function setIndicator(text) {
        indicator.updateText(text);
    };

    return group;
}

// ---------------------------------------------------------------------------
// Floor builders
// ---------------------------------------------------------------------------

function addCallPanelAndShaftIndicator(ctx) {
    const callPanel = createCallPanel();
    callPanel.position.set(WORLD.SHAFT_WIDTH / 2 + 0.35, 1.1, WORLD.SHAFT_DEPTH / 2 + 0.03);
    ctx.group.add(callPanel);
    ctx.callPanel = callPanel;

    const shaftIndicator = createIndicatorPanel(0.9, 0.9);
    shaftIndicator.mesh.position.set(0, WORLD.FLOOR_HEIGHT - 0.5, WORLD.SHAFT_DEPTH / 2 + 0.03);
    ctx.group.add(shaftIndicator.mesh);
    ctx.shaftIndicator = shaftIndicator;
}

function buildOfficeFloor(floorNumber) {
    const ctx = makeFloorContext(floorNumber);
    const wallMat = makeInteriorWallMaterial();
    const wallHeight = WORLD.FLOOR_HEIGHT - 0.3;

    addHallwayRing(ctx);

    for (let i = 0; i < OFFICE_DEFS.length; i += 1) {
        const def = OFFICE_DEFS[i];
        const deskZ = -8.2;
        const chairZ = -6.9;
        const doorWp = "office" + def.id + "_door";
        const deskWp = "office" + def.id + "_desk";
        addNode(ctx, doorWp, def.cx, -3);
        addSeatWithMesh(ctx, deskWp, def.cx, chairZ, Math.PI, (facing) => buildChairMesh(facing, 0x46506b));
        const nearHall = def.cx < 0 ? "hallNW" : "hallNE";
        linkNodes(ctx, doorWp, nearHall);
        linkNodes(ctx, doorWp, deskWp);

        ctx.group.add(buildDesk(def.cx, deskZ));

        const officeWidth = 5.5;
        ctx.group.add(
            buildWallAlongXWithGap(-3, def.cx - officeWidth / 2, def.cx + officeWidth / 2, def.cx, 1.2, 0, wallHeight, wallMat)
        );

        ctx.desks.push({ id: def.id, deskWp, doorWp });
    }

    const dividerXs = [-5.5, 0, 5.5];
    for (let i = 0; i < dividerXs.length; i += 1) {
        ctx.group.add(buildSolidWallAlongZ(dividerXs[i], -9, -3, 0, wallHeight, wallMat));
    }

    // Conference room (front-left quadrant)
    addNode(ctx, "conf_door", -4, 3);
    addNode(ctx, "conf_center", -7, 6);
    linkNodes(ctx, "conf_door", "hallSW");
    linkNodes(ctx, "conf_door", "conf_center");
    addSeatWithMesh(ctx, "conf_seat0", -9, 4.9, 0, (facing) => buildChairMesh(facing, 0x46506b));
    addSeatWithMesh(ctx, "conf_seat1", -5, 4.9, 0, (facing) => buildChairMesh(facing, 0x46506b));
    addSeatWithMesh(ctx, "conf_seat2", -9, 7.6, Math.PI, (facing) => buildChairMesh(facing, 0x46506b));
    addSeatWithMesh(ctx, "conf_seat3", -5, 7.6, Math.PI, (facing) => buildChairMesh(facing, 0x46506b));
    const confSeatNames = ["conf_seat0", "conf_seat1", "conf_seat2", "conf_seat3"];
    for (let i = 0; i < confSeatNames.length; i += 1) linkNodes(ctx, "conf_center", confSeatNames[i]);
    ctx.group.add(buildConferenceTable(-7, 6.2));
    ctx.group.add(buildWallAlongXWithGap(3, -11, -3, -4, 1.2, 0, wallHeight, wallMat));
    ctx.confSeats = confSeatNames;

    // Lounge (front-right quadrant)
    addNode(ctx, "lounge_door", 4, 3);
    addNode(ctx, "lounge_center", 7, 6);
    linkNodes(ctx, "lounge_door", "hallSE");
    linkNodes(ctx, "lounge_door", "lounge_center");
    addSeatWithMesh(ctx, "lounge_spot0", 9.5, 6, -Math.PI / 2, (facing) => buildCouchMesh(facing, 0x3f6e6e, 1.8));
    addSeatWithMesh(ctx, "lounge_spot1", 5, 4.6, Math.PI / 2, (facing) => buildChairMesh(facing, 0x55785f));
    addSeatWithMesh(ctx, "lounge_spot2", 5, 7.4, Math.PI / 2, (facing) => buildChairMesh(facing, 0x55785f));
    const loungeSpotNames = ["lounge_spot0", "lounge_spot1", "lounge_spot2"];
    for (let i = 0; i < loungeSpotNames.length; i += 1) linkNodes(ctx, "lounge_center", loungeSpotNames[i]);
    ctx.group.add(buildCoffeeTable(7, 6));
    ctx.group.add(buildWaterCooler(9.7, 8.3));
    ctx.group.add(buildWallAlongXWithGap(3, 3, 11, 4, 1.2, 0, wallHeight, wallMat));

    addNode(ctx, "water_cooler", 9.7, 8.3);
    linkNodes(ctx, "water_cooler", "lounge_center");

    addNode(ctx, "hall_stand_N", -1.2, -2.0);
    linkNodes(ctx, "hall_stand_N", "hallN");
    addNode(ctx, "hall_stand_S", 1.2, 2.0);
    linkNodes(ctx, "hall_stand_S", "hallS");

    addCallPanelAndShaftIndicator(ctx);

    ctx.group.renderOrder = 0;
    ctx.group.position.y = ctx.y;
    return ctx;
}

function buildLobbyFloor() {
    const ctx = makeFloorContext(0);
    const wallMat = makeInteriorWallMaterial();

    addHallwayRing(ctx);

    addNode(ctx, "outside", 0, 12);
    addNode(ctx, "front_door_threshold", 0, 9.35);
    addNode(ctx, "entrance", 0, 7.4);
    addNode(ctx, "lobby_center", 0, 4);
    linkNodes(ctx, "outside", "front_door_threshold");
    linkNodes(ctx, "front_door_threshold", "entrance");
    linkNodes(ctx, "entrance", "lobby_center");
    linkNodes(ctx, "lobby_center", "elevWait");

    // Cafe (left wall)
    addNode(ctx, "cafe_door", -4, 3);
    linkNodes(ctx, "cafe_door", "hallSW");
    addNode(ctx, "cafe_order", -8.2, 1.0);
    linkNodes(ctx, "cafe_door", "cafe_order");
    ctx.group.add(buildCafeCounter(-9.3, -2.6));

    const cafeSpots = ["cafe_order"];
    const bistroCenters = [[-9.5, -1.0], [-9.5, 1.8], [-6.0, -1.0], [-6.0, 1.8]];
    for (let i = 0; i < bistroCenters.length; i += 1) {
        const bx = bistroCenters[i][0];
        const bz = bistroCenters[i][1];
        const seatA = "bistro" + i + "_seat0";
        const seatB = "bistro" + i + "_seat1";
        addSeatWithMesh(ctx, seatA, bx - 0.55, bz, Math.PI / 2, (facing) => buildChairMesh(facing, 0x6b4a3a));
        addSeatWithMesh(ctx, seatB, bx + 0.55, bz, -Math.PI / 2, (facing) => buildChairMesh(facing, 0x6b4a3a));
        linkNodes(ctx, "cafe_order", seatA);
        linkNodes(ctx, "cafe_order", seatB);
        ctx.group.add(buildBistroTable(bx, bz));
        cafeSpots.push(seatA, seatB);
    }

    // Front lounge (right side)
    addNode(ctx, "front_lounge_door", 4, 3);
    linkNodes(ctx, "front_lounge_door", "hallSE");
    addNode(ctx, "front_lounge_center", 7.5, 5.5);
    linkNodes(ctx, "front_lounge_door", "front_lounge_center");
    addSeatWithMesh(ctx, "front_lounge_spot0", 10, 5.5, -Math.PI / 2, (facing) => buildCouchMesh(facing, 0x3f6e6e, 1.8));
    addSeatWithMesh(ctx, "front_lounge_spot1", 6, 4, Math.PI / 2, (facing) => buildChairMesh(facing, 0x55785f));
    addSeatWithMesh(ctx, "front_lounge_spot2", 6, 7, Math.PI / 2, (facing) => buildChairMesh(facing, 0x55785f));
    const frontLoungeSpots = ["front_lounge_spot0", "front_lounge_spot1", "front_lounge_spot2"];
    for (let i = 0; i < frontLoungeSpots.length; i += 1) linkNodes(ctx, "front_lounge_center", frontLoungeSpots[i]);
    ctx.group.add(buildCoffeeTable(7.5, 5.5));
    ctx.group.add(buildPottedPlant(10.5, 8.3));

    // Back lounge (two couches facing each other)
    addNode(ctx, "back_lounge_hub", 6, -5.5);
    linkNodes(ctx, "back_lounge_hub", "hallNE");
    addSeatWithMesh(ctx, "back_lounge_N", 6, -7, 0, (facing) => buildCouchMesh(facing, 0x6a4a73, 2.0));
    addSeatWithMesh(ctx, "back_lounge_S", 6, -4, Math.PI, (facing) => buildCouchMesh(facing, 0x6a4a73, 2.0));
    linkNodes(ctx, "back_lounge_hub", "back_lounge_N");
    linkNodes(ctx, "back_lounge_hub", "back_lounge_S");
    ctx.group.add(buildCoffeeTable(6, -5.5));

    // Conversation pit (back-left)
    addNode(ctx, "pit_hub", -7, -5.5);
    linkNodes(ctx, "pit_hub", "hallNW");
    addSeatWithMesh(ctx, "pit_N", -7, -7, 0, (facing) => buildChairMesh(facing, 0x8a5a3a));
    addSeatWithMesh(ctx, "pit_S", -7, -4, Math.PI, (facing) => buildChairMesh(facing, 0x8a5a3a));
    addSeatWithMesh(ctx, "pit_E", -5.5, -5.5, -Math.PI / 2, (facing) => buildChairMesh(facing, 0x8a5a3a));
    addSeatWithMesh(ctx, "pit_W", -8.5, -5.5, Math.PI / 2, (facing) => buildChairMesh(facing, 0x8a5a3a));
    const pitSpots = ["pit_N", "pit_S", "pit_E", "pit_W"];
    for (let i = 0; i < pitSpots.length; i += 1) linkNodes(ctx, "pit_hub", pitSpots[i]);
    ctx.group.add(buildRoundTable(-7, -5.5));

    // Water coolers
    addNode(ctx, "lobby_wc_front", 9.5, 3.2);
    linkNodes(ctx, "lobby_wc_front", "front_lounge_center");
    addNode(ctx, "lobby_wc_back", 3.5, -5);
    linkNodes(ctx, "lobby_wc_back", "back_lounge_hub");
    ctx.group.add(buildWaterCooler(9.5, 3.2));
    ctx.group.add(buildWaterCooler(3.5, -5));

    // Reception + kiosk (tucked off to the side, clear of the entrance path)
    addNode(ctx, "reception", -3, 6);
    linkNodes(ctx, "reception", "entrance");
    ctx.group.add(buildReceptionDesk(-3, 6.3));

    addNode(ctx, "kiosk", 2.3, 6.6);
    linkNodes(ctx, "kiosk", "entrance");
    ctx.group.add(buildKiosk(2.3, 6.6));

    // Generic loiter waypoints
    addNode(ctx, "lobby_stand_center", 0, 4.8);
    linkNodes(ctx, "lobby_stand_center", "lobby_center");
    addNode(ctx, "lobby_stand_NE", 3.2, 1.2);
    linkNodes(ctx, "lobby_stand_NE", "hallSE");
    addNode(ctx, "lobby_stand_NW", -3.2, 1.2);
    linkNodes(ctx, "lobby_stand_NW", "hallSW");
    addNode(ctx, "lobby_stand_midE", 3.5, 4.2);
    linkNodes(ctx, "lobby_stand_midE", "front_lounge_center");
    addNode(ctx, "lobby_stand_midW", -3.5, 4.2);
    linkNodes(ctx, "lobby_stand_midW", "cafe_order");
    addNode(ctx, "lobby_stand_entry", 0, 6.2);
    linkNodes(ctx, "lobby_stand_entry", "entrance");
    const loiterSpots = ["lobby_stand_center", "lobby_stand_NE", "lobby_stand_NW", "lobby_stand_midE", "lobby_stand_midW", "lobby_stand_entry"];

    ctx.group.add(buildPottedPlant(-2.2, 8.5));
    ctx.group.add(buildPottedPlant(2.2, 8.5));

    addCallPanelAndShaftIndicator(ctx);

    ctx.entranceSpot = "entrance";
    ctx.cafeSpots = cafeSpots;
    ctx.loiterSpots = loiterSpots;
    ctx.confSeats = [];

    ctx.group.renderOrder = 0;
    ctx.group.position.y = ctx.y;
    return ctx;
}

// ---------------------------------------------------------------------------
// World assembly
// ---------------------------------------------------------------------------

function createWorld(scene) {
    const buildingGroup = new THREE.Group();
    buildingGroup.renderOrder = 0;

    buildFloorSlabs(buildingGroup);
    buildExteriorWalls(buildingGroup);
    buildGlassDoors(buildingGroup);
    buildSidewalk(buildingGroup);

    const floors = [];
    const lobbyCtx = buildLobbyFloor();
    buildingGroup.add(lobbyCtx.group);
    floors.push(lobbyCtx);

    for (let floorNumber = 1; floorNumber < WORLD.FLOOR_COUNT; floorNumber += 1) {
        const officeCtx = buildOfficeFloor(floorNumber);
        buildingGroup.add(officeCtx.group);
        floors.push(officeCtx);
    }

    scene.add(buildingGroup);

    return { buildingGroup, floors, bfsPath };
}

window.WORLD = WORLD;
window.createWorld = createWorld;
window.bfsPath = bfsPath;
window.createIndicatorPanel = createIndicatorPanel;
