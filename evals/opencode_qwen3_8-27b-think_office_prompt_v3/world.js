/*
 * world.js - building geometry, per-floor layouts, furniture, navigation
 * graph and elevator call panels.
 *
 * Classic script: no import/export. Builds into a THREE.Group added to
 * the scene by createWorld(scene) and returns:
 *   { buildingGroup, floors: [ {floorNumber, nodes, callPanel, shaftIndicator,
 *     desks, sitTargets, ...} ], bfsPath }
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

    var HALF_W = WORLD.BUILDING_WIDTH / 2;     // 11
    var HALF_D = WORLD.BUILDING_DEPTH / 2;     // 9
    var FH = WORLD.FLOOR_HEIGHT;               // 3.4
    var SH = 1.2;                              // wall height

    // ------------------------------------------------------------------
    // Materials
    // ------------------------------------------------------------------
    var matSlabOpaque = new THREE.MeshLambertMaterial({ color: 0x84898f });
    var matSlabLobby = new THREE.MeshLambertMaterial({ color: 0x767b82 });
    var matRoof = new THREE.MeshLambertMaterial({ color: 0x6f747a });
    var matFloor = new THREE.MeshLambertMaterial({
        color: 0x8a9099, transparent: true, opacity: 0.3,
        depthWrite: false, side: THREE.DoubleSide
    });
    var matWallOuter = new THREE.MeshLambertMaterial({
        color: 0x9999ff, transparent: true, opacity: 0.2,
        depthWrite: false, side: THREE.DoubleSide
    });
    var matWallInner = new THREE.MeshLambertMaterial({
        color: 0xbbc5e6, transparent: true, opacity: 0.28,
        depthWrite: false, side: THREE.DoubleSide
    });
    var matGlass = new THREE.MeshLambertMaterial({
        color: 0xbfe3ff, transparent: true, opacity: 0.3,
        depthWrite: false, side: THREE.DoubleSide
    });
    var matDesk = new THREE.MeshLambertMaterial({ color: 0x8a6b46 });
    var matDeskTop = new THREE.MeshLambertMaterial({ color: 0xa8895f });
    var matChair = new THREE.MeshLambertMaterial({ color: 0x44506b });
    var matChairSeat = new THREE.MeshLambertMaterial({ color: 0x525f7d });
    var matCouch = new THREE.MeshLambertMaterial({ color: 0x7d4f5b });
    var matTable = new THREE.MeshLambertMaterial({ color: 0x6b573f });
    var matMonitor = new THREE.MeshLambertMaterial({ color: 0x111418 });
    var matMachine = new THREE.MeshLambertMaterial({ color: 0x3a3f46 });
    var matPot = new THREE.MeshLambertMaterial({ color: 0x7a4a2f });
    var matLeaf = new THREE.MeshLambertMaterial({ color: 0x3f7a3f });
    var matCooler = new THREE.MeshLambertMaterial({ color: 0xd8dde2 });
    var matPanel = new THREE.MeshLambertMaterial({ color: 0x2a2e38 });
    var matPanelButtonOff = new THREE.MeshLambertMaterial({ color: 0x3a3f47 });
    var matPanelButtonOn = new THREE.MeshLambertMaterial({ color: 0x22ff66, emissive: 0x11cc44 });
    var matSidewalk = new THREE.MeshLambertMaterial({ color: 0x9a9a90 });

    function addBox(parent, w, h, d, x, y, z, mat) {
        var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        m.position.set(x, y, z);
        m.renderOrder = 0;
        parent.add(m);
        return m;
    }

    // ------------------------------------------------------------------
    // Text textures (cached by last-rendered text)
    // ------------------------------------------------------------------
    function updateTextTexture(ctx, tex, text) {
        if (tex._lastText === text) return;
        var size = 256;
        var c = ctx.canvas;
        ctx.fillStyle = "#050505";
        ctx.fillRect(0, 0, size, size);
        ctx.fillStyle = "#ffbb22";
        ctx.font = "bold 150px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.shadowColor = "#ff8800";
        ctx.shadowBlur = 26;
        ctx.fillText(String(text), size / 2, size / 2 + 8);
        ctx.shadowBlur = 0;
        tex.needsUpdate = true;
        tex._lastText = text;
    }

    function makeTextPlane(width, height) {
        var canvas = document.createElement("canvas");
        canvas.width = 256;
        canvas.height = 256;
        var ctx = canvas.getContext("2d");
        var tex = new THREE.CanvasTexture(canvas);
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.generateMipmaps = true;
        tex.anisotropy = 4;
        var mesh = new THREE.Mesh(
            new THREE.PlaneGeometry(width, height),
            new THREE.MeshBasicMaterial({ map: tex, transparent: true })
        );
        return { mesh: mesh, ctx: ctx, tex: tex };
    }

    // ------------------------------------------------------------------
    // Call panel: chunky plate, up/down arrow lamps, canvas floor display
    // ------------------------------------------------------------------
    function makeArrow(halfWidth, up) {
        var s = new THREE.Shape();
        if (up) {
            s.moveTo(0, 0.10);
            s.lineTo(halfWidth, -0.09);
            s.lineTo(-halfWidth, -0.09);
        } else {
            s.moveTo(0, -0.10);
            s.lineTo(halfWidth, 0.09);
            s.lineTo(-halfWidth, 0.09);
        }
        s.closePath();
        var geo = new THREE.ShapeGeometry(s);
        var mesh = new THREE.Mesh(geo, matPanelButtonOff.clone());
        mesh.userData.offMat = matPanelButtonOff;
        mesh.userData.onMat = matPanelButtonOn;
        return mesh;
    }

    function makeCallPanel(floorNumber) {
        var group = new THREE.Group();
        var plate = addBox(group, 0.55, 1.4, 0.05, 0, 0, 0, matPanel);
        plate.renderOrder = 0;

        var upArrow = makeArrow(0.13, true);
        upArrow.position.set(0, 0.42, 0.03);
        group.add(upArrow);
        var downArrow = makeArrow(0.13, false);
        downArrow.position.set(0, 0.12, 0.03);
        group.add(downArrow);

        var display = makeTextPlane(0.45, 0.45);
        display.mesh.position.set(0, -0.38, 0.03);
        group.add(display.mesh);

        group.userData = {
            setUp: function (on) { upArrow.material = on ? upArrow.userData.onMat : upArrow.userData.offMat; },
            setDown: function (on) { downArrow.material = on ? downArrow.userData.onMat : downArrow.userData.offMat; },
            setIndicator: function (text) { updateTextTexture(display.ctx, display.tex, text); }
        };
        return group;
    }

    function makeShaftIndicator() {
        var display = makeTextPlane(0.9, 0.9);
        var plate = new THREE.Group();
        var back = addBox(plate, 1.05, 1.05, 0.06, 0, 0, -0.02, matPanel);
        back.renderOrder = 0;
        display.mesh.position.set(0, 0, 0.015);
        plate.add(display.mesh);
        plate.userData = { setIndicator: function (text) { updateTextTexture(display.ctx, display.tex, text); } };
        return plate;
    }

    // ------------------------------------------------------------------
    // Furniture helpers
    // ------------------------------------------------------------------
    function makeChair(parent, x, y, z, rotY) {
        var g = new THREE.Group();
        addBox(g, 0.46, 0.09, 0.46, 0, 0.42, 0, matChairSeat);        // seat (seat top ~0.46)
        addBox(g, 0.46, 0.5, 0.08, 0, 0.7, 0.21, matChair);           // backrest (+Z side)
        addBox(g, 0.4, 0.4, 0.06, 0, 0.22, 0, matChair);              // pedestal
        g.position.set(x, y, z);
        g.rotation.y = rotY;
        parent.add(g);
        return g;
    }

    function makeDesk(parent, x, y, z, rotY) {
        var g = new THREE.Group();
        addBox(g, 1.9, 0.07, 0.95, 0, 0.74, 0, matDeskTop);
        addBox(g, 1.8, 0.68, 0.1, -0.85, 0.37, -0.35, matDesk);
        addBox(g, 1.8, 0.68, 0.1, 0.85, 0.37, -0.35, matDesk);
        addBox(g, 1.8, 0.68, 0.1, -0.85, 0.37, 0.35, matDesk);
        addBox(g, 1.8, 0.68, 0.1, 0.85, 0.37, 0.35, matDesk);
        // Monitor at the BACK of the desk (local -Z after rotation).
        var mon = addBox(g, 0.55, 0.36, 0.05, 0, 1.0, -0.28, matMonitor);
        mon.material = new THREE.MeshLambertMaterial({ color: 0x182430, emissive: 0x0a1622 });
        addBox(g, 0.12, 0.14, 0.12, 0, 0.82, -0.28, matMachine);
        g.position.set(x, y, z);
        g.rotation.y = rotY;
        parent.add(g);
        return g;
    }

    function makeCouch(parent, x, y, z, rotY, color) {
        var g = new THREE.Group();
        var cm = color === undefined ? matCouch : new THREE.MeshLambertMaterial({ color: color });
        addBox(g, 2.1, 0.4, 0.85, 0, 0.22, 0, cm);          // seat base
        addBox(g, 2.1, 0.5, 0.22, 0, 0.62, 0.32, cm);       // backrest (+Z side)
        addBox(g, 0.22, 0.3, 0.85, -0.95, 0.5, 0, cm);      // arms
        addBox(g, 0.22, 0.3, 0.85, 0.95, 0.5, 0, cm);
        g.position.set(x, y, z);
        g.rotation.y = rotY;
        parent.add(g);
        return g;
    }

    function makeArmchair(parent, x, y, z, rotY, color) {
        var g = new THREE.Group();
        var cm = color === undefined ? matCouch : new THREE.MeshLambertMaterial({ color: color });
        addBox(g, 0.75, 0.4, 0.72, 0, 0.22, 0, cm);
        addBox(g, 0.75, 0.5, 0.2, 0, 0.6, 0.27, cm);
        addBox(g, 0.16, 0.26, 0.72, -0.32, 0.48, 0, cm);
        addBox(g, 0.16, 0.26, 0.72, 0.32, 0.48, 0, cm);
        g.position.set(x, y, z);
        g.rotation.y = rotY;
        parent.add(g);
        return g;
    }

    function makeCoffeeTable(parent, x, y, z) {
        var g = new THREE.Group();
        addBox(g, 1.1, 0.06, 0.6, 0, 0.4, 0, matTable);
        addBox(g, 0.9, 0.38, 0.45, 0, 0.19, 0, matTable);
        g.position.set(x, y, z);
        parent.add(g);
        return g;
    }

    function makeRoundTable(parent, x, y, z, radius) {
        var g = new THREE.Group();
        var top = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.06, 14), matTable);
        top.position.y = 0.42;
        g.add(top);
        var leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.4, 8), matTable);
        leg.position.y = 0.2;
        g.add(leg);
        g.position.set(x, y, z);
        parent.add(g);
        return g;
    }

    function makePlant(parent, x, y, z) {
        var g = new THREE.Group();
        addBox(g, 0.4, 0.35, 0.4, 0, 0.18, 0, matPot);
        var foliage = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.9, 8), matLeaf);
        foliage.position.y = 0.85;
        g.add(foliage);
        g.position.set(x, y, z);
        parent.add(g);
        return g;
    }

    function makeWaterCooler(parent, x, y, z) {
        var g = new THREE.Group();
        addBox(g, 0.34, 1.1, 0.34, 0, 0.55, 0, matCooler);
        var bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.34, 10),
            new THREE.MeshLambertMaterial({ color: 0x66aaff, transparent: true, opacity: 0.7, depthWrite: false }));
        bottle.position.y = 1.26;
        g.add(bottle);
        g.position.set(x, y, z);
        parent.add(g);
        return g;
    }

    function makeBistroTable(parent, x, y, z) {
        var g = new THREE.Group();
        var top = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.05, 12), matTable);
        top.position.y = 0.58;
        g.add(top);
        var leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.09, 0.56, 8), matTable);
        leg.position.y = 0.28;
        g.add(leg);
        g.position.set(x, y, z);
        parent.add(g);
        return g;
    }

    // ------------------------------------------------------------------
    // Navigation graph
    // ------------------------------------------------------------------
    function bfsPath(nodes, fromName, toName) {
        if (!nodes[fromName] || !nodes[toName]) return [];
        if (fromName === toName) return [nodes[fromName].clone()];
        var prev = {};
        var visited = {};
        var queue = [fromName];
        visited[fromName] = true;
        prev[fromName] = null;
        var found = false;
        while (queue.length > 0 && !found) {
            var current = queue.shift();
            var links = nodes[current].links || [];
            for (var i = 0; i < links.length; i++) {
                var nb = links[i];
                if (visited[nb]) continue;
                visited[nb] = true;
                prev[nb] = current;
                if (nb === toName) { found = true; break; }
                queue.push(nb);
            }
        }
        if (!found) return [];
        var out = [];
        var cursor = toName;
        while (cursor !== null) {
            out.push(nodes[cursor].clone());
            cursor = prev[cursor];
        }
        out.reverse();
        return out;
    }

    function makeGraph() {
        var nodes = {};
        function add(name, x, z) {
            nodes[name] = new THREE.Vector3(x, 0, z);
            nodes[name].links = [];
            return name;
        }
        function link(a, b) {
            if (nodes[a].links.indexOf(b) < 0) nodes[a].links.push(b);
            if (nodes[b].links.indexOf(a) < 0) nodes[b].links.push(a);
        }
        return { nodes: nodes, add: add, link: link };
    }

    // Hallway ring around the 3x3 shaft (shared by every floor).
    function addHallRing(graph) {
        // Waiting spot just in front of the +Z doors, inside the hall (shaft is z < 1.5).
        graph.add("elevWait", 0, 1.95);
        graph.add("hallN", 0, -2.3);
        graph.add("hallNE", 1.6, -1.6);
        graph.add("hallE", 2.3, 0);
        graph.add("hallSE", 1.6, 1.6);
        graph.add("hallS", 0, 2.3);
        graph.add("hallSW", -1.6, 1.6);
        graph.add("hallW", -2.3, 0);
        graph.add("hallNW", -1.6, -1.6);
        var ring = ["hallN", "hallNE", "hallE", "hallSE", "hallS", "hallSW", "hallW", "hallNW"];
        for (var i = 0; i < ring.length; i++) {
            graph.link(ring[i], ring[(i + 1) % ring.length]);
        }
        graph.link("elevWait", "hallS");
    }

    // Office floors: offices A-D, conference, lounge.
    var OFFICE_X = [-8.25, -2.75, 2.75, 8.25];
    var OFFICE_LETTERS = ["A", "B", "C", "D"];

    function buildOfficeFloor(parent, floorNumber) {
        var y = floorNumber * FH;
        var floorGroup = new THREE.Group();
        parent.add(floorGroup);

        var graph = makeGraph();
        addHallRing(graph);
        var sitTargets = {};
        var desks = {};

        // ---- four private offices along the back wall (z: -9 .. -3) ----
        for (var i = 0; i < 4; i++) {
            var cx = OFFICE_X[i];
            var letter = OFFICE_LETTERS[i];
            var x0 = cx - 2.75;
            var x1 = cx + 2.75;

            // east divider wall (between this office and the next)
            if (i < 3) {
                addBox(floorGroup, 0.1, 2.7, 6, x1, y + 1.35, -6, matWallInner);
            }
            // south wall with a 1.2-wide doorway centered on cx
            var segHalf = (2.75 - 0.6) / 2;
            addBox(floorGroup, 2.75 - 1.2, 2.7, 0.1, cx - 0.6 - segHalf - 0.0, y + 1.35, -3, matWallInner);
            addBox(floorGroup, 2.75 - 1.2, 2.7, 0.1, cx + 0.6 + segHalf + 0.0, y + 1.35, -3, matWallInner);

            // desk faces the back wall (rotY = PI => monitor on local -Z points -Z... see below)
            // The person sits facing -Z (toward the monitor), so the desk group
            // keeps its monitor on local -Z: no rotation needed (rotY = 0).
            var desk = makeDesk(floorGroup, cx, y, -7.4, 0);
            // Person sits facing -Z (toward the monitor) => chair backrest goes on +Z.
            var chair = makeChair(floorGroup, cx, y, -6.1, 0);
            desks["office" + letter + "_desk"] = { desk: desk, chair: chair, floor: floorNumber, wpName: "office" + letter + "_desk" };

            var doorName = "office" + letter + "_door";
            graph.add(doorName, cx, -2.5);
            graph.add("office" + letter + "_mid", cx, -4.6);
            graph.add("office" + letter + "_desk", cx, -6.1);
            graph.link(doorName, "office" + letter + "_mid");
            graph.link("office" + letter + "_mid", "office" + letter + "_desk");
            // door connects to nearest hallway corner
            var corner = (i === 0) ? "hallNW" : (i === 1 ? "hallN" : (i === 2 ? "hallN" : "hallNE"));
            graph.link(doorName, corner);
            // desk chair faces -Z (toward monitor): legs point -Z, away from backrest (+Z).
            sitTargets["office" + letter + "_desk"] = { sit: true, x: cx, z: -6.1, facing: Math.PI };
        }

        // ---- conference room (front-left): x -11..-3, z 3..9 ----
        // south wall z=3 with a 1.2-wide door gap centered at x=-9.5:
        //   left segment [-11, -10.1], right segment [-8.9, -3]
        addBox(floorGroup, 0.9, 2.7, 0.1, -10.55, y + 1.35, 3, matWallInner);
        addBox(floorGroup, 5.9, 2.7, 0.1, -5.95, y + 1.35, 3, matWallInner);
        // east wall of the room: x=-3, z 3..9, solid
        addBox(floorGroup, 0.1, 2.7, 6, -3, y + 1.35, 6, matWallInner);

        // long table with four chairs, two per long side facing each other.
        // South row (z 5.05) faces +Z => chair backs on -Z (rotY PI);
        // north row (z 6.95) faces -Z => chair backs on +Z (rotY 0).
        makeCoffeeTableLong(floorGroup, -7, y, 6);
        makeChair(floorGroup, -8.2, y, 5.05, Math.PI);
        makeChair(floorGroup, -5.8, y, 5.05, Math.PI);
        makeChair(floorGroup, -8.2, y, 6.95, 0);
        makeChair(floorGroup, -5.8, y, 6.95, 0);
        graph.add("conf_door", -9.5, 3.55);
        graph.add("conf_center", -7, 4.4);
        graph.add("conf_seat0", -8.2, 5.05);
        graph.add("conf_seat1", -5.8, 5.05);
        graph.add("conf_seat2", -8.2, 6.95);
        graph.add("conf_seat3", -5.8, 6.95);
        graph.link("conf_door", "hallSW");
        graph.link("conf_door", "conf_center");
        graph.link("conf_center", "conf_seat0");
        graph.link("conf_center", "conf_seat1");
        graph.link("conf_center", "conf_seat2");
        graph.link("conf_center", "conf_seat3");
        sitTargets["conf_seat0"] = { sit: true, x: -8.2, z: 5.05, facing: 0 };
        sitTargets["conf_seat1"] = { sit: true, x: -5.8, z: 5.05, facing: 0 };
        sitTargets["conf_seat2"] = { sit: true, x: -8.2, z: 6.95, facing: Math.PI };
        sitTargets["conf_seat3"] = { sit: true, x: -5.8, z: 6.95, facing: Math.PI };

        // ---- lounge (front-right): x 3..11, z 3..9 ----
        addBox(floorGroup, 0.1, 2.7, 6, 3, y + 1.35, 6, matWallInner);          // west wall
        // south wall z=3, 1.2-wide door gap centered x=9.5: left [3, 8.9], right [10.1, 11]
        addBox(floorGroup, 5.9, 2.7, 0.1, 5.95, y + 1.35, 3, matWallInner);
        addBox(floorGroup, 0.9, 2.7, 0.1, 10.55, y + 1.35, 3, matWallInner);

        // Couch against the east wall: backrest on +X, seat faces -X (into room).
        makeCouch(floorGroup, 10.1, y, 6, Math.PI / 2);
        makeCoffeeTable(floorGroup, 8.0, y, 6);
        // Armchairs face +X (toward the coffee table): backrest on -X.
        makeArmchair(floorGroup, 6.7, y, 4.7, -Math.PI / 2);
        makeArmchair(floorGroup, 6.7, y, 7.3, -Math.PI / 2);
        makeWaterCooler(floorGroup, 10.5, y, 8.3);
        makePlant(floorGroup, 4.0, y, 8.3);

        graph.add("lounge_door", 9.5, 3.55);
        graph.add("lounge_center", 8.4, 6.2);
        graph.add("lounge_spot0", 9.9, 5.3);
        graph.add("lounge_spot1", 9.9, 6.7);
        graph.add("lounge_spot2", 6.8, 4.7);
        graph.add("water_cooler", 9.6, 8.3);
        graph.add("hall_stand_N", 4.8, -2.5);
        graph.add("hall_stand_S", -4.8, 2.0);
        graph.link("lounge_door", "hallSE");
        graph.link("lounge_door", "lounge_center");
        graph.link("lounge_center", "lounge_spot0");
        graph.link("lounge_center", "lounge_spot1");
        graph.link("lounge_center", "lounge_spot2");
        graph.link("lounge_center", "water_cooler");
        graph.link("hall_stand_N", "hallNE");
        graph.link("hall_stand_S", "hallSW");
        sitTargets["lounge_spot0"] = { sit: true, x: 9.9, z: 5.3, facing: -Math.PI / 2 };
        sitTargets["lounge_spot1"] = { sit: true, x: 9.9, z: 6.7, facing: -Math.PI / 2 };
        sitTargets["lounge_spot2"] = { sit: true, x: 6.8, z: 4.7, facing: Math.PI / 2 };
        sitTargets["water_cooler"] = { sit: false, x: 9.6, z: 8.3, facing: Math.PI / 2 };

        // ---- call panel + shaft indicator next to the shaft ----
        var panel = makeCallPanel(floorNumber);
        panel.position.set(1.85, y + 1.5, 0);
        panel.rotation.y = 0; // panel faces +Z (toward the waiting area)
        parent.add(panel);
        var indicator = makeShaftIndicator();
        indicator.position.set(0, y + 2.75, 1.72);
        indicator.rotation.y = 0;
        parent.add(indicator);

        return { floorGroup: floorGroup, graph: graph, sitTargets: sitTargets, desks: desks, panel: panel, shaftIndicator: indicator };
    }

    function makeCoffeeTableLong(parent, x, y, z) {
        var g = new THREE.Group();
        addBox(g, 3.0, 0.06, 1.2, 0, 0.73, 0, matTable);
        addBox(g, 0.12, 0.72, 1.0, -1.3, 0.36, 0, matTable);
        addBox(g, 0.12, 0.72, 1.0, 1.3, 0.36, 0, matTable);
        g.position.set(x, y, z);
        parent.add(g);
        return g;
    }

    // ------------------------------------------------------------------
    // Lobby (floor 0)
    // ------------------------------------------------------------------
    function buildLobby(parent) {
        var y = 0;
        var lobby = new THREE.Group();
        parent.add(lobby);

        var graph = makeGraph();
        addHallRing(graph);
        var sitTargets = {};

        // ---- entrance chain (real 3-wide gap in the front wall, x -1.5..1.5) ----
        graph.add("outside", 0, 12);
        graph.add("front_door_threshold", 0, 9.35);
        graph.add("entrance", 0, 7.4);
        graph.add("lobby_center", 0, 4.8);
        graph.link("outside", "front_door_threshold");
        graph.link("front_door_threshold", "entrance");
        graph.link("entrance", "lobby_center");
        graph.link("lobby_center", "elevWait");
        graph.link("lobby_center", "hallS");

        // glass doors (visual only, open pass-through)
        var doorL = new THREE.Group();
        var paneL = addBox(doorL, 0.06, 2.5, 1.42, 0, 1.25, 0, matGlass);
        doorL.position.set(-1.5, y, HALF_D);
        parent.add(doorL);
        var doorR = new THREE.Group();
        addBox(doorR, 0.06, 2.5, 1.42, 0, 1.25, 0, matGlass);
        doorR.position.set(1.5, y, HALF_D);
        parent.add(doorR);

        // ---- cafe (left wall): counter + coffee machine + pastry display ----
        addBox(lobby, 1.2, 0.95, 4.5, -10.2, y + 0.48, 3.2, matDesk);
        addBox(lobby, 1.3, 0.06, 4.7, -10.2, y + 0.98, 3.2, matDeskTop);
        makeCoffeeMachine(lobby, -10.2, y, 2.2);
        makePastryDisplay(lobby, -10.2, y, 4.3);

        // bistro tables (4) with two chairs each
        var bistroTables = [
            { t: [-6.6, 2.9], a: [-6.6, 3.6], b: [-6.6, 2.2] },
            { t: [-4.3, 4.6], a: [-4.9, 4.6], b: [-3.7, 4.6] },
            { t: [-6.4, 6.3], a: [-7.1, 6.3], b: [-5.7, 6.3] },
            { t: [-3.6, 6.6], a: [-3.6, 7.3], b: [-3.6, 5.9] }
        ];
        // Each bistro chair faces its table; the chair mesh is rotated a
        // half-turn from the person's facing so the backrest sits behind them.
        function chairFacing(tx, tz, cx, cz) {
            return Math.atan2(tx - cx, tz - cz);
        }
        function chairRotFor(face) { return face + Math.PI; }
        for (var bt = 0; bt < bistroTables.length; bt++) {
            var b = bistroTables[bt];
            makeBistroTable(lobby, b.t[0], y, b.t[1]);
            var fa = chairFacing(b.t[0], b.t[1], b.a[0], b.a[1]);
            var fb = chairFacing(b.t[0], b.t[1], b.b[0], b.b[1]);
            makeChair(lobby, b.a[0], y, b.a[1], chairRotFor(fa));
            makeChair(lobby, b.b[0], y, b.b[1], chairRotFor(fb));
        }
        graph.add("cafe_order", -8.9, y === 0 ? 3.2 : 3.2);
        graph.add("bistro_t0", bistroTables[0].t[0], 2.9);
        graph.add("bistro_t1", bistroTables[1].t[0], 4.6);
        graph.add("bistro_t2", bistroTables[2].t[0], 6.3);
        graph.add("bistro_t3", bistroTables[3].t[0], 6.6);
        for (var bi = 0; bi < 4; bi++) {
            graph.add("bistro_c" + (bi * 2), bistroTables[bi].a[0], bistroTables[bi].a[1]);
            graph.add("bistro_c" + (bi * 2 + 1), bistroTables[bi].b[0], bistroTables[bi].b[1]);
        }
        graph.add("cafe_walk", -5.2, 2.4);
        graph.link("hallW", "cafe_walk");
        graph.link("cafe_walk", "cafe_order");
        graph.link("cafe_walk", "bistro_t0");
        graph.link("cafe_walk", "bistro_t1");
        graph.link("cafe_walk", "bistro_t2");
        graph.link("cafe_walk", "bistro_t3");
        for (var bi2 = 0; bi2 < 4; bi2++) {
            graph.link("bistro_t" + bi2, "bistro_c" + (bi2 * 2));
            graph.link("bistro_t" + bi2, "bistro_c" + (bi2 * 2 + 1));
        }
        for (var bi3 = 0; bi3 < 8; bi3++) {
            var tb = bistroTables[Math.floor(bi3 / 2)];
            var bx = (bi3 % 2 === 0) ? tb.a : tb.b;
            sitTargets["bistro_c" + bi3] = {
                sit: true, x: bx[0], z: bx[1],
                facing: chairFacing(tb.t[0], tb.t[1], bx[0], bx[1])
            };
        }
        sitTargets["cafe_order"] = { sit: false, x: -8.9, z: 3.2, facing: -Math.PI / 2 };

        // ---- front lounge (right side) ----
        // Couch backs to the east wall (+X), seat faces -X; armchairs face +X.
        makeCouch(lobby, 9.7, y, 5.6, Math.PI / 2);
        makeCoffeeTable(lobby, 7.7, y, 5.6);
        makeArmchair(lobby, 7.4, y, 4.1, -Math.PI / 2);
        makeArmchair(lobby, 7.4, y, 7.1, -Math.PI / 2);
        graph.add("lobby_fc0", 9.5, 4.9);
        graph.add("lobby_fc1", 9.5, 6.3);
        graph.add("lobby_fca", 7.5, 4.1);
        graph.add("lobby_fcb", 7.5, 7.1);
        graph.add("lounge_walk", 4.6, 3.6);
        graph.link("hallSE", "lounge_walk");
        graph.link("lounge_walk", "lobby_fc0");
        graph.link("lounge_walk", "lobby_fc1");
        graph.link("lounge_walk", "lobby_fca");
        graph.link("lounge_walk", "lobby_fcb");
        sitTargets["lobby_fc0"] = { sit: true, x: 9.5, z: 4.9, facing: -Math.PI / 2 };
        sitTargets["lobby_fc1"] = { sit: true, x: 9.5, z: 6.3, facing: -Math.PI / 2 };
        sitTargets["lobby_fca"] = { sit: true, x: 7.5, z: 4.1, facing: Math.PI / 2 };
        sitTargets["lobby_fcb"] = { sit: true, x: 7.5, z: 7.1, facing: Math.PI / 2 };

        // ---- back lounge (z < 0): two couches facing each other ----
        // South couch (z -5.3): back to +Z, seat faces -Z toward the table.
        // North couch (z -7.9): back to -Z, seat faces +Z toward the table.
        makeCouch(lobby, 5.6, y, -5.3, 0);
        makeCouch(lobby, 5.6, y, -7.9, Math.PI);
        makeCoffeeTable(lobby, 5.6, y, -6.6);
        graph.add("back_walk", 4.0, -4.6);
        graph.add("back_lounge_N", 5.6, -7.7);
        graph.add("back_lounge_S", 5.6, -5.5);
        graph.link("hallNE", "back_walk");
        graph.link("back_walk", "back_lounge_N");
        graph.link("back_walk", "back_lounge_S");
        sitTargets["back_lounge_N"] = { sit: true, x: 5.6, z: -7.7, facing: 0 };
        sitTargets["back_lounge_S"] = { sit: true, x: 5.6, z: -5.5, facing: Math.PI };

        // ---- conversation pit (back-left): round table + 4 armchairs ----
        // Each chair's backrest is on the far side of the table so the sitter
        // faces the table: south chair rotY 0, north rotY PI, east rotY PI/2,
        // west rotY -PI/2.
        makeRoundTable(lobby, -7.4, y, -6.4, 0.55);
        makeArmchair(lobby, -7.4, y, -5.2, 0, 0x5b6f9a);
        makeArmchair(lobby, -7.4, y, -7.6, Math.PI, 0x5b6f9a);
        makeArmchair(lobby, -6.2, y, -6.4, Math.PI / 2, 0x5b6f9a);
        makeArmchair(lobby, -8.6, y, -6.4, -Math.PI / 2, 0x5b6f9a);
        graph.add("pit_walk", -5.0, -4.6);
        graph.add("pit_N", -7.4, -5.4);
        graph.add("pit_S", -7.4, -7.4);
        graph.add("pit_E", -6.4, -6.4);
        graph.add("pit_W", -8.4, -6.4);
        graph.link("hallW", "pit_walk");
        graph.link("pit_walk", "pit_N");
        graph.link("pit_walk", "pit_S");
        graph.link("pit_walk", "pit_E");
        graph.link("pit_walk", "pit_W");
        sitTargets["pit_N"] = { sit: true, x: -7.4, z: -5.4, facing: Math.PI };
        sitTargets["pit_S"] = { sit: true, x: -7.4, z: -7.4, facing: 0 };
        sitTargets["pit_E"] = { sit: true, x: -6.4, z: -6.4, facing: -Math.PI / 2 };
        sitTargets["pit_W"] = { sit: true, x: -8.4, z: -6.4, facing: Math.PI / 2 };

        // ---- water coolers ----
        makeWaterCooler(lobby, 3.9, y, 7.7);
        makeWaterCooler(lobby, -3.9, y, -7.7);
        graph.add("lobby_wc_front", 3.3, 7.7);
        graph.add("lobby_wc_back", -3.3, -7.7);
        graph.link("entrance", "lobby_wc_front");
        graph.link("hallNW", "lobby_wc_back");
        sitTargets["lobby_wc_front"] = { sit: false, x: 3.3, z: 7.7, facing: Math.PI / 2 };
        sitTargets["lobby_wc_back"] = { sit: false, x: -3.3, z: -7.7, facing: -Math.PI / 2 };

        // ---- reception desk (tucked off to the side) ----
        addBox(lobby, 1.5, 1.05, 0.5, -3.2, y + 0.5, 6.4, matDesk);
        addBox(lobby, 1.5, 0.06, 0.56, -3.2, y + 1.08, 6.4, matDeskTop);
        makePlant(lobby, -4.3, y, 6.4);
        graph.add("reception", -3.2, 5.3);
        graph.link("entrance", "reception");
        sitTargets["reception"] = { sit: false, x: -3.2, z: 5.3, facing: Math.PI };

        // ---- info kiosk near the entrance ----
        addBox(lobby, 0.5, 1.0, 0.16, 1.9, y + 0.5, 8.3, matMachine);
        graph.add("kiosk", 2.6, 8.3);
        graph.link("entrance", "kiosk");
        sitTargets["kiosk"] = { sit: false, x: 2.6, z: 8.3, facing: 0 };

        // ---- generic loiter waypoints ----
        graph.add("lobby_stand_entry", 0, 8.6);
        graph.add("lobby_stand_NE", 4.6, 6.8);
        graph.add("lobby_stand_NW", -4.9, 6.8);
        graph.add("lobby_stand_midE", 4.2, 0.6);
        graph.add("lobby_stand_midW", -4.2, 0.6);
        graph.add("lobby_stand_center", -0.0, 5.6);
        graph.link("entrance", "lobby_stand_entry");
        graph.link("lobby_center", "lobby_stand_entry");
        graph.link("lobby_center", "lobby_stand_NE");
        graph.link("lobby_center", "lobby_stand_NW");
        graph.link("hallE", "lobby_stand_midE");
        graph.link("hallW", "lobby_stand_midW");
        graph.link("lobby_center", "lobby_stand_center");
        var stands = ["lobby_stand_entry", "lobby_stand_NE", "lobby_stand_NW", "lobby_stand_midE", "lobby_stand_midW", "lobby_stand_center"];
        for (var st = 0; st < stands.length; st++) {
            var sd = graph.nodes[stands[st]];
            sitTargets[stands[st]] = { sit: false, x: sd.x, z: sd.z, facing: 0 };
        }

        // ---- plants by the entrance (outside the 3-wide gap) ----
        makePlant(lobby, -2.3, y, 8.3);
        makePlant(lobby, 2.3, y, 8.3);

        // ---- call panel + shaft indicator (same as other floors) ----
        var panel = makeCallPanel(0);
        panel.position.set(1.85, y + 1.5, 0);
        panel.rotation.y = 0;
        parent.add(panel);
        var indicator = makeShaftIndicator();
        indicator.position.set(0, y + 2.75, 1.72);
        parent.add(indicator);

        return { floorGroup: lobby, graph: graph, sitTargets: sitTargets, panel: panel, shaftIndicator: indicator,
            entranceSpot: graph.nodes["entrance"].clone(),
            cafeSpots: ["bistro_c0", "bistro_c1", "bistro_c2", "bistro_c3", "bistro_c4", "bistro_c5", "bistro_c6", "bistro_c7", "cafe_order"] };
    }

    function makeCoffeeMachine(parent, x, y, z) {
        var g = new THREE.Group();
        addBox(g, 0.5, 0.45, 0.4, 0, 1.2, 0, matMachine);
        addBox(g, 0.3, 0.12, 0.3, 0, 0.99, 0.05, matMachine);
        g.position.set(x, y, z);
        parent.add(g);
        return g;
    }

    function makePastryDisplay(parent, x, y, z) {
        var g = new THREE.Group();
        addBox(g, 0.6, 0.4, 0.45, 0, 1.2, 0, new THREE.MeshLambertMaterial({ color: 0xd8cfa8 }));
        g.position.set(x, y, z);
        parent.add(g);
        return g;
    }

    // ------------------------------------------------------------------
    // World assembly
    // ------------------------------------------------------------------
    function createWorld(scene) {
        var buildingGroup = new THREE.Group();
        scene.add(buildingGroup);

        // ---- ground + sidewalk ----
        addBox(buildingGroup, WORLD.BUILDING_WIDTH + 6, 0.3, WORLD.BUILDING_DEPTH + 6, 0, -0.16, 0, matSlabOpaque);
        addBox(buildingGroup, WORLD.BUILDING_WIDTH + 8, 0.24, 4.2, 0, -0.12, HALF_D + 2.1, matSidewalk);

        // ---- roof ----
        addBox(buildingGroup, WORLD.BUILDING_WIDTH, 0.28, WORLD.BUILDING_DEPTH, 0, WORLD.FLOOR_COUNT * FH + 0.14, 0, matRoof);

        // ---- intermediate floor slabs (four strips around the shaft hole) ----
        for (var f = 1; f < WORLD.FLOOR_COUNT; f++) {
            var yy = f * FH - 0.13;
            addBox(buildingGroup, WORLD.BUILDING_WIDTH, 0.26, 7.5, 0, yy, -5.25, matFloor);
            addBox(buildingGroup, WORLD.BUILDING_WIDTH, 0.26, 7.5, 0, yy, 5.25, matFloor);
            addBox(buildingGroup, 9.5, 0.26, 3, -6.25, yy, 0, matFloor);
            addBox(buildingGroup, 9.5, 0.26, 3, 6.25, yy, 0, matFloor);
        }

        // ---- outer walls ----
        for (var fl = 0; fl < WORLD.FLOOR_COUNT; fl++) {
            var wy = fl * FH + 1.7;
            // back, left, right walls (all floors)
            addBox(buildingGroup, WORLD.BUILDING_WIDTH, SH, 0.12, 0, wy, -HALF_D, matWallOuter);
            addBox(buildingGroup, 0.12, SH, WORLD.BUILDING_DEPTH, -HALF_W, wy, 0, matWallOuter);
            addBox(buildingGroup, 0.12, SH, WORLD.BUILDING_DEPTH, HALF_W, wy, 0, matWallOuter);
            // front wall: floor 0 is split around the 3-wide entrance gap
            if (fl === 0) {
                addBox(buildingGroup, 9.3, SH, 0.12, -6.35, wy, HALF_D, matWallOuter);
                addBox(buildingGroup, 9.3, SH, 0.12, 6.35, wy, HALF_D, matWallOuter);
            } else {
                addBox(buildingGroup, WORLD.BUILDING_WIDTH, SH, 0.12, 0, wy, HALF_D, matWallOuter);
            }
        }

        // ---- floors ----
        var floors = [];
        var lobbyData = buildLobby(buildingGroup);
        floors.push({
            floorNumber: 0,
            nodes: lobbyData.graph.nodes,
            callPanel: lobbyData.panel,
            shaftIndicator: lobbyData.shaftIndicator,
            desks: {},
            sitTargets: lobbyData.sitTargets,
            entranceSpot: lobbyData.entranceSpot,
            cafeSpots: lobbyData.cafeSpots
        });
        for (var off = 1; off < WORLD.FLOOR_COUNT; off++) {
            var data = buildOfficeFloor(buildingGroup, off);
            floors.push({
                floorNumber: off,
                nodes: data.graph.nodes,
                callPanel: data.panel,
                shaftIndicator: data.shaftIndicator,
                desks: data.desks,
                sitTargets: data.sitTargets
            });
        }

        // make sure the whole building renders below the elevator car
        buildingGroup.traverse(function (obj) {
            // transparent building shells stay at renderOrder 0
            if (obj.material && obj.material.transparent) obj.renderOrder = 0;
        });

        return {
            buildingGroup: buildingGroup,
            floors: floors,
            bfsPath: bfsPath
        };
    }

    window.WORLD = WORLD;
    window.createWorld = createWorld;
    window.bfsPath = bfsPath;
})();
