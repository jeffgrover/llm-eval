var scene,camera,renderer,controls,world,elevator;
var Clock={ simMinute: 7*60+30, timeScale:120, lastReal: performance.now(), tick:function(realDt){ this.simMinute += realDt*this.timeScale/60; if(this.simMinute>=24*60){ this.simMinute-=24*60; resetDay(); } }, format:function(){ var m=Math.floor(this.simMinute)%1440; var h=Math.floor(m/60); var mm=m%60; var am=h<12; var dh=h%12; if(dh===0) dh=12; return (dh<10?' '+dh:dh)+':'+(mm<10?'0'+mm:mm)+' '+(am?'AM':'PM'); }, getDelta:function(){ var n=performance.now(); var d=(n-this.lastReal)/1000; this.lastReal=n; return d; } };

var MAX_WORKERS=20, MAX_VISITORS=80;
var MAX_OCCUPANCY=100;
var targetOccupancy=45;

var agents=[];
var seatReservations=new Set();
var NAMES=['Alex','Sam','Jay','Kim','Lee','Pat','Jo','Ari','Mia','Zoe','Ben','Ann','Dan','Eva','Ian','Sue','Tom','Amy','Max','Liz','Jon','Uma','Roy','Liv','Kai','Nia','Bo','Cal','Dee','Fay'];

function randInt(a,b){ return Math.floor(Math.random()*(b-a+1))+a; }
function pick(a){ return a[Math.floor(Math.random()*a.length)]; }

function reserveConfSeat(floor){
    for(var i=0;i<4;i++){
        var key=floor+':conf_seat'+i;
        if(!seatReservations.has(key)){ seatReservations.add(key); return 'conf_seat'+i; }
    }
    return null;
}
function releaseSeatKey(k){ seatReservations.delete(k); }

function makeAgent(id){
    var role=id<MAX_WORKERS?'WORKER':'VISITOR';
    var homeFloor=null, deskId=null;
    if(role==='WORKER'){
        homeFloor=1+ (id % (WORLD.FLOOR_COUNT-1));
        var desks=['A','B','C','D'];
        var countPerFloor=4;
        var idxOnFloor=Math.floor(id / 1) % 4;
        // distribute desks: assign each worker a desk letter based on id
        deskId=desks[id%4];
        // adjust homeFloor assignment to avoid duplicate desk: use id mapping
        homeFloor=1+ Math.floor(id/4) % (WORLD.FLOOR_COUNT-1);
        if(homeFloor>=WORLD.FLOOR_COUNT) homeFloor=1;
    }
    var ag={
        id:id, role:role, name:pick(NAMES)+id,
        homeFloor:homeFloor, deskId:deskId,
        deskWpName: deskId? 'office'+deskId+'_desk':null,
        deskDoorWpName: deskId? 'office'+deskId+'_door':null,
        arrivalTime:0,lunchTime:0,lunchDuration:30,departureTime:0,hasLunched:false,plannedMeetingTimes:[],
        state:'AWAY', plan:[], currentAction:null,
        group:null, currentFloor:0, pos:new THREE.Vector3(),
        walkPath:[], walkIdx:0,
        _prevWp:null, _stallT:0,
        _prevWalk:null, _stallWalkT:0,
        reservedSeatKey:null,
        insideCar:false
    };
    resampleSchedule(ag);
    if(id>=targetOccupancy) ag.state='DISABLED';
    return ag;
}
function resampleSchedule(ag){
    ag.arrivalTime=randInt(8*60+15,9*60+30);
    ag.lunchTime=randInt(11*60+30,13*60+30);
    ag.lunchDuration=randInt(25,60);
    var strag=Math.random()<0.15;
    ag.departureTime= strag? randInt(18*60+30,19*60+45) : randInt(16*60+45,18*60+30);
    ag.hasLunched=false;
    ag.plannedMeetingTimes=[];
    var n=Math.random();
    if(n<0.4){ ag.plannedMeetingTimes.push(randInt(10*60,11*60+30)); }
    if(Math.random()<0.35) ag.plannedMeetingTimes.push(randInt(14*60,15*60+30));
    ag.plannedMeetingTimes.sort(function(a,b){return a-b;});
    if(ag.role==='VISITOR'){
        ag.arrivalTime=randInt(9*60,16*60);
        ag.visitDuration=randInt(12,40);
    }
}

function createAgents(){
    agents=[];
    for(var i=0;i<MAX_OCCUPANCY;i++) agents.push(makeAgent(i));
}

function countPresent(){
    var c=0;
    for(var i=0;i<agents.length;i++){ var s=agents[i].state; if(s!=='AWAY'&&s!=='DISABLED'&&s!=='GONE') c++; }
    return c;
}
function topUpVisitors(){
    if(Clock.simMinute<8*60 || Clock.simMinute>18*60) return;
    var deficit=targetOccupancy - countPresent();
    if(deficit<=0) return;
    var reArmed=0;
    for(var i=0;i<agents.length && reArmed<deficit;i++){
        var ag=agents[i];
        if(ag.role!=='VISITOR') continue;
        if(ag.state==='AWAY'||ag.state==='GONE'){
            ag.arrivalTime=Math.floor(Clock.simMinute)+randInt(0,6);
            ag.visitDuration=randInt(12,40);
            if(ag.state==='GONE'){ ag.state='AWAY'; }
            if(ag.group && ag.group.parent) ag.group.parent.remove(ag.group);
            ag.group=null;
            reArmed++;
        }
    }
}

function applyOccupancy(){
    for(var i=0;i<agents.length;i++){
        var ag=agents[i];
        if(ag.id < targetOccupancy){
            if(ag.state==='DISABLED'){ ag.state='AWAY'; resampleSchedule(ag); }
        } else {
            if(ag.state==='AWAY'||ag.state==='GONE'){
                ag.state='DISABLED';
                if(ag.group && ag.group.parent) ag.group.parent.remove(ag.group);
                ag.group=null;
            }
        }
    }
}

function resetDay(){
    seatReservations.clear();
    elevator.reset();
    for(var i=0;i<agents.length;i++){
        var ag=agents[i];
        if(ag.group && ag.group.parent) try{ ag.group.parent.remove(ag.group);}catch(e){}
        ag.group=null; ag.plan=[]; ag.currentAction=null; ag.walkPath=[]; ag.walkIdx=0;
        ag.insideCar=false; ag.reservedSeatKey=null;
        ag._prevWp=null; ag._stallT=0; ag._prevWalk=null; ag._stallWalkT=0;
        resampleSchedule(ag);
        if(ag.id < targetOccupancy) ag.state='AWAY'; else ag.state='DISABLED';
    }
    Clock.simMinute=7*60+30;
}

