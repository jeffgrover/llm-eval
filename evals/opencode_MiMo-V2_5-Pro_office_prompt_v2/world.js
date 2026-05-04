/*  world.js  –  building geometry, per-floor layouts, navigation graph, call panels  */

var WORLD = {
    FLOOR_HEIGHT: 3.4,
    FLOOR_COUNT: 6,
    BUILDING_WIDTH: 22,
    BUILDING_DEPTH: 18,
    SHAFT_WIDTH: 3,
    SHAFT_DEPTH: 3,
    PERSON_R: 0.4
};

var _textTexCache = {};
function _makeTextTex(key, w, h, fg, bg, fontSize) {
    if (_textTexCache[key]) return _textTexCache[key];
    var canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    var tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    tex._lastText = "";
    tex._canvas = canvas;
    tex._ctx = canvas.getContext("2d");
    tex._fg = fg; tex._bg = bg; tex._fontSize = fontSize;
    _textTexCache[key] = tex;
    return tex;
}

function _updateTexText(tex, text) {
    if (tex._lastText === text) return;
    tex._lastText = text;
    var c = tex._canvas, ctx = tex._ctx;
    ctx.fillStyle = tex._bg;
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = tex._fg;
    ctx.font = "bold " + tex._fontSize + "px monospace";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.shadowColor = tex._fg; ctx.shadowBlur = 8;
    ctx.fillText(text, c.width / 2, c.height / 2);
    ctx.shadowBlur = 0;
    tex.needsUpdate = true;
}

// ---- helpers ----
var _transparentMat = function (color, opacity) {
    return new THREE.MeshLambertMaterial({
        color: color, transparent: true, opacity: opacity,
        depthWrite: false, side: THREE.DoubleSide
    });
};

var _floorSlabMat  = _transparentMat(0x888888, 0.3);
var _wallMat       = _transparentMat(0x9999ff, 0.2);
var _intWallMat    = _transparentMat(0xbbc5e6, 0.28);
var _glassMat      = _transparentMat(0xaaccff, 0.35);
var _deskMat       = new THREE.MeshLambertMaterial({ color: 0x8B7355 });
var _chairMat      = new THREE.MeshLambertMaterial({ color: 0x444444 });
var _monitorMat    = new THREE.MeshLambertMaterial({ color: 0x222222 });
var _plantMat      = new THREE.MeshLambertMaterial({ color: 0x228B22 });
var _potMat        = new THREE.MeshLambertMaterial({ color: 0x8B4513 });
var _concreteMat   = new THREE.MeshLambertMaterial({ color: 0x999999 });
var _couchMat      = new THREE.MeshLambertMaterial({ color: 0x665577 });
var _tableMat      = new THREE.MeshLambertMaterial({ color: 0x7B6B5A });
var _counterMat    = new THREE.MeshLambertMaterial({ color: 0x5a4a3a });
var _waterMat      = new THREE.MeshLambertMaterial({ color: 0x44aadd });

// ---- furniture builders ----

function _desk(x, y, z, rotY) {
    var g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = rotY || 0;
    // tabletop
    var top = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.06, 0.6), _deskMat);
    top.position.y = 0.75;
    g.add(top);
    // monitor
    var mon = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.35, 0.04), _monitorMat);
    mon.position.set(0, 1.0, -0.2);
    g.add(mon);
    // chair
    var chair = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.06, 0.4), _chairMat);
    chair.position.set(0, 0.5, 0.5);
    g.add(chair);
    return g;
}

function _chair(x, y, z, rotY) {
    var g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = rotY || 0;
    var seat = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.06, 0.4), _chairMat);
    seat.position.y = 0.45;
    g.add(seat);
    var back = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.04), _chairMat);
    back.position.set(0, 0.65, -0.18);
    g.add(back);
    return g;
}

function _plant(x, y, z) {
    var g = new THREE.Group();
    g.position.set(x, y, z);
    var pot = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.35, 8), _potMat);
    pot.position.y = 0.175;
    g.add(pot);
    var foliage = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), _plantMat);
    foliage.position.y = 0.55;
    g.add(foliage);
    return g;
}

function _waterCooler(x, y, z) {
    var g = new THREE.Group();
    g.position.set(x, y, z);
    var body = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.9, 0.3), _waterMat);
    body.position.y = 0.45;
    g.add(body);
    var jug = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.35, 8), _waterMat);
    jug.position.y = 1.1;
    g.add(jug);
    return g;
}

