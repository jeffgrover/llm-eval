/* ============================================================
   characters.js — workers + pedestrians
   One shared dynamic mesh (all characters), drawn per frame.
   ============================================================= */
var Characters = (function () {
  'use strict';
  var E = null, W = null;
  var CYCLE = 160;
  var characters = [], pedestrians = [];
  var mesh = null;
  var rng = null;
  var MAX_VERT = 9000;

  function C(hex) {
    var n = parseInt(hex.slice(1), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }

  function init(engine, world, seed) {
    E = engine; W = world;
    rng = W.mulberry32(seed || 424242);
    mesh = E.dynMesh(MAX_VERT);
    characters = []; pedestrians = [];

    var desks = world.allDesks; // office floors x4
    var workers = [];
    for (var f = 1; f <= 4; f++) {
      var floorDesks = desks.filter(function (d) { return d.floor === f; });
      for (var i = floorDesks.length - 1; i > 0; i--) {
        var j = Math.floor(rng() * (i + 1));
        var tmp = floorDesks[i]; floorDesks[i] = floorDesks[j]; floorDesks[j] = tmp;
      }
      var pick = floorDesks.slice(0, 6);
      for (var k = 0; k < pick.length; k++) workers.push({ floor: f, desk: pick[k] });
    }
    workers.push({ floor: 0, receptionist: true });

    for (var i2 = 0; i2 < workers.length; i2++) {
      var w = workers[i2];
      var isReceptionist = !!w.receptionist;
      var stopX = (rng() * 2 - 1) * 11;
      var skin = ['#e0b89e', '#caa17e', '#8d6248', '#6b4630', '#f0d0b0', '#b3815c'][Math.floor(rng() * 6)];
      var shirt = isReceptionist ? '#3c5a6b' : ['#4c6a8a', '#5a7a5a', '#8a5a6b', '#6b6a8a', '#8a7a4c', '#4c7a7a', '#7a5a3c', '#5d5d7a'][Math.floor(rng() * 8)];
      var pants = ['#33405c', '#3c4050', '#2f3535', '#463a4a', '#2c3a3a'][Math.floor(rng() * 5)];
      var hair = ['#1e1a16', '#2f241a', '#503722', '#6b4a2e', '#7d7d75', '#8a8a8a', '#2a2018'][Math.floor(rng() * 7)];
      var chair;
      if (isReceptionist) chair = { x: W.RECEPTION.chairX, z: W.RECEPTION.chairZ, yaw: 0 };
      else chair = { x: w.desk.x, z: w.desk.z + 0.95, yaw: Math.PI };
      characters.push({
        kind: 'worker', id: i2,
        floor: w.floor,
        desk: w.desk || null,
        chair: chair,
        receptionist: isReceptionist,
        stopX: stopX,
        colors: { skin: skin, shirt: shirt, pants: pants, hair: hair },
        x: stopX, y: 0.15, z: 15.9,
        yaw: Math.PI,
        phase: rng() * 6.28,
        state: 'hidden',
        hidden: true,
        path: [], pathI: 0,
        speed: 1.5 * (0.9 + rng() * 0.25),
        spawnT: 14 + rng() * 20,
        lunchAt: 52 + rng() * 12,
        willLunch: !isReceptionist && rng() < 0.38,
        coffeeAt: 100 + rng() * 10,
        willCoffee: !isReceptionist && rng() < 0.3,
        meetingAt: 78 + (w.floor - 1) * 3 + rng() * 5,
        meetingDuration: 18 + rng() * 4,
        leaveAt: 118 + rng() * 12,
        lunchDone: false, coffeeDone: false, meetingDone: false,
        lunchStart: -1, coffeeStart: -1, meetingStart: -1,
        afterRide: 'desk', targetFloor: w.floor,
        confChair: null, breakStart: -1, breakDur: 0
      });
    }

    for (i2 = 0; i2 < 3; i2++) {
      var farSide = i2 === 2;
      var dir = rng() < 0.5 ? 1 : -1;
      pedestrians.push({
        kind: 'ped', id: 100 + i2,
        farSide: farSide,
        x: (rng() * 2 - 1) * 30,
        z: farSide ? 29.3 : (i2 === 0 ? 14.25 : 14.9),
        y: 0.16,
        yaw: dir > 0 ? Math.PI / 2 : -Math.PI / 2,
        dir: dir,
        speed: 1.15 + rng() * 0.45,
        phase: rng() * 6.28,
        state: 'walking', // pedestrian: always walking
        colors: {
          skin: ['#e0b89e', '#caa17e', '#8d6248'][Math.floor(rng() * 3)],
          shirt: ['#7a6b8a', '#5a6a7a', '#8a7a6b'][Math.floor(rng() * 3)],
          pants: '#3c4050',
          hair: ['#1e1a16', '#2f241a', '#6b4a2e'][Math.floor(rng() * 3)]
        }
      });
    }
    return {
      characters: function () { return characters; },
      pedestrians: function () { return pedestrians; },
      mesh: function () { return mesh; },
      draw: draw,
      update: function (dt, t) {
        for (var i = 0; i < characters.length; i++) updateWorker(characters[i], dt, t);
        for (var j = 0; j < pedestrians.length; j++) {
          var p = pedestrians[j];
          p.x += p.dir * p.speed * dt;
          p.phase += dt * 8;
          if (p.x > 38) { p.x = 38; p.dir = -1; p.yaw = -Math.PI / 2; }
          if (p.x < -38) { p.x = -38; p.dir = 1; p.yaw = Math.PI / 2; }
          p.y = 0.16;
        }
      },
      recycleForCycle: recycleForCycle
    };
  }

  function recycleForCycle() {
    for (var i = 0; i < characters.length; i++) {
      var w = characters[i];
      w.spawnT = 14 + rng() * 20;
      w.lunchAt = 52 + rng() * 12;
      w.willLunch = !w.receptionist && rng() < 0.38;
      w.coffeeAt = 100 + rng() * 10;
      w.willCoffee = !w.receptionist && rng() < 0.3;
      w.meetingAt = 78 + (w.floor - 1) * 3 + rng() * 5;
      w.meetingDuration = 18 + rng() * 4;
      w.leaveAt = 118 + rng() * 12;
      w.lunchDone = false; w.coffeeDone = false; w.meetingDone = false;
      w.lunchStart = -1; w.coffeeStart = -1; w.meetingStart = -1; w.breakStart = -1;
      w.hidden = true;
      w.state = 'hidden';
      w.path = []; w.pathI = 0;
      w.afterRide = 'desk';
      w.waitFloor = 0;
      w.targetFloor = w.floor;
      w.x = w.stopX; w.z = 15.9; w.y = 0.15; w.yaw = Math.PI;
    }
  }

  function setPath(w, pts) {
    if (!pts || pts.length === 0) { w.path = []; return; }
    w.path = pts.slice(); w.pathI = 0;
  }

  function waypointReached(w, dt) {
    if (!w.path || w.pathI >= w.path.length) return true;
    var target = w.path[w.pathI];
    var dx = target.x - w.x, dz = target.z - w.z;
    var dist = Math.sqrt(dx * dx + dz * dz);
    var step = w.speed * dt;
    if (dist <= step + 0.03) {
      w.x = target.x; w.z = target.z;
      w.pathI++;
      if (w.pathI >= w.path.length) { w.path = []; return true; }
      return false;
    }
    var yawTo = Math.atan2(dx, dz);
    var diff = yawTo - w.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    w.yaw += diff * Math.min(1, dt * 11);
    w.x += dx / dist * step;
    w.z += dz / dist * step;
    w.phase += dt * w.speed * 5.4;
    return false;
  }

  function currentSurface(w) {
    var f = w.floor;
    switch (w.state) {
      case 'walk_in':
      case 'wait_elev':
        return W.surface(w.waitFloor !== undefined ? w.waitFloor : 0);
      case 'to_break_point':
      case 'break':
      case 'back_from_break':
        return W.surface(0);
      case 'walk_out':
        return 0.15;
      case 'boarding':
      case 'riding':
      case 'exit_car':
        return (w.carY !== undefined ? w.carY : 0.55);
      default:
        return W.surface(f);
    }
  }

  function waitPosition(w) {
    var idx = w.id % 5;
    return { x: (idx - 2) * 0.32, z: -1.55 };
  }

  function chairYawFor(w) {
    if (w.receptionist) return 0;
    return w.chair.yaw;
  }

  function deskPath(w, desk) {
    var pts = [];
    if (desk.z > 0) {
      pts = [{ x: 0, z: 5.55 }, { x: desk.x, z: 5.55 }, { x: desk.x, z: desk.z + 0.95 }];
    } else {
      var approachX = desk.x + 1.85;
      pts = [{ x: 0, z: 5.55 }, { x: approachX, z: 5.55 }, { x: approachX, z: -0.55 }, { x: desk.x, z: desk.z + 0.95 }];
    }
    return pts;
  }

  function deskToLobby(w) {
    var d = w.desk;
    if (d.z > 0) {
      return [{ x: w.chair.x, z: 5.55 }, { x: 0, z: 5.55 }, { x: 0, z: -1.6 }];
    }
    var approachX = d.x + 1.85;
    return [{ x: approachX, z: -0.55 }, { x: approachX, z: 5.55 }, { x: 0, z: 5.55 }, { x: 0, z: -1.6 }];
  }

  function confPath(w) {
    var d = w.desk;
    var cx = w.confChair ? w.confChair.x : 5.65;
    var cz = w.confChair ? w.confChair.z : -5.05;
    var pts = [];
    if (d.z > 0) {
      pts.push({ x: w.chair.x, z: 5.55 });
    } else {
      var approachX = d.x + 1.85;
      pts.push({ x: approachX, z: -0.55 }, { x: approachX, z: 5.55 });
    }
    pts.push({ x: 10.35, z: 5.55 }, { x: 10.35, z: -1.9 }, { x: 5.6, z: -1.9 }, { x: 5.6, z: -4.4 }, { x: cx, z: cz });
    return pts;
  }

  function confToDeskPath(w) {
    var d = w.desk;
    if (d.z > 0) {
      return [{ x: 10.35, z: -1.9 }, { x: 10.35, z: 5.55 }, { x: w.chair.x, z: 5.55 }, { x: w.chair.x, z: w.chair.z }];
    }
    var approachX = d.x + 1.85;
    return [{ x: 10.35, z: -1.9 }, { x: 10.35, z: 5.55 }, { x: approachX, z: 5.55 }, { x: approachX, z: -0.55 }, { x: w.chair.x, z: w.chair.z }];
  }

  function walkOutPath(w) {
    var pts = [];
    if (w.receptionist) {
      pts = [{ x: -8.3, z: 1.6 }, { x: -8.3, z: 4.9 }, { x: 0, z: 5.0 }, { x: 0, z: 7.05 }, { x: 0, z: 15.9 }, { x: (w.stopX >= 0 ? 44 : -44), z: 15.9 }];
      return pts;
    }
    var d = w.desk;
    if (d.z > 0) {
      pts = [{ x: w.chair.x, z: 5.55 }, { x: 0, z: 5.55 }];
    } else {
      var approachX = d.x + 1.85;
      pts = [{ x: approachX, z: -0.55 }, { x: approachX, z: 5.55 }, { x: 0, z: 5.55 }];
    }
    pts.push({ x: 0, z: 7.05 }, { x: 0, z: 15.9 }, { x: (w.stopX >= 0 ? 44 : -44), z: 15.9 });
    return pts;
  }

  function breakOutPath(w) {
    var d = w.desk;
    var pts = [];
    if (d.z > 0) {
      pts = [{ x: w.chair.x, z: 5.55 }, { x: 0, z: 5.55 }, { x: 0, z: -1.6 }];
    } else {
      var approachX = d.x + 1.85;
      pts = [{ x: approachX, z: -0.55 }, { x: approachX, z: 5.55 }, { x: 0, z: 5.55 }, { x: 0, z: -1.6 }];
    }
    return pts;
  }

  function breakBackPath(w) {
    return [{ x: 0, z: -1.6 }];
  }

  function updateWorker(w, dt, t) {
    if (w.hidden) {
      if (t >= w.spawnT) {
        w.hidden = false;
        w.state = 'walk_in';
        w.waitFloor = 0;
        w.targetFloor = w.floor;
        w.afterRide = 'desk';
        var pts;
        if (w.receptionist) {
          pts = [{ x: 0, z: 15.9 }, { x: 0, z: 6.95 }, { x: 0, z: -1.6 }, { x: 0, z: 5.0 }, { x: -8.3, z: 4.9 }, { x: -8.3, z: 1.6 }, { x: -6.6, z: 1.85 }];
        } else {
          pts = [{ x: 0, z: 15.9 }, { x: 0, z: 6.95 }, { x: 0, z: -1.6 }];
        }
        setPath(w, pts);
      }
      return;
    }

    var targetY = currentSurface(w);
    w.y += (targetY - w.y) * Math.min(1, dt * 7);

    switch (w.state) {
      case 'walk_in':
        if (waypointReached(w, dt)) {
          if (w.receptionist) {
            w.state = 'desk'; w.facingYaw = 0;
          } else {
            w.waitFloor = 0; w.targetFloor = w.floor; w.afterRide = 'desk';
            w.state = 'wait_elev';
          }
        }
        break;

      case 'wait_elev':
        var wp = waitPosition(w);
        w.x += (wp.x - w.x) * Math.min(1, dt * 5);
        w.z += (wp.z - w.z) * Math.min(1, dt * 5);
        w.yaw += (Math.PI - w.yaw) * Math.min(1, dt * 5);
        w.phase += dt * 1.1;
        break;

      case 'boarding':
        if (waypointReached(w, dt)) {
          w.state = 'riding';
          w.phase = 0;
        }
        break;

      case 'riding':
        w.x += (w.carX - w.x) * Math.min(1, dt * 6);
        w.z += (w.carZ - w.z) * Math.min(1, dt * 6);
        w.y = w.carY + 0.12;
        w.yaw += ((Math.PI - w.yaw) ) * Math.min(1, dt * 5);
        break;

      case 'exit_car':
        if (waypointReached(w, dt)) {
          if (w.afterRide === 'break') {
            w.state = 'to_break_point';
            setPath(w, [{ x: W.BREAK_PT.x, z: W.BREAK_PT.z }]);
          } else {
            w.state = 'to_desk';
            setPath(w, deskPath(w, w.desk));
          }
        }
        break;

      case 'to_desk':
        if (waypointReached(w, dt)) {
          w.state = 'desk'; w.facingYaw = chairYawFor(w);
        }
        break;

      case 'to_break_point':
        if (waypointReached(w, dt)) {
          w.state = 'break';
          w.breakStart = t;
          w.yaw = Math.PI;
        }
        break;

      case 'break':
        w.x += (W.BREAK_PT.x - w.x) * Math.min(1, dt * 8);
        w.z += (W.BREAK_PT.z - w.z) * Math.min(1, dt * 8);
        w.yaw = Math.PI;
        var isLunch = w.lunchStart > 0 && (t - w.lunchStart) < 25;
        var dur = isLunch ? 21 : 13;
        var started = isLunch ? w.lunchStart : w.coffeeStart;
        if (t >= started + dur) {
          if (isLunch) w.lunchDone = true; else w.coffeeDone = true;
          w.targetFloor = w.floor; w.afterRide = 'desk';
          w.state = 'back_from_break';
          setPath(w, breakBackPath(w));
        }
        break;

      case 'back_from_break':
        if (waypointReached(w, dt)) {
          w.waitFloor = 0; w.targetFloor = w.floor; w.afterRide = 'desk';
          w.state = 'wait_elev';
        }
        break;

      case 'desk':
        w.x += (w.chair.x - w.x) * Math.min(1, dt * 8);
        w.z += (w.chair.z - w.z) * Math.min(1, dt * 8);
        w.yaw = chairYawFor(w);
        if (!w.receptionist && w.meetingStart === -1 && !w.meetingDone && w.floor > 0 && t >= w.meetingAt) {
          w.state = 'to_meeting';
          w.meetingStart = t;
          var confChairs = W.conferenceChairs(w.floor);
          var pick = confChairs[(w.id * 7 + w.floor * 3) % confChairs.length];
          w.confChair = pick;
          setPath(w, confPath(w));
        } else if (w.lunchStart === -1 && !w.lunchDone && !w.receptionist && w.willLunch && t >= w.lunchAt && w.floor > 0) {
          w.state = 'to_lunch';
          w.lunchStart = t;
          w.waitFloor = w.floor; w.targetFloor = 0; w.afterRide = 'break';
          setPath(w, breakOutPath(w));
        } else if (w.coffeeStart === -1 && !w.coffeeDone && !w.receptionist && w.willCoffee && t >= w.coffeeAt && w.floor > 0) {
          w.state = 'to_coffee';
          w.coffeeStart = t;
          w.waitFloor = w.floor; w.targetFloor = 0; w.afterRide = 'break';
          setPath(w, breakOutPath(w));
        } else if (t >= w.leaveAt) {
          w.state = 'walk_out';
          setPath(w, walkOutPath(w));
        }
        break;

      case 'to_meeting':
        if (waypointReached(w, dt)) {
          w.state = 'meeting'; w.meetingDone = true;
        }
        break;

      case 'meeting':
        w.x += (w.confChair.x - w.x) * Math.min(1, dt * 8);
        w.z += (w.confChair.z - w.z) * Math.min(1, dt * 8);
        w.yaw = w.confChair.yaw;
        if (t >= w.meetingStart + w.meetingDuration) {
          w.state = 'back_from_meeting';
          setPath(w, confToDeskPath(w));
        }
        break;

      case 'back_from_meeting':
        if (waypointReached(w, dt)) {
          w.state = 'desk'; w.facingYaw = chairYawFor(w);
        }
        break;

      case 'to_lunch':
      case 'to_coffee':
        // walking desk → shaft lobby (at office floor); on complete → wait at elevator.
        // waitFloor/targetFloor/afterRide were set at entry time — keep them.
        if (waypointReached(w, dt)) {
          w.state = 'wait_elev';
        }
        break;

      case 'walk_out':
        if (waypointReached(w, dt)) {
          w.hidden = true; w.state = 'hidden';
        }
        break;
    }

    if (w.state === 'walk_in' || w.state === 'to_desk' || w.state === 'to_meeting' || w.state === 'to_lunch' || w.state === 'to_coffee' || w.state === 'to_break_point' || w.state === 'back_from_break' || w.state === 'back_from_meeting' || w.state === 'walk_out' || w.state === 'exit_car' || w.state === 'boarding' || w.state === 'walking') {
      w.phase += dt * 0.3; // tiny ambient phase; walking phase handled in waypointReached
    }
  }

  /* ---------- drawing ---------- */
  var IDENTITY = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
  var IDENTITY3 = new Float32Array([1,0,0, 0,1,0, 0,0,1]);

  function boxLocal(m, px, py, pz, wq, hq, dq, col, cosR, sinR, pYv, pZv, yawCos, yawSin, wx, wy, wz) {
    var x0 = px - wq / 2, x1 = px + wq / 2, y0l = py - hq / 2, y1l = py + hq / 2, z0 = pz - dq / 2, z1 = pz + dq / 2;
    function T(px2, py2, pz2) {
      var py3 = py2, pz3 = pz2;
      if (sinR !== 0) {
        var dy = py2 - pYv, dz = pz2 - pZv;
        py3 = pYv + dy * cosR - dz * sinR;
        pz3 = pZv + dy * sinR + dz * cosR;
      }
      var wx2 = px2 * yawCos + pz3 * yawSin + wx;
      var wz2 = -px2 * yawSin + pz3 * yawCos + wz;
      return [wx2, wy + py3, wz2];
    }
    function N(nx, ny, nz) {
      var nx2 = nx, ny2 = ny, nz2 = nz;
      if (sinR !== 0) {
        var ny3 = ny * cosR - nz * sinR;
        var nz3 = ny * sinR + nz * cosR;
        ny2 = ny3; nz2 = nz3;
      }
      var nx3 = nx2 * yawCos + nz2 * yawSin;
      var nz4 = -nx2 * yawSin + nz2 * yawCos;
      return [nx3, ny2, nz4];
    }
    var A = T(x0, y0l, z1), B = T(x1, y0l, z1), Cc = T(x1, y1l, z1), D = T(x0, y1l, z1);
    var F2 = T(x0, y0l, z0), G2 = T(x0, y1l, z0), H2 = T(x1, y1l, z0), I2 = T(x1, y0l, z0);
    E.dynQuad(m, A, B, Cc, D, N(0, 0, 1), col);
    E.dynQuad(m, I2, H2, G2, F2, N(0, 0, -1), col);
    E.dynQuad(m, B, I2, H2, Cc, N(1, 0, 0), col);
    E.dynQuad(m, D, G2, F2, A, N(-1, 0, 0), col);
    E.dynQuad(m, D, Cc, H2, G2, N(0, 1, 0), col);
    E.dynQuad(m, A, B, I2, F2, N(0, -1, 0), col);
  }

  function drawWorker(m, w) {
    var colors = w.colors;
    var walking = (w.state === 'walking' || w.state === 'walk_in' || w.state === 'to_desk' || w.state === 'to_meeting' || w.state === 'to_lunch' || w.state === 'to_coffee' || w.state === 'to_break_point' || w.state === 'back_from_break' || w.state === 'back_from_meeting' || w.state === 'walk_out' || w.state === 'exit_car' || w.state === 'boarding');
    var typing = w.state === 'desk';
    var meeting = w.state === 'meeting';
    var sitting = typing || meeting;
    var breakfast = w.state === 'break';
    var bob = walking ? Math.abs(Math.sin(w.phase)) * 0.035 : 0;
    var wx = w.x, wz = w.z, wy = w.y + bob;
    var yaw = w.yaw;
    var yawCos = Math.cos(yaw), yawSin = Math.sin(yaw);
    var skinCol = C(colors.skin);
    var shirtCol = C(colors.shirt);
    var pantsCol = C(colors.pants);
    var hairCol = C(colors.hair);
    var shoeCol = C('#23262c');

    function box(px, py, pz, wq, hq, dq, col, rotX, pYv, pZv) {
      var cosR = 1, sinR = 0;
      if (rotX !== undefined && rotX !== 0) { cosR = Math.cos(rotX); sinR = Math.sin(rotX); }
      boxLocal(m, px, py, pz, wq, hq, dq, col, cosR, sinR, pYv, pZv, yawCos, yawSin, wx, wy, wz);
    }

    if (sitting) {
      box(-0.11, 0.42, 0.16, 0.17, 0.17, 0.46, pantsCol, 0, 0, 0);
      box(0.11, 0.42, 0.16, 0.17, 0.17, 0.46, pantsCol, 0, 0, 0);
      box(-0.11, 0.2, 0.36, 0.15, 0.4, 0.16, pantsCol, 0, 0, 0);
      box(0.11, 0.2, 0.36, 0.15, 0.4, 0.16, pantsCol, 0, 0, 0);
      box(0, 0.82, -0.02, 0.45, 0.56, 0.26, shirtCol, sitting ? 0.05 : 0, 0, 0);
      box(0, 1.32, 0.02, 0.30, 0.30, 0.29, skinCol, 0, 0, 0);
      box(0, 1.51, 0.0, 0.33, 0.09, 0.32, hairCol, 0, 0, 0);
      var typingPhase = w.phase * 2.2;
      var armSwingL = typing ? -1.05 + Math.sin(typingPhase + w.id * 1.3) * 0.22 : (meeting ? -1.05 : -0.4);
      var armSwingR = typing ? -1.05 + Math.sin(typingPhase + 2.4 + w.id * 0.7) * 0.22 : (meeting ? -1.05 : -0.4);
      box(-0.29, 1.02, 0.04, 0.11, 0.47, 0.12, shirtCol, armSwingL, 1.0, 0.05);
      box(0.29, 1.02, 0.04, 0.11, 0.47, 0.12, shirtCol, armSwingR, 1.0, 0.05);
    } else {
      var legSwing = walking ? Math.sin(w.phase) * 0.55 : 0;
      box(-0.115, 0.40, 0, 0.15, 0.78, 0.18, pantsCol, -legSwing, 0.80, 0);
      box(0.115, 0.40, 0, 0.15, 0.78, 0.18, pantsCol, legSwing, 0.80, 0);
      box(-0.115, 0.05, 0.06, 0.17, 0.10, 0.26, shoeCol, -legSwing, 0.80, 0);
      box(0.115, 0.05, 0.06, 0.17, 0.10, 0.26, shoeCol, legSwing, 0.80, 0);
      var lean = walking ? 0.10 : 0.02;
      box(0, 1.08, 0, 0.46, 0.58, 0.26, shirtCol, lean, 0.82, 0);
      var armSwing2 = walking ? Math.sin(w.phase) * 0.45 : (breakfast ? -0.55 : 0.08);
      box(-0.30, 1.08, 0.0, 0.12, 0.52, 0.13, shirtCol, -armSwing2, 1.32, 0);
      box(0.30, 1.08, 0.0, 0.12, 0.52, 0.13, shirtCol, armSwing2, 1.32, 0);
      if (breakfast) {
        box(0.30, 1.18, 0.32, 0.10, 0.11, 0.10, C('#e8e0d0'), -0.9, 1.38, 0);
      }
      var headDown = breakfast ? 0.18 : (walking ? 0.06 : 0.02);
      box(0, 1.56, 0.02, 0.30, 0.30, 0.29, skinCol, headDown, 1.34, 0.02);
      box(0, 1.74, -0.01, 0.33, 0.10, 0.32, hairCol, headDown, 1.72, 0);
    }
  }

  function draw(ctx) {
    var m = mesh;
    E.dynReset(m);
    for (var i = 0; i < characters.length; i++) {
      var w = characters[i];
      if (w.hidden) continue;
      drawWorker(m, w);
    }
    for (var j = 0; j < pedestrians.length; j++) {
      var p = pedestrians[j];
      drawWorker(m, p);
    }
    E.dynFlush(m, true);
    E.drawMain(m, {
      uViewProj: ctx.viewProj,
      uModel: IDENTITY,
      uNormal: IDENTITY3,
      uSunDir: ctx.sunDir,
      uSunColor: ctx.sunColor,
      uSkyColor: ctx.skyColor,
      uGroundColor: ctx.groundColor,
      uAmbient: ctx.ambient,
      uInteriorBoost: ctx.interiorBoost,
      uFogNear: ctx.fogNear,
      uFogFar: ctx.fogFar,
      uFogColor: ctx.fogColor,
      uCamPos: ctx.camPos
    }, { doubleSided: false });
  }

  /* ============ public ============ */
  return {
    init: init,
    recycleForCycle: recycleForCycle,
    characters: function () { return characters; },
    pedestrians: function () { return pedestrians; },
    mesh: function () { return mesh; },
    draw: draw,
    update: function (dt, t) {
      for (var i = 0; i < characters.length; i++) updateWorker(characters[i], dt, t);
      for (var j = 0; j < pedestrians.length; j++) {
        var p = pedestrians[j];
        p.x += p.dir * p.speed * dt;
        p.phase += dt * 8;
        if (p.x > 38) { p.x = 38; p.dir = -1; p.yaw = -Math.PI / 2; }
        if (p.x < -38) { p.x = -38; p.dir = 1; p.yaw = Math.PI / 2; }
        p.y = 0.16;
      }
    }
  };
})();
