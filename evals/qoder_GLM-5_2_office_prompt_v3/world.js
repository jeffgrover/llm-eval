// world.js - building geometry, per-floor layouts, furniture, navigation graph, call panels
// Classic browser script. Exposes createWorld and WORLD on window.

const WORLD = {
    FLOOR_HEIGHT: 3.4, FLOOR_COUNT: 6,
    BUILDING_WIDTH: 22, BUILDING_DEPTH: 18,
    SHAFT_WIDTH: 3, SHAFT_DEPTH: 3,
    PERSON_R: 0.4
};

function wmat(color, opacity) {
    if (opacity == null) opacity = 1;
    const params = { color: color };
    if (opacity < 1) {
        params.transparent = true;
        params.opacity = opacity;
        params.depthWrite = false;
        params.side = THREE.DoubleSide;
    }
    return new THREE.MeshLambertMaterial(params);
}

function wboxM(w, h, d, mat) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.renderOrder = 0;
    return mesh;
}

function makeNodeMap() {
    const nodes = {};
    function add(name, x, y, z) {
        nodes[name] = { name: name, pos: new THREE.Vector3(x, y, z), links: [] };
    }
    function link(a, b) {
        if (nodes[a] && nodes[b] && a !== b) {
            nodes[a].links.push(b);
            nodes[b].links.push(a);
        }
    }
    return { nodes: nodes, add: add, link: link };
}

function bfsPath(nodes, fromName, toName) {
    if (!nodes[fromName] || !nodes[toName]) return [];
    if (fromName === toName) return [nodes[fromName].pos.clone()];
    const prev = {};
    const seen = {};
    seen[fromName] = true;
    const queue = [fromName];
    let found = false;
    while (queue.length) {
        const cur = queue.shift();
        if (cur === toName) { found = true; break; }
        const links = nodes[cur].links;
        for (let i = 0; i < links.length; i += 1) {
            const nb = links[i];
            if (!seen[nb]) { seen[nb] = true; prev[nb] = cur; queue.push(nb); }
        }
    }
    if (!found) return [];
    const path = [];
    let cur = toName;
    while (cur != null) { path.push(nodes[cur].pos.clone()); cur = prev[cur]; }
    path.reverse();
    return path;
}

function wallSegX(group, x1, x2, z, yb, h, mat) {
    const w = Math.abs(x2 - x1);
    const cx = (x1 + x2) / 2;
    const m = wboxM(w, h, 0.12, mat);
    m.position.set(cx, yb + h / 2, z);
    group.add(m);
}
function wallSegZ(group, z1, z2, x, yb, h, mat) {
    const d = Math.abs(z2 - z1);
    const cz = (z1 + z2) / 2;
    const m = wboxM(0.12, h, d, mat);
    m.position.set(x, yb + h / 2, cz);
    group.add(m);
}
function wallXWithGap(group, x1, x2, z, yb, h, mat, gc, gw) {
    if (gc == null) { wallSegX(group, x1, x2, z, yb, h, mat); return; }
    if (x1 < gc - gw / 2) wallSegX(group, x1, gc - gw / 2, z, yb, h, mat);
    if (gc + gw / 2 < x2) wallSegX(group, gc + gw / 2, x2, z, yb, h, mat);
}
function wallZWithGap(group, z1, z2, x, yb, h, mat, gc, gw) {
    if (gc == null) { wallSegZ(group, z1, z2, x, yb, h, mat); return; }
    if (z1 < gc - gw / 2) wallSegZ(group, z1, gc - gw / 2, x, yb, h, mat);
    if (gc + gw / 2 < z2) wallSegZ(group, gc + gw / 2, z2, x, yb, h, mat);
}

function makeDigitTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.anisotropy = 4;
    function draw(text) {
        text = String(text);
        if (tex._lastText === text) return;
        tex._lastText = text;
        ctx.fillStyle = "#050505";
        ctx.fillRect(0, 0, 128, 128);
        ctx.fillStyle = "#ffbb22";
        ctx.shadowColor = "#ffbb22";
        ctx.shadowBlur = 14;
        ctx.font = "bold 92px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(text, 64, 72);
        tex.needsUpdate = true;
    }
    draw("0");
    return { tex: tex, draw: draw };
}

