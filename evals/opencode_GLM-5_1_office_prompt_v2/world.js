(function(root) {

var W = {
    FLOOR_HEIGHT: 3.4,
    FLOOR_COUNT: 6,
    BUILDING_WIDTH: 22,
    BUILDING_DEPTH: 18,
    SHAFT_WIDTH: 3,
    SHAFT_DEPTH: 3,
    PERSON_R: 0.4
};

root.WORLD = W;

var wallMat = new THREE.MeshLambertMaterial({
    color: 0x9999ff, transparent: true, opacity: 0.2,
    depthWrite: false, side: THREE.DoubleSide
});
var intWallMat = new THREE.MeshLambertMaterial({
    color: 0xbbc5e6, transparent: true, opacity: 0.28,
    depthWrite: false, side: THREE.DoubleSide
});
var floorMat = new THREE.MeshLambertMaterial({
    color: 0x888888, transparent: true, opacity: 0.3,
    depthWrite: false, side: THREE.DoubleSide
});
var groundMat = new THREE.MeshLambertMaterial({color: 0x777777});
var roofMat = new THREE.MeshLambertMaterial({color: 0x666666});
var deskMat = new THREE.MeshLambertMaterial({color: 0x8B7355});
var chairMat = new THREE.MeshLambertMaterial({color: 0x444444});
var tableMat = new THREE.MeshLambertMaterial({color: 0x6B4226});
var couchMat = new THREE.MeshLambertMaterial({color: 0x336633});
var armchairMat = new THREE.MeshLambertMaterial({color: 0x664433});
var counterMat = new THREE.MeshLambertMaterial({color: 0x5C4033});
var plantMat = new THREE.MeshLambertMaterial({color: 0x228B22});
var potMat = new THREE.MeshLambertMaterial({color: 0x8B4513});
var coolerMat = new THREE.MeshLambertMaterial({color: 0x6699CC});
var confChairMat = new THREE.MeshLambertMaterial({color: 0x336699});
var monitorMat = new THREE.MeshLambertMaterial({color: 0x222222});
var glassDoorMat = new THREE.MeshLambertMaterial({
    color: 0x99ccff, transparent: true, opacity: 0.35,
    depthWrite: false, side: THREE.DoubleSide
});
var sidewalkMat = new THREE.MeshLambertMaterial({color: 0x999999});
var carpetMat = new THREE.MeshLambertMaterial({
    color: 0x666688, transparent: true, opacity: 0.15,
    depthWrite: false, side: THREE.DoubleSide
});
var bistroTableMat = new THREE.MeshLambertMaterial({color: 0x555555});
var bistroChairMat = new THREE.MeshLambertMaterial({color: 0x333333});

function box(w, h, d, mat) {
    return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
}

function cylinder(rTop, rBot, h, seg, mat) {
    return new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg), mat);
}

function addDesk(group, x, y, z, facing) {
    var g = new THREE.Group();
    var top = box(1.2, 0.05, 0.6, deskMat);
    top.position.y = 0.37;
    g.add(top);
    var leg1 = box(0.05, 0.35, 0.05, deskMat);
    leg1.position.set(-0.5, 0.175, -0.25);
    g.add(leg1);
    var leg2 = box(0.05, 0.35, 0.05, deskMat);
    leg2.position.set(0.5, 0.175, -0.25);
    g.add(leg2);
    var leg3 = box(0.05, 0.35, 0.05, deskMat);
    leg3.position.set(-0.5, 0.175, 0.25);
    g.add(leg3);
    var leg4 = box(0.05, 0.35, 0.05, deskMat);
    leg4.position.set(0.5, 0.175, 0.25);
    g.add(leg4);
    var mon = box(0.4, 0.3, 0.05, monitorMat);
    mon.position.set(0, 0.55, -0.25);
    g.add(mon);
    g.position.set(x, y, z);
    g.rotation.y = facing || 0;
    group.add(g);
    return g;
}

function addChair(group, x, y, z, facing) {
    var g = new THREE.Group();
    var seat = box(0.45, 0.05, 0.45, chairMat);
    seat.position.y = 0.22;
    g.add(seat);
    var back = box(0.45, 0.4, 0.05, chairMat);
    back.position.set(0, 0.42, -0.2);
    g.add(back);
    g.position.set(x, y, z);
    g.rotation.y = facing || 0;
    group.add(g);
    return g;
}

function addConferenceChair(group, x, y, z, facing) {
    var g = new THREE.Group();
    var seat = box(0.45, 0.05, 0.45, confChairMat);
    seat.position.y = 0.22;
    g.add(seat);
    var back = box(0.45, 0.35, 0.05, confChairMat);
    back.position.set(0, 0.39, -0.2);
    g.add(back);
    g.position.set(x, y, z);
    g.rotation.y = facing || 0;
    group.add(g);
    return g;
}

function addLongTable(group, x, y, z, w, d) {
    var g = new THREE.Group();
    var top = box(w, 0.05, d, tableMat);
    top.position.y = 0.38;
    g.add(top);
    var leg1 = box(0.05, 0.35, 0.05, tableMat);
    leg1.position.set(w*0.4, 0.175, d*0.4);
    g.add(leg1);
    var leg2 = box(0.05, 0.35, 0.05, tableMat);
    leg2.position.set(-w*0.4, 0.175, d*0.4);
    g.add(leg2);
    var leg3 = box(0.05, 0.35, 0.05, tableMat);
    leg3.position.set(w*0.4, 0.175, -d*0.4);
    g.add(leg3);
    var leg4 = box(0.05, 0.35, 0.05, tableMat);
    leg4.position.set(-w*0.4, 0.175, -d*0.4);
    g.add(leg4);
    g.position.set(x, y, z);
    group.add(g);
    return g;
}

