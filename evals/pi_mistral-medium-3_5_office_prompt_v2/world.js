// World / Building geometry, per-floor layouts, navigation graph, call panels

const WORLD = {
    FLOOR_HEIGHT: 3.4,
    FLOOR_COUNT: 6,
    BUILDING_WIDTH: 22,
    BUILDING_DEPTH: 18,
    SHAFT_WIDTH: 3,
    SHAFT_DEPTH: 3,
    PERSON_R: 0.4
};

// Color constants
const COLORS = {
    ground: 0x333333,
    roof: 0x444444,
    wallOuter: 0x9999ff,
    wallInner: 0xbbc5e6,
    floorSlab: 0x555555,
    shaftEdge: 0x333333
};

// Material cache
const materials = {};

function getMaterial(key, color, opacity, depthWrite) {
    const cacheKey = `${key}_${opacity}_${depthWrite}`;
    if (materials[cacheKey]) return materials[cacheKey];
    
    const mat = new THREE.MeshStandardMaterial({
        color: color,
        transparent: true,
        opacity: opacity,
        depthWrite: depthWrite || false,
        side: THREE.DoubleSide,
        roughness: 0.7,
        metalness: 0.1
    });
    materials[cacheKey] = mat;
    return mat;
}

// Opaque materials
function getOpaqueMaterial(color) {
    const key = `opaque_${color}`;
    if (materials[key]) return materials[key];
    const mat = new THREE.MeshStandardMaterial({
        color: color,
        roughness: 0.7,
        metalness: 0.1
    });
    materials[key] = mat;
    return mat;
}

// Canvas texture helper for floor indicators
function createTextTexture(initialText, fontSize = 64) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    
    // Near-black background
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.font = `bold ${fontSize}px Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffbb22';
    ctx.shadowColor = '#ffbb22';
    ctx.shadowBlur = 8;
    
    const metrics = ctx.measureText(initialText);
    const scale = Math.min(0.82, 200 / metrics.width);
    ctx.save();
    ctx.scale(scale, scale);
    ctx.fillText(initialText, canvas.width / (2 * scale), canvas.height / (2 * scale));
    ctx.restore();
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.anisotropy = 4;
    texture._lastText = initialText;
    
    return { canvas, ctx, texture };
}

function updateTextTexture(texObj, text) {
    if (texObj.texture._lastText === text) return;
    texObj.texture._lastText = text;
    
    const ctx = texObj.ctx;
    const canvas = texObj.canvas;
    
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = '#ffbb22';
    ctx.shadowColor = '#ffbb22';
    ctx.shadowBlur = 8;
    
    const fontSize = 64;
    ctx.font = `bold ${fontSize}px Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    const metrics = ctx.measureText(text);
    const scale = Math.min(0.82, 200 / metrics.width);
    ctx.save();
    ctx.scale(scale, scale);
    ctx.fillText(text, canvas.width / (2 * scale), canvas.height / (2 * scale));
    ctx.restore();
    
    texObj.texture.needsUpdate = true;
}

// Create arrow geometry for call panel buttons
function createArrowGeometry(width, height) {
    const shape = new THREE.Shape();
    shape.moveTo(0, height / 2);
    shape.lineTo(width / 2, -height / 2);
    shape.lineTo(-width / 2, -height / 2);
    shape.lineTo(0, height / 2);
    return new THREE.ShapeGeometry(shape);
}

// Create a call panel
function createCallPanel(floorNumber) {
    const group = new THREE.Group();
    group.position.set(WORLD.SHAFT_WIDTH / 2 + 0.1, floorNumber * WORLD.FLOOR_HEIGHT, 0);
    
    // Panel base
    const panelWidth = 0.55;
    const panelHeight = 1.4;
    const panelDepth = 0.05;
    const panel = new THREE.Mesh(
        new THREE.BoxGeometry(panelWidth, panelHeight, panelDepth),
        getOpaqueMaterial(0x222222)
    );
    group.add(panel);
    
    // Up arrow
    const upArrowGeom = createArrowGeometry(0.26, 0.3);
    const upArrowMatOn = new THREE.MeshStandardMaterial({ 
        color: 0x00ff00, 
        emissive: 0x00ff00, 
        emissiveIntensity: 0.8 
    });
    const upArrowMatOff = new THREE.MeshStandardMaterial({ color: 0x333333 });
    const upArrow = new THREE.Mesh(upArrowGeom, upArrowMatOff);
    upArrow.position.set(0, 0.35, panelDepth / 2 + 0.01);
    upArrow.rotation.x = -Math.PI / 2;
    group.add(upArrow);
    
    // Down arrow
    const downArrow = new THREE.Mesh(upArrowGeom, upArrowMatOff.clone());
    downArrow.position.set(0, -0.35, panelDepth / 2 + 0.01);
    downArrow.rotation.x = Math.PI / 2;
    group.add(downArrow);
    
    // Floor indicator
    const indicatorSize = 0.45;
    const texObj = createTextTexture(floorNumber.toString());
    const indicator = new THREE.Mesh(
        new THREE.PlaneGeometry(indicatorSize, indicatorSize),
        new THREE.MeshBasicMaterial({ map: texObj.texture, transparent: true })
    );
    indicator.position.set(0, 0, panelDepth / 2 + 0.02);
    group.add(indicator);
    
    group.userData = {
        setUp: function(on) {
            upArrow.material = on ? upArrowMatOn : upArrowMatOff.clone();
        },
        setDown: function(on) {
            downArrow.material = on ? upArrowMatOn.clone() : upArrowMatOff.clone();
        },
        setIndicator: function(text) {
            updateTextTexture(texObj, text);
        }
    };
    
    return group;
}

// Create shaft indicator (above doors, showing car floor and direction)
function createShaftIndicator() {
    const group = new THREE.Group();
    group.position.set(0, 0, WORLD.SHAFT_DEPTH / 2 + 0.1);
    
    const texObj = createTextTexture('0');
    const indicator = new THREE.Mesh(
        new THREE.PlaneGeometry(0.9, 0.9),
        new THREE.MeshBasicMaterial({ map: texObj.texture, transparent: true })
    );
    group.add(indicator);
    
    group.userData = {
        setText: function(text) {
            updateTextTexture(texObj, text);
        }
    };
    
    return group;
}

// Create in-car indicator
function createInCarIndicator() {
    const texObj = createTextTexture('0');
    const indicator = new THREE.Mesh(
        new THREE.PlaneGeometry(0.6, 0.6),
        new THREE.MeshBasicMaterial({ map: texObj.texture, transparent: true })
    );
    indicator.position.set(0, 0.8, -1.4);
    indicator.rotation.x = -Math.PI / 2;
    
    indicator.userData = {
        setText: function(text) {
            updateTextTexture(texObj, text);
        }
    };
    
    return indicator;
}

