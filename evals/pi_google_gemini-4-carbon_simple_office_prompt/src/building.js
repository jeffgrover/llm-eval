import * as THREE from 'three';
import { BUILDING } from './config.js';

export class OfficeBuilding {
  constructor(scene, textures) {
    this.scene = scene;
    this.textures = textures;
    this.root = new THREE.Group();
    this.scene.add(this.root);

    this.floorGroups = [];
    for (let f = 0; f < BUILDING.numFloors; f++) {
      const fg = new THREE.Group();
      fg.position.y = f * BUILDING.floorHeight;
      this.root.add(fg);
      this.floorGroups.push(fg);
    }

    this.roofCapGroup = new THREE.Group();
    this.roofCapGroup.position.y = BUILDING.numFloors * BUILDING.floorHeight;
    this.root.add(this.roofCapGroup);

    // Interactive registries
    this.desksByFloor = { 0: [], 1: [], 2: [], 3: [], 4: [] };
    this.execDesks = {};
    this.receptionSpot = null;
    this.baristaSpot = null;
    this.meetingRooms = [];
    this.coffeeSpots = [];
    this.waterCoolers = [];
    this.phoneBooths = [];
    this.lunchSeats = [];
    this.loungeSeats = [];
    this.serverLeds = [];
    this.turnstileLights = [];
    this.ceilingLightMats = [];
    this.interiorPointLights = [];
    this.frontFacadeMeshes = [];
    this.allGlassMeshes = [];
    this.terraceBulbMat = null;

    this.cutawayMode = 'cutaway'; // 'cutaway' | 'glass' | 'xray'
    this.isolatedFloor = null;    // null = all, or 0..4
    this.slidingDoorOpen = 0;     // 0..1

    this._initSharedMaterials();
    this._buildStructuralCoreAndStairs();
    this._buildFloorSlabsAndColumns();
    this._buildCurtainWallFacade();
    this._buildFloor0Lobby();
    this._buildFloor1Design();
    this._buildFloor2Engineering();
    this._buildFloor3Executive();
    this._buildFloor4Rooftop();
    this._buildPavilionRoof();
    this.applyViewMode(this.cutawayMode, this.isolatedFloor);
  }

