// World / building geometry + per-floor layout + navigation graph.
//
// Coordinate system: X right, Y up, Z toward viewer. +Z is the "front" of the
// building (entrance side, elevator doors face +Z).
//
// Floor 0 is the ground-floor lobby (cafe, lounge, entrance).
// Floors 1..FLOOR_COUNT-1 are identical office floors (4 offices around the
// back, conference room on front-left, break lounge on front-right, hallway
// ring around the central shaft).

const WORLD = {
    FLOOR_HEIGHT:   3.4,
    FLOOR_COUNT:    6,       // 0 = lobby, 1..5 = offices
    BUILDING_WIDTH: 22,
    BUILDING_DEPTH: 18,
    SHAFT_WIDTH:    3.0,
    SHAFT_DEPTH:    3.0,
    PERSON_R:       0.4,     // radius used for soft collision separation
};

// ---- Canvas-texture utility (used for floor indicators, panel labels) ----
// Draws bright high-contrast digits with a soft glow, on a near-black back-
// ground — readable across the 25m camera distance.
function _drawIndicator(ctx, text, opts, size) {
    ctx.fillStyle = opts.bg || '#050505';
    ctx.fillRect(0, 0, size, size);
    const fg = opts.fg || '#ffbb22';
    // Fake bloom via shadowBlur so digits "glow."
    ctx.shadowColor = fg;
    ctx.shadowBlur  = size * 0.18;
    ctx.fillStyle   = fg;
    ctx.font = 'bold ' + Math.floor(size * 0.82) + 'px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, size / 2, size / 2 + size * 0.04);
    ctx.shadowBlur = 0;
}
function makeTextTexture(text, opts) {
    opts = opts || {};
    const size = opts.size || 256;
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const ctx = c.getContext('2d');
    _drawIndicator(ctx, text, opts, size);
    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    tex._canvas = c;
    tex._ctx = ctx;
    tex._opts = opts;
    tex._size = size;
    return tex;
}
function updateTextTexture(tex, text) {
    if (tex._lastText === text) return;  // skip costly re-upload when unchanged
    tex._lastText = text;
    _drawIndicator(tex._ctx, text, tex._opts || {}, tex._size);
    tex.needsUpdate = true;
}

function transparentMat(color, opacity) {
    return new THREE.MeshLambertMaterial({
        color: color, transparent: true, opacity: opacity,
        depthWrite: false, side: THREE.DoubleSide
    });
}
function solidMat(color) {
    return new THREE.MeshLambertMaterial({ color: color, side: THREE.DoubleSide });
}

// ---- Build slab around central shaft (same trick as original) ----
function buildFloorSlabWithShaft(y, material) {
    const group = new THREE.Group();
    const halfW  = WORLD.BUILDING_WIDTH / 2;
    const halfD  = WORLD.BUILDING_DEPTH / 2;
    const halfSW = WORLD.SHAFT_WIDTH / 2;
    const halfSD = WORLD.SHAFT_DEPTH / 2;
    const slabs = [
        { w: WORLD.BUILDING_WIDTH, d: halfD - halfSD, x: 0,                 z:  (halfD + halfSD) / 2 },
        { w: WORLD.BUILDING_WIDTH, d: halfD - halfSD, x: 0,                 z: -(halfD + halfSD) / 2 },
        { w: halfW - halfSW,       d: WORLD.SHAFT_DEPTH, x: -(halfW + halfSW)/2, z: 0 },
        { w: halfW - halfSW,       d: WORLD.SHAFT_DEPTH, x:  (halfW + halfSW)/2, z: 0 },
    ];
    for (const s of slabs) {
        const geo = new THREE.BoxGeometry(s.w, 0.1, s.d);
        const mesh = new THREE.Mesh(geo, material);
        mesh.position.set(s.x, y - 0.05, s.z);
        group.add(mesh);
    }
    return group;
}

// ---- Per-floor layout constants ----
// Back wall offices: 4 offices along Z:[-9,-3].
const OFFICE_LAYOUT = [
    { id: 'A', xCenter: -8.25, xRange: [-11, -5.5] },
    { id: 'B', xCenter: -2.75, xRange: [-5.5,  0  ] },
    { id: 'C', xCenter:  2.75, xRange: [ 0,   5.5 ] },
    { id: 'D', xCenter:  8.25, xRange: [ 5.5, 11  ] },
];
const OFFICE_Z_FRONT = -3;   // where office entry-door is (wall between hall and offices)
const OFFICE_Z_DESK  = -6.5; // where the desk sits
const OFFICE_Z_BACK  = -9;

// Conference room: front-left quadrant.
const CONF_X = [-11, -3];
const CONF_Z = [ 3,  9];
const CONF_CENTER = [ (CONF_X[0]+CONF_X[1])/2, (CONF_Z[0]+CONF_Z[1])/2 ];

// Lounge / break area: front-right quadrant.
const LOUNGE_X = [ 3, 11];
const LOUNGE_Z = [ 3,  9];

