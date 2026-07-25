// world.js - building geometry, per-floor layouts, furniture, navigation
// graph and call panels.  Classic browser script: no import / export.

const WORLD = {
    FLOOR_HEIGHT: 3.4, FLOOR_COUNT: 6,
    BUILDING_WIDTH: 22, BUILDING_DEPTH: 18,
    SHAFT_WIDTH: 3, SHAFT_DEPTH: 3,
    PERSON_R: 0.4
};

const WALL_T = 0.16;
const HALF_W = WORLD.BUILDING_WIDTH / 2;   // 11
const HALF_D = WORLD.BUILDING_DEPTH / 2;   // 9
const SHAFT_HX = WORLD.SHAFT_WIDTH / 2;    // 1.5
const SHAFT_HZ = WORLD.SHAFT_DEPTH / 2;    // 1.5
const DOORWAY_HALF = 1.5;                  // front entrance gap half-width
const BUILDING_TOP = WORLD.FLOOR_COUNT * WORLD.FLOOR_HEIGHT;

// ---------------------------------------------------------------------------
// shared materials
// ---------------------------------------------------------------------------
function makeGlassMaterial(color, opacity) {
    return new THREE.MeshLambertMaterial({
        color: color,
        transparent: true,
        opacity: opacity,
        depthWrite: false,
        side: THREE.DoubleSide
    });
}

const MAT_SLAB_SOLID = new THREE.MeshLambertMaterial({ color: 0x8b9099, side: THREE.DoubleSide });
const MAT_SLAB_GLASS = makeGlassMaterial(0x9aa0aa, 0.3);
const MAT_OUTER_WALL = makeGlassMaterial(0x9999ff, 0.2);
const MAT_INNER_WALL = makeGlassMaterial(0xbbc5e6, 0.28);
const MAT_DOOR_GLASS = makeGlassMaterial(0xcfe8ff, 0.25);
const MAT_SHAFT_POST = new THREE.MeshLambertMaterial({ color: 0x6d7178 });
const MAT_SIDEWALK = new THREE.MeshLambertMaterial({ color: 0x9a9a94, side: THREE.DoubleSide });
const MAT_WOOD = new THREE.MeshLambertMaterial({ color: 0x8a6547 });
const MAT_WOOD_DARK = new THREE.MeshLambertMaterial({ color: 0x5b4230 });
const MAT_METAL = new THREE.MeshLambertMaterial({ color: 0x9099a3 });
const MAT_FABRIC_A = new THREE.MeshLambertMaterial({ color: 0x4a6f8a });
const MAT_FABRIC_B = new THREE.MeshLambertMaterial({ color: 0x7a5566 });
const MAT_FABRIC_C = new THREE.MeshLambertMaterial({ color: 0x5c7a5c });
const MAT_SCREEN = new THREE.MeshLambertMaterial({ color: 0x1c2530, emissive: 0x142033 });
const MAT_PLANT = new THREE.MeshLambertMaterial({ color: 0x3f7a3f });
const MAT_POT = new THREE.MeshLambertMaterial({ color: 0x8a5a42 });
const MAT_LAMP_OFF = new THREE.MeshBasicMaterial({ color: 0x2a2a2e, side: THREE.DoubleSide });
const MAT_LAMP_ON = new THREE.MeshBasicMaterial({ color: 0x44ff66, side: THREE.DoubleSide });
const MAT_PANEL_PLATE = new THREE.MeshLambertMaterial({ color: 0x3a3d44 });
const MAT_WATER = new THREE.MeshLambertMaterial({ color: 0x8fd0e8, transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide });

// ---------------------------------------------------------------------------
// canvas text textures (floor indicators)
// ---------------------------------------------------------------------------
function makeDigitTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = 8;
    tex._canvas = canvas;
    tex._lastText = null;
    updateTextTexture(tex, "0");
    return tex;
}

function updateTextTexture(tex, text) {
    if (!tex || !tex._canvas) return;
    const label = String(text);
    if (tex._lastText === label) return; // never reupload an unchanged canvas
    tex._lastText = label;
    const canvas = tex._canvas;
    const ctx = canvas.getContext("2d");
    const size = canvas.width;
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#050505";
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = "#ffbb22";
    ctx.shadowColor = "#ffbb22";
    ctx.shadowBlur = size * 0.10;
    ctx.font = "bold " + Math.round(size * 0.82) + "px ui-monospace, Menlo, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, size / 2, size * 0.54, size * 0.9);
    ctx.shadowBlur = 0;
    tex.needsUpdate = true;
}

function makeIndicatorPlane(sizeXY) {
    const tex = makeDigitTexture();
    const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(sizeXY, sizeXY),
        new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide })
    );
    mesh.userData.texture = tex;
    mesh.userData.setIndicator = function (text) { updateTextTexture(tex, text); };
    return mesh;
}

// ---------------------------------------------------------------------------
// call panel
// ---------------------------------------------------------------------------
function makeArrowGeometry(pointUp) {
    const shape = new THREE.Shape();
    const hw = 0.13;
    if (pointUp) {
        shape.moveTo(-hw, -0.11);
        shape.lineTo(hw, -0.11);
        shape.lineTo(0, 0.13);
    } else {
        shape.moveTo(-hw, 0.11);
        shape.lineTo(hw, 0.11);
        shape.lineTo(0, -0.13);
    }
    shape.closePath();
    return new THREE.ShapeGeometry(shape);
}