function makePanel(y) {
    const g = new THREE.Group();
    g.position.set(2.0, y + 1.2, 1.55);
    const plate = wboxM(0.55, 1.4, 0.05, wmat(0x3a3a3a, 1));
    g.add(plate);
    const arrowOff = new THREE.MeshBasicMaterial({ color: 0x222222 });
    const arrowOn = new THREE.MeshBasicMaterial({ color: 0x33ff33 });
    const upShape = new THREE.Shape();
    upShape.moveTo(0, 0.13); upShape.lineTo(-0.13, -0.13); upShape.lineTo(0.13, -0.13); upShape.closePath();
    const upArrow = new THREE.Mesh(new THREE.ShapeGeometry(upShape), arrowOff);
    upArrow.position.set(0, 0.45, 0.03);
    g.add(upArrow);
    const downShape = new THREE.Shape();
    downShape.moveTo(0, -0.13); downShape.lineTo(-0.13, 0.13); downShape.lineTo(0.13, 0.13); downShape.closePath();
    const downArrow = new THREE.Mesh(new THREE.ShapeGeometry(downShape), arrowOff);
    downArrow.position.set(0, -0.45, 0.03);
    g.add(downArrow);
    const dt = makeDigitTexture();
    const disp = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.45), new THREE.MeshBasicMaterial({ map: dt.tex }));
    disp.position.set(0, 0, 0.04);
    g.add(disp);
    g.renderOrder = 0;
    g.userData.setUp = function (on) { upArrow.material = on ? arrowOn : arrowOff; };
    g.userData.setDown = function (on) { downArrow.material = on ? arrowOn : arrowOff; };
    g.userData.setIndicator = function (text) { dt.draw(text); };
    return g;
}

function makeIndicator(size) {
    const dt = makeDigitTexture();
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: dt.tex }));
    mesh.renderOrder = 0;
    mesh.userData.setText = function (text) { dt.draw(text); };
    return mesh;
}

function makeChair(color) {
    const g = new THREE.Group();
    const seat = wboxM(0.45, 0.06, 0.45, wmat(color, 1));
    seat.position.y = 0.45; g.add(seat);
    const back = wboxM(0.45, 0.5, 0.06, wmat(color, 1));
    back.position.set(0, 0.7, -0.2); g.add(back);
    const legMat = wmat(0x222222, 1);
    const pos = [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]];
    for (let i = 0; i < pos.length; i += 1) {
        const leg = wboxM(0.06, 0.45, 0.06, legMat);
        leg.position.set(pos[i][0], 0.22, pos[i][1]); g.add(leg);
    }
    return g;
}

function makeDesk(color) {
    const g = new THREE.Group();
    const top = wboxM(1.4, 0.06, 0.7, wmat(color, 1));
    top.position.y = 0.75; g.add(top);
    const legMat = wmat(0x333333, 1);
    const pos = [[-0.6, -0.3], [0.6, -0.3], [-0.6, 0.3], [0.6, 0.3]];
    for (let i = 0; i < pos.length; i += 1) {
        const leg = wboxM(0.06, 0.74, 0.06, legMat);
        leg.position.set(pos[i][0], 0.37, pos[i][1]); g.add(leg);
    }
    const monitor = wboxM(0.5, 0.35, 0.04, wmat(0x111111, 1));
    monitor.position.set(0, 1.0, -0.28); g.add(monitor);
    const screen = wboxM(0.42, 0.28, 0.02, wmat(0x2a4a6a, 1));
    screen.position.set(0, 1.0, -0.26); g.add(screen);
    return g;
}

