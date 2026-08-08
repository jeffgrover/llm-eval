// world.js - building geometry, per-floor layouts, furniture, navigation
// graph, call panels. Classic script: exposes window.WORLD / window.createWorld.

const WORLD = {
    FLOOR_HEIGHT: 3.4,
    FLOOR_COUNT: 6,
    BUILDING_WIDTH: 22,
    BUILDING_DEPTH: 18,
    SHAFT_WIDTH: 3,
    SHAFT_DEPTH: 3,
    PERSON_R: 0.4
};

// ---------------------------------------------------------------------------
// Navigation graph helpers
// ---------------------------------------------------------------------------

function bfsPath(nodes, fromName, toName) {
    if (!nodes[fromName] || !nodes[toName]) return [];
    if (fromName === toName) return [nodes[fromName].pos.clone()];
    const prev = {};
    prev[fromName] = null;
    const queue = [fromName];
    while (queue.length > 0) {
        const cur = queue.shift();
        const links = nodes[cur].links;
        for (let i = 0; i < links.length; i++) {
            const nxt = links[i];
            if (nxt in prev) continue;
            prev[nxt] = cur;
            if (nxt === toName) {
                const path = [];
                let walk = toName;
                while (walk !== null) {
                    path.push(nodes[walk].pos.clone());
                    walk = prev[walk];
                }
                path.reverse();
                return path;
            }
            queue.push(nxt);
        }
    }
    return [];
}

function wldAddNode(nodes, name, x, y, z) {
    nodes[name] = { name: name, pos: new THREE.Vector3(x, y, z), links: [] };
}

function wldLink(nodes, a, b) {
    if (!nodes[a] || !nodes[b]) return;
    if (nodes[a].links.indexOf(b) === -1) nodes[a].links.push(b);
    if (nodes[b].links.indexOf(a) === -1) nodes[b].links.push(a);
}

// ---------------------------------------------------------------------------
// Canvas digit textures (call panels, shaft indicators, in-car indicator)
// ---------------------------------------------------------------------------

function makeDigitTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.anisotropy = 4;
    const entry = { canvas: canvas, ctx: ctx, texture: texture, _lastText: null };
    updateDigitTexture(entry, "0");
    return entry;
}

function updateDigitTexture(entry, text) {
    if (entry._lastText === text) return; // avoid GPU re-upload every frame
    entry._lastText = text;
    const ctx = entry.ctx;
    ctx.fillStyle = "#050505";
    ctx.fillRect(0, 0, 256, 256);
    ctx.font = text.length > 1 ? "bold 150px monospace" : "bold 210px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "#ffbb22";
    ctx.shadowBlur = 24;
    ctx.fillStyle = "#ffbb22";
    ctx.fillText(text, 128, 134);
    ctx.shadowBlur = 0;
    entry.texture.needsUpdate = true;
}

// ---------------------------------------------------------------------------
// Small mesh helpers
// ---------------------------------------------------------------------------

function wldSolidMat(color) {
    return new THREE.MeshLambertMaterial({ color: color });
}

function wldGlassyMat(color, opacity) {
    return new THREE.MeshLambertMaterial({
        color: color,
        transparent: true,
        opacity: opacity,
        depthWrite: false,
        side: THREE.DoubleSide
    });
}

function wldBox(parent, w, h, d, x, y, z, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
}

// ---------------------------------------------------------------------------
// Furniture builders (seat tops at y = 0.25 so the SIT hip-drop lines up)
// ---------------------------------------------------------------------------

function wldChair(parent, x, y, z, rotY, color) {
    const g = new THREE.Group();
    const mat = wldSolidMat(color);
    wldBox(g, 0.42, 0.18, 0.42, 0, 0.09, 0, mat);            // pedestal
    wldBox(g, 0.5, 0.08, 0.5, 0, 0.21, 0, mat);              // seat (top 0.25)
    wldBox(g, 0.5, 0.5, 0.07, 0, 0.5, -0.24, mat);           // backrest (-Z)
    g.position.set(x, y, z);
    g.rotation.y = rotY;
    parent.add(g);
    return g;
}

function wldArmchair(parent, x, y, z, rotY, color) {
    const g = new THREE.Group();
    const mat = wldSolidMat(color);
    wldBox(g, 0.7, 0.25, 0.7, 0, 0.125, 0, mat);             // base (top 0.25)
    wldBox(g, 0.7, 0.5, 0.14, 0, 0.5, -0.3, mat);            // backrest
    wldBox(g, 0.12, 0.32, 0.7, -0.34, 0.38, 0, mat);         // arm L
    wldBox(g, 0.12, 0.32, 0.7, 0.34, 0.38, 0, mat);          // arm R
    g.position.set(x, y, z);
    g.rotation.y = rotY;
    parent.add(g);
    return g;
}

