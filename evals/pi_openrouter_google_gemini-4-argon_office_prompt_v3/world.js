const WORLD = {
    FLOOR_HEIGHT: 3.4,
    FLOOR_COUNT: 6,
    BUILDING_WIDTH: 22,
    BUILDING_DEPTH: 18,
    SHAFT_WIDTH: 3,
    SHAFT_DEPTH: 3,
    PERSON_R: 0.4
};

function updateTextTexture(tex, text) {
    if (!tex || tex._lastText === text) return;
    tex._lastText = text;
    const canvas = tex.image;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#050505";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.fillStyle = "#ffbb22";
    ctx.shadowColor = "#ff8800";
    ctx.shadowBlur = 18;
    ctx.font = "bold 170px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 6);
    ctx.restore();
    tex.needsUpdate = true;
}

function createTextIndicator(size, initialText) {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    updateTextTexture(tex, initialText || "0");
    const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
    mesh.userData = {
        texture: tex,
        setIndicator: (txt) => updateTextTexture(tex, txt)
    };
    return mesh;
}

function createCallPanel() {
    const group = new THREE.Group();
    const plateMat = new THREE.MeshLambertMaterial({ color: 0x22262e });
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.4, 0.05), plateMat);
    group.add(plate);

    const indicator = createTextIndicator(0.45, "0");
    indicator.position.set(0, 0.36, 0.03);
    group.add(indicator);

    const makeTri = (isUp) => {
        const s = new THREE.Shape();
        const w = 0.13;
        const h = 0.16;
        if (isUp) {
            s.moveTo(0, h);
            s.lineTo(-w, -h * 0.6);
            s.lineTo(w, -h * 0.6);
        } else {
            s.moveTo(0, -h);
            s.lineTo(-w, h * 0.6);
            s.lineTo(w, h * 0.6);
        }
        s.closePath();
        return new THREE.ShapeGeometry(s);
    };

    const offMat = new THREE.MeshBasicMaterial({ color: 0x3a3f47, side: THREE.DoubleSide });
    const onMat = new THREE.MeshBasicMaterial({ color: 0x33ff66, side: THREE.DoubleSide });
    const upMesh = new THREE.Mesh(makeTri(true), offMat);
    upMesh.position.set(0, -0.08, 0.031);
    const downMesh = new THREE.Mesh(makeTri(false), offMat);
    downMesh.position.set(0, -0.42, 0.031);
    group.add(upMesh);
    group.add(downMesh);

    group.userData = {
        setUp: (on) => { upMesh.material = on ? onMat : offMat; },
        setDown: (on) => { downMesh.material = on ? onMat : offMat; },
        setIndicator: (txt) => indicator.userData.setIndicator(txt)
    };
    return group;
}

window.WORLD = WORLD;
window.updateTextTexture = updateTextTexture;
window.createTextIndicator = createTextIndicator;

function addNode(nodes, name, x, y, z) {
    nodes[name] = { name: name, pos: new THREE.Vector3(x, y, z), neighbors: [] };
}

function linkNodes(nodes, a, b) {
    if (!nodes[a] || !nodes[b]) return;
    if (!nodes[a].neighbors.includes(b)) nodes[a].neighbors.push(b);
    if (!nodes[b].neighbors.includes(a)) nodes[b].neighbors.push(a);
}

function bfsPath(nodes, fromName, toName) {
    if (!nodes[fromName] || !nodes[toName]) return [];
    if (fromName === toName) return [nodes[toName].pos.clone()];
    const queue = [[fromName]];
    const visited = new Set([fromName]);
    while (queue.length > 0) {
        const path = queue.shift();
        const curr = path[path.length - 1];
        if (curr === toName) {
            return path.map((n) => nodes[n].pos.clone());
        }
        const nb = nodes[curr].neighbors;
        for (let i = 0; i < nb.length; i++) {
            const next = nb[i];
            if (!visited.has(next)) {
                visited.add(next);
                queue.push(path.concat([next]));
            }
        }
    }
    return [nodes[toName].pos.clone()];
}

