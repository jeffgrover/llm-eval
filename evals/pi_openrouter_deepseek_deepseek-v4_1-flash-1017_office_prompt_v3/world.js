/* world.js - building geometry, furniture, navigation graph and call panels. */
(function () {
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

    function createDisplayTexture(size) {
        const canvas = document.createElement("canvas");
        canvas.width = size || 256;
        canvas.height = size || 256;
        const ctx = canvas.getContext("2d");
        const tex = new THREE.CanvasTexture(canvas);
        tex.generateMipmaps = true;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.anisotropy = 4;
        tex._lastText = "";
        tex._ctx = ctx;
        tex._canvas = canvas;
        return tex;
    }

    function updateDisplayTexture(tex, text) {
        const value = String(text === undefined || text === null ? "" : text);
        if (!tex || tex._lastText === value) return;
        tex._lastText = value;
        const canvas = tex._canvas;
        const ctx = tex._ctx;
        const w = canvas.width;
        const h = canvas.height;
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = "#050505";
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = "#272727";
        ctx.lineWidth = 8;
        ctx.strokeRect(4, 4, w - 8, h - 8);
        ctx.save();
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = "bold 180px monospace";
        ctx.shadowColor = "#ff9900";
        ctx.shadowBlur = 20;
        ctx.fillStyle = "#ffbb22";
        ctx.fillText(value, w / 2, h / 2 + 6);
        ctx.shadowBlur = 0;
        ctx.fillText(value, w / 2, h / 2 + 6);
        ctx.restore();
        tex.needsUpdate = true;
    }

    function makeCallPanel(floorY) {
        const group = new THREE.Group();
        const plateMat = new THREE.MeshLambertMaterial({ color: 0x343a44 });
        const plate = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.4, 0.05), plateMat);
        group.add(plate);

        const darkMat = new THREE.MeshBasicMaterial({ color: 0x1b1b1b });
        const upMat = new THREE.MeshBasicMaterial({ color: 0x33ff66 });
        const downMat = new THREE.MeshBasicMaterial({ color: 0x33ff66 });

        const upShape = new THREE.Shape();
        upShape.moveTo(-0.13, 0);
        upShape.lineTo(0.13, 0);
        upShape.lineTo(0, 0.2);
        upShape.lineTo(-0.13, 0);
        const upMesh = new THREE.Mesh(new THREE.ShapeGeometry(upShape), darkMat);
        upMesh.position.set(0, 0.32, 0.031);
        group.add(upMesh);

        const downShape = new THREE.Shape();
        downShape.moveTo(-0.13, 0);
        downShape.lineTo(0.13, 0);
        downShape.lineTo(0, -0.2);
        downShape.lineTo(-0.13, 0);
        const downMesh = new THREE.Mesh(new THREE.ShapeGeometry(downShape), darkMat);
        downMesh.position.set(0, -0.02, 0.031);
        group.add(downMesh);

        const tex = createDisplayTexture(256);
        const display = new THREE.Mesh(
            new THREE.PlaneGeometry(0.45, 0.45),
            new THREE.MeshBasicMaterial({ map: tex })
        );
        display.position.set(0, -0.43, 0.031);
        group.add(display);

        group.position.set(2.05, floorY + 1.2, 1.62);
        group.userData.setUp = function (on) {
            upMesh.material = on ? upMat : darkMat;
        };
        group.userData.setDown = function (on) {
            downMesh.material = on ? downMat : darkMat;
        };
        group.userData.setIndicator = function (text) {
            updateDisplayTexture(tex, text);
        };
        group.userData.texture = tex;
        group.userData.setUp(false);
        group.userData.setDown(false);
        group.userData.setIndicator("1");
        return group;
    }

    function makeShaftIndicator(floorY) {
        const tex = createDisplayTexture(256);
        const mesh = new THREE.Mesh(
            new THREE.PlaneGeometry(0.9, 0.9),
            new THREE.MeshBasicMaterial({ map: tex })
        );
        mesh.position.set(0, floorY + 2.82, 1.64);
        mesh.userData.texture = tex;
        mesh.userData.setIndicator = function (text) {
            updateDisplayTexture(tex, text);
        };
        mesh.userData.setIndicator("1");
        return mesh;
    }

    function nearestNode(nodes, pos) {
        let bestName = null;
        let bestDist = Infinity;
        for (const name in nodes) {
            if (!Object.prototype.hasOwnProperty.call(nodes, name)) continue;
            const node = nodes[name];
            const dx = node.pos.x - pos.x;
            const dz = node.pos.z - pos.z;
            const d = dx * dx + dz * dz;
            if (d < bestDist) {
                bestDist = d;
                bestName = name;
            }
        }
        return bestName;
    }

    function bfsPath(nodes, fromName, toName) {
        if (!nodes[fromName] || !nodes[toName]) return [];
        if (fromName === toName) return [nodes[toName].pos.clone()];
        const queue = [fromName];
        const visited = new Set([fromName]);
        const prev = {};
        while (queue.length) {
            const current = queue.shift();
            const links = nodes[current].links;
            for (let i = 0; i < links.length; i += 1) {
                const next = links[i];
                if (visited.has(next) || !nodes[next]) continue;
                visited.add(next);
                prev[next] = current;
                if (next === toName) {
                    const names = [next];
                    let cursor = next;
                    while (cursor !== fromName) {
                        cursor = prev[cursor];
                        if (!cursor) break;
                        names.push(cursor);
                    }
                    names.reverse();
                    return names.map(function (name) { return nodes[name].pos.clone(); });
                }
                queue.push(next);
            }
        }
        return [];
    }

    function createWorld(scene) {
        const FH = WORLD.FLOOR_HEIGHT;
        const W = WORLD.BUILDING_WIDTH;
        const D = WORLD.BUILDING_DEPTH;
        const totalHeight = WORLD.FLOOR_COUNT * FH;
        const buildingGroup = new THREE.Group();
        buildingGroup.name = "building";
        buildingGroup.renderOrder = 0;
        scene.add(buildingGroup);

        const matSlab = new THREE.MeshLambertMaterial({
            color: 0x9aa0aa, transparent: true, opacity: 0.3,
            depthWrite: false, side: THREE.DoubleSide
        });
        const matWall = new THREE.MeshLambertMaterial({
            color: 0x9999ff, transparent: true, opacity: 0.2,
            depthWrite: false, side: THREE.DoubleSide
        });
        const matInterior = new THREE.MeshLambertMaterial({
            color: 0xbbc5e6, transparent: true, opacity: 0.28,
            depthWrite: false, side: THREE.DoubleSide
        });
        const matSolid = new THREE.MeshLambertMaterial({ color: 0x777d86 });
        const matDark = new THREE.MeshLambertMaterial({ color: 0x3d424b });
        const matWood = new THREE.MeshLambertMaterial({ color: 0x8a6642 });
        const matWoodDark = new THREE.MeshLambertMaterial({ color: 0x5d4530 });
        const matFabric = new THREE.MeshLambertMaterial({ color: 0x5a6f8c });
        const matFabric2 = new THREE.MeshLambertMaterial({ color: 0x7a5f70 });
        const matMetal = new THREE.MeshLambertMaterial({ color: 0x8d949e });
        const matGlass = new THREE.MeshLambertMaterial({
            color: 0x9fd7ff, transparent: true, opacity: 0.18,
            depthWrite: false, side: THREE.DoubleSide
        });
        const matPlant = new THREE.MeshLambertMaterial({ color: 0x3f7d45 });
        const matPot = new THREE.MeshLambertMaterial({ color: 0x8a5a3b });
        const matShaft = new THREE.MeshLambertMaterial({
            color: 0x777d86, transparent: true, opacity: 0.18,
            depthWrite: false, side: THREE.DoubleSide
        });

        function box(parent, w, h, d, x, y, z, material, rotY) {
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
            mesh.position.set(x, y, z);
            if (rotY) mesh.rotation.y = rotY;
            parent.add(mesh);
            return mesh;
        }

        function cylinder(parent, radius, height, x, y, z, material) {
            const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 16), material);
            mesh.position.set(x, y, z);
            parent.add(mesh);
            return mesh;
        }

        function addPlant(x, z) {
            cylinder(buildingGroup, 0.22, 0.38, x, 0.19, z, matPot);
            const leaves = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 6), matPlant);
            leaves.position.set(x, 0.72, z);
            buildingGroup.add(leaves);
        }

        function addChair(parent, x, floorY, z, facing, colorMat) {
            const group = new THREE.Group();
            group.position.set(x, floorY, z);
            group.rotation.y = facing;
            const seat = box(group, 0.62, 0.12, 0.62, 0, 0.46, 0, colorMat || matFabric);
            const back = box(group, 0.62, 0.62, 0.1, 0, 0.78, -0.3, colorMat || matFabric);
            const leg1 = box(group, 0.06, 0.44, 0.06, -0.24, 0.22, -0.24, matDark);
            const leg2 = box(group, 0.06, 0.44, 0.06, 0.24, 0.22, -0.24, matDark);
            const leg3 = box(group, 0.06, 0.44, 0.06, -0.24, 0.22, 0.24, matDark);
            const leg4 = box(group, 0.06, 0.44, 0.06, 0.24, 0.22, 0.24, matDark);
            void seat;
            void back;
            void leg1;
            void leg2;
            void leg3;
            void leg4;
            parent.add(group);
            return group;
        }

        function addCouch(parent, x, floorY, z, facing) {
            const group = new THREE.Group();
            group.position.set(x, floorY, z);
            group.rotation.y = facing;
            box(group, 2.1, 0.42, 0.82, 0, 0.24, 0, matFabric);
            box(group, 2.1, 0.72, 0.22, 0, 0.72, -0.34, matFabric);
            box(group, 0.2, 0.55, 0.82, -1.02, 0.55, 0, matFabric2);
            box(group, 0.2, 0.55, 0.82, 1.02, 0.55, 0, matFabric2);
            parent.add(group);
            return group;
        }

        function addTable(parent, x, floorY, z, w, d, h) {
            box(parent, w, 0.1, d, x, floorY + (h || 0.74), z, matWood);
            const legH = (h || 0.74) - 0.05;
            box(parent, 0.09, legH, 0.09, x - w * 0.4, floorY + legH / 2, z - d * 0.35, matWoodDark);
            box(parent, 0.09, legH, 0.09, x + w * 0.4, floorY + legH / 2, z - d * 0.35, matWoodDark);
            box(parent, 0.09, legH, 0.09, x - w * 0.4, floorY + legH / 2, z + d * 0.35, matWoodDark);
            box(parent, 0.09, legH, 0.09, x + w * 0.4, floorY + legH / 2, z + d * 0.35, matWoodDark);
        }

        function addDesk(parent, x, floorY, z) {
            box(parent, 2.0, 0.12, 0.92, x, floorY + 0.74, z, matWood);
            box(parent, 0.08, 0.72, 0.08, x - 0.85, floorY + 0.36, z - 0.34, matDark);
            box(parent, 0.08, 0.72, 0.08, x + 0.85, floorY + 0.36, z - 0.34, matDark);
            box(parent, 0.08, 0.72, 0.08, x - 0.85, floorY + 0.36, z + 0.34, matDark);
            box(parent, 0.08, 0.72, 0.08, x + 0.85, floorY + 0.36, z + 0.34, matDark);
            box(parent, 0.72, 0.46, 0.06, x, floorY + 1.0, z - 0.25, matDark);
            box(parent, 0.06, 0.26, 0.12, x, floorY + 0.82, z - 0.16, matDark);
            box(parent, 0.45, 0.05, 0.26, x, floorY + 0.78, z + 0.1, matMetal);
        }

        function addWaterCooler(parent, x, z) {
            box(parent, 0.42, 0.95, 0.42, x, 0.48, z, matMetal);
            const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.55, 12), matGlass);
            bottle.position.set(x, 1.23, z);
            parent.add(bottle);
        }

        function makeNodes(floorNumber) {
            const y = floorNumber * FH;
            const nodes = {};
            function add(name, x, z) {
                nodes[name] = {
                    name: name,
                    pos: new THREE.Vector3(x, y, z),
                    links: []
                };
                return nodes[name];
            }
            function link(a, b) {
                if (!nodes[a] || !nodes[b]) return;
                if (nodes[a].links.indexOf(b) === -1) nodes[a].links.push(b);
                if (nodes[b].links.indexOf(a) === -1) nodes[b].links.push(a);
            }
            function chain(names) {
                for (let i = 0; i < names.length - 1; i += 1) link(names[i], names[i + 1]);
            }
            return { nodes: nodes, add: add, link: link, chain: chain, y: y };
        }

        function addHallRing(nodes, add, link) {
            add("hallS", 0, 2.8);
            add("hallSE", 3.0, 2.8);
            add("hallE", 3.0, 0);
            add("hallNE", 3.0, -2.8);
            add("hallN", 0, -2.8);
            add("hallNW", -3.0, -2.8);
            add("hallW", -3.0, 0);
            add("hallSW", -3.0, 2.8);
            add("elevWait", 0, 3.9);
            link("hallS", "hallSE");
            link("hallSE", "hallE");
            link("hallE", "hallNE");
            link("hallNE", "hallN");
            link("hallN", "hallNW");
            link("hallNW", "hallW");
            link("hallW", "hallSW");
            link("hallSW", "hallS");
            link("elevWait", "hallS");
        }

        // Shaft shell (leaves the front open so the car is visible).
        box(buildingGroup, 0.12, totalHeight, 3.1, -1.56, totalHeight / 2, 0, matShaft);
        box(buildingGroup, 0.12, totalHeight, 3.1, 1.56, totalHeight / 2, 0, matShaft);
        box(buildingGroup, 3.1, totalHeight, 0.12, 0, totalHeight / 2, -1.56, matShaft);
        box(buildingGroup, 0.1, totalHeight, 0.12, -1.6, totalHeight / 2, 1.56, matMetal);
        box(buildingGroup, 0.1, totalHeight, 0.12, 1.6, totalHeight / 2, 1.56, matMetal);

        // Slabs: ground and roof solid, upper floors as four strips around the shaft.
        box(buildingGroup, W, 0.24, D, 0, -0.13, 0, matSolid);
        box(buildingGroup, W, 0.24, D, 0, totalHeight + 0.12, 0, matSolid);
        for (let f = 1; f < WORLD.FLOOR_COUNT; f += 1) {
            const sy = f * FH - 0.06;
            box(buildingGroup, W, 0.12, D / 2 - 1.5, 0, sy, 1.5 + (D / 2 - 1.5) / 2, matSlab);
            box(buildingGroup, W, 0.12, D / 2 - 1.5, 0, sy, -1.5 - (D / 2 - 1.5) / 2, matSlab);
            box(buildingGroup, W / 2 - 1.5, 0.12, 3, 1.5 + (W / 2 - 1.5) / 2, sy, 0, matSlab);
            box(buildingGroup, W / 2 - 1.5, 0.12, 3, -1.5 - (W / 2 - 1.5) / 2, sy, 0, matSlab);
        }

        // Outer shell. Front wall is split so floor 0 has a real doorway.
        box(buildingGroup, 0.12, totalHeight, D, -W / 2, totalHeight / 2, 0, matWall);
        box(buildingGroup, 0.12, totalHeight, D, W / 2, totalHeight / 2, 0, matWall);
        box(buildingGroup, W, totalHeight, 0.12, 0, totalHeight / 2, -D / 2, matWall);
        box(buildingGroup, W / 2 - 1.5, totalHeight, 0.12, -1.5 - (W / 2 - 1.5) / 2, totalHeight / 2, D / 2, matWall);
        box(buildingGroup, W / 2 - 1.5, totalHeight, 0.12, 1.5 + (W / 2 - 1.5) / 2, totalHeight / 2, D / 2, matWall);
        box(buildingGroup, 3, totalHeight - FH, 0.12, 0, FH + (totalHeight - FH) / 2, D / 2, matWall);
        // Open visual-only glass doors, parked against the inside of the opening.
        const leftDoor = box(buildingGroup, 1.4, 2.35, 0.06, -2.15, 1.18, 8.78, matGlass, 1.15);
        const rightDoor = box(buildingGroup, 1.4, 2.35, 0.06, 2.15, 1.18, 8.78, matGlass, -1.15);
        void leftDoor;
        void rightDoor;

        // Sidewalk.
        box(buildingGroup, 12, 0.18, 5, 0, -0.09, 12, matSolid);

        const floors = [];

        // ---------------- Lobby ----------------
        (function buildLobby() {
            const m = makeNodes(0);
            const nodes = m.nodes;
            const add = m.add;
            const link = m.link;
            const chain = m.chain;

            add("outside", 0, 12);
            add("front_door_threshold", 0, 9.35);
            add("entrance", 0, 7.4);
            add("lobby_center", 0, 5.7);
            chain(["outside", "front_door_threshold", "entrance", "lobby_center"]);
            addHallRing(nodes, add, link);
            link("lobby_center", "elevWait");
            link("lobby_center", "hallS");
            link("entrance", "elevWait");

            add("cafe_door", -3.0, 6.0);
            add("cafe_order", -9.0, 6.0);
            add("reception", -3.0, 6.9);
            add("kiosk", 3.2, 6.9);
            add("lobby_wc_front", 2.8, 6.8);
            add("lobby_wc_back", -2.8, -7.8);
            add("lobby_stand_center", -1.0, 4.6);
            add("lobby_stand_NE", 4.2, 5.6);
            add("lobby_stand_NW", -4.4, 4.6);
            add("lobby_stand_midE", 4.5, -1.0);
            add("lobby_stand_midW", -4.5, -1.0);
            add("lobby_stand_entry", 0.0, 7.2);
            add("bistro0", -7.8, 5.2);
            add("bistro1", -6.2, 5.2);
            add("bistro2", -5.8, 7.4);
            add("bistro3", -4.2, 7.4);
            add("front_lounge0", 8.55, 5.5);
            add("front_lounge1", 8.55, 6.5);
            add("front_lounge2", 5.4, 4.4);
            add("front_lounge3", 5.4, 7.6);
            add("back_lounge_N", 4.8, -6.3);
            add("back_lounge_S", 4.8, -3.3);
            add("pit_N", -7.0, -7.3);
            add("pit_S", -7.0, -3.7);
            add("pit_E", -5.2, -5.5);
            add("pit_W", -8.8, -5.5);

            link("cafe_door", "hallSW");
            link("cafe_door", "cafe_order");
            link("cafe_order", "bistro0");
            link("bistro0", "bistro1");
            link("bistro1", "cafe_door");
            link("bistro2", "bistro3");
            link("bistro2", "cafe_door");
            link("reception", "lobby_center");
            link("kiosk", "lobby_center");
            link("kiosk", "entrance");
            link("lobby_wc_front", "lobby_center");
            link("lobby_wc_back", "hallNW");
            link("lobby_wc_back", "pit_N");
            link("lobby_stand_center", "lobby_center");
            link("lobby_stand_NE", "lobby_center");
            link("lobby_stand_NE", "hallSE");
            link("lobby_stand_NW", "lobby_center");
            link("lobby_stand_NW", "hallSW");
            link("lobby_stand_midE", "hallE");
            link("lobby_stand_midW", "hallW");
            link("lobby_stand_entry", "entrance");
            link("front_lounge0", "front_lounge1");
            link("front_lounge0", "hallSE");
            link("front_lounge2", "hallSE");
            link("front_lounge2", "front_lounge3");
            link("front_lounge3", "hallSE");
            link("back_lounge_N", "back_lounge_S");
            link("back_lounge_N", "hallNE");
            link("back_lounge_S", "hallSE");
            link("pit_N", "pit_S");
            link("pit_E", "pit_W");
            link("pit_N", "pit_E");
            link("pit_S", "pit_W");
            link("pit_N", "hallNW");
            link("pit_E", "hallN");

            // Cafe furniture.
            box(buildingGroup, 1.1, 1.0, 4.4, -10.1, 0.5, 6.0, matDark);
            box(buildingGroup, 1.25, 0.08, 4.55, -10.1, 1.04, 6.0, matWood);
            box(buildingGroup, 0.55, 0.65, 0.45, -10.0, 1.4, 5.0, matMetal);
            box(buildingGroup, 0.7, 0.45, 0.55, -10.0, 1.3, 6.9, matGlass);
            addTable(buildingGroup, -7.0, 0, 5.2, 1.1, 1.0, 0.72);
            addTable(buildingGroup, -5.0, 0, 7.4, 1.1, 1.0, 0.72);
            addChair(buildingGroup, -7.8, 0, 5.2, Math.PI / 2, matFabric2);
            addChair(buildingGroup, -6.2, 0, 5.2, -Math.PI / 2, matFabric2);
            addChair(buildingGroup, -5.8, 0, 7.4, Math.PI / 2, matFabric2);
            addChair(buildingGroup, -4.2, 0, 7.4, -Math.PI / 2, matFabric2);

            // Reception desk and kiosk.
            box(buildingGroup, 2.1, 1.0, 0.8, -3.0, 0.5, 7.5, matDark);
            box(buildingGroup, 2.25, 0.08, 0.95, -3.0, 1.04, 7.5, matWood);
            box(buildingGroup, 0.8, 1.8, 0.35, 3.2, 0.9, 7.6, matMetal);

            // Front lounge.
            addCouch(buildingGroup, 9.25, 0, 6.0, -Math.PI / 2);
            addChair(buildingGroup, 5.4, 0, 4.4, Math.PI / 4, matFabric2);
            addChair(buildingGroup, 5.4, 0, 7.6, Math.PI * 0.75, matFabric2);
            addTable(buildingGroup, 7.0, 0, 6.0, 1.8, 1.1, 0.45);

            // Back lounge.
            addCouch(buildingGroup, 5.5, 0, -7.0, 0);
            addCouch(buildingGroup, 5.5, 0, -2.6, Math.PI);
            addTable(buildingGroup, 5.5, 0, -4.8, 2.0, 1.0, 0.45);

            // Conversation pit.
            const pitTable = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.1, 24), matWood);
            pitTable.position.set(-7.0, 0.72, -5.5);
            buildingGroup.add(pitTable);
            cylinder(buildingGroup, 0.16, 0.7, -7.0, 0.35, -5.5, matWoodDark);
            addChair(buildingGroup, -7.0, 0, -7.3, 0, matFabric2);
            addChair(buildingGroup, -7.0, 0, -3.7, Math.PI, matFabric2);
            addChair(buildingGroup, -5.2, 0, -5.5, -Math.PI / 2, matFabric2);
            addChair(buildingGroup, -8.8, 0, -5.5, Math.PI / 2, matFabric2);

            addWaterCooler(buildingGroup, 3.4, 7.2);
            addWaterCooler(buildingGroup, -3.4, -8.1);
            addPlant(-2.1, 8.3);
            addPlant(2.1, 8.3);

            const callPanel = makeCallPanel(0);
            buildingGroup.add(callPanel);
            const shaftIndicator = makeShaftIndicator(0);
            buildingGroup.add(shaftIndicator);

            const sitTargets = {};
            Object.keys(nodes).forEach(function (name) {
                sitTargets[name] = { sit: false, facing: 0 };
            });
            const seated = {
                bistro0: Math.PI / 2, bistro1: -Math.PI / 2,
                bistro2: Math.PI / 2, bistro3: -Math.PI / 2,
                front_lounge0: -Math.PI / 2, front_lounge1: -Math.PI / 2,
                front_lounge2: Math.PI / 4, front_lounge3: Math.PI * 0.75,
                back_lounge_N: 0, back_lounge_S: Math.PI,
                pit_N: 0, pit_S: Math.PI, pit_E: -Math.PI / 2, pit_W: Math.PI / 2
            };
            Object.keys(seated).forEach(function (name) {
                sitTargets[name] = { sit: true, facing: seated[name] };
            });

            floors[0] = {
                floorNumber: 0,
                nodes: nodes,
                callPanel: callPanel,
                shaftIndicator: shaftIndicator,
                desks: [],
                sitTargets: sitTargets,
                entranceSpot: nodes.entrance.pos.clone(),
                cafeSpots: ["bistro0", "bistro1", "bistro2", "bistro3"],
                loungeSpots: ["front_lounge0", "front_lounge1", "front_lounge2", "front_lounge3"],
                backSpots: ["back_lounge_N", "back_lounge_S", "pit_N", "pit_S", "pit_E", "pit_W"],
                loiterSpots: [
                    "lobby_stand_center", "lobby_stand_NE", "lobby_stand_NW",
                    "lobby_stand_midE", "lobby_stand_midW", "lobby_stand_entry"
                ],
                standSpots: ["cafe_order", "reception", "kiosk", "lobby_wc_front", "lobby_wc_back"]
            };
        })();

        // ---------------- Office floors ----------------
        const deskIds = ["A", "B", "C", "D"];
        const deskCenters = [-8.25, -2.75, 2.75, 8.25];
        const confFacing = [0, 0, Math.PI, Math.PI];

        for (let f = 1; f < WORLD.FLOOR_COUNT; f += 1) {
            const m = makeNodes(f);
            const nodes = m.nodes;
            const add = m.add;
            const link = m.link;
            const y = m.y;
            addHallRing(nodes, add, link);
            add("hall_stand_N", 1.2, -2.8);
            add("hall_stand_S", -1.2, 2.8);
            link("hall_stand_N", "hallN");
            link("hall_stand_S", "hallS");

            // Back office partitions and front wall segments with door gaps.
            box(buildingGroup, 0.12, FH - 0.5, 5.0, -5.5, y + FH / 2, -6.5, matInterior);
            box(buildingGroup, 0.12, FH - 0.5, 5.0, 0, y + FH / 2, -6.5, matInterior);
            box(buildingGroup, 0.12, FH - 0.5, 5.0, 5.5, y + FH / 2, -6.5, matInterior);
            for (let i = 0; i < 4; i += 1) {
                const cx = deskCenters[i];
                const leftEdge = i === 0 ? -11 : (deskCenters[i - 1] + cx) / 2;
                const rightEdge = i === 3 ? 11 : (cx + deskCenters[i + 1]) / 2;
                const gapL = cx - 0.65;
                const gapR = cx + 0.65;
                if (gapL > leftEdge) {
                    box(buildingGroup, gapL - leftEdge, FH - 0.5, 0.1, (leftEdge + gapL) / 2, y + FH / 2, -4.0, matInterior);
                }
                if (rightEdge > gapR) {
                    box(buildingGroup, rightEdge - gapR, FH - 0.5, 0.1, (gapR + rightEdge) / 2, y + FH / 2, -4.0, matInterior);
                }
                add("office" + deskIds[i] + "_door", cx, -3.55);
                add("office" + deskIds[i] + "_desk", cx, -6.1);
                link("office" + deskIds[i] + "_door", "office" + deskIds[i] + "_desk");
                link("office" + deskIds[i] + "_door", "hallN");
                addDesk(buildingGroup, cx, y, -7.35);
                addChair(buildingGroup, cx, y, -6.1, Math.PI, matFabric);
            }

            // Conference room walls.
            box(buildingGroup, 8.0, FH - 0.5, 0.1, -7.0, y + FH / 2, 3.0, matInterior);
            box(buildingGroup, 0.1, FH - 0.5, 1.4, -3.0, y + FH / 2, 3.7, matInterior);
            box(buildingGroup, 0.1, FH - 0.5, 3.4, -3.0, y + FH / 2, 7.3, matInterior);
            add("conf_door", -2.65, 5.05);
            add("conf_center", -7.0, 6.0);
            link("conf_door", "hallSW");
            link("conf_door", "conf_center");
            addTable(buildingGroup, -7.0, y, 6.0, 3.8, 1.4, 0.76);
            const confSeats = [
                { name: "conf_seat0", x: -8.1, z: 4.7, face: 0 },
                { name: "conf_seat1", x: -5.9, z: 4.7, face: 0 },
                { name: "conf_seat2", x: -8.1, z: 7.3, face: Math.PI },
                { name: "conf_seat3", x: -5.9, z: 7.3, face: Math.PI }
            ];
            confSeats.forEach(function (seat) {
                add(seat.name, seat.x, seat.z);
                link(seat.name, "conf_center");
                addChair(buildingGroup, seat.x, y, seat.z, seat.face, matFabric2);
            });

            // Lounge walls and furniture.
            box(buildingGroup, 0.1, FH - 0.5, 1.4, 3.0, y + FH / 2, 3.7, matInterior);
            box(buildingGroup, 0.1, FH - 0.5, 3.4, 3.0, y + FH / 2, 7.3, matInterior);
            add("lounge_door", 3.3, 5.05);
            add("lounge_center", 7.0, 6.0);
            add("lounge_spot0", 8.55, 5.5);
            add("lounge_spot1", 8.55, 6.5);
            add("lounge_spot2", 5.4, 7.6);
            add("lounge_spot3", 5.4, 4.4);
            add("water_cooler", 4.5, 7.7);
            link("lounge_door", "hallSE");
            link("lounge_door", "lounge_center");
            link("lounge_center", "lounge_spot0");
            link("lounge_center", "lounge_spot1");
            link("lounge_center", "lounge_spot2");
            link("lounge_center", "lounge_spot3");
            link("lounge_center", "water_cooler");
            addCouch(buildingGroup, 9.25, y, 6.0, -Math.PI / 2);
            addChair(buildingGroup, 5.4, y, 7.6, Math.PI * 0.75, matFabric2);
            addChair(buildingGroup, 5.4, y, 4.4, Math.PI / 4, matFabric2);
            addTable(buildingGroup, 7.0, y, 6.0, 1.8, 1.1, 0.45);
            addWaterCooler(buildingGroup, 3.8, 7.9);
            addPlant(3.8, 3.9);

            const callPanel = makeCallPanel(y);
            buildingGroup.add(callPanel);
            const shaftIndicator = makeShaftIndicator(y);
            buildingGroup.add(shaftIndicator);

            const sitTargets = {};
            Object.keys(nodes).forEach(function (name) {
                sitTargets[name] = { sit: false, facing: 0 };
            });
            for (let i = 0; i < 4; i += 1) {
                sitTargets["office" + deskIds[i] + "_desk"] = { sit: true, facing: Math.PI };
            }
            confSeats.forEach(function (seat, index) {
                sitTargets[seat.name] = { sit: true, facing: confFacing[index] };
            });
            sitTargets.lounge_spot0 = { sit: true, facing: -Math.PI / 2 };
            sitTargets.lounge_spot1 = { sit: true, facing: -Math.PI / 2 };
            sitTargets.lounge_spot2 = { sit: true, facing: Math.PI * 0.75 };
            sitTargets.lounge_spot3 = { sit: true, facing: Math.PI / 4 };

            const desks = [];
            for (let i = 0; i < 4; i += 1) {
                desks.push({
                    id: deskIds[i],
                    floor: f,
                    wp: "office" + deskIds[i] + "_desk",
                    door: "office" + deskIds[i] + "_door",
                    x: deskCenters[i],
                    z: -6.1
                });
            }

            floors[f] = {
                floorNumber: f,
                nodes: nodes,
                callPanel: callPanel,
                shaftIndicator: shaftIndicator,
                desks: desks,
                sitTargets: sitTargets,
                confSeats: confSeats.map(function (seat) { return seat.name; }),
                loungeSpots: ["lounge_spot0", "lounge_spot1", "lounge_spot2", "lounge_spot3"],
                standSpots: ["water_cooler", "hall_stand_N", "hall_stand_S"]
            };
        }

        return {
            buildingGroup: buildingGroup,
            floors: floors,
            bfsPath: bfsPath,
            nearestNode: nearestNode
        };
    }

    window.WORLD = WORLD;
    window.createWorld = createWorld;
    window.createDisplayTexture = createDisplayTexture;
    window.updateDisplayTexture = updateDisplayTexture;
    window.nearestNode = nearestNode;
    window.bfsPath = bfsPath;
})();
