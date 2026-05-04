(function() {
    const WORLD = {
        FLOOR_HEIGHT: 3.4, FLOOR_COUNT: 6,
        BUILDING_WIDTH: 22, BUILDING_DEPTH: 18,
        SHAFT_WIDTH: 3, SHAFT_DEPTH: 3,
        PERSON_R: 0.4
    };
    window.WORLD = WORLD;

    const wallMat = new THREE.MeshLambertMaterial({ color: 0x9999ff, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide });
    const innerWallMat = new THREE.MeshLambertMaterial({ color: 0xbbc5e6, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide });

    function createTextCanvasTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 256; canvas.height = 256;
        const tex = new THREE.CanvasTexture(canvas);
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.anisotropy = 8;
        tex._lastText = '';
        return tex;
    }

    function updateTextTexture(tex, text) {
        if (tex._lastText === text) return;
        tex._lastText = text;
        const ctx = tex.image.getContext('2d');
        ctx.fillStyle = '#050505';
        ctx.fillRect(0,0,256,256);
        ctx.fillStyle = '#ffbb22';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 180px monospace';
        ctx.shadowColor = '#ffaa00';
        ctx.shadowBlur = 20;
        ctx.fillText(text, 128, 128);
        tex.needsUpdate = true;
    }

    function createCallPanel() {
        const group = new THREE.Group();
        const plate = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.4, 0.05), new THREE.MeshLambertMaterial({ color: 0x333333 }));
        group.add(plate);

        const arrowGeo = new THREE.ShapeGeometry((()=>{
            const s = new THREE.Shape(); s.moveTo(-0.13,-0.08); s.lineTo(0,0.12); s.lineTo(0.13,-0.08); s.closePath(); return s;
        })());
        const dimMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
        const glowMat = new THREE.MeshBasicMaterial({ color: 0x00ff44 });

        const upMesh = new THREE.Mesh(arrowGeo, dimMat);
        upMesh.position.set(0, 0.3, 0.03);
        group.add(upMesh);

        const downMesh = new THREE.Mesh(arrowGeo.clone(), dimMat);
        downMesh.rotation.z = Math.PI;
        downMesh.position.set(0, -0.3, 0.03);
        group.add(downMesh);

        const tex = createTextCanvasTexture();
        const disp = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.45), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
        disp.position.set(0, 0, 0.04);
        group.add(disp);

        group.userData = {
            setUp(on) { upMesh.material = on ? glowMat : dimMat; },
            setDown(on) { downMesh.material = on ? glowMat : dimMat; },
            setIndicator(text) { updateTextTexture(tex, text); }
        };
        return group;
    }

    function createShaftIndicator(text) {
        const tex = createTextCanvasTexture();
        updateTextTexture(tex, text || '0');
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
        mesh.userData = { setText(txt) { updateTextTexture(tex, txt); } };
        return mesh;
    }

    function createInCarIndicator(text) {
        const tex = createTextCanvasTexture();
        updateTextTexture(tex, text || '0');
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
        mesh.userData = { setText(txt) { updateTextTexture(tex, txt); } };
        return mesh;
    }
    window.createInCarIndicator = createInCarIndicator;

    function bfsPath(nodes, fromName, toName) {
        if (!nodes[fromName] || !nodes[toName]) return [];
        const queue = [[fromName]];
        const visited = new Set([fromName]);
        while (queue.length) {
            const path = queue.shift();
            const last = path[path.length - 1];
            if (last === toName) return path.map(n => nodes[n].pos.clone());
            for (const nxt of (nodes[last].neighbors || [])) {
                if (!visited.has(nxt)) { visited.add(nxt); queue.push([...path, nxt]); }
            }
        }
        return [];
    }

    function addNode(nodes, n, x, z, neighbors) {
        nodes[n] = { name: n, pos: new THREE.Vector3(x, 0, z), neighbors: neighbors || [] };
    }

    function buildFloorNodes(floorNumber, fh) {
        const nodes = {};
        const y = floorNumber * fh;
        function setY(n) { nodes[n].pos.y = y; }
        addNode(nodes, 'hallS', 0, 2.5);
        addNode(nodes, 'hallSE', 2.5, 2.5);
        addNode(nodes, 'hallE', 2.5, 0);
        addNode(nodes, 'hallNE', 2.5, -2.5);
        addNode(nodes, 'hallN', 0, -2.5);
        addNode(nodes, 'hallNW', -2.5, -2.5);
        addNode(nodes, 'hallW', -2.5, 0);
        addNode(nodes, 'hallSW', -2.5, 2.5);
        addNode(nodes, 'elevWait', 0, 1.6);
        Object.keys(nodes).forEach(k => setY(k));

        const ring = ['hallS','hallSE','hallE','hallNE','hallN','hallNW','hallW','hallSW'];
        for (let i=0;i<ring.length;i++) {
            const a=ring[i], b=ring[(i+1)%ring.length];
            nodes[a].neighbors.push(b);
            nodes[b].neighbors.push(a);
        }
        nodes['hallS'].neighbors.push('elevWait');
        nodes['elevWait'].neighbors.push('hallS');

        if (floorNumber === 0) {
            addNode(nodes, 'outside', 0, 12, ['entrance']);
            addNode(nodes, 'entrance', 0, 8.5, ['outside','elevWait']);
            addNode(nodes, 'cafe_door', -7, 2.5, ['hallSW']);
            addNode(nodes, 'cafe_counter', -9, 2, ['cafe_door','cafe_order']);
            addNode(nodes, 'cafe_order', -8, 2.8, ['cafe_door','cafe_counter']);
            addNode(nodes, 'reception', -2, 6, ['hallSE']);
            addNode(nodes, 'kiosk', 3, 7, ['hallE']);

            addNode(nodes, 'bistro0', -8, 5, ['cafe_door']); addNode(nodes, 'bistro0_chair0', -8.6, 5, ['bistro0']); addNode(nodes, 'bistro0_chair1', -7.4, 5, ['bistro0']);
            addNode(nodes, 'bistro1', -5, 5, ['cafe_door']); addNode(nodes, 'bistro1_chair0', -5.6, 5, ['bistro1']); addNode(nodes, 'bistro1_chair1', -4.4, 5, ['bistro1']);

            addNode(nodes, 'front_lounge_center', 6, 5, ['hallSE']); addNode(nodes, 'front_lounge_chair0', 5.2, 5, ['front_lounge_center']); addNode(nodes, 'front_lounge_chair1', 6.8, 5, ['front_lounge_center']);

            addNode(nodes, 'back_lounge_N', -4, -5, ['hallN']); addNode(nodes, 'back_lounge_S', -4, -7, ['hallN']);

            addNode(nodes, 'pit_center', -7, -5, ['hallW']); addNode(nodes, 'pit_N', -7, -4.2, ['pit_center']); addNode(nodes, 'pit_S', -7, -5.8, ['pit_center']); addNode(nodes, 'pit_E', -6.2, -5, ['pit_center']); addNode(nodes, 'pit_W', -7.8, -5, ['pit_center']);

            addNode(nodes, 'lobby_wc_front', 4, 2, ['hallE','reception']); addNode(nodes, 'lobby_wc_back', -4, -2, ['hallW']);

            addNode(nodes, 'lobby_stand_center', 0, 5, ['hallS']);
            addNode(nodes, 'lobby_stand_NE', 6, 7, ['hallSE']);
            addNode(nodes, 'lobby_stand_NW', -6, 7, ['hallSW']);
            addNode(nodes, 'lobby_stand_midE', 4, 3, ['hallE']);
            addNode(nodes, 'lobby_stand_midW', -4, 3, ['hallW']);
            addNode(nodes, 'lobby_stand_entry', 0, 7, ['entrance']);

            // Wire back-links
            for (const n in nodes) {
                nodes[n].neighbors.forEach(nb => {
                    if (nodes[nb] && !nodes[nb].neighbors.includes(n)) nodes[nb].neighbors.push(n);
                });
            }
        } else {
            const officeNames = ['officeA','officeB','officeC','officeD'];
            const officeX = [-7, -3, 3, 7];
            officeNames.forEach((name, i) => {
                const ox = officeX[i];
                addNode(nodes, `${name}_door`, ox, -2.5);
                addNode(nodes, `${name}_desk`, ox, -7);
                addNode(nodes, `${name}_chair`, ox, -5.5);
                const corner = ox < 0 ? 'hallNW' : 'hallNE';
                nodes[`${name}_door`].neighbors.push(corner, `${name}_desk`, `${name}_chair`);
                nodes[`${name}_desk`].neighbors.push(`${name}_door`, `${name}_chair`);
                nodes[`${name}_chair`].neighbors.push(`${name}_door`, `${name}_desk`);
                if (!nodes[corner].neighbors.includes(`${name}_door`)) nodes[corner].neighbors.push(`${name}_door`);
            });

            addNode(nodes, 'conf_door', -7, 2.5, ['hallSW']);
            addNode(nodes, 'conf_center', -7, 6, ['conf_door']);
            ['conf_seat0','conf_seat1','conf_seat2','conf_seat3'].forEach((n, i) => {
                const cx = -7 + (i % 2 === 0 ? -1.2 : 1.2);
                const cz = 6 + (i < 2 ? -0.8 : 0.8);
                addNode(nodes, n, cx, cz, ['conf_center']);
                nodes['conf_center'].neighbors.push(n);
            });

            addNode(nodes, 'lounge_door', 7, 2.5, ['hallSE']);
            addNode(nodes, 'lounge_center', 7, 6);
            addNode(nodes, 'lounge_spot0', 6, 5, ['lounge_center']);
            addNode(nodes, 'lounge_spot1', 8, 5, ['lounge_center']);
            addNode(nodes, 'lounge_spot2', 7, 7, ['lounge_center']);
            nodes['lounge_center'].neighbors.push('lounge_door','lounge_spot0','lounge_spot1','lounge_spot2');
            nodes['lounge_door'].neighbors.push('lounge_center');

            addNode(nodes, 'water_cooler', 4, 2, ['hallE']);
            addNode(nodes, 'hall_stand_N', -1, -2.5, ['hallN']);
            addNode(nodes, 'hall_stand_S', 1, -2.5, ['hallS']);

            for (const n in nodes) {
                nodes[n].neighbors.forEach(nb => {
                    if (nodes[nb] && !nodes[nb].neighbors.includes(n)) nodes[nb].neighbors.push(n);
                });
            }
        }
        return nodes;
    }

    function buildSitTargets(floorNumber) {
        const targets = {};
        const y = floorNumber * WORLD.FLOOR_HEIGHT;
        function s(name, sit, facing) { targets[name] = { sit, facing, y }; }
        const officeNames = ['officeA','officeB','officeC','officeD'];
        if (floorNumber === 0) {
            s('bistro0_chair0', true, 0); s('bistro0_chair1', true, Math.PI);
            s('bistro1_chair0', true, 0); s('bistro1_chair1', true, Math.PI);
            s('front_lounge_chair0', true, 0); s('front_lounge_chair1', true, 0);
            s('back_lounge_N', true, 0); s('back_lounge_S', true, Math.PI);
            s('pit_N', true, Math.PI/2); s('pit_S', true, -Math.PI/2);
            s('pit_E', true, Math.PI); s('pit_W', true, 0);
            s('reception', false, Math.PI/2);
            s('kiosk', false, 0);
            s('cafe_order', false, Math.PI);
            s('lobby_wc_front', false, 0); s('lobby_wc_back', false, Math.PI);
            s('lobby_stand_center', false, 0); s('lobby_stand_NE', false, 0);
            s('lobby_stand_NW', false, 0); s('lobby_stand_midE', false, 0);
            s('lobby_stand_midW', false, 0); s('lobby_stand_entry', false, Math.PI);
            s('entrance', false, Math.PI);
            s('outside', false, Math.PI);
        } else {
            officeNames.forEach(name => {
                s(`${name}_chair`, true, Math.PI);
                s(`${name}_desk`, false, 0);
            });
            for (let i=0;i<4;i++) s(`conf_seat${i}`, true, i%2===0 ? Math.PI/2 : -Math.PI/2);
            s('lounge_spot0', true, 0); s('lounge_spot1', true, 0); s('lounge_spot2', true, 0);
            s('water_cooler', false, Math.PI);
            s('hall_stand_N', false, 0); s('hall_stand_S', false, 0);
        }
        return targets;
    }

    function createWorld(scene) {
        const bg = new THREE.Group();
        bg.renderOrder = 0;
        scene.add(bg);

        const bw = WORLD.BUILDING_WIDTH, bd = WORLD.BUILDING_DEPTH;
        const fh = WORLD.FLOOR_HEIGHT, fc = WORLD.FLOOR_COUNT;
        const sw = WORLD.SHAFT_WIDTH, sd = WORLD.SHAFT_DEPTH;
        const halfW = bw/2, halfD = bd/2;

        // Ground slab
        bg.add((()=>{const m=new THREE.Mesh(new THREE.BoxGeometry(bw,0.2,bd), new THREE.MeshLambertMaterial({color:0x555555})); m.position.y=-0.1; return m;})());
        // Sidewalk
        bg.add((()=>{const m=new THREE.Mesh(new THREE.BoxGeometry(8,0.1,6), new THREE.MeshLambertMaterial({color:0x999999})); m.position.set(0,-0.05,12); return m;})());
        // Roof
        bg.add((()=>{const m=new THREE.Mesh(new THREE.BoxGeometry(bw,0.2,bd), new THREE.MeshLambertMaterial({color:0x666666})); m.position.y=fc*fh+0.1; return m;})());

        // Floor slabs
        for (let f=0; f<fc; f++) {
            const y = f*fh;
            const halfBw2 = (bw-sw)/2;
            const halfBd2 = (bd-sd)/2;
            const sm = new THREE.MeshLambertMaterial({ color: 0x888888, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide });
            bg.add((()=>{const m=new THREE.Mesh(new THREE.BoxGeometry(halfBw2,0.15,bd),sm); m.position.set(-(sw/2+halfBw2/2),y,0); return m;})());
            bg.add((()=>{const m=new THREE.Mesh(new THREE.BoxGeometry(halfBw2,0.15,bd),sm); m.position.set((sw/2+halfBw2/2),y,0); return m;})());
            bg.add((()=>{const m=new THREE.Mesh(new THREE.BoxGeometry(sw,0.15,halfBd2),sm); m.position.set(0,y,(sd/2+halfBd2/2)); return m;})());
            bg.add((()=>{const m=new THREE.Mesh(new THREE.BoxGeometry(sw,0.15,halfBd2),sm); m.position.set(0,y,-(sd/2+halfBd2/2)); return m;})());
        }

        // Outer walls
        bg.add((()=>{const m=new THREE.Mesh(new THREE.BoxGeometry(0.15,fc*fh,bd),wallMat.clone()); m.position.set(-halfW,fc*fh/2,0); return m;})());
        bg.add((()=>{const m=new THREE.Mesh(new THREE.BoxGeometry(0.15,fc*fh,bd),wallMat.clone()); m.position.set(halfW,fc*fh/2,0); return m;})());
        bg.add((()=>{const m=new THREE.Mesh(new THREE.BoxGeometry(bw,fc*fh,0.15),wallMat.clone()); m.position.set(0,fc*fh/2,-halfD); return m;})());

        const frontW = (bw-3)/2;
        bg.add((()=>{const m=new THREE.Mesh(new THREE.BoxGeometry(frontW,fc*fh,0.15),wallMat.clone()); m.position.set(-(3/2+frontW/2),fc*fh/2,halfD); return m;})());
        bg.add((()=>{const m=new THREE.Mesh(new THREE.BoxGeometry(frontW,fc*fh,0.15),wallMat.clone()); m.position.set((3/2+frontW/2),fc*fh/2,halfD); return m;})());
        bg.add((()=>{const m=new THREE.Mesh(new THREE.BoxGeometry(3,(fc-1)*fh,0.15),wallMat.clone()); m.position.set(0,fh+(fc-1)*fh/2,halfD); return m;})());

        // Glass doors
        const doorMat = new THREE.MeshLambertMaterial({ color: 0xaaddff, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide });
        bg.add((()=>{const m=new THREE.Mesh(new THREE.BoxGeometry(1.3,2.2,0.05),doorMat); m.position.set(-0.7,1.1,halfD); return m;})());
        bg.add((()=>{const m=new THREE.Mesh(new THREE.BoxGeometry(1.3,2.2,0.05),doorMat); m.position.set(0.7,1.1,halfD); return m;})());

        // Interior walls for office floors
        for (let f=1; f<fc; f++) {
            const fy = f*fh + fh/2;
            const iwm = innerWallMat.clone();
            const divXs = [-5.5, -1.5, 1.5, 5.5];
            divXs.forEach(x => {
                if (Math.abs(x) < 2.5) return;
                bg.add((()=>{const m=new THREE.Mesh(new THREE.BoxGeometry(0.1,fh,4),iwm.clone()); m.position.set(x,fy,-7); return m;})());
            });
            const segW = 2.6;
            [-8.2, -4.1, 4.1, 8.2].forEach(x => {
                bg.add((()=>{const m=new THREE.Mesh(new THREE.BoxGeometry(segW,fh,0.1),iwm.clone()); m.position.set(x,fy,-5); return m;})());
            });
            bg.add((()=>{const m=new THREE.Mesh(new THREE.BoxGeometry(0.1,fh,4.7),iwm.clone()); m.position.set(-3.8,fy,-0.65); return m;})());
            bg.add((()=>{const m=new THREE.Mesh(new THREE.BoxGeometry(0.1,fh,2.6),iwm.clone()); m.position.set(-3.8,fy,5.2); return m;})());
            bg.add((()=>{const m=new THREE.Mesh(new THREE.BoxGeometry(0.1,fh,4.7),iwm.clone()); m.position.set(3.8,fy,-0.65); return m;})());
            bg.add((()=>{const m=new THREE.Mesh(new THREE.BoxGeometry(0.1,fh,2.6),iwm.clone()); m.position.set(3.8,fy,5.2); return m;})());
        }

        // Furniture helpers
        function addDesk(x,z,fy) {
            const dm = new THREE.MeshLambertMaterial({color:0x8B5A2B});
            bg.add((()=>{const m=new THREE.Mesh(new THREE.BoxGeometry(1.2,0.05,0.6),dm); m.position.set(x,fy+0.75,z); return m;})());
            bg.add((()=>{const m=new THREE.Mesh(new THREE.BoxGeometry(0.4,0.3,0.05),new THREE.MeshLambertMaterial({color:0x111111})); m.position.set(x,fy+0.95,z-0.3); return m;})());
            const lm = new THREE.MeshLambertMaterial({color:0x555555});
            [[-0.5,0.2],[0.5,0.2],[-0.5,-0.2],[0.5,-0.2]].forEach(([ox,oz])=>{
                bg.add((()=>{const m=new THREE.Mesh(new THREE.BoxGeometry(0.08,0.75,0.08),lm); m.position.set(x+ox,fy+0.375,z+oz); return m;})());
            });
        }
        function addChair(x,z,fy,ry) {
            const cm = new THREE.MeshLambertMaterial({color:0x664433});
            const c = new THREE.Mesh(new THREE.BoxGeometry(0.45,0.45,0.45),cm);
            c.position.set(x,fy+0.225,z); c.rotation.y = ry||0; bg.add(c);
        }
        function addCouch(x,z,fy,ry) {
            const c = new THREE.Mesh(new THREE.BoxGeometry(1.6,0.45,0.6), new THREE.MeshLambertMaterial({color:0x336688}));
            c.position.set(x,fy+0.225,z); c.rotation.y = ry||0; bg.add(c);
        }
        function addCoffeeTable(x,z,fy) {
            const t = new THREE.Mesh(new THREE.BoxGeometry(0.7,0.35,0.5), new THREE.MeshLambertMaterial({color:0x553322}));
            t.position.set(x,fy+0.175,z); bg.add(t);
        }
        function addArmchair(x,z,fy,ry) {
            const a = new THREE.Mesh(new THREE.BoxGeometry(0.5,0.4,0.5), new THREE.MeshLambertMaterial({color:0x447755}));
            a.position.set(x,fy+0.2,z); a.rotation.y = ry||0; bg.add(a);
        }
        function addWaterCooler(x,z,fy) {
            const w = new THREE.Mesh(new THREE.CylinderGeometry(0.15,0.2,1.2,8), new THREE.MeshLambertMaterial({color:0xccddff}));
            w.position.set(x,fy+0.6,z); bg.add(w);
        }
        function addPlant(x,z,fy) {
            const p = new THREE.Mesh(new THREE.SphereGeometry(0.4,8,8), new THREE.MeshLambertMaterial({color:0x44aa44}));
            p.position.set(x,fy+0.7,z); bg.add(p);
            const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.3,0.25,0.35,8), new THREE.MeshLambertMaterial({color:0x885533}));
            pot.position.set(x,fy+0.175,z); bg.add(pot);
        }

        const floors = [];
        for (let f=0; f<fc; f++) {
            const fy = f*fh;
            const nodes = buildFloorNodes(f,fh);
            const sitTargets = buildSitTargets(f);
            const callPanel = createCallPanel();
            callPanel.position.set(-1.8, fy+1.8, 1.55);
            callPanel.rotation.y = Math.PI;
            bg.add(callPanel);

            const shaftIndicator = createShaftIndicator(String(f));
            shaftIndicator.position.set(0, fy+2.6, 1.56);
            bg.add(shaftIndicator);

            const desks = [];

            if (f === 0) {
                // Cafe
                const ctop = new THREE.MeshLambertMaterial({color:0x776655});
                const ct = new THREE.MeshLambertMaterial({color:0x333333});
                bg.add((()=>{const m=new THREE.Mesh(new THREE.BoxGeometry(3,0.9,0.6),ctop); m.position.set(-9,fy+0.45,2); return m;})());
                bg.add((()=>{const m=new THREE.Mesh(new THREE.BoxGeometry(3,0.05,0.65),ct); m.position.set(-9,fy+0.9,2); return m;})());
                bg.add((()=>{const m=new THREE.Mesh(new THREE.BoxGeometry(0.3,0.35,0.25),new THREE.MeshLambertMaterial({color:0x222222})); m.position.set(-8,fy+1.075,2); return m;})());
                bg.add((()=>{const m=new THREE.Mesh(new THREE.BoxGeometry(0.6,0.25,0.35),new THREE.MeshLambertMaterial({color:0xffffff,transparent:true,opacity:0.4})); m.position.set(-9.5,fy+1.025,2.1); return m;})());

                for (let t=0; t<2; t++) {
                    const tx = t===0?-8:-5, tz=5;
                    addCoffeeTable(tx,tz,fy); addChair(tx-0.6,tz,fy,0); addChair(tx+0.6,tz,fy,Math.PI);
                }

                addCouch(5,4,fy,0); addCoffeeTable(5,6,fy); addArmchair(3.5,6,fy,0); addArmchair(6.5,6,fy,0);
                addCouch(-4,-5,fy,0); addCouch(-4,-7,fy,Math.PI); addCoffeeTable(-4,-6,fy);
                addCoffeeTable(-7,-5,fy); addArmchair(-7,-4.2,fy,Math.PI); addArmchair(-7,-5.8,fy,0);
                addArmchair(-6.2,-5,fy,-Math.PI/2); addArmchair(-7.8,-5,fy,Math.PI/2);
                addWaterCooler(4,2,fy); addWaterCooler(-4,-2,fy);

                const rd = new THREE.Mesh(new THREE.BoxGeometry(1.5,0.8,0.6), new THREE.MeshLambertMaterial({color:0x665544}));
                rd.position.set(-3,fy+0.4,6); bg.add(rd);
                const ks = new THREE.Mesh(new THREE.BoxGeometry(0.6,1.2,0.3), new THREE.MeshLambertMaterial({color:0x223344}));
                ks.position.set(3,fy+0.6,7); bg.add(ks);

                addPlant(-2,9,fy); addPlant(2,9,fy);
            } else {
                const officeXList = [-7,-3,3,7];
                officeXList.forEach((ox,i)=>{
                    addDesk(ox,-7,fy); addChair(ox,-5.5,fy,Math.PI);
                    desks.push({x:ox,z:-7,floor:f,name:`office${String.fromCharCode(65+i)}_desk`});
                });

                addCoffeeTable(-7,6,fy);
                addChair(-8.2,5.2,fy,Math.PI/2); addChair(-5.8,5.2,fy,-Math.PI/2);
                addChair(-8.2,6.8,fy,Math.PI/2); addChair(-5.8,6.8,fy,-Math.PI/2);
                addCouch(7,5,fy,0); addCoffeeTable(7,7,fy); addArmchair(5.5,7,fy,0); addArmchair(8.5,7,fy,0);
                addWaterCooler(4,2,fy); addPlant(5,9,fy);
            }
            floors.push({ floorNumber:f, nodes, callPanel, shaftIndicator, desks, sitTargets,
                entranceSpot: f===0?nodes['outside']:null,
                cafeSpots: f===0?['cafe_order','bistro0','bistro1']:null,
            });
        }
        window._sitTargets = {};
        floors.forEach(fl=>Object.assign(window._sitTargets, fl.sitTargets));
        return { buildingGroup:bg, floors, bfsPath };
    }

    window.createWorld = createWorld;
})();