function buildOfficeGraph(floorNum) {
    const y = floorNum * WORLD.FLOOR_HEIGHT;
    const m = makeNodeMap();
    m.add("hallS", 0, y, 3.2);
    m.add("hallSE", 3.2, y, 3.2);
    m.add("hallE", 3.2, y, 0);
    m.add("hallNE", 3.2, y, -3.2);
    m.add("hallN", 0, y, -3.2);
    m.add("hallNW", -3.2, y, -3.2);
    m.add("hallW", -3.2, y, 0);
    m.add("hallSW", -3.2, y, 3.2);
    m.add("elevWait", 0, y, 2.2);
    m.link("hallS", "hallSE"); m.link("hallSE", "hallE"); m.link("hallE", "hallNE");
    m.link("hallNE", "hallN"); m.link("hallN", "hallNW"); m.link("hallNW", "hallW");
    m.link("hallW", "hallSW"); m.link("hallSW", "hallS"); m.link("elevWait", "hallS");

    const sitTargets = {};
    const desks = [];
    const officeDefs = [
        { id: "A", x: -8 }, { id: "B", x: -3.6 }, { id: "C", x: 3.6 }, { id: "D", x: 8 }
    ];
    for (let i = 0; i < officeDefs.length; i += 1) {
        const d = officeDefs[i];
        const doorName = "office" + d.id + "_door";
        const deskName = "office" + d.id + "_desk";
        m.add(doorName, d.x, y, -3.5);
        m.add(deskName, d.x, y, -6.0);
        m.link(doorName, d.x < 0 ? "hallNW" : "hallNE");
        m.link(doorName, deskName);
        sitTargets[deskName] = { sit: true, facing: Math.PI };
        desks.push(deskName);
    }

    m.add("conf_door", -7, y, 3.5);
    m.add("conf_center", -7, y, 6);
    m.link("conf_door", "hallSW");
    m.link("conf_door", "conf_center");
    m.add("conf_seat0", -8.5, y, 5.2); sitTargets["conf_seat0"] = { sit: true, facing: 0 };
    m.add("conf_seat1", -5.5, y, 5.2); sitTargets["conf_seat1"] = { sit: true, facing: 0 };
    m.add("conf_seat2", -8.5, y, 6.8); sitTargets["conf_seat2"] = { sit: true, facing: Math.PI };
    m.add("conf_seat3", -5.5, y, 6.8); sitTargets["conf_seat3"] = { sit: true, facing: Math.PI };
    m.link("conf_center", "conf_seat0"); m.link("conf_center", "conf_seat1");
    m.link("conf_center", "conf_seat2"); m.link("conf_center", "conf_seat3");

    m.add("lounge_door", 7, y, 3.5);
    m.add("lounge_center", 7, y, 6);
    m.link("lounge_door", "hallSE");
    m.link("lounge_door", "lounge_center");
    m.add("lounge_spot0", 7, y, 8.2); sitTargets["lounge_spot0"] = { sit: true, facing: Math.PI };
    m.add("lounge_spot1", 4.6, y, 6.2); sitTargets["lounge_spot1"] = { sit: true, facing: Math.PI / 2 };
    m.add("lounge_spot2", 9.4, y, 6.2); sitTargets["lounge_spot2"] = { sit: true, facing: -Math.PI / 2 };
    m.add("water_cooler", 10.5, y, 8.5); sitTargets["water_cooler"] = { sit: false, facing: -Math.PI / 2 };
    m.link("lounge_center", "lounge_spot0"); m.link("lounge_center", "lounge_spot1");
    m.link("lounge_center", "lounge_spot2"); m.link("lounge_center", "water_cooler");

    m.add("hall_stand_N", 4.5, y, 0); sitTargets["hall_stand_N"] = { sit: false, facing: 0 };
    m.add("hall_stand_S", -4.5, y, 0); sitTargets["hall_stand_S"] = { sit: false, facing: 0 };
    m.link("hall_stand_N", "hallE"); m.link("hall_stand_S", "hallW");

    return { nodes: m.nodes, sitTargets: sitTargets, desks: desks };
}

