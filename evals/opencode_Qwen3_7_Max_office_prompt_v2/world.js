(function() {
    const WORLD = {
        FLOOR_HEIGHT: 3.4,
        FLOOR_COUNT: 6,
        BUILDING_WIDTH: 22,
        BUILDING_DEPTH: 18,
        SHAFT_WIDTH: 3,
        SHAFT_DEPTH: 3,
        PERSON_R: 0.4
    };

    function bfsPath(nodes, fromName, toName) {
        if (fromName === toName) {
            const node = nodes[fromName];
            return node ? [node.position.clone()] : [];
        }

        const visited = new Set();
        const queue = [{ name: fromName, path: [fromName] }];
        visited.add(fromName);

        while (queue.length > 0) {
            const { name, path } = queue.shift();
            const node = nodes[name];
            if (!node) continue;

            for (const neighbor of node.neighbors) {
                if (visited.has(neighbor)) continue;
                visited.add(neighbor);

                const newPath = path.concat([neighbor]);
                if (neighbor === toName) {
                    return newPath.map(n => nodes[n].position.clone());
                }
                queue.push({ name: neighbor, path: newPath });
            }
        }

        return [];
    }

    function createCallPanel(floor) {
        const group = new THREE.Group();

        const plateGeom = new THREE.BoxGeometry(0.55, 1.4, 0.05);
        const plateMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
        const plate = new THREE.Mesh(plateGeom, plateMat);
        group.add(plate);

        const upShape = new THREE.Shape();
        upShape.moveTo(0, 0.13);
        upShape.lineTo(-0.13, -0.13);
        upShape.lineTo(0.13, -0.13);
        upShape.lineTo(0, 0.13);
        const upGeom = new THREE.ShapeGeometry(upShape);
        const upMatOff = new THREE.MeshBasicMaterial({ color: 0x222222 });
        const upMatOn = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
        const upArrow = new THREE.Mesh(upGeom, upMatOff);
        upArrow.position.set(0, 0.4, 0.03);
        group.add(upArrow);

        const downShape = new THREE.Shape();
        downShape.moveTo(0, -0.13);
        downShape.lineTo(-0.13, 0.13);
        downShape.lineTo(0.13, 0.13);
        downShape.lineTo(0, -0.13);
        const downGeom = new THREE.ShapeGeometry(downShape);
        const downMatOff = new THREE.MeshBasicMaterial({ color: 0x222222 });
        const downMatOn = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
        const downArrow = new THREE.Mesh(downGeom, downMatOff);
        downArrow.position.set(0, 0.1, 0.03);
        group.add(downArrow);

        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');
        const tex = new THREE.CanvasTexture(canvas);
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.anisotropy = 4;

        function updateTextTexture(text) {
            if (tex._lastText === text) return;
            tex._lastText = text;

            ctx.fillStyle = '#050505';
            ctx.fillRect(0, 0, 256, 256);

            ctx.fillStyle = '#ffbb22';
            ctx.font = 'bold 210px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowBlur = 20;
            ctx.shadowColor = '#ffbb22';
            ctx.fillText(text, 128, 128);
            ctx.shadowBlur = 0;

            tex.needsUpdate = true;
        }

        updateTextTexture(String(floor));

        const displayGeom = new THREE.PlaneGeometry(0.45, 0.45);
        const displayMat = new THREE.MeshBasicMaterial({ map: tex });
        const display = new THREE.Mesh(displayGeom, displayMat);
        display.position.set(0, -0.35, 0.03);
        group.add(display);

        group.userData.setUp = function(on) {
            upArrow.material = on ? upMatOn : upMatOff;
        };

        group.userData.setDown = function(on) {
            downArrow.material = on ? downMatOn : downMatOff;
        };

        group.userData.setIndicator = function(text) {
            updateTextTexture(text);
        };

        return group;
    }

    function createShaftIndicator() {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');
        const tex = new THREE.CanvasTexture(canvas);
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.anisotropy = 4;

        function updateTextTexture(text) {
            if (tex._lastText === text) return;
            tex._lastText = text;

            ctx.fillStyle = '#050505';
            ctx.fillRect(0, 0, 256, 256);

            ctx.fillStyle = '#ffbb22';
            ctx.font = 'bold 180px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowBlur = 20;
            ctx.shadowColor = '#ffbb22';
            ctx.fillText(text, 128, 128);
            ctx.shadowBlur = 0;

            tex.needsUpdate = true;
        }

        updateTextTexture('0');

        const geom = new THREE.PlaneGeometry(0.9, 0.9);
        const mat = new THREE.MeshBasicMaterial({ map: tex });
        const mesh = new THREE.Mesh(geom, mat);

        mesh.userData.setIndicator = function(text) {
            updateTextTexture(text);
        };

        return mesh;
    }

    function createDesk(x, y, z, facing) {
        const group = new THREE.Group();
        group.position.set(x, y, z);

        const deskMat = new THREE.MeshLambertMaterial({ color: 0x8b7355 });
        const deskGeom = new THREE.BoxGeometry(1.2, 0.05, 0.7);
        const desk = new THREE.Mesh(deskGeom, deskMat);
        desk.position.y = 0.75;
        group.add(desk);

        const legGeom = new THREE.BoxGeometry(0.05, 0.75, 0.05);
        const positions = [
            [-0.55, 0.375, -0.3],
            [0.55, 0.375, -0.3],
            [-0.55, 0.375, 0.3],
            [0.55, 0.375, 0.3]
        ];
        positions.forEach(pos => {
            const leg = new THREE.Mesh(legGeom, deskMat);
            leg.position.set(...pos);
            group.add(leg);
        });

        const monitorGeom = new THREE.BoxGeometry(0.5, 0.35, 0.05);
        const monitorMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
        const monitor = new THREE.Mesh(monitorGeom, monitorMat);
        monitor.position.set(0, 0.95, -0.25);
        group.add(monitor);

        const screenGeom = new THREE.PlaneGeometry(0.45, 0.3);
        const screenMat = new THREE.MeshBasicMaterial({ color: 0x4444ff });
        const screen = new THREE.Mesh(screenGeom, screenMat);
        screen.position.set(0, 0.95, -0.22);
        group.add(screen);

        const chairGroup = new THREE.Group();
        chairGroup.position.set(0, 0, 0.5);

        const seatGeom = new THREE.BoxGeometry(0.45, 0.05, 0.45);
        const chairMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
        const seat = new THREE.Mesh(seatGeom, chairMat);
        seat.position.y = 0.45;
        chairGroup.add(seat);

        const backGeom = new THREE.BoxGeometry(0.45, 0.5, 0.05);
        const back = new THREE.Mesh(backGeom, chairMat);
        back.position.set(0, 0.7, 0.2);
        chairGroup.add(back);

        group.add(chairGroup);

        group.rotation.y = facing;

        return group;
    }

    function createConferenceTable(x, y, z) {
        const group = new THREE.Group();
        group.position.set(x, y, z);

        const tableMat = new THREE.MeshLambertMaterial({ color: 0x654321 });
        const tableGeom = new THREE.BoxGeometry(3, 0.08, 1.2);
        const table = new THREE.Mesh(tableGeom, tableMat);
        table.position.y = 0.75;
        group.add(table);

        const legGeom = new THREE.BoxGeometry(0.08, 0.75, 0.08);
        const legPositions = [
            [-1.3, 0.375, -0.5],
            [1.3, 0.375, -0.5],
            [-1.3, 0.375, 0.5],
            [1.3, 0.375, 0.5]
        ];
        legPositions.forEach(pos => {
            const leg = new THREE.Mesh(legGeom, tableMat);
            leg.position.set(...pos);
            group.add(leg);
        });

        return group;
    }

    function createChair(x, y, z, facing) {
        const group = new THREE.Group();
        group.position.set(x, y, z);

        const chairMat = new THREE.MeshLambertMaterial({ color: 0x444444 });
        const seatGeom = new THREE.BoxGeometry(0.4, 0.05, 0.4);
        const seat = new THREE.Mesh(seatGeom, chairMat);
        seat.position.y = 0.45;
        group.add(seat);

        const backGeom = new THREE.BoxGeometry(0.4, 0.45, 0.05);
        const back = new THREE.Mesh(backGeom, chairMat);
        back.position.set(0, 0.675, 0.175);
        group.add(back);

        group.rotation.y = facing;

        return group;
    }

    function createCouch(x, y, z, facing) {
        const group = new THREE.Group();
        group.position.set(x, y, z);

        const couchMat = new THREE.MeshLambertMaterial({ color: 0x556677 });
        const seatGeom = new THREE.BoxGeometry(2, 0.3, 0.8);
        const seat = new THREE.Mesh(seatGeom, couchMat);
        seat.position.y = 0.35;
        group.add(seat);

        const backGeom = new THREE.BoxGeometry(2, 0.5, 0.15);
        const back = new THREE.Mesh(backGeom, couchMat);
        back.position.set(0, 0.6, -0.325);
        group.add(back);

        const armGeom = new THREE.BoxGeometry(0.15, 0.4, 0.8);
        const leftArm = new THREE.Mesh(armGeom, couchMat);
        leftArm.position.set(-0.925, 0.5, 0);
        group.add(leftArm);

        const rightArm = new THREE.Mesh(armGeom, couchMat);
        rightArm.position.set(0.925, 0.5, 0);
        group.add(rightArm);

        group.rotation.y = facing;

        return group;
    }

    function createCoffeeTable(x, y, z) {
        const group = new THREE.Group();
        group.position.set(x, y, z);

        const tableMat = new THREE.MeshLambertMaterial({ color: 0x8b7355 });
        const tableGeom = new THREE.BoxGeometry(1.2, 0.05, 0.6);
        const table = new THREE.Mesh(tableGeom, tableMat);
        table.position.y = 0.4;
        group.add(table);

        const legGeom = new THREE.BoxGeometry(0.05, 0.4, 0.05);
        const positions = [
            [-0.55, 0.2, -0.25],
            [0.55, 0.2, -0.25],
            [-0.55, 0.2, 0.25],
            [0.55, 0.2, 0.25]
        ];
        positions.forEach(pos => {
            const leg = new THREE.Mesh(legGeom, tableMat);
            leg.position.set(...pos);
            group.add(leg);
        });

        return group;
    }

    function createWaterCooler(x, y, z) {
        const group = new THREE.Group();
        group.position.set(x, y, z);

        const coolerMat = new THREE.MeshLambertMaterial({ color: 0xcccccc });
        const bodyGeom = new THREE.BoxGeometry(0.4, 1.2, 0.4);
        const body = new THREE.Mesh(bodyGeom, coolerMat);
        body.position.y = 0.6;
        group.add(body);

        const bottleGeom = new THREE.CylinderGeometry(0.15, 0.15, 0.5, 12);
        const bottleMat = new THREE.MeshLambertMaterial({ color: 0x4488ff, transparent: true, opacity: 0.6 });
        const bottle = new THREE.Mesh(bottleGeom, bottleMat);
        bottle.position.y = 1.45;
        group.add(bottle);

        return group;
    }

    function createPottedPlant(x, y, z) {
        const group = new THREE.Group();
        group.position.set(x, y, z);

        const potMat = new THREE.MeshLambertMaterial({ color: 0x8b4513 });
        const potGeom = new THREE.CylinderGeometry(0.2, 0.15, 0.3, 12);
        const pot = new THREE.Mesh(potGeom, potMat);
        pot.position.y = 0.15;
        group.add(pot);

        const plantMat = new THREE.MeshLambertMaterial({ color: 0x228b22 });
        const plantGeom = new THREE.SphereGeometry(0.35, 12, 12);
        const plant = new THREE.Mesh(plantGeom, plantMat);
        plant.position.y = 0.6;
        group.add(plant);

        return group;
    }

    function createWorld(scene) {
        const buildingGroup = new THREE.Group();
        buildingGroup.renderOrder = 0;
        scene.add(buildingGroup);

        const floorMat = new THREE.MeshLambertMaterial({
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

        const interiorWallMat = new THREE.MeshLambertMaterial({
            color: 0xbbc5e6,
            transparent: true,
            opacity: 0.28,
            depthWrite: false,
            side: THREE.DoubleSide
        });

        const groundGeom = new THREE.BoxGeometry(WORLD.BUILDING_WIDTH, 0.2, WORLD.BUILDING_DEPTH);
        const groundMat = new THREE.MeshLambertMaterial({ color: 0x666666 });
        const ground = new THREE.Mesh(groundGeom, groundMat);
        ground.position.y = -0.1;
        buildingGroup.add(ground);

        const roofGeom = new THREE.BoxGeometry(WORLD.BUILDING_WIDTH, 0.2, WORLD.BUILDING_DEPTH);
        const roof = new THREE.Mesh(roofGeom, groundMat);
        roof.position.y = WORLD.FLOOR_COUNT * WORLD.FLOOR_HEIGHT + 0.1;
        buildingGroup.add(roof);

        const floors = [];

        for (let f = 0; f < WORLD.FLOOR_COUNT; f++) {
            const floorY = f * WORLD.FLOOR_HEIGHT;
            const nodes = {};
            const sitTargets = {};
            const desks = [];

            if (f === 0) {
                const slabGeom = new THREE.BoxGeometry(WORLD.BUILDING_WIDTH, 0.1, WORLD.BUILDING_DEPTH);
                const slab = new THREE.Mesh(slabGeom, floorMat);
                slab.position.y = floorY;
                buildingGroup.add(slab);
            } else {
                const stripWidth = (WORLD.BUILDING_WIDTH - WORLD.SHAFT_WIDTH) / 2;
                const stripDepth = WORLD.BUILDING_DEPTH;

                const leftStrip = new THREE.Mesh(
                    new THREE.BoxGeometry(stripWidth, 0.1, stripDepth),
                    floorMat
                );
                leftStrip.position.set(-WORLD.BUILDING_WIDTH / 2 + stripWidth / 2, floorY, 0);
                buildingGroup.add(leftStrip);

                const rightStrip = new THREE.Mesh(
                    new THREE.BoxGeometry(stripWidth, 0.1, stripDepth),
                    floorMat
                );
                rightStrip.position.set(WORLD.BUILDING_WIDTH / 2 - stripWidth / 2, floorY, 0);
                buildingGroup.add(rightStrip);

                const frontStrip = new THREE.Mesh(
                    new THREE.BoxGeometry(WORLD.SHAFT_WIDTH, 0.1, (WORLD.BUILDING_DEPTH - WORLD.SHAFT_DEPTH) / 2),
                    floorMat
                );
                frontStrip.position.set(0, floorY, WORLD.BUILDING_DEPTH / 2 - (WORLD.BUILDING_DEPTH - WORLD.SHAFT_DEPTH) / 4);
                buildingGroup.add(frontStrip);

                const backStrip = new THREE.Mesh(
                    new THREE.BoxGeometry(WORLD.SHAFT_WIDTH, 0.1, (WORLD.BUILDING_DEPTH - WORLD.SHAFT_DEPTH) / 2),
                    floorMat
                );
                backStrip.position.set(0, floorY, -WORLD.BUILDING_DEPTH / 2 + (WORLD.BUILDING_DEPTH - WORLD.SHAFT_DEPTH) / 4);
                buildingGroup.add(backStrip);
            }

            if (f === 0) {
                const sideWallGeom = new THREE.BoxGeometry(0.1, WORLD.FLOOR_HEIGHT, WORLD.BUILDING_DEPTH);
                const leftWall = new THREE.Mesh(sideWallGeom, wallMat);
                leftWall.position.set(-WORLD.BUILDING_WIDTH / 2, floorY + WORLD.FLOOR_HEIGHT / 2, 0);
                buildingGroup.add(leftWall);

                const rightWall = new THREE.Mesh(sideWallGeom, wallMat);
                rightWall.position.set(WORLD.BUILDING_WIDTH / 2, floorY + WORLD.FLOOR_HEIGHT / 2, 0);
                buildingGroup.add(rightWall);

                const backWallGeom = new THREE.BoxGeometry(WORLD.BUILDING_WIDTH, WORLD.FLOOR_HEIGHT, 0.1);
                const backWall = new THREE.Mesh(backWallGeom, wallMat);
                backWall.position.set(0, floorY + WORLD.FLOOR_HEIGHT / 2, -WORLD.BUILDING_DEPTH / 2);
                buildingGroup.add(backWall);

                const frontSideWidth = (WORLD.BUILDING_WIDTH - 3) / 2;
                const frontLeftWall = new THREE.Mesh(
                    new THREE.BoxGeometry(frontSideWidth, WORLD.FLOOR_HEIGHT, 0.1),
                    wallMat
                );
                frontLeftWall.position.set(-WORLD.BUILDING_WIDTH / 2 + frontSideWidth / 2, floorY + WORLD.FLOOR_HEIGHT / 2, WORLD.BUILDING_DEPTH / 2);
                buildingGroup.add(frontLeftWall);

                const frontRightWall = new THREE.Mesh(
                    new THREE.BoxGeometry(frontSideWidth, WORLD.FLOOR_HEIGHT, 0.1),
                    wallMat
                );
                frontRightWall.position.set(WORLD.BUILDING_WIDTH / 2 - frontSideWidth / 2, floorY + WORLD.FLOOR_HEIGHT / 2, WORLD.BUILDING_DEPTH / 2);
                buildingGroup.add(frontRightWall);
            } else {
                const wallHeight = WORLD.FLOOR_HEIGHT;
                const sideWallGeom = new THREE.BoxGeometry(0.1, wallHeight, WORLD.BUILDING_DEPTH);
                const leftWall = new THREE.Mesh(sideWallGeom, wallMat);
                leftWall.position.set(-WORLD.BUILDING_WIDTH / 2, floorY + wallHeight / 2, 0);
                buildingGroup.add(leftWall);

                const rightWall = new THREE.Mesh(sideWallGeom, wallMat);
                rightWall.position.set(WORLD.BUILDING_WIDTH / 2, floorY + wallHeight / 2, 0);
                buildingGroup.add(rightWall);

                const backWallGeom = new THREE.BoxGeometry(WORLD.BUILDING_WIDTH, wallHeight, 0.1);
                const backWall = new THREE.Mesh(backWallGeom, wallMat);
                backWall.position.set(0, floorY + wallHeight / 2, -WORLD.BUILDING_DEPTH / 2);
                buildingGroup.add(backWall);

                const frontWallGeom = new THREE.BoxGeometry(WORLD.BUILDING_WIDTH, wallHeight, 0.1);
                const frontWall = new THREE.Mesh(frontWallGeom, wallMat);
                frontWall.position.set(0, floorY + wallHeight / 2, WORLD.BUILDING_DEPTH / 2);
                buildingGroup.add(frontWall);
            }

            if (f > 0) {
                const officeA = createDesk(-8, floorY, -6, Math.PI);
                buildingGroup.add(officeA);
                desks.push({ id: 'A', group: officeA, floor: f });

                const officeB = createDesk(-4, floorY, -6, Math.PI);
                buildingGroup.add(officeB);
                desks.push({ id: 'B', group: officeB, floor: f });

                const officeC = createDesk(4, floorY, -6, Math.PI);
                buildingGroup.add(officeC);
                desks.push({ id: 'C', group: officeC, floor: f });

                const officeD = createDesk(8, floorY, -6, Math.PI);
                buildingGroup.add(officeD);
                desks.push({ id: 'D', group: officeD, floor: f });

                const wall1 = new THREE.Mesh(
                    new THREE.BoxGeometry(0.1, WORLD.FLOOR_HEIGHT, 6),
                    interiorWallMat
                );
                wall1.position.set(-6, floorY + WORLD.FLOOR_HEIGHT / 2, -6);
                buildingGroup.add(wall1);

                const wall2 = new THREE.Mesh(
                    new THREE.BoxGeometry(0.1, WORLD.FLOOR_HEIGHT, 6),
                    interiorWallMat
                );
                wall2.position.set(-2, floorY + WORLD.FLOOR_HEIGHT / 2, -6);
                buildingGroup.add(wall2);

                const wall3 = new THREE.Mesh(
                    new THREE.BoxGeometry(0.1, WORLD.FLOOR_HEIGHT, 6),
                    interiorWallMat
                );
                wall3.position.set(2, floorY + WORLD.FLOOR_HEIGHT / 2, -6);
                buildingGroup.add(wall3);

                const wall4 = new THREE.Mesh(
                    new THREE.BoxGeometry(0.1, WORLD.FLOOR_HEIGHT, 6),
                    interiorWallMat
                );
                wall4.position.set(6, floorY + WORLD.FLOOR_HEIGHT / 2, -6);
                buildingGroup.add(wall4);

                const confTable = createConferenceTable(-7, floorY, 6);
                buildingGroup.add(confTable);

                const confChair0 = createChair(-8.5, floorY, 5, 0);
                buildingGroup.add(confChair0);
                const confChair1 = createChair(-5.5, floorY, 5, 0);
                buildingGroup.add(confChair1);
                const confChair2 = createChair(-8.5, floorY, 7, Math.PI);
                buildingGroup.add(confChair2);
                const confChair3 = createChair(-5.5, floorY, 7, Math.PI);
                buildingGroup.add(confChair3);

                const confWall1 = new THREE.Mesh(
                    new THREE.BoxGeometry(8, WORLD.FLOOR_HEIGHT, 0.1),
                    interiorWallMat
                );
                confWall1.position.set(-7, floorY + WORLD.FLOOR_HEIGHT / 2, 4);
                buildingGroup.add(confWall1);

                const confWall2 = new THREE.Mesh(
                    new THREE.BoxGeometry(0.1, WORLD.FLOOR_HEIGHT, 5),
                    interiorWallMat
                );
                confWall2.position.set(-3, floorY + WORLD.FLOOR_HEIGHT / 2, 6.5);
                buildingGroup.add(confWall2);

                const loungeCouch = createCouch(7, floorY, 7, Math.PI);
                buildingGroup.add(loungeCouch);

                const loungeTable = createCoffeeTable(7, floorY, 5);
                buildingGroup.add(loungeTable);

                const loungeChair0 = createChair(5, floorY, 5, Math.PI / 2);
                buildingGroup.add(loungeChair0);
                const loungeChair1 = createChair(9, floorY, 5, -Math.PI / 2);
                buildingGroup.add(loungeChair1);

                const waterCooler = createWaterCooler(9, floorY, 7);
                buildingGroup.add(waterCooler);

                const loungeWall1 = new THREE.Mesh(
                    new THREE.BoxGeometry(8, WORLD.FLOOR_HEIGHT, 0.1),
                    interiorWallMat
                );
                loungeWall1.position.set(7, floorY + WORLD.FLOOR_HEIGHT / 2, 4);
                buildingGroup.add(loungeWall1);

                const loungeWall2 = new THREE.Mesh(
                    new THREE.BoxGeometry(0.1, WORLD.FLOOR_HEIGHT, 5),
                    interiorWallMat
                );
                loungeWall2.position.set(3, floorY + WORLD.FLOOR_HEIGHT / 2, 6.5);
                buildingGroup.add(loungeWall2);

                nodes.hallS = { position: new THREE.Vector3(0, floorY, 3), neighbors: ['hallSE', 'hallSW', 'elevWait'] };
                nodes.hallSE = { position: new THREE.Vector3(3, floorY, 3), neighbors: ['hallS', 'hallE', 'lounge_door'] };
                nodes.hallE = { position: new THREE.Vector3(3, floorY, 0), neighbors: ['hallSE', 'hallNE'] };
                nodes.hallNE = { position: new THREE.Vector3(3, floorY, -3), neighbors: ['hallE', 'hallN'] };
                nodes.hallN = { position: new THREE.Vector3(0, floorY, -3), neighbors: ['hallNE', 'hallNW', 'officeA_door', 'officeB_door', 'officeC_door', 'officeD_door'] };
                nodes.hallNW = { position: new THREE.Vector3(-3, floorY, -3), neighbors: ['hallN', 'hallW'] };
                nodes.hallW = { position: new THREE.Vector3(-3, floorY, 0), neighbors: ['hallNW', 'hallSW'] };
                nodes.hallSW = { position: new THREE.Vector3(-3, floorY, 3), neighbors: ['hallW', 'hallS', 'conf_door'] };
                nodes.elevWait = { position: new THREE.Vector3(0, floorY, 2), neighbors: ['hallS'] };

                nodes.officeA_door = { position: new THREE.Vector3(-8, floorY, -3), neighbors: ['hallN', 'officeA_desk'] };
                nodes.officeA_desk = { position: new THREE.Vector3(-8, floorY, -5.5), neighbors: ['officeA_door'] };
                sitTargets.officeA_desk = { sit: true, facing: Math.PI };

                nodes.officeB_door = { position: new THREE.Vector3(-4, floorY, -3), neighbors: ['hallN', 'officeB_desk'] };
                nodes.officeB_desk = { position: new THREE.Vector3(-4, floorY, -5.5), neighbors: ['officeB_door'] };
                sitTargets.officeB_desk = { sit: true, facing: Math.PI };

                nodes.officeC_door = { position: new THREE.Vector3(4, floorY, -3), neighbors: ['hallN', 'officeC_desk'] };
                nodes.officeC_desk = { position: new THREE.Vector3(4, floorY, -5.5), neighbors: ['officeC_door'] };
                sitTargets.officeC_desk = { sit: true, facing: Math.PI };

                nodes.officeD_door = { position: new THREE.Vector3(8, floorY, -3), neighbors: ['hallN', 'officeD_desk'] };
                nodes.officeD_desk = { position: new THREE.Vector3(8, floorY, -5.5), neighbors: ['officeD_door'] };
                sitTargets.officeD_desk = { sit: true, facing: Math.PI };

                nodes.conf_door = { position: new THREE.Vector3(-3, floorY, 4), neighbors: ['hallSW', 'conf_center'] };
                nodes.conf_center = { position: new THREE.Vector3(-7, floorY, 6), neighbors: ['conf_door', 'conf_seat0', 'conf_seat1', 'conf_seat2', 'conf_seat3'] };
                nodes.conf_seat0 = { position: new THREE.Vector3(-8.5, floorY, 5), neighbors: ['conf_center'] };
                sitTargets.conf_seat0 = { sit: true, facing: 0 };
                nodes.conf_seat1 = { position: new THREE.Vector3(-5.5, floorY, 5), neighbors: ['conf_center'] };
                sitTargets.conf_seat1 = { sit: true, facing: 0 };
                nodes.conf_seat2 = { position: new THREE.Vector3(-8.5, floorY, 7), neighbors: ['conf_center'] };
                sitTargets.conf_seat2 = { sit: true, facing: Math.PI };
                nodes.conf_seat3 = { position: new THREE.Vector3(-5.5, floorY, 7), neighbors: ['conf_center'] };
                sitTargets.conf_seat3 = { sit: true, facing: Math.PI };

                nodes.lounge_door = { position: new THREE.Vector3(3, floorY, 4), neighbors: ['hallSE', 'lounge_center'] };
                nodes.lounge_center = { position: new THREE.Vector3(7, floorY, 6), neighbors: ['lounge_door', 'lounge_spot0', 'lounge_spot1', 'lounge_spot2'] };
                nodes.lounge_spot0 = { position: new THREE.Vector3(7, floorY, 7), neighbors: ['lounge_center'] };
                sitTargets.lounge_spot0 = { sit: true, facing: Math.PI };
                nodes.lounge_spot1 = { position: new THREE.Vector3(5, floorY, 5), neighbors: ['lounge_center'] };
                sitTargets.lounge_spot1 = { sit: true, facing: Math.PI / 2 };
                nodes.lounge_spot2 = { position: new THREE.Vector3(9, floorY, 5), neighbors: ['lounge_center'] };
                sitTargets.lounge_spot2 = { sit: true, facing: -Math.PI / 2 };

                nodes.water_cooler = { position: new THREE.Vector3(9, floorY, 7), neighbors: ['lounge_center'] };
                nodes.hall_stand_N = { position: new THREE.Vector3(0, floorY, -2), neighbors: ['hallN'] };
                nodes.hall_stand_S = { position: new THREE.Vector3(0, floorY, 2), neighbors: ['hallS'] };
            } else {
                const sidewalk = new THREE.Mesh(
                    new THREE.BoxGeometry(10, 0.05, 3),
                    new THREE.MeshLambertMaterial({ color: 0xaaaaaa })
                );
                sidewalk.position.set(0, -0.05, 12);
                buildingGroup.add(sidewalk);

                const glassDoorMat = new THREE.MeshLambertMaterial({
                    color: 0x88ccff,
                    transparent: true,
                    opacity: 0.4,
                    depthWrite: false,
                    side: THREE.DoubleSide
                });
                const doorGeom = new THREE.BoxGeometry(1.5, 2.5, 0.05);
                const leftDoor = new THREE.Mesh(doorGeom, glassDoorMat);
                leftDoor.position.set(-0.75, 1.25, 9);
                buildingGroup.add(leftDoor);

                const rightDoor = new THREE.Mesh(doorGeom, glassDoorMat);
                rightDoor.position.set(0.75, 1.25, 9);
                buildingGroup.add(rightDoor);

                const cafeCounter = new THREE.Mesh(
                    new THREE.BoxGeometry(4, 1, 0.8),
                    new THREE.MeshLambertMaterial({ color: 0x654321 })
                );
                cafeCounter.position.set(-8, 0.5, 6);
                buildingGroup.add(cafeCounter);

                const counterTop = new THREE.Mesh(
                    new THREE.BoxGeometry(4, 0.05, 0.8),
                    new THREE.MeshLambertMaterial({ color: 0x333333 })
                );
                counterTop.position.set(-8, 1.025, 6);
                buildingGroup.add(counterTop);

                const coffeeMachine = new THREE.Mesh(
                    new THREE.BoxGeometry(0.4, 0.6, 0.4),
                    new THREE.MeshLambertMaterial({ color: 0x222222 })
                );
                coffeeMachine.position.set(-9, 1.3, 6);
                buildingGroup.add(coffeeMachine);

                const pastryDisplay = new THREE.Mesh(
                    new THREE.BoxGeometry(0.6, 0.4, 0.4),
                    new THREE.MeshLambertMaterial({ color: 0xffcc99, transparent: true, opacity: 0.7 })
                );
                pastryDisplay.position.set(-7, 1.2, 6);
                buildingGroup.add(pastryDisplay);

                for (let i = 0; i < 4; i++) {
                    const tableX = -9 + (i % 2) * 2;
                    const tableZ = 3 + Math.floor(i / 2) * 2;
                    const bistroTable = new THREE.Mesh(
                        new THREE.CylinderGeometry(0.4, 0.4, 0.05, 16),
                        new THREE.MeshLambertMaterial({ color: 0x8b7355 })
                    );
                    bistroTable.position.set(tableX, 0.75, tableZ);
                    buildingGroup.add(bistroTable);

                    const bistroLeg = new THREE.Mesh(
                        new THREE.CylinderGeometry(0.05, 0.05, 0.75, 8),
                        new THREE.MeshLambertMaterial({ color: 0x8b7355 })
                    );
                    bistroLeg.position.set(tableX, 0.375, tableZ);
                    buildingGroup.add(bistroLeg);

                    const chair1 = createChair(tableX - 0.6, 0, tableZ, Math.PI / 2);
                    buildingGroup.add(chair1);
                    const chair2 = createChair(tableX + 0.6, 0, tableZ, -Math.PI / 2);
                    buildingGroup.add(chair2);
                }

                const frontLoungeCouch = createCouch(7, 0, 6, Math.PI);
                buildingGroup.add(frontLoungeCouch);

                const frontLoungeTable = createCoffeeTable(7, 0, 4);
                buildingGroup.add(frontLoungeTable);

                const frontLoungeChair0 = createChair(5, 0, 4, Math.PI / 2);
                buildingGroup.add(frontLoungeChair0);
                const frontLoungeChair1 = createChair(9, 0, 4, -Math.PI / 2);
                buildingGroup.add(frontLoungeChair1);

                const backLoungeCouch1 = createCouch(-3, 0, -6, 0);
                buildingGroup.add(backLoungeCouch1);
                const backLoungeCouch2 = createCouch(3, 0, -6, Math.PI);
                buildingGroup.add(backLoungeCouch2);
                const backLoungeTable = createCoffeeTable(0, 0, -6);
                buildingGroup.add(backLoungeTable);

                const pitTable = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.6, 0.6, 0.05, 16),
                    new THREE.MeshLambertMaterial({ color: 0x8b7355 })
                );
                pitTable.position.set(-7, 0.75, -6);
                buildingGroup.add(pitTable);

                const pitLeg = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.08, 0.08, 0.75, 8),
                    new THREE.MeshLambertMaterial({ color: 0x8b7355 })
                );
                pitLeg.position.set(-7, 0.375, -6);
                buildingGroup.add(pitLeg);

                const pitChairN = createChair(-7, 0, -7.5, 0);
                buildingGroup.add(pitChairN);
                const pitChairS = createChair(-7, 0, -4.5, Math.PI);
                buildingGroup.add(pitChairS);
                const pitChairE = createChair(-5.5, 0, -6, -Math.PI / 2);
                buildingGroup.add(pitChairE);
                const pitChairW = createChair(-8.5, 0, -6, Math.PI / 2);
                buildingGroup.add(pitChairW);

                const lobbyWC1 = createWaterCooler(-3, 0, 7);
                buildingGroup.add(lobbyWC1);
                const lobbyWC2 = createWaterCooler(3, 0, -7);
                buildingGroup.add(lobbyWC2);

                const receptionDesk = new THREE.Mesh(
                    new THREE.BoxGeometry(2, 1, 0.8),
                    new THREE.MeshLambertMaterial({ color: 0x654321 })
                );
                receptionDesk.position.set(-3, 0.5, 6);
                buildingGroup.add(receptionDesk);

                const kiosk = new THREE.Mesh(
                    new THREE.BoxGeometry(0.8, 1.8, 0.4),
                    new THREE.MeshLambertMaterial({ color: 0x444444 })
                );
                kiosk.position.set(3, 0.9, 7);
                buildingGroup.add(kiosk);

                const plant1 = createPottedPlant(-1.5, 0, 8);
                buildingGroup.add(plant1);
                const plant2 = createPottedPlant(1.5, 0, 8);
                buildingGroup.add(plant2);

                nodes.outside = { position: new THREE.Vector3(0, 0, 12), neighbors: ['entrance'] };
                nodes.entrance = { position: new THREE.Vector3(0, 0, 9), neighbors: ['outside', 'elevWait'] };
                nodes.elevWait = { position: new THREE.Vector3(0, 0, 2), neighbors: ['entrance', 'hallS'] };
                nodes.hallS = { position: new THREE.Vector3(0, 0, 3), neighbors: ['elevWait', 'hallSE', 'hallSW'] };
                nodes.hallSE = { position: new THREE.Vector3(3, 0, 3), neighbors: ['hallS', 'hallE', 'lounge_door'] };
                nodes.hallE = { position: new THREE.Vector3(3, 0, 0), neighbors: ['hallSE', 'hallNE'] };
                nodes.hallNE = { position: new THREE.Vector3(3, 0, -3), neighbors: ['hallE', 'hallN'] };
                nodes.hallN = { position: new THREE.Vector3(0, 0, -3), neighbors: ['hallNE', 'hallNW', 'back_lounge_N', 'back_lounge_S', 'pit_N', 'pit_S', 'pit_E', 'pit_W'] };
                nodes.hallNW = { position: new THREE.Vector3(-3, 0, -3), neighbors: ['hallN', 'hallW'] };
                nodes.hallW = { position: new THREE.Vector3(-3, 0, 0), neighbors: ['hallNW', 'hallSW'] };
                nodes.hallSW = { position: new THREE.Vector3(-3, 0, 3), neighbors: ['hallW', 'hallS', 'cafe_door'] };

                nodes.cafe_door = { position: new THREE.Vector3(-6, 0, 4), neighbors: ['hallSW', 'cafe_order', 'bistro_0', 'bistro_1', 'bistro_2', 'bistro_3'] };
                nodes.cafe_order = { position: new THREE.Vector3(-8, 0, 6), neighbors: ['cafe_door'] };
                nodes.bistro_0 = { position: new THREE.Vector3(-9.6, 0, 3), neighbors: ['cafe_door'] };
                sitTargets.bistro_0 = { sit: true, facing: Math.PI / 2 };
                nodes.bistro_1 = { position: new THREE.Vector3(-8.4, 0, 3), neighbors: ['cafe_door'] };
                sitTargets.bistro_1 = { sit: true, facing: -Math.PI / 2 };
                nodes.bistro_2 = { position: new THREE.Vector3(-9.6, 0, 5), neighbors: ['cafe_door'] };
                sitTargets.bistro_2 = { sit: true, facing: Math.PI / 2 };
                nodes.bistro_3 = { position: new THREE.Vector3(-8.4, 0, 5), neighbors: ['cafe_door'] };
                sitTargets.bistro_3 = { sit: true, facing: -Math.PI / 2 };

                nodes.lounge_door = { position: new THREE.Vector3(5, 0, 4), neighbors: ['hallSE', 'lounge_spot0', 'lounge_spot1', 'lounge_spot2'] };
                nodes.lounge_spot0 = { position: new THREE.Vector3(7, 0, 6), neighbors: ['lounge_door'] };
                sitTargets.lounge_spot0 = { sit: true, facing: Math.PI };
                nodes.lounge_spot1 = { position: new THREE.Vector3(5, 0, 4), neighbors: ['lounge_door'] };
                sitTargets.lounge_spot1 = { sit: true, facing: Math.PI / 2 };
                nodes.lounge_spot2 = { position: new THREE.Vector3(9, 0, 4), neighbors: ['lounge_door'] };
                sitTargets.lounge_spot2 = { sit: true, facing: -Math.PI / 2 };

                nodes.back_lounge_N = { position: new THREE.Vector3(-3, 0, -6), neighbors: ['hallN'] };
                sitTargets.back_lounge_N = { sit: true, facing: 0 };
                nodes.back_lounge_S = { position: new THREE.Vector3(3, 0, -6), neighbors: ['hallN'] };
                sitTargets.back_lounge_S = { sit: true, facing: Math.PI };

                nodes.pit_N = { position: new THREE.Vector3(-7, 0, -7.5), neighbors: ['hallN'] };
                sitTargets.pit_N = { sit: true, facing: 0 };
                nodes.pit_S = { position: new THREE.Vector3(-7, 0, -4.5), neighbors: ['hallN'] };
                sitTargets.pit_S = { sit: true, facing: Math.PI };
                nodes.pit_E = { position: new THREE.Vector3(-5.5, 0, -6), neighbors: ['hallN'] };
                sitTargets.pit_E = { sit: true, facing: -Math.PI / 2 };
                nodes.pit_W = { position: new THREE.Vector3(-8.5, 0, -6), neighbors: ['hallN'] };
                sitTargets.pit_W = { sit: true, facing: Math.PI / 2 };

                nodes.lobby_wc_front = { position: new THREE.Vector3(-3, 0, 7), neighbors: ['hallSW'] };
                nodes.lobby_wc_back = { position: new THREE.Vector3(3, 0, -7), neighbors: ['hallN'] };
                nodes.reception = { position: new THREE.Vector3(-3, 0, 6), neighbors: ['hallSW'] };
                nodes.kiosk = { position: new THREE.Vector3(3, 0, 7), neighbors: ['hallSE'] };

                nodes.lobby_stand_center = { position: new THREE.Vector3(0, 0, 0), neighbors: ['hallS'] };
                nodes.lobby_stand_NE = { position: new THREE.Vector3(5, 0, -2), neighbors: ['hallNE'] };
                nodes.lobby_stand_NW = { position: new THREE.Vector3(-5, 0, -2), neighbors: ['hallNW'] };
                nodes.lobby_stand_midE = { position: new THREE.Vector3(6, 0, 2), neighbors: ['hallE'] };
                nodes.lobby_stand_midW = { position: new THREE.Vector3(-6, 0, 2), neighbors: ['hallW'] };
                nodes.lobby_stand_entry = { position: new THREE.Vector3(0, 0, 7), neighbors: ['entrance'] };
            }

            const callPanel = createCallPanel(f);
            callPanel.position.set(2, floorY + 1.5, 2);
            callPanel.rotation.y = Math.PI;
            buildingGroup.add(callPanel);

            const shaftIndicator = createShaftIndicator();
            shaftIndicator.position.set(0, floorY + 2.8, 1.6);
            buildingGroup.add(shaftIndicator);

            floors.push({
                floorNumber: f,
                nodes: nodes,
                callPanel: callPanel,
                shaftIndicator: shaftIndicator,
                desks: desks,
                sitTargets: sitTargets
            });
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
})();