// action constructors helpers
function act(type, data){ var o={type:type}; for(var k in data) o[k]=data[k]; return o; }

function planArriveToDesk(ag){
    var list=[];
    list.push(act('WALK_TO_WP',{floor:0, wpName:'outside'}));
    list.push(act('WALK_TO_WP',{floor:0, wpName:'front_door_threshold'}));
    list.push(act('WALK_TO_WP',{floor:0, wpName:'entrance'}));
    list.push(act('WALK_TO_WP',{floor:0, wpName:'lobby_center'}));
    if(ag.homeFloor!==0){
        list.push(act('WAIT_AT_PANEL',{floor:0, dir:1, toFloor:ag.homeFloor}));
        list.push(act('ENTER_ELEVATOR',{toFloor:ag.homeFloor}));
        list.push(act('PRESS_FLOOR',{floor:ag.homeFloor}));
        list.push(act('WAIT_FOR_FLOOR',{floor:ag.homeFloor}));
        list.push(act('EXIT_ELEVATOR',{toFloor:ag.homeFloor}));
        list.push(act('WALK_TO_WP',{floor:ag.homeFloor, wpName:ag.deskDoorWpName}));
        list.push(act('WALK_TO_WP',{floor:ag.homeFloor, wpName:ag.deskWpName}));
    } else {
        list.push(act('WALK_TO_WP',{floor:0, wpName:'lobby_center'}));
    }
    list.push(act('SIT',{floor:ag.homeFloor, wpName:ag.deskWpName}));
    list.push(act('ENTER_STATE',{state:'AT_DESK'}));
    list.push(act('WAIT_SIM',{minutes: randInt(18,65)}));
    list.push(act('PICK_NEXT_ACTIVITY',{}));
    return list;
}
function planGoToLunch(ag){
    var list=[];
    list.push(act('STAND',{}));
    list.push(act('WALK_TO_WP',{floor:ag.homeFloor, wpName:ag.deskDoorWpName}));
    list.push(act('WALK_TO_WP',{floor:ag.homeFloor, wpName:'elevWait'}));
    list.push(act('WAIT_AT_PANEL',{floor:ag.homeFloor, dir:-1, toFloor:0}));
    list.push(act('ENTER_ELEVATOR',{toFloor:0}));
    list.push(act('PRESS_FLOOR',{floor:0}));
    list.push(act('WAIT_FOR_FLOOR',{floor:0}));
    list.push(act('EXIT_ELEVATOR',{toFloor:0}));
    var bistro=['bistro0','bistro1','bistro2','bistro3'];
    var pickB=pick(bistro);
    list.push(act('WALK_TO_WP',{floor:0, wpName:'cafe_door'}));
    list.push(act('WALK_TO_WP',{floor:0, wpName:pickB}));
    list.push(act('SIT',{floor:0, wpName:pickB}));
    list.push(act('ENTER_STATE',{state:'AT_LUNCH'}));
    list.push(act('WAIT_SIM',{minutes: ag.lunchDuration}));
    list.push(act('STAND',{}));
    list.push(act('MARK_LUNCHED',{}));
    list.push(act('WALK_TO_WP',{floor:0, wpName:'elevWait'}));
    list.push(act('WAIT_AT_PANEL',{floor:0, dir:1, toFloor:ag.homeFloor}));
    list.push(act('ENTER_ELEVATOR',{toFloor:ag.homeFloor}));
    list.push(act('PRESS_FLOOR',{floor:ag.homeFloor}));
    list.push(act('WAIT_FOR_FLOOR',{floor:ag.homeFloor}));
    list.push(act('EXIT_ELEVATOR',{toFloor:ag.homeFloor}));
    list.push(act('WALK_TO_WP',{floor:ag.homeFloor, wpName:ag.deskDoorWpName}));
    list.push(act('WALK_TO_WP',{floor:ag.homeFloor, wpName:ag.deskWpName}));
    list.push(act('SIT',{floor:ag.homeFloor, wpName:ag.deskWpName}));
    list.push(act('ENTER_STATE',{state:'AT_DESK'}));
    list.push(act('WAIT_SIM',{minutes: randInt(18,40)}));
    list.push(act('PICK_NEXT_ACTIVITY',{}));
    return list;
}
function planVisitLounge(ag){
    var list=[];
    list.push(act('STAND',{}));
    var spot=pick(['lounge_spot0','lounge_spot1','lounge_spot2']);
    list.push(act('WALK_TO_WP',{floor:ag.homeFloor, wpName:'lounge_door'}));
    list.push(act('WALK_TO_WP',{floor:ag.homeFloor, wpName:spot}));
    list.push(act('SIT',{floor:ag.homeFloor, wpName:spot}));
    list.push(act('ENTER_STATE',{state:'AT_BREAK'}));
    list.push(act('WAIT_SIM',{minutes: randInt(5,12)}));
    list.push(act('STAND',{}));
    list.push(act('WALK_TO_WP',{floor:ag.homeFloor, wpName:ag.deskDoorWpName}));
    list.push(act('WALK_TO_WP',{floor:ag.homeFloor, wpName:ag.deskWpName}));
    list.push(act('SIT',{floor:ag.homeFloor, wpName:ag.deskWpName}));
    list.push(act('ENTER_STATE',{state:'AT_DESK'}));
    list.push(act('WAIT_SIM',{minutes: randInt(10,20)}));
    list.push(act('PICK_NEXT_ACTIVITY',{}));
    return list;
}
function planAttendMeeting(ag, meetingFloor, seatName){
    var list=[];
    list.push(act('STAND',{}));
    if(meetingFloor!==ag.homeFloor){
        list.push(act('WALK_TO_WP',{floor:ag.homeFloor, wpName:'elevWait'}));
        var dir= meetingFloor>ag.homeFloor?1:-1;
        list.push(act('WAIT_AT_PANEL',{floor:ag.homeFloor, dir:dir, toFloor:meetingFloor}));
        list.push(act('ENTER_ELEVATOR',{toFloor:meetingFloor}));
        list.push(act('PRESS_FLOOR',{floor:meetingFloor}));
        list.push(act('WAIT_FOR_FLOOR',{floor:meetingFloor}));
        list.push(act('EXIT_ELEVATOR',{toFloor:meetingFloor}));
    } else {
        list.push(act('WALK_TO_WP',{floor:ag.homeFloor, wpName:'hallS'}));
    }
    list.push(act('WALK_TO_WP',{floor:meetingFloor, wpName:'conf_door'}));
    list.push(act('WALK_TO_WP',{floor:meetingFloor, wpName:seatName}));
    list.push(act('SIT',{floor:meetingFloor, wpName:seatName}));
    list.push(act('ENTER_STATE',{state:'IN_MEETING'}));
    list.push(act('WAIT_SIM',{minutes: randInt(22,45)}));
    list.push(act('STAND',{}));
    list.push(act('RELEASE_SEAT',{key:meetingFloor+':'+seatName}));
    if(meetingFloor!==ag.homeFloor){
        list.push(act('WALK_TO_WP',{floor:meetingFloor, wpName:'elevWait'}));
        var dir2= ag.homeFloor>meetingFloor?1:-1;
        list.push(act('WAIT_AT_PANEL',{floor:meetingFloor, dir:dir2, toFloor:ag.homeFloor}));
        list.push(act('ENTER_ELEVATOR',{toFloor:ag.homeFloor}));
        list.push(act('PRESS_FLOOR',{floor:ag.homeFloor}));
        list.push(act('WAIT_FOR_FLOOR',{floor:ag.homeFloor}));
        list.push(act('EXIT_ELEVATOR',{toFloor:ag.homeFloor}));
    }
    list.push(act('WALK_TO_WP',{floor:ag.homeFloor, wpName:ag.deskDoorWpName}));
    list.push(act('WALK_TO_WP',{floor:ag.homeFloor, wpName:ag.deskWpName}));
    list.push(act('SIT',{floor:ag.homeFloor, wpName:ag.deskWpName}));
    list.push(act('ENTER_STATE',{state:'AT_DESK'}));
    list.push(act('WAIT_SIM',{minutes: randInt(10,30)}));
    list.push(act('PICK_NEXT_ACTIVITY',{}));
    return list;
}
function planVisitCoworker(ag){
    var candidates=agents.filter(function(a){return a.state==='AT_DESK' && a.id!==ag.id && a.homeFloor!==null;});
    var target=candidates.length? pick(candidates) : null;
    var list=[];
    list.push(act('STAND',{}));
    if(!target){
        list.push(act('WAIT_SIM',{minutes: randInt(6,18)}));
        list.push(act('PICK_NEXT_ACTIVITY',{}));
        return list;
    }
    var destFloor=target.homeFloor;
    if(destFloor!==ag.homeFloor){
        list.push(act('WALK_TO_WP',{floor:ag.homeFloor, wpName:'elevWait'}));
        var dir=destFloor>ag.homeFloor?1:-1;
        list.push(act('WAIT_AT_PANEL',{floor:ag.homeFloor, dir:dir, toFloor:destFloor}));
        list.push(act('ENTER_ELEVATOR',{toFloor:destFloor}));
        list.push(act('PRESS_FLOOR',{floor:destFloor}));
        list.push(act('WAIT_FOR_FLOOR',{floor:destFloor}));
        list.push(act('EXIT_ELEVATOR',{toFloor:destFloor}));
    }
    list.push(act('WALK_TO_WP',{floor:destFloor, wpName:target.deskDoorWpName}));
    list.push(act('ENTER_STATE',{state:'VISITING'}));
    list.push(act('WAIT_SIM',{minutes: randInt(6,18)}));
    if(destFloor!==ag.homeFloor){
        list.push(act('WALK_TO_WP',{floor:destFloor, wpName:'elevWait'}));
        var dir2=ag.homeFloor>destFloor?1:-1;
        list.push(act('WAIT_AT_PANEL',{floor:destFloor, dir:dir2, toFloor:ag.homeFloor}));
        list.push(act('ENTER_ELEVATOR',{toFloor:ag.homeFloor}));
        list.push(act('PRESS_FLOOR',{floor:ag.homeFloor}));
        list.push(act('WAIT_FOR_FLOOR',{floor:ag.homeFloor}));
        list.push(act('EXIT_ELEVATOR',{toFloor:ag.homeFloor}));
    }
    list.push(act('WALK_TO_WP',{floor:ag.homeFloor, wpName:ag.deskDoorWpName}));
    list.push(act('WALK_TO_WP',{floor:ag.homeFloor, wpName:ag.deskWpName}));
    list.push(act('SIT',{floor:ag.homeFloor, wpName:ag.deskWpName}));
    list.push(act('ENTER_STATE',{state:'AT_DESK'}));
    list.push(act('WAIT_SIM',{minutes: randInt(10,20)}));
    list.push(act('PICK_NEXT_ACTIVITY',{}));
    return list;
}
function planLeaveBuilding(ag){
    var list=[];
    list.push(act('STAND',{}));
    if(ag.reservedSeatKey){ list.push(act('RELEASE_SEAT',{key:ag.reservedSeatKey})); ag.reservedSeatKey=null; }
    list.push(act('WALK_TO_WP',{floor:ag.homeFloor, wpName:ag.deskDoorWpName}));
    list.push(act('WALK_TO_WP',{floor:ag.homeFloor, wpName:'elevWait'}));
    list.push(act('WAIT_AT_PANEL',{floor:ag.homeFloor, dir:-1, toFloor:0}));
    list.push(act('ENTER_ELEVATOR',{toFloor:0}));
    list.push(act('PRESS_FLOOR',{floor:0}));
    list.push(act('WAIT_FOR_FLOOR',{floor:0}));
    list.push(act('EXIT_ELEVATOR',{toFloor:0}));
    list.push(act('WALK_TO_WP',{floor:0, wpName:'lobby_center'}));
    list.push(act('WALK_TO_WP',{floor:0, wpName:'entrance'}));
    list.push(act('WALK_TO_WP',{floor:0, wpName:'front_door_threshold'}));
    list.push(act('WALK_TO_WP',{floor:0, wpName:'outside'}));
    list.push(act('EXIT_BUILDING',{}));
    return list;
}
function planVisitorVisit(ag){
    var r=Math.random();
    var list=[];
    list.push(act('WALK_TO_WP',{floor:0, wpName:'outside'}));
    list.push(act('WALK_TO_WP',{floor:0, wpName:'front_door_threshold'}));
    list.push(act('WALK_TO_WP',{floor:0, wpName:'entrance'}));
    list.push(act('WALK_TO_WP',{floor:0, wpName:'lobby_center'}));
    if(r<0.10){
        var b=pick(['bistro0','bistro1','bistro2','bistro3']);
        list.push(act('WALK_TO_WP',{floor:0, wpName:b}));
        list.push(act('SIT',{floor:0, wpName:b}));
        list.push(act('WAIT_SIM',{minutes: randInt(8,18)}));
        list.push(act('STAND',{}));
    } else if(r<0.16){
        list.push(act('WALK_TO_WP',{floor:0, wpName:'cafe_order'}));
        list.push(act('WAIT_SIM',{minutes: randInt(3,7)}));
    } else if(r<0.30){
        var l=pick(['lounge_spot0','lounge_spot1','lounge_spot2']);
        list.push(act('WALK_TO_WP',{floor:0, wpName:l}));
        list.push(act('SIT',{floor:0, wpName:l}));
        list.push(act('WAIT_SIM',{minutes: randInt(6,15)}));
        list.push(act('STAND',{}));
    } else if(r<0.42){
        var bl=pick(['back_lounge_N','back_lounge_S','pit_N','pit_S','pit_E','pit_W']);
        list.push(act('WALK_TO_WP',{floor:0, wpName:bl}));
        list.push(act('SIT',{floor:0, wpName:bl}));
        list.push(act('WAIT_SIM',{minutes: randInt(5,14)}));
        list.push(act('STAND',{}));
    } else if(r<0.52){
        var s=pick(['reception','kiosk','lobby_wc_front','lobby_wc_back']);
        list.push(act('WALK_TO_WP',{floor:0, wpName:s}));
        list.push(act('WAIT_SIM',{minutes: randInt(3,8)}));
    } else if(r<0.62){
        var lo=pick(['lobby_stand_center','lobby_stand_NE','lobby_stand_NW','lobby_stand_midE','lobby_stand_midW','lobby_stand_entry']);
        list.push(act('WALK_TO_WP',{floor:0, wpName:lo}));
        list.push(act('WAIT_SIM',{minutes: randInt(5,12)}));
    } else if(r<0.77){
        var fl=randInt(1,WORLD.FLOOR_COUNT-1);
        list.push(act('WAIT_AT_PANEL',{floor:0, dir:1, toFloor:fl}));
        list.push(act('ENTER_ELEVATOR',{toFloor:fl}));
        list.push(act('PRESS_FLOOR',{floor:fl}));
        list.push(act('WAIT_FOR_FLOOR',{floor:fl}));
        list.push(act('EXIT_ELEVATOR',{toFloor:fl}));
        var spots=['lounge_spot0','lounge_spot1','lounge_spot2','water_cooler','hall_stand_N','hall_stand_S'];
        var sp=pick(spots);
        if(sp.indexOf('lounge_spot')!==-1){
            list.push(act('WALK_TO_WP',{floor:fl, wpName:'lounge_door'}));
            list.push(act('WALK_TO_WP',{floor:fl, wpName:sp}));
            list.push(act('SIT',{floor:fl, wpName:sp}));
            list.push(act('WAIT_SIM',{minutes: randInt(6,14)}));
            list.push(act('STAND',{}));
        } else {
            list.push(act('WALK_TO_WP',{floor:fl, wpName:sp}));
            list.push(act('WAIT_SIM',{minutes: randInt(5,12)}));
        }
        list.push(act('WALK_TO_WP',{floor:fl, wpName:'elevWait'}));
        list.push(act('WAIT_AT_PANEL',{floor:fl, dir:-1, toFloor:0}));
        list.push(act('ENTER_ELEVATOR',{toFloor:0}));
        list.push(act('PRESS_FLOOR',{floor:0}));
        list.push(act('WAIT_FOR_FLOOR',{floor:0}));
        list.push(act('EXIT_ELEVATOR',{toFloor:0}));
    } else {
        var mfl=randInt(1,WORLD.FLOOR_COUNT-1);
        var seat=reserveConfSeat(mfl);
        if(seat){
            ag.reservedSeatKey=mfl+':'+seat;
            list.push(act('WAIT_AT_PANEL',{floor:0, dir:1, toFloor:mfl}));
            list.push(act('ENTER_ELEVATOR',{toFloor:mfl}));
            list.push(act('PRESS_FLOOR',{floor:mfl}));
            list.push(act('WAIT_FOR_FLOOR',{floor:mfl}));
            list.push(act('EXIT_ELEVATOR',{toFloor:mfl}));
            list.push(act('WALK_TO_WP',{floor:mfl, wpName:'conf_door'}));
            list.push(act('WALK_TO_WP',{floor:mfl, wpName:seat}));
            list.push(act('SIT',{floor:mfl, wpName:seat}));
            list.push(act('ENTER_STATE',{state:'IN_MEETING'}));
            list.push(act('WAIT_SIM',{minutes: randInt(12,25)}));
            list.push(act('STAND',{}));
            list.push(act('RELEASE_SEAT',{key:mfl+':'+seat}));
            list.push(act('WALK_TO_WP',{floor:mfl, wpName:'elevWait'}));
            list.push(act('WAIT_AT_PANEL',{floor:mfl, dir:-1, toFloor:0}));
            list.push(act('ENTER_ELEVATOR',{toFloor:0}));
            list.push(act('PRESS_FLOOR',{floor:0}));
            list.push(act('WAIT_FOR_FLOOR',{floor:0}));
            list.push(act('EXIT_ELEVATOR',{toFloor:0}));
        } else {
            var lo2=pick(['lobby_stand_center','lobby_stand_NE','lobby_stand_NW']);
            list.push(act('WALK_TO_WP',{floor:0, wpName:lo2}));
            list.push(act('WAIT_SIM',{minutes: randInt(5,12)}));
        }
    }
    list.push(act('WALK_TO_WP',{floor:0, wpName:'lobby_center'}));
    list.push(act('WALK_TO_WP',{floor:0, wpName:'entrance'}));
    list.push(act('WALK_TO_WP',{floor:0, wpName:'front_door_threshold'}));
    list.push(act('WALK_TO_WP',{floor:0, wpName:'outside'}));
    list.push(act('EXIT_BUILDING',{}));
    return list;
}

