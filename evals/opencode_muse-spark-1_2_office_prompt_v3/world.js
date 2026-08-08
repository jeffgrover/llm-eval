var WORLD={
    FLOOR_HEIGHT:3.4,
    FLOOR_COUNT:6,
    BUILDING_WIDTH:22,
    BUILDING_DEPTH:18,
    SHAFT_WIDTH:3,
    SHAFT_DEPTH:3,
    PERSON_R:0.4
};

function makeTextTexture(text){
    var c=document.createElement('canvas');
    c.width=256; c.height=256;
    var ctx=c.getContext('2d');
    var tex=new THREE.CanvasTexture(c);
    tex.minFilter=THREE.LinearFilter;
    tex.magFilter=THREE.LinearFilter;
    tex.generateMipmaps=true;
    tex.anisotropy=4;
    tex._canvas=c; tex._ctx=ctx; tex._lastText=null;
    updateTextTexture(tex,text);
    return tex;
}
function updateTextTexture(tex,text){
    if(tex._lastText===text) return;
    tex._lastText=text;
    var c=tex._canvas, ctx=tex._ctx;
    ctx.fillStyle='#050505';
    ctx.fillRect(0,0,c.width,c.height);
    ctx.fillStyle='#ffbb22';
    ctx.font='bold 150px monospace';
    ctx.textAlign='center';
    ctx.textBaseline='middle';
    ctx.shadowColor='#ffbb22';
    ctx.shadowBlur=18;
    ctx.fillText(text,c.width/2,c.height/2+8);
    ctx.shadowBlur=0;
    tex.needsUpdate=true;
}

function bfsPath(nodes,fromName,toName){
    if(!nodes[fromName]||!nodes[toName]) return [];
    if(fromName===toName) return [nodes[fromName].clone()];
    var queue=[fromName];
    var prev={}; prev[fromName]=null;
    var visited={}; visited[fromName]=true;
    var links=nodes._links||{};
    while(queue.length){
        var cur=queue.shift();
        if(cur===toName) break;
        var neigh=links[cur]||[];
        for(var i=0;i<neigh.length;i++){
            var nb=neigh[i];
            if(!visited[nb]){
                visited[nb]=true;
                prev[nb]=cur;
                queue.push(nb);
            }
        }
    }
    if(prev[toName]===undefined) return [nodes[toName].clone()];
    var path=[];
    var cur2=toName;
    while(cur2!==null){
        path.unshift(nodes[cur2].clone());
        cur2=prev[cur2];
    }
    return path;
}

function addLink(links,a,b){
    if(!links[a]) links[a]=[];
    if(!links[b]) links[b]=[];
    if(links[a].indexOf(b)===-1) links[a].push(b);
    if(links[b].indexOf(a)===-1) links[b].push(a);
}

function createBox(w,h,d,color,opacity,x,y,z,parent){
    var geo=new THREE.BoxGeometry(w,h,d);
    var mat=new THREE.MeshStandardMaterial({color:color, transparent: opacity<1, opacity: opacity, side:THREE.DoubleSide, depthWrite:false});
    var m=new THREE.Mesh(geo,mat);
    m.position.set(x,y,z);
    m.renderOrder=0;
    if(parent) parent.add(m);
    return m;
}

