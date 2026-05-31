// world.js — building geometry, per-floor layouts, furniture, navigation graph,
// call panels. Exposes window.createWorld(scene), window.WORLD, window.bfsPath.
(function (root) {
    "use strict";

    const WORLD = {
        FLOOR_HEIGHT: 3.4, FLOOR_COUNT: 6,
        BUILDING_WIDTH: 22, BUILDING_DEPTH: 18,
        SHAFT_WIDTH: 3, SHAFT_DEPTH: 3,
        PERSON_R: 0.4,
    };
    const FH = WORLD.FLOOR_HEIGHT;
    const HALF_W = WORLD.BUILDING_WIDTH / 2;   // 11
    const HALF_D = WORLD.BUILDING_DEPTH / 2;   // 9
    const SHW = WORLD.SHAFT_WIDTH / 2;         // 1.5
    const SHD = WORLD.SHAFT_DEPTH / 2;         // 1.5
    const WALL_H = WORLD.FLOOR_COUNT * FH;     // 20.4

    // ---- material helpers -------------------------------------------------
    function lambert(color, opts) {
        const m = new THREE.MeshLambertMaterial(Object.assign({ color: color }, opts || {}));
        if (m.opacity < 1 || (opts && opts.transparent)) {
            m.transparent = true; m.depthWrite = false; m.side = THREE.DoubleSide;
        }
        return m;
    }
    function box(w, h, d, mat) { return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); }

    const MAT = {
        slabSolid: lambert(0x888888),
        slabTrans: lambert(0x999999, { opacity: 0.3, transparent: true }),
        outerWall: lambert(0x9999ff, { opacity: 0.2, transparent: true }),
        innerWall: lambert(0xbbc5e6, { opacity: 0.28, transparent: true }),
        glass: lambert(0xaaddee, { opacity: 0.22, transparent: true }),
        sidewalk: lambert(0x9a9a92),
        desk: lambert(0x8a6a44),
        deskTop: lambert(0x5a4530),
        monitor: lambert(0x111122),
        chair: lambert(0x33384a),
        table: lambert(0x6b5038),
        couch: lambert(0x4a6a55),
        armchair: lambert(0x7a5a6a),
        counter: lambert(0x77625a),
        counterTop: lambert(0x3a2f2a),
        appliance: lambert(0xcccccc),
        cooler: lambert(0x88bbdd, { opacity: 0.85, transparent: true }),
        plantPot: lambert(0x884422),
        plant: lambert(0x227744),
        panelPlate: lambert(0x222228),
        lampDark: new THREE.MeshBasicMaterial({ color: 0x224422 }),
        lampUp: new THREE.MeshBasicMaterial({ color: 0x33ff66 }),
        lampDown: new THREE.MeshBasicMaterial({ color: 0x33ff66 }),
    };

    // ---- canvas-texture indicators ----------------------------------------
    function makeCanvasTexture() {
        const canvas = document.createElement("canvas");
        canvas.width = 256; canvas.height = 256;
        const tex = new THREE.CanvasTexture(canvas);
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.generateMipmaps = true;
        tex.anisotropy = 8;
        tex._canvas = canvas;
        tex._lastText = null;
        return tex;
    }
    function updateTextTexture(tex, text) {
        if (tex._lastText === text) return;     // cache — avoid re-uploading every frame
        tex._lastText = text;
        const c = tex._canvas, ctx = c.getContext("2d");
        ctx.clearRect(0, 0, 256, 256);
        ctx.fillStyle = "#050505"; ctx.fillRect(0, 0, 256, 256);
        ctx.fillStyle = "#ffbb22";
        ctx.shadowColor = "#ffbb22"; ctx.shadowBlur = 22;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.font = "bold 200px monospace";   // glyph fills ~82% of the 256 px canvas
        ctx.fillText(text, 128, 140);
        tex.needsUpdate = true;
    }

    function triGeometry(hw, up) {
        const s = new THREE.Shape();
        if (up) { s.moveTo(-hw, -hw); s.lineTo(hw, -hw); s.lineTo(0, hw); }
        else { s.moveTo(-hw, hw); s.lineTo(hw, hw); s.lineTo(0, -hw); }
        s.closePath();
        return new THREE.ShapeGeometry(s);
    }

    function createCallPanel() {
        const grp = new THREE.Group();
        const plate = box(0.55, 1.4, 0.05, MAT.panelPlate);
        grp.add(plate);

        const upDark = MAT.lampDark.clone(), upLit = MAT.lampUp.clone();
        const dnDark = MAT.lampDark.clone(), dnLit = MAT.lampDown.clone();
        const up = new THREE.Mesh(triGeometry(0.13, true), upDark);
        up.position.set(0, 0.42, 0.04);
        const down = new THREE.Mesh(triGeometry(0.13, false), dnDark);
        down.position.set(0, 0.08, 0.04);

        const tex = makeCanvasTexture(); updateTextTexture(tex, "0");
        const disp = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.45),
            new THREE.MeshBasicMaterial({ map: tex }));
        disp.position.set(0, -0.42, 0.04);

        grp.add(up, down, disp);
        grp.userData.setUp = function (on) { up.material = on ? upLit : upDark; };
        grp.userData.setDown = function (on) { down.material = on ? dnLit : dnDark; };
        grp.userData.setIndicator = function (t) { updateTextTexture(tex, t); };
        return grp;
    }

    function createIndicatorPlane(size) {
        const tex = makeCanvasTexture(); updateTextTexture(tex, "0");
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size),
            new THREE.MeshBasicMaterial({ map: tex }));
        mesh.userData.setIndicator = function (t) { updateTextTexture(tex, t); };
        return mesh;
    }

    // ---- navigation graph -------------------------------------------------
    function mkNode(nodes, name, x, y, z) {
        nodes[name] = { name: name, pos: new THREE.Vector3(x, y, z), nbr: [] };
        return nodes[name];
    }
    function link(nodes, a, b) {
        if (!nodes[a] || !nodes[b]) return;
        if (nodes[a].nbr.indexOf(b) === -1) nodes[a].nbr.push(b);
        if (nodes[b].nbr.indexOf(a) === -1) nodes[b].nbr.push(a);
    }

    function bfsPath(nodes, fromName, toName) {
        if (!nodes[fromName] || !nodes[toName]) return [];
        if (fromName === toName) return [nodes[fromName].pos.clone()];
        const prev = {}; const seen = {}; const q = [fromName];
        seen[fromName] = true;
        while (q.length) {
            const cur = q.shift();
            if (cur === toName) break;
            const nb = nodes[cur].nbr;
            for (let i = 0; i < nb.length; i++) {
                if (!seen[nb[i]]) { seen[nb[i]] = true; prev[nb[i]] = cur; q.push(nb[i]); }
            }
        }
        if (!seen[toName]) return [nodes[toName].pos.clone()];
        const path = []; let c = toName;
        while (c !== undefined) { path.unshift(nodes[c].pos.clone()); c = prev[c]; }
        return path;
    }

    // ---- hallway ring shared by every floor -------------------------------
    function buildRing(nodes, fy) {
        mkNode(nodes, "hallS", 0, fy, 3);
        mkNode(nodes, "hallSE", 3, fy, 3);
        mkNode(nodes, "hallE", 3.6, fy, 0);
        mkNode(nodes, "hallNE", 3, fy, -3);
        mkNode(nodes, "hallN", 0, fy, -3);
        mkNode(nodes, "hallNW", -3, fy, -3);
        mkNode(nodes, "hallW", -3.6, fy, 0);
        mkNode(nodes, "hallSW", -3, fy, 3);
        mkNode(nodes, "elevWait", 0, fy, 2.5);
        const ring = ["hallS", "hallSE", "hallE", "hallNE", "hallN", "hallNW", "hallW", "hallSW"];
        for (let i = 0; i < ring.length; i++) link(nodes, ring[i], ring[(i + 1) % ring.length]);
        link(nodes, "elevWait", "hallS");
    }

    // ---- furniture builders ----------------------------------------------
    // A chair whose sitter (after group.rotation.y = faceY) faces +local Z;
    // backrest sits behind on -local Z, so the seat opens toward the sitter's front.
    function buildChair(faceY) {
        const g = new THREE.Group();
        const seat = box(0.5, 0.1, 0.5, MAT.chair); seat.position.y = 0.46; g.add(seat);
        const backrest = box(0.5, 0.55, 0.08, MAT.chair);
        backrest.position.set(0, 0.72, -0.21); g.add(backrest);
        const legGeo = [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]];
        legGeo.forEach(function (p) {
            const l = box(0.06, 0.46, 0.06, MAT.chair); l.position.set(p[0], 0.23, p[1]); g.add(l);
        });
        g.rotation.y = faceY;
        return g;
    }
    function buildArmchair(faceY) {
        const g = new THREE.Group();
        const seat = box(0.8, 0.25, 0.8, MAT.armchair); seat.position.y = 0.45; g.add(seat);
        const back = box(0.8, 0.6, 0.18, MAT.armchair); back.position.set(0, 0.78, -0.32); g.add(back);
        const aL = box(0.16, 0.3, 0.8, MAT.armchair); aL.position.set(-0.32, 0.62, 0); g.add(aL);
        const aR = box(0.16, 0.3, 0.8, MAT.armchair); aR.position.set(0.32, 0.62, 0); g.add(aR);
        g.rotation.y = faceY;
        return g;
    }
    function buildCouch(faceY) {
        const g = new THREE.Group();
        const seat = box(2.0, 0.3, 0.8, MAT.couch); seat.position.y = 0.4; g.add(seat);
        const back = box(2.0, 0.55, 0.18, MAT.couch); back.position.set(0, 0.72, -0.32); g.add(back);
        const aL = box(0.18, 0.4, 0.8, MAT.couch); aL.position.set(-1.0, 0.6, 0); g.add(aL);
        const aR = box(0.18, 0.4, 0.8, MAT.couch); aR.position.set(1.0, 0.6, 0); g.add(aR);
        g.rotation.y = faceY;
        return g;
    }
    function buildDesk() {
        const g = new THREE.Group();
        const top = box(1.6, 0.08, 0.8, MAT.deskTop); top.position.y = 0.75; g.add(top);
        [[-0.7, -0.3], [0.7, -0.3], [-0.7, 0.3], [0.7, 0.3]].forEach(function (p) {
            const l = box(0.08, 0.75, 0.08, MAT.desk); l.position.set(p[0], 0.375, p[1]); g.add(l);
        });
        const screen = box(0.7, 0.45, 0.05, MAT.monitor);
        screen.position.set(0, 1.08, -0.28); g.add(screen);
        const stand = box(0.1, 0.18, 0.1, MAT.monitor); stand.position.set(0, 0.86, -0.28); g.add(stand);
        return g;
    }
    function buildTable(w, d) {
        const g = new THREE.Group();
        const top = box(w, 0.1, d, MAT.table); top.position.y = 0.72; g.add(top);
        const ix = w / 2 - 0.2, iz = d / 2 - 0.2;
        [[-ix, -iz], [ix, -iz], [-ix, iz], [ix, iz]].forEach(function (p) {
            const l = box(0.1, 0.72, 0.1, MAT.table); l.position.set(p[0], 0.36, p[1]); g.add(l);
        });
        return g;
    }
    function buildRoundTable(r) {
        const g = new THREE.Group();
        const top = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.1, 20), MAT.table);
        top.position.y = 0.72; g.add(top);
        const leg = box(0.12, 0.72, 0.12, MAT.table); leg.position.y = 0.36; g.add(leg);
        return g;
    }
    function buildCoffeeTable(w, d) {
        const g = new THREE.Group();
        const top = box(w, 0.08, d, MAT.table); top.position.y = 0.36; g.add(top);
        return g;
    }
    function buildCooler() {
        const g = new THREE.Group();
        const body = box(0.4, 0.5, 0.4, MAT.appliance); body.position.y = 0.25; g.add(body);
        const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.4, 12), MAT.cooler);
        bottle.position.y = 0.7; g.add(bottle);
        return g;
    }
    function buildPlant(x, y, z, group) {
        const g = new THREE.Group();
        const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.16, 0.4, 12), MAT.plantPot);
        pot.position.y = 0.2; g.add(pot);
        const foliage = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 8), MAT.plant);
        foliage.position.y = 0.75; g.add(foliage);
        g.position.set(x, y, z); group.add(g);
    }

    // straight wall segment as a thin box between two endpoints
    function wall(group, x1, z1, x2, z2, yBase, h, mat) {
        const dx = x2 - x1, dz = z2 - z1;
        const len = Math.sqrt(dx * dx + dz * dz);
        const m = box(len, h, 0.16, mat);
        m.position.set((x1 + x2) / 2, yBase + h / 2, (z1 + z2) / 2);
        m.rotation.y = Math.atan2(dx, dz) - Math.PI / 2;
        group.add(m);
    }

    // ---- shell (slabs, roof, outer walls) ---------------------------------
    function buildShell(group) {
        // ground slab + sidewalk
        const ground = box(WORLD.BUILDING_WIDTH, 0.2, WORLD.BUILDING_DEPTH, MAT.slabSolid);
        ground.position.set(0, -0.1, 0); group.add(ground);
        const sidewalk = box(WORLD.BUILDING_WIDTH, 0.16, 8, MAT.sidewalk);
        sidewalk.position.set(0, -0.08, HALF_D + 4); group.add(sidewalk);

        // roof
        const roof = box(WORLD.BUILDING_WIDTH, 0.2, WORLD.BUILDING_DEPTH, MAT.slabSolid);
        roof.position.set(0, WALL_H + 0.1, 0); group.add(roof);

        // intermediate floor slabs: four strips around the shaft hole
        for (let f = 1; f < WORLD.FLOOR_COUNT; f++) {
            const y = f * FH - 0.075;
            const west = box(HALF_W - SHW, 0.15, WORLD.BUILDING_DEPTH, MAT.slabTrans);
            west.position.set(-(HALF_W + SHW) / 2, y, 0); group.add(west);
            const east = box(HALF_W - SHW, 0.15, WORLD.BUILDING_DEPTH, MAT.slabTrans);
            east.position.set((HALF_W + SHW) / 2, y, 0); group.add(east);
            const north = box(WORLD.SHAFT_WIDTH, 0.15, HALF_D - SHD, MAT.slabTrans);
            north.position.set(0, y, -(HALF_D + SHD) / 2); group.add(north);
            const south = box(WORLD.SHAFT_WIDTH, 0.15, HALF_D - SHD, MAT.slabTrans);
            south.position.set(0, y, (HALF_D + SHD) / 2); group.add(south);
        }

        // outer walls (semi-transparent blue). Front wall has a 3-wide entrance
        // gap on floor 0 only → built as three segments.
        // back wall
        wall(group, -HALF_W, -HALF_D, HALF_W, -HALF_D, 0, WALL_H, MAT.outerWall);
        // left + right walls
        wall(group, -HALF_W, -HALF_D, -HALF_W, HALF_D, 0, WALL_H, MAT.outerWall);
        wall(group, HALF_W, -HALF_D, HALF_W, HALF_D, 0, WALL_H, MAT.outerWall);
        // front wall: two side panels (full height) + above-gap panel (floors 1..5)
        wall(group, -HALF_W, HALF_D, -SHW, HALF_D, 0, WALL_H, MAT.outerWall);
        wall(group, SHW, HALF_D, HALF_W, HALF_D, 0, WALL_H, MAT.outerWall);
        const aboveGap = box(WORLD.SHAFT_WIDTH, WALL_H - FH, 0.16, MAT.outerWall);
        aboveGap.position.set(0, FH + (WALL_H - FH) / 2, HALF_D); group.add(aboveGap);

        // glass entrance doors in the floor-0 gap
        const gL = box(1.45, FH - 0.1, 0.08, MAT.glass);
        gL.position.set(-0.74, (FH - 0.1) / 2, HALF_D); group.add(gL);
        const gR = box(1.45, FH - 0.1, 0.08, MAT.glass);
        gR.position.set(0.74, (FH - 0.1) / 2, HALF_D); group.add(gR);
    }

    // ---- office floor (1..5) ---------------------------------------------
    const OFFICE_X = [-8.25, -2.75, 2.75, 8.25];
    const OFFICE_LABEL = ["officeA", "officeB", "officeC", "officeD"];

    function buildOfficeFloor(group, floorNumber, nodes, sitTargets) {
        const fy = floorNumber * FH;
        buildRing(nodes, fy);

        // interior wall along z=-3 (office fronts) with a doorway per office
        const fronts = [[-HALF_W, -5.5], [-5.5, 0], [0, 5.5], [5.5, HALF_W]];
        // partition walls between offices
        [-5.5, 0, 5.5].forEach(function (px) {
            wall(group, px, -HALF_D, px, -3, fy, FH, MAT.innerWall);
        });

        const desks = [];
        for (let i = 0; i < 4; i++) {
            const cx = OFFICE_X[i], label = OFFICE_LABEL[i];
            // office-front wall split around a 1.2 doorway centered at cx
            wall(group, fronts[i][0], -3, cx - 0.6, -3, fy, FH, MAT.innerWall);
            wall(group, cx + 0.6, -3, fronts[i][1], -3, fy, FH, MAT.innerWall);

            const desk = buildDesk(); desk.position.set(cx, fy, -7.6); group.add(desk);
            const chair = buildChair(Math.PI); chair.position.set(cx, fy, -6.7); group.add(chair);

            mkNode(nodes, label + "_desk", cx, fy, -6.7);
            mkNode(nodes, label + "_door", cx, fy, -2.6);
            link(nodes, label + "_desk", label + "_door");
            const corner = i < 2 ? "hallNW" : "hallNE";
            link(nodes, label + "_door", corner);
            link(nodes, label + "_door", "hallN");
            sitTargets[label + "_desk"] = { sit: true, facing: Math.PI };
            desks.push({ deskWpName: label + "_desk", doorWpName: label + "_door", floor: floorNumber });
        }

        // conference room (front-left): east wall + south wall with a doorway gap at x≈-4
        wall(group, -3, 3, -3, HALF_D, fy, FH, MAT.innerWall);           // east wall
        wall(group, -HALF_W, 3, -4.6, 3, fy, FH, MAT.innerWall);         // south wall, west of door
        wall(group, -3.4, 3, -3, 3, fy, FH, MAT.innerWall);              // south wall, east of door
        const confTable = buildTable(3.0, 1.4); confTable.position.set(-7, fy, 6); group.add(confTable);
        const confSeatDefs = [
            ["conf_seat0", -8.4, 4.7, 0],          // south side, face +Z toward table
            ["conf_seat1", -5.6, 4.7, 0],
            ["conf_seat2", -8.4, 7.3, Math.PI],    // north side, face -Z toward table
            ["conf_seat3", -5.6, 7.3, Math.PI],
        ];
        confSeatDefs.forEach(function (d) {
            const ch = buildChair(d[3]); ch.position.set(d[1], fy, d[2]); group.add(ch);
            mkNode(nodes, d[0], d[1], fy, d[2]);
            sitTargets[d[0]] = { sit: true, facing: d[3] };
        });
        mkNode(nodes, "conf_center", -7, fy, 4);
        mkNode(nodes, "conf_door", -4, fy, 3.2);
        link(nodes, "conf_door", "hallSW");
        link(nodes, "conf_door", "conf_center");
        confSeatDefs.forEach(function (d) { link(nodes, "conf_center", d[0]); });

        // lounge / break area (front-right)
        wall(group, 3, 3, 3, HALF_D, fy, FH, MAT.innerWall);             // west wall of lounge
        const couch = buildCouch(Math.PI); couch.position.set(7, fy, 8); group.add(couch); // back to +Z, faces -Z
        const ct = buildCoffeeTable(1.4, 0.8); ct.position.set(7, fy, 6); group.add(ct);
        const acL = buildArmchair(Math.PI / 2); acL.position.set(4.6, fy, 6); group.add(acL); // faces +X
        const acR = buildArmchair(-Math.PI / 2); acR.position.set(9.4, fy, 6); group.add(acR); // faces -X
        const lc = buildCooler(); lc.position.set(10, fy, 4); group.add(lc);

        mkNode(nodes, "lounge_center", 7, fy, 4.2);
        mkNode(nodes, "lounge_door", 4, fy, 3.2);
        mkNode(nodes, "lounge_spot0", 6.6, fy, 7.7);   // couch
        mkNode(nodes, "lounge_spot1", 4.9, fy, 6.0);   // left armchair
        mkNode(nodes, "lounge_spot2", 9.1, fy, 6.0);   // right armchair
        mkNode(nodes, "water_cooler", 9.6, fy, 4.3);
        link(nodes, "lounge_door", "hallSE");
        link(nodes, "lounge_door", "lounge_center");
        link(nodes, "lounge_center", "lounge_spot0");
        link(nodes, "lounge_center", "lounge_spot1");
        link(nodes, "lounge_center", "lounge_spot2");
        link(nodes, "lounge_center", "water_cooler");
        sitTargets["lounge_spot0"] = { sit: true, facing: Math.PI };
        sitTargets["lounge_spot1"] = { sit: true, facing: Math.PI / 2 };
        sitTargets["lounge_spot2"] = { sit: true, facing: -Math.PI / 2 };
        sitTargets["water_cooler"] = { sit: false, facing: Math.PI };

        // hallway loiter spots
        mkNode(nodes, "hall_stand_N", 1.6, fy, -3.2);
        mkNode(nodes, "hall_stand_S", 1.6, fy, 3.2);
        link(nodes, "hall_stand_N", "hallN");
        link(nodes, "hall_stand_S", "hallS");
        sitTargets["hall_stand_N"] = { sit: false, facing: 0 };
        sitTargets["hall_stand_S"] = { sit: false, facing: Math.PI };

        // call panel + shaft indicator (right of the doors, facing +Z)
        const panel = createCallPanel();
        panel.position.set(2.0, fy + 1.3, SHD + 0.06); group.add(panel);
        const shaftInd = createIndicatorPlane(0.9);
        shaftInd.position.set(0, fy + 2.75, SHD + 0.06); group.add(shaftInd);

        return {
            floorNumber: floorNumber, nodes: nodes, sitTargets: sitTargets,
            callPanel: panel, shaftIndicator: shaftInd, desks: desks,
            loungeSpots: ["lounge_spot0", "lounge_spot1", "lounge_spot2"],
            confSeats: ["conf_seat0", "conf_seat1", "conf_seat2", "conf_seat3"],
            standSpots: ["water_cooler", "hall_stand_N", "hall_stand_S"],
        };
    }

    // ---- lobby (floor 0) --------------------------------------------------
    function buildLobby(group, nodes, sitTargets) {
        const fy = 0;
        buildRing(nodes, fy);

        mkNode(nodes, "entrance", 0, fy, 7);
        mkNode(nodes, "outside", 0, fy, 12);
        link(nodes, "outside", "entrance");
        link(nodes, "entrance", "elevWait");      // direct — don't detour through hallS
        link(nodes, "entrance", "hallS");
        link(nodes, "entrance", "hallSE");
        link(nodes, "entrance", "hallSW");

        // --- cafe (front-left) ---
        const counter = box(0.9, 1.0, 6.0, MAT.counter); counter.position.set(-10.0, fy + 0.5, 5.5); group.add(counter);
        const ctop = box(0.95, 0.08, 6.0, MAT.counterTop); ctop.position.set(-10.0, fy + 1.02, 5.5); group.add(ctop);
        const coffeeMachine = box(0.5, 0.5, 0.5, MAT.appliance); coffeeMachine.position.set(-9.9, fy + 1.3, 4); group.add(coffeeMachine);
        const pastry = box(0.8, 0.4, 0.6, MAT.glass); pastry.position.set(-9.9, fy + 1.25, 7); group.add(pastry);
        mkNode(nodes, "cafe_order", -9.0, fy, 5.0);
        mkNode(nodes, "cafe_center", -7.0, fy, 4.4);
        mkNode(nodes, "cafe_door", -5.0, fy, 3.2);
        link(nodes, "cafe_door", "hallSW");
        link(nodes, "cafe_door", "cafe_center");
        link(nodes, "cafe_center", "cafe_order");
        sitTargets["cafe_order"] = { sit: false, facing: -Math.PI / 2 };

        const cafeSpots = [];
        const tableXZ = [[-8.5, 6], [-5.5, 6], [-8.5, 8], [-5.5, 8]];
        tableXZ.forEach(function (t, ti) {
            const tbl = buildTable(1.0, 1.0); tbl.position.set(t[0], fy, t[1]); group.add(tbl);
            // two chairs per table on +X / -X sides facing the table
            const sA = "bistro" + (ti * 2), sB = "bistro" + (ti * 2 + 1);
            const chA = buildChair(Math.PI / 2); chA.position.set(t[0] - 0.85, fy, t[1]); group.add(chA);
            const chB = buildChair(-Math.PI / 2); chB.position.set(t[0] + 0.85, fy, t[1]); group.add(chB);
            mkNode(nodes, sA, t[0] - 0.7, fy, t[1]);
            mkNode(nodes, sB, t[0] + 0.7, fy, t[1]);
            link(nodes, "cafe_center", sA); link(nodes, "cafe_center", sB);
            sitTargets[sA] = { sit: true, facing: Math.PI / 2 };
            sitTargets[sB] = { sit: true, facing: -Math.PI / 2 };
            cafeSpots.push(sA, sB);
        });

        // --- front lounge (front-right) ---
        const fcouch = buildCouch(Math.PI); fcouch.position.set(7, fy, 8); group.add(fcouch);
        const fct = buildCoffeeTable(1.4, 0.8); fct.position.set(7, fy, 6.2); group.add(fct);
        const fac1 = buildArmchair(Math.PI / 2); fac1.position.set(4.7, fy, 6.2); group.add(fac1);
        const fac2 = buildArmchair(-Math.PI / 2); fac2.position.set(9.3, fy, 6.2); group.add(fac2);
        mkNode(nodes, "flounge_center", 7, fy, 4.4);
        mkNode(nodes, "flounge0", 6.6, fy, 7.7);
        mkNode(nodes, "flounge1", 5.0, fy, 6.2);
        mkNode(nodes, "flounge2", 9.0, fy, 6.2);
        link(nodes, "flounge_center", "hallSE");
        ["flounge0", "flounge1", "flounge2"].forEach(function (n) { link(nodes, "flounge_center", n); });
        sitTargets["flounge0"] = { sit: true, facing: Math.PI };
        sitTargets["flounge1"] = { sit: true, facing: Math.PI / 2 };
        sitTargets["flounge2"] = { sit: true, facing: -Math.PI / 2 };
        const frontLoungeSpots = ["flounge0", "flounge1", "flounge2"];

        // --- back lounge (Z<0): two couches facing each other ---
        const bcN = buildCouch(0); bcN.position.set(6, fy, -7); group.add(bcN);     // faces +Z
        const bcS = buildCouch(Math.PI); bcS.position.set(6, fy, -3); group.add(bcS); // faces -Z
        const bct = buildCoffeeTable(1.6, 0.9); bct.position.set(6, fy, -5); group.add(bct);
        mkNode(nodes, "back_lounge_center", 6, fy, -5);
        mkNode(nodes, "back_lounge_N", 6, fy, -6.6);
        mkNode(nodes, "back_lounge_S", 6, fy, -3.4);
        link(nodes, "back_lounge_center", "hallNE");
        link(nodes, "back_lounge_center", "hallE");
        link(nodes, "back_lounge_center", "back_lounge_N");
        link(nodes, "back_lounge_center", "back_lounge_S");
        sitTargets["back_lounge_N"] = { sit: true, facing: 0 };
        sitTargets["back_lounge_S"] = { sit: true, facing: Math.PI };
        const backLoungeSpots = ["back_lounge_N", "back_lounge_S"];

        // --- conversation pit (back-left): round table + four armchairs ---
        const rt = buildRoundTable(0.8); rt.position.set(-6, fy, -5); group.add(rt);
        const pitDefs = [
            ["pit_N", -6, -6.8, 0],
            ["pit_S", -6, -3.2, Math.PI],
            ["pit_E", -4.2, -5, -Math.PI / 2],
            ["pit_W", -7.8, -5, Math.PI / 2],
        ];
        mkNode(nodes, "pit_center", -6, fy, -3.4);
        link(nodes, "pit_center", "hallNW");
        link(nodes, "pit_center", "hallW");
        pitDefs.forEach(function (d) {
            const ac = buildArmchair(d[3]); ac.position.set(d[1], fy, d[2]); group.add(ac);
            mkNode(nodes, d[0], d[1], fy, d[2]);
            link(nodes, "pit_center", d[0]);
            sitTargets[d[0]] = { sit: true, facing: d[3] };
        });
        const pitSpots = ["pit_N", "pit_S", "pit_E", "pit_W"];

        // --- water coolers ---
        const wcF = buildCooler(); wcF.position.set(9.5, fy, 2.5); group.add(wcF);
        const wcB = buildCooler(); wcB.position.set(-9.5, fy, -2.5); group.add(wcB);
        mkNode(nodes, "lobby_wc_front", 9.0, fy, 2.8);
        mkNode(nodes, "lobby_wc_back", -9.0, fy, -2.8);
        link(nodes, "lobby_wc_front", "hallSE"); link(nodes, "lobby_wc_front", "hallE");
        link(nodes, "lobby_wc_back", "hallNW"); link(nodes, "lobby_wc_back", "hallW");
        sitTargets["lobby_wc_front"] = { sit: false, facing: -Math.PI / 2 };
        sitTargets["lobby_wc_back"] = { sit: false, facing: Math.PI / 2 };

        // --- reception desk (tucked left, off the entrance→elevator path) ---
        const recDesk = box(2.2, 1.05, 0.8, MAT.counter); recDesk.position.set(-3, fy + 0.52, 6); group.add(recDesk);
        const recTop = box(2.3, 0.08, 0.9, MAT.counterTop); recTop.position.set(-3, fy + 1.06, 6); group.add(recTop);
        mkNode(nodes, "reception", -3, fy, 7.0);
        link(nodes, "reception", "entrance"); link(nodes, "reception", "hallSW");
        sitTargets["reception"] = { sit: false, facing: Math.PI };

        // --- info kiosk near entrance ---
        const kiosk = box(0.7, 1.3, 0.5, MAT.appliance); kiosk.position.set(2.2, fy + 0.65, 8); group.add(kiosk);
        mkNode(nodes, "kiosk", 2.0, fy, 7.4);
        link(nodes, "kiosk", "entrance");
        sitTargets["kiosk"] = { sit: false, facing: -Math.PI / 2 };

        // --- generic loiter waypoints ---
        const loiter = [
            ["lobby_stand_center", 0, 5, Math.PI, "elevWait"],
            ["lobby_stand_NE", 5.5, -1, Math.PI, "hallE"],
            ["lobby_stand_NW", -5.5, -1, 0, "hallW"],
            ["lobby_stand_midE", 4, 4.5, Math.PI, "hallSE"],
            ["lobby_stand_midW", -3.5, 1.5, 0, "hallSW"],
            ["lobby_stand_entry", 1.5, 8.2, Math.PI, "entrance"],
        ];
        const loiterSpots = [];
        loiter.forEach(function (d) {
            mkNode(nodes, d[0], d[1], fy, d[2]);
            link(nodes, d[0], d[4]);
            sitTargets[d[0]] = { sit: false, facing: d[3] };
            loiterSpots.push(d[0]);
        });

        // plants by entrance
        buildPlant(-2.0, fy, 8.2, group);
        buildPlant(2.6, fy, 6.0, group);

        // call panel + shaft indicator
        const panel = createCallPanel();
        panel.position.set(2.0, fy + 1.3, SHD + 0.06); group.add(panel);
        const shaftInd = createIndicatorPlane(0.9);
        shaftInd.position.set(0, fy + 2.75, SHD + 0.06); group.add(shaftInd);

        return {
            floorNumber: 0, nodes: nodes, sitTargets: sitTargets,
            callPanel: panel, shaftIndicator: shaftInd, desks: [],
            entranceSpot: nodes["entrance"].pos.clone(),
            spawnSpot: nodes["outside"].pos.clone(),
            cafeSpots: cafeSpots, frontLoungeSpots: frontLoungeSpots,
            backLoungeSpots: backLoungeSpots, pitSpots: pitSpots,
            loiterSpots: loiterSpots,
            standSpots: ["reception", "kiosk", "lobby_wc_front", "lobby_wc_back", "cafe_order"],
        };
    }

    // ---- public factory ---------------------------------------------------
    function createWorld(scene) {
        const buildingGroup = new THREE.Group();
        buildingGroup.renderOrder = 0;
        scene.add(buildingGroup);

        buildShell(buildingGroup);

        const floors = [];
        floors.push(buildLobby(buildingGroup, {}, {}));
        for (let f = 1; f < WORLD.FLOOR_COUNT; f++) {
            floors.push(buildOfficeFloor(buildingGroup, f, {}, {}));
        }

        buildingGroup.traverse(function (o) { if (o.isMesh) o.renderOrder = 0; });

        return { buildingGroup: buildingGroup, floors: floors, bfsPath: bfsPath, WORLD: WORLD };
    }

    root.WORLD = WORLD;
    root.bfsPath = bfsPath;
    root.createWorld = createWorld;
})(typeof window !== "undefined" ? window : globalThis);
