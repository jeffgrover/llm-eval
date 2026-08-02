// world.js - building geometry, per-floor layouts, furniture, navigation graph, call panels
// Classic script; exposes window.WORLD, window.createWorld, window.bfsPath.

var WORLD = {
    FLOOR_HEIGHT: 3.4, FLOOR_COUNT: 6,
    BUILDING_WIDTH: 22, BUILDING_DEPTH: 18,
    SHAFT_WIDTH: 3, SHAFT_DEPTH: 3,
    PERSON_R: 0.4
};

// ---------- materials ----------
function makeTransparentMat(color, opacity) {
    return new THREE.MeshLambertMaterial({
        color: color, transparent: true, opacity: opacity,
        depthWrite: false, side: THREE.DoubleSide
    });
}

var WORLD_MATS = {
    slab: makeTransparentMat(0x888899, 0.3),
    outerWall: makeTransparentMat(0x9999ff, 0.2),
    innerWall: makeTransparentMat(0xbbc5e6, 0.28),
    glassDoor: makeTransparentMat(0xaaddee, 0.25),
    solidGray: new THREE.MeshLambertMaterial({ color: 0x777777 }),
    sidewalk: new THREE.MeshLambertMaterial({ color: 0x999288 }),
    deskWood: new THREE.MeshLambertMaterial({ color: 0x8a6238 }),
    darkWood: new THREE.MeshLambertMaterial({ color: 0x5d4020 }),
    chairMat: new THREE.MeshLambertMaterial({ color: 0x35507a }),
    couchMat: new THREE.MeshLambertMaterial({ color: 0x7a4040 }),
    armchairMat: new THREE.MeshLambertMaterial({ color: 0x4a6b4a }),
    tableMat: new THREE.MeshLambertMaterial({ color: 0x9a7a4a }),
    monitorMat: new THREE.MeshLambertMaterial({ color: 0x181820 }),
    coolerMat: new THREE.MeshLambertMaterial({ color: 0x66aadd }),
    counterMat: new THREE.MeshLambertMaterial({ color: 0xa08050 }),
    counterTopMat: new THREE.MeshLambertMaterial({ color: 0x4a3620 }),
    plantPotMat: new THREE.MeshLambertMaterial({ color: 0x8a4a2a }),
    plantMat: new THREE.MeshLambertMaterial({ color: 0x2a7a2a }),
    machineMat: new THREE.MeshLambertMaterial({ color: 0x333340 }),
    pastryMat: new THREE.MeshLambertMaterial({ color: 0xd8b060 }),
    panelMat: new THREE.MeshLambertMaterial({ color: 0x555560 }),
    arrowOff: new THREE.MeshBasicMaterial({ color: 0x2a2f2a }),
    arrowOn: new THREE.MeshBasicMaterial({ color: 0x33ff55 })
};

function worldBox(w, h, d, mat, x, y, z) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    return m;
}

// ---------- canvas text textures ----------
function makeTextDisplay(sizePx) {
    var canvas = document.createElement("canvas");
    canvas.width = sizePx; canvas.height = sizePx;
    var ctx = canvas.getContext("2d");
    var tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = 4;
    tex._lastText = null;
    function draw(text) {
        if (tex._lastText === text) { return; }
        tex._lastText = text;
        ctx.fillStyle = "#050505";
        ctx.fillRect(0, 0, sizePx, sizePx);
        ctx.fillStyle = "#ffbb22";
        ctx.shadowColor = "#ffbb22";
        ctx.shadowBlur = sizePx * 0.08;
        ctx.font = "bold " + Math.floor(sizePx * 0.82) + "px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(text, sizePx / 2, sizePx / 2 + sizePx * 0.03);
        ctx.shadowBlur = 0;
        tex.needsUpdate = true;
    }
    draw("0");
    return { texture: tex, draw: draw };
}

function updateTextTexture(display, text) {
    display.draw(text);
}

// ---------- furniture builders ----------
function buildChairMesh(facing) {
    var g = new THREE.Group();
    g.add(worldBox(0.55, 0.08, 0.55, WORLD_MATS.chairMat, 0, 0.42, 0));
    // backrest behind the sitter (local -Z; sitter faces local +Z)
    g.add(worldBox(0.55, 0.6, 0.08, WORLD_MATS.chairMat, 0, 0.75, -0.27));
    var lp = [[-0.22, -0.22], [0.22, -0.22], [-0.22, 0.22], [0.22, 0.22]];
    for (var i = 0; i < lp.length; i++) {
        g.add(worldBox(0.06, 0.42, 0.06, WORLD_MATS.darkWood, lp[i][0], 0.21, lp[i][1]));
    }
    g.rotation.y = facing;
    return g;
}