function addCouch(group, x, y, z, facing) {
    var g = new THREE.Group();
    var base = box(1.8, 0.35, 0.7, couchMat);
    base.position.y = 0.175;
    g.add(base);
    var back = box(1.8, 0.3, 0.12, couchMat);
    back.position.set(0, 0.42, -0.29);
    g.add(back);
    g.position.set(x, y, z);
    g.rotation.y = facing || 0;
    group.add(g);
    return g;
}

function addArmchair(group, x, y, z, facing) {
    var g = new THREE.Group();
    var seat = box(0.6, 0.3, 0.6, armchairMat);
    seat.position.y = 0.15;
    g.add(seat);
    var back = box(0.6, 0.35, 0.1, armchairMat);
    back.position.set(0, 0.4, -0.25);
    g.add(back);
    g.position.set(x, y, z);
    g.rotation.y = facing || 0;
    group.add(g);
    return g;
}

function addCoffeeTable(group, x, y, z) {
    var top = box(0.8, 0.04, 0.5, tableMat);
    top.position.set(x, y + 0.3, z);
    group.add(top);
    var leg1 = cylinder(0.02, 0.02, 0.28, 6, tableMat);
    leg1.position.set(x - 0.3, y + 0.14, z - 0.18);
    group.add(leg1);
    var leg2 = cylinder(0.02, 0.02, 0.28, 6, tableMat);
    leg2.position.set(x + 0.3, y + 0.14, z - 0.18);
    group.add(leg2);
    var leg3 = cylinder(0.02, 0.02, 0.28, 6, tableMat);
    leg3.position.set(x - 0.3, y + 0.14, z + 0.18);
    group.add(leg3);
    var leg4 = cylinder(0.02, 0.02, 0.28, 6, tableMat);
    leg4.position.set(x + 0.3, y + 0.14, z + 0.18);
    group.add(leg4);
}

function addWaterCooler(group, x, y, z) {
    var base = cylinder(0.12, 0.12, 0.7, 8, coolerMat);
    base.position.set(x, y + 0.35, z);
    group.add(base);
    var bottle = cylinder(0.1, 0.1, 0.4, 8, coolerMat);
    bottle.position.set(x, y + 0.9, z);
    group.add(bottle);
}

function addPottedPlant(group, x, y, z) {
    var pot = cylinder(0.12, 0.1, 0.25, 8, potMat);
    pot.position.set(x, y + 0.125, z);
    group.add(pot);
    var foliage = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 6), plantMat);
    foliage.position.set(x, y + 0.45, z);
    group.add(foliage);
}

function addBistroTable(group, x, y, z) {
    var top = cylinder(0.3, 0.3, 0.03, 8, bistroTableMat);
    top.position.set(x, y + 0.45, z);
    group.add(top);
    var pole = cylinder(0.02, 0.02, 0.43, 6, bistroTableMat);
    pole.position.set(x, y + 0.215, z);
    group.add(pole);
}

function addBistroChair(group, x, y, z, facing) {
    var g = new THREE.Group();
    var seat = box(0.35, 0.04, 0.35, bistroChairMat);
    seat.position.y = 0.22;
    g.add(seat);
    var back = box(0.35, 0.3, 0.04, bistroChairMat);
    back.position.set(0, 0.37, -0.155);
    g.add(back);
    g.position.set(x, y, z);
    g.rotation.y = facing || 0;
    group.add(g);
}

function addReceptionDesk(group, x, y, z, facing) {
    var g = new THREE.Group();
    var top = box(1.6, 0.05, 0.6, counterMat);
    top.position.y = 0.55;
    g.add(top);
    var front = box(1.6, 0.5, 0.05, counterMat);
    front.position.set(0, 0.3, 0.275);
    g.add(front);
    g.position.set(x, y, z);
    g.rotation.y = facing || 0;
    group.add(g);
}

function addCafeCounter(group, x, y, z) {
    var top = box(2.5, 0.05, 0.7, counterMat);
    top.position.set(x, y + 0.55, z);
    group.add(top);
    var front = box(2.5, 0.5, 0.05, counterMat);
    front.position.set(x, y + 0.3, z + 0.325);
    group.add(front);
    var cm = box(0.3, 0.35, 0.3, new THREE.MeshLambertMaterial({color: 0x444444}));
    cm.position.set(x - 0.6, y + 0.75, z);
    group.add(cm);
    var pastry = box(0.5, 0.12, 0.35, new THREE.MeshLambertMaterial({color: 0xD2B48C}));
    pastry.position.set(x + 0.5, y + 0.62, z);
    group.add(pastry);
}

function addInfoKiosk(group, x, y, z) {
    var base = box(0.5, 0.6, 0.4, new THREE.MeshLambertMaterial({color: 0x556677}));
    base.position.set(x, y + 0.3, z);
    group.add(base);
    var screen = box(0.35, 0.25, 0.02, new THREE.MeshLambertMaterial({color: 0x225588}));
    screen.position.set(x, y + 0.7, z + 0.2);
    group.add(screen);
}

function makeIndicatorTexture(text, size) {
    var canvas = document.createElement('canvas');
    canvas.width = size || 256;
    canvas.height = size || 256;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (text) {
        ctx.fillStyle = '#ffbb22';
        ctx.font = 'bold ' + Math.floor(canvas.height * 0.82) + 'px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = '#ffbb22';
        ctx.shadowBlur = 8;
        ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    }
    var tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex._lastText = text || '';
    tex._canvas = canvas;
    tex._ctx = ctx;
    return tex;
}