function createChair(color, facingY) {
    const g = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: color || 0x334155 });
    const legMat = new THREE.MeshLambertMaterial({ color: 0x1e293b });
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.07, 0.52), mat);
    seat.position.set(0, 0.42, 0);
    g.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.52, 0.07), mat);
    back.position.set(0, 0.68, -0.225);
    g.add(back);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.22, 0.42, 8), legMat);
    base.position.set(0, 0.21, 0);
    g.add(base);
    g.rotation.y = facingY || 0;
    return g;
}

function createCouch(width, color, facingY) {
    const g = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: color || 0x475569 });
    const seat = new THREE.Mesh(new THREE.BoxGeometry(width, 0.28, 0.78), mat);
    seat.position.set(0, 0.26, 0);
    g.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(width, 0.48, 0.16), mat);
    back.position.set(0, 0.56, -0.31);
    g.add(back);
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.38, 0.78), mat);
    armL.position.set(-width / 2 + 0.07, 0.42, 0);
    const armR = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.38, 0.78), mat);
    armR.position.set(width / 2 - 0.07, 0.42, 0);
    g.add(armL);
    g.add(armR);
    g.rotation.y = facingY || 0;
    return g;
}

function createWaterCooler() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.95, 0.4), new THREE.MeshLambertMaterial({ color: 0xe2e8f0 }));
    body.position.set(0, 0.475, 0);
    g.add(body);
    const jug = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.42, 10), new THREE.MeshLambertMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.65, depthWrite: false, side: THREE.DoubleSide }));
    jug.position.set(0, 1.15, 0);
    g.add(jug);
    return g;
}

function createPlant() {
    const g = new THREE.Group();
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.2, 0.42, 10), new THREE.MeshLambertMaterial({ color: 0x92400e }));
    pot.position.set(0, 0.21, 0);
    g.add(pot);
    const foliage = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), new THREE.MeshLambertMaterial({ color: 0x15803d }));
    foliage.position.set(0, 0.68, 0);
    g.add(foliage);
    return g;
}

function buildHallwayRing(nodes, y) {
    addNode(nodes, "elevWait", 0, y, 2.3);
    addNode(nodes, "hallS", 0, y, 2.6);
    addNode(nodes, "hallSE", 2.4, y, 2.6);
    addNode(nodes, "hallE", 2.4, y, 0);
    addNode(nodes, "hallNE", 2.4, y, -2.4);
    addNode(nodes, "hallN", 0, y, -2.4);
    addNode(nodes, "hallNW", -2.4, y, -2.4);
    addNode(nodes, "hallW", -2.4, y, 0);
    addNode(nodes, "hallSW", -2.4, y, 2.6);

    linkNodes(nodes, "elevWait", "hallS");
    linkNodes(nodes, "hallS", "hallSE");
    linkNodes(nodes, "hallSE", "hallE");
    linkNodes(nodes, "hallE", "hallNE");
    linkNodes(nodes, "hallNE", "hallN");
    linkNodes(nodes, "hallN", "hallNW");
    linkNodes(nodes, "hallNW", "hallW");
    linkNodes(nodes, "hallW", "hallSW");
    linkNodes(nodes, "hallSW", "hallS");
}