  _initSharedMaterials() {
    this.mats = {
      slabEdge: new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.55, metalness: 0.35 }),
      column: new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.45, metalness: 0.4 }),
      mullion: new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.35, metalness: 0.7 }),
      coreWall: new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.78 }),
      woodAccent: new THREE.MeshStandardMaterial({ map: this.textures.woodOak, roughness: 0.55 }),
      woodDeck: new THREE.MeshStandardMaterial({ map: this.textures.woodDeck, roughness: 0.68 }),
      deskTop: new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.45 }),
      execDeskTop: new THREE.MeshStandardMaterial({ map: this.textures.woodOak, roughness: 0.38 }),
      darkMetal: new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4, metalness: 0.65 }),
      chrome: new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.2, metalness: 0.85 }),
      chairFabric: new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.8 }),
      execChair: new THREE.MeshStandardMaterial({ color: 0x1c1917, roughness: 0.5 }),
      sofaTeal: new THREE.MeshStandardMaterial({ color: 0x0f766e, roughness: 0.82 }),
      sofaAmber: new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.82 }),
      sofaSlate: new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.82 }),
      partitionGlass: new THREE.MeshStandardMaterial({
        color: 0xbae6fd,
        transparent: true,
        opacity: 0.24,
        roughness: 0.1,
        metalness: 0.2,
        depthWrite: false
      }),
      facadeGlass: new THREE.MeshStandardMaterial({
        color: 0x7dd3fc,
        transparent: true,
        opacity: 0.26,
        roughness: 0.08,
        metalness: 0.45,
        depthWrite: false
      }),
      facadeFrontGlass: new THREE.MeshStandardMaterial({
        color: 0x7dd3fc,
        transparent: true,
        opacity: 0.06,
        roughness: 0.08,
        metalness: 0.45,
        depthWrite: false
      }),
      monitorOff: new THREE.MeshStandardMaterial({ color: 0x090d16, roughness: 0.25 }),
      plantPot: new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.65 }),
      plantLeaf: new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.75 })
    };
  }

  _buildFloorSlabsAndColumns() {
    const W = BUILDING.width;
    const D = BUILDING.depth;
    const hW = BUILDING.halfW;
    const hD = BUILDING.halfD;
    const th = BUILDING.slabThickness;
    const hole = BUILDING.coreHole;

    const floorMats = [
      new THREE.MeshStandardMaterial({ map: this.textures.lobbyMarble, roughness: 0.26, metalness: 0.08 }),
      new THREE.MeshStandardMaterial({ map: this.textures.carpetBlueGrey, roughness: 0.88 }),
      new THREE.MeshStandardMaterial({ map: this.textures.carpetWarmGrey, roughness: 0.88 }),
      new THREE.MeshStandardMaterial({ map: this.textures.carpetExec, roughness: 0.86 }),
      new THREE.MeshStandardMaterial({ map: this.textures.lobbyMarble, roughness: 0.38 })
    ];

    for (let f = 0; f < BUILDING.numFloors; f++) {
      const fg = this.floorGroups[f];
      const topMat = floorMats[f];

      if (f === 0) {
        // Solid ground foundation slab
        const slab = new THREE.Mesh(new THREE.BoxGeometry(W, th, D), topMat);
        slab.position.set(0, -th / 2, 0);
        slab.receiveShadow = true;
        fg.add(slab);
      } else {
        // 4 non-overlapping slab sections framing the elevator+stair core opening
        const pieces = [
          // South main plate: Z from hole.z1 to +hD
          { x0: -hW, x1: hW, z0: hole.z1, z1: hD },
          // North strip behind core: Z from -hD to hole.z0
          { x0: -hW, x1: hW, z0: -hD, z1: hole.z0 },
          // West wing: X from -hW to hole.x0
          { x0: -hW, x1: hole.x0, z0: hole.z0, z1: hole.z1 },
          // East wing: X from hole.x1 to +hW
          { x0: hole.x1, x1: hW, z0: hole.z0, z1: hole.z1 }
        ];

        pieces.forEach(p => {
          const pw = p.x1 - p.x0;
          const pd = p.z1 - p.z0;
          const cx = (p.x0 + p.x1) / 2;
          const cz = (p.z0 + p.z1) / 2;

          // Structural concrete underside + finished floor top
          const base = new THREE.Mesh(new THREE.BoxGeometry(pw, th, pd), this.mats.slabEdge);
          base.position.set(cx, -th / 2, cz);
          base.castShadow = true;
          base.receiveShadow = true;
          fg.add(base);

          const finish = new THREE.Mesh(new THREE.PlaneGeometry(pw, pd), topMat);
          finish.rotation.x = -Math.PI / 2;
          finish.position.set(cx, 0.005, cz);
          finish.receiveShadow = true;
          fg.add(finish);
        });

        // Safety glass balustrade around stairwell opening on floors 1..4
        const railGlass = new THREE.Mesh(
          new THREE.BoxGeometry(3.1, 1.05, 0.05),
          this.mats.partitionGlass
        );
        railGlass.position.set(-6.55, 0.52, -9.83);
        fg.add(railGlass);
      }

      // Perimeter architectural steel columns & ceiling LED linear troffers (for indoor areas)
      const maxColX = f === 4 ? 5.2 : hW - 0.35;
      const colXs = f === 4 ? [-17.65, -9.0, 0.0, 5.2] : [-17.65, -9.0, 0.0, 9.0, 17.65];
      const colZs = f === 4 ? [-10.65, 5.2] : [-10.65, 0.0, 10.65];

      colXs.forEach(cx => {
        colZs.forEach(cz => {
          if (Math.abs(cx) < 17 && Math.abs(cz) < 10 && f < 4) return; // keep open office floor clear
          const col = new THREE.Mesh(
            new THREE.BoxGeometry(0.38, BUILDING.floorHeight - th, 0.38),
            this.mats.column
          );
          col.position.set(cx, (BUILDING.floorHeight - th) / 2, cz);
          col.castShadow = true;
          fg.add(col);
        });
      });

      // Warm architectural ceiling linear lights + soft point light per floor
      const lightMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xfff3d6,
        emissiveIntensity: 0.9
      });
      this.ceilingLightMats.push(lightMat);

      const ceilingY = BUILDING.floorHeight - th - 0.04;
      const lightXs = f === 4 ? [-13, -6, 0] : [-13.5, -5.5, 4.5, 13.5];
      const lightZs = f === 4 ? [-2.5, 2.2] : [-2.5, 3.2, 7.8];

      lightXs.forEach(lx => {
        lightZs.forEach(lz => {
          const strip = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.05, 0.24), lightMat);
          strip.position.set(lx, ceilingY, lz);
          fg.add(strip);
        });
      });

      // Subtle warm interior fill light per floor (brightens automatically at dusk/night)
      const pt = new THREE.PointLight(0xffe8c2, 0.35, 30, 1.4);
      pt.position.set(f === 4 ? -5 : 0, 3.5, 1.5);
      fg.add(pt);
      this.interiorPointLights.push(pt);
    }
  }

  _buildStructuralCoreAndStairs() {
    const fh = BUILDING.floorHeight;

    for (let f = 0; f < BUILDING.numFloors; f++) {
      const fg = this.floorGroups[f];
      const wallH = fh - BUILDING.slabThickness;

      // Elevator bank architectural header & side piers at Z = -7.35 (leaves 3 shaft doorways open!)
      // Shaft centers are X = -3.2, 0.0, +3.2; each doorway is 1.5m wide -> piers around them
      const pierSpecs = [
        { x: -4.45, w: 0.95 },
        { x: -1.6, w: 1.6 },
        { x: 1.6, w: 1.6 },
        { x: 4.45, w: 0.95 }
      ];
      pierSpecs.forEach(ps => {
        const pier = new THREE.Mesh(new THREE.BoxGeometry(ps.w, wallH, 0.28), this.mats.woodAccent);
        pier.position.set(ps.x, wallH / 2, -7.35);
        pier.castShadow = true;
        pier.receiveShadow = true;
        fg.add(pier);
      });

      // Transom header above the 3 elevator doorways (door height = 2.55m)
      const header = new THREE.Mesh(new THREE.BoxGeometry(9.8, wallH - 2.55, 0.3), this.mats.coreWall);
      header.position.set(0, 2.55 + (wallH - 2.55) / 2, -7.35);
      fg.add(header);

      // Floor number sculptural signage on core wall
      const badge = new THREE.Mesh(
        new THREE.BoxGeometry(0.65, 0.65, 0.05),
        new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.3 })
      );
      badge.position.set(-4.45, 2.15, -7.19);
      fg.add(badge);

      // Dog-leg Architectural Staircase connecting floor f -> f + 1 (for f = 0..3)
      if (f < BUILDING.numFloors - 1) {
        const stairGroup = new THREE.Group();
        const stepsPerFlight = 9;
        const flightRise = fh / 2;
        const flightRun = 2.4; // Z from -6.85 to -9.25

        // Mid-landing at Y = fh/2, Z = -9.35, X = -7.75..-5.25
        const landing = new THREE.Mesh(new THREE.BoxGeometry(2.55, 0.16, 1.05), this.mats.woodAccent);
        landing.position.set(-6.5, flightRise - 0.08, -9.35);
        landing.castShadow = true;
        stairGroup.add(landing);

        // Flight 1 (West: X = -7.15, ascending -Z) & Flight 2 (East: X = -5.85, ascending +Z)
        for (let s = 0; s < stepsPerFlight; s++) {
          const t = (s + 0.5) / stepsPerFlight;
          const tread1 = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.09, 0.28), this.mats.woodAccent);
          tread1.position.set(-7.15, t * flightRise, -6.85 - t * flightRun);
          stairGroup.add(tread1);

          const tread2 = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.09, 0.28), this.mats.woodAccent);
          tread2.position.set(-5.85, flightRise + t * flightRise, -9.25 + t * flightRun);
          stairGroup.add(tread2);
        }

        // Steel stringers
        const stringerLen = Math.hypot(flightRise, flightRun);
        const angle = Math.atan2(flightRise, flightRun);

        const str1 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.18, stringerLen), this.mats.darkMetal);
        str1.position.set(-7.15, flightRise / 2 - 0.1, -8.05);
        str1.rotation.x = angle;
        stairGroup.add(str1);

        const str2 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.18, stringerLen), this.mats.darkMetal);
        str2.position.set(-5.85, flightRise * 1.5 - 0.1, -8.05);
        str2.rotation.x = -angle;
        stairGroup.add(str2);

        // West enclosure glass of stairwell
        const stairWallW = new THREE.Mesh(new THREE.BoxGeometry(0.08, wallH, 3.2), this.mats.partitionGlass);
        stairWallW.position.set(-8.08, wallH / 2, -8.2);
        stairGroup.add(stairWallW);

        fg.add(stairGroup);
      }
    }
  }

  _buildCurtainWallFacade() {
    const hW = BUILDING.halfW;
    const hD = BUILDING.halfD;
    const fh = BUILDING.floorHeight;

    for (let f = 0; f < BUILDING.numFloors; f++) {
      const fg = this.floorGroups[f];
      const h = fh - BUILDING.slabThickness;

      if (f < 4) {
        // Front South Facade (Z = +11) — split on Floor 0 around automatic entrance doors (X = -2.4..+2.4)
        if (f === 0) {
          const leftFront = new THREE.Mesh(new THREE.PlaneGeometry(hW - 2.4, h), this.mats.facadeFrontGlass);
          leftFront.position.set(-(hW + 2.4) / 2, h / 2, hD);
          fg.add(leftFront);

          const rightFront = new THREE.Mesh(new THREE.PlaneGeometry(hW - 2.4, h), this.mats.facadeFrontGlass);
          rightFront.position.set((hW + 2.4) / 2, h / 2, hD);
          fg.add(rightFront);

          const transom = new THREE.Mesh(new THREE.PlaneGeometry(4.8, h - 2.9), this.mats.facadeFrontGlass);
          transom.position.set(0, 2.9 + (h - 2.9) / 2, hD);
          fg.add(transom);

          this.frontFacadeMeshes.push(leftFront, rightFront, transom);
          this.allGlassMeshes.push(leftFront, rightFront, transom);
        } else {
          const frontGlass = new THREE.Mesh(new THREE.PlaneGeometry(BUILDING.width, h), this.mats.facadeFrontGlass);
          frontGlass.position.set(0, h / 2, hD);
          fg.add(frontGlass);
          this.frontFacadeMeshes.push(frontGlass);
          this.allGlassMeshes.push(frontGlass);
        }

        // Back North Facade (Z = -11) — scenic clear glass over elevator shafts!
        const backGlass = new THREE.Mesh(new THREE.PlaneGeometry(BUILDING.width, h), this.mats.facadeGlass);
        backGlass.position.set(0, h / 2, -hD);
        backGlass.rotation.y = Math.PI;
        fg.add(backGlass);
        this.allGlassMeshes.push(backGlass);

        // West & East Side Facades (X = -18, +18)
        const westGlass = new THREE.Mesh(new THREE.PlaneGeometry(BUILDING.depth, h), this.mats.facadeGlass);
        westGlass.position.set(-hW, h / 2, 0);
        westGlass.rotation.y = -Math.PI / 2;
        fg.add(westGlass);

        const eastGlass = new THREE.Mesh(new THREE.PlaneGeometry(BUILDING.depth, h), this.mats.facadeGlass);
        eastGlass.position.set(hW, h / 2, 0);
        eastGlass.rotation.y = Math.PI / 2;
        fg.add(eastGlass);
        this.allGlassMeshes.push(westGlass, eastGlass);

        // Exterior Horizontal Spandrel Band & Vertical Mullions
        const spandrel = new THREE.Mesh(new THREE.BoxGeometry(BUILDING.width + 0.16, 0.3, BUILDING.depth + 0.16), this.mats.mullion);
        spandrel.position.set(0, -0.12, 0);
        fg.add(spandrel);

        for (let mx = -15; mx <= 15; mx += 6) {
          if (f === 0 && Math.abs(mx) < 3.1) continue;
          const mFront = new THREE.Mesh(new THREE.BoxGeometry(0.09, h, 0.12), this.mats.mullion);
          mFront.position.set(mx, h / 2, hD);
          fg.add(mFront);
          this.frontFacadeMeshes.push(mFront);

          const mBack = new THREE.Mesh(new THREE.BoxGeometry(0.09, h, 0.12), this.mats.mullion);
          mBack.position.set(mx, h / 2, -hD);
          fg.add(mBack);
        }
      } else {
        // Floor 4: Glass Penthouse Pavilion covers X: [-18, +5.4], Z: [-11, +5.4]
        const pavW = 23.4; // -18 to +5.4
        const pavCx = -6.3;
        const pavD = 16.4; // -11 to +5.4
        const pavCz = -2.8;

        const pSouth = new THREE.Mesh(new THREE.PlaneGeometry(pavW, h), this.mats.facadeFrontGlass);
        pSouth.position.set(pavCx, h / 2, 5.4);
        fg.add(pSouth);
        this.frontFacadeMeshes.push(pSouth);

        const pNorth = new THREE.Mesh(new THREE.PlaneGeometry(pavW, h), this.mats.facadeGlass);
        pNorth.position.set(pavCx, h / 2, -hD);
        pNorth.rotation.y = Math.PI;
        fg.add(pNorth);

        const pWest = new THREE.Mesh(new THREE.PlaneGeometry(pavD, h), this.mats.facadeGlass);
        pWest.position.set(-hW, h / 2, pavCz);
        pWest.rotation.y = -Math.PI / 2;
        fg.add(pWest);

        const pEast = new THREE.Mesh(new THREE.PlaneGeometry(pavD, h), this.mats.facadeGlass);
        pEast.position.set(5.4, h / 2, pavCz);
        pEast.rotation.y = Math.PI / 2;
        fg.add(pEast);

        this.allGlassMeshes.push(pSouth, pNorth, pWest, pEast);
      }
    }

    // Automatic Sliding Entrance Doors + Architectural Canopy on Ground Floor (Z = +11)
    const fg0 = this.floorGroups[0];
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(8.6, 0.28, 3.6), this.mats.mullion);
    canopy.position.set(0, 3.25, hD + 1.6);
    canopy.castShadow = true;
    fg0.add(canopy);

    const doorFrameMat = this.mats.chrome;
    const doorGlassMat = new THREE.MeshStandardMaterial({
      color: 0xe0f2fe,
      transparent: true,
      opacity: 0.45,
      roughness: 0.08,
      metalness: 0.3
    });

    this.leftEntranceDoor = new THREE.Group();
    this.rightEntranceDoor = new THREE.Group();

    [this.leftEntranceDoor, this.rightEntranceDoor].forEach((dg, idx) => {
      const sign = idx === 0 ? -1 : 1;
      const glass = new THREE.Mesh(new THREE.BoxGeometry(1.18, 2.82, 0.06), doorGlassMat);
      glass.position.y = 1.41;
      dg.add(glass);

      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.9, 8), doorFrameMat);
      handle.position.set(-sign * 0.42, 1.35, 0.07);
      dg.add(handle);

      dg.position.set(sign * 0.6, 0, hD);
      fg0.add(dg);
    });
  }

  _buildFloor0Lobby() {
    const fg = this.floorGroups[0];

    // 1. Security Badge Turnstiles (Z = +5.2, lanes at X = -1.6, 0.0, +1.6)
    const pedestalXs = [-2.4, -0.8, 0.8, 2.4];
    pedestalXs.forEach(px => {
      const ped = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.98, 1.45), this.mats.chrome);
      ped.position.set(px, 0.49, 5.2);
      ped.castShadow = true;
      fg.add(ped);

      const topScanner = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 1.47), this.mats.darkMetal);
      topScanner.position.set(px, 1.0, 5.2);
      fg.add(topScanner);

      const ledMat = new THREE.MeshStandardMaterial({
        color: 0x10b981,
        emissive: 0x10b981,
        emissiveIntensity: 0.7
      });
      const led = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, 0.18), ledMat);
      led.position.set(px, 1.02, 5.75);
      fg.add(led);
      this.turnstileLights.push(ledMat);
    });

    // Low glass guide barriers flanking turnstiles so lobby feels authentic
    [-6.2, 6.2].forEach(bx => {
      const barrier = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.0, 0.08), this.mats.partitionGlass);
      barrier.position.set(bx, 0.5, 5.2);
      fg.add(barrier);
    });

    // 2. Sculptural Reception Desk (West-Center Atrium: X = -5.5, Z = +2.8)
    const recGroup = new THREE.Group();
    recGroup.position.set(-5.5, 0, 2.8);
    const deskFront = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.08, 0.85), this.mats.woodAccent);
    deskFront.position.set(0, 0.54, 0);
    deskFront.castShadow = true;
    recGroup.add(deskFront);

    const marbleCounter = new THREE.Mesh(
      new THREE.BoxGeometry(3.55, 0.12, 0.95),
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.2 })
    );
    marbleCounter.position.set(0, 1.1, 0.05);
    recGroup.add(marbleCounter);

    // Receptionist monitor
    const recScreen = this._createMonitor('metrics');
    recScreen.mesh.position.set(0, 1.15, -0.15);
    recScreen.mesh.rotation.y = Math.PI;
    recGroup.add(recScreen.mesh);
    fg.add(recGroup);

    this.receptionSpot = {
      id: 'reception_0',
      floor: 0,
      x: -5.5,
      z: 1.95,
      faceX: -5.5,
      faceZ: 4.0,
      gate: null,
      monitorMeshes: [recScreen]
    };

    // 3. West Atrium Designer Lounge (X: -15.5..-10.5, Z: -1.5..+7.5)
    const rug = new THREE.Mesh(
      new THREE.BoxGeometry(5.8, 0.02, 6.8),
      new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.95 })
    );
    rug.position.set(-13.4, 0.01, 2.5);
    fg.add(rug);

    this._addLoungeCluster(fg, 0, -13.4, 2.5, this.mats.sofaTeal);
    this._addIndoorPlant(fg, -16.4, 8.6, 1.3);
    this._addIndoorPlant(fg, -16.4, -3.2, 1.2);
    this._addIndoorPlant(fg, 16.4, 8.6, 1.3);

    // 4. East Espresso & Artisan Café Bar (X: +11.5..+16.8, Z: -3.5..+8.0)
    const barCounter = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.08, 5.6), this.mats.woodAccent);
    barCounter.position.set(14.8, 0.54, 0.5);
    barCounter.castShadow = true;
    fg.add(barCounter);

    const barTop = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.08, 5.75), this.mats.deskTop);
    barTop.position.set(14.8, 1.1, 0.5);
    fg.add(barTop);

    // Chrome Espresso Machine
    const espresso = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.52, 0.85), this.mats.chrome);
    espresso.position.set(14.8, 1.38, -0.6);
    fg.add(espresso);

    this.baristaSpot = {
      id: 'barista_0',
      floor: 0,
      x: 15.85,
      z: 0.5,
      faceX: 12.0,
      faceZ: 0.5,
      gate: null,
      monitorMeshes: []
    };

    this.coffeeSpots.push({
      floor: 0,
      x: 13.55,
      z: -0.4,
      faceX: 14.8,
      faceZ: -0.4,
      gate: null,
      label: 'Lobby Espresso Bar'
    });

    // 3 Round Café Tables on Floor 0
    [[11.6, 4.8], [14.5, 6.2], [11.6, -2.5]].forEach(([tx, tz]) => {
      this._addCafeTableWithSeats(fg, 0, tx, tz, null);
    });
  }

  _buildFloor1Design() {
    const fg = this.floorGroups[1];
    const f = 1;

    // 12 Designer & PM Workstations arranged cleanly around West (-9.6) and Center (0.0) aisles:
    // West Studio Cluster (6 desks)
    this._addWorkstationPod(fg, f, -14.2, -0.8, 3, 'design'); // 6 face-to-face desks -> wait: 3 pairs = 6!
    // Center Studio Cluster (6 desks)
    this._addWorkstationPod(fg, f, -5.0, 2.2, 2, 'design');  // 4 desks
    this._addWorkstationPod(fg, f, 4.5, 2.2, 1, 'metrics');  // 2 desks -> total = 12 desks on F1!

    // West Wall Design Pin-up Whiteboard
    const wb = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 1.45, 3.6),
      new THREE.MeshStandardMaterial({ map: this.textures.whiteboard, roughness: 0.35 })
    );
    wb.position.set(-17.5, 1.75, 4.8);
    fg.add(wb);

    // North-East Kitchenette & Breakroom (X: 10.6..17.2, Z: -10.2..-5.8, open entry at (12.2, -4.8))
    this._buildBreakroom(fg, f, 14.0, -8.8);

    // Acoustic Phone Booths (X = 6.8 & 8.4, Z = -8.4)
    this._addPhoneBooth(fg, f, 6.8, -8.3);
    this._addPhoneBooth(fg, f, 8.4, -8.3);

    // South-East Glass Conference Room: "Design Critique Studio" (X: 10.6..17.2, Z: -1.8..+7.6)
    // Doorway on West glass wall at (10.6, +2.2) facing East aisle (X = 9.4)
    this._buildConferenceRoom(fg, {
      id: 'conf_f1',
      name: 'F1 Design Studio Room',
      floor: 1,
      x0: 10.6, x1: 17.4,
      z0: -1.8, z1: 7.6,
      doorSide: 'west',
      doorPos: 2.2,
      gate: { x: 9.8, z: 2.2 },
      seatCount: 6
    });

    this._addIndoorPlant(fg, -16.8, 9.2, 1.15);
    this._addIndoorPlant(fg, 9.8, 9.2, 1.1);
  }

  _buildFloor2Engineering() {
    const fg = this.floorGroups[2];
    const f = 2;

    // 12 Engineering Workstations (dark-mode IDE screens)
    this._addWorkstationPod(fg, f, -14.2, -0.5, 3, 'code'); // 6 desks
    this._addWorkstationPod(fg, f, -5.0, 2.5, 3, 'code');   // 6 desks -> total = 12 desks on F2!

    // Center-East Glass Boardroom: "Apollo Architecture Room" (X: 2.0..8.0, Z: -1.8..+7.2)
    // Doorway on West glass wall at (2.0, +2.2) facing Center aisle (X = 0.0)
    this._buildConferenceRoom(fg, {
      id: 'conf_f2',
      name: 'F2 Apollo Boardroom',
      floor: 2,
      x0: 2.0, x1: 8.0,
      z0: -1.8, z1: 7.2,
      doorSide: 'west',
      doorPos: 2.2,
      gate: { x: 1.1, z: 2.2 },
      seatCount: 8
    });

    // North-East Glass Server & Cloud Ops Room (X: 6.0..11.2, Z: -10.5..-6.6)
    this._buildServerRoom(fg, 6.0, 11.2, -10.5, -6.6);

    // East Engineering Coffee Bar, Water Cooler & Lounge (X: 11.4..17.0, Z: -3.5..+7.5)
    this._buildBreakroom(fg, f, 14.8, -8.8);
    this._addLoungeCluster(fg, f, 14.0, 3.2, this.mats.sofaSlate);
    this._addIndoorPlant(fg, -16.8, 9.2, 1.2);
    this._addIndoorPlant(fg, 16.5, 9.2, 1.2);
  }

  _buildFloor3Executive() {
    const fg = this.floorGroups[3];
    const f = 3;

    // West Private Glass Executive Corner Offices (X: -17.5..-11.0)
    // 1. CTO Office (Z: -3.2..+2.2, doorway at (-11.0, -0.8) -> gate (-10.0, -0.8))
    this._buildPrivateOffice(fg, {
      key: 'cto',
      floor: 3,
      x0: -17.5, x1: -11.0,
      z0: -3.2, z1: 2.2,
      doorZ: -0.8,
      gate: { x: -10.0, z: -0.8 }
    });

    // 2. CEO Corner Office (Z: +2.4..+9.8, doorway at (-11.0, +5.5) -> gate (-10.0, +5.5))
    this._buildPrivateOffice(fg, {
      key: 'ceo',
      floor: 3,
      x0: -17.5, x1: -11.0,
      z0: 2.4, z1: 9.8,
      doorZ: 5.5,
      gate: { x: -10.0, z: 5.5 }
    });

    // 8 Strategy, Finance & Revenue Workstations in Center Open Zone
    this._addWorkstationPod(fg, f, -4.8, 2.0, 2, 'metrics'); // 4 desks
    this._addWorkstationPod(fg, f, 4.4, 2.0, 2, 'metrics');  // 4 desks -> + 2 execs = 10 desks on F3!

    // Phone Booths
    this._addPhoneBooth(fg, f, 6.8, -8.3);
    this._addPhoneBooth(fg, f, 8.4, -8.3);

    // North-East Executive Espresso Pantry
    this._buildBreakroom(fg, f, 14.6, -8.8);

    // South-East Executive Boardroom: "Summit Strategy Room" (X: 10.6..17.4, Z: -1.8..+8.0)
    this._buildConferenceRoom(fg, {
      id: 'conf_f3',
      name: 'F3 Summit Boardroom',
      floor: 3,
      x0: 10.6, x1: 17.4,
      z0: -1.8, z1: 8.0,
      doorSide: 'west',
      doorPos: 2.2,
      gate: { x: 9.8, z: 2.2 },
      seatCount: 8
    });

    this._addIndoorPlant(fg, -10.2, 9.2, 1.25);
    this._addIndoorPlant(fg, 9.8, 9.2, 1.25);
  }

  _buildFloor4Rooftop() {
    const fg = this.floorGroups[4];
    const f = 4;

    // 1. Indoor Penthouse Cafeteria Serving Line (X: -16.2..-10.5, Z: -9.6..-7.2)
    const counter = new THREE.Mesh(new THREE.BoxGeometry(5.6, 1.05, 1.1), this.mats.woodAccent);
    counter.position.set(-13.4, 0.52, -8.2);
    counter.castShadow = true;
    fg.add(counter);

    const sneezeGuard = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.45, 0.06), this.mats.partitionGlass);
    sneezeGuard.position.set(-13.4, 1.28, -7.7);
    fg.add(sneezeGuard);

    const roofEspresso = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.48, 0.55), this.mats.chrome);
    roofEspresso.position.set(-11.4, 1.28, -8.2);
    fg.add(roofEspresso);

    this.coffeeSpots.push({
      floor: 4,
      x: -11.4,
      z: -6.9,
      faceX: -11.4,
      faceZ: -8.2,
      gate: null,
      label: 'Penthouse Café'
    });

    // 4 Indoor Dining Tables inside Penthouse Pavilion
    [[-14.2, -1.2], [-14.2, 2.8], [-7.5, 1.8], [-1.5, 1.8]].forEach(([tx, tz]) => {
      this._addCafeTableWithSeats(fg, 4, tx, tz, null);
    });

    // 2. Outdoor Cedar Wood Sky Deck covering East Wing (X: 5.5..17.7, Z: -10.7..+10.7) & South Terrace (X: -17.7..5.5, Z: 5.5..10.7)
    const eastDeck = new THREE.Mesh(new THREE.BoxGeometry(12.2, 0.08, 21.4), this.mats.woodDeck);
    eastDeck.position.set(11.6, 0.04, 0);
    eastDeck.receiveShadow = true;
    fg.add(eastDeck);

    const southDeck = new THREE.Mesh(new THREE.BoxGeometry(23.2, 0.08, 5.2), this.mats.woodDeck);
    southDeck.position.set(-6.1, 0.04, 8.1);
    southDeck.receiveShadow = true;
    fg.add(southDeck);

    // Frameless Glass Safety Parapet around Outdoor Terrace Perimeter
    const parapetH = 1.18;
    const pEast = new THREE.Mesh(new THREE.BoxGeometry(0.08, parapetH, 21.6), this.mats.facadeGlass);
    pEast.position.set(17.85, parapetH / 2, 0);
    fg.add(pEast);

    const pNorth = new THREE.Mesh(new THREE.BoxGeometry(12.5, parapetH, 0.08), this.mats.facadeGlass);
    pNorth.position.set(11.65, parapetH / 2, -10.85);
    fg.add(pNorth);

    const pSouth = new THREE.Mesh(new THREE.BoxGeometry(35.8, parapetH, 0.08), this.mats.facadeGlass);
    pSouth.position.set(0, parapetH / 2, 10.85);
    fg.add(pSouth);

    const pWest = new THREE.Mesh(new THREE.BoxGeometry(0.08, parapetH, 5.4), this.mats.facadeGlass);
    pWest.position.set(-17.85, parapetH / 2, 8.15);
    fg.add(pWest);

    // Timber Pergola over East Sky Deck (X: 8.2..15.8, Z: -5.5..+5.5) with Evening String Bulbs!
    const pergolaGroup = new THREE.Group();
    const postPositions = [[8.4, -5.2], [15.4, -5.2], [8.4, 5.2], [15.4, 5.2], [8.4, 0], [15.4, 0]];
    postPositions.forEach(([px, pz]) => {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, 3.1, 0.22), this.mats.woodAccent);
      post.position.set(px, 1.55, pz);
      post.castShadow = true;
      pergolaGroup.add(post);
    });

    for (let rz = -5.2; rz <= 5.25; rz += 0.95) {
      const rafter = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.14, 0.1), this.mats.woodAccent);
      rafter.position.set(11.9, 3.12, rz);
      rafter.castShadow = true;
      pergolaGroup.add(rafter);
    }

    this.terraceBulbMat = new THREE.MeshStandardMaterial({
      color: 0xfef3c7,
      emissive: 0xfbbf24,
      emissiveIntensity: 0.2
    });
    for (let bz = -4.2; bz <= 4.3; bz += 2.1) {
      for (let bx = 9.6; bx <= 14.4; bx += 2.2) {
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), this.terraceBulbMat);
        bulb.position.set(bx, 2.98, bz);
        pergolaGroup.add(bulb);
      }
    }
    fg.add(pergolaGroup);

    // Outdoor Terrace Dining Tables & Lounge Sofas
    [[11.8, -3.0], [11.8, 2.5], [13.2, 7.6], [1.5, 8.0]].forEach(([tx, tz]) => {
      this._addCafeTableWithSeats(fg, 4, tx, tz, null);
    });
    this._addLoungeCluster(fg, 4, -8.5, 8.0, this.mats.sofaAmber);

    // Rooftop Lush Planters
    [[16.8, -8.8], [16.8, 0], [16.8, 8.8], [6.8, 9.6], [-15.8, 9.6]].forEach(([px, pz]) => {
      this._addIndoorPlant(fg, px, pz, 1.45);
    });
  }

  _buildPavilionRoof() {
    // Roof slab over the Floor 4 indoor pavilion (X: -18..+5.5, Z: -11..+5.5) + elevator mechanical crown
    const roofSlab = new THREE.Mesh(new THREE.BoxGeometry(23.6, 0.32, 16.6), this.mats.slabEdge);
    roofSlab.position.set(-6.25, 0, -2.75);
    roofSlab.castShadow = true;
    roofSlab.receiveShadow = true;
    this.roofCapGroup.add(roofSlab);

    // Elevator Overrun Mechanical Crown + HVAC Skylight Details
    const mech = new THREE.Mesh(
      new THREE.BoxGeometry(10.4, 1.35, 3.4),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5, metalness: 0.5 })
    );
    mech.position.set(0, 0.82, -8.45);
    mech.castShadow = true;
    this.roofCapGroup.add(mech);

    // Solar panels on pavilion roof!
    const solarMat = new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.2, metalness: 0.7 });
    for (let sx = -15.5; sx <= -8.5; sx += 3.4) {
      for (let sz = -4.5; sz <= 2.5; sz += 3.2) {
        const panel = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.06, 1.8), solarMat);
        panel.position.set(sx, 0.42, sz);
        panel.rotation.x = 0.22;
        this.roofCapGroup.add(panel);
      }
    }
  }

  // ==================== Furniture & Room Builders ====================

  _createMonitor(screenType) {
    const wrap = new THREE.Group();
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.16, 8), this.mats.darkMetal);
    stand.position.y = 0.08;
    wrap.add(stand);

    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.36, 0.03), this.mats.darkMetal);
    frame.position.y = 0.28;
    wrap.add(frame);

    const tex = screenType === 'code'
      ? this.textures.screenCode
      : screenType === 'design'
        ? this.textures.screenDesign
        : this.textures.screenMetrics;

    const screenMat = new THREE.MeshStandardMaterial({
      color: 0x111827,
      emissiveMap: tex,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0.08, // dims when unoccupied, glows brightly at 0.95 when worker is seated!
      roughness: 0.25
    });
    const lcd = new THREE.Mesh(new THREE.PlaneGeometry(0.54, 0.32), screenMat);
    lcd.position.set(0, 0.28, 0.017);
    wrap.add(lcd);

    return { mesh: wrap, mat: screenMat };
  }

  _addWorkstationPod(fg, floor, centerX, centerZ, pairsCount, screenType) {
    // Creates pairsCount * 2 face-to-face ergonomic workstations
    const deskW = 1.55;
    const deskD = 0.78;
    const totalW = pairsCount * deskW;

    // Shared modesty divider screen down middle of pod
    const divider = new THREE.Mesh(
      new THREE.BoxGeometry(totalW - 0.1, 0.42, 0.04),
      new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.85 })
    );
    divider.position.set(centerX, 0.92, centerZ);
    fg.add(divider);

    for (let i = 0; i < pairsCount; i++) {
      const dx = centerX - totalW / 2 + (i + 0.5) * deskW;
      [-1, 1].forEach(side => {
        const dz = centerZ + side * (deskD / 2 + 0.02);

        const top = new THREE.Mesh(new THREE.BoxGeometry(deskW - 0.06, 0.05, deskD), this.mats.deskTop);
        top.position.set(dx, 0.74, dz);
        top.castShadow = true;
        top.receiveShadow = true;
        fg.add(top);

        // Metal legs
        [-0.65, 0.65].forEach(lx => {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.72, deskD - 0.08), this.mats.darkMetal);
          leg.position.set(dx + lx, 0.36, dz);
          fg.add(leg);
        });

        // Dual angled widescreen monitors
        const m1 = this._createMonitor(screenType);
        m1.mesh.position.set(dx - 0.26, 0.76, dz - side * 0.18);
        m1.mesh.rotation.y = (side === 1 ? 0 : Math.PI) + 0.15;
        fg.add(m1.mesh);

        const m2 = this._createMonitor(screenType);
        m2.mesh.position.set(dx + 0.26, 0.76, dz - side * 0.18);
        m2.mesh.rotation.y = (side === 1 ? 0 : Math.PI) - 0.15;
        fg.add(m2.mesh);

        // Keyboard
        const kb = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.015, 0.13), this.mats.darkMetal);
        kb.position.set(dx, 0.77, dz + side * 0.12);
        fg.add(kb);

        // Ergonomic task chair
        const chairZ = centerZ + side * 1.02;
        const chair = this._createOfficeChair(false);
        chair.position.set(dx, 0, chairZ);
        chair.rotation.y = side === 1 ? Math.PI : 0;
        fg.add(chair);

        this.desksByFloor[floor].push({
          id: `desk_f${floor}_${this.desksByFloor[floor].length}`,
          floor,
          x: dx,
          z: chairZ,
          faceX: dx,
          faceZ: centerZ,
          gate: null,
          monitorMeshes: [m1, m2],
          chairMesh: chair,
          assignedTo: null
        });
      });
    }
  }

  _createOfficeChair(isExec = false) {
    const cg = new THREE.Group();
    const mat = isExec ? this.mats.execChair : this.mats.chairFabric;

    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.28, 0.05, 8), this.mats.darkMetal);
    base.position.y = 0.04;
    cg.add(base);

    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.4, 8), this.mats.chrome);
    stem.position.y = 0.24;
    cg.add(stem);

    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.06, 0.46), mat);
    seat.position.y = 0.45;
    cg.add(seat);

    const back = new THREE.Mesh(new THREE.BoxGeometry(0.44, isExec ? 0.62 : 0.48, 0.06), mat);
    back.position.set(0, isExec ? 0.76 : 0.69, -0.21);
    cg.add(back);

    return cg;
  }

  _buildConferenceRoom(fg, cfg) {
    const wallH = BUILDING.floorHeight - BUILDING.slabThickness;
    const cx = (cfg.x0 + cfg.x1) / 2;
    const cz = (cfg.z0 + cfg.z1) / 2;
    const rw = cfg.x1 - cfg.x0;
    const rd = cfg.z1 - cfg.z0;

    // Glass partition walls with real doorway opening on West side
    // North & South partitions
    [cfg.z0, cfg.z1].forEach(wz => {
      if (Math.abs(wz) > 10.5) return;
      const gWall = new THREE.Mesh(new THREE.BoxGeometry(rw, wallH, 0.06), this.mats.partitionGlass);
      gWall.position.set(cx, wallH / 2, wz);
      fg.add(gWall);

      const frame = new THREE.Mesh(new THREE.BoxGeometry(rw, 0.07, 0.09), this.mats.mullion);
      frame.position.set(cx, 0.04, wz);
      fg.add(frame);
    });

    // East wall if internal (e.g., Floor 2 Apollo Boardroom at x1 = 8.0)
    if (cfg.x1 < 17.0) {
      const eWall = new THREE.Mesh(new THREE.BoxGeometry(0.06, wallH, rd), this.mats.partitionGlass);
      eWall.position.set(cfg.x1, wallH / 2, cz);
      fg.add(eWall);
    }

    // West wall split around doorway (door width = 1.4m centered at cfg.doorPos)
    const d0 = cfg.doorPos - 0.75;
    const d1 = cfg.doorPos + 0.75;
    if (d0 > cfg.z0) {
      const seg1 = new THREE.Mesh(new THREE.BoxGeometry(0.06, wallH, d0 - cfg.z0), this.mats.partitionGlass);
      seg1.position.set(cfg.x0, wallH / 2, (cfg.z0 + d0) / 2);
      fg.add(seg1);
    }
    if (cfg.z1 > d1) {
      const seg2 = new THREE.Mesh(new THREE.BoxGeometry(0.06, wallH, cfg.z1 - d1), this.mats.partitionGlass);
      seg2.position.set(cfg.x0, wallH / 2, (d1 + cfg.z1) / 2);
      fg.add(seg2);
    }
    // Door frame posts
    [d0, d1].forEach(dz => {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.09, wallH, 0.09), this.mats.mullion);
      post.position.set(cfg.x0, wallH / 2, dz);
      fg.add(post);
    });

    // Large Oak Conference Table
    const tableLen = Math.min(rd - 2.8, 4.6);
    const tableW = 1.55;
    const table = new THREE.Mesh(new THREE.BoxGeometry(tableW, 0.08, tableLen), this.mats.execDeskTop);
    table.position.set(cx, 0.75, cz);
    table.castShadow = true;
    fg.add(table);

    [-tableLen * 0.32, tableLen * 0.32].forEach(lz => {
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.32, 0.72, 12), this.mats.darkMetal);
      base.position.set(cx, 0.36, cz + lz);
      fg.add(base);
    });

    // Large Wall Presentation Display on North wall of room
    const screenBacking = new THREE.Mesh(new THREE.BoxGeometry(2.5, 1.42, 0.07), this.mats.darkMetal);
    screenBacking.position.set(cx, 1.85, cfg.z0 + 0.1);
    fg.add(screenBacking);

    const presMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      emissiveMap: this.textures.presentationSlide,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0.08, // lights up to 1.05 when meeting is in progress!
      roughness: 0.2
    });
    const presLcd = new THREE.Mesh(new THREE.PlaneGeometry(2.38, 1.3), presMat);
    presLcd.position.set(cx, 1.85, cfg.z0 + 0.14);
    fg.add(presLcd);

    // Conference Chairs + Registered Seat Coordinates
    const seats = [];
    const perSide = Math.floor(cfg.seatCount / 2);
    for (let i = 0; i < perSide; i++) {
      const sz = cz - tableLen * 0.36 + (perSide > 1 ? (i / (perSide - 1)) * tableLen * 0.72 : 0);
      [-1, 1].forEach(side => {
        const sx = cx + side * 1.18;
        const ch = this._createOfficeChair(true);
        ch.position.set(sx, 0, sz);
        ch.rotation.y = side === -1 ? Math.PI / 2 : -Math.PI / 2;
        fg.add(ch);

        seats.push({
          floor: cfg.floor,
          x: sx,
          z: sz,
          faceX: cx,
          faceZ: sz,
          gate: cfg.gate,
          occupiedBy: null
        });
      });
    }

    this.meetingRooms.push({
      id: cfg.id,
      name: cfg.name,
      floor: cfg.floor,
      gate: cfg.gate,
      screenMat: presMat,
      seats,
      activeMeeting: null
    });
  }

  _buildPrivateOffice(fg, cfg) {
    const wallH = BUILDING.floorHeight - BUILDING.slabThickness;
    const cx = (cfg.x0 + cfg.x1) / 2;
    const cz = (cfg.z0 + cfg.z1) / 2;
    const rw = cfg.x1 - cfg.x0;
    const rd = cfg.z1 - cfg.z0;

    // North/South partitions
    [cfg.z0, cfg.z1].forEach(wz => {
      if (wz > 9.6) return;
      const w = new THREE.Mesh(new THREE.BoxGeometry(rw, wallH, 0.06), this.mats.partitionGlass);
      w.position.set(cx, wallH / 2, wz);
      fg.add(w);
    });

    // East glass wall at cfg.x1 with doorway at cfg.doorZ
    const d0 = cfg.doorZ - 0.7;
    const d1 = cfg.doorZ + 0.7;
    if (d0 > cfg.z0) {
      const s1 = new THREE.Mesh(new THREE.BoxGeometry(0.06, wallH, d0 - cfg.z0), this.mats.partitionGlass);
      s1.position.set(cfg.x1, wallH / 2, (cfg.z0 + d0) / 2);
      fg.add(s1);
    }
    if (cfg.z1 > d1) {
      const s2 = new THREE.Mesh(new THREE.BoxGeometry(0.06, wallH, cfg.z1 - d1), this.mats.partitionGlass);
      s2.position.set(cfg.x1, wallH / 2, (d1 + cfg.z1) / 2);
      fg.add(s2);
    }

    // Executive Oak Desk + Credenza + Monitors + Chair
    const deskX = cx - 0.6;
    const deskZ = cz;
    const desk = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.75, 2.1), this.mats.execDeskTop);
    desk.position.set(deskX, 0.38, deskZ);
    desk.castShadow = true;
    fg.add(desk);

    const m = this._createMonitor('metrics');
    m.mesh.position.set(deskX + 0.1, 0.76, deskZ);
    m.mesh.rotation.y = -Math.PI / 2;
    fg.add(m.mesh);

    const chair = this._createOfficeChair(true);
    chair.position.set(deskX - 0.85, 0, deskZ);
    chair.rotation.y = Math.PI / 2;
    fg.add(chair);

    this.execDesks[cfg.key] = {
      id: `exec_${cfg.key}`,
      floor: cfg.floor,
      x: deskX - 0.85,
      z: deskZ,
      faceX: deskX + 1.0,
      faceZ: deskZ,
      gate: cfg.gate,
      monitorMeshes: [m],
      chairMesh: chair,
      assignedTo: null
    };
  }

  _buildBreakroom(fg, floor, xCenter, zBack) {
    // Sleek kitchen counter, stainless refrigerator, espresso maker, and water cooler!
    const counter = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.92, 0.75), this.mats.woodAccent);
    counter.position.set(xCenter, 0.46, zBack);
    counter.castShadow = true;
    fg.add(counter);

    const top = new THREE.Mesh(new THREE.BoxGeometry(4.3, 0.06, 0.8), this.mats.deskTop);
    top.position.set(xCenter, 0.94, zBack);
    fg.add(top);

    // Stainless Fridge
    const fridge = new THREE.Mesh(new THREE.BoxGeometry(0.92, 1.95, 0.82), this.mats.chrome);
    fridge.position.set(xCenter + 2.65, 0.98, zBack);
    fridge.castShadow = true;
    fg.add(fridge);

    // Espresso Maker
    const esp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.44, 0.45), this.mats.darkMetal);
    esp.position.set(xCenter - 0.8, 1.18, zBack);
    fg.add(esp);

    this.coffeeSpots.push({
      floor,
      x: xCenter - 0.8,
      z: zBack + 1.05,
      faceX: xCenter - 0.8,
      faceZ: zBack,
      gate: null,
      label: `F${floor} Espresso Station`
    });

    // Water Cooler with blue water jug
    const wcX = xCenter - 2.65;
    const wcBase = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.98, 0.42), this.mats.deskTop);
    wcBase.position.set(wcX, 0.49, zBack);
    fg.add(wcBase);

    const jug = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.16, 0.44, 12),
      new THREE.MeshStandardMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.72, roughness: 0.1 })
    );
    jug.position.set(wcX, 1.2, zBack);
    fg.add(jug);

    this.waterCoolers.push({
      floor,
      x: wcX,
      z: zBack + 1.15,
      partnerX: wcX + 0.95,
      partnerZ: zBack + 1.25,
      gate: null
    });
  }

  _addPhoneBooth(fg, floor, bx, bz) {
    const booth = new THREE.Group();
    booth.position.set(bx, 0, bz);

    const shell = new THREE.Mesh(new THREE.BoxGeometry(1.18, 2.35, 1.18), this.mats.darkMetal);
    shell.position.y = 1.18;
    // Hollow look: back & sides solid acoustic felt, front clear glass door
    fg.add(booth);

    const back = new THREE.Mesh(new THREE.BoxGeometry(1.16, 2.32, 0.08), this.mats.darkMetal);
    back.position.set(0, 1.16, -0.55);
    booth.add(back);

    [-0.55, 0.55].forEach(sx => {
      const side = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.32, 1.16), this.mats.darkMetal);
      side.position.set(sx, 1.16, 0);
      booth.add(side);
    });

    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.1, 1.2), this.mats.woodAccent);
    roof.position.set(0, 2.34, 0);
    booth.add(roof);

    const doorGlass = new THREE.Mesh(new THREE.BoxGeometry(1.04, 2.24, 0.04), this.mats.partitionGlass);
    doorGlass.position.set(0, 1.14, 0.56);
    booth.add(doorGlass);

    const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.05, 0.36), this.mats.woodAccent);
    shelf.position.set(0, 0.95, -0.32);
    booth.add(shelf);

    this.phoneBooths.push({
      id: `booth_f${floor}_${this.phoneBooths.length}`,
      floor,
      x: bx,
      z: bz,
      faceX: bx,
      faceZ: bz - 1.0,
      gate: { x: bx, z: bz + 1.25 },
      occupiedBy: null
    });
  }

  _buildServerRoom(fg, x0, x1, z0, z1) {
    const wallH = BUILDING.floorHeight - BUILDING.slabThickness;
    const cx = (x0 + x1) / 2;
    const rw = x1 - x0;

    // Glass viewing wall facing corridor at z1
    const glass = new THREE.Mesh(new THREE.BoxGeometry(rw, wallH, 0.06), this.mats.partitionGlass);
    glass.position.set(cx, wallH / 2, z1);
    fg.add(glass);

    // 4 High-density Server Racks with blinking LED strips
    for (let i = 0; i < 4; i++) {
      const rx = x0 + 0.85 + i * 1.15;
      const rz = (z0 + z1) / 2 - 0.2;
      const rack = new THREE.Mesh(new THREE.BoxGeometry(0.78, 2.25, 1.05), this.mats.darkMetal);
      rack.position.set(rx, 1.13, rz);
      rack.castShadow = true;
      fg.add(rack);

      for (let row = 0; row < 6; row++) {
        const ledMat = new THREE.MeshStandardMaterial({
          color: row % 3 === 0 ? 0x38bdf8 : 0x10b981,
          emissive: row % 3 === 0 ? 0x38bdf8 : 0x10b981,
          emissiveIntensity: 1.2
        });
        const led = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.04, 0.02), ledMat);
        led.position.set(rx, 0.45 + row * 0.28, rz + 0.535);
        fg.add(led);
        this.serverLeds.push({ mat: ledMat, phase: i * 1.7 + row * 0.9 });
      }
    }
  }

  _addCafeTableWithSeats(fg, floor, tx, tz, gate) {
    const tg = new THREE.Group();
    tg.position.set(tx, 0, tz);

    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.05, 18), this.mats.deskTop);
    top.position.y = 0.74;
    top.castShadow = true;
    tg.add(top);

    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.28, 0.72, 10), this.mats.darkMetal);
    ped.position.y = 0.36;
    tg.add(ped);

    for (let c = 0; c < 3; c++) {
      const ang = (c / 3) * Math.PI * 2 + 0.25;
      const cx = Math.cos(ang) * 0.98;
      const cz = Math.sin(ang) * 0.98;

      const ch = this._createOfficeChair(false);
      ch.position.set(cx, 0, cz);
      ch.rotation.y = -ang - Math.PI / 2;
      tg.add(ch);

      this.lunchSeats.push({
        floor,
        x: tx + cx,
        z: tz + cz,
        faceX: tx,
        faceZ: tz,
        gate,
        occupiedBy: null
      });
    }

    fg.add(tg);
  }

  _addLoungeCluster(fg, floor, cx, cz, sofaMat) {
    const g = new THREE.Group();
    g.position.set(cx, 0, cz);

    // Modern 3-seater sofa facing +X
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.42, 2.3), sofaMat);
    base.position.set(-1.15, 0.24, 0);
    base.castShadow = true;
    g.add(base);

    const back = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.46, 2.3), sofaMat);
    back.position.set(-1.48, 0.62, 0);
    g.add(back);

    // Coffee table
    const cTable = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.38, 1.35), this.mats.woodAccent);
    cTable.position.set(0, 0.19, 0);
    cTable.castShadow = true;
    g.add(cTable);

    // Two accent armchairs facing -X
    [-0.65, 0.65].forEach(az => {
      const chair = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.42, 0.78), sofaMat);
      chair.position.set(1.18, 0.24, az);
      chair.castShadow = true;
      g.add(chair);

      this.loungeSeats.push({
        floor,
        x: cx + 1.18,
        z: cz + az,
        faceX: cx,
        faceZ: cz + az,
        gate: null,
        occupiedBy: null
      });
    });

    this.loungeSeats.push({
      floor,
      x: cx - 1.1,
      z: cz,
      faceX: cx,
      faceZ: cz,
      gate: null,
      occupiedBy: null
    });

    fg.add(g);
  }

  _addIndoorPlant(fg, x, z, scale = 1.0) {
    const pg = new THREE.Group();
    pg.position.set(x, 0, z);

    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.32 * scale, 0.24 * scale, 0.52 * scale, 12), this.mats.plantPot);
    pot.position.y = 0.26 * scale;
    pot.castShadow = true;
    pg.add(pot);

    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.04 * scale, 0.06 * scale, 0.9 * scale, 6), this.mats.woodAccent);
    stem.position.y = 0.75 * scale;
    pg.add(stem);

    [[0, 1.25, 0, 0.46], [-0.24, 1.05, 0.18, 0.34], [0.24, 1.1, -0.16, 0.36]].forEach(([lx, ly, lz, lr]) => {
      const leaf = new THREE.Mesh(new THREE.DodecahedronGeometry(lr * scale, 1), this.mats.plantLeaf);
      leaf.position.set(lx * scale, ly * scale, lz * scale);
      leaf.castShadow = true;
      pg.add(leaf);
    });

    fg.add(pg);
  }

  // ==================== View Cutaway & Frame Updates ====================

  applyViewMode(cutawayMode, isolatedFloor = null) {
    this.cutawayMode = cutawayMode;
    this.isolatedFloor = isolatedFloor;

    // Floor isolation visibility
    for (let f = 0; f < BUILDING.numFloors; f++) {
      this.floorGroups[f].visible = isolatedFloor === null ? true : f <= isolatedFloor;
    }
    this.roofCapGroup.visible = isolatedFloor === null;

    if (cutawayMode === 'cutaway') {
      this.mats.facadeFrontGlass.opacity = 0.04;
      this.mats.facadeGlass.opacity = 0.22;
      this.frontFacadeMeshes.forEach(m => { m.visible = false; });
    } else if (cutawayMode === 'glass') {
      this.mats.facadeFrontGlass.opacity = 0.28;
      this.mats.facadeGlass.opacity = 0.32;
      this.frontFacadeMeshes.forEach(m => { m.visible = true; });
    } else {
      // xray
      this.mats.facadeFrontGlass.opacity = 0.02;
      this.mats.facadeGlass.opacity = 0.06;
      this.frontFacadeMeshes.forEach(m => { m.visible = false; });
    }
  }

  update(dt, nightFactor, elapsedReal, nearEntranceWorker) {
    // 1. Automatic sliding glass entrance doors open smoothly when anyone is near (0, 11)
    const targetOpen = nearEntranceWorker ? 1.0 : 0.0;
    this.slidingDoorOpen += (targetOpen - this.slidingDoorOpen) * Math.min(1, dt * 6.5);
    const slideOffset = 0.6 + this.slidingDoorOpen * 1.08;
    this.leftEntranceDoor.position.x = -slideOffset;
    this.rightEntranceDoor.position.x = slideOffset;

    // 2. Interior architectural lights brighten warmly at evening/night
    const indoorGlow = 0.65 + nightFactor * 0.95;
    this.ceilingLightMats.forEach(m => { m.emissiveIntensity = indoorGlow; });
    this.interiorPointLights.forEach(l => { l.intensity = 0.28 + nightFactor * 1.05; });

    if (this.terraceBulbMat) {
      this.terraceBulbMat.emissiveIntensity = 0.15 + nightFactor * 2.4;
    }

    // 3. Server room blinking rack telemetry LEDs
    this.serverLeds.forEach(sl => {
      const blink = Math.sin(elapsedReal * 7.5 + sl.phase) > -0.2 ? 1.5 : 0.15;
      sl.mat.emissiveIntensity = blink;
    });
  }
}