function createCallPanel() {
    const panel = new THREE.Group();

    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.4, 0.05), MAT_PANEL_PLATE);
    panel.add(plate);

    const upArrow = new THREE.Mesh(makeArrowGeometry(true), MAT_LAMP_OFF);
    upArrow.position.set(0, 0.30, 0.04);
    panel.add(upArrow);

    const downArrow = new THREE.Mesh(makeArrowGeometry(false), MAT_LAMP_OFF);
    downArrow.position.set(0, -0.06, 0.04);
    panel.add(downArrow);

    const display = makeIndicatorPlane(0.45);
    display.position.set(0, 0.53, 0.035);
    panel.add(display);

    panel.userData.upOn = false;
    panel.userData.downOn = false;
    panel.userData.setUp = function (on) {
        if (panel.userData.upOn === on) return;
        panel.userData.upOn = on;
        upArrow.material = on ? MAT_LAMP_ON : MAT_LAMP_OFF;
    };
    panel.userData.setDown = function (on) {
        if (panel.userData.downOn === on) return;
        panel.userData.downOn = on;
        downArrow.material = on ? MAT_LAMP_ON : MAT_LAMP_OFF;
    };
    panel.userData.setIndicator = function (text) { display.userData.setIndicator(text); };
    return panel;
}

// ---------------------------------------------------------------------------
// navigation graph primitives
// ---------------------------------------------------------------------------
function nodeAdd(nodes, name, x, y, z) {
    nodes[name] = { name: name, pos: new THREE.Vector3(x, y, z), links: [] };
    return nodes[name];
}

function nodeLink(nodes, a, b) {
    if (!nodes[a] || !nodes[b]) return;
    if (nodes[a].links.indexOf(b) === -1) nodes[a].links.push(b);
    if (nodes[b].links.indexOf(a) === -1) nodes[b].links.push(a);
}

function nodeLinkMany(nodes, a, list) {
    for (let i = 0; i < list.length; i += 1) nodeLink(nodes, a, list[i]);
}

function bfsPath(nodes, fromName, toName) {
    if (!nodes[fromName] || !nodes[toName]) return [];
    if (fromName === toName) return [nodes[toName].pos.clone()];
    const prev = {};
    const seen = {};
    const queue = [fromName];
    seen[fromName] = true;
    let head = 0;
    while (head < queue.length) {
        const current = queue[head];
        head += 1;
        if (current === toName) break;
        const links = nodes[current].links;
        for (let i = 0; i < links.length; i += 1) {
            const next = links[i];
            if (seen[next]) continue;
            seen[next] = true;
            prev[next] = current;
            queue.push(next);
        }
    }
    if (!seen[toName]) return [nodes[toName].pos.clone()];
    const chain = [];
    let walk = toName;
    while (walk !== undefined) {
        chain.push(nodes[walk].pos.clone());
        if (walk === fromName) break;
        walk = prev[walk];
    }
    chain.reverse();
    return chain;
}

function nearestNodeName(nodes, position) {
    let best = null;
    let bestDist = Infinity;
    const names = Object.keys(nodes);
    for (let i = 0; i < names.length; i += 1) {
        const node = nodes[names[i]];
        const dx = node.pos.x - position.x;
        const dz = node.pos.z - position.z;
        const dist = dx * dx + dz * dz;
        if (dist < bestDist) {
            bestDist = dist;
            best = names[i];
        }
    }
    return best;
}

// ---------------------------------------------------------------------------
// SEAT / FACING SYSTEM
// A seat is never created without its waypoint, and both take the SAME
// `facing` value: a person standing at the waypoint with rotation.y = facing
// looks along the chair's local +Z, i.e. away from the backrest and toward
// the desk / table.  Every chair mesh below is modelled with its backrest on
// local -Z, so "chair.rotation.y === person.rotation.y" always holds.
// ---------------------------------------------------------------------------
function makeFloorContext(nodes, sitTargets, y) {
    return { nodes: nodes, sitTargets: sitTargets, y: y };
}

function addSeatWaypoint(ctx, name, x, z, facing) {
    nodeAdd(ctx.nodes, name, x, ctx.y, z);
    ctx.sitTargets[name] = { sit: true, facing: facing };
}

function addStandWaypoint(ctx, name, x, z, facing) {
    nodeAdd(ctx.nodes, name, x, ctx.y, z);
    ctx.sitTargets[name] = { sit: false, facing: facing };
}

function faceToward(x, z, targetX, targetZ) {
    return Math.atan2(targetX - x, targetZ - z);
}

// Rotate a chair-local offset into world space for a chair at (x,z,facing).
function localToWorldX(x, facing, ox, oz) {
    return x + ox * Math.cos(facing) + oz * Math.sin(facing);
}

function localToWorldZ(z, facing, ox, oz) {
    return z - ox * Math.sin(facing) + oz * Math.cos(facing);
}

// ---------------------------------------------------------------------------
// furniture
// ---------------------------------------------------------------------------
function buildChairMesh(fabric) {
    const chair = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.09, 0.52), fabric);
    seat.position.y = 0.45;
    chair.add(seat);
    // backrest lives on local -Z: the sitter's back is against it and their
    // legs point toward local +Z.
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.55, 0.08), fabric);
    back.position.set(0, 0.72, -0.24);
    chair.add(back);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.4, 8), MAT_METAL);
    post.position.y = 0.22;
    chair.add(post);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.28, 0.05, 10), MAT_METAL);
    base.position.y = 0.03;
    chair.add(base);
    return chair;
}

