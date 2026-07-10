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

    function officeTransparentMaterial(color, opacity) {
        return new THREE.MeshStandardMaterial({
            color: color,
            transparent: true,
            opacity: opacity,
            depthWrite: false,
            side: THREE.DoubleSide,
            roughness: 0.72,
            metalness: 0.02
        });
    }

    function officeSolidMaterial(color, roughness) {
        return new THREE.MeshStandardMaterial({
            color: color,
            roughness: roughness === undefined ? 0.72 : roughness,
            metalness: 0.04,
            side: THREE.DoubleSide
        });
    }

    function officeAddBox(parent, size, position, material, name) {
        var mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), material);
        mesh.position.set(position[0], position[1], position[2]);
        mesh.name = name || "office-box";
        parent.add(mesh);
        return mesh;
    }

    function officeAddCylinder(parent, radiusTop, radiusBottom, height, position, material, segments) {
        var mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments || 12), material);
        mesh.position.set(position[0], position[1], position[2]);
        parent.add(mesh);
        return mesh;
    }

    function updateOfficeTextTexture(texture, text) {
        var displayText = String(text);
        if (texture._lastText === displayText) {
            return;
        }
        texture._lastText = displayText;
        var canvas = texture.image;
        var context = canvas.getContext("2d");
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = "#050505";
        context.fillRect(0, 0, canvas.width, canvas.height);
        var fontSize = displayText.length > 2 ? 132 : 178;
        context.font = "900 " + fontSize + "px ui-monospace, SFMono-Regular, Menlo, monospace";
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillStyle = "#ffbb22";
        context.shadowColor = "#ff8a00";
        context.shadowBlur = 24;
        context.fillText(displayText, canvas.width * 0.5, canvas.height * 0.52);
        texture.needsUpdate = true;
    }

    function makeOfficeTextTexture(initialText) {
        var canvas = document.createElement("canvas");
        canvas.width = 256;
        canvas.height = 256;
        var texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.LinearFilter;
        texture.minFilter = THREE.LinearFilter;
        texture.generateMipmaps = true;
        texture.anisotropy = 8;
        texture._lastText = null;
        updateOfficeTextTexture(texture, initialText);
        return texture;
    }

    function officeMakeChair(parent, x, floorY, z, facing, color) {
        var chair = new THREE.Group();
        chair.position.set(x, floorY, z);
        chair.rotation.y = facing;
        var chairMaterial = officeSolidMaterial(color || 0x516276, 0.82);
        officeAddBox(chair, [0.62, 0.12, 0.62], [0, 0.47, 0], chairMaterial, "chair-seat");
        officeAddBox(chair, [0.62, 0.64, 0.11], [0, 0.76, -0.28], chairMaterial, "chair-backrest");
        var legMaterial = officeSolidMaterial(0x343b44, 0.55);
        [-0.23, 0.23].forEach(function (legX) {
            [-0.22, 0.22].forEach(function (legZ) {
                officeAddBox(chair, [0.07, 0.43, 0.07], [legX, 0.22, legZ], legMaterial, "chair-leg");
            });
        });
        parent.add(chair);
        return chair;
    }

    function officeMakeSofa(parent, x, floorY, z, facing, width, color) {
        var sofa = new THREE.Group();
        sofa.position.set(x, floorY, z);
        sofa.rotation.y = facing;
        var sofaMaterial = officeSolidMaterial(color || 0x617a82, 0.88);
        officeAddBox(sofa, [width, 0.28, 0.78], [0, 0.36, 0], sofaMaterial, "sofa-seat");
        officeAddBox(sofa, [width, 0.78, 0.2], [0, 0.73, -0.34], sofaMaterial, "sofa-backrest");
        officeAddBox(sofa, [0.2, 0.55, 0.82], [-(width * 0.5 - 0.1), 0.48, 0], sofaMaterial, "sofa-arm");
        officeAddBox(sofa, [0.2, 0.55, 0.82], [(width * 0.5 - 0.1), 0.48, 0], sofaMaterial, "sofa-arm");
        parent.add(sofa);
        return sofa;
    }

    function officeMakeTable(parent, x, floorY, z, width, depth, height, color) {
        var tabletopMaterial = officeSolidMaterial(color || 0x9b7652, 0.68);
        var metalMaterial = officeSolidMaterial(0x3d444b, 0.52);
        officeAddBox(parent, [width, 0.14, depth], [x, floorY + height, z], tabletopMaterial, "tabletop");
        var offsetX = Math.max(0.2, width * 0.5 - 0.28);
        var offsetZ = Math.max(0.2, depth * 0.5 - 0.28);
        [-offsetX, offsetX].forEach(function (legX) {
            [-offsetZ, offsetZ].forEach(function (legZ) {
                officeAddBox(parent, [0.09, height, 0.09], [x + legX, floorY + height * 0.5, z + legZ], metalMaterial, "table-leg");
            });
        });
    }

    function officeMakeDesk(parent, x, floorY, z) {
        officeMakeTable(parent, x, floorY, z, 2.3, 0.9, 0.78, 0x8d6e4f);
        var monitorMaterial = officeSolidMaterial(0x202a33, 0.42);
        officeAddBox(parent, [0.95, 0.58, 0.08], [x, floorY + 1.18, z - 0.3], monitorMaterial, "desk-monitor");
        officeAddBox(parent, [0.08, 0.35, 0.08], [x, floorY + 0.95, z - 0.26], monitorMaterial, "monitor-stand");
        officeAddBox(parent, [0.92, 0.025, 0.3], [x, floorY + 0.86, z + 0.12], officeSolidMaterial(0x303840, 0.7), "keyboard");
    }

    function officeMakeWaterCooler(parent, x, floorY, z) {
        var cooler = new THREE.Group();
        cooler.position.set(x, floorY, z);
        officeAddBox(cooler, [0.5, 0.95, 0.5], [0, 0.48, 0], officeSolidMaterial(0xe8eef0, 0.62), "water-cooler");
        var bottle = officeAddCylinder(cooler, 0.2, 0.17, 0.62, [0, 1.22, 0], officeTransparentMaterial(0x79cce6, 0.52), 14);
        bottle.material.depthWrite = false;
        officeAddBox(cooler, [0.12, 0.08, 0.18], [0, 0.8, 0.31], officeSolidMaterial(0x397ea6, 0.5), "cooler-tap");
        parent.add(cooler);
    }

    function officeMakePlant(parent, x, floorY, z, scale) {
        var plantScale = scale || 1;
        officeAddCylinder(parent, 0.34 * plantScale, 0.28 * plantScale, 0.55 * plantScale, [x, floorY + 0.28 * plantScale, z], officeSolidMaterial(0x9a6744, 0.9), 12);
        var leafMaterial = officeSolidMaterial(0x397453, 0.92);
        for (var leafIndex = 0; leafIndex < 7; leafIndex += 1) {
            var angle = leafIndex * Math.PI * 2 / 7;
            var leaf = new THREE.Mesh(new THREE.SphereGeometry(0.26 * plantScale, 8, 6), leafMaterial);
            leaf.scale.set(0.7, 1.6, 0.55);
            leaf.position.set(x + Math.cos(angle) * 0.22 * plantScale, floorY + (0.72 + (leafIndex % 2) * 0.18) * plantScale, z + Math.sin(angle) * 0.22 * plantScale);
            leaf.rotation.z = Math.cos(angle) * 0.42;
            leaf.rotation.x = Math.sin(angle) * 0.42;
            parent.add(leaf);
        }
    }

    function officeMakeBistroTable(parent, x, floorY, z) {
        officeAddCylinder(parent, 0.62, 0.62, 0.09, [x, floorY + 0.77, z], officeSolidMaterial(0xb08962, 0.72), 18);
        officeAddCylinder(parent, 0.08, 0.08, 0.72, [x, floorY + 0.38, z], officeSolidMaterial(0x3e444a, 0.55), 10);
        officeAddCylinder(parent, 0.35, 0.35, 0.05, [x, floorY + 0.04, z], officeSolidMaterial(0x3e444a, 0.55), 14);
    }

    function officeMakeNodeGraph(floorNumber) {
        var floorY = floorNumber * WORLD.FLOOR_HEIGHT;
        var nodes = {};
        function addNode(name, x, z) {
            nodes[name] = { name: name, pos: new THREE.Vector3(x, floorY, z), links: new Set() };
            return nodes[name];
        }
        function link(left, right) {
            if (!nodes[left] || !nodes[right]) {
                return;
            }
            nodes[left].links.add(right);
            nodes[right].links.add(left);
        }
        addNode("elevWait", 0, 2.05);
        addNode("hallS", 0, 2.72);
        addNode("hallSE", 2.72, 2.72);
        addNode("hallE", 2.72, 0);
        addNode("hallNE", 2.72, -2.72);
        addNode("hallN", 0, -2.72);
        addNode("hallNW", -2.72, -2.72);
        addNode("hallW", -2.72, 0);
        addNode("hallSW", -2.72, 2.72);
        link("elevWait", "hallS");
        [["hallS", "hallSE"], ["hallSE", "hallE"], ["hallE", "hallNE"], ["hallNE", "hallN"], ["hallN", "hallNW"], ["hallNW", "hallW"], ["hallW", "hallSW"], ["hallSW", "hallS"]].forEach(function (pair) {
            link(pair[0], pair[1]);
        });
        return { nodes: nodes, addNode: addNode, link: link };
    }

    function bfsPath(nodes, fromName, toName) {
        if (!nodes || !nodes[fromName] || !nodes[toName]) {
            return [];
        }
        if (fromName === toName) {
            return [nodes[toName].pos.clone()];
        }
        var queue = [fromName];
        var visited = new Set([fromName]);
        var previous = {};
        while (queue.length) {
            var current = queue.shift();
            if (current === toName) {
                break;
            }
            nodes[current].links.forEach(function (nextName) {
                if (!visited.has(nextName)) {
                    visited.add(nextName);
                    previous[nextName] = current;
                    queue.push(nextName);
                }
            });
        }
        if (!visited.has(toName)) {
            return [nodes[toName].pos.clone()];
        }
        var names = [toName];
        var cursor = toName;
        while (cursor !== fromName) {
            cursor = previous[cursor];
            names.push(cursor);
        }
        names.reverse();
        return names.slice(1).map(function (name) { return nodes[name].pos.clone(); });
    }

    function officeMakeCallPanel(parent, floorNumber) {
        var floorY = floorNumber * WORLD.FLOOR_HEIGHT;
        var panel = new THREE.Group();
        panel.position.set(2.0, floorY + 1.35, 1.56);
        var plateMaterial = officeSolidMaterial(0x2d343c, 0.48);
        officeAddBox(panel, [0.58, 1.42, 0.07], [0, 0, 0], plateMaterial, "call-panel-plate");
        var darkMaterial = new THREE.MeshStandardMaterial({ color: 0x32383c, emissive: 0x000000, side: THREE.DoubleSide });
        var glowMaterial = new THREE.MeshStandardMaterial({ color: 0x86ff9a, emissive: 0x35ff62, emissiveIntensity: 1.8, side: THREE.DoubleSide });
        function arrowShape(up) {
            var shape = new THREE.Shape();
            if (up) {
                shape.moveTo(0, 0.13);
                shape.lineTo(-0.13, -0.11);
                shape.lineTo(0.13, -0.11);
            } else {
                shape.moveTo(0, -0.13);
                shape.lineTo(-0.13, 0.11);
                shape.lineTo(0.13, 0.11);
            }
            shape.closePath();
            return shape;
        }
        var upArrow = new THREE.Mesh(new THREE.ShapeGeometry(arrowShape(true)), darkMaterial);
        upArrow.position.set(0, 0.46, 0.041);
        panel.add(upArrow);
        var downArrow = new THREE.Mesh(new THREE.ShapeGeometry(arrowShape(false)), darkMaterial);
        downArrow.position.set(0, -0.46, 0.041);
        panel.add(downArrow);
        var panelTexture = makeOfficeTextTexture(String(floorNumber));
        var display = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.44), new THREE.MeshBasicMaterial({ map: panelTexture, side: THREE.DoubleSide }));
        display.position.set(0, 0, 0.042);
        panel.add(display);
        panel.userData.setUp = function (on) { upArrow.material = on ? glowMaterial : darkMaterial; };
        panel.userData.setDown = function (on) { downArrow.material = on ? glowMaterial : darkMaterial; };
        panel.userData.setIndicator = function (text) { updateOfficeTextTexture(panelTexture, text); };
        panel.userData.texture = panelTexture;
        parent.add(panel);
        return panel;
    }

    function officeMakeShaftIndicator(parent, floorNumber) {
        var floorY = floorNumber * WORLD.FLOOR_HEIGHT;
        var indicator = new THREE.Group();
        indicator.position.set(0, floorY + 2.83, 1.57);
        officeAddBox(indicator, [1.02, 1.02, 0.08], [0, 0, -0.03], officeSolidMaterial(0x24292f, 0.52), "shaft-indicator-frame");
        var texture = makeOfficeTextTexture("0");
        var display = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }));
        display.position.z = 0.02;
        indicator.add(display);
        indicator.userData.setIndicator = function (text) { updateOfficeTextTexture(texture, text); };
        indicator.userData.texture = texture;
        parent.add(indicator);
        return indicator;
    }

    function officeAddStandingTarget(sitTargets, nodes, name, facing) {
        sitTargets[name] = { sit: false, facing: facing || 0, position: nodes[name].pos };
    }

    function officeBuildFloorGraphAndFurniture(buildingGroup, floorNumber, interiorMaterial) {
        var floorY = floorNumber * WORLD.FLOOR_HEIGHT;
        var graph = officeMakeNodeGraph(floorNumber);
        var nodes = graph.nodes;
        var sitTargets = {};
        var desks = [];
        var letters = ["A", "B", "C", "D"];
        var officeCenters = [-8.25, -2.75, 2.75, 8.25];

        [-5.5, 0, 5.5].forEach(function (wallX) {
            officeAddBox(buildingGroup, [0.09, 2.75, 6.0], [wallX, floorY + 1.38, -6.0], interiorMaterial, "office-divider");
        });
        officeCenters.forEach(function (officeX, officeIndex) {
            officeAddBox(buildingGroup, [2.15, 2.75, 0.09], [officeX - 1.675, floorY + 1.38, -3.0], interiorMaterial, "office-front-wall");
            officeAddBox(buildingGroup, [2.15, 2.75, 0.09], [officeX + 1.675, floorY + 1.38, -3.0], interiorMaterial, "office-front-wall");
            officeMakeDesk(buildingGroup, officeX, floorY, -7.35);
            officeMakeChair(buildingGroup, officeX, floorY, -5.87, Math.PI, 0x485b70 + officeIndex * 0x070400);
            var letter = letters[officeIndex];
            var doorName = "office" + letter + "_door";
            var deskName = "office" + letter + "_desk";
            graph.addNode(doorName, officeX, -2.92);
            graph.addNode(deskName, officeX, -5.87);
            graph.link(doorName, deskName);
            if (officeIndex === 0) graph.link(doorName, "hallNW");
            if (officeIndex === 1) graph.link(doorName, "hallN");
            if (officeIndex === 2) graph.link(doorName, "hallN");
            if (officeIndex === 3) graph.link(doorName, "hallNE");
            sitTargets[deskName] = { sit: true, facing: Math.PI, position: nodes[deskName].pos };
            officeAddStandingTarget(sitTargets, nodes, doorName, 0);
            desks.push({ id: letter, waypoint: deskName, doorWaypoint: doorName, position: nodes[deskName].pos });
        });

        officeAddBox(buildingGroup, [0.09, 2.75, 1.2], [-3, floorY + 1.38, 3.6], interiorMaterial, "conference-wall");
        officeAddBox(buildingGroup, [0.09, 2.75, 3.6], [-3, floorY + 1.38, 7.2], interiorMaterial, "conference-wall");
        officeAddBox(buildingGroup, [0.09, 2.75, 1.2], [3, floorY + 1.38, 3.6], interiorMaterial, "lounge-wall");
        officeAddBox(buildingGroup, [0.09, 2.75, 3.6], [3, floorY + 1.38, 7.2], interiorMaterial, "lounge-wall");

        officeMakeTable(buildingGroup, -6.7, floorY, 6.1, 2.2, 3.5, 0.78, 0x8e7157);
        var confSeatSpecs = [
            { x: -8.2, z: 5.25, facing: Math.PI * 0.5 },
            { x: -8.2, z: 6.95, facing: Math.PI * 0.5 },
            { x: -5.2, z: 5.25, facing: -Math.PI * 0.5 },
            { x: -5.2, z: 6.95, facing: -Math.PI * 0.5 }
        ];
        graph.addNode("conf_door", -3.15, 4.25);
        graph.addNode("conf_center", -4.4, 5.3);
        graph.link("conf_door", "hallSW");
        graph.link("conf_door", "conf_center");
        confSeatSpecs.forEach(function (seat, seatIndex) {
            var seatName = "conf_seat" + seatIndex;
            officeMakeChair(buildingGroup, seat.x, floorY, seat.z, seat.facing, 0x625b76);
            graph.addNode(seatName, seat.x, seat.z);
            graph.link("conf_center", seatName);
            sitTargets[seatName] = { sit: true, facing: seat.facing, position: nodes[seatName].pos };
        });

        graph.addNode("lounge_door", 3.15, 4.25);
        graph.addNode("lounge_center", 5.1, 5.35);
        graph.link("lounge_door", "hallSE");
        graph.link("lounge_door", "lounge_center");
        officeMakeSofa(buildingGroup, 8.2, floorY, 7.55, Math.PI, 2.8, 0x54777a);
        officeMakeChair(buildingGroup, 5.25, floorY, 7.0, Math.PI, 0x6f7d69);
        officeMakeChair(buildingGroup, 8.8, floorY, 4.8, 0, 0x6f7d69);
        officeMakeTable(buildingGroup, 7.1, floorY, 6.0, 1.7, 0.85, 0.52, 0x886a4b);
        officeMakeWaterCooler(buildingGroup, 4.0, floorY, 7.8);
        officeMakePlant(buildingGroup, 10.0, floorY, 8.0, 0.8);
        var loungeSpecs = [
            { name: "lounge_spot0", x: 7.65, z: 7.4, facing: Math.PI },
            { name: "lounge_spot1", x: 5.25, z: 7.0, facing: Math.PI },
            { name: "lounge_spot2", x: 8.8, z: 4.8, facing: 0 }
        ];
        loungeSpecs.forEach(function (spot) {
            graph.addNode(spot.name, spot.x, spot.z);
            graph.link("lounge_center", spot.name);
            sitTargets[spot.name] = { sit: true, facing: spot.facing, position: nodes[spot.name].pos };
        });
        graph.addNode("water_cooler", 4.15, 7.25);
        graph.link("lounge_center", "water_cooler");
        officeAddStandingTarget(sitTargets, nodes, "water_cooler", Math.PI * 0.5);
        graph.addNode("hall_stand_N", -1.15, -2.72);
        graph.addNode("hall_stand_S", 1.15, 2.72);
        graph.link("hall_stand_N", "hallN");
        graph.link("hall_stand_S", "hallS");
        officeAddStandingTarget(sitTargets, nodes, "hall_stand_N", 0);
        officeAddStandingTarget(sitTargets, nodes, "hall_stand_S", Math.PI);

        return {
            floorNumber: floorNumber,
            nodes: nodes,
            desks: desks,
            sitTargets: sitTargets
        };
    }

    function officeBuildLobbyGraphAndFurniture(buildingGroup) {
        var floorY = 0;
        var graph = officeMakeNodeGraph(0);
        var nodes = graph.nodes;
        var sitTargets = {};

        graph.addNode("outside", 0, 12);
        graph.addNode("front_door_threshold", 0, 9.35);
        graph.addNode("entrance", 0, 7.4);
        graph.addNode("lobby_center", 0, 5.15);
        graph.link("outside", "front_door_threshold");
        graph.link("front_door_threshold", "entrance");
        graph.link("entrance", "lobby_center");
        graph.link("lobby_center", "elevWait");
        graph.link("lobby_center", "hallS");

        var glassMaterial = officeTransparentMaterial(0xa6e1ef, 0.28);
        officeAddBox(buildingGroup, [0.08, 2.55, 1.2], [-1.58, 1.28, 8.42], glassMaterial, "open-glass-door-left");
        officeAddBox(buildingGroup, [0.08, 2.55, 1.2], [1.58, 1.28, 8.42], glassMaterial, "open-glass-door-right");

        var counterMaterial = officeSolidMaterial(0x72543d, 0.76);
        officeAddBox(buildingGroup, [1.05, 1.02, 4.4], [-9.5, 0.51, 5.7], counterMaterial, "cafe-counter");
        officeAddBox(buildingGroup, [1.3, 0.14, 4.7], [-9.35, 1.07, 5.7], officeSolidMaterial(0x2f3438, 0.52), "cafe-countertop");
        officeAddBox(buildingGroup, [0.55, 0.58, 0.52], [-9.25, 1.43, 6.7], officeSolidMaterial(0x24292d, 0.4), "coffee-machine");
        officeAddBox(buildingGroup, [0.7, 0.46, 0.7], [-9.25, 1.34, 4.55], officeTransparentMaterial(0xf3d3a0, 0.42), "pastry-display");
        graph.addNode("cafe_door", -3.5, 4.0);
        graph.addNode("cafe_center", -5.4, 5.25);
        graph.link("cafe_door", "hallSW");
        graph.link("cafe_door", "cafe_center");
        graph.link("cafe_center", "lobby_center");
        graph.addNode("cafe_order", -8.55, 5.7);
        graph.link("cafe_center", "cafe_order");
        officeAddStandingTarget(sitTargets, nodes, "cafe_order", -Math.PI * 0.5);
        var bistroTables = [
            { x: -7.0, z: 7.2 }, { x: -4.8, z: 7.1 }, { x: -7.0, z: 4.35 }, { x: -4.8, z: 4.35 }
        ];
        bistroTables.forEach(function (table, tableIndex) {
            officeMakeBistroTable(buildingGroup, table.x, floorY, table.z);
            var firstName = "cafe_seat" + (tableIndex * 2);
            var secondName = "cafe_seat" + (tableIndex * 2 + 1);
            officeMakeChair(buildingGroup, table.x - 0.92, floorY, table.z, Math.PI * 0.5, 0x6f5949);
            officeMakeChair(buildingGroup, table.x + 0.92, floorY, table.z, -Math.PI * 0.5, 0x6f5949);
            graph.addNode(firstName, table.x - 0.92, table.z);
            graph.addNode(secondName, table.x + 0.92, table.z);
            graph.link("cafe_center", firstName);
            graph.link("cafe_center", secondName);
            sitTargets[firstName] = { sit: true, facing: Math.PI * 0.5, position: nodes[firstName].pos };
            sitTargets[secondName] = { sit: true, facing: -Math.PI * 0.5, position: nodes[secondName].pos };
        });

        officeMakeSofa(buildingGroup, 8.2, floorY, 7.25, Math.PI, 3.1, 0x526e82);
        officeMakeChair(buildingGroup, 5.1, floorY, 7.2, Math.PI, 0x6c7890);
        officeMakeChair(buildingGroup, 8.8, floorY, 4.35, 0, 0x6c7890);
        officeMakeTable(buildingGroup, 7.1, floorY, 5.8, 1.75, 0.9, 0.5, 0x7b624c);
        graph.addNode("front_lounge_center", 6.6, 5.8);
        graph.link("front_lounge_center", "hallSE");
        var frontLounge = [
            { name: "front_lounge0", x: 7.7, z: 7.15, facing: Math.PI },
            { name: "front_lounge1", x: 5.1, z: 7.2, facing: Math.PI },
            { name: "front_lounge2", x: 8.8, z: 4.35, facing: 0 }
        ];
        frontLounge.forEach(function (spot) {
            graph.addNode(spot.name, spot.x, spot.z);
            graph.link("front_lounge_center", spot.name);
            sitTargets[spot.name] = { sit: true, facing: spot.facing, position: nodes[spot.name].pos };
        });

        officeMakeSofa(buildingGroup, 6.6, floorY, -7.4, 0, 3.0, 0x6b5c78);
        officeMakeSofa(buildingGroup, 6.6, floorY, -3.8, Math.PI, 3.0, 0x6b5c78);
        officeMakeTable(buildingGroup, 6.6, floorY, -5.6, 1.8, 0.9, 0.48, 0x806449);
        graph.addNode("back_lounge_center", 4.7, -5.6);
        graph.link("back_lounge_center", "hallNE");
        graph.addNode("back_lounge_N", 6.6, -6.95);
        graph.addNode("back_lounge_S", 6.6, -4.25);
        graph.link("back_lounge_center", "back_lounge_N");
        graph.link("back_lounge_center", "back_lounge_S");
        sitTargets.back_lounge_N = { sit: true, facing: 0, position: nodes.back_lounge_N.pos };
        sitTargets.back_lounge_S = { sit: true, facing: Math.PI, position: nodes.back_lounge_S.pos };

        officeMakeBistroTable(buildingGroup, -7.0, floorY, -5.4);
        graph.addNode("pit_center", -7.0, -5.4);
        graph.link("pit_center", "hallNW");
        var pitSpots = [
            { name: "pit_N", x: -7.0, z: -6.45, facing: 0 },
            { name: "pit_S", x: -7.0, z: -4.35, facing: Math.PI },
            { name: "pit_E", x: -5.95, z: -5.4, facing: -Math.PI * 0.5 },
            { name: "pit_W", x: -8.05, z: -5.4, facing: Math.PI * 0.5 }
        ];
        pitSpots.forEach(function (spot) {
            officeMakeChair(buildingGroup, spot.x, floorY, spot.z, spot.facing, 0x776b5c);
            graph.addNode(spot.name, spot.x, spot.z);
            graph.link("pit_center", spot.name);
            sitTargets[spot.name] = { sit: true, facing: spot.facing, position: nodes[spot.name].pos };
        });

        officeAddBox(buildingGroup, [2.35, 1.0, 0.82], [-4.0, 0.5, 6.25], officeSolidMaterial(0x755a47, 0.72), "reception-desk");
        officeAddBox(buildingGroup, [0.7, 0.55, 0.08], [-4.0, 1.2, 6.08], officeSolidMaterial(0x252d34, 0.45), "reception-monitor");
        graph.addNode("reception", -3.9, 5.35);
        graph.link("reception", "lobby_center");
        officeAddStandingTarget(sitTargets, nodes, "reception", Math.PI);
        officeAddBox(buildingGroup, [0.64, 1.55, 0.45], [2.5, 0.78, 7.45], officeSolidMaterial(0x394c58, 0.62), "info-kiosk");
        graph.addNode("kiosk", 2.5, 6.65);
        graph.link("kiosk", "entrance");
        officeAddStandingTarget(sitTargets, nodes, "kiosk", 0);
        officeMakeWaterCooler(buildingGroup, 9.6, floorY, 2.4);
        officeMakeWaterCooler(buildingGroup, -9.7, floorY, -1.8);
        graph.addNode("lobby_wc_front", 8.85, 2.4);
        graph.addNode("lobby_wc_back", -8.9, -1.8);
        graph.link("lobby_wc_front", "hallSE");
        graph.link("lobby_wc_back", "hallNW");
        officeAddStandingTarget(sitTargets, nodes, "lobby_wc_front", Math.PI * 0.5);
        officeAddStandingTarget(sitTargets, nodes, "lobby_wc_back", -Math.PI * 0.5);

        var loiterSpecs = [
            { name: "lobby_stand_center", x: 1.7, z: 4.8, hub: "lobby_center" },
            { name: "lobby_stand_NE", x: 4.2, z: -1.8, hub: "hallNE" },
            { name: "lobby_stand_NW", x: -4.2, z: -1.8, hub: "hallNW" },
            { name: "lobby_stand_midE", x: 5.0, z: 1.2, hub: "hallE" },
            { name: "lobby_stand_midW", x: -5.0, z: 1.2, hub: "hallW" },
            { name: "lobby_stand_entry", x: -1.8, z: 7.25, hub: "entrance" }
        ];
        loiterSpecs.forEach(function (spot) {
            graph.addNode(spot.name, spot.x, spot.z);
            graph.link(spot.name, spot.hub);
            officeAddStandingTarget(sitTargets, nodes, spot.name, 0);
        });
        officeMakePlant(buildingGroup, -2.35, floorY, 8.05, 0.9);
        officeMakePlant(buildingGroup, 2.35, floorY, 8.05, 0.9);

        return {
            floorNumber: 0,
            nodes: nodes,
            desks: [],
            sitTargets: sitTargets,
            entranceSpot: nodes.entrance.pos,
            cafeSpots: Object.keys(nodes).filter(function (name) { return name.indexOf("cafe_") === 0; }),
            loungeSpots: frontLounge.map(function (spot) { return spot.name; })
        };
    }

    function createWorld(scene) {
        var buildingGroup = new THREE.Group();
        buildingGroup.name = "transparent-office-building";
        buildingGroup.renderOrder = 0;
        var floorSolid = officeSolidMaterial(0x737b82, 0.84);
        var slabTransparent = officeTransparentMaterial(0x8c949a, 0.3);
        var roofMaterial = officeTransparentMaterial(0x8b9298, 0.2);
        var wallMaterial = officeTransparentMaterial(0x9999ff, 0.2);
        var interiorMaterial = officeTransparentMaterial(0xbbc5e6, 0.28);
        var shaftMaterial = officeTransparentMaterial(0x465361, 0.18);
        var totalHeight = WORLD.FLOOR_COUNT * WORLD.FLOOR_HEIGHT;

        officeAddBox(buildingGroup, [WORLD.BUILDING_WIDTH, 0.18, WORLD.BUILDING_DEPTH], [0, -0.09, 0], floorSolid, "ground-slab");
        officeAddBox(buildingGroup, [WORLD.BUILDING_WIDTH, 0.16, WORLD.BUILDING_DEPTH], [0, totalHeight + 0.08, 0], roofMaterial, "roof");
        for (var floorIndex = 1; floorIndex < WORLD.FLOOR_COUNT; floorIndex += 1) {
            var slabY = floorIndex * WORLD.FLOOR_HEIGHT - 0.08;
            officeAddBox(buildingGroup, [9.5, 0.16, 18], [-6.25, slabY, 0], slabTransparent, "floor-strip-left");
            officeAddBox(buildingGroup, [9.5, 0.16, 18], [6.25, slabY, 0], slabTransparent, "floor-strip-right");
            officeAddBox(buildingGroup, [3, 0.16, 7.5], [0, slabY, 5.25], slabTransparent, "floor-strip-front");
            officeAddBox(buildingGroup, [3, 0.16, 7.5], [0, slabY, -5.25], slabTransparent, "floor-strip-back");
        }

        officeAddBox(buildingGroup, [0.12, totalHeight, WORLD.BUILDING_DEPTH], [-11, totalHeight * 0.5, 0], wallMaterial, "outer-left-wall");
        officeAddBox(buildingGroup, [0.12, totalHeight, WORLD.BUILDING_DEPTH], [11, totalHeight * 0.5, 0], wallMaterial, "outer-right-wall");
        officeAddBox(buildingGroup, [WORLD.BUILDING_WIDTH, totalHeight, 0.12], [0, totalHeight * 0.5, -9], wallMaterial, "outer-back-wall");
        officeAddBox(buildingGroup, [9.5, totalHeight, 0.12], [-6.25, totalHeight * 0.5, 9], wallMaterial, "front-wall-left");
        officeAddBox(buildingGroup, [9.5, totalHeight, 0.12], [6.25, totalHeight * 0.5, 9], wallMaterial, "front-wall-right");
        officeAddBox(buildingGroup, [3.0, totalHeight - WORLD.FLOOR_HEIGHT, 0.12], [0, WORLD.FLOOR_HEIGHT + (totalHeight - WORLD.FLOOR_HEIGHT) * 0.5, 9], wallMaterial, "front-wall-above-entry");
        officeAddBox(buildingGroup, [3.4, 0.22, 0.24], [0, 2.9, 9], officeSolidMaterial(0x647785, 0.7), "entrance-header");

        officeAddBox(buildingGroup, [0.1, totalHeight, WORLD.SHAFT_DEPTH], [-1.5, totalHeight * 0.5, 0], shaftMaterial, "shaft-left");
        officeAddBox(buildingGroup, [0.1, totalHeight, WORLD.SHAFT_DEPTH], [1.5, totalHeight * 0.5, 0], shaftMaterial, "shaft-right");
        officeAddBox(buildingGroup, [WORLD.SHAFT_WIDTH, totalHeight, 0.1], [0, totalHeight * 0.5, -1.5], shaftMaterial, "shaft-back");
        officeAddBox(buildingGroup, [26, 0.14, 5.6], [0, -0.14, 11.8], officeSolidMaterial(0xb7b0a2, 0.94), "sidewalk");
        for (var stripeIndex = -5; stripeIndex <= 5; stripeIndex += 1) {
            officeAddBox(buildingGroup, [0.035, 0.012, 5.2], [stripeIndex * 2.15, -0.06, 11.8], officeSolidMaterial(0x8e897f, 0.95), "sidewalk-joint");
        }

        var floors = [];
        var lobbyFloor = officeBuildLobbyGraphAndFurniture(buildingGroup);
        floors.push(lobbyFloor);
        for (var officeFloor = 1; officeFloor < WORLD.FLOOR_COUNT; officeFloor += 1) {
            floors.push(officeBuildFloorGraphAndFurniture(buildingGroup, officeFloor, interiorMaterial));
        }
        floors.forEach(function (floorData) {
            floorData.callPanel = officeMakeCallPanel(buildingGroup, floorData.floorNumber);
            floorData.shaftIndicator = officeMakeShaftIndicator(buildingGroup, floorData.floorNumber);
        });
        buildingGroup.traverse(function (object) {
            object.renderOrder = 0;
            if (object.material && object.material.transparent) {
                object.material.depthWrite = false;
                object.material.side = THREE.DoubleSide;
            }
        });
        scene.add(buildingGroup);
        return {
            buildingGroup: buildingGroup,
            floors: floors,
            bfsPath: bfsPath,
            createTextTexture: makeOfficeTextTexture,
            updateTextTexture: updateOfficeTextTexture
        };
    }

    window.WORLD = WORLD;
    window.createWorld = createWorld;
    window.bfsPath = bfsPath;
    window.makeOfficeTextTexture = makeOfficeTextTexture;
    window.updateOfficeTextTexture = updateOfficeTextTexture;
})();