function wldCouch(parent, x, y, z, rotY, color) {
    const g = new THREE.Group();
    const mat = wldSolidMat(color);
    wldBox(g, 2.4, 0.25, 0.95, 0, 0.125, 0, mat);            // base (top 0.25)
    wldBox(g, 2.4, 0.55, 0.18, 0, 0.52, -0.39, mat);         // backrest
    wldBox(g, 0.18, 0.35, 0.95, -1.11, 0.4, 0, mat);         // arm L
    wldBox(g, 0.18, 0.35, 0.95, 1.11, 0.4, 0, mat);          // arm R
    g.position.set(x, y, z);
    g.rotation.y = rotY;
    parent.add(g);
    return g;
}

function wldDesk(parent, x, y, z) {
    const mat = wldSolidMat(0x8a6d4a);
    wldBox(parent, 1.8, 0.06, 0.9, x, y + 0.57, z, mat);     // top at ~0.6
    wldBox(parent, 1.6, 0.5, 0.7, x, y + 0.28, z, wldSolidMat(0x6e563b));
    // Monitor at the back of the desk
    wldBox(parent, 0.55, 0.4, 0.06, x, y + 0.85, z - 0.32, wldSolidMat(0x15181d));
    wldBox(parent, 0.1, 0.2, 0.1, x, y + 0.66, z - 0.32, wldSolidMat(0x2a2e35));
}

function wldTable(parent, x, y, z, w, d, h) {
    const mat = wldSolidMat(0x77644c);
    wldBox(parent, w, 0.06, d, x, y + h, z, mat);
    wldBox(parent, Math.max(0.12, w * 0.2), h, Math.max(0.12, d * 0.2), x, y + h / 2, z, wldSolidMat(0x5d4e3c));
}

function wldBistroTable(parent, x, y, z) {
    const mat = wldSolidMat(0x9a8468);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.06, 16), mat);
    top.position.set(x, y + 0.58, z);
    parent.add(top);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.56, 8), wldSolidMat(0x555d66));
    stem.position.set(x, y + 0.28, z);
    parent.add(stem);
}

function wldCooler(parent, x, y, z) {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.9, 12), wldSolidMat(0xd8dde2));
    body.position.set(x, y + 0.45, z);
    parent.add(body);
    const bottle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.15, 0.15, 0.32, 12),
        wldGlassyMat(0x66bbee, 0.55)
    );
    bottle.position.set(x, y + 1.06, z);
    parent.add(bottle);
}

function wldPlant(parent, x, y, z) {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.34, 10), wldSolidMat(0x9c5a3c));
    pot.position.set(x, y + 0.17, z);
    parent.add(pot);
    const bush = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), wldSolidMat(0x3e7d3a));
    bush.position.set(x, y + 0.75, z);
    parent.add(bush);
}

// ---------------------------------------------------------------------------
// Call panel + shaft indicator
// ---------------------------------------------------------------------------

function wldMakeCallPanel(floorY) {
    const g = new THREE.Group();

    wldBox(g, 0.55, 1.4, 0.05, 0, 0, 0, wldSolidMat(0x22262f));

    const offMat = new THREE.MeshBasicMaterial({ color: 0x3a3f47 });
    const onMat = new THREE.MeshBasicMaterial({ color: 0x33ff77 });

    const upShape = new THREE.Shape();
    upShape.moveTo(-0.13, -0.08);
    upShape.lineTo(0.13, -0.08);
    upShape.lineTo(0, 0.12);
    const upMesh = new THREE.Mesh(new THREE.ShapeGeometry(upShape), offMat);
    upMesh.position.set(0, 0.45, 0.04);
    g.add(upMesh);

    const downShape = new THREE.Shape();
    downShape.moveTo(-0.13, 0.08);
    downShape.lineTo(0.13, 0.08);
    downShape.lineTo(0, -0.12);
    const downMesh = new THREE.Mesh(new THREE.ShapeGeometry(downShape), offMat);
    downMesh.position.set(0, -0.45, 0.04);
    g.add(downMesh);

    const entry = makeDigitTexture();
    const display = new THREE.Mesh(
        new THREE.PlaneGeometry(0.45, 0.45),
        new THREE.MeshBasicMaterial({ map: entry.texture })
    );
    display.position.set(0, 0, 0.04);
    g.add(display);

    g.position.set(2.35, floorY + 1.5, 1.55);
    g.userData.setUp = function (on) { upMesh.material = on ? onMat : offMat; };
    g.userData.setDown = function (on) { downMesh.material = on ? onMat : offMat; };
    g.userData.setIndicator = function (text) { updateDigitTexture(entry, text); };
    return g;
}

