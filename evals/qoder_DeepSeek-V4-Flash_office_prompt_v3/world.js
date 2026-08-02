var WORLD = {
    FLOOR_HEIGHT: 3.4, FLOOR_COUNT: 6,
    BUILDING_WIDTH: 22, BUILDING_DEPTH: 18,
    SHAFT_WIDTH: 3, SHAFT_DEPTH: 3,
    PERSON_R: 0.4
};

function bfsPath(nodes, fromName, toName) {
    if (fromName === toName) return [];
    var visited = {};
    var queue = [[fromName]];
    visited[fromName] = true;
    while (queue.length > 0) {
        var path = queue.shift();
        var current = path[path.length - 1];
        var neighbors = nodes[current];
        if (!neighbors) continue;
        for (var i = 0; i < neighbors.length; i++) {
            var n = neighbors[i];
            if (visited[n]) continue;
            visited[n] = true;
            var newPath = path.concat([n]);
            if (n === toName) return newPath;
            queue.push(newPath);
        }
    }
    return null;
}

function makeTextureDigit(text) {
    var canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, 256, 256);
    ctx.shadowColor = '#ffbb22';
    ctx.shadowBlur = 18;
    ctx.fillStyle = '#ffbb22';
    ctx.font = 'bold 200px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 138);
    var tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = 4;
    tex._lastText = text;
    return tex;
}

function updateTextTexture(tex, text) {
    if (tex._lastText === text) return;
    tex._lastText = text;
    var canvas = tex.image;
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, 256, 256);
    ctx.shadowColor = '#ffbb22';
    ctx.shadowBlur = 18;
    ctx.fillStyle = '#ffbb22';
    ctx.font = 'bold 200px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 138);
    tex.needsUpdate = true;
}

function makeCallPanel() {
    var group = new THREE.Group();
    // Panel plate
    var plateGeo = new THREE.PlaneGeometry(0.55, 1.4);
    var plateMat = new THREE.MeshLambertMaterial({ color: 0x333344, side: THREE.DoubleSide });
    var plate = new THREE.Mesh(plateGeo, plateMat);
    plate.position.z = 0.025;
    group.add(plate);

    // Up arrow
    var upShape = new THREE.Shape();
    upShape.moveTo(0, 0.2);
    upShape.lineTo(-0.13, 0);
    upShape.lineTo(0.13, 0);
    upShape.closePath();
    var upGeo = new THREE.ShapeGeometry(upShape);
    var upMat = new THREE.MeshBasicMaterial({ color: 0x444444, side: THREE.DoubleSide });
    var upMesh = new THREE.Mesh(upGeo, upMat);
    upMesh.position.set(0, 0.2, 0.05);
    group.add(upMesh);

    // Down arrow
    var downShape = new THREE.Shape();
    downShape.moveTo(0, -0.2);
    downShape.lineTo(-0.13, 0);
    downShape.lineTo(0.13, 0);
    downShape.closePath();
    var downGeo = new THREE.ShapeGeometry(downShape);
    var downMat = new THREE.MeshBasicMaterial({ color: 0x444444, side: THREE.DoubleSide });
    var downMesh = new THREE.Mesh(downGeo, downMat);
    downMesh.position.set(0, -0.2, 0.05);
    group.add(downMesh);

    // Floor display
    var dispTex = makeTextureDigit('0');
    var dispMat = new THREE.MeshBasicMaterial({ map: dispTex, side: THREE.DoubleSide });
    var dispGeo = new THREE.PlaneGeometry(0.45, 0.45);
    var dispMesh = new THREE.Mesh(dispGeo, dispMat);
    dispMesh.position.set(0, -0.45, 0.05);
    group.add(dispMesh);

    group.userData = {
        upMesh: upMesh,
        downMesh: downMesh,
        dispMesh: dispMesh,
        dispTex: dispTex,
        setUp: function(on) {
            upMesh.material.color.setHex(on ? 0x44ff44 : 0x444444);
        },
        setDown: function(on) {
            downMesh.material.color.setHex(on ? 0x44ff44 : 0x444444);
        },
        setIndicator: function(text) {
            updateTextTexture(dispTex, text);
        }
    };
    return group;
}

function makeShaftIndicator() {
    var tex = makeTextureDigit('0');
    var mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide });
    var geo = new THREE.PlaneGeometry(0.9, 0.9);
    var mesh = new THREE.Mesh(geo, mat);
    mesh.userData = {
        displayTex: tex,
        setText: function(text) {
            updateTextTexture(tex, text);
        }
    };
    return mesh;
}

function makeInCarIndicator() {
    var tex = makeTextureDigit('0');
    var mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide });
    var geo = new THREE.PlaneGeometry(0.6, 0.6);
    var mesh = new THREE.Mesh(geo, mat);
    mesh.userData = {
        displayTex: tex,
        setText: function(text) {
            updateTextTexture(tex, text);
        }
    };
    return mesh;
}

function makeChair() {
    var group = new THREE.Group();
    // Seat
    var seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.5), new THREE.MeshLambertMaterial({ color: 0x4a4a6a }));
    seat.position.y = 0.4;
    group.add(seat);
    // Back
    var back = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.06), new THREE.MeshLambertMaterial({ color: 0x4a4a6a }));
    back.position.set(0, 0.6, -0.25);
    group.add(back);
    // Legs
    var legMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
    var legPos = [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]];
    for (var i = 0; i < legPos.length; i++) {
        var leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.4, 4), legMat);
        leg.position.set(legPos[i][0], 0.2, legPos[i][1]);
        group.add(leg);
    }
    return group;
}

function makeDesk() {
    var group = new THREE.Group();
    var top = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.05, 0.6), new THREE.MeshLambertMaterial({ color: 0x8B7355 }));
    top.position.y = 0.7;
    group.add(top);
    var legMat = new THREE.MeshLambertMaterial({ color: 0x555555 });
    var legPos = [[-0.5, -0.25], [0.5, -0.25], [-0.5, 0.25], [0.5, 0.25]];
    for (var i = 0; i < legPos.length; i++) {
        var leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 4), legMat);
        leg.position.set(legPos[i][0], 0.35, legPos[i][1]);
        group.add(leg);
    }
    // Monitor
    var monitor = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.05), new THREE.MeshLambertMaterial({ color: 0x222233 }));
    monitor.position.set(0, 0.9, -0.25);
    group.add(monitor);
    // Monitor stand
    var stand = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.15, 4), new THREE.MeshLambertMaterial({ color: 0x333333 }));
    stand.position.set(0, 0.78, -0.25);
    group.add(stand);
    return group;
}

