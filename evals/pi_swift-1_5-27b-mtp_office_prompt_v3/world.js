/*
 * world.js - building geometry, per-floor layouts, furniture, navigation
 * graph, call panels. Browser globals only (no ES modules).
 */
(function () {
    "use strict";

    var WORLD = {
        FLOOR_HEIGHT: 3.4,
        FLOOR_COUNT: 6,
        BUILDING_WIDTH: 22,
        BUILDING_DEPTH: 18,
        SHAFT_WIDTH: 3,
        SHAFT_DEPTH: 3,
        PERSON_R: 0.4
    };

    // ---------- shared material helpers ----------

    function semiMat(color, opacity) {
        return new THREE.MeshLambertMaterial({
            color: color, transparent: true, opacity: opacity,
            depthWrite: false, side: THREE.DoubleSide
        });
    }

    function solidMat(color) {
        return new THREE.MeshLambertMaterial({ color: color });
    }

    function box(w, h, d, mat, x, y, z) {
        var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        m.position.set(x, y, z);
        return m;
    }

    // ---------- text texture (cached) ----------

    function makeTextTexture(widthPx) {
        var canvas = document.createElement("canvas");
        canvas.width = widthPx;
        canvas.height = widthPx;
        var ctx = canvas.getContext("2d");
        var tex = new THREE.CanvasTexture(canvas);
        tex.minFilter = THREE.LinearFilter;
        tex.generateMipmaps = true;
        tex.anisotropy = 4;
        tex._lastText = "";
        tex._ctx = ctx;
        return tex;
    }

    function updateTextTexture(tex, text, fontSizePx) {
        if (tex._lastText === text) return; // avoid re-uploading every frame
        tex._lastText = text;
        var ctx = tex._ctx;
        var W = tex.image.width;
        ctx.fillStyle = "#050505";
        ctx.fillRect(0, 0, W, W);
        ctx.font = "bold " + (fontSizePx || Math.floor(W * 0.82)) + "px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.shadowColor = "#ffbb22";
        ctx.shadowBlur = 18;
        ctx.fillStyle = "#ffbb22";
        ctx.fillText(text, W / 2, W / 2);
        tex.needsUpdate = true;
    }

    // ---------- furniture primitives ----------

    var chairSeatMat = solidMat(0x7a6248);
    var chairLegMat = solidMat(0x3d3d3d);
    var woodMat = solidMat(0x9c7a4f);
    var darkWoodMat = solidMat(0x5c4630);
    var metalMat = solidMat(0x8a8f98);
    var greenMat = solidMat(0x3f7d4e);

    function makeChair(x, z, rotY) {
        var g = new THREE.Group();
        var seat = box(0.55, 0.08, 0.55, chairSeatMat, 0, 0.45, 0);
        var back = box(0.55, 0.6, 0.08, chairSeatMat, 0, 0.78, -0.25); // backrest at local -Z
        g.add(seat, back);
        for (var i = 0; i < 4; i++) {
            var lx = (i % 2 === 0 ? -1 : 1) * 0.22;
            var lz = (i < 2 ? -1 : 1) * 0.22;
            g.add(box(0.06, 0.45, 0.06, chairLegMat, lx, 0.225, lz));
        }
        // person sits with legs toward +Z (opposite the backrest)
        g.rotation.y = rotY;
        g.position.set(x, 0, z);
        return g;
    }

    function makeDesk(x, z, rotY) {
        var g = new THREE.Group();
        g.add(box(1.6, 0.08, 0.8, woodMat, 0, 0.74, 0));
        g.add(box(0.08, 0.74, 0.7, darkWoodMat, -0.7, 0.37, 0));
        g.add(box(0.08, 0.74, 0.7, darkWoodMat, 0.7, 0.37, 0));
        // monitor at back of desk (local -Z)
        g.add(box(0.7, 0.45, 0.06, solidMat(0x222630), 0, 1.05, -0.25));
        g.add(box(0.12, 0.18, 0.12, solidMat(0x333842), 0, 0.85, -0.25));
        g.rotation.y = rotY;
        g.position.set(x, 0, z);
        return g;
    }

    function makeCouch(x, z, rotY) {
        var g = new THREE.Group();
        var couchMat = solidMat(0x6b4f8a);
        g.add(box(2.2, 0.45, 0.9, couchMat, 0, 0.28, 0));          // seat
        g.add(box(2.2, 0.6, 0.25, couchMat, 0, 0.65, -0.45));      // backrest at local -Z
        g.add(box(0.25, 0.35, 0.9, couchMat, -1.05, 0.55, 0));     // arm L
        g.add(box(0.25, 0.35, 0.9, couchMat, 1.05, 0.55, 0));      // arm R
        g.rotation.y = rotY;
        g.position.set(x, 0, z);
        return g;
    }

    function makeArmchair(x, z, rotY) {
        var g = new THREE.Group();
        var mat = solidMat(0x8a5a44);
        g.add(box(0.75, 0.42, 0.7, mat, 0, 0.26, 0));
        g.add(box(0.75, 0.55, 0.2, mat, 0, 0.62, -0.3));
        g.add(box(0.18, 0.3, 0.7, mat, -0.34, 0.5, 0));
        g.add(box(0.18, 0.3, 0.7, mat, 0.34, 0.5, 0));
        g.rotation.y = rotY;
        g.position.set(x, 0, z);
        return g;
    }

    function makeTable(x, z, w, d) {
        var g = new THREE.Group();
        g.add(box(w, 0.07, d, darkWoodMat, 0, 0.72, 0));
        var legCount = (w > 2) ? 4 : 4;
        for (var i = 0; i < legCount; i++) {
            var lx = (i % 2 === 0 ? -1 : 1) * (w / 2 - 0.12);
            var lz = (i < 2 ? -1 : 1) * (d / 2 - 0.12);
            g.add(box(0.08, 0.72, 0.08, darkWoodMat, lx, 0.36, lz));
        }
        g.position.set(x, 0, z);
        return g;
    }

    function makePlant(x, z) {
        var g = new THREE.Group();
        g.add(box(0.4, 0.45, 0.4, solidMat(0x8a5533), 0, 0.225, 0));
        var leaf = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.9, 8), greenMat);
        leaf.position.y = 0.9;
        g.add(leaf);
        g.position.set(x, 0, z);
        return g;
    }

    function makeWaterCooler(x, z) {
        var g = new THREE.Group();
        g.add(box(0.45, 1.1, 0.45, solidMat(0xd8dde5), 0, 0.55, 0));
        var jug = new THREE.Mesh(
            new THREE.CylinderGeometry(0.16, 0.14, 0.35, 10),
            new THREE.MeshLambertMaterial({ color: 0x66aaff, transparent: true, opacity: 0.7 })
        );
        jug.position.y = 1.25;
        g.add(jug);
        g.position.set(x, 0, z);
        return g;
    }

    // ---------- call panel ----------

    function makeArrowTextureOn(colorOn, colorOff) {
        var upGeo = new THREE.ShapeGeometry(
            (function () {
                var s = new THREE.Shape();
                s.moveTo(0, 0.1);
                s.lineTo(-0.13, -0.08);
                s.lineTo(0.13, -0.08);
                s.closePath();
                return s;
            })()
        );
        var matOn = new THREE.MeshBasicMaterial({ color: colorOn, side: THREE.DoubleSide });
        var matOff = new THREE.MeshBasicMaterial({ color: colorOff, side: THREE.DoubleSide });
        return { geo: upGeo, matOn: matOn, matOff: matOff };
    }

    function makeCallPanel() {
        var g = new THREE.Group();
        var plate = box(0.55, 1.4, 0.05, solidMat(0x2c3140), 0, 0, 0);
        g.add(plate);

        var arrows = makeArrowTextureOn(0x33ff66, 0x22262e);
        var upTri = new THREE.Mesh(arrows.geo, arrows.matOff);
        upTri.position.set(0, 0.38, 0.04);
        var downTri = new THREE.Mesh(arrows.geo.clone(), arrows.matOff);
        downTri.rotation.z = Math.PI;
        downTri.position.set(0, -0.12, 0.04);
        g.add(upTri, downTri);

        var tex = makeTextTexture(256);
        updateTextTexture(tex, "0", 200);
        var disp = new THREE.Mesh(
            new THREE.PlaneGeometry(0.45, 0.45),
            new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide })
        );
        disp.position.set(0, -0.48, 0.04);
        g.add(disp);

        g.userData = {
            setUp: function (on) { upTri.material = on ? arrows.matOn : arrows.matOff; },
            setDown: function (on) { downTri.material = on ? arrows.matOn : arrows.matOff; },
            setIndicator: function (text) { updateTextTexture(tex, text, 200); }
        };
        return g;
    }

    // ---------- navigation graph ----------

    function buildGraph() {
        var nodes = {};
        var links = [];
        return {
            nodes: nodes,
            links: links,
            add: function (name, x, z) {
                nodes[name] = new THREE.Vector3(x, 0, z);
                return nodes[name];
            },
            link: function (a, b) {
                links.push([a, b]);
                links.push([b, a]);
            }
        };
    }

    function bfsPath(nodes, links, fromName, toName) {
        var from = nodes[fromName];
        var to = nodes[toName];
        if (!from || !to) return null;
        if (fromName === toName) return [to.clone()];
        var adj = {};
        for (var i = 0; i < links.length; i++) {
            var a = links[i][0], b = links[i][1];
            if (!adj[a]) adj[a] = [];
            adj[a].push(b);
        }
        var prev = {};
        prev[fromName] = null;
        var queue = [fromName];
        while (queue.length) {
            var cur = queue.shift();
            if (cur === toName) break;
            var neigh = adj[cur] || [];
            for (var j = 0; j < neigh.length; j++) {
                var n = neigh[j];
                if (prev[n] === undefined) {
                    prev[n] = cur;
                    queue.push(n);
                }
            }
        }
        if (prev[toName] === undefined) return null;
        var path = [];
        var c = toName;
        while (c !== null) {
            path.push(nodes[c].clone());
            c = prev[c];
        }
        path.reverse();
        return path;
    }

    function bfsPathFor(graph, fromName, toName) {
        return bfsPath(graph.nodes, graph.links, fromName, toName);
    }

    // nearest node name in graph to a world (x,z) position
    function nearestNodeName(graph, x, z) {
        var best = null, bestD = Infinity;
        for (var name in graph.nodes) {
            var n = graph.nodes[name];
            var d = (n.x - x) * (n.x - x) + (n.z - z) * (n.z - z);
            if (d < bestD) { bestD = d; best = name; }
        }
        return best;
    }

    // ---------- per-floor construction ----------

    function makeHallRing(graph) {
        graph.add("hallS", 0, -3.6);
        graph.add("hallSE", 3.0, -3.0);
        graph.add("hallE", 3.8, 0);
        graph.add("hallNE", 3.0, 3.0);
        graph.add("hallN", 0, 3.8);
        graph.add("hallNW", -3.0, 3.0);
        graph.add("hallW", -3.8, 0);
        graph.add("hallSW", -3.0, -3.0);
        graph.add("elevWait", 0, 2.1);
        var ring = ["hallS", "hallSE", "hallE", "hallNE", "hallN", "hallNW", "hallW", "hallSW"];
        for (var i = 0; i < ring.length; i++) {
            graph.link(ring[i], ring[(i + 1) % ring.length]);
        }
        graph.link("elevWait", "hallS");
    }

    var interiorWallMat = semiMat(0xbbc5e6, 0.28);

    function buildOfficeFloor(group, floorNumber) {
        var graph = buildGraph();
        var sitTargets = {};
        var desks = [];
        makeHallRing(graph);

        // floor slabs: 4 strips around shaft
        var slabMat = semiMat(0x8a90a0, 0.3);
        group.add(box(22, 0.15, 7.5, slabMat, 0, -0.075, -5.25));
        group.add(box(22, 0.15, 7.5, slabMat, 0, -0.075, 5.25));
        group.add(box(9.5, 0.15, 3, slabMat, -6.25, -0.075, 0));
        group.add(box(9.5, 0.15, 3, slabMat, 6.25, -0.075, 0));

        // outer walls (front wall solid on office floors)
        var wallMat = semiMat(0x9999ff, 0.2);
        group.add(box(22, 3.4, 0.15, wallMat, 0, 1.7, -9.075));
        group.add(box(0.15, 3.4, 18, wallMat, -11.075, 1.7, 0));
        group.add(box(0.15, 3.4, 18, wallMat, 11.075, 1.7, 0));
        group.add(box(22, 3.4, 0.15, wallMat, 0, 1.7, 9.075));

        // four private offices along the back wall
        var officeCenters = [-8.25, -2.75, 2.75, 8.25];
        var officeLetters = ["A", "B", "C", "D"];
        var officeDoorHalls = ["hallW", "hallS", "hallS", "hallE"];
        for (var i = 0; i < 4; i++) {
            var cx = officeCenters[i];
            var letter = officeLetters[i];
            // side walls
            var leftX = -11 + i * 5.5;
            group.add(box(0.12, 2.6, 5.7, interiorWallMat, leftX + 0.06, 1.3, -6.15));
            // front wall with 1.2 door gap centered at cx
            var gapL = cx - 0.6, gapR = cx + 0.6;
            var segStart = leftX, segEnd = leftX + 5.5;
            if (gapL > segStart + 0.1) {
                var w1 = gapL - segStart;
                group.add(box(w1, 2.6, 0.12, interiorWallMat, segStart + w1 / 2, 1.3, -3.3));
            }
            if (segEnd > gapR + 0.1) {
                var w2 = segEnd - gapR;
                group.add(box(w2, 2.6, 0.12, interiorWallMat, gapR + w2 / 2, 1.3, -3.3));
            }
            // desk + monitor + chair
            var desk = makeDesk(cx, -6.9, 0); // monitor at local -Z (back), user faces -Z
            group.add(desk);
            desks.push({ name: "office" + letter + "_desk", x: cx, z: -5.6 });
            var chair = makeChair(cx, -5.6, Math.PI); // seat opens +Z, person faces -Z (PI)
            group.add(chair);

            var doorName = "office" + letter + "_door";
            var deskName = "office" + letter + "_desk";
            graph.add(doorName, cx, -3.7);
            graph.add(deskName, cx, -5.6);
            graph.link(doorName, officeDoorHalls[i]);
            graph.link(doorName, deskName);
            sitTargets[deskName] = { sit: true, facing: Math.PI };
        }

        // conference room (front-left)
        group.add(box(0.12, 2.6, 5.7, interiorWallMat, -3.36, 1.3, 6.15)); // east wall
        // door gap at z 5.7..6.9 on that wall
        // (rebuilt with gap)
        group.children.pop();
        group.add(box(0.12, 2.6, 2.4, interiorWallMat, -3.36, 1.3, 4.2));
        group.add(box(0.12, 2.6, 2.4, interiorWallMat, -3.36, 1.3, 8.0));
        group.add(box(7.7, 2.6, 0.12, interiorWallMat, -7.15, 1.3, 3.36)); // south wall
        group.add(makeTable(-7, 6.2, 3.2, 1.2));
        var confSeats = [
            { n: "conf_seat0", x: -8.3, z: 5.1, f: 0 },
            { n: "conf_seat1", x: -8.3, z: 7.3, f: Math.PI },
            { n: "conf_seat2", x: -5.7, z: 5.1, f: 0 },
            { n: "conf_seat3", x: -5.7, z: 7.3, f: Math.PI }
        ];
        confSeats.forEach(function (s) {
            group.add(makeChair(s.x, s.z, s.f));
            graph.add(s.n, s.x, s.z);
            sitTargets[s.n] = { sit: true, facing: s.f };
        });
        graph.add("conf_door", -3.7, 6.3);
        graph.add("conf_center", -7, 6.2);
        graph.link("conf_door", "hallSW");
        graph.link("conf_door", "conf_center");
        confSeats.forEach(function (s) { graph.link("conf_center", s.n); });

        // lounge (front-right)
        group.add(box(0.12, 2.6, 2.4, interiorWallMat, 3.36, 1.3, 4.2));   // west wall, door gap 5.7..6.9
        group.add(box(0.12, 2.6, 2.4, interiorWallMat, 3.36, 1.3, 8.0));
        group.add(box(7.7, 2.6, 0.12, interiorWallMat, 7.15, 1.3, 3.36)); // south wall
        group.add(makeCouch(8.5, 8.1, Math.PI));     // couch faces -Z (toward table)
        group.add(makeTable(7.5, 6.2, 1.6, 1.0));
        group.add(makeArmchair(5.2, 5.6, Math.PI / 2));
        group.add(makeArmchair(9.8, 6.8, -Math.PI / 2));
        group.add(makeWaterCooler(10.2, 8.3));
        group.add(makePlant(4.2, 8.2));
        for (var s = 0; s < 3; s++) {
            graph.add("lounge_spot" + s, 7.6 + s * 0.9, 7.8);
            sitTargets["lounge_spot" + s] = { sit: true, facing: Math.PI };
        }
        graph.add("lounge_door", 3.7, 6.3);
        graph.add("lounge_center", 7.5, 5.0);
        graph.add("water_cooler", 9.4, 8.4);
        graph.link("lounge_door", "hallSE");
        graph.link("lounge_door", "lounge_center");
        for (var s2 = 0; s2 < 3; s2++) graph.link("lounge_center", "lounge_spot" + s2);
        graph.link("lounge_center", "water_cooler");

        // hallway loiter spots
        graph.add("hall_stand_N", 0, 6.2);
        graph.add("hall_stand_S", 0, -6.2);
        graph.link("hall_stand_N", "hallN");
        graph.link("hall_stand_S", "hallS");

        // call panel next to shaft, facing +Z
        var panel = makeCallPanel();
        panel.position.set(1.85, 1.4, 1.62);
        group.add(panel);
        // shaft indicator above the doors
        var shaftTex = makeTextTexture(256);
        updateTextTexture(shaftTex, "0", 200);
        var shaftInd = new THREE.Mesh(
            new THREE.PlaneGeometry(0.9, 0.9),
            new THREE.MeshBasicMaterial({ map: shaftTex, side: THREE.DoubleSide })
        );
        shaftInd.position.set(0, 2.7, 1.62);
        group.add(shaftInd);

        return {
            floorNumber: floorNumber,
            graph: graph,
            callPanel: panel,
            shaftIndicator: shaftTex,
            desks: desks,
            sitTargets: sitTargets
        };
    }

    function buildLobby(group) {
        var graph = buildGraph();
        var sitTargets = {};
        var desks = [];
        makeHallRing(graph);

        // solid ground slab
        group.add(box(22, 0.2, 18, solidMat(0x7d8290), 0, -0.1, 0));
        // sidewalk outside front wall
        var sidewalk = box(22, 0.15, 5, solidMat(0x9aa0a6), 0, -0.12, 11.5);
        group.add(sidewalk);

        // outer walls: back + sides full; front split with 3-unit gap centered x=0
        var wallMat = semiMat(0x9999ff, 0.2);
        group.add(box(22, 3.4, 0.15, wallMat, 0, 1.7, -9.075));
        group.add(box(0.15, 3.4, 18, wallMat, -11.075, 1.7, 0));
        group.add(box(0.15, 3.4, 18, wallMat, 11.075, 1.7, 0));
        group.add(box(9.5, 3.4, 0.15, wallMat, -6.25, 1.7, 9.075)); // front-left
        group.add(box(9.5, 3.4, 0.15, wallMat, 6.25, 1.7, 9.075));  // front-right

        // glass entrance doors (visual only, open position - slid to sides)
        var glassMat = semiMat(0xaaddff, 0.25);
        group.add(box(1.3, 2.8, 0.08, glassMat, -2.2, 1.4, 9.05));
        group.add(box(1.3, 2.8, 0.08, glassMat, 2.2, 1.4, 9.05));

        // entrance chain
        graph.add("outside", 0, 12);
        graph.add("front_door_threshold", 0, 9.35);
        graph.add("entrance", 0, 7.4);
        graph.add("lobby_center", 0, 4.6);
        graph.link("outside", "front_door_threshold");
        graph.link("front_door_threshold", "entrance");
        graph.link("entrance", "lobby_center");
        graph.link("entrance", "elevWait");
        graph.link("lobby_center", "elevWait");
        graph.link("lobby_center", "hallN");

        // entrance loiter spots
        var lobbyStands = [
            { n: "lobby_stand_center", x: 0, z: 5.6 },
            { n: "lobby_stand_NE", x: 4.5, z: 7.5 },
            { n: "lobby_stand_NW", x: -4.5, z: 7.5 },
            { n: "lobby_stand_midE", x: 6.5, z: 2.0 },
            { n: "lobby_stand_midW", x: -6.5, z: 2.0 },
            { n: "lobby_stand_entry", x: 1.5, z: 8.2 }
        ];
        lobbyStands.forEach(function (s) {
            graph.add(s.n, s.x, s.z);
            sitTargets[s.n] = { sit: false, facing: 0 };
        });
        graph.link("lobby_stand_center", "lobby_center");
        graph.link("lobby_stand_NE", "entrance");
        graph.link("lobby_stand_NW", "entrance");
        graph.link("lobby_stand_midE", "hallE");
        graph.link("lobby_stand_midW", "hallW");
        graph.link("lobby_stand_entry", "front_door_threshold");

        // cafe: counter on left wall
        group.add(box(0.7, 1.0, 4.5, solidMat(0x77685a), -10.3, 0.5, 4.0));
        group.add(box(0.9, 0.1, 4.7, darkWoodMat, -10.25, 1.05, 4.0)); // countertop
        group.add(box(0.5, 0.5, 0.5, solidMat(0x333842), -10.2, 1.35, 3.0)); // coffee machine
        group.add(box(0.5, 0.4, 1.2, solidMat(0xc7b299), -10.2, 1.3, 4.8)); // pastry display
        graph.add("cafe_order", -8.6, 4.0);
        graph.link("cafe_order", "hallW");
        // bistro tables (4) with 2 chairs each
        var bistro = [
            { x: -7.5, z: 2.6 }, { x: -4.8, z: 2.2 },
            { x: -7.8, z: 6.8 }, { x: -4.9, z: 7.2 }
        ];
        bistro.forEach(function (t, ti) {
            group.add(makeTable(t.x, t.z, 1.1, 1.1));
            for (var ci = 0; ci < 2; ci++) {
                var cx = t.x + (ci === 0 ? -0.85 : 0.85);
                var cz = t.z;
                var rotY = ci === 0 ? Math.PI / 2 : -Math.PI / 2; // face the table
                group.add(makeChair(cx, cz, rotY));
                var name = "cafe_bistro" + (ti * 2 + ci);
                graph.add(name, cx, cz);
                sitTargets[name] = { sit: true, facing: rotY };
                graph.link(name, "cafe_order");
            }
        });
        graph.add("cafe_door", -9.0, 1.2);
        graph.link("cafe_door", "hallW");
        graph.link("cafe_door", "cafe_order");

        // front lounge (right side)
        group.add(makeCouch(8.6, 8.1, Math.PI));
        group.add(makeTable(7.6, 6.0, 1.6, 1.0));
        group.add(makeArmchair(5.0, 5.4, Math.PI / 2));
        group.add(makeArmchair(10.0, 6.6, -Math.PI / 2));
        group.add(makePlant(2.2, 8.4));
        for (var fl = 0; fl < 3; fl++) {
            graph.add("front_lounge" + fl, 7.7 + fl * 0.9, 7.8);
            sitTargets["front_lounge" + fl] = { sit: true, facing: Math.PI };
        }
        graph.link("front_lounge0", "hallNE");
        graph.link("front_lounge1", "front_lounge0");
        graph.link("front_lounge2", "front_lounge1");

        // back lounge (two couches facing each other)
        group.add(makeCouch(6.5, -7.6, 0));       // faces +Z
        group.add(makeCouch(6.5, -4.6, Math.PI)); // faces -Z
        group.add(makeTable(6.5, -6.1, 1.5, 1.0));
        graph.add("back_lounge_N", 6.5, -7.3);
        graph.add("back_lounge_S", 6.5, -4.9);
        sitTargets["back_lounge_N"] = { sit: true, facing: 0 };
        sitTargets["back_lounge_S"] = { sit: true, facing: Math.PI };
        graph.link("back_lounge_N", "hallS");
        graph.link("back_lounge_N", "back_lounge_S");

        // conversation pit (back-left)
        var pitTable = makeTable(-7, -6, 1.6, 1.6);
        group.add(pitTable);
        var pit = [
            { n: "pit_N", x: -7, z: -7.6, f: 0 },
            { n: "pit_S", x: -7, z: -4.4, f: Math.PI },
            { n: "pit_E", x: -5.4, z: -6, f: -Math.PI / 2 },
            { n: "pit_W", x: -8.6, z: -6, f: Math.PI / 2 }
        ];
        pit.forEach(function (p) {
            group.add(makeArmchair(p.x, p.z, p.f));
            graph.add(p.n, p.x, p.z);
            sitTargets[p.n] = { sit: true, facing: p.f };
        });
        graph.add("pit_center", -7, -6);
        graph.link("pit_center", "hallNW");
        pit.forEach(function (p) { graph.link("pit_center", p.n); });

        // water coolers
        group.add(makeWaterCooler(10.4, 2.4));
        group.add(makeWaterCooler(-10.4, -2.4));
        graph.add("lobby_wc_front", 9.7, 2.4);
        graph.add("lobby_wc_back", -9.7, -2.4);
        sitTargets["lobby_wc_front"] = { sit: false, facing: 0 };
        sitTargets["lobby_wc_back"] = { sit: false, facing: 0 };
        graph.link("lobby_wc_front", "hallE");
        graph.link("lobby_wc_back", "hallW");

        // reception desk (off to the side, not blocking entrance->elevator)
        group.add(box(2.2, 1.0, 0.8, solidMat(0x77685a), -3.0, 0.5, 6.0));
        group.add(box(2.4, 0.1, 1.0, darkWoodMat, -3.0, 1.05, 6.0));
        graph.add("reception", -3.0, 7.2);
        sitTargets["reception"] = { sit: false, facing: Math.PI };
        graph.link("reception", "hallNW");
        graph.link("reception", "entrance");

        // info kiosk near entrance
        group.add(box(0.6, 1.3, 0.6, solidMat(0x44506a), 1.8, 0.65, 8.0));
        graph.add("kiosk", 0.8, 8.4);
        sitTargets["kiosk"] = { sit: false, facing: 0 };
        graph.link("kiosk", "entrance");

        // plants by the entrance
        group.add(makePlant(-2.0, 8.4));
        group.add(makePlant(2.4, 8.4));

        // call panel + shaft indicator (same as other floors)
        var panel = makeCallPanel();
        panel.position.set(1.85, 1.4, 1.62);
        group.add(panel);
        var shaftTex = makeTextTexture(256);
        updateTextTexture(shaftTex, "0", 200);
        var shaftInd = new THREE.Mesh(
            new THREE.PlaneGeometry(0.9, 0.9),
            new THREE.MeshBasicMaterial({ map: shaftTex, side: THREE.DoubleSide })
        );
        shaftInd.position.set(0, 2.7, 1.62);
        group.add(shaftInd);

        return {
            floorNumber: 0,
            graph: graph,
            callPanel: panel,
            shaftIndicator: shaftTex,
            desks: desks,
            sitTargets: sitTargets,
            entranceSpot: graph.nodes["entrance"].clone(),
            cafeSpots: ["cafe_bistro0", "cafe_bistro1", "cafe_bistro2", "cafe_bistro3",
                "cafe_bistro4", "cafe_bistro5", "cafe_bistro6", "cafe_bistro7"]
        };
    }

    function createWorld(scene) {
        var buildingGroup = new THREE.Group();
        var floors = [];

        // ground + roof (solid)
        var solidGray = solidMat(0x6a7080);
        var ground = box(30, 0.3, 30, solidGray, 0, -0.25, 2);
        buildingGroup.add(ground);
        var roof = box(22.4, 0.3, 18.4, solidGray, 0, WORLD.FLOOR_COUNT * WORLD.FLOOR_HEIGHT + 0.15, 0);
        buildingGroup.add(roof);

        // shaft column outline (thin semi-transparent walls so the hole reads)
        var shaftMat = semiMat(0x555c70, 0.18);
        var shaftH = WORLD.FLOOR_COUNT * WORLD.FLOOR_HEIGHT;
        buildingGroup.add(box(3.1, shaftH, 0.1, shaftMat, 0, shaftH / 2, -1.52));
        buildingGroup.add(box(3.1, shaftH, 0.1, shaftMat, 0, shaftH / 2, 1.52));
        buildingGroup.add(box(0.1, shaftH, 3.04, shaftMat, -1.52, shaftH / 2, 0));
        buildingGroup.add(box(0.1, shaftH, 3.04, shaftMat, 1.52, shaftH / 2, 0));

        for (var f = 0; f < WORLD.FLOOR_COUNT; f++) {
            var fg = new THREE.Group();
            fg.position.y = f * WORLD.FLOOR_HEIGHT;
            var data;
            if (f === 0) {
                data = buildLobby(fg);
            } else {
                data = buildOfficeFloor(fg, f);
            }
            buildingGroup.add(fg);
            floors.push(data);
        }

        // front wall header for floors 1..5 (above the entrance gap)
        var wallMat = semiMat(0x9999ff, 0.2);
        buildingGroup.add(box(22, WORLD.FLOOR_HEIGHT * 5, 0.15, wallMat,
            0, WORLD.FLOOR_HEIGHT + (WORLD.FLOOR_HEIGHT * 5) / 2, 9.075));

        buildingGroup.traverse(function (obj) {
            if (obj.isMesh) obj.renderOrder = 0;
        });
        scene.add(buildingGroup);

        return {
            buildingGroup: buildingGroup,
            floors: floors,
            bfsPath: function (floorData, fromName, toName) {
                return bfsPathFor(floorData.graph, fromName, toName);
            },
            nearestNodeName: function (floorData, x, z) {
                return nearestNodeName(floorData.graph, x, z);
            }
        };
    }

    window.WORLD = WORLD;
    window.createWorld = createWorld;
    window.bfsPath = function (floorData, from, to) {
        return bfsPathFor(floorData.graph, from, to);
    };
    window.updateTextTexture = updateTextTexture;
    window.nearestNodeName = function (floorData, x, z) {
        return nearestNodeName(floorData.graph, x, z);
    };
})();
