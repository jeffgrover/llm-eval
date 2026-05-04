(function() {
    'use strict';

    const MAX_WORKERS = 20, MAX_VISITORS = 80, MAX_OCCUPANCY = 100, DEFAULT_OCCUPANCY = 45;
    const WORKER = 'WORKER', VISITOR = 'VISITOR';
    const DISABLED = 'DISABLED', AWAY = 'AWAY', GONE = 'GONE';
    const AT_DESK = 'AT_DESK', IN_MEETING = 'IN_MEETING', AT_LUNCH = 'AT_LUNCH';
    const FIRST_NAMES = ['Alex','Avery','Blake','Brook','Cameron','Casey','Dakota','Drew','Emerson','Finley','Gray','Hayden','Jamie','Jesse','Jordan','Kai','Kelly','Logan','Morgan','Pat'];

    function randInt(min, max) { return min + Math.floor(Math.random() * (max - min + 1)); }
    function randFloat(min, max) { return min + Math.random() * (max - min); }
    function randName() { return FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)]; }

    class Clock {
        constructor() { this.simMinute = 7*60+30; this.timeScale = 120; this.dayCount = 0; }
        tick(realDt) {
            this.simMinute += realDt * this.timeScale / 60;
            const daysPassed = Math.floor(this.simMinute / (24*60));
            if (daysPassed > this.dayCount) { this.dayCount = daysPassed; this.simMinute %= 24*60; return true; }
            return false;
        }
        format() {
            const h = Math.floor(this.simMinute / 60) % 12, m = Math.floor(this.simMinute % 60);
            return ` ${h||12}:${m.toString().padStart(2,'0')} ${Math.floor(this.simMinute/60)<12?'AM':'PM'}`;
        }
    }

    function updateLighting(scene, simMinute) {
        const kf = [
            {t:0,a:0.15,h:0.10,s:0.0,sc:0x111122,bg:0x000011},
            {t:360,a:0.45,h:0.32,s:0.0,sc:0x111133,bg:0x000022},
            {t:390,a:0.45,h:0.32,s:0.2,sc:0xff8844,bg:0x224466},
            {t:450,a:0.80,h:0.60,s:1.0,sc:0xffffff,bg:0x66aaff},
            {t:1050,a:0.80,h:0.60,s:1.0,sc:0xffffff,bg:0x66aaff},
            {t:1080,a:0.60,h:0.45,s:0.5,sc:0xffaa66,bg:0x446688},
            {t:1140,a:0.45,h:0.32,s:0.0,sc:0x222244,bg:0x000022},
            {t:1440,a:0.45,h:0.32,s:0.0,sc:0x111133,bg:0x000011}
        ];
        let p=null,n=null;
        for(const k of kf){ if(k.t<=simMinute)p=k; else{n=k;break;} }
        if(!n&&p){n=kf[0];p=kf[kf.length-1];} else if(!p){p=kf[kf.length-1];} else if(!n){n=kf[0];}
        const span = n.t-p.t+(n.t<p.t?1440:0);
        const prog = (simMinute-p.t+(simMinute<p.t?1440:0))/span;
        const amb = p.a+(n.a-p.a)*prog, hemi = p.h+(n.h-p.h)*prog, si = p.s+(n.s-p.s)*prog;
        scene.background = new THREE.Color(prog<0.5?p.bg:n.bg);
        const al=scene.getObjectByName('ambientLight'), sl=scene.getObjectByName('sunLight'), hl=scene.getObjectByName('hemiLight');
        if(al)al.intensity=amb; if(hl)hl.intensity=hemi; if(sl){sl.intensity=si;sl.color.setHex(prog<0.5?p.sc:n.sc);
        const hour=(simMinute/60)%24, sh=hour<12?hour:hour-12, sa=(sh/12)*Math.PI;
        if(sl)sl.position.set(Math.cos(sa)*50,Math.sin(sa)*50,Math.sin(sa*0.5)*30);
    }

    const WALK_TO_WP='WALK_TO_WP', WAIT_AT_PANEL='WAIT_AT_PANEL', ENTER_ELEVATOR='ENTER_ELEVATOR';
    const PRESS_FLOOR='PRESS_FLOOR', WAIT_FOR_FLOOR='WAIT_FOR_FLOOR', EXIT_ELEVATOR='EXIT_ELEVATOR';
    const SIT='SIT', STAND='STAND', RELEASE_SEAT='RELEASE_SEAT', WAIT_SIM='WAIT_SIM';
    const EXIT_BUILDING='EXIT_BUILDING', ENTER_STATE='ENTER_STATE', MARK_LUNCHED='MARK_LUNCHED', PICK_NEXT_ACTIVITY='PICK_NEXT_ACTIVITY';

    function createAgent(role, id) {
        return {
            id:id, role:role, name:randName(),
            homeFloor:role===WORKER?randInt(1,5):null,
            deskId:role===WORKER?['A','B','C','D'][id%4]:null,
            group:createPerson(),
            state:AWAY, plan:[], currentAction:null, currentActionIndex:0,
            arrivalTime:randInt(8*60+15,9*60+30), lunchTime:randInt(11*60+30,13*60+30),
            lunchDuration:randInt(25,60),
            departureTime:Math.random()<0.15?randInt(18*60+30,19*60+45):randInt(16*60+45,18*60+30),
            plannedMeetingTimes:[], hasLunched:false,
            walkPath:[], walkPathIndex:0, walkSpeed:1.3,
            _prevWp:null, _stallT:0, _enterPhase:0, _enterStallT:0, _prevPos:new THREE.Vector3()
        };
    }

    function planArriveToDesk(a) {
        const hf=a.homeFloor;
        return [
            {type:WALK_TO_WP,floor:0,wpName:'entrance'},
            {type:WALK_TO_WP,floor:0,wpName:'elevWait'},
            {type:WAIT_AT_PANEL,floor:0,dir:1,toFloor:hf},
            {type:ENTER_ELEVATOR,toFloor:hf},
            {type:PRESS_FLOOR,floor:hf},
            {type:WAIT_FOR_FLOOR,floor:hf},
            {type:EXIT_ELEVATOR,toFloor:hf},
            {type:WALK_TO_WP,floor:hf,wpName:`office${a.deskId}_desk`},
            {type:WALK_TO_WP,floor:hf,wpName:`office${a.deskId}_chair`},
            {type:SIT,floor:hf,wpName:`office${a.deskId}_chair`},
            {type:ENTER_STATE,state:'AT_DESK'},
            {type:WAIT_SIM,minutes:randInt(15,45)},
            {type:PICK_NEXT_ACTIVITY}
        ];
    }

    function planLeaveBuilding(a) {
        const hf=a.homeFloor;
        return [
            {type:STAND},
            {type:RELEASE_SEAT},
            {type:WALK_TO_WP,floor:hf,wpName:`office${a.deskId}_desk`},
            {type:WALK_TO_WP,floor:hf,wpName:`office${a.deskId}_door`},
            {type:WALK_TO_WP,floor:hf,wpName:'elevWait'},
            {type:WAIT_AT_PANEL,floor:hf,dir:-1,toFloor:0},
            {type:ENTER_ELEVATOR,toFloor:0},
            {type:PRESS_FLOOR,floor:0},
            {type:WAIT_FOR_FLOOR,floor:0},
            {type:EXIT_ELEVATOR,toFloor:0},
            {type:WALK_TO_WP,floor:0,wpName:'entrance'},
            {type:WALK_TO_WP,floor:0,wpName:'outside'},
            {type:EXIT_BUILDING}
        ];
    }

    function planVisitorVisit(a) {
        const actions=[];
        actions.push({type:WALK_TO_WP,floor:0,wpName:'entrance'});
        const r=Math.random();
        if(r<0.10){
            const tn=randInt(0,3), cn=randInt(1,2);
            actions.push({type:WALK_TO_WP,floor:0,wpName:`bistro${tn}_chair${cn}`});
            actions.push({type:SIT,floor:0,wpName:`bistro${tn}_chair${cn}`});
            actions.push({type:WAIT_SIM,minutes:randInt(10,30)});
            actions.push({type:STAND}); actions.push({type:RELEASE_SEAT});
            actions.push({type:WALK_TO_WP,floor:0,wpName:`bistro${tn}_table`});
        } else if(r<0.16){
            actions.push({type:WALK_TO_WP,floor:0,wpName:'cafe_order'});
            actions.push({type:WAIT_SIM,minutes:randInt(2,8)});
        } else if(r<0.30){
            actions.push({type:WALK_TO_WP,floor:0,wpName:`front_lounge_spot${randInt(1,3)}`});
            actions.push({type:WAIT_SIM,minutes:randInt(8,20)});
        } else if(r<0.42){
            if(Math.random()<0.5){
                actions.push({type:WALK_TO_WP,floor:0,wpName:`back_lounge_${randInt(0,1)?'N':'S'}`});
            } else {
                actions.push({type:WALK_TO_WP,floor:0,wpName:`pit_${['N','S','E','W'][randInt(0,3)]}`});
                actions.push({type:SIT,floor:0,wpName:`pit_${['N','S','E','W'][randInt(0,3)]}`});
                actions.push({type:WAIT_SIM,minutes:randInt(10,25)});
                actions.push({type:STAND}); actions.push({type:RELEASE_SEAT});
            }
            actions.push({type:WAIT_SIM,minutes:randInt(5,15)});
        } else if(r<0.52){
            actions.push({type:WALK_TO_WP,floor:0,wpName:['reception','kiosk','lobby_wc_front','lobby_wc_back'][randInt(0,3)]});
            actions.push({type:WAIT_SIM,minutes:randInt(2,10)});
        } else if(r<0.65){
            actions.push({type:WALK_TO_WP,floor:0,wpName:`lobby_stand_${['center','NE','NW','midE','midW','entry'][randInt(0,5)]}`});
            actions.push({type:WAIT_SIM,minutes:randInt(5,15)});
        } else if(r<0.80){
            const tf=randInt(1,5);
            actions.push({type:WALK_TO_WP,floor:0,wpName:'elevWait'});
            actions.push({type:WAIT_AT_PANEL,floor:0,dir:1,toFloor:tf});
            actions.push({type:ENTER_ELEVATOR,toFloor:tf});
            actions.push({type:PRESS_FLOOR,floor:tf});
            actions.push({type:WAIT_FOR_FLOOR,floor:tf});
            actions.push({type:EXIT_ELEVATOR,toFloor:tf});
            actions.push({type:WALK_TO_WP,floor:tf,wpName:'lounge_door'});
            actions.push({type:WALK_TO_WP,floor:tf,wpName:`lounge_spot${randInt(0,2)}`});
            actions.push({type:WAIT_SIM,minutes:randInt(8,20)});
            actions.push({type:WALK_TO_WP,floor:tf,wpName:'lounge_door'});
            actions.push({type:WALK_TO_WP,floor:tf,wpName:'elevWait'});
            actions.push({type:WAIT_AT_PANEL,floor:tf,dir:-1,toFloor:0});
            actions.push({type:ENTER_ELEVATOR,toFloor:0});
            actions.push({type:PRESS_FLOOR,floor:0});
            actions.push({type:WAIT_FOR_FLOOR,floor:0});
            actions.push({type:EXIT_ELEVATOR,toFloor:0});
        } else {
            const tf=randInt(1,5);
            actions.push({type:WALK_TO_WP,floor:0,wpName:'elevWait'});
            actions.push({type:WAIT_AT_PANEL,floor:0,dir:1,toFloor:tf});
            actions.push({type:ENTER_ELEVATOR,toFloor:tf});
            actions.push({type:PRESS_FLOOR,floor:tf});
            actions.push({type:WAIT_FOR_FLOOR,floor:tf});
            actions.push({type:EXIT_ELEVATOR,toFloor:tf});
            actions.push({type:WALK_TO_WP,floor:tf,wpName:'conf_door'});
            actions.push({type:WALK_TO_WP,floor:tf,wpName:'conf_center'});
            const sn=randInt(0,3);
            actions.push({type:WALK_TO_WP,floor:tf,wpName:`conf_seat${sn}`});
            actions.push({type:SIT,floor:tf,wpName:`conf_seat${sn}`});
            actions.push({type:WAIT_SIM,minutes:randInt(22,45)});
            actions.push({type:STAND}); actions.push({type:RELEASE_SEAT});
            actions.push({type:WALK_TO_WP,floor:tf,wpName:'conf_door'});
            actions.push({type:WALK_TO_WP,floor:tf,wpName:'elevWait'});
            actions.push({type:WAIT_AT_PANEL,floor:tf,dir:-1,toFloor:0});
            actions.push({type:ENTER_ELEVATOR,toFloor:0});
            actions.push({type:PRESS_FLOOR,floor:0});
            actions.push({type:WAIT_FOR_FLOOR,floor:0});
            actions.push({type:EXIT_ELEVATOR,toFloor:0});
        }
        actions.push({type:WALK_TO_WP,floor:0,wpName:'entrance'});
        actions.push({type:WALK_TO_WP,floor:0,wpName:'outside'});
        actions.push({type:EXIT_BUILDING});
        return actions;
    }

    function planGoToLunch(a) {
        const hf=a.homeFloor, bn=randInt(0,3);
        return [
            {type:STAND},{type:WALK_TO_WP,floor:hf,wpName:`office${a.deskId}_desk`},
            {type:WALK_TO_WP,floor:hf,wpName:`office${a.deskId}_door`},
            {type:WALK_TO_WP,floor:hf,wpName:'elevWait'},
            {type:WAIT_AT_PANEL,floor:hf,dir:-1,toFloor:0},
            {type:ENTER_ELEVATOR,toFloor:0},{type:PRESS_FLOOR,floor:0},
            {type:WAIT_FOR_FLOOR,floor:0},{type:EXIT_ELEVATOR,toFloor:0},
            {type:WALK_TO_WP,floor:0,wpName:`bistro${bn}_chair1`},
            {type:SIT,floor:0,wpName:`bistro${bn}_chair1`},{type:ENTER_STATE,state:'AT_LUNCH'},
            {type:WAIT_SIM,minutes:a.lunchDuration},
            {type:MARK_LUNCHED},{type:STAND},{type:RELEASE_SEAT},
            {type:WALK_TO_WP,floor:0,wpName:`bistro${bn}_table`},
            {type:WALK_TO_WP,floor:0,wpName:'elevWait'},
            {type:WAIT_AT_PANEL,floor:0,dir:1,toFloor:hf},
            {type:ENTER_ELEVATOR,toFloor:hf},{type:PRESS_FLOOR,floor:hf},
            {type:WAIT_FOR_FLOOR,floor:hf},{type:EXIT_ELEVATOR,toFloor:hf},
            {type:WALK_TO_WP,floor:hf,wpName:`office${a.deskId}_door`},
            {type:WALK_TO_WP,floor:hf,wpName:`office${a.deskId}_desk`},
            {type:WALK_TO_WP,floor:hf,wpName:`office${a.deskId}_chair`},
            {type:SIT,floor:hf,wpName:`office${a.deskId}_chair`},
            {type:ENTER_STATE,state:'AT_DESK'},
            {type:WAIT_SIM,minutes:randInt(30,60)},{type:PICK_NEXT_ACTIVITY}
        ];
    }

    function planVisitLounge(a) {
        const hf=a.homeFloor, spot=`lounge_spot${randInt(0,2)}`;
        return [
            {type:STAND},{type:WALK_TO_WP,floor:hf,wpName:`office${a.deskId}_desk`},
            {type:WALK_TO_WP,floor:hf,wpName:`office${a.deskId}_door`},
            {type:WALK_TO_WP,floor:hf,wpName:'lounge_door'},
            {type:WALK_TO_WP,floor:hf,wpName:spot},
            {type:WAIT_SIM,minutes:randInt(5,12)},
            {type:WALK_TO_WP,floor:hf,wpName:'lounge_door'},
            {type:WALK_TO_WP,floor:hf,wpName:`office${a.deskId}_door`},
            {type:WALK_TO_WP,floor:hf,wpName:`office${a.deskId}_desk`},
            {type:WALK_TO_WP,floor:hf,wpName:`office${a.deskId}_chair`},
            {type:SIT,floor:hf,wpName:`office${a.deskId}_chair`},
            {type:ENTER_STATE,state:'AT_DESK'},
            {type:WAIT_SIM,minutes:randInt(10,30)},{type:PICK_NEXT_ACTIVITY}
        ];
    }

    function planAttendMeeting(a) {
        const hf=a.homeFloor, mf=Math.random()<0.65?hf:randInt(1,5);
        const seats=[{x:-1.2,z:0.5,r:Math.PI},{x:1.2,z:0.5,r:0},{x:-1.2,z:-0.5,r:Math.PI},{x:1.2,z:-0.5,r:0}];
        const sn=randInt(0,3), s=seats[sn];
        const actions=[];
        actions.push({type:STAND},{type:WALK_TO_WP,floor:hf,wpName:`office${a.deskId}_desk`});
        actions.push({type:WALK_TO_WP,floor:hf,wpName:`office${a.deskId}_door`});
        actions.push({type:WALK_TO_WP,floor:hf,wpName:'elevWait'});
        if(mf!==hf){
            actions.push({type:WAIT_AT_PANEL,floor:hf,dir:mf>hf?1:-1,toFloor:mf});
            actions.push({type:ENTER_ELEVATOR,toFloor:mf},{type:PRESS_FLOOR,floor:mf});
            actions.push({type:WAIT_FOR_FLOOR,floor:mf},{type:EXIT_ELEVATOR,toFloor:mf});
            actions.push({type:WALK_TO_WP,floor:mf,wpName:'conf_door'});
        } else {
            actions.push({type:WALK_TO_WP,floor:hf,wpName:'conf_door'});
        }
        actions.push({type:WALK_TO_WP,floor:mf,wpName:'conf_center'});
        actions.push({type:WALK_TO_WP,floor:mf,wpName:`conf_seat${sn}`});
        actions.push({type:SIT,floor:mf,wpName:`conf_seat${sn}`},{type:ENTER_STATE,state:'IN_MEETING'});
        actions.push({type:WAIT_SIM,minutes:randInt(22,45)});
        actions.push({type:STAND},{type:RELEASE_SEAT},{type:WALK_TO_WP,floor:mf,wpName:'conf_door'});
        if(mf!==hf){
            actions.push({type:WALK_TO_WP,floor:mf,wpName:'elevWait'});
            actions.push({type:WAIT_AT_PANEL,floor:mf,dir:hf>mf?1:-1,toFloor:hf});
            actions.push({type:ENTER_ELEVATOR,toFloor:hf},{type:PRESS_FLOOR,floor:hf});
            actions.push({type:WAIT_FOR_FLOOR,floor:hf},{type:EXIT_ELEVATOR,toFloor:hf});
            actions.push({type:WALK_TO_WP,floor:hf,wpName:`office${a.deskId}_door`});
        }
        actions.push({type:WALK_TO_WP,floor:hf,wpName:`office${a.deskId}_desk`});
        actions.push({type:WALK_TO_WP,floor:hf,wpName:`office${a.deskId}_chair`});
        actions.push({type:SIT,floor:hf,wpName:`office${a.deskId}_chair`},{type:ENTER_STATE,state:'AT_DESK'});
        actions.push({type:WAIT_SIM,minutes:randInt(15,40)},{type:PICK_NEXT_ACTIVITY});
        return actions;
    }

    function planVisitCoworker(a, coworker) {
        const hf=a.homeFloor, cf=coworker.homeFloor;
        const actions=[];
        actions.push({type:STAND},{type:WALK_TO_WP,floor:hf,wpName:`office${a.deskId}_desk`});
        actions.push({type:WALK_TO_WP,floor:hf,wpName:`office${a.deskId}_door`});
        if(cf!==hf){
            actions.push({type:WALK_TO_WP,floor:hf,wpName:'elevWait'});
            actions.push({type:WAIT_AT_PANEL,floor:hf,dir:cf>hf?1:-1,toFloor:cf});
            actions.push({type:ENTER_ELEVATOR,toFloor:cf},{type:PRESS_FLOOR,floor:cf});
            actions.push({type:WAIT_FOR_FLOOR,floor:cf},{type:EXIT_ELEVATOR,toFloor:cf});
            actions.push({type:WALK_TO_WP,floor:cf,wpName:`office${coworker.deskId}_door`});
        } else {
            actions.push({type:WALK_TO_WP,floor:hf,wpName:`office${coworker.deskId}_door`});
        }
        actions.push({type:WALK_TO_WP,floor:cf,wpName:`office${coworker.deskId}_chair`});
        actions.push({type:WAIT_SIM,minutes:randInt(6,18)});
        if(cf!==hf){
            actions.push({type:WALK_TO_WP,floor:cf,wpName:`office${coworker.deskId}_door`});
            actions.push({type:WALK_TO_WP,floor:cf,wpName:'elevWait'});
            actions.push({type:WAIT_AT_PANEL,floor:cf,dir:hf>cf?1:-1,toFloor:hf});
            actions.push({type:ENTER_ELEVATOR,toFloor:hf},{type:PRESS_FLOOR,floor:hf});
            actions.push({type:WAIT_FOR_FLOOR,floor:hf},{type:EXIT_ELEVATOR,toFloor:hf});
            actions.push({type:WALK_TO_WP,floor:hf,wpName:`office${a.deskId}_door`});
        }
        actions.push({type:WALK_TO_WP,floor:hf,wpName:`office${a.deskId}_desk`});
        actions.push({type:WALK_TO_WP,floor:hf,wpName:`office${a.deskId}_chair`});
        actions.push({type:SIT,floor:hf,wpName:`office${a.deskId}_chair`},{type:ENTER_STATE,state:'AT_DESK'});
        actions.push({type:WAIT_SIM,minutes:randInt(10,30)},{type:PICK_NEXT_ACTIVITY});
        return actions;
    }

    function chooseNextActivity(a, world, clock, agents) {
        if(clock.simMinute>=a.departureTime) return planLeaveBuilding(a);
        for(let i=0;i<a.plannedMeetingTimes.length;i++){
            if(clock.simMinute>=a.plannedMeetingTimes[i]){a.plannedMeetingTimes.splice(i,1);return planAttendMeeting(a);}
        }
        if(clock.simMinute>=a.lunchTime&&!a.hasLunched) return planGoToLunch(a);
        const r=Math.random(), MP=0.36*0.4;
        if(r<MP) return planAttendMeeting(a);
        else if(r<MP+0.12) return planVisitLounge(a);
        else if(r<MP+0.12+0.15){
            const c=agents.filter(x=>x.role===WORKER&&x.state==='AT_DESK'&&x.id!==a.id);
            if(c.length>0) return planVisitCoworker(a,c[randInt(0,c.length-1)]);
            return planVisitLounge(a);
        } else return[{type:WAIT_SIM,minutes:randInt(18,65)},{type:PICK_NEXT_ACTIVITY}];
    }

    function main() {
        const scene=new THREE.Scene(), camera=new THREE.PerspectiveCamera(60,window.innerWidth/window.innerHeight,0.1,1000);
        camera.position.set(28,24,28); camera.lookAt(0,10,0);
        const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});
        renderer.setSize(window.innerWidth,window.innerHeight); renderer.sortObjects=true;
        document.body.appendChild(renderer.domElement);
        const controls=new THREE.OrbitControls(camera,renderer.domElement);
        controls.enableDamping=true; controls.dampingFactor=0.05;
        const al=new THREE.AmbientLight(0x404040,0.8); al.name='ambientLight'; scene.add(al);
        const sl=new THREE.DirectionalLight(0xffffff,1.0); sl.name='sunLight'; sl.position.set(30,40,20); scene.add(sl);
        const hl=new THREE.HemisphereLight(0xffffbb,0x080820,0.6); hl.name='hemiLight'; scene.add(hl);
        const world=createWorld(scene);
        const elevator=new Elevator(scene,world);
        const clock=new Clock();
        const agents=[], seatReservations=new Set();
        let targetOccupancy=DEFAULT_OCCUPANCY;

        for(let i=0;i<MAX_WORKERS;i++){
            const a=createAgent(WORKER,i);
            for(let j=0;j<Math.floor(Math.random()*3);j++) a.plannedMeetingTimes.push(randInt(a.arrivalTime+60,Math.min(a.departureTime-60,20*60)));
            agents.push(a);
        }
        for(let i=0;i<MAX_VISITORS;i++) agents.push(createAgent(VISITOR,MAX_WORKERS+i));

        function countPresent(){ return agents.filter(a=>a.state!==DISABLED&&a.state!==AWAY&&a.state!==GONE).length; }
        function applyOccupancy(){
            for(let i=0;i<agents.length;i++){
                if(i<targetOccupancy) agents[i].state=agents[i].state===DISABLED?AWAY:agents[i].state;
                else{ agents[i].state=DISABLED; if(agents[i].group.parent) agents[i].group.parent.remove(agents[i].group); }
            }
        }
        function topUpVisitors(){
            const deficit=targetOccupancy-countPresent();
            if(deficit<=0) return;
            const c=agents.filter(a=>a.role===VISITOR&&(a.state===AWAY||a.state===GONE));
            for(let i=0;i<Math.min(deficit,c.length);i++){
                const ag=c[i]; ag.arrivalTime=Math.floor(clock.simMinute)+randInt(0,6); ag.state=AWAY;
                ag.plannedMeetingTimes=[]; ag.hasLunched=false;
            }
        }
        function startDay(){
            for(const a of agents){
                a.arrivalTime=randInt(8*60+15,9*60+30); a.lunchTime=randInt(11*60+30,13*60+30);
                a.lunchDuration=randInt(25,60);
                a.departureTime=Math.random()<0.15?randInt(18*60+30,19*60+45):randInt(16*60+45,18*60+30);
                a.plannedMeetingTimes=[];
                for(let j=0;j<Math.floor(Math.random()*3);j++) a.plannedMeetingTimes.push(randInt(a.arrivalTime+60,Math.min(a.departureTime-60,20*60)));
                a.hasLunched=false; a.state=AWAY; a.plan=[]; a.currentAction=null; a.currentActionIndex=0;
                a.walkPath=[]; a.walkPathIndex=0; if(a.group.parent) a.group.parent.remove(a.group);
            }
            elevator.reset(); seatReservations.clear(); applyOccupancy();
        }

        applyOccupancy();
        for(let i=0;i<Math.min(5,targetOccupancy);i++){
            if(agents[i].state===AWAY){ agents[i].state='ARRIVING'; agents[i].plan=planArriveToDesk(agents[i]); agents[i].currentActionIndex=0; }
        }

        function processAgent(agent, motionDt) {
            if(agent.state===DISABLED||agent.state===GONE) return;
            if(agent.state===AWAY&&clock.simMinute>=agent.arrivalTime){
                agent.plan=agent.role===WORKER?planArriveToDesk(agent):planVisitorVisit(agent);
                agent.currentActionIndex=0; agent.state='ON_FLOOR';
                agent.group.position.set((Math.random()-0.5)*2.2,0,12+(Math.random()-0.5)*1.5);
                agent.group.rotation.y=Math.random()*Math.PI*2; scene.add(agent.group);
                agent.group.userData.isWalking=true;
            }
            if(agent.role===WORKER&&clock.simMinute>=agent.departureTime&&agent.state!=='LEAVING'&&agent.state!=='GONE'){
                agent.plan=planLeaveBuilding(agent); agent.currentActionIndex=0;
                if(agent.state==='AT_DESK'||agent.state==='IN_MEETING') agent.state='LEAVING';
            }
            for(let loop=0;loop<16;loop++){
                if(agent.currentActionIndex>=agent.plan.length){
                    if(agent.state==='ARRIVING') agent.state='AT_DESK';
                    agent.plan=chooseNextActivity(agent,world,clock,agents); agent.currentActionIndex=0; continue;
                }
                const action=agent.plan[agent.currentActionIndex];
                if(!action._started){ startAction(agent,action); action._started=true; }
                if(isActionComplete(agent,action,motionDt)){ completeAction(agent,action); agent.currentActionIndex++; }
                else break;
            }
        }

        function startAction(agent, action) {
            switch(action.type){
                case WALK_TO_WP: startWalkToWp(agent,action); break;
                case WAIT_AT_PANEL: elevator.callUp(action.floor); break; // simplified
                case ENTER_ELEVATOR: startEnterElevator(agent,action); break;
                case PRESS_FLOOR: elevator.pressDestination(action.floor); break;
                case EXIT_ELEVATOR: startExitElevator(agent,action); break;
                case SIT: doSit(agent,action); break;
                case STAND: doStand(agent); break;
                case RELEASE_SEAT: if(action.wpName) seatReservations.delete(`${action.floor}:${action.wpName}`); break;
                case WAIT_SIM: action._untilMin=clock.simMinute+action.minutes; break;
                case EXIT_BUILDING: scene.remove(agent.group); agent.state=GONE; break;
                case ENTER_STATE: agent.state=action.state; break;
                case MARK_LUNCHED: agent.hasLunched=true; break;
                case PICK_NEXT_ACTIVITY: agent.plan=chooseNextActivity(agent,world,clock,agents); agent.currentActionIndex=0; break;
            }
        }

        function isActionComplete(agent, action, motionDt) {
            switch(action.type){
                case WALK_TO_WP: return isWalkComplete(agent,action);
                case WAIT_AT_PANEL: return isWaitAtPanelComplete(agent,action);
                case ENTER_ELEVATOR: return isEnterElevatorComplete(agent,action);
                case PRESS_FLOOR: return true;
                case WAIT_FOR_FLOOR: return Math.round(elevator.currentFloor)===action.floor&&elevator.state==='DOOR_OPEN';
                case EXIT_ELEVATOR: return isExitElevatorComplete(agent,action);
                case SIT: case STAND: case RELEASE_SEAT: case WAIT_SIM: case EXIT_BUILDING: case ENTER_STATE: case MARK_LUNCHED: case PICK_NEXT_ACTIVITY: return true;
                default: return true;
            }
        }

        function completeAction(agent, action) {
            switch(action.type){
                case WALK_TO_WP: agent.group.userData.isWalking=false; break;
                case WAIT_AT_PANEL: elevator.callUp(action.floor); break;
                case EXIT_ELEVATOR: if(agent.group.parent!==scene){ scene.add(agent.group); agent.group.position.copy(action._worldPosition); } break;
            }
        }

        function startWalkToWp(agent, action) {
            const fi=world.floors[action.floor];
            if(!fi||!fi.nodes[action.wpName]){ action._completed=true; return; }
            const tp=fi.nodes[action.wpName].clone();
            const sp=agent.group.position.clone();
            const cf=Math.round(agent.group.position.y/world.WORLD.FLOOR_HEIGHT);
            if(cf!==action.floor){ action._completed=true; return; }
            const path=world.bfsPath(fi.nodes, Object.keys(fi.nodes).reduce((a,b)=>a.position.distanceTo(sp)<b.position.distanceTo(sp)?a:b,{position:new THREE.Vector3(Infinity,Infinity,Infinity)}).name, action.wpName, action.floor);
            if(path.length===0){ action._completed=true; return; }
            agent.walkPath=path; agent.walkPathIndex=0; agent.group.userData.isWalking=true;
            if(action.wpName==='outside'||action.wpName==='entrance'){
                const jx=(Math.random()-0.5)*2.2, jz=(Math.random()-0.5)*1.5;
                agent.group.position.set(tp.x+jx,tp.y,tp.z+jz);
            }
            action._completed=false;
        }

        function isWalkComplete(agent, action) {
            if(agent.walkPathIndex>=agent.walkPath.length) return true;
            const t=agent.walkPath[agent.walkPathIndex];
            const dist=agent.group.position.distanceTo(t);
            if(agent._prevWp===agent.walkPath[agent.walkPathIndex]){ agent._stallT+=motionDt; if(agent._stallT>1.2){ agent.walkPathIndex++; agent._stallT=0; return false; } }
            else{ agent._prevWp=agent.walkPath[agent.walkPathIndex]; agent._stallT=0; }
            return dist<0.15;
        }

        function startEnterElevator(agent, action) {
            action._toFloor=action.toFloor; action._phase=0; action._stallT=0;
            const spot=elevator.reserveBoardingSpot(agent.id);
            if(spot){ action._spot=spot; action._spotWorldX=spot.x; action._phase=1;
                const fi=world.floors[Math.round(agent.group.position.y/world.WORLD.FLOOR_HEIGHT)];
                if(fi){ const th=fi.nodes.elevWait.clone(); th.x=action._spotWorldX; agent.walkPath=[th]; agent.walkPathIndex=0; agent.group.userData.isWalking=true; }
            } else { elevator.callUp(Math.round(agent.group.position.y/world.WORLD.FLOOR_HEIGHT)); }
        }

        function isEnterElevatorComplete(agent, action) {
            if(action._phase===0){ const spot=elevator.reserveBoardingSpot(agent.id);
                if(spot){ action._spot=spot; action._spotWorldX=spot.x; action._phase=1;
                    const fi=world.floors[Math.round(agent.group.position.y/world.WORLD.FLOOR_HEIGHT)];
                    if(fi){ const th=fi.nodes.elevWait.clone(); th.x=action._spotWorldX; agent.walkPath=[th]; agent.walkPathIndex=0; agent.group.userData.isWalking=true; }
                } return false; }
            if(action._phase===1){ if(isWalkComplete(agent,{type:WALK_TO_WP})){ action._phase=2; walkToCarSpot(agent,action); } return false; }
            if(action._phase===2){ if(isWalkComplete(agent,{type:WALK_TO_WP})){ action._phase=3;
                elevator.completeBoard(agent.id); agent.group.rotation.y=0; agent.state='IN_CAR'; return true; } return false; }
            return action._phase>=3;
        }

        function walkToCarSpot(agent, action) {
            elevator.carGroup.add(agent.group);
            const cs=new THREE.Vector3(action._spot.x,action._spot.y,action._spot.z);
            agent.walkPath=[cs.clone()]; agent.walkPathIndex=0; agent.group.userData.isWalking=true;
        }

        function startExitElevator(agent, action) {
            action._toFloor=action.toFloor; action._phase=1;
            elevator.registerDisembark(agent.id);
            const fi=world.floors[action.toFloor];
            if(fi&&fi.nodes.elevWait){ const th=fi.nodes.elevWait.clone(); const si=elevator.logic.spotOccupancy.findIndex(o=>o);
                const xo=si%2===0?-0.8:0.8; th.x+=xo; agent.walkPath=[th]; agent.walkPathIndex=0; agent.group.userData.isWalking=true; action._worldPosition=th.clone(); }
        }

        function isExitElevatorComplete(agent, action) {
            if(action._phase===1){ if(isWalkComplete(agent,{type:WALK_TO_WP})){ action._phase=2; elevator.completeDisembark(agent.id); return true; } return false; }
            return action._phase>=2;
        }

        function isWaitAtPanelComplete(agent, action) {
            const cf=Math.round(agent.group.position.y/world.WORLD.FLOOR_HEIGHT);
            if(cf!==action.floor){ elevator.callUp(cf); return false; }
            const acc=elevator.isAcceptingAt(action.floor,action.dir);
            if(acc&&elevator.currentCapacityFree()>0) return true;
            elevator.callUp(action.floor); return false;
        }

        function doSit(agent, action) {
            const fi=world.floors[action.floor];
            if(fi&&fi.sitTargets[action.wpName]){
                const t=fi.sitTargets[action.wpName];
                if(t.sit){ agent.group.userData.isSitting=true; agent.group.position.y-=0.35; agent.group.rotation.y=t.facing;
                    if(!t.sit){ const a=Math.random()*Math.PI*2, d=0.35+Math.random()*0.4;
                        agent.group.position.x+=Math.cos(a)*d; agent.group.position.z+=Math.sin(a)*d; }
                } else { const n=fi.nodes[action.wpName];
                    if(n){ agent.group.position.copy(n); agent.group.rotation.y=t.facing;
                        const a=Math.random()*Math.PI*2, d=0.35+Math.random()*0.4;
                        agent.group.position.x+=Math.cos(a)*d; agent.group.position.z+=Math.sin(a)*d; }
                }
            }
        }

        function doStand(agent) {
            agent.group.userData.isSitting=false;
            const fn=Math.round(agent.group.position.y/world.WORLD.FLOOR_HEIGHT);
            agent.group.position.y=fn*world.WORLD.FLOOR_HEIGHT;
        }

        function applyCollisions() {
            const ps=0.18;
            for(let i=0;i<agents.length;i++){
                const a1=agents[i]; if(a1.state===DISABLED||a1.state===GONE||!a1.group.parent) continue;
                if(a1.group.userData.isSitting) continue; if(a1.group.parent===elevator.carGroup) continue;
                if(a1.currentAction&&a1.currentAction.type===ENTER_ELEVATOR) continue;
                for(let j=i+1;j<agents.length;j++){
                    const a2=agents[j]; if(a2.state===DISABLED||a2.state===GONE||!a2.group.parent) continue;
                    if(a2.group.userData.isSitting) continue; if(a2.group.parent===elevator.carGroup) continue;
                    if(a2.currentAction&&a2.currentAction.type===ENTER_ELEVATOR) continue; if(a1.group.parent!==a2.group.parent) continue;
                    const p1=a1.group.position, p2=a2.group.position; const dx=p2.x-p1.x, dz=p2.z-p1.z, dy=p2.y-p1.y;
                    const dXZ=Math.sqrt(dx*dx+dz*dz), dY=Math.abs(dy);
                    if(dXZ<1.0&&dY<1.0){ const td=Math.sqrt(dXZ*dXZ+dY*dY);
                        if(td<0.01){ const a=Math.random()*Math.PI*2, p=ps*0.5;
                            p1.x-=Math.cos(a)*p; p1.z-=Math.sin(a)*p; p2.x+=Math.cos(a)*p; p2.z+=Math.sin(a)*p; }
                        else{ const p=ps*(1.0-td)/td; p1.x-=dx/dXZ*p; p1.z-=dz/dXZ*p; p2.x+=dx/dXZ*p; p2.z+=dz/dXZ*p; }
                    }
                }
            }
        }

        function createHUD() {
            const hud=document.createElement('div');
            hud.style.cssText='position:absolute;top:10px;left:10px;color:#fff;font-family:monospace;font-size:14px;background:rgba(0,0,0,0.7);padding:10px;border-radius:5px;max-width:400px';
            document.body.appendChild(hud);
            const td=document.createElement('div'); td.id='simTime'; td.style.cssText='font-size:24px;font-weight:bold;margin-bottom:10px';
            hud.appendChild(td);
            const sd=document.createElement('div'); sd.style.marginBottom='10px';
            const sl=document.createElement('span'); sl.textContent='Speed: '; sd.appendChild(sl);
            const sld=document.createElement('input'); sld.type='range'; sld.min='0'; sld.max='100';
            sld.value=Math.round(100*Math.log(clock.timeScale)/Math.log(600));
            sld.style.width='150px'; sld.addEventListener('input',()=>{ clock.timeScale=Math.exp(sld.value/100*Math.log(600)); sl.textContent=`Speed: ${Math.round(clock.timeScale)}x `; });
            sd.appendChild(sld); hud.appendChild(sd);
            const od=document.createElement('div'); od.style.marginBottom='10px';
            const ol=document.createElement('span'); ol.textContent=`Occupancy: ${countPresent()} / ${MAX_OCCUPANCY} `; od.appendChild(ol);
            const os=document.createElement('input'); os.type='range'; os.min='1'; os.max=MAX_OCCUPANCY; os.value=DEFAULT_OCCUPANCY; os.style.width='150px';
            os.addEventListener('input',()=>{ targetOccupancy=parseInt(os.value); ol.textContent=`Occupancy: ${countPresent()} / ${MAX_OCCUPANCY} `; applyOccupancy(); });
            od.appendChild(os); hud.appendChild(od);
            const ed=document.createElement('div'); ed.id='elevatorState'; ed.style.marginBottom='5px'; hud.appendChild(ed);
            const ad=document.createElement('div'); ad.id='agentCounts'; ad.style.fontSize='12px'; hud.appendChild(ad);
            return hud;
        }

        function updateHUD() {
            document.getElementById('simTime').textContent=clock.format();
            const ed=document.getElementById('elevatorState');
            if(ed) ed.textContent=`Elev: F${elevator.currentFloor} ${elevator.state} dir=${elevator.direction} p=${elevator.passengers.length}`;
            const ad=document.getElementById('agentCounts');
            if(ad){ const c={}; for(const a of agents){ if(a.state!==DISABLED&&a.state!==GONE) c[a.state]=(c[a.state]||0)+1; }
                ad.textContent=Object.entries(c).map(([k,v])=> `${k}:${v}`).join(' '); }
        }

        window.addEventListener('resize',()=>{ camera.aspect=window.innerWidth/window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth,window.innerHeight); });
        createHUD();

        const clockThree=new THREE.Clock();
        function animate() { requestAnimationFrame(animate);
            const realDt=Math.min(0.05,clockThree.getDelta());
            const dayWrapped=clock.tick(realDt); if(dayWrapped) startDay();
            updateLighting(scene,clock.simMinute); elevator.tick(realDt*clock.timeScale);
            const motionDt=realDt*clock.timeScale; topUpVisitors();
            for(const agent of agents) processAgent(agent,motionDt);
            applyCollisions();
            for(const agent of agents){
                if(agent.group.parent&&agent.state!==DISABLED&&agent.state!==GONE){
                    if(agent.walkPathIndex<agent.walkPath.length){ const t=agent.walkPath[agent.walkPathIndex]; const dist=agent.group.position.distanceTo(t);
                        if(dist>0.05){ const d=t.clone().sub(agent.group.position).normalize(); const move=Math.min(dist,agent.walkSpeed*motionDt);
                            agent.group.position.add(d.multiplyScalar(move)); agent.group.rotation.y=Math.atan2(d.x,d.z); agent.group.userData.isWalking=true; }
                        else agent.walkPathIndex++; }
                    animatePersonWalking(agent.group,motionDt);
                }
            }
            controls.update(); renderer.render(scene,camera); updateHUD();
        }
        animate();
    }

    if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',main); else main();
}})();
