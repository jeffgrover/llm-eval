// world.js - building geometry, per-floor layouts, furniture, navigation graph, call panels
// Browser global script (no ES modules). +Y up, +Z front (elevator doors face +Z), +X right.
// Floor N walkable surface sits at world y = N * WORLD.FLOOR_HEIGHT.

const WORLD = {
    FLOOR_HEIGHT: 3.4, FLOOR_COUNT: 6,
    BUILDING_WIDTH: 22, BUILDING_DEPTH: 18,
    SHAFT_WIDTH: 3, SHAFT_DEPTH: 3,
    PERSON_R: 0.4
};
window.WORLD = WORLD;

// ---------- shared material / texture helpers ----------

function wldMat(color, opacity) {
    if (opacity === undefined) {
        return new THREE.MeshLambertMaterial({ color: color });
    }
    return new THREE.MeshLambertMaterial({
        color: color, transparent: true, opacity: opacity,
        depthWrite: false, side: THREE.DoubleSide
    });
}

function wldBox(parent, w, h, d, color, x, y, z, opacity) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wldMat(color, opacity));
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
}

function wldCylinder(parent, rTop, rBot, h, color, x, y, z, opacity) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, 12), wldMat(color, opacity));
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
}

// Orange-on-black glow digits. Cache last text on the texture so unchanged
// text never re-uploads the canvas to the GPU.
function wldUpdateTextTexture(tex, text) {
    if (!tex || tex._lastText === text) return;
    tex._lastText = text;
    const cvs = tex.image;
    const ctx = cvs.getContext('2d');
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = '#ffbb22';
    ctx.shadowColor = '#ffbb22';
    ctx.shadowBlur = 26;
    ctx.font = 'bold 210px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 138);
    ctx.shadowBlur = 0;
    tex.needsUpdate = true;
}

function wldMakeDigitTexture(initialText) {
    const cvs = document.createElement('canvas');
    cvs.width = 256;
    cvs.height = 256;
    const tex = new THREE.CanvasTexture(cvs);
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = 4;
    wldUpdateTextTexture(tex, initialText === undefined ? '0' : initialText);
    return tex;
}

function wldMakeIndicatorMesh(size) {
    const tex = wldMakeDigitTexture('0');
    const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(size, size),
        new THREE.MeshBasicMaterial({ map: tex })
    );
    mesh.userData.setIndicator = function (text) { wldUpdateTextTexture(tex, text); };
    return mesh;
}

// ---------- call panel (plate + arrows + floor display), facing +Z ----------

function wldLampOffMat() { return new THREE.MeshBasicMaterial({ color: 0x2a2d33 }); }
function wldLampOnMat() { return new THREE.MeshBasicMaterial({ color: 0x39ff6e }); }

function wldBuildCallPanel(floorY) {
    const group = new THREE.Group();
    group.position.set(1.85, floorY, 1.56);

    // slim mounting column so the panel does not float
    wldBox(group, 0.18, 2.3, 0.18, 0x6a7080, 0, 1.15, -0.12);

    wldBox(group, 0.55, 1.4, 0.06, 0xcfd4dd, 0, 1.15, 0);

    function arrowMesh(cx, cy, pointUp) {
        const shape = new THREE.Shape();
        const hw = 0.13, hh = 0.19;
        if (pointUp) {
            shape.moveTo(cx, cy + hh);
            shape.lineTo(cx - hw, cy - hh * 0.55);
            shape.lineTo(cx + hw, cy - hh * 0.55);
        } else {
            shape.moveTo(cx, cy - hh);
            shape.lineTo(cx - hw, cy + hh * 0.55);
            shape.lineTo(cx + hw, cy + hh * 0.55);
        }
        shape.closePath();
        const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), wldLampOffMat());
        mesh.position.z = 0.04;
        group.add(mesh);
        return mesh;
    }
    const upArrow = arrowMesh(0, 1.72, true);
    const downArrow = arrowMesh(0, 0.62, false);

    const indicator = wldMakeIndicatorMesh(0.45);
    indicator.position.set(0, 1.15, 0.045);
    group.add(indicator);

    const offUp = wldLampOffMat(), onUp = wldLampOnMat();
    const offDown = wldLampOffMat(), onDown = wldLampOnMat();
    group.userData.setUp = function (on) { upArrow.material = on ? onUp : offUp; };
    group.userData.setDown = function (on) { downArrow.material = on ? onDown : offDown; };
    group.userData.setIndicator = function (text) { indicator.userData.setIndicator(text); };
    return group;
}

function wldBuildShaftIndicator(floorY) {
    const mesh = wldMakeIndicatorMesh(0.9);
    mesh.position.set(0, floorY + 2.75, 1.56);
    return mesh;
}

// ---------- navigation graph ----------

function wldNode(name, x, y, z) {
    return { name: name, pos: new THREE.Vector3(x, y, z), links: [] };
}

function wldLinkBoth(a, b) {
    if (a.links.indexOf(b.name) < 0) a.links.push(b.name);
    if (b.links.indexOf(a.name) < 0) b.links.push(a.name);
}

