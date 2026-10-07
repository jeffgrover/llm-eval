var WORLD = {
    FLOOR_HEIGHT: 3.4,
    FLOOR_COUNT: 6,
    BUILDING_WIDTH: 22,
    BUILDING_DEPTH: 18,
    SHAFT_WIDTH: 3,
    SHAFT_DEPTH: 3,
    PERSON_R: 0.4
};
window.WORLD = WORLD;

function bfsPath(nodes, fromName, toName) {
    if (!nodes[fromName] || !nodes[toName]) { return []; }
    if (fromName === toName) { return [nodes[fromName].clone()]; }
    var links = nodes._links || {};
    var prev = {};
    var seen = {};
    var queue = [fromName];
    seen[fromName] = true;
    while (queue.length > 0) {
        var cur = queue.shift();
        var nbs = links[cur] || [];
        for (var i = 0; i < nbs.length; i++) {
            var nb = nbs[i];
            if (!seen[nb]) {
                seen[nb] = true;
                prev[nb] = cur;
                if (nb === toName) {
                    var chain = [toName];
                    var c = toName;
                    while (prev[c] !== undefined) {
                        c = prev[c];
                        chain.unshift(c);
                    }
                    var out = [];
                    for (var k = 0; k < chain.length; k++) {
                        out.push(nodes[chain[k]].clone());
                    }
                    return out;
                }
                queue.push(nb);
            }
        }
    }
    return [nodes[toName].clone()];
}
window.bfsPath = bfsPath;

function worldMakeTextTexture() {
    var canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    var ctx = canvas.getContext("2d");
    var tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.anisotropy = 4;
    tex._lastText = null;
    tex._canvas = canvas;
    tex._ctx = ctx;
    return tex;
}

function worldUpdateTextTexture(tex, text) {
    if (tex._lastText === text) { return; }
    tex._lastText = text;
    var ctx = tex._ctx;
    var canvas = tex._canvas;
    ctx.fillStyle = "#050505";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffbb22";
    ctx.shadowColor = "#ffbb22";
    ctx.shadowBlur = 18;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    var fs = Math.floor(canvas.height * 0.62);
    ctx.font = "bold " + fs + "px monospace";
    ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 4);
    tex.needsUpdate = true;
}

function worldBuildCallPanel(floorNumber) {
    var grp = new THREE.Group();
    var plateMat = new THREE.MeshLambertMaterial({ color: 0x333844 });
    var plate = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.4, 0.05), plateMat);
    grp.add(plate);
    var triShape = new THREE.Shape();
    triShape.moveTo(-0.13, -0.1);
    triShape.lineTo(0.13, -0.1);
    triShape.lineTo(0, 0.12);
    triShape.closePath();
    var triGeo = new THREE.ShapeGeometry(triShape);
    var offMat = new THREE.MeshBasicMaterial({ color: 0x222222, side: THREE.DoubleSide });
    var onMat = new THREE.MeshBasicMaterial({ color: 0x33ff55, side: THREE.DoubleSide });
    var upTri = new THREE.Mesh(triGeo, offMat.clone());
    upTri.position.set(0, 0.42, 0.035);
    var downTri = new THREE.Mesh(triGeo, offMat.clone());
    downTri.rotation.z = Math.PI;
    downTri.position.set(0, 0.1, 0.035);
    grp.add(upTri);
    grp.add(downTri);
    var dispTex = worldMakeTextTexture();
    var disp = new THREE.Mesh(
        new THREE.PlaneGeometry(0.45, 0.45),
        new THREE.MeshBasicMaterial({ map: dispTex, side: THREE.DoubleSide })
    );
    disp.position.set(0, -0.35, 0.035);
    grp.add(disp);
    worldUpdateTextTexture(dispTex, String(floorNumber));
    grp.userData.setUp = function(on) {
        upTri.material = on ? onMat : upTri.material.clone();
        if (on) { upTri.material = onMat; } else { upTri.material.color.setHex(0x222222); upTri.material = offMat; }
    };
    grp.userData.setDown = function(on) {
        if (on) { downTri.material = onMat; } else { downTri.material = offMat; }
    };
    grp.userData.setIndicator = function(text) {
        worldUpdateTextTexture(dispTex, text);
    };
    return grp;
}

