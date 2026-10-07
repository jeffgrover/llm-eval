/* world.js - building geometry, per-floor layouts, furniture, navigation
   graph and call panels. Classic browser script: no import/export. */

const WORLD = {
    FLOOR_HEIGHT: 3.4,
    FLOOR_COUNT: 6,
    BUILDING_WIDTH: 22,
    BUILDING_DEPTH: 18,
    SHAFT_WIDTH: 3,
    SHAFT_DEPTH: 3,
    PERSON_R: 0.4
};

const HALL = { west: -4.0, east: 4.0, north: -3.4, south: 2.9 };
const OFFICE_X = [-8.25, -2.75, 2.75, 8.25];
const OFFICE_LETTERS = ["A", "B", "C", "D"];
const OFFICE_WALL_Z = -4.2;
const FRONT_WALL_Z = 3.6;
const GRAPH_BY_NODES = new Map();

function transparentMat(color, opacity) {
    return new THREE.MeshLambertMaterial({
        color: color,
        transparent: true,
        opacity: opacity,
        depthWrite: false,
        side: THREE.DoubleSide
    });
}

function solidMat(color) {
    return new THREE.MeshLambertMaterial({ color: color });
}

const MAT_FLOOR = transparentMat(0x9aa0a6, 0.3);
const MAT_SLAB = solidMat(0x8b8f93);
const MAT_GROUND = solidMat(0x6f7378);
const MAT_WALK = solidMat(0x9c9c96);
const MAT_WALL_OUTER = transparentMat(0x9999ff, 0.2);
const MAT_WALL_INNER = transparentMat(0xbbc5e6, 0.28);
const MAT_GLASS = transparentMat(0xaad4ff, 0.22);
const MAT_DESK = solidMat(0x9a7b52);
const MAT_DESK_DARK = solidMat(0x6b543a);
const MAT_CHAIR = solidMat(0x44506b);
const MAT_COUCH = solidMat(0x6d5a86);
const MAT_TABLE = solidMat(0xb08d57);
const MAT_METAL = solidMat(0x8f959b);
const MAT_DARK = solidMat(0x22262c);
const MAT_SCREEN = new THREE.MeshBasicMaterial({ color: 0x7fd4ff });
const MAT_COOLER = solidMat(0xdfe9ef);
const MAT_WATER = transparentMat(0x66ccff, 0.6);
const MAT_PLANT = solidMat(0x3f7d3f);
const MAT_POT = solidMat(0x8a5a3a);
const MAT_MUG = solidMat(0xe8e2d8);
const MAT_ARROW_OFF = new THREE.MeshBasicMaterial({ color: 0x3a3f47, side: THREE.DoubleSide });
const MAT_ARROW_ON = new THREE.MeshBasicMaterial({ color: 0x39ff6a, side: THREE.DoubleSide });

function addBox(parent, w, h, d, x, y, z, mat, rotY) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    if (rotY) mesh.rotation.y = rotY;
    parent.add(mesh);
    return mesh;
}

function faceTo(fromX, fromZ, toX, toZ) {
    return Math.atan2(toX - fromX, toZ - fromZ);
}

/* ------------------------------------------------------------------ */
/* canvas text textures                                                */
/* ------------------------------------------------------------------ */

function makeTextTexture(canvasSize) {
    const size = canvasSize || 256;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#050505";
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = 4;
    tex._canvas = canvas;
    tex._ctx = ctx;
    tex._lastText = null;
    return tex;
}