// Creates the chair AND its sit waypoint from one facing value.
function placeChair(ctx, group, wpName, x, z, facing, fabric) {
    const chair = buildChairMesh(fabric || MAT_FABRIC_A);
    chair.position.set(x, ctx.y, z);
    chair.rotation.y = facing;
    chair.userData.isSeat = true;
    group.add(chair);
    if (wpName) addSeatWaypoint(ctx, wpName, x, z, facing);
    return chair;
}

function buildArmchairMesh(fabric) {
    const chair = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.34, 0.78), fabric);
    seat.position.y = 0.3;
    chair.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.62, 0.16), fabric);
    back.position.set(0, 0.62, -0.31);
    chair.add(back);
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.24, 0.78), fabric);
    armL.position.set(-0.34, 0.56, 0);
    chair.add(armL);
    const armR = armL.clone();
    armR.position.x = 0.34;
    chair.add(armR);
    return chair;
}

function placeArmchair(ctx, group, wpName, x, z, facing, fabric) {
    const chair = buildArmchairMesh(fabric || MAT_FABRIC_B);
    chair.position.set(x, ctx.y, z);
    chair.rotation.y = facing;
    chair.userData.isSeat = true;
    group.add(chair);
    if (wpName) addSeatWaypoint(ctx, wpName, x, z, facing);
    return chair;
}

// A couch: `seatNames` are laid out along the couch's local X axis, all with
// the couch's own facing, so everyone sits with their back to the backrest.
function placeCouch(ctx, group, x, z, facing, seatNames, fabric) {
    const couch = new THREE.Group();
    const material = fabric || MAT_FABRIC_C;
    const seat = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.32, 0.85), material);
    seat.position.y = 0.3;
    couch.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.6, 0.18), material);
    back.position.set(0, 0.6, -0.34);
    couch.add(back);
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.26, 0.85), material);
    armL.position.set(-0.96, 0.55, 0);
    couch.add(armL);
    const armR = armL.clone();
    armR.position.x = 0.96;
    couch.add(armR);
    couch.position.set(x, ctx.y, z);
    couch.rotation.y = facing;
    couch.userData.isSeat = true;
    group.add(couch);

    const names = seatNames || [];
    const offsets = names.length === 1 ? [0] : [-0.55, 0.55];
    for (let i = 0; i < names.length && i < offsets.length; i += 1) {
        const sx = localToWorldX(x, facing, offsets[i], 0.02);
        const sz = localToWorldZ(z, facing, offsets[i], 0.02);
        addSeatWaypoint(ctx, names[i], sx, sz, facing);
    }
    return couch;
}

function placeTable(ctx, group, x, z, width, depth, height) {
    const table = new THREE.Group();
    const topH = height || 0.75;
    const top = new THREE.Mesh(new THREE.BoxGeometry(width, 0.08, depth), MAT_WOOD);
    top.position.y = topH;
    table.add(top);
    const legGeo = new THREE.BoxGeometry(0.09, topH, 0.09);
    const dx = width / 2 - 0.16;
    const dz = depth / 2 - 0.16;
    const corners = [[-dx, -dz], [dx, -dz], [-dx, dz], [dx, dz]];
    for (let i = 0; i < corners.length; i += 1) {
        const leg = new THREE.Mesh(legGeo, MAT_WOOD_DARK);
        leg.position.set(corners[i][0], topH / 2, corners[i][1]);
        table.add(leg);
    }
    table.position.set(x, ctx.y, z);
    group.add(table);
    return table;
}

function placeRoundTable(ctx, group, x, z, radius, height) {
    const table = new THREE.Group();
    const topH = height || 0.74;
    const top = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.07, 20), MAT_WOOD);
    top.position.y = topH;
    table.add(top);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, topH, 10), MAT_WOOD_DARK);
    post.position.y = topH / 2;
    table.add(post);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.55, radius * 0.6, 0.05, 14), MAT_WOOD_DARK);
    foot.position.y = 0.03;
    table.add(foot);
    table.position.set(x, ctx.y, z);
    group.add(table);
    return table;
}

// Desk with the monitor at the BACK edge (local -Z), so the sitter faces -Z
// relative to the desk's own facing.
function placeDesk(ctx, group, x, z, facing) {
    const desk = new THREE.Group();
    const top = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.08, 0.95), MAT_WOOD);
    top.position.y = 0.74;
    desk.add(top);
    const sideGeo = new THREE.BoxGeometry(0.09, 0.74, 0.9);
    const legL = new THREE.Mesh(sideGeo, MAT_WOOD_DARK);
    legL.position.set(-0.92, 0.37, 0);
    desk.add(legL);
    const legR = legL.clone();
    legR.position.x = 0.92;
    desk.add(legR);

    const monitorStand = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.09, 0.16, 8), MAT_METAL);
    monitorStand.position.set(0.15, 0.86, -0.3);
    desk.add(monitorStand);
    const monitor = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.44, 0.05), MAT_SCREEN);
    monitor.position.set(0.15, 1.16, -0.3);
    desk.add(monitor);
    const keyboard = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 0.18), MAT_METAL);
    keyboard.position.set(0.1, 0.8, 0.1);
    desk.add(keyboard);
    const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.11, 10), MAT_FABRIC_B);
    mug.position.set(-0.6, 0.84, 0.05);
    desk.add(mug);

    desk.position.set(x, ctx.y, z);
    desk.rotation.y = facing;
    group.add(desk);
    return desk;
}

