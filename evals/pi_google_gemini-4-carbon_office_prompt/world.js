// world.js — Building geometry, per-floor layouts, furniture, navigation graph, call panels

const WORLD = {
    FLOOR_HEIGHT: 3.4,
    FLOOR_COUNT: 6,
    BUILDING_WIDTH: 22,
    BUILDING_DEPTH: 18,
    SHAFT_WIDTH: 3,
    SHAFT_DEPTH: 3,
    PERSON_R: 0.4
};
window.WORLD = WORLD;

(function () {
    // -------------------------------------------------------------------------
    // Digital Canvas Text Texture Helpers (cached via tex._lastText)
    // -------------------------------------------------------------------------
    function createTextTexture(initialText) {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const tex = new THREE.CanvasTexture(canvas);
        tex.generateMipmaps = true;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.anisotropy = 8;
        tex._canvas = canvas;
        tex._ctx = canvas.getContext('2d');
        tex._lastText = null;
        updateTextTexture(tex, initialText || '0');
        return tex;
    }

    function updateTextTexture(tex, text) {
        if (!tex || tex._lastText === text) return;
        tex._lastText = text;
        const canvas = tex._canvas;
        const ctx = tex._ctx;
        const w = canvas.width;
        const h = canvas.height;

        ctx.fillStyle = '#050505';
        ctx.fillRect(0, 0, w, h);

        // Subtle inner bezel frame
        ctx.strokeStyle = '#221a08';
        ctx.lineWidth = 6;
        ctx.strokeRect(6, 6, w - 12, h - 12);

        const str = String(text);
        const fontSize = str.length >= 3 ? 132 : (str.length === 2 ? 168 : 196);
        ctx.font = 'bold ' + fontSize + 'px "Trebuchet MS", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Glow pass + crisp pass
        ctx.shadowColor = '#ff9900';
        ctx.shadowBlur = 26;
        ctx.fillStyle = '#ffbb22';
        ctx.fillText(str, w / 2, h / 2 + 6);

        ctx.shadowBlur = 8;
        ctx.fillText(str, w / 2, h / 2 + 6);
        ctx.shadowBlur = 0;

        tex.needsUpdate = true;
    }

    window.createTextTexture = createTextTexture;
    window.updateTextTexture = updateTextTexture;

    // -------------------------------------------------------------------------
    // Shared Materials
    // -------------------------------------------------------------------------
    const solidSlabMat = new THREE.MeshLambertMaterial({ color: 0x767a84 });
    const sidewalkMat = new THREE.MeshLambertMaterial({ color: 0xc2c6cc });
    const groundApronMat = new THREE.MeshLambertMaterial({ color: 0x454a54 });

    const midSlabMat = new THREE.MeshLambertMaterial({
        color: 0x8e939e,
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
        side: THREE.DoubleSide
    });

    const outerWallMat = new THREE.MeshLambertMaterial({
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

    const glassDoorMat = new THREE.MeshLambertMaterial({
        color: 0xaee2ff,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
        side: THREE.DoubleSide
    });

    const shaftPostMat = new THREE.MeshLambertMaterial({ color: 0x555b66 });
    const shaftGlassMat = new THREE.MeshLambertMaterial({
        color: 0x9aa5b8,
        transparent: true,
        opacity: 0.14,
        depthWrite: false,
        side: THREE.DoubleSide
    });

    // Furniture materials (opaque so furniture reads crisply through transparent walls)
    const woodDeskMat = new THREE.MeshLambertMaterial({ color: 0x9a6b43 });
    const darkWoodMat = new THREE.MeshLambertMaterial({ color: 0x5c3d28 });
    const metalLegMat = new THREE.MeshLambertMaterial({ color: 0x475569 });
    const chairMat = new THREE.MeshLambertMaterial({ color: 0x2d3748 });
    const confChairMat = new THREE.MeshLambertMaterial({ color: 0x334155 });
    const bistroTopMat = new THREE.MeshLambertMaterial({ color: 0xe2e8f0 });
    const bistroChairMat = new THREE.MeshLambertMaterial({ color: 0xb45309 });
    const couchMat = new THREE.MeshLambertMaterial({ color: 0x3b6e8c });
    const couchAltMat = new THREE.MeshLambertMaterial({ color: 0x6d597a });
    const armchairMat = new THREE.MeshLambertMaterial({ color: 0x4a7c59 });
    const pitChairMat = new THREE.MeshLambertMaterial({ color: 0xb56576 });
    const monitorMat = new THREE.MeshLambertMaterial({ color: 0x111827 });
    const screenGlowMat = new THREE.MeshBasicMaterial({ color: 0x60a5fa });
    const coolerBaseMat = new THREE.MeshLambertMaterial({ color: 0xf1f5f9 });
    const coolerJugMat = new THREE.MeshLambertMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.65,
        depthWrite: false,
        side: THREE.DoubleSide
    });
    const potMat = new THREE.MeshLambertMaterial({ color: 0xa85532 });
    const leafMat = new THREE.MeshLambertMaterial({ color: 0x2e7d32 });
    const counterBodyMat = new THREE.MeshLambertMaterial({ color: 0x6b4f3a });
    const counterTopMat = new THREE.MeshLambertMaterial({ color: 0x27272a });
    const steelMat = new THREE.MeshLambertMaterial({ color: 0x94a3b8 });
    const pastryCaseMat = new THREE.MeshLambertMaterial({
        color: 0xe0f2fe,
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
        side: THREE.DoubleSide
    });
    const pastryMat = new THREE.MeshLambertMaterial({ color: 0xf59e0b });

    const panelBodyMat = new THREE.MeshLambertMaterial({ color: 0x262930 });
    const arrowOffMat = new THREE.MeshBasicMaterial({ color: 0x3b4048, side: THREE.DoubleSide });
    const arrowOnMat = new THREE.MeshBasicMaterial({ color: 0x22ff66, side: THREE.DoubleSide });

    // -------------------------------------------------------------------------
    // Furniture Builders (all anchored with base at local y = 0)
    // At rotation.y = 0, chairs/couches have backrest at -Z and open seat facing +Z.
    // -------------------------------------------------------------------------
    function createOfficeChair(mat) {
        const g = new THREE.Group();
        const m = mat || chairMat;
        const seat = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.06, 0.46), m);
        seat.position.set(0, 0.41, 0);
        g.add(seat);

        const back = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.46, 0.06), m);
        back.position.set(0, 0.66, -0.20);
        g.add(back);

        const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.38, 8), metalLegMat);
        ped.position.set(0, 0.19, 0);
        g.add(ped);

        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.04, 10), metalLegMat);
        base.position.set(0, 0.02, 0);
        g.add(base);
        return g;
    }

    function createArmchair(mat) {
        const g = new THREE.Group();
        const m = mat || armchairMat;
        const seat = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.26, 0.66), m);
        seat.position.set(0, 0.25, 0);
        g.add(seat);

        const back = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.44, 0.16), m);
        back.position.set(0, 0.56, -0.25);
        g.add(back);

        const armL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.26, 0.64), m);
        armL.position.set(-0.34, 0.44, 0);
        g.add(armL);

        const armR = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.26, 0.64), m);
        armR.position.set(0.34, 0.44, 0);
        g.add(armR);

        return g;
    }

    function createCouch(width, mat) {
        const w = width || 2.3;
        const m = mat || couchMat;
        const g = new THREE.Group();

        const base = new THREE.Mesh(new THREE.BoxGeometry(w, 0.28, 0.80), m);
        base.position.set(0, 0.24, 0);
        g.add(base);

        const back = new THREE.Mesh(new THREE.BoxGeometry(w, 0.48, 0.18), m);
        back.position.set(0, 0.58, -0.31);
        g.add(back);

        const armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.32, 0.80), m);
        armL.position.set(-w / 2 + 0.08, 0.46, 0);
        g.add(armL);

        const armR = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.32, 0.80), m);
        armR.position.set(w / 2 - 0.08, 0.46, 0);
        g.add(armR);

        return g;
    }

    function createOfficeDesk() {
        // Desk centered at origin; monitor sits at back (-Z edge) facing +Z?
        // Wait: in private offices, user sits on +Z side of desk facing -Z toward desk & back wall!
        // So monitor sits at back of desk (-Z side of desk) with screen facing +Z (toward the user)!
        const g = new THREE.Group();
        const top = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.06, 0.82), woodDeskMat);
        top.position.set(0, 0.73, 0);
        g.add(top);

        const legPositions = [
            [-0.80, 0.36, -0.34],
            [0.80, 0.36, -0.34],
            [-0.80, 0.36, 0.34],
            [0.80, 0.36, 0.34]
        ];
        for (let i = 0; i < legPositions.length; i++) {
            const p = legPositions[i];
            const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.72, 0.06), metalLegMat);
            leg.position.set(p[0], p[1], p[2]);
            g.add(leg);
        }

        // Monitor at back (-Z) of desk, screen facing +Z (toward the seated worker)
        const stand = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.08), monitorMat);
        stand.position.set(0, 0.82, -0.25);
        g.add(stand);

        const monitor = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.34, 0.04), monitorMat);
        monitor.position.set(0, 1.00, -0.25);
        g.add(monitor);

        const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.50, 0.28), screenGlowMat);
        screen.position.set(0, 1.00, -0.228);
        g.add(screen);

        const kb = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.02, 0.13), monitorMat);
        kb.position.set(0, 0.77, 0.04);
        g.add(kb);

        return g;
    }

    function createRectTable(w, d, h, topMat) {
        const g = new THREE.Group();
        const top = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, d), topMat || darkWoodMat);
        top.position.set(0, h, 0);
        g.add(top);

        const lx = w / 2 - 0.12;
        const lz = d / 2 - 0.12;
        const coords = [[-lx, -lz], [lx, -lz], [-lx, lz], [lx, lz]];
        for (let i = 0; i < coords.length; i++) {
            const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, h, 8), metalLegMat);
            leg.position.set(coords[i][0], h / 2, coords[i][1]);
            g.add(leg);
        }
        return g;
    }

    function createRoundTable(radius, h, topMat) {
        const g = new THREE.Group();
        const top = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.05, 18), topMat || bistroTopMat);
        top.position.set(0, h, 0);
        g.add(top);

        const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, h, 10), metalLegMat);
        ped.position.set(0, h / 2, 0);
        g.add(ped);

        const foot = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.55, radius * 0.6, 0.04, 14), metalLegMat);
        foot.position.set(0, 0.02, 0);
        g.add(foot);
        return g;
    }

    function createWaterCooler() {
        const g = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.95, 0.38), coolerBaseMat);
        body.position.set(0, 0.475, 0);
        g.add(body);

        const jug = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.42, 12), coolerJugMat);
        jug.position.set(0, 1.16, 0);
        g.add(jug);
        return g;
    }

    function createPottedPlant() {
        const g = new THREE.Group();
        const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.19, 0.42, 12), potMat);
        pot.position.set(0, 0.21, 0);
        g.add(pot);

        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.55, 8), darkWoodMat);
        stem.position.set(0, 0.60, 0);
        g.add(stem);

        const bush1 = new THREE.Mesh(new THREE.SphereGeometry(0.36, 12, 10), leafMat);
        bush1.position.set(0, 1.00, 0);
        g.add(bush1);

        const bush2 = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8), leafMat);
        bush2.position.set(0.14, 1.26, 0.06);
        g.add(bush2);
        return g;
    }

    // -------------------------------------------------------------------------
    // Call Panel + Shaft Floor Indicator Builders
    // -------------------------------------------------------------------------
    function createArrowGeometry(pointUp) {
        const shape = new THREE.Shape();
        const hw = 0.13;
        if (pointUp) {
            shape.moveTo(-hw, -0.10);
            shape.lineTo(hw, -0.10);
            shape.lineTo(0, 0.13);
            shape.closePath();
        } else {
            shape.moveTo(-hw, 0.10);
            shape.lineTo(hw, 0.10);
            shape.lineTo(0, -0.13);
            shape.closePath();
        }
        return new THREE.ShapeGeometry(shape);
    }

    const upArrowGeo = createArrowGeometry(true);
    const downArrowGeo = createArrowGeometry(false);

    function createCallPanel() {
        const group = new THREE.Group();

        const plate = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.4, 0.05), panelBodyMat);
        group.add(plate);

        const tex = createTextTexture('0');
        const dispMat = new THREE.MeshBasicMaterial({ map: tex });
        const disp = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.45), dispMat);
        disp.position.set(0, 0.40, 0.03);
        group.add(disp);

        const upMesh = new THREE.Mesh(upArrowGeo, arrowOffMat);
        upMesh.position.set(0, -0.04, 0.03);
        group.add(upMesh);

        const downMesh = new THREE.Mesh(downArrowGeo, arrowOffMat);
        downMesh.position.set(0, -0.40, 0.03);
        group.add(downMesh);

        group.userData = {
            setUp: function (on) {
                upMesh.material = on ? arrowOnMat : arrowOffMat;
            },
            setDown: function (on) {
                downMesh.material = on ? arrowOnMat : arrowOffMat;
            },
            setIndicator: function (text) {
                updateTextTexture(tex, text);
            }
        };

        return group;
    }

    function createShaftIndicator() {
        const group = new THREE.Group();
        const bezel = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.96, 0.05), panelBodyMat);
        group.add(bezel);

        const tex = createTextTexture('0');
        const mat = new THREE.MeshBasicMaterial({ map: tex });
        const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), mat);
        screen.position.set(0, 0, 0.03);
        group.add(screen);

        group.userData = {
            setIndicator: function (text) {
                updateTextTexture(tex, text);
            }
        };

        return group;
    }

    // -------------------------------------------------------------------------
    // Interior Wall Helper with Doorway Gaps
    // -------------------------------------------------------------------------
    function addWallAlongX(parent, x1, x2, z, floorY, height, gaps, mat) {
        // gaps = sorted array of [gapCenter, gapWidth]
        const wallMat = mat || interiorWallMat;
        const thickness = 0.08;
        let cursor = x1;
        const sorted = (gaps || []).slice().sort(function (a, b) { return a[0] - b[0]; });

        for (let i = 0; i < sorted.length; i++) {
            const gStart = sorted[i][0] - sorted[i][1] / 2;
            const gEnd = sorted[i][0] + sorted[i][1] / 2;
            if (gStart > cursor + 0.02) {
                const segW = gStart - cursor;
                const seg = new THREE.Mesh(new THREE.BoxGeometry(segW, height, thickness), wallMat);
                seg.position.set(cursor + segW / 2, floorY + height / 2, z);
                parent.add(seg);
            }
            // Doorway lintel header above door (from y = 2.35 to height)
            const doorH = 2.35;
            if (height > doorH + 0.05) {
                const lintelH = height - doorH;
                const lintel = new THREE.Mesh(new THREE.BoxGeometry(sorted[i][1], lintelH, thickness), wallMat);
                lintel.position.set(sorted[i][0], floorY + doorH + lintelH / 2, z);
                parent.add(lintel);
            }
            cursor = gEnd;
        }

        if (x2 > cursor + 0.02) {
            const segW = x2 - cursor;
            const seg = new THREE.Mesh(new THREE.BoxGeometry(segW, height, thickness), wallMat);
            seg.position.set(cursor + segW / 2, floorY + height / 2, z);
            parent.add(seg);
        }
    }

    function addWallAlongZ(parent, z1, z2, x, floorY, height, gaps, mat) {
        const wallMat = mat || interiorWallMat;
        const thickness = 0.08;
        let cursor = z1;
        const sorted = (gaps || []).slice().sort(function (a, b) { return a[0] - b[0]; });

        for (let i = 0; i < sorted.length; i++) {
            const gStart = sorted[i][0] - sorted[i][1] / 2;
            const gEnd = sorted[i][0] + sorted[i][1] / 2;
            if (gStart > cursor + 0.02) {
                const segD = gStart - cursor;
                const seg = new THREE.Mesh(new THREE.BoxGeometry(thickness, height, segD), wallMat);
                seg.position.set(x, floorY + height / 2, cursor + segD / 2);
                parent.add(seg);
            }
            const doorH = 2.35;
            if (height > doorH + 0.05) {
                const lintelH = height - doorH;
                const lintel = new THREE.Mesh(new THREE.BoxGeometry(thickness, lintelH, sorted[i][1]), wallMat);
                lintel.position.set(x, floorY + doorH + lintelH / 2, sorted[i][0]);
                parent.add(lintel);
            }
            cursor = gEnd;
        }

        if (z2 > cursor + 0.02) {
            const segD = z2 - cursor;
            const seg = new THREE.Mesh(new THREE.BoxGeometry(thickness, height, segD), wallMat);
            seg.position.set(x, floorY + height / 2, cursor + segD / 2);
            parent.add(seg);
        }
    }

    // -------------------------------------------------------------------------
    // Navigation Graph Helpers
    // -------------------------------------------------------------------------
    function addNode(nodes, name, x, y, z) {
        nodes[name] = {
            name: name,
            pos: new THREE.Vector3(x, y, z),
            links: []
        };
    }

    function linkNodes(nodes, a, b) {
        if (!nodes[a] || !nodes[b]) return;
        if (nodes[a].links.indexOf(b) === -1) nodes[a].links.push(b);
        if (nodes[b].links.indexOf(a) === -1) nodes[b].links.push(a);
    }

    function buildHallwayRing(nodes, floorY) {
        addNode(nodes, 'elevWait', 0, floorY, 2.35);
        addNode(nodes, 'hallS', 0, floorY, 2.85);
        addNode(nodes, 'hallSE', 2.35, floorY, 2.45);
        addNode(nodes, 'hallE', 2.35, floorY, 0.0);
        addNode(nodes, 'hallNE', 2.35, floorY, -2.30);
        addNode(nodes, 'hallN', 0, floorY, -2.30);
        addNode(nodes, 'hallNW', -2.35, floorY, -2.30);
        addNode(nodes, 'hallW', -2.35, floorY, 0.0);
        addNode(nodes, 'hallSW', -2.35, floorY, 2.45);

        const ring = ['hallS', 'hallSE', 'hallE', 'hallNE', 'hallN', 'hallNW', 'hallW', 'hallSW'];
        for (let i = 0; i < ring.length; i++) {
            linkNodes(nodes, ring[i], ring[(i + 1) % ring.length]);
        }
        linkNodes(nodes, 'elevWait', 'hallS');
    }

    function bfsPath(nodes, fromName, toName) {
        if (!nodes[fromName] || !nodes[toName]) return [];
        if (fromName === toName) return [nodes[fromName].pos.clone()];

        const queue = [fromName];
        const visited = {};
        const parent = {};
        visited[fromName] = true;

        while (queue.length > 0) {
            const cur = queue.shift();
            if (cur === toName) {
                const out = [];
                let step = toName;
                while (step !== undefined) {
                    out.push(nodes[step].pos.clone());
                    step = parent[step];
                }
                out.reverse();
                return out;
            }
            const neighbors = nodes[cur].links;
            for (let i = 0; i < neighbors.length; i++) {
                const nb = neighbors[i];
                if (!visited[nb]) {
                    visited[nb] = true;
                    parent[nb] = cur;
                    queue.push(nb);
                }
            }
        }
        return [nodes[toName].pos.clone()];
    }

    // -------------------------------------------------------------------------
    // Office Floor Builder (Floors 1..5)
    // -------------------------------------------------------------------------
    function buildOfficeFloor(buildingGroup, floorNum) {
        const y = floorNum * WORLD.FLOOR_HEIGHT;
        const wallH = WORLD.FLOOR_HEIGHT - 0.08;
        const floorGroup = new THREE.Group();
        const nodes = {};
        const sitTargets = {};
        const desks = [];

        buildHallwayRing(nodes, y);

        // Shaft-front wall trim for mounting call panel + shaft indicator
        const trimRight = new THREE.Mesh(new THREE.BoxGeometry(0.65, wallH, 0.08), interiorWallMat);
        trimRight.position.set(1.825, y + wallH / 2, 1.50);
        floorGroup.add(trimRight);

        const shaftLintel = new THREE.Mesh(new THREE.BoxGeometry(WORLD.SHAFT_WIDTH, 1.05, 0.08), interiorWallMat);
        shaftLintel.position.set(0, y + wallH - 0.525, 1.50);
        floorGroup.add(shaftLintel);

        const callPanel = createCallPanel();
        callPanel.position.set(1.86, y + 1.32, 1.55);
        floorGroup.add(callPanel);

        const shaftIndicator = createShaftIndicator();
        shaftIndicator.position.set(0, y + 2.80, 1.55);
        floorGroup.add(shaftIndicator);

        // --- Four Private Offices along back wall (z in [-9, -3]) ---
        const officeSpecs = [
            { id: 'A', cx: -8.25, hallNode: 'hallNW' },
            { id: 'B', cx: -2.75, hallNode: 'hallNW' },
            { id: 'C', cx: 2.75, hallNode: 'hallNE' },
            { id: 'D', cx: 8.25, hallNode: 'hallNE' }
        ];

        // Front wall of offices at z = -3 with four 1.2-unit doorway gaps
        addWallAlongX(floorGroup, -11, 11, -3.0, y, wallH, [
            [-8.25, 1.2],
            [-2.75, 1.2],
            [2.75, 1.2],
            [8.25, 1.2]
        ]);

        // Dividers between the 4 offices at x = -5.5, 0, +5.5
        addWallAlongZ(floorGroup, -9.0, -3.0, -5.5, y, wallH, []);
        addWallAlongZ(floorGroup, -9.0, -3.0, 0.0, y, wallH, []);
        addWallAlongZ(floorGroup, -9.0, -3.0, 5.5, y, wallH, []);

        for (let i = 0; i < officeSpecs.length; i++) {
            const spec = officeSpecs[i];
            const doorName = 'office' + spec.id + '_door';
            const deskName = 'office' + spec.id + '_desk';

            const deskMesh = createOfficeDesk();
            deskMesh.position.set(spec.cx, y, -6.65);
            floorGroup.add(deskMesh);

            const chairMesh = createOfficeChair(chairMat);
            chairMesh.position.set(spec.cx, y, -5.75);
            chairMesh.rotation.y = Math.PI; // seat opens toward monitor (-Z)
            floorGroup.add(chairMesh);

            addNode(nodes, doorName, spec.cx, y, -3.0);
            addNode(nodes, deskName, spec.cx, y, -5.75);
            linkNodes(nodes, doorName, spec.hallNode);
            linkNodes(nodes, doorName, deskName);

            // Standing by coworker's door faces into the office (-Z)
            sitTargets[doorName] = { sit: false, facing: Math.PI };
            sitTargets[deskName] = { sit: true, facing: Math.PI };

            desks.push({
                id: spec.id,
                wpName: deskName,
                doorWpName: doorName,
                pos: new THREE.Vector3(spec.cx, y, -5.75)
            });
        }
        // Connect adjacent office doors along back corridor for smooth cross-office walks
        linkNodes(nodes, 'officeA_door', 'officeB_door');
        linkNodes(nodes, 'officeC_door', 'officeD_door');

        // --- Conference Room in front-left quadrant (x: [-11, -3], z: [3, 9]) ---
        addWallAlongX(floorGroup, -11.0, -3.0, 3.0, y, wallH, [[-4.2, 1.2]]);
        addWallAlongZ(floorGroup, 3.0, 9.0, -3.0, y, wallH, []);

        const confTable = createRectTable(3.2, 1.0, 0.74, darkWoodMat);
        confTable.position.set(-7.8, y, 6.2);
        floorGroup.add(confTable);

        const confSeatDefs = [
            { name: 'conf_seat0', x: -8.5, z: 5.05, facing: 0 },
            { name: 'conf_seat1', x: -7.1, z: 5.05, facing: 0 },
            { name: 'conf_seat2', x: -8.5, z: 7.35, facing: Math.PI },
            { name: 'conf_seat3', x: -7.1, z: 7.35, facing: Math.PI }
        ];

        addNode(nodes, 'conf_door', -4.2, y, 3.0);
        addNode(nodes, 'conf_center', -4.5, y, 6.2);
        linkNodes(nodes, 'conf_door', 'hallSW');
        linkNodes(nodes, 'conf_door', 'conf_center');

        for (let i = 0; i < confSeatDefs.length; i++) {
            const cs = confSeatDefs[i];
            const ch = createOfficeChair(confChairMat);
            ch.position.set(cs.x, y, cs.z);
            ch.rotation.y = cs.facing;
            floorGroup.add(ch);

            addNode(nodes, cs.name, cs.x, y, cs.z);
            linkNodes(nodes, 'conf_center', cs.name);
            sitTargets[cs.name] = { sit: true, facing: cs.facing };
        }

        // --- Lounge / Break Area in front-right quadrant (x: [3, 11], z: [3, 9]) ---
        addWallAlongX(floorGroup, 3.0, 11.0, 3.0, y, wallH, [[4.2, 1.2]]);
        addWallAlongZ(floorGroup, 3.0, 9.0, 3.0, y, wallH, []);

        const couch = createCouch(2.3, couchMat);
        couch.position.set(7.5, y, 7.75);
        couch.rotation.y = Math.PI; // faces -Z
        floorGroup.add(couch);

        const coffeeTable = createRectTable(1.4, 0.75, 0.42, woodDeskMat);
        coffeeTable.position.set(7.5, y, 6.35);
        floorGroup.add(coffeeTable);

        const armL = createArmchair(armchairMat);
        armL.position.set(5.6, y, 6.35);
        armL.rotation.y = Math.PI / 2; // faces +X
        floorGroup.add(armL);

        const armR = createArmchair(armchairMat);
        armR.position.set(9.4, y, 6.35);
        armR.rotation.y = -Math.PI / 2; // faces -X
        floorGroup.add(armR);

        const cooler = createWaterCooler();
        cooler.position.set(9.9, y, 3.7);
        cooler.rotation.y = -Math.PI / 2;
        floorGroup.add(cooler);

        addNode(nodes, 'lounge_door', 4.2, y, 3.0);
        addNode(nodes, 'lounge_center', 5.5, y, 4.7);
        linkNodes(nodes, 'lounge_door', 'hallSE');
        linkNodes(nodes, 'lounge_door', 'lounge_center');

        addNode(nodes, 'lounge_spot0', 7.5, y, 7.65);
        sitTargets['lounge_spot0'] = { sit: true, facing: Math.PI };
        linkNodes(nodes, 'lounge_center', 'lounge_spot0');

        addNode(nodes, 'lounge_spot1', 5.6, y, 6.35);
        sitTargets['lounge_spot1'] = { sit: true, facing: Math.PI / 2 };
        linkNodes(nodes, 'lounge_center', 'lounge_spot1');

        addNode(nodes, 'lounge_spot2', 9.4, y, 6.35);
        sitTargets['lounge_spot2'] = { sit: true, facing: -Math.PI / 2 };
        linkNodes(nodes, 'lounge_center', 'lounge_spot2');

        addNode(nodes, 'water_cooler', 9.0, y, 4.0);
        sitTargets['water_cooler'] = { sit: false, facing: Math.PI / 3 };
        linkNodes(nodes, 'lounge_center', 'water_cooler');

        // Hallway loiter spots on office floor
        addNode(nodes, 'hall_stand_N', 0.0, y, -2.45);
        sitTargets['hall_stand_N'] = { sit: false, facing: 0 };
        linkNodes(nodes, 'hallN', 'hall_stand_N');

        addNode(nodes, 'hall_stand_S', 0.0, y, 5.4);
        sitTargets['hall_stand_S'] = { sit: false, facing: Math.PI };
        linkNodes(nodes, 'hallS', 'hall_stand_S');

        buildingGroup.add(floorGroup);

        return {
            floorNumber: floorNum,
            nodes: nodes,
            callPanel: callPanel,
            shaftIndicator: shaftIndicator,
            desks: desks,
            sitTargets: sitTargets
        };
    }

    // -------------------------------------------------------------------------
    // Ground Floor Builder (Floor 0 — Busy Lobby)
    // -------------------------------------------------------------------------
    function buildLobbyFloor(buildingGroup) {
        const y = 0;
        const wallH = WORLD.FLOOR_HEIGHT - 0.08;
        const floorGroup = new THREE.Group();
        const nodes = {};
        const sitTargets = {};

        buildHallwayRing(nodes, y);

        // Shaft trim, call panel, shaft indicator
        const trimRight = new THREE.Mesh(new THREE.BoxGeometry(0.65, wallH, 0.08), interiorWallMat);
        trimRight.position.set(1.825, y + wallH / 2, 1.50);
        floorGroup.add(trimRight);

        const shaftLintel = new THREE.Mesh(new THREE.BoxGeometry(WORLD.SHAFT_WIDTH, 1.05, 0.08), interiorWallMat);
        shaftLintel.position.set(0, y + wallH - 0.525, 1.50);
        floorGroup.add(shaftLintel);

        const callPanel = createCallPanel();
        callPanel.position.set(1.86, y + 1.32, 1.55);
        floorGroup.add(callPanel);

        const shaftIndicator = createShaftIndicator();
        shaftIndicator.position.set(0, y + 2.80, 1.55);
        floorGroup.add(shaftIndicator);

        // Entrance glass doors at z = +9 (3-unit gap in outer wall x in [-1.5, 1.5])
        // Propped open inward/outward slightly so agents pass freely through center
        const transom = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.90, 0.06), glassDoorMat);
        transom.position.set(0, y + 2.95, 9.0);
        floorGroup.add(transom);

        const doorLeftPivot = new THREE.Group();
        doorLeftPivot.position.set(-1.46, y, 9.0);
        const doorLeftPanel = new THREE.Mesh(new THREE.BoxGeometry(1.15, 2.45, 0.05), glassDoorMat);
        doorLeftPanel.position.set(0.575, 1.225, 0);
        doorLeftPivot.add(doorLeftPanel);
        doorLeftPivot.rotation.y = 0.95; // swung welcomingly open
        floorGroup.add(doorLeftPivot);

        const doorRightPivot = new THREE.Group();
        doorRightPivot.position.set(1.46, y, 9.0);
        const doorRightPanel = new THREE.Mesh(new THREE.BoxGeometry(1.15, 2.45, 0.05), glassDoorMat);
        doorRightPanel.position.set(-0.575, 1.225, 0);
        doorRightPivot.add(doorRightPanel);
        doorRightPivot.rotation.y = -0.95;
        floorGroup.add(doorRightPivot);

        // Potted plants flanking the entrance
        const plantL = createPottedPlant();
        plantL.position.set(-2.15, y, 8.25);
        floorGroup.add(plantL);

        const plantR = createPottedPlant();
        plantR.position.set(2.15, y, 8.25);
        floorGroup.add(plantR);

        // Sidewalk + Entrance nodes (direct link entrance <-> elevWait)
        addNode(nodes, 'outside', 0, y, 12.0);
        addNode(nodes, 'entrance', 0, y, 8.6);
        linkNodes(nodes, 'outside', 'entrance');
        linkNodes(nodes, 'entrance', 'elevWait');

        // --- Reception Desk tucked off to the side (x ≈ -3.3, z ≈ 5.8) ---
        const recGroup = new THREE.Group();
        recGroup.position.set(-3.35, y, 5.8);
        const recBody = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.02, 2.0), woodDeskMat);
        recBody.position.set(0, 0.51, 0);
        recGroup.add(recBody);
        const recLedge = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.14, 2.06), counterTopMat);
        recLedge.position.set(0.42, 1.06, 0);
        recGroup.add(recLedge);
        const recMonitor = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.28, 0.44), monitorMat);
        recMonitor.position.set(0.05, 1.16, 0);
        recGroup.add(recMonitor);
        floorGroup.add(recGroup);

        addNode(nodes, 'reception', -2.15, y, 5.8);
        sitTargets['reception'] = { sit: false, facing: -Math.PI / 2 };
        linkNodes(nodes, 'reception', 'hallSW');
        linkNodes(nodes, 'reception', 'hallS');

        // --- Info Kiosk near entrance ---
        const kioskGroup = new THREE.Group();
        kioskGroup.position.set(2.45, y, 6.8);
        const kioskPed = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.35, 0.25), panelBodyMat);
        kioskPed.position.set(0, 0.675, 0);
        kioskGroup.add(kioskPed);
        const kioskScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.52), screenGlowMat);
        kioskScreen.position.set(-0.23, 1.02, 0);
        kioskScreen.rotation.y = -Math.PI / 2;
        kioskGroup.add(kioskScreen);
        floorGroup.add(kioskGroup);

        addNode(nodes, 'kiosk', 1.65, y, 6.8);
        sitTargets['kiosk'] = { sit: false, facing: Math.PI / 2 };
        linkNodes(nodes, 'kiosk', 'entrance');
        linkNodes(nodes, 'kiosk', 'hallSE');

        // --- Cafe on the left wall ---
        const cafeCounter = new THREE.Group();
        cafeCounter.position.set(-10.1, y, 5.2);
        const cBox = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.96, 4.4), counterBodyMat);
        cBox.position.set(0, 0.48, 0);
        cafeCounter.add(cBox);
        const cTop = new THREE.Mesh(new THREE.BoxGeometry(1.22, 0.08, 4.52), counterTopMat);
        cTop.position.set(0.03, 1.00, 0);
        cafeCounter.add(cTop);

        // Coffee machine on countertop
        const coffeeMachine = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.50, 0.68), steelMat);
        coffeeMachine.position.set(-0.1, 1.29, -1.1);
        cafeCounter.add(coffeeMachine);
        const hopper = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.09, 0.22, 10), monitorMat);
        hopper.position.set(-0.1, 1.64, -1.1);
        cafeCounter.add(hopper);

        // Glass pastry display + pastries
        const pastryCase = new THREE.Mesh(new THREE.BoxGeometry(0.60, 0.44, 1.15), pastryCaseMat);
        pastryCase.position.set(0.05, 1.26, 0.85);
        cafeCounter.add(pastryCase);
        for (let p = -1; p <= 1; p++) {
            const bun = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), pastryMat);
            bun.position.set(0.05, 1.10, 0.85 + p * 0.30);
            cafeCounter.add(bun);
        }
        floorGroup.add(cafeCounter);

        addNode(nodes, 'cafe_door', -4.5, y, 2.8);
        addNode(nodes, 'cafe_center', -6.8, y, 5.2);
        addNode(nodes, 'cafe_order', -8.85, y, 5.2);
        sitTargets['cafe_order'] = { sit: false, facing: -Math.PI / 2 };

        linkNodes(nodes, 'cafe_door', 'hallSW');
        linkNodes(nodes, 'cafe_door', 'cafe_center');
        linkNodes(nodes, 'cafe_center', 'cafe_order');

        // 4 Bistro tables with 2 chairs each (8 bistro chairs)
        const bistroTables = [
            { tx: -7.6, tz: 2.9 },
            { tx: -5.5, tz: 3.9 },
            { tx: -7.6, tz: 7.2 },
            { tx: -5.5, tz: 7.7 }
        ];
        const cafeSpots = [];
        let bIdx = 0;
        for (let t = 0; t < bistroTables.length; t++) {
            const bt = bistroTables[t];
            const tbl = createRoundTable(0.46, 0.72, bistroTopMat);
            tbl.position.set(bt.tx, y, bt.tz);
            floorGroup.add(tbl);

            const cNorthName = 'bistro_' + (bIdx++);
            const chN = createOfficeChair(bistroChairMat);
            chN.position.set(bt.tx, y, bt.tz - 0.65);
            chN.rotation.y = 0; // faces +Z toward table
            floorGroup.add(chN);
            addNode(nodes, cNorthName, bt.tx, y, bt.tz - 0.65);
            sitTargets[cNorthName] = { sit: true, facing: 0 };
            linkNodes(nodes, 'cafe_center', cNorthName);
            cafeSpots.push(cNorthName);

            const cSouthName = 'bistro_' + (bIdx++);
            const chS = createOfficeChair(bistroChairMat);
            chS.position.set(bt.tx, y, bt.tz + 0.65);
            chS.rotation.y = Math.PI; // faces -Z toward table
            floorGroup.add(chS);
            addNode(nodes, cSouthName, bt.tx, y, bt.tz + 0.65);
            sitTargets[cSouthName] = { sit: true, facing: Math.PI };
            linkNodes(nodes, 'cafe_center', cSouthName);
            cafeSpots.push(cSouthName);
        }

        // --- Front Lounge (right side, z > 0) ---
        const fCouch = createCouch(2.4, couchMat);
        fCouch.position.set(7.6, y, 7.65);
        fCouch.rotation.y = Math.PI; // faces -Z
        floorGroup.add(fCouch);

        const fTable = createRectTable(1.4, 0.75, 0.42, woodDeskMat);
        fTable.position.set(7.6, y, 6.25);
        floorGroup.add(fTable);

        const fArmL = createArmchair(armchairMat);
        fArmL.position.set(5.7, y, 6.25);
        fArmL.rotation.y = Math.PI / 2;
        floorGroup.add(fArmL);

        const fArmR = createArmchair(armchairMat);
        fArmR.position.set(9.5, y, 6.25);
        fArmR.rotation.y = -Math.PI / 2;
        floorGroup.add(fArmR);

        addNode(nodes, 'front_lounge_center', 5.0, y, 4.4);
        linkNodes(nodes, 'front_lounge_center', 'hallSE');

        addNode(nodes, 'front_lounge_0', 7.1, y, 7.55);
        sitTargets['front_lounge_0'] = { sit: true, facing: Math.PI };
        linkNodes(nodes, 'front_lounge_center', 'front_lounge_0');

        addNode(nodes, 'front_lounge_1', 8.1, y, 7.55);
        sitTargets['front_lounge_1'] = { sit: true, facing: Math.PI };
        linkNodes(nodes, 'front_lounge_center', 'front_lounge_1');

        addNode(nodes, 'front_lounge_2', 5.7, y, 6.25);
        sitTargets['front_lounge_2'] = { sit: true, facing: Math.PI / 2 };
        linkNodes(nodes, 'front_lounge_center', 'front_lounge_2');

        addNode(nodes, 'front_lounge_3', 9.5, y, 6.25);
        sitTargets['front_lounge_3'] = { sit: true, facing: -Math.PI / 2 };
        linkNodes(nodes, 'front_lounge_center', 'front_lounge_3');

        // --- Back Lounge (Z < 0, right side): two couches facing each other ---
        const bCouchN = createCouch(2.3, couchAltMat);
        bCouchN.position.set(6.6, y, -7.25);
        bCouchN.rotation.y = 0; // faces +Z
        floorGroup.add(bCouchN);

        const bCouchS = createCouch(2.3, couchAltMat);
        bCouchS.position.set(6.6, y, -4.45);
        bCouchS.rotation.y = Math.PI; // faces -Z
        floorGroup.add(bCouchS);

        const bTable = createRectTable(1.5, 0.8, 0.42, woodDeskMat);
        bTable.position.set(6.6, y, -5.85);
        floorGroup.add(bTable);

        addNode(nodes, 'back_lounge_center', 4.3, y, -5.85);
        linkNodes(nodes, 'back_lounge_center', 'hallNE');

        addNode(nodes, 'back_lounge_N', 6.6, y, -7.15);
        sitTargets['back_lounge_N'] = { sit: true, facing: 0 };
        linkNodes(nodes, 'back_lounge_center', 'back_lounge_N');

        addNode(nodes, 'back_lounge_S', 6.6, y, -4.55);
        sitTargets['back_lounge_S'] = { sit: true, facing: Math.PI };
        linkNodes(nodes, 'back_lounge_center', 'back_lounge_S');

        // --- Conversation Pit (Z < 0, back-left): round table + 4 armchairs ---
        const pitTable = createRoundTable(0.65, 0.48, darkWoodMat);
        pitTable.position.set(-6.8, y, -5.85);
        floorGroup.add(pitTable);

        addNode(nodes, 'pit_center', -4.5, y, -4.3);
        linkNodes(nodes, 'pit_center', 'hallNW');

        const pitDefs = [
            { name: 'pit_N', x: -6.8, z: -7.10, facing: 0 },
            { name: 'pit_S', x: -6.8, z: -4.60, facing: Math.PI },
            { name: 'pit_W', x: -8.05, z: -5.85, facing: Math.PI / 2 },
            { name: 'pit_E', x: -5.55, z: -5.85, facing: -Math.PI / 2 }
        ];
        for (let i = 0; i < pitDefs.length; i++) {
            const pd = pitDefs[i];
            const ch = createArmchair(pitChairMat);
            ch.position.set(pd.x, y, pd.z);
            ch.rotation.y = pd.facing;
            floorGroup.add(ch);

            addNode(nodes, pd.name, pd.x, y, pd.z);
            sitTargets[pd.name] = { sit: true, facing: pd.facing };
            linkNodes(nodes, 'pit_center', pd.name);
        }

        // --- Two Water Coolers in Lobby ---
        const wcFront = createWaterCooler();
        wcFront.position.set(10.2, y, 3.4);
        wcFront.rotation.y = -Math.PI / 2;
        floorGroup.add(wcFront);
        addNode(nodes, 'lobby_wc_front', 9.3, y, 3.4);
        sitTargets['lobby_wc_front'] = { sit: false, facing: Math.PI / 2 };
        linkNodes(nodes, 'lobby_wc_front', 'front_lounge_center');

        const wcBack = createWaterCooler();
        wcBack.position.set(10.2, y, -2.8);
        wcBack.rotation.y = -Math.PI / 2;
        floorGroup.add(wcBack);
        addNode(nodes, 'lobby_wc_back', 9.3, y, -2.8);
        sitTargets['lobby_wc_back'] = { sit: false, facing: Math.PI / 2 };
        linkNodes(nodes, 'lobby_wc_back', 'hallNE');

        // --- Generic Lobby Loiter Waypoints ---
        const loiterDefs = [
            { name: 'lobby_stand_center', x: 0.3, z: 5.0, link: 'hallS', facing: 0 },
            { name: 'lobby_stand_NE', x: 3.8, z: -2.4, link: 'hallNE', facing: -0.6 },
            { name: 'lobby_stand_NW', x: -3.8, z: -2.4, link: 'hallNW', facing: 0.6 },
            { name: 'lobby_stand_midE', x: 4.8, z: 0.6, link: 'hallE', facing: -Math.PI / 2 },
            { name: 'lobby_stand_midW', x: -4.2, z: 0.4, link: 'hallW', facing: Math.PI / 2 },
            { name: 'lobby_stand_entry', x: 0.9, z: 7.3, link: 'entrance', facing: Math.PI }
        ];
        for (let i = 0; i < loiterDefs.length; i++) {
            const ld = loiterDefs[i];
            addNode(nodes, ld.name, ld.x, y, ld.z);
            sitTargets[ld.name] = { sit: false, facing: ld.facing };
            linkNodes(nodes, ld.name, ld.link);
        }

        buildingGroup.add(floorGroup);

        return {
            floorNumber: 0,
            nodes: nodes,
            callPanel: callPanel,
            shaftIndicator: shaftIndicator,
            desks: [],
            sitTargets: sitTargets,
            entranceSpot: nodes['entrance'].pos.clone(),
            outsideSpot: nodes['outside'].pos.clone(),
            cafeSpots: cafeSpots
        };
    }

    // -------------------------------------------------------------------------
    // Main World Factory
    // -------------------------------------------------------------------------
    function createWorld(scene) {
        const buildingGroup = new THREE.Group();
        buildingGroup.renderOrder = 0;

        const W = WORLD.BUILDING_WIDTH;     // 22
        const D = WORLD.BUILDING_DEPTH;     // 18
        const H = WORLD.FLOOR_HEIGHT;       // 3.4
        const N = WORLD.FLOOR_COUNT;        // 6
        const totalH = N * H;               // 20.4
        const sw = WORLD.SHAFT_WIDTH;       // 3
        const sd = WORLD.SHAFT_DEPTH;       // 3

        // Surrounding plaza apron + ground slab + concrete front sidewalk
        const apron = new THREE.Mesh(new THREE.BoxGeometry(W + 14, 0.16, D + 18), groundApronMat);
        apron.position.set(0, -0.18, 1.5);
        buildingGroup.add(apron);

        const groundSlab = new THREE.Mesh(new THREE.BoxGeometry(W, 0.20, D), solidSlabMat);
        groundSlab.position.set(0, -0.10, 0);
        buildingGroup.add(groundSlab);

        const sidewalk = new THREE.Mesh(new THREE.BoxGeometry(W + 2, 0.18, 6.0), sidewalkMat);
        sidewalk.position.set(0, -0.09, D / 2 + 3.0); // z in [9, 15]
        buildingGroup.add(sidewalk);

        // Solid gray roof slab
        const roofSlab = new THREE.Mesh(new THREE.BoxGeometry(W + 0.2, 0.22, D + 0.2), solidSlabMat);
        roofSlab.position.set(0, totalH + 0.11, 0);
        buildingGroup.add(roofSlab);

        // Intermediate floor slabs (floors 1..5): 4 strips around the 3x3 shaft opening
        const slabThick = 0.12;
        const backStripD = (D - sd) / 2;   // 7.5
        const sideStripW = (W - sw) / 2;   // 9.5

        for (let f = 1; f < N; f++) {
            const fy = f * H - slabThick / 2;

            // Back strip (z in [-9, -1.5])
            const sBack = new THREE.Mesh(new THREE.BoxGeometry(W, slabThick, backStripD), midSlabMat);
            sBack.position.set(0, fy, -(sd / 2 + backStripD / 2));
            buildingGroup.add(sBack);

            // Front strip (z in [1.5, 9])
            const sFront = new THREE.Mesh(new THREE.BoxGeometry(W, slabThick, backStripD), midSlabMat);
            sFront.position.set(0, fy, sd / 2 + backStripD / 2);
            buildingGroup.add(sFront);

            // Left strip (x in [-11, -1.5], z in [-1.5, 1.5])
            const sLeft = new THREE.Mesh(new THREE.BoxGeometry(sideStripW, slabThick, sd), midSlabMat);
            sLeft.position.set(-(sw / 2 + sideStripW / 2), fy, 0);
            buildingGroup.add(sLeft);

            // Right strip (x in [1.5, 11], z in [-1.5, 1.5])
            const sRight = new THREE.Mesh(new THREE.BoxGeometry(sideStripW, slabThick, sd), midSlabMat);
            sRight.position.set(sw / 2 + sideStripW / 2, fy, 0);
            buildingGroup.add(sRight);
        }

        // Central shaft corner posts + side/back glass
        const postGeo = new THREE.BoxGeometry(0.10, totalH, 0.10);
        const postCorners = [
            [-sw / 2, -sd / 2],
            [sw / 2, -sd / 2],
            [-sw / 2, sd / 2],
            [sw / 2, sd / 2]
        ];
        for (let i = 0; i < postCorners.length; i++) {
            const post = new THREE.Mesh(postGeo, shaftPostMat);
            post.position.set(postCorners[i][0], totalH / 2, postCorners[i][1]);
            buildingGroup.add(post);
        }

        const shaftBack = new THREE.Mesh(new THREE.PlaneGeometry(sw, totalH), shaftGlassMat);
        shaftBack.position.set(0, totalH / 2, -sd / 2);
        buildingGroup.add(shaftBack);

        const shaftLeft = new THREE.Mesh(new THREE.PlaneGeometry(sd, totalH), shaftGlassMat);
        shaftLeft.rotation.y = Math.PI / 2;
        shaftLeft.position.set(-sw / 2, totalH / 2, 0);
        buildingGroup.add(shaftLeft);

        const shaftRight = new THREE.Mesh(new THREE.PlaneGeometry(sd, totalH), shaftGlassMat);
        shaftRight.rotation.y = Math.PI / 2;
        shaftRight.position.set(sw / 2, totalH / 2, 0);
        buildingGroup.add(shaftRight);

        // Outer walls (semi-transparent blue #9999ff, opacity 0.2)
        const wallThick = 0.08;

        // Back outer wall (z = -9)
        const backWall = new THREE.Mesh(new THREE.BoxGeometry(W, totalH, wallThick), outerWallMat);
        backWall.position.set(0, totalH / 2, -D / 2);
        buildingGroup.add(backWall);

        // Left outer wall (x = -11)
        const leftWall = new THREE.Mesh(new THREE.BoxGeometry(wallThick, totalH, D), outerWallMat);
        leftWall.position.set(-W / 2, totalH / 2, 0);
        buildingGroup.add(leftWall);

        // Right outer wall (x = +11)
        const rightWall = new THREE.Mesh(new THREE.BoxGeometry(wallThick, totalH, D), outerWallMat);
        rightWall.position.set(W / 2, totalH / 2, 0);
        buildingGroup.add(rightWall);

        // Front outer wall (z = +9): 3 segments leaving 3-unit entrance gap on floor 0 only
        const gapW = 3.0;
        const sidePanelW = (W - gapW) / 2; // 9.5

        const frontLeft = new THREE.Mesh(new THREE.BoxGeometry(sidePanelW, totalH, wallThick), outerWallMat);
        frontLeft.position.set(-(gapW / 2 + sidePanelW / 2), totalH / 2, D / 2);
        buildingGroup.add(frontLeft);

        const frontRight = new THREE.Mesh(new THREE.BoxGeometry(sidePanelW, totalH, wallThick), outerWallMat);
        frontRight.position.set(gapW / 2 + sidePanelW / 2, totalH / 2, D / 2);
        buildingGroup.add(frontRight);

        const upperH = totalH - H; // floors 1..5
        const frontAboveGap = new THREE.Mesh(new THREE.BoxGeometry(gapW, upperH, wallThick), outerWallMat);
        frontAboveGap.position.set(0, H + upperH / 2, D / 2);
        buildingGroup.add(frontAboveGap);

        // Build per-floor interiors + navigation graphs
        const floors = [];
        floors.push(buildLobbyFloor(buildingGroup));
        for (let f = 1; f < N; f++) {
            floors.push(buildOfficeFloor(buildingGroup, f));
        }

        // Enforce renderOrder = 0 on all building meshes
        buildingGroup.traverse(function (obj) {
            if (obj.isMesh) {
                obj.renderOrder = 0;
            }
        });

        scene.add(buildingGroup);

        return {
            buildingGroup: buildingGroup,
            floors: floors,
            bfsPath: bfsPath
        };
    }

    window.bfsPath = bfsPath;
    window.createWorld = createWorld;
})();
