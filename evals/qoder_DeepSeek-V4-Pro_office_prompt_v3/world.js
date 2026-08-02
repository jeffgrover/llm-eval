// world.js - building geometry, per-floor layouts, furniture, navigation graph, call panels
// Uses THREE global. No ES modules.

var WORLD = {
    FLOOR_HEIGHT: 3.4,
    FLOOR_COUNT: 6,
    BUILDING_WIDTH: 22,
    BUILDING_DEPTH: 18,
    SHAFT_WIDTH: 3,
    SHAFT_DEPTH: 3,
    PERSON_R: 0.4
};

function _makeTransparentMat(color, opacity) {
    return new THREE.MeshLambertMaterial({
        color: color,
        transparent: true,
        opacity: opacity,
        depthWrite: false,
        side: THREE.DoubleSide
    });
}

function _makeSolidMat(color) {
    return new THREE.MeshLambertMaterial({ color: color });
}

// Create a canvas-texture indicator panel
function _createIndicatorPanel(w, h) {
    var canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    var tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex._lastText = '';

    var geo = new THREE.PlaneGeometry(w, h);
    var mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
    var mesh = new THREE.Mesh(geo, mat);

    mesh.userData.setText = function(text) {
        if (tex._lastText === text) return;
        tex._lastText = text;
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#050505';
        ctx.fillRect(0, 0, 256, 256);
        ctx.font = 'bold 140px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = '#ffbb22';
        ctx.shadowBlur = 18;
        ctx.fillStyle = '#ffbb22';
        ctx.fillText(text, 128, 128);
        tex.needsUpdate = true;
    };

    return mesh;
}

function _createArrowLamp(size, color) {
    var shape = new THREE.Shape();
    shape.moveTo(0, size);
    shape.lineTo(-size, -size);
    shape.lineTo(size, -size);
    shape.closePath();
    var geo = new THREE.ShapeGeometry(shape);
    var offMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
    var onMat = new THREE.MeshLambertMaterial({ color: color, emissive: color, emissiveIntensity: 0.8 });
    var mesh = new THREE.Mesh(geo, offMat);
    mesh.userData = { offMat: offMat, onMat: onMat };
    return mesh;
}

function _makeChair(seatColor) {
    var group = new THREE.Group();
    var mat = new THREE.MeshLambertMaterial({ color: seatColor || 0x555566 });
    // Seat
    var seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.5), mat);
    seat.position.y = 0.45;
    group.add(seat);
    // Backrest
    var back = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.45, 0.06), mat);
    back.position.set(0, 0.7, -0.22);
    group.add(back);
    // Legs
    var legMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
    for (var lx = -1; lx <= 1; lx += 2) {
        for (var lz = -1; lz <= 1; lz += 2) {
            var leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.45, 6), legMat);
            leg.position.set(lx * 0.2, 0.22, lz * 0.2);
            group.add(leg);
        }
    }
    return group;
}

function _makeDesk(w, d) {
    var group = new THREE.Group();
    var topMat = new THREE.MeshLambertMaterial({ color: 0x8b7355 });
    var legMat = new THREE.MeshLambertMaterial({ color: 0x666666 });
    var top = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, d), topMat);
    top.position.y = 0.73;
    group.add(top);
    for (var lx = -1; lx <= 1; lx += 2) {
        for (var lz = -1; lz <= 1; lz += 2) {
            var leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.7, 6), legMat);
            leg.position.set(lx * (w / 2 - 0.1), 0.35, lz * (d / 2 - 0.1));
            group.add(leg);
        }
    }
    // Monitor
    var screenMat = new THREE.MeshLambertMaterial({ color: 0x222233 });
    var screen = new THREE.Mesh(new THREE.BoxGeometry(w * 0.6, 0.35, 0.04), screenMat);
    screen.position.set(0, 1.0, -d / 2 + 0.15);
    group.add(screen);
    var stand = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.15, 6), legMat);
    stand.position.set(0, 0.8, -d / 2 + 0.15);
    group.add(stand);
    return group;
}

function _makeCouch(w) {
    var group = new THREE.Group();
    var mat = new THREE.MeshLambertMaterial({ color: 0x885544 });
    // Seat
    var seat = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, 0.6), mat);
    seat.position.y = 0.4;
    group.add(seat);
    // Back
    var back = new THREE.Mesh(new THREE.BoxGeometry(w, 0.5, 0.1), mat);
    back.position.set(0, 0.7, -0.25);
    group.add(back);
    // Arms
    var arm = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.3, 0.6), mat);
    arm.position.set(-w / 2 + 0.1, 0.5, 0);
    group.add(arm);
    var arm2 = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.3, 0.6), mat);
    arm2.position.set(w / 2 - 0.1, 0.5, 0);
    group.add(arm2);
    // Legs
    var legMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
    for (var i = 0; i < 4; i++) {
        var leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.4, 6), legMat);
        leg.position.set(-w / 2 + 0.3 + i * (w - 0.6) / 3, 0.2, 0.2);
        group.add(leg);
    }
    return group;
}