function buildDeskMesh() {
    var g = new THREE.Group();
    g.add(worldBox(1.7, 0.08, 0.85, WORLD_MATS.deskWood, 0, 0.72, 0));
    g.add(worldBox(0.08, 0.72, 0.8, WORLD_MATS.darkWood, -0.78, 0.36, 0));
    g.add(worldBox(0.08, 0.72, 0.8, WORLD_MATS.darkWood, 0.78, 0.36, 0));
    // monitor at the back of the desk (local -Z)
    g.add(worldBox(0.55, 0.38, 0.05, WORLD_MATS.monitorMat, 0, 1.05, -0.3));
    g.add(worldBox(0.1, 0.18, 0.1, WORLD_MATS.monitorMat, 0, 0.85, -0.3));
    return g;
}

function buildCouchMesh() {
    var g = new THREE.Group();
    g.add(worldBox(2.0, 0.35, 0.85, WORLD_MATS.couchMat, 0, 0.28, 0));
    g.add(worldBox(2.0, 0.6, 0.2, WORLD_MATS.couchMat, 0, 0.7, -0.35));
    g.add(worldBox(0.2, 0.35, 0.85, WORLD_MATS.couchMat, -0.95, 0.6, 0));
    g.add(worldBox(0.2, 0.35, 0.85, WORLD_MATS.couchMat, 0.95, 0.6, 0));
    return g;
}

function buildArmchairMesh() {
    var g = new THREE.Group();
    g.add(worldBox(0.8, 0.35, 0.8, WORLD_MATS.armchairMat, 0, 0.28, 0));
    g.add(worldBox(0.8, 0.55, 0.18, WORLD_MATS.armchairMat, 0, 0.68, -0.32));
    g.add(worldBox(0.16, 0.3, 0.8, WORLD_MATS.armchairMat, -0.37, 0.6, 0));
    g.add(worldBox(0.16, 0.3, 0.8, WORLD_MATS.armchairMat, 0.37, 0.6, 0));
    return g;
}

function buildCoffeeTableMesh() {
    var g = new THREE.Group();
    g.add(worldBox(1.2, 0.06, 0.7, WORLD_MATS.tableMat, 0, 0.4, 0));
    g.add(worldBox(0.08, 0.4, 0.08, WORLD_MATS.darkWood, -0.5, 0.2, -0.25));
    g.add(worldBox(0.08, 0.4, 0.08, WORLD_MATS.darkWood, 0.5, 0.2, -0.25));
    g.add(worldBox(0.08, 0.4, 0.08, WORLD_MATS.darkWood, -0.5, 0.2, 0.25));
    g.add(worldBox(0.08, 0.4, 0.08, WORLD_MATS.darkWood, 0.5, 0.2, 0.25));
    return g;
}

function buildRoundTableMesh(radius) {
    var g = new THREE.Group();
    var top = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.06, 16), WORLD_MATS.tableMat);
    top.position.y = 0.72;
    g.add(top);
    var post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.12, 0.72, 8), WORLD_MATS.darkWood);
    post.position.y = 0.36;
    g.add(post);
    return g;
}

function buildWaterCoolerMesh() {
    var g = new THREE.Group();
    g.add(worldBox(0.35, 1.0, 0.35, WORLD_MATS.machineMat, 0, 0.5, 0));
    var jug = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.4, 10), WORLD_MATS.coolerMat);
    jug.position.y = 1.2;
    g.add(jug);
    return g;
}

function buildPlantMesh() {
    var g = new THREE.Group();
    var pot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.16, 0.35, 10), WORLD_MATS.plantPotMat);
    pot.position.y = 0.17;
    g.add(pot);
    var bush = new THREE.Mesh(new THREE.SphereGeometry(0.38, 10, 8), WORLD_MATS.plantMat);
    bush.position.y = 0.75;
    g.add(bush);
    return g;
}

function buildConferenceTableMesh() {
    var g = new THREE.Group();
    g.add(worldBox(3.0, 0.07, 1.3, WORLD_MATS.tableMat, 0, 0.73, 0));
    g.add(worldBox(0.12, 0.73, 1.1, WORLD_MATS.darkWood, -1.25, 0.36, 0));
    g.add(worldBox(0.12, 0.73, 1.1, WORLD_MATS.darkWood, 1.25, 0.36, 0));
    return g;
}