function chooseNextActivity(ag){
    if(Clock.simMinute >= ag.departureTime) return planLeaveBuilding(ag);
    for(var i=0;i<ag.plannedMeetingTimes.length;i++){
        if(Clock.simMinute >= ag.plannedMeetingTimes[i]){
            var mt=ag.plannedMeetingTimes.splice(i,1)[0];
            var mf=Math.random()<0.65? ag.homeFloor : randInt(1,WORLD.FLOOR_COUNT-1);
            var seat=reserveConfSeat(mf);
            if(seat){
                ag.reservedSeatKey=mf+':'+seat;
                return planAttendMeeting(ag,mf,seat);
            } else {
                return planVisitLounge(ag);
            }
        }
    }
    if(!ag.hasLunched && Clock.simMinute >= ag.lunchTime){
        return planGoToLunch(ag);
    }
    var r=Math.random();
    if(r<0.14){
        var mf2=Math.random()<0.65? ag.homeFloor : randInt(1,WORLD.FLOOR_COUNT-1);
        var seat2=reserveConfSeat(mf2);
        if(seat2){
            ag.reservedSeatKey=mf2+':'+seat2;
            return planAttendMeeting(ag,mf2,seat2);
        }
    }
    if(r<0.26) return planVisitLounge(ag);
    if(r<0.41) return planVisitCoworker(ag);
    // stay working
    return [act('WAIT_SIM',{minutes: randInt(18,65)}), act('PICK_NEXT_ACTIVITY',{})];
}

