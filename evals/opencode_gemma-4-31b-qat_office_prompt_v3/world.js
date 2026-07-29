const WORLD = {
    FLOOR_HEIGHT: 3.4, FLOOR_COUNT: 6,
    BUILDING_WIDTH: 22, BUILDING_DEPTH: 18,
    SHAFT_WIDTH: 3, SHAFT_DEPTH: 3,
    PERSON_R: 0.4
};

function bfsPath(nodes, fromName, toName) {
    if (!nodes[fromName] || !nodes[toName]) return [];
    const queue = [[fromName, []]];
    const visited = new Set([fromName]);

    while (queue.length > 0) {
        const [current, path] = queue.shift();
        if (current === toName) return path.map(n => nodes[n].pos);

        for (const neighbor of nodes[current].links) {
            if (!visited.has(neighbor)) {
                visited.add(neighbor);
                queue.push([neighbor, [...path, current, neighbor]]); // this is slightly wrong, should just be path
            }
        }
    }
    return [];
}

// Corrected BFS
function bfsPathFixed(nodes, fromName, toName) {
    if (!nodes[fromName] || !nodes[toName]) return [];
    const queue = [[fromName, []]];
    const visited = new Set([fromName]);

    while (queue.length > 0) {
        const [current, path] = queue.shift();
        const currentPath = [...path, nodes[current].pos];
        if (current === toName) return currentPath;

        for (const neighbor of nodes[current].links) {
            if (!visited.has(neighbor)) {
                visited.add(neighbor);
                queue.push([neighbor, currentPath]);
            }
        }
    }
    return [];
}

function createCallPanel(scene, floor, pos, rot) {
    const group = new THREE.Group();
    group.position.copy(pos);
    group.rotation.copy(rot);

    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.4, 0.05), new THREE.MeshStandardMaterial({color: 0x444444}));
    group.add(plate);

    const arrowGeo = new THREE.Shape();
    arrowGeo.moveTo(-0.06, -0.1);
    arrowGeo.lineTo(0, 0.1);
    arrowGeo.lineTo(0.06, -0.1);
    arrowGeo.closePath();

    const upArrow = new THREE.Mesh(new THREE.ShapeGeometry(arrowGeo), new THREE.MeshStandardMaterial({color: 0x222222}));
    upArrow.position.set(0, 0.3, 0.03);
    group.add(upArrow);

    const downArrow = new THREE.Mesh(new THREE.ShapeGeometry(arrowGeo), new THREE.MeshStandardMaterial({color: 0x222222}));
    downArrow.position.set(0, -0.3, 0.03);
    downArrow.rotation.x = Math.PI;
    group.add(downArrow);

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;

    const indicator = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.45), new THREE.MeshBasicMaterial({map: texture}));
    indicator.position.set(0, 0, 0.03);
    group.add(indicator);

    const updateText = (text) => {
        if (texture._lastText === text) return;
        ctx.fillStyle = '#050505';
        ctx.fillRect(0, 0, 256, 256);
        ctx.fillStyle = '#ffbb22';
        ctx.font = 'Bold 120px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = '#ffbb22';
        ctx.shadowBlur = 20;
        ctx.fillText(text, 128, 128);
        texture.needsUpdate = true;
        texture._lastText = text;
    };

    group.userData = {
        upArrow, downArrow, texture, updateText,
        setUp: (on) => { upArrow.material.color.set(on ? 0x00ff00 : 0x222222); upArrow.material.emissive.set(on ? 0x00ff00 : 0x000000); },
        setDown: (on) => { downArrow.material.color.set(on ? 0x00ff00 : 0x222222); downArrow.material.emissive.set(on ? 0x00ff00 : 0x000000); },
        setIndicator: updateText
    };

    return group;
}

