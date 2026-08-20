// world.js - building geometry, per-floor layouts, furniture, navigation graph, call panels.
// Classic script, no ES modules.

const WORLD = {
    FLOOR_HEIGHT: 3.4, FLOOR_COUNT: 6,
    BUILDING_WIDTH: 22, BUILDING_DEPTH: 18,
    SHAFT_WIDTH: 3, SHAFT_DEPTH: 3,
    PERSON_R: 0.4
};

// ---- Material / mesh helpers -------------------------------------------------------

function transMat(color, opacity) {
    return new THREE.MeshLambertMaterial({
        color: color, transparent: true, opacity: opacity,
        depthWrite: false, side: THREE.DoubleSide
    });
}
function solidMat(color) {
    return new THREE.MeshLambertMaterial({ color: color, side: THREE.DoubleSide });
}
function addBox(parent, w, h, d, x, y, z, color, opacity, useSolid) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), useSolid ? solidMat(color) : transMat(color, opacity));
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
}
function addCyl(parent, r, h, x, y, z, color, opacity, useSolid) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 14), useSolid ? solidMat(color) : transMat(color, opacity));
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
}

// ---- Navigation graph --------------------------------------------------------------

function addNode(nodes, name, x, y, z) {
    nodes[name] = { pos: new THREE.Vector3(x, y, z), links: [] };
    return nodes[name];
}
function link(nodes, a, b) {
    if (!nodes[a] || !nodes[b]) return;
    if (nodes[a].links.indexOf(b) < 0) nodes[a].links.push(b);
    if (nodes[b].links.indexOf(a) < 0) nodes[b].links.push(a);
}

function bfsPath(nodes, fromName, toName) {
    if (!nodes[fromName] || !nodes[toName]) return [];
    if (fromName === toName) return [nodes[fromName].pos];
    const prev = {};
    const visited = {};
    const queue = [fromName];
    visited[fromName] = true;
    while (queue.length) {
        const cur = queue.shift();
        if (cur === toName) break;
        const links = nodes[cur].links;
        for (let i = 0; i < links.length; i++) {
            const nxt = links[i];
            if (!visited[nxt]) { visited[nxt] = true; prev[nxt] = cur; queue.push(nxt); }
        }
    }
    if (!visited[toName]) return [];
    const path = [];
    let cur = toName;
    while (cur !== undefined) {
        path.push(nodes[cur].pos);
        if (cur === fromName) break;
        cur = prev[cur];
    }
    path.reverse();
    return path;
}

// ---- Text / indicator helpers ------------------------------------------------------

function makeArrowShape(dir) {
    const s = new THREE.Shape();
    const hw = 0.13;
    if (dir > 0) { s.moveTo(-hw, -0.16); s.lineTo(hw, -0.16); s.lineTo(0, 0.18); }
    else { s.moveTo(-hw, 0.16); s.lineTo(hw, 0.16); s.lineTo(0, -0.18); }
    s.closePath();
    return new THREE.ShapeGeometry(s);
}

function makeTextPlane(w, h, parent) {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = 4;
    function setIndicator(text) {
        text = String(text == null ? "0" : text);
        if (tex._lastText === text) return;
        tex._lastText = text;
        ctx.clearRect(0, 0, 256, 256);
        ctx.fillStyle = "#050505";
        ctx.fillRect(0, 0, 256, 256);
        const size = text.length <= 1 ? 196 : (text.length === 2 ? 128 : 96);
        ctx.font = "bold " + size + "px monospace";
        ctx.fillStyle = "#ffbb22";
        ctx.shadowColor = "#ffbb22";
        ctx.shadowBlur = 22;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(text, 128, 132);
        tex.needsUpdate = true;
    }
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    if (parent) parent.add(plane);
    return { plane: plane, setIndicator: setIndicator };
}

