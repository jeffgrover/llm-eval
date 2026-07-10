(function () {
    "use strict";

    var WORLD = {
        FLOOR_HEIGHT: 3.4,
        FLOOR_COUNT: 6,
        BUILDING_WIDTH: 22,
        BUILDING_DEPTH: 18,
        SHAFT_WIDTH: 3,
        SHAFT_DEPTH: 3,
        PERSON_R: 0.4
    };

    function transparentMaterial(color, opacity) {
        return new THREE.MeshStandardMaterial({
            color: color,
            transparent: true,
            opacity: opacity,
            depthWrite: false,
            side: THREE.DoubleSide,
            roughness: 0.72,
            metalness: 0.04
        });
    }

    function solidMaterial(color, roughness) {
        return new THREE.MeshStandardMaterial({ color: color, roughness: roughness === undefined ? 0.7 : roughness, metalness: 0.05 });
    }

    function box(parent, width, height, depth, x, y, z, material) {
        var mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
        mesh.position.set(x, y, z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        parent.add(mesh);
        return mesh;
    }

    function cylinder(parent, radiusTop, radiusBottom, height, x, y, z, material) {
        var mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, 12), material);
        mesh.position.set(x, y, z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        parent.add(mesh);
        return mesh;
    }

    function setRenderOrder(root, order) {
        root.traverse(function (child) {
            if (child.isMesh) child.renderOrder = order;
        });
    }

    function createDigitalTexture(text) {
        var canvas = document.createElement("canvas");
        var context = canvas.getContext("2d");
        var texture;
        canvas.width = 256;
        canvas.height = 256;
        texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = true;
        texture.anisotropy = 4;
        texture._lastText = null;
        texture._context = context;
        updateDigitalTexture(texture, text || "0");
        return texture;
    }

    function updateDigitalTexture(texture, text) {
        var canvas;
        var context;
        if (texture._lastText === text) return;
        canvas = texture.image;
        context = texture._context || canvas.getContext("2d");
        context.fillStyle = "#050505";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = "#ffbb22";
        context.font = "bold 184px Arial";
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.shadowColor = "#ff8c00";
        context.shadowBlur = 18;
        context.fillText(String(text), canvas.width / 2, canvas.height / 2 + 4);
        context.shadowBlur = 0;
        texture._lastText = text;
        texture.needsUpdate = true;
    }

    function addNode(floor, name, x, z) {
        floor.nodes[name] = new THREE.Vector3(x, floor.floorNumber * WORLD.FLOOR_HEIGHT, z);
        floor.links[name] = [];
    }

    function link(floor, a, b) {
        if (!floor.links[a] || !floor.links[b]) return;
        if (floor.links[a].indexOf(b) < 0) floor.links[a].push(b);
        if (floor.links[b].indexOf(a) < 0) floor.links[b].push(a);
    }

    function addRingNodes(floor) {
        addNode(floor, "hallS", 0, 2.55);
        addNode(floor, "hallSE", 2.85, 2.75);
        addNode(floor, "hallE", 3.15, 0);
        addNode(floor, "hallNE", 2.85, -2.75);
        addNode(floor, "hallN", 0, -3.15);
        addNode(floor, "hallNW", -2.85, -2.75);
        addNode(floor, "hallW", -3.15, 0);
        addNode(floor, "hallSW", -2.85, 2.75);
        addNode(floor, "elevWait", 0, 2.08);
        link(floor, "hallS", "hallSE");
        link(floor, "hallSE", "hallE");
        link(floor, "hallE", "hallNE");
        link(floor, "hallNE", "hallN");
        link(floor, "hallN", "hallNW");
        link(floor, "hallNW", "hallW");
        link(floor, "hallW", "hallSW");
        link(floor, "hallSW", "hallS");
        link(floor, "elevWait", "hallS");
    }

    function chair(parent, x, y, z, rotationY, color) {
        var chairGroup = new THREE.Group();
        var mat = solidMaterial(color || 0x526273);
        var legMat = solidMaterial(0x2f3741);
        chairGroup.position.set(x, y, z);
        chairGroup.rotation.y = rotationY || 0;
        box(chairGroup, 0.75, 0.13, 0.72, 0, 0.48, 0, mat);
        box(chairGroup, 0.72, 0.58, 0.12, 0, 0.76, -0.29, mat);
        box(chairGroup, 0.08, 0.48, 0.08, -0.28, 0.23, 0.24, legMat);
        box(chairGroup, 0.08, 0.48, 0.08, 0.28, 0.23, 0.24, legMat);
        box(chairGroup, 0.08, 0.48, 0.08, -0.28, 0.23, -0.24, legMat);
        box(chairGroup, 0.08, 0.48, 0.08, 0.28, 0.23, -0.24, legMat);
        parent.add(chairGroup);
        return chairGroup;
    }

    function desk(parent, x, y, z, width, depth) {
        var deskGroup = new THREE.Group();
        var wood = solidMaterial(0x9b7655);
        var metal = solidMaterial(0x4e5860);
        var monitor = solidMaterial(0x172531, 0.28);
        deskGroup.position.set(x, y, z);
        box(deskGroup, width, 0.16, depth, 0, 0.78, 0, wood);
        box(deskGroup, 0.1, 0.75, 0.1, -width / 2 + 0.12, 0.37, -depth / 2 + 0.12, metal);
        box(deskGroup, 0.1, 0.75, 0.1, width / 2 - 0.12, 0.37, -depth / 2 + 0.12, metal);
        box(deskGroup, 0.1, 0.75, 0.1, -width / 2 + 0.12, 0.37, depth / 2 - 0.12, metal);
        box(deskGroup, 0.1, 0.75, 0.1, width / 2 - 0.12, 0.37, depth / 2 - 0.12, metal);
        box(deskGroup, 0.68, 0.45, 0.06, 0, 1.12, -depth / 2 + 0.18, monitor);
        box(deskGroup, 0.08, 0.26, 0.08, 0, 0.92, -depth / 2 + 0.18, metal);
        parent.add(deskGroup);
        return deskGroup;
    }

    function couch(parent, x, y, z, rotationY, color) {
        var group = new THREE.Group();
        var mat = solidMaterial(color || 0x7a879a);
        var dark = solidMaterial(0x394451);
        group.position.set(x, y, z);
        group.rotation.y = rotationY || 0;
        box(group, 2.35, 0.36, 0.78, 0, 0.42, 0, mat);
        box(group, 2.35, 0.74, 0.18, 0, 0.88, -0.32, mat);
        box(group, 0.12, 0.35, 0.12, -0.95, 0.16, 0.22, dark);
        box(group, 0.12, 0.35, 0.12, 0.95, 0.16, 0.22, dark);
        parent.add(group);
        return group;
    }

    function armchair(parent, x, y, z, rotationY, color) {
        var group = new THREE.Group();
        var mat = solidMaterial(color || 0x66758c);
        group.position.set(x, y, z);
        group.rotation.y = rotationY || 0;
        box(group, 0.9, 0.28, 0.82, 0, 0.43, 0, mat);
        box(group, 0.9, 0.65, 0.14, 0, 0.82, -0.33, mat);
        box(group, 0.12, 0.44, 0.78, -0.43, 0.62, 0, mat);
        box(group, 0.12, 0.44, 0.78, 0.43, 0.62, 0, mat);
        parent.add(group);
        return group;
    }

    function coffeeTable(parent, x, y, z, width, depth) {
        var wood = solidMaterial(0x74533b);
        box(parent, width || 1.5, 0.16, depth || 0.8, x, y + 0.43, z, wood);
        box(parent, 0.1, 0.42, 0.1, x - (width || 1.5) / 2 + 0.12, y + 0.21, z - (depth || 0.8) / 2 + 0.12, wood);
        box(parent, 0.1, 0.42, 0.1, x + (width || 1.5) / 2 - 0.12, y + 0.21, z + (depth || 0.8) / 2 - 0.12, wood);
    }

    function waterCooler(parent, x, y, z) {
        var base = solidMaterial(0xdcecf0, 0.35);
        var water = transparentMaterial(0x7fd7ed, 0.48);
        cylinder(parent, 0.22, 0.25, 0.72, x, y + 0.42, z, base);
        cylinder(parent, 0.21, 0.17, 0.5, x, y + 0.98, z, water);
        box(parent, 0.18, 0.06, 0.12, x, y + 0.67, z + 0.23, solidMaterial(0x2d3e49));
    }

    function plant(parent, x, y, z) {
        var pot = solidMaterial(0x8a5c43);
        var leaves = solidMaterial(0x426e45);
        cylinder(parent, 0.28, 0.22, 0.42, x, y + 0.21, z, pot);
        cylinder(parent, 0.04, 0.12, 1.0, x, y + 0.85, z, leaves);
        cylinder(parent, 0.04, 0.12, 0.85, x + 0.17, y + 0.78, z + 0.04, leaves);
        cylinder(parent, 0.04, 0.12, 0.85, x - 0.14, y + 0.77, z - 0.09, leaves);
    }

    function createArrow(color) {
        var shape = new THREE.Shape();
        shape.moveTo(0, 0.16);
        shape.lineTo(-0.13, -0.09);
        shape.lineTo(0.13, -0.09);
        shape.lineTo(0, 0.16);
        return new THREE.Mesh(new THREE.ShapeGeometry(shape), color);
    }

    function createCallPanel(parent, floorNumber) {
        var panel = new THREE.Group();
        var dark = new THREE.MeshStandardMaterial({ color: 0x1d2730, emissive: 0x000000, roughness: 0.45, side: THREE.DoubleSide });
        var glow = new THREE.MeshStandardMaterial({ color: 0x4cee8e, emissive: 0x22884f, emissiveIntensity: 1.4, roughness: 0.35, side: THREE.DoubleSide });
        var plate = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.4, 0.05), solidMaterial(0x3c4652));
        var up = createArrow(dark);
        var down = createArrow(dark);
        var tex = createDigitalTexture(String(floorNumber));
        var display = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.45), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
        panel.add(plate);
        up.position.set(-0.14, 0.31, 0.035);
        down.position.set(0.14, -0.31, 0.035);
        down.rotation.z = Math.PI;
        display.position.set(0, -0.01, 0.04);
        panel.add(up);
        panel.add(down);
        panel.add(display);
        panel.position.set(1.84, floorNumber * WORLD.FLOOR_HEIGHT + 1.23, 1.56);
        panel.userData.setUp = function (on) { up.material = on ? glow : dark; };
        panel.userData.setDown = function (on) { down.material = on ? glow : dark; };
        panel.userData.setIndicator = function (value) { updateDigitalTexture(tex, value); };
        parent.add(panel);
        return panel;
    }

    function createShaftIndicator(parent, floorNumber) {
        var group = new THREE.Group();
        var tex = createDigitalTexture(String(floorNumber));
        var screen = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
        var frame = new THREE.Mesh(new THREE.BoxGeometry(1.05, 1.05, 0.06), solidMaterial(0x252c32));
        group.add(frame);
        screen.position.z = 0.035;
        group.add(screen);
        group.position.set(0, floorNumber * WORLD.FLOOR_HEIGHT + 2.64, 1.56);
        group.userData.setIndicator = function (value) { updateDigitalTexture(tex, value); };
        parent.add(group);
        return group;
    }

    function addOfficeFloorFurniture(parent, floor) {
        var y = floor.floorNumber * WORLD.FLOOR_HEIGHT;
        var wallMat = transparentMaterial(0xbbc5e6, 0.28);
        var officeNames = ["A", "B", "C", "D"];
        var officeXs = [-7.7, -2.55, 2.55, 7.7];
        var officeDoors = ["hallNW", "hallNW", "hallNE", "hallNE"];
        var index;
        var x;
        var sep;
        var chairZ = -5.35;
        var deskZ = -6.35;
        var confY = y;
        var side;
        var seatName;
        var chairX;
        var chairZConf;

        for (sep = -5.1; sep <= 5.1; sep += 5.1) {
            box(parent, 0.12, 2.7, 5.55, sep, y + 1.35, -6.1, wallMat);
        }
        box(parent, 20.6, 2.7, 0.12, 0, y + 1.35, -3.15, wallMat);
        for (index = 0; index < officeNames.length; index += 1) {
            x = officeXs[index];
            desk(parent, x, y, deskZ, 2.05, 1.05);
            chair(parent, x, y, chairZ, Math.PI, 0x536c88);
            addNode(floor, "office" + officeNames[index] + "_door", x, -3.05);
            addNode(floor, "office" + officeNames[index] + "_desk", x, chairZ);
            link(floor, "office" + officeNames[index] + "_door", officeDoors[index]);
            link(floor, "office" + officeNames[index] + "_door", "office" + officeNames[index] + "_desk");
            floor.sitTargets["office" + officeNames[index] + "_desk"] = { sit: true, facing: Math.PI };
            floor.desks.push({ id: "office" + officeNames[index], wpName: "office" + officeNames[index] + "_desk", doorWpName: "office" + officeNames[index] + "_door" });
        }

        box(parent, 7.35, 0.16, 1.5, -7, confY + 0.78, 6.15, solidMaterial(0x9a7555));
        box(parent, 0.14, 0.72, 0.14, -10.15, confY + 0.35, 5.55, solidMaterial(0x4d555f));
        box(parent, 0.14, 0.72, 0.14, -3.85, confY + 0.35, 6.75, solidMaterial(0x4d555f));
        addNode(floor, "conf_door", -3.6, 3.8);
        addNode(floor, "conf_center", -7, 6.15);
        link(floor, "conf_door", "hallSW");
        link(floor, "conf_door", "conf_center");
        for (index = 0; index < 4; index += 1) {
            side = index < 2 ? -1 : 1;
            chairX = index % 2 === 0 ? -8.8 : -5.3;
            chairZConf = 6.15 + side * 1.22;
            chair(parent, chairX, confY, chairZConf, side < 0 ? 0 : Math.PI, 0x755e88);
            seatName = "conf_seat" + index;
            addNode(floor, seatName, chairX, chairZConf);
            link(floor, "conf_center", seatName);
            floor.sitTargets[seatName] = { sit: true, facing: side < 0 ? 0 : Math.PI };
        }

        couch(parent, 7.2, y, 7.15, Math.PI, 0x63738a);
        armchair(parent, 4.7, y, 4.75, Math.PI / 2, 0x7c687d);
        armchair(parent, 9.65, y, 4.75, -Math.PI / 2, 0x7c687d);
        coffeeTable(parent, 7.2, y, 5.65, 1.7, 0.82);
        waterCooler(parent, 10.0, y, 7.9);
        plant(parent, 4.2, y, 8.1);
        addNode(floor, "lounge_door", 3.65, 3.85);
        addNode(floor, "lounge_center", 7.2, 5.65);
        link(floor, "lounge_door", "hallSE");
        link(floor, "lounge_door", "lounge_center");
        addNode(floor, "lounge_spot0", 7.2, 7.05);
        addNode(floor, "lounge_spot1", 4.7, 4.75);
        addNode(floor, "lounge_spot2", 9.65, 4.75);
        link(floor, "lounge_center", "lounge_spot0");
        link(floor, "lounge_center", "lounge_spot1");
        link(floor, "lounge_center", "lounge_spot2");
        floor.sitTargets.lounge_spot0 = { sit: true, facing: Math.PI };
        floor.sitTargets.lounge_spot1 = { sit: true, facing: Math.PI / 2 };
        floor.sitTargets.lounge_spot2 = { sit: true, facing: -Math.PI / 2 };
        addNode(floor, "water_cooler", 9.45, 7.7);
        addNode(floor, "hall_stand_N", 0, -3.7);
        addNode(floor, "hall_stand_S", 0, 3.35);
        link(floor, "water_cooler", "lounge_center");
        link(floor, "hall_stand_N", "hallN");
        link(floor, "hall_stand_S", "hallS");
        floor.sitTargets.water_cooler = { sit: false, facing: 0 };
        floor.sitTargets.hall_stand_N = { sit: false, facing: 0 };
        floor.sitTargets.hall_stand_S = { sit: false, facing: Math.PI };
    }

    function addLobbyFurniture(parent, floor) {
        var y = 0;
        var index;
        var cafeSeats = [[-8.3, 4.1], [-7.2, 4.1], [-8.3, 6.4], [-7.2, 6.4], [-5.5, 4.1], [-4.4, 4.1], [-5.5, 6.4], [-4.4, 6.4]];
        var standNodes = [
            ["lobby_stand_center", 0.5, 4.7], ["lobby_stand_NE", 5.4, 3.9], ["lobby_stand_NW", -5.0, 3.7],
            ["lobby_stand_midE", 7.1, 0.7], ["lobby_stand_midW", -7.2, 0.4], ["lobby_stand_entry", 1.7, 7.1]
        ];
        var pitTargets = [["pit_N", -7.5, -4.8, Math.PI], ["pit_S", -7.5, -7.0, 0], ["pit_E", -6.35, -5.9, -Math.PI / 2], ["pit_W", -8.65, -5.9, Math.PI / 2]];

        addNode(floor, "outside", 0, 12);
        addNode(floor, "front_door_threshold", 0, 9.35);
        addNode(floor, "entrance", 0, 7.4);
        addNode(floor, "lobby_center", 0, 4.35);
        link(floor, "outside", "front_door_threshold");
        link(floor, "front_door_threshold", "entrance");
        link(floor, "entrance", "lobby_center");
        link(floor, "lobby_center", "elevWait");

        box(parent, 7.0, 0.95, 0.75, -7.25, y + 0.48, 7.25, solidMaterial(0x815e41));
        box(parent, 7.2, 0.13, 0.95, -7.25, y + 1.0, 7.25, solidMaterial(0xc1a074));
        box(parent, 0.75, 0.65, 0.45, -9.25, y + 1.37, 7.15, solidMaterial(0x272e36));
        box(parent, 1.05, 0.3, 0.52, -6.35, y + 1.22, 7.15, solidMaterial(0xe7c98e));
        addNode(floor, "cafe_order", -7.5, 6.35);
        link(floor, "cafe_order", "hallSW");
        floor.sitTargets.cafe_order = { sit: false, facing: Math.PI / 2 };

        for (index = 0; index < 4; index += 1) {
            var tx = index < 2 ? -7.75 : -4.95;
            var tz = index % 2 === 0 ? 4.1 : 6.4;
            cylinder(parent, 0.58, 0.46, 0.1, tx, y + 0.72, tz, solidMaterial(0x9a7656));
            cylinder(parent, 0.08, 0.08, 0.65, tx, y + 0.35, tz, solidMaterial(0x46515b));
        }
        for (index = 0; index < cafeSeats.length; index += 1) {
            chair(parent, cafeSeats[index][0], y, cafeSeats[index][1], index % 2 === 0 ? -Math.PI / 2 : Math.PI / 2, 0x687f85);
            addNode(floor, "cafe_seat" + index, cafeSeats[index][0], cafeSeats[index][1]);
            link(floor, "cafe_seat" + index, "cafe_order");
            floor.sitTargets["cafe_seat" + index] = { sit: true, facing: index % 2 === 0 ? -Math.PI / 2 : Math.PI / 2 };
        }

        couch(parent, 7.3, y, 6.9, Math.PI, 0x64768b);
        armchair(parent, 4.85, y, 5.0, Math.PI / 2, 0x7d687b);
        armchair(parent, 9.5, y, 5.0, -Math.PI / 2, 0x7d687b);
        coffeeTable(parent, 7.3, y, 5.55, 1.65, 0.82);
        addNode(floor, "front_lounge_couch", 7.3, 6.85);
        addNode(floor, "front_lounge_chair0", 4.85, 5.0);
        addNode(floor, "front_lounge_chair1", 9.5, 5.0);
        link(floor, "front_lounge_couch", "hallSE");
        link(floor, "front_lounge_chair0", "hallSE");
        link(floor, "front_lounge_chair1", "hallSE");
        floor.sitTargets.front_lounge_couch = { sit: true, facing: Math.PI };
        floor.sitTargets.front_lounge_chair0 = { sit: true, facing: Math.PI / 2 };
        floor.sitTargets.front_lounge_chair1 = { sit: true, facing: -Math.PI / 2 };

        couch(parent, -0.2, y, -3.85, 0, 0x6e8294);
        couch(parent, -0.2, y, -7.0, Math.PI, 0x6e8294);
        coffeeTable(parent, -0.2, y, -5.45, 2.0, 0.85);
        addNode(floor, "back_lounge_N", -0.2, -3.85);
        addNode(floor, "back_lounge_S", -0.2, -7.0);
        link(floor, "back_lounge_N", "hallN");
        link(floor, "back_lounge_S", "back_lounge_N");
        floor.sitTargets.back_lounge_N = { sit: true, facing: 0 };
        floor.sitTargets.back_lounge_S = { sit: true, facing: Math.PI };

        cylinder(parent, 1.05, 1.05, 0.13, -7.5, y + 0.72, -5.9, solidMaterial(0x977051));
        cylinder(parent, 0.1, 0.1, 0.62, -7.5, y + 0.34, -5.9, solidMaterial(0x424d58));
        for (index = 0; index < pitTargets.length; index += 1) {
            armchair(parent, pitTargets[index][1], y, pitTargets[index][2], pitTargets[index][3], 0x806f80);
            addNode(floor, pitTargets[index][0], pitTargets[index][1], pitTargets[index][2]);
            link(floor, pitTargets[index][0], "hallNW");
            floor.sitTargets[pitTargets[index][0]] = { sit: true, facing: pitTargets[index][3] };
        }

        waterCooler(parent, 9.5, y, 1.2);
        waterCooler(parent, -9.5, y, -0.8);
        addNode(floor, "lobby_wc_front", 9.0, 1.2);
        addNode(floor, "lobby_wc_back", -9.0, -0.8);
        link(floor, "lobby_wc_front", "hallE");
        link(floor, "lobby_wc_back", "hallW");
        floor.sitTargets.lobby_wc_front = { sit: false, facing: Math.PI / 2 };
        floor.sitTargets.lobby_wc_back = { sit: false, facing: -Math.PI / 2 };

        box(parent, 2.0, 0.92, 0.75, -3.25, y + 0.46, 6.0, solidMaterial(0x786049));
        box(parent, 2.12, 0.12, 0.9, -3.25, y + 0.97, 6.0, solidMaterial(0xb7986d));
        addNode(floor, "reception", -2.55, 5.1);
        link(floor, "reception", "hallSW");
        floor.sitTargets.reception = { sit: false, facing: Math.PI / 2 };
        box(parent, 0.7, 1.25, 0.45, 2.65, y + 0.62, 6.7, solidMaterial(0x435362));
        box(parent, 0.42, 0.5, 0.07, 2.65, y + 1.38, 6.91, solidMaterial(0x1b2937));
        addNode(floor, "kiosk", 2.15, 6.35);
        link(floor, "kiosk", "entrance");
        floor.sitTargets.kiosk = { sit: false, facing: 0 };
        for (index = 0; index < standNodes.length; index += 1) {
            addNode(floor, standNodes[index][0], standNodes[index][1], standNodes[index][2]);
            link(floor, standNodes[index][0], "lobby_center");
            floor.sitTargets[standNodes[index][0]] = { sit: false, facing: 0 };
        }
        plant(parent, -1.85, y, 8.0);
        plant(parent, 1.85, y, 8.0);
    }

    function bfsPath(nodes, fromName, toName) {
        var links = nodes._links || {};
        var queue;
        var previous;
        var current;
        var next;
        var path;
        var index;
        if (!nodes[fromName] || !nodes[toName]) return [];
        if (fromName === toName) return [nodes[toName].clone()];
        queue = [fromName];
        previous = {};
        previous[fromName] = null;
        while (queue.length) {
            current = queue.shift();
            if (current === toName) break;
            for (index = 0; index < (links[current] || []).length; index += 1) {
                next = links[current][index];
                if (previous[next] === undefined) {
                    previous[next] = current;
                    queue.push(next);
                }
            }
        }
        if (previous[toName] === undefined) return [nodes[toName].clone()];
        path = [];
        current = toName;
        while (current !== null) {
            path.unshift(nodes[current].clone());
            current = previous[current];
        }
        return path;
    }

    function createWorld(scene) {
        var buildingGroup = new THREE.Group();
        var floors = [];
        var floorNumber;
        var y;
        var floorMat = transparentMaterial(0x909aa6, 0.3);
        var wallMat = transparentMaterial(0x9999ff, 0.2);
        var slabThickness = 0.16;
        var halfW = WORLD.BUILDING_WIDTH / 2;
        var halfD = WORLD.BUILDING_DEPTH / 2;
        var shaftHalf = WORLD.SHAFT_WIDTH / 2;
        var frameMat = transparentMaterial(0x8295a5, 0.18);

        scene.add(buildingGroup);
        box(buildingGroup, WORLD.BUILDING_WIDTH + 5, 0.22, 5.0, 0, -0.14, 11.5, solidMaterial(0x6c7177));
        for (floorNumber = 0; floorNumber < WORLD.FLOOR_COUNT; floorNumber += 1) {
            y = floorNumber * WORLD.FLOOR_HEIGHT;
            box(buildingGroup, WORLD.BUILDING_WIDTH, slabThickness, halfD - shaftHalf, 0, y - slabThickness / 2, -(halfD + shaftHalf) / 2, floorMat);
            box(buildingGroup, WORLD.BUILDING_WIDTH, slabThickness, halfD - shaftHalf, 0, y - slabThickness / 2, (halfD + shaftHalf) / 2, floorMat);
            box(buildingGroup, halfW - shaftHalf, slabThickness, WORLD.SHAFT_DEPTH, -(halfW + shaftHalf) / 2, y - slabThickness / 2, 0, floorMat);
            box(buildingGroup, halfW - shaftHalf, slabThickness, WORLD.SHAFT_DEPTH, (halfW + shaftHalf) / 2, y - slabThickness / 2, 0, floorMat);
        }
        box(buildingGroup, WORLD.BUILDING_WIDTH, 0.2, WORLD.BUILDING_DEPTH, 0, WORLD.FLOOR_COUNT * WORLD.FLOOR_HEIGHT + 0.06, 0, solidMaterial(0x777b80));
        box(buildingGroup, 0.14, WORLD.FLOOR_COUNT * WORLD.FLOOR_HEIGHT, WORLD.BUILDING_DEPTH, -halfW, WORLD.FLOOR_COUNT * WORLD.FLOOR_HEIGHT / 2, 0, wallMat);
        box(buildingGroup, 0.14, WORLD.FLOOR_COUNT * WORLD.FLOOR_HEIGHT, WORLD.BUILDING_DEPTH, halfW, WORLD.FLOOR_COUNT * WORLD.FLOOR_HEIGHT / 2, 0, wallMat);
        box(buildingGroup, WORLD.BUILDING_WIDTH, WORLD.FLOOR_COUNT * WORLD.FLOOR_HEIGHT, 0.14, 0, WORLD.FLOOR_COUNT * WORLD.FLOOR_HEIGHT / 2, -halfD, wallMat);
        box(buildingGroup, halfW - 1.5, WORLD.FLOOR_COUNT * WORLD.FLOOR_HEIGHT, 0.14, -(halfW + 1.5) / 2, WORLD.FLOOR_COUNT * WORLD.FLOOR_HEIGHT / 2, halfD, wallMat);
        box(buildingGroup, halfW - 1.5, WORLD.FLOOR_COUNT * WORLD.FLOOR_HEIGHT, 0.14, (halfW + 1.5) / 2, WORLD.FLOOR_COUNT * WORLD.FLOOR_HEIGHT / 2, halfD, wallMat);
        box(buildingGroup, 3.0, (WORLD.FLOOR_COUNT - 1) * WORLD.FLOOR_HEIGHT, 0.14, 0, WORLD.FLOOR_HEIGHT + ((WORLD.FLOOR_COUNT - 1) * WORLD.FLOOR_HEIGHT) / 2, halfD, wallMat);
        box(buildingGroup, 0.08, 2.3, 0.07, -1.45, 1.15, halfD + 0.03, transparentMaterial(0xbce7ff, 0.25));
        box(buildingGroup, 0.08, 2.3, 0.07, 1.45, 1.15, halfD + 0.03, transparentMaterial(0xbce7ff, 0.25));
        box(buildingGroup, 0.1, WORLD.FLOOR_COUNT * WORLD.FLOOR_HEIGHT, 0.1, -shaftHalf, WORLD.FLOOR_COUNT * WORLD.FLOOR_HEIGHT / 2, -shaftHalf, frameMat);
        box(buildingGroup, 0.1, WORLD.FLOOR_COUNT * WORLD.FLOOR_HEIGHT, 0.1, shaftHalf, WORLD.FLOOR_COUNT * WORLD.FLOOR_HEIGHT / 2, -shaftHalf, frameMat);
        box(buildingGroup, 0.1, WORLD.FLOOR_COUNT * WORLD.FLOOR_HEIGHT, 0.1, -shaftHalf, WORLD.FLOOR_COUNT * WORLD.FLOOR_HEIGHT / 2, shaftHalf, frameMat);
        box(buildingGroup, 0.1, WORLD.FLOOR_COUNT * WORLD.FLOOR_HEIGHT, 0.1, shaftHalf, WORLD.FLOOR_COUNT * WORLD.FLOOR_HEIGHT / 2, shaftHalf, frameMat);

        for (floorNumber = 0; floorNumber < WORLD.FLOOR_COUNT; floorNumber += 1) {
            var floor = { floorNumber: floorNumber, nodes: {}, links: {}, callPanel: null, shaftIndicator: null, desks: [], sitTargets: {} };
            floor.nodes._links = floor.links;
            addRingNodes(floor);
            floor.callPanel = createCallPanel(buildingGroup, floorNumber);
            floor.shaftIndicator = createShaftIndicator(buildingGroup, floorNumber);
            if (floorNumber === 0) addLobbyFurniture(buildingGroup, floor);
            else addOfficeFloorFurniture(buildingGroup, floor);
            floors.push(floor);
        }
        setRenderOrder(buildingGroup, 0);
        return { buildingGroup: buildingGroup, floors: floors, bfsPath: bfsPath };
    }

    window.WORLD = WORLD;
    window.createWorld = createWorld;
    window.createDigitalTexture = createDigitalTexture;
    window.updateDigitalTexture = updateDigitalTexture;
}());