function addWallWithDoor(group, x1, z1, x2, z2, doorCenter, doorWidth, h, mat) {
    const isX = Math.abs(z1 - z2) < 1e-4;
    if (isX) {
        const minX = Math.min(x1, x2);
        const maxX = Math.max(x1, x2);
        const dMin = doorCenter - doorWidth / 2;
        const dMax = doorCenter + doorWidth / 2;
        if (dMin > minX) {
            const w1 = dMin - minX;
            const m1 = new THREE.Mesh(new THREE.BoxGeometry(w1, h, 0.12), mat);
            m1.position.set(minX + w1 / 2, h / 2, z1);
            group.add(m1);
        }
        if (maxX > dMax) {
            const w2 = maxX - dMax;
            const m2 = new THREE.Mesh(new THREE.BoxGeometry(w2, h, 0.12), mat);
            m2.position.set(dMax + w2 / 2, h / 2, z1);
            group.add(m2);
        }
    } else {
        const minZ = Math.min(z1, z2);
        const maxZ = Math.max(z1, z2);
        const dMin = doorCenter - doorWidth / 2;
        const dMax = doorCenter + doorWidth / 2;
        if (dMin > minZ) {
            const l1 = dMin - minZ;
            const m1 = new THREE.Mesh(new THREE.BoxGeometry(0.12, h, l1), mat);
            m1.position.set(x1, h / 2, minZ + l1 / 2);
            group.add(m1);
        }
        if (maxZ > dMax) {
            const l2 = maxZ - dMax;
            const m2 = new THREE.Mesh(new THREE.BoxGeometry(0.12, h, l2), mat);
            m2.position.set(x1, h / 2, dMax + l2 / 2);
            group.add(m2);
        }
    }
}

function buildOfficeFloor(floorGroup, f, y, intWallMat) {
    const nodes = {};
    const sitTargets = {};
    const desks = [];
    buildHallwayRing(nodes, y);

    const h = WORLD.FLOOR_HEIGHT;
    const officeLetters = ["A", "B", "C", "D"];
    const officeX = [-8.25, -2.75, 2.75, 8.25];
    const hallLink = ["hallNW", "hallNW", "hallNE", "hallNE"];

    for (let i = 0; i < 4; i++) {
        const cx = officeX[i];
        const minX = -11 + i * 5.5;
        const maxX = minX + 5.5;
        addWallWithDoor(floorGroup, minX, -3, maxX, -3, cx, 1.2, h, intWallMat);
        if (i > 0) {
            const div = new THREE.Mesh(new THREE.BoxGeometry(0.12, h, 6), intWallMat);
            div.position.set(minX, h / 2, -6);
            floorGroup.add(div);
        }

        const deskMesh = new THREE.Mesh(
            new THREE.BoxGeometry(1.6, 0.74, 0.8),
            new THREE.MeshLambertMaterial({ color: 0x78350f })
        );
        deskMesh.position.set(cx, 0.37, -6.0);
        floorGroup.add(deskMesh);

        const monitor = new THREE.Mesh(
            new THREE.BoxGeometry(0.55, 0.36, 0.06),
            new THREE.MeshLambertMaterial({ color: 0x111827 })
        );
        monitor.position.set(cx, 0.94, -6.28);
        floorGroup.add(monitor);

        const chair = createChair(0x1e3a8a, Math.PI);
        chair.position.set(cx, 0, -5.2);
        floorGroup.add(chair);

        const doorWp = "office" + officeLetters[i] + "_door";
        const deskWp = "office" + officeLetters[i] + "_desk";
        addNode(nodes, doorWp, cx, y, -2.8);
        addNode(nodes, deskWp, cx, y, -5.2);
        linkNodes(nodes, doorWp, hallLink[i]);
        linkNodes(nodes, doorWp, deskWp);
        sitTargets[deskWp] = { sit: true, facing: Math.PI };
        desks.push({ id: "F" + f + "_" + officeLetters[i], floor: f, deskWpName: deskWp, doorWpName: doorWp });
    }

    addWallWithDoor(floorGroup, -11, 3, -3, 3, -4.6, 1.2, h, intWallMat);
    addWallWithDoor(floorGroup, -3, 3, -3, 9, 5.2, 1.2, h, intWallMat);
    const confTable = new THREE.Mesh(
        new THREE.BoxGeometry(3.4, 0.74, 1.4),
        new THREE.MeshLambertMaterial({ color: 0x5c4033 })
    );
    confTable.position.set(-7.0, 0.37, 6.0);
    floorGroup.add(confTable);

    addNode(nodes, "conf_door", -3.0, y, 5.2);
    addNode(nodes, "conf_center", -5.2, y, 5.8);
    linkNodes(nodes, "conf_door", "hallSW");
    linkNodes(nodes, "conf_door", "conf_center");

    const confSeats = [
        { x: -7.8, z: 4.9, facing: 0 },
        { x: -6.2, z: 4.9, facing: 0 },
        { x: -7.8, z: 7.1, facing: Math.PI },
        { x: -6.2, z: 7.1, facing: Math.PI }
    ];
    for (let i = 0; i < 4; i++) {
        const s = confSeats[i];
        const ch = createChair(0x0f766e, s.facing);
        ch.position.set(s.x, 0, s.z);
        floorGroup.add(ch);
        const wp = "conf_seat" + i;
        addNode(nodes, wp, s.x, y, s.z);
        linkNodes(nodes, "conf_center", wp);
        sitTargets[wp] = { sit: true, facing: s.facing };
    }

    return buildOfficeFloorLounge(floorGroup, y, h, intWallMat, nodes, sitTargets, desks);
}