// ---------- call panel ----------
function buildArrowShapeMesh(up, mat) {
    var s = 0.13;
    var shape = new THREE.Shape();
    if (up) {
        shape.moveTo(-s, -s); shape.lineTo(s, -s); shape.lineTo(0, s);
    } else {
        shape.moveTo(-s, s); shape.lineTo(s, s); shape.lineTo(0, -s);
    }
    shape.closePath();
    return new THREE.Mesh(new THREE.ShapeGeometry(shape), mat);
}

function buildCallPanel() {
    var panel = new THREE.Group();
    var plate = worldBox(0.55, 1.4, 0.05, WORLD_MATS.panelMat, 0, 0, 0);
    panel.add(plate);
    var upArrow = buildArrowShapeMesh(true, WORLD_MATS.arrowOff);
    upArrow.position.set(0, 0.18, 0.04);
    panel.add(upArrow);
    var downArrow = buildArrowShapeMesh(false, WORLD_MATS.arrowOff);
    downArrow.position.set(0, -0.18, 0.04);
    panel.add(downArrow);
    var disp = makeTextDisplay(256);
    var dispMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(0.45, 0.45),
        new THREE.MeshBasicMaterial({ map: disp.texture })
    );
    dispMesh.position.set(0, 0.55, 0.04);
    panel.add(dispMesh);
    panel.userData.setUp = function(on) {
        upArrow.material = on ? WORLD_MATS.arrowOn : WORLD_MATS.arrowOff;
    };
    panel.userData.setDown = function(on) {
        downArrow.material = on ? WORLD_MATS.arrowOn : WORLD_MATS.arrowOff;
    };
    panel.userData.setIndicator = function(text) {
        disp.draw(text);
    };
    return panel;
}

function buildShaftIndicator() {
    var disp = makeTextDisplay(256);
    var mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(0.9, 0.9),
        new THREE.MeshBasicMaterial({ map: disp.texture })
    );
    mesh.userData.setIndicator = function(text) { disp.draw(text); };
    return mesh;
}

// ---------- navigation ----------
function bfsPath(nodes, fromName, toName) {
    if (!nodes[fromName] || !nodes[toName]) { return []; }
    if (fromName === toName) { return [nodes[toName].pos.clone()]; }
    var queue = [fromName];
    var cameFrom = {};
    cameFrom[fromName] = null;
    while (queue.length > 0) {
        var cur = queue.shift();
        if (cur === toName) { break; }
        var adj = nodes[cur].adj;
        for (var i = 0; i < adj.length; i++) {
            var nb = adj[i];
            if (!(nb in cameFrom) && nodes[nb]) {
                cameFrom[nb] = cur;
                queue.push(nb);
            }
        }
    }
    if (!(toName in cameFrom)) { return []; }
    var pathNames = [];
    var walker = toName;
    while (walker !== null) {
        pathNames.push(walker);
        walker = cameFrom[walker];
    }
    pathNames.reverse();
    var out = [];
    for (var k = 0; k < pathNames.length; k++) {
        out.push(nodes[pathNames[k]].pos.clone());
    }
    return out;
}

function nearestNodeName(nodes, worldPos) {
    var best = null;
    var bestD = Infinity;
    var names = Object.keys(nodes);
    for (var i = 0; i < names.length; i++) {
        var n = nodes[names[i]];
        var dx = n.pos.x - worldPos.x;
        var dz = n.pos.z - worldPos.z;
        var d = dx * dx + dz * dz;
        if (d < bestD) { bestD = d; best = names[i]; }
    }
    return best;
}

