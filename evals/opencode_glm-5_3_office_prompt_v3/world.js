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
    if (tex._lastText === text) return;
    const ctx = tex._ctx;
    ctx.clearRect(0, 0, 256, 256);
    ctx.fillStyle = "#050505";
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = "#ffbb22";
    ctx.shadowColor = "#ff9900";
    ctx.shadowBlur = 26;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    let size = 200;
    if (text.length === 2) size = 150;
    else if (text.length >= 3) size = 115;
    ctx.font = "bold " + size + "px 'Consolas', 'Courier New', monospace";
    ctx.fillText(text, 128, 136);
    tex._lastText = text;
    tex.needsUpdate = true;
}

function makeTextTexture(initialText) {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = 8;
    tex._canvas = canvas;
    tex._ctx = ctx;
    tex._lastText = null;
    updateTextTexture(tex, initialText);
    return tex;
}

function makeIndicatorMesh(width, height, initialText) {
    const tex = makeTextTexture(initialText);
    const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
    mesh.renderOrder = 1;
    mesh.userData.setIndicator = function (text) {
        updateTextTexture(tex, text);
    };
    return mesh;
}

function bfsPath(nodes, fromName, toName) {
    const result = [];
    if (!nodes[fromName] || !nodes[toName]) return result;
    if (fromName === toName) {
        const n = nodes[toName];
        result.push(new THREE.Vector3(n.x, n.y, n.z));
        return result;
    }
    const visited = new Set();
    visited.add(fromName);
    const queue = [];
    queue.push([fromName]);
    while (queue.length > 0) {
        const path = queue.shift();
        const last = path[path.length - 1];
        const links = nodes[last].links;
        for (let i = 0; i < links.length; i++) {
            const next = links[i];
            if (visited.has(next)) continue;
            const newPath = path.concat([next]);
            if (next === toName) {
                for (let j = 0; j < newPath.length; j++) {
                    const nd = nodes[newPath[j]];
                    result.push(new THREE.Vector3(nd.x, nd.y, nd.z));
                }
                return result;
            }
            visited.add(next);
            queue.push(newPath);
        }
    }
    return result;
}

