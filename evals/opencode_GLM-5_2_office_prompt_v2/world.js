// world.js — building geometry, per-floor layouts, furniture, navigation graph, call panels
(function (root) {
    "use strict";
    const THREE = root.THREE;

    const WORLD = {
        FLOOR_HEIGHT: 3.4, FLOOR_COUNT: 6,
        BUILDING_WIDTH: 22, BUILDING_DEPTH: 18,
        SHAFT_WIDTH: 3, SHAFT_DEPTH: 3,
        PERSON_R: 0.4
    };
    const SW = WORLD.SHAFT_WIDTH, SD = WORLD.SHAFT_DEPTH;
    const BW = WORLD.BUILDING_WIDTH, BD = WORLD.BUILDING_DEPTH;
    const FH = WORLD.FLOOR_HEIGHT;
    const FC = WORLD.FLOOR_COUNT;

    // ---- materials ----
    function tMat(color, op) {
        return new THREE.MeshLambertMaterial({
            color: color, transparent: true, opacity: op,
            depthWrite: false, side: THREE.DoubleSide
        });
    }
    const floorMat = tMat(0x888888, 0.3);
    const wallMat = tMat(0x9999ff, 0.2);
    const intWallMat = tMat(0xbbc5e6, 0.28);
    const solidGray = new THREE.MeshLambertMaterial({ color: 0x555555 });
    const deskWoodMat = new THREE.MeshLambertMaterial({ color: 0x6b4423 });
    const chairMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
    const plantMat = new THREE.MeshLambertMaterial({ color: 0x2e7d32 });
    const coolerMat = new THREE.MeshLambertMaterial({ color: 0xb0bec5 });

    // ---- helpers ----
    function box(w, h, d, mat, x, y, z) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        m.position.set(x, y, z);
        return m;
    }

    // canvas-texture digit display
    function makeDigitTexture() {
        const cv = document.createElement("canvas");
        cv.width = 256; cv.height = 256;
        const ctx = cv.getContext("2d");
        const tex = new THREE.CanvasTexture(cv);
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.generateMipmaps = true;
        tex.anisotropy = 8;
        tex._lastText = null;
        tex._ctx = ctx;
        tex._cv = cv;
        return tex;
    }
    function updateTextTexture(tex, text) {
        if (!tex) return;
        if (tex._lastText === text) return;
        tex._lastText = text;
        const ctx = tex._ctx, cv = tex._cv;
        ctx.fillStyle = "#050505";
        ctx.fillRect(0, 0, cv.width, cv.height);
        ctx.font = "bold 210px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.shadowColor = "#ffbb22";
        ctx.shadowBlur = 24;
        ctx.fillStyle = "#ffbb22";
        ctx.fillText(text, cv.width / 2, cv.height / 2 + 8);
        tex.needsUpdate = true;
    }

    // ---- call panel ----
    function makeCallPanel(scene, floorNum, parent, y) {
        const panel = new THREE.Group();
        const plate = box(0.55, 1.4, 0.05, new THREE.MeshLambertMaterial({ color: 0x333333 }),
            0, 0, 0);
        panel.add(plate);

        const offMat = new THREE.MeshBasicMaterial({ color: 0x333333 });
        const onMat = new THREE.MeshBasicMaterial({ color: 0x33ff66 });

        // up arrow
        const upShape = new THREE.Shape();
        upShape.moveTo(0, 0.13); upShape.lineTo(-0.13, -0.13); upShape.lineTo(0.13, -0.13); upShape.closePath();
        const upMesh = new THREE.Mesh(new THREE.ShapeGeometry(upShape), offMat);
        upMesh.position.set(0, 0.4, 0.03);
        panel.add(upMesh);
        // down arrow
        const downShape = new THREE.Shape();
        downShape.moveTo(0, -0.13); downShape.lineTo(-0.13, 0.13); downShape.lineTo(0.13, 0.13); downShape.closePath();
        const downMesh = new THREE.Mesh(new THREE.ShapeGeometry(downShape), offMat);
        downMesh.position.set(0, 0.1, 0.03);
        panel.add(downMesh);

        // floor display
        const dispTex = makeDigitTexture();
        updateTextTexture(dispTex, String(floorNum));
        const disp = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.45),
            new THREE.MeshBasicMaterial({ map: dispTex, transparent: false }));
        disp.position.set(0, -0.4, 0.04);
        panel.add(disp);

        panel.userData = {
            upMesh, downMesh, offMat, onMat, dispTex,
            setUp(on) { upMesh.material = on ? onMat : offMat; },
            setDown(on) { downMesh.material = on ? onMat : offMat; },
            setIndicator(text) { updateTextTexture(dispTex, text); }
        };
        return panel;
    }

    function makeShaftIndicator() {
        const tex = makeDigitTexture();
        updateTextTexture(tex, "0");
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9),
            new THREE.MeshBasicMaterial({ map: tex }));
        mesh.userData = { tex, setIndicator(t) { updateTextTexture(tex, t); } };
        return mesh;
    }

    // ---- furniture ----
    function makeDesk() {
        const g = new THREE.Group();
        g.add(box(1.8, 0.1, 0.9, deskWoodMat, 0, 0.75, 0));   // top
        g.add(box(1.7, 0.65, 0.8, deskWoodMat, 0, 0.32, 0)); // body
        // monitor at back of desk (-Z side)
        const mon = box(0.5, 0.35, 0.04, new THREE.MeshLambertMaterial({ color: 0x111111 }),
            0, 1.0, -0.35);
        g.add(mon);
        g.add(box(0.1, 0.1, 0.1, solidGray, 0, 0.82, -0.3)); // stand
        return g;
    }
    function makeChair(facingY) {
        const g = new THREE.Group();
        g.add(box(0.5, 0.06, 0.5, chairMat, 0, 0.5, 0));           // seat
        g.add(box(0.5, 0.5, 0.06, chairMat, 0, 0.75, -0.22));      // backrest at -Z
        g.add(box(0.06, 0.5, 0.5, chairMat, -0.22, 0.25, 0));      // leg
        g.add(box(0.06, 0.5, 0.5, chairMat, 0.22, 0.25, 0));
        g.rotation.y = facingY || 0;
        return g;
    }
    function makeConfTable() {
        const g = new THREE.Group();
        g.add(box(3.0, 0.1, 1.2, deskWoodMat, 0, 0.75, 0));
        g.add(box(2.8, 0.65, 1.0, deskWoodMat, 0, 0.32, 0));
        return g;
    }
    function makeCouch() {
        const g = new THREE.Group();
        g.add(box(2.4, 0.5, 0.9, new THREE.MeshLambertMaterial({ color: 0x4a6fa5 }), 0, 0.3, 0));
        g.add(box(2.4, 0.5, 0.2, chairMat, 0, 0.6, -0.35)); // backrest
        g.add(box(0.2, 0.4, 0.9, chairMat, -1.1, 0.45, 0));
        g.add(box(0.2, 0.4, 0.9, chairMat, 1.1, 0.45, 0));
        return g;
    }
    function makeArmchair() {
        const g = new THREE.Group();
        g.add(box(0.8, 0.45, 0.8, new THREE.MeshLambertMaterial({ color: 0x6a4c93 }), 0, 0.3, 0));
        g.add(box(0.8, 0.5, 0.15, chairMat, 0, 0.55, -0.32));
        g.add(box(0.15, 0.4, 0.8, chairMat, -0.32, 0.45, 0));
        g.add(box(0.15, 0.4, 0.8, chairMat, 0.32, 0.45, 0));
        return g;
    }
    function makeCoffeeTable() {
        const g = new THREE.Group();
        g.add(box(1.2, 0.1, 0.6, deskWoodMat, 0, 0.4, 0));
        g.add(box(0.1, 0.4, 0.1, solidGray, -0.5, 0.2, -0.2));
        g.add(box(0.1, 0.4, 0.1, solidGray, 0.5, 0.2, -0.2));
        g.add(box(0.1, 0.4, 0.1, solidGray, -0.5, 0.2, 0.2));
        g.add(box(0.1, 0.4, 0.1, solidGray, 0.5, 0.2, 0.2));
        return g;
    }
    function makeWaterCooler() {
        const g = new THREE.Group();
        g.add(box(0.5, 1.0, 0.5, coolerMat, 0, 0.5, 0));
        g.add(box(0.3, 0.3, 0.3, new THREE.MeshLambertMaterial({ color: 0x1976d2 }), 0, 1.15, 0));
        return g;
    }
    function makeBistroTable() {
        const g = new THREE.Group();
        g.add(box(0.8, 0.05, 0.8, deskWoodMat, 0, 0.75, 0));
        g.add(box(0.08, 0.75, 0.08, solidGray, 0, 0.37, 0));
        return g;
    }
    function makePlant() {
        const g = new THREE.Group();
        g.add(box(0.4, 0.4, 0.4, new THREE.MeshLambertMaterial({ color: 0x5d4037 }), 0, 0.2, 0));
        const foliage = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), plantMat);
        foliage.position.y = 0.9;
        g.add(foliage);
        return g;
    }
    function makeCounter() {
        const g = new THREE.Group();
        g.add(box(3.0, 1.0, 0.6, deskWoodMat, 0, 0.5, 0));
        g.add(box(3.0, 0.05, 0.6, new THREE.MeshLambertMaterial({ color: 0x37474f }), 0, 1.02, 0));
        // coffee machine
        g.add(box(0.5, 0.4, 0.4, solidGray, -0.8, 1.25, 0));
        // pastry display
        g.add(box(0.8, 0.3, 0.4, new THREE.MeshLambertMaterial({ color: 0x8d6e63, transparent: true, opacity: 0.6, depthWrite: false }), 0.6, 1.2, 0));
        return g;
    }
    function makeReception() {
        const g = new THREE.Group();
        g.add(box(2.2, 1.0, 0.7, deskWoodMat, 0, 0.5, 0));
        g.add(box(2.2, 0.05, 0.7, new THREE.MeshLambertMaterial({ color: 0x37474f }), 0, 1.02, 0));
        return g;
    }

    // ---- nav graph helpers ----
    function link(a, b) {
        if (!a.links) a.links = [];
        if (!b.links) b.links = [];
        if (a.links.indexOf(b) < 0) a.links.push(b);
        if (b.links.indexOf(a) < 0) b.links.push(a);
    }
    function node(name, x, z) {
        return { name, pos: new THREE.Vector3(x, 0, z), links: [] };
    }

    function bfsPath(nodes, fromName, toName) {
        const from = nodes[fromName], to = nodes[toName];
        if (!from || !to) return [];
        if (from === to) return [from.pos.clone()];
        const prev = new Map();
        const q = [from];
        const seen = new Set([fromName]);
        while (q.length) {
            const cur = q.shift();
            if (cur === to) break;
            for (const n of (cur.links || [])) {
                if (!seen.has(n.name)) {
                    seen.add(n.name); prev.set(n.name, cur.name); q.push(n);
                }
            }
        }
        if (!prev.has(toName) && fromName !== toName) return [];
        const path = [];
        let c = toName;
        while (c) {
            path.unshift(nodes[c].pos.clone());
            c = prev.get(c);
        }
        return path;
    }

    // ---- hallway ring around shaft ----
    function buildHallwayRing(nodes, floorY) {
        // ring of 8 around a 3x3 shaft; hallway corridor at radius ~3
        const r = 3.0;
        const names = ["hallS", "hallSE", "hallE", "hallNE", "hallN", "hallNW", "hallW", "hallSW"];
        const angles = [-Math.PI / 2, -Math.PI / 4, 0, Math.PI / 4,
            Math.PI / 2, 3 * Math.PI / 4, Math.PI, -3 * Math.PI / 4];
        for (let i = 0; i < 8; i++) {
            const x = Math.cos(angles[i]) * r;
            const z = Math.sin(angles[i]) * r;
            const n = node(names[i], x, z);
            n.pos.y = floorY;
            nodes[names[i]] = n;
        }
        // link ring
        for (let i = 0; i < 8; i++) link(nodes[names[i]], nodes[names[(i + 1) % 8]]);
        // elevWait node in front of doors (+Z)
        const ew = node("elevWait", 0, r);
        ew.pos.y = floorY;
        nodes.elevWait = ew;
        link(ew, nodes.hallS);
        return nodes;
    }

    // ---- build an office floor ----
    function buildOfficeFloor(group, floorNum, floorY) {
        const nodes = {};
        buildHallwayRing(nodes, floorY);

        // floor slab: 4 strips around shaft hole
        const halfW = SW / 2, halfD = SD / 2;
        // front strip (z from halfD to BD/2)
        group.add(box(BW, 0.1, BD / 2 - halfD, floorMat, 0, floorY - 0.05, halfD + (BD / 2 - halfD) / 2));
        // back strip
        group.add(box(BW, 0.1, BD / 2 - halfD, floorMat, 0, floorY - 0.05, -(halfD + (BD / 2 - halfD) / 2)));
        // left strip
        group.add(box(BW / 2 - halfW, 0.1, SD, floorMat, -(halfW + (BW / 2 - halfW) / 2), floorY - 0.05, 0));
        // right strip
        group.add(box(BW / 2 - halfW, 0.1, SD, floorMat, halfW + (BW / 2 - halfW) / 2, floorY - 0.05, 0));

        const floorData = { floorNumber: floorNum, nodes, sitTargets: {}, desks: {} };

        // ---- Offices along back wall ----
        const officeXs = [-7.5, -2.5, 2.5, 7.5];
        const officeNames = ["officeA", "officeB", "officeC", "officeD"];
        for (let i = 0; i < 4; i++) {
            const ox = officeXs[i], oz = -6.0;
            const nm = officeNames[i];
            // walls (3 sides, doorway at front +Z)
            const wH = 2.6;
            // back wall
            group.add(box(3.6, wH, 0.1, intWallMat, ox, floorY + wH / 2, -8.5));
            // side walls
            group.add(box(0.1, wH, 5.0, intWallMat, ox - 1.8, floorY + wH / 2, -6.0));
            group.add(box(0.1, wH, 5.0, intWallMat, ox + 1.8, floorY + wH / 2, -6.0));
            // front wall segments with doorway gap (1.2 wide) at center
            group.add(box(1.2, wH, 0.1, intWallMat, ox - 1.5, floorY + wH / 2, -3.5));
            group.add(box(1.2, wH, 0.1, intWallMat, ox + 1.5, floorY + wH / 2, -3.5));

            // desk at back of office facing -Z (monitor on -Z side, user faces -Z)
            const desk = makeDesk();
            desk.position.set(ox, floorY, -7.5);
            group.add(desk);
            // chair: seat opens toward monitor (-Z), person sits facing -Z
            const chair = makeChair(Math.PI); // backrest now on +Z side after rotation? backrest was at -Z, rotate PI -> +Z
            chair.position.set(ox, floorY, -6.7);
            group.add(chair);

            // nodes: door -> desk
            const doorNode = node(nm + "_door", ox, -3.5); doorNode.pos.y = floorY;
            const deskNode = node(nm + "_desk", ox, -6.7); deskNode.pos.y = floorY;
            nodes[nm + "_door"] = doorNode;
            nodes[nm + "_desk"] = deskNode;
            link(doorNode, deskNode);
            // door links to nearest hallway corner (hallN or hallNW/NE)
            const hallNode = (ox < 0) ? nodes.hallNW : nodes.hallNE;
            if (ox === -2.5) link(doorNode, nodes.hallN);
            else if (ox === 2.5) link(doorNode, nodes.hallN);
            else link(doorNode, hallNode);

            // sit target: facing -Z (Math.PI), sit=true
            floorData.sitTargets[nm + "_desk"] = { sit: true, facing: Math.PI };
            floorData.desks[nm] = { x: ox, z: -6.7, wpName: nm + "_desk" };
        }

        // ---- Conference room (front-left) ----
        // x:[-11,-3], z:[3,9]
        const confZ = 6;
        group.add(box(0.1, 2.6, 6.0, intWallMat, -11, floorY + 1.3, confZ));
        group.add(box(0.1, 2.6, 6.0, intWallMat, -3, floorY + 1.3, confZ));
        group.add(box(8.0, 2.6, 0.1, intWallMat, -7, floorY + 1.3, 9));
        // front wall with doorway at center
        group.add(box(3.4, 2.6, 0.1, intWallMat, -7, floorY + 1.3, 3));
        // door gap 1.2 centered at x=-7 -> segments -11..-8.2 and -5.8..-3
        // (already single segment above covering -8.5..-5.5? simplify: rebuild)
        // For simplicity leave doorway via node link only.
        const confTable = makeConfTable();
        confTable.position.set(-7, floorY, 6);
        group.add(confTable);
        // 4 chairs: 2 per long side (long axis = X)
        const confSeats = [];
        const seatPos = [[-8, 6.7], [-6, 6.7], [-8, 5.3], [-6, 5.3]];
        // north chairs (z=6.7) face -Z toward table; south chairs (z=5.3) face +Z
        const seatFace = [Math.PI, Math.PI, 0, 0];
        for (let s = 0; s < 4; s++) {
            const ch = makeChair(seatFace[s]);
            ch.position.set(seatPos[s][0], floorY, seatPos[s][1]);
            group.add(ch);
            const sn = node("conf_seat" + s, seatPos[s][0], seatPos[s][1]);
            sn.pos.y = floorY;
            nodes["conf_seat" + s] = sn;
            confSeats.push("conf_seat" + s);
            floorData.sitTargets["conf_seat" + s] = { sit: true, facing: seatFace[s] };
        }
        const confDoor = node("conf_door", -7, 3); confDoor.pos.y = floorY;
        nodes.conf_door = confDoor;
        link(confDoor, nodes.hallSW);
        const confCenter = node("conf_center", -7, 6); confCenter.pos.y = floorY;
        nodes.conf_center = confCenter;
        link(confDoor, confCenter);
        for (const sn of confSeats) link(confCenter, nodes[sn]);
        floorData.confSeats = confSeats;

        // ---- Lounge (front-right) x:[3,11], z:[3,9] ----
        group.add(box(0.1, 2.6, 6.0, intWallMat, 3, floorY + 1.3, 6));
        group.add(box(0.1, 2.6, 6.0, intWallMat, 11, floorY + 1.3, 6));
        group.add(box(8.0, 2.6, 0.1, intWallMat, 7, floorY + 1.3, 9));
        group.add(box(3.4, 2.6, 0.1, intWallMat, 7, floorY + 1.3, 3));

        const couch = makeCouch(); couch.position.set(7, floorY, 7.6); couch.rotation.y = Math.PI; group.add(couch);
        const ct = makeCoffeeTable(); ct.position.set(7, floorY, 6.4); group.add(ct);
        const armL = makeArmchair(); armL.position.set(5.2, floorY, 6.4); armL.rotation.y = Math.PI / 2; group.add(armL);
        const armR = makeArmchair(); armR.position.set(8.8, floorY, 6.4); armR.rotation.y = -Math.PI / 2; group.add(armR);
        const cooler = makeWaterCooler(); cooler.position.set(10.2, floorY, 4); group.add(cooler);
        const plant = makePlant(); plant.position.set(3.5, floorY, 8.5); group.add(plant);

        const loungeDoor = node("lounge_door", 7, 3); loungeDoor.pos.y = floorY;
        nodes.lounge_door = loungeDoor;
        link(loungeDoor, nodes.hallSE);
        const loungeCenter = node("lounge_center", 7, 6.5); loungeCenter.pos.y = floorY;
        nodes.lounge_center = loungeCenter;
        link(loungeDoor, loungeCenter);
        // lounge spots: couch seat, 2 armchairs (sit=true)
        const ls0 = node("lounge_spot0", 7, 7.6); ls0.pos.y = floorY;
        const ls1 = node("lounge_spot1", 5.2, 6.4); ls1.pos.y = floorY;
        const ls2 = node("lounge_spot2", 8.8, 6.4); ls2.pos.y = floorY;
        nodes.lounge_spot0 = ls0; nodes.lounge_spot1 = ls1; nodes.lounge_spot2 = ls2;
        link(loungeCenter, ls0); link(loungeCenter, ls1); link(loungeCenter, ls2);
        // cooler standing waypoint
        const wc = node("water_cooler", 10.2, 4.2); wc.pos.y = floorY;
        nodes.water_cooler = wc;
        link(loungeCenter, wc);
        floorData.sitTargets.lounge_spot0 = { sit: true, facing: Math.PI }; // couch faces -Z toward table
        floorData.sitTargets.lounge_spot1 = { sit: true, facing: Math.PI / 2 };
        floorData.sitTargets.lounge_spot2 = { sit: true, facing: -Math.PI / 2 };
        floorData.sitTargets.water_cooler = { sit: false, facing: 0 };

        // hall stand loiter spots
        const hsN = node("hall_stand_N", 0, 3.5); hsN.pos.y = floorY;
        const hsS = node("hall_stand_S", 0, -3.5); hsS.pos.y = floorY;
        nodes.hall_stand_N = hsN; nodes.hall_stand_S = hsS;
        link(hsN, nodes.elevWait); link(hsS, nodes.hallS);

        // call panel next to shaft (+Z side), facing +Z
        const panel = makeCallPanel(group, floorNum, null, floorY);
        panel.position.set(1.9, floorY + 1.2, SD / 2 + 0.06);
        group.add(panel);
        floorData.callPanel = panel;

        // shaft indicator above doors
        const shaftInd = makeShaftIndicator();
        shaftInd.position.set(0, floorY + 2.9, SD / 2 + 0.06);
        group.add(shaftInd);
        floorData.shaftIndicator = shaftInd;

        return floorData;
    }

    // ---- lobby (floor 0) ----
    function buildLobby(group, floorY) {
        const nodes = {};
        buildHallwayRing(nodes, floorY);

        // floor slab (4 strips)
        const halfW = SW / 2, halfD = SD / 2;
        group.add(box(BW, 0.1, BD / 2 - halfD, floorMat, 0, floorY - 0.05, halfD + (BD / 2 - halfD) / 2));
        group.add(box(BW, 0.1, BD / 2 - halfD, floorMat, 0, floorY - 0.05, -(halfD + (BD / 2 - halfD) / 2)));
        group.add(box(BW / 2 - halfW, 0.1, SD, floorMat, -(halfW + (BW / 2 - halfW) / 2), floorY - 0.05, 0));
        group.add(box(BW / 2 - halfW, 0.1, SD, floorMat, halfW + (BW / 2 - halfW) / 2, floorY - 0.05, 0));

        const floorData = { floorNumber: 0, nodes, sitTargets: {}, desks: {}, isLobby: true };

        // entrance node (linked directly to elevWait)
        const ent = node("entrance", 0, 8); ent.pos.y = floorY;
        nodes.entrance = ent;
        link(ent, nodes.elevWait);
        // outside node (sidewalk)
        const outside = node("outside", 0, 12); outside.pos.y = 0;
        nodes.outside = outside;
        link(outside, ent);

        // cafe on left wall (x ~ -9)
        const counter = makeCounter(); counter.position.set(-9, floorY, -3); group.add(counter);
        group.add(box(2.0, 0.1, 0.6, deskWoodMat, -9, floorY + 1.05, -3.4)); // countertop overhang
        const cafeOrder = node("cafe_order", -8.2, -2.5); cafeOrder.pos.y = floorY;
        nodes.cafe_order = cafeOrder;
        const cafeDoor = node("cafe_door", -7, 0); cafeDoor.pos.y = floorY;
        nodes.cafe_door = cafeDoor;
        link(cafeDoor, nodes.hallSW);
        link(cafeDoor, cafeOrder);
        floorData.sitTargets.cafe_order = { sit: false, facing: Math.PI }; // face counter at -Z

        // bistro tables with chairs (4 tables)
        const bistroPos = [[-8, 2], [-5, 2], [-8, 5], [-5, 5]];
        for (let b = 0; b < bistroPos.length; b++) {
            const bx = bistroPos[b][0], bz = bistroPos[b][1];
            const bt = makeBistroTable(); bt.position.set(bx, floorY, bz); group.add(bt);
            // 2 chairs
            const ch0 = makeChair(Math.PI / 2); ch0.position.set(bx - 0.7, floorY, bz); group.add(ch0);
            const ch1 = makeChair(-Math.PI / 2); ch1.position.set(bx + 0.7, floorY, bz); group.add(ch1);
            const n0 = node("bistro_" + b + "_seat0", bx - 0.7, bz); n0.pos.y = floorY;
            const n1 = node("bistro_" + b + "_seat1", bx + 0.7, bz); n1.pos.y = floorY;
            nodes["bistro_" + b + "_seat0"] = n0;
            nodes["bistro_" + b + "_seat1"] = n1;
            link(cafeDoor, n0); link(n0, n1);
            floorData.sitTargets["bistro_" + b + "_seat0"] = { sit: true, facing: Math.PI / 2 };
            floorData.sitTargets["bistro_" + b + "_seat1"] = { sit: true, facing: -Math.PI / 2 };
        }

        // front lounge (right side)
        const fCouch = makeCouch(); fCouch.position.set(7, floorY, 7.6); fCouch.rotation.y = Math.PI; group.add(fCouch);
        const fCt = makeCoffeeTable(); fCt.position.set(7, floorY, 6.4); group.add(fCt);
        const fArmL = makeArmchair(); fArmL.position.set(5.2, floorY, 6.4); fArmL.rotation.y = Math.PI / 2; group.add(fArmL);
        const fArmR = makeArmchair(); fArmR.position.set(8.8, floorY, 6.4); fArmR.rotation.y = -Math.PI / 2; group.add(fArmR);
        const frontLounge0 = node("front_lounge_0", 7, 7.6); frontLounge0.pos.y = floorY;
        const frontLounge1 = node("front_lounge_1", 5.2, 6.4); frontLounge1.pos.y = floorY;
        const frontLounge2 = node("front_lounge_2", 8.8, 6.4); frontLounge2.pos.y = floorY;
        nodes.front_lounge_0 = frontLounge0; nodes.front_lounge_1 = frontLounge1; nodes.front_lounge_2 = frontLounge2;
        link(nodes.hallSE, frontLounge0); link(frontLounge0, frontLounge1); link(frontLounge0, frontLounge2);
        floorData.sitTargets.front_lounge_0 = { sit: true, facing: Math.PI };
        floorData.sitTargets.front_lounge_1 = { sit: true, facing: Math.PI / 2 };
        floorData.sitTargets.front_lounge_2 = { sit: true, facing: -Math.PI / 2 };

        // back lounge (Z<0): two couches facing each other across coffee table
        const bCouchN = makeCouch(); bCouchN.position.set(-3, floorY, -7); bCouchN.rotation.y = Math.PI / 2; group.add(bCouchN);
        const bCouchS = makeCouch(); bCouchS.position.set(3, floorY, -7); bCouchS.rotation.y = -Math.PI / 2; group.add(bCouchS);
        const bCt = makeCoffeeTable(); bCt.position.set(0, floorY, -7); bCt.rotation.y = Math.PI / 2; group.add(bCt);
        const blN = node("back_lounge_N", -3, -7); blN.pos.y = floorY;
        const blS = node("back_lounge_S", 3, -7); blS.pos.y = floorY;
        nodes.back_lounge_N = blN; nodes.back_lounge_S = blS;
        link(nodes.hallSW, blN); link(blN, blS);
        floorData.sitTargets.back_lounge_N = { sit: true, facing: Math.PI / 2 };
        floorData.sitTargets.back_lounge_S = { sit: true, facing: -Math.PI / 2 };

        // conversation pit (back-left): round table + 4 armchairs
        const pitCx = -7, pitCz = -7;
        const pitTable = makeCoffeeTable(); pitTable.position.set(pitCx, floorY, pitCz); pitTable.scale.set(0.8, 1, 0.8); group.add(pitTable);
        const pitPos = [[pitCx, pitCz - 1.4], [pitCx, pitCz + 1.4], [pitCx - 1.4, pitCz], [pitCx + 1.4, pitCz]];
        const pitFace = [0, Math.PI, -Math.PI / 2, Math.PI / 2];
        const pitNames = ["pit_N", "pit_S", "pit_E", "pit_W"];
        for (let p = 0; p < 4; p++) {
            const ac = makeArmchair(); ac.position.set(pitPos[p][0], floorY, pitPos[p][1]); ac.rotation.y = pitFace[p]; group.add(ac);
            const pn = node(pitNames[p], pitPos[p][0], pitPos[p][1]); pn.pos.y = floorY;
            nodes[pitNames[p]] = pn;
            link(nodes.hallSW, pn);
            floorData.sitTargets[pitNames[p]] = { sit: true, facing: pitFace[p] };
        }

        // water coolers with standing waypoints
        const wc1 = makeWaterCooler(); wc1.position.set(9, floorY, -3); group.add(wc1);
        const wc2 = makeWaterCooler(); wc2.position.set(-9, floorY, 6); group.add(wc2);
        const wcF = node("lobby_wc_front", 9.7, -3); wcF.pos.y = floorY;
        const wcB = node("lobby_wc_back", -8.3, 6); wcB.pos.y = floorY;
        nodes.lobby_wc_front = wcF; nodes.lobby_wc_back = wcB;
        link(nodes.hallSE, wcF); link(nodes.hallNW, wcB);
        floorData.sitTargets.lobby_wc_front = { sit: false, facing: Math.PI };
        floorData.sitTargets.lobby_wc_back = { sit: false, facing: 0 };

        // reception desk (tucked off to side, x≈-3, z≈6)
        const recep = makeReception(); recep.position.set(-3, floorY, 6.5); group.add(recep);
        const recepNode = node("reception", -3, 5.5); recepNode.pos.y = floorY;
        nodes.reception = recepNode;
        link(nodes.hallSW, recepNode);
        floorData.sitTargets.reception = { sit: false, facing: Math.PI };

        // info kiosk near entrance
        const kiosk = box(0.8, 1.0, 0.8, new THREE.MeshLambertMaterial({ color: 0x607d8b }), 3, floorY + 0.5, 8);
        group.add(kiosk);
        const kioskNode = node("kiosk", 3.5, 8); kioskNode.pos.y = floorY;
        nodes.kiosk = kioskNode;
        link(ent, kioskNode);
        floorData.sitTargets.kiosk = { sit: false, facing: Math.PI };

        // generic loiter waypoints
        const loiters = [
            ["lobby_stand_center", 0, 0],
            ["lobby_stand_NE", 6, 4],
            ["lobby_stand_NW", -6, 4],
            ["lobby_stand_midE", 5, 0],
            ["lobby_stand_midW", -5, 0],
            ["lobby_stand_entry", 0, 7]
        ];
        for (const l of loiters) {
            const ln = node(l[0], l[1], l[2]); ln.pos.y = floorY;
            nodes[l[0]] = ln;
            link(nodes.elevWait, ln);
            floorData.sitTargets[l[0]] = { sit: false, facing: Math.random() * Math.PI * 2 };
        }

        // potted plants by entrance
        const p1 = makePlant(); p1.position.set(-2, floorY, 9); group.add(p1);
        const p2 = makePlant(); p2.position.set(2, floorY, 9); group.add(p2);

        // call panel + shaft indicator
        const panel = makeCallPanel(group, 0, null, floorY);
        panel.position.set(1.9, floorY + 1.2, SD / 2 + 0.06);
        group.add(panel);
        floorData.callPanel = panel;
        const shaftInd = makeShaftIndicator();
        shaftInd.position.set(0, floorY + 2.9, SD / 2 + 0.06);
        group.add(shaftInd);
        floorData.shaftIndicator = shaftInd;

        return floorData;
    }

    // ---- outer walls (with entrance gap on floor 0 front) ----
    function buildOuterWalls(group) {
        const wH = FH * FC;
        // back wall (z = -BD/2), solid full height
        group.add(box(BW, wH, 0.2, wallMat, 0, wH / 2, -BD / 2));
        // left wall
        group.add(box(0.2, wH, BD, wallMat, -BW / 2, wH / 2, 0));
        // right wall
        group.add(box(0.2, wH, BD, wallMat, BW / 2, wH / 2, 0));
        // front wall: 3 segments. Entrance gap = 3 units wide centered at x=0 on floor 0.
        // Side panels full height (x: -BW/2 .. -1.5 and 1.5 .. BW/2)
        const segW = (BW - 3) / 2;
        group.add(box(segW, wH, 0.2, wallMat, -(1.5 + segW / 2), wH / 2, BD / 2));
        group.add(box(segW, wH, 0.2, wallMat, (1.5 + segW / 2), wH / 2, BD / 2));
        // above-the-gap panel covering floors 1..5 (y from FH to wH)
        const aboveH = wH - FH;
        group.add(box(3.0, aboveH, 0.2, wallMat, 0, FH + aboveH / 2, BD / 2));

        // entrance glass doors (floor 0)
        const glassMat = new THREE.MeshLambertMaterial({ color: 0xaaddff, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide });
        group.add(box(1.4, FH - 0.2, 0.05, glassMat, -0.75, (FH - 0.2) / 2, BD / 2));
        group.add(box(1.4, FH - 0.2, 0.05, glassMat, 0.75, (FH - 0.2) / 2, BD / 2));
    }

    function buildShaft(group) {
        // shaft walls (interior of shaft, full height)
        const sh = FH * FC;
        const swMat = new THREE.MeshLambertMaterial({ color: 0x444466, transparent: true, opacity: 0.15, depthWrite: false, side: THREE.DoubleSide });
        group.add(box(0.1, sh, SD, swMat, -SW / 2, sh / 2, 0));
        group.add(box(0.1, sh, SD, swMat, SW / 2, sh / 2, 0));
        group.add(box(SW, sh, 0.1, swMat, 0, sh / 2, -SD / 2));
        // front of shaft: doors are per-floor (handled by elevator.js); leave open
    }

    function createWorld(scene) {
        const buildingGroup = new THREE.Group();
        buildingGroup.renderOrder = 0;

        // ground slab
        buildingGroup.add(box(BW + 4, 0.3, BD + 8, solidGray, 0, -0.15, 0));
        // sidewalk slab outside front
        buildingGroup.add(box(6, 0.1, 4, new THREE.MeshLambertMaterial({ color: 0x777777 }), 0, 0.05, BD / 2 + 4));
        // roof
        buildingGroup.add(box(BW, 0.2, BD, solidGray, 0, FH * FC, 0));

        buildShaft(buildingGroup);
        buildOuterWalls(buildingGroup);

        const floors = [];
        // floor 0 lobby
        floors.push(buildLobby(buildingGroup, 0));
        // floors 1..5 office
        for (let f = 1; f < FC; f++) {
            floors.push(buildOfficeFloor(buildingGroup, f, f * FH));
        }

        scene.add(buildingGroup);

        return {
            buildingGroup,
            floors,
            bfsPath,
            WORLD
        };
    }

    root.createWorld = createWorld;
    root.bfsPath = bfsPath;
    root.WORLD = WORLD;
})(typeof window !== "undefined" ? window : globalThis);