function updateTextTexture(tex, text) {
    if (tex._lastText === text) return;
    tex._lastText = text;
    var ctx = tex._ctx;
    var c = tex._canvas;
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, c.width, c.height);
    if (text) {
        ctx.fillStyle = '#ffbb22';
        ctx.font = 'bold ' + Math.floor(c.height * 0.82) + 'px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = '#ffbb22';
        ctx.shadowBlur = 8;
        ctx.fillText(text, c.width / 2, c.height / 2);
    }
    tex.needsUpdate = true;
}

function createCallPanel(group, x, y, z) {
    var panel = new THREE.Group();
    var plate = new THREE.Mesh(
        new THREE.BoxGeometry(0.55, 1.4, 0.05),
        new THREE.MeshLambertMaterial({color: 0x444444})
    );
    panel.add(plate);

    var upArrowShape = new THREE.Shape();
    upArrowShape.moveTo(0, 0.13);
    upArrowShape.lineTo(-0.13, -0.06);
    upArrowShape.lineTo(0.13, -0.06);
    upArrowShape.lineTo(0, 0.13);
    var upGeom = new THREE.ShapeGeometry(upArrowShape);
    var upOff = new THREE.MeshLambertMaterial({color: 0x333333});
    var upOn = new THREE.MeshLambertMaterial({color: 0x00ff00, emissive: 0x00ff00, emissiveIntensity: 0.7});
    var upMesh = new THREE.Mesh(upGeom, upOff);
    upMesh.position.set(0, 0.35, 0.03);
    panel.add(upMesh);

    var downArrowShape = new THREE.Shape();
    downArrowShape.moveTo(0, -0.13);
    downArrowShape.lineTo(-0.13, 0.06);
    downArrowShape.lineTo(0.13, 0.06);
    downArrowShape.lineTo(0, -0.13);
    var downGeom = new THREE.ShapeGeometry(downArrowShape);
    var downOff = new THREE.MeshLambertMaterial({color: 0x333333});
    var downOn = new THREE.MeshLambertMaterial({color: 0x00ff00, emissive: 0x00ff00, emissiveIntensity: 0.7});
    var downMesh = new THREE.Mesh(downGeom, downOff);
    downMesh.position.set(0, -0.35, 0.03);
    panel.add(downMesh);

    var indTex = makeIndicatorTexture('0', 256);
    var indPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(0.45, 0.45),
        new THREE.MeshBasicMaterial({map: indTex})
    );
    indPlane.position.set(0, -0.05, 0.03);
    panel.add(indPlane);

    panel.position.set(x, y, z);
    group.add(panel);

    panel.userData = {
        setUp: function(on) { upMesh.material = on ? upOn : upOff; },
        setDown: function(on) { downMesh.material = on ? downOn : downOff; },
        setIndicator: function(text) { updateTextTexture(indTex, text); },
        _indTex: indTex
    };
    return panel;
}

function createShaftIndicator(group, x, y, z) {
    var tex = makeIndicatorTexture('', 256);
    var plane = new THREE.Mesh(
        new THREE.PlaneGeometry(0.9, 0.9),
        new THREE.MeshBasicMaterial({map: tex})
    );
    plane.position.set(x, y, z);
    group.add(plane);
    return {mesh: plane, tex: tex};
}

function createInCarIndicator(group, x, y, z) {
    var tex = makeIndicatorTexture('', 128);
    var plane = new THREE.Mesh(
        new THREE.PlaneGeometry(0.6, 0.6),
        new THREE.MeshBasicMaterial({map: tex})
    );
    plane.position.set(x, y, z);
    plane.rotation.y = Math.PI;
    group.add(plane);
    return {mesh: plane, tex: tex};
}