function placeWaterCooler(ctx, group, x, z) {
    const cooler = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 1.0, 0.4), MAT_METAL);
    body.position.y = 0.5;
    cooler.add(body);
    const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.5, 12), MAT_WATER);
    bottle.position.y = 1.26;
    cooler.add(bottle);
    cooler.position.set(x, ctx.y, z);
    group.add(cooler);
    return cooler;
}

function placePlant(ctx, group, x, z) {
    const plant = new THREE.Group();
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.18, 0.36, 10), MAT_POT);
    pot.position.y = 0.18;
    plant.add(pot);
    for (let i = 0; i < 4; i += 1) {
        const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), MAT_PLANT);
        leaf.scale.set(1, 0.7, 1);
        leaf.position.set(Math.cos(i * 1.7) * 0.16, 0.55 + (i % 2) * 0.22, Math.sin(i * 1.7) * 0.16);
        plant.add(leaf);
    }
    plant.position.set(x, ctx.y, z);
    group.add(plant);
    return plant;
}

// ---------------------------------------------------------------------------
// structure helpers
// ---------------------------------------------------------------------------
function addBox(group, material, cx, cy, cz, sx, sy, sz) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material);
    mesh.position.set(cx, cy, cz);
    group.add(mesh);
    return mesh;
}

function addWallX(group, material, x1, x2, z, yBase, height) {
    if (x2 - x1 <= 0.001) return null;
    return addBox(group, material, (x1 + x2) / 2, yBase + height / 2, z, x2 - x1, height, WALL_T);
}

function addWallZ(group, material, z1, z2, x, yBase, height) {
    if (z2 - z1 <= 0.001) return null;
    return addBox(group, material, x, yBase + height / 2, (z1 + z2) / 2, WALL_T, height, z2 - z1);
}

// ---------------------------------------------------------------------------
// floor construction
// ---------------------------------------------------------------------------
function buildHallRing(ctx) {
    const r = 3.2;
    addStandWaypoint(ctx, "hallS", 0, r, Math.PI);
    addStandWaypoint(ctx, "hallSE", r, r, Math.PI);
    addStandWaypoint(ctx, "hallE", r, 0, -Math.PI / 2);
    addStandWaypoint(ctx, "hallNE", r, -r, 0);
    addStandWaypoint(ctx, "hallN", 0, -r, 0);
    addStandWaypoint(ctx, "hallNW", -r, -r, 0);
    addStandWaypoint(ctx, "hallW", -r, 0, Math.PI / 2);
    addStandWaypoint(ctx, "hallSW", -r, r, Math.PI);
    const ring = ["hallS", "hallSE", "hallE", "hallNE", "hallN", "hallNW", "hallW", "hallSW"];
    for (let i = 0; i < ring.length; i += 1) {
        nodeLink(ctx.nodes, ring[i], ring[(i + 1) % ring.length]);
    }
    // elevator waiting area, right in front of the doors (doors face +Z)
    addStandWaypoint(ctx, "elevWait", 0, 2.4, Math.PI);
    nodeLink(ctx.nodes, "elevWait", "hallS");
}

// Jambs + header beside the shaft opening so the call panel has a wall, plus
// the four shaft corner posts.
function buildShaftFacade(group, floorY) {
    const h = WORLD.FLOOR_HEIGHT;
    addBox(group, MAT_INNER_WALL, 2.05, floorY + h / 2, SHAFT_HZ, 1.1, h, WALL_T);
    addBox(group, MAT_INNER_WALL, -2.05, floorY + h / 2, SHAFT_HZ, 1.1, h, WALL_T);
    addBox(group, MAT_INNER_WALL, 0, floorY + h - 0.4, SHAFT_HZ, 3.0, 0.8, WALL_T);
}