function buildOfficeFloorLounge(floorGroup, y, h, intWallMat, nodes, sitTargets, desks) {
    addWallWithDoor(floorGroup, 3, 3, 11, 3, 4.6, 1.2, h, intWallMat);
    addWallWithDoor(floorGroup, 3, 3, 3, 9, 5.2, 1.2, h, intWallMat);

    const couch = createCouch(2.2, 0x6d28d9, 0);
    couch.position.set(7.2, 0, 4.6);
    floorGroup.add(couch);

    const coffeeTable = new THREE.Mesh(
        new THREE.BoxGeometry(1.4, 0.42, 0.75),
        new THREE.MeshLambertMaterial({ color: 0x7c2d12 })
    );
    coffeeTable.position.set(7.2, 0.21, 5.95);
    floorGroup.add(coffeeTable);

    const arm1 = createCouch(0.9, 0x4c1d95, Math.PI / 2);
    arm1.position.set(5.4, 0, 6.2);
    floorGroup.add(arm1);

    const arm2 = createCouch(0.9, 0x4c1d95, -Math.PI / 2);
    arm2.position.set(9.0, 0, 6.2);
    floorGroup.add(arm2);

    const wc = createWaterCooler();
    wc.position.set(9.8, 0, 4.0);
    floorGroup.add(wc);

    addNode(nodes, "lounge_door", 3.0, y, 5.2);
    addNode(nodes, "lounge_center", 5.2, y, 5.8);
    linkNodes(nodes, "lounge_door", "hallSE");
    linkNodes(nodes, "lounge_door", "lounge_center");

    addNode(nodes, "lounge_spot0", 7.2, y, 4.6);
    sitTargets.lounge_spot0 = { sit: true, facing: 0 };
    linkNodes(nodes, "lounge_center", "lounge_spot0");

    addNode(nodes, "lounge_spot1", 5.4, y, 6.2);
    sitTargets.lounge_spot1 = { sit: true, facing: Math.PI / 2 };
    linkNodes(nodes, "lounge_center", "lounge_spot1");

    addNode(nodes, "lounge_spot2", 9.0, y, 6.2);
    sitTargets.lounge_spot2 = { sit: true, facing: -Math.PI / 2 };
    linkNodes(nodes, "lounge_center", "lounge_spot2");

    addNode(nodes, "water_cooler", 9.3, y, 4.4);
    sitTargets.water_cooler = { sit: false, facing: Math.PI / 2 };
    linkNodes(nodes, "lounge_center", "water_cooler");

    addNode(nodes, "hall_stand_N", 0, y, -2.1);
    sitTargets.hall_stand_N = { sit: false, facing: 0 };
    linkNodes(nodes, "hallN", "hall_stand_N");

    addNode(nodes, "hall_stand_S", 1.8, y, 2.3);
    sitTargets.hall_stand_S = { sit: false, facing: Math.PI };
    linkNodes(nodes, "hallSE", "hall_stand_S");

    return { nodes: nodes, sitTargets: sitTargets, desks: desks };
}