function worldBuildShaftIndicator(size) {
    var tex = worldMakeTextTexture();
    var mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(size, size),
        new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide })
    );
    mesh.userData.setIndicator = function(text) {
        worldUpdateTextTexture(tex, text);
    };
    return mesh;
}

function worldAddNode(floorObj, name, x, z) {
    floorObj.nodes[name] = new THREE.Vector3(x, 0, z);
}

function worldLink(floorObj, a, b) {
    if (!floorObj.nodes._links[a]) { floorObj.nodes._links[a] = []; }
    if (!floorObj.nodes._links[b]) { floorObj.nodes._links[b] = []; }
    if (floorObj.nodes._links[a].indexOf(b) < 0) { floorObj.nodes._links[a].push(b); }
    if (floorObj.nodes._links[b].indexOf(a) < 0) { floorObj.nodes._links[b].push(a); }
}

function worldBox(parent, w, h, d, x, y, z, material, order) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    m.position.set(x, y, z);
    if (order !== undefined) { m.renderOrder = order; }
    parent.add(m);
    return m;
}

function worldChair(parent, x, y, z, rotY, seatColor) {
    var g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = rotY;
    var sm = new THREE.MeshLambertMaterial({ color: seatColor === undefined ? 0x775533 : seatColor });
    var seat = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.12, 0.55), sm);
    seat.position.set(0, 0.45, 0);
    g.add(seat);
    var back = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.6, 0.1), sm);
    back.position.set(0, 0.78, -0.28);
    g.add(back);
    var legG = new THREE.CylinderGeometry(0.04, 0.04, 0.45, 6);
    var positions = [[-0.22, -0.22], [0.22, -0.22], [-0.22, 0.22], [0.22, 0.22]];
    for (var i = 0; i < positions.length; i++) {
        var leg = new THREE.Mesh(legG, sm);
        leg.position.set(positions[i][0], 0.22, positions[i][1]);
        g.add(leg);
    }
    parent.add(g);
    return g;
}

function worldDeskWithChair(parent, floorObj, y, dx, dzDesk, dzChair, deskWp, seatColor) {
    var wood = new THREE.MeshLambertMaterial({ color: 0x8a6a44 });
    var dark = new THREE.MeshLambertMaterial({ color: 0x222222 });
    worldBox(parent, 1.6, 0.08, 0.8, dx, y + 0.74, dzDesk, wood);
    var legG2 = [[-0.7, -0.3], [0.7, -0.3], [-0.7, 0.3], [0.7, 0.3]];
    for (var i = 0; i < legG2.length; i++) {
        worldBox(parent, 0.07, 0.74, 0.07, dx + legG2[i][0], y + 0.37, dzDesk + legG2[i][1], wood);
    }
    worldBox(parent, 0.5, 0.35, 0.06, dx, y + 1.0, dzDesk - 0.28, dark);
    worldChair(parent, dx, y, dzChair, Math.PI, seatColor);
    floorObj.sitTargets[deskWp] = { sit: true, facing: Math.PI };
}