function _makeCoffeeTable() {
    var group = new THREE.Group();
    var topMat = new THREE.MeshLambertMaterial({ color: 0x997755 });
    var legMat = new THREE.MeshLambertMaterial({ color: 0x555555 });
    var top = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.05, 0.7), topMat);
    top.position.y = 0.4;
    group.add(top);
    for (var lx = -1; lx <= 1; lx += 2) {
        for (var lz = -1; lz <= 1; lz += 2) {
            var leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.37, 6), legMat);
            leg.position.set(lx * 0.45, 0.185, lz * 0.25);
            group.add(leg);
        }
    }
    return group;
}

function _makeCounter(w, d, h) {
    var group = new THREE.Group();
    var mat = new THREE.MeshLambertMaterial({ color: 0x8b7355 });
    var body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    body.position.y = h / 2;
    group.add(body);
    var topMat = new THREE.MeshLambertMaterial({ color: 0x5c4033 });
    var top = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, 0.06, d + 0.1), topMat);
    top.position.y = h + 0.03;
    group.add(top);
    return group;
}

function _makeBistroTable() {
    var group = new THREE.Group();
    var topMat = new THREE.MeshLambertMaterial({ color: 0xddccaa });
    var legMat = new THREE.MeshLambertMaterial({ color: 0x888888 });
    var top = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.05, 16), topMat);
    top.position.y = 0.72;
    group.add(top);
    var leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.7, 8), legMat);
    leg.position.y = 0.35;
    group.add(leg);
    var base = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 0.06, 16), legMat);
    base.position.y = 0.03;
    group.add(base);
    return group;
}

function _makePlant() {
    var group = new THREE.Group();
    var potMat = new THREE.MeshLambertMaterial({ color: 0x8b4513 });
    var leafMat = new THREE.MeshLambertMaterial({ color: 0x228b22 });
    var pot = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.35, 8), potMat);
    pot.position.y = 0.175;
    group.add(pot);
    for (var i = 0; i < 5; i++) {
        var leaf = new THREE.Mesh(new THREE.SphereGeometry(0.1 + Math.random() * 0.15, 6, 5), leafMat);
        leaf.position.set((Math.random() - 0.5) * 0.15, 0.4 + Math.random() * 0.2, (Math.random() - 0.5) * 0.15);
        group.add(leaf);
    }
    return group;
}

function _makeBuildingShell(scene) {
    var group = new THREE.Group();
    group.renderOrder = 0;

    var bw = WORLD.BUILDING_WIDTH;
    var bd = WORLD.BUILDING_DEPTH;
    var fh = WORLD.FLOOR_HEIGHT;
    var fc = WORLD.FLOOR_COUNT;
    var sw = WORLD.SHAFT_WIDTH;
    var sd = WORLD.SHAFT_DEPTH;
    var hw = bw / 2;
    var hd = bd / 2;
    var shw = sw / 2;
    var shd = sd / 2;
    var totalH = fc * fh;

    // Ground slab
    var groundGeo = new THREE.BoxGeometry(bw, 0.2, bd);
    var ground = new THREE.Mesh(groundGeo, _makeSolidMat(0x666666));
    ground.position.y = -0.1;
    group.add(ground);

    // Roof
    var roof = new THREE.Mesh(new THREE.BoxGeometry(bw, 0.2, bd), _makeSolidMat(0x555555));
    roof.position.y = totalH + 0.1;
    group.add(roof);

    // Floor slabs (strips around shaft)
    var floorSlabMat = _makeTransparentMat(0x888888, 0.3);
    for (var fl = 1; fl < fc; fl++) {
        var fy = fl * fh;
        // North strip (+Z)
        var nsGeo = new THREE.BoxGeometry(bw, 0.12, hd - shd);
        var ns = new THREE.Mesh(nsGeo, floorSlabMat);
        ns.position.set(0, fy, shd + (hd - shd) / 2);
        group.add(ns);
        // South strip (-Z)
        var ss = new THREE.Mesh(nsGeo, floorSlabMat);
        ss.position.set(0, fy, -shd - (hd - shd) / 2);
        group.add(ss);
        // East strip (+X)
        var esGeo = new THREE.BoxGeometry(hw - shw, 0.12, sd);
        var es = new THREE.Mesh(esGeo, floorSlabMat);
        es.position.set(shw + (hw - shw) / 2, fy, 0);
        group.add(es);
        // West strip (-X)
        var ws = new THREE.Mesh(esGeo, floorSlabMat);
        ws.position.set(-shw - (hw - shw) / 2, fy, 0);
        group.add(ws);
    }

    // Outer walls (semi-transparent blue)
    var wallMat = _makeTransparentMat(0x9999ff, 0.2);

    // Back wall (full, -Z)
    var backWall = new THREE.Mesh(new THREE.PlaneGeometry(bw, totalH), wallMat);
    backWall.position.set(0, totalH / 2, -hd);
    group.add(backWall);

    // Left wall (-X)
    var leftWall = new THREE.Mesh(new THREE.PlaneGeometry(bd, totalH), wallMat);
    leftWall.rotation.y = Math.PI / 2;
    leftWall.position.set(-hw, totalH / 2, 0);
    group.add(leftWall);

    // Right wall (+X)
    var rightWall = new THREE.Mesh(new THREE.PlaneGeometry(bd, totalH), wallMat);
    rightWall.rotation.y = -Math.PI / 2;
    rightWall.position.set(hw, totalH / 2, 0);
    group.add(rightWall);

    // Front wall segments (+Z) - gap at floor 0 (entrance)
    var entranceGap = 3.0;
    var gapHalf = entranceGap / 2;
    // Left front panel (full height, x: -hw to -gapHalf)
    var lfGeo = new THREE.PlaneGeometry(hw - gapHalf, totalH);
    var lf = new THREE.Mesh(lfGeo, wallMat);
    lf.position.set(-gapHalf - (hw - gapHalf) / 2, totalH / 2, hd);
    group.add(lf);
    // Right front panel (full height, x: gapHalf to hw)
    var rf = new THREE.Mesh(lfGeo, wallMat);
    rf.position.set(gapHalf + (hw - gapHalf) / 2, totalH / 2, hd);
    group.add(rf);
    // Upper panel above entrance (floors 1-5, x: -gapHalf to gapHalf)
    var upperGeo = new THREE.PlaneGeometry(entranceGap, totalH - fh);
    var upper = new THREE.Mesh(upperGeo, wallMat);
    upper.position.set(0, fh + (totalH - fh) / 2, hd);
    group.add(upper);

    scene.add(group);
    return group;
}

