/* world.js — building geometry, per-floor layouts, furniture, navigation graph, call panels */

(function (root) {
    const THREE = root.THREE;

    const WORLD = {
        FLOOR_HEIGHT: 3.4,
        FLOOR_COUNT: 6,
        BUILDING_WIDTH: 22,
        BUILDING_DEPTH: 18,
        SHAFT_WIDTH: 3,
        SHAFT_DEPTH: 3,
        PERSON_R: 0.4
    };
    root.WORLD = WORLD;

    const TRANS_BLUE = new THREE.MeshLambertMaterial({
        color: 0x9999ff, transparent: true, opacity: 0.2,
        depthWrite: false, side: THREE.DoubleSide
    });
    const TRANS_GRAY = new THREE.MeshLambertMaterial({
        color: 0x888899, transparent: true, opacity: 0.3,
        depthWrite: false, side: THREE.DoubleSide
    });
    const INTERIOR_WALL = new THREE.MeshLambertMaterial({
        color: 0xbbc5e6, transparent: true, opacity: 0.28,
        depthWrite: false, side: THREE.DoubleSide
    });
    const SOLID_GRAY = new THREE.MeshLambertMaterial({ color: 0x777788 });
    const DARK_WOOD = new THREE.MeshLambertMaterial({ color: 0x5c4033 });
    const BLACK_PLASTIC = new THREE.MeshLambertMaterial({ color: 0x222222 });
    const CHROME = new THREE.MeshPhongMaterial({ color: 0xaaaaaa, shininess: 80 });
    const WATER_COOLER = new THREE.MeshLambertMaterial({ color: 0x44aaff, transparent: true, opacity: 0.6, depthWrite: false });
    const PLANT_GREEN = new THREE.MeshLambertMaterial({ color: 0x3a8c3a });
    const POT_BROWN = new THREE.MeshLambertMaterial({ color: 0x8b5a2b });

    function makePanelTexture(text) {
        const canvas = document.createElement("canvas");
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#050505";
        ctx.fillRect(0, 0, 256, 256);
        ctx.shadowColor = "#ff8800";
        ctx.shadowBlur = 18;
        ctx.fillStyle = "#ffbb22";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = "bold 190px system-ui, sans-serif";
        ctx.fillText(text, 128, 135);
        const tex = new THREE.CanvasTexture(canvas);
        tex._lastText = text;
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.generateMipmaps = true;
        tex.anisotropy = 4;
        return tex;
    }

    function updateTextTexture(meshOrTex, text) {
        const tex = meshOrTex.isTexture ? meshOrTex : meshOrTex.material.map;
        if (!tex) return;
        if (tex._lastText === text) return;
        const canvas = tex.image;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#050505";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.shadowColor = "#ff8800";
        ctx.shadowBlur = 18;
        ctx.fillStyle = "#ffbb22";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = "bold 190px system-ui, sans-serif";
        ctx.fillText(text, 128, 135);
        tex._lastText = text;
        tex.needsUpdate = true;
    }

    function createArrowShape(w, h) {
        const shape = new THREE.Shape();
        shape.moveTo(0, h / 2);
        shape.lineTo(w / 2, -h / 2);
        shape.lineTo(-w / 2, -h / 2);
        shape.lineTo(0, h / 2);
        return shape;
    }

    function createCallPanel() {
        const group = new THREE.Group();
        const plateGeo = new THREE.BoxGeometry(0.55, 1.4, 0.05);
        const plateMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
        const plate = new THREE.Mesh(plateGeo, plateMat);
        group.add(plate);

        const arrowW = 0.26;
        const arrowH = 0.22;
        const upShape = createArrowShape(arrowW, arrowH);
        const downShape = createArrowShape(arrowW, arrowH);
        const offMat = new THREE.MeshBasicMaterial({ color: 0x333333, side: THREE.DoubleSide });
        const onMat = new THREE.MeshBasicMaterial({ color: 0x33ff33, side: THREE.DoubleSide });

        const upGeo = new THREE.ShapeGeometry(upShape);
        const upArrow = new THREE.Mesh(upGeo, offMat.clone());
        upArrow.position.set(0, 0.35, 0.03);
        group.add(upArrow);

        const downGeo = new THREE.ShapeGeometry(downShape);
        const downArrow = new THREE.Mesh(downGeo, offMat.clone());
        downArrow.rotation.z = Math.PI;
        downArrow.position.set(0, -0.35, 0.03);
        group.add(downArrow);

        const dispGeo = new THREE.PlaneGeometry(0.45, 0.45);
        const dispTex = makePanelTexture("0");
        const dispMat = new THREE.MeshBasicMaterial({ map: dispTex, transparent: true, depthWrite: false, side: THREE.DoubleSide });
        const display = new THREE.Mesh(dispGeo, dispMat);
        display.position.set(0, 0, 0.04);
        group.add(display);

        group.userData = {
            setUp: (on) => { upArrow.material.color.setHex(on ? 0x33ff33 : 0x333333); },
            setDown: (on) => { downArrow.material.color.setHex(on ? 0x33ff33 : 0x333333); },
            setIndicator: (text) => updateTextTexture(display, text)
        };
        return group;
    }

    function createShaftIndicator() {
        const geo = new THREE.PlaneGeometry(0.9, 0.9);
        const tex = makePanelTexture("0");
        const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.userData = {
            setIndicator: (text) => updateTextTexture(mesh, text)
        };
        return mesh;
    }

    function createDesk() {
        const group = new THREE.Group();
        const top = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.8), DARK_WOOD);
        top.position.y = 0.75;
        group.add(top);
        const leg1 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.75, 0.08), CHROME);
        leg1.position.set(-0.6, 0.375, 0.3);
        const leg2 = leg1.clone(); leg2.position.set(0.6, 0.375, 0.3);
        const leg3 = leg1.clone(); leg3.position.set(-0.6, 0.375, -0.3);
        const leg4 = leg1.clone(); leg4.position.set(0.6, 0.375, -0.3);
        group.add(leg1, leg2, leg3, leg4);
        const monitor = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.08), BLACK_PLASTIC);
        monitor.position.set(0, 0.75 + 0.18, -0.3);
        group.add(monitor);
        return group;
    }

    function createChair(facingY) {
        const group = new THREE.Group();
        group.rotation.y = facingY;
        const seat = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.1, 0.55), new THREE.MeshLambertMaterial({ color: 0x444455 }));
        seat.position.y = 0.45;
        group.add(seat);
        const back = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.08), new THREE.MeshLambertMaterial({ color: 0x444455 }));
        back.position.set(0, 0.78, -0.24);
        group.add(back);
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.45), CHROME);
        leg.position.y = 0.225;
        group.add(leg);
        return group;
    }

    function createCouch(facingY) {
        const group = new THREE.Group();
        group.rotation.y = facingY;
        const seat = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.35, 0.75), new THREE.MeshLambertMaterial({ color: 0x5a5a7a }));
        seat.position.y = 0.35;
        group.add(seat);
        const back = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.6, 0.18), new THREE.MeshLambertMaterial({ color: 0x5a5a7a }));
        back.position.set(0, 0.65, -0.28);
        group.add(back);
        return group;
    }

    function createArmchair(facingY) {
        const group = new THREE.Group();
        group.rotation.y = facingY;
        const seat = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.35, 0.8), new THREE.MeshLambertMaterial({ color: 0x6a6a8a }));
        seat.position.y = 0.35;
        group.add(seat);
        const back = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.55, 0.12), new THREE.MeshLambertMaterial({ color: 0x6a6a8a }));
        back.position.set(0, 0.63, -0.34);
        group.add(back);
        return group;
    }

    function createCoffeeTable() {
        const group = new THREE.Group();
        const top = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.8), DARK_WOOD);
        top.position.y = 0.45;
        group.add(top);
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.45), CHROME);
        leg.position.y = 0.225;
        group.add(leg);
        return group;
    }

    function createBistroTable() {
        const group = new THREE.Group();
        const top = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.06, 16), DARK_WOOD);
        top.position.y = 0.75;
        group.add(top);
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.75), CHROME);
        leg.position.y = 0.375;
        group.add(leg);
        return group;
    }

    function createWaterCooler() {
        const group = new THREE.Group();
        const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.9, 16), WATER_COOLER);
        bottle.position.y = 0.45;
        group.add(bottle);
        const base = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.7, 0.35), new THREE.MeshLambertMaterial({ color: 0x888888 }));
        base.position.y = 0.35;
        group.add(base);
        return group;
    }

    function createPlant() {
        const group = new THREE.Group();
        const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.18, 0.45, 12), POT_BROWN);
        pot.position.y = 0.225;
        group.add(pot);
        const bush = new THREE.Mesh(new THREE.DodecahedronGeometry(0.45), PLANT_GREEN);
        bush.position.y = 0.75;
        group.add(bush);
        return group;
    }

    function createCounter() {
        const group = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(3.5, 1.1, 1.0), new THREE.MeshLambertMaterial({ color: 0x6a5a4a }));
        body.position.y = 0.55;
        group.add(body);
        const top = new THREE.Mesh(new THREE.BoxGeometry(3.7, 0.08, 1.2), new THREE.MeshLambertMaterial({ color: 0x333333 }));
        top.position.y = 1.14;
        group.add(top);
        const coffee = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.35), new THREE.MeshLambertMaterial({ color: 0x111111 }));
        coffee.position.set(-0.8, 1.31, -0.2);
        group.add(coffee);
        const pastry = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.25, 0.4), new THREE.MeshLambertMaterial({ color: 0xdddddd }));
        pastry.position.set(0.8, 1.26, -0.2);
        group.add(pastry);
        return group;
    }

    function createReceptionDesk() {
        const group = new THREE.Group();
        const desk = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.0, 0.9), DARK_WOOD);
        desk.position.y = 0.5;
        group.add(desk);
        const top = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.08, 1.0), new THREE.MeshLambertMaterial({ color: 0x444444 }));
        top.position.y = 1.04;
        group.add(top);
        return group;
    }

    function createKiosk() {
        const group = new THREE.Group();
        const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.4), CHROME);
        stand.position.y = 0.7;
        group.add(stand);
        const screen = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.05), new THREE.MeshLambertMaterial({ color: 0x111133 }));
        screen.position.set(0, 1.25, 0.08);
        group.add(screen);
        return group;
    }

    function addWall(parent, x, y, z, w, h, d, mat) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        mesh.position.set(x, y, z);
        mesh.renderOrder = 0;
        parent.add(mesh);
        return mesh;
    }

    function bfsPath(nodes, fromName, toName) {
        if (fromName === toName) return [];
        const byName = {};
        for (const n of nodes) byName[n.name] = n;
        const start = byName[fromName], end = byName[toName];
        if (!start || !end) return [];
        const q = [start];
        const prev = { [start.name]: null };
        let found = false;
        while (q.length) {
            const cur = q.shift();
            if (cur.name === end.name) { found = true; break; }
            for (const nb of cur.neighbors) {
                if (!(nb in prev)) {
                    prev[nb] = cur.name;
                    q.push(byName[nb]);
                }
            }
        }
        if (!found) return [];
        const path = [];
        let curName = end.name;
        while (curName !== start.name) {
            path.push(curName);
            curName = prev[curName];
        }
        path.reverse();
        return path.map(n => new THREE.Vector3(byName[n].x, byName[n].y, byName[n].z));
    }

    function createWorld(scene) {
        const buildingGroup = new THREE.Group();
        buildingGroup.renderOrder = 0;
        scene.add(buildingGroup);

        const floors = [];

        // Ground slab
        addWall(buildingGroup, 0, -0.2, 0, WORLD.BUILDING_WIDTH, 0.4, WORLD.BUILDING_DEPTH, SOLID_GRAY);
        // Roof
        addWall(buildingGroup, 0, WORLD.FLOOR_HEIGHT * WORLD.FLOOR_COUNT + 0.1, 0, WORLD.BUILDING_WIDTH, 0.2, WORLD.BUILDING_DEPTH, SOLID_GRAY);

        const halfW = WORLD.BUILDING_WIDTH / 2;
        const halfD = WORLD.BUILDING_DEPTH / 2;
        const sw2 = WORLD.SHAFT_WIDTH / 2;
        const sd2 = WORLD.SHAFT_DEPTH / 2;

        // Outer walls
        // Left wall (full)
        addWall(buildingGroup, -halfW - 0.05, WORLD.FLOOR_HEIGHT * WORLD.FLOOR_COUNT / 2, 0, 0.1, WORLD.FLOOR_HEIGHT * WORLD.FLOOR_COUNT, WORLD.BUILDING_DEPTH, TRANS_BLUE);
        // Right wall (full)
        addWall(buildingGroup, halfW + 0.05, WORLD.FLOOR_HEIGHT * WORLD.FLOOR_COUNT / 2, 0, 0.1, WORLD.FLOOR_HEIGHT * WORLD.FLOOR_COUNT, WORLD.BUILDING_DEPTH, TRANS_BLUE);
        // Back wall (full)
        addWall(buildingGroup, 0, WORLD.FLOOR_HEIGHT * WORLD.FLOOR_COUNT / 2, -halfD - 0.05, WORLD.BUILDING_WIDTH, WORLD.FLOOR_HEIGHT * WORLD.FLOOR_COUNT, 0.1, TRANS_BLUE);
        // Front wall: side panels full height, plus panel above gap
        addWall(buildingGroup, -(halfW + 1.5) / 2 - 1.5, WORLD.FLOOR_HEIGHT * WORLD.FLOOR_COUNT / 2, halfD + 0.05, halfW - 1.5, WORLD.FLOOR_HEIGHT * WORLD.FLOOR_COUNT, 0.1, TRANS_BLUE);
        addWall(buildingGroup, (halfW + 1.5) / 2 + 1.5, WORLD.FLOOR_HEIGHT * WORLD.FLOOR_COUNT / 2, halfD + 0.05, halfW - 1.5, WORLD.FLOOR_HEIGHT * WORLD.FLOOR_COUNT, 0.1, TRANS_BLUE);
        addWall(buildingGroup, 0, WORLD.FLOOR_HEIGHT * WORLD.FLOOR_COUNT / 2 + WORLD.FLOOR_HEIGHT / 2, halfD + 0.05, 3, WORLD.FLOOR_HEIGHT * (WORLD.FLOOR_COUNT - 1), 0.1, TRANS_BLUE);

        // Intermediate floors as four strips around shaft
        for (let f = 1; f < WORLD.FLOOR_COUNT; f++) {
            const y = f * WORLD.FLOOR_HEIGHT;
            const thick = 0.25;
            // north strip
            addWall(buildingGroup, 0, y, -halfD / 2 - sd2 / 2, WORLD.BUILDING_WIDTH, thick, halfD - sd2, TRANS_GRAY);
            // south strip
            addWall(buildingGroup, 0, y, halfD / 2 + sd2 / 2, WORLD.BUILDING_WIDTH, thick, halfD - sd2, TRANS_GRAY);
            // west strip
            addWall(buildingGroup, -halfW / 2 - sw2 / 2, y, 0, halfW - sw2, thick, WORLD.SHAFT_DEPTH, TRANS_GRAY);
            // east strip
            addWall(buildingGroup, halfW / 2 + sw2 / 2, y, 0, halfW - sw2, thick, WORLD.SHAFT_DEPTH, TRANS_GRAY);
        }

        for (let f = 0; f < WORLD.FLOOR_COUNT; f++) {
            const floorY = f * WORLD.FLOOR_HEIGHT;
            const floorObj = {
                floorNumber: f,
                nodes: [],
                sitTargets: {},
                desks: [],
                callPanel: null,
                shaftIndicator: null,
                entranceSpot: null,
                cafeSpots: [],
                loungeSpots: [],
                confSeats: [],
                officeSeats: []
            };

            // Common shaft frame trim at each floor
            const frame = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.15, 0.15), new THREE.MeshLambertMaterial({ color: 0x555555 }));
            frame.position.set(0, floorY + 0.1, 1.5);
            buildingGroup.add(frame);

            // Call panel on shaft wall
            const panel = createCallPanel();
            panel.position.set(1.6, floorY + 1.4, 1.52);
            panel.rotation.y = 0;
            buildingGroup.add(panel);
            floorObj.callPanel = panel;

            // Shaft indicator above doors
            const indicator = createShaftIndicator();
            indicator.position.set(0, floorY + 2.55, 1.55);
            buildingGroup.add(indicator);
            floorObj.shaftIndicator = indicator;

            // Hallway ring nodes (shared across floors, world y attached below)
            const hallNodes = [
                { name: "hallS",  x: 0,    z: 2.2 },
                { name: "hallSE", x: 2.2,  z: 2.2 },
                { name: "hallE",  x: 2.2,  z: 0 },
                { name: "hallNE", x: 2.2,  z: -2.2 },
                { name: "hallN",  x: 0,    z: -2.2 },
                { name: "hallNW", x: -2.2, z: -2.2 },
                { name: "hallW",  x: -2.2, z: 0 },
                { name: "hallSW", x: -2.2, z: 2.2 },
                { name: "elevWait", x: 0, z: 3.0 }
            ];
            hallNodes.forEach(n => {
                n.y = floorY;
                n.neighbors = [];
                floorObj.nodes.push(n);
            });
            const link = (a, b) => {
                floorObj.nodes.find(n => n.name === a).neighbors.push(b);
                floorObj.nodes.find(n => n.name === b).neighbors.push(a);
            };
            link("hallS", "hallSE"); link("hallSE", "hallE"); link("hallE", "hallNE");
            link("hallNE", "hallN"); link("hallN", "hallNW"); link("hallNW", "hallW");
            link("hallW", "hallSW"); link("hallSW", "hallS");
            link("hallS", "elevWait");

            if (f === 0) {
                // Lobby
                buildLobby(floorObj, buildingGroup, floorY);
            } else {
                // Office floor
                buildOfficeFloor(floorObj, buildingGroup, floorY, f);
            }

            floors.push(floorObj);
        }

        return { buildingGroup, floors, bfsPath };
    }

    function addNode(floorObj, name, x, y, z, neighbors) {
        const n = { name, x, y, z, neighbors: neighbors || [] };
        floorObj.nodes.push(n);
        return n;
    }

    function linkNodes(floorObj, a, b) {
        const na = floorObj.nodes.find(n => n.name === a);
        const nb = floorObj.nodes.find(n => n.name === b);
        if (na && nb) { na.neighbors.push(b); nb.neighbors.push(a); }
    }

    function buildLobby(floorObj, parent, y) {
        const add = (mesh, x, z, ry) => {
            mesh.position.set(x, y, z);
            if (ry !== undefined) mesh.rotation.y = ry;
            parent.add(mesh);
        };

        // Entrance doors
        const doorL = new THREE.Mesh(new THREE.BoxGeometry(1.45, 2.6, 0.08), new THREE.MeshLambertMaterial({ color: 0xaaccff, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide }));
        const doorR = doorL.clone();
        add(doorL, -0.75, 9, 0);
        add(doorR, 0.75, 9, 0);

        // Plants by entrance
        add(createPlant(), -2.2, 9.5);
        add(createPlant(), 2.2, 9.5);

        // Cafe counter on left wall
        const counter = createCounter();
        counter.rotation.y = Math.PI / 2;
        add(counter, -10.3, 2);

        // Bistro tables
        const tablePositions = [[-7, 4], [-7, 0], [-7, -4], [-4, 2]];
        tablePositions.forEach(([tx, tz], ti) => {
            add(createBistroTable(), tx, tz);
            const c1 = createChair(Math.PI); add(c1, tx, tz + 0.6, Math.PI);
            const c2 = createChair(0); add(c2, tx, tz - 0.6, 0);
            const wp1 = `bistro_${ti}_a`; const wp2 = `bistro_${ti}_b`;
            addNode(floorObj, wp1, tx, y, tz + 0.6);
            addNode(floorObj, wp2, tx, y, tz - 0.6);
            floorObj.sitTargets[wp1] = { sit: true, facing: Math.PI };
            floorObj.sitTargets[wp2] = { sit: true, facing: 0 };
            floorObj.cafeSpots.push(wp1, wp2);
        });

        // Cafe order waypoint
        addNode(floorObj, "cafe_order", -8.5, y, 1.5);
        linkNodes(floorObj, "cafe_order", "hallSW");

        // Front lounge (right side)
        const couchF = createCouch(Math.PI); add(couchF, 7, 6.2, Math.PI);
        const armF1 = createArmchair(-Math.PI / 2); add(armF1, 8.8, 5.2, -Math.PI / 2);
        const armF2 = createArmchair(Math.PI / 2); add(armF2, 5.2, 5.2, Math.PI / 2);
        add(createCoffeeTable(), 7, 5.2);
        add(createWaterCooler(), 9.2, 7.2);
        addNode(floorObj, "front_lounge_0", 7, y, 6.7);
        addNode(floorObj, "front_lounge_1", 8.8, y, 5.5);
        addNode(floorObj, "front_lounge_2", 5.2, y, 5.5);
        floorObj.sitTargets["front_lounge_0"] = { sit: true, facing: Math.PI };
        floorObj.sitTargets["front_lounge_1"] = { sit: true, facing: -Math.PI / 2 };
        floorObj.sitTargets["front_lounge_2"] = { sit: true, facing: Math.PI / 2 };
        floorObj.loungeSpots.push("front_lounge_0", "front_lounge_1", "front_lounge_2");
        linkNodes(floorObj, "front_lounge_0", "hallSE");

        // Back lounge (Z < 0)
        const couchBN = createCouch(Math.PI); add(couchBN, 7, -4, Math.PI);
        const couchBS = createCouch(0); add(couchBS, 7, -7.5, 0);
        add(createCoffeeTable(), 7, -5.75);
        addNode(floorObj, "back_lounge_N", 7, y, -3.7);
        addNode(floorObj, "back_lounge_S", 7, y, -7.8);
        floorObj.sitTargets["back_lounge_N"] = { sit: true, facing: Math.PI };
        floorObj.sitTargets["back_lounge_S"] = { sit: true, facing: 0 };
        floorObj.loungeSpots.push("back_lounge_N", "back_lounge_S");
        linkNodes(floorObj, "back_lounge_N", "hallNE");

        // Conversation pit (back-left)
        const pitTable = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.08, 16), DARK_WOOD);
        add(pitTable, -7, -6);
        add(createArmchair(Math.PI), -7, -4.5, Math.PI);
        add(createArmchair(0), -7, -7.5, 0);
        add(createArmchair(Math.PI / 2), -5.5, -6, Math.PI / 2);
        add(createArmchair(-Math.PI / 2), -8.5, -6, -Math.PI / 2);
        addNode(floorObj, "pit_N", -7, y, -4.3);
        addNode(floorObj, "pit_S", -7, y, -7.7);
        addNode(floorObj, "pit_E", -5.3, y, -6);
        addNode(floorObj, "pit_W", -8.7, y, -6);
        floorObj.sitTargets["pit_N"] = { sit: true, facing: Math.PI };
        floorObj.sitTargets["pit_S"] = { sit: true, facing: 0 };
        floorObj.sitTargets["pit_E"] = { sit: true, facing: Math.PI / 2 };
        floorObj.sitTargets["pit_W"] = { sit: true, facing: -Math.PI / 2 };
        floorObj.loungeSpots.push("pit_N", "pit_S", "pit_E", "pit_W");
        linkNodes(floorObj, "pit_N", "hallNW");

        // Water cooler waypoints
        add(createWaterCooler(), -9.2, -7.2);
        addNode(floorObj, "lobby_wc_back", -9.2, y, -6.8);
        linkNodes(floorObj, "lobby_wc_back", "hallW");
        addNode(floorObj, "lobby_wc_front", 9.2, y, 6.8);
        linkNodes(floorObj, "lobby_wc_front", "hallE");

        // Reception desk
        const rec = createReceptionDesk();
        add(rec, -3, 6, Math.PI / 4);
        addNode(floorObj, "reception", -3, y, 5.2);
        floorObj.sitTargets["reception"] = { sit: false, facing: Math.PI / 4 };
        linkNodes(floorObj, "reception", "hallW");

        // Kiosk near entrance
        add(createKiosk(), 2, 8);
        addNode(floorObj, "kiosk", 2, y, 7.2);
        floorObj.sitTargets["kiosk"] = { sit: false, facing: 0 };
        linkNodes(floorObj, "kiosk", "elevWait");

        // Loiter waypoints
        const loiters = [
            ["lobby_stand_center", 0, 2],
            ["lobby_stand_NE", 8, 8],
            ["lobby_stand_NW", -8, 8],
            ["lobby_stand_midE", 8, 0],
            ["lobby_stand_midW", -8, 0],
            ["lobby_stand_entry", 0, 7.5]
        ];
        loiters.forEach(([name, x, z]) => {
            addNode(floorObj, name, x, y, z);
            floorObj.sitTargets[name] = { sit: false, facing: 0 };
        });
        linkNodes(floorObj, "lobby_stand_center", "elevWait");
        linkNodes(floorObj, "lobby_stand_NE", "hallSE");
        linkNodes(floorObj, "lobby_stand_NW", "hallSW");
        linkNodes(floorObj, "lobby_stand_midE", "hallE");
        linkNodes(floorObj, "lobby_stand_midW", "hallW");
        linkNodes(floorObj, "lobby_stand_entry", "elevWait");

        // Entrance graph
        addNode(floorObj, "entrance", 0, y, 9);
        addNode(floorObj, "outside", 0, y, 12);
        floorObj.entranceSpot = "entrance";
        linkNodes(floorObj, "entrance", "outside");
        linkNodes(floorObj, "entrance", "elevWait");
    }

    function buildOfficeFloor(floorObj, parent, y, f) {
        const add = (mesh, x, z, ry) => {
            mesh.position.set(x, y, z);
            if (ry !== undefined) mesh.rotation.y = ry;
            parent.add(mesh);
        };

        // Interior walls
        const wallThick = 0.12;
        const wallH = WORLD.FLOOR_HEIGHT - 0.2;
        // Back offices separator walls along X at -5.5, 0, 5.5
        [-5.5, 0, 5.5].forEach(x => {
            addWall(parent, x, y + wallH / 2, -6, wallThick, wallH, 6, INTERIOR_WALL);
        });
        // Office front wall with door gaps (doorways at x=-8.25,-2.75,2.75,8.25)
        const doorXs = [-8.25, -2.75, 2.75, 8.25];
        const segs = [[-11, -8.25], [-8.25, -2.75], [-2.75, 2.75], [2.75, 8.25], [8.25, 11]];
        for (let i = 0; i < segs.length; i++) {
            const [x0, x1] = segs[i];
            if (i % 2 === 1) continue; // door gaps
            const cx = (x0 + x1) / 2;
            const w = Math.abs(x1 - x0);
            addWall(parent, cx, y + wallH / 2, -3, w, wallH, wallThick, INTERIOR_WALL);
        }

        // Conference room walls (front wall has 1.2 doorway gap at x=-7)
        addWall(parent, -9.2, y + wallH / 2, 3, 3.6, wallH, wallThick, INTERIOR_WALL);
        addWall(parent, -4.8, y + wallH / 2, 3, 3.6, wallH, wallThick, INTERIOR_WALL);
        addWall(parent, -3, y + wallH / 2, 6, wallThick, wallH, 6, INTERIOR_WALL); // right
        addWall(parent, -11, y + wallH / 2, 6, wallThick, wallH, 6, INTERIOR_WALL); // left
        addWall(parent, -7, y + wallH / 2, 9, 8, wallH, wallThick, INTERIOR_WALL); // back

        // Lounge walls (front wall has 1.2 doorway gap at x=7)
        addWall(parent, 4.8, y + wallH / 2, 3, 3.6, wallH, wallThick, INTERIOR_WALL);
        addWall(parent, 9.2, y + wallH / 2, 3, 3.6, wallH, wallThick, INTERIOR_WALL);
        addWall(parent, 3, y + wallH / 2, 6, wallThick, wallH, 6, INTERIOR_WALL); // left
        addWall(parent, 11, y + wallH / 2, 6, wallThick, wallH, 6, INTERIOR_WALL); // right
        addWall(parent, 7, y + wallH / 2, 9, 8, wallH, wallThick, INTERIOR_WALL); // back

        // Offices
        const officeCenters = [-8.25, -2.75, 2.75, 8.25];
        const officeLabels = ["A", "B", "C", "D"];
        officeCenters.forEach((cx, i) => {
            const label = officeLabels[i];
            add(createDesk(), cx, -7, 0);
            add(createChair(Math.PI), cx, -5.3, Math.PI);
            const deskWp = `office${label}_desk`;
            const doorWp = `office${label}_door`;
            addNode(floorObj, deskWp, cx, y, -5.3);
            addNode(floorObj, doorWp, cx, y, -2.2);
            floorObj.sitTargets[deskWp] = { sit: true, facing: Math.PI };
            floorObj.desks.push(deskWp);
            floorObj.officeSeats.push(deskWp);
            linkNodes(floorObj, doorWp, deskWp);
        });
        // Link office doors to hall
        linkNodes(floorObj, "officeA_door", "hallNW");
        linkNodes(floorObj, "officeB_door", "hallN");
        linkNodes(floorObj, "officeC_door", "hallN");
        linkNodes(floorObj, "officeD_door", "hallNE");

        // Conference room
        const table = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.08, 1.4), DARK_WOOD);
        add(table, -7, 6);
        const confSeats = [
            [-9, 5.3, 0],
            [-5, 5.3, 0],
            [-9, 6.7, Math.PI],
            [-5, 6.7, Math.PI]
        ];
        confSeats.forEach(([sx, sz, ry], i) => {
            add(createChair(ry), sx, sz, ry);
            const wp = `conf_seat${i}`;
            addNode(floorObj, wp, sx, y, sz);
            floorObj.sitTargets[wp] = { sit: true, facing: ry };
            floorObj.confSeats.push(wp);
        });
        addNode(floorObj, "conf_center", -7, y, 6);
        addNode(floorObj, "conf_door", -7, y, 2.2);
        linkNodes(floorObj, "conf_door", "hallSW");
        linkNodes(floorObj, "conf_door", "conf_center");
        confSeats.forEach((_, i) => linkNodes(floorObj, "conf_center", `conf_seat${i}`));

        // Lounge
        add(createCouch(0), 7, 4.5, 0);
        add(createArmchair(Math.PI / 2), 4.5, 6.5, Math.PI / 2);
        add(createArmchair(-Math.PI / 2), 9.5, 6.5, -Math.PI / 2);
        add(createCoffeeTable(), 7, 6);
        add(createWaterCooler(), 10.2, 7.2);
        addNode(floorObj, "lounge_spot0", 7, y, 4.8);
        addNode(floorObj, "lounge_spot1", 4.7, y, 6.5);
        addNode(floorObj, "lounge_spot2", 9.3, y, 6.5);
        floorObj.sitTargets["lounge_spot0"] = { sit: true, facing: 0 };
        floorObj.sitTargets["lounge_spot1"] = { sit: true, facing: Math.PI / 2 };
        floorObj.sitTargets["lounge_spot2"] = { sit: true, facing: -Math.PI / 2 };
        floorObj.loungeSpots.push("lounge_spot0", "lounge_spot1", "lounge_spot2");
        addNode(floorObj, "lounge_center", 7, y, 6);
        addNode(floorObj, "lounge_door", 7, y, 2.2);
        linkNodes(floorObj, "lounge_door", "hallSE");
        linkNodes(floorObj, "lounge_door", "lounge_center");
        linkNodes(floorObj, "lounge_center", "lounge_spot0");
        linkNodes(floorObj, "lounge_center", "lounge_spot1");
        linkNodes(floorObj, "lounge_center", "lounge_spot2");

        // Water cooler and hall loiter spots
        addNode(floorObj, "water_cooler", 9.5, y, 6.8);
        floorObj.sitTargets["water_cooler"] = { sit: false, facing: 0 };
        linkNodes(floorObj, "water_cooler", "hallE");
        addNode(floorObj, "hall_stand_N", 0, y, -2.5);
        addNode(floorObj, "hall_stand_S", 0, y, 2.5);
        floorObj.sitTargets["hall_stand_N"] = { sit: false, facing: 0 };
        floorObj.sitTargets["hall_stand_S"] = { sit: false, facing: Math.PI };
        linkNodes(floorObj, "hall_stand_N", "hallN");
        linkNodes(floorObj, "hall_stand_S", "hallS");
    }

    function createTextTexture(text) { return makePanelTexture(text); }

    root.createTextTexture = createTextTexture;
    root.updateTextTexture = updateTextTexture;
    root.createWorld = createWorld;
    root.bfsPath = bfsPath;
})(typeof window !== "undefined" ? window : globalThis);
