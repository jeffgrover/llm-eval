import * as THREE from 'three';
import { BUILDING } from './config.js';

const CAB_CAPACITY = 6;
const CAB_SLOTS_LOCAL = [
  { x: -0.56, z: -0.42 },
  { x:  0.00, z: -0.45 },
  { x:  0.56, z: -0.42 },
  { x: -0.52, z:  0.24 },
  { x:  0.52, z:  0.24 },
  { x:  0.00, z:  0.18 }
];

export class ElevatorSystem {
  constructor(scene, building) {
    this.scene = scene;
    this.building = building;
    this.group = new THREE.Group();
    this.scene.add(this.group);

    // Hall waiting queues: floor -> array of { worker, toFloor, dir, waitSlot }
    this.hallWaiters = Array.from({ length: BUILDING.numFloors }, () => []);
    // Active hall calls: key "floor:dir" -> { floor, dir, assignedCarId }
    this.hallCalls = new Map();

    // Waiting slot occupancy per floor
    this.floorWaitSlots = Array.from({ length: BUILDING.numFloors }, () => this._createFloorWaitSlots());

    this.cars = [];
    this.landingDoors = []; // [carIdx][floor] -> { left, right, upLedMat, downLedMat }

    this._buildShaftsAndCars();
  }

  _createFloorWaitSlots() {
    // 14 polite waiting spots flanking the 3 elevator doorways so center exit lanes stay clear
    const coords = [
      [-4.15, -5.85], [-2.25, -5.85], [-0.95, -5.85], [0.95, -5.85], [2.25, -5.85], [4.15, -5.85],
      [-3.85, -5.05], [-2.50, -5.05], [-0.75, -5.05], [0.75, -5.05], [2.50, -5.05], [3.85, -5.05],
      [-1.60, -6.35], [1.60, -6.35]
    ];
    return coords.map(([x, z]) => ({ x, z, occupiedBy: null }));
  }

