const WORLD = {
    FLOOR_HEIGHT: 3.4,
    FLOOR_COUNT: 6,
    BUILDING_WIDTH: 22,
    BUILDING_DEPTH: 18,
    SHAFT_WIDTH: 3,
    SHAFT_DEPTH: 3,
    PERSON_R: 0.4
};

function bfsPath(nodes, fromName, toName) {
    const start = nodes[fromName];
    const goal = nodes[toName];
    if (!start || !goal) return null;
    if (fromName === toName) return [goal.pos.clone()];
    const parents = new Map();
    parents.set(fromName, null);
    const queue = [fromName];
    let found = false;
    while (queue.length > 0 && !found) {
        const current = queue.shift();
        const node = nodes[current];
        for (const nb of node.links) {
            if (parents.has(nb)) continue;
            parents.set(nb, current);
            if (nb === toName) { found = true; break; }
            queue.push(nb);
        }
    }
    if (!parents.has(toName)) return null;
    const chain = [];
    let step = toName;
    while (step !== null) {
        chain.push(step);
        step = parents.get(step);
    }
    chain.reverse();
    const pts = [];
    for (const name of chain) pts.push(nodes[name].pos.clone());
    return pts;
}

function makeTextTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = 4;
    function draw(text) {
        ctx.fillStyle = "#050505";
        ctx.fillRect(0, 0, 256, 256);
        ctx.fillStyle = "#ffbb22";
        ctx.shadowColor = "#ffbb22";
        ctx.shadowBlur = 26;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const label = String(text);
        let size = 210;
        while (size > 24) {
            ctx.font = "bold " + size + "px 'Courier New', monospace";
            if (ctx.measureText(label).width <= 256 * 0.82) break;
            size -= 12;
        }
        ctx.fillText(label, 128, 134);
        tex.needsUpdate = true;
    }
    return {
        texture: tex,
        update: function (text) {
            if (tex._lastText === text) return;
            tex._lastText = text;
            draw(text);
        }
    };
}