function buildLobbyFloor(floorGroup, y) {
    const nodes = {};
    const sitTargets = {};
    buildHallwayRing(nodes, y);

    addNode(nodes, "outside", 0, y, 12.0);
    addNode(nodes, "front_door_threshold", 0, y, 9.35);
    addNode(nodes, "entrance", 0, y, 7.4);
    addNode(nodes, "lobby_center", 0, y, 4.6);

    linkNodes(nodes, "outside", "front_door_threshold");
    linkNodes(nodes, "front_door_threshold", "entrance");
    linkNodes(nodes, "entrance", "lobby_center");
    linkNodes(nodes, "lobby_center", "elevWait");
    linkNodes(nodes, "entrance", "elevWait");
    linkNodes(nodes, "lobby_center", "hallS");
    linkNodes(nodes, "lobby_center", "hallSW");
    linkNodes(nodes, "lobby_center", "hallSE");

    const sidewalk = new THREE.Mesh(
        new THREE.BoxGeometry(26, 0.16, 6),
        new THREE.MeshLambertMaterial({ color: 0x94a3b8 })
    );
    sidewalk.position.set(0, -0.08, 12.2);
    floorGroup.add(sidewalk);

    const glassDoorMat = new THREE.MeshLambertMaterial({
        color: 0xbae6fd,
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
        side: THREE.DoubleSide
    });
    const doorL = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.6, 0.08), glassDoorMat);
    doorL.position.set(-2.0, 1.3, 9.05);
    const doorR = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.6, 0.08), glassDoorMat);
    doorR.position.set(2.0, 1.3, 9.05);
    floorGroup.add(doorL);
    floorGroup.add(doorR);

    const plantL = createPlant();
    plantL.position.set(-2.3, 0, 8.2);
    const plantR = createPlant();
    plantR.position.set(2.3, 0, 8.2);
    floorGroup.add(plantL);
    floorGroup.add(plantR);

    const counter = new THREE.Mesh(
        new THREE.BoxGeometry(1.1, 1.0, 4.8),
        new THREE.MeshLambertMaterial({ color: 0x78350f })
    );
    counter.position.set(-9.8, 0.5, 4.2);
    floorGroup.add(counter);
    const counterTop = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 0.1, 4.9),
        new THREE.MeshLambertMaterial({ color: 0x292524 })
    );
    counterTop.position.set(-9.8, 1.05, 4.2);
    floorGroup.add(counterTop);
    const coffeeMachine = new THREE.Mesh(
        new THREE.BoxGeometry(0.45, 0.45, 0.5),
        new THREE.MeshLambertMaterial({ color: 0x334155 })
    );
    coffeeMachine.position.set(-9.8, 1.32, 3.0);
    floorGroup.add(coffeeMachine);
    const pastryDisplay = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.38, 0.9),
        new THREE.MeshLambertMaterial({ color: 0xfde68a, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide })
    );
    pastryDisplay.position.set(-9.8, 1.28, 4.8);
    floorGroup.add(pastryDisplay);

    addNode(nodes, "cafe_door", -4.8, y, 4.2);
    linkNodes(nodes, "cafe_door", "hallSW");
    linkNodes(nodes, "cafe_door", "lobby_center");
    addNode(nodes, "cafe_order", -8.6, y, 4.2);
    sitTargets.cafe_order = { sit: false, facing: -Math.PI / 2 };
    linkNodes(nodes, "cafe_door", "cafe_order");

    return buildLobbyAmenities(floorGroup, y, nodes, sitTargets);
}

