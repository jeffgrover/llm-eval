const WORLD = {
    FLOOR_HEIGHT: 3.4, FLOOR_COUNT: 6,
    BUILDING_WIDTH: 22, BUILDING_DEPTH: 18,
    SHAFT_WIDTH: 3, SHAFT_DEPTH: 3, PERSON_R: 0.4
};

function createWorld(scene) {
    const buildingGroup = new THREE.Group();
    buildingGroup.renderOrder = 0;
    const floors = [];

    for (let f = 0; f < WORLD.FLOOR_COUNT; f++) {
        const floorData = f === 0 ? createLobbyFloor(f) : createOfficeFloor(f);
        floors.push(floorData);
        buildingGroup.add(floorData.group);
    }

    createShaft(buildingGroup);
    createOuterWalls(buildingGroup);
    scene.add(buildingGroup);

    return { buildingGroup, floors, bfsPath };
}

function createShaft(group) {
    const geo = new THREE.BoxGeometry(WORLD.SHAFT_WIDTH, WORLD.FLOOR_COUNT * WORLD.FLOOR_HEIGHT + 1, WORLD.SHAFT_DEPTH);
    const mat = new THREE.MeshBasicMaterial({ color: '#666', transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide });
    const shaft = new THREE.Mesh(geo, mat);
    shaft.position.set(0, WORLD.FLOOR_COUNT * WORLD.FLOOR_HEIGHT / 2, 0);
    group.add(shaft);
}

function createOuterWalls(group) {
    const wallMat = new THREE.MeshBasicMaterial({
        color: '#9999ff', transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide
    });
    // Front wall (z+ side) - floor 0 has entrance gap
    const frontWallParts = [
        { x: -WORLD.BUILDING_WIDTH/2 + WORLD.SHAFT_WIDTH/2, z: WORLD.BUILDING_DEPTH/2, w: WORLD.BUILDING_WIDTH/2 - WORLD.SHAFT_WIDTH/2 - 1.5, h: WORLD.FLOOR_COUNT * WORLD.FLOOR_HEIGHT },
        { x: WORLD.BUILDING_WIDTH/2 - WORLD.SHAFT_WIDTH/2, z: WORLD.BUILDING_DEPTH/2, w: WORLD.BUILDING_WIDTH/2 - WORLD.SHAFT_WIDTH/2 - 1.5, h: WORLD.FLOOR_COUNT * WORLD.FLOOR_HEIGHT },
        { x: 0, z: WORLD.BUILDING_DEPTH/2, w: 3, h: (WORLD.FLOOR_COUNT - 1) * WORLD.FLOOR_HEIGHT } // above lobby
    ];
    frontWallParts.forEach(p => {
        const geo = new THREE.BoxGeometry(p.w, p.h, 0.2);
        const mesh = new THREE.Mesh(geo, wallMat);
        mesh.position.set(p.x, p.h/2, p.z);
        group.add(mesh);
    });

    // Back wall (z- side)
    const backGeo = new THREE.BoxGeometry(WORLD.BUILDING_WIDTH, WORLD.FLOOR_COUNT * WORLD.FLOOR_HEIGHT, 0.2);
    const backWall = new THREE.Mesh(backGeo, wallMat);
    backWall.position.set(0, WORLD.FLOOR_COUNT * WORLD.FLOOR_HEIGHT/2, -WORLD.BUILDING_DEPTH/2);
    group.add(backWall);

    // Left/right walls
    ['left', 'right'].forEach(side => {
        const x = side === 'left' ? -WORLD.BUILDING_WIDTH/2 : WORLD.BUILDING_WIDTH/2;
        const geo = new THREE.BoxGeometry(0.2, WORLD.FLOOR_COUNT * WORLD.FLOOR_HEIGHT, WORLD.BUILDING_DEPTH);
        const mesh = new THREE.Mesh(geo, wallMat);
        mesh.position.set(x, WORLD.FLOOR_COUNT * WORLD.FLOOR_HEIGHT/2, 0);
        group.add(mesh);
    });
}