function ensureGroup(ag){
    if(ag.group) return;
    var colors=['#3a7bd5','#e74c3c','#27ae60','#f39c12','#8e44ad','#16a085'];
    var skinCols=['#e8c4a8','#d2a679','#c68642','#f0d0b0'];
    var legCols=['#2c3e50','#34495e','#1a1a1a','#3d2b1f'];
    ag.group=createPerson({bodyColor:pick(colors), skinColor:pick(skinCols), legColor:pick(legCols)});
    ag.group.userData.isSitting=false;
    ag.group.userData.isWalking=false;
}

function spawnAgent(ag){
    ensureGroup(ag);
    // jitter around outside
    var jx=(Math.random()-0.5)*2.2, jz=(Math.random()-0.5)*1.5;
    var startPos=world.floors[0].nodes['outside'].clone();
    startPos.x+=jx; startPos.z+=jz;
    ag.group.position.copy(startPos);
    ag.group.position.y=0;
    scene.add(ag.group);
    ag.currentFloor=0;
    if(ag.role==='VISITOR'){
        ag.plan=planVisitorVisit(ag);
        ag.state='VISITING';
    } else {
        ag.plan=planArriveToDesk(ag);
        ag.state='ARRIVING';
    }
    ag.currentAction=null;
}

var actionHandlers={
    'WALK_TO_WP':{
        start:function(ag,act){
            var nodes=world.floors[act.floor].nodes;
            var fromPos=ag.group.position.clone();
            // find nearest node to current pos? Use BFS from current nearest node
            // find closest node name
            var best=null, bestD=1e9;
            for(var k in nodes){ if(k==='_links') continue; var v=nodes[k]; if(Math.abs(v.y - ag.group.position.y)>1.2) continue; var d=v.distanceTo(fromPos); if(d<bestD){ bestD=d; best=k; }}
            if(!best) best='elevWait';
            // BFS
            var path=bfsPath(nodes,best,act.wpName);
            if(path.length===0) path=[nodes[act.wpName].clone()];
            // ensure path starts from current pos: prepend current
            ag.walkPath=path;
            ag.walkIdx=0;
            ag._prevWp=null; ag._stallT=0;
            ag.group.userData.isWalking=true;
        },
        tick:function(ag,act,dt, motionDt){
            if(ag.walkIdx>=ag.walkPath.length){
                ag.group.userData.isWalking=false;
                // snap y to floor
                ag.group.position.y=act.floor*WORLD.FLOOR_HEIGHT;
                ag.currentFloor=act.floor;
                return true;
            }
            var target=ag.walkPath[ag.walkIdx];
            var pos=ag.group.position;
            var dx=target.x-pos.x, dz=target.z-pos.z, dy=target.y-pos.y;
            var dist=Math.sqrt(dx*dx+dz*dz+dy*dy*0.2);
            if(dist<0.12){
                ag.walkIdx++;
                ag._prevWp=null; ag._stallT=0;
                return ag.walkIdx>=ag.walkPath.length;
            }
            var speed=1.3;
            var step=speed*motionDt;
            // entrance exemption from collision handled elsewhere
            var len=Math.sqrt(dx*dx+dz*dz);
            if(len>0){
                var nx=dx/len, nz=dz/len;
                var mv=Math.min(step, len);
                // face direction
                ag.group.rotation.y=Math.atan2(nx,nz);
                var newX=pos.x+nx*mv, newZ=pos.z+nz*mv;
                var newY=pos.y;
                // interpolate y slightly
                if(Math.abs(dy)>0.01) newY+= Math.sign(dy)*Math.min(Math.abs(dy), step);
                var prevDist=dist;
                pos.set(newX,newY,newZ);
                var ndx=target.x-pos.x, ndz=target.z-pos.z;
                var nDist=Math.sqrt(ndx*ndx+ndz*ndz);
                if(!ag._prevWp) ag._prevWp=prevDist;
                if(nDist >= ag._prevWp -0.005){
                    ag._stallT+=motionDt;
                    if(ag._stallT>1.2){ ag.walkIdx++; ag._stallT=0; ag._prevWp=null; }
                } else {
                    ag._stallT=0; ag._prevWp=nDist;
                }
                // front door stall recovery
                if((act.wpName==='front_door_threshold'||act.wpName==='entrance') && ag._stallT>1.5){
                    ag.group.position.copy(target);
                    ag.walkIdx++;
                }
            }
            return false;
        }
    },
    'WAIT_AT_PANEL':{
        start:function(ag,act){
            var dir=act.dir;
            if(dir===1) elevator.callUp(act.floor); else elevator.callDown(act.floor);
        },
        tick:function(ag,act,dt){
            var dir=act.dir;
            if(dir===1) elevator.callUp(act.floor); else elevator.callDown(act.floor);
            if(elevator.logic.state==='DOOR_OPEN' && elevator.logic.currentFloor===act.floor && elevator.currentCapacityFree()>0){
                if(elevator.isAcceptingAt(act.floor, dir)) return true;
            }
            return false;
        }
    },
    'ENTER_ELEVATOR':{
        start:function(ag,act){
            ag._enterPhase='reserve';
            ag._prevWalk=null; ag._stallWalkT=0;
        },
        tick:function(ag,act,dt,motionDt){
            if(ag._enterPhase==='reserve'){
                if(elevator.logic.state!=='DOOR_OPEN' || elevator.logic.currentFloor!==ag.currentFloor){
                    // re-call
                    // need direction
                    if(act.toFloor>ag.currentFloor) elevator.callUp(ag.currentFloor); else elevator.callDown(ag.currentFloor);
                    return false;
                }
                var spot=elevator.reserveBoardingSpot(ag.group);
                if(!spot){
                    // full
                    if(act.toFloor>ag.currentFloor) elevator.callUp(ag.currentFloor); else elevator.callDown(ag.currentFloor);
                    return false;
                }
                ag._spot=spot;
                ag._enterPhase='walkToDoor';
                ag.group.userData.isWalking=true;
            }
            if(ag._enterPhase==='walkToDoor'){
                var worldDoor=new THREE.Vector3(ag._spot.x, ag.group.position.y, 1.8);
                var dx=worldDoor.x-ag.group.position.x, dz=worldDoor.z-ag.group.position.z;
                var dist=Math.sqrt(dx*dx+dz*dz);
                if(dist<0.15){
                    // reparent to car
                    var worldPos=ag.group.position.clone();
                    // preserve world pos via attach
                    elevator.carGroup.attach(ag.group);
                    // after attach, position is in car local; move to spot later
                    ag._enterPhase='walkInside';
                    ag._prevWalk=null; ag._stallWalkT=0;
                    return false;
                }
                var speed=1.3;
                var step=speed*motionDt;
                var len=Math.sqrt(dx*dx+dz*dz);
                if(len>0){
                    var nx=dx/len, nz=dz/len;
                    var mv=Math.min(step,len);
                    ag.group.rotation.y=Math.atan2(nx,nz);
                    var before=dist;
                    ag.group.position.x+=nx*mv;
                    ag.group.position.z+=nz*mv;
                    var after=Math.sqrt((worldDoor.x-ag.group.position.x)**2 + (worldDoor.z-ag.group.position.z)**2);
                    if(!ag._prevWalk) ag._prevWalk=before;
                    if(after >= ag._prevWalk -0.005){
                        ag._stallWalkT+=motionDt;
                        if(ag._stallWalkT>1.5){
                            ag.group.position.copy(worldDoor);
                            elevator.carGroup.attach(ag.group);
                            ag._enterPhase='walkInside';
                            ag._stallWalkT=0;
                        }
                    } else { ag._stallWalkT=0; ag._prevWalk=after; }
                }
                return false;
            }
            if(ag._enterPhase==='walkInside'){
                var tx=ag._spot.x, tz=ag._spot.z;
                var dx2=tx-ag.group.position.x, dz2=tz-ag.group.position.z;
                var dist2=Math.sqrt(dx2*dx2+dz2*dz2);
                if(dist2<0.06){
                    elevator.completeBoard(ag.group);
                    ag.group.rotation.y=0;
                    ag.group.userData.isWalking=false;
                    ag.insideCar=true;
                    ag.currentFloor=act.toFloor; // will update on exit
                    return true;
                }
                var speed2=1.0;
                var step2=speed2*motionDt;
                var len2=Math.sqrt(dx2*dx2+dz2*dz2);
                if(len2>0){
                    var nx2=dx2/len2, nz2=dz2/len2;
                    var mv2=Math.min(step2,len2);
                    ag.group.position.x+=nx2*mv2;
                    ag.group.position.z+=nz2*mv2;
                    ag.group.rotation.y=Math.atan2(nx2,nz2);
                }
                return false;
            }
            return false;
        }
    },
    'PRESS_FLOOR':{
        start:function(ag,act){ elevator.pressDestination(act.floor); },
        tick:function(){ return true; }
    },
    'WAIT_FOR_FLOOR':{
        tick:function(ag,act){
            if(elevator.logic.state==='DOOR_OPEN' && elevator.logic.currentFloor===act.floor) return true;
            return false;
        }
    },
    'EXIT_ELEVATOR':{
        start:function(ag,act){
            elevator.registerDisembark(ag.group);
            ag._exitPhase='walkOut';
            ag.group.userData.isWalking=true;
        },
        tick:function(ag,act,dt,motionDt){
            if(ag._exitPhase==='walkOut'){
                // walk to door threshold in car local
                var doorPos=new THREE.Vector3(0, ag.group.position.y, 1.8);
                // if still inside car, walk to door
                var dx=doorPos.x-ag.group.position.x, dz=doorPos.z-ag.group.position.z;
                var dist=Math.sqrt(dx*dx+dz*dz);
                if(dist<0.12){
                    // reparent to scene
                    var wpY=act.toFloor*WORLD.FLOOR_HEIGHT;
                    // scene.attach preserves world pos
                    scene.attach(ag.group);
                    ag.group.position.y=wpY;
                    ag.insideCar=false;
                    // walk to elevWait
                    var waitPos=world.floors[act.toFloor].nodes['elevWait'];
                    ag._exitPhase='walkToWait';
                    return false;
                }
                var step=1.0*motionDt;
                var len=Math.sqrt(dx*dx+dz*dz);
                if(len>0){
                    var nx=dx/len, nz=dz/len;
                    ag.group.position.x+=nx*Math.min(step,len);
                    ag.group.position.z+=nz*Math.min(step,len);
                }
                return false;
            }
            if(ag._exitPhase==='walkToWait'){
                var target=world.floors[act.toFloor].nodes['elevWait'];
                var dx2=target.x-ag.group.position.x, dz2=target.z-ag.group.position.z;
                var dist2=Math.sqrt(dx2*dx2+dz2*dz2);
                if(dist2<0.12){
                    elevator.completeDisembark(ag.group);
                    ag.currentFloor=act.toFloor;
                    ag.group.position.y=act.toFloor*WORLD.FLOOR_HEIGHT;
                    ag.group.userData.isWalking=false;
                    return true;
                }
                var step2=1.3*motionDt;
                var len2=Math.sqrt(dx2*dx2+dz2*dz2);
                if(len2>0){
                    var nx2=dx2/len2, nz2=dz2/len2;
                    ag.group.position.x+=nx2*Math.min(step2,len2);
                    ag.group.position.z+=nz2*Math.min(step2,len2);
                    ag.group.rotation.y=Math.atan2(nx2,nz2);
                }
                return false;
            }
            return false;
        }
    },
    'SIT':{
        start:function(ag,act){
            var fl=world.floors[act.floor];
            var pos=fl.nodes[act.wpName];
            if(pos){
                var targetPos=pos.clone();
                var t=fl.sitTargets[act.wpName];
                if(t && !t.sit){
                    var ang=Math.random()*Math.PI*2;
                    var r=0.35+Math.random()*0.4;
                    targetPos.x+=Math.cos(ang)*r;
                    targetPos.z+=Math.sin(ang)*r;
                }
                ag.group.position.copy(targetPos);
                ag.group.position.y=act.floor*WORLD.FLOOR_HEIGHT;
                if(t){
                    ag.group.rotation.y=t.facing;
                    if(t.sit){
                        ag.group.userData.isSitting=true;
                        ag.group.position.y-=0.35;
                    } else {
                        ag.group.userData.isSitting=false;
                    }
                }
            }
            ag.group.userData.isWalking=false;
        },
        tick:function(){ return true; }
    },
    'STAND':{
        start:function(ag){
            if(ag.group.userData.isSitting){
                ag.group.userData.isSitting=false;
                // restore y
                // find current floor y
                var curY=ag.currentFloor*WORLD.FLOOR_HEIGHT;
                // if not inside car
                if(!ag.insideCar) ag.group.position.y=curY;
            }
            ag.group.userData.isWalking=false;
        },
        tick:function(){ return true; }
    },
    'RELEASE_SEAT':{
        start:function(ag,act){ releaseSeatKey(act.key); if(ag.reservedSeatKey===act.key) ag.reservedSeatKey=null; },
        tick:function(){ return true; }
    },
    'WAIT_SIM':{
        start:function(ag,act){ act.untilMin=Clock.simMinute+act.minutes; },
        tick:function(ag,act){ return Clock.simMinute >= act.untilMin; }
    },
    'EXIT_BUILDING':{
        start:function(ag){
            if(ag.group && ag.group.parent) ag.group.parent.remove(ag.group);
            ag.group=null;
            ag.state='GONE';
            if(ag.reservedSeatKey){ releaseSeatKey(ag.reservedSeatKey); ag.reservedSeatKey=null; }
        },
        tick:function(){ return true; }
    },
    'ENTER_STATE':{
        start:function(ag,act){ ag.state=act.state; },
        tick:function(){ return true; }
    },
    'MARK_LUNCHED':{
        start:function(ag){ ag.hasLunched=true; },
        tick:function(){ return true; }
    },
    'PICK_NEXT_ACTIVITY':{
        start:function(ag){
            var next=chooseNextActivity(ag);
            // prepend next plan after current action completes: insert at front of plan queue
            ag.plan = next.concat(ag.plan);
        },
        tick:function(){ return true; }
    }
};

