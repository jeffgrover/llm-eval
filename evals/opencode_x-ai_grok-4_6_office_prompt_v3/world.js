const WORLD = {
    FLOOR_HEIGHT: 3.4,
    FLOOR_COUNT: 6,
    BUILDING_WIDTH: 22,
    BUILDING_DEPTH: 18,
    SHAFT_WIDTH: 3,
    SHAFT_DEPTH: 3,
    PERSON_R: 0.4,
    navigation: "graph",
    waypointRadius: 0.4
};
window.WORLD = WORLD;

function makeIndicatorTexture(size) {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = 8;
    tex._lastText = null;
    tex._ctx = ctx;
    tex._canvas = canvas;
    return tex;
}

function updateTextTexture(tex, text) {
    if (!tex || tex._lastText === text) return;
    tex._lastText = text;
    const ctx = tex._ctx;
    const canvas = tex._canvas;
    const s = canvas.width;
    ctx.fillStyle = "#050505";
    ctx.fillRect(0, 0, s, s);
    ctx.shadowColor = "#ffbb22";
    ctx.shadowBlur = s * 0.12;
    ctx.fillStyle = "#ffbb22";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold " + Math.floor(s * 0.82) + "px sans-serif";
    ctx.fillText(String(text), s * 0.5, s * 0.56);
    tex.needsUpdate = true;
}

window.makeIndicatorTexture = makeIndicatorTexture;
window.updateTextTexture = updateTextTexture;

function bfsPath(nodes, fromName, toName) {
    if (!nodes || !fromName || !toName) return [];
    if (!nodes[fromName] || !nodes[toName]) return [];
    if (fromName === toName) return [nodes[fromName].pos.clone()];
    const queue = [fromName];
    const prev = {};
    prev[fromName] = null;
    let qi = 0;
    while (qi < queue.length) {
        const cur = queue[qi++];
        if (cur === toName) break;
        const node = nodes[cur];
        const neigh = node.neighbors || [];
        for (let i = 0; i < neigh.length; i++) {
            const nxt = neigh[i];
            if (prev[nxt] === undefined && nodes[nxt]) {
                prev[nxt] = cur;
                queue.push(nxt);
            }
        }
    }
    if (prev[toName] === undefined) return [nodes[toName].pos.clone()];
    const chain = [];
    let walk = toName;
    while (walk != null) {
        chain.push(walk);
        walk = prev[walk];
    }
    chain.reverse();
    return chain.map(function (name) { return nodes[name].pos.clone(); });
}

window.bfsPath = bfsPath;

function linkNodes(nodes, a, b) {
    if (!nodes[a] || !nodes[b]) return;
    if (nodes[a].neighbors.indexOf(b) < 0) nodes[a].neighbors.push(b);
    if (nodes[b].neighbors.indexOf(a) < 0) nodes[b].neighbors.push(a);
}

function addNode(nodes, name, x, y, z) {
    nodes[name] = { name: name, pos: new THREE.Vector3(x, y, z), neighbors: [] };
}

function transparentMat(color, opacity) {
    return new THREE.MeshLambertMaterial({
        color: color,
        transparent: true,
        opacity: opacity,
        depthWrite: false,
        side: THREE.DoubleSide
    });
}

function createCallPanel() {
    const panel = new THREE.Group();
    const plate = new THREE.Mesh(
        new THREE.BoxGeometry(0.55, 1.4, 0.05),
        new THREE.MeshLambertMaterial({ color: 0x2a2a33 })
    );
    panel.add(plate);

    const darkMat = new THREE.MeshBasicMaterial({ color: 0x2b2b2b, side: THREE.DoubleSide });
    const glowMat = new THREE.MeshBasicMaterial({ color: 0x44ff66, side: THREE.DoubleSide });

    function makeArrow(sign) {
        const shape = new THREE.Shape();
        shape.moveTo(0, 0.16 * sign);
        shape.lineTo(0.13, -0.12 * sign);
        shape.lineTo(-0.13, -0.12 * sign);
        shape.closePath();
        const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), darkMat.clone());
        mesh.position.z = 0.03;
        return mesh;
    }

    const upArrow = makeArrow(1);
    upArrow.position.y = 0.38;
    const downArrow = makeArrow(-1);
    downArrow.position.y = -0.05;
    panel.add(upArrow);
    panel.add(downArrow);

    const tex = makeIndicatorTexture(256);
    updateTextTexture(tex, "0");
    const display = new THREE.Mesh(
        new THREE.PlaneGeometry(0.45, 0.45),
        new THREE.MeshBasicMaterial({ map: tex })
    );
    display.position.set(0, -0.48, 0.03);
    panel.add(display);

    panel.userData.kind = "call panel";
    panel.userData.setUp = function (on) {
        upArrow.material = on ? glowMat : darkMat;
    };
    panel.userData.setDown = function (on) {
        downArrow.material = on ? glowMat : darkMat;
    };
    panel.userData.setIndicator = function (text) {
        updateTextTexture(tex, text);
    };
    panel.userData.upArrow = upArrow;
    panel.userData.downArrow = downArrow;
    return panel;
}