function buildOfficeFloor(group, ctx, floorNumber) {
    const floorY = ctx.y;
    const h = WORLD.FLOOR_HEIGHT;
    const desks = [];

    buildHallRing(ctx);
    buildShaftFacade(group, floorY);

    // ---- four private offices along the back wall -----------------------
    const officeCenters = [-8.25, -2.75, 2.75, 8.25];
    const officeNames = ["officeA", "officeB", "officeC", "officeD"];
    const wallSegs = [[-HALF_W, -8.85], [-7.65, -3.35], [-2.15, 2.15], [3.35, 7.65], [8.85, HALF_W]];
    for (let i = 0; i < wallSegs.length; i += 1) {
        addWallX(group, MAT_INNER_WALL, wallSegs[i][0], wallSegs[i][1], -4.4, floorY, h);
    }
    const dividers = [-5.5, 0, 5.5];
    for (let i = 0; i < dividers.length; i += 1) {
        addWallZ(group, MAT_INNER_WALL, -HALF_D, -4.4, dividers[i], floorY, h);
    }

    for (let i = 0; i < officeCenters.length; i += 1) {
        const cx = officeCenters[i];
        const doorName = officeNames[i] + "_door";
        const deskName = officeNames[i] + "_desk";
        addStandWaypoint(ctx, doorName, cx, -4.4, 0);
        // Desk faces +Z; monitor sits at its back (-Z, against the outer wall).
        placeDesk(ctx, group, cx, -7.55, 0);
        // The sitter faces the monitor, i.e. -Z  ->  facing = PI.
        placeChair(ctx, group, deskName, cx, -6.45, Math.PI, MAT_FABRIC_A);
        nodeLink(ctx.nodes, doorName, deskName);
        desks.push({ floor: floorNumber, id: officeNames[i], wpName: deskName, doorWpName: doorName });
    }
    nodeLinkMany(ctx.nodes, "hallNW", ["officeA_door", "officeB_door"]);
    nodeLinkMany(ctx.nodes, "hallN", ["officeB_door", "officeC_door"]);
    nodeLinkMany(ctx.nodes, "hallNE", ["officeC_door", "officeD_door"]);

    // ---- conference room, front-left ------------------------------------
    addWallX(group, MAT_INNER_WALL, -HALF_W, -6.6, 4.4, floorY, h);
    addWallX(group, MAT_INNER_WALL, -5.4, -4.4, 4.4, floorY, h);
    addWallZ(group, MAT_INNER_WALL, 4.4, HALF_D, -4.4, floorY, h);
    addStandWaypoint(ctx, "conf_door", -6.0, 4.4, 0);
    addStandWaypoint(ctx, "conf_center", -5.6, 5.3, Math.PI);
    addStandWaypoint(ctx, "conf_back", -5.0, 8.2, Math.PI);
    placeTable(ctx, group, -7.6, 6.8, 4.0, 1.5, 0.74);
    placeChair(ctx, group, "conf_seat0", -8.8, 5.5, 0, MAT_FABRIC_A);
    placeChair(ctx, group, "conf_seat1", -6.4, 5.5, 0, MAT_FABRIC_A);
    placeChair(ctx, group, "conf_seat2", -8.8, 8.1, Math.PI, MAT_FABRIC_A);
    placeChair(ctx, group, "conf_seat3", -6.4, 8.1, Math.PI, MAT_FABRIC_A);
    nodeLink(ctx.nodes, "conf_door", "hallSW");
    nodeLink(ctx.nodes, "conf_door", "conf_center");
    nodeLinkMany(ctx.nodes, "conf_center", ["conf_seat0", "conf_seat1", "conf_back"]);
    nodeLinkMany(ctx.nodes, "conf_back", ["conf_seat2", "conf_seat3"]);

    // ---- lounge / break area, front-right --------------------------------
    addWallX(group, MAT_INNER_WALL, 4.4, 5.4, 4.4, floorY, h);
    addWallX(group, MAT_INNER_WALL, 6.6, HALF_W, 4.4, floorY, h);
    addWallZ(group, MAT_INNER_WALL, 4.4, HALF_D, 4.4, floorY, h);
    addStandWaypoint(ctx, "lounge_door", 6.0, 4.4, 0);
    addStandWaypoint(ctx, "lounge_center", 6.4, 5.6, 0);
    placeCouch(ctx, group, 8.4, 8.2, Math.PI, ["lounge_spot0", "lounge_spot1"], MAT_FABRIC_C);
    placeTable(ctx, group, 8.4, 6.7, 1.3, 0.7, 0.42);
    placeArmchair(ctx, group, "lounge_spot2", 6.4, 6.9, Math.PI / 2, MAT_FABRIC_B);
    placeArmchair(ctx, group, "lounge_spot3", 10.3, 6.9, -Math.PI / 2, MAT_FABRIC_B);
    placeWaterCooler(ctx, group, 10.4, 5.0);
    addStandWaypoint(ctx, "water_cooler", 9.6, 5.2, faceToward(9.6, 5.2, 10.4, 5.0));
    placePlant(ctx, group, 5.1, 8.4);
    nodeLink(ctx.nodes, "lounge_door", "hallSE");
    nodeLink(ctx.nodes, "lounge_door", "lounge_center");
    nodeLinkMany(ctx.nodes, "lounge_center", ["lounge_spot0", "lounge_spot1", "lounge_spot2", "lounge_spot3", "water_cooler"]);

    // ---- hallway loiter spots -------------------------------------------
    addStandWaypoint(ctx, "hall_stand_N", -1.7, -3.4, Math.PI / 2);
    addStandWaypoint(ctx, "hall_stand_S", 1.8, 3.5, -Math.PI / 2);
    nodeLink(ctx.nodes, "hall_stand_N", "hallN");
    nodeLink(ctx.nodes, "hall_stand_S", "hallS");

    return desks;
}

