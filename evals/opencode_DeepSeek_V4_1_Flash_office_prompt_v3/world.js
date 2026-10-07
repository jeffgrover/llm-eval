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
    if (!nodes || !nodes[fromName] || !nodes[toName]) return [];
    if (fromName === toName) return [nodes[toName].pos.clone()];
    var queue = [fromName];
    var visited = {};
    visited[fromName] = true;
    var prev = {};
    var found = false;
    while (queue.length > 0 && !found) {
        var name = queue.shift();
        var node = nodes[name];
        if (!node) continue;
        var i;
        for (i = 0; i < node.links.length; i += 1) {
            var next = node.links[i];
            if (!nodes[next] || visited[next]) continue;
            visited[next] = true;
            prev[next] = name;
            if (next === toName) { found = true; break; }
            queue.push(next);
        }
    }
    if (!found) return [];
    var chain = [];
    var cursor = toName;
    while (cursor && cursor !== fromName) {
        chain.push(nodes[cursor].pos.clone());
        cursor = prev[cursor];
    }
    chain.reverse();
    return chain;
}

function createWorld(scene) {
    var FH = WORLD.FLOOR_HEIGHT;
    var FLOOR_COUNT = WORLD.FLOOR_COUNT;
    var BW = WORLD.BUILDING_WIDTH;
    var BD = WORLD.BUILDING_DEPTH;
    var HX = BW / 2;
    var HZ = BD / 2;
    var SW = WORLD.SHAFT_WIDTH / 2;
    var SD = WORLD.SHAFT_DEPTH / 2;
    var TOP = FLOOR_COUNT * FH;

    var buildingGroup = new THREE.Group();
    buildingGroup.renderOrder = 0;
    scene.add(buildingGroup);

    var slabMat = new THREE.MeshLambertMaterial({ color: 0x9aa0a8, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide });
    var wallMat = new THREE.MeshLambertMaterial({ color: 0x9999ff, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide });
    var interiorMat = new THREE.MeshLambertMaterial({ color: 0xbbc5e6, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide });
    var groundMat = new THREE.MeshLambertMaterial({ color: 0x707070 });
    var sidewalkMat = new THREE.MeshLambertMaterial({ color: 0x9a9a90 });
    var woodMat = new THREE.MeshLambertMaterial({ color: 0x8a6a44 });
    var darkMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
    var metalMat = new THREE.MeshLambertMaterial({ color: 0x9a9a9a });
    var whiteMat = new THREE.MeshLambertMaterial({ color: 0xdddddd });
    var fabricMat = new THREE.MeshLambertMaterial({ color: 0x556b7a });
    var fabricMat2 = new THREE.MeshLambertMaterial({ color: 0x7a5560 });
    var plantMat = new THREE.MeshLambertMaterial({ color: 0x3f7f4f });
    var potMat = new THREE.MeshLambertMaterial({ color: 0x6b4a34 });
    var glassMat = new THREE.MeshLambertMaterial({ color: 0xaad4ff, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });

    function addBox(parent, mat, w, h, d, x, y, z, ry) {
        var mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        mesh.position.set(x, y, z);
        if (ry) mesh.rotation.y = ry;
        parent.add(mesh);
        return mesh;
    }

    function addCylinder(parent, mat, rt, rb, h, x, y, z) {
        var mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 12), mat);
        mesh.position.set(x, y, z);
        parent.add(mesh);
        return mesh;
    }

    function addPlant(parent, x, y, z) {
        addCylinder(parent, potMat, 0.22, 0.18, 0.4, x, y + 0.2, z);
        var leaf = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.9, 8), plantMat);
        leaf.position.set(x, y + 0.95, z);
        parent.add(leaf);
    }

    // ---- shells: slabs, roof, outer walls ----
    addBox(buildingGroup, groundMat, BW + 1, 0.2, BD + 1, 0, -0.1, 0, 0);
    addBox(buildingGroup, groundMat, BW, 0.24, BD, 0, TOP, 0, 0);

    var n;
    for (n = 1; n < FLOOR_COUNT; n += 1) {
        var fy = n * FH;
        addBox(buildingGroup, slabMat, BW, 0.16, HZ - SD, 0, fy, -(SD + HZ) / 2, 0);
        addBox(buildingGroup, slabMat, BW, 0.16, HZ - SD, 0, fy, (SD + HZ) / 2, 0);
        addBox(buildingGroup, slabMat, HX - SW, 0.16, SD * 2, -(SW + HX) / 2, fy, 0, 0);
        addBox(buildingGroup, slabMat, HX - SW, 0.16, SD * 2, (SW + HX) / 2, fy, 0, 0);
    }

    addBox(buildingGroup, wallMat, BW, TOP, 0.15, 0, TOP / 2, -HZ, 0);
    addBox(buildingGroup, wallMat, 0.15, TOP, BD, -HX, TOP / 2, 0, 0);
    addBox(buildingGroup, wallMat, 0.15, TOP, BD, HX, TOP / 2, 0, 0);
    addBox(buildingGroup, wallMat, HX - SW, TOP, 0.15, -(SW + HX) / 2, TOP / 2, HZ, 0);
    addBox(buildingGroup, wallMat, HX - SW, TOP, 0.15, (SW + HX) / 2, TOP / 2, HZ, 0);
    addBox(buildingGroup, wallMat, SW * 2, TOP - FH, 0.15, 0, (FH + TOP) / 2, HZ, 0);

    // entrance glass frame (visual only, opening stays clear)
    addBox(buildingGroup, metalMat, 0.12, 2.6, 0.12, -SW - 0.05, 1.3, HZ, 0);
    addBox(buildingGroup, metalMat, 0.12, 2.6, 0.12, SW + 0.05, 1.3, HZ, 0);
    addBox(buildingGroup, metalMat, SW * 2 + 0.22, 0.14, 0.14, 0, 2.6, HZ, 0);
    addBox(buildingGroup, glassMat, 1.35, 2.4, 0.05, -1.1, 1.25, HZ + 0.5, 0.9);
    addBox(buildingGroup, glassMat, 1.35, 2.4, 0.05, 1.1, 1.25, HZ + 0.5, -0.9);
    addBox(buildingGroup, sidewalkMat, 14, 0.16, 6, 0, -0.08, HZ + 3, 0);

    // ---- texture helpers ----
    function updateTextTexture(tex, text) {
        if (tex._lastText === text) return;
        tex._lastText = text;
        var canvas = tex._canvas;
        var ctx = tex._ctx;
        var size = canvas.width;
        ctx.clearRect(0, 0, size, size);
        ctx.fillStyle = "#050505";
        ctx.fillRect(0, 0, size, size);
        ctx.fillStyle = "#ffbb22";
        ctx.font = "bold " + Math.floor(size * 0.72) + "px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.shadowColor = "#ffbb22";
        ctx.shadowBlur = size * 0.12;
        ctx.fillText(text, size / 2, size / 2 + size * 0.03);
        ctx.shadowBlur = 0;
        tex.needsUpdate = true;
    }

    function makeTextTexture(size, text) {
        var canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        var ctx = canvas.getContext("2d");
        var tex = new THREE.CanvasTexture(canvas);
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.generateMipmaps = true;
        tex.anisotropy = 4;
        tex._lastText = null;
        tex._canvas = canvas;
        tex._ctx = ctx;
        updateTextTexture(tex, text);
        return tex;
    }

    function makeCallPanel(floorY) {
        var group = new THREE.Group();
        var plateMat = new THREE.MeshLambertMaterial({ color: 0x333844, transparent: true, opacity: 0.92, depthWrite: false, side: THREE.DoubleSide });
        var plate = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.4, 0.05), plateMat);
        group.add(plate);

        var offMat = new THREE.MeshBasicMaterial({ color: 0x2a2a2a });
        var onMat = new THREE.MeshBasicMaterial({ color: 0x33ff66 });

        function makeArrow(up) {
            var shape = new THREE.Shape();
            shape.moveTo(-0.14, up ? -0.09 : 0.09);
            shape.lineTo(0.14, up ? -0.09 : 0.09);
            shape.lineTo(0, up ? 0.1 : -0.1);
            shape.closePath();
            var mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), offMat);
            if (!up) mesh.rotation.z = Math.PI;
            return mesh;
        }

        var upArrow = makeArrow(true);
        upArrow.position.set(0, 0.34, 0.03);
        group.add(upArrow);
        var downArrow = makeArrow(false);
        downArrow.position.set(0, 0.02, 0.03);
        group.add(downArrow);

        var tex = makeTextTexture(256, "1");
        var displayMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
        var display = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.45), displayMat);
        display.position.set(0, -0.42, 0.03);
        group.add(display);

        group.userData.setUp = function setUp(on) { upArrow.material = on ? onMat : offMat; };
        group.userData.setDown = function setDown(on) { downArrow.material = on ? onMat : offMat; };
        group.userData.setIndicator = function setIndicator(text) { updateTextTexture(tex, text); };
        group.userData.floorY = floorY;
        return group;
    }

    function makeShaftIndicator(floorY, size) {
        var tex = makeTextTexture(256, "1");
        var mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
        var mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
        mesh.position.set(0, floorY + 2.5, shaftFrontZ());
        mesh.userData.setText = function setText(text) { updateTextTexture(tex, text); };
        return mesh;
    }

    function shaftFrontZ() { return SD + 0.08; }

    // ---- navigation graph helpers ----
    function addNode(nodes, name, x, y, z) {
        nodes[name] = { name: name, pos: new THREE.Vector3(x, y, z), links: [] };
        return nodes[name];
    }

    function link(nodes, a, b) {
        if (!nodes[a] || !nodes[b]) return;
        if (nodes[a].links.indexOf(b) < 0) nodes[a].links.push(b);
        if (nodes[b].links.indexOf(a) < 0) nodes[b].links.push(a);
    }

    function buildRing(nodes, y) {
        addNode(nodes, "hallS", 0, y, 2.6);
        addNode(nodes, "hallSE", 3.2, y, 2.6);
        addNode(nodes, "hallE", 3.2, y, 0);
        addNode(nodes, "hallNE", 3.2, y, -2.6);
        addNode(nodes, "hallN", 0, y, -2.6);
        addNode(nodes, "hallNW", -3.2, y, -2.6);
        addNode(nodes, "hallW", -3.2, y, 0);
        addNode(nodes, "hallSW", -3.2, y, 2.6);
        link(nodes, "hallS", "hallSE");
        link(nodes, "hallSE", "hallE");
        link(nodes, "hallE", "hallNE");
        link(nodes, "hallNE", "hallN");
        link(nodes, "hallN", "hallNW");
        link(nodes, "hallNW", "hallW");
        link(nodes, "hallW", "hallSW");
        link(nodes, "hallSW", "hallS");
    }

    function buildOfficeFloor(floorNumber) {
        var y = floorNumber * FH;
        var nodes = {};
        var sitTargets = {};
        buildRing(nodes, y);
        addNode(nodes, "elevWait", 0, y, 2.95);
        link(nodes, "elevWait", "hallS");

        // interior dividing walls for offices
        var i;
        var dividerXs = [-5.5, 0, 5.5];
        for (i = 0; i < dividerXs.length; i += 1) {
            addBox(buildingGroup, interiorMat, 0.12, FH, HZ - 3 - 1.5, dividerXs[i], y + FH / 2, -(3 + HZ) / 2, 0);
        }
        // office front wall pieces (z = -3) with 1.2 door gaps
        var sections = [
            { cx: -8.25, door: "officeA_door", desk: "officeA_desk", ring: ["hallNW", "hallW"] },
            { cx: -2.75, door: "officeB_door", desk: "officeB_desk", ring: ["hallN", "hallNW"] },
            { cx: 2.75, door: "officeC_door", desk: "officeC_desk", ring: ["hallN", "hallNE"] },
            { cx: 8.25, door: "officeD_door", desk: "officeD_desk", ring: ["hallNE", "hallE"] }
        ];
        var desks = [];
        for (i = 0; i < sections.length; i += 1) {
            var sec = sections[i];
            var leftEdge = sec.cx - 2.75;
            var rightEdge = sec.cx + 2.75;
            var gapL = sec.cx - 0.6;
            var gapR = sec.cx + 0.6;
            addBox(buildingGroup, interiorMat, gapL - leftEdge, FH, 0.12, (leftEdge + gapL) / 2, y + FH / 2, -3, 0);
            addBox(buildingGroup, interiorMat, rightEdge - gapR, FH, 0.12, (gapR + rightEdge) / 2, y + FH / 2, -3, 0);

            addNode(nodes, sec.door, sec.cx, y, -2.7);
            addNode(nodes, sec.desk, sec.cx, y, -5.75);
            link(nodes, sec.door, sec.desk);
            link(nodes, sec.door, sec.ring[0]);
            link(nodes, sec.door, sec.ring[1]);
            sitTargets[sec.desk] = { sit: true, facing: Math.PI };
            desks.push({ id: sec.desk, seatWp: sec.desk, doorWp: sec.door, x: sec.cx, floor: floorNumber });

            // desk + monitor + chair
            addBox(buildingGroup, woodMat, 2.0, 0.1, 1.0, sec.cx, y + 0.78, -6.85, 0);
            addBox(buildingGroup, metalMat, 0.08, 0.72, 0.08, sec.cx - 0.85, y + 0.36, -6.5, 0);
            addBox(buildingGroup, metalMat, 0.08, 0.72, 0.08, sec.cx + 0.85, y + 0.36, -6.5, 0);
            addBox(buildingGroup, darkMat, 0.7, 0.46, 0.05, sec.cx, y + 1.1, -7.2, 0);
            addBox(buildingGroup, fabricMat, 0.5, 0.1, 0.5, sec.cx, y + 0.47, -5.85, 0);
            addBox(buildingGroup, fabricMat, 0.5, 0.6, 0.08, sec.cx, y + 0.75, -5.55, 0);
            addBox(buildingGroup, darkMat, 0.08, 0.45, 0.08, sec.cx, y + 0.22, -5.85, 0);
        }

        // conference room front-left
        addBox(buildingGroup, interiorMat, 0.12, FH, 6, -3, y + FH / 2, 6, 0);
        addBox(buildingGroup, interiorMat, 3.2, FH, 0.12, -9.4, y + FH / 2, 3, 0);
        addBox(buildingGroup, interiorMat, 3.2, FH, 0.12, -4.6, y + FH / 2, 3, 0);
        addBox(buildingGroup, woodMat, 4.0, 0.1, 1.3, -7, y + 0.75, 6, 0);
        addBox(buildingGroup, woodMat, 0.12, 0.72, 0.12, -8.8, y + 0.36, 6, 0);
        addBox(buildingGroup, woodMat, 0.12, 0.72, 0.12, -5.2, y + 0.36, 6, 0);
        addNode(nodes, "conf_door", -7, y, 3.4);
        addNode(nodes, "conf_center", -7, y, 6);
        link(nodes, "conf_door", "hallSW");
        link(nodes, "conf_door", "conf_center");
        var confSeats = [
            { name: "conf_seat0", x: -8.2, z: 4.85, f: 0 },
            { name: "conf_seat1", x: -5.8, z: 4.85, f: 0 },
            { name: "conf_seat2", x: -8.2, z: 7.15, f: Math.PI },
            { name: "conf_seat3", x: -5.8, z: 7.15, f: Math.PI }
        ];
        for (i = 0; i < confSeats.length; i += 1) {
            var cs = confSeats[i];
            addNode(nodes, cs.name, cs.x, y, cs.z);
            link(nodes, cs.name, "conf_center");
            sitTargets[cs.name] = { sit: true, facing: cs.f };
            addBox(buildingGroup, fabricMat2, 0.46, 0.1, 0.46, cs.x, y + 0.47, cs.z, 0);
            addBox(buildingGroup, fabricMat2, 0.46, 0.55, 0.07, cs.x, y + 0.76, cs.z + (cs.f === 0 ? -0.28 : 0.28), 0);
        }

        // lounge front-right
        addBox(buildingGroup, interiorMat, 0.12, FH, 6, 3, y + FH / 2, 6, 0);
        addBox(buildingGroup, interiorMat, 3.2, FH, 0.12, 9.4, y + FH / 2, 3, 0);
        addBox(buildingGroup, interiorMat, 3.2, FH, 0.12, 4.6, y + FH / 2, 3, 0);
        addNode(nodes, "lounge_door", 7, y, 3.4);
        addNode(nodes, "lounge_center", 7, y, 6);
        link(nodes, "lounge_door", "hallSE");
        link(nodes, "lounge_door", "lounge_center");
        addBox(buildingGroup, fabricMat, 2.4, 0.45, 0.9, 7, y + 0.22, 7.6, 0);
        addBox(buildingGroup, fabricMat, 2.4, 0.5, 0.2, 7, y + 0.5, 8.05, 0);
        addBox(buildingGroup, woodMat, 1.4, 0.35, 0.8, 7, y + 0.17, 6.2, 0);
        addBox(buildingGroup, fabricMat2, 0.8, 0.42, 0.8, 4.6, y + 0.2, 5.0, 0);
        addBox(buildingGroup, fabricMat2, 0.8, 0.42, 0.8, 9.4, y + 0.2, 5.0, 0);
        addCylinder(buildingGroup, whiteMat, 0.28, 0.28, 1.0, 10.2, y + 0.5, 3.7);
        addNode(nodes, "water_cooler", 10.2, y, 4.3);
        link(nodes, "water_cooler", "hallSE");
        var loungeSpots = [
            { name: "lounge_spot0", x: 7, z: 7.0, f: Math.PI },
            { name: "lounge_spot1", x: 4.6, z: 5.0, f: Math.PI / 2 },
            { name: "lounge_spot2", x: 9.4, z: 5.0, f: -Math.PI / 2 }
        ];
        for (i = 0; i < loungeSpots.length; i += 1) {
            var ls = loungeSpots[i];
            addNode(nodes, ls.name, ls.x, y, ls.z);
            link(nodes, ls.name, "lounge_center");
            sitTargets[ls.name] = { sit: true, facing: ls.f };
        }

        addNode(nodes, "hall_stand_N", 2.0, y, -3.4);
        addNode(nodes, "hall_stand_S", 2.0, y, 3.4);
        link(nodes, "hall_stand_N", "hallN");
        link(nodes, "hall_stand_N", "hallNE");
        link(nodes, "hall_stand_S", "hallS");
        link(nodes, "hall_stand_S", "hallSE");
        sitTargets.hall_stand_N = { sit: false, facing: 0 };
        sitTargets.hall_stand_S = { sit: false, facing: 0 };
        sitTargets.water_cooler = { sit: false, facing: Math.PI / 2 };
        addPlant(buildingGroup, 10.3, y, 8.2);
        addPlant(buildingGroup, -10.4, y, -8.2);

        var panel = makeCallPanel(y);
        panel.position.set(2.0, y + 1.35, SD + 0.1);
        buildingGroup.add(panel);
        var indicator = makeShaftIndicator(y, 0.9);
        buildingGroup.add(indicator);

        return {
            floorNumber: floorNumber,
            nodes: nodes,
            sitTargets: sitTargets,
            callPanel: panel,
            shaftIndicator: indicator,
            desks: desks
        };
    }

    function buildLobbyFloor() {
        var y = 0;
        var nodes = {};
        var sitTargets = {};
        buildRing(nodes, y);
        addNode(nodes, "elevWait", 0, y, 2.95);
        addNode(nodes, "outside", 0, y, 12);
        addNode(nodes, "front_door_threshold", 0, y, 9.35);
        addNode(nodes, "entrance", 0, y, 7.4);
        addNode(nodes, "lobby_center", 0, y, 3.6);
        link(nodes, "elevWait", "hallS");
        link(nodes, "lobby_center", "elevWait");
        link(nodes, "lobby_center", "hallS");
        link(nodes, "entrance", "lobby_center");
        link(nodes, "front_door_threshold", "entrance");
        link(nodes, "outside", "front_door_threshold");

        // cafe along left wall
        addBox(buildingGroup, woodMat, 1.2, 1.0, 3.6, -9.4, y + 0.5, 6, 0);
        addBox(buildingGroup, darkMat, 1.3, 0.08, 3.7, -9.4, y + 1.04, 6, 0);
        addBox(buildingGroup, darkMat, 0.5, 0.4, 0.5, -9.4, y + 1.28, 6.9, 0);
        addBox(buildingGroup, metalMat, 0.6, 0.5, 0.5, -9.4, y + 1.33, 5.2, 0);
        addNode(nodes, "cafe_door", -7, y, 3.2);
        addNode(nodes, "cafe_center", -7, y, 5.2);
        addNode(nodes, "cafe_order", -8.5, y, 6);
        link(nodes, "cafe_door", "hallSW");
        link(nodes, "cafe_door", "cafe_center");
        link(nodes, "cafe_center", "cafe_order");
        var cafeSeats = [
            { name: "cafe_seat0", x: -8.0, z: 5.0, f: Math.PI / 2 },
            { name: "cafe_seat1", x: -6.0, z: 5.0, f: -Math.PI / 2 },
            { name: "cafe_seat2", x: -8.0, z: 7.0, f: Math.PI / 2 },
            { name: "cafe_seat3", x: -6.0, z: 7.0, f: -Math.PI / 2 }
        ];
        var i;
        for (i = 0; i < cafeSeats.length; i += 1) {
            var cf = cafeSeats[i];
            addNode(nodes, cf.name, cf.x, y, cf.z);
            link(nodes, cf.name, "cafe_center");
            sitTargets[cf.name] = { sit: true, facing: cf.f };
            addCylinder(buildingGroup, woodMat, 0.45, 0.45, 0.08, cf.x + (cf.x < -7 ? 1 : -1), y + 0.74, cf.z);
            addCylinder(buildingGroup, metalMat, 0.06, 0.06, 0.72, cf.x + (cf.x < -7 ? 1 : -1), y + 0.36, cf.z);
            addBox(buildingGroup, fabricMat2, 0.42, 0.1, 0.42, cf.x, y + 0.47, cf.z, 0);
            addBox(buildingGroup, fabricMat2, 0.42, 0.5, 0.07, cf.x + (cf.x < -7 ? -0.24 : 0.24), y + 0.72, cf.z, 0);
        }

        // front lounge right
        addBox(buildingGroup, fabricMat, 2.4, 0.45, 0.9, 7, y + 0.22, 7.6, 0);
        addBox(buildingGroup, fabricMat, 2.4, 0.5, 0.2, 7, y + 0.5, 8.05, 0);
        addBox(buildingGroup, woodMat, 1.4, 0.35, 0.8, 7, y + 0.17, 6.2, 0);
        addBox(buildingGroup, fabricMat2, 0.8, 0.42, 0.8, 4.8, y + 0.2, 5.0, 0);
        addBox(buildingGroup, fabricMat2, 0.8, 0.42, 0.8, 9.2, y + 0.2, 5.0, 0);
        addNode(nodes, "lounge_door", 7, y, 3.2);
        addNode(nodes, "lounge_center", 7, y, 6);
        link(nodes, "lounge_door", "hallSE");
        link(nodes, "lounge_door", "lounge_center");
        var loungeSpots = [
            { name: "lounge_spot0", x: 7, z: 7.0, f: Math.PI },
            { name: "lounge_spot1", x: 4.8, z: 5.0, f: Math.PI / 2 },
            { name: "lounge_spot2", x: 9.2, z: 5.0, f: -Math.PI / 2 }
        ];
        for (i = 0; i < loungeSpots.length; i += 1) {
            var ls = loungeSpots[i];
            addNode(nodes, ls.name, ls.x, y, ls.z);
            link(nodes, ls.name, "lounge_center");
            sitTargets[ls.name] = { sit: true, facing: ls.f };
        }

        // back lounge
        addNode(nodes, "back_lounge_hub", 0, y, -3.4);
        link(nodes, "back_lounge_hub", "hallN");
        link(nodes, "back_lounge_hub", "hallW");
        addBox(buildingGroup, fabricMat, 2.4, 0.45, 0.9, 0, y + 0.22, -7.7, 0);
        addBox(buildingGroup, fabricMat, 2.4, 0.5, 0.2, 0, y + 0.5, -8.15, 0);
        addBox(buildingGroup, fabricMat2, 2.4, 0.45, 0.9, 0, y + 0.22, -4.7, 0);
        addBox(buildingGroup, fabricMat2, 2.4, 0.5, 0.2, 0, y + 0.5, -4.25, 0);
        addBox(buildingGroup, woodMat, 1.4, 0.35, 0.9, 0, y + 0.17, -6.2, 0);
        addNode(nodes, "back_lounge_N", 0, y, -7.1);
        addNode(nodes, "back_lounge_S", 0, y, -5.3);
        link(nodes, "back_lounge_N", "back_lounge_hub");
        link(nodes, "back_lounge_S", "back_lounge_hub");
        sitTargets.back_lounge_N = { sit: true, facing: 0 };
        sitTargets.back_lounge_S = { sit: true, facing: Math.PI };

        // conversation pit back-left
        addNode(nodes, "pit_hub", -7, y, -3.4);
        link(nodes, "pit_hub", "hallW");
        link(nodes, "pit_hub", "hallNW");
        addCylinder(buildingGroup, woodMat, 0.8, 0.8, 0.1, -7, y + 0.72, -6);
        addCylinder(buildingGroup, darkMat, 0.12, 0.12, 0.7, -7, y + 0.35, -6);
        var pitSeats = [
            { name: "pit_N", x: -7, z: -4.6, f: Math.PI },
            { name: "pit_S", x: -7, z: -7.4, f: 0 },
            { name: "pit_E", x: -5.6, z: -6, f: -Math.PI / 2 },
            { name: "pit_W", x: -8.4, z: -6, f: Math.PI / 2 }
        ];
        for (i = 0; i < pitSeats.length; i += 1) {
            var ps = pitSeats[i];
            addNode(nodes, ps.name, ps.x, y, ps.z);
            link(nodes, ps.name, "pit_hub");
            sitTargets[ps.name] = { sit: true, facing: ps.f };
            addBox(buildingGroup, fabricMat2, 0.75, 0.42, 0.75, ps.x, y + 0.2, ps.z, 0);
            addBox(buildingGroup, fabricMat2, 0.75, 0.5, 0.16, ps.x, y + 0.5, ps.z + (ps.f === 0 || ps.f === Math.PI ? (ps.f === 0 ? -0.34 : 0.34) : 0), 0);
        }

        // water coolers
        addCylinder(buildingGroup, whiteMat, 0.28, 0.28, 1.0, 9.6, y + 0.5, 3.7);
        addNode(nodes, "lobby_wc_front", 9.6, y, 4.3);
        link(nodes, "lobby_wc_front", "hallSE");
        sitTargets.lobby_wc_front = { sit: false, facing: Math.PI / 2 };
        addCylinder(buildingGroup, whiteMat, 0.28, 0.28, 1.0, -9.6, y + 0.5, -3.7);
        addNode(nodes, "lobby_wc_back", -9.6, y, -4.3);
        link(nodes, "lobby_wc_back", "hallW");
        sitTargets.lobby_wc_back = { sit: false, facing: Math.PI / 2 };

        // reception + kiosk
        addBox(buildingGroup, woodMat, 2.4, 1.0, 0.9, -4, y + 0.5, 6.4, 0);
        addNode(nodes, "reception", -4, y, 5.5);
        link(nodes, "reception", "lobby_center");
        sitTargets.reception = { sit: false, facing: Math.PI };
        addBox(buildingGroup, darkMat, 0.6, 1.6, 0.4, 2.6, y + 0.8, 6.6, 0);
        addNode(nodes, "kiosk", 2.6, y, 6.0);
        link(nodes, "kiosk", "entrance");
        link(nodes, "kiosk", "lobby_center");
        sitTargets.kiosk = { sit: false, facing: Math.PI };

        // loiter spots
        var loiters = [
            { name: "lobby_stand_center", x: 4, z: 0, a: "hallE", b: "hallS" },
            { name: "lobby_stand_NE", x: 6, z: -4, a: "hallNE", b: "hallN" },
            { name: "lobby_stand_NW", x: -6, z: -4, a: "hallNW", b: "hallN" },
            { name: "lobby_stand_midE", x: 8.5, z: 0, a: "hallE", b: "hallSE" },
            { name: "lobby_stand_midW", x: -8.5, z: 0, a: "hallW", b: "hallSW" },
            { name: "lobby_stand_entry", x: 2.2, z: 7.4, a: "entrance", b: "kiosk" }
        ];
        for (i = 0; i < loiters.length; i += 1) {
            var lo = loiters[i];
            addNode(nodes, lo.name, lo.x, y, lo.z);
            link(nodes, lo.name, lo.a);
            link(nodes, lo.name, lo.b);
            sitTargets[lo.name] = { sit: false, facing: 0 };
        }

        addPlant(buildingGroup, 2.6, y, 8.2);
        addPlant(buildingGroup, -2.6, y, 8.2);

        var panel = makeCallPanel(y);
        panel.position.set(2.0, y + 1.35, SD + 0.1);
        buildingGroup.add(panel);
        var indicator = makeShaftIndicator(y, 0.9);
        buildingGroup.add(indicator);

        return {
            floorNumber: 0,
            nodes: nodes,
            sitTargets: sitTargets,
            callPanel: panel,
            shaftIndicator: indicator,
            desks: [],
            entranceSpot: nodes.entrance.pos,
            cafeSpots: [nodes.cafe_seat0.pos, nodes.cafe_seat1.pos, nodes.cafe_seat2.pos, nodes.cafe_seat3.pos]
        };
    }

    var floors = [];
    floors.push(buildLobbyFloor());
    for (n = 1; n < FLOOR_COUNT; n += 1) {
        floors.push(buildOfficeFloor(n));
    }

    return {
        buildingGroup: buildingGroup,
        floors: floors,
        bfsPath: bfsPath,
        WORLD: WORLD
    };
}

window.WORLD = WORLD;
window.bfsPath = bfsPath;
window.createWorld = createWorld;