/**
 * world.js - building geometry, per-floor layouts, furniture, navigation
 * graph and call panels. All coordinates in world space; floor N walkable
 * plane is at y = N * WORLD.FLOOR_HEIGHT. +Z is the front (entrance) side.
 */

const WORLD = {
    FLOOR_HEIGHT: 3.4,
    FLOOR_COUNT: 6,
    BUILDING_WIDTH: 22,
    BUILDING_DEPTH: 18,
    SHAFT_WIDTH: 3,
    SHAFT_DEPTH: 3,
    PERSON_R: 0.4
};

// ---------- shared material helpers (module scope) ----------

function makeTransparentMaterial(colorHex, opacity) {
    return new THREE.MeshLambertMaterial({
        color: colorHex,
        transparent: true,
        opacity: opacity,
        depthWrite: false,
        side: THREE.DoubleSide
    });
}

function boxMesh(width, height, depth, material, x, y, z) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    mesh.position.set(x, y, z);
    mesh.renderOrder = 0;
    return mesh;
}

function makeTextTexture(text) {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = 4;
    tex._lastText = null;
    updateTextTexture(tex, text === undefined ? "" : text);
    return tex;
}

function updateTextTexture(tex, text) {
    if (tex._lastText === text) return; // avoid re-uploading the canvas every frame
    const canvas = tex.image;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, 256, 256);
    ctx.fillStyle = "#050505";
    ctx.fillRect(0, 0, 256, 256);
    ctx.font = "bold 150px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "#ffbb22";
    ctx.shadowBlur = 34;
    ctx.fillStyle = "#ffbb22";
    ctx.fillText(String(text), 128, 136);
    tex._lastText = text;
    tex.needsUpdate = true;
}

// A chunky call panel: plate + up/down arrow lamps + canvas floor display.
function makeCallPanel() {
    const group = new THREE.Group();
    const plateMat = makeTransparentMaterial(0x2a2f3a, 0.85);
    const plate = boxMesh(0.55, 1.4, 0.05, plateMat, 0, 0, 0);
    group.add(plate);

    function makeArrow(upDirection) {
        const shape = new THREE.Shape();
        if (upDirection) {
            shape.moveTo(-0.13, -0.14);
            shape.lineTo(0.13, -0.14);
            shape.lineTo(0, 0.16);
        } else {
            shape.moveTo(-0.13, 0.14);
            shape.lineTo(0.13, 0.14);
            shape.lineTo(0, -0.16);
        }
        shape.closePath();
        const mesh = new THREE.Mesh(
            new THREE.ShapeGeometry(shape),
            new THREE.MeshBasicMaterial({ color: 0x2f3540, side: THREE.DoubleSide })
        );
        return mesh;
    }

    const upArrow = makeArrow(true);
    upArrow.position.set(0, 0.36, 0.031);
    group.add(upArrow);
    const downArrow = makeArrow(false);
    downArrow.position.set(0, -0.18, 0.031);
    group.add(downArrow);

    const displayTex = makeTextTexture("-");
    const displayMat = new THREE.MeshBasicMaterial({ map: displayTex, transparent: false });
    const display = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.45), displayMat);
    display.position.set(0, -0.62, 0.031);
    group.add(display);

    const offColor = 0x2f3540;
    const onColor = 0x39ff7a;

    group.userData.setUp = function (on) {
        upArrow.material.color.setHex(on ? onColor : offColor);
    };
    group.userData.setDown = function (on) {
        downArrow.material.color.setHex(on ? onColor : offColor);
    };
    group.userData.setIndicator = function (text) {
        updateTextTexture(displayTex, text);
    };
    return group;
}

// Shaft-side indicator above the doors (bigger plane).
function makeShaftIndicator() {
    const group = new THREE.Group();
    const frameMat = makeTransparentMaterial(0x2a2f3a, 0.9);
    const frame = boxMesh(1.05, 1.05, 0.06, frameMat, 0, 0, 0);
    group.add(frame);
    const tex = makeTextTexture("-");
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: tex }));
    plane.position.set(0, 0, 0.035);
    group.add(plane);
    group.userData.setText = function (text) {
        updateTextTexture(tex, text);
    };
    return group;
}

// ---------- furniture builders (floor-local: origin at floor level) ----------

