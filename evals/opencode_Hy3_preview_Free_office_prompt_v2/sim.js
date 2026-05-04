// Sim.js - Main simulation loop
let scene, camera, renderer, controls, clock, elevator, world;
let agents = [];
const MAX_WORKERS = 20;
const MAX_VISITORS = 80;
const MAX_OCCUPANCY = 100;
let targetOccupancy = 45;
let simClock, timeScale = 120;

// Initialize
function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color('#222233');

    camera = new THREE.PerspectiveCamera(60, window.innerWidth/window.innerHeight, 0.1, 1000);
    camera.position.set(28, 24, 28);
    camera.lookAt(0, WORLD.FLOOR_HEIGHT * 2, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.sortObjects = true;
    document.body.appendChild(renderer.domElement);

    controls = new THREE.OrbitControls(camera, renderer.domElement);

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const sun = new THREE.DirectionalLight(0xffffff, 0.8);
    sun.position.set(50, 50, 50);
    scene.add(sun);
    scene.add(new THREE.HemisphereLight(0x87ceeb, 0x444444, 0.3));

    // Create world and elevator
    world = createWorld(scene);
    elevator = new Elevator(scene, world);

    // Init clock
    simClock = {
        simMinute: 7*60 + 30, // 7:30 AM
        timeScale: timeScale,
        tick: function(realDt) {
            realDt = Math.min(realDt, 0.05);
            this.simMinute += realDt * this.timeScale / 60;
            if (this.simMinute >= 24*60) {
                this.simMinute -= 24*60;
                this._resetDay();
            }
        },
        format: function() {
            const total = Math.floor(this.simMinute);
            const h = Math.floor(total / 60) % 24;
            const m = total % 60;
            const ampm = h >=12 ? 'PM' : 'AM';
            const h12 = h %12 ===0 ? 12 : h%12;
            return ` ${h12}:${m <10 ? '0'+m : m} ${ampm}`;
        },
        _resetDay: function() {
            agents.forEach(a => {
                if (a.state !== 'DISABLED') {
                    a.state = 'AWAY';
                    a.plan = [];
                    a.currentAction = null;
                    a.hasLunched = false;
                    a.arrivalTime = 8*60 + 15 + Math.random() * 75; // 8:15-9:30
                    a.lunchTime = 11*60 + 30 + Math.random() * 120; // 11:30-13:30
                    a.lunchDuration = 25 + Math.random() * 35; // 25-60m
                    a.departureTime = 16*60 + 45 + Math.random() * 105; // 16:45-18:30
                    if (Math.random() < 0.15) a.departureTime += 60 + Math.random()*75; // stragglers
                    a.plannedMeetingTimes = [];
                    if (Math.random() < 0.3) a.plannedMeetingTimes.push(9*60 + Math.random()*180);
                    if (Math.random() < 0.3) a.plannedMeetingTimes.push(13*60 + Math.random()*180);
                }
            });
            elevator.reset();
        }
    };

    // Create agents
    createAgents();
    // UI
    createUI();

    // Start render loop
    const clock = new THREE.Clock();
    function animate() {
        requestAnimationFrame(animate);
        const realDt = Math.min(clock.getDelta(), 0.05);
        // Update clock
        simClock.tick(realDt);
        // Update lighting
        updateLighting();
        // Update elevator
        const motionDt = realDt * simClock.timeScale;
        elevator.tick(motionDt);
        // Update agents
        updateAgents(motionDt);
        // Collisions
        applyCollisions();
        // Animate people
        agents.forEach(a => {
            if (a.group.parent) animatePersonWalking(a.group, motionDt);
        });
        // Render
        controls.update();
        renderer.render(scene, camera);
        updateHUD();
    }
    animate();
}