function createWorld(scene) {
    var FH = WORLD.FLOOR_HEIGHT;
    var W = WORLD.BUILDING_WIDTH;
    var D = WORLD.BUILDING_DEPTH;
    var buildingGroup = new THREE.Group();
    buildingGroup.renderOrder = 0;
    scene.add(buildingGroup);

    var wallMat = new THREE.MeshLambertMaterial({
        color: 0x9999ff, transparent: true, opacity: 0.2,
        depthWrite: false, side: THREE.DoubleSide
    });
    var innerWallMat = new THREE.MeshLambertMaterial({
        color: 0xbbc5e6, transparent: true, opacity: 0.28,
        depthWrite: false, side: THREE.DoubleSide
    });
    var slabMat = new THREE.MeshLambertMaterial({
        color: 0x888888, transparent: true, opacity: 0.3,
        depthWrite: false, side: THREE.DoubleSide
    });
    var solidMat = new THREE.MeshLambertMaterial({ color: 0x777777 });
    var glassMat = new THREE.MeshLambertMaterial({
        color: 0xaaddff, transparent: true, opacity: 0.25,
        depthWrite: false, side: THREE.DoubleSide
    });

    var totalH = WORLD.FLOOR_COUNT * FH;

    function slabFull(y, mat) {
        worldBox(buildingGroup, W, 0.15, D, 0, y, 0, mat || solidMat, 0);
    }
    slabFull(-0.08, solidMat);
    for (var f = 1; f < WORLD.FLOOR_COUNT; f++) {
        var yy = f * FH - 0.08;
        worldBox(buildingGroup, W, 0.12, (D / 2 - 1.5), 0, yy, (1.5 + D / 2) / 2, slabMat, 0);
        worldBox(buildingGroup, W, 0.12, (D / 2 - 1.5), 0, yy, -(1.5 + D / 2) / 2, slabMat, 0);
        worldBox(buildingGroup, (W / 2 - 1.5), 0.12, 3, -(1.5 + W / 2) / 2, yy, 0, slabMat, 0);
        worldBox(buildingGroup, (W / 2 - 1.5), 0.12, 3, (1.5 + W / 2) / 2, yy, 0, slabMat, 0);
    }
    slabFull(totalH + 0.08, solidMat);

    function outerWallX(x, z0, z1, y0, y1, mat) {
        var h = y1 - y0;
        worldBox(buildingGroup, 0.15, h, (z1 - z0), x, (y0 + y1) / 2, (z0 + z1) / 2, mat || wallMat, 0);
    }
    function outerWallZ(z, x0, x1, y0, y1, mat) {
        var h = y1 - y0;
        worldBox(buildingGroup, (x1 - x0), h, 0.15, (x0 + x1) / 2, (y0 + y1) / 2, z, mat || wallMat, 0);
    }
    for (var ff = 0; ff < WORLD.FLOOR_COUNT; ff++) {
        var y0 = ff * FH;
        var y1 = (ff + 1) * FH;
        outerWallX(-W / 2, -D / 2, D / 2, y0, y1);
        outerWallX(W / 2, -D / 2, D / 2, y0, y1);
        outerWallZ(-D / 2, -W / 2, W / 2, y0, y1);
        if (ff === 0) {
            outerWallZ(D / 2, -W / 2, -1.5, y0, y1);
            outerWallZ(D / 2, 1.5, W / 2, y0, y1);
            var header = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.25, 0.18),
                new THREE.MeshLambertMaterial({ color: 0x555566 }));
            header.position.set(0, y1 - 0.15, D / 2);
            buildingGroup.add(header);
            var doorL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.4, 1.4), glassMat);
            doorL.position.set(-1.35, y0 + 1.2, D / 2 - 0.75);
            doorL.rotation.y = 0.5;
            buildingGroup.add(doorL);
            var doorR = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.4, 1.4), glassMat);
            doorR.position.set(1.35, y0 + 1.2, D / 2 - 0.75);
            doorR.rotation.y = -0.5;
            buildingGroup.add(doorR);
        } else {
            outerWallZ(D / 2, -W / 2, W / 2, y0, y1);
        }
    }

    function innerWallX(x, z0, z1, y, mat) {
        worldBox(buildingGroup, 0.12, FH, (z1 - z0), x, y + FH / 2, (z0 + z1) / 2, mat || innerWallMat, 0);
    }
    function innerWallZ(z, x0, x1, y, mat) {
        worldBox(buildingGroup, (x1 - x0), FH, 0.12, (x0 + x1) / 2, y + FH / 2, z, mat || innerWallMat, 0);
    }

    var shaftGlass = new THREE.MeshLambertMaterial({
        color: 0xccddff, transparent: true, opacity: 0.15,
        depthWrite: false, side: THREE.DoubleSide
    });
    worldBox(buildingGroup, 0.1, totalH, 3, -1.55, totalH / 2, 0, shaftGlass, 0);
    worldBox(buildingGroup, 0.1, totalH, 3, 1.55, totalH / 2, 0, shaftGlass, 0);
    worldBox(buildingGroup, 3.2, totalH, 0.1, 0, totalH / 2, -1.55, shaftGlass, 0);

    var sidewalk = new THREE.Mesh(new THREE.BoxGeometry(10, 0.1, 6),
        new THREE.MeshLambertMaterial({ color: 0x9a9a9a }));
    sidewalk.position.set(0, -0.05, 12);
    scene.add(sidewalk);

    function ringNodes(floorObj) {
        worldAddNode(floorObj, "hallS", 0, 4.4);
        worldAddNode(floorObj, "hallSE", 4.2, 4.2);
        worldAddNode(floorObj, "hallE", 6.5, 0);
        worldAddNode(floorObj, "hallNE", 4.2, -4.2);
        worldAddNode(floorObj, "hallN", 0, -4.2);
        worldAddNode(floorObj, "hallNW", -4.2, -4.2);
        worldAddNode(floorObj, "hallW", -6.5, 0);
        worldAddNode(floorObj, "hallSW", -4.2, 4.2);
        worldAddNode(floorObj, "elevWait", 0, 2.7);
        var ring = ["hallS", "hallSE", "hallE", "hallNE", "hallN", "hallNW", "hallW", "hallSW"];
        for (var i = 0; i < ring.length; i++) {
            worldLink(floorObj, ring[i], ring[(i + 1) % ring.length]);
        }
        worldLink(floorObj, "elevWait", "hallS");
    }

    var floors = [];
    var officeXs = [-8.25, -2.75, 2.75, 8.25];
    var officeNames = ["officeA", "officeB", "officeC", "officeD"];

    for (var fi = 0; fi < WORLD.FLOOR_COUNT; fi++) {
        var yBase = fi * FH;
        var floorObj = {
            floorNumber: fi,
            nodes: { _links: {} },
            sitTargets: {},
            desks: [],
            confSeats: [],
            loungeSpots: [],
            callPanel: null,
            shaftIndicator: null
        };
        ringNodes(floorObj);

        var panel = worldBuildCallPanel(fi);
        panel.position.set(2.3, yBase + 1.5, 1.62);
        scene.add(panel);
        floorObj.callPanel = panel;
        var shaftInd = worldBuildShaftIndicator(0.9);
        shaftInd.position.set(0, yBase + 2.75, 1.62);
        scene.add(shaftInd);
        floorObj.shaftIndicator = shaftInd;

        if (fi === 0) {
            worldAddNode(floorObj, "outside", 0, 12);
            worldAddNode(floorObj, "front_door_threshold", 0, 9.35);
            worldAddNode(floorObj, "entrance", 0, 7.4);
            worldAddNode(floorObj, "lobby_center", 0, 4.9);
            worldLink(floorObj, "outside", "front_door_threshold");
            worldLink(floorObj, "front_door_threshold", "entrance");
            worldLink(floorObj, "entrance", "lobby_center");
            worldLink(floorObj, "lobby_center", "elevWait");
            worldLink(floorObj, "lobby_center", "hallS");
            worldLink(floorObj, "entrance", "hallSW");
            worldLink(floorObj, "entrance", "hallSE");

            var cafeMat = new THREE.MeshLambertMaterial({ color: 0x6a4a2a });
            var topMat = new THREE.MeshLambertMaterial({ color: 0x3a2a1a });
            worldBox(scene, 0.8, 1.0, 4.5, -10.2, yBase + 0.5, 5, cafeMat);
            worldBox(scene, 1.0, 0.08, 4.7, -10.2, yBase + 1.04, 5, topMat);
            worldBox(scene, 0.4, 0.35, 0.5, -10.2, yBase + 1.25, 3.8,
                new THREE.MeshLambertMaterial({ color: 0x333333 }));
            worldBox(scene, 0.5, 0.25, 0.9, -10.2, yBase + 1.2, 5.6,
                new THREE.MeshLambertMaterial({ color: 0xffd9a0 }));
            worldAddNode(floorObj, "cafe_door", -6.5, 4.4);
            worldLink(floorObj, "cafe_door", "hallSW");
            worldLink(floorObj, "cafe_door", "hallW");
            worldAddNode(floorObj, "cafe_order", -9.2, 5);
            worldLink(floorObj, "cafe_order", "cafe_door");
            floorObj.sitTargets["cafe_order"] = { sit: false, facing: -Math.PI / 2 };
            var bistroDefs = [
                { tx: -8.0, tz: 2.6, c1: [-8.7, 2.6, Math.PI / 2], c2: [-7.3, 2.6, -Math.PI / 2] },
                { tx: -8.0, tz: 7.4, c1: [-8.7, 7.4, Math.PI / 2], c2: [-7.3, 7.4, -Math.PI / 2] }
            ];
            var bistroIdx = 0;
            for (var bi = 0; bi < bistroDefs.length; bi++) {
                var bd = bistroDefs[bi];
                worldBox(scene, 0.7, 0.72, 0.7,
                    bd.tx, yBase + 0.36, bd.tz,
                    new THREE.MeshLambertMaterial({ color: 0xdddddd }));
                var bchairs = [bd.c1, bd.c2];
                for (var bci = 0; bci < bchairs.length; bci++) {
                    var bc = bchairs[bci];
                    worldChair(scene, bc[0], yBase, bc[1], bc[2], 0x336677);
                    var bwp = "bistro_seat" + bistroIdx;
                    worldAddNode(floorObj, bwp, bc[0], bc[1]);
                    worldLink(floorObj, bwp, "cafe_door");
                    floorObj.sitTargets[bwp] = { sit: true, facing: bc[2] };
                    bistroIdx++;
                }
            }

            var couchMat = new THREE.MeshLambertMaterial({ color: 0x5544aa });
            worldBox(scene, 2.2, 0.5, 0.9, 7.5, yBase + 0.25, 7.3, couchMat);
            worldBox(scene, 2.2, 0.7, 0.25, 7.5, yBase + 0.6, 7.7, couchMat);
            worldBox(scene, 1.4, 0.4, 0.8, 7.5, yBase + 0.2, 6.1,
                new THREE.MeshLambertMaterial({ color: 0x8a6a44 }));
            worldChair(scene, 6.4, yBase, 5.3, Math.PI * 0.75, 0xaa5544);
            worldChair(scene, 8.6, yBase, 5.3, -Math.PI * 0.75, 0xaa5544);
            var flSpots = [
                { n: "front_lounge_couch", x: 7.5, z: 7.0, face: 0 },
                { n: "front_lounge_chairL", x: 6.4, z: 5.3, face: Math.PI * 0.75 },
                { n: "front_lounge_chairR", x: 8.6, z: 5.3, face: -Math.PI * 0.75 }
            ];
            for (var fli = 0; fli < flSpots.length; fli++) {
                worldAddNode(floorObj, flSpots[fli].n, flSpots[fli].x, flSpots[fli].z);
                worldLink(floorObj, flSpots[fli].n, "hallSE");
                worldLink(floorObj, flSpots[fli].n, "hallE");
                floorObj.sitTargets[flSpots[fli].n] = { sit: true, facing: flSpots[fli].face };
            }

            worldBox(scene, 2.2, 0.5, 0.9, -2.0, yBase + 0.25, -6.5, couchMat);
            worldBox(scene, 2.2, 0.5, 0.9, -2.0, yBase + 0.25, -4.7, couchMat);
            worldBox(scene, 1.4, 0.4, 0.8, -2.0, yBase + 0.2, -5.6,
                new THREE.MeshLambertMaterial({ color: 0x8a6a44 }));
            worldAddNode(floorObj, "back_lounge_N", -2.0, -4.7);
            worldAddNode(floorObj, "back_lounge_S", -2.0, -6.5);
            worldLink(floorObj, "back_lounge_N", "hallNW");
            worldLink(floorObj, "back_lounge_S", "hallNW");
            worldLink(floorObj, "back_lounge_N", "hallN");
            worldLink(floorObj, "back_lounge_S", "hallN");
            floorObj.sitTargets["back_lounge_N"] = { sit: true, facing: Math.PI };
            floorObj.sitTargets["back_lounge_S"] = { sit: true, facing: 0 };

            worldBox(scene, 1.0, 0.5, 1.0, -7.5, yBase + 0.25, -6.0,
                new THREE.MeshLambertMaterial({ color: 0x777744 }));
            var pitDefs = [
                { n: "pit_N", x: -7.5, z: -4.9, face: Math.PI },
                { n: "pit_S", x: -7.5, z: -7.1, face: 0 },
                { n: "pit_E", x: -6.4, z: -6.0, face: -Math.PI / 2 },
                { n: "pit_W", x: -8.6, z: -6.0, face: Math.PI / 2 }
            ];
            for (var pi = 0; pi < pitDefs.length; pi++) {
                worldChair(scene, pitDefs[pi].x, yBase, pitDefs[pi].z, pitDefs[pi].face, 0x447755);
                worldAddNode(floorObj, pitDefs[pi].n, pitDefs[pi].x, pitDefs[pi].z);
                worldLink(floorObj, pitDefs[pi].n, "hallNW");
                worldLink(floorObj, pitDefs[pi].n, "hallW");
                floorObj.sitTargets[pitDefs[pi].n] = { sit: true, facing: pitDefs[pi].face };
            }

            function worldWaterCooler(sc, wx, wz, wpName) {
                worldBox(sc, 0.45, 1.1, 0.45, wx, yBase + 0.55, wz,
                    new THREE.MeshLambertMaterial({ color: 0xeeeeee }));
                worldBox(sc, 0.3, 0.3, 0.3, wx, yBase + 1.25, wz,
                    new THREE.MeshLambertMaterial({ color: 0x88ccff, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide }));
            }
            worldWaterCooler(scene, 3.2, 2.2, "a");
            worldWaterCooler(scene, -3.2, -2.2, "b");
            worldAddNode(floorObj, "lobby_wc_front", 3.2, 3.0);
            worldAddNode(floorObj, "lobby_wc_back", -3.2, -1.4);
            worldLink(floorObj, "lobby_wc_front", "hallS");
            worldLink(floorObj, "lobby_wc_front", "hallSE");
            worldLink(floorObj, "lobby_wc_back", "hallN");
            worldLink(floorObj, "lobby_wc_back", "hallNW");
            floorObj.sitTargets["lobby_wc_front"] = { sit: false, facing: 0 };
            floorObj.sitTargets["lobby_wc_back"] = { sit: false, facing: Math.PI };

            worldBox(scene, 2.0, 1.0, 0.8, -4.5, yBase + 0.5, 6.8,
                new THREE.MeshLambertMaterial({ color: 0x996633 }));
            worldAddNode(floorObj, "reception", -4.5, 5.8);
            worldLink(floorObj, "reception", "hallSW");
            floorObj.sitTargets["reception"] = { sit: false, facing: Math.PI };

            worldBox(scene, 0.7, 1.5, 0.5, 2.8, yBase + 0.75, 7.6,
                new THREE.MeshLambertMaterial({ color: 0x224466 }));
            worldAddNode(floorObj, "kiosk", 2.8, 6.8);
            worldLink(floorObj, "kiosk", "entrance");
            worldLink(floorObj, "kiosk", "hallSE");
            floorObj.sitTargets["kiosk"] = { sit: false, facing: 0 };

            var loiterDefs = [
                ["lobby_stand_center", 1.8, 5.2],
                ["lobby_stand_NE", 4.5, 6.8],
                ["lobby_stand_NW", -6.0, 6.0],
                ["lobby_stand_midE", 5.5, 1.5],
                ["lobby_stand_midW", -5.5, 0.5],
                ["lobby_stand_entry", -1.9, 7.8]
            ];
            for (var li = 0; li < loiterDefs.length; li++) {
                worldAddNode(floorObj, loiterDefs[li][0], loiterDefs[li][1], loiterDefs[li][2]);
                worldLink(floorObj, loiterDefs[li][0], "lobby_center");
                worldLink(floorObj, loiterDefs[li][0], "entrance");
                floorObj.sitTargets[loiterDefs[li][0]] = { sit: false, facing: Math.random() * Math.PI * 2 };
            }

            var plantMat = new THREE.MeshLambertMaterial({ color: 0x228822 });
            var potMat = new THREE.MeshLambertMaterial({ color: 0xaa5522 });
            var plantSpots = [[-2.5, 8.2], [2.5, 8.2]];
            for (var pli = 0; pli < plantSpots.length; pli++) {
                worldBox(scene, 0.4, 0.4, 0.4, plantSpots[pli][0], yBase + 0.2, plantSpots[pli][1], potMat);
                var bush = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), plantMat);
                bush.position.set(plantSpots[pli][0], yBase + 0.75, plantSpots[pli][1]);
                scene.add(bush);
            }
        } else {
            for (var oi = 0; oi < 4; oi++) {
                var dx = officeXs[oi];
                var onm = officeNames[oi];
                var doorWp = onm + "_door";
                var deskWp = onm + "_desk";
                worldAddNode(floorObj, doorWp, dx, -5.0);
                worldAddNode(floorObj, deskWp, dx, -6.85);
                worldLink(floorObj, doorWp, deskWp);
                var corner = (dx < 0) ? ((dx < -5) ? "hallNW" : "hallN") : ((dx > 5) ? "hallNE" : "hallN");
                worldLink(floorObj, doorWp, corner);
                worldDeskWithChair(scene, floorObj, yBase, dx, -7.6, -6.85, deskWp, 0x555577);
                floorObj.desks.push({ desk: deskWp, door: doorWp });
                if (oi === 0) {
                    innerWallX(-5.5, -9, -5.0, yBase);
                } else if (oi === 1) {
                    innerWallX(0, -9, -5.0, yBase);
                } else if (oi === 2) {
                    innerWallX(5.5, -9, -5.0, yBase);
                }
            }
            innerWallZ(-5.0, -11, -9.0, yBase);
            innerWallZ(-5.0, -7.6, -3.5, yBase);
            innerWallZ(-5.0, -2.0, 2.0, yBase);
            innerWallZ(-5.0, 3.5, 7.6, yBase);
            innerWallZ(-5.0, 9.0, 11, yBase);
            innerWallZ(3.0, -11, -4.8, yBase);
            innerWallZ(3.0, -3.6, 3.6, yBase);
            innerWallZ(3.0, 4.8, 11, yBase);
            innerWallX(-3.0, 3.0, 5.4, yBase);
            innerWallX(-3.0, 6.6, 9.0, yBase);
            innerWallX(3.0, 3.0, 5.4, yBase);
            innerWallX(3.0, 6.6, 9.0, yBase);

            worldAddNode(floorObj, "conf_door", -4.2, 4.2);
            worldLink(floorObj, "conf_door", "hallSW");
            worldAddNode(floorObj, "conf_center", -7, 6);
            worldLink(floorObj, "conf_door", "conf_center");
            worldBox(scene, 3.0, 0.1, 1.2, -7, yBase + 0.72, 6,
                new THREE.MeshLambertMaterial({ color: 0x6a5a3a }));
            worldBox(scene, 0.1, 0.72, 1.0, -8.2, yBase + 0.36, 6,
                new THREE.MeshLambertMaterial({ color: 0x4a3a2a }));
            worldBox(scene, 0.1, 0.72, 1.0, -5.8, yBase + 0.36, 6,
                new THREE.MeshLambertMaterial({ color: 0x4a3a2a }));
            var confSeats = [
                { n: "conf_seat0", x: -7.8, z: 5.0, face: Math.PI },
                { n: "conf_seat1", x: -6.2, z: 5.0, face: Math.PI },
                { n: "conf_seat2", x: -7.8, z: 7.0, face: 0 },
                { n: "conf_seat3", x: -6.2, z: 7.0, face: 0 }
            ];
            for (var ci = 0; ci < confSeats.length; ci++) {
                worldChair(scene, confSeats[ci].x, yBase, confSeats[ci].z, confSeats[ci].face, 0x444466);
                worldAddNode(floorObj, confSeats[ci].n, confSeats[ci].x, confSeats[ci].z);
                worldLink(floorObj, confSeats[ci].n, "conf_center");
                floorObj.sitTargets[confSeats[ci].n] = { sit: true, facing: confSeats[ci].face };
                floorObj.confSeats.push(confSeats[ci].n);
            }

            worldAddNode(floorObj, "lounge_door", 4.2, 4.2);
            worldLink(floorObj, "lounge_door", "hallSE");
            worldAddNode(floorObj, "lounge_center", 7, 6);
            worldLink(floorObj, "lounge_door", "lounge_center");
            var lcmat = new THREE.MeshLambertMaterial({ color: 0x446688 });
            worldBox(scene, 2.0, 0.5, 0.8, 7, yBase + 0.25, 7.2, lcmat);
            worldBox(scene, 1.2, 0.35, 0.7, 7, yBase + 0.17, 6.0,
                new THREE.MeshLambertMaterial({ color: 0x8a6a44 }));
            worldChair(scene, 6.0, yBase, 5.2, Math.PI * 0.8, 0x885544);
            worldChair(scene, 8.0, yBase, 5.2, -Math.PI * 0.8, 0x885544);
            var lgSpots = [
                { n: "lounge_spot0", x: 7, z: 7.0, face: 0 },
                { n: "lounge_spot1", x: 6.0, z: 5.2, face: Math.PI * 0.8 },
                { n: "lounge_spot2", x: 8.0, z: 5.2, face: -Math.PI * 0.8 }
            ];
            for (var gi = 0; gi < lgSpots.length; gi++) {
                worldAddNode(floorObj, lgSpots[gi].n, lgSpots[gi].x, lgSpots[gi].z);
                worldLink(floorObj, lgSpots[gi].n, "lounge_center");
                floorObj.sitTargets[lgSpots[gi].n] = { sit: true, facing: lgSpots[gi].face };
                floorObj.loungeSpots.push(lgSpots[gi].n);
            }

            worldBox(scene, 0.45, 1.1, 0.45, 9.5, yBase + 0.55, 4.5,
                new THREE.MeshLambertMaterial({ color: 0xeeeeee }));
            worldAddNode(floorObj, "water_cooler", 9.5, 3.7);
            worldLink(floorObj, "water_cooler", "hallSE");
            worldLink(floorObj, "water_cooler", "hallE");
            floorObj.sitTargets["water_cooler"] = { sit: false, facing: 0 };
            worldAddNode(floorObj, "hall_stand_N", 2.6, -4.2);
            worldAddNode(floorObj, "hall_stand_S", -2.6, 4.4);
            worldLink(floorObj, "hall_stand_N", "hallN");
            worldLink(floorObj, "hall_stand_N", "hallNE");
            worldLink(floorObj, "hall_stand_S", "hallS");
            worldLink(floorObj, "hall_stand_S", "hallSW");
            floorObj.sitTargets["hall_stand_N"] = { sit: false, facing: 0 };
            floorObj.sitTargets["hall_stand_S"] = { sit: false, facing: Math.PI };
        }
        floors.push(floorObj);
    }

    return {
        buildingGroup: buildingGroup,
        floors: floors,
        bfsPath: bfsPath
    };
}
window.createWorld = createWorld;
