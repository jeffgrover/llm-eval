const MAX_WORKERS = 20;
const MAX_VISITORS = 80;
const MAX_OCCUPANCY = MAX_WORKERS + MAX_VISITORS;

class SimClock {
    constructor() {
        this.simMinute = 7 * 60 + 30;
        this.timeScale = 120;
    }
    tick(realDt) {
        this.simMinute += realDt * this.timeScale / 60;
        if (this.simMinute >= 24 * 60) {
            this.simMinute -= 24 * 60;
            window.onDayWrap();
        }
    }
    format() {
        const h = Math.floor(this.simMinute / 60);
        const m = Math.floor(this.simMinute % 60);
        const amp = h >= 12 ? 'PM' : 'AM';
        const h12 = h % 12 === 0 ? 12 : h % 12;
        return h12 + ':' + m.toString().padStart(2, '0') + ' ' + amp;
    }
}
class Agent {
    constructor(id, role, world, elevator) {
        this.id = id;
        this.role = role;
        this.world = world;
        this.elevator = elevator;
        this.state = 'DISABLED';
        this.group = null;
        this.plan = [];
        this.currentAction = null;
        this.homeFloor = Math.floor(Math.random() * 5) + 1;
        this.deskId = Math.floor(Math.random() * 4);
        this.hasLunched = false;
        this.plannedMeetings = [];
        this.seatReservation = null;
        this.randomizeSchedule();
    }
    randomizeSchedule() {
        this.arrivalTime = (8 * 60 + 15) + Math.random() * 75;
        this.lunchWindow = [11 * 60 + 30, 13 * 60 + 30];
        this.lunchDuration = 25 + Math.random() * 35;
        this.departureTime = (16 * 45) + Math.random() * 105;
        if (Math.random() < 0.15) this.departureTime += 60 + Math.random() * 90;
        this.plannedMeetings = [];
        if (Math.random() < 0.5) this.plannedMeetings.push(9 * 60 + Math.random() * 120);
        if (Math.random() < 0.5) this.plannedMeetings.push(14 * 60 + Math.random() * 120);
    }
    spawn() {
        this.group = createPerson();
        this.state = 'AWAY';
        this.world.scene.add(this.group);
    }
    despawn() {
        if (this.group) {
            this.world.scene.remove(this.group);
            this.group = null;
        }
        this.state = 'GONE';
    }
    setPlan(actions) {
        this.plan = actions;
        this.currentAction = null;
    }
    process(motionDt) {
        if (this.state === 'DISABLED') return;
        if (this.state === 'AWAY' && simClock.simMinute >= this.arrivalTime) {
            this.spawn();
            this.chooseNextActivity();
        }
        if (this.state === 'GONE') return;
        let iterations = 0;
        while (this.currentAction === null && this.plan.length > 0 && iterations < 16) {
            this.currentAction = this.plan.shift();
            this.startAction();
            iterations++;
        }
        if (this.currentAction) this.updateAction(motionDt);
    }
    startAction() {
        if (this.currentAction.type === 'WAIT_SIM') {
            this.currentAction.untilMin = simClock.simMinute + this.currentAction.duration;
        }
    }
    updateAction(motionDt) {
        const a = this.currentAction;
        switch (a.type) {
            case 'WALK_TO_WP':
                const floor = this.world.floors[a.floor];
                const target = floor.nodes[a.wpName].pos;
                const dir = new THREE.Vector3().subVectors(target, this.group.position).normalize();
                this.group.position.addScaledVector(dir, 1.3 * motionDt);
                this.group.rotation.y = Math.atan2(dir.x, dir.z);
                this.group.userData.isWalking = true;
                if (this.group.position.distanceTo(target) < 0.2) this.currentAction = null;
                break;
            case 'WAIT_AT_PANEL':
                if (this.elevator.isAcceptingAt(a.floor, a.dir)) this.currentAction = null;
                else if (a.dir === 1) this.elevator.callUp(a.floor); else this.elevator.callDown(a.floor);
                break;
            case 'ENTER_ELEVATOR':
                if (this.group.parent !== this.elevator.carGroup) {
                    const doorPos = new THREE.Vector3(0, 0, 1.6).applyMatrix4(this.elevator.carGroup.matrixWorld);
                    const dDir = new THREE.Vector3().subVectors(doorPos, this.group.position).normalize();
                    this.group.position.addScaledVector(dDir, 1.3 * motionDt);
                    this.group.rotation.y = Math.atan2(dDir.x, dDir.z);
                    this.group.userData.isWalking = true;
                    if (this.group.position.distanceTo(doorPos) < 0.5) {
                        this.group.userData.isWalking = false;
                        this.group.parent = this.elevator.carGroup;
                        this.group.position.set(0, 0, 1.5);
                    }
                } else {
                    const sDir = new THREE.Vector3().subVectors(a.spot, this.group.position).normalize();
                    this.group.position.addScaledVector(sDir, 1.3 * motionDt);
                    this.group.rotation.y = Math.atan2(sDir.x, sDir.z);
                    this.group.userData.isWalking = true;
                    if (this.group.position.distanceTo(a.spot) < 0.1) {
                        this.group.position.copy(a.spot);
                        this.group.rotation.y = 0;
                        this.group.userData.isWalking = false;
                        this.elevator.completeBoard(this);
                        this.currentAction = null;
                    }
                }
                break;
            case 'PRESS_FLOOR':
                this.elevator.pressDestination(a.floor);
                this.currentAction = null;
                break;
            case 'WAIT_FOR_FLOOR':
                if (this.elevator.currentFloor === a.floor && this.elevator.state === 'DOOR_OPEN') this.currentAction = null;
                break;
            case 'EXIT_ELEVATOR':
                if (this.group.parent === this.elevator.carGroup) {
                    this.group.parent = this.world.scene;
                    this.group.position.set(0, 0, 1.5).applyMatrix4(this.elevator.carGroup.matrixWorld);
                    this.elevator.registerDisembark(this);
                }
                const targetWp = this.world.floors[a.floor].nodes['elevWait'].pos;
                const eDir = new THREE.Vector3().subVectors(targetWp, this.group.position).normalize();
                this.group.position.addScaledVector(eDir, 1.3 *1.3 * motionDt);
                this.group.rotation.y = Math.atan2(eDir.x, eDir.z);
                this.group.userData.isWalking = true;
                if (this.group.position.distanceTo(targetWp) < 0.2) {
                    this.elevator.completeDisembark(this);
                    this.currentAction = null;
                }
                break;
            case 'SIT':
                const targetS = this.world.floors[a.floor].sitTargets[a.wpName];
                this.group.position.set(...this.world.floors[a.floor].nodes[a.wpName].pos);
                this.group.position.y -= 0.35;
                this.group.rotation.y = targetS.facing;
                this.group.userData.isSitting = true;
                this.currentAction = null;
                break;
            case 'STAND':
                this.group.userData.isSitting = false;
                this.group.position.y = 0;
                this.currentAction = null;
                break;
            case 'RELEASE_SEAT':
                if (this.seatReservation) {
                    window.seatReservations.delete(this.seatReservation);
                    this.seatReservation = null;
                }
                this.currentAction = null;
                break;
            case 'WAIT_SIM':
                if (simClock.simMinute >= a.untilMin) this.currentAction = null;
                break;
            case 'EXIT_BUILDING':
                this.despawn();
                this.currentAction = null;
                break;
            case 'ENTER_STATE':
                this.state = a.state;
                this.currentAction = null;
                break;
            case 'MARK_LUNCHED':
                this.hasLunched = true;
                this.currentAction = null;
                break;
            case 'PICK_NEXT_ACTIVITY':
                this.chooseNextActivity();
                this.currentAction = null;
                break;
        }
    }
    chooseNextActivity() {
        if (this.role === 'WORKER') {
            if (sim,Clock.simMinute >= this.departureTime) {
                this.setPlan(this.planLeaveBuilding());
                return;
            }
            const meeting = this.plannedMeetings.find(t => simClock.simMinute >= t);
            if (meeting) {
                this.plannedMeetings = this.plannedMeetings.filter(t => t !== meeting);
                this.setPlan(this.planAttendMeeting());
                return;
            }
            if (simClock.simMinute >= this.lunchWindow[0] && !this.hasLunched) {
                this.setPlan(this.planGoToLunch());
                return;
            }
            const roll = Math.random();
            if (roll < 0.14) this.setPlan(this.planAttendMeeting());
            else if (roll < 0.26) this.setPlan(this.planVisitLounge());
            else if (roll < 0.41) this.setPlan(this.planVisitCoworker());
            else this.setPlan([{ type: 'WAIT_SIM', duration: 18 + Math.random() * 47 }, { type: 'PICK_NEXT_ACTIVITY' }]);
        } else {
            const roll = Math.random();
            if (roll < 0.1) this.setPlan(this.planVisitorBistro());
            else if (roll < 0.2) this.setPlan(this.planVisitorCafe());
            else if (roll < 0.34) this.setPlan(this.planVisitorLounge());
            else if (roll < 0.44) this.setPlan(this.planVisitorLobby());
            else if (roll < 0.54) this.setPlan(this.planVisitorLoungeUpper());
            else if (roll < 0.77) this.setPlan(this.planVisitorMeeting());
            else this.setPlan(this.planVisitorLobby());
        }
    }
    planArriveToDesk() {
        return [
            { type: 'WALK_TO_WP', floor: 0, wpName: 'front_door_threshold' },
            { type: 'WALK_TO_WP', floor: 0, wpName: 'entrance' },
            { type: 'WALK_TO_WP', floor: 0, wpName: 'lobby_center' },
            { type: 'WAIT_AT_PANEL', floor: 0, dir: 1, toFloor: this.homeFloor },
            { type: 'ENTER_ELEVATOR', toFloor: this.homeFloor },
            { type: 'PRESS_FLOOR', floor: this.homeFloor },
            { type: 'WAIT_FOR_FLOOR', floor: this.homeFloor },
            { type: 'EXIT_ELEVATOR', floor: this.homeFloor },
            { type: 'WALK_TO_WP', floor: this.homeFloor, wpName: 'office' + this.deskId + '_door' },
            { type: 'WALK_TO_WP', floor: this.homeFloor, wpName: 'office' + this.deskId + '_desk' },
            { type: 'SIT', floor: this.homeFloor, wpName: 'office' + this.deskId + '_desk' },
            { type: 'ENTER_STATE', state: 'AT_DESK' },
            { type: 'PICK_NEXT_ACTIVITY' }
        ];
    }
    planLeaveBuilding() {
        return [
            { type: 'STAND' },
            { type: 'WALK_TO_WP', floor: this.homeFloor, wpName: 'office' + this.deskId + '_door' },
            { type: 'WAIT_AT_PANEL', floor: this.homeFloor, dir: -1, toFloor: 0 },
            { type: 'ENTER_ELEVATOR', toFloor: 0 },
            { type: 'PRESS_FLOOR', floor: 0 },
            { type: 'WAIT_FOR_FLOOR', floor: 0 },
            { type: 'EXIT_ELEVATOR', floor: 0 },
            { type: 'WALK_TO_WP', floor: 0, wpName: 'lobby_center' },
            { type: 'WALK_TO_WP', floor: 0, wpName: 'entrance' },
            { type: 'WALK_TO_WP', floor: 0, wpName: 'front_door_threshold' },
            { type: 'WALK_TO_WP', floor: 0, wpName: 'outside' },
            { type: 'EXIT_BUILDING' }
        ];
    }
    planGoToLunch() {
        return [
            { type: 'STAND' },
            { type: 'WALK_TO_WP', floor: this.homeFloor, wpName: 'office' + this.deskId + '_door' },
            { type: 'WAIT_AT_PANEL', floor: this.homeFloor, dir: -1, toFloor: 0 },
            { type: 'ENTER_ELEVATOR', toFloor: 0 },
            { type: 'PRESS_FLOOR', floor: 0 },
            { type: 'WAIT_FOR_FLOOR', floor: 0 },
            { type: 'EXIT_ELEVATOR', floor: 0 },
            { type: 'WALK_TO_WP', floor: 0, wpName: 'cafe_order' },
            { type: 'SIT', floor: 0, wpName: 'lobby_stand_center' },
            { type: 'WAIT_SIM', duration: this.lunchDuration },
            { type: 'MARK_LUNCHED' },
            { type: 'STAND' },
            { type: 'WAIT_AT_PANEL', floor: 0, dir: 1, toFloor: this.homeFloor },
            { type: 'ENTER_ELEVATOR', toFloor: this.homeFloor },
            { type: 'PRESS_FLOOR', floor: this.homeFloor },
            { type: 'WAIT_FOR_FLOOR', floor: this.homeFloor },
            { type: 'EXIT_ELEVATOR', floor: this.homeFloor },
            { type: 'WALK_TO_WP', floor: this.homeFloor, wpName: 'office' + this.deskId + '_door' },
            { type: 'WALK_TO_WP', floor: this.homeFloor, wpName: 'office' + this.deskId + '_desk' },
            { type: 'SIT', floor: this.homeFloor, wpName: 'office' + this.deskId + '_desk' },
            { type: 'PICK_NEXT_ACTIVITY' }
        ];
    }
    planVisitLounge() {
        return [
            { type: 'STAND' },
            { type: 'WALK_TO_WP', floor: this.homeFloor, wpName: 'lounge_door' },
            { type: 'SIT', floor: this.homeFloor, wpName: 'lounge_spot0' },
            { type: 'WAIT_SIM', duration: 5 + Math.random() * 7 },
            { type: 'STAND' },
            { type: 'WALK_TO_WP', floor: this.homeFloor, wpName: 'office' + this.deskId + '_door' },
            { type: 'WALK_TO_WP', floor: this.homeFloor, wpName: 'office' + this.deskId + '_desk' },
            { type: 'SIT', floor: this.homeFloor, wpName: 'office' + this.deskId + '_desk' },
            { type: 'PICK_NEXT_ACTIVITY' }
        ];
    }
    planAttendMeeting() {
        const meetFloor = Math.random() < 0.65 ? this.homeFloor : Math.floor(Math.random() * 5) + 1;
        const seatIdx = Math.floor(Math.random() * 4);
        const seatName = 'conf_seat' + seatIdx;
        return [
            { type: 'STAND' },
            { type: 'WALK_TO_WP', floor: this.homeFloor, wpName: 'office' + this.deskId + '_door' },
            { type: 'WAIT_AT_PANEL', floor: this.homeFloor, dir: meetFloor > this.homeFloor ? 1 : -1, toFloor: meetFloor },
            { type: 'ENTER_ELEVATOR', toFloor: meetFloor },
            { type: 'PRESS_FLOOR', floor: meetFloor },
            { type: 'WAIT_FOR_FLOOR', floor: meetFloor },
            { type: 'EXIT_ELEVATOR', floor: meetFloor },
            { type: 'WALK_TO_WP', floor: meetFloor, wpName: 'conf_door' },
            { type: 'SIT', floor: meetFloor, wpName: seatName },
            { type: 'WAIT_SIM', duration: 22 + Math.random() * 23 },
            { type: 'STAND' },
            { type: 'RELEASE_SEAT' },
            { type: 'WALK_TO_WP', floor: meetFloor, wpName: 'conf_door' },
            { type: 'WAIT_AT_PANEL', floor: meetFloor, dir: this.homeFloor > meetFloor ? 1 : -1, toFloor: this.homeFloor },
            { type: 'ENTER_ELEVATOR', toFloor: this.homeFloor },
            { type: 'PRESS_FLOOR', floor: this.homeFloor },
            { type: 'WAIT_FOR_FLOOR', floor: this.homeFloor },
            { type: 'EXIT_ELEVATOR', floor: this.homeFloor },
            { type: 'WALK_TO_WP', floor: this.homeFloor, wpName: 'office' + this.deskId + '_door' },
            { type: 'WALK_TO_WP', floor: this.homeFloor, wpName: 'office' + this.deskId + '_desk' },
            { type: 'SIT', floor: this.homeFloor, wpName: 'office' + this.deskId + '_desk' },
            { type: 'PICK_NEXT_ACTIVITY' }
        ];
    }
    planVisitCoworker() {
        const target = agents.find(a => a.role === 'WORKER' && a.state === 'AT_DESK' && a.id !== this.id);
        if (!target) {
            this.setPlan([{ type: 'PICK_NEXT_ACTIVITY' }]);
            return;
        }
        const floor = target.homeFloor;
        const door = 'office' + target.deskId + '_door';
        return [
            { type: 'STAND' },
            { type: 'WALK_TO_WP', floor: this.homeFloor, wpName: 'office' + this.deskId + '_door' },
            { type: 'WAIT_AT_PANEL', floor: this.homeFloor, dir: floor > this.homeFloor ? 1 : -1, toFloor: floor },
            { type: 'ENTER_ELEVATOR', toFloor: floor },
            { type: 'PRESS_FLOOR', floor: floor },
            { type: 'WAIT_FOR_FLOOR', floor: floor },
            { type: 'EXIT_ELEVATOR', floor: floor },
            { type: 'WALK_TO_WP', floor: floor, wpName: door },
            { type: 'WAIT_SIM', duration: 6 + Math.random() * 12 },
            { type: 'WAIT_AT_PANEL', floor: floor, dir: this.homeFloor > floor ? 1 : -1, toFloor: this.homeFloor },
            { type: 'ENTER_ELEVATOR', toFloor: this.homeFloor },
            { type: 'PRESS_FLOOR', floor: this.homeFloor },
            { type: 'WAIT_FOR_FLOOR', floor: this.homeFloor },
            { type: 'EXIT_ELEVATOR', floor: this.homeFloor },
            { type: 'WALK_TO_WP', floor: this.homeFloor, wpName: 'office' + this.deskId + '_door' },
            { type: 'WALK_TO_WP', floor: this.homeFloor, wpName: 'office' + this.deskId + '_desk' },
            { type: 'SIT', floor: this.homeFloor, wpName: 'office' + this.deskId + '_desk' },
            { type: 'PICK_NEXT_ACTIVITY' }
        ];
    }
    planVisitorBistro() {
        return [
            { type: 'WALK_TO_WP', floor: 0, wpName: 'front_door_threshold' },
            { type: 'WALK_TO_WP', floor: 0, wpName: 'entrance' },
            { type: 'WALK_TO_WP', floor: 0, wpName: 'lobby_center' },
            { type: 'WALK_TO_WP', floor: 0, wpName: 'cafe_order' },
            { type: 'SIT', floor: 0, wpName: 'lobby_stand_center' },
            { type: 'WAIT_SIM', duration: 15 + Math.random() * 30 },
            { type: 'STAND' },
            { type: 'WALK_TO_WP', floor: 0, wpName: 'lobby_center' },
            { type: 'WALK_TO_WP', floor: 0, wpName: 'entrance' },
            { type: 'WALK_TO_WP', floor: 0, wpName: 'front_door_threshold' },
            { type: 'WALK_TO_WP', floor: 0, wpName: 'outside' },
            { type: 'EXIT_BUILDING' }
        ];
    }
    planVisitorCafe() {
        return [
            { type: 'WALK_TO_WP', floor: 0, wpName: 'front_door_threshold' },
            { type: 'WALK_TO_WP', floor: 0, wpName: 'entrance' },
            { type: 'WALK_TO_WP', floor: 0, wpName: 'lobby_center' },
            { type: 'WALK_TO_WP', floor: 0, wpName: 'cafe_order' },
            { type: 'WAIT_SIM', duration: 5 + Math.random() * 10 },
            { type: 'WALK_TO_WP', floor: 0, wpName: 'lobby_center' },
            { type: 'WALK_TO_WP', floor: 0, wpName: 'entrance' },
            { type: 'WALK_TO_WP', floor: 0, wpName: 'front_door_threshold' },
            { type: 'WALK_TO_WP', floor: 0, wpName: 'outside' },
            { type: 'EXIT_BUILDING' }
        ];
    }
    planVisitorLounge() {
        return [
            { type: 'WALK_TO_WP', floor: 0, wpName: 'front_door_threshold' },
            { type: 'WALK_TO_WP', floor: 0, wpName: 'entrance' },
            { type: 'WALK_TO_WP', floor: 0, wpName: 'lobby_center' },
            { type: 'SIT', floor: 0, wpName: 'lobby_stand_center' },
            { type: 'WAIT_SIM', duration: 10 + Math.random() * 20 },
            { type: 'STAND' },
            { type: 'WALK_TO_WP', floor: 0, wpName: 'lobby_center' },
            { type: 'WALK_TO_WP', floor: 0, wpName: 'entrance' },
            { type: 'WALK_TO_WP', floor: 0, wpName: 'front_door_threshold' },
            { type: 'WALK_TO_WP', floor: 0, wpName: 'outside' },
            { type: 'EXIT_BUILDING' }
        ];
    }
    planVisitorLobby() {
        return [
            { type: 'WALK_TO_WP', floor: 0, wpName: 'front_door_threshold' },
            { type: 'WALK_TO_WP', floor: 0, wpName: 'entrance' },
            { type: 'WALK_TO_WP', floor: 0, wpName: 'lobby_center' },
            { type: 'SIT', floor: 0, wpName: 'lobby_stand_center' },
            { type: 'WAIT_SIM', duration: 5 + Math.random() * 15 },
            { type: 'STAND' },
            { type: 'WALK_TO_WP', floor: 0, wpName: 'lobby_center' },
            { type: 'WALK_TO_WP', floor: 0, wpName: 'entrance' },
            { type: 'WALK_TO_WP', floor: 0, wpName: 'front_door_threshold' },
            { type: 'WALK_TO_WP', floor: 0, wpName: 'outside' },
            { type: 'EXIT_BUILDING' }
        ];
    }
    planVisitorLoungeUpper() {
        const floor = Math.floor(Math.random() * 5) + 1;
        return [
            { type: 'WALK_TO_WP', floor: 0, wpName: 'front_door_threshold' },
            { type: 'WALK_TO_WP', floor: 0, wpName: 'entrance' },
            { type: 'WALK_TO_WP', floor: 0, wpName: 'lobby_center' },
            { type: 'WAIT_AT_PANEL', floor: 0, dir: 1, toFloor: floor },
            { type: 'ENTER_ELEVATOR', toFloor: floor },
            { type: 'PRESS_FLOOR', floor: floor },
            { type: 'WAIT_FOR_FLOOR', floor: floor },
            { type: 'EXIT_ELEVATOR', floor: floor },
            { type: 'WALK_TO_WP', floor: floor, wpName: 'lounge_door' },
            { type: 'SIT', floor: floor, wpName: 'lounge_spot0' },
            { type: 'WAIT_SIM', duration: 10 + Math.random() * 20 },
            { type: 'STAND' },
            { type: 'WAIT_AT_PANEL', floor: floor, dir: -1, toFloor: 0 },
            { type: 'ENTER_ELEVATOR', toFloor: 0 },
            { type: 'PRESS_FLOOR', floor: 0 },
            { type: 'WAIT_FOR_FLOOR', floor: 0 },
            { type: 'EXIT_ELEVATOR', floor: 0 },
            { type: 'WALK_TO_WP', floor: 0, wpName: 'lobby_center' },
            { type: 'WALK_TO_WP', floor: 0, wpName: 'entrance' },
            { type: 'WALK_TO_WP', floor: 0, wpName: 'front_door_threshold' },
            { type: 'WALK_TO_WP', floor: 0, wpName: 'outside' },
            { type: 'EXIT_BUILDING' }
        ];
    }
    planVisitorMeeting() {
        const floor = Math.floor(Math.random() * 5) + 1;
        const seatIdx = Math.floor(Math.random() * 4);
        const seatName = 'conf_seat' + seatIdx;
        return [
            { type: 'WALK_TO_WP', floor: 0, wpName: 'front_door_threshold' },
            { type: 'WALK_TO_WP', floor: 0, wpName: 'entrance' },
            { type: 'WALK_TO_WP', floor: 0, wpName: 'lobby_center' },
            { type: 'WAIT_AT_PANEL', floor: 0, dir: 1, toFloor: floor },
            { type: 'ENTER_ELEVATOR', toFloor: floor },
            { type: 'PRESS_FLOOR', floor: floor },
            { type: 'WAIT_FOR_FLOOR', floor: floor },
            { type: 'EXIT_ELEVATOR', floor: floor },
            { type: 'WALK_TO_WP', floor: floor, wpName: 'conf_door' },
            { type: 'SIT', floor: floor, wpName: seatName },
            { type: 'WAIT_SIM', duration: 20 + Math.random() * 30 },
            { type: 'STAND' },
            { type: 'RELEASE_SEAT' },
            { type: 'WAIT_AT_PANEL', floor: floor, dir: -1, toFloor: 0 },
            { type: 'ENTER_ELEVATOR', toFloor: 0 },
            { type: 'PRESS_FLOOR', floor: 0 },
            { type: 'WAIT_FOR_FLOOR', floor: 0 },
            { type: 'EXIT_ELEVATOR', floor: 0 },
            { type: 'WALK_TO_WP', floor: 0, wpName: 'lobby_center' },
            { type: 'WALK_TO_WP', floor: 0, wpName: 'entrance' },
            { type: 'WALK_TO_WP', floor: 0, wpName: 'front_door_threshold' },
            { type: 'WALK_TO_WP', floor: 0, wpName: 'outside' },
            { type: 'EXIT_BUILDING' }
        ];
    }
}
let simClock = new SimClock();
let agents = [];
let targetOccupancy = 45;
let scene, camera, renderer, controls, world, elevator;

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x222233);
    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(28, 24, 28);
    renderer = new THREE.WebGLRenderer({antialias: true, alpha: true});
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.sortObjects = true;
    document.body.appendChild(renderer.domElement);
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    const amb = new THREE.AmbientLight(0xffffff, 0.5);
    const sun = new THREE.DirectionalLight(0xffffff, 1);
    sun.position.set(10, 20, 10);
    const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.5);
    scene.add(amb, sun, hemi);
    world = createWorld(scene);
    elevator = new Elevator(scene, world);
    window.simClock = simLclock;
    window.agents = agents;
    
    for (let i = 0; i < MAX_WORKERS; i++) {
        const a = new Agent(i, 'WORKER', world, elevator);
        a.setPlan(a.planArriveToDesk());
        agents.push(a);
    }
    for (let i = MAX_WORKERS; i < MAX_OCCUPANCY; i++) {
        agents.push(new Agent(i, 'VISITOR', world, elevator));
    }
    
    window.onDayWrap = () => {
        elevator.reset();
        agents.forEach(a => {
            if (a.group) a.despLox();
            a.randomizeSchedule();
            if (a.role === 'WORKER') a.setPlan(a.planArriveToDesk());
            else a.state = 'DISABLED';
        });
    };

    createUI();
}
function createUI() {
    const div = document.createElement('div');
    div.style.position = 'absolute';
    div.style.top = '10px';
    div.style.left = '10px';
    div.style.color = 'white';
    div.style.fontFamily = 'monospace';
    div.style.background = 'rgba(0,0,0,0.5)';
    div.style.padding = '10px';
    document.body.appendChild(div);
    window.hud = div;
}

function updateHUD() {
    if (!window.hud) return;
    window.hud.innerHTML = `
        Time: ${simClock.format()}<br>
        Elevator: ${elevator.currentFloor} ${elevator.direction === 1 ? '^' : (elevator.direction === -1 ? 'v' : '')} (${elevator.state})<br>
        Passengers: ${elevator.passengers.size} / 4
    `;
}

function loop() {
    const realDt = 0.016;
    simClock.tick(realDt);
    const motionDt = realDt * simClock.timeScale;
    elevator.tick(motionDt);
    agents.forEach(a => a.process(motionDt));
    agents.forEach(a => {
        if (a.group) animatePersonWalking(a.group, motionDt);
    });
    controls.update();
    renderer.render(scene, camera);
    updateHUD();
    requestAnimationFrame(loop);
}

window.onload = () => {
    init();
    loop();
};