function buildFloorNodes(floorNum) {
    var fy = floorNum * W.FLOOR_HEIGHT;
    var nodes = {};
    var hw = W.SHAFT_WIDTH / 2;
    var hd = W.SHAFT_DEPTH / 2;
    var bhw = W.BUILDING_WIDTH / 2;
    var bhd = W.BUILDING_DEPTH / 2;

    nodes.elevWait = {pos: new THREE.Vector3(0, fy, hd + 1.2)};

    var hallR = bhw - hw - 0.8;
    var halfHallR = hallR * 0.5;
    nodes.hallS  = {pos: new THREE.Vector3(0, fy, hd + halfHallR)};
    nodes.hallSE = {pos: new THREE.Vector3(hw + halfHallR, fy, hd + halfHallR)};
    nodes.hallE  = {pos: new THREE.Vector3(hw + halfHallR, fy, 0)};
    nodes.hallNE = {pos: new THREE.Vector3(hw + halfHallR, fy, -hd - halfHallR)};
    nodes.hallN  = {pos: new THREE.Vector3(0, fy, -hd - halfHallR)};
    nodes.hallNW = {pos: new THREE.Vector3(-hw - halfHallR, fy, -hd - halfHallR)};
    nodes.hallW  = {pos: new THREE.Vector3(-hw - halfHallR, fy, 0)};
    nodes.hallSW = {pos: new THREE.Vector3(-hw - halfHallR, fy, hd + halfHallR)};

    var edges = [
        ['elevWait','hallS'],
        ['hallS','hallSE'], ['hallSE','hallE'], ['hallE','hallNE'],
        ['hallNE','hallN'], ['hallN','hallNW'], ['hallNW','hallW'],
        ['hallW','hallSW'], ['hallSW','hallS']
    ];

    if (floorNum === 0) {
        nodes.entrance = {pos: new THREE.Vector3(0, 0, bhd)};
        nodes.outside = {pos: new THREE.Vector3(0, 0, bhd + 3)};
        edges.push(['elevWait','entrance'], ['entrance','outside']);

        nodes.cafe_order = {pos: new THREE.Vector3(-8, 0, 3)};
        nodes.cafe_door = {pos: new THREE.Vector3(-5, 0, hd + 1.5)};
        edges.push(['hallSW','cafe_door'], ['cafe_door','cafe_order']);

        var cafeTables = [
            {name: 'bistro0', x: -7.5, z: 1, c0f: Math.PI, c1f: 0},
            {name: 'bistro1', x: -7.5, z: -1.5, c0f: 0, c1f: Math.PI},
            {name: 'bistro2', x: -5, z: 1, c0f: Math.PI, c1f: 0},
            {name: 'bistro3', x: -5, z: -1.5, c0f: 0, c1f: Math.PI}
        ];
        cafeTables.forEach(function(t) {
            nodes[t.name + '_table'] = {pos: new THREE.Vector3(t.x, 0, t.z)};
            nodes[t.name + '_c0'] = {pos: new THREE.Vector3(t.x + 0.5, 0, t.z + 0.5)};
            nodes[t.name + '_c1'] = {pos: new THREE.Vector3(t.x - 0.5, 0, t.z - 0.5)};
            edges.push([t.name + '_table', t.name + '_c0'], [t.name + '_table', t.name + '_c1']);
            edges.push(['cafe_door', t.name + '_table']);
        });

        nodes.frontLounge_couch = {pos: new THREE.Vector3(7, 0, 6)};
        nodes.frontLounge_table = {pos: new THREE.Vector3(7, 0, 4.5)};
        nodes.frontLounge_arm0 = {pos: new THREE.Vector3(5.5, 0, 4.5)};
        nodes.frontLounge_arm1 = {pos: new THREE.Vector3(8.5, 0, 4.5)};
        edges.push(
            ['hallSE','frontLounge_couch'], ['frontLounge_couch','frontLounge_table'],
            ['frontLounge_table','frontLounge_arm0'], ['frontLounge_table','frontLounge_arm1'],
            ['hallSE','frontLounge_arm0'], ['hallSE','frontLounge_arm1']
        );

        nodes.backLounge_N = {pos: new THREE.Vector3(0, 0, -6)};
        nodes.backLounge_S = {pos: new THREE.Vector3(0, 0, -4)};
        nodes.backLounge_table = {pos: new THREE.Vector3(0, 0, -5)};
        edges.push(
            ['hallN','backLounge_table'], ['backLounge_table','backLounge_N'],
            ['backLounge_table','backLounge_S']
        );

        nodes.pit_N = {pos: new THREE.Vector3(-6, 0, -5.5)};
        nodes.pit_S = {pos: new THREE.Vector3(-6, 0, -4)};
        nodes.pit_E = {pos: new THREE.Vector3(-5, 0, -4.75)};
        nodes.pit_W = {pos: new THREE.Vector3(-7, 0, -4.75)};
        nodes.pit_center = {pos: new THREE.Vector3(-6, 0, -4.75)};
        edges.push(
            ['hallNW','pit_center'], ['pit_center','pit_N'], ['pit_center','pit_S'],
            ['pit_center','pit_E'], ['pit_center','pit_W']
        );

        nodes.lobby_wc_front = {pos: new THREE.Vector3(3, 0, 7)};
        nodes.lobby_wc_back = {pos: new THREE.Vector3(-3, 0, -3)};
        edges.push(['hallSE','lobby_wc_front'], ['hallN','lobby_wc_back']);

        nodes.reception = {pos: new THREE.Vector3(-3, 0, 6)};
        edges.push(['hallSW','reception'], ['reception','entrance']);

        nodes.kiosk = {pos: new THREE.Vector3(2, 0, 8)};
        edges.push(['entrance','kiosk'], ['kiosk','hallSE']);

        nodes.lobby_stand_center = {pos: new THREE.Vector3(0, 0, 4)};
        nodes.lobby_stand_NE = {pos: new THREE.Vector3(5, 0, 5)};
        nodes.lobby_stand_NW = {pos: new THREE.Vector3(-5, 0, 5)};
        nodes.lobby_stand_midE = {pos: new THREE.Vector3(5, 0, 0)};
        nodes.lobby_stand_midW = {pos: new THREE.Vector3(-5, 0, 0)};
        nodes.lobby_stand_entry = {pos: new THREE.Vector3(0, 0, 7)};
        edges.push(
            ['hallS','lobby_stand_center'], ['hallSE','lobby_stand_NE'],
            ['hallSW','lobby_stand_NW'], ['hallE','lobby_stand_midE'],
            ['hallW','lobby_stand_midW'], ['entrance','lobby_stand_entry'],
            ['lobby_stand_center','lobby_stand_NE'], ['lobby_stand_center','lobby_stand_NW'],
            ['lobby_stand_entry','lobby_stand_center']
        );

    } else {
        var offices = [
            {id: 'A', cx: -6, cz: -7, dx: -5.5, dz: -8.5, df: Math.PI, doorX: -6, doorZ: -4.5},
            {id: 'B', cx: -2, cz: -7, dx: -1.5, dz: -8.5, df: Math.PI, doorX: -2, doorZ: -4.5},
            {id: 'C', cx: 2, cz: -7, dx: 2.5, dz: -8.5, df: Math.PI, doorX: 2, doorZ: -4.5},
            {id: 'D', cx: 6, cz: -7, dx: 6.5, dz: -8.5, df: Math.PI, doorX: 6, doorZ: -4.5}
        ];
        offices.forEach(function(o) {
            nodes['office' + o.id + '_door'] = {pos: new THREE.Vector3(o.doorX, fy, o.doorZ)};
            nodes['office' + o.id + '_desk'] = {pos: new THREE.Vector3(o.dx, fy, o.dz)};
            edges.push(['hallNW','office' + o.id + '_door'], ['hallN','office' + o.id + '_door']);
            if (o.id === 'C' || o.id === 'D') {
                edges.push(['hallNE','office' + o.id + '_door']);
            }
            edges.push(['office' + o.id + '_door','office' + o.id + '_desk']);
        });

        nodes.conf_door = {pos: new THREE.Vector3(-5, fy, 4.5)};
        nodes.conf_center = {pos: new THREE.Vector3(-7, fy, 6)};
        nodes.conf_seat0 = {pos: new THREE.Vector3(-8.5, fy, 6)};
        nodes.conf_seat1 = {pos: new THREE.Vector3(-5.5, fy, 6)};
        nodes.conf_seat2 = {pos: new THREE.Vector3(-8.5, fy, 7.2)};
        nodes.conf_seat3 = {pos: new THREE.Vector3(-5.5, fy, 7.2)};
        edges.push(
            ['hallSW','conf_door'], ['conf_door','conf_center'],
            ['conf_center','conf_seat0'], ['conf_center','conf_seat1'],
            ['conf_center','conf_seat2'], ['conf_center','conf_seat3']
        );

        nodes.lounge_door = {pos: new THREE.Vector3(5, fy, 4.5)};
        nodes.lounge_center = {pos: new THREE.Vector3(7, fy, 6)};
        nodes.lounge_couch = {pos: new THREE.Vector3(7, fy, 5)};
        nodes.lounge_arm0 = {pos: new THREE.Vector3(5.5, fy, 7)};
        nodes.lounge_arm1 = {pos: new THREE.Vector3(8.5, fy, 7)};
        nodes.lounge_table = {pos: new THREE.Vector3(7, fy, 6.5)};
        nodes.water_cooler = {pos: new THREE.Vector3(9, fy, 8)};
        edges.push(
            ['hallSE','lounge_door'], ['lounge_door','lounge_center'],
            ['lounge_center','lounge_couch'], ['lounge_center','lounge_arm0'],
            ['lounge_center','lounge_arm1'], ['lounge_center','lounge_table'],
            ['lounge_center','water_cooler']
        );

        nodes.hall_stand_N = {pos: new THREE.Vector3(0, fy, -hd - halfHallR - 1)};
        nodes.hall_stand_S = {pos: new THREE.Vector3(0, fy, hd + halfHallR + 1)};
        edges.push(['hallN','hall_stand_N'], ['hallS','hall_stand_S']);
    }

    nodes._edges = edges;
    return nodes;
}