function makeCallPanel() {
    const group = new THREE.Group();
    addBox(group, 0.55, 1.4, 0.05, 0, 0, 0, 0x2a3444, 0.92, false);
    const offColor = 0x333844;
    const upMat = new THREE.MeshLambertMaterial({ color: offColor, emissive: 0x000000 });
    const downMat = new THREE.MeshLambertMaterial({ color: offColor, emissive: 0x000000 });
    const upMesh = new THREE.Mesh(makeArrowShape(1), upMat);
    upMesh.position.set(0, 0.42, 0.03);
    group.add(upMesh);
    const downMesh = new THREE.Mesh(makeArrowShape(-1), downMat);
    downMesh.position.set(0, -0.42, 0.03);
    group.add(downMesh);
    const disp = makeTextPlane(0.45, 0.45, group);
    disp.plane.position.set(0, -0.02, 0.04);
    group.userData = {
        setUp: function (on) {
            upMat.color.set(on ? 0x0e2a12 : offColor);
            upMat.emissive.set(on ? 0x22ff55 : 0x000000);
        },
        setDown: function (on) {
            downMat.color.set(on ? 0x0e2a12 : offColor);
            downMat.emissive.set(on ? 0x22ff55 : 0x000000);
        },
        setIndicator: function (text) { disp.setIndicator(text); }
    };
    return group;
}

// ---- Furniture helpers (simple primitives) -----------------------------------------

function makeChair(parent, x, y, z, facing, color) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = facing;
    const seatH = 0.42;
    addBox(g, 0.5, 0.1, 0.5, 0, seatH - 0.05, 0, color || 0x5b4a3a, 0.95, true);
    addBox(g, 0.5, 0.6, 0.12, 0, seatH + 0.3, -0.22, color || 0x5b4a3a, 0.95, true); // backrest at -Z
    addCyl(g, 0.05, seatH, 0, seatH / 2, 0, 0x888888, 0.9, true);
    parent.add(g);
    return g;
}
function makeCouch(parent, x, y, z, facing, width) {
    width = width || 2.0;
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = facing;
    addBox(g, width, 0.5, 0.7, 0, 0.25, 0.1, 0x4a5a7a, 0.95, true); // seat
    addBox(g, width, 0.6, 0.2, 0, 0.55, -0.35, 0x4a5a7a, 0.95, true); // backrest at -Z
    addBox(g, 0.2, 0.6, 0.8, -width / 2 + 0.1, 0.35, 0, 0x4a5a7a, 0.95, true);
    addBox(g, 0.2, 0.6, 0.8, width / 2 - 0.1, 0.35, 0, 0x4a5a7a, 0.95, true);
    parent.add(g);
    return g;
}
function makeTable(parent, x, y, z, w, d) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    addBox(g, w, 0.1, d, 0, 0.72, 0, 0x8a6d4a, 0.98, true);
    addBox(g, 0.12, 0.72, 0.12, -w / 2 + 0.12, 0.36, -d / 2 + 0.12, 0x5a4632, 0.98, true);
    addBox(g, 0.12, 0.72, 0.12, w / 2 - 0.12, 0.36, -d / 2 + 0.12, 0x5a4632, 0.98, true);
    addBox(g, 0.12, 0.72, 0.12, -w / 2 + 0.12, 0.36, d / 2 - 0.12, 0x5a4632, 0.98, true);
    addBox(g, 0.12, 0.72, 0.12, w / 2 - 0.12, 0.36, d / 2 - 0.12, 0x5a4632, 0.98, true);
    parent.add(g);
    return g;
}
function makeDesk(parent, x, y, z, w, d) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    addBox(g, w, 0.08, d, 0, 0.72, 0, 0x6b5334, 0.98, true);
    addBox(g, w * 0.9, 0.7, 0.1, 0, 0.36, d / 2 - 0.05, 0x4a3a26, 0.98, true);
    parent.add(g);
    return g;
}
function makeMonitor(parent, x, y, z) {
    addBox(parent, 0.6, 0.4, 0.06, x, y + 1.0, z, 0x222222, 0.98, true);
}
function makeWaterCooler(parent, x, y, z) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    addBox(g, 0.4, 1.0, 0.4, 0, 0.5, 0, 0x8899aa, 0.9, true);
    addCyl(g, 0.16, 0.4, 0, 1.15, 0, 0x5588ff, 0.85, false);
    parent.add(g);
    return g;
}
function makePlant(parent, x, y, z) {
    addCyl(parent, 0.2, 0.3, x, y + 0.15, z, 0x7a4a2a, 0.95, true);
    addCyl(parent, 0.35, 0.7, x, y + 0.7, z, 0x3a7a3a, 0.9, true);
}

