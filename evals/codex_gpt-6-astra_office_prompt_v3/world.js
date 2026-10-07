(function () {
    'use strict';
    const WORLD = {
        FLOOR_HEIGHT: 3.4, FLOOR_COUNT: 6, BUILDING_WIDTH: 22,
        BUILDING_DEPTH: 18, SHAFT_WIDTH: 3, SHAFT_DEPTH: 3, PERSON_R: 0.4
    };
    const unitBox = new THREE.BoxGeometry(1, 1, 1);
    const materials = new Map();
    function material(color, opacity = 1) {
        const key = color + ':' + opacity;
        if (!materials.has(key)) materials.set(key, new THREE.MeshLambertMaterial({
            color, transparent: opacity < 1, opacity,
            depthWrite: opacity === 1, side: THREE.DoubleSide
        }));
        return materials.get(key);
    }
    function box(parent, x, y, z, w, h, d, color, opacity = 1) {
        const mesh = new THREE.Mesh(unitBox, material(color, opacity));
        mesh.position.set(x, y, z); mesh.scale.set(w, h, d); parent.add(mesh); return mesh;
    }
    function cylinder(parent, x, y, z, radius, height, color) {
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 12), material(color));
        mesh.position.set(x, y, z); parent.add(mesh); return mesh;
    }
    function updateTextTexture(tex, text) {
        if (tex._lastText === text) return;
        tex._lastText = text;
        const ctx = tex.image.getContext('2d');
        ctx.fillStyle = '#050505'; ctx.fillRect(0, 0, 256, 256);
        ctx.fillStyle = '#ffbb22'; ctx.shadowColor = '#ffbb22'; ctx.shadowBlur = 13;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = 'bold ' + (text.length > 1 ? 151 : 210) + 'px monospace';
        ctx.fillText(text, 128, 137); ctx.shadowBlur = 0; tex.needsUpdate = true;
    }
    function createTextTexture(text) {
        const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 256;
        const tex = new THREE.CanvasTexture(canvas);
        tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
        tex.generateMipmaps = true; tex.anisotropy = 4;
        updateTextTexture(tex, text); return tex;
    }
    function display(parent, x, y, z, size, text) {
        const texture = createTextTexture(text);
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }));
        mesh.position.set(x, y, z); mesh.userData.setIndicator = (value) => updateTextTexture(texture, value);
        parent.add(mesh); return mesh;
    }
    function makeCallPanel(parent, floorNumber) {
        const panel = new THREE.Group(); panel.position.set(1.87, 1.38, 1.58); parent.add(panel);
        box(panel, 0, 0, 0, 0.55, 1.4, 0.06, 0x283e45);
        const off = new THREE.MeshBasicMaterial({ color: 0x40514c, side: THREE.DoubleSide });
        const on = new THREE.MeshBasicMaterial({ color: 0x83ffc0, side: THREE.DoubleSide });
        function arrow(y, up) {
            const shape = new THREE.Shape(); shape.moveTo(-0.13, -0.09); shape.lineTo(0.13, -0.09); shape.lineTo(0, 0.12); shape.closePath();
            const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), off);
            mesh.position.set(0, y, 0.041); if (!up) mesh.rotation.z = Math.PI; panel.add(mesh); return mesh;
        }
        const up = arrow(0.02, true), down = arrow(-0.37, false);
        const indicator = display(panel, 0, 0.43, 0.042, 0.45, String(floorNumber));
        panel.userData.setUp = (lit) => { up.material = lit ? on : off; };
        panel.userData.setDown = (lit) => { down.material = lit ? on : off; };
        panel.userData.setIndicator = indicator.userData.setIndicator;
        return panel;
    }
    // Sittable points and chair backs share ONE facing value: +Z is the seat's open edge.
    function chair(parent, x, z, facing, color = 0x447b7a, width = 0.74) {
        const group = new THREE.Group(); group.position.set(x, 0, z); group.rotation.y = facing; parent.add(group);
        box(group, 0, 0.28, 0, width, 0.16, 0.66, color);
        box(group, 0, 0.65, -0.31, width, 0.64, 0.13, color);
        [-1, 1].forEach((side) => {
            box(group, side * (width / 2 - 0.08), 0.12, 0, 0.08, 0.24, 0.49, 0x34454a);
        });
        return group;
    }
    function couch(parent, x, z, facing, color = 0x618981) {
        chair(parent, x, z, facing, color, 2.15);
    }
    function table(parent, x, z, w, d, height = 0.78) {
        box(parent, x, height, z, w, 0.12, d, 0xd3b38a);
        box(parent, x, height / 2, z, w * 0.62, height, d * 0.5, 0x536165);
    }
    function plant(parent, x, z) {
        cylinder(parent, x, 0.24, z, 0.25, 0.47, 0xb79a76);
        const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(0.52, 0), material(0x588568));
        leaves.position.set(x, 0.89, z); leaves.scale.y = 1.15; parent.add(leaves);
    }
    function cooler(parent, x, z) {
        box(parent, x, 0.45, z, 0.49, 0.9, 0.43, 0xc7d7d8);
        cylinder(parent, x, 1.13, z, 0.2, 0.46, 0x699aaa);
        box(parent, x, 0.6, z + 0.225, 0.25, 0.18, 0.035, 0x314c57);
    }
    function bfsPath(nodes, fromName, toName) {
        if (!nodes[fromName] || !nodes[toName]) return [];
        const queue = [fromName], previous = new Map([[fromName, null]]);
        for (let i = 0; i < queue.length; i++) {
            const key = queue[i]; if (key === toName) break;
            nodes[key].links.forEach((neighbor) => {
                if (!previous.has(neighbor)) { previous.set(neighbor, key); queue.push(neighbor); }
            });
        }
        if (!previous.has(toName)) return [];
        const names = []; let cursor = toName;
        while (cursor !== null) { names.push(cursor); cursor = previous.get(cursor); }
        return names.reverse().map((key) => nodes[key].position.clone());
    }
    // Batch static boxes by material, preserving separate floor groups for the cutaway control.
    function batchBoxes(group) {
        const buckets = new Map(); group.updateMatrixWorld(true);
        const inverse = group.matrixWorld.clone().invert();
        group.traverse((object) => {
            if (!object.isMesh || object.geometry !== unitBox) return;
            const key = object.material.uuid;
            if (!buckets.has(key)) buckets.set(key, []);
            buckets.get(key).push(object);
        });
        buckets.forEach((meshes) => {
            const instance = new THREE.InstancedMesh(unitBox, meshes[0].material, meshes.length);
            meshes.forEach((mesh, index) => {
                instance.setMatrixAt(index, new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld));
                mesh.removeFromParent();
            });
            group.add(instance);
        });
    }
    function createWorld(scene) {
        const buildingGroup = new THREE.Group(); buildingGroup.renderOrder = 0; scene.add(buildingGroup);
        const shell = new THREE.Group(); buildingGroup.add(shell);
        box(shell, 0, -0.18, 0, 22.6, 0.3, 18.6, 0x737f80);
        box(shell, 0, -0.26, 12, 27, 0.16, 6, 0xb5b2a5);
        box(shell, 0, -0.38, 0, 40, 0.16, 36, 0x657c77);
        for (let k = -12; k <= 12; k += 3) box(shell, k, -0.17, 12, 0.025, 0.015, 6, 0x899390);
        const roof = box(shell, 0, WORLD.FLOOR_COUNT * WORLD.FLOOR_HEIGHT, 0, 22.4, 0.18, 18.4, 0x788584);
        const floors = [];
        for (let floorNumber = 0; floorNumber < WORLD.FLOOR_COUNT; floorNumber++) {
            const y = floorNumber * WORLD.FLOOR_HEIGHT;
            const group = new THREE.Group(); group.position.y = y; buildingGroup.add(group);
            const nodes = {};
            const sitTargets = {};
            const desks = [];
            const seatNames = [];
            const standingNames = [];
            function node(name, x, z, sit = null, facing = 0) {
                nodes[name] = { name, position: new THREE.Vector3(x, y, z), links: [] };
                if (sit !== null) { sitTargets[name] = { sit, facing }; (sit ? seatNames : standingNames).push(name); }
                return name;
            }
            function link(a, b) { nodes[a].links.push(b); nodes[b].links.push(a); }
            function seat(name, x, z, facing, from, sofa = false) {
                node(name, x, z, true, facing); link(from, name);
                if (sofa) couch(group, x, z, facing); else chair(group, x, z, facing);
            }
            function stand(name, x, z, from, facing = 0) { node(name, x, z, false, facing); link(from, name); }
            if (floorNumber > 0) {
                [[-6.25, 0, 9.5, 18], [6.25, 0, 9.5, 18], [0, -5.25, 3, 7.5], [0, 5.25, 3, 7.5]].forEach((strip) => {
                    box(group, strip[0], -0.08, strip[1], strip[2], 0.12, strip[3], 0x9ca9ad, 0.3);
                });
            }
            box(group, -11, 1.65, 0, 0.12, 3.3, 18, 0x9999ff, 0.2);
            box(group, 11, 1.65, 0, 0.12, 3.3, 18, 0x9999ff, 0.2);
            box(group, 0, 1.65, -9, 22, 3.3, 0.12, 0x9999ff, 0.2);
            // Floor zero really has a 3.2m opening. Nothing spans it, including glass.
            if (floorNumber === 0) {
                box(group, -6.3, 1.65, 9, 9.4, 3.3, 0.12, 0x9999ff, 0.2);
                box(group, 6.3, 1.65, 9, 9.4, 3.3, 0.12, 0x9999ff, 0.2);
                [-1.67, 1.67].forEach((x) => box(group, x, 1.35, 9.65, 0.06, 2.7, 1.3, 0xa5dfe2, 0.2));
                box(group, 0, 3.03, 9.05, 3.35, 0.14, 0.25, 0xd7b975);
            } else box(group, 0, 1.65, 9, 22, 3.3, 0.12, 0x9999ff, 0.2);
            // Thin edge beams make the storeys legible without hiding the interior.
            [-9, 9].forEach((z) => box(group, 0, 0.02, z, 22, 0.09, 0.13, 0x7b9797));
            [-10.95, 10.95].forEach((x) => [-8.95, 8.95].forEach((z) => box(group, x, 1.7, z, 0.16, 3.4, 0.16, 0x658183)));
            [-1.52, 1.52].forEach((x) => [-1.52, 1.52].forEach((z) => box(group, x, 1.7, z, 0.10, 3.4, 0.10, 0x697c7c)));
            box(group, 0, 2.7, 1.53, 3.05, 0.13, 0.14, 0x879c99);
            const ring = [['hallS',0,2.3],['hallSE',2.4,2.3],['hallE',2.4,0],['hallNE',2.4,-2.35],['hallN',0,-2.35],['hallNW',-2.4,-2.35],['hallW',-2.4,0],['hallSW',-2.4,2.3]];
            ring.forEach((entry) => node(entry[0], entry[1], entry[2]));
            ring.forEach((entry, i) => link(entry[0], ring[(i + 1) % ring.length][0]));
            node('elevWait', 0, 2.8); link('elevWait', 'hallS');
            if (floorNumber > 0) {
                [-5.5, 0, 5.5].forEach((x) => box(group, x, 1.4, -6.15, 0.09, 2.8, 5.7, 0xbbc5e6, 0.28));
                ['A','B','C','D'].forEach((letter, index) => {
                    const x = -8.25 + 5.5 * index, prefix = 'office' + letter;
                    // Each office frontage is split around its own 1.2m door.
                    box(group, x - 1.675, 1.4, -3.3, 2.15, 2.8, 0.09, 0xbbc5e6, 0.28);
                    box(group, x + 1.675, 1.4, -3.3, 2.15, 2.8, 0.09, 0xbbc5e6, 0.28);
                    node(prefix + '_door', x, -3.3); link(prefix + '_door', index < 2 ? 'hallNW' : 'hallNE');
                    node(prefix + '_approach', x, -4.9); link(prefix + '_door', prefix + '_approach');
                    seat(prefix + '_desk', x, -6.2, Math.PI, prefix + '_approach');
                    table(group, x, -7.35, 2.5, 1.35, 0.88);
                    box(group, x, 1.24, -7.72, 1.02, 0.60, 0.09, 0x243f49);
                    box(group, x, 1.25, -7.665, 0.87, 0.44, 0.015, 0x80b6b7);
                    box(group, x, 0.98, -7.21, 0.69, 0.035, 0.24, 0x4d6669);
                    box(group, x + 0.88, 0.98, -7.35, 0.3, 0.04, 0.41, 0xe1dfcb);
                    stand(prefix + '_chat', x + 1.05, -4.65, prefix + '_approach', Math.PI);
                    desks.push({ id: letter, wpName: prefix + '_desk', doorWpName: prefix + '_door' });
                });
                // Conference and break room door gaps are each 1.2m wide.
                box(group, -3.3, 1.4, 6.15, 0.09, 2.8, 5.7, 0xbbc5e6, 0.28);
                box(group, -8.55, 1.4, 3.3, 4.9, 2.8, 0.09, 0xbbc5e6, 0.28);
                box(group, -4.1, 1.4, 3.3, 1.6, 2.8, 0.09, 0xbbc5e6, 0.28);
                node('conf_door', -5.5, 3.3); link('conf_door', 'hallSW');
                node('conf_center', -5.5, 4.15); link('conf_door', 'conf_center');
                node('conf_left', -9.95, 4.15); link('conf_center', 'conf_left');
                node('conf_right', -4.15, 4.15); link('conf_center', 'conf_right');
                table(group, -7.05, 6.45, 2.15, 3.6);
                [5.65, 7.45].forEach((z, i) => {
                    node('conf_left_approach' + i, -9.95, z); link('conf_left_approach' + i, 'conf_left');
                    node('conf_right_approach' + i, -4.15, z); link('conf_right_approach' + i, 'conf_right');
                    seat('conf_seat' + i, -9.05, z, Math.PI / 2, 'conf_left_approach' + i);
                    seat('conf_seat' + (i + 2), -5.05, z, -Math.PI / 2, 'conf_right_approach' + i);
                });
                box(group, -7.0, 1.9, 8.92, 3.2, 1.1, 0.035, 0xdfebe4);
                box(group, 3.3, 1.4, 6.15, 0.09, 2.8, 5.7, 0xbbc5e6, 0.28);
                box(group, 4.1, 1.4, 3.3, 1.6, 2.8, 0.09, 0xbbc5e6, 0.28);
                box(group, 8.55, 1.4, 3.3, 4.9, 2.8, 0.09, 0xbbc5e6, 0.28);
                node('lounge_door', 5.5, 3.3); link('lounge_door', 'hallSE');
                node('lounge_center', 5.5, 4.3); link('lounge_door', 'lounge_center');
                node('lounge_side', 8.9, 4.3); link('lounge_center', 'lounge_side');
                // Link the far sofa using side access, around the coffee table.
                node('lounge_far', 9.1, 7.9); link('lounge_side', 'lounge_far');
                seat('lounge_spot0', 7.1, 8.0, Math.PI, 'lounge_far', true);
                seat('lounge_spot1', 5.0, 6.2, Math.PI / 2, 'lounge_center');
                seat('lounge_spot2', 9.2, 6.2, -Math.PI / 2, 'lounge_side');
                table(group, 7.1, 6.2, 1.5, 1.1, 0.46);
                cooler(group, 10.25, 3.95); stand('water_cooler', 9.65, 4.25, 'lounge_side', Math.PI / 2);
                stand('hall_stand_N', 7.3, -1.4, 'hallNE', -Math.PI / 2);
                stand('hall_stand_S', -7.4, 1.55, 'hallSW', Math.PI / 2);
                plant(group, 10.05, 8.0);
            } else {
                node('outside', 0, 12); node('front_door_threshold', 0, 9.35);
                node('entrance', 0, 7.4); node('lobby_center', 0, 5.5);
                link('outside', 'front_door_threshold'); link('front_door_threshold', 'entrance'); link('entrance', 'lobby_center');
                link('lobby_center', 'elevWait'); link('entrance', 'elevWait'); link('lobby_center', 'hallSE'); link('lobby_center', 'hallSW');
                node('cafe_door', -4.6, 2.3); link('cafe_door', 'hallSW');
                node('cafe_center', -7, 2.4); link('cafe_door', 'cafe_center');
                box(group, -10.05, 0.48, 3.2, 1.2, 0.96, 4.6, 0x759490);
                box(group, -10.05, 1.01, 3.2, 1.4, 0.12, 4.8, 0x304f52);
                box(group, -10.05, 1.34, 2.0, 0.65, 0.56, 0.7, 0x25343a);
                box(group, -10.05, 1.29, 4.1, 0.85, 0.46, 1.3, 0xc9e0dd, 0.35);
                stand('cafe_order', -8.6, 1.35, 'cafe_center', -Math.PI / 2);
                [[-7.2,4.7],[-4.7,4.7],[-7.2,7.5],[-4.7,7.5]].forEach((point, i) => {
                    cylinder(group, point[0], 0.76, point[1], 0.58, 0.12, 0xd3b38a);
                    cylinder(group, point[0], 0.38, point[1], 0.12, 0.76, 0x486264);
                    const route = 'bistro_route' + i; node(route, point[0] + 1.1, point[1] - 0.6);
                    link(i > 1 ? 'bistro_route' + (i - 2) : 'cafe_center', route);
                    seat('bistro' + i + '_N', point[0], point[1] - 1.05, 0, route);
                    seat('bistro' + i + '_S', point[0], point[1] + 1.05, Math.PI, route);
                });
                node('lounge_center', 6.2, 4.3); link('lounge_center', 'hallSE');
                node('lounge_side', 9.4, 4.3); link('lounge_side', 'lounge_center');
                node('lounge_far', 9.4, 8); link('lounge_far', 'lounge_side');
                seat('lounge_spot0', 7.2, 8.0, Math.PI, 'lounge_far', true);
                seat('lounge_spot1', 4.7, 6.1, Math.PI / 2, 'lounge_center');
                seat('lounge_spot2', 9.4, 6.1, -Math.PI / 2, 'lounge_side');
                table(group, 7.15, 6.1, 1.6, 1.15, 0.46);
                node('back_center', 5.5, -2.7); link('back_center', 'hallNE');
                node('back_side', 8.5, -3.3); link('back_side', 'back_center');
                node('back_far', 8.5, -7.3); link('back_far', 'back_side');
                seat('back_lounge_N', 6.3, -7.3, 0, 'back_far', true);
                seat('back_lounge_S', 6.3, -3.3, Math.PI, 'back_center', true);
                table(group, 6.3, -5.3, 2.1, 1.15, 0.48);
                node('pit_center', -4.7, -3.4); link('pit_center', 'hallNW');
                node('pit_left', -9.3, -3.4); link('pit_left', 'pit_center');
                node('pit_rear', -9.3, -7.6); link('pit_rear', 'pit_left');
                cylinder(group, -7.1, 0.57, -5.5, 0.82, 0.16, 0xc8a881);
                seat('pit_N', -7.1, -7.45, 0, 'pit_rear'); seat('pit_S', -7.1, -3.5, Math.PI, 'pit_center');
                seat('pit_E', -5.1, -5.5, -Math.PI / 2, 'pit_center'); seat('pit_W', -9.1, -5.5, Math.PI / 2, 'pit_left');
                cooler(group, 10.15, 2.1); cooler(group, 9.5, -7.75);
                stand('lobby_wc_front', 9.6, 2.7, 'lounge_side', Math.PI);
                stand('lobby_wc_back', 9.5, -6.8, 'back_far', Math.PI);
                box(group, -3.3, 0.52, 6.35, 1.1, 1.04, 1.35, 0xc3aa85);
                box(group, -3.3, 1.14, 6.45, 0.55, 0.3, 0.1, 0x305259);
                stand('reception', -2.35, 6.3, 'lobby_center', -Math.PI / 2);
                box(group, 2.9, 0.7, 7.4, 0.48, 1.4, 0.35, 0x627d7b);
                box(group, 2.9, 1.5, 7.4, 0.67, 0.63, 0.12, 0x85baba);
                stand('kiosk', 2.9, 8.25, 'entrance', Math.PI);
                [['center',3.6,-1.1,'hallE'],['NE',7.7,-0.8,'back_center'],['NW',-7.2,-0.9,'pit_center'],['midE',6.5,1.3,'hallSE'],['midW',-6,0.8,'hallSW'],['entry',3.1,5.1,'lobby_center']].forEach((entry) => stand('lobby_stand_' + entry[0], entry[1], entry[2], entry[3]));
                plant(group, -2.1, 8.3); plant(group, 4.0, 8.3);
            }
            const callPanel = makeCallPanel(group, floorNumber);
            const shaftIndicator = display(group, 0, 2.92, 1.62, 0.9, '0');
            const floorLabel = display(group, -10.8, 2.15, 9.1, 0.65, String(floorNumber));
            floorLabel.name = 'Floor ' + floorNumber;
            floors.push({ floorNumber, group, nodes, callPanel, shaftIndicator, desks, sitTargets, seatNames, standingNames,
                entranceSpot: nodes.entrance?.position, cafeSpots: seatNames.filter((name) => name.startsWith('bistro')) });
            batchBoxes(group);
        }
        return { buildingGroup, floors, bfsPath, roof, shell };
    }
    window.WORLD = WORLD;
    window.createWorld = createWorld;
    window.bfsPath = bfsPath;
    window.createTextTexture = createTextTexture;
    window.updateTextTexture = updateTextTexture;
})();
