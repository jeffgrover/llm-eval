var WORLD = {
    FLOOR_HEIGHT: 3.4, FLOOR_COUNT: 6,
    BUILDING_WIDTH: 22, BUILDING_DEPTH: 18,
    SHAFT_WIDTH: 3, SHAFT_DEPTH: 3,
    PERSON_R: 0.4
};

function bfsPath(nodes, fromName, toName) {
    if (!nodes[fromName] || !nodes[toName]) return [];
    if (fromName === toName) return [nodes[fromName].pos.clone()];
    var queue = [[fromName]];
    var visited = {};
    visited[fromName] = true;
    while (queue.length > 0) {
        var path = queue.shift();
        var cur = path[path.length - 1];
        var neighbors = nodes[cur].links || [];
        for (var i = 0; i < neighbors.length; i++) {
            var nb = neighbors[i];
            if (visited[nb]) continue;
            visited[nb] = true;
            var newPath = path.slice();
            newPath.push(nb);
            if (nb === toName) {
                var result = [];
                for (var j = 0; j < newPath.length; j++) result.push(nodes[newPath[j]].pos.clone());
                return result;
            }
            queue.push(newPath);
        }
    }
    return [];
}

function createTextTexture(text, fgColor, bgColor) {
    var canvas = document.createElement("canvas");
    canvas.width = 256; canvas.height = 256;
    var ctx = canvas.getContext("2d");
    ctx.fillStyle = bgColor || "#050505";
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = fgColor || "#ffbb22";
    ctx.font = "bold 150px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = fgColor || "#ffbb22";
    ctx.shadowBlur = 18;
    ctx.fillText(text, 128, 128);
    var tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = 4;
    tex._canvas = canvas;
    tex._ctx = ctx;
    tex._lastText = text;
    tex._fgColor = fgColor;
    tex._bgColor = bgColor;
    return tex;
}

function updateTextTexture(tex, text) {
    if (tex._lastText === text) return;
    tex._lastText = text;
    var ctx = tex._ctx;
    ctx.fillStyle = tex._bgColor || "#050505";
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = tex._fgColor || "#ffbb22";
    ctx.font = "bold 150px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = tex._fgColor || "#ffbb22";
    ctx.shadowBlur = 18;
    ctx.fillText(text, 128, 128);
    tex.needsUpdate = true;
}

function makeCallPanel(floorNum) {
    var grp = new THREE.Group();
    var plateGeo = new THREE.BoxGeometry(0.55, 1.4, 0.05);
    var plate = new THREE.Mesh(plateGeo, new THREE.MeshLambertMaterial({ color: 0x444444 }));
    grp.add(plate);

    function makeArrow(y, dir) {
        var shape = new THREE.Shape();
        var hw = 0.13, hh = 0.12;
        if (dir > 0) {
            shape.moveTo(0, hh); shape.lineTo(-hw, -hh); shape.lineTo(hw, -hh); shape.lineTo(0, hh);
        } else {
            shape.moveTo(0, -hh); shape.lineTo(-hw, hh); shape.lineTo(hw, hh); shape.lineTo(0, -hh);
        }
        var geo = new THREE.ShapeGeometry(shape);
        var matOff = new THREE.MeshLambertMaterial({ color: 0x333333 });
        var matOn = new THREE.MeshLambertMaterial({ color: 0x33ff33, emissive: 0x33ff33, emissiveIntensity: 0.8 });
        var mesh = new THREE.Mesh(geo, matOff);
        mesh.position.set(0, y, 0.03);
        mesh.userData.matOff = matOff;
        mesh.userData.matOn = matOn;
        grp.add(mesh);
        return mesh;
    }
    var upArrow = makeArrow(0.35, 1);
    var downArrow = makeArrow(-0.05, -1);

    var dispTex = createTextTexture(String(floorNum), "#ffbb22", "#050505");
    var dispGeo = new THREE.PlaneGeometry(0.45, 0.45);
    var dispMat = new THREE.MeshBasicMaterial({ map: dispTex });
    var dispMesh = new THREE.Mesh(dispGeo, dispMat);
    dispMesh.position.set(0, -0.45, 0.04);
    grp.add(dispMesh);

    grp.userData.upArrow = upArrow;
    grp.userData.downArrow = downArrow;
    grp.userData.dispTex = dispTex;
    grp.userData.setUp = function(on) { upArrow.material = on ? upArrow.userData.matOn : upArrow.userData.matOff; };
    grp.userData.setDown = function(on) { downArrow.material = on ? downArrow.userData.matOn : downArrow.userData.matOff; };
    grp.userData.setIndicator = function(text) { updateTextTexture(dispTex, text); };
    return grp;
}

