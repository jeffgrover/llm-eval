/* ============================================================
   world.js — layout + static geometry + textures (classic script)
   ============================================================= */
var World = (function () {
  'use strict';
  var FH = 4.2, SLAB = 0.55, FLOORS = 5, BW = 22, BD = 14, HEIGHT = 21.0;
  var SH_X0 = -2.6, SH_X1 = 2.6, SH_Z0 = -6.95, SH_Z1 = -2.6, SH_FRONT = -2.42;
  var SURF = function (i) { return i * FH + SLAB; };
  var FLOOR_CARPET = ['#5c6880', '#5a6f62', '#71616e', '#5e6a74'];
  var RUG_COLORS = ['#4f7d78', '#b0714f', '#597a4d', '#6d5a7f'];
  var DESK_COLS_LEFT = [-8.6, -5.6];
  var DESK_COLS_RIGHT = [5.6, 8.6];
  var DESK_ROWS_LEFT = [-1.7, 2.9];
  var DESK_ROWS_RIGHT = [2.9];
  var CONF = { x0: 3.5, x1: 10.35, z0: -6.6, z1: -2.25, cx: 6.9, cz: -4.4, doorX0: 4.9, doorX1: 6.3 };
  var RECEPTION = { deskX: -6.6, deskZ: 2.75, chairX: -6.6, chairZ: 1.85 };
  var BREAK_PT = { x: 7.4, z: -4.95 };
  var ENTRANCE = { x: 0, z: 7.0 };
  var LOBBY_CENTER = { x: 0, z: -1.4 };

  /* ---------- colors ---------- */
  function C(hex) {
    var n = parseInt(hex.slice(1), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }

  /* ---------- rng ---------- */
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeCanvas(w, h, draw) {
    var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    var g = cv.getContext('2d'); draw(g, w, h);
    return cv;
  }

  /* ---------- layout helpers ---------- */
  function desksForFloor(f) {
    var list = [];
    var i, j;
    for (i = 0; i < DESK_COLS_LEFT.length; i++)
      for (j = 0; j < DESK_ROWS_LEFT.length; j++)
        list.push({ floor: f, x: DESK_COLS_LEFT[i], z: DESK_ROWS_LEFT[j] });
    for (i = 0; i < DESK_COLS_RIGHT.length; i++)
      for (j = 0; j < DESK_ROWS_RIGHT.length; j++)
        list.push({ floor: f, x: DESK_COLS_RIGHT[i], z: DESK_ROWS_RIGHT[j] });
    return list;
  }
  function allDesks() {
    var d = [];
    for (var f = 1; f <= 4; f++) d = d.concat(desksForFloor(f));
    return d;
  }
  function conferenceChairs(f) {
    var list = [];
    var sideA = [5.65, 6.9, 8.15];
    for (var i = 0; i < 3; i++) list.push({ floor: f, x: sideA[i], z: -5.05, yaw: 0 });
    for (var j = 0; j < 3; j++) list.push({ floor: f, x: sideA[j], z: -3.75, yaw: Math.PI });
    return list;
  }

  /* ---------- building: exterior (opaque) ---------- */
  function buildFacade(b, rng) {
    var i;
    // slab edges (floor bands)
    for (i = 0; i <= 5; i++) {
      b.box(0, i * FH + SLAB / 2, 0, BW + 0.5, SLAB, BD + 0.5, C('#cfd0c8'));
    }
    // back core wall (behind everything)
    b.box(0, 10.5, -7.15, BW + 0.6, 21.2, 0.35, C('#a2978b'));
    // mullions: front + sides
    var mx = [-9.5, -6.5, -3.5, 3.5, 6.5, 9.5];
    for (i = 0; i < mx.length; i++) b.box(mx[i], 10.75, 7.03, 0.16, 20.4, 0.22, C('#2e333b'));
    var sz = [-4.5, -1.5, 1.5, 4.5];
    for (i = 0; i < sz.length; i++) {
      b.box(-11.03, 10.75, sz[i], 0.2, 20.4, 0.16, C('#2e333b'));
      b.box(11.03, 10.75, sz[i], 0.2, 20.4, 0.16, C('#2e333b'));
    }
    // entrance frame
    b.box(-1.48, SURF(0) + 1.25, 7.02, 0.22, 2.5, 0.3, C('#23262c'));
    b.box(1.48, SURF(0) + 1.25, 7.02, 0.22, 2.5, 0.3, C('#23262c'));
    b.box(0, SURF(0) + 2.56, 7.02, 3.18, 0.22, 0.34, C('#23262c'));
    b.box(0, SURF(0) + 0.035, 7.3, 3.3, 0.07, 0.85, C('#4a4e55'));
    // canopy posts
    b.cylinder(-2.2, 0.12 + 1.33, 9.55, 0.09, 0.09, 2.66, 8, C('#3a3e45'));
    b.cylinder(2.2, 0.12 + 1.33, 9.55, 0.09, 0.09, 2.66, 8, C('#3a3e45'));
    // roof: parapet + equipment
    b.box(0, 21.62 + 0.4, 6.94, 22.7, 0.8, 0.24, C('#c3c2ba'));
    b.box(0, 21.62 + 0.4, -6.94, 22.7, 0.8, 0.24, C('#c3c2ba'));
    b.box(-10.94, 21.62 + 0.4, 0, 0.24, 0.8, 14.4, C('#c3c2ba'));
    b.box(10.94, 21.62 + 0.4, 0, 0.24, 0.8, 14.4, C('#c3c2ba'));
    // AC units
    b.box(-5.6, 21.62 + 0.55, -2.5, 2.3, 1.1, 1.7, C('#8a8f96'));
    b.cylinder(-5.6, 21.62 + 1.16, -2.5, 0.62, 0.62, 0.18, 12, C('#454a52'));
    b.box(5.9, 21.62 + 0.47, -3.3, 1.9, 0.95, 1.5, C('#94989f'));
    b.cylinder(5.9, 21.62 + 1.02, -3.3, 0.55, 0.55, 0.16, 12, C('#494e56'));
    // solar panels (flat, on small legs)
    var px = [5.4, 8.4], pz = [1.3, -0.7], i2;
    for (i2 = 0; i2 < px.length; i2++)
      for (var j2 = 0; j2 < pz.length; j2++) {
        b.box(px[i2], 21.62 + 0.22, pz[j2], 2.2, 0.09, 1.5, C('#1e2f4a'));
        b.box(px[i2], 21.62 + 0.1, pz[j2], 1.8, 0.16, 1.1, C('#7c8077'));
      }
    // antenna mast
    b.cylinder(8.3, 21.62 + 1.55, -3.7, 0.05, 0.075, 3.1, 8, C('#3a3e45'));
    // shaft exterior skin on back wall (hidden mostly) — skip
  }

  /* ---------- interior (opaque) ---------- */
  function buildInterior(b) {
    var f, i;
    // shaft side slabs + lintels (opaque), full height
    for (f = 0; f < FLOORS; f++) {
      var base = SURF(f);
      b.box(-1.825, base + 1.35, SH_FRONT - 0.12, 1.55, 2.7, 0.24, C('#b5b2aa'));
      b.box(1.825, base + 1.35, SH_FRONT - 0.12, 1.55, 2.7, 0.24, C('#b5b2aa'));
      b.box(0, base + 3.05, SH_FRONT - 0.12, 2.1, 0.85, 0.24, C('#b5b2aa'));
    }
    // shaft core walls (sides + back) full height
    b.box(-2.45, 0.55 + 10.225, -4.78, 0.25, 20.45, 4.35, C('#8e8b84'));
    b.box(2.45, 0.55 + 10.225, -4.78, 0.25, 20.45, 4.35, C('#8e8b84'));
    b.box(0, 0.55 + 10.225, -6.82, 5.1, 20.45, 0.25, C('#8e8b84'));

    // office floors
    for (f = 1; f <= 4; f++) {
      var surf = SURF(f);
      var accent = C(RUG_COLORS[f - 1]);
      // carpet slab
      b.box(0, surf + 0.03, 0.03, 21.5, 0.06, 13.75, C(FLOOR_CARPET[f - 1]));
      // rugs under desk pairs
      b.box(-7.1, surf + 0.045, 0.6, 6.7, 0.035, 4.9, accent);
      b.box(7.1, surf + 0.045, 0.6, 6.7, 0.035, 4.9, accent);
      // back wall wainscot accent stripe (interior)
      b.box(0, surf + 0.75, -6.82, 21.4, 0.06, 0.1, C(RUG_COLORS[f - 1]));
      // columns
      b.box(-3.7, surf + 1.825, 4.95, 0.5, 3.65, 0.5, C('#b3aca1'));
      b.box(3.7, surf + 1.825, 4.95, 0.5, 3.65, 0.5, C('#b3aca1'));
      // desks
      var desksF = desksForFloor(f);
      for (i = 0; i < desksF.length; i++) buildDesk(b, desksF[i], f);
      // conference room furniture
      buildConference(b, f);
      // plants
      buildPlant(b, -10.25, surf, 6.1);
      buildPlant(b, 10.25, surf, 6.1);
    }

    // ground floor
    var g = SURF(0);
    b.box(0, g + 0.03, 0.03, 21.5, 0.06, 13.75, C('#b08c62'));
    // reception
    b.box(RECEPTION.deskX, g + 0.525, RECEPTION.deskZ, 3.1, 1.05, 0.95, C('#54432f'));
    b.box(RECEPTION.deskX, g + 1.09, RECEPTION.deskZ, 3.35, 0.08, 1.1, C('#2c2721'));
    b.box(RECEPTION.deskX, g + 1.2, 1.30, 3.5, 2.4, 0.16, C('#1e2433')); // logo panel
    b.box(RECEPTION.deskX, g + 0.09, 0.28, 2.9, 0.06, 1.15, C('#8a6a45')); // floor rug under desk
    // benches
    buildBench(b, -5.0, g, 6.15, 0);
    buildBench(b, 5.0, g, 6.15, 0);
    // break area
    b.box(7.4, g + 0.475, -6.05, 3.7, 0.95, 0.8, C('#3c4654'));
    b.box(7.4, g + 1.0, -6.05, 3.85, 0.07, 0.92, C('#cfd4da'));
    b.box(6.15, g + 1.28, -6.22, 0.5, 0.5, 0.45, C('#24272c')); // coffee machine
    buildStool(b, 5.95, g, -4.72, C('#b0714f'));
    buildStool(b, 7.4, g, -4.78, C('#b0714f'));
    buildStool(b, 8.85, g, -4.72, C('#b0714f'));
    // stairs back-left
    buildStairs(b, 0);
    // plants
    buildPlant(b, -10.25, g, 6.15);
    buildPlant(b, 10.25, g, 6.15);
    buildPlant(b, 10.25, g, -1.5);
    // lobby rug
    b.box(0, g + 0.045, 2.6, 3.3, 0.035, 4.6, C('#4f7d78'));
    // side planter near conference door
    buildPlant(b, 3.35, g, -2.6);
  }

  function buildDesk(b, d, f) {
    var surf = SURF(f);
    var x = d.x, z = d.z;
    // top + legs
    b.box(x, surf + 0.72, z, 2.7, 0.09, 1.3, C('#b5834f'));
    b.box(x - 1.2, surf + 0.36, z, 0.1, 0.68, 1.15, C('#34373d'));
    b.box(x + 1.2, surf + 0.36, z, 0.1, 0.68, 1.15, C('#34373d'));
    // modesty panel
    b.box(x, surf + 0.44, z - 0.53, 2.5, 0.46, 0.06, C('#9c7248'));
    // monitors
    b.box(x - 0.52, surf + 1.02, z - 0.32, 0.82, 0.48, 0.05, C('#20242a'));
    b.box(x + 0.52, surf + 1.02, z - 0.32, 0.82, 0.48, 0.05, C('#20242a'));
    b.box(x - 0.52, surf + 0.78, z - 0.32, 0.1, 0.2, 0.1, C('#2a2e35'));
    b.box(x + 0.52, surf + 0.78, z - 0.32, 0.1, 0.2, 0.1, C('#2a2e35'));
    // keyboard + mouse + mug
    b.box(x - 0.1, surf + 0.78, z + 0.28, 0.52, 0.04, 0.2, C('#26292f'));
    b.box(x + 0.72, surf + 0.79, z + 0.3, 0.13, 0.05, 0.18, C('#26292f'));
    b.cylinder(x + 0.95, surf + 0.82, z + 0.28, 0.055, 0.055, 0.12, 8, C('#c75b3a'));
    // chair
    b.box(x, surf + 0.47, z + 0.98, 0.52, 0.09, 0.5, C('#33456b'));
    b.box(x, surf + 0.86, z + 1.2, 0.5, 0.6, 0.09, C('#33456b'));
    b.cylinder(x, surf + 0.24, z + 0.98, 0.06, 0.06, 0.42, 8, C('#3a3d42'));
    b.cylinder(x, surf + 0.05, z + 0.98, 0.26, 0.3, 0.05, 10, C('#3a3d42'));
  }

  function buildConference(b, f) {
    var surf = SURF(f);
    // rug
    b.box(6.9, surf + 0.04, -4.4, 6.3, 0.035, 3.9, C('#4d5265'));
    // table
    b.box(6.9, surf + 0.74, -4.4, 3.5, 0.09, 1.5, C('#6e4b2e'));
    b.box(5.65, surf + 0.37, -4.4, 0.12, 0.7, 1.2, C('#3a3026'));
    b.box(8.15, surf + 0.37, -4.4, 0.12, 0.7, 1.2, C('#3a3026'));
    // chairs
    var sideA = [5.65, 6.9, 8.15], i;
    for (i = 0; i < 3; i++) {
      // facing +z (user sits at back, backrest on -z side)
      b.box(sideA[i], surf + 0.47, -5.08, 0.5, 0.08, 0.48, C('#3c4658'));
      b.box(sideA[i], surf + 0.82, -5.3, 0.48, 0.56, 0.09, C('#3c4658'));
      // facing -z
      b.box(sideA[i], surf + 0.47, -3.72, 0.5, 0.08, 0.48, C('#3c4658'));
      b.box(sideA[i], surf + 0.82, -3.5, 0.48, 0.56, 0.09, C('#3c4658'));
    }
  }

  function buildBench(b, x, g, z, yaw) {
    b.box(x, g + 0.36, z, 2.0, 0.13, 0.55, C('#8c5f43'));
    b.box(x, g + 0.62, z + 0.26, 2.0, 0.5, 0.11, C('#8c5f43'));
    b.box(x - 0.75, g + 0.14, z, 0.12, 0.3, 0.5, C('#34373d'));
    b.box(x + 0.75, g + 0.14, z, 0.12, 0.3, 0.5, C('#34373d'));
  }

  function buildStool(b, x, g, z, col) {
    b.cylinder(x, g + 0.62, z, 0.24, 0.24, 0.12, 12, col);
    b.cylinder(x, g + 0.28, z, 0.05, 0.05, 0.5, 8, C('#3a3d42'));
  }

  function buildStairs(b, floorIndex) {
    var g = SURF(floorIndex);
    var i;
    for (i = 0; i < 10; i++) {
      var y = g + 0.16 + i * 0.19;
      b.box(-7.1, y, -3.0 - i * 0.345, 3.5, 0.2, 0.36, C('#8d8677'));
    }
  }

  function buildPlant(b, x, g, z) {
    b.cylinder(x, g + 0.2, z, 0.3, 0.34, 0.4, 10, C('#7d5a40'));
    b.sphere(x, g + 0.72, z, 0.42, 10, C('#3f7046'));
    b.sphere(x + 0.18, g + 1.02, z - 0.08, 0.3, 9, C('#477a3c'));
    b.sphere(x - 0.2, g + 0.95, z + 0.12, 0.28, 9, C('#3a6b42'));
  }

  /* ---------- transparent: facade glass + conference walls ---------- */
  function buildGlass(b) {
    // front glass: left span
    b.quad([-11, 0.55, 7], [-1.55, 0.55, 7], [-1.55, 21.0, 7], [-11, 21.0, 7], [0, 0, 1], C('#9fc4d6'));
    // front glass: right span
    b.quad([1.55, 0.55, 7], [11, 0.55, 7], [11, 21.0, 7], [1.55, 21.0, 7], [0, 0, 1], C('#9fc4d6'));
    // front glass lintel above door
    b.quad([-1.55, 3.1, 7], [1.55, 3.1, 7], [1.55, 21.0, 7], [-1.55, 21.0, 7], [0, 0, 1], C('#9fc4d6'));
    // side glass
    b.quad([-11, 0.55, -7], [-11, 0.55, 7], [-11, 21.0, 7], [-11, 21.0, -7], [-1, 0, 0], C('#9fc4d6'));
    b.quad([11, 0.55, -7], [11, 0.55, 7], [11, 21.0, 7], [11, 21.0, -7], [1, 0, 0], C('#9fc4d6'));
    // canopy glass
    b.quad([-2.35, 2.78, 6.95], [2.35, 2.78, 6.95], [2.35, 2.78, 9.9], [-2.35, 2.78, 9.9], [0, 1, 0], C('#bcd6de'));
    // conference room side walls + front wall (per office floor)
    var f;
    for (f = 1; f <= 4; f++) {
      var surf = SURF(f);
      var y0 = surf, y1 = surf + 3.6;
      // front wall (z=-2.25), gap x 4.9..6.3
      b.quad([3.5, y0, -2.25], [4.9, y0, -2.25], [4.9, y1, -2.25], [3.5, y1, -2.25], [0, 0, 1], C('#a8bfd0'));
      b.quad([6.3, y0, -2.25], [10.35, y0, -2.25], [10.35, y1, -2.25], [6.3, y1, -2.25], [0, 0, 1], C('#a8bfd0'));
      // left wall (x=3.5), z -6.6..-2.25
      b.quad([3.5, y0, -6.6], [3.5, y0, -2.25], [3.5, y1, -2.25], [3.5, y1, -6.6], [-1, 0, 0], C('#a8bfd0'));
    }
  }

  /* ---------- exterior ground / vehicles ---------- */
  function buildExterior(b, rng) {
    // lawn
    b.gridPlane(0, 0, 0, 260, 260, 10, C('#4f7a3c'), 0.10, function (n) { return mulberry32(Math.floor(n * 97.7) + 11)(); });
    // sidewalks
    b.box(0, 0.07, 15.0, 260, 0.14, 4.8, C('#b0aba0'));
    b.box(0, 0.07, 28.6, 260, 0.14, 3.2, C('#b0aba0'));
    b.box(0, 0.16, 17.4, 260, 0.06, 0.25, C('#8f8a82'));
    b.box(0, 0.16, 27.0, 260, 0.06, 0.25, C('#8f8a82'));
    // road
    b.box(0, 0.03, 22.2, 260, 0.06, 9.6, C('#363b42'));
    // center dashes
    for (var x = -124; x <= 124; x += 6.4) b.box(x, 0.075, 22.2, 1.9, 0.035, 0.2, C('#d6d6cf'));
    // crosswalk at entrance (x -1.7..1.7)
    for (var i = 0; i < 8; i++) b.box(0, 0.07, 18.6 + i * 1.05, 3.3, 0.045, 0.5, C('#d6d3c8'));
    // plaza in front of entrance
    b.box(0, 0.1, 9.9, 33, 0.1, 5.6, C('#c0bbab'));
    b.box(0, 0.13, 7.35, 33.5, 0.04, 0.3, C('#8f8a82'));
    // parking lot right
    b.box(37.5, 0.05, 10.2, 32, 0.1, 9.5, C('#3b3f46'));
    b.box(21.5, 0.06, 10.2, 0.35, 0.12, 9.5, C('#8a8a84'));
    for (var s = 0; s < 4; s++) {
      var px = 26.5 + s * 8.0;
      b.box(px, 0.14, 10.2, 0.18, 0.05, 9.0, C('#cfcec6'));
    }
    // trees
    var treeSpots = [[-26, 15.0], [-14, 15.0], [14, 15.0], [26, 15.0], [-10, 28.6], [16, 28.6]];
    for (var t = 0; t < treeSpots.length; t++) buildTree(b, treeSpots[t][0], treeSpots[t][1]);
    // lamps
    var lampSpots = [[-14, 13.3], [14, 13.3], [-5.8, 28.4], [5.8, 28.4], [-4.6, 8.95], [4.6, 8.95]];
    for (var l = 0; l < lampSpots.length; l++) buildLamp(b, lampSpots[l][0], lampSpots[l][1]);
    // entrance planters
    buildPlanter(b, -3.5, 8.9);
    buildPlanter(b, 3.5, 8.9);
    // parked cars (static)
    var carSpots = [[27.0, 10.4, 0], [35.0, 10.4, 1], [43.0, 10.4, 2], [50.5, 10.4, 3]];
    for (var c2 = 0; c2 < carSpots.length; c2++) buildParkedCar(b, carSpots[c2][0], carSpots[c2][1], carSpots[c2][2]);
    // background towers
    buildTowers(b);
  }

  function buildTree(b, x, z) {
    b.cylinder(x, 1.15, z, 0.17, 0.3, 2.3, 8, C('#6b4a2e'));
    b.sphere(x, 2.9, z, 1.45, 12, C('#3e6b34'));
    b.sphere(x + 0.85, 2.35, z + 0.35, 1.0, 10, C('#477a3c'));
    b.sphere(x - 0.8, 2.4, z - 0.3, 0.95, 10, C('#3d6b3a'));
  }

  function buildLamp(b, x, z) {
    b.cylinder(x, 2.45, z, 0.07, 0.11, 4.7, 8, C('#33373d'));
    b.box(x, 4.85, z, 0.5, 0.1, 0.28, C('#2b2f36'));
  }

  function buildPlanter(b, x, z) {
    b.box(x, 0.3, z, 1.2, 0.55, 1.2, C('#9a948a'));
    b.sphere(x, 0.85, z, 0.55, 10, C('#3f7a3f'));
    b.sphere(x + 0.28, 1.05, z + 0.18, 0.38, 9, C('#477a3c'));
  }

  function buildParkedCar(b, x, z, ci) {
    var cols = [C('#3d4a5c'), C('#5c3d3a'), C('#3a5244'), C('#55595f')];
    var body = cols[ci % cols.length];
    b.box(x, 0.62, z, 2.05, 0.55, 4.7, body);
    b.box(x, 1.08, z, 1.7, 0.42, 2.15, C('#14181f'));
    b.box(x - 0.95, 0.5, z + 2.28, 0.28, 0.14, 0.28, C('#e8e6da'));
    b.box(x + 0.95, 0.5, z + 2.28, 0.28, 0.14, 0.28, C('#e8e6da'));
    b.box(x - 0.95, 0.5, z - 2.28, 0.28, 0.14, 0.28, C('#b13a30'));
    b.box(x + 0.95, 0.5, z - 2.28, 0.28, 0.14, 0.28, C('#b13a30'));
  }

  function buildTowers(b) {
    // placeholder opaque base (textured meshes built elsewhere)
  }

  /* ---------- clouds / birds static: built in main loop ---------- */

  /* ---------- textured: tower bodies ---------- */
  function towerTexture(base, litSeed) {
    return makeCanvas(128, 256, function (g, w, h) {
      g.fillStyle = base; g.fillRect(0, 0, w, h);
      var rng = mulberry32(litSeed);
      var cols = 8, rows = 18;
      var cw = w / cols, ch = h / rows;
      for (var i = 0; i < cols; i++) {
        for (var j = 0; j < rows; j++) {
          var lit = rng() < 0.38;
          var cool = rng() < 0.28;
          if (lit) g.fillStyle = cool ? '#cfe6ff' : '#ffd9a0';
          else g.fillStyle = '#10151f';
          g.fillRect(i * cw + 3, j * ch + 4, cw - 7, ch - 8);
        }
      }
      // top beacon band
      g.fillStyle = '#222'; g.fillRect(0, 0, w, 5);
    });
  }

  /* ---------- screens: canvas textures ---------- */
  function monitorTexture(kind, seed) {
    var cv = document.createElement('canvas'); cv.width = 128; cv.height = 84;
    var g = cv.getContext('2d');
    var rng = mulberry32(seed);
    if (kind === 'code') {
      g.fillStyle = '#131b26'; g.fillRect(0, 0, 128, 84);
      for (var i = 0; i < 10; i++) {
        var y = 6 + i * 7.6;
        var x = 6 + Math.floor(rng() * 4) * 8;
        var wmax = 90 - x;
        while (x < 118) {
          var wSeg = 6 + Math.floor(rng() * 22);
          var r = rng();
          g.fillStyle = r < 0.4 ? '#7ec8ff' : r < 0.65 ? '#ffb86c' : r < 0.85 ? '#4f657e' : '#e0a0ff';
          g.fillRect(x, y, wSeg, 4.5);
          x += wSeg + 4;
        }
      }
    } else if (kind === 'chart') {
      g.fillStyle = '#141b26'; g.fillRect(0, 0, 128, 84);
      // grid
      g.strokeStyle = '#233045'; g.lineWidth = 1;
      for (var i2 = 1; i2 < 5; i2++) { g.beginPath(); g.moveTo(0, i2 * 15); g.lineTo(128, i2 * 15); g.stroke(); }
      // line
      g.strokeStyle = '#6fd6a8'; g.lineWidth = 2.4; g.beginPath();
      var pts = [];
      for (var k = 0; k <= 8; k++) pts.push([6 + k * 15.5, 68 - 50 * (0.3 + 0.7 * rng()) - k * 1.5]);
      g.moveTo(pts[0][0], pts[0][1]);
      for (var p = 1; p < pts.length; p++) g.lineTo(pts[p][0], pts[p][1]);
      g.stroke();
      g.strokeStyle = '#f2a65a'; g.lineWidth = 1.6; g.beginPath();
      for (var q = 0; q < pts.length; q++) {
        var y2 = Math.min(80, pts[q][1] + 16 + rng() * 8);
        if (q === 0) g.moveTo(pts[q][0], y2); else g.lineTo(pts[q][0], y2);
      }
      g.stroke();
    } else if (kind === 'sheet') {
      g.fillStyle = '#1a222e'; g.fillRect(0, 0, 128, 84);
      g.strokeStyle = '#2c3a4c'; g.lineWidth = 1;
      for (var cx2 = 1; cx2 < 8; cx2++) { g.beginPath(); g.moveTo(cx2 * 16, 0); g.lineTo(cx2 * 16, 84); g.stroke(); }
      for (var ry = 1; ry < 6; ry++) { g.beginPath(); g.moveTo(0, ry * 14); g.lineTo(128, ry * 14); g.stroke(); }
      for (var cx3 = 0; cx3 < 8; cx3++) for (var ry2 = 0; ry2 < 5; ry2++) {
        if (rng() < 0.35) {
          g.fillStyle = rng() < 0.5 ? '#7ee2a0' : '#d8d2c4';
          g.font = '7px monospace';
          g.fillText(String(Math.floor(rng() * 9000 + 10)), cx3 * 16 + 3, ry2 * 14 + 9);
        }
      }
    } else { // chat
      g.fillStyle = '#141a24'; g.fillRect(0, 0, 128, 84);
      // header bar
      g.fillStyle = '#263042'; g.fillRect(0, 0, 128, 13);
      g.fillStyle = '#fff'; g.font = 'bold 8px sans-serif'; g.fillText('# design-review', 5, 9);
      for (var m = 0; m < 5; m++) {
        var y3 = 20 + m * 13;
        var left = m % 2 === 0;
        var bw = 44 + rng() * 42;
        var bx = left ? 5 : 128 - 5 - bw;
        g.fillStyle = left ? '#2e3a4e' : '#3a5a44';
        g.beginPath();
        if (g.roundRect) g.roundRect(bx, y3, bw, 9, 4); else g.rect(bx, y3, bw, 9);
        g.fill();
        g.fillStyle = '#dfe5ee';
        g.font = '6px sans-serif';
        g.fillText(left ? 'looks good!' : 'ship it Friday', bx + 4, y3 + 6);
      }
    }
    return cv;
  }

  function presentationTexture() {
    var cv = document.createElement('canvas'); cv.width = 128; cv.height = 84;
    var g = cv.getContext('2d');
    g.fillStyle = '#1c2634'; g.fillRect(0, 0, 128, 84);
    g.fillStyle = '#f2a65a'; g.fillRect(6, 6, 40, 3);
    g.fillStyle = '#f4f6fa'; g.font = 'bold 11px sans-serif'; g.fillText('Q3 REVIEW', 6, 20);
    var bars = [0.35, 0.55, 0.42, 0.66, 0.9, 0.48];
    for (var i = 0; i < 6; i++) {
      var h = 34 * bars[i];
      g.fillStyle = i === 4 ? '#f2a65a' : '#4f8fc9';
      g.fillRect(10 + i * 19, 70 - h, 12, h);
    }
    g.fillStyle = '#8a95a8'; g.font = '6px sans-serif';
    g.fillText('revenue      Q3', 60, 6);
    return cv;
  }

  function logoTexture() {
    var cv = document.createElement('canvas'); cv.width = 256; cv.height = 128;
    var g = cv.getContext('2d');
    g.fillStyle = '#1c2740'; g.fillRect(0, 0, 256, 128);
    g.fillStyle = '#f2a65a';
    g.beginPath(); g.moveTo(38, 30); g.lineTo(74, 30); g.lineTo(38, 92); g.closePath(); g.fill();
    g.fillStyle = '#f4f6fa';
    g.font = 'bold 26px sans-serif';
    g.fillText('MERIDIAN', 88, 58);
    g.fillStyle = '#8a95a8'; g.font = 'bold 13px sans-serif';
    g.fillText('T O W E R', 90, 82);
    return cv;
  }

  function signTexture() {
    var cv = document.createElement('canvas'); cv.width = 512; cv.height = 96;
    var g = cv.getContext('2d');
    g.fillStyle = '#141c2b'; g.fillRect(0, 0, 512, 96);
    g.strokeStyle = '#f2a65a'; g.lineWidth = 3; g.strokeRect(5, 5, 502, 86);
    g.fillStyle = '#f4f6fa'; g.font = 'bold 44px sans-serif';
    g.textAlign = 'center';
    g.fillText('MERIDIAN TOWER', 256, 62);
    return cv;
  }

  /* ===============================================================
     Full scene build
     ============================================================= */
  function build(engine) {
    var E = engine;
    var rng = mulberry32(20240513);
    var desks = allDesks();

    var ext = E.Builder();
    buildFacade(ext, rng);
    buildExterior(ext, rng);
    var exteriorMesh = E.makeMesh(ext.build());

    var inner = E.Builder();
    buildInterior(inner);
    var interiorMesh = E.makeMesh(inner.build());

    var glass = E.Builder();
    buildGlass(glass);
    var glassMesh = E.makeMesh(glass.build());

    // towers (textured)
    var towers = [
      { x: -78, z: -48, w: 22, h: 38, d: 18, seed: 5, base: '#2a3140' },
      { x: -45, z: -66, w: 26, h: 58, d: 20, seed: 9, base: '#232a36' },
      { x: -8, z: -60, w: 20, h: 44, d: 18, seed: 14, base: '#2e3442' },
      { x: 22, z: -64, w: 28, h: 66, d: 22, seed: 21, base: '#242b38' },
      { x: 58, z: -52, w: 24, h: 42, d: 18, seed: 29, base: '#2b3240' },
      { x: -88, z: -6, w: 20, h: 30, d: 18, seed: 33, base: '#262d3a' },
      { x: 84, z: -18, w: 22, h: 34, d: 20, seed: 37, base: '#2a313d' }
    ];
    var towerMeshes = [];
    for (var t = 0; t < towers.length; t++) {
      var tw = towers[t];
      var cv = towerTexture(tw.base, tw.seed);
      var tex = E.makeTextureFromCanvas(cv);
      var bt = E.Builder();
      bt.plane(tw.x - tw.w / 2, 0, tw.z, tw.w, tw.d, [0.02, 0.02, 0.02], [0, 1, 0]);
      // 4 sides: +x face
      var x0 = tw.x - tw.w / 2, x1 = tw.x + tw.w / 2, z0 = tw.z - tw.d / 2, z1 = tw.z + tw.d / 2;
      var y0 = 0, y1 = tw.h;
      // +x face
      bt.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], [0.1, 0.1, 0.1], [[0,0],[1,0],[1,1],[0,1]]);
      // -x face
      bt.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], [0.1, 0.1, 0.1], [[0,0],[1,0],[1,1],[0,1]]);
      // +z face
      bt.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], [0.1, 0.1, 0.1], [[0,0],[1,0],[1,1],[0,1]]);
      // -z face
      bt.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], [0.1, 0.1, 0.1], [[0,0],[1,0],[1,1],[0,1]]);
      // roof
      bt.plane(tw.x, y1, tw.z, tw.w, tw.d, [0.12, 0.13, 0.15], [0, 1, 0]);
      var m = E.makeTexturedMesh(bt.build());
      towerMeshes.push({ mesh: m, tex: tex, h: tw.h });
    }

    // cars static (textured? no — plain boxes already in exterior) — skip

    // screens textures + meshes
    var monKinds = ['code', 'chart', 'sheet', 'chat'];
    var monTexes = [];
    for (var k = 0; k < monKinds.length; k++) monTexes.push(E.makeTextureFromCanvas(monitorTexture(monKinds[k], 100 + k * 13)));
    var monMeshes = [];
    for (var mk2 = 0; mk2 < 4; mk2++) {
      var mb2 = E.Builder();
      for (var di2 = 0; di2 < desks.length; di2++) {
        var dd2 = desks[di2];
        var surfM = SURF(dd2.floor);
        // left monitor
        var lt = (dd2.floor * 3 + di2) % 4;
        if (lt === mk2) {
          mb2.quad([dd2.x - 0.52 - 0.36, surfM + 1.02 - 0.19, dd2.z - 0.29],
                   [dd2.x - 0.52 + 0.36, surfM + 1.02 - 0.19, dd2.z - 0.29],
                   [dd2.x - 0.52 + 0.36, surfM + 1.02 + 0.19, dd2.z - 0.29],
                   [dd2.x - 0.52 - 0.36, surfM + 1.02 + 0.19, dd2.z - 0.29],
                   [0, 0, 1], [0.05, 0.05, 0.05], [[0,0],[1,0],[1,1],[0,1]]);
        }
        // right monitor
        var rt = (di2 * 5 + 2) % 4;
        if (rt === mk2) {
          mb2.quad([dd2.x + 0.52 - 0.36, surfM + 1.02 - 0.19, dd2.z - 0.29],
                   [dd2.x + 0.52 + 0.36, surfM + 1.02 - 0.19, dd2.z - 0.29],
                   [dd2.x + 0.52 + 0.36, surfM + 1.02 + 0.19, dd2.z - 0.29],
                   [dd2.x + 0.52 - 0.36, surfM + 1.02 + 0.19, dd2.z - 0.29],
                   [0, 0, 1], [0.05, 0.05, 0.05], [[0,0],[1,0],[1,1],[0,1]]);
        }
      }
      monMeshes.push({ mesh: E.makeTexturedMesh(mb2.build()), tex: monTexes[mk2] });
    }
    // conference screens
    var confM = E.Builder();
    for (var f = 1; f <= 4; f++) {
      var surf2 = SURF(f);
      confM.quad([6.9 - 1.3, surf2 + 1.05, -6.82], [6.9 + 1.3, surf2 + 1.05, -6.82],
                 [6.9 + 1.3, surf2 + 2.5, -6.82], [6.9 - 1.3, surf2 + 2.5, -6.82],
                 [0, 0, 1], [0.05, 0.05, 0.05], [[0,0],[1,0],[1,1],[0,1]]);
    }
    var confMesh = E.makeTexturedMesh(confM.build());
    var confTex = E.makeTextureFromCanvas(presentationTexture());

    // reception logo
    var logoM = E.Builder();
    logoM.quad([RECEPTION.deskX - 1.55, SURF(0) + 1.05, 1.39], [RECEPTION.deskX + 1.55, SURF(0) + 1.05, 1.39],
               [RECEPTION.deskX + 1.55, SURF(0) + 2.35, 1.39], [RECEPTION.deskX - 1.55, SURF(0) + 2.35, 1.39],
               [0, 0, 1], [0.05, 0.05, 0.05], [[0,0],[1,0],[1,1],[0,1]]);
    var logoMesh = E.makeTexturedMesh(logoM.build());
    var logoTex = E.makeTextureFromCanvas(logoTexture());

    // entrance sign
    var signM = E.Builder();
    signM.quad([-2.7, 3.55, 7.22], [2.7, 3.55, 7.22], [2.7, 4.5, 7.22], [-2.7, 4.5, 7.22], [0, 0, 1], [0.05, 0.05, 0.05], [[0,0],[1,0],[1,1],[0,1]]);
    var signMesh = E.makeTexturedMesh(signM.build());
    var signTex = E.makeTextureFromCanvas(signTexture());

    // ceiling light positions (glow)
    var lampHeads = [];
    var lampSpots2 = [[-14, 13.3], [14, 13.3], [-5.8, 28.4], [5.8, 28.4], [-4.6, 8.95], [4.6, 8.95]];
    for (var lp = 0; lp < lampSpots2.length; lp++) lampHeads.push({ x: lampSpots2[lp][0], y: 4.85, z: lampSpots2[lp][1] });

    var ceilingPanels = [];
    for (var f = 0; f <= 4; f++) {
      var surf3 = SURF(f);
      ceilingPanels.push({ x: -5.5, y: surf3 + 3.35, z: -2.5 });
      ceilingPanels.push({ x: 5.5, y: surf3 + 3.35, z: -2.5 });
      ceilingPanels.push({ x: -5.5, y: surf3 + 3.35, z: 2.5 });
      ceilingPanels.push({ x: 5.5, y: surf3 + 3.35, z: 2.5 });
    }

    return {
      exteriorMesh: exteriorMesh,
      interiorMesh: interiorMesh,
      glassMesh: glassMesh,
      towerMeshes: towerMeshes,
      monitorMeshes: monMeshes, // 4 textured meshes, each partial set of left monitors
      confMesh: confMesh, confTex: confTex,
      logoMesh: logoMesh, logoTex: logoTex,
      signMesh: signMesh, signTex: signTex,
      lampHeads: lampHeads,
      ceilingPanels: ceilingPanels,
      beacon: { x: 8.3, y: 21.62 + 3.2 + 0.1, z: -3.7 },
      floorSurface: SURF,
      surface: SURF,
      mulberry32: mulberry32,
      allDesks: desks,
      conferenceChairs: conferenceChairs,
      CONF: CONF,
      BREAK_PT: BREAK_PT,
      RECEPTION: RECEPTION,
      ENTRANCE: ENTRANCE,
      LOBBY_CENTER: LOBBY_CENTER,
      SH: { x0: SH_X0, x1: SH_X1, z0: SH_Z0, z1: SH_Z1, front: SH_FRONT, centerZ: -4.78 },
      HEIGHT: HEIGHT,
      FLOORS: FLOORS, FH: FH, SLAB: SLAB
    };
  }

  function buildCarGeometry(E) {
    var b = E.Builder();
    b.box(0, 0.06, 0, 4.7, 0.12, 3.5, C('#3d4452'));
    b.box(0, 2.92, 0, 4.7, 0.12, 3.5, C('#2e323a'));
    b.box(-2.3, 1.5, 0, 0.14, 2.85, 3.5, C('#3a3f47'));
    b.box(2.3, 1.5, 0, 0.14, 2.85, 3.5, C('#3a3f47'));
    b.box(0, 1.5, -1.72, 4.7, 2.85, 0.16, C('#454b54'));
    b.box(0, 1.35, -1.6, 2.5, 2.15, 0.06, C('#4a5260'));
    b.box(0, 2.8, 0, 2.4, 0.06, 1.0, C('#ffedc4'));
    b.box(-2.2, 1.95, 0, 0.06, 0.1, 3.0, C('#565d68'));
    b.box(2.2, 1.95, 0, 0.06, 0.1, 3.0, C('#565d68'));
    var geo = b.build();
    return E.makeMesh(geo);
  }

  return { build: build, buildCarGeometry: buildCarGeometry, surface: SURF, C: C, mulberry32: mulberry32, allDesks: allDesks, conferenceChairs: conferenceChairs, CONF: CONF, BREAK_PT: BREAK_PT, RECEPTION: RECEPTION, ENTRANCE: ENTRANCE, LOBBY_CENTER: LOBBY_CENTER, FH: FH, SLAB: SLAB, FLOORS: FLOORS, BW: BW, BD: BD, HEIGHT: HEIGHT, DESK_COLS_LEFT: DESK_COLS_LEFT, DESK_COLS_RIGHT: DESK_COLS_RIGHT, DESK_ROWS_LEFT: DESK_ROWS_LEFT, DESK_ROWS_RIGHT: DESK_ROWS_RIGHT, RUG_COLORS: RUG_COLORS, FLOOR_CARPET: FLOOR_CARPET };
})();