// ---- Desk / chair / table primitives ----
function makeDesk() {
    const g = new THREE.Group();
    const deskMat  = solidMat(0x8b5a2b);
    const monMat   = solidMat(0x222233);
    const monFrame = solidMat(0x111111);
    // Desk top (1.6 wide x 0.8 deep x 0.05 thick) at height 0.75
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.05, 0.8), deskMat);
    top.position.y = 0.75;
    g.add(top);
    // Legs
    const legGeo = new THREE.BoxGeometry(0.07, 0.75, 0.07);
    const legPositions = [ [-0.75, 0.375, -0.35], [ 0.75, 0.375, -0.35],
                           [-0.75, 0.375,  0.35], [ 0.75, 0.375,  0.35] ];
    for (const p of legPositions) {
        const m = new THREE.Mesh(legGeo, deskMat); m.position.set(...p); g.add(m);
    }
    // Monitor at back edge, facing +Z (user sits on +Z side looking at -Z face).
    // We'll orient desks so the "user side" is the side facing the hallway (+Z).
    const monStand = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.25, 0.05), monFrame);
    monStand.position.set(0, 0.9, -0.3);
    g.add(monStand);
    const mon = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.45, 0.04), monMat);
    mon.position.set(0, 1.25, -0.3);
    g.add(mon);
    // Keyboard
    const kb = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.15), solidMat(0x333333));
    kb.position.set(0, 0.79, 0.1);
    g.add(kb);
    return g;
}
function makeChair(color) {
    const g = new THREE.Group();
    const mat = solidMat(color || 0x333333);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.06, 0.55), mat);
    seat.position.y = 0.45;
    g.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.5, 0.05), mat);
    back.position.set(0, 0.72, -0.25);
    g.add(back);
    for (const p of [[-0.25,0.23,-0.25],[0.25,0.23,-0.25],[-0.25,0.23,0.25],[0.25,0.23,0.25]]) {
        const l = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.45, 0.04), mat);
        l.position.set(...p); g.add(l);
    }
    return g;
}
function makeConferenceTable() {
    const g = new THREE.Group();
    const mat = solidMat(0x444444);
    const top = new THREE.Mesh(new THREE.BoxGeometry(4, 0.1, 1.4), mat);
    top.position.y = 0.75;
    g.add(top);
    for (const p of [[-1.8,0.375,-0.6],[1.8,0.375,-0.6],[-1.8,0.375,0.6],[1.8,0.375,0.6]]) {
        const l = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.75, 0.08), mat);
        l.position.set(...p); g.add(l);
    }
    return g;
}
function makeCouch() {
    const g = new THREE.Group();
    const mat = solidMat(0x6c4e8a);
    const base = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 0.9), mat);
    base.position.y = 0.25;
    g.add(base);
    const back = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.6, 0.2), mat);
    back.position.set(0, 0.7, -0.35);
    g.add(back);
    return g;
}
function makeCafeCounter() {
    const g = new THREE.Group();
    const mat = solidMat(0x5a3a1a);
    const counter = new THREE.Mesh(new THREE.BoxGeometry(4.5, 1.05, 0.7), mat);
    counter.position.y = 0.525;
    g.add(counter);
    const topMat = solidMat(0x222222);
    const countertop = new THREE.Mesh(new THREE.BoxGeometry(4.7, 0.06, 0.8), topMat);
    countertop.position.y = 1.08;
    g.add(countertop);
    // Coffee machine
    const machine = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.55, 0.4), solidMat(0x888888));
    machine.position.set(-1.5, 1.38, 0);
    g.add(machine);
    const machine2 = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.45, 0.35), solidMat(0x994444));
    machine2.position.set(-0.8, 1.33, 0);
    g.add(machine2);
    // Pastry display
    const display = new THREE.Mesh(
        new THREE.BoxGeometry(1, 0.35, 0.6),
        new THREE.MeshLambertMaterial({ color: 0x99ccff, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false })
    );
    display.position.set(1.2, 1.28, 0);
    g.add(display);
    return g;
}
function makeWaterCooler() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.1, 0.45), solidMat(0xddddee));
    body.position.y = 0.55;
    g.add(body);
    const bottle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.2, 0.5, 16),
        new THREE.MeshLambertMaterial({ color: 0x99ddff, transparent: true, opacity: 0.55, depthWrite: false })
    );
    bottle.position.y = 1.35;
    g.add(bottle);
    return g;
}
function makeEntranceDoors() {
    const g = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({
        color: 0xaaddee, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false
    });
    const leftDoor = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.4, 0.06), mat);
    leftDoor.position.set(-0.65, 1.2, 0);
    g.add(leftDoor);
    const rightDoor = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.4, 0.06), mat);
    rightDoor.position.set(0.65, 1.2, 0);
    g.add(rightDoor);
    return g;
}

// ---- Call panel (on wall near shaft) ----
// Shows up/down arrow lights + a small digital display of the elevator's
// current floor. Returned object exposes methods to set lamp state and update
// the indicator text.
function makeCallPanel() {
    const g = new THREE.Group();
    // Panel roughly doubled: plate 0.55 × 1.4, arrows ~0.14 wide, indicator
    // 0.45 square — visible from across the building.
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.4, 0.05), solidMat(0x1a1a1a));
    g.add(plate);

    const arrowOff = new THREE.MeshLambertMaterial({ color: 0x2a2a20 });
    const arrowOnU = new THREE.MeshLambertMaterial({ color: 0x99ff55, emissive: 0x66cc22 });
    const arrowOnD = new THREE.MeshLambertMaterial({ color: 0x99ff55, emissive: 0x66cc22 });

    // Triangles for up/down arrows.
    function triangleMesh(up) {
        const shape = new THREE.Shape();
        if (up) {
            shape.moveTo(0, 0.15); shape.lineTo(-0.13, -0.09); shape.lineTo(0.13, -0.09);
        } else {
            shape.moveTo(0, -0.15); shape.lineTo(-0.13, 0.09); shape.lineTo(0.13, 0.09);
        }
        shape.closePath();
        const geo = new THREE.ShapeGeometry(shape);
        return new THREE.Mesh(geo, arrowOff);
    }
    const upArrow = triangleMesh(true);
    upArrow.position.set(0, 0.32, 0.03);
    g.add(upArrow);
    const dnArrow = triangleMesh(false);
    dnArrow.position.set(0, -0.04, 0.03);
    g.add(dnArrow);

    // Floor indicator display — larger square, high-contrast orange digits.
    const indicatorTex = makeTextTexture('0', { bg: '#050505', fg: '#ffbb22' });
    const indicatorMat = new THREE.MeshBasicMaterial({ map: indicatorTex });
    const indicator = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.45), indicatorMat);
    indicator.position.set(0, -0.45, 0.03);
    g.add(indicator);

    g.userData = {
        upArrow, dnArrow, arrowOff, arrowOnU, arrowOnD, indicatorTex,
        setUp:   (on) => upArrow.material = on ? arrowOnU : arrowOff,
        setDown: (on) => dnArrow.material = on ? arrowOnD : arrowOff,
        setIndicator: (text) => updateTextTexture(indicatorTex, text),
    };
    return g;
}