function createAgents() {
    const firstNames = ['Alex','Sam','Jordan','Taylor','Morgan','Casey','Riley','Quinn','Avery','Charlie','Drew','Skyler','Dakota','Parker','Emerson','Reese','Sage','Hayden','Cameron','Logan'];
    // Workers (20)
    for (let i=0; i<MAX_WORKERS; i++) {
        const desk = world.floors[i%5 +1].desks[i%4];
        const agent = {
            id: i, role: 'WORKER', name: firstNames[i % firstNames.length],
            homeFloor: i%5 +1, deskId: desk.id,
            deskWpName: desk.deskWp, doorWpName: desk.doorWp,
            state: 'DISABLED', plan: [], currentAction: null,
            group: createPerson(), hasLunched: false,
            arrivalTime: 8*60+15 + Math.random()*75,
            lunchTime: 11*60+30 + Math.random()*120,
            lunchDuration: 25 + Math.random()*35,
            departureTime: 16*60+45 + Math.random()*105,
            plannedMeetingTimes: [], seatReservation: null
        };
        if (Math.random() <0.15) agent.departureTime +=60 + Math.random()*75;
        if (Math.random() <0.3) agent.plannedMeetingTimes.push(9*60 + Math.random()*180);
        if (Math.random() <0.3) agent.plannedMeetingTimes.push(13*60 + Math.random()*180);
        agent.group.userData.agent = agent;
        scene.add(agent.group);
        agents.push(agent);
    }
    // Visitors (80)
    for (let i=MAX_WORKERS; i<MAX_OCCUPANCY; i++) {
        const agent = {
            id: i, role: 'VISITOR', name: firstNames[Math.floor(Math.random()*firstNames.length)],
            state: 'DISABLED', plan: [], currentAction: null,
            group: createPerson(), hasLunched: false,
            arrivalTime: 8*60+15 + Math.random()*75,
            visitDuration: 30 + Math.random()*90,
            seatReservation: null
        };
        agent.group.userData.agent = agent;
        scene.add(agent.group);
        agents.push(agent);
    }
    applyOccupancy();
}

function applyOccupancy() {
    agents.forEach((a, i) => {
        if (i < targetOccupancy && a.state === 'DISABLED') {
            a.state = 'AWAY';
            a.group.visible = true;
        } else if (i >= targetOccupancy && a.state !== 'DISABLED') {
            a.state = 'DISABLED';
            a.group.visible = false;
            a.plan = [];
            a.currentAction = null;
        }
    });
}

function topUpVisitors() {
    if (simClock.simMinute < 8*60 || simClock.simMinute > 18*60) return;
    const present = agents.filter(a => a.state !== 'DISABLED' && a.state !== 'GONE' && a.group.parent).length;
    if (present >= targetOccupancy) return;
    const deficit = targetOccupancy - present;
    let added =0;
    for (const a of agents) {
        if (a.role !== 'VISITOR') continue;
        if (a.state === 'AWAY' || a.state === 'GONE') {
            a.arrivalTime = simClock.simMinute + Math.random()*6;
            a.visitDuration = 30 + Math.random()*90;
            a.state = 'AWAY';
            a.group.visible = true;
            if (++added >= deficit) break;
        }
    }
}

function updateAgents(dt) {
    topUpVisitors();
    agents.forEach(agent => {
        if (agent.state === 'DISABLED' || agent.state === 'GONE') return;
        // Check if arrived
        if (agent.state === 'AWAY' && simClock.simMinute >= agent.arrivalTime) {
            agent.state = 'ARRIVING';
            agent.plan = planArrive(agent);
            agent.currentAction = null;
        }
        // Check departure
        if (agent.role === 'WORKER' && agent.state !== 'LEAVING' && simClock.simMinute >= agent.departureTime) {
            agent.plan = [].concat(planLeaveBuilding(agent));
            agent.currentAction = null;
        }
        // Process actions (loop for zero-duration)
        for (let i=0; i<16; i++) {
            if (!agent.currentAction && agent.plan.length >0) {
                agent.currentAction = agent.plan.shift();
                startAction(agent, dt);
            }
            if (!agent.currentAction) break;
            const done = updateAction(agent, dt);
            if (done) {
                agent.currentAction = null;
                if (agent.plan.length ===0 && agent.state !== 'GONE') {
                    agent.plan = chooseNextActivity(agent);
                }
            } else {
                break;
            }
        }
    });
}

// Action handlers (simplified)
function startAction(agent, dt) {
    const action = agent.currentAction;
    if (!action) return;
    switch (action.type) {
        case 'WALK_TO_WP':
            const floorData = world.floors[action.floor];
            agent.path = bfsPath(floorData.nodes, action.fromWp, action.toWp);
            agent.pathIndex = 0;
            agent.group.userData.isWalking = true;
            break;
        case 'WAIT_AT_PANEL':
            agent.waitPanelFloor = action.floor;
            agent.waitPanelDir = action.dir;
            agent.waitPanelToFloor = action.toFloor;
            break;
        case 'ENTER_ELEVATOR':
            agent.enterToFloor = action.toFloor;
            break;
        case 'SIT':
            const sitTarget = world.floors[action.floor].sitTargets[action.wpName];
            if (sitTarget) {
                agent.group.position.copy(world.floors[action.floor].nodes[action.wpName].pos);
                agent.group.position.y -= 0.35;
                agent.group.rotation.y = sitTarget.facing;
                agent.group.userData.isSitting = true;
                agent.group.userData.isWalking = false;
            }
            break;
        case 'STAND':
            agent.group.userData.isSitting = false;
            agent.group.position.y = action.floor * WORLD.FLOOR_HEIGHT;
            break;
        case 'WAIT_SIM':
            action.untilMin = simClock.simMinute + action.minutes;
            break;
        case 'EXIT_BUILDING':
            scene.remove(agent.group);
            agent.state = 'GONE';
            break;
    }
}

