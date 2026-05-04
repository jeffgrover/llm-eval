var WORLD = {
    FLOOR_HEIGHT: 3.4, FLOOR_COUNT: 6,
    BUILDING_WIDTH: 22, BUILDING_DEPTH: 18,
    SHAFT_WIDTH: 3, SHAFT_DEPTH: 3,
    PERSON_R: 0.4
};

var HW = WORLD.BUILDING_WIDTH / 2;
var HD = WORLD.BUILDING_DEPTH / 2;
var SH = WORLD.SHAFT_WIDTH / 2;
var SD = WORLD.SHAFT_DEPTH / 2;
var FH = WORLD.FLOOR_HEIGHT;

function bfsPath(nodes, fromName, toName) {
    if (fromName === toName) return [nodes[fromName].clone()];
    if (!nodes[fromName] || !nodes[toName]) return [nodes[fromName] ? nodes[fromName].clone() : new THREE.Vector3()];

    var visited = {};
    var parent = {};
    var queue = [fromName];
    visited[fromName] = true;

    while (queue.length > 0) {
        var cur = queue.shift();
        if (cur === toName) break;
        var neighbors = nodes[cur].neighbors || [];
        for (var i = 0; i < neighbors.length; i++) {
            var nb = neighbors[i];
            if (!visited[nb]) {
                visited[nb] = true;
                parent[nb] = cur;
                queue.push(nb);
            }
        }
    }

    if (!visited[toName]) return [nodes[fromName].clone()];

    var path = [];
    var step = toName;
    while (step !== fromName) {
        path.unshift(nodes[step].clone());
        step = parent[step];
        if (!step) return [nodes[fromName].clone()];
    }
    path.unshift(nodes[fromName].clone());
    return path;
}

function createMat(color, opacity) {
    return new THREE.MeshLambertMaterial({
        color: color,
        opacity: opacity,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide
    });
}

function createOpaqueMat(color) {
    return new THREE.MeshLambertMaterial({color: color});
}

function _createTextTexture() {
    var canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, 256, 256);
    ctx.font = 'bold 210px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffbb22';
    ctx.shadowColor = '#ffbb22';
    ctx.shadowBlur = 18;
    return { canvas: canvas, ctx: ctx };
}

function _updateTextTexture(tex, text) {
    if (tex._lastText === text) return;
    tex._lastText = text;
    var ctx = tex.sourceCtxx || tex.ctx;
    if (!ctx) {
        var cav = tex.image;
        ctx = cav.getContext('2d');
        tex.ctx = ctx;
    }
    ctx = tex.ctx || (tex.image ? tex.image.getContext('2d') : null) || _createTextTexture().ctx;
    if (!tex.image) {
        var c = document.createElement('canvas');
        c.width = 256; c.height = 256;
        tex.image = c;
        ctx = c.getContext('2d');
        tex.ctx = ctx;
    }
    ctx.clearRect(0, 0, 256, 256);
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, 256, 256);
    ctx.font = 'bold 210px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffbb22';
    ctx.shadowColor = '#ffbb22';
    ctx.shadowBlur = 18;
    ctx.fillText(text, 128, 128);
    tex.needsUpdate = true;
}

function _makePanelTexture() {
    var canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, 256, 256);
    var tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = 4;
    tex._lastText = '';
    tex.ctx = ctx;
    _updateTextTexture(tex, '0');
    return tex;
}

function _makeArrowMaterial(on) {
    if (on) return new THREE.MeshBasicMaterial({color: 0x00ff00, transparent: true, opacity: 0.9, depthWrite: false});
    return new THREE.MeshBasicMaterial({color: 0x333333, transparent: true, opacity: 0.6, depthWrite: false});
}

function _makeArrowGeo(up) {
    var shape = new THREE.Shape();
    var hw = 0.13;
    var h = 0.16;
    shape.moveTo(-hw, up ? -h / 2 : h / 2);
    shape.lineTo(hw, up ? -h / 2 : h / 2);
    shape.lineTo(0, up ? h / 2 : -h / 2);
    shape.closePath();
    return new THREE.ShapeGeometry(shape);
}