// ---- Shaft-opening floor indicator (above doors) ----
// The building-side display that shows what floor the car is on from outside.
function makeShaftIndicator() {
    const tex = makeTextTexture('0', { bg: '#050505', fg: '#ffbb22' });
    const mat = new THREE.MeshBasicMaterial({ map: tex });
    // Roughly doubled (0.45 → 0.9) so the floor number + direction arrow is
    // readable from normal camera distance.
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), mat);
    mesh.userData = { tex, setText: (t) => updateTextTexture(tex, t) };
    return mesh;
}

// ---- Build walls dividing a floor's interior (offices, conference, lounge) ----
// We place semi-transparent walls so rooms are delineated but still see-through.
function buildInteriorWalls(y, height) {
    const g = new THREE.Group();
    const wallMat = transparentMat(0xbbc5e6, 0.28);

    function addWall(x, z, w, d) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, height, d), wallMat);
        m.position.set(x, y + height / 2, z);
        g.add(m);
    }

    // Office back-wall divider (between hallway and offices). We leave doorway
    // gaps at each office's x-center.
    // Span: X in [-11,+11] at Z = -3. Width = 22, minus 4 door gaps of width 1.2.
    const doorW = 1.2;
    const sections = [
        { xMin: -11,   xMax: OFFICE_LAYOUT[0].xCenter - doorW/2 },
        { xMin: OFFICE_LAYOUT[0].xCenter + doorW/2, xMax: OFFICE_LAYOUT[1].xCenter - doorW/2 },
        { xMin: OFFICE_LAYOUT[1].xCenter + doorW/2, xMax: OFFICE_LAYOUT[2].xCenter - doorW/2 },
        { xMin: OFFICE_LAYOUT[2].xCenter + doorW/2, xMax: OFFICE_LAYOUT[3].xCenter - doorW/2 },
        { xMin: OFFICE_LAYOUT[3].xCenter + doorW/2, xMax: 11   },
    ];
    for (const s of sections) {
        if (s.xMax - s.xMin < 0.2) continue;
        addWall((s.xMin+s.xMax)/2, OFFICE_Z_FRONT, s.xMax - s.xMin, 0.12);
    }
    // Dividers BETWEEN offices (vertical walls running Z).
    for (const x of [OFFICE_LAYOUT[0].xRange[1], OFFICE_LAYOUT[1].xRange[1], OFFICE_LAYOUT[2].xRange[1]]) {
        addWall(x, (OFFICE_Z_FRONT + OFFICE_Z_BACK)/2, 0.12, (OFFICE_Z_FRONT - OFFICE_Z_BACK));
    }

    // Conference room walls: west, south (already building wall handles this).
    // We need a wall separating conference room from hallway center.
    // East wall of conference room at X=-3, Z:[3,9], with a doorway.
    const confDoorZ = 4;  // doorway center Z
    addWall(-3, (CONF_Z[0] + (confDoorZ - doorW/2))/2, 0.12, (confDoorZ - doorW/2) - CONF_Z[0]);
    addWall(-3, ((confDoorZ + doorW/2) + CONF_Z[1])/2, 0.12, CONF_Z[1] - (confDoorZ + doorW/2));
    // South wall of conference room at Z=3, X:[-11,-3]  (separating from anything south)
    // Actually the building is bounded there; skip.

    // Lounge walls: separating from hallway center.
    // West wall of lounge at X=+3, Z:[3,9], with a doorway.
    const loungeDoorZ = 4;
    addWall(+3, (LOUNGE_Z[0] + (loungeDoorZ - doorW/2))/2, 0.12, (loungeDoorZ - doorW/2) - LOUNGE_Z[0]);
    addWall(+3, ((loungeDoorZ + doorW/2) + LOUNGE_Z[1])/2, 0.12, LOUNGE_Z[1] - (loungeDoorZ + doorW/2));

    return g;
}