function updateAction(agent, dt) {
    const action = agent.currentAction;
    if (!action) return true;
    switch (action.type) {
        case 'WALK_TO_WP':
            if (agent.pathIndex >= agent.path.length) return true;
            const target = agent.path[agent.pathIndex];
            const dx = target.x - agent.group.position.x;
            const dz = target.z - agent.group.position.z;
            const dist = Math.sqrt(dx*dx + dz*dz);
            if (dist < 0.1) {
                agent.pathIndex++;
                return agent.pathIndex >= agent.path.length;
            }
            const speed = 1.3 * (simClock.timeScale / 120); // scale with time
            const move = Math.min(speed * dt, dist);
            agent.group.position.x += (dx/dist) * move;
            agent.group.position.z += (dz/dist) * move;
            // Face direction
            agent.group.rotation.y = Math.atan2(dx, dz);
            return false;
        case 'WAIT_AT_PANEL':
            if (action.dir === 1) elevator.callUp(action.floor);
            else elevator.callDown(action.floor);
            if (elevator.isAcceptingAt(action.floor, action.dir) && elevator.currentCapacityFree() >0) {
                return true;
            }
            return false;
        case 'ENTER_ELEVATOR':
            if (!agent.spot) {
                agent.spot = elevator.reserveBoardingSpot(agent.id);
                if (!agent.spot) return false;
            }
            // Walk to door
            const doorPos = new THREE.Vector3(agent.spot.x, agent.group.position.y, WORLD.SHAFT_DEPTH/2 + 1.5);
            const dxe = doorPos.x - agent.group.position.x;
            const dze = doorPos.z - agent.group.position.z;
            const diste = Math.sqrt(dxe*dxe + dze*dze);
            if (diste > 0.1) {
                const speed = 1.3 * (simClock.timeScale/120);
                const move = Math.min(speed*dt, diste);
                agent.group.position.x += (dxe/diste)*move;
                agent.group.position.z += (dze/diste)*move;
                return false;
            }
            // Enter elevator
            elevator.completeBoard(agent.id);
            elevator.pressDestination(agent.enterToFloor);
            agent.group.position.set(agent.spot.x, agent.spot.y + elevator.group.position.y, agent.spot.z + elevator.group.position.z);
            agent.group.parent.remove(agent.group);
            elevator.group.add(agent.group);
            agent.group.rotation.y = 0;
            return true;
        case 'WAIT_FOR_FLOOR':
            if (elevator.logic.currentFloor === action.floor && elevator.logic.state === 'DOOR_OPEN') {
                return true;
            }
            return false;
        case 'EXIT_ELEVATOR':
            elevator.registerDisembark(agent.id, action.toFloor);
            agent.group.parent.remove(agent.group);
            scene.add(agent.group);
            agent.group.position.set(0, action.toFloor * WORLD.FLOOR_HEIGHT, WORLD.SHAFT_DEPTH/2 +1);
            elevator.completeDisembark(agent.id);
            return true;
        case 'STAND':
            agent.group.userData.isSitting = false;
            agent.group.position.y = action.floor * WORLD.FLOOR_HEIGHT;
            return true;
        case 'SIT':
            return true; // handled in startAction
        case 'WAIT_SIM':
            return simClock.simMinute >= action.untilMin;
        case 'EXIT_BUILDING':
            return true; // handled in startAction
        default:
            return true;
    }
}

