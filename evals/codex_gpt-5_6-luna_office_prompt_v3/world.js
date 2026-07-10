(function worldModule(root) {
    const WORLD = {
        FLOOR_HEIGHT: 3.4,
        FLOOR_COUNT: 6,
        BUILDING_WIDTH: 22,
        BUILDING_DEPTH: 18,
        SHAFT_WIDTH: 3,
        SHAFT_DEPTH: 3,
        PERSON_R: 0.4,
    };

    function worldTransparentMaterial(color, opacity) {
        return new THREE.MeshStandardMaterial({
            color: color,
            transparent: true,
            opacity: opacity,
            depthWrite: false,
            side: THREE.DoubleSide,
            roughness: 0.92,
        });
    }

    function worldSolidMaterial(color, roughness, metalness) {
        return new THREE.MeshStandardMaterial({
            color: color,
            roughness: roughness === undefined ? 0.78 : roughness,
            metalness: metalness || 0,
        });
    }

    function worldAddBox(parent, width, height, depth, x, y, z, material, name) {
        var mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
        mesh.position.set(x, y, z);
        if (name) mesh.name = name;
        parent.add(mesh);
        return mesh;
    }

    function worldAddCylinder(parent, radiusTop, radiusBottom, height, x, y, z, material, radialSegments, name) {
        var mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, radialSegments || 12), material);
        mesh.position.set(x, y, z);
        if (name) mesh.name = name;
        parent.add(mesh);
        return mesh;
    }

    function worldCreateTextTexture(text) {
        var canvas = document.createElement("canvas");
        canvas.width = 256;
        canvas.height = 256;
        var texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = true;
        texture.anisotropy = 4;
        texture._lastText = "";
        worldUpdateTextTexture(texture, text);
        return texture;
    }

    function worldUpdateTextTexture(texture, text) {
        var value = String(text);
        if (texture._lastText === value) return;
        texture._lastText = value;
        var canvas = texture.image;
        var context = canvas.getContext("2d");
        context.clearRect(0, 0, 256, 256);
        context.fillStyle = "#050505";
        context.fillRect(0, 0, 256, 256);
        context.font = "bold 154px monospace";
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.shadowColor = "#ffbb22";
        context.shadowBlur = 22;
        context.fillStyle = "#ffbb22";
        context.fillText(value, 128, 133, 212);
        context.shadowBlur = 0;
        texture.needsUpdate = true;
    }

    function worldMakeIndicator(x, y, z, size, initialText, name) {
        var texture = worldCreateTextTexture(initialText);
        var material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, side: THREE.DoubleSide });
        var mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), material);
        mesh.position.set(x, y, z);
        mesh.name = name || "FloorIndicator";
        mesh.userData.texture = texture;
        mesh.userData.setIndicator = function setIndicator(text) {
            worldUpdateTextTexture(texture, text);
        };
        return mesh;
    }

    function worldMakeCallPanel(floorNumber, floorY) {
        var panel = new THREE.Group();
        panel.name = "CallPanel_" + floorNumber;
        panel.position.set(2.02, floorY + 1.48, 1.56);
        var plateMaterial = worldSolidMaterial(0x344052, 0.58, 0.05);
        var darkLamp = new THREE.MeshBasicMaterial({ color: 0x343b43 });
        var brightLamp = new THREE.MeshBasicMaterial({ color: 0x55ff8a });
        var plate = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.4, 0.05), plateMaterial);
        panel.add(plate);

        var upShape = new THREE.Shape();
        upShape.moveTo(-0.13, -0.1);
        upShape.lineTo(0, 0.13);
        upShape.lineTo(0.13, -0.1);
        upShape.lineTo(-0.13, -0.1);
        var upArrow = new THREE.Mesh(new THREE.ShapeGeometry(upShape), darkLamp);
        upArrow.position.set(0, 0.43, 0.04);
        panel.add(upArrow);

        var downArrow = new THREE.Mesh(new THREE.ShapeGeometry(upShape), darkLamp);
        downArrow.position.set(0, -0.43, 0.04);
        downArrow.rotation.z = Math.PI;
        panel.add(downArrow);

        var indicator = worldMakeIndicator(0, 0, 0.045, 0.45, String(floorNumber), "CallFloor_" + floorNumber);
        panel.add(indicator);
        panel.userData.floorNumber = floorNumber;
        panel.userData.upArrow = upArrow;
        panel.userData.downArrow = downArrow;
        panel.userData.indicator = indicator;
        panel.userData.setUp = function setUp(on) {
            upArrow.material = on ? brightLamp : darkLamp;
        };
        panel.userData.setDown = function setDown(on) {
            downArrow.material = on ? brightLamp : darkLamp;
        };
        panel.userData.setIndicator = function setIndicator(text) {
            indicator.userData.setIndicator(text);
        };
        panel.userData.setUp(false);
        panel.userData.setDown(false);
        return panel;
    }

    function worldNewGraph() {
        return { points: Object.create(null), edges: Object.create(null) };
    }

    function worldAddNode(graph, name, x, y, z) {
        graph.points[name] = new THREE.Vector3(x, y, z);
        graph.edges[name] = [];
    }

    function worldLink(graph, first, second) {
        if (!graph.edges[first]) graph.edges[first] = [];
        if (!graph.edges[second]) graph.edges[second] = [];
        if (graph.edges[first].indexOf(second) < 0) graph.edges[first].push(second);
        if (graph.edges[second].indexOf(first) < 0) graph.edges[second].push(first);
    }

    function bfsPath(nodes, fromName, toName) {
        var graph = nodes && nodes.points ? nodes : { points: nodes || {}, edges: {} };
        var points = graph.points || {};
        var edges = graph.edges || {};
        if (!points[fromName] || !points[toName]) return [];
        if (fromName === toName) return [points[fromName].clone()];
        var queue = [fromName];
        var cameFrom = Object.create(null);
        cameFrom[fromName] = null;
        while (queue.length) {
            var current = queue.shift();
            var neighbors = edges[current] || [];
            for (var neighborIndex = 0; neighborIndex < neighbors.length; neighborIndex += 1) {
                var neighbor = neighbors[neighborIndex];
                if (Object.prototype.hasOwnProperty.call(cameFrom, neighbor)) continue;
                cameFrom[neighbor] = current;
                if (neighbor === toName) {
                    queue.length = 0;
                    break;
                }
                queue.push(neighbor);
            }
        }
        if (!Object.prototype.hasOwnProperty.call(cameFrom, toName)) return [];
        var names = [];
        var walkName = toName;
        while (walkName !== null) {
            names.push(walkName);
            walkName = cameFrom[walkName];
        }
        names.reverse();
        var result = [];
        for (var nameIndex = 0; nameIndex < names.length; nameIndex += 1) {
            result.push(points[names[nameIndex]].clone());
        }
        return result;
    }

    function worldAddChair(parent, x, y, z, facing, material, name) {
        var chair = new THREE.Group();
        chair.position.set(x, y, z);
        chair.rotation.y = facing || 0;
        chair.name = name || "Chair";
        var chairMaterial = material || worldSolidMaterial(0x4b5262, 0.84);
        worldAddBox(chair, 0.72, 0.12, 0.68, 0, 0.48, 0, chairMaterial, "Seat");
        worldAddBox(chair, 0.66, 0.75, 0.12, 0, 0.86, 0.27, chairMaterial, "Backrest");
        worldAddBox(chair, 0.08, 0.48, 0.08, -0.25, 0.25, -0.22, chairMaterial, "Leg");
        worldAddBox(chair, 0.08, 0.48, 0.08, 0.25, 0.25, -0.22, chairMaterial, "Leg");
        parent.add(chair);
        return chair;
    }

    function worldAddDesk(parent, floorY, x, z, id) {
        var wood = worldSolidMaterial(0x765f4b, 0.82);
        var dark = worldSolidMaterial(0x252c38, 0.58, 0.08);
        worldAddBox(parent, 1.85, 0.14, 0.82, x, floorY + 1.03, z, wood, "Desk_" + id);
        worldAddBox(parent, 0.1, 1.0, 0.1, x - 0.72, floorY + 0.5, z - 0.26, wood, "DeskLeg");
        worldAddBox(parent, 0.1, 1.0, 0.1, x + 0.72, floorY + 0.5, z - 0.26, wood, "DeskLeg");
        worldAddBox(parent, 0.42, 0.35, 0.07, x, floorY + 1.27, z - 0.28, dark, "Monitor");
        worldAddBox(parent, 0.12, 0.16, 0.05, x, floorY + 1.08, z - 0.28, dark, "MonitorStand");
        worldAddChair(parent, x, floorY, z + 1.06, Math.PI, worldSolidMaterial(0x4b6570, 0.86), "OfficeChair_" + id);
    }

    function worldAddCouch(parent, x, floorY, z, rotation, color, name) {
        var couch = new THREE.Group();
        couch.position.set(x, floorY, z);
        couch.rotation.y = rotation || 0;
        couch.name = name || "Couch";
        var material = worldSolidMaterial(color || 0x596d83, 0.9);
        worldAddBox(couch, 2.45, 0.58, 0.82, 0, 0.55, 0, material, "CouchSeat");
        worldAddBox(couch, 2.5, 0.9, 0.2, 0, 1.05, 0.32, material, "CouchBack");
        worldAddBox(couch, 0.18, 0.62, 0.96, -1.08, 0.68, 0, material, "CouchArm");
        worldAddBox(couch, 0.18, 0.62, 0.96, 1.08, 0.68, 0, material, "CouchArm");
        parent.add(couch);
        return couch;
    }

    function worldAddCoffeeTable(parent, x, floorY, z, radius) {
        var material = worldSolidMaterial(0x5d4737, 0.75);
        worldAddCylinder(parent, radius || 0.75, radius || 0.75, 0.12, x, floorY + 0.45, z, material, 16, "CoffeeTableTop");
        worldAddCylinder(parent, 0.08, 0.1, 0.42, x, floorY + 0.21, z, material, 10, "CoffeeTableLeg");
    }

    function worldAddPlant(parent, x, floorY, z) {
        worldAddCylinder(parent, 0.28, 0.32, 0.4, x, floorY + 0.2, z, worldSolidMaterial(0xa45135, 0.9), 12, "PlantPot");
        var leaves = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), worldSolidMaterial(0x3d8a54, 0.88));
        leaves.position.set(x, floorY + 0.8, z);
        parent.add(leaves);
    }

    function worldAddWaterCooler(parent, x, floorY, z, name) {
        var metal = worldSolidMaterial(0x9aa5b4, 0.55, 0.2);
        var blue = new THREE.MeshStandardMaterial({ color: 0x78bce8, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide });
        worldAddBox(parent, 0.48, 0.8, 0.48, x, floorY + 0.4, z, metal, name || "WaterCooler");
        worldAddCylinder(parent, 0.28, 0.28, 0.46, x, floorY + 1.08, z, blue, 16, "CoolerBottle");
        worldAddBox(parent, 0.25, 0.06, 0.04, x, floorY + 0.73, z + 0.25, worldSolidMaterial(0x5b89a8, 0.6), "CoolerTap");
    }

    function worldMakeFloorGraph(floorNumber, floorY, group) {
        var graph = worldNewGraph();
        var sitTargets = Object.create(null);
        var centerY = floorY;
        var ring = [
            ["hallS", 0, 2.85], ["hallSE", 3.35, 2.85], ["hallE", 4.0, 0], ["hallNE", 3.35, -2.85],
            ["hallN", 0, -3.35], ["hallNW", -3.35, -2.85], ["hallW", -4.0, 0], ["hallSW", -3.35, 2.85],
        ];
        for (var ringIndex = 0; ringIndex < ring.length; ringIndex += 1) {
            worldAddNode(graph, ring[ringIndex][0], ring[ringIndex][1], centerY, ring[ringIndex][2]);
        }
        for (var linkIndex = 0; linkIndex < ring.length; linkIndex += 1) {
            worldLink(graph, ring[linkIndex][0], ring[(linkIndex + 1) % ring.length][0]);
        }
        worldAddNode(graph, "elevWait", 0, centerY, 2.18);
        worldLink(graph, "elevWait", "hallS");

        if (floorNumber === 0) {
            worldAddNode(graph, "outside", 0, centerY, 12);
            worldAddNode(graph, "front_door_threshold", 0, centerY, 9.35);
            worldAddNode(graph, "entrance", 0, centerY, 7.4);
            worldAddNode(graph, "lobby_center", 0, centerY, 4.15);
            worldLink(graph, "outside", "front_door_threshold");
            worldLink(graph, "front_door_threshold", "entrance");
            worldLink(graph, "entrance", "lobby_center");
            worldLink(graph, "entrance", "elevWait");
            worldLink(graph, "lobby_center", "elevWait");

            worldAddNode(graph, "cafe_door", -4.25, centerY, 4.2);
            worldAddNode(graph, "cafe_order", -8.8, centerY, 5.55);
            worldLink(graph, "cafe_door", "hallSW");
            worldLink(graph, "cafe_door", "cafe_order");
            var cafeSpots = [
                ["bistro0", -7.9, 3.45, Math.PI], ["bistro1", -5.8, 3.45, Math.PI],
                ["bistro2", -7.9, 1.8, 0], ["bistro3", -5.8, 1.8, 0],
            ];
            for (var cafeIndex = 0; cafeIndex < cafeSpots.length; cafeIndex += 1) {
                worldAddNode(graph, cafeSpots[cafeIndex][0], cafeSpots[cafeIndex][1], centerY, cafeSpots[cafeIndex][2]);
                worldLink(graph, "cafe_door", cafeSpots[cafeIndex][0]);
                sitTargets[cafeSpots[cafeIndex][0]] = { sit: true, facing: cafeSpots[cafeIndex][3] };
            }

            worldAddNode(graph, "lobby_lounge_door", 4.25, centerY, 4.2);
            worldAddNode(graph, "lobby_lounge_center", 7.2, centerY, 5.5);
            worldLink(graph, "lobby_lounge_door", "hallSE");
            worldLink(graph, "lobby_lounge_door", "lobby_lounge_center");
            worldAddNode(graph, "lobby_lounge0", 6.15, centerY, 6.9);
            worldAddNode(graph, "lobby_lounge1", 8.8, centerY, 6.1);
            worldAddNode(graph, "lobby_lounge2", 7.45, centerY, 4.35);
            worldLink(graph, "lobby_lounge_center", "lobby_lounge0");
            worldLink(graph, "lobby_lounge_center", "lobby_lounge1");
            worldLink(graph, "lobby_lounge_center", "lobby_lounge2");
            sitTargets.lobby_lounge0 = { sit: true, facing: Math.PI / 2 };
            sitTargets.lobby_lounge1 = { sit: true, facing: -Math.PI / 2 };
            sitTargets.lobby_lounge2 = { sit: true, facing: Math.PI };

            worldAddNode(graph, "back_lounge_N", 3.8, centerY, -5.9);
            worldAddNode(graph, "back_lounge_S", 3.8, centerY, -1.4);
            worldAddNode(graph, "pit_N", -7.4, centerY, -6.2);
            worldAddNode(graph, "pit_S", -7.4, centerY, -2.0);
            worldAddNode(graph, "pit_E", -5.1, centerY, -4.1);
            worldAddNode(graph, "pit_W", -9.7, centerY, -4.1);
            worldLink(graph, "back_lounge_N", "hallNE");
            worldLink(graph, "back_lounge_S", "hallE");
            worldLink(graph, "pit_N", "hallNW");
            worldLink(graph, "pit_S", "hallW");
            worldLink(graph, "pit_E", "pit_N");
            worldLink(graph, "pit_E", "pit_S");
            worldLink(graph, "pit_W", "pit_N");
            worldLink(graph, "pit_W", "pit_S");
            sitTargets.back_lounge_N = { sit: true, facing: Math.PI / 2 };
            sitTargets.back_lounge_S = { sit: true, facing: -Math.PI / 2 };
            sitTargets.pit_N = { sit: true, facing: Math.PI };
            sitTargets.pit_S = { sit: true, facing: 0 };
            sitTargets.pit_E = { sit: true, facing: -Math.PI / 2 };
            sitTargets.pit_W = { sit: true, facing: Math.PI / 2 };

            var lobbyStanding = [
                ["reception", -3.4, 6.15], ["kiosk", -1.5, 6.8], ["lobby_wc_front", 9.15, 3.2],
                ["lobby_wc_back", 9.1, -2.4], ["lobby_stand_center", 1.4, 4.7], ["lobby_stand_NE", 6.8, 2.6],
                ["lobby_stand_NW", -6.5, 2.9], ["lobby_stand_midE", 4.8, -1.1], ["lobby_stand_midW", -4.8, -0.8],
                ["lobby_stand_entry", 1.8, 6.7],
            ];
            for (var standIndex = 0; standIndex < lobbyStanding.length; standIndex += 1) {
                worldAddNode(graph, lobbyStanding[standIndex][0], lobbyStanding[standIndex][1], centerY, lobbyStanding[standIndex][2]);
                worldLink(graph, "lobby_center", lobbyStanding[standIndex][0]);
                sitTargets[lobbyStanding[standIndex][0]] = { sit: false, facing: 0 };
            }
            worldLink(graph, "reception", "cafe_door");
            worldLink(graph, "kiosk", "entrance");
            worldLink(graph, "lobby_wc_front", "lobby_lounge_door");
            worldLink(graph, "lobby_wc_back", "hallE");
        } else {
            var officeXs = [-8.3, -4.55, 4.55, 8.3];
            var officeLetters = ["A", "B", "C", "D"];
            for (var officeIndex = 0; officeIndex < officeXs.length; officeIndex += 1) {
                var letter = officeLetters[officeIndex];
                var doorName = "office" + letter + "_door";
                var deskName = "office" + letter + "_desk";
                worldAddNode(graph, doorName, officeXs[officeIndex], centerY, -4.35);
                worldAddNode(graph, deskName, officeXs[officeIndex], centerY, -6.35);
                var nearestHall = officeIndex === 0 ? "hallNW" : (officeIndex === 1 || officeIndex === 2 ? "hallN" : "hallNE");
                worldLink(graph, doorName, nearestHall);
                worldLink(graph, doorName, deskName);
                sitTargets[deskName] = { sit: true, facing: Math.PI };
            }

            worldAddNode(graph, "conf_door", -3.6, centerY, 4.6);
            worldAddNode(graph, "conf_center", -7.0, centerY, 6.1);
            worldLink(graph, "conf_door", "hallSW");
            worldLink(graph, "conf_door", "conf_center");
            var conferenceSeats = [
                ["conf_seat0", -8.6, 5.1, 0], ["conf_seat1", -5.4, 5.1, 0],
                ["conf_seat2", -8.6, 7.1, Math.PI], ["conf_seat3", -5.4, 7.1, Math.PI],
            ];
            for (var confIndex = 0; confIndex < conferenceSeats.length; confIndex += 1) {
                worldAddNode(graph, conferenceSeats[confIndex][0], conferenceSeats[confIndex][1], centerY, conferenceSeats[confIndex][2]);
                worldLink(graph, "conf_center", conferenceSeats[confIndex][0]);
                sitTargets[conferenceSeats[confIndex][0]] = { sit: true, facing: conferenceSeats[confIndex][3] };
            }

            worldAddNode(graph, "lounge_door", 3.65, centerY, 4.6);
            worldAddNode(graph, "lounge_center", 7.0, centerY, 6.05);
            worldLink(graph, "lounge_door", "hallSE");
            worldLink(graph, "lounge_door", "lounge_center");
            worldAddNode(graph, "lounge_spot0", 5.65, centerY, 7.0);
            worldAddNode(graph, "lounge_spot1", 8.65, centerY, 6.45);
            worldAddNode(graph, "lounge_spot2", 7.2, centerY, 4.65);
            worldLink(graph, "lounge_center", "lounge_spot0");
            worldLink(graph, "lounge_center", "lounge_spot1");
            worldLink(graph, "lounge_center", "lounge_spot2");
            sitTargets.lounge_spot0 = { sit: true, facing: Math.PI / 2 };
            sitTargets.lounge_spot1 = { sit: true, facing: -Math.PI / 2 };
            sitTargets.lounge_spot2 = { sit: true, facing: Math.PI };

            worldAddNode(graph, "water_cooler", 9.4, centerY, 3.0);
            worldAddNode(graph, "hall_stand_N", 1.8, centerY, -2.8);
            worldAddNode(graph, "hall_stand_S", -1.8, centerY, 2.4);
            worldLink(graph, "water_cooler", "lounge_door");
            worldLink(graph, "hall_stand_N", "hallN");
            worldLink(graph, "hall_stand_S", "hallS");
            sitTargets.water_cooler = { sit: false, facing: -Math.PI / 2 };
            sitTargets.hall_stand_N = { sit: false, facing: 0 };
            sitTargets.hall_stand_S = { sit: false, facing: Math.PI };

            worldAddNode(graph, "cafe_door", -3.8, centerY, 4.7);
            worldLink(graph, "cafe_door", "hallSW");
        }
        return { nodes: graph, sitTargets: sitTargets };
    }

    function worldBuildLobbyFurniture(group, floorY) {
        var wood = worldSolidMaterial(0x765f4b, 0.82);
        var counter = worldSolidMaterial(0x4e5965, 0.72);
        worldAddBox(group, 3.8, 0.95, 0.72, -8.9, floorY + 0.48, 6.15, counter, "CafeCounter");
        worldAddBox(group, 3.9, 0.13, 0.82, -8.9, floorY + 1.02, 6.15, wood, "CafeCounterTop");
        worldAddBox(group, 0.46, 0.52, 0.34, -9.65, floorY + 1.32, 6.1, worldSolidMaterial(0x242932, 0.5, 0.12), "CoffeeMachine");
        worldAddBox(group, 0.65, 0.34, 0.34, -8.45, floorY + 1.22, 6.1, worldSolidMaterial(0xd2a050, 0.88), "PastryDisplay");
        var bistroPositions = [[-7.9, 2.55], [-5.8, 2.55], [-7.9, 1.05], [-5.8, 1.05]];
        for (var bistroIndex = 0; bistroIndex < bistroPositions.length; bistroIndex += 1) {
            worldAddCylinder(group, 0.42, 0.42, 0.1, bistroPositions[bistroIndex][0], floorY + 0.93, bistroPositions[bistroIndex][1], wood, 14, "BistroTable");
            worldAddCylinder(group, 0.06, 0.08, 0.85, bistroPositions[bistroIndex][0], floorY + 0.48, bistroPositions[bistroIndex][1], wood, 8, "BistroLeg");
        }
        worldAddCouch(group, 7.0, floorY, 7.0, Math.PI, 0x5f718b, "LobbyFrontCouch");
        worldAddChair(group, 8.9, floorY, 5.25, -Math.PI / 2, worldSolidMaterial(0x795c68, 0.9), "LobbyArmchairA");
        worldAddChair(group, 5.15, floorY, 5.25, Math.PI / 2, worldSolidMaterial(0x795c68, 0.9), "LobbyArmchairB");
        worldAddCoffeeTable(group, 7.1, floorY, 5.95, 0.72);
        worldAddCouch(group, 5.9, floorY, -5.55, 0, 0x586b84, "BackLoungeNorth");
        worldAddCouch(group, 5.9, floorY, -1.8, Math.PI, 0x586b84, "BackLoungeSouth");
        worldAddCoffeeTable(group, 5.9, floorY, -3.65, 0.66);
        worldAddCoffeeTable(group, -7.4, floorY, -4.1, 0.65);
        worldAddChair(group, -7.4, floorY, -6.2, Math.PI, worldSolidMaterial(0x6b677c, 0.9), "PitChairN");
        worldAddChair(group, -7.4, floorY, -2.0, 0, worldSolidMaterial(0x6b677c, 0.9), "PitChairS");
        worldAddChair(group, -5.1, floorY, -4.1, -Math.PI / 2, worldSolidMaterial(0x6b677c, 0.9), "PitChairE");
        worldAddChair(group, -9.7, floorY, -4.1, Math.PI / 2, worldSolidMaterial(0x6b677c, 0.9), "PitChairW");
        worldAddWaterCooler(group, 9.15, floorY, 3.2, "LobbyCoolerFront");
        worldAddWaterCooler(group, 9.1, floorY, -2.4, "LobbyCoolerBack");
        worldAddBox(group, 2.6, 0.88, 0.68, -3.4, floorY + 0.44, 6.15, worldSolidMaterial(0x695343, 0.83), "ReceptionDesk");
        worldAddBox(group, 0.7, 0.65, 0.25, -3.4, floorY + 1.15, 6.0, worldSolidMaterial(0x303844, 0.58, 0.08), "ReceptionMonitor");
        worldAddBox(group, 0.72, 0.1, 0.62, -1.5, floorY + 0.05, 6.8, worldSolidMaterial(0x6c7685, 0.64), "InfoKiosk");
        worldAddBox(group, 0.08, 1.6, 0.08, -1.5, floorY + 0.8, 6.8, worldSolidMaterial(0x485362, 0.62), "InfoKioskStand");
        worldAddPlant(group, -1.85, floorY, 8.15);
        worldAddPlant(group, 1.85, floorY, 8.15);
    }

    function worldBuildOfficeFurniture(group, floorY) {
        var officeXs = [-8.3, -4.55, 4.55, 8.3];
        for (var officeIndex = 0; officeIndex < officeXs.length; officeIndex += 1) {
            worldAddDesk(group, floorY, officeXs[officeIndex], -6.35, officeIndex);
        }
        var tableMaterial = worldSolidMaterial(0x765d45, 0.8);
        worldAddBox(group, 5.5, 0.16, 1.15, -7.0, floorY + 0.86, 6.1, tableMaterial, "ConferenceTable");
        worldAddBox(group, 0.12, 0.78, 0.12, -9.1, floorY + 0.4, 5.72, tableMaterial, "ConferenceLeg");
        worldAddBox(group, 0.12, 0.78, 0.12, -4.9, floorY + 0.4, 5.72, tableMaterial, "ConferenceLeg");
        worldAddBox(group, 0.12, 0.78, 0.12, -9.1, floorY + 0.4, 6.48, tableMaterial, "ConferenceLeg");
        worldAddBox(group, 0.12, 0.78, 0.12, -4.9, floorY + 0.4, 6.48, tableMaterial, "ConferenceLeg");
        worldAddChair(group, -8.6, floorY, 5.1, 0, worldSolidMaterial(0x657d75, 0.88), "ConferenceChair0");
        worldAddChair(group, -5.4, floorY, 5.1, 0, worldSolidMaterial(0x657d75, 0.88), "ConferenceChair1");
        worldAddChair(group, -8.6, floorY, 7.1, Math.PI, worldSolidMaterial(0x657d75, 0.88), "ConferenceChair2");
        worldAddChair(group, -5.4, floorY, 7.1, Math.PI, worldSolidMaterial(0x657d75, 0.88), "ConferenceChair3");
        worldAddCouch(group, 7.0, floorY, 7.0, Math.PI, 0x5f718b, "OfficeLoungeCouch");
        worldAddChair(group, 8.9, floorY, 5.25, -Math.PI / 2, worldSolidMaterial(0x795c68, 0.9), "OfficeArmchairA");
        worldAddChair(group, 5.15, floorY, 5.25, Math.PI / 2, worldSolidMaterial(0x795c68, 0.9), "OfficeArmchairB");
        worldAddCoffeeTable(group, 7.1, floorY, 5.95, 0.72);
        worldAddWaterCooler(group, 9.4, floorY, 3.0, "OfficeCooler");
        worldAddPlant(group, 10.0, floorY, 7.8);
    }

    function worldAddBuildingShell(group) {
        var gray = worldSolidMaterial(0x59616b, 0.92);
        worldAddBox(group, WORLD.BUILDING_WIDTH, 0.22, WORLD.BUILDING_DEPTH, 0, -0.12, 0, gray, "GroundSlab");
        var wall = worldTransparentMaterial(0x9999ff, 0.2);
        var totalHeight = WORLD.FLOOR_HEIGHT * WORLD.FLOOR_COUNT;
        worldAddBox(group, 0.16, totalHeight, WORLD.BUILDING_DEPTH, -11, totalHeight / 2, 0, wall, "OuterWallLeft");
        worldAddBox(group, 0.16, totalHeight, WORLD.BUILDING_DEPTH, 11, totalHeight / 2, 0, wall, "OuterWallRight");
        worldAddBox(group, WORLD.BUILDING_WIDTH, totalHeight, 0.16, 0, totalHeight / 2, -9, wall, "OuterWallBack");
        worldAddBox(group, 9.5, totalHeight, 0.16, -6.25, totalHeight / 2, 9, wall, "OuterWallFrontLeft");
        worldAddBox(group, 9.5, totalHeight, 0.16, 6.25, totalHeight / 2, 9, wall, "OuterWallFrontRight");
        worldAddBox(group, 3.0, totalHeight - WORLD.FLOOR_HEIGHT, 0.16, 0, WORLD.FLOOR_HEIGHT + (totalHeight - WORLD.FLOOR_HEIGHT) / 2, 9, wall, "OuterWallFrontUpper");
        worldAddBox(group, WORLD.BUILDING_WIDTH, 0.25, WORLD.BUILDING_DEPTH, 0, totalHeight + 0.12, 0, gray, "Roof");
        var slabMaterial = worldTransparentMaterial(0x7f8790, 0.3);
        for (var floorIndex = 1; floorIndex < WORLD.FLOOR_COUNT; floorIndex += 1) {
            var floorY = floorIndex * WORLD.FLOOR_HEIGHT - 0.12;
            worldAddBox(group, 9.5, 0.2, WORLD.BUILDING_DEPTH, -6.25, floorY, 0, slabMaterial, "FloorSlabLeft_" + floorIndex);
            worldAddBox(group, 9.5, 0.2, WORLD.BUILDING_DEPTH, 6.25, floorY, 0, slabMaterial, "FloorSlabRight_" + floorIndex);
            worldAddBox(group, 3.0, 0.2, 6.0, 0, floorY, 6.0, slabMaterial, "FloorSlabFront_" + floorIndex);
            worldAddBox(group, 3.0, 0.2, 12.0, 0, floorY, -6.0, slabMaterial, "FloorSlabBack_" + floorIndex);
        }
        var interior = worldTransparentMaterial(0xbbc5e6, 0.28);
        for (var officeFloor = 1; officeFloor < WORLD.FLOOR_COUNT; officeFloor += 1) {
            var officeY = officeFloor * WORLD.FLOOR_HEIGHT + 1.7;
            worldAddBox(group, 0.12, 3.0, 3.05, -6.25, officeY, -6.8, interior, "OfficePartitionA_" + officeFloor);
            worldAddBox(group, 0.12, 3.0, 3.05, -1.5, officeY, -6.8, interior, "OfficePartitionB_" + officeFloor);
            worldAddBox(group, 0.12, 3.0, 3.05, 1.5, officeY, -6.8, interior, "OfficePartitionC_" + officeFloor);
            worldAddBox(group, 0.12, 3.0, 3.05, 6.25, officeY, -6.8, interior, "OfficePartitionD_" + officeFloor);
            worldAddBox(group, 5.8, 3.0, 0.12, -7.8, officeY, 8.15, interior, "ConferenceWall_" + officeFloor);
            worldAddBox(group, 5.8, 3.0, 0.12, -7.8, officeY, 3.05, interior, "ConferenceWallFront_" + officeFloor);
            worldAddBox(group, 0.12, 3.0, 3.4, -10.65, officeY, 5.6, interior, "ConferenceWallSide_" + officeFloor);
            worldAddBox(group, 0.12, 3.0, 3.4, -3.15, officeY, 5.6, interior, "ConferenceWallSideB_" + officeFloor);
        }
    }

    function createWorld(scene) {
        var buildingGroup = new THREE.Group();
        buildingGroup.name = "TransparentOfficeBuilding";
        buildingGroup.renderOrder = 0;
        worldAddBuildingShell(buildingGroup);
        var floors = [];
        for (var floorNumber = 0; floorNumber < WORLD.FLOOR_COUNT; floorNumber += 1) {
            var floorY = floorNumber * WORLD.FLOOR_HEIGHT;
            var floorGraph = worldMakeFloorGraph(floorNumber, floorY, buildingGroup);
            if (floorNumber === 0) worldBuildLobbyFurniture(buildingGroup, floorY);
            else worldBuildOfficeFurniture(buildingGroup, floorY);
            var callPanel = worldMakeCallPanel(floorNumber, floorY);
            var shaftIndicator = worldMakeIndicator(0, floorY + 3.0, 1.57, 0.9, String(floorNumber), "ShaftIndicator_" + floorNumber);
            buildingGroup.add(callPanel);
            buildingGroup.add(shaftIndicator);
            var floorRecord = {
                floorNumber: floorNumber,
                nodes: floorGraph.nodes,
                callPanel: callPanel,
                shaftIndicator: shaftIndicator,
                desks: [],
                sitTargets: floorGraph.sitTargets,
            };
            if (floorNumber === 0) {
                floorRecord.entranceSpot = floorGraph.nodes.points.entrance.clone();
                floorRecord.cafeSpots = ["bistro0", "bistro1", "bistro2", "bistro3"];
                floorRecord.lobbySpots = ["lobby_lounge0", "lobby_lounge1", "lobby_lounge2", "back_lounge_N", "back_lounge_S", "pit_N", "pit_S", "pit_E", "pit_W"];
            } else {
                var deskXs = [-8.3, -4.55, 4.55, 8.3];
                for (var deskIndex = 0; deskIndex < deskXs.length; deskIndex += 1) {
                    floorRecord.desks.push({
                        id: floorNumber * 4 + deskIndex,
                        wpName: "office" + ["A", "B", "C", "D"][deskIndex] + "_desk",
                        doorWpName: "office" + ["A", "B", "C", "D"][deskIndex] + "_door",
                        x: deskXs[deskIndex],
                    });
                }
                floorRecord.waterCooler = "water_cooler";
                floorRecord.hallStand = ["hall_stand_N", "hall_stand_S"];
            }
            floors.push(floorRecord);
        }
        var entranceDoors = worldTransparentMaterial(0x91d6ff, 0.2);
        worldAddBox(buildingGroup, 0.08, 2.45, 0.7, -1.72, 1.22, 9.0, entranceDoors, "EntranceDoorLeft");
        worldAddBox(buildingGroup, 0.08, 2.45, 0.7, 1.72, 1.22, 9.0, entranceDoors, "EntranceDoorRight");
        scene.add(buildingGroup);
        return { buildingGroup: buildingGroup, floors: floors, bfsPath: bfsPath };
    }

    root.WORLD = WORLD;
    root.bfsPath = bfsPath;
    root.createWorld = createWorld;
})(window);
