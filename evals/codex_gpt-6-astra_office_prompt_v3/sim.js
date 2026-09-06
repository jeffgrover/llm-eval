(function () {
    'use strict';
    const MAX_WORKERS = 20;
    const MAX_VISITORS = 80;
    const MAX_OCCUPANCY = MAX_WORKERS + MAX_VISITORS;
    const DEFAULT_OCCUPANCY = 45;
    const MEETING_PROB = 0.36;
    const rand = (low, high) => low + Math.random() * (high - low);
    const randInt = (low, high) => Math.floor(rand(low, high + 1));
    const pick = (items) => items[Math.floor(Math.random() * items.length)];
    const action = (type, fields = {}) => Object.assign({ type }, fields);
    const walk = (floor, wpName) => action('WALK_TO_WP', { floor, wpName });
    const wait = (minutes) => action('WAIT_SIM', { minutes });
    const state = (value) => action('ENTER_STATE', { state: value });
    class Clock {
        constructor(onNewDay) { this.simMinute = 7 * 60 + 30; this.timeScale = 120; this.day = 1; this.onNewDay = onNewDay; }
        tick(realDt) {
            this.simMinute += realDt * this.timeScale / 60;
            if (this.simMinute >= 1440) { this.simMinute %= 1440; this.day++; this.onNewDay(); }
        }
        format() {
            const hour = Math.floor(this.simMinute / 60) % 24;
            return String(hour % 12 || 12).padStart(2, ' ') + ':' + String(Math.floor(this.simMinute % 60)).padStart(2, '0') + (hour < 12 ? ' AM' : ' PM');
        }
    }
    function startSimulation() {
        THREE.ColorManagement.legacyMode = false;
        const scene = new THREE.Scene(); scene.background = new THREE.Color(0x20242a);
        const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.set(28, 24, 28);
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7)); renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.sortObjects = true; renderer.outputEncoding = THREE.sRGBEncoding;
        renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.85;
        document.body.appendChild(renderer.domElement);
        const controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.target.set(0, 8.3, 0); controls.enableDamping = true; controls.dampingFactor = 0.07;
        controls.minDistance = 7; controls.maxDistance = 85; controls.maxPolarAngle = Math.PI / 2 - 0.025; controls.update();
        const ambient = new THREE.AmbientLight(0xffffff, 0.45); scene.add(ambient);
        const hemi = new THREE.HemisphereLight(0xbfd7ff, 0x303020, 0.45); scene.add(hemi);
        const sun = new THREE.DirectionalLight(0xffffff, 0.9); sun.position.set(20, 35, 18); scene.add(sun);
        const world = window.createWorld(scene);
        const elevator = new window.Elevator(scene, world);
        const agents = [];
        const seatReservations = new Set();
        const queueSlots = world.floors.map(() => new Map());
        const recentEvents = [];
        const metrics = { arrivals: 0, exits: 0, boarded: 0, rides: 0, seatsChecked: 0, maxCarLoad: 0, entranceRecoveries: 0, doorRecoveries: 0 };
        let targetOccupancy = DEFAULT_OCCUPANCY;
        let paused = false;
        let floorView = 'all';
        let inspectedAgent = null;
        let hudTimer = 0;
        const simClock = new Clock(resetDay);
        const clock = new THREE.Clock();
        const names = ['Alex','Maya','Noah','Sofia','Eli','Zoe','Theo','Iris','Finn','Ada','Jude','Nina','Kai','Lena','Omar','Eva','Leo','Ruth','Sam','Milo','Rose','Ari','Remy','Isla','Ben','Tess','Drew','Jules','Lucy','Cole','Asha','Ren','Bea','Max','Nico','Liv','Sage','Inez','Hugo','June'];
        function logEvent(message) {
            recentEvents.unshift({ time: simClock.format(), message }); recentEvents.length = Math.min(3, recentEvents.length);
        }
        function sampleSchedule(agent) {
            agent.arrivalTime = rand(8 * 60 + 15, 9 * 60 + 30);
            agent.lunchTime = rand(11 * 60 + 30, 13 * 60 + 30); agent.lunchDuration = rand(25, 60);
            agent.departureTime = agent.id === 3 || agent.id === 16 || Math.random() < 0.05 ? rand(18 * 60 + 30, 19 * 60 + 45) : rand(16 * 60 + 45, 18 * 60 + 30);
            agent.plannedMeetingTimes = [];
            if (Math.random() < 0.8) agent.plannedMeetingTimes.push(600 + (agent.homeFloor || 0) * 3 + rand(-6, 8));
            if (Math.random() < 0.65) agent.plannedMeetingTimes.push(840 + (agent.homeFloor || 0) * 3 + rand(-6, 8));
            agent.hasLunched = false; agent.visitDuration = rand(12, 38); agent.armed = false;
            if (agent.role === 'VISITOR') agent.arrivalTime = Infinity;
        }
        function releaseSeat(agent) {
            if (agent.reservation) seatReservations.delete(agent.reservation.key);
            agent.reservation = null;
        }
        function releaseQueue(agent) {
            queueSlots.forEach((slots) => slots.delete(agent.id)); agent.queueSpot = null;
        }
        function resetDay() {
            seatReservations.clear(); queueSlots.forEach((slots) => slots.clear()); elevator.reset();
            agents.forEach((agent) => {
                agent.group.removeFromParent(); agent.group.visible = false;
                agent.group.userData.isSitting = false; agent.group.userData.isWalking = false;
                agent.state = agent.id < targetOccupancy ? 'AWAY' : 'DISABLED';
                agent.plan = []; agent.currentAction = null; agent.floor = 0; agent.nodeName = 'outside';
                agent.reservation = null; agent.queueSpot = null; agent.headingHome = false; agent.goal = 'Not yet arrived';
                sampleSchedule(agent);
            });
            recentEvents.length = 0; logEvent('A fresh day. The building is ready.');
        }
        for (let id = 0; id < MAX_OCCUPANCY; id++) {
            const role = id < MAX_WORKERS ? 'WORKER' : 'VISITOR';
            const homeFloor = role === 'WORKER' ? 1 + Math.floor(id / 4) : null;
            const desk = role === 'WORKER' ? world.floors[homeFloor].desks[id % 4] : null;
            const group = window.createPerson(); group.visible = false;
            const agent = { id, role, name: names[id % names.length] + (id >= names.length ? ' ' + (Math.floor(id / names.length) + 1) : ''), group, homeFloor,
                deskId: desk?.id ?? null, deskWpName: desk?.wpName ?? null, deskDoorWpName: desk?.doorWpName ?? null,
                state: 'AWAY', plan: [], currentAction: null, floor: 0, nodeName: 'outside', reservation: null,
                queueSpot: null, headingHome: false, goal: 'Not yet arrived', speed: rand(1.18, 1.42), entranceLane: rand(-0.95, 0.95) };
            group.userData.agentId = id; agents.push(agent);
        }
        resetDay();
        function countPresent() { return agents.filter((agent) => !['AWAY','GONE','DISABLED'].includes(agent.state)).length; }
        function applyOccupancy() {
            agents.forEach((agent) => {
                if (agent.id < targetOccupancy && agent.state === 'DISABLED') { agent.state = 'AWAY'; sampleSchedule(agent); }
                else if (agent.id >= targetOccupancy && agent.state === 'AWAY') agent.state = 'DISABLED';
            });
        }
        function topUpVisitors() {
            if (simClock.simMinute < 495 || simClock.simMinute > 17 * 60 + 20) return;
            const incoming = agents.filter((agent) => agent.role === 'VISITOR' && agent.state === 'AWAY' && agent.armed).length;
            let deficit = targetOccupancy - countPresent() - incoming;
            for (const agent of agents) {
                if (deficit <= 0) break;
                if (agent.id >= targetOccupancy || agent.role !== 'VISITOR' || agent.armed || !['AWAY','GONE'].includes(agent.state)) continue;
                sampleSchedule(agent); agent.arrivalTime = simClock.simMinute + rand(0, 6); agent.state = 'AWAY'; agent.armed = true; deficit--;
            }
        }
        function reserveSeat(agent, floor, candidates, standingFallback = true) {
            const layout = world.floors[floor];
            const available = candidates.filter((name) => layout.sitTargets[name] && !seatReservations.has(floor + ':' + name));
            if (available.length) {
                const wpName = pick(available); const key = floor + ':' + wpName;
                seatReservations.add(key); agent.reservation = { key, floor, wpName, position: layout.nodes[wpName].position.clone() };
                return agent.reservation;
            }
            return standingFallback ? reserveStanding(agent, floor, layout.standingNames) : null;
        }
        function reserveStanding(agent, floor, candidates) {
            const layout = world.floors[floor];
            const options = [];
            candidates.forEach((wpName) => {
                for (let slot = 0; slot < 3; slot++) {
                    const key = floor + ':' + wpName + ':' + slot;
                    const position = layout.nodes[wpName].position.clone();
                    const angle = slot * Math.PI * 2 / 3;
                    position.x += Math.cos(angle) * 0.72; position.z += Math.sin(angle) * 0.72;
                    const clearOfSeats = layout.seatNames.every((name) => layout.nodes[name].position.distanceTo(position) >= 0.95);
                    const clearOfLeases = agents.every((other) => !other.reservation || other.reservation.floor !== floor || other.reservation.position.distanceTo(position) >= 0.85);
                    if (!seatReservations.has(key) && clearOfSeats && clearOfLeases) options.push({ wpName, key, slot, position });
                }
            });
            if (!options.length) return null;
            const choice = pick(options); const position = choice.position;
            seatReservations.add(choice.key); agent.reservation = { key: choice.key, floor, wpName: choice.wpName, position };
            return agent.reservation;
        }
        function reserveConfSeat(agent, floor) { return reserveSeat(agent, floor, ['conf_seat0','conf_seat1','conf_seat2','conf_seat3'], false); }
        function transit(from, to) {
            if (from === to) return [];
            return [walk(from, 'elevWait'), action('WAIT_AT_PANEL', { floor: from, dir: Math.sign(to - from), toFloor: to }),
                action('ENTER_ELEVATOR', { toFloor: to, fromFloor: from }), action('PRESS_FLOOR', { floor: to }),
                action('WAIT_FOR_FLOOR', { floor: to }), action('EXIT_ELEVATOR', { toFloor: to })];
        }
        function inbound() { return [walk(0, 'front_door_threshold'), walk(0, 'entrance'), walk(0, 'lobby_center')]; }
        function outbound(from) {
            return [...transit(from, 0), state('LEAVING'), walk(0, 'lobby_center'), walk(0, 'entrance'), walk(0, 'front_door_threshold'), walk(0, 'outside'), action('EXIT_BUILDING')];
        }
        function deskReturn(agent, from) {
            return [...transit(from, agent.homeFloor), walk(agent.homeFloor, agent.deskDoorWpName), walk(agent.homeFloor, agent.deskWpName),
                action('SIT', { floor: agent.homeFloor, wpName: agent.deskWpName }), state('AT_DESK'), wait(rand(18, 65)), action('PICK_NEXT_ACTIVITY')];
        }
        function useSeat(lease, duration, activityState) {
            return [walk(lease.floor, lease.wpName), action('SIT', { floor: lease.floor, wpName: lease.wpName }), state(activityState), wait(duration), action('STAND'), action('RELEASE_SEAT')];
        }
        function planArriveToDesk(agent) {
            agent.goal = 'Arriving for work';
            return [...inbound(), ...deskReturn(agent, 0)];
        }
        function planGoToLunch(agent) {
            const lease = reserveSeat(agent, 0, world.floors[0].cafeSpots, false) || reserveSeat(agent, 0, world.floors[0].seatNames);
            if (!lease) return [wait(5), action('PICK_NEXT_ACTIVITY')];
            agent.goal = 'Lunch at the ground-floor café'; logEvent(agent.name + ' is heading down for lunch.');
            return [action('STAND'), ...transit(agent.floor, 0), ...useSeat(lease, agent.lunchDuration, 'AT_LUNCH'), action('MARK_LUNCHED'), ...deskReturn(agent, 0)];
        }
        function planVisitLounge(agent) {
            const floor = agent.floor || agent.homeFloor;
            const lease = reserveSeat(agent, floor, ['lounge_spot0','lounge_spot1','lounge_spot2']);
            if (!lease) return [wait(8), action('PICK_NEXT_ACTIVITY')];
            agent.goal = 'A coffee and a short break';
            return [action('STAND'), ...useSeat(lease, rand(5, 12), 'AT_BREAK'), ...deskReturn(agent, floor)];
        }
        function planAttendMeeting(agent) {
            const floor = Math.random() < 0.65 ? agent.homeFloor : randInt(1, 5);
            const lease = reserveConfSeat(agent, floor);
            if (!lease) return planVisitLounge(agent);
            agent.goal = 'Meeting on floor ' + floor; logEvent(agent.name + ' has a meeting on floor ' + floor + '.');
            return [action('STAND'), ...transit(agent.floor, floor), ...useSeat(lease, rand(22, 45), 'IN_MEETING'), ...deskReturn(agent, floor)];
        }
        function planVisitCoworker(agent) {
            const colleagues = agents.filter((other) => other !== agent && other.role === 'WORKER' && other.state === 'AT_DESK');
            if (!colleagues.length) return [wait(12), action('PICK_NEXT_ACTIVITY')];
            const colleague = pick(colleagues);
            const lease = reserveStanding(agent, colleague.homeFloor, ['office' + colleague.deskId + '_chat']);
            if (!lease) return [wait(12), action('PICK_NEXT_ACTIVITY')];
            agent.goal = 'A desk-side chat with ' + colleague.name;
            return [action('STAND'), ...transit(agent.floor, colleague.homeFloor), ...useSeat(lease, rand(6, 18), 'VISITING'), ...deskReturn(agent, colleague.homeFloor)];
        }
        function planLeaveBuilding(agent) {
            agent.headingHome = true; agent.goal = 'Heading home';
            return [action('STAND'), action('RELEASE_SEAT'), ...outbound(agent.floor)];
        }
        function planVisitorVisit(agent) {
            const roll = Math.random(); let floor = 0; let lease = null; let activityState = 'VISITING';
            if (roll < 0.10) { lease = reserveSeat(agent, 0, world.floors[0].cafeSpots, false); agent.goal = 'A bite at the café'; }
            else if (roll < 0.16) { lease = reserveStanding(agent, 0, ['cafe_order']); agent.goal = 'Picking up coffee'; }
            else if (roll < 0.30) { lease = reserveSeat(agent, 0, ['lounge_spot0','lounge_spot1','lounge_spot2'], false); agent.goal = 'Waiting in the front lounge'; }
            else if (roll < 0.42) { lease = reserveSeat(agent, 0, ['back_lounge_N','back_lounge_S','pit_N','pit_S','pit_E','pit_W'], false); agent.goal = 'A quiet conversation'; }
            else if (roll < 0.52) { lease = reserveStanding(agent, 0, ['reception','kiosk','lobby_wc_front','lobby_wc_back']); agent.goal = 'A quick stop in the lobby'; }
            else if (roll < 0.62) { lease = reserveStanding(agent, 0, world.floors[0].standingNames.filter((name) => name.startsWith('lobby_stand'))); agent.goal = 'Taking a moment in the lobby'; }
            else if (roll < 0.77) { floor = randInt(1,5); lease = reserveSeat(agent, floor, ['lounge_spot0','lounge_spot1','lounge_spot2']); agent.goal = 'Visiting the lounge on floor ' + floor; }
            else { floor = randInt(1,5); lease = reserveConfSeat(agent, floor); activityState = 'IN_MEETING'; agent.goal = 'Client meeting on floor ' + floor; }
            if (!lease) {
                floor = 0; activityState = 'VISITING'; agent.goal = 'Waiting for an appointment';
                lease = reserveStanding(agent, 0, world.floors[0].standingNames.filter((name) => name.startsWith('lobby_stand')))
                    || reserveSeat(agent, 0, world.floors[0].seatNames);
            }
            if (!lease) {
                // At extreme crowding use a free upstairs hallway, with its own personal-space lease.
                for (let index = 1; index < 6 && !lease; index++) { lease = reserveStanding(agent, index, ['hall_stand_N','hall_stand_S','water_cooler']); if (lease) floor = index; }
            }
            if (!lease) return [...inbound(), ...outbound(0)];
            const duration = roll >= 0.77 ? rand(22,45) : roll < 0.16 && roll >= 0.1 ? rand(3,7) : agent.visitDuration;
            return [...inbound(), ...transit(0, floor), ...useSeat(lease, duration, activityState), ...outbound(floor)];
        }
        function chooseNextActivity(agent) {
            if (agent.role !== 'WORKER') return;
            if (simClock.simMinute >= agent.departureTime) { setPlan(agent, planLeaveBuilding(agent)); return; }
            const due = agent.plannedMeetingTimes.findIndex((minute) => minute <= simClock.simMinute);
            if (due >= 0) { agent.plannedMeetingTimes.splice(due,1); setPlan(agent, planAttendMeeting(agent)); return; }
            if (!agent.hasLunched && simClock.simMinute >= agent.lunchTime) { setPlan(agent, planGoToLunch(agent)); return; }
            const roll = Math.random();
            if (roll < MEETING_PROB * 0.4) setPlan(agent, planAttendMeeting(agent));
            else if (roll < MEETING_PROB * 0.4 + 0.12) setPlan(agent, planVisitLounge(agent));
            else if (roll < MEETING_PROB * 0.4 + 0.27) setPlan(agent, planVisitCoworker(agent));
            else { agent.goal = 'Working at their desk'; setPlan(agent, [wait(rand(18,65)), action('PICK_NEXT_ACTIVITY')]); }
        }
        function setPlan(agent, plan) { agent.plan = plan; agent.currentAction = null; }
        function queuePosition(agent, floor) {
            const slots = queueSlots[floor];
            if (!slots.has(agent.id)) {
                const occupied = new Set(slots.values()); let index = 0;
                while (occupied.has(index)) index++;
                slots.set(agent.id,index);
            }
            const slot = slots.get(agent.id);
            return new THREE.Vector3((slot % 5 - 2) * 1.07, floor * window.WORLD.FLOOR_HEIGHT, 3.7 + Math.floor(slot / 5) * 0.93);
        }
        function standUp(agent) { agent.group.userData.isSitting = false; agent.group.position.y = agent.group.parent === elevator.car ? 0 : agent.floor * window.WORLD.FLOOR_HEIGHT; }
        function nearestNode(agent) {
            const nodes = world.floors[agent.floor].nodes;
            if (nodes[agent.nodeName]) return agent.nodeName;
            let closest = 'elevWait'; let distance = Infinity;
            Object.keys(nodes).forEach((key) => { const d = nodes[key].position.distanceToSquared(agent.group.position); if (d < distance) { distance = d; closest = key; } });
            return closest;
        }
        function startAction(agent, task) {
            task.started = true; task._stallT = 0;
            if (task.type === 'WAIT_SIM') task.untilMin = simClock.simMinute + task.minutes;
            else if (task.type === 'WALK_TO_WP') {
                standUp(agent);
                task.path = world.bfsPath(world.floors[task.floor].nodes, nearestNode(agent), task.wpName);
                task.pathIndex = 0;
                if (task.wpName === 'elevWait') {
                    agent.queueSpot = queuePosition(agent, task.floor);
                    // Queue directly, instead of sending everyone to the door's single midpoint.
                    if (task.path.length) task.path[task.path.length - 1] = agent.queueSpot.clone();
                }
                if (task.floor === 0 && ['outside','front_door_threshold','entrance','lobby_center'].includes(task.wpName)) {
                    task.entranceChain = true;
                    task.path.forEach((point) => { if (point.z >= 7.35) point.x = agent.entranceLane; });
                }
                if (agent.state !== 'ARRIVING' && agent.state !== 'LEAVING') agent.state = 'ON_FLOOR';
            } else if (task.type === 'WAIT_AT_PANEL') {
                agent.state = 'WAITING_ELEVATOR'; agent.toFloor = task.toFloor;
            } else if (task.type === 'ENTER_ELEVATOR') {
                task.phase = 'reserve'; agent.toFloor = task.toFloor;
            } else if (task.type === 'EXIT_ELEVATOR') {
                // Register immediately in the same dispatch as WAIT_FOR_FLOOR completes.
                elevator.registerDisembark(agent); task.phase = 'door';
                agent.floor = task.toFloor; agent.state = 'ON_FLOOR';
            }
        }
        function moveTowards(agent, target, budget) {
            const position = agent.group.position;
            const dx = target.x - position.x; const dz = target.z - position.z;
            const distance = Math.hypot(dx,dz);
            if (distance <= 0.035) { position.copy(target); return { done: true, used: 0 }; }
            if (budget <= 0) return { done: false, used: 0 };
            const travel = Math.min(distance, agent.speed * budget);
            position.x += dx / distance * travel; position.z += dz / distance * travel; position.y = target.y;
            agent.group.rotation.y = Math.atan2(dx,dz); agent.group.userData.isWalking = true;
            return { done: travel >= distance - 0.001, used: travel / agent.speed };
        }
        function walkAlongPath(agent, task, dt) {
            let budget = agent._motionSpent ? 0 : dt;
            let moved = false;
            while (task.pathIndex < task.path.length) {
                const target = task.path[task.pathIndex];
                const previous = agent.group.position.clone();
                const result = moveTowards(agent,target,budget); budget -= result.used; moved = moved || result.used > 0;
                const progress = previous.distanceTo(agent.group.position);
                if (progress < 0.005 && !result.done && dt > 0 && !agent._motionSpent) task._stallT += dt; else task._stallT = 0;
                task._prevWp = target;
                if (task._stallT > (task.entranceChain ? 1.5 : 1.2)) {
                    if (task.entranceChain) { agent.group.position.copy(target); metrics.entranceRecoveries++; }
                    task.pathIndex++; task._stallT = 0;
                } else if (result.done) task.pathIndex++; else break;
                if (budget <= 0) break;
            }
            if (moved) agent._motionSpent = true;
            if (task.pathIndex >= task.path.length) { agent.nodeName = task.wpName; agent.floor = task.floor; return true; }
            return false;
        }
        function hallCall(floor, direction) { if (direction > 0) elevator.callUp(floor); else elevator.callDown(floor); }
        function stepAction(agent, task, dt) {
            switch (task.type) {
                case 'WALK_TO_WP': return walkAlongPath(agent,task,dt);
                case 'WAIT_AT_PANEL': {
                    hallCall(task.floor,task.dir);
                    if (!elevator.isAcceptingAt(task.floor,task.dir) || elevator.currentCapacityFree() <= 0 || elevator.pendingDisembark.size) return false;
                    // Arrival order is stable; people cannot jump ahead of earlier waiters.
                    const queued = agents.filter((other) => other.floor === task.floor && other.currentAction?.type === 'WAIT_AT_PANEL' && other.currentAction.dir === task.dir);
                    const index = queueSlots[task.floor].get(agent.id) ?? 999;
                    if (queued.some((other) => (queueSlots[task.floor].get(other.id) ?? 999) < index)) return false;
                    return true;
                }
                case 'ENTER_ELEVATOR': {
                    const direction = Math.sign(task.toFloor - task.fromFloor);
                    if (task.phase === 'reserve') {
                        if (!elevator.isAcceptingAt(task.fromFloor,direction) || elevator.pendingDisembark.size) { hallCall(task.fromFloor,direction); return false; }
                        task.spot = elevator.reserveBoardingSpot(agent);
                        if (!task.spot) { hallCall(task.fromFloor,direction); return false; }
                        task.phase = 'walkToDoor'; task._prevWalk = agent.group.position.clone(); releaseQueue(agent);
                    }
                    if (agent._motionSpent) return false;
                    if (task.phase === 'walkToDoor') {
                        const target = new THREE.Vector3(task.spot.x,task.fromFloor * window.WORLD.FLOOR_HEIGHT,1.66);
                        const previous = agent.group.position.clone();
                        const result = moveTowards(agent,target,dt); agent._motionSpent = true;
                        if (previous.distanceTo(agent.group.position) < 0.005 && !result.done) task._stallT += dt; else task._stallT = 0;
                        task._prevWalk.copy(agent.group.position);
                        if (result.done || task._stallT > 1.5) {
                            if (!result.done) { agent.group.position.copy(target); metrics.doorRecoveries++; }
                            elevator.car.updateMatrixWorld(true); scene.updateMatrixWorld(true); elevator.car.attach(agent.group);
                            agent.group.position.y = 0; agent.state = 'IN_CAR'; task.phase = 'inside';
                        }
                        return false;
                    }
                    const result = moveTowards(agent,task.spot,dt); agent._motionSpent = true;
                    if (result.done) { elevator.completeBoard(agent); agent.group.rotation.y = 0; metrics.boarded++; return true; }
                    return false;
                }
                case 'PRESS_FLOOR': elevator.pressDestination(task.floor); return true;
                case 'WAIT_FOR_FLOOR': return elevator.state === 'DOOR_OPEN' && elevator.currentFloor === task.floor;
                case 'EXIT_ELEVATOR': {
                    if (agent._motionSpent) return false;
                    if (task.phase === 'door') {
                        const result = moveTowards(agent,new THREE.Vector3(agent.group.position.x,0,1.75),dt); agent._motionSpent = true;
                        if (result.done) { elevator.car.updateMatrixWorld(true); scene.attach(agent.group); task.phase = 'clear'; }
                        return false;
                    }
                    const target = world.floors[task.toFloor].nodes.elevWait.position.clone();
                    target.x = 1.9; target.z = 2.65;
                    const result = moveTowards(agent,target,dt); agent._motionSpent = true;
                    if (result.done) { elevator.completeDisembark(agent); agent.nodeName = 'elevWait'; metrics.rides++; return true; }
                    return false;
                }
                case 'SIT': {
                    const layout = world.floors[task.floor]; const sitTarget = layout.sitTargets[task.wpName];
                    const position = agent.reservation?.wpName === task.wpName && agent.reservation.floor === task.floor ? agent.reservation.position : layout.nodes[task.wpName].position;
                    agent.group.position.copy(position);
                    if (!sitTarget.sit && !agent.reservation) { const angle = rand(0,Math.PI * 2); const radius = rand(0.35,0.75); agent.group.position.x += Math.cos(angle) * radius; agent.group.position.z += Math.sin(angle) * radius; }
                    agent.group.rotation.y = sitTarget.facing; agent.group.userData.isSitting = sitTarget.sit; agent.group.userData.isWalking = false;
                    if (sitTarget.sit) agent.group.position.y -= 0.35;
                    // Pose immediately on first occupancy, before a single rendered frame can show a backwards sitter.
                    window.animatePersonWalking(agent.group,0); metrics.seatsChecked++;
                    return true;
                }
                case 'STAND': standUp(agent); return true;
                case 'RELEASE_SEAT': releaseSeat(agent); return true;
                case 'WAIT_SIM': return simClock.simMinute >= task.untilMin;
                case 'ENTER_STATE': agent.state = task.state; return true;
                case 'MARK_LUNCHED': agent.hasLunched = true; return true;
                case 'PICK_NEXT_ACTIVITY': chooseNextActivity(agent); return true;
                case 'EXIT_BUILDING':
                    releaseSeat(agent); releaseQueue(agent); agent.group.removeFromParent(); agent.group.visible = false;
                    agent.state = 'GONE'; agent.armed = false; metrics.exits++;
                    if (agent.role === 'WORKER') logEvent(agent.name + ' has headed home.');
                    return true;
                default: throw new Error('Unknown action: ' + task.type);
            }
        }
        function spawn(agent) {
            agent.floor = 0; agent.nodeName = 'outside'; agent.state = 'ARRIVING'; agent.armed = false; agent.headingHome = false;
            agent.group.position.set(rand(-1.1,1.1),0,12 + rand(-0.75,0.75)); agent.group.rotation.y = Math.PI;
            agent.group.userData.isSitting = false; scene.add(agent.group); agent.group.visible = floorView === 'all' || floorView === '0';
            setPlan(agent,agent.role === 'WORKER' ? planArriveToDesk(agent) : planVisitorVisit(agent)); metrics.arrivals++;
            if (agent.role === 'WORKER') logEvent(agent.name + ' arrived for work on floor ' + agent.homeFloor + '.');
        }
        function tickAgent(agent, dt) {
            if (agent.state === 'DISABLED') return;
            if (agent.state === 'AWAY') { if (simClock.simMinute >= agent.arrivalTime) spawn(agent); else return; }
            if (agent.state === 'GONE') return;
            agent.group.userData.isWalking = false; agent._motionSpent = false;
            // Never cancel a visitor's plan or interrupt an elevator transfer. Workers
            // finish that transfer, then leave at the next safe action boundary.
            if (agent.role === 'WORKER' && !agent.headingHome && simClock.simMinute >= agent.departureTime &&
                agent.group.parent === scene && !['ENTER_ELEVATOR','EXIT_ELEVATOR'].includes(agent.currentAction?.type)) {
                releaseSeat(agent); releaseQueue(agent); setPlan(agent,planLeaveBuilding(agent));
            }
            for (let transition = 0; transition < 16; transition++) {
                if (!agent.currentAction) {
                    agent.currentAction = agent.plan.shift();
                    if (!agent.currentAction) break;
                    startAction(agent,agent.currentAction);
                }
                const task = agent.currentAction;
                if (!stepAction(agent,task,dt)) break;
                if (agent.currentAction === task) agent.currentAction = null;
                if (agent.state === 'GONE') break;
            }
        }
        function collisionExempt(agent) {
            const task = agent.currentAction;
            return agent.group.parent !== scene || agent.group.userData.isSitting || task?.type === 'ENTER_ELEVATOR' || task?.type === 'EXIT_ELEVATOR' || task?.entranceChain;
        }
        function applyCollisions(dt) {
            const present = agents.filter((agent) => agent.group.parent === scene && !collisionExempt(agent));
            for (let i = 0; i < present.length; i++) {
                for (let j = i + 1; j < present.length; j++) {
                    const a = present[i]; const b = present[j];
                    if (Math.abs(a.group.position.y - b.group.position.y) > 1) continue;
                    let dx = a.group.position.x - b.group.position.x; let dz = a.group.position.z - b.group.position.z;
                    const d = Math.hypot(dx,dz); const clearance = 0.76;
                    if (d >= clearance) continue;
                    if (d < 0.001) { const angle = rand(0,Math.PI * 2); dx = Math.cos(angle); dz = Math.sin(angle); }
                    else { dx /= d; dz /= d; }
                    const push = (clearance - d) * Math.min(0.18,dt * 2.2);
                    a.group.position.x += dx * push; a.group.position.z += dz * push;
                    b.group.position.x -= dx * push; b.group.position.z -= dz * push;
                }
            }
        }
        const lightingKeys = [
            [0,0x182637,0x9abce5,0.13,0.45,0.32], [5.95,0x213545,0x9abce5,0.15,0.45,0.32],
            [6.2,0xb58b72,0xffbb76,0.65,0.57,0.45], [6.5,0x94b0ba,0xfff0d3,1.05,0.62,0.55],
            [12,0x95b3bc,0xffffff,1.05,0.62,0.55], [17.5,0x95b3bc,0xfff0d3,1.05,0.62,0.55],
            [18,0xa38272,0xffb366,0.7,0.56,0.46], [18.5,0x233644,0xabc5e8,0.16,0.45,0.32], [24,0x182637,0x9abce5,0.13,0.45,0.32]
        ];
        const lightColor = new THREE.Color();
        function updateLighting() {
            const hour = simClock.simMinute / 60; let index = 0;
            while (index < lightingKeys.length - 2 && hour > lightingKeys[index + 1][0]) index++;
            const a = lightingKeys[index]; const b = lightingKeys[index + 1]; const t = (hour - a[0]) / (b[0] - a[0]);
            scene.background.setHex(a[1]).lerp(lightColor.setHex(b[1]),t);
            sun.color.setHex(a[2]).lerp(lightColor.setHex(b[2]),t);
            sun.intensity = THREE.MathUtils.lerp(a[3],b[3],t); ambient.intensity = THREE.MathUtils.lerp(a[4],b[4],t); hemi.intensity = THREE.MathUtils.lerp(a[5],b[5],t);
            sun.position.set(Math.cos((hour - 6) / 12 * Math.PI) * 25, 35, 18);
        }
        const ui = {};
        ['time','day','phase','speed','speed-label','occupancy','occupancy-label','pause','restart','present','states','car-floor','car-state','calls','story','floor-view','reset-view','inspect'].forEach((id) => { ui[id] = document.getElementById(id); });
        ui.speed.value = String(Math.log(120) / Math.log(600) * 100);
        ui.speed.addEventListener('input', () => { simClock.timeScale = Math.pow(600, Number(ui.speed.value) / 100); ui['speed-label'].textContent = Math.round(simClock.timeScale) + '× realtime'; });
        ui.occupancy.addEventListener('input', () => { targetOccupancy = Number(ui.occupancy.value); ui['occupancy-label'].textContent = 'Occupancy: ' + targetOccupancy + ' / 100 people'; applyOccupancy(); });
        ui.pause.addEventListener('click', () => { paused = !paused; ui.pause.textContent = paused ? 'Resume' : 'Pause'; });
        ui.restart.addEventListener('click', () => { simClock.simMinute = 450; simClock.day++; resetDay(); });
        function setFloorView(value) {
            floorView = value; ui['floor-view'].value = value;
            world.floors.forEach((floor) => { floor.group.visible = value === 'all' || Number(value) === floor.floorNumber; });
            world.roof.visible = value === 'all';
            if (value === 'all') { camera.position.set(28,24,28); controls.target.set(0,8.3,0); }
            else { const y = Number(value) * window.WORLD.FLOOR_HEIGHT; camera.position.set(19,y + 20,23); controls.target.set(0,y,0); }
            controls.update();
        }
        ui['floor-view'].addEventListener('change', () => setFloorView(ui['floor-view'].value));
        ui['reset-view'].addEventListener('click', () => setFloorView('all'));
        const raycaster = new THREE.Raycaster();
        let pointerDown = null;
        renderer.domElement.addEventListener('pointerdown', (event) => { pointerDown = { x: event.clientX, y: event.clientY }; });
        renderer.domElement.addEventListener('pointerup', (event) => {
            if (!pointerDown || Math.hypot(pointerDown.x - event.clientX,pointerDown.y - event.clientY) > 5) return;
            raycaster.setFromCamera(new THREE.Vector2(event.clientX / window.innerWidth * 2 - 1, -event.clientY / window.innerHeight * 2 + 1),camera);
            const targets = agents.filter((agent) => agent.group.parent && agent.group.visible).map((agent) => agent.group);
            const hit = raycaster.intersectObjects(targets,true)[0]; inspectedAgent = null;
            if (hit) { let object = hit.object; while (object && object.userData.agentId === undefined) object = object.parent; if (object) inspectedAgent = agents[object.userData.agentId]; }
        });
        function updateHUD() {
            ui.time.textContent = simClock.format(); ui.day.textContent = ['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY'][(simClock.day - 1) % 7] + ' · DAY ' + simClock.day;
            const minute = simClock.simMinute;
            ui.phase.textContent = paused ? 'Paused' : minute < 495 ? 'Before hours' : minute < 690 ? 'Morning' : minute < 810 ? 'Lunch time' : minute < 1020 ? 'Afternoon' : minute < 1185 ? 'Winding down' : 'After hours';
            const counts = {};
            agents.forEach((agent) => { counts[agent.state] = (counts[agent.state] || 0) + 1; });
            ui.present.textContent = String(countPresent());
            const items = [['At a desk',counts.AT_DESK || 0],['In meetings',counts.IN_MEETING || 0],['On a break',(counts.AT_BREAK || 0) + (counts.AT_LUNCH || 0)],['Visiting',counts.VISITING || 0],['In transit',(counts.IN_CAR || 0) + (counts.WAITING_ELEVATOR || 0) + (counts.ON_FLOOR || 0)],['Coming / going',(counts.ARRIVING || 0) + (counts.LEAVING || 0)]];
            ui.states.innerHTML = items.map((entry) => '<div class="stat">' + entry[0] + '<b>' + entry[1] + '</b></div>').join('');
            ui.states.title = Object.entries(counts).map((entry) => entry[0] + ': ' + entry[1]).join('\n');
            ui['car-floor'].textContent = (elevator.currentFloor === 0 ? 'G' : String(elevator.currentFloor).padStart(2,'0')) + (elevator.direction > 0 ? ' ↑' : elevator.direction < 0 ? ' ↓' : ' —');
            ui['car-state'].innerHTML = elevator.state.replaceAll('_',' ') + '<br>' + elevator.passengers.size + ' / 4 aboard · ' + elevator.pendingBoarders.size + ' boarding';
            const list = (set) => [...set].sort((a,b) => a-b).map((floor) => floor === 0 ? 'G' : floor).join(', ') || '—';
            ui.calls.innerHTML = 'Destinations <strong>' + list(elevator.destinations) + '</strong><br>Calls ↑ <strong>' + list(elevator.upCalls) + '</strong> &nbsp; ↓ <strong>' + list(elevator.downCalls) + '</strong>';
            ui.story.innerHTML = recentEvents.map((entry) => '<div><time>' + entry.time + '</time>' + entry.message + '</div>').join('');
            ui.inspect.style.display = inspectedAgent ? 'block' : 'none';
            if (inspectedAgent) ui.inspect.innerHTML = '<strong>' + inspectedAgent.name + '</strong> · ' + inspectedAgent.role.toLowerCase() + '<p>' + inspectedAgent.goal + '<br>' + inspectedAgent.state.replaceAll('_',' ').toLowerCase() + (inspectedAgent.homeFloor ? ' · desk ' + inspectedAgent.homeFloor + inspectedAgent.deskId : '') + '</p>';
        }
        function simulate(realDt) {
            // Every second of accelerated clock time gets the same physical integration.
            // Substeps prevent a 600× frame from skipping doors or action handshakes.
            let remaining = realDt * simClock.timeScale;
            while (remaining > 0.000001) {
                const motionDt = Math.min(0.1,remaining); remaining -= motionDt;
                simClock.tick(motionDt / simClock.timeScale);
                topUpVisitors(); elevator.tick(motionDt);
                agents.forEach((agent) => tickAgent(agent,motionDt));
                applyCollisions(motionDt);
                metrics.maxCarLoad = Math.max(metrics.maxCarLoad,elevator.passengers.size + elevator.pendingBoarders.size);
            }
        }
        function animate() {
            requestAnimationFrame(animate);
            const realDt = Math.min(0.05,clock.getDelta());
            if (!paused) simulate(realDt);
            updateLighting(); elevator.updateVisuals();
            agents.forEach((agent) => {
                if (!agent.group.parent) return;
                const floor = agent.group.parent === elevator.car ? elevator.currentFloor : agent.floor;
                agent.group.visible = floorView === 'all' || Number(floorView) === floor;
                window.animatePersonWalking(agent.group,paused ? 0 : realDt * simClock.timeScale);
            });
            elevator.car.visible = floorView === 'all' || Number(floorView) === elevator.currentFloor;
            controls.update(); renderer.render(scene,camera);
            hudTimer += realDt; if (hudTimer > 0.12) { updateHUD(); hudTimer = 0; }
        }
        window.addEventListener('resize', () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth,window.innerHeight); });
        // Inspectable public state also permits deterministic, whole-day browser verification.
        window.officeSim = { scene,camera,renderer,controls,world,elevator,agents,simClock,seatReservations,metrics,
            simulate,resetDay,topUpVisitors,applyOccupancy,countPresent,setFloorView,
            setPaused: (value) => { paused = value; ui.pause.textContent = value ? 'Resume' : 'Pause'; },
            getTargetOccupancy: () => targetOccupancy,
            plans: { planArriveToDesk,planGoToLunch,planVisitLounge,planAttendMeeting,planVisitCoworker,planLeaveBuilding,planVisitorVisit },
            reserveConfSeat };
        window.Clock = Clock;
        updateHUD(); animate();
    }
    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', startSimulation);
    } else {
        startSimulation();
    }
})();
