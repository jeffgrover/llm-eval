(function () {
  'use strict';

  var OfficeSim = (window.OfficeSim = window.OfficeSim || {});
  var CFG = OfficeSim.CONFIG;
  var U = OfficeSim.Utils;

  function Worker(id, profile, workstation, scene) {
    this.id = id;
    this.name = profile.name;
    this.role = profile.role;
    this.dept = profile.dept;
    this.homeFloor = workstation.floor;
    this.workstation = workstation;
    workstation.occupant = this;

    // Personal schedule (staggered realistic arrival & departure)
    this.arrivalHour = U.rand(7.85, 9.25);
    this.lunchHour = U.rand(11.85, 13.05);
    this.departureHour = U.rand(16.8, 18.6);
    this.hasHadLunch = false;

    // Internal needs & state
    this.energy = U.rand(72, 98);
    this.caffeine = U.rand(55, 95);
    this.mood = U.rand(75, 98);
    this.hasCoffeeCup = false;

    // Spatial & navigation
    this.floor = 0;
    this.x = U.rand(-26, 26);
    this.y = 0;
    this.z = 24.5;
    this.rotY = 0;
    this.walkSpeed = CFG.WORKER_WALK_SPEED * U.rand(0.92, 1.1);

    this.state = 'OUTSIDE_AWAY';
    this.activityLabel = 'Commuting';
    this.activityEmoji = '🚶';
    this.stateTimer = 0;

    this.waypoints = []; // [{ x, z }]
    this.afterWalkAction = null;
    this.pendingDestination = null; // { floor, x, z, facingY, doorX, doorZ, onArrive }

    // Elevator state
    this.elevatorRequest = null;
    this.currentElevator = null;
    this.elevatorTargetFloor = null;
    this.elevatorSlot = 0;

    // Meeting / Lounge references
    this.currentMeeting = null;
    this.isPresenter = false;
    this.currentLoungeSpot = null;

    // Animation phase
    this.animPhase = U.rand(0, Math.PI * 2);
    this.isSeated = false;
    this.selected = false;

    this._buildMesh(profile);
    scene.add(this.group);
  }

  Worker.prototype._buildMesh = function (profile) {
    this.group = new THREE.Group();
    this.group.position.set(this.x, this.y, this.z);

    var skinMat = new THREE.MeshStandardMaterial({ color: profile.skin, roughness: 0.72 });
    var hairMat = new THREE.MeshStandardMaterial({ color: profile.hair, roughness: 0.85 });
    var topMat = new THREE.MeshStandardMaterial({ color: profile.outfit, roughness: 0.78 });
    var pantsMat = new THREE.MeshStandardMaterial({ color: profile.pants, roughness: 0.82 });
    var shoeMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.65 });

    this.bodyRoot = new THREE.Group();
    this.group.add(this.bodyRoot);

    // Legs (pivoted at hip y = 0.78)
    this.legL = new THREE.Group();
    this.legL.position.set(-0.1, 0.78, 0);
    var legMeshL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.72, 0.15), pantsMat);
    legMeshL.position.y = -0.36;
    legMeshL.castShadow = true;
    this.legL.add(legMeshL);
    var shoeL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.09, 0.22), shoeMat);
    shoeL.position.set(0, -0.73, 0.03);
    this.legL.add(shoeL);
    this.bodyRoot.add(this.legL);

    this.legR = new THREE.Group();
    this.legR.position.set(0.1, 0.78, 0);
    var legMeshR = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.72, 0.15), pantsMat);
    legMeshR.position.y = -0.36;
    legMeshR.castShadow = true;
    this.legR.add(legMeshR);
    var shoeR = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.09, 0.22), shoeMat);
    shoeR.position.set(0, -0.73, 0.03);
    this.legR.add(shoeR);
    this.bodyRoot.add(this.legR);

    // Torso
    this.torso = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.56, 0.22), topMat);
    this.torso.position.y = 1.08;
    this.torso.castShadow = true;
    this.bodyRoot.add(this.torso);

    // Subtle lanyard badge on chest
    var badge = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.09, 0.02),
      new THREE.MeshBasicMaterial({ color: 0xf8fafc })
    );
    badge.position.set(0.08, 1.08, 0.115);
    this.bodyRoot.add(badge);

    // Arms (pivoted at shoulder y = 1.30)
    this.armL = new THREE.Group();
    this.armL.position.set(-0.24, 1.30, 0);
    var armMeshL = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.48, 0.11), topMat);
    armMeshL.position.y = -0.22;
    armMeshL.castShadow = true;
    this.armL.add(armMeshL);
    var handL = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.09), skinMat);
    handL.position.y = -0.47;
    this.armL.add(handL);
    this.bodyRoot.add(this.armL);

    this.armR = new THREE.Group();
    this.armR.position.set(0.24, 1.30, 0);
    var armMeshR = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.48, 0.11), topMat);
    armMeshR.position.y = -0.22;
    armMeshR.castShadow = true;
    this.armR.add(armMeshR);
    var handR = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.09), skinMat);
    handR.position.y = -0.47;
    this.armR.add(handR);

    // Coffee cup attached to right hand (toggled visible when holding coffee)
    this.coffeeCup = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.036, 0.11, 8),
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4 })
    );
    this.coffeeCup.position.set(0, -0.5, 0.07);
    this.coffeeCup.visible = false;
    this.armR.add(this.coffeeCup);
    this.bodyRoot.add(this.armR);

    // Head & Hair
    this.headGroup = new THREE.Group();
    this.headGroup.position.set(0, 1.50, 0);
    var head = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.25, 0.24), skinMat);
    head.castShadow = true;
    this.headGroup.add(head);

    var hairTop = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.1, 0.26), hairMat);
    hairTop.position.y = 0.11;
    this.headGroup.add(hairTop);

    var hairBack = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.18, 0.08), hairMat);
    hairBack.position.set(0, 0.02, -0.1);
    this.headGroup.add(hairBack);

    this.bodyRoot.add(this.headGroup);

    // Selection highlight ring
    this.selectRing = new THREE.Mesh(
      new THREE.RingGeometry(0.36, 0.48, 24),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide })
    );
    this.selectRing.rotation.x = -Math.PI / 2;
    this.selectRing.position.y = 0.04;
    this.selectRing.visible = false;
    this.group.add(this.selectRing);

    // Tag all meshes for raycasting
    var self = this;
    this.group.traverse(function (obj) {
      obj.userData.worker = self;
    });
  };

  Worker.prototype.setSelected = function (val) {
    this.selected = !!val;
    this.selectRing.visible = this.selected;
  };

  Worker.prototype.setWorldY = function (y) {
    this.y = y;
    this.group.position.y = y;
  };

  Worker.prototype.getFollowPoint = function (outVec) {
    outVec.set(this.x, this.y + 1.25, this.z);
    return outVec;
  };

  Worker.prototype.getBadgeWorldPos = function (outVec) {
    outVec.set(this.x, this.y + (this.isSeated ? 1.55 : 1.92), this.z);
    return outVec;
  };

  Worker.prototype.isInsideBuilding = function () {
    return this.state !== 'OUTSIDE_AWAY' && (this.floor > 0 || this.z < 9.2);
  };

  Worker.prototype.isCrossingElevatorDoor = function () {
    return this.state === 'BOARDING_ELEVATOR' || this.state === 'EXITING_ELEVATOR';
  };

  Worker.prototype._releaseLounge = function () {
    if (this.currentLoungeSpot && this.currentLoungeSpot.occupiedBy === this) {
      this.currentLoungeSpot.occupiedBy = null;
    }
    this.currentLoungeSpot = null;
  };

  // --- Navigation & Floor Pathfinding ---

  Worker.prototype._buildFloorWaypoints = function (targetX, targetZ, doorX, doorZ) {
    var pts = [];
    var cz = CFG.CORRIDOR_Z;

    // Special Lobby routing (Floor 0): pass cleanly through lobby entrance & turnstiles
    if (this.floor === 0) {
      if (this.z > 9.5 && targetZ < 9.0) {
        // Entering building from plaza
        pts.push({ x: 0, z: 9.8 });
        pts.push({ x: 0, z: 5.5 });
        pts.push({ x: 0, z: 1.5 }); // Center turnstile lane
      } else if (this.z < 9.0 && targetZ > 9.5) {
        // Exiting building to plaza
        if (this.z < cz + 0.5) {
          pts.push({ x: 0, z: cz });
        }
        pts.push({ x: 0, z: 1.5 });
        pts.push({ x: 0, z: 9.8 });
        pts.push({ x: targetX, z: targetZ });
        return pts;
      }
    }

    // If we need to travel laterally across furniture zones, go via main corridor spine (z = -3.1)
    var needCorridor = Math.abs(this.x - targetX) > 2.2 || (this.z > -1.0 && targetZ < -2.0) || (this.z < -2.0 && targetZ > -1.0);
    if (needCorridor) {
      // Step out to corridor from current X (or nearest clean aisle)
      var exitX = this.x;
      if (this.z > 0.5 && Math.abs(this.x) < 3.2 && this.floor === 2) exitX = 0; // Sprint room 2A door
      if (this.z > 0.5 && this.x > 3.2 && this.floor === 3) exitX = 2.6;       // Studio 3A door
      if (this.z > 0.5 && Math.abs(this.x) < 4.5 && this.floor === 5) exitX = 0; // Boardroom door

      pts.push({ x: exitX, z: cz });
      var entryX = doorX !== undefined ? doorX : targetX;
      pts.push({ x: entryX, z: cz });
    }

    if (doorX !== undefined && doorZ !== undefined) {
      pts.push({ x: doorX, z: doorZ });
    }

    pts.push({ x: targetX, z: targetZ });
    return pts;
  };

  Worker.prototype.navigateTo = function (dest, elevatorSystem) {
    // dest: { floor, x, z, facingY, doorX, doorZ, label, emoji, onArrive }
    this.isSeated = false;
    this.pendingDestination = dest;
    if (dest.label) this.activityLabel = dest.label;
    if (dest.emoji) this.activityEmoji = dest.emoji;

    if (dest.floor === this.floor) {
      this.waypoints = this._buildFloorWaypoints(dest.x, dest.z, dest.doorX, dest.doorZ);
      this.state = 'WALKING';
      this.afterWalkAction = function () {
        if (dest.facingY !== undefined) this.rotY = dest.facingY;
        if (dest.onArrive) dest.onArrive.call(this);
      };
    } else {
      // Walk to elevator lobby waiting area on current floor
      var waitX = U.rand(-3.2, 3.2);
      var waitZ = CFG.ELEVATOR_WAIT_Z + U.rand(-0.35, 0.45);
      this.waypoints = this._buildFloorWaypoints(waitX, waitZ);
      this.state = 'WALKING';
      this.afterWalkAction = function () {
        this.rotY = Math.PI; // Face elevator doors (-Z)
        this.state = 'WAITING_ELEVATOR';
        this.activityLabel = 'Waiting for Elevator';
        this.activityEmoji = '🛗';
        this.elevatorTargetFloor = dest.floor;
        this.elevatorRequest = elevatorSystem.requestElevator(this, this.floor, dest.floor);
      };
    }
  };

  Worker.prototype.onElevatorBoard = function (car, slotIdx) {
    this.currentElevator = car;
    this.elevatorSlot = slotIdx;
    var slotPos = car.getSlotWorldPos(slotIdx);
    this.waypoints = [
      { x: car.x, z: CFG.ELEVATOR_DOOR_Z + 0.3 },
      { x: slotPos.x, z: slotPos.z }
    ];
    this.state = 'BOARDING_ELEVATOR';
    this.activityLabel = 'Boarding ' + car.name;
    this.afterWalkAction = function () {
      this.state = 'RIDING_ELEVATOR';
      this.rotY = 0; // Face +Z doors inside cab
      this.activityLabel = 'Riding to ' + OfficeSim.FLOORS[this.elevatorTargetFloor].shortName;
      this.activityEmoji = '🛗';
    };
  };

  Worker.prototype.onElevatorExit = function (car) {
    this.floor = car.currentFloor;
    this.setWorldY(U.floorToY(this.floor));
    this.currentElevator = null;
    this.waypoints = [
      { x: car.x, z: CFG.ELEVATOR_DOOR_Z + 0.45 },
      { x: car.x, z: CFG.CORRIDOR_Z }
    ];
    this.state = 'EXITING_ELEVATOR';
    this.afterWalkAction = function () {
      if (this.pendingDestination) {
        var d = this.pendingDestination;
        this.waypoints = this._buildFloorWaypoints(d.x, d.z, d.doorX, d.doorZ);
        this.state = 'WALKING';
        this.activityLabel = d.label || 'Walking';
        this.activityEmoji = d.emoji || '🚶';
        this.afterWalkAction = function () {
          if (d.facingY !== undefined) this.rotY = d.facingY;
          if (d.onArrive) d.onArrive.call(this);
        };
      } else {
        this.state = 'IDLE';
      }
    };
  };

  // --- High-Level Behavioral Goals ---

  Worker.prototype.goToDesk = function (sim) {
    this._releaseLounge();
    var ws = this.workstation;
    this.navigateTo({
      floor: ws.floor,
      x: ws.chairX,
      z: ws.chairZ,
      facingY: ws.facingY,
      label: 'Heading to Desk',
      emoji: '💻',
      onArrive: function () {
        this.state = 'WORKING';
        this.isSeated = true;
        this.activityLabel = 'Working at Desk';
        this.activityEmoji = '💻';
        this.stateTimer = U.rand(26, 60);
      }
    }, sim.elevators);
  };

  Worker.prototype.goForCoffee = function (sim) {
    this._releaseLounge();
    // Prefer coffee bar on own floor or Floor 1 Café
    var spots = sim.building.coffeeSpots;
    var sameFloor = spots.filter(function (s) { return s.floor === this.homeFloor; }, this);
    var spot = (Math.random() < 0.55 && sameFloor.length > 0) ? U.pick(sameFloor) : U.pick(spots);

    this.navigateTo({
      floor: spot.floor,
      x: spot.x + U.rand(-0.9, 0.9),
      z: spot.z,
      facingY: spot.facingY,
      label: 'Getting Coffee',
      emoji: '☕',
      onArrive: function () {
        this.state = 'COFFEE_BREAK';
        this.isSeated = false;
        this.activityLabel = 'At ' + spot.label;
        this.activityEmoji = '☕';
        this.stateTimer = U.rand(5.5, 10.0);
        this.hasCoffeeCup = true;
        this.coffeeCup.visible = true;
        this.caffeine = Math.min(100, this.caffeine + 42);
        this.energy = Math.min(100, this.energy + 18);
        sim.stats.coffeesServed++;
      }
    }, sim.elevators);
  };

  Worker.prototype.goForLunch = function (sim) {
    this._releaseLounge();
    this.hasHadLunch = true;

    // Choose between 1F Café, Rooftop Terrace (if daytime), or Plaza walk
    var roll = Math.random();
    var spot = null;
    if (roll < 0.55) {
      var cafeSpots = sim.building.loungeSpots.filter(function (s) { return s.floor === 1 && !s.occupiedBy; });
      if (cafeSpots.length > 0) spot = U.pick(cafeSpots);
    } else if (roll < 0.85 && sim.simHour < 18.5) {
      var roofSpots = sim.building.rooftopSpots.filter(function (s) { return !s.occupiedBy; });
      if (roofSpots.length > 0) spot = U.pick(roofSpots);
    }

    if (spot) {
      spot.occupiedBy = this;
      this.currentLoungeSpot = spot;
      this.navigateTo({
        floor: spot.floor,
        x: spot.x,
        z: spot.z,
        facingY: spot.facingY,
        label: spot.floor === CFG.ROOF_FLOOR ? 'Lunch on Rooftop' : 'Lunch at Café',
        emoji: '🍽',
        onArrive: function () {
          this.state = 'LUNCH_BREAK';
          this.isSeated = true;
          this.activityLabel = spot.floor === CFG.ROOF_FLOOR ? 'Rooftop Lunch' : 'Eating Lunch';
          this.activityEmoji = '🍽';
          this.stateTimer = U.rand(20, 36);
          this.energy = Math.min(100, this.energy + 30);
          this.mood = Math.min(100, this.mood + 15);
        }
      }, sim.elevators);
    } else {
      // Stroll out onto the sunny granite plaza
      this.navigateTo({
        floor: 0,
        x: U.rand(-8, 12),
        z: U.rand(13.5, 19.5),
        facingY: U.rand(0, Math.PI * 2),
        label: 'Plaza Break',
        emoji: '🌤',
        onArrive: function () {
          this.state = 'LUNCH_BREAK';
          this.isSeated = false;
          this.activityLabel = 'Enjoying Plaza';
          this.activityEmoji = '🌤';
          this.stateTimer = U.rand(14, 24);
          this.energy = Math.min(100, this.energy + 22);
          this.mood = Math.min(100, this.mood + 12);
        }
      }, sim.elevators);
    }
  };

  Worker.prototype.goToMeeting = function (meeting, seatOrPresenter, isPresenter, sim) {
    this._releaseLounge();
    this.currentMeeting = meeting;
    this.isPresenter = isPresenter;
    var room = meeting.room;

    this.navigateTo({
      floor: room.floor,
      x: seatOrPresenter.x,
      z: seatOrPresenter.z,
      facingY: seatOrPresenter.facingY,
      doorX: room.doorX,
      doorZ: room.doorZ,
      label: 'Going to ' + room.name,
      emoji: '🤝',
      onArrive: function () {
        this.state = 'IN_MEETING';
        this.isSeated = !this.isPresenter;
        this.activityLabel = (this.isPresenter ? 'Presenting: ' : 'Meeting: ') + meeting.title;
        this.activityEmoji = this.isPresenter ? '📊' : '🤝';
      }
    }, sim.elevators);
  };

  Worker.prototype.leaveMeeting = function (sim) {
    this.currentMeeting = null;
    this.isPresenter = false;
    this.goToDesk(sim);
  };

  Worker.prototype.departForDay = function (sim) {
    this._releaseLounge();
    this.hasCoffeeCup = false;
    this.coffeeCup.visible = false;
    var exitX = Math.random() < 0.5 ? -28 : 28;
    this.navigateTo({
      floor: 0,
      x: exitX,
      z: 24.5,
      label: 'Heading Home',
      emoji: '🏠',
      onArrive: function () {
        this.state = 'OUTSIDE_AWAY';
        this.group.visible = false;
        this.activityLabel = 'Off Shift';
        this.activityEmoji = '🌙';
      }
    }, sim.elevators);
  };

  Worker.prototype.arriveForDay = function (sim) {
    this._releaseLounge();
    this.currentMeeting = null;
    this.currentElevator = null;
    this.elevatorRequest = null;
    this.pendingDestination = null;
    this.afterWalkAction = null;
    this.waypoints = [];
    this.floor = 0;
    this.y = 0;
    this.x = (Math.random() < 0.5 ? -1 : 1) * U.rand(16, 28);
    this.z = 24.0;
    this.group.position.set(this.x, this.y, this.z);
    this.group.visible = true;
    this.hasHadLunch = false;
    this.energy = U.rand(82, 100);
    this.caffeine = U.rand(50, 80);

    // 25% grab a morning espresso first, 75% head straight to desk
    if (Math.random() < 0.25) {
      this.goForCoffee(sim);
    } else {
      this.goToDesk(sim);
    }
  };

  // Place worker directly inside the office (used when user jumps to midday/afternoon)
  Worker.prototype.teleportToWorkState = function () {
    this._releaseLounge();
    this.currentMeeting = null;
    this.currentElevator = null;
    this.elevatorRequest = null;
    this.pendingDestination = null;
    this.afterWalkAction = null;
    this.waypoints = [];
    this.floor = this.workstation.floor;
    this.x = this.workstation.chairX;
    this.z = this.workstation.chairZ;
    this.y = U.floorToY(this.floor);
    this.rotY = this.workstation.facingY;
    this.group.position.set(this.x, this.y, this.z);
    this.group.rotation.y = this.rotY;
    this.group.visible = true;
    this.state = 'WORKING';
    this.isSeated = true;
    this.activityLabel = 'Working at Desk';
    this.activityEmoji = '💻';
    this.stateTimer = U.rand(12, 48);
  };

  // --- Update Loop & Procedural Character Animation ---

  Worker.prototype.update = function (dt, sim) {
    var hour = sim.simHour;

    // 1. Off-shift check for morning arrival
    if (this.state === 'OUTSIDE_AWAY') {
      if (hour >= this.arrivalHour && hour < this.departureHour - 0.5) {
        this.arriveForDay(sim);
      }
      return;
    }

    // 2. Movement along waypoints
    if (this.state === 'WALKING' || this.state === 'BOARDING_ELEVATOR' || this.state === 'EXITING_ELEVATOR') {
      this._stepWalk(dt);
    } else if (this.state === 'WORKING') {
      this.energy = Math.max(10, this.energy - dt * 0.14);
      this.caffeine = Math.max(5, this.caffeine - dt * 0.22);
      this.stateTimer -= dt;

      if (hour >= this.departureHour) {
        this.departForDay(sim);
      } else if (!this.hasHadLunch && hour >= this.lunchHour && hour <= 13.8) {
        this.goForLunch(sim);
      } else if (this.stateTimer <= 0) {
        if (this.caffeine < 45 || Math.random() < 0.35) {
          this.goForCoffee(sim);
        } else if (Math.random() < 0.2 && sim.simHour < 17.5) {
          this.goForLunch(sim); // Short lounge/rooftop breather
        } else {
          this.stateTimer = U.rand(25, 50);
        }
      }
    } else if (this.state === 'COFFEE_BREAK' || this.state === 'LUNCH_BREAK') {
      this.stateTimer -= dt;
      if (this.stateTimer <= 0) {
        if (hour >= this.departureHour) {
          this.departForDay(sim);
        } else {
          this.goToDesk(sim);
        }
      }
    } else if (this.state === 'IN_MEETING') {
      // Wait for Simulation meeting scheduler to end the meeting
      this.energy = Math.max(15, this.energy - dt * 0.08);
    }

    // 3. Apply transform & procedural animation
    this.group.position.set(this.x, this.y, this.z);
    // Smooth yaw interpolation
    var diff = this.rotY - this.group.rotation.y;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.group.rotation.y += diff * Math.min(1, dt * 10);

    this._animatePose(dt);
  };

  Worker.prototype._stepWalk = function (dt) {
    if (this.waypoints.length === 0) {
      var cb = this.afterWalkAction;
      this.afterWalkAction = null;
      if (cb) cb.call(this);
      return;
    }

    var wp = this.waypoints[0];
    var dx = wp.x - this.x;
    var dz = wp.z - this.z;
    var dist = Math.sqrt(dx * dx + dz * dz);

    if (dist < 0.14) {
      this.x = wp.x;
      this.z = wp.z;
      this.waypoints.shift();
      if (this.waypoints.length === 0 && this.afterWalkAction) {
        var nextCb = this.afterWalkAction;
        this.afterWalkAction = null;
        nextCb.call(this);
      }
      return;
    }

    var step = Math.min(dist, this.walkSpeed * dt);
    this.x += (dx / dist) * step;
    this.z += (dz / dist) * step;
    this.rotY = Math.atan2(dx, dz);
  };

  Worker.prototype._animatePose = function (dt) {
    var walking = (this.state === 'WALKING' || this.state === 'BOARDING_ELEVATOR' || this.state === 'EXITING_ELEVATOR');
    this.animPhase += dt * (walking ? 9.5 : 3.2);

    if (walking) {
      var swing = Math.sin(this.animPhase) * 0.55;
      this.bodyRoot.position.y = Math.abs(Math.sin(this.animPhase)) * 0.04;
      this.legL.rotation.x = swing;
      this.legR.rotation.x = -swing;
      this.armL.rotation.x = -swing * 0.8;
      this.armR.rotation.x = this.hasCoffeeCup ? -0.75 : swing * 0.8;
      this.headGroup.rotation.y = 0;
    } else if (this.isSeated) {
      // Seated posture (hips lowered onto chair, knees bent forward)
      this.bodyRoot.position.y = -0.32;
      this.legL.rotation.x = -1.35;
      this.legR.rotation.x = -1.35;

      if (this.state === 'WORKING') {
        // Subtle keyboard typing motion
        this.armL.rotation.x = -1.05 + Math.sin(this.animPhase * 4.5) * 0.08;
        this.armR.rotation.x = -1.05 + Math.cos(this.animPhase * 4.8) * 0.08;
        this.headGroup.rotation.y = Math.sin(this.animPhase * 0.4) * 0.12;
      } else {
        // Relaxed seated or listening in meeting
        this.armL.rotation.x = -0.55;
        this.armR.rotation.x = this.hasCoffeeCup ? -0.9 : -0.55;
        this.headGroup.rotation.y = Math.sin(this.animPhase * 0.6) * 0.22;
      }
    } else {
      // Standing idle, waiting for elevator, getting coffee, or presenting
      this.bodyRoot.position.y = 0;
      this.legL.rotation.x = 0;
      this.legR.rotation.x = 0;

      if (this.state === 'IN_MEETING' && this.isPresenter) {
        // Expressive presenting gestures!
        this.armL.rotation.x = -0.6 + Math.sin(this.animPhase * 1.4) * 0.35;
        this.armR.rotation.x = -0.8 + Math.cos(this.animPhase * 1.7) * 0.4;
        this.headGroup.rotation.y = Math.sin(this.animPhase * 0.8) * 0.35;
      } else if (this.state === 'COFFEE_BREAK') {
        this.armL.rotation.x = -0.2;
        this.armR.rotation.x = -0.95 + Math.sin(this.animPhase) * 0.15;
        this.headGroup.rotation.y = 0;
      } else {
        this.armL.rotation.x = Math.sin(this.animPhase * 0.5) * 0.05;
        this.armR.rotation.x = this.hasCoffeeCup ? -0.78 : -Math.sin(this.animPhase * 0.5) * 0.05;
        this.headGroup.rotation.y = Math.sin(this.animPhase * 0.4) * 0.15;
      }
    }
  };

  OfficeSim.Worker = Worker;
})();
