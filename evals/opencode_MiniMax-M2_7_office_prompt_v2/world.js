/**
 * Building geometry, per-floor layouts, furniture, navigation graph, call panels.
 */
(function(root) {
    'use strict';

    const WORLD = {
        FLOOR_HEIGHT: 3.4,
        FLOOR_COUNT: 6,
        BUILDING_WIDTH: 22,
        BUILDING_DEPTH: 18,
        SHAFT_WIDTH: 3,
        SHAFT_DEPTH: 3,
        PERSON_R: 0.4
    };

    const FLOOR_NAMES = ['Lobby', 'Floor 1', 'Floor 2', 'Floor 3', 'Floor 4', 'Floor 5'];

    const HALL_RADIUS = 2.8;
    const HALL_NODE_POSITIONS = {
        hallS: { x: 0, z: HALL_RADIUS },
        hallSE: { x: HALL_RADIUS * 0.7, z: HALL_RADIUS * 0.7 },
        hallE: { x: HALL_RADIUS, z: 0 },
        hallNE: { x: HALL_RADIUS * 0.7, z: -HALL_RADIUS * 0.7 },
        hallN: { x: 0, z: -HALL_RADIUS },
        hallNW: { x: -HALL_RADIUS * 0.7, z: -HALL_RADIUS * 0.7 },
        hallW: { x: -HALL_RADIUS, z: 0 },
        hallSW: { x: -HALL_RADIUS * 0.7, z: HALL_RADIUS * 0.7 },
        elevWait: { x: 0, z: HALL_RADIUS + 1.2 }
    };

    function createTextTexture(text, options = {}) {
        options = options || {};
        const fgColor = options.fgColor || '#ffbb22';
        const bgColor = options.bgColor || '#050505';
        const canvas = document.createElement('canvas');
        canvas.width = options.width || 128;
        canvas.height = options.height || 128;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = fgColor;
        ctx.font = `bold ${Math.floor(canvas.height * 0.75)}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = fgColor;
        ctx.shadowBlur = 8;
        ctx.fillText(text, canvas.width / 2, canvas.height / 2);
        const texture = new THREE.CanvasTexture(canvas);
        texture._lastText = text;
        if (options.minFilter) texture.minFilter = options.minFilter;
        if (options.magFilter) texture.magFilter = options.magFilter;
        texture.needsUpdate = true;
        return texture;
    }

    function updateTextTexture(texture, text) {
        if (texture._lastText === text) return false;
        texture._lastText = text;
        const canvas = texture.image;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#050505';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#ffbb22';
        ctx.font = `bold ${Math.floor(canvas.height * 0.75)}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = '#ffbb22';
        ctx.shadowBlur = 8;
        ctx.fillText(text, canvas.width / 2, canvas.height / 2);
        texture.needsUpdate = true;
        return true;
    }

    function createCallPanel(scene, x, y, z, rotationY = 0) {
        const group = new THREE.Group();
        group.position.set(x, y, z);
        group.rotation.y = rotationY;

        const panelMat = new THREE.MeshLambertMaterial({
            color: 0x333344,
            transparent: true,
            opacity: 0.9
        });
        const panel = new THREE.Mesh(
            new THREE.BoxGeometry(0.55, 1.4, 0.08),
            panelMat
        );
        group.add(panel);

        const darkMat = new THREE.MeshBasicMaterial({ color: 0x333333 });
        const upArrow = createArrowShape(true);
        const upMesh = new THREE.Mesh(
            new THREE.ShapeGeometry(upArrow),
            darkMat.clone()
        );
        upMesh.position.set(-0.15, 0.4, 0.05);
        group.add(upMesh);
        group.userData.upArrow = upMesh;

        const downArrow = createArrowShape(false);
        const downMesh = new THREE.Mesh(
            new THREE.ShapeGeometry(downArrow),
            darkMat.clone()
        );
        downMesh.position.set(-0.15, -0.4, 0.05);
        group.add(downMesh);
        group.userData.downArrow = downMesh;

        const indicatorCanvas = document.createElement('canvas');
        indicatorCanvas.width = 128;
        indicatorCanvas.height = 128;
        const indicatorTex = new THREE.CanvasTexture(indicatorCanvas);
        indicatorTex.minFilter = THREE.LinearFilter;
        indicatorTex.magFilter = THREE.LinearFilter;
        const indicatorMat = new THREE.MeshBasicMaterial({ map: indicatorTex });
        const indicatorMesh = new THREE.Mesh(
            new THREE.PlaneGeometry(0.45, 0.45),
            indicatorMat
        );
        indicatorMesh.position.set(0.12, 0, 0.05);
        group.add(indicatorMesh);
        group.userData.indicatorTex = indicatorTex;

        updateTextTexture(indicatorTex, '0');

        group.userData.setUp = function(on) {
            if (upMesh.material.color) {
                upMesh.material.color.setHex(on ? 0x00ff00 : 0x333333);
                upMesh.material.emissive = on ? new THREE.Color(0x00ff00) : new THREE.Color(0x000000);
            }
        };

        group.userData.setDown = function(on) {
            if (downMesh.material.color) {
                downMesh.material.color.setHex(on ? 0x00ff00 : 0x333333);
                downMesh.material.emissive = on ? new THREE.Color(0x00ff00) : new THREE.Color(0x000000);
            }
        };

        group.userData.setIndicator = function(text) {
            updateTextTexture(indicatorTex, text);
        };

        group.userData.panel = true;
        scene.add(group);
        return group;
    }

    function createArrowShape(pointUp) {
        const shape = new THREE.Shape();
        const hw = 0.13;
        const hh = 0.18;
        if (pointUp) {
            shape.moveTo(0, hh);
            shape.lineTo(hw, 0);
            shape.lineTo(-hw, 0);
        } else {
            shape.moveTo(0, -hh);
            shape.lineTo(hw, 0);
            shape.lineTo(-hw, 0);
        }
        shape.lineTo(0, pointUp ? hh : -hh);
        return shape;
    }

    function createShaftIndicator(scene, x, y, z) {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const tex = new THREE.CanvasTexture(canvas);
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        const mat = new THREE.MeshBasicMaterial({ map: tex });
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), mat);
        mesh.position.set(x, y, z);
        mesh.rotation.x = -Math.PI / 2;
        scene.add(mesh);
        updateTextTexture(tex, '0');
        return { mesh, tex };
    }

    function createInCarIndicator(scene, x, y, z) {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const tex = new THREE.CanvasTexture(canvas);
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        const mat = new THREE.MeshBasicMaterial({ map: tex });
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), mat);
        mesh.position.set(x, y, z);
        scene.add(mesh);
        updateTextTexture(tex, '0');
        return { mesh, tex };
    }

    function buildFloorLayout(floorNumber, scene, buildingGroup) {
        const y = floorNumber * WORLD.FLOOR_HEIGHT;
        const isLobby = floorNumber === 0;
        const isOffice = floorNumber >= 1;

        const transMat = new THREE.MeshLambertMaterial({
            color: 0xbbc5e6,
            transparent: true,
            opacity: 0.28,
            depthWrite: false,
            side: THREE.DoubleSide
        });

        const desks = [];
        const nodes = {};
        const sitTargets = {};

        function addNode(name, x, z, linkNames, options = {}) {
            options = options || {};
            nodes[name] = new THREE.Vector3(x, y, z);
            if (options.sit !== undefined) {
                sitTargets[name] = {
                    sit: options.sit,
                    facing: options.facing || 0
                };
            }
            if (options.desk) {
                desks.push({ name, x, z, floor: floorNumber });
            }
            if (linkNames) {
                if (!nodes._links) nodes._links = {};
                nodes._links[name] = linkNames;
            }
        }

        const hw = WORLD.BUILDING_WIDTH / 2;
        const hd = WORLD.BUILDING_DEPTH / 2;
        const sw = WORLD.SHAFT_WIDTH / 2;
        const sd = WORLD.SHAFT_DEPTH / 2;

        const hwShaft = hw - sw - 1;
        const hdShaft = hd - sd - 1;

        for (const [name, pos] of Object.entries(HALL_NODE_POSITIONS)) {
            const nodeName = floorNumber === 0 ? name : `${floorNumber}_${name}`;
            const fullName = isLobby ? name : nodeName;
            if (name === 'elevWait') {
                addNode(fullName, pos.x, pos.z, [floorNumber === 0 ? 'hallS' : `${floorNumber}_hallS`]);
            } else {
                addNode(fullName, pos.x, pos.z, null);
            }
        }

        if (isLobby) {
            addNode('entrance', 0, y, ['elevWait']);
            addNode('outside', 0, y + 3, ['entrance']);
            addNode('cafe_door', -hwShaft, 0, ['hallSW']);
            addNode('cafe_order', -hwShaft + 1, 0, null, { sit: false });
            addNode('bistro1', -hwShaft + 2.5, 2, ['cafe_door']);
            addNode('bistro2', -hwShaft + 2.5, -2, ['cafe_door']);
            addNode('reception', -3, y + 6, null, { sit: false });
            addNode('kiosk', 2, y + 8, null, { sit: false });
            addNode('lobby_wc_front', -hwShaft + 1, hdShaft - 2, null, { sit: false });
            addNode('lobby_wc_back', -hwShaft + 1, -hdShaft + 2, null, { sit: false });
            addNode('lobby_stand_center', 0, y, null, { sit: false });
            addNode('lobby_stand_NE', 4, 4, null, { sit: false });
            addNode('lobby_stand_NW', -4, 4, null, { sit: false });
            addNode('lobby_stand_midE', 4, 0, null, { sit: false });
            addNode('lobby_stand_midW', -4, 0, null, { sit: false });
            addNode('lobby_stand_entry', 0, y + 6, null, { sit: false });
            addNode('back_lounge_N', -hwShaft + 1, -hdShaft + 3, null, { sit: true, facing: Math.PI });
            addNode('back_lounge_S', -hwShaft + 1, -hdShaft - 1, null, { sit: true, facing: 0 });
            addNode('pit_N', -hwShaft - 2, -hdShaft + 2, null, { sit: true, facing: Math.PI / 2 });
            addNode('pit_S', -hwShaft - 2, -hdShaft - 2, null, { sit: true, facing: -Math.PI / 2 });
            addNode('pit_E', -hwShaft - 4, 0, null, { sit: true, facing: 0 });
            addNode('pit_W', -hwShaft, 0, null, { sit: true, facing: Math.PI });
            addNode('front_lounge_1', hwShaft - 1, hdShaft - 2, null, { sit: true, facing: Math.PI });
            addNode('front_lounge_2', hwShaft - 1, hdShaft - 4, null, { sit: true, facing: Math.PI });

        } else if (isOffice) {
            addNode(`${floorNumber}_officeA_door`, -hwShaft, -hdShaft + 3, [`${floorNumber}_hallNW`]);
            addNode(`${floorNumber}_officeA_desk`, -hwShaft, -hdShaft + 4.5, null, { sit: true, facing: Math.PI, desk: true });
            addNode(`${floorNumber}_officeB_door`, -hwShaft, -hdShaft / 2 + 2, [`${floorNumber}_hallN`]);
            addNode(`${floorNumber}_officeB_desk`, -hwShaft, -hdShaft / 2 + 3.5, null, { sit: true, facing: Math.PI, desk: true });
            addNode(`${floorNumber}_officeC_door`, hwShaft, -hdShaft + 3, [`${floorNumber}_hallNE`]);
            addNode(`${floorNumber}_officeC_desk`, hwShaft, -hdShaft + 4.5, null, { sit: true, facing: Math.PI, desk: true });
            addNode(`${floorNumber}_officeD_door`, hwShaft, -hdShaft / 2 + 2, [`${floorNumber}_hallE`]);
            addNode(`${floorNumber}_officeD_desk`, hwShaft, -hdShaft / 2 + 3.5, null, { sit: true, facing: Math.PI, desk: true });

            addNode(`${floorNumber}_conf_door`, -hwShaft, hdShaft - 1, [`${floorNumber}_hallSW`]);
            addNode(`${floorNumber}_conf_center`, -hwShaft + 1, hdShaft - 4, null);
            addNode(`${floorNumber}_conf_seat0`, -hwShaft + 1, hdShaft - 2, null, { sit: true, facing: 0 });
            addNode(`${floorNumber}_conf_seat1`, -hwShaft + 3, hdShaft - 4, null, { sit: true, facing: Math.PI / 2 });
            addNode(`${floorNumber}_conf_seat2`, -hwShaft + 1, hdShaft - 6, null, { sit: true, facing: Math.PI });
            addNode(`${floorNumber}_conf_seat3`, -hwShaft - 1, hdShaft - 4, null, { sit: true, facing: -Math.PI / 2 });

            addNode(`${floorNumber}_lounge_door`, hwShaft, hdShaft - 1, [`${floorNumber}_hallSE`]);
            addNode(`${floorNumber}_lounge_center`, hwShaft - 2, hdShaft - 4, null);
            addNode(`${floorNumber}_lounge_spot0`, hwShaft - 2, hdShaft - 2, null, { sit: true, facing: Math.PI });
            addNode(`${floorNumber}_lounge_spot1`, hwShaft - 2, hdShaft - 5, null, { sit: true, facing: 0 });
            addNode(`${floorNumber}_lounge_spot2`, hwShaft - 4, hdShaft - 3.5, null, { sit: true, facing: Math.PI / 2 });
            addNode(`${floorNumber}_water_cooler`, hwShaft - 3, hdShaft - 6, null, { sit: false });
            addNode(`${floorNumber}_hall_stand_N`, 0, -hdShaft + 2, null, { sit: false });
            addNode(`${floorNumber}_hall_stand_S`, 0, hdShaft - 2, null, { sit: false });
        }

        nodes._links = {};
        for (const [name, pos] of Object.entries(HALL_NODE_POSITIONS)) {
            const fullName = isLobby ? name : `${floorNumber}_${name}`;
            const linked = [];
            for (const [otherName, otherPos] of Object.entries(HALL_NODE_POSITIONS)) {
                const otherFullName = isLobby ? otherName : `${floorNumber}_${otherName}`;
                if (otherName !== name) {
                    const dist = Math.sqrt(Math.pow(pos.x - otherPos.x, 2) + Math.pow(pos.z - otherPos.z, 2));
                    if (dist < HALL_RADIUS * 1.5) {
                        linked.push(otherFullName);
                    }
                }
            }
            nodes._links[fullName] = linked;
        }

        return { nodes, desks, sitTargets };
    }

    function buildFloorGeometry(floorNumber, scene, buildingGroup) {
        const y = floorNumber * WORLD.FLOOR_HEIGHT;
        const isLobby = floorNumber === 0;

        const slabMat = new THREE.MeshLambertMaterial({
            color: 0x888888,
            transparent: true,
            opacity: 0.3,
            depthWrite: false,
            side: THREE.DoubleSide
        });

        const wallMat = new THREE.MeshLambertMaterial({
            color: 0x9999ff,
            transparent: true,
            opacity: 0.2,
            depthWrite: false,
            side: THREE.DoubleSide
        });

        const interiorMat = new THREE.MeshLambertMaterial({
            color: 0xbbc5e6,
            transparent: true,
            opacity: 0.28,
            depthWrite: false,
            side: THREE.DoubleSide
        });

        const hw = WORLD.BUILDING_WIDTH / 2;
        const hd = WORLD.BUILDING_DEPTH / 2;
        const sw = WORLD.SHAFT_WIDTH / 2;
        const sd = WORLD.SHAFT_DEPTH / 2;
        const wallThick = 0.3;

        const floorSlab = new THREE.Mesh(
            new THREE.BoxGeometry(WORLD.BUILDING_WIDTH, 0.4, WORLD.BUILDING_DEPTH),
            slabMat
        );
        floorSlab.position.y = y - 0.2;
        floorSlab.renderOrder = 0;
        buildingGroup.add(floorSlab);

        if (floorNumber > 0) {
            const strips = [
                { w: WORLD.BUILDING_WIDTH, d: (hd - sd), x: 0, z: -(sd + (hd - sd) / 2) },
                { w: (hw - sw), d: WORLD.SHAFT_DEPTH, x: -(hw + (hw - sw) / 2), z: 0 },
                { w: (hw - sw), d: WORLD.SHAFT_DEPTH, x: (hw + (hw - sw) / 2), z: 0 },
                { w: WORLD.BUILDING_WIDTH, d: (hd - sd), x: 0, z: (sd + (hd - sd) / 2) }
            ];
            for (const strip of strips) {
                const mesh = new THREE.Mesh(
                    new THREE.BoxGeometry(strip.w, 0.4, strip.d),
                    slabMat
                );
                mesh.position.set(strip.x, y - 0.2, strip.z);
                mesh.renderOrder = 0;
                buildingGroup.add(mesh);
            }
        }

        if (floorNumber === 0) {
            const frontLeft = new THREE.Mesh(
                new THREE.BoxGeometry(hw - 1.5, WORLD.FLOOR_HEIGHT, wallThick),
                wallMat
            );
            frontLeft.position.set(-(hw + 1.5) / 2, y + WORLD.FLOOR_HEIGHT / 2, hd + wallThick / 2);
            buildingGroup.add(frontLeft);

            const frontRight = new THREE.Mesh(
                new THREE.BoxGeometry(hw - 1.5, WORLD.FLOOR_HEIGHT, wallThick),
                wallMat
            );
            frontRight.position.set((hw + 1.5) / 2, y + WORLD.FLOOR_HEIGHT / 2, hd + wallThick / 2);
            buildingGroup.add(frontRight);

            const frontUpper = new THREE.Mesh(
                new THREE.BoxGeometry(hw * 2, WORLD.FLOOR_HEIGHT, wallThick),
                wallMat
            );
            frontUpper.position.set(0, y + WORLD.FLOOR_HEIGHT / 2, -hd - wallThick / 2);
            buildingGroup.add(frontUpper);
        } else {
            const frontWall = new THREE.Mesh(
                new THREE.BoxGeometry(WORLD.BUILDING_WIDTH, WORLD.FLOOR_HEIGHT, wallThick),
                wallMat
            );
            frontWall.position.set(0, y + WORLD.FLOOR_HEIGHT / 2, hd + wallThick / 2);
            buildingGroup.add(frontWall);
        }

        const backWall = new THREE.Mesh(
            new THREE.BoxGeometry(WORLD.BUILDING_WIDTH, WORLD.FLOOR_HEIGHT, wallThick),
            wallMat
        );
        backWall.position.set(0, y + WORLD.FLOOR_HEIGHT / 2, -hd - wallThick / 2);
        buildingGroup.add(backWall);

        const leftWall = new THREE.Mesh(
            new THREE.BoxGeometry(wallThick, WORLD.FLOOR_HEIGHT, WORLD.BUILDING_DEPTH),
            wallMat
        );
        leftWall.position.set(-hw - wallThick / 2, y + WORLD.FLOOR_HEIGHT / 2, 0);
        buildingGroup.add(leftWall);

        const rightWall = new THREE.Mesh(
            new THREE.BoxGeometry(wallThick, WORLD.FLOOR_HEIGHT, WORLD.BUILDING_DEPTH),
            wallMat
        );
        rightWall.position.set(hw + wallThick / 2, y + WORLD.FLOOR_HEIGHT / 2, 0);
        buildingGroup.add(rightWall);

        const shaftWalls = [
            { x: -sw - wallThick / 2, z: 0, w: wallThick, d: WORLD.SHAFT_DEPTH },
            { x: sw + wallThick / 2, z: 0, w: wallThick, d: WORLD.SHAFT_DEPTH },
            { x: 0, z: -sd - wallThick / 2, w: WORLD.SHAFT_WIDTH, d: wallThick },
            { x: 0, z: sd + wallThick / 2, w: WORLD.SHAFT_WIDTH, d: wallThick }
        ];
        for (const swall of shaftWalls) {
            const mesh = new THREE.Mesh(
                new THREE.BoxGeometry(swall.w, WORLD.FLOOR_HEIGHT, swall.d),
                new THREE.MeshLambertMaterial({ color: 0x8888ff, transparent: true, opacity: 0.3 })
            );
            mesh.position.set(swall.x, y + WORLD.FLOOR_HEIGHT / 2, swall.z);
            buildingGroup.add(mesh);
        }

        if (floorNumber >= 1) {
            const interiorWalls = [
                { x: -hw + 4, z: 0, w: wallThick, d: WORLD.BUILDING_DEPTH - 2 },
                { x: hw - 4, z: 0, w: wallThick, d: WORLD.BUILDING_DEPTH - 2 },
                { x: 0, z: -hd + 5, w: WORLD.BUILDING_WIDTH - 6, d: wallThick },
                { x: 0, z: -hd + 8, w: WORLD.BUILDING_WIDTH - 14, d: wallThick },
                { x: -hw + 6, z: hd - 6, w: 8, d: wallThick },
                { x: hw - 6, z: hd - 6, w: 8, d: wallThick }
            ];
            for (const iw of interiorWalls) {
                const mesh = new THREE.Mesh(
                    new THREE.BoxGeometry(iw.w, WORLD.FLOOR_HEIGHT * 0.8, iw.d),
                    interiorMat
                );
                mesh.position.set(iw.x, y + WORLD.FLOOR_HEIGHT * 0.4, iw.z);
                buildingGroup.add(mesh);
            }
        }

        return buildingGroup;
    }

    function buildFurniture(floorNumber, scene, buildingGroup) {
        const y = floorNumber * WORLD.FLOOR_HEIGHT;
        const isLobby = floorNumber === 0;
        const isOffice = floorNumber >= 1;

        const deskMat = new THREE.MeshLambertMaterial({ color: 0x8b4513 });
        const chairMat = new THREE.MeshLambertMaterial({ color: 0x444444 });
        const couchMat = new THREE.MeshLambertMaterial({ color: 0x664422 });
        const tableMat = new THREE.MeshLambertMaterial({ color: 0x5c4033 });
        const coolerMat = new THREE.MeshLambertMaterial({ color: 0x88aacc });
        const plantMat = new THREE.MeshLambertMaterial({ color: 0x228b22 });

        function addDesk(x, z, rotationY = 0) {
            const group = new THREE.Group();
            const top = new THREE.Mesh(
                new THREE.BoxGeometry(1.4, 0.08, 0.7),
                deskMat
            );
            top.position.y = 0.75;
            group.add(top);

            const legGeo = new THREE.BoxGeometry(0.06, 0.75, 0.06);
            const positions = [[-0.6, 0.375, -0.25], [0.6, 0.375, -0.25], [-0.6, 0.375, 0.25], [0.6, 0.375, 0.25]];
            for (const p of positions) {
                const leg = new THREE.Mesh(legGeo, deskMat);
                leg.position.set(...p);
                group.add(leg);
            }

            const monitor = new THREE.Mesh(
                new THREE.BoxGeometry(0.4, 0.3, 0.05),
                new THREE.MeshLambertMaterial({ color: 0x222222 })
            );
            monitor.position.set(0, 0.95, -0.3);
            group.add(monitor);

            group.position.set(x, y, z);
            group.rotation.y = rotationY;
            buildingGroup.add(group);
        }

        function addChair(x, z, rotationY = 0) {
            const group = new THREE.Group();
            const seat = new THREE.Mesh(
                new THREE.BoxGeometry(0.45, 0.08, 0.45),
                chairMat
            );
            seat.position.y = 0.45;
            group.add(seat);

            const backrest = new THREE.Mesh(
                new THREE.BoxGeometry(0.45, 0.5, 0.06),
                chairMat
            );
            backrest.position.set(0, 0.75, -0.2);
            group.add(backrest);

            const legGeo = new THREE.BoxGeometry(0.05, 0.45, 0.05);
            const positions = [[-0.17, 0.225, -0.17], [0.17, 0.225, -0.17], [-0.17, 0.225, 0.17], [0.17, 0.225, 0.17]];
            for (const p of positions) {
                const leg = new THREE.Mesh(legGeo, chairMat);
                leg.position.set(...p);
                group.add(leg);
            }

            group.position.set(x, y, z);
            group.rotation.y = rotationY;
            buildingGroup.add(group);
        }

        function addCouch(x, z, rotationY = 0) {
            const group = new THREE.Group();
            const base = new THREE.Mesh(
                new THREE.BoxGeometry(2, 0.35, 0.8),
                couchMat
            );
            base.position.y = 0.175;
            group.add(base);

            const back = new THREE.Mesh(
                new THREE.BoxGeometry(2, 0.5, 0.15),
                couchMat
            );
            back.position.set(0, 0.55, -0.325);
            group.add(back);

            group.position.set(x, y, z);
            group.rotation.y = rotationY;
            buildingGroup.add(group);
        }

        function addCoffeeTable(x, z, rotationY = 0) {
            const group = new THREE.Group();
            const top = new THREE.Mesh(
                new THREE.BoxGeometry(1, 0.05, 0.5),
                tableMat
            );
            top.position.y = 0.4;
            group.add(top);

            const legGeo = new THREE.BoxGeometry(0.05, 0.4, 0.05);
            const positions = [[-0.4, 0.2, -0.2], [0.4, 0.2, -0.2], [-0.4, 0.2, 0.2], [0.4, 0.2, 0.2]];
            for (const p of positions) {
                const leg = new THREE.Mesh(legGeo, tableMat);
                leg.position.set(...p);
                group.add(leg);
            }

            group.position.set(x, y, z);
            group.rotation.y = rotationY;
            buildingGroup.add(group);
        }

        function addArmchair(x, z, rotationY = 0) {
            const group = new THREE.Group();
            const seat = new THREE.Mesh(
                new THREE.BoxGeometry(0.6, 0.08, 0.6),
                couchMat
            );
            seat.position.y = 0.35;
            group.add(seat);

            const back = new THREE.Mesh(
                new THREE.BoxGeometry(0.6, 0.5, 0.1),
                couchMat
            );
            back.position.set(0, 0.6, -0.25);
            group.add(back);

            const armGeo = new THREE.BoxGeometry(0.1, 0.3, 0.6);
            const armL = new THREE.Mesh(armGeo, couchMat);
            armL.position.set(-0.25, 0.5, 0);
            group.add(armL);
            const armR = new THREE.Mesh(armGeo, couchMat);
            armR.position.set(0.25, 0.5, 0);
            group.add(armR);

            group.position.set(x, y, z);
            group.rotation.y = rotationY;
            buildingGroup.add(group);
        }

        function addWaterCooler(x, z) {
            const group = new THREE.Group();
            const base = new THREE.Mesh(
                new THREE.BoxGeometry(0.4, 1.2, 0.4),
                coolerMat
            );
            base.position.y = 0.6;
            group.add(base);

            const bottle = new THREE.Mesh(
                new THREE.CylinderGeometry(0.15, 0.15, 0.5, 8),
                new THREE.MeshLambertMaterial({ color: 0x88ccff, transparent: true, opacity: 0.7 })
            );
            bottle.position.y = 1.45;
            group.add(bottle);

            group.position.set(x, y, z);
            buildingGroup.add(group);
        }

        function addPlant(x, z) {
            const group = new THREE.Group();
            const pot = new THREE.Mesh(
                new THREE.CylinderGeometry(0.2, 0.15, 0.3, 8),
                new THREE.MeshLambertMaterial({ color: 0x8b4513 })
            );
            pot.position.y = 0.15;
            group.add(pot);

            const leaves = new THREE.Mesh(
                new THREE.SphereGeometry(0.4, 8, 6),
                plantMat
            );
            leaves.position.y = 0.7;
            group.add(leaves);

            group.position.set(x, y, z);
            buildingGroup.add(group);
        }

        function addRoundTable(x, z) {
            const group = new THREE.Group();
            const top = new THREE.Mesh(
                new THREE.CylinderGeometry(0.6, 0.6, 0.05, 16),
                tableMat
            );
            top.position.y = 0.45;
            group.add(top);

            const leg = new THREE.Mesh(
                new THREE.CylinderGeometry(0.06, 0.1, 0.45, 8),
                tableMat
            );
            leg.position.y = 0.225;
            group.add(leg);

            group.position.set(x, y, z);
            buildingGroup.add(group);
        }

        if (isLobby) {
            addDesk(-3, y + 6, 0);
            addPlant(2, y + 8.5);
            addPlant(-1.5, y + 8.5);
            addWaterCooler(-8, y + 6);
            addWaterCooler(-8, y - 6);

            addCoffeeTable(-6, y + 6, 0);
            addCouch(-9, y + 6, -Math.PI / 2);
            addCoffeeTable(-6, y - 6, 0);
            addCouch(-9, y - 6, -Math.PI / 2);
            addCoffeeTable(-3, y - 5, 0);
            addCouch(-3, y - 3, Math.PI);

            addRoundTable(-6, y - 2);
            addArmchair(-6.5, y - 1, Math.PI / 2);
            addArmchair(-6.5, y - 3, -Math.PI / 2);
            addArmchair(-5.5, y - 2, 0);
            addArmchair(-6.5, y - 2, Math.PI);

            for (let i = 0; i < 4; i++) {
                addChair(-8 + i * 2, y + 3, Math.PI);
                addCoffeeTable(-8 + i * 2, y + 3.5, 0);
            }

        } else if (isOffice) {
            const offices = [
                { x: -9, z: -6, rot: 0 },
                { x: -9, z: -2, rot: 0 },
                { x: 9, z: -6, rot: 0 },
                { x: 9, z: -2, rot: 0 }
            ];
            for (const o of offices) {
                addDesk(o.x, o.z, o.rot);
                addChair(o.x, o.z + 0.8, o.rot);
            }

            addCoffeeTable(-4, y + 5, 0);
            addCouch(-7, y + 5, Math.PI / 2);
            addArmchair(-4, y + 3, 0);
            addArmchair(-4, y + 7, Math.PI);
            addWaterCooler(5, y + 5);
            addPlant(9, y + 8);

            addRoundTable(-4, y + 5);
            addChair(-4.8, y + 5, Math.PI / 2);
            addChair(-3.2, y + 5, -Math.PI / 2);
            addChair(-4, y + 5.8, 0);
            addChair(-4, y + 4.2, Math.PI);
        }
    }

    function bfsPath(nodes, fromName, toName) {
        if (!nodes[fromName] || !nodes[toName]) return [];

        const visited = new Set();
        const queue = [[fromName]];
        const links = nodes._links || {};

        while (queue.length > 0) {
            const path = queue.shift();
            const current = path[path.length - 1];

            if (current === toName) {
                return path.map(name => nodes[name].clone());
            }

            if (visited.has(current)) continue;
            visited.add(current);

            const neighbors = links[current] || [];
            for (const neighbor of neighbors) {
                if (!visited.has(neighbor)) {
                    queue.push([...path, neighbor]);
                }
            }
        }

        return [];
    }

    function createWorld(scene) {
        const buildingGroup = new THREE.Group();
        buildingGroup.renderOrder = 0;

        const floors = [];

        for (let i = 0; i < WORLD.FLOOR_COUNT; i++) {
            const layout = buildFloorLayout(i, scene, buildingGroup);
            buildFloorGeometry(i, scene, buildingGroup);
            buildFurniture(i, scene, buildingGroup);

            let callPanel = null;
            let shaftIndicator = null;

            if (i === 0) {
                callPanel = createCallPanel(scene, 1.7, WORLD.FLOOR_HEIGHT - 0.3, 0, -Math.PI / 2);
            } else {
                callPanel = createCallPanel(scene, 1.7, i * WORLD.FLOOR_HEIGHT + WORLD.FLOOR_HEIGHT - 0.3, 0, -Math.PI / 2);
            }

            const panelX = 1.7;
            const panelY = i * WORLD.FLOOR_HEIGHT + WORLD.FLOOR_HEIGHT + 0.5;
            shaftIndicator = createShaftIndicator(scene, panelX, panelY, 1.6);

            floors.push({
                floorNumber: i,
                nodes: layout.nodes,
                callPanel,
                shaftIndicator: shaftIndicator,
                desks: layout.desks,
                sitTargets: layout.sitTargets
            });
        }

        const groundMat = new THREE.MeshLambertMaterial({ color: 0x666666 });
        const ground = new THREE.Mesh(
            new THREE.PlaneGeometry(60, 40),
            groundMat
        );
        ground.rotation.x = -Math.PI / 2;
        ground.position.set(0, -0.2, 5);
        scene.add(ground);

        const roofMat = new THREE.MeshLambertMaterial({ color: 0x555555 });
        const roof = new THREE.Mesh(
            new THREE.BoxGeometry(WORLD.BUILDING_WIDTH + 2, 0.5, WORLD.BUILDING_DEPTH + 2),
            roofMat
        );
        roof.position.y = WORLD.FLOOR_COUNT * WORLD.FLOOR_HEIGHT + 0.25;
        buildingGroup.add(roof);

        scene.add(buildingGroup);

        const combinedSitTargets = {};
        for (const floor of floors) {
            for (const [key, val] of Object.entries(floor.sitTargets)) {
                combinedSitTargets[key] = val;
            }
        }

        return {
            buildingGroup,
            floors,
            sitTargets: combinedSitTargets,
            bfsPath: (from, to) => bfsPath(getCombinedNodes(), from, to)
        };

        function getCombinedNodes() {
            const combined = {};
            for (const floor of floors) {
                for (const [key, val] of Object.entries(floor.nodes)) {
                    if (key !== '_links') {
                        combined[key] = val;
                    }
                }
            }
            combined._links = {};
            for (const floor of floors) {
                if (floor.nodes._links) {
                    for (const [key, val] of Object.entries(floor.nodes._links)) {
                        combined._links[key] = val;
                    }
                }
            }
            return combined;
        }
    }

    root.WORLD = WORLD;
    root.createWorld = createWorld;
    root.createCallPanel = createCallPanel;
    root.createShaftIndicator = createShaftIndicator;
    root.createInCarIndicator = createInCarIndicator;
    root.bfsPath = bfsPath;
    root.updateTextTexture = updateTextTexture;

})(typeof window !== 'undefined' ? window : globalThis);