function bfsPath(nodes, fromName, toName) {
    if (!nodes[fromName] || !nodes[toName]) return [];
    if (fromName === toName) return [nodes[toName].pos.clone()];
    const prev = {};
    const seen = {};
    seen[fromName] = true;
    const queue = [fromName];
    let found = false;
    while (queue.length && !found) {
        const cur = queue.shift();
        const links = nodes[cur].links;
        for (let i = 0; i < links.length; i++) {
            const nx = links[i];
            if (seen[nx]) continue;
            seen[nx] = true;
            prev[nx] = cur;
            if (nx === toName) { found = true; break; }
            queue.push(nx);
        }
    }
    if (!found || prev[toName] === undefined) return [];
    const out = [];
    let cur = toName;
    while (cur !== fromName) {
        out.push(nodes[cur].pos.clone());
        cur = prev[cur];
        if (cur === undefined) return [];
    }
    out.push(nodes[fromName].pos.clone());
    out.reverse();
    return out;
}
window.bfsPath = bfsPath;

// ---------- furniture (chairs/couches built facing -Z; backrest on the +Z side) ----------

function wldBuildChair(parent, x, floorY, z, facing) {
    const g = new THREE.Group();
    g.position.set(x, floorY, z);
    g.rotation.y = facing + Math.PI; // furniture rotation = person facing + PI
    wldBox(g, 0.52, 0.07, 0.52, 0x6d5a45, 0, 0.44, 0);
    wldBox(g, 0.52, 0.55, 0.08, 0x5c4a38, 0, 0.75, 0.24);
    wldCylinder(g, 0.035, 0.035, 0.4, 0x3a3a3a, 0, 0.22, 0);
    wldCylinder(g, 0.22, 0.22, 0.05, 0x2e2e2e, 0, 0.025, 0);
    parent.add(g);
    return g;
}

function wldBuildArmchair(parent, x, floorY, z, facing) {
    const g = new THREE.Group();
    g.position.set(x, floorY, z);
    g.rotation.y = facing + Math.PI;
    wldBox(g, 0.95, 0.42, 0.85, 0x7a4e63, 0, 0.21, 0);
    wldBox(g, 0.95, 0.6, 0.2, 0x6a4055, 0, 0.62, 0.33);
    wldBox(g, 0.2, 0.55, 0.85, 0x6a4055, -0.38, 0.45, 0);
    wldBox(g, 0.2, 0.55, 0.85, 0x6a4055, 0.38, 0.45, 0);
    parent.add(g);
    return g;
}

function wldBuildCouch(parent, x, floorY, z, facing) {
    const g = new THREE.Group();
    g.position.set(x, floorY, z);
    g.rotation.y = facing + Math.PI;
    wldBox(g, 2.0, 0.42, 0.85, 0x3f6d8e, 0, 0.21, 0);
    wldBox(g, 2.0, 0.6, 0.22, 0x345c78, 0, 0.65, 0.33);
    wldBox(g, 0.22, 0.58, 0.85, 0x345c78, -0.89, 0.44, 0);
    wldBox(g, 0.22, 0.58, 0.85, 0x345c78, 0.89, 0.44, 0);
    parent.add(g);
    return g;
}

function wldBuildCoffeeTable(parent, x, floorY, z) {
    const g = new THREE.Group();
    g.position.set(x, floorY, z);
    wldBox(g, 1.1, 0.06, 0.55, 0x6d5137, 0, 0.42, 0);
    wldBox(g, 0.9, 0.36, 0.4, 0x54402c, 0, 0.18, 0);
    parent.add(g);
    return g;
}

function wldBuildDesk(parent, x, floorY, z) {
    const g = new THREE.Group();
    g.position.set(x, floorY, z);
    // top + side panels, open front so seated legs tuck slightly underneath
    wldBox(g, 2.2, 0.07, 0.95, 0x8a6f4d, 0, 0.72, 0);
    wldBox(g, 0.07, 0.7, 0.9, 0x6d5738, -1.04, 0.36, 0);
    wldBox(g, 0.07, 0.7, 0.9, 0x6d5738, 1.04, 0.36, 0);
    // monitor at the back of the desk, screen facing +Z (toward the chair)
    wldBox(g, 0.12, 0.18, 0.12, 0x2c2c34, 0, 0.83, -0.3);
    const monitor = wldBox(g, 0.62, 0.4, 0.06, 0x14161c, 0, 1.0, -0.32);
    monitor.rotation.x = -0.08;
    const screen = new THREE.Mesh(
        new THREE.PlaneGeometry(0.56, 0.34),
        new THREE.MeshBasicMaterial({ color: 0x7fd0ff })
    );
    screen.position.set(0, 1.0, -0.285);
    screen.rotation.y = Math.PI;
    g.add(screen);
    parent.add(g);
    return g;
}

