var WORLD = {
    FLOOR_HEIGHT: 3.4,
    FLOOR_COUNT: 6,
    BUILDING_WIDTH: 22,
    BUILDING_DEPTH: 18,
    SHAFT_WIDTH: 3,
    SHAFT_DEPTH: 3,
    PERSON_R: 0.4
};

var semiTransparentGrayMat = new THREE.MeshLambertMaterial({
    color: 0x888888,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
    side: THREE.DoubleSide
});

var semiTransparentBlueMat = new THREE.MeshLambertMaterial({
    color: 0x9999ff,
    transparent: true,
    opacity: 0.2,
    depthWrite: false,
    side: THREE.DoubleSide
});

var interiorWallMat = new THREE.MeshLambertMaterial({
    color: 0xbbc5e6,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
    side: THREE.DoubleSide
});

var solidGrayMat = new THREE.MeshLambertMaterial({ color: 0x666666 });
var concreteMat = new THREE.MeshLambertMaterial({ color: 0x888888 });

function createWorld(scene) {
    var buildingGroup = new THREE.Group();
    buildingGroup.renderOrder = 0;

    var floorGroups = [];
    var allNodes = {};
    var sitTargets = {};
    var confSeatReservations = {};

    function makeTextTexture(text) {
        var canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#050505';
        ctx.fillRect(0, 0, 256, 256);
        ctx.fillStyle = '#ffbb22';
        ctx.font = 'bold 200px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = '#ffbb22';
        ctx.shadowBlur = 20;
        ctx.fillText(text, 128, 140);
        var tex = new THREE.CanvasTexture(canvas);
        tex._lastText = text;
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        return tex;
    }

    function updateTextTexture(tex, text) {
        if (tex._lastText === text) return;
        tex._lastText = text;
        var canvas = tex.image;
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#050505';
        ctx.fillRect(0, 0, 256, 256);
        ctx.fillStyle = '#ffbb22';
        ctx.font = 'bold 200px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = '#ffbb22';
        ctx.shadowBlur = 20;
        ctx.fillText(text, 128, 140);
        tex.needsUpdate = true;
    }

    function createCallPanel() {
        var group = new THREE.Group();
        var plate = new THREE.Mesh(
            new THREE.BoxGeometry(0.55, 1.4, 0.05),
            new THREE.MeshLambertMaterial({ color: 0x333333, transparent: true, opacity: 0.9 })
        );
        group.add(plate);

        var upGeo = new THREE.ShapeGeometry();
        upGeo.moveTo(0, 0.2);
        upGeo.lineTo(-0.13, 0);
        upGeo.lineTo(0.13, 0);
        upGeo.closePath();

        var downGeo = new THREE.ShapeGeometry();
        downGeo.moveTo(0, -0.2);
        downGeo.lineTo(-0.13, 0);
        downGeo.lineTo(0.13, 0);
        downGeo.closePath();

        var unlitMat = new THREE.MeshLambertMaterial({ color: 0x444444 });
        var litMat = new THREE.MeshBasicMaterial({ color: 0x00ff44 });

        var upMesh = new THREE.Mesh(upGeo, unlitMat);
        upMesh.position.set(0, 0.35, 0.03);
        group.add(upMesh);

        var downMesh = new THREE.Mesh(downGeo, unlitMat);
        downMesh.position.set(0, -0.35, 0.03);
        group.add(downMesh);

        var indCanvas = document.createElement('canvas');
        indCanvas.width = 256;
        indCanvas.height = 256;
        var indTex = new THREE.CanvasTexture(indCanvas);
        indTex.minFilter = THREE.LinearFilter;
        indTex.magFilter = THREE.LinearFilter;
        var indPlane = new THREE.Mesh(
            new THREE.PlaneGeometry(0.45, 0.45),
            indTex
        );
        indPlane.position.set(0, 0, 0.03);
        group.add(indPlane);

        group.userData.upMesh = upMesh;
        group.userData.downMesh = downMesh;
        group.userData.indTex = indTex;
        group.userData.unlitMat = unlitMat;
        group.userData.litMat = litMat;

        group.userData.setUp = function(on) {
            upMesh.material = on ? litMat : unlitMat;
        };
        group.userData.setDown = function(on) {
            downMesh.material = on ? litMat : unlitMat;
        };
        group.userData.setIndicator = function(text) {
            updateTextTexture(indTex, text);
        };

        return group;
    }

    function createShaftIndicator(size) {
        size = size || 0.9;
        var indCanvas = document.createElement('canvas');
        indCanvas.width = 256;
        indCanvas.height = 256;
        var indTex = new THREE.CanvasTexture(indCanvas);
        indTex.minFilter = THREE.LinearFilter;
        indTex.magFilter = THREE.LinearFilter;
        var indPlane = new THREE.Mesh(
            new THREE.PlaneGeometry(size, size),
            indTex
        );
        indPlane.renderOrder = 1;
        indPlane.userData.indTex = indTex;
        indPlane.userData.setIndicator = function(text) {
            updateTextTexture(indTex, text);
        };
        return indPlane;
    }

    function addWaypoint(nodes, name, x, y, z) {
        nodes[name] = new THREE.Vector3(x, y, z);
        allNodes[name] = { x: x, y: y, z: z, floor: Math.round(y / WORLD.FLOOR_HEIGHT) };
    }

    function addSitTarget(sitTargets, name, sit, facingX, facingZ) {
        sitTargets[name] = { sit: sit, facing: new THREE.Euler(0, Math.atan2(facingX, facingZ), 0) };
    }

    function buildFloorSlabs(floorNum, group) {
        var y = floorNum * WORLD.FLOOR_HEIGHT;
        var hw = WORLD.BUILDING_WIDTH / 2;
        var hd = WORLD.BUILDING_DEPTH / 2;
        var sw = WORLD.SHAFT_WIDTH / 2;
        var sd = WORLD.SHAFT_DEPTH / 2;

        var slab = new THREE.Mesh(
            new THREE.BoxGeometry(WORLD.BUILDING_WIDTH, 0.15, WORLD.BUILDING_DEPTH),
            semiTransparentGrayMat
        );
        slab.position.y = y;
        group.add(slab);
    }

    function buildOuterWalls(group) {
        var hw = WORLD.BUILDING_WIDTH / 2;
        var hd = WORLD.BUILDING_DEPTH / 2;
        var fh = WORLD.FLOOR_HEIGHT;
        var sw = WORLD.SHAFT_WIDTH / 2;
        var sd = WORLD.SHAFT_DEPTH / 2;
        var totalH = WORLD.FLOOR_COUNT * fh;

        var backWallLeft = new THREE.Mesh(
            new THREE.BoxGeometry(hw - sd, totalH, 0.15),
            semiTransparentBlueMat
        );
        backWallLeft.position.set(-hw / 2 - sd / 2, totalH / 2, -hd);
        group.add(backWallLeft);

        var backWallRight = new THREE.Mesh(
            new THREE.BoxGeometry(hw - sd, totalH, 0.15),
            semiTransparentBlueMat
        );
        backWallRight.position.set(hw / 2 + sd / 2, totalH / 2, -hd);
        group.add(backWallRight);

        var backWallCenter = new THREE.Mesh(
            new THREE.BoxGeometry(WORLD.SHAFT_WIDTH, totalH, 0.15),
            semiTransparentBlueMat
        );
        backWallCenter.position.set(0, totalH / 2, -hd);
        group.add(backWallCenter);

        var sideWallLeft = new THREE.Mesh(
            new THREE.BoxGeometry(0.15, totalH, WORLD.BUILDING_DEPTH),
            semiTransparentBlueMat
        );
        sideWallLeft.position.set(-hw, totalH / 2, 0);
        group.add(sideWallLeft);

        var sideWallRight = new THREE.Mesh(
            new THREE.BoxGeometry(0.15, totalH, WORLD.BUILDING_DEPTH),
            semiTransparentBlueMat
        );
        sideWallRight.position.set(hw, totalH / 2, 0);
        group.add(sideWallRight);

        var sideWallBack = new THREE.Mesh(
            new THREE.BoxGeometry(0.15, totalH, hd - sd),
            semiTransparentBlueMat
        );
        sideWallBack.position.set(0, totalH / 2, -hd - (hd - sd) / 2);
        group.add(sideWallBack);

        var frontLeftPanel = new THREE.Mesh(
            new THREE.BoxGeometry(hw - 1.5, totalH, 0.15),
            semiTransparentBlueMat
        );
        frontLeftPanel.position.set(-hw / 2 - 0.75, totalH / 2, hd);
        group.add(frontLeftPanel);

        var frontRightPanel = new THREE.Mesh(
            new THREE.BoxGeometry(hw - 1.5, totalH, 0.15),
            semiTransparentBlueMat
        );
        frontRightPanel.position.set(hw / 2 + 0.75, totalH / 2, hd);
        group.add(frontRightPanel);

        var frontTopPanel = new THREE.Mesh(
            new THREE.BoxGeometry(WORLD.SHAFT_WIDTH, totalH - fh * 1.5, 0.15),
            semiTransparentBlueMat
        );
        frontTopPanel.position.set(0, fh * 1.5 + (totalH - fh * 1.5) / 2, hd);
        group.add(frontTopPanel);
    }

    function buildInteriorWallsOffice(group, floorNum) {
        var y = floorNum * WORLD.FLOOR_HEIGHT;
        var hw = WORLD.BUILDING_WIDTH / 2;
        var hd = WORLD.BUILDING_DEPTH / 2;

        var officeAX = -hw + 2.5;
        var officeBX = -hw + 7.5;
        var officeCX = hw - 7.5;
        var officeDX = hw - 2.5;

        for (var o = 0; o < 4; o++) {
            var ox = [officeAX, officeBX, officeCX, officeDX][o];
            var wallZ = -8.5;

            if (o < 2) {
                var leftWall = new THREE.Mesh(
                    new THREE.BoxGeometry(0.1, 2.4, 0.1),
                    interiorWallMat
                );
                leftWall.position.set(ox, y + 1.2, wallZ + 2.5);
                group.add(leftWall);

                var rightWall = new THREE.Mesh(
                    new THREE.BoxGeometry(0.1, 2.4, 0.1),
                    interiorWallMat
                );
                rightWall.position.set(ox + 3.5, y + 1.2, wallZ + 2.5);
                group.add(rightWall);

                var backWall = new THREE.Mesh(
                    new THREE.BoxGeometry(3.6, 2.4, 0.1),
                    interiorWallMat
                );
                backWall.position.set(ox + 1.75, y + 1.2, wallZ + 4.8);
                group.add(backWall);
            } else {
                var leftWall = new THREE.Mesh(
                    new THREE.BoxGeometry(0.1, 2.4, 0.1),
                    interiorWallMat
                );
                leftWall.position.set(ox, y + 1.2, wallZ + 2.5);
                group.add(leftWall);

                var rightWall = new THREE.Mesh(
                    new THREE.BoxGeometry(0.1, 2.4, 0.1),
                    interiorWallMat
                );
                rightWall.position.set(ox + 3.5, y + 1.2, wallZ + 2.5);
                group.add(rightWall);

                var backWall = new THREE.Mesh(
                    new THREE.BoxGeometry(3.6, 2.4, 0.1),
                    interiorWallMat
                );
                backWall.position.set(ox + 1.75, y + 1.2, wallZ + 4.8);
                group.add(backWall);
            }
        }

        var confLeftX = -10;
        var confRightX = -3;
        var confFrontZ = 3;
        var confBackZ = 9;

        var confLeft = new THREE.Mesh(
            new THREE.BoxGeometry(0.1, 2.4, 6),
            interiorWallMat
        );
        confLeft.position.set(confLeftX, y + 1.2, (confFrontZ + confBackZ) / 2);
        group.add(confLeft);

        var confRight = new THREE.Mesh(
            new THREE.BoxGeometry(0.1, 2.4, 6),
            interiorWallMat
        );
        confRight.position.set(confRightX, y + 1.2, (confFrontZ + confBackZ) / 2);
        group.add(confRight);

        var confBack = new THREE.Mesh(
            new THREE.BoxGeometry(7.1, 2.4, 0.1),
            interiorWallMat
        );
        confBack.position.set((confLeftX + confRightX) / 2, y + 1.2, confBackZ);
        group.add(confBack);

        var loungeLeftX = 3;
        var loungeRightX = 11;
        var loungeFrontZ = 3;
        var loungeBackZ = 9;

        var loungeLeft = new THREE.Mesh(
            new THREE.BoxGeometry(0.1, 2.4, 6),
            interiorWallMat
        );
        loungeLeft.position.set(loungeLeftX, y + 1.2, (loungeFrontZ + loungeBackZ) / 2);
        group.add(loungeLeft);

        var loungeRight = new THREE.Mesh(
            new THREE.BoxGeometry(0.1, 2.4, 6),
            interiorWallMat
        );
        loungeRight.position.set(loungeRightX, y + 1.2, (loungeFrontZ + loungeBackZ) / 2);
        group.add(loungeRight);

        var loungeBack = new THREE.Mesh(
            new THREE.BoxGeometry(7.1, 2.4, 0.1),
            interiorWallMat
        );
        loungeBack.position.set((loungeLeftX + loungeRightX) / 2, y + 1.2, loungeBackZ);
        group.add(loungeBack);
    }

    function createDesk(group, x, y, z, rotY) {
        rotY = rotY || 0;
        var deskTop = new THREE.Mesh(
            new THREE.BoxGeometry(1.4, 0.06, 0.7),
            new THREE.MeshLambertMaterial({ color: 0x886644 })
        );
        deskTop.position.set(x, y + 0.75, z);
        deskTop.rotation.y = rotY;
        group.add(deskTop);

        var monitor = new THREE.Mesh(
            new THREE.BoxGeometry(0.5, 0.4, 0.05),
            new THREE.MeshLambertMaterial({ color: 0x222222 })
        );
        var monitorX = x + Math.sin(rotY) * 0.35;
        var monitorZ = z + Math.cos(rotY) * 0.35;
        monitor.position.set(monitorX, y + 1.0, monitorZ);
        monitor.rotation.y = rotY;
        group.add(monitor);

        var leg1 = new THREE.Mesh(
            new THREE.BoxGeometry(0.05, 0.72, 0.05),
            new THREE.MeshLambertMaterial({ color: 0x444444 })
        );
        leg1.position.set(x - 0.6, y + 0.36, z - 0.25);
        group.add(leg1);

        var leg2 = new THREE.Mesh(
            new THREE.BoxGeometry(0.05, 0.72, 0.05),
            new THREE.MeshLambertMaterial({ color: 0x444444 })
        );
        leg2.position.set(x + 0.6, y + 0.36, z - 0.25);
        group.add(leg2);

        var leg3 = new THREE.Mesh(
            new THREE.BoxGeometry(0.05, 0.72, 0.05),
            new THREE.MeshLambertMaterial({ color: 0x444444 })
        );
        leg3.position.set(x - 0.6, y + 0.36, z + 0.25);
        group.add(leg3);

        var leg4 = new THREE.Mesh(
            new THREE.BoxGeometry(0.05, 0.72, 0.05),
            new THREE.MeshLambertMaterial({ color: 0x444444 })
        );
        leg4.position.set(x + 0.6, y + 0.36, z + 0.25);
        group.add(leg4);
    }

    function createChair(group, x, y, z, rotY) {
        rotY = rotY || 0;
        var seat = new THREE.Mesh(
            new THREE.BoxGeometry(0.5, 0.08, 0.5),
            new THREE.MeshLambertMaterial({ color: 0x445566 })
        );
        seat.position.set(x, y + 0.45, z);
        seat.rotation.y = rotY;
        group.add(seat);

        var back = new THREE.Mesh(
            new THREE.BoxGeometry(0.5, 0.5, 0.08),
            new THREE.MeshLambertMaterial({ color: 0x445566 })
        );
        var backX = x + Math.sin(rotY) * 0.25;
        var backZ = z + Math.cos(rotY) * 0.25;
        back.position.set(backX, y + 0.75, backZ);
        back.rotation.y = rotY;
        group.add(back);

        var leg1 = new THREE.Mesh(
            new THREE.BoxGeometry(0.04, 0.42, 0.04),
            new THREE.MeshLambertMaterial({ color: 0x333333 })
        );
        leg1.position.set(x - 0.18, y + 0.21, z - 0.18);
        group.add(leg1);

        var leg2 = new THREE.Mesh(
            new THREE.BoxGeometry(0.04, 0.42, 0.04),
            new THREE.MeshLambertMaterial({ color: 0x333333 })
        );
        leg2.position.set(x + 0.18, y + 0.21, z - 0.18);
        group.add(leg2);

        var leg3 = new THREE.Mesh(
            new THREE.BoxGeometry(0.04, 0.42, 0.04),
            new THREE.MeshLambertMaterial({ color: 0x333333 })
        );
        leg3.position.set(x - 0.18, y + 0.21, z + 0.18);
        group.add(leg3);

        var leg4 = new THREE.Mesh(
            new THREE.BoxGeometry(0.04, 0.42, 0.04),
            new THREE.MeshLambertMaterial({ color: 0x333333 })
        );
        leg4.position.set(x + 0.18, y + 0.21, z + 0.18);
        group.add(leg4);
    }

    function createCouch(group, x, y, z, rotY) {
        rotY = rotY || 0;
        var base = new THREE.Mesh(
            new THREE.BoxGeometry(2.0, 0.4, 0.8),
            new THREE.MeshLambertMaterial({ color: 0x556677 })
        );
        base.position.set(x, y + 0.2, z);
        base.rotation.y = rotY;
        group.add(base);

        var back = new THREE.Mesh(
            new THREE.BoxGeometry(2.0, 0.5, 0.15),
            new THREE.MeshLambertMaterial({ color: 0x556677 })
        );
        var backX = x + Math.sin(rotY) * 0.4;
        var backZ = z + Math.cos(rotY) * 0.4;
        back.position.set(backX, y + 0.55, backZ);
        back.rotation.y = rotY;
        group.add(back);

        var arm1 = new THREE.Mesh(
            new THREE.BoxGeometry(0.15, 0.35, 0.8),
            new THREE.MeshLambertMaterial({ color: 0x556677 })
        );
        var arm1X = x + Math.cos(rotY) * 0.4;
        var arm1Z = z - Math.sin(rotY) * 0.4;
        arm1.position.set(arm1X, y + 0.47, arm1Z);
        arm1.rotation.y = rotY;
        group.add(arm1);

        var arm2 = new THREE.Mesh(
            new THREE.BoxGeometry(0.15, 0.35, 0.8),
            new THREE.MeshLambertMaterial({ color: 0x556677 })
        );
        var arm2X = x - Math.cos(rotY) * 0.4;
        var arm2Z = z + Math.sin(rotY) * 0.4;
        arm2.position.set(arm2X, y + 0.47, arm2Z);
        arm2.rotation.y = rotY;
        group.add(arm2);
    }

    function createArmchair(group, x, y, z, rotY) {
        rotY = rotY || 0;
        var base = new THREE.Mesh(
            new THREE.BoxGeometry(0.7, 0.35, 0.7),
            new THREE.MeshLambertMaterial({ color: 0x667788 })
        );
        base.position.set(x, y + 0.175, z);
        base.rotation.y = rotY;
        group.add(base);

        var back = new THREE.Mesh(
            new THREE.BoxGeometry(0.7, 0.5, 0.12),
            new THREE.MeshLambertMaterial({ color: 0x667788 })
        );
        var backX = x + Math.sin(rotY) * 0.35;
        var backZ = z + Math.cos(rotY) * 0.35;
        back.position.set(backX, y + 0.5, backZ);
        back.rotation.y = rotY;
        group.add(back);

        var arm1 = new THREE.Mesh(
            new THREE.BoxGeometry(0.12, 0.3, 0.7),
            new THREE.MeshLambertMaterial({ color: 0x667788 })
        );
        var arm1X = x + Math.cos(rotY) * 0.35;
        var arm1Z = z - Math.sin(rotY) * 0.35;
        arm1.position.set(arm1X, y + 0.4, arm1Z);
        arm1.rotation.y = rotY;
        group.add(arm1);

        var arm2 = new THREE.Mesh(
            new THREE.BoxGeometry(0.12, 0.3, 0.7),
            new THREE.MeshLambertMaterial({ color: 0x667788 })
        );
        var arm2X = x - Math.cos(rotY) * 0.35;
        var arm2Z = z + Math.sin(rotY) * 0.35;
        arm2.position.set(arm2X, y + 0.4, arm2Z);
        arm2.rotation.y = rotY;
        group.add(arm2);
    }

    function createCoffeeTable(group, x, y, z, rotY) {
        rotY = rotY || 0;
        var top = new THREE.Mesh(
            new THREE.BoxGeometry(1.0, 0.05, 0.6),
            new THREE.MeshLambertMaterial({ color: 0x554433 })
        );
        top.position.set(x, y + 0.4, z);
        top.rotation.y = rotY;
        group.add(top);

        var leg1 = new THREE.Mesh(
            new THREE.BoxGeometry(0.06, 0.38, 0.06),
            new THREE.MeshLambertMaterial({ color: 0x333333 })
        );
        leg1.position.set(x - 0.4, y + 0.19, z - 0.2);
        group.add(leg1);

        var leg2 = new THREE.Mesh(
            new THREE.BoxGeometry(0.06, 0.38, 0.06),
            new THREE.MeshLambertMaterial({ color: 0x333333 })
        );
        leg2.position.set(x + 0.4, y + 0.19, z - 0.2);
        group.add(leg2);

        var leg3 = new THREE.Mesh(
            new THREE.BoxGeometry(0.06, 0.38, 0.06),
            new THREE.MeshLambertMaterial({ color: 0x333333 })
        );
        leg3.position.set(x - 0.4, y + 0.19, z + 0.2);
        group.add(leg3);

        var leg4 = new THREE.Mesh(
            new THREE.BoxGeometry(0.06, 0.38, 0.06),
            new THREE.MeshLambertMaterial({ color: 0x333333 })
        );
        leg4.position.set(x + 0.4, y + 0.19, z + 0.2);
        group.add(leg4);
    }

    function createWaterCooler(group, x, y, z) {
        var base = new THREE.Mesh(
            new THREE.BoxGeometry(0.4, 1.0, 0.4),
            new THREE.MeshLambertMaterial({ color: 0x88aacc })
        );
        base.position.set(x, y + 0.5, z);
        group.add(base);

        var bottle = new THREE.Mesh(
            new THREE.CylinderGeometry(0.12, 0.12, 0.5, 8),
            new THREE.MeshLambertMaterial({ color: 0x88ccff })
        );
        bottle.position.set(x, y + 1.25, z);
        group.add(bottle);
    }

    function createBistroTable(group, x, y, z) {
        var top = new THREE.Mesh(
            new THREE.CylinderGeometry(0.4, 0.4, 0.05, 12),
            new THREE.MeshLambertMaterial({ color: 0x554433 })
        );
        top.position.set(x, y + 0.7, z);
        group.add(top);

        var pole = new THREE.Mesh(
            new THREE.CylinderGeometry(0.04, 0.04, 0.65, 8),
            new THREE.MeshLambertMaterial({ color: 0x333333 })
        );
        pole.position.set(x, y + 0.325, z);
        group.add(pole);

        var base = new THREE.Mesh(
            new THREE.CylinderGeometry(0.25, 0.25, 0.05, 12),
            new THREE.MeshLambertMaterial({ color: 0x333333 })
        );
        base.position.set(x, y + 0.025, z);
        group.add(base);
    }

    function createPlant(group, x, y, z) {
        var pot = new THREE.Mesh(
            new THREE.CylinderGeometry(0.2, 0.15, 0.3, 8),
            new THREE.MeshLambertMaterial({ color: 0x664422 })
        );
        pot.position.set(x, y + 0.15, z);
        group.add(pot);

        var leaves = new THREE.Mesh(
            new THREE.SphereGeometry(0.35, 8, 6),
            new THREE.MeshLambertMaterial({ color: 0x228833 })
        );
        leaves.position.set(x, y + 0.55, z);
        group.add(leaves);
    }

    function createTable(group, x, y, z, rotY, length) {
        length = length || 2.5;
        rotY = rotY || 0;
        var tableTop = new THREE.Mesh(
            new THREE.BoxGeometry(length, 0.06, 1.0),
            new THREE.MeshLambertMaterial({ color: 0x886644 })
        );
        tableTop.position.set(x, y + 0.75, z);
        tableTop.rotation.y = rotY;
        group.add(tableTop);

        for (var i = 0; i < 2; i++) {
            var legX = x + (i === 0 ? -1 : 1) * Math.cos(rotY) * (length / 2 - 0.15);
            var legZ = z + (i === 0 ? -1 : 1) * Math.sin(rotY) * (length / 2 - 0.15);
            var leg = new THREE.Mesh(
                new THREE.BoxGeometry(0.08, 0.72, 0.08),
                new THREE.MeshLambertMaterial({ color: 0x444444 })
            );
            leg.position.set(legX, y + 0.36, legZ);
            group.add(leg);
        }
    }

    function buildOfficeFloor(floorNum, buildingGroup) {
        var y = floorNum * WORLD.FLOOR_HEIGHT;
        var floorGroup = new THREE.Group();
        var nodes = {};
        var callPanel = createCallPanel();
        callPanel.position.set(1.6, y + 1.1, 1.4);
        callPanel.rotation.y = Math.PI;
        floorGroup.add(callPanel);

        var shaftIndicator = createShaftIndicator(0.9);
        shaftIndicator.position.set(0, y + WORLD.FLOOR_HEIGHT - 0.1, 1.45);
        shaftIndicator.rotation.x = -Math.PI / 2;
        floorGroup.add(shaftIndicator);

        var deskPositions = [
            { x: -8, z: -7, name: 'A', rot: Math.PI },
            { x: -4, z: -7, name: 'B', rot: Math.PI },
            { x: 4, z: -7, name: 'C', rot: Math.PI },
            { x: 8, z: -7, name: 'D', rot: Math.PI }
        ];

        var desks = [];

        for (var d = 0; d < deskPositions.length; d++) {
            var dp = deskPositions[d];
            createDesk(floorGroup, dp.x, y, dp.z, dp.rot);
            createChair(floorGroup, dp.x, y, dp.z - 0.7, dp.rot);
            var deskWpName = 'office' + dp.name + '_desk';
            var deskDoorWpName = 'office' + dp.name + '_door';
            addWaypoint(nodes, deskWpName, dp.x, y, dp.z - 0.5);
            addWaypoint(nodes, deskDoorWpName, dp.x, y, dp.z + 2.5);
            addSitTarget(sitTargets, deskWpName, true, 0, -1);
            desks.push({ name: dp.name, deskWp: deskWpName, doorWp: deskDoorWpName, x: dp.x, z: dp.z });
        }

        addWaypoint(nodes, 'hallS', 0, y, 1.5);
        addWaypoint(nodes, 'hallSE', 2, y, 1.5);
        addWaypoint(nodes, 'hallE', 2, y, 0);
        addWaypoint(nodes, 'hallNE', 2, y, -1.5);
        addWaypoint(nodes, 'hallN', 0, y, -1.5);
        addWaypoint(nodes, 'hallNW', -2, y, -1.5);
        addWaypoint(nodes, 'hallW', -2, y, 0);
        addWaypoint(nodes, 'hallSW', -2, y, 1.5);
        addWaypoint(nodes, 'elevWait', 0, y, 2.2);

        addSitTarget(sitTargets, 'hall_stand_N', false, 0, 1);
        addSitTarget(sitTargets, 'hall_stand_S', false, 0, -1);

        nodes.hallS.links = ['hallSE', 'hallSW', 'elevWait', 'hallW', 'hallN'];
        nodes.hallSE.links = ['hallS', 'hallE', 'lounge_door'];
        nodes.hallE.links = ['hallSE', 'hallNE'];
        nodes.hallNE.links = ['hallE', 'hallN', 'officeC_door', 'officeD_door'];
        nodes.hallN.links = ['hallNE', 'hallNW', 'officeC_door', 'officeD_door'];
        nodes.hallNW.links = ['hallN', 'hallW', 'officeA_door', 'officeB_door'];
        nodes.hallW.links = ['hallNW', 'hallSW', 'officeA_door', 'officeB_door'];
        nodes.hallSW.links = ['hallW', 'hallS', 'conf_door'];
        nodes.elevWait.links = ['hallS'];

        nodes.officeA_door.links = ['hallNW', 'officeA_desk'];
        nodes.officeB_door.links = ['hallNW', 'officeB_desk'];
        nodes.officeC_door.links = ['hallNE', 'officeC_desk'];
        nodes.officeD_door.links = ['hallNE', 'officeD_desk'];
        nodes.officeA_desk.links = ['officeA_door'];
        nodes.officeB_desk.links = ['officeB_door'];
        nodes.officeC_desk.links = ['officeC_door'];
        nodes.officeD_desk.links = ['officeD_door'];

        createCouch(floorGroup, 7, y, 6, 0);
        createCoffeeTable(floorGroup, 7, y, 5, 0);
        createArmchair(floorGroup, 5.5, y, 5.5, Math.PI / 4);
        createArmchair(floorGroup, 8.5, y, 5.5, -Math.PI / 4);
        createWaterCooler(floorGroup, 10, y, 7);

        addWaypoint(nodes, 'lounge_door', 2, y, 1.5);
        addWaypoint(nodes, 'lounge_center', 7, y, 6);
        addWaypoint(nodes, 'lounge_spot0', 6, y, 7);
        addWaypoint(nodes, 'lounge_spot1', 8, y, 7);
        addWaypoint(nodes, 'lounge_spot2', 7, y, 5);

        nodes.lounge_door.links = ['hallSE', 'lounge_center'];
        nodes.lounge_center.links = ['lounge_door', 'lounge_spot0', 'lounge_spot1', 'lounge_spot2'];
        nodes.lounge_spot0.links = ['lounge_center'];
        nodes.lounge_spot1.links = ['lounge_center'];
        nodes.lounge_spot2.links = ['lounge_center'];

        addSitTarget(sitTargets, 'lounge_spot0', true, 0, 1);
        addSitTarget(sitTargets, 'lounge_spot1', true, 0, 1);
        addSitTarget(sitTargets, 'lounge_spot2', true, 0, 0);

        createTable(floorGroup, -6.5, y, 6, 0, 2.5);
        createChair(floorGroup, -6.5, y, 5.2, Math.PI);
        createChair(floorGroup, -6.5, y, 6.8, 0);
        createChair(floorGroup, -7.9, y, 6, Math.PI / 2);
        createChair(floorGroup, -5.1, y, 6, -Math.PI / 2);

        addWaypoint(nodes, 'conf_door', -2, y, 1.5);
        addWaypoint(nodes, 'conf_center', -6.5, y, 6);
        addWaypoint(nodes, 'conf_seat0', -6.5, y, 5.2);
        addWaypoint(nodes, 'conf_seat1', -6.5, y, 6.8);
        addWaypoint(nodes, 'conf_seat2', -7.9, y, 6);
        addWaypoint(nodes, 'conf_seat3', -5.1, y, 6);

        nodes.conf_door.links = ['hallSW', 'conf_center'];
        nodes.conf_center.links = ['conf_door', 'conf_seat0', 'conf_seat1', 'conf_seat2', 'conf_seat3'];
        nodes.conf_seat0.links = ['conf_center'];
        nodes.conf_seat1.links = ['conf_center'];
        nodes.conf_seat2.links = ['conf_center'];
        nodes.conf_seat3.links = ['conf_center'];

        addSitTarget(sitTargets, 'conf_seat0', true, 0, -1);
        addSitTarget(sitTargets, 'conf_seat1', true, 0, 1);
        addSitTarget(sitTargets, 'conf_seat2', true, 1, 0);
        addSitTarget(sitTargets, 'conf_seat3', true, -1, 0);

        addWaypoint(nodes, 'water_cooler', 10, y, 7);

        buildingGroup.add(floorGroup);
        floorGroups.push({
            floorNumber: floorNum,
            nodes: nodes,
            callPanel: callPanel,
            shaftIndicator: shaftIndicator,
            desks: desks,
            sitTargets: sitTargets
        });
    }

    function buildLobbyFloor(buildingGroup) {
        var y = 0;
        var floorGroup = new THREE.Group();
        var nodes = {};

        var callPanel = createCallPanel();
        callPanel.position.set(1.6, y + 1.1, 1.4);
        callPanel.rotation.y = Math.PI;
        floorGroup.add(callPanel);

        var shaftIndicator = createShaftIndicator(0.9);
        shaftIndicator.position.set(0, y + WORLD.FLOOR_HEIGHT - 0.1, 1.45);
        shaftIndicator.rotation.x = -Math.PI / 2;
        floorGroup.add(shaftIndicator);

        var sidewalk = new THREE.Mesh(
            new THREE.BoxGeometry(WORLD.BUILDING_WIDTH + 6, 0.2, 8),
            concreteMat
        );
        sidewalk.position.set(0, -0.1, 12);
        floorGroup.add(sidewalk);

        addWaypoint(nodes, 'outside', 0, 0, 12);
        addWaypoint(nodes, 'entrance', 0, 0, 9);

        createCouch(floorGroup, 8, y, 7, 0);
        createCouch(floorGroup, 8, y, 5, 0);
        createCoffeeTable(floorGroup, 8, y, 6, 0);
        createArmchair(floorGroup, 6, y, 6, Math.PI / 4);
        createArmchair(floorGroup, 10, y, 6, -Math.PI / 4);

        createCouch(floorGroup, -7, y, -4, 0);
        createCouch(floorGroup, -7, y, -6, 0);
        createCoffeeTable(floorGroup, -7, y, -5, 0);

        createCouch(floorGroup, -8, y, 3, Math.PI / 2);
        createCouch(floorGroup, -8, y, 5, Math.PI / 2);
        createCoffeeTable(floorGroup, -8, y, 4, Math.PI / 2);
        createArmchair(floorGroup, -6, y, 2, Math.PI / 4);
        createArmchair(floorGroup, -6, y, 6, -Math.PI / 4);

        var counter = new THREE.Mesh(
            new THREE.BoxGeometry(0.5, 1.0, 3),
            new THREE.MeshLambertMaterial({ color: 0x554433 })
        );
        counter.position.set(-9, y + 0.5, 2);
        floorGroup.add(counter);

        var counterTop = new THREE.Mesh(
            new THREE.BoxGeometry(0.6, 0.08, 3.2),
            new THREE.MeshLambertMaterial({ color: 0x333333 })
        );
        counterTop.position.set(-9, y + 1.04, 2);
        floorGroup.add(counterTop);

        createWaterCooler(floorGroup, -7, y, 0);
        createWaterCooler(floorGroup, -7, y, -2);
        createPlant(floorGroup, -2, y, 10);
        createPlant(floorGroup, 2, y, 10);

        var receptionDesk = new THREE.Mesh(
            new THREE.BoxGeometry(2, 1.0, 0.5),
            new THREE.MeshLambertMaterial({ color: 0x554433 })
        );
        receptionDesk.position.set(-3, y + 0.5, 6);
        floorGroup.add(receptionDesk);

        for (var b = 0; b < 4; b++) {
            createBistroTable(floorGroup, -8 + b * 2, y, 0);
            createChair(floorGroup, -8 + b * 2 - 0.5, y, 0.5, Math.PI / 2);
            createChair(floorGroup, -8 + b * 2 + 0.5, y, 0.5, -Math.PI / 2);
            addWaypoint(nodes, 'bistro' + b, -8 + b * 2, y, 0);
            addSitTarget(sitTargets, 'bistro' + b, true, 0, 1);
        }

        addWaypoint(nodes, 'cafe_counter', -9, y, 2);
        addSitTarget(sitTargets, 'cafe_counter', false, -1, 0);

        addWaypoint(nodes, 'hallS', 0, y, 1.5);
        addWaypoint(nodes, 'hallSE', 2, y, 1.5);
        addWaypoint(nodes, 'hallE', 2, y, 0);
        addWaypoint(nodes, 'hallNE', 2, y, -1.5);
        addWaypoint(nodes, 'hallN', 0, y, -1.5);
        addWaypoint(nodes, 'hallNW', -2, y, -1.5);
        addWaypoint(nodes, 'hallW', -2, y, 0);
        addWaypoint(nodes, 'hallSW', -2, y, 1.5);
        addWaypoint(nodes, 'elevWait', 0, y, 2.2);

        nodes.hallS.links = ['hallSE', 'hallSW', 'elevWait', 'hallW', 'hallN'];
        nodes.hallSE.links = ['hallS', 'hallE', 'cafe_door'];
        nodes.hallE.links = ['hallSE', 'hallNE'];
        nodes.hallNE.links = ['hallE', 'hallN'];
        nodes.hallN.links = ['hallNE', 'hallNW'];
        nodes.hallNW.links = ['hallN', 'hallW'];
        nodes.hallW.links = ['hallNW', 'hallSW'];
        nodes.hallSW.links = ['hallW', 'hallS', 'cafe_door'];
        nodes.elevWait.links = ['hallS', 'entrance'];

        nodes.entrance.links = ['elevWait'];

        addWaypoint(nodes, 'cafe_door', -2, y, 1.5);
        addWaypoint(nodes, 'cafe_center', -9, y, 2);
        nodes.cafe_door.links = ['hallSW', 'cafe_center'];
        nodes.cafe_center.links = ['cafe_door', 'bistro0', 'bistro1', 'bistro2', 'bistro3', 'cafe_counter'];

        addWaypoint(nodes, 'reception', -3, y, 6.5);
        addSitTarget(sitTargets, 'reception', false, 0, -1);

        addWaypoint(nodes, 'kiosk', 2, y, 9);
        addSitTarget(sitTargets, 'kiosk', false, 0, -1);

        addWaypoint(nodes, 'lobby_wc_front', -7, y, 1);
        addSitTarget(sitTargets, 'lobby_wc_front', false, 0, 1);

        addWaypoint(nodes, 'lobby_wc_back', -7, y, -1);
        addSitTarget(sitTargets, 'lobby_wc_back', false, 0, 1);

        addWaypoint(nodes, 'lobby_stand_center', 0, y, 4);
        addSitTarget(sitTargets, 'lobby_stand_center', false, 0, 1);

        addWaypoint(nodes, 'lobby_stand_NE', 5, y, 4);
        addSitTarget(sitTargets, 'lobby_stand_NE', false, 0, 1);

        addWaypoint(nodes, 'lobby_stand_NW', -5, y, 4);
        addSitTarget(sitTargets, 'lobby_stand_NW', false, 0, 1);

        addWaypoint(nodes, 'lobby_stand_midE', 5, y, 0);
        addSitTarget(sitTargets, 'lobby_stand_midE', false, 0, 1);

        addWaypoint(nodes, 'lobby_stand_midW', -5, y, 0);
        addSitTarget(sitTargets, 'lobby_stand_midW', false, 0, 1);

        addWaypoint(nodes, 'lobby_stand_entry', 0, y, 8);
        addSitTarget(sitTargets, 'lobby_stand_entry', false, 0, -1);

        addWaypoint(nodes, 'lounge_front_N', 8, y, 7);
        addSitTarget(sitTargets, 'lounge_front_N', true, 0, 1);

        addWaypoint(nodes, 'lounge_front_S', 8, y, 5);
        addSitTarget(sitTargets, 'lounge_front_S', true, 0, -1);

        addWaypoint(nodes, 'back_lounge_N', -7, y, -4);
        addSitTarget(sitTargets, 'back_lounge_N', true, 0, 1);

        addWaypoint(nodes, 'back_lounge_S', -7, y, -6);
        addSitTarget(sitTargets, 'back_lounge_S', true, 0, -1);

        addWaypoint(nodes, 'pit_N', -8, y, 3);
        addSitTarget(sitTargets, 'pit_N', true, 0, 1);

        addWaypoint(nodes, 'pit_S', -8, y, 5);
        addSitTarget(sitTargets, 'pit_S', true, 0, -1);

        addWaypoint(nodes, 'pit_E', -6, y, 4);
        addSitTarget(sitTargets, 'pit_E', true, 1, 0);

        addWaypoint(nodes, 'pit_W', -10, y, 4);
        addSitTarget(sitTargets, 'pit_W', true, -1, 0);

        buildingGroup.add(floorGroup);
        floorGroups.push({
            floorNumber: 0,
            nodes: nodes,
            callPanel: callPanel,
            shaftIndicator: shaftIndicator,
            desks: [],
            sitTargets: sitTargets,
            entranceSpot: 'entrance',
            cafeSpots: ['bistro0', 'bistro1', 'bistro2', 'bistro3']
        });
    }

    var groundSlab = new THREE.Mesh(
        new THREE.BoxGeometry(WORLD.BUILDING_WIDTH, 0.5, WORLD.BUILDING_DEPTH),
        solidGrayMat
    );
    groundSlab.position.y = -0.25;
    buildingGroup.add(groundSlab);

    var roofSlab = new THREE.Mesh(
        new THREE.BoxGeometry(WORLD.BUILDING_WIDTH, 0.5, WORLD.BUILDING_DEPTH),
        solidGrayMat
    );
    roofSlab.position.y = WORLD.FLOOR_COUNT * WORLD.FLOOR_HEIGHT + 0.25;
    buildingGroup.add(roofSlab);

    buildOuterWalls(buildingGroup);
    buildLobbyFloor(buildingGroup);

    for (var f = 1; f < WORLD.FLOOR_COUNT; f++) {
        buildFloorSlabs(f, buildingGroup);
        buildInteriorWallsOffice(buildingGroup, f);
        buildOfficeFloor(f, buildingGroup);
    }

    scene.add(buildingGroup);

    function bfsPath(nodes, fromName, toName) {
        if (!nodes[fromName] || !nodes[toName]) return [];
        if (fromName === toName) return [nodes[fromName]];

        var queue = [[fromName]];
        var visited = new Set([fromName]);

        while (queue.length > 0) {
            var path = queue.shift();
            var current = path[path.length - 1];
            var node = nodes[current];

            if (!node || !node.links) continue;

            for (var i = 0; i < node.links.length; i++) {
                var next = node.links[i];
                if (visited.has(next)) continue;
                visited.add(next);

                var newPath = path.concat([next]);
                if (next === toName) {
                    return newPath.map(function(name) { return nodes[name]; });
                }
                queue.push(newPath);
            }
        }
        return [];
    }

    return {
        buildingGroup: buildingGroup,
        floors: floorGroups,
        bfsPath: bfsPath,
        allNodes: allNodes,
        sitTargets: sitTargets
    };
}