function _buildOfficeFloor(buildingGroup, floorNum, floorY) {
    var bw = WORLD.BUILDING_WIDTH;
    var bd = WORLD.BUILDING_DEPTH;
    var hw = bw / 2;
    var hd = bd / 2;
    var sw = WORLD.SHAFT_WIDTH;
    var sd = WORLD.SHAFT_DEPTH;
    var shw = sw / 2;
    var shd = sd / 2;

    var intWallMat = _makeTransparentMat(0xbbc5e6, 0.28);

    function wall(x1, z1, x2, z2) {
        var dx = x2 - x1;
        var dz = z2 - z1;
        var len = Math.sqrt(dx * dx + dz * dz);
        var cx = (x1 + x2) / 2;
        var cz = (z1 + z2) / 2;
        var angle = Math.atan2(dz, dx);
        var geo = new THREE.PlaneGeometry(len, WORLD.FLOOR_HEIGHT * 0.85);
        var mesh = new THREE.Mesh(geo, intWallMat);
        mesh.position.set(cx, floorY + WORLD.FLOOR_HEIGHT * 0.425, cz);
        mesh.rotation.y = -angle;
        buildingGroup.add(mesh);
        return mesh;
    }

    function wallWithGap(x1, z1, x2, z2, gapStart, gapWidth) {
        var dx = x2 - x1;
        var dz = z2 - z1;
        var len = Math.sqrt(dx * dx + dz * dz);
        var cx = (x1 + x2) / 2;
        var cz = (z1 + z2) / 2;
        var angle = Math.atan2(dz, dx);

        var beforeLen = gapStart;
        var afterLen = len - gapStart - gapWidth;
        var wh = WORLD.FLOOR_HEIGHT * 0.85;

        if (beforeLen > 0.2) {
            var bx = x1 + dx * (beforeLen / len) / 2;
            var bz = z1 + dz * (beforeLen / len) / 2;
            var bGeo = new THREE.PlaneGeometry(beforeLen, wh);
            var bMesh = new THREE.Mesh(bGeo, intWallMat);
            bMesh.position.set(bx, floorY + wh / 2, bz);
            bMesh.rotation.y = -angle;
            buildingGroup.add(bMesh);
        }
        if (afterLen > 0.2) {
            var ax = x1 + dx * (gapStart + gapWidth + afterLen / 2) / len;
            var az = z1 + dz * (gapStart + gapWidth + afterLen / 2) / len;
            var aGeo = new THREE.PlaneGeometry(afterLen, wh);
            var aMesh = new THREE.Mesh(aGeo, intWallMat);
            aMesh.position.set(ax, floorY + wh / 2, az);
            aMesh.rotation.y = -angle;
            buildingGroup.add(aMesh);
        }
    }

    // Interior walls for office floors
    // Back corridor wall (separates offices from hallway)
    wallWithGap(-hw, -shd, -shw, -shd, 0, 0); // west half
    wallWithGap(shw, -shd, hw, -shd, 0, 0);   // east half

    // Office dividers in back area
    wall(-hw + (hw - shw) / 2, -hd, -hw + (hw - shw) / 2, -shd);   // office A/B divider left
    wall(-shw, -hd, -shw, -shd);           // office B/C divider (left side of shaft)
    wall(shw, -hd, shw, -shd);             // office C/D divider (right side of shaft)
    wall(hw - (hw - shw) / 2, -hd, hw - (hw - shw) / 2, -shd); // office C/D divider right

    // Front area dividers
    wallWithGap(-hw, shd, -shw, shd, 0, 0);  // front corridor (west)
    wallWithGap(shw, shd, hw, shd, 0, 0);    // front corridor (east)

    // Conference / lounge divider (front area, left vs right of shaft)
    wallWithGap(-shw, hd, -shw, shd, 0.5, 1.2); // conf room door
    wallWithGap(shw, hd, shw, shd, 0.5, 1.2);   // lounge door

    // Conference room left wall
    wall(-hw, shd, -hw, hd);
    // Lounge right wall
    wall(hw, shd, hw, hd);

    // Front walls of conference and lounge (at z = hd)
    wall(-hw, hd, -shw, hd);
    wall(shw, hd, hw, hd);

    // === Furniture ===
    var furnitureGroup = new THREE.Group();
    buildingGroup.add(furnitureGroup);

    // Desks and chairs for 4 private offices
    var deskPositions = [
        { cx: -8.25, cz: -6, label: 'A' },
        { cx: -3.5, cz: -6, label: 'B' },
        { cx: 3.5, cz: -6, label: 'C' },
        { cx: 8.25, cz: -6, label: 'D' }
    ];

    var desks = [];
    for (var di = 0; di < deskPositions.length; di++) {
        var dp = deskPositions[di];
        var deskGrp = new THREE.Group();
        var desk = _makeDesk(1.8, 1.0);
        deskGrp.add(desk);
        var chair = _makeChair(0x445566);
        chair.position.set(0, 0, 0.65);
        chair.rotation.y = Math.PI; // faces desk (-Z)
        deskGrp.add(chair);
        deskGrp.position.set(dp.cx, floorY, dp.cz);
        furnitureGroup.add(deskGrp);

        desks.push({
            label: dp.label,
            wpName: 'office' + dp.label + '_desk',
            doorWpName: 'office' + dp.label + '_door',
            pos: new THREE.Vector3(dp.cx, floorY, dp.cz),
            chairYaw: Math.PI
        });
    }

    // Conference room: long table + 4 chairs
    var confCx = -shw - (hw - shw) / 2;
    var confCz = shd + (hd - shd) / 2;
    var confTable = new THREE.Mesh(
        new THREE.BoxGeometry(3.5, 0.06, 1.2),
        new THREE.MeshLambertMaterial({ color: 0x997755 })
    );
    confTable.position.set(confCx, floorY + 0.73, confCz);
    furnitureGroup.add(confTable);

    var confSeats = [];
    for (var si = 0; si < 4; si++) {
        var sx = confCx + (si < 2 ? -1 : 1) * 1.1;
        var sz = confCz + (si % 2 === 0 ? -1 : 1) * 0.5;
        var cChair = _makeChair(0x555566);
        cChair.position.set(sx, floorY, sz);
        cChair.rotation.y = si % 2 === 0 ? 0 : Math.PI;
        furnitureGroup.add(cChair);
        confSeats.push({
            wpName: 'conf_seat' + si,
            pos: new THREE.Vector3(sx, floorY, sz),
            yaw: si % 2 === 0 ? 0 : Math.PI
        });
    }

    // Lounge: couch, coffee table, armchairs
    var lngCx = shw + (hw - shw) / 2;
    var lngCz = shd + (hd - shd) / 2;

    var couch = _makeCouch(2.5);
    couch.position.set(lngCx, floorY, lngCz + 1.5);
    couch.rotation.y = Math.PI;
    furnitureGroup.add(couch);

    var ct = _makeCoffeeTable();
    ct.position.set(lngCx, floorY, lngCz);
    furnitureGroup.add(ct);

    for (var ai = 0; ai < 2; ai++) {
        var ac = _makeChair(0x665544);
        ac.position.set(lngCx + (ai === 0 ? -1.2 : 1.2), floorY, lngCz - 0.8);
        ac.rotation.y = Math.PI;
        furnitureGroup.add(ac);
    }

    // Water cooler in lounge area
    var cooler = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.25, 1.0, 8),
        new THREE.MeshLambertMaterial({ color: 0xccccdd })
    );
    cooler.position.set(lngCx + 2.2, floorY + 0.5, lngCz + 1.5);
    furnitureGroup.add(cooler);

    // Plant in lounge
    var plant = _makePlant();
    plant.position.set(lngCx - 2.2, floorY, lngCz + 1.5);
    furnitureGroup.add(plant);

    // === Navigation nodes ===
    var nodes = {};

    // Hallway ring
    var hallNodes = {
        hallS:    [0, floorY, -shd - 0.6],
        hallSE:   [shw + 0.8, floorY, -shd - 0.6],
        hallE:    [shw + 0.8, floorY, 0],
        hallNE:   [shw + 0.8, floorY, shd + 0.6],
        hallN:    [0, floorY, shd + 0.6],
        hallNW:   [-shw - 0.8, floorY, shd + 0.6],
        hallW:    [-shw - 0.8, floorY, 0],
        hallSW:   [-shw - 0.8, floorY, -shd - 0.6]
    };

    for (var hk in hallNodes) {
        nodes[hk] = hallNodes[hk];
    }
    nodes.elevWait = [0, floorY, -shd - 2.0];

    // Office door nodes
    nodes.officeA_door = [-8.25, floorY, -shd - 1.5];
    nodes.officeB_door = [-3.5, floorY, -shd - 1.5];
    nodes.officeC_door = [3.5, floorY, -shd - 1.5];
    nodes.officeD_door = [8.25, floorY, -shd - 1.5];
    nodes.officeA_desk = [-8.25, floorY, -6];
    nodes.officeB_desk = [-3.5, floorY, -6];
    nodes.officeC_desk = [3.5, floorY, -6];
    nodes.officeD_desk = [8.25, floorY, -6];

    // Conference nodes
    nodes.conf_door = [-shw - 1.5, floorY, shd + 1.0];
    nodes.conf_center = [confCx, floorY, confCz];
    for (var csi = 0; csi < 4; csi++) {
        nodes['conf_seat' + csi] = [confSeats[csi].pos.x, floorY, confSeats[csi].pos.z];
    }

    // Lounge nodes
    nodes.lounge_door = [shw + 1.5, floorY, shd + 1.0];
    nodes.lounge_center = [lngCx, floorY, lngCz];
    nodes.lounge_spot0 = [lngCx - 1.2, floorY, lngCz - 0.8];
    nodes.lounge_spot1 = [lngCx + 1.2, floorY, lngCz - 0.8];
    nodes.lounge_spot2 = [lngCx, floorY, lngCz + 1.3];

    // Water cooler and hallway loiter
    nodes.water_cooler = [lngCx + 2.2, floorY, lngCz + 1.5];
    nodes.hall_stand_N = [0, floorY, shd + 1.5];
    nodes.hall_stand_S = [0, floorY, -shd - 2.5];

    // Graph edges
    var edges = [
        ['hallS', 'hallSE'], ['hallSE', 'hallE'], ['hallE', 'hallNE'],
        ['hallNE', 'hallN'], ['hallN', 'hallNW'], ['hallNW', 'hallW'],
        ['hallW', 'hallSW'], ['hallSW', 'hallS'],
        ['hallS', 'elevWait'],
        // Office connections
        ['hallW', 'officeA_door'], ['hallW', 'officeB_door'],
        ['hallE', 'officeC_door'], ['hallE', 'officeD_door'],
        ['officeA_door', 'officeA_desk'], ['officeB_door', 'officeB_desk'],
        ['officeC_door', 'officeC_desk'], ['officeD_door', 'officeD_desk'],
        // Conference connections
        ['hallSW', 'conf_door'], ['conf_door', 'conf_center'],
        ['conf_center', 'conf_seat0'], ['conf_center', 'conf_seat1'],
        ['conf_center', 'conf_seat2'], ['conf_center', 'conf_seat3'],
        // Lounge connections
        ['hallSE', 'lounge_door'], ['lounge_door', 'lounge_center'],
        ['lounge_center', 'lounge_spot0'], ['lounge_center', 'lounge_spot1'],
        ['lounge_center', 'lounge_spot2'],
        // Misc
        ['hallN', 'hall_stand_N'], ['hallS', 'hall_stand_S'],
        ['hallSE', 'water_cooler']
    ];

    // Build adjacency list
    var adj = {};
    for (var ek in nodes) adj[ek] = [];
    for (var ei = 0; ei < edges.length; ei++) {
        var a = edges[ei][0], b = edges[ei][1];
        if (adj[a]) adj[a].push(b);
        if (adj[b]) adj[b].push(a);
    }

    // Sit targets
    var sitTargets = {};
    for (var li = 0; li < 4; li++) {
        var lbl = String.fromCharCode(65 + li);
        sitTargets['office' + lbl + '_desk'] = { sit: true, facing: Math.PI };
    }
    for (var cj = 0; cj < 4; cj++) {
        sitTargets['conf_seat' + cj] = { sit: true, facing: confSeats[cj].yaw };
    }
    sitTargets['lounge_spot0'] = { sit: true, facing: Math.PI };
    sitTargets['lounge_spot1'] = { sit: true, facing: Math.PI };
    sitTargets['lounge_spot2'] = { sit: true, facing: 0 };
    // Standing waypoints
    var standingWps = ['water_cooler', 'hall_stand_N', 'hall_stand_S'];
    for (var sk = 0; sk < standingWps.length; sk++) {
        sitTargets[standingWps[sk]] = { sit: false };
    }

    // Call panel
    var callPanel = _buildCallPanel(floorY);
    buildingGroup.add(callPanel);

    // Shaft indicator
    var shaftInd = _createIndicatorPanel(0.9, 0.9);
    shaftInd.position.set(0, floorY + WORLD.FLOOR_HEIGHT - 0.3, -shd - 0.05);
    buildingGroup.add(shaftInd);

    return {
        floorNumber: floorNum,
        floorY: floorY,
        nodes: nodes,
        adj: adj,
        callPanel: callPanel,
        shaftIndicator: shaftInd,
        desks: desks,
        confSeats: confSeats,
        sitTargets: sitTargets
    };
}