// ---- Build ground-floor lobby interior (cafe + lounge + entrance) ----
function buildLobbyInterior(scene) {
    const g = new THREE.Group();
    const y = 0;

    // Cafe counter on the left (-X).
    const cafe = makeCafeCounter();
    cafe.position.set(-7, y, 5.5);
    cafe.rotation.y = Math.PI; // counter opening faces +Z (customers stand in +Z)
    g.add(cafe);

    // Four bistro tables scattered through the cafe zone.
    const BISTRO_POSITIONS = [
        [-8.5, 7.2], [-5.5, 7.2], [-9.0, 4.0], [-4.5, 4.0]
    ];
    for (const [x, z] of BISTRO_POSITIONS) {
        const tbl = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.75, 16), solidMat(0x3a2a1a));
        tbl.position.set(x, y + 0.375, z);
        g.add(tbl);
        for (const dx of [-0.6, 0.6]) {
            const c = makeChair(0x5a3a1a);
            c.position.set(x + dx, y, z);
            c.rotation.y = dx < 0 ? Math.PI / 2 : -Math.PI / 2;
            g.add(c);
        }
    }

    // Lounge on the right (+X) — front lounge.
    const couch = makeCouch();
    couch.position.set(7, y, 5.5);
    couch.rotation.y = Math.PI;
    g.add(couch);
    // Coffee table.
    const cTable = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.35, 0.6), solidMat(0x222222));
    cTable.position.set(7, y + 0.175, 6.8);
    g.add(cTable);
    // Armchairs.
    for (const [x, z, r] of [[5.2, 7.5, -Math.PI/3], [8.8, 7.5, Math.PI/3]]) {
        const ch = makeChair(0x552b6e);
        ch.position.set(x, y, z);
        ch.rotation.y = r;
        g.add(ch);
    }

    // Back lounge (Z negative) — two couches facing each other for visitors.
    const backCouchN = makeCouch();
    backCouchN.position.set(6.5, y, -7.5);
    backCouchN.rotation.y = 0;   // back at -Z, seat opens toward +Z
    g.add(backCouchN);
    const backCouchS = makeCouch();
    backCouchS.position.set(6.5, y, -4.5);
    backCouchS.rotation.y = Math.PI;  // opens toward -Z (facing the other couch)
    g.add(backCouchS);
    const backCTable = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.35, 0.8), solidMat(0x222222));
    backCTable.position.set(6.5, y + 0.175, -6);
    g.add(backCTable);

    // Back-left conversation pit: a cluster of 4 armchairs around a table.
    const pitCenter = [-6.5, -6];
    const pitTable = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.35, 16), solidMat(0x333333));
    pitTable.position.set(pitCenter[0], y + 0.175, pitCenter[1]);
    g.add(pitTable);
    const pitChairs = [
        [-1.2, 0, Math.PI/2],   [+1.2, 0, -Math.PI/2],
        [0, -1.2, 0],           [0, +1.2, Math.PI],
    ];
    for (const [dx, dz, r] of pitChairs) {
        const ch = makeChair(0x2b4e8a);
        ch.position.set(pitCenter[0] + dx, y, pitCenter[1] + dz);
        ch.rotation.y = r;
        g.add(ch);
    }

    // Lobby water cooler with a small standing-room plaza around it.
    const wcFront = makeWaterCooler();
    wcFront.position.set(10, y, 3.5);
    g.add(wcFront);
    const wcBack = makeWaterCooler();
    wcBack.position.set(-10, y, -6);
    g.add(wcBack);

    // A magazine / info kiosk near the entrance for waiting visitors.
    const kiosk = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.3, 0.5), solidMat(0x663333));
    kiosk.position.set(-3.5, y + 0.65, 8.3);
    g.add(kiosk);

    // Entrance doors at front wall (+Z = +9).
    const ent = makeEntranceDoors();
    ent.position.set(0, y, 9);
    g.add(ent);

    // Sidewalk slab outside the entrance so outgoing / incoming agents
    // have a visible surface to walk on.
    const sidewalk = new THREE.Mesh(
        new THREE.BoxGeometry(6, 0.15, 5),
        solidMat(0x8c8c94)
    );
    sidewalk.position.set(0, y - 0.08, WORLD.BUILDING_DEPTH / 2 + 2.4);
    g.add(sidewalk);

    // A potted plant by the entrance.
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.3, 0.5, 12), solidMat(0x553322));
    pot.position.set(3.5, y + 0.25, 8.5);
    g.add(pot);
    const foliage = new THREE.Mesh(new THREE.SphereGeometry(0.65, 12, 10), solidMat(0x2a7d3a));
    foliage.position.set(3.5, y + 1.0, 8.5);
    g.add(foliage);

    // Small reception desk off to the side so it doesn't block the walk from
    // entrance to elevator. Oriented facing +X so the "receptionist" side is
    // toward the middle of the lobby.
    const recDesk = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.05, 2.2), solidMat(0x444422));
    recDesk.position.set(-3.0, y + 0.525, 6.2);
    g.add(recDesk);
    const recTop = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 2.4), solidMat(0x222211));
    recTop.position.set(-3.0, y + 1.08, 6.2);
    g.add(recTop);

    return g;
}

// ---- Build office floor interior (offices, conference, lounge furniture) ----
function buildOfficeFloorInterior(floorNumber) {
    const y = floorNumber * WORLD.FLOOR_HEIGHT;
    const g = new THREE.Group();

    // 4 offices along back wall.
    const desks = [];
    for (let i = 0; i < OFFICE_LAYOUT.length; i++) {
        const off = OFFICE_LAYOUT[i];
        const desk = makeDesk();
        // Desk located near Z=-6.5, user sits on +Z side facing -Z. Rotate desk
        // so monitor is on -Z side (back), keyboard on +Z (user side).
        desk.position.set(off.xCenter, y, OFFICE_Z_DESK);
        // rotation.y = 0 means monitor at -Z of desk, keyboard at +Z.
        // User sits at +Z side of desk. But we want the user to face -Z
        // (toward monitor / back wall), so chair is at +Z of desk.
        // That means user faces -Z. Perfect.
        desk.rotation.y = 0;
        g.add(desk);

        const chair = makeChair(0x222244);
        chair.position.set(off.xCenter, y, OFFICE_Z_DESK + 0.7);
        chair.rotation.y = Math.PI;   // back at +Z so seat faces -Z (toward desk)
        g.add(chair);

        desks.push({
            id: off.id,
            sitSpot: new THREE.Vector3(off.xCenter, y, OFFICE_Z_DESK + 0.7),
            sitFacing: Math.PI,   // rotation.y — face -Z (toward monitor)
            doorSpot: new THREE.Vector3(off.xCenter, y, OFFICE_Z_FRONT + 0.4),
        });
    }

    // Conference room.
    const confTable = makeConferenceTable();
    confTable.position.set(CONF_CENTER[0], y, CONF_CENTER[1]);
    g.add(confTable);

    const confSeats = [];
    // 2 chairs on each long side of the table (+Z side, -Z side).
    for (const sx of [-1.2, 1.2]) {
        for (const sz of [-0.95, 0.95]) {
            const ch = makeChair(0x222244);
            ch.position.set(CONF_CENTER[0] + sx, y, CONF_CENTER[1] + sz);
            ch.rotation.y = sz > 0 ? Math.PI : 0;   // face table (table at sz=0)
            g.add(ch);
            confSeats.push({
                sitSpot: new THREE.Vector3(CONF_CENTER[0] + sx, y, CONF_CENTER[1] + sz),
                sitFacing: sz > 0 ? Math.PI : 0,
            });
        }
    }

    // Lounge (break area): couch + coffee table + armchairs.
    const loungeCenterX = (LOUNGE_X[0] + LOUNGE_X[1]) / 2;
    const loungeCenterZ = (LOUNGE_Z[0] + LOUNGE_Z[1]) / 2;
    const couch = makeCouch();
    couch.position.set(loungeCenterX, y, loungeCenterZ + 1.8);
    couch.rotation.y = Math.PI;
    g.add(couch);

    const cTable = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.35, 0.6), solidMat(0x222222));
    cTable.position.set(loungeCenterX, y + 0.175, loungeCenterZ + 0.6);
    g.add(cTable);

    const armR = makeChair(0x552b6e);
    armR.position.set(loungeCenterX + 2, y, loungeCenterZ);
    armR.rotation.y = -Math.PI / 3;
    g.add(armR);
    const armL = makeChair(0x552b6e);
    armL.position.set(loungeCenterX - 2, y, loungeCenterZ);
    armL.rotation.y = Math.PI / 3;
    g.add(armL);

    const wc = makeWaterCooler();
    wc.position.set(LOUNGE_X[1] - 0.5, y, LOUNGE_Z[0] + 0.7);
    g.add(wc);

    // Standing / sitting spots in the lounge.
    // Couch is rotated PI so its seat opens toward -Z; riders face -Z.
    const loungeSpots = [
        { sitSpot: new THREE.Vector3(loungeCenterX - 0.8, y, loungeCenterZ + 1.8 - 0.25), sit: true,  sitFacing: Math.PI },
        { sitSpot: new THREE.Vector3(loungeCenterX + 0.8, y, loungeCenterZ + 1.8 - 0.25), sit: true,  sitFacing: Math.PI },
        { sitSpot: new THREE.Vector3(LOUNGE_X[1] - 1.2, y, LOUNGE_Z[0] + 1.4),            sit: false, sitFacing: Math.PI },
    ];

    return { group: g, desks, confSeats, loungeSpots };
}