function createShaftIndicator() {
    const tex = makeIndicatorTexture(256);
    updateTextTexture(tex, "0");
    const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(0.9, 0.9),
        new THREE.MeshBasicMaterial({ map: tex })
    );
    mesh.userData.setIndicator = function (text) {
        updateTextTexture(tex, text);
    };
    return mesh;
}

function addBox(parent, w, h, d, x, y, z, mat) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
}

function addChair(parent, x, y, z, facing, color) {
    const mat = new THREE.MeshLambertMaterial({ color: color || 0x4a5568 });
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.5), mat);
    seat.position.set(x, y + 0.42, z);
    parent.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.48, 0.08), mat);
    const backOff = 0.21;
    back.position.set(
        x - Math.sin(facing) * backOff,
        y + 0.68,
        z - Math.cos(facing) * backOff
    );
    parent.add(back);
    return facing;
}

function addDesk(parent, x, y, z, w, d) {
    const wood = new THREE.MeshLambertMaterial({ color: 0x6b4f2a });
    addBox(parent, w, 0.08, d, x, y + 0.74, z, wood);
    addBox(parent, 0.08, 0.7, 0.08, x - w * 0.45, y + 0.35, z - d * 0.4, wood);
    addBox(parent, 0.08, 0.7, 0.08, x + w * 0.45, y + 0.35, z - d * 0.4, wood);
    addBox(parent, 0.08, 0.7, 0.08, x - w * 0.45, y + 0.35, z + d * 0.4, wood);
    addBox(parent, 0.08, 0.7, 0.08, x + w * 0.45, y + 0.35, z + d * 0.4, wood);
    const mon = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.28, 0.04), new THREE.MeshLambertMaterial({ color: 0x222228 }));
    mon.position.set(x, y + 1.02, z - d * 0.28);
    parent.add(mon);
}

function addCouch(parent, x, y, z, facing, w) {
    const mat = new THREE.MeshLambertMaterial({ color: 0x5a6d8a });
    const depth = 0.7;
    addBox(parent, w, 0.36, depth, x, y + 0.28, z, mat);
    const backOff = 0.28;
    addBox(
        parent,
        w,
        0.38,
        0.1,
        x - Math.sin(facing) * backOff,
        y + 0.55,
        z - Math.cos(facing) * backOff,
        mat
    );
}

function addPlant(parent, x, y, z) {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.28, 8), new THREE.MeshLambertMaterial({ color: 0x8b4513 }));
    pot.position.set(x, y + 0.14, z);
    parent.add(pot);
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), new THREE.MeshLambertMaterial({ color: 0x2e8b3a }));
    leaf.position.set(x, y + 0.5, z);
    parent.add(leaf);
}

function addWaterCooler(parent, x, y, z) {
    addBox(parent, 0.32, 0.7, 0.32, x, y + 0.35, z, new THREE.MeshLambertMaterial({ color: 0xdddddd }));
    const jug = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshLambertMaterial({ color: 0x88ccee, transparent: true, opacity: 0.55, depthWrite: false }));
    jug.position.set(x, y + 0.88, z);
    parent.add(jug);
}