function bfsPath(nodes, fromName, toName) {
    if (fromName === toName) return [nodes[toName].pos.clone()];
    var adj = {};
    var edgeList = nodes._edges || [];
    edgeList.forEach(function(e) {
        if (!adj[e[0]]) adj[e[0]] = [];
        if (!adj[e[1]]) adj[e[1]] = [];
        adj[e[0]].push(e[1]);
        adj[e[1]].push(e[0]);
    });

    var visited = {};
    var parent = {};
    var queue = [fromName];
    visited[fromName] = true;
    while (queue.length > 0) {
        var cur = queue.shift();
        if (cur === toName) break;
        var neighbors = adj[cur] || [];
        for (var i = 0; i < neighbors.length; i++) {
            var n = neighbors[i];
            if (!visited[n] && nodes[n]) {
                visited[n] = true;
                parent[n] = cur;
                queue.push(n);
            }
        }
    }
    if (!visited[toName]) return [nodes[fromName].pos.clone(), nodes[toName].pos.clone()];
    var path = [];
    var c = toName;
    while (c !== undefined) {
        path.unshift(c);
        c = parent[c];
    }
    return path.map(function(name) { return nodes[name].pos.clone(); });
}

function buildFloorGeometry(floorNum, buildingGroup) {
    var fy = floorNum * W.FLOOR_HEIGHT;
    var bhw = W.BUILDING_WIDTH / 2;
    var bhd = W.BUILDING_DEPTH / 2;
    var hw = W.SHAFT_WIDTH / 2;
    var hd = W.SHAFT_DEPTH / 2;
    var fh = W.FLOOR_HEIGHT;

    if (floorNum === 0) {
        var groundSlab = box(W.BUILDING_WIDTH, 0.15, W.BUILDING_DEPTH, groundMat);
        groundSlab.position.set(0, fy - 0.075, 0);
        buildingGroup.add(groundSlab);

        var sidewalk = box(6, 0.1, 4, sidewalkMat);
        sidewalk.position.set(0, fy - 0.05, bhd + 2);
        buildingGroup.add(sidewalk);

    } else {
        var frontStrip = box(W.BUILDING_WIDTH - W.SHAFT_WIDTH, 0.15, bhd - hd, floorMat);
        frontStrip.position.set(0, fy - 0.075, (bhd + hd) / 2);
        buildingGroup.add(frontStrip);

        var backStrip = box(W.BUILDING_WIDTH - W.SHAFT_WIDTH, 0.15, bhd - hd, floorMat);
        backStrip.position.set(0, fy - 0.075, -(bhd + hd) / 2);
        buildingGroup.add(backStrip);

        var leftStrip = box(bhw - hw, 0.15, W.SHAFT_DEPTH, floorMat);
        leftStrip.position.set(-(hw + (bhw - hw) / 2), fy - 0.075, 0);
        buildingGroup.add(leftStrip);

        var rightStrip = box(bhw - hw, 0.15, W.SHAFT_DEPTH, floorMat);
        rightStrip.position.set(hw + (bhw - hw) / 2, fy - 0.075, 0);
        buildingGroup.add(rightStrip);
    }

    if (floorNum === 0) {
        var sideWallL = box(0.08, fh, W.BUILDING_DEPTH, wallMat);
        sideWallL.position.set(-bhw, fy + fh / 2, 0);
        buildingGroup.add(sideWallL);
        var sideWallR = box(0.08, fh, W.BUILDING_DEPTH, wallMat);
        sideWallR.position.set(bhw, fy + fh / 2, 0);
        buildingGroup.add(sideWallR);
        var backWall = box(W.BUILDING_WIDTH, fh, 0.08, wallMat);
        backWall.position.set(0, fy + fh / 2, -bhd);
        buildingGroup.add(backWall);

        var frontLeft = box(bhw - 1.5, fh, 0.08, wallMat);
        frontLeft.position.set(-(1.5 + (bhw - 1.5) / 2), fy + fh / 2, bhd);
        buildingGroup.add(frontLeft);
        var frontRight = box(bhw - 1.5, fh, 0.08, wallMat);
        frontRight.position.set(1.5 + (bhw - 1.5) / 2, fy + fh / 2, bhd);
        buildingGroup.add(frontRight);

        var entranceTop = box(3, fh - 2.2, 0.08, wallMat);
        entranceTop.position.set(0, fy + 2.2 + (fh - 2.2) / 2, bhd);
        buildingGroup.add(entranceTop);

        var glassDoor1 = box(1.4, 2.2, 0.04, glassDoorMat);
        glassDoor1.position.set(-0.75, fy + 1.1, bhd);
        buildingGroup.add(glassDoor1);
        var glassDoor2 = box(1.4, 2.2, 0.04, glassDoorMat);
        glassDoor2.position.set(0.75, fy + 1.1, bhd);
        buildingGroup.add(glassDoor2);
    } else {
        var sideL = box(0.08, fh, W.BUILDING_DEPTH, wallMat);
        sideL.position.set(-bhw, fy + fh / 2, 0);
        buildingGroup.add(sideL);
        var sideR = box(0.08, fh, W.BUILDING_DEPTH, wallMat);
        sideR.position.set(bhw, fy + fh / 2, 0);
        buildingGroup.add(sideR);
        var back = box(W.BUILDING_WIDTH, fh, 0.08, wallMat);
        back.position.set(0, fy + fh / 2, -bhd);
        buildingGroup.add(back);
        var front = box(W.BUILDING_WIDTH, fh, 0.08, wallMat);
        front.position.set(0, fy + fh / 2, bhd);
        buildingGroup.add(front);
    }

    if (floorNum > 0) {
        var officeZ = -7;
        for (var i = 0; i < 4; i++) {
            var ox = -9.5 + i * 5;
            var lwall = box(0.06, fh, 4, intWallMat);
            lwall.position.set(ox - 2, fy + fh / 2, officeZ);
            buildingGroup.add(lwall);
            var rwall = box(0.06, fh, 4, intWallMat);
            rwall.position.set(ox + 2, fy + fh / 2, officeZ);
            buildingGroup.add(rwall);
            var bwall = box(4.06, fh, 0.06, intWallMat);
            bwall.position.set(ox, fy + fh / 2, officeZ - 2);
            buildingGroup.add(bwall);

            addDesk(buildingGroup, ox, fy, officeZ - 0.8, 0);
            addChair(buildingGroup, ox, fy, officeZ + 0.2, Math.PI);
        }

        var confBackWall = box(0.06, fh, 6, intWallMat);
        confBackWall.position.set(-11, fy + fh / 2, 6);
        buildingGroup.add(confBackWall);
        var confLeftWall = box(8, fh, 0.06, intWallMat);
        confLeftWall.position.set(-7, fy + fh / 2, 9);
        buildingGroup.add(confLeftWall);
        var confRightWall = box(8, fh, 0.06, intWallMat);
        confRightWall.position.set(-7, fy + fh / 2, 3);
        buildingGroup.add(confRightWall);
        var confFrontWallL = box(4, fh, 0.06, intWallMat);
        confFrontWallL.position.set(-9, fy + fh / 2, 3);
        buildingGroup.add(confFrontWallL);
        var confFrontWallR = box(4, fh, 0.06, intWallMat);
        confFrontWallR.position.set(-5, fy + fh / 2, 3);
        buildingGroup.add(confFrontWallR);

        addLongTable(buildingGroup, -7, fy, 6.2, 2.2, 1.0);
        addConferenceChair(buildingGroup, -8.5, fy, 6, Math.PI / 2);
        addConferenceChair(buildingGroup, -5.5, fy, 6, -Math.PI / 2);
        addConferenceChair(buildingGroup, -8.5, fy, 7.2, Math.PI / 2);
        addConferenceChair(buildingGroup, -5.5, fy, 7.2, -Math.PI / 2);

        var loungeBackWall = box(0.06, fh, 6, intWallMat);
        loungeBackWall.position.set(11, fy + fh / 2, 6);
        buildingGroup.add(loungeBackWall);
        var loungeLeftWall = box(8, fh, 0.06, intWallMat);
        loungeLeftWall.position.set(7, fy + fh / 2, 3);
        buildingGroup.add(loungeLeftWall);
        var loungeRightWall = box(8, fh, 0.06, intWallMat);
        loungeRightWall.position.set(7, fy + fh / 2, 9);
        buildingGroup.add(loungeRightWall);
        var loungeFrontWallL = box(4, fh, 0.06, intWallMat);
        loungeFrontWallL.position.set(9, fy + fh / 2, 3);
        buildingGroup.add(loungeFrontWallL);
        var loungeFrontWallR = box(4, fh, 0.06, intWallMat);
        loungeFrontWallR.position.set(5, fy + fh / 2, 3);
        buildingGroup.add(loungeFrontWallR);

        addCouch(buildingGroup, 7, fy, 5, Math.PI);
        addCoffeeTable(buildingGroup, 7, fy, 6.5);
        addArmchair(buildingGroup, 5.5, fy, 7, -Math.PI / 2);
        addArmchair(buildingGroup, 8.5, fy, 7, Math.PI / 2);
        addWaterCooler(buildingGroup, 9, fy, 8);
        addPottedPlant(buildingGroup, 3.5, fy, 4);

    } else {
        addCafeCounter(buildingGroup, -8, 0, 2);
        for (var ti = 0; ti < 4; ti++) {
            var tnames = ['bistro0', 'bistro1', 'bistro2', 'bistro3'];
            var tdata = [
                {x: -7.5, z: 1}, {x: -7.5, z: -1.5},
                {x: -5, z: 1}, {x: -5, z: -1.5}
            ];
            addBistroTable(buildingGroup, tdata[ti].x, 0, tdata[ti].z);
            addBistroChair(buildingGroup, tdata[ti].x + 0.5, 0, tdata[ti].z + 0.5, Math.PI);
            addBistroChair(buildingGroup, tdata[ti].x - 0.5, 0, tdata[ti].z - 0.5, 0);
        }

        addCouch(buildingGroup, 7, 0, 6, Math.PI);
        addCoffeeTable(buildingGroup, 7, 0, 4.5);
        addArmchair(buildingGroup, 5.5, 0, 4.5, -Math.PI / 2);
        addArmchair(buildingGroup, 8.5, 0, 4.5, Math.PI / 2);
        addWaterCooler(buildingGroup, 3, 0, 7);
        addPottedPlant(buildingGroup, 1.5, 0, 8.5);
        addPottedPlant(buildingGroup, -1.5, 0, 8.5);

        addCouch(buildingGroup, -1.5, 0, -6, 0);
        addCouch(buildingGroup, 1.5, 0, -6, Math.PI);
        addCoffeeTable(buildingGroup, 0, 0, -5);

        var pitTable = cylinder(0.4, 0.4, 0.04, 8, tableMat);
        pitTable.position.set(-6, 0.4, -4.75);
        buildingGroup.add(pitTable);
        addArmchair(buildingGroup, -6, 0, -5.5, Math.PI);
        addArmchair(buildingGroup, -6, 0, -4, 0);
        addArmchair(buildingGroup, -5, 0, -4.75, -Math.PI / 2);
        addArmchair(buildingGroup, -7, 0, -4.75, Math.PI / 2);

        addWaterCooler(buildingGroup, -3, 0, -3);

        addReceptionDesk(buildingGroup, -3, 0, 6, 0);
        addInfoKiosk(buildingGroup, 2, 0, 8);
    }
}

