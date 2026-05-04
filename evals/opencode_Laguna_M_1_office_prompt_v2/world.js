(function(root) {
    const WORLD = {
        FLOOR_HEIGHT: 3.4,
        FLOOR_COUNT: 6,
        BUILDING_WIDTH: 22,
        BUILDING_DEPTH: 18,
        SHAFT_WIDTH: 3,
        SHAFT_DEPTH: 3,
        PERSON_R: 0.4
    };

    const transparentMaterial = (color, opacity) => new THREE.MeshPhongMaterial({
        color, opacity, transparent: true, depthWrite: false, side: THREE.DoubleSide
    });

    const createTextTexture = (text) => {
        const size = 256;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        
        ctx.fillStyle = '#050505';
        ctx.fillRect(0, 0, size, size);
        
        ctx.fillStyle = '#ffbb22';
        ctx.font = 'bold 180px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = '#ffbb22';
        ctx.shadowBlur = 20;
        ctx.fillText(text, size / 2, size / 2);
        
        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.anisotropy = 16;
        texture._lastText = text;
        return texture;
    };

    const updateTextTexture = (texture, text) => {
        if (texture._lastText === text) return;
        texture._lastText = text;
        const size = texture.image.width;
        const ctx = texture.image.getContext('2d');
        ctx.fillStyle = '#050505';
        ctx.fillRect(0, 0, size, size);
        ctx.fillStyle = '#ffbb22';
        ctx.font = 'bold 180px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = '#ffbb22';
        ctx.shadowBlur = 20;
        ctx.fillText(text, size / 2, size / 2);
        texture.needsUpdate = true;
    };

    const createCallPanel = (floorNum) => {
        const panel = new THREE.Group();
        
        const plateGeom = new THREE.BoxGeometry(1.4, 0.55, 0.05);
        const plateMat = new THREE.MeshPhongMaterial({ color: 0x333333 });
        const plate = new THREE.Mesh(plateGeom, plateMat);
        panel.add(plate);
        
        const arrowGeom = new THREE.Shape();
        arrowGeom.moveTo(-0.13, 0);
        arrowGeom.lineTo(0.13, 0);
        arrowGeom.lineTo(0, 0.2);
        const arrowMatDark = new THREE.MeshPhongMaterial({ color: 0x222222 });
        const arrowMatLit = new THREE.MeshPhongMaterial({ 
            color: 0x22aa22, 
            emissive: 0x22aa22,
            emissiveIntensity: 0.8
        });
        
        const upArrowGeom = new THREE.ShapeGeometry(arrowGeom);
        const upArrow = new THREE.Mesh(upArrowGeom, arrowMatDark);
        upArrow.position.set(0, 0.12, 0.03);
        panel.add(upArrow);
        
        const downArrow = new THREE.Mesh(upArrowGeom, arrowMatDark);
        downArrow.rotation.x = Math.PI;
        downArrow.position.set(0, -0.12, 0.03);
        panel.add(downArrow);
        
        const indicatorTex = createTextTexture(String(floorNum));
        const indicatorMat = new THREE.MeshPhongMaterial({ 
            map: indicatorTex,
            transparent: true
        });
        const indicatorGeom = new THREE.PlaneGeometry(0.45, 0.45);
        const indicator = new THREE.Mesh(indicatorGeom, indicatorMat);
        indicator.position.set(0.4, 0, 0.03);
        panel.add(indicator);
        
        panel.userData = {
            setUp: (on) => {
                upArrow.material = on ? arrowMatLit : arrowMatDark;
            },
            setDown: (on) => {
                downArrow.material = on ? arrowMatLit : arrowMatDark;
            },
            setIndicator: (text) => {
                updateTextTexture(indicatorTex, text);
            }
        };
        
        return panel;
    };

    const createShaftIndicator = (floorNum) => {
        const tex = createTextTexture(String(floorNum));
        const mat = new THREE.MeshPhongMaterial({ 
            map: tex,
            transparent: true
        });
        const geom = new THREE.PlaneGeometry(0.9, 0.9);
        const mesh = new THREE.Mesh(geom, mat);
        mesh.userData = {
            setIndicator: (text) => updateTextTexture(tex, text)
        };
        return mesh;
    };

    const bfsPath = (nodes, fromName, toName) => {
        const queue = [[fromName]];
        const visited = new Set();
        
        while (queue.length > 0) {
            const path = queue.shift();
            const current = path[path.length - 1];
            
            if (current === toName) {
                return path.map(name => nodes[name].clone());
            }
            
            if (visited.has(current)) continue;
            visited.add(current);
            
            const neighbors = nodes[current].neighbors || [];
            for (const neighbor of neighbors) {
                queue.push([...path, neighbor]);
            }
        }
        return null;
    };

    const createFloorNodes = (floorNum) => {
        const nodes = {};
        
        const y = floorNum * WORLD.FLOOR_HEIGHT;
        const hw = WORLD.BUILDING_WIDTH / 2;
        const hd = WORLD.BUILDING_DEPTH / 2;
        const sw = WORLD.SHAFT_WIDTH / 2;
        const sd = WORLD.SHAFT_DEPTH / 2;
        
        nodes.hallS = new THREE.Vector3(0, y, -sd - 0.8);
        nodes.hallSE = new THREE.Vector3(hw - 1.5, y, -sd - 0.8);
        nodes.hallE = new THREE.Vector3(hw - 1.5, y, 0);
        nodes.hallNE = new THREE.Vector3(hw - 1.5, y, sd + 0.8);
        nodes.hallN = new THREE.Vector3(0, y, sd + 0.8);
        nodes.hallNW = new THREE.Vector3(-hw + 1.5, y, sd + 0.8);
        nodes.hallW = new THREE.Vector3(-hw + 1.5, y, 0);
        nodes.hallSW = new THREE.Vector3(-hw + 1.5, y, -sd - 0.8);
        nodes.elevWait = new THREE.Vector3(0, y, -sd - 1.8);
        
        for (const key of Object.keys(nodes)) {
            nodes[key] = nodes[key].clone();
        }
        
        const connect = (a, b) => {
            nodes[a].neighbors = nodes[a].neighbors || [];
            nodes[b].neighbors = nodes[b].neighbors || [];
            nodes[a].neighbors.push(b);
            nodes[b].neighbors.push(a);
        };
        
        connect('hallS', 'elevWait');
        connect('elevWait', 'hallS');
        connect('hallS', 'hallSE');
        connect('hallSE', 'hallE');
        connect('hallE', 'hallNE');
        connect('hallNE', 'hallN');
        connect('hallN', 'hallNW');
        connect('hallNW', 'hallW');
        connect('hallW', 'hallSW');
        connect('hallSW', 'hallS');
        
        if (floorNum === 0) {
            nodes.entrance = new THREE.Vector3(0, y, 9);
            nodes.entrance.neighbors = ['elevWait'];
            nodes.elevWait.neighbors.push('entrance');
        }
        
        return nodes;
    };

    const createWorld = (scene) => {
        const buildingGroup = new THREE.Group();
        buildingGroup.renderOrder = 0;
        scene.add(buildingGroup);
        
        const hw = WORLD.BUILDING_WIDTH / 2;
        const hd = WORLD.BUILDING_DEPTH / 2;
        const sw = WORLD.SHAFT_WIDTH / 2;
        const sd = WORLD.SHAFT_DEPTH / 2;
        
        const groundGeom = new THREE.BoxGeometry(WORLD.BUILDING_WIDTH, 0.2, WORLD.BUILDING_DEPTH);
        const groundMat = new THREE.MeshPhongMaterial({ color: 0x444444 });
        const ground = new THREE.Mesh(groundGeom, groundMat);
        ground.position.y = -0.1;
        buildingGroup.add(ground);
        
        for (let f = 1; f < WORLD.FLOOR_COUNT - 1; f++) {
            const y = f * WORLD.FLOOR_HEIGHT;
            const thickness = 0.15;
            
            const mat = transparentMaterial(0x888888, 0.3);
            
            const north = new THREE.Mesh(
                new THREE.BoxGeometry(WORLD.BUILDING_WIDTH, thickness, sd + 1),
                mat
            );
            north.position.set(0, y + thickness/2, hd - sd/2);
            buildingGroup.add(north);
            
            const south = new THREE.Mesh(
                new THREE.BoxGeometry(WORLD.BUILDING_WIDTH, thickness, sd + 1),
                mat
            );
            south.position.set(0, y + thickness/2, -hd + sd/2);
            buildingGroup.add(south);
            
            const east = new THREE.Mesh(
                new THREE.BoxGeometry(sw + 1, thickness, 2 * sd + 2),
                mat
            );
            east.position.set(hw - sw/2, y + thickness/2, 0);
            buildingGroup.add(east);
            
            const west = new THREE.Mesh(
                new THREE.BoxGeometry(sw + 1, thickness, 2 * sd + 2),
                mat
            );
            west.position.set(-hw + sw/2, y + thickness/2, 0);
            buildingGroup.add(west);
        }
        
        const roofGeom = new THREE.BoxGeometry(WORLD.BUILDING_WIDTH, 0.3, WORLD.BUILDING_DEPTH);
        const roofMat = new THREE.MeshPhongMaterial({ color: 0x333333 });
        const roof = new THREE.Mesh(roofGeom, roofMat);
        roof.position.y = WORLD.FLOOR_COUNT * WORLD.FLOOR_HEIGHT + 0.15;
        buildingGroup.add(roof);
        
        const wallMat = transparentMaterial(0x9999ff, 0.2);
        const wallThickness = 0.2;
        
        // Front wall (north) - solid except entrance gap on floor 0
        const frontWallUpper = new THREE.Mesh(
            new THREE.BoxGeometry(WORLD.BUILDING_WIDTH, 10, wallThickness),
            wallMat
        );
        frontWallUpper.position.set(0, 5, hd);
        buildingGroup.add(frontWallUpper);
        
        // Back wall (south)
        const backWall = new THREE.Mesh(
            new THREE.BoxGeometry(WORLD.BUILDING_WIDTH, 10, wallThickness),
            wallMat
        );
        backWall.position.set(0, 5, -hd);
        buildingGroup.add(backWall);
        
        // Side walls
        const sideWallMat = transparentMaterial(0x9999ff, 0.2);
        const eastWall = new THREE.Mesh(
            new THREE.BoxGeometry(wallThickness, 10, WORLD.BUILDING_DEPTH),
            sideWallMat
        );
        eastWall.position.set(hw, 5, 0);
        buildingGroup.add(eastWall);
        
        const westWall = new THREE.Mesh(
            new THREE.BoxGeometry(wallThickness, 10, WORLD.BUILDING_DEPTH),
            sideWallMat
        );
        westWall.position.set(-hw, 5, 0);
        buildingGroup.add(westWall);
        
        const floors = [];
        const sitTargets = {};
        
        for (let f = 0; f < WORLD.FLOOR_COUNT; f++) {
            const floorData = {
                floorNumber: f,
                nodes: createFloorNodes(f),
                callPanel: createCallPanel(f),
                shaftIndicator: createShaftIndicator(f),
                sitTargets: {}
            };
            
            floorData.callPanel.position.set(0, f * WORLD.FLOOR_HEIGHT + 1, -sd - 0.1);
            floorData.callPanel.rotation.y = Math.PI;
            buildingGroup.add(floorData.callPanel);
            
            floorData.shaftIndicator.position.set(0, f * WORLD.FLOOR_HEIGHT + 2.2, -sd + 0.05);
            buildingGroup.add(floorData.shaftIndicator);
            
            floors.push(floorData);
        }
        
        return {
            buildingGroup,
            floors,
            bfsPath,
            WORLD
        };
    };

    root.createWorld = createWorld;
    root.WORLD = WORLD;
})(typeof window !== 'undefined' ? window : globalThis);