function makeShaftIndicator() {
    var tex = createTextTexture("0", "#ffbb22", "#050505");
    var geo = new THREE.PlaneGeometry(0.9, 0.9);
    var mat = new THREE.MeshBasicMaterial({ map: tex });
    var mesh = new THREE.Mesh(geo, mat);
    mesh.userData.tex = tex;
    mesh.userData.setText = function(t) { updateTextTexture(tex, t); };
    return mesh;
}

function addNodesFloor(nodes, floorY, shaftX, shaftZ) {
    // Hallway ring around shaft
    var off = 2.8;
    var hallDefs = [
        ["hallS", 0, -off], ["hallSE", off, -off], ["hallE", off, 0], ["hallNE", off, off],
        ["hallN", 0, off], ["hallNW", -off, off], ["hallW", -off, 0], ["hallSW", -off, -off]
    ];
    for (var i = 0; i < hallDefs.length; i++) {
        var hd = hallDefs[i];
        nodes[hd[0]] = { pos: new THREE.Vector3(hd[1], floorY + 0.01, hd[2]), links: [] };
    }
    // Ring links
    for (var r = 0; r < hallDefs.length; r++) {
        var a = hallDefs[r][0], b = hallDefs[(r + 1) % hallDefs.length][0];
        nodes[a].links.push(b); nodes[b].links.push(a);
    }
    // elevWait
    nodes.elevWait = { pos: new THREE.Vector3(0, floorY + 0.01, 2.2), links: [] };
    nodes.elevWait.links.push("hallS"); nodes.hallS.links.push("elevWait");
}

function linkBidirectional(nodes, a, b) {
    if (!nodes[a] || !nodes[b]) return;
    if (nodes[a].links.indexOf(b) === -1) nodes[a].links.push(b);
    if (nodes[b].links.indexOf(a) === -1) nodes[b].links.push(a);
}

