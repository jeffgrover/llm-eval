function Elevator(sceneRef, worldRef){
    this.scene=sceneRef;
    this.world=worldRef;
    this.logic=new window.ElevatorLogic({floorCount:WORLD.FLOOR_COUNT, maxCapacity:4, floorHeight:WORLD.FLOOR_HEIGHT});
    this.carGroup=new THREE.Group();
    var carW=WORLD.SHAFT_WIDTH-0.2, carD=WORLD.SHAFT_DEPTH-0.2, carH=2.2;
    // floor
    var floorM=new THREE.Mesh(new THREE.BoxGeometry(carW,0.08,carD), new THREE.MeshStandardMaterial({color:0xffd700, transparent:true, opacity:0.5, side:THREE.DoubleSide, depthWrite:false}));
    floorM.position.y=0.04; floorM.renderOrder=1; this.carGroup.add(floorM);
    // ceiling
    var ceilM=new THREE.Mesh(new THREE.BoxGeometry(carW,0.08,carD), new THREE.MeshStandardMaterial({color:0xffd700, transparent:true, opacity:0.5, side:THREE.DoubleSide, depthWrite:false}));
    ceilM.position.y=carH; ceilM.renderOrder=1; this.carGroup.add(ceilM);
    // side walls
    var sideMat=new THREE.MeshStandardMaterial({color:0xffd700, transparent:true, opacity:0.5, side:THREE.DoubleSide, depthWrite:false});
    var leftWall=new THREE.Mesh(new THREE.BoxGeometry(0.08,carH,carD), sideMat); leftWall.position.set(-carW/2,carH/2,0); leftWall.renderOrder=1; this.carGroup.add(leftWall);
    var rightWall=new THREE.Mesh(new THREE.BoxGeometry(0.08,carH,carD), sideMat); rightWall.position.set(carW/2,carH/2,0); rightWall.renderOrder=1; this.carGroup.add(rightWall);
    // back wall opaque
    var backWall=new THREE.Mesh(new THREE.BoxGeometry(carW,carH,0.08), new THREE.MeshStandardMaterial({color:0xffd700}));
    backWall.position.set(0,carH/2,-carD/2); backWall.renderOrder=1; this.carGroup.add(backWall);
    // doors
    var doorW=carW/2, doorH=2.0;
    var doorMat=new THREE.MeshStandardMaterial({color:0xffcc00, transparent:true, opacity:0.7, side:THREE.DoubleSide, depthWrite:false});
    this.leftDoor=new THREE.Mesh(new THREE.BoxGeometry(doorW-0.02,doorH,0.05), doorMat);
    this.leftDoor.position.set(-doorW/2,doorH/2,carD/2);
    this.leftDoor.renderOrder=1; this.carGroup.add(this.leftDoor);
    this.rightDoor=new THREE.Mesh(new THREE.BoxGeometry(doorW-0.02,doorH,0.05), doorMat);
    this.rightDoor.position.set(doorW/2,doorH/2,carD/2);
    this.rightDoor.renderOrder=1; this.carGroup.add(this.rightDoor);
    this.doorOffset=0;
    // in-car indicator above doors inside
    var inTex=makeTextTexture('0');
    this.inIndicator=new THREE.Mesh(new THREE.PlaneGeometry(0.6,0.6), new THREE.MeshBasicMaterial({map:inTex, side:THREE.DoubleSide}));
    this.inIndicator.position.set(0,1.9,-carD/2+0.1);
    this.inIndicator.rotation.y=Math.PI;
    this.inIndicator.renderOrder=1; this.carGroup.add(this.inIndicator);
    this.inTex=inTex;
    // destination panel on back wall
    this.destButtons=[];
    for(var i=0;i<WORLD.FLOOR_COUNT;i++){
        var btn=new THREE.Mesh(new THREE.CylinderGeometry(0.07,0.07,0.02,12), new THREE.MeshStandardMaterial({color:0x222222, emissive:0x000000}));
        btn.rotation.x=Math.PI/2;
        btn.position.set(carW/2-0.25, 0.6 + i*0.18, -carD/2+0.08);
        btn.renderOrder=1;
        this.carGroup.add(btn);
        this.destButtons.push(btn);
    }
    this.carGroup.position.set(0,0,0);
    this.carGroup.renderOrder=1;
    sceneRef.add(this.carGroup);
    // mirror logic sets
    this.state=this.logic.state;
    this.direction=this.logic.direction;
    this.currentFloor=this.logic.currentFloor;
    this.targetFloor=this.logic.targetFloor;
    this.upCalls=this.logic.upCalls;
    this.downCalls=this.logic.downCalls;
    this.destinations=this.logic.destinations;
    this.passengers=this.logic.passengers;
    this.pendingBoarders=this.logic.pendingBoarders;
    this.pendingDisembark=this.logic.pendingDisembark;
}
Elevator.prototype.callUp=function(f){ this.logic.callUp(f); };
Elevator.prototype.callDown=function(f){ this.logic.callDown(f); };
Elevator.prototype.pressDestination=function(f){ this.logic.pressDestination(f); };
Elevator.prototype.isAcceptingAt=function(floor,dir){ return this.logic.isAcceptingAt(floor,dir); };
Elevator.prototype.currentCapacityFree=function(){ return this.logic.currentCapacityFree(); };
Elevator.prototype.reserveBoardingSpot=function(person){
    var spot=this.logic.reserveBoardingSpot(person);
    if(!spot) return null;
    // store index on person for later release
    person._elevatorSpotIndex=spot.index;
    // convert to THREE.Vector3 target inside car local space
    // x and z already, y ~0.05 above car floor
    return {index:spot.index, x:spot.x, y:spot.y, z:spot.z, vec:new THREE.Vector3(spot.x, spot.y, spot.z)};
};
Elevator.prototype.completeBoard=function(person){ this.logic.completeBoard(person); };
Elevator.prototype.registerDisembark=function(person){ this.logic.registerDisembark(person); };
Elevator.prototype.completeDisembark=function(person){
    this.logic.completeDisembark(person);
    if(person) person._elevatorSpotIndex=-1;
};
Elevator.prototype.reset=function(){
    this.logic.reset();
    this.carGroup.position.y=0;
    this.doorOffset=0;
    this._applyDoor(0);
    this._sync();
};
Elevator.prototype._applyDoor=function(off){
    var carW=WORLD.SHAFT_WIDTH-0.2;
    var doorW=carW/2;
    var shift=(doorW/2);
    this.leftDoor.position.x = -doorW/2 - off*shift;
    this.rightDoor.position.x = doorW/2 + off*shift;
};
Elevator.prototype._sync=function(){
    this.state=this.logic.state;
    this.direction=this.logic.direction;
    this.currentFloor=this.logic.currentFloor;
    this.targetFloor=this.logic.targetFloor;
};
Elevator.prototype.tick=function(dt){
    this.logic.tick(dt);
    this._sync();
    // car position
    this.carGroup.position.y = this.logic.pos * WORLD.FLOOR_HEIGHT;
    // doors
    var targetOff=0;
    if(this.logic.state==='DOOR_OPEN' || this.logic.state==='DOOR_OPENING') targetOff=1;
    else if(this.logic.state==='DOOR_CLOSING') targetOff=0;
    // animate doors smoothly
    var speed= (this.logic.state==='DOOR_OPENING' || this.logic.state==='DOOR_CLOSING') ? 2.2 : 4;
    if(this.doorOffset < targetOff) this.doorOffset=Math.min(targetOff, this.doorOffset + dt*speed);
    else if(this.doorOffset > targetOff) this.doorOffset=Math.max(targetOff, this.doorOffset - dt*speed);
    this._applyDoor(this.doorOffset);
    // indicators & destination buttons
    var dirChar=this.logic.direction===1?'^':(this.logic.direction===-1?'v':'-');
    var txt=this.logic.currentFloor+dirChar;
    updateTextTexture(this.inTex, txt);
    // per floor panels
    for(var i=0;i<this.world.floors.length;i++){
        var fl=this.world.floors[i];
        if(fl.callPanel){
            fl.callPanel.userData.setUp(this.logic.upCalls.has(i));
            fl.callPanel.userData.setDown(this.logic.downCalls.has(i));
            fl.callPanel.userData.setIndicator(String(i));
        }
        if(fl.shaftIndicator){
            fl.shaftIndicator.setText(txt);
        }
    }
    for(var b=0;b<this.destButtons.length;b++){
        var on=this.logic.destinations.has(b);
        this.destButtons[b].material.emissive.setHex(on?0x00ff00:0x000000);
        this.destButtons[b].material.color.setHex(on?0x00ff88:0x222222);
    }
};
window.Elevator=Elevator;
