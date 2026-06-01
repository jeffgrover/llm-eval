(function (root) {
    const WORLD = {
        FLOOR_HEIGHT: 3.4, FLOOR_COUNT: 6,
        BUILDING_WIDTH: 22, BUILDING_DEPTH: 18,
        SHAFT_WIDTH: 3, SHAFT_DEPTH: 3,
        PERSON_R: 0.4
    };
    const HALF_W = WORLD.BUILDING_WIDTH / 2;
    const HALF_D = WORLD.BUILDING_DEPTH / 2;
    const SHAFT_HW = WORLD.SHAFT_WIDTH / 2;
    const SHAFT_HD = WORLD.SHAFT_DEPTH / 2;
    const HALL_X = 3;
    const HALL_Z = 2.5;

    const _NAV_GRAPHS = [];

    function makeTextMaterial(text) {
        const canvas = document.createElement("canvas");
        canvas.width = 256;
        canvas.height = 256;
        const tex = new THREE.CanvasTexture(canvas);
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.anisotropy = 4;
        tex._lastText = null;
        redrawText(canvas, text);
        tex._lastText = text;
        return new THREE.MeshBasicMaterial({ map: tex, transparent: true });
    }

    function setIndicatorText(mesh, text) {
        const tex = mesh.material.map;
        if (!tex) return;
        if (tex._lastText === text) return;
        tex._lastText = text;
        redrawText(tex.image, text);
        tex.needsUpdate = true;
    }

    function redrawText(canvas, text) {
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#050505";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#ffbb22";
        ctx.font = "bold 200px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.shadowColor = "#ffaa00";
        ctx.shadowBlur = 32;
        ctx.fillText(String(text), canvas.width / 2, canvas.height / 2);
        ctx.shadowBlur = 0;
    }

    function triShape(up) {
        const s = new THREE.Shape();
        const w = 0.13;
        const h = 0.13;
        if (up) {
            s.moveTo(0, h);
            s.lineTo(-w, -h);
            s.lineTo(w, -h);
            s.closePath();
        } else {
            s.moveTo(0, -h);
            s.lineTo(-w, h);
            s.lineTo(w, h);
            s.closePath();
        }
        return s;
    }

    function makeCallPanel() {
        const g = new THREE.Group();
        const plate = new THREE.Mesh(
            new THREE.BoxGeometry(0.55, 1.4, 0.05),
            new THREE.MeshLambertMaterial({ color: 0x333344 })
        );
        g.add(plate);

        const upTri = new THREE.Mesh(
            new THREE.ShapeGeometry(triShape(true)),
            new THREE.MeshBasicMaterial({ color: 0x444444 })
        );
        upTri.position.set(0, 0.45, 0.03);
        g.add(upTri);

        const dnTri = new THREE.Mesh(
            new THREE.ShapeGeometry(triShape(false)),
            new THREE.MeshBasicMaterial({ color: 0x444444 })
        );
        dnTri.position.set(0, -0.45, 0.03);
        g.add(dnTri);

        const display = new THREE.Mesh(
            new THREE.PlaneGeometry(0.45, 0.45),
            makeTextMaterial("0")
        );
        display.position.set(0, 0, 0.03);
        g.add(display);

        g.userData.upMat = upTri.material;
        g.userData.dnMat = dnTri.material;
        g.userData.setUp = function (on) {
            g.userData.upMat.color.setHex(on ? 0x33ff33 : 0x444444);
        };
        g.userData.setDown = function (on) {
            g.userData.dnMat.color.setHex(on ? 0x33ff33 : 0x444444);
        };
        g.userData.setIndicator = function (text) {
            setIndicatorText(display, text);
        };
        return g;
    }

    function makeShaftIndicator() {
        const g = new THREE.Group();
        const frame = new THREE.Mesh(
            new THREE.BoxGeometry(1.0, 1.0, 0.08),
            new THREE.MeshLambertMaterial({ color: 0x222222 })
        );
        g.add(frame);
        const display = new THREE.Mesh(
            new THREE.PlaneGeometry(0.9, 0.9),
            makeTextMaterial("0")
        );
        display.position.z = 0.045;
        g.add(display);
        g.userData.setIndicator = function (text) {
            setIndicatorText(display, text);
        };
        return g;
    }

    function makeChair(color) {
        const g = new THREE.Group();
        const c = color != null ? color : 0x884422;
        const mat = new THREE.MeshLambertMaterial({ color: c });
        const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.5), mat);
        seat.position.y = 0.45;
        g.add(seat);
        const back = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.08), mat);
        back.position.set(0, 0.78, -0.21);
        g.add(back);
        for (const dx of [-0.2, 0.2]) {
            for (const dz of [-0.2, 0.2]) {
                const leg = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.03, 0.03, 0.45, 6),
                    new THREE.MeshLambertMaterial({ color: 0x222222 })
                );
                leg.position.set(dx, 0.225, dz);
                g.add(leg);
            }
        }
        return g;
    }

    function makeDesk() {
        const g = new THREE.Group();
        const top = new THREE.Mesh(
            new THREE.BoxGeometry(1.7, 0.08, 0.8),
            new THREE.MeshLambertMaterial({ color: 0x664422 })
        );
        top.position.y = 0.75;
        g.add(top);
        for (const dx of [-0.75, 0.75]) {
            for (const dz of [-0.3, 0.3]) {
                const leg = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.04, 0.04, 0.75, 6),
                    new THREE.MeshLambertMaterial({ color: 0x222222 })
                );
                leg.position.set(dx, 0.375, dz);
                g.add(leg);
            }
        }
        const monBase = new THREE.Mesh(
            new THREE.BoxGeometry(0.3, 0.05, 0.15),
            new THREE.MeshLambertMaterial({ color: 0x111111 })
        );
        monBase.position.set(0, 0.83, -0.28);
        g.add(monBase);
        const monStand = new THREE.Mesh(
            new THREE.BoxGeometry(0.05, 0.25, 0.05),
            new THREE.MeshLambertMaterial({ color: 0x111111 })
        );
        monStand.position.set(0, 0.98, -0.28);
        g.add(monStand);
        const monScreen = new THREE.Mesh(
            new THREE.BoxGeometry(0.6, 0.4, 0.04),
            new THREE.MeshLambertMaterial({ color: 0x224488, emissive: 0x112244 })
        );
        monScreen.position.set(0, 1.22, -0.31);
        g.add(monScreen);
        return g;
    }

    function makeCouch(color) {
        const g = new THREE.Group();
        const c = color != null ? color : 0x4477aa;
        const mat = new THREE.MeshLambertMaterial({ color: c });
        const seat = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.4, 0.8), mat);
        seat.position.y = 0.4;
        g.add(seat);
        const back = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.6, 0.2), mat);
        back.position.set(0, 0.7, -0.3);
        g.add(back);
        for (const dx of [-0.85, 0.85]) {
            const arm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.5, 0.8), mat);
            arm.position.set(dx, 0.45, 0);
            g.add(arm);
        }
        for (const dx of [-0.7, 0.7]) {
            for (const dz of [-0.3, 0.3]) {
                const leg = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.05, 0.05, 0.2, 6),
                    new THREE.MeshLambertMaterial({ color: 0x222222 })
                );
                leg.position.set(dx, 0.1, dz);
                g.add(leg);
            }
        }
        return g;
    }

    function makeArmchair(color) {
        const g = new THREE.Group();
        const c = color != null ? color : 0xaa6644;
        const mat = new THREE.MeshLambertMaterial({ color: c });
        const seat = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.35, 0.8), mat);
        seat.position.y = 0.4;
        g.add(seat);
        const back = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.18), mat);
        back.position.set(0, 0.7, -0.31);
        g.add(back);
        for (const dx of [-0.4, 0.4]) {
            const arm = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.5, 0.8), mat);
            arm.position.set(dx, 0.45, 0);
            g.add(arm);
        }
        for (const dx of [-0.3, 0.3]) {
            for (const dz of [-0.3, 0.3]) {
                const leg = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.04, 0.04, 0.2, 6),
                    new THREE.MeshLambertMaterial({ color: 0x222222 })
                );
                leg.position.set(dx, 0.1, dz);
                g.add(leg);
            }
        }
        return g;
    }

    function makeCoffeeTable() {
        const g = new THREE.Group();
        const top = new THREE.Mesh(
            new THREE.BoxGeometry(1.2, 0.08, 0.6),
            new THREE.MeshLambertMaterial({ color: 0x553311 })
        );
        top.position.y = 0.4;
        g.add(top);
        for (const dx of [-0.5, 0.5]) {
            for (const dz of [-0.2, 0.2]) {
                const leg = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.04, 0.04, 0.4, 6),
                    new THREE.MeshLambertMaterial({ color: 0x222222 })
                );
                leg.position.set(dx, 0.2, dz);
                g.add(leg);
            }
        }
        return g;
    }

    function makeWaterCooler() {
        const g = new THREE.Group();
        const base = new THREE.Mesh(
            new THREE.BoxGeometry(0.5, 0.7, 0.5),
          new THREE.MeshLambertMaterial({ color: 0xcccccc })
        );
        base.position.y = 0.35;
        g.add(base);
        const jug = new THREE.Mesh(
            new THREE.CylinderGeometry(0.18, 0.18, 0.5, 12),
            new THREE.MeshLambertMaterial({ color: 0x88aaff, transparent: true, opacity: 0.7 })
        );
        jug.position.y = 0.95;
        g.add(jug);
        const tap = new THREE.Mesh(
            new THREE.BoxGeometry(0.15, 0.08, 0.08),
            new THREE.MeshLambertMaterial({ color: 0x222222 })
        );
        tap.position.set(0, 0.55, 0.27);
        g.add(tap);
        return g;
    }

    function makePlant() {
        const g = new THREE.Group();
        const pot = new THREE.Mesh(
            new THREE.CylinderGeometry(0.3, 0.25, 0.4, 10),
            new THREE.MeshLambertMaterial({ color: 0x884422 })
        );
        pot.position.y = 0.2;
        g.add(pot);
        const leaves = new THREE.Mesh(
            new THREE.ConeGeometry(0.5, 1.0, 8),
            new THREE.MeshLambertMaterial({ color: 0x338833 })
        );
        leaves.position.y = 0.9;
        g.add(leaves);
        return g;
    }

    function makeBistroTable() {
        const g = new THREE.Group();
        const top = new THREE.Mesh(
            new THREE.CylinderGeometry(0.45, 0.45, 0.05, 16),
            new THREE.MeshLambertMaterial({ color: 0x664422 })
        );
        top.position.y = 0.75;
        g.add(top);
        const leg = new THREE.Mesh(
            new THREE.CylinderGeometry(0.06, 0.06, 0.75, 8),
            new THREE.MeshLambertMaterial({ color: 0x222222 })
        );
        leg.position.y = 0.375;
        g.add(leg);
        return g;
    }

    function makeCounter() {
        const g = new THREE.Group();
        const base = new THREE.Mesh(
            new THREE.BoxGeometry(2.4, 0.9, 0.7),
            new THREE.MeshLambertMaterial({ color: 0x664422 })
        );
        base.position.y = 0.45;
        g.add(base);
        const top = new THREE.Mesh(
            new THREE.BoxGeometry(2.4, 0.08, 0.75),
            new THREE.MeshLambertMaterial({ color: 0x222222 })
        );
        top.position.y = 0.94;
        g.add(top);
        const machine = new THREE.Mesh(
            new THREE.BoxGeometry(0.5, 0.5, 0.4),
            new THREE.MeshLambertMaterial({ color: 0x444444 })
        );
        machine.position.set(-0.8, 1.2, 0);
        g.add(machine);
        const display = new THREE.Mesh(
            new THREE.BoxGeometry(0.7, 0.3, 0.4),
            new THREE.MeshLambertMaterial({ color: 0xddaa55 })
        );
        display.position.set(0.4, 1.15, 0);
        g.add(display);
        return g;
    }

    function makeKiosk() {
        const g = new THREE.Group();
        const stand = new THREE.Mesh(
            new THREE.CylinderGeometry(0.15, 0.15, 1.2, 8),
            new THREE.MeshLambertMaterial({ color: 0x444444 })
        );
        stand.position.y = 0.6;
        g.add(stand);
        const screen = new THREE.Mesh(
            new THREE.BoxGeometry(0.6, 0.4, 0.05),
            new THREE.MeshLambertMaterial({ color: 0x224488, emissive: 0x112244 })
        );
        screen.position.y = 1.4;
        g.add(screen);
        return g;
    }

    function makeReceptionDesk() {
        const g = new THREE.Group();
        const base = new THREE.Mesh(
            new THREE.BoxGeometry(2.0, 0.9, 0.5),
            new THREE.MeshLambertMaterial({ color: 0x553311 })
        );
        base.position.y = 0.45;
        g.add(base);
        const top = new THREE.Mesh(
            new THREE.BoxGeometry(2.0, 0.08, 0.55),
            new THREE.MeshLambertMaterial({ color: 0x222222 })
        );
        top.position.y = 0.94;
        g.add(top);
        return g;
    }

    function makeRoundTable() {
        const g = new THREE.Group();
        const top = new THREE.Mesh(
            new THREE.CylinderGeometry(0.6, 0.6, 0.05, 18),
            new THREE.MeshLambertMaterial({ color: 0x553311 })
        );
        top.position.y = 0.74;
        g.add(top);
        const leg = new THREE.Mesh(
            new THREE.CylinderGeometry(0.06, 0.06, 0.72, 8),
            new THREE.MeshLambertMaterial({ color: 0x222222 })
        );
        leg.position.y = 0.36;
        g.add(leg);
        return g;
    }

    function addTransparentBox(group, w, h, d, color, opacity) {
        const mat = new THREE.MeshLambertMaterial({
            color: color, transparent: true, opacity: opacity,
            depthWrite: false, side: THREE.DoubleSide
        });
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        m.renderOrder = 0;
        group.add(m);
        return m;
    }

    function addWallSegment(group, x, y, z, w, h, d, color, opacity) {
        const m = addTransparentBox(group, w, h, d, color, opacity);
        m.position.set(x, y, z);
        return m;
    }

    function buildBuildingShell(buildingGroup) {
        const FH = WORLD.FLOOR_HEIGHT;
        const FC = WORLD.FLOOR_COUNT;
        const totalH = FH * FC;
        const halfW = HALF_W;
        const halfD = HALF_D;

        const ground = new THREE.Mesh(
            new THREE.BoxGeometry(WORLD.BUILDING_WIDTH + 8, 0.2, WORLD.BUILDING_DEPTH + 8),
            new THREE.MeshLambertMaterial({ color: 0x555566 })
        );
        ground.position.y = -0.1;
        buildingGroup.add(ground);

        const sidewalk = new THREE.Mesh(
            new THREE.BoxGeometry(10, 0.15, 5),
            new THREE.MeshLambertMaterial({ color: 0xaaaaaa })
        );
        sidewalk.position.set(0, 0.075, 12);
        buildingGroup.add(sidewalk);

        const roof = new THREE.Mesh(
            new THREE.BoxGeometry(WORLD.BUILDING_WIDTH, 0.3, WORLD.BUILDING_DEPTH),
            new THREE.MeshLambertMaterial({ color: 0x444455 })
        );
        roof.position.y = totalH + 0.15;
        buildingGroup.add(roof);

        for (let f = 1; f < FC; f++) {
            const y = f * FH;
            const slabMat = new THREE.MeshLambertMaterial({
                color: 0xaaaaaa, transparent: true, opacity: 0.3,
                depthWrite: false, side: THREE.DoubleSide
            });
            const backH = (WORLD.BUILDING_DEPTH - WORLD.SHAFT_DEPTH) / 2;
            const frontH = backH;
            const sideW = (WORLD.BUILDING_WIDTH - WORLD.SHAFT_WIDTH) / 2;
            const stripT = 0.15;
            const halfStripT = stripT / 2;

            const front = new THREE.Mesh(
                new THREE.BoxGeometry(WORLD.BUILDING_WIDTH, stripT, frontH - halfStripT),
                slabMat
            );
            front.position.set(0, y, SHAFT_HD + (frontH - halfStripT) / 2);
            front.renderOrder = 0;
            buildingGroup.add(front);

            const back = new THREE.Mesh(
                new THREE.BoxGeometry(WORLD.BUILDING_WIDTH, stripT, backH - halfStripT),
                slabMat
            );
            back.position.set(0, y, -SHAFT_HD - (backH - halfStripT) / 2);
            back.renderOrder = 0;
            buildingGroup.add(back);

            const left = new THREE.Mesh(
                new THREE.BoxGeometry(sideW - halfStripT, stripT, WORLD.SHAFT_DEPTH),
                slabMat
            );
            left.position.set(-SHAFT_HW - (sideW - halfStripT) / 2, y, 0);
            left.renderOrder = 0;
            buildingGroup.add(left);

            const right = new THREE.Mesh(
                new THREE.BoxGeometry(sideW - halfStripT, stripT, WORLD.SHAFT_DEPTH),
                slabMat
            );
            right.position.set(SHAFT_HW + (sideW - halfStripT) / 2, y, 0);
            right.renderOrder = 0;
            buildingGroup.add(right);
        }

        const wallColor = 0x9999ff;
        const wallOp = 0.2;
        const wallT = 0.2;
        const buildingH = totalH;

        addWallSegment(buildingGroup, 0, buildingH / 2, -halfD - wallT / 2,
            WORLD.BUILDING_WIDTH, buildingH, wallT, wallColor, wallOp);
        addWallSegment(buildingGroup, -halfW - wallT / 2, buildingH / 2, 0,
            wallT, buildingH, WORLD.BUILDING_DEPTH, wallColor, wallOp);
        addWallSegment(buildingGroup, halfW + wallT / 2, buildingH / 2, 0,
            wallT, buildingH, WORLD.BUILDING_DEPTH, wallColor, wallOp);

        const frontSideH = FH * 1;
        const frontSideW = (WORLD.BUILDING_WIDTH - 3) / 2;
        addWallSegment(buildingGroup,
            -((3 / 2) + frontSideW / 2), frontSideH / 2, halfD + wallT / 2,
            frontSideW, frontSideH, wallT, wallColor, wallOp);
        addWallSegment(buildingGroup,
            ((3 / 2) + frontSideW / 2), frontSideH / 2, halfD + wallT / 2,
            frontSideW, frontSideH, wallT, wallColor, wallOp);
        const topFrontH = buildingH - frontSideH;
        addWallSegment(buildingGroup, 0, frontSideH + topFrontH / 2, halfD + wallT / 2,
            WORLD.BUILDING_WIDTH, topFrontH, wallT, wallColor, wallOp);

        const shaftMat = new THREE.MeshLambertMaterial({
            color: 0x222233, transparent: true, opacity: 0.7,
            depthWrite: false, side: THREE.DoubleSide
        });
        const shaftH = totalH;
        const shaftT = 0.1;
        const shaftBack = new THREE.Mesh(
            new THREE.BoxGeometry(WORLD.SHAFT_WIDTH, shaftH, shaftT), shaftMat
        );
        shaftBack.position.set(0, shaftH / 2, -SHAFT_HD);
        shaftBack.renderOrder = 0;
        buildingGroup.add(shaftBack);
        const shaftLeft = new THREE.Mesh(
            new THREE.BoxGeometry(shaftT, shaftH, WORLD.SHAFT_DEPTH), shaftMat
        );
        shaftLeft.position.set(-SHAFT_HW, shaftH / 2, 0);
        shaftLeft.renderOrder = 0;
        buildingGroup.add(shaftLeft);
        const shaftRight = new THREE.Mesh(
            new THREE.BoxGeometry(shaftT, shaftH, WORLD.SHAFT_DEPTH), shaftMat
        );
        shaftRight.position.set(SHAFT_HW, shaftH / 2, 0);
        shaftRight.renderOrder = 0;
        buildingGroup.add(shaftRight);
    }

    function addInteriorWallSegment(group, x1, z1, x2, z2, y, h, color, opacity) {
        const dx = x2 - x1;
        const dz = z2 - z1;
        const len = Math.sqrt(dx * dx + dz * dz);
        const cx = (x1 + x2) / 2;
        const cz = (z1 + z2) / 2;
        const t = 0.12;
        const m = new THREE.Mesh(
            new THREE.BoxGeometry(len, h, t),
            new THREE.MeshLambertMaterial({
                color: color, transparent: true, opacity: opacity,
                depthWrite: false, side: THREE.DoubleSide
            })
        );
        m.position.set(cx, y + h / 2, cz);
        m.rotation.y = -Math.atan2(dz, dx);
        m.renderOrder = 0;
        group.add(m);
        return m;
    }

    function addWallWithGap(group, x1, z1, x2, z2, y, h, gap, gapCenter, color, opacity) {
        const dx = x2 - x1;
        const dz = z2 - z1;
        const len = Math.sqrt(dx * dx + dz * dz);
        const ux = dx / len;
        const uz = dz / len;
        const leftEnd = gapCenter - gap / 2;
        const rightStart = gapCenter + gap / 2;
        if (leftEnd > 0) {
            const a1x = x1 + ux * 0; const a1z = z1 + uz * 0;
            const a2x = x1 + ux * leftEnd; const a2z = z1 + uz * leftEnd;
            addInteriorWallSegment(group, a1x, a1z, a2x, a2z, y, h, color, opacity);
        }
        if (rightStart < len) {
            const b1x = x1 + ux * rightStart; const b1z = z1 + uz * rightStart;
            const b2x = x1 + ux * len; const b2z = z1 + uz * len;
            addInteriorWallSegment(group, b1x, b1z, b2x, b2z, y, h, color, opacity);
        }
    }

    function buildOfficeFloor(floorNum, buildingGroup) {
        const FH = WORLD.FLOOR_HEIGHT;
        const y = floorNum * FH;
        const innerColor = 0xbbc5e6;
        const innerOp = 0.28;
        const h = FH * 0.9;
        const wallY = y;

        const backRoomZ1 = -HALL_Z;
        const backRoomZ2 = -HALF_D;
        const frontRoomZ1 = HALL_Z;
        const frontRoomZ2 = HALF_D;
        const sideLeftX = -HALF_W;
        const sideRightX = HALF_W;

        addWallWithGap(buildingGroup, sideLeftX, backRoomZ1, -HALL_X, backRoomZ1,
            wallY, h, 1.2, -9 + 0.5, innerColor, innerOp);
        addWallWithGap(buildingGroup, -HALL_X, backRoomZ1, -HALL_X, backRoomZ2,
            wallY, h, 1.2, -7, innerColor, innerOp);
        addWallWithGap(buildingGroup, -HALL_X, backRoomZ1, -HALL_X, backRoomZ2,
            wallY, h, 1.2, -5, innerColor, innerOp);
        addWallWithGap(buildingGroup, -HALL_X, backRoomZ1, -HALL_X, backRoomZ2,
            wallY, h, 1.2, -3, innerColor, innerOp);

        addWallWithGap(buildingGroup, HALL_X, backRoomZ1, sideRightX, backRoomZ1,
            wallY, h, 1.2, 9 - 0.5, innerColor, innerOp);
        addWallWithGap(buildingGroup, HALL_X, backRoomZ1, HALL_X, backRoomZ2,
            wallY, h, 1.2, -3, innerColor, innerOp);
        addWallWithGap(buildingGroup, HALL_X, backRoomZ1, HALL_X, backRoomZ2,
            wallY, h, 1.2, -5, innerColor, innerOp);
        addWallWithGap(buildingGroup, HALL_X, backRoomZ1, HALL_X, backRoomZ2,
            wallY, h, 1.2, -7, innerColor, innerOp);

        addWallWithGap(buildingGroup, sideLeftX, frontRoomZ1, -HALL_X, frontRoomZ1,
            wallY, h, 1.2, -7, innerColor, innerOp);
        addWallWithGap(buildingGroup, HALL_X, frontRoomZ1, sideRightX, frontRoomZ1,
            wallY, h, 1.2, 7, innerColor, innerOp);

        const nodes = {};
        const adj = {};
        function addNode(name, x, z) {
            nodes[name] = new THREE.Vector3(x, y, z);
            if (!adj[name]) adj[name] = [];
        }
        function addEdge(a, b) {
            if (adj[a].indexOf(b) === -1) adj[a].push(b);
            if (adj[b].indexOf(a) === -1) adj[b].push(a);
        }

        addNode("hallS", 0, HALL_Z);
        addNode("hallSE", HALL_X, HALL_Z);
        addNode("hallE", HALL_X, 0);
        addNode("hallNE", HALL_X, -HALL_Z);
        addNode("hallN", 0, -HALL_Z);
        addNode("hallNW", -HALL_X, -HALL_Z);
        addNode("hallW", -HALL_X, 0);
        addNode("hallSW", -HALL_X, HALL_Z);
        addNode("elevWait", 0, HALL_Z - 0.5);
        addEdge("hallS", "elevWait");

        addEdge("hallS", "hallSE");
        addEdge("hallSE", "hallE");
        addEdge("hallE", "hallNE");
        addEdge("hallNE", "hallN");
        addEdge("hallN", "hallNW");
        addEdge("hallNW", "hallW");
        addEdge("hallW", "hallSW");
        addEdge("hallSW", "hallS");

        addNode("officeA_door", -9, -HALL_Z);
        addNode("officeA_desk", -9, -HALF_D + 1.5);
        addEdge("officeA_door", "hallNW");
        addEdge("officeA_door", "officeA_desk");

        addNode("officeB_door", -5, -HALL_Z);
        addNode("officeB_desk", -5, -HALF_D + 1.5);
        addEdge("officeB_door", "hallN");
        addEdge("officeB_door", "officeB_desk");

        addNode("officeC_door", 5, -HALL_Z);
        addNode("officeC_desk", 5, -HALF_D + 1.5);
        addEdge("officeC_door", "hallN");
        addEdge("officeC_door", "officeC_desk");

        addNode("officeD_door", 9, -HALL_Z);
        addNode("officeD_desk", 9, -HALF_D + 1.5);
        addEdge("officeD_door", "hallNE");
        addEdge("officeD_door", "officeD_desk");

        addNode("conf_door", -7, HALL_Z);
        addNode("conf_center", -7, 5.5);
        addNode("conf_seat0", -7, 4);
        addNode("conf_seat1", -7, 7);
        addNode("conf_seat2", -6, 5.5);
        addNode("conf_seat3", -8, 5.5);
        addEdge("conf_door", "hallSW");
        addEdge("conf_door", "conf_center");
        addEdge("conf_center", "conf_seat0");
        addEdge("conf_center", "conf_seat1");
        addEdge("conf_center", "conf_seat2");
        addEdge("conf_center", "conf_seat3");

        addNode("lounge_door", 7, HALL_Z);
        addNode("lounge_center", 7, 5.5);
        addNode("lounge_spot0", 6.5, 4.5);
        addNode("lounge_spot1", 7.5, 4.5);
        addNode("lounge_spot2", 7, 7);
        addNode("lounge_spot3", 8.5, 6);
        addEdge("lounge_door", "hallSE");
        addEdge("lounge_door", "lounge_center");
        addEdge("lounge_center", "lounge_spot0");
        addEdge("lounge_center", "lounge_spot1");
        addEdge("lounge_center", "lounge_spot2");
        addEdge("lounge_center", "lounge_spot3");

        addNode("water_cooler", 8, 8);
        addEdge("water_cooler", "lounge_center");

        addNode("hall_stand_N", 1.5, -HALL_Z);
        addNode("hall_stand_S", -1.5, HALL_Z);
        addEdge("hall_stand_N", "hallN");
        addEdge("hall_stand_S", "hallS");

        _NAV_GRAPHS.push({ floorNumber: floorNum, nodes: nodes, adj: adj });

        const sitTargets = {};
        sitTargets["officeA_desk"] = { sit: true, facing: Math.PI };
        sitTargets["officeB_desk"] = { sit: true, facing: Math.PI };
        sitTargets["officeC_desk"] = { sit: true, facing: Math.PI };
        sitTargets["officeD_desk"] = { sit: true, facing: Math.PI };
        sitTargets["conf_seat0"] = { sit: true, facing: Math.PI / 2 };
        sitTargets["conf_seat1"] = { sit: true, facing: -Math.PI / 2 };
        sitTargets["conf_seat2"] = { sit: true, facing: Math.PI };
        sitTargets["conf_seat3"] = { sit: true, facing: 0 };
        sitTargets["lounge_spot0"] = { sit: true, facing: 0 };
        sitTargets["lounge_spot1"] = { sit: true, facing: 0 };
        sitTargets["lounge_spot2"] = { sit: true, facing: Math.PI };
        sitTargets["lounge_spot3"] = { sit: true, facing: -Math.PI / 2 };
        sitTargets["water_cooler"] = { sit: false, facing: -Math.PI / 2 };
        sitTargets["hall_stand_N"] = { sit: false, facing: Math.PI };
        sitTargets["hall_stand_S"] = { sit: false, facing: 0 };

        const desks = [
            { id: "A", workerIndex: null, doorWp: "officeA_door", deskWp: "officeA_desk" },
            { id: "B", workerIndex: null, doorWp: "officeB_door", deskWp: "officeB_desk" },
            { id: "C", workerIndex: null, doorWp: "officeC_door", deskWp: "officeC_desk" },
            { id: "D", workerIndex: null, doorWp: "officeD_door", deskWp: "officeD_desk" }
        ];

        const callPanel = makeCallPanel();
        callPanel.position.set(-HALL_X - 0.3, y + 1.4, 0);
        callPanel.rotation.y = Math.PI / 2;
        buildingGroup.add(callPanel);

        const shaftInd = makeShaftIndicator();
        shaftInd.position.set(0, y + FH * 0.85, HALL_Z - 0.06);
        shaftInd.rotation.y = Math.PI;
        buildingGroup.add(shaftInd);

        return { floorNumber: floorNum, nodes: nodes, callPanel: callPanel, shaftIndicator: shaftInd, desks: desks, sitTargets: sitTargets, isLobby: false };
    }

    function buildLobbyFloor(buildingGroup) {
        const FH = WORLD.FLOOR_HEIGHT;
        const y = 0;
        const innerColor = 0xbbc5e6;
        const innerOp = 0.28;
        const h = FH * 0.9;

        addWallWithGap(buildingGroup, -HALF_W, HALL_Z, -HALL_X, HALL_Z,
            y, h, 1.2, -7, innerColor, innerOp);
        addWallWithGap(buildingGroup, -HALL_X, HALL_Z, -HALL_X, HALF_D,
            y, h, 1.2, 5, innerColor, innerOp);
        addWallWithGap(buildingGroup, -HALL_X, HALL_Z, -HALL_X, -HALL_Z,
            y, h, 1.2, 0, innerColor, innerOp);
        addWallWithGap(buildingGroup, HALL_X, HALL_Z, HALF_W, HALL_Z,
            y, h, 1.2, 7, innerColor, innerOp);
        addWallWithGap(buildingGroup, HALL_X, HALL_Z, HALL_X, HALF_D,
            y, h, 1.2, 5, innerColor, innerOp);
        addWallWithGap(buildingGroup, HALL_X, HALL_Z, HALL_X, -HALL_Z,
            y, h, 1.2, 0, innerColor, innerOp);

        const nodes = {};
        const adj = {};
        function addNode(name, x, z) {
            nodes[name] = new THREE.Vector3(x, y, z);
            if (!adj[name]) adj[name] = [];
        }
        function addEdge(a, b) {
            if (adj[a].indexOf(b) === -1) adj[a].push(b);
            if (adj[b].indexOf(a) === -1) adj[b].push(a);
        }

        addNode("hallS", 0, HALL_Z);
        addNode("hallSE", HALL_X, HALL_Z);
        addNode("hallE", HALL_X, 0);
        addNode("hallNE", HALL_X, -HALL_Z);
        addNode("hallN", 0, -HALL_Z);
        addNode("hallNW", -HALL_X, -HALL_Z);
        addNode("hallW", -HALL_X, 0);
        addNode("hallSW", -HALL_X, HALL_Z);
        addNode("elevWait", 0, HALL_Z - 0.5);
        addEdge("hallS", "elevWait");
        addEdge("hallS", "hallSE");
        addEdge("hallSE", "hallE");
        addEdge("hallE", "hallNE");
        addEdge("hallNE", "hallN");
        addEdge("hallN", "hallNW");
        addEdge("hallNW", "hallW");
        addEdge("hallW", "hallSW");
        addEdge("hallSW", "hallS");

        addNode("entrance", 0, HALF_D + 0.5);
        addNode("outside", 0, 12);
        addEdge("entrance", "elevWait");
        addEdge("entrance", "outside");

        addNode("cafe_door", -7, HALL_Z);
        addNode("cafe_center", -7, 5.5);
        addNode("cafe_order", -9.4, 5.5);
        addNode("cafe_table0", -7, 4);
        addNode("cafe_table0_a", -7.5, 4);
        addNode("cafe_table0_b", -6.5, 4);
        addNode("cafe_table1", -5, 7);
        addNode("cafe_table1_a", -5.5, 7);
        addNode("cafe_table1_b", -4.5, 7);
        addNode("cafe_table2", -7, 7);
        addNode("cafe_table2_a", -7.5, 7);
        addNode("cafe_table2_b", -6.5, 7);
        addNode("cafe_table3", -5, 4);
        addNode("cafe_table3_a", -5.5, 4);
        addNode("cafe_table3_b", -4.5, 4);
        addEdge("cafe_door", "hallSW");
        addEdge("cafe_door", "cafe_center");
        addEdge("cafe_center", "cafe_order");
        addEdge("cafe_center", "cafe_table0");
        addEdge("cafe_center", "cafe_table1");
        addEdge("cafe_center", "cafe_table2");
        addEdge("cafe_center", "cafe_table3");
        addEdge("cafe_table0", "cafe_table0_a");
        addEdge("cafe_table0", "cafe_table0_b");
        addEdge("cafe_table1", "cafe_table1_a");
        addEdge("cafe_table1", "cafe_table1_b");
        addEdge("cafe_table2", "cafe_table2_a");
        addEdge("cafe_table2", "cafe_table2_b");
        addEdge("cafe_table3", "cafe_table3_a");
        addEdge("cafe_table3", "cafe_table3_b");

        addNode("front_lounge_door", 7, HALL_Z);
        addNode("front_lounge_center", 7, 5.5);
        addNode("front_lounge_spot0", 6.5, 4.5);
        addNode("front_lounge_spot1", 7.5, 4.5);
        addNode("front_lounge_spot2", 7, 7);
        addNode("front_lounge_spot3", 8.5, 6);
        addEdge("front_lounge_door", "hallSE");
        addEdge("front_lounge_door", "front_lounge_center");
        addEdge("front_lounge_center", "front_lounge_spot0");
        addEdge("front_lounge_center", "front_lounge_spot1");
        addEdge("front_lounge_center", "front_lounge_spot2");
        addEdge("front_lounge_center", "front_lounge_spot3");

        addNode("lobby_wc_front", 9, 4);
        addEdge("lobby_wc_front", "front_lounge_center");

        addNode("back_lounge_N", 0, -3);
        addNode("back_lounge_S", 0, -7);
        addNode("back_lounge_couch_N", 0, -2.2);
        addNode("back_lounge_couch_S", 0, -7.8);
        addNode("back_lounge_table", 0, -5);
        addEdge("back_lounge_couch_N", "back_lounge_table");
        addEdge("back_lounge_couch_S", "back_lounge_table");
        addEdge("back_lounge_N", "hallN");
        addEdge("back_lounge_S", "back_lounge_table");

        addNode("pit_N", -8, -4);
        addNode("pit_S", -8, -8);
        addNode("pit_E", -6.5, -6);
        addNode("pit_W", -9.5, -6);
        addNode("pit_table", -8, -6);
        addEdge("pit_N", "pit_table");
        addEdge("pit_S", "pit_table");
        addEdge("pit_E", "pit_table");
        addEdge("pit_W", "pit_table");
        addEdge("pit_N", "hallNW");

        addNode("lobby_wc_back", -4, -3);
        addEdge("lobby_wc_back", "hallNW");
        addNode("lobby_wc_back2", 4, -3);
        addEdge("lobby_wc_back2", "hallNE");

        addNode("reception", -2.5, 7);
        addNode("kiosk", 2, 8.5);

        addNode("lobby_stand_center", 0, 0);
        addNode("lobby_stand_NE", 2, -1.5);
        addNode("lobby_stand_NW", -2, -1.5);
        addNode("lobby_stand_midE", 2, 1);
        addNode("lobby_stand_midW", -2, 1);
        addNode("lobby_stand_entry", 0, 8);
        addEdge("lobby_stand_center", "hallN");
        addEdge("lobby_stand_NE", "hallNE");
        addEdge("lobby_stand_NW", "hallNW");
        addEdge("lobby_stand_midE", "hallE");
        addEdge("lobby_stand_midW", "hallW");
        addEdge("lobby_stand_entry", "entrance");
        addEdge("reception", "hallSW");
        addEdge("kiosk", "entrance");

        _NAV_GRAPHS.push({ floorNumber: 0, nodes: nodes, adj: adj });

        const sitTargets = {};
        sitTargets["cafe_table0_a"] = { sit: true, facing: Math.PI / 2 };
        sitTargets["cafe_table0_b"] = { sit: true, facing: -Math.PI / 2 };
        sitTargets["cafe_table1_a"] = { sit: true, facing: Math.PI / 2 };
        sitTargets["cafe_table1_b"] = { sit: true, facing: -Math.PI / 2 };
        sitTargets["cafe_table2_a"] = { sit: true, facing: Math.PI / 2 };
        sitTargets["cafe_table2_b"] = { sit: true, facing: -Math.PI / 2 };
        sitTargets["cafe_table3_a"] = { sit: true, facing: Math.PI / 2 };
        sitTargets["cafe_table3_b"] = { sit: true, facing: -Math.PI / 2 };
        sitTargets["cafe_order"] = { sit: false, facing: Math.PI / 2 };
        sitTargets["front_lounge_spot0"] = { sit: true, facing: 0 };
        sitTargets["front_lounge_spot1"] = { sit: true, facing: 0 };
        sitTargets["front_lounge_spot2"] = { sit: true, facing: Math.PI };
        sitTargets["front_lounge_spot3"] = { sit: true, facing: -Math.PI / 2 };
        sitTargets["back_lounge_N"] = { sit: true, facing: 0 };
        sitTargets["back_lounge_S"] = { sit: true, facing: Math.PI };
        sitTargets["pit_N"] = { sit: true, facing: 0 };
        sitTargets["pit_S"] = { sit: true, facing: Math.PI };
        sitTargets["pit_E"] = { sit: true, facing: -Math.PI / 2 };
        sitTargets["pit_W"] = { sit: true, facing: Math.PI / 2 };
        sitTargets["lobby_wc_front"] = { sit: false, facing: 0 };
        sitTargets["lobby_wc_back"] = { sit: false, facing: 0 };
        sitTargets["lobby_wc_back2"] = { sit: false, facing: 0 };
        sitTargets["reception"] = { sit: false, facing: Math.PI / 2 };
        sitTargets["kiosk"] = { sit: false, facing: 0 };
        sitTargets["lobby_stand_center"] = { sit: false, facing: 0 };
        sitTargets["lobby_stand_NE"] = { sit: false, facing: 0 };
        sitTargets["lobby_stand_NW"] = { sit: false, facing: 0 };
        sitTargets["lobby_stand_midE"] = { sit: false, facing: 0 };
        sitTargets["lobby_stand_midW"] = { sit: false, facing: 0 };
        sitTargets["lobby_stand_entry"] = { sit: false, facing: Math.PI };

        const callPanel = makeCallPanel();
        callPanel.position.set(-HALL_X - 0.3, y + 1.4, 0);
        callPanel.rotation.y = Math.PI / 2;
        buildingGroup.add(callPanel);

        const shaftInd = makeShaftIndicator();
        shaftInd.position.set(0, y + FH * 0.85, HALL_Z - 0.06);
        shaftInd.rotation.y = Math.PI;
        buildingGroup.add(shaftInd);

        return {
            floorNumber: 0, nodes: nodes, callPanel: callPanel, shaftIndicator: shaftInd,
            sitTargets: sitTargets, isLobby: true
        };
    }

    function populateOfficeFurniture(floorData, buildingGroup) {
        const FH = WORLD.FLOOR_HEIGHT;
        const y = floorData.floorNumber * FH;

        const offices = [
            { x: -9, id: "A" },
            { x: -5, id: "B" },
            { x: 5, id: "C" },
            { x: 9, id: "D" }
        ];
        for (const off of offices) {
            const desk = makeDesk();
            desk.position.set(off.x, y, -HALF_D + 1.0);
            buildingGroup.add(desk);
            const chair = makeChair();
            chair.position.set(off.x, y, -HALF_D + 2.4);
            chair.rotation.y = Math.PI;
            buildingGroup.add(chair);
        }

        const confTable = new THREE.Mesh(
            new THREE.BoxGeometry(4.5, 0.08, 1.2),
            new THREE.MeshLambertMaterial({ color: 0x553311 })
        );
        confTable.position.set(-7, y + 0.75, 5.5);
        buildingGroup.add(confTable);
        for (const dx of [-2, 2]) {
            for (const dz of [-0.5, 0.5]) {
                const leg = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.05, 0.05, 0.75, 6),
                    new THREE.MeshLambertMaterial({ color: 0x222222 })
                );
                leg.position.set(-7 + dx, y + 0.375, 5.5 + dz);
                buildingGroup.add(leg);
            }
        }
        const confChairs = [
            { x: -7, z: 4.5, fy: Math.PI / 2 },
            { x: -7, z: 6.5, fy: -Math.PI / 2 },
            { x: -8, z: 5.5, fy: 0 },
            { x: -6, z: 5.5, fy: Math.PI }
        ];
        for (const c of confChairs) {
            const chair = makeChair();
            chair.position.set(c.x, y, c.z);
            chair.rotation.y = c.fy;
            buildingGroup.add(chair);
        }

        const couch = makeCouch(0x4477aa);
        couch.position.set(6.5, y, 4);
        couch.rotation.y = Math.PI / 2;
        buildingGroup.add(couch);
        const couch2 = makeCouch(0x4477aa);
        couch2.position.set(8.5, y, 6);
        couch2.rotation.y = 0;
        buildingGroup.add(couch2);
        const arm1 = makeArmchair(0xaa6644);
        arm1.position.set(7.5, y, 7.5);
        buildingGroup.add(arm1);
        const arm2 = makeArmchair(0xaa6644);
        arm2.position.set(5, y, 7.5);
        buildingGroup.add(arm2);
        const ct = makeCoffeeTable();
        ct.position.set(7, y, 5.5);
        buildingGroup.add(ct);
        const wc = makeWaterCooler();
        wc.position.set(9, y, 8);
        buildingGroup.add(wc);
    }

    function populateLobbyFurniture(buildingGroup) {
        const y = 0;

        const counter = makeCounter();
        counter.position.set(-9.5, y, 5.5);
        counter.rotation.y = -Math.PI / 2;
        buildingGroup.add(counter);
        const tablePositions = [
            { x: -7, z: 4, ry: 0 },
            { x: -5, z: 7, ry: 0 },
            { x: -7, z: 7, ry: 0 },
            { x: -5, z: 4, ry: 0 }
        ];
        for (const t of tablePositions) {
            const tab = makeBistroTable();
            tab.position.set(t.x, y, t.z);
            tab.rotation.y = t.ry;
            buildingGroup.add(tab);
            for (const dx of [-0.7, 0.7]) {
                const ch = makeChair();
                ch.position.set(t.x + dx, y, t.z);
                ch.rotation.y = 0;
                buildingGroup.add(ch);
            }
        }

        const fc1 = makeCouch(0x4477aa);
        fc1.position.set(6.5, y, 4.5);
        fc1.rotation.y = Math.PI / 2;
        buildingGroup.add(fc1);
        const fc2 = makeArmchair(0xaa6644);
        fc2.position.set(7.5, y, 7);
        buildingGroup.add(fc2);
        const fc3 = makeArmchair(0xaa6644);
        fc3.position.set(8.5, y, 6);
        buildingGroup.add(fc3);
        const fcTab = makeCoffeeTable();
        fcTab.position.set(7, y, 5.5);
        buildingGroup.add(fcTab);
        const fcWC = makeWaterCooler();
        fcWC.position.set(9, y, 4);
        buildingGroup.add(fcWC);

        const blN = makeCouch(0x996633);
        blN.position.set(0, y, -2.5);
        blN.rotation.y = Math.PI;
        buildingGroup.add(blN);
        const blS = makeCouch(0x996633);
        blS.position.set(0, y, -7.5);
        blS.rotation.y = 0;
        buildingGroup.add(blS);
        const blT = makeCoffeeTable();
        blT.position.set(0, y, -5);
        buildingGroup.add(blT);

        const pt = makeRoundTable();
        pt.position.set(-8, y, -6);
        buildingGroup.add(pt);
        const pitPositions = [
            { x: -8, z: -4, fy: Math.PI },
            { x: -8, z: -8, fy: 0 },
            { x: -6.5, z: -6, fy: -Math.PI / 2 },
            { x: -9.5, z: -6, fy: Math.PI / 2 }
        ];
        for (const p of pitPositions) {
            const ac = makeArmchair(0x774488);
            ac.position.set(p.x, y, p.z);
            ac.rotation.y = p.fy;
            buildingGroup.add(ac);
        }

        const rdesk = makeReceptionDesk();
        rdesk.position.set(-3, y, 7);
        rdesk.rotation.y = Math.PI / 2;
        buildingGroup.add(rdesk);
        const kios = makeKiosk();
        kios.position.set(2, y, 8.5);
        buildingGroup.add(kios);

        const wc1 = makeWaterCooler();
        wc1.position.set(-4, y, -3);
        buildingGroup.add(wc1);
        const wc2 = makeWaterCooler();
        wc2.position.set(4, y, -3);
        buildingGroup.add(wc2);

        const plant1 = makePlant();
        plant1.position.set(-1.2, y, HALF_D - 0.3);
        buildingGroup.add(plant1);
        const plant2 = makePlant();
        plant2.position.set(1.2, y, HALF_D - 0.3);
        buildingGroup.add(plant2);
        const plant3 = makePlant();
        plant3.position.set(-10.3, y, -1);
        buildingGroup.add(plant3);
    }

    function bfsPath(nodes, fromName, toName) {
        if (!nodes || !nodes[fromName] || !nodes[toName]) return null;
        if (fromName === toName) return [nodes[fromName].clone()];

        const y = nodes[fromName].y;
        let graph = null;
        for (const g of _NAV_GRAPHS) {
            if (Math.abs(g.nodes[fromName].y - y) < 0.1) {
                graph = g;
                break;
            }
        }
        if (!graph) return null;

        const adj = graph.adj;
        const prev = {};
        const visited = new Set([fromName]);
        const queue = [fromName];
        prev[fromName] = null;
        while (queue.length > 0) {
            const cur = queue.shift();
            if (cur === toName) break;
            for (const nb of (adj[cur] || [])) {
                if (!visited.has(nb)) {
                    visited.add(nb);
                    prev[nb] = cur;
                    queue.push(nb);
                }
            }
        }
        if (!visited.has(toName)) return null;

        const path = [];
        let cur = toName;
        while (cur != null) {
            path.push(graph.nodes[cur].clone());
            cur = prev[cur];
        }
        path.reverse();
        return path;
    }

    function createWorld(scene) {
        _NAV_GRAPHS.length = 0;
        const buildingGroup = new THREE.Group();
        buildingGroup.renderOrder = 0;
        scene.add(buildingGroup);

        buildBuildingShell(buildingGroup);

        const floors = [];
        const lobby = buildLobbyFloor(buildingGroup);
        populateLobbyFurniture(buildingGroup);
        floors.push(lobby);
        for (let f = 1; f < WORLD.FLOOR_COUNT; f++) {
            const fdat = buildOfficeFloor(f, buildingGroup);
            populateOfficeFurniture(fdat, buildingGroup);
            floors.push(fdat);
        }

        return { buildingGroup: buildingGroup, floors: floors, bfsPath: bfsPath };
    }

    root.WORLD = WORLD;
    root.createWorld = createWorld;
    root.bfsPath = bfsPath;
    root.makeTextMaterial = makeTextMaterial;
    root.setIndicatorText = setIndicatorText;
})(typeof window !== "undefined" ? window : globalThis);
