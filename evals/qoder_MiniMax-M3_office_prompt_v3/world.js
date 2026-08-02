// world.js - Building geometry, per-floor layouts, furniture, navigation graph, call panels
// Loaded as classic <script> in browser.

(function (root) {
    "use strict";

    const WORLD = {
        FLOOR_HEIGHT: 3.4,
        FLOOR_COUNT: 6,
        BUILDING_WIDTH: 22,
        BUILDING_DEPTH: 18,
        SHAFT_WIDTH: 3,
        SHAFT_DEPTH: 3,
        PERSON_R: 0.4,
    };

    const TRANSPARENT_WALL = new THREE.MeshBasicMaterial({
        color: 0x9999ff, transparent: true, opacity: 0.2,
        depthWrite: false, side: THREE.DoubleSide,
    });
    const INTERIOR_WALL = new THREE.MeshBasicMaterial({
        color: 0xbbc5e6, transparent: true, opacity: 0.28,
        depthWrite: false, side: THREE.DoubleSide,
    });
    const FLOOR_SLICE = new THREE.MeshBasicMaterial({
        color: 0x9aa3b8, transparent: true, opacity: 0.3,
        depthWrite: false, side: THREE.DoubleSide,
    });
    const SOLID_GRAY = new THREE.MeshLambertMaterial({ color: 0x666677 });
    const ROOF_GRAY = new THREE.MeshLambertMaterial({ color: 0x555566 });
    const SIDEWALK = new THREE.MeshLambertMaterial({ color: 0x9a9a90 });
    const GLASS_DOOR = new THREE.MeshPhysicalMaterial({
        color: 0xaaddee, transparent: true, opacity: 0.35,
        depthWrite: false, side: THREE.DoubleSide,
        transmission: 0.6, roughness: 0.1,
    });
    const WOOD = new THREE.MeshLambertMaterial({ color: 0x7c5a36 });
    const WOOD_DARK = new THREE.MeshLambertMaterial({ color: 0x5a3e25 });
    const FABRIC_GREEN = new THREE.MeshLambertMaterial({ color: 0x4d7a3a });
    const FABRIC_BLUE = new THREE.MeshLambertMaterial({ color: 0x4a5d7c });
    const FABRIC_RED = new THREE.MeshLambertMaterial({ color: 0x8b3a3a });
    const METAL = new THREE.MeshLambertMaterial({ color: 0x999999 });
    const MONITOR = new THREE.MeshLambertMaterial({ color: 0x222244 });
    const MONITOR_SCREEN = new THREE.MeshBasicMaterial({ color: 0x66aaff });
    const PLANT_LEAF = new THREE.MeshLambertMaterial({ color: 0x3a7a3a });
    const PLANT_POT = new THREE.MeshLambertMaterial({ color: 0x6a4a2a });
    const COUNTER = new THREE.MeshLambertMaterial({ color: 0x4a3520 });
    const COUNTER_TOP = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
    const WALL_PANEL = new THREE.MeshLambertMaterial({ color: 0x222233 });
    const PANEL_OFF = new THREE.MeshBasicMaterial({ color: 0x222222 });
    const PANEL_GREEN = new THREE.MeshBasicMaterial({ color: 0x33ff66 });

    // --- Helpers ---

    function makeMatteCube(w, h, d, mat) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        return m;
    }

    function updateTextTexture(tex, text, opts) {
        opts = opts || {};
        const W = opts.width || 256;
        const H = opts.height || 256;
        const fg = opts.fg || "#ffbb22";
        const bg = opts.bg || "#050505";
        if (tex._lastText === text) return;
        tex._lastText = text;
        const canvas = document.createElement("canvas");
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, W, H);
        // Glow effect
        ctx.shadowColor = fg;
        ctx.shadowBlur = 18;
        ctx.fillStyle = fg;
        ctx.font = "bold " + Math.floor(H * 0.82) + "px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(text, W / 2, H / 2 + H * 0.04);
        ctx.shadowBlur = 0;
        if (tex.image && tex.image.width) {
            ctx.drawImage(canvas, 0, 0);
        } else {
            const newTex = new THREE.CanvasTexture(canvas);
            newTex.minFilter = THREE.LinearFilter;
            newTex.magFilter = THREE.LinearFilter;
            newTex.generateMipmaps = true;
            newTex.anisotropy = 4;
            return newTex;
        }
        tex.needsUpdate = true;
    }

    function makeFloorIndicator(initialText, w, h) {
        const canvas = document.createElement("canvas");
        canvas.width = 256;
        canvas.height = 256;
        const tex = new THREE.CanvasTexture(canvas);
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.generateMipmaps = true;
        tex.anisotropy = 4;
        const geo = new THREE.PlaneGeometry(w, h);
        const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.userData.setIndicator = function (txt) {
            const newTex = updateTextTexture(tex, txt, { width: 256, height: 256 });
            if (newTex) {
                mat.map = newTex;
                newTex.needsUpdate = true;
            } else {
                tex.needsUpdate = true;
            }
        };
        mesh.userData.setIndicator(initialText);
        return mesh;
    }

    function makeCallPanel(floor) {
        const group = new THREE.Group();
        const plate = new THREE.Mesh(
            new THREE.BoxGeometry(0.55, 1.4, 0.05),
            WALL_PANEL
        );
        group.add(plate);

        // Up arrow shape (triangle)
        function makeArrow(dir) {
            const shape = new THREE.Shape();
            if (dir > 0) {
                shape.moveTo(0, 0.12);
                shape.lineTo(-0.13, -0.05);
                shape.lineTo(0.13, -0.05);
                shape.lineTo(0, 0.12);
            } else {
                shape.moveTo(0, -0.12);
                shape.lineTo(-0.13, 0.05);
                shape.lineTo(0.13, 0.05);
                shape.lineTo(0, -0.12);
            }
            const geo = new THREE.ShapeGeometry(shape);
            const mesh = new THREE.Mesh(geo, PANEL_OFF.clone());
            mesh.position.z = 0.026;
            return mesh;
        }
        const upArrow = makeArrow(1);
        upArrow.position.set(0, 0.4, 0.026);
        const downArrow = makeArrow(-1);
        downArrow.position.set(0, -0.4, 0.026);
        group.add(upArrow);
        group.add(downArrow);

        // Floor display
        const display = makeFloorIndicator(String(floor), 0.45, 0.45);
        display.position.set(0, 0, 0.027);
        group.add(display);

        group.userData.setUp = function (on) {
            upArrow.material = on ? PANEL_GREEN : PANEL_OFF;
        };
        group.userData.setDown = function (on) {
            downArrow.material = on ? PANEL_GREEN : PANEL_OFF;
        };
        group.userData.setIndicator = function (txt) {
            display.userData.setIndicator(txt);
        };
        group.userData.upArrow = upArrow;
        group.userData.downArrow = downArrow;
        group.userData.display = display;
        return group;
    }

    // --- BFS Path ---

    function bfsPath(nodes, fromName, toName) {
        if (fromName === toName) return [nodes[fromName].clone()];
        const visited = new Set();
        const queue = [[fromName]];
        visited.add(fromName);
        while (queue.length) {
            const path = queue.shift();
            const last = path[path.length - 1];
            const node = nodes[last];
            if (!node) continue;
            for (const neighbor of node.neighbors) {
                if (visited.has(neighbor)) continue;
                const newPath = path.concat(neighbor);
                if (neighbor === toName) {
                    return newPath.map(function (n) { return nodes[n].clone(); });
                }
                visited.add(neighbor);
                queue.push(newPath);
            }
        }
        return null;
    }

    // --- Furniture helpers ---

    function makeDeskAndChair(x, z, rotY) {
        const g = new THREE.Group();
        const deskTop = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.05, 0.75), WOOD_DARK);
        deskTop.position.set(0, 0.75, 0);
        deskTop.castShadow = false;
        g.add(deskTop);
        const deskLeg1 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.75, 0.7), WOOD);
        deskLeg1.position.set(-0.75, 0.375, 0);
        g.add(deskLeg1);
        const deskLeg2 = deskLeg1.clone();
        deskLeg2.position.x = 0.75;
        g.add(deskLeg2);
        // Monitor
        const monStand = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.2, 0.05), METAL);
        monStand.position.set(0, 0.88, -0.28);
        g.add(monStand);
        const monScreen = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.45, 0.04), MONITOR_SCREEN);
        monScreen.position.set(0, 1.18, -0.28);
        g.add(monScreen);
        const monBezel = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.49, 0.03), MONITOR);
        monBezel.position.set(0, 1.18, -0.295);
        g.add(monBezel);

        // Chair (simple stool)
        const chairGroup = new THREE.Group();
        const seat = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.05, 0.45), FABRIC_BLUE);
        seat.position.set(0, 0.45, 0);
        chairGroup.add(seat);
        const back = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.55, 0.05), FABRIC_BLUE);
        back.position.set(0, 0.78, -0.22);
        chairGroup.add(back);
        // Four legs
        for (let dx = -1; dx <= 1; dx += 2) {
            for (let dz = -1; dz <= 1; dz += 2) {
                const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.45, 6), METAL);
                leg.position.set(dx * 0.18, 0.225, dz * 0.18);
                chairGroup.add(leg);
            }
        }
        chairGroup.position.set(0, 0, 0.55);
        g.add(chairGroup);

        g.position.set(x, 0, z);
        g.rotation.y = rotY || 0;
        return g;
    }

    function makeConfTableAndChairs() {
        const g = new THREE.Group();
        const table = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.06, 1.2), WOOD_DARK);
        table.position.y = 0.74;
        g.add(table);
        // Four legs
        for (let dx = -1; dx <= 1; dx += 2) {
            for (let dz = -1; dz <= 1; dz += 2) {
                const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.74, 0.08), WOOD);
                leg.position.set(dx * 1.45, 0.37, dz * 0.5);
                g.add(leg);
            }
        }
        // Four chairs (2 on each long side)
        for (let i = 0; i < 2; i++) {
            for (let side = -1; side <= 1; side += 2) {
                const chair = new THREE.Group();
                const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.5), FABRIC_RED);
                seat.position.set(0, 0.45, 0);
                chair.add(seat);
                const back = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.06), FABRIC_RED);
                back.position.set(0, 0.75, -side * 0.22);
                chair.add(back);
                for (let dx = -1; dx <= 1; dx += 2) {
                    for (let dz = -1; dz <= 1; dz += 2) {
                        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.45, 6), METAL);
                        leg.position.set(dx * 0.2, 0.225, dz * 0.2);
                        chair.add(leg);
                    }
                }
                chair.position.set(-0.7 + i * 1.4, 0, side * 0.95);
                g.add(chair);
            }
        }
        return g;
    }

    function makeCouch() {
        const g = new THREE.Group();
        const seat = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.4, 0.7), FABRIC_GREEN);
        seat.position.y = 0.4;
        g.add(seat);
        const back = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.5, 0.15), FABRIC_GREEN);
        back.position.set(0, 0.7, -0.3);
        g.add(back);
        const armL = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.4, 0.7), FABRIC_GREEN);
        armL.position.set(-0.825, 0.5, 0);
        g.add(armL);
        const armR = armL.clone();
        armR.position.x = 0.825;
        g.add(armR);
        return g;
    }

    function makeArmchair(color) {
        const g = new THREE.Group();
        const seat = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.3, 0.7), color);
        seat.position.y = 0.35;
        g.add(seat);
        const back = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.55, 0.12), color);
        back.position.set(0, 0.7, -0.32);
        g.add(back);
        const armL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.4, 0.7), color);
        armL.position.set(-0.34, 0.5, 0);
        g.add(armL);
        const armR = armL.clone();
        armR.position.x = 0.34;
        g.add(armR);
        return g;
    }

    function makeCoffeeTable() {
        const g = new THREE.Group();
        const top = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 0.5), WOOD);
        top.position.y = 0.4;
        g.add(top);
        for (let dx = -1; dx <= 1; dx += 2) {
            for (let dz = -1; dz <= 1; dz += 2) {
                const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.4, 6), METAL);
                leg.position.set(dx * 0.35, 0.2, dz * 0.18);
                g.add(leg);
            }
        }
        return g;
    }

    function makeWaterCooler() {
        const g = new THREE.Group();
        const base = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 0.5), FABRIC_BLUE);
        base.position.y = 0.45;
        g.add(base);
        const jug = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.5, 12),
            new THREE.MeshLambertMaterial({ color: 0x88aabb, transparent: true, opacity: 0.7 }));
        jug.position.y = 1.15;
        g.add(jug);
        return g;
    }

    function makePlant() {
        const g = new THREE.Group();
        const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.18, 0.35, 10), PLANT_POT);
        pot.position.y = 0.175;
        g.add(pot);
        for (let i = 0; i < 4; i++) {
            const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), PLANT_LEAF);
            leaf.position.set(
                (Math.random() - 0.5) * 0.2,
                0.55 + Math.random() * 0.15,
                (Math.random() - 0.5) * 0.2
            );
            g.add(leaf);
        }
        return g;
    }

    function makeBistroTable() {
        const g = new THREE.Group();
        const top = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.04, 14), WOOD_DARK);
        top.position.y = 0.74;
        g.add(top);
        const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.7, 6), METAL);
        stand.position.y = 0.37;
        g.add(stand);
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.04, 10), METAL);
        base.position.y = 0.02;
        g.add(base);
        return g;
    }

    function makeBistroChair() {
        const g = new THREE.Group();
        const seat = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.05, 0.4), WOOD);
        seat.position.y = 0.45;
        g.add(seat);
        const back = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.45, 0.05), WOOD);
        back.position.set(0, 0.7, -0.18);
        g.add(back);
        for (let dx = -1; dx <= 1; dx += 2) {
            for (let dz = -1; dz <= 1; dz += 2) {
                const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.45, 6), METAL);
                leg.position.set(dx * 0.15, 0.225, dz * 0.15);
                g.add(leg);
            }
        }
        return g;
    }

    // --- Floor slabs ---

    function makeFloorSlab(y) {
        const g = new THREE.Group();
        const w = WORLD.BUILDING_WIDTH;
        const d = WORLD.BUILDING_DEPTH;
        const sw = WORLD.SHAFT_WIDTH;
        const sd = WORLD.SHAFT_DEPTH;
        // Four strips around the shaft opening
        // back strip (z from -d/2 to -sd/2, x from -w/2 to w/2)
        const back = new THREE.Mesh(new THREE.BoxGeometry(w, 0.2, (d - sd) / 2), FLOOR_SLICE);
        back.position.set(0, y, -(d + sd) / 4);
        g.add(back);
        // front strip
        const front = new THREE.Mesh(new THREE.BoxGeometry(w, 0.2, (d - sd) / 2), FLOOR_SLICE);
        front.position.set(0, y, (d + sd) / 4);
        g.add(front);
        // left strip
        const left = new THREE.Mesh(new THREE.BoxGeometry((w - sw) / 2, 0.2, sd), FLOOR_SLICE);
        left.position.set(-(w + sw) / 4, y, 0);
        g.add(left);
        // right strip
        const right = new THREE.Mesh(new THREE.BoxGeometry((w - sw) / 2, 0.2, sd), FLOOR_SLICE);
        right.position.set((w + sw) / 4, y, 0);
        g.add(right);
        g.renderOrder = 0;
        return g;
    }

    // --- Outer walls ---

    function makeOuterWalls(floor) {
        const g = new THREE.Group();
        const w = WORLD.BUILDING_WIDTH;
        const d = WORLD.BUILDING_DEPTH;
        const fh = WORLD.FLOOR_HEIGHT;
        const halfW = w / 2;
        const halfD = d / 2;

        // Back wall
        const back = new THREE.Mesh(new THREE.BoxGeometry(w, fh, 0.15), TRANSPARENT_WALL);
        back.position.set(0, fh / 2, -halfD);
        g.add(back);

        // Left wall
        const left = new THREE.Mesh(new THREE.BoxGeometry(0.15, fh, d), TRANSPARENT_WALL);
        left.position.set(-halfW, fh / 2, 0);
        g.add(left);

        // Right wall
        const right = new THREE.Mesh(new THREE.BoxGeometry(0.15, fh, d), TRANSPARENT_WALL);
        right.position.set(halfW, fh / 2, 0);
        g.add(right);

        // Front wall - depends on floor
        if (floor === 0) {
            // Floor 0: leave a 3-unit gap in the center
            // Left segment
            const leftW = (w - 3) / 2;
            const frontL = new THREE.Mesh(new THREE.BoxGeometry(leftW, fh, 0.15), TRANSPARENT_WALL);
            frontL.position.set(-(3 / 2 + leftW / 2), fh / 2, halfD);
            g.add(frontL);
            // Right segment
            const frontR = new THREE.Mesh(new THREE.BoxGeometry(leftW, fh, 0.15), TRANSPARENT_WALL);
            frontR.position.set(3 / 2 + leftW / 2, fh / 2, halfD);
            g.add(frontR);
            // Glass doors (decorative)
            const doorL = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.4), GLASS_DOOR);
            doorL.position.set(-0.7, 1.2, halfD - 0.05);
            g.add(doorL);
            const doorR = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.4), GLASS_DOOR);
            doorR.position.set(0.7, 1.2, halfD - 0.05);
            g.add(doorR);
        } else {
            // Above floor 0: full front wall
            const front = new THREE.Mesh(new THREE.BoxGeometry(w, fh, 0.15), TRANSPARENT_WALL);
            front.position.set(0, fh / 2, halfD);
            g.add(front);
        }
        g.renderOrder = 0;
        return g;
    }

    // --- Office floor layout (floors 1..5) ---

    function makeOfficeFloor(floorNum, callback) {
        const g = new THREE.Group();
        const w = WORLD.BUILDING_WIDTH;
        const d = WORLD.BUILDING_DEPTH;
        const fh = WORLD.FLOOR_HEIGHT;
        const y = floorNum * fh;

        g.add(makeOuterWalls(floorNum));
        g.add(makeFloorSlab(y + 0.1));

        // --- Office rooms (back) ---
        // 4 offices along back wall (z in roughly -9 to -3)
        // x positions: -8.25, -2.75, 2.75, 8.25 (4 offices of width 5.5 each)
        const officeX = [-8.25, -2.75, 2.75, 8.25];
        const officeIds = ["A", "B", "C", "D"];
        for (let i = 0; i < 4; i++) {
            const cx = officeX[i];
            // Back wall
            const back = new THREE.Mesh(new THREE.BoxGeometry(5.5, fh, 0.1), INTERIOR_WALL);
            back.position.set(cx, fh / 2, -8.95);
            g.add(back);
            // Side walls (except for outermost which use outer wall)
            // Inner left wall
            if (i > 0) {
                const left = new THREE.Mesh(new THREE.BoxGeometry(0.1, fh, 5.5), INTERIOR_WALL);
                left.position.set(cx - 2.75, fh / 2, -6.2);
                g.add(left);
            }
            if (i < 3) {
                const right = new THREE.Mesh(new THREE.BoxGeometry(0.1, fh, 5.5), INTERIOR_WALL);
                right.position.set(cx + 2.75, fh / 2, -6.2);
                g.add(right);
            }
            // Front wall with doorway (1.2 wide)
            const front = new THREE.Group();
            const fLeft = new THREE.Mesh(new THREE.BoxGeometry(2.15, fh, 0.1), INTERIOR_WALL);
            fLeft.position.set(-1.675, fh / 2, 0);
            front.add(fLeft);
            const fRight = new THREE.Mesh(new THREE.BoxGeometry(2.15, fh, 0.1), INTERIOR_WALL);
            fRight.position.set(1.675, fh / 2, 0);
            front.add(fRight);
            const fHeader = new THREE.Mesh(new THREE.BoxGeometry(1.2, fh - 2.0, 0.1), INTERIOR_WALL);
            fHeader.position.set(0, 1.0 + (fh - 2.0) / 2, 0);
            front.add(fHeader);
            front.position.set(cx, 0, -3.45);
            g.add(front);

            // Desk and chair
            const desk = makeDeskAndChair(0, -1.2, 0);
            desk.position.set(cx, 0, -7.2);
            g.add(desk);
        }

        // --- Conference room (front-left: x:-11..-3, z:3..9) ---
        // Walls
        const confBL = new THREE.Mesh(new THREE.BoxGeometry(8, fh, 0.1), INTERIOR_WALL);
        confBL.position.set(-7, fh / 2, 3.0);
        g.add(confBL);
        const confLL = new THREE.Mesh(new THREE.BoxGeometry(0.1, fh, 6), INTERIOR_WALL);
        confLL.position.set(-11, fh / 2, 6.0);
        g.add(confLL);
        const confRL = new THREE.Mesh(new THREE.BoxGeometry(0.1, fh, 6), INTERIOR_WALL);
        confRL.position.set(-3, fh / 2, 6.0);
        g.add(confRL);
        // Doorway in the back wall
        const confD1 = new THREE.Mesh(new THREE.BoxGeometry(3.4, fh, 0.1), INTERIOR_WALL);
        confD1.position.set(-8.7, fh / 2, 3.0);
        g.add(confD1);
        const confD2 = new THREE.Mesh(new THREE.BoxGeometry(3.4, fh, 0.1), INTERIOR_WALL);
        confD2.position.set(-5.3, fh / 2, 3.0);
        g.add(confD2);
        const confDH = new THREE.Mesh(new THREE.BoxGeometry(1.2, fh - 2.0, 0.1), INTERIOR_WALL);
        confDH.position.set(-7, 1.0 + (fh - 2.0) / 2, 3.0);
        g.add(confDH);

        // Conference table + chairs
        const confTable = makeConfTableAndChairs();
        confTable.position.set(-7, 0, 6);
        g.add(confTable);

        // --- Lounge (front-right: x:3..11, z:3..9) ---
        const lBL = new THREE.Mesh(new THREE.BoxGeometry(8, fh, 0.1), INTERIOR_WALL);
        lBL.position.set(7, fh / 2, 3.0);
        g.add(lBL);
        const lLL = new THREE.Mesh(new THREE.BoxGeometry(0.1, fh, 6), INTERIOR_WALL);
        lLL.position.set(3, fh / 2, 6.0);
        g.add(lLL);
        const lRL = new THREE.Mesh(new THREE.BoxGeometry(0.1, fh, 6), INTERIOR_WALL);
        lRL.position.set(11, fh / 2, 6.0);
        g.add(lRL);
        // Doorway
        const lD1 = new THREE.Mesh(new THREE.BoxGeometry(3.4, fh, 0.1), INTERIOR_WALL);
        lD1.position.set(5.3, fh / 2, 3.0);
        g.add(lD1);
        const lD2 = new THREE.Mesh(new THREE.BoxGeometry(3.4, fh, 0.1), INTERIOR_WALL);
        lD2.position.set(8.7, fh / 2, 3.0);
        g.add(lD2);
        const lDH = new THREE.Mesh(new THREE.BoxGeometry(1.2, fh - 2.0, 0.1), INTERIOR_WALL);
        lDH.position.set(7, 1.0 + (fh - 2.0) / 2, 3.0);
        g.add(lDH);

        // Lounge furniture
        const couch1 = makeCouch();
        couch1.position.set(7, 0, 7.5);
        couch1.rotation.y = Math.PI;
        g.add(couch1);
        const couch2 = makeCouch();
        couch2.position.set(7, 0, 4.5);
        g.add(couch2);
        const coffeeT = makeCoffeeTable();
        coffeeT.position.set(7, 0, 6);
        g.add(coffeeT);
        const wcLounge = makeWaterCooler();
        wcLounge.position.set(10.2, 0, 8.2);
        g.add(wcLounge);

        // Plant by the entrance area
        const plant = makePlant();
        plant.position.set(-2, 0, 1.2);
        g.add(plant);

        // Call panel next to the shaft (z = +1.7)
        const panel = makeCallPanel(floorNum);
        panel.position.set(1.6, 1.1, 1.6);
        panel.rotation.y = -Math.PI / 2;
        g.add(panel);

        // Shaft indicator above doors
        const shaftInd = makeFloorIndicator(String(floorNum) + "_", 0.9, 0.9);
        shaftInd.position.set(0, fh - 0.6, 1.55);
        shaftInd.rotation.y = 0;
        g.add(shaftInd);

        // --- Navigation graph ---
        const nodes = {};
        function addNode(name, x, z, neighbors) {
            const v = new THREE.Vector3(x, 0, z);
            v.neighbors = neighbors.slice();
            nodes[name] = v;
        }
        // Hallway ring
        addNode("hallN",  0,  -2.4, ["hallNW", "hallNE"]);
        addNode("hallNE", 9.5, -2.4, ["hallN", "hallE"]);
        addNode("hallE",  9.5,  0,   ["hallNE", "hallSE", "hallS"]);
        addNode("hallSE", 9.5,  2.4, ["hallE", "hallS"]);
        addNode("hallS",  0,    2.4, ["hallSE", "hallSW", "elevWait"]);
        addNode("hallSW",-9.5,  2.4, ["hallS", "hallW"]);
        addNode("hallW", -9.5,  0,   ["hallSW", "hallNW", "hallS"]);
        addNode("hallNW",-9.5, -2.4, ["hallW", "hallN"]);
        addNode("elevWait", 0, 1.6, ["hallS"]);

        // Office doors & desks
        for (let i = 0; i < 4; i++) {
            const cx = officeX[i];
            const oid = officeIds[i];
            // door is just outside the office front wall (z = -3.45)
            addNode("office" + oid + "_door", cx, -3.45, ["hallS"]);
            nodes["office" + oid + "_door"].neighbors.push("hallN");
            // desk inside
            addNode("office" + oid + "_desk", cx, -7.2, ["office" + oid + "_door"]);
        }

        // Conference room
        addNode("conf_door", -7, 3.0, ["hallSW"]);
        addNode("conf_center", -7, 6, ["conf_door"]);
        addNode("conf_seat0", -7.7, 6.95, ["conf_center"]);
        addNode("conf_seat1", -6.3, 6.95, ["conf_center"]);
        addNode("conf_seat2", -7.7, 5.05, ["conf_center"]);
        addNode("conf_seat3", -6.3, 5.05, ["conf_center"]);

        // Lounge
        addNode("lounge_door", 7, 3.0, ["hallSE"]);
        addNode("lounge_center", 7, 6, ["lounge_door"]);
        addNode("lounge_spot0", 7, 7.5, ["lounge_center"]);   // facing -Z
        addNode("lounge_spot1", 7, 4.5, ["lounge_center"]);   // facing +Z
        addNode("lounge_spot2", 9, 8, ["lounge_center"]);     // facing -X
        addNode("water_cooler", 10.2, 8.2, ["lounge_center"]);
        addNode("hall_stand_N", 0, -2.4, ["hallN"]);
        addNode("hall_stand_S", 0, 2.4, ["hallS"]);

        const sitTargets = {};
        // Office desk: sit at chair, face -Z (toward desk/monitor)
        for (let i = 0; i < 4; i++) {
            const cx = officeX[i];
            const oid = officeIds[i];
            sitTargets["office" + oid + "_desk"] = {
                sit: true, facing: Math.PI, sitPos: new THREE.Vector3(cx, 0, -6.65)
            };
        }
        // Conference seats: face toward the table center (-7, 6)
        sitTargets["conf_seat0"] = { sit: true, facing: Math.PI, sitPos: new THREE.Vector3(-7.7, 0, 6.4) };
        sitTargets["conf_seat1"] = { sit: true, facing: 0, sitPos: new THREE.Vector3(-6.3, 0, 6.4) };
        sitTargets["conf_seat2"] = { sit: true, facing: Math.PI, sitPos: new THREE.Vector3(-7.7, 0, 5.6) };
        sitTargets["conf_seat3"] = { sit: true, facing: 0, sitPos: new THREE.Vector3(-6.3, 0, 5.6) };
        // Lounge spots
        sitTargets["lounge_spot0"] = { sit: true, facing: 0, sitPos: new THREE.Vector3(7, 0, 7.0) };
        sitTargets["lounge_spot1"] = { sit: true, facing: Math.PI, sitPos: new THREE.Vector3(7, 0, 5.0) };
        sitTargets["lounge_spot2"] = { sit: false, facing: -Math.PI / 2, sitPos: new THREE.Vector3(8.5, 0, 8) };
        sitTargets["water_cooler"] = { sit: false, facing: -Math.PI / 2, sitPos: new THREE.Vector3(10.2, 0, 8.7) };
        sitTargets["hall_stand_N"] = { sit: false, facing: 0, sitPos: new THREE.Vector3(0, 0, -2.4) };
        sitTargets["hall_stand_S"] = { sit: false, facing: 0, sitPos: new THREE.Vector3(0, 0, 2.4) };

        return {
            group: g,
            nodes: nodes,
            callPanel: panel,
            shaftIndicator: shaftInd,
            sitTargets: sitTargets,
            desks: officeIds.map(function (oid, i) {
                return { id: "office" + oid, wp: "office" + oid + "_desk", x: officeX[i] };
            }),
        };
    }

    // --- Ground floor (lobby) ---

    function makeLobby() {
        const g = new THREE.Group();
        const w = WORLD.BUILDING_WIDTH;
        const d = WORLD.BUILDING_DEPTH;
        const fh = WORLD.FLOOR_HEIGHT;
        const y = 0;

        g.add(makeOuterWalls(0));
        g.add(makeFloorSlab(y + 0.1));

        // Sidewalk outside
        const sidewalk = new THREE.Mesh(
            new THREE.BoxGeometry(8, 0.1, 4),
            SIDEWALK
        );
        sidewalk.position.set(0, 0.05, 12);
        sidewalk.renderOrder = 0;
        g.add(sidewalk);

        // Cafe on the left (x ~ -8, z ~ 6)
        // Counter
        const counter = new THREE.Mesh(new THREE.BoxGeometry(4, 1.1, 0.8), COUNTER);
        counter.position.set(-8, 0.55, 8.2);
        g.add(counter);
        const counterTop = new THREE.Mesh(new THREE.BoxGeometry(4.1, 0.05, 0.85), COUNTER_TOP);
        counterTop.position.set(-8, 1.13, 8.2);
        g.add(counterTop);
        // Coffee machine
        const machine = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.4),
            new THREE.MeshLambertMaterial({ color: 0x222222 }));
        machine.position.set(-9.2, 1.45, 8.0);
        g.add(machine);
        // Pastry display
        const display = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 0.5),
            new THREE.MeshLambertMaterial({ color: 0xddc88a }));
        display.position.set(-7.5, 1.4, 8.0);
        g.add(display);

        // Bistro tables (2-3)
        const bistroXs = [-6, -4.5, -3];
        const bistroZs = [6.5, 5.0, 7.5];
        for (let i = 0; i < bistroXs.length; i++) {
            const table = makeBistroTable();
            table.position.set(bistroXs[i], 0, bistroZs[i]);
            g.add(table);
            for (let s = -1; s <= 1; s += 2) {
                const chair = makeBistroChair();
                chair.position.set(bistroXs[i] + s * 0.7, 0, bistroZs[i]);
                chair.rotation.y = s > 0 ? Math.PI : 0;
                g.add(chair);
            }
        }

        // Front lounge (right side: x:3..11, z:3..9)
        const couchFR = makeCouch();
        couchFR.position.set(7, 0, 4.5);
        couchFR.rotation.y = Math.PI;
        g.add(couchFR);
        const arm1 = makeArmchair(FABRIC_RED);
        arm1.position.set(4.5, 0, 7);
        arm1.rotation.y = Math.PI / 2;
        g.add(arm1);
        const arm2 = makeArmchair(FABRIC_BLUE);
        arm2.position.set(9.5, 0, 7);
        arm2.rotation.y = -Math.PI / 2;
        g.add(arm2);
        const coffeeTbl1 = makeCoffeeTable();
        coffeeTbl1.position.set(7, 0, 6);
        g.add(coffeeTbl1);
        const wcFront = makeWaterCooler();
        wcFront.position.set(10.2, 0, 3.2);
        g.add(wcFront);

        // Back lounge (z < 0): two couches facing each other
        const couchBLN = makeCouch();
        couchBLN.position.set(7, 0, -1.5);
        couchBLN.rotation.y = Math.PI;
        g.add(couchBLN);
        const couchBLS = makeCouch();
        couchBLS.position.set(7, 0, -4.5);
        g.add(couchBLS);
        const coffeeTblBL = makeCoffeeTable();
        coffeeTblBL.position.set(7, 0, -3);
        g.add(coffeeTblBL);

        // Conversation pit (back-left): round table + 4 armchairs
        const pitTable = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.05, 16), WOOD_DARK);
        pitTable.position.set(-7, 0.74, -5);
        g.add(pitTable);
        const pitStand = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.7, 6), METAL);
        pitStand.position.set(-7, 0.37, -5);
        g.add(pitStand);
        const pitBase = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.05, 12), METAL);
        pitBase.position.set(-7, 0.02, -5);
        g.add(pitBase);
        for (let i = 0; i < 4; i++) {
            const arm = makeArmchair([FABRIC_GREEN, FABRIC_BLUE, FABRIC_RED, WOOD][i]);
            const ang = i * Math.PI / 2;
            arm.position.set(-7 + Math.cos(ang) * 1.3, 0, -5 + Math.sin(ang) * 1.3);
            arm.rotation.y = ang + Math.PI;
            g.add(arm);
        }

        // Back water cooler
        const wcBack = makeWaterCooler();
        wcBack.position.set(-10.2, 0, -8);
        g.add(wcBack);

        // Reception desk
        const reception = new THREE.Mesh(new THREE.BoxGeometry(2.5, 1.0, 0.7), WOOD);
        reception.position.set(-3, 0.5, 6);
        g.add(reception);
        const receptionTop = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.05, 0.75), WOOD_DARK);
        receptionTop.position.set(-3, 1.03, 6);
        g.add(receptionTop);
        // Reception chair
        const rChair = makeBistroChair();
        rChair.position.set(-3, 0, 5.3);
        rChair.rotation.y = 0;
        g.add(rChair);

        // Info kiosk
        const kiosk = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.4, 0.3),
            new THREE.MeshLambertMaterial({ color: 0x333344 }));
        kiosk.position.set(2.5, 0.7, 7.5);
        g.add(kiosk);
        const kioskScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.9),
            new THREE.MeshBasicMaterial({ color: 0x66aaff }));
        kioskScreen.position.set(2.5, 1.0, 7.35);
        g.add(kioskScreen);

        // Plants
        const plant1 = makePlant();
        plant1.position.set(-2.5, 0, 8.3);
        g.add(plant1);
        const plant2 = makePlant();
        plant2.position.set(2.5, 0, 8.3);
        g.add(plant2);
        const plant3 = makePlant();
        plant3.position.set(9, 0, 8.2);
        g.add(plant3);
        const plant4 = makePlant();
        plant4.position.set(-9, 0, 3.5);
        g.add(plant4);

        // Call panel next to the shaft
        const panel = makeCallPanel(0);
        panel.position.set(1.6, 1.1, 1.6);
        panel.rotation.y = -Math.PI / 2;
        g.add(panel);

        // Shaft indicator above doors
        const shaftInd = makeFloorIndicator("0_", 0.9, 0.9);
        shaftInd.position.set(0, fh - 0.6, 1.55);
        g.add(shaftInd);

        // --- Navigation graph for lobby ---
        const nodes = {};
        function addNode(name, x, z, neighbors) {
            const v = new THREE.Vector3(x, 0, z);
            v.neighbors = neighbors.slice();
            nodes[name] = v;
        }
        // Entrance chain
        addNode("outside", 0, 12, ["front_door_threshold"]);
        addNode("front_door_threshold", 0, 9.35, ["outside", "entrance"]);
        addNode("entrance", 0, 7.4, ["front_door_threshold", "lobby_center"]);
        addNode("lobby_center", 0, 4, ["entrance", "elevWait"]);

        // Hallway ring around the shaft
        addNode("hallN",  0,  -2.4, ["hallNW", "hallNE"]);
        addNode("hallNE", 9.5, -2.4, ["hallN", "hallE"]);
        addNode("hallE",  9.5,  0,   ["hallNE", "hallSE", "hallS"]);
        addNode("hallSE", 9.5,  2.4, ["hallE", "hallS"]);
        addNode("hallS",  0,    2.4, ["hallSE", "hallSW", "elevWait"]);
        addNode("hallSW",-9.5,  2.4, ["hallS", "hallW"]);
        addNode("hallW", -9.5,  0,   ["hallSW", "hallNW", "hallS"]);
        addNode("hallNW",-9.5, -2.4, ["hallW", "hallN"]);
        addNode("elevWait", 0, 1.6, ["hallS", "lobby_center"]);

        // Cafe area
        addNode("cafe_door", -7, 8.2, ["lobby_center"]);
        addNode("cafe_order", -7, 7.5, ["cafe_door"]);
        addNode("cafe_table0", -6, 6.5, ["cafe_door"]);
        addNode("cafe_table1", -4.5, 5.0, ["cafe_door"]);
        addNode("cafe_table2", -3, 7.5, ["cafe_door"]);
        addNode("cafe_chair0", -5.3, 6.5, ["cafe_table0"]);
        addNode("cafe_chair0b", -6.7, 6.5, ["cafe_table0"]);
        addNode("cafe_chair1", -3.8, 5.0, ["cafe_table1"]);
        addNode("cafe_chair1b", -5.2, 5.0, ["cafe_table1"]);
        addNode("cafe_chair2", -2.3, 7.5, ["cafe_table2"]);
        addNode("cafe_chair2b", -3.7, 7.5, ["cafe_table2"]);

        // Front lounge
        addNode("lounge_spot0", 7, 4.5, ["lobby_center"]);
        addNode("lounge_spot1", 4.5, 6.5, ["lobby_center"]);
        addNode("lounge_spot2", 9.5, 6.5, ["lobby_center"]);
        addNode("lounge_coffee_table", 7, 5.8, ["lobby_center"]);
        addNode("lobby_wc_front", 10.2, 3.2, ["lobby_center"]);

        // Back lounge
        addNode("back_lounge_N", 7, -1.5, ["lobby_center"]);
        addNode("back_lounge_S", 7, -4.5, ["lobby_center"]);
        addNode("back_lounge_table", 7, -3, ["lobby_center"]);

        // Conversation pit
        addNode("pit_N", -7, -3.7, ["lobby_center"]);
        addNode("pit_S", -7, -6.3, ["lobby_center"]);
        addNode("pit_E", -5.7, -5, ["lobby_center"]);
        addNode("pit_W", -8.3, -5, ["lobby_center"]);

        // Reception
        addNode("reception", -3, 5.3, ["lobby_center"]);
        // Kiosk
        addNode("kiosk", 2.5, 7.5, ["lobby_center"]);

        // Misc loiter waypoints
        addNode("lobby_stand_center", 1.5, 4, ["lobby_center"]);
        addNode("lobby_stand_NE", 8, 1, ["lobby_center"]);
        addNode("lobby_stand_NW", -8, 1, ["lobby_center"]);
        addNode("lobby_stand_midE", 5, 2, ["lobby_center"]);
        addNode("lobby_stand_midW", -5, 2, ["lobby_center"]);
        addNode("lobby_stand_entry", 0, 6, ["lobby_center"]);
        addNode("lobby_wc_back", -10.2, -8, ["lobby_center"]);

        // Cafe door connected to lobby center directly
        nodes["cafe_door"].neighbors = ["lobby_center"];

        const sitTargets = {};
        // Bistro chairs (sit positions face the table)
        sitTargets["cafe_chair0"] = { sit: true, facing: -Math.PI / 2, sitPos: new THREE.Vector3(-5.3, 0, 6.5) };
        sitTargets["cafe_chair0b"] = { sit: true, facing: Math.PI / 2, sitPos: new THREE.Vector3(-6.7, 0, 6.5) };
        sitTargets["cafe_chair1"] = { sit: true, facing: -Math.PI / 2, sitPos: new THREE.Vector3(-3.8, 0, 5.0) };
        sitTargets["cafe_chair1b"] = { sit: true, facing: Math.PI / 2, sitPos: new THREE.Vector3(-5.2, 0, 5.0) };
        sitTargets["cafe_chair2"] = { sit: true, facing: -Math.PI / 2, sitPos: new THREE.Vector3(-2.3, 0, 7.5) };
        sitTargets["cafe_chair2b"] = { sit: true, facing: Math.PI / 2, sitPos: new THREE.Vector3(-3.7, 0, 7.5) };
        // Cafe order (standing)
        sitTargets["cafe_order"] = { sit: false, facing: 0, sitPos: new THREE.Vector3(-7, 0, 7.5) };
        // Lounge spots (sit on couches, facing room)
        sitTargets["lounge_spot0"] = { sit: true, facing: 0, sitPos: new THREE.Vector3(7, 0, 4.0) };
        sitTargets["lounge_spot1"] = { sit: true, facing: Math.PI / 2, sitPos: new THREE.Vector3(4.5, 0, 6.5) };
        sitTargets["lounge_spot2"] = { sit: true, facing: -Math.PI / 2, sitPos: new THREE.Vector3(9.5, 0, 6.5) };
        sitTargets["lounge_coffee_table"] = { sit: false, facing: 0, sitPos: new THREE.Vector3(7, 0, 5.8) };
        sitTargets["lobby_wc_front"] = { sit: false, facing: -Math.PI / 2, sitPos: new THREE.Vector3(10.2, 0, 3.5) };
        // Back lounge
        sitTargets["back_lounge_N"] = { sit: true, facing: Math.PI, sitPos: new THREE.Vector3(7, 0, -1.0) };
        sitTargets["back_lounge_S"] = { sit: true, facing: 0, sitPos: new THREE.Vector3(7, 0, -5.0) };
        sitTargets["back_lounge_table"] = { sit: false, facing: 0, sitPos: new THREE.Vector3(7, 0, -3) };
        // Pit
        sitTargets["pit_N"] = { sit: true, facing: Math.PI, sitPos: new THREE.Vector3(-7, 0, -3.7) };
        sitTargets["pit_S"] = { sit: true, facing: 0, sitPos: new THREE.Vector3(-7, 0, -6.3) };
        sitTargets["pit_E"] = { sit: true, facing: -Math.PI / 2, sitPos: new THREE.Vector3(-5.7, 0, -5) };
        sitTargets["pit_W"] = { sit: true, facing: Math.PI / 2, sitPos: new THREE.Vector3(-8.3, 0, -5) };
        // Reception (standing) and kiosk
        sitTargets["reception"] = { sit: false, facing: 0, sitPos: new THREE.Vector3(-3, 0, 5.3) };
        sitTargets["kiosk"] = { sit: false, facing: -Math.PI / 2, sitPos: new THREE.Vector3(2.5, 0, 7.2) };
        // Loiter waypoints (standing)
        sitTargets["lobby_stand_center"] = { sit: false, facing: 0, sitPos: new THREE.Vector3(1.5, 0, 4) };
        sitTargets["lobby_stand_NE"] = { sit: false, facing: 0, sitPos: new THREE.Vector3(8, 0, 1) };
        sitTargets["lobby_stand_NW"] = { sit: false, facing: 0, sitPos: new THREE.Vector3(-8, 0, 1) };
        sitTargets["lobby_stand_midE"] = { sit: false, facing: 0, sitPos: new THREE.Vector3(5, 0, 2) };
        sitTargets["lobby_stand_midW"] = { sit: false, facing: 0, sitPos: new THREE.Vector3(-5, 0, 2) };
        sitTargets["lobby_stand_entry"] = { sit: false, facing: 0, sitPos: new THREE.Vector3(0, 0, 6) };
        sitTargets["lobby_wc_back"] = { sit: false, facing: Math.PI / 2, sitPos: new THREE.Vector3(-10.2, 0, -7.5) };

        return {
            group: g,
            nodes: nodes,
            callPanel: panel,
            shaftIndicator: shaftInd,
            sitTargets: sitTargets,
            desks: [], // lobby has no fixed desks
            isLobby: true,
        };
    }

    // --- createWorld ---

    function createWorld(scene) {
        const buildingGroup = new THREE.Group();
        buildingGroup.name = "BuildingGroup";
        buildingGroup.renderOrder = 0;

        // Ground slab
        const ground = new THREE.Mesh(
            new THREE.BoxGeometry(WORLD.BUILDING_WIDTH + 6, 0.1, WORLD.BUILDING_DEPTH + 6),
            SOLID_GRAY
        );
        ground.position.set(0, -0.05, 0);
        ground.renderOrder = 0;
        buildingGroup.add(ground);

        // Roof
        const roof = new THREE.Mesh(
            new THREE.BoxGeometry(WORLD.BUILDING_WIDTH, 0.2, WORLD.BUILDING_DEPTH),
            ROOF_GRAY
        );
        roof.position.set(0, WORLD.FLOOR_COUNT * WORLD.FLOOR_HEIGHT, 0);
        roof.renderOrder = 0;
        buildingGroup.add(roof);

        // Add the lobby (floor 0) and 5 office floors
        const floors = [];
        const lobby = makeLobby();
        buildingGroup.add(lobby.group);
        floors.push({
            floorNumber: 0,
            nodes: lobby.nodes,
            callPanel: lobby.callPanel,
            shaftIndicator: lobby.shaftIndicator,
            desks: lobby.desks,
            sitTargets: lobby.sitTargets,
            isLobby: true,
        });

        for (let f = 1; f < WORLD.FLOOR_COUNT; f++) {
            const of = makeOfficeFloor(f);
            buildingGroup.add(of.group);
            floors.push({
                floorNumber: f,
                nodes: of.nodes,
                callPanel: of.callPanel,
                shaftIndicator: of.shaftIndicator,
                desks: of.desks,
                sitTargets: of.sitTargets,
            });
        }

        scene.add(buildingGroup);

        return {
            buildingGroup: buildingGroup,
            floors: floors,
            bfsPath: bfsPath,
            world: WORLD,
        };
    }

    root.WORLD = WORLD;
    root.createWorld = createWorld;
    root.bfsPath = bfsPath;
})(typeof window !== "undefined" ? window : globalThis);
