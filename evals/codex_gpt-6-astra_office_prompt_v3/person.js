(function () {
    'use strict';
    const shirts = [0x3c8f91, 0xd07853, 0x627db1, 0xc9a85d, 0x866b96, 0xd4c7ad];
    const skins = [0xf0c4a0, 0xc98e69, 0x8e5d42, 0x623f30, 0xdbaa85];
    const trousers = [0x263645, 0x46505c, 0x554a45, 0x334a46];
    const pick = (palette) => palette[Math.floor(Math.random() * palette.length)];
    const sphere = new THREE.SphereGeometry(0.21, 10, 8);
    const limb = new THREE.CylinderGeometry(0.085, 0.075, 0.57, 7);
    function createPerson(options = {}) {
        const person = new THREE.Group();
        const cloth = new THREE.MeshLambertMaterial({ color: options.bodyColor ?? pick(shirts) });
        const skin = new THREE.MeshLambertMaterial({ color: options.skinColor ?? pick(skins) });
        const pants = new THREE.MeshLambertMaterial({ color: options.legColor ?? pick(trousers) });
        function part(geometry, material, x, y, z, parent = person) {
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(x, y, z);
            parent.add(mesh);
            return mesh;
        }
        const legs = [-0.13, 0.13].map((x) => {
            const pivot = new THREE.Group();
            pivot.position.set(x, 0.65, 0);
            person.add(pivot);
            part(limb, pants, 0, -0.3, 0, pivot);
            part(new THREE.BoxGeometry(0.17, 0.1, 0.27), pants, 0, -0.6, 0.055, pivot);
            return pivot;
        });
        part(new THREE.CylinderGeometry(0.23, 0.20, 0.55, 8), cloth, 0, 0.94, 0);
        part(sphere, skin, 0, 1.45, 0);
        const nose = part(new THREE.SphereGeometry(0.075, 8, 6, 0, Math.PI), skin, 0, 1.44, 0.19);
        nose.name = 'Facing +Z';
        const arms = [-0.31, 0.31].map((x) => {
            const pivot = new THREE.Group();
            pivot.position.set(x, 1.15, 0);
            person.add(pivot);
            part(limb, cloth, 0, -0.27, 0, pivot);
            part(new THREE.SphereGeometry(0.085, 6, 5), skin, 0, -0.56, 0, pivot);
            return pivot;
        });
        person.userData = { legs, arms, walkPhase: 0, isWalking: false, isSitting: false };
        return person;
    }
    function animatePersonWalking(person, dt) {
        const data = person.userData;
        if (data.isSitting) {
            data.legs.forEach((leg) => { leg.rotation.x = -Math.PI / 2; });
            data.arms.forEach((arm) => { arm.rotation.x = -Math.PI / 4; });
            data.walkPhase = 0;
        } else if (data.isWalking) {
            data.walkPhase += dt * 8;
            const swing = Math.sin(data.walkPhase);
            data.legs[0].rotation.x = swing * 0.6;
            data.legs[1].rotation.x = -swing * 0.6;
            data.arms[0].rotation.x = -swing * 0.5;
            data.arms[1].rotation.x = swing * 0.5;
        } else {
            data.legs.concat(data.arms).forEach((joint) => { joint.rotation.x = 0; });
            data.walkPhase = 0;
        }
    }
    window.createPerson = createPerson;
    window.animatePersonWalking = animatePersonWalking;
})();