function makeConferenceTable() {
    var group = new THREE.Group();
    var top = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.06, 1.0), new THREE.MeshLambertMaterial({ color: 0x6B5B45 }));
    top.position.y = 0.7;
    group.add(top);
    var legMat = new THREE.MeshLambertMaterial({ color: 0x444444 });
    var legPos = [[-0.8, -0.4], [0.8, 0.4], [0.8, -0.4], [-0.8, 0.4]];
    for (var i = 0; i < legPos.length; i++) {
        var leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 4), legMat);
        leg.position.set(legPos[i][0], 0.35, legPos[i][1]);
        group.add(leg);
    }
    return group;
}

function makeCouch() {
    var group = new THREE.Group();
    var base = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.4, 0.7), new THREE.MeshLambertMaterial({ color: 0x5a5a7a }));
    base.position.y = 0.3;
    group.add(base);
    var back = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.4, 0.12), new THREE.MeshLambertMaterial({ color: 0x5a5a7a }));
    back.position.set(0, 0.55, -0.35);
    group.add(back);
    var armMat = new THREE.MeshLambertMaterial({ color: 0x4a4a6a });
    var armL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.35, 0.7), armMat);
    armL.position.set(-0.9, 0.3, 0);
    group.add(armL);
    var armR = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.35, 0.7), armMat);
    armR.position.set(0.9, 0.3, 0);
    group.add(armR);
    return group;
}

function makeCoffeeTable() {
    var group = new THREE.Group();
    var top = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 0.5), new THREE.MeshLambertMaterial({ color: 0x7B6B55 }));
    top.position.y = 0.4;
    group.add(top);
    var legMat = new THREE.MeshLambertMaterial({ color: 0x444444 });
    var legPos = [[-0.35, -0.2], [0.35, 0.2], [0.35, -0.2], [-0.35, 0.2]];
    for (var i = 0; i < legPos.length; i++) {
        var leg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.4, 4), legMat);
        leg.position.set(legPos[i][0], 0.2, legPos[i][1]);
        group.add(leg);
    }
    return group;
}

function makeBistroTable() {
    var group = new THREE.Group();
    var top = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.35, 0.05, 8), new THREE.MeshLambertMaterial({ color: 0x8B7B65 }));
    top.position.y = 0.7;
    group.add(top);
    var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.7, 4), new THREE.MeshLambertMaterial({ color: 0x555555 }));
    pole.position.y = 0.35;
    group.add(pole);
    return group;
}

function makeWaterCooler() {
    var group = new THREE.Group();
    var body = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.18, 0.7, 8), new THREE.MeshLambertMaterial({ color: 0xccccdd }));
    body.position.y = 0.5;
    group.add(body);
    var top = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.1, 8), new THREE.MeshLambertMaterial({ color: 0x4488cc }));
    top.position.y = 0.9;
    group.add(top);
    var spigot = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.08, 4), new THREE.MeshLambertMaterial({ color: 0x88aacc }));
    spigot.position.set(0.1, 0.35, 0);
    spigot.rotation.x = Math.PI / 2;
    group.add(spigot);
    return group;
}

function makePottedPlant() {
    var group = new THREE.Group();
    var pot = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.18, 0.2, 6), new THREE.MeshLambertMaterial({ color: 0x8B4513 }));
    pot.position.y = 0.1;
    group.add(pot);
    var leaves = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 6), new THREE.MeshLambertMaterial({ color: 0x228B22 }));
    leaves.position.y = 0.35;
    leaves.scale.y = 0.7;
    group.add(leaves);
    return group;
}

function makeArmchair() {
    var group = new THREE.Group();
    var seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.5), new THREE.MeshLambertMaterial({ color: 0x6a5a7a }));
    seat.position.y = 0.35;
    group.add(seat);
    var back = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.06), new THREE.MeshLambertMaterial({ color: 0x6a5a7a }));
    back.position.set(0, 0.55, -0.25);
    group.add(back);
    var armMat = new THREE.MeshLambertMaterial({ color: 0x5a4a6a });
    var armL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.5), armMat);
    armL.position.set(-0.28, 0.35, 0);
    group.add(armL);
    var armR = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.5), armMat);
    armR.position.set(0.28, 0.35, 0);
    group.add(armR);
    return group;
}

function makeReceptionDesk() {
    var group = new THREE.Group();
    var top = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.05, 0.7), new THREE.MeshLambertMaterial({ color: 0x9B8B75 }));
    top.position.y = 0.75;
    group.add(top);
    var front = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.7, 0.05), new THREE.MeshLambertMaterial({ color: 0x7B6B55 }));
    front.position.set(0, 0.4, 0.35);
    group.add(front);
    var sideL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.7, 0.7), new THREE.MeshLambertMaterial({ color: 0x7B6B55 }));
    sideL.position.set(-0.7, 0.4, 0);
    group.add(sideL);
    var sideR = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.7, 0.7), new THREE.MeshLambertMaterial({ color: 0x7B6B55 }));
    sideR.position.set(0.7, 0.4, 0);
    group.add(sideR);
    return group;
}

function makeInfoKiosk() {
    var group = new THREE.Group();
    var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 1.2, 4), new THREE.MeshLambertMaterial({ color: 0x666666 }));
    pole.position.y = 0.6;
    group.add(pole);
    var screen = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.4, 0.05), new THREE.MeshLambertMaterial({ color: 0x4488cc }));
    screen.position.set(0, 1.1, 0.1);
    group.add(screen);
    return group;
}

function makeCafeCounter() {
    var group = new THREE.Group();
    var base = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.9, 0.7), new THREE.MeshLambertMaterial({ color: 0x7B6B55 }));
    base.position.y = 0.45;
    base.position.z = 0;
    group.add(base);
    var top = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.05, 0.7), new THREE.MeshLambertMaterial({ color: 0xCCBBAA }));
    top.position.y = 0.9;
    top.position.z = 0;
    group.add(top);
    // Coffee machine
    var machine = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.35, 0.2), new THREE.MeshLambertMaterial({ color: 0x333333 }));
    machine.position.set(-0.5, 1.1, 0.1);
    group.add(machine);
    // Pastry display
    var pastry = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.15, 0.2), new THREE.MeshLambertMaterial({ color: 0xCC8844 }));
    pastry.position.set(0.5, 1.0, 0.1);
    group.add(pastry);
    return group;
}

