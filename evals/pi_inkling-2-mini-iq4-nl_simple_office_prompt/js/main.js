/* ============================================================
   main.js — Meridian Tower: living office simulation
   ============================================================ */
var Main = (function () {
  'use strict';

  var E, W, chars;
  var canvas, gl;
  var world;                 // World.build() result
  var skyMesh;
  var skyC = { radius: 340 };
  var elevatorCarMesh;
  var carsMesh, shadowMesh, canopyGlow, headlampGlow, ceilingGlow, lampGlow, beaconGlow, spillGlow;
  var elevator = { y: 0.55, floor: 0, target: 0, state: 'idle', doors: 0, openTimer: 0 };
  var simTime = 0, cycleTime = 0, lastCycle = -1;
  var camera = { yaw: 0.62, pitch: 0.47, dist: 52, idle: 0 };
  var dragging = false, dragDX = 0, dragDY = 0;
  var viewProj = null, viewMat = null, camPos = [0, 0, 0];
  var sunDir = [0, 0, 0], sunColor = [1, 0.95, 0.85], skyColor = [0.55, 0.7, 0.9], groundColor = [0.45, 0.42, 0.4];
  var zenith = [0.32, 0.56, 0.86], horizon = [0.77, 0.85, 0.94];
  var nightFactor = 0, lightsOn = 0, ambientLight = 0.85;
  var fogColor = [0.77, 0.85, 0.94], fogNear = 110, fogFar = 400;
  var clouds = [], birds = [], cars = [];
  var cloudMeshes = [];
  var hudClock, hudPhase, hudEl, hudLight;
  var IDENTITY = new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
  var IDENTITY3 = new Float32Array([1,0,0, 0,1,0, 0,0,1]);

  /* ---------- helpers ---------- */
  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp3(a, b, t) { return [lerp(a[0],b[0],t), lerp(a[1],b[1],t), lerp(a[2],b[2],t)]; }
  function hexRGB(hex) {
    var n = parseInt(hex.slice(1), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }
  function mkModel(tx, ty, tz) {
    return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, tx,ty,tz, 1]);
  }

  /* ---------- sky palettes ---------- */
  var SKY_STOPS = [
    { t: 0,   zen: [0.035, 0.045, 0.10], hor: [0.10, 0.11, 0.19] },
    { t: 20,  zen: [0.30, 0.38, 0.58], hor: [0.92, 0.56, 0.36] },
    { t: 45,  zen: [0.30, 0.55, 0.85], hor: [0.78, 0.86, 0.95] },
    { t: 95,  zen: [0.30, 0.52, 0.82], hor: [0.74, 0.82, 0.92] },
    { t: 118, zen: [0.20, 0.24, 0.44], hor: [0.92, 0.52, 0.34] },
    { t: 140, zen: [0.035, 0.045, 0.10], hor: [0.10, 0.11, 0.19] },
    { t: 160, zen: [0.035, 0.045, 0.10], hor: [0.10, 0.11, 0.19] }
  ];
  function palette(t) {
    var i = 0;
    while (i < SKY_STOPS.length - 2 && t > SKY_STOPS[i + 1].t) i++;
    var a = SKY_STOPS[i], b = SKY_STOPS[i + 1];
    var k = clamp((t - a.t) / (b.t - a.t), 0, 1);
    return { zen: lerp3(a.zen, b.zen, k), hor: lerp3(a.hor, b.hor, k) };
  }

  function daylight(t) {
    // smooth day 0..1
    var e = Math.sin((t / 160) * Math.PI * 2 - 0.35 * Math.PI);
    return { elev: e, light: clamp((e + 0.12) / 0.45, 0, 1) };
  }

  /* ---------- init ---------- */
  function init() {
    E = Engine; W = World;
    canvas = E.canvas; gl = E.gl;

    world = W.build(E);
    chars = Characters.init(E, world, 4242);

    // sky dome
    var sb = E.Builder();
    sb.sphere(0, 0, 0, skyC.radius, 26, [1, 1, 1], 1);
    skyMesh = E.makeMesh(sb.build());

    // elevator car
    elevatorCarMesh = W.buildCarGeometry(E);

    // dynamic meshes
    carsMesh   = E.dynMesh(4000);
    shadowMesh = E.dynMesh(4000);
    canopyGlow = E.dynGlowMesh(256);
    headlampGlow = E.dynGlowMesh(1024);
    ceilingGlow = E.dynGlowMesh(1024);
    lampGlow    = E.dynGlowMesh(256);
    beaconGlow  = E.dynGlowMesh(96);
    spillGlow   = E.dynGlowMesh(256);

    buildClouds();
    buildCars();
    buildBirds();

    // HUD refs
    hudClock = document.getElementById('clock');
    hudPhase = document.getElementById('phase');
    hudEl = document.getElementById('el');
    hudLight = document.getElementById('light');

    setupInput();
    window.addEventListener('resize', resize);
    resize();

    lastCycle = cycleTime = 0;
    requestAnimationFrame(loop);
  }

  function resize() {
    E.resizeCanvas();
  }

  function buildClouds() {
    var rng = W.mulberry32(99);
    var cols = ['#eef2f7', '#e8ecf2', '#f3f6fa'];
    for (var i = 0; i < 9; i++) {
      var b = E.Builder();
      var col = hexRGB(cols[i % 3]);
      b.sphere(0, 0, 0, 3.6, 9, col, 0.55);
      b.sphere(2.8, 0.35, 0.5, 2.7, 8, col, 0.5);
      b.sphere(-2.6, 0.15, -0.4, 2.9, 8, col, 0.5);
      b.sphere(0.6, 1.55, 0.2, 2.3, 8, col, 0.5);
      var mesh = E.makeMesh(b.build());
      cloudMeshes.push({
        mesh: mesh,
        x: (rng() * 2 - 1) * 140,
        y: 33 + rng() * 20,
        z: -95 + rng() * 130,
        speed: 0.55 + rng() * 0.75
      });
    }
  }

  function buildCars() {
    var palette = ['#b0433a', '#3f6b8a', '#8a7f4c', '#3d7a6a', '#71707a'];
    for (var i = 0; i < 5; i++) {
      cars.push({
        x: (i / 5) * 220 - 110 + (i % 2) * 18,
        lane: (i % 2 === 0) ? 19.9 : 24.1,
        dir: (i % 2 === 0) ? 1 : -1,
        speed: 9.5 + (i % 3) * 1.8,
        color: palette[i % palette.length]
      });
    }
  }

  function buildBirds() {
    for (var i = 0; i < 3; i++) {
      birds.push({ x: -60 + i * 45, y: 30 + i * 7, z: -30 + i * 25, dir: i % 2 === 0 ? 1 : -1, speed: 6.5 + i * 1.3, phase: i * 2.1, flap: 7 + i * 0.9 });
    }
  }

  /* ---------- input ---------- */
  function setupInput() {
    canvas.addEventListener('mousedown', function (e) { dragging = true; dragDX = e.clientX; dragDY = e.clientY; });
    window.addEventListener('mousemove', function (e) {
      if (!dragging) return;
      var dx = e.clientX - dragDX, dy = e.clientY - dragDY;
      dragDX = e.clientX; dragDY = e.clientY;
      camera.yaw -= dx * 0.005;
      camera.pitch = clamp(camera.pitch + dy * 0.004, 0.12, 1.25);
      camera.idle = 0;
    });
    window.addEventListener('mouseup', function () { dragging = false; });
    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      camera.dist = clamp(camera.dist * (1 + e.deltaY * 0.0011), 24, 110);
      camera.idle = 0;
    }, { passive: false });
    canvas.addEventListener('dblclick', function () {
      camera.yaw = 0.62; camera.pitch = 0.47; camera.dist = 52;
    });
    // touch
    var tX = 0, tY = 0;
    canvas.addEventListener('touchstart', function (e) { tX = e.touches[0].clientX; tY = e.touches[0].clientY; }, { passive: true });
    canvas.addEventListener('touchmove', function (e) {
      e.preventDefault();
      var x = e.touches[0].clientX, y = e.touches[0].clientY;
      camera.yaw -= (x - tX) * 0.006;
      camera.pitch = clamp(camera.pitch + (y - tY) * 0.005, 0.12, 1.25);
      tX = x; tY = y; camera.idle = 0;
    }, { passive: false });
  }

  /* ---------- elevator ---------- */
  function updateElevator(dt, simClock) {
    var el = elevator;
    var workers = chars.characters();
    var i, w;
    var riding = [], waiting = [];
    for (i = 0; i < workers.length; i++) {
      w = workers[i];
      if (w.hidden) continue;
      if (w.state === 'riding') riding.push(w);
      else if (w.state === 'wait_elev') waiting.push(w);
    }

    var target = null;
    if (riding.length) {
      var best = riding[0], bestD = Infinity;
      for (i = 0; i < riding.length; i++) {
        var d = Math.abs(riding[i].targetFloor - el.floor);
        if (d < bestD) { bestD = d; best = riding[i]; }
      }
      target = best.targetFloor;
    } else if (waiting.length) {
      var bestW = waiting[0], bestWD = Infinity;
      for (i = 0; i < waiting.length; i++) {
        var dw = Math.abs((waiting[i].waitFloor || 0) - el.floor);
        if (dw < bestWD) { bestWD = dw; bestW = waiting[i]; }
      }
      target = bestW.waitFloor !== undefined ? bestW.waitFloor : 0;
    }

    if (el.state === 'idle') {
      if (target !== null && target !== el.floor) { el.target = target; el.state = 'moving'; }
      else if (target !== null && target === el.floor) { el.state = 'open'; el.openTimer = 0; }
    } else if (el.state === 'moving') {
      var targetY = W.surface(el.target);
      var dist = targetY - el.y;
      if (Math.abs(dist) < 0.03) {
        el.floor = el.target; el.y = targetY; el.state = 'open'; el.openTimer = 0;
      } else {
        var mag = Math.abs(dist);
        var speed = Math.max(0.75, Math.min(4.4, mag * 1.05));
        el.y += Math.sign(dist) * Math.min(mag, speed * dt);
        el.floor = clamp(Math.round((el.y - 0.55) / W.FH), 0, 4);
      }
    } else if (el.state === 'open') {
      el.doors = Math.min(1, el.doors + dt * 2.1);
      if (el.doors > 0.72) {
        for (i = 0; i < waiting.length; i++) {
          w = waiting[i];
          if ((w.waitFloor || 0) === el.floor && w.state === 'wait_elev') {
            w.state = 'boarding';
            w.path = [{ x: 0, z: -4.55 }]; w.pathI = 0;
          }
        }
        for (i = 0; i < riding.length; i++) {
          w = riding[i];
          if (w.targetFloor === el.floor) {
            w.state = 'exit_car';
            w.path = [{ x: 0, z: -1.6 }]; w.pathI = 0;
          }
        }
      }
      var activity = false;
      for (i = 0; i < workers.length; i++) {
        w = workers[i];
        if (w.hidden) continue;
        if ((w.state === 'wait_elev' || w.state === 'boarding') && (w.waitFloor || 0) === el.floor) activity = true;
        if (w.state === 'exit_car' && w.targetFloor === el.floor) activity = true;
      }
      if (!activity) {
        el.openTimer += dt;
        if (el.openTimer > 1.15) { el.state = 'closing'; }
      } else { el.openTimer = 0; }
    } else if (el.state === 'closing') {
      el.doors = Math.max(0, el.doors - dt * 2.4);
      if (el.doors <= 0) { el.doors = 0; el.state = 'idle'; el.openTimer = 0; }
    }
  }

  /* ---------- update ---------- */
  function update(dt) {
    simTime += dt;
    var newCycle = Math.floor(simTime / 160);
    if (newCycle !== lastCycle) {
      lastCycle = newCycle;
      chars.recycleForCycle();
    }
    cycleTime = simTime % 160;

    // sun + palette
    var day = daylight(cycleTime);
    var pal = palette(cycleTime);
    zenith = pal.zen; horizon = pal.hor;
    nightFactor = clamp(1 - (day.elev + 0.12) / 0.42, 0, 1);
    lightsOn = nightFactor;
    ambientLight = 0.32 + 0.68 * (1 - nightFactor);
    groundColor = lerp3([0.055, 0.065, 0.085], [0.46, 0.44, 0.40], 1 - nightFactor);

    // sun direction
    var sunAngle = (cycleTime / 160) * Math.PI * 2 - 0.35 * Math.PI;
    var sx = Math.cos(sunAngle), sy = Math.sin(sunAngle), sz = 0.42;
    var sl = Math.sqrt(sx * sx + sy * sy + sz * sz);
    sunDir = [sx / sl, sy / sl, sz / sl];
    var dayC = [1.12, 1.0, 0.9], duskC = [1.0, 0.58, 0.36];
    var sunC = lerp3(duskC, dayC, clamp(day.elev / 0.6, 0, 1));
    sunColor = [sunC[0] * (1 - nightFactor), sunC[1] * (1 - nightFactor), sunC[2] * (1 - nightFactor)];
    skyColor = lerp3([0.055, 0.065, 0.10], zenith, clamp(day.light + 0.15, 0, 1));
    fogColor = horizon.slice();

    // clouds drift
    for (var i = 0; i < cloudMeshes.length; i++) {
      var c = cloudMeshes[i];
      c.x += c.speed * dt;
      if (c.x > 150) c.x = -150;
    }
    // cars
    for (i = 0; i < cars.length; i++) {
      var car = cars[i];
      car.x += car.dir * car.speed * dt;
      if (car.dir > 0 && car.x > 115) car.x = -115;
      if (car.dir < 0 && car.x < -115) car.x = 115;
    }
    // birds
    for (i = 0; i < birds.length; i++) {
      var b = birds[i];
      b.x += b.dir * b.speed * dt;
      b.phase += dt * b.flap;
      if (b.x > 110) { b.x = -110; } else if (b.x < -110) { b.x = 110; }
    }

    // set riding workers' car coords BEFORE characters update
    var workers = chars.characters();
    for (i = 0; i < workers.length; i++) {
      var w = workers[i];
      if (w.hidden) continue;
      if (w.state === 'boarding' || w.state === 'riding' || w.state === 'exit_car') {
        w.carZ = -4.78;
        w.carY = elevator.y;
        if (w.state !== 'exit_car') w.carX = ((w.id % 6) - 2.5) * 0.8;
        else w.carX = 0;
      }
    }

    // elevator logic
    updateElevator(dt, simTime);

    // characters
    chars.update(dt, cycleTime);
  }

  /* ---------- render pieces ---------- */
  function drawSky() {
    var day = daylight(cycleTime);
    var moonAngle = ((cycleTime / 160) * Math.PI * 2 - 0.35 * Math.PI) + Math.PI;
    var moonDir = [Math.cos(moonAngle) * 0.8, Math.abs(Math.sin(moonAngle)) * 0.85 + 0.12, 0.42];
    var ml = Math.sqrt(moonDir[0]*moonDir[0] + moonDir[1]*moonDir[1] + moonDir[2]*moonDir[2]);
    moonDir = [moonDir[0]/ml, moonDir[1]/ml, moonDir[2]/ml];
    var uniforms = {
      uViewProj: viewProj,
      uModel: mkModel(camPos[0], camPos[1], camPos[2]),
      uSunDir: sunDir,
      uMoonDir: moonDir,
      uZenith: zenith,
      uHorizon: horizon,
      uSunColor: sunColor.map(function (v) { return v * 1.6; }),
      uNightFactor: nightFactor,
      uTime: simTime
    };
    E.drawSky(skyMesh, uniforms);
  }

  function drawMain(mesh, boost) {
    E.drawMain(mesh, {
      uViewProj: viewProj,
      uModel: IDENTITY,
      uNormal: IDENTITY3,
      uSunDir: sunDir,
      uSunColor: sunColor,
      uSkyColor: skyColor,
      uGroundColor: groundColor,
      uAmbient: ambientLight,
      uInteriorBoost: boost,
      uFogNear: fogNear,
      uFogFar: fogFar,
      uFogColor: fogColor,
      uCamPos: camPos
    });
  }

  function drawShadowBox(m, cx, cy, cz, w, d) {
    // flat quad at floor level — cheap shadow blob
    E.dynQuad(m, [cx - w/2, cy, cz - d/2], [cx + w/2, cy, cz - d/2], [cx + w/2, cy, cz + d/2], [cx - w/2, cy, cz + d/2], [0,1,0], [0.02, 0.02, 0.03]);
  }

  function render() {
    var aspect = window.innerWidth / window.innerHeight;
    var fovY = 0.9, near = 0.5, far = 900;

    // camera
    var center = [0, 2.6, 2.2];
    var cy = Math.cos(camera.pitch), sy = Math.sin(camera.pitch);
    var eye = [
      center[0] + Math.sin(camera.yaw) * cy * camera.dist,
      center[1] + sy * camera.dist,
      center[2] + Math.cos(camera.yaw) * cy * camera.dist
    ];
    camPos = eye;
    var matrices = E.cameraToMatrices(eye, center, fovY, aspect, near, far);
    viewProj = matrices.viewProj;
    viewMat = matrices.view;

    // clear
    gl.clearColor(zenith[0], zenith[1], zenith[2], 1);
    gl.clearDepth(1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // sky
    drawSky();

    // towers
    var brightness = 0.72 + 0.3 * (1 - nightFactor);
    for (var i = 0; i < world.towerMeshes.length; i++) {
      var t = world.towerMeshes[i];
      E.drawTexture(t.mesh, {
        uViewProj: viewProj,
        uModel: IDENTITY,
        uTex: t.tex,
        uBrightness: brightness,
        uFogNear: fogNear, uFogFar: fogFar,
        uFogColor: fogColor, uCamPos: camPos
      }, t.tex, IDENTITY);
    }

    // static buildings
    drawMain(world.exteriorMesh, 0.0);
    drawMain(world.interiorMesh, 0.05 + nightFactor * 0.30);

    // screen / textured surfaces
    for (i = 0; i < world.monitorMeshes.length; i++) {
      var mon = world.monitorMeshes[i];
      E.drawTexture(mon.mesh, {
        uViewProj: viewProj, uModel: IDENTITY,
        uBrightness: 0.55 + 0.55 * (0.4 + 0.6 * nightFactor),
        uFogNear: fogNear, uFogFar: fogFar,
        uFogColor: fogColor, uCamPos: camPos
      }, mon.tex, IDENTITY);
    }
    E.drawTexture(world.confMesh, {
      uViewProj: viewProj, uModel: IDENTITY, uBrightness: 0.65 + 0.45 * nightFactor,
      uFogNear: fogNear, uFogFar: fogFar, uFogColor: fogColor, uCamPos: camPos
    }, world.confTex, IDENTITY);
    E.drawTexture(world.logoMesh, {
      uViewProj: viewProj, uModel: IDENTITY, uBrightness: 0.75 + 0.35 * nightFactor,
      uFogNear: fogNear, uFogFar: fogFar, uFogColor: fogColor, uCamPos: camPos
    }, world.logoTex, IDENTITY);
    E.drawTexture(world.signMesh, {
      uViewProj: viewProj, uModel: IDENTITY, uBrightness: 0.75 + 0.4 * nightFactor,
      uFogNear: fogNear, uFogFar: fogFar, uFogColor: fogColor, uCamPos: camPos
    }, world.signTex, IDENTITY);

    // glass facade
    E.drawGlass(world.glassMesh, {
      uViewProj: viewProj,
      uModel: IDENTITY,
      uNormal: IDENTITY3,
      uCamPos: camPos,
      uGlassTint: [0.62, 0.78, 0.88],
      uGlassAlpha: 0.22,
      uGlassFresnel: 0.38
    });

    // glow meshes
    buildGlow();

    // clouds
    for (i = 0; i < cloudMeshes.length; i++) {
      var cl = cloudMeshes[i];
      var m = mkModel(cl.x, cl.y, cl.z);
      E.drawMain(cl.mesh, {
        uViewProj: viewProj, uModel: m, uNormal: IDENTITY3,
        uSunDir: sunDir, uSunColor: sunColor,
        uSkyColor: skyColor, uGroundColor: groundColor,
        uAmbient: ambientLight, uInteriorBoost: 0.02 + nightFactor * 0.10,
        uFogNear: fogNear, uFogFar: fogFar,
        uFogColor: fogColor, uCamPos: camPos
      });
    }

    // cars + birds (dynamic)
    drawCarsAndBirds();

    // elevator car
    var eModel = mkModel(0, elevator.y, -4.78);
    E.drawMain(elevatorCarMesh, {
      uViewProj: viewProj, uModel: eModel, uNormal: IDENTITY3,
      uSunDir: sunDir, uSunColor: sunColor,
      uSkyColor: skyColor, uGroundColor: groundColor,
      uAmbient: ambientLight, uInteriorBoost: 0.05 + nightFactor * 0.3,
      uFogNear: fogNear, uFogFar: fogFar,
      uFogColor: fogColor, uCamPos: camPos
    });

    // characters
    chars.draw({
      viewProj: viewProj,
      sunDir: sunDir, sunColor: sunColor,
      skyColor: skyColor, groundColor: groundColor,
      ambient: ambientLight,
      interiorBoost: 0.05 + nightFactor * 0.26,
      fogNear: fogNear, fogFar: fogFar,
      fogColor: fogColor, camPos: camPos
    });

    // shadows (drawn after characters? better before — but keep after, alpha low)
    drawShadows();

    // HUD
    updateHUD();
  }

  /* ---------- dynamic glow ---------- */
  function buildGlow() {
    // ceiling panels (20)
    E.dynReset(ceilingGlow);
    for (var i = 0; i < world.ceilingPanels.length; i++) {
      var p = world.ceilingPanels[i];
      E.dynGlowBox(ceilingGlow, p.x, p.y, p.z, 1.9, 0.09, 1.15, [1.0, 0.86, 0.58]);
    }
    E.dynGlowFlush(ceilingGlow, true);
    var ceilAlpha = 0.06 + 0.55 * lightsOn;
    E.drawGlow(ceilingGlow, { uViewProj: viewProj, uAlpha: ceilAlpha });

    // lamp heads (billboard quads)
    E.dynReset(lampGlow);
    var eye = camPos;
    var dir = [0, 0, 1];
    var right = [1, 0, 0], up = [0, 1, 0];
    // compute camera basis from view matrix
    var v = viewMat;
    right = [v[0], v[4], v[8]];
    up = [v[1], v[5], v[9]];
    for (i = 0; i < world.lampHeads.length; i++) {
      var l = world.lampHeads[i];
      var s = 0.62;
      var a = [l.x - right[0] * s / 2 - up[0] * s / 2, l.y - up[1] * s / 2, l.z - right[2] * s / 2 - up[2] * s / 2];
      var b = [l.x + right[0] * s / 2 - up[0] * s / 2, l.y - up[1] * s / 2, l.z + right[2] * s / 2 - up[2] * s / 2];
      var c2 = [l.x + right[0] * s / 2 + up[0] * s / 2, l.y + up[1] * s / 2, l.z + right[2] * s / 2 + up[2] * s / 2];
      var d = [l.x - right[0] * s / 2 + up[0] * s / 2, l.y + up[1] * s / 2, l.z - right[2] * s / 2 + up[2] * s / 2];
      E.dynGlowQuad(lampGlow, a, b, c2, d, [1.0, 0.82, 0.5]);
    }
    E.dynGlowFlush(lampGlow, true);
    E.drawGlow(lampGlow, { uViewProj: viewProj, uAlpha: 0.15 + 0.8 * lightsOn });

    // canopy
    E.dynReset(canopyGlow);
    E.dynGlowQuad(canopyGlow, [-2.35, 2.74, 6.95], [2.35, 2.74, 6.95], [2.35, 2.74, 9.9], [-2.35, 2.74, 9.9], [1.0, 0.84, 0.55]);
    E.dynGlowFlush(canopyGlow, true);
    E.drawGlow(canopyGlow, { uViewProj: viewProj, uAlpha: 0.08 + 0.42 * lightsOn });

    // beacon
    E.dynReset(beaconGlow);
    var bpos = world.beacon;
    E.dynGlowBox(beaconGlow, bpos.x, bpos.y, bpos.z, 0.42, 0.42, 0.42, [1.0, 0.34, 0.24]);
    E.dynGlowFlush(beaconGlow, true);
    var blink = 0.45 + 0.55 * Math.sin(simTime * 2.4);
    E.drawGlow(beaconGlow, { uViewProj: viewProj, uAlpha: Math.max(0, blink) * (0.25 + 0.75 * nightFactor) * 0.95 });

    // floor spill (warm, at each floor)
    E.dynReset(spillGlow);
    for (i = 1; i <= 4; i++) {
      var fsurf = world.floorSurface(i) + 0.10;
      E.dynGlowQuad(spillGlow,
        [-9.5, fsurf, -6.0], [9.5, fsurf, -6.0], [9.5, fsurf, 6.5], [-9.5, fsurf, 6.5],
        [1.0, 0.78, 0.48]);
    }
    E.dynGlowFlush(spillGlow, true);
    E.drawGlow(spillGlow, { uViewProj: viewProj, uAlpha: 0.05 + 0.16 * lightsOn });
  }

  function drawCarsAndBirds() {
    E.dynReset(carsMesh);
    E.dynReset(headlampGlow);
    var i, car, col;
    for (i = 0; i < cars.length; i++) {
      car = cars[i];
      col = hexRGB(car.color);
      var lane = car.lane, dir = car.dir;
      // body
      E.dynBox(carsMesh, car.x, 0.62, lane, 2.9, 0.55, 1.45, col);
      // cabin
      E.dynBox(carsMesh, car.x - dir * 0.18, 1.12, lane, 1.5, 0.42, 1.28, [0.20, 0.24, 0.30]);
      // wheels
      E.dynBox(carsMesh, car.x - 0.95, 0.20, lane - 0.66, 0.55, 0.38, 0.22, [0.10, 0.10, 0.11]);
      E.dynBox(carsMesh, car.x + 0.95, 0.20, lane - 0.66, 0.55, 0.38, 0.22, [0.10, 0.10, 0.11]);
      E.dynBox(carsMesh, car.x - 0.95, 0.20, lane + 0.66, 0.55, 0.38, 0.22, [0.10, 0.10, 0.11]);
      E.dynBox(carsMesh, car.x + 0.95, 0.20, lane + 0.66, 0.55, 0.38, 0.22, [0.10, 0.10, 0.11]);
      // headlight glow quads
      var front = car.x + dir * 1.5;
      E.dynGlowQuad(headlampGlow, [front, 0.42, lane - 0.52], [front, 0.42, lane + 0.52], [front, 0.78, lane + 0.52], [front, 0.78, lane - 0.52], [1.0, 0.92, 0.68]);
      var rear = car.x - dir * 1.5;
      E.dynGlowQuad(headlampGlow, [rear, 0.45, lane - 0.52], [rear, 0.45, lane + 0.52], [rear, 0.72, lane + 0.52], [rear, 0.72, lane - 0.52], [1.0, 0.30, 0.22]);
    }
    // birds
    for (i = 0; i < birds.length; i++) {
      var b = birds[i];
      var by = b.y + Math.sin(b.phase * 0.7) * 0.9;
      var flap = Math.sin(b.phase) * 0.65;
      var col2 = [0.16, 0.17, 0.20];
      E.dynBox(carsMesh, b.x, by, b.z, 0.36, 0.11, 0.20, col2);
      E.dynBox(carsMesh, b.x, by + 0.02, b.z + 0.58, 0.30, 0.045, 1.05, col2, flap, by, b.z);
      E.dynBox(carsMesh, b.x, by + 0.02, b.z - 0.58, 0.30, 0.045, 1.05, col2, -flap, by, b.z);
      E.dynBox(carsMesh, b.x - 0.24 * b.dir, by + 0.06, b.z, 0.14, 0.10, 0.16, col2);
    }
    E.dynFlush(carsMesh, true);
    E.drawMain(carsMesh, {
      uViewProj: viewProj, uModel: IDENTITY, uNormal: IDENTITY3,
      uSunDir: sunDir, uSunColor: sunColor,
      uSkyColor: skyColor, uGroundColor: groundColor,
      uAmbient: ambientLight, uInteriorBoost: 0.0,
      uFogNear: fogNear, uFogFar: fogFar, uFogColor: fogColor, uCamPos: camPos
    });

    E.dynGlowFlush(headlampGlow, true);
    E.drawGlow(headlampGlow, { uViewProj: viewProj, uAlpha: 0.10 + 0.72 * nightFactor });
  }

  function drawShadows() {
    E.dynReset(shadowMesh);
    var workers = chars.characters();
    var i, w;
    for (i = 0; i < workers.length; i++) {
      w = workers[i];
      if (w.hidden) continue;
      var gy = (w.y || 0) + 0.03;
      if (w.state === 'riding' || w.state === 'boarding' || w.state === 'exit_car') continue; // skip in-car (car floor)
      drawShadowBox(shadowMesh, w.x, gy, w.z, 0.72, 0.62);
    }
    var peds = chars.pedestrians();
    for (i = 0; i < peds.length; i++) {
      var p = peds[i];
      drawShadowBox(shadowMesh, p.x, 0.05, p.z, 0.62, 0.56);
    }
    // cars shadow
    for (i = 0; i < cars.length; i++) {
      var car = cars[i];
      drawShadowBox(shadowMesh, car.x, 0.04, car.lane, 3.3, 1.85);
    }
    E.dynFlush(shadowMesh, true);
    E.drawShadow(shadowMesh, { uViewProj: viewProj, uAlpha: 0.20 });
  }

  function updateHUD() {
    var hour = 6 + (cycleTime / 160) * 14;
    var h = Math.floor(hour);
    var m = Math.floor((hour - h) * 60);
    hudClock.textContent = (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;

    var phase;
    if (cycleTime < 18) phase = 'MORNING CHECK-IN';
    else if (cycleTime < 48) phase = 'FOCUS WORK';
    else if (cycleTime < 72) phase = 'LUNCH BREAK';
    else if (cycleTime < 95) phase = 'MEETINGS';
    else if (cycleTime < 118) phase = 'COFFEE BREAK';
    else if (cycleTime < 145) phase = 'DEPARTURES';
    else phase = 'GOING HOME';
    hudPhase.textContent = phase;
    hudEl.textContent = elevator.floor;
    var lightLabel = nightFactor > 0.5 ? 'HIGH' : (nightFactor > 0.2 ? 'LOW' : 'DAY');
    hudLight.innerHTML = 'lights <b>' + lightLabel + '</b>';
  }

  /* ---------- loop ---------- */
  var lastTs = 0;
  function loop(ts) {
    requestAnimationFrame(loop);
    if (!lastTs) lastTs = ts;
    var dt = (ts - lastTs) / 1000;
    lastTs = ts;
    dt = clamp(dt, 0.001, 0.05);

    camera.idle += dt;
    if (camera.idle > 9 && !dragging) camera.yaw += 0.045 * dt;

    update(dt);
    render();
  }

  window.addEventListener('load', init);

  return { init: init };
})();
