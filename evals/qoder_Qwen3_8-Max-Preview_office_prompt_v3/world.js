// world.js - building geometry, per-floor layouts, furniture, navigation graph, call panels.

const WORLD = {
    FLOOR_HEIGHT: 3.4, FLOOR_COUNT: 6,
    BUILDING_WIDTH: 22, BUILDING_DEPTH: 18,
    SHAFT_WIDTH: 3, SHAFT_DEPTH: 3,
    PERSON_R: 0.4
};

const HALF_W = WORLD.BUILDING_WIDTH / 2;   // 11
const HALF_D = WORLD.BUILDING_DEPTH / 2;   // 9
const SHAFT_HALF = WORLD.SHAFT_WIDTH / 2;  // 1.5
const TOP_Y = WORLD.FLOOR_HEIGHT * WORLD.FLOOR_COUNT;

function makeTransparentMat(color, opacity) {
    return new THREE.MeshStandardMaterial({
        color: color, transparent: true, opacity: opacity,
        depthWrite: false, side: THREE.DoubleSide, roughness: 0.9,
    });
}

function addBox(parent, mat, w, h, d, x, y, z) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
}

// ---------- canvas text indicators (call panels, shaft + car displays) ----------

function updateTextTexture(tex, text) {
    if (tex._lastText === text) return;
    tex._lastText = text;
    const ctx = tex.image.getContext("2d");
    ctx.fillStyle = "#050505";
    ctx.fillRect(0, 0, 256, 256);
    ctx.font = "bold 210px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "#ffbb22";
    ctx.shadowBlur = 26;
    ctx.fillStyle = "#ffbb22";
    ctx.fillText(text, 128, 138);
    tex.needsUpdate = true;
}

function makeTextTexture(initialText) {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = 4;
    tex._lastText = null;
    updateTextTexture(tex, initialText);
    return tex;
}

function makeTextIndicator(w, h) {
    const tex = makeTextTexture("0");
    const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
    );
    mesh.userData.setIndicator = function setIndicator(text) {
        updateTextTexture(tex, text);
    };
    return mesh;
}

function makeCallPanel() {
    const group = new THREE.Group();
    const plate = new THREE.Mesh(
        new THREE.BoxGeometry(0.55, 1.4, 0.05),
        new THREE.MeshStandardMaterial({ color: 0x2c313c, roughness: 0.7 })
    );
    group.add(plate);

    const lampOff = new THREE.MeshBasicMaterial({ color: 0x3a404c });
    const lampOn = new THREE.MeshBasicMaterial({ color: 0x22ff66 });

    const upShape = new THREE.Shape();
    upShape.moveTo(0, 0.13);
    upShape.lineTo(-0.13, -0.1);
    upShape.lineTo(0.13, -0.1);
    upShape.lineTo(0, 0.13);
    const downShape = new THREE.Shape();
    downShape.moveTo(0, -0.13);
    downShape.lineTo(-0.13, 0.1);
    downShape.lineTo(0.13, 0.1);
    downShape.lineTo(0, -0.13);

    const upTri = new THREE.Mesh(new THREE.ShapeGeometry(upShape), lampOff);
    upTri.position.set(0, 0.42, 0.031);
    group.add(upTri);
    const downTri = new THREE.Mesh(new THREE.ShapeGeometry(downShape), lampOff);
    downTri.position.set(0, -0.42, 0.031);
    group.add(downTri);

    const indicator = makeTextIndicator(0.45, 0.45);
    indicator.position.set(0, 0, 0.032);
    group.add(indicator);

    group.userData.setUp = function setUp(on) {
        upTri.material = on ? lampOn : lampOff;
    };
    group.userData.setDown = function setDown(on) {
        downTri.material = on ? lampOn : lampOff;
    };
    group.userData.setIndicator = function setIndicatorText(text) {
        indicator.userData.setIndicator(text);
    };
    return group;
}

// ---------- furniture builders (chairs face +Z: seat opens toward +Z, backrest at -Z) ----------

function buildChair(parent, mat, x, y0, z, facing) {
    const chair = new THREE.Group();
    addBox(chair, mat, 0.52, 0.07, 0.5, 0, 0.45, 0);
    addBox(chair, mat, 0.52, 0.55, 0.07, 0, 0.76, -0.24);
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.42, 8), mat);
    ped.position.y = 0.22;
    chair.add(ped);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.05, 10), mat);
    base.position.y = 0.025;
    chair.add(base);
    chair.position.set(x, y0, z);
    chair.rotation.y = facing;
    parent.add(chair);
    return chair;
}

