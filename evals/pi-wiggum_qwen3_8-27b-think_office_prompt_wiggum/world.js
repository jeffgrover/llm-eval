// world.js — building geometry, per-floor layouts, furniture, navigation
// graph, call panels. Exposes window.WORLD, window.createWorld,
// window.bfsPath, window.makeTextTexture, window.updateTextTexture.

(function () {
    "use strict";

    const WORLD = {
        FLOOR_HEIGHT: 3.4, FLOOR_COUNT: 6,
        BUILDING_WIDTH: 22, BUILDING_DEPTH: 18,
        SHAFT_WIDTH: 3, SHAFT_DEPTH: 3,
        PERSON_R: 0.4
    };

    const FH = WORLD.FLOOR_HEIGHT;
    const HW = WORLD.BUILDING_WIDTH / 2;   // 11
    const HD = WORLD.BUILDING_DEPTH / 2;   // 9
    const SH = WORLD.SHAFT_WIDTH / 2;      // 1.5

    // ---------------- materials ----------------

    function transMat(color, opacity) {
        return new THREE.MeshLambertMaterial({
            color: color, transparent: true, opacity: opacity,
            depthWrite: false, side: THREE.DoubleSide
        });
    }

    function solidMat(color) {
        return new THREE.MeshLambertMaterial({ color: color });
    }

    const MAT = {
        slab: transMat(0x888899, 0.3),
        outerWall: transMat(0x9999ff, 0.2),
        innerWall: transMat(0xbbc5e6, 0.28),
        shaftWall: transMat(0x8888aa, 0.18),
        glass: transMat(0xaaddee, 0.3),
        ground: solidMat(0x666670),
        roof: solidMat(0x77777f),
        sidewalk: solidMat(0x9a9a94),
        desk: solidMat(0x8a6240),
        deskTop: solidMat(0xa87c50),
        chair: solidMat(0x444c5c),
        chairWarm: solidMat(0x6b4a3a),
        couch: solidMat(0x4a6741),
        couch2: solidMat(0x6b4a6e),
        tableWood: solidMat(0x9b7653),
        counter: solidMat(0x7a5a3a),
        counterTop: solidMat(0x4a3625),
        monitor: solidMat(0x222228),
        screen: new THREE.MeshBasicMaterial({ color: 0x335577 }),
        cooler: solidMat(0xeeeeee),
        coolerBottle: transMat(0x55aaff, 0.6),
        plantPot: solidMat(0x8a5a30),
        plantLeaf: solidMat(0x2e7d32),
        machine: solidMat(0x333333),
        kiosk: solidMat(0x556677)
    };

    function box(w, h, d, mat) {
        return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    }

    // ---------------- canvas text textures ----------------

    function makeTextTexture(initialText) {
        const canvas = document.createElement("canvas");
        canvas.width = 256; canvas.height = 256;
        const tex = new THREE.CanvasTexture(canvas);
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.generateMipmaps = true;
        tex.anisotropy = 8;
        updateTextTexture(tex, initialText || "");
        return tex;
    }

    function updateTextTexture(tex, text) {
        if (tex._lastText === text) return;   // avoid GPU re-upload every frame
        tex._lastText = text;
        const canvas = tex.image;
        const ctx = canvas.getContext("2d");
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#050505";
        ctx.fillRect(0, 0, 256, 256);
        const size = text.length > 1 ? 150 : 210;  // glyph fills ~82% of canvas
        ctx.font = "bold " + size + "px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.shadowColor = "#ffbb22";
        ctx.shadowBlur = 26;
        ctx.fillStyle = "#ffbb22";
        ctx.fillText(text, 128, 138);
        tex.needsUpdate = true;
    }

    // ---------------- furniture builders ----------------
    // All chairs/couches are built with the OPEN (sitting) side toward
    // local +Z and the backrest at local -Z, so a seated person's
    // rotation.y equals the furniture's rotation.y and the legs always
    // point at (slightly under) the desk, away from the backrest.

    function makeOfficeChair() {
        const g = new THREE.Group();
        const seat = box(0.52, 0.09, 0.5, MAT.chair); seat.position.y = 0.45; g.add(seat);
        const back = box(0.52, 0.55, 0.08, MAT.chair);
        back.position.set(0, 0.75, -0.22); g.add(back);
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.45, 8), MAT.monitor);
        post.position.y = 0.22; g.add(post);
        return g;
    }

    function makeDesk() {
        const g = new THREE.Group();
        const top = box(1.6, 0.08, 0.8, MAT.deskTop); top.position.y = 0.72; g.add(top);
        for (const sx of [-0.72, 0.72]) for (const sz of [-0.32, 0.32]) {
            const leg = box(0.08, 0.7, 0.08, MAT.desk);
            leg.position.set(sx, 0.35, sz); g.add(leg);
        }
        // monitor at the BACK of the desk (local -Z); the user sits on the
        // +Z side of the desk facing -Z (toward the monitor)
        const stand = box(0.1, 0.16, 0.1, MAT.monitor);
        stand.position.set(0, 0.84, -0.25); g.add(stand);
        const mon = box(0.56, 0.36, 0.05, MAT.monitor);
        mon.position.set(0, 1.1, -0.25); g.add(mon);
        const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.48, 0.28), MAT.screen);
        scr.position.set(0, 1.1, -0.22); g.add(scr);
        return g;
    }

    function makeCouch(mat) {
        const g = new THREE.Group();
        const base = box(2.0, 0.42, 0.85, mat); base.position.y = 0.21; g.add(base);
        const back = box(2.0, 0.55, 0.22, mat); back.position.set(0, 0.69, -0.32); g.add(back);
        for (const sx of [-0.95, 0.95]) {
            const arm = box(0.18, 0.3, 0.85, mat);
            arm.position.set(sx, 0.55, 0); g.add(arm);
        }
        return g;
    }

    function makeArmchair(mat) {
        const g = new THREE.Group();
        const base = box(0.85, 0.42, 0.8, mat); base.position.y = 0.21; g.add(base);
        const back = box(0.85, 0.5, 0.2, mat); back.position.set(0, 0.66, -0.3); g.add(back);
        for (const sx of [-0.38, 0.38]) {
            const arm = box(0.14, 0.26, 0.8, mat);
            arm.position.set(sx, 0.54, 0); g.add(arm);
        }
        return g;
    }

    function makeCoffeeTable() {
        const g = new THREE.Group();
        const top = box(1.2, 0.06, 0.7, MAT.tableWood); top.position.y = 0.4; g.add(top);
        for (const sx of [-0.5, 0.5]) for (const sz of [-0.26, 0.26]) {
            const leg = box(0.06, 0.4, 0.06, MAT.tableWood);
            leg.position.set(sx, 0.2, sz); g.add(leg);
        }
        return g;
    }

    function makeConferenceTable() {
        const g = new THREE.Group();
        const top = box(2.6, 0.07, 0.9, MAT.tableWood); top.position.y = 0.74; g.add(top);
        for (const sx of [-1.1, 1.1]) {
            const leg = box(0.12, 0.72, 0.7, MAT.desk);
            leg.position.set(sx, 0.36, 0); g.add(leg);
        }
        return g;
    }

    function makeRoundTable(r) {
        const g = new THREE.Group();
        const top = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.06, 16), MAT.tableWood);
        top.position.y = 0.72; g.add(top);
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.7, 8), MAT.desk);
        pole.position.y = 0.35; g.add(pole);
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.04, 12), MAT.desk);
        base.position.y = 0.02; g.add(base);
        return g;
    }

    function makeBistroChair() {
        const g = new THREE.Group();
        const seat = box(0.42, 0.07, 0.42, MAT.chairWarm); seat.position.y = 0.45; g.add(seat);
        const back = box(0.42, 0.45, 0.06, MAT.chairWarm); back.position.set(0, 0.7, -0.18); g.add(back);
        for (const sx of [-0.16, 0.16]) for (const sz of [-0.16, 0.16]) {
            const leg = box(0.05, 0.45, 0.05, MAT.chairWarm);
            leg.position.set(sx, 0.22, sz); g.add(leg);
        }
        return g;
    }

    function makeWaterCooler() {
        const g = new THREE.Group();
        const body = box(0.4, 1.0, 0.4, MAT.cooler); body.position.y = 0.5; g.add(body);
        const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.45, 12), MAT.coolerBottle);
        bottle.position.y = 1.25; g.add(bottle);
        return g;
    }

    function makePlant() {
        const g = new THREE.Group();
        const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.17, 0.35, 10), MAT.plantPot);
        pot.position.y = 0.18; g.add(pot);
        const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.9, 8), MAT.plantLeaf);
        leaf.position.y = 0.85; g.add(leaf);
        return g;
    }

    function makeKiosk() {
        const g = new THREE.Group();
        const pole = box(0.12, 1.2, 0.12, MAT.kiosk); pole.position.y = 0.6; g.add(pole);
        const screen = box(0.7, 0.5, 0.06, MAT.monitor); screen.position.y = 1.35; g.add(screen);
        const face = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.4), MAT.screen);
        face.position.set(0, 1.35, 0.035); g.add(face);
        return g;
    }

    // ---------------- call panel + shaft indicator ----------------

    function makeArrowGeometry(up) {
        const s = new THREE.Shape();
        if (up) {
            s.moveTo(-0.13, -0.1); s.lineTo(0.13, -0.1); s.lineTo(0, 0.13);
        } else {
            s.moveTo(-0.13, 0.1); s.lineTo(0.13, 0.1); s.lineTo(0, -0.13);
        }
        return new THREE.ShapeGeometry(s);
    }

    const ARROW_OFF_MAT = new THREE.MeshBasicMaterial({ color: 0x2a2f2a });
    const ARROW_ON_MAT = new THREE.MeshBasicMaterial({ color: 0x39ff5e });

    function makeCallPanel() {
        const g = new THREE.Group();
        const plate = box(0.55, 1.4, 0.05, solidMat(0x33363f));
        plate.position.y = 0;
        g.add(plate);

        const upArrow = new THREE.Mesh(makeArrowGeometry(true), ARROW_OFF_MAT);
        upArrow.position.set(0, 0.42, 0.032);
        g.add(upArrow);

        const downArrow = new THREE.Mesh(makeArrowGeometry(false), ARROW_OFF_MAT);
        downArrow.position.set(0, 0.12, 0.032);
        g.add(downArrow);

        const tex = makeTextTexture("0");
        const disp = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.45),
            new THREE.MeshBasicMaterial({ map: tex }));
        disp.position.set(0, -0.38, 0.032);
        g.add(disp);

        g.userData.setUp = function (on) { upArrow.material = on ? ARROW_ON_MAT : ARROW_OFF_MAT; };
        g.userData.setDown = function (on) { downArrow.material = on ? ARROW_ON_MAT : ARROW_OFF_MAT; };
        g.userData.setIndicator = function (text) { updateTextTexture(tex, text); };
        return g;
    }

    function makeShaftIndicator() {
        const tex = makeTextTexture("0");
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9),
            new THREE.MeshBasicMaterial({ map: tex }));
        mesh.userData.setText = function (text) { updateTextTexture(tex, text); };
        return mesh;
    }

    // ---------------- navigation graph ----------------

    function addNode(nodes, name, x, y, z) {
        nodes[name] = { pos: new THREE.Vector3(x, y, z), links: [] };
    }

    function link(nodes, a, b) {
        if (!nodes[a] || !nodes[b]) {
            console.warn("link: missing node", a, b);
            return;
        }
        if (nodes[a].links.indexOf(b) === -1) nodes[a].links.push(b);
        if (nodes[b].links.indexOf(a) === -1) nodes[b].links.push(a);
    }

    function bfsPath(nodes, fromName, toName) {
        if (!nodes[fromName] || !nodes[toName]) return null;
        if (fromName === toName) return [nodes[toName].pos.clone()];
        const prev = {}; prev[fromName] = fromName;
        const queue = [fromName];
        while (queue.length) {
            const cur = queue.shift();
            if (cur === toName) break;
            const ls = nodes[cur].links;
            for (let i = 0; i < ls.length; i++) {
                const nb = ls[i];
                if (!(nb in prev)) { prev[nb] = cur; queue.push(nb); }
            }
        }
        if (!(toName in prev)) return null;
        const names = [];
        let cur = toName;
        while (cur !== fromName) { names.push(cur); cur = prev[cur]; }
        names.push(fromName);
        names.reverse();
        return names.map(function (n) { return nodes[n].pos.clone(); });
    }

    function nearestNodeName(nodes, pos) {
        let best = null, bestD = Infinity;
        for (const name in nodes) {
            const d = nodes[name].pos.distanceToSquared(pos);
            if (d < bestD) { bestD = d; best = name; }
        }
        return best;
    }

    // ---------------- wall building helpers ----------------

    function wallX(group, x, z0, z1, y0, y1, mat) {
        // wall in a constant-x plane
        const h = y1 - y0, d = Math.abs(z1 - z0);
        const m = new THREE.Mesh(new THREE.PlaneGeometry(d, h), mat);
        m.rotation.y = Math.PI / 2;
        m.position.set(x, y0 + h / 2, (z0 + z1) / 2);
        group.add(m);
        return m;
    }

    function wallZ(group, z, x0, x1, y0, y1, mat) {
        // wall in a constant-z plane
        const h = y1 - y0, w = Math.abs(x1 - x0);
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
        m.position.set((x0 + x1) / 2, y0 + h / 2, z);
        group.add(m);
        return m;
    }

    // ---------------- per-floor construction ----------------

    const OFFICE_CENTERS = [-8.25, -2.75, 2.75, 8.25];
    const OFFICE_LETTERS = ["A", "B", "C", "D"];
    const DOOR_W = 1.2;

    function addRingNodes(nodes, y) {
        addNode(nodes, "hallS", 0, y, 3.3);
        addNode(nodes, "hallSE", 2.6, y, 2.6);
        addNode(nodes, "hallE", 2.6, y, 0);
        addNode(nodes, "hallNE", 2.6, y, -2.6);
        addNode(nodes, "hallN", 0, y, -2.45);
        addNode(nodes, "hallNW", -2.6, y, -2.6);
        addNode(nodes, "hallW", -2.6, y, 0);
        addNode(nodes, "hallSW", -2.6, y, 2.6);
        addNode(nodes, "elevWait", 0, y, 2.3);
        const ring = ["hallS", "hallSE", "hallE", "hallNE", "hallN", "hallNW", "hallW", "hallSW"];
        for (let i = 0; i < ring.length; i++) link(nodes, ring[i], ring[(i + 1) % ring.length]);
        link(nodes, "elevWait", "hallS");
    }

    function placeChairAt(group, chair, x, y, z, ry) {
        chair.position.set(x, y, z);
        chair.rotation.y = ry;
        group.add(chair);
        return chair;
    }

    // Build one office floor (floors 1..5)
    function buildOfficeFloor(group, floorNumber) {
        const y = floorNumber * FH;
        const nodes = {};
        const sitTargets = {};
        const desks = [];
        addRingNodes(nodes, y);

        // ---- interior walls ----
        const wt = y, wtTop = y + FH;
        // office front wall (z=-3) with 4 door gaps
        const segs = [[-HW, OFFICE_CENTERS[0] - DOOR_W / 2]];
        for (let i = 0; i < 3; i++) {
            segs.push([OFFICE_CENTERS[i] + DOOR_W / 2, OFFICE_CENTERS[i + 1] - DOOR_W / 2]);
        }
        segs.push([OFFICE_CENTERS[3] + DOOR_W / 2, HW]);
        segs.forEach(function (s) { wallZ(group, -3, s[0], s[1], wt, wtTop, MAT.innerWall); });
        // office dividers
        [-5.5, 0, 5.5].forEach(function (x) { wallX(group, x, -HD, -3, wt, wtTop, MAT.innerWall); });
        // conference room: north wall z=3 (gap at x=-4), east wall x=-3
        wallZ(group, 3, -HW, -4.6, wt, wtTop, MAT.innerWall);
        wallZ(group, 3, -3.4, -3, wt, wtTop, MAT.innerWall);
        wallX(group, -3, 3, HD, wt, wtTop, MAT.innerWall);
        // lounge: north wall z=3 (gap at x=4), west wall x=3
        wallZ(group, 3, 3, 3.4, wt, wtTop, MAT.innerWall);
        wallZ(group, 3, 4.6, HW, wt, wtTop, MAT.innerWall);
        wallX(group, 3, 3, HD, wt, wtTop, MAT.innerWall);

        // ---- offices: desk + chair + nodes ----
        for (let i = 0; i < 4; i++) {
            const cx = OFFICE_CENTERS[i];
            const L = OFFICE_LETTERS[i];
            const desk = makeDesk();
            desk.position.set(cx, y, -7.6);
            group.add(desk);
            const chair = placeChairAt(group, makeOfficeChair(), cx, y, -6.55, Math.PI);

            const doorWp = "office" + L + "_door";
            const deskWp = "office" + L + "_desk";
            addNode(nodes, doorWp, cx, y, -2.5);
            addNode(nodes, deskWp, cx, y, -6.55);
            link(nodes, doorWp, deskWp);
            link(nodes, doorWp, cx < 0 ? "hallNW" : "hallNE");
            // the person sits facing the monitor (-Z) with the chair's
            // backrest behind them (+Z side)
            sitTargets[deskWp] = { sit: true, facing: Math.PI };
            desks.push({
                id: "f" + floorNumber + "_" + L,
                floor: floorNumber, letter: L,
                deskWp: deskWp, doorWp: doorWp
            });
        }

        // ---- conference room ----
        const confTable = makeConferenceTable();
        confTable.position.set(-7, y, 6.0);
        group.add(confTable);
        const confSeatDefs = [
            { x: -7.75, z: 4.95, ry: 0 }, { x: -6.25, z: 4.95, ry: 0 },
            { x: -7.75, z: 7.05, ry: Math.PI }, { x: -6.25, z: 7.05, ry: Math.PI }
        ];
        addNode(nodes, "conf_door", -4, y, 3.0);
        addNode(nodes, "conf_center", -7, y, 4.3);
        addNode(nodes, "conf_side", -4.6, y, 6.0);
        addNode(nodes, "conf_back", -7, y, 7.3);
        link(nodes, "conf_door", "hallSW");
        link(nodes, "conf_door", "conf_center");
        link(nodes, "conf_center", "conf_side");
        link(nodes, "conf_side", "conf_back");
        confSeatDefs.forEach(function (s, i) {
            placeChairAt(group, makeOfficeChair(), s.x, y, s.z, s.ry);
            const wp = "conf_seat" + i;
            addNode(nodes, wp, s.x, y, s.z);
            link(nodes, wp, i < 2 ? "conf_center" : "conf_back");
            sitTargets[wp] = { sit: true, facing: s.ry };
        });

        // ---- lounge ----
        const couch = placeChairAt(group, makeCouch(MAT.couch), 9.9, y, 6.0, -Math.PI / 2);
        const ctable = makeCoffeeTable(); ctable.position.set(7.4, y, 6.0); group.add(ctable);
        placeChairAt(group, makeArmchair(MAT.couch2), 5.8, y, 7.4, 2.29);
        placeChairAt(group, makeArmchair(MAT.couch2), 5.8, y, 4.6, 0.85);
        const cooler = makeWaterCooler(); cooler.position.set(10.3, y, 3.7); group.add(cooler);
        const plant = makePlant(); plant.position.set(3.6, y, 8.4); group.add(plant);

        addNode(nodes, "lounge_door", 4, y, 3.0);
        addNode(nodes, "lounge_center", 6.9, y, 3.9);
        addNode(nodes, "lounge_spot0", 9.9, y, 6.0);
        addNode(nodes, "lounge_spot1", 5.8, y, 7.4);
        addNode(nodes, "lounge_spot2", 5.8, y, 4.6);
        addNode(nodes, "water_cooler", 9.5, y, 3.7);
        link(nodes, "lounge_door", "hallSE");
        link(nodes, "lounge_door", "lounge_center");
        link(nodes, "lounge_center", "lounge_spot0");
        link(nodes, "lounge_center", "lounge_spot1");
        link(nodes, "lounge_center", "lounge_spot2");
        link(nodes, "lounge_center", "water_cooler");
        sitTargets["lounge_spot0"] = { sit: true, facing: -Math.PI / 2 };
        sitTargets["lounge_spot1"] = { sit: true, facing: 2.29 };
        sitTargets["lounge_spot2"] = { sit: true, facing: 0.85 };
        sitTargets["water_cooler"] = { sit: false, facing: Math.PI / 2 };

        // ---- hallway loiter spots ----
        addNode(nodes, "hall_stand_N", 5.5, y, -2.2);
        addNode(nodes, "hall_stand_S", 0, y, 5.8);
        link(nodes, "hall_stand_N", "hallNE");
        link(nodes, "hall_stand_S", "hallS");
        sitTargets["hall_stand_N"] = { sit: false, facing: 0 };
        sitTargets["hall_stand_S"] = { sit: false, facing: Math.PI };

        return {
            floorNumber: floorNumber, nodes: nodes, sitTargets: sitTargets, desks: desks,
            confSeats: ["conf_seat0", "conf_seat1", "conf_seat2", "conf_seat3"],
            loungeSpots: ["lounge_spot0", "lounge_spot1", "lounge_spot2"],
            standSpots: ["water_cooler", "hall_stand_N", "hall_stand_S"]
        };
    }

    // Build the ground-floor lobby
    function buildLobby(group) {
        const y = 0;
        const nodes = {};
        const sitTargets = {};
        addRingNodes(nodes, y);

        // ---- entrance glass doors (propped open, visual only) + plants ----
        for (const side of [-1, 1]) {
            const hinge = new THREE.Group();
            hinge.position.set(side * 1.5, y, HD);
            const panel = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.6), MAT.glass);
            panel.position.set(-side * 0.7, 1.3, 0);
            hinge.add(panel);
            hinge.rotation.y = side * 0.95;   // swung open into the lobby
            group.add(hinge);
            const plant = makePlant();
            plant.position.set(side * 2.3, y, 8.5);
            group.add(plant);
        }

        // ---- sidewalk (real opening, agents cross the threshold) ----
        const sidewalk = box(12, 0.08, 5, MAT.sidewalk);
        sidewalk.position.set(0, -0.03, HD + 2.6);
        group.add(sidewalk);

        // explicit entrance chain: outside -> front_door_threshold -> entrance
        // -> lobby_center, all linked in order toward the elevator
        addNode(nodes, "outside", 0, y, 12);
        addNode(nodes, "front_door_threshold", 0, y, 9.35);
        addNode(nodes, "entrance", 0, y, 7.4);
        addNode(nodes, "lobby_center", 0, y, 4.9);
        link(nodes, "outside", "front_door_threshold");
        link(nodes, "front_door_threshold", "entrance");
        link(nodes, "entrance", "lobby_center");
        link(nodes, "lobby_center", "elevWait");   // direct: don't bounce via hallS
        link(nodes, "entrance", "elevWait");       // direct shortcut for BFS
        link(nodes, "lobby_center", "hallS");

        // ---- cafe (left/west side, front) ----
        const counter = box(1.0, 1.05, 3.6, MAT.counter);
        counter.position.set(-10.4, y + 0.525, 4.3); group.add(counter);
        const ctop = box(1.1, 0.06, 3.7, MAT.counterTop);
        ctop.position.set(-10.4, y + 1.08, 4.3); group.add(ctop);
        const machine = box(0.45, 0.55, 0.45, MAT.machine);
        machine.position.set(-10.4, y + 1.38, 3.2); group.add(machine);
        const pastry = box(0.7, 0.4, 0.5, MAT.glass);
        pastry.position.set(-10.4, y + 1.31, 5.2); group.add(pastry);

        addNode(nodes, "cafe_door", -3.6, y, 3.0);
        addNode(nodes, "cafe_hub", -7.1, y, 4.3);
        addNode(nodes, "cafe_order", -9.55, y, 4.3);
        link(nodes, "cafe_door", "hallSW");
        link(nodes, "cafe_door", "cafe_hub");
        link(nodes, "cafe_hub", "cafe_order");
        sitTargets["cafe_order"] = { sit: false, facing: -Math.PI / 2 };

        // bistro tables (2x2 grid), chairs east+west of each
        const bistroPos = [[-8.8, 2.6], [-5.4, 2.6], [-8.8, 6.0], [-5.4, 6.0]];
        const bistroChairs = [];
        bistroPos.forEach(function (p, i) {
            const t = makeRoundTable(0.55);
            t.position.set(p[0], y, p[1]); group.add(t);
            const defs = [
                { x: p[0] - 0.95, z: p[1], ry: Math.PI / 2 },
                { x: p[0] + 0.95, z: p[1], ry: -Math.PI / 2 }
            ];
            defs.forEach(function (d, j) {
                placeChairAt(group, makeBistroChair(), d.x, y, d.z, d.ry);
                const wp = "bistro" + i + (j === 0 ? "a" : "b");
                addNode(nodes, wp, d.x, y, d.z);
                link(nodes, wp, "cafe_hub");
                sitTargets[wp] = { sit: true, facing: d.ry };
                bistroChairs.push(wp);
            });
        });

        // ---- front lounge (right/east side, front) ----
        placeChairAt(group, makeCouch(MAT.couch), 9.9, y, 6.0, -Math.PI / 2);
        const ftable = makeCoffeeTable(); ftable.position.set(7.4, y, 6.0); group.add(ftable);
        placeChairAt(group, makeArmchair(MAT.couch2), 5.8, y, 7.4, 2.29);
        placeChairAt(group, makeArmchair(MAT.couch2), 5.8, y, 4.6, 0.85);
        const wcF = makeWaterCooler(); wcF.position.set(10.45, y, 8.3); group.add(wcF);

        addNode(nodes, "fl_hub", 7.0, y, 2.8);
        addNode(nodes, "fl_hub2", 9.2, y, 7.6);
        addNode(nodes, "flounge_couch0", 9.9, y, 5.5);
        addNode(nodes, "flounge_couch1", 9.9, y, 6.5);
        addNode(nodes, "flounge_chair0", 5.8, y, 7.4);
        addNode(nodes, "flounge_chair1", 5.8, y, 4.6);
        addNode(nodes, "lobby_wc_front", 9.7, y, 8.3);
        link(nodes, "fl_hub", "hallSE");
        link(nodes, "fl_hub", "fl_hub2");
        link(nodes, "fl_hub", "flounge_couch0");
        link(nodes, "fl_hub", "flounge_couch1");
        link(nodes, "fl_hub", "flounge_chair0");
        link(nodes, "fl_hub", "flounge_chair1");
        link(nodes, "fl_hub2", "lobby_wc_front");
        sitTargets["flounge_couch0"] = { sit: true, facing: -Math.PI / 2 };
        sitTargets["flounge_couch1"] = { sit: true, facing: -Math.PI / 2 };
        sitTargets["flounge_chair0"] = { sit: true, facing: 2.29 };
        sitTargets["flounge_chair1"] = { sit: true, facing: 0.85 };
        sitTargets["lobby_wc_front"] = { sit: false, facing: Math.PI / 2 };

        // ---- back lounge (east, rear): two couches across a coffee table ----
        placeChairAt(group, makeCouch(MAT.couch2), 6.5, y, -6.6, 0);
        placeChairAt(group, makeCouch(MAT.couch), 6.5, y, -3.4, Math.PI);
        const btable = makeCoffeeTable(); btable.position.set(6.5, y, -5.0); group.add(btable);
        const wcB = makeWaterCooler(); wcB.position.set(10.45, y, -8.3); group.add(wcB);

        addNode(nodes, "back_hub", 2.6, y, -4.5);
        addNode(nodes, "back_lounge_N", 6.5, y, -6.6);
        addNode(nodes, "back_lounge_S", 6.5, y, -3.4);
        addNode(nodes, "lobby_stand_NE", 9.0, y, -6.2);
        addNode(nodes, "lobby_wc_back", 9.7, y, -8.3);
        link(nodes, "back_hub", "hallNE");
        link(nodes, "back_hub", "back_lounge_N");
        link(nodes, "back_hub", "back_lounge_S");
        link(nodes, "back_hub", "lobby_stand_NE");
        link(nodes, "lobby_stand_NE", "lobby_wc_back");
        sitTargets["back_lounge_N"] = { sit: true, facing: 0 };
        sitTargets["back_lounge_S"] = { sit: true, facing: Math.PI };
        sitTargets["lobby_stand_NE"] = { sit: false, facing: Math.PI };
        sitTargets["lobby_wc_back"] = { sit: false, facing: Math.PI / 2 };

        // ---- conversation pit (west, rear) ----
        const pitTable = makeRoundTable(0.6);
        pitTable.position.set(-7, y, -5.5); group.add(pitTable);
        const pitDefs = [
            { wp: "pit_N", x: -7, z: -7.05, ry: 0 },
            { wp: "pit_S", x: -7, z: -3.95, ry: Math.PI },
            { wp: "pit_E", x: -5.45, z: -5.5, ry: -Math.PI / 2 },
            { wp: "pit_W", x: -8.55, z: -5.5, ry: Math.PI / 2 }
        ];
        addNode(nodes, "pit_hub", -4.6, y, -3.2);
        addNode(nodes, "back_west_hub", -9.0, y, -3.4);
        addNode(nodes, "lobby_stand_NW", -9.3, y, -7.6);
        link(nodes, "pit_hub", "back_hub");
        link(nodes, "pit_hub", "hallW");
        link(nodes, "back_west_hub", "hallW");
        link(nodes, "back_west_hub", "pit_hub");
        link(nodes, "back_west_hub", "lobby_stand_NW");
        pitDefs.forEach(function (d) {
            placeChairAt(group, makeArmchair(MAT.couch2), d.x, y, d.z, d.ry);
            addNode(nodes, d.wp, d.x, y, d.z);
            link(nodes, d.wp, "pit_hub");
            sitTargets[d.wp] = { sit: true, facing: d.ry };
        });
        sitTargets["lobby_stand_NW"] = { sit: false, facing: 0 };

        // ---- reception desk + kiosk ----
        const rdesk = box(1.6, 1.0, 0.7, MAT.counter);
        rdesk.position.set(-3.2, y + 0.5, 6.4); group.add(rdesk);
        const rtop = box(1.7, 0.06, 0.8, MAT.counterTop);
        rtop.position.set(-3.2, y + 1.03, 6.4); group.add(rtop);
        const kiosk = makeKiosk(); kiosk.position.set(2.8, y, 7.4); group.add(kiosk);

        addNode(nodes, "reception", -2.35, y, 6.4);
        addNode(nodes, "kiosk", 2.8, y, 6.55);
        link(nodes, "reception", "lobby_center");
        link(nodes, "reception", "hallS");
        link(nodes, "kiosk", "lobby_center");
        sitTargets["reception"] = { sit: false, facing: -Math.PI / 2 };
        sitTargets["kiosk"] = { sit: false, facing: 0 };

        // ---- generic loiter waypoints ----
        const loiter = [
            ["lobby_stand_center", 1.8, 4.8, ["hallS", "lobby_center"]],
            ["lobby_stand_midE", 4.6, 0.6, ["hallE"]],
            ["lobby_stand_midW", -4.8, 0.6, ["hallW"]],
            ["lobby_stand_entry", 3.4, 7.8, ["entrance", "kiosk"]]
        ];
        loiter.forEach(function (d) {
            addNode(nodes, d[0], d[1], y, d[2]);
            d[3].forEach(function (t) { link(nodes, d[0], t); });
            sitTargets[d[0]] = { sit: false, facing: Math.PI };
        });

        const standSpots = ["lobby_stand_center", "lobby_stand_NE", "lobby_stand_NW",
            "lobby_stand_midE", "lobby_stand_midW", "lobby_stand_entry"];

        return {
            floorNumber: 0, nodes: nodes, sitTargets: sitTargets, desks: [],
            bistroChairs: bistroChairs,
            cafeOrder: "cafe_order",
            frontLoungeSeats: ["flounge_couch0", "flounge_couch1", "flounge_chair0", "flounge_chair1"],
            backLoungeSeats: ["back_lounge_N", "back_lounge_S"],
            pitSeats: ["pit_N", "pit_S", "pit_E", "pit_W"],
            standSpots: standSpots,
            quickStops: ["reception", "kiosk", "lobby_wc_front", "lobby_wc_back"],
            entranceSpot: "entrance", outsideSpot: "outside"
        };
    }

    // ---------------- top-level world ----------------

    function createWorld(scene) {
        const buildingGroup = new THREE.Group();
        buildingGroup.renderOrder = 0;
        const topY = WORLD.FLOOR_COUNT * FH;

        // ground slab + roof (solid)
        const ground = box(WORLD.BUILDING_WIDTH + 10, 0.3, WORLD.BUILDING_DEPTH + 14, MAT.ground);
        ground.position.y = -0.15;
        buildingGroup.add(ground);
        const roof = box(WORLD.BUILDING_WIDTH, 0.25, WORLD.BUILDING_DEPTH, MAT.roof);
        roof.position.y = topY + 0.125;
        buildingGroup.add(roof);

        // intermediate slabs: four strips around the shaft opening
        for (let f = 1; f < WORLD.FLOOR_COUNT; f++) {
            const fy = f * FH - 0.06;
            const north = box(WORLD.BUILDING_WIDTH, 0.12, HD - SH, MAT.slab);
            north.position.set(0, fy, -(SH + (HD - SH) / 2));
            const south = box(WORLD.BUILDING_WIDTH, 0.12, HD - SH, MAT.slab);
            south.position.set(0, fy, SH + (HD - SH) / 2);
            const west = box(HW - SH, 0.12, WORLD.SHAFT_DEPTH, MAT.slab);
            west.position.set(-(SH + (HW - SH) / 2), fy, 0);
            const east = box(HW - SH, 0.12, WORLD.SHAFT_DEPTH, MAT.slab);
            east.position.set(SH + (HW - SH) / 2, fy, 0);
            buildingGroup.add(north, south, west, east);
        }

        // outer walls (semi-transparent blue); the floor-0 front wall is split
        // into left/right segments leaving a real 3-unit gap centered on x=0
        wallZ(buildingGroup, -HD, -HW, HW, 0, topY, MAT.outerWall);           // back
        wallX(buildingGroup, -HW, -HD, HD, 0, topY, MAT.outerWall);           // left
        wallX(buildingGroup, HW, -HD, HD, 0, topY, MAT.outerWall);            // right
        wallZ(buildingGroup, HD, -HW, -1.5, 0, topY, MAT.outerWall);          // front-left
        wallZ(buildingGroup, HD, 1.5, HW, 0, topY, MAT.outerWall);            // front-right
        wallZ(buildingGroup, HD, -1.5, 1.5, FH, topY, MAT.outerWall);         // front, above entrance

        // shaft walls: back + sides full height; front strips beside the doors
        wallZ(buildingGroup, -SH, -SH, SH, 0, topY, MAT.shaftWall);
        wallX(buildingGroup, -SH, -SH, SH, 0, topY, MAT.shaftWall);
        wallX(buildingGroup, SH, -SH, SH, 0, topY, MAT.shaftWall);
        for (let f = 0; f < WORLD.FLOOR_COUNT; f++) {
            const fy = f * FH;
            wallZ(buildingGroup, SH, -SH, -0.9, fy, fy + FH, MAT.shaftWall);
            wallZ(buildingGroup, SH, 0.9, SH, fy, fy + FH, MAT.shaftWall);
            wallZ(buildingGroup, SH, -0.9, 0.9, fy + 2.4, fy + FH, MAT.shaftWall); // header above doors
        }

        // floors
        const floors = [];
        for (let f = 0; f < WORLD.FLOOR_COUNT; f++) {
            const floor = (f === 0) ? buildLobby(buildingGroup) : buildOfficeFloor(buildingGroup, f);
            const fy = f * FH;

            // call panel beside the doors, facing +Z
            const panel = makeCallPanel();
            panel.position.set(1.2, fy + 1.35, SH + 0.04);
            buildingGroup.add(panel);
            floor.callPanel = panel;

            // shaft indicator above the doors, facing +Z
            const ind = makeShaftIndicator();
            ind.position.set(0, fy + 2.85, SH + 0.04);
            buildingGroup.add(ind);
            floor.shaftIndicator = ind;

            floors.push(floor);
        }

        scene.add(buildingGroup);

        return {
            buildingGroup: buildingGroup,
            floors: floors,
            bfsPath: bfsPath,
            nearestNodeName: nearestNodeName
        };
    }

    window.WORLD = WORLD;
    window.createWorld = createWorld;
    window.bfsPath = bfsPath;
    window.nearestNodeName = nearestNodeName;
    window.makeTextTexture = makeTextTexture;
    window.updateTextTexture = updateTextTexture;
})();