function chooseNextActivity(agent) {
    if (agent.state === 'LEAVING') return planLeaveBuilding(agent);
    // Check meetings
    if (agent.plannedMeetingTimes.length >0) {
        const nextMeeting = agent.plannedMeetingTimes[0];
        if (simClock.simMinute >= nextMeeting) {
            agent.plannedMeetingTimes.shift();
            return planAttendMeeting(agent);
        }
    }
    // Lunch
    if (agent.role === 'WORKER' && !agent.hasLunched && simClock.simMinute >= agent.lunchTime) {
        return planGoToLunch(agent);
    }
    // Random activity
    const roll = Math.random();
    if (roll < 0.14) return planAttendMeeting(agent);
    if (roll < 0.26) return planVisitLounge(agent);
    if (roll < 0.41) return planVisitCoworker(agent);
    // Wait and loop
    return [{type: 'WAIT_SIM', minutes: 18 + Math.random()*47}, {type: 'ENTER_STATE', state: agent.state}, {type: 'PICK_NEXT_ACTIVITY'}];
}

// Simplified plan functions
function planArrive(agent) {
    const actions = [];
    actions.push({type: 'WALK_TO_WP', floor: 0, fromWp: 'outside', toWp: 'entrance'});
    actions.push({type: 'WALK_TO_WP', floor: 0, fromWp: 'entrance', toWp: 'elevWait'});
    actions.push({type: 'WAIT_AT_PANEL', floor: 0, dir: 1, toFloor: agent.homeFloor});
    actions.push({type: 'ENTER_ELEVATOR', toFloor: agent.homeFloor});
    actions.push({type: 'WAIT_FOR_FLOOR', floor: agent.homeFloor});
    actions.push({type: 'EXIT_ELEVATOR', toFloor: agent.homeFloor});
    actions.push({type: 'WALK_TO_WP', floor: agent.homeFloor, fromWp: 'elevWait', toWp: agent.doorWpName});
    actions.push({type: 'WALK_TO_WP', floor: agent.homeFloor, fromWp: agent.doorWpName, toWp: agent.deskWpName});
    actions.push({type: 'SIT', floor: agent.homeFloor, wpName: agent.deskWpName});
    actions.push({type: 'ENTER_STATE', state: 'AT_DESK'});
    actions.push({type: 'WAIT_SIM', minutes: 60 + Math.random()*120});
    actions.push({type: 'STAND'});
    actions.push({type: 'RELEASE_SEAT'});
    actions.push({type: 'PICK_NEXT_ACTIVITY'});
    return actions;
}

function planLeaveBuilding(agent) {
    const actions = [];
    actions.push({type: 'STAND'});
    actions.push({type: 'RELEASE_SEAT'});
    actions.push({type: 'WALK_TO_WP', floor: agent.homeFloor, fromWp: agent.deskWpName, toWp: 'elevWait'});
    actions.push({type: 'WAIT_AT_PANEL', floor: agent.homeFloor, dir: -1, toFloor: 0});
    actions.push({type: 'ENTER_ELEVATOR', toFloor: 0});
    actions.push({type: 'WAIT_FOR_FLOOR', floor: 0});
    actions.push({type: 'EXIT_ELEVATOR', toFloor: 0});
    actions.push({type: 'WALK_TO_WP', floor: 0, fromWp: 'elevWait', toWp: 'entrance'});
    actions.push({type: 'WALK_TO_WP', floor: 0, fromWp: 'entrance', toWp: 'outside'});
    actions.push({type: 'EXIT_BUILDING'});
    return actions;
}

function planGoToLunch(agent) {
    agent.hasLunched = true;
    const actions = [];
    actions.push({type: 'STAND'});
    actions.push({type: 'RELEASE_SEAT'});
    actions.push({type: 'WALK_TO_WP', floor: agent.homeFloor, fromWp: agent.deskWpName, toWp: 'elevWait'});
    actions.push({type: 'WAIT_AT_PANEL', floor: agent.homeFloor, dir: -1, toFloor: 0});
    actions.push({type: 'ENTER_ELEVATOR', toFloor: 0});
    actions.push({type: 'WAIT_FOR_FLOOR', floor: 0});
    actions.push({type: 'EXIT_ELEVATOR', toFloor: 0});
    // Sit at bistro
    actions.push({type: 'WALK_TO_WP', floor: 0, fromWp: 'elevWait', toWp: 'lobby_stand_center'});
    actions.push({type: 'SIT', floor: 0, wpName: 'lobby_stand_center'});
    actions.push({type: 'WAIT_SIM', minutes: agent.lunchDuration});
    actions.push({type: 'STAND'});
    actions.push({type: 'RELEASE_SEAT'});
    // Back to desk
    actions.push({type: 'WALK_TO_WP', floor: 0, fromWp: 'lobby_stand_center', toWp: 'elevWait'});
    actions.push({type: 'WAIT_AT_PANEL', floor: 0, dir: 1, toFloor: agent.homeFloor});
    actions.push({type: 'ENTER_ELEVATOR', toFloor: agent.homeFloor});
    actions.push({type: 'WAIT_FOR_FLOOR', floor: agent.homeFloor});
    actions.push({type: 'EXIT_ELEVATOR', toFloor: agent.homeFloor});
    actions.push({type: 'WALK_TO_WP', floor: agent.homeFloor, fromWp: 'elevWait', toWp: agent.doorWpName});
    actions.push({type: 'SIT', floor: agent.homeFloor, wpName: agent.deskWpName});
    actions.push({type: 'ENTER_STATE', state: 'AT_DESK'});
    actions.push({type: 'PICK_NEXT_ACTIVITY'});
    return actions;
}

