(function (root) {
    const WORLD = {
        FLOOR_HEIGHT: 3.4, FLOOR_COUNT: 6,
        BUILDING_WIDTH: 22, BUILDING_DEPTH: 18,
        SHAFT_WIDTH: 3, SHAFT_DEPTH: 3,
        PERSON_R: 0.4
    };

    const HALF_W = WORLD.BUILDING_WIDTH / 2;
    const HALF_D = WORLD.BUILDING_DEPTH / 2;
    const SH = WORLD.SHAFT_WIDTH / 2;
    const SD = WORLD.SHAFT_DEPTH / 2;

    // ---------- material helpers ----------
    function transparentMat(color, opacity) {
        return new THREE.MeshLambertMaterial({
            color: color, transparent: true, opacity: opacity,
            depthWrite: false, side: THREE.DoubleSide
        });
    }
    function solidMat(color) {
        return new THREE.MeshLambertMaterial({ color: color, side: THREE.DoubleSide });
    }

    // ---------- canvas-texture digit display ----------
    function makeTextTexture() {
        const canvas = document.createElement("canvas");
        canvas.width = 256; canvas.height = 256;
        const tex = new THREE.CanvasTexture(canvas);
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.generateMipmaps = true;
        tex.anisotropy = 8;
        tex._canvas = canvas;
        tex._lastText = null;
        updateTextTexture(tex, "0");
        return tex;
    }

    function updateTextTexture(tex, text) {
        if (tex._lastText === text) return;
        tex._lastText = text;
        const canvas = tex._canvas;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#050505";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#ffbb22";
        ctx.shadowColor = "#ffbb22";
        ctx.shadowBlur = 24;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const fontPx = Math.floor(canvas.height * 0.82);
        ctx.font = "bold " + fontPx + "px monospace";
        ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 6);
        tex.needsUpdate = true;
    }

    // ---------- call panel ----------
    function createCallPanel() {
        const group = new THREE.Group();

        const plateGeo = new THREE.BoxGeometry(0.55, 1.4, 0.05);
        const plate = new THREE.Mesh(plateGeo, solidMat(0x2a2a33));
        group.add(plate);

        const litMat = new THREE.MeshLambertMaterial({ color: 0x33ff66, emissive: 0x22aa44, side: THREE.DoubleSide });
        const dimMat = new THREE.MeshLambertMaterial({ color: 0x333333, side: THREE.DoubleSide });

        function triangle(up) {
            const hw = 0.13;
            const shape = new THREE.Shape();
            if (up) {
                shape.moveTo(0, hw); shape.lineTo(-hw, -hw); shape.lineTo(hw, -hw);
            } else {
                shape.moveTo(0, -hw); shape.lineTo(-hw, hw); shape.lineTo(hw, hw);
            }
            shape.closePath();
            const geo = new THREE.ShapeGeometry(shape);
            const mesh = new THREE.Mesh(geo, dimMat.clone());
            return mesh;
        }

        const upArrow = triangle(true);
        upArrow.position.set(0, 0.42, 0.04);
        group.add(upArrow);

        const downArrow = triangle(false);
        downArrow.position.set(0, 0.12, 0.04);
        group.add(downArrow);

        // Floor display
        const tex = makeTextTexture();
        const dispGeo = new THREE.PlaneGeometry(0.45, 0.45);
        const dispMat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide });
        const disp = new THREE.Mesh(dispGeo, dispMat);
        disp.position.set(0, -0.42, 0.04);
        group.add(disp);

        group.userData = {
            setUp: function (on) { upArrow.material = on ? litMat : dimMat; },
            setDown: function (on) { downArrow.material = on ? litMat : dimMat; },
            setIndicator: function (text) { updateTextTexture(tex, text); }
        };
        return group;
    }

    function createShaftIndicator(size) {
        const tex = makeTextTexture();
        const geo = new THREE.PlaneGeometry(size, size);
        const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.userData = { setIndicator: function (t) { updateTextTexture(tex, t); } };
        return mesh;
    }

    // ---------- furniture primitives ----------
    function makeDesk() {
        const g = new THREE.Group();
        const top = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 0.8), solidMat(0x8a6d4f));
        top.position.y = 0.75;
        g.add(top);
        for (const dx of [-0.7, 0.7]) for (const dz of [-0.3, 0.3]) {
            const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.75, 0.08), solidMat(0x5a4632));
            leg.position.set(dx, 0.375, dz);
            g.add(leg);
        }
        // monitor at back of desk (-Z side)
        const mon = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.05), solidMat(0x111122));
        mon.position.set(0, 1.1, -0.3);
        g.add(mon);
        return g;
    }

    function makeChair(color) {
        const g = new THREE.Group();
        const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.5), solidMat(color || 0x444455));
        seat.position.y = 0.45;
        g.add(seat);
        const back = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.08), solidMat(color || 0x444455));
        back.position.set(0, 0.7, -0.24);
        g.add(back);
        for (const dx of [-0.2, 0.2]) for (const dz of [-0.2, 0.2]) {
            const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.45, 0.05), solidMat(0x222222));
            leg.position.set(dx, 0.225, dz);
            g.add(leg);
        }
        return g;
    }

    function makeTable(w, d, color) {
        const g = new THREE.Group();
        const top = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, d), solidMat(color || 0x6d5a45));
        top.position.y = 0.72;
        g.add(top);
        const legInset = 0.2;
        for (const dx of [-(w / 2 - legInset), (w / 2 - legInset)])
            for (const dz of [-(d / 2 - legInset), (d / 2 - legInset)]) {
                const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.72, 0.08), solidMat(0x4a3c2c));
                leg.position.set(dx, 0.36, dz);
                g.add(leg);
            }
        return g;
    }

    function makeCouch(color) {
        const g = new THREE.Group();
        const base = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.4, 0.8), solidMat(color || 0x556688));
        base.position.y = 0.3;
        g.add(base);
        const back = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.5, 0.2), solidMat(color || 0x556688));
        back.position.set(0, 0.65, -0.3);
        g.add(back);
        return g;
    }

    function makeArmchair(color) {
        const g = new THREE.Group();
        const base = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.4, 0.8), solidMat(color || 0x66557a));
        base.position.y = 0.3;
        g.add(base);
        const back = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.18), solidMat(color || 0x66557a));
        back.position.set(0, 0.65, -0.31);
        g.add(back);
        return g;
    }

    function makeWaterCooler() {
        const g = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.9, 0.35), solidMat(0xddeeff));
        body.position.y = 0.45;
        g.add(body);
        const jug = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.35, 10), transparentMat(0x88ccff, 0.5));
        jug.position.y = 1.05;
        g.add(jug);
        return g;
    }

    function makePlant() {
        const g = new THREE.Group();
        const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.3, 8), solidMat(0x8a5a3a));
        pot.position.y = 0.15;
        g.add(pot);
        const leaves = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 8), solidMat(0x2f7d3a));
        leaves.position.y = 0.6;
        g.add(leaves);
        return g;
    }

    function makeCounter(w) {
        const g = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(w, 1.0, 0.7), solidMat(0x6a6a72));
        body.position.y = 0.5;
        g.add(body);
        const top = new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, 0.75), solidMat(0x2a2a30));
        top.position.y = 1.02;
        g.add(top);
        return g;
    }

    // ---------- navigation graph ----------
    function addNode(nodes, name, x, y, z) {
        nodes[name] = { name: name, pos: new THREE.Vector3(x, y, z), edges: [] };
    }
    function link(nodes, a, b) {
        if (nodes[a] && nodes[b]) {
            if (nodes[a].edges.indexOf(b) < 0) nodes[a].edges.push(b);
            if (nodes[b].edges.indexOf(a) < 0) nodes[b].edges.push(a);
        }
    }

    function bfsPath(nodes, fromName, toName) {
        if (!nodes[fromName] || !nodes[toName]) return [];
        if (fromName === toName) return [nodes[fromName].pos.clone()];
        const queue = [fromName];
        const prev = {}; prev[fromName] = null;
        while (queue.length) {
            const cur = queue.shift();
            if (cur === toName) break;
            for (const nb of nodes[cur].edges) {
                if (!(nb in prev)) { prev[nb] = cur; queue.push(nb); }
            }
        }
        if (!(toName in prev)) return [nodes[toName].pos.clone()];
        const path = [];
        let c = toName;
        while (c != null) { path.unshift(nodes[c].pos.clone()); c = prev[c]; }
        return path;
    }

    // Hallway ring around shaft (shared by every floor).
    function buildHallRing(nodes, y) {
        const r = 4.2;
        addNode(nodes, "hallS", 0, y, SD + 1.2);
        addNode(nodes, "hallSE", r, y, r);
        addNode(nodes, "hallE", r + 1.5, y, 0);
        addNode(nodes, "hallNE", r, y, -r);
        addNode(nodes, "hallN", 0, y, -(SD + 1.2));
        addNode(nodes, "hallNW", -r, y, -r);
        addNode(nodes, "hallW", -(r + 1.5), y, 0);
        addNode(nodes, "hallSW", -r, y, r);
        addNode(nodes, "elevWait", 0, y, SD + 0.8);

        const ring = ["hallS", "hallSE", "hallE", "hallNE", "hallN", "hallNW", "hallW", "hallSW"];
        for (let i = 0; i < ring.length; i++) link(nodes, ring[i], ring[(i + 1) % ring.length]);
        link(nodes, "elevWait", "hallS");
    }

    // ---------- office floor layout ----------
    function buildOfficeFloor(scene, group, floorNumber) {
        const y = floorNumber * WORLD.FLOOR_HEIGHT;
        const nodes = {};
        const sitTargets = {};
        const desks = [];

        buildHallRing(nodes, y);

        // interior walls (visible-ish)
        const wallMat = transparentMat(0xbbc5e6, 0.28);
        function wall(x, z, w, d) {
            const m = new THREE.Mesh(new THREE.BoxGeometry(w, WORLD.FLOOR_HEIGHT * 0.92, d), wallMat);
            m.position.set(x, y + WORLD.FLOOR_HEIGHT * 0.46, z);
            m.renderOrder = 0;
            group.add(m);
        }

        // Four private offices along back wall (z in [-9,-3]).
        // Offices A..D from x left to right.
        const officeXs = [-8.2, -2.8, 2.8, 8.2];
        const officeNames = ["officeA", "officeB", "officeC", "officeD"];
        for (let i = 0; i < 4; i++) {
            const ox = officeXs[i];
            const name = officeNames[i];
            // desk near back wall, chair in front (+Z of desk); user faces -Z (monitor at back).
            const deskZ = -7.0;
            const desk = makeDesk();
            desk.position.set(ox, y, deskZ);
            group.add(desk);
            desks.push({ id: name, group: desk, floor: floorNumber });

            const chair = makeChair(0x445566);
            chair.position.set(ox, y, deskZ + 0.8);
            chair.rotation.y = Math.PI; // seat opens toward monitor (-Z)
            group.add(chair);

            // graph nodes
            addNode(nodes, name + "_desk", ox, y, deskZ + 0.8);
            addNode(nodes, name + "_door", ox, y, -3.0);
            link(nodes, name + "_desk", name + "_door");

            // nearest hall corner
            const corner = (i < 2) ? "hallNW" : "hallNE";
            link(nodes, name + "_door", corner);
            link(nodes, name + "_door", "hallN");

            // sit facing monitor: person faces -Z => rotation.y = Math.PI
            sitTargets[name + "_desk"] = { sit: true, facing: Math.PI };
        }

        // Conference room front-left (x:[-11,-3], z:[3,9])
        const confCX = -7, confCZ = 6;
        const confTable = makeTable(3.2, 1.4, 0x5a4632);
        confTable.position.set(confCX, y, confCZ);
        group.add(confTable);
        addNode(nodes, "conf_center", confCX, y, confCZ);
        addNode(nodes, "conf_door", confCX + 3.0, y, 3.0);
        link(nodes, "conf_door", "hallSW");
        link(nodes, "conf_door", "conf_center");
        // four seats: two per long side
        const confSeats = [
            { x: confCX - 0.9, z: confCZ + 1.1, face: 0 },     // south side, face -Z (toward table)... table is north of them
            { x: confCX + 0.9, z: confCZ + 1.1, face: 0 },
            { x: confCX - 0.9, z: confCZ - 1.1, face: Math.PI },
            { x: confCX + 0.9, z: confCZ - 1.1, face: Math.PI }
        ];
        for (let i = 0; i < 4; i++) {
            const s = confSeats[i];
            const ch = makeChair(0x4a5a44);
            ch.position.set(s.x, y, s.z);
            // chair back away from table. seat 0/1 sit on +Z side, face -Z (toward table) => face = Math.PI
            // seat 2/3 sit on -Z side, face +Z (toward table) => face = 0
            const facing = (i < 2) ? Math.PI : 0;
            ch.rotation.y = facing;
            group.add(ch);
            addNode(nodes, "conf_seat" + i, s.x, y, s.z);
            link(nodes, "conf_center", "conf_seat" + i);
            sitTargets["conf_seat" + i] = { sit: true, facing: facing };
        }

        // Lounge front-right (x:[3,11], z:[3,9])
        const loungeCX = 7, loungeCZ = 6;
        const couch = makeCouch(0x556688);
        couch.position.set(loungeCX, y, loungeCZ + 1.5);
        couch.rotation.y = Math.PI; // back to +Z, opens toward -Z (table)
        group.add(couch);
        const coffeeT = makeTable(1.2, 0.8, 0x6d5a45);
        coffeeT.position.set(loungeCX, y, loungeCZ);
        coffeeT.scale.set(1, 0.6, 1);
        group.add(coffeeT);
        const arm1 = makeArmchair(0x66557a);
        arm1.position.set(loungeCX - 1.5, y, loungeCZ - 0.5);
        arm1.rotation.y = Math.PI / 2;
        group.add(arm1);
        const arm2 = makeArmchair(0x66557a);
        arm2.position.set(loungeCX + 1.5, y, loungeCZ - 0.5);
        arm2.rotation.y = -Math.PI / 2;
        group.add(arm2);
        const lcooler = makeWaterCooler();
        lcooler.position.set(loungeCX + 2.5, y, loungeCZ + 2);
        group.add(lcooler);

        addNode(nodes, "lounge_center", loungeCX, y, loungeCZ);
        addNode(nodes, "lounge_door", loungeCX - 3.0, y, 3.0);
        link(nodes, "lounge_door", "hallSE");
        link(nodes, "lounge_door", "lounge_center");
        // lounge spots
        addNode(nodes, "lounge_spot0", loungeCX, y, loungeCZ + 1.4);
        addNode(nodes, "lounge_spot1", loungeCX - 1.5, y, loungeCZ - 0.5);
        addNode(nodes, "lounge_spot2", loungeCX + 1.5, y, loungeCZ - 0.5);
        link(nodes, "lounge_center", "lounge_spot0");
        link(nodes, "lounge_center", "lounge_spot1");
        link(nodes, "lounge_center", "lounge_spot2");
        sitTargets["lounge_spot0"] = { sit: true, facing: Math.PI };   // couch backrest +Z, face -Z toward table
        sitTargets["lounge_spot1"] = { sit: true, facing: Math.PI / 2 };
        sitTargets["lounge_spot2"] = { sit: true, facing: -Math.PI / 2 };

        // water cooler standing waypoint
        addNode(nodes, "water_cooler", loungeCX + 2.5, y, loungeCZ + 1.0);
        link(nodes, "water_cooler", "lounge_center");
        sitTargets["water_cooler"] = { sit: false, facing: Math.PI };

        // hallway loiter spots
        addNode(nodes, "hall_stand_N", 2.5, y, -2.5);
        addNode(nodes, "hall_stand_S", -2.5, y, 2.5);
        link(nodes, "hall_stand_N", "hallN");
        link(nodes, "hall_stand_S", "hallS");
        sitTargets["hall_stand_N"] = { sit: false, facing: Math.PI };
        sitTargets["hall_stand_S"] = { sit: false, facing: 0 };

        // call panel + shaft indicator (next to shaft, facing +Z)
        const callPanel = createCallPanel();
        callPanel.position.set(SH + 0.6, y + 1.5, SD + 0.06);
        callPanel.renderOrder = 0;
        group.add(callPanel);

        const shaftIndicator = createShaftIndicator(0.9);
        shaftIndicator.position.set(0, y + 2.6, SD + 0.05);
        group.add(shaftIndicator);

        return {
            floorNumber: floorNumber, nodes: nodes, callPanel: callPanel,
            shaftIndicator: shaftIndicator, desks: desks, sitTargets: sitTargets
        };
    }

    // ---------- lobby (floor 0) ----------
    function buildLobby(scene, group) {
        const floorNumber = 0;
        const y = 0;
        const nodes = {};
        const sitTargets = {};

        buildHallRing(nodes, y);

        // entrance + outside
        addNode(nodes, "entrance", 0, y, HALF_D - 0.5);
        addNode(nodes, "outside", 0, y, 12);
        link(nodes, "entrance", "outside");
        link(nodes, "entrance", "elevWait");
        link(nodes, "entrance", "hallS");

        // glass doors at z=+9 (gap in front wall)
        const glassMat = transparentMat(0xaaddee, 0.25);
        for (const dx of [-0.8, 0.8]) {
            const door = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.6, 0.08), glassMat);
            door.position.set(dx, y + 1.3, HALF_D);
            door.renderOrder = 0;
            group.add(door);
        }

        // sidewalk slab outside
        const sidewalk = new THREE.Mesh(new THREE.BoxGeometry(8, 0.1, 6), solidMat(0x999999));
        sidewalk.position.set(0, y - 0.05, HALF_D + 3.5);
        group.add(sidewalk);

        // plants by entrance
        const p1 = makePlant(); p1.position.set(-2.5, y, HALF_D - 1); group.add(p1);
        const p2 = makePlant(); p2.position.set(2.5, y, HALF_D - 1); group.add(p2);

        // ---- Cafe (left wall) ----
        const counter = makeCounter(4);
        counter.position.set(-HALF_W + 1.0, y, 2);
        counter.rotation.y = Math.PI / 2;
        group.add(counter);
        // coffee machine + pastry display on top
        const coffee = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.4), solidMat(0x333333));
        coffee.position.set(-HALF_W + 1.3, y + 1.3, 3);
        group.add(coffee);
        const pastry = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.3, 0.5), transparentMat(0xffffff, 0.4));
        pastry.position.set(-HALF_W + 1.3, y + 1.2, 1);
        group.add(pastry);

        addNode(nodes, "cafe_order", -HALF_W + 2.2, y, 2);
        addNode(nodes, "cafe_door", -7, y, 2);
        link(nodes, "cafe_door", "hallSW");
        link(nodes, "cafe_door", "hallW");
        link(nodes, "cafe_order", "cafe_door");
        sitTargets["cafe_order"] = { sit: false, facing: -Math.PI / 2 };

        // bistro tables with chairs
        const bistroPos = [
            { x: -8, z: 6 }, { x: -5, z: 6 }, { x: -8, z: 3 }, { x: -5, z: 3 }
        ];
        for (let i = 0; i < bistroPos.length; i++) {
            const b = bistroPos[i];
            const t = makeTable(0.9, 0.9, 0x6d5a45);
            t.position.set(b.x, y, b.z);
            t.scale.set(1, 1.1, 1);
            group.add(t);
            // two chairs per table (facing each other across)
            const cN = makeChair(0x884444);
            cN.position.set(b.x, y, b.z + 0.7);
            cN.rotation.y = Math.PI;
            group.add(cN);
            const cS = makeChair(0x884444);
            cS.position.set(b.x, y, b.z - 0.7);
            cS.rotation.y = 0;
            group.add(cS);
            addNode(nodes, "bistro" + i + "_n", b.x, y, b.z + 0.7);
            addNode(nodes, "bistro" + i + "_s", b.x, y, b.z - 0.7);
            link(nodes, "bistro" + i + "_n", "cafe_door");
            link(nodes, "bistro" + i + "_s", "cafe_door");
            link(nodes, "bistro" + i + "_n", "bistro" + i + "_s");
            sitTargets["bistro" + i + "_n"] = { sit: true, facing: Math.PI };
            sitTargets["bistro" + i + "_s"] = { sit: true, facing: 0 };
        }

        // ---- Front lounge (right side) ----
        const flCX = 7, flCZ = 5;
        const fcouch = makeCouch(0x4a6650);
        fcouch.position.set(flCX, y, flCZ + 1.4);
        fcouch.rotation.y = Math.PI;
        group.add(fcouch);
        const fct = makeTable(1.2, 0.8, 0x6d5a45);
        fct.position.set(flCX, y, flCZ); fct.scale.set(1, 0.6, 1);
        group.add(fct);
        const farm1 = makeArmchair(0x66557a);
        farm1.position.set(flCX - 1.6, y, flCZ - 0.4); farm1.rotation.y = Math.PI / 2;
        group.add(farm1);
        const farm2 = makeArmchair(0x66557a);
        farm2.position.set(flCX + 1.6, y, flCZ - 0.4); farm2.rotation.y = -Math.PI / 2;
        group.add(farm2);
        addNode(nodes, "flounge_center", flCX, y, flCZ);
        link(nodes, "flounge_center", "hallSE");
        link(nodes, "flounge_center", "hallE");
        addNode(nodes, "flounge0", flCX, y, flCZ + 1.3);
        addNode(nodes, "flounge1", flCX - 1.6, y, flCZ - 0.4);
        addNode(nodes, "flounge2", flCX + 1.6, y, flCZ - 0.4);
        link(nodes, "flounge_center", "flounge0");
        link(nodes, "flounge_center", "flounge1");
        link(nodes, "flounge_center", "flounge2");
        sitTargets["flounge0"] = { sit: true, facing: Math.PI };
        sitTargets["flounge1"] = { sit: true, facing: Math.PI / 2 };
        sitTargets["flounge2"] = { sit: true, facing: -Math.PI / 2 };

        // ---- Back lounge (z<0): two couches facing across a table ----
        const blCX = 6, blCZ = -5;
        const couchN = makeCouch(0x556688);
        couchN.position.set(blCX, y, blCZ - 1.2); couchN.rotation.y = 0;
        group.add(couchN);
        const couchS = makeCouch(0x556688);
        couchS.position.set(blCX, y, blCZ + 1.2); couchS.rotation.y = Math.PI;
        group.add(couchS);
        const blt = makeTable(1.4, 0.8, 0x6d5a45);
        blt.position.set(blCX, y, blCZ); blt.scale.set(1, 0.6, 1);
        group.add(blt);
        addNode(nodes, "back_lounge_center", blCX, y, blCZ);
        link(nodes, "back_lounge_center", "hallNE");
        link(nodes, "back_lounge_center", "hallE");
        addNode(nodes, "back_lounge_N", blCX, y, blCZ - 1.1);
        addNode(nodes, "back_lounge_S", blCX, y, blCZ + 1.1);
        link(nodes, "back_lounge_center", "back_lounge_N");
        link(nodes, "back_lounge_center", "back_lounge_S");
        sitTargets["back_lounge_N"] = { sit: true, facing: 0 };
        sitTargets["back_lounge_S"] = { sit: true, facing: Math.PI };

        // ---- Conversation pit (back-left): round table + 4 armchairs ----
        const pitCX = -6, pitCZ = -5;
        const pitTable = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.6, 16), solidMat(0x6d5a45));
        pitTable.position.set(pitCX, y + 0.3, pitCZ);
        group.add(pitTable);
        addNode(nodes, "pit_center", pitCX, y, pitCZ);
        link(nodes, "pit_center", "hallNW");
        link(nodes, "pit_center", "hallW");
        const pitSeats = [
            { n: "pit_N", x: pitCX, z: pitCZ - 1.3, face: 0 },
            { n: "pit_S", x: pitCX, z: pitCZ + 1.3, face: Math.PI },
            { n: "pit_E", x: pitCX + 1.3, z: pitCZ, face: -Math.PI / 2 },
            { n: "pit_W", x: pitCX - 1.3, z: pitCZ, face: Math.PI / 2 }
        ];
        for (const s of pitSeats) {
            const ch = makeArmchair(0x775544);
            ch.position.set(s.x, y, s.z); ch.rotation.y = s.face;
            group.add(ch);
            addNode(nodes, s.n, s.x, y, s.z);
            link(nodes, "pit_center", s.n);
            sitTargets[s.n] = { sit: true, facing: s.face };
        }

        // ---- water coolers ----
        const wc1 = makeWaterCooler(); wc1.position.set(HALF_W - 1.5, y, 2); group.add(wc1);
        const wc2 = makeWaterCooler(); wc2.position.set(HALF_W - 1.5, y, -3); group.add(wc2);
        addNode(nodes, "lobby_wc_front", HALF_W - 2.0, y, 2);
        addNode(nodes, "lobby_wc_back", HALF_W - 2.0, y, -3);
        link(nodes, "lobby_wc_front", "hallE");
        link(nodes, "lobby_wc_back", "hallE");
        sitTargets["lobby_wc_front"] = { sit: false, facing: Math.PI / 2 };
        sitTargets["lobby_wc_back"] = { sit: false, facing: Math.PI / 2 };

        // ---- reception desk (off to side, x~-3 z~6) ----
        const recDesk = makeDesk();
        recDesk.position.set(-3, y, 7.5);
        group.add(recDesk);
        addNode(nodes, "reception", -3, y, 6.7);
        link(nodes, "reception", "hallSW");
        link(nodes, "reception", "entrance");
        sitTargets["reception"] = { sit: false, facing: 0 };

        // ---- info kiosk near entrance ----
        const kioskM = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.4, 0.4), solidMat(0x335577));
        kioskM.position.set(3, y + 0.7, 7);
        group.add(kioskM);
        addNode(nodes, "kiosk", 3, y, 6.2);
        link(nodes, "kiosk", "entrance");
        link(nodes, "kiosk", "hallSE");
        sitTargets["kiosk"] = { sit: false, facing: 0 };

        // ---- generic loiter waypoints ----
        const loiter = [
            { n: "lobby_stand_center", x: 0, z: 4 },
            { n: "lobby_stand_NE", x: 5, z: -1 },
            { n: "lobby_stand_NW", x: -5, z: -1 },
            { n: "lobby_stand_midE", x: 4, z: 3 },
            { n: "lobby_stand_midW", x: -4, z: 3 },
            { n: "lobby_stand_entry", x: 0, z: 6.5 }
        ];
        for (const l of loiter) {
            addNode(nodes, l.n, l.x, y, l.z);
            link(nodes, l.n, "elevWait");
            link(nodes, l.n, "entrance");
            link(nodes, l.n, "hallS");
            sitTargets[l.n] = { sit: false, facing: Math.PI };
        }

        // call panel + shaft indicator
        const callPanel = createCallPanel();
        callPanel.position.set(SH + 0.6, y + 1.5, SD + 0.06);
        group.add(callPanel);
        const shaftIndicator = createShaftIndicator(0.9);
        shaftIndicator.position.set(0, y + 2.6, SD + 0.05);
        group.add(shaftIndicator);

        return {
            floorNumber: 0, nodes: nodes, callPanel: callPanel,
            shaftIndicator: shaftIndicator, desks: [], sitTargets: sitTargets,
            isLobby: true
        };
    }

    // ---------- building shell ----------
    function buildShell(group) {
        const total = WORLD.FLOOR_COUNT * WORLD.FLOOR_HEIGHT;

        // ground slab
        const ground = new THREE.Mesh(new THREE.BoxGeometry(WORLD.BUILDING_WIDTH, 0.2, WORLD.BUILDING_DEPTH), solidMat(0x777777));
        ground.position.set(0, -0.1, 0);
        group.add(ground);

        // roof
        const roof = new THREE.Mesh(new THREE.BoxGeometry(WORLD.BUILDING_WIDTH, 0.2, WORLD.BUILDING_DEPTH), solidMat(0x666666));
        roof.position.set(0, total + 0.1, 0);
        group.add(roof);

        const slabMat = transparentMat(0x888888, 0.3);
        // intermediate slabs: four strips around shaft opening
        for (let f = 1; f < WORLD.FLOOR_COUNT; f++) {
            const fy = f * WORLD.FLOOR_HEIGHT;
            // front strip (z > SD)
            const frontD = HALF_D - SD;
            const frontStrip = new THREE.Mesh(new THREE.BoxGeometry(WORLD.BUILDING_WIDTH, 0.12, frontD), slabMat);
            frontStrip.position.set(0, fy, SD + frontD / 2);
            group.add(frontStrip);
            // back strip
            const backStrip = new THREE.Mesh(new THREE.BoxGeometry(WORLD.BUILDING_WIDTH, 0.12, frontD), slabMat);
            backStrip.position.set(0, fy, -(SD + frontD / 2));
            group.add(backStrip);
            // left strip (between front/back, x < -SH)
            const sideW = HALF_W - SH;
            const leftStrip = new THREE.Mesh(new THREE.BoxGeometry(sideW, 0.12, WORLD.SHAFT_DEPTH), slabMat);
            leftStrip.position.set(-(SH + sideW / 2), fy, 0);
            group.add(leftStrip);
            const rightStrip = new THREE.Mesh(new THREE.BoxGeometry(sideW, 0.12, WORLD.SHAFT_DEPTH), slabMat);
            rightStrip.position.set(SH + sideW / 2, fy, 0);
            group.add(rightStrip);
        }

        // outer walls (semi-transparent blue)
        const wallMat = transparentMat(0x9999ff, 0.2);
        // back wall
        const back = new THREE.Mesh(new THREE.BoxGeometry(WORLD.BUILDING_WIDTH, total, 0.15), wallMat);
        back.position.set(0, total / 2, -HALF_D);
        group.add(back);
        // left + right walls
        const left = new THREE.Mesh(new THREE.BoxGeometry(0.15, total, WORLD.BUILDING_DEPTH), wallMat);
        left.position.set(-HALF_W, total / 2, 0);
        group.add(left);
        const right = new THREE.Mesh(new THREE.BoxGeometry(0.15, total, WORLD.BUILDING_DEPTH), wallMat);
        right.position.set(HALF_W, total / 2, 0);
        group.add(right);

        // front wall: 3-unit gap on floor 0 only.
        // two side panels full height, one above-the-gap panel covering floors 1..5
        const gapHalf = 1.5;
        const sidePanelW = HALF_W - gapHalf;
        const fLeft = new THREE.Mesh(new THREE.BoxGeometry(sidePanelW, total, 0.15), wallMat);
        fLeft.position.set(-(gapHalf + sidePanelW / 2), total / 2, HALF_D);
        group.add(fLeft);
        const fRight = new THREE.Mesh(new THREE.BoxGeometry(sidePanelW, total, 0.15), wallMat);
        fRight.position.set(gapHalf + sidePanelW / 2, total / 2, HALF_D);
        group.add(fRight);
        // above-gap panel: covers floors 1..5 (from y=FLOOR_HEIGHT up to total)
        const aboveH = total - WORLD.FLOOR_HEIGHT;
        const fAbove = new THREE.Mesh(new THREE.BoxGeometry(gapHalf * 2, aboveH, 0.15), wallMat);
        fAbove.position.set(0, WORLD.FLOOR_HEIGHT + aboveH / 2, HALF_D);
        group.add(fAbove);
    }

    function createWorld(scene) {
        const buildingGroup = new THREE.Group();
        buildingGroup.renderOrder = 0;
        scene.add(buildingGroup);

        buildShell(buildingGroup);

        const floors = [];
        floors.push(buildLobby(scene, buildingGroup));
        for (let f = 1; f < WORLD.FLOOR_COUNT; f++) {
            floors.push(buildOfficeFloor(scene, buildingGroup, f));
        }

        return {
            buildingGroup: buildingGroup,
            floors: floors,
            bfsPath: bfsPath,
            WORLD: WORLD
        };
    }

    root.WORLD = WORLD;
    root.createWorld = createWorld;
    root.bfsPath = bfsPath;
})(typeof window !== "undefined" ? window : globalThis);