function buildLobby(group, ctx) {
    const floorY = ctx.y;

    buildHallRing(ctx);
    buildShaftFacade(group, floorY);

    // ---- entrance chain --------------------------------------------------
    addStandWaypoint(ctx, "outside", 0, 12, Math.PI);
    addStandWaypoint(ctx, "front_door_threshold", 0, 9.35, Math.PI);
    addStandWaypoint(ctx, "entrance", 0, 7.4, Math.PI);
    addStandWaypoint(ctx, "lobby_center", 0, 4.6, Math.PI);
    nodeLink(ctx.nodes, "outside", "front_door_threshold");
    nodeLink(ctx.nodes, "front_door_threshold", "entrance");
    nodeLink(ctx.nodes, "entrance", "lobby_center");
    nodeLinkMany(ctx.nodes, "lobby_center", ["elevWait", "hallS", "hallSE", "hallSW"]);

    // sidewalk outside the front wall
    addBox(group, MAT_SIDEWALK, 0, floorY + 0.02, 12.0, 20, 0.06, 6.4);
    addBox(group, MAT_SIDEWALK, 0, floorY + 0.03, 9.25, 4.0, 0.06, 1.2);

    // Glass doors: parked wide open against the jambs, purely decorative and
    // clear of the 3-unit opening.
    const doorL = new THREE.Mesh(new THREE.BoxGeometry(0.55, 2.6, 0.07), MAT_DOOR_GLASS);
    doorL.position.set(-1.24, floorY + 1.3, 9.0);
    group.add(doorL);
    const doorR = doorL.clone();
    doorR.position.x = 1.24;
    group.add(doorR);

    // ---- cafe on the left -------------------------------------------------
    addBox(group, MAT_WOOD, -9.6, floorY + 0.5, 2.4, 1.0, 1.0, 5.2);
    addBox(group, MAT_WOOD_DARK, -9.6, floorY + 1.03, 2.4, 1.14, 0.07, 5.36);
    addBox(group, MAT_METAL, -9.6, floorY + 1.28, 3.9, 0.5, 0.45, 0.5);
    addBox(group, MAT_SCREEN, -9.6, floorY + 1.28, 3.62, 0.3, 0.2, 0.04);
    const pastry = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.42, 0.7), MAT_DOOR_GLASS);
    pastry.position.set(-9.6, floorY + 1.28, 0.9);
    group.add(pastry);
    addStandWaypoint(ctx, "cafe_order", -8.5, 2.4, -Math.PI / 2);
    addStandWaypoint(ctx, "cafe_door", -3.9, 3.9, Math.PI);
    addStandWaypoint(ctx, "cafe_center", -6.3, 5.6, Math.PI);
    nodeLink(ctx.nodes, "cafe_door", "hallSW");
    nodeLink(ctx.nodes, "cafe_door", "cafe_center");
    nodeLink(ctx.nodes, "cafe_center", "cafe_order");
    nodeLink(ctx.nodes, "lobby_center", "cafe_door");

    const bistroSpots = [];
    const tableXZ = [[-7.6, 7.0], [-5.4, 7.0], [-7.6, 4.5], [-5.4, 4.5]];
    for (let i = 0; i < tableXZ.length; i += 1) {
        const tx = tableXZ[i][0];
        const tz = tableXZ[i][1];
        placeRoundTable(ctx, group, tx, tz, 0.44, 0.74);
        const leftName = "bistro" + (i * 2);
        const rightName = "bistro" + (i * 2 + 1);
        placeChair(ctx, group, leftName, tx - 0.86, tz, Math.PI / 2, MAT_FABRIC_A);
        placeChair(ctx, group, rightName, tx + 0.86, tz, -Math.PI / 2, MAT_FABRIC_A);
        nodeLinkMany(ctx.nodes, "cafe_center", [leftName, rightName]);
        bistroSpots.push(leftName);
        bistroSpots.push(rightName);
    }

    // ---- front lounge, right side ----------------------------------------
    addStandWaypoint(ctx, "flounge_center", 6.6, 4.9, 0);
    placeCouch(ctx, group, 8.6, 8.2, Math.PI, ["flounge_seat0", "flounge_seat1"], MAT_FABRIC_C);
    placeTable(ctx, group, 8.6, 6.6, 1.4, 0.7, 0.42);
    placeArmchair(ctx, group, "flounge_seat2", 6.5, 6.6, Math.PI / 2, MAT_FABRIC_B);
    placeArmchair(ctx, group, "flounge_seat3", 10.4, 6.6, -Math.PI / 2, MAT_FABRIC_B);
    nodeLink(ctx.nodes, "flounge_center", "hallSE");
    nodeLink(ctx.nodes, "flounge_center", "lobby_center");
    nodeLinkMany(ctx.nodes, "flounge_center", ["flounge_seat0", "flounge_seat1", "flounge_seat2", "flounge_seat3"]);

    // ---- back lounge (two couches facing each other) ----------------------
    addStandWaypoint(ctx, "back_lounge_center", 5.0, -5.3, -Math.PI / 2);
    placeCouch(ctx, group, 7.0, -7.0, 0, ["back_lounge_N", "back_lounge_N2"], MAT_FABRIC_C);
    placeCouch(ctx, group, 7.0, -3.6, Math.PI, ["back_lounge_S", "back_lounge_S2"], MAT_FABRIC_C);
    placeTable(ctx, group, 7.0, -5.3, 1.5, 0.8, 0.42);
    nodeLink(ctx.nodes, "back_lounge_center", "hallNE");
    nodeLinkMany(ctx.nodes, "back_lounge_center", ["back_lounge_N", "back_lounge_N2", "back_lounge_S", "back_lounge_S2"]);

    // ---- conversation pit, back-left --------------------------------------
    addStandWaypoint(ctx, "pit_center", -4.6, -4.4, Math.PI);
    placeRoundTable(ctx, group, -6.9, -5.4, 0.75, 0.5);
    placeArmchair(ctx, group, "pit_N", -6.9, -7.2, 0, MAT_FABRIC_B);
    placeArmchair(ctx, group, "pit_S", -6.9, -3.6, Math.PI, MAT_FABRIC_B);
    placeArmchair(ctx, group, "pit_E", -5.1, -5.4, -Math.PI / 2, MAT_FABRIC_B);
    placeArmchair(ctx, group, "pit_W", -8.7, -5.4, Math.PI / 2, MAT_FABRIC_B);
    nodeLink(ctx.nodes, "pit_center", "hallNW");
    nodeLinkMany(ctx.nodes, "pit_center", ["pit_N", "pit_S", "pit_E", "pit_W"]);

    // ---- water coolers ----------------------------------------------------
    placeWaterCooler(ctx, group, 2.9, 7.6);
    addStandWaypoint(ctx, "lobby_wc_front", 2.4, 7.0, faceToward(2.4, 7.0, 2.9, 7.6));
    placeWaterCooler(ctx, group, -2.4, -7.4);
    addStandWaypoint(ctx, "lobby_wc_back", -2.1, -6.7, faceToward(-2.1, -6.7, -2.4, -7.4));
    nodeLink(ctx.nodes, "lobby_wc_front", "entrance");
    nodeLink(ctx.nodes, "lobby_wc_back", "hallNW");

    // ---- reception + kiosk -------------------------------------------------
    addBox(group, MAT_WOOD, -3.0, floorY + 0.5, 7.2, 2.0, 1.0, 0.75);
    addBox(group, MAT_WOOD_DARK, -3.0, floorY + 1.03, 7.2, 2.14, 0.07, 0.9);
    addBox(group, MAT_SCREEN, -3.4, floorY + 1.25, 7.2, 0.4, 0.3, 0.04);
    addStandWaypoint(ctx, "reception", -2.9, 6.3, faceToward(-2.9, 6.3, -3.0, 7.2));
    nodeLink(ctx.nodes, "reception", "lobby_center");
    nodeLink(ctx.nodes, "reception", "entrance");

    addBox(group, MAT_METAL, 2.6, floorY + 0.6, 8.3, 0.5, 1.2, 0.3);
    addBox(group, MAT_SCREEN, 2.6, floorY + 1.35, 8.25, 0.55, 0.4, 0.06);
    addStandWaypoint(ctx, "kiosk", 2.3, 7.6, faceToward(2.3, 7.6, 2.6, 8.3));
    nodeLink(ctx.nodes, "kiosk", "entrance");

    // ---- plants + generic loiter waypoints ---------------------------------
    placePlant(ctx, group, -2.3, 8.4);
    placePlant(ctx, group, 4.6, 8.5);
    placePlant(ctx, group, -10.2, 7.9);

    addStandWaypoint(ctx, "lobby_stand_center", 1.9, 4.1, Math.PI);
    addStandWaypoint(ctx, "lobby_stand_NE", 4.6, -7.5, 0);
    addStandWaypoint(ctx, "lobby_stand_NW", -3.0, -7.6, 0);
    addStandWaypoint(ctx, "lobby_stand_midE", 5.6, 1.2, -Math.PI / 2);
    addStandWaypoint(ctx, "lobby_stand_midW", -5.8, -1.2, Math.PI / 2);
    addStandWaypoint(ctx, "lobby_stand_entry", 2.8, 6.4, Math.PI);
    nodeLink(ctx.nodes, "lobby_stand_center", "lobby_center");
    nodeLink(ctx.nodes, "lobby_stand_NE", "back_lounge_center");
    nodeLink(ctx.nodes, "lobby_stand_NW", "pit_center");
    nodeLink(ctx.nodes, "lobby_stand_midE", "hallE");
    nodeLink(ctx.nodes, "lobby_stand_midW", "hallW");
    nodeLink(ctx.nodes, "lobby_stand_entry", "entrance");

    return {
        bistroSpots: bistroSpots,
        loungeSpots: ["flounge_seat0", "flounge_seat1", "flounge_seat2", "flounge_seat3"],
        backLoungeSpots: ["back_lounge_N", "back_lounge_N2", "back_lounge_S", "back_lounge_S2",
            "pit_N", "pit_S", "pit_E", "pit_W"],
        standSpots: ["lobby_stand_center", "lobby_stand_NE", "lobby_stand_NW", "lobby_stand_midE",
            "lobby_stand_midW", "lobby_stand_entry"],
        serviceSpots: ["reception", "kiosk", "lobby_wc_front", "lobby_wc_back"],
        entranceSpot: "entrance"
    };
}