function wldBuildBistroTable(parent, x, floorY, z) {
    const g = new THREE.Group();
    g.position.set(x, floorY, z);
    wldCylinder(g, 0.45, 0.45, 0.05, 0x9c7b52, 0, 0.98, 0);
    wldCylinder(g, 0.05, 0.05, 0.95, 0x3c3c42, 0, 0.5, 0);
    wldCylinder(g, 0.25, 0.28, 0.04, 0x3c3c42, 0, 0.02, 0);
    parent.add(g);
    return g;
}

function wldBuildCooler(parent, x, floorY, z) {
    const g = new THREE.Group();
    g.position.set(x, floorY, z);
    wldBox(g, 0.45, 1.1, 0.45, 0xe8e8ee, 0, 0.55, 0);
    wldCylinder(g, 0.22, 0.22, 0.5, 0x9fc8f5, 0, 1.35, 0, 0.55);
    parent.add(g);
    return g;
}

function wldBuildPlant(parent, x, floorY, z) {
    const g = new THREE.Group();
    g.position.set(x, floorY, z);
    wldCylinder(g, 0.28, 0.22, 0.5, 0x8a5a3a, 0, 0.25, 0);
    wldCylinder(g, 0.05, 0.4, 0.85, 0x3f8f4a, 0, 0.95, 0);
    parent.add(g);
    return g;
}

// ---------- office floors (1..5, identical layouts) ----------

const WLD_OFFICE_X = [-8.25, -2.75, 2.75, 8.25];
const WLD_OFFICE_LETTERS = ['A', 'B', 'C', 'D'];

function wldInteriorWall(parent, x1, z1, x2, z2, floorY) {
    const w = Math.max(0.12, Math.abs(x2 - x1));
    const d = Math.max(0.12, Math.abs(z2 - z1));
    wldBox(parent, w, 3.3, d, 0xbbc5e6, (x1 + x2) / 2, floorY + 1.65, (z1 + z2) / 2, 0.28);
}

function wldLinkRing(nodes) {
    wldLinkBoth(nodes.hallS, nodes.hallSE);
    wldLinkBoth(nodes.hallSE, nodes.hallE);
    wldLinkBoth(nodes.hallE, nodes.hallNE);
    wldLinkBoth(nodes.hallNE, nodes.hallN);
    wldLinkBoth(nodes.hallN, nodes.hallNW);
    wldLinkBoth(nodes.hallNW, nodes.hallW);
    wldLinkBoth(nodes.hallW, nodes.hallSW);
    wldLinkBoth(nodes.hallSW, nodes.hallS);
    wldLinkBoth(nodes.hallS, nodes.hallE);
    wldLinkBoth(nodes.hallS, nodes.hallW);
    wldLinkBoth(nodes.hallN, nodes.hallE);
    wldLinkBoth(nodes.hallN, nodes.hallW);
    wldLinkBoth(nodes.elevWait, nodes.hallS);
}