function createCallPanel(floorY) {
    var panel = new THREE.Group();

    var plateGeo = new THREE.BoxGeometry(0.55, 1.4, 0.05);
    var plateMat = createMat(0x334455, 0.85);
    var plate = new THREE.Mesh(plateGeo, plateMat);
    panel.add(plate);

    var upGeo = _makeArrowGeo(true);
    var upOffMat = _makeArrowMaterial(false);
    var upOnMat = _makeArrowMaterial(true);
    var upArrow = new THREE.Mesh(upGeo, upOffMat);
    upArrow.position.set(0, 0.35, 0.03);
    upArrow.name = 'upArrow';
    panel.add(upArrow);

    var downGeo = _makeArrowGeo(false);
    var downOffMat = _makeArrowMaterial(false);
    var downOnMat = _makeArrowMaterial(true);
    var downArrow = new THREE.Mesh(downGeo, downOffMat);
    downArrow.position.set(0, -0.05, 0.03);
    downArrow.name = 'downArrow';
    panel.add(downArrow);

    var floorTex = _makePanelTexture();
    var indicatorGeo = new THREE.PlaneGeometry(0.45, 0.45);
    var indicatorMat = new THREE.MeshBasicMaterial({map: floorTex, depthWrite: false, side: THREE.DoubleSide});
    var indicator = new THREE.Mesh(indicatorGeo, indicatorMat);
    indicator.position.set(0, -0.42, 0.04);
    panel.add(indicator);

    panel.userData = {
        plate: plate,
        upArrow: upArrow, upOffMat: upOffMat, upOnMat: upOnMat,
        downArrow: downArrow, downOffMat: downOffMat, downOnMat: downOnMat,
        indicator: indicator, floorTex: floorTex,
        setUp: function(on) { upArrow.material = on ? panel.userData.upOnMat : panel.userData.upOffMat; },
        setDown: function(on) { downArrow.material = on ? panel.userData.downOnMat : panel.userData.downOffMat; },
        setIndicator: function(text) { _updateTextTexture(floorTex, text); },
        _up: upOnMat, _down: upOnMat
    };

    return panel;
}

function updateTextTexture(tex, text) {
    _updateTextTexture(tex, text);
}

function createShaftIndicator(floorY) {
    var tex = _makePanelTexture();
    var geo = new THREE.PlaneGeometry(0.9, 0.9);
    var mat = new THREE.MeshBasicMaterial({map: tex, depthWrite: false, side: THREE.DoubleSide});
    var mesh = new THREE.Mesh(geo, mat);
    mesh.userData = {
        setIndicator: function(text) { _updateTextTexture(tex, text); },
        floorTex: tex
    };
    return mesh;
}