function createWorld(scene) {
    const buildingGroup = new THREE.Group();
    buildingGroup.renderOrder = 0;

    const wallMat = new THREE.MeshStandardMaterial({color: 0x9999ff, opacity: 0.2, transparent: true, depthWrite: false, side: THREE.DoubleSide});
    const floorMat = new THREE.MeshStandardMaterial({color: 0x888888, opacity: 0.3, transparent: true, depthWrite: false, side: THREE.DoubleSide});
    const interiorWallMat = new THREE.MeshStandardMaterial({color: 0xbbc5e6, opacity: 0.28, transparent: true, depthWrite: false, side: THREE.DoubleSide});

    // Floors
    for (let f = 0; f < WORLD.FLOOR_COUNT; f++) {
        const y = f * WORLD.FLOOR_HEIGHT;
        
        // Slab
        if (f === 0 || f === WORLD.FLOOR_COUNT - 1) {
            const slab = new THREE.Mesh(new THREE.BoxGeometry(WORLD.BUILDING_WIDTH, 0.2, WORLD.BUILDING_DEPTH), floorMat);
            slab.position.y = y;
            buildingGroup.add(slab);
        } else {
            const slabGroup = new THREE.Group();
            const sw = WORLD.BUILDING_WIDTH;
            const sd = WORLD.BUILDING_DEPTH;
            const aw = WORLD.SHAFT_WIDTH;
            const ad = WORLD.SHAFT_DEPTH;
            
            const strips = [
                { w: sw, d: (sd - ad) / 2, x: 0, z: (sd + ad) / 4 },
                { w: sw, d: (sd - ad) / 2, x: 0, z: -(sd + ad) / 4 },
                { w: (sw - aw) / 2, d: ad, x: (sw + aw) / 4, z: 0 },
                { w: (sw - aw) / 2, d: ad, x: -(sw + aw) / 4, z: 0 },
            ];
            strips.forEach(s => {
                const m = new THREE.Mesh(new THREE.BoxGeometry(s.w, 0.2, s.d), floorMat);
                m.position.set(s.x, y, s.z);
                slabGroup.add(m);
            });
            buildingGroup.add(slabGroup);
        }

        // Walls
        const w = WORLD.BUILDING_WIDTH;
        const d = WORLD.BUILDING_DEPTH;
        
        // Back wall
        const backWall = new THREE.Mesh(new THREE.PlaneGeometry(w, WORLD.FLOOR_HEIGHT), wallMat);
        backWall.position.set(0, y + WORLD.FLOOR_HEIGHT/2, -d/2);
        buildingGroup.add(backWall);

        // Side walls
        const sideWallL = new THREE.Mesh(new THREE.PlaneGeometry(d, WORLD.FLOOR_HEIGHT), wallMat);
        sideWallL.position.set(-w/2, y + WORLD.FLOOR_HEIGHT/2, 0);
        sideWallL.rotation.y = Math.PI / 2;
        buildingGroup.add(sideWallL);

        const sideWallR = new THREE.Mesh(new THREE.PlaneGeometry(d, WORLD.FLOOR_HEIGHT), wallMat);
        sideWallR.position.set(w/2, y + WORLD.FLOOR_HEIGHT/2, 0);
        sideWallR.rotation.y = Math.PI / 2;
        buildingGroup.add(sideWallR);

        // Front wall
        if (f === 0) {
            const fwL = new THREE.Mesh(new THREE.PlaneGeometry((w - 3)/2, WORLD.FLOOR_HEIGHT), wallMat);
            fwL.position.set(-(w + 3)/4, y + WORLD.FLOOR_HEIGHT/2, d/2);
            fwL.rotation.y = Math.PI;
            buildingGroup.add(fwL);

            const fwR = new THREE.Mesh(new THREE.PlaneGeometry((w - 3)/2, WORLD.FLOOR_HEIGHT), wallMat);
            fwR.position.set((w + 3)/4, y + WORLD.FLOOR_HEIGHT/2, d/2);
            fwR.rotation.y = Math.PI;
            buildingGroup.add(fwR);
        } else {
            const frontWall = new THREE.Mesh(new THREE.PlaneGeometry(w, WORLD.FLOOR_HEIGHT), wallMat);
            frontWall.position.set(0, y + WORLD.FLOOR_HEIGHT/2, d/2);
            frontWall.rotation.y = Math.PI;
            buildingGroup.add(frontWall);
        }
    }

    const floors = [];
    for (let f = 0; f < WORLD.FLOOR_COUNT; f++) {
        const y = f * WORLD.FLOOR_HEIGHT;
        const nodes = {};
        const sitTargets = {};
        const desks = [];

        const addNode = (name, pos, links = []) => {
            nodes[name] = { pos: new THREE.Vector3(...pos), links };
        };

        const callPanel = createCallPanel(scene, f, new THREE.Vector3(2, y + 1, 1.6), new THREE.Euler(0, Math.PI/2, 0));
        const shaftIndicator = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({color: 0x222222}));
        shaftIndicator.position.set(0, y + 2.5, 1.6);
        buildingGroup.add(callPanel, shaftIndicator);

        if (f === 0) {
            // Lobby logic
            addNode('outside', [0, 0, 12], ['front_door_threshold']);
            addNode('front_door_threshold', [0, 0, 9.35], ['outside', 'entrance']);
            addNode('entrance', [0, 0, 7.4], ['front_door_threshold', 'lobby_center']);
            addNode('lobby_center', [0, 0, 5], ['entrance', 'elevWait', 'lobby_stand_center']);
            addNode('elevWait', [0, 0, 2], ['lobby_center', 'hallS']);
            addNode('hallS', [0, 0, 1.6], ['elevWait', 'hallSE', 'hallSW']);
            addNode('hallSE', [6, 0, 1.6], ['hallS', 'hallE']);
            addNode('hallE', [6, 0, 0], ['hallSE', 'hallNE']);
            addNode('hallNE', [6, 0, -4], ['hallE', 'hallN']);
            addNode('hallN', [0, 0, -4], ['hallNE', 'hallNW']);
            addNode('hallNW', [-6, 0, -4], ['hallN', 'hallW']);
            addNode('hallW', [-6, 0, 0], ['hallNW', 'hallSW']);
            addNode('hallSW', [-6, 0, 1.6], ['hallW', 'hallS', 'cafe_door']);
            
            addNode('cafe_door', [-7, 0, 2], ['hallSW', 'cafe_order']);
            addNode('cafe_order', [-8, 0, 3], ['cafe_door']);
            
            // Loiter spots
            const loiters = ['lobby_stand_center', 'lobby_stand_NE', 'lobby_stand_NW', 'lobby_stand_midE', 'lobby_stand_midW', 'lobby_stand_entry'];
            loiters.forEach((name, i) => {
                const pos = [Math.sin(i)*4, 0, Math.cos(i)*4 + 5];
                addNode(name, pos, ['lobby_center']);
                sitTargets[name] = { sit: false, facing: Math.random() * Math.PI * 2 };
            });

            // Lounges
            addNode('back_lounge_N', [0, 0, -6], ['hallN']);
            addNode('back_lounge_S', [0, 0, -8], ['hallN']);
            addNode('pit_N', [-4, 0, -7], ['hallNW']);
            addNode('pit_S', [-4, 0, -9], ['hallNW']);
            addNode('pit_E', [-3, 0, -8], ['hallNW']);
            addNode('pit_W', [-5, 0, -8], ['hallNW']);
            
            ['back_lounge_N', 'back_lounge_S', 'pit_N', 'pit_S', 'pit_E', 'pit_W'].forEach(n => {
                sitTargets[n] = { sit: true, facing: 0 };
            });

            addNode('lobby_wc_front', [8, 0, 6], ['hallSE']);
            addNode('lobby_wc_back', [-8, 0, -6], ['hallNW']);
            sitTargets['lobby_wc_front'] = { sit: false, facing: 0 };
            sitTargets['lobby_wc_back'] = { sit: false, facing: 0 };

            addNode('reception', [-4, 0, 6], ['lobby_center']);
            sitTargets['reception'] = { sit: false, facing: 0 };
            addNode('kiosk', [4, 0, 8], ['entrance']);
            sitTargets['kiosk'] = { sit: false, facing: 0 };

        } else {
            // Office Floor logic
            addNode('elevWait', [0, 0, 2], ['hallS']);
            addNode('hallS', [0, 0, 1.6], ['elevWait', 'hallSE', 'hallSW']);
            addNode('hallSE', [6, 0, 1.6], ['hallS', 'hallE']);
            addNode('hallE', [6, 0, 0], ['hallSE', 'hallNE']);
            addNode('hallNE', [6, 0, -4], ['hallE', 'hallN']);
            addNode('hallN', [0, 0, -4], ['hallNE', 'hallNW']);
            addNode('hallNW', [-6, 0, -4], ['hallN', 'hallW']);
            addNode('hallW', [-6, 0, 0], ['hallNW', 'hallSW']);
            addNode('hallSW', [-6, 0, 1.6], ['hallW', 'hallS', 'conf_door']);

            // Offices A, B, C, D
            const officePos = [
                { id: 'A', x: -6, z: -7 },
                { id: 'B', x: -2, z: -7 },
                { id: 'C', x: 2, z: -7 },
                { id: 'D', x: 6, z: -7 },
            ];
            officePos.forEach(off => {
                const doorName = `office${off.id}_door`;
                const deskName = `office${off.id}_desk`;
                addNode(doorName, [off.x, 0, -4.5], ['hallN', deskName]);
                addNode(deskName, [off.x, 0, -8], [doorName]);
                sitTargets[deskName] = { sit: true, facing: Math.PI };
                desks.push({ id: off.id, wpName: deskName, doorWpName: doorName });
            });

            // Conference Room
            addNode('conf_door', [-8, 0, 2], ['hallSW', 'conf_center']);
            addNode('conf_center', [-8, 0, 5], ['conf_door']);
            for (let i = 0; i < 4; i++) {
                const seatName = `conf_seat${i}`;
                const pos = i < 2 ? [-8.5, 0, 4 + i] : [-7.5, 0, 4 + i];
                addNode(seatName, pos, ['conf_center']);
                sitTargets[seatName] = { sit: true, facing: i < 2 ? Math.PI/2 : -Math.PI/2 };
            }

            // Lounge
            addNode('lounge_door', [8, 0, 2], ['hallSE', 'lounge_center']);
            addNode('lounge_center', [8, 0, 5], ['lounge_door']);
            for (let i = 0; i < 3; i++) {
                const spotName = `lounge_spot${i}`;
                addNode(spotName, [7 + i, 0, 6], ['lounge_center']);
                sitTargets[spotName] = { sit: true, facing: 0 };
            }
            addNode('water_cooler', [9, 0, 3], ['hallSE']);
            sitTargets['water_cooler'] = { sit: false, facing: -Math.PI/2 };
            addNode('hall_stand_N', [0, 0, -5], ['hallN']);
            addNode('hall_stand_S', [0, 0, 1.6], ['hallS']);
            sitTargets['hall_stand_N'] = { sit: false, facing: 0 };
            sitTargets['hall_stand_S'] = { sit: false, facing: 0 };
        }

        floors.push({
            floorNumber: f,
            nodes,
            callPanel,
            shaftIndicator,
            desks,
            sitTargets
        });
    }

    scene.add(buildingGroup);
    return {
        buildingGroup,
        floors,
        bfsPath: bfsPathFixed,
    };
}

window.WORLD = WORLD;
window.createWorld = createWorld;
window.bfsPath = bfsPathFixed;