function buildLobbyGraph() {
    const y = 0;
    const m = makeNodeMap();
    const sitTargets = {};
    m.add("hallS", 0, y, 3.2);
    m.add("hallSE", 3.2, y, 3.2);
    m.add("hallE", 3.2, y, 0);
    m.add("hallNE", 3.2, y, -3.2);
    m.add("hallN", 0, y, -3.2);
    m.add("hallNW", -3.2, y, -3.2);
    m.add("hallW", -3.2, y, 0);
    m.add("hallSW", -3.2, y, 3.2);
    m.add("elevWait", 0, y, 2.2);
    m.link("hallS", "hallSE"); m.link("hallSE", "hallE"); m.link("hallE", "hallNE");
    m.link("hallNE", "hallN"); m.link("hallN", "hallNW"); m.link("hallNW", "hallW");
    m.link("hallW", "hallSW"); m.link("hallSW", "hallS"); m.link("elevWait", "hallS");

    m.add("outside", 0, y, 12);
    m.add("front_door_threshold", 0, y, 9.35);
    m.add("entrance", 0, y, 7.4);
    m.add("lobby_center", 0, y, 4);
    m.link("outside", "front_door_threshold");
    m.link("front_door_threshold", "entrance");
    m.link("entrance", "lobby_center");
    m.link("lobby_center", "elevWait");
    m.link("lobby_center", "hallS");

    // Cafe (front-left)
    m.add("cafe_center", -7, y, 6);
    m.link("cafe_center", "hallSW");
    m.add("cafe_order", -9, y, 6); sitTargets["cafe_order"] = { sit: false, facing: -Math.PI / 2 };
    m.link("cafe_order", "cafe_center");
    const bistroTables = [
        { id: "0", x: -6, z: 4.2 }, { id: "1", x: -6, z: 7.0 },
        { id: "2", x: -9, z: 4.2 }, { id: "3", x: -9, z: 7.0 }
    ];
    for (let i = 0; i < bistroTables.length; i += 1) {
        const t = bistroTables[i];
        const a = "bistro" + t.id + "a";
        const b = "bistro" + t.id + "b";
        m.add(a, t.x, y, t.z - 0.8); sitTargets[a] = { sit: true, facing: 0 };
        m.add(b, t.x, y, t.z + 0.8); sitTargets[b] = { sit: true, facing: Math.PI };
        m.link(a, "cafe_center"); m.link(b, "cafe_center");
    }

    // Front lounge (front-right)
    m.add("fl_center", 8, y, 6);
    m.link("fl_center", "hallSE");
    m.add("front_lounge0", 8, y, 8.2); sitTargets["front_lounge0"] = { sit: true, facing: Math.PI };
    m.add("front_lounge1", 5.2, y, 6.2); sitTargets["front_lounge1"] = { sit: true, facing: Math.PI / 2 };
    m.add("front_lounge2", 10.5, y, 6.2); sitTargets["front_lounge2"] = { sit: true, facing: -Math.PI / 2 };
    m.link("fl_center", "front_lounge0"); m.link("fl_center", "front_lounge1");
    m.link("fl_center", "front_lounge2");

    // Back lounge (back-center)
    m.add("bl_center", 0, y, -6.5);
    m.link("bl_center", "hallN");
    m.add("back_lounge_N", 0, y, -7.6); sitTargets["back_lounge_N"] = { sit: true, facing: 0 };
    m.add("back_lounge_S", 0, y, -5.4); sitTargets["back_lounge_S"] = { sit: true, facing: Math.PI };
    m.link("bl_center", "back_lounge_N"); m.link("bl_center", "back_lounge_S");

    // Conversation pit (back-left)
    m.add("pit_center", -6, y, -6.5);
    m.link("pit_center", "hallNW");
    m.add("pit_N", -6, y, -7.6); sitTargets["pit_N"] = { sit: true, facing: 0 };
    m.add("pit_S", -6, y, -5.4); sitTargets["pit_S"] = { sit: true, facing: Math.PI };
    m.add("pit_E", -4.9, y, -6.5); sitTargets["pit_E"] = { sit: true, facing: -Math.PI / 2 };
    m.add("pit_W", -7.1, y, -6.5); sitTargets["pit_W"] = { sit: true, facing: Math.PI / 2 };
    m.link("pit_center", "pit_N"); m.link("pit_center", "pit_S");
    m.link("pit_center", "pit_E"); m.link("pit_center", "pit_W");

    // Water coolers
    m.add("lobby_wc_front", 5, y, 2.5); sitTargets["lobby_wc_front"] = { sit: false, facing: Math.PI };
    m.add("lobby_wc_back", -5, y, -2.5); sitTargets["lobby_wc_back"] = { sit: false, facing: 0 };
    m.link("lobby_wc_front", "hallSE"); m.link("lobby_wc_back", "hallSW");

    // Reception + kiosk
    m.add("reception", -3, y, 5); sitTargets["reception"] = { sit: false, facing: Math.PI };
    m.link("reception", "lobby_center");
    m.add("kiosk", 3, y, 7); sitTargets["kiosk"] = { sit: false, facing: Math.PI };
    m.link("kiosk", "lobby_center");

    // Loiter spots
    m.add("lobby_stand_center", 0, y, 1); sitTargets["lobby_stand_center"] = { sit: false, facing: 0 };
    m.add("lobby_stand_NE", 6, y, 1); sitTargets["lobby_stand_NE"] = { sit: false, facing: 0 };
    m.add("lobby_stand_NW", -6, y, 1); sitTargets["lobby_stand_NW"] = { sit: false, facing: 0 };
    m.add("lobby_stand_midE", 6, y, -1); sitTargets["lobby_stand_midE"] = { sit: false, facing: Math.PI };
    m.add("lobby_stand_midW", -6, y, -1); sitTargets["lobby_stand_midW"] = { sit: false, facing: Math.PI };
    m.add("lobby_stand_entry", 2.5, y, 6); sitTargets["lobby_stand_entry"] = { sit: false, facing: Math.PI };
    m.link("lobby_stand_center", "lobby_center");
    m.link("lobby_stand_NE", "hallE");
    m.link("lobby_stand_NW", "hallW");
    m.link("lobby_stand_midE", "hallE");
    m.link("lobby_stand_midW", "hallW");
    m.link("lobby_stand_entry", "entrance");

    return { nodes: m.nodes, sitTargets: sitTargets, desks: [] };
}