function createWorld(scene) {
    var BG = new THREE.Group();
    BG.renderOrder = 0;
    scene.add(BG);

    // Sidewalk outside
    var sideWalkGeo = new THREE.BoxGeometry(WORLD.BUILDING_WIDTH + 4, 0.15, 6);
    var sideWalk = new THREE.Mesh(sideWalkGeo, new THREE.MeshLambertMaterial({ color: 0x999999 }));
    sideWalk.position.set(0, -0.08, 12);
    BG.add(sideWalk);

    // Ground slab and roof
    var groundGeo = new THREE.BoxGeometry(WORLD.BUILDING_WIDTH, 0.2, WORLD.BUILDING_DEPTH);
    var groundMat = new THREE.MeshLambertMaterial({ color: 0x888888 });
    var ground = new THREE.Mesh(groundGeo, groundMat);
    ground.position.set(0, -0.1, 0);
    BG.add(ground);

    var roofGeo = new THREE.BoxGeometry(WORLD.BUILDING_WIDTH + 0.5, 0.2, WORLD.BUILDING_DEPTH + 0.5);
    var roof = new THREE.Mesh(roofGeo, new THREE.MeshLambertMaterial({ color: 0x666666 }));
    roof.position.set(0, WORLD.FLOOR_COUNT * WORLD.FLOOR_HEIGHT + 0.1, 0);
    BG.add(roof);

    // Floor slabs with shaft hole (4 strips)
    var shaftHalfW = WORLD.SHAFT_WIDTH / 2, shaftHalfD = WORLD.SHAFT_DEPTH / 2;
    var slabMat = new THREE.MeshLambertMaterial({ color: 0x888888, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide });
    for (var fl = 1; fl < WORLD.FLOOR_COUNT; fl++) {
        var fy = fl * WORLD.FLOOR_HEIGHT;
        // front strip
        var s1 = new THREE.Mesh(new THREE.BoxGeometry(WORLD.BUILDING_WIDTH, 0.12, (WORLD.BUILDING_DEPTH / 2 - shaftHalfD)), slabMat);
        s1.position.set(0, fy, WORLD.BUILDING_DEPTH / 2 / 2 + shaftHalfD / 2);
        BG.add(s1);
        // back strip
        var s2 = new THREE.Mesh(new THREE.BoxGeometry(WORLD.BUILDING_WIDTH, 0.12, (WORLD.BUILDING_DEPTH / 2 - shaftHalfD)), slabMat);
        s2.position.set(0, fy, -WORLD.BUILDING_DEPTH / 2 / 2 - shaftHalfD / 2);
        BG.add(s2);
        // left strip
        var s3 = new THREE.Mesh(new THREE.BoxGeometry((WORLD.BUILDING_WIDTH / 2 - shaftHalfW), 0.12, WORLD.SHAFT_DEPTH), slabMat);
        s3.position.set(-WORLD.BUILDING_WIDTH / 2 / 2 - shaftHalfW / 2, fy, 0);
        BG.add(s3);
        // right strip
        var s4 = new THREE.Mesh(new THREE.BoxGeometry((WORLD.BUILDING_WIDTH / 2 - shaftHalfW), 0.12, WORLD.SHAFT_DEPTH), slabMat);
        s4.position.set(WORLD.BUILDING_WIDTH / 2 / 2 + shaftHalfW / 2, fy, 0);
        BG.add(s4);
    }

    // Outer walls - semi-transparent blue
    var wallMat = new THREE.MeshLambertMaterial({ color: 0x9999ff, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide });
    var totalH = WORLD.FLOOR_COUNT * WORLD.FLOOR_HEIGHT;
    var bw = WORLD.BUILDING_WIDTH, bd = WORLD.BUILDING_DEPTH;

    function addWall(w, h, d, x, y, z) {
        var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
        m.position.set(x, y, z);
        BG.add(m);
    }
    // Back wall full
    addWall(bw, totalH, 0.15, 0, totalH / 2, -bd / 2);
    // Left wall full
    addWall(0.15, totalH, bd, -bw / 2, totalH / 2, 0);
    // Right wall full
    addWall(0.15, totalH, bd, bw / 2, totalH / 2, 0);
    // Front wall: split for entrance gap on floor 0
    var gapW = 3;
    var sideW = (bw - gapW) / 2;
    // floor 0 front wall: left and right segments
    addWall(sideW, WORLD.FLOOR_HEIGHT, 0.15, -bw / 2 + sideW / 2, WORLD.FLOOR_HEIGHT / 2, bd / 2);
    addWall(sideW, WORLD.FLOOR_HEIGHT, 0.15, bw / 2 - sideW / 2, WORLD.FLOOR_HEIGHT / 2, bd / 2);
    // floors 1..N front wall (above gap)
    var upperH = totalH - WORLD.FLOOR_HEIGHT;
    addWall(bw, upperH, 0.15, 0, WORLD.FLOOR_HEIGHT + upperH / 2, bd / 2);

    // Glass doors visual (no collision)
    var doorMat = new THREE.MeshLambertMaterial({ color: 0xaaccff, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide });
    var gd1 = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.2), doorMat);
    gd1.position.set(-0.75, 1.1, bd / 2 + 0.02);
    BG.add(gd1);
    var gd2 = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.2), doorMat);
    gd2.position.set(0.75, 1.1, bd / 2 + 0.02);
    BG.add(gd2);

    // Shaft walls (visual)
    var shaftMat = new THREE.MeshLambertMaterial({ color: 0x555555 });
    for (var sf = 0; sf < WORLD.FLOOR_COUNT; sf++) {
        var sfy = sf * WORLD.FLOOR_HEIGHT;
        // left shaft wall
        var sw1 = new THREE.Mesh(new THREE.BoxGeometry(0.1, WORLD.FLOOR_HEIGHT, WORLD.SHAFT_DEPTH), shaftMat);
        sw1.position.set(-shaftHalfW, sfy + WORLD.FLOOR_HEIGHT / 2, 0);
        BG.add(sw1);
        var sw2 = new THREE.Mesh(new THREE.BoxGeometry(0.1, WORLD.FLOOR_HEIGHT, WORLD.SHAFT_DEPTH), shaftMat);
        sw2.position.set(shaftHalfW, sfy + WORLD.FLOOR_HEIGHT / 2, 0);
        BG.add(sw2);
        var sw3 = new THREE.Mesh(new THREE.BoxGeometry(WORLD.SHAFT_WIDTH, WORLD.FLOOR_HEIGHT, 0.1), shaftMat);
        sw3.position.set(0, sfy + WORLD.FLOOR_HEIGHT / 2, -shaftHalfD);
        BG.add(sw3);
    }

    // Potted plants near entrance
    function addPlant(x, z, floorY) {
        var potGeo = new THREE.CylinderGeometry(0.25, 0.3, 0.4, 8);
        var pot = new THREE.Mesh(potGeo, new THREE.MeshLambertMaterial({ color: 0x885522 }));
        pot.position.set(x, floorY + 0.2, z);
        BG.add(pot);
        var leafGeo = new THREE.SphereGeometry(0.35, 8, 8);
        leafGeo.scale(1, 1.4, 1);
        var leaf = new THREE.Mesh(leafGeo, new THREE.MeshLambertMaterial({ color: 0x228822 }));
        leaf.position.set(x, floorY + 0.7, z);
        BG.add(leaf);
    }
    addPlant(-3, 7, 0);
    addPlant(3, 7, 0);

    // Build floors data
    var floors = [];

    // Helper to create furniture
    function makeDesk(x, z, fy, rotY) {
        rotY = rotY || 0;
        var g = new THREE.Group();
        var top = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.8), new THREE.MeshLambertMaterial({ color: 0x8b6f47 }));
        top.position.set(0, 0.7, 0);
        g.add(top);
        var leg1 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.7, 0.06), new THREE.MeshLambertMaterial({ color: 0x5a3e1b }));
        leg1.position.set(-0.6, 0.35, -0.3); g.add(leg1);
        var leg2 = leg1.clone(); leg2.position.set(0.6, 0.35, -0.3); g.add(leg2);
        var leg3 = leg1.clone(); leg3.position.set(-0.6, 0.35, 0.3); g.add(leg3);
        var leg4 = leg1.clone(); leg4.position.set(0.6, 0.35, 0.3); g.add(leg4);
        // monitor
        var mon = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.05), new THREE.MeshLambertMaterial({ color: 0x111111 }));
        mon.position.set(0, 0.9, -0.25);
        g.add(mon);
        g.position.set(x, fy, z);
        g.rotation.y = rotY;
        BG.add(g);
        return g;
    }
    function makeChair(x, z, fy, rotY) {
        var g = new THREE.Group();
        var seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.5), new THREE.MeshLambertMaterial({ color: 0x444488 }));
        seat.position.set(0, 0.4, 0); g.add(seat);
        var back = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.06), new THREE.MeshLambertMaterial({ color: 0x444488 }));
        back.position.set(0, 0.65, -0.22); g.add(back);
        g.position.set(x, fy, z);
        g.rotation.y = rotY;
        BG.add(g);
        return g;
    }
    function makeCouch(x, z, fy, rotY) {
        var g = new THREE.Group();
        var base = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.35, 0.7), new THREE.MeshLambertMaterial({ color: 0x885544 }));
        base.position.set(0, 0.2, 0); g.add(base);
        var bk = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 0.12), new THREE.MeshLambertMaterial({ color: 0x885544 }));
        bk.position.set(0, 0.5, -0.29); g.add(bk);
        g.position.set(x, fy, z); g.rotation.y = rotY; BG.add(g); return g;
    }
    function makeTable(x, z, fy, w, d) {
        w = w || 0.7; d = d || 0.5;
        var g = new THREE.Group();
        var top = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, d), new THREE.MeshLambertMaterial({ color: 0x6b4c2a }));
        top.position.set(0, 0.35, 0); g.add(top);
        g.position.set(x, fy, z); BG.add(g); return g;
    }
    function makeWaterCooler(x, z, fy) {
        var g = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.9, 8), new THREE.MeshLambertMaterial({ color: 0x88ccff }));
        g.position.set(x, fy + 0.45, z); BG.add(g);
    }
    function interiorWall(x, z, w, h, d) {
        var mat2 = new THREE.MeshLambertMaterial({ color: 0xbbc5e6, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide });
        var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat2);
        m.position.set(x, z, 0); // placeholder misuse - fix below
        return m;
    }

    // Interior walls helper
    function addInteriorWall(x, y, z, w, h, d) {
        var mat2 = new THREE.MeshLambertMaterial({ color: 0xbbc5e6, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide });
        var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat2);
        m.position.set(x, y, z); BG.add(m);
    }

    for (var fi = 0; fi < WORLD.FLOOR_COUNT; fi++) {
        var floorY = fi * WORLD.FLOOR_HEIGHT;
        var nodes = {};
        var sitTargets = {};
        var desks = [];

        addNodesFloor(nodes, floorY, 0, 0);

        if (fi === 0) {
            // Lobby nodes
            nodes.outside = { pos: new THREE.Vector3(0, 0.01, 12), links: [] };
            nodes.front_door_threshold = { pos: new THREE.Vector3(0, 0.01, 9.35), links: [] };
            nodes.entrance = { pos: new THREE.Vector3(0, 0.01, 7.4), links: [] };
            nodes.lobby_center = { pos: new THREE.Vector3(0, 0.01, 4.5), links: [] };
            linkBidirectional(nodes, "outside", "front_door_threshold");
            linkBidirectional(nodes, "front_door_threshold", "entrance");
            linkBidirectional(nodes, "entrance", "lobby_center");
            linkBidirectional(nodes, "lobby_center", "elevWait");

            // Cafe
            nodes.cafe_order = { pos: new THREE.Vector3(-8.5, 0.01, 4), links: [] };
            linkBidirectional(nodes, "cafe_order", "hallSW");
            // Cafe counter visual
            var cc = new THREE.Mesh(new THREE.BoxGeometry(3, 0.9, 0.6), new THREE.MeshLambertMaterial({ color: 0x8b6f47 }));
            cc.position.set(-9, floorY + 0.45, 3); BG.add(cc);
            var ccTop = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.08, 0.65), new THREE.MeshLambertMaterial({ color: 0x444444 }));
            ccTop.position.set(-9, floorY + 0.92, 3); BG.add(ccTop);
            // Bistro tables
            var bistroPos = [[-7, 1.5], [-7, 5], [-8, -1], [-6, -2]];
            for (var bi = 0; bi < bistroPos.length; bi++) {
                var bx = bistroPos[bi][0], bz = bistroPos[bi][1];
                makeTable(bx, bz, floorY, 0.6, 0.6);
                var cname1 = "bistro_chair_" + bi + "_a";
                var cname2 = "bistro_chair_" + bi + "_b";
                nodes[cname1] = { pos: new THREE.Vector3(bx - 0.7, floorY + 0.01, bz), links: [] };
                nodes[cname2] = { pos: new THREE.Vector3(bx + 0.7, floorY + 0.01, bz), links: [] };
                linkBidirectional(nodes, cname1, "hallNW");
                linkBidirectional(nodes, cname2, "hallNW");
                sitTargets[cname1] = { sit: true, facing: 0 };
                sitTargets[cname2] = { sit: true, facing: Math.PI };
                makeChair(bx - 0.7, bz, floorY, 0);
                makeChair(bx + 0.7, bz, floorY, Math.PI);
            }
            sitTargets.cafe_order = { sit: false, facing: -Math.PI / 2 };

            // Front lounge (right side)
            makeCouch(7, 5, floorY, -Math.PI / 2);
            makeTable(5.5, 5, floorY, 0.8, 0.5);
            makeChair(5.5, 6.2, floorY, Math.PI);
            makeChair(5.5, 3.8, floorY, 0);
            nodes.front_lounge_couch = { pos: new THREE.Vector3(7, floorY + 0.01, 5), links: [] };
            nodes.front_lounge_chair1 = { pos: new THREE.Vector3(5.5, floorY + 0.01, 6.2), links: [] };
            nodes.front_lounge_chair2 = { pos: new THREE.Vector3(5.5, floorY + 0.01, 3.8), links: [] };
            linkBidirectional(nodes, "front_lounge_couch", "hallNE");
            linkBidirectional(nodes, "front_lounge_chair1", "hallNE");
            linkBidirectional(nodes, "front_lounge_chair2", "hallNE");
            sitTargets.front_lounge_couch = { sit: true, facing: -Math.PI / 2 };
            sitTargets.front_lounge_chair1 = { sit: true, facing: Math.PI };
            sitTargets.front_lounge_chair2 = { sit: true, facing: 0 };
            nodes.cafe_door = { pos: new THREE.Vector3(-4, floorY + 0.01, 2), links: [] };
            linkBidirectional(nodes, "cafe_door", "hallSW");

            // Back lounge
            makeCouch(4, -5, floorY, 0);
            makeCouch(4, -7, floorY, Math.PI);
            makeTable(4, -6, floorY, 1.0, 0.5);
            nodes.back_lounge_N = { pos: new THREE.Vector3(4, floorY + 0.01, -5), links: [] };
            nodes.back_lounge_S = { pos: new THREE.Vector3(4, floorY + 0.01, -7), links: [] };
            linkBidirectional(nodes, "back_lounge_N", "hallE");
            linkBidirectional(nodes, "back_lounge_S", "hallE");
            sitTargets.back_lounge_N = { sit: true, facing: 0 };
            sitTargets.back_lounge_S = { sit: true, facing: Math.PI };

            // Conversation pit
            makeTable(-6, -5, floorY, 0.9, 0.9);
            var pitDefs = [["pit_N", -6, -4], ["pit_S", -6, -6], ["pit_E", -5, -5], ["pit_W", -7, -5]];
            for (var pi2 = 0; pi2 < pitDefs.length; pi2++) {
                var pd = pitDefs[pi2];
                nodes[pd[0]] = { pos: new THREE.Vector3(pd[1], floorY + 0.01, pd[2]), links: [] };
                linkBidirectional(nodes, pd[0], "hallW");
                sitTargets[pd[0]] = { sit: true, facing: Math.PI };
                makeChair(pd[1], pd[2], floorY, 0);
            }

            // Water coolers lobby
            makeWaterCooler(2, 3, floorY);
            makeWaterCooler(-2, -6, floorY);
            nodes.lobby_wc_front = { pos: new THREE.Vector3(2, floorY + 0.01, 3.5), links: [] };
            nodes.lobby_wc_back = { pos: new THREE.Vector3(-2, floorY + 0.01, -6.5), links: [] };
            linkBidirectional(nodes, "lobby_wc_front", "hallSE");
            linkBidirectional(nodes, "lobby_wc_back", "hallNW");
            sitTargets.lobby_wc_front = { sit: false, facing: 0 };
            sitTargets.lobby_wc_back = { sit: false, facing: 0 };

            // Reception desk
            var recep = new THREE.Mesh(new THREE.BoxGeometry(2, 0.9, 0.7), new THREE.MeshLambertMaterial({ color: 0x666666 }));
            recep.position.set(-3, floorY + 0.45, 6); BG.add(recep);
            nodes.reception = { pos: new THREE.Vector3(-3, floorY + 0.01, 5), links: [] };
            linkBidirectional(nodes, "reception", "hallN");
            sitTargets.reception = { sit: false, facing: Math.PI };

            // Info kiosk
            var kioskM = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.2, 0.4), new THREE.MeshLambertMaterial({ color: 0x333333 }));
            kioskM.position.set(2, floorY + 0.6, 7); BG.add(kioskM);
            nodes.kiosk = { pos: new THREE.Vector3(2, floorY + 0.01, 6.5), links: [] };
            linkBidirectional(nodes, "kiosk", "lobby_center");
            sitTargets.kiosk = { sit: false, facing: 0 };

            // Generic loiter waypoints
            var loiterDefs = [["lobby_stand_center", 0, 2], ["lobby_stand_NE", 6, 2], ["lobby_stand_NW", -5, 2], ["lobby_stand_midE", 6, -2], ["lobby_stand_midW", -5, -2], ["lobby_stand_entry", 0, 6]];
            for (var li = 0; li < loiterDefs.length; li++) {
                var ld = loiterDefs[li];
                nodes[ld[0]] = { pos: new THREE.Vector3(ld[1], floorY + 0.01, ld[2]), links: [] };
                linkBidirectional(nodes, ld[0], "lobby_center");
                sitTargets[ld[0]] = { sit: false, facing: 0 };
            }

            // Connect all lobby hallway nodes to lobby_center for routing
            linkBidirectional(nodes, "hallS", "lobby_center");
            linkBidirectional(nodes, "hallN", "lobby_center");

        } else {
            // Office floors
            // Office desks - 4 private offices along back wall
            var officeXs = [-7.5, -2.5, 2.5, 7.5];
            var officeNames = ["A", "B", "C", "D"];
            for (var oi = 0; oi < 4; oi++) {
                var ox = officeXs[oi];
                var on2 = officeNames[oi];
                // Interior walls between offices
                if (oi < 3) {
                    var wallX = (officeXs[oi] + officeXs[oi + 1]) / 2;
                    addInteriorWall(wallX, floorY + WORLD.FLOOR_HEIGHT / 2, -6, 0.1, WORLD.FLOOR_HEIGHT, 6);
                }
                // Office walls: back portion divider
                makeDesk(ox, -7, floorY, 0);
                makeChair(ox, -5.5, floorY, Math.PI);
                var doorName = "office" + on2 + "_door";
                var deskName = "office" + on2 + "_desk";
                nodes[doorName] = { pos: new THREE.Vector3(ox, floorY + 0.01, -3.2), links: [] };
                nodes[deskName] = { pos: new THREE.Vector3(ox, floorY + 0.01, -5.5), links: [] };
                linkBidirectional(nodes, deskName, doorName);
                // Link door to nearest hallway corner
                var nearestHall = ox < 0 ? (ox < -5 ? "hallNW" : "hallN") : (ox > 5 ? "hallNE" : "hallN");
                linkBidirectional(nodes, doorName, nearestHall);
                sitTargets[deskName] = { sit: true, facing: Math.PI };
                // Track desks globally
                desks.push({ id: "f" + fi + "_" + on2, wpName: deskName, floor: fi });
            }
            // Horizontal wall separating offices from hallway - with doorway gaps
            // We'll do wall segments with gaps
            // Simple: two segments with gap for doors (omitted for simplicity - visual walls already semi-transparent conceptually)

            // Conference room front-left
            addInteriorWall(-7, floorY + WORLD.FLOOR_HEIGHT / 2, 3, 8, WORLD.FLOOR_HEIGHT, 0.1);
            addInteriorWall(-3, floorY + WORLD.FLOOR_HEIGHT / 2, 6, 0.1, WORLD.FLOOR_HEIGHT, 6);
            var confTable = new THREE.Mesh(new THREE.BoxGeometry(3, 0.05, 1.2), new THREE.MeshLambertMaterial({ color: 0x6b4c2a }));
            confTable.position.set(-7, floorY + 0.7, 6); BG.add(confTable);
            var confSeats = [[-8, 5.2], [-8, 6.8], [-6, 5.2], [-6, 6.8]];
            for (var ci = 0; ci < 4; ci++) {
                var csx = confSeats[ci][0], csz = confSeats[ci][1];
                var facing2 = csx < -7 ? 0 : Math.PI;
                makeChair(csx, csz, floorY, facing2);
                var csName = "conf_seat" + ci;
                nodes[csName] = { pos: new THREE.Vector3(csx, floorY + 0.01, csz), links: [] };
                sitTargets[csName] = { sit: true, facing: facing2 };
            }
            nodes.conf_door = { pos: new THREE.Vector3(-4, floorY + 0.01, 3.2), links: [] };
            nodes.conf_center = { pos: new THREE.Vector3(-7, floorY + 0.01, 6), links: [] };
            linkBidirectional(nodes, "conf_door", "hallSW");
            linkBidirectional(nodes, "conf_door", "conf_center");
            for (var ci2 = 0; ci2 < 4; ci2++) linkBidirectional(nodes, "conf_seat" + ci2, "conf_center");

            // Lounge front-right
            addInteriorWall(7, floorY + WORLD.FLOOR_HEIGHT / 2, 3, 8, WORLD.FLOOR_HEIGHT, 0.1);
            addInteriorWall(3, floorY + WORLD.FLOOR_HEIGHT / 2, 6, 0.1, WORLD.FLOOR_HEIGHT, 6);
            makeCouch(7, 6.5, floorY, 0);
            makeTable(7, 5.3, floorY, 0.8, 0.5);
            makeChair(6, 5, floorY, 0);
            makeChair(8, 5, floorY, 0);
            makeWaterCooler(9, 7, floorY);
            nodes.lounge_door = { pos: new THREE.Vector3(4, floorY + 0.01, 3.2), links: [] };
            nodes.lounge_center = { pos: new THREE.Vector3(7, floorY + 0.01, 5.5), links: [] };
            linkBidirectional(nodes, "lounge_door", "hallSE");
            linkBidirectional(nodes, "lounge_door", "lounge_center");
            var loungeSpots = [["lounge_spot0", 7, 6.5], ["lounge_spot1", 6, 5], ["lounge_spot2", 8, 5]];
            for (var li2 = 0; li2 < loungeSpots.length; li2++) {
                var lsd = loungeSpots[li2];
                nodes[lsd[0]] = { pos: new THREE.Vector3(lsd[1], floorY + 0.01, lsd[2]), links: [] };
                linkBidirectional(nodes, lsd[0], "lounge_center");
                sitTargets[lsd[0]] = { sit: true, facing: 0 };
            }
            // Standing waypoints
            nodes.water_cooler = { pos: new THREE.Vector3(9, floorY + 0.01, 6.5), links: [] };
            linkBidirectional(nodes, "water_cooler", "hallNE");
            sitTargets.water_cooler = { sit: false, facing: 0 };
            nodes.hall_stand_N = { pos: new THREE.Vector3(0, floorY + 0.01, 3.5), links: [] };
            nodes.hall_stand_S = { pos: new THREE.Vector3(0, floorY + 0.01, -2.5), links: [] };
            linkBidirectional(nodes, "hall_stand_N", "hallN");
            linkBidirectional(nodes, "hall_stand_S", "hallS");
            sitTargets.hall_stand_N = { sit: false, facing: 0 };
            sitTargets.hall_stand_S = { sit: false, facing: 0 };
        }

        // Call panel and shaft indicator
        var cp = makeCallPanel(fi);
        // Position next to shaft, facing +Z
        cp.position.set(2.0, floorY + 1.2, 1.7);
        BG.add(cp);
        var si = makeShaftIndicator();
        si.position.set(0, floorY + 2.6, 1.55);
        BG.add(si);

        floors.push({ floorNumber: fi, nodes: nodes, callPanel: cp, shaftIndicator: si, desks: desks, sitTargets: sitTargets });
    }

    return { buildingGroup: BG, floors: floors, bfsPath: bfsPath };
}
window.WORLD = WORLD;
window.createWorld = createWorld;
window.bfsPath = bfsPath;