function wldBuildOfficeFloor(buildingGroup, floorNumber, floorY) {
    const group = new THREE.Group();
    buildingGroup.add(group);
    const n = {};
    const sitTargets = {};
    const desks = [];

    // four private offices along the back wall (z in [-9, -3])
    for (let i = 0; i < 4; i++) {
        const x = WLD_OFFICE_X[i];
        const L = WLD_OFFICE_LETTERS[i];
        wldBuildDesk(group, x, floorY, -8.05);
        wldBuildChair(group, x, floorY, -7.25, Math.PI); // faces the desk (-Z)
        desks.push({
            letter: L,
            doorWp: 'office' + L + '_door',
            deskWp: 'office' + L + '_desk'
        });
    }
    wldInteriorWall(group, -5.5, -9, -5.5, -3, floorY);
    wldInteriorWall(group, 0, -9, 0, -3, floorY);
    wldInteriorWall(group, 5.5, -9, 5.5, -3, floorY);
    // office front wall (z = -3) with four 1.2-wide doorway gaps
    wldInteriorWall(group, -11, -3, -8.85, -3, floorY);
    wldInteriorWall(group, -7.65, -3, -3.35, -3, floorY);
    wldInteriorWall(group, -2.15, -3, 2.15, -3, floorY);
    wldInteriorWall(group, 3.35, -3, 7.65, -3, floorY);
    wldInteriorWall(group, 8.85, -3, 11, -3, floorY);

    // conference room (front-left: x [-11,-3], z [3,9])
    wldInteriorWall(group, -11, 3, -4.6, 3, floorY);
    wldInteriorWall(group, -3.4, 3, -3, 3, floorY);
    wldInteriorWall(group, -3, 3, -3, 9, floorY);
    wldBox(group, 3.4, 0.08, 1.5, 0x7c5a3a, -7, floorY + 0.74, 6);
    wldBox(group, 0.5, 0.7, 0.5, 0x5d4429, -7, floorY + 0.37, 6);
    wldBuildChair(group, -7.9, floorY, 4.8, 0);
    wldBuildChair(group, -6.1, floorY, 4.8, 0);
    wldBuildChair(group, -7.9, floorY, 7.2, Math.PI);
    wldBuildChair(group, -6.1, floorY, 7.2, Math.PI);
    wldBox(group, 2.6, 1.2, 0.06, 0xf2f2f2, -7, floorY + 1.8, 8.9);

    // lounge / break area (front-right: x [3,11], z [3,9])
    wldInteriorWall(group, 3, 3, 3.4, 3, floorY);
    wldInteriorWall(group, 4.6, 3, 11, 3, floorY);
    wldInteriorWall(group, 3, 3, 3, 9, floorY);
    wldBuildCouch(group, 9, floorY, 8.15, Math.PI);
    wldBuildCoffeeTable(group, 9, floorY, 6.5);
    wldBuildArmchair(group, 7.55, floorY, 6.15, Math.PI / 2);
    wldBuildArmchair(group, 10.45, floorY, 6.15, -Math.PI / 2);
    wldBuildCooler(group, 10.6, floorY, 3.7);
    wldBuildPlant(group, 3.7, floorY, 8.4);

    // nodes: hallway ring around the shaft
    n.hallS = wldNode('hallS', 0, floorY, 2.9);
    n.hallSE = wldNode('hallSE', 4.2, floorY, 2.9);
    n.hallE = wldNode('hallE', 7.5, floorY, 0);
    n.hallNE = wldNode('hallNE', 4.2, floorY, -2.9);
    n.hallN = wldNode('hallN', 0, floorY, -2.9);
    n.hallNW = wldNode('hallNW', -4.2, floorY, -2.9);
    n.hallW = wldNode('hallW', -7.5, floorY, 0);
    n.hallSW = wldNode('hallSW', -4.2, floorY, 2.9);
    n.elevWait = wldNode('elevWait', 0, floorY, 2.2);
    wldLinkRing(n);

    // offices
    for (let i = 0; i < 4; i++) {
        const L = WLD_OFFICE_LETTERS[i];
        const x = WLD_OFFICE_X[i];
        const apr = wldNode('office' + L + '_apr', x, floorY, -2.5);
        const door = wldNode('office' + L + '_door', x, floorY, -3.8);
        const desk = wldNode('office' + L + '_desk', x, floorY, -7.25);
        n[apr.name] = apr;
        n[door.name] = door;
        n[desk.name] = desk;
        if (i === 0) { wldLinkBoth(apr, n.hallW); wldLinkBoth(apr, n.hallNW); }
        if (i === 1) { wldLinkBoth(apr, n.hallN); wldLinkBoth(apr, n.hallNW); }
        if (i === 2) { wldLinkBoth(apr, n.hallN); wldLinkBoth(apr, n.hallNE); }
        if (i === 3) { wldLinkBoth(apr, n.hallE); wldLinkBoth(apr, n.hallNE); }
        wldLinkBoth(apr, door);
        wldLinkBoth(door, desk);
    }

    // conference
    n.conf_door = wldNode('conf_door', -4, floorY, 3.8);
    n.conf_center = wldNode('conf_center', -7, floorY, 4.2);
    n.conf_seat0 = wldNode('conf_seat0', -7.9, floorY, 4.8);
    n.conf_seat1 = wldNode('conf_seat1', -6.1, floorY, 4.8);
    n.conf_seat2 = wldNode('conf_seat2', -7.9, floorY, 7.2);
    n.conf_seat3 = wldNode('conf_seat3', -6.1, floorY, 7.2);
    wldLinkBoth(n.hallSW, n.conf_door);
    wldLinkBoth(n.conf_door, n.conf_center);
    wldLinkBoth(n.conf_center, n.conf_seat0);
    wldLinkBoth(n.conf_center, n.conf_seat1);
    wldLinkBoth(n.conf_center, n.conf_seat2);
    wldLinkBoth(n.conf_center, n.conf_seat3);

    // lounge
    n.lounge_door = wldNode('lounge_door', 4, floorY, 3.8);
    n.lounge_center = wldNode('lounge_center', 7, floorY, 5.0);
    n.lounge_spot0 = wldNode('lounge_spot0', 9, floorY, 8.1);
    n.lounge_spot1 = wldNode('lounge_spot1', 7.55, floorY, 6.15);
    n.lounge_spot2 = wldNode('lounge_spot2', 10.45, floorY, 6.15);
    n.water_cooler = wldNode('water_cooler', 9.8, floorY, 3.7);
    wldLinkBoth(n.hallSE, n.lounge_door);
    wldLinkBoth(n.lounge_door, n.lounge_center);
    wldLinkBoth(n.lounge_center, n.lounge_spot0);
    wldLinkBoth(n.lounge_center, n.lounge_spot1);
    wldLinkBoth(n.lounge_center, n.lounge_spot2);
    wldLinkBoth(n.lounge_center, n.water_cooler);
    wldLinkBoth(n.hallSE, n.water_cooler);

    // hallway loiter spots
    n.hall_stand_N = wldNode('hall_stand_N', -2.8, floorY, -2.3);
    n.hall_stand_S = wldNode('hall_stand_S', 2.8, floorY, 2.3);
    wldLinkBoth(n.hallN, n.hall_stand_N);
    wldLinkBoth(n.hallNW, n.hall_stand_N);
    wldLinkBoth(n.hallS, n.hall_stand_S);
    wldLinkBoth(n.hallSE, n.hall_stand_S);

    // sitTargets
    for (let i = 0; i < 4; i++) {
        const L = WLD_OFFICE_LETTERS[i];
        sitTargets['office' + L + '_desk'] = { sit: true, facing: Math.PI };
        sitTargets['office' + L + '_door'] = { sit: false, facing: Math.PI };
    }
    sitTargets.conf_seat0 = { sit: true, facing: 0 };
    sitTargets.conf_seat1 = { sit: true, facing: 0 };
    sitTargets.conf_seat2 = { sit: true, facing: Math.PI };
    sitTargets.conf_seat3 = { sit: true, facing: Math.PI };
    sitTargets.lounge_spot0 = { sit: true, facing: Math.PI };
    sitTargets.lounge_spot1 = { sit: true, facing: Math.PI / 2 };
    sitTargets.lounge_spot2 = { sit: true, facing: -Math.PI / 2 };
    sitTargets.water_cooler = { sit: false, facing: Math.PI / 2 };
    sitTargets.hall_stand_N = { sit: false, facing: null };
    sitTargets.hall_stand_S = { sit: false, facing: null };
    sitTargets.elevWait = { sit: false, facing: null };

    const callPanel = wldBuildCallPanel(floorY);
    group.add(callPanel);
    const shaftIndicator = wldBuildShaftIndicator(floorY);
    group.add(shaftIndicator);

    return {
        floorNumber: floorNumber,
        floorY: floorY,
        nodes: n,
        callPanel: callPanel,
        shaftIndicator: shaftIndicator,
        desks: desks,
        sitTargets: sitTargets
    };
}