function buildSofa(parent, mat, width, x, y0, z, facing) {
    const sofa = new THREE.Group();
    addBox(sofa, mat, width, 0.34, 0.82, 0, 0.24, 0);
    addBox(sofa, mat, width, 0.52, 0.18, 0, 0.62, -0.33);
    addBox(sofa, mat, 0.16, 0.5, 0.82, -(width / 2 - 0.08), 0.34, 0);
    addBox(sofa, mat, 0.16, 0.5, 0.82, width / 2 - 0.08, 0.34, 0);
    sofa.position.set(x, y0, z);
    sofa.rotation.y = facing;
    parent.add(sofa);
    return sofa;
}

function buildTable(parent, mat, w, d, x, y0, z, height) {
    const h = height || 0.72;
    addBox(parent, mat, w, 0.06, d, x, y0 + h, z);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, h, 8), mat);
    leg.position.set(x, y0 + h / 2, z);
    parent.add(leg);
}

function buildRoundTable(parent, mat, r, x, y0, z, height) {
    const h = height || 0.72;
    const top = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.06, 18), mat);
    top.position.set(x, y0 + h, z);
    parent.add(top);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, h, 10), mat);
    leg.position.set(x, y0 + h / 2, z);
    parent.add(leg);
}

function buildWaterCooler(parent, x, y0, z) {
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xcfd8e6, roughness: 0.6 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.92, 12), bodyMat);
    body.position.set(x, y0 + 0.46, z);
    parent.add(body);
    const jugMat = new THREE.MeshStandardMaterial({
        color: 0x7fb8e8, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide,
    });
    const jug = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.34, 12), jugMat);
    jug.position.set(x, y0 + 1.09, z);
    parent.add(jug);
}

function buildPlant(parent, x, y0, z) {
    const potMat = new THREE.MeshStandardMaterial({ color: 0x8a5a33, roughness: 0.9 });
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.2, 0.38, 10), potMat);
    pot.position.set(x, y0 + 0.19, z);
    parent.add(pot);
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x4a8f3c, roughness: 0.9 });
    const l1 = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), leafMat);
    l1.position.set(x, y0 + 0.78, z);
    parent.add(l1);
    const l2 = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), leafMat);
    l2.position.set(x + 0.12, y0 + 1.12, z - 0.06);
    parent.add(l2);
}

// ---------- navigation graph ----------

function bfsPath(nodes, fromName, toName) {
    if (!nodes[fromName] || !nodes[toName]) {
        return nodes[toName] ? [nodes[toName].pos.clone()] : [];
    }
    if (fromName === toName) return [nodes[fromName].pos.clone()];
    const prev = new Map();
    prev.set(fromName, null);
    const queue = [fromName];
    let found = false;
    while (queue.length > 0) {
        const cur = queue.shift();
        if (cur === toName) { found = true; break; }
        const links = nodes[cur].links;
        for (let i = 0; i < links.length; i += 1) {
            const nxt = links[i];
            if (!nodes[nxt] || prev.has(nxt)) continue;
            prev.set(nxt, cur);
            queue.push(nxt);
        }
    }
    if (!found) return [nodes[toName].pos.clone()];
    const names = [];
    let walk = toName;
    while (walk !== null) {
        names.push(walk);
        walk = prev.get(walk);
    }
    names.reverse();
    return names.map((n) => nodes[n].pos.clone());
}

function makeGraph() {
    return { nodes: {}, links: {} };
}

function addNode(graph, name, x, y0, z) {
    graph.nodes[name] = { pos: new THREE.Vector3(x, y0, z), links: [] };
}

function linkNodes(graph, a, b) {
    if (!graph.nodes[a] || !graph.nodes[b]) return;
    if (graph.nodes[a].links.indexOf(b) === -1) graph.nodes[a].links.push(b);
    if (graph.nodes[b].links.indexOf(a) === -1) graph.nodes[b].links.push(a);
}