function _buildCallPanel(floorY) {
    var group = new THREE.Group();
    var panelMat = new THREE.MeshLambertMaterial({ color: 0x666677 });
    var plate = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.4, 0.05), panelMat);
    group.add(plate);

    // Up arrow lamp
    var upArrow = _createArrowLamp(0.12, 0x44ff44);
    upArrow.position.set(0, 0.35, 0.03);
    upArrow.rotation.z = 0;
    group.add(upArrow);

    // Down arrow lamp
    var downArrow = _createArrowLamp(0.12, 0x44ff44);
    downArrow.position.set(0, 0.05, 0.03);
    downArrow.rotation.z = Math.PI;
    group.add(downArrow);

    // Floor indicator
    var indPanel = _createIndicatorPanel(0.4, 0.4);
    indPanel.position.set(0, -0.45, 0.03);
    group.add(indPanel);

    group.position.set(1.5, floorY + WORLD.FLOOR_HEIGHT / 2, -WORLD.SHAFT_DEPTH / 2 - 0.05);

    group.userData = {
        setUp: function(on) {
            upArrow.material = on ? upArrow.userData.onMat : upArrow.userData.offMat;
        },
        setDown: function(on) {
            downArrow.material = on ? downArrow.userData.onMat : downArrow.userData.offMat;
        },
        setIndicator: function(text) {
            indPanel.userData.setText(text);
        }
    };

    return group;
}