function dispatchAgent(ag, motionDt, realDt){
    if(ag.state==='DISABLED' || ag.state==='GONE') return;
    // spawn if AWAY
    if(ag.state==='AWAY' && Clock.simMinute >= ag.arrivalTime){
        spawnAgent(ag);
    }
    if(ag.state==='AWAY' || ag.state==='DISABLED' || ag.state==='GONE') return;
    // if past departure and not already leaving
    if(ag.role==='WORKER' && Clock.simMinute >= ag.departureTime && ag.state!=='LEAVING' && ag.plan.length>0 && ag.plan[0].type!=='WALK_TO_WP'){
        // check if not already heading home (plan contains EXIT_BUILDING)
        var hasExit=ag.plan.some(function(a){return a.type==='EXIT_BUILDING';});
        if(!hasExit){
            // override plan to leave
            if(ag.reservedSeatKey){ releaseSeatKey(ag.reservedSeatKey); ag.reservedSeatKey=null; }
            ag.plan=planLeaveBuilding(ag);
            ag.currentAction=null;
            ag.state='LEAVING';
        }
    }
    var iter=0;
    while(iter<16){
        iter++;
        if(!ag.currentAction){
            if(ag.plan.length===0) break;
            ag.currentAction=ag.plan.shift();
            var h=actionHandlers[ag.currentAction.type];
            if(h && h.start) h.start(ag, ag.currentAction, realDt);
            // if zero-duration, try to tick immediately
            if(h && !h.tick) { ag.currentAction=null; continue; }
        }
        var handler=actionHandlers[ag.currentAction.type];
        if(!handler || !handler.tick){ ag.currentAction=null; continue; }
        var done=handler.tick(ag, ag.currentAction, realDt, motionDt);
        if(done){
            ag.currentAction=null;
            continue;
        } else {
            break;
        }
    }
}