function addHallRing(graph, y0) {
    addNode(graph, "hallS", 0, y0, 3.1);
    addNode(graph, "hallSE", 3.1, y0, 3.1);
    addNode(graph, "hallE", 3.1, y0, 0);
    addNode(graph, "hallNE", 3.1, y0, -3.1);
    addNode(graph, "hallN", 0, y0, -3.1);
    addNode(graph, "hallNW", -3.1, y0, -3.1);
    addNode(graph, "hallW", -3.1, y0, 0);
    addNode(graph, "hallSW", -3.1, y0, 3.1);
    addNode(graph, "elevWait", 0, y0, 2.3);
    linkNodes(graph, "elevWait", "hallS");
    linkNodes(graph, "hallS", "hallSE");
    linkNodes(graph, "hallSE", "hallE");
    linkNodes(graph, "hallE", "hallNE");
    linkNodes(graph, "hallNE", "hallN");
    linkNodes(graph, "hallN", "hallNW");
    linkNodes(graph, "hallNW", "hallW");
    linkNodes(graph, "hallW", "hallSW");
    linkNodes(graph, "hallSW", "hallS");
}

// ---------- per-floor construction ----------

const OFFICE_LETTERS = ["A", "B", "C", "D"];
const OFFICE_X = [-8.25, -2.75, 2.75, 8.25];