function buildOfficeFurniture(group, floorNum) {
    const y = floorNum * WORLD.FLOOR_HEIGHT;
    const innerMat = wmat(0xbbc5e6, 0.28);
    const deskMat = wmat(0x6b4a2b, 1);
    const chairMat = wmat(0x333333, 1);
    const confTableMat = wmat(0x4a3a2a, 1);
    const loungeMat = wmat(0x556677, 1);
    const h = 2.4;

    // Office partitions
    wallZWithGap(group, -9, -3.5, -5.5, y, h, innerMat, null, 0);
    wallZWithGap(group, -9, -3.5, 0, y, h, innerMat, null, 0);
    wallZWithGap(group, -9, -3.5, 5.5, y, h, innerMat, null, 0);
    // Office front walls with door gaps
    wallXWithGap(group, -11, -5.5, -3.5, y, h, innerMat, -8, 1.2);
    wallXWithGap(group, -5.5, 0, -3.5, y, h, innerMat, -3.6, 1.2);
    wallXWithGap(group, 0, 5.5, -3.5, y, h, innerMat, 3.6, 1.2);
    wallXWithGap(group, 5.5, 11, -3.5, y, h, innerMat, 8, 1.2);

    const officeDefs = [{ id: "A", x: -8 }, { id: "B", x: -3.6 }, { id: "C", x: 3.6 }, { id: "D", x: 8 }];
    for (let i = 0; i < officeDefs.length; i += 1) {
        const d = officeDefs[i];
        const desk = makeDesk(0x6b4a2b);
        desk.position.set(d.x, y, -6.8);
        group.add(desk);
        const chair = makeChair(0x333333);
        chair.position.set(d.x, y, -6.0);
        chair.rotation.y = Math.PI;
        group.add(chair);
    }

    // Conference room walls
    wallZWithGap(group, 3, 9, -3, y, h, innerMat, null, 0);
    wallXWithGap(group, -11, -3, 3, y, h, innerMat, -7, 1.2);
    // Conference table + chairs
    const ctable = wboxM(4, 0.06, 1.2, confTableMat);
    ctable.position.set(-7, y + 0.75, 6); group.add(ctable);
    const clegs = [[-1.8, -0.5], [1.8, -0.5], [-1.8, 0.5], [1.8, 0.5]];
    for (let i = 0; i < clegs.length; i += 1) {
        const lg = wboxM(0.08, 0.74, 0.08, wmat(0x222222, 1));
        lg.position.set(-7 + clegs[i][0], y + 0.37, 6 + clegs[i][1]); group.add(lg);
    }
    const confSeats = [[-8.5, 5.2, 0], [-5.5, 5.2, 0], [-8.5, 6.8, Math.PI], [-5.5, 6.8, Math.PI]];
    for (let i = 0; i < confSeats.length; i += 1) {
        const ch = makeChair(0x445566);
        ch.position.set(confSeats[i][0], y, confSeats[i][1]);
        ch.rotation.y = confSeats[i][2];
        group.add(ch);
    }

    // Lounge walls
    wallZWithGap(group, 3, 9, 3, y, h, innerMat, null, 0);
    wallXWithGap(group, 3, 11, 3, y, h, innerMat, 7, 1.2);
    // Couch
    const couch = wboxM(2.2, 0.5, 0.6, loungeMat);
    couch.position.set(7, y + 0.45, 8.2); group.add(couch);
    const couchBack = wboxM(2.2, 0.5, 0.12, loungeMat);
    couchBack.position.set(7, y + 0.75, 8.5); group.add(couchBack);
    // Coffee table
    const ctable2 = wboxM(1.2, 0.4, 0.8, confTableMat);
    ctable2.position.set(7, y + 0.2, 6.2); group.add(ctable2);
    // Armchairs
    const arm1 = makeChair(0x556677); arm1.position.set(4.6, y, 6.2); arm1.rotation.y = Math.PI / 2; group.add(arm1);
    const arm2 = makeChair(0x556677); arm2.position.set(9.4, y, 6.2); arm2.rotation.y = -Math.PI / 2; group.add(arm2);
    // Water cooler
    const wcBody = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.9, 10), wmat(0x88aacc, 1));
    wcBody.position.set(10.5, y + 0.45, 8.5); group.add(wcBody);
    const wcJug = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), wmat(0x224466, 0.6));
    wcJug.position.set(10.5, y + 1.0, 8.5); group.add(wcJug);
}