// ---------- ground-floor lobby ----------

function wldBuildLobbyFloor(buildingGroup, floorNumber, floorY) {
    const group = new THREE.Group();
    buildingGroup.add(group);
    const n = {};
    const sitTargets = {};

    // cafe along the left wall
    wldBox(group, 0.9, 1.0, 4.0, 0x8a5a3a, -10.35, floorY + 0.5, 0);
    wldBox(group, 1.0, 0.06, 4.2, 0x4d3d2c, -10.35, floorY + 1.04, 0);
    wldBox(group, 0.5, 0.55, 0.45, 0x22252c, -10.4, floorY + 1.35, -1.2);
    wldBox(group, 0.8, 0.45, 0.9, 0xbfd7ff, -10.4, floorY + 1.32, 1.1, 0.45);
    const bistroT = [[-8.4, -3.4], [-8.4, -0.6], [-8.4, 2.4], [-6.2, 0.6]];
    for (let i = 0; i < bistroT.length; i++) {
        wldBuildBistroTable(group, bistroT[i][0], floorY, bistroT[i][1]);
        wldBuildChair(group, bistroT[i][0], floorY, bistroT[i][1] - 1.1, 0);
        wldBuildChair(group, bistroT[i][0], floorY, bistroT[i][1] + 1.1, Math.PI);
    }

    // front lounge (right side)
    wldBuildCouch(group, 9, floorY, 8.15, Math.PI);
    wldBuildCoffeeTable(group, 9, floorY, 6.5);
    wldBuildArmchair(group, 7.55, floorY, 6.15, Math.PI / 2);
    wldBuildArmchair(group, 10.45, floorY, 6.15, -Math.PI / 2);

    // back lounge: two couches facing each other across a coffee table
    wldBuildCouch(group, 2.5, floorY, -4.35, Math.PI);
    wldBuildCouch(group, 2.5, floorY, -6.65, 0);
    wldBuildCoffeeTable(group, 2.5, floorY, -5.5);

    // conversation pit: round table + four armchairs
    wldCylinder(group, 0.8, 0.8, 0.06, 0x7c5a3a, -7.5, floorY + 0.74, -5.5);
    wldCylinder(group, 0.3, 0.3, 0.7, 0x5d4429, -7.5, floorY + 0.36, -5.5);
    wldBuildArmchair(group, -7.5, floorY, -6.85, 0);
    wldBuildArmchair(group, -7.5, floorY, -4.15, Math.PI);
    wldBuildArmchair(group, -8.85, floorY, -5.5, Math.PI / 2);
    wldBuildArmchair(group, -6.15, floorY, -5.5, -Math.PI / 2);

    // water coolers, reception, kiosk, plants
    wldBuildCooler(group, 5.4, floorY, 4.5);
    wldBuildCooler(group, -4.5, floorY, -8.3);
    wldBox(group, 2.4, 1.05, 0.7, 0x9c7b52, -4.3, floorY + 0.52, 6.0);
    wldBox(group, 2.5, 0.06, 0.8, 0x6d5738, -4.3, floorY + 1.08, 6.0);
    wldBox(group, 0.55, 1.3, 0.45, 0x44506a, 2.4, floorY + 0.65, 7.7);
    wldBox(group, 0.45, 0.35, 0.05, 0x7fd0ff, 2.4, floorY + 1.15, 7.45);
    wldBuildPlant(group, -2.5, floorY, 8.3);
    wldBuildPlant(group, 2.5, floorY, 8.3);

    // glass entrance doors, swung open against the outside wall (visual only;
    // the physical 3-wide doorway gap is in the outer wall itself)
    const doorL = wldBox(group, 1.35, 3.0, 0.06, 0xaad4ff, -2.0, floorY + 1.5, 9.75, 0.25);
    doorL.rotation.y = 0.9;
    const doorR = wldBox(group, 1.35, 3.0, 0.06, 0xaad4ff, 2.0, floorY + 1.5, 9.75, 0.25);
    doorR.rotation.y = -0.9;

    // nodes: entrance chain
    n.outside = wldNode('outside', 0, floorY, 12);
    n.front_door_threshold = wldNode('front_door_threshold', 0, floorY, 9.35);
    n.entrance = wldNode('entrance', 0, floorY, 7.4);
    n.lobby_center = wldNode('lobby_center', 0, floorY, 4.6);
    wldLinkBoth(n.outside, n.front_door_threshold);
    wldLinkBoth(n.front_door_threshold, n.entrance);
    wldLinkBoth(n.entrance, n.lobby_center);

    // hallway ring
    n.hallS = wldNode('hallS', 0, floorY, 2.9);
    n.hallSE = wldNode('hallSE', 4.2, floorY, 2.9);
    n.hallE = wldNode('hallE', 7.5, floorY, 0);
    n.hallNE = wldNode('hallNE', 4.2, floorY, -2.9);
    n.hallN = wldNode('hallN', 0, floorY, -2.9);
    n.hallNW = wldNode('hallNW', -4.2, floorY, -2.9);
    n.hallW = wldNode('hallW', -7.5, floorY, 0);
    n.hallSW = wldNode('hallSW', -4.2, floorY, 2.9);
    n.elevWait = wldNode('elevWait', 0, floorY, 2.2);
    wldLinkRing(n);
    wldLinkBoth(n.lobby_center, n.elevWait);
    wldLinkBoth(n.lobby_center, n.hallS);

    // cafe nodes
    for (let i = 0; i < 4; i++) {
        n['cafe_t' + i] = wldNode('cafe_t' + i, bistroT[i][0], floorY, bistroT[i][1]);
        n['bistro' + i + '_S'] = wldNode('bistro' + i + '_S', bistroT[i][0], floorY, bistroT[i][1] - 1.1);
        n['bistro' + i + '_N'] = wldNode('bistro' + i + '_N', bistroT[i][0], floorY, bistroT[i][1] + 1.1);
    }
    n.cafe_door = wldNode('cafe_door', -6.9, floorY, 0.3);
    n.cafe_order = wldNode('cafe_order', -9.3, floorY, 0);
    wldLinkBoth(n.hallSW, n.cafe_door);
    wldLinkBoth(n.hallW, n.cafe_door);
    wldLinkBoth(n.cafe_door, n.cafe_t0);
    wldLinkBoth(n.cafe_door, n.cafe_t1);
    wldLinkBoth(n.cafe_door, n.cafe_t2);
    wldLinkBoth(n.cafe_door, n.cafe_t3);
    wldLinkBoth(n.cafe_order, n.cafe_door);
    wldLinkBoth(n.cafe_order, n.cafe_t1);
    for (let i = 0; i < 4; i++) {
        wldLinkBoth(n['cafe_t' + i], n['bistro' + i + '_S']);
        wldLinkBoth(n['cafe_t' + i], n['bistro' + i + '_N']);
    }

    // front lounge nodes
    n.lounge_center = wldNode('lounge_center', 8.2, floorY, 5.6);
    n.lounge_spot0 = wldNode('lounge_spot0', 9, floorY, 8.1);
    n.lounge_spot1 = wldNode('lounge_spot1', 7.55, floorY, 6.15);
    n.lounge_spot2 = wldNode('lounge_spot2', 10.45, floorY, 6.15);
    wldLinkBoth(n.hallSE, n.lounge_center);
    wldLinkBoth(n.hallE, n.lounge_center);
    wldLinkBoth(n.lounge_center, n.lounge_spot0);
    wldLinkBoth(n.lounge_center, n.lounge_spot1);
    wldLinkBoth(n.lounge_center, n.lounge_spot2);

    // back lounge + pit nodes
    n.back_lounge_S = wldNode('back_lounge_S', 2.5, floorY, -4.35);
    n.back_lounge_N = wldNode('back_lounge_N', 2.5, floorY, -6.65);
    n.pit_center = wldNode('pit_center', -7.5, floorY, -3.6);
    n.pit_N = wldNode('pit_N', -7.5, floorY, -6.85);
    n.pit_S = wldNode('pit_S', -7.5, floorY, -4.15);
    n.pit_W = wldNode('pit_W', -8.85, floorY, -5.5);
    n.pit_E = wldNode('pit_E', -6.15, floorY, -5.5);
    wldLinkBoth(n.hallNE, n.back_lounge_S);
    wldLinkBoth(n.hallN, n.back_lounge_N);
    wldLinkBoth(n.back_lounge_S, n.back_lounge_N);
    wldLinkBoth(n.hallNW, n.pit_center);
    wldLinkBoth(n.hallW, n.pit_center);
    wldLinkBoth(n.pit_center, n.pit_S);
    wldLinkBoth(n.pit_center, n.pit_W);
    wldLinkBoth(n.pit_center, n.pit_E);
    wldLinkBoth(n.pit_W, n.pit_N);
    wldLinkBoth(n.pit_E, n.pit_N);

    // water coolers / reception / kiosk / loiter stands
    n.lobby_wc_front = wldNode('lobby_wc_front', 4.5, floorY, 4.5);
    n.lobby_wc_back = wldNode('lobby_wc_back', -4.5, floorY, -7.4);
    n.reception = wldNode('reception', -3.1, floorY, 6.0);
    n.kiosk = wldNode('kiosk', 1.5, floorY, 7.0);
    n.lobby_stand_center = wldNode('lobby_stand_center', 0, floorY, 4.8);
    n.lobby_stand_NE = wldNode('lobby_stand_NE', 6, floorY, 4.6);
    n.lobby_stand_NW = wldNode('lobby_stand_NW', -6.2, floorY, 4.6);
    n.lobby_stand_midE = wldNode('lobby_stand_midE', 6.5, floorY, 1.2);
    n.lobby_stand_midW = wldNode('lobby_stand_midW', -6.2, floorY, 1.0);
    n.lobby_stand_entry = wldNode('lobby_stand_entry', 2.6, floorY, 8.0);
    wldLinkBoth(n.hallSE, n.lobby_wc_front);
    wldLinkBoth(n.lobby_stand_center, n.lobby_wc_front);
    wldLinkBoth(n.hallNW, n.lobby_wc_back);
    wldLinkBoth(n.hallW, n.lobby_wc_back);
    wldLinkBoth(n.entrance, n.reception);
    wldLinkBoth(n.hallSW, n.reception);
    wldLinkBoth(n.entrance, n.kiosk);
    wldLinkBoth(n.entrance, n.lobby_stand_entry);
    wldLinkBoth(n.kiosk, n.lobby_stand_entry);
    wldLinkBoth(n.lobby_stand_center, n.lobby_stand_NE);
    wldLinkBoth(n.lobby_stand_center, n.lobby_stand_NW);
    wldLinkBoth(n.lobby_stand_NE, n.hallSE);
    wldLinkBoth(n.lobby_stand_NE, n.lobby_wc_front);
    wldLinkBoth(n.lobby_stand_NW, n.hallSW);
    wldLinkBoth(n.lobby_stand_midE, n.hallE);
    wldLinkBoth(n.lobby_stand_midE, n.hallSE);
    wldLinkBoth(n.lobby_stand_midW, n.hallW);
    wldLinkBoth(n.lobby_stand_midW, n.hallSW);

    // sitTargets
    for (let i = 0; i < 4; i++) {
        sitTargets['bistro' + i + '_S'] = { sit: true, facing: 0 };
        sitTargets['bistro' + i + '_N'] = { sit: true, facing: Math.PI };
    }
    sitTargets.cafe_order = { sit: false, facing: -Math.PI / 2 };
    sitTargets.lounge_spot0 = { sit: true, facing: Math.PI };
    sitTargets.lounge_spot1 = { sit: true, facing: Math.PI / 2 };
    sitTargets.lounge_spot2 = { sit: true, facing: -Math.PI / 2 };
    sitTargets.back_lounge_S = { sit: true, facing: Math.PI };
    sitTargets.back_lounge_N = { sit: true, facing: 0 };
    sitTargets.pit_N = { sit: true, facing: 0 };
    sitTargets.pit_S = { sit: true, facing: Math.PI };
    sitTargets.pit_W = { sit: true, facing: Math.PI / 2 };
    sitTargets.pit_E = { sit: true, facing: -Math.PI / 2 };
    sitTargets.lobby_wc_front = { sit: false, facing: Math.PI / 2 };
    sitTargets.lobby_wc_back = { sit: false, facing: -Math.PI / 2 };
    sitTargets.reception = { sit: false, facing: -Math.PI / 2 };
    sitTargets.kiosk = { sit: false, facing: Math.PI / 2 };
    sitTargets.lobby_stand_center = { sit: false, facing: null };
    sitTargets.lobby_stand_NE = { sit: false, facing: null };
    sitTargets.lobby_stand_NW = { sit: false, facing: null };
    sitTargets.lobby_stand_midE = { sit: false, facing: null };
    sitTargets.lobby_stand_midW = { sit: false, facing: null };
    sitTargets.lobby_stand_entry = { sit: false, facing: null };
    sitTargets.entrance = { sit: false, facing: null };
    sitTargets.front_door_threshold = { sit: false, facing: null };
    sitTargets.outside = { sit: false, facing: null };
    sitTargets.lobby_center = { sit: false, facing: null };
    sitTargets.elevWait = { sit: false, facing: null };

    const callPanel = wldBuildCallPanel(floorY);
    group.add(callPanel);
    const shaftIndicator = wldBuildShaftIndicator(floorY);
    group.add(shaftIndicator);

    return {
        floorNumber: floorNumber,
        floorY: floorY,
        nodes: n,
        callPanel: callPanel,
        shaftIndicator: shaftIndicator,
        desks: [],
        sitTargets: sitTargets,
        entranceSpot: n.outside,
        cafeSpots: [n.cafe_t0, n.cafe_t1, n.cafe_t2, n.cafe_t3]
    };
}