// ---- Navigation graph ----
// Each floor has the same ring of hallway waypoints around the shaft plus
// room-entry spokes. We represent waypoints as { name, pos (Vector3), links: [names] }.
// BFS gives shortest-path sequences of waypoints.
function buildFloorGraph(floorNumber, extraNodes) {
    const y = floorNumber * WORLD.FLOOR_HEIGHT;
    const nodes = {};
    function n(name, x, z, links) {
        nodes[name] = { name, pos: new THREE.Vector3(x, y, z), links: links.slice() };
    }

    // Ring around shaft. Shaft is X:[-1.5,+1.5], Z:[-1.5,+1.5].
    n('hallS',   0,    2.4, ['hallSE','hallSW','elevWait']);
    n('elevWait',0,    3.2, ['hallS']);
    n('hallSE',  2.4,  2.4, ['hallS','hallE']);
    n('hallSW', -2.4,  2.4, ['hallS','hallW']);
    n('hallE',   2.4,  0,   ['hallSE','hallNE']);
    n('hallW',  -2.4,  0,   ['hallSW','hallNW']);
    n('hallNE',  2.4, -2.4, ['hallE','hallN']);
    n('hallNW', -2.4, -2.4, ['hallW','hallN']);
    n('hallN',   0,   -2.4, ['hallNE','hallNW']);

    if (extraNodes) extraNodes(nodes, y);

    return nodes;
}
function bfsPath(nodes, fromName, toName) {
    if (fromName === toName) return [nodes[fromName].pos.clone()];
    const visited = new Set([fromName]);
    const parent = { [fromName]: null };
    const q = [fromName];
    while (q.length) {
        const cur = q.shift();
        if (cur === toName) {
            const path = [];
            let k = cur;
            while (k != null) { path.unshift(nodes[k].pos.clone()); k = parent[k]; }
            return path;
        }
        for (const nb of nodes[cur].links) {
            if (!visited.has(nb) && nodes[nb]) {
                visited.add(nb); parent[nb] = cur; q.push(nb);
            }
        }
    }
    return null; // unreachable
}