// ---- Office floor (floors 1..5) ----------------------------------------------------

function buildOfficeFloor(group, floorNumber, y) {
    const nodes = {};
    const sitTargets = {};
    const desks = ["officeA", "officeB", "officeC", "officeD"];

    // Hallway ring around the shaft.
    addNode(nodes, "elevWait", 0, y, 2.4);
    addNode(nodes, "hallS", 0, y, 4.2);
    addNode(nodes, "hallSE", 4.8, y, 4.2);
    addNode(nodes, "hallE", 6.8, y, 0);
    addNode(nodes, "hallNE", 4.8, y, -4.2);
    addNode(nodes, "hallN", 0, y, -4.2);
    addNode(nodes, "hallNW", -4.8, y, -4.2);
    addNode(nodes, "hallW", -6.8, y, 0);
    addNode(nodes, "hallSW", -4.8, y, 4.2);
    link(nodes, "elevWait", "hallS");
    link(nodes, "hallS", "hallSE");
    link(nodes, "hallSE", "hallE");
    link(nodes, "hallE", "hallNE");
    link(nodes, "hallNE", "hallN");
    link(nodes, "hallN", "hallNW");
    link(nodes, "hallNW", "hallW");
    link(nodes, "hallW", "hallSW");
    link(nodes, "hallSW", "hallS");

    // Hallway loiter spots + water cooler.
    addNode(nodes, "hall_stand_N", 0, y, -3.6);
    addNode(nodes, "hall_stand_S", 0, y, 4.8);
    addNode(nodes, "water_cooler", 10.2, y, 4.2);
    link(nodes, "hall_stand_N", "hallN");
    link(nodes, "hall_stand_S", "hallS");
    link(nodes, "water_cooler", "hallSE");
    makeWaterCooler(group, 10.2, y, 4.2);
    sitTargets["hall_stand_N"] = { sit: false, facing: Math.PI / 2 };
    sitTargets["hall_stand_S"] = { sit: false, facing: -Math.PI / 2 };
    sitTargets["water_cooler"] = { sit: false, facing: -Math.PI / 2 };

    // Four offices along the back wall.
    const officeX = { officeA: -8.25, officeB: -2.75, officeC: 2.75, officeD: 8.25 };
    const officeDoorLink = { officeA: "hallW", officeB: "hallNW", officeC: "hallNE", officeD: "hallE" };
    for (let i = 0; i < desks.length; i++) {
        const id = desks[i];
        const cx = officeX[id];
        // Interior walls: left/right partitions + back segment (part of outer wall).
        addBox(group, 0.12, 2.8, 6, cx - 2.75, y + 1.4, -6, 0xbbc5e6, 0.28, false);
        // Desk + monitor + chair.
        makeDesk(group, cx, y, -7.6, 1.4, 1.2);
        makeMonitor(group, cx, y, -8.0);
        makeChair(group, cx, y, -6.2, Math.PI, 0x5b4a3a);
        // Waypoints.
        addNode(nodes, id + "_door", cx, y, -3.4);
        addNode(nodes, id + "_desk", cx, y, -6.2);
        link(nodes, id + "_door", id + "_desk");
        link(nodes, id + "_door", officeDoorLink[id]);
        sitTargets[id + "_desk"] = { sit: true, facing: Math.PI };
    }

    // Conference room (front-left).
    addNode(nodes, "conf_door", -3.6, y, 5.5);
    addNode(nodes, "conf_center", -7, y, 6);
    addNode(nodes, "conf_seat0", -8.2, y, 7.2);
    addNode(nodes, "conf_seat1", -5.8, y, 7.2);
    addNode(nodes, "conf_seat2", -8.2, y, 4.8);
    addNode(nodes, "conf_seat3", -5.8, y, 4.8);
    link(nodes, "conf_door", "hallSW");
    link(nodes, "conf_door", "conf_center");
    link(nodes, "conf_center", "conf_seat0");
    link(nodes, "conf_center", "conf_seat1");
    link(nodes, "conf_center", "conf_seat2");
    link(nodes, "conf_center", "conf_seat3");
    sitTargets["conf_seat0"] = { sit: true, facing: Math.PI };
    sitTargets["conf_seat1"] = { sit: true, facing: Math.PI };
    sitTargets["conf_seat2"] = { sit: true, facing: 0 };
    sitTargets["conf_seat3"] = { sit: true, facing: 0 };
    makeTable(group, -7, y, 6, 4.4, 1.5);
    makeChair(group, -8.2, y, 7.2, Math.PI, 0x3a4a6a);
    makeChair(group, -5.8, y, 7.2, Math.PI, 0x3a4a6a);
    makeChair(group, -8.2, y, 4.8, 0, 0x3a4a6a);
    makeChair(group, -5.8, y, 4.8, 0, 0x3a4a6a);
    // Conference room walls.
    addBox(group, 0.12, 2.8, 6, -3, y + 1.4, 6, 0xbbc5e6, 0.28, false);
    addBox(group, 8, 2.8, 0.12, -7, y + 1.4, 3, 0xbbc5e6, 0.28, false);

    // Lounge (front-right).
    addNode(nodes, "lounge_door", 3.6, y, 5.5);
    addNode(nodes, "lounge_center", 7, y, 6);
    addNode(nodes, "lounge_spot0", 9, y, 7.6);
    addNode(nodes, "lounge_spot1", 5.5, y, 7.6);
    addNode(nodes, "lounge_spot2", 5.5, y, 4.6);
    link(nodes, "lounge_door", "hallSE");
    link(nodes, "lounge_door", "lounge_center");
    link(nodes, "lounge_center", "lounge_spot0");
    link(nodes, "lounge_center", "lounge_spot1");
    link(nodes, "lounge_center", "lounge_spot2");
    sitTargets["lounge_spot0"] = { sit: true, facing: Math.PI };
    sitTargets["lounge_spot1"] = { sit: true, facing: Math.PI };
    sitTargets["lounge_spot2"] = { sit: true, facing: 0 };
    makeCouch(group, 9, y, 8.2, Math.PI, 2.2);
    makeChair(group, 5.5, y, 7.6, Math.PI, 0x6a4a5a);
    makeChair(group, 5.5, y, 4.6, 0, 0x6a4a5a);
    makeTable(group, 7, y, 6, 1.6, 1.2);
    makePlant(group, 10.6, y, 7.8);
    // Lounge walls.
    addBox(group, 0.12, 2.8, 6, 3, y + 1.4, 6, 0xbbc5e6, 0.28, false);
    addBox(group, 8, 2.8, 0.12, 7, y + 1.4, 3, 0xbbc5e6, 0.28, false);

    // Call panel + shaft indicator (right of shaft, facing +Z).
    const callPanel = makeCallPanel();
    callPanel.position.set(1.6, y + 1.4, 1.0);
    group.add(callPanel);
    const shaftIndicator = makeTextPlane(0.9, 0.9, null);
    shaftIndicator.plane.position.set(0, y + 2.3, 1.55);
    group.add(shaftIndicator.plane);

    const floor = {
        floorNumber: floorNumber, y: y, nodes: nodes, sitTargets: sitTargets,
        callPanel: callPanel, shaftIndicator: shaftIndicator, desks: desks,
        confSeats: ["conf_seat0", "conf_seat1", "conf_seat2", "conf_seat3"],
        loungeSpots: ["lounge_spot0", "lounge_spot1", "lounge_spot2", "water_cooler"],
        hallStand: ["hall_stand_N", "hall_stand_S"]
    };
    return floor;
}