function buildLobbyAmenities(floorGroup, y, nodes, sitTargets) {
    const bistroCoords = [
        { x: -6.8, z: 2.6 },
        { x: -6.8, z: 5.8 },
        { x: -4.6, z: 2.6 },
        { x: -4.6, z: 5.8 }
    ];
    const cafeSpots = [];
    for (let i = 0; i < bistroCoords.length; i++) {
        const bc = bistroCoords[i];
        const tbl = new THREE.Mesh(
            new THREE.CylinderGeometry(0.45, 0.45, 0.72, 12),
            new THREE.MeshLambertMaterial({ color: 0xd6d3d1 })
        );
        tbl.position.set(bc.x, 0.36, bc.z);
        floorGroup.add(tbl);

        const cN = createChair(0xb45309, 0);
        cN.position.set(bc.x, 0, bc.z - 0.72);
        floorGroup.add(cN);
        const wpN = "bistro_" + i + "_N";
        addNode(nodes, wpN, bc.x, y, bc.z - 0.72);
        sitTargets[wpN] = { sit: true, facing: 0 };
        linkNodes(nodes, "cafe_door", wpN);
        cafeSpots.push(wpN);

        const cS = createChair(0xb45309, Math.PI);
        cS.position.set(bc.x, 0, bc.z + 0.72);
        floorGroup.add(cS);
        const wpS = "bistro_" + i + "_S";
        addNode(nodes, wpS, bc.x, y, bc.z + 0.72);
        sitTargets[wpS] = { sit: true, facing: Math.PI };
        linkNodes(nodes, "cafe_door", wpS);
        cafeSpots.push(wpS);
    }

    addNode(nodes, "lounge_door", 4.6, y, 4.8);
    linkNodes(nodes, "lounge_door", "hallSE");
    linkNodes(nodes, "lounge_door", "lobby_center");

    const fCouch = createCouch(2.2, 0x0284c7, 0);
    fCouch.position.set(7.4, 0, 4.2);
    floorGroup.add(fCouch);
    addNode(nodes, "lounge_spot0", 7.4, y, 4.2);
    sitTargets.lounge_spot0 = { sit: true, facing: 0 };
    linkNodes(nodes, "lounge_door", "lounge_spot0");

    const fTable = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.4, 0.7), new THREE.MeshLambertMaterial({ color: 0x7c2d12 }));
    fTable.position.set(7.4, 0.2, 5.5);
    floorGroup.add(fTable);

    const fArm1 = createCouch(0.9, 0x0369a1, Math.PI / 2);
    fArm1.position.set(5.6, 0, 5.8);
    floorGroup.add(fArm1);
    addNode(nodes, "lounge_spot1", 5.6, y, 5.8);
    sitTargets.lounge_spot1 = { sit: true, facing: Math.PI / 2 };
    linkNodes(nodes, "lounge_door", "lounge_spot1");

    const fArm2 = createCouch(0.9, 0x0369a1, -Math.PI / 2);
    fArm2.position.set(9.2, 0, 5.8);
    floorGroup.add(fArm2);
    addNode(nodes, "lounge_spot2", 9.2, y, 5.8);
    sitTargets.lounge_spot2 = { sit: true, facing: -Math.PI / 2 };
    linkNodes(nodes, "lounge_door", "lounge_spot2");

    return buildLobbyBackAndExtras(floorGroup, y, nodes, sitTargets, cafeSpots);
}