function _couch(x, y, z, rotY) {
    var g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = rotY || 0;
    var base = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.35, 0.7), _couchMat);
    base.position.y = 0.175;
    g.add(base);
    var back = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.4, 0.12), _couchMat);
    back.position.set(0, 0.55, -0.3);
    g.add(back);
    return g;
}

function _armchair(x, y, z, rotY) {
    var g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = rotY || 0;
    var base = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.35, 0.6), _couchMat);
    base.position.y = 0.175;
    g.add(base);
    var back = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.1), _couchMat);
    back.position.set(0, 0.55, -0.25);
    g.add(back);
    return g;
}

function _coffeeTable(x, y, z) {
    var t = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.04, 0.5), _tableMat);
    t.position.set(x, y + 0.35, z);
    return t;
}

function _bistroTable(x, y, z) {
    var g = new THREE.Group();
    g.position.set(x, y, z);
    var top = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.04, 12), _tableMat);
    top.position.y = 0.7;
    g.add(top);
    var leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.7, 6), _tableMat);
    leg.position.y = 0.35;
    g.add(leg);
    _chair(-0.45, y, 0, 0).forEach ? null : 0;
    return g;
}

function _counter(x, y, z) {
    var g = new THREE.Group();
    g.position.set(x, y, z);
    var base = new THREE.Mesh(new THREE.BoxGeometry(3, 0.9, 0.6), _counterMat);
    base.position.y = 0.45;
    g.add(base);
    var top = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.05, 0.65), new THREE.MeshLambertMaterial({ color: 0x888888 }));
    top.position.y = 0.92;
    g.add(top);
    return g;
}

// ---- call panel ----

function _createCallPanel(x, y, z, floorNum) {
    var g = new THREE.Group();
    g.position.set(x, y, z);

    // Plate
    var plate = new THREE.Mesh(
        new THREE.BoxGeometry(0.55, 1.4, 0.05),
        new THREE.MeshLambertMaterial({ color: 0x444444 })
    );
    plate.position.y = 0.7;
    g.add(plate);

    // Up arrow
    var upShape = new THREE.Shape();
    upShape.moveTo(0, 0.13);
    upShape.lineTo(0.1, -0.06);
    upShape.lineTo(-0.1, -0.06);
    upShape.closePath();
    var upGeo = new THREE.ShapeGeometry(upShape);
    var upOff = new THREE.MeshLambertMaterial({ color: 0x333333 });
    var upOn  = new THREE.MeshLambertMaterial({ color: 0x44ff44, emissive: 0x22aa22 });
    var upArrow = new THREE.Mesh(upGeo, upOff.clone());
    upArrow.position.set(0, 1.05, 0.03);
    g.add(upArrow);

    // Down arrow
    var dnShape = new THREE.Shape();
    dnShape.moveTo(0, -0.13);
    dnShape.lineTo(0.1, 0.06);
    dnShape.lineTo(-0.1, 0.06);
    dnShape.closePath();
    var dnGeo = new THREE.ShapeGeometry(dnShape);
    var dnArrow = new THREE.Mesh(dnGeo, upOff.clone());
    dnArrow.position.set(0, 0.4, 0.03);
    g.add(dnArrow);

    // Floor indicator canvas
    var tex = _makeTextTex("panel_" + floorNum, 256, 256, "#ffbb22", "#050505", 200);
    _updateTexText(tex, "" + floorNum);
    var indMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
    var ind = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.45), indMat);
    ind.position.set(0, 0.7, 0.03);
    g.add(ind);

    g.userData = {
        setUp: function (on) {
            upArrow.material.dispose();
            upArrow.material = on ? upOn.clone() : upOff.clone();
        },
        setDown: function (on) {
            dnArrow.material.dispose();
            dnArrow.material = on ? upOn.clone() : upOff.clone();
        },
        setIndicator: function (text) { _updateTexText(tex, text); }
    };

    return g;
}

// ---- shaft indicator (above doors) ----

function _createShaftIndicator(x, y, z) {
    var tex = _makeTextTex("shaft_" + x + "_" + y, 256, 256, "#ffbb22", "#050505", 200);
    _updateTexText(tex, "0");
    var mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
    var mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), mat);
    mesh.position.set(x, y, z);
    mesh.userData = { setIndicator: function (text) { _updateTexText(tex, text); } };
    return mesh;
}