// ---- Lobby (floor 0) ---------------------------------------------------------------

function buildLobby(group, y) {
    const nodes = {};
    const sitTargets = {};

    // Entrance chain.
    addNode(nodes, "outside", 0, y, 12);
    addNode(nodes, "front_door_threshold", 0, y, 9.35);
    addNode(nodes, "entrance", 0, y, 7.4);
    addNode(nodes, "lobby_center", 0, y, 4.6);
    link(nodes, "outside", "front_door_threshold");
    link(nodes, "front_door_threshold", "entrance");
    link(nodes, "entrance", "lobby_center");

    // Hallway ring (same layout as office floors).
    addNode(nodes, "elevWait", 0, y, 2.4);
    addNode(nodes, "hallS", 0, y, 4.2);
    addNode(nodes, "hallSE", 4.8, y, 4.2);
    addNode(nodes, "hallE", 6.8, y, 0);
    addNode(nodes, "hallNE", 4.8, y, -4.2);
    addNode(nodes, "hallN", 0, y, -4.2);
    addNode(nodes, "hallNW", -4.8, y, -4.2);
    addNode(nodes, "hallW", -6.8, y, 0);
    addNode(nodes, "hallSW", -4.8, y, 4.2);
    link(nodes, "elevWait", "hallS");
    link(nodes, "hallS", "hallSE");
    link(nodes, "hallSE", "hallE");
    link(nodes, "hallE", "hallNE");
    link(nodes, "hallNE", "hallN");
    link(nodes, "hallN", "hallNW");
    link(nodes, "hallNW", "hallW");
    link(nodes, "hallW", "hallSW");
    link(nodes, "hallSW", "hallS");
    // Direct links for the entrance -> elevator path (avoid backtracking through hallS).
    link(nodes, "entrance", "elevWait");
    link(nodes, "lobby_center", "elevWait");
    link(nodes, "lobby_center", "hallS");
    link(nodes, "lobby_center", "hallW");
    link(nodes, "lobby_center", "hallE");

    // Cafe (left).
    addNode(nodes, "cafe_door", -5.5, y, 4.5);
    addNode(nodes, "cafe_order", -9.3, y, 3);
    link(nodes, "cafe_door", "hallSW");
    link(nodes, "cafe_door", "cafe_order");
    link(nodes, "lobby_center", "cafe_door");
    sitTargets["cafe_order"] = { sit: false, facing: Math.PI / 2 };
    addCyl(group, 0.25, 1.0, -10, y + 0.5, 3, 0x444444, 0.9, true); // coffee machine
    addBox(group, 1.2, 0.5, 0.6, -10, y + 1.0, 3.2, 0x665544, 0.95, true); // pastry display
    addBox(group, 0.4, 1.1, 5, -10.5, y + 0.55, 3, 0x6a5334, 0.95, true); // counter
    // Bistro tables (4), 2 chairs each.
    const bistro = [
        { t: [-8.5, 1.5], a: [-9.3, 1.5], b: [-7.7, 1.5] },
        { t: [-8.5, 3.5], a: [-9.3, 3.5], b: [-7.7, 3.5] },
        { t: [-6.5, 2.5], a: [-7.3, 2.5], b: [-5.7, 2.5] },
        { t: [-6.5, 4.5], a: [-7.3, 4.5], b: [-5.7, 4.5] }
    ];
    const cafeSpots = ["cafe_order"];
    for (let i = 0; i < bistro.length; i++) {
        const b = bistro[i];
        makeTable(group, b.t[0], y, b.t[1], 0.9, 0.9);
        const na = "b" + i + "c0", nb = "b" + i + "c1";
        addNode(nodes, na, b.a[0], y, b.a[1]);
        addNode(nodes, nb, b.b[0], y, b.b[1]);
        link(nodes, na, "cafe_order");
        link(nodes, nb, "cafe_order");
        sitTargets[na] = { sit: true, facing: (b.a[0] < b.t[0] ? 0 : Math.PI) };
        sitTargets[nb] = { sit: true, facing: (b.b[0] < b.t[0] ? 0 : Math.PI) };
        makeChair(group, b.a[0], y, b.a[1], sitTargets[na].facing, 0x5b4a3a);
        makeChair(group, b.b[0], y, b.b[1], sitTargets[nb].facing, 0x5b4a3a);
        cafeSpots.push(na, nb);
    }

    // Front lounge (right): couch + 2 armchairs.
    addNode(nodes, "fl_center", 7, y, 6);
    addNode(nodes, "fl_spot0", 9, y, 7.6);
    addNode(nodes, "fl_spot1", 5.5, y, 7.6);
    addNode(nodes, "fl_spot2", 5.5, y, 4.6);
    link(nodes, "fl_center", "hallSE");
    link(nodes, "fl_spot0", "fl_center");
    link(nodes, "fl_spot1", "fl_center");
    link(nodes, "fl_spot2", "fl_center");
    link(nodes, "lobby_center", "fl_center");
    sitTargets["fl_spot0"] = { sit: true, facing: Math.PI };
    sitTargets["fl_spot1"] = { sit: true, facing: Math.PI };
    sitTargets["fl_spot2"] = { sit: true, facing: 0 };
    makeCouch(group, 9, y, 8.2, Math.PI, 2.2);
    makeChair(group, 5.5, y, 7.6, Math.PI, 0x6a4a5a);
    makeChair(group, 5.5, y, 4.6, 0, 0x6a4a5a);
    makeTable(group, 7, y, 6, 1.6, 1.2);

    // Back lounge (two couches across a coffee table).
    addNode(nodes, "back_lounge_N", -1.4, y, -7.2);
    addNode(nodes, "back_lounge_S", 1.4, y, -4.8);
    link(nodes, "back_lounge_N", "hallNW");
    link(nodes, "back_lounge_S", "hallN");
    sitTargets["back_lounge_N"] = { sit: true, facing: 0 };
    sitTargets["back_lounge_S"] = { sit: true, facing: Math.PI };
    makeCouch(group, -1.8, y, -7.8, 0, 2.4);
    makeCouch(group, 1.8, y, -4.2, Math.PI, 2.4);
    makeTable(group, 0, y, -6, 1.6, 1.0);

    // Conversation pit (back-left): round table + 4 armchairs.
    addNode(nodes, "pit_N", -7, y, -7.4);
    addNode(nodes, "pit_S", -7, y, -4.6);
    addNode(nodes, "pit_E", -5.6, y, -6);
    addNode(nodes, "pit_W", -8.4, y, -6);
    link(nodes, "pit_N", "hallNW");
    link(nodes, "pit_S", "hallNW");
    link(nodes, "pit_E", "hallW");
    link(nodes, "pit_W", "hallW");
    sitTargets["pit_N"] = { sit: true, facing: 0 };
    sitTargets["pit_S"] = { sit: true, facing: Math.PI };
    sitTargets["pit_E"] = { sit: true, facing: -Math.PI / 2 };
    sitTargets["pit_W"] = { sit: true, facing: Math.PI / 2 };
    addCyl(group, 0.8, 0.72, -7, y + 0.36, -6, 0x8a6d4a, 0.98, true);
    makeChair(group, -7, y, -7.4, 0, 0x4a6a4a);
    makeChair(group, -7, y, -4.6, Math.PI, 0x4a6a4a);
    makeChair(group, -5.6, y, -6, -Math.PI / 2, 0x4a6a4a);
    makeChair(group, -8.4, y, -6, Math.PI / 2, 0x4a6a4a);

    // Water coolers.
    addNode(nodes, "lobby_wc_front", 3.5, y, 2.5);
    addNode(nodes, "lobby_wc_back", -3.5, y, -2.5);
    link(nodes, "lobby_wc_front", "hallSE");
    link(nodes, "lobby_wc_back", "hallNW");
    sitTargets["lobby_wc_front"] = { sit: false, facing: -Math.PI / 2 };
    sitTargets["lobby_wc_back"] = { sit: false, facing: Math.PI / 2 };
    makeWaterCooler(group, 3.5, y, 2.5);
    makeWaterCooler(group, -3.5, y, -2.5);

    // Reception desk + kiosk.
    addNode(nodes, "reception", -3, y, 6);
    link(nodes, "reception", "lobby_center");
    link(nodes, "reception", "entrance");
    sitTargets["reception"] = { sit: false, facing: Math.PI };
    addBox(group, 3, 1.1, 0.6, -3, y + 0.55, 6.3, 0x7a6a4a, 0.95, true);
    addNode(nodes, "kiosk", 2.2, y, 7.2);
    link(nodes, "kiosk", "entrance");
    link(nodes, "kiosk", "lobby_center");
    sitTargets["kiosk"] = { sit: false, facing: Math.PI };
    addCyl(group, 0.2, 1.3, 2.2, y + 0.65, 7.2, 0x334455, 0.9, true);

    // Generic loiter waypoints.
    const stands = {
        lobby_stand_center: [0, 3.5],
        lobby_stand_NE: [6, 5],
        lobby_stand_NW: [-6, 5],
        lobby_stand_midE: [8, 0],
        lobby_stand_midW: [-8, 0],
        lobby_stand_entry: [1.5, 8.5]
    };
    const standSpots = ["reception", "kiosk", "lobby_wc_front", "lobby_wc_back"];
    for (const key in stands) {
        addNode(nodes, key, stands[key][0], y, stands[key][1]);
        link(nodes, key, "lobby_center");
        sitTargets[key] = { sit: false, facing: Math.PI };
        standSpots.push(key);
    }

    // Call panel + shaft indicator.
    const callPanel = makeCallPanel();
    callPanel.position.set(1.6, y + 1.4, 1.0);
    group.add(callPanel);
    const shaftIndicator = makeTextPlane(0.9, 0.9, null);
    shaftIndicator.plane.position.set(0, y + 2.3, 1.55);
    group.add(shaftIndicator.plane);

    const floor = {
        floorNumber: 0, y: y, nodes: nodes, sitTargets: sitTargets,
        callPanel: callPanel, shaftIndicator: shaftIndicator, desks: [],
        entranceSpot: "outside",
        cafeSpots: cafeSpots,
        loungeSpots: ["fl_spot0", "fl_spot1", "fl_spot2", "back_lounge_N", "back_lounge_S",
            "pit_N", "pit_S", "pit_E", "pit_W"],
        standSpots: standSpots,
        confSeats: []
    };
    return floor;
}

