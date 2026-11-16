(function (global) {
  'use strict';

  var OfficeSim = global.OfficeSim;
  var M = OfficeSim.Math;
  var FLOOR_H = OfficeSim.CONST.FLOOR_H;

  var canvas = document.getElementById('gl-canvas');
  var renderer = new OfficeSim.Renderer(canvas);
  var world = new OfficeSim.World();
  var sim = new OfficeSim.Simulation();

  // Camera State
  var cam = {
    yaw: 0.48,
    pitch: 0.38,
    dist: 42,
    target: [0, 9.5, 0],
    goalYaw: 0.48,
    goalPitch: 0.38,
    goalDist: 42,
    goalTarget: [0, 9.5, 0],
    followWorkerId: null
  };

  var selectedEntity = null; // { type: 'worker' | 'elevator', id: number|string }

  var viewMat = M.Mat4.create();
  var projMat = M.Mat4.create();
  var viewProjMat = M.Mat4.create();
  var invViewProjMat = M.Mat4.create();

  // Pointer / Orbit / Pan / Zoom / Click-Pick
  var dragging = false;
  var panMode = false;
  var dragDist = 0;
  var lastX = 0, lastY = 0;

  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  canvas.addEventListener('mousedown', function (e) {
    dragging = true;
    panMode = (e.button === 2 || e.shiftKey);
    dragDist = 0;
    lastX = e.clientX;
    lastY = e.clientY;
  });

  window.addEventListener('mousemove', function (e) {
    if (!dragging) return;
    var dx = e.clientX - lastX;
    var dy = e.clientY - lastY;
    dragDist += Math.hypot(dx, dy);
    lastX = e.clientX;
    lastY = e.clientY;

    if (panMode) {
      cam.followWorkerId = null;
      var panScale = cam.goalDist * 0.0014;
      var rightX = Math.cos(cam.goalYaw);
      var rightZ = -Math.sin(cam.goalYaw);
      cam.goalTarget[0] -= rightX * dx * panScale;
      cam.goalTarget[2] -= rightZ * dx * panScale;
      cam.goalTarget[1] = M.clamp(cam.goalTarget[1] + dy * panScale, 0.5, 25);
    } else {
      cam.goalYaw -= dx * 0.0065;
      cam.goalPitch = M.clamp(cam.goalPitch + dy * 0.006, 0.06, 1.42);
    }
  });

  window.addEventListener('mouseup', function (e) {
    if (dragging && dragDist < 6 && e.button === 0) {
      handlePick(e.clientX, e.clientY);
    }
    dragging = false;
  });

  canvas.addEventListener('wheel', function (e) {
    e.preventDefault();
    cam.goalDist = M.clamp(cam.goalDist * (1 + e.deltaY * 0.0011), 8, 95);
  }, { passive: false });

  function handlePick(clientX, clientY) {
    var rect = canvas.getBoundingClientRect();
    var ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    var ndcY = 1 - ((clientY - rect.top) / rect.height) * 2;
    M.Mat4.invert(invViewProjMat, viewProjMat);
    var ray = M.unprojectRay(ndcX, ndcY, invViewProjMat);

    var bestT = Infinity;
    var hit = null;

    // Test workers
    for (var i = 0; i < sim.workers.length; i++) {
      var w = sim.workers[i];
      if (w.state === 'OFFSITE') continue;
      var t = M.intersectRayAABB(
        ray.origin, ray.dir,
        [w.x - 0.45, w.y + 0.1, w.z - 0.45],
        [w.x + 0.45, w.y + 1.85, w.z + 0.45]
      );
      if (t !== null && t < bestT) {
        bestT = t;
        hit = { type: 'worker', id: w.id };
      }
    }

    // Test elevators
    for (var ei = 0; ei < sim.elevators.length; ei++) {
      var el = sim.elevators[ei];
      var te = M.intersectRayAABB(
        ray.origin, ray.dir,
        [el.x - 1.0, el.y + 0.1, el.z - 1.0],
        [el.x + 1.0, el.y + 2.5, el.z + 1.0]
      );
      if (te !== null && te < bestT) {
        bestT = te;
        hit = { type: 'elevator', id: el.id };
      }
    }

    selectedEntity = hit;
    if (!hit) cam.followWorkerId = null;
    updateInspector();
  }

  // UI Wiring
  document.querySelectorAll('[data-speed]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('[data-speed]').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      sim.speed = parseFloat(btn.getAttribute('data-speed'));
    });
  });

  document.querySelectorAll('[data-jump]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      sim.jumpToHour(parseFloat(btn.getAttribute('data-jump')));
    });
  });

  document.querySelectorAll('[data-view]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('[data-view]').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      world.viewMode = btn.getAttribute('data-view');
    });
  });

  document.querySelectorAll('[data-cam]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('[data-cam]').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      cam.followWorkerId = null;
      var mode = btn.getAttribute('data-cam');
      if (mode === 'overview') {
        cam.goalYaw = 0.48; cam.goalPitch = 0.38; cam.goalDist = 42; cam.goalTarget = [0, 9.5, 0];
      } else if (mode === 'street') {
        cam.goalYaw = 0.25; cam.goalPitch = 0.14; cam.goalDist = 26; cam.goalTarget = [0, 3.0, 5.0];
      } else if (mode === 'elevators') {
        cam.goalYaw = 0.05; cam.goalPitch = 0.28; cam.goalDist = 22; cam.goalTarget = [-0.3, 9.5, -4.5];
      } else if (mode === 'rooftop') {
        cam.goalYaw = -0.65; cam.goalPitch = 0.52; cam.goalDist = 22; cam.goalTarget = [4.0, 19.0, 1.5];
      }
    });
  });

  document.querySelectorAll('.floor-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.floor-btn').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      var f = parseInt(btn.getAttribute('data-floor'), 10);
      world.focusFloor = f;
      cam.followWorkerId = null;
      if (f === 0) {
        cam.goalTarget = [0, 9.5, 0];
        cam.goalDist = 42;
      } else {
        cam.goalTarget = [0, (f - 1) * FLOOR_H + 1.5, 0];
        cam.goalDist = 25;
      }
    });
  });

  document.getElementById('elev-a-card').addEventListener('click', function () {
    selectedEntity = { type: 'elevator', id: 'A' };
    updateInspector();
  });
  document.getElementById('elev-b-card').addEventListener('click', function () {
    selectedEntity = { type: 'elevator', id: 'B' };
    updateInspector();
  });
  document.getElementById('insp-close').addEventListener('click', function () {
    selectedEntity = null;
    cam.followWorkerId = null;
    updateInspector();
  });

  var btnFollow = document.getElementById('btn-follow');
  btnFollow.addEventListener('click', function () {
    if (selectedEntity && selectedEntity.type === 'worker') {
      if (cam.followWorkerId === selectedEntity.id) {
        cam.followWorkerId = null;
      } else {
        cam.followWorkerId = selectedEntity.id;
        cam.goalDist = 12;
      }
      updateInspector();
    }
  });

  function getPhaseLabel(h) {
    if (h < 7.5) return 'Early Morning';
    if (h < 9.5) return 'Morning Arrival';
    if (h < 11.8) return 'Core Workday';
    if (h < 13.5) return 'Lunch Rush';
    if (h < 16.8) return 'Afternoon Focus';
    if (h < 18.8) return 'Evening Departure';
    return 'Night Shift';
  }

  function formatState(s) {
    var map = {
      OFFSITE: 'Offsite',
      WALKING: 'Walking',
      WAITING_ELEVATOR: 'Waiting for Elevator',
      BOARDING_ELEVATOR: 'Boarding Elevator',
      RIDING_ELEVATOR: 'Riding Elevator',
      EXITING_ELEVATOR: 'Exiting Elevator',
      TAKING_STAIRS: 'Taking Stairs',
      WORKING: 'Working at Desk',
      IN_MEETING: 'In Meeting',
      BREAK: 'Coffee / Lunch Break',
      LEAVING: 'Heading Home'
    };
    return map[s] || s;
  }

  function updateInspector() {
    var nameEl = document.getElementById('insp-name');
    var roleEl = document.getElementById('insp-role');
    var bodyEl = document.getElementById('insp-body');

    if (!selectedEntity) {
      nameEl.textContent = 'Click a Worker';
      roleEl.textContent = 'or an Elevator Car to inspect';
      bodyEl.classList.add('hidden');
      return;
    }

    bodyEl.classList.remove('hidden');

    if (selectedEntity.type === 'worker') {
      var w = sim.workers[selectedEntity.id];
      nameEl.textContent = w.name;
      roleEl.textContent = w.role + ' (Home: F' + w.homeFloor + ')';
      document.getElementById('insp-loc').textContent = w.state === 'OFFSITE' ? 'Outside' : 'Floor ' + w.floor;
      document.getElementById('insp-state').textContent = formatState(w.state);
      document.getElementById('insp-dest').textContent = 'Floor ' + w.destFloor;

      document.getElementById('val-energy').textContent = Math.round(w.energy) + '%';
      document.getElementById('bar-energy').style.width = Math.round(w.energy) + '%';
      document.getElementById('val-focus').textContent = Math.round(w.focus) + '%';
      document.getElementById('bar-focus').style.width = Math.round(w.focus) + '%';
      document.getElementById('val-caffeine').textContent = Math.round(w.caffeine) + '%';
      document.getElementById('bar-caffeine').style.width = Math.round(w.caffeine) + '%';

      btnFollow.style.display = 'block';
      btnFollow.classList.toggle('active', cam.followWorkerId === w.id);
      btnFollow.textContent = cam.followWorkerId === w.id ? 'Following (Click to Stop)' : 'Follow Camera';
    } else {
      var el = sim.elevators[selectedEntity.id === 'A' ? 0 : 1];
      nameEl.textContent = 'Elevator ' + el.id;
      roleEl.textContent = 'Traction Passenger Lift';
      document.getElementById('insp-loc').textContent = 'Floor ' + el.floor;
      document.getElementById('insp-state').textContent = el.state;
      document.getElementById('insp-dest').textContent = el.state === 'MOVING' ? ('Floor ' + el.targetFloor) : '—';
      btnFollow.style.display = 'none';
    }
  }

  var hudTimer = 0;
  function updateHUD() {
    document.getElementById('sim-time').textContent = OfficeSim.formatTime(sim.timeHours);
    document.getElementById('sim-phase').textContent = getPhaseLabel(sim.timeHours);

    var inside = 0, working = 0, meetings = 0;
    for (var i = 0; i < sim.workers.length; i++) {
      var w = sim.workers[i];
      if (w.state !== 'OFFSITE') inside++;
      if (w.state === 'WORKING') working++;
      if (w.state === 'IN_MEETING') meetings++;
    }
    document.getElementById('stat-inside').textContent = inside;
    document.getElementById('stat-working').textContent = working;
    document.getElementById('stat-meetings').textContent = meetings;

    var eA = sim.elevators[0], eB = sim.elevators[1];
    document.getElementById('stat-elevators').textContent = 'F' + eA.floor + ' / F' + eB.floor;

    function updateElevCard(prefix, el) {
      document.getElementById(prefix + '-floor').textContent = 'F' + el.floor;
      document.getElementById(prefix + '-dir').textContent = el.dir > 0 ? '▲ UP' : (el.dir < 0 ? '▼ DOWN' : el.state);
      var doorTxt = el.doorOpen > 0.5 ? 'Doors Open' : (el.doorOpen > 0.05 ? 'Doors Moving' : 'Doors Closed');
      document.getElementById(prefix + '-meta').textContent = el.riders.length + '/' + el.capacity + ' riders • ' + doorTxt;
    }
    updateElevCard('elev-a', eA);
    updateElevCard('elev-b', eB);

    // Event log
    var logEl = document.getElementById('event-log');
    var html = '';
    for (var l = 0; l < Math.min(8, sim.logs.length); l++) {
      html += '<li><span class="log-time">' + sim.logs[l].time + '</span>' + sim.logs[l].msg + '</li>';
    }
    logEl.innerHTML = html;

    if (selectedEntity) updateInspector();
  }

  // Main Animation Loop
  var lastTime = performance.now();
  function frame(now) {
    var dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;

    // Update Simulation & World
    sim.update(dt);
    world.update(dt * Math.max(0.4, Math.min(4, sim.speed)));

    // Follow Worker Camera
    if (cam.followWorkerId !== null) {
      var fw = sim.workers[cam.followWorkerId];
      if (fw && fw.state !== 'OFFSITE') {
        cam.goalTarget = [fw.x, fw.y + 1.2, fw.z];
      }
    }

    // Smooth Camera Damping
    var damp = Math.min(1, dt * 8.0);
    cam.yaw = M.lerp(cam.yaw, cam.goalYaw, damp);
    cam.pitch = M.lerp(cam.pitch, cam.goalPitch, damp);
    cam.dist = M.lerp(cam.dist, cam.goalDist, damp);
    cam.target[0] = M.lerp(cam.target[0], cam.goalTarget[0], damp);
    cam.target[1] = M.lerp(cam.target[1], cam.goalTarget[1], damp);
    cam.target[2] = M.lerp(cam.target[2], cam.goalTarget[2], damp);

    var camPos = [
      cam.target[0] + cam.dist * Math.cos(cam.pitch) * Math.sin(cam.yaw),
      cam.target[1] + cam.dist * Math.sin(cam.pitch),
      cam.target[2] + cam.dist * Math.cos(cam.pitch) * Math.cos(cam.yaw)
    ];

    var aspect = renderer.resize();
    M.Mat4.perspective(projMat, 45 * Math.PI / 180, aspect, 0.5, 220);
    M.Mat4.lookAt(viewMat, camPos, cam.target, [0, 1, 0]);
    M.Mat4.multiply(viewProjMat, projMat, viewMat);

    var env = OfficeSim.World ? world : null;
    // Compute sky/sun lighting for current time
    var lighting = (function () {
      // Reuse getEnvironment from world.js via a small helper or attach it
      return OfficeSim.getEnvironment ? OfficeSim.getEnvironment(sim.timeHours) : null;
    })();

    renderer.beginFrame(lighting, viewProjMat, camPos);
    world.drawOutdoors(renderer, lighting);
    world.drawBuilding(renderer, lighting, sim);
    sim.draw(renderer, lighting, selectedEntity);
    renderer.endFrame();

    hudTimer += dt;
    if (hudTimer >= 0.15) {
      hudTimer = 0;
      updateHUD();
    }

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
})(window);