function buildOfficeFloor(worldGroup, floorNum, floorY, nodes, sitTargets, desks, callPanels, shaftIndicators) {
    var hw = WORLD.BUILDING_WIDTH / 2;
    var hd = WORLD.BUILDING_DEPTH / 2;
    var shw = WORLD.SHAFT_WIDTH / 2;
    var shd = WORLD.SHAFT_DEPTH / 2;

    // Floor slab - 4 strips around shaft
    var slabMat = new THREE.MeshLambertMaterial({
        color: 0x888899, transparent: true, opacity: 0.3,
        depthWrite: false, side: THREE.DoubleSide
    });
    var slabThick = 0.1;

    // Front strip
    var frontStrip = new THREE.Mesh(new THREE.BoxGeometry(WORLD.BUILDING_WIDTH, slabThick, hd - shd), slabMat);
    frontStrip.position.set(0, floorY, (hd + shd) / 2);
    frontStrip.renderOrder = 0;
    worldGroup.add(frontStrip);

    // Back strip
    var backStrip = new THREE.Mesh(new THREE.BoxGeometry(WORLD.BUILDING_WIDTH, slabThick, hd - shd), slabMat);
    backStrip.position.set(0, floorY, -(hd + shd) / 2);
    backStrip.renderOrder = 0;
    worldGroup.add(backStrip);

    // Left strip
    var leftStrip = new THREE.Mesh(new THREE.BoxGeometry(hw - shw, slabThick, WORLD.SHAFT_DEPTH), slabMat);
    leftStrip.position.set(-(hw + shw) / 2, floorY, 0);
    leftStrip.renderOrder = 0;
    worldGroup.add(leftStrip);

    // Right strip
    var rightStrip = new THREE.Mesh(new THREE.BoxGeometry(hw - shw, slabThick, WORLD.SHAFT_DEPTH), slabMat);
    rightStrip.position.set((hw + shw) / 2, floorY, 0);
    rightStrip.renderOrder = 0;
    worldGroup.add(rightStrip);

    // Outer walls
    var wallMat = new THREE.MeshLambertMaterial({
        color: 0x9999ff, transparent: true, opacity: 0.2,
        depthWrite: false, side: THREE.DoubleSide
    });

    // Back wall
    var backWall = new THREE.Mesh(new THREE.BoxGeometry(WORLD.BUILDING_WIDTH, WORLD.FLOOR_HEIGHT, 0.1), wallMat);
    backWall.position.set(0, floorY + WORLD.FLOOR_HEIGHT / 2, -hd);
    backWall.renderOrder = 0;
    worldGroup.add(backWall);

    // Left wall
    var leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.1, WORLD.FLOOR_HEIGHT, WORLD.BUILDING_DEPTH), wallMat);
    leftWall.position.set(-hw, floorY + WORLD.FLOOR_HEIGHT / 2, 0);
    leftWall.renderOrder = 0;
    worldGroup.add(leftWall);

    // Right wall
    var rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.1, WORLD.FLOOR_HEIGHT, WORLD.BUILDING_DEPTH), wallMat);
    rightWall.position.set(hw, floorY + WORLD.FLOOR_HEIGHT / 2, 0);
    rightWall.renderOrder = 0;
    worldGroup.add(rightWall);

    // Front wall - split into three segments (for floor 0, there's a gap; for floors 1+, no gap)
    if (floorNum === 0) {
        // Entrance gap: 3 units centered on x=0
        var gapHalf = 1.5;
        // Left segment
        var fwLeft = new THREE.Mesh(new THREE.BoxGeometry(hw - gapHalf, WORLD.FLOOR_HEIGHT, 0.1), wallMat);
        fwLeft.position.set(-(hw + gapHalf) / 2, floorY + WORLD.FLOOR_HEIGHT / 2, hd);
        fwLeft.renderOrder = 0;
        worldGroup.add(fwLeft);
        // Right segment
        var fwRight = new THREE.Mesh(new THREE.BoxGeometry(hw - gapHalf, WORLD.FLOOR_HEIGHT, 0.1), wallMat);
        fwRight.position.set((hw + gapHalf) / 2, floorY + WORLD.FLOOR_HEIGHT / 2, hd);
        fwRight.renderOrder = 0;
        worldGroup.add(fwRight);
        // Header above doorway (small strip)
        var header = new THREE.Mesh(new THREE.BoxGeometry(3, 0.3, 0.1), wallMat);
        header.position.set(0, floorY + WORLD.FLOOR_HEIGHT - 0.15, hd);
        header.renderOrder = 0;
        worldGroup.add(header);
    } else {
        var frontWall = new THREE.Mesh(new THREE.BoxGeometry(WORLD.BUILDING_WIDTH, WORLD.FLOOR_HEIGHT, 0.1), wallMat);
        frontWall.position.set(0, floorY + WORLD.FLOOR_HEIGHT / 2, hd);
        frontWall.renderOrder = 0;
        worldGroup.add(frontWall);
    }

    // Interior walls on office floors
    if (floorNum > 0) {
        buildOfficeInterior(worldGroup, floorNum, floorY, nodes, sitTargets, desks, callPanels, shaftIndicators);
    } else {
        buildLobbyInterior(worldGroup, floorNum, floorY, nodes, sitTargets, desks, callPanels, shaftIndicators);
    }
}