function applyCollisions(){
    var movers=agents.filter(function(a){return a.group && a.group.parent;});
    for(var i=0;i<movers.length;i++){
        for(var j=i+1;j<movers.length;j++){
            var a=movers[i], b=movers[j];
            if(a.group.userData.isSitting || b.group.userData.isSitting) continue;
            if(a.insideCar || b.insideCar) continue;
            if(a.group.parent!==b.group.parent) continue;
            if(Math.abs(a.group.position.y - b.group.position.y)>1.0) continue;
            // boarders exemption
            if(a.currentAction && a.currentAction.type==='ENTER_ELEVATOR') continue;
            if(b.currentAction && b.currentAction.type==='ENTER_ELEVATOR') continue;
            // entrance chain exemption until past threshold
            var aEntrance = a.currentAction && a.currentAction.type==='WALK_TO_WP' && (a.currentAction.wpName==='outside'||a.currentAction.wpName==='front_door_threshold'||a.currentAction.wpName==='entrance');
            var bEntrance = b.currentAction && b.currentAction.type==='WALK_TO_WP' && (b.currentAction.wpName==='outside'||b.currentAction.wpName==='front_door_threshold'||b.currentAction.wpName==='entrance');
            if(aEntrance || bEntrance) continue;
            var dx=a.group.position.x-b.group.position.x;
            var dz=a.group.position.z-b.group.position.z;
            var d=Math.sqrt(dx*dx+dz*dz);
            if(d<0.7){
                if(d<1e-3){ dx=(Math.random()-0.5); dz=(Math.random()-0.5); d=Math.sqrt(dx*dx+dz*dz); if(d<1e-3){dx=1;dz=0;d=1;} }
                var push=(0.7-d)*0.18;
                var nx=dx/d, nz=dz/d;
                a.group.position.x+=nx*push;
                a.group.position.z+=nz*push;
                b.group.position.x-=nx*push;
                b.group.position.z-=nz*push;
            }
        }
    }
}

