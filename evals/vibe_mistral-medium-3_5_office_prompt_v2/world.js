const WORLD = {
    FLOOR_HEIGHT: 3.4,
    FLOOR_COUNT: 6,
    BUILDING_WIDTH: 22,
    BUILDING_DEPTH: 18,
    SHAFT_WIDTH: 3,
    SHAFT_DEPTH: 3,
    PERSON_R: 0.4
};

// Materials
const floorMaterial = new THREE.MeshPhongMaterial({
    color: 0x555555, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide, transparent: true
});
const outerWallMaterial = new THREE.MeshPhongMaterial({
    color: 0x9999ff, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide, transparent: true
});
const interiorWallMaterial = new THREE.MeshPhongMaterial({
    color: 0xbbc5e6, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide, transparent: true
});
const groundMaterial = new THREE.MeshPhongMaterial({ color: 0x444444 });
const roofMaterial = new THREE.MeshPhongMaterial({ color: 0x444444 });
const sidewalkMaterial = new THREE.MeshPhongMaterial({ color: 0x888888 });

// Text texture with caching
let textCanvas, textCtx;
function getTextCanvas() {
    if (!textCanvas) {
        textCanvas = document.createElement('canvas');
        textCanvas.width = 256; textCanvas.height = 256;
        textCtx = textCanvas.getContext('2d');
        textCtx.font = 'Bold 180px Arial';
    }
    return { canvas: textCanvas, ctx: textCtx };
}

function updateTextTexture(text, tex) {
    if (tex && tex._lastText === text) return;
    const { ctx, canvas } = getTextCanvas();
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = '#ffbb22';
    ctx.shadowColor = '#ffbb22';
    ctx.shadowBlur = 20;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 128, 200);
    if (tex) {
        tex.needsUpdate = true;
        tex._lastText = text;
    } else {
        tex = new THREE.CanvasTexture(canvas);
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.anisotropy = 4;
        tex._lastText = text;
    }
    return tex;
}

function createCallPanel(floorNumber) {
    const group = new THREE.Group();
    const plateGeo = new THREE.BoxGeometry(0.55, 1.4, 0.05);
    const plateMat = new THREE.MeshPhongMaterial({ color: 0x333333 });
    group.add(new THREE.Mesh(plateGeo, plateMat));

    // Up arrow
    const upShape = new THREE.Shape();
    upShape.moveTo(0, 0.3, 0); upShape.lineTo(-0.13, 0, 0); upShape.lineTo(0.13, 0, 0); upShape.lineTo(0, 0.3, 0);
    const upGeo = new THREE.ShapeGeometry(upShape);
    const upMatDark = new THREE.MeshBasicMaterial({ color: 0x333333 });
    const upMatGlow = new THREE.MeshBasicMaterial({ color: 0x00ff00, emissive: 0x00ff00, emissiveIntensity: 0.8 });
    const upArrow = new THREE.Mesh(upGeo, upMatDark);
    upArrow.position.set(0, 0.4, 0.025);
    group.add(upArrow);

    // Down arrow
    const downShape = new THREE.Shape();
    downShape.moveTo(0, -0.3, 0); downShape.lineTo(-0.13, 0, 0); downShape.lineTo(0.13, 0, 0); downShape.lineTo(0, -0.3, 0);
    const downGeo = new THREE.ShapeGeometry(downShape);
    const downMatDark = new THREE.MeshBasicMaterial({ color: 0x333333 });
    const downMatGlow = new THREE.MeshBasicMaterial({ color: 0x00ff00, emissive: 0x00ff00, emissiveIntensity: 0.8 });
    const downArrow = new THREE.Mesh(downGeo, downMatDark);
    downArrow.position.set(0, -0.4, 0.025);
    group.add(downArrow);

    // Indicator
    const indSize = 0.45;
    const indGeo = new THREE.PlaneGeometry(indSize, indSize);
    const indTex = {};
    const indMat = new THREE.MeshBasicMaterial({ map: indTex, transparent: true });
    const indMesh = new THREE.Mesh(indGeo, indMat);
    indMesh.position.set(0, 0, 0.025);
    group.add(indMesh);

    group.userData = {
        setUp: on => upArrow.material = on ? upMatGlow : upMatDark,
        setDown: on => downArrow.material = on ? downMatGlow : downMatDark,
        setIndicator: text => {
            if (!indTex.map) {
                const t = new THREE.CanvasTexture();
                t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = 4;
                indTex.map = t; indTex._lastText = '';
            }
            updateTextTexture(text, indTex.map);
            indMesh.material.map = indTex.map;
        }
    };
    group.userData.setUp(false);
    group.userData.setDown(false);
    group.userData.setIndicator(''+floorNumber);
    return group;
}