function buildOfficeInterior(worldGroup, floorNum, floorY, nodes, sitTargets, desks, callPanels, shaftIndicators) {
    var hw = WORLD.BUILDING_WIDTH / 2;
    var hd = WORLD.BUILDING_DEPTH / 2;
    var shw = WORLD.SHAFT_WIDTH / 2;
    var shd = WORLD.SHAFT_DEPTH / 2;

    var iwMat = new THREE.MeshLambertMaterial({
        color: 0xbbc5e6, transparent: true, opacity: 0.28,
        depthWrite: false, side: THREE.DoubleSide
    });

    // Initialize hall ring nodes before any linking
    var hallNames = ['hallS', 'hallSE', 'hallE', 'hallNE', 'hallN', 'hallNW', 'hallW', 'hallSW'];
    for (var hi = 0; hi < hallNames.length; hi++) {
        if (!nodes[hallNames[hi]]) nodes[hallNames[hi]] = [];
    }
    nodes['elevWait'] = ['hallS'];

    // Back wall area: four private offices
    // Partition walls between offices (z direction from back)
    var officeZStart = -hd + 0.5;
    var officeZEnd = -hd + 5.5;
    var officeWidth = (WORLD.BUILDING_WIDTH - WORLD.SHAFT_WIDTH) / 4;

    for (var i = 0; i < 4; i++) {
        // Back wall of office
        var ow = new THREE.Mesh(new THREE.BoxGeometry(officeWidth - 0.2, WORLD.FLOOR_HEIGHT * 0.8, 0.08), iwMat);
        var ox = -hw + i * officeWidth + officeWidth / 2;
        if (i >= 2) ox += WORLD.SHAFT_WIDTH; // skip shaft
        ow.position.set(ox, floorY + WORLD.FLOOR_HEIGHT * 0.4, officeZStart);
        ow.renderOrder = 0;
        worldGroup.add(ow);

        // Side walls
        var sw = new THREE.Mesh(new THREE.BoxGeometry(0.08, WORLD.FLOOR_HEIGHT * 0.8, officeZEnd - officeZStart), iwMat);
        sw.position.set(ox - officeWidth / 2 + 0.1, floorY + WORLD.FLOOR_HEIGHT * 0.4, (officeZStart + officeZEnd) / 2);
        sw.renderOrder = 0;
        worldGroup.add(sw);

        var sw2 = new THREE.Mesh(new THREE.BoxGeometry(0.08, WORLD.FLOOR_HEIGHT * 0.8, officeZEnd - officeZStart), iwMat);
        sw2.position.set(ox + officeWidth / 2 - 0.1, floorY + WORLD.FLOOR_HEIGHT * 0.4, (officeZStart + officeZEnd) / 2);
        sw2.renderOrder = 0;
        worldGroup.add(sw2);

        // Doorway gap: front wall of office has a gap
        // We'll just leave the front open

        // Desk and chair
        var desk = makeDesk();
        desk.position.set(ox, floorY, officeZEnd - 0.8);
        desk.rotation.y = 0;
        worldGroup.add(desk);

        var chair = makeChair();
        // Chair in front of desk, facing desk (-Z)
        chair.position.set(ox, floorY, officeZEnd - 0.3);
        chair.rotation.y = Math.PI;
        worldGroup.add(chair);

        // Sit target on the chair
        var wpName = 'office' + String.fromCharCode(65 + i) + '_desk';
        sitTargets[wpName] = { sit: true, facing: Math.PI };

        // Navigation nodes
        var doorName = 'office' + String.fromCharCode(65 + i) + '_door';
        var deskName = 'office' + String.fromCharCode(65 + i) + '_desk';
        nodes[doorName] = [];
        nodes[deskName] = [];

        // Link door to desk
        nodes[doorName].push(deskName);
        nodes[deskName].push(doorName);

        // Link door to nearest hallway corner
        var hallNode = 'hallN';
        if (i >= 2) hallNode = 'hallNE';
        else if (i === 1) hallNode = 'hallNW';
        else hallNode = 'hallNW';
        nodes[doorName].push(hallNode);
        nodes[hallNode].push(doorName);
    }

    // Conference room: front-left quadrant
    var confXStart = -hw + 0.5;
    var confXEnd = -hw + 8;
    var confZStart = hd - 7;
    var confZEnd = hd - 1;

    // Conference room walls
    // Back wall
    var cw = new THREE.Mesh(new THREE.BoxGeometry(confXEnd - confXStart, WORLD.FLOOR_HEIGHT * 0.8, 0.08), iwMat);
    cw.position.set((confXStart + confXEnd) / 2, floorY + WORLD.FLOOR_HEIGHT * 0.4, confZEnd);
    cw.renderOrder = 0;
    worldGroup.add(cw);

    // Left wall
    var cwL = new THREE.Mesh(new THREE.BoxGeometry(0.08, WORLD.FLOOR_HEIGHT * 0.8, confZEnd - confZStart), iwMat);
    cwL.position.set(confXStart, floorY + WORLD.FLOOR_HEIGHT * 0.4, (confZStart + confZEnd) / 2);
    cwL.renderOrder = 0;
    worldGroup.add(cwL);

    // Right wall with doorway gap
    var cwR1 = new THREE.Mesh(new THREE.BoxGeometry(0.08, WORLD.FLOOR_HEIGHT * 0.8, 1.5), iwMat);
    cwR1.position.set(confXEnd, floorY + WORLD.FLOOR_HEIGHT * 0.4, confZEnd - 0.75);
    cwR1.renderOrder = 0;
    worldGroup.add(cwR1);
    var cwR2 = new THREE.Mesh(new THREE.BoxGeometry(0.08, WORLD.FLOOR_HEIGHT * 0.8, 1.5), iwMat);
    cwR2.position.set(confXEnd, floorY + WORLD.FLOOR_HEIGHT * 0.4, confZStart + 0.75);
    cwR2.renderOrder = 0;
    worldGroup.add(cwR2);

    // Conference table
    var table = makeConferenceTable();
    table.position.set((confXStart + confXEnd) / 2, floorY, (confZStart + confZEnd) / 2);
    worldGroup.add(table);

    // Four chairs around conference table
    var cx = (confXStart + confXEnd) / 2;
    var cz = (confZStart + confZEnd) / 2;
    var chairPos = [
        { x: cx - 0.6, z: cz, rot: Math.PI / 2 },
        { x: cx + 0.6, z: cz, rot: -Math.PI / 2 },
        { x: cx, z: cz - 0.5, rot: 0 },
        { x: cx, z: cz + 0.5, rot: Math.PI }
    ];
    for (var ci = 0; ci < chairPos.length; ci++) {
        var ch = makeChair();
        ch.position.set(chairPos[ci].x, floorY, chairPos[ci].z);
        ch.rotation.y = chairPos[ci].rot;
        worldGroup.add(ch);
        var seatName = 'conf_seat' + ci;
        sitTargets[seatName] = { sit: true, facing: chairPos[ci].rot };
    }

    // Conference room navigation
    nodes['conf_door'] = ['hallSW'];
    nodes['hallSW'] = nodes['hallSW'] || [];
    nodes['hallSW'].push('conf_door');
    nodes['conf_center'] = ['conf_door'];
    nodes['conf_door'].push('conf_center');
    for (var ci = 0; ci < 4; ci++) {
        var seatName = 'conf_seat' + ci;
        nodes[seatName] = ['conf_center'];
        nodes['conf_center'].push(seatName);
    }

    // Lounge: front-right quadrant
    var lngXStart = hw - 8;
    var lngXEnd = hw - 0.5;
    var lngZStart = hd - 7;
    var lngZEnd = hd - 1;

    // Lounge walls
    var lw = new THREE.Mesh(new THREE.BoxGeometry(lngXEnd - lngXStart, WORLD.FLOOR_HEIGHT * 0.8, 0.08), iwMat);
    lw.position.set((lngXStart + lngXEnd) / 2, floorY + WORLD.FLOOR_HEIGHT * 0.4, lngZEnd);
    lw.renderOrder = 0;
    worldGroup.add(lw);

    var lwL = new THREE.Mesh(new THREE.BoxGeometry(0.08, WORLD.FLOOR_HEIGHT * 0.8, lngZEnd - lngZStart), iwMat);
    lwL.position.set(lngXStart, floorY + WORLD.FLOOR_HEIGHT * 0.4, (lngZStart + lngZEnd) / 2);
    lwL.renderOrder = 0;
    worldGroup.add(lwL);

    // Right wall with doorway
    var lwR1 = new THREE.Mesh(new THREE.BoxGeometry(0.08, WORLD.FLOOR_HEIGHT * 0.8, 1.5), iwMat);
    lwR1.position.set(lngXEnd, floorY + WORLD.FLOOR_HEIGHT * 0.4, lngZEnd - 0.75);
    lwR1.renderOrder = 0;
    worldGroup.add(lwR1);
    var lwR2 = new THREE.Mesh(new THREE.BoxGeometry(0.08, WORLD.FLOOR_HEIGHT * 0.8, 1.5), iwMat);
    lwR2.position.set(lngXEnd, floorY + WORLD.FLOOR_HEIGHT * 0.4, lngZStart + 0.75);
    lwR2.renderOrder = 0;
    worldGroup.add(lwR2);

    // Couch
    var couch = makeCouch();
    couch.position.set(lngXStart + 1.5, floorY, (lngZStart + lngZEnd) / 2);
    couch.rotation.y = Math.PI;
    worldGroup.add(couch);
    sitTargets['lounge_couch'] = { sit: true, facing: 0 };

    // Coffee table
    var ct = makeCoffeeTable();
    ct.position.set(lngXStart + 2.5, floorY, (lngZStart + lngZEnd) / 2);
    worldGroup.add(ct);

    // Two armchairs
    var ac1 = makeArmchair();
    ac1.position.set(lngXStart + 2.5, floorY, (lngZStart + lngZEnd) / 2 - 0.5);
    ac1.rotation.y = Math.PI / 4;
    worldGroup.add(ac1);
    sitTargets['lounge_armchair0'] = { sit: true, facing: Math.PI / 4 };

    var ac2 = makeArmchair();
    ac2.position.set(lngXStart + 2.5, floorY, (lngZStart + lngZEnd) / 2 + 0.5);
    ac2.rotation.y = -Math.PI / 4;
    worldGroup.add(ac2);
    sitTargets['lounge_armchair1'] = { sit: true, facing: -Math.PI / 4 };

    // Water cooler
    var wc = makeWaterCooler();
    wc.position.set(lngXStart + 0.5, floorY, lngZStart + 0.5);
    worldGroup.add(wc);
    sitTargets['lounge_water_cooler'] = { sit: false, facing: 0 };

    // Lounge navigation
    nodes['lounge_door'] = ['hallSE'];
    nodes['hallSE'] = nodes['hallSE'] || [];
    nodes['hallSE'].push('lounge_door');
    nodes['lounge_center'] = ['lounge_door'];
    nodes['lounge_door'].push('lounge_center');
    nodes['lounge_couch'] = ['lounge_center'];
    nodes['lounge_center'].push('lounge_couch');

    // Hallway ring around shaft
    var hallNodes = [
        'hallS', 'hallSE', 'hallE', 'hallNE',
        'hallN', 'hallNW', 'hallW', 'hallSW'
    ];
    var hallRing = [
        ['hallS', 'hallSE'], ['hallSE', 'hallE'], ['hallE', 'hallNE'],
        ['hallNE', 'hallN'], ['hallN', 'hallNW'], ['hallNW', 'hallW'],
        ['hallW', 'hallSW'], ['hallSW', 'hallS']
    ];
    for (var hi = 0; hi < hallNodes.length; hi++) {
        if (!nodes[hallNodes[hi]]) nodes[hallNodes[hi]] = [];
    }
    for (var hi = 0; hi < hallRing.length; hi++) {
        var a = hallRing[hi][0], b = hallRing[hi][1];
        if (nodes[a].indexOf(b) < 0) nodes[a].push(b);
        if (nodes[b].indexOf(a) < 0) nodes[b].push(a);
    }

    // Elevator waiting area
    nodes['elevWait'] = ['hallS'];
    nodes['hallS'].push('elevWait');

    // Water cooler standing waypoint
    sitTargets['water_cooler'] = { sit: false, facing: 0 };
    nodes['water_cooler'] = ['lounge_center'];
    nodes['lounge_center'].push('water_cooler');

    // Hall standing spots
    sitTargets['hall_stand_N'] = { sit: false, facing: 0 };
    sitTargets['hall_stand_S'] = { sit: false, facing: 0 };
    nodes['hall_stand_N'] = ['hallN'];
    nodes['hallN'].push('hall_stand_N');
    nodes['hall_stand_S'] = ['hallS'];
    nodes['hallS'].push('hall_stand_S');

    // Call panel next to shaft
    var panel = makeCallPanel();
    panel.position.set(shw + 0.3, floorY + 0.7, 0.2);
    panel.rotation.y = 0;
    worldGroup.add(panel);
    callPanels.push(panel);

    // Shaft indicator above doors
    var indicator = makeShaftIndicator();
    indicator.position.set(0, floorY + WORLD.FLOOR_HEIGHT - 0.5, shd + 0.05);
    indicator.rotation.y = 0;
    worldGroup.add(indicator);
    shaftIndicators.push(indicator);
}