function updateHUD(){
    document.getElementById('clockDisplay').textContent=Clock.format();
    var counts={};
    for(var i=0;i<agents.length;i++){ var s=agents[i].state; counts[s]=(counts[s]||0)+1; }
    var parts=[];
    for(var k in counts) parts.push(k+':'+counts[k]);
    var elevInfo='Floor '+elevator.currentFloor+' '+elevator.state+' dir '+(elevator.direction>0?'up':elevator.direction<0?'down':'idle')+' pax '+elevator.passengers.size+' dest ['+Array.from(elevator.destinations).join(',')+'] up ['+Array.from(elevator.upCalls).join(',')+'] down ['+Array.from(elevator.downCalls).join(',')+']';
    document.getElementById('stats').innerHTML=parts.join(' | ')+'<br>'+elevInfo;
}

function updateDayNight(){
    var m=Clock.simMinute%1440;
    var t=m/60;
    var bg, sunC, sunI, ambI, hemiI;
    // keyframes: 0 night, 6 dawn, 6.5 day, 17.5 day, 18.5 dusk, 24 night
    function lerp(a,b,f){ return a+(b-a)*f; }
    function hexLerp(c1,c2,f){
        var r1=(c1>>16)&255, g1=(c1>>8)&255, b1=c1&255;
        var r2=(c2>>16)&255, g2=(c2>>8)&255, b2=c2&255;
        var r=Math.round(lerp(r1,r2,f)), g=Math.round(lerp(g1,g2,f)), b=Math.round(lerp(b1,b2,f));
        return (r<<16)|(g<<8)|b;
    }
    var bgDay=0x87ceeb, bgNight=0x0a1020, bgDawn=0xff9966;
    var sunDay=0xffffff, sunDawn=0xffaa55, sunNight=0x556080;
    if(t<6){ bg=bgNight; sunC=sunNight; sunI=0.2; ambI=0.45; hemiI=0.32; }
    else if(t<6.5){ var f=(t-6)/0.5; bg=hexLerp(bgNight,bgDay,f); sunC=hexLerp(sunNight,sunDay,f); sunI=lerp(0.2,0.9,f); ambI=lerp(0.45,0.6,f); hemiI=lerp(0.32,0.5,f); }
    else if(t<17.5){ bg=bgDay; sunC=sunDay; sunI=0.9; ambI=0.6; hemiI=0.5; }
    else if(t<18.5){ var f2=(t-17.5)/1.0; bg=hexLerp(bgDay,bgNight,f2); sunC=hexLerp(sunDay,sunNight,f2); sunI=lerp(0.9,0.25,f2); ambI=lerp(0.6,0.45,f2); hemiI=lerp(0.5,0.32,f2); }
    else { bg=bgNight; sunC=sunNight; sunI=0.25; ambI=0.45; hemiI=0.32; }
    scene.background=new THREE.Color(bg);
    // update lights
    scene.traverse(function(obj){
        if(obj.isDirectionalLight) { obj.color.setHex(sunC); obj.intensity=sunI; }
        if(obj.isAmbientLight) obj.intensity=ambI;
        if(obj.isHemisphereLight) obj.intensity=hemiI;
    });
}

