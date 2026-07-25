// world.js - building geometry, per-floor layouts, furniture, navigation graph, call panels

const WORLD = {
    FLOOR_HEIGHT: 3.4, FLOOR_COUNT: 6,
    BUILDING_WIDTH: 22, BUILDING_DEPTH: 18,
    SHAFT_WIDTH: 3, SHAFT_DEPTH: 3,
    PERSON_R: 0.4
};
window.WORLD = WORLD;

// ---------- canvas text textures (with dirty-cache) ----------

function makeTextTexture(initialText) {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = 8;
    tex._canvas = canvas;
    tex._lastText = null;
    updateTextTexture(tex, initialText || "");
    return tex;
}

function updateTextTexture(tex, text) {
    if (tex._lastText === text) { return; }
    tex._lastText = text;
    const canvas = tex._canvas;
    const ctx = canvas.getContext("2d");
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#050505";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffbb22";
    ctx.shadowColor = "#ffbb22";
    ctx.shadowBlur = 22;
    ctx.font = "bold 210px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 8);
    tex.needsUpdate = true;
}
window.makeTextTexture = makeTextTexture;
window.updateTextTexture = updateTextTexture;

// ---------- shared material/mesh helpers ----------

function solidMat(color) {
    return new THREE.MeshLambertMaterial({ color: color });
}

function glassMat(color, opacity) {
    return new THREE.MeshLambertMaterial({
        color: color, transparent: true, opacity: opacity,
        depthWrite: false, side: THREE.DoubleSide
    });
}

function addBox(parent, w, h, d, x, y, z, mat) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
}

// ---------- furniture ----------

function addDesk(parent, x, y, z) {
    const wood = solidMat(0x8a6642);
    addBox(parent, 1.5, 0.08, 0.7, x, y + 0.72, z, wood);
    addBox(parent, 0.08, 0.72, 0.7, x - 0.7, y + 0.36, z, wood);
    addBox(parent, 0.08, 0.72, 0.7, x + 0.7, y + 0.36, z, wood);
    // Monitor at the back (-Z) of the desk.
    addBox(parent, 0.55, 0.35, 0.04, x, y + 1.0, z - 0.26, solidMat(0x111418));
    addBox(parent, 0.1, 0.18, 0.08, x, y + 0.82, z - 0.26, solidMat(0x333));
}

function addChair(parent, x, y, z, rotY, color) {
    const g = new THREE.Group();
    const mat = solidMat(color !== undefined ? color : 0x3d4f66);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.07, 0.55), mat);
    seat.position.y = 0.45;
    g.add(seat);
    // Backrest on local -Z; seated person faces local +Z.
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.6, 0.07), mat);
    back.position.set(0, 0.75, -0.26);
    g.add(back);
    const legMat = solidMat(0x22262c);
    const lp = [[-0.22, -0.22], [0.22, -0.22], [-0.22, 0.22], [0.22, 0.22]];
    for (let i = 0; i < lp.length; i++) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.45, 0.05), legMat);
        leg.position.set(lp[i][0], 0.22, lp[i][1]);
        g.add(leg);
    }
    g.position.set(x, y, z);
    g.rotation.y = rotY;
    parent.add(g);
    return g;
}

function addCouch(parent, x, y, z, rotY, color) {
    const g = new THREE.Group();
    const mat = solidMat(color !== undefined ? color : 0x7a4b5f);
    const base = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.45, 0.8), mat);
    base.position.y = 0.25;
    g.add(base);
    const back = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.6, 0.2), mat);
    back.position.set(0, 0.7, -0.32);
    g.add(back);
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.35, 0.8), mat);
    armL.position.set(-0.95, 0.62, 0);
    g.add(armL);
    const armR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.35, 0.8), mat);
    armR.position.set(0.95, 0.62, 0);
    g.add(armR);
    g.position.set(x, y, z);
    g.rotation.y = rotY;
    parent.add(g);
    return g;
}

function addArmchair(parent, x, y, z, rotY, color) {
    const g = new THREE.Group();
    const mat = solidMat(color !== undefined ? color : 0x4b6a7a);
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.45, 0.8), mat);
    base.position.y = 0.25;
    g.add(base);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.55, 0.18), mat);
    back.position.set(0, 0.68, -0.31);
    g.add(back);
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.3, 0.8), mat);
    armL.position.set(-0.42, 0.6, 0);
    g.add(armL);
    const armR = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.3, 0.8), mat);
    armR.position.set(0.42, 0.6, 0);
    g.add(armR);
    g.position.set(x, y, z);
    g.rotation.y = rotY;
    parent.add(g);
    return g;
}

