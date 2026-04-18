// world.js — building geometry, per-floor layouts, furniture, nav graph, call panels

(function () {
    const WORLD = {
        FLOOR_HEIGHT: 3.4, FLOOR_COUNT: 6,
        BUILDING_WIDTH: 22, BUILDING_DEPTH: 18,
        SHAFT_WIDTH: 3, SHAFT_DEPTH: 3,
        PERSON_R: 0.4
    };
    const HW = WORLD.BUILDING_WIDTH / 2;   // 11
    const HD = WORLD.BUILDING_DEPTH / 2;   // 9
    const SHW = WORLD.SHAFT_WIDTH / 2;     // 1.5
    const SHD = WORLD.SHAFT_DEPTH / 2;     // 1.5
    const FH = WORLD.FLOOR_HEIGHT;
    const TOTAL_H = FH * WORLD.FLOOR_COUNT;

    // ----------------------------------------------------------------------
    // Materials
    // ----------------------------------------------------------------------
    const MAT = {};
    function initMats() {
        MAT.groundSolid = new THREE.MeshLambertMaterial({ color: 0x666670 });
        MAT.roofSolid = new THREE.MeshLambertMaterial({ color: 0x555560 });
        MAT.slabTrans = new THREE.MeshLambertMaterial({
            color: 0x909098, transparent: true, opacity: 0.3,
            depthWrite: false, side: THREE.DoubleSide
        });
        MAT.outerWall = new THREE.MeshLambertMaterial({
            color: 0x9999ff, transparent: true, opacity: 0.2,
            depthWrite: false, side: THREE.DoubleSide
        });
        MAT.innerWall = new THREE.MeshLambertMaterial({
            color: 0xbbc5e6, transparent: true, opacity: 0.28,
            depthWrite: false, side: THREE.DoubleSide
        });
        MAT.glassDoor = new THREE.MeshLambertMaterial({
            color: 0xaad4ff, transparent: true, opacity: 0.25,
            depthWrite: false, side: THREE.DoubleSide
        });
        MAT.sidewalk = new THREE.MeshLambertMaterial({ color: 0x8a8a86 });
        MAT.deskTop = new THREE.MeshLambertMaterial({ color: 0x8b5a3c });
        MAT.deskLeg = new THREE.MeshLambertMaterial({ color: 0x3d2e24 });
        MAT.monitor = new THREE.MeshLambertMaterial({ color: 0x101014 });
        MAT.monitorScreen = new THREE.MeshBasicMaterial({ color: 0x88aaff });
        MAT.chair = new THREE.MeshLambertMaterial({ color: 0x404047 });
        MAT.chairCushion = new THREE.MeshLambertMaterial({ color: 0x505060 });
        MAT.confTable = new THREE.MeshLambertMaterial({ color: 0x4a3a2b });
        MAT.couch = new THREE.MeshLambertMaterial({ color: 0x4a6b8a });
        MAT.couch2 = new THREE.MeshLambertMaterial({ color: 0x6b4a5a });
        MAT.armchair = new THREE.MeshLambertMaterial({ color: 0x7a6050 });
        MAT.coffeeTable = new THREE.MeshLambertMaterial({ color: 0x2d2d33 });
        MAT.bistroTop = new THREE.MeshLambertMaterial({ color: 0x3d2e24 });
        MAT.bistroLeg = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
        MAT.counter = new THREE.MeshLambertMaterial({ color: 0x6b4a2f });
        MAT.counterTop = new THREE.MeshLambertMaterial({ color: 0x202024 });
        MAT.coffeeMachine = new THREE.MeshLambertMaterial({ color: 0x303036 });
        MAT.pastryDisplay = new THREE.MeshLambertMaterial({
            color: 0xeeeeff, transparent: true, opacity: 0.3,
            depthWrite: false, side: THREE.DoubleSide
        });
        MAT.pastry = new THREE.MeshLambertMaterial({ color: 0xd4a86a });
        MAT.waterCoolerBody = new THREE.MeshLambertMaterial({ color: 0xdddde4 });
        MAT.waterCoolerTank = new THREE.MeshLambertMaterial({
            color: 0x88aacc, transparent: true, opacity: 0.5,
            depthWrite: false, side: THREE.DoubleSide
        });
        MAT.plantPot = new THREE.MeshLambertMaterial({ color: 0x8a4a2a });
        MAT.plantLeaves = new THREE.MeshLambertMaterial({ color: 0x3a7a3a });
        MAT.plantStem = new THREE.MeshLambertMaterial({ color: 0x4a3a20 });
        MAT.reception = new THREE.MeshLambertMaterial({ color: 0x5a4030 });
        MAT.receptionTop = new THREE.MeshLambertMaterial({ color: 0x2a2020 });
        MAT.kioskBody = new THREE.MeshLambertMaterial({ color: 0x2a2a32 });
        MAT.kioskScreen = new THREE.MeshBasicMaterial({ color: 0x4080c0 });
        MAT.panelPlate = new THREE.MeshLambertMaterial({ color: 0x1f1f28 });
        MAT.arrowUnlit = new THREE.MeshBasicMaterial({ color: 0x2a2a2a });
        MAT.arrowUpLit = new THREE.MeshBasicMaterial({ color: 0x44ff55 });
        MAT.arrowDownLit = new THREE.MeshBasicMaterial({ color: 0x44ff55 });
    }

    // ----------------------------------------------------------------------
    // Canvas text texture helpers
    // ----------------------------------------------------------------------
    function createDigitalTexture(initial, size) {
        size = size || 256;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const tex = new THREE.CanvasTexture(canvas);
        tex.magFilter = THREE.LinearFilter;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.generateMipmaps = true;
        tex.anisotropy = 8;
        tex._canvas = canvas;
        tex._ctx = ctx;
        tex._lastText = null;
        updateDigitalTexture(tex, initial == null ? '' : String(initial));
        return tex;
    }
    function updateDigitalTexture(tex, text) {
        if (!tex || tex._lastText === text) return;
        tex._lastText = text;
        const ctx = tex._ctx;
        const c = tex._canvas;
        ctx.clearRect(0, 0, c.width, c.height);
        ctx.fillStyle = '#050505';
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.fillStyle = '#ffbb22';
        ctx.shadowColor = '#ffbb22';
        ctx.shadowBlur = c.width * 0.09;
        // Shrink font when we have to show "3^" or "Lv" instead of one glyph.
        const ratio = (text && text.length >= 2) ? 0.56 : 0.82;
        const fontSize = Math.floor(c.height * ratio);
        ctx.font = 'bold ' + fontSize + 'px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, c.width / 2, c.height / 2 + fontSize * 0.03);
        tex.needsUpdate = true;
    }

    // ----------------------------------------------------------------------
    // Geometry helpers
    // ----------------------------------------------------------------------
    function makeBox(w, h, d, mat, x, y, z, parent) {
        const g = new THREE.BoxGeometry(w, h, d);
        const m = new THREE.Mesh(g, mat);
        m.position.set(x, y, z);
        if (parent) parent.add(m);
        return m;
    }
    // Build a horizontal wall strip (x-runs, at constant z) with optional gaps.
    // gaps: array of {center, half} in x.
    function makeWallX(z, y0, y1, x0, x1, gaps, mat, parent) {
        const segments = splitSegments(x0, x1, gaps);
        const h = y1 - y0;
        const cy = (y0 + y1) / 2;
        segments.forEach(seg => {
            const w = seg[1] - seg[0];
            const cx = (seg[0] + seg[1]) / 2;
            const g = new THREE.BoxGeometry(w, h, 0.12);
            const m = new THREE.Mesh(g, mat);
            m.position.set(cx, cy, z);
            parent.add(m);
        });
    }
    function makeWallZ(x, y0, y1, z0, z1, gaps, mat, parent) {
        const segments = splitSegments(z0, z1, gaps);
        const h = y1 - y0;
        const cy = (y0 + y1) / 2;
        segments.forEach(seg => {
            const d = seg[1] - seg[0];
            const cz = (seg[0] + seg[1]) / 2;
            const g = new THREE.BoxGeometry(0.12, h, d);
            const m = new THREE.Mesh(g, mat);
            m.position.set(x, cy, cz);
            parent.add(m);
        });
    }
    // Given a 1D range [a,b] and a list of gaps, return list of sub-segments.
    function splitSegments(a, b, gaps) {
        if (!gaps || gaps.length === 0) return [[a, b]];
        const sorted = gaps.slice().sort((u, v) => u.center - v.center);
        const out = [];
        let cursor = a;
        sorted.forEach(g => {
            const g0 = g.center - g.half;
            const g1 = g.center + g.half;
            if (g1 < cursor) return;
            if (g0 > cursor) out.push([cursor, Math.min(g0, b)]);
            cursor = Math.max(cursor, g1);
        });
        if (cursor < b) out.push([cursor, b]);
        return out.filter(s => s[1] - s[0] > 0.02);
    }

    // ----------------------------------------------------------------------
    // Furniture factories
    // ----------------------------------------------------------------------
    function makeDesk(parent, x, y, z) {
        const g = new THREE.Group();
        // top
        makeBox(1.8, 0.06, 1.1, MAT.deskTop, 0, 0.75, 0, g);
        // legs
        [[-0.85, -0.5], [0.85, -0.5], [-0.85, 0.5], [0.85, 0.5]].forEach(p => {
            makeBox(0.08, 0.75, 0.08, MAT.deskLeg, p[0], 0.375, p[1], g);
        });
        // monitor (at back of desk, toward -Z)
        const stand = makeBox(0.08, 0.22, 0.08, MAT.monitor, 0, 0.89, -0.45, g);
        const m = makeBox(0.9, 0.55, 0.05, MAT.monitor, 0, 1.22, -0.45, g);
        const screen = makeBox(0.82, 0.48, 0.02, MAT.monitorScreen, 0, 1.22, -0.425, g);
        // keyboard
        makeBox(0.55, 0.02, 0.16, MAT.monitor, 0, 0.79, 0.2, g);
        g.position.set(x, y, z);
        parent.add(g);
        return g;
    }

    function makeDeskChair(parent, x, y, z, rotationY) {
        const g = new THREE.Group();
        // seat
        makeBox(0.55, 0.08, 0.55, MAT.chairCushion, 0, 0.48, 0, g);
        // back (on -Z side locally so that with rotation.y=π, back ends up at +Z in world,
        //  meaning the seat opens toward -Z — which is where the desk/monitor sits)
        makeBox(0.55, 0.55, 0.08, MAT.chair, 0, 0.8, -0.24, g);
        // post
        makeBox(0.06, 0.42, 0.06, MAT.chair, 0, 0.22, 0, g);
        // base
        const baseGeom = new THREE.CylinderGeometry(0.3, 0.3, 0.05, 12);
        const baseMesh = new THREE.Mesh(baseGeom, MAT.chair);
        baseMesh.position.y = 0.025;
        g.add(baseMesh);
        g.position.set(x, y, z);
        g.rotation.y = rotationY || 0;
        parent.add(g);
        return g;
    }

    function makeConfTable(parent, x, y, z, length) {
        length = length || 4;
        const g = new THREE.Group();
        makeBox(length, 0.08, 1.2, MAT.confTable, 0, 0.74, 0, g);
        // legs
        const lx = length / 2 - 0.3;
        [[-lx, -0.5], [lx, -0.5], [-lx, 0.5], [lx, 0.5]].forEach(p => {
            makeBox(0.08, 0.74, 0.08, MAT.deskLeg, p[0], 0.37, p[1], g);
        });
        g.position.set(x, y, z);
        parent.add(g);
        return g;
    }

    function makeConfChair(parent, x, y, z, rotationY) {
        const g = new THREE.Group();
        makeBox(0.48, 0.06, 0.48, MAT.chairCushion, 0, 0.46, 0, g);
        makeBox(0.48, 0.6, 0.06, MAT.chair, 0, 0.78, -0.21, g);
        [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]].forEach(p => {
            makeBox(0.05, 0.44, 0.05, MAT.chair, p[0], 0.22, p[1], g);
        });
        g.position.set(x, y, z);
        g.rotation.y = rotationY || 0;
        parent.add(g);
        return g;
    }

    function makeCouch(parent, x, y, z, length, rotationY, altColor) {
        length = length || 2.6;
        const g = new THREE.Group();
        const mat = altColor ? MAT.couch2 : MAT.couch;
        // seat base
        makeBox(length, 0.35, 0.9, mat, 0, 0.35, 0, g);
        // back (on -Z side locally)
        makeBox(length, 0.55, 0.18, mat, 0, 0.78, -0.45, g);
        // arms
        makeBox(0.18, 0.55, 0.9, mat, -length / 2 + 0.09, 0.5, 0, g);
        makeBox(0.18, 0.55, 0.9, mat, length / 2 - 0.09, 0.5, 0, g);
        // cushions
        const nc = Math.max(1, Math.round(length / 0.9));
        const cw = (length - 0.3) / nc;
        for (let i = 0; i < nc; i++) {
            const cx = -length / 2 + 0.15 + cw * (i + 0.5);
            makeBox(cw * 0.95, 0.16, 0.7, MAT.chairCushion, cx, 0.58, 0.08, g);
        }
        g.position.set(x, y, z);
        g.rotation.y = rotationY || 0;
        parent.add(g);
        return g;
    }

    function makeArmchair(parent, x, y, z, rotationY) {
        const g = new THREE.Group();
        makeBox(0.9, 0.35, 0.9, MAT.armchair, 0, 0.35, 0, g);
        makeBox(0.9, 0.55, 0.18, MAT.armchair, 0, 0.78, -0.45, g);
        makeBox(0.18, 0.55, 0.9, MAT.armchair, -0.36, 0.5, 0, g);
        makeBox(0.18, 0.55, 0.9, MAT.armchair, 0.36, 0.5, 0, g);
        makeBox(0.55, 0.16, 0.7, MAT.chairCushion, 0, 0.58, 0.08, g);
        g.position.set(x, y, z);
        g.rotation.y = rotationY || 0;
        parent.add(g);
        return g;
    }

    function makeCoffeeTable(parent, x, y, z, w, d) {
        w = w || 1.2; d = d || 0.7;
        const g = new THREE.Group();
        makeBox(w, 0.05, d, MAT.coffeeTable, 0, 0.42, 0, g);
        [[-w / 2 + 0.08, -d / 2 + 0.08], [w / 2 - 0.08, -d / 2 + 0.08],
         [-w / 2 + 0.08, d / 2 - 0.08], [w / 2 - 0.08, d / 2 - 0.08]].forEach(p => {
            makeBox(0.05, 0.42, 0.05, MAT.coffeeTable, p[0], 0.21, p[1], g);
        });
        g.position.set(x, y, z);
        parent.add(g);
        return g;
    }

    function makeRoundTable(parent, x, y, z, r) {
        r = r || 0.6;
        const g = new THREE.Group();
        const topG = new THREE.CylinderGeometry(r, r, 0.05, 16);
        const top = new THREE.Mesh(topG, MAT.confTable);
        top.position.y = 0.72;
        g.add(top);
        const postG = new THREE.CylinderGeometry(0.06, 0.06, 0.72, 8);
        const post = new THREE.Mesh(postG, MAT.deskLeg);
        post.position.y = 0.36;
        g.add(post);
        const baseG = new THREE.CylinderGeometry(r * 0.5, r * 0.5, 0.04, 16);
        const base = new THREE.Mesh(baseG, MAT.deskLeg);
        base.position.y = 0.02;
        g.add(base);
        g.position.set(x, y, z);
        parent.add(g);
        return g;
    }

    function makeBistroTable(parent, x, y, z) {
        const g = new THREE.Group();
        const topG = new THREE.CylinderGeometry(0.45, 0.45, 0.04, 16);
        const top = new THREE.Mesh(topG, MAT.bistroTop);
        top.position.y = 0.72;
        g.add(top);
        const postG = new THREE.CylinderGeometry(0.04, 0.04, 0.72, 8);
        const post = new THREE.Mesh(postG, MAT.bistroLeg);
        post.position.y = 0.36;
        g.add(post);
        const baseG = new THREE.CylinderGeometry(0.3, 0.3, 0.03, 16);
        const base = new THREE.Mesh(baseG, MAT.bistroLeg);
        base.position.y = 0.015;
        g.add(base);
        g.position.set(x, y, z);
        parent.add(g);
        return g;
    }

    function makeBistroChair(parent, x, y, z, rotationY) {
        const g = new THREE.Group();
        makeBox(0.4, 0.06, 0.4, MAT.chairCushion, 0, 0.44, 0, g);
        makeBox(0.4, 0.5, 0.05, MAT.bistroLeg, 0, 0.72, -0.18, g);
        [[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17]].forEach(p => {
            makeBox(0.04, 0.44, 0.04, MAT.bistroLeg, p[0], 0.22, p[1], g);
        });
        g.position.set(x, y, z);
        g.rotation.y = rotationY || 0;
        parent.add(g);
        return g;
    }

    function makeWaterCooler(parent, x, y, z) {
        const g = new THREE.Group();
        makeBox(0.4, 1.0, 0.4, MAT.waterCoolerBody, 0, 0.5, 0, g);
        const tankGeom = new THREE.CylinderGeometry(0.2, 0.2, 0.45, 16);
        const tank = new THREE.Mesh(tankGeom, MAT.waterCoolerTank);
        tank.position.y = 1.23;
        g.add(tank);
        makeBox(0.1, 0.1, 0.05, MAT.coffeeMachine, 0, 0.55, 0.22, g);
        g.position.set(x, y, z);
        parent.add(g);
        return g;
    }

    function makePlant(parent, x, y, z) {
        const g = new THREE.Group();
        const potGeom = new THREE.CylinderGeometry(0.3, 0.22, 0.4, 12);
        const pot = new THREE.Mesh(potGeom, MAT.plantPot);
        pot.position.y = 0.2;
        g.add(pot);
        const stemGeom = new THREE.CylinderGeometry(0.04, 0.04, 0.7, 8);
        const stem = new THREE.Mesh(stemGeom, MAT.plantStem);
        stem.position.y = 0.75;
        g.add(stem);
        const leavesGeom = new THREE.SphereGeometry(0.45, 10, 8);
        const leaves = new THREE.Mesh(leavesGeom, MAT.plantLeaves);
        leaves.position.y = 1.25;
        g.add(leaves);
        const leaves2Geom = new THREE.SphereGeometry(0.3, 10, 8);
        const leaves2 = new THREE.Mesh(leaves2Geom, MAT.plantLeaves);
        leaves2.position.set(0.2, 1.05, 0.1);
        g.add(leaves2);
        g.position.set(x, y, z);
        parent.add(g);
        return g;
    }

    function makeReceptionDesk(parent, x, y, z, rotationY) {
        const g = new THREE.Group();
        // base
        makeBox(2.4, 0.9, 0.9, MAT.reception, 0, 0.45, 0, g);
        // top
        makeBox(2.4, 0.05, 0.9, MAT.receptionTop, 0, 0.925, 0, g);
        // raised counter in front
        makeBox(2.4, 0.15, 0.25, MAT.receptionTop, 0, 1.03, 0.35, g);
        // computer
        makeBox(0.45, 0.3, 0.04, MAT.monitor, -0.5, 1.15, 0, g);
        makeBox(0.4, 0.26, 0.02, MAT.monitorScreen, -0.5, 1.15, 0.025, g);
        g.position.set(x, y, z);
        g.rotation.y = rotationY || 0;
        parent.add(g);
        return g;
    }

    function makeInfoKiosk(parent, x, y, z, rotationY) {
        const g = new THREE.Group();
        makeBox(0.9, 1.4, 0.35, MAT.kioskBody, 0, 0.7, 0, g);
        makeBox(0.7, 0.5, 0.02, MAT.kioskScreen, 0, 1.05, 0.185, g);
        makeBox(0.2, 0.05, 0.05, MAT.coffeeMachine, 0, 1.45, 0, g);
        g.position.set(x, y, z);
        g.rotation.y = rotationY || 0;
        parent.add(g);
        return g;
    }

    function makeCafeCounter(parent) {
        const g = new THREE.Group();
        // long counter body along left wall at x=-9.7 (just away from wall at x=-11)
        const counterW = 0.9;  // depth toward the interior
        const counterLen = 7;  // z extent
        const counterZ = 5;    // centered at z=5
        const counterX = -10.2;
        // body
        makeBox(counterW, 1.0, counterLen, MAT.counter, counterX, 0.5, counterZ, g);
        // top
        makeBox(counterW + 0.1, 0.05, counterLen + 0.1, MAT.counterTop,
            counterX, 1.025, counterZ, g);
        // coffee machine
        const cmGeom = new THREE.BoxGeometry(0.4, 0.45, 0.3);
        const cm = new THREE.Mesh(cmGeom, MAT.coffeeMachine);
        cm.position.set(counterX + 0.1, 1.275, counterZ - 2);
        g.add(cm);
        // coffee spouts (small boxes)
        makeBox(0.05, 0.15, 0.05, MAT.bistroLeg, counterX + 0.1, 1.05, counterZ - 2.1, g);
        // pastry display (transparent box on counter)
        makeBox(0.7, 0.5, 0.5, MAT.pastryDisplay, counterX + 0.05, 1.3, counterZ + 1.5, g);
        // pastries
        for (let i = 0; i < 3; i++) {
            const pGeom = new THREE.SphereGeometry(0.08, 8, 6);
            const p = new THREE.Mesh(pGeom, MAT.pastry);
            p.position.set(counterX + 0.05 + (i - 1) * 0.18, 1.16, counterZ + 1.5);
            g.add(p);
        }
        // cash register
        makeBox(0.25, 0.18, 0.2, MAT.kioskBody, counterX + 0.1, 1.14, counterZ + 3, g);
        parent.add(g);
        return g;
    }

    // ----------------------------------------------------------------------
    // Call panel and shaft indicator
    // ----------------------------------------------------------------------
    function makeCallPanel(parent, x, y, z) {
        const group = new THREE.Group();
        // plate
        const plateGeom = new THREE.BoxGeometry(0.55, 1.4, 0.05);
        const plate = new THREE.Mesh(plateGeom, MAT.panelPlate);
        group.add(plate);

        // Up arrow (triangle pointing up)
        const upShape = new THREE.Shape();
        upShape.moveTo(0, 0.13);
        upShape.lineTo(-0.13, -0.065);
        upShape.lineTo(0.13, -0.065);
        upShape.lineTo(0, 0.13);
        const upGeom = new THREE.ShapeGeometry(upShape);
        const upArrow = new THREE.Mesh(upGeom, MAT.arrowUnlit);
        upArrow.position.set(0, 0.45, 0.03);
        group.add(upArrow);

        // Down arrow
        const dnShape = new THREE.Shape();
        dnShape.moveTo(0, -0.13);
        dnShape.lineTo(-0.13, 0.065);
        dnShape.lineTo(0.13, 0.065);
        dnShape.lineTo(0, -0.13);
        const dnGeom = new THREE.ShapeGeometry(dnShape);
        const dnArrow = new THREE.Mesh(dnGeom, MAT.arrowUnlit);
        dnArrow.position.set(0, 0.15, 0.03);
        group.add(dnArrow);

        // Indicator digits
        const tex = createDigitalTexture('1', 256);
        const indGeom = new THREE.PlaneGeometry(0.45, 0.45);
        const indMat = new THREE.MeshBasicMaterial({
            map: tex, transparent: false, side: THREE.DoubleSide
        });
        const ind = new THREE.Mesh(indGeom, indMat);
        ind.position.set(0, -0.3, 0.03);
        group.add(ind);

        group.position.set(x, y, z);
        group.userData.upArrow = upArrow;
        group.userData.dnArrow = dnArrow;
        group.userData.indTex = tex;
        group.userData.upState = false;
        group.userData.dnState = false;
        group.userData.setUp = function (on) {
            if (group.userData.upState === on) return;
            group.userData.upState = on;
            upArrow.material = on ? MAT.arrowUpLit : MAT.arrowUnlit;
        };
        group.userData.setDown = function (on) {
            if (group.userData.dnState === on) return;
            group.userData.dnState = on;
            dnArrow.material = on ? MAT.arrowDownLit : MAT.arrowUnlit;
        };
        group.userData.setIndicator = function (text) {
            updateDigitalTexture(tex, String(text));
        };

        parent.add(group);
        return group;
    }

    function makeShaftIndicator(parent, x, y, z) {
        const tex = createDigitalTexture('1', 256);
        const g = new THREE.PlaneGeometry(0.9, 0.9);
        const m = new THREE.MeshBasicMaterial({
            map: tex, transparent: false, side: THREE.DoubleSide
        });
        const mesh = new THREE.Mesh(g, m);
        mesh.position.set(x, y, z);
        mesh.userData.tex = tex;
        mesh.userData.setText = function (t) { updateDigitalTexture(tex, String(t)); };
        parent.add(mesh);
        return mesh;
    }

    // ----------------------------------------------------------------------
    // Navigation graph BFS
    // ----------------------------------------------------------------------
    function bfsPath(nodes, fromName, toName) {
        if (fromName === toName) return [nodes[toName].pos.clone()];
        if (!nodes[fromName] || !nodes[toName]) return null;
        const prev = {};
        const visited = {};
        visited[fromName] = true;
        const q = [fromName];
        while (q.length) {
            const cur = q.shift();
            if (cur === toName) break;
            const neighbors = nodes[cur].links || [];
            for (let i = 0; i < neighbors.length; i++) {
                const n = neighbors[i];
                if (!visited[n]) {
                    visited[n] = true;
                    prev[n] = cur;
                    q.push(n);
                }
            }
        }
        if (!visited[toName]) return null;
        const path = [];
        let cur = toName;
        while (cur !== undefined) {
            path.unshift(nodes[cur].pos.clone());
            cur = prev[cur];
        }
        return path;
    }

    // Node table helper
    function makeNode(pos) {
        return { pos: pos.clone ? pos.clone() : new THREE.Vector3(pos[0], pos[1], pos[2]), links: [] };
    }
    function link(nodes, a, b) {
        if (!nodes[a] || !nodes[b]) return;
        if (nodes[a].links.indexOf(b) < 0) nodes[a].links.push(b);
        if (nodes[b].links.indexOf(a) < 0) nodes[b].links.push(a);
    }

    // ----------------------------------------------------------------------
    // Build an office floor (floorNumber 1..FLOOR_COUNT-1)
    // ----------------------------------------------------------------------
    function buildOfficeFloor(parent, floorNumber) {
        const y = floorNumber * FH;
        const group = new THREE.Group();
        group.position.y = 0;
        parent.add(group);

        // Interior walls
        // Office front wall at z=-3 (with 4 door gaps)
        makeWallX(-3, y + 0.0, y + FH - 0.1, -HW + 0.2, HW - 0.2, [
            { center: -8.5, half: 0.6 },
            { center: -3.5, half: 0.6 },
            { center: 3.5, half: 0.6 },
            { center: 8.5, half: 0.6 }
        ], MAT.innerWall, group);
        // Interior walls between offices: x=-6, x=-1, x=+1, x=+6, z from -9 to -3
        [-6, -1, 1, 6].forEach(wx => {
            makeWallZ(wx, y + 0.0, y + FH - 0.1, -HD + 0.1, -3, [], MAT.innerWall, group);
        });
        // Conference north wall at z=+3 (from x=-HW to x=-3, door gap at x=-5)
        makeWallX(3, y + 0.0, y + FH - 0.1, -HW + 0.2, -3, [
            { center: -5, half: 0.6 }
        ], MAT.innerWall, group);
        // Conference east wall at x=-3, from z=+3 to z=+HD
        makeWallZ(-3, y + 0.0, y + FH - 0.1, 3, HD - 0.2, [], MAT.innerWall, group);
        // Lounge north wall at z=+3 (from x=+3 to x=+HW, door gap at x=+5)
        makeWallX(3, y + 0.0, y + FH - 0.1, 3, HW - 0.2, [
            { center: 5, half: 0.6 }
        ], MAT.innerWall, group);
        // Lounge west wall at x=+3, from z=+3 to z=+HD
        makeWallZ(3, y + 0.0, y + FH - 0.1, 3, HD - 0.2, [], MAT.innerWall, group);

        // Offices - furniture
        const deskPositions = [
            { id: 'officeA', x: -8.5, door: 'officeA_door', desk: 'officeA_desk' },
            { id: 'officeB', x: -3.5, door: 'officeB_door', desk: 'officeB_desk' },
            { id: 'officeC', x:  3.5, door: 'officeC_door', desk: 'officeC_desk' },
            { id: 'officeD', x:  8.5, door: 'officeD_door', desk: 'officeD_desk' }
        ];
        const desks = [];
        deskPositions.forEach(o => {
            const desk = makeDesk(group, o.x, y, -7.75);
            // chair - rotation.y = PI so chair's back (built at -Z locally) faces +Z; seat opens toward -Z (desk)
            makeDeskChair(group, o.x, y, -6.25, Math.PI);
            desks.push({ id: o.id, deskWpName: o.desk, doorWpName: o.door, x: o.x });
        });

        // Conference
        makeConfTable(group, -7, y, 6, 4);
        // 4 chairs: seats 0,1 on -Z side (facing +Z / 0), seats 2,3 on +Z side (facing -Z / π)
        makeConfChair(group, -8.2, y, 5.2, 0);
        makeConfChair(group, -5.8, y, 5.2, 0);
        makeConfChair(group, -8.2, y, 6.8, Math.PI);
        makeConfChair(group, -5.8, y, 6.8, Math.PI);

        // Lounge
        // Couch against east wall, runs along z, back at x=HW, faces -X
        makeCouch(group, 10, y, 6, 2.4, -Math.PI / 2);
        // Two armchairs facing the couch from -X side
        makeArmchair(group, 4.8, y, 5, Math.PI / 2);
        makeArmchair(group, 4.8, y, 7, Math.PI / 2);
        // Coffee table in middle
        makeCoffeeTable(group, 7, y, 6, 1.2, 0.7);
        // Water cooler
        makeWaterCooler(group, 10.3, y, 3.6);
        makePlant(group, 3.5, y, 3.5);

        // Call panel next to doors (facing +Z), mounted on a slim post just east of shaft
        const callPanel = makeCallPanel(group, 2.1, y + 1.4, 1.55);
        callPanel.userData.floorNumber = floorNumber;
        callPanel.userData.setIndicator(String(floorNumber));

        // Shaft indicator above doors
        const shaftInd = makeShaftIndicator(group, 0, y + 2.9, 1.56);
        shaftInd.userData.setText(String(floorNumber));

        // --- Navigation graph ---
        const nodes = {};
        function N(name, x, z) { nodes[name] = makeNode(new THREE.Vector3(x, y, z)); }

        // Hallway ring
        N('elevWait', 0, 2.0);
        N('hallS', 0, 2.8);
        N('hallSE', 3.0, 2.8);
        N('hallSW', -3.0, 2.8);
        N('hallE', 3.0, 0);
        N('hallW', -3.0, 0);
        N('hallN', 0, -2.8);
        N('hallNE', 3.0, -2.8);
        N('hallNW', -3.0, -2.8);
        // Loiter spots
        N('hall_stand_N', 1.7, -2.0);
        N('hall_stand_S', -1.8, 2.3);
        N('water_cooler', 9.8, 4.0);

        // Office doors and desks
        N('officeA_door', -8.5, -2.5);
        N('officeB_door', -3.5, -2.5);
        N('officeC_door',  3.5, -2.5);
        N('officeD_door',  8.5, -2.5);
        N('officeA_desk', -8.5, -6.25);
        N('officeB_desk', -3.5, -6.25);
        N('officeC_desk',  3.5, -6.25);
        N('officeD_desk',  8.5, -6.25);

        // Conference waypoints
        N('conf_door', -5, 3.4);
        N('conf_center', -7, 6);
        N('conf_seat0', -8.2, 5.2);
        N('conf_seat1', -5.8, 5.2);
        N('conf_seat2', -8.2, 6.8);
        N('conf_seat3', -5.8, 6.8);

        // Lounge waypoints
        N('lounge_door', 5, 3.4);
        N('lounge_center', 7, 6);
        N('lounge_spot0', 9.3, 5.2);   // couch end
        N('lounge_spot1', 9.3, 6.8);   // couch end
        N('lounge_spot2', 5.5, 5);     // armchair
        N('lounge_spot3', 5.5, 7);     // armchair

        // Edges
        link(nodes, 'elevWait', 'hallS');
        link(nodes, 'hallS', 'hallSE');
        link(nodes, 'hallS', 'hallSW');
        link(nodes, 'hallSE', 'hallE');
        link(nodes, 'hallSW', 'hallW');
        link(nodes, 'hallE', 'hallNE');
        link(nodes, 'hallW', 'hallNW');
        link(nodes, 'hallNE', 'hallN');
        link(nodes, 'hallNW', 'hallN');
        link(nodes, 'hall_stand_N', 'hallN');
        link(nodes, 'hall_stand_S', 'hallS');
        link(nodes, 'water_cooler', 'lounge_center');

        // Offices: A,B -> hallNW ; C,D -> hallNE
        link(nodes, 'officeA_door', 'hallNW');
        link(nodes, 'officeB_door', 'hallNW');
        link(nodes, 'officeC_door', 'hallNE');
        link(nodes, 'officeD_door', 'hallNE');
        // Also link neighboring offices for closer routing
        link(nodes, 'officeA_door', 'officeB_door');
        link(nodes, 'officeC_door', 'officeD_door');
        link(nodes, 'officeA_door', 'officeA_desk');
        link(nodes, 'officeB_door', 'officeB_desk');
        link(nodes, 'officeC_door', 'officeC_desk');
        link(nodes, 'officeD_door', 'officeD_desk');

        // Conference
        link(nodes, 'hallSW', 'conf_door');
        link(nodes, 'conf_door', 'conf_center');
        link(nodes, 'conf_center', 'conf_seat0');
        link(nodes, 'conf_center', 'conf_seat1');
        link(nodes, 'conf_center', 'conf_seat2');
        link(nodes, 'conf_center', 'conf_seat3');

        // Lounge
        link(nodes, 'hallSE', 'lounge_door');
        link(nodes, 'lounge_door', 'lounge_center');
        link(nodes, 'lounge_center', 'lounge_spot0');
        link(nodes, 'lounge_center', 'lounge_spot1');
        link(nodes, 'lounge_center', 'lounge_spot2');
        link(nodes, 'lounge_center', 'lounge_spot3');

        // Sit targets — {sit, facing} per waypoint
        const sitTargets = {
            officeA_desk: { sit: true, facing: Math.PI },
            officeB_desk: { sit: true, facing: Math.PI },
            officeC_desk: { sit: true, facing: Math.PI },
            officeD_desk: { sit: true, facing: Math.PI },
            conf_seat0:   { sit: true, facing: 0 },
            conf_seat1:   { sit: true, facing: 0 },
            conf_seat2:   { sit: true, facing: Math.PI },
            conf_seat3:   { sit: true, facing: Math.PI },
            lounge_spot0: { sit: true, facing: -Math.PI / 2 },
            lounge_spot1: { sit: true, facing: -Math.PI / 2 },
            lounge_spot2: { sit: true, facing: Math.PI / 2 },
            lounge_spot3: { sit: true, facing: Math.PI / 2 },
            water_cooler: { sit: false, facing: -Math.PI / 2 },
            hall_stand_N: { sit: false, facing: Math.PI },
            hall_stand_S: { sit: false, facing: 0 }
        };

        return {
            floorNumber, nodes, callPanel, shaftIndicator: shaftInd,
            desks, sitTargets
        };
    }

    // ----------------------------------------------------------------------
    // Build the lobby (floor 0)
    // ----------------------------------------------------------------------
    function buildLobby(parent) {
        const y = 0;
        const group = new THREE.Group();
        parent.add(group);

        // Sidewalk outside entrance
        const sidewalkGeom = new THREE.BoxGeometry(16, 0.12, 7);
        const sidewalk = new THREE.Mesh(sidewalkGeom, MAT.sidewalk);
        sidewalk.position.set(0, -0.06, HD + 3.5);
        group.add(sidewalk);

        // Entrance glass doors: two panels at z=HD, x=[-1.5,0] and [0,1.5]
        makeBox(1.4, FH - 0.2, 0.05, MAT.glassDoor, -0.75, y + (FH - 0.2) / 2, HD - 0.03, group);
        makeBox(1.4, FH - 0.2, 0.05, MAT.glassDoor,  0.75, y + (FH - 0.2) / 2, HD - 0.03, group);

        // Cafe counter (left side)
        makeCafeCounter(group);

        // Bistro tables + chairs (4 tables, 2 chairs each)
        const bistro = [
            { tx: -7.2, tz: 8.0 },
            { tx: -5.0, tz: 8.0 },
            { tx: -7.2, tz: 4.2 },
            { tx: -5.0, tz: 4.2 }
        ];
        const cafeSpots = [];
        bistro.forEach((b, i) => {
            makeBistroTable(group, b.tx, y, b.tz);
            // chair on -Z side faces +Z (rot=0); chair on +Z side faces -Z (rot=π)
            makeBistroChair(group, b.tx, y, b.tz - 0.85, 0);
            makeBistroChair(group, b.tx, y, b.tz + 0.85, Math.PI);
            cafeSpots.push({ wpName: 'cafeT' + i + '_N', sit: true, facing: Math.PI });
            cafeSpots.push({ wpName: 'cafeT' + i + '_S', sit: true, facing: 0 });
        });

        // Front lounge (right side)
        // Couch against east wall, runs along z, back at x=HW, faces -X
        makeCouch(group, 10, y, 6, 2.6, -Math.PI / 2);
        makeArmchair(group, 5.0, y, 5, Math.PI / 2);
        makeArmchair(group, 5.0, y, 7, Math.PI / 2);
        makeCoffeeTable(group, 7, y, 6, 1.2, 0.7);

        // Back lounge: two couches facing each other around a coffee table
        // Couch N (more -Z), back at -Z, faces +Z (rot=0)
        makeCouch(group, 5, y, -6.5, 2.4, 0, true);
        // Couch S (closer to 0), back at +Z, faces -Z (rot=π)
        makeCouch(group, 5, y, -3.5, 2.4, Math.PI, true);
        makeCoffeeTable(group, 5, y, -5, 1.4, 0.8);

        // Conversation pit (back-left): round table + 4 armchairs, each facing the table
        makeRoundTable(group, -7, y, -5, 0.7);
        makeArmchair(group, -7, y, -6.2, 0);             // N: faces +Z
        makeArmchair(group, -7, y, -3.8, Math.PI);       // S: faces -Z
        makeArmchair(group, -5.8, y, -5, -Math.PI / 2);  // E: faces -X (toward table)
        makeArmchair(group, -8.2, y, -5,  Math.PI / 2);  // W: faces +X (toward table)

        // Water coolers (front and back)
        makeWaterCooler(group, 2.6, y, 4.5);
        makeWaterCooler(group, 2.6, y, -6.5);

        // Reception desk (in front-right area)
        makeReceptionDesk(group, 3.5, y, 6.5, Math.PI); // desk faces -Z (toward entrance area)

        // Info kiosk near entrance
        makeInfoKiosk(group, 3.8, y, 8.3, Math.PI);

        // Potted plants near entrance
        makePlant(group, -1.8, y, 8.3);
        makePlant(group, 1.8, y, 8.3);

        // Call panel + shaft indicator
        const callPanel = makeCallPanel(group, 2.1, y + 1.4, 1.55);
        callPanel.userData.floorNumber = 0;
        callPanel.userData.setIndicator('L');
        const shaftInd = makeShaftIndicator(group, 0, y + 2.9, 1.56);
        shaftInd.userData.setText('L');

        // --- Navigation graph ---
        const nodes = {};
        function N(name, x, z) { nodes[name] = makeNode(new THREE.Vector3(x, y, z)); }

        // Hallway ring (same pattern as office floors)
        N('elevWait', 0, 2.0);
        N('hallS', 0, 2.8);
        N('hallSE', 3.0, 2.8);
        N('hallSW', -3.0, 2.8);
        N('hallE', 3.0, 0);
        N('hallW', -3.0, 0);
        N('hallN', 0, -2.8);
        N('hallNE', 3.0, -2.8);
        N('hallNW', -3.0, -2.8);

        // Entrance
        N('outside', 0, HD + 3);
        N('entrance', 0, HD - 0.5);

        // Cafe
        N('cafe_door', -3.5, 2.8);
        N('cafe_order', -9, 5);
        N('cafeT0_N', -7.2, 7.15);
        N('cafeT0_S', -7.2, 8.85);
        N('cafeT1_N', -5.0, 7.15);
        N('cafeT1_S', -5.0, 8.85);
        N('cafeT2_N', -7.2, 3.35);
        N('cafeT2_S', -7.2, 5.05);
        N('cafeT3_N', -5.0, 3.35);
        N('cafeT3_S', -5.0, 5.05);

        // Front lounge
        N('front_lounge_couch_N', 9.3, 5.2);
        N('front_lounge_couch_S', 9.3, 6.8);
        N('front_lounge_arm_N', 5.6, 5);
        N('front_lounge_arm_S', 5.6, 7);
        N('front_lounge_center', 7, 6);

        // Back lounge
        N('back_lounge_N', 5, -6.2);  // sits on N couch (back at -Z), faces +Z
        N('back_lounge_S', 5, -3.8);  // sits on S couch (back at +Z), faces -Z
        N('back_lounge_center', 5, -5);

        // Conversation pit
        N('pit_center', -7, -5);
        N('pit_N', -7, -5.9);
        N('pit_S', -7, -4.1);
        N('pit_E', -6.1, -5);
        N('pit_W', -7.9, -5);

        // Water coolers
        N('lobby_wc_front', 2.2, 4.5);
        N('lobby_wc_back', 2.2, -6.5);

        // Reception, kiosk
        N('reception', 3.5, 5.5);
        N('kiosk', 3.8, 7.5);

        // Loiter waypoints
        N('lobby_stand_center', 4, 0);
        N('lobby_stand_NE', 7, -4);
        N('lobby_stand_NW', -4, -2.5);
        N('lobby_stand_midE', 7, 3);
        N('lobby_stand_midW', -4, 3.2);
        N('lobby_stand_entry', 1.8, 7.8);

        // Edges
        link(nodes, 'outside', 'entrance');
        link(nodes, 'entrance', 'elevWait');       // direct short-cut (spec)
        link(nodes, 'entrance', 'lobby_stand_entry');
        link(nodes, 'elevWait', 'hallS');
        link(nodes, 'hallS', 'hallSE');
        link(nodes, 'hallS', 'hallSW');
        link(nodes, 'hallSE', 'hallE');
        link(nodes, 'hallSW', 'hallW');
        link(nodes, 'hallE', 'hallNE');
        link(nodes, 'hallW', 'hallNW');
        link(nodes, 'hallNE', 'hallN');
        link(nodes, 'hallNW', 'hallN');

        // Cafe
        link(nodes, 'hallSW', 'cafe_door');
        link(nodes, 'cafe_door', 'cafe_order');
        link(nodes, 'cafe_door', 'cafeT2_N');
        link(nodes, 'cafeT2_N', 'cafeT2_S');
        link(nodes, 'cafeT2_N', 'cafeT3_N');
        link(nodes, 'cafeT2_S', 'cafeT3_S');
        link(nodes, 'cafeT3_N', 'cafeT3_S');
        link(nodes, 'cafeT2_S', 'cafeT0_N');
        link(nodes, 'cafeT3_S', 'cafeT1_N');
        link(nodes, 'cafeT0_N', 'cafeT0_S');
        link(nodes, 'cafeT1_N', 'cafeT1_S');
        link(nodes, 'cafeT0_N', 'cafeT1_N');
        link(nodes, 'cafeT0_S', 'cafeT1_S');
        link(nodes, 'cafe_order', 'cafeT2_N');

        // Front lounge
        link(nodes, 'hallSE', 'front_lounge_center');
        link(nodes, 'front_lounge_center', 'front_lounge_couch_N');
        link(nodes, 'front_lounge_center', 'front_lounge_couch_S');
        link(nodes, 'front_lounge_center', 'front_lounge_arm_N');
        link(nodes, 'front_lounge_center', 'front_lounge_arm_S');
        link(nodes, 'front_lounge_center', 'reception');
        link(nodes, 'front_lounge_center', 'kiosk');
        link(nodes, 'hallSE', 'lobby_stand_midE');
        link(nodes, 'lobby_stand_midE', 'front_lounge_center');
        link(nodes, 'lobby_stand_midW', 'hallSW');
        link(nodes, 'lobby_stand_midW', 'cafe_door');

        // Back lounge + pit
        link(nodes, 'hallN', 'back_lounge_center');
        link(nodes, 'back_lounge_center', 'back_lounge_N');
        link(nodes, 'back_lounge_center', 'back_lounge_S');
        link(nodes, 'hallNE', 'lobby_stand_NE');
        link(nodes, 'lobby_stand_NE', 'back_lounge_center');
        link(nodes, 'hallNW', 'lobby_stand_NW');
        link(nodes, 'lobby_stand_NW', 'pit_center');
        link(nodes, 'pit_center', 'pit_N');
        link(nodes, 'pit_center', 'pit_S');
        link(nodes, 'pit_center', 'pit_E');
        link(nodes, 'pit_center', 'pit_W');

        // Water coolers
        link(nodes, 'hallS', 'lobby_wc_front');
        link(nodes, 'hallN', 'lobby_wc_back');

        // Reception, kiosk, loiters
        link(nodes, 'hallS', 'lobby_stand_entry');
        link(nodes, 'lobby_stand_center', 'hallE');
        link(nodes, 'lobby_stand_center', 'hallS');
        link(nodes, 'lobby_stand_center', 'lobby_stand_midE');
        link(nodes, 'kiosk', 'lobby_stand_entry');

        // Sit targets
        const sitTargets = {
            // cafe bistro chairs
            cafeT0_N: { sit: true, facing: 0 },
            cafeT0_S: { sit: true, facing: Math.PI },
            cafeT1_N: { sit: true, facing: 0 },
            cafeT1_S: { sit: true, facing: Math.PI },
            cafeT2_N: { sit: true, facing: 0 },
            cafeT2_S: { sit: true, facing: Math.PI },
            cafeT3_N: { sit: true, facing: 0 },
            cafeT3_S: { sit: true, facing: Math.PI },
            // front lounge
            front_lounge_couch_N: { sit: true, facing: -Math.PI / 2 },
            front_lounge_couch_S: { sit: true, facing: -Math.PI / 2 },
            front_lounge_arm_N: { sit: true, facing: Math.PI / 2 },
            front_lounge_arm_S: { sit: true, facing: Math.PI / 2 },
            // back lounge
            back_lounge_N: { sit: true, facing: 0 },      // N couch faces +Z
            back_lounge_S: { sit: true, facing: Math.PI }, // S couch faces -Z
            // pit
            pit_N: { sit: true, facing: 0 },
            pit_S: { sit: true, facing: Math.PI },
            pit_E: { sit: true, facing: -Math.PI / 2 },
            pit_W: { sit: true, facing: Math.PI / 2 },
            // standing waypoints
            cafe_order: { sit: false, facing: Math.PI / 2 },  // faces -X toward counter... wait counter is at -X
            lobby_wc_front: { sit: false, facing: -Math.PI / 2 },
            lobby_wc_back: { sit: false, facing: -Math.PI / 2 },
            reception: { sit: false, facing: 0 },
            kiosk: { sit: false, facing: Math.PI },
            lobby_stand_center: { sit: false, facing: 0 },
            lobby_stand_NE: { sit: false, facing: Math.PI },
            lobby_stand_NW: { sit: false, facing: 0 },
            lobby_stand_midE: { sit: false, facing: 0 },
            lobby_stand_midW: { sit: false, facing: 0 },
            lobby_stand_entry: { sit: false, facing: Math.PI }
        };

        return {
            floorNumber: 0,
            nodes, callPanel, shaftIndicator: shaftInd,
            desks: [], sitTargets,
            cafeSpots: ['cafeT0_N','cafeT0_S','cafeT1_N','cafeT1_S',
                        'cafeT2_N','cafeT2_S','cafeT3_N','cafeT3_S'],
            frontLoungeSpots: ['front_lounge_couch_N','front_lounge_couch_S',
                               'front_lounge_arm_N','front_lounge_arm_S'],
            backLoungeSpots: ['back_lounge_N','back_lounge_S'],
            pitSpots: ['pit_N','pit_S','pit_E','pit_W'],
            loiterSpots: ['lobby_stand_center','lobby_stand_NE','lobby_stand_NW',
                          'lobby_stand_midE','lobby_stand_midW','lobby_stand_entry',
                          'reception','kiosk','lobby_wc_front','lobby_wc_back']
        };
    }

    // ----------------------------------------------------------------------
    // Build building shell (ground slab, roof, outer walls, per-floor slabs)
    // ----------------------------------------------------------------------
    function buildShell(parent) {
        // Ground slab
        makeBox(WORLD.BUILDING_WIDTH + 0.2, 0.2, WORLD.BUILDING_DEPTH + 0.2,
            MAT.groundSolid, 0, -0.1, 0, parent);

        // Roof
        makeBox(WORLD.BUILDING_WIDTH + 0.2, 0.2, WORLD.BUILDING_DEPTH + 0.2,
            MAT.roofSolid, 0, TOTAL_H + 0.1, 0, parent);

        // Intermediate floor slabs — 4 strips around the 3x3 shaft hole
        for (let f = 1; f < WORLD.FLOOR_COUNT; f++) {
            const fy = f * FH;
            // North strip: x: -HW..HW, z: -HD..-SHD
            const northD = HD - SHD;
            const northCz = -(HD + SHD) / 2;
            makeBox(WORLD.BUILDING_WIDTH, 0.12, northD, MAT.slabTrans,
                0, fy - 0.06, northCz, parent);
            // South strip: x: -HW..HW, z: +SHD..+HD
            const southD = HD - SHD;
            const southCz = (HD + SHD) / 2;
            makeBox(WORLD.BUILDING_WIDTH, 0.12, southD, MAT.slabTrans,
                0, fy - 0.06, southCz, parent);
            // West strip: x: -HW..-SHW, z: -SHD..+SHD
            const westW = HW - SHW;
            const westCx = -(HW + SHW) / 2;
            makeBox(westW, 0.12, WORLD.SHAFT_DEPTH, MAT.slabTrans,
                westCx, fy - 0.06, 0, parent);
            // East strip: x: +SHW..+HW, z: -SHD..+SHD
            const eastW = HW - SHW;
            const eastCx = (HW + SHW) / 2;
            makeBox(eastW, 0.12, WORLD.SHAFT_DEPTH, MAT.slabTrans,
                eastCx, fy - 0.06, 0, parent);
        }

        // Outer walls
        // Back wall (z = -HD)
        makeBox(WORLD.BUILDING_WIDTH, TOTAL_H, 0.12, MAT.outerWall,
            0, TOTAL_H / 2, -HD, parent);
        // Left wall (x = -HW)
        makeBox(0.12, TOTAL_H, WORLD.BUILDING_DEPTH, MAT.outerWall,
            -HW, TOTAL_H / 2, 0, parent);
        // Right wall (x = +HW)
        makeBox(0.12, TOTAL_H, WORLD.BUILDING_DEPTH, MAT.outerWall,
            HW, TOTAL_H / 2, 0, parent);
        // Front wall: three segments, 3-unit gap (x: -1.5..+1.5) on floor 0 only
        // Left panel full height: x=-HW..-1.5
        makeBox(HW - 1.5, TOTAL_H, 0.12, MAT.outerWall,
            -(HW + 1.5) / 2, TOTAL_H / 2, HD, parent);
        // Right panel full height: x=+1.5..+HW
        makeBox(HW - 1.5, TOTAL_H, 0.12, MAT.outerWall,
            (HW + 1.5) / 2, TOTAL_H / 2, HD, parent);
        // Above-gap panel: x=-1.5..+1.5, y=FH..TOTAL_H
        makeBox(3.0, TOTAL_H - FH, 0.12, MAT.outerWall,
            0, (TOTAL_H + FH) / 2, HD, parent);
    }

    // ----------------------------------------------------------------------
    // Main
    // ----------------------------------------------------------------------
    function createWorld(scene) {
        initMats();
        const buildingGroup = new THREE.Group();
        buildingGroup.renderOrder = 0;
        scene.add(buildingGroup);

        buildShell(buildingGroup);

        const floors = [];
        for (let f = 0; f < WORLD.FLOOR_COUNT; f++) {
            let fd;
            if (f === 0) fd = buildLobby(buildingGroup);
            else         fd = buildOfficeFloor(buildingGroup, f);
            floors.push(fd);
        }

        // Apply renderOrder=0 to all descendants
        buildingGroup.traverse(o => { o.renderOrder = 0; });

        return {
            buildingGroup, floors, bfsPath, WORLD,
            createDigitalTexture, updateDigitalTexture
        };
    }

    window.WORLD_CONST = WORLD;
    window.createWorld = createWorld;
    window.createDigitalTexture = createDigitalTexture;
    window.updateDigitalTexture = updateDigitalTexture;
})();