function buildOfficeFloor(parent, floorNumber, innerWallMat, woodMat, chairMat) {
    const y0 = floorNumber * WORLD.FLOOR_HEIGHT;
    const graph = makeGraph();
    const sitTargets = {};
    const desks = [];

    addHallRing(graph, y0);

    // Interior walls: office strip along the back (z -9..-4) with door gaps.
    const wallH = WORLD.FLOOR_HEIGHT - 0.25;
    const wallY = y0 + wallH / 2;
    const segs = [
        [-HALF_W, -8.85], [-7.65, -3.35], [-2.15, 2.15], [3.35, 7.65], [8.85, HALF_W]
    ];
    for (let i = 0; i < segs.length; i += 1) {
        const a = segs[i][0];
        const b = segs[i][1];
        addBox(parent, innerWallMat, b - a, wallH, 0.1, (a + b) / 2, wallY, -4);
    }
    for (let i = 0; i < 3; i += 1) {
        const x = [-5.5, 0, 5.5][i];
        addBox(parent, innerWallMat, 0.1, wallH, 5, x, wallY, -6.5);
    }
    // Conference room (front-left): east wall with door gap at z=4.5, solid south wall.
    addBox(parent, innerWallMat, 0.1, wallH, 0.9, -3, wallY, 3.45);
    addBox(parent, innerWallMat, 0.1, wallH, 3.9, -3, wallY, 7.05);
    addBox(parent, innerWallMat, 8, wallH, 0.1, -7, wallY, 3);
    // Lounge (front-right): west wall with door gap, solid south wall.
    addBox(parent, innerWallMat, 0.1, wallH, 0.9, 3, wallY, 3.45);
    addBox(parent, innerWallMat, 0.1, wallH, 3.9, 3, wallY, 7.05);
    addBox(parent, innerWallMat, 8, wallH, 0.1, 7, wallY, 3);

    // Four private offices with desk + chair; sitter faces -Z toward the monitor.
    for (let i = 0; i < 4; i += 1) {
        const letter = OFFICE_LETTERS[i];
        const cx = OFFICE_X[i];
        addBox(parent, woodMat, 1.7, 0.06, 0.85, cx, y0 + 0.74, -8.35);
        addBox(parent, woodMat, 0.06, 0.72, 0.8, cx - 0.8, y0 + 0.36, -8.35);
        addBox(parent, woodMat, 0.06, 0.72, 0.8, cx + 0.8, y0 + 0.36, -8.35);
        addBox(parent, new THREE.MeshStandardMaterial({ color: 0x141a24, roughness: 0.4 }),
            0.55, 0.35, 0.04, cx, y0 + 1.02, -8.62);
        addBox(parent, woodMat, 0.06, 0.14, 0.06, cx, y0 + 0.84, -8.62);

        const deskWp = "office" + letter + "_desk";
        const doorWp = "office" + letter + "_door";
        buildChair(parent, chairMat, cx, y0, -7.45, Math.PI);
        addNode(graph, deskWp, cx, y0, -7.45);
        addNode(graph, doorWp, cx, y0, -3.4);
        linkNodes(graph, doorWp, deskWp);
        sitTargets[deskWp] = { sit: true, facing: Math.PI };
        desks.push({ deskWp: deskWp, doorWp: doorWp, floor: floorNumber, office: letter });
    }
    linkNodes(graph, "officeA_door", "hallNW");
    linkNodes(graph, "officeB_door", "hallNW");
    linkNodes(graph, "officeB_door", "hallN");
    linkNodes(graph, "officeC_door", "hallN");
    linkNodes(graph, "officeC_door", "hallNE");
    linkNodes(graph, "officeD_door", "hallNE");

    // Conference room: table + four chairs, two per long side facing each other.
    addBox(parent, woodMat, 2.8, 0.08, 1.1, -7, y0 + 0.74, 6);
    addBox(parent, woodMat, 0.5, 0.7, 0.7, -7, y0 + 0.35, 6);
    const confSeats = [
        { name: "conf_seat0", x: -8.9, z: 6.95, facing: Math.PI },
        { name: "conf_seat1", x: -5.1, z: 6.95, facing: Math.PI },
        { name: "conf_seat2", x: -8.9, z: 5.05, facing: 0 },
        { name: "conf_seat3", x: -5.1, z: 5.05, facing: 0 },
    ];
    addNode(graph, "conf_door", -2.4, y0, 4.5);
    addNode(graph, "conf_center", -7, y0, 7.9);
    linkNodes(graph, "conf_door", "hallSW");
    linkNodes(graph, "conf_door", "conf_center");
    for (let i = 0; i < confSeats.length; i += 1) {
        const s = confSeats[i];
        buildChair(parent, chairMat, s.x, y0, s.z, s.facing);
        addNode(graph, s.name, s.x, y0, s.z);
        sitTargets[s.name] = { sit: true, facing: s.facing };
    }
    linkNodes(graph, "conf_center", "conf_seat0");
    linkNodes(graph, "conf_center", "conf_seat1");
    linkNodes(graph, "conf_seat0", "conf_seat2");
    linkNodes(graph, "conf_seat1", "conf_seat3");

    // Lounge: couch against the front wall, coffee table, two armchairs, cooler.
    buildSofa(parent, chairMat, 2.2, 7, y0, 8.15, Math.PI);
    buildTable(parent, woodMat, 1.4, 0.7, 7, y0, 6.55, 0.45);
    buildChair(parent, chairMat, 5.0, y0, 6.55, Math.PI / 2);
    buildChair(parent, chairMat, 9.0, y0, 6.55, -Math.PI / 2);
    buildWaterCooler(parent, 10.35, y0, 3.6);
    addNode(graph, "lounge_door", 2.4, y0, 4.5);
    linkNodes(graph, "lounge_door", "hallSE");
    addNode(graph, "lounge_spot0", 7, y0, 7.75);
    addNode(graph, "lounge_spot1", 5.0, y0, 6.55);
    addNode(graph, "lounge_spot2", 9.0, y0, 6.55);
    addNode(graph, "water_cooler", 9.5, y0, 3.6);
    linkNodes(graph, "lounge_door", "lounge_spot1");
    linkNodes(graph, "lounge_spot1", "lounge_spot0");
    linkNodes(graph, "lounge_spot0", "lounge_spot2");
    linkNodes(graph, "lounge_door", "water_cooler");
    linkNodes(graph, "water_cooler", "lounge_spot2");
    sitTargets["lounge_spot0"] = { sit: true, facing: Math.PI };
    sitTargets["lounge_spot1"] = { sit: true, facing: Math.PI / 2 };
    sitTargets["lounge_spot2"] = { sit: true, facing: -Math.PI / 2 };

    // Hallway loiter spots.
    addNode(graph, "hall_stand_N", 0, y0, -3.35);
    addNode(graph, "hall_stand_S", 0, y0, 4.8);
    linkNodes(graph, "hall_stand_N", "hallN");
    linkNodes(graph, "hall_stand_S", "hallS");
    sitTargets["hall_stand_N"] = { sit: false, facing: 0 };
    sitTargets["hall_stand_S"] = { sit: false, facing: Math.PI };
    sitTargets["water_cooler"] = { sit: false, facing: -Math.PI / 2 };

    return {
        floorNumber: floorNumber,
        nodes: graph.nodes,
        sitTargets: sitTargets,
        desks: desks,
        office: {
            loungeChairs: ["lounge_spot0", "lounge_spot1", "lounge_spot2"],
            cooler: "water_cooler",
            hallStands: ["hall_stand_N", "hall_stand_S"],
        },
    };
}