// Create furniture helpers
function createDesk() {
    const group = new THREE.Group();
    
    // Desk surface
    const deskTop = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 0.05, 0.6),
        getOpaqueMaterial(0x4a3a2a)
    );
    deskTop.position.y = 0.75;
    group.add(deskTop);
    
    // Desk legs
    const legGeom = new THREE.BoxGeometry(0.1, 0.7, 0.1);
    const legMat = getOpaqueMaterial(0x333333);
    
    const leg1 = new THREE.Mesh(legGeom, legMat);
    leg1.position.set(-0.5, 0.35, -0.25);
    group.add(leg1);
    
    const leg2 = new THREE.Mesh(legGeom, legMat);
    leg2.position.set(0.5, 0.35, -0.25);
    group.add(leg2);
    
    const leg3 = new THREE.Mesh(legGeom, legMat);
    leg3.position.set(-0.5, 0.35, 0.25);
    group.add(leg3);
    
    const leg4 = new THREE.Mesh(legGeom, legMat);
    leg4.position.set(0.5, 0.35, 0.25);
    group.add(leg4);
    
    // Monitor
    const monitor = new THREE.Mesh(
        new THREE.BoxGeometry(0.4, 0.35, 0.03),
        getOpaqueMaterial(0x222222)
    );
    monitor.position.set(0, 0.75 + 0.175, -0.55);
    group.add(monitor);
    
    // Monitor stand
    const monitorStand = new THREE.Mesh(
        new THREE.BoxGeometry(0.15, 0.15, 0.15),
        getOpaqueMaterial(0x444444)
    );
    monitorStand.position.set(0, 0.675, -0.55);
    group.add(monitorStand);
    
    return group;
}

function createChair() {
    const group = new THREE.Group();
    
    // Seat
    const seat = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.1, 0.5),
        getOpaqueMaterial(0x3a2a1a)
    );
    seat.position.y = 0.5;
    group.add(seat);
    
    // Backrest
    const backrest = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.4, 0.1),
        getOpaqueMaterial(0x3a2a11)
    );
    backrest.position.set(0, 0.75, -0.2);
    group.add(backrest);
    
    // Legs
    const legGeom = new THREE.BoxGeometry(0.08, 0.45, 0.08);
    const legMat = getOpaqueMaterial(0x333333);
    
    const leg1 = new THREE.Mesh(legGeom, legMat);
    leg1.position.set(-0.2, 0.25, -0.2);
    group.add(leg1);
    
    const leg2 = new THREE.Mesh(legGeom, legMat);
    leg2.position.set(0.2, 0.25, -0.2);
    group.add(leg2);
    
    const leg3 = new THREE.Mesh(legGeom, legMat);
    leg3.position.set(-0.2, 0.25, 0.2);
    group.add(leg3);
    
    const leg4 = new THREE.Mesh(legGeom, legMat);
    leg4.position.set(0.2, 0.25, 0.2);
    group.add(leg4);
    
    return group;
}

function createCouch() {
    const group = new THREE.Group();
    
    // Base
    const base = new THREE.Mesh(
        new THREE.BoxGeometry(1.8, 0.2, 0.8),
        getOpaqueMaterial(0x4a3a2a)
    );
    base.position.y = 0.4;
    group.add(base);
    
    // Backrest
    const backrest = new THREE.Mesh(
        new THREE.BoxGeometry(1.8, 0.5, 0.15),
        getOpaqueMaterial(0x4a3a2a)
    );
    backrest.position.set(0, 0.65, -0.35);
    group.add(backrest);
    
    // Armrests
    const armrestGeom = new THREE.BoxGeometry(0.2, 0.15, 0.8);
    const armrestMat = getOpaqueMaterial(0x4a3a2a);
    
    const leftArmrest = new THREE.Mesh(armrestGeom, armrestMat);
    leftArmrest.position.set(-0.85, 0.5, 0);
    group.add(leftArmrest);
    
    const rightArmrest = new THREE.Mesh(armrestGeom, armrestMat);
    rightArmrest.position.set(0.85, 0.5, 0);
    group.add(rightArmrest);
    
    // Legs
    const legGeom = new THREE.BoxGeometry(0.1, 0.35, 0.1);
    const legMat = getOpaqueMaterial(0x333333);
    
    for (let x = -0.7; x <= 0.7; x += 0.7) {
        for (let z = -0.3; z <= 0.3; z += 0.3) {
            const leg = new THREE.Mesh(legGeom, legMat);
            leg.position.set(x, 0.2, z);
            group.add(leg);
        }
    }
    
    return group;
}

function createTable(width = 1.2, depth = 0.6, height = 0.75) {
    const group = new THREE.Group();
    
    // Table top
    const top = new THREE.Mesh(
        new THREE.BoxGeometry(width, 0.05, depth),
        getOpaqueMaterial(0x5a4a3a)
    );
    top.position.y = height;
    group.add(top);
    
    // Legs
    const legGeom = new THREE.BoxGeometry(0.1, height - 0.05, 0.1);
    const legMat = getOpaqueMaterial(0x444444);
    
    const leg1 = new THREE.Mesh(legGeom, legMat);
    leg1.position.set(-width / 2 + 0.1, (height - 0.05) / 2, -depth / 2 + 0.1);
    group.add(leg1);
    
    const leg2 = new THREE.Mesh(legGeom, legMat);
    leg2.position.set(width / 2 - 0.1, (height - 0.05) / 2, -depth / 2 + 0.1);
    group.add(leg2);
    
    const leg3 = new THREE.Mesh(legGeom, legMat);
    leg3.position.set(-width / 2 + 0.1, (height - 0.05) / 2, depth / 2 - 0.1);
    group.add(leg3);
    
    const leg4 = new THREE.Mesh(legGeom, legMat);
    leg4.position.set(width / 2 - 0.1, (height - 0.05) / 2, depth / 2 - 0.1);
    group.add(leg4);
    
    return group;
}

function createWaterCooler() {
    const group = new THREE.Group();
    
    // Main body
    const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.2, 1.0, 16),
        getOpaqueMaterial(0xffffff)
    );
    body.position.y = 0.5;
    body.rotation.x = Math.PI / 2;
    group.add(body);
    
    // Top reservoir
    const reservoir = new THREE.Mesh(
        new THREE.CylinderGeometry(0.25, 0.25, 0.3, 16),
        getOpaqueMaterial(0xffffff)
    );
    reservoir.position.y = 1.15;
    reservoir.rotation.x = Math.PI / 2;
    group.add(reservoir);
    
    // Spout
    const spout = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.03, 0.15, 8),
        getOpaqueMaterial(0xcccccc)
    );
    spout.position.set(0.25, 0.85, 0);
    spout.rotation.z = -Math.PI / 4;
    group.add(spout);
    
    // Drip tray
    const tray = new THREE.Mesh(
        new THREE.BoxGeometry(0.4, 0.05, 0.3),
        getOpaqueMaterial(0x888888)
    );
    tray.position.y = 0.15;
    group.add(tray);
    
    return group;
}

function createCoffeeMachine() {
    const group = new THREE.Group();
    
    // Main body
    const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.6, 0.8, 0.5),
        getOpaqueMaterial(0x333333)
    );
    body.position.y = 0.4;
    group.add(body);
    
    // Water tank
    const tank = new THREE.Mesh(
        new THREE.CylinderGeometry(0.15, 0.15, 0.3, 16),
        getOpaqueMaterial(0xffffff)
    );
    tank.position.set(0.2, 0.75, 0);
    tank.rotation.x = Math.PI / 2;
    group.add(tank);
    
    // Control panel
    const panel = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.15, 0.05),
        getOpaqueMaterial(0x222222)
    );
    panel.position.set(0, 0.5, 0.26);
    group.add(panel);
    
    // Carafe
    const carafe = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.1, 0.25, 16),
        new THREE.MeshStandardMaterial({ 
            color: 0x444444, 
            transparent: true, 
            opacity: 0.7,
            depthWrite: false,
            side: THREE.DoubleSide
        })
    );
    carafe.position.set(-0.2, 0.35, 0);
    carafe.rotation.x = Math.PI / 2;
    group.add(carafe);
    
    return group;
}

