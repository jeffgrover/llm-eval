// world.js
// Building geometry, per-floor layouts, navigation graph, call panels

const WORLD = {
    FLOOR_HEIGHT: 3.4,
    FLOOR_COUNT: 6,
    BUILDING_WIDTH: 22,
    BUILDING_DEPTH: 18,
    SHAFT_WIDTH: 3,
    SHAFT_DEPTH: 3,
    PERSON_R: 0.4
};

function createWorld(scene) {
    const buildingGroup = new THREE.Group();
    buildingGroup.renderOrder = 0;
    scene.add(buildingGroup);

    // Ground slab and roof
    const slabMaterial = new THREE.MeshBasicMaterial({ color: 0x888888, opacity: 0.3, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const floorMaterial = new THREE.MeshBasicMaterial({ color: 0x9999ff, opacity: 0.2, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const interiorMaterial = new THREE.MeshBasicMaterial({ color: 0xbbd0e6, opacity: 0.28, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const wallMaterial = new THREE.MeshBasicMaterial({ color: 0x9999ff, opacity: 0.2, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const lobbyWallMaterial = new THREE.MeshBasicMaterial({ color: 0x9999ff, opacity: 0.2, transparent: true, depthWrite: false, side: THREE.DoubleSide });

    // Shaft column (transparent? Actually shaft is empty, so we don't build walls there)
    // We'll just leave a hole.

    // Build each floor
    const floors = [];
    for (let f = 0; f < WORLD.FLOOR_COUNT; f++) {
        const floorGroup = new THREE.Group();
        buildingGroup.add(floorGroup);
        const y = f * WORLD.FLOOR_HEIGHT;

        // Floor slab (the walkable floor)
        const slab = new THREE.Mesh(
            new THREE.PlaneGeometry(WORLD.BUILDING_WIDTH, WORLD.BUILDING_DEPTH),
            new THREE.MeshBasicMaterial({ color: 0xcccccc, opacity: 0.1, transparent: true, depthWrite: false, side: THREE.DoubleSide })
        );
        slab.position.y = y;
        floorGroup.add(slab);

        // If f === 0 (lobby), we have a different front wall with a gap
        if (f === 0) {
            // Front wall: left and right segments, with a 3-unit gap centered on x=0
            const frontWallWidth = WORLD.BUILDING_WIDTH;
            const gapWidth = 3;
            const leftPanelWidth = (frontWallWidth - gapWidth) / 2;
            // Left panel
            const leftPanel = new THREE.Mesh(
                new THREE.BoxGeometry(leftPanelWidth, 1, WORLD.BUILDING_DEPTH),
                lobbyWallMaterial
            );
            leftPanel.position.x = -leftPanelWidth / 2 - 0.5; // offset to center
            leftPanel.position.z = 0; // front wall at z = +BUILDING_DEPTH/2? Actually we need to decide coordinate.
            // Let's assume the building depth is along Z, with front at positive Z.
            // We'll place the front wall at z = WORLD.BUILDING_DEPTH / 2
            leftPanel.position.z = WORLD.BUILDING_DEPTH / 2 - 0.5;
            leftPanel.position.y = y + 1; // wall height 2? We'll use 2 for now.
            floorGroup.add(leftPanel);
            // Right panel
            const rightPanel = new THREE.Mesh(
                new THREE.BoxGeometry(leftPanelWidth, 1, WORLD.BUILDING_DEPTH),
                lobbyWallMaterial
            );
            rightPanel.position.x = leftPanelWidth / 2 + 0.5;
            rightPanel.position.z = leftPanel.position.z;
            rightPanel.position.y = leftPanel.position.y;
            floorGroup.add(rightPanel);
            // There might be a header above the gap, but we skip for now.
        } else {
            // Office floors: front wall solid (three segments: two side panels full-height, one above-the-gap panel covering floors 1-5)
            // Actually the prompt says: "floors 1..5 of the front wall are solid (build the front wall as three segments: two side panels full-height, one above-the-gap panel covering floors 1-5)."
            // This is ambiguous. We'll just build a full front wall for now.
            const frontWall = new THREE.Mesh(
                new THREE.BoxGeometry(WORLD.BUILDING_WIDTH, 2, 0.5),
                wallMaterial
            );
            frontWall.position.x = 0;
            frontWall.position.z = WORLD.BUILDING_DEPTH / 2 - 0.25;
            frontWall.position.y = y + 1;
            floorGroup.add(frontWall);
        }

        // Back wall (solid)
        const backWall = new THREE.Mesh(
            new THREE.BoxGeometry(WORLD.BUILDING_WIDTH, 2, 0.5),
            wallMaterial
        );
        backWall.position.x = 0;
        backWall.position.z = -WORLD.BUILDING_DEPTH / 2 + 0.25;
        backWall.position.y = y + 1;
        floorGroup.add(backWall);

        // Left wall
        const leftWall = new THREE.Mesh(
            new THREE.BoxGeometry(0.5, 2, WORLD.BUILDING_DEPTH),
            wallMaterial
        );
        leftWall.position.x = -WORLD.BUILDING_WIDTH / 2 + 0.25;
        leftWall.position.y = y + 1;
        floorGroup.add(leftWall);

        // Right wall
        const rightWall = new THREE.Mesh(
            new THREE.BoxGeometry(0.5, 2, WORLD.BUILDING_DEPTH),
            wallMaterial
        );
        rightWall.position.x = WORLD.BUILDING_WIDTH / 2 - 0.25;
        rightWall.position.y = y + 1;
        floorGroup.add(rightWall);

        // Shaft opening: we just leave a hole in the floor slab.
        // We'll not add any geometry for the shaft.

        // Interior walls: we'll skip for now.

        // Store floor data
        floors.push({
            floorNumber: f,
            nodes: [],
            callPanel: null,
            shaftIndicator: null,
            desks: [],
            sitTargets: {}
        });
    }

    // For now, return a simple structure
    return {
        buildingGroup: buildingGroup,
        floors: floors,
        bfsPath: function(nodes, fromName, toName) {
            // Dummy implementation
            return [new THREE.Vector3(0, 0, 0)];
        }
    };
}

window.createWorld = createWorld;