function buildLobby(parent, innerWallMat, woodMat, chairMat) {
    const y0 = 0;
    const graph = makeGraph();
    const sitTargets = {};

    addHallRing(graph, y0);

    // Entrance chain: sidewalk -> threshold -> lobby.
    addNode(graph, "outside", 0, y0, 12);
    addNode(graph, "front_door_threshold", 0, y0, 9.35);
    addNode(graph, "entrance", 0, y0, 7.4);
    addNode(graph, "lobby_center", 0, y0, 4.5);
    linkNodes(graph, "outside", "front_door_threshold");
    linkNodes(graph, "front_door_threshold", "entrance");
    linkNodes(graph, "entrance", "lobby_center");
    linkNodes(graph, "lobby_center", "elevWait");

    // Cafe on the left wall.
    addBox(parent, woodMat, 1.3, 1.05, 4.6, -10.2, 0.525, 3);
    addBox(parent, new THREE.MeshStandardMaterial({ color: 0x4c3a26, roughness: 0.6 }),
        1.42, 0.06, 4.8, -10.2, 1.08, 3);
    addBox(parent, new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.4 }),
        0.42, 0.45, 0.36, -10.2, 1.34, 1.7);
    addBox(parent, new THREE.MeshStandardMaterial({ color: 0xd9c9a8, roughness: 0.7 }),
        0.5, 0.3, 0.7, -10.2, 1.26, 4.2);
    addNode(graph, "cafe_order", -9.2, y0, 3);
    sitTargets["cafe_order"] = { sit: false, facing: -Math.PI / 2 };

    // Bistro tables with two chairs each.
    const tables = [[-7.2, 1.5], [-7.2, 4.5], [-4.8, 1.5], [-4.8, 4.5]];
    const bistroChairs = [];
    for (let t = 0; t < tables.length; t += 1) {
        const tx = tables[t][0];
        const tz = tables[t][1];
        buildRoundTable(parent, woodMat, 0.5, tx, y0, tz, 0.72);
        const west = "bistro" + t + "a";
        const east = "bistro" + t + "b";
        buildChair(parent, chairMat, tx - 0.85, y0, tz, Math.PI / 2);
        buildChair(parent, chairMat, tx + 0.85, y0, tz, -Math.PI / 2);
        addNode(graph, west, tx - 0.85, y0, tz);
        addNode(graph, east, tx + 0.85, y0, tz);
        sitTargets[west] = { sit: true, facing: Math.PI / 2 };
        sitTargets[east] = { sit: true, facing: -Math.PI / 2 };
        bistroChairs.push(west, east);
    }
    addNode(graph, "cafe_entry", -4.2, y0, 3.0);
    addNode(graph, "bistro_mid", -6.1, y0, 3.0);
    linkNodes(graph, "lobby_center", "cafe_entry");
    linkNodes(graph, "cafe_entry", "hallW");
    linkNodes(graph, "cafe_entry", "bistro_mid");
    linkNodes(graph, "cafe_order", "bistro_mid");
    linkNodes(graph, "bistro_mid", "bistro0a");
    linkNodes(graph, "bistro_mid", "bistro1a");
    linkNodes(graph, "cafe_entry", "bistro2b");
    linkNodes(graph, "cafe_entry", "bistro3b");
    linkNodes(graph, "bistro_mid", "bistro2a");
    linkNodes(graph, "bistro_mid", "bistro3a");

    // Front lounge (right side): couch against the right wall + armchairs.
    buildSofa(parent, chairMat, 2.2, 10.15, y0, 5, -Math.PI / 2);
    addBox(parent, woodMat, 0.8, 0.42, 1.6, 8.3, 0.21, 5);
    buildChair(parent, chairMat, 8.3, y0, 3.0, 0);
    buildChair(parent, chairMat, 8.3, y0, 7.0, Math.PI);
    addNode(graph, "front_lounge_hub", 8.3, y0, 1.8);
    addNode(graph, "lobby_lounge0", 9.7, y0, 5);
    addNode(graph, "lobby_lounge1", 8.3, y0, 3.0);
    addNode(graph, "lobby_lounge2", 8.3, y0, 7.0);
    linkNodes(graph, "hallE", "front_lounge_hub");
    linkNodes(graph, "front_lounge_hub", "lobby_lounge1");
    linkNodes(graph, "front_lounge_hub", "lobby_lounge0");
    linkNodes(graph, "lobby_lounge0", "lobby_lounge2");
    sitTargets["lobby_lounge0"] = { sit: true, facing: -Math.PI / 2 };
    sitTargets["lobby_lounge1"] = { sit: true, facing: 0 };
    sitTargets["lobby_lounge2"] = { sit: true, facing: Math.PI };

    // Back lounge: two couches facing each other across a coffee table.
    buildSofa(parent, chairMat, 2.2, 6, y0, -7.3, 0);
    buildSofa(parent, chairMat, 2.2, 6, y0, -3.7, Math.PI);
    addBox(parent, woodMat, 1.6, 0.42, 0.8, 6, 0.21, -5.5);
    addNode(graph, "back_lounge_N", 6, y0, -6.85);
    addNode(graph, "back_lounge_S", 6, y0, -4.15);
    addNode(graph, "back_lounge_hub", 7.7, y0, -5.5);
    linkNodes(graph, "hallNE", "back_lounge_S");
    linkNodes(graph, "back_lounge_S", "back_lounge_hub");
    linkNodes(graph, "back_lounge_hub", "back_lounge_N");
    sitTargets["back_lounge_N"] = { sit: true, facing: 0 };
    sitTargets["back_lounge_S"] = { sit: true, facing: Math.PI };

    // Conversation pit (back-left): round table + four armchairs.
    buildRoundTable(parent, woodMat, 0.7, -7, y0, -5.5, 0.72);
    const pitSeats = [
        { name: "pit_N", x: -7, z: -7.2, facing: 0 },
        { name: "pit_S", x: -7, z: -3.8, facing: Math.PI },
        { name: "pit_E", x: -5.3, z: -5.5, facing: -Math.PI / 2 },
        { name: "pit_W", x: -8.7, z: -5.5, facing: Math.PI / 2 },
    ];
    for (let i = 0; i < pitSeats.length; i += 1) {
        const s = pitSeats[i];
        buildChair(parent, chairMat, s.x, y0, s.z, s.facing);
        addNode(graph, s.name, s.x, y0, s.z);
        sitTargets[s.name] = { sit: true, facing: s.facing };
    }
    linkNodes(graph, "hallNW", "pit_E");
    linkNodes(graph, "pit_E", "pit_N");
    linkNodes(graph, "pit_E", "pit_S");
    linkNodes(graph, "pit_N", "pit_W");
    linkNodes(graph, "pit_S", "pit_W");

    // Water coolers.
    buildWaterCooler(parent, 5.4, y0, 8.5);
    buildWaterCooler(parent, 10.4, y0, -8.4);
    addNode(graph, "lobby_wc_front", 4.8, y0, 8.0);
    addNode(graph, "lobby_wc_back", 10.0, y0, -7.8);
    linkNodes(graph, "lobby_stand_entry", "lobby_wc_front");
    linkNodes(graph, "lobby_stand_NE", "lobby_wc_back");
    sitTargets["lobby_wc_front"] = { sit: false, facing: Math.PI / 4 };
    sitTargets["lobby_wc_back"] = { sit: false, facing: -Math.PI / 4 };

    // Reception desk off to the side, plus kiosk near the entrance.
    addBox(parent, woodMat, 2.6, 1.05, 0.9, -3, 0.525, 6.4);
    addNode(graph, "reception", -3, y0, 5.3);
    linkNodes(graph, "lobby_center", "reception");
    sitTargets["reception"] = { sit: false, facing: 0 };

    addBox(parent, new THREE.MeshStandardMaterial({ color: 0x44506a, roughness: 0.6 }),
        0.9, 1.6, 0.35, 2.8, 0.8, 7.95);
    addBox(parent, new THREE.MeshBasicMaterial({ color: 0x88bbff }), 0.7, 0.85, 0.02, 2.8, 0.95, 7.76);
    addNode(graph, "kiosk", 2.2, y0, 7.2);
    linkNodes(graph, "entrance", "kiosk");
    sitTargets["kiosk"] = { sit: false, facing: Math.PI / 2 };

    // Generic loiter waypoints so visitors spread out.
    const loiter = [
        ["lobby_stand_center", 2.4, 4.6, "lobby_center"],
        ["lobby_stand_NE", 6.5, -1.5, "hallE"],
        ["lobby_stand_NW", -6.5, -1.5, "hallW"],
        ["lobby_stand_midE", 8.5, 1.2, "hallE"],
        ["lobby_stand_midW", -3.4, 0.6, "hallW"],
        ["lobby_stand_entry", 1.7, 6.6, "entrance"],
    ];
    const loiterNames = [];
    for (let i = 0; i < loiter.length; i += 1) {
        const row = loiter[i];
        addNode(graph, row[0], row[1], y0, row[2]);
        linkNodes(graph, row[0], row[3]);
        sitTargets[row[0]] = { sit: false, facing: Math.PI };
        loiterNames.push(row[0]);
    }
    linkNodes(graph, "lobby_stand_NE", "hallNE");

    // Plants by the entrance (kept clear of the 3-unit doorway).
    buildPlant(parent, -2.3, y0, 8.6);
    buildPlant(parent, 2.3, y0, 8.6);

    return {
        floorNumber: 0,
        nodes: graph.nodes,
        sitTargets: sitTargets,
        desks: [],
        entranceSpot: new THREE.Vector3(0, 0, 12),
        lobby: {
            bistroChairs: bistroChairs,
            frontLounge: ["lobby_lounge0", "lobby_lounge1", "lobby_lounge2"],
            backLounge: ["back_lounge_N", "back_lounge_S"],
            pit: ["pit_N", "pit_S", "pit_E", "pit_W"],
            coolers: ["lobby_wc_front", "lobby_wc_back"],
            loiter: loiterNames,
            cafeOrder: "cafe_order",
            reception: "reception",
            kiosk: "kiosk",
        },
    };
}