// ---- navigation graph ----

function _addEdge(nodes, a, b) {
    if (!nodes[a]) nodes[a] = { pos: null, neighbors: [] };
    if (!nodes[b]) nodes[b] = { pos: null, neighbors: [] };
    if (nodes[a].neighbors.indexOf(b) < 0) nodes[a].neighbors.push(b);
    if (nodes[b].neighbors.indexOf(a) < 0) nodes[b].neighbors.push(a);
}

function _setNode(nodes, name, pos) {
    if (!nodes[name]) nodes[name] = { pos: null, neighbors: [] };
    nodes[name].pos = pos.clone();
}

function bfsPath(nodes, fromName, toName) {
    if (fromName === toName) return [nodes[fromName].pos.clone()];
    var visited = {};
    var queue = [[fromName, [fromName]]];
    visited[fromName] = true;
    while (queue.length > 0) {
        var cur = queue.shift();
        var name = cur[0];
        var path = cur[1];
        var node = nodes[name];
        if (!node) continue;
        for (var i = 0; i < node.neighbors.length; i++) {
            var nb = node.neighbors[i];
            if (visited[nb]) continue;
            visited[nb] = true;
            var newPath = path.concat([nb]);
            if (nb === toName) {
                return newPath.map(function (n) { return nodes[n].pos.clone(); });
            }
            queue.push([nb, newPath]);
        }
    }
    return [nodes[fromName].pos.clone()]; // fallback
}

// ---- floor builders ----