function makeDesk(x, z) {
    const g = new THREE.Group();
    const topMat = new THREE.MeshLambertMaterial({ color: 0x8a6b4f });
    const legMat = new THREE.MeshLambertMaterial({ color: 0x5c5c5c });
    const top = boxMesh(1.7, 0.08, 0.8, topMat, 0, 0.72, 0);
    g.add(top);
    const deskLegs = [[-0.78, -0.34], [0.78, -0.34], [-0.78, 0.34], [0.78, 0.34]];
    for (let i = 0; i < deskLegs.length; i += 1) {
        const leg = boxMesh(0.07, 0.72, 0.07, legMat, deskLegs[i][0], 0.36, deskLegs[i][1]);
        g.add(leg);
    }
    // monitor at the back of the desk (-Z edge)
    const screen = boxMesh(0.72, 0.46, 0.06, new THREE.MeshLambertMaterial({ color: 0x1c2230 }), 0, 1.05, -0.3);
    g.add(screen);
    const stand = boxMesh(0.1, 0.14, 0.1, legMat, 0, 0.82, -0.3);
    g.add(stand);
    g.position.set(x, 0, z);
    return g;
}

function makeChair(x, z, facing) {
    const g = new THREE.Group();
    const seatMat = new THREE.MeshLambertMaterial({ color: 0x46536b });
    const seat = boxMesh(0.52, 0.1, 0.5, seatMat, 0, 0.45, 0);
    g.add(seat);
    const back = boxMesh(0.52, 0.55, 0.08, seatMat, 0, 0.72, -0.23);
    g.add(back);
    const leg = boxMesh(0.09, 0.42, 0.09, new THREE.MeshLambertMaterial({ color: 0x333844 }), 0, 0.21, 0);
    g.add(leg);
    g.position.set(x, 0, z);
    if (typeof facing === "number") g.rotation.y = facing;
    return g;
}

function makeSofa(x, z, facing, length) {
    const g = new THREE.Group();
    const len = length || 2.4;
    const mat = new THREE.MeshLambertMaterial({ color: 0x5d6b8a });
    const base = boxMesh(len, 0.4, 0.95, mat, 0, 0.28, 0);
    g.add(base);
    const back = boxMesh(len, 0.5, 0.18, mat, 0, 0.68, -0.38);
    g.add(back);
    const armL = boxMesh(0.2, 0.5, 0.95, mat, -len / 2 + 0.1, 0.5, 0);
    g.add(armL);
    const armR = boxMesh(0.2, 0.5, 0.95, mat, len / 2 - 0.1, 0.5, 0);
    g.add(armR);
    g.position.set(x, 0, z);
    if (typeof facing === "number") g.rotation.y = facing;
    return g;
}

function makeArmchair(x, z, facing) {
    const g = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: 0x8a5d6b });
    const base = boxMesh(0.8, 0.42, 0.78, mat, 0, 0.3, 0);
    g.add(base);
    const back = boxMesh(0.8, 0.55, 0.16, mat, 0, 0.62, -0.3);
    g.add(back);
    g.position.set(x, 0, z);
    if (typeof facing === "number") g.rotation.y = facing;
    return g;
}

function makeCoffeeTable(x, z) {
    const g = new THREE.Group();
    const top = boxMesh(1.5, 0.08, 0.8, new THREE.MeshLambertMaterial({ color: 0x7a5c42 }), 0, 0.42, 0);
    g.add(top);
    const tableLegs = [[-0.65, -0.3], [0.65, -0.3], [-0.65, 0.3], [0.65, 0.3]];
    for (let i = 0; i < tableLegs.length; i += 1) {
        g.add(boxMesh(0.07, 0.42, 0.07, new THREE.MeshLambertMaterial({ color: 0x4a4a4a }), tableLegs[i][0], 0.21, tableLegs[i][1]));
    }
    g.position.set(x, 0, z);
    return g;
}

function makeWaterCooler(x, z) {
    const g = new THREE.Group();
    const body = boxMesh(0.34, 1.05, 0.34, new THREE.MeshLambertMaterial({ color: 0xdfe6ee }), 0, 0.52, 0);
    g.add(body);
    const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.4, 10), makeTransparentMaterial(0x7fc4e8, 0.6));
    bottle.position.set(0, 1.25, 0);
    g.add(bottle);
    g.position.set(x, 0, z);
    return g;
}

function makePlant(x, z) {
    const g = new THREE.Group();
    const pot = boxMesh(0.4, 0.35, 0.4, new THREE.MeshLambertMaterial({ color: 0x7a4b2e }), 0, 0.17, 0);
    g.add(pot);
    const leaves = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 8), new THREE.MeshLambertMaterial({ color: 0x3f7d44 }));
    leaves.position.set(0, 0.72, 0);
    g.add(leaves);
    g.position.set(x, 0, z);
    return g;
}

