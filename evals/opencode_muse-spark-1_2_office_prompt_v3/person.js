function createPerson(opts){
    opts=opts||{};
    var bodyColor=opts.bodyColor||'#3a7bd5';
    var skinColor=opts.skinColor||'#e8c4a8';
    var legColor=opts.legColor||'#2c3e50';
    var g=new THREE.Group();
    var legGeo=new THREE.CylinderGeometry(0.08,0.08,0.45,8);
    var torsoGeo=new THREE.CylinderGeometry(0.22,0.2,0.5,8);
    var headGeo=new THREE.SphereGeometry(0.18,12,10);
    var armGeo=new THREE.CylinderGeometry(0.06,0.06,0.38,8);
    var matBody=new THREE.MeshStandardMaterial({color:bodyColor});
    var matSkin=new THREE.MeshStandardMaterial({color:skinColor});
    var matLeg=new THREE.MeshStandardMaterial({color:legColor});
    var torso=new THREE.Mesh(torsoGeo,matBody);
    torso.position.y=0.68;
    g.add(torso);
    var head=new THREE.Mesh(headGeo,matSkin);
    head.position.y=1.05;
    torso.add(head);
    // nose hemisphere on +Z
    var noseGeo=new THREE.SphereGeometry(0.05,8,6,0,Math.PI*2,0,Math.PI/2);
    var nose=new THREE.Mesh(noseGeo,matSkin);
    nose.position.set(0,0,0.16);
    nose.rotation.x=Math.PI/2;
    head.add(nose);
    // legs as groups pivoting at hip
    var leftLegGroup=new THREE.Group();
    leftLegGroup.position.set(-0.1,0.43,0);
    var leftLeg=new THREE.Mesh(legGeo,matLeg);
    leftLeg.position.y=-0.225;
    leftLegGroup.add(leftLeg);
    var rightLegGroup=new THREE.Group();
    rightLegGroup.position.set(0.1,0.43,0);
    var rightLeg=new THREE.Mesh(legGeo,matLeg);
    rightLeg.position.y=-0.225;
    rightLegGroup.add(rightLeg);
    g.add(leftLegGroup);
    g.add(rightLegGroup);
    // arms
    var leftArmGroup=new THREE.Group();
    leftArmGroup.position.set(-0.26,0.85,0);
    var leftArm=new THREE.Mesh(armGeo,matSkin);
    leftArm.position.y=-0.19;
    leftArmGroup.add(leftArm);
    var rightArmGroup=new THREE.Group();
    rightArmGroup.position.set(0.26,0.85,0);
    var rightArm=new THREE.Mesh(armGeo,matSkin);
    rightArm.position.y=-0.19;
    rightArmGroup.add(rightArm);
    g.add(leftArmGroup);
    g.add(rightArmGroup);
    // feet at y=0 already (leg bottom at 0.43-0.45= -0.02 approx)
    g.userData.leftLeg=leftLegGroup;
    g.userData.rightLeg=rightLegGroup;
    g.userData.leftArm=leftArmGroup;
    g.userData.rightArm=rightArmGroup;
    g.userData.isWalking=false;
    g.userData.isSitting=false;
    g.userData.walkPhase=0;
    // expose for collision
    return g;
}
function animatePersonWalking(person, dt){
    var ud=person.userData;
    if(!ud) return;
    if(ud.isSitting){
        if(ud.leftLeg) ud.leftLeg.rotation.x=-Math.PI/2;
        if(ud.rightLeg) ud.rightLeg.rotation.x=-Math.PI/2;
        if(ud.leftArm) ud.leftArm.rotation.x=-Math.PI/4;
        if(ud.rightArm) ud.rightArm.rotation.x=-Math.PI/4;
        ud.walkPhase=0;
        return;
    }
    if(ud.isWalking){
        ud.walkPhase+=dt*8;
        var s=Math.sin(ud.walkPhase);
        if(ud.leftLeg) ud.leftLeg.rotation.x=s*0.6;
        if(ud.rightLeg) ud.rightLeg.rotation.x=-s*0.6;
        if(ud.leftArm) ud.leftArm.rotation.x=-s*0.5;
        if(ud.rightArm) ud.rightArm.rotation.x=s*0.5;
    } else {
        if(ud.leftLeg) ud.leftLeg.rotation.x=0;
        if(ud.rightLeg) ud.rightLeg.rotation.x=0;
        if(ud.leftArm) ud.leftArm.rotation.x=0;
        if(ud.rightArm) ud.rightArm.rotation.x=0;
        ud.walkPhase=0;
    }
}
window.createPerson=createPerson;
window.animatePersonWalking=animatePersonWalking;