function buildLobbyFurniture(group) {
    const y = 0;
    const innerMat = wmat(0xbbc5e6, 0.28);
    const cafeMat = wmat(0x7a5a3a, 1);
    const loungeMat = wmat(0x556677, 1);
    const tableMat = wmat(0x4a3a2a, 1);
    const h = 2.4;

    // Cafe counter (left wall, front-left area)
    const counter = wboxM(0.6, 1.0, 4, cafeMat);
    counter.position.set(-10.4, y + 0.5, 6); group.add(counter);
    const counterTop = wboxM(0.7, 0.06, 4.2, wmat(0x222222, 1));
    counterTop.position.set(-10.4, y + 1.0, 6); group.add(counterTop);
    const coffeeMachine = wboxM(0.4, 0.5, 0.4, wmat(0x333333, 1));
    coffeeMachine.position.set(-10.2, y + 1.3, 5); group.add(coffeeMachine);
    const pastry = wboxM(0.4, 0.3, 0.6, wmat(0xaaaaaaaa, 1));
    pastry.position.set(-10.2, y + 1.2, 7); group.add(pastry);
    wallZWithGap(group, 3, 9, -3, y, h, innerMat, null, 0);
    wallXWithGap(group, -11, -3, 3, y, h, innerMat, -7, 1.6);

    // Bistro tables + chairs
    const bistroTables = [{ x: -6, z: 4.2 }, { x: -6, z: 7.0 }, { x: -9, z: 4.2 }, { x: -9, z: 7.0 }];
    for (let i = 0; i < bistroTables.length; i += 1) {
        const t = bistroTables[i];
        const top = wboxM(0.9, 0.06, 0.9, tableMat);
        top.position.set(t.x, y + 0.75, t.z); group.add(top);
        const leg = wboxM(0.08, 0.74, 0.08, wmat(0x222222, 1));
        leg.position.set(t.x, y + 0.37, t.z); group.add(leg);
        const ch1 = makeChair(0x556677); ch1.position.set(t.x, y, t.z - 0.8); group.add(ch1);
        const ch2 = makeChair(0x556677); ch2.position.set(t.x, y, t.z + 0.8); ch2.rotation.y = Math.PI; group.add(ch2);
    }

    // Front lounge (front-right)
    wallZWithGap(group, 3, 9, 3, y, h, innerMat, null, 0);
    wallXWithGap(group, 3, 11, 3, y, h, innerMat, 8, 1.6);
    const couch = wboxM(2.2, 0.5, 0.6, loungeMat);
    couch.position.set(8, y + 0.45, 8.2); group.add(couch);
    const couchBack = wboxM(2.2, 0.5, 0.12, loungeMat);
    couchBack.position.set(8, y + 0.75, 8.5); group.add(couchBack);
    const ctable2 = wboxM(1.2, 0.4, 0.8, tableMat);
    ctable2.position.set(8, y + 0.2, 6.2); group.add(ctable2);
    const arm1 = makeChair(0x556677); arm1.position.set(5.2, y, 6.2); arm1.rotation.y = Math.PI / 2; group.add(arm1);
    const arm2 = makeChair(0x556677); arm2.position.set(10.5, y, 6.2); arm2.rotation.y = -Math.PI / 2; group.add(arm2);

    // Back lounge
    const bcouch1 = wboxM(2.6, 0.5, 0.6, loungeMat);
    bcouch1.position.set(0, y + 0.45, -7.6); group.add(bcouch1);
    const bcouch1Back = wboxM(2.6, 0.5, 0.12, loungeMat);
    bcouch1Back.position.set(0, y + 0.75, -7.9); group.add(bcouch1Back);
    const bcouch2 = wboxM(2.6, 0.5, 0.6, loungeMat);
    bcouch2.position.set(0, y + 0.45, -5.4); group.add(bcouch2);
    const bcouch2Back = wboxM(2.6, 0.5, 0.12, loungeMat);
    bcouch2Back.position.set(0, y + 0.75, -5.1); group.add(bcouch2Back);
    const btable = wboxM(1.2, 0.4, 1.2, tableMat);
    btable.position.set(0, y + 0.2, -6.5); group.add(btable);

    // Conversation pit
    const pitTable = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.08, 16), tableMat);
    pitTable.position.set(-6, y + 0.75, -6.5); group.add(pitTable);
    const pitLeg = wboxM(0.1, 0.74, 0.1, wmat(0x222222, 1));
    pitLeg.position.set(-6, y + 0.37, -6.5); group.add(pitLeg);
    const pitChairs = [[-6, -7.6, 0], [-6, -5.4, Math.PI], [-4.9, -6.5, -Math.PI / 2], [-7.1, -6.5, Math.PI / 2]];
    for (let i = 0; i < pitChairs.length; i += 1) {
        const ch = makeChair(0x664477);
        ch.position.set(pitChairs[i][0], y, pitChairs[i][1]);
        ch.rotation.y = pitChairs[i][2];
        group.add(ch);
    }

    // Water coolers
    const wc1 = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.9, 10), wmat(0x88aacc, 1));
    wc1.position.set(5, y + 0.45, 2.5); group.add(wc1);
    const wc2 = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.9, 10), wmat(0x88aacc, 1));
    wc2.position.set(-5, y + 0.45, -2.5); group.add(wc2);

    // Reception desk
    const rdesk = wboxM(1.6, 1.0, 0.6, cafeMat);
    rdesk.position.set(-3, y + 0.5, 6); group.add(rdesk);
    const rtop = wboxM(1.7, 0.06, 0.7, wmat(0x222222, 1));
    rtop.position.set(-3, y + 1.0, 6); group.add(rtop);

    // Kiosk
    const kiosk = wboxM(0.8, 1.2, 0.8, wmat(0x445566, 1));
    kiosk.position.set(3, y + 0.6, 7); group.add(kiosk);

    // Plants by entrance
    const plantPositions = [[-2.5, 10.5], [2.5, 10.5]];
    for (let i = 0; i < plantPositions.length; i += 1) {
        const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.25, 0.5, 8), wmat(0x6a4a2a, 1));
        pot.position.set(plantPositions[i][0], y + 0.25, plantPositions[i][1]); group.add(pot);
        const foliage = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), wmat(0x3a7a3a, 1));
        foliage.position.set(plantPositions[i][0], y + 0.9, plantPositions[i][1]); group.add(foliage);
    }
}