// ---------- building shell ----------

function createWorld(scene) {
    const buildingGroup = new THREE.Group();
    buildingGroup.renderOrder = 0;

    const slabMat = makeTransparentMat(0x8a8f98, 0.3);
    const outerWallMat = makeTransparentMat(0x9999ff, 0.2);
    const innerWallMat = makeTransparentMat(0xbbc5e6, 0.28);
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x9c7a4d, roughness: 0.85 });
    const chairMat = new THREE.MeshStandardMaterial({ color: 0x5a6478, roughness: 0.85 });

    // Ground + sidewalk.
    const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(160, 160),
        new THREE.MeshStandardMaterial({ color: 0x31353d, roughness: 1 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.08;
    buildingGroup.add(ground);
    addBox(buildingGroup, new THREE.MeshStandardMaterial({ color: 0x8f959c, roughness: 1 }),
        14, 0.08, 6.5, 0, -0.03, 12.2);

    // Floor 0 slab (solid) and roof (solid, seen from above).
    addBox(buildingGroup, new THREE.MeshStandardMaterial({ color: 0x6d727b, roughness: 0.95 }),
        WORLD.BUILDING_WIDTH, 0.15, WORLD.BUILDING_DEPTH, 0, -0.075, 0);
    const roof = new THREE.Mesh(
        new THREE.PlaneGeometry(WORLD.BUILDING_WIDTH, WORLD.BUILDING_DEPTH),
        new THREE.MeshStandardMaterial({ color: 0x565b63, roughness: 0.95, side: THREE.FrontSide })
    );
    roof.rotation.x = -Math.PI / 2;
    roof.position.y = TOP_Y + 0.06;
    buildingGroup.add(roof);

    // Intermediate slabs as four strips around the shaft hole.
    for (let f = 1; f < WORLD.FLOOR_COUNT; f += 1) {
        const y = f * WORLD.FLOOR_HEIGHT - 0.075;
        addBox(buildingGroup, slabMat, WORLD.BUILDING_WIDTH, 0.15, HALF_D - SHAFT_HALF, 0, y, (SHAFT_HALF + HALF_D) / 2);
        addBox(buildingGroup, slabMat, WORLD.BUILDING_WIDTH, 0.15, HALF_D - SHAFT_HALF, 0, y, -(SHAFT_HALF + HALF_D) / 2);
        addBox(buildingGroup, slabMat, HALF_W - SHAFT_HALF, 0.15, WORLD.SHAFT_DEPTH, -(SHAFT_HALF + HALF_W) / 2, y, 0);
        addBox(buildingGroup, slabMat, HALF_W - SHAFT_HALF, 0.15, WORLD.SHAFT_DEPTH, (SHAFT_HALF + HALF_W) / 2, y, 0);
    }

    // Outer walls; the front wall leaves a 3-unit entrance gap on floor 0.
    addBox(buildingGroup, outerWallMat, WORLD.BUILDING_WIDTH + 0.24, TOP_Y, 0.12, 0, TOP_Y / 2, -HALF_D);
    addBox(buildingGroup, outerWallMat, 0.12, TOP_Y, WORLD.BUILDING_DEPTH, -HALF_W, TOP_Y / 2, 0);
    addBox(buildingGroup, outerWallMat, 0.12, TOP_Y, WORLD.BUILDING_DEPTH, HALF_W, TOP_Y / 2, 0);
    addBox(buildingGroup, outerWallMat, HALF_W - 1.5, TOP_Y, 0.12, -(1.5 + (HALF_W - 1.5) / 2), TOP_Y / 2, HALF_D);
    addBox(buildingGroup, outerWallMat, HALF_W - 1.5, TOP_Y, 0.12, 1.5 + (HALF_W - 1.5) / 2, TOP_Y / 2, HALF_D);
    addBox(buildingGroup, outerWallMat, 3, TOP_Y - WORLD.FLOOR_HEIGHT, 0.12,
        0, WORLD.FLOOR_HEIGHT + (TOP_Y - WORLD.FLOOR_HEIGHT) / 2, HALF_D);

    // Visual-only glass door panes at the entrance (agents pass through).
    const glassMat = makeTransparentMat(0xaad4ff, 0.16);
    addBox(buildingGroup, glassMat, 0.72, 3.1, 0.05, -1.14, 1.55, HALF_D);
    addBox(buildingGroup, glassMat, 0.72, 3.1, 0.05, 1.14, 1.55, HALF_D);

    // Slim shaft corner posts for readability.
    const postMat = makeTransparentMat(0x55606e, 0.5);
    const postOffsets = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
    for (let i = 0; i < postOffsets.length; i += 1) {
        addBox(buildingGroup, postMat, 0.08, TOP_Y, 0.08,
            postOffsets[i][0] * SHAFT_HALF, TOP_Y / 2, postOffsets[i][1] * SHAFT_HALF);
    }

    // Floors: lobby first, then identical office floors.
    const floors = [];
    const lobbyData = buildLobby(buildingGroup, innerWallMat, woodMat, chairMat);
    floors.push(lobbyData);
    for (let f = 1; f < WORLD.FLOOR_COUNT; f += 1) {
        floors.push(buildOfficeFloor(buildingGroup, f, innerWallMat, woodMat, chairMat));
    }

    // Call panels + shaft indicators on every floor, mounted beside/above the doors.
    for (let f = 0; f < WORLD.FLOOR_COUNT; f += 1) {
        const y0 = f * WORLD.FLOOR_HEIGHT;
        const post = addBox(buildingGroup, new THREE.MeshStandardMaterial({ color: 0x3c424e, roughness: 0.8 }),
            0.1, 2.3, 0.1, 2.1, y0 + 1.15, 1.55);
        post.renderOrder = 0;
        const panel = makeCallPanel();
        panel.position.set(2.1, y0 + 1.55, 1.62);
        buildingGroup.add(panel);
        const shaftIndicator = makeTextIndicator(0.9, 0.9);
        shaftIndicator.position.set(0, y0 + 2.85, 1.62);
        buildingGroup.add(shaftIndicator);
        floors[f].callPanel = panel;
        floors[f].shaftIndicator = shaftIndicator;
    }

    scene.add(buildingGroup);

    return {
        buildingGroup: buildingGroup,
        floors: floors,
        bfsPath: bfsPath,
    };
}

window.WORLD = WORLD;
window.createWorld = createWorld;
window.bfsPath = bfsPath;
window.makeTextIndicator = makeTextIndicator;
window.updateTextTexture = updateTextTexture;