function _buildLobbyFloor(buildingGroup, floorY) {
    var bw = WORLD.BUILDING_WIDTH;
    var bd = WORLD.BUILDING_DEPTH;
    var hw = bw / 2;
    var hd = bd / 2;
    var sw = WORLD.SHAFT_WIDTH;
    var sd = WORLD.SHAFT_DEPTH;
    var shw = sw / 2;
    var shd = sd / 2;

    var intWallMat = _makeTransparentMat(0xbbc5e6, 0.28);

    function wall(x1, z1, x2, z2) {
        var dx = x2 - x1, dz = z2 - z1;
        var len = Math.sqrt(dx * dx + dz * dz);
        var cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
        var angle = Math.atan2(dz, dx);
        var geo = new THREE.PlaneGeometry(len, WORLD.FLOOR_HEIGHT * 0.85);
        var mesh = new THREE.Mesh(geo, intWallMat);
        mesh.position.set(cx, floorY + WORLD.FLOOR_HEIGHT * 0.425, cz);
        mesh.rotation.y = -angle;
        buildingGroup.add(mesh);
        return mesh;
    }

    // Interior walls for lobby - light dividers
    wall(-hw, -shd, -shw, -shd);
    wall(shw, -shd, hw, -shd);
    wall(-hw, shd, -shw, shd);
    wall(shw, shd, hw, shd);

    var furnitureGroup = new THREE.Group();
    buildingGroup.add(furnitureGroup);

    // Reception desk (left side, near entrance)
    var reception = _makeCounter(2.5, 0.8, 1.1);
    reception.position.set(-4, floorY, 6);
    furnitureGroup.add(reception);

    // Info kiosk near entrance
    var kiosk = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 1.2, 0.3),
        new THREE.MeshLambertMaterial({ color: 0x888899 })
    );
    kiosk.position.set(2, floorY + 0.6, 6.5);
    furnitureGroup.add(kiosk);

    // Cafe (left side, z: 1.5 to 9 area)
    var cafeCounter = _makeCounter(3.0, 0.7, 1.1);
    cafeCounter.position.set(-7, floorY, 5);
    furnitureGroup.add(cafeCounter);

    // Bistro tables in cafe
    var bistroPositions = [
        [-8, 2.5], [-6, 2], [-7, 1]
    ];
    for (var bi = 0; bi < bistroPositions.length; bi++) {
        var bt = _makeBistroTable();
        bt.position.set(bistroPositions[bi][0], floorY, bistroPositions[bi][1]);
        furnitureGroup.add(bt);
        for (var bc = 0; bc < 2; bc++) {
            var bch = _makeChair(0x667766);
            bch.position.set(bistroPositions[bi][0] + (bc === 0 ? -0.6 : 0.6), floorY, bistroPositions[bi][1]);
            furnitureGroup.add(bch);
        }
    }

    // Front lounge (right side)
    var flCouch = _makeCouch(2.5);
    flCouch.position.set(6, floorY, 5);
    flCouch.rotation.y = Math.PI / 2;
    furnitureGroup.add(flCouch);

    var flTable = _makeCoffeeTable();
    flTable.position.set(7, floorY, 4);
    furnitureGroup.add(flTable);

    for (var fla = 0; fla < 2; fla++) {
        var flac = _makeChair(0x776655);
        flac.position.set(7, floorY, 2.5 + fla * 1.5);
        flac.rotation.y = Math.PI;
        furnitureGroup.add(flac);
    }

    // Back lounge (Z < 0)
    var blCouch1 = _makeCouch(2.5);
    blCouch1.position.set(-5, floorY, -4);
    blCouch1.rotation.y = 0;
    furnitureGroup.add(blCouch1);

    var blCouch2 = _makeCouch(2.5);
    blCouch2.position.set(5, floorY, -4);
    blCouch2.rotation.y = Math.PI;
    furnitureGroup.add(blCouch2);

    var blTable = _makeCoffeeTable();
    blTable.position.set(0, floorY, -4);
    furnitureGroup.add(blTable);

    // Conversation pit (back-left)
    var pitTable = new THREE.Mesh(
        new THREE.CylinderGeometry(0.7, 0.7, 0.06, 16),
        new THREE.MeshLambertMaterial({ color: 0x997755 })
    );
    pitTable.position.set(-7, floorY + 0.4, -6);
    furnitureGroup.add(pitTable);
    for (var pa = 0; pa < 4; pa++) {
        var angle = pa * Math.PI / 2;
        var pitChair = _makeChair(0x556677);
        pitChair.position.set(-7 + Math.cos(angle) * 1.3, floorY, -6 + Math.sin(angle) * 1.3);
        pitChair.rotation.y = angle + Math.PI;
        furnitureGroup.add(pitChair);
    }

    // Water coolers
    var wcMat = new THREE.MeshLambertMaterial({ color: 0xccccdd });
    var wc1 = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 1.0, 8), wcMat);
    wc1.position.set(-8, floorY + 0.5, -3);
    furnitureGroup.add(wc1);

    var wc2 = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 1.0, 8), wcMat);
    wc2.position.set(8, floorY + 0.5, 1.5);
    furnitureGroup.add(wc2);

    // Plants near entrance
    var plant1 = _makePlant();
    plant1.position.set(-4.5, floorY, 7.5);
    furnitureGroup.add(plant1);
    var plant2 = _makePlant();
    plant2.position.set(4.5, floorY, 7.5);
    furnitureGroup.add(plant2);

    // Sidewalk slab
    var sidewalkGeo = new THREE.BoxGeometry(6, 0.1, 2);
    var sidewalk = new THREE.Mesh(sidewalkGeo, _makeSolidMat(0x999988));
    sidewalk.position.set(0, -0.05, hd + 1);
    buildingGroup.add(sidewalk);

    // === Navigation nodes ===
    var nodes = {};

    // Entrance chain
    nodes.outside = [0, floorY, hd + 2.5];
    nodes.front_door_threshold = [0, floorY, hd + 0.1];
    nodes.entrance = [0, floorY, hd - 1.5];
    nodes.lobby_center = [0, floorY, 0];

    // Elevator
    nodes.elevWait = [0, floorY, -shd - 2.0];

    // Hallway ring
    var hallNodes = {
        hallS:  [0, floorY, -shd - 1.2],
        hallSE: [shw + 1.2, floorY, -shd - 1.2],
        hallE:  [shw + 1.2, floorY, 0],
        hallNE: [shw + 1.2, floorY, shd + 1.2],
        hallN:  [0, floorY, shd + 1.2],
        hallNW: [-shw - 1.2, floorY, shd + 1.2],
        hallW:  [-shw - 1.2, floorY, 0],
        hallSW: [-shw - 1.2, floorY, -shd - 1.2]
    };
    for (var hk in hallNodes) {
        nodes[hk] = hallNodes[hk];
    }

    // Cafe waypoints
    nodes.cafe_door = [-shw - 1.5, floorY, shd + 1.5];
    nodes.cafe_order = [-7, floorY, 4];
    nodes.cafe_table0 = [-8, floorY, 2.5];
    nodes.cafe_table1 = [-6, floorY, 2];
    nodes.cafe_table2 = [-7, floorY, 1];

    // Front lounge waypoints
    nodes.fl_couch = [6.5, floorY, 5];
    nodes.fl_chair0 = [7, floorY, 2.5];
    nodes.fl_chair1 = [7, floorY, 4];

    // Back lounge
    nodes.back_lounge_N = [-5, floorY, -3.5];
    nodes.back_lounge_S = [5, floorY, -4.5];

    // Conversation pit
    nodes.pit_N = [-7, floorY, -4.7];
    nodes.pit_S = [-7, floorY, -7.3];
    nodes.pit_E = [-5.7, floorY, -6];
    nodes.pit_W = [-8.3, floorY, -6];

    // Misc lobby waypoints
    nodes.reception = [-4, floorY, 5.5];
    nodes.kiosk = [2, floorY, 6.5];
    nodes.lobby_wc_front = [-8, floorY, -3];
    nodes.lobby_wc_back = [8, floorY, 1.5];
    nodes.lobby_stand_center = [0, floorY, 3];
    nodes.lobby_stand_NE = [3, floorY, 5];
    nodes.lobby_stand_NW = [-3, floorY, 5];
    nodes.lobby_stand_midE = [5, floorY, 1];
    nodes.lobby_stand_midW = [-5, floorY, 1];
    nodes.lobby_stand_entry = [0, floorY, 5];

    // Edges
    var edges = [
        // Entrance chain
        ['outside', 'front_door_threshold'], ['front_door_threshold', 'entrance'],
        ['entrance', 'lobby_center'],
        // Lobby center to everything
        ['lobby_center', 'elevWait'],
        ['lobby_center', 'hallN'], ['lobby_center', 'hallS'],
        // Hallway ring
        ['hallS', 'hallSE'], ['hallSE', 'hallE'], ['hallE', 'hallNE'],
        ['hallNE', 'hallN'], ['hallN', 'hallNW'], ['hallNW', 'hallW'],
        ['hallW', 'hallSW'], ['hallSW', 'hallS'],
        // Cafe
        ['hallSW', 'cafe_door'], ['cafe_door', 'cafe_order'],
        ['cafe_order', 'cafe_table0'], ['cafe_order', 'cafe_table1'],
        ['cafe_order', 'cafe_table2'],
        // Front lounge
        ['hallNE', 'fl_couch'], ['fl_couch', 'fl_chair0'], ['fl_couch', 'fl_chair1'],
        // Back lounge
        ['hallW', 'back_lounge_N'], ['hallE', 'back_lounge_S'],
        // Conversation pit
        ['hallW', 'pit_N'], ['pit_N', 'pit_E'], ['pit_N', 'pit_W'],
        ['pit_N', 'pit_S'],
        // Misc
        ['entrance', 'reception'], ['entrance', 'kiosk'],
        ['entrance', 'lobby_stand_entry'],
        ['lobby_center', 'lobby_stand_center'],
        ['hallN', 'lobby_stand_NW'], ['hallN', 'lobby_stand_NE'],
        ['hallE', 'lobby_stand_midE'], ['hallW', 'lobby_stand_midW'],
        ['hallW', 'lobby_wc_front'], ['hallE', 'lobby_wc_back']
    ];

    var adj = {};
    for (var ek in nodes) adj[ek] = [];
    for (var ei = 0; ei < edges.length; ei++) {
        var a = edges[ei][0], b = edges[ei][1];
        if (adj[a]) adj[a].push(b);
        if (adj[b]) adj[b].push(a);
    }

    // Sit targets
    var sitTargets = {};
    sitTargets['fl_couch'] = { sit: true, facing: 0 };
    sitTargets['fl_chair0'] = { sit: true, facing: Math.PI };
    sitTargets['fl_chair1'] = { sit: true, facing: Math.PI };
    sitTargets['back_lounge_N'] = { sit: true, facing: Math.PI / 2 };
    sitTargets['back_lounge_S'] = { sit: true, facing: -Math.PI / 2 };
    sitTargets['pit_N'] = { sit: true, facing: 0 };
    sitTargets['pit_S'] = { sit: true, facing: Math.PI };
    sitTargets['pit_E'] = { sit: true, facing: -Math.PI / 2 };
    sitTargets['pit_W'] = { sit: true, facing: Math.PI / 2 };
    sitTargets['cafe_table0'] = { sit: true, facing: Math.PI / 2 };
    sitTargets['cafe_table1'] = { sit: true, facing: Math.PI / 2 };
    sitTargets['cafe_table2'] = { sit: true, facing: Math.PI / 2 };

    var standingWps = ['cafe_order', 'reception', 'kiosk', 'lobby_wc_front', 'lobby_wc_back',
        'lobby_stand_center', 'lobby_stand_NE', 'lobby_stand_NW',
        'lobby_stand_midE', 'lobby_stand_midW', 'lobby_stand_entry',
        'entrance', 'front_door_threshold'];
    for (var sk = 0; sk < standingWps.length; sk++) {
        sitTargets[standingWps[sk]] = { sit: false };
    }

    // Call panel
    var callPanel = _buildCallPanel(floorY);
    buildingGroup.add(callPanel);

    // Shaft indicator
    var shaftInd = _createIndicatorPanel(0.9, 0.9);
    shaftInd.position.set(0, floorY + WORLD.FLOOR_HEIGHT - 0.3, -shd - 0.05);
    buildingGroup.add(shaftInd);

    return {
        floorNumber: 0,
        floorY: floorY,
        nodes: nodes,
        adj: adj,
        callPanel: callPanel,
        shaftIndicator: shaftInd,
        desks: [],
        confSeats: [],
        sitTargets: sitTargets
    };
}