function createWorld(scene) {
    const buildingGroup = new THREE.Group();
    buildingGroup.renderOrder = 0;
    scene.add(buildingGroup);

    const FH = WORLD.FLOOR_HEIGHT;
    const FC = WORLD.FLOOR_COUNT;
    const totalH = FC * FH;
    const floorMat = wmat(0x888888, 0.3);
    const solidMat = wmat(0x666666, 1);
    const outerMat = wmat(0x9999ff, 0.2);

    // Sidewalk
    const sidewalk = wboxM(8, 0.1, 4, solidMat);
    sidewalk.position.set(0, -0.05, 11); buildingGroup.add(sidewalk);

    // Floor slabs (4 strips around shaft) for each floor
    for (let f = 0; f < FC; f += 1) {
        const y = f * FH;
        const back = wboxM(22, 0.1, 7.5, floorMat);
        back.position.set(0, y - 0.05, -5.25); buildingGroup.add(back);
        const front = wboxM(22, 0.1, 7.5, floorMat);
        front.position.set(0, y - 0.05, 5.25); buildingGroup.add(front);
        const left = wboxM(9.5, 0.1, 3, floorMat);
        left.position.set(-6.25, y - 0.05, 0); buildingGroup.add(left);
        const right = wboxM(9.5, 0.1, 3, floorMat);
        right.position.set(6.25, y - 0.05, 0); buildingGroup.add(right);
    }

    // Roof (solid)
    const roof = wboxM(22, 0.2, 18, solidMat);
    roof.position.set(0, totalH, 0); buildingGroup.add(roof);

    // Outer walls
    const backWall = wboxM(22, totalH, 0.2, outerMat);
    backWall.position.set(0, totalH / 2, -9); buildingGroup.add(backWall);
    const leftWall = wboxM(0.2, totalH, 18, outerMat);
    leftWall.position.set(-11, totalH / 2, 0); buildingGroup.add(leftWall);
    const rightWall = wboxM(0.2, totalH, 18, outerMat);
    rightWall.position.set(11, totalH / 2, 0); buildingGroup.add(rightWall);
    // Front wall: 3 segments (gap on floor 0)
    const frontLeft = wboxM(9.5, totalH, 0.2, outerMat);
    frontLeft.position.set(-6.25, totalH / 2, 9); buildingGroup.add(frontLeft);
    const frontRight = wboxM(9.5, totalH, 0.2, outerMat);
    frontRight.position.set(6.25, totalH / 2, 9); buildingGroup.add(frontRight);
    const frontAbove = wboxM(3, totalH - FH, 0.2, outerMat);
    frontAbove.position.set(0, (totalH + FH) / 2, 9); buildingGroup.add(frontAbove);
    // Glass doors (visual only) in the gap
    const glassDoorMat = wmat(0xaaccff, 0.25);
    const gdoor1 = wboxM(1.4, 2.4, 0.08, glassDoorMat);
    gdoor1.position.set(-0.8, 1.2, 9); buildingGroup.add(gdoor1);
    const gdoor2 = wboxM(1.4, 2.4, 0.08, glassDoorMat);
    gdoor2.position.set(0.8, 1.2, 9); buildingGroup.add(gdoor2);

    // Build per-floor graphs + furniture + panels
    const floors = [];
    for (let f = 0; f < FC; f += 1) {
        const y = f * FH;
        let graph;
        if (f === 0) {
            graph = buildLobbyGraph();
            buildLobbyFurniture(buildingGroup);
        } else {
            graph = buildOfficeGraph(f);
            buildOfficeFurniture(buildingGroup, f);
        }
        const panel = makePanel(y);
        buildingGroup.add(panel);
        const shaftInd = makeIndicator(0.9);
        shaftInd.position.set(0, y + 3.0, 1.52);
        buildingGroup.add(shaftInd);
        floors.push({
            floorNumber: f,
            nodes: graph.nodes,
            sitTargets: graph.sitTargets,
            desks: graph.desks,
            callPanel: panel,
            shaftIndicator: shaftInd
        });
    }

    return { buildingGroup: buildingGroup, floors: floors, bfsPath: bfsPath };
}

window.WORLD = WORLD;
window.createWorld = createWorld;
window.bfsPath = bfsPath;