function createLobbyFloor(f) {
    const group = new THREE.Group();
    const floorY = f * WORLD.FLOOR_HEIGHT;
    const nodes = {};
    const sitTargets = {};

    // Floor slab
    const slabGeo = new THREE.BoxGeometry(WORLD.BUILDING_WIDTH, 0.2, WORLD.BUILDING_DEPTH);
    const slabMat = new THREE.MeshBasicMaterial({ color: '#888', transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide });
    const slab = new THREE.Mesh(slabGeo, slabMat);
    slab.position.set(0, floorY, 0);
    group.add(slab);

    // Elevator wait area
    nodes.elevWait = { pos: new THREE.Vector3(0, floorY, WORLD.SHAFT_DEPTH/2 + 1), neighbors: ['hallS', 'entrance'] };
    nodes.hallS = { pos: new THREE.Vector3(0, floorY, WORLD.SHAFT_DEPTH/2 + 2), neighbors: ['elevWait', 'hallSW', 'hallSE'] };

    // Entrance
    nodes.entrance = { pos: new THREE.Vector3(0, floorY, WORLD.BUILDING_DEPTH/2 + 1), neighbors: ['elevWait'] };
    nodes.outside = { pos: new THREE.Vector3(0, floorY, WORLD.BUILDING_DEPTH/2 + 3), neighbors: ['entrance'] };

    // Call panel
    const callPanel = createCallPanel(f);
    group.add(callPanel);

    // Shaft indicator
    const shaftIndicator = createShaftIndicator(f);
    shaftIndicator.position.set(0, floorY + 2.5, WORLD.SHAFT_DEPTH/2 + 0.1);
    group.add(shaftIndicator);

    return { floorNumber: f, group, nodes, callPanel, shaftIndicator, sitTargets, entranceSpot: 'entrance', outsideSpot: 'outside' };
}

