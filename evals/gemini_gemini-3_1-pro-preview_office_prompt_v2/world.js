const WORLD = {
    FLOOR_HEIGHT: 3.4, FLOOR_COUNT: 6,
    BUILDING_WIDTH: 22, BUILDING_DEPTH: 18,
    SHAFT_WIDTH: 3, SHAFT_DEPTH: 3,
    PERSON_R: 0.4
};

function createWorld(scene) {
    const buildingGroup = new THREE.Group();
    buildingGroup.renderOrder = 0;
    scene.add(buildingGroup);

    const matSolid = new THREE.MeshLambertMaterial({ color: 0x666666 });
    const matFloor = new THREE.MeshLambertMaterial({ color: 0x888888, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide });
    const matOuterWall = new THREE.MeshLambertMaterial({ color: 0x9999ff, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide });
    const matInnerWall = new THREE.MeshLambertMaterial({ color: 0xbbc5e6, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide });
    
    // Outer walls
    const wW = WORLD.BUILDING_WIDTH, wD = WORLD.BUILDING_DEPTH, fH = WORLD.FLOOR_HEIGHT;
    const tH = WORLD.FLOOR_COUNT * fH;

    // Left wall
    const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(wD, tH), matOuterWall);
    leftWall.rotation.y = -Math.PI / 2;
    leftWall.position.set(-wW / 2, tH / 2, 0);
    buildingGroup.add(leftWall);

    // Right wall
    const rightWall = new THREE.Mesh(new THREE.PlaneGeometry(wD, tH), matOuterWall);
    rightWall.rotation.y = Math.PI / 2;
    rightWall.position.set(wW / 2, tH / 2, 0);
    buildingGroup.add(rightWall);

    // Back wall
    const backWall = new THREE.Mesh(new THREE.PlaneGeometry(wW, tH), matOuterWall);
    backWall.rotation.y = Math.PI;
    backWall.position.set(0, tH / 2, -wD / 2);
    buildingGroup.add(backWall);

    // Front wall (with gap at floor 0)
    const frontWallLeft = new THREE.Mesh(new THREE.PlaneGeometry(wW / 2 - 1.5, tH), matOuterWall);
    frontWallLeft.position.set(-(wW / 2 + 1.5) / 2, tH / 2, wD / 2);
    buildingGroup.add(frontWallLeft);

    const frontWallRight = new THREE.Mesh(new THREE.PlaneGeometry(wW / 2 - 1.5, tH), matOuterWall);
    frontWallRight.position.set((wW / 2 + 1.5) / 2, tH / 2, wD / 2);
    buildingGroup.add(frontWallRight);

    const frontWallTop = new THREE.Mesh(new THREE.PlaneGeometry(3, tH - fH), matOuterWall);
    frontWallTop.position.set(0, fH + (tH - fH) / 2, wD / 2);
    buildingGroup.add(frontWallTop);

    // Ground and Roof
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(wW, wD), matSolid);
    ground.rotation.x = -Math.PI / 2;
    buildingGroup.add(ground);

    const roof = new THREE.Mesh(new THREE.PlaneGeometry(wW, wD), matSolid);
    roof.rotation.x = Math.PI / 2;
    roof.position.y = tH;
    buildingGroup.add(roof);

    // Sidewalk
    const sidewalk = new THREE.Mesh(new THREE.PlaneGeometry(wW, 6), matSolid);
    sidewalk.rotation.x = -Math.PI / 2;
    sidewalk.position.set(0, 0, wD / 2 + 3);
    buildingGroup.add(sidewalk);

    const floors = [];

    function addSlab(y) {
        // Four strips around shaft
        const sW = WORLD.SHAFT_WIDTH, sD = WORLD.SHAFT_DEPTH;
        const mat = matFloor;
        
        // Left
        const left = new THREE.Mesh(new THREE.PlaneGeometry((wW - sW) / 2, wD), mat);
        left.rotation.x = -Math.PI / 2; left.position.set(-(wW + sW) / 4, y, 0); buildingGroup.add(left);
        // Right
        const right = new THREE.Mesh(new THREE.PlaneGeometry((wW - sW) / 2, wD), mat);
        right.rotation.x = -Math.PI / 2; right.position.set((wW + sW) / 4, y, 0); buildingGroup.add(right);
        // Front
        const front = new THREE.Mesh(new THREE.PlaneGeometry(sW, (wD - sD) / 2), mat);
        front.rotation.x = -Math.PI / 2; front.position.set(0, y, (wD + sD) / 4); buildingGroup.add(front);
        // Back
        const back = new THREE.Mesh(new THREE.PlaneGeometry(sW, (wD - sD) / 2), mat);
        back.rotation.x = -Math.PI / 2; back.position.set(0, y, -(wD + sD) / 4); buildingGroup.add(back);
    }

    for (let i = 1; i < WORLD.FLOOR_COUNT; i++) addSlab(i * fH);

    // Helper to create UI text texture
    function createTextTexture(w, h) {
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        const tex = new THREE.CanvasTexture(canvas);
        tex.minFilter = THREE.LinearFilter;
        tex.anisotropy = 4;
        tex._canvas = canvas; tex._ctx = ctx; tex._lastText = null;
        return tex;
    }

    function updateTextTexture(tex, text) {
        if (tex._lastText === text) return;
        tex._lastText = text;
        const ctx = tex._ctx;
        ctx.fillStyle = '#050505';
        ctx.fillRect(0, 0, tex._canvas.width, tex._canvas.height);
        ctx.font = `bold ${Math.floor(tex._canvas.height * 0.82)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffbb22';
        ctx.shadowColor = '#ffbb22';
        ctx.shadowBlur = 10;
        ctx.fillText(text, tex._canvas.width / 2, tex._canvas.height / 2);
        ctx.shadowBlur = 0;
        tex.needsUpdate = true;
    }

    function createCallPanel(floorNum) {
        const panelGroup = new THREE.Group();
        const base = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.4, 0.05), new THREE.MeshLambertMaterial({color:0x333333}));
        panelGroup.add(base);

        const shapeUp = new THREE.Shape();
        shapeUp.moveTo(-0.13, -0.13); shapeUp.lineTo(0.13, -0.13); shapeUp.lineTo(0, 0.13);
        const geoUp = new THREE.ShapeGeometry(shapeUp);
        const matUp = new THREE.MeshBasicMaterial({color: 0x111111});
        const meshUp = new THREE.Mesh(geoUp, matUp);
        meshUp.position.set(0, 0.4, 0.03);
        panelGroup.add(meshUp);

        const shapeDown = new THREE.Shape();
        shapeDown.moveTo(-0.13, 0.13); shapeDown.lineTo(0.13, 0.13); shapeDown.lineTo(0, -0.13);
        const geoDown = new THREE.ShapeGeometry(shapeDown);
        const matDown = new THREE.MeshBasicMaterial({color: 0x111111});
        const meshDown = new THREE.Mesh(geoDown, matDown);
        meshDown.position.set(0, 0.0, 0.03);
        panelGroup.add(meshDown);

        const tex = createTextTexture(256, 256);
        const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.45), new THREE.MeshBasicMaterial({map: tex}));
        screen.position.set(0, -0.4, 0.026);
        panelGroup.add(screen);

        updateTextTexture(tex, floorNum.toString());

        panelGroup.userData = {
            setUp: (on) => { matUp.color.setHex(on ? 0x00ff00 : 0x111111); },
            setDown: (on) => { matDown.color.setHex(on ? 0x00ff00 : 0x111111); },
            setIndicator: (text) => { updateTextTexture(tex, text); }
        };

        return panelGroup;
    }

    function createShaftIndicator() {
        const tex = createTextTexture(256, 256);
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({map: tex}));
        mesh.userData = { setIndicator: (text) => updateTextTexture(tex, text) };
        return mesh;
    }

    function buildGraph() {
        // Will populate floors array
    }

    // Graph node definitions
    const graphNodes = {}; 
    // Format: graphNodes[floorNum] = { nodeName: new THREE.Vector3(), ... }
    const graphEdges = {};
    // Format: graphEdges[floorNum] = { nodeName: [adjNodeName1, ...], ... }
    
    function addNode(f, name, x, z) {
        if (!graphNodes[f]) { graphNodes[f] = {}; graphEdges[f] = {}; }
        graphNodes[f][name] = new THREE.Vector3(x, f * fH, z);
        graphEdges[f][name] = [];
    }
    
    function addEdge(f, n1, n2) {
        if (!graphEdges[f][n1].includes(n2)) graphEdges[f][n1].push(n2);
        if (!graphEdges[f][n2].includes(n1)) graphEdges[f][n2].push(n1);
    }

    function buildFloorLayouts() {
        for (let i = 0; i < WORLD.FLOOR_COUNT; i++) {
            const y = i * fH;
            const nodes = {};
            const edges = {};
            const sitTargets = {};
            const floorData = { floorNumber: i, nodes, callPanel: null, shaftIndicator: null, desks: [], sitTargets };
            floors.push(floorData);

            // Call panel
            const panel = createCallPanel(i);
            panel.position.set(1.8, y + 1.4, 1.55);
            buildingGroup.add(panel);
            floorData.callPanel = panel;

            // Shaft indicator
            const ind = createShaftIndicator();
            ind.position.set(0, y + 2.5, 1.51);
            buildingGroup.add(ind);
            floorData.shaftIndicator = ind;

            // Common hallway nodes
            addNode(i, 'hallS', 0, 4);
            addNode(i, 'hallSE', 5, 4);
            addNode(i, 'hallE', 5, 0);
            addNode(i, 'hallNE', 5, -4);
            addNode(i, 'hallN', 0, -4);
            addNode(i, 'hallNW', -5, -4);
            addNode(i, 'hallW', -5, 0);
            addNode(i, 'hallSW', -5, 4);
            addNode(i, 'elevWait', 0, 2.5);
            
            addEdge(i, 'elevWait', 'hallS');
            addEdge(i, 'hallS', 'hallSE'); addEdge(i, 'hallSE', 'hallE'); addEdge(i, 'hallE', 'hallNE');
            addEdge(i, 'hallNE', 'hallN'); addEdge(i, 'hallN', 'hallNW'); addEdge(i, 'hallNW', 'hallW');
            addEdge(i, 'hallW', 'hallSW'); addEdge(i, 'hallSW', 'hallS');

            if (i > 0) {
                // Office floor
                // 4 private offices back
                const offNames = ['officeA', 'officeB', 'officeC', 'officeD'];
                const offX = [-7.5, -2.5, 2.5, 7.5];
                for(let j=0; j<4; j++) {
                    const doorN = offNames[j] + '_door';
                    const deskN = offNames[j] + '_desk';
                    addNode(i, doorN, offX[j], -6.5);
                    addNode(i, deskN, offX[j], -8.0); // behind desk
                    addEdge(i, doorN, deskN);
                    // connect door to nearest hall
                    addEdge(i, doorN, offX[j] < 0 ? (offX[j] < -5 ? 'hallNW' : 'hallN') : (offX[j] > 5 ? 'hallNE' : 'hallN'));
                    sitTargets[deskN] = { sit: true, facing: Math.PI }; // Facing +Z (towards screen)
                    floorData.desks.push({ id: `f${i}_d${j}`, wpName: deskN, doorWpName: doorN });
                    
                    // Simple desk visual
                    const deskMesh = new THREE.Mesh(new THREE.BoxGeometry(2, 0.8, 1), matSolid);
                    deskMesh.position.set(offX[j], y + 0.4, -7);
                    buildingGroup.add(deskMesh);
                }

                // Conference room SW
                addNode(i, 'conf_door', -7.5, 3.0);
                addEdge(i, 'conf_door', 'hallSW');
                addNode(i, 'conf_center', -7.5, 6.0);
                addEdge(i, 'conf_door', 'conf_center');
                for(let k=0; k<4; k++) {
                    const seatN = `conf_seat${k}`;
                    const sx = -7.5 + (k%2 === 0 ? -1 : 1);
                    const sz = 6.0 + (k<2 ? -1 : 1);
                    addNode(i, seatN, sx, sz);
                    addEdge(i, 'conf_center', seatN);
                    sitTargets[seatN] = { sit: true, facing: k%2===0 ? Math.PI/2 : -Math.PI/2 };
                }

                // Lounge SE
                addNode(i, 'lounge_door', 7.5, 3.0);
                addEdge(i, 'lounge_door', 'hallSE');
                addNode(i, 'lounge_center', 7.5, 6.0);
                addEdge(i, 'lounge_door', 'lounge_center');
                for(let k=0; k<3; k++) {
                    const spotN = `lounge_spot${k}`;
                    addNode(i, spotN, 6 + k, 7);
                    addEdge(i, 'lounge_center', spotN);
                    sitTargets[spotN] = { sit: true, facing: Math.PI };
                }
                addNode(i, 'water_cooler', 9.5, 4.0);
                addEdge(i, 'lounge_center', 'water_cooler');
                sitTargets['water_cooler'] = { sit: false, facing: 0 };
                
                addNode(i, 'hall_stand_N', 0, -2);
                addEdge(i, 'hall_stand_N', 'hallN');
                sitTargets['hall_stand_N'] = { sit: false, facing: 0 };

                addNode(i, 'hall_stand_S', 3, 2);
                addEdge(i, 'hall_stand_S', 'hallS');
                sitTargets['hall_stand_S'] = { sit: false, facing: 0 };

            } else {
                // Lobby floor 0
                addNode(0, 'entrance', 0, 8);
                addNode(0, 'outside', 0, 12);
                addEdge(0, 'entrance', 'outside');
                addEdge(0, 'entrance', 'elevWait'); // direct

                // Cafe Left
                addNode(0, 'cafe_door', -6, 4);
                addEdge(0, 'cafe_door', 'hallSW');
                addNode(0, 'cafe_order', -8, 6);
                addEdge(0, 'cafe_door', 'cafe_order');
                sitTargets['cafe_order'] = { sit: false, facing: -Math.PI/2 };

                for(let k=0; k<4; k++) {
                    addNode(0, `bistro_${k}`, -6 - (k%2)*2, 8 + Math.floor(k/2)*2);
                    addEdge(0, 'cafe_door', `bistro_${k}`);
                    sitTargets[`bistro_${k}`] = { sit: true, facing: Math.random()*Math.PI*2 };
                }

                // Front Lounge Right
                addNode(0, 'front_lounge_door', 6, 4);
                addEdge(0, 'front_lounge_door', 'hallSE');
                for(let k=0; k<4; k++) {
                    addNode(0, `front_lounge_${k}`, 6 + (k%2)*2, 6 + Math.floor(k/2)*2);
                    addEdge(0, 'front_lounge_door', `front_lounge_${k}`);
                    sitTargets[`front_lounge_${k}`] = { sit: true, facing: Math.random()*Math.PI*2 };
                }

                // Back lounge
                addNode(0, 'back_lounge_N', 6, -6);
                addNode(0, 'back_lounge_S', 6, -4);
                addEdge(0, 'hallNE', 'back_lounge_N');
                addEdge(0, 'hallNE', 'back_lounge_S');
                sitTargets['back_lounge_N'] = { sit: true, facing: 0 };
                sitTargets['back_lounge_S'] = { sit: true, facing: Math.PI };

                // Conversation pit
                ['N','S','E','W'].forEach((dir, i) => {
                    const wp = `pit_${dir}`;
                    const ang = i * Math.PI/2;
                    addNode(0, wp, -6 + Math.sin(ang)*1.5, -5 + Math.cos(ang)*1.5);
                    addEdge(0, 'hallNW', wp);
                    sitTargets[wp] = { sit: true, facing: ang + Math.PI };
                });

                // Water coolers
                addNode(0, 'lobby_wc_front', 9, 3);
                addEdge(0, 'hallSE', 'lobby_wc_front');
                sitTargets['lobby_wc_front'] = { sit: false, facing: Math.PI/2 };
                
                addNode(0, 'lobby_wc_back', -9, -3);
                addEdge(0, 'hallNW', 'lobby_wc_back');
                sitTargets['lobby_wc_back'] = { sit: false, facing: -Math.PI/2 };

                // Reception & Kiosk
                addNode(0, 'reception', -3, 6);
                addEdge(0, 'hallS', 'reception');
                sitTargets['reception'] = { sit: false, facing: 0 };
                
                addNode(0, 'kiosk', 3, 7);
                addEdge(0, 'hallS', 'kiosk');
                sitTargets['kiosk'] = { sit: false, facing: 0 };

                // Loiter spots
                ['center','NE','NW','midE','midW','entry'].forEach((v, idx) => {
                    const wp = `lobby_stand_${v}`;
                    addNode(0, wp, (idx%3-1)*3, (idx%2)*3);
                    addEdge(0, 'hallS', wp);
                    sitTargets[wp] = { sit: false, facing: Math.random()*Math.PI*2 };
                });
            }

            // Copy nodes and edges to floorData
            floorData.nodes = graphNodes[i];
            floorData.edges = graphEdges[i];
        }
    }

    buildFloorLayouts();

    function bfsPath(f, fromName, toName) {
        if (fromName === toName) return [graphNodes[f][toName]];
        const edges = floors[f].edges;
        const q = [fromName];
        const cameFrom = { [fromName]: null };
        
        while(q.length > 0) {
            const cur = q.shift();
            if (cur === toName) break;
            (edges[cur] || []).forEach(nxt => {
                if (cameFrom[nxt] === undefined) {
                    cameFrom[nxt] = cur;
                    q.push(nxt);
                }
            });
        }
        
        if (cameFrom[toName] === undefined) return [graphNodes[f][fromName]];
        const path = [];
        let curr = toName;
        while(curr !== null) {
            path.push(graphNodes[f][curr]);
            curr = cameFrom[curr];
        }
        return path.reverse();
    }

    return { buildingGroup, floors, bfsPath };
}