function createPastryDisplay() {
    const group = new THREE.Group();
    
    // Display case
    const caseBody = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 0.1, 0.4),
        getOpaqueMaterial(0xffffff)
    );
    caseBody.position.y = 0.75;
    group.add(caseBody);
    
    // Glass dome
    const dome = new THREE.Mesh(
        new THREE.SphereGeometry(0.45, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshStandardMaterial({ 
            color: 0xccccff, 
            transparent: true, 
            opacity: 0.3,
            depthWrite: false,
            side: THREE.DoubleSide
        })
    );
    dome.position.y = 0.75 + 0.45;
    dome.rotation.x = Math.PI / 2;
    group.add(dome);
    
    // Base
    const base = new THREE.Mesh(
        new THREE.BoxGeometry(0.85, 0.65, 0.45),
        getOpaqueMaterial(0x4a4a4a)
    );
    base.position.y = 0.375;
    group.add(base);
    
    return group;
}

function createReceptionDesk() {
    const group = new THREE.Group();
    
    // Counter
    const counter = new THREE.Mesh(
        new THREE.BoxGeometry(2.0, 0.08, 0.8),
        getOpaqueMaterial(0x5a4a3a)
    );
    counter.position.y = 0.75;
    group.add(counter);
    
    // Front panel
    const panel = new THREE.Mesh(
        new THREE.BoxGeometry(2.0, 0.6, 0.1),
        getOpaqueMaterial(0x4a3a2a)
    );
    panel.position.set(0, 0.35, -0.45);
    group.add(panel);
    
    // Computer on desk
    const computer = new THREE.Mesh(
        new THREE.BoxGeometry(0.4, 0.03, 0.35),
        getOpaqueMaterial(0x222222)
    );
    computer.position.set(0, 0.78, 0);
    group.add(computer);
    
    // Monitor
    const monitor = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 0.25, 0.03),
        getOpaqueMaterial(0x222222)
    );
    monitor.position.set(0, 0.78 + 0.125, 0.2);
    group.add(monitor);
    
    // Chair for receptionist
    const chair = createChair();
    chair.position.set(0, 0, -0.6);
    chair.rotation.y = Math.PI;
    group.add(chair);
    
    return group;
}

function createInfoKiosk() {
    const group = new THREE.Group();
    
    // Main body
    const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.4, 1.4, 0.3),
        getOpaqueMaterial(0x333333)
    );
    body.position.y = 0.7;
    group.add(body);
    
    // Screen
    const screen = new THREE.Mesh(
        new THREE.BoxGeometry(0.35, 0.8, 0.03),
        new THREE.MeshBasicMaterial({ color: 0x00aaff })
    );
    screen.position.set(0, 0.7, 0.16);
    group.add(screen);
    
    // Base
    const base = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.1, 0.4),
        getOpaqueMaterial(0x444444)
    );
    base.position.y = 0.05;
    group.add(base);
    
    return group;
}

function createPottedPlant() {
    const group = new THREE.Group();
    
    // Pot
    const pot = new THREE.Mesh(
        new THREE.CylinderGeometry(0.25, 0.3, 0.3, 16),
        getOpaqueMaterial(0x4a3a2a)
    );
    pot.position.y = 0.15;
    pot.rotation.x = Math.PI / 2;
    group.add(pot);
    
    // Plant - multiple layers of leaves
    const leafMat = new THREE.MeshStandardMaterial({ 
        color: 0x228822, 
        side: THREE.DoubleSide
    });
    
    for (let i = 0; i < 5; i++) {
        const radius = 0.4 - i * 0.06;
        const height = 0.3 + i * 0.15;
        const leaf = new THREE.Mesh(
            new THREE.TorusGeometry(radius, 0.08, 8, 16),
            leafMat
        );
        leaf.position.y = height;
        leaf.rotation.x = Math.PI / 2 + (i % 2 === 0 ? 0.2 : -0.2);
        group.add(leaf);
    }
    
    return group;
}

function createBistroTable() {
    const group = new THREE.Group();
    
    // Table top (round)
    const top = new THREE.Mesh(
        new THREE.CylinderGeometry(0.4, 0.4, 0.05, 16),
        getOpaqueMaterial(0x5a4a3a)
    );
    top.position.y = 0.75;
    top.rotation.x = Math.PI / 2;
    group.add(top);
    
    // Leg
    const leg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.08, 0.7, 16),
        getOpaqueMaterial(0x444444)
    );
    leg.position.y = 0.35;
    leg.rotation.x = Math.PI / 2;
    group.add(leg);
    
    // Base
    const base = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.2, 0.1, 16),
        getOpaqueMaterial(0x444444)
    );
    base.position.y = 0.05;
    base.rotation.x = Math.PI / 2;
    group.add(base);
    
    return group;
}

// BFS pathfinding
function bfsPath(nodes, fromName, toName) {
    if (fromName === toName) {
        const node = nodes[fromName];
        return node ? [node.position.clone()] : [];
    }
    
    const queue = [{ name: fromName, path: [] }];
    const visited = new Set([fromName]);
    
    while (queue.length > 0) {
        const current = queue.shift();
        const currentNode = nodes[current.name];
        
        if (!currentNode) continue;
        
        for (const neighborName of currentNode.neighbors) {
            if (visited.has(neighborName)) continue;
            
            if (neighborName === toName) {
                const fullPath = [...current.path, currentNode.position.clone(), nodes[neighborName].position.clone()];
                return fullPath;
            }
            
            visited.add(neighborName);
            queue.push({ 
                name: neighborName, 
                path: [...current.path, currentNode.position.clone()] 
            });
        }
    }
    
    // Fallback: direct line if no path found
    const fromNode = nodes[fromName];
    const toNode = nodes[toName];
    if (fromNode && toNode) {
        return [fromNode.position.clone(), toNode.position.clone()];
    }
    return [];
}