function wldMakeShaftIndicator(floorY) {
    const entry = makeDigitTexture();
    const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(0.9, 0.9),
        new THREE.MeshBasicMaterial({ map: entry.texture })
    );
    mesh.position.set(0, floorY + 2.95, 1.56);
    return {
        mesh: mesh,
        setText: function (text) { updateDigitTexture(entry, text); }
    };
}

// ---------------------------------------------------------------------------
// Office floor (floors 1..5, identical)
// ---------------------------------------------------------------------------

function wldBuildOfficeFloor(f, parent) {
    const FH = WORLD.FLOOR_HEIGHT;
    const y = f * FH;
    const innerWallMat = wldGlassyMat(0xbbc5e6, 0.28);

    const nodes = {};
    const sitTargets = {};

    // --- interior walls -------------------------------------------------
    // Partitions between the four back offices (z -9 .. -3)
    [-5.5, 0, 5.5].forEach(function (wx) {
        wldBox(parent, 0.12, FH, 6, wx, y + FH / 2, -6, innerWallMat);
    });
    // Front wall of the office strip with a 1.2 doorway per office
    const cxList = [-8.25, -2.75, 2.75, 8.25];
    const segments = [
        [-11, -8.85], [-7.65, -3.35], [-2.15, 2.15], [3.35, 7.65], [8.85, 11]
    ];
    segments.forEach(function (seg) {
        const w = seg[1] - seg[0];
        wldBox(parent, w, FH, 0.12, (seg[0] + seg[1]) / 2, y + FH / 2, -3, innerWallMat);
    });
    // Conference room walls (front-left), doorway on x = -3 wall
    wldBox(parent, 0.12, FH, 1.2, -3, y + FH / 2, 3.6, innerWallMat);
    wldBox(parent, 0.12, FH, 3.6, -3, y + FH / 2, 7.2, innerWallMat);
    wldBox(parent, 8, FH, 0.12, -7, y + FH / 2, 3, innerWallMat);
    // Lounge walls (front-right), doorway on x = +3 wall
    wldBox(parent, 0.12, FH, 1.2, 3, y + FH / 2, 3.6, innerWallMat);
    wldBox(parent, 0.12, FH, 3.6, 3, y + FH / 2, 7.2, innerWallMat);
    wldBox(parent, 8, FH, 0.12, 7, y + FH / 2, 3, innerWallMat);

    // --- offices ---------------------------------------------------------
    const officeIds = ["A", "B", "C", "D"];
    const desks = [];
    for (let i = 0; i < 4; i++) {
        const id = officeIds[i];
        const cx = cxList[i];
        wldDesk(parent, cx, y, -7.8);
        wldChair(parent, cx, y, -6.7, Math.PI, 0x44506a); // faces the desk (-Z)

        const door = "office" + id + "_door";
        const desk = "office" + id + "_desk";
        const chat = "office" + id + "_chat";
        wldAddNode(nodes, door, cx, y, -2.5);
        wldAddNode(nodes, desk, cx, y, -6.7);
        wldAddNode(nodes, chat, cx + 1.05, y, -2.3);
        sitTargets[desk] = { sit: true, facing: Math.PI };
        sitTargets[chat] = { sit: false, facing: Math.PI };
        desks.push({ id: id, wp: desk, door: door, chat: chat });
    }

    // --- conference room ---------------------------------------------------
    wldTable(parent, -7, y, 6, 3.2, 1.2, 0.6);
    wldChair(parent, -7.9, y, 4.9, 0, 0x66778a);
    wldChair(parent, -6.1, y, 4.9, 0, 0x66778a);
    wldChair(parent, -7.9, y, 7.1, Math.PI, 0x66778a);
    wldChair(parent, -6.1, y, 7.1, Math.PI, 0x66778a);

    wldAddNode(nodes, "conf_door", -2.6, y, 4.8);
    wldAddNode(nodes, "conf_center", -4.0, y, 4.9);
    wldAddNode(nodes, "conf_west", -10.0, y, 4.9);
    wldAddNode(nodes, "conf_north", -8.8, y, 7.9);
    const confSeats = ["conf_seat0", "conf_seat1", "conf_seat2", "conf_seat3"];
    wldAddNode(nodes, "conf_seat0", -7.9, y, 4.9);
    wldAddNode(nodes, "conf_seat1", -6.1, y, 4.9);
    wldAddNode(nodes, "conf_seat2", -7.9, y, 7.1);
    wldAddNode(nodes, "conf_seat3", -6.1, y, 7.1);
    sitTargets.conf_seat0 = { sit: true, facing: 0 };
    sitTargets.conf_seat1 = { sit: true, facing: 0 };
    sitTargets.conf_seat2 = { sit: true, facing: Math.PI };
    sitTargets.conf_seat3 = { sit: true, facing: Math.PI };
    wldLink(nodes, "conf_door", "conf_center");
    wldLink(nodes, "conf_center", "conf_seat0");
    wldLink(nodes, "conf_center", "conf_seat1");
    wldLink(nodes, "conf_center", "conf_west");
    wldLink(nodes, "conf_west", "conf_north");
    wldLink(nodes, "conf_north", "conf_seat2");
    wldLink(nodes, "conf_north", "conf_seat3");

    // --- lounge -----------------------------------------------------------
    wldCouch(parent, 6.8, y, 8.4, Math.PI, 0x7a4d3f);
    wldArmchair(parent, 5.0, y, 6.6, Math.PI / 2, 0x4d6a7a);
    wldArmchair(parent, 9.6, y, 6.6, -Math.PI / 2, 0x4d6a7a);
    wldTable(parent, 7.3, y, 6.6, 1.4, 0.7, 0.32);
    wldCooler(parent, 10.4, y, 3.8);
    wldPlant(parent, 10.4, y, 8.4);

    wldAddNode(nodes, "lounge_door", 2.6, y, 4.8);
    wldAddNode(nodes, "lounge_center", 4.2, y, 4.9);
    wldAddNode(nodes, "lounge_spot0", 6.2, y, 8.05);
    wldAddNode(nodes, "lounge_spot1", 7.4, y, 8.05);
    wldAddNode(nodes, "lounge_spot2", 5.0, y, 6.6);
    wldAddNode(nodes, "water_cooler", 9.7, y, 4.3);
    sitTargets.lounge_spot0 = { sit: true, facing: Math.PI };
    sitTargets.lounge_spot1 = { sit: true, facing: Math.PI };
    sitTargets.lounge_spot2 = { sit: true, facing: Math.PI / 2 };
    sitTargets.water_cooler = { sit: false, facing: -Math.PI / 2 };
    const loungeSpots = ["lounge_spot0", "lounge_spot1", "lounge_spot2"];
    wldLink(nodes, "lounge_door", "lounge_center");
    wldLink(nodes, "lounge_center", "lounge_spot0");
    wldLink(nodes, "lounge_center", "lounge_spot1");
    wldLink(nodes, "lounge_center", "lounge_spot2");
    wldLink(nodes, "lounge_center", "water_cooler");

    // --- hallway ring around the shaft --------------------------------------
    wldAddNode(nodes, "hallS", 0, y, 2.5);
    wldAddNode(nodes, "hallSE", 2.5, y, 2.5);
    wldAddNode(nodes, "hallE", 2.5, y, 0);
    wldAddNode(nodes, "hallNE", 2.5, y, -2.5);
    wldAddNode(nodes, "hallN", 0, y, -2.5);
    wldAddNode(nodes, "hallNW", -2.5, y, -2.5);
    wldAddNode(nodes, "hallW", -2.5, y, 0);
    wldAddNode(nodes, "hallSW", -2.5, y, 2.5);
    wldAddNode(nodes, "elevWait", 0, y, 2.8);
    wldLink(nodes, "hallS", "hallSE");
    wldLink(nodes, "hallSE", "hallE");
    wldLink(nodes, "hallE", "hallNE");
    wldLink(nodes, "hallNE", "hallN");
    wldLink(nodes, "hallN", "hallNW");
    wldLink(nodes, "hallNW", "hallW");
    wldLink(nodes, "hallW", "hallSW");
    wldLink(nodes, "hallSW", "hallS");
    wldLink(nodes, "elevWait", "hallS");

    wldLink(nodes, "officeA_door", "hallNW");
    wldLink(nodes, "officeB_door", "hallNW");
    wldLink(nodes, "officeC_door", "hallNE");
    wldLink(nodes, "officeD_door", "hallNE");
    for (let i = 0; i < 4; i++) {
        const id = officeIds[i];
        wldLink(nodes, "office" + id + "_door", "office" + id + "_desk");
        wldLink(nodes, "office" + id + "_door", "office" + id + "_chat");
    }
    wldLink(nodes, "conf_door", "hallSW");
    wldLink(nodes, "lounge_door", "hallSE");

    // Hallway loiter spots
    wldAddNode(nodes, "hall_stand_N", -1.5, y, -2.9);
    wldAddNode(nodes, "hall_stand_S", 1.7, y, 3.1);
    sitTargets.hall_stand_N = { sit: false, facing: Math.PI };
    sitTargets.hall_stand_S = { sit: false, facing: 0 };
    wldLink(nodes, "hall_stand_N", "hallN");
    wldLink(nodes, "hall_stand_S", "hallS");

    // --- panels --------------------------------------------------------------
    const callPanel = wldMakeCallPanel(y);
    parent.add(callPanel);
    const shaftIndicator = wldMakeShaftIndicator(y);
    parent.add(shaftIndicator.mesh);

    return {
        floorNumber: f,
        nodes: nodes,
        callPanel: callPanel,
        shaftIndicator: shaftIndicator,
        desks: desks,
        sitTargets: sitTargets,
        confSeats: confSeats,
        loungeSpots: loungeSpots
    };
}