function startSimulation(){
    scene=new THREE.Scene();
    scene.background=new THREE.Color(0x20242a);
    camera=new THREE.PerspectiveCamera(60, window.innerWidth/window.innerHeight, 0.1, 1000);
    camera.position.set(28,24,28);
    renderer=new THREE.WebGLRenderer({antialias:true, alpha:true});
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.sortObjects=true;
    document.body.appendChild(renderer.domElement);
    controls=new THREE.OrbitControls(camera, renderer.domElement);
    controls.target.set(0,6,0);
    scene.add(new THREE.AmbientLight(0xffffff,0.45));
    scene.add(new THREE.HemisphereLight(0xbfd7ff,0x303020,0.45));
    var sun=new THREE.DirectionalLight(0xffffff,0.9);
    sun.position.set(20,35,18);
    scene.add(sun);
    world=createWorld(scene);
    elevator=new Elevator(scene, world);
    createAgents();
    Clock.lastReal=performance.now();
    // sliders
    var speedSlider=document.getElementById('speedSlider');
    var occSlider=document.getElementById('occSlider');
    var speedStops=[1,5,15,60,120,300,600];
    speedSlider.addEventListener('input',function(e){
        var idx=parseInt(e.target.value,10);
        Clock.timeScale=speedStops[idx];
        document.getElementById('speedVal').textContent=Clock.timeScale+'x';
    });
    Clock.timeScale=speedStops[parseInt(speedSlider.value,10)];
    document.getElementById('speedVal').textContent=Clock.timeScale+'x';
    occSlider.addEventListener('input',function(e){
        targetOccupancy=parseInt(e.target.value,10);
        document.getElementById('occVal').textContent=targetOccupancy+' / 100';
        applyOccupancy();
    });
    document.getElementById('occVal').textContent=targetOccupancy+' / 100';
    applyOccupancy();

    window.addEventListener('resize',function(){ camera.aspect=window.innerWidth/window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); });

    function animate(){
        requestAnimationFrame(animate);
        var realDt=Math.min(0.05, Clock.getDelta());
        Clock.tick(realDt);
        updateDayNight();
        var motionDt=realDt*Clock.timeScale;
        elevator.tick(motionDt);
        topUpVisitors();
        for(var i=0;i<agents.length;i++) dispatchAgent(agents[i], motionDt, realDt);
        applyCollisions();
        for(var j=0;j<agents.length;j++){
            var ag2=agents[j];
            if(ag2.group && ag2.group.parent) animatePersonWalking(ag2.group, motionDt);
        }
        controls.update();
        renderer.render(scene,camera);
        updateHUD();
    }
    animate();
}

if(document.readyState==='loading'){
    window.addEventListener('DOMContentLoaded', startSimulation);
} else {
    startSimulation();
}