// Build navigation graph for a floor
function buildFloorGraph(floorNumber, isLobby) {
    const nodes = {};
    const shaftX = 0;
    const shaftZ = 0;
    const shaftHalfW = WORLD.SHAFT_WIDTH / 2;
    const shaftHalfD = WORLD.SHAFT_DEPTH / 2;
    
    const floorY = floorNumber * WORLD.FLOOR_HEIGHT;
    const hallRadius = 2.5;
    
    // Hallway ring around shaft
    const hallPositions = {
        hallS: new THREE.Vector3(0, floorY, -shaftHalfD - 0.5),
        hallSE: new THREE.Vector3(shaftHalfW + 0.5, floorY, -shaftHalfD - 0.5),
        hallE: new THREE.Vector3(shaftHalfW + hallRadius, floorY, 0),
        hallNE: new THREE.Vector3(shaftHalfW + 0.5, floorY, shaftHalfD + 0.5),
        hallN: new THREE.Vector3(0, floorY, shaftHalfD + hallRadius),
        hallNW: new THREE.Vector3(-shaftHalfW - 0.5, floorY, shaftHalfD + 0.5),
        hallW: new THREE.Vector3(-shaftHalfW - hallRadius, floorY, 0),
        hallSW: new THREE.Vector3(-shaftHalfW - 0.5, floorY, -shaftHalfD - 0.5)
    };
    
    // Add hallway nodes
    for (const [name, pos] of Object.entries(hallPositions)) {
        nodes[name] = { position: pos, neighbors: [] };
    }
    
    // Connect hallway ring
    nodes.hallS.neighbors.push('hallSE');
    nodes.hallSE.neighbors.push('hallS', 'hallE');
    nodes.hallE.neighbors.push('hallSE', 'hallNE');
    nodes.hallNE.neighbors.push('hallE', 'hallN');
    nodes.hallN.neighbors.push('hallNE', 'hallNW');
    nodes.hallNW.neighbors.push('hallN', 'hallW');
    nodes.hallW.neighbors.push('hallNW', 'hallSW');
    nodes.hallSW.neighbors.push('hallW', 'hallS');
    
    // Elevator waiting area
    const elevWaitPos = new THREE.Vector3(0, floorY, -shaftHalfD - 1.0);
    nodes.elevWait = { position: elevWaitPos, neighbors: ['hallS'] };
    nodes.hallS.neighbors.push('elevWait');
    
    if (isLobby) {
        // Lobby-specific nodes
        // Entrance
        const entrancePos = new THREE.Vector3(0, floorY, 9);
        nodes.entrance = { position: entrancePos, neighbors: ['elevWait', 'hallS'] };
        nodes.elevWait.neighbors.push('entrance');
        
        // Outside (sidewalk)
        const outsidePos = new THREE.Vector3(0, floorY, 12);
        nodes.outside = { position: outsidePos, neighbors: ['entrance'] };
        nodes.entrance.neighbors.push('outside');
        
        // Cafe area
        const cafeDoorPos = new THREE.Vector3(-8, floorY, 6);
        nodes.cafe_door = { position: cafeDoorPos, neighbors: ['hallSW'] };
        nodes.hallSW.neighbors.push('cafe_door');
        
        const cafeCenterPos = new THREE.Vector3(-10, floorY, 6);
        nodes.cafe_center = { position: cafeCenterPos, neighbors: ['cafe_door'] };
        nodes.cafe_door.neighbors.push('cafe_center');
        
        // Cafe order point
        const cafeOrderPos = new THREE.Vector3(-11.5, floorY, 8.5);
        nodes.cafe_order = { position: cafeOrderPos, neighbors: ['cafe_center'] };
        nodes.cafe_center.neighbors.push('cafe_order');
        
        // Bistro tables
        for (let i = 0; i < 4; i++) {
            const x = -11 + i * 3.5;
            const z = 4;
            const tablePos = new THREE.Vector3(x, floorY, z);
            nodes[`bistro_table_${i}`] = { position: tablePos, neighbors: ['cafe_center'] };
            nodes.cafe_center.neighbors.push(`bistro_table_${i}`);
            
            // Chairs around table
            for (let c = 0; c < 2; c++) {
                const chairPos = new THREE.Vector3(x + (c === 0 ? -0.6 : 0.6), floorY, z);
                nodes[`bistro_chair_${i}_${c}`] = { 
                    position: chairPos, 
                    neighbors: [`bistro_table_${i}`],
                    sit: true,
                    facing: c === 0 ? Math.PI : 0
                };
                nodes[`bistro_table_${i}`].neighbors.push(`bistro_chair_${i}_${c}`);
            }
        }
        
        // Front lounge
        const loungeDoorPos = new THREE.Vector3(8, floorY, 6);
        nodes.lounge_door = { position: loungeDoorPos, neighbors: ['hallSE'] };
        nodes.hallSE.neighbors.push('lounge_door');
        
        const loungeCenterPos = new THREE.Vector3(10, floorY, 6);
        nodes.lounge_center = { position: loungeCenterPos, neighbors: ['lounge_door'] };
        nodes.lounge_door.neighbors.push('lounge_center');
        
        // Lounge spots
        const loungeSpots = [
            { name: 'lounge_spot0', x: 11.5, z: 5, facing: -Math.PI / 2 },
            { name: 'lounge_spot1', x: 11.5, z: 7, facing: -Math.PI / 2 },
            { name: 'lounge_spot2', x: 8.5, z: 5, facing: Math.PI / 2 }
        ];
        for (const spot of loungeSpots) {
            nodes[spot.name] = { 
                position: new THREE.Vector3(spot.x, floorY, spot.z),
                neighbors: ['lounge_center'],
                sit: true,
                facing: spot.facing
            };
            nodes.lounge_center.neighbors.push(spot.name);
        }
        
        // Back lounge
        const backLoungeNPos = new THREE.Vector3(-6, floorY, -6);
        nodes.back_lounge_N = { 
            position: backLoungeNPos, 
            neighbors: ['hallW'],
            sit: true,
            facing: 0
        };
        nodes.hallW.neighbors.push('back_lounge_N');
        
        const backLoungeSPos = new THREE.Vector3(-6, floorY, -8);
        nodes.back_lounge_S = { 
            position: backLoungeSPos,
            neighbors: ['hallW'],
            sit: true,
            facing: Math.PI
        };
        nodes.hallW.neighbors.push('back_lounge_S');
        
        // Conversation pit
        const pitCenterPos = new THREE.Vector3(-10, floorY, -6);
        nodes.pit_center = { position: pitCenterPos, neighbors: ['hallNW'] };
        nodes.hallNW.neighbors.push('pit_center');
        
        const pitSpots = [
            { name: 'pit_N', x: -10, z: -4.5, facing: 0 },
            { name: 'pit_S', x: -10, z: -7.5, facing: Math.PI },
            { name: 'pit_E', x: -8.5, z: -6, facing: -Math.PI / 2 },
            { name: 'pit_W', x: -11.5, z: -6, facing: Math.PI / 2 }
        ];
        for (const spot of pitSpots) {
            nodes[spot.name] = { 
                position: new THREE.Vector3(spot.x, floorY, spot.z),
                neighbors: ['pit_center'],
                sit: true,
                facing: spot.facing
            };
            nodes.pit_center.neighbors.push(spot.name);
        }
        
        // Water coolers
        const wcFrontPos = new THREE.Vector3(7, floorY, 8);
        nodes.lobby_wc_front = { 
            position: wcFrontPos, 
            neighbors: ['lounge_center'],
            sit: false,
            facing: 0
        };
        nodes.lounge_center.neighbors.push('lobby_wc_front');
        
        const wcBackPos = new THREE.Vector3(-7, floorY, -5);
        nodes.lobby_wc_back = { 
            position: wcBackPos,
            neighbors: ['hallW'],
            sit: false,
            facing: Math.PI
        };
        nodes.hallW.neighbors.push('lobby_wc_back');
        
        // Reception
        const receptionPos = new THREE.Vector3(-3, floorY, 8.5);
        nodes.reception = { 
            position: receptionPos,
            neighbors: ['entrance'],
            sit: false,
            facing: -Math.PI / 2
        };
        nodes.entrance.neighbors.push('reception');
        
        // Kiosk
        const kioskPos = new THREE.Vector3(3, floorY, 8.5);
        nodes.kiosk = { 
            position: kioskPos,
            neighbors: ['entrance'],
            sit: false,
            facing: Math.PI / 2
        };
        nodes.entrance.neighbors.push('kiosk');
        
        // Generic loiter waypoints
        const loiterSpots = [
            { name: 'lobby_stand_center', x: 0, z: 3 },
            { name: 'lobby_stand_NE', x: 5, z: 5 },
            { name: 'lobby_stand_NW', x: -5, z: 5 },
            { name: 'lobby_stand_midE', x: 8, z: 1 },
            { name: 'lobby_stand_midW', x: -8, z: 1 },
            { name: 'lobby_stand_entry', x: 0, z: 7 }
        ];
        for (const spot of loiterSpots) {
            nodes[spot.name] = { 
                position: new THREE.Vector3(spot.x, floorY, spot.z),
                neighbors: ['entrance'],
                sit: false,
                facing: 0
            };
            nodes.entrance.neighbors.push(spot.name);
        }
    } else {
        // Office floor - identical for floors 1-5
        const officeBackZ = -8;
        const officeDepth = 2.5;
        const officeWidth = 4;
        
        // Office doors
        const officeDoors = [
            { name: 'officeA_door', x: -8, z: officeBackZ + officeDepth / 2 },
            { name: 'officeB_door', x: -3, z: officeBackZ + officeDepth / 2 },
            { name: 'officeC_door', x: 3, z: officeBackZ + officeDepth / 2 },
            { name: 'officeD_door', x: 8, z: officeBackZ + officeDepth / 2 }
        ];
        
        for (const door of officeDoors) {
            nodes[door.name] = { 
                position: new THREE.Vector3(door.x, floorY, door.z),
                neighbors: ['hallN']
            };
            nodes.hallN.neighbors.push(door.name);
            
            // Desk inside office
            const deskPos = new THREE.Vector3(door.x, floorY, door.z - 1.5);
            nodes[`${door.name.replace('door', 'desk')}`] = { 
                position: deskPos,
                neighbors: [door.name],
                sit: true,
                facing: Math.PI  // Face the desk (monitor)
            };
            nodes[door.name].neighbors.push(`${door.name.replace('door', 'desk')}`);
        }
        
        // Conference room
        const confDoorPos = new THREE.Vector3(-7, floorY, 6);
        nodes.conf_door = { position: confDoorPos, neighbors: ['hallSW'] };
        nodes.hallSW.neighbors.push('conf_door');
        
        const confCenterPos = new THREE.Vector3(-5, floorY, 6);
        nodes.conf_center = { position: confCenterPos, neighbors: ['conf_door'] };
        nodes.conf_door.neighbors.push('conf_center');
        
        // Conference seats
        const confSeats = [
            { name: 'conf_seat0', x: -5, z: 5, facing: 0 },
            { name: 'conf_seat1', x: -5, z: 7, facing: Math.PI },
            { name: 'conf_seat2', x: -6.5, z: 6, facing: -Math.PI / 2 },
            { name: 'conf_seat3', x: -3.5, z: 6, facing: Math.PI / 2 }
        ];
        for (const seat of confSeats) {
            nodes[seat.name] = { 
                position: new THREE.Vector3(seat.x, floorY, seat.z),
                neighbors: ['conf_center'],
                sit: true,
                facing: seat.facing
            };
            nodes.conf_center.neighbors.push(seat.name);
        }
        
        // Lounge
        const loungeDoorPos = new THREE.Vector3(7, floorY, 6);
        nodes.lounge_door = { position: loungeDoorPos, neighbors: ['hallSE'] };
        nodes.hallSE.neighbors.push('lounge_door');
        
        const loungeCenterPos = new THREE.Vector3(5, floorY, 6);
        nodes.lounge_center = { position: loungeCenterPos, neighbors: ['lounge_door'] };
        nodes.lounge_door.neighbors.push('lounge_center');
        
        const loungeSpots = [
            { name: 'lounge_spot0', x: 6, z: 5, facing: -Math.PI / 2 },
            { name: 'lounge_spot1', x: 6, z: 7, facing: -Math.PI / 2 },
            { name: 'lounge_spot2', x: 3, z: 6, facing: Math.PI / 2 }
        ];
        for (const spot of loungeSpots) {
            nodes[spot.name] = { 
                position: new THREE.Vector3(spot.x, floorY, spot.z),
                neighbors: ['lounge_center'],
                sit: true,
                facing: spot.facing
            };
            nodes.lounge_center.neighbors.push(spot.name);
        }
        
        // Water cooler
        const wcPos = new THREE.Vector3(9, floorY, 5);
        nodes.water_cooler = { 
            position: wcPos,
            neighbors: ['lounge_center'],
            sit: false,
            facing: -Math.PI / 2
        };
        nodes.lounge_center.neighbors.push('water_cooler');
        
        // Hallway loiter spots
        const hallSpots = [
            { name: 'hall_stand_N', x: 0, z: 5, facing: 0 },
            { name: 'hall_stand_S', x: 0, z: 2, facing: Math.PI }
        ];
        for (const spot of hallSpots) {
            nodes[spot.name] = { 
                position: new THREE.Vector3(spot.x, floorY, spot.z),
                neighbors: ['elevWait'],
                sit: false,
                facing: spot.facing
            };
            nodes.elevWait.neighbors.push(spot.name);
        }
    }
    
    // Build sitTargets map
    const sitTargets = {};
    for (const [name, node] of Object.entries(nodes)) {
        if (node.sit !== undefined) {
            sitTargets[name] = { sit: node.sit, facing: node.facing };
        }
    }
    
    return { nodes, sitTargets };
}

