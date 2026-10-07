/* world.js — building geometry, per-floor layouts, furniture, navigation graph,
 * call panels. No ES modules. Exposes window.WORLD, window.createWorld,
 * window.bfsPath.
 */
(function () {
    "use strict";

    const WORLD = {
        FLOOR_HEIGHT: 3.4,
        FLOOR_COUNT: 6,
        BUILDING_WIDTH: 22,
        BUILDING_DEPTH: 18,
        SHAFT_WIDTH: 3,
        SHAFT_DEPTH: 3,
        PERSON_R: 0.4
    };

    // ---------- material helpers ----------
    function solid(color) {
        return new THREE.MeshLambertMaterial({ color: color });
    }
    function transparent(color, opacity) {
        const m = new THREE.MeshLambertMaterial({
            color: color,
            opacity: opacity,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        return m;
    }

    // ---------- canvas text texture (shared helper) ----------
    function makeTextTexture() {
        const canvas = document.createElement("canvas");
        canvas.width = 256;
        canvas.height = 256;
        const tex = new THREE.CanvasTexture(canvas);
        tex.magFilter = THREE.LinearFilter;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.anisotropy = 8;
        tex._lastText = null;
        return { canvas: canvas, texture: tex };
    }

    function updateTextTexture(holder, text) {
        if (holder.texture._lastText === text) return; // cache early-out
        holder.texture._lastText = text;
        const c = holder.canvas;
        const ctx = c.getContext("2d");
        ctx.fillStyle = "#050505";
        ctx.fillRect(0, 0, c.width, c.height);

        // measure largest glyph width so it fills ~82% of canvas
        let largest = 0;
        for (let i = 0; i < text.length; i++) {
            largest = Math.max(largest, text.charCodeAt(i));
        }
        let fontSize = 256 * 0.82;
        ctx.font = "bold " + fontSize + "px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        const cx = c.width / 2;
        const cy = c.height / 2;
        ctx.shadowColor = "#ffbb22";
        ctx.shadowBlur = 18;
        ctx.fillStyle = "#ffbb22";
        ctx.fillText(text, cx, cy);
        holder.texture.needsUpdate = true;
    }

    // ---------- box helper ----------
    function box(parent, w, h, d, mat, x, y, z) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        m.position.set(x, y, z);
        parent.add(m);
        return m;
    }

    // furniture helper used by sim via userData tags. Each returns references.
    function makeDesk(parent, face) {
        // desk surface + monitor at back; user sits facing the desk (-Z means
        // person faces -Z, so their back is toward +Z door; monitor at back).
        // face: {x, z, rotY} position & yaw of desk group.
        const g = new THREE.Group();
        g.position.set(face.x, face.y || 0, face.z);
        g.rotation.y = face.rotY || 0;
        const tableMat = solid(0x8a6b4f);
        const legMat = solid(0x444444);
        const top = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 0.8), tableMat);
        top.position.y = 0.74;
        g.add(top);
        // two legs
        const legGeo = new THREE.BoxGeometry(0.08, 0.74, 0.6);
        const l1 = new THREE.Mesh(legGeo, legMat);
        l1.position.set(-0.7, 0.37, 0);
        g.add(l1);
        const l2 = new THREE.Mesh(legGeo, legMat);
        l2.position.set(0.7, 0.37, 0);
        g.add(l2);
        // monitor at back (-Z side of desk)
        const mon = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.38, 0.5), solid(0x11111a));
        mon.position.set(0, 1.0, -0.34);
        g.add(mon);
        const monStand = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.15, 0.1), legMat);
        monStand.position.set(0, 0.82, -0.34);
        g.add(monStand);
        parent.add(g);
        return g;
    }

    function makeChair(parent, where, backYaw) {
        // backYaw is the rotation.y so that the seat opens toward -Z local
        // after the chair group's own rotation. We place the seat and backrest.
        const g = new THREE.Group();
        g.position.set(where.x, where.y || 0, where.z);
        g.rotation.y = where.rotY || 0;
        const seatMat = solid(0x555566);
        const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.5), seatMat);
        seat.position.y = 0.45;
        g.add(seat);
        // backrest behind seat on -Z local; chair "faces" +Z (a seated person,
        // nose/legs toward +Z, rests their back against the backrest at -Z).
        // Set chair.rotation.y = the person's desired facing so legs point the
        // same way the person faces.
        const back = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.08), seatMat);
        back.position.set(0, 0.75, -0.24);
        g.add(back);
        // four legs
        const lg = new THREE.BoxGeometry(0.05, 0.45, 0.05);
        [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]].forEach(function (p) {
            const leg = new THREE.Mesh(lg, solid(0x333333));
            leg.position.set(p[0], 0.225, p[1]);
            g.add(leg);
        });
        parent.add(g);
        return g;
    }

    function makeCouch(parent, where) {
        const g = new THREE.Group();
        g.position.set(where.x, where.y || 0, where.z);
        g.rotation.y = where.rotY || 0;
        const couchMat = solid(0x7a5a8a);
        const base = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.4, 0.7), couchMat);
        base.position.y = 0.35;
        g.add(base);
        const back = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 0.15), couchMat);
        back.position.set(0, 0.7, 0.3);
        g.add(back);
        parent.add(g);
        return g;
    }

    function makeTable(parent, where) {
        const g = new THREE.Group();
        g.position.set(where.x, where.y || 0, where.z);
        const t = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.8), solid(0x8a6b4f));
        t.position.y = 0.5;
        g.add(t);
        const lg = new THREE.BoxGeometry(0.08, 0.5, 0.08);
        [[-0.5, -0.3], [0.5, -0.3], [-0.5, 0.3], [0.5, 0.3]].forEach(function (p) {
            const leg = new THREE.Mesh(lg, solid(0x333333));
            leg.position.set(p[0], 0.25, p[1]);
            g.add(leg);
        });
        parent.add(g);
        return g;
    }

    function makeWaterCooler(parent, where) {
        const g = new THREE.Group();
        g.position.set(where.x, where.y || 0, where.z);
        const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.6, 12), transparent(0x88bbff, 0.5));
        bottle.position.y = 1.1;
        g.add(bottle);
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.32, 1.0, 0.32), solid(0xcccccc));
        body.position.y = 0.5;
        g.add(body);
        parent.add(g);
        return g;
    }

    function makePlant(parent, where) {
        const g = new THREE.Group();
        g.position.set(where.x, where.y || 0, where.z);
        const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.4, 12), solid(0x8a4a2a));
        pot.position.y = 0.2;
        g.add(pot);
        const foliage = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), solid(0x2f7a3a));
        foliage.position.y = 0.7;
        g.add(foliage);
        parent.add(g);
        return g;
    }

    // ---------- call panel ----------
    function makeCallPanel(parent, x, y, z) {
        const plate = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.4, 0.06), solid(0x222233));
        plate.position.set(x, y, z);
        parent.add(plate);

        // arrow triangles via ShapeGeometry
        function arrow(parent, cx, cy, up) {
            const shape = new THREE.Shape();
            if (up) {
                shape.moveTo(0, 0.13);
                shape.lineTo(-0.13, -0.13);
                shape.lineTo(0.13, -0.13);
                shape.closePath();
            } else {
                shape.moveTo(0, -0.13);
                shape.lineTo(-0.13, 0.13);
                shape.lineTo(0.13, 0.13);
                shape.closePath();
            }
            const geo = new THREE.ShapeGeometry(shape);
            const mesh = new THREE.Mesh(geo, solid(0x555555));
            mesh.position.set(cx, cy, 0);
            parent.add(mesh);
            return mesh;
        }

        const upArrow = arrow(plate, 0, 0.35, true);
        const downArrow = arrow(plate, 0, -0.35, false);

        const display = makeTextTexture();
        const dispMesh = new THREE.Mesh(
            new THREE.PlaneGeometry(0.45, 0.45),
            new THREE.MeshBasicMaterial({ map: display.texture })
        );
        dispMesh.position.set(0, 0, 0.035);
        plate.add(dispMesh);

        const litMat = new THREE.MeshBasicMaterial({ color: 0x33ff66 });
        const dimMat = new THREE.MeshBasicMaterial({ color: 0x555555 });
        // note: arrow meshes use MeshLambertMaterial via solid(); we swapped refs below
        upArrow.userData.on = false;
        downArrow.userData.on = false;

        const panel = {
            plate: plate,
            upArrow: upArrow,
            downArrow: downArrow,
            display: display,
            dispMesh: dispMesh,
            setUp: function (on) {
                upArrow.material = on ? litMat : dimMat;
                upArrow.userData.on = on;
            },
            setDown: function (on) {
                downArrow.material = on ? litMat : dimMat;
                downArrow.userData.on = on;
            },
            setIndicator: function (text) {
                updateTextTexture(display, text);
            }
        };
        // initial: arrows dimmed (replace lambert with meshbasic)
        panel.setUp(false);
        panel.setDown(false);
        panel.userData = panel;
        plate.userData = panel;
        return panel;
    }

    function makeShaftIndicator(parent, x, y, z, scale) {
        const holder = makeTextTexture();
        const geo = new THREE.PlaneGeometry(scale, scale);
        const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: holder.texture }));
        mesh.position.set(x, y, z);
        parent.add(mesh);
        const ind = {
            textureHolder: holder,
            set: function (text) { updateTextTexture(holder, text); }
        };
        return ind;
    }

    // ---------- navigation ----------
    // Each floor has nodes: an ordered list and adjacency.
    function bfsPath(nodes, fromName, toName) {
        if (!nodes[fromName] || !nodes[toName]) return [];
        if (fromName === toName) return [nodes[fromName].clone()];
        const prev = {};
        const seen = { [fromName]: true };
        const queue = [fromName];
        while (queue.length) {
            const cur = queue.shift();
            if (cur === toName) break;
            const links = nodes[cur].links || [];
            for (let i = 0; i < links.length; i++) {
                const nb = links[i];
                if (!seen[nb]) {
                    seen[nb] = true;
                    prev[nb] = cur;
                    queue.push(nb);
                }
            }
        }
        if (!prev[toName] && fromName !== toName) return [];
        const path = [toName];
        let c = toName;
        while (c !== fromName) {
            c = prev[c];
            if (c === undefined) return [];
            path.push(c);
        }
        path.reverse();
        return path.map(function (n) { return nodes[n].clone(); });
    }

    // ---------- build one office floor (1..5) ----------
    function buildOfficeFloor(parent, floorNumber, yBase, sitTargets, allFloors, lobbyInfo) {
        const FH = WORLD.FLOOR_HEIGHT;
        const HW = WORLD.BUILDING_WIDTH / 2;  // 11
        const HD = WORLD.BUILDING_DEPTH / 2;  // 9

        const nodes = {};
        const defNode = function (name, x, z, links) {
            nodes[name] = new THREE.Vector3(x, yBase, z);
            nodes[name].links = links || [];
            return nodes[name];
        };
        const link = function (a, b) {
            if (nodes[a] && nodes[b]) {
                if (nodes[a].links.indexOf(b) < 0) nodes[a].links.push(b);
                if (nodes[b].links.indexOf(a) < 0) nodes[b].links.push(a);
            }
        };

        // hallway ring around shaft
        defNode("elevWait", 0, 2.0);
        defNode("hallS", 0, 3.5);
        defNode("hallSE", 4, 3.5);
        defNode("hallE", 6, 0);
        defNode("hallNE", 4, -3.5);
        defNode("hallN", 0, -4.5);
        defNode("hallNW", -4, -3.5);
        defNode("hallW", -6, 0);
        defNode("hallSW", -4, 3.5);

        link("elevWait", "hallS");
        link("hallS", "hallSE");
        link("hallSE", "hallE");
        link("hallE", "hallNE");
        link("hallNE", "hallN");
        link("hallN", "hallNW");
        link("hallNW", "hallW");
        link("hallW", "hallSW");
        link("hallSW", "hallS");
        link("hallW", "hallE"); // shortcut across hallway

        // ---- private offices along back wall (z in [-9,-3]) ----
        // office doors along hallway back; four offices
        const officeXs = [-8, -4.7, 0, 4.7]; // handles
        const officeNames = ["officeA", "officeB", "officeC", "officeD"];
        const offices = [];
        const desks = [];

        officeNames.forEach(function (name, i) {
            const doorX = officeXs[i];
            const deskX = officeXs[i];
            const doorZ = -4.6;
            const deskZ = -7.2;
            const sitZ = deskZ + 0.85; // where the chair sits (door side of desk)
            defNode(name + "_door", doorX, doorZ);
            defNode(name + "_desk", deskX, sitZ);

            // internal office walls (segments) with a 1.2 gap for the doorway
            const wallMat = transparent(0xbbc5e6, 0.28);
            function wallSeg(x1, z1, x2, z2) {
                const w = Math.sqrt((x2 - x1) * (x2 - x1) + (z2 - z1) * (z2 - z1));
                const seg = new THREE.Mesh(new THREE.BoxGeometry(w, FH - 0.2, 0.12), wallMat);
                seg.position.set((x1 + x2) / 2, yBase + FH / 2, (z1 + z2) / 2);
                seg.rotation.y = Math.atan2(z2 - z1, x2 - x1);
                parent.add(seg);
            }
            // walls forming office cell: left/right dividers run in z from -9 to -3
            const leftX = officeXs[i] - 1.1;
            const rightX = officeXs[i] + 1.1;
            // back wall at z=-9
            wallSeg(leftX, -9, rightX, -9);
            // front wall at z=-3 with doorway gap centered on doorX
            const gap = 1.2;
            wallSeg(leftX, -3, doorX - gap / 2, -3);
            wallSeg(doorX + gap / 2, -3, rightX, -3);
            // side walls
            wallSeg(leftX, -9, leftX, -3);
            wallSeg(rightX, -9, rightX, -3);

            // desk + chair: desk monitor faces back wall (-Z); chair sits on the
            // door side of the desk so a seated person faces the monitor (-Z).
            const desk = makeDesk(parent, { x: deskX, y: yBase, z: deskZ, rotY: 0 });
            const chair = makeChair(parent, { x: deskX, y: yBase, z: deskZ + 0.85, rotY: Math.PI });
            desks.push({ name: name + "_desk", desk: desk, chair: chair, sx: deskX, sz: deskZ });

            // seat target: face monitor (-Z => rotation.y = PI)
            sitTargets[name + "_desk"] = { sit: true, facing: Math.PI };
        });

        // link office doors to hallway corners
        link("officeA_door", "hallNW");
        link("officeB_door", "hallN");
        link("officeC_door", "hallNE");
        link("officeD_door", "hallE");

        // ---- conference room (front-left quadrant x[-11,-3], z[3,9]) ----
        defNode("conf_door", -4, 3.5);
        defNode("conf_center", -7, 6);
        ["conf_seat0", "conf_seat1", "conf_seat2", "conf_seat3"].forEach(function (s, i) {
            const sx = -7 + (i % 2 === 0 ? -0.8 : 0.8);
            const sz = i < 2 ? 5.2 : 6.8;
            defNode(s, sx, sz);
            // two chairs per long side facing each other across the table:
            // front side (z 5.2) faces +Z (toward table), back side faces -Z.
            sitTargets[s] = { sit: true, facing: i < 2 ? 0 : Math.PI };
        });
        link("conf_door", "hallSW");
        link("conf_door", "conf_center");
        ["conf_seat0", "conf_seat1", "conf_seat2", "conf_seat3"].forEach(function (s) {
            link("conf_center", s);
        });

        // conference room furniture
        const confTable = makeTable(parent, { x: -7, y: yBase, z: 6, rotY: 0 });
        // scale table longer
        confTable.scale.set(2.6, 1, 1);
        makeChair(parent, { x: -7.9, y: yBase, z: 5.1, rotY: 0 });
        makeChair(parent, { x: -6.1, y: yBase, z: 5.1, rotY: 0 });
        makeChair(parent, { x: -7.9, y: yBase, z: 6.9, rotY: Math.PI });
        makeChair(parent, { x: -6.1, y: yBase, z: 6.9, rotY: Math.PI });
        // conference room walls
        const confWall = transparent(0xbbc5e6, 0.28);
        function confWallSeg(x1, z1, x2, z2) {
            const w = Math.sqrt((x2 - x1) * (x2 - x1) + (z2 - z1) * (z2 - z1));
            const seg = new THREE.Mesh(new THREE.BoxGeometry(w, FH - 0.2, 0.12), confWall);
            seg.position.set((x1 + x2) / 2, yBase + FH / 2, (z1 + z2) / 2);
            seg.rotation.y = Math.atan2(z2 - z1, x2 - x1);
            parent.add(seg);
        }
        confWallSeg(-11, 3, -3, 3);
        confWallSeg(-11, 3, -11, 9);
        confWallSeg(-11, 9, -3, 9);
        // door gap on z=3 wall
        confWallSeg(-3, 3, -2.4, 3);
        confWallSeg(-5.6, 3, -11, 3);

        // ---- lounge/break area (front-right quadrant x[3,11], z[3,9]) ----
        defNode("lounge_door", 4, 3.5);
        defNode("lounge_center", 7, 6);
        ["lounge_spot0", "lounge_spot1", "lounge_spot2"].forEach(function (s, i) {
            defNode(s, 6 + i * 1.2, 6);
            sitTargets[s] = { sit: true, facing: Math.PI };
        });
        link("lounge_door", "hallSE");
        link("lounge_door", "lounge_center");
        ["lounge_spot0", "lounge_spot1", "lounge_spot2"].forEach(function (s) {
            link("lounge_center", s);
        });

        // lounge furniture: couch + coffee table + 2 armchairs + water cooler
        makeCouch(parent, { x: 6, y: yBase, z: 6.8, rotY: Math.PI });
        makeTable(parent, { x: 7.5, y: yBase, z: 6.8 });
        makeChair(parent, { x: 9, y: yBase, z: 6.8, rotY: Math.PI });
        makeChair(parent, { x: 9, y: yBase, z: 5.2, rotY: 0 });
        makeWaterCooler(parent, { x: 10, y: yBase, z: 3.6 });
        makePlant(parent, { x: 4.5, y: yBase, z: 3.6 });

        // lounge walls
        const loungeWall = transparent(0xbbc5e6, 0.28);
        function loungeWallSeg(x1, z1, x2, z2) {
            const w = Math.sqrt((x2 - x1) * (x2 - x1) + (z2 - z1) * (z2 - z1));
            const seg = new THREE.Mesh(new THREE.BoxGeometry(w, FH - 0.2, 0.12), loungeWall);
            seg.position.set((x1 + x2) / 2, yBase + FH / 2, (z1 + z2) / 2);
            seg.rotation.y = Math.atan2(z2 - z1, x2 - x1);
            parent.add(seg);
        }
        loungeWallSeg(3, 3, 11, 3);
        loungeWallSeg(3, 3, 3, 9);
        loungeWallSeg(3, 9, 11, 9);
        loungeWallSeg(11, 3, 11, 9);
        // door gap
        loungeWallSeg(3, 3, 3.4, 3);
        loungeWallSeg(4.6, 3, 11, 3);

        // ---- standing waypoints on office floors ----
        defNode("water_cooler", 10, 4.4);
        defNode("hall_stand_N", 0, -3.2);
        defNode("hall_stand_S", 0, 2.8);
        link("water_cooler", "hallE");
        link("hall_stand_N", "hallN");
        link("hall_stand_S", "hallS");
        sitTargets["water_cooler"] = { sit: false, facing: 0 };
        sitTargets["hall_stand_N"] = { sit: false, facing: 0 };
        sitTargets["hall_stand_S"] = { sit: false, facing: 0 };

        // call panel next to shaft, facing +Z
        const panel = makeCallPanel(parent, -1.6, yBase + 1.2, 1.95);
        // shaft indicator above doors
        const shaftInd = makeShaftIndicator(parent, 0, yBase + FH - 0.4, 1.95, 0.9);

        return {
            floorNumber: floorNumber,
            nodes: nodes,
            callPanel: panel,
            shaftIndicator: shaftInd,
            desks: desks,
            sitTargets: sitTargets
        };
    }

    // ---------- build ground floor lobby ----------
    function buildLobby(parent, yBase, sitTargets) {
        const FH = WORLD.FLOOR_HEIGHT;
        const nodes = {};
        const defNode = function (name, x, z) {
            nodes[name] = new THREE.Vector3(x, yBase, z);
            nodes[name].links = [];
            return nodes[name];
        };
        const link = function (a, b) {
            if (nodes[a] && nodes[b]) {
                if (nodes[a].links.indexOf(b) < 0) nodes[a].links.push(b);
                if (nodes[b].links.indexOf(a) < 0) nodes[b].links.push(a);
            }
        };

        // entrance chain
        defNode("outside", 0, 12);
        defNode("front_door_threshold", 0, 9.35);
        defNode("entrance", 0, 7.4);
        defNode("lobby_center", 0, 4);
        link("outside", "front_door_threshold");
        link("front_door_threshold", "entrance");
        link("entrance", "lobby_center");

        // hallway ring (lobby)
        defNode("elevWait", 0, 2.0);
        defNode("hallS", 0, 3.5);
        defNode("hallSE", 4, 3.5);
        defNode("hallE", 6, 0);
        defNode("hallNE", 4, -3.5);
        defNode("hallN", 0, -4.5);
        defNode("hallNW", -4, -3.5);
        defNode("hallW", -6, 0);
        defNode("hallSW", -4, 3.5);
        link("elevWait", "hallS");
        link("hallS", "hallSE");
        link("hallSE", "hallE");
        link("hallE", "hallNE");
        link("hallNE", "hallN");
        link("hallN", "hallNW");
        link("hallNW", "hallW");
        link("hallW", "hallSW");
        link("hallSW", "hallS");
        link("hallW", "hallE");

        // link entrance chain directly to elevWait (avoid hallS round-trip)
        link("lobby_center", "elevWait");
        link("entrance", "lobby_center");
        link("lobby_center", "hallS");

        // cafe (left wall, x negative)
        defNode("cafe_door", -4, 3.5);
        defNode("cafe_order", -7, 4);
        defNode("cafe_counter", -7, 4);
        ["bistro0", "bistro1", "bistro2", "bistro3"].forEach(function (b, i) {
            defNode(b, -8 + (i % 2) * 1.5, 6 + Math.floor(i / 2) * 1.5);
            sitTargets[b] = { sit: true, facing: Math.PI };
        });
        link("cafe_door", "hallSW");
        link("cafe_door", "cafe_order");
        ["bistro0", "bistro1", "bistro2", "bistro3"].forEach(function (b) {
            link("cafe_order", b);
        });
        sitTargets["cafe_order"] = { sit: false, facing: 0 };
        sitTargets["cafe_counter"] = { sit: false, facing: 0 };

        // front lounge (right side, z positive)
        defNode("front_lounge", 6, 6);
        defNode("fl_spot0", 5, 6.8);
        defNode("fl_spot1", 7, 6.8);
        defNode("fl_spot2", 6, 5.2);
        link("front_lounge", "hallSE");
        sitTargets["fl_spot0"] = { sit: true, facing: Math.PI };
        sitTargets["fl_spot1"] = { sit: true, facing: Math.PI };
        sitTargets["fl_spot2"] = { sit: true, facing: 0 };
        ["fl_spot0", "fl_spot1", "fl_spot2"].forEach(function (s) {
            link("front_lounge", s);
        });
        sitTargets["front_lounge"] = { sit: false, facing: 0 };

        // back lounge (Z < 0)
        defNode("back_lounge_N", 0, -6);
        defNode("back_lounge_S", 0, -8);
        link("back_lounge_N", "hallN");
        link("back_lounge_N", "back_lounge_S");
        sitTargets["back_lounge_N"] = { sit: true, facing: 0 };
        sitTargets["back_lounge_S"] = { sit: true, facing: Math.PI };

        // conversation pit (back-left)
        defNode("pit_N", -6, -6.4);
        defNode("pit_S", -6, -8.4);
        defNode("pit_E", -4.6, -7.4);
        defNode("pit_W", -7.4, -7.4);
        link("pit_N", "hallNW");
        link("pit_N", "pit_E");
        link("pit_N", "pit_W");
        link("pit_S", "pit_E");
        link("pit_S", "pit_W");
        ["pit_N", "pit_S", "pit_E", "pit_W"].forEach(function (n) {
            sitTargets[n] = { sit: true, facing: 0 };
        });

        // water coolers
        defNode("lobby_wc_front", 8, 4.6);
        defNode("lobby_wc_back", 8, -3.2);
        link("lobby_wc_front", "hallE");
        link("lobby_wc_back", "hallE");
        sitTargets["lobby_wc_front"] = { sit: false, facing: 0 };
        sitTargets["lobby_wc_back"] = { sit: false, facing: 0 };

        // reception
        defNode("reception", -3, 6);
        link("reception", "hallSW");
        sitTargets["reception"] = { sit: false, facing: 0 };

        // info kiosk
        defNode("kiosk", 0, 6.4);
        link("kiosk", "entrance");
        sitTargets["kiosk"] = { sit: false, facing: 0 };

        // generic loiter waypoints
        defNode("lobby_stand_center", 0, 1.2);
        defNode("lobby_stand_NE", 4, -1.5);
        defNode("lobby_stand_NW", -4, -1.5);
        defNode("lobby_stand_midE", 4, 1.5);
        defNode("lobby_stand_midW", -4, 1.5);
        defNode("lobby_stand_entry", 0, 5.5);
        link("lobby_stand_center", "lobby_center");
        link("lobby_stand_NE", "hallNE");
        link("lobby_stand_NW", "hallNW");
        link("lobby_stand_midE", "hallE");
        link("lobby_stand_midW", "hallW");
        link("lobby_stand_entry", "entrance");
        ["lobby_stand_center", "lobby_stand_NE", "lobby_stand_NW", "lobby_stand_midE", "lobby_stand_midW", "lobby_stand_entry"].forEach(function (n) {
            sitTargets[n] = { sit: false, facing: 0 };
        });

        // ---- furniture ----
        // cafe counter on left wall
        const counter = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.0, 0.9), solid(0x5a4a3a));
        counter.position.set(-7, yBase + 0.5, 5.2);
        parent.add(counter);
        const counterTop = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.1, 1.0), solid(0x33261a));
        counterTop.position.set(-7, yBase + 1.05, 5.2);
        parent.add(counterTop);
        // coffee machine + pastry display
        const coffee = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, 0.5), solid(0x777777));
        coffee.position.set(-8, yBase + 1.5, 5.2);
        parent.add(coffee);
        const pastry = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.4, 0.5), transparent(0xccbb88, 0.6));
        pastry.position.set(-6, yBase + 1.25, 5.2);
        parent.add(pastry);
        // bistro tables
        ["bistro0", "bistro1", "bistro2", "bistro3"].forEach(function (b, i) {
            makeTable(parent, { x: -8 + (i % 2) * 1.5, y: yBase, z: 6 + Math.floor(i / 2) * 1.5 });
            makeChair(parent, { x: -8 + (i % 2) * 1.5, y: yBase, z: 6 + Math.floor(i / 2) * 1.5 - 0.6, rotY: Math.PI });
            makeChair(parent, { x: -8 + (i % 2) * 1.5, y: yBase, z: 6 + Math.floor(i / 2) * 1.5 + 0.6, rotY: 0 });
        });

        // front lounge furniture (right)
        makeCouch(parent, { x: 5, y: yBase, z: 6.8, rotY: Math.PI });
        makeTable(parent, { x: 6.6, y: yBase, z: 6.8 });
        makeChair(parent, { x: 8, y: yBase, z: 6.8, rotY: Math.PI });
        makeChair(parent, { x: 8, y: yBase, z: 5.2, rotY: 0 });

        // back lounge (two couches facing each other)
        makeCouch(parent, { x: 0, y: yBase, z: -6, rotY: 0 });
        makeCouch(parent, { x: 0, y: yBase, z: -8, rotY: Math.PI });
        makeTable(parent, { x: 0, y: yBase, z: -7 });

        // conversation pit table + 4 armchairs
        makeTable(parent, { x: -6, y: yBase, z: -7.4 });
        makeChair(parent, { x: -6, y: yBase, z: -6.4, rotY: 0 });
        makeChair(parent, { x: -6, y: yBase, z: -8.4, rotY: Math.PI });
        makeChair(parent, { x: -4.6, y: yBase, z: -7.4, rotY: -Math.PI / 2 });
        makeChair(parent, { x: -7.4, y: yBase, z: -7.4, rotY: Math.PI / 2 });

        // water coolers
        makeWaterCooler(parent, { x: 8, y: yBase, z: 4.6 });
        makeWaterCooler(parent, { x: 8, y: yBase, z: -3.2 });

        // reception desk off to the side
        const reception = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.1, 0.8), solid(0x4a3a5a));
        reception.position.set(-3, yBase + 0.55, 6);
        parent.add(reception);

        // info kiosk near entrance
        const kiosk = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.6, 0.5), solid(0x333344));
        kiosk.position.set(0, yBase + 0.8, 6.4);
        parent.add(kiosk);
        const kioskScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.7), new THREE.MeshBasicMaterial({ color: 0x22aaff }));
        kioskScreen.position.set(0, yBase + 0.9, 6.16);
        parent.add(kioskScreen);

        // plants by entrance
        makePlant(parent, { x: -2.2, y: yBase, z: 8.4 });
        makePlant(parent, { x: 2.2, y: yBase, z: 8.4 });

        // call panel + shaft indicator
        const panel = makeCallPanel(parent, -1.6, yBase + 1.2, 1.95);
        const shaftInd = makeShaftIndicator(parent, 0, yBase + FH - 0.4, 1.95, 0.9);

        return {
            floorNumber: 0,
            nodes: nodes,
            callPanel: panel,
            shaftIndicator: shaftInd,
            desks: [],
            sitTargets: sitTargets
        };
    }

    // ---------- main world builder ----------
    function createWorld(scene) {
        const FH = WORLD.FLOOR_HEIGHT;
        const HW = WORLD.BUILDING_WIDTH / 2;
        const HD = WORLD.BUILDING_DEPTH / 2;

        const buildingGroup = new THREE.Group();
        buildingGroup.renderOrder = 0;
        scene.add(buildingGroup);

        // ground slab
        const ground = new THREE.Mesh(new THREE.BoxGeometry(WORLD.BUILDING_WIDTH + 4, 0.4, WORLD.BUILDING_DEPTH + 4), solid(0x444444));
        ground.position.set(0, -0.2, 0);
        buildingGroup.add(ground);

        // sidewalk (concrete slab outside front wall, z ~ +12)
        const sidewalk = new THREE.Mesh(new THREE.BoxGeometry(WORLD.BUILDING_WIDTH + 4, 0.15, 4), solid(0x777777));
        sidewalk.position.set(0, -0.05, 12);
        buildingGroup.add(sidewalk);

        // roof
        const roof = new THREE.Mesh(new THREE.BoxGeometry(WORLD.BUILDING_WIDTH, 0.4, WORLD.BUILDING_DEPTH), solid(0x555555));
        roof.position.set(0, WORLD.FLOOR_COUNT * FH + 0.2, 0);
        buildingGroup.add(roof);

        const slabMat = transparent(0x888888, 0.3);

        // intermediate floor slabs: four strips around shaft opening
        for (let f = 1; f < WORLD.FLOOR_COUNT; f++) {
            const y = f * FH;
            const sw = WORLD.SHAFT_WIDTH / 2;
            const sd = WORLD.SHAFT_DEPTH / 2;
            // front strip (z from sd to HD)
            const strip1 = new THREE.Mesh(new THREE.BoxGeometry(WORLD.BUILDING_WIDTH, 0.2, HD - sd), slabMat);
            strip1.position.set(0, y, sd + (HD - sd) / 2);
            buildingGroup.add(strip1);
            // back strip (z from -HD to -sd)
            const strip2 = new THREE.Mesh(new THREE.BoxGeometry(WORLD.BUILDING_WIDTH, 0.2, HD - sd), slabMat);
            strip2.position.set(0, y, -sd - (HD - sd) / 2);
            buildingGroup.add(strip2);
            // left strip (x from -HW to -sw, z from -sd to sd)
            const strip3 = new THREE.Mesh(new THREE.BoxGeometry(HW - sw, 0.2, sd * 2), slabMat);
            strip3.position.set(-sw - (HW - sw) / 2, y, 0);
            buildingGroup.add(strip3);
            // right strip
            const strip4 = new THREE.Mesh(new THREE.BoxGeometry(HW - sw, 0.2, sd * 2), slabMat);
            strip4.position.set(sw + (HW - sw) / 2, y, 0);
            buildingGroup.add(strip4);
        }

        // outer walls (semi-transparent blue)
        const wallMat = transparent(0x9999ff, 0.2);
        // back wall (full height)
        const backWall = new THREE.Mesh(new THREE.BoxGeometry(WORLD.BUILDING_WIDTH, WORLD.FLOOR_COUNT * FH, 0.12), wallMat);
        backWall.position.set(0, WORLD.FLOOR_COUNT * FH / 2, -HD);
        buildingGroup.add(backWall);
        // left wall
        const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.12, WORLD.FLOOR_COUNT * FH, WORLD.BUILDING_DEPTH), wallMat);
        leftWall.position.set(-HW, WORLD.FLOOR_COUNT * FH / 2, 0);
        buildingGroup.add(leftWall);
        // right wall
        const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.12, WORLD.FLOOR_COUNT * FH, WORLD.BUILDING_DEPTH), wallMat);
        rightWall.position.set(HW, WORLD.FLOOR_COUNT * FH / 2, 0);
        buildingGroup.add(rightWall);

        // front wall in three segments: two full-height side panels + one above-gap
        const gap = 3.0;
        const sidePanelWidth = (WORLD.BUILDING_WIDTH - gap) / 2;
        const leftFront = new THREE.Mesh(new THREE.BoxGeometry(sidePanelWidth, WORLD.FLOOR_COUNT * FH, 0.12), wallMat);
        leftFront.position.set(-(gap / 2 + sidePanelWidth / 2), WORLD.FLOOR_COUNT * FH / 2, HD);
        buildingGroup.add(leftFront);
        const rightFront = new THREE.Mesh(new THREE.BoxGeometry(sidePanelWidth, WORLD.FLOOR_COUNT * FH, 0.12), wallMat);
        rightFront.position.set(gap / 2 + sidePanelWidth / 2, WORLD.FLOOR_COUNT * FH / 2, HD);
        buildingGroup.add(rightFront);
        // above-gap panel covering floors 1..5 (y from FH to top)
        const aboveGap = new THREE.Mesh(new THREE.BoxGeometry(gap, (WORLD.FLOOR_COUNT - 1) * FH, 0.12), wallMat);
        aboveGap.position.set(0, FH + (WORLD.FLOOR_COUNT - 1) * FH / 2, HD);
        buildingGroup.add(aboveGap);

        // glass doors at entrance (visual only, at z=+9)
        const doorMat = transparent(0xaaddff, 0.35);
        const doorGeo = new THREE.BoxGeometry(1.3, 2.4, 0.06);
        const d1 = new THREE.Mesh(doorGeo, doorMat);
        d1.position.set(-0.75, 1.2, 9.0);
        buildingGroup.add(d1);
        const d2 = new THREE.Mesh(doorGeo, doorMat);
        d2.position.set(0.75, 1.2, 9.0);
        buildingGroup.add(d2);

        // ---- build floors ----
        const floors = [];
        const sitTargets = {};   // global map floor:wpName -> {sit, facing}, stored per floor

        // lobby (floor 0)
        const lobbySit = {};
        const lobby = buildLobby(buildingGroup, 0, lobbySit);
        floors.push(lobby);

        // office floors 1..5
        for (let f = 1; f < WORLD.FLOOR_COUNT; f++) {
            const sf = {};
            const floor = buildOfficeFloor(buildingGroup, f, f * FH, sf, floors, null);
            floors.push(floor);
        }

        return {
            buildingGroup: buildingGroup,
            floors: floors,
            sitTargets: function (floorNumber, wpName) {
                const fl = floors[floorNumber];
                if (!fl) return null;
                return fl.sitTargets ? fl.sitTargets[wpName] : null;
            },
            bfsPath: function (floorNumber, fromName, toName) {
                const fl = floors[floorNumber];
                if (!fl) return [];
                return bfsPath(fl.nodes, fromName, toName);
            },
            nodeAt: function (floorNumber, name) {
                const fl = floors[floorNumber];
                return fl && fl.nodes[name] ? fl.nodes[name] : null;
            }
        };
    }

    window.WORLD = WORLD;
    window.createWorld = createWorld;
    window.bfsPath = bfsPath;
})();