// ---------------------------------------------------------------------------
// createWorld
// ---------------------------------------------------------------------------
function createWorld(scene) {
    const buildingGroup = new THREE.Group();
    buildingGroup.renderOrder = 0;
    const floors = [];
    const allDesks = [];

    // ---- slabs ------------------------------------------------------------
    addBox(buildingGroup, MAT_SLAB_SOLID, 0, -0.06, 0, WORLD.BUILDING_WIDTH, 0.12, WORLD.BUILDING_DEPTH);
    for (let f = 1; f < WORLD.FLOOR_COUNT; f += 1) {
        const y = f * WORLD.FLOOR_HEIGHT;
        addBox(buildingGroup, MAT_SLAB_GLASS, (-HALF_W - SHAFT_HX) / 2, y - 0.05, 0, HALF_W - SHAFT_HX, 0.1, WORLD.BUILDING_DEPTH);
        addBox(buildingGroup, MAT_SLAB_GLASS, (HALF_W + SHAFT_HX) / 2, y - 0.05, 0, HALF_W - SHAFT_HX, 0.1, WORLD.BUILDING_DEPTH);
        addBox(buildingGroup, MAT_SLAB_GLASS, 0, y - 0.05, (-HALF_D - SHAFT_HZ) / 2, WORLD.SHAFT_WIDTH, 0.1, HALF_D - SHAFT_HZ);
        addBox(buildingGroup, MAT_SLAB_GLASS, 0, y - 0.05, (HALF_D + SHAFT_HZ) / 2, WORLD.SHAFT_WIDTH, 0.1, HALF_D - SHAFT_HZ);
    }
    addBox(buildingGroup, MAT_SLAB_SOLID, 0, BUILDING_TOP + 0.07, 0, WORLD.BUILDING_WIDTH + 0.4, 0.14, WORLD.BUILDING_DEPTH + 0.4);

    // ---- outer walls -------------------------------------------------------
    addWallX(buildingGroup, MAT_OUTER_WALL, -HALF_W, HALF_W, -HALF_D, 0, BUILDING_TOP);
    addWallZ(buildingGroup, MAT_OUTER_WALL, -HALF_D, HALF_D, -HALF_W, 0, BUILDING_TOP);
    addWallZ(buildingGroup, MAT_OUTER_WALL, -HALF_D, HALF_D, HALF_W, 0, BUILDING_TOP);
    // Front wall: two full-height side panels + a header above the floor-0 gap.
    addWallX(buildingGroup, MAT_OUTER_WALL, -HALF_W, -DOORWAY_HALF, HALF_D, 0, BUILDING_TOP);
    addWallX(buildingGroup, MAT_OUTER_WALL, DOORWAY_HALF, HALF_W, HALF_D, 0, BUILDING_TOP);
    addBox(buildingGroup, MAT_OUTER_WALL, 0, WORLD.FLOOR_HEIGHT + (BUILDING_TOP - WORLD.FLOOR_HEIGHT) / 2, HALF_D,
        DOORWAY_HALF * 2, BUILDING_TOP - WORLD.FLOOR_HEIGHT, WALL_T);

    // ---- shaft corner posts -------------------------------------------------
    const postX = [-SHAFT_HX, SHAFT_HX];
    const postZ = [-SHAFT_HZ, SHAFT_HZ];
    for (let i = 0; i < postX.length; i += 1) {
        for (let j = 0; j < postZ.length; j += 1) {
            addBox(buildingGroup, MAT_SHAFT_POST, postX[i], BUILDING_TOP / 2, postZ[j], 0.16, BUILDING_TOP, 0.16);
        }
    }

    // ---- per-floor contents ---------------------------------------------------
    for (let f = 0; f < WORLD.FLOOR_COUNT; f += 1) {
        const floorY = f * WORLD.FLOOR_HEIGHT;
        const nodes = {};
        const sitTargets = {};
        const ctx = makeFloorContext(nodes, sitTargets, floorY);
        let lobbyInfo = null;
        let desks = [];

        if (f === 0) {
            lobbyInfo = buildLobby(buildingGroup, ctx);
        } else {
            desks = buildOfficeFloor(buildingGroup, ctx, f);
            for (let d = 0; d < desks.length; d += 1) allDesks.push(desks[d]);
        }

        // call panel on the jamb beside the doors, facing +Z
        const callPanel = createCallPanel();
        callPanel.position.set(2.05, floorY + 1.35, SHAFT_HZ + 0.09);
        buildingGroup.add(callPanel);

        // building-side floor indicator above the doors
        const shaftIndicator = makeIndicatorPlane(0.9);
        shaftIndicator.position.set(0, floorY + WORLD.FLOOR_HEIGHT - 0.42, SHAFT_HZ + 0.09);
        buildingGroup.add(shaftIndicator);

        const record = {
            floorNumber: f,
            y: floorY,
            nodes: nodes,
            sitTargets: sitTargets,
            callPanel: callPanel,
            shaftIndicator: shaftIndicator,
            desks: desks
        };
        if (lobbyInfo) {
            record.bistroSpots = lobbyInfo.bistroSpots;
            record.loungeSpots = lobbyInfo.loungeSpots;
            record.backLoungeSpots = lobbyInfo.backLoungeSpots;
            record.standSpots = lobbyInfo.standSpots;
            record.serviceSpots = lobbyInfo.serviceSpots;
            record.entranceSpot = lobbyInfo.entranceSpot;
        }
        floors.push(record);
    }

    buildingGroup.traverse((child) => {
        child.renderOrder = 0;
    });
    scene.add(buildingGroup);

    return {
        buildingGroup: buildingGroup,
        floors: floors,
        desks: allDesks,
        bfsPath: bfsPath,
        nearestNodeName: nearestNodeName
    };
}

window.WORLD = WORLD;
window.createWorld = createWorld;
window.bfsPath = bfsPath;
window.nearestNodeName = nearestNodeName;
window.updateTextTexture = updateTextTexture;
window.makeIndicatorPlane = makeIndicatorPlane;
window.makeGlassMaterial = makeGlassMaterial;