// Build the entire world
function createWorld(scene) {
    const buildingGroup = new THREE.Group();
    buildingGroup.renderOrder = 0;
    scene.add(buildingGroup);
    
    const floors = [];
    const floorMeshes = [];
    
    // Ground slab
    const ground = new THREE.Mesh(
        new THREE.BoxGeometry(WORLD.BUILDING_WIDTH, 0.5, WORLD.BUILDING_DEPTH),
        getOpaqueMaterial(COLORS.ground)
    );
    ground.position.y = -0.25;
    buildingGroup.add(ground);
    
    // Roof
    const roof = new THREE.Mesh(
        new THREE.BoxGeometry(WORLD.BUILDING_WIDTH, 0.5, WORLD.BUILDING_DEPTH),
        getOpaqueMaterial(COLORS.roof)
    );
    roof.position.y = WORLD.FLOOR_COUNT * WORLD.FLOOR_HEIGHT + 0.25;
    buildingGroup.add(roof);
    
    // Floor slabs (with shaft hole)
    for (let f = 0; f < WORLD.FLOOR_COUNT; f++) {
        const floorY = f * WORLD.FLOOR_HEIGHT;
        
        // Four strips around the shaft
        const slabThickness = 0.3;
        const slabMat = getMaterial('floorSlab', COLORS.floorSlab, 0.3, false);
        
        // Front strip (z from shaft to building front)
        const frontStrip = new THREE.Mesh(
            new THREE.BoxGeometry(
                WORLD.BUILDING_WIDTH - WORLD.SHAFT_DEPTH,
                slabThickness,
                WORLD.BUILDING_DEPTH / 2 - WORLD.SHAFT_DEPTH / 2
            ),
            slabMat
        );
        frontStrip.position.set(0, floorY, WORLD.SHAFT_DEPTH / 2 + (WORLD.BUILDING_DEPTH / 2 - WORLD.SHAFT_DEPTH / 2) / 2);
        buildingGroup.add(frontStrip);
        floorMeshes.push(frontStrip);
        
        // Back strip
        const backStrip = new THREE.Mesh(
            new THREE.BoxGeometry(
                WORLD.BUILDING_WIDTH,
                slabThickness,
                WORLD.BUILDING_DEPTH / 2 - WORLD.SHAFT_DEPTH / 2
            ),
            slabMat
        );
        backStrip.position.set(0, floorY, -WORLD.SHAFT_DEPTH / 2 - (WORLD.BUILDING_DEPTH / 2 - WORLD.SHAFT_DEPTH / 2) / 2);
        buildingGroup.add(backStrip);
        floorMeshes.push(backStrip);
        
        // Left strip
        const leftStrip = new THREE.Mesh(
            new THREE.BoxGeometry(
                WORLD.BUILDING_WIDTH / 2 - WORLD.SHAFT_WIDTH / 2,
                slabThickness,
                WORLD.SHAFT_DEPTH
            ),
            slabMat
        );
        leftStrip.position.set(-WORLD.SHAFT_WIDTH / 2 - (WORLD.BUILDING_WIDTH / 2 - WORLD.SHAFT_WIDTH / 2) / 2, floorY, 0);
        buildingGroup.add(leftStrip);
        floorMeshes.push(leftStrip);
        
        // Right strip
        const rightStrip = new THREE.Mesh(
            new THREE.BoxGeometry(
                WORLD.BUILDING_WIDTH / 2 - WORLD.SHAFT_WIDTH / 2,
                slabThickness,
                WORLD.SHAFT_DEPTH
            ),
            slabMat
        );
        rightStrip.position.set(WORLD.SHAFT_WIDTH / 2 + (WORLD.BUILDING_WIDTH / 2 - WORLD.SHAFT_WIDTH / 2) / 2, floorY, 0);
        buildingGroup.add(rightStrip);
        floorMeshes.push(rightStrip);
    }
    
    // Outer walls
    const wallMat = getMaterial('wallOuter', COLORS.wallOuter, 0.2, false);
    
    // Left wall (full height)
    const leftWall = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, WORLD.FLOOR_COUNT * WORLD.FLOOR_HEIGHT, WORLD.BUILDING_DEPTH),
        wallMat
    );
    leftWall.position.set(-WORLD.BUILDING_WIDTH / 2 + 0.15, WORLD.FLOOR_COUNT * WORLD.FLOOR_HEIGHT / 2, 0);
    buildingGroup.add(leftWall);
    
    // Right wall (full height)
    const rightWall = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, WORLD.FLOOR_COUNT * WORLD.FLOOR_HEIGHT, WORLD.BUILDING_DEPTH),
        wallMat
    );
    rightWall.position.set(WORLD.BUILDING_WIDTH / 2 - 0.15, WORLD.FLOOR_COUNT * WORLD.FLOOR_HEIGHT / 2, 0);
    buildingGroup.add(rightWall);
    
    // Back wall (full height)
    const backWall = new THREE.Mesh(
        new THREE.BoxGeometry(WORLD.BUILDING_WIDTH, WORLD.FLOOR_COUNT * WORLD.FLOOR_HEIGHT, 0.3),
        wallMat
    );
    backWall.position.set(0, WORLD.FLOOR_COUNT * WORLD.FLOOR_HEIGHT / 2, -WORLD.BUILDING_DEPTH / 2 + 0.15);
    buildingGroup.add(backWall);
    
    // Front wall - in three segments to leave gap on floor 0
    // Left segment (full height)
    const frontLeftWall = new THREE.Mesh(
        new THREE.BoxGeometry(
            (WORLD.BUILDING_WIDTH - 3) / 2 - 0.15,
            WORLD.FLOOR_COUNT * WORLD.FLOOR_HEIGHT,
            0.3
        ),
        wallMat
    );
    frontLeftWall.position.set(-(WORLD.BUILDING_WIDTH - 3) / 4, WORLD.FLOOR_COUNT * WORLD.FLOOR_HEIGHT / 2, WORLD.BUILDING_DEPTH / 2 - 0.15);
    buildingGroup.add(frontLeftWall);
    
    // Right segment (full height)
    const frontRightWall = new THREE.Mesh(
        new THREE.BoxGeometry(
            (WORLD.BUILDING_WIDTH - 3) / 2 - 0.15,
            WORLD.FLOOR_COUNT * WORLD.FLOOR_HEIGHT,
            0.3
        ),
        wallMat
    );
    frontRightWall.position.set((WORLD.BUILDING_WIDTH - 3) / 4, WORLD.FLOOR_COUNT * WORLD.FLOOR_HEIGHT / 2, WORLD.BUILDING_DEPTH / 2 - 0.15);
    buildingGroup.add(frontRightWall);
    
    // Front wall above gap (floors 1-5 only)
    const frontTopWall = new THREE.Mesh(
        new THREE.BoxGeometry(
            3,
            WORLD.FLOOR_COUNT * WORLD.FLOOR_HEIGHT - WORLD.FLOOR_HEIGHT,
            0.3
        ),
        wallMat
    );
    frontTopWall.position.set(0, WORLD.FLOOR_HEIGHT + (WORLD.FLOOR_COUNT * WORLD.FLOOR_HEIGHT - WORLD.FLOOR_HEIGHT) / 2, WORLD.BUILDING_DEPTH / 2 - 0.15);
    buildingGroup.add(frontTopWall);
    
    // Shaft walls (inside the building)
    const shaftWallMat = getMaterial('shaftWall', 0x444444, 0.15, false);
    
    for (let f = 0; f < WORLD.FLOOR_COUNT; f++) {
        const floorY = f * WORLD.FLOOR_HEIGHT;
        
        // Shaft front wall
        const shaftFront = new THREE.Mesh(
            new THREE.BoxGeometry(WORLD.SHAFT_WIDTH, WORLD.FLOOR_HEIGHT, 0.2),
            shaftWallMat
        );
        shaftFront.position.set(0, floorY + WORLD.FLOOR_HEIGHT / 2, WORLD.SHAFT_DEPTH / 2 + 0.1);
        buildingGroup.add(shaftFront);
        
        // Shaft back wall
        const shaftBack = new THREE.Mesh(
            new THREE.BoxGeometry(WORLD.SHAFT_WIDTH, WORLD.FLOOR_HEIGHT, 0.2),
            shaftWallMat
        );
        shaftBack.position.set(0, floorY + WORLD.FLOOR_HEIGHT / 2, -WORLD.SHAFT_DEPTH / 2 - 0.1);
        buildingGroup.add(shaftBack);
        
        // Shaft left wall
        const shaftLeft = new THREE.Mesh(
            new THREE.BoxGeometry(0.2, WORLD.FLOOR_HEIGHT, WORLD.SHAFT_DEPTH),
            shaftWallMat
        );
        shaftLeft.position.set(-WORLD.SHAFT_WIDTH / 2 - 0.1, floorY + WORLD.FLOOR_HEIGHT / 2, 0);
        buildingGroup.add(shaftLeft);
        
        // Shaft right wall
        const shaftRight = new THREE.Mesh(
            new THREE.BoxGeometry(0.2, WORLD.FLOOR_HEIGHT, WORLD.SHAFT_DEPTH),
            shaftWallMat
        );
        shaftRight.position.set(WORLD.SHAFT_WIDTH / 2 + 0.1, floorY + WORLD.FLOOR_HEIGHT / 2, 0);
        buildingGroup.add(shaftRight);
    }
    
    // Interior walls for office floors
    const innerWallMat = getMaterial('wallInner', COLORS.wallInner, 0.28, false);
    
    for (let f = 1; f < WORLD.FLOOR_COUNT; f++) {
        const floorY = f * WORLD.FLOOR_HEIGHT;
        
        // Office dividing walls (back area)
        // Vertical dividers between offices
        for (let x = -5; x <= 5; x += 4) {
            const wall = new THREE.Mesh(
                new THREE.BoxGeometry(0.2, WORLD.FLOOR_HEIGHT, 3),
                innerWallMat
            );
            wall.position.set(x, floorY + WORLD.FLOOR_HEIGHT / 2, -6);
            buildingGroup.add(wall);
        }
        
        // Horizontal wall separating back offices from front area
        const backWall = new THREE.Mesh(
            new THREE.BoxGeometry(18, WORLD.FLOOR_HEIGHT, 0.2),
            innerWallMat
        );
        backWall.position.set(0, floorY + WORLD.FLOOR_HEIGHT / 2, -4.5);
        buildingGroup.add(backWall);
        
        // Doorway gaps in back wall
        const doorwayGeom = new THREE.BoxGeometry(1.2, WORLD.FLOOR_HEIGHT - 0.5, 0.2);
        for (let x = -8; x <= 8; x += 5) {
            const doorway = new THREE.Mesh(doorwayGeom, innerWallMat);
            doorway.position.set(x, floorY + WORLD.FLOOR_HEIGHT / 2, -4.5);
            buildingGroup.add(doorway);
        }
        
        // Conference room walls
        const confLeft = new THREE.Mesh(
            new THREE.BoxGeometry(0.2, WORLD.FLOOR_HEIGHT, 5),
            innerWallMat
        );
        confLeft.position.set(-9, floorY + WORLD.FLOOR_HEIGHT / 2, 6);
        buildingGroup.add(confLeft);
        
        const confRight = new THREE.Mesh(
            new THREE.BoxGeometry(0.2, WORLD.FLOOR_HEIGHT, 5),
            innerWallMat
        );
        confRight.position.set(-3, floorY + WORLD.FLOOR_HEIGHT / 2, 6);
        buildingGroup.add(confRight);
        
        const confFront = new THREE.Mesh(
            new THREE.BoxGeometry(6, WORLD.FLOOR_HEIGHT, 0.2),
            innerWallMat
        );
        confFront.position.set(-6, floorY + WORLD.FLOOR_HEIGHT / 2, 8.5);
        buildingGroup.add(confFront);
        
        const confBack = new THREE.Mesh(
            new THREE.BoxGeometry(6, WORLD.FLOOR_HEIGHT, 0.2),
            innerWallMat
        );
        confBack.position.set(-6, floorY + WORLD.FLOOR_HEIGHT / 2, 3.5);
        buildingGroup.add(confBack);
        
        // Conference room doorway
        const confDoorway = new THREE.Mesh(
            new THREE.BoxGeometry(1.2, WORLD.FLOOR_HEIGHT - 0.5, 0.2),
            innerWallMat
        );
        confDoorway.position.set(-6, floorY + WORLD.FLOOR_HEIGHT / 2, 3.5);
        buildingGroup.add(confDoorway);
        
        // Lounge walls
        const loungeLeft = new THREE.Mesh(
            new THREE.BoxGeometry(0.2, WORLD.FLOOR_HEIGHT, 5),
            innerWallMat
        );
        loungeLeft.position.set(3, floorY + WORLD.FLOOR_HEIGHT / 2, 6);
        buildingGroup.add(loungeLeft);
        
        const loungeRight = new THREE.Mesh(
            new THREE.BoxGeometry(0.2, WORLD.FLOOR_HEIGHT, 5),
            innerWallMat
        );
        loungeRight.position.set(9, floorY + WORLD.FLOOR_HEIGHT / 2, 6);
        buildingGroup.add(loungeRight);
        
        const loungeFront = new THREE.Mesh(
            new THREE.BoxGeometry(6, WORLD.FLOOR_HEIGHT, 0.2),
            innerWallMat
        );
        loungeFront.position.set(6, floorY + WORLD.FLOOR_HEIGHT / 2, 8.5);
        buildingGroup.add(loungeFront);
        
        const loungeBack = new THREE.Mesh(
            new THREE.BoxGeometry(6, WORLD.FLOOR_HEIGHT, 0.2),
            innerWallMat
        );
        loungeBack.position.set(6, floorY + WORLD.FLOOR_HEIGHT / 2, 3.5);
        buildingGroup.add(loungeBack);
        
        // Lounge doorway
        const loungeDoorway = new THREE.Mesh(
            new THREE.BoxGeometry(1.2, WORLD.FLOOR_HEIGHT - 0.5, 0.2),
            innerWallMat
        );
        loungeDoorway.position.set(6, floorY + WORLD.FLOOR_HEIGHT / 2, 3.5);
        buildingGroup.add(loungeDoorway);
    }
    
    // Build floors with furniture and navigation
    for (let f = 0; f < WORLD.FLOOR_COUNT; f++) {
        const floorY = f * WORLD.FLOOR_HEIGHT;
        const isLobby = f === 0;
        
        // Build navigation graph
        const graph = buildFloorGraph(f, isLobby);
        
        // Create call panel
        const callPanel = createCallPanel(f);
        buildingGroup.add(callPanel);
        
        // Create shaft indicator
        const shaftIndicator = createShaftIndicator();
        shaftIndicator.position.y = floorY + WORLD.FLOOR_HEIGHT - 0.3;
        buildingGroup.add(shaftIndicator);
        
        // Lobby furniture
        if (isLobby) {
            // Entrance glass doors
            const doorMat = new THREE.MeshStandardMaterial({ 
                color: 0x88ccff, 
                transparent: true, 
                opacity: 0.4,
                depthWrite: false,
                side: THREE.DoubleSide
            });
            const leftDoor = new THREE.Mesh(
                new THREE.BoxGeometry(1.4, 2.5, 0.1),
                doorMat
            );
            leftDoor.position.set(-0.85, 1.25, 9);
            buildingGroup.add(leftDoor);
            
            const rightDoor = new THREE.Mesh(
                new THREE.BoxGeometry(1.4, 2.5, 0.1),
                doorMat
            );
            rightDoor.position.set(0.85, 1.25, 9);
            buildingGroup.add(rightDoor);
            
            // Sidewalk
            const sidewalk = new THREE.Mesh(
                new THREE.BoxGeometry(22, 0.2, 6),
                getOpaqueMaterial(0x666666)
            );
            sidewalk.position.set(0, 0.1, 12);
            buildingGroup.add(sidewalk);
            
            // Cafe
            const cafeCounter = new THREE.Mesh(
                new THREE.BoxGeometry(2.5, 0.8, 0.6),
                getOpaqueMaterial(0x4a3a2a)
            );
            cafeCounter.position.set(-11.5, 0.4, 8.5);
            buildingGroup.add(cafeCounter);
            
            const coffeeMachine = createCoffeeMachine();
            coffeeMachine.position.set(-12, 0, 8.5);
            buildingGroup.add(coffeeMachine);
            
            const pastryDisplay = createPastryDisplay();
            pastryDisplay.position.set(-11, 0, 8.5);
            buildingGroup.add(pastryDisplay);
            
            // Bistro tables
            for (let i = 0; i < 4; i++) {
                const table = createBistroTable();
                table.position.set(-11 + i * 3.5, 0, 4);
                buildingGroup.add(table);
            }
            
            // Front lounge
            const frontCouch = createCouch();
            frontCouch.position.set(10, 0, 5);
            frontCouch.rotation.y = Math.PI / 2;
            buildingGroup.add(frontCouch);
            
            const frontCoffeeTable = createTable(0.8, 0.5, 0.4);
            frontCoffeeTable.position.set(10, 0, 5);
            buildingGroup.add(frontCoffeeTable);
            
            const frontArmchair1 = createChair();
            frontArmchair1.position.set(12, 0, 5);
            frontArmchair1.rotation.y = Math.PI;
            buildingGroup.add(frontArmchair1);
            
            const frontArmchair2 = createChair();
            frontArmchair2.position.set(12, 0, 7);
            frontArmchair2.rotation.y = 0;
            buildingGroup.add(frontArmchair2);
            
            const frontWaterCooler = createWaterCooler();
            frontWaterCooler.position.set(7, 0, 8);
            buildingGroup.add(frontWaterCooler);
            
            // Back lounge
            const backCouch1 = createCouch();
            backCouch1.position.set(-6, 0, -6);
            backCouch1.rotation.y = 0;
            buildingGroup.add(backCouch1);
            
            const backCouch2 = createCouch();
            backCouch2.position.set(-6, 0, -8);
            backCouch2.rotation.y = Math.PI;
            buildingGroup.add(backCouch2);
            
            const backCoffeeTable = createTable(1.0, 0.6, 0.4);
            backCoffeeTable.position.set(-6, 0, -7);
            buildingGroup.add(backCoffeeTable);
            
            // Conversation pit
            const pitTable = createTable(1.2, 1.2, 0.4);
            pitTable.position.set(-10, 0, -6);
            buildingGroup.add(pitTable);
            
            const pitChairs = [];
            for (let i = 0; i < 4; i++) {
                const chair = createChair();
                const angle = (i / 4) * Math.PI * 2;
                chair.position.set(-10 + Math.cos(angle) * 1.5, 0, -6 + Math.sin(angle) * 1.5);
                chair.rotation.y = angle + Math.PI;
                buildingGroup.add(chair);
                pitChairs.push(chair);
            }
            
            // Back water cooler
            const backWaterCooler = createWaterCooler();
            backWaterCooler.position.set(-7, 0, -5);
            buildingGroup.add(backWaterCooler);
            
            // Reception
            const receptionDesk = createReceptionDesk();
            receptionDesk.position.set(-3, 0, 8.5);
            buildingGroup.add(receptionDesk);
            
            // Kiosk
            const kiosk = createInfoKiosk();
            kiosk.position.set(3, 0, 8.5);
            buildingGroup.add(kiosk);
            
            // Potted plants
            const plant1 = createPottedPlant();
            plant1.position.set(-2, 0, 9.5);
            buildingGroup.add(plant1);
            
            const plant2 = createPottedPlant();
            plant2.position.set(2, 0, 9.5);
            buildingGroup.add(plant2);
            
            floors.push({
                floorNumber: f,
                nodes: graph.nodes,
                callPanel: callPanel,
                shaftIndicator: shaftIndicator,
                desks: [],
                sitTargets: graph.sitTargets,
                isLobby: true,
                entranceSpot: new THREE.Vector3(0, floorY, 9),
                cafeSpots: ['cafe_order', 'cafe_center']
            });
        } else {
            // Office floor furniture
            const desks = [];
            
            // Private offices with desks
            const officePositions = [
                { x: -8, z: -6 },
                { x: -3, z: -6 },
                { x: 3, z: -6 },
                { x: 8, z: -6 }
            ];
            
            for (let i = 0; i < officePositions.length; i++) {
                const pos = officePositions[i];
                
                // Desk
                const desk = createDesk();
                desk.position.set(pos.x, floorY, pos.z - 1);
                buildingGroup.add(desk);
                desks.push(desk);
                
                // Chair
                const chair = createChair();
                chair.position.set(pos.x, floorY, pos.z - 2.2);
                chair.rotation.y = Math.PI;
                buildingGroup.add(chair);
            }
            
            // Conference room
            const confTable = createTable(2.0, 0.8, 0.7);
            confTable.position.set(-5, floorY, 6);
            buildingGroup.add(confTable);
            
            const confChairs = [];
            for (let i = 0; i < 4; i++) {
                const chair = createChair();
                if (i === 0) chair.position.set(-5, floorY, 5);
                else if (i === 1) chair.position.set(-5, floorY, 7);
                else if (i === 2) chair.position.set(-6.5, floorY, 6);
                else chair.position.set(-3.5, floorY, 6);
                
                if (i === 0) chair.rotation.y = 0;
                else if (i === 1) chair.rotation.y = Math.PI;
                else if (i === 2) chair.rotation.y = -Math.PI / 2;
                else chair.rotation.y = Math.PI / 2;
                
                buildingGroup.add(chair);
                confChairs.push(chair);
            }
            
            // Lounge
            const loungeCouch = createCouch();
            loungeCouch.position.set(5, floorY, 5);
            loungeCouch.rotation.y = -Math.PI / 2;
            buildingGroup.add(loungeCouch);
            
            const loungeCoffeeTable = createTable(1.0, 0.6, 0.4);
            loungeCoffeeTable.position.set(5, floorY, 5);
            buildingGroup.add(loungeCoffeeTable);
            
            const loungeArmchair1 = createChair();
            loungeArmchair1.position.set(6, floorY, 5);
            loungeArmchair1.rotation.y = -Math.PI / 2;
            buildingGroup.add(loungeArmchair1);
            
            const loungeArmchair2 = createChair();
            loungeArmchair2.position.set(6, floorY, 7);
            loungeArmchair2.rotation.y = -Math.PI / 2;
            buildingGroup.add(loungeArmchair2);
            
            const loungeWaterCooler = createWaterCooler();
            loungeWaterCooler.position.set(9, floorY, 5);
            buildingGroup.add(loungeWaterCooler);
            
            floors.push({
                floorNumber: f,
                nodes: graph.nodes,
                callPanel: callPanel,
                shaftIndicator: shaftIndicator,
                desks: desks,
                sitTargets: graph.sitTargets,
                isLobby: false
            });
        }
    }
    
    return {
        buildingGroup,
        floors,
        bfsPath: bfsPath,
        WORLD
    };
}

// Export to window
window.createWorld = createWorld;
window.WORLD = WORLD;
