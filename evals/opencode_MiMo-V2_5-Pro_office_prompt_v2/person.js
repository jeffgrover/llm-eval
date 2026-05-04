/*  person.js  –  person mesh factory + walk/sit animation  */

const SHIRT_COLORS = [0x4488cc, 0xcc6644, 0x44aa66, 0x8866aa, 0xcc8844, 0x44aaaa, 0xaa4466, 0x668844];
const SKIN_COLORS  = [0xd4a574, 0xc68642, 0x8d5524, 0xf1c27d, 0xffdbac];
const PANT_COLORS  = [0x333344, 0x444455, 0x2b2b3a, 0x3a3a4a, 0x555566];

function _pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function createPerson(opts) {
    opts = opts || {};
    const bodyColor  = opts.bodyColor  || _pick(SHIRT_COLORS);
    const skinColor  = opts.skinColor  || _pick(SKIN_COLORS);
    const legColor   = opts.legColor   || _pick(PANT_COLORS);

    const group = new THREE.Group();
    group.userData.isWalking = false;
    group.userData.isSitting = false;
    group.userData.walkPhase = 0;

    const bodyMat  = new THREE.MeshLambertMaterial({ color: bodyColor });
    const skinMat  = new THREE.MeshLambertMaterial({ color: skinColor });
    const legMat   = new THREE.MeshLambertMaterial({ color: legColor });

    // Legs – pivot at hip, cylinder hangs below
    function makeLeg(xOff) {
        const pivot = new THREE.Group();
        pivot.position.set(xOff, 0.75, 0);
        const calf = new THREE.Mesh(
            new THREE.CylinderGeometry(0.08, 0.08, 0.75, 6),
            legMat
        );
        calf.position.y = -0.375;
        pivot.add(calf);
        return pivot;
    }
    const leftLeg  = makeLeg(-0.14);
    const rightLeg = makeLeg(0.14);
    group.add(leftLeg, rightLeg);
    group.userData.leftLeg  = leftLeg;
    group.userData.rightLeg = rightLeg;

    // Torso
    const torso = new THREE.Mesh(
        new THREE.BoxGeometry(0.42, 0.55, 0.24),
        bodyMat
    );
    torso.position.y = 1.25;
    group.add(torso);

    // Arms – pivot at shoulder, cylinder hangs below
    function makeArm(xOff) {
        const pivot = new THREE.Group();
        pivot.position.set(xOff, 1.5, 0);
        const upper = new THREE.Mesh(
            new THREE.CylinderGeometry(0.06, 0.06, 0.55, 6),
            bodyMat
        );
        upper.position.y = -0.275;
        pivot.add(upper);
        return pivot;
    }
    const leftArm  = makeArm(-0.27);
    const rightArm = makeArm(0.27);
    group.add(leftArm, rightArm);
    group.userData.leftArm  = leftArm;
    group.userData.rightArm = rightArm;

    // Head
    const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.16, 8, 6),
        skinMat
    );
    head.position.y = 1.68;
    group.add(head);

    // Nose on +Z face
    const nose = new THREE.Mesh(
        new THREE.SphereGeometry(0.04, 6, 4),
        skinMat
    );
    nose.position.set(0, 1.68, 0.16);
    group.add(nose);

    return group;
}

function animatePersonWalking(person, dt) {
    const ud = person.userData;
    if (!ud.leftLeg) return;  // not a properly-built person

    if (ud.isSitting) {
        ud.leftLeg.rotation.x  = -Math.PI / 2;
        ud.rightLeg.rotation.x = -Math.PI / 2;
        ud.leftArm.rotation.x  = -Math.PI / 4;
        ud.rightArm.rotation.x = -Math.PI / 4;
        ud.walkPhase = 0;
    } else if (ud.isWalking) {
        ud.walkPhase += dt * 8;
        const s = Math.sin(ud.walkPhase);
        ud.leftLeg.rotation.x   =  s * 0.6;
        ud.rightLeg.rotation.x  = -s * 0.6;
        ud.leftArm.rotation.x   = -s * 0.5;
        ud.rightArm.rotation.x  =  s * 0.5;
    } else {
        ud.leftLeg.rotation.x  = 0;
        ud.rightLeg.rotation.x = 0;
        ud.leftArm.rotation.x  = 0;
        ud.rightArm.rotation.x = 0;
        ud.walkPhase = 0;
    }
}

window.createPerson = createPerson;
window.animatePersonWalking = animatePersonWalking;