function buildLobbyInterior(worldGroup, floorNum, floorY, nodes, sitTargets, desks, callPanels, shaftIndicators) {
    var hw = WORLD.BUILDING_WIDTH / 2;
    var hd = WORLD.BUILDING_DEPTH / 2;
    var shw = WORLD.SHAFT_WIDTH / 2;
    var shd = WORLD.SHAFT_DEPTH / 2;

    // Initialize hall nodes
    var hallNames = ['hallS', 'hallSE', 'hallE', 'hallNE', 'hallN', 'hallNW', 'hallW', 'hallSW'];
    for (var hi = 0; hi < hallNames.length; hi++) {
        if (!nodes[hallNames[hi]]) nodes[hallNames[hi]] = [];
    }
    nodes['elevWait'] = ['hallS', 'lobby_center'];

    // Sidewalk outside
    var sidewalk = new THREE.Mesh(new THREE.BoxGeometry(8, 0.2, 4), new THREE.MeshLambertMaterial({ color: 0x999988 }));
    sidewalk.position.set(0, floorY - 0.1, hd + 2);
    sidewalk.renderOrder = 0;
    worldGroup.add(sidewalk);

    // Entrance navigation
    nodes['outside'] = ['front_door_threshold'];
    nodes['front_door_threshold'] = ['outside', 'entrance'];
    nodes['entrance'] = ['front_door_threshold', 'lobby_center'];
    nodes['lobby_center'] = ['entrance', 'elevWait'];

    // Cafe counter on the left
    var counter = makeCafeCounter();
    counter.position.set(-hw + 3, floorY, hd - 3);
    counter.rotation.y = Math.PI / 2;
    worldGroup.add(counter);
    nodes['cafe_door'] = ['hallSW'];
    nodes['hallSW'] = ['cafe_door'];
    nodes['cafe_order'] = ['cafe_door'];
    nodes['cafe_door'].push('cafe_order');
    sitTargets['cafe_order'] = { sit: false, facing: 0 };

    // Bistro tables
    var bistroPos = [
        { x: -hw + 5, z: hd - 5, chairs: [{ x: -0.4, z: 0, rot: Math.PI / 2 }, { x: 0.4, z: 0, rot: -Math.PI / 2 }] },
        { x: -hw + 5, z: hd - 7, chairs: [{ x: -0.4, z: 0, rot: Math.PI / 2 }, { x: 0.4, z: 0, rot: -Math.PI / 2 }] },
        { x: 0, z: hd - 5, chairs: [{ x: -0.4, z: 0, rot: Math.PI / 2 }, { x: 0.4, z: 0, rot: -Math.PI / 2 }] },
        { x: 0, z: hd - 7, chairs: [{ x: -0.4, z: 0, rot: Math.PI / 2 }, { x: 0.4, z: 0, rot: -Math.PI / 2 }] }
    ];
    for (var bi = 0; bi < bistroPos.length; bi++) {
        var bt = makeBistroTable();
        bt.position.set(bistroPos[bi].x, floorY, bistroPos[bi].z);
        worldGroup.add(bt);
        for (var ci = 0; ci < bistroPos[bi].chairs.length; ci++) {
            var ch = makeChair();
            ch.position.set(bistroPos[bi].x + bistroPos[bi].chairs[ci].x, floorY, bistroPos[bi].z + bistroPos[bi].chairs[ci].z);
            ch.rotation.y = bistroPos[bi].chairs[ci].rot;
            worldGroup.add(ch);
            var seatName = 'bistro_' + bi + '_' + ci;
            sitTargets[seatName] = { sit: true, facing: bistroPos[bi].chairs[ci].rot };
            nodes[seatName] = ['cafe_door'];
            nodes['cafe_door'].push(seatName);
        }
    }

    // Front lounge (right side)
    var flCouch = makeCouch();
    flCouch.position.set(hw - 3, floorY, hd - 3);
    flCouch.rotation.y = Math.PI;
    worldGroup.add(flCouch);
    sitTargets['front_lounge_couch'] = { sit: true, facing: 0 };

    var flCT = makeCoffeeTable();
    flCT.position.set(hw - 3, floorY, hd - 5);
    worldGroup.add(flCT);

    var flAC1 = makeArmchair();
    flAC1.position.set(hw - 4, floorY, hd - 5);
    flAC1.rotation.y = Math.PI / 3;
    worldGroup.add(flAC1);
    sitTargets['front_lounge_chair0'] = { sit: true, facing: Math.PI / 3 };

    var flAC2 = makeArmchair();
    flAC2.position.set(hw - 2, floorY, hd - 5);
    flAC2.rotation.y = -Math.PI / 3;
    worldGroup.add(flAC2);
    sitTargets['front_lounge_chair1'] = { sit: true, facing: -Math.PI / 3 };

    // Back lounge
    var blCouchN = makeCouch();
    blCouchN.position.set(-3, floorY, -hd + 3);
    blCouchN.rotation.y = 0;
    worldGroup.add(blCouchN);
    sitTargets['back_lounge_N'] = { sit: true, facing: Math.PI };

    var blCouchS = makeCouch();
    blCouchS.position.set(-3, floorY, -hd + 5);
    blCouchS.rotation.y = Math.PI;
    worldGroup.add(blCouchS);
    sitTargets['back_lounge_S'] = { sit: true, facing: 0 };

    var blCT = makeCoffeeTable();
    blCT.position.set(-3, floorY, -hd + 4);
    worldGroup.add(blCT);

    // Conversation pit
    var pitTable = makeCoffeeTable();
    pitTable.scale.set(1.2, 1, 1.2);
    pitTable.position.set(3, floorY, -hd + 4);
    worldGroup.add(pitTable);

    var pitChairPos = [
        { x: 2.2, z: -hd + 4, rot: Math.PI / 2 },
        { x: 3.8, z: -hd + 4, rot: -Math.PI / 2 },
        { x: 3, z: -hd + 3.2, rot: 0 },
        { x: 3, z: -hd + 4.8, rot: Math.PI }
    ];
    for (var pi = 0; pi < pitChairPos.length; pi++) {
        var pc = makeArmchair();
        pc.position.set(pitChairPos[pi].x, floorY, pitChairPos[pi].z);
        pc.rotation.y = pitChairPos[pi].rot;
        worldGroup.add(pc);
        var pn = 'pit_' + ['N', 'S', 'E', 'W'][pi];
        sitTargets[pn] = { sit: true, facing: pitChairPos[pi].rot };
    }

    // Reception desk
    var recDesk = makeReceptionDesk();
    recDesk.position.set(-hw + 4, floorY, hd - 1.5);
    recDesk.rotation.y = Math.PI / 2;
    worldGroup.add(recDesk);
    sitTargets['reception'] = { sit: false, facing: 0 };
    nodes['reception'] = ['lobby_center'];
    nodes['lobby_center'].push('reception');

    // Info kiosk
    var kiosk = makeInfoKiosk();
    kiosk.position.set(0, floorY, hd - 1.5);
    worldGroup.add(kiosk);
    sitTargets['kiosk'] = { sit: false, facing: 0 };
    nodes['kiosk'] = ['lobby_center'];
    nodes['lobby_center'].push('kiosk');

    // Water coolers
    var wc1 = makeWaterCooler();
    wc1.position.set(-hw + 1, floorY, hd - 6);
    worldGroup.add(wc1);
    sitTargets['lobby_wc_front'] = { sit: false, facing: 0 };
    nodes['lobby_wc_front'] = ['lobby_center'];
    nodes['lobby_center'].push('lobby_wc_front');

    var wc2 = makeWaterCooler();
    wc2.position.set(hw - 1, floorY, -hd + 2);
    worldGroup.add(wc2);
    sitTargets['lobby_wc_back'] = { sit: false, facing: 0 };
    nodes['lobby_wc_back'] = ['lobby_center'];
    nodes['lobby_center'].push('lobby_wc_back');

    // Potted plants
    var plant1 = makePottedPlant();
    plant1.position.set(-1.5, floorY, hd - 1);
    worldGroup.add(plant1);
    var plant2 = makePottedPlant();
    plant2.position.set(1.5, floorY, hd - 1);
    worldGroup.add(plant2);

    // Loiter waypoints
    var loiterSpots = [
        'lobby_stand_center', 'lobby_stand_NE', 'lobby_stand_NW',
        'lobby_stand_midE', 'lobby_stand_midW', 'lobby_stand_entry'
    ];
    for (var li = 0; li < loiterSpots.length; li++) {
        sitTargets[loiterSpots[li]] = { sit: false, facing: 0 };
        nodes[loiterSpots[li]] = ['lobby_center'];
        nodes['lobby_center'].push(loiterSpots[li]);
    }

    // Back lounge navigation
    nodes['back_lounge_N'] = ['lobby_center'];
    nodes['lobby_center'].push('back_lounge_N');
    nodes['back_lounge_S'] = ['lobby_center'];
    nodes['lobby_center'].push('back_lounge_S');

    // Front lounge navigation
    nodes['front_lounge_couch'] = ['lobby_center'];
    nodes['lobby_center'].push('front_lounge_couch');
    nodes['front_lounge_chair0'] = ['lobby_center'];
    nodes['lobby_center'].push('front_lounge_chair0');
    nodes['front_lounge_chair1'] = ['lobby_center'];
    nodes['lobby_center'].push('front_lounge_chair1');

    // Conversation pit navigation
    var pitNames = ['pit_N', 'pit_S', 'pit_E', 'pit_W'];
    for (var pi = 0; pi < pitNames.length; pi++) {
        nodes[pitNames[pi]] = ['lobby_center'];
        nodes['lobby_center'].push(pitNames[pi]);
    }

    // Cafe/nearby navigation
    nodes['cafe_order'] = nodes['cafe_order'] || ['lobby_center'];
    if (nodes['lobby_center'].indexOf('cafe_order') < 0) {
        nodes['lobby_center'].push('cafe_order');
    }

    // Hallway ring for lobby (partial)
    var hallNodes = ['hallS', 'hallSE', 'hallE', 'hallNE', 'hallN', 'hallNW', 'hallW', 'hallSW'];
    for (var hi = 0; hi < hallNodes.length; hi++) {
        if (!nodes[hallNodes[hi]]) nodes[hallNodes[hi]] = [];
    }
    nodes['hallS'].push('elevWait');
    nodes['elevWait'] = ['hallS', 'lobby_center'];
    nodes['lobby_center'].push('elevWait');

    nodes['hallSW'].push('cafe_door');
    nodes['cafe_door'] = nodes['cafe_door'] || ['hallSW'];

    // Call panel
    var panel = makeCallPanel();
    panel.position.set(shw + 0.3, floorY + 0.7, 0.2);
    panel.rotation.y = 0;
    worldGroup.add(panel);
    callPanels.push(panel);

    // Shaft indicator
    var indicator = makeShaftIndicator();
    indicator.position.set(0, floorY + WORLD.FLOOR_HEIGHT - 0.5, shd + 0.05);
    indicator.rotation.y = 0;
    worldGroup.add(indicator);
    shaftIndicators.push(indicator);
}