function createWorld(scene) {
    const FH = WORLD.FLOOR_HEIGHT;
    const halfW = WORLD.BUILDING_WIDTH / 2;
    const halfD = WORLD.BUILDING_DEPTH / 2;
    const buildingGroup = new THREE.Group();
    buildingGroup.renderOrder = 0;
    scene.add(buildingGroup);

    const matSlab = new THREE.MeshLambertMaterial({ color: 0x9aa2b0, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide });
    const matGroundSlab = new THREE.MeshLambertMaterial({ color: 0x878d99 });
    const matOuter = new THREE.MeshLambertMaterial({ color: 0x9999ff, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide });
    const matInner = new THREE.MeshLambertMaterial({ color: 0xbbc5e6, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide });
    const matShaft = new THREE.MeshLambertMaterial({ color: 0x9fb0c8, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide });
    const matLawn = new THREE.MeshLambertMaterial({ color: 0x39473c });
    const matSidewalk = new THREE.MeshLambertMaterial({ color: 0x8a8a92 });
    const matWood = new THREE.MeshLambertMaterial({ color: 0x8b6f47 });
    const matWoodDark = new THREE.MeshLambertMaterial({ color: 0x6e5436 });
    const matSeat = new THREE.MeshLambertMaterial({ color: 0x3d5a80 });
    const matSeatWarm = new THREE.MeshLambertMaterial({ color: 0xa0522d });
    const matMetal = new THREE.MeshLambertMaterial({ color: 0x7f8c8d });
    const matDark = new THREE.MeshLambertMaterial({ color: 0x2f3542 });
    const matScreen = new THREE.MeshLambertMaterial({ color: 0x1c2530 });
    const matGlass = new THREE.MeshLambertMaterial({ color: 0xbfe3ff, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide });
    const matLeaf = new THREE.MeshLambertMaterial({ color: 0x2e8b57 });
    const matPot = new THREE.MeshLambertMaterial({ color: 0xa9503c });
    const matWater = new THREE.MeshLambertMaterial({ color: 0x5db7e8, transparent: true, opacity: 0.7, depthWrite: false });
    const matCounter = new THREE.MeshLambertMaterial({ color: 0x5d4a66 });
    const matCounterTop = new THREE.MeshLambertMaterial({ color: 0x30293a });

    function addBox(parent, w, h, d, mat, x, y, z) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        m.position.set(x, y, z);
        parent.add(m);
        return m;
    }

    function addCyl(parent, rTop, rBot, h, mat, x, y, z, seg) {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg || 10), mat);
        m.position.set(x, y, z);
        parent.add(m);
        return m;
    }

    function place(parent, x, z, floorY, rotY) {
        parent.position.set(x, floorY, z);
        parent.rotation.y = rotY || 0;
        buildingGroup.add(parent);
        return parent;
    }

    function buildChair() {
        const g = new THREE.Group();
        addBox(g, 0.5, 0.07, 0.5, matSeat, 0, 0.51, 0);
        addBox(g, 0.5, 0.55, 0.06, matSeat, 0, 0.82, -0.24);
        addBox(g, 0.05, 0.51, 0.05, matMetal, -0.21, 0.255, 0.21);
        addBox(g, 0.05, 0.51, 0.05, matMetal, 0.21, 0.255, 0.21);
        addBox(g, 0.05, 0.51, 0.05, matMetal, -0.21, 0.255, -0.21);
        addBox(g, 0.05, 0.51, 0.05, matMetal, 0.21, 0.255, -0.21);
        return g;
    }

    function buildArmchair() {
        const g = new THREE.Group();
        addBox(g, 0.7, 0.1, 0.62, matSeatWarm, 0, 0.5, 0);
        addBox(g, 0.7, 0.6, 0.09, matSeatWarm, 0, 0.82, -0.27);
        addBox(g, 0.09, 0.6, 0.62, matSeatWarm, -0.31, 0.55, 0);
        addBox(g, 0.09, 0.6, 0.62, matSeatWarm, 0.31, 0.55, 0);
        addBox(g, 0.07, 0.5, 0.07, matMetal, -0.26, 0.25, 0.24);
        addBox(g, 0.07, 0.5, 0.07, matMetal, 0.26, 0.25, 0.24);
        addBox(g, 0.07, 0.5, 0.07, matMetal, -0.26, 0.25, -0.24);
        addBox(g, 0.07, 0.5, 0.07, matMetal, 0.26, 0.25, -0.24);
        return g;
    }

    function buildCouch() {
        const g = new THREE.Group();
        addBox(g, 2.2, 0.42, 0.85, matSeat, 0, 0.24, 0);
        addBox(g, 2.2, 0.55, 0.22, matSeat, 0, 0.72, -0.31);
        addBox(g, 0.22, 0.6, 0.85, matSeat, -0.99, 0.35, 0);
        addBox(g, 0.22, 0.6, 0.85, matSeat, 0.99, 0.35, 0);
        return g;
    }

    function buildDesk() {
        const g = new THREE.Group();
        addBox(g, 1.8, 0.07, 0.8, matWood, 0, 0.74, 0);
        addBox(g, 0.06, 0.7, 0.75, matWoodDark, -0.85, 0.35, 0);
        addBox(g, 0.06, 0.7, 0.75, matWoodDark, 0.85, 0.35, 0);
        addBox(g, 0.55, 0.34, 0.05, matScreen, 0, 1.15, -0.28);
        addBox(g, 0.08, 0.22, 0.08, matDark, 0, 0.89, -0.28);
        addBox(g, 0.3, 0.04, 0.2, matDark, 0, 0.79, -0.28);
        return g;
    }

    function buildTable(w, d) {
        const g = new THREE.Group();
        addBox(g, w, 0.07, d, matWood, 0, 0.72, 0);
        addBox(g, 0.07, 0.7, 0.07, matWoodDark, -w / 2 + 0.1, 0.36, -d / 2 + 0.1);
        addBox(g, 0.07, 0.7, 0.07, matWoodDark, w / 2 - 0.1, 0.36, -d / 2 + 0.1);
        addBox(g, 0.07, 0.7, 0.07, matWoodDark, -w / 2 + 0.1, 0.36, d / 2 - 0.1);
        addBox(g, 0.07, 0.7, 0.07, matWoodDark, w / 2 - 0.1, 0.36, d / 2 - 0.1);
        return g;
    }

    function buildRoundTable(r) {
        const g = new THREE.Group();
        addCyl(g, r, r, 0.05, matWood, 0, 0.72, 0, 16);
        addCyl(g, 0.06, 0.06, 0.7, matMetal, 0, 0.36, 0, 8);
        addCyl(g, 0.3, 0.3, 0.04, matMetal, 0, 0.02, 0, 12);
        return g;
    }

    function buildPlant() {
        const g = new THREE.Group();
        addCyl(g, 0.26, 0.2, 0.36, matPot, 0, 0.18, 0, 10);
        addCyl(g, 0.05, 0.06, 0.5, matWoodDark, 0, 0.6, 0, 6);
        const foliage = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 8), matLeaf);
        foliage.position.y = 1.0;
        g.add(foliage);
        return g;
    }

    function buildCooler() {
        const g = new THREE.Group();
        addBox(g, 0.38, 1.0, 0.38, matMetal, 0, 0.5, 0);
        addCyl(g, 0.16, 0.16, 0.42, matWater, 0, 1.22, 0, 10);
        return g;
    }

    function buildSlabStrips(f, mat) {
        const yTop = f * FH;
        const yc = yTop - 0.125;
        addBox(buildingGroup, 22, 0.25, 7.5, mat, 0, yc, 5.25);
        addBox(buildingGroup, 22, 0.25, 7.5, mat, 0, yc, -5.25);
        addBox(buildingGroup, 9.5, 0.25, 3, mat, -6.25, yc, 0);
        addBox(buildingGroup, 9.5, 0.25, 3, mat, 6.25, yc, 0);
    }

    function buildOuterWalls(f) {
        const yc = f * FH + FH / 2;
        addBox(buildingGroup, 22, FH, 0.25, matOuter, 0, yc, -halfD);
        addBox(buildingGroup, 0.25, FH, 18, matOuter, -halfW, yc, 0);
        addBox(buildingGroup, 0.25, FH, 18, matOuter, halfW, yc, 0);
        if (f === 0) {
            addBox(buildingGroup, 9.5, FH, 0.25, matOuter, -6.25, yc, halfD);
            addBox(buildingGroup, 9.5, FH, 0.25, matOuter, 6.25, yc, halfD);
        } else {
            addBox(buildingGroup, 22, FH, 0.25, matOuter, 0, yc, halfD);
        }
    }

    function buildShaft(f) {
        const yBase = f * FH;
        const yc = yBase + FH / 2;
        addBox(buildingGroup, 3, FH, 0.15, matShaft, 0, yc, -1.5);
        addBox(buildingGroup, 0.15, FH, 3, matShaft, -1.5, yc, 0);
        addBox(buildingGroup, 0.15, FH, 3, matShaft, 1.5, yc, 0);
        addBox(buildingGroup, 0.7, FH, 0.15, matShaft, -1.15, yc, 1.5);
        addBox(buildingGroup, 0.7, FH, 0.15, matShaft, 1.15, yc, 1.5);
        addBox(buildingGroup, 1.6, 1.2, 0.15, matShaft, 0, yBase + 2.8, 1.5);
    }

    function buildCallPanel(floorY) {
        const g = new THREE.Group();
        g.position.set(1.15, floorY + 1.35, 1.6);
        addBox(g, 0.55, 1.4, 0.05, matDark, 0, 0, 0);
        const shape = new THREE.Shape();
        shape.moveTo(0, 0.11);
        shape.lineTo(-0.13, -0.08);
        shape.lineTo(0.13, -0.08);
        shape.lineTo(0, 0.11);
        const lampOff = new THREE.MeshBasicMaterial({ color: 0x2a2f2a });
        const lampOn = new THREE.MeshBasicMaterial({ color: 0x39ff6a });
        const upMesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), lampOff);
        upMesh.position.set(0, 0.42, 0.035);
        g.add(upMesh);
        const downMesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), lampOff);
        downMesh.position.set(0, 0.12, 0.035);
        downMesh.rotation.z = Math.PI;
        g.add(downMesh);
        const display = makeIndicatorMesh(0.45, 0.45, "0");
        display.position.set(0, -0.35, 0.035);
        g.add(display);
        g.userData.setUp = function (on) {
            upMesh.material = on ? lampOn : lampOff;
        };
        g.userData.setDown = function (on) {
            downMesh.material = on ? lampOn : lampOff;
        };
        g.userData.setIndicator = function (text) {
            display.userData.setIndicator(text);
        };
        buildingGroup.add(g);
        return g;
    }

    function buildOfficeFloor(f, nodes, sitTargets) {
        const yBase = f * FH;
        const yc = yBase + FH / 2;
        const dividers = [-5.5, 0, 5.5];
        for (let i = 0; i < dividers.length; i++) {
            addBox(buildingGroup, 0.2, FH, 6, matInner, dividers[i], yc, -6);
        }
        const centers = [-8.25, -2.75, 2.75, 8.25];
        const letters = ["A", "B", "C", "D"];
        for (let i = 0; i < centers.length; i++) {
            const c = centers[i];
            const oLeft = i === 0 ? -11 : dividers[i - 1];
            const oRight = i === 3 ? 11 : dividers[i];
            const leftW = (c - 0.6) - oLeft;
            addBox(buildingGroup, leftW, FH, 0.2, matInner, oLeft + leftW / 2, yc, -3);
            const rightW = oRight - (c + 0.6);
            addBox(buildingGroup, rightW, FH, 0.2, matInner, c + 0.6 + rightW / 2, yc, -3);
            place(buildDesk(), c, -7.5, yBase, 0);
            place(buildChair(), c, -6.65, yBase, Math.PI);
            const plant = buildPlant();
            place(plant, c + (i % 2 === 0 ? 1.9 : -1.9), -8.3, yBase, 0);
        }
        addBox(buildingGroup, 0.2, FH, 6, matInner, -3, yc, 6);
        addBox(buildingGroup, 6.4, FH, 0.2, matInner, -7.8, yc, 3);
        addBox(buildingGroup, 0.4, FH, 0.2, matInner, -3.2, yc, 3);
        addBox(buildingGroup, 0.2, FH, 6, matInner, 3, yc, 6);
        addBox(buildingGroup, 0.4, FH, 0.2, matInner, 3.2, yc, 3);
        addBox(buildingGroup, 6.4, FH, 0.2, matInner, 7.8, yc, 3);

        place(buildTable(5, 1.8), -7, 6, yBase, 0);
        place(buildChair(), -8.25, 7.5, yBase, Math.PI);
        place(buildChair(), -5.75, 7.5, yBase, Math.PI);
        place(buildChair(), -8.25, 4.5, yBase, 0);
        place(buildChair(), -5.75, 4.5, yBase, 0);

        place(buildCouch(), 9.9, 6, yBase, -Math.PI / 2);
        place(buildTable(1.1, 0.65), 8.3, 6, yBase, 0);
        place(buildArmchair(), 6.6, 7.3, yBase, Math.PI / 2);
        place(buildArmchair(), 6.6, 4.7, yBase, Math.PI / 2);
        place(buildCooler(), 4.2, 8.3, yBase, 0);
        place(buildPlant(), 10.2, 8.3, yBase, 0);

        const y = yBase;
        function A(name, x, z) {
            nodes[name] = { name: name, x: x, y: y, z: z, links: [] };
        }
        function L(a, b) {
            nodes[a].links.push(b);
            nodes[b].links.push(a);
        }
        function S(name, x, z, sit, facing) {
            sitTargets[name] = { sit: sit, x: x, z: z, facing: facing };
        }
        A("elevWait", 0, 2.3);
        A("hallS", 0, 2.6); A("hallSE", 3.5, 2.6); A("hallE", 3.5, 0); A("hallNE", 3.5, -2.6);
        A("hallN", 0, -2.6); A("hallNW", -3.5, -2.6); A("hallW", -3.5, 0); A("hallSW", -3.5, 2.6);
        L("hallS", "hallSE"); L("hallSE", "hallE"); L("hallE", "hallNE"); L("hallNE", "hallN");
        L("hallN", "hallNW"); L("hallNW", "hallW"); L("hallW", "hallSW"); L("hallSW", "hallS");
        L("elevWait", "hallS");
        for (let i = 0; i < 4; i++) {
            const door = "office" + letters[i] + "_door";
            const desk = "office" + letters[i] + "_desk";
            A(door, centers[i], -3.0);
            A(desk, centers[i], -6.65);
            L(door, desk);
            if (i === 0) L(door, "hallNW");
            else if (i === 3) L(door, "hallNE");
            else L(door, "hallN");
            S(desk, centers[i], -6.65, true, Math.PI);
            S(door, centers[i], -2.45, false, Math.PI);
        }
        A("conf_door", -4.0, 3.0);
        L("conf_door", "hallSW");
        A("conf_center", -7, 6);
        L("conf_door", "conf_center");
        A("conf_seat0", -8.25, 7.5); A("conf_seat1", -5.75, 7.5);
        A("conf_seat2", -8.25, 4.5); A("conf_seat3", -5.75, 4.5);
        L("conf_seat0", "conf_center"); L("conf_seat1", "conf_center");
        L("conf_seat2", "conf_center"); L("conf_seat3", "conf_center");
        S("conf_seat0", -8.25, 7.5, true, Math.PI);
        S("conf_seat1", -5.75, 7.5, true, Math.PI);
        S("conf_seat2", -8.25, 4.5, true, 0);
        S("conf_seat3", -5.75, 4.5, true, 0);
        A("lounge_door", 4.0, 3.0);
        L("lounge_door", "hallSE");
        A("lounge_center", 7, 6);
        L("lounge_door", "lounge_center");
        A("lounge_spot0", 9.75, 6); A("lounge_spot1", 6.6, 7.3); A("lounge_spot2", 6.6, 4.7);
        L("lounge_spot0", "lounge_center"); L("lounge_spot1", "lounge_center"); L("lounge_spot2", "lounge_center");
        S("lounge_spot0", 9.75, 6, true, -Math.PI / 2);
        S("lounge_spot1", 6.6, 7.3, true, Math.PI / 2);
        S("lounge_spot2", 6.6, 4.7, true, Math.PI / 2);
        A("water_cooler", 4.9, 8.0);
        L("water_cooler", "lounge_center");
        S("water_cooler", 4.9, 8.0, false, -Math.PI / 2);
        A("hall_stand_N", -5.5, -2.6);
        L("hall_stand_N", "hallNW");
        S("hall_stand_N", -5.5, -2.6, false, Math.PI);
        A("hall_stand_S", 5.5, -2.6);
        L("hall_stand_S", "hallNE");
        S("hall_stand_S", 5.5, -2.6, false, Math.PI);
    }

    function buildLobby(nodes, sitTargets) {
        const y = 0;
        function A(name, x, z) {
            nodes[name] = { name: name, x: x, y: y, z: z, links: [] };
        }
        function L(a, b) {
            nodes[a].links.push(b);
            nodes[b].links.push(a);
        }
        function S(name, x, z, sit, facing) {
            sitTargets[name] = { sit: sit, x: x, z: z, facing: facing };
        }

        addBox(buildingGroup, 1.0, 0.95, 4.4, matCounter, -10.35, 0.475, 3.6);
        addBox(buildingGroup, 1.2, 0.06, 4.6, matCounterTop, -10.35, 0.98, 3.6);
        addBox(buildingGroup, 0.5, 0.42, 0.4, matDark, -10.3, 1.22, 5.1);
        addBox(buildingGroup, 0.55, 0.35, 0.8, matGlass, -10.3, 1.19, 2.6);

        place(buildRoundTable(0.55), -8, 6.8, 0, 0);
        place(buildChair(), -8.9, 6.8, 0, Math.PI / 2);
        place(buildChair(), -7.1, 6.8, 0, -Math.PI / 2);
        place(buildRoundTable(0.55), -8, 0.8, 0, 0);
        place(buildChair(), -8.9, 0.8, 0, Math.PI / 2);
        place(buildChair(), -7.1, 0.8, 0, -Math.PI / 2);
        place(buildRoundTable(0.55), -5, -1.5, 0, 0);
        place(buildChair(), -5, -0.5, 0, 0);
        place(buildChair(), -5, -2.5, 0, Math.PI);
        place(buildRoundTable(0.55), -1.5, -6.5, 0, 0);
        place(buildChair(), -1.5, -5.5, 0, Math.PI);
        place(buildChair(), -1.5, -7.5, 0, 0);

        place(buildCouch(), 8, 7.75, 0, Math.PI);
        place(buildTable(1.1, 0.65), 8, 6.5, 0, 0);
        place(buildArmchair(), 6.2, 6.6, 0, Math.PI / 2);
        place(buildArmchair(), 9.8, 6.6, 0, -Math.PI / 2);
        place(buildCooler(), 3.4, 8.4, 0, 0);
        place(buildPlant(), 10.3, 8.4, 0, 0);

        place(buildCouch(), -4, -4.9, 0, Math.PI);
        place(buildCouch(), -4, -7.1, 0, 0);
        place(buildTable(1.3, 0.7), -4, -6, 0, 0);

        place(buildRoundTable(0.75), -8.5, -6.5, 0, 0);
        place(buildArmchair(), -8.5, -5.4, 0, Math.PI);
        place(buildArmchair(), -8.5, -7.6, 0, 0);
        place(buildArmchair(), -7.4, -6.5, 0, -Math.PI / 2);
        place(buildArmchair(), -9.6, -6.5, 0, Math.PI / 2);

        addBox(buildingGroup, 1.7, 0.95, 0.7, matWood, -3.2, 0.475, 6.3);
        addBox(buildingGroup, 1.9, 0.06, 0.9, matWoodDark, -3.2, 0.98, 6.3);
        place(buildChair(), -3.2, 7.15, 0, 0);

        addBox(buildingGroup, 0.55, 1.5, 0.8, matDark, 2.2, 0.75, 8.5);
        addBox(buildingGroup, 0.5, 0.4, 0.06, matScreen, 2.2, 1.15, 8.11);
        place(buildCooler(), 5.5, -8.5, 0, 0);
        place(buildPlant(), -2.3, 8.6, 0, 0);
        place(buildPlant(), 10.2, -8.5, 0, 0);
        place(buildPlant(), -10.3, -8.5, 0, 0);

        const doorL = new THREE.Group();
        doorL.position.set(-1.3, 0, 9);
        addBox(doorL, 1.3, 2.2, 0.05, matGlass, 0.65, 1.1, 0);
        doorL.rotation.y = 1.2;
        buildingGroup.add(doorL);
        const doorR = new THREE.Group();
        doorR.position.set(1.3, 0, 9);
        addBox(doorR, 1.3, 2.2, 0.05, matGlass, -0.65, 1.1, 0);
        doorR.rotation.y = -1.2;
        buildingGroup.add(doorR);

        A("outside", 0, 12);
        A("front_door_threshold", 0, 9.35);
        A("entrance", 0, 7.4);
        A("lobby_center", 0, 5);
        A("elevWait", 0, 2.3);
        A("hallS", 0, 2.6); A("hallSE", 3.5, 2.6); A("hallE", 3.5, 0); A("hallNE", 3.5, -2.6);
        A("hallN", 0, -2.6); A("hallNW", -3.5, -2.6); A("hallW", -3.5, 0); A("hallSW", -3.5, 2.6);
        L("hallS", "hallSE"); L("hallSE", "hallE"); L("hallE", "hallNE"); L("hallNE", "hallN");
        L("hallN", "hallNW"); L("hallNW", "hallW"); L("hallW", "hallSW"); L("hallSW", "hallS");
        L("outside", "front_door_threshold");
        L("front_door_threshold", "entrance");
        L("entrance", "lobby_center");
        L("lobby_center", "elevWait");
        L("lobby_center", "hallS");
        L("elevWait", "hallS");
        A("kiosk", 1.4, 8.3); L("kiosk", "entrance");
        S("kiosk", 1.4, 8.3, false, Math.PI / 2);
        A("lobby_stand_entry", 2.8, 7.6); L("lobby_stand_entry", "entrance");
        S("lobby_stand_entry", 2.8, 7.6, false, Math.PI);
        A("lobby_wc_front", 3.4, 7.8); L("lobby_wc_front", "entrance");
        S("lobby_wc_front", 3.4, 7.8, false, 0);
        A("hub_FR", 7.5, 4.5); L("hub_FR", "hallSE"); L("hub_FR", "lobby_center");
        A("fl_couch", 8, 7.7); A("fl_chair1", 6.2, 6.6); A("fl_chair2", 9.8, 6.6);
        L("fl_couch", "hub_FR"); L("fl_chair1", "hub_FR"); L("fl_chair2", "hub_FR");
        S("fl_couch", 8, 7.7, true, Math.PI);
        S("fl_chair1", 6.2, 6.6, true, Math.PI / 2);
        S("fl_chair2", 9.8, 6.6, true, -Math.PI / 2);
        A("lobby_stand_midE", 9.5, 1); L("lobby_stand_midE", "hallSE");
        S("lobby_stand_midE", 9.5, 1, false, -Math.PI / 2);
        A("cafe_door", -5, 3.1); L("cafe_door", "hallSW");
        A("cafe_mid", -7.5, 3.2); L("cafe_mid", "cafe_door");
        A("cafe_order", -9.2, 3.9); L("cafe_order", "cafe_mid");
        S("cafe_order", -9.2, 3.9, false, -Math.PI / 2);
        A("hub_FL", -8, 5.2); L("hub_FL", "cafe_mid");
        A("bistro1a", -8.9, 6.8); A("bistro1b", -7.1, 6.8);
        L("bistro1a", "hub_FL"); L("bistro1b", "hub_FL");
        S("bistro1a", -8.9, 6.8, true, Math.PI / 2);
        S("bistro1b", -7.1, 6.8, true, -Math.PI / 2);
        A("cafe_south", -7.5, 0.8); L("cafe_south", "hallW");
        A("bistro2a", -8.9, 0.8); A("bistro2b", -7.1, 0.8);
        L("bistro2a", "cafe_south"); L("bistro2b", "cafe_south");
        S("bistro2a", -8.9, 0.8, true, Math.PI / 2);
        S("bistro2b", -7.1, 0.8, true, -Math.PI / 2);
        A("bistro3a", -5, -0.5); A("bistro3b", -5, -2.5);
        L("bistro3a", "hallW"); L("bistro3b", "hallW");
        S("bistro3a", -5, -0.5, true, 0);
        S("bistro3b", -5, -2.5, true, Math.PI);
        A("reception", -4.1, 6.0); L("reception", "hallSW"); L("reception", "lobby_center");
        S("reception", -4.1, 6.0, false, Math.PI / 2);
        A("lobby_stand_midW", -2.5, 3.4); L("lobby_stand_midW", "hallSW");
        S("lobby_stand_midW", -2.5, 3.4, false, Math.PI / 2);
        A("lobby_backC", 0, -5); L("lobby_backC", "hallN");
        A("lobby_stand_center", 1.5, -4.2); L("lobby_stand_center", "hallN"); L("lobby_stand_center", "lobby_backC");
        S("lobby_stand_center", 1.5, -4.2, false, Math.PI);
        A("pit_hub", -8.5, -4.0); L("pit_hub", "hallNW"); L("pit_hub", "lobby_backC");
        A("pit_N", -8.5, -5.4); A("pit_S", -8.5, -7.6); A("pit_E", -7.4, -6.5); A("pit_W", -9.6, -6.5);
        L("pit_N", "pit_hub"); L("pit_S", "pit_hub"); L("pit_E", "pit_hub"); L("pit_W", "pit_hub");
        S("pit_N", -8.5, -5.4, true, Math.PI);
        S("pit_S", -8.5, -7.6, true, 0);
        S("pit_E", -7.4, -6.5, true, -Math.PI / 2);
        S("pit_W", -9.6, -6.5, true, Math.PI / 2);
        A("lobby_stand_NW", -10, -2.5); L("lobby_stand_NW", "pit_hub");
        S("lobby_stand_NW", -10, -2.5, false, 0);
        A("bl_hub", -4, -3.8); L("bl_hub", "hallN"); L("bl_hub", "lobby_backC");
        A("back_lounge_N", -4, -4.95); A("back_lounge_S", -4, -7.05);
        L("back_lounge_N", "bl_hub"); L("back_lounge_S", "bl_hub");
        S("back_lounge_N", -4, -4.95, true, Math.PI);
        S("back_lounge_S", -4, -7.05, true, 0);
        A("bistro4a", -1.5, -5.5); A("bistro4b", -1.5, -7.5);
        L("bistro4a", "lobby_backC"); L("bistro4b", "lobby_backC");
        S("bistro4a", -1.5, -5.5, true, Math.PI);
        S("bistro4b", -1.5, -7.5, true, 0);
        A("lobby_backR", 5, -4.5); L("lobby_backR", "hallNE"); L("lobby_backR", "lobby_backC");
        A("lobby_stand_NE", 8, -5); L("lobby_stand_NE", "lobby_backR");
        S("lobby_stand_NE", 8, -5, false, Math.PI);
        A("lobby_wc_back", 5.5, -7.9); L("lobby_wc_back", "lobby_backR");
        S("lobby_wc_back", 5.5, -7.9, false, Math.PI);
    }

    const floors = [];
    for (let f = 0; f < WORLD.FLOOR_COUNT; f++) {
        const floorY = f * FH;
        buildSlabStrips(f, f === 0 ? matGroundSlab : matSlab);
        buildOuterWalls(f);
        buildShaft(f);
        const nodes = {};
        const sitTargets = {};
        if (f === 0) {
            buildLobby(nodes, sitTargets);
        } else {
            buildOfficeFloor(f, nodes, sitTargets);
        }
        const callPanel = buildCallPanel(floorY);
        const shaftIndicator = makeIndicatorMesh(0.9, 0.9, "0-");
        shaftIndicator.position.set(0, floorY + 2.8, 1.58);
        buildingGroup.add(shaftIndicator);
        floors.push({
            floorNumber: f,
            nodes: nodes,
            callPanel: callPanel,
            shaftIndicator: shaftIndicator,
            sitTargets: sitTargets,
            desks: f === 0 ? [] : ["officeA_desk", "officeB_desk", "officeC_desk", "officeD_desk"]
        });
    }

    buildSlabStrips(WORLD.FLOOR_COUNT, matGroundSlab);

    addBox(buildingGroup, 70, 0.3, 70, matLawn, 0, -0.3, 0);
    addBox(buildingGroup, 8, 0.25, 3.2, matSidewalk, 0, -0.125, 12);

    return {
        buildingGroup: buildingGroup,
        floors: floors,
        bfsPath: bfsPath
    };
}

window.WORLD = WORLD;
window.createWorld = createWorld;
window.bfsPath = bfsPath;
window.makeTextTexture = makeTextTexture;
window.makeIndicatorMesh = makeIndicatorMesh;