function createShaftIndicator(floorNumber) {
    const group = new THREE.Group();
    group.position.set(0, 1.8, -1.55);
    const size = 0.9;
    const geo = new THREE.PlaneGeometry(size, size);
    const tex = {};
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
    const mesh = new THREE.Mesh(geo, mat);
    group.add(mesh);
    group.userData = {
        setIndicator: text => {
            if (!tex.map) {
                const t = new THREE.CanvasTexture();
                t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = 4;
                tex.map = t; tex._lastText = '';
            }
            updateTextTexture(text, tex.map);
            mesh.material.map = tex.map;
        }
    };
    group.userData.setIndicator(''+floorNumber);
    return group;
}

function createCarIndicator() {
    const group = new THREE.Group();
    group.position.set(0, 0.9, -1.45);
    const size = 0.6;
    const geo = new THREE.PlaneGeometry(size, size);
    const tex = {};
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
    const mesh = new THREE.Mesh(geo, mat);
    group.add(mesh);
    group.userData = {
        setIndicator: text => {
            if (!tex.map) {
                const t = new THREE.CanvasTexture();
                t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = 4;
                tex.map = t; tex._lastText = '';
            }
            updateTextTexture(text, tex.map);
            mesh.material.map = tex.map;
        }
    };
    group.userData.setIndicator('G');
    return group;
}

// Furniture factories
function createDesk() {
    const group = new THREE.Group();
    const deskGeo = new THREE.BoxGeometry(1.2, 0.05, 0.6);
    const deskMat = new THREE.MeshPhongMaterial({ color: 0x5a3e2b });
    const desk = new THREE.Mesh(deskGeo, deskMat);
    desk.position.y = 0.75; group.add(desk);
    const legGeo = new THREE.BoxGeometry(0.08, 0.7, 0.08);
    const legMat = new THREE.MeshPhongMaterial({ color: 0x333333 });
    for (const [x, z] of [[-0.5, -0.25], [0.5, -0.25], [-0.5, 0.25], [0.5, 0.25]]) {
        const leg = new THREE.Mesh(legGeo, legMat); leg.position.set(x, 0.35, z); group.add(leg);
    }
    const monitorGeo = new THREE.BoxGeometry(0.35, 0.25, 0.03);
    const monitorMat = new THREE.MeshPhongMaterial({ color: 0x222222 });
    const monitor = new THREE.Mesh(monitorGeo, monitorMat);
    monitor.position.set(0, 0.875, -0.25); group.add(monitor);
    return group;
}

function createChair(facingDir = 0) {
    const group = new THREE.Group(); group.rotation.y = facingDir;
    const seatGeo = new THREE.BoxGeometry(0.4, 0.1, 0.4);
    const seatMat = new THREE.MeshPhongMaterial({ color: 0x333333 });
    const seat = new THREE.Mesh(seatGeo, seatMat); seat.position.y = 0.5; group.add(seat);
    const backGeo = new THREE.BoxGeometry(0.4, 0.35, 0.05);
    const backMat = new THREE.MeshPhongMaterial({ color: 0x444444 });
    const back = new THREE.Mesh(backGeo, backMat);
    back.position.set(0, 0.675, -0.2); back.rotation.x = -Math.PI / 6; group.add(back);
    const legGeo = new THREE.BoxGeometry(0.05, 0.45, 0.05);
    const legMat = new THREE.MeshPhongMaterial({ color: 0x222222 });
    for (const [x, z] of [[-0.15, -0.15], [0.15, -0.15], [-0.15, 0.15], [0.15, 0.15]]) {
        const leg = new THREE.Mesh(legGeo, legMat); leg.position.set(x, 0.25, z); group.add(leg);
    }
    return group;
}

function createCouch() {
    const group = new THREE.Group();
    const baseGeo = new THREE.BoxGeometry(1.6, 0.2, 0.8);
    const baseMat = new THREE.MeshPhongMaterial({ color: 0x4a4a4a });
    const base = new THREE.Mesh(baseGeo, baseMat); base.position.y = 0.4; group.add(base);
    const backGeo = new THREE.BoxGeometry(1.6, 0.5, 0.1);
    const backMat = new THREE.MeshPhongMaterial({ color: 0x5a5a5a });
    const back = new THREE.Mesh(backGeo, backMat); back.position.set(0, 0.65, -0.4); group.add(back);
    const armGeo = new THREE.BoxGeometry(0.15, 0.4, 0.2);
    const armMat = new THREE.MeshPhongMaterial({ color: 0x5a5a5a });
    const armL = new THREE.Mesh(armGeo, armMat); armL.position.set(-0.725, 0.4, 0); group.add(armL);
    const armR = new THREE.Mesh(armGeo, armMat); armR.position.set(0.725, 0.4, 0); group.add(armR);
    return group;
}