// ---- Top-level world builder ----
function createWorld(scene) {
    const buildingGroup = new THREE.Group();
    buildingGroup.renderOrder = 0;
    scene.add(buildingGroup);

    const floorMat = transparentMat(0xcccccc, 0.3);
    const wallMat  = transparentMat(0x9999ff, 0.2);
    const solidFloorMat = solidMat(0xaaaaaa);

    // Ground slab (solid) + roof.
    const ground = new THREE.Mesh(
        new THREE.BoxGeometry(WORLD.BUILDING_WIDTH, 0.2, WORLD.BUILDING_DEPTH),
        solidFloorMat
    );
    ground.position.y = -0.1;
    buildingGroup.add(ground);

    const roof = new THREE.Mesh(
        new THREE.BoxGeometry(WORLD.BUILDING_WIDTH, 0.2, WORLD.BUILDING_DEPTH),
        solidFloorMat
    );
    roof.position.y = WORLD.FLOOR_COUNT * WORLD.FLOOR_HEIGHT + 0.1;
    buildingGroup.add(roof);

    // Intermediate floor slabs.
    for (let i = 1; i < WORLD.FLOOR_COUNT; i++) {
        const slab = buildFloorSlabWithShaft(i * WORLD.FLOOR_HEIGHT, floorMat);
        buildingGroup.add(slab);
    }

    // Outer walls.
    const totalH = WORLD.FLOOR_COUNT * WORLD.FLOOR_HEIGHT;
    const midY = totalH / 2;
    function addOuterWall(w, h, d, x, y, z) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
        mesh.position.set(x, y, z);
        buildingGroup.add(mesh);
    }
    // Front wall, with a gap at the lobby entrance (X:[-1.5,+1.5] on floor 0).
    // Easier: add 3 segments of the front wall.
    const entW = 3; // entrance gap width
    addOuterWall((WORLD.BUILDING_WIDTH - entW)/2, totalH, 0.1,
                 -(WORLD.BUILDING_WIDTH + entW)/4, midY, WORLD.BUILDING_DEPTH/2);
    addOuterWall((WORLD.BUILDING_WIDTH - entW)/2, totalH, 0.1,
                  (WORLD.BUILDING_WIDTH + entW)/4, midY, WORLD.BUILDING_DEPTH/2);
    // Above-entrance piece for floors 1..5 (so entrance gap is only on floor 0).
    addOuterWall(entW, totalH - WORLD.FLOOR_HEIGHT, 0.1,
                 0, WORLD.FLOOR_HEIGHT + (totalH - WORLD.FLOOR_HEIGHT)/2, WORLD.BUILDING_DEPTH/2);

    addOuterWall(WORLD.BUILDING_WIDTH, totalH, 0.1, 0, midY, -WORLD.BUILDING_DEPTH/2);
    addOuterWall(0.1, totalH, WORLD.BUILDING_DEPTH, -WORLD.BUILDING_WIDTH/2, midY, 0);
    addOuterWall(0.1, totalH, WORLD.BUILDING_DEPTH,  WORLD.BUILDING_WIDTH/2, midY, 0);

    buildingGroup.traverse(o => { if (o.isMesh) o.renderOrder = 0; });

    // ---- Per-floor interior (rooms + furniture + panels + waypoints) ----
    const floors = [];

    // Common waypoint-extension helpers.
    function officeExtras(nodes, y, desks) {
        // Add each desk + office entry as graph nodes.
        for (const d of desks) {
            const entryName = `office${d.id}_door`;
            const deskName  = `office${d.id}_desk`;
            nodes[entryName] = {
                name: entryName,
                pos: new THREE.Vector3(d.sitSpot.x, y, OFFICE_Z_FRONT + 0.6),
                links: [deskName]
            };
            nodes[deskName] = {
                name: deskName,
                pos: d.sitSpot.clone(),
                links: [entryName]
            };
            // Link doors to nearest hall corner.
            let hallNode = 'hallN';
            if (d.sitSpot.x < -3) hallNode = 'hallNW';
            else if (d.sitSpot.x > 3) hallNode = 'hallNE';
            nodes[entryName].links.push(hallNode);
            nodes[hallNode].links.push(entryName);
        }
    }
    function confExtras(nodes, y, confSeats) {
        nodes['conf_door'] = {
            name: 'conf_door',
            pos: new THREE.Vector3(-2.6, y, 4),
            links: ['hallSW']
        };
        nodes['hallSW'].links.push('conf_door');
        nodes['conf_center'] = {
            name: 'conf_center',
            pos: new THREE.Vector3(CONF_CENTER[0], y, CONF_CENTER[1]),
            links: ['conf_door']
        };
        nodes['conf_door'].links.push('conf_center');
        for (let i = 0; i < confSeats.length; i++) {
            const nm = `conf_seat${i}`;
            nodes[nm] = {
                name: nm,
                pos: confSeats[i].sitSpot.clone(),
                links: ['conf_center']
            };
            nodes['conf_center'].links.push(nm);
        }
    }
    function loungeExtras(nodes, y, loungeSpots) {
        nodes['lounge_door'] = {
            name: 'lounge_door',
            pos: new THREE.Vector3(2.6, y, 4),
            links: ['hallSE']
        };
        nodes['hallSE'].links.push('lounge_door');
        nodes['lounge_center'] = {
            name: 'lounge_center',
            pos: new THREE.Vector3((LOUNGE_X[0]+LOUNGE_X[1])/2, y, (LOUNGE_Z[0]+LOUNGE_Z[1])/2),
            links: ['lounge_door']
        };
        nodes['lounge_door'].links.push('lounge_center');
        for (let i = 0; i < loungeSpots.length; i++) {
            const nm = `lounge_spot${i}`;
            nodes[nm] = {
                name: nm,
                pos: loungeSpots[i].sitSpot.clone(),
                links: ['lounge_center']
            };
            nodes['lounge_center'].links.push(nm);
        }
    }

    for (let f = 0; f < WORLD.FLOOR_COUNT; f++) {
        const y = f * WORLD.FLOOR_HEIGHT;
        const floorInfo = { floorNumber: f };

        if (f === 0) {
            // Lobby: no office walls, no desks.
            const lobby = buildLobbyInterior(scene);
            buildingGroup.add(lobby);

            // Graph: hallway ring + lobby POIs.
            const nodes = buildFloorGraph(f, (nodes, y) => {
                // Entrance spot — directly linked to elevWait so arriving /
                // departing agents take the shortest straight path.
                nodes['entrance'] = {
                    name: 'entrance',
                    pos: new THREE.Vector3(0, y, 8),
                    links: ['elevWait', 'outside']
                };
                nodes['elevWait'].links.push('entrance');
                // Outside node on the sidewalk. Arriving agents spawn here
                // and walk in; departing agents walk past 'entrance' to this
                // node and then despawn — so they visibly enter / leave the
                // building through the front doors.
                nodes['outside'] = {
                    name: 'outside',
                    pos: new THREE.Vector3(0, y, 12),
                    links: ['entrance']
                };
                // Cafe customer spot.
                nodes['cafe_door'] = {
                    name: 'cafe_door',
                    pos: new THREE.Vector3(-6, y, 3.5),
                    links: ['hallSW']
                };
                nodes['hallSW'].links.push('cafe_door');
                nodes['cafe_order'] = {
                    name: 'cafe_order',
                    pos: new THREE.Vector3(-7, y, 6.3),
                    links: ['cafe_door']
                };
                nodes['cafe_door'].links.push('cafe_order');
                // Bistro chairs (positions of the LEFT chair of each table; chair faces +X).
                const BISTROS = [
                    ['bistro1', -9.1, 7.2],
                    ['bistro2', -6.1, 7.2],
                    ['bistro3', -9.6, 4.0],
                    ['bistro4', -5.1, 4.0],
                ];
                for (const [nm, bx, bz] of BISTROS) {
                    nodes[nm] = { name: nm, pos: new THREE.Vector3(bx, y, bz), links: ['cafe_door'] };
                    nodes['cafe_door'].links.push(nm);
                }
                // Lounge seats (front-right).
                nodes['lounge_door'] = {
                    name: 'lounge_door',
                    pos: new THREE.Vector3(6, y, 3.5),
                    links: ['hallSE']
                };
                nodes['hallSE'].links.push('lounge_door');
                nodes['lounge_couch'] = {
                    name: 'lounge_couch',
                    pos: new THREE.Vector3(7, y, 5.5 - 0.1),
                    links: ['lounge_door']
                };
                nodes['lounge_door'].links.push('lounge_couch');
                nodes['lounge_chair_L'] = {
                    name: 'lounge_chair_L',
                    pos: new THREE.Vector3(5.2, y, 7.5),
                    links: ['lounge_door']
                };
                nodes['lounge_door'].links.push('lounge_chair_L');
                nodes['lounge_chair_R'] = {
                    name: 'lounge_chair_R',
                    pos: new THREE.Vector3(8.8, y, 7.5),
                    links: ['lounge_door']
                };
                nodes['lounge_door'].links.push('lounge_chair_R');

                // Back-lobby lounge (two facing couches + pit chairs + water cooler).
                nodes['back_lounge_N'] = {
                    name: 'back_lounge_N',
                    pos: new THREE.Vector3(6.5, y, -4.9),
                    links: ['hallNE']
                };
                nodes['hallNE'].links.push('back_lounge_N');
                nodes['back_lounge_S'] = {
                    name: 'back_lounge_S',
                    pos: new THREE.Vector3(6.5, y, -7.1),
                    links: ['hallNE']
                };
                nodes['hallNE'].links.push('back_lounge_S');
                for (const [nm, dx, dz] of [
                    ['pit_E', -5.3, -6], ['pit_W', -7.7, -6],
                    ['pit_N', -6.5, -7.2], ['pit_S', -6.5, -4.8],
                ]) {
                    nodes[nm] = { name: nm, pos: new THREE.Vector3(dx, y, dz), links: ['hallNW'] };
                    nodes['hallNW'].links.push(nm);
                }

                // Water coolers.
                nodes['lobby_wc_front'] = {
                    name: 'lobby_wc_front',
                    pos: new THREE.Vector3(9.5, y, 3.6),
                    links: ['hallSE']
                };
                nodes['hallSE'].links.push('lobby_wc_front');
                nodes['lobby_wc_back'] = {
                    name: 'lobby_wc_back',
                    pos: new THREE.Vector3(-9.4, y, -6),
                    links: ['hallNW']
                };
                nodes['hallNW'].links.push('lobby_wc_back');

                // Reception — a primary standing spot for visitors.
                nodes['reception'] = {
                    name: 'reception',
                    pos: new THREE.Vector3(-2.4, y, 6.2),
                    links: ['hallS']
                };
                nodes['hallS'].links.push('reception');

                // Info kiosk near entrance.
                nodes['kiosk'] = {
                    name: 'kiosk',
                    pos: new THREE.Vector3(-3.5, y, 7.5),
                    links: ['entrance']
                };
                nodes['entrance'].links.push('kiosk');

                // Generic standing waypoints scattered through the lobby —
                // visitors can wander to / loiter at these.
                const STAND_LOBBY = [
                    ['lobby_stand_center', 0,    5],
                    ['lobby_stand_NE',     4.5, -5],
                    ['lobby_stand_NW',    -4.5, -5],
                    ['lobby_stand_midE',   5,    0],
                    ['lobby_stand_midW',  -5,    0],
                    ['lobby_stand_entry',  2.5,  7.5],
                ];
                for (const [nm, sx, sz] of STAND_LOBBY) {
                    let link = 'hallS';
                    if (sz < 0 && sx < 0) link = 'hallNW';
                    else if (sz < 0 && sx >= 0) link = 'hallNE';
                    else if (sz > 0 && sx < 0) link = 'hallSW';
                    else if (sz > 0 && sx > 2) link = 'hallSE';
                    nodes[nm] = { name: nm, pos: new THREE.Vector3(sx, y, sz), links: [link] };
                    nodes[link].links.push(nm);
                }
            });
            floorInfo.nodes = nodes;
            floorInfo.entranceSpot = nodes.entrance.pos.clone();
            floorInfo.outsideSpot  = nodes.outside.pos.clone();
            floorInfo.cafeSpots = [nodes.bistro1.pos.clone(), nodes.bistro2.pos.clone(),
                                   nodes.bistro3.pos.clone(), nodes.bistro4.pos.clone(),
                                   nodes.cafe_order.pos.clone()];
            floorInfo.loungeSpots = [nodes.lounge_couch.pos.clone(), nodes.lounge_chair_L.pos.clone(),
                                     nodes.lounge_chair_R.pos.clone(), nodes.back_lounge_N.pos.clone(),
                                     nodes.back_lounge_S.pos.clone(),
                                     nodes.pit_N.pos.clone(), nodes.pit_S.pos.clone(),
                                     nodes.pit_E.pos.clone(), nodes.pit_W.pos.clone()];
            floorInfo.sitTargets = {
                // Bistro chairs face +X (toward the little table between them).
                bistro1:         { sit: true,  facing:  Math.PI / 2 },
                bistro2:         { sit: true,  facing:  Math.PI / 2 },
                bistro3:         { sit: true,  facing:  Math.PI / 2 },
                bistro4:         { sit: true,  facing:  Math.PI / 2 },
                cafe_order:      { sit: false, facing:  Math.PI },
                lounge_couch:    { sit: true,  facing:  Math.PI },
                lounge_chair_L:  { sit: true,  facing: -Math.PI / 3 },
                lounge_chair_R:  { sit: true,  facing:  Math.PI / 3 },
                // Back lounge couches face each other.
                back_lounge_N:   { sit: true,  facing:  Math.PI },   // N couch seat opens -Z
                back_lounge_S:   { sit: true,  facing:  0        },   // S couch seat opens +Z
                // Conversation-pit chairs face the table in the middle.
                pit_N:           { sit: true,  facing:  Math.PI },
                pit_S:           { sit: true,  facing:  0 },
                pit_E:           { sit: true,  facing: -Math.PI / 2 },
                pit_W:           { sit: true,  facing:  Math.PI / 2 },
                // Standing-only spots.
                lobby_wc_front:  { sit: false, facing:  Math.PI },
                lobby_wc_back:   { sit: false, facing:  0 },
                kiosk:           { sit: false, facing:  Math.PI },
                reception:       { sit: false, facing:  Math.PI },
                entrance:        { sit: false, facing:  Math.PI },
                lobby_stand_center: { sit: false, facing: 0 },
                lobby_stand_NE:     { sit: false, facing: Math.PI },
                lobby_stand_NW:     { sit: false, facing: Math.PI },
                lobby_stand_midE:   { sit: false, facing: -Math.PI/2 },
                lobby_stand_midW:   { sit: false, facing:  Math.PI/2 },
                lobby_stand_entry:  { sit: false, facing:  Math.PI },
            };
            // No desks on lobby.
            floorInfo.desks = [];
        } else {
            const interior = buildOfficeFloorInterior(f);
            buildingGroup.add(interior.group);

            const walls = buildInteriorWalls(y, WORLD.FLOOR_HEIGHT - 0.1);
            walls.traverse(o => { if (o.isMesh) o.renderOrder = 0; });
            buildingGroup.add(walls);

            const nodes = buildFloorGraph(f, (nodes, y) => {
                officeExtras(nodes, y, interior.desks);
                confExtras(nodes, y, interior.confSeats);
                loungeExtras(nodes, y, interior.loungeSpots);
                // Water-cooler standing spot (visitors + workers on break
                // can stop here briefly without occupying a lounge seat).
                nodes['water_cooler'] = {
                    name: 'water_cooler',
                    pos: new THREE.Vector3(LOUNGE_X[1] - 1.2, y, LOUNGE_Z[0] + 1.4),
                    links: ['lounge_center']
                };
                nodes['lounge_center'].links.push('water_cooler');
                // A couple of hallway standing spots for visitors to loiter.
                nodes['hall_stand_N'] = {
                    name: 'hall_stand_N',
                    pos: new THREE.Vector3(0, y, -3.3),
                    links: ['hallN']
                };
                nodes['hallN'].links.push('hall_stand_N');
                nodes['hall_stand_S'] = {
                    name: 'hall_stand_S',
                    pos: new THREE.Vector3(0, y, 3.3),
                    links: ['hallS']
                };
                nodes['hallS'].links.push('hall_stand_S');
            });
            floorInfo.nodes = nodes;
            floorInfo.desks = interior.desks;     // [{id, sitSpot, sitFacing, doorSpot}]
            floorInfo.confSeats = interior.confSeats;
            floorInfo.loungeSpots = interior.loungeSpots;
            floorInfo.sitTargets = {};
            for (const d of interior.desks) {
                floorInfo.sitTargets[`office${d.id}_desk`] = { sit: true, facing: d.sitFacing };
            }
            for (let i = 0; i < interior.confSeats.length; i++) {
                floorInfo.sitTargets[`conf_seat${i}`] = { sit: true, facing: interior.confSeats[i].sitFacing };
            }
            for (let i = 0; i < interior.loungeSpots.length; i++) {
                floorInfo.sitTargets[`lounge_spot${i}`] = {
                    sit:    interior.loungeSpots[i].sit,
                    facing: interior.loungeSpots[i].sitFacing
                };
            }
            // Standing-only waypoints on office floors.
            floorInfo.sitTargets['water_cooler']  = { sit: false, facing: -Math.PI / 2 };
            floorInfo.sitTargets['hall_stand_N']  = { sit: false, facing:  Math.PI };
            floorInfo.sitTargets['hall_stand_S']  = { sit: false, facing:  0 };
        }

        // Call panel on wall near elevator waiting area. Mounted at X ≈ +1.7
        // (east side of front of shaft), facing +Z so people press it while
        // standing in the waiting area.
        const panel = makeCallPanel();
        panel.position.set(1.9, y + 1.2, WORLD.SHAFT_DEPTH/2 + 0.05);
        panel.rotation.y = 0; // faces +Z
        buildingGroup.add(panel);
        floorInfo.callPanel = panel;

        // Shaft-side floor indicator above doors.
        const ind = makeShaftIndicator();
        ind.position.set(-1.9, y + 2.7, WORLD.SHAFT_DEPTH/2 + 0.06);
        ind.rotation.y = 0;
        buildingGroup.add(ind);
        floorInfo.shaftIndicator = ind;

        // Waiting spot (standing spot in front of doors).
        floorInfo.elevatorWaitSpot = new THREE.Vector3(0, y, WORLD.SHAFT_DEPTH/2 + 1.2);

        floors.push(floorInfo);
    }

    return {
        buildingGroup,
        floors,
        // Helper: world position of elevator waiting spot on floor f.
        waitingSpotFor: (f) => floors[f].elevatorWaitSpot.clone(),
        bfsPath,
    };
}

window.WORLD = WORLD;
window.createWorld = createWorld;
window.bfsPath = bfsPath;
window.makeTextTexture = makeTextTexture;
window.updateTextTexture = updateTextTexture;