// ---------- world assembly ----------

function createWorld(scene) {
    const buildingGroup = new THREE.Group();
    buildingGroup.renderOrder = 0;
    scene.add(buildingGroup);

    const wallBlue = 0x9999ff;
    const wallH = WORLD.FLOOR_COUNT * WORLD.FLOOR_HEIGHT;

    // ground slab + sidewalk in front of the entrance
    wldBox(buildingGroup, 36, 0.2, 32, 0x555a60, 0, -0.1, 0);
    wldBox(buildingGroup, 10, 0.04, 4.6, 0x8b8f96, 0, 0.0, 11.2);

    // roof
    wldBox(buildingGroup, WORLD.BUILDING_WIDTH, 0.2, WORLD.BUILDING_DEPTH, 0x777d88,
        0, wallH + 0.1, 0);

    // intermediate floor slabs: four strips around the shaft opening (clean hole)
    for (let f = 1; f < WORLD.FLOOR_COUNT; f++) {
        const y = f * WORLD.FLOOR_HEIGHT;
        const slab = wldMat(0x9aa0ac, 0.3);
        const halfW = WORLD.BUILDING_WIDTH / 2;
        const halfD = WORLD.BUILDING_DEPTH / 2;
        const sideLen = halfW - 1.5; // slab strip spanning x [-11,-1.5] and [1.5,11]
        const strips = [
            // north strip (z from -9 to -1.5)
            [WORLD.BUILDING_WIDTH, 0.12, halfD - 1.5, 0, y - 0.06, -(1.5 + (halfD - 1.5) / 2)],
            // south strip (z from 1.5 to 9)
            [WORLD.BUILDING_WIDTH, 0.12, halfD - 1.5, 0, y - 0.06, 1.5 + (halfD - 1.5) / 2],
            // west strip (x from -11 to -1.5)
            [sideLen, 0.12, 3, -(1.5 + sideLen / 2), y - 0.06, 0],
            // east strip (x from 1.5 to 11)
            [sideLen, 0.12, 3, 1.5 + sideLen / 2, y - 0.06, 0]
        ];
        for (let s = 0; s < strips.length; s++) {
            const st = strips[s];
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(st[0], st[1], st[2]), slab);
            mesh.position.set(st[3], st[4], st[5]);
            buildingGroup.add(mesh);
        }
    }

    // outer walls (semi-transparent blue)
    wldBox(buildingGroup, WORLD.BUILDING_WIDTH + 0.3, wallH, 0.15, wallBlue,
        0, wallH / 2, -WORLD.BUILDING_DEPTH / 2 - 0.07, 0.2);
    wldBox(buildingGroup, 0.15, wallH, WORLD.BUILDING_DEPTH + 0.3, wallBlue,
        -WORLD.BUILDING_WIDTH / 2 - 0.07, wallH / 2, 0, 0.2);
    wldBox(buildingGroup, 0.15, wallH, WORLD.BUILDING_DEPTH + 0.3, wallBlue,
        WORLD.BUILDING_WIDTH / 2 + 0.07, wallH / 2, 0, 0.2);
    // front wall: two side panels (full height) + header over floors 1..5.
    // Floor 0 keeps a real, physical 3-unit-wide doorway centered on x = 0.
    const frontZ = WORLD.BUILDING_DEPTH / 2 + 0.07;
    const sideW = WORLD.BUILDING_WIDTH / 2 - 1.5;
    wldBox(buildingGroup, sideW, wallH, 0.15, wallBlue, -(1.5 + sideW / 2), wallH / 2, frontZ, 0.2);
    wldBox(buildingGroup, sideW, wallH, 0.15, wallBlue, 1.5 + sideW / 2, wallH / 2, frontZ, 0.2);
    const headerH = wallH - WORLD.FLOOR_HEIGHT;
    wldBox(buildingGroup, 3, headerH, 0.15, wallBlue, 0, WORLD.FLOOR_HEIGHT + headerH / 2, frontZ, 0.2);

    const floors = [];
    for (let f = 0; f < WORLD.FLOOR_COUNT; f++) {
        const floorY = f * WORLD.FLOOR_HEIGHT;
        if (f === 0) {
            floors.push(wldBuildLobbyFloor(buildingGroup, 0, 0));
        } else {
            floors.push(wldBuildOfficeFloor(buildingGroup, f, floorY));
        }
    }

    return {
        buildingGroup: buildingGroup,
        floors: floors,
        bfsPath: bfsPath
    };
}
window.createWorld = createWorld;