function buildSitTargets(floorNum) {
    var sitTargets = {};
    var fy = floorNum * W.FLOOR_HEIGHT;

    if (floorNum === 0) {
        var bt = [
            {n: 'bistro0_c0', f: Math.PI}, {n: 'bistro0_c1', f: 0},
            {n: 'bistro1_c0', f: Math.PI}, {n: 'bistro1_c1', f: 0},
            {n: 'bistro2_c0', f: Math.PI}, {n: 'bistro2_c1', f: 0},
            {n: 'bistro3_c0', f: Math.PI}, {n: 'bistro3_c1', f: 0}
        ];
        bt.forEach(function(b) { sitTargets[b.n] = {sit: true, facing: b.f}; });
        sitTargets.frontLounge_arm0 = {sit: true, facing: Math.PI / 2};
        sitTargets.frontLounge_arm1 = {sit: true, facing: -Math.PI / 2};
        sitTargets.frontLounge_couch = {sit: true, facing: 0};
        sitTargets.backLounge_N = {sit: true, facing: Math.PI};
        sitTargets.backLounge_S = {sit: true, facing: 0};
        sitTargets.pit_N = {sit: true, facing: Math.PI};
        sitTargets.pit_S = {sit: true, facing: 0};
        sitTargets.pit_E = {sit: true, facing: -Math.PI / 2};
        sitTargets.pit_W = {sit: true, facing: Math.PI / 2};
        sitTargets.cafe_order = {sit: false, facing: 0};
        sitTargets.lobby_wc_front = {sit: false, facing: -1};
        sitTargets.lobby_wc_back = {sit: false, facing: -1};
        sitTargets.reception = {sit: false, facing: Math.PI};
        sitTargets.kiosk = {sit: false, facing: Math.PI};
        sitTargets.lobby_stand_center = {sit: false, facing: 0};
        sitTargets.lobby_stand_NE = {sit: false, facing: -Math.PI / 4};
        sitTargets.lobby_stand_NW = {sit: false, facing: Math.PI / 4};
        sitTargets.lobby_stand_midE = {sit: false, facing: -Math.PI / 2};
        sitTargets.lobby_stand_midW = {sit: false, facing: Math.PI / 2};
        sitTargets.lobby_stand_entry = {sit: false, facing: 0};
        sitTargets.outside = {sit: false, facing: Math.PI};
        sitTargets.entrance = {sit: false, facing: 0};
        sitTargets.elevWait = {sit: false, facing: Math.PI};
    } else {
        var officeIds = ['A','B','C','D'];
        officeIds.forEach(function(id) {
            sitTargets['office' + id + '_desk'] = {sit: true, facing: Math.PI};
        });
        sitTargets.conf_seat0 = {sit: true, facing: -Math.PI / 2};
        sitTargets.conf_seat1 = {sit: true, facing: Math.PI / 2};
        sitTargets.conf_seat2 = {sit: true, facing: -Math.PI / 2};
        sitTargets.conf_seat3 = {sit: true, facing: Math.PI / 2};
        sitTargets.lounge_couch = {sit: true, facing: 0};
        sitTargets.lounge_arm0 = {sit: true, facing: Math.PI / 2};
        sitTargets.lounge_arm1 = {sit: true, facing: -Math.PI / 2};
        sitTargets.water_cooler = {sit: false, facing: -1};
        sitTargets.hall_stand_N = {sit: false, facing: Math.PI};
        sitTargets.hall_stand_S = {sit: false, facing: 0};
        sitTargets.elevWait = {sit: false, facing: Math.PI};
    }
    return sitTargets;
}

