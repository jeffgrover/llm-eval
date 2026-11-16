(function (global) {
  'use strict';

  var OfficeSim = global.OfficeSim = global.OfficeSim || {};
  var M = OfficeSim.Math;
  var FLOOR_H = OfficeSim.CONST.FLOOR_H;
  var NUM_FLOORS = OfficeSim.CONST.NUM_FLOORS;

  var SKIN_TONES = [
    [0.95, 0.80, 0.69], [0.87, 0.68, 0.54], [0.72, 0.50, 0.36],
    [0.48, 0.31, 0.22], [0.92, 0.75, 0.62]
  ];
  var HAIR_COLORS = [
    [0.12, 0.10, 0.09], [0.28, 0.18, 0.12], [0.58, 0.42, 0.22],
    [0.78, 0.62, 0.32], [0.42, 0.44, 0.48]
  ];
  var OUTFIT_COLORS = [
    [0.20, 0.38, 0.58], [0.68, 0.26, 0.28], [0.24, 0.52, 0.42],
    [0.36, 0.30, 0.54], [0.74, 0.50, 0.22], [0.24, 0.28, 0.34],
    [0.52, 0.32, 0.44], [0.22, 0.48, 0.64]
  ];

  var NAMES = [
    'Maya Lin', 'Liam Vance', 'Sofia Patel', 'Noah Brooks', 'Elena Rostova',
    'Marcus Cole', 'Chloe Kim', 'Ethan Wright', 'Aria Chen', 'Lucas Meyer',
    'Zara Al-Mansoor', 'Owen Hayes', 'Nora Lindqvist', 'Julian Ortiz', 'Hannah Park',
    'Devon Reed', 'Claire Dubois', 'Samir Verma', 'Tessa Grant', 'Leo Takahashi',
    'Grace Okafor', 'Ben Carter', 'Iris Novak', 'Kai Nakamura', 'Ruby Flores', 'Alex Mercer'
  ];

  // Desk locations per floor: [x, z, rotY]
  var FLOOR_DESKS = {
    2: [
      [-8.6, 1.2, 0], [-6.2, 1.2, 0], [-8.6, 4.2, Math.PI], [-6.2, 4.2, Math.PI],
      [4.2, 1.2, 0],  [6.6, 1.2, 0],  [4.2, 4.2, Math.PI],  [6.6, 4.2, Math.PI]
    ],
    3: [
      [-8.5, 1.5, 0], [-5.8, 1.5, 0], [-8.5, 4.4, Math.PI], [-5.8, 4.4, Math.PI],
      [4.5, 1.5, 0],  [7.2, 1.5, 0]
    ],
    4: [
      [-8.6, 1.4, 0], [-6.0, 1.4, 0], [-8.6, 4.4, Math.PI], [-6.0, 4.4, Math.PI]
    ],
    5: [
      [-8.6, 1.4, 0], [-6.0, 1.4, 0], [-8.6, 4.4, Math.PI], [-6.0, 4.4, Math.PI]
    ],
    6: [
      [-7.2, 3.0, Math.PI], [-8.5, -3.5, 0]
    ]
  };

  var CONF_SEATS = [
    [5.8, 2.0], [6.85, 2.0], [7.9, 2.0], [8.95, 2.0],
    [5.8, 4.4], [6.85, 4.4], [7.9, 4.4], [8.95, 4.4]
  ];

  // Elevator Class
  function Elevator(id, x) {
    this.id = id;
    this.x = x;
    this.z = -4.8;
    this.floor = 1;
    this.y = 0;
    this.vel = 0;
    this.dir = 0; // 1 up, -1 down, 0 idle
    this.state = 'IDLE'; // IDLE, MOVING, DOOR_OPENING, BOARDING, DOOR_CLOSING
    this.doorOpen = 0;
    this.stateTimer = 0;
    this.carCalls = {};
    this.assignedHallCalls = {};
    this.riders = [];
    this.capacity = 6;
    this.targetFloor = 1;
  }

  Elevator.prototype.hasAnyCalls = function () {
    for (var k in this.carCalls) if (this.carCalls[k]) return true;
    for (var k2 in this.assignedHallCalls) if (this.assignedHallCalls[k2]) return true;
    return false;
  };

  Elevator.prototype.hasCallsInDir = function (d) {
    for (var f = 1; f <= NUM_FLOORS; f++) {
      if (this.carCalls[f] || this.assignedHallCalls[f]) {
        if (d > 0 && f > this.floor) return true;
        if (d < 0 && f < this.floor) return true;
      }
    }
    return false;
  };

  Elevator.prototype.pickNextTarget = function () {
    var bestF = null;
    var bestDist = 999;
    // Prefer current direction first (LOOK algorithm)
    if (this.dir !== 0 && this.hasCallsInDir(this.dir)) {
      for (var f = 1; f <= NUM_FLOORS; f++) {
        if (this.carCalls[f] || this.assignedHallCalls[f]) {
          if ((this.dir > 0 && f > this.floor) || (this.dir < 0 && f < this.floor)) {
            var d = Math.abs(f - this.floor);
            if (d < bestDist) { bestDist = d; bestF = f; }
          }
        }
      }
      return bestF;
    }
    // Otherwise nearest call in any direction
    for (var f2 = 1; f2 <= NUM_FLOORS; f2++) {
      if (this.carCalls[f2] || this.assignedHallCalls[f2]) {
        var d2 = Math.abs(f2 - this.floor);
        if (d2 < bestDist) { bestDist = d2; bestF = f2; }
      }
    }
    return bestF;
  };

  function formatTime(hourFloat) {
    var h24 = Math.floor(hourFloat) % 24;
    var m = Math.floor((hourFloat - Math.floor(hourFloat)) * 60);
    var ampm = h24 >= 12 ? 'PM' : 'AM';
    var h12 = h24 % 12;
    if (h12 === 0) h12 = 12;
    return (h12 < 10 ? '0' : '') + h12 + ':' + (m < 10 ? '0' : '') + m + ' ' + ampm;
  }

  function Simulation() {
    this.timeHours = 8.15; // Start at 8:09 AM during morning arrival
    this.speed = 1;
    this.elevators = [
      new Elevator('A', -1.65),
      new Elevator('B', 1.05)
    ];
    this.hallCalls = {};
    for (var f = 1; f <= NUM_FLOORS; f++) {
      this.hallCalls[f] = { up: false, down: false };
    }
    this.workers = [];
    this.logs = [];
    this.meetingActive = false;
    this._lastMeetingHour = -1;
    this._initWorkers();
    this.addLog('Simulation started — Morning arrival rush');
  }

  Simulation.prototype.addLog = function (msg) {
    this.logs.unshift({ time: formatTime(this.timeHours), msg: msg });
    if (this.logs.length > 24) this.logs.pop();
  };

  Simulation.prototype._initWorkers = function () {
    var rng = M.createRNG(101);
    var roles = [
      { role: 'Receptionist', floor: 1, desk: [-5.2, 2.2, Math.PI], arrive: 7.75, leave: 17.2 },
      { role: 'Barista',      floor: 1, desk: [7.8, 1.6, Math.PI],  arrive: 7.70, leave: 16.8 }
    ];
    var deptFloors = [
      { f: 2, role: 'Software Engineer', count: 8 },
      { f: 3, role: 'Product Designer',  count: 6 },
      { f: 4, role: 'Sales Specialist',  count: 4 },
      { f: 5, role: 'Finance Analyst',   count: 4 },
      { f: 6, role: 'Executive',         count: 2 }
    ];

    var idx = 0;
    for (var r = 0; r < roles.length; r++) {
      this._spawnWorker(idx++, roles[r].role, roles[r].floor, roles[r].desk, roles[r].arrive, roles[r].leave, rng);
    }
    for (var d = 0; d < deptFloors.length; d++) {
      var df = deptFloors[d];
      var desks = FLOOR_DESKS[df.f];
      for (var i = 0; i < df.count; i++) {
        var arrive = 7.95 + rng() * 0.9; // 7:57 - 8:50
        var leave = 16.9 + rng() * 1.4;  // 16:54 - 18:18
        this._spawnWorker(idx++, df.role, df.f, desks[i], arrive, leave, rng);
      }
    }
  };

  Simulation.prototype._spawnWorker = function (id, role, homeFloor, desk, arriveTime, leaveTime, rng) {
    var spawnSide = (id % 2 === 0) ? -22 : 22;
    this.workers.push({
      id: id,
      name: NAMES[id % NAMES.length],
      role: role,
      homeFloor: homeFloor,
      desk: desk,
      arriveTime: arriveTime,
      leaveTime: leaveTime,
      floor: 1,
      x: spawnSide,
      y: 0,
      z: 13.5,
      rotY: 0,
      state: 'OFFSITE', // OFFSITE, WALKING, WAITING_ELEVATOR, BOARDING_ELEVATOR, RIDING_ELEVATOR, EXITING_ELEVATOR, TAKING_STAIRS, WORKING, IN_MEETING, BREAK, CHATTING, LEAVING
      waypoints: [],
      destFloor: homeFloor,
      targetActivity: 'WORKING',
      activityTimer: 0,
      elevatorId: null,
      stairProgress: 0,
      stairFrom: 1,
      stairTo: 1,
      walkPhase: rng() * 6.28,
      speed: 2.3 + rng() * 0.6,
      energy: 80 + rng() * 20,
      focus: 75 + rng() * 25,
      caffeine: 40 + rng() * 35,
      hasCoffee: false,
      coffeeTimer: 0,
      skin: SKIN_TONES[Math.floor(rng() * SKIN_TONES.length)],
      hair: HAIR_COLORS[Math.floor(rng() * HAIR_COLORS.length)],
      outfit: OUTFIT_COLORS[Math.floor(rng() * OUTFIT_COLORS.length)],
      pants: [0.16, 0.19, 0.25]
    });
  };

  Simulation.prototype.jumpToHour = function (targetHour) {
    this.timeHours = targetHour;
    for (var f = 1; f <= NUM_FLOORS; f++) {
      this.hallCalls[f].up = false;
      this.hallCalls[f].down = false;
    }
    for (var ei = 0; ei < this.elevators.length; ei++) {
      var e = this.elevators[ei];
      e.floor = 1; e.y = 0; e.vel = 0; e.dir = 0; e.state = 'IDLE';
      e.doorOpen = 0; e.carCalls = {}; e.assignedHallCalls = {}; e.riders = [];
    }
    for (var i = 0; i < this.workers.length; i++) {
      var w = this.workers[i];
      w.waypoints = [];
      w.elevatorId = null;
      w.hasCoffee = false;
      if (targetHour < w.arriveTime || targetHour > w.leaveTime + 0.3) {
        w.state = 'OFFSITE';
        w.floor = 1;
        w.x = (w.id % 2 === 0) ? -22 : 22;
        w.y = 0;
        w.z = 13.5;
      } else {
        w.floor = w.homeFloor;
        w.y = (w.floor - 1) * FLOOR_H;
        w.x = w.desk[0] + 0.52 * Math.sin(w.desk[2]);
        w.z = w.desk[1] + 0.52 * Math.cos(w.desk[2]);
        w.rotY = w.desk[2] + Math.PI;
        w.state = 'WORKING';
        w.activityTimer = 15 + (i % 7) * 5;
      }
    }
    this.addLog('Jumped to ' + formatTime(targetHour));
  };

  // Build safe floor waypoints so workers walk around furniture via corridor z = -1.5
  Simulation.prototype._planFloorWalk = function (w, targetX, targetZ, nextState, nextActivity) {
    var pts = [];
    var corridorZ = -1.5;
    // If outside building (z > 7), enter through front door (0, 7.2) -> (0, 1.2)
    if (w.z > 7.0 && targetZ <= 7.0) {
      pts.push({ x: 0, z: 12.5 });
      pts.push({ x: 0, z: 7.2 });
      pts.push({ x: 0, z: 1.2 });
    }
    // Use corridor if crossing wings or going to elevator/stairs
    if (Math.abs(w.z - targetZ) > 1.8 || Math.abs(w.x - targetX) > 4.0) {
      if (w.z > corridorZ + 0.5) pts.push({ x: w.x, z: corridorZ });
      pts.push({ x: targetX, z: corridorZ });
    }
    pts.push({ x: targetX, z: targetZ });
    w.waypoints = pts;
    w.state = 'WALKING';
    w._afterWalkState = nextState;
    w._afterWalkActivity = nextActivity || w.targetActivity;
  };

  Simulation.prototype._startTripToFloor = function (w, destFloor, finalX, finalZ, finalState) {
    w.destFloor = destFloor;
    w._finalX = finalX;
    w._finalZ = finalZ;
    w._finalState = finalState;
    if (w.floor === destFloor) {
      this._planFloorWalk(w, finalX, finalZ, finalState);
      return;
    }
    // Decide stairs vs elevator: 45% chance of stairs if only 1 floor difference
    var diff = Math.abs(destFloor - w.floor);
    if (diff === 1 && ((w.id + Math.floor(this.timeHours * 10)) % 10 < 4)) {
      this._planFloorWalk(w, 4.8, -3.2, 'START_STAIRS');
    } else {
      var waitX = -2.2 + (w.id % 5) * 0.9;
      var waitZ = -2.7 - (w.id % 2) * 0.35;
      this._planFloorWalk(w, waitX, waitZ, 'WAITING_ELEVATOR');
    }
  };

  Simulation.prototype._assignHallCalls = function () {
    for (var f = 1; f <= NUM_FLOORS; f++) {
      if (!this.hallCalls[f].up && !this.hallCalls[f].down) continue;
      // Check if an elevator is already assigned to f
      var already = false;
      for (var ei = 0; ei < this.elevators.length; ei++) {
        if (this.elevators[ei].assignedHallCalls[f]) { already = true; break; }
      }
      if (already) continue;

      var callDir = this.hallCalls[f].up ? 1 : -1;
      var bestE = null, bestScore = 9999;
      for (var ei2 = 0; ei2 < this.elevators.length; ei2++) {
        var e = this.elevators[ei2];
        var score = Math.abs(e.floor - f);
        if (e.riders.length >= e.capacity) score += 50;
        if (e.state !== 'IDLE') {
          if (e.dir === callDir && ((callDir > 0 && e.floor <= f) || (callDir < 0 && e.floor >= f))) {
            score += 0; // On the way!
          } else {
            score += 12;
          }
        }
        if (score < bestScore) { bestScore = score; bestE = e; }
      }
      if (bestE) {
        bestE.assignedHallCalls[f] = true;
      }
    }
  };

  Simulation.prototype._updateElevators = function (dt) {
    this._assignHallCalls();

    for (var ei = 0; ei < this.elevators.length; ei++) {
      var e = this.elevators[ei];

      if (e.state === 'IDLE') {
        if (e.hasAnyCalls()) {
          var nextF = e.pickNextTarget();
          if (nextF === e.floor) {
            delete e.carCalls[e.floor];
            delete e.assignedHallCalls[e.floor];
            e.state = 'DOOR_OPENING';
          } else if (nextF !== null) {
            e.targetFloor = nextF;
            e.dir = nextF > e.floor ? 1 : -1;
            e.state = 'MOVING';
          }
        } else {
          e.dir = 0;
        }
      }
      else if (e.state === 'MOVING') {
        // Re-evaluate target in case a closer call appeared along the way
        var nextT = e.pickNextTarget();
        if (nextT !== null) e.targetFloor = nextT;
        var targetY = (e.targetFloor - 1) * FLOOR_H;
        var diffY = targetY - e.y;
        var maxSpd = 4.6;
        if (Math.abs(diffY) < 0.08) {
          e.y = targetY;
          e.vel = 0;
          e.floor = e.targetFloor;
          delete e.carCalls[e.floor];
          delete e.assignedHallCalls[e.floor];
          // Clear hall call in current direction (or both if reversing)
          if (e.dir >= 0) this.hallCalls[e.floor].up = false;
          if (e.dir <= 0) this.hallCalls[e.floor].down = false;
          if (!e.hasCallsInDir(e.dir)) {
            this.hallCalls[e.floor].up = false;
            this.hallCalls[e.floor].down = false;
          }
          e.state = 'DOOR_OPENING';
        } else {
          var desiredVel = Math.sign(diffY) * Math.min(maxSpd, Math.max(1.2, Math.abs(diffY) * 2.4));
          e.vel = M.lerp(e.vel, desiredVel, Math.min(1, dt * 6));
          e.y += e.vel * dt;
          e.floor = Math.round(e.y / FLOOR_H) + 1;
        }
      }
      else if (e.state === 'DOOR_OPENING') {
        e.doorOpen = Math.min(1, e.doorOpen + dt * 2.0);
        if (e.doorOpen >= 1) {
          e.state = 'BOARDING';
          e.stateTimer = 1.3;
        }
      }
      else if (e.state === 'BOARDING') {
        // 1. Alight riders whose destination is this floor
        for (var ri = e.riders.length - 1; ri >= 0; ri--) {
          var w = this.workers[e.riders[ri]];
          if (w.destFloor === e.floor && w.state === 'RIDING_ELEVATOR') {
            e.riders.splice(ri, 1);
            w.floor = e.floor;
            w.y = e.y;
            w.elevatorId = null;
            w.state = 'EXITING_ELEVATOR';
            w.waypoints = [{ x: e.x, z: -2.2 }];
            e.stateTimer = Math.max(e.stateTimer, 0.9);
          }
        }
        // 2. Board waiting workers on this floor
        for (var wi = 0; wi < this.workers.length; wi++) {
          var ww = this.workers[wi];
          if (ww.state === 'WAITING_ELEVATOR' && ww.floor === e.floor && e.riders.length < e.capacity) {
            var wDir = ww.destFloor > e.floor ? 1 : -1;
            if (e.dir === 0 || wDir === e.dir || !e.hasCallsInDir(e.dir)) {
              if (e.dir === 0) e.dir = wDir;
              ww.state = 'BOARDING_ELEVATOR';
              ww.elevatorId = e.id;
              var slot = e.riders.length;
              var sx = (slot % 3 - 1) * 0.45;
              var sz = (slot < 3) ? -0.35 : 0.30;
              ww.waypoints = [{ x: e.x + sx, z: e.z + sz }];
              e.riders.push(ww.id);
              e.carCalls[ww.destFloor] = true;
              e.stateTimer = Math.max(e.stateTimer, 1.1);
            }
          }
        }
        e.stateTimer -= dt;
        // Wait until no one is mid-boarding
        var boardingBusy = false;
        for (var bi = 0; bi < e.riders.length; bi++) {
          if (this.workers[e.riders[bi]].state === 'BOARDING_ELEVATOR') boardingBusy = true;
        }
        if (e.stateTimer <= 0 && !boardingBusy) {
          e.state = 'DOOR_CLOSING';
        }
      }
      else if (e.state === 'DOOR_CLOSING') {
        e.doorOpen = Math.max(0, e.doorOpen - dt * 2.0);
        if (e.doorOpen <= 0) {
          if (e.hasAnyCalls()) {
            if (!e.hasCallsInDir(e.dir)) e.dir = -e.dir;
            var nt = e.pickNextTarget();
            if (nt !== null) {
              e.targetFloor = nt;
              e.dir = nt > e.floor ? 1 : (nt < e.floor ? -1 : 0);
              e.state = (nt === e.floor) ? 'DOOR_OPENING' : 'MOVING';
            } else {
              e.dir = 0; e.state = 'IDLE';
            }
          } else {
            e.dir = 0;
            e.state = 'IDLE';
          }
        }
      }

      // Sync riding workers' Y position
      for (var rj = 0; rj < e.riders.length; rj++) {
        var rw = this.workers[e.riders[rj]];
        if (rw.state === 'RIDING_ELEVATOR') {
          rw.y = e.y;
        }
      }
    }
  };

  Simulation.prototype._triggerMeeting = function () {
    this.meetingActive = true;
    this.addLog('Team sync starting in F4 Conference Room');
    var count = 0;
    for (var i = 2; i < this.workers.length && count < 6; i++) {
      var w = this.workers[i];
      if (w.state === 'WORKING' && (i % 3 === 0 || w.homeFloor === 4)) {
        var seat = CONF_SEATS[count++];
        w.activityTimer = 35;
        this._startTripToFloor(w, 4, seat[0], seat[1], 'IN_MEETING');
      }
    }
  };

  Simulation.prototype._updateWorkers = function (dt) {
    // Check scheduled meetings around 10:30 and 14:30
    var h = this.timeHours;
    var mKey = (h >= 10.3 && h < 10.8) ? 10 : ((h >= 14.3 && h < 14.8) ? 14 : -1);
    if (mKey !== -1 && this._lastMeetingHour !== mKey) {
      this._lastMeetingHour = mKey;
      this._triggerMeeting();
    }

    var activeMeetings = 0;

    for (var i = 0; i < this.workers.length; i++) {
      var w = this.workers[i];

      if (w.hasCoffee) {
        w.coffeeTimer -= dt;
        if (w.coffeeTimer <= 0) w.hasCoffee = false;
      }

      if (w.state === 'OFFSITE') {
        if (h >= w.arriveTime && h < w.leaveTime - 0.5) {
          w.floor = 1; w.y = 0;
          w.x = (w.id % 2 === 0) ? -22 : 22;
          w.z = 13.5;
          var deskX = w.desk[0] + 0.52 * Math.sin(w.desk[2]);
          var deskZ = w.desk[1] + 0.52 * Math.cos(w.desk[2]);
          this._startTripToFloor(w, w.homeFloor, deskX, deskZ, 'WORKING');
          w.activityTimer = 25 + (w.id % 5) * 8;
        }
        continue;
      }

      // Check evening departure
      if (h >= w.leaveTime && w.state === 'WORKING') {
        w.state = 'LEAVING';
        var exitX = (w.id % 2 === 0) ? -22 : 22;
        this._startTripToFloor(w, 1, exitX, 13.5, 'GO_OFFSITE');
        continue;
      }

      if (w.state === 'WALKING' || w.state === 'BOARDING_ELEVATOR' || w.state === 'EXITING_ELEVATOR') {
        if (w.waypoints.length > 0) {
          var wp = w.waypoints[0];
          var dx = wp.x - w.x, dz = wp.z - w.z;
          var dist = Math.hypot(dx, dz);
          if (dist < 0.14) {
            w.x = wp.x; w.z = wp.z;
            w.waypoints.shift();
          } else {
            var step = Math.min(dist, w.speed * dt);
            w.x += (dx / dist) * step;
            w.z += (dz / dist) * step;
            w.rotY = Math.atan2(dx, dz);
            w.walkPhase += dt * w.speed * 4.2;
          }
        } else {
          // Arrived at waypoint target
          if (w.state === 'BOARDING_ELEVATOR') {
            w.state = 'RIDING_ELEVATOR';
            w.rotY = 0; // face doors (+Z)
          } else if (w.state === 'EXITING_ELEVATOR') {
            this._planFloorWalk(w, w._finalX, w._finalZ, w._finalState);
          } else if (w._afterWalkState === 'WAITING_ELEVATOR') {
            w.state = 'WAITING_ELEVATOR';
            w.rotY = Math.PI; // face elevator doors (-Z)
            if (w.destFloor > w.floor) this.hallCalls[w.floor].up = true;
            else if (w.destFloor < w.floor) this.hallCalls[w.floor].down = true;
          } else if (w._afterWalkState === 'START_STAIRS') {
            w.state = 'TAKING_STAIRS';
            w.stairFrom = w.floor;
            w.stairTo = w.destFloor;
            w.stairProgress = 0;
          } else if (w._afterWalkState === 'GO_OFFSITE') {
            w.state = 'OFFSITE';
          } else {
            w.state = w._afterWalkState || 'WORKING';
            if (w.state === 'WORKING') {
              w.rotY = w.desk[2] + Math.PI;
              w.activityTimer = 25 + (w.id % 6) * 6;
            } else if (w.state === 'IN_MEETING') {
              w.rotY = (w.z < 3.2) ? 0 : Math.PI;
              w.activityTimer = 30;
            } else if (w.state === 'BREAK') {
              w.activityTimer = 10;
              w.caffeine = Math.min(100, w.caffeine + 45);
              w.energy = Math.min(100, w.energy + 20);
              w.hasCoffee = true;
              w.coffeeTimer = 28;
            }
          }
        }
      }
      else if (w.state === 'TAKING_STAIRS') {
        w.stairProgress += dt * 0.42;
        var y0 = (w.stairFrom - 1) * FLOOR_H;
        var y1 = (w.stairTo - 1) * FLOOR_H;
        w.y = M.lerp(y0, y1, Math.min(1, w.stairProgress));
        w.z = -3.4 - Math.sin(w.stairProgress * Math.PI) * 2.2;
        w.rotY = (w.stairTo > w.stairFrom) ? Math.PI : 0;
        w.walkPhase += dt * 9.0;
        if (w.stairProgress >= 1) {
          w.floor = w.stairTo;
          w.y = y1;
          this._planFloorWalk(w, w._finalX, w._finalZ, w._finalState);
        }
      }
      else if (w.state === 'WORKING') {
        w.energy = Math.max(15, w.energy - dt * 0.35);
        w.focus = Math.max(20, w.focus - dt * 0.45);
        w.caffeine = Math.max(0, w.caffeine - dt * 0.65);
        w.activityTimer -= dt;
        w.walkPhase += dt * 3.0; // subtle typing motion

        if (w.activityTimer <= 0 && w.id >= 2) {
          // Lunch rush (12:00 - 13:15)
          if (h >= 12.0 && h <= 13.2 && (w.id % 2 === 0)) {
            var lunchSpot = (w.id % 4 === 0) ? [6.2, 4.8, 1] : [6.5, 3.8, 5];
            if (w.id % 6 === 0) lunchSpot = [7.0, 4.2, 6]; // Rooftop terrace lunch!
            this._startTripToFloor(w, lunchSpot[2], lunchSpot[0], lunchSpot[1], 'BREAK');
          }
          // Coffee break if caffeine low
          else if (w.caffeine < 28) {
            var coffeeFloor = (w.homeFloor >= 4) ? 5 : 1;
            var cx = coffeeFloor === 1 ? 7.8 : 4.6;
            var cz = coffeeFloor === 1 ? 3.5 : 1.4;
            this._startTripToFloor(w, coffeeFloor, cx, cz, 'BREAK');
          } else {
            w.activityTimer = 20 + (w.id % 5) * 6;
          }
        }
      }
      else if (w.state === 'IN_MEETING') {
        activeMeetings++;
        w.activityTimer -= dt;
        w.walkPhase += dt * 2.2;
        if (w.activityTimer <= 0) {
          var dx2 = w.desk[0] + 0.52 * Math.sin(w.desk[2]);
          var dz2 = w.desk[1] + 0.52 * Math.cos(w.desk[2]);
          this._startTripToFloor(w, w.homeFloor, dx2, dz2, 'WORKING');
        }
      }
      else if (w.state === 'BREAK') {
        w.activityTimer -= dt;
        w.walkPhase += dt * 1.5;
        if (w.activityTimer <= 0) {
          var dx3 = w.desk[0] + 0.52 * Math.sin(w.desk[2]);
          var dz3 = w.desk[1] + 0.52 * Math.cos(w.desk[2]);
          this._startTripToFloor(w, w.homeFloor, dx3, dz3, 'WORKING');
        }
      }
    }

    this.meetingActive = activeMeetings > 0;
  };

  Simulation.prototype.update = function (realDt) {
    var dt = realDt * this.speed;
    if (dt <= 0) return;
    // Clamp substeps so high speeds (8x, 20x) remain rock solid
    var steps = Math.min(10, Math.max(1, Math.ceil(dt / 0.04)));
    var subDt = dt / steps;
    for (var s = 0; s < steps; s++) {
      // 1 real second at 1x = 1 simulated minute (1/60 hour)
      this.timeHours = (this.timeHours + subDt / 60) % 24;
      this._updateElevators(subDt);
      this._updateWorkers(subDt);
    }
  };

  // Render Elevators & Articulated Workers
  Simulation.prototype.draw = function (r, env, selectedEntity) {
    // Draw Elevator Cabs
    for (var ei = 0; ei < this.elevators.length; ei++) {
      var e = this.elevators[ei];
      var isSel = selectedEntity && selectedEntity.type === 'elevator' && selectedEntity.id === e.id;
      var cabCol = isSel ? [0.28, 0.72, 0.98] : [0.78, 0.82, 0.88];

      // Cab floor & ceiling
      r.drawBox(e.x, e.y + 0.16, e.z, 1.9, 0.08, 1.9, { color: [0.22, 0.25, 0.30] });
      r.drawBox(e.x, e.y + 2.45, e.z, 1.9, 0.10, 1.9, { color: cabCol, emissive: [0.12, 0.16, 0.20] });
      // Cab back glass & side rails
      r.drawBox(e.x, e.y + 1.30, e.z - 0.90, 1.8, 2.2, 0.06, { color: [0.55, 0.80, 0.96], alpha: 0.35, transparent: true });
      r.drawBox(e.x - 0.90, e.y + 1.30, e.z, 0.06, 2.2, 1.8, { color: cabCol, alpha: 0.55, transparent: true });
      r.drawBox(e.x + 0.90, e.y + 1.30, e.z, 0.06, 2.2, 1.8, { color: cabCol, alpha: 0.55, transparent: true });

      // Sliding Doors at z = e.z + 0.92
      var slide = e.doorOpen * 0.44;
      var doorW = 0.88 * (1 - e.doorOpen * 0.82);
      r.drawBox(e.x - 0.44 - slide, e.y + 1.30, e.z + 0.92, doorW, 2.15, 0.05, { color: [0.65, 0.72, 0.80], shininess: 50 });
      r.drawBox(e.x + 0.44 + slide, e.y + 1.30, e.z + 0.92, doorW, 2.15, 0.05, { color: [0.65, 0.72, 0.80], shininess: 50 });
    }

    // Draw Workers
    for (var i = 0; i < this.workers.length; i++) {
      var w = this.workers[i];
      if (w.state === 'OFFSITE') continue;

      var isSelected = selectedEntity && selectedEntity.type === 'worker' && selectedEntity.id === w.id;
      var sitting = (w.state === 'WORKING' || w.state === 'IN_MEETING');
      var walking = (w.state === 'WALKING' || w.state === 'BOARDING_ELEVATOR' || w.state === 'EXITING_ELEVATOR' || w.state === 'TAKING_STAIRS');

      var swing = walking ? Math.sin(w.walkPhase) * 0.55 : 0;
      var bob = walking ? Math.abs(Math.cos(w.walkPhase)) * 0.04 : 0;
      var hipY = sitting ? w.y + 0.56 : w.y + 0.76 + bob;

      // Ground contact shadow
      r.drawCyl(w.x, w.y + 0.17, w.z, 0, 0, 0.48, 0.01, 0.48, {
        color: isSelected ? [0.15, 0.72, 0.98] : [0.04, 0.05, 0.08],
        alpha: isSelected ? 0.65 : 0.25,
        transparent: true,
        emissive: isSelected ? [0.1, 0.5, 0.9] : [0, 0, 0]
      });

      var cos = Math.cos(w.rotY), sin = Math.sin(w.rotY);

      // Legs
      var legRx = sitting ? -Math.PI / 2.2 : swing;
      var legRxR = sitting ? -Math.PI / 2.2 : -swing;
      r.drawBoxRot(w.x - 0.10 * cos, hipY - 0.28, w.z + 0.10 * sin, legRx, w.rotY, 0.13, 0.56, 0.14, { color: w.pants, indoorGlow: env.indoorGlow });
      r.drawBoxRot(w.x + 0.10 * cos, hipY - 0.28, w.z - 0.10 * sin, legRxR, w.rotY, 0.13, 0.56, 0.14, { color: w.pants, indoorGlow: env.indoorGlow });

      // Torso
      var torsoY = hipY + 0.28;
      r.drawBox(w.x, torsoY, w.z, 0.36, 0.50, 0.20, { color: w.outfit, ry: w.rotY, indoorGlow: env.indoorGlow });

      // Arms
      var armRxL = sitting ? -0.95 + Math.sin(w.walkPhase) * 0.12 : -swing * 0.85;
      var armRxR = sitting ? -0.95 - Math.sin(w.walkPhase) * 0.12 : swing * 0.85;
      if (w.hasCoffee && !sitting) armRxR = -0.85;
      r.drawBoxRot(w.x - 0.24 * cos, torsoY + 0.02, w.z + 0.24 * sin, armRxL, w.rotY, 0.10, 0.44, 0.10, { color: w.outfit, indoorGlow: env.indoorGlow });
      r.drawBoxRot(w.x + 0.24 * cos, torsoY + 0.02, w.z - 0.24 * sin, armRxR, w.rotY, 0.10, 0.44, 0.10, { color: w.outfit, indoorGlow: env.indoorGlow });

      // Coffee Cup if holding coffee
      if (w.hasCoffee && !sitting) {
        var cupX = w.x + 0.24 * cos + 0.24 * sin;
        var cupZ = w.z - 0.24 * sin + 0.24 * cos;
        r.drawCyl(cupX, torsoY - 0.02, cupZ, 0, 0, 0.08, 0.11, 0.08, { color: [0.95, 0.95, 0.95] });
      }

      // Head & Hair
      var headY = torsoY + 0.39;
      r.drawSphere(w.x, headY, w.z, 0.24, 0.26, 0.24, { color: w.skin, indoorGlow: env.indoorGlow });
      r.drawSphere(w.x - 0.02 * sin, headY + 0.06, w.z - 0.02 * cos, 0.25, 0.18, 0.25, { color: w.hair, indoorGlow: env.indoorGlow });
    }
  };

  OfficeSim.Simulation = Simulation;
  OfficeSim.formatTime = formatTime;
})(window);