function createCoffeeTable() {
    const group = new THREE.Group();
    const topGeo = new THREE.BoxGeometry(0.8, 0.05, 0.5);
    const topMat = new THREE.MeshPhongMaterial({ color: 0x4a3525 });
    const top = new THREE.Mesh(topGeo, topMat); top.position.y = 0.45; group.add(top);
    const legGeo = new THREE.BoxGeometry(0.08, 0.4, 0.08);
    const legMat = new THREE.MeshPhongMaterial({ color: 0x333333 });
    for (const [x, z] of [[-0.35, -0.2], [0.35, -0.2], [-0.35, 0.2], [0.35, 0.2]]) {
        const leg = new THREE.Mesh(legGeo, legMat); leg.position.set(x, 0.2, z); group.add(leg);
    }
    return group;
}

function createBistroTable() {
    const group = new THREE.Group();
    const topGeo = new THREE.BoxGeometry(0.6, 0.03, 0.6);
    const topMat = new THREE.MeshPhongMaterial({ color: 0x4a3525 });
    const top = new THREE.Mesh(topGeo, topMat); top.position.y = 0.75; group.add(top);
    const legGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.7, 8);
    const legMat = new THREE.MeshPhongMaterial({ color: 0x333333 });
    const leg = new THREE.Mesh(legGeo, legMat); leg.position.y = 0.35; group.add(leg);
    return group;
}

function createWaterCooler() {
    const group = new THREE.Group();
    const bodyGeo = new THREE.BoxGeometry(0.3, 0.9, 0.3);
    const bodyMat = new THREE.MeshPhongMaterial({ color: 0x666666 });
    const body = new THREE.Mesh(bodyGeo, bodyMat); body.position.y = 0.45; group.add(body);
    const reservoirGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.2, 16);
    const reservoirMat = new THREE.MeshPhongMaterial({ color: 0x888888 });
    const reservoir = new THREE.Mesh(reservoirGeo, reservoirMat);
    reservoir.rotation.x = Math.PI / 2; reservoir.position.set(0, 0.9, -0.05); group.add(reservoir);
    const spoutGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.15, 8);
    const spoutMat = new THREE.MeshPhongMaterial({ color: 0x444444 });
    const spout = new THREE.Mesh(spoutGeo, spoutMat);
    spout.rotation.x = Math.PI / 4; spout.position.set(0.1, 0.65, -0.15); group.add(spout);
    return group;
}

function createReceptionDesk() {
    const group = new THREE.Group();
    const counterGeo = new THREE.BoxGeometry(2.0, 0.1, 0.6);
    const counterMat = new THREE.MeshPhongMaterial({ color: 0x5a3e2b });
    const counter = new THREE.Mesh(counterGeo, counterMat); counter.position.y = 0.75; group.add(counter);
    const legGeo = new THREE.BoxGeometry(0.1, 0.7, 0.1);
    const legMat = new THREE.MeshPhongMaterial({ color: 0x333333 });
    for (const [x, z] of [[-0.9, -0.25], [0.9, -0.25], [-0.9, 0.25], [0.9, 0.25]]) {
        const leg = new THREE.Mesh(legGeo, legMat); leg.position.set(x, 0.35, z); group.add(leg);
    }
    const backGeo = new THREE.BoxGeometry(2.0, 0.8, 0.1);
    const backMat = new THREE.MeshPhongMaterial({ color: 0x666666 });
    const back = new THREE.Mesh(backGeo, backMat); back.position.set(0, 0.4, 0.3); group.add(back);
    return group;
}

function createKiosk() {
    const group = new THREE.Group();
    const screenGeo = new THREE.BoxGeometry(0.4, 0.6, 0.05);
    const screenMat = new THREE.MeshPhongMaterial({ color: 0x222244 });
    const screen = new THREE.Mesh(screenGeo, screenMat); screen.position.y = 1.0; group.add(screen);
    const baseGeo = new THREE.BoxGeometry(0.5, 0.8, 0.4);
    const baseMat = new THREE.MeshPhongMaterial({ color: 0x666666 });
    const base = new THREE.Mesh(baseGeo, baseMat); base.position.y = 0.4; group.add(base);
    return group;
}

function createCoffeeMachine() {
    const group = new THREE.Group();
    const bodyGeo = new THREE.BoxGeometry(0.5, 0.6, 0.4);
    const bodyMat = new THREE.MeshPhongMaterial({ color: 0x888888 });
    const body = new THREE.Mesh(bodyGeo, bodyMat); body.position.y = 0.3; group.add(body);
    const topGeo = new THREE.BoxGeometry(0.55, 0.1, 0.45);
    const topMat = new THREE.MeshPhongMaterial({ color: 0x555555 });
    const top = new THREE.Mesh(topGeo, topMat); top.position.y = 0.65; group.add(top);
    return group;
}