function createWorld(scene) {
    var buildingGroup = new THREE.Group();
    buildingGroup.renderOrder = 0;

    var shaftH = W.FLOOR_COUNT * W.FLOOR_HEIGHT;
    var hw = W.SHAFT_WIDTH / 2;
    var hd = W.SHAFT_DEPTH / 2;

    var shaftBack = box(W.SHAFT_WIDTH, shaftH, 0.06, new THREE.MeshLambertMaterial({
        color: 0x888888, transparent: true, opacity: 0.15, depthWrite: false, side: THREE.DoubleSide
    }));
    shaftBack.position.set(0, shaftH / 2, -hd);
    buildingGroup.add(shaftBack);
    var shaftLeft = box(0.06, shaftH, W.SHAFT_DEPTH, new THREE.MeshLambertMaterial({
        color: 0x888888, transparent: true, opacity: 0.15, depthWrite: false, side: THREE.DoubleSide
    }));
    shaftLeft.position.set(-hw, shaftH / 2, 0);
    buildingGroup.add(shaftLeft);
    var shaftRight = box(0.06, shaftH, W.SHAFT_DEPTH, new THREE.MeshLambertMaterial({
        color: 0x888888, transparent: true, opacity: 0.15, depthWrite: false, side: THREE.DoubleSide
    }));
    shaftRight.position.set(hw, shaftH / 2, 0);
    buildingGroup.add(shaftRight);

    for (var fn = 0; fn < W.FLOOR_COUNT; fn++) {
        buildFloorGeometry(fn, buildingGroup);
    }

    var roof = box(W.BUILDING_WIDTH, 0.2, W.BUILDING_DEPTH, roofMat);
    roof.position.set(0, W.FLOOR_COUNT * W.FLOOR_HEIGHT, 0);
    buildingGroup.add(roof);

    scene.add(buildingGroup);

    var floors = [];
    var callPanels = [];
    var shaftIndicators = [];

    for (var fn = 0; fn < W.FLOOR_COUNT; fn++) {
        var fy = fn * W.FLOOR_HEIGHT;
        var nodes = buildFloorNodes(fn);
        var panel = createCallPanel(buildingGroup, hw + 0.8, fy + 1.2, hd + 0.05);
        var shaftInd = createShaftIndicator(buildingGroup, 0, fy + W.FLOOR_HEIGHT - 0.6, hd + 0.05);

        var floorData = {
            floorNumber: fn,
            nodes: nodes,
            callPanel: panel,
            shaftIndicator: shaftInd,
            sitTargets: buildSitTargets(fn)
        };

        if (fn > 0) {
            floorData.desks = [
                {id: 'A', wpName: 'officeA_desk', doorWpName: 'officeA_door'},
                {id: 'B', wpName: 'officeB_desk', doorWpName: 'officeB_door'},
                {id: 'C', wpName: 'officeC_desk', doorWpName: 'officeC_door'},
                {id: 'D', wpName: 'officeD_desk', doorWpName: 'officeD_door'}
            ];
        }

        floors.push(floorData);
    }

    return {
        buildingGroup: buildingGroup,
        floors: floors,
        bfsPath: bfsPath
    };
}

function createInCarIndicator(group, x, y, z) {
    var tex = makeIndicatorTexture('', 128);
    var plane = new THREE.Mesh(
        new THREE.PlaneGeometry(0.6, 0.6),
        new THREE.MeshBasicMaterial({map: tex})
    );
    plane.position.set(x, y, z);
    plane.rotation.y = Math.PI;
    group.add(plane);
    return {mesh: plane, tex: tex};
}

root.createWorld = createWorld;
root.bfsPath = bfsPath;
root.WORLD = W;
root.updateTextTexture = updateTextTexture;
root.createInCarIndicator = createInCarIndicator;

})(window);