function buildLobbyBackAndExtras(floorGroup, y, nodes, sitTargets, cafeSpots) {
    const bCouchN = createCouch(2.2, 0x4f46e5, 0);
    bCouchN.position.set(6.8, 0, -6.6);
    floorGroup.add(bCouchN);
    addNode(nodes, "back_lounge_N", 6.8, y, -6.6);
    sitTargets.back_lounge_N = { sit: true, facing: 0 };
    linkNodes(nodes, "hallNE", "back_lounge_N");

    const bTable = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.4, 0.7), new THREE.MeshLambertMaterial({ color: 0x7c2d12 }));
    bTable.position.set(6.8, 0.2, -5.2);
    floorGroup.add(bTable);

    const bCouchS = createCouch(2.2, 0x4f46e5, Math.PI);
    bCouchS.position.set(6.8, 0, -3.8);
    floorGroup.add(bCouchS);
    addNode(nodes, "back_lounge_S", 6.8, y, -3.8);
    sitTargets.back_lounge_S = { sit: true, facing: Math.PI };
    linkNodes(nodes, "hallNE", "back_lounge_S");

    const pitTable = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.65, 0.42, 14), new THREE.MeshLambertMaterial({ color: 0x78350f }));
    pitTable.position.set(-6.8, 0.21, -5.2);
    floorGroup.add(pitTable);

    const pitChairs = [
        { name: "pit_N", x: -6.8, z: -6.4, facing: 0 },
        { name: "pit_S", x: -6.8, z: -4.0, facing: Math.PI },
        { name: "pit_W", x: -8.0, z: -5.2, facing: Math.PI / 2 },
        { name: "pit_E", x: -5.6, z: -5.2, facing: -Math.PI / 2 }
    ];
    for (let i = 0; i < pitChairs.length; i++) {
        const pc = pitChairs[i];
        const ch = createCouch(0.85, 0x0d9488, pc.facing);
        ch.position.set(pc.x, 0, pc.z);
        floorGroup.add(ch);
        addNode(nodes, pc.name, pc.x, y, pc.z);
        sitTargets[pc.name] = { sit: true, facing: pc.facing };
        linkNodes(nodes, "hallNW", pc.name);
    }

    const recDesk = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.95, 0.7), new THREE.MeshLambertMaterial({ color: 0x475569 }));
    recDesk.position.set(-3.2, 0.475, 6.4);
    floorGroup.add(recDesk);
    addNode(nodes, "reception", -3.2, y, 5.4);
    sitTargets.reception = { sit: false, facing: 0 };
    linkNodes(nodes, "lobby_center", "reception");

    const kiosk = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.35, 0.35), new THREE.MeshLambertMaterial({ color: 0x0284c7 }));
    kiosk.position.set(2.8, 0.675, 6.8);
    floorGroup.add(kiosk);
    addNode(nodes, "kiosk", 2.3, y, 6.8);
    sitTargets.kiosk = { sit: false, facing: Math.PI / 2 };
    linkNodes(nodes, "entrance", "kiosk");
    linkNodes(nodes, "lobby_center", "kiosk");

    const wcF = createWaterCooler();
    wcF.position.set(9.8, 0, 2.2);
    floorGroup.add(wcF);
    addNode(nodes, "lobby_wc_front", 9.1, y, 2.2);
    sitTargets.lobby_wc_front = { sit: false, facing: Math.PI / 2 };
    linkNodes(nodes, "hallE", "lobby_wc_front");

    const wcB = createWaterCooler();
    wcB.position.set(-9.8, 0, -2.2);
    floorGroup.add(wcB);
    addNode(nodes, "lobby_wc_back", -9.1, y, -2.2);
    sitTargets.lobby_wc_back = { sit: false, facing: -Math.PI / 2 };
    linkNodes(nodes, "hallW", "lobby_wc_back");

    const loiters = [
        { name: "lobby_stand_center", x: 1.6, z: 4.2, link: "lobby_center" },
        { name: "lobby_stand_NE", x: 4.2, z: -2.2, link: "hallNE" },
        { name: "lobby_stand_NW", x: -4.2, z: -2.2, link: "hallNW" },
        { name: "lobby_stand_midE", x: 4.2, z: 1.2, link: "hallE" },
        { name: "lobby_stand_midW", x: -3.6, z: 1.2, link: "hallW" },
        { name: "lobby_stand_entry", x: 1.7, z: 7.2, link: "entrance" }
    ];
    for (let i = 0; i < loiters.length; i++) {
        const lt = loiters[i];
        addNode(nodes, lt.name, lt.x, y, lt.z);
        sitTargets[lt.name] = { sit: false, facing: (i * 1.1) % (Math.PI * 2) };
        linkNodes(nodes, lt.link, lt.name);
    }

    return { nodes: nodes, sitTargets: sitTargets, desks: [], cafeSpots: cafeSpots, entranceSpot: "outside" };
}