// ---------------------------------------------------------------------------
// Ground floor lobby
// ---------------------------------------------------------------------------

function wldBuildLobby(parent) {
    const y = 0;
    const nodes = {};
    const sitTargets = {};

    // --- cafe (left) --------------------------------------------------------
    wldBox(parent, 1.1, 1.0, 4, -10.15, y + 0.5, 1.5, wldSolidMat(0x71563e));
    wldBox(parent, 1.25, 0.07, 4.15, -10.15, y + 1.03, 1.5, wldSolidMat(0x3c3026));
    wldBox(parent, 0.35, 0.45, 0.3, -10.2, y + 1.29, 0.6, wldSolidMat(0x9aa2ab)); // coffee machine
    wldBox(parent, 0.5, 0.3, 0.7, -10.1, y + 1.2, 2.4, wldGlassyMat(0xc9a27a, 0.6)); // pastry display

    const bistroTables = [
        [-8.2, 5.0], [-6.0, 6.3], [-8.8, 7.4], [-5.6, 4.4]
    ];
    const bistroChairs = [];
    bistroTables.forEach(function (t, idx) {
        wldBistroTable(parent, t[0], y, t[1]);
        const nameA = "bistro" + idx + "a";
        const nameB = "bistro" + idx + "b";
        wldChair(parent, t[0] - 0.8, y, t[1], Math.PI / 2, 0x705a44);
        wldChair(parent, t[0] + 0.8, y, t[1], -Math.PI / 2, 0x705a44);
        wldAddNode(nodes, nameA, t[0] - 0.8, y, t[1]);
        wldAddNode(nodes, nameB, t[0] + 0.8, y, t[1]);
        sitTargets[nameA] = { sit: true, facing: Math.PI / 2 };
        sitTargets[nameB] = { sit: true, facing: -Math.PI / 2 };
        bistroChairs.push(nameA, nameB);
    });

    // --- front lounge (right) --------------------------------------------
    wldCouch(parent, 7.0, y, 8.4, Math.PI, 0x446688);
    wldArmchair(parent, 5.0, y, 6.6, Math.PI / 2, 0x446688);
    wldTable(parent, 7.0, y, 6.6, 1.4, 0.7, 0.32);
    const frontLoungeSpots = ["lobby_lounge0", "lobby_lounge1", "lobby_lounge2"];
    wldAddNode(nodes, "lobby_lounge0", 6.4, y, 8.05);
    wldAddNode(nodes, "lobby_lounge1", 7.6, y, 8.05);
    wldAddNode(nodes, "lobby_lounge2", 5.0, y, 6.6);
    sitTargets.lobby_lounge0 = { sit: true, facing: Math.PI };
    sitTargets.lobby_lounge1 = { sit: true, facing: Math.PI };
    sitTargets.lobby_lounge2 = { sit: true, facing: Math.PI / 2 };

    // --- back lounge --------------------------------------------------------
    wldCouch(parent, 5.5, y, -4.9, 0, 0x7a4d3f);            // faces +Z
    wldCouch(parent, 5.5, y, -7.1, Math.PI, 0x7a4d3f);     // faces -Z
    wldTable(parent, 6.2, y, -5.9, 1.6, 0.8, 0.32);
    wldAddNode(nodes, "back_lounge_N", 5.5, y, -4.55);
    wldAddNode(nodes, "back_lounge_S", 5.5, y, -6.75);
    sitTargets.back_lounge_N = { sit: true, facing: 0 };
    sitTargets.back_lounge_S = { sit: true, facing: Math.PI };

    // --- conversation pit (back-left) ---------------------------------------
    const pitTop = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.06, 20), wldSolidMat(0x77644c));
    pitTop.position.set(-6.5, y + 0.55, -5.8);
    parent.add(pitTop);
    const pitStem = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.52, 10), wldSolidMat(0x5d4e3c));
    pitStem.position.set(-6.5, y + 0.26, -5.8);
    parent.add(pitStem);
    wldArmchair(parent, -6.5, y, -7.3, 0, 0x556b4a);
    wldArmchair(parent, -6.5, y, -4.3, Math.PI, 0x556b4a);
    wldArmchair(parent, -5.0, y, -5.8, -Math.PI / 2, 0x556b4a);
    wldArmchair(parent, -8.0, y, -5.8, Math.PI / 2, 0x556b4a);
    const pitSpots = ["pit_N", "pit_S", "pit_E", "pit_W"];
    wldAddNode(nodes, "pit_N", -6.5, y, -7.3);
    wldAddNode(nodes, "pit_S", -6.5, y, -4.3);
    wldAddNode(nodes, "pit_E", -5.0, y, -5.8);
    wldAddNode(nodes, "pit_W", -8.0, y, -5.8);
    sitTargets.pit_N = { sit: true, facing: 0 };
    sitTargets.pit_S = { sit: true, facing: Math.PI };
    sitTargets.pit_E = { sit: true, facing: -Math.PI / 2 };
    sitTargets.pit_W = { sit: true, facing: Math.PI / 2 };

    // --- water coolers, reception, kiosk, plants -----------------------------
    wldCooler(parent, 10.2, y, 3.7);
    wldCooler(parent, -9.9, y, -8.3);
    wldAddNode(nodes, "lobby_wc_front", 9.6, y, 4.1);
    wldAddNode(nodes, "lobby_wc_back", -9.3, y, -7.9);
    sitTargets.lobby_wc_front = { sit: false, facing: -Math.PI / 2 };
    sitTargets.lobby_wc_back = { sit: false, facing: Math.PI / 4 };

    wldBox(parent, 2.2, 1.05, 0.8, -3.2, y + 0.525, 6.4, wldSolidMat(0x8a6d4a));
    wldAddNode(nodes, "reception", -3.2, y, 5.4);
    sitTargets.reception = { sit: false, facing: Math.PI };

    const kiosk = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 1.1, 12), wldSolidMat(0x3d5a80));
    kiosk.position.set(3.2, y + 0.55, 7.8);
    parent.add(kiosk);
    wldAddNode(nodes, "kiosk", 2.5, y, 7.0);
    sitTargets.kiosk = { sit: false, facing: Math.PI / 3 };

    wldPlant(parent, -2.2, y, 8.5);
    wldPlant(parent, 2.2, y, 8.5);
    wldPlant(parent, 9.9, y, 8.5);

    // --- entrance / core path nodes ------------------------------------------
    wldAddNode(nodes, "outside", 0, y, 12);
    wldAddNode(nodes, "front_door_threshold", 0, y, 9.35);
    wldAddNode(nodes, "entrance", 0, y, 7.4);
    wldAddNode(nodes, "lobby_center", 0, y, 4.6);
    wldAddNode(nodes, "elevWait", 0, y, 2.8);
    wldLink(nodes, "outside", "front_door_threshold");
    wldLink(nodes, "front_door_threshold", "entrance");
    wldLink(nodes, "entrance", "lobby_center");
    wldLink(nodes, "lobby_center", "elevWait");
    wldLink(nodes, "entrance", "elevWait");

    // Lobby circulation nodes
    wldAddNode(nodes, "hallSW", -3.5, y, 2.6);
    wldAddNode(nodes, "hallSE", 3.5, y, 2.6);
    wldAddNode(nodes, "hallW", -3.5, y, 0);
    wldAddNode(nodes, "hallE", 3.5, y, 0);
    wldAddNode(nodes, "hallNW", -3.5, y, -2.6);
    wldAddNode(nodes, "hallNE", 3.5, y, -2.6);
    wldAddNode(nodes, "hallN", 0, y, -2.6);
    wldLink(nodes, "elevWait", "hallSW");
    wldLink(nodes, "elevWait", "hallSE");
    wldLink(nodes, "hallSW", "hallW");
    wldLink(nodes, "hallW", "hallNW");
    wldLink(nodes, "hallNW", "hallN");
    wldLink(nodes, "hallN", "hallNE");
    wldLink(nodes, "hallNE", "hallE");
    wldLink(nodes, "hallE", "hallSE");
    wldLink(nodes, "lobby_center", "hallN");
    wldLink(nodes, "lobby_center", "hallSW");
    wldLink(nodes, "lobby_center", "hallSE");

    // Cafe links
    wldAddNode(nodes, "cafe_door", -4.2, y, 3.0);
    wldAddNode(nodes, "cafe_order", -9.0, y, 1.5);
    sitTargets.cafe_order = { sit: false, facing: -Math.PI / 2 };
    wldLink(nodes, "cafe_door", "hallSW");
    wldLink(nodes, "cafe_order", "cafe_door");
    bistroChairs.forEach(function (c) { wldLink(nodes, c, "cafe_door"); });

    // Lounge / back areas links
    frontLoungeSpots.forEach(function (s) { wldLink(nodes, s, "hallSE"); });
    wldLink(nodes, "back_lounge_N", "hallNE");
    wldLink(nodes, "back_lounge_S", "hallNE");
    wldLink(nodes, "pit_S", "hallNW");
    wldLink(nodes, "pit_S", "pit_E");
    wldLink(nodes, "pit_S", "pit_W");
    wldLink(nodes, "pit_E", "pit_N");
    wldLink(nodes, "pit_W", "pit_N");
    wldLink(nodes, "lobby_wc_front", "hallSE");
    wldLink(nodes, "lobby_wc_back", "hallNW");
    wldLink(nodes, "reception", "lobby_center");
    wldLink(nodes, "kiosk", "entrance");

    // Generic loiter waypoints so visitors spread out
    const loiterSpots = [
        "lobby_stand_center", "lobby_stand_NE", "lobby_stand_NW",
        "lobby_stand_midE", "lobby_stand_midW", "lobby_stand_entry"
    ];
    wldAddNode(nodes, "lobby_stand_center", 1.6, y, 4.9);
    wldAddNode(nodes, "lobby_stand_NE", 6.5, y, -1.2);
    wldAddNode(nodes, "lobby_stand_NW", -6.5, y, -1.2);
    wldAddNode(nodes, "lobby_stand_midE", 8.5, y, 1.8);
    wldAddNode(nodes, "lobby_stand_midW", -8.5, y, 1.8);
    wldAddNode(nodes, "lobby_stand_entry", 1.7, y, 7.9);
    loiterSpots.forEach(function (s) { sitTargets[s] = { sit: false, facing: Math.random() * Math.PI * 2 }; });
    wldLink(nodes, "lobby_stand_center", "lobby_center");
    wldLink(nodes, "lobby_stand_NE", "hallNE");
    wldLink(nodes, "lobby_stand_NW", "hallNW");
    wldLink(nodes, "lobby_stand_midE", "hallE");
    wldLink(nodes, "lobby_stand_midW", "hallW");
    wldLink(nodes, "lobby_stand_entry", "entrance");

    // --- panels ---------------------------------------------------------------
    const callPanel = wldMakeCallPanel(y);
    parent.add(callPanel);
    const shaftIndicator = wldMakeShaftIndicator(y);
    parent.add(shaftIndicator.mesh);

    return {
        floorNumber: 0,
        nodes: nodes,
        callPanel: callPanel,
        shaftIndicator: shaftIndicator,
        desks: [],
        sitTargets: sitTargets,
        entranceSpot: nodes.entrance.pos.clone(),
        bistroChairs: bistroChairs,
        frontLoungeSpots: frontLoungeSpots,
        backLoungeSpots: ["back_lounge_N", "back_lounge_S"],
        pitSpots: pitSpots,
        loiterSpots: loiterSpots,
        briefStandSpots: ["cafe_order", "reception", "kiosk", "lobby_wc_front", "lobby_wc_back"]
    };
}