function updateTextTexture(tex, text) {
    if (!tex || !tex._ctx) return;
    if (tex._lastText === text) return;
    tex._lastText = text;
    const ctx = tex._ctx;
    const size = tex._canvas.width;
    const label = String(text === undefined || text === null ? "" : text);
    ctx.fillStyle = "#050505";
    ctx.fillRect(0, 0, size, size);
    const fontSize = Math.floor(size * 0.82 * (label.length > 1 ? 0.72 : 1.0));
    ctx.font = `bold ${fontSize}px "Courier New", monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "#ffbb22";
    ctx.shadowBlur = Math.floor(size * 0.14);
    ctx.fillStyle = "#ffbb22";
    ctx.fillText(label, size / 2, size * 0.54);
    ctx.shadowBlur = 0;
    tex.needsUpdate = true;
}

function makeIndicatorMesh(tex, w, h) {
    const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({ map: tex, transparent: false })
    );
    return mesh;
}

/* ------------------------------------------------------------------ */
/* furniture                                                           */
/* ------------------------------------------------------------------ */

/* A chair / armchair. Local +Z is the direction the seated person faces
   (legs point +Z, backrest sits at -Z). */
function buildChair(parent, x, y, z, facing, wide) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = facing;
    const sw = wide ? 0.62 : 0.5;
    addBox(g, sw, 0.08, 0.52, 0, 0.46, 0, MAT_CHAIR);
    addBox(g, sw, 0.6, 0.08, 0, 0.76, -0.22, MAT_CHAIR);
    const legMat = MAT_DARK;
    const positions = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
    for (const p of positions) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.46, 6), legMat);
        leg.position.set(p[0] * (sw / 2 - 0.06), 0.23, p[1] * 0.2);
        g.add(leg);
    }
    if (wide) {
        addBox(g, 0.08, 0.14, 0.5, -(sw / 2 - 0.02), 0.6, 0, MAT_CHAIR);
        addBox(g, 0.08, 0.14, 0.5, (sw / 2 - 0.02), 0.6, 0, MAT_CHAIR);
    }
    parent.add(g);
    return g;
}

/* A couch whose long axis runs along local X; it faces local +Z. */
function buildCouch(parent, x, y, z, facing, length) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = facing;
    const len = length || 2.0;
    addBox(g, len, 0.18, 0.85, 0, 0.42, 0, MAT_COUCH);
    addBox(g, len, 0.55, 0.14, 0, 0.72, -0.36, MAT_COUCH);
    addBox(g, 0.14, 0.5, 0.85, -(len / 2 - 0.07), 0.62, 0, MAT_COUCH);
    addBox(g, 0.14, 0.5, 0.85, (len / 2 - 0.07), 0.62, 0, MAT_COUCH);
    addBox(g, len * 0.9, 0.12, 0.7, 0, 0.56, 0.02, MAT_COUCH);
    parent.add(g);
    return g;
}

function buildTable(parent, x, y, z, w, d, rotY) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = rotY || 0;
    addBox(g, w, 0.08, d, 0, 0.74, 0, MAT_TABLE);
    const positions = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
    for (const p of positions) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.74, 6), MAT_METAL);
        leg.position.set(p[0] * (w / 2 - 0.12), 0.37, p[1] * (d / 2 - 0.12));
        g.add(leg);
    }
    parent.add(g);
    return g;
}

function buildRoundTable(parent, x, y, z, radius) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.08, 16), MAT_TABLE);
    top.position.set(0, 0.74, 0);
    g.add(top);
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.72, 8), MAT_METAL);
    column.position.set(0, 0.36, 0);
    g.add(column);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.05, 12), MAT_METAL);
    base.position.set(0, 0.03, 0);
    g.add(base);
    parent.add(g);
    return g;
}

/* Desk with the monitor on the far (-Z local) edge. The chair sits on the +Z
   side, so a seated worker faces -Z (rotation.y = Math.PI). */
function buildDesk(parent, x, y, z) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    addBox(g, 1.7, 0.08, 0.8, 0, 0.75, 0, MAT_DESK);
    addBox(g, 1.6, 0.3, 0.06, 0, 0.55, -0.34, MAT_DESK_DARK);
    const legPositions = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
    for (const p of legPositions) {
        addBox(g, 0.08, 0.75, 0.08, p[0] * 0.78, 0.375, p[1] * 0.33, MAT_DESK_DARK);
    }
    addBox(g, 0.5, 0.34, 0.04, 0, 0.96, -0.28, MAT_DARK);
    addBox(g, 0.46, 0.3, 0.03, 0, 0.96, -0.25, MAT_SCREEN);
    addBox(g, 0.22, 0.03, 0.14, 0, 0.79, -0.26, MAT_DARK);
    addBox(g, 0.16, 0.05, 0.16, 0.6, 0.83, 0.1, MAT_MUG);
    addBox(g, 0.3, 0.04, 0.22, -0.55, 0.81, 0.05, MAT_MUG);
    parent.add(g);
    return g;
}

function buildWaterCooler(parent, x, y, z) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    addBox(g, 0.5, 1.0, 0.5, 0, 0.5, 0, MAT_COOLER);
    const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.55, 12), MAT_WATER);
    bottle.position.set(0, 1.28, 0);
    g.add(bottle);
    addBox(g, 0.3, 0.12, 0.1, 0, 0.75, 0.28, MAT_DARK);
    parent.add(g);
    return g;
}

function buildPlant(parent, x, y, z) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.17, 0.34, 10), MAT_POT);
    pot.position.set(0, 0.17, 0);
    g.add(pot);
    const bush = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), MAT_PLANT);
    bush.position.set(0, 0.62, 0);
    g.add(bush);
    const bush2 = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), MAT_PLANT);
    bush2.position.set(0.18, 0.9, 0.1);
    g.add(bush2);
    parent.add(g);
    return g;
}

function buildCounter(parent, x, y, z, w, d) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    addBox(g, w, 1.0, d, 0, 0.5, 0, MAT_DESK);
    addBox(g, w + 0.1, 0.08, d + 0.1, 0, 1.02, 0, MAT_DESK_DARK);
    parent.add(g);
    return g;
}

function buildCoffeeMachine(parent, x, y, z) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    addBox(g, 0.42, 0.55, 0.36, 0, 1.33, 0, MAT_DARK);
    addBox(g, 0.3, 0.16, 0.04, 0, 1.2, 0.2, MAT_SCREEN);
    addBox(g, 0.2, 0.04, 0.16, 0, 0.98, 0.16, MAT_METAL);
    parent.add(g);
    return g;
}

function buildPastryCase(parent, x, y, z) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    addBox(g, 0.7, 0.42, 0.4, 0, 1.27, 0, MAT_GLASS);
    addBox(g, 0.62, 0.04, 0.34, 0, 1.14, 0, MAT_METAL);
    addBox(g, 0.12, 0.1, 0.12, -0.16, 1.22, 0, MAT_MUG);
    addBox(g, 0.12, 0.1, 0.12, 0.14, 1.22, 0.04, MAT_MUG);
    parent.add(g);
    return g;
}

function buildReceptionDesk(parent, x, y, z, facing) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = facing;
    addBox(g, 2.2, 1.05, 0.7, 0, 0.52, 0, MAT_DESK);
    addBox(g, 2.35, 0.08, 0.85, 0, 1.08, 0, MAT_DESK_DARK);
    addBox(g, 0.5, 0.32, 0.04, 0.7, 1.28, -0.2, MAT_DARK);
    addBox(g, 0.46, 0.28, 0.03, 0.7, 1.28, -0.17, MAT_SCREEN);
    parent.add(g);
    return g;
}

function buildKiosk(parent, x, y, z, facing) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = facing;
    addBox(g, 0.5, 1.5, 0.9, 0, 0.75, 0, MAT_METAL);
    addBox(g, 0.08, 0.9, 0.7, 0.24, 1.15, 0, MAT_SCREEN);
    parent.add(g);
    return g;
}

/* ------------------------------------------------------------------ */
/* call panel + indicators                                             */
/* ------------------------------------------------------------------ */

function makeArrowShape(up) {
    const shape = new THREE.Shape();
    if (up) {
        shape.moveTo(-0.13, -0.1);
        shape.lineTo(0.13, -0.1);
        shape.lineTo(0, 0.14);
        shape.lineTo(-0.13, -0.1);
    } else {
        shape.moveTo(-0.13, 0.1);
        shape.lineTo(0.13, 0.1);
        shape.lineTo(0, -0.14);
        shape.lineTo(-0.13, 0.1);
    }
    return new THREE.ShapeGeometry(shape);
}

function buildCallPanel(parent, x, y, z) {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    addBox(group, 0.55, 1.4, 0.05, 0, 0, 0, MAT_METAL);

    const upMesh = new THREE.Mesh(makeArrowShape(true), MAT_ARROW_OFF);
    upMesh.position.set(0, -0.09, 0.04);
    group.add(upMesh);

    const downMesh = new THREE.Mesh(makeArrowShape(false), MAT_ARROW_OFF);
    downMesh.position.set(0, -0.39, 0.04);
    group.add(downMesh);

    const tex = makeTextTexture(256);
    updateTextTexture(tex, "0");
    const display = makeIndicatorMesh(tex, 0.45, 0.45);
    display.position.set(0, 0.45, 0.04);
    group.add(display);

    group.userData.setUp = function (on) {
        upMesh.material = on ? MAT_ARROW_ON : MAT_ARROW_OFF;
    };
    group.userData.setDown = function (on) {
        downMesh.material = on ? MAT_ARROW_ON : MAT_ARROW_OFF;
    };
    group.userData.setIndicator = function (text) {
        updateTextTexture(tex, text);
    };
    parent.add(group);
    return group;
}

function buildShaftIndicator(parent, x, y, z) {
    const tex = makeTextTexture(256);
    updateTextTexture(tex, "0");
    const mesh = makeIndicatorMesh(tex, 0.9, 0.9);
    mesh.position.set(x, y, z);
    mesh.userData.setIndicator = function (text) {
        updateTextTexture(tex, text);
    };
    parent.add(mesh);
    return mesh;
}

/* ------------------------------------------------------------------ */
/* navigation helpers                                                  */
/* ------------------------------------------------------------------ */

function addNode(floorObj, name, x, z, y) {
    floorObj.nodes[name] = new THREE.Vector3(x, y === undefined ? floorObj.floorY : y, z);
    if (!floorObj.graph[name]) floorObj.graph[name] = [];
    return floorObj.nodes[name];
}

function linkNodes(floorObj, a, b) {
    if (!floorObj.nodes[a] || !floorObj.nodes[b]) return;
    if (!floorObj.graph[a]) floorObj.graph[a] = [];
    if (!floorObj.graph[b]) floorObj.graph[b] = [];
    if (floorObj.graph[a].indexOf(b) === -1) floorObj.graph[a].push(b);
    if (floorObj.graph[b].indexOf(a) === -1) floorObj.graph[b].push(a);
}

function setSit(floorObj, name, sit, facing, frontX, frontZ) {
    const entry = { sit: !!sit, facing: facing || 0 };
    if (frontX !== undefined) entry.front = { x: frontX, z: frontZ };
    floorObj.sitTargets[name] = entry;
}

function bfsPath(nodes, fromName, toName) {
    if (!nodes) return [];
    let graph = GRAPH_BY_NODES.get(nodes);
    if (!graph && nodes.graph) graph = nodes.graph;
    if (!graph) return [];
    if (!nodes[fromName] || !nodes[toName]) return [];
    if (fromName === toName) return [nodes[toName].clone()];
    const prev = {};
    prev[fromName] = null;
    const queue = [fromName];
    let found = false;
    while (queue.length) {
        const current = queue.shift();
        if (current === toName) {
            found = true;
            break;
        }
        const neighbours = graph[current] || [];
        for (let i = 0; i < neighbours.length; i += 1) {
            const nb = neighbours[i];
            if (!(nb in prev) && nodes[nb]) {
                prev[nb] = current;
                queue.push(nb);
            }
        }
    }
    if (!found) return [nodes[toName].clone()];
    const path = [];
    let cursor = toName;
    while (cursor !== null && cursor !== undefined) {
        path.push(nodes[cursor].clone());
        cursor = prev[cursor];
    }
    path.reverse();
    return path;
}

function nearestNodeName(floorObj, x, z) {
    let best = null;
    let bestDist = Infinity;
    for (const name in floorObj.nodes) {
        const node = floorObj.nodes[name];
        const dx = node.x - x;
        const dz = node.z - z;
        const dist = dx * dx + dz * dz;
        if (dist < bestDist) {
            bestDist = dist;
            best = name;
        }
    }
    return best;
}

/* ------------------------------------------------------------------ */
/* floor construction                                                  */
/* ------------------------------------------------------------------ */

function buildFloorSlab(parent, y) {
    const halfW = WORLD.BUILDING_WIDTH / 2;
    const halfD = WORLD.BUILDING_DEPTH / 2;
    const halfS = WORLD.SHAFT_WIDTH / 2;
    const halfSd = WORLD.SHAFT_DEPTH / 2;
    // front strip (z from shaft to front wall)
    addBox(parent, WORLD.BUILDING_WIDTH, 0.16, halfD - halfSd, 0, y - 0.08, halfSd + (halfD - halfSd) / 2, MAT_FLOOR);
    // back strip
    addBox(parent, WORLD.BUILDING_WIDTH, 0.16, halfD - halfSd, 0, y - 0.08, -(halfSd + (halfD - halfSd) / 2), MAT_FLOOR);
    // left + right strips beside the shaft
    addBox(parent, halfW - halfS, 0.16, WORLD.SHAFT_DEPTH, -(halfS + (halfW - halfS) / 2), y - 0.08, 0, MAT_FLOOR);
    addBox(parent, halfW - halfS, 0.16, WORLD.SHAFT_DEPTH, halfS + (halfW - halfS) / 2, y - 0.08, 0, MAT_FLOOR);
}

function buildShell(parent) {
    const halfW = WORLD.BUILDING_WIDTH / 2;
    const halfD = WORLD.BUILDING_DEPTH / 2;
    const height = WORLD.FLOOR_COUNT * WORLD.FLOOR_HEIGHT;
    const t = 0.16;
    const midY = height / 2;

    // ground slab + roof
    addBox(parent, WORLD.BUILDING_WIDTH + 4, 0.2, WORLD.BUILDING_DEPTH + 4, 0, -0.1, 0, MAT_GROUND);
    addBox(parent, WORLD.BUILDING_WIDTH + 0.6, 0.25, WORLD.BUILDING_DEPTH + 0.6, 0, height + 0.12, 0, MAT_SLAB);
    // sidewalk outside the front door
    addBox(parent, 16, 0.2, 5.4, 0, -0.07, 12.3, MAT_WALK);

    // back wall + side walls (full height)
    addBox(parent, WORLD.BUILDING_WIDTH + 0.4, height, t, 0, midY, -halfD, MAT_WALL_OUTER);
    addBox(parent, t, height, WORLD.BUILDING_DEPTH, -halfW, midY, 0, MAT_WALL_OUTER);
    addBox(parent, t, height, WORLD.BUILDING_DEPTH, halfW, midY, 0, MAT_WALL_OUTER);

    // front wall: two full-height side panels + a header above the doorway.
    // The floor-0 gap (x in [-1.5, 1.5]) is a real opening.
    const gap = WORLD.SHAFT_WIDTH / 2; // 1.5
    const sideWidth = halfW - gap;
    addBox(parent, sideWidth, height, t, -(gap + sideWidth / 2), midY, halfD, MAT_WALL_OUTER);
    addBox(parent, sideWidth, height, t, gap + sideWidth / 2, midY, halfD, MAT_WALL_OUTER);
    const headerBottom = WORLD.FLOOR_HEIGHT;
    const headerHeight = height - headerBottom;
    addBox(parent, gap * 2, headerHeight, t, 0, headerBottom + headerHeight / 2, halfD, MAT_WALL_OUTER);

    // doorway trim (visual only - nothing blocks the threshold)
    addBox(parent, 0.12, 2.7, 0.3, -1.62, 1.35, halfD - 0.02, MAT_METAL);
    addBox(parent, 0.12, 2.7, 0.3, 1.62, 1.35, halfD - 0.02, MAT_METAL);
    addBox(parent, 3.4, 0.9, 0.3, 0, 2.95, halfD - 0.02, MAT_WALL_OUTER);
    // glass doors, slid OPEN to the sides of the opening
    addBox(parent, 1.5, 2.4, 0.06, -2.35, 1.2, halfD - 0.18, MAT_GLASS);
    addBox(parent, 1.5, 2.4, 0.06, 2.35, 1.2, halfD - 0.18, MAT_GLASS);

    // potted plants flanking the entrance
    buildPlant(parent, -2.6, 0, 8.4);
    buildPlant(parent, 2.6, 0, 8.4);

    // shaft guide rails (visual)
    const railMat = MAT_METAL;
    addBox(parent, 0.1, height, 0.1, -1.45, midY, -1.45, railMat);
    addBox(parent, 0.1, height, 0.1, 1.45, midY, -1.45, railMat);
}

function buildInteriorWalls(parent, floorY, isLobby) {
    const halfW = WORLD.BUILDING_WIDTH / 2;
    const halfD = WORLD.BUILDING_DEPTH / 2;
    const h = WORLD.FLOOR_HEIGHT - 0.2;
    const y = floorY + h / 2;
    const t = 0.14;

    if (!isLobby) {
        // wall between the hallway and the private offices (back)
        const gapsX = OFFICE_X;
        const segments = [
            [-halfW, gapsX[0] - 0.6],
            [gapsX[0] + 0.6, gapsX[1] - 0.6],
            [gapsX[1] + 0.6, gapsX[2] - 0.6],
            [gapsX[2] + 0.6, gapsX[3] - 0.6],
            [gapsX[3] + 0.6, halfW]
        ];
        for (const seg of segments) {
            const w = seg[1] - seg[0];
            if (w > 0.05) addBox(parent, w, h, t, (seg[0] + seg[1]) / 2, y, OFFICE_WALL_Z, MAT_WALL_INNER);
        }
        // office dividers
        const dividers = [-5.5, 0, 5.5];
        for (const dx of dividers) {
            addBox(parent, t, h, OFFICE_WALL_Z + halfD, dx, y, (OFFICE_WALL_Z - halfD) / 2, MAT_WALL_INNER);
        }
        // conference / lounge front wall with three doorways
        const frontSegs = [
            [-halfW, -7.6], [-6.4, -1.5], [1.5, 6.4], [7.6, halfW]
        ];
        for (const seg of frontSegs) {
            const w = seg[1] - seg[0];
            if (w > 0.05) addBox(parent, w, h, t, (seg[0] + seg[1]) / 2, y, FRONT_WALL_Z, MAT_WALL_INNER);
        }
        // side walls of the front-middle vestibule
        addBox(parent, t, h, halfD - FRONT_WALL_Z, -3, y, (FRONT_WALL_Z + halfD) / 2, MAT_WALL_INNER);
        addBox(parent, t, h, halfD - FRONT_WALL_Z, 3, y, (FRONT_WALL_Z + halfD) / 2, MAT_WALL_INNER);
    } else {
        // lobby: cafe side wall + lounge side wall, both with doorways
        const frontSegs = [
            [-halfW, -6.9], [-5.7, -1.5], [1.5, 6.9], [8.1, halfW]
        ];
        for (const seg of frontSegs) {
            const w = seg[1] - seg[0];
            if (w > 0.05) addBox(parent, w, h, t, (seg[0] + seg[1]) / 2, y, FRONT_WALL_Z, MAT_WALL_INNER);
        }
    }
}

/* ------------------------------------------------------------------ */
/* per-floor layouts                                                   */
/* ------------------------------------------------------------------ */

function buildOfficeFloor(parent, floorNumber) {
    const floorY = floorNumber * WORLD.FLOOR_HEIGHT;
    const floorObj = {
        floorNumber: floorNumber,
        floorY: floorY,
        group: new THREE.Group(),
        nodes: {},
        graph: {},
        sitTargets: {},
        desks: [],
        confSeats: [],
        loungeSeats: [],
        standSpots: []
    };
    const g = floorObj.group;
    parent.add(g);

    buildFloorSlab(g, floorY);
    buildInteriorWalls(g, floorY, false);

    // ---- hallway ring ----
    addNode(floorObj, "hallSW", HALL.west, HALL.south, floorY);
    addNode(floorObj, "hallS", 0, HALL.south, floorY);
    addNode(floorObj, "hallSE", HALL.east, HALL.south, floorY);
    addNode(floorObj, "hallE", HALL.east, 0, floorY);
    addNode(floorObj, "hallNE", HALL.east, HALL.north, floorY);
    addNode(floorObj, "hallN", 0, HALL.north, floorY);
    addNode(floorObj, "hallNW", HALL.west, HALL.north, floorY);
    addNode(floorObj, "hallW", HALL.west, 0, floorY);
    addNode(floorObj, "elevWait", 0, 2.3, floorY);
    linkNodes(floorObj, "hallSW", "hallS");
    linkNodes(floorObj, "hallS", "hallSE");
    linkNodes(floorObj, "hallSE", "hallE");
    linkNodes(floorObj, "hallE", "hallNE");
    linkNodes(floorObj, "hallNE", "hallN");
    linkNodes(floorObj, "hallN", "hallNW");
    linkNodes(floorObj, "hallNW", "hallW");
    linkNodes(floorObj, "hallW", "hallSW");
    linkNodes(floorObj, "hallS", "elevWait");

    addNode(floorObj, "hall_stand_N", 6.5, HALL.north, floorY);
    addNode(floorObj, "hall_stand_S", -6.5, HALL.south, floorY);
    linkNodes(floorObj, "hall_stand_N", "hallNE");
    linkNodes(floorObj, "hall_stand_S", "hallSW");
    setSit(floorObj, "hall_stand_N", false, Math.PI);
    setSit(floorObj, "hall_stand_S", false, 0);
    floorObj.standSpots.push("hall_stand_N", "hall_stand_S");

    // ---- four private offices along the back wall ----
    for (let i = 0; i < OFFICE_X.length; i += 1) {
        const letter = OFFICE_LETTERS[i];
        const ox = OFFICE_X[i];
        const deskZ = -8.0;
        const chairZ = -7.2;
        const sitZ = chairZ - 0.15;
        buildDesk(g, ox, floorY, deskZ);
        buildChair(g, ox, floorY, chairZ, Math.PI, false);
        if (i % 2 === 0) {
            buildPlant(g, ox + 2.0, floorY, -4.9);
        }

        const doorName = `office${letter}_door`;
        const inName = `office${letter}_in`;
        const deskName = `office${letter}_desk`;
        addNode(floorObj, doorName, ox, HALL.north, floorY);
        addNode(floorObj, inName, ox, -5.0, floorY);
        addNode(floorObj, deskName, ox, sitZ, floorY);
        linkNodes(floorObj, doorName, inName);
        linkNodes(floorObj, inName, deskName);
        if (i === 0) linkNodes(floorObj, doorName, "hallNW");
        else if (i === 1) linkNodes(floorObj, doorName, "hallNW");
        else if (i === 2) linkNodes(floorObj, doorName, "hallN");
        else linkNodes(floorObj, doorName, "hallNE");
        setSit(floorObj, deskName, true, Math.PI, ox, deskZ);
        setSit(floorObj, inName, false, Math.PI);
        floorObj.desks.push({
            id: `${floorNumber}:${letter}`,
            floor: floorNumber,
            wpName: deskName,
            doorWpName: doorName,
            inWpName: inName
        });
    }

    // ---- conference room (front left) ----
    const confTableZ = 6.3;
    buildTable(g, -7, floorY, confTableZ, 4.0, 1.6, 0);
    addBox(g, 0.5, 0.05, 0.3, -7, floorY + 0.8, confTableZ, MAT_DARK);
    const confSeatData = [
        { name: "conf_seat0", x: -8.0, z: 5.1, facing: 0 },
        { name: "conf_seat1", x: -6.0, z: 5.1, facing: 0 },
        { name: "conf_seat2", x: -8.0, z: 7.5, facing: Math.PI },
        { name: "conf_seat3", x: -6.0, z: 7.5, facing: Math.PI }
    ];
    for (const seat of confSeatData) {
        buildChair(g, seat.x, floorY, seat.z, seat.facing, true);
        addNode(floorObj, seat.name, seat.x, seat.z, floorY);
        setSit(floorObj, seat.name, true, seat.facing, -7, confTableZ);
        floorObj.confSeats.push(seat.name);
    }
    addNode(floorObj, "conf_door", -7, 4.2, floorY);
    addNode(floorObj, "conf_nw", -10.2, 4.6, floorY);
    addNode(floorObj, "conf_ne", -3.8, 4.6, floorY);
    addNode(floorObj, "conf_sw", -10.2, 8.2, floorY);
    addNode(floorObj, "conf_se", -3.8, 8.2, floorY);
    addNode(floorObj, "conf_center", -7, 8.4, floorY);
    linkNodes(floorObj, "conf_door", "hallSW");
    linkNodes(floorObj, "conf_door", "conf_nw");
    linkNodes(floorObj, "conf_door", "conf_ne");
    linkNodes(floorObj, "conf_nw", "conf_sw");
    linkNodes(floorObj, "conf_ne", "conf_se");
    linkNodes(floorObj, "conf_sw", "conf_se");
    linkNodes(floorObj, "conf_sw", "conf_center");
    linkNodes(floorObj, "conf_se", "conf_center");
    linkNodes(floorObj, "conf_nw", "conf_seat0");
    linkNodes(floorObj, "conf_ne", "conf_seat1");
    linkNodes(floorObj, "conf_sw", "conf_seat2");
    linkNodes(floorObj, "conf_se", "conf_seat3");
    setSit(floorObj, "conf_center", false, Math.PI);
    setSit(floorObj, "conf_door", false, 0);

    // ---- lounge (front right) ----
    buildCouch(g, 10.4, floorY, 6.3, -Math.PI / 2, 2.2);
    buildTable(g, 8.9, floorY, 6.3, 1.2, 1.0, 0);
    const loungeSeatData = [
        { name: "lounge_spot0", x: 10.3, z: 5.6, facing: -Math.PI / 2 },
        { name: "lounge_spot1", x: 7.4, z: 4.6, facing: 0 },
        { name: "lounge_spot2", x: 7.4, z: 8.0, facing: Math.PI },
        { name: "lounge_spot3", x: 10.3, z: 7.0, facing: -Math.PI / 2 }
    ];
    buildChair(g, 7.4, floorY, 4.6, 0, true);
    buildChair(g, 7.4, floorY, 8.0, Math.PI, true);
    for (const seat of loungeSeatData) {
        addNode(floorObj, seat.name, seat.x, seat.z, floorY);
        setSit(floorObj, seat.name, true, seat.facing, 8.9, 6.3);
        floorObj.loungeSeats.push(seat.name);
    }
    buildWaterCooler(g, 4.6, floorY, 8.6);
    addNode(floorObj, "water_cooler", 4.9, 7.5, floorY);
    setSit(floorObj, "water_cooler", false, Math.PI);
    buildPlant(g, 4.4, floorY, 4.5);

    addNode(floorObj, "lounge_door", 7, 4.2, floorY);
    addNode(floorObj, "lounge_center", 5.6, 6.3, floorY);
    addNode(floorObj, "lounge_n", 9.4, 4.4, floorY);
    addNode(floorObj, "lounge_s", 9.4, 8.2, floorY);
    linkNodes(floorObj, "lounge_door", "hallSE");
    linkNodes(floorObj, "lounge_door", "lounge_center");
    linkNodes(floorObj, "lounge_center", "lounge_spot1");
    linkNodes(floorObj, "lounge_center", "lounge_spot2");
    linkNodes(floorObj, "lounge_center", "water_cooler");
    linkNodes(floorObj, "lounge_center", "lounge_n");
    linkNodes(floorObj, "lounge_center", "lounge_s");
    linkNodes(floorObj, "lounge_n", "lounge_spot0");
    linkNodes(floorObj, "lounge_n", "lounge_spot3");
    linkNodes(floorObj, "lounge_s", "lounge_spot0");
    linkNodes(floorObj, "lounge_s", "lounge_spot3");
    setSit(floorObj, "lounge_center", false, Math.PI / 2);
    setSit(floorObj, "lounge_door", false, 0);

    // ---- front middle vestibule ----
    addNode(floorObj, "vest", 0, 6.4, floorY);
    linkNodes(floorObj, "vest", "hallS");
    setSit(floorObj, "vest", false, Math.PI);
    buildPlant(g, -2.2, floorY, 8.4);

    // ---- call panel + shaft indicator ----
    floorObj.callPanel = buildCallPanel(g, 2.1, floorY + 1.35, 1.56);
    floorObj.shaftIndicator = buildShaftIndicator(g, 0, floorY + 2.85, 1.62);

    return floorObj;
}

function buildLobby(parent) {
    const floorNumber = 0;
    const floorY = 0;
    const floorObj = {
        floorNumber: 0,
        floorY: 0,
        group: new THREE.Group(),
        nodes: {},
        graph: {},
        sitTargets: {},
        desks: [],
        confSeats: [],
        loungeSeats: [],
        standSpots: [],
        cafeSeats: [],
        backLounge: [],
        pitSeats: [],
        quickSpots: []
    };
    const g = floorObj.group;
    parent.add(g);

    buildInteriorWalls(g, floorY, true);

    // ---- entrance chain: outside -> threshold -> entrance -> lobby center ----
    addNode(floorObj, "outside", 0, 12, 0);
    addNode(floorObj, "front_door_threshold", 0, 9.35, 0);
    addNode(floorObj, "entrance", 0, 7.4, 0);
    addNode(floorObj, "lobby_center", 0, 4.6, 0);
    linkNodes(floorObj, "outside", "front_door_threshold");
    linkNodes(floorObj, "front_door_threshold", "entrance");
    linkNodes(floorObj, "entrance", "lobby_center");
    setSit(floorObj, "outside", false, Math.PI);
    setSit(floorObj, "front_door_threshold", false, Math.PI);
    setSit(floorObj, "entrance", false, Math.PI);
    setSit(floorObj, "lobby_center", false, Math.PI);

    // ---- hallway ring ----
    addNode(floorObj, "hallSW", HALL.west, HALL.south, 0);
    addNode(floorObj, "hallS", 0, HALL.south, 0);
    addNode(floorObj, "hallSE", HALL.east, HALL.south, 0);
    addNode(floorObj, "hallE", HALL.east, 0, 0);
    addNode(floorObj, "hallNE", HALL.east, HALL.north, 0);
    addNode(floorObj, "hallN", 0, HALL.north, 0);
    addNode(floorObj, "hallNW", HALL.west, HALL.north, 0);
    addNode(floorObj, "hallW", HALL.west, 0, 0);
    addNode(floorObj, "elevWait", 0, 2.3, 0);
    linkNodes(floorObj, "hallSW", "hallS");
    linkNodes(floorObj, "hallS", "hallSE");
    linkNodes(floorObj, "hallSE", "hallE");
    linkNodes(floorObj, "hallE", "hallNE");
    linkNodes(floorObj, "hallNE", "hallN");
    linkNodes(floorObj, "hallN", "hallNW");
    linkNodes(floorObj, "hallNW", "hallW");
    linkNodes(floorObj, "hallW", "hallSW");
    linkNodes(floorObj, "hallS", "elevWait");
    linkNodes(floorObj, "lobby_center", "elevWait");
    linkNodes(floorObj, "lobby_center", "hallS");
    linkNodes(floorObj, "entrance", "hallS");

    // ---- cafe (front left) ----
    buildCounter(g, -10.3, 0, 6.4, 0.8, 4.4);
    buildCoffeeMachine(g, -10.3, 0, 5.2);
    buildPastryCase(g, -10.3, 0, 7.6);
    addNode(floorObj, "cafe_order", -9.2, 6.4, 0);
    setSit(floorObj, "cafe_order", false, -Math.PI / 2);
    floorObj.quickSpots.push("cafe_order");

    const bistroTables = [
        { x: -8.2, z: 5.0 },
        { x: -6.0, z: 5.0 },
        { x: -8.2, z: 7.8 },
        { x: -6.0, z: 7.8 }
    ];
    addNode(floorObj, "cafe_door", -6.3, 3.2, 0);
    addNode(floorObj, "cafe_aisle_s", -7.1, 4.4, 0);
    addNode(floorObj, "cafe_aisle_n", -7.1, 8.8, 0);
    linkNodes(floorObj, "cafe_door", "hallSW");
    linkNodes(floorObj, "cafe_door", "cafe_aisle_s");
    linkNodes(floorObj, "cafe_aisle_s", "cafe_aisle_n");
    linkNodes(floorObj, "cafe_aisle_s", "cafe_order");
    linkNodes(floorObj, "cafe_aisle_n", "cafe_order");
    setSit(floorObj, "cafe_door", false, 0);
    setSit(floorObj, "cafe_aisle_s", false, 0);
    setSit(floorObj, "cafe_aisle_n", false, Math.PI);

    for (let t = 0; t < bistroTables.length; t += 1) {
        const table = bistroTables[t];
        buildRoundTable(g, table.x, 0, table.z, 0.45);
        const southName = `bistro${t}_s`;
        const northName = `bistro${t}_n`;
        addNode(floorObj, southName, table.x, table.z - 1.0, 0);
        addNode(floorObj, northName, table.x, table.z + 1.0, 0);
        buildChair(g, table.x, 0, table.z - 1.0, 0, false);
        buildChair(g, table.x, 0, table.z + 1.0, Math.PI, false);
        setSit(floorObj, southName, true, 0, table.x, table.z);
        setSit(floorObj, northName, true, Math.PI, table.x, table.z);
        floorObj.cafeSeats.push(southName, northName);
        const aisle = table.z > 6 ? "cafe_aisle_n" : "cafe_aisle_s";
        linkNodes(floorObj, aisle, southName);
        linkNodes(floorObj, aisle, northName);
    }

    // ---- front lounge (front right) ----
    buildCouch(g, 10.4, 0, 6.3, -Math.PI / 2, 2.2);
    buildTable(g, 8.9, 0, 6.3, 1.2, 1.0, 0);
    const flSeats = [
        { name: "fl_spot0", x: 10.3, z: 5.6, facing: -Math.PI / 2 },
        { name: "fl_spot1", x: 7.4, z: 4.6, facing: 0 },
        { name: "fl_spot2", x: 7.4, z: 8.0, facing: Math.PI },
        { name: "fl_spot3", x: 10.3, z: 7.0, facing: -Math.PI / 2 }
    ];
    buildChair(g, 7.4, 0, 4.6, 0, true);
    buildChair(g, 7.4, 0, 8.0, Math.PI, true);
    for (const seat of flSeats) {
        addNode(floorObj, seat.name, seat.x, seat.z, 0);
        setSit(floorObj, seat.name, true, seat.facing, 8.9, 6.3);
        floorObj.loungeSeats.push(seat.name);
    }
    addNode(floorObj, "fl_door", 7.5, 4.2, 0);
    addNode(floorObj, "fl_center", 5.6, 6.3, 0);
    addNode(floorObj, "fl_n", 9.4, 4.4, 0);
    addNode(floorObj, "fl_s", 9.4, 8.2, 0);
    linkNodes(floorObj, "fl_door", "hallSE");
    linkNodes(floorObj, "fl_door", "fl_center");
    linkNodes(floorObj, "fl_center", "fl_spot1");
    linkNodes(floorObj, "fl_center", "fl_spot2");
    linkNodes(floorObj, "fl_center", "fl_n");
    linkNodes(floorObj, "fl_center", "fl_s");
    linkNodes(floorObj, "fl_n", "fl_spot0");
    linkNodes(floorObj, "fl_n", "fl_spot3");
    linkNodes(floorObj, "fl_s", "fl_spot0");
    linkNodes(floorObj, "fl_s", "fl_spot3");
    setSit(floorObj, "fl_center", false, Math.PI / 2);
    setSit(floorObj, "fl_door", false, 0);

    // ---- back lounge (two couches facing each other) ----
    buildCouch(g, 5.5, 0, -7.4, 0, 2.0);
    buildCouch(g, 5.5, 0, -4.7, Math.PI, 2.0);
    buildTable(g, 5.5, 0, -6.05, 1.2, 0.8, 0);
    addNode(floorObj, "back_lounge_N", 5.5, -7.2, 0);
    addNode(floorObj, "back_lounge_S", 5.5, -4.9, 0);
    setSit(floorObj, "back_lounge_N", true, 0, 5.5, -6.05);
    setSit(floorObj, "back_lounge_S", true, Math.PI, 5.5, -6.05);
    floorObj.backLounge.push("back_lounge_N", "back_lounge_S");

    // ---- conversation pit (back left) ----
    buildRoundTable(g, -7.5, 0, -6.2, 0.9);
    const pitSeats = [
        { name: "pit_N", x: -7.5, z: -7.5, facing: 0 },
        { name: "pit_S", x: -7.5, z: -4.9, facing: Math.PI },
        { name: "pit_E", x: -6.2, z: -6.2, facing: -Math.PI / 2 },
        { name: "pit_W", x: -8.8, z: -6.2, facing: Math.PI / 2 }
    ];
    for (const seat of pitSeats) {
        buildChair(g, seat.x, 0, seat.z, seat.facing, true);
        addNode(floorObj, seat.name, seat.x, seat.z, 0);
        setSit(floorObj, seat.name, true, seat.facing, -7.5, -6.2);
        floorObj.pitSeats.push(seat.name);
    }

    addNode(floorObj, "back_mid", 0, -5.0, 0);
    addNode(floorObj, "bl_aisle", 8.0, -6.0, 0);
    addNode(floorObj, "pit_aisle", -5.6, -6.2, 0);
    addNode(floorObj, "pit_aisle2", -7.5, -8.8, 0);
    linkNodes(floorObj, "hallN", "back_mid");
    linkNodes(floorObj, "hallW", "back_mid");
    linkNodes(floorObj, "hallE", "back_mid");
    linkNodes(floorObj, "back_mid", "bl_aisle");
    linkNodes(floorObj, "back_mid", "pit_aisle");
    linkNodes(floorObj, "bl_aisle", "back_lounge_N");
    linkNodes(floorObj, "bl_aisle", "back_lounge_S");
    linkNodes(floorObj, "pit_aisle", "pit_N");
    linkNodes(floorObj, "pit_aisle", "pit_S");
    linkNodes(floorObj, "pit_aisle", "pit_E");
    linkNodes(floorObj, "pit_aisle", "pit_aisle2");
    linkNodes(floorObj, "pit_aisle2", "pit_N");
    linkNodes(floorObj, "pit_aisle2", "pit_W");
    setSit(floorObj, "back_mid", false, 0);
    setSit(floorObj, "bl_aisle", false, Math.PI);
    setSit(floorObj, "pit_aisle", false, -Math.PI / 2);

    // ---- water coolers ----
    buildWaterCooler(g, 4.6, 0, 4.3);
    addNode(floorObj, "lobby_wc_front", 5.3, 5.0, 0);
    setSit(floorObj, "lobby_wc_front", false, faceTo(5.3, 5.0, 4.6, 4.3));
    floorObj.quickSpots.push("lobby_wc_front");
    linkNodes(floorObj, "lobby_wc_front", "fl_center");

    buildWaterCooler(g, -1.6, 0, -8.8);
    addNode(floorObj, "lobby_wc_back", -1.6, -7.8, 0);
    setSit(floorObj, "lobby_wc_back", false, Math.PI);
    floorObj.quickSpots.push("lobby_wc_back");
    linkNodes(floorObj, "lobby_wc_back", "back_mid");

    // ---- reception + kiosk ----
    buildReceptionDesk(g, -4.4, 0, 5.4, 0);
    addNode(floorObj, "reception", -4.4, 4.3, 0);
    setSit(floorObj, "reception", false, 0);
    floorObj.quickSpots.push("reception");
    linkNodes(floorObj, "reception", "lobby_center");

    buildKiosk(g, 2.5, 0, 7.6, -Math.PI / 2);
    addNode(floorObj, "kiosk", 1.7, 7.6, 0);
    setSit(floorObj, "kiosk", false, Math.PI / 2);
    floorObj.quickSpots.push("kiosk");
    linkNodes(floorObj, "kiosk", "entrance");

    // ---- generic loiter waypoints ----
    const loiter = [
        { name: "lobby_stand_center", x: -1.4, z: 6.2, facing: Math.PI / 2, link: "lobby_center" },
        { name: "lobby_stand_NE", x: 2.6, z: 5.6, facing: -Math.PI / 2, link: "hallSE" },
        { name: "lobby_stand_NW", x: -2.8, z: 0.6, facing: Math.PI / 2, link: "hallW" },
        { name: "lobby_stand_midE", x: 6.0, z: -1.0, facing: -Math.PI / 2, link: "hallE" },
        { name: "lobby_stand_midW", x: -6.0, z: -1.0, facing: Math.PI / 2, link: "hallW" },
        { name: "lobby_stand_entry", x: -2.2, z: 8.2, facing: Math.PI / 2, link: "entrance" }
    ];
    for (const spot of loiter) {
        addNode(floorObj, spot.name, spot.x, spot.z, 0);
        setSit(floorObj, spot.name, false, spot.facing);
        linkNodes(floorObj, spot.name, spot.link);
        floorObj.standSpots.push(spot.name);
    }

    buildPlant(g, -10.2, 0, 3.0);
    buildPlant(g, 10.2, 0, 3.0);

    floorObj.callPanel = buildCallPanel(g, 2.1, 1.35, 1.56);
    floorObj.shaftIndicator = buildShaftIndicator(g, 0, 2.85, 1.62);

    return floorObj;
}

/* ------------------------------------------------------------------ */
/* public factory                                                      */
/* ------------------------------------------------------------------ */

function createWorld(scene) {
    const buildingGroup = new THREE.Group();
    buildingGroup.renderOrder = 0;
    scene.add(buildingGroup);

    buildShell(buildingGroup);

    const floors = [];
    for (let i = 0; i < WORLD.FLOOR_COUNT; i += 1) {
        const floorObj = i === 0 ? buildLobby(buildingGroup) : buildOfficeFloor(buildingGroup, i);
        floors.push(floorObj);
        GRAPH_BY_NODES.set(floorObj.nodes, floorObj.graph);
    }

    // pedestrians must never be blocked by transparency sorting
    buildingGroup.traverse((child) => {
        child.renderOrder = 0;
    });

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