function planVisitLounge(agent) {
    const actions = [];
    actions.push({type: 'STAND'});
    actions.push({type: 'RELEASE_SEAT'});
    actions.push({type: 'WALK_TO_WP', floor: agent.homeFloor, fromWp: agent.deskWpName, toWp: 'lounge_center'});
    actions.push({type: 'SIT', floor: agent.homeFloor, wpName: 'lounge_spot0'});
    actions.push({type: 'WAIT_SIM', minutes: 5 + Math.random()*7});
    actions.push({type: 'STAND'});
    actions.push({type: 'RELEASE_SEAT'});
    actions.push({type: 'WALK_TO_WP', floor: agent.homeFloor, fromWp: 'lounge_spot0', toWp: agent.deskWpName});
    actions.push({type: 'SIT', floor: agent.homeFloor, wpName: agent.deskWpName});
    actions.push({type: 'ENTER_STATE', state: 'AT_DESK'});
    actions.push({type: 'PICK_NEXT_ACTIVITY'});
    return actions;
}

function planAttendMeeting(agent) {
    const floor = Math.random() <0.65 ? agent.homeFloor : 1 + Math.floor(Math.random()*5);
    const seat = `conf_seat${Math.floor(Math.random()*4)}`;
    const actions = [];
    actions.push({type: 'STAND'});
    actions.push({type: 'RELEASE_SEAT'});
    actions.push({type: 'WALK_TO_WP', floor: agent.homeFloor, fromWp: agent.deskWpName, toWp: 'elevWait'});
    actions.push({type: 'WAIT_AT_PANEL', floor: agent.homeFloor, dir: floor > agent.homeFloor ? 1 : -1, toFloor: floor});
    actions.push({type: 'ENTER_ELEVATOR', toFloor: floor});
    actions.push({type: 'WAIT_FOR_FLOOR', floor: floor});
    actions.push({type: 'EXIT_ELEVATOR', toFloor: floor});
    actions.push({type: 'WALK_TO_WP', floor: floor, fromWp: 'elevWait', toWp: 'conf_center'});
    actions.push({type: 'SIT', floor: floor, wpName: seat});
    actions.push({type: 'WAIT_SIM', minutes: 22 + Math.random()*23});
    actions.push({type: 'STAND'});
    actions.push({type: 'RELEASE_SEAT'});
    actions.push({type: 'WALK_TO_WP', floor: floor, fromWp: seat, toWp: 'elevWait'});
    actions.push({type: 'WAIT_AT_PANEL', floor: floor, dir: floor > agent.homeFloor ? -1 : 1, toFloor: agent.homeFloor});
    actions.push({type: 'ENTER_ELEVATOR', toFloor: agent.homeFloor});
    actions.push({type: 'WAIT_FOR_FLOOR', floor: agent.homeFloor});
    actions.push({type: 'EXIT_ELEVATOR', toFloor: agent.homeFloor});
    actions.push({type: 'WALK_TO_WP', floor: agent.homeFloor, fromWp: 'elevWait', toWp: agent.deskWpName});
    actions.push({type: 'SIT', floor: agent.homeFloor, wpName: agent.deskWpName});
    actions.push({type: 'ENTER_STATE', state: 'AT_DESK'});
    actions.push({type: 'PICK_NEXT_ACTIVITY'});
    return actions;
}

function planVisitCoworker(agent) {
    // Simplified
    return planVisitLounge(agent);
}