function _buildOfficeFloor(scene, floorNum, buildingGroup) {
    var y0 = floorNum * WORLD.FLOOR_HEIGHT;
    var FH = WORLD.FLOOR_HEIGHT;
    var BW = WORLD.BUILDING_WIDTH;
    var BD = WORLD.BUILDING_DEPTH;
    var nodes = {};
    var sitTargets = {};

    // Hallway ring around shaft (z=0 is center, shaft at x=0,z=0)
    var hallR = 2.5; // ring radius from shaft center
    _setNode(nodes, "hallS",  new THREE.Vector3(0, y0, hallR));
    _setNode(nodes, "hallSE", new THREE.Vector3(hallR, y0, hallR));
    _setNode(nodes, "hallE",  new THREE.Vector3(hallR, y0, 0));
    _setNode(nodes, "hallNE", new THREE.Vector3(hallR, y0, -hallR));
    _setNode(nodes, "hallN",  new THREE.Vector3(0, y0, -hallR));
    _setNode(nodes, "hallNW", new THREE.Vector3(-hallR, y0, -hallR));
    _setNode(nodes, "hallW",  new THREE.Vector3(-hallR, y0, 0));
    _setNode(nodes, "hallSW", new THREE.Vector3(-hallR, y0, hallR));
    _addEdge(nodes, "hallS", "hallSE");
    _addEdge(nodes, "hallSE", "hallE");
    _addEdge(nodes, "hallE", "hallNE");
    _addEdge(nodes, "hallNE", "hallN");
    _addEdge(nodes, "hallN", "hallNW");
    _addEdge(nodes, "hallNW", "hallW");
    _addEdge(nodes, "hallW", "hallSW");
    _addEdge(nodes, "hallSW", "hallS");

    // Elevator wait node (in front of doors)
    _setNode(nodes, "elevWait", new THREE.Vector3(0, y0, hallR + 1.2));
    _addEdge(nodes, "elevWait", "hallS");

    // Office doors & desks (back wall, z negative)
    var officeLabels = ["A", "B", "C", "D"];
    var officeXPositions = [-7.5, -3.5, 3.5, 7.5];
    var desks = [];

    for (var oi = 0; oi < 4; oi++) {
        var lbl = officeLabels[oi];
        var ox = officeXPositions[oi];
        var doorWp = "office" + lbl + "_door";
        var deskWp = "office" + lbl + "_desk";
        _setNode(nodes, doorWp, new THREE.Vector3(ox, y0, -3));
        _setNode(nodes, deskWp, new THREE.Vector3(ox, y0, -7));
        _addEdge(nodes, doorWp, deskWp);

        // Link door to nearest hallway node
        if (ox < -2) {
            _addEdge(nodes, doorWp, "hallNW");
            _addEdge(nodes, doorWp, "hallSW");
        } else {
            _addEdge(nodes, doorWp, "hallNE");
            _addEdge(nodes, doorWp, "hallSE");
        }

        // Desk furniture
        var deskGroup = _desk(ox, y0, -7.5, Math.PI);
        buildingGroup.add(deskGroup);
        desks.push({ groupId: "office" + lbl, position: new THREE.Vector3(ox, y0, -7.5) });

        // Interior walls (between offices)
        if (oi < 3) {
            var wx = (ox + officeXPositions[oi + 1]) / 2;
            var wall = new THREE.Mesh(
                new THREE.BoxGeometry(0.08, FH - 0.3, 5),
                _intWallMat
            );
            wall.position.set(wx, y0 + FH / 2, -6);
            buildingGroup.add(wall);
        }

        sitTargets[deskWp] = { sit: true, facing: Math.PI };
    }

    // Office back wall (full width)
    var backWall = new THREE.Mesh(
        new THREE.BoxGeometry(BW - 2, FH - 0.3, 0.08),
        _intWallMat
    );
    backWall.position.set(0, y0 + FH / 2, -9);
    buildingGroup.add(backWall);

    // Conference room (front-left)
    _setNode(nodes, "conf_door",   new THREE.Vector3(-7, y0, 3.5));
    _setNode(nodes, "conf_center", new THREE.Vector3(-7, y0, 6.5));
    _addEdge(nodes, "conf_door", "hallSW");
    _addEdge(nodes, "conf_door", "conf_center");

    // Conference table
    var confTable = new THREE.Mesh(new THREE.BoxGeometry(3, 0.06, 1.2), _tableMat);
    confTable.position.set(-7, y0 + 0.75, 6.5);
    buildingGroup.add(confTable);

    // 4 conference seats
    for (var ci = 0; ci < 4; ci++) {
        var seatName = "conf_seat" + ci;
        var cx = -7 + (ci % 2 === 0 ? -0.8 : 0.8);
        var cz = 6.5 + (ci < 2 ? -0.8 : 0.8);
        var cFacing = ci < 2 ? 0 : Math.PI;
        _setNode(nodes, seatName, new THREE.Vector3(cx, y0, cz));
        _addEdge(nodes, "conf_center", seatName);
        buildingGroup.add(_chair(cx, y0, cz, cFacing));
        sitTargets[seatName] = { sit: true, facing: cFacing };
    }

    // Conference room walls
    var confWallBack = new THREE.Mesh(new THREE.BoxGeometry(7.5, FH - 0.3, 0.08), _intWallMat);
    confWallBack.position.set(-7, y0 + FH / 2, 9);
    buildingGroup.add(confWallBack);
    var confWallSide = new THREE.Mesh(new THREE.BoxGeometry(0.08, FH - 0.3, 6), _intWallMat);
    confWallSide.position.set(-3, y0 + FH / 2, 6);
    buildingGroup.add(confWallSide);

    // Lounge (front-right)
    _setNode(nodes, "lounge_door",   new THREE.Vector3(6, y0, 3.5));
    _setNode(nodes, "lounge_center", new THREE.Vector3(7, y0, 6.5));
    _setNode(nodes, "lounge_spot0",  new THREE.Vector3(5.5, y0, 5.5));
    _setNode(nodes, "lounge_spot1",  new THREE.Vector3(8.5, y0, 5.5));
    _setNode(nodes, "lounge_spot2",  new THREE.Vector3(7, y0, 7.5));
    _addEdge(nodes, "lounge_door", "hallSE");
    _addEdge(nodes, "lounge_door", "lounge_center");
    _addEdge(nodes, "lounge_center", "lounge_spot0");
    _addEdge(nodes, "lounge_center", "lounge_spot1");
    _addEdge(nodes, "lounge_center", "lounge_spot2");

    buildingGroup.add(_couch(7, y0, 5.5, 0));
    buildingGroup.add(_coffeeTable(7, y0, 6.5));
    buildingGroup.add(_armchair(5.5, y0, 7.5, Math.PI / 4));
    buildingGroup.add(_armchair(8.5, y0, 7.5, -Math.PI / 4));
    buildingGroup.add(_waterCooler(10, y0, 8));
    buildingGroup.add(_plant(4, y0, 8.5));

    sitTargets["lounge_spot0"] = { sit: true, facing: 0 };
    sitTargets["lounge_spot1"] = { sit: true, facing: 0 };
    sitTargets["lounge_spot2"] = { sit: true, facing: Math.PI };

    // Lounge walls
    var loungeWallBack = new THREE.Mesh(new THREE.BoxGeometry(7.5, FH - 0.3, 0.08), _intWallMat);
    loungeWallBack.position.set(7, y0 + FH / 2, 9);
    buildingGroup.add(loungeWallBack);
    var loungeWallSide = new THREE.Mesh(new THREE.BoxGeometry(0.08, FH - 0.3, 6), _intWallMat);
    loungeWallSide.position.set(3, y0 + FH / 2, 6);
    buildingGroup.add(loungeWallSide);

    // Water cooler waypoint
    _setNode(nodes, "water_cooler", new THREE.Vector3(10, y0, 8));
    _addEdge(nodes, "water_cooler", "lounge_center");

    // Hall loiter spots
    _setNode(nodes, "hall_stand_N", new THREE.Vector3(1.5, y0, -1.5));
    _setNode(nodes, "hall_stand_S", new THREE.Vector3(-1.5, y0, 1.5));
    _addEdge(nodes, "hall_stand_N", "hallNE");
    _addEdge(nodes, "hall_stand_S", "hallSW");

    // Call panel
    var callPanel = _createCallPanel(WORLD.SHAFT_WIDTH / 2 + 0.5, y0, 1.8, floorNum);
    buildingGroup.add(callPanel);

    // Shaft indicator
    var shaftInd = _createShaftIndicator(0, y0 + FH - 0.6, WORLD.SHAFT_DEPTH / 2 + 0.2);
    buildingGroup.add(shaftInd);

    return {
        floorNumber: floorNum,
        nodes: nodes,
        callPanel: callPanel,
        shaftIndicator: shaftInd,
        desks: desks,
        sitTargets: sitTargets
    };
}

