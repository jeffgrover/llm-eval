/**
 * world.js
 * Building geometry, per-floor layouts, furniture, call panels, indicators,
 * navigation graph, sit targets, and BFS pathfinding.
 * No ES modules.
 */
(function() {
    "use strict";

    const WORLD = {
        FLOOR_HEIGHT: 3.4,
        FLOOR_COUNT: 6,
        BUILDING_WIDTH: 22,
        BUILDING_DEPTH: 18,
        SHAFT_WIDTH: 3,
        SHAFT_DEPTH: 3,
        PERSON_R: 0.4
    };

    // BFS Pathfinding helper
    function bfsPath(nodeMap, fromName, toName, floorY) {
        const y = floorY !== undefined ? floorY : 0;
        if (!nodeMap[fromName] || !nodeMap[toName]) {
            if (nodeMap[toName]) {
                const target = nodeMap[toName];
                return [new THREE.Vector3(target.x, y, target.z)];
            }
            return [new THREE.Vector3(0, y, 0)];
        }
        if (fromName === toName) {
            const target = nodeMap[toName];
            return [new THREE.Vector3(target.x, y, target.z)];
        }

        const queue = [[fromName]];
        const visited = new Set([fromName]);

        while (queue.length > 0) {
            const path = queue.shift();
            const current = path[path.length - 1];

            if (current === toName) {
                return path.map(name => {
                    const node = nodeMap[name];
                    return new THREE.Vector3(node.x, y, node.z);
                });
            }

            const neighbors = (nodeMap[current] && nodeMap[current].neighbors) || [];
            for (let i = 0; i < neighbors.length; i++) {
                const neighbor = neighbors[i];
                if (!visited.has(neighbor) && nodeMap[neighbor]) {
                    visited.add(neighbor);
                    queue.push([...path, neighbor]);
                }
            }
        }

        // Fallback: direct to target
        const target = nodeMap[toName];
        return [new THREE.Vector3(target.x, y, target.z)];
    }

    // Canvas digit texture generator with caching
    function createDigitTexture(initialText, size) {
        const canvas = document.createElement("canvas");
        const s = size || 256;
        canvas.width = s;
        canvas.height = s;
        const ctx = canvas.getContext("2d");

        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = true;
        texture._lastText = null;

        function updateText(text) {
            if (texture._lastText === text) return;
            texture._lastText = text;

            ctx.fillStyle = "#050505";
            ctx.fillRect(0, 0, s, s);

            // Subtle border
            ctx.strokeStyle = "#222222";
            ctx.lineWidth = s * 0.04;
            ctx.strokeRect(s * 0.02, s * 0.02, s * 0.96, s * 0.96);

            // Glowing hot orange digits
            ctx.shadowColor = "#ff8800";
            ctx.shadowBlur = s * 0.12;
            ctx.fillStyle = "#ffbb22";
            ctx.font = `bold ${Math.round(s * 0.72)}px "Courier New", monospace`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(text, s / 2, s / 2 + s * 0.04);

            texture.needsUpdate = true;
        }

        updateText(initialText || "0");
        return { texture, updateText };
    }

    // Call Panel Creator
    function createCallPanel(floorNum, floorY) {
        const panelGroup = new THREE.Group();
        panelGroup.position.set(1.85, floorY + 1.4, 1.55); // Next to shaft, facing +Z

        // Backplate
        const plateGeo = new THREE.BoxGeometry(0.55, 1.35, 0.05);
        const plateMat = new THREE.MeshLambertMaterial({ color: 0x2a2a30 });
        const plateMesh = new THREE.Mesh(plateGeo, plateMat);
        panelGroup.add(plateMesh);

        // Canvas Floor Indicator
        const indObj = createDigitTexture(String(floorNum), 256);
        const indTex = indObj.texture;
        const updateInd = indObj.updateText;
        const indGeo = new THREE.PlaneGeometry(0.42, 0.42);
        const indMat = new THREE.MeshBasicMaterial({ map: indTex });
        const indMesh = new THREE.Mesh(indGeo, indMat);
        indMesh.position.set(0, 0.38, 0.028);
        panelGroup.add(indMesh);

        // Arrow Materials
        const darkMat = new THREE.MeshBasicMaterial({ color: 0x333333 });
        const litMat = new THREE.MeshBasicMaterial({ color: 0x00ff66 });

        // UP Arrow (triangle pointing up)
        const upShape = new THREE.Shape();
        upShape.moveTo(0, 0.12);
        upShape.lineTo(-0.11, -0.09);
        upShape.lineTo(0.11, -0.09);
        upShape.closePath();
        const upGeo = new THREE.ShapeGeometry(upShape);
        const upMesh = new THREE.Mesh(upGeo, darkMat.clone());
        upMesh.position.set(0, 0.05, 0.028);
        panelGroup.add(upMesh);

        // DOWN Arrow (triangle pointing down)
        const downShape = new THREE.Shape();
        downShape.moveTo(0, -0.12);
        downShape.lineTo(-0.11, 0.09);
        downShape.lineTo(0.11, 0.09);
        downShape.closePath();
        const downGeo = new THREE.ShapeGeometry(downShape);
        const downMesh = new THREE.Mesh(downGeo, darkMat.clone());
        downMesh.position.set(0, -0.25, 0.028);
        panelGroup.add(downMesh);

        panelGroup.userData = {
            setUp: function(on) {
                upMesh.material.color.setHex(on ? 0x00ff66 : 0x333333);
            },
            setDown: function(on) {
                downMesh.material.color.setHex(on ? 0x00ff66 : 0x333333);
            },
            setIndicator: function(text) {
                updateInd(text);
            }
        };

        return panelGroup;
    }

    // Shaft Floor Indicator (mounted above doors)
    function createShaftIndicator(floorY) {
        const indGroup = new THREE.Group();
        indGroup.position.set(0, floorY + 2.7, 1.55); // Above door facing +Z

        const shaftTexObj = createDigitTexture("0", 256);
        const texture = shaftTexObj.texture;
        const updateText = shaftTexObj.updateText;
        const geo = new THREE.PlaneGeometry(0.85, 0.85);
        const mat = new THREE.MeshBasicMaterial({ map: texture });
        const mesh = new THREE.Mesh(geo, mat);
        indGroup.add(mesh);

        indGroup.userData = {
            setIndicator: function(text) {
                updateText(text);
            }
        };

        return indGroup;
    }

    // Office Furniture Builders
    function createDeskAndChair(chairFacing) {
        const group = new THREE.Group();
        const woodMat = new THREE.MeshLambertMaterial({ color: 0x8b5a2b });
        const darkWoodMat = new THREE.MeshLambertMaterial({ color: 0x5c3a21 });
        const metalMat = new THREE.MeshLambertMaterial({ color: 0x666666 });
        const screenMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
        const chairMat = new THREE.MeshLambertMaterial({ color: 0x223355 });

        // Desk Tabletop (width 1.6, depth 0.9, height 0.05, centered at y = 0.725)
        const topGeo = new THREE.BoxGeometry(1.6, 0.05, 0.9);
        const topMesh = new THREE.Mesh(topGeo, woodMat);
        topMesh.position.set(0, 0.725, 0);
        group.add(topMesh);

        // Desk Legs (4 legs)
        const legGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.7, 8);
        const legPositions = [
            [-0.72, 0.35, -0.37],
            [0.72, 0.35, -0.37],
            [-0.72, 0.35, 0.37],
            [0.72, 0.35, 0.37]
        ];
        legPositions.forEach(pos => {
            const leg = new THREE.Mesh(legGeo, metalMat);
            leg.position.set(pos[0], pos[1], pos[2]);
            group.add(leg);
        });

        // Computer Monitor at back of desk (z = -0.28)
        const monStandGeo = new THREE.BoxGeometry(0.12, 0.15, 0.12);
        const monStand = new THREE.Mesh(monStandGeo, metalMat);
        monStand.position.set(0, 0.825, -0.25);
        group.add(monStand);

        const monScreenGeo = new THREE.BoxGeometry(0.65, 0.4, 0.04);
        const monScreen = new THREE.Mesh(monScreenGeo, screenMat);
        monScreen.position.set(0, 1.05, -0.25);
        group.add(monScreen);

        // Keyboard
        const kbGeo = new THREE.BoxGeometry(0.42, 0.015, 0.16);
        const kbMesh = new THREE.Mesh(kbGeo, metalMat);
        kbMesh.position.set(0, 0.76, 0.05);
        group.add(kbMesh);

        // Office Chair (located at z = 0.6 relative to desk center)
        const chairGroup = new THREE.Group();
        chairGroup.position.set(0, 0, 0.6);
        chairGroup.rotation.y = chairFacing !== undefined ? chairFacing : Math.PI; // Seat faces desk (-Z)

        // Chair Seat (y = 0.45)
        const seatGeo = new THREE.BoxGeometry(0.48, 0.08, 0.48);
        const seatMesh = new THREE.Mesh(seatGeo, chairMat);
        seatMesh.position.set(0, 0.45, 0);
        chairGroup.add(seatMesh);

        // Chair Backrest (at back of seat, so seat opens away from it)
        const backGeo = new THREE.BoxGeometry(0.46, 0.48, 0.06);
        const backMesh = new THREE.Mesh(backGeo, chairMat);
        backMesh.position.set(0, 0.70, -0.21); // backrest
        chairGroup.add(backMesh);

        // Chair Base & Stem
        const stemGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.4, 8);
        const stemMesh = new THREE.Mesh(stemGeo, metalMat);
        stemMesh.position.set(0, 0.2, 0);
        chairGroup.add(stemMesh);

        const baseGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.04, 5);
        const baseMesh = new THREE.Mesh(baseGeo, metalMat);
        baseMesh.position.set(0, 0.02, 0);
        chairGroup.add(baseMesh);

        group.add(chairGroup);
        return group;
    }

    function createConferenceTableAndChairs() {
        const group = new THREE.Group();
        const woodMat = new THREE.MeshLambertMaterial({ color: 0x6e4726 });
        const metalMat = new THREE.MeshLambertMaterial({ color: 0x555555 });
        const chairMat = new THREE.MeshLambertMaterial({ color: 0x334466 });

        // Long Conference Table (width 1.5, length 3.6 along Z)
        const topGeo = new THREE.BoxGeometry(1.5, 0.06, 3.6);
        const topMesh = new THREE.Mesh(topGeo, woodMat);
        topMesh.position.set(0, 0.72, 0);
        group.add(topMesh);

        // 4 heavy legs
        const legGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.69, 8);
        const legPositions = [
            [-0.6, 0.345, -1.6],
            [0.6, 0.345, -1.6],
            [-0.6, 0.345, 1.6],
            [0.6, 0.345, 1.6]
        ];
        legPositions.forEach(pos => {
            const leg = new THREE.Mesh(legGeo, metalMat);
            leg.position.set(pos[0], pos[1], pos[2]);
            group.add(leg);
        });

        // Helper to make conference chair facing specific angle
        function makeConfChair(x, z, facingAngle) {
            const cg = new THREE.Group();
            cg.position.set(x, 0, z);
            cg.rotation.y = facingAngle;

            const seat = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.06, 0.44), chairMat);
            seat.position.set(0, 0.44, 0);
            cg.add(seat);

            const back = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.44, 0.05), chairMat);
            back.position.set(0, 0.68, -0.19);
            cg.add(back);

            const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.41, 8), metalMat);
            stem.position.set(0, 0.205, 0);
            cg.add(stem);

            return cg;
        }

        // 2 chairs on left side facing +X (angle = Math.PI / 2)
        group.add(makeConfChair(-1.1, -0.9, Math.PI / 2));
        group.add(makeConfChair(-1.1, 0.9, Math.PI / 2));

        // 2 chairs on right side facing -X (angle = -Math.PI / 2)
        group.add(makeConfChair(1.1, -0.9, -Math.PI / 2));
        group.add(makeConfChair(1.1, 0.9, -Math.PI / 2));

        return group;
    }

    function createLoungeArea() {
        const group = new THREE.Group();
        const couchMat = new THREE.MeshLambertMaterial({ color: 0x8c3b2b });
        const tableMat = new THREE.MeshLambertMaterial({ color: 0x332211 });
        const metalMat = new THREE.MeshLambertMaterial({ color: 0x777777 });
        const chairMat = new THREE.MeshLambertMaterial({ color: 0x2d5a7b });

        // Couch (centered at x = 0, z = 1.6, facing -Z / Math.PI)
        const couchGroup = new THREE.Group();
        couchGroup.position.set(0, 0, 1.6);
        couchGroup.rotation.y = Math.PI;

        const cSeat = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.35, 0.8), couchMat);
        cSeat.position.set(0, 0.28, 0);
        couchGroup.add(cSeat);

        const cBack = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.55, 0.25), couchMat);
        cBack.position.set(0, 0.65, -0.3);
        couchGroup.add(cBack);

        const cArmL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.4, 0.8), couchMat);
        cArmL.position.set(-1.1, 0.45, 0);
        couchGroup.add(cArmL);
        const cArmR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.4, 0.8), couchMat);
        cArmR.position.set(1.1, 0.45, 0);
        couchGroup.add(cArmR);
        group.add(couchGroup);

        // Coffee Table (centered at x = 0, z = 0)
        const ctTop = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.05, 0.8), tableMat);
        ctTop.position.set(0, 0.42, 0);
        group.add(ctTop);
        const ctLegGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.4, 8);
        [[-0.7, 0.2, -0.3], [0.7, 0.2, -0.3], [-0.7, 0.2, 0.3], [0.7, 0.2, 0.3]].forEach(p => {
            const leg = new THREE.Mesh(ctLegGeo, metalMat);
            leg.position.set(p[0], p[1], p[2]);
            group.add(leg);
        });

        // 2 Armchairs
        function makeArmchair(x, z, facingAngle) {
            const ag = new THREE.Group();
            ag.position.set(x, 0, z);
            ag.rotation.y = facingAngle;

            const seat = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.3, 0.7), chairMat);
            seat.position.set(0, 0.25, 0);
            ag.add(seat);

            const back = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.18), chairMat);
            back.position.set(0, 0.55, -0.26);
            ag.add(back);

            return ag;
        }

        group.add(makeArmchair(-1.4, 0, Math.PI / 2)); // Facing +X
        group.add(makeArmchair(1.4, 0, -Math.PI / 2)); // Facing -X

        return group;
    }

    function createWaterCooler() {
        const group = new THREE.Group();
        const baseMat = new THREE.MeshLambertMaterial({ color: 0xdddddd });
        const bottleMat = new THREE.MeshLambertMaterial({ color: 0x3399ff, transparent: true, opacity: 0.6 });

        // Base cabinet
        const base = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.85, 0.4), baseMat);
        base.position.set(0, 0.425, 0);
        group.add(base);

        // Water Bottle
        const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.45, 12), bottleMat);
        bottle.position.set(0, 1.05, 0);
        group.add(bottle);

        return group;
    }

    function createPottedPlant() {
        const group = new THREE.Group();
        const potMat = new THREE.MeshLambertMaterial({ color: 0xc87533 });
        const leafMat = new THREE.MeshLambertMaterial({ color: 0x2e8b57 });

        // Pot
        const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.18, 0.45, 10), potMat);
        pot.position.set(0, 0.225, 0);
        group.add(pot);

        // Foliage
        for (let i = 0; i < 5; i++) {
            const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), leafMat);
            const ang = (i / 5) * Math.PI * 2;
            leaf.position.set(Math.cos(ang) * 0.15, 0.52 + (i % 2) * 0.08, Math.sin(ang) * 0.15);
            group.add(leaf);
        }

        return group;
    }

    function createBistroTable(chairAngleA, chairAngleB) {
        const group = new THREE.Group();
        const topMat = new THREE.MeshLambertMaterial({ color: 0xeeeeee });
        const metalMat = new THREE.MeshLambertMaterial({ color: 0x444444 });
        const chairMat = new THREE.MeshLambertMaterial({ color: 0x995533 });

        // Table
        const top = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.04, 16), topMat);
        top.position.set(0, 0.72, 0);
        group.add(top);
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.7, 8), metalMat);
        leg.position.set(0, 0.35, 0);
        group.add(leg);
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.02, 12), metalMat);
        base.position.set(0, 0.01, 0);
        group.add(base);

        // 2 bistro chairs
        function makeBistroChair(x, z, facing) {
            const cg = new THREE.Group();
            cg.position.set(x, 0, z);
            cg.rotation.y = facing;

            const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.03, 10), chairMat);
            seat.position.set(0, 0.45, 0);
            cg.add(seat);

            const back = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.03), chairMat);
            back.position.set(0, 0.65, -0.18);
            cg.add(back);

            const cl = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.44, 6), metalMat);
            cl.position.set(0, 0.22, 0);
            cg.add(cl);

            return cg;
        }

        if (chairAngleA !== undefined) {
            const dist = 0.55;
            group.add(makeBistroChair(0, dist, chairAngleA)); // seat 0
            group.add(makeBistroChair(0, -dist, chairAngleB)); // seat 1
        }

        return group;
    }

    // Main createWorld function
    function createWorld(scene) {
        const buildingGroup = new THREE.Group();
        buildingGroup.renderOrder = 0;

        const transparentWallMat = new THREE.MeshLambertMaterial({
            color: 0x9999ff,
            opacity: 0.2,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide
        });

        const interiorWallMat = new THREE.MeshLambertMaterial({
            color: 0xbbc5e6,
            opacity: 0.28,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide
        });

        const floorSlabMat = new THREE.MeshLambertMaterial({
            color: 0x9999aa,
            opacity: 0.3,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide
        });

        const solidGroundMat = new THREE.MeshLambertMaterial({ color: 0x44444a });
        const sidewalkMat = new THREE.MeshLambertMaterial({ color: 0x7a7a82 });
        const roofMat = new THREE.MeshLambertMaterial({ color: 0x4a4a52 });
        const shaftPostMat = new THREE.MeshLambertMaterial({ color: 0x33333e });

        // 1. Solid Ground Slab
        const groundGeo = new THREE.BoxGeometry(WORLD.BUILDING_WIDTH, 0.2, WORLD.BUILDING_DEPTH);
        const groundMesh = new THREE.Mesh(groundGeo, solidGroundMat);
        groundMesh.position.set(0, -0.1, 0);
        buildingGroup.add(groundMesh);

        // Sidewalk outside front wall at z = 12
        const sidewalkGeo = new THREE.BoxGeometry(16, 0.1, 6);
        const sidewalkMesh = new THREE.Mesh(sidewalkGeo, sidewalkMat);
        sidewalkMesh.position.set(0, -0.05, 12);
        buildingGroup.add(sidewalkMesh);

        // 2. Roof Slab
        const totalHeight = WORLD.FLOOR_COUNT * WORLD.FLOOR_HEIGHT;
        const roofGeo = new THREE.BoxGeometry(WORLD.BUILDING_WIDTH, 0.2, WORLD.BUILDING_DEPTH);
        const roofMesh = new THREE.Mesh(roofGeo, roofMat);
        roofMesh.position.set(0, totalHeight + 0.1, 0);
        buildingGroup.add(roofMesh);

        // 3. Shaft Corner Columns (from y=0 to totalHeight)
        const colGeo = new THREE.BoxGeometry(0.12, totalHeight, 0.12);
        [
            [-1.5, totalHeight / 2, -1.5],
            [1.5, totalHeight / 2, -1.5],
            [-1.5, totalHeight / 2, 1.5],
            [1.5, totalHeight / 2, 1.5]
        ].forEach(pos => {
            const col = new THREE.Mesh(colGeo, shaftPostMat);
            col.position.set(pos[0], pos[1], pos[2]);
            buildingGroup.add(col);
        });

        // 4. Outer Walls (Left, Right, Back, and 3-Segment Front Wall)
        // Left Wall
        const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.1, totalHeight, WORLD.BUILDING_DEPTH), transparentWallMat);
        leftWall.position.set(-WORLD.BUILDING_WIDTH / 2, totalHeight / 2, 0);
        buildingGroup.add(leftWall);

        // Right Wall
        const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.1, totalHeight, WORLD.BUILDING_DEPTH), transparentWallMat);
        rightWall.position.set(WORLD.BUILDING_WIDTH / 2, totalHeight / 2, 0);
        buildingGroup.add(rightWall);

        // Back Wall
        const backWall = new THREE.Mesh(new THREE.BoxGeometry(WORLD.BUILDING_WIDTH, totalHeight, 0.1), transparentWallMat);
        backWall.position.set(0, totalHeight / 2, -WORLD.BUILDING_DEPTH / 2);
        buildingGroup.add(backWall);

        // Front Wall (at z = 9):
        // Split into Left segment (x: -11 to -1.5, width 9.5), Right segment (x: 1.5 to 11, width 9.5),
        // and Header segment covering floors 1..5 above the 3-unit doorway gap on floor 0.
        const frontLeftWall = new THREE.Mesh(new THREE.BoxGeometry(9.5, totalHeight, 0.1), transparentWallMat);
        frontLeftWall.position.set(-6.25, totalHeight / 2, WORLD.BUILDING_DEPTH / 2);
        buildingGroup.add(frontLeftWall);

        const frontRightWall = new THREE.Mesh(new THREE.BoxGeometry(9.5, totalHeight, 0.1), transparentWallMat);
        frontRightWall.position.set(6.25, totalHeight / 2, WORLD.BUILDING_DEPTH / 2);
        buildingGroup.add(frontRightWall);

        // Header above floor 0 gap (from y = 3.4 to totalHeight 20.4, height 17.0)
        const headerHeight = totalHeight - WORLD.FLOOR_HEIGHT;
        const frontHeaderWall = new THREE.Mesh(new THREE.BoxGeometry(3.0, headerHeight, 0.1), transparentWallMat);
        frontHeaderWall.position.set(0, WORLD.FLOOR_HEIGHT + headerHeight / 2, WORLD.BUILDING_DEPTH / 2);
        buildingGroup.add(frontHeaderWall);

        const floors = [];

        // Build each floor
        for (let f = 0; f < WORLD.FLOOR_COUNT; f++) {
            const floorY = f * WORLD.FLOOR_HEIGHT;
            const floorGroup = new THREE.Group();
            floorGroup.position.set(0, 0, 0);

            // Intermediate floor slabs (floors 1..5) - built as 4 strips around 3x3 shaft opening
            if (f > 0) {
                // Left strip (x: -11 to -1.5, z: -9 to 9)
                const fLeft = new THREE.Mesh(new THREE.BoxGeometry(9.5, 0.1, 18), floorSlabMat);
                fLeft.position.set(-6.25, floorY, 0);
                floorGroup.add(fLeft);

                // Right strip (x: 1.5 to 11, z: -9 to 9)
                const fRight = new THREE.Mesh(new THREE.BoxGeometry(9.5, 0.1, 18), floorSlabMat);
                fRight.position.set(6.25, floorY, 0);
                floorGroup.add(fRight);

                // Front strip (x: -1.5 to 1.5, z: 1.5 to 9)
                const fFront = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.1, 7.5), floorSlabMat);
                fFront.position.set(0, floorY, 5.25);
                floorGroup.add(fFront);

                // Back strip (x: -1.5 to 1.5, z: -9 to -1.5)
                const fBack = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.1, 7.5), floorSlabMat);
                fBack.position.set(0, floorY, -5.25);
                floorGroup.add(fBack);
            }

            // Call Panel and Shaft Indicator
            const callPanel = createCallPanel(f, floorY);
            floorGroup.add(callPanel);

            const shaftIndicator = createShaftIndicator(floorY);
            floorGroup.add(shaftIndicator);

            const nodes = {};
            const sitTargets = {};
            const desks = [];

            // Hallway Ring Nodes (common to all floors)
            nodes["hallS"] = { x: 0, z: 2.2, neighbors: ["hallSE", "hallSW", "elevWait"] };
            nodes["elevWait"] = { x: 0, z: 2.2, neighbors: ["hallS"] };
            nodes["hallSE"] = { x: 4.5, z: 2.2, neighbors: ["hallS", "hallE"] };
            nodes["hallE"] = { x: 4.5, z: 0, neighbors: ["hallSE", "hallNE"] };
            nodes["hallNE"] = { x: 4.5, z: -2.2, neighbors: ["hallE", "hallN"] };
            nodes["hallN"] = { x: 0, z: -2.2, neighbors: ["hallNE", "hallNW"] };
            nodes["hallNW"] = { x: -4.5, z: -2.2, neighbors: ["hallN", "hallW"] };
            nodes["hallW"] = { x: -4.5, z: 0, neighbors: ["hallNW", "hallSW"] };
            nodes["hallSW"] = { x: -4.5, z: 2.2, neighbors: ["hallW", "hallS"] };

            if (f === 0) {
                // ==================== FLOOR 0: LOBBY ====================
                // Entrance navigation nodes
                nodes["outside"] = { x: 0, z: 12.0, neighbors: ["front_door_threshold"] };
                nodes["front_door_threshold"] = { x: 0, z: 9.35, neighbors: ["outside", "entrance"] };
                nodes["entrance"] = { x: 0, z: 7.4, neighbors: ["front_door_threshold", "lobby_center"] };
                nodes["lobby_center"] = { x: 0, z: 4.2, neighbors: ["entrance", "elevWait", "hallS", "hallSE", "hallSW", "cafe_order", "reception", "kiosk", "lobby_stand_center"] };

                // Update elevWait and hallS to connect directly to lobby_center
                nodes["elevWait"].neighbors.push("lobby_center");
                nodes["hallS"].neighbors.push("lobby_center");

                // Cafe on Left side (x < 0, z > 0)
                const counterGeo = new THREE.BoxGeometry(0.9, 1.05, 4.0);
                const counterMat = new THREE.MeshLambertMaterial({ color: 0x3d2b1f });
                const counterMesh = new THREE.Mesh(counterGeo, counterMat);
                counterMesh.position.set(-9.2, floorY + 0.525, 5.5);
                floorGroup.add(counterMesh);

                // Countertop
                const topGeo = new THREE.BoxGeometry(1.0, 0.08, 4.2);
                const topMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
                const topMesh = new THREE.Mesh(topGeo, topMat);
                topMesh.position.set(-9.2, floorY + 1.09, 5.5);
                floorGroup.add(topMesh);

                // Coffee machine on counter
                const coffeeMach = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.45, 0.6), new THREE.MeshLambertMaterial({ color: 0x888888 }));
                coffeeMach.position.set(-9.2, floorY + 1.35, 6.4);
                floorGroup.add(coffeeMach);

                // Pastry display
                const pastryCase = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.9), new THREE.MeshLambertMaterial({ color: 0xeeeeee, transparent: true, opacity: 0.7 }));
                pastryCase.position.set(-9.2, floorY + 1.3, 4.8);
                floorGroup.add(pastryCase);

                // Cafe order node
                nodes["cafe_order"] = { x: -7.8, z: 5.5, neighbors: ["lobby_center", "hallSW"] };
                sitTargets["cafe_order"] = { sit: false, facing: -Math.PI / 2 };

                // 4 Bistro tables in Lobby Cafe
                const bistroConfigs = [
                    { x: -4.5, z: 7.2, id: 0, angA: Math.PI, angB: 0 },
                    { x: -7.2, z: 7.2, id: 2, angA: Math.PI, angB: 0 },
                    { x: -4.5, z: 4.5, id: 4, angA: Math.PI, angB: 0 },
                    { x: -7.2, z: 4.5, id: 6, angA: Math.PI, angB: 0 }
                ];

                bistroConfigs.forEach(b => {
                    const bTable = createBistroTable(b.angA, b.angB);
                    bTable.position.set(b.x, floorY, b.z);
                    floorGroup.add(bTable);

                    const s0 = `bistro_seat${b.id}`;
                    const s1 = `bistro_seat${b.id + 1}`;
                    nodes[s0] = { x: b.x, z: b.z + 0.55, neighbors: ["lobby_center", "cafe_order", "hallSW"] };
                    nodes[s1] = { x: b.x, z: b.z - 0.55, neighbors: ["lobby_center", "cafe_order", "hallSW"] };
                    sitTargets[s0] = { sit: true, facing: Math.PI }; // facing -Z toward table
                    sitTargets[s1] = { sit: true, facing: 0 };       // facing +Z toward table
                });

                // Front Lounge (Right side x > 0, z > 0)
                const frontLounge = createLoungeArea();
                frontLounge.position.set(6.8, floorY, 5.8);
                floorGroup.add(frontLounge);

                nodes["front_lounge_couch"] = { x: 6.8, z: 7.4, neighbors: ["lobby_center", "hallSE"] };
                nodes["front_lounge_chairL"] = { x: 5.4, z: 5.8, neighbors: ["lobby_center", "hallSE"] };
                nodes["front_lounge_chairR"] = { x: 8.2, z: 5.8, neighbors: ["lobby_center", "hallSE"] };
                sitTargets["front_lounge_couch"] = { sit: true, facing: Math.PI };
                sitTargets["front_lounge_chairL"] = { sit: true, facing: Math.PI / 2 };
                sitTargets["front_lounge_chairR"] = { sit: true, facing: -Math.PI / 2 };

                // Front water cooler
                const wcFront = createWaterCooler();
                wcFront.position.set(10.0, floorY, 3.5);
                floorGroup.add(wcFront);
                nodes["lobby_wc_front"] = { x: 9.2, z: 3.5, neighbors: ["hallSE", "lobby_center"] };
                sitTargets["lobby_wc_front"] = { sit: false, facing: Math.PI / 2 };

                // Back Lounge (x > 0, z < 0) - Two couches facing each other
                const backLoungeGroup = new THREE.Group();
                backLoungeGroup.position.set(6.5, floorY, -5.25);
                // Coffee table
                const blTable = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.45, 0.8), new THREE.MeshLambertMaterial({ color: 0x332211 }));
                blTable.position.set(0, 0.225, 0);
                backLoungeGroup.add(blTable);
                // Couch North (facing +Z / 0)
                const cN = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.5, 0.7), new THREE.MeshLambertMaterial({ color: 0x3b5998 }));
                cN.position.set(0, 0.25, -1.2);
                backLoungeGroup.add(cN);
                // Couch South (facing -Z / Math.PI)
                const cS = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.5, 0.7), new THREE.MeshLambertMaterial({ color: 0x3b5998 }));
                cS.position.set(0, 0.25, 1.2);
                backLoungeGroup.add(cS);
                floorGroup.add(backLoungeGroup);

                nodes["back_lounge_N"] = { x: 6.5, z: -6.45, neighbors: ["hallNE", "hallE"] };
                nodes["back_lounge_S"] = { x: 6.5, z: -4.05, neighbors: ["hallNE", "hallE"] };
                sitTargets["back_lounge_N"] = { sit: true, facing: 0 };
                sitTargets["back_lounge_S"] = { sit: true, facing: Math.PI };

                // Back water cooler
                const wcBack = createWaterCooler();
                wcBack.position.set(10.0, floorY, -3.5);
                floorGroup.add(wcBack);
                nodes["lobby_wc_back"] = { x: 9.2, z: -3.5, neighbors: ["hallNE", "hallE"] };
                sitTargets["lobby_wc_back"] = { sit: false, facing: Math.PI / 2 };

                // Conversation Pit (Back Left x < 0, z < 0)
                const pitGroup = new THREE.Group();
                pitGroup.position.set(-6.5, floorY, -5.5);
                const pitTable = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.65, 0.45, 14), new THREE.MeshLambertMaterial({ color: 0x4a2e18 }));
                pitTable.position.set(0, 0.225, 0);
                pitGroup.add(pitTable);
                floorGroup.add(pitGroup);

                nodes["pit_N"] = { x: -6.5, z: -4.3, neighbors: ["hallNW", "hallW"] };
                nodes["pit_S"] = { x: -6.5, z: -6.7, neighbors: ["hallNW", "hallW"] };
                nodes["pit_E"] = { x: -5.3, z: -5.5, neighbors: ["hallNW", "hallW"] };
                nodes["pit_W"] = { x: -7.7, z: -5.5, neighbors: ["hallNW", "hallW"] };
                sitTargets["pit_N"] = { sit: true, facing: Math.PI };
                sitTargets["pit_S"] = { sit: true, facing: 0 };
                sitTargets["pit_E"] = { sit: true, facing: -Math.PI / 2 };
                sitTargets["pit_W"] = { sit: true, facing: Math.PI / 2 };

                // Reception Desk
                const recDesk = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.05, 0.75), new THREE.MeshLambertMaterial({ color: 0x2c3e50 }));
                recDesk.position.set(-3.2, floorY + 0.525, 6.2);
                floorGroup.add(recDesk);
                nodes["reception"] = { x: -3.2, z: 5.0, neighbors: ["lobby_center", "hallSW"] };
                sitTargets["reception"] = { sit: false, facing: Math.PI };

                // Info Kiosk
                const kiosk = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.4, 0.4), new THREE.MeshLambertMaterial({ color: 0x111111 }));
                kiosk.position.set(2.8, floorY + 0.7, 7.0);
                floorGroup.add(kiosk);
                nodes["kiosk"] = { x: 2.8, z: 6.2, neighbors: ["lobby_center", "hallSE"] };
                sitTargets["kiosk"] = { sit: false, facing: Math.PI };

                // Loiter Waypoints
                nodes["lobby_stand_center"] = { x: 0, z: 5.2, neighbors: ["lobby_center", "entrance"] };
                nodes["lobby_stand_NE"] = { x: 3.5, z: 2.4, neighbors: ["hallSE", "lobby_center"] };
                nodes["lobby_stand_NW"] = { x: -3.5, z: 2.4, neighbors: ["hallSW", "lobby_center"] };
                nodes["lobby_stand_midE"] = { x: 4.5, z: -2.4, neighbors: ["hallNE", "hallE"] };
                nodes["lobby_stand_midW"] = { x: -4.5, z: -2.4, neighbors: ["hallNW", "hallW"] };
                nodes["lobby_stand_entry"] = { x: 1.8, z: 8.0, neighbors: ["entrance", "lobby_center"] };

                sitTargets["lobby_stand_center"] = { sit: false, facing: 0 };
                sitTargets["lobby_stand_NE"] = { sit: false, facing: -Math.PI / 4 };
                sitTargets["lobby_stand_NW"] = { sit: false, facing: Math.PI / 4 };
                sitTargets["lobby_stand_midE"] = { sit: false, facing: -Math.PI / 2 };
                sitTargets["lobby_stand_midW"] = { sit: false, facing: Math.PI / 2 };
                sitTargets["lobby_stand_entry"] = { sit: false, facing: Math.PI };

                // Plants
                const p1 = createPottedPlant();
                p1.position.set(-2.0, floorY, 8.2);
                floorGroup.add(p1);
                const p2 = createPottedPlant();
                p2.position.set(2.0, floorY, 8.2);
                floorGroup.add(p2);

            } else {
                // ==================== FLOORS 1..5: IDENTICAL OFFICE FLOORS ====================
                // 1. Interior Walls for 4 Private Offices along back wall (z: [-9, -2.8])
                // Back divider wall at z = -2.8 with 4 doorway gaps (1.2 wide)
                const wallSegments = [
                    { x: -10.125, width: 1.75 },
                    { x: -5.5, width: 4.3 },
                    { x: 0, width: 4.3 },
                    { x: 5.5, width: 4.3 },
                    { x: 10.125, width: 1.75 }
                ];
                wallSegments.forEach(w => {
                    const wall = new THREE.Mesh(new THREE.BoxGeometry(w.width, WORLD.FLOOR_HEIGHT, 0.08), interiorWallMat);
                    wall.position.set(w.x, floorY + WORLD.FLOOR_HEIGHT / 2, -2.8);
                    floorGroup.add(wall);
                });

                // Office dividing walls (z: [-9, -2.8])
                [-5.5, 0, 5.5].forEach(divX => {
                    const div = new THREE.Mesh(new THREE.BoxGeometry(0.08, WORLD.FLOOR_HEIGHT, 6.2), interiorWallMat);
                    div.position.set(divX, floorY + WORLD.FLOOR_HEIGHT / 2, -5.9);
                    floorGroup.add(div);
                });

                // 4 Private Offices Setup
                const officeDefs = [
                    { name: "officeA", doorX: -8.25, deskX: -8.25, hallNear: "hallNW" },
                    { name: "officeB", doorX: -2.75, deskX: -2.75, hallNear: "hallN" },
                    { name: "officeC", doorX: 2.75, deskX: 2.75, hallNear: "hallN" },
                    { name: "officeD", doorX: 8.25, deskX: 8.25, hallNear: "hallNE" }
                ];

                officeDefs.forEach(off => {
                    const deskGroup = createDeskAndChair(Math.PI);
                    deskGroup.position.set(off.deskX, floorY, -6.5);
                    floorGroup.add(deskGroup);

                    const doorNode = `${off.name}_door`;
                    const deskNode = `${off.name}_desk`;
                    nodes[doorNode] = { x: off.doorX, z: -2.8, neighbors: [off.hallNear, deskNode] };
                    nodes[deskNode] = { x: off.deskX, z: -5.7, neighbors: [doorNode] }; // Chair position
                    nodes[off.hallNear].neighbors.push(doorNode);

                    // Facing is Math.PI (facing -Z toward desk monitor)
                    sitTargets[deskNode] = { sit: true, facing: Math.PI };
                    desks.push({
                        id: `${f}_${off.name}`,
                        doorWp: doorNode,
                        deskWp: deskNode,
                        x: off.deskX,
                        z: -5.7
                    });
                });

                // 2. Conference Room (Front-Left x: [-11, -2.5], z: [2.8, 9])
                // Conf walls with doorway at x = -4.5, z = 2.8
                const confWallS1 = new THREE.Mesh(new THREE.BoxGeometry(2.0, WORLD.FLOOR_HEIGHT, 0.08), interiorWallMat);
                confWallS1.position.set(-10.0, floorY + WORLD.FLOOR_HEIGHT / 2, 2.8);
                floorGroup.add(confWallS1);

                const confWallS2 = new THREE.Mesh(new THREE.BoxGeometry(5.3, WORLD.FLOOR_HEIGHT, 0.08), interiorWallMat);
                confWallS2.position.set(-5.15, floorY + WORLD.FLOOR_HEIGHT / 2, 2.8);
                floorGroup.add(confWallS2);

                const confWallE = new THREE.Mesh(new THREE.BoxGeometry(0.08, WORLD.FLOOR_HEIGHT, 6.2), interiorWallMat);
                confWallE.position.set(-2.5, floorY + WORLD.FLOOR_HEIGHT / 2, 5.9);
                floorGroup.add(confWallE);

                const confGroup = createConferenceTableAndChairs();
                confGroup.position.set(-6.5, floorY, 5.8);
                floorGroup.add(confGroup);

                nodes["conf_door"] = { x: -4.5, z: 2.8, neighbors: ["hallSW", "conf_center"] };
                nodes["conf_center"] = { x: -6.5, z: 5.8, neighbors: ["conf_door", "conf_seat0", "conf_seat1", "conf_seat2", "conf_seat3"] };
                nodes["hallSW"].neighbors.push("conf_door");

                // 4 Conference Seats (relative to table at -6.5, 5.8)
                // Left chairs facing +X (Math.PI / 2)
                nodes["conf_seat0"] = { x: -7.6, z: 4.9, neighbors: ["conf_center"] };
                nodes["conf_seat1"] = { x: -7.6, z: 6.7, neighbors: ["conf_center"] };
                sitTargets["conf_seat0"] = { sit: true, facing: Math.PI / 2 };
                sitTargets["conf_seat1"] = { sit: true, facing: Math.PI / 2 };

                // Right chairs facing -X (-Math.PI / 2)
                nodes["conf_seat2"] = { x: -5.4, z: 4.9, neighbors: ["conf_center"] };
                nodes["conf_seat3"] = { x: -5.4, z: 6.7, neighbors: ["conf_center"] };
                sitTargets["conf_seat2"] = { sit: true, facing: -Math.PI / 2 };
                sitTargets["conf_seat3"] = { sit: true, facing: -Math.PI / 2 };

                // 3. Lounge / Break Area (Front-Right x: [2.5, 11], z: [2.8, 9])
                // Lounge walls with doorway at x = 4.5, z = 2.8
                const lWallS1 = new THREE.Mesh(new THREE.BoxGeometry(5.3, WORLD.FLOOR_HEIGHT, 0.08), interiorWallMat);
                lWallS1.position.set(5.15, floorY + WORLD.FLOOR_HEIGHT / 2, 2.8);
                floorGroup.add(lWallS1);

                const lWallS2 = new THREE.Mesh(new THREE.BoxGeometry(2.0, WORLD.FLOOR_HEIGHT, 0.08), interiorWallMat);
                lWallS2.position.set(10.0, floorY + WORLD.FLOOR_HEIGHT / 2, 2.8);
                floorGroup.add(lWallS2);

                const lWallW = new THREE.Mesh(new THREE.BoxGeometry(0.08, WORLD.FLOOR_HEIGHT, 6.2), interiorWallMat);
                lWallW.position.set(2.5, floorY + WORLD.FLOOR_HEIGHT / 2, 5.9);
                floorGroup.add(lWallW);

                const lounge = createLoungeArea();
                lounge.position.set(6.8, floorY, 5.8);
                floorGroup.add(lounge);

                const wcOffice = createWaterCooler();
                wcOffice.position.set(10.0, floorY, 3.5);
                floorGroup.add(wcOffice);

                nodes["lounge_door"] = { x: 4.5, z: 2.8, neighbors: ["hallSE", "lounge_center"] };
                nodes["lounge_center"] = { x: 6.8, z: 5.8, neighbors: ["lounge_door", "lounge_spot0", "lounge_spot1", "lounge_spot2", "water_cooler"] };
                nodes["hallSE"].neighbors.push("lounge_door");

                nodes["lounge_spot0"] = { x: 6.8, z: 7.4, neighbors: ["lounge_center"] }; // Couch
                nodes["lounge_spot1"] = { x: 5.4, z: 5.8, neighbors: ["lounge_center"] }; // Armchair Left
                nodes["lounge_spot2"] = { x: 8.2, z: 5.8, neighbors: ["lounge_center"] }; // Armchair Right
                nodes["water_cooler"] = { x: 9.2, z: 3.5, neighbors: ["lounge_center"] };

                sitTargets["lounge_spot0"] = { sit: true, facing: Math.PI };
                sitTargets["lounge_spot1"] = { sit: true, facing: Math.PI / 2 };
                sitTargets["lounge_spot2"] = { sit: true, facing: -Math.PI / 2 };
                sitTargets["water_cooler"] = { sit: false, facing: Math.PI / 2 };

                // Hallway loitering spots
                nodes["hall_stand_N"] = { x: 0, z: -2.4, neighbors: ["hallN"] };
                nodes["hall_stand_S"] = { x: 0, z: 2.6, neighbors: ["hallS"] };
                sitTargets["hall_stand_N"] = { sit: false, facing: 0 };
                sitTargets["hall_stand_S"] = { sit: false, facing: Math.PI };
            }

            buildingGroup.add(floorGroup);

            floors.push({
                floorNumber: f,
                nodes: nodes,
                callPanel: callPanel,
                shaftIndicator: shaftIndicator,
                desks: desks,
                sitTargets: sitTargets
            });
        }

        scene.add(buildingGroup);

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