// Collisions
function applyCollisions() {
    for (let i=0; i<agents.length; i++) {
        const a = agents[i];
        if (!a.group.parent || a.group.userData.isSitting || a.group.parent === elevator.group) continue;
        for (let j=i+1; j<agents.length; j++) {
            const b = agents[j];
            if (!b.group.parent || b.group.userData.isSitting || b.group.parent === elevator.group) continue;
            if (a.group.parent !== b.group.parent) continue;
            const dx = a.group.position.x - b.group.position.x;
            const dz = a.group.position.z - b.group.position.z;
            const dy = a.group.position.y - b.group.position.y;
            if (Math.abs(dy) >1 || (dx ===0 && dz ===0)) continue;
            const dist = Math.sqrt(dx*dx + dz*dz);
            if (dist < 0.7) {
                const push = 0.18 * (0.7 - dist) / dist;
                a.group.position.x += dx * push;
                a.group.position.z += dz * push;
                b.group.position.x -= dx * push;
                b.group.position.z -= dz * push;
            }
        }
    }
}

// Lighting
function updateLighting() {
    const t = simClock.simMinute;
    let bg, sunIntensity, ambIntensity, hemiIntensity;
    if (t < 6*60) { // Night
        bg = '#222233'; sunIntensity = 0.1; ambIntensity = 0.45; hemiIntensity = 0.32;
    } else if (t < 6*60 +30) { // Dawn
        const p = (t -6*60)/30;
        bg = new THREE.Color('#222233').lerp(new THREE.Color('#87ceeb'), p);
        sunIntensity = 0.1 + 0.7*p; ambIntensity = 0.45 + 0.05*p; hemiIntensity = 0.32 + 0.18*p;
    } else if (t < 17*60 +30) { // Day
        bg = '#87ceeb'; sunIntensity = 0.8; ambIntensity = 0.5; hemiIntensity = 0.5;
    } else if (t < 18*60 +30) { // Dusk
        const p = (t -17*60 -30)/60;
        bg = new THREE.Color('#87ceeb').lerp(new THREE.Color('#222233'), p);
        sunIntensity = 0.8 - 0.7*p; ambIntensity = 0.5 - 0.05*p; hemiIntensity = 0.5 - 0.18*p;
    } else { // Night
        bg = '#222233'; sunIntensity = 0.1; ambIntensity = 0.45; hemiIntensity = 0.32;
    }
    scene.background = typeof bg === 'string' ? new THREE.Color(bg) : bg;
    scene.children.forEach(c => {
        if (c instanceof THREE.AmbientLight) c.intensity = ambIntensity;
        if (c instanceof THREE.DirectionalLight) c.intensity = sunIntensity;
        if (c instanceof THREE.HemisphereLight) c.intensity = hemiIntensity;
    });
}

// UI
function createUI() {
    const hud = document.createElement('div');
    hud.style.cssText = `position:fixed;top:10px;left:10px;color:#fff;font-family:monospace;background:rgba(0,0,0,0.7);padding:10px;border-radius:5px;`;
    hud.innerHTML = `
        <div id="simTime" style="font-size:24px;margin-bottom:8px;"></div>
        <div>Speed: <input type="range" id="speedSlider" min="1" max="600" value="120" style="width:200px;">
            <span id="speedVal">120x</span>
        </div>
        <div>Occupancy: <input type="range" id="occSlider" min="1" max="100" value="45" style="width:200px;">
            <span id="occVal">45/100</span>
        </div>
        <div id="stateCounts" style="margin-top:8px;font-size:12px;"></div>
    `;
    document.body.appendChild(hud);

    document.getElementById('speedSlider').addEventListener('input', function() {
        timeScale = Number(this.value);
        simClock.timeScale = timeScale;
        document.getElementById('speedVal').textContent = timeScale + 'x';
    });

    document.getElementById('occSlider').addEventListener('input', function() {
        targetOccupancy = Number(this.value);
        document.getElementById('occVal').textContent = targetOccupancy + '/100';
        applyOccupancy();
    });
}

function updateHUD() {
    document.getElementById('simTime').textContent = simClock.format();
    const counts = {};
    agents.forEach(a => { counts[a.state] = (counts[a.state] || 0) +1; });
    let stateText = `Elevator: Floor ${elevator.logic.currentFloor}, ${elevator.logic.state}, Dir ${elevator.logic.direction}<br>`;
    stateText += `Passengers: ${elevator.logic.passengers.size}, Dest: ${Array.from(elevator.logic.destinations)}<br>`;
    stateText += Object.entries(counts).map(([s,c]) => `${s}: ${c}`).join('<br>');
    document.getElementById('stateCounts').innerHTML = stateText;
}

// Start
window.addEventListener('load', init);
