(function () {
    const WORLD = {
        FLOOR_HEIGHT: 3.4, FLOOR_COUNT: 6,
        BUILDING_WIDTH: 22, BUILDING_DEPTH: 18,
        SHAFT_WIDTH: 3, SHAFT_DEPTH: 3,
        PERSON_R: 0.4
    };
    window.WORLD = WORLD;

    function v(x, f, z) { return new THREE.Vector3(x, f * WORLD.FLOOR_HEIGHT, z); }
    function tmat(color, opacity) {
        return new THREE.MeshStandardMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, roughness: 0.65 });
    }
    function solid(color) { return new THREE.MeshStandardMaterial({ color, roughness: 0.7 }); }
    function addBox(group, x, y, z, w, h, d, material, name) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
        m.position.set(x, y, z);
        if (name) m.name = name;
        group.add(m);
        return m;
    }
    function addChair(group, x, y, z, rot, color) {
        const g = new THREE.Group();
        g.position.set(x, y, z);
        g.rotation.y = rot || 0;
        const m = solid(color || 0x6a5c50);
        addBox(g, 0, 0.24, 0, 0.55, 0.12, 0.55, m);
        addBox(g, 0, 0.65, 0.23, 0.55, 0.72, 0.1, m);
        group.add(g);
        return g;
    }
    function addCouch(group, x, y, z, w, rot) {
        const g = new THREE.Group();
        g.position.set(x, y, z);
        g.rotation.y = rot || 0;
        const m = solid(0x527a84);
        addBox(g, 0, 0.28, 0, w, 0.24, 0.75, m);
        addBox(g, 0, 0.68, 0.32, w, 0.8, 0.16, m);
        group.add(g);
        return g;
    }
    function addPlant(group, x, y, z) {
        addBox(group, x, y + 0.18, z, 0.45, 0.36, 0.45, solid(0x775533));
        const leaves = new THREE.Mesh(new THREE.SphereGeometry(0.38, 12, 8), solid(0x2f7a45));
        leaves.position.set(x, y + 0.72, z);
        group.add(leaves);
    }
    function addWaterCooler(group, x, y, z) {
        addBox(group, x, y + 0.45, z, 0.32, 0.72, 0.32, solid(0xe8eef7));
        const jug = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 10), tmat(0x91c8ff, 0.65));
        jug.position.set(x, y + 0.96, z);
        group.add(jug);
    }

    function makeTextTexture(text, size) {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = size || 256;
        const tex = new THREE.CanvasTexture(canvas);
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.generateMipmaps = true;
        tex.anisotropy = 4;
        updateTextTexture(tex, text || "0");
        return tex;
    }
    function updateTextTexture(tex, text) {
        text = String(text);
        if (tex._lastText === text) return;
        tex._lastText = text;
        const c = tex.image, ctx = c.getContext("2d");
        ctx.clearRect(0, 0, c.width, c.height);
        ctx.fillStyle = "#050505";
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = "bold " + Math.floor(c.height * 0.58) + "px monospace";
        ctx.shadowColor = "#ffbb22";
        ctx.shadowBlur = c.width * 0.08;
        ctx.fillStyle = "#ffbb22";
        ctx.fillText(text, c.width / 2, c.height * 0.54);
        tex.needsUpdate = true;
    }
    window.updateTextTexture = updateTextTexture;
    window.makeTextTexture = makeTextTexture;

    function addArrow(parent, y, up) {
        const shape = new THREE.Shape();
        if (up) {
            shape.moveTo(0, 0.13); shape.lineTo(-0.13, -0.1); shape.lineTo(0.13, -0.1);
        } else {
            shape.moveTo(0, -0.13); shape.lineTo(-0.13, 0.1); shape.lineTo(0.13, 0.1);
        }
        shape.closePath();
        const off = new THREE.MeshBasicMaterial({ color: 0x242424, side: THREE.DoubleSide });
        const on = new THREE.MeshBasicMaterial({ color: 0x55ff77, side: THREE.DoubleSide });
        const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), off);
        mesh.position.set(0, y, 0.031);
        parent.add(mesh);
        return { mesh, off, on };
    }
    function createCallPanel(floor) {
        const g = new THREE.Group();
        g.position.set(-1.18, floor * WORLD.FLOOR_HEIGHT + 1.45, 1.62);
        const plate = addBox(g, 0, 0, 0, 0.55, 1.4, 0.05, solid(0x1e2328));
        const up = addArrow(g, 0.38, true), down = addArrow(g, -0.38, false);
        const tex = makeTextTexture(String(floor), 256);
        const display = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.45), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
        display.position.set(0, 0, 0.035);
        g.add(display);
        g.userData = {
            setUp: function (onState) { up.mesh.material = onState ? up.on : up.off; },
            setDown: function (onState) { down.mesh.material = onState ? down.on : down.off; },
            setIndicator: function (text) { updateTextTexture(tex, text); }
        };
        return g;
    }
    function createShaftIndicator(floor) {
        const tex = makeTextTexture(String(floor), 256);
        const m = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, transparent: true }));
        m.position.set(0, floor * WORLD.FLOOR_HEIGHT + 2.32, 1.64);
        m.userData.setIndicator = function (text) { updateTextTexture(tex, text); };
        return m;
    }

    function addNode(nodes, name, vec, links, sitTargets, sit, facing) {
        nodes[name] = { name, pos: vec.clone(), links: links ? links.slice() : [] };
        if (sitTargets && (sit !== undefined || facing !== undefined)) sitTargets[name] = { sit: !!sit, facing: facing || 0 };
    }
    function link(nodes, a, b) {
        if (!nodes[a].links.includes(b)) nodes[a].links.push(b);
        if (!nodes[b].links.includes(a)) nodes[b].links.push(a);
    }
    function addRing(nodes, f) {
        addNode(nodes, "hallS", v(0, f, 3.2), ["hallSE", "hallSW", "elevWait"]);
        addNode(nodes, "hallSE", v(3.2, f, 3.2), ["hallS", "hallE"]);
        addNode(nodes, "hallE", v(3.2, f, 0), ["hallSE", "hallNE"]);
        addNode(nodes, "hallNE", v(3.2, f, -3.2), ["hallE", "hallN"]);
        addNode(nodes, "hallN", v(0, f, -3.2), ["hallNE", "hallNW"]);
        addNode(nodes, "hallNW", v(-3.2, f, -3.2), ["hallN", "hallW"]);
        addNode(nodes, "hallW", v(-3.2, f, 0), ["hallNW", "hallSW"]);
        addNode(nodes, "hallSW", v(-3.2, f, 3.2), ["hallW", "hallS"]);
        addNode(nodes, "elevWait", v(0, f, 2.05), ["hallS"]);
    }

    function buildOfficeFloor(group, floor) {
        const nodes = {}, sitTargets = {}, desks = [];
        addRing(nodes, floor);
        const y = floor * WORLD.FLOOR_HEIGHT;
        const wall = tmat(0xbbc5e6, 0.28), deskM = solid(0x80624b), chairM = 0x4f6f85;
        [-5.5, 0, 5.5].forEach(x => addBox(group, x, y + 1.15, -6, 0.08, 2.3, 6, wall));
        [-8.25, -2.75, 2.75, 8.25].forEach((x, i) => {
            const id = String.fromCharCode(65 + i);
            addBox(group, x, y + 0.45, -7.55, 2.1, 0.58, 0.85, deskM);
            addBox(group, x, y + 0.95, -7.93, 1.0, 0.5, 0.06, solid(0x111111));
            addChair(group, x, y, -6.55, Math.PI, chairM);
            const door = x < -5 ? "hallNW" : x < 0 ? "hallN" : x < 5 ? "hallN" : "hallNE";
            addNode(nodes, "office" + id + "_door", v(x, floor, -4.2), [door]);
            addNode(nodes, "office" + id + "_desk", v(x, floor, -6.42), ["office" + id + "_door"], sitTargets, true, Math.PI);
            desks.push({ id: id, floor, wpName: "office" + id + "_desk", doorWpName: "office" + id + "_door" });
        });
        addBox(group, -7, y + 0.42, 6.6, 5.2, 0.26, 1.5, solid(0x756048));
        [-8.3, -5.7].forEach(x => { addChair(group, x, y, 5.45, 0, 0x7a657e); addChair(group, x, y, 7.75, Math.PI, 0x7a657e); });
        addNode(nodes, "conf_door", v(-3.8, floor, 4.2), ["hallSW"]);
        addNode(nodes, "conf_center", v(-7, floor, 6.6), ["conf_door"]);
        [[-8.3, 5.45, 0], [-5.7, 5.45, 0], [-8.3, 7.75, Math.PI], [-5.7, 7.75, Math.PI]].forEach((p, i) => addNode(nodes, "conf_seat" + i, v(p[0], floor, p[1]), ["conf_center"], sitTargets, true, p[2]));
        addCouch(group, 6.6, y, 7.7, 2.4, Math.PI);
        addBox(group, 6.7, y + 0.25, 6.4, 1.2, 0.22, 0.75, solid(0x615243));
        addChair(group, 4.7, y, 6.3, Math.PI / 2, 0x66836f);
        addChair(group, 8.8, y, 6.3, -Math.PI / 2, 0x66836f);
        addWaterCooler(group, 9.7, y, 4.35);
        addNode(nodes, "lounge_door", v(3.8, floor, 4.2), ["hallSE"]);
        addNode(nodes, "lounge_center", v(6.8, floor, 6.55), ["lounge_door"]);
        [[6.6, 7.45, Math.PI], [4.7, 6.3, Math.PI / 2], [8.8, 6.3, -Math.PI / 2]].forEach((p, i) => addNode(nodes, "lounge_spot" + i, v(p[0], floor, p[1]), ["lounge_center"], sitTargets, true, p[2]));
        addNode(nodes, "water_cooler", v(9.3, floor, 4.45), ["lounge_center"], sitTargets, false, -Math.PI / 2);
        addNode(nodes, "hall_stand_N", v(-1.5, floor, -3.25), ["hallN"], sitTargets, false, 0);
        addNode(nodes, "hall_stand_S", v(1.5, floor, 3.25), ["hallS"], sitTargets, false, Math.PI);
        Object.keys(nodes).forEach(k => nodes[k].links.forEach(n => nodes[n] && link(nodes, k, n)));
        return { floorNumber: floor, nodes, callPanel: null, shaftIndicator: null, desks, sitTargets };
    }

    function buildLobby(group) {
        const floor = 0, y = 0, nodes = {}, sitTargets = {}, deskM = solid(0x80624b);
        addRing(nodes, floor);
        addNode(nodes, "outside", v(0, 0, 12), ["entrance"]);
        addNode(nodes, "entrance", v(0, 0, 8.7), ["outside", "elevWait"]);
        addBox(group, 0, 0.02, 12, 8.5, 0.04, 4, solid(0x777777));
        addBox(group, -0.8, 1.05, 9.05, 0.08, 2.0, 0.04, tmat(0x99ddff, 0.4));
        addBox(group, 0.8, 1.05, 9.05, 0.08, 2.0, 0.04, tmat(0x99ddff, 0.4));
        addBox(group, -9.4, y + 0.55, 0.8, 0.8, 1.1, 5.0, deskM);
        addBox(group, -9.4, y + 1.18, 0.8, 0.95, 0.12, 5.1, solid(0x4b3d32));
        addBox(group, -9.35, y + 1.45, -0.4, 0.45, 0.42, 0.28, solid(0x222222));
        addBox(group, -9.25, y + 1.36, 1.8, 0.5, 0.24, 0.35, tmat(0xffd58a, 0.65));
        addNode(nodes, "cafe_door", v(-6.7, 0, 0.6), ["hallSW"]);
        addNode(nodes, "cafe_order", v(-8.55, 0, 0.3), ["cafe_door"], sitTargets, false, Math.PI / 2);
        [[-7.3, 4.9], [-9.0, 4.9], [-7.3, 7.0], [-9.0, 7.0]].forEach((p, i) => {
            addBox(group, p[0], 0.36, p[1], 0.65, 0.1, 0.65, solid(0x6b5544));
            addChair(group, p[0] - 0.55, 0, p[1], Math.PI / 2, 0x6f7184);
            addChair(group, p[0] + 0.55, 0, p[1], -Math.PI / 2, 0x6f7184);
            addNode(nodes, "cafe_seat" + i + "a", v(p[0] - 0.55, 0, p[1]), ["cafe_door"], sitTargets, true, Math.PI / 2);
            addNode(nodes, "cafe_seat" + i + "b", v(p[0] + 0.55, 0, p[1]), ["cafe_door"], sitTargets, true, -Math.PI / 2);
        });
        addCouch(group, 7.2, 0, 7.2, 2.5, Math.PI);
        addChair(group, 5.5, 0, 5.6, Math.PI / 2, 0x66836f);
        addChair(group, 9.0, 0, 5.6, -Math.PI / 2, 0x66836f);
        addBox(group, 7.2, 0.25, 5.9, 1.2, 0.22, 0.75, solid(0x615243));
        addWaterCooler(group, 9.8, 0, 3.6);
        [["front_lounge0", 7.2, 7.0, Math.PI], ["front_lounge1", 5.5, 5.6, Math.PI / 2], ["front_lounge2", 9, 5.6, -Math.PI / 2]].forEach(p => addNode(nodes, p[0], v(p[1], 0, p[2]), ["hallSE"], sitTargets, true, p[3]));
        addCouch(group, 3.8, 0, -6.8, 2.5, 0);
        addCouch(group, 3.8, 0, -4.9, 2.5, Math.PI);
        addBox(group, 3.8, 0.25, -5.85, 1.4, 0.2, 0.8, solid(0x615243));
        addNode(nodes, "back_lounge_N", v(3.8, 0, -6.55), ["hallNE"], sitTargets, true, 0);
        addNode(nodes, "back_lounge_S", v(3.8, 0, -5.1), ["hallNE"], sitTargets, true, Math.PI);
        addBox(group, -7.4, 0.35, -5.7, 1.0, 0.12, 1.0, solid(0x756048));
        [["pit_N", -7.4, -6.55, 0], ["pit_S", -7.4, -4.85, Math.PI], ["pit_E", -6.55, -5.7, -Math.PI / 2], ["pit_W", -8.25, -5.7, Math.PI / 2]].forEach(p => { addChair(group, p[1], 0, p[2], p[3], 0x7a657e); addNode(nodes, p[0], v(p[1], 0, p[2]), ["hallNW"], sitTargets, true, p[3]); });
        addWaterCooler(group, -5.8, 0, 7.1);
        addWaterCooler(group, 7.2, 0, -2.9);
        addBox(group, -3.6, 0.45, 6.5, 1.8, 0.9, 0.7, solid(0x6b5544));
        addBox(group, 2.6, 0.75, 7.5, 0.75, 1.5, 0.28, solid(0x27364d));
        [["lobby_wc_front", -5.8, 7.55], ["lobby_wc_back", 7.2, -2.3], ["reception", -3.6, 5.9], ["kiosk", 2.6, 6.9], ["lobby_stand_center", 0.3, 5.3], ["lobby_stand_NE", 7.6, 1.8], ["lobby_stand_NW", -6.2, 2.6], ["lobby_stand_midE", 6.0, -1.1], ["lobby_stand_midW", -5.5, -1.7], ["lobby_stand_entry", 1.7, 7.7]].forEach(p => addNode(nodes, p[0], v(p[1], 0, p[2]), ["elevWait"], sitTargets, false, 0));
        addPlant(group, -1.9, 0, 8.2); addPlant(group, 2.0, 0, 8.05);
        Object.keys(nodes).forEach(k => nodes[k].links.forEach(n => nodes[n] && link(nodes, k, n)));
        return { floorNumber: 0, nodes, callPanel: null, shaftIndicator: null, desks: [], sitTargets, entranceSpot: "outside" };
    }

    function bfsPath(nodes, fromName, toName) {
        if (!nodes[fromName] || !nodes[toName]) return [];
        const q = [fromName], prev = {};
        prev[fromName] = null;
        while (q.length) {
            const cur = q.shift();
            if (cur === toName) break;
            nodes[cur].links.forEach(n => { if (prev[n] === undefined && nodes[n]) { prev[n] = cur; q.push(n); } });
        }
        if (prev[toName] === undefined) return [nodes[toName].pos.clone()];
        const names = [], out = [];
        for (let n = toName; n; n = prev[n]) names.push(n);
        names.reverse().forEach(n => out.push(nodes[n].pos.clone()));
        return out;
    }

    function createWorld(scene) {
        const buildingGroup = new THREE.Group();
        buildingGroup.renderOrder = 0;
        const floors = [];
        const gray = solid(0x777777), slabT = tmat(0xaaaaaa, 0.3), wallT = tmat(0x9999ff, 0.2);
        addBox(buildingGroup, 0, -0.05, 0, WORLD.BUILDING_WIDTH, 0.1, WORLD.BUILDING_DEPTH, gray);
        addBox(buildingGroup, 0, WORLD.FLOOR_HEIGHT * (WORLD.FLOOR_COUNT - 1) + 0.12, 0, WORLD.BUILDING_WIDTH, 0.18, WORLD.BUILDING_DEPTH, gray);
        for (let f = 1; f < WORLD.FLOOR_COUNT; f++) {
            const y = f * WORLD.FLOOR_HEIGHT - 0.04;
            addBox(buildingGroup, -6.25, y, 0, 9.5, 0.08, WORLD.BUILDING_DEPTH, slabT);
            addBox(buildingGroup, 6.25, y, 0, 9.5, 0.08, WORLD.BUILDING_DEPTH, slabT);
            addBox(buildingGroup, 0, y, -6.25, WORLD.SHAFT_WIDTH, 0.08, 5.5, slabT);
            addBox(buildingGroup, 0, y, 6.25, WORLD.SHAFT_WIDTH, 0.08, 5.5, slabT);
        }
        const totalH = WORLD.FLOOR_HEIGHT * WORLD.FLOOR_COUNT;
        addBox(buildingGroup, -11, totalH / 2, 0, 0.08, totalH, 18, wallT);
        addBox(buildingGroup, 11, totalH / 2, 0, 0.08, totalH, 18, wallT);
        addBox(buildingGroup, 0, totalH / 2, -9, 22, totalH, 0.08, wallT);
        addBox(buildingGroup, -6.25, totalH / 2, 9, 9.5, totalH, 0.08, wallT);
        addBox(buildingGroup, 6.25, totalH / 2, 9, 9.5, totalH, 0.08, wallT);
        addBox(buildingGroup, 0, (totalH + WORLD.FLOOR_HEIGHT) / 2, 9, 3, totalH - WORLD.FLOOR_HEIGHT, 0.08, wallT);
        addBox(buildingGroup, -1.54, totalH / 2, 0, 0.05, totalH, 3.0, tmat(0x555577, 0.22));
        addBox(buildingGroup, 1.54, totalH / 2, 0, 0.05, totalH, 3.0, tmat(0x555577, 0.22));
        addBox(buildingGroup, 0, totalH / 2, -1.54, 3.0, totalH, 0.05, tmat(0x555577, 0.22));
        scene.add(buildingGroup);
        for (let f = 0; f < WORLD.FLOOR_COUNT; f++) {
            const floor = f === 0 ? buildLobby(buildingGroup) : buildOfficeFloor(buildingGroup, f);
            floor.callPanel = createCallPanel(f);
            floor.shaftIndicator = createShaftIndicator(f);
            buildingGroup.add(floor.callPanel, floor.shaftIndicator);
            floors.push(floor);
        }
        return { buildingGroup, floors, bfsPath };
    }

    window.createWorld = createWorld;
})();