  _buildShaftsAndCars() {
    const totalH = BUILDING.numFloors * BUILDING.floorHeight;
    const railMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.75, roughness: 0.35 });
    const cableMat = new THREE.MeshBasicMaterial({ color: 0x475569 });
    const cabFrameMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.7, roughness: 0.28 });
    const brushedSteel = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.82, roughness: 0.24 });
    const cabGlassMat = new THREE.MeshStandardMaterial({
      color: 0xe0f2fe,
      transparent: true,
      opacity: 0.3,
      roughness: 0.08,
      metalness: 0.25,
      depthWrite: false
    });
    const counterweightMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.6, roughness: 0.5 });

    const labels = ['A', 'B', 'C'];

    BUILDING.elevatorShaftsX.forEach((sx, carIdx) => {
      const sz = BUILDING.elevatorZ;
      this.landingDoors[carIdx] = [];

      // 1. Vertical Steel Guide Rails & Glass Shaft Dividers
      [-1.02, 1.02].forEach(rx => {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, totalH, 0.08), railMat);
        rail.position.set(sx + rx, totalH / 2, sz);
        this.group.add(rail);
      });

      // Counterweight moving in opposite direction at rear of shaft
      const cw = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.85, 0.16), counterweightMat);
      cw.position.set(sx, totalH - 2.0, sz - 1.05);
      this.group.add(cw);

      // Hoist Cables
      [-0.22, 0, 0.22].forEach(cx => {
        const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, totalH, 6), cableMat);
        cable.position.set(sx + cx, totalH / 2, sz);
        this.group.add(cable);
      });

      // 2. Landing Doors & Hall Lanterns on Every Floor (attached to building.floorGroups[f] so floor isolation works!)
      for (let f = 0; f < BUILDING.numFloors; f++) {
        const fg = this.building.floorGroups[f];
        const doorZ = -7.32;

        const leftDoor = new THREE.Mesh(new THREE.BoxGeometry(0.74, 2.52, 0.05), brushedSteel);
        leftDoor.position.set(sx - 0.37, 1.26, doorZ);
        fg.add(leftDoor);

        const rightDoor = new THREE.Mesh(new THREE.BoxGeometry(0.74, 2.52, 0.05), brushedSteel);
        rightDoor.position.set(sx + 0.37, 1.26, doorZ);
        fg.add(rightDoor);

        // Doorway architrave frame
        const lintel = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.12, 0.34), cabFrameMat);
        lintel.position.set(sx, 2.56, -7.35);
        fg.add(lintel);

        // Hall Lantern Indicators (Up = Emerald, Down = Amber)
        const upLedMat = new THREE.MeshStandardMaterial({
          color: 0x334155,
          emissive: 0x10b981,
          emissiveIntensity: 0.0
        });
        const downLedMat = new THREE.MeshStandardMaterial({
          color: 0x334155,
          emissive: 0xf59e0b,
          emissiveIntensity: 0.0
        });

        const upTri = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.14, 3), upLedMat);
        upTri.position.set(sx - 0.14, 2.78, -7.18);
        upTri.rotation.x = 0;
        fg.add(upTri);

        const downTri = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.14, 3), downLedMat);
        downTri.position.set(sx + 0.14, 2.78, -7.18);
        downTri.rotation.z = Math.PI;
        fg.add(downTri);

        this.landingDoors[carIdx][f] = { left: leftDoor, right: rightDoor, upLedMat, downLedMat, baseX: sx };
      }

      // 3. Scenic Glass-Back Elevator Cab
      const cabGroup = new THREE.Group();
      const startFloor = carIdx === 0 ? 0 : (carIdx === 1 ? 1 : 2);
      const startY = startFloor * BUILDING.floorHeight;
      cabGroup.position.set(sx, startY, sz);

      // Cab floor & roof
      const cabFloor = new THREE.Mesh(
        new THREE.BoxGeometry(1.96, 0.12, 1.76),
        new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.45 })
      );
      cabFloor.position.y = 0.06;
      cabGroup.add(cabFloor);

      const cabRoof = new THREE.Mesh(new THREE.BoxGeometry(1.98, 0.14, 1.78), cabFrameMat);
      cabRoof.position.y = 2.72;
      cabGroup.add(cabRoof);

      // Warm glowing cab ceiling diffuser
      const cabCeilingGlow = new THREE.Mesh(
        new THREE.BoxGeometry(1.55, 0.04, 1.35),
        new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfef3c7, emissiveIntensity: 1.3 })
      );
      cabCeilingGlow.position.y = 2.63;
      cabGroup.add(cabCeilingGlow);

      // Side walls (warm wood lower + glass upper) & panoramic glass rear wall
      [-0.95, 0.95].forEach(wx => {
        const lower = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.1, 1.72), this.building.mats.woodAccent);
        lower.position.set(wx, 0.6, 0);
        cabGroup.add(lower);

        const upper = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.5, 1.72), cabGlassMat);
        upper.position.set(wx, 1.9, 0);
        cabGroup.add(upper);

        const handrail = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 1.45), brushedSteel);
        handrail.position.set(wx - Math.sign(wx) * 0.05, 0.96, 0);
        cabGroup.add(handrail);
      });

      const rearGlass = new THREE.Mesh(new THREE.BoxGeometry(1.92, 2.55, 0.05), cabGlassMat);
      rearGlass.position.set(0, 1.36, -0.86);
      cabGroup.add(rearGlass);

      // Cab Dual Sliding Doors
      const cabLeftDoor = new THREE.Mesh(new THREE.BoxGeometry(0.72, 2.5, 0.04), brushedSteel);
      cabLeftDoor.position.set(-0.36, 1.32, 0.88);
      cabGroup.add(cabLeftDoor);

      const cabRightDoor = new THREE.Mesh(new THREE.BoxGeometry(0.72, 2.5, 0.04), brushedSteel);
      cabRightDoor.position.set(0.36, 1.32, 0.88);
      cabGroup.add(cabRightDoor);

      this.group.add(cabGroup);

      this.cars.push({
        id: carIdx,
        label: labels[carIdx],
        x: sx,
        z: sz,
        y: startY,
        velocity: 0,
        currentFloor: startFloor,
        targetFloor: null,
        direction: 0, // -1, 0, +1
        state: 'IDLE',
        doorOpen: 0,
        stateTimer: 0,
        holdTimer: 0,
        carCalls: new Set(),
        passengers: [],
        slotOccupancy: new Array(CAB_CAPACITY).fill(null),
        cabGroup,
        cabLeftDoor,
        cabRightDoor,
        counterweight: cw,
        maxShaftY: (BUILDING.numFloors - 1) * BUILDING.floorHeight
      });
    });
  }

  // ==================== Public Dispatch API ====================

  allocateWaitSlot(floor, worker) {
    const slots = this.floorWaitSlots[floor];
    for (const s of slots) {
      if (!s.occupiedBy || s.occupiedBy === worker) {
        s.occupiedBy = worker;
        return s;
      }
    }
    // Fallback slightly offset slot if very crowded morning rush
    return {
      x: (Math.random() - 0.5) * 6.5,
      z: -4.7 - Math.random() * 0.8,
      occupiedBy: worker,
      isTemp: true
    };
  }

  releaseWaitSlot(floor, worker) {
    const slots = this.floorWaitSlots[floor];
    if (!slots) return;
    for (const s of slots) {
      if (s.occupiedBy === worker) s.occupiedBy = null;
    }
  }

  requestHallCall(worker, fromFloor, toFloor) {
    if (fromFloor === toFloor) return;
    const dir = toFloor > fromFloor ? 1 : -1;

    // Avoid duplicate entry
    if (!this.hallWaiters[fromFloor].some(w => w.worker === worker)) {
      this.hallWaiters[fromFloor].push({ worker, toFloor, dir });
    }

    const key = `${fromFloor}:${dir}`;
    if (!this.hallCalls.has(key)) {
      this.hallCalls.set(key, { floor: fromFloor, dir, assignedCarId: null });
    }

    // If a car is ALREADY boarding or closing doors at fromFloor and compatible, reopen/board immediately!
    for (const car of this.cars) {
      if (
        car.currentFloor === fromFloor &&
        Math.abs(car.y - fromFloor * BUILDING.floorHeight) < 0.08 &&
        (car.state === 'BOARDING' || car.state === 'DOORS_CLOSING' || car.state === 'DOORS_OPENING') &&
        (car.direction === 0 || car.direction === dir) &&
        this._availableCabSlots(car) > 0
      ) {
        if (car.state === 'DOORS_CLOSING') {
          car.state = 'DOORS_OPENING';
        }
        if (car.direction === 0) car.direction = dir;
        this._inviteHallWaitersToBoard(car, fromFloor);
        return;
      }
    }

    this._assignHallCalls();
  }

  cancelWaiter(worker) {
    for (let f = 0; f < BUILDING.numFloors; f++) {
      this.hallWaiters[f] = this.hallWaiters[f].filter(w => w.worker !== worker);
      this.releaseWaitSlot(f, worker);
    }
  }

  pressCarButton(car, destFloor) {
    if (destFloor >= 0 && destFloor < BUILDING.numFloors) {
      car.carCalls.add(destFloor);
    }
  }

  claimCabSlot(car, worker) {
    for (let i = 0; i < CAB_CAPACITY; i++) {
      if (!car.slotOccupancy[i] || car.slotOccupancy[i] === worker) {
        car.slotOccupancy[i] = worker;
        if (!car.passengers.includes(worker)) {
          car.passengers.push(worker);
        }
        return {
          index: i,
          worldX: car.x + CAB_SLOTS_LOCAL[i].x,
          worldZ: car.z + CAB_SLOTS_LOCAL[i].z
        };
      }
    }
    return null;
  }

  leaveCab(car, worker) {
    car.passengers = car.passengers.filter(p => p !== worker);
    for (let i = 0; i < CAB_CAPACITY; i++) {
      if (car.slotOccupancy[i] === worker) car.slotOccupancy[i] = null;
    }
  }

  _availableCabSlots(car) {
    let free = 0;
    for (let i = 0; i < CAB_CAPACITY; i++) {
      if (!car.slotOccupancy[i]) free++;
    }
    return free;
  }

  // ==================== Collective-Selective Group Controller ====================

  _assignHallCalls() {
    // Prune hall calls that no longer have waiting workers
    for (const [key, hc] of this.hallCalls.entries()) {
      const stillWaiting = this.hallWaiters[hc.floor].some(
        w => w.dir === hc.dir && w.worker.isReadyAtElevatorHall()
      ) || this.hallWaiters[hc.floor].some(w => w.dir === hc.dir);

      if (!stillWaiting) {
        this.hallCalls.delete(key);
      }
    }

    // Score each active hall call against all 3 cars
    for (const hc of this.hallCalls.values()) {
      // Keep existing assignment if that car is still healthy & not full
      if (hc.assignedCarId !== null) {
        const assignedCar = this.cars[hc.assignedCarId];
        if (assignedCar && this._availableCabSlots(assignedCar) > 0) continue;
      }

      let bestCar = null;
      let bestCost = Infinity;
      const callY = hc.floor * BUILDING.floorHeight;

      for (const car of this.cars) {
        const distFloors = Math.abs(car.y - callY) / BUILDING.floorHeight;
        let cost = distFloors * 2.2;

        if (this._availableCabSlots(car) === 0) {
          cost += 40; // full cab penalty
        }

        if (car.direction === 0 && car.state === 'IDLE') {
          cost += 0.2;
        } else if (car.direction === hc.dir) {
          const movingToward =
            (car.direction === 1 && car.y <= callY + 0.15) ||
            (car.direction === -1 && car.y >= callY - 0.15);
          cost += movingToward ? 0.5 : 14.0;
        } else {
          cost += 9.5;
        }

        cost += car.carCalls.size * 1.1;

        if (cost < bestCost) {
          bestCost = cost;
          bestCar = car;
        }
      }

      if (bestCar) {
        hc.assignedCarId = bestCar.id;
      }
    }
  }

  _chooseNextTargetForCar(car, simHour) {
    const curF = Math.round(car.y / BUILDING.floorHeight);

    // Collect all floors this car needs to visit (internal carCalls + assigned hallCalls)
    const stops = new Set(car.carCalls);
    for (const hc of this.hallCalls.values()) {
      if (hc.assignedCarId === car.id) {
        stops.add(hc.floor);
      }
    }

    if (stops.size === 0) {
      // Morning rush staging: keep Car A parked at Floor 0 if idle during 07:00 - 09:45
      if (car.id === 0 && simHour >= 7.0 && simHour <= 9.8 && curF !== 0) {
        car.direction = -1;
        return 0;
      }
      car.direction = 0;
      return null;
    }

    const sorted = Array.from(stops).sort((a, b) => a - b);

    // LOOK algorithm: continue in current direction if any stops lie ahead
    if (car.direction >= 0) {
      const aheadUp = sorted.filter(f => f * BUILDING.floorHeight >= car.y - 0.08);
      if (aheadUp.length > 0) {
        car.direction = aheadUp[0] > curF ? 1 : (aheadUp[0] < curF ? -1 : car.direction || 1);
        return aheadUp[0];
      }
      const below = sorted.filter(f => f < curF).reverse();
      if (below.length > 0) {
        car.direction = -1;
        return below[0];
      }
    } else {
      const aheadDown = sorted.filter(f => f * BUILDING.floorHeight <= car.y + 0.08).reverse();
      if (aheadDown.length > 0) {
        car.direction = aheadDown[0] < curF ? -1 : (aheadDown[0] > curF ? 1 : car.direction || -1);
        return aheadDown[0];
      }
      const above = sorted.filter(f => f > curF);
      if (above.length > 0) {
        car.direction = 1;
        return above[0];
      }
    }

    return sorted[0];
  }

  _shouldStopAtFloor(car, floor) {
    if (car.carCalls.has(floor)) return true;

    const freeSlots = this._availableCabSlots(car);
    if (freeSlots <= 0) return false;

    // Stop for hall call in same direction
    const sameDirKey = `${floor}:${car.direction}`;
    const sameCall = this.hallCalls.get(sameDirKey);
    if (sameCall && (sameCall.assignedCarId === car.id || sameCall.assignedCarId === null)) {
      return true;
    }

    // Or if this floor is the car's turn-around extreme target
    if (car.targetFloor === floor) {
      for (const d of [1, -1]) {
        const hc = this.hallCalls.get(`${floor}:${d}`);
        if (hc && hc.assignedCarId === car.id) return true;
      }
    }

    return false;
  }

  _onCarDoorsOpened(car, floor) {
    car.carCalls.delete(floor);

    // 1. Disembark passengers whose destination is this floor
    const exiting = car.passengers.filter(p => p.elevatorDestFloor === floor);
    exiting.forEach((worker, idx) => {
      this.leaveCab(car, worker);
      worker.beginElevatorExit(car, floor, idx * 0.25);
    });

    // 2. Determine effective departure direction from this floor so hall lanterns & waiters know!
    if (car.carCalls.size > 0) {
      const nextCarStop = Array.from(car.carCalls)[0];
      car.direction = nextCarStop > floor ? 1 : -1;
    } else {
      // Check hall calls at this floor
      const hasSameDir = car.direction !== 0 && this.hallWaiters[floor].some(w => w.dir === car.direction);
      if (!hasSameDir) {
        const oppWaiter = this.hallWaiters[floor][0];
        if (oppWaiter) {
          car.direction = oppWaiter.dir;
        } else {
          car.direction = 0;
        }
      }
    }

    // 3. Invite compatible hall waiters on this floor to board!
    this._inviteHallWaitersToBoard(car, floor);
  }

  _inviteHallWaitersToBoard(car, floor) {
    const waiters = this.hallWaiters[floor];
    if (!waiters || waiters.length === 0) return;

    // Prioritize workers already standing in the elevator lobby
    const candidates = waiters.filter(w => {
      if (!w.worker.canBoardElevatorNow(floor)) return false;
      if (car.direction === 0) return true;
      return w.dir === car.direction;
    });

    for (const item of candidates) {
      if (this._availableCabSlots(car) <= 0) break;
      if (car.direction === 0) car.direction = item.dir;

      const slotInfo = this.claimCabSlot(car, item.worker);
      if (!slotInfo) break;

      // Remove from hall queue & release wait slot
      this.hallWaiters[floor] = this.hallWaiters[floor].filter(w => w.worker !== item.worker);
      this.releaseWaitSlot(floor, item.worker);
      this.pressCarButton(car, item.toFloor);
      item.worker.beginElevatorBoard(car, slotInfo, item.toFloor);
      car.holdTimer = Math.max(car.holdTimer, 2.2);
    }

    // Clear hallCall if no waiters remain in that direction
    if (car.direction !== 0) {
      const remainingSameDir = this.hallWaiters[floor].some(w => w.dir === car.direction);
      if (!remainingSameDir) {
        this.hallCalls.delete(`${floor}:${car.direction}`);
      }
    }
  }

  // ==================== Physics & Frame Update ====================

  update(dt, simHour) {
    // Sub-step physics so high time-speed multipliers (e.g. 15x, 40x) stay buttery-smooth & exact
    const maxStep = 0.05;
    let remaining = Math.min(dt, 1.2);
    while (remaining > 0.0001) {
      const step = Math.min(remaining, maxStep);
      this._stepSimulation(step, simHour);
      remaining -= step;
    }

    this._syncVisualMeshes();
  }

  _stepSimulation(dt, simHour) {
    this._assignHallCalls();

    const maxSpeed = 4.6; // m/s (~1.1 floors/sec)
    const accel = 5.4;    // smooth S-like ramp

    for (const car of this.cars) {
      car.currentFloor = Math.max(0, Math.min(BUILDING.numFloors - 1, Math.round(car.y / BUILDING.floorHeight)));

      switch (car.state) {
        case 'IDLE': {
          const nextFloor = this._chooseNextTargetForCar(car, simHour);
          if (nextFloor !== null) {
            car.targetFloor = nextFloor;
            if (Math.abs(car.y - nextFloor * BUILDING.floorHeight) < 0.04) {
              car.y = nextFloor * BUILDING.floorHeight;
              car.currentFloor = nextFloor;
              car.state = 'DOORS_OPENING';
            } else {
              car.direction = nextFloor * BUILDING.floorHeight > car.y ? 1 : -1;
              car.state = 'MOVING';
            }
          }
          break;
        }

        case 'MOVING': {
          // Re-evaluate intermediate collective stops along our direction
          const refreshed = this._chooseNextTargetForCar(car, simHour);
          if (refreshed !== null) car.targetFloor = refreshed;
          if (car.targetFloor === null) {
            car.targetFloor = car.currentFloor;
          }

          const targetY = car.targetFloor * BUILDING.floorHeight;
          const diff = targetY - car.y;
          const dist = Math.abs(diff);
          const dirSign = Math.sign(diff);

          if (dist < 0.025 && Math.abs(car.velocity) < 0.35) {
            car.y = targetY;
            car.velocity = 0;
            car.currentFloor = car.targetFloor;

            if (this._shouldStopAtFloor(car, car.currentFloor) || car.carCalls.size > 0 || this.hallWaiters[car.currentFloor].length > 0) {
              car.state = 'DOORS_OPENING';
            } else {
              car.state = 'IDLE';
            }
          } else {
            // Braking envelope v_max_stop = sqrt(2 * a * dist)
            const safeSpeed = Math.min(maxSpeed, Math.sqrt(2 * accel * 0.85 * Math.max(dist, 0.001)));
            const desiredVel = dirSign * safeSpeed;
            const dv = desiredVel - car.velocity;
            const maxDv = accel * dt;
            car.velocity += THREE.MathUtils.clamp(dv, -maxDv, maxDv);
            const nextY = car.y + car.velocity * dt;

            // Prevent overshooting target floor
            if ((diff > 0 && nextY >= targetY) || (diff < 0 && nextY <= targetY)) {
              car.y = targetY;
              car.velocity = 0;
              car.currentFloor = car.targetFloor;
              car.state = 'DOORS_OPENING';
            } else {
              car.y = THREE.MathUtils.clamp(nextY, 0, car.maxShaftY);
            }
          }
          break;
        }

        case 'DOORS_OPENING': {
          car.doorOpen = Math.min(1, car.doorOpen + dt * 1.85);
          if (car.doorOpen >= 1) {
            car.state = 'BOARDING';
            car.stateTimer = 1.6;
            car.holdTimer = 1.6;
            this._onCarDoorsOpened(car, car.currentFloor);
          }
          break;
        }

        case 'BOARDING': {
          car.stateTimer -= dt;
          car.holdTimer -= dt;

          // Continuously accept newly arrived hall waiters on this floor while doors are open!
          this._inviteHallWaitersToBoard(car, car.currentFloor);

          // Hold doors if any boarding passenger is still crossing threshold (up to polite limit)
          const someoneCrossing = car.passengers.some(p => p.state === 'ELEVATOR_BOARDING');
          if ((!someoneCrossing && car.stateTimer <= 0) || car.holdTimer <= -2.5) {
            car.state = 'DOORS_CLOSING';
          }
          break;
        }

        case 'DOORS_CLOSING': {
          // Door beam sensor: if a compatible waiter just reached the hall and space remains, re-open!
          const lateWaiter = this.hallWaiters[car.currentFloor].some(
            w => w.worker.canBoardElevatorNow(car.currentFloor) &&
              (car.direction === 0 || w.dir === car.direction)
          );
          if (lateWaiter && this._availableCabSlots(car) > 0) {
            car.state = 'DOORS_OPENING';
            break;
          }

          car.doorOpen = Math.max(0, car.doorOpen - dt * 1.75);
          if (car.doorOpen <= 0) {
            const next = this._chooseNextTargetForCar(car, simHour);
            if (next !== null && next !== car.currentFloor) {
              car.targetFloor = next;
              car.direction = next > car.currentFloor ? 1 : -1;
              car.state = 'MOVING';
            } else {
              car.state = 'IDLE';
            }
          }
          break;
        }
      }
    }
  }

  _syncVisualMeshes() {
    for (const car of this.cars) {
      car.cabGroup.position.y = car.y;
      car.counterweight.position.y = car.maxShaftY - car.y + 1.1;

      // Cab sliding doors
      const cabSlide = 0.36 + car.doorOpen * 0.62;
      car.cabLeftDoor.position.x = -cabSlide;
      car.cabRightDoor.position.x = cabSlide;

      // Landing doors & hall indicators on all 5 floors
      for (let f = 0; f < BUILDING.numFloors; f++) {
        const ld = this.landingDoors[car.id][f];
        const isHere = f === car.currentFloor && Math.abs(car.y - f * BUILDING.floorHeight) < 0.12;
        const openAmt = isHere ? car.doorOpen : 0;
        const landSlide = 0.37 + openAmt * 0.64;

        ld.left.position.x = ld.baseX - landSlide;
        ld.right.position.x = ld.baseX + landSlide;

        // Hall Lantern glow
        const callUp = this.hallCalls.has(`${f}:1`);
        const callDown = this.hallCalls.has(`${f}:-1`);
        const arrivingUp = isHere && openAmt > 0.1 && car.direction >= 0;
        const arrivingDown = isHere && openAmt > 0.1 && car.direction < 0;

        ld.upLedMat.emissiveIntensity = arrivingUp ? 2.2 : (callUp ? 0.85 : 0.0);
        ld.downLedMat.emissiveIntensity = arrivingDown ? 2.2 : (callDown ? 0.85 : 0.0);
      }
    }
  }

  getTelemetry() {
    return this.cars.map(car => ({
      id: car.id,
      label: car.label,
      yNorm: car.y / Math.max(1, car.maxShaftY),
      floor: car.currentFloor,
      direction: car.direction,
      state: car.state,
      passengers: car.passengers.length,
      capacity: CAB_CAPACITY,
      stops: Array.from(car.carCalls).sort((a, b) => a - b)
    }));
  }
}