function makeConferenceTable(x, z) {
    const g = new THREE.Group();
    const top = boxMesh(3.4, 0.1, 1.3, new THREE.MeshLambertMaterial({ color: 0x6e5238 }), 0, 0.74, 0);
    g.add(top);
    const confLegs = [[-1.4, -0.45], [1.4, -0.45], [-1.4, 0.45], [1.4, 0.45]];
    for (let i = 0; i < confLegs.length; i += 1) {
        g.add(boxMesh(0.1, 0.74, 0.1, new THREE.MeshLambertMaterial({ color: 0x4a4a4a }), confLegs[i][0], 0.37, confLegs[i][1]));
    }
    g.position.set(x, 0, z);
    return g;
}

function makeCafeCounter(x, z) {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0xb8b2a6 });
    const counter = boxMesh(4.6, 1.0, 0.9, bodyMat, 0, 0.5, 0);
    g.add(counter);
    const top = boxMesh(4.8, 0.09, 1.0, new THREE.MeshLambertMaterial({ color: 0x6d5843 }), 0, 1.05, 0);
    g.add(top);
    // coffee machine
    const machine = boxMesh(0.62, 0.5, 0.45, new THREE.MeshLambertMaterial({ color: 0x2f3340 }), -1.3, 1.34, 0);
    g.add(machine);
    // pastry display (glass box)
    const display = boxMesh(1.5, 0.62, 0.8, makeTransparentMaterial(0xcfe0f0, 0.35), 0.9, 1.4, 0);
    g.add(display);
    g.position.set(x, 0, z);
    return g;
}

function makeBistroTable(x, z) {
    const g = new THREE.Group();
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.06, 12), new THREE.MeshLambertMaterial({ color: 0x9c8262 }));
    top.position.set(0, 0.72, 0);
    g.add(top);
    const pole = boxMesh(0.08, 0.72, 0.08, new THREE.MeshLambertMaterial({ color: 0x555b66 }), 0, 0.36, 0);
    g.add(pole);
    g.position.set(x, 0, z);
    return g;
}

function makeReceptionDesk(x, z) {
    const g = new THREE.Group();
    const body = boxMesh(2.2, 1.1, 0.7, new THREE.MeshLambertMaterial({ color: 0x8d97ab }), 0, 0.55, 0);
    g.add(body);
    const top = boxMesh(2.4, 0.07, 0.85, new THREE.MeshLambertMaterial({ color: 0x5c6478 }), 0, 1.13, 0);
    g.add(top);
    g.position.set(x, 0, z);
    return g;
}

function makeKiosk(x, z) {
    const g = new THREE.Group();
    const body = boxMesh(0.5, 1.25, 0.4, new THREE.MeshLambertMaterial({ color: 0x37404f }), 0, 0.62, 0);
    g.add(body);
    const screen = boxMesh(0.4, 0.5, 0.05, new THREE.MeshLambertMaterial({ color: 0x9fd8ff }), 0, 1.05, 0.12);
    screen.rotation.x = -0.35;
    g.add(screen);
    g.position.set(x, 0, z);
    return g;
}

// ---------- navigation helpers ----------

function bfsPath(nodes, fromName, toName) {
    if (!nodes || !nodes[fromName] || !nodes[toName]) return [];
    if (fromName === toName) return [nodes[toName].pos.clone()];
    const neighbors = {};
    for (const key in nodes) {
        neighbors[key] = nodes[key].links || [];
    }
    const prev = {};
    prev[fromName] = null;
    const queue = [fromName];
    let head = 0;
    while (head < queue.length) {
        const current = queue[head];
        head += 1;
        if (current === toName) break;
        for (const link of neighbors[current]) {
            if (!(link in prev)) {
                prev[link] = current;
                queue.push(link);
            }
        }
    }
    if (!(toName in prev)) return [];
    const path = [];
    let cursor = toName;
    while (cursor !== null) {
        path.unshift(nodes[cursor].pos.clone());
        cursor = prev[cursor];
    }
    return path;
}

// ---------- hallway ring (shared by every floor, floor-local y=0) ----------