function createWorld(scene) {
    const FH = WORLD.FLOOR_HEIGHT;
    const FC = WORLD.FLOOR_COUNT;
    const BW = WORLD.BUILDING_WIDTH;
    const BD = WORLD.BUILDING_DEPTH;
    const hx = BW * 0.5;
    const hz = BD * 0.5;
    const buildingGroup = new THREE.Group();
    buildingGroup.renderOrder = 0;
    scene.add(buildingGroup);

    const solidGray = new THREE.MeshLambertMaterial({ color: 0x888888 });
    const slabMat = transparentMat(0x777788, 0.3);
    const wallMat = transparentMat(0x9999ff, 0.2);
    const innerMat = transparentMat(0xbbc5e6, 0.28);
    const glassMat = transparentMat(0xaad0ff, 0.12);

    addBox(buildingGroup, BW + 2, 0.18, BD + 8, 0, -0.09, 2, solidGray);
    addBox(buildingGroup, BW, 0.16, 4.2, 0, 0.02, 11.1, new THREE.MeshLambertMaterial({ color: 0x9a9a92 }));
    addBox(buildingGroup, BW + 0.4, 0.2, BD + 0.4, 0, FC * FH + 0.1, 0, solidGray);

    for (let f = 1; f < FC; f++) {
        const y = f * FH;
        addBox(buildingGroup, hx - 1.5, 0.08, BD, -(1.5 + hx) * 0.5, y, 0, slabMat);
        addBox(buildingGroup, hx - 1.5, 0.08, BD, (1.5 + hx) * 0.5, y, 0, slabMat);
        addBox(buildingGroup, 3, 0.08, hz - 1.5, 0, y, (1.5 + hz) * 0.5, slabMat);
        addBox(buildingGroup, 3, 0.08, hz - 1.5, 0, y, -(1.5 + hz) * 0.5, slabMat);
    }

    const wallH = FC * FH;
    addBox(buildingGroup, 0.12, wallH, BD, -hx, wallH * 0.5, 0, wallMat);
    addBox(buildingGroup, 0.12, wallH, BD, hx, wallH * 0.5, 0, wallMat);
    addBox(buildingGroup, BW, 0.12, 0.12, 0, wallH * 0.5, -hz, wallMat);

    const gap = 1.5;
    const sideW = hx - gap;
    addBox(buildingGroup, sideW, wallH, 0.12, -(gap + sideW * 0.5), wallH * 0.5, hz, wallMat);
    addBox(buildingGroup, sideW, wallH, 0.12, (gap + sideW * 0.5), wallH * 0.5, hz, wallMat);
    const headerH = (FC - 1) * FH;
    addBox(buildingGroup, 3, headerH, 0.12, 0, FH + headerH * 0.5, hz, wallMat);

    const doorL = new THREE.Mesh(new THREE.BoxGeometry(1.15, 2.2, 0.05), glassMat);
    doorL.position.set(-2.35, 1.1, hz);
    buildingGroup.add(doorL);
    const doorR = new THREE.Mesh(new THREE.BoxGeometry(1.15, 2.2, 0.05), glassMat);
    doorR.position.set(2.35, 1.1, hz);
    buildingGroup.add(doorR);

    function addInteriorWall(x, y, z, w, h, d) {
        addBox(buildingGroup, w, h, d, x, y, z, innerMat);
    }

    function officeInterior(floorY) {
        const midY = floorY + FH * 0.5;
        const h = FH * 0.92;
        const xs = [-5.5, 0, 5.5];
        for (let i = 0; i < xs.length; i++) {
            addInteriorWall(xs[i], midY, -6.0, 0.08, h, 6.0);
        }
        const doorXs = [-8.2, -2.7, 2.7, 8.2];
        let cursor = -hx;
        for (let i = 0; i < doorXs.length; i++) {
            const dx = doorXs[i];
            const left = cursor;
            const right = dx - 0.6;
            const ww = right - left;
            if (ww > 0.2) addInteriorWall(left + ww * 0.5, midY, -3.0, ww, h, 0.08);
            cursor = dx + 0.6;
        }
        const lastW = hx - cursor;
        if (lastW > 0.2) addInteriorWall(cursor + lastW * 0.5, midY, -3.0, lastW, h, 0.08);

        addInteriorWall(-7.15, midY, 3.0, 7.7, h, 0.08);
        addInteriorWall(-3.0, midY, 6.85, 0.08, h, 4.3);

        addInteriorWall(7.15, midY, 3.0, 7.7, h, 0.08);
        addInteriorWall(3.0, midY, 6.85, 0.08, h, 4.3);
    }

    const floors = [];

    function hallRing(nodes, y) {
        addNode(nodes, "hallS", 0, y, 2.7);
        addNode(nodes, "hallSE", 3.3, y, 2.7);
        addNode(nodes, "hallE", 3.3, y, 0);
        addNode(nodes, "hallNE", 3.3, y, -2.7);
        addNode(nodes, "hallN", 0, y, -2.7);
        addNode(nodes, "hallNW", -3.3, y, -2.7);
        addNode(nodes, "hallW", -3.3, y, 0);
        addNode(nodes, "hallSW", -3.3, y, 2.7);
        addNode(nodes, "elevWait", 0, y, 2.35);
        linkNodes(nodes, "hallS", "hallSE");
        linkNodes(nodes, "hallSE", "hallE");
        linkNodes(nodes, "hallE", "hallNE");
        linkNodes(nodes, "hallNE", "hallN");
        linkNodes(nodes, "hallN", "hallNW");
        linkNodes(nodes, "hallNW", "hallW");
        linkNodes(nodes, "hallW", "hallSW");
        linkNodes(nodes, "hallSW", "hallS");
        linkNodes(nodes, "elevWait", "hallS");
    }

    function buildOfficeFloor(floorNumber) {
        const y = floorNumber * FH;
        if (floorNumber > 0) officeInterior(y);
        const nodes = {};
        const sitTargets = {};
        const desks = [];
        hallRing(nodes, y);

        const officeSpecs = [
            { id: "A", deskX: -8.2, deskZ: -6.6, doorX: -8.2, hall: "hallNW" },
            { id: "B", deskX: -2.7, deskZ: -6.6, doorX: -2.7, hall: "hallN" },
            { id: "C", deskX: 2.7, deskZ: -6.6, doorX: 2.7, hall: "hallN" },
            { id: "D", deskX: 8.2, deskZ: -6.6, doorX: 8.2, hall: "hallNE" }
        ];
        for (let i = 0; i < officeSpecs.length; i++) {
            const spec = officeSpecs[i];
            addDesk(buildingGroup, spec.deskX, y, spec.deskZ, 1.4, 0.75);
            const chairZ = spec.deskZ + 0.7;
            addChair(buildingGroup, spec.deskX, y, chairZ, Math.PI, 0x3d4f66);
            const doorName = "office" + spec.id + "_door";
            const deskName = "office" + spec.id + "_desk";
            addNode(nodes, doorName, spec.doorX, y, -3.35);
            addNode(nodes, deskName, spec.deskX, y, chairZ);
            linkNodes(nodes, spec.hall, doorName);
            linkNodes(nodes, doorName, deskName);
            sitTargets[deskName] = { sit: true, facing: Math.PI, x: spec.deskX, z: chairZ };
            desks.push({ id: spec.id, deskWp: deskName, doorWp: doorName, x: spec.deskX, z: chairZ });
        }
        linkNodes(nodes, "officeB_door", "hallNW");
        linkNodes(nodes, "officeC_door", "hallNE");

        addDesk(buildingGroup, -7.0, y, 6.0, 2.6, 0.9);
        const confSeats = [
            { name: "conf_seat0", x: -8.0, z: 5.35, face: 0 },
            { name: "conf_seat1", x: -6.0, z: 5.35, face: 0 },
            { name: "conf_seat2", x: -8.0, z: 6.65, face: Math.PI },
            { name: "conf_seat3", x: -6.0, z: 6.65, face: Math.PI }
        ];
        for (let c = 0; c < confSeats.length; c++) {
            const seat = confSeats[c];
            addChair(buildingGroup, seat.x, y, seat.z, seat.face, 0x5a4632);
            addNode(nodes, seat.name, seat.x, y, seat.z);
            sitTargets[seat.name] = { sit: true, facing: seat.face, x: seat.x, z: seat.z };
        }
        addNode(nodes, "conf_door", -3.35, y, 4.2);
        addNode(nodes, "conf_center", -7.0, y, 6.0);
        linkNodes(nodes, "conf_door", "hallSW");
        linkNodes(nodes, "conf_door", "conf_center");
        for (let c = 0; c < confSeats.length; c++) linkNodes(nodes, "conf_center", confSeats[c].name);

        addCouch(buildingGroup, 7.4, y, 7.4, 0, 2.0);
        addChair(buildingGroup, 5.2, y, 5.6, Math.PI * 0.5, 0x6a5a4a);
        addChair(buildingGroup, 9.2, y, 5.6, -Math.PI * 0.5, 0x6a5a4a);
        addBox(buildingGroup, 1.1, 0.28, 0.6, 7.4, y + 0.22, 6.2, new THREE.MeshLambertMaterial({ color: 0x8a7050 }));
        addWaterCooler(buildingGroup, 4.2, y, 7.6);

        addNode(nodes, "lounge_door", 3.35, y, 4.2);
        addNode(nodes, "lounge_center", 7.2, y, 6.0);
        addNode(nodes, "lounge_spot0", 7.4, y, 7.05);
        addNode(nodes, "lounge_spot1", 5.2, y, 5.6);
        addNode(nodes, "lounge_spot2", 9.2, y, 5.6);
        linkNodes(nodes, "lounge_door", "hallSE");
        linkNodes(nodes, "lounge_door", "lounge_center");
        linkNodes(nodes, "lounge_center", "lounge_spot0");
        linkNodes(nodes, "lounge_center", "lounge_spot1");
        linkNodes(nodes, "lounge_center", "lounge_spot2");
        sitTargets.lounge_spot0 = { sit: true, facing: 0, x: 7.4, z: 7.05 };
        sitTargets.lounge_spot1 = { sit: true, facing: Math.PI * 0.5, x: 5.2, z: 5.6 };
        sitTargets.lounge_spot2 = { sit: true, facing: -Math.PI * 0.5, x: 9.2, z: 5.6 };

        addNode(nodes, "water_cooler", 4.2, y, 7.15);
        addNode(nodes, "hall_stand_N", 0, y, -4.1);
        addNode(nodes, "hall_stand_S", 5.4, y, 0.2);
        linkNodes(nodes, "water_cooler", "lounge_center");
        linkNodes(nodes, "hall_stand_N", "hallN");
        linkNodes(nodes, "hall_stand_S", "hallE");
        sitTargets.water_cooler = { sit: false, facing: 0, x: 4.2, z: 7.15 };
        sitTargets.hall_stand_N = { sit: false, facing: 0, x: 0, z: -4.1 };
        sitTargets.hall_stand_S = { sit: false, facing: 0, x: 5.4, z: 0.2 };

        const callPanel = createCallPanel();
        callPanel.position.set(1.85, y + 1.35, 1.58);
        buildingGroup.add(callPanel);
        const shaftIndicator = createShaftIndicator();
        shaftIndicator.position.set(0, y + 2.55, 1.56);
        buildingGroup.add(shaftIndicator);

        return {
            floorNumber: floorNumber,
            nodes: nodes,
            callPanel: callPanel,
            shaftIndicator: shaftIndicator,
            desks: desks,
            sitTargets: sitTargets
        };
    }

    function buildLobby() {
        const y = 0;
        const nodes = {};
        const sitTargets = {};
        hallRing(nodes, y);

        addNode(nodes, "outside", 0, y, 12);
        addNode(nodes, "front_door_threshold", 0, y, 9.35);
        addNode(nodes, "entrance", 0, y, 7.4);
        addNode(nodes, "lobby_center", 0, y, 4.6);
        linkNodes(nodes, "outside", "front_door_threshold");
        linkNodes(nodes, "front_door_threshold", "entrance");
        linkNodes(nodes, "entrance", "lobby_center");
        linkNodes(nodes, "lobby_center", "elevWait");
        linkNodes(nodes, "entrance", "elevWait");

        addBox(buildingGroup, 2.4, 1.05, 0.7, -9.4, 0.55, 2.2, new THREE.MeshLambertMaterial({ color: 0x4a3728 }));
        addBox(buildingGroup, 2.4, 0.08, 0.74, -9.4, 1.1, 2.2, new THREE.MeshLambertMaterial({ color: 0x2b2118 }));
        addBox(buildingGroup, 0.35, 0.45, 0.28, -10.1, 1.38, 2.2, new THREE.MeshLambertMaterial({ color: 0x555560 }));
        addBox(buildingGroup, 0.7, 0.22, 0.32, -8.8, 1.26, 2.2, new THREE.MeshLambertMaterial({ color: 0xc9a66b }));
        addNode(nodes, "cafe_order", -8.3, y, 2.2);
        addNode(nodes, "cafe_door", -3.4, y, 3.4);
        linkNodes(nodes, "cafe_door", "hallSW");
        linkNodes(nodes, "cafe_order", "cafe_door");
        sitTargets.cafe_order = { sit: false, facing: Math.PI * 0.5, x: -8.3, z: 2.2 };

        const bistros = [
            { name: "bistro0", x: -8.6, z: 5.4, face: 0 },
            { name: "bistro1", x: -8.6, z: 6.5, face: Math.PI },
            { name: "bistro2", x: -6.2, z: 5.4, face: 0 },
            { name: "bistro3", x: -6.2, z: 6.5, face: Math.PI },
            { name: "bistro4", x: -8.6, z: 0.2, face: Math.PI * 0.5 },
            { name: "bistro5", x: -7.4, z: 0.2, face: -Math.PI * 0.5 }
        ];
        addBox(buildingGroup, 0.8, 0.55, 0.8, -8.6, 0.28, 5.95, new THREE.MeshLambertMaterial({ color: 0x6a5340 }));
        addBox(buildingGroup, 0.8, 0.55, 0.8, -6.2, 0.28, 5.95, new THREE.MeshLambertMaterial({ color: 0x6a5340 }));
        addBox(buildingGroup, 0.8, 0.55, 0.8, -8.0, 0.28, 0.2, new THREE.MeshLambertMaterial({ color: 0x6a5340 }));
        for (let b = 0; b < bistros.length; b++) {
            const bs = bistros[b];
            addChair(buildingGroup, bs.x, y, bs.z, bs.face, 0x7a5a3a);
            addNode(nodes, bs.name, bs.x, y, bs.z);
            sitTargets[bs.name] = { sit: true, facing: bs.face, x: bs.x, z: bs.z };
            linkNodes(nodes, bs.name, "cafe_door");
        }

        addCouch(buildingGroup, 7.6, y, 6.8, 0, 2.1);
        addChair(buildingGroup, 5.6, y, 5.2, Math.PI * 0.5, 0x6a5a4a);
        addChair(buildingGroup, 9.4, y, 5.2, -Math.PI * 0.5, 0x6a5a4a);
        addBox(buildingGroup, 1.2, 0.28, 0.65, 7.6, 0.22, 5.6, new THREE.MeshLambertMaterial({ color: 0x8a7050 }));
        addNode(nodes, "front_lounge0", 7.6, y, 6.45);
        addNode(nodes, "front_lounge1", 5.6, y, 5.2);
        addNode(nodes, "front_lounge2", 9.4, y, 5.2);
        sitTargets.front_lounge0 = { sit: true, facing: 0, x: 7.6, z: 6.45 };
        sitTargets.front_lounge1 = { sit: true, facing: Math.PI * 0.5, x: 5.6, z: 5.2 };
        sitTargets.front_lounge2 = { sit: true, facing: -Math.PI * 0.5, x: 9.4, z: 5.2 };
        linkNodes(nodes, "front_lounge0", "hallSE");
        linkNodes(nodes, "front_lounge1", "front_lounge0");
        linkNodes(nodes, "front_lounge2", "front_lounge0");

        addCouch(buildingGroup, -1.6, y, -6.6, 0, 2.0);
        addCouch(buildingGroup, -1.6, y, -4.2, Math.PI, 2.0);
        addBox(buildingGroup, 1.1, 0.26, 0.6, -1.6, 0.2, -5.4, new THREE.MeshLambertMaterial({ color: 0x8a7050 }));
        addNode(nodes, "back_lounge_N", -1.6, y, -6.25);
        addNode(nodes, "back_lounge_S", -1.6, y, -4.55);
        sitTargets.back_lounge_N = { sit: true, facing: 0, x: -1.6, z: -6.25 };
        sitTargets.back_lounge_S = { sit: true, facing: Math.PI, x: -1.6, z: -4.55 };
        linkNodes(nodes, "back_lounge_N", "hallN");
        linkNodes(nodes, "back_lounge_S", "hallN");

        const pit = [
            { name: "pit_N", x: -8.2, z: -6.8, face: 0 },
            { name: "pit_S", x: -8.2, z: -4.6, face: Math.PI },
            { name: "pit_E", x: -7.0, z: -5.7, face: -Math.PI * 0.5 },
            { name: "pit_W", x: -9.4, z: -5.7, face: Math.PI * 0.5 }
        ];
        addBox(buildingGroup, 0.9, 0.28, 0.9, -8.2, 0.2, -5.7, new THREE.MeshLambertMaterial({ color: 0x6a5340 }));
        for (let p = 0; p < pit.length; p++) {
            const ps = pit[p];
            addChair(buildingGroup, ps.x, y, ps.z, ps.face, 0x5a4632);
            addNode(nodes, ps.name, ps.x, y, ps.z);
            sitTargets[ps.name] = { sit: true, facing: ps.face, x: ps.x, z: ps.z };
            linkNodes(nodes, ps.name, "hallNW");
        }

        addWaterCooler(buildingGroup, 4.6, y, 7.5);
        addWaterCooler(buildingGroup, 4.4, y, -6.8);
        addNode(nodes, "lobby_wc_front", 4.6, y, 7.05);
        addNode(nodes, "lobby_wc_back", 4.4, y, -6.3);
        sitTargets.lobby_wc_front = { sit: false, facing: 0, x: 4.6, z: 7.05 };
        sitTargets.lobby_wc_back = { sit: false, facing: 0, x: 4.4, z: -6.3 };
        linkNodes(nodes, "lobby_wc_front", "hallSE");
        linkNodes(nodes, "lobby_wc_back", "hallNE");

        addBox(buildingGroup, 1.6, 0.95, 0.7, -3.1, 0.48, 6.1, new THREE.MeshLambertMaterial({ color: 0x3a3f4a }));
        addNode(nodes, "reception", -3.1, y, 5.4);
        sitTargets.reception = { sit: false, facing: 0, x: -3.1, z: 5.4 };
        linkNodes(nodes, "reception", "lobby_center");

        addBox(buildingGroup, 0.45, 1.2, 0.45, 2.4, 0.6, 7.6, new THREE.MeshLambertMaterial({ color: 0x334455 }));
        addNode(nodes, "kiosk", 2.4, y, 7.05);
        sitTargets.kiosk = { sit: false, facing: 0, x: 2.4, z: 7.05 };
        linkNodes(nodes, "kiosk", "entrance");

        const loiters = [
            { name: "lobby_stand_center", x: 0, z: 5.6 },
            { name: "lobby_stand_NE", x: 6.2, z: 3.6 },
            { name: "lobby_stand_NW", x: -5.4, z: 3.8 },
            { name: "lobby_stand_midE", x: 6.6, z: 0.4 },
            { name: "lobby_stand_midW", x: -6.4, z: -1.2 },
            { name: "lobby_stand_entry", x: 2.2, z: 6.6 }
        ];
        for (let li = 0; li < loiters.length; li++) {
            const lo = loiters[li];
            addNode(nodes, lo.name, lo.x, y, lo.z);
            sitTargets[lo.name] = { sit: false, facing: 0, x: lo.x, z: lo.z };
            linkNodes(nodes, lo.name, "lobby_center");
        }

        addPlant(buildingGroup, -2.4, y, 8.35);
        addPlant(buildingGroup, 2.4, y, 8.35);

        const callPanel = createCallPanel();
        callPanel.position.set(1.85, 1.35, 1.58);
        buildingGroup.add(callPanel);
        const shaftIndicator = createShaftIndicator();
        shaftIndicator.position.set(0, 2.55, 1.56);
        buildingGroup.add(shaftIndicator);

        return {
            floorNumber: 0,
            nodes: nodes,
            callPanel: callPanel,
            shaftIndicator: shaftIndicator,
            desks: [],
            sitTargets: sitTargets,
            entranceSpot: nodes.entrance.pos.clone(),
            cafeSpots: ["bistro0", "bistro1", "bistro2", "bistro3", "bistro4", "bistro5"]
        };
    }

    floors.push(buildLobby());
    for (let fn = 1; fn < FC; fn++) floors.push(buildOfficeFloor(fn));

    return {
        buildingGroup: buildingGroup,
        floors: floors,
        bfsPath: bfsPath
    };
}

window.createWorld = createWorld;
window.createCallPanel = createCallPanel;
window.createShaftIndicator = createShaftIndicator;