function createWorld(scene) {
    const FH = WORLD.FLOOR_HEIGHT;
    const buildingGroup = new THREE.Group();
    buildingGroup.renderOrder = 0;
    scene.add(buildingGroup);

    function matTrans(color, opacity) {
        return new THREE.MeshLambertMaterial({ color: color, transparent: true, opacity: opacity, depthWrite: false, side: THREE.DoubleSide });
    }
    const matGround = new THREE.MeshLambertMaterial({ color: 0x878b92 });
    const matSidewalk = new THREE.MeshLambertMaterial({ color: 0x9a9a94 });
    const matPlaza = new THREE.MeshLambertMaterial({ color: 0x39413c });
    const matRoof = new THREE.MeshLambertMaterial({ color: 0x767a81 });
    const matSlab = matTrans(0x9aa0ad, 0.3);
    const matOuter = matTrans(0x9999ff, 0.2);
    const matInner = matTrans(0xbbc5e6, 0.28);
    const matShaft = matTrans(0xaab4c8, 0.1);
    const matColumn = new THREE.MeshLambertMaterial({ color: 0x5c6270 });
    const matPanelBody = new THREE.MeshLambertMaterial({ color: 0x33383f });
    const matWood = new THREE.MeshLambertMaterial({ color: 0x9c7b52 });
    const matWoodDark = new THREE.MeshLambertMaterial({ color: 0x6e5537 });
    const matSeatBlue = new THREE.MeshLambertMaterial({ color: 0x4f7ec2 });
    const matSeatRed = new THREE.MeshLambertMaterial({ color: 0xb5544e });
    const matSeatGreen = new THREE.MeshLambertMaterial({ color: 0x5e9463 });
    const matMetal = new THREE.MeshLambertMaterial({ color: 0x8d939c });
    const matDark = new THREE.MeshLambertMaterial({ color: 0x2b2e35 });
    const matScreen = new THREE.MeshLambertMaterial({ color: 0x1d2b33 });
    const matLeaf = new THREE.MeshLambertMaterial({ color: 0x4d8f52 });
    const matPot = new THREE.MeshLambertMaterial({ color: 0x8a5a3b });
    const matWater = new THREE.MeshLambertMaterial({ color: 0x6fb7d8 });
    const matGlassDoor = matTrans(0xbfe4ff, 0.3);

    function addBoxTo(parent, w, h, d, x, y, z, material, ry) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
        mesh.position.set(x, y, z);
        if (ry) mesh.rotation.y = ry;
        parent.add(mesh);
        return mesh;
    }
    function addCylTo(parent, rTop, rBottom, h, x, y, z, material, segments) {
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, segments || 12), material);
        mesh.position.set(x, y, z);
        parent.add(mesh);
        return mesh;
    }
    function addBox(w, h, d, x, y, z, material, ry) {
        return addBoxTo(buildingGroup, w, h, d, x, y, z, material, ry);
    }

    const plaza = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), matPlaza);
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.y = -0.32;
    scene.add(plaza);

    addBox(22, 0.3, 18, 0, -0.15, 0, matGround);
    addBox(22, 0.3, 18, 0, 20.55, 0, matRoof);
    addBox(14, 0.12, 5, 0, -0.06, 12, matSidewalk);

    addBox(22, 20.4, 0.15, 0, 10.2, -9.08, matOuter);
    addBox(0.15, 20.4, 18, -11.08, 10.2, 0, matOuter);
    addBox(0.15, 20.4, 18, 11.08, 10.2, 0, matOuter);
    addBox(9.5, 20.4, 0.15, -6.25, 10.2, 9.08, matOuter);
    addBox(9.5, 20.4, 0.15, 6.25, 10.2, 9.08, matOuter);
    addBox(3.0, 17.8, 0.15, 0, 11.5, 9.08, matOuter);

    addBox(0.16, 20.4, 0.16, -1.55, 10.2, -1.55, matColumn);
    addBox(0.16, 20.4, 0.16, 1.55, 10.2, -1.55, matColumn);
    addBox(0.16, 20.4, 0.16, -1.55, 10.2, 1.55, matColumn);
    addBox(0.16, 20.4, 0.16, 1.55, 10.2, 1.55, matColumn);
    addBox(0.05, 20.4, 3, -1.52, 10.2, 0, matShaft);
    addBox(0.05, 20.4, 3, 1.52, 10.2, 0, matShaft);
    addBox(3, 20.4, 0.05, 0, 10.2, -1.52, matShaft);

    function wallZ(y, z, x1, x2) {
        const w = x2 - x1;
        if (w <= 0.05) return;
        addBox(w, 3.3, 0.12, (x1 + x2) / 2, y + 1.65, z, matInner);
    }
    function wallX(y, x, z1, z2) {
        const d = z2 - z1;
        if (d <= 0.05) return;
        addBox(0.12, 3.3, d, x, y + 1.65, (z1 + z2) / 2, matInner);
    }

    function buildChair(x, y, z, ry, seatMat) {
        const g = new THREE.Group();
        g.position.set(x, y, z);
        g.rotation.y = ry;
        addBoxTo(g, 0.5, 0.08, 0.48, 0, 0.47, 0, seatMat);
        addBoxTo(g, 0.48, 0.55, 0.08, 0, 0.78, -0.26, seatMat);
        addCylTo(g, 0.04, 0.04, 0.42, 0, 0.22, 0, matMetal);
        addCylTo(g, 0.24, 0.28, 0.05, 0, 0.03, 0, matMetal);
        buildingGroup.add(g);
    }

    function buildDesk(x, y, z) {
        const g = new THREE.Group();
        g.position.set(x, y, z);
        addBoxTo(g, 2.2, 0.09, 1.05, 0, 0.76, 0, matWood);
        addBoxTo(g, 0.09, 0.72, 0.09, -0.98, 0.36, -0.42, matWoodDark);
        addBoxTo(g, 0.09, 0.72, 0.09, 0.98, 0.36, -0.42, matWoodDark);
        addBoxTo(g, 0.09, 0.72, 0.09, -0.98, 0.36, 0.42, matWoodDark);
        addBoxTo(g, 0.09, 0.72, 0.09, 0.98, 0.36, 0.42, matWoodDark);
        addBoxTo(g, 0.07, 0.22, 0.07, 0, 0.9, -0.34, matDark);
        addBoxTo(g, 0.6, 0.38, 0.05, 0, 1.16, -0.38, matScreen);
        addBoxTo(g, 0.42, 0.03, 0.15, 0, 0.82, 0.08, matDark);
        buildingGroup.add(g);
    }

    function buildCouch(x, y, z, ry, len, seatMat) {
        const g = new THREE.Group();
        g.position.set(x, y, z);
        g.rotation.y = ry;
        addBoxTo(g, len, 0.38, 0.78, 0, 0.26, 0, seatMat);
        addBoxTo(g, len, 0.52, 0.18, 0, 0.66, -0.32, seatMat);
        addBoxTo(g, 0.16, 0.5, 0.78, -(len / 2 - 0.08), 0.44, 0, seatMat);
        addBoxTo(g, 0.16, 0.5, 0.78, len / 2 - 0.08, 0.44, 0, seatMat);
        buildingGroup.add(g);
    }

    function buildArmchair(x, y, z, ry, seatMat) {
        buildCouch(x, y, z, ry, 0.72, seatMat);
    }

    function buildTableRect(x, y, z, w, d) {
        addBox(w, 0.08, d, x, y + 0.73, z, matWood);
        addBox(0.09, 0.7, 0.09, x - w / 2 + 0.12, y + 0.35, z - d / 2 + 0.12, matWoodDark);
        addBox(0.09, 0.7, 0.09, x + w / 2 - 0.12, y + 0.35, z - d / 2 + 0.12, matWoodDark);
        addBox(0.09, 0.7, 0.09, x - w / 2 + 0.12, y + 0.35, z + d / 2 - 0.12, matWoodDark);
        addBox(0.09, 0.7, 0.09, x + w / 2 - 0.12, y + 0.35, z + d / 2 - 0.12, matWoodDark);
    }

    function buildTableRound(x, y, z, r) {
        addCylTo(buildingGroup, r, r, 0.06, x, y + 0.73, z, matWood, 18);
        addCylTo(buildingGroup, 0.07, 0.07, 0.7, x, y + 0.35, z, matMetal, 10);
        addCylTo(buildingGroup, r * 0.5, r * 0.5, 0.05, x, y + 0.03, z, matMetal, 14);
    }

    function buildCooler(x, y, z) {
        addBox(0.34, 1.0, 0.34, x, y + 0.5, z, matMetal);
        addCylTo(buildingGroup, 0.16, 0.16, 0.42, x, y + 1.22, z, matWater, 12);
    }

    function buildPlant(x, y, z) {
        addCylTo(buildingGroup, 0.22, 0.16, 0.34, x, y + 0.17, z, matPot, 10);
        addCylTo(buildingGroup, 0.3, 0.34, 0.7, x, y + 0.68, z, matLeaf, 10);
    }

    function buildCallPanel(x, y, z) {
        const g = new THREE.Group();
        g.position.set(x, y, z);
        addBoxTo(g, 0.55, 1.4, 0.05, 0, 0, 0, matPanelBody);
        const lampOff = new THREE.MeshBasicMaterial({ color: 0x3a3f47 });
        const lampOn = new THREE.MeshBasicMaterial({ color: 0x3dff78 });
        const upShape = new THREE.Shape();
        upShape.moveTo(0, 0.12);
        upShape.lineTo(-0.13, -0.1);
        upShape.lineTo(0.13, -0.1);
        upShape.closePath();
        const upArrow = new THREE.Mesh(new THREE.ShapeGeometry(upShape), lampOff);
        upArrow.position.set(0, 0.48, 0.03);
        g.add(upArrow);
        const downShape = new THREE.Shape();
        downShape.moveTo(0, -0.12);
        downShape.lineTo(-0.13, 0.1);
        downShape.lineTo(0.13, 0.1);
        downShape.closePath();
        const downArrow = new THREE.Mesh(new THREE.ShapeGeometry(downShape), lampOff);
        downArrow.position.set(0, -0.48, 0.03);
        g.add(downArrow);
        const disp = makeTextTexture();
        const dispMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.45), new THREE.MeshBasicMaterial({ map: disp.texture }));
        dispMesh.position.set(0, 0, 0.032);
        g.add(dispMesh);
        buildingGroup.add(g);
        g.userData = {
            setUp: function (on) { upArrow.material = on ? lampOn : lampOff; },
            setDown: function (on) { downArrow.material = on ? lampOn : lampOff; },
            setIndicator: function (text) { disp.update(text); }
        };
        return g;
    }

    function buildIndicatorPlane(size, x, y, z) {
        const t = makeTextTexture();
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: t.texture }));
        mesh.position.set(x, y, z);
        buildingGroup.add(mesh);
        mesh.userData = { setIndicator: function (text) { t.update(text); } };
        return mesh;
    }

    const floors = [];
    for (let f = 0; f < WORLD.FLOOR_COUNT; f++) {
        const y = f * FH;
        const nodes = {};
        const sitTargets = {};
        const desks = [];

        function addNode(name, nx, nz) {
            nodes[name] = { name: name, pos: new THREE.Vector3(nx, y, nz), links: [] };
        }
        function link(a, b) {
            if (nodes[a] && nodes[b] && nodes[a].links.indexOf(b) < 0) {
                nodes[a].links.push(b);
                nodes[b].links.push(a);
            }
        }
        function addSit(name, sit, facing) {
            sitTargets[name] = { sit: sit, facing: facing };
        }

        addBox(3.3, 0.5, 0.14, 0, y + 2.55, 1.52, matColumn);
        addBox(0.14, 2.6, 0.14, -1.6, y + 1.3, 1.52, matColumn);
        addBox(0.14, 2.6, 0.14, 1.6, y + 1.3, 1.52, matColumn);
        const callPanel = buildCallPanel(2.1, y + 1.5, 1.56);
        const shaftIndicator = buildIndicatorPlane(0.9, 0, y + 2.95, 1.58);

        if (f > 0) {
            addBox(22, 0.16, 7.5, 0, y - 0.08, -5.25, matSlab);
            addBox(22, 0.16, 7.5, 0, y - 0.08, 5.25, matSlab);
            addBox(9.5, 0.16, 3, -6.25, y - 0.08, 0, matSlab);
            addBox(9.5, 0.16, 3, 6.25, y - 0.08, 0, matSlab);
        }

        addNode("elevWait", 0, 3.6);
        addNode("hallS", 0, 2.2);
        addNode("hallSE", 5, 2.2);
        addNode("hallE", 6.6, 0);
        addNode("hallNE", 5, -2.2);
        addNode("hallN", 0, -2.2);
        addNode("hallNW", -5, -2.2);
        addNode("hallW", -6.6, 0);
        addNode("hallSW", -5, 2.2);
        link("elevWait", "hallS");
        link("hallS", "hallSE");
        link("hallSE", "hallE");
        link("hallE", "hallNE");
        link("hallNE", "hallN");
        link("hallN", "hallNW");
        link("hallNW", "hallW");
        link("hallW", "hallSW");
        link("hallSW", "hallS");

        if (f > 0) {
            wallX(y, -5.5, -9, -3);
            wallX(y, 0, -9, -3);
            wallX(y, 5.5, -9, -3);
            wallZ(y, -3, -11, -8.85);
            wallZ(y, -3, -7.65, -5.5);
            wallZ(y, -3, -5.5, -3.35);
            wallZ(y, -3, -2.15, 0);
            wallZ(y, -3, 0, 2.15);
            wallZ(y, -3, 3.35, 5.5);
            wallZ(y, -3, 5.5, 7.65);
            wallZ(y, -3, 8.85, 11);
            wallX(y, -3, 3, 9);
            wallX(y, 3, 3, 9);
            wallZ(y, 3, -11, -7.6);
            wallZ(y, 3, -6.4, -3);
            wallZ(y, 3, 3, 6.4);
            wallZ(y, 3, 7.6, 11);

            const officeXs = [-8.25, -2.75, 2.75, 8.25];
            const letters = ["A", "B", "C", "D"];
            for (let oi = 0; oi < 4; oi++) {
                const ox = officeXs[oi];
                const L = letters[oi];
                addNode("office" + L + "_door", ox, -2.2);
                addNode("office" + L + "_desk", ox, -6.2);
                link("office" + L + "_door", "office" + L + "_desk");
                addSit("office" + L + "_desk", true, Math.PI);
                desks.push({ wpName: "office" + L + "_desk", doorWpName: "office" + L + "_door" });
                buildDesk(ox, y, -7.2);
                buildChair(ox, y, -6.2, Math.PI, matSeatBlue);
                if (oi > 0) link("office" + letters[oi - 1] + "_door", "office" + L + "_door");
            }
            link("officeA_door", "hallNW");
            link("officeB_door", "hallN");
            link("officeB_door", "hallNW");
            link("officeC_door", "hallN");
            link("officeC_door", "hallNE");
            link("officeD_door", "hallNE");

            addNode("conf_door", -7, 2.2);
            addNode("conf_center", -7, 4.6);
            addNode("conf_seat0", -8, 7.0);
            addNode("conf_seat1", -6, 7.0);
            addNode("conf_seat2", -8, 5.2);
            addNode("conf_seat3", -6, 5.2);
            link("conf_door", "hallSW");
            link("conf_door", "hallS");
            link("conf_door", "conf_center");
            link("conf_center", "conf_seat0");
            link("conf_center", "conf_seat1");
            link("conf_center", "conf_seat2");
            link("conf_center", "conf_seat3");
            addSit("conf_seat0", true, Math.PI);
            addSit("conf_seat1", true, Math.PI);
            addSit("conf_seat2", true, 0);
            addSit("conf_seat3", true, 0);
            buildTableRect(-7, y, 6, 3.6, 1.5);
            buildChair(-8, y, 7.0, Math.PI, matSeatRed);
            buildChair(-6, y, 7.0, Math.PI, matSeatRed);
            buildChair(-8, y, 5.2, 0, matSeatRed);
            buildChair(-6, y, 5.2, 0, matSeatRed);

            addNode("lounge_door", 7, 2.2);
            addNode("lounge_center", 7, 5.4);
            addNode("lounge_spot0", 7, 8.1);
            addNode("lounge_spot1", 4.6, 6.4);
            addNode("lounge_spot2", 9.4, 6.4);
            addNode("water_cooler", 9.5, 3.9);
            link("lounge_door", "hallSE");
            link("lounge_door", "hallS");
            link("lounge_door", "conf_door");
            link("lounge_door", "lounge_center");
            link("lounge_center", "lounge_spot0");
            link("lounge_center", "lounge_spot1");
            link("lounge_center", "lounge_spot2");
            link("lounge_center", "water_cooler");
            addSit("lounge_spot0", true, Math.PI);
            addSit("lounge_spot1", true, Math.PI / 2);
            addSit("lounge_spot2", true, -Math.PI / 2);
            addSit("water_cooler", false, Math.PI / 2);
            buildCouch(7, y, 8.2, Math.PI, 1.9, matSeatGreen);
            buildTableRect(7, y, 6.4, 1.3, 0.7);
            buildArmchair(4.6, y, 6.4, Math.PI / 2, matSeatGreen);
            buildArmchair(9.4, y, 6.4, -Math.PI / 2, matSeatGreen);
            buildCooler(10.2, y, 3.9);
            buildPlant(4.2, y, 8.4);
            buildPlant(-2.5, y, 8.3);
            buildPlant(2.5, y, 8.3);

            addNode("hall_stand_N", -3.4, -1.1);
            addNode("hall_stand_S", 3.4, 1.1);
            link("hall_stand_N", "hallN");
            link("hall_stand_S", "hallS");
            addSit("hall_stand_N", false, Math.PI);
            addSit("hall_stand_S", false, 0);
        }

        if (f === 0) {
            addNode("outside", 0, 12);
            addNode("front_door_threshold", 0, 9.35);
            addNode("entrance", 0, 7.4);
            addNode("lobby_center", 0, 5.0);
            link("outside", "front_door_threshold");
            link("front_door_threshold", "entrance");
            link("entrance", "lobby_center");
            link("lobby_center", "elevWait");
            link("lobby_center", "hallS");

            addBox(0.65, 2.3, 0.06, -1.85, 1.15, 9.02, matGlassDoor);
            addBox(0.65, 2.3, 0.06, 1.85, 1.15, 9.02, matGlassDoor);

            addNode("cafe_door", -6.5, 3.0);
            addNode("cafe_center", -7.2, 4.6);
            addNode("cafe_order", -9.6, 4.6);
            link("cafe_door", "hallSW");
            link("cafe_door", "hallS");
            link("cafe_door", "cafe_center");
            link("cafe_center", "cafe_order");
            addSit("cafe_order", false, -Math.PI / 2);
            const bistroTables = [[-8.6, 1.9], [-8.6, 7.3], [-5.4, 1.9], [-5.4, 7.3]];
            for (let bi = 0; bi < bistroTables.length; bi++) {
                const bx = bistroTables[bi][0];
                const bz = bistroTables[bi][1];
                addNode("bistro" + bi + "w", bx - 0.85, bz);
                addNode("bistro" + bi + "e", bx + 0.85, bz);
                link("cafe_center", "bistro" + bi + "w");
                link("cafe_center", "bistro" + bi + "e");
                addSit("bistro" + bi + "w", true, Math.PI / 2);
                addSit("bistro" + bi + "e", true, -Math.PI / 2);
                buildTableRound(bx, y, bz, 0.5);
                buildChair(bx - 0.85, y, bz, Math.PI / 2, matSeatRed);
                buildChair(bx + 0.85, y, bz, -Math.PI / 2, matSeatRed);
            }
            addBox(0.9, 0.95, 4.2, -10.6, y + 0.475, 4.5, matWood);
            addBox(1.05, 0.06, 4.4, -10.6, y + 0.99, 4.5, matWoodDark);
            addBox(0.5, 0.42, 0.45, -10.6, y + 1.24, 3.4, matMetal);
            addBox(0.55, 0.35, 0.85, -10.6, y + 1.2, 5.7, matGlassDoor);

            addNode("fl_center", 7, 5.2);
            addNode("fl_couch", 7, 8.1);
            addNode("fl_arm0", 4.6, 6.3);
            addNode("fl_arm1", 9.4, 6.3);
            link("lobby_center", "fl_center");
            link("fl_center", "fl_couch");
            link("fl_center", "fl_arm0");
            link("fl_center", "fl_arm1");
            addSit("fl_couch", true, Math.PI);
            addSit("fl_arm0", true, Math.PI / 2);
            addSit("fl_arm1", true, -Math.PI / 2);
            buildCouch(7, y, 8.2, Math.PI, 1.9, matSeatBlue);
            buildTableRect(7, y, 6.4, 1.3, 0.7);
            buildArmchair(4.6, y, 6.3, Math.PI / 2, matSeatBlue);
            buildArmchair(9.4, y, 6.3, -Math.PI / 2, matSeatBlue);

            addNode("bl_center", 7, -6);
            addNode("back_lounge_N", 7, -4.6);
            addNode("back_lounge_S", 7, -7.4);
            link("hallNE", "bl_center");
            link("bl_center", "back_lounge_N");
            link("bl_center", "back_lounge_S");
            addSit("back_lounge_N", true, Math.PI);
            addSit("back_lounge_S", true, 0);
            buildCouch(7, y, -4.5, Math.PI, 1.9, matSeatGreen);
            buildCouch(7, y, -7.5, 0, 1.9, matSeatGreen);
            buildTableRect(7, y, -6, 1.4, 0.8);

            addNode("pit_center", -7, -6);
            addNode("pit_N", -7, -4.7);
            addNode("pit_S", -7, -7.3);
            addNode("pit_E", -5.7, -6);
            addNode("pit_W", -8.3, -6);
            link("hallNW", "pit_center");
            link("pit_center", "pit_N");
            link("pit_center", "pit_S");
            link("pit_center", "pit_E");
            link("pit_center", "pit_W");
            addSit("pit_N", true, Math.PI);
            addSit("pit_S", true, 0);
            addSit("pit_E", true, -Math.PI / 2);
            addSit("pit_W", true, Math.PI / 2);
            buildTableRound(-7, y, -6, 0.75);
            buildArmchair(-7, y, -4.7, Math.PI, matSeatRed);
            buildArmchair(-7, y, -7.3, 0, matSeatRed);
            buildArmchair(-5.7, y, -6, -Math.PI / 2, matSeatRed);
            buildArmchair(-8.3, y, -6, Math.PI / 2, matSeatRed);

            addNode("reception", -3.1, 5.1);
            link("lobby_center", "reception");
            addSit("reception", false, 0);
            addBox(2.2, 0.92, 0.7, -3.1, y + 0.46, 6.2, matWood);
            addBox(2.4, 0.06, 0.85, -3.1, y + 0.95, 6.2, matWoodDark);
            addBox(0.45, 0.32, 0.05, -3.7, y + 1.32, 6.2, matScreen);

            addNode("kiosk", 3.2, 6.9);
            link("entrance", "kiosk");
            addSit("kiosk", false, 0);
            addBox(0.12, 1.3, 0.12, 3.2, y + 0.65, 7.7, matMetal);
            addBox(0.75, 0.5, 0.06, 3.2, y + 1.28, 7.62, matScreen);

            addNode("lobby_wc_front", 3.6, 4.6);
            link("lobby_center", "lobby_wc_front");
            addSit("lobby_wc_front", false, Math.PI / 2);
            buildCooler(4.2, y, 4.6);
            addNode("lobby_wc_back", -3.6, -4.6);
            link("hallN", "lobby_wc_back");
            addSit("lobby_wc_back", false, -Math.PI / 2);
            buildCooler(-4.2, y, -4.6);

            addNode("lobby_stand_center", 2.0, 5.6);
            addNode("lobby_stand_NE", 8.2, 0.9);
            addNode("lobby_stand_NW", -8.4, -0.9);
            addNode("lobby_stand_midE", 5.6, -1.1);
            addNode("lobby_stand_midW", -5.6, 1.1);
            addNode("lobby_stand_entry", 1.7, 6.7);
            link("lobby_center", "lobby_stand_center");
            link("hallE", "lobby_stand_NE");
            link("hallW", "lobby_stand_NW");
            link("hallE", "lobby_stand_midE");
            link("hallW", "lobby_stand_midW");
            link("entrance", "lobby_stand_entry");
            addSit("lobby_stand_center", false, Math.PI);
            addSit("lobby_stand_NE", false, -Math.PI / 2);
            addSit("lobby_stand_NW", false, Math.PI / 2);
            addSit("lobby_stand_midE", false, Math.PI);
            addSit("lobby_stand_midW", false, 0);
            addSit("lobby_stand_entry", false, Math.PI);

            buildPlant(-1.9, y, 8.4);
            buildPlant(1.9, y, 8.4);
            buildPlant(-10.2, y, -8.3);
            buildPlant(10.2, y, -8.3);
        }

        floors.push({
            floorNumber: f,
            nodes: nodes,
            callPanel: callPanel,
            shaftIndicator: shaftIndicator,
            desks: desks,
            sitTargets: sitTargets
        });
    }

    return { buildingGroup: buildingGroup, floors: floors, bfsPath: bfsPath };
}

window.WORLD = WORLD;
window.createWorld = createWorld;
window.bfsPath = bfsPath;