function makeHallNodes(floorY) {
    function node(name, x, z, links) {
        return { name: name, pos: new THREE.Vector3(x, floorY, z), links: links || [] };
    }
    const r = 3.9;
    const diag = 2.75;
    const nodes = {};
    nodes.hallS = node("hallS", 0, r, ["hallSE", "hallSW", "elevWait"]);
    nodes.hallSE = node("hallSE", diag, diag, ["hallS", "hallE"]);
    nodes.hallE = node("hallE", r, 0, ["hallSE", "hallNE"]);
    nodes.hallNE = node("hallNE", diag, -diag, ["hallE", "hallN"]);
    nodes.hallN = node("hallN", 0, -r, ["hallNE", "hallNW"]);
    nodes.hallNW = node("hallNW", -diag, -diag, ["hallN", "hallW"]);
    nodes.hallW = node("hallW", -r, 0, ["hallNW", "hallSW"]);
    nodes.hallSW = node("hallSW", -diag, diag, ["hallW", "hallS"]);
    nodes.elevWait = node("elevWait", 0, 2.75, ["hallS"]);
    return nodes;
}

// ---------- office floor (floors 1..5) ----------

const OFFICE_CENTERS = [-8.25, -2.75, 2.75, 8.25];
const OFFICE_LETTERS = ["A", "B", "C", "D"];

function buildOfficeFloor(floorNumber, buildingGroup) {
    const floorY = floorNumber * WORLD.FLOOR_HEIGHT;
    const g = new THREE.Group();
    g.position.set(0, floorY, 0);
    buildingGroup.add(g);

    const wallMat = makeTransparentMaterial(0xbbc5e6, 0.28);
    const solidMat = new THREE.MeshLambertMaterial({ color: 0x9aa4b8 });

    // ----- interior walls of the four private offices (z from -8.6 to -3.0)
    for (let i = 0; i < 4; i += 1) {
        const cx = OFFICE_CENTERS[i];
        const xL = cx - 2.75;
        const xR = cx + 2.75;
        // front wall of the office with a 1.4-wide doorway at center
        const segW = 2.75 - 0.7;
        g.add(boxMesh(segW, 2.8, 0.12, wallMat, cx - 0.7 - segW / 2, 1.4, -3.0));
        g.add(boxMesh(segW, 2.8, 0.12, wallMat, cx + 0.7 + segW / 2, 1.4, -3.0));
        // divider walls between offices (skip left edge of A / right edge of D)
        if (i > 0) {
            g.add(boxMesh(0.12, 2.8, 5.6, wallMat, xL, 1.4, -5.8));
        }
    }

    // ----- desks + chairs
    const sitTargets = {};
    OFFICE_CENTERS.forEach(function (cx, i) {
        const letter = OFFICE_LETTERS[i];
        g.add(makeDesk(cx, -6.3));
        g.add(makeChair(cx, -5.15, Math.PI)); // seat opens toward +Z, person faces the monitor (-Z)
        sitTargets["office" + letter + "_desk"] = { sit: true, facing: Math.PI };
    });

    // ----- conference room (front-left): long table + 4 chairs
    g.add(makeConferenceTable(-7.0, 6.0));
    // two per long side; south row (z=4.95) faces +Z toward the table,
    // north row (z=7.05) faces -Z toward the table
    for (let i = 0; i < 2; i += 1) {
        const cx = -8.3 + i * 2.6; // -8.3 and -5.7
        g.add(makeChair(cx, 4.95, 0));
        g.add(makeChair(cx, 7.05, Math.PI));
    }
    for (let i = 0; i < 4; i += 1) {
        sitTargets["conf_seat" + i] = { sit: true, facing: (i % 2 === 0) ? 0 : Math.PI };
    }

    // ----- lounge (front-right): couch + table + 2 armchairs + water cooler
    g.add(makeSofa(8.6, 4.9, 0, 3.0));           // faces +Z (into the room)
    g.add(makeCoffeeTable(7.4, 6.6));
    g.add(makeArmchair(6.35, 5.2, -Math.PI / 2)); // west of table: faces +X toward it
    g.add(makeArmchair(8.4, 6.9, Math.PI / 2));   // east of table: faces -X toward it
    g.add(makeWaterCooler(10.3, 8.3));
    sitTargets.lounge_spot0 = { sit: true, facing: 0 };       // couch seat (faces +Z)
    sitTargets.lounge_spot1 = { sit: false, facing: -Math.PI / 2 };
    sitTargets.lounge_spot2 = { sit: false, facing: Math.PI / 2 };

    // hallway loiter spots
    sitTargets.hall_stand_N = { sit: false, facing: Math.PI };
    sitTargets.hall_stand_S = { sit: false, facing: 0 };

    // ----- call panel on the west wall next to the shaft, facing +X would be wrong;
    // spec wants it facing +Z, so place it just south of the hallS walk line.
    const callPanel = makeCallPanel();
    callPanel.position.set(-2.35, floorY + 1.6, 3.3);
    buildingGroup.add(callPanel);

    const shaftIndicator = makeShaftIndicator();
    shaftIndicator.position.set(0, floorY + 2.85, 1.62);
    buildingGroup.add(shaftIndicator);

    // ----- navigation nodes (floor-local y already baked into pos via floorY)
    function addNode(nodes, name, x, z, links) {
        nodes[name] = { name: name, pos: new THREE.Vector3(x, floorY, z), links: links || [] };
    }
    const nodes = makeHallNodes(floorY);

    OFFICE_CENTERS.forEach(function (cx, i) {
        const letter = OFFICE_LETTERS[i];
        addNode(nodes, "office" + letter + "_door", cx, -3.55, ["hallN"]);
        addNode(nodes, "office" + letter + "_desk", cx, -5.15, ["office" + letter + "_door"]);
    });

    addNode(nodes, "conf_door", -7.0, 3.45, ["hallSW", "conf_center"]);
    addNode(nodes, "conf_center", -7.0, 5.85, ["conf_door", "conf_seat0", "conf_seat1", "conf_seat2", "conf_seat3"]);
    for (let i = 0; i < 4; i += 1) {
        const seatX = -8.3 + Math.floor(i / 2) * 2.6;
        const seatZ = (i % 2 === 0) ? 5.35 : 6.65; // stand-in spot just in front of the chair
        addNode(nodes, "conf_seat" + i, seatX, seatZ, ["conf_center"]);
    }

    addNode(nodes, "lounge_door", 7.4, 3.45, ["hallSE", "lounge_center"]);
    addNode(nodes, "lounge_center", 7.6, 5.4, ["lounge_door", "lounge_spot0", "lounge_spot1", "lounge_spot2"]);
    addNode(nodes, "lounge_spot0", 8.6, 5.0, ["lounge_center"]);   // on the couch seat
    addNode(nodes, "lounge_spot1", 6.35, 5.2, ["lounge_center"]);  // west armchair
    addNode(nodes, "lounge_spot2", 8.4, 6.9, ["lounge_center"]);   // east armchair
    addNode(nodes, "water_cooler", 9.5, 7.6, ["lounge_center"]);

    addNode(nodes, "hall_stand_N", -1.4, -4.3, ["hallN", "hallNW"]);
    addNode(nodes, "hall_stand_S", 1.4, 4.3, ["hallS", "hallSE"]);

    return { floorNumber: floorNumber, nodes: nodes, callPanel: callPanel, shaftIndicator: shaftIndicator, sitTargets: sitTargets };
}