function createPastryDisplay() {
    const group = new THREE.Group();
    const caseGeo = new THREE.BoxGeometry(0.8, 0.3, 0.4);
    const caseMat = new THREE.MeshPhongMaterial({ color: 0xaaaaaa, transparent: true, opacity: 0.3 });
    const displayCase = new THREE.Mesh(caseGeo, caseMat); displayCase.position.y = 0.75; group.add(displayCase);
    return group;
}

function createPottedPlant() {
    const group = new THREE.Group();
    const potGeo = new THREE.CylinderGeometry(0.2, 0.25, 0.3, 16);
    const potMat = new THREE.MeshPhongMaterial({ color: 0x4a3525 });
    const pot = new THREE.Mesh(potGeo, potMat); pot.position.y = 0.15; group.add(pot);
    const plantGeo = new THREE.ConeGeometry(0.4, 0.8, 16);
    const plantMat = new THREE.MeshPhongMaterial({ color: 0x228822 });
    const plant = new THREE.Mesh(plantGeo, plantMat); plant.position.y = 0.6; plant.rotation.x = Math.PI / 2; group.add(plant);
    return group;
}

// BFS pathfinding
function bfsPath(nodes, fromName, toName) {
    const queue = [{ name: fromName, path: [nodes[fromName]] }];
    const visited = new Set([fromName]);
    while (queue.length > 0) {
        const { name, path } = queue.shift();
        if (name === toName) return path.map(v => v.clone());
        const node = nodes[name];
        if (!node || !node.neighbors) continue;
        for (const n of node.neighbors) {
            if (!visited.has(n)) {
                visited.add(n);
                queue.push({ name: n, path: [...path, nodes[n]] });
            }
        }
    }
    return [];
}