function addCoffeeTable(parent, x, y, z) {
    const wood = solidMat(0x6e553a);
    addBox(parent, 1.1, 0.06, 0.6, x, y + 0.38, z, wood);
    addBox(parent, 0.08, 0.38, 0.08, x - 0.45, y + 0.19, z - 0.2, wood);
    addBox(parent, 0.08, 0.38, 0.08, x + 0.45, y + 0.19, z - 0.2, wood);
    addBox(parent, 0.08, 0.38, 0.08, x - 0.45, y + 0.19, z + 0.2, wood);
    addBox(parent, 0.08, 0.38, 0.08, x + 0.45, y + 0.19, z + 0.2, wood);
}

function addRoundTable(parent, x, y, z, radius, height) {
    const wood = solidMat(0x7d5f3f);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.06, 20), wood);
    top.position.set(x, y + height, z);
    parent.add(top);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.14, height, 10), solidMat(0x44403a));
    post.position.set(x, y + height / 2, z);
    parent.add(post);
}

function addWaterCooler(parent, x, y, z) {
    addBox(parent, 0.35, 1.0, 0.35, x, y + 0.5, z, solidMat(0xdde4ea));
    const jug = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.4, 10),
        glassMat(0x77bbee, 0.55));
    jug.position.set(x, y + 1.22, z);
    parent.add(jug);
}

function addPlant(parent, x, y, z) {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.3, 10), solidMat(0x9a5533));
    pot.position.set(x, y + 0.15, z);
    parent.add(pot);
    const bush = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), solidMat(0x2f7a3a));
    bush.position.set(x, y + 0.62, z);
    parent.add(bush);
}

function addLongTable(parent, x, y, z, w, d) {
    const wood = solidMat(0x71543c);
    addBox(parent, w, 0.07, d, x, y + 0.74, z, wood);
    addBox(parent, 0.1, 0.74, 0.1, x - w / 2 + 0.15, y + 0.37, z - d / 2 + 0.15, wood);
    addBox(parent, 0.1, 0.74, 0.1, x + w / 2 - 0.15, y + 0.37, z - d / 2 + 0.15, wood);
    addBox(parent, 0.1, 0.74, 0.1, x - w / 2 + 0.15, y + 0.37, z + d / 2 - 0.15, wood);
    addBox(parent, 0.1, 0.74, 0.1, x + w / 2 - 0.15, y + 0.37, z + d / 2 - 0.15, wood);
}

// ---------- call panel ----------

function makeArrowShapeMesh(up, mat) {
    const s = 0.13;
    const shape = new THREE.Shape();
    if (up) {
        shape.moveTo(-s, -s * 0.8);
        shape.lineTo(s, -s * 0.8);
        shape.lineTo(0, s * 0.9);
    } else {
        shape.moveTo(-s, s * 0.8);
        shape.lineTo(s, s * 0.8);
        shape.lineTo(0, -s * 0.9);
    }
    shape.closePath();
    return new THREE.Mesh(new THREE.ShapeGeometry(shape), mat);
}

function createCallPanel() {
    const g = new THREE.Group();
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.4, 0.05), solidMat(0x2a2e36));
    g.add(plate);

    const offMat = new THREE.MeshBasicMaterial({ color: 0x39413c });
    const onMat = new THREE.MeshBasicMaterial({ color: 0x39ff5a });
    const upArrow = makeArrowShapeMesh(true, offMat.clone());
    upArrow.position.set(0, 0.12, 0.032);
    g.add(upArrow);
    const downArrow = makeArrowShapeMesh(false, offMat.clone());
    downArrow.position.set(0, -0.24, 0.032);
    g.add(downArrow);

    const tex = makeTextTexture("0");
    const disp = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.45),
        new THREE.MeshBasicMaterial({ map: tex }));
    disp.position.set(0, 0.44, 0.032);
    g.add(disp);

    g.userData.setUp = function(on) {
        upArrow.material.color.setHex(on ? 0x39ff5a : 0x39413c);
    };
    g.userData.setDown = function(on) {
        downArrow.material.color.setHex(on ? 0x39ff5a : 0x39413c);
    };
    g.userData.setIndicator = function(text) {
        updateTextTexture(tex, text);
    };
    return g;
}
window.createCallPanel = createCallPanel;