function createWorld(scene) {
    var buildingGroup = new THREE.Group();
    buildingGroup.renderOrder = 0;
    scene.add(buildingGroup);

    // --- ground slab ---
    var groundGeo = new THREE.BoxGeometry(WORLD.BUILDING_WIDTH + 4, 0.3, WORLD.BUILDING_DEPTH + 4);
    var groundMat = createOpaqueMat(0x555555);
    var ground = new THREE.Mesh(groundGeo, groundMat);
    ground.position.y = -0.15;
    ground.receiveShadow = true;
    buildingGroup.add(ground);

    // --- sidewalk ---
    var swGeo = new THREE.BoxGeometry(WORLD.BUILDING_WIDTH, 0.2, 4);
    var swMat = createOpaqueMat(0x999988);
    var sw = new THREE.Mesh(swGeo, swMat);
    sw.position.set(0, 0.1, HD + 2);
    sw.receiveShadow = true;
    buildingGroup.add(sw);

    // --- roof ---
    var roofGeo = new THREE.BoxGeometry(WORLD.BUILDING_WIDTH, 0.3, WORLD.BUILDING_DEPTH);
    var roofMat = createOpaqueMat(0x555555);
    var roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.y = WORLD.FLOOR_COUNT * FH;
    buildingGroup.add(roof);

    // --- floor slabs (with shaft hole) ---
    var slabGeoN = new THREE.BoxGeometry(HW - SH, 0.2, SD * 2);
    var slabGeoS = new THREE.BoxGeometry(HW - SH, 0.2, SD * 2);
    var slabGeoE = new THREE.BoxGeometry(SH * 2, 0.2, HD - SD);
    var slabGeoW = new THREE.BoxGeometry(SH * 2, 0.2, HD - SD);
    var slabMat = createMat(0x888888, 0.3);

    for (var f = 1; f < WORLD.FLOOR_COUNT; f++) {
        var fy = f * FH;
        var sn = new THREE.Mesh(slabGeoN, slabMat);
        sn.position.set(0, fy, -SD);
        buildingGroup.add(sn);

        var ss = new THREE.Mesh(slabGeoS, slabMat);
        ss.position.set(0, fy, SD);
        buildingGroup.add(ss);

        var se = new THREE.Mesh(slabGeoE, slabMat);
        se.position.set(SH, fy, 0);
        buildingGroup.add(se);

        var swl = new THREE.Mesh(slabGeoW, slabMat);
        swl.position.set(-SH, fy, 0);
        buildingGroup.add(swl);
    }

    // --- outer walls ---
    var outerWallMat = createMat(0x9999ff, 0.2);
    var wallThick = 0.2;

    // Left wall
    var lwGeo = new THREE.BoxGeometry(wallThick, WORLD.FLOOR_COUNT * FH, WORLD.BUILDING_DEPTH);
    var lw = new THREE.Mesh(lwGeo, outerWallMat);
    lw.position.set(-HW, WORLD.FLOOR_COUNT * FH / 2, 0);
    buildingGroup.add(lw);

    // Right wall
    var rw = new THREE.Mesh(lwGeo, outerWallMat);
    rw.position.set(HW, WORLD.FLOOR_COUNT * FH / 2, 0);
    buildingGroup.add(rw);

    // Back wall
    var bwGeo = new THREE.BoxGeometry(WORLD.BUILDING_WIDTH, WORLD.FLOOR_COUNT * FH, wallThick);
    var bw = new THREE.Mesh(bwGeo, outerWallMat);
    bw.position.set(0, WORLD.FLOOR_COUNT * FH / 2, -HD);
    buildingGroup.add(bw);

    // Front wall — left panel (full height)
    var fwH = WORLD.FLOOR_COUNT * FH;
    var fwGeoLSide = new THREE.BoxGeometry(wallThick, fwH, HW - 1.5 + 2 * wallThick);
    // Actually let me build front wall differently: 3 segments
    // Left panel: x in [-HW, -1.5], full height
    var gapHalf = 1.5;
    var leftPanW = HW - gapHalf;
    var rightPanW = HW - gapHalf;
    var fwGeoLeft = new THREE.BoxGeometry(leftPanW, fwH, wallThick);
    var fwLeft = new THREE.Mesh(fwGeoLeft, outerWallMat);
    fwLeft.position.set(-HW + leftPanW / 2, fwH / 2, HD);
    buildingGroup.add(fwLeft);

    var fwGeoRight = new THREE.BoxGeometry(rightPanW, fwH, wallThick);
    var fwRight = new THREE.Mesh(fwGeoRight, outerWallMat);
    fwRight.position.set(HW - rightPanW / 2, fwH / 2, HD);
    buildingGroup.add(fwRight);

    // Above-gap panel: covers floors 1-5 above the gap
    var aboveGeo = new THREE.BoxGeometry(gapHalf * 2, fwH - FH, wallThick);
    var abovePanel = new THREE.Mesh(aboveGeo, outerWallMat);
    abovePanel.position.set(0, FH + (fwH - FH) / 2, HD);
    buildingGroup.add(abovePanel);

    // Glass doors (semi-transparent) at entrance on floor 0
    var doorGeo = new THREE.BoxGeometry(1.2, 2.4, 0.08);
    var doorMat = createMat(0x88aacc, 0.35);
    var doorL = new THREE.Mesh(doorGeo, doorMat);
    doorL.position.set(-0.7, 1.2, HD - 0.04);
    buildingGroup.add(doorL);
    var doorR = new THREE.Mesh(doorGeo, doorMat);
    doorR.position.set(0.7, 1.2, HD - 0.04);
    buildingGroup.add(doorR);

    // --- Interior walls material ---
    var intWallMat = createMat(0xbbc5e6, 0.28);

    // --- floor data ---
    var floors = [];
    var deskCount = 0;

    // ====================== GROUND FLOOR (LOBBY) ======================
    var lobbyY = 0;
    var lobby = { floorNumber: 0, nodes: {}, callPanel: null, shaftIndicator: null, desks: [], sitTargets: {} };

    // Call panel
    var lobbyPanel = createCallPanel(lobbyY);
    lobbyPanel.position.set(SH + 0.3, 0.05, 0.55);
    lobbyPanel.rotation.y = Math.PI;
    buildingGroup.add(lobbyPanel);
    lobby.callPanel = lobbyPanel;

    // Shaft indicator
    var lobbySI = createShaftIndicator(lobbyY);
    lobbySI.position.set(0, FH - 0.3, SD + 0.05);
    buildingGroup.add(lobbySI);
    lobby.shaftIndicator = lobbySI;

    // Navigation nodes for lobby
    var lobbyNodes = {};

    function addLobbyNode(name, x, z) {
        var v = new THREE.Vector3(x, lobbyY, z);
        v.neighbors = [];
        lobbyNodes[name] = v;
    }

    addLobbyNode('elevWait', 0, SD + 1.2);
    addLobbyNode('hallS', 0, SD + 1.2);
    addLobbyNode('hallSE', SH + 1.2, SD + 1.2);
    addLobbyNode('hallE', SH + 1.2, 0);
    addLobbyNode('hallNE', SH + 1.2, -(SD + 0.5));
    addLobbyNode('hallN', 0, -(SD + 0.5));
    addLobbyNode('hallNW', -(SH + 1.2), -(SD + 0.5));
    addLobbyNode('hallW', -(SH + 1.2), 0);
    addLobbyNode('hallSW', -(SH + 1.2), SD + 1.2);
    addLobbyNode('entrance', 0, HD);
    addLobbyNode('outside', 0, HD + 3);

    function linkBidir(a, b) {
        a.neighbors.push(b);
        lobbyNodes[b].neighbors.push(a);
    }

    linkBidir('elevWait', 'hallS');
    linkBidir('hallS', 'hallSE');
    linkBidir('hallS', 'hallSW');
    linkBidir('hallSE', 'hallE');
    linkBidir('hallE', 'hallNE');
    linkBidir('hallNE', 'hallN');
    linkBidir('hallN', 'hallNW');
    linkBidir('hallNW', 'hallW');
    linkBidir('hallW', 'hallSW');
    linkBidir('entrance', 'elevWait');
    linkBidir('entrance', 'outside');

    // Cafe on the left
    var cafeY = lobbyY;
    // Cafe counter
    var counterGeo = new THREE.BoxGeometry(4, 1.1, 0.6);
    var counterMat = createOpaqueMat(0x8B7355);
    var counter = new THREE.Mesh(counterGeo, counterMat);
    counter.position.set(-7, 0.55, -4);
    buildingGroup.add(counter);

    // Countertop
    var topGeo = new THREE.BoxGeometry(4.2, 0.08, 0.8);
    var topMat = createOpaqueMat(0x5C4033);
    var top = new THREE.Mesh(topGeo, topMat);
    top.position.set(-7, 1.14, -4);
    buildingGroup.add(top);

    // Coffee machine
    var coffeeGeo = new THREE.BoxGeometry(0.5, 0.4, 0.4);
    var coffeeMat = createOpaqueMat(0x444444);
    var coffee = new THREE.Mesh(coffeeGeo, coffeeMat);
    coffee.position.set(-6, 1.3, -3.5);
    buildingGroup.add(coffee);

    // Pastry display
    var pastGeo = new THREE.BoxGeometry(0.9, 0.3, 0.5);
    var pastMat = createMat(0xffdd88, 0.6);
    var past = new THREE.Mesh(pastGeo, pastMat);
    past.position.set(-8.2, 1.2, -3.5);
    buildingGroup.add(past);

    // Bistro tables
    for (var bt = 0; bt < 4; bt++) {
        var btx = -8.5 + bt * 1.2;
        var btz = -HD + 2 + bt * 1.5;
        if (bt >= 2) { btx = -7; btz = -HD + 3 + (bt - 2) * 1.8; }

        var tabGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.08, 16);
        var tabMat = createOpaqueMat(0x6B4E31);
        var tab = new THREE.Mesh(tabGeo, tabMat);
        tab.position.set(btx, 0.75, btz);
        buildingGroup.add(tab);

        var legGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.71, 8);
        var legMat = createOpaqueMat(0x444444);
        var leg = new THREE.Mesh(legGeo, legMat);
        leg.position.set(btx, 0.35, btz);
        buildingGroup.add(leg);

        // Two chairs
        for (var ch = 0; ch < 2; ch++) {
            var chz = btz + (ch === 0 ? -0.6 : 0.6);
            var chairSeat = new THREE.Mesh(
                new THREE.BoxGeometry(0.35, 0.08, 0.35),
                createOpaqueMat(0x777777)
            );
            chairSeat.position.set(btx, 0.48, chz);
            buildingGroup.add(chairSeat);

            var wName = 'cafe_bistro_' + bt + '_' + ch;
            addLobbyNode(wName, btx - 0.5, chz);
            lobbyNodes[wName].neighbors.push('cafe_center_' + bt);
            lobby.sitTargets[wName] = {sit: true, facing: ch === 0 ? 0 : Math.PI};
        }

        var cName = 'cafe_center_' + bt;
        addLobbyNode(cName, btx, btz);
        lobby.sitTargets[cName] = {sit: false, facing: 0};
        linkBidir(cName, 'hallW');
    }

    addLobbyNode('cafe_order', -6.5, -3.8);
    lobby.sitTargets['cafe_order'] = {sit: false, facing: Math.PI/2};
    lobbyNodes['cafe_order'].neighbors.push('hallW');

    // Front lounge (right side)
    var flCouchGeo = new THREE.BoxGeometry(2.5, 0.7, 0.8);
    var flCouchMat = createOpaqueMat(0x664444);
    var flCouch = new THREE.Mesh(flCouchGeo, flCouchMat);
    flCouch.position.set(7, 0.35, -1);
    buildingGroup.add(flCouch);

    addLobbyNode('front_lounge_spot0', 7, -1.4);
    lobby.sitTargets['front_lounge_spot0'] = {sit: true, facing: 0};
    addLobbyNode('front_lounge_spot1', 7, 0);
    lobby.sitTargets['front_lounge_spot1'] = {sit: true, facing: Math.PI};
    addLobbyNode('front_lounge_center', 7, -1);
    lobby.sitTargets['front_lounge_center'] = {sit: false, facing: 0};
    linkBidir('front_lounge_center', 'hallE');
    lobbyNodes['front_lounge_spot0'].neighbors.push('front_lounge_center');
    lobbyNodes['front_lounge_spot1'].neighbors.push('front_lounge_center');

    // Coffee table in front lounge
    var flTabGeo = new THREE.BoxGeometry(1.2, 0.08, 0.6);
    var flTab = new THREE.Mesh(flTabGeo, createOpaqueMat(0x5C4033));
    flTab.position.set(7, 0.5, -1);
    buildingGroup.add(flTab);

    // Back lounge (Z < 0) - two couches facing each other
    // South couch
    var blCouchS = new THREE.Mesh(flCouchGeo, flCouchMat);
    blCouchS.position.set(-6, 0.35, -3.5);
    buildingGroup.add(blCouchS);
    addLobbyNode('back_lounge_S', -6, -3.2);
    lobby.sitTargets['back_lounge_S'] = {sit: true, facing: Math.PI};
    lobbyNodes['back_lounge_S'].neighbors.push('back_lounge_center');

    // North couch
    var blCouchN = new THREE.Mesh(flCouchGeo, flCouchMat);
    blCouchN.position.set(-6, 0.35, -7.5);
    buildingGroup.add(blCouchN);
    addLobbyNode('back_lounge_N', -6, -7.8);
    lobby.sitTargets['back_lounge_N'] = {sit: true, facing: 0};
    lobbyNodes['back_lounge_N'].neighbors.push('back_lounge_center');

    addLobbyNode('back_lounge_center', -6, -5.5);
    lobby.sitTargets['back_lounge_center'] = {sit: false, facing: 0};
    linkBidir('back_lounge_center', 'hallNW');

    // Coffee table in back lounge
    var blTab = new THREE.Mesh(flTabGeo, createOpaqueMat(0x5C4033));
    blTab.position.set(-6, 0.5, -5.5);
    buildingGroup.add(blTab);

    // Conversation pit (back-left): round table + 4 armchairs
    var pitX = -4, pitZ = -HD + 4;
    var pitTabGeo = new THREE.CylinderGeometry(0.7, 0.7, 0.08, 16);
    var pitTab = new THREE.Mesh(pitTabGeo, createOpaqueMat(0x6B4E31));
    pitTab.position.set(pitX, 0.75, pitZ);
    buildingGroup.add(pitTab);

    var pitLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.71, 8), createOpaqueMat(0x444444));
    pitLeg.position.set(pitX, 0.35, pitZ);
    buildingGroup.add(pitLeg);

    var pitOffsets = [
        {name: 'pit_N', x: 0, z: 0.85, face: 0},
        {name: 'pit_S', x: 0, z: -0.85, face: Math.PI},
        {name: 'pit_E', x: 0.85, z: 0, face: -Math.PI/2},
        {name: 'pit_W', x: -0.85, z: 0, face: Math.PI/2}
    ];

    for (var p = 0; p < pitOffsets.length; p++) {
        var po = pitOffsets[p];
        var chairSeat = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.08, 0.4), createOpaqueMat(0x777777));
        chairSeat.position.set(pitX + po.x, 0.48, pitZ + po.z);
        buildingGroup.add(chairSeat);

        addLobbyNode(po.name, pitX + po.x * 1.3, pitZ + po.z * 1.3);
        lobby.sitTargets[po.name] = {sit: true, facing: po.face};
        lobbyNodes[po.name].neighbors.push('pit_center');
    }

    addLobbyNode('pit_center', pitX, pitZ);
    lobby.sitTargets['pit_center'] = {sit: false, facing: 0};
    linkBidir('pit_center', 'hallNW');

    // Water coolers
    var wcGeo = new THREE.CylinderGeometry(0.25, 0.3, 1.1, 8);
    var wcMat = createMat(0x88ccff, 0.5);
    var wc1 = new THREE.Mesh(wcGeo, wcMat);
    wc1.position.set(5, 0.55, -HD + 0.8);
    buildingGroup.add(wc1);
    addLobbyNode('lobby_wc_front', 5, -HD + 1.5);
    lobby.sitTargets['lobby_wc_front'] = {sit: false, facing: 0};
    lobbyNodes['lobby_wc_front'].neighbors.push('hallSE');

    var wc2 = new THREE.Mesh(wcGeo, wcMat);
    wc2.position.set(-3, 0.55, -HD + 0.8);
    buildingGroup.add(wc2);
    addLobbyNode('lobby_wc_back', -3, -HD + 1.5);
    lobby.sitTargets['lobby_wc_back'] = {sit: false, facing: 0};
    lobbyNodes['lobby_wc_back'].neighbors.push('hallN');

    // Reception desk
    var recGeo = new THREE.BoxGeometry(2, 1.1, 0.6);
    var rec = new THREE.Mesh(recGeo, createOpaqueMat(0x8B7355));
    rec.position.set(-3, 0.55, 6);
    buildingGroup.add(rec);
    addLobbyNode('reception', -3, 5.5);
    lobby.sitTargets['reception'] = {sit: false, facing: Math.PI / 2};
    lobbyNodes['reception'].neighbors.push('hallS');

    // Info kiosk near entrance
    var kioskGeo = new THREE.BoxGeometry(0.6, 1.5, 0.3);
    var kiosk = new THREE.Mesh(kioskGeo, createOpaqueMat(0x556677));
    kiosk.position.set(2, 0.75, HD - 1.5);
    buildingGroup.add(kiosk);
    addLobbyNode('kiosk', 2, HD - 2);
    lobby.sitTargets['kiosk'] = {sit: false, facing: 0};
    lobbyNodes['kiosk'].neighbors.push('entrance');
    lobbyNodes['kiosk'].neighbors.push('hallSE');

    // Loiter waypoints
    addLobbyNode('lobby_stand_center', 0, 2);
    addLobbyNode('lobby_stand_NE', 3, -2);
    addLobbyNode('lobby_stand_NW', -3, -2);
    addLobbyNode('lobby_stand_midE', 4, 3);
    addLobbyNode('lobby_stand_midW', -4, 3);
    addLobbyNode('lobby_stand_entry', 0, HD - 1);
    var loiterSpots = ['lobby_stand_center', 'lobby_stand_NE', 'lobby_stand_NW', 'lobby_stand_midE', 'lobby_stand_midW', 'lobby_stand_entry'];
    for (var ls = 0; ls < loiterSpots.length; ls++) {
        lobby.sitTargets[loiterSpots[ls]] = {sit: false, facing: 0};
        if (loiterSpots[ls] === 'lobby_stand_center') lobbyNodes[loiterSpots[ls]].neighbors.push('elevWait');
        else if (loiterSpots[ls] === 'lobby_stand_entry') lobbyNodes[loiterSpots[ls]].neighbors.push('entrance');
    }
    lobbyNodes['lobby_stand_NE'].neighbors.push('hallNE');
    lobbyNodes['lobby_stand_NW'].neighbors.push('hallNW');
    lobbyNodes['lobby_stand_midE'].neighbors.push('hallSE');
    lobbyNodes['lobby_stand_midW'].neighbors.push('hallSW');

    // Potted plants
    var plantGeo = new THREE.ConeGeometry(0.3, 0.6, 8);
    var plantMat = createOpaqueMat(0x336633);
    var plant1 = new THREE.Mesh(plantGeo, plantMat);
    plant1.position.set(-1, 0.3, HD - 0.5);
    buildingGroup.add(plant1);
    var plant2 = new THREE.Mesh(plantGeo, plantMat);
    plant2.position.set(1, 0.3, HD - 0.5);
    buildingGroup.add(plant2);

    lobby.nodes = lobbyNodes;
    lobby.entranceSpot = lobbyNodes['entrance'];
    floors.push(lobby);

    // ====================== OFFICE FLOORS (1..5) ======================
    for (var floorNum = 1; floorNum < WORLD.FLOOR_COUNT; floorNum++) {
        var fy = floorNum * FH;
        var floorData = { floorNumber: floorNum, nodes: {}, callPanel: null, shaftIndicator: null, desks: [], sitTargets: {} };
        var fn = floorData.nodes;

        // Call panel
        var cp = createCallPanel(fy);
        cp.position.set(-SH - 0.3, fy + 0.05, 0.55);
        cp.rotation.y = Math.PI;
        buildingGroup.add(cp);
        floorData.callPanel = cp;

        // Shaft indicator
        var si = createShaftIndicator(fy);
        si.position.set(0, fy + FH - 0.3, SD + 0.05);
        buildingGroup.add(si);
        floorData.shaftIndicator = si;

        // Hallway nodes
        function addNode(name, x, z) {
            var v = new THREE.Vector3(x, fy, z);
            v.neighbors = [];
            fn[name] = v;
        }

        addNode('elevWait', 0, SD + 1.2);
        addNode('hallS', 0, SD + 1.8);
        addNode('hallSE', SH + 1.5, SD + 1.8);
        addNode('hallE', SH + 1.5, 0);
        addNode('hallNE', SH + 1.5, -(SD + 1.0));
        addNode('hallN', 0, -(SD + 1.0));
        addNode('hallNW', -(SH + 1.5), -(SD + 1.0));
        addNode('hallW', -(SH + 1.5), 0);
        addNode('hallSW', -(SH + 1.5), SD + 1.8);

        function link(a, b) {
            fn[a].neighbors.push(b);
            fn[b].neighbors.push(a);
        }

        link('elevWait', 'hallS');
        link('hallS', 'hallSE');
        link('hallS', 'hallSW');
        link('hallSE', 'hallE');
        link('hallE', 'hallNE');
        link('hallNE', 'hallN');
        link('hallN', 'hallNW');
        link('hallNW', 'hallW');
        link('hallW', 'hallSW');

        // --- Interior walls for offices ---
        // Wall between elevator hall and offices (back wall of hallway)
        var hwallGeo = new THREE.BoxGeometry(SH * 2 + 4, 2.5, 0.15);
        var hwallN = new THREE.Mesh(hwallGeo, intWallMat);
        hwallN.position.set(0, fy + 1.25, -(SD + 0.3));
        buildingGroup.add(hwallN);

        // Partial wall at hall south
        var hwallS = new THREE.Mesh(hwallGeo, intWallMat);
        hwallS.position.set(0, fy + 1.25, SD + 2.5);
        buildingGroup.add(hwallS);

        // Four private offices along the back wall (z in [-9, -3])
        var officeLayouts = [
            {id: 'A', x: -9, z: -6.5, dx: -8, dz: -4},
            {id: 'B', x: -5, z: -6.5, dx: -4, dz: -4},
            {id: 'C', x: 5, z: -6.5, dx: 4, dz: -4},
            {id: 'D', x: 9, z: -6.5, dx: 8, dz: -4}
        ];

        for (var o = 0; o < officeLayouts.length; o++) {
            var ol = officeLayouts[o];
            var odName = 'office' + ol.id + '_door';
            var odDesk = 'office' + ol.id + '_desk';

            addNode(odName, ol.dx, -(SD + 1.0));
            addNode(odDesk, ol.x, ol.z - 0.5);

            fn[odName].neighbors.push(odDesk);
            fn[odDesk].neighbors.push(odName);

            var hallwayConn;
            if (ol.id === 'A' || ol.id === 'B') {
                hallwayConn = 'hallNW';
                fn[odName].neighbors.push(hallwayConn);
            } else {
                hallwayConn = 'hallNE';
                fn[odName].neighbors.push(hallwayConn);
            }

            floorData.deskCount = (floorData.deskCount || 0) + 1;
            var didx = floorData.deskCount - 1;
            var dName = 'desk_' + floorNum + '_' + ol.id;
            var deskWpName = odDesk;

            floorData.desks.push({
                id: dName,
                floorNum: floorNum,
                officeId: ol.id,
                deskWpName: deskWpName,
                deskDoorWpName: odName,
                worldX: ol.x,
                worldZ: ol.z - 0.5,
                rotationY: Math.PI
            });

            floorData.sitTargets[odDesk] = {sit: true, facing: Math.PI};

            // Desk
            var deskGeo = new THREE.BoxGeometry(1.6, 0.06, 0.8);
            var desk = new THREE.Mesh(deskGeo, createOpaqueMat(0x8B7355));
            desk.position.set(ol.x, fy + 0.75, ol.z);
            buildingGroup.add(desk);

            // Monitor
            var monGeo = new THREE.BoxGeometry(0.6, 0.4, 0.05);
            var mon = new THREE.Mesh(monGeo, createOpaqueMat(0x333333));
            mon.position.set(ol.x, fy + 1.15, ol.z - 0.35);
            buildingGroup.add(mon);

            // Chair
            var chSeatGeo = new THREE.BoxGeometry(0.4, 0.08, 0.4);
            var chSeat = new THREE.Mesh(chSeatGeo, createOpaqueMat(0x666666));
            chSeat.position.set(ol.x, fy + 0.48, ol.z + 0.5);
            buildingGroup.add(chSeat);
        }

        // Conference room (front-left: x in [-11, -3], z in [3, 9])
        var confCenterX = -7, confCenterZ = 6;
        addNode('conf_door', -(SH + 1.5), SD + 4);
        addNode('conf_center', confCenterX, confCenterZ);
        link('conf_door', 'hallSW');
        link('conf_door', 'conf_center');

        var confTableGeo = new THREE.BoxGeometry(3.5, 0.06, 1.4);
        var confTable = new THREE.Mesh(confTableGeo, createOpaqueMat(0x6B4E31));
        confTable.position.set(confCenterX, fy + 0.75, confCenterZ);
        buildingGroup.add(confTable);

        var confSeats = [
            {name: 'conf_seat0', x: confCenterX, z: confCenterZ + 1.0, face: 0},
            {name: 'conf_seat1', x: confCenterX, z: confCenterZ - 1.0, face: Math.PI},
            {name: 'conf_seat2', x: confCenterX + 1.3, z: confCenterZ, face: -Math.PI / 2},
            {name: 'conf_seat3', x: confCenterX - 1.3, z: confCenterZ, face: Math.PI / 2}
        ];

        for (var cs = 0; cs < confSeats.length; cs++) {
            var c = confSeats[cs];
            addNode(c.name, c.x, c.z);
            fn[c.name].neighbors.push('conf_center');
            fn['conf_center'].neighbors.push(c.name);

            var confChSeatGeo = new THREE.BoxGeometry(0.4, 0.08, 0.4);
            var confChSeat = new THREE.Mesh(confChSeatGeo, createOpaqueMat(0x666666));
            confChSeat.position.set(c.x, fy + 0.48, c.z);
            buildingGroup.add(confChSeat);

            floorData.sitTargets[c.name] = {sit: true, facing: c.face};
        }

        // Lounge (front-right: x in [3, 11], z in [3, 9])
        var loungeCenterX = 7, loungeCenterZ = 6;
        addNode('lounge_door', SH + 1.5, SD + 4);
        addNode('lounge_center', loungeCenterX, loungeCenterZ);
        link('lounge_door', 'hallSE');
        link('lounge_door', 'lounge_center');

        var loungeCouchGeo = new THREE.BoxGeometry(2.5, 0.7, 0.8);
        var lCouch = new THREE.Mesh(loungeCouchGeo, createOpaqueMat(0x664444));
        lCouch.position.set(loungeCenterX, fy + 0.35, loungeCenterZ);
        buildingGroup.add(lCouch);

        var coffeeTabGeo = new THREE.BoxGeometry(1.2, 0.08, 0.6);
        var lCoffeeTab = new THREE.Mesh(coffeeTabGeo, createOpaqueMat(0x5C4033));
        lCoffeeTab.position.set(loungeCenterX, fy + 0.5, loungeCenterZ + 0.8);
        buildingGroup.add(lCoffeeTab);

        addNode('lounge_spot0', loungeCenterX, loungeCenterZ + 1.2);
        addNode('lounge_spot1', loungeCenterX, loungeCenterZ - 0.8);
        addNode('lounge_spot2', loungeCenterX + 1.2, loungeCenterZ + 1.2);
        fn['lounge_spot0'].neighbors.push('lounge_center');
        fn['lounge_spot1'].neighbors.push('lounge_center');
        fn['lounge_spot2'].neighbors.push('lounge_center');

        floorData.sitTargets['lounge_spot0'] = {sit: true, facing: Math.PI};
        floorData.sitTargets['lounge_spot1'] = {sit: true, facing: 0};
        floorData.sitTargets['lounge_spot2'] = {sit: true, facing: -Math.PI / 2};

        // Water cooler near lounge
        var wc = new THREE.Mesh(wcGeo, wcMat);
        wc.position.set(loungeCenterX + 2, fy + 0.55, loungeCenterZ + 2);
        buildingGroup.add(wc);
        addNode('water_cooler', loungeCenterX + 2, loungeCenterZ + 2.5);
        fn['water_cooler'].neighbors.push('lounge_center');
        floorData.sitTargets['water_cooler'] = {sit: false, facing: 0};

        // Hallway standing spots
        addNode('hall_stand_N', 0, -(SD + 1.5));
        addNode('hall_stand_S', 0, SD + 2.2);
        fn['hall_stand_N'].neighbors.push('hallN');
        fn['hall_stand_S'].neighbors.push('hallS');
        floorData.sitTargets['hall_stand_N'] = {sit: false, facing: 0};
        floorData.sitTargets['hall_stand_S'] = {sit: false, facing: 0};

        floors.push(floorData);
    }

    // Set global desk indexing
    for (var fi = 0; fi < floors.length; fi++) {
        if (floors[fi].desks) {
            for (var di = 0; di < floors[fi].desks.length; di++) {
                floors[fi].desks[di].globalIndex = deskCount;
                deskCount++;
            }
        }
    }

    return {
        buildingGroup: buildingGroup,
        floors: floors,
        bfsPath: bfsPath,
        deskCount: deskCount,
        WORLD: WORLD
    };
}