function createOfficeFloor(f) {
    const group = new THREE.Group();
    const floorY = f * WORLD.FLOOR_HEIGHT;
    const nodes = {};
    const sitTargets = {};
    const desks = [];

    // Floor slab
    const slabGeo = new THREE.BoxGeometry(WORLD.BUILDING_WIDTH, 0.2, WORLD.BUILDING_DEPTH);
    const slabMat = new THREE.MeshBasicMaterial({ color: '#888', transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide });
    const slab = new THREE.Mesh(slabGeo, slabMat);
    slab.position.set(0, floorY, 0);
    group.add(slab);

    // Hallway ring
    const hallPositions = [
        ['hallS', 0, WORLD.SHAFT_DEPTH/2 + 2],
        ['hallSW', -WORLD.SHAFT_WIDTH, WORLD.SHAFT_DEPTH/2 + 2],
        ['hallW', -WORLD.BUILDING_WIDTH/2 + 2, 0],
        ['hallNW', -WORLD.BUILDING_WIDTH/2 + 2, -WORLD.BUILDING_DEPTH/2 + 2],
        ['hallN', 0, -WORLD.BUILDING_DEPTH/2 + 2],
        ['hallNE', WORLD.BUILDING_WIDTH/2 - 2, -WORLD.BUILDING_DEPTH/2 + 2],
        ['hallE', WORLD.BUILDING_WIDTH/2 - 2, 0],
        ['hallSE', WORLD.BUILDING_WIDTH/2 - 2, WORLD.SHAFT_DEPTH/2 + 2]
    ];
    hallPositions.forEach(([name, x, z]) => {
        nodes[name] = { pos: new THREE.Vector3(x, floorY, z), neighbors: [] };
    });
    // Link hallway nodes
    const hallOrder = ['hallS', 'hallSE', 'hallE', 'hallNE', 'hallN', 'hallNW', 'hallW', 'hallSW'];
    for (let i = 0; i < hallOrder.length; i++) {
        const curr = hallOrder[i];
        const next = hallOrder[(i+1)%hallOrder.length];
        nodes[curr].neighbors.push(next);
        nodes[next].neighbors.push(curr);
    }
    nodes.hallS.neighbors.push('elevWait');
    nodes.elevWait = { pos: new THREE.Vector3(0, floorY, WORLD.SHAFT_DEPTH/2 + 1), neighbors: ['hallS'] };

    // Desks (4 private offices)
    const officeConfigs = [
        { name: 'A', x: -8, z: -6, door: 'officeA_door', desk: 'officeA_desk' },
        { name: 'B', x: -4, z: -6, door: 'officeB_door', desk: 'officeB_desk' },
        { name: 'C', x: 4, z: -6, door: 'officeC_door', desk: 'officeC_desk' },
        { name: 'D', x: 8, z: -6, door: 'officeD_door', desk: 'officeD_desk' }
    ];
    officeConfigs.forEach(cfg => {
        nodes[cfg.door] = { pos: new THREE.Vector3(cfg.x, floorY, -3), neighbors: [cfg.desk, 'hall' + cfg.name[0]] };
        nodes[cfg.desk] = { pos: new THREE.Vector3(cfg.x, floorY, -4.5), neighbors: [cfg.door] };
        sitTargets[cfg.desk] = { sit: true, facing: Math.PI };
        desks.push({ id: cfg.name, doorWp: cfg.door, deskWp: cfg.desk });
    });

    // Conference room (front-left)
    nodes.conf_door = { pos: new THREE.Vector3(-8, floorY, 3), neighbors: ['hallSW', 'conf_center'] };
    nodes.conf_center = { pos: new THREE.Vector3(-6, floorY, 6), neighbors: ['conf_door', 'conf_seat0', 'conf_seat1', 'conf_seat2', 'conf_seat3'] };
    for (let i=0; i<4; i++) {
        nodes[`conf_seat${i}`] = { pos: new THREE.Vector3(-6 + (i%2)*3, floorY, 5 + (i<2?1:-1)), neighbors: ['conf_center'] };
        sitTargets[`conf_seat${i}`] = { sit: true, facing: i<2 ? Math.PI/2 : -Math.PI/2 };
    }

    // Lounge (front-right)
    nodes.lounge_door = { pos: new THREE.Vector3(8, floorY, 3), neighbors: ['hallSE', 'lounge_center'] };
    nodes.lounge_center = { pos: new THREE.Vector3(6, floorY, 6), neighbors: ['lounge_door', 'lounge_spot0', 'lounge_spot1', 'lounge_spot2'] };
    for (let i=0; i<3; i++) {
        nodes[`lounge_spot${i}`] = { pos: new THREE.Vector3(6 + (i-1)*2, floorY, 5), neighbors: ['lounge_center'] };
        sitTargets[`lounge_spot${i}`] = { sit: true, facing: Math.PI };
    }

    // Call panel and shaft indicator
    const callPanel = createCallPanel(f);
    group.add(callPanel);
    const shaftIndicator = createShaftIndicator(f);
    shaftIndicator.position.set(0, floorY + 2.5, WORLD.SHAFT_DEPTH/2 + 0.1);
    group.add(shaftIndicator);

    return { floorNumber: f, group, nodes, callPanel, shaftIndicator, desks, sitTargets };
}