// ---------------------------------------------------------------------------
// Building shell + createWorld
// ---------------------------------------------------------------------------

function createWorld(scene) {
    const FH = WORLD.FLOOR_HEIGHT;
    const FC = WORLD.FLOOR_COUNT;
    const BW = WORLD.BUILDING_WIDTH;
    const BD = WORLD.BUILDING_DEPTH;
    const buildingGroup = new THREE.Group();

    const slabMat = wldGlassyMat(0x99a0aa, 0.3);
    const outerWallMat = wldGlassyMat(0x9999ff, 0.2);
    const shaftMat = wldGlassyMat(0x77808c, 0.15);
    const glassMat = wldGlassyMat(0xaaddff, 0.12);

    // Surrounding ground and sidewalk
    wldBox(buildingGroup, 80, 0.3, 80, 0, -0.17, 0, wldSolidMat(0x2e3438));
    wldBox(buildingGroup, 24, 0.3, 20, 0, -0.15, 0, wldSolidMat(0x565b60));
    wldBox(buildingGroup, 12, 0.28, 6, 0, -0.13, 12, wldSolidMat(0x6b7076));

    // Roof
    wldBox(buildingGroup, BW + 0.6, 0.3, BD + 0.6, 0, FC * FH + 0.15, 0, wldSolidMat(0x4a4f57));

    // Intermediate floor slabs as four strips around the shaft hole
    for (let f = 1; f < FC; f++) {
        const sy = f * FH - 0.1;
        wldBox(buildingGroup, BW, 0.2, 7.5, 0, sy, -5.25, slabMat);
        wldBox(buildingGroup, BW, 0.2, 7.5, 0, sy, 5.25, slabMat);
        wldBox(buildingGroup, 9.5, 0.2, 3, -6.25, sy, 0, slabMat);
        wldBox(buildingGroup, 9.5, 0.2, 3, 6.25, sy, 0, slabMat);
    }

    // Outer walls
    for (let f = 0; f < FC; f++) {
        const wy = f * FH + FH / 2;
        wldBox(buildingGroup, BW, FH, 0.15, 0, wy, -BD / 2, outerWallMat);       // back
        wldBox(buildingGroup, 0.15, FH, BD, -BW / 2, wy, 0, outerWallMat);       // left
        wldBox(buildingGroup, 0.15, FH, BD, BW / 2, wy, 0, outerWallMat);        // right
        if (f === 0) {
            // Front wall with a real 3-unit doorway gap centered on x = 0
            wldBox(buildingGroup, 9.5, FH, 0.15, -6.25, wy, BD / 2, outerWallMat);
            wldBox(buildingGroup, 9.5, FH, 0.15, 6.25, wy, BD / 2, outerWallMat);
            // Visual-only glass doors (agents walk straight through)
            wldBox(buildingGroup, 1.4, 2.4, 0.05, -1.2, 1.2, BD / 2 + 0.03, glassMat);
            wldBox(buildingGroup, 1.4, 2.4, 0.05, 1.2, 1.2, BD / 2 + 0.03, glassMat);
        }
    }
    // Front wall above the entrance gap (floors 1..5)
    wldBox(buildingGroup, BW, (FC - 1) * FH, 0.15, 0, FH + (FC - 1) * FH / 2, BD / 2, outerWallMat);

    // Shaft: back + side walls only, so the car and its doors stay visible
    const shaftH = FC * FH;
    wldBox(buildingGroup, 3, shaftH, 0.1, 0, shaftH / 2, -1.5, shaftMat);
    wldBox(buildingGroup, 0.1, shaftH, 3, -1.5, shaftH / 2, 0, shaftMat);
    wldBox(buildingGroup, 0.1, shaftH, 3, 1.5, shaftH / 2, 0, shaftMat);

    // Door lintels above each floor's shaft opening
    for (let f = 0; f < FC; f++) {
        wldBox(buildingGroup, 3.4, 0.7, 0.12, 0, f * FH + 3.05, 1.52, wldSolidMat(0x5a6068));
    }

    const floors = [];
    floors.push(wldBuildLobby(buildingGroup));
    for (let f = 1; f < FC; f++) {
        floors.push(wldBuildOfficeFloor(f, buildingGroup));
    }

    buildingGroup.traverse(function (obj) {
        if (obj.isMesh) obj.renderOrder = 0;
    });

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
window.makeDigitTexture = makeDigitTexture;
window.updateDigitTexture = updateDigitTexture;