// ---------- navigation ----------

function bfsPath(nodes, fromName, toName) {
    if (!nodes[fromName] || !nodes[toName]) { return []; }
    if (fromName === toName) { return [nodes[toName].pos.clone()]; }
    const prev = {};
    const visited = {};
    visited[fromName] = true;
    const queue = [fromName];
    let found = false;
    while (queue.length > 0 && !found) {
        const cur = queue.shift();
        const links = nodes[cur].links;
        for (let i = 0; i < links.length; i++) {
            const nb = links[i];
            if (!visited[nb] && nodes[nb]) {
                visited[nb] = true;
                prev[nb] = cur;
                if (nb === toName) { found = true; break; }
                queue.push(nb);
            }
        }
    }
    if (!found) { return [nodes[toName].pos.clone()]; }
    const path = [];
    let cur = toName;
    while (cur !== undefined) {
        path.unshift(nodes[cur].pos.clone());
        cur = prev[cur];
    }
    return path;
}
window.bfsPath = bfsPath;

// ---------- world builder ----------

function createWorld(scene) {
    const FH = WORLD.FLOOR_HEIGHT;
    const FC = WORLD.FLOOR_COUNT;
    const HW = WORLD.BUILDING_WIDTH / 2;   // 11
    const HD = WORLD.BUILDING_DEPTH / 2;   // 9
    const SH = WORLD.SHAFT_WIDTH / 2;      // 1.5

    const buildingGroup = new THREE.Group();
    buildingGroup.renderOrder = 0;
    scene.add(buildingGroup);

    const slabMat = glassMat(0x888899, 0.3);
    const outerMat = glassMat(0x9999ff, 0.2);
    const innerMat = glassMat(0xbbc5e6, 0.28);
    const shaftMat = glassMat(0xccccdd, 0.15);

    // Ground slab + sidewalk + roof (solid).
    addBox(buildingGroup, WORLD.BUILDING_WIDTH + 2, 0.3, WORLD.BUILDING_DEPTH + 2, 0, -0.15, 0, solidMat(0x777777));
    addBox(buildingGroup, 26, 0.2, 6.5, 0, -0.1, HD + 3.25, solidMat(0x9a9a94));
    addBox(buildingGroup, WORLD.BUILDING_WIDTH, 0.25, WORLD.BUILDING_DEPTH, 0, FC * FH + 0.12, 0, solidMat(0x6d6d75));

    // Intermediate slabs: 4 strips around the shaft hole.
    for (let f = 1; f < FC; f++) {
        const y = f * FH - 0.06;
        addBox(buildingGroup, WORLD.BUILDING_WIDTH, 0.12, HD - SH, 0, y, (HD + SH) / 2, slabMat);   // front
        addBox(buildingGroup, WORLD.BUILDING_WIDTH, 0.12, HD - SH, 0, y, -(HD + SH) / 2, slabMat);  // back
        addBox(buildingGroup, HW - SH, 0.12, WORLD.SHAFT_DEPTH, -(HW + SH) / 2, y, 0, slabMat);     // left
        addBox(buildingGroup, HW - SH, 0.12, WORLD.SHAFT_DEPTH, (HW + SH) / 2, y, 0, slabMat);      // right
    }

    const totalH = FC * FH;

    // Outer walls. Back, left, right: full height.
    addBox(buildingGroup, WORLD.BUILDING_WIDTH, totalH, 0.12, 0, totalH / 2, -HD, outerMat);
    addBox(buildingGroup, 0.12, totalH, WORLD.BUILDING_DEPTH, -HW, totalH / 2, 0, outerMat);
    addBox(buildingGroup, 0.12, totalH, WORLD.BUILDING_DEPTH, HW, totalH / 2, 0, outerMat);
    // Front wall: floor-0 side segments leave a 3-unit entrance gap at x=0;
    // one panel covers floors 1..5.
    addBox(buildingGroup, HW - 1.5, FH, 0.12, -(HW + 1.5) / 2, FH / 2, HD, outerMat);
    addBox(buildingGroup, HW - 1.5, FH, 0.12, (HW + 1.5) / 2, FH / 2, HD, outerMat);
    addBox(buildingGroup, WORLD.BUILDING_WIDTH, totalH - FH, 0.12, 0, FH + (totalH - FH) / 2, HD, outerMat);

    // Glass entrance doors, swung open into the lobby (visual only).
    const doorMatG = glassMat(0x9fd4ff, 0.35);
    const doorL = addBox(buildingGroup, 1.4, 2.6, 0.06, 0, 1.3, 0, doorMatG);
    doorL.position.set(-1.5, 1.3, HD - 0.05);
    doorL.rotation.y = -1.25;
    doorL.geometry.translate(0.7, 0, 0);
    const doorR = addBox(buildingGroup, 1.4, 2.6, 0.06, 0, 1.3, 0, doorMatG);
    doorR.position.set(1.5, 1.3, HD - 0.05);
    doorR.rotation.y = 1.25;
    doorR.geometry.translate(-0.7, 0, 0);

    // Shaft walls: left/right/back full height; +Z side open (car has the doors).
    addBox(buildingGroup, 0.1, totalH, WORLD.SHAFT_DEPTH, -SH, totalH / 2, 0, shaftMat);
    addBox(buildingGroup, 0.1, totalH, WORLD.SHAFT_DEPTH, SH, totalH / 2, 0, shaftMat);
    addBox(buildingGroup, WORLD.SHAFT_WIDTH, totalH, 0.1, 0, totalH / 2, -SH, shaftMat);

    // Helper for interior wall segments (along X or Z).
    function wallX(y0, x1, x2, z) { // wall parallel to X axis
        if (x2 - x1 < 0.05) { return; }
        addBox(buildingGroup, x2 - x1, 3.0, 0.1, (x1 + x2) / 2, y0 + 1.5, z, innerMat);
    }
    function wallZ(y0, z1, z2, x) { // wall parallel to Z axis
        if (z2 - z1 < 0.05) { return; }
        addBox(buildingGroup, 0.1, 3.0, z2 - z1, x, y0 + 1.5, (z1 + z2) / 2, innerMat);
    }

    const floors = [];

    // ---- per-floor node helpers ----
    function N(map, name, x, y, z, links) {
        map[name] = { pos: new THREE.Vector3(x, y, z), links: links ? links.slice() : [] };
    }
    function L(map, a, b) {
        if (map[a] && map[b]) {
            if (map[a].links.indexOf(b) < 0) { map[a].links.push(b); }
            if (map[b].links.indexOf(a) < 0) { map[b].links.push(a); }
        }
    }
    function ringNodes(map, y) {
        N(map, "hallS", 0, y, 3.0); N(map, "hallSE", 3.0, y, 3.0);
        N(map, "hallE", 3.0, y, 0); N(map, "hallNE", 3.0, y, -3.0);
        N(map, "hallN", 0, y, -3.0); N(map, "hallNW", -3.0, y, -3.0);
        N(map, "hallW", -3.0, y, 0); N(map, "hallSW", -3.0, y, 3.0);
        const ring = ["hallS", "hallSE", "hallE", "hallNE", "hallN", "hallNW", "hallW", "hallSW"];
        for (let i = 0; i < ring.length; i++) { L(map, ring[i], ring[(i + 1) % ring.length]); }
        N(map, "elevWait", 0, y, 2.35);
        L(map, "elevWait", "hallS");
    }

    // ---- office floors 1..5 ----
    const officeCenters = [-8.25, -2.75, 2.75, 8.25];
    const officeLetters = ["A", "B", "C", "D"];
    let deskIdCounter = 0;

    for (let f = 1; f < FC; f++) {
        const y0 = f * FH;
        const nodes = {};
        const sitTargets = {};
        const desks = [];
        ringNodes(nodes, y0);

        // Interior walls: office band front wall (z=-3) with 4 door gaps.
        const gaps = officeCenters;
        let segStart = -HW;
        for (let gi = 0; gi < gaps.length; gi++) {
            wallX(y0, segStart, gaps[gi] - 0.6, -3);
            segStart = gaps[gi] + 0.6;
        }
        wallX(y0, segStart, HW, -3);
        // Office separators.
        wallZ(y0, -HD, -3, -5.5);
        wallZ(y0, -HD, -3, 0);
        wallZ(y0, -HD, -3, 5.5);
        // Conference room walls (front-left): x=-3 side + z=3 side with door gap at x=-4.2.
        wallZ(y0, 3, HD, -3);
        wallX(y0, -HW, -4.8, 3);
        wallX(y0, -3.6, -3, 3);
        // Lounge walls (front-right): x=3 side + z=3 side with door gap at x=4.2.
        wallZ(y0, 3, HD, 3);
        wallX(y0, 3, 3.6, 3);
        wallX(y0, 4.8, HW, 3);

        // Offices: desk + chair + nodes.
        for (let oi = 0; oi < 4; oi++) {
            const cx = officeCenters[oi];
            addDesk(buildingGroup, cx, y0, -7.5);
            addChair(buildingGroup, cx, y0, -6.7, Math.PI);
            const letter = officeLetters[oi];
            const doorName = "office" + letter + "_door";
            const deskName = "office" + letter + "_desk";
            N(nodes, doorName, cx, y0, -3.0);
            N(nodes, deskName, cx, y0, -6.7);
            L(nodes, doorName, deskName);
            L(nodes, doorName, (oi === 0) ? "hallNW" : (oi === 1) ? "hallN" : (oi === 2) ? "hallN" : "hallNE");
            if (oi === 0) { L(nodes, doorName, "hallNW"); }
            sitTargets[deskName] = { sit: true, facing: Math.PI };
            sitTargets[doorName] = { sit: false, facing: 0 };
            desks.push({
                id: deskIdCounter++, floor: f,
                wpName: deskName, doorWpName: doorName
            });
        }

        // Conference room: long table at (-7,6), 4 chairs.
        addLongTable(buildingGroup, -7, y0, 6, 3.2, 1.2);
        addChair(buildingGroup, -7.8, y0, 5.1, 0, 0x555a44);
        addChair(buildingGroup, -6.2, y0, 5.1, 0, 0x555a44);
        addChair(buildingGroup, -7.8, y0, 6.9, Math.PI, 0x555a44);
        addChair(buildingGroup, -6.2, y0, 6.9, Math.PI, 0x555a44);
        N(nodes, "conf_door", -4.2, y0, 3.3);
        N(nodes, "conf_center", -5.2, y0, 6.0);
        N(nodes, "conf_seat0", -7.8, y0, 5.1);
        N(nodes, "conf_seat1", -6.2, y0, 5.1);
        N(nodes, "conf_seat2", -7.8, y0, 6.9);
        N(nodes, "conf_seat3", -6.2, y0, 6.9);
        L(nodes, "conf_door", "hallSW");
        L(nodes, "conf_door", "conf_center");
        L(nodes, "conf_center", "conf_seat0");
        L(nodes, "conf_center", "conf_seat1");
        L(nodes, "conf_center", "conf_seat2");
        L(nodes, "conf_center", "conf_seat3");
        sitTargets["conf_seat0"] = { sit: true, facing: 0 };
        sitTargets["conf_seat1"] = { sit: true, facing: 0 };
        sitTargets["conf_seat2"] = { sit: true, facing: Math.PI };
        sitTargets["conf_seat3"] = { sit: true, facing: Math.PI };

        // Lounge: couch on right wall facing -X, coffee table, two armchairs, cooler.
        addCouch(buildingGroup, 9.6, y0, 6.0, -Math.PI / 2);
        addCoffeeTable(buildingGroup, 7.9, y0, 6.0);
        addArmchair(buildingGroup, 6.5, y0, 5.0, Math.PI / 2);
        addArmchair(buildingGroup, 6.5, y0, 7.0, Math.PI / 2);
        addWaterCooler(buildingGroup, 10.3, y0, 3.9);
        addPlant(buildingGroup, 4.0, y0, 8.4);
        N(nodes, "lounge_door", 4.2, y0, 3.3);
        N(nodes, "lounge_center", 5.6, y0, 6.0);
        N(nodes, "lounge_spot0", 9.35, y0, 5.5);
        N(nodes, "lounge_spot1", 9.35, y0, 6.5);
        N(nodes, "lounge_spot2", 6.5, y0, 5.0);
        N(nodes, "water_cooler", 9.6, y0, 3.9);
        L(nodes, "lounge_door", "hallSE");
        L(nodes, "lounge_door", "lounge_center");
        L(nodes, "lounge_center", "lounge_spot0");
        L(nodes, "lounge_center", "lounge_spot1");
        L(nodes, "lounge_center", "lounge_spot2");
        L(nodes, "lounge_center", "water_cooler");
        sitTargets["lounge_spot0"] = { sit: true, facing: -Math.PI / 2 };
        sitTargets["lounge_spot1"] = { sit: true, facing: -Math.PI / 2 };
        sitTargets["lounge_spot2"] = { sit: true, facing: Math.PI / 2 };
        sitTargets["water_cooler"] = { sit: false, facing: Math.PI / 2 };

        // Hallway loiter spots.
        N(nodes, "hall_stand_N", 1.8, y0, -4.3);
        N(nodes, "hall_stand_S", -1.9, y0, 4.4);
        L(nodes, "hall_stand_N", "hallNE");
        L(nodes, "hall_stand_S", "hallSW");
        L(nodes, "hall_stand_S", "hallS");
        sitTargets["hall_stand_N"] = { sit: false, facing: 0 };
        sitTargets["hall_stand_S"] = { sit: false, facing: Math.PI };

        // Call panel + shaft indicator.
        const panel = createCallPanel();
        panel.position.set(2.15, y0 + 1.5, SH + 0.08);
        buildingGroup.add(panel);
        const shaftTex = makeTextTexture("0");
        const shaftInd = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9),
            new THREE.MeshBasicMaterial({ map: shaftTex }));
        shaftInd.position.set(0, y0 + 2.85, SH + 0.09);
        buildingGroup.add(shaftInd);
        shaftInd.userData.setIndicator = function(text) { updateTextTexture(shaftTex, text); };

        floors.push({
            floorNumber: f, nodes: nodes, callPanel: panel,
            shaftIndicator: shaftInd, desks: desks, sitTargets: sitTargets
        });
    }

    // ---- lobby (floor 0) ----
    {
        const y0 = 0;
        const nodes = {};
        const sitTargets = {};
        ringNodes(nodes, y0);

        // Entrance chain.
        N(nodes, "outside", 0, y0, 12);
        N(nodes, "front_door_threshold", 0, y0, 9.35);
        N(nodes, "entrance", 0, y0, 7.4);
        N(nodes, "lobby_center", 0, y0, 4.6);
        L(nodes, "outside", "front_door_threshold");
        L(nodes, "front_door_threshold", "entrance");
        L(nodes, "entrance", "lobby_center");
        L(nodes, "lobby_center", "elevWait");
        L(nodes, "lobby_center", "hallS");
        L(nodes, "lobby_center", "hallSE");
        L(nodes, "lobby_center", "hallSW");
        sitTargets["outside"] = { sit: false, facing: 0 };

        // Cafe (left): counter on the left wall + machine + pastry case.
        addBox(buildingGroup, 0.9, 1.0, 4.0, -9.9, y0 + 0.5, 3.0, solidMat(0x6b4a33));
        addBox(buildingGroup, 1.0, 0.08, 4.2, -9.9, y0 + 1.04, 3.0, solidMat(0x3a2c20));
        addBox(buildingGroup, 0.4, 0.5, 0.4, -9.9, y0 + 1.33, 2.0, solidMat(0x222831)); // coffee machine
        addBox(buildingGroup, 0.5, 0.35, 0.9, -9.9, y0 + 1.26, 4.0, glassMat(0xffe9b0, 0.5)); // pastry display
        N(nodes, "cafe_order", -9.1, y0, 3.0);
        sitTargets["cafe_order"] = { sit: false, facing: -Math.PI / 2 };

        // 4 bistro tables, 2 chairs each (chairs on +/-X facing the table).
        const bistro = [[-7.8, 7.0], [-5.4, 7.0], [-7.8, 4.6], [-5.4, 4.6]];
        N(nodes, "cafe_center", -6.4, y0, 5.8);
        N(nodes, "cafe_door", -3.6, y0, 3.4);
        L(nodes, "cafe_door", "hallSW");
        L(nodes, "cafe_door", "cafe_center");
        L(nodes, "cafe_center", "cafe_order");
        L(nodes, "lobby_center", "cafe_center");
        for (let bi = 0; bi < bistro.length; bi++) {
            const bx = bistro[bi][0];
            const bz = bistro[bi][1];
            addRoundTable(buildingGroup, bx, y0, bz, 0.45, 0.72);
            addChair(buildingGroup, bx - 0.8, y0, bz, Math.PI / 2, 0x775544);
            addChair(buildingGroup, bx + 0.8, y0, bz, -Math.PI / 2, 0x775544);
            const na = "bistro" + bi + "a";
            const nb = "bistro" + bi + "b";
            N(nodes, na, bx - 0.8, y0, bz);
            N(nodes, nb, bx + 0.8, y0, bz);
            L(nodes, na, "cafe_center");
            L(nodes, nb, "cafe_center");
            sitTargets[na] = { sit: true, facing: Math.PI / 2 };
            sitTargets[nb] = { sit: true, facing: -Math.PI / 2 };
        }

        // Front lounge (right): couch on right wall facing -X + 2 armchairs + table.
        addCouch(buildingGroup, 9.6, y0, 6.8, -Math.PI / 2, 0x8a5a3a);
        addCoffeeTable(buildingGroup, 8.0, y0, 6.8);
        addArmchair(buildingGroup, 6.7, y0, 5.8, Math.PI / 2);
        addArmchair(buildingGroup, 6.7, y0, 7.8, Math.PI / 2);
        N(nodes, "flounge_center", 5.6, y0, 5.4);
        N(nodes, "flounge_couch0", 9.35, y0, 6.3);
        N(nodes, "flounge_couch1", 9.35, y0, 7.3);
        N(nodes, "flounge_chair0", 6.7, y0, 5.8);
        N(nodes, "flounge_chair1", 6.7, y0, 7.8);
        L(nodes, "flounge_center", "lobby_center");
        L(nodes, "flounge_center", "hallSE");
        L(nodes, "flounge_center", "flounge_couch0");
        L(nodes, "flounge_center", "flounge_couch1");
        L(nodes, "flounge_center", "flounge_chair0");
        L(nodes, "flounge_center", "flounge_chair1");
        sitTargets["flounge_couch0"] = { sit: true, facing: -Math.PI / 2 };
        sitTargets["flounge_couch1"] = { sit: true, facing: -Math.PI / 2 };
        sitTargets["flounge_chair0"] = { sit: true, facing: Math.PI / 2 };
        sitTargets["flounge_chair1"] = { sit: true, facing: Math.PI / 2 };

        // Back lounge (right-back): two couches across a coffee table.
        addCouch(buildingGroup, 6.0, y0, -6.9, 0, 0x5a7a4a);
        addCouch(buildingGroup, 6.0, y0, -4.1, Math.PI, 0x5a7a4a);
        addCoffeeTable(buildingGroup, 6.0, y0, -5.5);
        N(nodes, "back_lounge_center", 3.9, y0, -5.5);
        N(nodes, "back_lounge_N", 6.0, y0, -6.6);
        N(nodes, "back_lounge_S", 6.0, y0, -4.4);
        L(nodes, "back_lounge_center", "hallNE");
        L(nodes, "back_lounge_center", "hallE");
        L(nodes, "back_lounge_center", "back_lounge_N");
        L(nodes, "back_lounge_center", "back_lounge_S");
        sitTargets["back_lounge_N"] = { sit: true, facing: 0 };
        sitTargets["back_lounge_S"] = { sit: true, facing: Math.PI };

        // Conversation pit (back-left): round table + 4 armchairs.
        addRoundTable(buildingGroup, -6.5, y0, -5.5, 0.8, 0.5);
        addArmchair(buildingGroup, -6.5, y0, -7.0, 0, 0x7a6a4a);
        addArmchair(buildingGroup, -6.5, y0, -4.0, Math.PI, 0x7a6a4a);
        addArmchair(buildingGroup, -5.0, y0, -5.5, -Math.PI / 2, 0x7a6a4a);
        addArmchair(buildingGroup, -8.0, y0, -5.5, Math.PI / 2, 0x7a6a4a);
        N(nodes, "pit_approach", -6.5, y0, -3.2);
        N(nodes, "pit_N", -6.5, y0, -7.0);
        N(nodes, "pit_S", -6.5, y0, -4.0);
        N(nodes, "pit_E", -5.0, y0, -5.5);
        N(nodes, "pit_W", -8.0, y0, -5.5);
        L(nodes, "pit_approach", "hallNW");
        L(nodes, "pit_approach", "pit_S");
        L(nodes, "pit_approach", "pit_E");
        L(nodes, "pit_approach", "pit_W");
        L(nodes, "pit_N", "pit_E");
        L(nodes, "pit_N", "pit_W");
        sitTargets["pit_N"] = { sit: true, facing: 0 };
        sitTargets["pit_S"] = { sit: true, facing: Math.PI };
        sitTargets["pit_E"] = { sit: true, facing: -Math.PI / 2 };
        sitTargets["pit_W"] = { sit: true, facing: Math.PI / 2 };

        // Water coolers.
        addWaterCooler(buildingGroup, 10.3, y0, 2.2);
        addWaterCooler(buildingGroup, -9.9, y0, -2.2);
        N(nodes, "lobby_wc_front", 9.5, y0, 2.2);
        N(nodes, "lobby_wc_back", -9.0, y0, -2.2);
        L(nodes, "lobby_wc_front", "hallSE");
        L(nodes, "lobby_wc_front", "hallE");
        L(nodes, "lobby_wc_back", "hallW");
        L(nodes, "lobby_wc_back", "hallNW");
        sitTargets["lobby_wc_front"] = { sit: false, facing: Math.PI / 2 };
        sitTargets["lobby_wc_back"] = { sit: false, facing: -Math.PI / 2 };

        // Reception desk (tucked left of the entrance path) + kiosk + plants.
        addBox(buildingGroup, 1.8, 1.05, 0.8, -3.4, y0 + 0.52, 6.0, solidMat(0x51606e));
        addBox(buildingGroup, 2.0, 0.08, 0.9, -3.4, y0 + 1.1, 6.0, solidMat(0x2e3a44));
        N(nodes, "reception", -2.3, y0, 6.0);
        L(nodes, "reception", "lobby_center");
        L(nodes, "reception", "entrance");
        sitTargets["reception"] = { sit: false, facing: -Math.PI / 2 };

        addBox(buildingGroup, 0.5, 1.5, 0.5, 2.8, y0 + 0.75, 7.6, solidMat(0x35506a));
        addBox(buildingGroup, 0.6, 0.5, 0.08, 2.8, y0 + 1.45, 7.85, solidMat(0x99ccff));
        N(nodes, "kiosk", 2.1, y0, 7.6);
        L(nodes, "kiosk", "entrance");
        L(nodes, "kiosk", "lobby_center");
        sitTargets["kiosk"] = { sit: false, facing: Math.PI / 2 };

        addPlant(buildingGroup, -2.3, y0, 8.4);
        addPlant(buildingGroup, 2.3, y0, 8.5);
        addPlant(buildingGroup, -9.8, y0, 8.2);

        // Generic loiter waypoints.
        const loiter = [
            ["lobby_stand_center", 1.7, 4.9, ["lobby_center", "hallSE"]],
            ["lobby_stand_NE", 8.6, -2.4, ["hallE", "hallNE"]],
            ["lobby_stand_NW", -4.4, -7.6, ["hallNW"]],
            ["lobby_stand_midE", 5.2, 0.6, ["hallE", "hallSE"]],
            ["lobby_stand_midW", -5.2, 0.6, ["hallW", "hallSW"]],
            ["lobby_stand_entry", -1.6, 5.6, ["entrance", "lobby_center", "reception"]]
        ];
        for (let li = 0; li < loiter.length; li++) {
            const nm = loiter[li][0];
            N(nodes, nm, loiter[li][1], y0, loiter[li][2]);
            const lks = loiter[li][3];
            for (let k = 0; k < lks.length; k++) { L(nodes, nm, lks[k]); }
            sitTargets[nm] = { sit: false, facing: Math.random() * Math.PI * 2 };
        }

        // Call panel + shaft indicator (same as office floors).
        const panel0 = createCallPanel();
        panel0.position.set(2.15, y0 + 1.5, SH + 0.08);
        buildingGroup.add(panel0);
        const shaftTex0 = makeTextTexture("0");
        const shaftInd0 = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9),
            new THREE.MeshBasicMaterial({ map: shaftTex0 }));
        shaftInd0.position.set(0, y0 + 2.85, SH + 0.09);
        buildingGroup.add(shaftInd0);
        shaftInd0.userData.setIndicator = function(text) { updateTextTexture(shaftTex0, text); };

        floors.unshift({
            floorNumber: 0, nodes: nodes, callPanel: panel0,
            shaftIndicator: shaftInd0, desks: [], sitTargets: sitTargets
        });
    }

    return { buildingGroup: buildingGroup, floors: floors, bfsPath: bfsPath };
}
window.createWorld = createWorld;