function createCallPanel(floor) {
    const panel = new THREE.Group();
    const plateGeo = new THREE.BoxGeometry(0.55, 1.4, 0.05);
    const plateMat = new THREE.MeshBasicMaterial({ color: '#333' });
    const plate = new THREE.Mesh(plateGeo, plateMat);
    panel.add(plate);

    // Up arrow
    const upShape = new THREE.Shape();
    upShape.moveTo(0, 0.13); upShape.lineTo(-0.13, -0.13); upShape.lineTo(0.13, -0.13); upShape.closePath();
    const upGeo = new THREE.ShapeGeometry(upShape);
    const upMatDefault = new THREE.MeshBasicMaterial({ color: '#444' });
    const upMatActive = new THREE.MeshBasicMaterial({ color: '#0f0', emissive: '#0f0' });
    const upArrow = new THREE.Mesh(upGeo, upMatDefault);
    upArrow.position.set(-0.15, 0.3, 0.03);
    panel.add(upArrow);

    // Down arrow
    const downShape = new THREE.Shape();
    downShape.moveTo(0, -0.13); downShape.lineTo(-0.13, 0.13); downShape.lineTo(0.13, 0.13); downShape.closePath();
    const downGeo = new THREE.ShapeGeometry(downShape);
    const downMatDefault = new THREE.MeshBasicMaterial({ color: '#444' });
    const downMatActive = new THREE.MeshBasicMaterial({ color: '#0f0', emissive: '#0f0' });
    const downArrow = new THREE.Mesh(downGeo, downMatDefault);
    downArrow.position.set(-0.15, -0.3, 0.03);
    panel.add(downArrow);

    // Floor indicator
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const tex = new THREE.CanvasTexture(canvas);
    const indicatorGeo = new THREE.PlaneGeometry(0.45, 0.45);
    const indicatorMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
    const indicator = new THREE.Mesh(indicatorGeo, indicatorMat);
    indicator.position.set(0.15, 0, 0.03);
    panel.add(indicator);

    panel.userData = {
        setUp: (on) => { upArrow.material = on ? upMatActive : upMatDefault; },
        setDown: (on) => { downArrow.material = on ? downMatActive : downMatDefault; },
        setIndicator: (text) => {
            if (panel.userData._lastText === text) return;
            panel.userData._lastText = text;
            ctx.clearRect(0,0,256,256);
            ctx.fillStyle = '#050505'; ctx.fillRect(0,0,256,256);
            ctx.font = 'bold 200px monospace'; ctx.fillStyle = '#ffbb22';
            ctx.shadowColor = '#ffbb22'; ctx.shadowBlur = 10;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(text, 128, 128);
            tex.needsUpdate = true;
        },
        _lastText: null
    };
    panel.userData.setIndicator(String(floor));

    // Position panel next to shaft
    const y = floor * WORLD.FLOOR_HEIGHT + 1.5;
    panel.position.set(WORLD.SHAFT_WIDTH/2 + 0.3, y, 0);
    return panel;
}

function createShaftIndicator(floor) {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const tex = new THREE.CanvasTexture(canvas);
    const geo = new THREE.PlaneGeometry(0.9, 0.9);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData = {
        setText: (text) => {
            if (mesh.userData._lastText === text) return;
            mesh.userData._lastText = text;
            ctx.clearRect(0,0,256,256);
            ctx.fillStyle = '#050505'; ctx.fillRect(0,0,256,256);
            ctx.font = 'bold 200px monospace'; ctx.fillStyle = '#ffbb22';
            ctx.shadowColor = '#ffbb22'; ctx.shadowBlur = 10;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(text, 128, 128);
            tex.needsUpdate = true;
        },
        _lastText: null
    };
    mesh.userData.setText(String(floor));
    return mesh;
}

function bfsPath(nodes, fromName, toName) {
    if (!nodes[fromName] || !nodes[toName]) return [];
    const queue = [fromName];
    const visited = new Set([fromName]);
    const parent = new Map();
    while (queue.length) {
        const curr = queue.shift();
        if (curr === toName) {
            const path = [];
            let node = toName;
            while (node) { path.unshift(nodes[node].pos.clone()); node = parent.get(node); }
            return path;
        }
        for (const neighbor of nodes[curr].neighbors) {
            if (!visited.has(neighbor)) {
                visited.add(neighbor);
                parent.set(neighbor, curr);
                queue.push(neighbor);
            }
        }
    }
    return [];
}

window.createWorld = createWorld;
window.bfsPath = bfsPath;