function buildBuildingShell(buildingGroup) {
    const W = WORLD.BUILDING_WIDTH;
    const D = WORLD.BUILDING_DEPTH;
    const H = WORLD.FLOOR_HEIGHT;
    const N = WORLD.FLOOR_COUNT;
    const totalH = H * N;

    const solidMat = new THREE.MeshLambertMaterial({ color: 0x64748b });
    const ground = new THREE.Mesh(new THREE.BoxGeometry(W, 0.2, D), solidMat);
    ground.position.set(0, -0.1, 0);
    buildingGroup.add(ground);

    const roof = new THREE.Mesh(new THREE.BoxGeometry(W, 0.16, D), solidMat);
    roof.position.set(0, totalH + 0.08, 0);
    buildingGroup.add(roof);

    const slabMat = new THREE.MeshLambertMaterial({
        color: 0x94a3b8, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide
    });
    for (let f = 1; f < N; f++) {
        const y = f * H;
        const backStrip = new THREE.Mesh(new THREE.BoxGeometry(W, 0.1, 7.5), slabMat);
        backStrip.position.set(0, y, -5.25);
        const frontStrip = new THREE.Mesh(new THREE.BoxGeometry(W, 0.1, 7.5), slabMat);
        frontStrip.position.set(0, y, 5.25);
        const leftStrip = new THREE.Mesh(new THREE.BoxGeometry(9.5, 0.1, 3.0), slabMat);
        leftStrip.position.set(-6.25, y, 0);
        const rightStrip = new THREE.Mesh(new THREE.BoxGeometry(9.5, 0.1, 3.0), slabMat);
        rightStrip.position.set(6.25, y, 0);
        buildingGroup.add(backStrip, frontStrip, leftStrip, rightStrip);
    }

    const outerMat = new THREE.MeshLambertMaterial({
        color: 0x9999ff, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide
    });
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(W, totalH, 0.12), outerMat);
    backWall.position.set(0, totalH / 2, -D / 2);
    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.12, totalH, D), outerMat);
    leftWall.position.set(-W / 2, totalH / 2, 0);
    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.12, totalH, D), outerMat);
    rightWall.position.set(W / 2, totalH / 2, 0);
    buildingGroup.add(backWall, leftWall, rightWall);

    const sideW = (W - 3.0) / 2;
    const frontLeft = new THREE.Mesh(new THREE.BoxGeometry(sideW, totalH, 0.12), outerMat);
    frontLeft.position.set(-1.5 - sideW / 2, totalH / 2, D / 2);
    const frontRight = new THREE.Mesh(new THREE.BoxGeometry(sideW, totalH, 0.12), outerMat);
    frontRight.position.set(1.5 + sideW / 2, totalH / 2, D / 2);
    const upperH = totalH - H;
    const frontUpper = new THREE.Mesh(new THREE.BoxGeometry(3.0, upperH, 0.12), outerMat);
    frontUpper.position.set(0, H + upperH / 2, D / 2);
    buildingGroup.add(frontLeft, frontRight, frontUpper);
}

function createWorld(scene) {
    const buildingGroup = new THREE.Group();
    buildingGroup.renderOrder = 0;
    buildBuildingShell(buildingGroup);

    const intWallMat = new THREE.MeshLambertMaterial({
        color: 0xbbc5e6, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide
    });
    const floors = [];
    for (let f = 0; f < WORLD.FLOOR_COUNT; f++) {
        const y = f * WORLD.FLOOR_HEIGHT;
        const floorGroup = new THREE.Group();
        floorGroup.position.set(0, y, 0);
        buildingGroup.add(floorGroup);

        const layout = f === 0 ? buildLobbyFloor(floorGroup, y) : buildOfficeFloor(floorGroup, f, y, intWallMat);
        const callPanel = createCallPanel();
        callPanel.position.set(1.95, 1.35, 1.55);
        floorGroup.add(callPanel);

        const shaftIndicator = createTextIndicator(0.9, "0");
        shaftIndicator.position.set(0, 2.75, 1.56);
        floorGroup.add(shaftIndicator);

        floors.push(Object.assign({ floorNumber: f, callPanel: callPanel, shaftIndicator: shaftIndicator }, layout));
    }

    buildingGroup.traverse((obj) => {
        if (obj.isMesh) obj.renderOrder = 0;
    });
    scene.add(buildingGroup);
    return { buildingGroup: buildingGroup, floors: floors, bfsPath: bfsPath };
}

window.createWorld = createWorld;
window.bfsPath = bfsPath;








