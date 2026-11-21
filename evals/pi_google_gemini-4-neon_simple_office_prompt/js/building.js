(function () {
  'use strict';

  var OfficeSim = (window.OfficeSim = window.OfficeSim || {});
  var CFG = OfficeSim.CONFIG;

  function Building(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.scene.add(this.root);

    this.floorGroups = [];
    this.cutawayMeshes = [];   // Front & Right curtain walls hidden in cutaway mode
    this.shaftDoors = [];      // [floor][shaftIndex] = { left, right, upLight, downLight }
    this.floorLights = [];     // Interior point lights & ceiling strips
    this.ceilingEmissives = [];
    this.serverLeds = [];
    this.hvacFans = [];
    this.lobbyDoors = null;

    // Interactive world points for workers
    this.workstations = [];     // { id, floor, x, z, chairX, chairZ, facingY, occupant, dept }
    this.meetingRooms = [];     // { id, name, floor, doorX, doorZ, presenterSpot, seats: [{x,z,facingY}], busy, meeting }
    this.coffeeSpots = [];      // { floor, x, z, facingY, label }
    this.loungeSpots = [];      // { floor, x, z, facingY, label, occupiedBy }
    this.rooftopSpots = [];     // { floor, x, z, facingY, occupiedBy }
    this.receptionDesk = null;

    this.viewMode = 'cutaway'; // 'cutaway' | 'glass' | 'isolate'
    this.isolatedFloor = null;

    this._initMaterials();
    this._buildStructureAndFloors();
    this._buildElevatorShafts();
    this._buildEntranceCanopy();
    this.setViewMode('cutaway', null);
  }

  Building.prototype._initMaterials = function () {
    this.mats = {
      steelDark: new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.35, metalness: 0.72 }),
      steelLight: new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.3, metalness: 0.75 }),
      concrete: new THREE.MeshStandardMaterial({ color: 0xdbe0e6, roughness: 0.85, metalness: 0.05 }),
      wallWhite: new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.85 }),
      wallWarm: new THREE.MeshStandardMaterial({ color: 0xe7e2d8, roughness: 0.85 }),
      glassFacade: new THREE.MeshPhysicalMaterial({
        color: 0x93c5fd,
        roughness: 0.08,
        metalness: 0.15,
        transparent: true,
        opacity: 0.32,
        side: THREE.DoubleSide
      }),
      glassPartition: new THREE.MeshStandardMaterial({
        color: 0xbae6fd,
        roughness: 0.1,
        metalness: 0.1,
        transparent: true,
        opacity: 0.28,
        side: THREE.DoubleSide
      }),
      woodDesk: new THREE.MeshStandardMaterial({ color: 0xc8a379, roughness: 0.65 }),
      woodWalnut: new THREE.MeshStandardMaterial({ color: 0x5c3a21, roughness: 0.55 }),
      deskWhite: new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.5 }),
      chairDark: new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.75 }),
      chairAccent: new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.75 }),
      sofaFabric: new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.88 }),
      sofaWarm: new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.85 }),
      plantPot: new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.6 }),
      plantLeaf: new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.82 }),
      monitorFrame: new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.4, metalness: 0.5 }),
      screenCode: new THREE.MeshStandardMaterial({
        map: OfficeSim.Textures.get('screenCode'),
        emissive: 0x38bdf8,
        emissiveMap: OfficeSim.Textures.get('screenCode'),
        emissiveIntensity: 0.55,
        roughness: 0.2
      }),
      screenChart: new THREE.MeshStandardMaterial({
        map: OfficeSim.Textures.get('screenChart'),
        emissive: 0xffffff,
        emissiveMap: OfficeSim.Textures.get('screenChart'),
        emissiveIntensity: 0.45,
        roughness: 0.2
      }),
      whiteboard: new THREE.MeshStandardMaterial({
        map: OfficeSim.Textures.get('whiteboard'),
        roughness: 0.3
      }),
      elevatorDoor: new THREE.MeshStandardMaterial({ color: 0xb0bac5, roughness: 0.28, metalness: 0.82 })
    };
  };

  Building.prototype._buildStructureAndFloors = function () {
    var W = CFG.BUILDING_WIDTH;
    var D = CFG.BUILDING_DEPTH;
    var H = CFG.FLOOR_HEIGHT;
    var T = CFG.SLAB_THICKNESS;

    for (var f = 0; f <= CFG.ROOF_FLOOR; f++) {
      var fg = new THREE.Group();
      fg.position.y = f * H;
      this.root.add(fg);
      this.floorGroups.push(fg);

      var floorMeta = OfficeSim.FLOORS[f];

      // Floor Slab
      var floorTex = OfficeSim.Textures.get(floorMeta.floorStyle);
      var slabTopMat = new THREE.MeshStandardMaterial({
        map: floorTex,
        roughness: f === 0 ? 0.35 : 0.78,
        metalness: f === 0 ? 0.1 : 0.02
      });
      var slabMats = [
        this.mats.steelDark, // +X edge
        this.mats.steelDark, // -X edge
        slabTopMat,          // +Y top
        this.mats.wallWhite, // -Y ceiling of floor below
        this.mats.steelDark, // +Z edge
        this.mats.steelDark  // -Z edge
      ];
      var slab = new THREE.Mesh(new THREE.BoxGeometry(W, T, D), slabMats);
      slab.position.y = -T / 2;
      slab.receiveShadow = true;
      slab.castShadow = true;
      fg.add(slab);

      if (f < CFG.ROOF_FLOOR) {
        // Structural perimeter columns
        var colCoords = [
          [-W / 2 + 0.3, -D / 2 + 0.3], [-W / 4, -D / 2 + 0.3], [W / 4, -D / 2 + 0.3], [W / 2 - 0.3, -D / 2 + 0.3],
          [-W / 2 + 0.3, D / 2 - 0.3], [-W / 4, D / 2 - 0.3], [W / 4, D / 2 - 0.3], [W / 2 - 0.3, D / 2 - 0.3]
        ];
        for (var c = 0; c < colCoords.length; c++) {
          var col = new THREE.Mesh(new THREE.BoxGeometry(0.45, H - T, 0.45), this.mats.steelDark);
          col.position.set(colCoords[c][0], (H - T) / 2, colCoords[c][1]);
          col.castShadow = true;
          fg.add(col);
        }

        // Back wall (-Z) & Left wall (-X) — always present for clean architectural enclosure
        var backWall = new THREE.Mesh(new THREE.BoxGeometry(W - 0.4, H - T, 0.24), this.mats.wallWarm);
        backWall.position.set(0, (H - T) / 2, -D / 2 + 0.15);
        backWall.receiveShadow = true;
        fg.add(backWall);

        var leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.24, H - T, D - 0.4), this.mats.glassPartition);
        leftWall.position.set(-W / 2 + 0.15, (H - T) / 2, 0);
        fg.add(leftWall);

        // Front (+Z) & Right (+X) Curtain Glass Walls (hidden in cutaway mode)
        if (f > 0) {
          var frontGlass = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.5, H - T), this.mats.glassFacade);
          frontGlass.position.set(0, (H - T) / 2, D / 2 - 0.1);
          fg.add(frontGlass);
          this.cutawayMeshes.push(frontGlass);
        } else {
          // Lobby front facade with open center entrance (x: -2.4..+2.4)
          var frontL = new THREE.Mesh(new THREE.PlaneGeometry(W / 2 - 2.6, H - T), this.mats.glassFacade);
          frontL.position.set(-W / 4 - 1.2, (H - T) / 2, D / 2 - 0.1);
          fg.add(frontL);
          this.cutawayMeshes.push(frontL);

          var frontR = new THREE.Mesh(new THREE.PlaneGeometry(W / 2 - 2.6, H - T), this.mats.glassFacade);
          frontR.position.set(W / 4 + 1.2, (H - T) / 2, D / 2 - 0.1);
          fg.add(frontR);
          this.cutawayMeshes.push(frontR);

          // Animated sliding lobby glass doors
          var doorMat = new THREE.MeshPhysicalMaterial({
            color: 0xe0f2fe, roughness: 0.1, transparent: true, opacity: 0.45
          });
          var dLeft = new THREE.Mesh(new THREE.BoxGeometry(2.2, H - T - 0.2, 0.08), doorMat);
          dLeft.position.set(-1.1, (H - T) / 2, D / 2 - 0.1);
          fg.add(dLeft);
          var dRight = new THREE.Mesh(new THREE.BoxGeometry(2.2, H - T - 0.2, 0.08), doorMat);
          dRight.position.set(1.1, (H - T) / 2, D / 2 - 0.1);
          fg.add(dRight);
          this.lobbyDoors = { left: dLeft, right: dRight, openAmount: 0 };
        }

        var rightGlass = new THREE.Mesh(new THREE.PlaneGeometry(D - 0.5, H - T), this.mats.glassFacade);
        rightGlass.rotation.y = Math.PI / 2;
        rightGlass.position.set(W / 2 - 0.1, (H - T) / 2, 0);
        fg.add(rightGlass);
        this.cutawayMeshes.push(rightGlass);

        // Ceiling recessed LED light panels
        var ledMat = new THREE.MeshStandardMaterial({
          color: 0xffffff,
          emissive: 0xfff8e7,
          emissiveIntensity: 0.5
        });
        this.ceilingEmissives.push(ledMat);
        for (var lx = -9; lx <= 9; lx += 9) {
          var strip = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.05, 0.5), ledMat);
          strip.position.set(lx, H - T - 0.04, 2.5);
          fg.add(strip);
        }

        // Interior warm point light per floor (for evening glow)
        var pt = new THREE.PointLight(0xffe8c2, 0.28, 26, 1.6);
        pt.position.set(0, H - 0.9, 1.5);
        fg.add(pt);
        this.floorLights.push(pt);

        // Glass stairwell core (visual detail at x: -6.8..-4.2, z: -8.6..-5.5)
        this._buildStairwellSegment(fg);

        // Restroom / Utility core block (x: +4.2..+7.4, z: -8.6..-5.5)
        var coreBlock = new THREE.Mesh(new THREE.BoxGeometry(3.2, H - T, 3.0), this.mats.wallWhite);
        coreBlock.position.set(5.8, (H - T) / 2, -7.1);
        coreBlock.receiveShadow = true;
        fg.add(coreBlock);

        // Floor-specific furnishings
        if (f === 0) this._furnishLobby(fg);
        else if (f === 1) this._furnishCafe(fg);
        else if (f === 2) this._furnishEngineering(fg);
        else if (f === 3) this._furnishDesignStudio(fg);
        else if (f === 4) this._furnishOperations(fg);
        else if (f === 5) this._furnishExecutive(fg);
      } else {
        this._furnishRooftop(fg);
      }
    }
  };

  Building.prototype._buildStairwellSegment = function (fg) {
    var H = CFG.FLOOR_HEIGHT - CFG.SLAB_THICKNESS;
    // Glass front enclosure
    var glass = new THREE.Mesh(new THREE.BoxGeometry(2.6, H, 0.08), this.mats.glassPartition);
    glass.position.set(-5.5, H / 2, -5.5);
    fg.add(glass);

    // Stylized stair treads climbing up
    var steps = 9;
    for (var i = 0; i < steps; i++) {
      var tread = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.12, 0.34), this.mats.steelLight);
      tread.position.set(-5.9 + (i % 2 === 0 ? 0 : 0.05), 0.25 + i * (H / steps), -6.0 - i * 0.25);
      fg.add(tread);
    }
  };

  Building.prototype._buildElevatorShafts = function () {
    var H = CFG.FLOOR_HEIGHT;
    var totalH = CFG.ROOF_FLOOR * H + 3.4;

    // Shaft structural vertical rails & glass backing
    for (var s = 0; s < CFG.ELEVATOR_X.length; s++) {
      var sx = CFG.ELEVATOR_X[s];
      var sz = CFG.ELEVATOR_Z;

      // Vertical guide rails
      for (var side = -1; side <= 1; side += 2) {
        var rail = new THREE.Mesh(new THREE.BoxGeometry(0.1, totalH, 0.1), this.mats.steelLight);
        rail.position.set(sx + side * 1.18, totalH / 2, sz);
        this.root.add(rail);
      }

      // Shaft side dividers (semi-transparent so cabs are clearly visible!)
      var sideWall = new THREE.Mesh(new THREE.BoxGeometry(0.08, totalH, 2.4), this.mats.glassPartition);
      sideWall.position.set(sx + (s === 0 ? -1.25 : 1.25), totalH / 2, sz);
      this.root.add(sideWall);
    }

    // Center pillar between the two shafts
    var midPillar = new THREE.Mesh(new THREE.BoxGeometry(0.32, totalH, 2.5), this.mats.steelDark);
    midPillar.position.set(0, totalH / 2, CFG.ELEVATOR_Z);
    this.root.add(midPillar);

    // Per-floor elevator door frames, sliding doors, and hall call lanterns
    for (var f = 0; f <= CFG.ROOF_FLOOR; f++) {
      this.shaftDoors[f] = [];
      var fg = this.floorGroups[f];
      var doorH = 2.5;
      var headerH = (f === CFG.ROOF_FLOOR ? 0.9 : CFG.FLOOR_HEIGHT - CFG.SLAB_THICKNESS - doorH);

      for (var si = 0; si < CFG.ELEVATOR_X.length; si++) {
        var ex = CFG.ELEVATOR_X[si];
        var dz = CFG.ELEVATOR_DOOR_Z;

        // Top transom header over door
        var header = new THREE.Mesh(new THREE.BoxGeometry(2.4, headerH, 0.2), this.mats.steelDark);
        header.position.set(ex, doorH + headerH / 2, dz);
        fg.add(header);

        // Sliding left & right hall doors
        var doorL = new THREE.Mesh(new THREE.BoxGeometry(1.08, doorH, 0.08), this.mats.elevatorDoor);
        doorL.position.set(ex - 0.55, doorH / 2, dz);
        fg.add(doorL);

        var doorR = new THREE.Mesh(new THREE.BoxGeometry(1.08, doorH, 0.08), this.mats.elevatorDoor);
        doorR.position.set(ex + 0.55, doorH / 2, dz);
        fg.add(doorR);

        // Hall call lantern lights (green up, amber down)
        var upMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, emissive: 0x34d399, emissiveIntensity: 0 });
        var downMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, emissive: 0xf59e0b, emissiveIntensity: 0 });
        var upBulb = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.06), upMat);
        upBulb.position.set(ex - 0.16, doorH + 0.25, dz + 0.12);
        fg.add(upBulb);

        var downBulb = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.06), downMat);
        downBulb.position.set(ex + 0.16, doorH + 0.25, dz + 0.12);
        fg.add(downBulb);

        this.shaftDoors[f].push({
          baseX: ex,
          left: doorL,
          right: doorR,
          upMat: upMat,
          downMat: downMat
        });
      }
    }
  };

  Building.prototype._buildEntranceCanopy = function () {
    var D = CFG.BUILDING_DEPTH;
    var canopy = new THREE.Mesh(new THREE.BoxGeometry(9.5, 0.26, 3.6), this.mats.steelDark);
    canopy.position.set(0, 3.85, D / 2 + 1.7);
    canopy.castShadow = true;
    this.root.add(canopy);

    // Support columns for canopy
    for (var s = -1; s <= 1; s += 2) {
      var post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3.8, 10), this.mats.steelLight);
      post.position.set(s * 4.2, 1.9, D / 2 + 3.1);
      post.castShadow = true;
      this.root.add(post);
    }

    // Illuminated architectural sign on canopy fascia
    var canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 96;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, 512, 96);
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 46px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('APEX TOWER', 256, 50);
    var signTex = new THREE.CanvasTexture(canvas);
    var signMat = new THREE.MeshStandardMaterial({
      map: signTex,
      emissive: 0x93c5fd,
      emissiveMap: signTex,
      emissiveIntensity: 0.45
    });
    var signMesh = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 0.9), signMat);
    signMesh.position.set(0, 4.35, D / 2 + 3.46);
    this.root.add(signMesh);
  };

  // --- Reusable Furniture Helpers ---

  Building.prototype._addPlant = function (fg, x, z, scale) {
    var s = scale || 1;
    var pot = new THREE.Mesh(new THREE.CylinderGeometry(0.32 * s, 0.24 * s, 0.55 * s, 10), this.mats.plantPot);
    pot.position.set(x, 0.28 * s, z);
    pot.castShadow = true;
    fg.add(pot);

    var foliage = new THREE.Mesh(new THREE.DodecahedronGeometry(0.52 * s, 1), this.mats.plantLeaf);
    foliage.position.set(x, 0.95 * s, z);
    foliage.castShadow = true;
    fg.add(foliage);
  };

  Building.prototype._addChair = function (fg, x, z, rotY, accentMat) {
    var g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rotY || 0;
    var m = accentMat || this.mats.chairDark;

    var base = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.24, 0.42, 8), this.mats.steelDark);
    base.position.y = 0.21;
    g.add(base);

    var seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.48), m);
    seat.position.y = 0.45;
    seat.castShadow = true;
    g.add(seat);

    var back = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.48, 0.08), m);
    back.position.set(0, 0.72, -0.22);
    back.castShadow = true;
    g.add(back);

    fg.add(g);
  };

  Building.prototype._addWorkstation = function (fg, floor, x, z, facingZ, dualMonitor, dept) {
    // facingZ = +1 means worker sits at z - 0.65 facing +Z; facingZ = -1 means sits at z + 0.65 facing -Z
    var g = new THREE.Group();
    g.position.set(x, 0, z);

    var deskTop = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.07, 0.8), this.mats.woodDesk);
    deskTop.position.y = 0.74;
    deskTop.castShadow = true;
    deskTop.receiveShadow = true;
    g.add(deskTop);

    for (var s = -1; s <= 1; s += 2) {
      var leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.72, 0.68), this.mats.steelDark);
      leg.position.set(s * 0.74, 0.36, 0);
      g.add(leg);
    }

    // Monitor(s)
    var monZ = facingZ * 0.2;
    var screenMat = (Math.random() > 0.4) ? this.mats.screenCode : this.mats.screenChart;
    var count = dualMonitor ? 2 : 1;
    for (var i = 0; i < count; i++) {
      var mx = count === 2 ? (i === 0 ? -0.34 : 0.34) : 0;
      var stand = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 0.08), this.mats.monitorFrame);
      stand.position.set(mx, 0.88, monZ);
      g.add(stand);

      var bezel = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.36, 0.04), this.mats.monitorFrame);
      bezel.position.set(mx, 1.06, monZ);
      g.add(bezel);

      var screen = new THREE.Mesh(new THREE.PlaneGeometry(0.54, 0.32), screenMat);
      screen.position.set(mx, 1.06, monZ - facingZ * 0.025);
      if (facingZ > 0) screen.rotation.y = Math.PI;
      g.add(screen);
    }

    fg.add(g);

    var chairZ = z - facingZ * 0.68;
    var chairRotY = facingZ > 0 ? 0 : Math.PI;
    this._addChair(fg, x, chairZ, chairRotY);

    this.workstations.push({
      id: 'ws_' + floor + '_' + this.workstations.length,
      floor: floor,
      x: x,
      z: z,
      chairX: x,
      chairZ: chairZ,
      facingY: chairRotY,
      occupant: null,
      dept: dept
    });
  };

  Building.prototype._addCoffeeBar = function (fg, floor, x, z, label) {
    var counter = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.95, 0.85), this.mats.woodWalnut);
    counter.position.set(x, 0.48, z);
    counter.castShadow = true;
    counter.receiveShadow = true;
    fg.add(counter);

    var top = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.08, 0.92), this.mats.deskWhite);
    top.position.set(x, 0.98, z);
    fg.add(top);

    // Espresso machine
    var machine = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.52, 0.48), this.mats.steelLight);
    machine.position.set(x - 0.8, 1.28, z - 0.1);
    machine.castShadow = true;
    fg.add(machine);

    // Mug stack / dispenser
    var dispenser = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.42, 10), this.mats.steelDark);
    dispenser.position.set(x + 0.7, 1.23, z - 0.1);
    fg.add(dispenser);

    this.coffeeSpots.push({
      floor: floor,
      x: x,
      z: z + 1.05,
      facingY: Math.PI,
      label: label || 'Coffee Bar'
    });
  };

  Building.prototype._addSofa = function (fg, floor, x, z, rotY, mat, label) {
    var g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rotY || 0;
    var sm = mat || this.mats.sofaFabric;

    var base = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.42, 0.85), sm);
    base.position.y = 0.24;
    base.castShadow = true;
    g.add(base);

    var back = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.46, 0.2), sm);
    back.position.set(0, 0.62, -0.32);
    back.castShadow = true;
    g.add(back);

    for (var s = -1; s <= 1; s += 2) {
      var arm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.32, 0.85), sm);
      arm.position.set(s * 0.96, 0.5, 0);
      g.add(arm);
    }
    fg.add(g);

    var spot = {
      floor: floor,
      x: x,
      z: z,
      facingY: rotY || 0,
      label: label || 'Lounge',
      occupiedBy: null
    };
    if (floor === CFG.ROOF_FLOOR) {
      this.rooftopSpots.push(spot);
    } else {
      this.loungeSpots.push(spot);
    }
  };

  // --- Floor Furnishings ---

  Building.prototype._furnishLobby = function (fg) {
    // Grand reception desk on left-front
    var desk = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.05, 1.1), this.mats.woodWalnut);
    desk.position.set(-8.5, 0.52, 3.6);
    desk.castShadow = true;
    fg.add(desk);
    var deskTop = new THREE.Mesh(new THREE.BoxGeometry(4.35, 0.1, 1.2), this.mats.deskWhite);
    deskTop.position.set(-8.5, 1.08, 3.6);
    fg.add(deskTop);
    this._addChair(fg, -8.5, 2.5, 0);
    this.receptionDesk = { floor: 0, x: -8.5, z: 2.5, facingY: 0 };
    this.workstations.push({
      id: 'ws_reception',
      floor: 0,
      x: -8.5,
      z: 3.6,
      chairX: -8.5,
      chairZ: 2.5,
      facingY: 0,
      occupant: null,
      dept: 'Reception'
    });

    // Security turnstiles across center lobby (z = +1.5)
    var turnX = [-3.6, -1.2, 1.2, 3.6];
    for (var i = 0; i < turnX.length; i++) {
      var ped = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.98, 1.15), this.mats.steelLight);
      ped.position.set(turnX[i], 0.49, 1.5);
      ped.castShadow = true;
      fg.add(ped);
      var led = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.05, 0.18),
        new THREE.MeshBasicMaterial({ color: 0x34d399 })
      );
      led.position.set(turnX[i], 1.0, 1.9);
      fg.add(led);
    }

    // Lobby Lounge Seating on right-front
    this._addSofa(fg, 0, 8.8, 2.2, 0, this.mats.sofaWarm, 'Lobby Lounge');
    this._addSofa(fg, 0, 8.8, 5.4, Math.PI, this.mats.sofaWarm, 'Lobby Lounge');
    var coffeeTbl = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.4, 0.9), this.mats.woodWalnut);
    coffeeTbl.position.set(8.8, 0.2, 3.8);
    fg.add(coffeeTbl);

    // Lobby Espresso Kiosk at back-left
    this._addCoffeeBar(fg, 0, -10.5, -7.2, 'Lobby Espresso Kiosk');

    // Architectural Ficus Plants
    this._addPlant(fg, -12.2, 7.2, 1.4);
    this._addPlant(fg, 12.2, 7.2, 1.4);
    this._addPlant(fg, -5.2, 7.4, 1.1);
    this._addPlant(fg, 5.2, 7.4, 1.1);
  };

  Building.prototype._furnishCafe = function (fg) {
    // Full Café Espresso Bar back-left
    this._addCoffeeBar(fg, 1, -10.5, -7.2, '1F Café Bar');
    // Second refreshment station back-right
    this._addCoffeeBar(fg, 1, 10.5, -7.2, '1F Snack Station');

    // Bistro dining tables in left & center
    var tableCoords = [
      [-10.2, 1.5], [-5.8, 1.5], [-1.4, 1.5],
      [-10.2, 5.6], [-5.8, 5.6], [-1.4, 5.6]
    ];
    for (var i = 0; i < tableCoords.length; i++) {
      var tx = tableCoords[i][0], tz = tableCoords[i][1];
      var tbl = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.08, 18), this.mats.woodDesk);
      tbl.position.set(tx, 0.74, tz);
      tbl.castShadow = true;
      fg.add(tbl);
      var ped = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.32, 0.72, 10), this.mats.steelDark);
      ped.position.set(tx, 0.36, tz);
      fg.add(ped);

      this._addChair(fg, tx - 0.95, tz, Math.PI / 2, this.mats.chairAccent);
      this._addChair(fg, tx + 0.95, tz, -Math.PI / 2, this.mats.chairAccent);

      this.loungeSpots.push({ floor: 1, x: tx - 0.95, z: tz, facingY: Math.PI / 2, label: 'Café Table', occupiedBy: null });
      this.loungeSpots.push({ floor: 1, x: tx + 0.95, z: tz, facingY: -Math.PI / 2, label: 'Café Table', occupiedBy: null });
    }

    // Commons Lounge Sofas on right side
    var rug = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 6.2), new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.95 }));
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(8.2, 0.02, 3.6);
    fg.add(rug);

    this._addSofa(fg, 1, 8.2, 1.4, 0, this.mats.sofaFabric, 'Commons Lounge');
    this._addSofa(fg, 1, 8.2, 5.8, Math.PI, this.mats.sofaFabric, 'Commons Lounge');
    var lowTbl = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.38, 1.0), this.mats.woodDesk);
    lowTbl.position.set(8.2, 0.19, 3.6);
    fg.add(lowTbl);

    this._addPlant(fg, 12.4, 7.2, 1.2);
    this._addPlant(fg, -12.4, 7.2, 1.2);
  };

  Building.prototype._furnishEngineering = function (fg) {
    // 12 Engineering Workstations (left bay & right bay)
    var xsLeft = [-11.2, -8.4, -5.6];
    var xsRight = [5.6, 8.4, 11.2];
    for (var i = 0; i < 3; i++) {
      this._addWorkstation(fg, 2, xsLeft[i], 1.2, 1, true, 'Engineering');
      this._addWorkstation(fg, 2, xsLeft[i], 5.6, -1, true, 'Engineering');
      this._addWorkstation(fg, 2, xsRight[i], 1.2, 1, true, 'Engineering');
      this._addWorkstation(fg, 2, xsRight[i], 5.6, -1, true, 'Engineering');
    }

    // Center Glass Huddle Room ("Sprint Room 2A")
    var H = CFG.FLOOR_HEIGHT - CFG.SLAB_THICKNESS;
    var wallL = new THREE.Mesh(new THREE.BoxGeometry(0.08, H, 6.4), this.mats.glassPartition);
    wallL.position.set(-2.9, H / 2, 4.4);
    fg.add(wallL);
    var wallR = new THREE.Mesh(new THREE.BoxGeometry(0.08, H, 6.4), this.mats.glassPartition);
    wallR.position.set(2.9, H / 2, 4.4);
    fg.add(wallR);
    // Front partition with center doorway gap
    var partL = new THREE.Mesh(new THREE.BoxGeometry(2.0, H, 0.08), this.mats.glassPartition);
    partL.position.set(-1.9, H / 2, 1.2);
    fg.add(partL);
    var partR = new THREE.Mesh(new THREE.BoxGeometry(2.0, H, 0.08), this.mats.glassPartition);
    partR.position.set(1.9, H / 2, 1.2);
    fg.add(partR);

    // Huddle Table & Whiteboard
    var hTable = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.08, 3.2), this.mats.deskWhite);
    hTable.position.set(0, 0.74, 4.6);
    hTable.castShadow = true;
    fg.add(hTable);
    var wb = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.2, 0.06), this.mats.whiteboard);
    wb.position.set(0, 1.65, 7.45);
    fg.add(wb);

    var seats = [];
    var seatCoords = [
      [-1.55, 3.7, Math.PI / 2], [-1.55, 5.2, Math.PI / 2],
      [1.55, 3.7, -Math.PI / 2], [1.55, 5.2, -Math.PI / 2]
    ];
    for (var s = 0; s < seatCoords.length; s++) {
      this._addChair(fg, seatCoords[s][0], seatCoords[s][1], seatCoords[s][2], this.mats.chairAccent);
      seats.push({ x: seatCoords[s][0], z: seatCoords[s][1], facingY: seatCoords[s][2] });
    }
    this.meetingRooms.push({
      id: 'room_2a',
      name: 'Sprint Room 2A',
      floor: 2,
      doorX: 0,
      doorZ: 0.4,
      presenterSpot: { x: 0, z: 6.6, facingY: Math.PI },
      seats: seats,
      busy: false,
      meeting: null
    });

    // Server Rack Room in back-right (with blinking LEDs!)
    for (var r = 0; r < 3; r++) {
      var rack = new THREE.Mesh(new THREE.BoxGeometry(0.85, 2.3, 0.9), this.mats.steelDark);
      rack.position.set(9.4 + r * 1.1, 1.15, -7.4);
      rack.castShadow = true;
      fg.add(rack);
      var ledMat = new THREE.MeshBasicMaterial({ color: r === 1 ? 0x38bdf8 : 0x34d399 });
      var led = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.08, 0.05), ledMat);
      led.position.set(9.4 + r * 1.1, 1.85, -6.92);
      fg.add(led);
      this.serverLeds.push({ mat: ledMat, phase: r * 1.7 });
    }

    // Coffee bar back-left
    this._addCoffeeBar(fg, 2, -10.5, -7.2, '2F Eng Coffee Bar');
  };

  Building.prototype._furnishDesignStudio = function (fg) {
    // 8 Spacious Design Desks on Left
    var xs = [-11.2, -8.2, -5.2, -2.2];
    for (var i = 0; i < xs.length; i++) {
      this._addWorkstation(fg, 3, xs[i], 1.3, 1, false, 'Design');
      this._addWorkstation(fg, 3, xs[i], 5.6, -1, false, 'Design');
    }

    // Large Glass Conference Room "Studio 3A" on Right (x: +3.2..+12.8, z: +0.6..+7.8)
    var H = CFG.FLOOR_HEIGHT - CFG.SLAB_THICKNESS;
    var leftGlass = new THREE.Mesh(new THREE.BoxGeometry(0.08, H, 5.2), this.mats.glassPartition);
    leftGlass.position.set(3.2, H / 2, 5.0);
    fg.add(leftGlass);
    var frontGlass = new THREE.Mesh(new THREE.BoxGeometry(9.4, H, 0.08), this.mats.glassPartition);
    frontGlass.position.set(7.9, H / 2, 0.6);
    fg.add(frontGlass);

    // Conference Table
    var confTbl = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.09, 2.2), this.mats.woodDesk);
    confTbl.position.set(8.0, 0.74, 4.3);
    confTbl.castShadow = true;
    fg.add(confTbl);

    // Presentation Display Screen on right wall
    var tvFrame = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.45, 2.6), this.mats.monitorFrame);
    tvFrame.position.set(12.6, 1.7, 4.3);
    fg.add(tvFrame);
    var tvScreen = new THREE.Mesh(new THREE.PlaneGeometry(2.45, 1.3), this.mats.screenChart);
    tvScreen.rotation.y = -Math.PI / 2;
    tvScreen.position.set(12.52, 1.7, 4.3);
    fg.add(tvScreen);

    var seats = [];
    var seatXs = [6.0, 7.6, 9.2];
    for (var j = 0; j < seatXs.length; j++) {
      this._addChair(fg, seatXs[j], 2.75, 0, this.mats.chairAccent);
      seats.push({ x: seatXs[j], z: 2.75, facingY: 0 });
      this._addChair(fg, seatXs[j], 5.85, Math.PI, this.mats.chairAccent);
      seats.push({ x: seatXs[j], z: 5.85, facingY: Math.PI });
    }
    this.meetingRooms.push({
      id: 'room_3a',
      name: 'Studio 3A Conf',
      floor: 3,
      doorX: 2.6,
      doorZ: 1.5,
      presenterSpot: { x: 11.4, z: 4.3, facingY: -Math.PI / 2 },
      seats: seats,
      busy: false,
      meeting: null
    });

    this._addCoffeeBar(fg, 3, -10.5, -7.2, '3F Studio Tea & Coffee');
    this._addPlant(fg, 1.2, 7.2, 1.2);
  };

  Building.prototype._furnishOperations = function (fg) {
    // 12 Operations & Sales Workstations
    var xsLeft = [-11.2, -8.4, -5.6];
    var xsRight = [5.6, 8.4, 11.2];
    for (var i = 0; i < 3; i++) {
      this._addWorkstation(fg, 4, xsLeft[i], 1.2, 1, false, 'Operations');
      this._addWorkstation(fg, 4, xsLeft[i], 5.6, -1, false, 'Operations');
      this._addWorkstation(fg, 4, xsRight[i], 1.2, 1, false, 'Operations');
      this._addWorkstation(fg, 4, xsRight[i], 5.6, -1, false, 'Operations');
    }

    // Two Acoustic Phone Booths in center-front
    var boothXs = [-1.6, 1.6];
    for (var b = 0; b < boothXs.length; b++) {
      var bx = boothXs[b];
      var booth = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.35, 1.5), this.mats.glassPartition);
      booth.position.set(bx, 1.18, 6.6);
      fg.add(booth);
      var roof = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.12, 1.56), this.mats.steelDark);
      roof.position.set(bx, 2.4, 6.6);
      fg.add(roof);
      this.loungeSpots.push({ floor: 4, x: bx, z: 6.6, facingY: Math.PI, label: 'Phone Booth', occupiedBy: null });
    }

    // Small Collaboration Table in center
    var collab = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.08, 20), this.mats.woodDesk);
    collab.position.set(0, 0.74, 2.6);
    fg.add(collab);
    this._addChair(fg, -1.2, 2.6, Math.PI / 2);
    this._addChair(fg, 1.2, 2.6, -Math.PI / 2);

    this._addCoffeeBar(fg, 4, -10.5, -7.2, '4F Kitchenette');
  };

  Building.prototype._furnishExecutive = function (fg) {
    var H = CFG.FLOOR_HEIGHT - CFG.SLAB_THICKNESS;

    // Executive Corner Office Left
    var divL = new THREE.Mesh(new THREE.BoxGeometry(0.08, H, 7.0), this.mats.glassPartition);
    divL.position.set(-5.2, H / 2, 4.4);
    fg.add(divL);
    this._addWorkstation(fg, 5, -9.2, 4.4, 1, true, 'Executive');
    this._addPlant(fg, -12.4, 7.2, 1.3);

    // Executive Corner Office Right
    var divR = new THREE.Mesh(new THREE.BoxGeometry(0.08, H, 7.0), this.mats.glassPartition);
    divR.position.set(5.2, H / 2, 4.4);
    fg.add(divR);
    this._addWorkstation(fg, 5, 9.2, 4.4, 1, true, 'Executive');
    this._addPlant(fg, 12.4, 7.2, 1.3);

    // Grand Center Boardroom (x: -4.4..+4.4, z: +0.8..+7.8)
    var brFrontL = new THREE.Mesh(new THREE.BoxGeometry(3.2, H, 0.08), this.mats.glassPartition);
    brFrontL.position.set(-2.8, H / 2, 0.8);
    fg.add(brFrontL);
    var brFrontR = new THREE.Mesh(new THREE.BoxGeometry(3.2, H, 0.08), this.mats.glassPartition);
    brFrontR.position.set(2.8, H / 2, 0.8);
    fg.add(brFrontR);

    var boardTbl = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.1, 4.6), this.mats.woodWalnut);
    boardTbl.position.set(0, 0.75, 4.5);
    boardTbl.castShadow = true;
    fg.add(boardTbl);

    var brScreen = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.4, 0.08), this.mats.screenChart);
    brScreen.position.set(0, 1.75, 7.8);
    fg.add(brScreen);

    var seats = [];
    var zs = [3.0, 4.5, 6.0];
    for (var i = 0; i < zs.length; i++) {
      this._addChair(fg, -1.6, zs[i], Math.PI / 2, this.mats.chairDark);
      seats.push({ x: -1.6, z: zs[i], facingY: Math.PI / 2 });
      this._addChair(fg, 1.6, zs[i], -Math.PI / 2, this.mats.chairDark);
      seats.push({ x: 1.6, z: zs[i], facingY: -Math.PI / 2 });
    }
    this.meetingRooms.push({
      id: 'room_5_board',
      name: 'Executive Boardroom',
      floor: 5,
      doorX: 0,
      doorZ: 0.2,
      presenterSpot: { x: 0, z: 7.1, facingY: Math.PI },
      seats: seats,
      busy: false,
      meeting: null
    });

    this._addCoffeeBar(fg, 5, -10.5, -7.2, '5F Executive Espresso');
  };

  Building.prototype._furnishRooftop = function (fg) {
    var W = CFG.BUILDING_WIDTH;
    var D = CFG.BUILDING_DEPTH;

    // Elevator Penthouse Roof & Walls
    var phRoof = new THREE.Mesh(new THREE.BoxGeometry(10.6, 0.35, 4.8), this.mats.steelDark);
    phRoof.position.set(0, 3.45, -6.7);
    phRoof.castShadow = true;
    fg.add(phRoof);

    var phBack = new THREE.Mesh(new THREE.BoxGeometry(10.4, 3.4, 0.25), this.mats.steelDark);
    phBack.position.set(0, 1.7, -8.9);
    fg.add(phBack);

    // Glass Perimeter Safety Railings
    var railH = 1.15;
    var rFront = new THREE.Mesh(new THREE.BoxGeometry(W - 0.3, railH, 0.08), this.mats.glassPartition);
    rFront.position.set(0, railH / 2, D / 2 - 0.15);
    fg.add(rFront);
    var rBack = new THREE.Mesh(new THREE.BoxGeometry(W - 0.3, railH, 0.08), this.mats.glassPartition);
    rBack.position.set(0, railH / 2, -D / 2 + 0.15);
    fg.add(rBack);
    var rLeft = new THREE.Mesh(new THREE.BoxGeometry(0.08, railH, D - 0.3), this.mats.glassPartition);
    rLeft.position.set(-W / 2 + 0.15, railH / 2, 0);
    fg.add(rLeft);
    var rRight = new THREE.Mesh(new THREE.BoxGeometry(0.08, railH, D - 0.3), this.mats.glassPartition);
    rRight.position.set(W / 2 - 0.15, railH / 2, 0);
    fg.add(rRight);

    // Cedar Pergola on Left
    var pCoords = [[-11.5, 1.0], [-4.5, 1.0], [-11.5, 6.5], [-4.5, 6.5]];
    for (var i = 0; i < pCoords.length; i++) {
      var post = new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.9, 0.22), this.mats.woodWalnut);
      post.position.set(pCoords[i][0], 1.45, pCoords[i][1]);
      post.castShadow = true;
      fg.add(post);
    }
    for (var sl = 0; sl < 9; sl++) {
      var beam = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.12, 0.16), this.mats.woodWalnut);
      beam.position.set(-8.0, 2.92, 1.0 + sl * 0.68);
      beam.castShadow = true;
      fg.add(beam);
    }
    this._addSofa(fg, 6, -8.0, 2.2, 0, this.mats.sofaWarm, 'Rooftop Pergola');
    this._addSofa(fg, 6, -8.0, 5.2, Math.PI, this.mats.sofaWarm, 'Rooftop Pergola');

    // Outdoor Café Tables on Right
    var rtTables = [[6.5, 2.5], [10.5, 2.5], [8.5, 5.8]];
    for (var t = 0; t < rtTables.length; t++) {
      var tx = rtTables[t][0], tz = rtTables[t][1];
      var tbl = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.08, 16), this.mats.woodDesk);
      tbl.position.set(tx, 0.75, tz);
      fg.add(tbl);
      var leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.25, 0.72, 8), this.mats.steelDark);
      leg.position.set(tx, 0.36, tz);
      fg.add(leg);
      this._addChair(fg, tx - 0.95, tz, Math.PI / 2, this.mats.sofaWarm);
      this.rooftopSpots.push({ floor: 6, x: tx - 0.95, z: tz, facingY: Math.PI / 2, occupiedBy: null });
    }

    // Lush Perimeter Planters
    var plantSpots = [[-12.5, 7.6], [-2.0, 7.6], [2.0, 7.6], [12.5, 7.6], [-12.5, -1.5], [12.5, -1.5]];
    for (var p = 0; p < plantSpots.length; p++) {
      this._addPlant(fg, plantSpots[p][0], plantSpots[p][1], 1.25);
    }

    // Mechanical HVAC Units with spinning fans (back-right)
    for (var h = 0; h < 2; h++) {
      var hx = 8.4 + h * 3.0;
      var unit = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.4, 2.0), this.mats.steelLight);
      unit.position.set(hx, 0.7, -6.8);
      unit.castShadow = true;
      fg.add(unit);

      var fanGroup = new THREE.Group();
      fanGroup.position.set(hx, 1.44, -6.8);
      var b1 = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.04, 0.22), this.mats.steelDark);
      var b2 = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.04, 1.4), this.mats.steelDark);
      fanGroup.add(b1);
      fanGroup.add(b2);
      fg.add(fanGroup);
      this.hvacFans.push(fanGroup);
    }
  };

  Building.prototype.setViewMode = function (mode, isolatedFloor) {
    this.viewMode = mode;
    this.isolatedFloor = isolatedFloor;

    var showGlass = (mode === 'glass');
    for (var i = 0; i < this.cutawayMeshes.length; i++) {
      this.cutawayMeshes[i].visible = showGlass;
    }

    for (var f = 0; f < this.floorGroups.length; f++) {
      if (mode === 'isolate' && isolatedFloor !== null && isolatedFloor !== undefined) {
        this.floorGroups[f].visible = (f <= isolatedFloor);
      } else {
        this.floorGroups[f].visible = true;
      }
    }
  };

  Building.prototype.setShaftDoorOpen = function (floor, shaftIndex, openFrac) {
    var door = this.shaftDoors[floor] && this.shaftDoors[floor][shaftIndex];
    if (!door) return;
    var slide = openFrac * 0.92;
    door.left.position.x = door.baseX - 0.55 - slide;
    door.right.position.x = door.baseX + 0.55 + slide;
  };

  Building.prototype.setHallLantern = function (floor, shaftIndex, dir) {
    var door = this.shaftDoors[floor] && this.shaftDoors[floor][shaftIndex];
    if (!door) return;
    door.upMat.emissiveIntensity = dir > 0 ? 1.8 : 0;
    door.downMat.emissiveIntensity = dir < 0 ? 1.8 : 0;
  };

  Building.prototype.update = function (dt, realElapsed, nightFactor, lobbyDoorActive) {
    // Spin rooftop HVAC fans
    for (var i = 0; i < this.hvacFans.length; i++) {
      this.hvacFans[i].rotation.y += dt * (2.6 + i * 0.5);
    }

    // Blink engineering server rack LEDs
    for (var j = 0; j < this.serverLeds.length; j++) {
      var led = this.serverLeds[j];
      var on = Math.sin(realElapsed * 7 + led.phase) > -0.2;
      led.mat.color.setHex(on ? (j === 1 ? 0x38bdf8 : 0x34d399) : 0x0f172a);
    }

    // Animate lobby sliding entrance doors
    if (this.lobbyDoors) {
      var targetOpen = lobbyDoorActive ? 1.0 : 0.0;
      this.lobbyDoors.openAmount = OfficeSim.Utils.lerp(
        this.lobbyDoors.openAmount,
        targetOpen,
        Math.min(1, dt * 6)
      );
      var offset = this.lobbyDoors.openAmount * 1.45;
      this.lobbyDoors.left.position.x = -1.1 - offset;
      this.lobbyDoors.right.position.x = 1.1 + offset;
    }

    // Adjust interior floor lighting for day/night ambience
    var interiorIntensity = 0.25 + nightFactor * 0.95;
    var emissiveVal = 0.45 + nightFactor * 1.35;
    for (var l = 0; l < this.floorLights.length; l++) {
      this.floorLights[l].intensity = interiorIntensity;
    }
    for (var e = 0; e < this.ceilingEmissives.length; e++) {
      this.ceilingEmissives[e].emissiveIntensity = emissiveVal;
    }
  };

  OfficeSim.Building = Building;
})();