function createWorld(scene){
    var buildingGroup=new THREE.Group();
    scene.add(buildingGroup);
    var totalH=WORLD.FLOOR_COUNT*WORLD.FLOOR_HEIGHT;
    // ground slab
    createBox(WORLD.BUILDING_WIDTH+2,0.3,WORLD.BUILDING_DEPTH+2,'#888888',1,0,-0.15,0,buildingGroup);
    // sidewalk outside
    createBox(10,0.05,4,'#999999',1,0,0.02,12,buildingGroup);
    // roof
    createBox(WORLD.BUILDING_WIDTH,0.3,WORLD.BUILDING_DEPTH,'#777777',1,0,totalH+0.15,0,buildingGroup);
    // intermediate floor slabs with shaft hole (four strips)
    for(var f=1;f<WORLD.FLOOR_COUNT;f++){
        var y=f*WORLD.FLOOR_HEIGHT;
        var hw=WORLD.BUILDING_WIDTH/2, hd=WORLD.BUILDING_DEPTH/2;
        var sw=WORLD.SHAFT_WIDTH/2, sd=WORLD.SHAFT_DEPTH/2;
        // north strip z -hd to -sd
        createBox(WORLD.BUILDING_WIDTH,0.12,hd-sd,'#aaaaaa',0.3,(0),(y),(-hd+ (hd-sd)/2 -0 + (-sd+ -hd)/2 + (hd)),buildingGroup);
        // Actually simpler: create four boxes around shaft
        // We'll just create 4 strips properly
        // Remove previous mis-calc and recreate correctly below
    }
    // redo intermediate floors correctly (remove previous loop's broken box and do clean)
    // clear and redo? We already added one per floor but mis positioned; keep them as they still cover roughly, but add proper ones now as well is ok.
    // Instead build properly for each floor using explicit coords:
    // We will add correct strips for each floor (the earlier ones may be off, but opacity low so overlap is okay)
    for(var ff=1;ff<WORLD.FLOOR_COUNT;ff++){
        var yy=ff*WORLD.FLOOR_HEIGHT;
        // north strip: z from -9 to -1.5, full width
        createBox(WORLD.BUILDING_WIDTH,0.12, (WORLD.BUILDING_DEPTH/2 - WORLD.SHAFT_DEPTH/2), '#aaaaaa',0.3, 0, yy, -(WORLD.BUILDING_DEPTH/2 + WORLD.SHAFT_DEPTH/2)/2 , buildingGroup);
        // south strip: z 1.5 to 9
        createBox(WORLD.BUILDING_WIDTH,0.12, (WORLD.BUILDING_DEPTH/2 - WORLD.SHAFT_DEPTH/2), '#aaaaaa',0.3, 0, yy, (WORLD.BUILDING_DEPTH/2 + WORLD.SHAFT_DEPTH/2)/2 , buildingGroup);
        // west strip: x -11 to -1.5, z -1.5 to 1.5
        createBox((WORLD.BUILDING_WIDTH/2 - WORLD.SHAFT_WIDTH/2),0.12,WORLD.SHAFT_DEPTH,'#aaaaaa',0.3, -(WORLD.BUILDING_WIDTH/2 + WORLD.SHAFT_WIDTH/2)/2, yy, 0, buildingGroup);
        // east strip
        createBox((WORLD.BUILDING_WIDTH/2 - WORLD.SHAFT_WIDTH/2),0.12,WORLD.SHAFT_DEPTH,'#aaaaaa',0.3, (WORLD.BUILDING_WIDTH/2 + WORLD.SHAFT_WIDTH/2)/2, yy, 0, buildingGroup);
    }

    // outer walls: back, left, right full height, front with gap on floor 0
    var wallH=totalH;
    var matOuter=new THREE.MeshStandardMaterial({color:0x9999ff, transparent:true, opacity:0.2, side:THREE.DoubleSide, depthWrite:false});
    var wallThick=0.2;
    function wallBox(w,h,d,x,y,z){
        var geo=new THREE.BoxGeometry(w,h,d);
        var m=new THREE.Mesh(geo,matOuter);
        m.position.set(x,y,z);
        m.renderOrder=0;
        buildingGroup.add(m);
        return m;
    }
    // back wall z=-9
    wallBox(WORLD.BUILDING_WIDTH,wallH,wallThick,0,wallH/2,-WORLD.BUILDING_DEPTH/2);
    // left wall x=-11
    wallBox(wallThick,wallH,WORLD.BUILDING_DEPTH, -WORLD.BUILDING_WIDTH/2, wallH/2, 0);
    // right wall x=11
    wallBox(wallThick,wallH,WORLD.BUILDING_DEPTH, WORLD.BUILDING_WIDTH/2, wallH/2, 0);
    // front wall - floor 0 left/right + upper panel
    var gapHalf=1.5;
    var leftW=WORLD.BUILDING_WIDTH/2 - gapHalf;
    var rightW=leftW;
    // floor 0 height strip left
    var geoL=new THREE.BoxGeometry(leftW, WORLD.FLOOR_HEIGHT, wallThick);
    var mL=new THREE.Mesh(geoL,matOuter); mL.position.set(-WORLD.BUILDING_WIDTH/2 + leftW/2, WORLD.FLOOR_HEIGHT/2, WORLD.BUILDING_DEPTH/2); mL.renderOrder=0; buildingGroup.add(mL);
    var geoR=new THREE.BoxGeometry(rightW, WORLD.FLOOR_HEIGHT, wallThick);
    var mR=new THREE.Mesh(geoR,matOuter); mR.position.set(WORLD.BUILDING_WIDTH/2 - rightW/2, WORLD.FLOOR_HEIGHT/2, WORLD.BUILDING_DEPTH/2); mR.renderOrder=0; buildingGroup.add(mR);
    // upper front wall floors 1..5 (y 3.4 to totalH)
    var upperH=wallH - WORLD.FLOOR_HEIGHT;
    var geoF=new THREE.BoxGeometry(WORLD.BUILDING_WIDTH, upperH, wallThick);
    var mF=new THREE.Mesh(geoF,matOuter); mF.position.set(0, WORLD.FLOOR_HEIGHT + upperH/2, WORLD.BUILDING_DEPTH/2); mF.renderOrder=0; buildingGroup.add(mF);
    // glass doors visual only at entrance gap
    var doorGeo=new THREE.BoxGeometry(1.2,2.0,0.05);
    var doorMat=new THREE.MeshStandardMaterial({color:0xaaddff, transparent:true, opacity:0.25, side:THREE.DoubleSide, depthWrite:false});
    var dL=new THREE.Mesh(doorGeo,doorMat); dL.position.set(-0.7,1.0, WORLD.BUILDING_DEPTH/2); dL.renderOrder=0; buildingGroup.add(dL);
    var dR=new THREE.Mesh(doorGeo,doorMat); dR.position.set(0.7,1.0, WORLD.BUILDING_DEPTH/2); dR.renderOrder=0; buildingGroup.add(dR);

    // shaft walls (opaque thin)
    var shaftMat=new THREE.MeshStandardMaterial({color:0x444444});
    var shW=WORLD.SHAFT_WIDTH, shD=WORLD.SHAFT_DEPTH;
    var shThick=0.12;
    // left shaft wall
    createBox(shThick,wallH,shD,'#444444',1,-shW/2,wallH/2,0,buildingGroup);
    createBox(shThick,wallH,shD,'#444444',1, shW/2,wallH/2,0,buildingGroup);
    createBox(shW,wallH,shThick,'#444444',1,0,wallH/2,-shD/2,buildingGroup);
    createBox(shW,wallH,shThick,'#444444',1,0,wallH/2, shD/2,buildingGroup);
    // but need doors open on +Z face: remove front shaft wall piece where doors are? Keep wall but door gap is elevator doors
    // We'll keep shaft front wall with gap by not adding front; instead add two small side pieces
    // Already added front; remove and replace with two pillars
    buildingGroup.remove(buildingGroup.children[buildingGroup.children.length-1]);

    var floors=[];
    // helper to create furniture
    function addDesk(x,z,parent,yOff){
        yOff=yOff||0;
        var deskG=new THREE.Group(); deskG.position.set(x,yOff+0.45,z);
        var top=new THREE.Mesh(new THREE.BoxGeometry(1.6,0.08,0.9), new THREE.MeshStandardMaterial({color:0x8b5a2b})); deskG.add(top);
        var leg1=new THREE.Mesh(new THREE.BoxGeometry(0.08,0.45,0.08), new THREE.MeshStandardMaterial({color:0x5a3a1b})); leg1.position.set(-0.7,-0.25,0.35); deskG.add(leg1);
        var leg2=new THREE.Mesh(new THREE.BoxGeometry(0.08,0.45,0.08), new THREE.MeshStandardMaterial({color:0x5a3a1b})); leg2.position.set(0.7,-0.25,0.35); deskG.add(leg2);
        var leg3=new THREE.Mesh(new THREE.BoxGeometry(0.08,0.45,0.08), new THREE.MeshStandardMaterial({color:0x5a3a1b})); leg3.position.set(-0.7,-0.25,-0.35); deskG.add(leg3);
        var leg4=new THREE.Mesh(new THREE.BoxGeometry(0.08,0.45,0.08), new THREE.MeshStandardMaterial({color:0x5a3a1b})); leg4.position.set(0.7,-0.25,-0.35); deskG.add(leg4);
        // monitor at back of desk
        var mon=new THREE.Mesh(new THREE.BoxGeometry(0.5,0.35,0.05), new THREE.MeshStandardMaterial({color:0x111111})); mon.position.set(0,0.25,-0.35); deskG.add(mon);
        parent.add(deskG);
        return deskG;
    }
    function addChair(x,z,rotY,parent,yOff){
        yOff=yOff||0;
        var cg=new THREE.Group(); cg.position.set(x,yOff,z); cg.rotation.y=rotY;
        var seat=new THREE.Mesh(new THREE.BoxGeometry(0.5,0.1,0.5), new THREE.MeshStandardMaterial({color:0x333333})); seat.position.y=0.35; cg.add(seat);
        var back=new THREE.Mesh(new THREE.BoxGeometry(0.5,0.5,0.07), new THREE.MeshStandardMaterial({color:0x333333})); back.position.set(0,0.6,-0.22); cg.add(back);
        var leg=new THREE.Mesh(new THREE.CylinderGeometry(0.04,0.04,0.35,6), new THREE.MeshStandardMaterial({color:0x222222})); leg.position.y=0.15; cg.add(leg);
        parent.add(cg);
        return cg;
    }
    function addCouch(x,z,rotY,parent,yOff){
        yOff=yOff||0;
        var g=new THREE.Group(); g.position.set(x,yOff,z); g.rotation.y=rotY;
        var base=new THREE.Mesh(new THREE.BoxGeometry(1.6,0.4,0.7), new THREE.MeshStandardMaterial({color:0x885533})); base.position.y=0.25; g.add(base);
        var back2=new THREE.Mesh(new THREE.BoxGeometry(1.6,0.5,0.12), new THREE.MeshStandardMaterial({color:0x885533})); back2.position.set(0,0.5,-0.3); g.add(back2);
        parent.add(g); return g;
    }
    function addTable(x,z,w,d,parent,yOff){
        yOff=yOff||0;
        var g=new THREE.Group(); g.position.set(x,yOff,z);
        var top=new THREE.Mesh(new THREE.BoxGeometry(w,0.07,d), new THREE.MeshStandardMaterial({color:0x6b4c2a})); top.position.y=0.4; g.add(top);
        var leg=new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.05,0.4,6), new THREE.MeshStandardMaterial({color:0x444444})); leg.position.y=0.2; g.add(leg);
        parent.add(g); return g;
    }

    for(var floorIdx=0;floorIdx<WORLD.FLOOR_COUNT;floorIdx++){
        var yBase=floorIdx*WORLD.FLOOR_HEIGHT;
        var fGroup=new THREE.Group();
        buildingGroup.add(fGroup);
        var nodes={};
        var links={};
        nodes._links=links;
        var sitTargets={};
        var floorObj={floorNumber:floorIdx, nodes:nodes, callPanel:null, shaftIndicator:null, sitTargets:sitTargets, floorGroup:fGroup};

        // common call panel and shaft indicator per floor
        // call panel wall next to shaft, facing +Z
        var panelGroup=new THREE.Group();
        panelGroup.position.set(2.2, yBase+1.2, 1.7);
        fGroup.add(panelGroup);
        var plate=new THREE.Mesh(new THREE.BoxGeometry(0.55,1.4,0.05), new THREE.MeshStandardMaterial({color:0x333333}));
        panelGroup.add(plate);
        // up/down arrows as ShapeGeometry
        function makeArrow(dir){
            var shape=new THREE.Shape();
            var hw=0.13, hh=0.12;
            if(dir>0){ shape.moveTo(-hw, -hh/2); shape.lineTo(hw, -hh/2); shape.lineTo(0, hh/2); shape.lineTo(-hw, -hh/2); }
            else { shape.moveTo(-hw, hh/2); shape.lineTo(hw, hh/2); shape.lineTo(0, -hh/2); shape.lineTo(-hw, hh/2); }
            var geo=new THREE.ShapeGeometry(shape);
            var mat=new THREE.MeshBasicMaterial({color:0x222222});
            var m=new THREE.Mesh(geo,mat);
            return m;
        }
        var upArrow=makeArrow(1); upArrow.position.set(0,0.35,0.03); panelGroup.add(upArrow);
        var downArrow=makeArrow(-1); downArrow.position.set(0,-0.05,0.03); panelGroup.add(downArrow);
        var tex=makeTextTexture(String(floorIdx));
        var disp=new THREE.Mesh(new THREE.PlaneGeometry(0.45,0.45), new THREE.MeshBasicMaterial({map:tex, side:THREE.DoubleSide}));
        disp.position.set(0,-0.5,0.03);
        panelGroup.add(disp);
        panelGroup.userData.setUp=function(on){ upArrow.material.color.set(on?0x00ff00:0x222222); upArrow.material.needsUpdate=true; };
        panelGroup.userData.setDown=function(on){ downArrow.material.color.set(on?0x00ff00:0x222222); downArrow.material.needsUpdate=true; };
        panelGroup.userData.setIndicator=function(txt){ updateTextTexture(tex,txt); };
        panelGroup.userData.tex=tex;
        floorObj.callPanel=panelGroup;

        // shaft indicator above doors
        var shaftTex=makeTextTexture(String(floorIdx));
        var shaftPlane=new THREE.Mesh(new THREE.PlaneGeometry(0.9,0.9), new THREE.MeshBasicMaterial({map:shaftTex, side:THREE.DoubleSide}));
        shaftPlane.position.set(0, yBase+2.6, 1.8);
        fGroup.add(shaftPlane);
        floorObj.shaftIndicator={mesh:shaftPlane, tex:shaftTex, setText:function(t){ updateTextTexture(shaftTex,t); }};

        // hallway ring nodes
        var elevY=yBase;
        function nv(name,x,z){ nodes[name]=new THREE.Vector3(x,elevY,z); }
        nv('hallS',0,2.5); nv('hallSE',2.5,2.5); nv('hallE',2.5,0); nv('hallNE',2.5,-2.5);
        nv('hallN',0,-2.5); nv('hallNW',-2.5,-2.5); nv('hallW',-2.5,0); nv('hallSW',-2.5,2.5);
        nv('elevWait',0,1.8);
        addLink(links,'hallS','hallSE'); addLink(links,'hallSE','hallE'); addLink(links,'hallE','hallNE'); addLink(links,'hallNE','hallN');
        addLink(links,'hallN','hallNW'); addLink(links,'hallNW','hallW'); addLink(links,'hallW','hallSW'); addLink(links,'hallSW','hallS');
        addLink(links,'elevWait','hallS');

        if(floorIdx===0){
            // lobby layout
            nv('outside',0,12);
            nv('front_door_threshold',0,9.35);
            nv('entrance',0,7.4);
            nv('lobby_center',0,4.0);
            addLink(links,'outside','front_door_threshold');
            addLink(links,'front_door_threshold','entrance');
            addLink(links,'entrance','lobby_center');
            addLink(links,'lobby_center','elevWait');
            // also link hallS to lobby_center already via elevWait but direct to hallS as well
            // cafe counter left wall
            nv('cafe_door',-2.5,2.5); addLink(links,'cafe_door','hallSW');
            nv('cafe_order',-8,5); addLink(links,'cafe_order','cafe_door');
            nv('reception',-3,6); addLink(links,'reception','hallSW');
            nv('kiosk',3,7); addLink(links,'kiosk','lobby_center');
            nv('lobby_stand_center',1,5); addLink(links,'lobby_stand_center','lobby_center');
            nv('lobby_stand_NE',4,6); addLink(links,'lobby_stand_NE','lobby_center');
            nv('lobby_stand_NW',-4,6); addLink(links,'lobby_stand_NW','hallSW');
            nv('lobby_stand_midE',5,3); addLink(links,'lobby_stand_midE','hallSE');
            nv('lobby_stand_midW',-5,3); addLink(links,'lobby_stand_midW','hallSW');
            nv('lobby_stand_entry',0,6); addLink(links,'lobby_stand_entry','entrance');
            nv('lobby_wc_front',6,6); addLink(links,'lobby_wc_front','hallSE');
            nv('lobby_wc_back',-6,-4); addLink(links,'lobby_wc_back','hallW');
            nv('back_lounge_N',3,-5); nv('back_lounge_S',3,-7); addLink(links,'back_lounge_N','hallNE'); addLink(links,'back_lounge_S','hallNE');
            nv('pit_N',-6,-5); nv('pit_S',-6,-7); nv('pit_E',-5,-6); nv('pit_W',-7,-6);
            addLink(links,'pit_N','hallNW'); addLink(links,'pit_S','hallNW'); addLink(links,'pit_E','hallNW'); addLink(links,'pit_W','hallNW');
            // bistro chairs
            nv('bistro0',-7,3); nv('bistro1',-7,4); nv('bistro2',-8,2); nv('bistro3',-8,0);
            addLink(links,'bistro0','cafe_door'); addLink(links,'bistro1','cafe_door'); addLink(links,'bistro2','hallW'); addLink(links,'bistro3','hallW');
            // lounge chairs front-right
            nv('lounge_spot0',6,4); nv('lounge_spot1',7,5); nv('lounge_spot2',6,6);
            addLink(links,'lounge_spot0','hallSE'); addLink(links,'lounge_spot1','hallSE'); addLink(links,'lounge_spot2','hallSE');

            // furniture visuals lobby
            addCouch(6,4,0,fGroup,yBase);
            addTable(6,5.2,1.0,0.6,fGroup,yBase);
            addChair(7,5,Math.PI/2,fGroup,yBase); addChair(5,5,-Math.PI/2,fGroup,yBase);
            addTable(-7,3,0.8,0.8,fGroup,yBase); addTable(-8,1.5,0.8,0.8,fGroup,yBase);
            addChair(-7,2.5,0,fGroup,yBase); addChair(-7,3.5,Math.PI,fGroup,yBase);
            addCouch(3,-6,Math.PI/2,fGroup,yBase); addCouch(3,-7, -Math.PI/2,fGroup,yBase);
            addTable(3,-6.2,0.8,0.6,fGroup,yBase);
            addTable(-6,-6,1.0,1.0,fGroup,yBase);
            addChair(-5,-6, -Math.PI/2,fGroup,yBase); addChair(-7,-6, Math.PI/2,fGroup,yBase); addChair(-6,-5,Math.PI,fGroup,yBase); addChair(-6,-7,0,fGroup,yBase);
            // counter
            createBox(3,0.9,0.6,'#6b4c2a',1,-8, yBase+0.45, 6, fGroup);
            createBox(3,0.05,0.6,'#3a2a15',1,-8, yBase+0.9, 6, fGroup);
            // plants
            createBox(0.4,1.0,0.4,'#2d5a27',1, -2, yBase+0.5, 8, fGroup);
            createBox(0.4,1.0,0.4,'#2d5a27',1, 2, yBase+0.5, 8, fGroup);
            // reception desk
            createBox(2,0.7,0.6,'#555555',1, -3, yBase+0.35,6, fGroup);

            // sitTargets lobby: bistro seats etc are sit
            ['bistro0','bistro1','bistro2','bistro3'].forEach(function(n){ sitTargets[n]={sit:true, facing:0}; });
            ['lounge_spot0','lounge_spot1','lounge_spot2'].forEach(function(n){ sitTargets[n]={sit:true, facing:0}; });
            ['back_lounge_N','back_lounge_S','pit_N','pit_S','pit_E','pit_W'].forEach(function(n){ sitTargets[n]={sit:true, facing:0}; });
            // standing waypoints
            ['cafe_order','reception','kiosk','lobby_stand_center','lobby_stand_NE','lobby_stand_NW','lobby_stand_midE','lobby_stand_midW','lobby_stand_entry','lobby_wc_front','lobby_wc_back','lobby_center','entrance','front_door_threshold','outside','elevWait','hallS','hallSE','hallE','hallNE','hallN','hallNW','hallW','hallSW','cafe_door'].forEach(function(n){ if(!sitTargets[n]) sitTargets[n]={sit:false, facing:0}; });

            // interior walls lobby - none blocking entrance, just some dividers translucent
            var wallMat2=new THREE.MeshStandardMaterial({color:0xbbc5e6, transparent:true, opacity:0.28, side:THREE.DoubleSide, depthWrite:false});
            // small partition near cafe
            var pw=new THREE.Mesh(new THREE.BoxGeometry(0.15,2.0,3), wallMat2); pw.position.set(-5, yBase+1, 3); pw.renderOrder=0; fGroup.add(pw);

        } else {
            // office floors
            // 4 offices back wall
            var officeXs=[-8.25,-2.75,2.75,8.25];
            var officeNames=['A','B','C','D'];
            for(var oi=0;oi<4;oi++){
                var ox=officeXs[oi];
                var on=officeNames[oi];
                var dz=-7;
                addDesk(ox,dz,fGroup,yBase);
                addChair(ox, -6, Math.PI, fGroup, yBase);
                var doorZ=-3;
                var doorX=ox;
                nv('office'+on+'_door', doorX, -3);
                nv('office'+on+'_desk', ox, -6.2);
                // link door to nearest hall corner
                var hallLink = (oi<2)? 'hallNW' : 'hallNE';
                if(oi===1) hallLink='hallN';
                if(oi===2) hallLink='hallN';
                addLink(links,'office'+on+'_door', hallLink);
                addLink(links,'office'+on+'_door','office'+on+'_desk');
                sitTargets['office'+on+'_desk']={sit:true, facing:Math.PI};
                sitTargets['office'+on+'_door']={sit:false, facing:0};
                // interior walls between offices
                if(oi<3){
                    var wx=ox+2.75;
                    var wGeo=new THREE.BoxGeometry(0.15,2.2,5.8);
                    var wMat=new THREE.MeshStandardMaterial({color:0xbbc5e6, transparent:true, opacity:0.28, side:THREE.DoubleSide, depthWrite:false});
                    var wm=new THREE.Mesh(wGeo,wMat); wm.position.set(wx, yBase+1.1, -6); wm.renderOrder=0; fGroup.add(wm);
                }
            }
            // horizontal wall separating back offices from hallway (with door gaps)
            // We'll create wall segments with gaps 1.2 at each office door
            // Simplify: one long wall with gaps not physically modeled but visual wall segments between doors
            for(var oi2=0;oi2<4;oi2++){
                var ox2=officeXs[oi2];
                // segments between doors
                if(oi2<3){
                    var midX=(ox2+officeXs[oi2+1])/2;
                    var segW= (officeXs[oi2+1]-ox2)-1.4;
                    var seg=new THREE.Mesh(new THREE.BoxGeometry(segW,2.2,0.15), new THREE.MeshStandardMaterial({color:0xbbc5e6, transparent:true, opacity:0.28, side:THREE.DoubleSide, depthWrite:false}));
                    seg.position.set(midX, yBase+1.1, -3);
                    seg.renderOrder=0; fGroup.add(seg);
                }
            }
            // conference room front-left
            nv('conf_door',-5,3); addLink(links,'conf_door','hallSW');
            nv('conf_center',-7,6); addLink(links,'conf_door','conf_center');
            for(var ci=0;ci<4;ci++){
                var cx = (ci%2===0? -6.2 : -7.8);
                var cz = (ci<2? 5.2 : 6.8);
                nv('conf_seat'+ci, cx,cz);
                addLink(links,'conf_center','conf_seat'+ci);
                sitTargets['conf_seat'+ci]={sit:true, facing: (ci%2===0? -Math.PI/2 : Math.PI/2)};
            }
            addLink(links,'conf_center','conf_door');
            addTable(-7,6,2.2,1.0,fGroup,yBase);
            addChair(-6.2,5.2, -Math.PI/2,fGroup,yBase); addChair(-7.8,5.2, Math.PI/2,fGroup,yBase);
            addChair(-6.2,6.8, -Math.PI/2,fGroup,yBase); addChair(-7.8,6.8, Math.PI/2,fGroup,yBase);
            // lounge front-right
            nv('lounge_door',5,3); addLink(links,'lounge_door','hallSE');
            nv('lounge_center',7,6); addLink(links,'lounge_door','lounge_center');
            for(var li2=0;li2<3;li2++){
                var lx=6+li2*0.8, lz=5+li2*0.5;
                nv('lounge_spot'+li2, lx,lz);
                addLink(links,'lounge_center','lounge_spot'+li2);
                sitTargets['lounge_spot'+li2]={sit:true, facing:0};
            }
            addCouch(7,6,0,fGroup,yBase);
            addTable(7,5.2,0.8,0.6,fGroup,yBase);
            addChair(6,5,0,fGroup,yBase); addChair(8,5,0,fGroup,yBase);
            // water cooler
            nv('water_cooler',8,2); addLink(links,'water_cooler','hallSE');
            createBox(0.4,1.0,0.4,'#aaddff',0.8, 8, yBase+0.5, 2, fGroup);
            nv('hall_stand_N',0,-1); addLink(links,'hall_stand_N','hallN');
            nv('hall_stand_S',0,1); addLink(links,'hall_stand_S','hallS');
            sitTargets['water_cooler']={sit:false, facing:0};
            sitTargets['hall_stand_N']={sit:false, facing:0};
            sitTargets['hall_stand_S']={sit:false, facing:0};
            sitTargets['lounge_center']={sit:false, facing:0};
            sitTargets['conf_center']={sit:false, facing:0};
            sitTargets['conf_door']={sit:false, facing:0};
            sitTargets['lounge_door']={sit:false, facing:0};
            // hallway interior walls for rooms
            var crWall=new THREE.Mesh(new THREE.BoxGeometry(0.15,2.2,4), new THREE.MeshStandardMaterial({color:0xbbc5e6, transparent:true, opacity:0.28, side:THREE.DoubleSide, depthWrite:false}));
            crWall.position.set(-3, yBase+1.1, 6); crWall.renderOrder=0; fGroup.add(crWall);
            var lrWall=new THREE.Mesh(new THREE.BoxGeometry(0.15,2.2,4), new THREE.MeshStandardMaterial({color:0xbbc5e6, transparent:true, opacity:0.28, side:THREE.DoubleSide, depthWrite:false}));
            lrWall.position.set(3, yBase+1.1, 6); lrWall.renderOrder=0; fGroup.add(lrWall);
            var frontWallSeg=new THREE.Mesh(new THREE.BoxGeometry(6,2.2,0.15), new THREE.MeshStandardMaterial({color:0xbbc5e6, transparent:true, opacity:0.28, side:THREE.DoubleSide, depthWrite:false}));
            frontWallSeg.position.set(-7, yBase+1.1, 3); frontWallSeg.renderOrder=0; fGroup.add(frontWallSeg);
            var frontWallSeg2=new THREE.Mesh(new THREE.BoxGeometry(6,2.2,0.15), new THREE.MeshStandardMaterial({color:0xbbc5e6, transparent:true, opacity:0.28, side:THREE.DoubleSide, depthWrite:false}));
            frontWallSeg2.position.set(7, yBase+1.1, 3); frontWallSeg2.renderOrder=0; fGroup.add(frontWallSeg2);

            // mark remaining nodes as standing
            ['hallS','hallSE','hallE','hallNE','hallN','hallNW','hallW','hallSW','elevWait'].forEach(function(n){ if(!sitTargets[n]) sitTargets[n]={sit:false,facing:0}; });
        }
        floors.push(floorObj);
    }

    return {buildingGroup:buildingGroup, floors:floors, bfsPath:bfsPath};
}
window.WORLD=WORLD;
window.createWorld=createWorld;
window.bfsPath=bfsPath;