// ---- Building shell ----------------------------------------------------------------

function buildShell(group) {
    const FH = WORLD.FLOOR_HEIGHT;
    const FLOOR_COUNT = WORLD.FLOOR_COUNT;
    const BW = WORLD.BUILDING_WIDTH;
    const BD = WORLD.BUILDING_DEPTH;
    const halfW = BW / 2;
    const halfD = BD / 2;
    const SHW = WORLD.SHAFT_WIDTH / 2;
    const SHD = WORLD.SHAFT_DEPTH / 2;
    const totalH = FH * FLOOR_COUNT;

    // Ground slab (floor 0) - four strips around the shaft, solid gray.
    function groundSlab() {
        const t = 0.22;
        const cy = -t / 2;
        addBox(group, BW, t, (halfD - SHD), 0, cy, (-halfD + -SHD) / 2, 0x555a66, 1, true);
        addBox(group, BW, t, (halfD - SHD), 0, cy, (halfD + SHD) / 2, 0x555a66, 1, true);
        addBox(group, (halfW - SHW), t, SHD * 2, (-halfW + -SHW) / 2, cy, 0, 0x555a66, 1, true);
        addBox(group, (halfW - SHW), t, SHD * 2, (halfW + SHW) / 2, cy, 0, 0x555a66, 1, true);
    }
    groundSlab();

    // Intermediate semi-transparent floor slabs (floors 1..FLOOR_COUNT-1).
    for (let f = 1; f < FLOOR_COUNT; f++) {
        const y = f * FH;
        const t = 0.2;
        const cy = y - t / 2;
        addBox(group, BW, t, (halfD - SHD), 0, cy, (-halfD + -SHD) / 2, 0x8890a0, 0.3, false);
        addBox(group, BW, t, (halfD - SHD), 0, cy, (halfD + SHD) / 2, 0x8890a0, 0.3, false);
        addBox(group, (halfW - SHW), t, SHD * 2, (-halfW + -SHW) / 2, cy, 0, 0x8890a0, 0.3, false);
        addBox(group, (halfW - SHW), t, SHD * 2, (halfW + SHW) / 2, cy, 0, 0x8890a0, 0.3, false);
    }

    // Roof (solid gray) at the top.
    addBox(group, BW, 0.25, BD, 0, totalH + 0.12, 0, 0x666a76, 1, true);

    // Outer walls (semi-transparent blue).
    const wallMat = 0x9999ff;
    const wallOp = 0.2;
    const t = 0.2;
    // Back wall (z = -halfD).
    addBox(group, BW, totalH, t, 0, totalH / 2, -halfD, wallMat, wallOp, false);
    // Left / right walls.
    addBox(group, t, totalH, BD, -halfW, totalH / 2, 0, wallMat, wallOp, false);
    addBox(group, t, totalH, BD, halfW, totalH / 2, 0, wallMat, wallOp, false);
    // Front wall (z = +halfD): two full-height side panels + a panel above the entrance gap.
    addBox(group, (halfW - SHW), totalH, t, (-halfW + -SHW) / 2, totalH / 2, halfD, wallMat, wallOp, false);
    addBox(group, (halfW - SHW), totalH, t, (halfW + SHW) / 2, totalH / 2, halfD, wallMat, wallOp, false);
    // Above-the-gap panel covering floors 1..top (entrance gap is floor 0, height FH).
    addBox(group, SHW * 2, (totalH - FH), t, 0, FH + (totalH - FH) / 2, halfD, wallMat, wallOp, false);

    // Glass entrance doors (visual-only, open). Hinged open into the side walls.
    const doorMat = transMat(0xbfe4ff, 0.15);
    const leftDoor = new THREE.Mesh(new THREE.BoxGeometry(1.4, 3.1, 0.06), doorMat);
    leftDoor.position.set(-0.8, 1.55, halfD);
    leftDoor.rotation.y = 1.25;
    group.add(leftDoor);
    const rightDoor = new THREE.Mesh(new THREE.BoxGeometry(1.4, 3.1, 0.06), doorMat);
    rightDoor.position.set(0.8, 1.55, halfD);
    rightDoor.rotation.y = -1.25;
    group.add(rightDoor);
    // Door frame trim.
    addBox(group, 0.15, 3.3, 0.3, -1.55, 1.65, halfD, 0xcccccc, 0.9, true);
    addBox(group, 0.15, 3.3, 0.3, 1.55, 1.65, halfD, 0xcccccc, 0.9, true);

    // Sidewalk slab outside the entrance.
    addBox(group, 8, 0.2, 5, 0, -0.1, halfD + 2.5, 0x9a958a, 1, true);

    // Shaft walls (subtle) to give the elevator column structure.
    const shaftTop = FH * (FLOOR_COUNT - 1);
    const sMat = 0x6070a0;
    addBox(group, SHW * 2, shaftTop, 0.06, 0, shaftTop / 2, -SHD, sMat, 0.12, false);
    addBox(group, SHW * 2, shaftTop, 0.06, 0, shaftTop / 2, SHD, sMat, 0.12, false);
    addBox(group, 0.06, shaftTop, SHD * 2, -SHW, shaftTop / 2, 0, sMat, 0.12, false);
    addBox(group, 0.06, shaftTop, SHD * 2, SHW, shaftTop / 2, 0, sMat, 0.12, false);
}

// ---- Top-level world factory -------------------------------------------------------

function createWorld(scene) {
    const buildingGroup = new THREE.Group();
    scene.add(buildingGroup);

    buildShell(buildingGroup);

    const floors = [];
    // Floor 0 = lobby.
    floors.push(buildLobby(buildingGroup, 0));
    // Floors 1..FLOOR_COUNT-1 = identical office floors.
    for (let f = 1; f < WORLD.FLOOR_COUNT; f++) {
        floors.push(buildOfficeFloor(buildingGroup, f, f * WORLD.FLOOR_HEIGHT));
    }

    // Building render order 0 (elevator car draws at 1).
    buildingGroup.traverse((obj) => {
        if (obj.isMesh) obj.renderOrder = 0;
    });

    return {
        buildingGroup: buildingGroup,
        floors: floors,
        bfsPath: bfsPath
    };
}

window.createWorld = createWorld;
window.WORLD = WORLD;
