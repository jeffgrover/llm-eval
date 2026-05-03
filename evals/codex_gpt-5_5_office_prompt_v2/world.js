(function(root) {
    "use strict";

    const WORLD = {
        FLOOR_HEIGHT: 3.4, FLOOR_COUNT: 6,
        BUILDING_WIDTH: 22, BUILDING_DEPTH: 18,
        SHAFT_WIDTH: 3, SHAFT_DEPTH: 3,
        PERSON_R: 0.4
    };

    function v(x, floor, z) { return new THREE.Vector3(x, floor * WORLD.FLOOR_HEIGHT, z); }
    function addNode(nodes, name, pos) { nodes[name] = { name, pos, links: [] }; return nodes[name]; }
    function link(nodes, a, b) { if (nodes[a] && nodes[b]) { nodes[a].links.push(b); nodes[b].links.push(a); } }

    function bfsPath(nodes, fromName, toName) {
        if (!nodes[fromName] || !nodes[toName]) return [];
        const q = [fromName], seen = new Set([fromName]), prev = {};
        while (q.length) {
            const n = q.shift();
            if (n === toName) break;
            nodes[n].links.forEach(k => {
                if (!seen.has(k)) { seen.add(k); prev[k] = n; q.push(k); }
            });
        }
        if (!seen.has(toName)) return [nodes[toName].pos.clone()];
        const names = [];
        for (let n = toName; n; n = prev[n]) { names.push(n); if (n === fromName) break; }
        names.reverse();
        return names.map(n => nodes[n].pos.clone());
    }

    function transparent(color, opacity) {
        return new THREE.MeshLambertMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });
    }

    function solid(color) { return new THREE.MeshLambertMaterial({ color }); }

    function box(group, x, y, z, w, h, d, material, name) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
        m.position.set(x, y, z);
        if (name) m.name = name;
        group.add(m);
        return m;
    }

    function chair(group, x, y, z, rot, color) {
        const g = new THREE.Group();
        g.position.set(x, y, z);
        g.rotation.y = rot || 0;
        group.add(g);
        box(g, 0, 0.25, 0, 0.55, 0.15, 0.55, solid(color || 0x52616b));
        box(g, 0, 0.65, -0.23, 0.55, 0.7, 0.12, solid(color || 0x52616b));
        return g;
    }

    function table(group, x, y, z, w, d, color) {
        box(group, x, y + 0.48, z, w, 0.12, d, solid(color || 0x8a6f4d));
        box(group, x, y + 0.22, z, w * 0.12, 0.44, d * 0.12, solid(0x5b4732));
    }

    function couch(group, x, y, z, rot) {
        const g = new THREE.Group();
        g.position.set(x, y, z);
        g.rotation.y = rot || 0;
        group.add(g);
        box(g, 0, 0.32, 0, 1.7, 0.35, 0.65, solid(0x4b77be));
        box(g, 0, 0.75, -0.28, 1.7, 0.7, 0.18, solid(0x3f638f));
        return g;
    }

    function plant(group, x, y, z) {
        box(group, x, y + 0.18, z, 0.35, 0.36, 0.35, solid(0x8d5524));
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.38, 12, 8), solid(0x2f7d32));
        m.position.set(x, y + 0.72, z);
        group.add(m);
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
        if (tex._lastText === text) return;
        tex._lastText = text;
        const c = tex.image, ctx = c.getContext("2d");
        ctx.fillStyle = "#050505";
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.font = "bold " + Math.floor(c.width * 0.62) + "px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.shadowColor = "#ffbb22";
        ctx.shadowBlur = 18;
        ctx.fillStyle = "#ffbb22";
        ctx.fillText(text, c.width / 2, c.height * 0.52);
        tex.needsUpdate = true;
    }

    function triangle(up, material) {
        const s = new THREE.Shape();
        if (up) { s.moveTo(0, 0.14); s.lineTo(-0.13, -0.1); s.lineTo(0.13, -0.1); }
        else { s.moveTo(0, -0.14); s.lineTo(-0.13, 0.1); s.lineTo(0.13, 0.1); }
        s.closePath();
        return new THREE.Mesh(new THREE.ShapeGeometry(s), material);
    }

    function createPanel(floor) {
        const g = new THREE.Group();
        const dark = new THREE.MeshBasicMaterial({ color: 0x242424, side: THREE.DoubleSide });
        const lit = new THREE.MeshBasicMaterial({ color: 0x44ff77, side: THREE.DoubleSide });
        const plate = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.4, 0.05), solid(0x111111));
        g.add(plate);
        const tex = makeTextTexture(String(floor));
        const disp = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.45), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
        disp.position.set(0, 0.35, 0.035);
        g.add(disp);
        const up = triangle(true, dark), down = triangle(false, dark);
        up.position.set(0, -0.05, 0.04);
        down.position.set(0, -0.42, 0.04);
        g.add(up, down);
        g.userData = {
            setUp: on => { up.material = on ? lit : dark; },
            setDown: on => { down.material = on ? lit : dark; },
            setIndicator: text => updateTextTexture(tex, text)
        };
        return g;
    }

    function createIndicator(w, h, initial) {
        const tex = makeTextTexture(initial || "0");
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, transparent: true, depthWrite: false }));
        mesh.userData.setIndicator = text => updateTextTexture(tex, text);
        return mesh;
    }

    function hallway(nodes, floor) {
        addNode(nodes, "elevWait", v(0, floor, 2.35));
        addNode(nodes, "hallS", v(0, floor, 3.25));
        addNode(nodes, "hallSE", v(3.0, floor, 3.25));
        addNode(nodes, "hallE", v(3.0, floor, 0));
        addNode(nodes, "hallNE", v(3.0, floor, -3.25));
        addNode(nodes, "hallN", v(0, floor, -3.25));
        addNode(nodes, "hallNW", v(-3.0, floor, -3.25));
        addNode(nodes, "hallW", v(-3.0, floor, 0));
        addNode(nodes, "hallSW", v(-3.0, floor, 3.25));
        ["hallS", "hallSE", "hallE", "hallNE", "hallN", "hallNW", "hallW", "hallSW"].forEach((n, i, arr) => link(nodes, n, arr[(i + 1) % arr.length]));
        link(nodes, "elevWait", "hallS");
    }

    function buildOfficeFloor(group, floor) {
        const y = floor * WORLD.FLOOR_HEIGHT;
        const nodes = {}, sitTargets = {}, desks = [];
        hallway(nodes, floor);
        const wallMat = transparent(0xbbc5e6, 0.28);
        box(group, -7, y + 1.3, 3, 0.12, 2.4, 4.2, wallMat);
        box(group, -3, y + 1.3, 6.2, 8, 2.4, 0.12, wallMat);
        box(group, 7, y + 1.3, 3, 0.12, 2.4, 4.2, wallMat);
        box(group, 3, y + 1.3, 6.2, 8, 2.4, 0.12, wallMat);
        [-5.5, 0, 5.5].forEach(x => box(group, x, y + 1.3, -6, 0.12, 2.4, 5.8, wallMat));
        box(group, 0, y + 1.3, -3.2, 20, 2.4, 0.12, wallMat);

        const officeXs = [-8.2, -2.75, 2.75, 8.2];
        "ABCD".split("").forEach((id, i) => {
            const x = officeXs[i];
            table(group, x, y, -7.35, 1.8, 0.75, 0x80604a);
            chair(group, x, y, -6.35, Math.PI, 0x596875);
            box(group, x, y + 0.88, -7.75, 0.8, 0.45, 0.08, solid(0x111822));
            addNode(nodes, "office" + id + "_door", v(x, floor, -3.15));
            addNode(nodes, "office" + id + "_desk", v(x, floor, -6.28));
            link(nodes, "office" + id + "_door", "hallN");
            link(nodes, "office" + id + "_door", "office" + id + "_desk");
            sitTargets["office" + id + "_desk"] = { sit: true, facing: Math.PI };
            desks.push({ id: "office" + id, wpName: "office" + id + "_desk", doorWpName: "office" + id + "_door" });
        });

        table(group, -7, y, 6, 4.5, 1.2, 0x6c7a89);
        [-8.2, -5.8].forEach((x, i) => {
            chair(group, x, y, 5.05, 0, 0x7f8c8d);
            chair(group, x, y, 6.95, Math.PI, 0x7f8c8d);
            addNode(nodes, "conf_seat" + (i * 2), v(x, floor, 5.05));
            addNode(nodes, "conf_seat" + (i * 2 + 1), v(x, floor, 6.95));
            sitTargets["conf_seat" + (i * 2)] = { sit: true, facing: 0 };
            sitTargets["conf_seat" + (i * 2 + 1)] = { sit: true, facing: Math.PI };
        });
        addNode(nodes, "conf_door", v(-3.7, floor, 3.35));
        addNode(nodes, "conf_center", v(-7, floor, 6));
        link(nodes, "conf_door", "hallSW"); link(nodes, "conf_door", "conf_center");
        for (let i = 0; i < 4; i++) link(nodes, "conf_center", "conf_seat" + i);

        couch(group, 7.6, y, 7, Math.PI);
        chair(group, 5.4, y, 5.2, Math.PI / 2, 0x7986cb);
        chair(group, 9.5, y, 5.2, -Math.PI / 2, 0x7986cb);
        table(group, 7.5, y, 5.8, 1.5, 0.7, 0x9e8d6b);
        box(group, 4.3, y + 0.55, 7.55, 0.35, 1.1, 0.35, solid(0x78a7d8));
        addNode(nodes, "lounge_door", v(3.7, floor, 3.35));
        addNode(nodes, "lounge_center", v(7.5, floor, 5.8));
        ["lounge_spot0", "lounge_spot1", "lounge_spot2"].forEach((n, i) => {
            addNode(nodes, n, v(6.2 + i * 1.1, floor, 6.8 - i * 0.8));
            link(nodes, "lounge_center", n);
            sitTargets[n] = { sit: true, facing: i === 0 ? 0 : Math.PI / 2 };
        });
        addNode(nodes, "water_cooler", v(4.3, floor, 7.05));
        addNode(nodes, "hall_stand_N", v(-1.4, floor, -2.8));
        addNode(nodes, "hall_stand_S", v(1.4, floor, 2.85));
        sitTargets.water_cooler = { sit: false, facing: -Math.PI / 2 };
        sitTargets.hall_stand_N = { sit: false, facing: 0 };
        sitTargets.hall_stand_S = { sit: false, facing: Math.PI };
        link(nodes, "lounge_door", "hallSE"); link(nodes, "lounge_door", "lounge_center"); link(nodes, "lounge_center", "water_cooler");
        link(nodes, "hallN", "hall_stand_N"); link(nodes, "hallS", "hall_stand_S");

        const panel = createPanel(floor);
        panel.position.set(-1.15, y + 1.25, 1.62);
        group.add(panel);
        const shaftIndicator = createIndicator(0.9, 0.9, String(floor));
        shaftIndicator.position.set(0, y + 2.25, 1.62);
        group.add(shaftIndicator);
        return { floorNumber: floor, nodes, callPanel: panel, shaftIndicator, desks, sitTargets };
    }

    function buildLobby(group) {
        const floor = 0, y = 0;
        const nodes = {}, sitTargets = {}, desks = [];
        hallway(nodes, floor);
        addNode(nodes, "outside", v(0, floor, 12));
        addNode(nodes, "entrance", v(0, floor, 8.6));
        link(nodes, "outside", "entrance"); link(nodes, "entrance", "elevWait");
        box(group, 0, y - 0.03, 12.1, 9, 0.06, 4, solid(0x909090));
        box(group, -0.85, y + 1.05, 9.05, 0.65, 2.1, 0.05, transparent(0x99ddff, 0.35));
        box(group, 0.85, y + 1.05, 9.05, 0.65, 2.1, 0.05, transparent(0x99ddff, 0.35));

        box(group, -9.5, y + 0.55, 1.8, 0.9, 1.1, 5.0, solid(0x7b5d45));
        box(group, -9.5, y + 1.15, 1.8, 1.0, 0.18, 5.1, solid(0x473629));
        box(group, -9.1, y + 1.45, 0.7, 0.35, 0.42, 0.35, solid(0x222222));
        box(group, -9.1, y + 1.35, 2.4, 0.65, 0.25, 0.5, transparent(0xffcc88, 0.45));
        addNode(nodes, "cafe_order", v(-8.6, floor, 1.8));
        addNode(nodes, "cafe_door", v(-3.5, floor, 3.4)); link(nodes, "cafe_door", "hallSW"); link(nodes, "cafe_door", "cafe_order");
        for (let i = 0; i < 4; i++) {
            const x = -7.6 + (i % 2) * 2.2, z = 5.2 + Math.floor(i / 2) * 2.0;
            table(group, x, y, z, 0.8, 0.8, 0x8a6f4d);
            chair(group, x - 0.65, y, z, Math.PI / 2, 0x607d8b);
            chair(group, x + 0.65, y, z, -Math.PI / 2, 0x607d8b);
            addNode(nodes, "bistro_" + i, v(x - 0.65, floor, z));
            link(nodes, "cafe_door", "bistro_" + i);
            sitTargets["bistro_" + i] = { sit: true, facing: Math.PI / 2 };
        }

        couch(group, 7.5, y, 7.0, Math.PI);
        chair(group, 5.6, y, 5.3, Math.PI / 2, 0x7e8aa2);
        chair(group, 9.4, y, 5.3, -Math.PI / 2, 0x7e8aa2);
        table(group, 7.5, y, 5.7, 1.3, 0.65, 0xa0855d);
        ["front_lounge_0", "front_lounge_1", "front_lounge_2"].forEach((n, i) => { addNode(nodes, n, v(6.3 + i, floor, 6.8 - i * 0.6)); link(nodes, "entrance", n); sitTargets[n] = { sit: true, facing: i ? -Math.PI / 2 : 0 }; });

        couch(group, 3.5, y, -6.7, 0);
        couch(group, 3.5, y, -4.6, Math.PI);
        table(group, 3.5, y, -5.65, 1.5, 0.7, 0xa0855d);
        addNode(nodes, "back_lounge_N", v(3.5, floor, -6.7));
        addNode(nodes, "back_lounge_S", v(3.5, floor, -4.6));
        link(nodes, "hallNE", "back_lounge_N"); link(nodes, "hallNE", "back_lounge_S");
        sitTargets.back_lounge_N = { sit: true, facing: Math.PI };
        sitTargets.back_lounge_S = { sit: true, facing: 0 };

        table(group, -7.2, y, -5.8, 1.1, 1.1, 0x77614d);
        [["pit_N", -7.2, -6.65, Math.PI], ["pit_S", -7.2, -4.95, 0], ["pit_E", -6.35, -5.8, -Math.PI / 2], ["pit_W", -8.05, -5.8, Math.PI / 2]].forEach(p => {
            chair(group, p[1], y, p[2], p[3], 0x6d7f99);
            addNode(nodes, p[0], v(p[1], floor, p[2]));
            link(nodes, "hallNW", p[0]);
            sitTargets[p[0]] = { sit: true, facing: p[3] };
        });

        box(group, 4.5, y + 0.55, 7.75, 0.35, 1.1, 0.35, solid(0x78a7d8));
        box(group, 6.0, y + 0.55, -2.8, 0.35, 1.1, 0.35, solid(0x78a7d8));
        box(group, -3.2, y + 0.55, 6.1, 2.0, 1.1, 0.7, solid(0x805c3b));
        box(group, -1.0, y + 0.75, 7.25, 0.65, 1.5, 0.25, solid(0x233142));
        plant(group, -1.9, y, 8.0); plant(group, 2.0, y, 8.0);
        const standing = ["lobby_wc_front", "lobby_wc_back", "reception", "kiosk", "lobby_stand_center", "lobby_stand_NE", "lobby_stand_NW", "lobby_stand_midE", "lobby_stand_midW", "lobby_stand_entry"];
        const pos = [[4.5,7.25],[6,-2.25],[-3.2,5.3],[-1,6.75],[0,5.2],[8,2],[-8,-1],[7,0],[-6,1.5],[0,7.4]];
        standing.forEach((n, i) => { addNode(nodes, n, v(pos[i][0], floor, pos[i][1])); link(nodes, i < 4 ? "entrance" : "hallS", n); sitTargets[n] = { sit: false, facing: i % 2 ? Math.PI / 2 : 0 }; });

        const panel = createPanel(0);
        panel.position.set(-1.15, y + 1.25, 1.62);
        group.add(panel);
        const shaftIndicator = createIndicator(0.9, 0.9, "0");
        shaftIndicator.position.set(0, y + 2.25, 1.62);
        group.add(shaftIndicator);
        return { floorNumber: 0, nodes, callPanel: panel, shaftIndicator, desks, sitTargets, entranceSpot: "outside" };
    }

    function createWorld(scene) {
        const buildingGroup = new THREE.Group();
        buildingGroup.renderOrder = 0;
        scene.add(buildingGroup);
        const slabMat = solid(0x777777);
        const floorMat = transparent(0x999999, 0.3);
        const wallMat = transparent(0x9999ff, 0.2);
        const W = WORLD.BUILDING_WIDTH, D = WORLD.BUILDING_DEPTH, H = WORLD.FLOOR_HEIGHT, S = WORLD.SHAFT_WIDTH;
        box(buildingGroup, 0, -0.08, 0, W, 0.16, D, slabMat);
        for (let f = 1; f < WORLD.FLOOR_COUNT; f++) {
            const y = f * H - 0.05;
            box(buildingGroup, 0, y, -((D + S) / 4), W, 0.12, (D - S) / 2, floorMat);
            box(buildingGroup, 0, y, ((D + S) / 4), W, 0.12, (D - S) / 2, floorMat);
            box(buildingGroup, -((W + S) / 4), y, 0, (W - S) / 2, 0.12, S, floorMat);
            box(buildingGroup, ((W + S) / 4), y, 0, (W - S) / 2, 0.12, S, floorMat);
        }
        box(buildingGroup, 0, WORLD.FLOOR_COUNT * H + 0.05, 0, W, 0.16, D, slabMat);
        const wallY = (WORLD.FLOOR_COUNT * H) / 2;
        box(buildingGroup, -W / 2, wallY, 0, 0.12, WORLD.FLOOR_COUNT * H, D, wallMat);
        box(buildingGroup, W / 2, wallY, 0, 0.12, WORLD.FLOOR_COUNT * H, D, wallMat);
        box(buildingGroup, 0, wallY, -D / 2, W, WORLD.FLOOR_COUNT * H, 0.12, wallMat);
        box(buildingGroup, -6.25, wallY, D / 2, 9.5, WORLD.FLOOR_COUNT * H, 0.12, wallMat);
        box(buildingGroup, 6.25, wallY, D / 2, 9.5, WORLD.FLOOR_COUNT * H, 0.12, wallMat);
        box(buildingGroup, 0, (WORLD.FLOOR_COUNT * H + H) / 2, D / 2, 3, (WORLD.FLOOR_COUNT - 1) * H, 0.12, wallMat);

        const floors = [];
        floors.push(buildLobby(buildingGroup));
        for (let f = 1; f < WORLD.FLOOR_COUNT; f++) floors.push(buildOfficeFloor(buildingGroup, f));
        return { buildingGroup, floors, bfsPath };
    }

    root.WORLD = WORLD;
    root.createWorld = createWorld;
    root.bfsPath = bfsPath;
    root.updateTextTexture = updateTextTexture;
    root.createIndicator = createIndicator;
})(window);