// ---------- world builder ----------
function createWorld(scene) {
    var FH = WORLD.FLOOR_HEIGHT;
    var FC = WORLD.FLOOR_COUNT;
    var BW = WORLD.BUILDING_WIDTH;
    var BD = WORLD.BUILDING_DEPTH;
    var HW = BW / 2;   // 11
    var HD = BD / 2;   // 9
    var buildingGroup = new THREE.Group();
    buildingGroup.renderOrder = 0;

    // ---- ground slab + roof (solid gray) ----
    var ground = worldBox(BW + 10, 0.3, BD + 12, WORLD_MATS.solidGray, 0, -0.15, 1.5);
    buildingGroup.add(ground);
    var roofY = FC * FH;
    buildingGroup.add(worldBox(BW, 0.2, BD, WORLD_MATS.solidGray, 0, roofY + 0.1, 0));

    // sidewalk slab outside the front wall
    buildingGroup.add(worldBox(10, 0.12, 5, WORLD_MATS.sidewalk, 0, 0.06, HD + 2.6));

    // ---- intermediate floor slabs: 4 strips around the 3x3 shaft hole ----
    var SH = WORLD.SHAFT_WIDTH / 2; // 1.5
    for (var fs = 1; fs < FC; fs++) {
        var sy = fs * FH - 0.06;
        // back strip (z from -HD to -SH)
        buildingGroup.add(worldBox(BW, 0.12, HD - SH, WORLD_MATS.slab, 0, sy, -(SH + (HD - SH) / 2)));
        // front strip (z from SH to HD)
        buildingGroup.add(worldBox(BW, 0.12, HD - SH, WORLD_MATS.slab, 0, sy, SH + (HD - SH) / 2));
        // left strip
        buildingGroup.add(worldBox(HW - SH, 0.12, WORLD.SHAFT_DEPTH, WORLD_MATS.slab, -(SH + (HW - SH) / 2), sy, 0));
        // right strip
        buildingGroup.add(worldBox(HW - SH, 0.12, WORLD.SHAFT_DEPTH, WORLD_MATS.slab, SH + (HW - SH) / 2, sy, 0));
    }

    // ---- outer walls ----
    var totalH = FC * FH;
    // back wall
    buildingGroup.add(worldBox(BW, totalH, 0.1, WORLD_MATS.outerWall, 0, totalH / 2, -HD));
    // side walls
    buildingGroup.add(worldBox(0.1, totalH, BD, WORLD_MATS.outerWall, -HW, totalH / 2, 0));
    buildingGroup.add(worldBox(0.1, totalH, BD, WORLD_MATS.outerWall, HW, totalH / 2, 0));
    // front wall: two full-height side panels + one panel above the floor-0 gap
    var sidePanelW = HW - 1.5; // 9.5
    buildingGroup.add(worldBox(sidePanelW, totalH, 0.1, WORLD_MATS.outerWall, -(1.5 + sidePanelW / 2), totalH / 2, HD));
    buildingGroup.add(worldBox(sidePanelW, totalH, 0.1, WORLD_MATS.outerWall, 1.5 + sidePanelW / 2, totalH / 2, HD));
    buildingGroup.add(worldBox(3, totalH - FH, 0.1, WORLD_MATS.outerWall, 0, FH + (totalH - FH) / 2, HD));

    // glass entrance doors: visual-only, swung open so the 3-unit gap stays clear
    var doorL = worldBox(1.4, 2.6, 0.06, WORLD_MATS.glassDoor, 0.7, 1.3, 0);
    var hingeL = new THREE.Group();
    hingeL.position.set(-1.5, 0, HD);
    hingeL.rotation.y = -1.25;
    hingeL.add(doorL);
    buildingGroup.add(hingeL);
    var doorR = worldBox(1.4, 2.6, 0.06, WORLD_MATS.glassDoor, -0.7, 1.3, 0);
    var hingeR = new THREE.Group();
    hingeR.position.set(1.5, 0, HD);
    hingeR.rotation.y = 1.25;
    hingeR.add(doorR);
    buildingGroup.add(hingeR);

    // ---- shaft walls (back and sides, full height, transparent) ----
    buildingGroup.add(worldBox(WORLD.SHAFT_WIDTH, totalH, 0.08, WORLD_MATS.innerWall, 0, totalH / 2, -SH));
    buildingGroup.add(worldBox(0.08, totalH, WORLD.SHAFT_DEPTH, WORLD_MATS.innerWall, -SH, totalH / 2, 0));
    buildingGroup.add(worldBox(0.08, totalH, WORLD.SHAFT_DEPTH, WORLD_MATS.innerWall, SH, totalH / 2, 0));

    // helper: interior wall along X with doorway gaps
    function addInteriorWallX(floorY, z, x0, x1, gaps) {
        var segs = [[x0, x1]];
        for (var gi = 0; gi < gaps.length; gi++) {
            var g = gaps[gi];
            var next = [];
            for (var si = 0; si < segs.length; si++) {
                var s0 = segs[si][0], s1 = segs[si][1];
                if (g - 0.6 > s0 && g + 0.6 < s1) {
                    next.push([s0, g - 0.6]);
                    next.push([g + 0.6, s1]);
                } else {
                    next.push([s0, s1]);
                }
            }
            segs = next;
        }
        for (var wi = 0; wi < segs.length; wi++) {
            var w0 = segs[wi][0], w1 = segs[wi][1];
            if (w1 - w0 < 0.05) { continue; }
            buildingGroup.add(worldBox(w1 - w0, FH - 0.2, 0.08, WORLD_MATS.innerWall,
                (w0 + w1) / 2, floorY + FH / 2 - 0.1, z));
        }
    }
    function addInteriorWallZ(floorY, x, z0, z1, gaps) {
        var segs = [[z0, z1]];
        for (var gi = 0; gi < gaps.length; gi++) {
            var g = gaps[gi];
            var next = [];
            for (var si = 0; si < segs.length; si++) {
                var s0 = segs[si][0], s1 = segs[si][1];
                if (g - 0.6 > s0 && g + 0.6 < s1) {
                    next.push([s0, g - 0.6]);
                    next.push([g + 0.6, s1]);
                } else {
                    next.push([s0, s1]);
                }
            }
            segs = next;
        }
        for (var wi = 0; wi < segs.length; wi++) {
            var w0 = segs[wi][0], w1 = segs[wi][1];
            if (w1 - w0 < 0.05) { continue; }
            buildingGroup.add(worldBox(0.08, FH - 0.2, w1 - w0, WORLD_MATS.innerWall,
                x, floorY + FH / 2 - 0.1, (w0 + w1) / 2));
        }
    }

    var floors = [];

    for (var fn = 0; fn < FC; fn++) {
        var fy = fn * FH;
        var nodes = {};
        var sitTargets = {};
        var desks = [];

        function addNode(name, x, z) {
            nodes[name] = { pos: new THREE.Vector3(x, fy, z), adj: [] };
        }
        function link(a, b) {
            if (nodes[a] && nodes[b]) {
                if (nodes[a].adj.indexOf(b) === -1) { nodes[a].adj.push(b); }
                if (nodes[b].adj.indexOf(a) === -1) { nodes[b].adj.push(a); }
            }
        }
        function addSit(name, facing) { sitTargets[name] = { sit: true, facing: facing }; }
        function addStand(name, facing) { sitTargets[name] = { sit: false, facing: facing }; }

        // hallway ring around the shaft (S = front / +Z)
        addNode("hallS", 0, 3.2);
        addNode("hallSE", 4, 3.2);
        addNode("hallE", 4, 0);
        addNode("hallNE", 4, -3.2);
        addNode("hallN", 0, -3.2);
        addNode("hallNW", -4, -3.2);
        addNode("hallW", -4, 0);
        addNode("hallSW", -4, 3.2);
        addNode("elevWait", 0, 2.4);
        link("hallS", "hallSE"); link("hallSE", "hallE"); link("hallE", "hallNE");
        link("hallNE", "hallN"); link("hallN", "hallNW"); link("hallNW", "hallW");
        link("hallW", "hallSW"); link("hallSW", "hallS");
        link("elevWait", "hallS");

        // call panel next to the shaft, facing +Z
        var callPanel = buildCallPanel();
        callPanel.position.set(2.15, fy + 1.45, SH + 0.06);
        buildingGroup.add(callPanel);

        // shaft-side indicator above the doors
        var shaftInd = buildShaftIndicator();
        shaftInd.position.set(0, fy + 2.95, SH + 0.06);
        buildingGroup.add(shaftInd);

        if (fn === 0) {
            // =========== LOBBY ===========
            addNode("outside", 0, 12);
            addNode("front_door_threshold", 0, 9.35);
            addNode("entrance", 0, 7.4);
            addNode("lobby_center", 0, 4.8);
            link("outside", "front_door_threshold");
            link("front_door_threshold", "entrance");
            link("entrance", "lobby_center");
            link("lobby_center", "elevWait");
            link("entrance", "elevWait");
            link("lobby_center", "hallS");
            link("lobby_center", "hallSE");
            link("lobby_center", "hallSW");
            addStand("outside", 0);
            addStand("front_door_threshold", 0);
            addStand("entrance", 0);
            addStand("lobby_center", 0);

            // cafe counter on the left wall
            var counter = new THREE.Group();
            counter.add(worldBox(0.9, 0.95, 4.0, WORLD_MATS.counterMat, 0, 0.48, 0));
            counter.add(worldBox(1.05, 0.08, 4.15, WORLD_MATS.counterTopMat, 0, 0.99, 0));
            counter.add(worldBox(0.5, 0.5, 0.5, WORLD_MATS.machineMat, 0, 1.28, -1.2));
            counter.add(worldBox(0.6, 0.3, 0.8, WORLD_MATS.pastryMat, 0, 1.18, 0.8));
            counter.position.set(-10.2, fy, 5);
            buildingGroup.add(counter);
            addNode("cafe_order", -9.2, 5);
            addStand("cafe_order", Math.PI / 2 * 3); // face -X toward counter
            addNode("cafe_door", -4.8, 3.2);
            addStand("cafe_door", 0);
            link("cafe_door", "hallSW");
            link("cafe_door", "cafe_order");

            // 4 bistro tables with 2 chairs each
            var bistroPos = [[-7.6, 1.6], [-7.6, -1.6], [-9.2, 0], [-5.8, 0]];
            var bistroSeatIdx = 0;
            for (var bt = 0; bt < bistroPos.length; bt++) {
                var bx = bistroPos[bt][0], bz = bistroPos[bt][1];
                var tbl = buildRoundTableMesh(0.45);
                tbl.position.set(bx, fy, bz);
                buildingGroup.add(tbl);
                var seatOffsets = [[0, 0.85, Math.PI], [0, -0.85, 0]];
                for (var so = 0; so < seatOffsets.length; so++) {
                    var sx = bx + seatOffsets[so][0];
                    var sz = bz + seatOffsets[so][1];
                    var facing = seatOffsets[so][2];
                    var ch = buildChairMesh(facing);
                    ch.position.set(sx, fy, sz);
                    buildingGroup.add(ch);
                    var seatName = "bistro_seat" + bistroSeatIdx;
                    addNode(seatName, sx, sz);
                    addSit(seatName, facing);
                    link(seatName, "cafe_door");
                    bistroSeatIdx++;
                }
            }
            link("cafe_order", "bistro_seat4");

            // front lounge (right side, z > 3)
            var flCouch = buildCouchMesh();
            flCouch.position.set(7, fy, 8.0);
            flCouch.rotation.y = Math.PI; // backrest toward +Z wall, opens toward -Z
            buildingGroup.add(flCouch);
            var flTable = buildCoffeeTableMesh();
            flTable.position.set(7, fy, 6.4);
            buildingGroup.add(flTable);
            var flChairA = buildArmchairMesh();
            flChairA.position.set(5.2, fy, 5.2);
            flChairA.rotation.y = 0.5;
            buildingGroup.add(flChairA);
            var flChairB = buildArmchairMesh();
            flChairB.position.set(8.8, fy, 5.2);
            flChairB.rotation.y = -0.5;
            buildingGroup.add(flChairB);
            addNode("flounge_couch", 7, 8.0);
            addSit("flounge_couch", Math.PI);
            addNode("flounge_chair0", 5.2, 5.2);
            addSit("flounge_chair0", 0.5);
            addNode("flounge_chair1", 8.8, 5.2);
            addSit("flounge_chair1", -0.5);
            addNode("flounge_center", 7, 4.2);
            addStand("flounge_center", 0);
            link("flounge_center", "hallSE");
            link("flounge_center", "flounge_couch");
            link("flounge_center", "flounge_chair0");
            link("flounge_center", "flounge_chair1");
            link("flounge_center", "lobby_center");

            // back lounge (z < 0): two couches facing each other
            var blN = buildCouchMesh();
            blN.position.set(7, fy, -6.6);
            blN.rotation.y = 0; // backrest at -Z, opens toward +Z
            buildingGroup.add(blN);
            var blS = buildCouchMesh();
            blS.position.set(7, fy, -3.4);
            blS.rotation.y = Math.PI;
            buildingGroup.add(blS);
            var blTable = buildCoffeeTableMesh();
            blTable.position.set(7, fy, -5.0);
            buildingGroup.add(blTable);
            addNode("back_lounge_N", 7, -6.6);
            addSit("back_lounge_N", 0);
            addNode("back_lounge_S", 7, -3.4);
            addSit("back_lounge_S", Math.PI);
            addNode("back_lounge_center", 5.4, -5.0);
            addStand("back_lounge_center", 0);
            link("back_lounge_center", "hallNE");
            link("back_lounge_center", "back_lounge_N");
            link("back_lounge_center", "back_lounge_S");

            // conversation pit (back-left): round table + 4 armchairs
            var pitTable = buildRoundTableMesh(0.7);
            pitTable.position.set(-7, fy, -5);
            buildingGroup.add(pitTable);
            var pitSpots = [
                ["pit_N", -7, -6.6, 0],
                ["pit_S", -7, -3.4, Math.PI],
                ["pit_E", -5.4, -5, -Math.PI / 2],
                ["pit_W", -8.6, -5, Math.PI / 2]
            ];
            for (var pi = 0; pi < pitSpots.length; pi++) {
                var ps = pitSpots[pi];
                var pchair = buildArmchairMesh();
                pchair.position.set(ps[1], fy, ps[2]);
                pchair.rotation.y = ps[3];
                buildingGroup.add(pchair);
                addNode(ps[0], ps[1], ps[2]);
                addSit(ps[0], ps[3]);
            }
            addNode("pit_center", -4.6, -5);
            addStand("pit_center", 0);
            link("pit_center", "hallNW");
            link("pit_center", "pit_N"); link("pit_center", "pit_S");
            link("pit_center", "pit_E"); link("pit_center", "pit_W");

            // two water coolers
            var wcFront = buildWaterCoolerMesh();
            wcFront.position.set(10.2, fy, 2.5);
            buildingGroup.add(wcFront);
            addNode("lobby_wc_front", 9.4, 2.5);
            addStand("lobby_wc_front", Math.PI / 2);
            link("lobby_wc_front", "hallSE");
            var wcBack = buildWaterCoolerMesh();
            wcBack.position.set(10.2, fy, -1.5);
            buildingGroup.add(wcBack);
            addNode("lobby_wc_back", 9.4, -1.5);
            addStand("lobby_wc_back", Math.PI / 2);
            link("lobby_wc_back", "hallE");

            // reception desk (tucked to the side)
            var recDesk = buildDeskMesh();
            recDesk.position.set(-3.5, fy, 6.2);
            recDesk.rotation.y = Math.PI / 2;
            buildingGroup.add(recDesk);
            addNode("reception", -2.4, 6.2);
            addStand("reception", -Math.PI / 2);
            link("reception", "entrance");
            link("reception", "lobby_center");

            // info kiosk near the entrance
            var kioskMesh = worldBox(0.5, 1.5, 0.5, WORLD_MATS.machineMat, 2.8, fy + 0.75, 7.2);
            buildingGroup.add(kioskMesh);
            addNode("kiosk", 2.1, 7.2);
            addStand("kiosk", Math.PI / 2);
            link("kiosk", "entrance");

            // loiter waypoints
            var loiters = [
                ["lobby_stand_center", 2.4, 4.4],
                ["lobby_stand_NE", 4.4, -7.2],
                ["lobby_stand_NW", -4.4, -7.4],
                ["lobby_stand_midE", 5.6, 0.6],
                ["lobby_stand_midW", -4.6, -1.6],
                ["lobby_stand_entry", -1.9, 8.0]
            ];
            for (var li = 0; li < loiters.length; li++) {
                var lo = loiters[li];
                addNode(lo[0], lo[1], lo[2]);
                addStand(lo[0], Math.random() * Math.PI * 2);
            }
            link("lobby_stand_center", "lobby_center");
            link("lobby_stand_NE", "hallNE");
            link("lobby_stand_NW", "hallNW");
            link("lobby_stand_midE", "hallE");
            link("lobby_stand_midE", "hallSE");
            link("lobby_stand_midW", "hallW");
            link("lobby_stand_entry", "entrance");

            // potted plants by the entrance
            var plantA = buildPlantMesh();
            plantA.position.set(2.3, fy, 8.5);
            buildingGroup.add(plantA);
            var plantB = buildPlantMesh();
            plantB.position.set(-2.6, fy, 8.6);
            buildingGroup.add(plantB);

            floors.push({
                floorNumber: fn, nodes: nodes, callPanel: callPanel,
                shaftIndicator: shaftInd, desks: desks, sitTargets: sitTargets,
                entranceSpot: nodes["entrance"].pos.clone(),
                cafeSpots: ["bistro_seat0", "bistro_seat1", "bistro_seat2", "bistro_seat3",
                    "bistro_seat4", "bistro_seat5", "bistro_seat6", "bistro_seat7"],
                loungeSpots: ["flounge_couch", "flounge_chair0", "flounge_chair1"],
                loiterSpots: ["lobby_stand_center", "lobby_stand_NE", "lobby_stand_NW",
                    "lobby_stand_midE", "lobby_stand_midW", "lobby_stand_entry"]
            });
        } else {
            // =========== OFFICE FLOOR ===========
            // interior walls: offices along back wall (z in [-9,-3])
            var officeCenters = [-8.25, -2.75, 2.75, 8.25];
            var officeLetters = ["A", "B", "C", "D"];
            addInteriorWallX(fy, -3, -HW, HW, officeCenters); // office fronts with door gaps
            addInteriorWallZ(fy, -5.5, -HD, -3, []);
            addInteriorWallZ(fy, 0, -HD, -3, []);
            addInteriorWallZ(fy, 5.5, -HD, -3, []);
            // conference room front-left
            addInteriorWallX(fy, 3, -HW, -3, [-4]);
            addInteriorWallZ(fy, -3, 3, HD, []);
            // lounge front-right
            addInteriorWallX(fy, 3, 3, HW, [4]);
            addInteriorWallZ(fy, 3, 3, HD, []);

            // offices with desk + chair
            var doorCorner = ["hallNW", "hallN", "hallN", "hallNE"];
            for (var oi = 0; oi < 4; oi++) {
                var ocx = officeCenters[oi];
                var letter = officeLetters[oi];
                var deskMesh = buildDeskMesh();
                deskMesh.position.set(ocx, fy, -7.4);
                buildingGroup.add(deskMesh);
                var deskChair = buildChairMesh(Math.PI); // opens toward -Z (monitor)
                deskChair.position.set(ocx, fy, -6.3);
                buildingGroup.add(deskChair);
                var doorName = "office" + letter + "_door";
                var deskName = "office" + letter + "_desk";
                addNode(doorName, ocx, -3.6);
                addStand(doorName, Math.PI);
                addNode(deskName, ocx, -6.3);
                addSit(deskName, Math.PI);
                link(doorName, doorCorner[oi]);
                link(doorName, deskName);
                desks.push({
                    id: letter, wpName: deskName, doorWpName: doorName,
                    pos: nodes[deskName].pos.clone()
                });
            }
            link("officeA_door", "hallW");
            link("officeD_door", "hallE");

            // conference room
            var confTable = buildConferenceTableMesh();
            confTable.position.set(-7, fy, 6);
            buildingGroup.add(confTable);
            addNode("conf_door", -4, 3.7);
            addStand("conf_door", 0);
            addNode("conf_center", -5.2, 5.4);
            addStand("conf_center", 0);
            link("conf_door", "hallSW");
            link("conf_door", "conf_center");
            var confSeatDefs = [
                [-8.2, 4.85, 0], [-5.8, 4.85, 0],
                [-8.2, 7.15, Math.PI], [-5.8, 7.15, Math.PI]
            ];
            for (var ci = 0; ci < 4; ci++) {
                var cs = confSeatDefs[ci];
                var confChair = buildChairMesh(cs[2]);
                confChair.position.set(cs[0], fy, cs[1]);
                buildingGroup.add(confChair);
                var csName = "conf_seat" + ci;
                addNode(csName, cs[0], cs[1]);
                addSit(csName, cs[2]);
                link(csName, "conf_center");
            }

            // lounge / break area
            var lgCouch = buildCouchMesh();
            lgCouch.position.set(7, fy, 8.0);
            lgCouch.rotation.y = Math.PI;
            buildingGroup.add(lgCouch);
            var lgTable = buildCoffeeTableMesh();
            lgTable.position.set(7, fy, 6.4);
            buildingGroup.add(lgTable);
            var lgChairA = buildArmchairMesh();
            lgChairA.position.set(5.2, fy, 5.0);
            lgChairA.rotation.y = 0.4;
            buildingGroup.add(lgChairA);
            var lgChairB = buildArmchairMesh();
            lgChairB.position.set(8.8, fy, 5.0);
            lgChairB.rotation.y = -0.4;
            buildingGroup.add(lgChairB);
            var lgCooler = buildWaterCoolerMesh();
            lgCooler.position.set(10.2, fy, 4.2);
            buildingGroup.add(lgCooler);
            var lgPlant = buildPlantMesh();
            lgPlant.position.set(3.8, fy, 8.4);
            buildingGroup.add(lgPlant);
            addNode("lounge_door", 4, 3.7);
            addStand("lounge_door", 0);
            addNode("lounge_center", 7, 4.4);
            addStand("lounge_center", 0);
            link("lounge_door", "hallSE");
            link("lounge_door", "lounge_center");
            addNode("lounge_spot0", 7, 8.0);
            addSit("lounge_spot0", Math.PI);
            addNode("lounge_spot1", 5.2, 5.0);
            addSit("lounge_spot1", 0.4);
            addNode("lounge_spot2", 8.8, 5.0);
            addSit("lounge_spot2", -0.4);
            link("lounge_spot0", "lounge_center");
            link("lounge_spot1", "lounge_center");
            link("lounge_spot2", "lounge_center");
            addNode("water_cooler", 9.4, 4.2);
            addStand("water_cooler", Math.PI / 2);
            link("water_cooler", "lounge_center");

            // hallway loiter spots
            addNode("hall_stand_N", 2.1, -2.6);
            addStand("hall_stand_N", Math.PI);
            link("hall_stand_N", "hallNE");
            link("hall_stand_N", "hallN");
            addNode("hall_stand_S", -2.2, 3.2);
            addStand("hall_stand_S", 0);
            link("hall_stand_S", "hallS");
            link("hall_stand_S", "hallSW");

            floors.push({
                floorNumber: fn, nodes: nodes, callPanel: callPanel,
                shaftIndicator: shaftInd, desks: desks, sitTargets: sitTargets,
                loungeSpots: ["lounge_spot0", "lounge_spot1", "lounge_spot2"]
            });
        }
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