// ---------- lobby (floor 0) ----------

function buildLobby(floorNumber, buildingGroup) {
    const floorY = 0;
    const g = new THREE.Group();
    g.position.set(0, floorY, 0);
    buildingGroup.add(g);

    const wallMat = makeTransparentMaterial(0xbbc5e6, 0.28);

    // ----- cafe counter along the left (west) wall
    g.add(makeCafeCounter(-9.1, 1.6));
    // bistro tables with two chairs each
    const bistroSpots = [
        { x: -7.6, z: 4.2 }, { x: -5.4, z: 3.0 }, { x: -8.9, z: 5.4 }
    ];
    bistroSpots.forEach(function (spot) {
        g.add(makeBistroTable(spot.x, spot.z));
        g.add(makeChair(spot.x + 0.62, spot.z, -Math.PI / 2)); // east chair faces -X, toward the table
        g.add(makeChair(spot.x - 0.62, spot.z, Math.PI / 2));  // west chair faces +X, toward the table
    });

    // ----- front lounge (right of entrance): couch + armchairs + table
    g.add(makeSofa(7.8, 4.6, 0, 3.0));            // faces +Z into the room
    g.add(makeArmchair(5.2, 3.9, -Math.PI / 2));  // west of the coffee table: faces +X toward it
    g.add(makeArmchair(10.2, 4.2, Math.PI / 2));  // east of the coffee table: faces -X toward it
    g.add(makeCoffeeTable(7.2, 6.4));

    // ----- back lounge: two couches facing each other across a table
    g.add(makeSofa(-1.8, -5.2, Math.PI, 3.0));   // north couch faces -Z (toward the table)
    g.add(makeSofa(-1.8, -7.9, 0, 3.0));         // south couch faces +Z (toward the table)
    g.add(makeCoffeeTable(-1.8, -6.55));

    // ----- conversation pit (back-left): round table + 4 armchairs
    const pitX = -8.6;
    const pitZ = -6.2;
    const pitTableTop = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.07, 12), new THREE.MeshLambertMaterial({ color: 0x9c8262 }));
    pitTableTop.position.set(pitX, 0.5, pitZ);
    g.add(pitTableTop);
    const pitPole = boxMesh(0.09, 0.5, 0.09, new THREE.MeshLambertMaterial({ color: 0x555b66 }), pitX, 0.25, pitZ);
    g.add(pitPole);
    g.add(makeArmchair(pitX, pitZ - 1.35, 0));          // pit_N: north of table, faces +Z toward it
    g.add(makeArmchair(pitX, pitZ + 1.35, Math.PI));    // pit_S: south of table, faces -Z toward it
    g.add(makeArmchair(pitX - 1.35, pitZ, -Math.PI / 2)); // pit_W: west, faces +X toward it
    g.add(makeArmchair(pitX + 1.35, pitZ, Math.PI / 2));  // pit_E: east, faces -X toward it

    // ----- water coolers (front near lobby right wall, back behind the hall)
    g.add(makeWaterCooler(10.4, 2.6));
    g.add(makeWaterCooler(-3.4, -7.9));

    // ----- reception desk tucked to the left so entrance->elevator stays clear
    g.add(makeReceptionDesk(-3.2, 6.0));

    // ----- info kiosk near the entrance
    g.add(makeKiosk(2.8, 7.4));

    // ----- plants by the entrance
    g.add(makePlant(-2.6, 8.1));
    g.add(makePlant(3.4, 8.2));

    // glass entrance doors (visual only - agents pass through the real gap)
    const doorGlassMat = makeTransparentMaterial(0xbfe3ff, 0.14);
    const leftDoorPane = boxMesh(1.62, 3.1, 0.05, doorGlassMat, -0.86, 1.55, 9.0);
    const rightDoorPane = boxMesh(1.62, 3.1, 0.05, doorGlassMat, 0.86, 1.55, 9.0);
    g.add(leftDoorPane);
    g.add(rightDoorPane);

    // ----- call panel + shaft indicator (lobby versions)
    const callPanel = makeCallPanel();
    callPanel.position.set(-2.35, floorY + 1.6, 3.3);
    buildingGroup.add(callPanel);

    const shaftIndicator = makeShaftIndicator();
    shaftIndicator.position.set(0, floorY + 2.85, 1.62);
    buildingGroup.add(shaftIndicator);

    // ----- navigation nodes
    function addNode(nodes, name, x, z, links) {
        nodes[name] = { name: name, pos: new THREE.Vector3(x, floorY, z), links: links || [] };
    }
    const nodes = makeHallNodes(floorY);

    // entrance chain (spec-mandated): outside -> threshold -> entrance -> lobby_center
    addNode(nodes, "outside", 0, 12.0, ["front_door_threshold"]);
    addNode(nodes, "front_door_threshold", 0, 9.35, ["outside", "entrance"]);
    addNode(nodes, "entrance", 0, 7.4, ["front_door_threshold", "lobby_center"]);
    addNode(nodes, "lobby_center", 0, 5.2, ["entrance", "elevWait"]);
    // keep the hall ring connected to the lobby center too
    nodes.hallS.links.push("lobby_center");

    // cafe
    addNode(nodes, "cafe_door", -7.2, 1.4, ["hallSW", "cafe_order"]);
    addNode(nodes, "cafe_order", -8.0, 2.5, ["cafe_door"]);
    const bistroWpNames = ["cafe_bistro0", "cafe_bistro1", "cafe_bistro2"];
    bistroSpots.forEach(function (spot, i) {
        // sit spot sits on the east chair of each table (chair faces -X toward the table)
        addNode(nodes, bistroWpNames[i], spot.x + 0.62, spot.z, [bistroWpNames[i] === "cafe_bistro0" ? "cafe_order" : "cafe_door"]);
    });

    // front lounge (lobby)
    addNode(nodes, "lounge_door", 7.6, 3.3, ["hallSE", "lounge_center"]);
    addNode(nodes, "lounge_center", 7.8, 4.9, ["lounge_door", "lounge_spot0", "lounge_spot1", "lounge_spot2"]);
    addNode(nodes, "lounge_spot0", 7.8, 4.75, ["lounge_center"]);    // on the couch seat
    addNode(nodes, "lounge_spot1", 5.2, 3.9, ["lounge_center"]);     // west armchair
    addNode(nodes, "lounge_spot2", 10.2, 4.2, ["lounge_center"]);    // east armchair

    // back lounge (seats of the two facing couches)
    addNode(nodes, "back_lounge_N", -1.8, -5.35, ["hallS", "hallNE", "hallSE"]);
    addNode(nodes, "back_lounge_S", -1.8, -7.75, ["back_lounge_N"]);

    // conversation pit (stand-in spots in front of each armchair)
    addNode(nodes, "pit_center", pitX, pitZ + 0.9, ["hallW", "hallSW"]);
    addNode(nodes, "pit_N", pitX, pitZ - 0.75, ["pit_center"]);
    addNode(nodes, "pit_S", pitX, pitZ + 1.05, ["pit_center"]);
    addNode(nodes, "pit_E", pitX + 0.8, pitZ, ["pit_center"]);
    addNode(nodes, "pit_W", pitX - 0.8, pitZ, ["pit_center"]);

    // stand waypoints
    addNode(nodes, "lobby_wc_front", 9.6, 2.4, ["hallE", "hallSE"]);
    addNode(nodes, "lobby_wc_back", -2.6, -7.5, ["hallN", "hallNW"]);
    addNode(nodes, "reception", -3.2, 4.9, ["hallW", "entrance"]);
    addNode(nodes, "kiosk", 2.8, 6.5, ["entrance", "lobby_center"]);

    // generic loiter spots
    addNode(nodes, "lobby_stand_center", -0.4, 1.6, ["lobby_center", "hallS"]);
    addNode(nodes, "lobby_stand_NE", 3.2, 6.9, ["lobby_center"]);
    addNode(nodes, "lobby_stand_NW", -4.8, 7.2, ["entrance"]);
    addNode(nodes, "lobby_stand_midE", 5.6, 1.0, ["hallE"]);
    addNode(nodes, "lobby_stand_midW", -5.9, 0.6, ["hallW"]);
    addNode(nodes, "lobby_stand_entry", -1.4, 8.2, ["entrance"]);

    const sitTargets = {};
    // bistro chairs: person faces the table (toward their seat's table)
    sitTargets.cafe_bistro0 = { sit: true, facing: -Math.PI / 2 };
    sitTargets.cafe_bistro1 = { sit: true, facing: -Math.PI / 2 };
    sitTargets.cafe_bistro2 = { sit: true, facing: -Math.PI / 2 };
    // front lounge couch + armchairs
    sitTargets.lounge_spot0 = { sit: true, facing: 0 };        // couch faces +Z
    sitTargets.lounge_spot1 = { sit: false, facing: -Math.PI / 2 };
    sitTargets.lounge_spot2 = { sit: false, facing: Math.PI / 2 };
    // back lounge couches face each other across the table
    sitTargets.back_lounge_N = { sit: true, facing: Math.PI }; // north couch faces -Z
    sitTargets.back_lounge_S = { sit: true, facing: 0 };       // south couch faces +Z
    // pit armchairs face the round table center
    sitTargets.pit_N = { sit: false, facing: 0 };
    sitTargets.pit_S = { sit: false, facing: Math.PI };
    sitTargets.pit_E = { sit: false, facing: -Math.PI / 2 };
    sitTargets.pit_W = { sit: false, facing: Math.PI / 2 };
    // standing waypoints: no sit animation (jitter handled by sim)
    sitTargets.cafe_order = { sit: false, facing: Math.PI / 2 };
    sitTargets.lobby_wc_front = { sit: false, facing: -Math.PI / 2 };
    sitTargets.lobby_wc_back = { sit: false, facing: Math.PI / 2 };
    sitTargets.reception = { sit: false, facing: 0 };
    sitTargets.kiosk = { sit: false, facing: 0 };

    return {
        floorNumber: floorNumber,
        nodes: nodes,
        callPanel: callPanel,
        shaftIndicator: shaftIndicator,
        sitTargets: sitTargets,
        entranceSpot: new THREE.Vector3(0, 0, 7.4),
        cafeSpots: bistroWpNames.slice()
    };
}

