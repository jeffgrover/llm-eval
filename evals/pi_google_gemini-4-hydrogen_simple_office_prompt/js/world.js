(function (global) {
  'use strict';

  var OfficeSim = global.OfficeSim = global.OfficeSim || {};
  var M = OfficeSim.Math;

  var FLOOR_H = 3.6;
  var NUM_FLOORS = 6;
  var BLDG_W = 24;
  var BLDG_D = 14;

  // Color palette
  var COL = {
    concrete: [0.76, 0.78, 0.81],
    darkSteel: [0.18, 0.22, 0.27],
    steel: [0.38, 0.43, 0.49],
    wall: [0.91, 0.92, 0.94],
    wallAccent: [0.24, 0.36, 0.48],
    woodDark: [0.42, 0.26, 0.16],
    woodLight: [0.74, 0.56, 0.38],
    deskTop: [0.88, 0.85, 0.80],
    chair: [0.16, 0.19, 0.24],
    sofa: [0.23, 0.42, 0.56],
    sofaWarm: [0.72, 0.38, 0.26],
    plant: [0.22, 0.54, 0.26],
    pot: [0.65, 0.42, 0.30],
    glass: [0.58, 0.82, 0.96],
    carpetBlue: [0.35, 0.42, 0.52],
    carpetWarm: [0.48, 0.44, 0.40],
    carpetSage: [0.38, 0.47, 0.43],
    marble: [0.88, 0.89, 0.91]
  };

  function getEnvironment(hour) {
    // Normalize hour 0..24
    var h = ((hour % 24) + 24) % 24;
    // Keyframes: [hour, sky, sunColor, ambientSky, ambientGround, sunElev, sunAzim, indoorGlow]
    var keys = [
      { h: 0,  sky: [0.04, 0.06, 0.12], sun: [0.12, 0.15, 0.28], ambS: [0.10, 0.13, 0.22], ambG: [0.05, 0.06, 0.10], elev: 0.35, az: -1.0, glow: 0.92 },
      { h: 5.5,sky: [0.14, 0.16, 0.28], sun: [0.35, 0.25, 0.35], ambS: [0.18, 0.20, 0.32], ambG: [0.08, 0.08, 0.12], elev: 0.08, az: 1.4,  glow: 0.78 },
      { h: 7.0,sky: [0.72, 0.58, 0.56], sun: [1.05, 0.68, 0.42], ambS: [0.46, 0.42, 0.48], ambG: [0.22, 0.18, 0.16], elev: 0.25, az: 1.2,  glow: 0.38 },
      { h: 9.5,sky: [0.48, 0.72, 0.94], sun: [1.05, 0.98, 0.88], ambS: [0.52, 0.62, 0.76], ambG: [0.24, 0.25, 0.24], elev: 0.65, az: 0.8,  glow: 0.15 },
      { h: 13.0,sky:[0.44, 0.70, 0.95], sun: [1.10, 1.05, 0.96], ambS: [0.56, 0.66, 0.80], ambG: [0.28, 0.28, 0.26], elev: 1.05, az: 0.1,  glow: 0.12 },
      { h: 17.0,sky:[0.58, 0.68, 0.86], sun: [1.02, 0.82, 0.62], ambS: [0.48, 0.50, 0.62], ambG: [0.22, 0.20, 0.18], elev: 0.45, az: -0.9, glow: 0.28 },
      { h: 18.8,sky:[0.62, 0.42, 0.46], sun: [0.98, 0.48, 0.28], ambS: [0.36, 0.28, 0.38], ambG: [0.16, 0.12, 0.14], elev: 0.12, az: -1.3, glow: 0.72 },
      { h: 20.5,sky:[0.06, 0.09, 0.18], sun: [0.14, 0.18, 0.32], ambS: [0.12, 0.15, 0.25], ambG: [0.06, 0.07, 0.11], elev: 0.40, az: -1.1, glow: 0.92 },
      { h: 24.0,sky:[0.04, 0.06, 0.12], sun: [0.12, 0.15, 0.28], ambS: [0.10, 0.13, 0.22], ambG: [0.05, 0.06, 0.10], elev: 0.35, az: -1.0, glow: 0.92 }
    ];

    var k0 = keys[0], k1 = keys[keys.length - 1];
    for (var i = 0; i < keys.length - 1; i++) {
      if (h >= keys[i].h && h <= keys[i + 1].h) {
        k0 = keys[i]; k1 = keys[i + 1]; break;
      }
    }
    var t = (k1.h === k0.h) ? 0 : M.smoothstep(k0.h, k1.h, h);
    var elev = M.lerp(k0.elev, k1.elev, t);
    var az = M.lerp(k0.az, k1.az, t);
    var sunDir = M.Vec3.norm([
      Math.cos(elev) * Math.sin(az),
      Math.sin(elev),
      Math.cos(elev) * Math.cos(az)
    ]);

    var sky = M.lerpColor(k0.sky, k1.sky, t);
    return {
      sky: sky,
      fogColor: sky,
      fogDensity: 0.0042,
      sunDir: sunDir,
      sunColor: M.lerpColor(k0.sun, k1.sun, t),
      ambientSky: M.lerpColor(k0.ambS, k1.ambS, t),
      ambientGround: M.lerpColor(k0.ambG, k1.ambG, t),
      indoorGlow: M.lerp(k0.glow, k1.glow, t),
      isNight: h < 6.3 || h > 18.6
    };
  }

  function World() {
    this.viewMode = 'glass'; // 'glass' | 'cutaway' | 'xray'
    this.focusFloor = 0;     // 0 = all, 1..6 = specific floor
    this.cars = [
      { x: -32, z: 17.5, dir: 1, speed: 9.5, color: [0.78, 0.22, 0.20], len: 4.0 },
      { x: 18,  z: 17.5, dir: 1, speed: 8.2, color: [0.22, 0.38, 0.62], len: 4.2 },
      { x: 26,  z: 20.8, dir: -1, speed: 10.2, color: [0.88, 0.88, 0.90], len: 4.6 },
      { x: -12, z: 20.8, dir: -1, speed: 7.8, color: [0.24, 0.28, 0.34], len: 3.8 }
    ];

    // Pre-generate background city buildings
    var rng = M.createRNG(42);
    this.cityBlocks = [];
    var spots = [
      [-34, -22], [-20, -26], [-4, -28], [14, -26], [30, -24],
      [-32, -4],  [-30, 8],   [30, -6],  [32, 8],
      [-36, 34],  [-16, 36],  [6, 35],   [26, 34]
    ];
    for (var i = 0; i < spots.length; i++) {
      this.cityBlocks.push({
        x: spots[i][0] + (rng() - 0.5) * 3,
        z: spots[i][1] + (rng() - 0.5) * 3,
        w: 8 + rng() * 6,
        d: 8 + rng() * 6,
        h: 10 + rng() * 24,
        shade: 0.35 + rng() * 0.25
      });
    }
  }

  World.prototype.update = function (dt) {
    for (var i = 0; i < this.cars.length; i++) {
      var c = this.cars[i];
      c.x += c.dir * c.speed * dt;
      if (c.dir > 0 && c.x > 46) c.x = -46;
      if (c.dir < 0 && c.x < -46) c.x = 46;
    }
  };

  // Furniture Helpers
  function drawDesk(r, x, y, z, rotY, hasDualMonitor, glow, screenActive) {
    // Desk top
    r.drawBox(x, y + 0.74, z, 1.5, 0.06, 0.75, { color: COL.deskTop, tex: 'wood', ry: rotY, indoorGlow: glow });
    // Legs
    var cos = Math.cos(rotY), sin = Math.sin(rotY);
    var lx = 0.68, lz = 0.30;
    var offs = [[-lx, -lz], [lx, -lz], [-lx, lz], [lx, lz]];
    for (var i = 0; i < 4; i++) {
      var px = x + offs[i][0] * cos + offs[i][1] * sin;
      var pz = z - offs[i][0] * sin + offs[i][1] * cos;
      r.drawBox(px, y + 0.37, pz, 0.05, 0.74, 0.05, { color: COL.darkSteel, indoorGlow: glow });
    }
    // Monitors
    var monOffsets = hasDualMonitor ? [-0.28, 0.28] : [0];
    for (var m = 0; m < monOffsets.length; m++) {
      var mx = x + monOffsets[m] * cos - 0.18 * sin;
      var mz = z - monOffsets[m] * sin - 0.18 * cos;
      r.drawBox(mx, y + 0.86, mz, 0.06, 0.18, 0.06, { color: COL.darkSteel, ry: rotY, indoorGlow: glow });
      var scrEmissive = screenActive ? [0.15, 0.42, 0.68] : [0.02, 0.04, 0.06];
      r.drawBox(mx, y + 1.02, mz, 0.48, 0.28, 0.04, {
        color: screenActive ? [0.55, 0.82, 1.0] : [0.12, 0.14, 0.18],
        emissive: scrEmissive,
        ry: rotY,
        shininess: 40
      });
    }
    // Office Chair
    var cx = x + 0.52 * sin;
    var cz = z + 0.52 * cos;
    r.drawCyl(cx, y + 0.24, cz, 0, 0, 0.08, 0.42, 0.08, { color: COL.darkSteel, indoorGlow: glow });
    r.drawBox(cx, y + 0.46, cz, 0.46, 0.07, 0.46, { color: COL.chair, ry: rotY, indoorGlow: glow });
    var bx = cx + 0.21 * sin;
    var bz = cz + 0.21 * cos;
    r.drawBox(bx, y + 0.76, bz, 0.42, 0.52, 0.07, { color: COL.chair, ry: rotY, indoorGlow: glow });
  }

  function drawPlant(r, x, y, z, scale, glow) {
    var s = scale || 1;
    r.drawCyl(x, y + 0.22 * s, z, 0, 0, 0.36 * s, 0.44 * s, 0.36 * s, { color: COL.pot, indoorGlow: glow });
    r.drawSphere(x, y + 0.62 * s, z, 0.58 * s, 0.58 * s, 0.58 * s, { color: COL.plant, indoorGlow: glow });
    r.drawSphere(x + 0.14 * s, y + 0.82 * s, z - 0.1 * s, 0.38 * s, 0.38 * s, 0.38 * s, { color: [0.26, 0.60, 0.30], indoorGlow: glow });
  }

  function drawSofa(r, x, y, z, ry, col, glow) {
    var c = col || COL.sofa;
    r.drawBox(x, y + 0.22, z, 1.8, 0.34, 0.8, { color: c, ry: ry, indoorGlow: glow });
    var cos = Math.cos(ry), sin = Math.sin(ry);
    r.drawBox(x - 0.32 * sin, y + 0.55, z - 0.32 * cos, 1.8, 0.42, 0.18, { color: c, ry: ry, indoorGlow: glow });
    r.drawBox(x - 0.82 * cos, y + 0.38, z + 0.82 * sin, 0.16, 0.32, 0.8, { color: c, ry: ry, indoorGlow: glow });
    r.drawBox(x + 0.82 * cos, y + 0.38, z - 0.82 * sin, 0.16, 0.32, 0.8, { color: c, ry: ry, indoorGlow: glow });
  }

  function drawTree(r, x, z, scale) {
    var s = scale || 1;
    r.drawCyl(x, 1.2 * s, z, 0, 0, 0.45 * s, 2.4 * s, 0.45 * s, { color: [0.40, 0.27, 0.17] });
    r.drawSphere(x, 3.0 * s, z, 2.4 * s, 2.1 * s, 2.4 * s, { color: [0.22, 0.50, 0.23] });
    r.drawSphere(x + 0.6 * s, 2.7 * s, z + 0.4 * s, 1.6 * s, 1.5 * s, 1.6 * s, { color: [0.26, 0.56, 0.26] });
    r.drawSphere(x - 0.5 * s, 3.4 * s, z - 0.4 * s, 1.5 * s, 1.4 * s, 1.5 * s, { color: [0.28, 0.58, 0.28] });
    // Shadow
    r.drawCyl(x, 0.03, z, 0, 0, 2.2 * s, 0.02, 2.2 * s, { color: [0.05, 0.08, 0.05], alpha: 0.28 });
  }

  function drawStreetLamp(r, x, z, isNight) {
    r.drawCyl(x, 2.2, z, 0, 0, 0.12, 4.4, 0.12, { color: COL.darkSteel });
    r.drawBox(x, 4.35, z - 0.35, 0.12, 0.10, 0.8, { color: COL.darkSteel });
    r.drawBox(x, 4.25, z - 0.65, 0.28, 0.10, 0.28, {
      color: isNight ? [1.0, 0.92, 0.72] : [0.85, 0.88, 0.92],
      emissive: isNight ? [0.95, 0.80, 0.45] : [0, 0, 0]
    });
  }

  World.prototype.drawOutdoors = function (r, env) {
    // Ground / Lawn
    r.drawBox(0, -0.1, 0, 120, 0.2, 120, { color: [0.55, 0.72, 0.48], tex: 'grass', uvX: 16, uvY: 16 });

    // Concrete Plaza & Sidewalk around building
    r.drawBox(0, 0.02, 2.0, 32, 0.06, 26, { color: [0.78, 0.79, 0.81], tex: 'marble', uvX: 10, uvY: 8 });

    // Asphalt Road (z from 15.2 to 23.0)
    r.drawBox(0, 0.01, 19.1, 110, 0.04, 7.8, { color: [0.85, 0.85, 0.88], tex: 'asphalt', uvX: 20, uvY: 2 });

    // Road Dashed Center Line
    for (var lx = -45; lx <= 45; lx += 4.5) {
      r.drawBox(lx, 0.035, 19.1, 2.2, 0.01, 0.14, { color: [0.95, 0.82, 0.25] });
    }
    // Crosswalk in front of main entrance
    for (var cz = 15.8; cz <= 22.4; cz += 0.9) {
      r.drawBox(0, 0.036, cz, 3.2, 0.01, 0.42, { color: [0.92, 0.93, 0.95] });
    }

    // Plaza Fountain / Feature on left front
    r.drawCyl(-8.5, 0.22, 11.0, 0, 0, 3.2, 0.42, 3.2, { color: COL.concrete });
    r.drawCyl(-8.5, 0.36, 11.0, 0, 0, 2.6, 0.2, 2.6, { color: [0.28, 0.66, 0.88], alpha: 0.78, shininess: 60 });
    r.drawCyl(-8.5, 0.75, 11.0, 0, 0, 0.45, 0.9, 0.45, { color: COL.steel });

    // Plaza Benches
    r.drawBox(7.2, 0.28, 11.2, 1.8, 0.12, 0.55, { color: COL.woodLight, tex: 'wood' });
    r.drawBox(7.2, 0.14, 11.2, 1.5, 0.24, 0.45, { color: COL.darkSteel });
    r.drawBox(10.2, 0.28, 11.2, 1.8, 0.12, 0.55, { color: COL.woodLight, tex: 'wood' });
    r.drawBox(10.2, 0.14, 11.2, 1.5, 0.24, 0.45, { color: COL.darkSteel });

    // Trees
    var treePos = [
      [-15.5, 12.0, 1.1], [-16.5, 3.0, 0.95], [-16.0, -7.0, 1.15],
      [15.5, 12.0, 1.05], [16.5, 1.0, 1.1],   [16.0, -8.5, 0.95],
      [-11.5, 13.8, 0.85], [12.0, 13.8, 0.9]
    ];
    for (var i = 0; i < treePos.length; i++) {
      drawTree(r, treePos[i][0], treePos[i][1], treePos[i][2]);
    }

    // Street Lamps
    for (var sx = -18; sx <= 18; sx += 12) {
      drawStreetLamp(r, sx, 14.5, env.isNight);
    }

    // Passing Cars
    for (var ci = 0; ci < this.cars.length; ci++) {
      var car = this.cars[ci];
      r.drawBox(car.x, 0.45, car.z, car.len, 0.65, 1.8, { color: car.color, shininess: 40 });
      r.drawBox(car.x - car.dir * 0.2, 0.98, car.z, car.len * 0.54, 0.52, 1.55, { color: car.color, shininess: 40 });
      r.drawBox(car.x - car.dir * 0.2, 1.00, car.z, car.len * 0.48, 0.38, 1.58, { color: [0.20, 0.28, 0.36], shininess: 60 });
      // Wheels
      var wx = car.len * 0.32;
      r.drawCyl(car.x - wx, 0.24, car.z + 0.85, Math.PI/2, 0, 0.46, 0.22, 0.46, { color: [0.1, 0.1, 0.12] });
      r.drawCyl(car.x + wx, 0.24, car.z + 0.85, Math.PI/2, 0, 0.46, 0.22, 0.46, { color: [0.1, 0.1, 0.12] });
      r.drawCyl(car.x - wx, 0.24, car.z - 0.85, Math.PI/2, 0, 0.46, 0.22, 0.46, { color: [0.1, 0.1, 0.12] });
      r.drawCyl(car.x + wx, 0.24, car.z - 0.85, Math.PI/2, 0, 0.46, 0.22, 0.46, { color: [0.1, 0.1, 0.12] });
      // Headlights at night
      var hx = car.x + car.dir * (car.len * 0.5 + 0.02);
      r.drawBox(hx, 0.45, car.z - 0.55, 0.06, 0.16, 0.26, {
        color: [1, 0.96, 0.8],
        emissive: env.isNight ? [0.95, 0.9, 0.6] : [0, 0, 0]
      });
      r.drawBox(hx, 0.45, car.z + 0.55, 0.06, 0.16, 0.26, {
        color: [1, 0.96, 0.8],
        emissive: env.isNight ? [0.95, 0.9, 0.6] : [0, 0, 0]
      });
    }

    // Background City Skyline
    for (var bi = 0; bi < this.cityBlocks.length; bi++) {
      var b = this.cityBlocks[bi];
      r.drawBox(b.x, b.h * 0.5, b.z, b.w, b.h, b.d, {
        color: [b.shade, b.shade + 0.03, b.shade + 0.08],
        tex: 'brick',
        uvX: 2,
        uvY: Math.round(b.h / 4),
        emissive: env.isNight ? [0.06, 0.06, 0.08] : [0, 0, 0]
      });
    }
  };

  World.prototype.drawBuilding = function (r, env, sim) {
    var glow = env.indoorGlow;
    var maxFloorToDraw = this.focusFloor > 0 ? this.focusFloor : NUM_FLOORS;
    var isXray = this.viewMode === 'xray';
    var isCutaway = this.viewMode === 'cutaway';

    // Structural Corner & Perimeter Columns
    var colX = [-11.8, -4.0, 4.0, 11.8];
    var colZ = [-6.8, 6.8];
    var totalH = maxFloorToDraw * FLOOR_H;
    for (var xi = 0; xi < colX.length; xi++) {
      for (var zi = 0; zi < colZ.length; zi++) {
        // Hide front columns in cutaway if focusing or cutaway
        if (isCutaway && colZ[zi] > 0 && xi > 0 && xi < 3) continue;
        r.drawBox(colX[xi], totalH * 0.5, colZ[zi], 0.45, totalH, 0.45, {
          color: COL.darkSteel,
          alpha: isXray ? 0.35 : 1.0
        });
      }
    }

    // Draw each floor
    for (var f = 1; f <= maxFloorToDraw; f++) {
      var y = (f - 1) * FLOOR_H;
      var dimOthers = (this.focusFloor > 0 && f !== this.focusFloor);
      var fGlow = dimOthers ? glow * 0.3 : glow;

      // Floor Slab
      var floorTex = f === 1 ? 'marble' : (f === 6 ? 'wood' : 'carpet');
      var floorCol = f === 1 ? COL.marble : (f === 2 ? COL.carpetBlue : (f === 3 ? COL.carpetSage : (f === 4 ? COL.carpetWarm : (f === 5 ? COL.carpetBlue : [0.76, 0.60, 0.44]))));

      if (f === 6) {
        // Left half Executive floor, Right half Rooftop Terrace decking
        r.drawBox(-6.0, y + 0.08, 0, 12.0, 0.16, BLDG_D, { color: floorCol, tex: 'wood', uvX: 6, uvY: 6, indoorGlow: fGlow });
        r.drawBox(6.0, y + 0.08, 0, 12.0, 0.16, BLDG_D, { color: [0.68, 0.52, 0.36], tex: 'wood', uvX: 6, uvY: 6 });
      } else {
        r.drawBox(0, y + 0.08, 0, BLDG_W, 0.16, BLDG_D, { color: floorCol, tex: floorTex, uvX: 10, uvY: 6, indoorGlow: fGlow });
      }

      // Back Core Wall (behind elevators & stairs)
      r.drawBox(0, y + FLOOR_H * 0.5, -6.85, BLDG_W, FLOOR_H, 0.22, { color: COL.wall, indoorGlow: fGlow });

      // Elevator Shafts Back & Side Frames
      r.drawBox(-3.0, y + FLOOR_H * 0.5, -4.8, 0.18, FLOOR_H, 2.2, { color: COL.steel, indoorGlow: fGlow });
      r.drawBox(-0.3, y + FLOOR_H * 0.5, -4.8, 0.22, FLOOR_H, 2.2, { color: COL.steel, indoorGlow: fGlow });
      r.drawBox(2.4,  y + FLOOR_H * 0.5, -4.8, 0.18, FLOOR_H, 2.2, { color: COL.steel, indoorGlow: fGlow });

      // Elevator Hall Call Button Panel + Indicator
      var callUp = sim && sim.hallCalls[f] && sim.hallCalls[f].up;
      var callDn = sim && sim.hallCalls[f] && sim.hallCalls[f].down;
      r.drawBox(-0.3, y + 1.35, -3.65, 0.18, 0.36, 0.06, { color: COL.darkSteel });
      r.drawBox(-0.3, y + 1.43, -3.61, 0.07, 0.07, 0.02, {
        color: callUp ? [0.2, 0.95, 0.45] : [0.3, 0.35, 0.4],
        emissive: callUp ? [0.2, 0.9, 0.4] : [0, 0, 0]
      });
      r.drawBox(-0.3, y + 1.28, -3.61, 0.07, 0.07, 0.02, {
        color: callDn ? [0.98, 0.65, 0.18] : [0.3, 0.35, 0.4],
        emissive: callDn ? [0.9, 0.55, 0.1] : [0, 0, 0]
      });

      // Stairwell (between floors 1..5)
      if (f < 6) {
        for (var s = 0; s < 10; s++) {
          var sy = y + 0.2 + s * (FLOOR_H / 10);
          var sz = -3.4 - s * 0.28;
          r.drawBox(4.8, sy, sz, 1.5, 0.14, 0.30, { color: [0.72, 0.74, 0.78], indoorGlow: fGlow });
        }
      }

      // Floor-specific Interiors
      this.drawFloorInterior(r, f, y, fGlow, env, sim);

      // Exterior Glass Curtain Wall
      if (!isXray) {
        var glassAlpha = isCutaway ? 0.06 : 0.32;
        var glassOpt = {
          color: COL.glass,
          tex: 'glassGrid',
          uvX: 8, uvY: 1,
          alpha: glassAlpha,
          transparent: true,
          shininess: 80
        };
        // Side walls
        if (f < 6) {
          r.drawBox(-11.9, y + FLOOR_H * 0.5, 0, 0.08, FLOOR_H - 0.18, BLDG_D, glassOpt);
          r.drawBox(11.9,  y + FLOOR_H * 0.5, 0, 0.08, FLOOR_H - 0.18, BLDG_D, glassOpt);
        } else {
          // F6: left half enclosed, right half glass railing
          r.drawBox(-11.9, y + FLOOR_H * 0.5, 0, 0.08, FLOOR_H - 0.18, BLDG_D, glassOpt);
          r.drawBox(11.9,  y + 0.55, 0, 0.08, 1.0, BLDG_D, glassOpt);
          r.drawBox(6.0,   y + 0.55, 6.9, 12.0, 1.0, 0.08, glassOpt);
        }
        // Front facade (skip in cutaway mode so interior is crystal clear!)
        if (!isCutaway) {
          if (f === 1) {
            // Leave center entrance doorway open
            r.drawBox(-7.0, y + FLOOR_H * 0.5, 6.92, 10.0, FLOOR_H - 0.18, 0.08, glassOpt);
            r.drawBox(7.0,  y + FLOOR_H * 0.5, 6.92, 10.0, FLOOR_H - 0.18, 0.08, glassOpt);
            r.drawBox(0,    y + 3.0,           6.92, 4.0,  1.1,          0.08, glassOpt);
            // Entrance canopy
            r.drawBox(0, y + 2.55, 7.8, 5.2, 0.14, 1.8, { color: COL.darkSteel });
          } else if (f < 6) {
            r.drawBox(0, y + FLOOR_H * 0.5, 6.92, BLDG_W, FLOOR_H - 0.18, 0.08, glassOpt);
          } else {
            r.drawBox(-6.0, y + FLOOR_H * 0.5, 6.92, 12.0, FLOOR_H - 0.18, 0.08, glassOpt);
          }
        }
      }
    }

    // Roof over Executive Suite (left half) + Parapet
    if (maxFloorToDraw === 6) {
      var roofY = 6 * FLOOR_H;
      r.drawBox(-6.0, roofY + 0.12, 0, 12.4, 0.24, BLDG_D + 0.4, { color: [0.32, 0.36, 0.42] });
      // HVAC Unit on roof
      r.drawBox(-8.5, roofY + 0.75, -2.5, 2.6, 1.0, 2.0, { color: [0.68, 0.70, 0.74] });
      r.drawCyl(-8.5, roofY + 1.30, -2.5, 0, 0, 1.2, 0.12, 1.2, { color: COL.darkSteel });
      // Apex Tower Rooftop Sign
      r.drawBox(-6.0, roofY + 0.85, 6.7, 5.4, 0.9, 0.18, {
        color: [0.12, 0.16, 0.22],
        emissive: env.isNight ? [0.05, 0.25, 0.45] : [0, 0, 0]
      });
    }
  };

  World.prototype.drawFloorInterior = function (r, f, y, glow, env, sim) {
    if (f === 1) {
      // LOBBY & CAFE
      // Reception Desk
      r.drawBox(-5.2, y + 0.55, 3.2, 3.2, 1.0, 0.85, { color: COL.woodDark, tex: 'wood', indoorGlow: glow });
      r.drawBox(-5.2, y + 1.08, 3.2, 3.3, 0.08, 0.95, { color: COL.marble, indoorGlow: glow });
      r.drawBox(-5.2, y + 1.32, 3.1, 0.5, 0.32, 0.06, { color: [0.5, 0.8, 1], emissive: [0.1, 0.3, 0.5] });

      // Security Turnstiles
      for (var tx = -1.8; tx <= 1.8; tx += 1.2) {
        r.drawBox(tx, y + 0.52, 1.2, 0.18, 0.92, 1.1, { color: COL.steel, indoorGlow: glow });
        r.drawBox(tx + 0.55, y + 0.65, 1.2, 0.45, 0.06, 0.06, { color: [0.2, 0.85, 0.45], emissive: [0.1, 0.4, 0.2] });
      }

      // Waiting Lounge
      drawSofa(r, -8.8, y, 2.2, Math.PI / 2, COL.sofa, glow);
      drawSofa(r, -8.8, y, 4.8, Math.PI / 2, COL.sofa, glow);
      r.drawBox(-7.4, y + 0.32, 3.5, 0.7, 0.1, 1.2, { color: COL.woodLight, tex: 'wood', indoorGlow: glow });
      drawPlant(r, -10.5, y, 5.5, 1.2, glow);
      drawPlant(r, -10.5, y, -0.5, 1.1, glow);

      // Lobby Cafe / Espresso Bar
      r.drawBox(7.8, y + 0.55, 2.5, 4.2, 1.0, 0.9, { color: COL.woodLight, tex: 'wood', indoorGlow: glow });
      r.drawBox(7.8, y + 1.08, 2.5, 4.3, 0.08, 1.0, { color: [0.22, 0.24, 0.28], indoorGlow: glow });
      // Espresso machine
      r.drawBox(8.6, y + 1.35, 2.4, 0.7, 0.48, 0.45, { color: [0.75, 0.78, 0.82], shininess: 60 });
      // Cafe Tables
      for (var cx = 6.2; cx <= 9.2; cx += 2.6) {
        r.drawCyl(cx, y + 0.38, 4.8, 0, 0, 0.12, 0.72, 0.12, { color: COL.darkSteel });
        r.drawCyl(cx, y + 0.76, 4.8, 0, 0, 0.95, 0.06, 0.95, { color: COL.woodLight, tex: 'wood', indoorGlow: glow });
      }
      drawPlant(r, 10.8, y, 5.6, 1.15, glow);
    }
    else if (f === 2) {
      // ENGINEERING
      var desks2 = [
        [-8.6, 1.2, 0], [-6.2, 1.2, 0], [-8.6, 4.2, Math.PI], [-6.2, 4.2, Math.PI],
        [4.2, 1.2, 0],  [6.6, 1.2, 0],  [4.2, 4.2, Math.PI],  [6.6, 4.2, Math.PI]
      ];
      for (var i = 0; i < desks2.length; i++) {
        drawDesk(r, desks2[i][0], y, desks2[i][1], desks2[i][2], true, glow, !env.isNight || glow > 0.5);
      }
      // Server Racks
      for (var sx = 8.8; sx <= 10.4; sx += 0.8) {
        r.drawBox(sx, y + 1.15, -4.8, 0.65, 2.1, 0.85, { color: [0.12, 0.14, 0.18] });
        r.drawBox(sx, y + 1.4, -4.36, 0.45, 0.08, 0.02, { color: [0.2, 0.8, 1.0], emissive: [0.1, 0.6, 0.9] });
        r.drawBox(sx, y + 1.0, -4.36, 0.45, 0.08, 0.02, { color: [0.2, 0.95, 0.5], emissive: [0.1, 0.7, 0.3] });
      }
      drawPlant(r, -10.8, y, 5.6, 1.0, glow);
    }
    else if (f === 3) {
      // DESIGN STUDIO
      var desks3 = [
        [-8.5, 1.5, 0], [-5.8, 1.5, 0], [-8.5, 4.4, Math.PI], [-5.8, 4.4, Math.PI],
        [4.5, 1.5, 0],  [7.2, 1.5, 0]
      ];
      for (var i = 0; i < desks3.length; i++) {
        drawDesk(r, desks3[i][0], y, desks3[i][1], desks3[i][2], false, glow, true);
      }
      // Collaboration Table + Lounge
      r.drawBox(6.8, y + 0.76, 4.6, 2.8, 0.08, 1.4, { color: COL.woodLight, tex: 'wood', indoorGlow: glow });
      r.drawBox(6.8, y + 0.38, 4.6, 2.4, 0.72, 1.0, { color: COL.darkSteel, indoorGlow: glow });
      drawSofa(r, -9.2, y, -4.2, 0, COL.sofaWarm, glow);
      drawPlant(r, 10.6, y, 5.2, 1.1, glow);
    }
    else if (f === 4) {
      // SALES & CONFERENCE ROOM
      var desks4 = [
        [-8.6, 1.4, 0], [-6.0, 1.4, 0], [-8.6, 4.4, Math.PI], [-6.0, 4.4, Math.PI]
      ];
      for (var i = 0; i < desks4.length; i++) {
        drawDesk(r, desks4[i][0], y, desks4[i][1], desks4[i][2], false, glow, true);
      }
      // Printer station
      r.drawBox(-8.5, y + 0.55, -4.6, 1.1, 0.95, 0.75, { color: [0.82, 0.84, 0.88], indoorGlow: glow });
      // Glass-walled Conference Room (right wing)
      r.drawBox(3.5, y + FLOOR_H * 0.5, 3.2, 0.08, FLOOR_H - 0.2, 5.8, { color: COL.glass, alpha: 0.28, transparent: true });
      // Conference Table
      r.drawBox(7.4, y + 0.76, 3.2, 4.4, 0.08, 1.6, { color: COL.woodDark, tex: 'wood', indoorGlow: glow });
      r.drawBox(7.4, y + 0.38, 3.2, 3.6, 0.72, 0.9, { color: COL.darkSteel });
      // Conference Chairs
      for (var cx = 5.8; cx <= 9.0; cx += 1.05) {
        r.drawBox(cx, y + 0.48, 2.0, 0.44, 0.08, 0.44, { color: COL.chair });
        r.drawBox(cx, y + 0.48, 4.4, 0.44, 0.08, 0.44, { color: COL.chair });
      }
      // Presentation Screen on right wall
      r.drawBox(11.6, y + 1.75, 3.2, 0.08, 1.4, 2.4, { color: [0.15, 0.25, 0.38], emissive: [0.12, 0.28, 0.46] });
    }
    else if (f === 5) {
      // FINANCE & BREAKROOM
      var desks5 = [
        [-8.6, 1.4, 0], [-6.0, 1.4, 0], [-8.6, 4.4, Math.PI], [-6.0, 4.4, Math.PI]
      ];
      for (var i = 0; i < desks5.length; i++) {
        drawDesk(r, desks5[i][0], y, desks5[i][1], desks5[i][2], true, glow, true);
      }
      // Breakroom Kitchenette
      r.drawBox(9.8, y + 0.52, 0.8, 1.8, 0.9, 0.75, { color: [0.88, 0.90, 0.92], indoorGlow: glow });
      // Fridge
      r.drawBox(11.1, y + 1.05, 0.8, 0.8, 1.95, 0.8, { color: [0.76, 0.79, 0.84], shininess: 50 });
      // Water Cooler
      r.drawBox(4.6, y + 0.55, 0.6, 0.42, 1.0, 0.42, { color: [0.9, 0.92, 0.95] });
      r.drawCyl(4.6, y + 1.25, 0.6, 0, 0, 0.32, 0.45, 0.32, { color: [0.35, 0.75, 0.95], alpha: 0.75, transparent: true });
      // Breakroom Dining Tables
      for (var bx = 5.8; bx <= 9.2; bx += 2.8) {
        r.drawCyl(bx, y + 0.38, 3.8, 0, 0, 0.14, 0.72, 0.14, { color: COL.darkSteel });
        r.drawCyl(bx, y + 0.76, 3.8, 0, 0, 1.15, 0.06, 1.15, { color: COL.deskTop, indoorGlow: glow });
      }
      drawPlant(r, 10.8, y, 5.4, 1.05, glow);
    }
    else if (f === 6) {
      // EXECUTIVE SUITE (left) & ROOFTOP TERRACE (right)
      // Executive Desk
      drawDesk(r, -7.2, y, 3.0, Math.PI, true, glow, true);
      drawSofa(r, -8.5, y, -3.5, 0, COL.sofaWarm, glow);
      drawPlant(r, -10.8, y, 5.5, 1.25, glow);
      // Dividing glass wall at x = 0
      r.drawBox(0.0, y + FLOOR_H * 0.5, 0, 0.1, FLOOR_H - 0.2, BLDG_D, { color: COL.glass, alpha: 0.35, transparent: true });

      // Rooftop Terrace Pergola & Lounge (right)
      for (var px = 3.5; px <= 10.5; px += 3.5) {
        r.drawBox(px, y + 1.5, 1.5, 0.18, 2.8, 0.18, { color: COL.woodDark });
        r.drawBox(px, y + 1.5, 5.5, 0.18, 2.8, 0.18, { color: COL.woodDark });
      }
      for (var pz = 1.5; pz <= 5.5; pz += 1.0) {
        r.drawBox(7.0, y + 2.9, pz, 7.8, 0.12, 0.14, { color: COL.woodDark });
      }
      drawSofa(r, 7.0, y, 3.5, Math.PI, COL.sofa, 0);
      drawPlant(r, 4.2, y, 5.6, 1.2, 0);
      drawPlant(r, 10.2, y, 5.6, 1.2, 0);
      drawPlant(r, 10.2, y, 1.2, 1.1, 0);
    }
  };

  OfficeSim.World = World;
  OfficeSim.getEnvironment = getEnvironment;
  OfficeSim.CONST = {
    FLOOR_H: FLOOR_H,
    NUM_FLOORS: NUM_FLOORS,
    BLDG_W: BLDG_W,
    BLDG_D: BLDG_D
  };
})(window);