// BFS path finding
function bfsPath(floorData, fromName, toName) {
    var nodes = floorData.nodes;
    var adj = floorData.adj;
    if (!nodes[fromName] || !nodes[toName]) return [];
    if (fromName === toName) return [new THREE.Vector3(nodes[fromName][0], nodes[fromName][1], nodes[fromName][2])];

    var visited = {};
    var queue = [[fromName]];
    visited[fromName] = true;

    while (queue.length > 0) {
        var path = queue.shift();
        var current = path[path.length - 1];
        if (current === toName) {
            var result = [];
            for (var pi = 0; pi < path.length; pi++) {
                var n = nodes[path[pi]];
                result.push(new THREE.Vector3(n[0], n[1], n[2]));
            }
            return result;
        }
        var neighbors = adj[current] || [];
        for (var ni = 0; ni < neighbors.length; ni++) {
            var next = neighbors[ni];
            if (!visited[next]) {
                visited[next] = true;
                queue.push(path.concat([next]));
            }
        }
    }
    return [];
}

function createWorld(scene) {
    var buildingGroup = _makeBuildingShell(scene);

    var floors = [];

    // Lobby (floor 0)
    floors.push(_buildLobbyFloor(buildingGroup, 0));

    // Office floors (1-5)
    for (var f = 1; f < WORLD.FLOOR_COUNT; f++) {
        floors.push(_buildOfficeFloor(buildingGroup, f, f * WORLD.FLOOR_HEIGHT));
    }

    return {
        buildingGroup: buildingGroup,
        floors: floors,
        FLOOR_COUNT: WORLD.FLOOR_COUNT,
        FLOOR_HEIGHT: WORLD.FLOOR_HEIGHT,
        SHAFT_WIDTH: WORLD.SHAFT_WIDTH,
        SHAFT_DEPTH: WORLD.SHAFT_DEPTH,
        bfsPath: function(fromFloor, fromName, toName) {
            if (fromFloor < 0 || fromFloor >= floors.length) return [];
            return bfsPath(floors[fromFloor], fromName, toName);
        }
    };
}

window.WORLD = WORLD;
window.createWorld = createWorld;
window.bfsPath = bfsPath;