function _buildLobby(scene, buildingGroup) {
    var y0 = 0;
    var FH = WORLD.FLOOR_HEIGHT;
    var BW = WORLD.BUILDING_WIDTH;
    var BD = WORLD.BUILDING_DEPTH;
    var nodes = {};
    var sitTargets = {};

    // Hallway ring
    var hallR = 2.5;
    _setNode(nodes, "hallS",  new THREE.Vector3(0, 0, hallR));
    _setNode(nodes, "hallSE", new THREE.Vector3(hallR, 0, hallR));
    _setNode(nodes, "hallE",  new THREE.Vector3(hallR, 0, 0));
    _setNode(nodes, "hallNE", new THREE.Vector3(hallR, 0, -hallR));
    _setNode(nodes, "hallN",  new THREE.Vector3(0, 0, -hallR));
    _setNode(nodes, "hallNW", new THREE.Vector3(-hallR, 0, -hallR));
    _setNode(nodes, "hallW",  new THREE.Vector3(-hallR, 0, 0));
    _setNode(nodes, "hallSW", new THREE.Vector3(-hallR, 0, hallR));
    _addEdge(nodes, "hallS", "hallSE");
    _addEdge(nodes, "hallSE", "hallE");
    _addEdge(nodes, "hallE", "hallNE");
    _addEdge(nodes, "hallNE", "hallN");
    _addEdge(nodes, "hallN", "hallNW");
    _addEdge(nodes, "hallNW", "hallW");
    _addEdge(nodes, "hallW", "hallSW");
    _addEdge(nodes, "hallSW", "hallS");

    _setNode(nodes, "elevWait", new THREE.Vector3(0, 0, hallR + 1.2));
    _addEdge(nodes, "elevWait", "hallS");

    // Entrance
    _setNode(nodes, "entrance", new THREE.Vector3(0, 0, 9));
    _addEdge(nodes, "entrance", "elevWait");

    // Outside / sidewalk
    _setNode(nodes, "outside", new THREE.Vector3(0, 0, 12));
    _addEdge(nodes, "outside", "entrance");

    // Glass doors
    var doorL = new THREE.Mesh(new THREE.BoxGeometry(1.2, FH - 0.3, 0.08), _glassMat);
    doorL.position.set(-0.7, FH / 2, 9);
    buildingGroup.add(doorL);
    var doorR = new THREE.Mesh(new THREE.BoxGeometry(1.2, FH - 0.3, 0.08), _glassMat);
    doorR.position.set(0.7, FH / 2, 9);
    buildingGroup.add(doorR);

    // Sidewalk
    var sidewalk = new THREE.Mesh(
        new THREE.BoxGeometry(8, 0.08, 5),
        _concreteMat
    );
    sidewalk.position.set(0, -0.04, 12);
    buildingGroup.add(sidewalk);

    // Plants by entrance
    buildingGroup.add(_plant(-2, 0, 9.5));
    buildingGroup.add(_plant(2, 0, 9.5));

    // ---- Cafe (left side) ----
    buildingGroup.add(_counter(-7, 0, 7));
    _setNode(nodes, "cafe_door", new THREE.Vector3(-6, 0, 3.5));
    _setNode(nodes, "cafe_order", new THREE.Vector3(-7, 0, 6));
    _addEdge(nodes, "cafe_door", "hallSW");
    _addEdge(nodes, "cafe_door", "cafe_order");

    // Bistro tables
    var bistroPositions = [[-8, 5], [-6, 5], [-8, 8], [-6, 8]];
    for (var bi = 0; bi < bistroPositions.length; bi++) {
        var bx = bistroPositions[bi][0], bz = bistroPositions[bi][1];
        var tbl = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.04, 12), _tableMat);
        tbl.position.set(bx, 0.7, bz);
        buildingGroup.add(tbl);
        buildingGroup.add(_chair(bx - 0.4, 0, bz, Math.PI / 2));
        buildingGroup.add(_chair(bx + 0.4, 0, bz, -Math.PI / 2));
        var bistroWp = "bistro_" + bi;
        _setNode(nodes, bistroWp, new THREE.Vector3(bx - 0.4, 0, bz));
        _addEdge(nodes, bistroWp, "cafe_door");
        sitTargets[bistroWp] = { sit: true, facing: Math.PI / 2 };
    }

    // ---- Front lounge (right side) ----
    buildingGroup.add(_couch(6, 0, 5, 0));
    buildingGroup.add(_coffeeTable(6, 0, 6.5));
    buildingGroup.add(_armchair(5, 0, 7.5, Math.PI / 6));
    buildingGroup.add(_armchair(7.5, 0, 7.5, -Math.PI / 6));
    buildingGroup.add(_plant(9, 0, 8));

    _setNode(nodes, "front_lounge_couch", new THREE.Vector3(6, 0, 5));
    _setNode(nodes, "front_lounge_chair1", new THREE.Vector3(5, 0, 7.5));
    _setNode(nodes, "front_lounge_chair2", new THREE.Vector3(7.5, 0, 7.5));
    _addEdge(nodes, "front_lounge_couch", "hallSE");
    _addEdge(nodes, "front_lounge_couch", "front_lounge_chair1");
    _addEdge(nodes, "front_lounge_couch", "front_lounge_chair2");
    sitTargets["front_lounge_couch"]  = { sit: true, facing: 0 };
    sitTargets["front_lounge_chair1"] = { sit: true, facing: Math.PI / 6 };
    sitTargets["front_lounge_chair2"] = { sit: true, facing: -Math.PI / 6 };

    // ---- Back lounge (z < 0) ----
    buildingGroup.add(_couch(-2, 0, -4, 0));
    buildingGroup.add(_couch(2, 0, -4, Math.PI));
    buildingGroup.add(_coffeeTable(0, 0, -4));

    _setNode(nodes, "back_lounge_N", new THREE.Vector3(-2, 0, -4));
    _setNode(nodes, "back_lounge_S", new THREE.Vector3(2, 0, -4));
    _addEdge(nodes, "back_lounge_N", "hallNW");
    _addEdge(nodes, "back_lounge_S", "hallNE");
    _addEdge(nodes, "back_lounge_N", "back_lounge_S");
    sitTargets["back_lounge_N"] = { sit: true, facing: 0 };
    sitTargets["back_lounge_S"] = { sit: true, facing: Math.PI };

    // ---- Conversation pit (back-left) ----
    var pitTable = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.04, 12), _tableMat);
    pitTable.position.set(-6, 0.7, -5);
    buildingGroup.add(pitTable);
    buildingGroup.add(_armchair(-6, 0, -3.5, Math.PI));
    buildingGroup.add(_armchair(-6, 0, -6.5, 0));
    buildingGroup.add(_armchair(-4.5, 0, -5, -Math.PI / 2));
    buildingGroup.add(_armchair(-7.5, 0, -5, Math.PI / 2));

    _setNode(nodes, "pit_N", new THREE.Vector3(-6, 0, -3.5));
    _setNode(nodes, "pit_S", new THREE.Vector3(-6, 0, -6.5));
    _setNode(nodes, "pit_E", new THREE.Vector3(-4.5, 0, -5));
    _setNode(nodes, "pit_W", new THREE.Vector3(-7.5, 0, -5));
    _addEdge(nodes, "pit_N", "hallNW");
    _addEdge(nodes, "pit_S", "pit_N");
    _addEdge(nodes, "pit_E", "pit_N");
    _addEdge(nodes, "pit_W", "pit_S");
    sitTargets["pit_N"] = { sit: true, facing: Math.PI };
    sitTargets["pit_S"] = { sit: true, facing: 0 };
    sitTargets["pit_E"] = { sit: true, facing: -Math.PI / 2 };
    sitTargets["pit_W"] = { sit: true, facing: Math.PI / 2 };

    // ---- Water coolers ----
    buildingGroup.add(_waterCooler(3, 0, -7));
    buildingGroup.add(_waterCooler(-3, 0, 7));
    _setNode(nodes, "lobby_wc_front", new THREE.Vector3(-3, 0, 7));
    _setNode(nodes, "lobby_wc_back",  new THREE.Vector3(3, 0, -7));
    _addEdge(nodes, "lobby_wc_front", "hallSW");
    _addEdge(nodes, "lobby_wc_back", "hallNE");

    // ---- Reception desk ----
    var recDesk = new THREE.Mesh(new THREE.BoxGeometry(2, 0.9, 0.8), _counterMat);
    recDesk.position.set(-3, 0.45, 6);
    buildingGroup.add(recDesk);
    _setNode(nodes, "reception", new THREE.Vector3(-3, 0, 5));
    _addEdge(nodes, "reception", "hallSW");

    // ---- Info kiosk ----
    var kiosk = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.2, 0.6), new THREE.MeshLambertMaterial({ color: 0x336699 }));
    kiosk.position.set(2, 0.6, 8);
    buildingGroup.add(kiosk);
    _setNode(nodes, "kiosk", new THREE.Vector3(2, 0, 7.5));
    _addEdge(nodes, "kiosk", "entrance");

    // ---- Lobby loiter waypoints ----
    var loiterSpots = [
        ["lobby_stand_center", 0, 0, 0],
        ["lobby_stand_NE", 5, 0, -2],
        ["lobby_stand_NW", -5, 0, -2],
        ["lobby_stand_midE", 6, 0, 1],
        ["lobby_stand_midW", -6, 0, 1],
        ["lobby_stand_entry", 0, 0, 7]
    ];
    for (var li = 0; li < loiterSpots.length; li++) {
        var ls = loiterSpots[li];
        _setNode(nodes, ls[0], new THREE.Vector3(ls[1], ls[2], ls[3]));
        // Connect to nearest hallway node
        if (ls[1] > 2 && ls[3] > 0) _addEdge(nodes, ls[0], "hallSE");
        else if (ls[1] < -2 && ls[3] > 0) _addEdge(nodes, ls[0], "hallSW");
        else if (ls[1] > 2 && ls[3] < 0) _addEdge(nodes, ls[0], "hallNE");
        else if (ls[1] < -2 && ls[3] < 0) _addEdge(nodes, ls[0], "hallNW");
        else if (ls[3] > 1) _addEdge(nodes, ls[0], "hallS");
        else _addEdge(nodes, ls[0], "hallN");
        sitTargets[ls[0]] = { sit: false, facing: 0 };
    }

    // Call panel
    var callPanel = _createCallPanel(WORLD.SHAFT_WIDTH / 2 + 0.5, 0, 1.8, 0);
    buildingGroup.add(callPanel);

    // Shaft indicator
    var shaftInd = _createShaftIndicator(0, FH - 0.6, WORLD.SHAFT_DEPTH / 2 + 0.2);
    buildingGroup.add(shaftInd);

    return {
        floorNumber: 0,
        nodes: nodes,
        callPanel: callPanel,
        shaftIndicator: shaftInd,
        desks: [],
        sitTargets: sitTargets,
        entranceSpot: new THREE.Vector3(0, 0, 9)
    };
}