function createWorld(scene) {
    const buildingGroup = new THREE.Group();
    buildingGroup.renderOrder = 0;
    scene.add(buildingGroup);
    const floors = [];

    // Ground slab
    const groundGeo = new THREE.BoxGeometry(WORLD.BUILDING_WIDTH, 0.5, WORLD.BUILDING_DEPTH);
    const ground = new THREE.Mesh(groundGeo, groundMaterial);
    ground.position.y = -0.25; buildingGroup.add(ground);

    // Roof
    const roof = new THREE.Mesh(groundGeo, roofMaterial);
    roof.position.y = WORLD.FLOOR_HEIGHT * WORLD.FLOOR_COUNT + 0.25; buildingGroup.add(roof);

    // Sidewalk
    const sidewalkGeo = new THREE.BoxGeometry(WORLD.BUILDING_WIDTH + 2, 0.2, 4);
    const sidewalk = new THREE.Mesh(sidewalkGeo, sidewalkMaterial);
    sidewalk.position.set(0, 0, WORLD.BUILDING_DEPTH / 2 + 2); buildingGroup.add(sidewalk);

    // Predefined hallway ring positions
    const hallRing = ['hallS', 'hallSE', 'hallE', 'hallNE', 'hallN', 'hallNW', 'hallW', 'hallSW'];
    const hallPos = {
        hallS: { x: 0, z: -1.8 },
        hallSE: { x: 2.8, z: -1.8 },
        hallE: { x: 2.8, z: 0 },
        hallNE: { x: 2.8, z: 1.8 },
        hallN: { x: 0, z: 1.8 },
        hallNW: { x: -2.8, z: 1.8 },
        hallW: { x: -2.8, z: 0 },
        hallSW: { x: -2.8, z: -1.8 }
    };

    for (let floorNumber = 0; floorNumber < WORLD.FLOOR_COUNT; floorNumber++) {
        const h = WORLD.FLOOR_HEIGHT * floorNumber;
        const isLobby = floorNumber === 0;
        const floorGroup = new THREE.Group(); floorGroup.position.y = h;
        buildingGroup.add(floorGroup);

        // Floor slab with shaft hole (4 strips)
        const shaftHW = WORLD.SHAFT_WIDTH / 2, shaftHD = WORLD.SHAFT_DEPTH / 2;
        const frontStrip = new THREE.Mesh(
            new THREE.BoxGeometry(WORLD.BUILDING_WIDTH, 0.3, WORLD.BUILDING_DEPTH/2 - shaftHD - 0.05),
            floorMaterial
        ); frontStrip.position.z = (WORLD.BUILDING_DEPTH/2 + shaftHD)/2; floorGroup.add(frontStrip);
        const backStrip = new THREE.Mesh(
            new THREE.BoxGeometry(WORLD.BUILDING_WIDTH, 0.3, WORLD.BUILDING_DEPTH/2 - shaftHD - 0.05),
            floorMaterial
        ); backStrip.position.z = -(WORLD.BUILDING_DEPTH/2 + shaftHD)/2; floorGroup.add(backStrip);
        const leftStrip = new THREE.Mesh(
            new THREE.BoxGeometry(WORLD.BUILDING_WIDTH/2 - shaftHW - 0.05, 0.3, shaftHD*2 + 0.1),
            floorMaterial
        ); leftStrip.position.x = -(WORLD.BUILDING_WIDTH/2 + shaftHW)/2; floorGroup.add(leftStrip);
        const rightStrip = new THREE.Mesh(
            new THREE.BoxGeometry(WORLD.BUILDING_WIDTH/2 - shaftHW - 0.05, 0.3, shaftHD*2 + 0.1),
            floorMaterial
        ); rightStrip.position.x = (WORLD.BUILDING_WIDTH/2 + shaftHW)/2; floorGroup.add(rightStrip);

        // Outer walls
        const sideWallGeo = new THREE.BoxGeometry(0.05, WORLD.FLOOR_HEIGHT, WORLD.BUILDING_DEPTH);
        const leftWall = new THREE.Mesh(sideWallGeo, outerWallMaterial);
        leftWall.position.set(-WORLD.BUILDING_WIDTH/2 - 0.025, WORLD.FLOOR_HEIGHT/2, 0);
        buildingGroup.add(leftWall);
        const rightWall = new THREE.Mesh(sideWallGeo, outerWallMaterial);
        rightWall.position.set(WORLD.BUILDING_WIDTH/2 + 0.025, WORLD.FLOOR_HEIGHT/2, 0);
        buildingGroup.add(rightWall);
        const backWall = new THREE.Mesh(
            new THREE.BoxGeometry(WORLD.BUILDING_WIDTH, WORLD.FLOOR_HEIGHT, 0.05),
            outerWallMaterial
        ); backWall.position.set(0, WORLD.FLOOR_HEIGHT/2, -WORLD.BUILDING_DEPTH/2 - 0.025);
        buildingGroup.add(backWall);

        if (isLobby) {
            // Floor 0 front wall with gap
            const fwGeo = new THREE.BoxGeometry((WORLD.BUILDING_WIDTH/2 - 1.5), WORLD.FLOOR_HEIGHT, 0.05);
            const frontWallLeft = new THREE.Mesh(fwGeo, outerWallMaterial);
            frontWallLeft.position.set(-(WORLD.BUILDING_WIDTH/2 - 1.5)/2, WORLD.FLOOR_HEIGHT/2, WORLD.BUILDING_DEPTH/2 + 0.025);
            buildingGroup.add(frontWallLeft);
            const frontWallRight = new THREE.Mesh(fwGeo, outerWallMaterial);
            frontWallRight.position.set((WORLD.BUILDING_WIDTH/2 - 1.5)/2, WORLD.FLOOR_HEIGHT/2, WORLD.BUILDING_DEPTH/2 + 0.025);
            buildingGroup.add(frontWallRight);
            // Gap top
            const gapTop = new THREE.Mesh(
                new THREE.BoxGeometry(3.0, WORLD.FLOOR_HEIGHT, 0.05),
                outerWallMaterial
            ); gapTop.position.set(0, WORLD.FLOOR_HEIGHT/2, WORLD.BUILDING_DEPTH/2 + 0.025);
            buildingGroup.add(gapTop);
            // Entrance glass doors
            const doorFrame = new THREE.Mesh(
                new THREE.BoxGeometry(3.2, WORLD.FLOOR_HEIGHT*0.8, 0.05),
                new THREE.MeshPhongMaterial({ color: 0xaaaaaa, transparent: true, opacity: 0.4 })
            ); doorFrame.position.set(0, WORLD.FLOOR_HEIGHT/2, WORLD.BUILDING_DEPTH/2 + 0.025);
            floorGroup.add(doorFrame);
        } else {
            // Floors 1-5: solid front wall
            const frontWall = new THREE.Mesh(
                new THREE.BoxGeometry(WORLD.BUILDING_WIDTH, WORLD.FLOOR_HEIGHT, 0.05),
                outerWallMaterial
            ); frontWall.position.set(0, WORLD.FLOOR_HEIGHT/2, WORLD.BUILDING_DEPTH/2 + 0.025);
            buildingGroup.add(frontWall);
        }

        // Navigation graph
        const nodes = {};
        function addNode(name, x, z) {
            nodes[name] = { name, position: new THREE.Vector3(x, h, z), neighbors: [] };
        }
        function connect(a, b) {
            if (!nodes[a].neighbors.includes(b)) nodes[a].neighbors.push(b);
            if (!nodes[b].neighbors.includes(a)) nodes[b].neighbors.push(a);
        }

        // Hallway ring
        for (const n of hallRing) {
            const p = hallPos[n];
            addNode(n, p.x, p.z);
        }
        for (let i = 0; i < hallRing.length; i++) {
            connect(hallRing[i], hallRing[(i+1)%hallRing.length]);
        }
        addNode('elevWait', 0, -1.45);
        connect('elevWait', 'hallS');

        const sitTargets = {};
        let lobbyOnly = {};

        if (isLobby) {
            // Lobby specific
            addNode('entrance', 0, 8.5); connect('entrance', 'elevWait');
            addNode('outside', 0, 12); connect('outside', 'entrance');
            sitTargets.outside = { sit: false, facing: 0 };

            addNode('cafe_door', -7, 5); connect('cafe_door', 'elevWait');
            addNode('cafe_center', -7, 7); connect('cafe_door', 'cafe_center');
            addNode('cafe_order', -9, 8.8); connect('cafe_center', 'cafe_order');

            for (let i = 0; i < 4; i++) {
                const px = -8 + i * 3, pz = 4;
                addNode(`bistro${i}_table`, px, pz); connect(`bistro${i}_table`, 'cafe_center');
                addNode(`bistro${i}_chair1`, px, pz + 0.5); connect(`bistro${i}_chair1`, `bistro${i}_table`);
                addNode(`bistro${i}_chair2`, px, pz - 0.5); connect(`bistro${i}_chair2`, `bistro${i}_table`);
                sitTargets[`bistro${i}_chair1`] = { sit: true, facing: Math.PI };
                sitTargets[`bistro${i}_chair2`] = { sit: true, facing: 0 };
            }

            addNode('front_lounge_door', 7, 5); connect('front_lounge_door', 'elevWait');
            addNode('front_lounge_center', 7, 7); connect('front_lounge_door', 'front_lounge_center');
            for (const [name, x, z] of [['front_lounge_spot1', 5, 6], ['front_lounge_spot2', 9, 6], ['front_lounge_spot3', 7, 9]]) {
                addNode(name, x, z); connect(name, 'front_lounge_center');
                sitTargets[name] = { sit: false, facing: 0 };
            }

            addNode('back_lounge_N', -3, -4); connect('back_lounge_N', 'hallW');
            addNode('back_lounge_S', 3, -4); connect('back_lounge_S', 'hallE');
            addNode('back_lounge_center', 0, -6); connect('back_lounge_N', 'back_lounge_center');
            connect('back_lounge_S', 'back_lounge_center');
            sitTargets.back_lounge_N = { sit: false, facing: 0 };
            sitTargets.back_lounge_S = { sit: false, facing: 0 };
            sitTargets.back_lounge_center = { sit: false, facing: 0 };

            addNode('pit_center', -7, -3);
            for (const [name, x, z, f] of [['pit_N', -7, -1.5, 0], ['pit_S', -7, -4.5, Math.PI], ['pit_E', -5.5, -3, Math.PI/2], ['pit_W', -8.5, -3, -Math.PI/2]]) {
                addNode(name, x, z); connect(name, 'pit_center');
                sitTargets[name] = { sit: true, facing: f };
            }
            connect('pit_N', 'hallW');

            addNode('lobby_wc_front', 9, 3); connect('lobby_wc_front', 'front_lounge_center');
            addNode('lobby_wc_back', -9, -3); connect('lobby_wc_back', 'back_lounge_center');
            addNode('reception', -4, 7); connect('reception', 'cafe_center');
            addNode('kiosk', 4, 7); connect('kiosk', 'front_lounge_center');

            for (const [name, x, z] of [['lobby_stand_center', 0, 5], ['lobby_stand_NE', 8, 6], ['lobby_stand_NW', -8, 6],
                    ['lobby_stand_midE', 10, 0], ['lobby_stand_midW', -10, 0], ['lobby_stand_entry', 0, 10]]) {
                addNode(name, x, z); connect(name, 'elevWait');
                sitTargets[name] = { sit: false, facing: 0 };
            }

            // Lobby furniture
            const cafeGroup = new THREE.Group(); cafeGroup.position.set(-9, 0, 7);
            const counter = createReceptionDesk(); counter.rotation.y = Math.PI/2; counter.position.set(1, 0, -1); cafeGroup.add(counter);
            cafeGroup.add(createCoffeeMachine()); cafeGroup.getObjectByName('CoffeeMachine').position.set(-1, 0, -1.5);
            cafeGroup.add(createPastryDisplay()); cafeGroup.getObjectByName('PastryDisplay').position.set(1, 0, -1.5);
            for (let i = 0; i < 4; i++) {
                const table = createBistroTable(); table.position.set(-10 + i*3, 0, -5); cafeGroup.add(table);
                table.add(createChair(Math.PI)); table.getObjectByName('Chair').position.set(0.6, 0, 0);
                table.add(createChair(0)); table.getObjectByName('Chair0').position.set(-0.6, 0, 0);
            }
            floorGroup.add(cafeGroup);

            const frontLoungeGroup = new THREE.Group(); frontLoungeGroup.position.set(9, 0, 7);
            const couch1 = createCouch(); couch1.rotation.y = Math.PI; couch1.position.set(0, 0, -1); frontLoungeGroup.add(couch1);
            frontLoungeGroup.add(createCoffeeTable()); frontLoungeGroup.getObjectByName('CoffeeTable').position.set(0, 0, -3);
            frontLoungeGroup.add(createChair(Math.PI)); frontLoungeGroup.getObjectByName('Chair').position.set(2, 0, -1);
            frontLoungeGroup.add(createChair(0)); frontLoungeGroup.getObjectByName('Chair0').position.set(-2, 0, -1);
            floorGroup.add(frontLoungeGroup);

            const backLoungeGroup = new THREE.Group(); backLoungeGroup.position.set(0, 0, -6);
            backLoungeGroup.add(createCouch()); backLoungeGroup.getObjectByName('Couch').position.set(-4, 0, 0);
            const couch3 = createCouch(); couch3.rotation.y = Math.PI; couch3.position.set(4, 0, 0); backLoungeGroup.add(couch3);
            backLoungeGroup.add(createCoffeeTable()); backLoungeGroup.getObjectByName('CoffeeTable').position.set(0, 0, 0);
            floorGroup.add(backLoungeGroup);

            const pitGroup = new THREE.Group(); pitGroup.position.set(-7, 0, -3);
            pitGroup.add(new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.05, 16), new THREE.MeshPhongMaterial({color:0x4a3525})));
            pitGroup.getObjectByName('Cylinder').position.y = 0.45;
            for (let i = 0; i < 4; i++) {
                const angle = [0, Math.PI, Math.PI/2, -Math.PI/2][i];
                const chair = createChair(angle + Math.PI);
                chair.position.set(Math.cos(angle)*1.0, 0, Math.sin(angle)*1.0);
                pitGroup.add(chair);
            }
            floorGroup.add(pitGroup);

            floorGroup.add(createWaterCooler()); floorGroup.getObjectByName('WaterCooler').position.set(9, 0, 3);
            floorGroup.add(createWaterCooler()); floorGroup.getObjectByName('WaterCooler0').position.set(-9, 0, -3);
            floorGroup.add(createReceptionDesk()); floorGroup.getObjectByName('ReceptionDesk').position.set(-4, 0, 7);
            floorGroup.add(createKiosk()); floorGroup.getObjectByName('Kiosk').position.set(4, 0, 7);
            floorGroup.add(createPottedPlant()); floorGroup.getObjectByName('PottedPlant').position.set(-2, 0, 10);
            floorGroup.add(createPottedPlant()); floorGroup.getObjectByName('PottedPlant0').position.set(2, 0, 10);

            lobbyOnly = {
                entranceSpot: new THREE.Vector3(0, h, 8.5),
                cafeSpots: ['cafe_order'],
                frontLoungeSpots: ['front_lounge_spot1', 'front_lounge_spot2', 'front_lounge_spot3'],
                backLoungeSpots: ['back_lounge_N', 'back_lounge_S', 'back_lounge_center'],
                pitSpots: ['pit_N', 'pit_S', 'pit_E', 'pit_W', 'pit_center']
            };
        } else {
            // Office floors
            // Office walls
            for (let i = 0; i < 4; i++) {
                const x = -9 + i * 3.5;
                const wall = new THREE.Mesh(
                    new THREE.BoxGeometry(0.05, WORLD.FLOOR_HEIGHT*0.8, 3.5),
                    interiorWallMaterial
                ); wall.position.set(x, WORLD.FLOOR_HEIGHT/2, -4.5); floorGroup.add(wall);
            }

            // Offices
            const officeIds = ['A','B','C','D'];
            const officeXs = [-8,-4,4,8];
            for (let i = 0; i < 4; i++) {
                const id = officeIds[i], ox = officeXs[i], cz = -6;
                const door = addNode(`office${id}_door`, ox < 0 ? -9.5 : 9.5, -3);
                connect(door.name, i < 2 ? 'hallSW' : 'hallSE');
                const deskNode = addNode(`office${id}_desk`, ox, -8);
                connect(door.name, deskNode.name);
                addNode(`office${id}_chair`, ox, -7.3);
                connect(deskNode.name, `office${id}_chair`);
                sitTargets[`office${id}_chair`] = { sit: true, facing: Math.PI };

                const officeGroup = new THREE.Group(); officeGroup.position.set(ox, 0, cz);
                const d = createDesk(); d.rotation.y = Math.PI; officeGroup.add(d);
                const c = createChair(Math.PI); c.position.set(0, 0, 0.6); officeGroup.add(c);
                floorGroup.add(officeGroup);
            }

            // Conference room
            addNode('conf_door', -8, 5); connect('conf_door', 'hallSW');
            addNode('conf_center', -8, 7); connect('conf_door', 'conf_center');
            for (let i = 0; i < 4; i++) {
                const x = -8 + (i < 2 ? -1.5 : 1.5), z = 7 + (i % 2 === 0 ? -1.2 : 1.2), rot = i < 2 ? Math.PI : 0;
                addNode(`conf_seat${i}`, x, z); connect(`conf_seat${i}`, 'conf_center');
                sitTargets[`conf_seat${i}`] = { sit: true, facing: rot };
            }
            const confGroup = new THREE.Group(); confGroup.position.set(-8, 0, 6);
            confGroup.add(new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.05, 1.2), new THREE.MeshPhongMaterial({color:0x4a3525})));
            confGroup.getObjectByName('Box').position.y = 0.75;
            for (let i = 0; i < 4; i++) {
                const p = [{x:-1.2,z:0.5,r:Math.PI},{x:1.2,z:0.5,r:0},{x:-1.2,z:-0.5,r:Math.PI},{x:1.2,z:-0.5,r:0}][i];
                const ch = createChair(p.r); ch.position.set(p.x, 0, p.z); confGroup.add(ch);
            }
            floorGroup.add(confGroup);

            // Lounge
            addNode('lounge_door', 8, 5); connect('lounge_door', 'hallSE');
            addNode('lounge_center', 8, 7); connect('lounge_door', 'lounge_center');
            for (let i = 0; i < 3; i++) {
                const x = 8 + (i === 0 ? -2 : i === 1 ? 0 : 2), z = 7 + (i === 2 ? 0 : i === 0 ? -1 : 1);
                addNode(`lounge_spot${i}`, x, z); connect(`lounge_spot${i}`, 'lounge_center');
                sitTargets[`lounge_spot${i}`] = { sit: false, facing: 0 };
            }
            const loungeGroup = new THREE.Group(); loungeGroup.position.set(8, 0, 6);
            const lc = createCouch(); lc.rotation.y = Math.PI/2; loungeGroup.add(lc);
            loungeGroup.add(createCoffeeTable()); loungeGroup.getObjectByName('CoffeeTable').position.set(0, 0, -2);
            loungeGroup.add(createChair(Math.PI)); loungeGroup.getObjectByName('Chair').position.set(-2, 0, -1);
            loungeGroup.add(createChair(0)); loungeGroup.getObjectByName('Chair0').position.set(2, 0, -1);
            floorGroup.add(loungeGroup);

            addNode('water_cooler', 10, 3); connect('water_cooler', 'lounge_center');
            addNode('hall_stand_N', 0, 1.4); connect('hall_stand_N', 'hallN');
            addNode('hall_stand_S', 0, -1.4); connect('hall_stand_S', 'hallS');
            sitTargets.hall_stand_N = { sit: false, facing: 0 };
            sitTargets.hall_stand_S = { sit: false, facing: Math.PI };

            floorGroup.add(createWaterCooler()); floorGroup.getObjectByName('WaterCooler').position.set(10, 0, 3);
            // Division walls
            floorGroup.add(new THREE.Mesh(
                new THREE.BoxGeometry(0.05, WORLD.FLOOR_HEIGHT*0.8, 6), interiorWallMaterial
            )); floorGroup.getObjectByName('Box').position.set(0, WORLD.FLOOR_HEIGHT/2, 3);
            const sideDiv = new THREE.Mesh(
                new THREE.BoxGeometry(18, 0.05, 0.05), interiorWallMaterial
            ); sideDiv.position.set(0, WORLD.FLOOR_HEIGHT/2, 0); sideDiv.rotation.x = Math.PI/2; floorGroup.add(sideDiv);
        }

        // Call panel and shaft indicator
        const callPanel = createCallPanel(floorNumber);
        callPanel.position.set(1.6, 0, -0.2); floorGroup.add(callPanel);
        const shaftIndicator = createShaftIndicator(floorNumber);
        floorGroup.add(shaftIndicator);

        // Convert nodes to waypoint map
        const waypointNodes = {};
        for (const name in nodes) {
            waypointNodes[name] = nodes[name].position.clone();
            waypointNodes[name]._node = nodes[name];
        }

        floors.push({
            floorNumber, nodes: waypointNodes, callPanel, shaftIndicator,
            desks: [], sitTargets, ...lobbyOnly
        });
    }

    return {
        buildingGroup, floors,
        bfsPath: function(fromName, toName, floorNumber) {
            const floor = floors[floorNumber];
            if (!floor || !floor.nodes) return [];
            return bfsPath(floor.nodes, fromName, toName);
        },
        WORLD
    };
}