function createWorld(scene) {
    var buildingGroup = new THREE.Group();
    var hw = WORLD.BUILDING_WIDTH / 2;
    var hd = WORLD.BUILDING_DEPTH / 2;

    // Ground slab
    var groundMat = new THREE.MeshLambertMaterial({ color: 0x666677 });
    var ground = new THREE.Mesh(new THREE.BoxGeometry(WORLD.BUILDING_WIDTH + 4, 0.3, WORLD.BUILDING_DEPTH + 4), groundMat);
    ground.position.y = -0.15;
    ground.renderOrder = 0;
    buildingGroup.add(ground);

    // Roof
    var roofMat = new THREE.MeshLambertMaterial({ color: 0x888899 });
    var roof = new THREE.Mesh(new THREE.BoxGeometry(WORLD.BUILDING_WIDTH, 0.15, WORLD.BUILDING_DEPTH), roofMat);
    roof.position.y = WORLD.FLOOR_COUNT * WORLD.FLOOR_HEIGHT;
    roof.renderOrder = 0;
    buildingGroup.add(roof);

    // Build floors
    var floors = [];
    var allNodes = {};
    var allSitTargets = {};
    var allDesks = [];
    var callPanels = [];
    var shaftIndicators = [];

    for (var f = 0; f < WORLD.FLOOR_COUNT; f++) {
        var floorY = f * WORLD.FLOOR_HEIGHT;
        var floorNodes = {};
        var floorSitTargets = {};
        var floorDesks = [];
        // Inherit and extend nodes
        buildOfficeFloor(buildingGroup, f, floorY, floorNodes, floorSitTargets, floorDesks, callPanels, shaftIndicators);

        // Merge into global
        for (var k in floorNodes) {
            allNodes[k] = floorNodes[k];
        }
        for (var k in floorSitTargets) {
            allSitTargets[k] = floorSitTargets[k];
        }
        for (var di = 0; di < floorDesks.length; di++) {
            allDesks.push(floorDesks[di]);
        }

        // Store floor-specific nodes with floor prefix
        var floorData = {
            floorNumber: f,
            nodes: floorNodes,
            sitTargets: floorSitTargets,
            desks: floorDesks,
            callPanel: callPanels.length > 0 ? callPanels[callPanels.length - 1] : null,
            shaftIndicator: shaftIndicators.length > 0 ? shaftIndicators[shaftIndicators.length - 1] : null
        };
        floors.push(floorData);
    }

    scene.add(buildingGroup);

    // Waypoint positions
    var wpPositions = computeWaypointPositions();

    function getWaypointPos(wpName) {
        if (wpPositions[wpName]) return wpPositions[wpName].clone();
        // Try to find in floor-specific nodes
        return null;
    }

    return {
        buildingGroup: buildingGroup,
        floors: floors,
        bfsPath: bfsPath,
        allNodes: allNodes,
        allSitTargets: allSitTargets,
        callPanels: callPanels,
        shaftIndicators: shaftIndicators,
        getWaypointPos: getWaypointPos,
        wpPositions: wpPositions
    };
}