// ---- main createWorld ----

function createWorld(scene) {
    var buildingGroup = new THREE.Group();
    buildingGroup.renderOrder = 0;
    scene.add(buildingGroup);

    var BW = WORLD.BUILDING_WIDTH;
    var BD = WORLD.BUILDING_DEPTH;
    var FH = WORLD.FLOOR_HEIGHT;
    var FC = WORLD.FLOOR_COUNT;
    var SHW = WORLD.SHAFT_WIDTH;
    var SHD = WORLD.SHAFT_DEPTH;

    // Ground slab
    var ground = new THREE.Mesh(
        new THREE.BoxGeometry(BW + 4, 0.2, BD + 8),
        _concreteMat
    );
    ground.position.y = -0.1;
    buildingGroup.add(ground);

    // Roof slab
    var roof = new THREE.Mesh(
        new THREE.BoxGeometry(BW, 0.2, BD),
        new THREE.MeshLambertMaterial({ color: 0x777777 })
    );
    roof.position.y = FC * FH + 0.1;
    buildingGroup.add(roof);

    // Outer walls
    // Back wall (full height)
    var backWall = new THREE.Mesh(
        new THREE.BoxGeometry(BW, FC * FH, 0.08),
        _wallMat
    );
    backWall.position.set(0, FC * FH / 2, -BD / 2);
    buildingGroup.add(backWall);

    // Side walls (full height)
    var sideWallL = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, FC * FH, BD),
        _wallMat
    );
    sideWallL.position.set(-BW / 2, FC * FH / 2, 0);
    buildingGroup.add(sideWallL);

    var sideWallR = sideWallL.clone();
    sideWallR.position.x = BW / 2;
    buildingGroup.add(sideWallR);

    // Front wall: two side panels full-height, one above-gap panel floors 1-5
    // Gap on floor 0: 3 units wide at z=BD/2
    var gapHalf = 1.5;
    // Left panel full height
    var frontL = new THREE.Mesh(
        new THREE.BoxGeometry(BW / 2 - gapHalf, FC * FH, 0.08),
        _wallMat
    );
    frontL.position.set(-(BW / 2 + gapHalf) / 2, FC * FH / 2, BD / 2);
    buildingGroup.add(frontL);

    // Right panel full height
    var frontR = new THREE.Mesh(
        new THREE.BoxGeometry(BW / 2 - gapHalf, FC * FH, 0.08),
        _wallMat
    );
    frontR.position.set((BW / 2 + gapHalf) / 2, FC * FH / 2, BD / 2);
    buildingGroup.add(frontR);

    // Above-gap panel (floors 1-5)
    var aboveGap = new THREE.Mesh(
        new THREE.BoxGeometry(gapHalf * 2, (FC - 1) * FH, 0.08),
        _wallMat
    );
    aboveGap.position.set(0, FH + (FC - 1) * FH / 2, BD / 2);
    buildingGroup.add(aboveGap);

    // Floor slabs (as 4 strips around shaft opening)
    for (var f = 1; f < FC; f++) {
        var fy = f * FH;
        var halfW = BW / 2;
        var halfD = BD / 2;
        var shaftHalfW = SHW / 2;
        var shaftHalfD = SHD / 2;

        // Front strip
        var stripF = new THREE.Mesh(
            new THREE.BoxGeometry(BW, 0.12, halfD - shaftHalfD),
            _floorSlabMat
        );
        stripF.position.set(0, fy, (shaftHalfD + halfD) / 2);
        buildingGroup.add(stripF);

        // Back strip
        var stripB = stripF.clone();
        stripB.position.z = -(shaftHalfD + halfD) / 2;
        buildingGroup.add(stripB);

        // Left strip
        var stripL = new THREE.Mesh(
            new THREE.BoxGeometry(halfW - shaftHalfW, 0.12, SHD),
            _floorSlabMat
        );
        stripL.position.set(-(shaftHalfW + halfW) / 2, fy, 0);
        buildingGroup.add(stripL);

        // Right strip
        var stripR = stripL.clone();
        stripR.position.x = (shaftHalfW + halfW) / 2;
        buildingGroup.add(stripR);
    }

    // Build floors
    var floors = [];
    floors.push(_buildLobby(scene, buildingGroup));
    for (var of = 1; of < FC; of++) {
        floors.push(_buildOfficeFloor(scene, of, buildingGroup));
    }

    return {
        buildingGroup: buildingGroup,
        floors: floors,
        bfsPath: bfsPath
    };
}

window.WORLD = WORLD;
window.createWorld = createWorld;