// ---------- world assembly ----------

function createWorld(scene) {
    const buildingGroup = new THREE.Group();
    scene.add(buildingGroup);

    const W = WORLD;
    const totalH = W.FLOOR_COUNT * W.FLOOR_HEIGHT; // 20.4
    const solidGray = new THREE.MeshLambertMaterial({ color: 0x626a78 });
    const slabMat = makeTransparentMaterial(0x8a93a5, 0.3);
    const wallMat = makeTransparentMaterial(0x9999ff, 0.2);

    // ground + sidewalk
    buildingGroup.add(boxMesh(24, 0.5, 18.6, solidGray, 0, -0.25, -0.3));
    const sidewalk = boxMesh(24, 0.5, 4.2, new THREE.MeshLambertMaterial({ color: 0x9aa0a8 }), 0, -0.25, 11.1);
    buildingGroup.add(sidewalk);

    // roof
    buildingGroup.add(boxMesh(22.4, 0.35, 18.4, solidGray, 0, totalH + 0.175, 0));

    // intermediate floor slabs: four strips around the shaft hole
    for (let n = 1; n < W.FLOOR_COUNT; n += 1) {
        const y = n * W.FLOOR_HEIGHT - 0.15;
        buildingGroup.add(boxMesh(22, 0.3, 7.5, slabMat, 0, y, 5.25));   // south strip (front)
        buildingGroup.add(boxMesh(22, 0.3, 7.5, slabMat, 0, y, -5.25));  // north strip (back)
        buildingGroup.add(boxMesh(9.5, 0.3, 3, slabMat, -6.25, y, 0));   // west strip
        buildingGroup.add(boxMesh(9.5, 0.3, 3, slabMat, 6.25, y, 0));    // east strip
    }

    // outer walls: front wall split so a 3.4-wide doorway exists at floor 0 center
    const halfW = W.BUILDING_WIDTH / 2;      // 11
    const halfD = W.BUILDING_DEPTH / 2;      // 9
    const gapHalf = 1.7;                     // doorway x in [-1.7, 1.7]
    buildingGroup.add(boxMesh(halfW - gapHalf, totalH, 0.15, wallMat, -(gapHalf + (halfW - gapHalf) / 2), totalH / 2, halfD));
    buildingGroup.add(boxMesh(halfW - gapHalf, totalH, 0.15, wallMat, gapHalf + (halfW - gapHalf) / 2, totalH / 2, halfD));
    // panel above the entrance gap covering floors 1..5
    const upperH = totalH - W.FLOOR_HEIGHT;
    buildingGroup.add(boxMesh(gapHalf * 2, upperH, 0.15, wallMat, 0, W.FLOOR_HEIGHT + upperH / 2, halfD));
    // back / left / right walls
    buildingGroup.add(boxMesh(W.BUILDING_WIDTH, totalH, 0.15, wallMat, 0, totalH / 2, -halfD));
    buildingGroup.add(boxMesh(0.15, totalH, W.BUILDING_DEPTH, wallMat, -halfW, totalH / 2, 0));
    buildingGroup.add(boxMesh(0.15, totalH, W.BUILDING_DEPTH, wallMat, halfW, totalH / 2, 0));

    // shaft sleeve (very faint) so the car reads as being inside a shaft
    const shaftMat = makeTransparentMaterial(0x7f8fae, 0.12);
    buildingGroup.add(boxMesh(W.SHAFT_WIDTH, totalH, 0.06, shaftMat, 0, totalH / 2, W.SHAFT_DEPTH / 2));
    buildingGroup.add(boxMesh(W.SHAFT_WIDTH, totalH, 0.06, shaftMat, 0, totalH / 2, -W.SHAFT_DEPTH / 2));
    buildingGroup.add(boxMesh(0.06, totalH, W.SHAFT_DEPTH, shaftMat, W.SHAFT_WIDTH / 2, totalH / 2, 0));
    buildingGroup.add(boxMesh(0.06, totalH, W.SHAFT_DEPTH, shaftMat, -W.SHAFT_WIDTH / 2, totalH / 2, 0));

    // floors
    const floors = [];
    floors.push(buildLobby(0, buildingGroup));
    for (let n = 1; n < W.FLOOR_COUNT; n += 1) {
        floors.push(buildOfficeFloor(n, buildingGroup));
    }

    return {
        buildingGroup: buildingGroup,
        floors: floors,
        bfsPath: bfsPath
    };
}

window.WORLD = WORLD;
window.createWorld = createWorld;
window.bfsPath = bfsPath;
