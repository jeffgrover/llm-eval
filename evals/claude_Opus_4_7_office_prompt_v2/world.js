// world.js — building geometry, per-floor layouts, furniture, navigation graph, call panels.
// Coordinate convention: +Y up, +Z front (entrance side), +X right.

(function (root) {
    const WORLD = {
        FLOOR_HEIGHT: 3.4, FLOOR_COUNT: 6,
        BUILDING_WIDTH: 22, BUILDING_DEPTH: 18,
        SHAFT_WIDTH: 3, SHAFT_DEPTH: 3,
        PERSON_R: 0.4,
    };
    root.WORLD = WORLD;

    // ---- Materials -----------------------------------------------------
    const MATERIALS = {
        slabSolid: () => new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.85 }),
        slabFloor: () => new THREE.MeshStandardMaterial({
            color: 0xa9a9b0, roughness: 0.85,
            transparent: true, opacity: 0.30,
            depthWrite: false, side: THREE.DoubleSide,
        }),
        outerWall: () => new THREE.MeshStandardMaterial({
            color: 0x9999ff, roughness: 0.7, metalness: 0.05,
            transparent: true, opacity: 0.20,
            depthWrite: false, side: THREE.DoubleSide,
        }),
        interiorWall: () => new THREE.MeshStandardMaterial({
            color: 0xbbc5e6, roughness: 0.8,
            transparent: true, opacity: 0.28,
            depthWrite: false, side: THREE.DoubleSide,
        }),
        glassDoor: () => new THREE.MeshStandardMaterial({
            color: 0xb8e0f0, roughness: 0.1, metalness: 0.4,
            transparent: true, opacity: 0.35,
            depthWrite: false, side: THREE.DoubleSide,
        }),
        wood: () => new THREE.MeshStandardMaterial({ color: 0x8a5a32, roughness: 0.7 }),
        woodDark: () => new THREE.MeshStandardMaterial({ color: 0x553522, roughness: 0.8 }),
        chair: () => new THREE.MeshStandardMaterial({ color: 0x444466, roughness: 0.7 }),
        couch: () => new THREE.MeshStandardMaterial({ color: 0x6a7e8a, roughness: 0.85 }),
        couchAccent: () => new THREE.MeshStandardMaterial({ color: 0x8a3a3a, roughness: 0.85 }),
        monitor: () => new THREE.MeshStandardMaterial({ color: 0x111122, roughness: 0.4 }),
        monitorScreen: () => new THREE.MeshStandardMaterial({
            color: 0x447799, emissive: 0x224466, emissiveIntensity: 0.6, roughness: 0.3,
        }),
        plant: () => new THREE.MeshStandardMaterial({ color: 0x2c8a3c, roughness: 0.85 }),
        pot: () => new THREE.MeshStandardMaterial({ color: 0x553a22, roughness: 0.85 }),
        metal: () => new THREE.MeshStandardMaterial({ color: 0xaaaaaa, roughness: 0.5, metalness: 0.6 }),
        metalDark: () => new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.6, metalness: 0.5 }),
        countertop: () => new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.4 }),
        sidewalk: () => new THREE.MeshStandardMaterial({ color: 0x9a9a98, roughness: 0.95 }),
        carpet: () => new THREE.MeshStandardMaterial({ color: 0x8b7355, roughness: 0.9, transparent: true, opacity: 0.55, depthWrite: false }),
        carpetDark: () => new THREE.MeshStandardMaterial({ color: 0x6e5e4a, roughness: 0.9, transparent: true, opacity: 0.55, depthWrite: false }),
        elevatorFrameRing: () => new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.6, metalness: 0.4 }),
        callPanelPlate: () => new THREE.MeshStandardMaterial({ color: 0x222227, roughness: 0.5, metalness: 0.7 }),
        arrowOff: () => new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6 }),
        arrowOn: () => new THREE.MeshStandardMaterial({
            color: 0x33ff66, emissive: 0x22cc44, emissiveIntensity: 1.0, roughness: 0.4,
        }),
    };

    // ---- Glow-text canvas texture --------------------------------------
    function makeIndicatorTexture(initialText) {
        const size = 256;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const tex = new THREE.CanvasTexture(canvas);
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.generateMipmaps = true;
        tex.anisotropy = 8;
        tex._canvas = canvas;
        tex._lastText = null;
        updateTextTexture(tex, initialText || "0");
        return tex;
    }

    function updateTextTexture(tex, text) {
        if (tex._lastText === text) return;
        tex._lastText = text;
        const canvas = tex._canvas;
        const size = canvas.width;
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, size, size);
        ctx.fillStyle = "#050505";
        ctx.fillRect(0, 0, size, size);

        ctx.fillStyle = "#ffbb22";
        ctx.shadowColor = "#ffbb22";
        ctx.shadowBlur = 30;
        const fontSize = Math.floor(size * 0.82);
        ctx.font = `bold ${fontSize}px monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(text, size / 2, size / 2 + fontSize * 0.04);
        // second pass for richer glow
        ctx.shadowBlur = 12;
        ctx.fillText(text, size / 2, size / 2 + fontSize * 0.04);
        tex.needsUpdate = true;
    }

    // ---- Call panel ----------------------------------------------------
    function makeCallPanel(parent, x, y, z, facingZSign) {
        const group = new THREE.Group();
        group.position.set(x, y, z);
        if (facingZSign < 0) group.rotation.y = Math.PI;
        parent.add(group);

        const plateGeom = new THREE.BoxGeometry(0.55, 1.4, 0.05);
        const plate = new THREE.Mesh(plateGeom, MATERIALS.callPanelPlate());
        plate.position.set(0, 0, 0);
        group.add(plate);

        // Up arrow (triangle)
        const upShape = new THREE.Shape();
        upShape.moveTo(-0.13, -0.10);
        upShape.lineTo(0.13, -0.10);
        upShape.lineTo(0, 0.13);
        upShape.lineTo(-0.13, -0.10);
        const upGeom = new THREE.ShapeGeometry(upShape);
        const upArrow = new THREE.Mesh(upGeom, MATERIALS.arrowOff());
        upArrow.position.set(0, 0.42, 0.028);
        group.add(upArrow);

        // Down arrow (inverted)
        const dnShape = new THREE.Shape();
        dnShape.moveTo(-0.13, 0.10);
        dnShape.lineTo(0.13, 0.10);
        dnShape.lineTo(0, -0.13);
        dnShape.lineTo(-0.13, 0.10);
        const dnGeom = new THREE.ShapeGeometry(dnShape);
        const dnArrow = new THREE.Mesh(dnGeom, MATERIALS.arrowOff());
        dnArrow.position.set(0, 0.05, 0.028);
        group.add(dnArrow);

        // Floor display (canvas texture)
        const floorTex = makeIndicatorTexture("0");
        const floorMat = new THREE.MeshBasicMaterial({ map: floorTex });
        const floorGeom = new THREE.PlaneGeometry(0.45, 0.45);
        const floorMesh = new THREE.Mesh(floorGeom, floorMat);
        floorMesh.position.set(0, -0.45, 0.028);
        group.add(floorMesh);

        const matOnUp = MATERIALS.arrowOn();
        const matOffUp = MATERIALS.arrowOff();
        const matOnDn = MATERIALS.arrowOn();
        const matOffDn = MATERIALS.arrowOff();

        group.userData = {
            setUp(on) {
                upArrow.material = on ? matOnUp : matOffUp;
            },
            setDown(on) {
                dnArrow.material = on ? matOnDn : matOffDn;
            },
            setIndicator(text) {
                updateTextTexture(floorTex, text);
            },
        };
        return group;
    }

    // ---- Shaft indicator (above doors) --------------------------------
    function makeShaftIndicator(parent, x, y, z) {
        const tex = makeIndicatorTexture("0");
        const mat = new THREE.MeshBasicMaterial({ map: tex });
        const geom = new THREE.PlaneGeometry(0.9, 0.9);
        const mesh = new THREE.Mesh(geom, mat);
        mesh.position.set(x, y, z);
        // Faces +Z by default — the shaft openings face +Z from the shaft interior.
        parent.add(mesh);
        mesh.userData = {
            setIndicator(text) { updateTextTexture(tex, text); },
        };
        return mesh;
    }

    // ---- Furniture helpers --------------------------------------------
    function addBox(parent, x, y, z, w, h, d, mat) {
        const g = new THREE.BoxGeometry(w, h, d);
        const m = new THREE.Mesh(g, mat);
        m.position.set(x, y + h / 2, z);
        parent.add(m);
        return m;
    }

    function addBoxAt(parent, x, y, z, w, h, d, mat) {
        const g = new THREE.BoxGeometry(w, h, d);
        const m = new THREE.Mesh(g, mat);
        m.position.set(x, y, z);
        parent.add(m);
        return m;
    }

    function addCylinder(parent, x, y, z, rTop, rBot, h, mat) {
        const g = new THREE.CylinderGeometry(rTop, rBot, h, 16);
        const m = new THREE.Mesh(g, mat);
        m.position.set(x, y + h / 2, z);
        parent.add(m);
        return m;
    }

    function makeDesk(parent, baseY, x, z, rotY) {
        const g = new THREE.Group();
        g.position.set(x, baseY, z);
        g.rotation.y = rotY || 0;
        parent.add(g);

        const woodMat = MATERIALS.wood();
        // top
        addBox(g, 0, 0.72, 0, 1.6, 0.06, 0.7, woodMat);
        // legs
        addBox(g, -0.7, 0, -0.3, 0.05, 0.72, 0.05, MATERIALS.metalDark());
        addBox(g, 0.7, 0, -0.3, 0.05, 0.72, 0.05, MATERIALS.metalDark());
        addBox(g, -0.7, 0, 0.3, 0.05, 0.72, 0.05, MATERIALS.metalDark());
        addBox(g, 0.7, 0, 0.3, 0.05, 0.72, 0.05, MATERIALS.metalDark());

        // monitor (back of desk; user faces +Z relative to desk frame, which is rotated)
        const monStand = addBox(g, 0, 0.78, -0.25, 0.08, 0.18, 0.08, MATERIALS.metalDark());
        const monBack = addBox(g, 0, 1.08, -0.27, 0.7, 0.45, 0.04, MATERIALS.monitor());
        const monScreen = addBox(g, 0, 1.08, -0.245, 0.66, 0.41, 0.01, MATERIALS.monitorScreen());

        // keyboard + mouse hint
        addBox(g, 0, 0.76, 0.10, 0.42, 0.012, 0.13, MATERIALS.metalDark());
        addBox(g, 0.30, 0.76, 0.10, 0.06, 0.012, 0.10, MATERIALS.metalDark());

        return g;
    }

    function makeOfficeChair(parent, baseY, x, z, rotY) {
        const g = new THREE.Group();
        g.position.set(x, baseY, z);
        g.rotation.y = rotY || 0;
        parent.add(g);

        const chMat = MATERIALS.chair();
        addBox(g, 0, 0.45, 0, 0.5, 0.08, 0.5, chMat); // seat
        addBox(g, 0, 0.55, -0.22, 0.5, 0.5, 0.06, chMat); // back
        addCylinder(g, 0, 0.0, 0, 0.04, 0.04, 0.40, MATERIALS.metalDark()); // post
        addCylinder(g, 0, 0.0, 0, 0.30, 0.30, 0.04, MATERIALS.metalDark()); // base
        return g;
    }

    function makeConferenceChair(parent, baseY, x, z, rotY) {
        const g = new THREE.Group();
        g.position.set(x, baseY, z);
        g.rotation.y = rotY || 0;
        parent.add(g);

        const chMat = MATERIALS.chair();
        addBox(g, 0, 0.48, 0, 0.45, 0.06, 0.45, chMat);
        addBox(g, 0, 0.62, -0.20, 0.45, 0.4, 0.05, chMat);
        addBox(g, -0.18, 0.24, -0.18, 0.04, 0.48, 0.04, MATERIALS.metalDark());
        addBox(g, 0.18, 0.24, -0.18, 0.04, 0.48, 0.04, MATERIALS.metalDark());
        addBox(g, -0.18, 0.24, 0.18, 0.04, 0.48, 0.04, MATERIALS.metalDark());
        addBox(g, 0.18, 0.24, 0.18, 0.04, 0.48, 0.04, MATERIALS.metalDark());
        return g;
    }

    function makeBistroChair(parent, baseY, x, z, rotY) {
        const g = new THREE.Group();
        g.position.set(x, baseY, z);
        g.rotation.y = rotY || 0;
        parent.add(g);

        addCylinder(g, 0, 0.45, 0, 0.22, 0.22, 0.05, MATERIALS.metal());
        addCylinder(g, 0, 0.0, 0, 0.03, 0.03, 0.45, MATERIALS.metalDark());
        addBox(g, 0, 0.65, -0.18, 0.4, 0.35, 0.04, MATERIALS.metal());
        return g;
    }

    function makeArmchair(parent, baseY, x, z, rotY) {
        const g = new THREE.Group();
        g.position.set(x, baseY, z);
        g.rotation.y = rotY || 0;
        parent.add(g);

        const cMat = MATERIALS.couch();
        addBox(g, 0, 0.4, 0, 0.85, 0.18, 0.8, cMat);
        addBox(g, 0, 0.7, -0.32, 0.85, 0.6, 0.16, cMat);
        addBox(g, -0.42, 0.55, 0, 0.16, 0.5, 0.65, cMat);
        addBox(g, 0.42, 0.55, 0, 0.16, 0.5, 0.65, cMat);
        return g;
    }

    function makeCouch(parent, baseY, x, z, rotY, len) {
        const g = new THREE.Group();
        g.position.set(x, baseY, z);
        g.rotation.y = rotY || 0;
        parent.add(g);

        const w = len || 2.4;
        const cMat = MATERIALS.couchAccent();
        addBox(g, 0, 0.36, 0, w, 0.16, 0.85, cMat);
        addBox(g, 0, 0.68, -0.34, w, 0.55, 0.16, cMat);
        addBox(g, -(w / 2 - 0.08), 0.55, 0, 0.16, 0.5, 0.7, cMat);
        addBox(g, (w / 2 - 0.08), 0.55, 0, 0.16, 0.5, 0.7, cMat);
        return g;
    }

    function makeCoffeeTable(parent, baseY, x, z) {
        const g = new THREE.Group();
        g.position.set(x, baseY, z);
        parent.add(g);
        addBox(g, 0, 0.38, 0, 1.1, 0.06, 0.6, MATERIALS.woodDark());
        addBox(g, -0.5, 0, -0.25, 0.05, 0.38, 0.05, MATERIALS.metalDark());
        addBox(g, 0.5, 0, -0.25, 0.05, 0.38, 0.05, MATERIALS.metalDark());
        addBox(g, -0.5, 0, 0.25, 0.05, 0.38, 0.05, MATERIALS.metalDark());
        addBox(g, 0.5, 0, 0.25, 0.05, 0.38, 0.05, MATERIALS.metalDark());
        return g;
    }

    function makeWaterCooler(parent, baseY, x, z) {
        const g = new THREE.Group();
        g.position.set(x, baseY, z);
        parent.add(g);
        addBox(g, 0, 0, 0, 0.4, 0.95, 0.4, MATERIALS.metal());
        // jug on top
        addCylinder(g, 0, 0.95, 0, 0.18, 0.22, 0.45, new THREE.MeshStandardMaterial({
            color: 0x7fd0ff, transparent: true, opacity: 0.5, roughness: 0.2,
        }));
        return g;
    }

    function makePlant(parent, baseY, x, z) {
        const g = new THREE.Group();
        g.position.set(x, baseY, z);
        parent.add(g);
        addCylinder(g, 0, 0, 0, 0.22, 0.30, 0.30, MATERIALS.pot());
        addCylinder(g, 0, 0.28, 0, 0.55, 0.0, 1.0, MATERIALS.plant());
        return g;
    }

    function makeReceptionDesk(parent, baseY, x, z, rotY) {
        const g = new THREE.Group();
        g.position.set(x, baseY, z);
        g.rotation.y = rotY || 0;
        parent.add(g);
        addBox(g, 0, 0.5, 0, 2.4, 0.05, 0.9, MATERIALS.wood());
        addBox(g, 0, 0.55, 0.42, 2.4, 1.10, 0.06, MATERIALS.wood());
        addBox(g, 0, 1.08, 0.42, 2.4, 0.04, 0.08, MATERIALS.woodDark());
        addBox(g, 0, 0.25, -0.22, 2.4, 0.5, 0.45, MATERIALS.woodDark());
        return g;
    }

    function makeCafeCounter(parent, baseY, x, z) {
        const g = new THREE.Group();
        g.position.set(x, baseY, z);
        parent.add(g);
        addBox(g, 0, 0.5, 0, 4.0, 0.05, 0.7, MATERIALS.countertop());
        addBox(g, 0, 0.25, 0, 4.0, 0.5, 0.65, MATERIALS.wood());
        // coffee machine
        addBox(g, -1.4, 0.55, 0, 0.5, 0.5, 0.4, MATERIALS.metalDark());
        addCylinder(g, -1.6, 0.55, 0.08, 0.05, 0.05, 0.18, MATERIALS.metal());
        addCylinder(g, -1.2, 0.55, 0.08, 0.05, 0.05, 0.18, MATERIALS.metal());
        // pastry display
        addBox(g, 1.0, 0.55, 0, 1.4, 0.4, 0.5, new THREE.MeshStandardMaterial({
            color: 0xddccaa, transparent: true, opacity: 0.6, roughness: 0.2,
        }));
        return g;
    }

    function makeBistroTable(parent, baseY, x, z) {
        const g = new THREE.Group();
        g.position.set(x, baseY, z);
        parent.add(g);
        addCylinder(g, 0, 0, 0, 0.04, 0.04, 0.72, MATERIALS.metalDark());
        addCylinder(g, 0, 0, 0, 0.30, 0.30, 0.04, MATERIALS.metalDark());
        addCylinder(g, 0, 0.72, 0, 0.50, 0.50, 0.04, MATERIALS.wood());
        return g;
    }

    function makeConferenceTable(parent, baseY, x, z) {
        const g = new THREE.Group();
        g.position.set(x, baseY, z);
        parent.add(g);
        addBox(g, 0, 0.72, 0, 3.4, 0.05, 1.1, MATERIALS.wood());
        addBox(g, -1.5, 0.36, 0, 0.06, 0.7, 0.7, MATERIALS.metalDark());
        addBox(g, 1.5, 0.36, 0, 0.06, 0.7, 0.7, MATERIALS.metalDark());
        return g;
    }

    function makeRoundTable(parent, baseY, x, z) {
        const g = new THREE.Group();
        g.position.set(x, baseY, z);
        parent.add(g);
        addCylinder(g, 0, 0.0, 0, 0.05, 0.05, 0.7, MATERIALS.metalDark());
        addCylinder(g, 0, 0.0, 0, 0.4, 0.4, 0.04, MATERIALS.metalDark());
        addCylinder(g, 0, 0.7, 0, 1.0, 1.0, 0.04, MATERIALS.wood());
        return g;
    }

    // ---- Walls ---------------------------------------------------------
    function addWall(parent, x, y, z, w, h, d) {
        return addBox(parent, x, y, z, w, h, d, MATERIALS.outerWall());
    }
    function addInteriorWall(parent, x, y, z, w, h, d) {
        return addBox(parent, x, y, z, w, h, d, MATERIALS.interiorWall());
    }

    // ---- Navigation graph helpers -------------------------------------
    function makeNode(name, x, y, z) {
        return { name, pos: new THREE.Vector3(x, y, z), neighbors: [] };
    }
    function link(graph, a, b) {
        if (!graph[a] || !graph[b]) {
            console.warn("link: missing node", a, "or", b);
            return;
        }
        if (graph[a].neighbors.indexOf(b) < 0) graph[a].neighbors.push(b);
        if (graph[b].neighbors.indexOf(a) < 0) graph[b].neighbors.push(a);
    }

    function bfsPath(nodes, fromName, toName) {
        if (!nodes[fromName] || !nodes[toName]) return [];
        if (fromName === toName) return [nodes[toName].pos.clone()];

        const visited = new Set();
        const prev = {};
        const q = [fromName];
        visited.add(fromName);
        while (q.length) {
            const cur = q.shift();
            if (cur === toName) break;
            for (const n of nodes[cur].neighbors) {
                if (visited.has(n)) continue;
                visited.add(n);
                prev[n] = cur;
                q.push(n);
            }
        }
        if (!visited.has(toName)) return [];
        const path = [];
        let cur = toName;
        while (cur) {
            path.unshift(nodes[cur].pos.clone());
            cur = prev[cur];
        }
        return path;
    }

    // ---- Per-floor common: hallway ring around shaft -------------------
    // Hall ring at y = floorY + 0
    function buildHallRing(floorY, prefix) {
        const nodes = {};
        const SX = WORLD.SHAFT_WIDTH / 2; // 1.5
        const SZ = WORLD.SHAFT_DEPTH / 2; // 1.5
        const m = 0.9; // hall margin from shaft edge
        // arrange the ring around the shaft
        nodes[`${prefix}hallS`]  = makeNode(`${prefix}hallS`,    0,  floorY,  SZ + m);
        nodes[`${prefix}hallSE`] = makeNode(`${prefix}hallSE`,  SX + m, floorY,  SZ + m);
        nodes[`${prefix}hallE`]  = makeNode(`${prefix}hallE`,   SX + m, floorY,   0);
        nodes[`${prefix}hallNE`] = makeNode(`${prefix}hallNE`,  SX + m, floorY, -(SZ + m));
        nodes[`${prefix}hallN`]  = makeNode(`${prefix}hallN`,    0,  floorY, -(SZ + m));
        nodes[`${prefix}hallNW`] = makeNode(`${prefix}hallNW`, -(SX + m), floorY, -(SZ + m));
        nodes[`${prefix}hallW`]  = makeNode(`${prefix}hallW`,  -(SX + m), floorY,   0);
        nodes[`${prefix}hallSW`] = makeNode(`${prefix}hallSW`, -(SX + m), floorY,  SZ + m);
        nodes[`${prefix}elevWait`] = makeNode(`${prefix}elevWait`, 0, floorY, SZ + 0.2);
        return nodes;
    }

    function ringLink(graph, prefix) {
        const order = ["hallS","hallSE","hallE","hallNE","hallN","hallNW","hallW","hallSW"];
        for (let i = 0; i < order.length; i++) {
            link(graph, prefix + order[i], prefix + order[(i + 1) % order.length]);
        }
        link(graph, prefix + "elevWait", prefix + "hallS");
    }

    // ---- Build building structure --------------------------------------
    function buildShell(buildingGroup) {
        const W = WORLD.BUILDING_WIDTH;
        const D = WORLD.BUILDING_DEPTH;
        const FH = WORLD.FLOOR_HEIGHT;
        const NF = WORLD.FLOOR_COUNT;
        const HBLD = NF * FH;

        // Ground slab (solid gray)
        addBoxAt(buildingGroup, 0, -0.05, 0, W + 0.4, 0.1, D + 0.4, MATERIALS.slabSolid());
        // Roof slab (solid gray)
        addBoxAt(buildingGroup, 0, HBLD + 0.05, 0, W + 0.4, 0.1, D + 0.4, MATERIALS.slabSolid());

        // Outer walls
        // Back wall (z = -D/2): solid full height
        addBoxAt(buildingGroup, 0, HBLD / 2, -D / 2, W, HBLD, 0.1, MATERIALS.outerWall());
        // Left wall
        addBoxAt(buildingGroup, -W / 2, HBLD / 2, 0, 0.1, HBLD, D, MATERIALS.outerWall());
        // Right wall
        addBoxAt(buildingGroup, W / 2, HBLD / 2, 0, 0.1, HBLD, D, MATERIALS.outerWall());
        // Front wall: 3-unit gap on floor 0 only.
        // Two side panels full height
        const gapW = 3.0;
        const sideW = (W - gapW) / 2;
        addBoxAt(buildingGroup, -(W / 2 - sideW / 2), HBLD / 2, D / 2, sideW, HBLD, 0.1, MATERIALS.outerWall());
        addBoxAt(buildingGroup, (W / 2 - sideW / 2), HBLD / 2, D / 2, sideW, HBLD, 0.1, MATERIALS.outerWall());
        // Above-the-gap panel covering floors 1..NF-1
        const aboveH = HBLD - FH; // covers FH..HBLD
        addBoxAt(buildingGroup, 0, FH + aboveH / 2, D / 2, gapW, aboveH, 0.1, MATERIALS.outerWall());

        // Glass entrance doors (in the gap on floor 0)
        const doorH = FH - 0.4;
        addBoxAt(buildingGroup, -0.78, doorH / 2 + 0.1, D / 2, 1.4, doorH, 0.05, MATERIALS.glassDoor());
        addBoxAt(buildingGroup, 0.78, doorH / 2 + 0.1, D / 2, 1.4, doorH, 0.05, MATERIALS.glassDoor());

        // Sidewalk slab outside front
        addBoxAt(buildingGroup, 0, -0.025, D / 2 + 3.5, W + 4, 0.05, 6.5, MATERIALS.sidewalk());

        // Intermediate floor slabs as four strips around the shaft opening.
        // Shaft footprint: x in [-1.5, 1.5], z in [-1.5, 1.5].
        const SW = WORLD.SHAFT_WIDTH;
        const SD = WORLD.SHAFT_DEPTH;
        for (let f = 1; f < NF; f++) {
            const y = f * FH;
            // strip 1: x: -W/2..-SW/2,  z: -D/2..D/2
            const w1 = (W / 2) - (SW / 2);
            addBoxAt(buildingGroup, -(W / 2 - w1 / 2), y, 0, w1, 0.06, D, MATERIALS.slabFloor());
            addBoxAt(buildingGroup,  (W / 2 - w1 / 2), y, 0, w1, 0.06, D, MATERIALS.slabFloor());
            // strip 2: x: -SW/2..SW/2,  z: -D/2..-SD/2 and SD/2..D/2
            const d1 = (D / 2) - (SD / 2);
            addBoxAt(buildingGroup, 0, y, -(D / 2 - d1 / 2), SW, 0.06, d1, MATERIALS.slabFloor());
            addBoxAt(buildingGroup, 0, y,  (D / 2 - d1 / 2), SW, 0.06, d1, MATERIALS.slabFloor());
        }

        // Shaft pillars at corners (subtle dark guides)
        const corners = [
            [-SW / 2, -SD / 2], [SW / 2, -SD / 2], [-SW / 2, SD / 2], [SW / 2, SD / 2],
        ];
        for (const [cx, cz] of corners) {
            addBoxAt(buildingGroup, cx, HBLD / 2, cz, 0.08, HBLD, 0.08, MATERIALS.elevatorFrameRing());
        }
    }

    // ---- Build an office floor (floors 1..5) ---------------------------
    function buildOfficeFloor(parent, floorNumber) {
        const FH = WORLD.FLOOR_HEIGHT;
        const W = WORLD.BUILDING_WIDTH;
        const D = WORLD.BUILDING_DEPTH;
        const floorY = floorNumber * FH;
        const SW = WORLD.SHAFT_WIDTH;
        const SD = WORLD.SHAFT_DEPTH;

        const floorGroup = new THREE.Group();
        parent.add(floorGroup);

        const prefix = ""; // single-floor namespace; nodes are scoped per-floor

        // ---- Carpet patches under interior areas (visual hint) ----
        // Office strip
        addBoxAt(floorGroup, 0, floorY + 0.005, -6, W - 1, 0.005, 6, MATERIALS.carpet());
        // Conf room
        addBoxAt(floorGroup, -7, floorY + 0.005, 6, 8, 0.005, 6, MATERIALS.carpetDark());
        // Lounge
        addBoxAt(floorGroup, 7, floorY + 0.005, 6, 8, 0.005, 6, MATERIALS.carpetDark());

        // ---- Interior walls ----
        // Office row separators along z = -3 (back walls) — actually back wall is the building back at z = -9
        // Front wall of offices at z = -3 (with door gaps for each office)
        // 4 offices along back, divided every (W-2)/4 units
        const officeFrontZ = -3;
        const officeBackZ = -(D / 2) + 0.1; // back wall is the building outer wall
        const officeAreaW = W - 1;
        const officeAreaXStart = -officeAreaW / 2;
        const officeW = officeAreaW / 4;
        const wallH = FH - 0.2;
        const doorGap = 1.2;

        const officeMeta = []; // {idx, centerX, doorX, deskX, deskZ}

        for (let i = 0; i < 4; i++) {
            const x0 = officeAreaXStart + i * officeW;
            const x1 = x0 + officeW;
            const centerX = (x0 + x1) / 2;

            // Side walls between offices (skip the outer walls — those are the building shell)
            if (i > 0) {
                addBoxAt(floorGroup, x0, floorY + wallH / 2, (officeFrontZ + officeBackZ) / 2,
                    0.08, wallH, Math.abs(officeFrontZ - officeBackZ), MATERIALS.interiorWall());
            }

            // Front wall of this office: from x0 to x1, with a doorway gap.
            // Place the door near one side so desks have the back wall.
            const doorCenterX = centerX + (i % 2 === 0 ? -officeW / 4 : officeW / 4);
            // Left segment of the front wall
            const lSegW = Math.max(0.05, (doorCenterX - doorGap / 2) - x0);
            if (lSegW > 0.05) {
                addBoxAt(floorGroup,
                    x0 + lSegW / 2, floorY + wallH / 2, officeFrontZ,
                    lSegW, wallH, 0.08, MATERIALS.interiorWall());
            }
            // Right segment
            const rSegW = Math.max(0.05, x1 - (doorCenterX + doorGap / 2));
            if (rSegW > 0.05) {
                addBoxAt(floorGroup,
                    (doorCenterX + doorGap / 2) + rSegW / 2, floorY + wallH / 2, officeFrontZ,
                    rSegW, wallH, 0.08, MATERIALS.interiorWall());
            }

            // Furniture: desk at back of office, chair behind it (toward door)
            const deskX = centerX;
            const deskZ = officeBackZ + 1.4; // a bit forward of the back wall
            // desk geometry: monitor at -Z side, user sits on +Z side facing -Z
            // We rotate the desk by Math.PI so its "back" (monitor) faces +Z toward the back wall? Wait.
            // Re-read prompt: "desk monitor sits at back of desk; the user sits in the chair facing the desk (-Z),
            // so walking in through the office doorway puts the person behind their chair."
            // Doorway is at front (officeFrontZ = -3); back wall is at -9.
            // So back of desk = back wall side (-Z). Monitor at back (more -Z). User on +Z side facing -Z.
            // Our makeDesk has the monitor at local z=-0.27 (i.e., -Z side). With rotY=0:
            //   monitor is at world z = deskZ - 0.27 (further from doorway). Correct.
            //   user sits at z = deskZ + 0.6, facing -Z (toward monitor). Correct.
            makeDesk(floorGroup, floorY, deskX, deskZ, 0);
            // chair behind desk, facing -Z (rotation Y = Math.PI so seat opens toward monitor)
            makeOfficeChair(floorGroup, floorY, deskX, deskZ + 0.6, Math.PI);

            officeMeta.push({
                idx: i,
                key: ["A","B","C","D"][i],
                centerX, doorX: doorCenterX,
                deskX, deskZ: deskZ + 0.6, // sit position
                deskFacing: Math.PI, // facing -Z (toward monitor at -Z)
            });
        }

        // Conference room front wall (front-left quadrant: x [-11,-3], z [3,9])
        // Walls: left side is outer wall, top is at z = 9 outer wall, right side wall at x = -3, bottom (front-facing the hallway) at z = 3
        // Right wall at x = -3, z = 3..9 with door gap near the bottom
        const confRightX = -3;
        const confZ0 = 3, confZ1 = 9;
        const confDoorZ = confZ0 + 1.0; // door near hallway side
        // upper segment
        addBoxAt(floorGroup, confRightX,
            floorY + wallH / 2, (confDoorZ + doorGap / 2 + confZ1) / 2,
            0.08, wallH, confZ1 - (confDoorZ + doorGap / 2), MATERIALS.interiorWall());
        // lower (between confZ0 and door bottom edge)
        const lowSegLen = (confDoorZ - doorGap / 2) - confZ0;
        if (lowSegLen > 0.05) {
            addBoxAt(floorGroup, confRightX,
                floorY + wallH / 2, confZ0 + lowSegLen / 2,
                0.08, wallH, lowSegLen, MATERIALS.interiorWall());
        }
        // Bottom wall at z = 3, from outer x to confRightX
        addBoxAt(floorGroup, (-W / 2 + confRightX) / 2,
            floorY + wallH / 2, confZ0,
            confRightX - (-W / 2), wallH, 0.08, MATERIALS.interiorWall());

        // Conference table + 4 chairs
        const confCx = -7, confCz = 6;
        makeConferenceTable(floorGroup, floorY, confCx, confCz);
        // 4 chairs (2 per long side)
        const confSeats = [
            { x: confCx - 1.0, z: confCz - 0.95, rotY: 0,         key: "conf_seat0", facing: 0 },     // south side, faces +Z
            { x: confCx + 1.0, z: confCz - 0.95, rotY: 0,         key: "conf_seat1", facing: 0 },
            { x: confCx - 1.0, z: confCz + 0.95, rotY: Math.PI,    key: "conf_seat2", facing: Math.PI },
            { x: confCx + 1.0, z: confCz + 0.95, rotY: Math.PI,    key: "conf_seat3", facing: Math.PI },
        ];
        for (const s of confSeats) {
            makeConferenceChair(floorGroup, floorY, s.x, s.z, s.rotY);
        }

        // Lounge front wall (front-right quadrant: x [3,11], z [3,9])
        const lougeLeftX = 3;
        const loungeDoorZ = confZ0 + 1.0;
        addBoxAt(floorGroup, lougeLeftX,
            floorY + wallH / 2, (loungeDoorZ + doorGap / 2 + confZ1) / 2,
            0.08, wallH, confZ1 - (loungeDoorZ + doorGap / 2), MATERIALS.interiorWall());
        const lowSegLen2 = (loungeDoorZ - doorGap / 2) - confZ0;
        if (lowSegLen2 > 0.05) {
            addBoxAt(floorGroup, lougeLeftX,
                floorY + wallH / 2, confZ0 + lowSegLen2 / 2,
                0.08, wallH, lowSegLen2, MATERIALS.interiorWall());
        }
        addBoxAt(floorGroup, (lougeLeftX + W / 2) / 2,
            floorY + wallH / 2, confZ0,
            (W / 2) - lougeLeftX, wallH, 0.08, MATERIALS.interiorWall());

        // Lounge furniture
        const lgCx = 7, lgCz = 6;
        makeCouch(floorGroup, floorY, lgCx, lgCz - 1.2, 0, 2.4); // facing +Z
        makeArmchair(floorGroup, floorY, lgCx - 1.6, lgCz + 0.4, Math.PI / 2);
        makeArmchair(floorGroup, floorY, lgCx + 1.6, lgCz + 0.4, -Math.PI / 2);
        makeCoffeeTable(floorGroup, floorY, lgCx, lgCz - 0.2);
        makeWaterCooler(floorGroup, floorY, lgCx + 2.6, lgCz - 2.5);
        makePlant(floorGroup, floorY, lgCx - 2.5, lgCz - 2.4);

        // ---- Call panel + shaft indicator ----
        // Call panel on the wall next to the shaft, facing +Z
        const callPanel = makeCallPanel(floorGroup,
            SW / 2 + 0.3, floorY + 1.2, SD / 2 + 0.04, +1);
        const shaftIndicator = makeShaftIndicator(floorGroup,
            0, floorY + FH - 0.8, SD / 2 + 0.05);

        // ---- Build navigation graph ----
        const nodes = buildHallRing(floorY, "");

        // office door + desk nodes
        for (const om of officeMeta) {
            const doorName = `office${om.key}_door`;
            const deskName = `office${om.key}_desk`;
            nodes[doorName] = makeNode(doorName, om.doorX, floorY, officeFrontZ + 0.4);
            nodes[deskName] = makeNode(deskName, om.deskX, floorY, om.deskZ);
        }
        // conference nodes
        nodes["conf_door"] = makeNode("conf_door", confRightX + 0.5, floorY, confDoorZ);
        nodes["conf_center"] = makeNode("conf_center", confCx, floorY, confCz);
        for (const s of confSeats) {
            nodes[s.key] = makeNode(s.key, s.x, floorY, s.z);
        }
        // lounge nodes
        nodes["lounge_door"] = makeNode("lounge_door", lougeLeftX - 0.5, floorY, loungeDoorZ);
        nodes["lounge_center"] = makeNode("lounge_center", lgCx, floorY, lgCz - 0.2);
        nodes["lounge_spot0"] = makeNode("lounge_spot0", lgCx - 1.5, floorY, lgCz + 0.4);
        nodes["lounge_spot1"] = makeNode("lounge_spot1", lgCx + 1.5, floorY, lgCz + 0.4);
        nodes["lounge_spot2"] = makeNode("lounge_spot2", lgCx, floorY, lgCz - 1.2);
        nodes["water_cooler"] = makeNode("water_cooler", lgCx + 2.2, floorY, lgCz - 2.5);

        // hallway loiter spots
        nodes["hall_stand_N"] = makeNode("hall_stand_N", 0.0, floorY, -SD / 2 - 1.6);
        nodes["hall_stand_S"] = makeNode("hall_stand_S", 0.0, floorY,  SD / 2 + 1.6);

        // Link the ring
        ringLink(nodes, "");

        // Link offices: each office door <-> nearest hall corner; door <-> desk
        // 4 offices: A (leftmost) link to hallNW or hallN; B, C, D distribute around hallN, hallNE
        // Pick by x sign:
        for (const om of officeMeta) {
            const doorName = `office${om.key}_door`;
            const deskName = `office${om.key}_desk`;
            // back side (z negative) — nearest among hallN, hallNW, hallNE
            const candidates = ["hallN","hallNW","hallNE"];
            let best = candidates[0];
            let bestD = Infinity;
            for (const c of candidates) {
                const d = nodes[c].pos.distanceTo(nodes[doorName].pos);
                if (d < bestD) { bestD = d; best = c; }
            }
            link(nodes, doorName, best);
            link(nodes, doorName, deskName);
        }

        // Conference: door <-> hallSW; door <-> conf_center; center <-> seats
        link(nodes, "conf_door", "hallSW");
        link(nodes, "conf_door", "conf_center");
        for (const s of confSeats) link(nodes, "conf_center", s.key);

        // Lounge: door <-> hallSE; door <-> center; center <-> spots; center <-> water_cooler
        link(nodes, "lounge_door", "hallSE");
        link(nodes, "lounge_door", "lounge_center");
        link(nodes, "lounge_center", "lounge_spot0");
        link(nodes, "lounge_center", "lounge_spot1");
        link(nodes, "lounge_center", "lounge_spot2");
        link(nodes, "lounge_center", "water_cooler");

        // Hall loiter
        link(nodes, "hall_stand_N", "hallN");
        link(nodes, "hall_stand_S", "hallS");

        // Build sit targets
        const sitTargets = {};
        for (const om of officeMeta) {
            sitTargets[`office${om.key}_desk`] = { sit: true, facing: om.deskFacing };
        }
        for (const s of confSeats) sitTargets[s.key] = { sit: true, facing: s.facing };
        sitTargets["lounge_spot0"] = { sit: true, facing: 0 };
        sitTargets["lounge_spot1"] = { sit: true, facing: 0 };
        sitTargets["lounge_spot2"] = { sit: true, facing: Math.PI };
        sitTargets["water_cooler"] = { sit: false, facing: -Math.PI / 2 };
        sitTargets["hall_stand_N"] = { sit: false, facing: Math.PI };
        sitTargets["hall_stand_S"] = { sit: false, facing: 0 };

        // Desks list for HUD / spawn assignments
        const desks = officeMeta.map(om => ({
            id: om.key,
            doorWp: `office${om.key}_door`,
            deskWp: `office${om.key}_desk`,
        }));

        return {
            floorNumber,
            nodes,
            callPanel,
            shaftIndicator,
            desks,
            sitTargets,
            // Lobby-only fields are added by buildLobby
        };
    }

    // ---- Build lobby (floor 0) -----------------------------------------
    function buildLobby(parent) {
        const FH = WORLD.FLOOR_HEIGHT;
        const W = WORLD.BUILDING_WIDTH;
        const D = WORLD.BUILDING_DEPTH;
        const floorY = 0;
        const SW = WORLD.SHAFT_WIDTH;
        const SD = WORLD.SHAFT_DEPTH;

        const floorGroup = new THREE.Group();
        parent.add(floorGroup);

        // Carpet area in lobby
        addBoxAt(floorGroup, 0, floorY + 0.005, 0, W - 1, 0.005, D - 1, MATERIALS.carpet());

        const wallH = FH - 0.2;

        // ---- Cafe on the left (x: -11..-3, z: 3..9) — counter against left wall
        // Counter parallel to back of cafe area at z = 8 (along wall); patrons stand at +Z side? Actually facing -Z (toward wall) — keep simple.
        const cafeCounter = makeCafeCounter(floorGroup, floorY, -7, 8);
        // Bistro tables (4) with two chairs each, in the cafe area
        const bistroTables = [
            { x: -9, z: 5 }, { x: -5, z: 5 }, { x: -9, z: 3.2 }, { x: -5, z: 3.2 },
        ];
        const bistroChairs = []; // {x, z, rotY, key}
        for (let i = 0; i < bistroTables.length; i++) {
            const bt = bistroTables[i];
            makeBistroTable(floorGroup, floorY, bt.x, bt.z);
            // Two chairs flanking the table
            const cN = { x: bt.x, z: bt.z - 0.85, rotY: 0,        key: `bistro${i}_N`, facing: 0 };
            const cS = { x: bt.x, z: bt.z + 0.85, rotY: Math.PI,  key: `bistro${i}_S`, facing: Math.PI };
            makeBistroChair(floorGroup, floorY, cN.x, cN.z, cN.rotY);
            makeBistroChair(floorGroup, floorY, cS.x, cS.z, cS.rotY);
            bistroChairs.push(cN, cS);
        }

        // Front lounge (right side, near entrance): x: 3..11, z: 3..9
        const flCx = 7, flCz = 6;
        makeCouch(floorGroup, floorY, flCx, flCz - 1.2, 0, 2.4);
        makeArmchair(floorGroup, floorY, flCx - 1.8, flCz + 0.4, Math.PI / 2);
        makeArmchair(floorGroup, floorY, flCx + 1.8, flCz + 0.4, -Math.PI / 2);
        makeCoffeeTable(floorGroup, floorY, flCx, flCz - 0.2);

        // Back lounge (z < 0): two couches facing each other across coffee table
        const blCx = 7, blCz = -5;
        makeCouch(floorGroup, floorY, blCx, blCz - 1.2, 0, 2.4); // faces +Z
        makeCouch(floorGroup, floorY, blCx, blCz + 1.2, Math.PI, 2.4); // faces -Z
        makeCoffeeTable(floorGroup, floorY, blCx, blCz);

        // Conversation pit (back-left): round table with 4 armchairs
        const pitCx = -7, pitCz = -5;
        makeRoundTable(floorGroup, floorY, pitCx, pitCz);
        makeArmchair(floorGroup, floorY, pitCx, pitCz - 1.7, 0);
        makeArmchair(floorGroup, floorY, pitCx, pitCz + 1.7, Math.PI);
        makeArmchair(floorGroup, floorY, pitCx - 1.7, pitCz, Math.PI / 2);
        makeArmchair(floorGroup, floorY, pitCx + 1.7, pitCz, -Math.PI / 2);

        // Two water coolers
        makeWaterCooler(floorGroup, floorY, -10, -8);
        makeWaterCooler(floorGroup, floorY, 10, -8);

        // Reception desk tucked off (x = -5, z = 6 too close to cafe). Use right side near entrance.
        const recDesk = makeReceptionDesk(floorGroup, floorY, -3.5, 7.0, Math.PI);

        // Two potted plants by entrance
        makePlant(floorGroup, floorY, -2.5, 8.5);
        makePlant(floorGroup, floorY, 2.5, 8.5);

        // Info kiosk — small standing thing near entrance
        addBox(floorGroup, 4.5, floorY, 7.5, 0.6, 1.2, 0.6, MATERIALS.metalDark());
        addBox(floorGroup, 4.5, floorY + 1.25, 7.5, 0.5, 0.05, 0.5, MATERIALS.countertop());

        // ---- Call panel + shaft indicator ----
        const callPanel = makeCallPanel(floorGroup,
            SW / 2 + 0.3, floorY + 1.2, SD / 2 + 0.04, +1);
        const shaftIndicator = makeShaftIndicator(floorGroup,
            0, floorY + FH - 0.8, SD / 2 + 0.05);

        // ---- Navigation graph ----
        const nodes = buildHallRing(floorY, "");

        // Entrance + outside
        nodes["entrance"] = makeNode("entrance", 0, floorY, D / 2 - 0.5);
        nodes["outside"]  = makeNode("outside", 0, floorY, D / 2 + 3.5);

        // Cafe nodes
        nodes["cafe_door"] = makeNode("cafe_door", -3.5, floorY, 3.0);
        nodes["cafe_order"] = makeNode("cafe_order", -7, floorY, 7.0);
        for (let i = 0; i < bistroChairs.length; i++) {
            const c = bistroChairs[i];
            nodes[c.key] = makeNode(c.key, c.x, floorY, c.z);
        }

        // Front lounge
        nodes["fl_door"] = makeNode("fl_door", 3.5, floorY, 3.0);
        nodes["fl_center"] = makeNode("fl_center", flCx, floorY, flCz - 0.2);
        nodes["fl_couch"] = makeNode("fl_couch", flCx, floorY, flCz - 1.2);
        nodes["fl_arm0"] = makeNode("fl_arm0", flCx - 1.5, floorY, flCz + 0.4);
        nodes["fl_arm1"] = makeNode("fl_arm1", flCx + 1.5, floorY, flCz + 0.4);

        // Back lounge
        nodes["bl_center"] = makeNode("bl_center", blCx, floorY, blCz);
        nodes["back_lounge_N"] = makeNode("back_lounge_N", blCx, floorY, blCz - 1.2);
        nodes["back_lounge_S"] = makeNode("back_lounge_S", blCx, floorY, blCz + 1.2);

        // Conversation pit
        nodes["pit_center"] = makeNode("pit_center", pitCx, floorY, pitCz);
        nodes["pit_N"] = makeNode("pit_N", pitCx, floorY, pitCz - 1.7);
        nodes["pit_S"] = makeNode("pit_S", pitCx, floorY, pitCz + 1.7);
        nodes["pit_E"] = makeNode("pit_E", pitCx + 1.7, floorY, pitCz);
        nodes["pit_W"] = makeNode("pit_W", pitCx - 1.7, floorY, pitCz);

        // Water coolers
        nodes["lobby_wc_front"] = makeNode("lobby_wc_front", -10, floorY, -7.5);
        nodes["lobby_wc_back"]  = makeNode("lobby_wc_back",  10, floorY, -7.5);

        // Reception, kiosk
        nodes["reception"] = makeNode("reception", -3.5, floorY, 6.4);
        nodes["kiosk"] = makeNode("kiosk", 4.5, floorY, 7.0);

        // Generic loiter
        nodes["lobby_stand_center"] = makeNode("lobby_stand_center", 0, floorY, 5);
        nodes["lobby_stand_NE"] = makeNode("lobby_stand_NE", 6, floorY, -3);
        nodes["lobby_stand_NW"] = makeNode("lobby_stand_NW", -6, floorY, -3);
        nodes["lobby_stand_midE"] = makeNode("lobby_stand_midE", 4.5, floorY, 1);
        nodes["lobby_stand_midW"] = makeNode("lobby_stand_midW", -4.5, floorY, 1);
        nodes["lobby_stand_entry"] = makeNode("lobby_stand_entry", 0, floorY, 7);

        // Link ring + outside/entrance shortcut
        ringLink(nodes, "");
        link(nodes, "entrance", "elevWait");
        link(nodes, "entrance", "outside");
        link(nodes, "entrance", "lobby_stand_entry");
        link(nodes, "lobby_stand_entry", "elevWait");

        // Cafe links
        link(nodes, "cafe_door", "hallSW");
        link(nodes, "cafe_door", "cafe_order");
        for (let i = 0; i < bistroChairs.length; i++) {
            link(nodes, "cafe_door", bistroChairs[i].key);
        }

        // Front lounge
        link(nodes, "fl_door", "hallSE");
        link(nodes, "fl_door", "fl_center");
        link(nodes, "fl_center", "fl_couch");
        link(nodes, "fl_center", "fl_arm0");
        link(nodes, "fl_center", "fl_arm1");

        // Back lounge
        link(nodes, "bl_center", "hallNE");
        link(nodes, "bl_center", "back_lounge_N");
        link(nodes, "bl_center", "back_lounge_S");
        link(nodes, "back_lounge_N", "lobby_wc_back");

        // Pit
        link(nodes, "pit_center", "hallNW");
        link(nodes, "pit_center", "pit_N");
        link(nodes, "pit_center", "pit_S");
        link(nodes, "pit_center", "pit_E");
        link(nodes, "pit_center", "pit_W");
        link(nodes, "pit_W", "lobby_wc_front");

        // Reception, kiosk
        link(nodes, "reception", "hallSW");
        link(nodes, "kiosk", "lobby_stand_entry");

        // Loiter spots
        link(nodes, "lobby_stand_center", "elevWait");
        link(nodes, "lobby_stand_NE", "hallNE");
        link(nodes, "lobby_stand_NW", "hallNW");
        link(nodes, "lobby_stand_midE", "hallE");
        link(nodes, "lobby_stand_midW", "hallW");

        // sit targets
        const sitTargets = {};
        for (let i = 0; i < bistroChairs.length; i++) {
            const c = bistroChairs[i];
            sitTargets[c.key] = { sit: true, facing: c.facing };
        }
        sitTargets["fl_couch"] = { sit: true, facing: 0 };
        sitTargets["fl_arm0"] = { sit: true, facing: Math.PI / 2 };
        sitTargets["fl_arm1"] = { sit: true, facing: -Math.PI / 2 };
        sitTargets["back_lounge_N"] = { sit: true, facing: 0 };
        sitTargets["back_lounge_S"] = { sit: true, facing: Math.PI };
        sitTargets["pit_N"] = { sit: true, facing: 0 };
        sitTargets["pit_S"] = { sit: true, facing: Math.PI };
        sitTargets["pit_E"] = { sit: true, facing: -Math.PI / 2 };
        sitTargets["pit_W"] = { sit: true, facing: Math.PI / 2 };
        sitTargets["lobby_wc_front"] = { sit: false, facing: 0 };
        sitTargets["lobby_wc_back"] = { sit: false, facing: 0 };
        sitTargets["reception"] = { sit: false, facing: 0 };
        sitTargets["kiosk"] = { sit: false, facing: -Math.PI / 2 };
        sitTargets["lobby_stand_center"] = { sit: false, facing: 0 };
        sitTargets["lobby_stand_NE"] = { sit: false, facing: 0 };
        sitTargets["lobby_stand_NW"] = { sit: false, facing: 0 };
        sitTargets["lobby_stand_midE"] = { sit: false, facing: 0 };
        sitTargets["lobby_stand_midW"] = { sit: false, facing: 0 };
        sitTargets["lobby_stand_entry"] = { sit: false, facing: 0 };
        sitTargets["cafe_order"] = { sit: false, facing: 0 };
        sitTargets["entrance"] = { sit: false, facing: 0 };
        sitTargets["outside"] = { sit: false, facing: 0 };

        return {
            floorNumber: 0,
            nodes,
            callPanel,
            shaftIndicator,
            desks: [], // no desks in lobby
            sitTargets,
            // Lobby-specific
            entranceSpot: nodes["entrance"].pos.clone(),
            outsideSpot: nodes["outside"].pos.clone(),
            cafeSpots: bistroChairs.map(c => c.key),
            loungeSpots: ["fl_couch","fl_arm0","fl_arm1","back_lounge_N","back_lounge_S",
                "pit_N","pit_S","pit_E","pit_W"],
            standSpots: ["lobby_stand_center","lobby_stand_NE","lobby_stand_NW",
                "lobby_stand_midE","lobby_stand_midW","lobby_stand_entry",
                "reception","kiosk","cafe_order","lobby_wc_front","lobby_wc_back"],
        };
    }

    // ---- Top-level world factory ---------------------------------------
    function createWorld(scene) {
        const buildingGroup = new THREE.Group();
        buildingGroup.renderOrder = 0;
        scene.add(buildingGroup);

        buildShell(buildingGroup);

        const floors = [];
        floors.push(buildLobby(buildingGroup));
        for (let f = 1; f < WORLD.FLOOR_COUNT; f++) {
            floors.push(buildOfficeFloor(buildingGroup, f));
        }

        // Apply renderOrder to all building children (they default to 0)
        buildingGroup.traverse((obj) => {
            if (obj.isMesh) obj.renderOrder = 0;
        });

        return { buildingGroup, floors, bfsPath };
    }

    root.createWorld = createWorld;
    root.bfsPath = bfsPath;
    root.makeIndicatorTexture = makeIndicatorTexture;
    root.updateTextTexture = updateTextTexture;
})(typeof window !== "undefined" ? window : globalThis);
