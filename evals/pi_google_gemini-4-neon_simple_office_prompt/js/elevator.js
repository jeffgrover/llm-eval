(function () {
  'use strict';

  var OfficeSim = (window.OfficeSim = window.OfficeSim || {});
  var CFG = OfficeSim.CONFIG;

  function ElevatorCar(id, shaftIndex, building, scene) {
    this.id = id;
    this.name = shaftIndex === 0 ? 'Car A (West)' : 'Car B (East)';
    this.shaftIndex = shaftIndex;
    this.building = building;
    this.scene = scene;

    this.x = CFG.ELEVATOR_X[shaftIndex];
    this.z = CFG.ELEVATOR_Z;
    this.y = 0; // floor 0
    this.velocity = 0;
    this.currentFloor = 0;
    this.targetFloor = null;
    this.direction = 0; // -1 down, 0 idle, +1 up

    this.state = 'IDLE'; // 'IDLE' | 'MOVING' | 'DOOR_OPENING' | 'BOARDING' | 'DOOR_CLOSING'
    this.doorOpen = 0;   // 0..1
    this.dwellTimer = 0;

    this.carStops = {};  // floor -> true (cab destination buttons)
    this.hallStops = {}; // floor -> { up: bool, down: bool }
    this.passengers = []; // array of Worker references
    this.boardingWorkers = []; // workers currently walking in/out
    this.tripsCompleted = 0;

    // 6 neat standing slots inside the cab
    this.slotOffsets = [
      [-0.55, -0.45], [0.0, -0.45], [0.55, -0.45],
      [-0.55,  0.35], [0.0,  0.35], [0.55,  0.35]
    ];

    this._buildMesh();
  }

  ElevatorCar.prototype._buildMesh = function () {
    this.group = new THREE.Group();
    this.group.position.set(this.x, this.y, this.z);
    this.group.userData.elevator = this;

    var w = CFG.ELEVATOR_WIDTH - 0.16;
    var d = CFG.ELEVATOR_DEPTH - 0.16;
    var h = 2.55;

    var frameMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.72, roughness: 0.3 });
    var floorMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.6 });
    var wallGlass = new THREE.MeshStandardMaterial({
      color: 0xe0f2fe,
      roughness: 0.12,
      transparent: true,
      opacity: 0.34,
      side: THREE.DoubleSide
    });
    var ceilingMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xfff4d6,
      emissiveIntensity: 1.15
    });

    // Floor & Roof
    var floor = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, d), floorMat);
    floor.position.y = 0.06;
    this.group.add(floor);

    var roof = new THREE.Mesh(new THREE.BoxGeometry(w, 0.14, d), frameMat);
    roof.position.y = h;
    this.group.add(roof);

    // Glowing ceiling panel
    var lightPanel = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.3, d - 0.3), ceilingMat);
    lightPanel.rotation.x = Math.PI / 2;
    lightPanel.position.y = h - 0.08;
    this.group.add(lightPanel);

    // Glass back & side walls (so riders are clearly visible from any angle)
    var back = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.06), wallGlass);
    back.position.set(0, h / 2, -d / 2);
    this.group.add(back);

    for (var s = -1; s <= 1; s += 2) {
      var side = new THREE.Mesh(new THREE.BoxGeometry(0.06, h, d), wallGlass);
      side.position.set(s * (w / 2), h / 2, 0);
      this.group.add(side);
      // Corner mullions
      var post = new THREE.Mesh(new THREE.BoxGeometry(0.1, h, 0.1), frameMat);
      post.position.set(s * (w / 2), h / 2, d / 2);
      this.group.add(post);
    }

    // Warm cab accent handrail
    var rail = new THREE.Mesh(new THREE.BoxGeometry(w - 0.2, 0.06, 0.06), new THREE.MeshStandardMaterial({ color: 0xfbbf24, metalness: 0.8, roughness: 0.2 }));
    rail.position.set(0, 0.95, -d / 2 + 0.12);
    this.group.add(rail);

    // Tag all children for raycasting selection
    var self = this;
    this.group.traverse(function (obj) {
      obj.userData.elevator = self;
    });

    this.scene.add(this.group);

    // Hoist cable & counterweight
    var maxH = CFG.ROOF_FLOOR * CFG.FLOOR_HEIGHT + 3.2;
    this.cable = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, 1, 6),
      new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.8, roughness: 0.3 })
    );
    this.cable.position.set(this.x, maxH / 2, this.z);
    this.scene.add(this.cable);

    this.counterweight = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 1.6, 0.2),
      new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.6, roughness: 0.4 })
    );
    this.counterweight.position.set(this.x, maxH - 2, this.z - 1.15);
    this.scene.add(this.counterweight);
  };

  ElevatorCar.prototype.getFollowPoint = function (outVec) {
    outVec.set(this.x, this.y + 1.4, this.z);
    return outVec;
  };

  ElevatorCar.prototype.addCarStop = function (floor) {
    this.carStops[floor] = true;
  };

  ElevatorCar.prototype.addHallStop = function (floor, dir) {
    if (!this.hallStops[floor]) {
      this.hallStops[floor] = { up: false, down: false };
    }
    if (dir >= 0) this.hallStops[floor].up = true;
    else this.hallStops[floor].down = true;
  };

  ElevatorCar.prototype.hasAnyStops = function () {
    for (var f in this.carStops) if (this.carStops[f]) return true;
    for (var hf in this.hallStops) {
      if (this.hallStops[hf] && (this.hallStops[hf].up || this.hallStops[hf].down)) return true;
    }
    return false;
  };

  ElevatorCar.prototype.getSlotWorldPos = function (index) {
    var slot = this.slotOffsets[index % this.slotOffsets.length];
    return { x: this.x + slot[0], z: this.z + slot[1] };
  };

  ElevatorCar.prototype.getFreeSlotIndex = function () {
    for (var i = 0; i < CFG.ELEVATOR_CAPACITY; i++) {
      var used = false;
      for (var p = 0; p < this.passengers.length; p++) {
        if (this.passengers[p].elevatorSlot === i) {
          used = true;
          break;
        }
      }
      if (!used) return i;
    }
    return 0;
  };

  ElevatorCar.prototype._pickNextTarget = function () {
    var cur = this.currentFloor;
    var stops = [];
    for (var f = 0; f <= CFG.ROOF_FLOOR; f++) {
      var hs = this.hallStops[f];
      if (this.carStops[f] || (hs && (hs.up || hs.down))) {
        stops.push(f);
      }
    }
    if (stops.length === 0) {
      this.direction = 0;
      return null;
    }

    // LOOK algorithm: continue in current direction if any stops ahead
    if (this.direction >= 0) {
      var above = stops.filter(function (s) { return s > cur; });
      if (above.length > 0) {
        this.direction = 1;
        return Math.min.apply(null, above);
      }
    }
    if (this.direction <= 0) {
      var below = stops.filter(function (s) { return s < cur; });
      if (below.length > 0) {
        this.direction = -1;
        return Math.max.apply(null, below);
      }
    }

    // Reverse direction if stops exist only on the other side
    var anyAbove = stops.filter(function (s) { return s > cur; });
    if (anyAbove.length > 0) {
      this.direction = 1;
      return Math.min.apply(null, anyAbove);
    }
    var anyBelow = stops.filter(function (s) { return s < cur; });
    if (anyBelow.length > 0) {
      this.direction = -1;
      return Math.max.apply(null, anyBelow);
    }

    // Stop is on current floor
    return cur;
  };

  ElevatorCar.prototype.update = function (dt, system) {
    var maxH = CFG.ROOF_FLOOR * CFG.FLOOR_HEIGHT + 3.2;

    if (this.state === 'IDLE') {
      var next = this._pickNextTarget();
      if (next !== null) {
        this.targetFloor = next;
        if (next === this.currentFloor) {
          this.state = 'DOOR_OPENING';
          this.building.setHallLantern(this.currentFloor, this.shaftIndex, this.direction || 1);
        } else {
          this.state = 'MOVING';
          this.direction = next > this.currentFloor ? 1 : -1;
        }
      }
    } else if (this.state === 'MOVING') {
      // Dynamically check if a closer stop in our direction appeared
      var dynamicNext = this._pickNextTarget();
      if (dynamicNext !== null && dynamicNext !== this.currentFloor) {
        if ((this.direction > 0 && dynamicNext > this.currentFloor && dynamicNext < this.targetFloor) ||
            (this.direction < 0 && dynamicNext < this.currentFloor && dynamicNext > this.targetFloor)) {
          this.targetFloor = dynamicNext;
        }
      }

      var targetY = this.targetFloor * CFG.FLOOR_HEIGHT;
      var diff = targetY - this.y;
      var dist = Math.abs(diff);
      var sign = diff >= 0 ? 1 : -1;

      // Smooth braking profile
      var stopDist = (this.velocity * this.velocity) / (2 * CFG.ELEVATOR_ACCEL);
      if (dist <= stopDist + 0.08) {
        // Decelerate smoothly
        this.velocity -= sign * CFG.ELEVATOR_ACCEL * dt;
        if (sign * this.velocity < 0.35) {
          this.velocity = sign * 0.35;
        }
      } else {
        this.velocity += sign * CFG.ELEVATOR_ACCEL * dt;
        this.velocity = OfficeSim.Utils.clamp(this.velocity, -CFG.ELEVATOR_MAX_SPEED, CFG.ELEVATOR_MAX_SPEED);
      }

      var step = this.velocity * dt;
      if (Math.abs(step) >= dist || dist < 0.04) {
        this.y = targetY;
        this.velocity = 0;
        this.currentFloor = this.targetFloor;
        this.tripsCompleted++;
        this.state = 'DOOR_OPENING';
        this.building.setHallLantern(this.currentFloor, this.shaftIndex, this.direction || 1);
      } else {
        this.y += step;
        this.currentFloor = Math.round(this.y / CFG.FLOOR_HEIGHT);
      }
    } else if (this.state === 'DOOR_OPENING') {
      this.doorOpen = Math.min(1, this.doorOpen + dt / CFG.ELEVATOR_DOOR_TIME);
      this.building.setShaftDoorOpen(this.currentFloor, this.shaftIndex, this.doorOpen);
      if (this.doorOpen >= 1) {
        this.state = 'BOARDING';
        this.dwellTimer = CFG.ELEVATOR_DWELL_MIN;
        // Clear stop flags for this floor
        delete this.carStops[this.currentFloor];
        delete this.hallStops[this.currentFloor];
        system.notifyCarArrived(this);
      }
    } else if (this.state === 'BOARDING') {
      // Wait until all boarding/exiting workers finish walking through the doorway
      var activeWalkers = 0;
      for (var i = 0; i < this.boardingWorkers.length; i++) {
        if (this.boardingWorkers[i].isCrossingElevatorDoor()) {
          activeWalkers++;
        }
      }
      if (activeWalkers > 0) {
        this.dwellTimer = Math.max(this.dwellTimer, 0.6);
      } else {
        this.dwellTimer -= dt;
      }

      if (this.dwellTimer <= 0 && activeWalkers === 0) {
        this.boardingWorkers = [];
        this.state = 'DOOR_CLOSING';
      }
    } else if (this.state === 'DOOR_CLOSING') {
      this.doorOpen = Math.max(0, this.doorOpen - dt / CFG.ELEVATOR_DOOR_TIME);
      this.building.setShaftDoorOpen(this.currentFloor, this.shaftIndex, this.doorOpen);
      if (this.doorOpen <= 0) {
        this.building.setHallLantern(this.currentFloor, this.shaftIndex, 0);
        this.state = 'IDLE';
      }
    }

    // Update 3D cab, cable, counterweight, and riding passengers
    this.group.position.y = this.y;

    var cableLen = Math.max(0.5, maxH - (this.y + 2.55));
    this.cable.scale.y = cableLen;
    this.cable.position.y = this.y + 2.55 + cableLen / 2;

    this.counterweight.position.y = OfficeSim.Utils.clamp(maxH - 2.0 - this.y, 1.2, maxH - 1.5);

    // Sync riding passengers' Y position with cab
    for (var p = 0; p < this.passengers.length; p++) {
      var w = this.passengers[p];
      if (w.state === 'RIDING_ELEVATOR') {
        w.setWorldY(this.y);
      }
    }
  };

  // --- ElevatorSystem (Dispatcher managing both cars) ---

  function ElevatorSystem(building, scene) {
    this.building = building;
    this.scene = scene;
    this.cars = [
      new ElevatorCar('elev_a', 0, building, scene),
      new ElevatorCar('elev_b', 1, building, scene)
    ];

    // Waiting queues per floor: waitingByFloor[f] = [{ worker, targetFloor, dir, requestTime }]
    this.waitingByFloor = [];
    for (var f = 0; f <= CFG.ROOF_FLOOR; f++) {
      this.waitingByFloor.push([]);
    }

    this.totalWaitSec = 0;
    this.waitSamples = 0;
    this.simElapsed = 0;
  }

  ElevatorSystem.prototype.requestElevator = function (worker, fromFloor, toFloor) {
    var dir = toFloor > fromFloor ? 1 : -1;
    var req = {
      worker: worker,
      fromFloor: fromFloor,
      toFloor: toFloor,
      dir: dir,
      requestTime: this.simElapsed,
      assignedCar: null
    };
    this.waitingByFloor[fromFloor].push(req);

    // If a car is ALREADY open & boarding on this floor with capacity, board immediately!
    for (var i = 0; i < this.cars.length; i++) {
      var c = this.cars[i];
      if (c.currentFloor === fromFloor && c.state === 'BOARDING' && c.passengers.length < CFG.ELEVATOR_CAPACITY) {
        if (c.direction === 0 || c.direction === dir || c.passengers.length === 0) {
          this._boardWaitingWorker(c, req);
          return req;
        }
      }
    }

    // Dispatch best car using least-cost heuristic
    var bestCar = this._chooseBestCar(fromFloor, dir);
    req.assignedCar = bestCar;
    bestCar.addHallStop(fromFloor, dir);
    return req;
  };

  ElevatorSystem.prototype._chooseBestCar = function (floor, dir) {
    var best = this.cars[0];
    var bestScore = Infinity;

    for (var i = 0; i < this.cars.length; i++) {
      var car = this.cars[i];
      var dist = Math.abs(car.y / CFG.FLOOR_HEIGHT - floor);
      var score = dist;

      // Prefer idle cars or cars moving toward this floor in the same direction
      if (car.state === 'IDLE') {
        score -= 1.2;
      } else if (car.direction === dir) {
        var approaching = (dir > 0 && car.currentFloor <= floor) || (dir < 0 && car.currentFloor >= floor);
        if (approaching) score -= 0.8;
        else score += 6.0;
      } else {
        score += 5.0;
      }

      // Penalize full or near-full cars
      if (car.passengers.length >= CFG.ELEVATOR_CAPACITY) {
        score += 18.0;
      } else {
        score += car.passengers.length * 0.6;
      }

      if (score < bestScore) {
        bestScore = score;
        best = car;
      }
    }
    return best;
  };

  ElevatorSystem.prototype.notifyCarArrived = function (car) {
    var f = car.currentFloor;

    // 1. Alight passengers whose destination is this floor
    var remaining = [];
    for (var i = 0; i < car.passengers.length; i++) {
      var rider = car.passengers[i];
      if (rider.elevatorTargetFloor === f) {
        car.boardingWorkers.push(rider);
        rider.onElevatorExit(car);
      } else {
        remaining.push(rider);
      }
    }
    car.passengers = remaining;

    // 2. Board waiting workers on this floor
    var queue = this.waitingByFloor[f];
    var stillWaiting = [];
    for (var q = 0; q < queue.length; q++) {
      var req = queue[q];
      var canFit = car.passengers.length < CFG.ELEVATOR_CAPACITY;
      var dirOk = (car.direction === 0 || car.passengers.length === 0 || req.dir === car.direction);
      if (canFit && dirOk) {
        this._boardWaitingWorker(car, req);
      } else {
        stillWaiting.push(req);
      }
    }
    this.waitingByFloor[f] = stillWaiting;

    // If anyone is still waiting (e.g. cab was full or opposite direction), re-dispatch a car
    for (var w = 0; w < stillWaiting.length; w++) {
      var other = this._chooseBestCar(f, stillWaiting[w].dir);
      other.addHallStop(f, stillWaiting[w].dir);
    }
  };

  ElevatorSystem.prototype._boardWaitingWorker = function (car, req) {
    // Remove from waiting queue if still in it
    var q = this.waitingByFloor[req.fromFloor];
    var idx = q.indexOf(req);
    if (idx !== -1) q.splice(idx, 1);

    // Record wait telemetry
    var waitSec = Math.max(0, this.simElapsed - req.requestTime);
    this.totalWaitSec += waitSec;
    this.waitSamples++;

    var slotIdx = car.getFreeSlotIndex();
    req.worker.elevatorSlot = slotIdx;
    car.passengers.push(req.worker);
    car.boardingWorkers.push(req.worker);
    car.addCarStop(req.toFloor);
    if (car.direction === 0) {
      car.direction = req.dir;
    }
    req.worker.onElevatorBoard(car, slotIdx);
  };

  ElevatorSystem.prototype.getAverageWaitSec = function () {
    if (this.waitSamples === 0) return 0;
    return this.totalWaitSec / this.waitSamples;
  };

  ElevatorSystem.prototype.update = function (dt) {
    this.simElapsed += dt;
    for (var i = 0; i < this.cars.length; i++) {
      this.cars[i].update(dt, this);
    }
  };

  OfficeSim.ElevatorCar = ElevatorCar;
  OfficeSim.ElevatorSystem = ElevatorSystem;
})();