function computeWaypointPositions() {
    var hw = WORLD.BUILDING_WIDTH / 2;
    var hd = WORLD.BUILDING_DEPTH / 2;
    var shw = WORLD.SHAFT_WIDTH / 2;
    var shd = WORLD.SHAFT_DEPTH / 2;
    var pos = {};
    var FLOOR_HEIGHT = WORLD.FLOOR_HEIGHT;

    // Entrance
    pos['outside'] = new THREE.Vector3(0, 0, hd + 3);
    pos['front_door_threshold'] = new THREE.Vector3(0, 0, hd + 0.35);
    pos['entrance'] = new THREE.Vector3(0, 0, hd - 0.6);
    pos['lobby_center'] = new THREE.Vector3(0, 0, hd - 4);

    // Hallway ring (floor 0)
    pos['hallS'] = new THREE.Vector3(0, 0, shd + 0.8);
    pos['hallSE'] = new THREE.Vector3(shw + 1.5, 0, shd + 0.8);
    pos['hallE'] = new THREE.Vector3(shw + 1.5, 0, 0);
    pos['hallNE'] = new THREE.Vector3(shw + 1.5, 0, -shd - 0.8);
    pos['hallN'] = new THREE.Vector3(0, 0, -shd - 0.8);
    pos['hallNW'] = new THREE.Vector3(-shw - 1.5, 0, -shd - 0.8);
    pos['hallW'] = new THREE.Vector3(-shw - 1.5, 0, 0);
    pos['hallSW'] = new THREE.Vector3(-shw - 1.5, 0, shd + 0.8);
    pos['elevWait'] = new THREE.Vector3(0, 0, shd + 1.5);

    // Lobby specific
    pos['cafe_door'] = new THREE.Vector3(-hw + 3, 0, hd - 4);
    pos['cafe_order'] = new THREE.Vector3(-hw + 3.5, 0, hd - 3);
    for (var bi = 0; bi < 4; bi++) {
        for (var ci = 0; ci < 2; ci++) {
            var bx = [0, -hw + 5, -hw + 5, 0, 0][bi];
            var bz = [0, hd - 5, hd - 7, hd - 5, hd - 7][bi];
            pos['bistro_' + bi + '_' + ci] = new THREE.Vector3(bx, 0, bz);
        }
    }
    pos['front_lounge_couch'] = new THREE.Vector3(hw - 3, 0, hd - 3);
    pos['front_lounge_chair0'] = new THREE.Vector3(hw - 4, 0, hd - 5);
    pos['front_lounge_chair1'] = new THREE.Vector3(hw - 2, 0, hd - 5);
    pos['back_lounge_N'] = new THREE.Vector3(-3, 0, -hd + 3);
    pos['back_lounge_S'] = new THREE.Vector3(-3, 0, -hd + 5);
    pos['pit_N'] = new THREE.Vector3(2.2, 0, -hd + 4);
    pos['pit_S'] = new THREE.Vector3(3.8, 0, -hd + 4);
    pos['pit_E'] = new THREE.Vector3(3, 0, -hd + 3.2);
    pos['pit_W'] = new THREE.Vector3(3, 0, -hd + 4.8);
    pos['reception'] = new THREE.Vector3(-hw + 4, 0, hd - 1.5);
    pos['kiosk'] = new THREE.Vector3(0, 0, hd - 1.5);
    pos['lobby_wc_front'] = new THREE.Vector3(-hw + 1, 0, hd - 6);
    pos['lobby_wc_back'] = new THREE.Vector3(hw - 1, 0, -hd + 2);
    pos['lobby_stand_center'] = new THREE.Vector3(0, 0, hd - 2);
    pos['lobby_stand_NE'] = new THREE.Vector3(3, 0, hd - 2);
    pos['lobby_stand_NW'] = new THREE.Vector3(-3, 0, hd - 2);
    pos['lobby_stand_midE'] = new THREE.Vector3(4, 0, hd - 5);
    pos['lobby_stand_midW'] = new THREE.Vector3(-4, 0, hd - 5);
    pos['lobby_stand_entry'] = new THREE.Vector3(0, 0, hd - 1);

    // Office floors - copy with floor offset
    for (var f = 1; f < WORLD.FLOOR_COUNT; f++) {
        var fy = f * FLOOR_HEIGHT;
        // Hallway ring
        pos['hallS_f' + f] = new THREE.Vector3(0, fy, shd + 0.8);
        pos['hallSE_f' + f] = new THREE.Vector3(shw + 1.5, fy, shd + 0.8);
        pos['hallE_f' + f] = new THREE.Vector3(shw + 1.5, fy, 0);
        pos['hallNE_f' + f] = new THREE.Vector3(shw + 1.5, fy, -shd - 0.8);
        pos['hallN_f' + f] = new THREE.Vector3(0, fy, -shd - 0.8);
        pos['hallNW_f' + f] = new THREE.Vector3(-shw - 1.5, fy, -shd - 0.8);
        pos['hallW_f' + f] = new THREE.Vector3(-shw - 1.5, fy, 0);
        pos['hallSW_f' + f] = new THREE.Vector3(-shw - 1.5, fy, shd + 0.8);
        pos['elevWait_f' + f] = new THREE.Vector3(0, fy, shd + 1.5);

        // Offices
        var officeWidth = (WORLD.BUILDING_WIDTH - WORLD.SHAFT_WIDTH) / 4;
        for (var oi = 0; oi < 4; oi++) {
            var ox = -hw + oi * officeWidth + officeWidth / 2;
            if (oi >= 2) ox += WORLD.SHAFT_WIDTH;
            var letter = String.fromCharCode(65 + oi);
            pos['office' + letter + '_door_f' + f] = new THREE.Vector3(ox, fy, -hd + 4.5);
            pos['office' + letter + '_desk_f' + f] = new THREE.Vector3(ox, fy, -hd + 5.5);
        }

        // Conference room
        pos['conf_door_f' + f] = new THREE.Vector3(-hw + 7, fy, hd - 4);
        pos['conf_center_f' + f] = new THREE.Vector3(-hw + 5, fy, hd - 4);
        for (var ci = 0; ci < 4; ci++) {
            pos['conf_seat' + ci + '_f' + f] = new THREE.Vector3(-hw + 5, fy, hd - 4);
        }

        // Lounge
        pos['lounge_door_f' + f] = new THREE.Vector3(hw - 7, fy, hd - 4);
        pos['lounge_center_f' + f] = new THREE.Vector3(hw - 5, fy, hd - 4);
        pos['lounge_couch_f' + f] = new THREE.Vector3(hw - 5, fy, hd - 4);

        // Water cooler
        pos['water_cooler_f' + f] = new THREE.Vector3(hw - 5, fy, hd - 4);

        // Hall standing spots
        pos['hall_stand_N_f' + f] = new THREE.Vector3(0, fy, -shd - 0.8);
        pos['hall_stand_S_f' + f] = new THREE.Vector3(0, fy, shd + 0.8);
    }

    return pos;
}

window.WORLD = WORLD;
window.createWorld = createWorld;
window.bfsPath = bfsPath;